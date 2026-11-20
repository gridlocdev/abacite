/**
 * Abacite desktop (PRD §12): one window running the web build from app://abacite/. The page reaches the
 * main process only through the preload's `abaciteNative`.
 */
// First, so a headless run's error guard is in place before any other module runs.
import './headlessStart.ts';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  net,
  protocol,
  screen,
  session,
  shell,
} from 'electron';
import { mkdtempSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Channels } from './bridge.ts';
import {
  folderCall,
  folderExists,
  loadFolderChoice,
  saveFolderChoice,
  type FolderInfo,
} from './folderChoice.ts';
import { editMenuTemplate, toTemplate, withStandardMenus } from './menu.ts';
import {
  allowPermission,
  appRequestFile,
  dataPaths,
  HEADLESS_PREFIX,
  isAppUrl,
  isHeadless,
  removeStaleHeadlessProfiles,
} from './paths.ts';
import { NodeFolder } from './sessionFolder.ts';
import { checkForUpdate, fetchLatestRelease, isNewer, parseRelease, type Release } from './updates.ts';
import {
  loadSavedWindow,
  outerWidth,
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
interface HeadlessLog {
  /** Labels of each context menu that would have opened. */
  readonly contextMenus: string[][];
  /** Links that would have opened in the browser. */
  readonly openedLinks: string[];
  /** Open dialogs that would have been shown; each is answered with Cancel. */
  readonly dialogs: string[];
}
const headlessLog: HeadlessLog = { contextMenus: [], openedLinks: [], dialogs: [] };
if (headless) (globalThis as { abaciteHeadless?: HeadlessLog }).abaciteHeadless = headlessLog;

const paths = dataPaths(process.env, headless, () => {
  removeStaleHeadlessProfiles(tmpdir());
  return mkdtempSync(path.join(tmpdir(), HEADLESS_PREFIX));
});
if (paths.userData) app.setPath('userData', paths.userData);
const windowFile = path.join(app.getPath('userData'), 'window-state.json');
const folderFile = path.join(app.getPath('userData'), 'folder.json');
const updatesFile = path.join(app.getPath('userData'), 'updates.json');
// A check's Documents folder is inside its own profile, so "Use Documents/Abacite" never touches the owner's.
if (paths.userData) app.setPath('documents', path.join(paths.userData, 'Documents'));

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let win: BrowserWindow | null = null;
/** The session folder in use, once the page has one (PRD §8.2). */
let sessionFolder: NodeFolder | null = null;
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
    // macOS ignores this and shows the bundle's icon.icns.
    ...(process.platform === 'darwin' ? {} : { icon: path.join(here, '..', 'build', 'icon.png') }),
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
  // Any frame, not only the main one, stays on the app's own pages.
  w.webContents.on('will-frame-navigate', (e) => {
    if (!isAppUrl(e.url)) e.preventDefault();
  });
  void w.loadURL('app://abacite/index.html');
  return w;
}

/**
 * Grows the window for the Scientific keypad or the session, keeping it on its screen (PRD §9.1). `width` is in
 * the page's CSS pixels.
 */
function fitWidth(width: number): void {
  if (!win || win.isMaximized() || win.isFullScreen()) return;
  const bounds = win.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const frame = bounds.width - win.getContentBounds().width;
  const next = widened(bounds, outerWidth(width, win.webContents.getZoomFactor(), frame), area);
  if (next) win.setBounds(next, !headless);
}

/** Makes `dir` the session folder and remembers it. */
async function useFolder(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  await saveFolderChoice(folderFile, dir);
  sessionFolder = new NodeFolder(dir);
  return dir;
}

function registerFolderIpc(): void {
  const defaultFolder = () => path.join(app.getPath('documents'), 'Abacite');
  const refuse = () => Promise.reject(new Error('Not our page.'));
  ipcMain.handle(Channels.folderInfo, async (e): Promise<FolderInfo> => {
    if (!trusted(e)) return refuse();
    const folder = await loadFolderChoice(folderFile);
    const missing = folder !== null && !(await folderExists(folder));
    sessionFolder = folder && !missing ? new NodeFolder(folder) : null;
    return { folder, missing, defaultFolder: defaultFolder() };
  });
  ipcMain.handle(Channels.useDefaultFolder, (e) => (trusted(e) ? useFolder(defaultFolder()) : refuse()));
  ipcMain.handle(Channels.chooseFolder, async (e): Promise<string | null> => {
    if (!trusted(e)) return refuse();
    if (headless || !win) {
      headlessLog.dialogs.push('Choose Session Folder');
      return null;
    }
    const picked = await dialog.showOpenDialog(win, {
      title: 'Choose Session Folder',
      buttonLabel: 'Use Folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    const dir = picked.filePaths[0];
    return picked.canceled || !dir ? null : useFolder(dir);
  });
  ipcMain.handle(Channels.folder, (e, op: unknown, args: unknown) =>
    trusted(e) ? folderCall(sessionFolder, op, args) : refuse(),
  );
  ipcMain.handle(Channels.exportSession, async (e, name: unknown, text: unknown): Promise<boolean> => {
    if (!trusted(e) || typeof name !== 'string' || typeof text !== 'string') return refuse();
    if (headless || !win) {
      headlessLog.dialogs.push('Export Session');
      return false;
    }
    const picked = await dialog.showSaveDialog(win, {
      title: 'Export Session',
      defaultPath: path.join(app.getPath('documents'), `${name}.txt`),
      filters: [{ name: 'Text', extensions: ['txt'] }],
    });
    if (picked.canceled || !picked.filePath) return false;
    await writeFile(picked.filePath, text, 'utf8');
    return true;
  });
}

/**
 * A newer release, or null (PRD §12). A headless run never goes online: it reports the release in
 * ABACITE_TEST_RELEASE (GitHub's JSON), if any, so the checks can see the notice.
 */
async function latestRelease(): Promise<Release | null> {
  if (headless) {
    const raw = process.env.ABACITE_TEST_RELEASE;
    const release = raw ? parseRelease(JSON.parse(raw)) : null;
    return release && isNewer(release.version, app.getVersion()) ? release : null;
  }
  try {
    return await checkForUpdate({
      file: updatesFile,
      current: app.getVersion(),
      now: Date.now(),
      latest: () => fetchLatestRelease(net.fetch as typeof fetch),
    });
  } catch (e) {
    // Offline, or GitHub is down: the app works the same, and tomorrow's start asks again.
    console.warn('Could not check for updates:', e);
    return null;
  }
}

function registerIpc(): void {
  registerFolderIpc();
  ipcMain.handle(Channels.latestRelease, (e) =>
    trusted(e) ? latestRelease() : Promise.reject(new Error('Not our page.')),
  );
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
    // Until the page sends its menu: no reload or developer tools in a packaged app.
    Menu.setApplicationMenu(Menu.buildFromTemplate(withStandardMenus([], process.platform, !app.isPackaged)));
    session.defaultSession.setPermissionRequestHandler((_wc, permission, done, details) =>
      done(allowPermission(permission, details.requestingUrl)),
    );
    session.defaultSession.setPermissionCheckHandler((_wc, permission, origin, details) =>
      allowPermission(permission, details.requestingUrl ?? origin),
    );
    protocol.handle('app', (req) => {
      const file = appRequestFile(webRoot, req.url);
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
