/**
 * The `abacite` command (PRD §13): evaluates an expression, or stdin line by line as a tape, with the same
 * engine as the app. It groups no digits and reads no settings.
 */
import {
  DEFAULT_ENV,
  EMPTY_TAPE,
  PRECISION,
  SHOWN_DIGITS,
  commit,
  formatDecimal,
  type Env,
  type Tape,
} from '@abacite/core';

export const EXIT_OK = 0;
/** A line didn't evaluate; the message is on stderr (or in the JSON). */
export const EXIT_ERROR = 1;
/** The command line itself is wrong. */
export const EXIT_USAGE = 2;

/** Where the CLI reads and writes. Production passes the process streams; tests pass their own. */
export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
  /** Starts reading stdin, one line at a time without its line break. Called only when there's no expression. */
  readLines(): AsyncIterable<string>;
  /** stdin is a terminal: show the `> ` prompt. */
  readonly interactive: boolean;
}

export interface CliContext {
  readonly version: string;
  /** `rand()`; tests fix it. */
  readonly random?: Env['random'];
}

export function helpText(): string {
  return [
    'Usage: abacite [options] [expression…]',
    '',
    'Evaluates the expression and prints the result. Several arguments are joined with spaces.',
    'With no expression, reads stdin one line at a time as a tape, keeping ans and variables;',
    'on a terminal it shows a "> " prompt until end of input or "exit".',
    '',
    'Options:',
    '  --rad        Trigonometry in radians (default: degrees)',
    `  --full       Print all ${PRECISION} digits (default: ${SHOWN_DIGITS})`,
    '  --json       Print {"input", "result", "error"} per line',
    '  -h, --help   Show this help',
    '  -v, --version',
    '',
    'Exit codes: 0 ok, 1 a line failed, 2 a usage error.',
    '',
  ].join('\n');
}

interface Run {
  tape: Tape;
  readonly env: Env;
  readonly digits: number;
  readonly json: boolean;
  readonly io: CliIo;
  failed: boolean;
}

/** Evaluates one line onto the tape and prints its result. Blank and comment-only lines print nothing. */
function evaluateLine(run: Run, input: string): void {
  const tape = commit(run.tape, input, run.env);
  if (tape === run.tape) return;
  run.tape = tape;
  const result = tape.lines.at(-1)!.result;
  if (result.kind === 'empty') return;
  const value = result.kind === 'value' ? formatDecimal(result.value, { digits: run.digits }) : null;
  const error = result.kind === 'error' ? result.message : null;
  if (error !== null) run.failed = true;
  if (run.json) run.io.stdout(`${JSON.stringify({ input, result: value, error })}\n`);
  else if (error !== null) run.io.stderr(`error: ${error}\n`);
  else run.io.stdout(`${value}\n`);
}

const FLAGS: Readonly<Record<string, 'rad' | 'full' | 'json' | 'help' | 'version'>> = {
  '--rad': 'rad',
  '--full': 'full',
  '--json': 'json',
  '--help': 'help',
  '-h': 'help',
  '--version': 'version',
  '-v': 'version',
};

/**
 * Splits options from the expression. Anything that isn't a known option is part of the expression, so
 * `abacite -5 + 3` and `abacite 2 - -x` work; an unknown `--name` is a usage error, and `--` ends the options.
 */
export function parseArgv(argv: readonly string[]): { flags: Set<string>; words: string[] } | string {
  const flags = new Set<string>();
  const words: string[] = [];
  let options = true;
  for (const arg of argv) {
    const flag = FLAGS[arg];
    if (options && arg === '--') options = false;
    else if (options && flag) flags.add(flag);
    else if (options && arg.startsWith('--')) return `unknown option ${arg}`;
    else words.push(arg);
  }
  return { flags, words };
}

export async function runCli(argv: readonly string[], io: CliIo, context: CliContext): Promise<number> {
  const parsed = parseArgv(argv);
  if (typeof parsed === 'string') {
    io.stderr(`abacite: ${parsed}\n\n${helpText()}`);
    return EXIT_USAGE;
  }
  const { flags, words } = parsed;
  if (flags.has('help')) {
    io.stdout(helpText());
    return EXIT_OK;
  }
  if (flags.has('version')) {
    io.stdout(`abacite ${context.version}\n`);
    return EXIT_OK;
  }
  const run: Run = {
    tape: EMPTY_TAPE,
    env: { angle: flags.has('rad') ? 'rad' : 'deg', random: context.random ?? DEFAULT_ENV.random },
    digits: flags.has('full') ? PRECISION : SHOWN_DIGITS,
    json: flags.has('json'),
    io,
    failed: false,
  };
  if (words.length > 0) {
    const input = words.join(' ');
    if (!input.trim()) {
      io.stderr('abacite: the expression is empty.\n');
      return EXIT_USAGE;
    }
    evaluateLine(run, input);
    return run.failed ? EXIT_ERROR : EXIT_OK;
  }
  if (io.interactive) io.stdout('> ');
  for await (const line of io.readLines()) {
    if (io.interactive && line.trim() === 'exit') break;
    evaluateLine(run, line);
    if (io.interactive) io.stdout('> ');
  }
  if (io.interactive) io.stdout('\n');
  return run.failed ? EXIT_ERROR : EXIT_OK;
}
