import { FUNCTION_NAMES } from '@abacite/core';
import { describe, expect, it } from 'vitest';
import { ALL_KEYS, BASIC_ROWS, SCIENTIFIC_ROWS } from '../src/index.ts';

describe('keypads', () => {
  it('give every key a unique id and an accessible name', () => {
    const ids = [...ALL_KEYS, ...ALL_KEYS.flatMap((k) => (k.second ? [k.second] : []))].map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const k of ALL_KEYS) expect(k.name.length).toBeGreaterThan(0);
  });

  it('fill whole rows: 4 columns for Basic, 6 for Scientific', () => {
    const width = (row: readonly { wide?: boolean }[]) => row.reduce((n, k) => n + (k.wide ? 2 : 1), 0);
    for (const row of BASIC_ROWS) expect(width(row)).toBe(4);
    for (const row of SCIENTIFIC_ROWS) expect(width(row)).toBe(6);
  });

  it('only call functions the engine has', () => {
    const calls = [...ALL_KEYS, ...ALL_KEYS.flatMap((k) => (k.second ? [k.second] : []))].flatMap((k) =>
      k.action.type === 'call' ? [k.action.name] : [],
    );
    for (const name of calls) expect(FUNCTION_NAMES.has(name), name).toBe(true);
  });
});
