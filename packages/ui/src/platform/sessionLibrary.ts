/**
 * The sessions in a folder (PRD §8.2): each `*.txt` directly in it is a session, named without the `.txt`. Deleted
 * sessions go to `.abacite/trash/`, where they can be restored.
 */
import { StoreError, type FileRead, type Folder } from './folder.ts';

export const TRASH = '.abacite/trash';
const EXT = '.txt';
/** The longest session name, so the file name fits every file system. */
const MAX_NAME = 200;

const file = (name: string) => `${name}${EXT}`;
const order = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** `name` cleaned up as a session name, or an error saying what's wrong with it. */
export function checkSessionName(name: string): { name: string } | { error: string } {
  const clean = name
    .trim()
    .replace(/\.txt$/i, '')
    .trim();
  if (!clean) return { error: 'A session needs a name.' };
  if (/[/\\:*?"<>|]/.test(clean) || [...clean].some((c) => c.charCodeAt(0) < 32))
    return { error: 'A session name can’t have / \\ : * ? " < > or |.' };
  if (clean.startsWith('.')) return { error: 'A session name can’t start with a dot.' };
  if (clean.length > MAX_NAME) return { error: `A session name can have up to ${MAX_NAME} characters.` };
  return { name: clean };
}

/** `base`, or `base 2`, `base 3`… : the first that none of `taken` is (ignoring case, as macOS does). */
export function freeName(base: string, taken: readonly string[]): string {
  const used = new Set(taken.map((t) => t.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!used.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

/** The name of a copy saved from a conflict: `Session copy 2026-11-19-141503` (PRD §8.3). */
export function copyName(name: string, at: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}`;
  return `${name} copy ${stamp}`;
}

const sessionsIn = (names: readonly string[]) =>
  names
    .filter((n) => n.toLowerCase().endsWith(EXT) && !n.startsWith('.') && n.length > EXT.length)
    .map((n) => n.slice(0, -EXT.length))
    .sort(order);

export class SessionLibrary {
  readonly folder: Folder;

  constructor(folder: Folder) {
    this.folder = folder;
  }

  /** The folder's sessions, by name. */
  async names(): Promise<string[]> {
    return sessionsIn(await this.folder.list(''));
  }

  read(name: string): Promise<FileRead | null> {
    return this.folder.read(file(name));
  }

  /** Saves a session against the version it was read at (null: a new session). */
  write(name: string, text: string, expected: string | null): Promise<string> {
    return this.folder.write(file(name), text, expected);
  }

  /** Makes an empty session named `base`, or `base 2`…, and returns its name and version. */
  async create(base = 'Session', text = ''): Promise<{ name: string; version: string }> {
    for (;;) {
      const name = freeName(base, await this.names());
      try {
        return { name, version: await this.write(name, text, null) };
      } catch (e) {
        // Made elsewhere in between: try the next number.
        if (!(e instanceof StoreError && e.kind === 'conflict')) throw e;
      }
    }
  }

  /** Renames a session; `to` must be a good name (`checkSessionName`) that no other session has. */
  async rename(from: string, to: string): Promise<void> {
    const checked = checkSessionName(to);
    if ('error' in checked) throw new StoreError('name', checked.error);
    const taken = (await this.names()).some(
      (n) => n !== from && n.toLowerCase() === checked.name.toLowerCase(),
    );
    if (taken) throw new StoreError('exists', `There’s already a session called ${checked.name}.`);
    if (checked.name === from) return;
    // A change of case only: go through a free name, since the file system may see one file.
    if (checked.name.toLowerCase() === from.toLowerCase()) {
      const via = freeName(`${from} renaming`, await this.names());
      await this.folder.move(file(from), file(via));
      await this.folder.move(file(via), file(checked.name));
      return;
    }
    await this.folder.move(file(from), file(checked.name));
  }

  /** Moves a session to the trash and returns its name there (PRD §8.2). */
  async trash(name: string): Promise<string> {
    const there = freeName(name, sessionsIn(await this.folder.list(TRASH)));
    await this.folder.move(file(name), `${TRASH}/${file(there)}`);
    return there;
  }

  /** The sessions in the trash, by name. */
  async trashed(): Promise<string[]> {
    return sessionsIn(await this.folder.list(TRASH));
  }

  /** Puts a trashed session back, adding ` 2` when its name is taken, and returns the name it got. */
  async restore(trashed: string): Promise<string> {
    const name = freeName(trashed, await this.names());
    await this.folder.move(`${TRASH}/${file(trashed)}`, file(name));
    return name;
  }
}
