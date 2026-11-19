import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, keyFocus, memorySettings, parseSettings } from '../src/index.ts';

describe('settings', () => {
  it('keeps good fields and defaults bad ones one by one', () => {
    const s = parseSettings({
      theme: 'dark',
      mode: 'programmer',
      entry: 'classic',
      angle: 'rad',
      groupDigits: 'yes',
      showTape: true,
    });
    expect(s).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark', entry: 'classic', angle: 'rad', showTape: true });
  });

  it('reads anything that is not an object as the defaults', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('dark')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps settings in memory for tests', () => {
    const storage = memorySettings({ theme: 'light' });
    expect(storage.load().theme).toBe('light');
    storage.save({ ...storage.load(), mode: 'scientific' });
    expect(storage.load().mode).toBe('scientific');
  });
});

/** A stand-in element: `closest` matches when the selector names one of `matches`. */
function fakeElement(...matches: string[]): Element {
  const body = {} as Element;
  return {
    ownerDocument: { body },
    closest: (selector: string) => (matches.some((m) => selector.includes(m)) ? ({} as Element) : null),
  } as unknown as Element;
}

describe('keyFocus', () => {
  it('treats the expression line as the place commands’ plain keys work', () => {
    expect(keyFocus(fakeElement('[data-ab-line]', 'input'))).toBe('list');
    expect(keyFocus(fakeElement('input'))).toBe('text');
    expect(keyFocus(fakeElement('button'))).toBe('control');
    expect(keyFocus(null)).toBe('list');
  });
});
