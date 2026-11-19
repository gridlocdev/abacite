// What the web app's tests reach. The page itself starts from main.tsx.
export { AppController, type ControllerOptions, type DialogKind } from './app/controller.ts';
export { NOTICE_ACTION_MS, NOTICE_MS, type Notice } from './app/notices.ts';
export { WIDTHS, windowWidth, type Ghost, type Shown } from './app/view.ts';
export {
  EMPTY_CLASSIC,
  atomic,
  classicKey,
  classicPending,
  classicSegment,
  classicText,
  formatEntry,
  type ClassicState,
} from './app/classic.ts';
export { buildCommands } from './app/commands.ts';
export { MAX_UNDO, UndoStack } from './app/undo.ts';
export { menuSender, nativeMenu } from './app/nativeMenu.ts';
export { shortcutGroups, type ShortcutGroup, type ShortcutLine } from './app/shortcuts.ts';
export { ALL_KEYS, BASIC_ROWS, SCIENTIFIC_ROWS, type KeyAction, type KeyDef } from './app/keyDefs.ts';
export {
  EMPTY_LINE,
  backspace,
  cleanPaste,
  insertCall,
  insertText,
  lineAt,
  negate,
  wrap,
  type LineState,
} from './app/lineEdit.ts';
export {
  RETRIES,
  TapeSession,
  type Conflict,
  type Recovery,
  type SaveState,
  type SessionOptions,
} from './app/tapeSession.ts';
export { editByKey } from './app/lineEdit.ts';
