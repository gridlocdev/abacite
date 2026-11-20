import { describe, expect, it } from 'vitest';
import { STORAGE_FOLDER, storageKeep } from '../src/index.ts';

const memory = () => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};

describe('what the browser keeps per folder (PRD §8.2, §8.3)', () => {
  it('remembers the open session for each folder', () => {
    const keep = storageKeep(memory());
    expect(keep.lastSession('a')).toBeNull();
    keep.setLastSession('a', 'Rent');
    keep.setLastSession('b', 'Session');
    expect(keep.lastSession('a')).toBe('Rent');
  });

  it('reads what was kept before sessions were renamed from tapes', () => {
    const storage = memory();
    storage.map.set('abacite.lastTape.a', 'Rent');
    expect(storageKeep(storage).lastSession('a')).toBe('Rent');
    expect(STORAGE_FOLDER).toBe('tapes');
  });

  it('keeps, reads and drops snapshots, and ignores damaged ones', () => {
    const storage = memory();
    const keep = storageKeep(storage);
    keep.putSnapshot('a', 'Rent', { text: '1\n', base: 'v1', at: 5 });
    expect(keep.snapshot('a', 'Rent')).toEqual({ text: '1\n', base: 'v1', at: 5 });
    expect(keep.snapshot('b', 'Rent')).toBeNull();
    keep.dropSnapshot('a', 'Rent');
    expect(keep.snapshot('a', 'Rent')).toBeNull();
    storage.map.set('abacite.snapshot.a/Rent', '{');
    expect(keep.snapshot('a', 'Rent')).toBeNull();
    storage.map.set('abacite.snapshot.a/Rent', '{"text":1}');
    expect(keep.snapshot('a', 'Rent')).toBeNull();
  });
});
