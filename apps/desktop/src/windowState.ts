// Where the window opens (PRD §9.1): the size and place it had when it last closed, kept on a screen that is
// still there. No Electron imports, so the tests can run it in Node.
import { randomUUID } from 'node:crypto';
import { renameSync, rmSync, writeFileSync } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SavedWindow extends Rect {
  readonly maximized: boolean;
}

/** The saved window, or null when the file is missing or doesn't hold one. */
export function parseSavedWindow(raw: unknown): SavedWindow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
  const x = n(r.x);
  const y = n(r.y);
  const width = n(r.width);
  const height = n(r.height);
  if (x === null || y === null || width === null || height === null || width <= 0 || height <= 0) return null;
  return { x, y, width, height, maximized: r.maximized === true };
}

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Where to open the window. The saved bounds go on the screen they overlap most, shrunk to fit its usable area
 * and moved fully onto it; bounds on no screen any more (a display unplugged) open centred on `fallback`'s
 * screen at the saved size, as far as it fits. Nothing saved: `fallback`.
 */
export function placeWindow(
  saved: SavedWindow | null,
  workAreas: readonly Rect[],
  fallback: Rect,
  min: { readonly width: number; readonly height: number },
): SavedWindow {
  if (!saved) return { ...fallback, maximized: false };
  let area: Rect | null = null;
  let best = 0;
  for (const a of workAreas) {
    const o = overlap(saved, a);
    if (o > best) {
      best = o;
      area = a;
    }
  }
  const onScreen = area !== null;
  const target = area ?? fallback;
  const width = Math.max(Math.min(saved.width, target.width), Math.min(min.width, target.width));
  const height = Math.max(Math.min(saved.height, target.height), Math.min(min.height, target.height));
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  const x = onScreen
    ? clamp(saved.x, target.x, target.x + target.width - width)
    : target.x + Math.round((target.width - width) / 2);
  const y = onScreen
    ? clamp(saved.y, target.y, target.y + target.height - height)
    : target.y + Math.round((target.height - height) / 2);
  return { x, y, width, height, maximized: saved.maximized };
}

export async function loadSavedWindow(file: string): Promise<SavedWindow | null> {
  try {
    return parseSavedWindow(JSON.parse(await readFile(file, 'utf8')));
  } catch {
    return null;
  }
}

/** Writes beside the file, then renames over it, so a crash never leaves half a file. */
export async function saveWindow(file: string, w: SavedWindow): Promise<void> {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(w) + '\n');
    await rename(temp, file);
  } catch (e) {
    await rm(temp, { force: true });
    throw e;
  }
}

/** `saveWindow`, finished before it returns: for closing, when the app may quit before a promise settles. */
export function saveWindowSync(file: string, w: SavedWindow): void {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, JSON.stringify(w) + '\n');
    renameSync(temp, file);
  } catch (e) {
    rmSync(temp, { force: true });
    throw e;
  }
}

/**
 * The window width that gives the page `pageWidth` CSS pixels: scaled by the page's zoom, plus the window's
 * frame (`frame`: the outer width less the content width; 0 on macOS, a border on Windows and Linux).
 */
export function outerWidth(pageWidth: number, zoom: number, frame: number): number {
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  // Rounded first, so float error (720 × 1.1 = 792.0000000000001) doesn't add a pixel.
  return Math.ceil(Math.round(pageWidth * scale * 1000) / 1000) + Math.max(0, frame);
}

/**
 * The window grown to at least `width` (the Scientific keypad or the session, PRD §9.1), kept on its screen:
 * never wider than the screen, and moved left when it would run off the right edge. Null when it is wide enough.
 */
export function widened(bounds: Rect, width: number, area: Rect): Rect | null {
  const wanted = Math.min(width, area.width);
  if (bounds.width >= wanted) return null;
  const x = Math.max(area.x, Math.min(bounds.x, area.x + area.width - wanted));
  return { x, y: bounds.y, width: wanted, height: bounds.height };
}

/**
 * The window after the page's layout grew or shrank by `change` window pixels (PRD §9.1): showing the session or
 * the Scientific keypad adds its width, at least up to `atLeast`, kept on the screen; hiding it takes that width
 * away again, down to `minWidth`, keeping the left edge. Null when nothing changes.
 */
export function resized(
  bounds: Rect,
  change: number,
  atLeast: number,
  area: Rect,
  minWidth: number,
): Rect | null {
  if (change > 0) return widened(bounds, Math.max(bounds.width + change, atLeast), area);
  const width = Math.max(bounds.width + change, minWidth);
  return width < bounds.width ? { ...bounds, width } : null;
}
