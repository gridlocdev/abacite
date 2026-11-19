/** The tape folder's dialogs (PRD §8.2, §8.3): the tape list, Rename, the trash, conflicts, recovery, setup. */
import { useState } from 'preact/hooks';
import { Dialog, ListPopup, filterEntries } from '@abacite/ui';
import type { AppController } from './controller.ts';
import type { FolderSetup, TapeFolders } from './tapeFolders.ts';
import type { TapeSession } from './tapeSession.ts';

interface Props {
  readonly app: AppController;
  readonly folders: TapeFolders;
}

/** Runs a session task from a click, reporting a failure in the status bar. */
function run(app: AppController, what: string, task: () => Promise<unknown>): void {
  task().catch((e: unknown) => {
    console.warn(e);
    app.say(`Couldn’t ${what}: ${e instanceof Error ? e.message : String(e)}`, { tone: 'error' });
  });
}

export function TapeDialogs({ app, folders }: Props) {
  const session = folders.session.value;
  const kind = app.dialog.value;
  if (kind === 'folder') return <FolderDialog folders={folders} />;
  if (!session) return null;
  switch (kind) {
    case 'tapes':
      return <TapesDialog app={app} session={session} />;
    case 'rename':
      return <RenameDialog app={app} session={session} />;
    case 'trash':
      return <TrashDialog app={app} session={session} />;
    case 'conflict':
      return <ConflictDialog app={app} session={session} />;
    case 'recovery':
      return <RecoveryDialog app={app} session={session} />;
    case 'commands':
    case 'shortcuts':
    case 'settings':
    case null:
      return null;
  }
}

interface SessionProps {
  readonly app: AppController;
  readonly session: TapeSession;
}

/** Open Tape…: the folder's tapes, filtered as you type. */
function TapesDialog({ app, session }: SessionProps) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const open = session.name.value;
  const entries = session.names.value.map((name) => ({ id: name, title: name, group: '', keywords: '' }));
  const results = filterEntries(entries, query, []);
  const pick = (i: number) => {
    const entry = results[i];
    if (!entry) return;
    app.close();
    if (entry.id !== open) run(app, `open ${entry.id}`, () => session.open(entry.id));
  };
  return (
    <ListPopup
      label="Open Tape"
      placeholder="Type a tape’s name…"
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
          aria-current={e.id === open ? 'true' : undefined}
          onPointerMove={() => setIndex(i)}
          onClick={() => pick(i)}
        >
          <span class="ab-palette-title">{e.title}</span>
          {e.id === open && <span class="ab-palette-group">Open</span>}
        </li>
      ))}
    </ListPopup>
  );
}

/** Rename Tape…: the file's new name, with what's wrong with it. */
function RenameDialog({ app, session }: SessionProps) {
  const [name, setName] = useState(session.name.value ?? '');
  const [error, setError] = useState<string | null>(null);
  const submit = () =>
    run(app, 'rename the tape', async () => {
      const problem = await session.rename(name);
      if (problem === null) app.close();
      else setError(problem);
    });
  return (
    <Dialog
      title="Rename Tape"
      onClose={() => app.close()}
      onSubmit={submit}
      actions={
        <>
          <button type="button" class="ab-button" onClick={() => app.close()}>
            Cancel
          </button>
          <button type="submit" class="ab-button ab-button-primary">
            Rename
          </button>
        </>
      }
    >
      <label class="ab-field ab-field-wide">
        <span>Name</span>
        <input
          type="text"
          value={name}
          data-autofocus
          aria-invalid={error !== null}
          aria-describedby={error ? 'ab-rename-error' : undefined}
          onInput={(e) => {
            setName(e.currentTarget.value);
            setError(null);
          }}
          onFocus={(e) => e.currentTarget.select()}
        />
      </label>
      {error && (
        <p id="ab-rename-error" class="ab-field-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}

/** Open Trash…: deleted tapes, each with Restore. */
function TrashDialog({ app, session }: SessionProps) {
  const names = session.trashed.value;
  const close = () => app.close();
  return (
    <Dialog
      title="Trash"
      onClose={close}
      actions={
        <button type="button" class="ab-button ab-button-primary" onClick={close}>
          Done
        </button>
      }
    >
      {names.length === 0 ? (
        <p>The trash is empty.</p>
      ) : (
        <ul class="ab-trash">
          {names.map((name) => (
            <li key={name}>
              <span>{name}</span>
              <button
                type="button"
                class="ab-button"
                aria-label={`Restore ${name}`}
                onClick={() => {
                  close();
                  run(app, `restore ${name}`, () => session.restoreTrashed(name));
                }}
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/** A save found the file changed or deleted elsewhere: nothing is saved until the user picks one (PRD §8.3). */
function ConflictDialog({ app, session }: SessionProps) {
  const conflict = session.conflict.value;
  if (!conflict) return null;
  const choose = (task: () => Promise<void>) => {
    app.close();
    run(app, 'save the tape', task);
  };
  return (
    <Dialog
      title={`${conflict.name} ${conflict.kind === 'changed' ? 'changed' : 'was deleted'} somewhere else`}
      // The question waits for an answer: closing it would leave the tape unsaved with no way back.
      onClose={() => undefined}
      actions={
        <>
          <button type="button" class="ab-button" onClick={() => choose(() => session.useTheirs())}>
            Use Theirs
          </button>
          <button type="button" class="ab-button" onClick={() => choose(() => session.keepMine())}>
            Keep Mine
          </button>
          <button
            type="button"
            class="ab-button ab-button-primary"
            data-autofocus
            onClick={() => choose(() => session.saveMineAsCopy())}
          >
            Save Mine as a Copy
          </button>
        </>
      }
    >
      <p>
        {conflict.kind === 'changed'
          ? `Another app changed ${conflict.name} while you were working on it. Abacite has stopped saving it until you choose:`
          : `Another app deleted ${conflict.name} while you were working on it. Abacite has stopped saving it until you choose:`}
      </p>
      <ul class="ab-choices">
        <li>
          <strong>Save Mine as a Copy</strong> keeps your tape in a new file
          {conflict.kind === 'changed' ? ` and opens ${conflict.name} as it is now.` : '.'}
        </li>
        <li>
          <strong>Keep Mine</strong>{' '}
          {conflict.kind === 'changed'
            ? 'writes your tape over the other changes.'
            : 'saves your tape again.'}
        </li>
        <li>
          <strong>Use Theirs</strong>{' '}
          {conflict.kind === 'changed'
            ? 'drops your changes and opens the file as it is now.'
            : 'drops your tape and opens another.'}
        </li>
      </ul>
    </Dialog>
  );
}

const timeOf = (at: number) =>
  new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Unsaved changes kept from an earlier visit (PRD §8.3). */
function RecoveryDialog({ app, session }: SessionProps) {
  const recovery = session.recovery.value;
  if (!recovery) return null;
  return (
    <Dialog
      title={`Restore unsaved changes to ${recovery.name}?`}
      onClose={() => undefined}
      actions={
        <>
          <button
            type="button"
            class="ab-button"
            onClick={() => {
              app.close();
              session.discard();
            }}
          >
            Discard
          </button>
          <button
            type="button"
            class="ab-button ab-button-primary"
            data-autofocus
            onClick={() => {
              app.close();
              session.restore();
            }}
          >
            Restore
          </button>
        </>
      }
    >
      <p>
        Abacite kept changes to {recovery.name} from {timeOf(recovery.snapshot.at)} that never reached its
        file. Restore puts them back on the tape, and Undo takes them off again.
      </p>
    </Dialog>
  );
}

function folderText(setup: FolderSetup): { title: string; body: string } {
  switch (setup.kind) {
    case 'first':
      return {
        title: 'Where should Abacite keep tapes?',
        body: 'Each tape is a plain text file in this folder, which other apps can open too.',
      };
    case 'missing':
      return {
        title: 'The tape folder isn’t there',
        body: `Abacite keeps tapes in ${setup.folder}, which can’t be found. It may be on a drive that isn’t connected.`,
      };
    case 'allow':
      return {
        title: `Open ${setup.name} again?`,
        body: `The browser needs your permission to use the tape folder ${setup.name} again.`,
      };
    case 'failed':
      return { title: 'Couldn’t open the tape folder', body: setup.message };
  }
}

/** The folder question at start (PRD §8.2). */
function FolderDialog({ folders }: { readonly folders: TapeFolders }) {
  const setup = folders.setup.value;
  if (!setup) return null;
  const text = folderText(setup);
  const { platform } = folders;
  const primary = setup.kind === 'allow' ? 'allow' : 'default';
  return (
    <Dialog
      title={text.title}
      onClose={() => folders.dismissSetup()}
      actions={
        <>
          {(setup.kind === 'missing' || setup.kind === 'failed') && (
            <button type="button" class="ab-button" onClick={() => void folders.start()}>
              Try Again
            </button>
          )}
          {platform.canChoose && setup.kind !== 'allow' && (
            <button type="button" class="ab-button" onClick={() => void folders.choose()}>
              Choose Folder…
            </button>
          )}
          <button
            type="button"
            class={primary === 'default' ? 'ab-button ab-button-primary' : 'ab-button'}
            data-autofocus={primary === 'default' ? true : undefined}
            onClick={() => void folders.useDefault(setup.kind !== 'allow')}
          >
            {setup.kind === 'allow' ? 'Not Now' : platform.defaultTitle}
          </button>
          {setup.kind === 'allow' && (
            <button
              type="button"
              class="ab-button ab-button-primary"
              data-autofocus
              onClick={() => void folders.allow()}
            >
              Allow
            </button>
          )}
        </>
      }
    >
      <p>{text.body}</p>
    </Dialog>
  );
}
