import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENV,
  EMPTY_SESSION,
  commit,
  evaluate,
  findUnit,
  formatDecimal,
  type LineResult,
} from '../src/index.ts';

/** The result as the app shows it: the number to 32 digits, then the unit. */
function shown(line: string): string {
  const r: LineResult = evaluate(line).result;
  if (r.kind === 'value') return r.unit ? `${formatDecimal(r.value)} ${r.unit}` : formatDecimal(r.value);
  return r.kind === 'error' ? `error: ${r.message}${r.incomplete ? ' (unfinished)' : ''}` : '';
}

describe('unit conversion (PRD §6)', () => {
  it('converts with to, in, -> and →, and shows the unit', () => {
    // 5 / 1.609344, from Python's decimal module at 40 digits.
    expect(shown('5 km to mi')).toBe('3.1068559611866698480871709218166 mi');
    expect(shown('(3+2) kg in lb')).toBe('11.023113109243879036148690067251 lb');
    expect(shown('2 kilometres -> metres')).toBe('2000 m');
    expect(shown('1 day → h')).toBe('24 h');
  });

  it('uses exact factors where the definition is exact', () => {
    expect(shown('1 in to m')).toBe('0.0254 m');
    expect(shown('1 lb to kg')).toBe('0.45359237 kg');
    expect(shown('1 US gal to L')).toBe('3.785411784 L');
    expect(shown('5 fl oz to mL')).toBe('147.8676478125 mL');
    expect(shown('60 mph to km/h')).toBe('96.56064 km/h');
    expect(shown('1 kn to km/h')).toBe('1.852 km/h');
    expect(shown('1 GiB to MB')).toBe('1073.741824 MB');
    expect(shown('1 year to day')).toBe('365.25 day');
    expect(shown('1 acre to m2')).toBe('4046.8564224 m²');
  });

  it('converts temperatures with their offsets', () => {
    expect(shown('100 F to C')).toBe('37.777777777777777777777777777778 °C');
    expect(shown('-40 °C to °F')).toBe('-40 °F');
    expect(shown('0 K to degC')).toBe('-273.15 °C');
    expect(shown('212 F to K')).toBe('373.15 K');
  });

  it('refuses units of different kinds', () => {
    expect(shown('5 km to kg')).toBe('error: Can’t convert km to kg.');
    expect(evaluate('5 km to kg').result).toMatchObject({ at: 2 });
  });

  it('tells inches from the in separator', () => {
    expect(shown('5 in to cm')).toBe('12.7 cm');
    expect(shown('5 in in cm')).toBe('12.7 cm');
    expect(shown('5 ft in in')).toBe('60 in');
  });

  it('is case-sensitive: mB is not MB, and M is no unit', () => {
    expect(findUnit('MB')?.symbol).toBe('MB');
    expect(findUnit('mB')).toBeNull();
    expect(findUnit('M')).toBeNull();
    expect(shown('3 M to m')).toMatch(/^error: `M` isn’t defined/);
  });

  it('reads unit names as units only after a number or ) and after to', () => {
    const session = ['m = 4', 'm * 2', '2 m to cm', 'm km to mi'].reduce(
      (t, line) => commit(t, line, DEFAULT_ENV),
      EMPTY_SESSION,
    );
    const results = session.lines.map((l) =>
      l.result.kind === 'value' ? formatDecimal(l.result.value) : l.result.kind,
    );
    expect(results).toEqual(['4', '8', '200', 'error']);
  });

  it('keeps ans as the number, without its unit', () => {
    const session = ['5 km to m', '* 2'].reduce((t, line) => commit(t, line, DEFAULT_ENV), EMPTY_SESSION);
    expect(session.lines[1]!.result).toMatchObject({ kind: 'value', unit: null });
    expect(formatDecimal(session.scope.ans)).toBe('10000');
  });

  it('assigns a converted value, and keeps a comment out', () => {
    expect(shown('x = 3 ft to m')).toBe('0.9144 m');
    expect(shown('5 km to m # the walk')).toBe('5000 m');
  });

  it('treats a conversion still being typed as unfinished, not wrong', () => {
    expect(shown('5 km')).toBe('error: The conversion needs a unit to convert to. (unfinished)');
    expect(shown('5 km to ')).toBe('error: The conversion needs a unit to convert to. (unfinished)');
  });

  it('says which unit is missing when only the target has one', () => {
    expect(shown('2 to in')).toBe('error: Put a unit after the number to convert, as in `2 mm to in`.');
    expect(shown('(1+2) -> mi')).toBe('error: Put a unit after the number to convert, as in `2 mm to mi`.');
    expect(shown('100 to F')).toBe('error: Put a unit after the number to convert, as in `2 °C to F`.');
  });
});
