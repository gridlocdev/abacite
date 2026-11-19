/** What the display and the ghost text show for what is being typed (PRD §9.1, §9.3). Pure: no signals. */
import {
  evaluate,
  expandInput,
  preview,
  startsWithOperator,
  type Decimal,
  type Env,
  type Tape,
} from '@abacite/core';
import { classicEmpty, classicSegment, formatEntry, type ClassicState } from './classic.ts';
import type { Ghost, Shown } from './view.ts';

export const NO_GHOST: Ghost = { ans: false, missingParens: 0, errorAt: null };
export const ZERO_SHOWN: Shown = { kind: 'result', text: '0' };

/** A result as shown: the number, then its unit after a conversion (`3.1 mi`). */
export type FormatResult = (value: Decimal, unit: string | null) => string;

/** The display for a typed expression line; `live` is the last complete result, kept greyed while unfinished. */
export function lineDisplay(input: {
  readonly text: string;
  readonly tape: Tape;
  readonly env: Env;
  readonly format: FormatResult;
  /** The last complete live result before this edit. */
  readonly live: string | null;
  /** The last committed result, or 0. */
  readonly last: string;
}): { shown: Shown; ghost: Ghost; live: string | null } {
  const { text, tape, format } = input;
  const evaluation = preview(tape, text, input.env);
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
  const ans = expandInput(text, tape) !== text && startsWithOperator(text);
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
  readonly tape: Tape;
  readonly env: Env;
  readonly format: FormatResult;
}): Shown | 'last' | 'pending' | 'keep' {
  const s = input.state;
  if (s.typing) return { kind: 'live', text: formatEntry(s.entry!, input.group) };
  const text = s.entry ?? classicSegment(s);
  if (text === null) return classicEmpty(s) ? 'last' : 'pending';
  const result = evaluate(text, input.tape.scope, input.env).result;
  if (result.kind === 'value') return { kind: 'live', text: input.format(result.value, result.unit) };
  return result.kind === 'error' ? { kind: 'error', text: result.message } : 'keep';
}
