import { describe, expect, it } from 'vitest';
import {
  add,
  adjusted,
  cmp,
  type Decimal,
  div,
  finish,
  formatDecimal,
  fromInt,
  isInteger,
  mod,
  mul,
  parseDecimal,
  quantize,
  round,
  sub,
} from '../src/index.ts';

const d = (text: string): Decimal => {
  const value = parseDecimal(text.replace(/^-/, ''));
  if (!value) throw new Error(`bad literal ${text}`);
  return text.startsWith('-') ? { c: -value.c, e: value.e } : value;
};
const full = (x: Decimal) => formatDecimal(x, { digits: 34 });

describe('parseDecimal', () => {
  it('reads every literal form and normalizes trailing zeros', () => {
    expect(parseDecimal('12')).toEqual({ c: 12n, e: 0 });
    expect(parseDecimal('1.50')).toEqual({ c: 15n, e: -1 });
    expect(parseDecimal('.5')).toEqual({ c: 5n, e: -1 });
    expect(parseDecimal('5.')).toEqual({ c: 5n, e: 0 });
    expect(parseDecimal('1e10')).toEqual({ c: 1n, e: 10 });
    expect(parseDecimal('1.5E-3')).toEqual({ c: 15n, e: -4 });
    expect(parseDecimal('1200')).toEqual({ c: 12n, e: 2 });
    expect(parseDecimal('0.000')).toEqual({ c: 0n, e: 0 });
  });

  it('rejects what is not a number', () => {
    for (const text of ['', '.', 'e5', '1e', '1.2.3', 'abc', '-1']) expect(parseDecimal(text)).toBeNull();
  });

  it('rounds long literals to 34 digits and limits the exponent', () => {
    expect(full(parseDecimal('1.23456789012345678901234567890123456789')!)).toBe(
      '1.234567890123456789012345678901235',
    );
    expect(() => parseDecimal('1e1000000')).toThrow('Result is too large.');
    expect(parseDecimal('1e-1000000')).toEqual({ c: 0n, e: 0 });
    expect(parseDecimal('0e99999999999999999999')).toEqual({ c: 0n, e: 0 });
    expect(parseDecimal('0.000e1000000')).toEqual({ c: 0n, e: 0 });
  });
});

describe('arithmetic', () => {
  it('is exact where binary floating point is not', () => {
    expect(full(add(d('0.1'), d('0.2')))).toBe('0.3');
    expect(full(sub(d('1'), d('0.9')))).toBe('0.1');
    expect(full(mul(d('1.1'), d('1.1')))).toBe('1.21');
    expect(full(div(d('1'), d('8')))).toBe('0.125');
  });

  it('rounds half to even at 34 digits', () => {
    const big = d('1234567890123456789012345678901234');
    expect(full(add(big, d('0.5')))).toBe('1.234567890123456789012345678901234e+33');
    expect(full(add(big, d('1.5')))).toBe('1.234567890123456789012345678901236e+33');
    expect(full(add(big, d('0.5000001')))).toBe('1.234567890123456789012345678901235e+33');
    expect(full(div(d('2'), d('3')))).toBe('0.6666666666666666666666666666666667');
    expect(full(div(d('-2'), d('3')))).toBe('-0.6666666666666666666666666666666667');
  });

  it('adds a far smaller number without losing the rounding direction', () => {
    expect(full(add(d('1'), d('1e-100')))).toBe('1');
    expect(full(sub(d('1'), d('1e-100')))).toBe('1');
    expect(full(sub(d('1.000000000000000000000000000000001'), d('1e-100')))).toBe(
      '1.000000000000000000000000000000001',
    );
    expect(formatDecimal(sub(d('1'), d('1e-100'), 120), { digits: 34 })).toBe('1');
    expect(sub(d('1'), d('1e-100'), 120).c.toString()).toBe('9'.repeat(100));
    expect(full(add(d('1e-100'), d('1')))).toBe('1');
  });

  it('cancels to exactly zero', () => {
    expect(add(d('5'), d('-5'))).toEqual({ c: 0n, e: 0 });
    expect(formatDecimal(mul(d('-0'), d('5')))).toBe('0');
  });

  it('divides by zero as an error', () => {
    expect(() => div(d('1'), d('0'))).toThrow('Can’t divide by zero.');
    expect(() => mod(d('1'), d('0'))).toThrow('Can’t divide by zero.');
  });

  it('overflows to an error and underflows to zero', () => {
    expect(() => mul(d('1e600000'), d('1e600000'))).toThrow('Result is too large.');
    expect(mul(d('1e-600000'), d('1e-600000'))).toEqual({ c: 0n, e: 0 });
  });

  it('compares exactly', () => {
    expect(cmp(d('0.1'), d('0.10'))).toBe(0);
    expect(cmp(d('-2'), d('1'))).toBe(-1);
    expect(cmp(d('1e5'), d('99999'))).toBe(1);
    expect(cmp(d('-1e5'), d('-99999'))).toBe(-1);
    expect(cmp(d('0'), d('-0.0001'))).toBe(1);
  });
});

describe('mod', () => {
  it('takes the sign of the divisor', () => {
    expect(full(mod(d('7'), d('3')))).toBe('1');
    expect(full(mod(d('-7'), d('3')))).toBe('2');
    expect(full(mod(d('7'), d('-3')))).toBe('-2');
    expect(full(mod(d('-7'), d('-3')))).toBe('-1');
    expect(full(mod(d('5.5'), d('2')))).toBe('1.5');
    expect(full(mod(d('6'), d('3')))).toBe('0');
  });

  it('stays exact for huge dividends', () => {
    expect(full(mod(d('1e100'), d('7')))).toBe(String(10n ** 100n % 7n));
    expect(full(mod(d('1e30'), d('360')))).toBe('280');
  });
});

describe('quantize', () => {
  it('rounds to places by mode', () => {
    expect(full(quantize(d('2.5'), 0, 'halfAway'))).toBe('3');
    expect(full(quantize(d('-2.5'), 0, 'halfAway'))).toBe('-3');
    expect(full(quantize(d('2.45'), 1, 'halfAway'))).toBe('2.5');
    expect(full(quantize(d('-2.7'), 0, 'floor'))).toBe('-3');
    expect(full(quantize(d('-2.7'), 0, 'ceil'))).toBe('-2');
    expect(full(quantize(d('-2.7'), 0, 'trunc'))).toBe('-2');
    expect(full(quantize(d('1234'), -2, 'halfAway'))).toBe('1200');
    expect(full(quantize(d('0.001'), 0, 'ceil'))).toBe('1');
    expect(full(quantize(d('-0.001'), 0, 'floor'))).toBe('-1');
    expect(full(quantize(d('0.001'), 0, 'halfAway'))).toBe('0');
    expect(full(quantize(d('7'), 2, 'floor'))).toBe('7');
  });
});

describe('helpers', () => {
  it('knows integers and exponents', () => {
    expect(isInteger(d('1200'))).toBe(true);
    expect(isInteger(d('1.5'))).toBe(false);
    expect(adjusted(d('1234'))).toBe(3);
    expect(adjusted(d('0.05'))).toBe(-2);
    expect(fromInt(-3000)).toEqual({ c: -3n, e: 3 });
    expect(round(d('1.25'), 2)).toEqual({ c: 12n, e: -1 });
    expect(finish(15n, -1, 1)).toEqual({ c: 2n, e: 0 });
  });
});
