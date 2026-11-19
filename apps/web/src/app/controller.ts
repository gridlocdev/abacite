/** The app's state and what the UI does to it. Components read the signals and call the methods. */
import { batch, signal, type Signal } from '@preact/signals';
import {
  EMPTY_TAPE,
  commit,
  defaultRandom,
  deleteLine,
  evaluate,
  expandInput,
  formatDecimal,
  memoryLine,
  memorySet,
  preview,
  repeatInput,
  startsWithOperator,
  type Decimal,
  type Env,
  type Tape,
} from '@abacite/core';
import { type Angle, type Entry, type Mode, type Settings, type SettingsStorage } from '@abacite/ui';
import {
  EMPTY_CLASSIC,
  classicBackspace,
  classicClear,
  classicEmpty,
  classicKey,
  classicSegment,
  classicText,
  formatEntry,
  typedKey,
  type ClassicState,
} from './classic.ts';
import { ALL_KEYS, type KeyDef } from './keyDefs.ts';
import { Notices, type Notice } from './notices.ts';
import { UndoStack } from './undo.ts';
import { shownNumber, windowWidth, type Ghost, type Shown } from './view.ts';
import {
  EMPTY_LINE,
  backspace,
  cleanPaste,
  insertCall,
  insertText,
  lineAt,
  negate,
  stepHistory,
  wrap,
  type HistoryPlace,
  type LineState,
} from './lineEdit.ts';

export type DialogKind = 'commands' | 'shortcuts' | 'settings';

export interface ControllerOptions {
  readonly settings: SettingsStorage;
  readonly version: string;
  /** Where `rand()` draws from; tests pass a fixed sequence. */
  readonly random?: () => Decimal;
  /** Writes text to the clipboard. */
  readonly copy?: (text: string) => Promise<void>;
  /** Grows the desktop window to at least this width. */
  readonly fitWidth?: (width: number) => void;
}

const NO_GHOST: Ghost = { ans: false, missingParens: 0, errorAt: null };
const ZERO_SHOWN: Shown = { kind: 'result', text: '0' };

export class AppController {
  readonly version: string;
  readonly settings: Signal<Settings>;
  readonly tape = signal<Tape>(EMPTY_TAPE);
  /** The expression line's text and selection. */
  readonly line = signal<LineState>(EMPTY_LINE);
  readonly shown = signal<Shown>(ZERO_SHOWN);
  readonly ghost = signal<Ghost>(NO_GHOST);
  /** The calculation in classic entry (PRD §9.3). */
  readonly classic = signal<ClassicState>(EMPTY_CLASSIC);
  /** The 2nd key is on (PRD §9.2). */
  readonly second = signal(false);
  readonly dialog = signal<DialogKind | null>(null);
  readonly #notices = new Notices();
  readonly notice = this.#notices.notice;
  /** What the screen reader's live region says (PRD §14). */
  readonly announcement = this.#notices.announcement;

  readonly #storage: SettingsStorage;
  readonly #random: () => Decimal;
  readonly #copy: (text: string) => Promise<void>;
  readonly #fitWidth: ((width: number) => void) | undefined;
  /** The last result the display shows while the line is empty; AC clears it. */
  #last: Decimal | null = null;
  /** The unit of the last result, after a conversion (PRD §6). */
  #lastUnit: string | null = null;
  /** The error the last committed line gave, shown while the line stays empty. */
  #lastError: string | null = null;
  /** The last complete live result, shown greyed while the line is unfinished. */
  #lastLive: string | null = null;
  /** `rand()` values drawn while previewing, so the committed line gets the value that was shown. */
  #pool: Decimal[] = [];
  /** Where ↑/↓ is in the tape's inputs, and what was being typed before (PRD §7.1). */
  #history: HistoryPlace | null = null;
  #droppedShown = false;
  /** Earlier tapes, for ⌘Z (PRD §7.3). */
  readonly #undo = new UndoStack<Tape>();

  constructor(options: ControllerOptions) {
    this.version = options.version;
    this.#storage = options.settings;
    this.settings = signal(options.settings.load());
    this.#random = options.random ?? defaultRandom;
    this.#copy = options.copy ?? ((text) => navigator.clipboard.writeText(text));
    this.#fitWidth = options.fitWidth;
  }

  // Settings (PRD §11)

  update(change: Partial<Settings>): void {
    const next = { ...this.settings.value, ...change };
    this.settings.value = next;
    this.#storage.save(next);
  }

  setMode(mode: Mode): void {
    this.update({ mode });
    this.#fit();
  }

  toggleTape(): void {
    this.update({ showTape: !this.settings.value.showTape });
    this.#fit();
  }

  /** Expression or classic entry (PRD §9.3). Each starts afresh; the expression line keeps its text. */
  setEntry(entry: Entry): void {
    if (entry === this.settings.value.entry) return;
    batch(() => {
      this.update({ entry });
      this.classic.value = EMPTY_CLASSIC;
      this.#history = null;
      this.#refresh();
    });
    this.say(entry === 'classic' ? 'Classic entry is on.' : 'Expression entry is on.');
  }

  toggleEntry(): void {
    this.setEntry(this.classicEntry() ? 'expression' : 'classic');
  }

  /** True in classic entry, where keys build the calculation and there is no expression line. */
  classicEntry(): boolean {
    return this.settings.value.entry === 'classic';
  }

  /** True while there is something C would clear, so the key reads C rather than AC (PRD §9.2). */
  hasEntry(): boolean {
    return this.classicEntry() ? !classicEmpty(this.classic.value) : !!this.line.value.text;
  }

  setAngle(angle: Angle): void {
    this.update({ angle });
    this.#refresh();
    this.say(angle === 'rad' ? 'Angles are in radians.' : 'Angles are in degrees.');
  }

  toggleAngle(): void {
    this.setAngle(this.settings.value.angle === 'deg' ? 'rad' : 'deg');
  }

  setGroupDigits(groupDigits: boolean): void {
    this.update({ groupDigits });
    this.#refresh();
  }

  /** Asks the desktop window to be wide enough for the mode and tape. */
  #fit(): void {
    const { mode, showTape } = this.settings.value;
    this.#fitWidth?.(windowWidth(mode, showTape));
  }

  // Dialogs and notices

  open(kind: DialogKind): void {
    this.dialog.value = kind;
  }

  /** Opens `kind`, or closes it when it is the one open. */
  toggle(kind: DialogKind): void {
    this.dialog.value = this.dialog.value === kind ? null : kind;
  }

  close(): void {
    this.dialog.value = null;
  }

  /** True while a dialog is open: keys then go to the dialog. */
  blocked(): boolean {
    return this.dialog.value !== null;
  }

  say(text: string, options: { tone?: Notice['tone']; action?: Notice['action'] } = {}): void {
    this.#notices.say(text, options);
  }

  dismissNotice(): void {
    this.#notices.dismiss();
  }

  #announce(text: string): void {
    this.#notices.announce(text);
  }

  // The expression line

  /** The text the user typed or pasted; the field already shows it. */
  setLine(state: LineState): void {
    if (state.text !== this.line.value.text) {
      this.#history = null;
      // Typing moves on from a committed error; an emptied line draws `rand()` afresh.
      this.#lastError = null;
      if (!state.text.trim()) this.#pool = [];
    }
    this.line.value = state;
    this.#refresh();
  }

  /** The cursor or selection moved, with no change to the text. Bound, so a view can pass it on as it is. */
  readonly select = (start: number, end: number): void => {
    const s = this.line.value;
    if (s.start !== start || s.end !== end) this.line.value = { ...s, start, end };
  };

  paste(text: string): void {
    this.setLine(insertText(this.line.value, cleanPaste(text)));
  }

  /** Puts text at the cursor: a tape line's result or input (PRD §7.1). */
  insert(text: string): void {
    this.setLine(insertText(this.line.value, text));
  }

  /** Esc: clears the line, or with the line empty, the last result too (`C` then `AC`, PRD §9.2). */
  clear(): void {
    batch(() => {
      const classic = this.classicEntry() ? classicClear(this.classic.value) : null;
      if (classic) {
        this.#setClassic(classic);
      } else if (!this.classicEntry() && this.line.value.text) {
        this.setLine(EMPTY_LINE);
      } else {
        this.#last = null;
        this.#lastError = null;
        this.#history = null;
        this.#pool = [];
        this.#refresh();
      }
    });
  }

  /** A typed key in classic entry, where there is no expression line: true when it pressed a keypad key. */
  typeKey(key: string): boolean {
    if (!this.classicEntry()) return false;
    const id = typedKey(key);
    const def = id === null ? undefined : ALL_KEYS.find((k) => k.id === id);
    if (!def) return false;
    this.press(def);
    return true;
  }

  /** A keypad key (PRD §9.2). */
  press(key: KeyDef): void {
    const def = this.second.value && key.second ? key.second : key;
    const action = def.action;
    if (this.classicEntry() && !['commit', 'clear', 'second', 'angle', 'memory'].includes(action.type)) {
      const s = this.classic.value;
      this.#setClassic(
        action.type === 'backspace' ? classicBackspace(s) : (classicKey(s, def, this.#start()) ?? s),
      );
      if (def !== key) this.second.value = false;
      return;
    }
    const s = this.line.value;
    switch (action.type) {
      case 'insert':
        this.setLine(insertText(s, action.text));
        break;
      case 'call':
        this.setLine(insertCall(s, action.name));
        break;
      case 'wrap':
        // On an empty line after a result, 1/x works on the result.
        this.setLine(
          !s.text.trim() && this.tape.value.lines.length > 0
            ? lineAt(`${action.prefix}ans${action.suffix}`)
            : wrap(s, action.prefix, action.suffix),
        );
        break;
      case 'negate':
        this.setLine(negate(s));
        break;
      case 'backspace':
        this.setLine(backspace(s));
        break;
      case 'clear':
        this.clear();
        break;
      case 'commit':
        this.commit();
        break;
      case 'second':
        this.second.value = !this.second.value;
        return;
      case 'angle':
        this.toggleAngle();
        return;
      case 'memory':
        this.memory(action.operation);
        break;
    }
    // 2nd lasts for one function key.
    if (def !== key) this.second.value = false;
  }

  /**
   * Enter: commits the line to the tape. On an empty line, repeats the last operation on the last result
   * (PRD §7.1).
   */
  commit(): void {
    const typed = this.classicEntry()
      ? classicText(this.classic.value)
      : this.line.value.text.trim()
        ? this.line.value.text
        : null;
    const text = typed ?? repeatInput(this.tape.value);
    if (text !== null) this.#commitText(text);
  }

  /** The classic calculation changed (PRD §9.3). */
  #setClassic(state: ClassicState): void {
    this.#lastError = null;
    this.classic.value = state;
    this.#refresh();
  }

  /** The operand a classic calculation starts from: the last result, or 0 after AC. */
  #start(): string {
    return this.#last ? 'ans' : '0';
  }

  /** Puts `text` on the tape as the next line and shows its result. */
  #commitText(text: string): void {
    const before = this.tape.value;
    const tape = commit(before, text, this.#env());
    const line = tape.lines.at(-1)!;
    if (tape !== before) this.#undo.push(before);
    batch(() => {
      this.tape.value = tape;
      this.#pool = [];
      this.#history = null;
      this.#lastLive = null;
      this.line.value = EMPTY_LINE;
      this.classic.value = EMPTY_CLASSIC;
      this.ghost.value = NO_GHOST;
      this.#lastError = null;
      if (line.result.kind === 'value') {
        this.#last = line.result.value;
        this.#lastUnit = line.result.unit;
        this.#announce(`Result ${this.#formatResult(line.result.value, line.result.unit)}`);
      } else if (line.result.kind === 'error') {
        this.#lastError = line.result.message;
        this.#announce(line.result.message);
      }
      // A comment line has no result: the display keeps the last one.
      this.#refresh();
      if (tape.dropped && !this.#droppedShown) {
        this.#droppedShown = true;
        this.say('The tape keeps 10,000 lines, so the oldest line was dropped.');
      }
    });
  }

  /**
   * The memory keys (PRD §5). MR inserts `mem`. MC, M+ and M− commit a line setting `mem`; M+ and M− use the
   * current result, so a typed line is committed first and its result is the one added.
   */
  memory(operation: 'clear' | 'add' | 'subtract' | 'recall'): void {
    const classic = this.classicEntry();
    if (operation === 'recall') {
      if (classic) this.#setClassic({ ...this.classic.value, entry: 'mem', typing: false });
      else this.setLine(insertText(this.line.value, 'mem'));
      return;
    }
    if (operation === 'clear') {
      // MC leaves what is being typed.
      const typing = this.line.value;
      const calculation = this.classic.value;
      this.#commitText(memoryLine('clear'));
      if (classic) this.#setClassic(calculation);
      else if (typing.text) this.setLine(typing);
      return;
    }
    const typed = classic ? !classicEmpty(this.classic.value) : !!this.line.value.text.trim();
    if (typed ? this.shown.value.kind !== 'live' : this.#lastError !== null) {
      this.say('There’s no result to put in memory.', { tone: 'error' });
      return;
    }
    if (typed) this.commit();
    this.#commitText(memoryLine(operation, this.#last ?? undefined));
  }

  /** True while memory isn't 0: the display shows "M". */
  memorySet(): boolean {
    return memorySet(this.tape.value.scope);
  }

  /** ↑ and ↓: walk back and forward through the tape's inputs, then to what was being typed (PRD §7.1). */
  walkHistory(step: -1 | 1): void {
    const walk = this.classicEntry()
      ? null
      : stepHistory(this.tape.value.lines, this.#history, this.line.value.text, step);
    if (!walk) return;
    this.line.value = lineAt(walk.text);
    this.#history = walk.history;
    this.#refresh();
  }

  /** Clears the tape; the notice's Undo puts it back (PRD §7.3). */
  clearTape(): void {
    const count = this.tape.value.lines.length;
    if (count === 0) return;
    this.#editTape(EMPTY_TAPE);
    this.say(`Cleared ${count === 1 ? '1 line' : `${count.toLocaleString('en-US')} lines`}.`, {
      action: {
        label: 'Undo',
        run: () => void (this.tape.value.lines.length === 0 && this.stepTape('undo')),
      },
    });
  }

  /** Deletes a tape line; the lines after it are worked out again (PRD §7.2). */
  deleteLine(index: number): void {
    this.#editTape(deleteLine(this.tape.value, index, this.#env()));
  }

  /**
   * True when ⌘Z (or ⇧⌘Z) has a tape change to undo (redo). Only with nothing typed: while the expression line
   * has text, the keys undo its typing (PRD §7.3).
   */
  canStepTape(step: 'undo' | 'redo'): boolean {
    return (step === 'undo' ? this.#undo.canUndo() : this.#undo.canRedo()) && !this.hasEntry();
  }

  stepTape(step: 'undo' | 'redo'): void {
    const tape = step === 'undo' ? this.#undo.undo(this.tape.value) : this.#undo.redo(this.tape.value);
    if (tape) this.#showTape(tape);
  }

  /** A change to the tape other than a commit, kept for ⌘Z. */
  #editTape(tape: Tape): void {
    if (tape === this.tape.value) return;
    this.#undo.push(this.tape.value);
    this.#showTape(tape);
  }

  /** Shows `tape`, with its last line's result on the display. */
  #showTape(tape: Tape): void {
    const last = tape.lines.at(-1)?.result;
    batch(() => {
      this.tape.value = tape;
      this.#last = last?.kind === 'value' ? last.value : null;
      this.#lastUnit = last?.kind === 'value' ? last.unit : null;
      this.#lastError = last?.kind === 'error' ? last.message : null;
      this.#history = null;
      this.#refresh();
    });
  }

  /** The number on the display, or null when it shows an error or an unfinished line. */
  currentValue(): string | null {
    return shownNumber(this.shown.value);
  }

  /** ⇧⌘C: copies the number on the display, without grouping commas. */
  async copyResult(): Promise<void> {
    const value = this.currentValue();
    if (value === null) {
      this.say('There’s no result to copy.', { tone: 'error' });
      return;
    }
    await this.copyText(value);
  }

  /** Copies text and says so: a result, or a tape line's input (PRD §7.1). */
  async copyText(text: string): Promise<void> {
    try {
      await this.#copy(text);
      this.say(`Copied ${text}.`);
    } catch {
      this.say('Couldn’t copy to the clipboard.', { tone: 'error' });
    }
  }

  format(value: Decimal): string {
    return formatDecimal(value, { group: this.settings.value.groupDigits });
  }

  /** A result as shown: the number, then its unit after a conversion (`3.1 mi`). */
  #formatResult(value: Decimal, unit: string | null): string {
    return unit ? `${this.format(value)} ${unit}` : this.format(value);
  }

  /** The engine's env: the angle unit, and `rand()` drawing from the preview pool first. */
  #env(): Env {
    let i = 0;
    return {
      angle: this.settings.value.angle,
      random: () => {
        const value = this.#pool[i] ?? this.#random();
        this.#pool[i++] = value;
        return value;
      },
    };
  }

  /** Works out the display and the ghost text from the line (PRD §9.1). */
  #refresh(): void {
    if (this.classicEntry()) {
      this.#refreshClassic();
      return;
    }
    const text = this.line.value.text;
    const tape = this.tape.value;
    if (!text.trim()) {
      this.#lastLive = null;
      this.ghost.value = NO_GHOST;
      this.#showLast();
      return;
    }
    const evaluation = preview(tape, text, this.#env());
    const ans = expandInput(text, tape) !== text;
    const result = evaluation.result;
    let errorAt: number | null = null;
    if (result.kind === 'value') {
      this.#lastLive = this.#formatResult(result.value, result.unit);
      this.shown.value = { kind: 'live', text: this.#lastLive };
    } else if (result.kind === 'error' && !result.incomplete && !/[A-Za-z_]$/.test(text)) {
      // A complete line that fails (`1/0`); a name still being typed (`si`) isn't an error yet.
      this.shown.value = { kind: 'error', text: result.message };
      errorAt = result.at;
    } else {
      this.shown.value = {
        kind: 'pending',
        text: this.#lastLive ?? (this.#last ? this.#formatResult(this.#last, this.#lastUnit) : '0'),
      };
    }
    this.ghost.value = {
      ans: ans && startsWithOperator(text),
      missingParens: evaluation.missingParens,
      errorAt,
    };
  }

  /** The last result, or the last line's error, or 0. */
  #showLast(): void {
    if (this.#lastError !== null) this.shown.value = { kind: 'error', text: this.#lastError };
    else
      this.shown.value = this.#last
        ? { kind: 'result', text: this.#formatResult(this.#last, this.#lastUnit) }
        : ZERO_SHOWN;
  }

  /**
   * The display in classic entry (PRD §9.3): the number being typed as typed, else the value of the entry or of
   * the part of the calculation already worked out.
   */
  #refreshClassic(): void {
    const s = this.classic.value;
    this.ghost.value = NO_GHOST;
    if (s.typing) {
      this.shown.value = { kind: 'live', text: formatEntry(s.entry!, this.settings.value.groupDigits) };
      return;
    }
    const text = s.entry ?? classicSegment(s);
    if (text === null) {
      if (classicEmpty(s)) this.#showLast();
      else this.shown.value = { kind: 'pending', text: this.shown.value.text };
      return;
    }
    const result = evaluate(text, this.tape.value.scope, this.#env()).result;
    if (result.kind === 'value')
      this.shown.value = { kind: 'live', text: this.#formatResult(result.value, result.unit) };
    else if (result.kind === 'error') this.shown.value = { kind: 'error', text: result.message };
  }
}
