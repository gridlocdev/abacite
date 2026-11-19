/** The tape: committed lines with their results, evaluated in order (PRD §7). */
import { type Decimal } from './decimal.ts';
import { CalcError } from './errors.ts';
import { EMPTY_SCOPE, evaluate, type Env, type Evaluation, type LineResult, type Scope } from './evaluate.ts';
import { parseStatement } from './parse.ts';

/** The most lines a tape keeps; committing more drops the oldest (PRD §7.1). */
export const MAX_TAPE_LINES = 10_000;

export interface TapeLine {
  /** What the user typed, as typed (without an `ans` added in front). */
  readonly input: string;
  readonly result: LineResult;
  /** Values `rand()` gave this line, replayed when the tape is evaluated again (PRD §7.2). */
  readonly randoms: readonly Decimal[];
}

export interface Tape {
  readonly lines: readonly TapeLine[];
  /** Variables and `ans` after the last line. */
  readonly scope: Scope;
  /** True once a line has been dropped at the limit, so the notice shows once (PRD §7.1). */
  readonly dropped: boolean;
}

export const EMPTY_TAPE: Tape = { lines: [], scope: EMPTY_SCOPE, dropped: false };

const ANS_PREFIX = 'ans ';
const LEADING_OPERATOR = /^\s*(?:\*\*|[+\-*/^%×÷−·]|mod\b)/;

/** True when the line starts with an operator, so it continues from `ans` (PRD §7.1). */
export function startsWithOperator(input: string): boolean {
  return LEADING_OPERATOR.test(input);
}

/** The text that is evaluated: `ans` in front of a leading operator once the tape has a result. */
export function expandInput(input: string, tape: Tape): string {
  return tape.lines.length > 0 && startsWithOperator(input) ? `${ANS_PREFIX}${input}` : input;
}

/**
 * The line Enter commits on an empty expression line: the last line's top-level operation applied to `ans`
 * (`5 + 3` → `ans + 3`), or null when it has none (PRD §7.1).
 */
export function repeatInput(tape: Tape): string | null {
  const last = tape.lines.at(-1);
  if (!last || last.result.kind !== 'value') return null;
  try {
    const statement = parseStatement(expandInput(last.input, { ...tape, lines: tape.lines.slice(0, -1) }));
    if (!statement || statement.grouped || statement.expr.kind !== 'binary' || statement.expr.at === null)
      return null;
    return `ans ${statement.source.slice(statement.expr.at).trim()}${')'.repeat(statement.missingParens)}`;
  } catch (error) {
    if (error instanceof CalcError) return null;
    throw error;
  }
}

/**
 * Evaluates a typed line after `lines` earlier lines. A leading operator continues from `ans`; an error's
 * position, and the one in its message, still count from what was typed.
 */
function evaluateTyped(input: string, lines: number, scope: Scope, env: Env): Evaluation {
  if (lines === 0 || !startsWithOperator(input)) return evaluate(input, scope, env);
  const evaluation = evaluate(`${ANS_PREFIX}${input}`, scope, env);
  const result = evaluation.result;
  if (result.kind !== 'error' || result.at === null) return evaluation;
  const at = Math.max(0, result.at - ANS_PREFIX.length);
  const message = result.message.replace(
    / at (\d+)\.$/,
    (_, n: string) => ` at ${Math.max(1, Number(n) - ANS_PREFIX.length)}.`,
  );
  return { ...evaluation, result: { ...result, at, message } };
}

/** Evaluates `input` as the tape's next line without committing it: the live result (PRD §9.1). */
export function preview(tape: Tape, input: string, env: Env): Evaluation {
  return evaluateTyped(input, tape.lines.length, tape.scope, env);
}

/** An env whose `rand()` replays `replay` first, then draws new values; `drawn` collects all of them. */
function recordingEnv(env: Env, replay: readonly Decimal[]): { env: Env; drawn: Decimal[] } {
  const drawn: Decimal[] = [];
  return {
    drawn,
    env: {
      ...env,
      random: () => {
        const value = replay[drawn.length] ?? env.random();
        drawn.push(value);
        return value;
      },
    },
  };
}

/** Adds a line to the tape. An empty line commits nothing. */
export function commit(tape: Tape, input: string, env: Env): Tape {
  if (!input.trim()) return tape;
  const recording = recordingEnv(env, []);
  const evaluation = evaluateTyped(input, tape.lines.length, tape.scope, recording.env);
  const line: TapeLine = { input, result: evaluation.result, randoms: recording.drawn };
  const lines = [...tape.lines, line];
  const over = lines.length > MAX_TAPE_LINES;
  return {
    lines: over ? lines.slice(lines.length - MAX_TAPE_LINES) : lines,
    scope: evaluation.scope,
    dropped: tape.dropped || over,
  };
}

/** Evaluates lines from the top, replaying their `rand()` values (PRD §7.2). */
export function evaluateTape(
  inputs: readonly { input: string; randoms?: readonly Decimal[] }[],
  env: Env,
): Tape {
  let scope = EMPTY_SCOPE;
  const lines: TapeLine[] = [];
  for (const { input, randoms = [] } of inputs) {
    const recording = recordingEnv(env, randoms);
    const evaluation = evaluateTyped(input, lines.length, scope, recording.env);
    lines.push({ input, result: evaluation.result, randoms: recording.drawn });
    scope = evaluation.scope;
  }
  return { lines, scope, dropped: false };
}
