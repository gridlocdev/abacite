/** Editing the expression line from the keypad (PRD §9.2): pure functions over the text and its selection. */

export interface LineState {
  readonly text: string;
  /** Selection start and end; equal when nothing is selected (the cursor). */
  readonly start: number;
  readonly end: number;
}

export const EMPTY_LINE: LineState = { text: '', start: 0, end: 0 };

export const lineAt = (text: string, cursor = text.length): LineState => ({
  text,
  start: cursor,
  end: cursor,
});

const selected = (s: LineState) => s.text.slice(s.start, s.end);

/** Replaces the selection with `insert`, leaving the cursor after it. */
export function insertText(s: LineState, insert: string): LineState {
  const text = s.text.slice(0, s.start) + insert + s.text.slice(s.end);
  return lineAt(text, s.start + insert.length);
}

/** Puts `prefix` and `suffix` around the selection, or around the whole line when nothing is selected. */
export function wrap(s: LineState, prefix: string, suffix: string): LineState {
  if (s.start !== s.end) return insertText(s, prefix + selected(s) + suffix);
  if (!s.text.trim()) return insertText(s, prefix);
  return lineAt(prefix + s.text + suffix);
}

/** A function key: `sin(` at the cursor, or `sin(…)` around the selection. */
export function insertCall(s: LineState, name: string): LineState {
  return s.start !== s.end ? insertText(s, `${name}(${selected(s)})`) : insertText(s, `${name}(`);
}

/** Deletes the selection, or what is before the cursor: a whole `sin(` at once, else one character. */
export function backspace(s: LineState): LineState {
  if (s.start !== s.end) return insertText(s, '');
  if (s.start === 0) return s;
  const before = s.text.slice(0, s.start);
  const call = /[A-Za-z_][A-Za-z0-9_]*\($/.exec(before);
  const drop = call ? call[0].length : [...before].at(-1)!.length;
  return { text: before.slice(0, -drop) + s.text.slice(s.start), start: s.start - drop, end: s.start - drop };
}

/**
 * Number literals, exponent included (`2e5`, `1.5E-3`), but not digits that end a name (`r2`), which
 * belong to the name.
 */
const NUMBER_LITERAL =
  /(?<![A-Za-z0-9_.])(?:[0-9](?:_?[0-9])*(?:\.(?:[0-9](?:_?[0-9])*)?)?|\.[0-9](?:_?[0-9])*)(?:[eE][+-]?[0-9]+)?/g;

/** The number the cursor is in or just after, as [start, end), or null. */
function numberAt(text: string, cursor: number): [number, number] | null {
  for (const m of text.matchAll(NUMBER_LITERAL)) {
    const start = m.index;
    const end = start + m[0].length;
    if (start <= cursor && cursor <= end) return [start, end];
  }
  return null;
}

/** True when the `-` at `at` is a sign rather than subtraction: at the start, or after an operator or `(`. */
function isSign(text: string, at: number): boolean {
  const before = text.slice(0, at).trimEnd();
  return before === '' || /[-+*/^(,×÷−=]$/.test(before) || /\bmod$/.test(before);
}

/**
 * ±: flips the sign of the number at the cursor; outside a number, wraps the line as `-(…)` or takes that
 * wrapping off again (PRD §9.2).
 */
export function negate(s: LineState): LineState {
  const span = numberAt(s.text, s.end);
  if (span) {
    const [start] = span;
    const signAt = start - 1;
    if (signAt >= 0 && s.text[signAt] === '-' && isSign(s.text, signAt)) {
      const text = s.text.slice(0, signAt) + s.text.slice(start);
      return lineAt(text, Math.max(signAt, s.end - 1));
    }
    return lineAt(s.text.slice(0, start) + '-' + s.text.slice(start), s.end + 1);
  }
  if (!s.text.trim()) return insertText(s, '-');
  const wrapped = /^-\((.*)\)$/.exec(s.text);
  if (wrapped && balanced(wrapped[1]!)) return lineAt(wrapped[1]!);
  return lineAt(`-(${s.text})`);
}

/** True when the parentheses in `text` close in order. */
function balanced(text: string): boolean {
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth++;
    else if (ch === ')' && --depth < 0) return false;
  }
  return depth === 0;
}

/**
 * Pasted text, cleaned (PRD §10): grouping commas and spaces inside numbers go (`1,234,567` → `1234567`),
 * line breaks become spaces, and `×÷−` stay as they are.
 */
export function cleanPaste(text: string): string {
  return text
    .replace(/\r?\n/g, ' ')
    .replace(GROUPED, (run: string, separator: string, at: number, whole: string) =>
      // Inside parentheses a comma separates arguments: `max(1,234)` is two numbers.
      separator === ',' && depthAt(whole, at) > 0 ? run : run.replaceAll(separator, ''),
    )
    .trim();
}

/** A run of digits grouped in threes with one separator throughout: `1,234,567`, `12 345`. */
const GROUPED = /(?<![0-9.])[0-9]{1,3}([,\u00a0\u2009\u202f ])[0-9]{3}(?:\1[0-9]{3})*(?![0-9])/g;

/** How many parentheses are open before `at`. */
function depthAt(text: string, at: number): number {
  let depth = 0;
  for (const ch of text.slice(0, at)) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
  }
  return depth;
}

/** Where ↑/↓ is in the tape's inputs, and what was being typed before the first ↑ (PRD §7.1). */
export interface HistoryPlace {
  readonly index: number;
  readonly draft: string;
}

/**
 * One step of ↑ (`-1`) or ↓ (`1`) from `place`: the text the line shows and the new place, null at the end
 * of the walk once it is back at what was typed. Null when the key does nothing.
 */
export function stepHistory(
  lines: readonly { readonly input: string }[],
  place: HistoryPlace | null,
  typed: string,
  step: -1 | 1,
): { text: string; history: HistoryPlace | null } | null {
  if (step < 0) {
    const at = place ?? { index: lines.length, draft: typed };
    if (at.index === 0) return null;
    return { text: lines[at.index - 1]!.input, history: { index: at.index - 1, draft: at.draft } };
  }
  if (!place) return null;
  if (place.index + 1 >= lines.length) return { text: place.draft, history: null };
  return { text: lines[place.index + 1]!.input, history: { index: place.index + 1, draft: place.draft } };
}
