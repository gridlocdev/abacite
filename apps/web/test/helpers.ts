import { parseDecimal, type Decimal } from '@abacite/core';
import { memorySettings, type Settings } from '@abacite/ui';
import { AppController, buildCommands, type ControllerOptions } from '../src/index.ts';

/** `rand()` values from a fixed list, for tests. */
export function randoms(...values: string[]): () => Decimal {
  let i = 0;
  return () => parseDecimal(values[i++ % values.length]!)!;
}

/** A controller and catalog on in-memory settings, a fixed `rand()` and a fake clipboard. */
export function makeApp(settings: Partial<Settings> = {}, options: Partial<ControllerOptions> = {}) {
  const storage = memorySettings(settings);
  const copied: string[] = [];
  const widths: number[] = [];
  const app = new AppController({
    settings: storage,
    version: '0.0.0-test',
    random: randoms('0.25', '0.5'),
    copy: (text) => {
      copied.push(text);
      return Promise.resolve();
    },
    fitWidth: (w) => widths.push(w),
    ...options,
  });
  const catalog = buildCommands(app);
  return { app, catalog, storage, copied, widths };
}

/** Types `text` at the end of the line, as the field would. */
export function type(app: AppController, text: string): void {
  const t = app.line.value.text + text;
  app.setLine({ text: t, start: t.length, end: t.length });
}

/** Types and commits each line. */
export function enter(app: AppController, ...lines: string[]): void {
  for (const line of lines) {
    type(app, line);
    app.commit();
  }
}
