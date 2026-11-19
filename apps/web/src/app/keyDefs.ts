/** The Basic and Scientific keypads (PRD §9.2): what each key shows, is called and does. */

export type KeyAction =
  | { readonly type: 'insert'; readonly text: string }
  | { readonly type: 'call'; readonly name: string }
  | { readonly type: 'wrap'; readonly prefix: string; readonly suffix: string }
  | { readonly type: 'commit' | 'clear' | 'negate' | 'backspace' | 'second' | 'angle' };

export type KeyKind = 'digit' | 'op' | 'fn' | 'util';

export interface KeyDef {
  readonly id: string;
  readonly label: string;
  /** The accessible name ("Square root"). */
  readonly name: string;
  readonly kind: KeyKind;
  readonly action: KeyAction;
  /** What to type for the same thing, shown on hover. */
  readonly hint?: string;
  /** Takes two columns (`0`). */
  readonly wide?: boolean;
  /** What the key becomes while 2nd is on. */
  readonly second?: Omit<KeyDef, 'second' | 'kind'>;
}

const insert = (text: string): KeyAction => ({ type: 'insert', text });
const call = (name: string): KeyAction => ({ type: 'call', name });

const digit = (d: string): KeyDef => ({
  id: `d${d}`,
  label: d,
  name: d,
  kind: 'digit',
  action: insert(d),
  hint: d,
});

const op = (id: string, label: string, name: string, text: string, hint = text): KeyDef => ({
  id,
  label,
  name,
  kind: 'op',
  action: insert(text),
  hint,
});

/** The Basic keypad, row by row; the first row is the narrow one (PRD §9.2). */
export const BASIC_ROWS: readonly (readonly KeyDef[])[] = [
  [
    { id: 'open', label: '(', name: 'Open parenthesis', kind: 'util', action: insert('('), hint: '(' },
    { id: 'close', label: ')', name: 'Close parenthesis', kind: 'util', action: insert(')'), hint: ')' },
    {
      id: 'back',
      label: '⌫',
      name: 'Delete',
      kind: 'util',
      action: { type: 'backspace' },
      hint: 'Backspace',
      wide: true,
    },
  ],
  [
    { id: 'clear', label: 'AC', name: 'All clear', kind: 'util', action: { type: 'clear' }, hint: 'Esc' },
    { id: 'negate', label: '±', name: 'Change sign', kind: 'util', action: { type: 'negate' } },
    { id: 'percent', label: '%', name: 'Percent', kind: 'util', action: insert('%'), hint: '%' },
    op('divide', '÷', 'Divide', '/'),
  ],
  [digit('7'), digit('8'), digit('9'), op('multiply', '×', 'Multiply', '*')],
  [digit('4'), digit('5'), digit('6'), op('subtract', '−', 'Subtract', '-')],
  [digit('1'), digit('2'), digit('3'), op('add', '+', 'Add', '+')],
  [
    { ...digit('0'), wide: true },
    { id: 'point', label: '.', name: 'Decimal point', kind: 'digit', action: insert('.'), hint: '.' },
    { id: 'equals', label: '=', name: 'Equals', kind: 'op', action: { type: 'commit' }, hint: 'Enter' },
  ],
];

const fn = (
  id: string,
  label: string,
  name: string,
  action: KeyAction,
  hint?: string,
  second?: KeyDef['second'],
): KeyDef => ({
  id,
  label,
  name,
  kind: 'fn',
  action,
  ...(hint ? { hint } : {}),
  ...(second ? { second } : {}),
});

/** The Scientific block to the left of the Basic keys (PRD §9.2). Memory keys join it in a later version. */
export const SCIENTIFIC_ROWS: readonly (readonly KeyDef[])[] = [
  [
    fn('second', '2nd', 'Second functions', { type: 'second' }),
    fn('square', 'x²', 'Square', insert('^2'), '^2'),
    fn('cube', 'x³', 'Cube', insert('^3'), '^3'),
    fn('power', 'xʸ', 'Power', insert('^'), '^'),
    fn('exp', 'eˣ', 'e to the power', call('exp'), 'exp(', {
      id: 'pow2',
      label: '2ˣ',
      name: 'Two to the power',
      action: insert('2^'),
      hint: '2^',
    }),
    fn('pow10', '10ˣ', 'Ten to the power', insert('10^'), '10^'),
  ],
  [
    fn('reciprocal', '1/x', 'Reciprocal', { type: 'wrap', prefix: '1/(', suffix: ')' }),
    fn('sqrt', '√x', 'Square root', call('sqrt'), 'sqrt('),
    fn('cbrt', '∛x', 'Cube root', call('cbrt'), 'cbrt('),
    fn('root', 'ʸ√x', 'Root', call('root'), 'root(x, n)'),
    fn('ln', 'ln', 'Natural logarithm', call('ln'), 'ln(', {
      id: 'log2',
      label: 'log₂',
      name: 'Logarithm base 2',
      action: call('log2'),
      hint: 'log2(',
    }),
    fn('log', 'log₁₀', 'Logarithm base 10', call('log'), 'log('),
  ],
  [
    fn('factorial', 'x!', 'Factorial', insert('!'), '!'),
    ...(['sin', 'cos', 'tan'] as const).map((t) =>
      fn(t, t, { sin: 'Sine', cos: 'Cosine', tan: 'Tangent' }[t], call(t), `${t}(`, {
        id: `a${t}`,
        label: `${t}⁻¹`,
        name: { sin: 'Arcsine', cos: 'Arccosine', tan: 'Arctangent' }[t],
        action: call(`a${t}`),
        hint: `a${t}(`,
      }),
    ),
    fn('e', 'e', 'Euler’s number', insert('e'), 'e'),
    fn('ee', 'EE', 'Times ten to the power', insert('e'), 'e'),
  ],
  [
    fn('angle', 'Rad', 'Switch to radians', { type: 'angle' }),
    ...(['sinh', 'cosh', 'tanh'] as const).map((t) =>
      fn(
        t,
        t,
        { sinh: 'Hyperbolic sine', cosh: 'Hyperbolic cosine', tanh: 'Hyperbolic tangent' }[t],
        call(t),
        `${t}(`,
        {
          id: `a${t}`,
          label: `${t}⁻¹`,
          name: {
            sinh: 'Inverse hyperbolic sine',
            cosh: 'Inverse hyperbolic cosine',
            tanh: 'Inverse hyperbolic tangent',
          }[t],
          action: call(`a${t}`),
          hint: `a${t}(`,
        },
      ),
    ),
    fn('pi', 'π', 'Pi', insert('π'), 'pi'),
    fn('rand', 'Rand', 'Random number', insert('rand()'), 'rand()'),
  ],
];

/** Every key, for tests. */
export const ALL_KEYS: readonly KeyDef[] = [...BASIC_ROWS, ...SCIENTIFIC_ROWS].flat();
