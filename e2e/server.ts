// Where the scenarios find the app: the built web client served by `vite preview`. Abacite keeps no files yet,
// so there is no fixture folder; each page starts with empty local storage.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
/**
 * A port no other app's checks use, so two apps' checks can run at once (Cellestra uses 8791, Puffinote 8793,
 * Daybird 8795, Taskite 8797). An app that shares one stops the other's server or fails with EADDRINUSE.
 */
export const PORT = 8798;
export const BASE_URL = `http://127.0.0.1:${PORT}`;
export const SERVER_COMMAND = `pnpm exec vite preview --host 127.0.0.1 --port ${PORT} --strictPort`;
export const SERVER_CWD = `${ROOT}apps/web`;

const CLI = `${ROOT}apps/cli/bin/abacite.mjs`;

/** Run the CLI and return what it prints, without the last line break: `cli('2+2')`. */
export function cli(args: readonly string[], input?: string): string {
  return execFileSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: 'utf8', input }).replace(
    /\n$/,
    '',
  );
}
