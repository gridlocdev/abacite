/** Where the desktop app keeps its own files (PRD §12). No Electron imports, so the tests run it in Node. */
import path from 'node:path';

export interface DataPaths {
  /** Overrides Electron's user-data folder, or null for the default. */
  readonly userData: string | null;
  /** The folder was made for this run, in the system's temporary folder. */
  readonly temporary: boolean;
}

/**
 * Headless mode, for automated checks: `--headless` on the command line or ABACITE_HEADLESS=1. The app renders
 * offscreen and never shows a window, a Dock icon, a menu or anything else on the owner's screen.
 */
export function isHeadless(argv: readonly string[], env: NodeJS.ProcessEnv): boolean {
  return argv.includes('--headless') || env.ABACITE_HEADLESS === '1';
}

/**
 * For checks, which must never touch the owner's files: ABACITE_USER_DATA moves the app's own files, and a
 * headless run without it gets a fresh folder from `makeTemp`, so it never reads the owner's profile or
 * meets the owner's running copy through the single-instance lock.
 */
export function dataPaths(env: NodeJS.ProcessEnv, headless = false, makeTemp?: () => string): DataPaths {
  if (env.ABACITE_USER_DATA) return { userData: path.resolve(env.ABACITE_USER_DATA), temporary: false };
  if (headless && makeTemp) return { userData: makeTemp(), temporary: true };
  return { userData: null, temporary: false };
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
