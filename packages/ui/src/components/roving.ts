/**
 * Moving the focus inside a list, toolbar or radio group with the keyboard. The focused item lives in app state;
 * these work out the next one, and the DOM's focus follows (`useRovingFocus`).
 */

/** Where an arrow key, Home or End moves in a list of `count` items: `wrap` goes round at the ends. */
export function rovingStep(key: string, index: number, count: number, wrap = false): number | undefined {
  if (count === 0) return undefined;
  const step =
    key === 'ArrowDown' || key === 'ArrowRight' ? 1 : key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 0;
  if (step !== 0) {
    const next = index + step;
    return wrap ? (next + count) % count : Math.max(0, Math.min(count - 1, next));
  }
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return undefined;
}

/** A grid item: its id and how many columns it spans. */
export interface GridCell {
  readonly id: string;
  readonly span: number;
}

/**
 * Where an arrow key, Home or End moves in a grid of rows (a keypad). ← and → go along the row and on to the next
 * one; ↑ and ↓ go to the item in the row above or below that covers the same column; Home and End go to the
 * row's ends. The edges stop.
 */
export function gridStep(
  rows: readonly (readonly GridCell[])[],
  id: string,
  key: string,
): string | undefined {
  const flat = rows.flat();
  const at = flat.findIndex((c) => c.id === id);
  if (at < 0) return undefined;
  const r = rows.findIndex((row) => row.some((c) => c.id === id));
  const row = rows[r] ?? [];
  if (key === 'ArrowLeft') return flat[Math.max(0, at - 1)]?.id;
  if (key === 'ArrowRight') return flat[Math.min(flat.length - 1, at + 1)]?.id;
  if (key === 'Home') return row[0]?.id;
  if (key === 'End') return row.at(-1)?.id;
  if (key !== 'ArrowUp' && key !== 'ArrowDown') return undefined;
  const target = rows[key === 'ArrowUp' ? r - 1 : r + 1];
  if (!target) return id;
  const column = columnOf(row, id);
  let start = 0;
  for (const cell of target) {
    if (column < start + cell.span) return cell.id;
    start += cell.span;
  }
  return target.at(-1)?.id;
}

function columnOf(row: readonly GridCell[], id: string): number {
  let start = 0;
  for (const cell of row) {
    if (cell.id === id) return start;
    start += cell.span;
  }
  return 0;
}
