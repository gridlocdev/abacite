import type { CommandCatalog } from '@abacite/ui';
import { Icon } from '@abacite/ui';
import type { AppController } from './controller.ts';
import { Dialogs } from './Dialogs.tsx';
import { ExpressionLine } from './ExpressionLine.tsx';
import { classicPending } from './classic.ts';
import { Keypad } from './Keypad.tsx';
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

/** The status bar: the latest notice with its action, and the live region for screen readers (PRD §14). */
function StatusBar({ app }: { readonly app: AppController }) {
  const notice = app.notice.value;
  return (
    <footer class="ab-status">
      <div class={`ab-notice${notice?.tone === 'error' ? ' ab-notice-error' : ''}`}>
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

export function App({ app, catalog }: { readonly app: AppController; readonly catalog: CommandCatalog }) {
  const { mode, showTape } = app.settings.value;
  return (
    <div class={`ab-app ab-mode-${mode}${showTape ? ' ab-with-tape' : ''}`}>
      <div class="ab-body">
        <main class="ab-calc">
          <Display app={app} />
          {!app.classicEntry() && <ExpressionLine app={app} />}
          <Keypad app={app} />
        </main>
        {showTape && <TapePanel app={app} />}
      </div>
      <StatusBar app={app} />
      <Dialogs app={app} catalog={catalog} />
    </div>
  );
}
