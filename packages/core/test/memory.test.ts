import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENV,
  EMPTY_TAPE,
  commit,
  evaluate,
  formatDecimal,
  memoryLine,
  memorySet,
  memoryValue,
  neg,
  parseDecimal,
  PRECISION,
  type Tape,
} from '../src/index.ts';

const env = DEFAULT_ENV;
const run = (...lines: string[]): Tape => lines.reduce((tape, line) => commit(tape, line, env), EMPTY_TAPE);
const shown = (tape: Tape) => formatDecimal(memoryValue(tape.scope), { digits: PRECISION });

describe('memory', () => {
  it('is 0 until set, and not set', () => {
    expect(evaluate('mem + 2').result).toMatchObject({ kind: 'value' });
    expect(shown(run('mem + 2'))).toBe('0');
    expect(memorySet(EMPTY_TAPE.scope)).toBe(false);
  });

  it('adds, subtracts and clears through ordinary tape lines', () => {
    const d = (s: string) => parseDecimal(s)!;
    let tape = run(memoryLine('add', d('15')));
    expect(tape.lines[0]!.input).toBe('mem = mem + 15');
    expect(shown(tape)).toBe('15');
    expect(memorySet(tape.scope)).toBe(true);
    tape = commit(tape, memoryLine('subtract', neg(d('2.5'))), env);
    expect(tape.lines[1]!.input).toBe('mem = mem - (-2.5)');
    expect(shown(tape)).toBe('17.5');
    tape = commit(tape, memoryLine('clear'), env);
    expect(shown(tape)).toBe('0');
    expect(memorySet(tape.scope)).toBe(false);
  });

  it('keeps every digit of the value: 1/3 in memory, times 3, shows 1', () => {
    const third = evaluate('1/3').result;
    if (third.kind !== 'value') throw new Error('1/3 failed');
    const tape = run(memoryLine('add', third.value), 'mem * 3');
    const tripled = tape.lines[1]!.result;
    expect(tripled.kind === 'value' && formatDecimal(tripled.value)).toBe('1');
    expect(tape.lines[0]!.input).toBe(`mem = mem + 0.${'3'.repeat(PRECISION)}`);
    const big = run(memoryLine('add', parseDecimal('1.5e40')!));
    expect(shown(big)).toBe('1.5e+40');
  });

  it('is an ordinary variable otherwise: `mem(` is no function', () => {
    expect(evaluate('mem(2)').result).toMatchObject({ kind: 'error' });
  });
});
