import { HandleFolder, MemoryFolder } from '../src/index.ts';
import { FakeDirectory } from './fakeDirectory.ts';
import { folderContract } from './folderContract.ts';

folderContract('memory', () => Promise.resolve(new MemoryFolder()));
folderContract('file handle', () =>
  Promise.resolve(
    new HandleFolder(new FakeDirectory('Tapes') as unknown as FileSystemDirectoryHandle, 'Tapes'),
  ),
);
