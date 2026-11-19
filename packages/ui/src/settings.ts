/**
 * Per-device settings (PRD §11): kept in this browser profile or this desktop app, never with the tapes. A
 * missing or wrong field takes its default, so one bad value never throws the rest away.
 */
export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const MODES = ['basic', 'scientific'] as const;
export type Mode = (typeof MODES)[number];

export const ANGLES = ['deg', 'rad'] as const;
export type Angle = (typeof ANGLES)[number];

export interface Settings {
  readonly theme: Theme;
  readonly mode: Mode;
  /** The angle unit (PRD §4.5). */
  readonly angle: Angle;
  /** Commas in the integer part of results (PRD §3.2). */
  readonly groupDigits: boolean;
  readonly showTape: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  mode: 'basic',
  angle: 'deg',
  groupDigits: true,
  showTape: false,
};

export function parseSettings(raw: unknown): Settings {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const oneOf = <T>(items: readonly T[], value: unknown, fallback: T): T =>
    items.includes(value as T) ? (value as T) : fallback;
  const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
  return {
    theme: oneOf(THEMES, o.theme, d.theme),
    mode: oneOf(MODES, o.mode, d.mode),
    angle: oneOf(ANGLES, o.angle, d.angle),
    groupDigits: bool(o.groupDigits, d.groupDigits),
    showTape: bool(o.showTape, d.showTape),
  };
}

/** Where settings are kept. */
export interface SettingsStorage {
  load(): Settings;
  save(settings: Settings): void;
}

const KEY = 'abacite.settings';

/**
 * Settings in `localStorage`. A browser that refuses storage (private windows, blocked site data) still runs:
 * settings then last until the window closes.
 */
export function localSettings(): SettingsStorage {
  return {
    load() {
      try {
        const text = localStorage.getItem(KEY);
        return text === null ? DEFAULT_SETTINGS : parseSettings(JSON.parse(text));
      } catch {
        return DEFAULT_SETTINGS;
      }
    },
    save(settings) {
      try {
        localStorage.setItem(KEY, JSON.stringify(settings));
      } catch (e) {
        console.warn('Settings were not kept:', e);
      }
    },
  };
}

/** Settings that last only while the page is open; for tests and scenarios. */
export function memorySettings(initial: Partial<Settings> = {}): SettingsStorage {
  let current: Settings = { ...DEFAULT_SETTINGS, ...initial };
  return {
    load: () => current,
    save(settings) {
      current = settings;
    },
  };
}
