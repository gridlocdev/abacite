import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENV,
  EMPTY_SESSION,
  commit,
  formatDecimal,
  parseDecimal,
  parseSessionText,
  readSession,
  writeSessionText,
  type Decimal,
  type Env,
} from '../src/index.ts';

/** An env whose `rand()` gives `values` in turn. */
function randomEnv(...values: string[]): Env {
  let i = 0;
  return { ...DEFAULT_ENV, random: () => parseDecimal(values[i++ % values.length]!)! };
}

const shown = (d: Decimal) => formatDecimal(d);

describe('session files (PRD §8.1)', () => {
  it('writes each line with its result, all 34 digits and no grouping', () => {
    const session = ['x = 5 * 3', '1/0', '2/3 * 1000000', '# a note', '', '5 km to m'].reduce(
      (t, line) => commit(t, line, DEFAULT_ENV),
      EMPTY_SESSION,
    );
    expect(writeSessionText(session, 'deg')).toBe(
      [
        'x = 5 * 3  # = 15',
        '1/0  # error: Can’t divide by zero.',
        '2/3 * 1000000  # = 666666.6666666666666666666666666667',
        '# a note',
        '5 km to m  # = 5000 m',
        '',
      ].join('\n'),
    );
  });

  it('reads a file back byte for byte, notes and blank lines included', () => {
    const text = [
      '# Shopping',
      '',
      'price = 12.50  # = 12.5',
      'price * 3 # three of them  # = 37.5',
      'rand()  # = 0.25  (rand)',
      'rand() + rand()  # = 0.75  (rand 0.25 0.5)',
      'nope  # error: `nope` isn’t defined.',
      '',
    ].join('\n');
    const { session, angle } = readSession(text, DEFAULT_ENV);
    expect(writeSessionText(session, angle)).toBe(text);
  });

  it('ignores the written results and works them out again', () => {
    const { session } = readSession('2 + 2  # = 5\nans * 10  # = 1\n', DEFAULT_ENV);
    expect(writeSessionText(session, 'deg')).toBe('2 + 2  # = 4\nans * 10  # = 40\n');
  });

  it('keeps the values rand() gave instead of drawing new ones', () => {
    const { session } = readSession(
      'rand()  # = 0.9  (rand)\nrand() * 2  # = 1  (rand 0.125)\n',
      randomEnv('0.5'),
    );
    expect(session.lines.map((l) => (l.result.kind === 'value' ? shown(l.result.value) : ''))).toEqual([
      '0.9',
      '0.25',
    ]);
    // A line written by hand draws afresh, and is written with what it drew.
    const fresh = readSession('rand()\n', randomEnv('0.5'));
    expect(writeSessionText(fresh.session, 'deg')).toBe('rand()  # = 0.5  (rand)\n');
  });

  it('reads CRLF, writes LF', () => {
    const { session } = readSession('1 + 1  # = 2\r\n3\r\n', DEFAULT_ENV);
    expect(writeSessionText(session, 'deg')).toBe('1 + 1  # = 2\n3  # = 3\n');
  });

  it('evaluates in radians when the first line says so, and writes that line back', () => {
    const text = '# abacite: angle=rad\nsin(pi/2)  # = 1\n';
    const { session, angle } = readSession(text, DEFAULT_ENV);
    expect(angle).toBe('rad');
    expect(writeSessionText(session, angle)).toBe(text);
    expect(parseSessionText('sin(90)\n').angle).toBe('deg');
  });

  it('reads a line with no result comment as typed', () => {
    expect(parseSessionText('5 + 3 # my note\n').lines).toEqual([{ input: '5 + 3 # my note', randoms: [] }]);
  });

  it('draws again when a (rand) value can’t be read', () => {
    const { session } = readSession('rand()  # = lots  (rand)\n', randomEnv('0.5'));
    expect(writeSessionText(session, 'deg')).toBe('rand()  # = 0.5  (rand)\n');
  });
});
