import type { ReadonlySignal } from '@preact/signals';
import type { CommandCatalog } from '@abacite/ui';
import { Icon } from '@abacite/ui';
import type { AppController } from './controller.ts';
import { Dialogs } from './Dialogs.tsx';
import { ExpressionLine } from './ExpressionLine.tsx';
import { classicPending } from './classic.ts';
import { Keypad } from './Keypad.tsx';
import type { Release } from './native.ts';
import { TapeDialogs } from './TapeDialogs.tsx';
import { inBrowserStorage, type TapeFolders } from './tapeFolders.ts';
import { TapePanel } from './TapePanel.tsx';

/** The display (PRD §9.1): the angle unit, then the result, right-aligned, shrinking to fit. */
function Display({ app }: { readonly app: AppController }) {
  const shown = app.shown.value;
  const angle = app.settings.value.angle;
  const long = shown.kind === 'error' ? 0 : shown.text.length;
  const classic = app.classicEntry();
  return (
    <section class="ab-display" aria-label="Display">
      <div class="ab-display-flags">
        <span title={angle === 'deg' ? 'Angles are in degrees' : 'Angles are in radians'}>
          {angle === 'deg' ? 'DEG' : 'RAD'}
        </span>
        {app.memorySet() && <span title="Memory is set">M</span>}
        {app.second.value && <span>2nd</span>}
        {classic && <span title="Classic entry (⌘E)">CLASSIC</span>}
      </div>
      {classic && (
        <div class="ab-display-pending" data-testid="pending">
          {classicPending(app.classic.value)}
        </div>
      )}
      <output
        class={`ab-value ab-value-${shown.kind}`}
        data-testid="display"
        style={long ? { '--ab-chars': String(Math.max(long, 10)) } : undefined}
      >
        {shown.text}
      </output>
    </section>
  );
}

/**
 * The status bar: the latest notice with its action, a failed save until a save works, and in the browser's
 * own storage the storage note (PRD §8.2, §8.3), and the live region for screen readers (PRD §14).
 */
function StatusBar({
  app,
  folders,
  release,
}: {
  readonly app: AppController;
  readonly folders?: TapeFolders;
  readonly release?: Release | null;
}) {
  const notice = app.notice.value;
  const session = folders?.session.value ?? null;
  const failed = session?.state.value === 'failed' ? session.name.value : null;
  return (
    <footer class="ab-status">
      <div class={`ab-notice${notice?.tone === 'error' || (!notice && failed) ? ' ab-notice-error' : ''}`}>
        {!notice && failed !== null && session && (
          <>
            <span>Couldn’t save {failed}.</span>
            <button
              type="button"
              class="ab-link-button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => void session.save()}
            >
              Try Again
            </button>
          </>
        )}
        {!notice && failed === null && release && (
          <>
            <span>Abacite {release.version} is available.</span>
            <a class="ab-link-button" href={release.url} target="_blank" rel="noopener noreferrer">
              Download
            </a>
          </>
        )}
        {!notice && failed === null && !release && inBrowserStorage(session) && (
          <span class="ab-storage-note">Stored in this browser</span>
        )}
        {notice && (
          <>
            <span>{notice.text}</span>
            {notice.action && (
              <button
                type="button"
                class="ab-link-button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  const run = notice.action!.run;
                  app.dismissNotice();
                  run();
                }}
              >
                {notice.action.label}
              </button>
            )}
          </>
        )}
      </div>
      <button
        type="button"
        class="ab-icon-button ab-small"
        aria-label="Settings"
        title="Settings"
        onClick={() => app.open('settings')}
      >
        <Icon name="settings" />
      </button>
      <div class="ab-live" role="status" aria-live="polite" aria-atomic="true">
        {app.announcement.value}
      </div>
    </footer>
  );
}

export function App(props: {
  readonly app: AppController;
  readonly catalog: CommandCatalog;
  /** The tape folders; without them (tests) the tape lives in memory only. */
  readonly folders?: TapeFolders;
  /** A newer release, from the desktop app's update check (PRD §12). */
  readonly release?: ReadonlySignal<Release | null>;
}) {
  const { app, catalog, folders, release } = props;
  const { mode, showTape } = app.settings.value;
  const session = folders?.session.value ?? null;
  // Nothing to type into until a tape is open: keys would change a tape about to be replaced.
  const ready = !folders || session !== null;
  return (
    <div class={`ab-app ab-mode-${mode}${showTape ? ' ab-with-tape' : ''}`}>
      <div class="ab-body">
        {ready && (
          <>
            <main class="ab-calc">
              <Display app={app} />
              {!app.classicEntry() && <ExpressionLine app={app} />}
              <Keypad app={app} />
            </main>
            {showTape && <TapePanel app={app} name={session?.name.value ?? null} />}
          </>
        )}
      </div>
      <StatusBar app={app} release={release?.value ?? null} {...(folders ? { folders } : {})} />
      <Dialogs app={app} catalog={catalog} />
      {folders && <TapeDialogs app={app} folders={folders} />}
    </div>
  );
}
