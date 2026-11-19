import { useScrollToEnd } from '@abacite/ui';
import { useRef } from 'preact/hooks';
import type { AppController } from './controller.ts';

/**
 * The tape (PRD §7.1): every committed line with its result, newest at the bottom. Clicking a line puts its
 * result into the expression line; ⌥-click (Alt-click) puts its input.
 */
export function TapePanel({ app }: { readonly app: AppController }) {
  const tape = app.tape.value;
  const list = useRef<HTMLOListElement>(null);
  // The newest line stays in view.
  useScrollToEnd(list, tape);
  return (
    <aside class="ab-tape" aria-label="Tape">
      <header class="ab-tape-head">
        <h2>Tape</h2>
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
    </aside>
  );
}
