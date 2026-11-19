/**
 * Classic entry (PRD §9.3): the keypad works like a pocket calculator. Keys build an ordinary expression
 * (`2 + 3 * 4`), so the engine evaluates it with its usual precedence and `=` puts it on the tape as typed.
 * Pure: the controller evaluates the texts this module gives it.
 */
import type { KeyDef } from './keyDefs.ts';

export interface ClassicState {
  /** Finished operands, operators and openers (`(`, `root(9,`), in order: `['2', '+', '3', '*']`. */
  readonly parts: readonly string[];
  /** The operand being typed or just worked out, or null right after an operator or `=`. */
  readonly entry: string | null;
  /** The entry is digits being typed, so a digit adds to it; otherwise a digit starts a new number. */
  readonly typing: boolean;
}

export const EMPTY_CLASSIC: ClassicState = { parts: [], entry: null, typing: false };

const PRECEDENCE: Readonly<Record<string, number>> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 };

const isOperator = (part: string): boolean => part in PRECEDENCE;
const isOpener = (part: string): boolean => part.endsWith('(') || part.endsWith(',');

/** True when nothing has been entered since the last `=`. */
export function classicEmpty(s: ClassicState): boolean {
  return s.parts.length === 0 && s.entry === null;
}

/** True when `text` from `open` is one bracketed group: its `(` closes at the very end. */
function wholeGroup(text: string, open: number): boolean {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i === text.length - 1;
  }
  return false;
}

/**
 * `text` as one operand: a number, name, call or bracketed group stays as it is; anything else, a negative
 * number included, goes in brackets, so `-5` then `x²` is `(-5)^2` and `1/9` then `^ 2` is `(1/9) ^ 2`.
 */
export function atomic(text: string): string {
  if (/^(?:[0-9.]+(?:e[+-]?[0-9]+)?|[A-Za-zπ_][A-Za-z0-9_]*)[!%]?$/.test(text)) return text;
  const call = /^[A-Za-z_][A-Za-z0-9_]*\(/.exec(text);
  if (call && wholeGroup(text, call[0].length - 1)) return text;
  if (text.startsWith('(') && wholeGroup(text, 0)) return text;
  return `(${text})`;
}

/** Joins parts into expression text, with no space after an opening bracket. */
function join(parts: readonly string[]): string {
  return parts.reduce(
    (text, part) => (!text ? part : text.endsWith('(') ? text + part : `${text} ${part}`),
    '',
  );
}

/** `left` is worked out before `right` when `left` comes first (`^` groups from the right). */
function bindsBefore(left: string, right: string): boolean {
  const l = PRECEDENCE[left]!;
  const r = PRECEDENCE[right]!;
  return l > r || (l === r && right !== '^');
}

/**
 * What the display shows after an operator: the part of the calculation already worked out, as macOS does.
 * After `2 + 3 ×` it is `3`; after `2 + 3 × 4 −` it is `2 + 3 * 4`. Null when there is nothing to show.
 */
export function classicSegment(s: ClassicState): string | null {
  const last = s.parts.at(-1);
  if (s.entry !== null || last === undefined || !isOperator(last)) return null;
  let i = s.parts.length - 2;
  while (i >= 2 && isOperator(s.parts[i - 1]!) && bindsBefore(s.parts[i - 1]!, last)) i -= 2;
  return join(s.parts.slice(i, -1));
}

/** The operand a function key works on: the entry, or what the display shows, or `start` (`ans` or `0`). */
function current(s: ClassicState, start: string): string {
  return s.entry ?? classicSegment(s) ?? start;
}

/** The whole calculation as expression text, or null when there is nothing to calculate. */
export function classicText(s: ClassicState): string | null {
  if (classicEmpty(s)) return null;
  if (s.entry !== null) {
    // A line starting with `-` would continue from `ans` (PRD §7.1).
    const entry = s.parts.length || s.entry.startsWith('-') ? atomic(s.entry) : s.entry;
    return join([...s.parts, entry]);
  }
  const segment = classicSegment(s);
  // `2 + =` is `2 + 2`, as on a pocket calculator.
  return segment === null ? join(s.parts) : join([...s.parts, atomic(segment)]);
}

/** The pending calculation shown in small text above the number: `2 + 3 ×`. */
export function classicPending(s: ClassicState): string {
  return join(s.parts)
    .replaceAll('*', '×')
    .replaceAll('/', '÷')
    .replace(/(?<=\s|^)-(?=\s|$)/g, '−');
}

/** An entry being typed, with commas in its whole part when `group` is on: `1,234.50`. */
export function formatEntry(entry: string, group: boolean): string {
  const match = /^(-?)([0-9]*)(\.?[0-9]*)$/.exec(entry);
  if (!match || !group) return entry;
  const [, sign, whole, fraction] = match;
  return `${sign}${whole!.replace(/\B(?=(?:[0-9]{3})+$)/g, ',')}${fraction}`;
}

function digit(s: ClassicState, d: string): ClassicState {
  if (!s.typing) return { ...s, entry: d === '.' ? '0.' : d, typing: true };
  const entry = s.entry!;
  if (d === '.') return /[.e]/.test(entry) ? s : { ...s, entry: `${entry}.` };
  if (entry === '0' || entry === '-0') return { ...s, entry: entry.slice(0, -1) + d };
  return { ...s, entry: entry + d };
}

function operator(s: ClassicState, op: string, start: string): ClassicState {
  // The sign of an exponent: `1e` then `−`.
  if (op === '-' && s.typing && s.entry!.endsWith('e')) return { ...s, entry: `${s.entry}-` };
  if (s.entry === null) {
    const last = s.parts.at(-1);
    if (last === undefined) return { parts: [start, op], entry: null, typing: false };
    if (isOperator(last)) return { ...s, parts: [...s.parts.slice(0, -1), op] };
    return s;
  }
  return { parts: [...s.parts, atomic(s.entry), op], entry: null, typing: false };
}

/** A function key works on the shown number at once (`9 √` → `3`, PRD §9.3). */
function apply(s: ClassicState, f: (x: string) => string, start: string): ClassicState {
  return { ...s, entry: f(current(s, start)), typing: false };
}

function open(s: ClassicState): ClassicState {
  // A bracket after a number multiplies it: `2 (` is `2 * (`.
  const parts = s.entry === null ? s.parts : [...s.parts, atomic(s.entry), '*'];
  return { parts: [...parts, '('], entry: null, typing: false };
}

function close(s: ClassicState): ClassicState {
  let i = s.parts.length - 1;
  while (i >= 0 && !isOpener(s.parts[i]!)) i--;
  if (i < 0) return s;
  const inner = s.parts.slice(i + 1);
  if (s.entry !== null) inner.push(atomic(s.entry));
  else if (inner.length && isOperator(inner.at(-1)!)) inner.pop();
  if (!inner.length) return s;
  const opener = s.parts[i]!;
  const entry = opener === '(' ? `(${join(inner)})` : `${opener} ${join(inner)})`;
  return { parts: s.parts.slice(0, i), entry, typing: false };
}

function negate(s: ClassicState, start: string): ClassicState {
  if (s.typing) {
    const entry = s.entry!;
    return { ...s, entry: entry.startsWith('-') ? entry.slice(1) : `-${entry}` };
  }
  const x = current(s, start);
  // `-5`, `-sqrt(9)` and `-(1/9)` lose their sign; anything else gains one.
  const positive = x.startsWith('-') && atomic(x.slice(1)) === x.slice(1) ? x.slice(1) : null;
  return { ...s, entry: positive ?? `-${atomic(x)}`, typing: false };
}

export function classicBackspace(s: ClassicState): ClassicState {
  if (!s.typing) return s;
  const entry = s.entry!.slice(0, -1);
  return { ...s, entry: entry === '' || entry === '-' ? '0' : entry };
}

/**
 * C clears the number being entered, then AC the whole calculation. Returns null when there is nothing to
 * clear, so the controller clears the last result (PRD §9.2).
 */
export function classicClear(s: ClassicState): ClassicState | null {
  if (s.entry !== null) return { ...s, entry: null, typing: false };
  return s.parts.length ? EMPTY_CLASSIC : null;
}

/** The text an insert key types (`^2`, `π`), or `` for any other key. */
function inserted(def: Pick<KeyDef, 'action'>): string {
  return def.action.type === 'insert' ? def.action.text : '';
}

/**
 * A key that edits the calculation: the new state, or null for a key the controller handles itself (`=`, C,
 * ⌫, 2nd, the angle and memory keys). `start` is the operand when there is none yet: `ans` after a result,
 * else `0`.
 */
export function classicKey(
  s: ClassicState,
  def: Omit<KeyDef, 'second' | 'kind'>,
  start: string,
): ClassicState | null {
  if (/^d[0-9]$/.test(def.id)) return digit(s, def.id.slice(1));
  switch (def.id) {
    case 'point':
      return digit(s, '.');
    case 'add':
    case 'subtract':
    case 'multiply':
    case 'divide':
    case 'power':
      return operator(s, inserted(def), start);
    case 'open':
    case 'sciOpen':
      return open(s);
    case 'close':
    case 'sciClose':
      return close(s);
    case 'ee':
      return s.typing && !/e/.test(s.entry!) ? { ...s, entry: `${s.entry}e` } : s;
    case 'e':
    case 'pi':
    case 'rand':
      return apply(s, () => inserted(def), start);
    case 'percent':
      return apply(s, (x) => `${atomic(x)}%`, start);
    case 'factorial':
      return apply(s, (x) => `${atomic(x)}!`, start);
    case 'square':
    case 'cube':
      return apply(s, (x) => `${atomic(x)}${inserted(def)}`, start);
    case 'pow2':
    case 'pow10':
      return apply(s, (x) => `${inserted(def)}${atomic(x)}`, start);
    case 'root':
      // ʸ√x takes a second number: `9 ʸ√ 2 =` is the square root of 9.
      return { parts: [...s.parts, `root(${current(s, start)},`], entry: null, typing: false };
  }
  const action = def.action;
  switch (action.type) {
    case 'call':
      return apply(s, (x) => `${action.name}(${x})`, start);
    case 'wrap':
      return apply(s, (x) => `${action.prefix}${x}${action.suffix}`, start);
    case 'negate':
      return negate(s, start);
    case 'insert':
    case 'commit':
    case 'clear':
    case 'backspace':
    case 'second':
    case 'angle':
    case 'memory':
      return null;
  }
}

/** The keypad key a typed character stands for in classic entry, by key id. */
const TYPED: Readonly<Record<string, string>> = {
  '.': 'point',
  ',': 'point',
  '+': 'add',
  '-': 'subtract',
  '−': 'subtract',
  '*': 'multiply',
  '×': 'multiply',
  '/': 'divide',
  '÷': 'divide',
  '^': 'power',
  '%': 'percent',
  '!': 'factorial',
  '(': 'open',
  ')': 'close',
  '=': 'equals',
  Backspace: 'back',
};

/** The id of the key `key` (a `KeyboardEvent.key`) presses, or null. */
export function typedKey(key: string): string | null {
  return /^[0-9]$/.test(key) ? `d${key}` : (TYPED[key] ?? null);
}
