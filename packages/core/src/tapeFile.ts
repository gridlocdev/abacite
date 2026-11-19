/**
 * The tape file format (PRD §8.1): one calculation per line, the input then two spaces and a result comment
 * (`x = 5 * 3  # = 15`). Results are written for people and ignored on reading, where the tape is evaluated
 * again; only the values `rand()` gave are kept.
 */
import { PRECISION, eq, parseDecimal, type Decimal } from './decimal.ts';
import { CalcError } from './errors.ts';
import { type Env } from './evaluate.ts';
import { formatDecimal } from './format.ts';
import { evaluateTape, type Tape, type TapeLine } from './tape.ts';

export type TapeAngle = Env['angle'];

/** A line as read from a file: what was typed, and the values its `rand()` calls gave. */
export interface TapeFileLine {
  readonly input: string;
  readonly randoms: readonly Decimal[];
}

export interface TapeFile {
  /** The angle unit the tape is evaluated in: degrees unless the file's first line says radians. */
  readonly angle: TapeAngle;
  readonly lines: readonly TapeFileLine[];
}

/** The first line of a tape in radians. */
export const RADIANS_HEADER = '# abacite: angle=rad';

const RESULT = '  # = ';
const ERROR = '  # error: ';
/** The end of a result comment for a line that called `rand()`: `(rand)`, or `(rand 0.25 0.5)`. */
const RAND = / {2}\(rand((?: [^ )]+)*)\)$/;

/** A number written in the file, or null when it isn't one we can read. */
function readNumber(text: string): Decimal | null {
  try {
    return parseDecimal(text);
  } catch (error) {
    if (error instanceof CalcError) return null;
    throw error;
  }
}

/** The `rand()` values a result comment keeps, or none. */
function readRandoms(comment: string): Decimal[] {
  const match = RAND.exec(comment);
  if (!match) return [];
  // `(rand)` alone: the line's result is the one value drawn.
  const texts = match[1]!.trim()
    ? match[1]!.trim().split(' ')
    : [comment.slice(RESULT.length, match.index).trim()];
  const values = texts.map(readNumber);
  return values.every((v) => v !== null) ? (values as Decimal[]) : [];
}

function readLine(row: string): TapeFileLine {
  // Blank lines and `#` lines are notes, kept as they are.
  if (!row.trim() || row.trimStart().startsWith('#')) return { input: row, randoms: [] };
  const at = Math.max(row.lastIndexOf(RESULT), row.lastIndexOf(ERROR));
  if (at < 0) return { input: row, randoms: [] };
  const comment = row.slice(at);
  return { input: row.slice(0, at), randoms: comment.startsWith(RESULT) ? readRandoms(comment) : [] };
}

/** Reads a tape file's text; LF or CRLF. */
export function parseTapeText(text: string): TapeFile {
  const rows = text.split(/\r?\n/);
  if (rows.at(-1) === '') rows.pop();
  const radians = rows[0]?.trim() === RADIANS_HEADER;
  if (radians) rows.shift();
  return { angle: radians ? 'rad' : 'deg', lines: rows.map(readLine) };
}

/** Reads a tape file and evaluates it from the top (PRD §7.2), in the file's angle unit. */
export function readTape(text: string, env: Env): { tape: Tape; angle: TapeAngle } {
  const file = parseTapeText(text);
  return { tape: evaluateTape(file.lines, { ...env, angle: file.angle }), angle: file.angle };
}

/** A tape line as written: the input, then its result with all 34 digits, ungrouped. */
export function writeLine(line: TapeLine): string {
  const r = line.result;
  if (r.kind === 'empty') return line.input;
  if (r.kind === 'error') return `${line.input}${ERROR}${r.message}`;
  const text = `${line.input}${RESULT}${formatDecimal(r.value, { digits: PRECISION })}${r.unit ? ` ${r.unit}` : ''}`;
  if (!line.randoms.length) return text;
  const only = line.randoms.length === 1 && !r.unit && eq(line.randoms[0]!, r.value);
  const values = line.randoms.map((v) => formatDecimal(v, { digits: PRECISION })).join(' ');
  return `${text}  (rand${only ? '' : ` ${values}`})`;
}

/** The file's text for a tape: LF line endings, each line ending in one. */
export function writeTapeText(tape: Tape, angle: TapeAngle): string {
  const rows = angle === 'rad' ? [RADIANS_HEADER] : [];
  for (const line of tape.lines) rows.push(writeLine(line));
  return rows.map((row) => `${row}\n`).join('');
}
