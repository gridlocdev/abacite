import { describe, expect, it } from 'vitest';
import {
  backspace,
  cleanPaste,
  insertCall,
  insertText,
  lineAt,
  negate,
  wrap,
  type LineState,
} from '../src/index.ts';

const sel = (text: string, start: number, end: number): LineState => ({ text, start, end });

describe('insertText', () => {
  it('types at the cursor and replaces a selection', () => {
    expect(insertText(lineAt('12', 1), '5')).toEqual(lineAt('152', 2));
    expect(insertText(sel('1234', 1, 3), '+')).toEqual(lineAt('1+4', 2));
  });
});

describe('insertCall', () => {
  it('opens a call at the cursor, or wraps the selection', () => {
    expect(insertCall(lineAt('2*'), 'sin')).toEqual(lineAt('2*sin('));
    expect(insertCall(sel('2*30', 2, 4), 'sin')).toEqual(lineAt('2*sin(30)'));
  });
});

describe('wrap', () => {
  it('wraps the selection, else the whole line', () => {
    expect(wrap(sel('2+3', 2, 3), '1/(', ')')).toEqual(lineAt('2+1/(3)'));
    expect(wrap(lineAt('2+3', 1), '1/(', ')')).toEqual(lineAt('1/(2+3)'));
    expect(wrap(lineAt(''), '1/(', ')')).toEqual(lineAt('1/('));
  });
});

describe('backspace', () => {
  it('deletes one character, a whole function name, or the selection', () => {
    expect(backspace(lineAt('123'))).toEqual(lineAt('12'));
    expect(backspace(lineAt('2*sqrt('))).toEqual(lineAt('2*'));
    expect(backspace(sel('12345', 1, 3))).toEqual(lineAt('145', 1));
    expect(backspace(lineAt('12', 0))).toEqual(lineAt('12', 0));
    expect(backspace(lineAt('1+2', 2))).toEqual(lineAt('12', 1));
  });
});

describe('negate', () => {
  it('flips the sign of the number at the cursor', () => {
    expect(negate(lineAt('5'))).toEqual(lineAt('-5'));
    expect(negate(lineAt('-5'))).toEqual(lineAt('5'));
    expect(negate(lineAt('3*4'))).toEqual(lineAt('3*-4'));
    expect(negate(lineAt('3*-4'))).toEqual(lineAt('3*4'));
    expect(negate(lineAt('12+34', 1))).toEqual(lineAt('-12+34', 2));
  });

  it('flips a whole number with its exponent, and leaves digits in names alone', () => {
    expect(negate(lineAt('2e5'))).toEqual(lineAt('-2e5', 4));
    expect(negate(lineAt('-1e-5'))).toEqual(lineAt('1e-5', 4));
    expect(negate(lineAt('1+1.5E3'))).toEqual(lineAt('1+-1.5E3', 8));
    expect(negate(lineAt('r2'))).toEqual(lineAt('-(r2)'));
    expect(negate(lineAt('x1+3', 2))).toEqual(lineAt('-(x1+3)'));
  });

  it('leaves subtraction alone: 3-4 becomes 3--4', () => {
    expect(negate(lineAt('3-4'))).toEqual(lineAt('3--4'));
  });

  it('wraps the line outside a number, and unwraps it again', () => {
    expect(negate(lineAt('sin(30)'))).toEqual(lineAt('-(sin(30))'));
    expect(negate(lineAt('-(sin(30))'))).toEqual(lineAt('sin(30)'));
    expect(negate(lineAt('-(1)+(2)'))).toEqual(lineAt('-(-(1)+(2))'));
  });

  it('starts a negative number on an empty line', () => {
    expect(negate(lineAt(''))).toEqual(lineAt('-'));
  });
});

describe('cleanPaste', () => {
  it('drops grouping in numbers and keeps the rest', () => {
    expect(cleanPaste('1,234,567.89 × 2')).toBe('1234567.89 × 2');
    expect(cleanPaste('1 234 567')).toBe('1234567');
    expect(cleanPaste('max(1,2)')).toBe('max(1,2)');
    expect(cleanPaste('max(1,234)')).toBe('max(1,234)');
    expect(cleanPaste('atan2(1,100)')).toBe('atan2(1,100)');
    expect(cleanPaste('max(1 234 567, 2)')).toBe('max(1234567, 2)');
    expect(cleanPaste('1,234 + 12,345,678')).toBe('1234 + 12345678');
    expect(cleanPaste('1,2345')).toBe('1,2345');
    expect(cleanPaste('2\n+3\n')).toBe('2 +3');
  });
});
