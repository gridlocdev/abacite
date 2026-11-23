import { describe, expect, it } from 'vitest';
import {
  FileListFolder,
  HandleFolder,
  MemoryFolder,
  NativeFolder,
  StoreError,
  versionOf,
  type NativeReply,
} from '../src/index.ts';
import { FakeDirectory } from './fakeDirectory.ts';
import { folderContract } from './folderContract.ts';

folderContract('memory', () => Promise.resolve(new MemoryFolder()));
folderContract('file handle', () =>
  Promise.resolve(
    new HandleFolder(new FakeDirectory('Sessions') as unknown as FileSystemDirectoryHandle, 'Sessions'),
  ),
);

/** The desktop bridge, answered by a memory folder as the main process would answer. */
folderContract('desktop', () => {
  const disk = new MemoryFolder('disk');
  const call = async (op: string, args: readonly unknown[]): Promise<NativeReply> => {
    try {
      const [a, b, c] = args as [string, string, string | null];
      const value =
        op === 'list'
          ? await disk.list(a)
          : op === 'read'
            ? await disk.read(a)
            : op === 'write'
              ? await disk.write(a, b, c)
              : await disk.move(a, b);
      return { ok: true, value: value ?? null };
    } catch (e) {
      return { ok: false, kind: e instanceof StoreError ? e.kind : null, message: String(e) };
    }
  };
  return Promise.resolve(new NativeFolder(call, 'Abacite'));
});

/** A file as the `webkitdirectory` input gives it: its path starts with the picked folder's name. */
const picked = (relativePath: string, text: string): File => {
  const file = new File([text], relativePath.split('/').at(-1)!);
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
  return file;
};

describe('a folder picked with the file input (Firefox, Safari)', () => {
  const folder = new FileListFolder([
    picked('Sessions/Sums.txt', '1 + 2\n'),
    picked('Sessions/Rent.txt', 'rent = 1450\n'),
    picked('Sessions/old/2025.txt', '3\n'),
    picked('Sessions/.abacite/trash/Gone.txt', '4\n'),
    picked('Sessions/.DS_Store', 'x'),
    picked('Sessions/@eaDir/Sums.txt', 'thumb'),
  ]);

  it('is named for the picked folder and lists paths inside it, without hidden files', async () => {
    expect(folder.label).toBe('Sessions');
    expect(folder.readOnly).toBe(true);
    expect((await folder.list('')).sort()).toEqual(['Rent.txt', 'Sums.txt']);
    expect(await folder.list('old')).toEqual(['2025.txt']);
    expect(await folder.list('.abacite/trash')).toEqual([]);
  });

  it('reads a file with its version, and a missing one as null', async () => {
    const read = await folder.read('Sums.txt');
    expect(read).toEqual({ text: '1 + 2\n', version: await versionOf('1 + 2\n') });
    expect(await folder.read('Nope.txt')).toBe(null);
  });

  it('refuses every write as read-only, and changes nothing', async () => {
    await expect(folder.write('Sums.txt', '9\n', null)).rejects.toMatchObject({ kind: 'readonly' });
    await expect(folder.move('Sums.txt', 'Moved.txt')).rejects.toBeInstanceOf(StoreError);
    expect((await folder.read('Sums.txt'))?.text).toBe('1 + 2\n');
  });
});
