// Scenarios for the calculator in the browser: each test.describe names a feature in docs/features.md.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Page } from '@playwright/test';
import {
  cli,
  commandMenu,
  display,
  expect,
  FIRST_SESSION,
  expression,
  key,
  notice,
  openApp,
  runCommand,
  storedSession,
  session,
  test,
  waitForApp,
} from './fixtures.ts';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test.describe('Expression line', () => {
  test('shows the result live as you type, and Enter commits it', async ({ page }) => {
    await page.keyboard.type('2*(3+4');
    await expect(display(page)).toHaveText('14');
    await expect(page.locator('.ab-line-mirror .ab-ghost')).toHaveText(')');
    await page.keyboard.press('Enter');
    await expect(expression(page)).toHaveValue('');
    await expect(display(page)).toHaveText('14');
  });

  test('a line that starts with an operator continues from the last result', async ({ page }) => {
    await page.keyboard.type('10');
    await page.keyboard.press('Enter');
    await page.keyboard.type('*3');
    await expect(page.locator('.ab-line-mirror .ab-ghost')).toHaveText('ans ');
    await expect(display(page)).toHaveText('30');
    await page.keyboard.press('Enter');
    // Enter on an empty line repeats the last operation.
    await page.keyboard.press('Enter');
    await expect(display(page)).toHaveText('90');
  });

  test('an unfinished line waits, and a wrong one says why', async ({ page }) => {
    await page.keyboard.type('2+');
    await expect(display(page)).toHaveClass(/ab-value-pending/);
    await page.keyboard.type('foo ');
    // The quoted name shows in code style, without the backticks.
    await expect(display(page)).toHaveText('foo isn’t defined.');
    await expect(display(page).locator('code')).toHaveText('foo');
    await page.keyboard.press('Escape');
    await expect(expression(page)).toHaveValue('');
  });

  test('variables keep their values', async ({ page }) => {
    await page.keyboard.type('rate = 1.25');
    await page.keyboard.press('Enter');
    await page.keyboard.type('80 rate');
    await expect(display(page)).toHaveText('100');
  });

  test('dragging over the result selects it to copy, and a click on empty space brings the line back', async ({
    page,
  }) => {
    await page.keyboard.type('123456789*9');
    await page.keyboard.press('Enter');
    const box = (await display(page).boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width - 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + 2, y, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('1,111,111,101');
    await expect(expression(page)).not.toBeFocused();
    await page.mouse.click(box.x + box.width / 2, 2);
    await expect(expression(page)).toBeFocused();
  });
});

test.describe('Exact decimals', () => {
  test('decimal fractions add up exactly', async ({ page }) => {
    await page.keyboard.type('0.1 + 0.2');
    await expect(display(page)).toHaveText('0.3');
    await page.keyboard.press('Escape');
    await page.keyboard.type('1/3');
    await expect(display(page)).toHaveText(`0.${'3'.repeat(32)}`);
  });

  test('large results are grouped with commas', async ({ page }) => {
    await page.keyboard.type('1234567.5 * 2');
    await expect(display(page)).toHaveText('2,469,135');
  });
});

test.describe('Keypads', () => {
  test('the basic keys type into the expression line', async ({ page }) => {
    for (const name of ['7', 'Multiply', '6', 'Equals']) await key(page, name).click();
    await expect(display(page)).toHaveText('42');
    await expect(expression(page)).toBeFocused();
  });

  test('typing after tabbing to a key goes to the expression line', async ({ page }) => {
    await key(page, '7').focus();
    await page.keyboard.type('12');
    await expect(expression(page)).toHaveValue('12');
    await expect(expression(page)).toBeFocused();
  });

  test('Scientific adds functions, with second functions on 2nd', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+2');
    await expect(page.getByRole('group', { name: 'Scientific keys' })).toBeVisible();
    await key(page, 'Sine').click();
    await page.keyboard.type('30');
    await expect(display(page)).toHaveText('0.5');
    await page.keyboard.press('Escape');
    await key(page, 'Second functions').click();
    await expect(key(page, 'Second functions')).toHaveAttribute('aria-pressed', 'true');
    await key(page, 'Arcsine').click();
    await page.keyboard.type('0.5');
    await expect(display(page)).toHaveText('30');
    await page.keyboard.press('ControlOrMeta+1');
    await expect(page.getByRole('group', { name: 'Scientific keys' })).toBeHidden();
  });

  test('radians switch from the keypad and the shortcut', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+2');
    await key(page, 'Switch to radians').click();
    await expect(page.locator('.ab-display-flags')).toContainText('RAD');
    await page.keyboard.type('cos(pi)');
    await expect(display(page)).toHaveText('-1');
    await page.keyboard.press('ControlOrMeta+Shift+KeyR');
    await expect(page.locator('.ab-display-flags')).toContainText('DEG');
  });
});

test.describe('Memory', () => {
  test('m+ adds the result, mr recalls it, mc clears it, and M shows while it is set', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+2');
    const flags = page.locator('.ab-display-flags');
    await page.keyboard.type('5*3');
    await key(page, 'Memory add').click();
    await expect(flags).toContainText('M');
    await expect(session(page)).toBeHidden();
    await page.keyboard.type('2*');
    await key(page, 'Memory recall').click();
    await expect(expression(page)).toHaveValue('2*mem');
    await expect(display(page)).toHaveText('30');
    await page.keyboard.press('Escape');
    await key(page, 'Memory clear').click();
    await expect(flags).not.toContainText('M');
    await page.keyboard.press('ControlOrMeta+T');
    await expect(session(page).getByRole('button')).toContainText(['5*3', 'mem = mem + 15', 'mem = 0']);
  });
});

test.describe('Unit conversion', () => {
  test('converts a value with units and shows the unit beside the result', async ({ page }) => {
    await page.keyboard.type('5 in to cm');
    await expect(display(page)).toHaveText('12.7 cm');
    await page.keyboard.press('Enter');
    await page.keyboard.type('5 km to kg');
    await page.keyboard.press('Enter');
    await expect(display(page)).toHaveText('Can’t convert km to kg.');
    await page.keyboard.press('ControlOrMeta+T');
    await expect(session(page).getByRole('listitem')).toHaveText([
      /5 in to cm\s*12\.7 cm/,
      /5 km to kg\s*Can’t convert km to kg\./,
    ]);
  });
});

test.describe('Classic entry', () => {
  test('⌘E works the keypad like a pocket calculator and puts the calculation in the session', async ({
    page,
  }) => {
    await page.keyboard.press('ControlOrMeta+E');
    await expect(expression(page)).toBeHidden();
    await expect(page.locator('.ab-display-flags')).toContainText('CLASSIC');
    await page.keyboard.type('2+3*');
    await expect(page.getByTestId('pending')).toHaveText('2 + 3 ×');
    await expect(display(page)).toHaveText('3');
    await key(page, '4').click();
    await key(page, 'Subtract').click();
    await expect(display(page)).toHaveText('14');
    await page.keyboard.type('1');
    await page.keyboard.press('Enter');
    await expect(display(page)).toHaveText('13');
    await page.keyboard.type('9');
    await key(page, 'Change sign').click();
    await page.keyboard.press('Backspace');
    await expect(display(page)).toHaveText('0');
    await page.keyboard.press('Escape');
    await page.keyboard.press('ControlOrMeta+T');
    await expect(session(page).getByRole('listitem')).toHaveText([/2 \+ 3 \* 4 - 1\s*13/]);
    await page.keyboard.press('ControlOrMeta+E');
    await expect(expression(page)).toBeVisible();
  });
});

test.describe('Session', () => {
  test('keeps every committed line, and ↑ brings one back', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+KeyT');
    await expect(session(page)).toBeVisible();
    for (const line of ['5+3', 'x = 7', '1/0']) {
      await page.keyboard.type(line);
      await page.keyboard.press('Enter');
    }
    const lines = session(page).getByRole('listitem');
    await expect(lines).toHaveText([/5\+3\s*8/, /x = 7\s*x = 7/, /1\/0\s*Can’t divide by zero\./]);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(expression(page)).toHaveValue('x = 7');
    await page.keyboard.press('Escape');
    // A click inserts the line's result.
    await lines.first().getByRole('button').click();
    await expect(expression(page)).toHaveValue('8');
  });

  test('the panel button in the status bar shows and hides the session, and keeps the line focused', async ({
    page,
  }) => {
    const toggle = page.getByRole('button', { name: 'Session panel' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveAttribute('title', /^Show Session \(.+T\)$/);
    await toggle.click();
    await expect(session(page)).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toHaveAttribute('title', /^Hide Session/);
    await expect(expression(page)).toBeFocused();
    await toggle.click();
    await expect(session(page)).toBeHidden();
  });

  test('Clear Session can be undone', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+KeyT');
    await page.keyboard.type('2+2');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ControlOrMeta+Shift+Backspace');
    await expect(session(page).getByRole('listitem')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(session(page).getByRole('listitem')).toHaveCount(1);
  });

  test('a line’s menu deletes it, and ⌘Z puts it back', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+KeyT');
    for (const line of ['x = 4', 'x * 2']) {
      await page.keyboard.type(line);
      await page.keyboard.press('Enter');
    }
    const lines = session(page).getByRole('listitem');
    await lines.first().getByRole('button').click({ button: 'right' });
    const menu = page.getByRole('menu', { name: 'Session line' });
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Copy Result',
      'Copy Expression',
      'Insert Result',
      'Insert Expression',
      'Delete Line',
    ]);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(menu).toBeHidden();
    await expect(lines).toHaveText([/x \* 2\s*x isn’t defined\./]);
    await expect(expression(page)).toBeFocused();
    await page.keyboard.press('ControlOrMeta+KeyZ');
    await expect(lines).toHaveText([/x = 4/, /x \* 2\s*8/]);
    await page.keyboard.press('ControlOrMeta+Shift+KeyZ');
    await expect(lines).toHaveCount(1);
  });
});

test.describe('Session files', () => {
  const sessionName = (page: Page) => session(page).getByRole('heading').getByRole('button');

  test('each change is saved in the browser and is there after a reload', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+KeyT');
    await expect(sessionName(page)).toHaveText(FIRST_SESSION);
    await expect(page.getByText('Stored in this browser')).toBeVisible();
    await page.keyboard.type('1+2');
    await page.keyboard.press('Enter');
    await expect(session(page).getByRole('listitem')).toHaveText([/1\+2\s*3/]);
    await expect.poll(() => storedSession(page, FIRST_SESSION)).toBe('1+2  # = 3\n');
    await page.reload();
    await waitForApp(page);
    await expect(session(page).getByRole('listitem')).toHaveText([/1\+2\s*3/]);
  });

  test('without showDirectoryPicker, a folder picked with the file input opens read-only', async ({
    page,
  }) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'abacite-e2e-'));
    const folder = path.join(dir, 'Sessions');
    try {
      mkdirSync(folder);
      writeFileSync(path.join(folder, 'Sums.txt'), '1 + 2  # = 3\n');
      writeFileSync(path.join(folder, 'Rent.txt'), 'rent = 1450\n');
      // Firefox and Safari have no showDirectoryPicker: the app picks by feature, so this is their path.
      await page.addInitScript(() => {
        Object.defineProperty(window, 'showDirectoryPicker', { value: undefined });
      });
      await page.reload();
      await waitForApp(page);
      await page.keyboard.press('ControlOrMeta+KeyT');
      const chooser = page.waitForEvent('filechooser');
      await runCommand(page, 'Open Session Folder');
      await (await chooser).setFiles(folder);
      await expect(notice(page)).toHaveText(
        'Opened Sessions read-only. New lines aren’t saved; Export Session keeps a copy.',
      );
      await expect(sessionName(page)).toHaveText('Rent');

      // Calculating still works; the line stays in the tab, and the file is unchanged.
      await page.keyboard.type('rent*12');
      await page.keyboard.press('Enter');
      await expect(display(page)).toHaveText('17,400');
      expect(readFileSync(path.join(folder, 'Rent.txt'), 'utf8')).toBe('rent = 1450\n');

      // A command that writes is disabled, and the command menu says why.
      await page.keyboard.press('ControlOrMeta+KeyK');
      await page.keyboard.type('New Session');
      const option = page.getByRole('option', { name: /New Session/ });
      await expect(option).toHaveAttribute('aria-disabled', 'true');
      await expect(option).toContainText('Sessions is read-only in this browser.');
      await page.keyboard.press('Escape');
      await expect(page.getByText('Sessions is read-only: new lines aren’t saved')).toBeVisible();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('committing a line stays quick with a full session of 10,000 lines', async ({ page }) => {
    await page.evaluate(
      async ({ name, text }) => {
        const sessions = await (
          await navigator.storage.getDirectory()
        ).getDirectoryHandle('tapes', { create: true });
        const file = await (await sessions.getFileHandle(`${name}.txt`, { create: true })).createWritable();
        await file.write(text);
        await file.close();
      },
      { name: FIRST_SESSION, text: Array.from({ length: 10_000 }, (_, i) => `${i}+1`).join('\n') },
    );
    await page.reload();
    await waitForApp(page);
    await page.keyboard.press('ControlOrMeta+KeyT');
    await expect(session(page).getByRole('listitem')).toHaveCount(10_000);
    // The time from Enter to the next painted frame, the median of 9.
    const times = await page.evaluate(async () => {
      const line = document.querySelector<HTMLInputElement>('[data-ab-line]')!;
      const frame = () => new Promise((done) => requestAnimationFrame(() => setTimeout(done)));
      const out: number[] = [];
      for (let i = 0; i < 9; i++) {
        line.value = String(i);
        line.dispatchEvent(new InputEvent('input', { bubbles: true }));
        await frame();
        const start = performance.now();
        line.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        await frame();
        out.push(performance.now() - start);
      }
      return out.sort((a, b) => a - b);
    });
    await expect(session(page).getByRole('listitem').last()).toHaveText(/^8\s*8$/);
    // About 35 ms here; redrawing every row took 70 ms or more.
    expect(times[4]).toBeLessThan(55);
  });

  test('new, rename, delete with Undo, restore from the trash, and switch sessions', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+KeyT');
    await runCommand(page, 'New Session');
    await expect(sessionName(page)).toHaveText(`${FIRST_SESSION.replace(' PM', '')}.09 PM`);

    await runCommand(page, 'Rename Session');
    const rename = page.getByRole('dialog', { name: 'Rename Session' });
    await expect(rename.getByRole('textbox')).toBeFocused();
    await page.keyboard.type(FIRST_SESSION);
    await page.keyboard.press('Enter');
    await expect(rename.getByRole('alert')).toHaveText(`There’s already a session called ${FIRST_SESSION}.`);
    await page.keyboard.press('ControlOrMeta+KeyA');
    await page.keyboard.type('Groceries');
    await page.keyboard.press('Enter');
    await expect(rename).toBeHidden();
    await expect(sessionName(page)).toHaveText('Groceries');

    await runCommand(page, 'Delete Session');
    await expect(notice(page)).toContainText('Moved Groceries to the trash.');
    await expect(sessionName(page)).toHaveText(FIRST_SESSION);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(sessionName(page)).toHaveText('Groceries');

    await runCommand(page, 'Delete Session');
    await expect(sessionName(page)).toHaveText(FIRST_SESSION);
    await runCommand(page, 'Open Trash');
    const trash = page.getByRole('dialog', { name: 'Trash' });
    await trash.getByRole('button', { name: 'Restore Groceries' }).click();
    await expect(trash).toBeHidden();
    await expect(sessionName(page)).toHaveText('Groceries');

    await sessionName(page).click();
    const list = page.getByRole('dialog', { name: 'Open Session' });
    await expect(list.getByRole('option')).toHaveText([FIRST_SESSION, /Groceries/]);
    await page.keyboard.type('2.05 PM');
    await page.keyboard.press('Enter');
    await expect(list).toBeHidden();
    await expect(sessionName(page)).toHaveText(FIRST_SESSION);
    await expect(expression(page)).toBeFocused();
  });

  test('Export Session downloads the session as a text file', async ({ page }) => {
    await page.keyboard.type('6*7');
    await page.keyboard.press('Enter');
    const download = page.waitForEvent('download');
    await runCommand(page, 'Export Session');
    const file = await download;
    expect(file.suggestedFilename()).toBe(`${FIRST_SESSION}.txt`);
    expect(readFileSync(await file.path(), 'utf8')).toBe('6*7  # = 42\n');
    await expect(notice(page)).toContainText(`Exported ${FIRST_SESSION}.`);
  });
});

test.describe('Commands and shortcuts', () => {
  test('the status bar buttons name their shortcuts', async ({ page }) => {
    const mod = process.platform === 'darwin' ? '⌘' : 'Ctrl+';
    await expect(page.getByRole('button', { name: 'Settings' })).toHaveAttribute(
      'title',
      `Settings (${mod},)`,
    );
    await expect(page.getByRole('button', { name: 'Session panel' })).toHaveAttribute(
      'title',
      new RegExp(`Session \\(${mod.replace('+', '\\+')}T\\)$`),
    );
  });

  test('⌘K finds and runs a command', async ({ page }) => {
    await runCommand(page, 'Scientific');
    await expect(page.getByRole('group', { name: 'Scientific keys' })).toBeVisible();
    await expect(expression(page)).toBeFocused();
  });

  test('a shortcut blocked by an open window doesn’t reach the browser', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+K');
    await page.evaluate(() => {
      window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'c')
          (globalThis as { prevented?: boolean }).prevented = e.defaultPrevented;
      });
    });
    await page.keyboard.press('ControlOrMeta+Shift+C');
    const prevented = await page.evaluate(() => (globalThis as { prevented?: boolean }).prevented);
    expect(prevented).toBe(true);
  });

  test('the Keyboard Shortcuts window lists the keys', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+Slash');
    const dialog = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Calculate');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(expression(page)).toBeFocused();
  });

  test('Press a Shortcut names the command a key runs without running it, and Escape always lets go', async ({
    page,
  }) => {
    await page.keyboard.press('ControlOrMeta+Slash');
    const dialog = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
    await dialog.getByRole('button', { name: 'Press a Shortcut' }).click();
    const answer = dialog.getByRole('status');
    await page.keyboard.press('ControlOrMeta+K');
    await expect(answer).toContainText('runs Command Menu.');
    await expect(page.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeVisible();
    await page.keyboard.press('ControlOrMeta+Shift+Y');
    await expect(answer).toContainText('runs no command.');
    // The visible way out.
    await dialog.getByRole('button', { name: 'Stop' }).click();
    await expect(answer).toBeHidden();
    // Escape, from the mode, leaves it and closes the window as usual; keys then reach the app again.
    await dialog.getByRole('button', { name: 'Press a Shortcut' }).click();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.keyboard.press('ControlOrMeta+K');
    await expect(commandMenu(page)).toBeVisible();
  });
});

test.describe('Settings and appearance', () => {
  test('settings change the theme and are kept', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+Comma');
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await dialog.getByRole('radio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await dialog.getByRole('checkbox', { name: /Group digits/ }).uncheck();
    await page.keyboard.press('Escape');
    await page.keyboard.type('1234567');
    await expect(display(page)).toHaveText('1234567');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('a setting changed in one tab reaches the others', async ({ page, context }) => {
    const other = await context.newPage();
    await openApp(other);
    await page.keyboard.press('ControlOrMeta+Comma');
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('radio', { name: 'Dark' }).click();
    await expect(other.locator('html')).toHaveAttribute('data-theme', 'dark');
    await other.close();
  });

  test('it behaves like a desktop app: the arrow cursor, and only text fields select text', async ({
    page,
  }) => {
    const feel = await page.evaluate(() => {
      const style = (el: Element) => getComputedStyle(el);
      return {
        bodySelect: style(document.body).userSelect,
        keyCursor: style(document.querySelector('.ab-key')!).cursor,
        lineSelect: style(document.querySelector('[data-ab-line]')!).userSelect,
        overscroll: style(document.documentElement).overscrollBehaviorY,
      };
    });
    expect(feel).toEqual({
      bodySelect: 'none',
      keyCursor: 'default',
      lineSelect: 'text',
      overscroll: 'none',
    });
  });

  for (const width of [320, 400, 900]) {
    test(`the settings rows line up and fit a ${width} px window`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      await page.keyboard.press('ControlOrMeta+Comma');
      await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
      const layout = await page.evaluate(() => {
        const body = document.querySelector('.ab-dialog-body')!;
        const style = getComputedStyle(body);
        const right = body.getBoundingClientRect().right - parseFloat(style.paddingRight);
        const box = (el: Element) => el.getBoundingClientRect();
        const groups = [...body.querySelectorAll('[role="radiogroup"]')].map(box);
        const checks = [...body.querySelectorAll('.ab-check')].map(box);
        const clipped = [...body.querySelectorAll('[role="radio"]')]
          .filter((b) => b.scrollWidth > b.clientWidth)
          .map((b) => b.textContent);
        return {
          overflow: [...groups, ...checks].some((r) => r.right > right + 0.5),
          lefts: new Set([...groups, ...checks].map((r) => Math.round(r.left))).size,
          widths: new Set(groups.map((r) => Math.round(r.width))).size,
          clipped,
        };
      });
      expect(layout).toEqual({ overflow: false, lefts: 1, widths: 1, clipped: [] });
    });
  }
});

test.describe('Accessibility', () => {
  test('on a touch screen the status bar buttons are big enough for a finger', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      hasTouch: true,
      isMobile: true,
    });
    try {
      const phone = await context.newPage();
      await openApp(phone);
      for (const name of ['Settings', 'Session panel']) {
        const box = await phone.getByRole('button', { name }).boundingBox();
        expect(box?.width, name).toBeGreaterThanOrEqual(44);
        expect(box?.height, name).toBeGreaterThanOrEqual(44);
      }
    } finally {
      await context.close();
    }
  });

  test('every button has a name, results are announced, and Tab reaches the keypad and the session', async ({
    page,
  }) => {
    await page.keyboard.press('ControlOrMeta+2');
    await page.keyboard.press('ControlOrMeta+KeyT');
    await page.keyboard.type('2+2');
    await page.keyboard.press('Enter');
    await expect(page.locator('.ab-live')).toHaveText('Result 4');
    const buttons = page.getByRole('button');
    expect(await buttons.count()).toBeGreaterThan(40);
    await expect(page.getByRole('button', { name: /\S/ })).toHaveCount(await buttons.count());

    const reached = new Set<string>();
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press('Tab');
      reached.add(
        await page.evaluate(() => {
          const el = document.activeElement;
          if (el?.closest('[aria-label="Scientific keys"]')) return 'scientific';
          if (el?.closest('[aria-label="Keys"]')) return 'basic';
          if (el?.closest('aside')) return 'session';
          return el?.tagName ?? 'none';
        }),
      );
    }
    expect([...reached]).toEqual(expect.arrayContaining(['basic', 'scientific', 'session']));
  });

  test('the browser’s own focus ring never shows: the keyboard gets the theme’s ring, a click gets none', async ({
    page,
  }) => {
    await page.keyboard.press('ControlOrMeta+2');
    await page.keyboard.press('ControlOrMeta+KeyT');
    await page.keyboard.type('2+2');
    await page.keyboard.press('Enter');
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      const unringed = new Set<string>();
      for (let i = 0; i < 60; i++) {
        await page.keyboard.press('Tab');
        const problem = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          // The expression line shows its caret instead of a ring.
          if (el.hasAttribute('data-ab-line')) return null;
          const probe = document.createElement('i');
          probe.style.color = 'var(--ab-accent)';
          document.body.append(probe);
          const accent = getComputedStyle(probe).color;
          probe.remove();
          const style = getComputedStyle(el);
          const ringed = style.outlineStyle === 'solid' && style.outlineColor === accent;
          return ringed
            ? null
            : `${el.tagName} ${el.getAttribute('aria-label') ?? el.textContent} (${style.outlineStyle})`;
        });
        if (problem) unringed.add(problem);
      }
      expect([...unringed], scheme).toEqual([]);
    }
    await page.keyboard.press('ControlOrMeta+Comma');
    const dark = page.getByRole('dialog', { name: 'Settings' }).getByRole('radio', { name: 'Dark' });
    await dark.click();
    await expect(dark).toBeFocused();
    expect(await dark.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
  });

  test('arrow keys move along the session and the keypad, and the ring goes with the keyboard', async ({
    page,
  }) => {
    for (const line of ['1', '2', '3']) {
      await page.keyboard.type(line);
      await page.keyboard.press('Enter');
    }
    await showSession(page);
    await tabTo(page, '.ab-session-lines');
    await expect.poll(() => focusState(page)).toEqual({ active: '33', marked: ['33'], same: true });
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => focusState(page)).toEqual({ active: '22', marked: ['22'], same: true });
    await page.keyboard.press('Home');
    await expect.poll(() => focusState(page)).toEqual({ active: '11', marked: ['11'], same: true });
    await page.keyboard.press('End');
    await expect.poll(() => focusState(page)).toEqual({ active: '33', marked: ['33'], same: true });
    // ↑ in the list moved the list, not the session's inputs into the expression line.
    await expect(expression(page)).toHaveValue('');
    await expect(session(page).locator('[tabindex="0"]')).toHaveCount(1);

    await tabTo(page, '[aria-label="Keys"]');
    await expect.poll(() => focusState(page)).toEqual({ active: '(', marked: ['('], same: true });
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => focusState(page)).toEqual({ active: 'AC', marked: ['AC'], same: true });
    await page.keyboard.press('End');
    await expect.poll(() => focusState(page)).toEqual({ active: '÷', marked: ['÷'], same: true });
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => focusState(page)).toEqual({ active: '7', marked: ['7'], same: true });
    await expect(page.locator('[aria-label="Keys"] [tabindex="0"]')).toHaveCount(1);
    // The session's ring went when the keyboard left it.
    await expect(session(page).locator('[data-ab-focused]')).toHaveCount(0);

    // Each keypad is one Tab stop, which starts at its first key.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => focusState(page)).toEqual({ active: '(', marked: ['('], same: true });
    await page.reload();
    await waitForApp(page);
    await expect(expression(page)).toBeFocused();
    await expect.poll(async () => (await focusState(page)).marked).toEqual([]);
  });

  test('focus goes back to the right line when its menu or a window closes', async ({ page }) => {
    for (const line of ['1', '2', '3']) {
      await page.keyboard.type(line);
      await page.keyboard.press('Enter');
    }
    await showSession(page);
    await tabTo(page, '.ab-session-lines');
    await page.keyboard.press('ArrowUp');
    const menu = page.getByRole('menu', { name: 'Session line' });
    // The menu key gives no point, as a keyboard-opened menu does.
    await page.evaluate(() =>
      document.activeElement?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })),
    );
    await expect(menu).toBeVisible();
    await expect
      .poll(() => focusState(page))
      .toEqual({ active: 'Copy Result', marked: ['Copy Result'], same: true });
    await page.keyboard.press('ArrowDown');
    await expect
      .poll(() => focusState(page))
      .toEqual({
        active: 'Copy Expression',
        marked: ['Copy Expression'],
        same: true,
      });
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect.poll(() => focusState(page)).toEqual({ active: '22', marked: ['22'], same: true });

    await page.evaluate(() =>
      document.activeElement?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })),
    );
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(session(page).getByRole('listitem')).toHaveCount(2);
    await expect.poll(() => focusState(page)).toEqual({ active: '33', marked: ['33'], same: true });

    await page.keyboard.press('ControlOrMeta+Comma');
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await expect(settings).toBeVisible();
    await expect.poll(async () => (await focusState(page)).marked).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(settings).toBeHidden();
    await expect.poll(() => focusState(page)).toEqual({ active: '33', marked: ['33'], same: true });

    await page.keyboard.press('ControlOrMeta+KeyZ');
    await expect(session(page).getByRole('listitem')).toHaveCount(3);
    await expect.poll(() => focusState(page)).toEqual({ active: '33', marked: ['33'], same: true });
  });

  test('arrow keys pick a setting, and the keyboard stays on the picked one', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+Comma');
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    const theme = dialog.getByRole('radiogroup', { name: 'Appearance' });
    await theme.getByRole('radio', { checked: true }).focus();
    const before = await theme.getByRole('radio', { checked: true }).textContent();
    await page.keyboard.press('ArrowRight');
    const picked = theme.getByRole('radio', { checked: true });
    await expect(picked).not.toHaveText(before ?? '');
    await expect(picked).toBeFocused();
    await expect(picked).toHaveAttribute('tabindex', '0');
    await expect(theme.locator('[tabindex="0"]')).toHaveCount(1);
  });

  test('reduced motion turns off key animations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const transition = await key(page, '7').evaluate((el) => getComputedStyle(el).transitionProperty);
    expect(transition).toBe('none');
  });

  test('with reduced motion, a menu opened from the keyboard takes the keyboard at once and Esc closes it', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const line of ['1', '2']) {
      await page.keyboard.type(line);
      await page.keyboard.press('Enter');
    }
    await showSession(page);
    await tabTo(page, '.ab-session-lines');
    const menu = page.getByRole('menu', { name: 'Session line' });
    // The menu key gives no point, as a keyboard-opened menu does.
    await page.evaluate(() =>
      document.activeElement?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })),
    );
    // No transition on any property, `visibility` included, so nothing is still on its way in.
    expect(await menu.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
    await expect(menu.getByRole('menuitem', { name: 'Copy Result' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(session(page).getByRole('listitem')).toHaveCount(2);

    await page.keyboard.press('ControlOrMeta+KeyK');
    const search = page.getByPlaceholder('Type a command…');
    expect(await search.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
    await expect(search).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(search).toBeHidden();
  });
});

test.describe('Command line', () => {
  test('abacite evaluates an argument or stdin lines', () => {
    expect(cli(['2 * (3 + 4)'])).toBe('14');
    expect(cli(['--json', '0.1+0.2'])).toBe('{"input":"0.1+0.2","result":"0.3","unit":null,"error":null}');
    expect(cli([], 'x = 4\nx^2\n+ 1\n')).toBe('4\n16\n17');
  });

  test('abacite session works out a session file and writes the results back', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'abacite-e2e-'));
    try {
      const file = path.join(dir, 'Session.txt');
      writeFileSync(file, '# Rent\nrent = 1200\nrent / 3\n');
      expect(cli(['session', file])).toBe('# Rent\nrent = 1200  # = 1200\nrent / 3  # = 400');
      cli(['session', '--write', file]);
      expect(readFileSync(file, 'utf8')).toBe('# Rent\nrent = 1200  # = 1200\nrent / 3  # = 400\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/** Shows the session panel if the window is too narrow to show it already. */
async function showSession(page: Page): Promise<void> {
  if (!(await session(page).isVisible())) await page.keyboard.press('ControlOrMeta+KeyT');
  await expect(session(page)).toBeVisible();
}

/** Tabs until the keyboard is inside `selector`. */
async function tabTo(page: Page, selector: string): Promise<void> {
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate((s) => document.activeElement?.closest(s) !== null, selector)) return;
  }
  throw new Error(`Tab never reached ${selector}`);
}

/** What has the keyboard, what is drawn as focused, and whether they are the same one element. */
function focusState(page: Page): Promise<{ active: string; marked: string[]; same: boolean }> {
  return page.evaluate(() => {
    const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const active = document.activeElement;
    const marked = [...document.querySelectorAll('[data-ab-focused]')];
    return {
      active: text(active),
      marked: marked.map(text),
      same: marked.length === 1 && marked[0] === active,
    };
  });
}
