/** What the desktop app's preload script puts on `window.abaciteNative` (PRD §12). */
import type { NativeMenuItem, NativeReply } from '@abacite/ui';

export interface AbaciteNative {
  readonly version: string;
  /** Replaces the menu bar. */
  setMenu(items: readonly NativeMenuItem[]): void;
  /** A menu bar item was chosen. */
  onCommand(fn: (id: string) => void): void;
  /** Grows the window to at least this width, for the Scientific keypad or the tape (PRD §9.1). */
  fitWidth(width: number): void;
  /** The remembered tape folder, whether it is there, and the default one (PRD §8.2). */
  folderInfo(): Promise<{ folder: string | null; missing: boolean; defaultFolder: string }>;
  /** Makes Documents/Abacite the tape folder, creating it. */
  useDefaultFolder(): Promise<string>;
  /** Asks the user for a tape folder; null when they cancel. */
  chooseFolder(): Promise<string | null>;
  /** One call on the tape folder: `list`, `read`, `write` or `move`. */
  folder(op: string, args: readonly unknown[]): Promise<NativeReply>;
}

export function nativeBridge(): AbaciteNative | null {
  return (globalThis as { abaciteNative?: AbaciteNative }).abaciteNative ?? null;
}
