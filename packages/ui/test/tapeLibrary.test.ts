import { describe, expect, it } from 'vitest';
import { MemoryFolder, TapeLibrary, checkTapeName, copyName, freeName } from '../src/index.ts';

describe('tape names (PRD §8.2)', () => {
  it('takes a name with or without .txt, and refuses ones a file system can’t hold', () => {
    expect(checkTapeName('  Groceries.txt ')).toEqual({ name: 'Groceries' });
    for (const bad of ['', '.hidden', 'a/b', 'a:b', 'tab\there', 'x'.repeat(201)])
      expect(checkTapeName(bad)).toHaveProperty('error');
  });

  it('finds a free name, ignoring case', () => {
    expect(freeName('Tape', [])).toBe('Tape');
    expect(freeName('Tape', ['tape', 'Tape 2'])).toBe('Tape 3');
  });

  it('names a copy after the time it was made', () => {
    expect(copyName('Rent', new Date(2026, 0, 2, 3, 4, 5))).toBe('Rent copy 2026-01-02-030405');
  });

  it('lists only .txt files, not the trash', async () => {
    const tapes = new TapeLibrary(
      new MemoryFolder('m', { 'b.txt': '', 'A.txt': '', 'notes.md': '', '.abacite/trash/c.txt': '' }),
    );
    expect(await tapes.names()).toEqual(['A', 'b']);
    expect(await tapes.trashed()).toEqual(['c']);
  });
});
