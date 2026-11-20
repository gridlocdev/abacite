import type { SessionLine } from '@abacite/core';
import { Icon, useScrollToEnd } from '@abacite/ui';
import { Component } from 'preact';
import { useCallback, useRef, useState } from 'preact/hooks';
import type { AppController } from './controller.ts';
import { SessionMenu, type SessionMenuPlace } from './SessionMenu.tsx';

/**
 * The session (PRD §7.1): every committed line with its result, newest at the bottom. Clicking a line puts its
 * result into the expression line; ⌥-click (Alt-click) puts its input. Right-click opens its menu.
 */
export function SessionPanel({ app, name }: { readonly app: AppController; readonly name: string | null }) {
  const session = app.session.value;
  const group = app.settings.value.groupDigits;
  const list = useRef<HTMLOListElement>(null);
  const [menu, setMenu] = useState<SessionMenuPlace | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  // The newest line stays in view.
  useScrollToEnd(list, session);
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
        <ol class="ab-session-lines" ref={list}>
          {session.lines.map((line, i) => (
            <SessionRow key={rowKey(line)} app={app} line={line} index={i} group={group} onMenu={setMenu} />
          ))}
        </ol>
      )}
      {menu && <SessionMenu app={app} place={menu} onClose={closeMenu} />}
    </aside>
  );
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
  readonly onMenu: (place: SessionMenuPlace) => void;
}

/** One session line. It draws again only when its line, place or grouping changes, so a long session commits quickly. */
class SessionRow extends Component<RowProps> {
  override shouldComponentUpdate(next: RowProps): boolean {
    const p = this.props;
    return next.line !== p.line || next.index !== p.index || next.group !== p.group;
  }

  override render() {
    const { app, line, index, onMenu } = this.props;
    const r = line.result;
    const value = r.kind === 'value' ? app.format(r.value) : null;
    return (
      <li>
        <button
          type="button"
          class={r.kind === 'error' ? 'ab-session-line ab-session-error' : 'ab-session-line'}
          title={value ? 'Insert the result (⌥-click: the expression)' : 'Insert the expression'}
          onPointerDown={(e) => e.preventDefault()}
          onClick={(e) => app.insert(e.altKey || value === null ? line.input : value.replaceAll(',', ''))}
          onContextMenu={(e) => {
            e.preventDefault();
            // The menu key or Shift+F10 gives no point: open the menu under the line.
            const box = e.currentTarget.getBoundingClientRect();
            const keyboard = e.clientX === 0 && e.clientY === 0;
            onMenu({ index, x: keyboard ? box.left : e.clientX, y: keyboard ? box.bottom : e.clientY });
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
              r.message
            ) : null}
          </span>
        </button>
      </li>
    );
  }
}
