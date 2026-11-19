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
  readTape,
  writeTapeText,
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
  /** Where the prompt goes; stdout when left out. The process sends it to stderr when stdout isn't a terminal. */
  prompt?(text: string): void;
}

/** Reading and writing tape files; tests pass their own. */
export interface CliFiles {
  read(path: string): Promise<string>;
  /** Replaces the file at once: a temporary file beside it, then a rename. */
  writeAtomic(path: string, text: string): Promise<void>;
}

export interface CliContext {
  readonly version: string;
  /** `rand()`; tests fix it. */
  readonly random?: Env['random'];
  readonly files?: CliFiles;
}

export function helpText(): string {
  return [
    'Usage: abacite [options] [expression…]',
    '       abacite tape [--write] <file.txt>',
    '',
    'Evaluates the expression and prints the result. Several arguments are joined with spaces.',
    'With no expression, reads stdin one line at a time as a tape, keeping ans and variables;',
    'on a terminal it shows a "> " prompt until end of input or "exit".',
    '"abacite tape" evaluates a tape file and prints it with fresh results.',
    '',
    'Options:',
    '  --rad        Trigonometry in radians (default: degrees)',
    `  --full       Print all ${PRECISION} digits (default: ${SHOWN_DIGITS})`,
    '  --json       Print {"input", "result", "unit", "error"} per line',
    '  --write      With tape: write the fresh results back to the file',
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
  const unit = result.kind === 'value' ? result.unit : null;
  const error = result.kind === 'error' ? result.message : null;
  if (error !== null) run.failed = true;
  if (run.json) run.io.stdout(`${JSON.stringify({ input, result: value, unit, error })}\n`);
  else if (error !== null) run.io.stderr(`error: ${error}\n`);
  else run.io.stdout(unit ? `${value} ${unit}\n` : `${value}\n`);
}

const FLAGS: Readonly<Record<string, 'rad' | 'full' | 'json' | 'help' | 'version' | 'write'>> = {
  '--rad': 'rad',
  '--write': 'write',
  '--full': 'full',
  '--json': 'json',
  '--help': 'help',
  '-h': 'help',
  '--version': 'version',
  '-v': 'version',
};

/**
 * Splits options from the expression. Options come first: the first word that isn't one starts the expression,
 * so `abacite -5 + 3` and `abacite 3 - -v` are expressions. An unknown `--name` is a usage error, and `--` ends
 * the options.
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
    else {
      options = false;
      words.push(arg);
    }
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
  // `abacite tape [--write] <file>`; `tape` with anything else is an expression using a name.
  const tapeArgs = words[0] === 'tape' ? words.slice(1).filter((w) => w !== '--write') : [];
  if (tapeArgs.length === 1) {
    const write = flags.has('write') || words.includes('--write');
    return runTape(tapeArgs[0]!, write, io, context);
  }
  if (flags.has('write')) {
    io.stderr(`abacite: --write goes with "abacite tape <file.txt>".\n\n${helpText()}`);
    return EXIT_USAGE;
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
  const prompt = (text: string) => {
    if (io.interactive) (io.prompt ?? io.stdout)(text);
  };
  prompt('> ');
  try {
    for await (const line of io.readLines()) {
      if (io.interactive && line.trim() === 'exit') break;
      evaluateLine(run, line);
      prompt('> ');
    }
  } catch (error) {
    io.stderr(
      `abacite: couldn’t read the input: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return EXIT_ERROR;
  }
  prompt('\n');
  return run.failed ? EXIT_ERROR : EXIT_OK;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * `abacite tape <file>` (PRD §13): evaluates a tape file from the top and prints it in the tape format with
 * fresh results, or with `--write` writes them back when they changed. Exit code 1 when a line has an error.
 */
async function runTape(path: string, write: boolean, io: CliIo, context: CliContext): Promise<number> {
  if (!context.files) {
    io.stderr('abacite: this build can’t read files.\n');
    return EXIT_ERROR;
  }
  let text: string;
  try {
    text = await context.files.read(path);
  } catch (error) {
    io.stderr(`abacite: couldn’t read ${path}: ${message(error)}\n`);
    return EXIT_ERROR;
  }
  const { tape, angle } = readTape(text, { ...DEFAULT_ENV, random: context.random ?? DEFAULT_ENV.random });
  const fresh = writeTapeText(tape, angle);
  if (!write) io.stdout(fresh);
  else if (fresh !== text) {
    try {
      await context.files.writeAtomic(path, fresh);
    } catch (error) {
      io.stderr(`abacite: couldn’t write ${path}: ${message(error)}\n`);
      return EXIT_ERROR;
    }
  }
  return tape.lines.some((l) => l.result.kind === 'error') ? EXIT_ERROR : EXIT_OK;
}
