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

const NUMBER_CHAR = /[0-9._]/;

/** The number the cursor is in or just after, as [start, end), or null. */
function numberAt(text: string, cursor: number): [number, number] | null {
  let start = cursor;
  while (start > 0 && NUMBER_CHAR.test(text[start - 1]!)) start--;
  let end = cursor;
  while (end < text.length && NUMBER_CHAR.test(text[end]!)) end++;
  return start === end ? null : [start, end];
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
    .replace(/(\d)[,\u00a0\u2009\u202f ](?=\d{3}(?!\d))/g, '$1')
    .trim();
}
