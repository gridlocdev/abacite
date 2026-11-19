/**
 * The engine's number: a bigint coefficient and a base-10 exponent, value = c × 10^e (PRD §3.1). No floating
 * point anywhere. Every operation rounds its result to a number of significant digits, half to even.
 */
import { CalcError } from './errors.ts';

export interface Decimal {
  /** Signed coefficient, with no trailing zeros (zero is 0n). */
  readonly c: bigint;
  /** Base-10 exponent; 0 for zero. */
  readonly e: number;
}

/** Significant digits every result keeps (PRD §3.1). */
export const PRECISION = 34;
/** Largest and smallest adjusted exponent (PRD §3.1). */
export const MAX_EXPONENT = 999_999;

export const ZERO: Decimal = { c: 0n, e: 0 };
export const ONE: Decimal = { c: 1n, e: 0 };

const TEN = 10n;
const POW10_CACHE: bigint[] = [1n];

/** 10^n as a bigint. */
export function pow10(n: number): bigint {
  if (n < 0) throw new RangeError(`pow10(${n})`);
  if (n < 400) {
    while (POW10_CACHE.length <= n) POW10_CACHE.push(POW10_CACHE[POW10_CACHE.length - 1]! * TEN);
    return POW10_CACHE[n]!;
  }
  return TEN ** BigInt(n);
}

const absBig = (c: bigint): bigint => (c < 0n ? -c : c);

/** How many decimal digits the coefficient has (1 for zero). */
export function digitCount(c: bigint): number {
  return c === 0n ? 1 : absBig(c).toString().length;
}

/** The exponent of the leading digit: 1234 → 3, 0.05 → -2. */
export function adjusted(d: Decimal): number {
  return d.e + digitCount(d.c) - 1;
}

export function sign(d: Decimal): -1 | 0 | 1 {
  return d.c === 0n ? 0 : d.c < 0n ? -1 : 1;
}

export function isZero(d: Decimal): boolean {
  return d.c === 0n;
}

/** True for a whole number. Coefficients have no trailing zeros, so a negative exponent means a fraction. */
export function isInteger(d: Decimal): boolean {
  return d.e >= 0 || d.c === 0n;
}

/** Strips trailing zeros so equal values have equal representations. */
function normalize(c: bigint, e: number): Decimal {
  if (c === 0n) return ZERO;
  const s = absBig(c).toString();
  let zeros = 0;
  while (zeros < s.length - 1 && s.charCodeAt(s.length - 1 - zeros) === 48) zeros++;
  return zeros === 0 ? { c, e } : { c: c / pow10(zeros), e: e + zeros };
}

/**
 * Rounds c × 10^e to `p` significant digits, half to even, and checks the exponent range: too large is an
 * error, too small is zero (PRD §3.1).
 */
export function finish(c: bigint, e: number, p: number = PRECISION): Decimal {
  const d = roundUnchecked(c, e, p);
  const adj = adjusted(d);
  if (adj > MAX_EXPONENT) throw new CalcError('Result is too large.');
  if (adj < -MAX_EXPONENT) return ZERO;
  return d;
}

/** Rounds c × 10^e to `p` significant digits, half to even, with no range check: for showing a result. */
export function roundUnchecked(c: bigint, e: number, p: number = PRECISION): Decimal {
  if (c === 0n) return ZERO;
  const digits = digitCount(c);
  if (digits > p) {
    const drop = digits - p;
    const unit = pow10(drop);
    let q = c / unit;
    const r = absBig(c % unit);
    const twice = r * 2n;
    if (twice > unit || (twice === unit && absBig(q) % 2n === 1n)) q += c < 0n ? -1n : 1n;
    c = q;
    e += drop;
  }
  return normalize(c, e);
}

export function round(d: Decimal, p: number = PRECISION): Decimal {
  return finish(d.c, d.e, p);
}

export function neg(d: Decimal): Decimal {
  return d.c === 0n ? ZERO : { c: -d.c, e: d.e };
}

export function abs(d: Decimal): Decimal {
  return d.c < 0n ? { c: -d.c, e: d.e } : d;
}

/**
 * a + b. A term far below the other's last digit is replaced by a tiny "sticky" one in the same direction: it
 * rounds the same way and keeps the bigints small.
 */
export function add(a: Decimal, b: Decimal, p: number = PRECISION): Decimal {
  if (a.c === 0n) return round(b, p);
  if (b.c === 0n) return round(a, p);
  let x = a;
  let y = b;
  if (adjusted(y) > adjusted(x)) [x, y] = [y, x];
  const floor = Math.min(x.e, adjusted(x) - p) - 2;
  if (adjusted(y) < floor) y = { c: y.c < 0n ? -1n : 1n, e: floor - 1 };
  const e = Math.min(x.e, y.e);
  return finish(x.c * pow10(x.e - e) + y.c * pow10(y.e - e), e, p);
}

export function sub(a: Decimal, b: Decimal, p: number = PRECISION): Decimal {
  return add(a, neg(b), p);
}

export function mul(a: Decimal, b: Decimal, p: number = PRECISION): Decimal {
  if (a.c === 0n || b.c === 0n) return ZERO;
  return finish(a.c * b.c, a.e + b.e, p);
}

export function div(a: Decimal, b: Decimal, p: number = PRECISION): Decimal {
  if (b.c === 0n) throw new CalcError('Can’t divide by zero.');
  if (a.c === 0n) return ZERO;
  const shift = Math.max(0, p + 2 + digitCount(b.c) - digitCount(a.c));
  const n = a.c * pow10(shift);
  let q = n / b.c;
  let e = a.e - b.e - shift;
  if (n % b.c !== 0n) {
    // Inexact: one more digit that is never a tie, so half-even rounding sees the remainder.
    q = q * TEN + (n < 0n !== b.c < 0n ? -1n : 1n);
    e -= 1;
  }
  return finish(q, e, p);
}

/** -1, 0 or 1 as a is less than, equal to or greater than b. Exact. */
export function cmp(a: Decimal, b: Decimal): -1 | 0 | 1 {
  const sa = sign(a);
  const sb = sign(b);
  if (sa !== sb) return sa < sb ? -1 : 1;
  if (sa === 0) return 0;
  const aa = adjusted(a);
  const ab = adjusted(b);
  if (aa !== ab) return ((aa < ab ? -1 : 1) * sa) as -1 | 1;
  const e = Math.min(a.e, b.e);
  const x = a.c * pow10(a.e - e);
  const y = b.c * pow10(b.e - e);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function eq(a: Decimal, b: Decimal): boolean {
  return a.c === b.c && a.e === b.e;
}

export const QUANTIZE_MODES = ['trunc', 'floor', 'ceil', 'halfAway'] as const;
export type QuantizeMode = (typeof QUANTIZE_MODES)[number];

/** Rounds to `places` decimal places (negative: tens, hundreds…) by `mode`. Exact. */
export function quantize(d: Decimal, places: number, mode: QuantizeMode): Decimal {
  const target = -places;
  if (d.e >= target || d.c === 0n) return d;
  const s = sign(d);
  const unitAt = (u: bigint) => finish(u, target);
  if (adjusted(d) < target - 1) {
    // Below a tenth of a unit: rounds to 0, or one unit away from zero.
    if (mode === 'floor' && s < 0) return unitAt(-1n);
    if (mode === 'ceil' && s > 0) return unitAt(1n);
    return ZERO;
  }
  const unit = pow10(target - d.e);
  let q = d.c / unit;
  const r = d.c % unit;
  switch (mode) {
    case 'trunc':
      break;
    case 'floor':
      if (r < 0n) q -= 1n;
      break;
    case 'ceil':
      if (r > 0n) q += 1n;
      break;
    case 'halfAway':
      if (absBig(r) * 2n >= unit) q += BigInt(s);
      break;
  }
  return finish(q, target, Math.max(PRECISION, digitCount(q)));
}

/**
 * a mod b, with the sign of b (PRD §4.1): -7 mod 3 is 2. Exact, using modular powers of ten when the exponents
 * are far apart.
 */
export function mod(a: Decimal, b: Decimal, p: number = PRECISION): Decimal {
  if (b.c === 0n) throw new CalcError('Can’t divide by zero.');
  if (a.c === 0n) return ZERO;
  let r: Decimal;
  if (adjusted(a) < adjusted(b)) {
    r = a;
  } else {
    const e = Math.min(a.e, b.e);
    const B = absBig(b.c * pow10(b.e - e));
    const A = (absBig(a.c) % B) * modPow10(a.e - e, B);
    r = finish((a.c < 0n ? -1n : 1n) * (A % B), e, Math.max(p, digitCount(B)));
  }
  if (r.c !== 0n && sign(r) !== sign(b)) r = add(r, b, p);
  r = round(r, p);
  // A remainder too small to show beside b rounds up to b itself; the result must stay below |b|.
  return eq(r, b) ? ZERO : r;
}

/** 10^n mod m. */
function modPow10(n: number, m: bigint): bigint {
  let result = 1n % m;
  let base = TEN % m;
  let k = n;
  while (k > 0) {
    if (k & 1) result = (result * base) % m;
    base = (base * base) % m;
    k = Math.floor(k / 2);
  }
  return result;
}

/** The number a literal like `1.5e-3` names, or null when it isn't one. */
export function parseDecimal(text: string): Decimal | null {
  const m = /^([0-9]*)(?:\.([0-9]*))?(?:[eE]([+-]?[0-9]+))?$/.exec(text);
  if (!m) return null;
  const whole = m[1] ?? '';
  const frac = m[2] ?? '';
  if (!whole && !frac) return null;
  const exp = m[3] ? Number(m[3]) : 0;
  if (/^0*$/.test(whole + frac)) return ZERO;
  if (!Number.isSafeInteger(exp)) {
    if (exp < 0) return ZERO;
    throw new CalcError('Result is too large.');
  }
  return finish(BigInt(whole + frac || '0'), exp - frac.length);
}

export function fromInt(n: number | bigint): Decimal {
  return finish(BigInt(n), 0, Number.MAX_SAFE_INTEGER);
}

/** A whole number's bigint value. Only for integers with a sane exponent. */
export function toBigInt(d: Decimal): bigint {
  if (d.e < 0) throw new RangeError('not an integer');
  return d.c * pow10(d.e);
}

/** A small whole number as a JS number, or null when `d` isn't an integer within ±limit. */
export function toSmallInt(d: Decimal, limit: number): number | null {
  if (!isInteger(d) || adjusted(d) > 15) return null;
  const n = Number(toBigInt(d));
  return Math.abs(n) <= limit ? n : null;
}
