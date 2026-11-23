import { describe, expect, it } from 'vitest';
import { NO_FOLDER_IN_BROWSER, browserPlatform, type BrowserPickers } from '../src/index.ts';
import { enter, makeFolderApp } from './helpers.ts';

/** A file as the `webkitdirectory` input gives it: its path starts with the picked folder's name. */
const picked = (relativePath: string, text: string): File => {
  const file = new File([text], relativePath.split('/').at(-1)!);
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
  return file;
};

const FILES = [picked('Sessions/Sums.txt', '1 + 2  # = 3\n'), picked('Sessions/Rent.txt', 'rent = 1450\n')];

/** The app in a browser without `showDirectoryPicker`, where the file input picks `files`. */
async function inFirefox(files: File[] | null = FILES) {
  const pickers: BrowserPickers = { folder: false, files: () => Promise.resolve(files) };
  const made = makeFolderApp(undefined, browserPlatform(pickers));
  await made.folders.start();
  return made;
}

const enabled = (made: Awaited<ReturnType<typeof inFirefox>>, id: string) =>
  made.catalog.isEnabled(made.catalog.get(id)!);

describe('a folder picked with the file input (PRD §8.2)', () => {
  it('starts in the browser’s storage, and opens a picked folder read-only', async () => {
    const made = await inFirefox();
    expect(made.folders.current.value?.folder.label).toBe('this browser');
    await made.folders.choose();
    const current = made.folders.current.value!;
    expect(current.readOnly).toBe(true);
    expect(current.names.value).toEqual(['Rent', 'Sums']);
    expect(made.app.notice.value?.text).toBe(
      'Opened Sessions read-only. New lines aren’t saved; Export Session keeps a copy.',
    );
  });

  it('disables every command that writes, with the reason, and keeps the rest', async () => {
    const made = await inFirefox();
    await made.folders.choose();
    for (const id of ['file.new', 'file.rename', 'file.delete', 'file.trash']) {
      expect(enabled(made, id), id).toBe(false);
      expect(made.catalog.whyDisabled(made.catalog.get(id)!)).toBe(
        'Sessions is read-only in this browser. The Abacite desktop app can change it.',
      );
    }
    for (const id of ['file.open', 'file.folder', 'file.export', 'file.browserStorage'])
      expect(enabled(made, id), id).toBe(true);
  });

  it('keeps new lines in memory for each session, and never writes', async () => {
    const made = await inFirefox();
    await made.folders.choose();
    const current = made.folders.current.value!;
    await current.open('Sums');
    enter(made.app, '4 * 5');
    await current.flush();
    expect(current.state.value).toBe('saved');
    expect(current.hasHeldLines()).toBe(true);
    await current.open('Rent');
    expect(made.app.session.value.lines.map((l) => l.input)).toEqual(['rent = 1450']);
    await current.open('Sums');
    expect(made.app.session.value.lines.map((l) => l.input)).toEqual(['1 + 2', '4 * 5']);
    expect(await FILES[0]!.text()).toBe('1 + 2  # = 3\n');
  });

  it('a cancelled pick, or a folder with no sessions, keeps the open session', async () => {
    const cancelled = await inFirefox(null);
    const before = cancelled.folders.current.value;
    await cancelled.folders.choose();
    expect(cancelled.folders.current.value).toBe(before);

    const empty = await inFirefox([picked('Photos/cat.jpg', 'x')]);
    const storage = empty.folders.current.value;
    await empty.folders.choose();
    expect(empty.folders.current.value).toBe(storage);
    expect(empty.app.notice.value?.text).toBe(
      'Couldn’t open the folder: Photos has no sessions (.txt files).',
    );
  });

  it('without either picker, Open Session Folder… says the desktop app can', async () => {
    const pickers: BrowserPickers = { folder: false, files: null };
    const made = makeFolderApp(undefined, browserPlatform(pickers));
    await made.folders.start();
    const command = made.catalog.get('file.folder')!;
    expect(made.catalog.isEnabled(command)).toBe(false);
    expect(made.catalog.whyDisabled(command)).toBe(NO_FOLDER_IN_BROWSER);
    expect(made.catalog.get('file.browserStorage')).toBe(undefined);
  });
});
