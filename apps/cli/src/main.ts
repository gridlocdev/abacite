import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { runCli } from './cli.ts';

/** The `abacite` executable: the real process streams and the package's version. */

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};
process.exitCode = await runCli(
  process.argv.slice(2),
  {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    readLines: () => createInterface({ input: process.stdin, terminal: false }),
    interactive: process.stdin.isTTY === true,
  },
  { version: pkg.version },
);
