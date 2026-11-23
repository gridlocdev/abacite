import { useMemo, useState } from 'preact/hooks';
import {
  ANGLES,
  ENTRIES,
  Dialog,
  ListPopup,
  MODES,
  THEMES,
  filterEntries,
  isMac,
  type Angle,
  type Entry as EntryMode,
  type CommandCatalog,
  type MenuEntry,
  type Mode,
  type Theme,
} from '@abacite/ui';
import type { AppController } from './controller.ts';
import { shortcutGroups } from './shortcuts.ts';

/** The open dialog, if any; one at a time. */
export function Dialogs({ app, catalog }: { readonly app: AppController; readonly catalog: CommandCatalog }) {
  switch (app.dialog.value) {
    case 'commands':
      return <CommandMenu app={app} catalog={catalog} />;
    case 'shortcuts':
      return <ShortcutsDialog app={app} catalog={catalog} />;
    case 'settings':
      return <SettingsDialog app={app} />;
    // The session folder's dialogs are drawn by SessionDialogs.
    case 'sessions':
    case 'rename':
    case 'trash':
    case 'conflict':
    case 'recovery':
    case 'folder':
    case null:
      return null;
  }
}

interface Entry extends MenuEntry {
  readonly keys: string;
  readonly enabled: boolean;
  /** Why it is disabled, shown under its title. */
  readonly reason: string | null;
}

/** ⌘K: every command, recent ones first (PRD §10). */
function CommandMenu({ app, catalog }: { readonly app: AppController; readonly catalog: CommandCatalog }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const entries = useMemo<Entry[]>(
    () =>
      catalog.all
        .filter((c) => !c.hidden && c.id !== 'help.commands')
        .map((c) => ({
          id: c.id,
          title: c.title,
          group: c.group,
          keywords: `${c.keywords ?? ''} ${c.description}`,
          keys: catalog.keys(c).join(' '),
          enabled: catalog.isEnabled(c),
          reason: catalog.whyDisabled(c),
        })),
    [catalog],
  );
  const results = filterEntries(entries, query, catalog.recentIds).slice(0, 80);
  const pick = (i: number) => {
    const entry = results[i];
    if (entry && !entry.enabled && entry.reason) app.say(entry.reason);
    if (!entry?.enabled) return;
    app.close();
    // Let the menu close (and focus go back) before the command runs.
    queueMicrotask(() => catalog.run(entry.id));
  };
  return (
    <ListPopup
      label="Command menu"
      placeholder="Type a command…"
      query={query}
      onQuery={(q) => {
        setQuery(q);
        setIndex(0);
      }}
      index={index}
      onIndex={setIndex}
      count={results.length}
      onPick={pick}
      onClose={() => app.close()}
    >
      {results.map((e, i) => (
        <li
          key={e.id}
          id={`ab-palette-${i}`}
          role="option"
          aria-selected={i === index}
          aria-disabled={!e.enabled}
          class={e.enabled ? undefined : 'ab-disabled'}
          onPointerMove={() => setIndex(i)}
          onClick={() => pick(i)}
        >
          <span class="ab-palette-title">
            {e.title}
            {e.reason && <span class="ab-palette-reason">{e.reason}</span>}
          </span>
          <span class="ab-palette-group">{e.group}</span>
          {e.keys && <kbd>{e.keys}</kbd>}
        </li>
      ))}
    </ListPopup>
  );
}

/** ⌘/: every shortcut, made from the catalog (PRD §10). */
function ShortcutsDialog({
  app,
  catalog,
}: {
  readonly app: AppController;
  readonly catalog: CommandCatalog;
}) {
  const groups = shortcutGroups(catalog, isMac);
  return (
    <Dialog
      title="Keyboard Shortcuts"
      class="ab-dialog-wide"
      onClose={() => app.close()}
      actions={
        <button type="button" class="ab-button ab-button-primary" onClick={() => app.close()}>
          Close
        </button>
      }
    >
      <div class="ab-shortcuts">
        {groups.map((g) => (
          <section key={g.title}>
            <h3>{g.title}</h3>
            <dl>
              {g.lines.map((l) => (
                <div key={l.title} class="ab-shortcut">
                  <dt>{l.title}</dt>
                  <dd>
                    {l.keys.map((way, i) => (
                      <span key={i} class="ab-way">
                        {i > 0 && <span class="ab-or">or</span>}
                        {way.map((k, j) => (
                          <kbd key={j}>{k}</kbd>
                        ))}
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

const THEME_TITLES: Readonly<Record<Theme, string>> = { system: 'System', light: 'Light', dark: 'Dark' };
const MODE_TITLES: Readonly<Record<Mode, string>> = { basic: 'Basic', scientific: 'Scientific' };
const ENTRY_TITLES: Readonly<Record<EntryMode, string>> = { expression: 'Expression', classic: 'Classic' };
const ANGLE_TITLES: Readonly<Record<Angle, string>> = { deg: 'Degrees', rad: 'Radians' };

function Choice<T extends string>(props: {
  readonly id: string;
  readonly label: string;
  readonly items: readonly T[];
  readonly titles: Readonly<Record<T, string>>;
  readonly value: T;
  readonly onPick: (value: T) => void;
}) {
  return (
    <div class="ab-field">
      <span id={props.id}>{props.label}</span>
      <div class="ab-segmented" role="radiogroup" aria-labelledby={props.id}>
        {props.items.map((item) => (
          <button
            key={item}
            type="button"
            role="radio"
            aria-checked={props.value === item}
            onClick={() => props.onPick(item)}
          >
            {props.titles[item]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Settings (PRD §11). Every change applies at once and is kept; there is nothing to save or cancel. */
function SettingsDialog({ app }: { readonly app: AppController }) {
  const s = app.settings.value;
  return (
    <Dialog
      title="Settings"
      onClose={() => app.close()}
      actions={
        <button type="button" class="ab-button ab-button-primary" onClick={() => app.close()}>
          Done
        </button>
      }
    >
      <div class="ab-settings">
        <Choice
          id="ab-theme-label"
          label="Appearance"
          items={THEMES}
          titles={THEME_TITLES}
          value={s.theme}
          onPick={(t) => app.update({ theme: t })}
        />
        <Choice
          id="ab-mode-label"
          label="Keypad"
          items={MODES}
          titles={MODE_TITLES}
          value={s.mode}
          onPick={(m) => app.setMode(m)}
        />
        <Choice
          id="ab-entry-label"
          label="Entry"
          items={ENTRIES}
          titles={ENTRY_TITLES}
          value={s.entry}
          onPick={(e) => app.setEntry(e)}
        />
        <Choice
          id="ab-angle-label"
          label="Angles"
          items={ANGLES}
          titles={ANGLE_TITLES}
          value={s.angle}
          onPick={(a) => app.setAngle(a)}
        />
        <label class="ab-check">
          <input
            type="checkbox"
            checked={s.groupDigits}
            onChange={(e) => app.setGroupDigits(e.currentTarget.checked)}
          />
          <span>Group digits with commas (1,234,567)</span>
        </label>
        <label class="ab-check">
          <input type="checkbox" checked={s.showSession} onChange={() => app.toggleSession()} />
          <span>Show the session</span>
        </label>
      </div>
    </Dialog>
  );
}
