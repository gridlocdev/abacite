/**
 * Roots, powers, logarithms and trigonometry on the decimal type (PRD §4.4, §4.5). Each works with
 * `GUARD` extra digits and rounds once at the end, so results are right to the last of their 34 digits in all
 * but rare halfway cases.
 */
import {
  ONE,
  PRECISION,
  ZERO,
  abs,
  add,
  adjusted,
  cmp,
  digitCount,
  div,
  finish,
  fromInt,
  isInteger,
  isZero,
  mod,
  mul,
  neg,
  pow10,
  quantize,
  round,
  sign,
  sub,
  toBigInt,
  toSmallInt,
  type Decimal,
} from './decimal.ts';
import { CalcError } from './errors.ts';
import { formatDecimal } from './format.ts';

/** Extra digits carried while computing a function. */
const GUARD = 10;
/** exp() above this overflows the exponent range (ln 10 × 999 999 ≈ 2 302 583). */
const EXP_MAX = fromInt(2_302_590);
/** Factorial's largest argument (PRD §4.4). */
const FACTORIAL_MAX = 10_000;
/** An angle in radians with a larger leading exponent can't be reduced meaningfully. */
const ANGLE_MAX_EXPONENT = 1000;
/** Extra digits of π a radian reduction may use when the angle is close to a multiple of π. */
const REDUCTION_MAX_DIGITS = 1000;
/** Integer powers up to this are computed by repeated squaring, larger ones through exp and ln. */
const SQUARING_MAX = 1_000_000_000;
/** Trigonometric results smaller than this show as 0 (PRD §4.5). */
const TRIG_ZERO = { c: 1n, e: -32 } as const satisfies Decimal;

export type AngleUnit = 'deg' | 'rad';

const TWO = fromInt(2);
const HALF: Decimal = { c: 5n, e: -1 };

/** True when `term` no longer changes a sum carried to `wp` digits below 1. */
const negligible = (term: Decimal, wp: number) => isZero(term) || adjusted(term) < -wp - 2;

// ── Constants ─────────────────────────────────────────────────────────────

const constantCache = new Map<string, { digits: number; value: Decimal }>();

/** A constant to `wp` digits, from a cached copy at least that precise. */
function cached(name: string, wp: number, compute: (wp: number) => Decimal): Decimal {
  const hit = constantCache.get(name);
  if (hit && hit.digits >= wp) return round(hit.value, wp);
  const digits = Math.max(wp, PRECISION + 2 * GUARD);
  const value = compute(digits);
  constantCache.set(name, { digits, value });
  return round(value, wp);
}

/** arctan(1/n) × 10^scale as a bigint (Machin's series). */
function arctanInverse(n: bigint, scale: bigint): bigint {
  const n2 = n * n;
  let power = scale / n;
  let sum = power;
  let k = 1n;
  while (power !== 0n) {
    power /= n2;
    const term = power / (2n * k + 1n);
    sum += k % 2n === 1n ? -term : term;
    k++;
  }
  return sum;
}

/** π to `wp` digits: 16 atan(1/5) − 4 atan(1/239). */
export function pi(wp: number = PRECISION): Decimal {
  return cached('pi', wp, (digits) => {
    const extra = digits + 10;
    const scale = pow10(extra);
    return finish(16n * arctanInverse(5n, scale) - 4n * arctanInverse(239n, scale), -extra, digits);
  });
}

export function ln10(wp: number): Decimal {
  return cached('ln10', wp, (digits) => lnReduced(fromInt(10), digits));
}

// ── Roots and powers ──────────────────────────────────────────────────────

/** ⌊√n⌋ for a non-negative bigint (Newton). */
function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = pow10(Math.ceil(n.toString().length / 2));
  for (;;) {
    const y = (x + n / x) / 2n;
    if (y >= x) return x;
    x = y;
  }
}

export function sqrt(x: Decimal, p: number = PRECISION): Decimal {
  if (sign(x) < 0) throw new CalcError('Can’t take the square root of a negative number.');
  if (isZero(x)) return ZERO;
  let need = Math.max(0, 2 * (p + 2) - digitCount(x.c));
  if ((x.e - need) % 2 !== 0) need += 1;
  const n = x.c * pow10(need);
  let r = isqrt(n);
  let e = (x.e - need) / 2;
  if (r * r !== n) {
    r = r * 10n + 1n;
    e -= 1;
  }
  return finish(r, e, p);
}

/** x^n for a whole n by repeated squaring, at `wp` digits. */
function powInteger(x: Decimal, n: bigint, wp: number): Decimal {
  let result = ONE;
  let base = x;
  let k = n < 0n ? -n : n;
  if (n < 0n) base = div(ONE, x, wp);
  while (k > 0n) {
    if (k & 1n) result = mul(result, base, wp);
    k >>= 1n;
    if (k > 0n) base = mul(base, base, wp);
  }
  return result;
}

export function pow(x: Decimal, y: Decimal, p: number = PRECISION): Decimal {
  const wp = p + GUARD;
  if (isZero(y)) return ONE;
  if (isZero(x)) {
    if (sign(y) < 0) throw new CalcError('Can’t divide by zero.');
    return ZERO;
  }
  if (isInteger(y)) {
    if (adjusted(y) < 10 && toSmallInt(abs(y), SQUARING_MAX) !== null)
      return round(powInteger(x, toBigInt(y), wp), p);
    const odd = adjusted(y) < 10_000 && toBigInt(y) % 2n !== 0n;
    const magnitude = expOf(mul(y, ln(abs(x), wp + 8), wp + 8), wp);
    return round(sign(x) < 0 && odd ? neg(magnitude) : magnitude, p);
  }
  if (sign(x) < 0)
    throw new CalcError(`A negative number has no real power of ${formatDecimal(y, { digits: 12 })}.`);
  return round(expOf(mul(y, ln(x, wp + 8), wp + 8), wp), p);
}

/** The n-th root; an odd root of a negative is negative (PRD §4.4). */
export function root(x: Decimal, n: Decimal, p: number = PRECISION): Decimal {
  if (isZero(n)) throw new CalcError('Can’t take a zeroth root.');
  if (cmp(n, TWO) === 0) return sqrt(x, p);
  const wp = p + GUARD;
  const whole = isInteger(n) && adjusted(n) < 10_000 ? toBigInt(n) : null;
  if (sign(x) < 0 && (whole === null || whole % 2n === 0n))
    throw new CalcError('Can’t take an even root of a negative number.');
  if (isZero(x)) return ZERO;
  const magnitude = round(pow(abs(x), div(ONE, n, wp), wp), p);
  const value = sign(x) < 0 ? neg(magnitude) : magnitude;
  return whole !== null ? exactRoot(value, x, whole) : value;
}

/** A root that is exact (∛27 = 3) comes out exact, not 2.999…9 or 3.000…1. */
function exactRoot(value: Decimal, x: Decimal, n: bigint): Decimal {
  if (n < 1n || n > 64n) return value;
  const candidate = round(value, 20);
  const check = powInteger(candidate, n, PRECISION * Number(n) + 10);
  return cmp(check, x) === 0 ? candidate : value;
}

// ── exp and ln ────────────────────────────────────────────────────────────

/** e^x to `wp` digits, before the final rounding. */
function expOf(x: Decimal, wp: number): Decimal {
  if (isZero(x)) return ONE;
  if (cmp(x, EXP_MAX) > 0) throw new CalcError('Result is too large.');
  if (cmp(x, neg(EXP_MAX)) < 0) return ZERO;
  if (adjusted(x) < -(wp + 2)) return add(ONE, x, wp);
  const w = wp + 8;
  // x = k·ln 10 + r, |r| ≤ 1.16; then r is halved 8 times so the series is short.
  const l10 = ln10(w);
  const k = quantize(div(x, l10, w), 0, 'halfAway');
  let r = sub(x, mul(k, l10, w), w);
  const halvings = 8;
  r = div(r, fromInt(2 ** halvings), w);
  let sum = ONE;
  let term = ONE;
  for (let n = 1; ; n++) {
    term = div(mul(term, r, w), fromInt(n), w);
    if (negligible(term, w)) break;
    sum = add(sum, term, w);
  }
  for (let i = 0; i < halvings; i++) sum = mul(sum, sum, w);
  const shift = Number(toBigInt(k));
  return finish(sum.c, sum.e + shift, wp);
}

export function exp(x: Decimal, p: number = PRECISION): Decimal {
  return round(expOf(x, p + GUARD), p);
}

/** 2·atanh(z) = ln((1+z)/(1−z)), for small |z|. */
function lnSeries(m: Decimal, wp: number): Decimal {
  const z = div(sub(m, ONE, wp), add(m, ONE, wp), wp);
  const z2 = mul(z, z, wp);
  let power = z;
  let sum = z;
  for (let k = 3; ; k += 2) {
    power = mul(power, z2, wp);
    const term = div(power, fromInt(k), wp);
    if (negligible(term, wp) || adjusted(term) < adjusted(sum) - wp - 2) break;
    sum = add(sum, term, wp);
  }
  return mul(sum, TWO, wp);
}

/** ln(m) for any positive m, by taking square roots until m is close to 1. */
function lnReduced(m: Decimal, wp: number): Decimal {
  const w = wp + 4;
  let halvings = 0;
  let x = m;
  const near = { c: 1n, e: -1 } as const satisfies Decimal;
  while (cmp(abs(sub(x, ONE, w)), near) >= 0) {
    x = sqrt(x, w);
    halvings++;
  }
  return mul(lnSeries(x, w), fromInt(2 ** halvings), wp);
}

/** ln(x) to `wp` digits; x must be positive. */
function lnOf(x: Decimal, wp: number): Decimal {
  if (cmp(abs(sub(x, ONE, wp + 2)), HALF) < 0) return lnSeries(x, wp + 2);
  const k = adjusted(x);
  const m: Decimal = { c: x.c, e: x.e - k };
  const extra = digitCount(BigInt(Math.abs(k)));
  return add(lnReduced(m, wp + 2), mul(fromInt(k), ln10(wp + extra + 2), wp + extra + 2), wp + 2);
}

export function ln(x: Decimal, p: number = PRECISION): Decimal {
  if (sign(x) <= 0) throw new CalcError('The logarithm needs a number above 0.');
  return round(lnOf(x, p + GUARD), p);
}

/** Base-10 logarithm; exact for powers of ten. */
export function log10(x: Decimal, p: number = PRECISION): Decimal {
  if (sign(x) <= 0) throw new CalcError('The logarithm needs a number above 0.');
  if (x.c === 1n) return fromInt(x.e);
  const wp = p + GUARD;
  return round(div(lnOf(x, wp), ln10(wp), wp), p);
}

export function logBase(x: Decimal, base: Decimal, p: number = PRECISION): Decimal {
  if (sign(x) <= 0 || sign(base) <= 0) throw new CalcError('The logarithm needs a number above 0.');
  if (cmp(base, ONE) === 0) throw new CalcError('The base of a logarithm can’t be 1.');
  const wp = p + GUARD;
  return round(div(lnOf(x, wp), lnOf(base, wp), wp), p);
}

// ── Trigonometry ──────────────────────────────────────────────────────────

/** sin and cos of r, |r| ≤ π, by their series. */
function sinCosSeries(r: Decimal, wp: number): { sin: Decimal; cos: Decimal } {
  let sinSum = r;
  let cosSum = ONE;
  let term = ONE;
  for (let n = 1; ; n++) {
    term = div(mul(term, r, wp), fromInt(n), wp);
    // Relative to the smaller sum, so a tiny angle keeps all its digits: sin(1e-16) needs terms far below 1e-wp.
    if (isZero(term) || adjusted(term) < Math.min(adjusted(sinSum), adjusted(cosSum), 0) - wp - 2) break;
    const k = n % 4;
    if (k === 1 && n > 1) sinSum = add(sinSum, term, wp);
    else if (k === 2) cosSum = sub(cosSum, term, wp);
    else if (k === 3) sinSum = sub(sinSum, term, wp);
    else if (k === 0) cosSum = add(cosSum, term, wp);
  }
  return { sin: sinSum, cos: cosSum };
}

type Exact = { readonly sin: Decimal; readonly cos: Decimal };

/** The angle in radians within [−π, π], or the exact values at multiples of 90° (PRD §4.5). */
function reduce(x: Decimal, unit: AngleUnit, wp: number): { r: Decimal; exact: Exact | null; deg: Decimal } {
  if (unit === 'deg') {
    const d = mod(x, fromInt(360), Math.max(PRECISION, digitCount(x.c) + 4));
    const quarter = mod(d, fromInt(90));
    if (isZero(quarter)) {
      const q = Number(toBigInt(div(d, fromInt(90))));
      const table: Exact[] = [
        { sin: ZERO, cos: ONE },
        { sin: ONE, cos: ZERO },
        { sin: ZERO, cos: neg(ONE) },
        { sin: neg(ONE), cos: ZERO },
      ];
      return { r: ZERO, exact: table[q]!, deg: d };
    }
    const signed = cmp(d, fromInt(180)) > 0 ? sub(d, fromInt(360)) : d;
    return { r: div(mul(signed, pi(wp), wp), fromInt(180), wp), exact: null, deg: d };
  }
  if (adjusted(x) > ANGLE_MAX_EXPONENT) throw new CalcError('Angle is too large.');
  // Reducing cancels the leading digits; near a multiple of π it cancels more, so when r comes out small the
  // reduction runs again with that many more digits of π, until r keeps `wp` significant digits.
  let w = wp + Math.max(0, adjusted(x));
  for (;;) {
    const twoPi = mul(pi(w), TWO, w);
    const k = quantize(div(x, twoPi, w), 0, 'halfAway');
    const r = sub(x, mul(k, twoPi, w), w);
    const lost = isZero(r) ? 0 : -adjusted(r);
    if (lost <= 0 || w >= wp + Math.max(0, adjusted(x)) + lost + GUARD || lost > REDUCTION_MAX_DIGITS)
      return { r: round(r, wp), exact: null, deg: ZERO };
    w = wp + Math.max(0, adjusted(x)) + lost + GUARD;
  }
}

/**
 * Rounds a trigonometric result. In radians a value below 1e-32 is 0, so `sin(pi)` is 0; degrees reduce
 * exactly, so a tiny result there is real (PRD §4.5).
 */
function trigResult(v: Decimal, unit: AngleUnit, p: number): Decimal {
  return unit === 'rad' && cmp(abs(v), TRIG_ZERO) < 0 ? ZERO : round(v, p);
}

export function sin(x: Decimal, unit: AngleUnit, p: number = PRECISION): Decimal {
  const wp = p + GUARD;
  const { r, exact } = reduce(x, unit, wp);
  return exact ? exact.sin : trigResult(sinCosSeries(r, wp).sin, unit, p);
}

export function cos(x: Decimal, unit: AngleUnit, p: number = PRECISION): Decimal {
  const wp = p + GUARD;
  const { r, exact } = reduce(x, unit, wp);
  return exact ? exact.cos : trigResult(sinCosSeries(r, wp).cos, unit, p);
}

export function tan(x: Decimal, unit: AngleUnit, p: number = PRECISION): Decimal {
  const wp = p + GUARD;
  const { r, exact, deg } = reduce(x, unit, wp);
  if (exact) {
    if (isZero(exact.cos)) throw new CalcError(`tan is undefined at ${formatDecimal(deg, { digits: 12 })}°.`);
    return ZERO;
  }
  const sc = sinCosSeries(r, wp);
  return trigResult(div(sc.sin, sc.cos, wp), unit, p);
}

/** atan(x) in radians to `wp` digits. */
function atanOf(x: Decimal, wp: number): Decimal {
  if (isZero(x)) return ZERO;
  const w = wp + 4;
  if (cmp(abs(x), ONE) > 0) {
    const halfPi = div(pi(w), TWO, w);
    const inner = atanOf(div(ONE, x, w), w);
    return sub(sign(x) > 0 ? halfPi : neg(halfPi), inner, wp);
  }
  // atan(x) = 2 atan(x / (1 + √(1 + x²))), until |x| < 0.1.
  let y = x;
  let doublings = 0;
  const small = { c: 1n, e: -1 } as const satisfies Decimal;
  while (cmp(abs(y), small) >= 0) {
    y = div(y, add(ONE, sqrt(add(ONE, mul(y, y, w), w), w), w), w);
    doublings++;
  }
  const y2 = mul(y, y, w);
  let power = y;
  let sum = y;
  for (let k = 3; ; k += 2) {
    power = neg(mul(power, y2, w));
    const term = div(power, fromInt(k), w);
    if (negligible(term, w) || adjusted(term) < adjusted(sum) - w - 2) break;
    sum = add(sum, term, w);
  }
  return mul(sum, fromInt(2 ** doublings), wp);
}

/** Radians to the angle unit, rounded. */
function angleOut(rad: Decimal, unit: AngleUnit, wp: number, p: number): Decimal {
  if (unit === 'rad') return round(rad, p);
  return round(div(mul(rad, fromInt(180), wp), pi(wp), wp), p);
}

export function atan(x: Decimal, unit: AngleUnit, p: number = PRECISION): Decimal {
  const wp = p + GUARD;
  return angleOut(atanOf(x, wp), unit, wp, p);
}

/** The angle of the point (x, y); atan2(0, 0) is 0. */
export function atan2(y: Decimal, x: Decimal, unit: AngleUnit, p: number = PRECISION): Decimal {
  const wp = p + GUARD;
  if (isZero(x)) {
    if (isZero(y)) return ZERO;
    const halfPi = div(pi(wp), TWO, wp);
    return angleOut(sign(y) > 0 ? halfPi : neg(halfPi), unit, wp, p);
  }
  const base = atanOf(div(y, x, wp), wp);
  if (sign(x) > 0) return angleOut(base, unit, wp, p);
  const turn = sign(y) < 0 ? neg(pi(wp)) : pi(wp);
  return angleOut(add(base, turn, wp), unit, wp, p);
}

const inUnitRange = (x: Decimal) => cmp(abs(x), ONE) <= 0;

export function asin(x: Decimal, unit: AngleUnit, p: number = PRECISION): Decimal {
  if (!inUnitRange(x)) throw new CalcError('asin needs a number from -1 to 1.');
  const wp = p + GUARD;
  if (cmp(abs(x), ONE) === 0) {
    const halfPi = div(pi(wp), TWO, wp);
    return angleOut(sign(x) > 0 ? halfPi : neg(halfPi), unit, wp, p);
  }
  const w = wp + Math.max(0, -adjusted(sub(ONE, abs(x), wp)));
  return angleOut(atanOf(div(x, sqrt(sub(ONE, mul(x, x, w), w), w), w), wp), unit, wp, p);
}

export function acos(x: Decimal, unit: AngleUnit, p: number = PRECISION): Decimal {
  if (!inUnitRange(x)) throw new CalcError('acos needs a number from -1 to 1.');
  const wp = p + GUARD;
  if (isZero(x)) return angleOut(div(pi(wp), TWO, wp), unit, wp, p);
  if (cmp(x, neg(ONE)) === 0) return angleOut(pi(wp), unit, wp, p);
  const w = wp + Math.max(0, -adjusted(sub(ONE, abs(x), wp + 2)));
  // acos(x) = 2 atan(√((1−x)/(1+x))): no cancellation near ±1.
  const t = sqrt(div(sub(ONE, x, w), add(ONE, x, w), w), w);
  return angleOut(mul(atanOf(t, w), TWO, wp), unit, wp, p);
}

// ── Hyperbolic ────────────────────────────────────────────────────────────

/** Extra digits for functions that cancel near 0, capped: below 1e-(p+5) they return x itself. */
const nearZeroDigits = (x: Decimal, p: number) => Math.min(p + 5, Math.max(0, -adjusted(x)));
const tiny = (x: Decimal, p: number) => adjusted(x) < -(p + 5);

export function sinh(x: Decimal, p: number = PRECISION): Decimal {
  if (isZero(x) || tiny(x, p)) return round(x, p);
  const wp = p + GUARD + nearZeroDigits(x, p);
  const ex = expOf(x, wp);
  return round(div(sub(ex, div(ONE, ex, wp), wp), TWO, wp), p);
}

export function cosh(x: Decimal, p: number = PRECISION): Decimal {
  const wp = p + GUARD;
  const ex = expOf(abs(x), wp);
  return round(div(add(ex, div(ONE, ex, wp), wp), TWO, wp), p);
}

export function tanh(x: Decimal, p: number = PRECISION): Decimal {
  if (isZero(x) || tiny(x, p)) return round(x, p);
  if (cmp(abs(x), fromInt(60)) > 0) return sign(x) > 0 ? ONE : neg(ONE);
  const wp = p + GUARD + nearZeroDigits(x, p);
  const e2 = expOf(mul(x, TWO, wp), wp);
  return round(div(sub(e2, ONE, wp), add(e2, ONE, wp), wp), p);
}

export function asinh(x: Decimal, p: number = PRECISION): Decimal {
  if (isZero(x) || tiny(x, p)) return round(x, p);
  const wp = p + GUARD + nearZeroDigits(x, p);
  const a = abs(x);
  const value =
    adjusted(a) > p
      ? add(lnOf(a, wp), lnOf(TWO, wp), wp)
      : lnOf(add(a, sqrt(add(mul(a, a, wp), ONE, wp), wp), wp), wp);
  return round(sign(x) < 0 ? neg(value) : value, p);
}

export function acosh(x: Decimal, p: number = PRECISION): Decimal {
  if (cmp(x, ONE) < 0) throw new CalcError('acosh needs a number of 1 or more.');
  const wp = p + GUARD + Math.max(0, -adjusted(sub(x, ONE, p + GUARD)));
  if (adjusted(x) > p) return round(add(lnOf(x, wp), lnOf(TWO, wp), wp), p);
  return round(lnOf(add(x, sqrt(sub(mul(x, x, wp), ONE, wp), wp), wp), wp), p);
}

export function atanh(x: Decimal, p: number = PRECISION): Decimal {
  if (cmp(abs(x), ONE) >= 0) throw new CalcError('atanh needs a number between -1 and 1.');
  if (isZero(x) || tiny(x, p)) return round(x, p);
  const wp = p + GUARD + nearZeroDigits(x, p) + Math.max(0, -adjusted(sub(ONE, abs(x), p + GUARD)));
  return round(div(lnOf(div(add(ONE, x, wp), sub(ONE, x, wp), wp), wp), TWO, wp), p);
}

// ── Whole-number functions ────────────────────────────────────────────────

export function factorial(x: Decimal, p: number = PRECISION): Decimal {
  const n = toSmallInt(x, FACTORIAL_MAX);
  if (n === null || n < 0) throw new CalcError('Factorial needs a whole number from 0 to 10000.');
  let product = 1n;
  for (let k = 2n; k <= BigInt(n); k++) product *= k;
  return finish(product, 0, p);
}
