/** Where the desktop app keeps its own files (PRD §12). No Electron imports, so the tests run it in Node. */
import path from 'node:path';

export interface DataPaths {
  /** Overrides Electron's user-data folder, or null for the default. */
  readonly userData: string | null;
}

/** For checks, which must never touch the owner's files: ABACITE_USER_DATA moves the app's own files. */
export function dataPaths(env: NodeJS.ProcessEnv): DataPaths {
  const at = (v: string | undefined) => (v ? path.resolve(v) : null);
  return { userData: at(env.ABACITE_USER_DATA) };
}

/** Only our own page may use the bridge or be navigated to. */
export function isAppUrl(url: string | undefined | null): boolean {
  return typeof url === 'string' && url.startsWith('app://abacite/');
}

/** The file under `root` that an app:// path names, or null when it would leave `root`. */
export function appFile(root: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const file = path.normalize(path.join(root, decoded === '/' ? '/index.html' : decoded));
  return file.startsWith(root + path.sep) ? file : null;
}
