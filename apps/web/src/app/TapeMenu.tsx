import { usePopupFocus } from '@abacite/ui';
import { useRef } from 'preact/hooks';
import type { AppController } from './controller.ts';

/** Where a tape line's menu opened: the line, and the point in the window. */
export interface TapeMenuPlace {
  readonly index: number;
  readonly x: number;
  readonly y: number;
}

const WIDTH = 190;
const HEIGHT = 170;

/**
 * A tape line's right-click menu (PRD §7.1): Copy Result, Copy Expression, Insert Result, Insert Expression
 * and Delete Line. ↑ and ↓ move, Enter picks, Escape or a click elsewhere closes it, and the keyboard goes
 * back to where it was.
 */
export function TapeMenu(props: {
  readonly app: AppController;
  readonly place: TapeMenuPlace;
  readonly onClose: () => void;
}) {
  const { app, place, onClose } = props;
  const menu = useRef<HTMLDivElement>(null);
  usePopupFocus(menu, onClose);

  const line = app.tape.value.lines[place.index];
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

  const move = (step: number) => {
    const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(at + step + buttons.length) % buttons.length]?.focus();
  };
  return (
    <div
      ref={menu}
      class="ab-menu"
      role="menu"
      aria-label="Tape line"
      style={{
        left: `${Math.max(0, Math.min(place.x, window.innerWidth - WIDTH))}px`,
        top: `${Math.max(0, Math.min(place.y, window.innerHeight - HEIGHT))}px`,
      }}
      onKeyDown={(e) => {
        // The app's own keys (Escape clears the line, ↑ walks the tape) wait while the menu is open.
        if (e.key === 'Escape' || e.key === 'Tab') onClose();
        else if (e.key === 'ArrowDown') move(1);
        else if (e.key === 'ArrowUp') move(-1);
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
