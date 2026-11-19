/** Names the language reserves (PRD §4.3, §4.4). Kept apart from their meanings so the parser needs no maths. */

export const FUNCTION_NAMES: ReadonlySet<string> = new Set([
  'sqrt',
  'cbrt',
  'root',
  'abs',
  'sign',
  'round',
  'floor',
  'ceil',
  'trunc',
  'exp',
  'ln',
  'log',
  'log2',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'fact',
  'min',
  'max',
  'rand',
]);

export const CONSTANT_NAMES: ReadonlySet<string> = new Set(['pi', 'π', 'e', 'tau', 'ans']);

/** Words that are operators or will be (`to` and `in` convert units, PRD §6). */
export const KEYWORDS: ReadonlySet<string> = new Set(['mod', 'to', 'in']);

/** True when `name` can't be assigned (PRD §4.3). */
export function isReserved(name: string): boolean {
  return FUNCTION_NAMES.has(name) || CONSTANT_NAMES.has(name) || KEYWORDS.has(name);
}
