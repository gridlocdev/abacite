import { describe, expect, it } from 'vitest';
import {
  commit,
  type Decimal,
  EMPTY_TAPE,
  type Env,
  evaluateTape,
  expandInput,
  formatDecimal,
  type LineResult,
  MAX_TAPE_LINES,
  parseDecimal,
  preview,
  repeatInput,
  type Tape,
} from '../src/index.ts';

function sequenceEnv(...values: string[]): Env {
  let i = 0;
  return { angle: 'deg', random: (): Decimal => parseDecimal(values[i++ % values.length]!)! };
}
const env = sequenceEnv('0.5');

const shown = (r: LineResult) =>
  r.kind === 'value' ? formatDecimal(r.value) : r.kind === 'error' ? r.message : '';
const commitAll = (inputs: string[], e: Env = env): Tape =>
  inputs.reduce((t, input) => commit(t, input, e), EMPTY_TAPE);
const results = (tape: Tape) => tape.lines.map((l) => shown(l.result));

describe('committing lines (PRD §7.1)', () => {
  it('keeps each input with its result and carries ans', () => {
    const tape = commitAll(['5 + 3', 'ans * 2', '1/0', 'ans + 1']);
    expect(tape.lines.map((l) => l.input)).toEqual(['5 + 3', 'ans * 2', '1/0', 'ans + 1']);
    expect(results(tape)).toEqual(['8', '16', 'Can’t divide by zero.', '17']);
  });

  it('commits nothing for a blank line', () => {
    expect(commit(EMPTY_TAPE, '   ', env)).toBe(EMPTY_TAPE);
  });

  it('puts ans in front of a leading operator once there is a result', () => {
    const tape = commitAll(['10', '* 2', '- 5', 'mod 4', '^2', '×3', '÷ 2', '· 2']);
    expect(results(tape)).toEqual(['10', '20', '15', '3', '9', '27', '13.5', '27']);
    expect(expandInput('-5', EMPTY_TAPE)).toBe('-5');
    expect(expandInput('-5', tape)).toBe('ans -5');
    expect(expandInput('model', tape)).toBe('model');
  });

  it('counts error positions from what was typed, not from the ans in front', () => {
    const tape = commitAll(['10', '* )', '+ sinn(2)']);
    expect(tape.lines[1]!.result).toMatchObject({ message: 'Unexpected `)` at 3.', at: 2 });
    expect(tape.lines[2]!.result).toMatchObject({ message: 'Unknown function `sinn` at 3.', at: 2 });
    expect(preview(tape, '* )', env).result).toMatchObject({ message: 'Unexpected `)` at 3.', at: 2 });
  });

  it('keeps variables across lines', () => {
    const tape = commitAll(['x = 4', 'y = x * 2', 'x + y']);
    expect(results(tape)).toEqual(['4', '8', '12']);
  });

  it('drops the oldest line at the limit and keeps the others’ results', () => {
    let tape = commitAll(['x = 1']);
    for (let i = 1; i < MAX_TAPE_LINES; i++) tape = commit(tape, 'ans + 1', env);
    expect(tape.lines).toHaveLength(MAX_TAPE_LINES);
    expect(tape.dropped).toBe(false);
    tape = commit(tape, 'x', env);
    expect(tape.lines).toHaveLength(MAX_TAPE_LINES);
    expect(tape.dropped).toBe(true);
    expect(tape.lines[0]!.input).toBe('ans + 1');
    expect(shown(tape.lines[0]!.result)).toBe('2');
    expect(shown(tape.lines.at(-1)!.result)).toBe('1');
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
    let tape = commitAll(['5 + 3']);
    for (let i = 0; i < 3; i++) tape = commit(tape, repeatInput(tape)!, env);
    expect(results(tape)).toEqual(['8', '11', '14', '17']);
  });
});

describe('preview and re-evaluation (PRD §7.2, §9.1)', () => {
  it('previews the next line without committing it', () => {
    const tape = commitAll(['7']);
    const evaluation = preview(tape, '* 6', env);
    expect(shown(evaluation.result)).toBe('42');
    expect(tape.lines).toHaveLength(1);
  });

  it('keeps rand() values when the tape is evaluated again', () => {
    const tape = commitAll(['rand()', 'rand() + rand()'], sequenceEnv('0.1', '0.2', '0.3'));
    expect(results(tape)).toEqual(['0.1', '0.5']);
    const again = evaluateTape(tape.lines, sequenceEnv('0.9'));
    expect(results(again)).toEqual(['0.1', '0.5']);
    expect(results(evaluateTape([{ input: 'rand()' }], sequenceEnv('0.9')))).toEqual(['0.9']);
  });

  it('evaluates from the top with leading operators and variables', () => {
    const tape = evaluateTape(
      [{ input: '-5' }, { input: '-5' }, { input: 'x = ans' }, { input: 'x * 2' }],
      env,
    );
    expect(results(tape)).toEqual(['-5', '-10', '-10', '-20']);
  });
});
