/** Memory (PRD §5): the variable `mem`, which the memory keys set and read. It is 0 until set. */
import { PRECISION, ZERO, isZero, sign, type Decimal } from './decimal.ts';
import type { Scope } from './evaluate.ts';
import { formatDecimal } from './format.ts';

export const MEMORY = 'mem';

export type MemoryOperation = 'clear' | 'add' | 'subtract';

/** The value of `mem` in `scope`: 0 until a line sets it. */
export function memoryValue(scope: Scope): Decimal {
  return scope.vars.get(MEMORY) ?? ZERO;
}

/** True while `mem` isn't 0: the display shows "M" (PRD §9.1). */
export function memorySet(scope: Scope): boolean {
  return !isZero(memoryValue(scope));
}

/**
 * The line a memory key commits: MC `mem = 0`, M+ `mem = mem + <value>`, M− `mem = mem - <value>`. The value is
 * written with every digit, so memory holds the exact result, and a negative one is in parentheses.
 */
export function memoryLine(operation: MemoryOperation, value: Decimal = ZERO): string {
  if (operation === 'clear') return `${MEMORY} = 0`;
  const text = formatDecimal(value, { digits: PRECISION });
  const operand = sign(value) < 0 ? `(${text})` : text;
  return `${MEMORY} = ${MEMORY} ${operation === 'add' ? '+' : '-'} ${operand}`;
}
