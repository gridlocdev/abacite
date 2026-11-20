// Desktop smoke test: the built Electron app starts headless (no window, Dock icon or system dialog) on a
// throwaway profile and calculates. `just e2e-desktop` builds it first. The throwaway profile matters: the app
// must never read the owner's settings or window state.
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { display, expect, test, waitForApp, watchErrors } from './fixtures.ts';

const DESKTOP = fileURLToPath(new URL('../apps/desktop', import.meta.url));

/** True while the process is still running. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Closes the app and checks that its main process is gone (Electron's helpers exit with it). */
async function closeApp(app: ElectronApplication): Promise<void> {
  const pid = app.process().pid!;
  await app.close();
  await expect.poll(() => alive(pid), { message: 'no Electron process is left running' }).toBe(false);
}

/** A first start on a fresh profile asks where to keep sessions: take Documents/Abacite (inside the profile). */
async function firstStart(window: Page): Promise<void> {
  const question = window.getByRole('dialog', { name: 'Where should Abacite keep sessions?' });
  await question.getByRole('button', { name: 'Use Documents/Abacite' }).click();
  await expect(question).toBeHidden();
  await waitForApp(window);
}

test.describe('Desktop and browser', () => {
  test('the desktop app starts headless, calculates, keeps its settings and grants nothing but the clipboard', async () => {
    // realpath: macOS's temp folder is behind a symlink, and the app may report the real path.
    const temp = realpathSync(mkdtempSync(path.join(tmpdir(), 'abacite-e2e-')));
    const profile = path.join(temp, 'profile');
    const launch = () =>
      electron.launch({
        cwd: DESKTOP,
        // The main script by name (the built one package.json points at), so nothing else is read as an argument.
        args: ['out/main.js'],
        env: { ...process.env, ABACITE_HEADLESS: '1', ABACITE_USER_DATA: profile },
      });
    try {
      const app = await launch();
      try {
        expect(await app.evaluate(({ app }) => app.getPath('userData')), 'the throwaway profile').toBe(
          profile,
        );
        const window = await app.firstWindow();
        const errors = watchErrors(window);
        await firstStart(window);
        if (process.platform === 'darwin') {
          // No title bar: the page's top row drags the window, and the buttons in it still click.
          const chrome = await window.evaluate(() => ({
            unified: document.documentElement.classList.contains('ab-unified'),
            strip: getComputedStyle(document.querySelector('.ab-calc')!, '::before').getPropertyValue(
              '-webkit-app-region',
            ),
            head: getComputedStyle(
              document.querySelector('.ab-session-head') ?? document.body,
            ).getPropertyValue('-webkit-app-region'),
            key: getComputedStyle(document.querySelector('.ab-key')!).getPropertyValue('-webkit-app-region'),
          }));
          expect(chrome).toMatchObject({ unified: true, strip: 'drag', key: 'no-drag' });
        }
        await window.keyboard.type('2*(3+4)');
        await expect(display(window)).toHaveText('14');
        await window.keyboard.press('Enter');
        // The one session, named for when it was made (`2026-11-19 at 2.05 PM.txt`).
        const folder = path.join(profile, 'Documents', 'Abacite');
        const saved = () => {
          const names = readdirSync(folder).filter((n) => n.endsWith('.txt'));
          expect(names).toEqual([expect.stringMatching(/^\d{4}-\d{2}-\d{2} at \d{1,2}\.\d{2} [AP]M\.txt$/)]);
          return readFileSync(path.join(folder, names[0]!), 'utf8');
        };
        await expect.poll(saved, { message: 'the session is saved' }).toBe('2*(3+4)  # = 14\n');
        // The page may write to the clipboard (Copy Result) and nothing else.
        const permission = (name: string) =>
          window.evaluate(
            async (n) => (await navigator.permissions.query({ name: n as PermissionName })).state,
            name,
          );
        expect(await permission('clipboard-write')).toBe('granted');
        expect(await permission('geolocation')).toBe('denied');
        expect(await permission('notifications')).toBe('denied');
        await window.keyboard.press('ControlOrMeta+2');
        await expect(window.getByRole('group', { name: 'Scientific keys' })).toBeVisible();
        // Choosing the mode that is already on: Electron unticks the item, and the page puts the tick back.
        const scientificChecked = () =>
          app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById('view.scientific')?.checked);
        await expect.poll(scientificChecked).toBe(true);
        await app.evaluate(({ Menu }) =>
          Menu.getApplicationMenu()?.getMenuItemById('view.scientific')?.click(),
        );
        await expect.poll(scientificChecked, { message: 'the menu shows the real mode again' }).toBe(true);
        expect(
          await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.isVisible())),
          'no window shows on the screen',
        ).toBe(false);
        expect(errors).toEqual([]);
      } finally {
        await closeApp(app);
      }

      const again = await launch();
      try {
        const window = await again.firstWindow();
        const errors = watchErrors(window);
        await waitForApp(window);
        await expect(
          window.getByRole('group', { name: 'Scientific keys' }),
          'the keypad is remembered',
        ).toBeVisible();
        await expect(window.getByTestId('display'), 'the session is reopened').toHaveText('14');
        expect(errors).toEqual([]);
      } finally {
        await closeApp(again);
      }
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  test('--headless alone runs muted on a throwaway profile and shows no native UI', async () => {
    // The app's temporary folder goes in one of the test's own, which the test removes afterwards.
    const temp = realpathSync(mkdtempSync(path.join(tmpdir(), 'abacite-e2e-')));
    const { ABACITE_HEADLESS: _headless, ABACITE_USER_DATA: _userData, ...inherited } = process.env;
    const env = { ...inherited, TMPDIR: temp };
    const app = await electron.launch({ cwd: DESKTOP, args: ['out/main.js', '--headless'], env });
    try {
      const profile = realpathSync(await app.evaluate(({ app }) => app.getPath('userData')));
      expect(path.dirname(profile), 'a profile made for this run').toBe(temp);
      expect(path.basename(profile)).toMatch(/^abacite-headless-/);
      const window = await app.firstWindow();
      const errors = watchErrors(window);
      await firstStart(window);
      expect(
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]!.webContents.isAudioMuted(),
        ),
      ).toBe(true);
      // A right-click is recorded, not shown as a menu on the screen.
      await window.getByRole('textbox', { name: 'Expression' }).click({ button: 'right' });
      await expect
        .poll(() =>
          app.evaluate(
            () =>
              (globalThis as { abaciteHeadless?: { contextMenus: string[][] } }).abaciteHeadless?.contextMenus
                .length,
          ),
        )
        .toBe(1);
      expect(
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.isVisible())),
        'no window shows on the screen',
      ).toBe(false);
      expect(errors).toEqual([]);
    } finally {
      await closeApp(app);
      rmSync(temp, { recursive: true, force: true });
    }
  });

  test('a newer release shows in the status bar, and Download opens its page', async () => {
    const temp = realpathSync(mkdtempSync(path.join(tmpdir(), 'abacite-e2e-')));
    const page = 'https://github.com/gridlocdev/abacite/releases/tag/v99.0.0';
    const app = await electron.launch({
      cwd: DESKTOP,
      args: ['out/main.js'],
      env: {
        ...process.env,
        ABACITE_HEADLESS: '1',
        ABACITE_USER_DATA: path.join(temp, 'profile'),
        ABACITE_TEST_RELEASE: JSON.stringify({ tag_name: 'v99.0.0', html_url: page }),
      },
    });
    try {
      const window = await app.firstWindow();
      const errors = watchErrors(window);
      await firstStart(window);
      await expect(window.locator('.ab-notice')).toContainText('Abacite 99.0.0 is available.');
      await window.getByRole('link', { name: 'Download' }).click();
      await expect
        .poll(() =>
          app.evaluate(
            () =>
              (globalThis as { abaciteHeadless?: { openedLinks: string[] } }).abaciteHeadless?.openedLinks,
          ),
        )
        .toEqual([page]);
      expect(errors).toEqual([]);
    } finally {
      await closeApp(app);
      rmSync(temp, { recursive: true, force: true });
    }
  });

  for (const [kind, crash] of [
    ['an uncaught exception', 'throw'],
    ['an unhandled rejection', 'reject'],
  ] as const) {
    test(`${kind} in a headless run exits instead of showing a dialog`, async () => {
      const temp = realpathSync(mkdtempSync(path.join(tmpdir(), 'abacite-e2e-')));
      const app = await electron.launch({
        cwd: DESKTOP,
        args: ['out/main.js', '--headless'],
        env: { ...process.env, ABACITE_USER_DATA: path.join(temp, 'profile') },
      });
      const child = app.process();
      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      try {
        await firstStart(await app.firstWindow());
        const exited = new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)));
        await app.evaluate((_electron, how) => {
          setTimeout(() => {
            const error = new Error('a deliberate error from the check');
            if (how === 'throw') throw error;
            void Promise.reject(error);
          });
        }, crash);
        expect(await exited, 'the app exits with an error code').toBe(1);
        expect(stderr).toContain('a deliberate error from the check');
      } finally {
        if (child.exitCode === null) child.kill();
        rmSync(temp, { recursive: true, force: true });
      }
      await expect
        .poll(() => alive(child.pid!), { message: 'no Electron process is left running' })
        .toBe(false);
    });
  }
});
