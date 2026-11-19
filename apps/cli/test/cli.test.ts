import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDecimal } from '@abacite/core';
import { EXIT_ERROR, EXIT_OK, EXIT_USAGE, parseArgv, runCli } from '../src/index.ts';

async function* linesOf(lines: readonly string[]): AsyncIterable<string> {
  for (const line of lines) yield await Promise.resolve(line);
}

async function run(argv: string[], stdin: string[] = [], interactive = false) {
  let out = '';
  let err = '';
  let read = false;
  const code = await runCli(
    argv,
    {
      stdout: (text) => (out += text),
      stderr: (text) => (err += text),
      readLines: () => {
        read = true;
        return linesOf(stdin);
      },
      interactive,
    },
    { version: '9.9.9', random: () => parseDecimal('0.25')! },
  );
  return { code, out, err, read };
}

describe('abacite <expression>', () => {
  it('prints the result', async () => {
    expect(await run(['2 * (3 + 4)'])).toMatchObject({ code: EXIT_OK, out: '14\n', err: '', read: false });
  });

  it('joins several arguments with spaces', async () => {
    expect((await run(['2', '+', '2'])).out).toBe('4\n');
  });

  it('is exact in decimal and groups no digits', async () => {
    expect((await run(['0.1 + 0.2'])).out).toBe('0.3\n');
    expect((await run(['1234567 * 1000'])).out).toBe('1234567000\n');
  });

  it('takes a leading minus as part of the expression, not an option', async () => {
    expect((await run(['-5', '+', '3'])).out).toBe('-2\n');
    expect((await run(['--', '--5'])).out).toBe('5\n');
  });

  it('prints an error on stderr with exit code 1', async () => {
    expect(await run(['1/0'])).toMatchObject({
      code: EXIT_ERROR,
      out: '',
      err: 'error: Can’t divide by zero.\n',
    });
  });

  it('uses degrees, or radians with --rad', async () => {
    expect((await run(['sin(30)'])).out).toBe('0.5\n');
    expect((await run(['--rad', 'cos(pi)'])).out).toBe('-1\n');
  });

  it('prints 32 digits, or 34 with --full', async () => {
    expect((await run(['1/3'])).out).toBe(`0.${'3'.repeat(32)}\n`);
    expect((await run(['--full', '1/3'])).out).toBe(`0.${'3'.repeat(34)}\n`);
  });

  it('prints JSON with --json', async () => {
    expect((await run(['--json', '6*7'])).out).toBe('{"input":"6*7","result":"42","error":null}\n');
    const failed = await run(['--json', '2+']);
    expect(failed.code).toBe(EXIT_ERROR);
    expect(JSON.parse(failed.out)).toEqual({
      input: '2+',
      result: null,
      error: 'Missing a number after `+` at 2.',
    });
  });

  it('uses the rand() it is given', async () => {
    expect((await run(['rand()'])).out).toBe('0.25\n');
  });
});

describe('abacite with stdin', () => {
  it('evaluates each line as a tape line, with ans and variables', async () => {
    const r = await run([], ['x = 5', 'x * 2', '+ 1', '', '# a comment', 'ans + x']);
    expect(r).toMatchObject({ code: EXIT_OK, out: '5\n10\n11\n16\n', err: '' });
  });

  it('keeps going after an error line and exits with 1', async () => {
    const r = await run([], ['1/0', '2+2']);
    expect(r).toMatchObject({ code: EXIT_ERROR, out: '4\n', err: 'error: Can’t divide by zero.\n' });
  });

  it('shows a prompt on a terminal and stops at exit', async () => {
    const r = await run([], ['2+2', 'exit', '3+3'], true);
    expect(r).toMatchObject({ code: EXIT_OK, out: '> 4\n> \n' });
  });

  it('sends the prompt where the process asks, keeping results apart', async () => {
    let out = '';
    let prompts = '';
    await runCli(
      [],
      {
        stdout: (text) => (out += text),
        stderr: () => {},
        readLines: () => linesOf(['2+2']),
        interactive: true,
        prompt: (text) => (prompts += text),
      },
      { version: '9.9.9' },
    );
    expect({ out, prompts }).toEqual({ out: '4\n', prompts: '> > \n' });
  });
});

describe('usage', () => {
  it('rejects an unknown option with exit code 2', async () => {
    const r = await run(['--nope', '1']);
    expect(r.code).toBe(EXIT_USAGE);
    expect(r.err).toContain('unknown option --nope');
  });

  it('prints help and the version', async () => {
    expect((await run(['--help'])).out).toContain('Usage: abacite');
    expect((await run(['-v'])).out).toBe('abacite 9.9.9\n');
  });

  it('splits options from the expression', () => {
    expect(parseArgv(['--rad', '--', '--json'])).toEqual({ flags: new Set(['rad']), words: ['--json'] });
  });

  it('ends the options at the first word of the expression', async () => {
    expect(parseArgv(['--rad', '-x', '+', '1', '--json'])).toEqual({
      flags: new Set(['rad']),
      words: ['-x', '+', '1', '--json'],
    });
    expect(await run(['3', '-', '-v'])).toMatchObject({ code: EXIT_ERROR, out: '' });
    expect((await run(['3', '-', '-5'])).out).toBe('8\n');
  });
});

describe('reading stdin', () => {
  it('reports a read error with exit code 1', async () => {
    let err = '';
    const code = await runCli(
      [],
      {
        stdout: () => {},
        stderr: (text) => (err += text),
        readLines: () => ({
          [Symbol.asyncIterator]: () => ({
            next: () => Promise.reject(new Error('EISDIR: illegal operation on a directory, read')),
          }),
        }),
        interactive: false,
      },
      { version: '9.9.9' },
    );
    expect(code).toBe(EXIT_ERROR);
    expect(err).toBe('abacite: couldn’t read the input: EISDIR: illegal operation on a directory, read\n');
  });
});

describe('the abacite bin', () => {
  const BIN = fileURLToPath(new URL('../bin/abacite.mjs', import.meta.url));

  it('runs from source and reads stdin', () => {
    expect(execFileSync(process.execPath, [BIN, '2^10'], { encoding: 'utf8' })).toBe('1024\n');
    expect(execFileSync(process.execPath, [BIN], { input: 'a = 3\na^2\n', encoding: 'utf8' })).toBe('3\n9\n');
  });

  it('stops quietly when the reader closes the pipe', () => {
    const r = spawnSync('sh', ['-c', `yes 2 | "${process.execPath}" "${BIN}" | head -n 1`], {
      encoding: 'utf8',
    });
    expect(r.stdout).toBe('2\n');
    expect(r.stderr).toBe('');
  });
});
