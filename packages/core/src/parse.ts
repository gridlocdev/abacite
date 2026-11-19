/**
 * Tokenizer and Pratt parser for one expression line (PRD §4.1). Positions count characters from 0; error
 * messages count from 1, as the user reads them.
 */
import { parseDecimal, type Decimal } from './decimal.ts';
import { CalcError } from './errors.ts';
import { FUNCTION_NAMES } from './names.ts';

export type BinaryOp = '+' | '-' | '*' | '/' | 'mod' | '^';

export type Node =
  | { readonly kind: 'number'; readonly value: Decimal; readonly at: number }
  /** `called`: the name came right before `(`, so an unknown name is an unknown function. */
  | { readonly kind: 'name'; readonly name: string; readonly at: number; readonly called: boolean }
  | { readonly kind: 'call'; readonly name: string; readonly args: readonly Node[]; readonly at: number }
  | { readonly kind: 'negate'; readonly arg: Node; readonly at: number }
  | { readonly kind: 'factorial' | 'percent'; readonly arg: Node; readonly at: number }
  | {
      readonly kind: 'binary';
      readonly op: BinaryOp;
      readonly left: Node;
      readonly right: Node;
      /** Where the operator starts, or null for implicit multiplication. */
      readonly at: number | null;
    };

export interface Statement {
  /** The variable this line assigns, or null. */
  readonly assign: string | null;
  readonly expr: Node;
  /** `)`s added because the line ended with parentheses still open (PRD §4.1). */
  readonly missingParens: number;
  /** The text of the expression, for "repeat the last operation" (PRD §7.1). */
  readonly source: string;
  /** Where `source` starts in the line. */
  readonly offset: number;
  /** The whole expression is in parentheses, `(5 + 3)`. */
  readonly grouped: boolean;
}

type TokenKind = 'number' | 'name' | 'op' | 'end';
interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly at: number;
  readonly value?: Decimal;
}

/** Characters typed or pasted that mean an ASCII operator. */
const OP_ALIASES: Readonly<Record<string, string>> = { '×': '*', '÷': '/', '−': '-', '·': '*' };
const SINGLE_OPS = new Set(['+', '-', '*', '/', '^', '(', ')', ',', '!', '%', '=']);

const NUMBER = /^(?:[0-9](?:_?[0-9])*(?:\.(?:[0-9](?:_?[0-9])*)?)?|\.[0-9](?:_?[0-9])*)(?:[eE][+-]?[0-9]+)?/;
const NAME = /^(?:π|[A-Za-z_][A-Za-z0-9_]*)/;

/** The line without its `#` comment. */
export function stripComment(line: string): string {
  const hash = line.indexOf('#');
  return hash < 0 ? line : line.slice(0, hash);
}

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const rest = text.slice(i);
    const number = NUMBER.exec(rest);
    if (number) {
      const literal = number[0];
      const value = parseDecimal(literal.replaceAll('_', ''));
      if (!value) throw new CalcError(`Unexpected \`${literal}\` at ${i + 1}.`, i);
      tokens.push({ kind: 'number', text: literal, at: i, value });
      i += literal.length;
      continue;
    }
    const name = NAME.exec(rest);
    if (name) {
      tokens.push({ kind: 'name', text: name[0], at: i });
      i += name[0].length;
      continue;
    }
    if (rest.startsWith('**')) {
      tokens.push({ kind: 'op', text: '^', at: i });
      i += 2;
      continue;
    }
    const op = OP_ALIASES[ch] ?? ch;
    if (SINGLE_OPS.has(op)) {
      tokens.push({ kind: 'op', text: op, at: i });
      i++;
      continue;
    }
    throw new CalcError(`Unexpected \`${ch}\` at ${i + 1}.`, i);
  }
  tokens.push({ kind: 'end', text: '', at: text.length });
  return tokens;
}

const describe = (t: Token) => (t.kind === 'end' ? 'the end' : `\`${t.text}\``);

class Parser {
  private i = 0;
  missingParens = 0;
  readonly grouped = new WeakSet<Node>();

  private readonly tokens: readonly Token[];

  constructor(tokens: readonly Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.i]!;
  }

  private next(): Token {
    return this.tokens[this.i++]!;
  }

  private isOp(text: string): boolean {
    const t = this.peek();
    return t.kind === 'op' && t.text === text;
  }

  private unexpected(t: Token): CalcError {
    if (t.kind === 'end') return new CalcError('The expression isn’t finished.', t.at, true);
    return new CalcError(`Unexpected ${describe(t)} at ${t.at + 1}.`, t.at);
  }

  /** The operand after an operator is missing. */
  private missingAfter(op: Token): CalcError {
    const t = this.peek();
    if (t.kind === 'end')
      return new CalcError(`Missing a number after \`${op.text}\` at ${op.at + 1}.`, t.at, true);
    return this.unexpected(t);
  }

  parseAll(): Node {
    const expr = this.additive();
    const t = this.peek();
    if (t.kind !== 'end') throw this.unexpected(t);
    return expr;
  }

  private additive(): Node {
    let left = this.multiplicative();
    for (;;) {
      const t = this.peek();
      if (t.kind !== 'op' || (t.text !== '+' && t.text !== '-')) return left;
      this.next();
      if (this.peek().kind === 'end') throw this.missingAfter(t);
      const right = this.multiplicative();
      left = { kind: 'binary', op: t.text, left, right, at: t.at };
    }
  }

  /** True when the next token starts an implicitly multiplied factor: a name or `(` (PRD §4.1). */
  private startsImplicit(): boolean {
    const t = this.peek();
    return (t.kind === 'name' && t.text !== 'mod') || (t.kind === 'op' && t.text === '(');
  }

  private multiplicative(): Node {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      const explicit =
        (t.kind === 'op' && (t.text === '*' || t.text === '/')) || (t.kind === 'name' && t.text === 'mod');
      if (explicit) {
        this.next();
        if (this.peek().kind === 'end') throw this.missingAfter(t);
        const op = t.text as BinaryOp;
        left = { kind: 'binary', op, left, right: this.unary(), at: t.at };
      } else if (this.startsImplicit()) {
        left = { kind: 'binary', op: '*', left, right: this.power(), at: null };
      } else {
        return left;
      }
    }
  }

  private unary(): Node {
    const t = this.peek();
    if (t.kind === 'op' && (t.text === '-' || t.text === '+')) {
      this.next();
      if (this.peek().kind === 'end') throw this.missingAfter(t);
      const arg = this.unary();
      return t.text === '-' ? { kind: 'negate', arg, at: t.at } : arg;
    }
    return this.power();
  }

  private power(): Node {
    const base = this.postfix();
    const t = this.peek();
    if (t.kind === 'op' && t.text === '^') {
      this.next();
      if (this.peek().kind === 'end') throw this.missingAfter(t);
      return { kind: 'binary', op: '^', left: base, right: this.unary(), at: t.at };
    }
    return base;
  }

  private postfix(): Node {
    let node = this.primary();
    for (;;) {
      const t = this.peek();
      if (t.kind === 'op' && t.text === '!') node = { kind: 'factorial', arg: node, at: t.at };
      else if (t.kind === 'op' && t.text === '%') node = { kind: 'percent', arg: node, at: t.at };
      else return node;
      this.next();
    }
  }

  /** Consumes `)`, or counts one that the end of the line closes. */
  private closeParen(): void {
    if (this.isOp(')')) {
      this.next();
      return;
    }
    const t = this.peek();
    if (t.kind !== 'end') throw this.unexpected(t);
    this.missingParens++;
  }

  private primary(): Node {
    const t = this.next();
    if (t.kind === 'number') {
      if (this.peek().kind === 'number') throw this.unexpected(this.peek());
      return { kind: 'number', value: t.value!, at: t.at };
    }
    if (t.kind === 'name') {
      if (t.text === 'mod') throw this.unexpected(t);
      if (FUNCTION_NAMES.has(t.text)) {
        if (!this.isOp('(')) {
          if (this.peek().kind === 'end')
            throw new CalcError(`Missing \`(\` after \`${t.text}\`.`, t.at, true);
          const at = this.peek().at;
          throw new CalcError(`Expected \`(\` after \`${t.text}\` at ${at + 1}.`, at);
        }
        this.next();
        const args: Node[] = [];
        if (!this.isOp(')') && this.peek().kind !== 'end') {
          args.push(this.additive());
          while (this.isOp(',')) {
            const comma = this.next();
            if (this.peek().kind === 'end') throw this.missingAfter(comma);
            args.push(this.additive());
          }
        }
        this.closeParen();
        return { kind: 'call', name: t.text, args, at: t.at };
      }
      return { kind: 'name', name: t.text, at: t.at, called: this.isOp('(') };
    }
    if (t.kind === 'op' && t.text === '(') {
      if (this.peek().kind === 'end') throw new CalcError('The expression isn’t finished.', t.at, true);
      const inner = this.additive();
      this.closeParen();
      this.grouped.add(inner);
      return inner;
    }
    this.i--;
    throw this.unexpected(t);
  }
}

/** Parses an expression (no assignment). */
export function parseExpression(text: string): { expr: Node; missingParens: number; grouped: boolean } {
  const parser = new Parser(tokenize(text));
  const expr = parser.parseAll();
  return { expr, missingParens: parser.missingParens, grouped: parser.grouped.has(expr) };
}

const ASSIGNMENT = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/;

/**
 * Parses a line: an optional `name =`, then an expression, then an optional comment. Returns null for a line
 * with nothing to evaluate.
 */
export function parseStatement(line: string): Statement | null {
  const text = stripComment(line);
  if (!text.trim()) return null;
  const assignment = ASSIGNMENT.exec(text);
  const offset = assignment ? assignment[0].length : 0;
  const source = text.slice(offset);
  if (!source.trim()) {
    throw new CalcError(`Missing a value after \`=\` at ${offset}.`, offset, true);
  }
  let parsed: ReturnType<typeof parseExpression>;
  try {
    parsed = parseExpression(source);
  } catch (error) {
    if (error instanceof CalcError && offset > 0) throw shift(error, offset);
    throw error;
  }
  return {
    assign: assignment ? assignment[1]! : null,
    expr: parsed.expr,
    missingParens: parsed.missingParens,
    source,
    offset,
    grouped: parsed.grouped,
  };
}

/** Moves an error's position (and the one in its message) by `offset` characters. */
function shift(error: CalcError, offset: number): CalcError {
  if (error.at === null) return error;
  const at = error.at + offset;
  const message = error.message.replace(/ at (\d+)\.$/, (_, n: string) => ` at ${Number(n) + offset}.`);
  return new CalcError(message, at, error.incomplete);
}
