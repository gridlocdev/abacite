import { readFileSync } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { runCli } from './cli.ts';

/** The `abacite` executable: the real process streams and the package's version. */

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// A reader that stopped early (`abacite < big.txt | head -1`) closes the pipe: stop quietly, not with a trace.
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code !== 'EPIPE') throw error;
  process.exit(process.exitCode ?? 0);
});

/** stdin's lines; a read error (stdin is a folder, say) ends the lines and is thrown. */
async function* stdinLines(): AsyncIterable<string> {
  let failure: Error | undefined;
  const lines = createInterface({ input: process.stdin, terminal: false });
  process.stdin.once('error', (error) => {
    failure = error;
    lines.close();
  });
  for await (const line of lines) yield line;
  if (failure) throw failure;
}

process.exitCode = await runCli(
  process.argv.slice(2),
  {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    readLines: stdinLines,
    interactive: process.stdin.isTTY === true,
    prompt: (text) => (process.stdout.isTTY ? process.stdout : process.stderr).write(text),
  },
  {
    version: pkg.version,
    files: {
      read: (file) => readFile(file, 'utf8'),
      async writeAtomic(file, text) {
        const temp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
        try {
          await writeFile(temp, text, { encoding: 'utf8', flag: 'wx' });
          await rename(temp, file);
        } finally {
          await rm(temp, { force: true });
        }
      },
    },
  },
);
