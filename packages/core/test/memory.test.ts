import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENV,
  EMPTY_SESSION,
  commit,
  evaluate,
  formatDecimal,
  memoryLine,
  memorySet,
  memoryValue,
  neg,
  parseDecimal,
  PRECISION,
  type Session,
} from '../src/index.ts';

const env = DEFAULT_ENV;
const run = (...lines: string[]): Session =>
  lines.reduce((session, line) => commit(session, line, env), EMPTY_SESSION);
const shown = (session: Session) => formatDecimal(memoryValue(session.scope), { digits: PRECISION });

describe('memory', () => {
  it('is 0 until set, and not set', () => {
    expect(evaluate('mem + 2').result).toMatchObject({ kind: 'value' });
    expect(shown(run('mem + 2'))).toBe('0');
    expect(memorySet(EMPTY_SESSION.scope)).toBe(false);
  });

  it('adds, subtracts and clears through ordinary session lines', () => {
    const d = (s: string) => parseDecimal(s)!;
    let session = run(memoryLine('add', d('15')));
    expect(session.lines[0]!.input).toBe('mem = mem + 15');
    expect(shown(session)).toBe('15');
    expect(memorySet(session.scope)).toBe(true);
    session = commit(session, memoryLine('subtract', neg(d('2.5'))), env);
    expect(session.lines[1]!.input).toBe('mem = mem - (-2.5)');
    expect(shown(session)).toBe('17.5');
    session = commit(session, memoryLine('clear'), env);
    expect(shown(session)).toBe('0');
    expect(memorySet(session.scope)).toBe(false);
  });

  it('keeps every digit of the value: 1/3 in memory, times 3, shows 1', () => {
    const third = evaluate('1/3').result;
    if (third.kind !== 'value') throw new Error('1/3 failed');
    const session = run(memoryLine('add', third.value), 'mem * 3');
    const tripled = session.lines[1]!.result;
    expect(tripled.kind === 'value' && formatDecimal(tripled.value)).toBe('1');
    expect(session.lines[0]!.input).toBe(`mem = mem + 0.${'3'.repeat(PRECISION)}`);
    const big = run(memoryLine('add', parseDecimal('1.5e40')!));
    expect(shown(big)).toBe('1.5e+40');
  });

  it('is an ordinary variable otherwise: `mem(` is no function', () => {
    expect(evaluate('mem(2)').result).toMatchObject({ kind: 'error' });
  });
});
