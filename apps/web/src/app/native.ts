/** What the desktop app's preload script puts on `window.abaciteNative` (PRD §12). */
import type { NativeMenuItem } from '@abacite/ui';

export interface AbaciteNative {
  readonly version: string;
  /** Replaces the menu bar. */
  setMenu(items: readonly NativeMenuItem[]): void;
  /** A menu bar item was chosen. */
  onCommand(fn: (id: string) => void): void;
  /** Grows the window to at least this width, for the Scientific keypad or the tape (PRD §9.1). */
  fitWidth(width: number): void;
}

export function nativeBridge(): AbaciteNative | null {
  return (globalThis as { abaciteNative?: AbaciteNative }).abaciteNative ?? null;
}
