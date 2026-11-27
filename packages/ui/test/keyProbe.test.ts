import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CommandCatalog,
  formatShortcut,
  listenForKeys,
  pressedShortcut,
  PROBE_IDLE_MS,
  probeKeys,
  type ShortcutEvent,
} from '../src/index.ts';

const key = (e: Partial<ShortcutEvent>): ShortcutEvent => ({
  key: '',
  code: '',
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...e,
});

type Listener = (e: Event) => void;

/** A key press as the page sees it: preventDefault and stopPropagation are recorded. */
class Press {
  defaultPrevented = false;
  stopped = false;
  readonly isComposing = false;
  constructor(fields: ShortcutEvent) {
    Object.assign(this, fields);
  }
  preventDefault() {
    this.defaultPrevented = true;
  }
  stopPropagation() {
    this.stopped = true;
  }
}

/**
 * A window that runs keydown listeners the way the browser does, capture ones first, and lets a listener's
 * error reach the caller (a real EventTarget would report it later, out of the test's reach).
 */
class FakeWindow {
  readonly document = { activeElement: null };
  readonly #listeners: { fn: Listener; capture: boolean }[] = [];
  addEventListener(_type: string, fn: Listener, capture?: boolean | AddEventListenerOptions) {
    this.#listeners.push({ fn, capture: capture === true });
  }
  removeEventListener(_type: string, fn: Listener, capture?: boolean | EventListenerOptions) {
    const i = this.#listeners.findIndex((l) => l.fn === fn && l.capture === (capture === true));
    if (i >= 0) this.#listeners.splice(i, 1);
  }
  get count() {
    return this.#listeners.length;
  }
  press(fields: Partial<ShortcutEvent>): Press {
    const e = new Press(key(fields));
    const order = [...this.#listeners.filter((l) => l.capture), ...this.#listeners.filter((l) => !l.capture)];
    for (const l of order) {
      l.fn(e as unknown as Event);
      if (e.stopped) break;
    }
    return e;
  }
}

function app() {
  const ran: string[] = [];
  const catalog = new CommandCatalog([
    {
      id: 'open',
      title: 'Open…',
      description: '',
      group: 'File',
      shortcuts: ['mod+o'],
      run: () => void ran.push('open'),
    },
    {
      id: 'off',
      title: 'Off',
      description: '',
      group: 'Edit',
      shortcuts: ['mod+j'],
      enabled: () => false,
      run: () => void ran.push('off'),
    },
    {
      id: 'jump',
      title: 'Jump',
      description: '',
      group: 'View',
      shortcuts: ['g i'],
      run: () => void ran.push('jump'),
    },
    {
      id: 'clear',
      title: 'Clear',
      description: '',
      group: 'Edit',
      shortcuts: ['esc'],
      run: () => void ran.push('clear'),
    },
  ]);
  const win = new FakeWindow();
  listenForKeys(win as unknown as Window, catalog, () => false);
  return { ran, catalog, win };
}

describe('the key a press spells', () => {
  it('is labelled the way the shortcuts list writes it', () => {
    expect(formatShortcut(pressedShortcut(key({ key: 'k', metaKey: true }), true), true)).toBe('⌘K');
    expect(formatShortcut(pressedShortcut(key({ key: '?', shiftKey: true }), true), true)).toBe('⇧/');
    expect(
      formatShortcut(pressedShortcut(key({ key: 'Z', ctrlKey: true, shiftKey: true }), false), false),
    ).toBe('Ctrl+Shift+Z');
    expect(formatShortcut(pressedShortcut(key({ key: 'ArrowUp' }), true), true)).toBe('↑');
    // ⎋ reads as a refresh arrow, so Escape is written out on every platform.
    expect(formatShortcut(pressedShortcut(key({ key: 'Escape' }), true), true)).toBe('Esc');
    expect(formatShortcut(pressedShortcut(key({ key: 'Escape' }), false), false)).toBe('Esc');
    // A Cyrillic layout's Я is the Z key.
    expect(formatShortcut(pressedShortcut(key({ key: 'я', code: 'KeyZ', metaKey: true }), true), true)).toBe(
      '⌘Z',
    );
  });
});

describe('the command a key is bound to', () => {
  it('names it without running it, even when it is off now', () => {
    const { ran, catalog } = app();
    expect(catalog.commandFor(key({ key: 'o', metaKey: true }), true)?.id).toBe('open');
    expect(catalog.commandFor(key({ key: 'j', metaKey: true }), true)?.id).toBe('off');
    expect(catalog.commandFor(key({ key: 'g' }), true)?.id).toBe('jump');
    expect(catalog.commandFor(key({ key: 'q', metaKey: true }), true)).toBeNull();
    expect(ran).toEqual([]);
  });

  it('starts no sequence, so the next key behaves as usual', () => {
    const { ran, catalog, win } = app();
    catalog.commandFor(key({ key: 'g' }), true);
    win.press({ key: 'i' });
    expect(ran).toEqual([]);
  });
});

describe('press a shortcut', () => {
  it('takes keys before the app sees them, until it is stopped', () => {
    const { ran, win } = app();
    const seen: string[] = [];
    let ended = 0;
    const stop = probeKeys(
      win,
      (e) => seen.push(e.key),
      () => ended++,
    );
    const e = win.press({ key: 'o', ctrlKey: true, metaKey: true });
    expect(e.defaultPrevented).toBe(true);
    win.press({ key: 'o', metaKey: true });
    expect(seen).toEqual(['o', 'o']);
    expect(ran).toEqual([]);
    stop();
    stop();
    expect(ended).toBe(1);
    win.press({ key: 'o', metaKey: true });
    expect(ran).toEqual(['open']);
  });

  it('waits through a modifier pressed alone', () => {
    const { win } = app();
    const seen: string[] = [];
    probeKeys(win, (e) => seen.push(e.key));
    const shift = win.press({ key: 'Shift', shiftKey: true });
    expect(shift.defaultPrevented).toBe(false);
    win.press({ key: 'O', metaKey: true, shiftKey: true });
    expect(seen).toEqual(['O']);
  });

  it('lets Escape through: it ends the mode and reaches the app', () => {
    const { ran, win } = app();
    const seen: string[] = [];
    let ended = 0;
    probeKeys(
      win,
      (e) => seen.push(e.key),
      () => ended++,
    );
    const esc = win.press({ key: 'Escape' });
    expect(esc.defaultPrevented).toBe(true); // by the app's Clear command, not the probe
    expect(seen).toEqual([]);
    expect(ended).toBe(1);
    expect(ran).toEqual(['clear']);
    win.press({ key: 'o', metaKey: true });
    expect(ran).toEqual(['clear', 'open']);
  });

  describe('left alone', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('lets go of the keyboard once no key has been pressed for a while', () => {
      vi.useFakeTimers();
      const { ran, win } = app();
      const seen: string[] = [];
      let ended = 0;
      probeKeys(
        win,
        (e) => seen.push(e.key),
        () => ended++,
      );
      vi.advanceTimersByTime(PROBE_IDLE_MS - 1);
      win.press({ key: 'o', metaKey: true });
      expect(seen).toEqual(['o']);
      // The key started the wait again.
      vi.advanceTimersByTime(PROBE_IDLE_MS - 1);
      expect(ended).toBe(0);
      vi.advanceTimersByTime(1);
      expect(ended).toBe(1);
      expect(win.count).toBe(1);
      win.press({ key: 'o', metaKey: true });
      expect(seen).toEqual(['o']);
      expect(ran).toEqual(['open']);
    });

    it('leaves no wait behind when it ends another way', () => {
      vi.useFakeTimers();
      const { win } = app();
      let ended = 0;
      const stop = probeKeys(
        win,
        () => {},
        () => ended++,
      );
      stop();
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(PROBE_IDLE_MS);
      expect(ended).toBe(1);
    });
  });

  it('lets go of the keyboard when its handler throws', () => {
    const { ran, win } = app();
    let ended = 0;
    probeKeys(
      win,
      () => {
        throw new Error('broken');
      },
      () => ended++,
    );
    expect(() => win.press({ key: 'j', metaKey: true })).toThrow('broken');
    expect(ended).toBe(1);
    expect(win.count).toBe(1);
    win.press({ key: 'o', metaKey: true });
    expect(ran).toEqual(['open']);
  });
});
