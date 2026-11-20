/** What the display and the ghost text show for what is being typed (PRD §9.1, §9.3). Pure: no signals. */
import {
  evaluate,
  expandInput,
  preview,
  startsWithOperator,
  type Decimal,
  type Env,
  type Session,
} from '@abacite/core';
import { classicEmpty, classicSegment, classicText, formatEntry, type ClassicState } from './classic.ts';
import type { Ghost, Shown } from './view.ts';

export const NO_GHOST: Ghost = { ans: false, missingParens: 0, errorAt: null };
export const ZERO_SHOWN: Shown = { kind: 'result', text: '0' };

/** A result as shown: the number, then its unit after a conversion (`3.1 mi`). */
export type FormatResult = (value: Decimal, unit: string | null) => string;

/** The display for a typed expression line; `live` is the last complete result, kept greyed while unfinished. */
export function lineDisplay(input: {
  readonly text: string;
  readonly session: Session;
  readonly env: Env;
  readonly format: FormatResult;
  /** The last complete live result before this edit. */
  readonly live: string | null;
  /** The last committed result, or 0. */
  readonly last: string;
}): { shown: Shown; ghost: Ghost; live: string | null } {
  const { text, session, format } = input;
  const evaluation = preview(session, text, input.env);
  const result = evaluation.result;
  let live = input.live;
  let shown: Shown;
  let errorAt: number | null = null;
  if (result.kind === 'value') {
    live = format(result.value, result.unit);
    shown = { kind: 'live', text: live };
  } else if (result.kind === 'error' && !result.incomplete && !/[A-Za-z_]$/.test(text)) {
    // A complete line that fails (`1/0`); a name still being typed (`si`) isn't an error yet.
    shown = { kind: 'error', text: result.message };
    errorAt = result.at;
  } else {
    shown = { kind: 'pending', text: live ?? input.last };
  }
  const ans = expandInput(text, session) !== text && startsWithOperator(text);
  return { shown, ghost: { ans, missingParens: evaluation.missingParens, errorAt }, live };
}

/**
 * The display in classic entry: the number being typed as typed, else the value of the entry or of the part of
 * the calculation already worked out. `last` when nothing has been entered, `pending` while an operator waits,
 * `keep` to leave it as it is.
 */
export function classicDisplay(input: {
  readonly state: ClassicState;
  readonly group: boolean;
  readonly session: Session;
  readonly env: Env;
  readonly format: FormatResult;
}): Shown | 'last' | 'pending' | 'keep' {
  const s = input.state;
  if (s.typing) return { kind: 'live', text: formatEntry(s.entry!, input.group) };
  const text = percentShown(s) ?? s.entry ?? classicSegment(s);
  if (text === null) return classicEmpty(s) ? 'last' : 'pending';
  const result = evaluate(text, input.session.scope, input.env).result;
  if (result.kind === 'value') return { kind: 'live', text: input.format(result.value, result.unit) };
  return result.kind === 'error' ? { kind: 'error', text: result.message } : 'keep';
}

/**
 * After `+` or `−`, a percent is of the left operand (PRD §4), so `200 + 10 %` shows `20`, the amount it adds,
 * as the macOS Calculator does. The expression for that amount, or null when the plain `x / 100` applies.
 */
function percentShown(s: ClassicState): string | null {
  const op = s.parts.at(-1);
  if (s.entry === null || !s.entry.endsWith('%') || (op !== '+' && op !== '-')) return null;
  // Inside an open parenthesis or function the left operand is only part of the calculation.
  if (s.parts.some((p) => p.endsWith('('))) return null;
  const left = classicText({ parts: s.parts.slice(0, -1), entry: null, typing: false });
  const whole = classicText(s);
  if (left === null || whole === null) return null;
  return op === '+' ? `(${whole}) - (${left})` : `(${left}) - (${whole})`;
}
