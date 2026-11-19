// Desktop smoke test: the built Electron app starts headless (no window, Dock icon or system dialog) on a
// throwaway profile and calculates. `just e2e-desktop` builds it first. The throwaway profile matters: the app
// must never read the owner's settings or window state.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';
import { display, expect, test, waitForApp, watchErrors } from './fixtures.ts';

const DESKTOP = fileURLToPath(new URL('../apps/desktop', import.meta.url));

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
        await app.close();
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
        await again.close();
      }
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
