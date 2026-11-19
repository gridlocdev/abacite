import { BASIC_ROWS, SCIENTIFIC_ROWS, type KeyDef } from './keyDefs.ts';
import type { AppController } from './controller.ts';

/** One keypad key: a real button with an accessible name, which never takes focus from the line (PRD §9.2, §14). */
function Key({ app, def }: { readonly app: AppController; readonly def: KeyDef }) {
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
  return (
    <div class={cls} role="group" aria-label={cls.includes('sci') ? 'Scientific keys' : 'Keys'}>
      {rows.flat().map((def) => (
        <Key key={def.id} app={app} def={def} />
      ))}
    </div>
  );
}

export function Keypad({ app }: { readonly app: AppController }) {
  const scientific = app.settings.value.mode === 'scientific';
  return (
    <div class={scientific ? 'ab-keypad ab-keypad-sci' : 'ab-keypad'}>
      {scientific && <Rows app={app} rows={SCIENTIFIC_ROWS} class="ab-keys ab-keys-sci" />}
      <Rows app={app} rows={BASIC_ROWS} class="ab-keys ab-keys-basic" />
    </div>
  );
}
