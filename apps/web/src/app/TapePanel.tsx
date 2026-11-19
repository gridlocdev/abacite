import { Icon, useScrollToEnd } from '@abacite/ui';
import { useCallback, useRef, useState } from 'preact/hooks';
import type { AppController } from './controller.ts';
import { TapeMenu, type TapeMenuPlace } from './TapeMenu.tsx';

/**
 * The tape (PRD §7.1): every committed line with its result, newest at the bottom. Clicking a line puts its
 * result into the expression line; ⌥-click (Alt-click) puts its input. Right-click opens its menu.
 */
export function TapePanel({ app, name }: { readonly app: AppController; readonly name: string | null }) {
  const tape = app.tape.value;
  const list = useRef<HTMLOListElement>(null);
  const [menu, setMenu] = useState<TapeMenuPlace | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  // The newest line stays in view.
  useScrollToEnd(list, tape);
  return (
    <aside class="ab-tape" aria-label="Tape">
      <header class="ab-tape-head">
        {name === null ? (
          <h2>Tape</h2>
        ) : (
          <h2>
            <button
              type="button"
              class="ab-tape-name"
              aria-haspopup="dialog"
              title="Open another tape"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => app.open('tapes')}
            >
              {name}
              <Icon name="chevron-down" />
            </button>
          </h2>
        )}
        <button
          type="button"
          class="ab-link-button"
          disabled={tape.lines.length === 0}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => app.clearTape()}
        >
          Clear
        </button>
      </header>
      {tape.lines.length === 0 ? (
        <p class="ab-tape-empty">Calculations you make appear here.</p>
      ) : (
        <ol class="ab-tape-lines" ref={list}>
          {tape.lines.map((line, i) => {
            const r = line.result;
            const value = r.kind === 'value' ? app.format(r.value) : null;
            return (
              <li key={i}>
                <button
                  type="button"
                  class={r.kind === 'error' ? 'ab-tape-line ab-tape-error' : 'ab-tape-line'}
                  title={value ? 'Insert the result (⌥-click: the expression)' : 'Insert the expression'}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={(e) =>
                    app.insert(e.altKey || value === null ? line.input : value.replaceAll(',', ''))
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    // The menu key or Shift+F10 gives no point: open the menu under the line.
                    const box = e.currentTarget.getBoundingClientRect();
                    const keyboard = e.clientX === 0 && e.clientY === 0;
                    setMenu({
                      index: i,
                      x: keyboard ? box.left : e.clientX,
                      y: keyboard ? box.bottom : e.clientY,
                    });
                  }}
                >
                  <span class="ab-tape-input">{line.input}</span>
                  <span class="ab-tape-result">
                    {r.kind === 'value' ? (
                      <>
                        {r.assigned && <span class="ab-tape-var">{r.assigned} = </span>}
                        {value}
                        {r.unit && <span class="ab-tape-unit"> {r.unit}</span>}
                      </>
                    ) : r.kind === 'error' ? (
                      r.message
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {menu && <TapeMenu app={app} place={menu} onClose={closeMenu} />}
    </aside>
  );
}
