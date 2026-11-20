import { parseDecimal, type Decimal } from '@abacite/core';
import { MemoryFolder, memorySettings, storageKeep, type Settings } from '@abacite/ui';
import {
  AppController,
  SessionFolders,
  buildCommands,
  type ControllerOptions,
  type FolderPlatform,
  type FolderSetup,
  type OpenedFolder,
} from '../src/index.ts';

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

/** A session keep on a map, for tests. */
export function memoryKeep() {
  const map = new Map<string, string>();
  const keep = storageKeep({
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  });
  return { keep, map };
}

/** A folder platform in memory: `first` at start, `choice` for the picker, a default folder, and exports. */
export function memoryPlatform(first: OpenedFolder | FolderSetup = { kind: 'first' }) {
  const fallback: OpenedFolder = { folder: new MemoryFolder('Abacite'), key: 'default' };
  const state = {
    choice: null as OpenedFolder | null,
    defaults: [] as boolean[],
    exported: [] as [string, string][],
    fallback,
  };
  const platform: FolderPlatform = {
    first: () => Promise.resolve(first),
    canChoose: true,
    choose: () => Promise.resolve(state.choice),
    defaultTitle: 'Use Documents/Abacite',
    offersDefault: true,
    useDefault: (remember) => {
      state.defaults.push(remember);
      return Promise.resolve(fallback);
    },
    exportSession: (name, text) => {
      state.exported.push([name, text]);
      return Promise.resolve(true);
    },
    allow: () => Promise.resolve(null),
  };
  return { platform, state };
}

/** An app with session folders on a memory platform; every session command is in its catalog. */
export function makeFolderApp(first?: OpenedFolder | FolderSetup) {
  const made = makeApp({ showSession: true });
  const { platform, state } = memoryPlatform(first);
  const folders = new SessionFolders(made.app, platform, memoryKeep().keep, {
    retries: [0, 0],
    now: () => new Date(2026, 10, 19, 14, 5, 9),
  });
  const catalog = buildCommands(made.app, folders);
  return { ...made, catalog, folders, state };
}
