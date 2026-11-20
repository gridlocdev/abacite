import { describe, expect, it } from 'vitest';
import { MemoryFolder, SessionLibrary, checkSessionName, copyName, freeName } from '../src/index.ts';

describe('session names (PRD §8.2)', () => {
  it('takes a name with or without .txt, and refuses ones a file system can’t hold', () => {
    expect(checkSessionName('  Groceries.txt ')).toEqual({ name: 'Groceries' });
    for (const bad of ['', '.hidden', 'a/b', 'a:b', 'tab\there', 'x'.repeat(201)])
      expect(checkSessionName(bad)).toHaveProperty('error');
  });

  it('finds a free name, ignoring case', () => {
    expect(freeName('Session', [])).toBe('Session');
    expect(freeName('Session', ['session', 'Session 2'])).toBe('Session 3');
  });

  it('names a copy after the time it was made', () => {
    expect(copyName('Rent', new Date(2026, 0, 2, 3, 4, 5))).toBe('Rent copy 2026-01-02-030405');
  });

  it('lists only .txt files, not the trash', async () => {
    const sessions = new SessionLibrary(
      new MemoryFolder('m', { 'b.txt': '', 'A.txt': '', 'notes.md': '', '.abacite/trash/c.txt': '' }),
    );
    expect(await sessions.names()).toEqual(['A', 'b']);
    expect(await sessions.trashed()).toEqual(['c']);
  });
});
