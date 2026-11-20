import { describe, expect, it } from 'vitest';
import {
  MemoryFolder,
  SessionLibrary,
  checkSessionName,
  copyName,
  freeName,
  sessionName,
} from '../src/index.ts';

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

  it('names a new session for when it was made, in a 12-hour clock with no colon', () => {
    expect(sessionName(new Date(2026, 10, 19, 14, 5, 9))).toBe('2026-11-19 at 2.05 PM');
    expect(sessionName(new Date(2026, 0, 2, 0, 4, 5))).toBe('2026-01-02 at 12.04 AM');
    expect(sessionName(new Date(2026, 0, 2, 12, 0, 5), true)).toBe('2026-01-02 at 12.00.05 PM');
    expect(checkSessionName(sessionName(new Date(), true))).toHaveProperty('name');
  });

  it('adds the seconds, then a number, to a new session from a minute that already has one', async () => {
    const sessions = new SessionLibrary(new MemoryFolder('m', {}));
    const at = new Date(2026, 10, 19, 14, 5, 9);
    expect((await sessions.createAt(at)).name).toBe('2026-11-19 at 2.05 PM');
    expect((await sessions.createAt(at)).name).toBe('2026-11-19 at 2.05.09 PM');
    expect((await sessions.createAt(at)).name).toBe('2026-11-19 at 2.05.09 PM 2');
  });

  it('lists only .txt files, not the trash', async () => {
    const sessions = new SessionLibrary(
      new MemoryFolder('m', { 'b.txt': '', 'A.txt': '', 'notes.md': '', '.abacite/trash/c.txt': '' }),
    );
    expect(await sessions.names()).toEqual(['A', 'b']);
    expect(await sessions.trashed()).toEqual(['c']);
  });
});
