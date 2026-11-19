import { describe, expect, it } from 'vitest';
import {
  ALL_KEYS,
  EMPTY_CLASSIC,
  atomic,
  classicKey,
  classicPending,
  classicSegment,
  classicText,
  formatEntry,
  type ClassicState,
  type KeyDef,
} from '../src/index.ts';

const KEYS = new Map<string, Omit<KeyDef, 'second' | 'kind'>>();
for (const k of ALL_KEYS) {
  KEYS.set(k.id, k);
  if (k.second) KEYS.set(k.second.id, k.second);
}

/** Presses keys by id from an empty calculation, as after AC. */
function press(...ids: string[]): ClassicState {
  return ids.reduce((s, id) => classicKey(s, KEYS.get(id)!, '0') ?? s, EMPTY_CLASSIC);
}

/** Presses keys for a string: digits, `.`, `+ - * / ^`, `( )`, or `[id]` for any other key. */
function keys(text: string): ClassicState {
  const named: Record<string, string> = {
    '.': 'point',
    '+': 'add',
    '-': 'subtract',
    '*': 'multiply',
    '/': 'divide',
    '^': 'power',
    '(': 'open',
    ')': 'close',
  };
  const ids = [...text.matchAll(/\[(\w+)\]|(\S)/g)].map(
    ([, id, ch]) => id ?? (/[0-9]/.test(ch!) ? `d${ch}` : named[ch!]!),
  );
  return press(...ids);
}

describe('classic entry (PRD §9.3)', () => {
  it('builds an expression with normal precedence', () => {
    expect(classicText(keys('2 + 3 * 4'))).toBe('2 + 3 * 4');
    expect(classicPending(keys('2 + 3 * 4'))).toBe('2 + 3 ×');
  });

  it('shows the part already worked out after an operator, like macOS', () => {
    expect(classicSegment(keys('2 + 3 *'))).toBe('3');
    expect(classicSegment(keys('2 * 3 +'))).toBe('2 * 3');
    expect(classicSegment(keys('2 + 3 * 4 -'))).toBe('2 + 3 * 4');
    expect(classicSegment(keys('2 + 3 * 4 *'))).toBe('3 * 4');
    // ^ groups from the right, so 2 ^ 3 ^ waits.
    expect(classicSegment(keys('2 ^ 3 ^'))).toBe('3');
  });

  it('replaces an operator pressed twice, and starts from 0 or ans', () => {
    expect(classicText(keys('5 + *'))).toBe('5 * 5');
    expect(classicText(keys('* 3'))).toBe('0 * 3');
    expect(classicText(classicKey(EMPTY_CLASSIC, KEYS.get('multiply')!, 'ans')!)).toBe('ans * ans');
  });

  it('types numbers: one point, no leading zeros, a sign, an exponent', () => {
    expect(keys('0 0 7').entry).toBe('7');
    expect(keys('. 5 .').entry).toBe('0.5');
    expect(keys('1 2 [negate]').entry).toBe('-12');
    expect(classicText(keys('1 2 [negate]'))).toBe('(-12)');
    expect(classicText(keys('3 ^ 1 2 [negate]'))).toBe('3 ^ (-12)');
    expect(keys('1 [ee] - 5').entry).toBe('1e-5');
  });

  it('applies functions to the number shown at once', () => {
    expect(classicText(keys('9 [sqrt]'))).toBe('sqrt(9)');
    expect(classicText(keys('2 + 9 [sqrt]'))).toBe('2 + sqrt(9)');
    expect(classicText(keys('5 [negate] [square]'))).toBe('(-5)^2');
    expect(classicText(keys('9 [reciprocal] ^ 2'))).toBe('(1/(9)) ^ 2');
    expect(classicText(keys('5 [factorial] [percent]'))).toBe('5!%');
    expect(classicText(keys('3 [pow10]'))).toBe('10^3');
    expect(classicText(keys('9 [root] 2'))).toBe('root(9, 2');
    expect(classicText(keys('9 [root] 2 )'))).toBe('root(9, 2)');
    // A digit after a function starts a new number.
    expect(keys('9 [sqrt] 4').entry).toBe('4');
  });

  it('applies a function after an operator to the part worked out', () => {
    expect(classicText(keys('2 * 8 + [sqrt]'))).toBe('2 * 8 + sqrt(2 * 8)');
  });

  it('brackets group, and a bracket after a number multiplies', () => {
    expect(classicText(keys('2 * ( 3 + 4 ) - 1'))).toBe('2 * (3 + 4) - 1');
    expect(classicText(keys('2 ( 3 + 4'))).toBe('2 * (3 + 4');
    expect(classicText(keys('2 * ( 3 + )'))).toBe('2 * (3)');
  });

  it('negates a worked-out value back and forth', () => {
    expect(keys('9 [sqrt] [negate]').entry).toBe('-sqrt(9)');
    expect(keys('9 [sqrt] [negate] [negate]').entry).toBe('sqrt(9)');
  });

  it('keeps operands whole', () => {
    expect(atomic('12.5')).toBe('12.5');
    expect(atomic('sqrt(2) + sqrt(3)')).toBe('(sqrt(2) + sqrt(3))');
    expect(atomic('(1) + (2)')).toBe('((1) + (2))');
    expect(atomic('-3')).toBe('(-3)');
  });

  it('groups the digits being typed and keeps the rest as typed', () => {
    expect(formatEntry('1234567.50', true)).toBe('1,234,567.50');
    expect(formatEntry('-1234', true)).toBe('-1,234');
    expect(formatEntry('1234', false)).toBe('1234');
    expect(formatEntry('1e5', true)).toBe('1e5');
  });
});
