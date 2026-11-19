import { effect } from '@preact/signals';
import { render } from 'preact';
import '@abacite/ui/styles.css';
import './app.css';
import { listenForKeys, localSettings } from '@abacite/ui';
import { App } from './app/App.tsx';
import { buildCommands } from './app/commands.ts';
import { AppController } from './app/controller.ts';
import { nativeBridge } from './app/native.ts';
import { menuSender, nativeMenu, watchMenuInputs } from './app/nativeMenu.ts';
import pkg from '../package.json';

const root = document.getElementById('app')!;
const native = nativeBridge();

function start(): void {
  const app = new AppController({
    settings: localSettings(),
    version: native?.version ?? pkg.version,
    ...(native ? { fitWidth: (width: number) => native.fitWidth(width) } : {}),
  });
  const catalog = buildCommands(app);
  render(<App app={app} catalog={catalog} />, root);

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
    () => app.blocked(),
    () => document.querySelector<HTMLElement>('[data-ab-line]'),
    (key) => app.typeKey(key),
  );
  if (import.meta.env.DEV) Object.assign(globalThis, { abacite: { app, catalog } });

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
    watchMenuInputs(app, () => menu.send(nativeMenu(catalog)));
    menu.send(nativeMenu(catalog));
  }
}

try {
  start();
} catch (e: unknown) {
  console.error(e);
  root.textContent = `Abacite couldn't start: ${e instanceof Error ? e.message : String(e)}`;
}
