import { describe, expect, it } from 'vitest';
import {
  type Decimal,
  EMPTY_SCOPE,
  type Env,
  evaluate,
  formatDecimal,
  FUNCTION_NAMES,
  FUNCTIONS,
  parseDecimal,
  type Scope,
} from '../src/index.ts';

const fixedRandom = (): Decimal => parseDecimal('0.25')!;
const DEG: Env = { angle: 'deg', random: fixedRandom };
const RAD: Env = { angle: 'rad', random: fixedRandom };

function value(line: string, env: Env = DEG, scope: Scope = EMPTY_SCOPE): string {
  const { result } = evaluate(line, scope, env);
  if (result.kind !== 'value') throw new Error(`${line}: ${JSON.stringify(result)}`);
  return formatDecimal(result.value);
}

function error(line: string, scope: Scope = EMPTY_SCOPE) {
  const { result } = evaluate(line, scope, DEG);
  if (result.kind !== 'error') throw new Error(`${line} gave ${JSON.stringify(result)}`);
  return result;
}

describe('syntax (PRD §4.1)', () => {
  it.each([
    ['2 * (3 + 4)', '14'],
    ['1 + 2 * 3', '7'],
    ['(1 + 2) * 3', '9'],
    ['10 - 4 - 3', '3'],
    ['100 / 10 / 5', '2'],
    ['2^3^2', '512'],
    ['2**3', '8'],
    ['-2^2', '-4'],
    ['(-2)^2', '4'],
    ['2^-1', '0.5'],
    ['--3', '3'],
    ['+5', '5'],
    ['3!', '6'],
    ['3!^2', '36'],
    ['-3!', '-6'],
    ['7 mod 3', '1'],
    ['-7 mod 3', '2'],
    ['2 + 7 mod 4', '5'],
    ['6 × 7', '42'],
    ['8 ÷ 2', '4'],
    ['9 − 2', '7'],
    ['1_000_000 + 1', '1000001'],
    ['.5 + 5.', '5.5'],
    ['1.5E-3 * 2', '0.003'],
    ['2e3', '2000'],
    ['0.1 + 0.2', '0.3'],
    ['1/3*3', '1'],
    ['2 * (3 + 4', '14'],
    ['sqrt(16', '4'],
    ['((2', '2'],
    ['  42  ', '42'],
    ['5 # five', '5'],
  ])('%s = %s', (line, expected) => {
    expect(value(line)).toBe(expected);
  });

  it('multiplies implicitly before a name or `(`', () => {
    expect(value('2pi')).toBe(value('2 * pi'));
    expect(value('2 pi')).toBe(value('2 * pi'));
    expect(value('2(3+4)')).toBe('14');
    expect(value('(1+2)(3+4)')).toBe('21');
    expect(value('3 sqrt(4)')).toBe('6');
    expect(value('2e')).toBe(value('2 * e'));
    expect(value('2pi^2')).toBe(value('2 * pi^2'));
    expect(value('6 / 2(3)')).toBe('9');
    expect(value('x(3)', DEG, { vars: new Map([['x', parseDecimal('2')!]]), ans: parseDecimal('0')! })).toBe(
      '6',
    );
  });

  it('counts the parentheses the end of the line closes', () => {
    expect(evaluate('2 * (3 + sqrt(4').missingParens).toBe(2);
    expect(evaluate('2 * (3)').missingParens).toBe(0);
  });

  it('treats a blank or comment-only line as empty', () => {
    expect(evaluate('').result).toEqual({ kind: 'empty' });
    expect(evaluate('   ').result).toEqual({ kind: 'empty' });
    expect(evaluate('# just a note').result).toEqual({ kind: 'empty' });
  });
});

describe('percent (PRD §4.2)', () => {
  it.each([
    ['50%', '0.5'],
    ['200 + 10%', '220'],
    ['200 - 10%', '180'],
    ['200 * 10%', '20'],
    ['200 / 10%', '2000'],
    ['200 + 2 * 10%', '200.2'],
    ['200 + (10)%', '220'],
    ['10% + 200', '200.1'],
  ])('%s = %s', (line, expected) => {
    expect(value(line)).toBe(expected);
  });
});

describe('constants and functions (PRD §4.3, §4.4)', () => {
  it('knows pi, e, tau and ans', () => {
    expect(value('pi')).toBe('3.1415926535897932384626433832795');
    expect(value('π')).toBe(value('pi'));
    expect(value('tau')).toBe('6.283185307179586476925286766559');
    expect(value('e')).toBe('2.7182818284590452353602874713527');
    expect(value('ans')).toBe('0');
    expect(value('ans * 2', DEG, { vars: new Map(), ans: parseDecimal('21')! })).toBe('42');
  });

  it.each([
    ['abs(-3)', '3'],
    ['sign(-3)', '-1'],
    ['sign(0)', '0'],
    ['round(2.5)', '3'],
    ['round(-2.5)', '-3'],
    ['round(3.14159, 2)', '3.14'],
    ['round(1234, -2)', '1200'],
    ['floor(-2.5)', '-3'],
    ['ceil(-2.5)', '-2'],
    ['trunc(-2.5)', '-2'],
    ['cbrt(-27)', '-3'],
    ['root(32, 5)', '2'],
    ['log(1000)', '3'],
    ['log(8, 2)', '3'],
    ['log2(1024)', '10'],
    ['ln(e)', '1'],
    ['exp(0)', '1'],
    ['fact(5)', '120'],
    ['min(3, 1, 2)', '1'],
    ['max(3, 1, 2)', '3'],
    ['max(-1)', '-1'],
    ['rand()', '0.25'],
    ['sin(30)', '0.5'],
    ['cos(60)', '0.5'],
    ['tan(45)', '1'],
    ['asin(1)', '90'],
    ['atan2(1, 1)', '45'],
  ])('%s = %s', (line, expected) => {
    expect(value(line)).toBe(expected);
  });

  it('uses the angle unit', () => {
    expect(value('sin(pi/6)', RAD)).toBe('0.5');
    expect(value('sin(pi)', RAD)).toBe('0');
    expect(value('acos(-1)', RAD)).toBe(value('pi'));
  });

  it('has an implementation for every reserved function name', () => {
    expect([...FUNCTIONS.keys()].sort()).toEqual([...FUNCTION_NAMES].sort());
  });
});

describe('assignment (PRD §5)', () => {
  it('assigns and returns the value', () => {
    const first = evaluate('x = 2 + 3');
    expect(first.result).toMatchObject({ kind: 'value', assigned: 'x' });
    expect(formatDecimal(first.scope.vars.get('x')!)).toBe('5');
    expect(value('x * 2', DEG, first.scope)).toBe('10');
    expect(value('rate_2 = 0.5')).toBe('0.5');
  });

  it('refuses built-in names', () => {
    expect(error('pi = 3').message).toBe('`pi` is a built-in name and can’t be assigned.');
    expect(error('sin = 3').message).toBe('`sin` is a built-in name and can’t be assigned.');
    expect(error('mod = 3').message).toBe('`mod` is a built-in name and can’t be assigned.');
  });
});

describe('errors (PRD §4.6)', () => {
  it.each([
    ['1/0', 'Can’t divide by zero.', null],
    ['2 * )', 'Unexpected `)` at 5.', 4],
    ['2 3', 'Unexpected `3` at 3.', 2],
    ['(1+2)3', 'Unexpected `3` at 6.', 5],
    ['2 $ 3', 'Unexpected `$` at 3.', 2],
    ['sinn(3)', 'Unknown function `sinn` at 1.', 0],
    ['foo + 1', '`foo` isn’t defined.', 0],
    ['sin 30', 'Expected `(` after `sin` at 5.', 4],
    ['sin(1, 2)', '`sin` takes 1 argument.', 0],
    ['round(1, 2, 3)', '`round` takes 1 or 2 arguments.', 0],
    ['min()', '`min` takes 1 or more arguments.', 0],
    ['rand(1)', '`rand` takes no arguments.', 0],
    ['round(1, 0.5)', 'The places for round must be a whole number from -34 to 34.', null],
    ['round(1, 35)', 'The places for round must be a whole number from -34 to 34.', null],
    ['tan(90)', 'tan is undefined at 90°.', null],
    ['x = 2 * )', 'Unexpected `)` at 9.', 8],
    ['10^1000000', 'Result is too large.', null],
  ])('%s → %s', (line, message, at) => {
    const result = error(line);
    expect(result.message).toBe(message);
    expect(result.at).toBe(at);
    expect(result.incomplete).toBe(false);
  });

  it.each(['2 +', '2 *', '-', '(', 'sin', 'sin(1,', 'x =', '2^'])('`%s` is incomplete, not wrong', (line) => {
    expect(error(line).incomplete).toBe(true);
  });

  it('treats a function with its `(` just typed as unfinished', () => {
    for (const line of ['sin(', 'sqrt(', 'max(', 'rand(', '2 * log('])
      expect(error(line).incomplete).toBe(true);
    expect(error('rand(1').message).toBe('`rand` takes no arguments.');
  });

  it('names the operator a number is missing after', () => {
    expect(error('2 *').message).toBe('Missing a number after `*` at 3.');
  });

  it('leaves the scope unchanged', () => {
    const scope: Scope = { vars: new Map([['x', parseDecimal('1')!]]), ans: parseDecimal('7')! };
    expect(evaluate('1/0', scope).scope).toBe(scope);
    expect(evaluate('', scope).scope).toBe(scope);
  });

  it('never throws, whatever is typed', () => {
    for (const line of [
      '((((',
      '))))',
      '!!',
      '%%',
      '1e',
      'e1',
      '..',
      '1..2',
      '=',
      '==',
      '= 5',
      'x == 5',
      '1,2',
      '#',
    ])
      expect(() => evaluate(line)).not.toThrow();
  });

  it('evaluates a very long chain and refuses deep nesting with an error', () => {
    expect(value(`${'1+'.repeat(200_000)}1`)).toBe('200001');
    expect(value(`${'2*'.repeat(100)}1`)).toBe(value('2^100'));
    expect(value(`${'2*'.repeat(20_000)}1`)).toMatch(/^3\.98027684033796659235430720619\d+e\+6020$/);
    for (const deep of [
      `${'('.repeat(100_000)}1`,
      `${'-'.repeat(100_000)}1`,
      `${'sqrt('.repeat(5_000)}1`,
      `${'2^'.repeat(5_000)}1`,
    ])
      expect(error(deep).message).toMatch(/^The expression is nested too deeply at \d+\.$/);
    expect(value(`${'('.repeat(400)}1${')'.repeat(400)}`)).toBe('1');
  });
});
