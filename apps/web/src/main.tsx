import { effect, signal } from '@preact/signals';
import { render } from 'preact';
import '@abacite/ui/styles.css';
import './app.css';
import { every, listenForKeys, localKeep, localSettings } from '@abacite/ui';
import { App } from './app/App.tsx';
import { buildCommands } from './app/commands.ts';
import { AppController } from './app/controller.ts';
import { nativeBridge, type Release } from './app/native.ts';
import { menuSender, nativeMenu, watchMenuInputs } from './app/nativeMenu.ts';
import { TapeFolders, browserPlatform, desktopPlatform } from './app/tapeFolders.ts';
import pkg from '../package.json';

const root = document.getElementById('app')!;
const native = nativeBridge();

function start(): void {
  const app = new AppController({
    settings: localSettings(),
    version: native?.version ?? pkg.version,
    ...(native ? { fitWidth: (width: number) => native.fitWidth(width) } : {}),
  });
  const folders = new TapeFolders(app, native ? desktopPlatform(native) : browserPlatform(), localKeep());
  const catalog = buildCommands(app, folders);
  const release = signal<Release | null>(null);
  render(<App app={app} catalog={catalog} folders={folders} release={release} />, root);
  void folders.start();
  native
    ?.latestRelease()
    .then((r) => (release.value = r))
    .catch((e: unknown) => console.warn('Could not check for updates:', e));
  watchTapeFolder(folders);

  // The theme lives on <html>, so dialogs and the body follow it too (PRD §11).
  effect(() => {
    const { theme } = app.settings.value;
    const html = document.documentElement;
    if (theme === 'system') delete html.dataset.theme;
    else html.dataset.theme = theme;
  });

  listenForKeys(
    window,
    catalog,
    () => app.blocked() || folders.current.value === null,
    () => document.querySelector<HTMLElement>('[data-ab-line]'),
    (key) => app.typeKey(key),
  );
  if (import.meta.env.DEV) Object.assign(globalThis, { abacite: { app, catalog, folders } });

  if (native) {
    const menu = menuSender((items) => native.setMenu(items));
    native.onCommand((id) => {
      // A clicked checkbox item flips its own checkmark; send the menu again so it shows the real state.
      menu.forget();
      queueMicrotask(() => menu.send(nativeMenu(catalog)));
      // Menu accelerators reach the app before the page. In a dialog's text field, the field keeps its keys.
      const el = document.activeElement;
      const inText = !!el?.closest('input, textarea, select') && !el.closest('[data-ab-line]');
      if (inText && !catalog.get(id)?.global) return;
      catalog.run(id);
    });
    addEventListener('focus', () => {
      menu.forget();
      menu.send(nativeMenu(catalog));
    });
    watchMenuInputs(app, () => menu.send(nativeMenu(catalog)), [folders.current]);
    menu.send(nativeMenu(catalog));
  }
}

/**
 * Picks up changes made elsewhere when the window comes to the front and every 15 s while it's in front, and
 * keeps a snapshot of unsaved work every 30 s and when the page goes away (PRD §8.3).
 */
function watchTapeFolder(folders: TapeFolders): void {
  const inFront = () => document.visibilityState === 'visible' && document.hasFocus();
  const check = () => {
    folders.current.value?.check().catch((e: unknown) => console.warn('Couldn’t check the tape file:', e));
  };
  const snapshot = () => folders.current.value?.snapshot();
  addEventListener('focus', check);
  every(15_000, () => {
    if (inFront()) check();
  });
  every(30_000, snapshot);
  addEventListener('pagehide', snapshot);
}

try {
  start();
} catch (e: unknown) {
  console.error(e);
  root.textContent = `Abacite couldn't start: ${e instanceof Error ? e.message : String(e)}`;
}
