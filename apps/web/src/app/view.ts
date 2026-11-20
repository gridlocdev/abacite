/** What the display and the expression line show, and the window widths (PRD §9.1). */
import type { Mode } from '@abacite/ui';

/** What the display shows (PRD §9.1). */
export type Shown =
  /** The committed result, or the last one while the line is empty. */
  | { readonly kind: 'result'; readonly text: string }
  /** The live result of the expression line. */
  | { readonly kind: 'live'; readonly text: string }
  /** The line isn't finished: the last complete result, greyed. */
  | { readonly kind: 'pending'; readonly text: string }
  | { readonly kind: 'error'; readonly text: string };

/** What the expression line draws behind the typed text (PRD §7.1, §4.1). */
export interface Ghost {
  /** `ans ` in front of a leading operator. */
  readonly ans: boolean;
  /** `)`s the end of the line closes. */
  readonly missingParens: number;
  /** Where to underline an error in the typed text, or null. */
  readonly errorAt: number | null;
}

/** Window widths the desktop app grows to (PRD §9.1). */
export const WIDTHS = { basic: 400, scientific: 720, session: 260 } as const;

export function windowWidth(mode: Mode, session: boolean): number {
  return WIDTHS[mode] + (session ? WIDTHS.session : 0);
}

/** The number a display shows, alone: no grouping commas or unit. Null for an error or an unfinished line. */
export function shownNumber(shown: Shown): string | null {
  return shown.kind === 'result' || shown.kind === 'live'
    ? shown.text.split(' ')[0]!.replaceAll(',', '')
    : null;
}
