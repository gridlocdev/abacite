// Scenarios for the calculator in the browser: each test.describe names a feature in docs/features.md.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Page } from '@playwright/test';
import {
  cli,
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
    await expect(display(page)).toHaveText('`foo` isn’t defined.');
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
    await expect(lines).toHaveText([/x \* 2\s*`x` isn’t defined\./]);
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

  test('reduced motion turns off key animations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const transition = await key(page, '7').evaluate((el) => getComputedStyle(el).transitionProperty);
    expect(transition).toBe('none');
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
