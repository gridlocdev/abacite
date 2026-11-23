/**
 * A folder picked with `<input type="file" webkitdirectory>` (PRD §8.2): the way Firefox and Safari open a
 * folder, since they have no `showDirectoryPicker`. The browser hands over a snapshot of the folder's files and
 * keeps no access to the folder, so this folder can only be read.
 */
import { StoreError, pathParts, versionOfBytes, type FileRead, type Folder } from './folder.ts';

/** Hidden files and folders (`.abacite`, `.git`, `.DS_Store`) and a Synology NAS's thumbnail folders. */
const skipped = (part: string) => part.startsWith('.') || part === '@eaDir';

export class FileListFolder implements Folder {
  readonly label: string;
  readonly readOnly = true;
  readonly #byPath = new Map<string, File>();

  /** `files` as the input gives them: each `webkitRelativePath` starts with the picked folder's name. */
  constructor(files: readonly File[]) {
    let label = '';
    for (const file of files) {
      const [top = '', ...rest] = file.webkitRelativePath.split('/');
      label ||= top;
      if (!rest.length || rest.some((p) => !p || skipped(p))) continue;
      this.#byPath.set(rest.join('/'), file);
    }
    this.label = label || 'Folder';
  }

  list(dir: string): Promise<string[]> {
    const prefix = dir ? `${pathParts(dir).join('/')}/` : '';
    const names: string[] = [];
    for (const path of this.#byPath.keys()) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      if (!rest.includes('/')) names.push(rest);
    }
    return Promise.resolve(names);
  }

  async read(path: string): Promise<FileRead | null> {
    const file = this.#byPath.get(pathParts(path).join('/'));
    if (!file) return null;
    const bytes = new Uint8Array(await file.arrayBuffer());
    return {
      text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes),
      version: await versionOfBytes(bytes),
    };
  }

  write(_path: string, _text: string, _expected: string | null): Promise<string> {
    return Promise.reject(this.#refused());
  }

  move(_from: string, _to: string): Promise<void> {
    return Promise.reject(this.#refused());
  }

  #refused(): StoreError {
    return new StoreError('readonly', `${this.label} is read-only in this browser.`);
  }
}

/**
 * Asks for a folder with a hidden file input, from the user's click; every file under it, or null when the
 * user cancels. Browsers without the `cancel` event never settle a cancelled pick, so nothing waits on it.
 */
export function pickFolderFiles(doc: Document = document): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.hidden = true;
    const done = (files: File[] | null) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => done(input.files ? [...input.files] : null), { once: true });
    input.addEventListener('cancel', () => done(null), { once: true });
    doc.body.append(input);
    input.click();
  });
}

/** True when this browser can pick a folder with the file input (Firefox, Safari and Chromium). */
export const canPickFolderFiles = (): boolean =>
  typeof HTMLInputElement !== 'undefined' && 'webkitdirectory' in HTMLInputElement.prototype;
