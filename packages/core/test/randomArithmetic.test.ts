import { expect, it } from 'vitest';
import { add, cmp, div, mod, mul, sub, type Decimal } from '../src/index.ts';
import { RANDOM_TIMEOUT, runRandomOps, type Random } from './randomOps.ts';

/** Exact rational value of a decimal: numerator and power-of-ten denominator. */
const exact = (d: Decimal): [bigint, bigint] =>
  d.e >= 0 ? [d.c * 10n ** BigInt(d.e), 1n] : [d.c, 10n ** BigInt(-d.e)];

function randomDecimal(random: Random): Decimal {
  const digits = 1 + random.int(20);
  let c = 0n;
  for (let i = 0; i < digits; i++) c = c * 10n + BigInt(random.int(10));
  if (random.chance(0.5)) c = -c;
  return { c, e: random.int(30) - 15 };
}

/** |a − b| ≤ half a unit in the 34th digit of b (or exactly equal when b is 0). */
function closeTo(a: [bigint, bigint], b: Decimal): boolean {
  const [n, m] = exact(b);
  // a/q − n/m, scaled
  const diff = a[0] * m - n * a[1];
  const absDiff = diff < 0n ? -diff : diff;
  if (b.c === 0n) return absDiff === 0n;
  const digits = BigInt((b.c < 0n ? -b.c : b.c).toString().length);
  // half ulp of b = 5 × 10^(e + digits − 35)
  const ulpExp = BigInt(b.e) + digits - 35n;
  const lhs = absDiff * (ulpExp < 0n ? 10n ** -ulpExp : 1n);
  const rhs = 5n * a[1] * m * (ulpExp > 0n ? 10n ** ulpExp : 1n);
  return lhs <= rhs;
}

function floorDiv(n: bigint, d: bigint): bigint {
  const q = n / d;
  return n % d !== 0n && n < 0n !== d < 0n ? q - 1n : q;
}

interface State {
  a: Decimal;
  b: Decimal;
}

it(
  'random arithmetic rounds to within half a unit in the 34th digit',
  () =>
    runRandomOps<State>({
      setup: (random) => ({ a: randomDecimal(random), b: randomDecimal(random) }),
      steps: 40,
      ops: [
        {
          name: 'pick',
          run: (s, random) => {
            s.a = randomDecimal(random);
            s.b = randomDecimal(random);
            return `${s.a.c}e${s.a.e}, ${s.b.c}e${s.b.e}`;
          },
        },
      ],
      check: ({ a, b }) => {
        const [an, ad] = exact(a);
        const [bn, bd] = exact(b);
        expect(closeTo([an * bd + bn * ad, ad * bd], add(a, b))).toBe(true);
        expect(closeTo([an * bd - bn * ad, ad * bd], sub(a, b))).toBe(true);
        expect(closeTo([an * bn, ad * bd], mul(a, b))).toBe(true);
        if (b.c !== 0n) {
          let num = an * bd;
          let den = ad * bn;
          if (den < 0n) [num, den] = [-num, -den];
          expect(closeTo([num, den], div(a, b))).toBe(true);
          // a mod b = a − b·floor(a / b): the sign of b (PRD §4.1), rounded like everything else.
          const q = floorDiv(num, den);
          expect(closeTo([an * bd - q * bn * ad, ad * bd], mod(a, b))).toBe(true);
        }
        expect(cmp(a, b)).toBe(-cmp(b, a));
      },
    }),
  RANDOM_TIMEOUT,
);
