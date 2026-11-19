/** The app's state and what the UI does to it. Components read the signals and call the methods. */
import { batch, signal, type Signal } from '@preact/signals';
import {
  EMPTY_TAPE,
  commit,
  defaultRandom,
  expandInput,
  formatDecimal,
  preview,
  repeatInput,
  startsWithOperator,
  type Decimal,
  type Env,
  type Tape,
} from '@abacite/core';
import { after, type Angle, type Mode, type Settings, type SettingsStorage, type Theme } from '@abacite/ui';
import { type KeyDef } from './keyDefs.ts';
import {
  EMPTY_LINE,
  backspace,
  cleanPaste,
  insertCall,
  insertText,
  lineAt,
  negate,
  wrap,
  type LineState,
} from './lineEdit.ts';

export type DialogKind = 'commands' | 'shortcuts' | 'settings';

export interface Notice {
  readonly text: string;
  readonly tone: 'info' | 'error';
  readonly action?: { readonly label: string; readonly run: () => void };
}

/** How long a notice stays; one with an action stays longer, so there is time to use it. */
export const NOTICE_MS = 4_000;
export const NOTICE_ACTION_MS = 10_000;

/** What the display shows (PRD §9.1). */
export type Shown =
  /** The committed result, or the last one while the line is empty. */
  | { readonly kind: 'result'; readonly text: string }
  /** The live result of the expression line. */
  | { readonly kind: 'live'; readonly text: string }
  /** The line isn't finished: the last complete result, greyed. */
  | { readonly kind: 'pending'; readonly text: string }
  | { readonly kind: 'error'; readonly text: string };

/** What the expression line draws behind the typed text (PRD §7.1, §4.1). */
export interface Ghost {
  /** `ans ` in front of a leading operator. */
  readonly ans: boolean;
  /** `)`s the end of the line closes. */
  readonly missingParens: number;
  /** Where to underline an error in the typed text, or null. */
  readonly errorAt: number | null;
}

/** Window widths the desktop app grows to (PRD §9.1). */
export const WIDTHS = { basic: 400, scientific: 720, tape: 260 } as const;

export function windowWidth(mode: Mode, tape: boolean): number {
  return WIDTHS[mode] + (tape ? WIDTHS.tape : 0);
}

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
  /** The 2nd key is on (PRD §9.2). */
  readonly second = signal(false);
  readonly dialog = signal<DialogKind | null>(null);
  readonly notice = signal<Notice | null>(null);
  /** What the screen reader's live region says (PRD §14). */
  readonly announcement = signal('');

  readonly #storage: SettingsStorage;
  readonly #random: () => Decimal;
  readonly #copy: (text: string) => Promise<void>;
  readonly #fitWidth: ((width: number) => void) | undefined;
  /** The last result the display shows while the line is empty; AC clears it. */
  #last: Decimal | null = null;
  /** The error the last committed line gave, shown while the line stays empty. */
  #lastError: string | null = null;
  /** The last complete live result, shown greyed while the line is unfinished. */
  #lastLive: string | null = null;
  /** `rand()` values drawn while previewing, so the committed line gets the value that was shown. */
  #pool: Decimal[] = [];
  /** Where ↑/↓ is in the tape's inputs, and what was being typed before (PRD §7.1). */
  #history: { index: number; draft: string } | null = null;
  #noticeTimer: (() => void) | null = null;
  #droppedShown = false;

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

  setTheme(theme: Theme): void {
    this.update({ theme });
  }

  setMode(mode: Mode): void {
    this.update({ mode });
    this.#fit();
  }

  toggleTape(): void {
    this.update({ showTape: !this.settings.value.showTape });
    this.#fit();
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
    this.#noticeTimer?.();
    this.notice.value = {
      text,
      tone: options.tone ?? 'info',
      ...(options.action ? { action: options.action } : {}),
    };
    this.#announce(text);
    this.#noticeTimer = after(options.action ? NOTICE_ACTION_MS : NOTICE_MS, () => this.dismissNotice());
  }

  /**
   * Says `text` through the live region. The same text twice in a row gets a trailing no-break space, so the
   * region changes and screen readers read it again (PRD §14).
   */
  #announce(text: string): void {
    this.announcement.value = this.announcement.value === text ? `${text}\u00a0` : text;
  }

  dismissNotice(): void {
    this.#noticeTimer?.();
    this.#noticeTimer = null;
    this.notice.value = null;
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
      if (this.line.value.text) {
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

  /** A keypad key (PRD §9.2). */
  press(key: KeyDef): void {
    const def = this.second.value && key.second ? key.second : key;
    const action = def.action;
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
    }
    // 2nd lasts for one function key.
    if (def !== key) this.second.value = false;
  }

  /**
   * Enter: commits the line to the tape. On an empty line, repeats the last operation on the last result
   * (PRD §7.1).
   */
  commit(): void {
    const text = this.line.value.text.trim() ? this.line.value.text : repeatInput(this.tape.value);
    if (text === null) return;
    const before = this.tape.value;
    const tape = commit(before, text, this.#env());
    const line = tape.lines.at(-1)!;
    batch(() => {
      this.tape.value = tape;
      this.#pool = [];
      this.#history = null;
      this.#lastLive = null;
      this.line.value = EMPTY_LINE;
      this.ghost.value = NO_GHOST;
      this.#lastError = null;
      if (line.result.kind === 'value') {
        this.#last = line.result.value;
        this.#announce(`Result ${this.format(line.result.value)}`);
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

  /** ↑: the previous tape input (PRD §7.1). */
  historyBack(): void {
    const lines = this.tape.value.lines;
    if (lines.length === 0) return;
    const h = this.#history ?? { index: lines.length, draft: this.line.value.text };
    if (h.index === 0) return;
    this.#showHistory({ index: h.index - 1, draft: h.draft });
  }

  /** ↓: the next tape input, then what was being typed. */
  historyForward(): void {
    const h = this.#history;
    if (!h) return;
    const lines = this.tape.value.lines;
    if (h.index + 1 >= lines.length) {
      this.line.value = lineAt(h.draft);
      this.#history = null;
      this.#refresh();
      return;
    }
    this.#showHistory({ index: h.index + 1, draft: h.draft });
  }

  #showHistory(h: { index: number; draft: string }): void {
    this.line.value = lineAt(this.tape.value.lines[h.index]!.input);
    this.#history = h;
    this.#refresh();
  }

  /** Clears the tape; the notice's Undo puts it back (PRD §7.3). */
  clearTape(): void {
    const before = this.tape.value;
    const count = before.lines.length;
    if (count === 0) return;
    batch(() => {
      this.tape.value = EMPTY_TAPE;
      this.#last = null;
      this.#lastError = null;
      this.#history = null;
      this.#refresh();
    });
    this.say(`Cleared ${count === 1 ? '1 line' : `${count.toLocaleString('en-US')} lines`}.`, {
      action: {
        label: 'Undo',
        run: () => {
          if (this.tape.value.lines.length > 0) return;
          const last = before.lines.at(-1)?.result;
          this.tape.value = before;
          this.#last = last?.kind === 'value' ? last.value : null;
          this.#refresh();
        },
      },
    });
  }

  /** The number on the display, or null when it shows an error or an unfinished line. */
  currentValue(): string | null {
    const shown = this.shown.value;
    return shown.kind === 'result' || shown.kind === 'live' ? shown.text.replaceAll(',', '') : null;
  }

  /** ⇧⌘C: copies the number on the display, without grouping commas. */
  async copyResult(): Promise<void> {
    const value = this.currentValue();
    if (value === null) {
      this.say('There’s no result to copy.', { tone: 'error' });
      return;
    }
    try {
      await this.#copy(value);
      this.say(`Copied ${value}.`);
    } catch {
      this.say('Couldn’t copy to the clipboard.', { tone: 'error' });
    }
  }

  format(value: Decimal): string {
    return formatDecimal(value, { group: this.settings.value.groupDigits });
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
    const text = this.line.value.text;
    const tape = this.tape.value;
    if (!text.trim()) {
      this.#lastLive = null;
      this.ghost.value = NO_GHOST;
      if (this.#lastError !== null) this.shown.value = { kind: 'error', text: this.#lastError };
      else this.shown.value = this.#last ? { kind: 'result', text: this.format(this.#last) } : ZERO_SHOWN;
      return;
    }
    const evaluation = preview(tape, text, this.#env());
    const ans = expandInput(text, tape) !== text;
    const result = evaluation.result;
    let errorAt: number | null = null;
    if (result.kind === 'value') {
      this.#lastLive = this.format(result.value);
      this.shown.value = { kind: 'live', text: this.#lastLive };
    } else if (result.kind === 'error' && !result.incomplete && !/[A-Za-z_]$/.test(text)) {
      // A complete line that fails (`1/0`); a name still being typed (`si`) isn't an error yet.
      this.shown.value = { kind: 'error', text: result.message };
      errorAt = result.at;
    } else {
      this.shown.value = {
        kind: 'pending',
        text: this.#lastLive ?? (this.#last ? this.format(this.#last) : '0'),
      };
    }
    this.ghost.value = {
      ans: ans && startsWithOperator(text),
      missingParens: evaluation.missingParens,
      errorAt,
    };
  }
}
