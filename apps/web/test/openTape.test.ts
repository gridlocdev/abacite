import { describe, expect, it } from 'vitest';
import { MemoryFolder, type FileRead, type Folder } from '@abacite/ui';
import { OpenTape } from '../src/index.ts';
import { enter, makeApp, memoryKeep } from './helpers.ts';

const NOW = new Date(2026, 10, 19, 14, 5, 9);

async function startOpenTape(
  files: Record<string, string> = {},
  folder: Folder = new MemoryFolder('m', files),
) {
  const made = makeApp({ showTape: true });
  const { keep, map } = memoryKeep();
  const current = new OpenTape({ app: made.app, folder, key: 'm', keep, now: () => NOW, retries: [0, 0] });
  await current.start();
  return { ...made, current, keep, map, folder };
}

const disk = (folder: Folder) => (folder as MemoryFolder).files;

describe('the open tape (PRD §8.2)', () => {
  it('gives an empty folder one tape, Tape.txt, and saves each change at once', async () => {
    const { app, current, folder } = await startOpenTape();
    expect(current.name.value).toBe('Tape');
    expect(disk(folder).get('Tape.txt')).toBe('');
    enter(app, '1 + 1');
    await current.flush();
    expect(disk(folder).get('Tape.txt')).toBe('1 + 1  # = 2\n');
    expect(current.state.value).toBe('saved');
  });

  it('reopens the tape last open in the folder, else the first', async () => {
    const files = { 'A.txt': '1\n', 'B.txt': '2\n' };
    const first = await startOpenTape(files);
    expect(first.current.name.value).toBe('A');
    const { keep } = memoryKeep();
    keep.setLastTape('m', 'B');
    const made = makeApp();
    const current = new OpenTape({ app: made.app, folder: new MemoryFolder('m', files), key: 'm', keep });
    await current.start();
    expect(current.name.value).toBe('B');
    expect(made.app.tape.value.lines[0]?.input).toBe('2');
  });

  it('leaves a hand-written file as it is until the tape changes', async () => {
    const { app, current, folder } = await startOpenTape({ 'Tape.txt': '2 * 3\n' });
    expect(app.tape.value.lines[0]?.result).toMatchObject({ kind: 'value' });
    await current.flush();
    expect(disk(folder).get('Tape.txt')).toBe('2 * 3\n');
    enter(app, '+ 1');
    await current.flush();
    expect(disk(folder).get('Tape.txt')).toBe('2 * 3  # = 6\n+ 1  # = 7\n');
  });

  it('writes the angle unit into the file, and opening a tape takes its unit', async () => {
    const { app, current, folder } = await startOpenTape({ 'Tape.txt': '# abacite: angle=rad\nsin(pi/2)\n' });
    expect(app.settings.value.angle).toBe('rad');
    app.toggleAngle();
    await current.flush();
    expect(disk(folder).get('Tape.txt')).toMatch(/^sin\(pi\/2\) {2}# = 0\.0274/);
  });

  it('never runs two saves at once, and saves a change made during a save right after it', async () => {
    const inner = new MemoryFolder('m');
    let running = 0;
    let most = 0;
    const slow: Folder = {
      label: 'slow',
      list: (d) => inner.list(d),
      read: (p): Promise<FileRead | null> => inner.read(p),
      move: (a, b) => inner.move(a, b),
      write: async (p, t, v) => {
        running++;
        most = Math.max(most, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
        return inner.write(p, t, v);
      },
    };
    const { app, current } = await startOpenTape({}, slow);
    enter(app, '1');
    enter(app, '2');
    enter(app, '3');
    await current.flush();
    expect(most).toBe(1);
    expect(inner.files.get('Tape.txt')).toBe('1  # = 1\n2  # = 2\n3  # = 3\n');
  });
});

describe('failed saves (PRD §8.3)', () => {
  it('retries twice, then shows the failure and keeps a snapshot until a save works', async () => {
    const inner = new MemoryFolder('m', { 'Tape.txt': '' });
    let failures = 3;
    const flaky: Folder = {
      label: 'flaky',
      list: (d) => inner.list(d),
      read: (p) => inner.read(p),
      move: (a, b) => inner.move(a, b),
      write: (p, t, v) => (failures-- > 0 ? Promise.reject(new Error('disk full')) : inner.write(p, t, v)),
    };
    const { app, current, keep } = await startOpenTape({}, flaky);
    enter(app, '7');
    await current.flush();
    expect(failures).toBe(0);
    expect(current.state.value).toBe('failed');
    expect(keep.snapshot('m', 'Tape')?.text).toBe('7  # = 7\n');
    await current.save();
    expect(current.state.value).toBe('saved');
    expect(inner.files.get('Tape.txt')).toBe('7  # = 7\n');
    expect(keep.snapshot('m', 'Tape')).toBeNull();
  });
});

describe('conflicts (PRD §8.3)', () => {
  async function conflicted() {
    const s = await startOpenTape({ 'Rent.txt': '100\n' });
    disk(s.folder).set('Rent.txt', '200\n');
    enter(s.app, '+ 1');
    await s.current.flush();
    return s;
  }

  it('stops saving and asks when the file changed somewhere else', async () => {
    const { app, current, folder } = await conflicted();
    expect(current.conflict.value).toEqual({ kind: 'changed', name: 'Rent' });
    expect(app.dialog.value).toBe('conflict');
    expect(disk(folder).get('Rent.txt')).toBe('200\n');
    enter(app, '+ 2');
    await current.flush();
    expect(disk(folder).get('Rent.txt')).toBe('200\n');
  });

  it('Save Mine as a Copy writes a dated copy and opens the file on disk', async () => {
    const { app, current, folder } = await conflicted();
    await current.saveMineAsCopy();
    expect(disk(folder).get('Rent copy 2026-11-19-140509.txt')).toBe('100  # = 100\n+ 1  # = 101\n');
    expect(app.tape.value.lines.map((l) => l.input)).toEqual(['200']);
    expect(current.conflict.value).toBeNull();
  });

  it('Keep Mine writes over the file', async () => {
    const { current, folder } = await conflicted();
    await current.keepMine();
    expect(disk(folder).get('Rent.txt')).toBe('100  # = 100\n+ 1  # = 101\n');
  });

  it('Use Theirs takes the file, and ⌘Z brings mine back', async () => {
    const { app, current, folder } = await conflicted();
    await current.useTheirs();
    expect(app.tape.value.lines.map((l) => l.input)).toEqual(['200']);
    app.stepTape('undo');
    await current.flush();
    expect(disk(folder).get('Rent.txt')).toBe('100  # = 100\n+ 1  # = 101\n');
  });

  it('a file deleted somewhere else asks the same', async () => {
    const s = await startOpenTape({ 'Rent.txt': '100\n' });
    disk(s.folder).delete('Rent.txt');
    enter(s.app, '+ 1');
    await s.current.flush();
    expect(s.current.conflict.value).toEqual({ kind: 'deleted', name: 'Rent' });
    await s.current.keepMine();
    expect(disk(s.folder).get('Rent.txt')).toBe('100  # = 100\n+ 1  # = 101\n');
  });
});

describe('changes made elsewhere (PRD §8.3)', () => {
  it('are picked up as one undo step when nothing is unsaved', async () => {
    const { app, current, folder } = await startOpenTape({ 'Tape.txt': '1\n' });
    disk(folder).set('Tape.txt', '1\n2\n');
    await current.check();
    expect(app.tape.value.lines.map((l) => l.input)).toEqual(['1', '2']);
    expect(app.notice.value?.text).toBe('Updated Tape with changes made elsewhere.');
    app.notice.value?.action?.run();
    expect(app.tape.value.lines.map((l) => l.input)).toEqual(['1']);
    await current.flush();
    expect(disk(folder).get('Tape.txt')).toBe('1  # = 1\n');
  });

  it('are not picked up while a save is pending', async () => {
    const { app, current, folder } = await startOpenTape({ 'Tape.txt': '1\n' });
    enter(app, '5');
    disk(folder).set('Tape.txt', 'elsewhere\n');
    await current.check();
    expect(app.tape.value.lines.map((l) => l.input)).toEqual(['1', '5']);
  });
});

describe('recovery (PRD §8.3)', () => {
  it('offers a snapshot that differs from the file, and Restore saves it', async () => {
    const { keep } = memoryKeep();
    keep.putSnapshot('m', 'Tape', { text: '1\n9\n', base: null, at: 1 });
    const { app } = makeApp();
    const folder = new MemoryFolder('m', { 'Tape.txt': '1\n' });
    const current = new OpenTape({ app, folder, key: 'm', keep });
    await current.start();
    expect(current.recovery.value?.name).toBe('Tape');
    expect(app.dialog.value).toBe('recovery');
    current.restore();
    await current.flush();
    expect(folder.files.get('Tape.txt')).toBe('1  # = 1\n9  # = 9\n');
    expect(keep.snapshot('m', 'Tape')).toBeNull();
  });

  it('Discard drops the snapshot', async () => {
    const { keep } = memoryKeep();
    keep.putSnapshot('m', 'Tape', { text: '9\n', base: null, at: 1 });
    const { app } = makeApp();
    const current = new OpenTape({
      app,
      folder: new MemoryFolder('m', { 'Tape.txt': '' }),
      key: 'm',
      keep,
    });
    await current.start();
    current.discard();
    expect(keep.snapshot('m', 'Tape')).toBeNull();
    expect(app.tape.value.lines).toEqual([]);
  });
});

describe('the folder’s tapes (PRD §8.2)', () => {
  it('New Tape, Rename and Delete with Undo', async () => {
    const { app, current, folder } = await startOpenTape();
    await current.newTape();
    expect(current.name.value).toBe('Tape 2');
    expect(await current.rename('Tape')).toBe('There’s already a tape called Tape.');
    expect(await current.rename('a/b')).toMatch(/can’t have/);
    expect(await current.rename('Groceries.txt')).toBeNull();
    expect(current.names.value).toEqual(['Groceries', 'Tape']);
    enter(app, '3');
    await current.trash();
    expect(current.name.value).toBe('Tape');
    expect(app.notice.value?.text).toBe('Moved Groceries to the trash.');
    expect(disk(folder).get('.abacite/trash/Groceries.txt')).toBe('3  # = 3\n');
    expect(app.notice.value?.action?.label).toBe('Undo');
    await current.restoreTrashed('Groceries');
    expect(current.name.value).toBe('Groceries');
    expect(app.tape.value.lines.map((l) => l.input)).toEqual(['3']);
  });

  it('deleting the last tape leaves a new one', async () => {
    const { current, folder } = await startOpenTape();
    await current.trash();
    expect(current.name.value).toBe('Tape');
    expect([...disk(folder).keys()].sort()).toEqual(['.abacite/trash/Tape.txt', 'Tape.txt']);
  });
});
