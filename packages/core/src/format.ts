/** Turning a decimal into text (PRD §3.2). */
import { PRECISION, adjusted, roundUnchecked, type Decimal } from './decimal.ts';

/** Significant digits a result shows (PRD §3.2). */
export const SHOWN_DIGITS = 32;

export interface FormatOptions {
  /** Significant digits to round to; 32 by default, 34 for the tape file and `--full`. */
  readonly digits?: number;
  /** Groups the integer part with commas: `1,234,567.89`. */
  readonly group?: boolean;
}

/** Plain notation when the leading digit's exponent is from -7 to 20 (as JavaScript does). */
const PLAIN_MIN = -7;
const PLAIN_MAX = 20;

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatDecimal(d: Decimal, options: FormatOptions = {}): string {
  // A result just under the limit can round up past it for showing (9.99…e999999 shows 1e+1000000).
  const r = roundUnchecked(d.c, d.e, Math.min(options.digits ?? SHOWN_DIGITS, PRECISION));
  if (r.c === 0n) return '0';
  const negative = r.c < 0n;
  const digits = (negative ? -r.c : r.c).toString();
  const adj = adjusted(r);
  let text: string;
  if (adj < PLAIN_MIN || adj > PLAIN_MAX) {
    const mantissa = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
    text = `${mantissa}e${adj < 0 ? '-' : '+'}${Math.abs(adj)}`;
  } else {
    let whole: string;
    let fraction: string;
    if (r.e >= 0) {
      whole = digits + '0'.repeat(r.e);
      fraction = '';
    } else if (adj >= 0) {
      whole = digits.slice(0, adj + 1);
      fraction = digits.slice(adj + 1);
    } else {
      whole = '0';
      fraction = '0'.repeat(-adj - 1) + digits;
    }
    if (options.group) whole = groupThousands(whole);
    text = fraction ? `${whole}.${fraction}` : whole;
  }
  return negative ? `-${text}` : text;
}
