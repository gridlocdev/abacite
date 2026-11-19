import { describe, expect, it } from 'vitest';
import {
  abs,
  cmp,
  type Decimal,
  DEFAULT_ENV,
  evaluate,
  formatDecimal,
  FUNCTIONS,
  parseDecimal,
  sub,
} from '../src/index.ts';
import * as f from '../src/index.ts';
import { REFERENCE } from './reference.ts';

const d = (text: string): Decimal => {
  const value = parseDecimal(text.replace(/^-/, ''));
  if (!value) throw new Error(`bad literal ${text}`);
  return text.startsWith('-') ? { c: -value.c, e: value.e } : value;
};

function compute(fn: string, args: readonly Decimal[], angle: 'deg' | 'rad'): Decimal {
  if (fn === 'pow') return f.pow(args[0]!, args[1]!);
  if (fn === 'pi' || fn === 'e' || fn === 'tau') {
    const result = evaluate(fn).result;
    if (result.kind !== 'value') throw new Error(fn);
    return result.value;
  }
  return FUNCTIONS.get(fn)!.call(args, { ...DEFAULT_ENV, angle });
}

/** One unit in the 34th significant digit of `x`. */
const ulp = (x: Decimal): Decimal => ({ c: 1n, e: x.e + x.c.toString().replace('-', '').length - 34 });

describe('functions match high-precision reference values', () => {
  it.each(REFERENCE.map((c) => [`${c.fn}(${c.args.join(', ')})${c.angle ? ` ${c.angle}` : ''}`, c] as const))(
    '%s',
    (_, c) => {
      const expected = d(c.expected.replace('E', 'e'));
      const actual = compute(c.fn, c.args.map(d), c.angle ?? 'rad');
      const error = abs(sub(actual, expected, 60));
      expect(
        cmp(error, ulp(expected)) <= 0,
        `${formatDecimal(actual, { digits: 34 })} vs ${c.expected}`,
      ).toBe(true);
    },
  );
});

const show = (x: Decimal) => formatDecimal(x, { digits: 34 });

describe('exact cases', () => {
  it('gives exact trigonometry at multiples of 90° and 45°', () => {
    expect(show(f.sin(d('180'), 'deg'))).toBe('0');
    expect(show(f.cos(d('90'), 'deg'))).toBe('0');
    expect(show(f.sin(d('-90'), 'deg'))).toBe('-1');
    expect(show(f.cos(d('720'), 'deg'))).toBe('1');
    expect(formatDecimal(f.tan(d('45'), 'deg'))).toBe('1');
    expect(formatDecimal(f.sin(d('30'), 'deg'))).toBe('0.5');
    expect(() => f.tan(d('90'), 'deg')).toThrow('tan is undefined at 90°.');
    expect(() => f.tan(d('-90'), 'deg')).toThrow('tan is undefined at 270°.');
  });

  it('shows tiny radian results as 0', () => {
    expect(show(f.sin(f.pi(), 'rad'))).toBe('0');
    expect(show(f.cos(sub(f.pi(), f.pi()), 'rad'))).toBe('1');
  });

  it('refuses angles too large to reduce', () => {
    expect(() => f.sin(d('1e1001'), 'rad')).toThrow('Angle is too large.');
    expect(show(f.sin(d('1e1001'), 'deg'))).toBe('-0.984807753012208059366743024589523');
  });

  it('keeps exact roots, powers and logarithms exact', () => {
    expect(show(f.sqrt(d('16')))).toBe('4');
    expect(show(f.root(d('27'), d('3')))).toBe('3');
    expect(show(f.root(d('-8'), d('3')))).toBe('-2');
    expect(show(f.root(d('1024'), d('10')))).toBe('2');
    expect(show(f.pow(d('2'), d('10')))).toBe('1024');
    expect(show(f.pow(d('2'), d('-2')))).toBe('0.25');
    expect(show(f.pow(d('-2'), d('3')))).toBe('-8');
    expect(show(f.pow(d('0'), d('0')))).toBe('1');
    expect(show(f.pow(d('-1'), d('1e40')))).toBe('1');
    expect(show(f.pow(d('10'), d('-2000000')))).toBe('0');
    expect(show(f.log10(d('1000')))).toBe('3');
    expect(show(f.log10(d('1e-50')))).toBe('-50');
    expect(show(f.logBase(d('8'), d('2')))).toBe('3');
    expect(show(f.ln(d('1')))).toBe('0');
    expect(show(f.exp(d('0')))).toBe('1');
    expect(show(f.factorial(d('20')))).toBe('2432902008176640000');
    expect(show(f.factorial(d('0')))).toBe('1');
  });

  it('computes 10000! and rounds it to 34 digits', () => {
    expect(show(f.factorial(d('10000')))).toBe('2.846259680917054518906413212119869e+35659');
  });

  it('handles the edges of the inverse functions', () => {
    expect(formatDecimal(f.asin(d('1'), 'deg'))).toBe('90');
    expect(formatDecimal(f.acos(d('-1'), 'deg'))).toBe('180');
    expect(formatDecimal(f.acos(d('1'), 'deg'))).toBe('0');
    expect(formatDecimal(f.atan2(d('0'), d('0'), 'deg'))).toBe('0');
    expect(formatDecimal(f.atan2(d('1'), d('-1'), 'deg'))).toBe('135');
    expect(formatDecimal(f.atan2(d('-1'), d('-1'), 'deg'))).toBe('-135');
    expect(formatDecimal(f.atan2(d('-1'), d('0'), 'deg'))).toBe('-90');
    expect(formatDecimal(f.tanh(d('100')))).toBe('1');
    expect(formatDecimal(f.sinh(d('1e-50')))).toBe('1e-50');
  });
});

describe('domain errors', () => {
  it.each([
    [() => f.sqrt(d('-1')), 'Can’t take the square root of a negative number.'],
    [() => f.root(d('-16'), d('4')), 'Can’t take an even root of a negative number.'],
    [() => f.root(d('-16'), d('2.5')), 'Can’t take an even root of a negative number.'],
    [() => f.ln(d('0')), 'The logarithm needs a number above 0.'],
    [() => f.log10(d('-5')), 'The logarithm needs a number above 0.'],
    [() => f.logBase(d('5'), d('1')), 'The base of a logarithm can’t be 1.'],
    [() => f.asin(d('1.1'), 'deg'), 'asin needs a number from -1 to 1.'],
    [() => f.acos(d('-2'), 'rad'), 'acos needs a number from -1 to 1.'],
    [() => f.acosh(d('0.5')), 'acosh needs a number of 1 or more.'],
    [() => f.atanh(d('1')), 'atanh needs a number between -1 and 1.'],
    [() => f.factorial(d('-1')), 'Factorial needs a whole number from 0 to 10000.'],
    [() => f.factorial(d('2.5')), 'Factorial needs a whole number from 0 to 10000.'],
    [() => f.factorial(d('10001')), 'Factorial needs a whole number from 0 to 10000.'],
    [() => f.pow(d('-8'), d('0.5')), 'A negative number has no real power of 0.5.'],
    [() => f.pow(d('0'), d('-1')), 'Can’t divide by zero.'],
    [() => f.exp(d('3000000')), 'Result is too large.'],
    [() => f.pow(d('10'), d('1e7')), 'Result is too large.'],
  ])('%#: %s', (call, message) => {
    expect(call).toThrow(message);
  });

  it('underflows exp to 0', () => {
    expect(show(f.exp(d('-3000000')))).toBe('0');
  });
});
