// Desktop smoke test: the built Electron app starts headless (no window, Dock icon or system dialog) on a
// throwaway profile and calculates. `just e2e-desktop` builds it first. The throwaway profile matters: the app
// must never read the owner's settings or window state.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication } from '@playwright/test';
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

test.describe('Desktop and browser', () => {
  test('the desktop app starts headless, calculates and keeps its settings', async () => {
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
        await waitForApp(window);
        await window.keyboard.type('2*(3+4)');
        await expect(display(window)).toHaveText('14');
        await window.keyboard.press('Enter');
        await window.keyboard.press('ControlOrMeta+2');
        await expect(window.getByRole('group', { name: 'Scientific keys' })).toBeVisible();
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
      await waitForApp(window);
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

  test('an uncaught error in a headless run exits instead of showing a dialog', async () => {
    const temp = realpathSync(mkdtempSync(path.join(tmpdir(), 'abacite-e2e-')));
    const app = await electron.launch({
      cwd: DESKTOP,
      args: ['out/main.js', '--headless'],
      env: { ...process.env, ABACITE_USER_DATA: path.join(temp, 'profile') },
    });
    const child = app.process();
    try {
      await waitForApp(await app.firstWindow());
      const exited = new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)));
      await app.evaluate(() => {
        setTimeout(() => {
          throw new Error('a deliberate error from the check');
        });
      });
      expect(await exited, 'the app exits with an error code').toBe(1);
    } finally {
      if (child.exitCode === null) child.kill();
      rmSync(temp, { recursive: true, force: true });
    }
    await expect
      .poll(() => alive(child.pid!), { message: 'no Electron process is left running' })
      .toBe(false);
  });
});
