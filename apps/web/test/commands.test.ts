import { describe, expect, it } from 'vitest';
import { menuSender, nativeMenu, shortcutGroups } from '../src/index.ts';
import { enter, makeApp } from './helpers.ts';

describe('commands', () => {
  it('run through the catalog and keep settings', () => {
    const { app, catalog } = makeApp();
    catalog.run('view.scientific');
    catalog.run('view.angle');
    catalog.run('view.themeDark');
    expect(app.settings.value).toMatchObject({ mode: 'scientific', angle: 'rad', theme: 'dark' });
  });

  it('Clear Tape is off with an empty tape', () => {
    const { app, catalog } = makeApp();
    expect(catalog.run('tape.clear')).toBe(false);
    enter(app, '1');
    expect(catalog.run('tape.clear')).toBe(true);
    expect(app.tape.value.lines).toHaveLength(0);
  });

  it('let only the dialog toggles through while a dialog is open', () => {
    const { app, catalog } = makeApp();
    catalog.run('help.shortcuts');
    expect(app.dialog.value).toBe('shortcuts');
    expect(catalog.run('view.scientific')).toBe(false);
    catalog.run('help.shortcuts');
    expect(app.dialog.value).toBeNull();
  });

  it('build the menu bar without keys-only commands, with clipboard roles under Edit', () => {
    const { catalog } = makeApp();
    const menu = nativeMenu(catalog);
    expect(menu.map((m) => ('label' in m ? m.label : ''))).toEqual(['File', 'Edit', 'View', 'Help']);
    const text = JSON.stringify(menu);
    expect(text).not.toContain('line.commit');
    expect(text).toContain('"role":"paste"');
    expect(text).toContain('"accelerator":"CmdOrCtrl+Shift+Backspace"');
  });

  it('send the menu only when it changed', () => {
    const sent: unknown[] = [];
    const sender = menuSender((m) => sent.push(m));
    const { catalog } = makeApp();
    expect(sender.send(nativeMenu(catalog))).toBe(true);
    expect(sender.send(nativeMenu(catalog))).toBe(false);
    expect(sent).toHaveLength(1);
  });

  it('list every shortcut in the Keyboard Shortcuts window', () => {
    const { catalog } = makeApp();
    const lines = shortcutGroups(catalog, true).flatMap((g) =>
      g.lines.map((l) => `${l.title} ${l.keys.flat().join(' ')}`),
    );
    expect(lines).toContain('Clear Tape ⇧⌘⌫');
    expect(lines).toContain('Calculate ↩');
    expect(lines).toContain('Settings ⌘,');
  });
});
