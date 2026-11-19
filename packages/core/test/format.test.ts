import { describe, expect, it } from 'vitest';
import { type Decimal, div, formatDecimal, parseDecimal } from '../src/index.ts';

const d = (text: string): Decimal => parseDecimal(text)!;

describe('formatDecimal', () => {
  it('shows plain notation from 1e-7 to below 1e21, as JavaScript does', () => {
    expect(formatDecimal(d('123456789012345678901'))).toBe('123456789012345678901');
    expect(formatDecimal(d('1e21'))).toBe('1e+21');
    expect(formatDecimal(d('0.0000001'))).toBe('0.0000001');
    expect(formatDecimal(d('0.00000001'))).toBe('1e-8');
    expect(formatDecimal(d('1.5e25'))).toBe('1.5e+25');
    expect(formatDecimal(d('3e-9'))).toBe('3e-9');
  });

  it('shows a result just under the largest exponent that rounds up past it', () => {
    expect(formatDecimal(d('9.999999999999999999999999999999999e999999'))).toBe('1e+1000000');
    expect(formatDecimal(d('9.999999999999999999999999999999999e999999'), { digits: 34 })).toBe(
      '9.999999999999999999999999999999999e+999999',
    );
  });

  it('drops trailing zeros and never shows -0', () => {
    expect(formatDecimal(d('2.50'))).toBe('2.5');
    expect(formatDecimal({ c: 0n, e: 0 })).toBe('0');
    expect(formatDecimal({ c: -25n, e: -1 })).toBe('-2.5');
  });

  it('shows 32 digits, so the 34th digit’s rounding never shows', () => {
    expect(formatDecimal(div(d('1'), d('3')))).toBe('0.33333333333333333333333333333333');
    expect(formatDecimal(div(d('2'), d('3')))).toBe('0.66666666666666666666666666666667');
    expect(formatDecimal(div(d('2'), d('3')), { digits: 34 })).toBe('0.6666666666666666666666666666666667');
  });

  it('groups the integer part only', () => {
    expect(formatDecimal(d('1234567.891'), { group: true })).toBe('1,234,567.891');
    expect(formatDecimal({ c: -1234n, e: 0 }, { group: true })).toBe('-1,234');
    expect(formatDecimal(d('999'), { group: true })).toBe('999');
    expect(formatDecimal(d('0.12345'), { group: true })).toBe('0.12345');
  });
});
