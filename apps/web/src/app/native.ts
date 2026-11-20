/** What the desktop app's preload script puts on `window.abaciteNative` (PRD §12). */
import type { NativeMenuItem, NativeReply } from '@abacite/ui';

/** A newer published release: its version and its page. */
export interface Release {
  readonly version: string;
  readonly url: string;
}

export interface AbaciteNative {
  readonly version: string;
  /** `unified` on macOS: no title bar, the traffic lights sit in the page's top row. */
  readonly chrome: string;
  /** The window went in or out of full screen. */
  onFullScreen(fn: (full: boolean) => void): void;
  /** Replaces the menu bar. */
  setMenu(items: readonly NativeMenuItem[]): void;
  /** A menu bar item was chosen. */
  onCommand(fn: (id: string) => void): void;
  /** Grows the window to at least this width, for the Scientific keypad or the session (PRD §9.1). */
  fitWidth(width: number): void;
  /** The remembered session folder, whether it is there, and the default one (PRD §8.2). */
  folderInfo(): Promise<{ folder: string | null; missing: boolean; defaultFolder: string }>;
  /** Makes Documents/Abacite the session folder, creating it. */
  useDefaultFolder(): Promise<string>;
  /** Asks the user for a session folder; null when they cancel. */
  chooseFolder(): Promise<string | null>;
  /** One call in the session folder: `list`, `read`, `write` or `move`. */
  folder(op: string, args: readonly unknown[]): Promise<NativeReply>;
  /** Asks where to save a copy of the session and writes it; false when the user cancels. */
  exportSession(name: string, text: string): Promise<boolean>;
  /** A newer release than this one, checked at most once a day (PRD §12); null when there is none. */
  latestRelease(): Promise<Release | null>;
}

export function nativeBridge(): AbaciteNative | null {
  return (globalThis as { abaciteNative?: AbaciteNative }).abaciteNative ?? null;
}
