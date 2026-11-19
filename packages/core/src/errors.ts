/**
 * A mistake in what the user typed or asked for. Thrown only inside the engine, between the evaluator and the
 * arithmetic it calls; `evaluate` turns it into an error value (PRD §4.6), so nothing outside the engine catches it.
 */
export class CalcError extends Error {
  /** Character position (from 0) the message is about, or null. */
  readonly at: number | null;
  /** The input ended before the expression did (`2 +`): the line isn't finished yet, not wrong. */
  readonly incomplete: boolean;

  constructor(message: string, at: number | null = null, incomplete = false) {
    super(message);
    this.name = 'CalcError';
    this.at = at;
    this.incomplete = incomplete;
  }
}
