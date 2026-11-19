// Scenarios for the calculator in the browser: each test.describe names a feature in docs/features.md.
import { cli, display, expect, expression, key, openApp, runCommand, tape, test } from './fixtures.ts';

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
    await expect(tape(page)).toBeHidden();
    await page.keyboard.type('2*');
    await key(page, 'Memory recall').click();
    await expect(expression(page)).toHaveValue('2*mem');
    await expect(display(page)).toHaveText('30');
    await page.keyboard.press('Escape');
    await key(page, 'Memory clear').click();
    await expect(flags).not.toContainText('M');
    await page.keyboard.press('ControlOrMeta+T');
    await expect(tape(page).getByRole('button')).toContainText(['5*3', 'mem = mem + 15', 'mem = 0']);
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
    await expect(tape(page).getByRole('listitem')).toHaveText([
      /5 in to cm\s*12\.7 cm/,
      /5 km to kg\s*Can’t convert km to kg\./,
    ]);
  });
});

test.describe('Classic entry', () => {
  test('⌘E works the keypad like a pocket calculator and puts the calculation on the tape', async ({
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
    await expect(tape(page).getByRole('listitem')).toHaveText([/2 \+ 3 \* 4 - 1\s*13/]);
    await page.keyboard.press('ControlOrMeta+E');
    await expect(expression(page)).toBeVisible();
  });
});

test.describe('Tape', () => {
  test('keeps every committed line, and ↑ brings one back', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+KeyT');
    await expect(tape(page)).toBeVisible();
    for (const line of ['5+3', 'x = 7', '1/0']) {
      await page.keyboard.type(line);
      await page.keyboard.press('Enter');
    }
    const lines = tape(page).getByRole('listitem');
    await expect(lines).toHaveText([/5\+3\s*8/, /x = 7\s*x = 7/, /1\/0\s*Can’t divide by zero\./]);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(expression(page)).toHaveValue('x = 7');
    await page.keyboard.press('Escape');
    // A click inserts the line's result.
    await lines.first().getByRole('button').click();
    await expect(expression(page)).toHaveValue('8');
  });

  test('Clear Tape can be undone', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+KeyT');
    await page.keyboard.type('2+2');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ControlOrMeta+Shift+Backspace');
    await expect(tape(page).getByRole('listitem')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(tape(page).getByRole('listitem')).toHaveCount(1);
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
});

test.describe('Command line', () => {
  test('abacite evaluates an argument or stdin lines', () => {
    expect(cli(['2 * (3 + 4)'])).toBe('14');
    expect(cli(['--json', '0.1+0.2'])).toBe('{"input":"0.1+0.2","result":"0.3","unit":null,"error":null}');
    expect(cli([], 'x = 4\nx^2\n+ 1\n')).toBe('4\n16\n17');
  });
});
