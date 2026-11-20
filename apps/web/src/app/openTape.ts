/**
 * The open tape and its file (PRD §8.2, §8.3): every change is saved at once, one save at a time; a failed
 * save is retried, then reported; a save against a file changed elsewhere stops and asks; changes made
 * elsewhere are picked up when nothing is unsaved; unsaved text is kept in snapshots for recovery.
 */
import { effect, signal } from '@preact/signals';
import { defaultRandom, readTape, writeTapeText, type Decimal } from '@abacite/core';
import {
  StoreError,
  TapeLibrary,
  checkTapeName,
  copyName,
  freeName,
  wait,
  type Folder,
  type Snapshot,
  type TapeKeep,
} from '@abacite/ui';
import type { AppController } from './controller.ts';

export type SaveState = 'saved' | 'saving' | 'failed';

/** A save found the file changed or deleted somewhere else; nothing is saved until the user chooses. */
export interface Conflict {
  readonly kind: 'changed' | 'deleted';
  readonly name: string;
}

/** A snapshot of unsaved work found on opening a tape. */
export interface Recovery {
  readonly name: string;
  readonly snapshot: Snapshot;
}

export interface OpenTapeOptions {
  readonly app: AppController;
  readonly folder: Folder;
  /** Names this folder in the keep: its path on desktop, `browser` for the browser's storage. */
  readonly key: string;
  readonly keep: TapeKeep;
  readonly random?: () => Decimal;
  readonly now?: () => Date;
  /** The waits before each retry of a failed save (PRD §8.3). */
  readonly retries?: readonly number[];
}

export const RETRIES = [300, 600] as const;

export class OpenTape {
  readonly folder: Folder;
  readonly library: TapeLibrary;
  /** The open tape's name, or null before one is open. */
  readonly name = signal<string | null>(null);
  readonly names = signal<readonly string[]>([]);
  readonly state = signal<SaveState>('saved');
  readonly conflict = signal<Conflict | null>(null);
  readonly recovery = signal<Recovery | null>(null);
  /** The trash's tapes, as last listed (Open Trash…). */
  readonly trashed = signal<readonly string[]>([]);

  readonly #app: AppController;
  readonly #key: string;
  readonly #keep: TapeKeep;
  readonly #random: () => Decimal;
  readonly #now: () => Date;
  readonly #retries: readonly number[];
  /** The version of the file as last read or written; null when there was no file. */
  #version: string | null = null;
  /** The tape's text when it last matched the file: unsaved while the tape's text differs. */
  #clean = '';
  #saving: Promise<void> | null = null;
  #again = false;
  /** True while this object itself changes the tape, which is then no change to save. */
  #loading = false;
  #stopWatching: (() => void) | null = null;

  constructor(options: OpenTapeOptions) {
    this.#app = options.app;
    this.folder = options.folder;
    this.library = new TapeLibrary(options.folder);
    this.#key = options.key;
    this.#keep = options.keep;
    this.#random = options.random ?? defaultRandom;
    this.#now = options.now ?? (() => new Date());
    this.#retries = options.retries ?? RETRIES;
  }

  /** Opens the tape last open in this folder, or the first, or a new `Tape` in an empty folder. */
  async start(): Promise<void> {
    let names = await this.#refreshNames();
    if (!names.length) {
      await this.library.create('Tape');
      names = await this.#refreshNames();
    }
    const last = this.#keep.lastTape(this.#key);
    await this.open(last !== null && names.includes(last) ? last : names[0]!);
    this.#stopWatching = effect(() => {
      // Read both, so either one changing is a change to save.
      void this.#app.tape.value;
      void this.#app.settings.value.angle;
      if (!this.#loading) void this.save();
    });
  }

  /** Stops saving on changes (another folder was opened). */
  stop(): void {
    this.#stopWatching?.();
    this.#stopWatching = null;
  }

  /** The text the open tape would be written as. */
  text(): string {
    return writeTapeText(this.#app.tape.value, this.#app.settings.value.angle);
  }

  /** True while the tape has changes the file doesn't. */
  unsaved(): boolean {
    return this.name.value !== null && this.text() !== this.#clean;
  }

  /** Opens a tape by name, after the open one's last save. */
  async open(name: string): Promise<boolean> {
    await this.flush();
    const read = await this.library.read(name);
    if (!read) {
      await this.#refreshNames();
      this.#app.say(`${name} isn’t there any more.`, { tone: 'error' });
      return false;
    }
    this.#show(name, read.text, read.version, false);
    this.#keep.setLastTape(this.#key, name);
    this.conflict.value = null;
    const snapshot = this.#keep.snapshot(this.#key, name);
    if (snapshot && snapshot.text !== this.#clean && snapshot.text !== read.text) {
      this.recovery.value = { name, snapshot };
      this.#app.open('recovery');
    } else if (snapshot) this.#keep.dropSnapshot(this.#key, name);
    return true;
  }

  /** Waits for the save in progress, if any. */
  async flush(): Promise<void> {
    while (this.#saving) await this.#saving;
  }

  /** Saves the tape if it has changes; a change during a save is saved right after it. */
  save(): Promise<void> {
    if (this.#saving) {
      this.#again = true;
      return this.#saving;
    }
    if (!this.unsaved() || this.conflict.value) return Promise.resolve();
    // The loop starts after `#saving` is set, and clears it in the same step as it ends, so a change made
    // once it has finished starts a new save rather than joining one that is over.
    this.#saving = Promise.resolve().then(() => this.#saveLoop());
    return this.#saving;
  }

  async #saveLoop(): Promise<void> {
    try {
      do {
        this.#again = false;
        const name = this.name.value;
        const text = this.text();
        if (name === null || text === this.#clean || this.conflict.value) break;
        this.state.value = 'saving';
        try {
          this.#version = await this.#write(name, text, this.#version);
          this.#clean = text;
        } catch (e) {
          if (e instanceof StoreError && e.kind === 'conflict')
            await this.#conflictFound(name).catch((error: unknown) => this.#failed(name, error));
          else this.#failed(name, e);
          return;
        }
      } while (this.#again);
      this.state.value = 'saved';
      if (this.name.value !== null) this.#keep.dropSnapshot(this.#key, this.name.value);
    } finally {
      this.#saving = null;
    }
  }

  /** One write, retried after each wait in `retries` unless it is a conflict (PRD §8.3). */
  async #write(name: string, text: string, expected: string | null): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.library.write(name, text, expected);
      } catch (e) {
        const retry = this.#retries[attempt];
        if (e instanceof StoreError || retry === undefined) throw e;
        await wait(retry);
      }
    }
  }

  #failed(name: string, error: unknown): void {
    console.warn(`Couldn’t save ${name}:`, error);
    this.state.value = 'failed';
    this.snapshot();
  }

  async #conflictFound(name: string): Promise<void> {
    const now = await this.library.read(name);
    this.state.value = 'saved';
    this.snapshot();
    this.conflict.value = { kind: now ? 'changed' : 'deleted', name };
    this.#app.open('conflict');
  }

  /** Keeps the unsaved text in the app's storage (PRD §8.3); nothing when everything is saved. */
  snapshot(): void {
    const name = this.name.value;
    if (name === null || !this.unsaved()) return;
    const snapshot = { text: this.text(), base: this.#version, at: this.#now().getTime() };
    try {
      this.#keep.putSnapshot(this.#key, name, snapshot);
    } catch (e) {
      // A full storage quota: the tape itself is still open, and saving goes on.
      console.warn('Couldn’t keep a snapshot of the tape:', e);
    }
  }

  // Conflicts (PRD §8.3)

  /** Writes the tape as `<name> copy <date>` and opens the file on disk (or the copy, if the file is gone). */
  async saveMineAsCopy(): Promise<void> {
    const conflict = this.conflict.value;
    if (!conflict) return;
    const text = this.text();
    const copy = freeName(copyName(conflict.name, this.#now()), await this.library.names());
    await this.library.write(copy, text, null);
    this.conflict.value = null;
    this.#keep.dropSnapshot(this.#key, conflict.name);
    await this.open(conflict.kind === 'changed' ? conflict.name : copy);
    await this.#refreshNames();
    this.#app.say(`Saved your tape as ${copy}.`);
  }

  /** Writes the tape over the file as it is now. */
  async keepMine(): Promise<void> {
    const conflict = this.conflict.value;
    if (!conflict) return;
    this.#version = (await this.library.read(conflict.name))?.version ?? null;
    this.conflict.value = null;
    await this.save();
    await this.#refreshNames();
  }

  /** Takes the file as it is now; a deleted file closes the tape. ⌘Z brings the tape back. */
  async useTheirs(): Promise<void> {
    const conflict = this.conflict.value;
    if (!conflict) return;
    this.conflict.value = null;
    this.#keep.dropSnapshot(this.#key, conflict.name);
    const read = await this.library.read(conflict.name);
    if (read) this.#show(conflict.name, read.text, read.version, true);
    else await this.#openAnother();
  }

  // Changes made elsewhere (PRD §8.3)

  /** Picks up the file's changes when the tape has nothing unsaved; one undo step. */
  async check(): Promise<void> {
    const name = this.name.value;
    if (name === null || this.#saving || this.conflict.value || this.recovery.value || this.unsaved()) return;
    const read = await this.library.read(name);
    // Something changed meanwhile: the next check looks again.
    if (this.name.value !== name || this.#saving || this.unsaved()) return;
    await this.#refreshNames();
    if (!read) {
      this.conflict.value = { kind: 'deleted', name };
      this.#app.open('conflict');
      return;
    }
    if (read.version === this.#version) return;
    const before = this.text();
    this.#show(name, read.text, read.version, true);
    if (this.text() === before) return;
    this.#app.say(`Updated ${name} with changes made elsewhere.`, {
      action: { label: 'Undo', run: () => this.#app.stepTape('undo') },
    });
  }

  // Recovery (PRD §8.3)

  /** Puts the snapshot's text back on the tape, as one undo step, and saves it. */
  restore(): void {
    const recovery = this.recovery.value;
    if (!recovery) return;
    this.recovery.value = null;
    const { tape } = readTape(recovery.snapshot.text, this.#env());
    this.#app.editTape(tape);
  }

  discard(): void {
    const recovery = this.recovery.value;
    if (!recovery) return;
    this.recovery.value = null;
    this.#keep.dropSnapshot(this.#key, recovery.name);
  }

  // The folder's tapes (PRD §8.2)

  /** ⌘N: a new tape, `Tape 2`, `Tape 3`…, opened. */
  async newTape(): Promise<void> {
    await this.flush();
    const { name } = await this.library.create('Tape');
    await this.#refreshNames();
    await this.open(name);
  }

  /** Renames the open tape; returns an error to show, or null when done. */
  async rename(to: string): Promise<string | null> {
    const from = this.name.value;
    const checked = checkTapeName(to);
    if ('error' in checked) return checked.error;
    if (from === null || checked.name === from) return null;
    await this.flush();
    try {
      await this.library.rename(from, checked.name);
    } catch (e) {
      if (e instanceof StoreError && e.kind === 'exists')
        return `There’s already a tape called ${checked.name}.`;
      if (e instanceof StoreError) return e.message;
      throw e;
    }
    this.#keep.dropSnapshot(this.#key, from);
    this.name.value = checked.name;
    this.#keep.setLastTape(this.#key, checked.name);
    await this.#refreshNames();
    this.#app.say(`Renamed ${from} to ${checked.name}.`);
    return null;
  }

  /** Moves the open tape to the trash and opens another; the notice's Undo brings it back. */
  async trash(): Promise<void> {
    const name = this.name.value;
    if (name === null) return;
    await this.flush();
    const trashed = await this.library.trash(name);
    this.#keep.dropSnapshot(this.#key, name);
    await this.#openAnother();
    this.#app.say(`Moved ${name} to the trash.`, {
      action: { label: 'Undo', run: () => void this.restoreTrashed(trashed) },
    });
  }

  /** Lists the trash for Open Trash…. */
  async listTrash(): Promise<readonly string[]> {
    const names = await this.library.trashed();
    this.trashed.value = names;
    return names;
  }

  /** Brings a tape back from the trash and opens it; a taken name gets ` 2`. */
  async restoreTrashed(trashed: string): Promise<void> {
    const name = await this.library.restore(trashed);
    this.trashed.value = this.trashed.value.filter((n) => n !== trashed);
    await this.#refreshNames();
    await this.open(name);
    this.#app.say(`Restored ${name}.`);
  }

  async #openAnother(): Promise<void> {
    const names = await this.#refreshNames();
    if (names.length) await this.open(names[0]!);
    else await this.newTape();
  }

  async #refreshNames(): Promise<string[]> {
    const names = await this.library.names();
    this.names.value = names;
    return names;
  }

  /** Shows a file's tape: as a new tape (undo forgotten), or as one undo step. */
  #show(name: string, text: string, version: string, asEdit: boolean): void {
    const { tape, angle } = readTape(text, this.#env());
    this.#loading = true;
    try {
      if (asEdit) {
        if (angle !== this.#app.settings.value.angle) this.#app.update({ angle });
        this.#app.editTape(tape);
      } else this.#app.loadTape(tape, angle);
      this.name.value = name;
      this.#version = version;
      this.#clean = this.text();
      this.state.value = 'saved';
    } finally {
      this.#loading = false;
    }
  }

  #env() {
    return { angle: this.#app.settings.value.angle, random: this.#random };
  }
}
