import { rovingStep, usePopupFocus, useRovingFocus } from '@abacite/ui';
import { useCallback, useRef, useState } from 'preact/hooks';
import type { AppController } from './controller.ts';

/** Where a session line's menu opened: the line, and the point in the window. */
export interface SessionMenuPlace {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  /** The keyboard was on the line when the menu opened, so it goes back there. */
  readonly focused: boolean;
}

const WIDTH = 190;
const HEIGHT = 170;

/**
 * A session line's right-click menu (PRD §7.1): Copy Result, Copy Expression, Insert Result, Insert Expression
 * and Delete Line. ↑ and ↓ move, Enter picks, Escape or a click elsewhere closes it, and the keyboard goes
 * back to where it was (`onRestore`). The highlighted item is the menu's own state; the keyboard follows it.
 */
export function SessionMenu(props: {
  readonly app: AppController;
  readonly place: SessionMenuPlace;
  readonly onClose: () => void;
  readonly onRestore: (place: SessionMenuPlace, previous: HTMLElement | null) => void;
}) {
  const { app, place, onClose, onRestore } = props;
  const menu = useRef<HTMLDivElement>(null);
  const restore = useCallback(
    (previous: HTMLElement | null) => onRestore(place, previous),
    [onRestore, place],
  );
  usePopupFocus(menu, onClose, restore);
  const [active, setActive] = useState(-1);
  useRovingFocus(
    menu,
    active,
    () => menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[active],
  );

  const line = app.session.value.lines[place.index];
  if (!line) return null;
  const r = line.result;
  const value = r.kind === 'value' ? app.format(r.value).replaceAll(',', '') : null;
  const items: readonly (readonly [label: string, run: (() => void) | null])[] = [
    ['Copy Result', value === null ? null : () => void app.copyText(value)],
    ['Copy Expression', () => void app.copyText(line.input)],
    ['Insert Result', value === null ? null : () => app.insert(value)],
    ['Insert Expression', () => app.insert(line.input)],
    ['Delete Line', () => app.deleteLine(place.index)],
  ];

  const enabled = items.flatMap(([, run], i) => (run === null ? [] : [i]));
  const current = enabled.includes(active) ? active : (enabled[0] ?? 0);
  const move = (key: string) => {
    const next = rovingStep(key, enabled.indexOf(current), enabled.length, true);
    if (next !== undefined) setActive(enabled[next] ?? current);
  };
  return (
    <div
      ref={menu}
      class="ab-menu"
      role="menu"
      aria-label="Session line"
      style={{
        left: `${Math.max(0, Math.min(place.x, window.innerWidth - WIDTH))}px`,
        top: `${Math.max(0, Math.min(place.y, window.innerHeight - HEIGHT))}px`,
      }}
      onKeyDown={(e) => {
        // The app's own keys (Escape clears the line, ↑ walks the session) wait while the menu is open.
        if (e.key === 'Escape' || e.key === 'Tab') onClose();
        else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) move(e.key);
        else if (e.key === 'Enter' || e.key === ' ') return;
        e.preventDefault();
      }}
    >
      {items.map(([label, run], i) => (
        <button
          key={label}
          type="button"
          role="menuitem"
          class={i === items.length - 1 ? 'ab-menu-item ab-menu-break' : 'ab-menu-item'}
          disabled={run === null}
          tabIndex={i === current ? 0 : -1}
          data-ab-roving
          data-ab-focused={i === current || undefined}
          onPointerMove={() => run !== null && setActive(i)}
          onFocus={() => setActive(i)}
          onClick={() => {
            onClose();
            run?.();
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
