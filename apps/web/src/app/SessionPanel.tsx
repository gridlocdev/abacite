import type { SessionLine } from '@abacite/core';
import { Icon, nextFrame, rovingStep, useRovingFocus, useScrollToEnd } from '@abacite/ui';
import { Component } from 'preact';
import { useCallback, useRef, useState } from 'preact/hooks';
import type { AppController } from './controller.ts';
import { SessionMenu, type SessionMenuPlace } from './SessionMenu.tsx';
import { ErrorText } from './ErrorText.tsx';

/**
 * The session (PRD §7.1): every committed line with its result, newest at the bottom. Clicking a line puts its
 * result into the expression line; ⌥-click (Alt-click) puts its input. Right-click opens its menu.
 *
 * The list is one Tab stop. ↑ ↓ Home and End move along it (PRD §14): the line the keyboard is on is
 * `app.sessionFocus`, which draws the focus ring, and the DOM's focus follows it.
 */
export function SessionPanel({ app, name }: { readonly app: AppController; readonly name: string | null }) {
  const session = app.session.value;
  const group = app.settings.value.groupDigits;
  const list = useRef<HTMLOListElement>(null);
  const [menu, setMenu] = useState<SessionMenuPlace | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  // The newest line stays in view.
  useScrollToEnd(list, session);
  const lines = session.lines;
  const focused = app.sessionFocus.value;
  const at = focused === null ? -1 : lines.indexOf(focused);
  // Where the keyboard was last, for when its line goes.
  const lastAt = useRef(-1);
  if (at >= 0) lastAt.current = at;
  const stop = at >= 0 ? at : lines.length - 1;
  useRovingFocus(
    list,
    at >= 0 ? focused : null,
    () => list.current?.querySelectorAll<HTMLElement>('.ab-session-line')[at],
  );
  // A menu opened from the keyboard gives the keyboard back to its line, or to the line in its place if it was deleted.
  const restore = useCallback(
    (place: SessionMenuPlace, previous: HTMLElement | null) => {
      const now = app.session.peek().lines;
      const back = place.focused ? (now[Math.min(place.index, now.length - 1)] ?? null) : null;
      if (back) app.sessionFocus.value = back;
      else if (previous?.isConnected) previous.focus();
      else document.querySelector<HTMLElement>('[data-ab-line]')?.focus();
    },
    [app],
  );
  return (
    <aside class="ab-session" aria-label="Session">
      <header class="ab-session-head">
        {name === null ? (
          <h2>Session</h2>
        ) : (
          <h2>
            <button
              type="button"
              class="ab-session-name"
              aria-haspopup="dialog"
              title="Open another session"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => app.open('sessions')}
            >
              {name}
              <Icon name="chevron-down" />
            </button>
          </h2>
        )}
        <button
          type="button"
          class="ab-link-button"
          disabled={session.lines.length === 0}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => app.clearSession()}
        >
          Clear
        </button>
      </header>
      {session.lines.length === 0 ? (
        <p class="ab-session-empty">Calculations you make appear here.</p>
      ) : (
        <ol
          class="ab-session-lines"
          ref={list}
          onFocusIn={(e) => {
            const i = Number((e.target as HTMLElement).closest('[data-index]')?.getAttribute('data-index'));
            app.sessionFocus.value = lines[i] ?? null;
          }}
          onFocusOut={(e) => {
            if (list.current?.contains(e.relatedTarget as Node | null)) return;
            const left = app.sessionFocus.peek();
            app.sessionFocus.value = null;
            // The line went from under the keyboard (undo, redo): the keyboard moves to the same line in the new
            // session, or the one in its place.
            const gone = e.target as HTMLElement;
            const from = lastAt.current;
            nextFrame(() => {
              const active = document.activeElement;
              if (gone.isConnected || (active !== null && active !== document.body) || left === null) return;
              app.sessionFocus.value = sameLine(app.session.peek().lines, left, from);
            });
          }}
          onKeyDown={(e) => {
            if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
            const next = rovingStep(e.key, at < 0 ? stop : at, lines.length);
            if (next === undefined) return;
            // The app's own ↑ and ↓ (walking the session into the line) wait while the keyboard is in the list.
            e.preventDefault();
            app.sessionFocus.value = lines[next] ?? null;
          }}
        >
          {lines.map((line, i) => (
            <SessionRow
              key={rowKey(line)}
              app={app}
              line={line}
              index={i}
              group={group}
              focused={i === at}
              tabbable={i === stop}
              onMenu={setMenu}
            />
          ))}
        </ol>
      )}
      {menu && <SessionMenu app={app} place={menu} onClose={closeMenu} onRestore={restore} />}
    </aside>
  );
}

/** The line in `lines` with the same input as `line` nearest to where it was, else the line in its place. */
function sameLine(lines: readonly SessionLine[], line: SessionLine, at: number): SessionLine | null {
  let best = -1;
  lines.forEach((l, i) => {
    if (l.input === line.input && (best < 0 || Math.abs(i - at) < Math.abs(best - at))) best = i;
  });
  return lines[best >= 0 ? best : Math.min(Math.max(at, 0), lines.length - 1)] ?? null;
}

/** A key for each line that stays with it while older lines drop off the top. */
const keys = new WeakMap<SessionLine, number>();
let nextKey = 0;
function rowKey(line: SessionLine): number {
  let key = keys.get(line);
  if (key === undefined) keys.set(line, (key = nextKey++));
  return key;
}

interface RowProps {
  readonly app: AppController;
  readonly line: SessionLine;
  readonly index: number;
  /** Digit grouping, which changes how the result reads. */
  readonly group: boolean;
  /** The keyboard is on this line. */
  readonly focused: boolean;
  /** This line is the list's Tab stop. */
  readonly tabbable: boolean;
  readonly onMenu: (place: SessionMenuPlace) => void;
}

/**
 * One session line. It draws again only when its line, place, grouping or focus changes, so a long session
 * commits quickly.
 */
class SessionRow extends Component<RowProps> {
  override shouldComponentUpdate(next: RowProps): boolean {
    const p = this.props;
    return (
      next.line !== p.line ||
      next.index !== p.index ||
      next.group !== p.group ||
      next.focused !== p.focused ||
      next.tabbable !== p.tabbable
    );
  }

  override render() {
    const { app, line, index, focused, tabbable, onMenu } = this.props;
    const r = line.result;
    const value = r.kind === 'value' ? app.format(r.value) : null;
    return (
      <li data-index={index}>
        <button
          type="button"
          class={r.kind === 'error' ? 'ab-session-line ab-session-error' : 'ab-session-line'}
          tabIndex={tabbable ? 0 : -1}
          data-ab-roving
          data-ab-focused={focused || undefined}
          title={value ? 'Insert the result (⌥-click: the expression)' : 'Insert the expression'}
          onPointerDown={(e) => e.preventDefault()}
          onClick={(e) => app.insert(e.altKey || value === null ? line.input : value.replaceAll(',', ''))}
          onContextMenu={(e) => {
            e.preventDefault();
            // The menu key or Shift+F10 gives no point: open the menu under the line.
            const box = e.currentTarget.getBoundingClientRect();
            const keyboard = e.clientX === 0 && e.clientY === 0;
            onMenu({
              index,
              x: keyboard ? box.left : e.clientX,
              y: keyboard ? box.bottom : e.clientY,
              focused: app.sessionFocus.peek() === line,
            });
          }}
        >
          <span class="ab-session-input">{line.input}</span>
          <span class="ab-session-result">
            {r.kind === 'value' ? (
              <>
                {r.assigned && <span class="ab-session-var">{r.assigned} = </span>}
                {value}
                {r.unit && <span class="ab-session-unit"> {r.unit}</span>}
              </>
            ) : r.kind === 'error' ? (
              <ErrorText message={r.message} />
            ) : null}
          </span>
        </button>
      </li>
    );
  }
}
