/**
 * Abacite desktop (PRD §12): one window running the web build from app://abacite/. The page reaches the
 * main process only through the preload's `abaciteNative`.
 */
import { app, BrowserWindow, ipcMain, Menu, nativeTheme, net, protocol, screen, shell } from 'electron';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Channels } from './bridge.ts';
import { editMenuTemplate, toTemplate, withStandardMenus } from './menu.ts';
import { appFile, dataPaths, isAppUrl, isHeadless } from './paths.ts';
import {
  loadSavedWindow,
  placeWindow,
  saveWindow,
  saveWindowSync,
  widened,
  type SavedWindow,
} from './windowState.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(here, 'web');
/** The compact Basic window, and the smallest it may be (PRD §9.1). */
const DEFAULT_SIZE = { width: 400, height: 620 };
const MIN_SIZE = { width: 300, height: 460 };
/** The widest the page may ask the window to grow. */
const MAX_FIT = 2000;
/**
 * `--headless` or ABACITE_HEADLESS=1 (automated checks): render offscreen, muted, on a throwaway profile, and
 * never put a window, Dock icon, menu or other app on the owner's screen. Native UI it would have shown is
 * recorded in `globalThis.abaciteHeadless` for the checks to read instead.
 */
const headless = isHeadless(process.argv, process.env);
if (headless) {
  app.dock?.hide();
  // Electron shows an uncaught main-process error in a dialog on the screen, hidden window or not. A headless
  // run writes it to stderr and exits with an error instead, so the check fails and nothing appears.
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception in the main process:', error);
    app.exit(1);
  });
}

interface HeadlessLog {
  /** Labels of each context menu that would have opened. */
  readonly contextMenus: string[][];
  /** Links that would have opened in the browser. */
  readonly openedLinks: string[];
}
const headlessLog: HeadlessLog = { contextMenus: [], openedLinks: [] };
if (headless) (globalThis as { abaciteHeadless?: HeadlessLog }).abaciteHeadless = headlessLog;

const paths = dataPaths(process.env, headless, () => mkdtempSync(path.join(tmpdir(), 'abacite-headless-')));
if (paths.userData) app.setPath('userData', paths.userData);
const windowFile = path.join(app.getPath('userData'), 'window-state.json');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let win: BrowserWindow | null = null;
let lastWindow: SavedWindow | null = null;

/** Only our own page may use the bridge. */
function trusted(e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean {
  return isAppUrl(e.senderFrame?.url);
}

/** Saves where the window is. On close it saves before returning, since the app quits right after. */
function rememberWindow(w: BrowserWindow, closing = false): void {
  if (headless || w.isDestroyed() || w.isMinimized()) return;
  const b = w.getNormalBounds();
  lastWindow = { ...b, maximized: w.isMaximized() };
  const failed = (e: unknown) => console.warn('Could not remember the window position:', e);
  if (!closing) {
    void saveWindow(windowFile, lastWindow).catch(failed);
    return;
  }
  try {
    saveWindowSync(windowFile, lastWindow);
  } catch (e) {
    failed(e);
  }
}

function createWindow(): BrowserWindow {
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const fallback = {
    x: area.x + Math.round((area.width - DEFAULT_SIZE.width) / 2),
    y: area.y + Math.round((area.height - DEFAULT_SIZE.height) / 3),
    width: Math.min(DEFAULT_SIZE.width, area.width),
    height: Math.min(DEFAULT_SIZE.height, area.height),
  };
  const placed = placeWindow(
    headless ? null : lastWindow,
    screen.getAllDisplays().map((d) => d.workArea),
    fallback,
    MIN_SIZE,
  );
  const w = new BrowserWindow({
    x: placed.x,
    y: placed.y,
    width: placed.width,
    height: placed.height,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    title: 'Abacite',
    show: false,
    // The page's window grey (--ab-window), so a slow first paint doesn't flash.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#ececee',
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      offscreen: headless,
      additionalArguments: [`--abacite-version=${app.getVersion()}`],
    },
  });
  if (headless) w.webContents.setAudioMuted(true);
  else
    w.once('ready-to-show', () => {
      if (placed.maximized) w.maximize();
      w.show();
    });
  let placeTimer: NodeJS.Timeout | null = null;
  const placeChanged = () => {
    if (placeTimer) clearTimeout(placeTimer);
    placeTimer = setTimeout(() => rememberWindow(w), 500);
  };
  for (const ev of ['move', 'resize', 'maximize', 'unmaximize'] as const) w.on(ev as 'move', placeChanged);
  w.on('close', () => {
    if (placeTimer) clearTimeout(placeTimer);
    rememberWindow(w, true);
  });
  w.on('closed', () => {
    if (placeTimer) clearTimeout(placeTimer);
    if (win === w) win = null;
  });

  // Electron shows no menu of its own on right-click; the expression line gets the edit menu.
  w.webContents.on('context-menu', (_e, params) => {
    const template = editMenuTemplate(params, {
      replace: (word) => w.webContents.replaceMisspelling(word),
      learn: (word) => w.webContents.session.addWordToSpellCheckerDictionary(word),
    });
    if (!template) return;
    if (headless) headlessLog.contextMenus.push(template.map((item) => item.label ?? item.role ?? '-'));
    else Menu.buildFromTemplate(template).popup({ window: w });
  });
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (!/^(https?|mailto):/i.test(url)) return { action: 'deny' };
    if (headless) headlessLog.openedLinks.push(url);
    else void shell.openExternal(url);
    return { action: 'deny' };
  });
  w.webContents.on('will-navigate', (e, url) => {
    if (!isAppUrl(url)) e.preventDefault();
  });
  void w.loadURL('app://abacite/index.html');
  return w;
}

/** Grows the window for the Scientific keypad or the tape, keeping it on its screen (PRD §9.1). */
function fitWidth(width: number): void {
  if (!win || win.isMaximized() || win.isFullScreen()) return;
  const bounds = win.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const next = widened(bounds, width, area);
  if (next) win.setBounds(next, !headless);
}

function registerIpc(): void {
  ipcMain.on(Channels.setMenu, (e, items: unknown) => {
    if (!trusted(e) || !Array.isArray(items)) return;
    const send = (id: string) => win?.webContents.send(Channels.command, id);
    try {
      const template = withStandardMenus(toTemplate(items, send), process.platform, !app.isPackaged);
      Menu.setApplicationMenu(Menu.buildFromTemplate(template));
    } catch (error) {
      // A bad accelerator, say: keep the menu bar there is rather than stop the main process.
      console.warn('Could not build the menu bar:', error);
    }
  });
  ipcMain.on(Channels.fitWidth, (e, width: unknown) => {
    if (!trusted(e) || typeof width !== 'number' || !Number.isFinite(width)) return;
    fitWidth(Math.min(Math.round(width), MAX_FIT));
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    // A headless run never brings anything forward.
    if (!win || headless) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  void app.whenReady().then(async () => {
    protocol.handle('app', (req) => {
      const file = appFile(webRoot, new URL(req.url).pathname);
      return file ? net.fetch(pathToFileURL(file).toString()) : new Response('Forbidden', { status: 403 });
    });
    registerIpc();
    lastWindow = await loadSavedWindow(windowFile);
    win = createWindow();
    app.on('activate', () => {
      if (!win) win = createWindow();
    });
  });
  // One window: closing it quits, on every platform (PRD §12).
  app.on('window-all-closed', () => app.quit());
}
