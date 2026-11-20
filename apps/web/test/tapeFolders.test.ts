import { describe, expect, it, vi } from 'vitest';
import { MemoryFolder } from '@abacite/ui';
import { enter, makeFolderApp } from './helpers.ts';

const files = (f: unknown) => (f as MemoryFolder).files;

describe('tape folders (PRD §8.2)', () => {
  it('opens the folder the platform names and blocks commands until a tape is open', async () => {
    const folder = new MemoryFolder('Tapes', { 'Sums.txt': '1 + 2\n' });
    const { app, catalog, folders } = makeFolderApp({ folder, key: '/Tapes' });
    expect(catalog.run('view.tape')).toBeFalsy();
    expect(app.settings.value.showTape).toBe(true);
    await folders.start();
    expect(folders.current.value?.name.value).toBe('Sums');
    expect(app.tape.value.lines[0]?.input).toBe('1 + 2');
    catalog.run('view.tape');
    expect(app.settings.value.showTape).toBe(false);
  });

  it('asks on first start; the default answer opens Documents/Abacite and closes the question', async () => {
    const { app, folders, state } = makeFolderApp({ kind: 'first' });
    await folders.start();
    expect(app.dialog.value).toBe('folder');
    expect(folders.setup.value).toEqual({ kind: 'first' });
    await folders.useDefault();
    expect(app.dialog.value).toBe(null);
    expect(state.defaults).toEqual([true]);
    expect(files(state.fallback.folder).get('Tape.txt')).toBe('');
  });

  it('closing the question uses the default folder without remembering the choice', async () => {
    const { app, folders, state } = makeFolderApp({ kind: 'allow', name: 'Tapes' });
    await folders.start();
    folders.dismissSetup();
    await folders.current.value?.flush();
    await Promise.resolve();
    expect(state.defaults).toEqual([false]);
    expect(app.dialog.value).toBe(null);
  });

  it('a cancelled folder pick keeps the open tape, and on a missing folder asks again', async () => {
    const folder = new MemoryFolder('Tapes', {});
    const { folders } = makeFolderApp({ folder, key: '/Tapes' });
    await folders.start();
    const current = folders.current.value;
    await folders.choose();
    expect(folders.current.value).toBe(current);

    const lost = makeFolderApp({ kind: 'missing', folder: '/Volumes/USB/Tapes' });
    await lost.folders.start();
    await lost.folders.choose();
    expect(lost.app.dialog.value).toBe('folder');
    expect(lost.folders.setup.value).toEqual({ kind: 'missing', folder: '/Volumes/USB/Tapes' });
  });

  it('switching folders saves the old tape first and stops saving there', async () => {
    const old = new MemoryFolder('Old', {});
    const { app, folders, state } = makeFolderApp({ folder: old, key: '/Old' });
    await folders.start();
    enter(app, '2 + 2');
    const next = new MemoryFolder('New', { 'Other.txt': '7\n' });
    state.choice = { folder: next, key: '/New' };
    await folders.choose();
    expect(files(old).get('Tape.txt')).toBe('2 + 2  # = 4\n');
    expect(folders.current.value?.name.value).toBe('Other');
    enter(app, '* 2');
    await folders.current.value?.flush();
    expect(files(old).get('Tape.txt')).toBe('2 + 2  # = 4\n');
    expect(files(next).get('Other.txt')).toBe('7  # = 7\n* 2  # = 14\n');
  });
});

describe('the File commands (PRD §8.2)', () => {
  async function started() {
    const made = makeFolderApp({ folder: new MemoryFolder('Tapes', { 'Tape.txt': '3\n' }), key: '/T' });
    await made.folders.start();
    return made;
  }

  it('New Tape, Delete Tape and Open Trash', async () => {
    const { app, catalog, folders } = await started();
    const current = folders.current.value!;
    catalog.run('file.new');
    await vi.waitFor(() => expect(current.name.value).toBe('Tape 2'));
    catalog.run('file.delete');
    await vi.waitFor(() => expect(current.names.value).toEqual(['Tape']));
    catalog.run('file.trash');
    await vi.waitFor(() => expect(app.dialog.value).toBe('trash'));
    expect(current.trashed.value).toEqual(['Tape 2']);
  });

  it('Export Tape hands the tape text to the platform', async () => {
    const { app, catalog, state } = await started();
    catalog.run('file.export');
    await vi.waitFor(() => expect(state.exported.length).toBe(1));
    expect(state.exported).toEqual([['Tape', '3  # = 3\n']]);
    expect(app.notice.value?.text).toBe('Exported Tape.');
  });

  it('no other window replaces a conflict question', async () => {
    const { app, catalog } = await started();
    app.open('conflict');
    catalog.run('app.settings');
    catalog.run('file.open');
    expect(app.dialog.value).toBe('conflict');
  });
});
