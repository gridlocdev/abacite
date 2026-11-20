import { describe, expect, it } from 'vitest';
import {
  commit,
  type Decimal,
  deleteLine,
  EMPTY_SESSION,
  type Env,
  evaluateSession,
  expandInput,
  formatDecimal,
  type LineResult,
  MAX_SESSION_LINES,
  parseDecimal,
  preview,
  repeatInput,
  type Session,
} from '../src/index.ts';

function sequenceEnv(...values: string[]): Env {
  let i = 0;
  return { angle: 'deg', random: (): Decimal => parseDecimal(values[i++ % values.length]!)! };
}
const env = sequenceEnv('0.5');

const shown = (r: LineResult) =>
  r.kind === 'value' ? formatDecimal(r.value) : r.kind === 'error' ? r.message : '';
const commitAll = (inputs: string[], e: Env = env): Session =>
  inputs.reduce((t, input) => commit(t, input, e), EMPTY_SESSION);
const results = (session: Session) => session.lines.map((l) => shown(l.result));

describe('committing lines (PRD §7.1)', () => {
  it('keeps each input with its result and carries ans', () => {
    const session = commitAll(['5 + 3', 'ans * 2', '1/0', 'ans + 1']);
    expect(session.lines.map((l) => l.input)).toEqual(['5 + 3', 'ans * 2', '1/0', 'ans + 1']);
    expect(results(session)).toEqual(['8', '16', 'Can’t divide by zero.', '17']);
  });

  it('commits nothing for a blank line', () => {
    expect(commit(EMPTY_SESSION, '   ', env)).toBe(EMPTY_SESSION);
  });

  it('puts ans in front of a leading operator once there is a result', () => {
    const session = commitAll(['10', '* 2', '- 5', 'mod 4', '^2', '×3', '÷ 2', '· 2']);
    expect(results(session)).toEqual(['10', '20', '15', '3', '9', '27', '13.5', '27']);
    expect(expandInput('-5', EMPTY_SESSION)).toBe('-5');
    expect(expandInput('-5', session)).toBe('ans -5');
    expect(expandInput('model', session)).toBe('model');
  });

  it('counts error positions from what was typed, not from the ans in front', () => {
    const session = commitAll(['10', '* )', '+ sinn(2)']);
    expect(session.lines[1]!.result).toMatchObject({ message: 'Unexpected `)` at 3.', at: 2 });
    expect(session.lines[2]!.result).toMatchObject({ message: 'Unknown function `sinn` at 3.', at: 2 });
    expect(preview(session, '* )', env).result).toMatchObject({ message: 'Unexpected `)` at 3.', at: 2 });
  });

  it('keeps variables across lines', () => {
    const session = commitAll(['x = 4', 'y = x * 2', 'x + y']);
    expect(results(session)).toEqual(['4', '8', '12']);
  });

  it('drops the oldest line at the limit and keeps the others’ results', () => {
    let session = commitAll(['x = 1']);
    for (let i = 1; i < MAX_SESSION_LINES; i++) session = commit(session, 'ans + 1', env);
    expect(session.lines).toHaveLength(MAX_SESSION_LINES);
    expect(session.dropped).toBe(false);
    session = commit(session, 'x', env);
    expect(session.lines).toHaveLength(MAX_SESSION_LINES);
    expect(session.dropped).toBe(true);
    expect(session.lines[0]!.input).toBe('ans + 1');
    expect(shown(session.lines[0]!.result)).toBe('2');
    expect(shown(session.lines.at(-1)!.result)).toBe('1');
    // Evaluating it again, as deleting a line or reopening the session does, starts from the new top line, where
    // `ans` is 0 and `x` was never assigned (PRD §7.1, §7.2).
    session = deleteLine(session, 1, env);
    expect(shown(session.lines[0]!.result)).toBe('1');
    expect(session.lines.at(-1)!.result.kind).toBe('error');
    expect(session.dropped).toBe(true);
  });
});

describe('repeating the last operation (PRD §7.1)', () => {
  it.each([
    [['5 + 3'], 'ans + 3'],
    [['2 * (3 + 4)'], 'ans * (3 + 4)'],
    [['2 * (3 + 4'], 'ans * (3 + 4)'],
    [['10', '* 2'], 'ans * 2'],
    [['x = 6 / 2'], 'ans / 2'],
    [['200 + 10%'], 'ans + 10%'],
    [['2^10'], 'ans ^10'],
  ])('%j repeats as %s', (inputs, expected) => {
    expect(repeatInput(commitAll(inputs))).toBe(expected);
  });

  it.each([
    [[]],
    [['42']],
    [['(5 + 3)']],
    [['2pi']],
    [['sqrt(9)']],
    [['1/0']],
    [['-5']],
    [['5 + ans']],
    [['3', '* ans']],
  ])('%j has nothing to repeat', (inputs) => {
    expect(repeatInput(commitAll(inputs))).toBeNull();
  });

  it('repeats like the Calculator’s =', () => {
    let session = commitAll(['5 + 3']);
    for (let i = 0; i < 3; i++) session = commit(session, repeatInput(session)!, env);
    expect(results(session)).toEqual(['8', '11', '14', '17']);
  });
});

describe('preview and re-evaluation (PRD §7.2, §9.1)', () => {
  it('previews the next line without committing it', () => {
    const session = commitAll(['7']);
    const evaluation = preview(session, '* 6', env);
    expect(shown(evaluation.result)).toBe('42');
    expect(session.lines).toHaveLength(1);
  });

  it('keeps rand() values when the session is evaluated again', () => {
    const session = commitAll(['rand()', 'rand() + rand()'], sequenceEnv('0.1', '0.2', '0.3'));
    expect(results(session)).toEqual(['0.1', '0.5']);
    const again = evaluateSession(session.lines, sequenceEnv('0.9'));
    expect(results(again)).toEqual(['0.1', '0.5']);
    expect(results(evaluateSession([{ input: 'rand()' }], sequenceEnv('0.9')))).toEqual(['0.9']);
  });

  it('evaluates from the top with leading operators and variables', () => {
    const session = evaluateSession(
      [{ input: '-5' }, { input: '-5' }, { input: 'x = ans' }, { input: 'x * 2' }],
      env,
    );
    expect(results(session)).toEqual(['-5', '-10', '-10', '-20']);
  });

  it('evaluates the lines after a deleted line again', () => {
    const session = commitAll(['x = 4', 'rand()', 'x * 2', '+ 1']);
    const without = deleteLine(session, 0, sequenceEnv('0.9'));
    expect(without.lines.map((l) => l.input)).toEqual(['rand()', 'x * 2', '+ 1']);
    // `+ 1` continues from the last result, so it keeps working.
    expect(results(without)).toEqual(['0.5', '`x` isn’t defined.', '1.5']);
    expect(results(deleteLine(session, 2, env))).toEqual(['4', '0.5', '1.5']);
    expect(deleteLine(session, 9, env)).toBe(session);
  });
});
