// What the web app's tests reach. The page itself starts from main.tsx.
export {
  AppController,
  NOTICE_ACTION_MS,
  NOTICE_MS,
  WIDTHS,
  windowWidth,
  type ControllerOptions,
  type DialogKind,
  type Ghost,
  type Notice,
  type Shown,
} from './app/controller.ts';
export { buildCommands } from './app/commands.ts';
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
