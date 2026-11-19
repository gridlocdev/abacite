// The behaviour every Folder has (PRD §8.3), run against each adapter.
import { describe, expect, it } from 'vitest';
import { StoreError, TapeLibrary, versionOf, type Folder } from '../src/index.ts';

const kind = (e: unknown) => (e instanceof StoreError ? e.kind : String(e));

export function folderContract(name: string, make: () => Promise<Folder>): void {
  describe(`${name} folder`, () => {
    it('writes new files, reads them with their version, and lists them', async () => {
      const folder = await make();
      expect(await folder.read('Tape.txt')).toBeNull();
      const version = await folder.write('Tape.txt', '1 + 1  # = 2\n', null);
      expect(version).toBe(await versionOf('1 + 1  # = 2\n'));
      expect(await folder.read('Tape.txt')).toEqual({ text: '1 + 1  # = 2\n', version });
      expect(await folder.list('')).toEqual(['Tape.txt']);
      expect(await folder.list('.abacite/trash')).toEqual([]);
    });

    it('refuses a write against a stale version, and a new file over an old one', async () => {
      const folder = await make();
      const first = await folder.write('Tape.txt', 'a\n', null);
      const second = await folder.write('Tape.txt', 'b\n', first);
      await expect(folder.write('Tape.txt', 'c\n', first).catch(kind)).resolves.toBe('conflict');
      await expect(folder.write('Tape.txt', 'c\n', null).catch(kind)).resolves.toBe('conflict');
      expect((await folder.read('Tape.txt'))?.text).toBe('b\n');
      expect(second).not.toBe(first);
    });

    it('lets only one of two writes from the same version through', async () => {
      const folder = await make();
      const v = await folder.write('Tape.txt', 'a\n', null);
      const results = await Promise.allSettled([
        folder.write('Tape.txt', 'b\n', v),
        folder.write('Tape.txt', 'c\n', v),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    });

    it('moves files into new folders, and refuses a taken or missing name', async () => {
      const folder = await make();
      await folder.write('A.txt', 'a\n', null);
      await folder.write('B.txt', 'b\n', null);
      await expect(folder.move('A.txt', 'B.txt').catch(kind)).resolves.toBe('exists');
      await folder.move('A.txt', '.abacite/trash/A.txt');
      expect(await folder.list('')).toEqual(['B.txt']);
      expect(await folder.list('.abacite/trash')).toEqual(['A.txt']);
      expect((await folder.read('.abacite/trash/A.txt'))?.text).toBe('a\n');
      await expect(folder.move('A.txt', 'C.txt').catch(kind)).resolves.toBe('missing');
    });

    it('refuses paths that leave the folder', async () => {
      const folder = await make();
      await expect(folder.read('../x.txt').catch(kind)).resolves.toBe('name');
      await expect(folder.write('a/../../x.txt', '', null).catch(kind)).resolves.toBe('name');
    });

    it('keeps tapes: new names, rename, trash and restore (PRD §8.2)', async () => {
      const tapes = new TapeLibrary(await make());
      expect((await tapes.create()).name).toBe('Tape');
      expect((await tapes.create()).name).toBe('Tape 2');
      await tapes.rename('Tape 2', 'Groceries');
      await expect(tapes.rename('Groceries', 'tape').catch(kind)).resolves.toBe('exists');
      await expect(tapes.rename('Groceries', 'a/b').catch(kind)).resolves.toBe('name');
      await tapes.rename('Groceries', 'groceries');
      expect(await tapes.names()).toEqual(['groceries', 'Tape']);
      expect(await tapes.trash('Tape')).toBe('Tape');
      await tapes.create();
      expect(await tapes.trash('Tape')).toBe('Tape 2');
      expect(await tapes.trashed()).toEqual(['Tape', 'Tape 2']);
      await tapes.create();
      expect(await tapes.restore('Tape')).toBe('Tape 2');
      expect(await tapes.names()).toEqual(['groceries', 'Tape', 'Tape 2']);
    });
  });
}
