import { gridStep, useRovingFocus, type GridCell } from '@abacite/ui';
import { useRef } from 'preact/hooks';
import { BASIC_ROWS, SCIENTIFIC_ROWS, type KeyDef } from './keyDefs.ts';
import type { AppController } from './controller.ts';

/** One keypad key: a real button with an accessible name, which never takes focus from the line (PRD §9.2, §14). */
function Key(props: { readonly app: AppController; readonly def: KeyDef; readonly tabbable: boolean }) {
  const { app, def, tabbable } = props;
  const second = app.second.value;
  const shown = second && def.second ? def.second : def;
  let label = shown.label;
  let name = shown.name;
  if (def.id === 'clear' && app.hasEntry()) {
    label = 'C';
    name = 'Clear';
  }
  if (def.id === 'angle') {
    const rad = app.settings.value.angle === 'rad';
    label = rad ? 'Deg' : 'Rad';
    name = rad ? 'Switch to degrees' : 'Switch to radians';
  }
  const pressed = def.id === 'second' ? second : undefined;
  return (
    <button
      type="button"
      class={`ab-key ab-key-${def.kind}${def.wide ? ' ab-key-wide' : ''}`}
      data-key={shown.id}
      aria-label={name}
      aria-pressed={pressed}
      tabIndex={tabbable ? 0 : -1}
      data-ab-cell={def.id}
      data-ab-roving
      data-ab-focused={app.keyFocus.value === def.id || undefined}
      title={shown.hint ? `${name} (${shown.hint})` : name}
      onPointerDown={(e) => {
        // The expression line keeps focus and its selection; in classic entry keys never take focus, so Enter
        // stays Calculate.
        if (app.classicEntry() || document.activeElement?.hasAttribute('data-ab-line')) e.preventDefault();
      }}
      onClick={() => app.press(def)}
    >
      {label}
    </button>
  );
}

function Rows({
  app,
  rows,
  class: cls,
}: {
  readonly app: AppController;
  readonly rows: readonly (readonly KeyDef[])[];
  readonly class: string;
}) {
  const cells: readonly (readonly GridCell[])[] = rows.map((row) =>
    row.map((d) => ({ id: d.id, span: d.wide ? 2 : 1 })),
  );
  const keys = rows.flat();
  const focused = app.keyFocus.value;
  // Each keypad is one Tab stop: the key the keyboard is on, or else its first key.
  const stop = keys.some((d) => d.id === focused) ? focused : keys[0]?.id;
  return (
    <div
      class={cls}
      role="group"
      aria-label={cls.includes('sci') ? 'Scientific keys' : 'Keys'}
      onKeyDown={(e) => {
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || focused === null) return;
        const next = gridStep(cells, focused, e.key);
        if (next === undefined) return;
        // The app's own arrow keys (walking the session into the line) wait while the keyboard is on the keys.
        e.preventDefault();
        app.keyFocus.value = next;
      }}
    >
      {keys.map((def) => (
        <Key key={def.id} app={app} def={def} tabbable={def.id === stop} />
      ))}
    </div>
  );
}

/**
 * The keypads. ← → ↑ ↓ Home and End move between keys (PRD §14): the key the keyboard is on is `app.keyFocus`,
 * which draws the focus ring, and the DOM's focus follows it.
 */
export function Keypad({ app }: { readonly app: AppController }) {
  const scientific = app.settings.value.mode === 'scientific';
  const pad = useRef<HTMLDivElement>(null);
  const focused = app.keyFocus.value;
  useRovingFocus(pad, focused, () =>
    focused === null ? null : pad.current?.querySelector<HTMLElement>(`[data-ab-cell="${focused}"]`),
  );
  return (
    <div
      ref={pad}
      class={scientific ? 'ab-keypad ab-keypad-sci' : 'ab-keypad'}
      onFocusIn={(e) => {
        app.keyFocus.value = (e.target as HTMLElement).getAttribute('data-ab-cell');
      }}
      onFocusOut={(e) => {
        if (!pad.current?.contains(e.relatedTarget as Node | null)) app.keyFocus.value = null;
      }}
    >
      {scientific && <Rows app={app} rows={SCIENTIFIC_ROWS} class="ab-keys ab-keys-sci" />}
      <Rows app={app} rows={BASIC_ROWS} class="ab-keys ab-keys-basic" />
    </div>
  );
}
