/**
 * Unit conversion (PRD §6): `<expr> <unit> to <unit>`, also with `in`, `->` and `→`. Factors are exact decimals
 * (or exact ratios, such as km/h = 5/18 m/s) to each category's base unit, so a conversion rounds once.
 */
import { ONE, PRECISION, ZERO, add, div, mul, parseDecimal, round, sub, type Decimal } from './decimal.ts';
import { CalcError } from './errors.ts';

export type UnitCategory = 'length' | 'mass' | 'volume' | 'temperature' | 'time' | 'area' | 'speed' | 'data';

export interface Unit {
  /** What the result shows after the number: `mi`, `m³`, `°C`. */
  readonly symbol: string;
  readonly category: UnitCategory;
  /** base = (value + offset) × num / den. */
  readonly num: Decimal;
  readonly den: Decimal;
  readonly offset: Decimal;
}

/** A precision no product of a few exact factors reaches: arithmetic at it is exact. */
const EXACT = Number.MAX_SAFE_INTEGER;
/** Digits kept through the one division, before the result is rounded to PRECISION. */
const GUARD = 6;

const d = (text: string): Decimal => {
  const value = parseDecimal(text);
  if (!value) throw new Error(`Bad unit factor ${text}`);
  return value;
};

/** Each unit: the shown symbol, its factor (`a/b` for a ratio), and the other names it goes by. */
type UnitRow = readonly [symbol: string, factor: string, names: readonly string[], offset?: string];

const TABLE: Readonly<Record<UnitCategory, readonly UnitRow[]>> = {
  // Base: the metre.
  length: [
    ['mm', '0.001', ['millimeter', 'millimeters', 'millimetre', 'millimetres']],
    ['cm', '0.01', ['centimeter', 'centimeters', 'centimetre', 'centimetres']],
    ['m', '1', ['meter', 'meters', 'metre', 'metres']],
    ['km', '1000', ['kilometer', 'kilometers', 'kilometre', 'kilometres']],
    ['in', '0.0254', ['inch', 'inches']],
    ['ft', '0.3048', ['foot', 'feet']],
    ['yd', '0.9144', ['yard', 'yards']],
    ['mi', '1609.344', ['mile', 'miles']],
    ['nmi', '1852', ['nautical mile', 'nautical miles']],
  ],
  // Base: the kilogram.
  mass: [
    ['mg', '0.000001', ['milligram', 'milligrams', 'milligramme', 'milligrammes']],
    ['g', '0.001', ['gram', 'grams', 'gramme', 'grammes']],
    ['kg', '1', ['kilogram', 'kilograms', 'kilogramme', 'kilogrammes']],
    ['t', '1000', ['tonne', 'tonnes', 'metric ton', 'metric tons']],
    ['oz', '0.028349523125', ['ounce', 'ounces']],
    ['lb', '0.45359237', ['lbs', 'pound', 'pounds']],
    ['st', '6.35029318', ['stone', 'stones']],
  ],
  // Base: the litre. US customary measures.
  volume: [
    ['mL', '0.001', ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres']],
    ['cL', '0.01', ['cl', 'centiliter', 'centiliters', 'centilitre', 'centilitres']],
    ['L', '1', ['l', 'liter', 'liters', 'litre', 'litres']],
    ['tsp', '0.00492892159375', ['teaspoon', 'teaspoons']],
    ['tbsp', '0.01478676478125', ['tablespoon', 'tablespoons']],
    ['fl oz', '0.0295735295625', ['floz', 'fluid ounce', 'fluid ounces']],
    ['cup', '0.2365882365', ['cups']],
    ['pt', '0.473176473', ['pint', 'pints']],
    ['qt', '0.946352946', ['quart', 'quarts']],
    ['gal', '3.785411784', ['gallon', 'gallons', 'US gal', 'US gallon', 'US gallons']],
    ['m³', '1000', ['m3', 'cubic meter', 'cubic meters', 'cubic metre', 'cubic metres']],
    [
      'cm³',
      '0.001',
      ['cm3', 'cc', 'cubic centimeter', 'cubic centimeters', 'cubic centimetre', 'cubic centimetres'],
    ],
  ],
  // Base: the kelvin. base = (value + offset) × factor.
  temperature: [
    ['°C', '1', ['C', 'degC', 'celsius', 'Celsius'], '273.15'],
    ['°F', '5/9', ['F', 'degF', 'fahrenheit', 'Fahrenheit'], '459.67'],
    ['K', '1', ['kelvin', 'kelvins']],
  ],
  // Base: the second. A year is 365.25 days.
  time: [
    ['ms', '0.001', ['millisecond', 'milliseconds']],
    ['s', '1', ['sec', 'secs', 'second', 'seconds']],
    ['min', '60', ['mins', 'minute', 'minutes']],
    ['h', '3600', ['hr', 'hrs', 'hour', 'hours']],
    ['day', '86400', ['days', 'd']],
    ['week', '604800', ['weeks', 'wk']],
    ['year', '31557600', ['years', 'yr', 'yrs']],
  ],
  // Base: the square metre.
  area: [
    ['mm²', '0.000001', ['mm2']],
    ['cm²', '0.0001', ['cm2']],
    ['m²', '1', ['m2']],
    ['km²', '1000000', ['km2']],
    ['ha', '10000', ['hectare', 'hectares']],
    ['in²', '0.00064516', ['in2']],
    ['ft²', '0.09290304', ['ft2']],
    ['yd²', '0.83612736', ['yd2']],
    ['acre', '4046.8564224', ['acres']],
    ['mi²', '2589988.110336', ['mi2']],
  ],
  // Base: metres per second.
  speed: [
    ['m/s', '1', ['mps']],
    ['km/h', '5/18', ['kph', 'kmh']],
    ['mph', '0.44704', ['mi/h']],
    ['kn', '463/900', ['kt', 'knot', 'knots']],
    ['ft/s', '0.3048', ['fps']],
  ],
  // Base: the bit. kB, MB… are powers of 1000; KiB, MiB… of 1024.
  data: [
    ['bit', '1', ['bits']],
    ['B', '8', ['byte', 'bytes']],
    ['kB', '8000', ['KB', 'kilobyte', 'kilobytes']],
    ['MB', '8000000', ['megabyte', 'megabytes']],
    ['GB', '8000000000', ['gigabyte', 'gigabytes']],
    ['TB', '8000000000000', ['terabyte', 'terabytes']],
    ['KiB', '8192', ['kibibyte', 'kibibytes']],
    ['MiB', '8388608', ['mebibyte', 'mebibytes']],
    ['GiB', '8589934592', ['gibibyte', 'gibibytes']],
    ['TiB', '8796093022208', ['tebibyte', 'tebibytes']],
  ],
};

/** Every name a unit goes by, exactly as written: `mB` is not `MB`, and `M` is no unit (PRD §6). */
const UNITS: ReadonlyMap<string, Unit> = (() => {
  const map = new Map<string, Unit>();
  for (const [category, rows] of Object.entries(TABLE) as [UnitCategory, readonly UnitRow[]][]) {
    for (const [symbol, factor, names, offset] of rows) {
      const [num, den = '1'] = factor.split('/');
      const unit: Unit = { symbol, category, num: d(num!), den: d(den), offset: offset ? d(offset) : ZERO };
      for (const name of [symbol, ...names]) {
        if (map.has(name)) throw new Error(`The unit name ${name} is used twice`);
        map.set(name, unit);
      }
    }
  }
  return map;
})();

/** The unit a name stands for, with spaces between words evened out (`fl  oz`), or null. */
export function findUnit(name: string): Unit | null {
  return UNITS.get(name.trim().replace(/\s+/g, ' ')) ?? null;
}

/** `value` in `from` as `to`, rounded once to 34 digits; units of different kinds are an error (PRD §6). */
export function convert(
  value: Decimal,
  from: Unit,
  to: Unit,
  fromName = from.symbol,
  toName = to.symbol,
): Decimal {
  if (from.category !== to.category) throw new CalcError(`Can’t convert ${fromName} to ${toName}.`, null);
  if (from === to) return value;
  // target = ((value + from.offset) × from.num × to.den) / (from.den × to.num) − to.offset
  const numerator = mul(mul(add(value, from.offset, EXACT), from.num, EXACT), to.den, EXACT);
  const denominator = mul(from.den, to.num, EXACT);
  const exact = denominator.c === ONE.c && denominator.e === 0;
  const scaled = exact ? numerator : div(numerator, denominator, PRECISION + GUARD);
  return round(sub(scaled, to.offset, PRECISION + GUARD));
}

/** A line that converts: the expression part (with any assignment), and the two units as typed. */
export interface Conversion {
  /** The line up to the first unit: `x = 5` in `x = 5 km to mi`. */
  readonly expr: string;
  readonly from: Unit;
  readonly to: Unit;
  readonly fromName: string;
  readonly toName: string;
  /** Where the first unit starts in the line, for errors. */
  readonly fromAt: number;
}

/** The separators between the two units: `to`, `in`, `->` and `→`. */
const SEPARATOR = /(?<=\s)(?:to|in)(?=\s)|->|→/g;

/** The end of a number literal (`5`, `2.5`, `.5`, `1e3`), not a digit inside a name (`x2`). */
const NUMBER_END = /(?:^|[^A-Za-z0-9_.])(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:e[+-]?[0-9]+)?$/;

/**
 * Splits `text` at its end into an expression and a unit. The unit must follow a number or `)` (PRD §6), so
 * `2 m2` is 2 m² and `x m` is no conversion. Null when the text doesn't end in a unit.
 */
export function splitUnit(text: string): { expr: string; unit: Unit; name: string; at: number } | null {
  const trimmed = text.trimEnd();
  for (let at = trimmed.length - 1; at > 0; at--) {
    if (!/[A-Za-z°]/.test(trimmed[at]!) || /[A-Za-z°]/.test(trimmed[at - 1]!)) continue;
    const before = trimmed.slice(0, at).trimEnd();
    if (!before.endsWith(')') && !NUMBER_END.test(before)) continue;
    const name = trimmed.slice(at);
    const unit = findUnit(name);
    if (unit) return { expr: before, unit, name, at };
  }
  return null;
}

/** The conversion `text` asks for, or null when it isn't one (then it's an ordinary expression). */
export function findConversion(text: string): Conversion | null {
  const separators = [...text.matchAll(SEPARATOR)].reverse();
  for (const separator of separators) {
    const toName = text.slice(separator.index + separator[0].length).trim();
    const to = findUnit(toName);
    if (!to) continue;
    const left = splitUnit(text.slice(0, separator.index));
    if (!left) continue;
    return { expr: left.expr, from: left.unit, to, fromName: left.name, toName, fromAt: left.at };
  }
  return null;
}
