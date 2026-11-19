// Shared scenario setup. Every page starts with empty local storage, so settings and the tape start fresh.
import { expect, test as base, type Page } from '@playwright/test';

export { expect };

/** Every page fails its test if it logged an error or threw one. */
export const test = base.extend<{ checkErrors: void }>({
  checkErrors: [
    async ({ page }, use) => {
      const errors = watchErrors(page);
      await use();
      expect(errors, 'errors on the page').toEqual([]);
    },
    { auto: true },
  ],
});
export { cli } from './server.ts';

/** Open the app the way a user does, and wait until the expression line has focus. */
export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await waitForApp(page);
}

/** The app has drawn and the expression line has focus, so typed keys reach it. */
export async function waitForApp(page: Page): Promise<void> {
  await expect(expression(page)).toBeFocused();
}

export const expression = (page: Page) => page.getByRole('textbox', { name: 'Expression' });
export const display = (page: Page) => page.getByTestId('display');
export const tape = (page: Page) => page.getByRole('complementary', { name: 'Tape' });
export const key = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

/** Collect uncaught errors and console errors on the page. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

/** The ⌘K menu: a dialog named "Command menu" holding a combobox, with an option for each entry. */
export const commandMenu = (page: Page) => page.getByRole('dialog', { name: 'Command menu' });

/** Run a command from ⌘K by its name, typing the way a person does. */
export async function runCommand(page: Page, name: string): Promise<void> {
  await page.keyboard.press('ControlOrMeta+KeyK');
  const menu = commandMenu(page);
  await expect(menu.getByRole('combobox')).toBeFocused();
  await page.keyboard.type(name);
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
}
