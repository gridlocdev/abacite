/** Evaluating a parsed line against a scope (PRD §4, §5). Errors come back as values, never thrown. */
import {
  ONE,
  PRECISION,
  ZERO,
  abs,
  add,
  cmp,
  div,
  finish,
  fromInt,
  mod,
  mul,
  neg,
  quantize,
  round,
  sign,
  sub,
  toSmallInt,
  type Decimal,
} from './decimal.ts';
import { CalcError } from './errors.ts';
import * as f from './functions.ts';
import { MEMORY } from './memory.ts';
import { isReserved } from './names.ts';
import { parseStatement, type Node } from './parse.ts';

export type AngleUnit = f.AngleUnit;

/** What a tape knows before a line: its variables and the previous result (PRD §4.3, §7.2). */
export interface Scope {
  readonly vars: ReadonlyMap<string, Decimal>;
  readonly ans: Decimal;
}

export const EMPTY_SCOPE: Scope = { vars: new Map(), ans: ZERO };

export interface Env {
  readonly angle: AngleUnit;
  /** A uniform random number in [0, 1); injected so tests and tapes can replay it (PRD §7.2). */
  readonly random: () => Decimal;
}

export type LineResult =
  | { readonly kind: 'empty' }
  | { readonly kind: 'value'; readonly value: Decimal; readonly assigned: string | null }
  | {
      readonly kind: 'error';
      readonly message: string;
      /** Character position from 0, or null when the error is about the whole line. */
      readonly at: number | null;
      /** The line ended too early (`2 +`): the UI shows it as unfinished, not wrong (PRD §9.1). */
      readonly incomplete: boolean;
    };

export interface Evaluation {
  readonly result: LineResult;
  /** The scope after the line; an error or empty line leaves it as it was. */
  readonly scope: Scope;
  /** Parentheses the end of the line closed (PRD §4.1). */
  readonly missingParens: number;
}

/** 34 random digits from Math.random, a few at a time. Only for `rand()`, never for arithmetic. */
export function defaultRandom(): Decimal {
  let digits = '';
  while (digits.length < PRECISION)
    digits += Math.floor(Math.random() * 1e8)
      .toString()
      .padStart(8, '0');
  return finish(BigInt(digits.slice(0, PRECISION)), -PRECISION);
}

export const DEFAULT_ENV: Env = { angle: 'deg', random: defaultRandom };

const HUNDRED = fromInt(100);
/** A precision no product of two results reaches: arithmetic at it is exact. */
const EXACT = Number.MAX_SAFE_INTEGER;

type Fn = {
  readonly min: number;
  readonly max: number;
  readonly call: (args: readonly Decimal[], env: Env) => Decimal;
};

const one = (call: (x: Decimal, env: Env) => Decimal): Fn => ({
  min: 1,
  max: 1,
  call: (a, env) => call(a[0]!, env),
});

function placesArg(d: Decimal | undefined): number {
  if (d === undefined) return 0;
  const n = toSmallInt(d, PRECISION);
  if (n === null) throw new CalcError('The places for round must be a whole number from -34 to 34.');
  return n;
}

/** Rounds to whole numbers by `mode`; the result is exact, then rounded to 34 digits. */
const whole = (mode: 'trunc' | 'floor' | 'ceil') => one((x) => round(quantize(x, 0, mode)));

export const FUNCTIONS: ReadonlyMap<string, Fn> = new Map<string, Fn>([
  ['sqrt', one((x) => f.sqrt(x))],
  ['cbrt', one((x) => f.root(x, fromInt(3)))],
  ['root', { min: 2, max: 2, call: ([x, n]) => f.root(x!, n!) }],
  ['abs', one((x) => abs(x))],
  ['sign', one((x) => fromInt(sign(x)))],
  ['round', { min: 1, max: 2, call: ([x, d]) => round(quantize(x!, placesArg(d), 'halfAway')) }],
  ['floor', whole('floor')],
  ['ceil', whole('ceil')],
  ['trunc', whole('trunc')],
  ['exp', one((x) => f.exp(x))],
  ['ln', one((x) => f.ln(x))],
  ['log', { min: 1, max: 2, call: ([x, b]) => (b === undefined ? f.log10(x!) : f.logBase(x!, b)) }],
  ['log2', one((x) => f.logBase(x, fromInt(2)))],
  ['sin', one((x, env) => f.sin(x, env.angle))],
  ['cos', one((x, env) => f.cos(x, env.angle))],
  ['tan', one((x, env) => f.tan(x, env.angle))],
  ['asin', one((x, env) => f.asin(x, env.angle))],
  ['acos', one((x, env) => f.acos(x, env.angle))],
  ['atan', one((x, env) => f.atan(x, env.angle))],
  ['atan2', { min: 2, max: 2, call: ([y, x], env) => f.atan2(y!, x!, env.angle) }],
  ['sinh', one((x) => f.sinh(x))],
  ['cosh', one((x) => f.cosh(x))],
  ['tanh', one((x) => f.tanh(x))],
  ['asinh', one((x) => f.asinh(x))],
  ['acosh', one((x) => f.acosh(x))],
  ['atanh', one((x) => f.atanh(x))],
  ['fact', one((x) => f.factorial(x))],
  ['min', { min: 1, max: Infinity, call: (args) => args.reduce((a, b) => (cmp(b, a) < 0 ? b : a)) }],
  ['max', { min: 1, max: Infinity, call: (args) => args.reduce((a, b) => (cmp(b, a) > 0 ? b : a)) }],
  ['rand', { min: 0, max: 0, call: (_, env) => round(env.random()) }],
]);

function arityMessage(name: string, fn: Fn): string {
  if (fn.max === 0) return `\`${name}\` takes no arguments.`;
  if (fn.max === Infinity) return `\`${name}\` takes ${fn.min} or more arguments.`;
  if (fn.min === fn.max) return `\`${name}\` takes ${fn.min} argument${fn.min === 1 ? '' : 's'}.`;
  return `\`${name}\` takes ${fn.min} or ${fn.max} arguments.`;
}

let eValue: Decimal | undefined;

function constant(name: string, scope: Scope): Decimal | null {
  switch (name) {
    case 'pi':
    case 'π':
      return f.pi();
    case 'tau':
      return mul(f.pi(PRECISION + 2), fromInt(2));
    case 'e':
      return (eValue ??= f.exp(ONE));
    case 'ans':
      return scope.ans;
    default:
      return null;
  }
}

function evalNode(node: Node, scope: Scope, env: Env): Decimal {
  switch (node.kind) {
    case 'number':
      return node.value;
    case 'name': {
      const value =
        constant(node.name, scope) ??
        scope.vars.get(node.name) ??
        // Memory is 0 until set (PRD §5).
        (node.name === MEMORY && !node.called ? ZERO : undefined);
      if (value !== undefined) return value;
      if (node.called) throw new CalcError(`Unknown function \`${node.name}\` at ${node.at + 1}.`, node.at);
      throw new CalcError(`\`${node.name}\` isn’t defined.`, node.at);
    }
    case 'call': {
      const fn = FUNCTIONS.get(node.name)!;
      if (node.args.length < fn.min || node.args.length > fn.max)
        throw new CalcError(arityMessage(node.name, fn), node.at);
      return fn.call(
        node.args.map((a) => evalNode(a, scope, env)),
        env,
      );
    }
    case 'negate':
      return neg(evalNode(node.arg, scope, env));
    case 'factorial':
      return f.factorial(evalNode(node.arg, scope, env));
    case 'percent':
      return div(evalNode(node.arg, scope, env), HUNDRED);
    case 'binary': {
      // A chain like `1+2+3+…` leans left; walking down its left side in a loop keeps a long chain off the stack.
      const chain: BinaryNode[] = [];
      let first: Node = node;
      while (first.kind === 'binary') {
        chain.push(first);
        first = first.left;
      }
      let value = evalNode(first, scope, env);
      for (let i = chain.length - 1; i >= 0; i--) value = applyBinary(chain[i]!, value, scope, env);
      return value;
    }
  }
}

type BinaryNode = Extract<Node, { kind: 'binary' }>;

/** `node`'s operator applied to its already evaluated left side. */
function applyBinary(node: BinaryNode, left: Decimal, scope: Scope, env: Env): Decimal {
  if ((node.op === '+' || node.op === '-') && node.right.kind === 'percent') {
    // `200 + 10%` is 200 + 10% of 200 (PRD §4.2).
    // The share is exact (a product, then two places down), so the sum rounds once.
    const product = mul(left, evalNode(node.right.arg, scope, env), EXACT);
    const share = finish(product.c, product.e - 2, EXACT);
    return node.op === '+' ? add(left, share) : sub(left, share);
  }
  const right = evalNode(node.right, scope, env);
  switch (node.op) {
    case '+':
      return add(left, right);
    case '-':
      return sub(left, right);
    case '*':
      return mul(left, right);
    case '/':
      return div(left, right);
    case 'mod':
      return mod(left, right);
    case '^':
      return f.pow(left, right);
  }
}

/** Evaluates one tape line (PRD §4, §5). */
export function evaluate(line: string, scope: Scope = EMPTY_SCOPE, env: Env = DEFAULT_ENV): Evaluation {
  let missingParens = 0;
  try {
    const statement = parseStatement(line);
    if (!statement) return { result: { kind: 'empty' }, scope, missingParens };
    missingParens = statement.missingParens;
    if (statement.assign !== null && isReserved(statement.assign))
      throw new CalcError(`\`${statement.assign}\` is a built-in name and can’t be assigned.`, 0);
    const value = round(evalNode(statement.expr, scope, env));
    const vars = statement.assign === null ? scope.vars : new Map(scope.vars).set(statement.assign, value);
    return {
      result: { kind: 'value', value, assigned: statement.assign },
      scope: { vars, ans: value },
      missingParens,
    };
  } catch (error) {
    if (!(error instanceof CalcError)) throw error;
    return {
      result: { kind: 'error', message: error.message, at: error.at, incomplete: error.incomplete },
      scope,
      missingParens,
    };
  }
}
