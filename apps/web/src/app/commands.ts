/** Every command, for the keyboard, ⌘K, the menu bar and the Keyboard Shortcuts window (PRD §10). */
import { CommandCatalog, type CommandSpec, type Theme } from '@abacite/ui';
import type { AppController, DialogKind } from './controller.ts';
import { inBrowserStorage, type TapeFolders } from './tapeFolders.ts';
import type { TapeSession } from './tapeSession.ts';

const THEME_TITLES: Readonly<Record<Theme, string>> = {
  system: 'System Appearance',
  light: 'Light Appearance',
  dark: 'Dark Appearance',
};

/** Commands that open or close their own window still run with a dialog open, so their key closes it again. */
const DIALOG_TOGGLES = new Set([
  'help.commands',
  'help.shortcuts',
  'app.settings',
  'file.open',
  'file.rename',
  'file.trash',
]);

/**
 * The File menu's tape commands (PRD §8.2). They run on the open folder's session; while no folder is open
 * (at start, or while another is picked) no command runs at all.
 */
function tapeCommands(app: AppController, folders: TapeFolders): CommandSpec[] {
  const session = () => folders.session.value;
  const act =
    (what: string, task: (s: TapeSession) => Promise<unknown>): (() => void) =>
    () => {
      const s = session();
      if (!s) return;
      task(s).catch((e: unknown) => {
        console.warn(e);
        app.say(`Couldn’t ${what}: ${e instanceof Error ? e.message : String(e)}`, { tone: 'error' });
      });
    };
  const platform = folders.platform;
  const specs: CommandSpec[] = [
    {
      id: 'file.new',
      title: 'New Tape',
      description: 'Start a new tape in the tape folder.',
      group: 'File',
      shortcuts: ['mod+n'],
      run: act('make a new tape', (s) => s.newTape()),
    },
    {
      id: 'file.open',
      title: 'Open Tape…',
      description: 'Pick one of the tapes in the tape folder.',
      group: 'File',
      keywords: 'switch list tapes files',
      run: () => app.toggle('tapes'),
    },
  ];
  if (platform.canChoose)
    specs.push({
      id: 'file.folder',
      title: 'Open Tape Folder…',
      description: 'Keep tapes in another folder.',
      group: 'File',
      shortcuts: ['mod+o'],
      keywords: 'choose directory location',
      run: () => void folders.choose(),
    });
  if (platform.offersDefault)
    specs.push({
      id: 'file.browserStorage',
      title: platform.defaultTitle,
      description: 'Keep tapes in the browser’s own storage instead of a folder.',
      group: 'File',
      enabled: () => !inBrowserStorage(session()),
      run: () => void folders.useDefault(),
    });
  specs.push(
    {
      id: 'file.rename',
      title: 'Rename Tape…',
      description: 'Give the open tape another name.',
      group: 'File',
      run: () => app.toggle('rename'),
    },
    {
      id: 'file.delete',
      title: 'Delete Tape',
      description: 'Move the open tape to the trash.',
      group: 'File',
      keywords: 'remove trash',
      danger: true,
      run: act('delete the tape', (s) => s.trash()),
    },
    {
      id: 'file.export',
      title: 'Export Tape…',
      description: 'Save a copy of the open tape as a text file.',
      group: 'File',
      keywords: 'download save copy',
      run: () =>
        void folders.exportTape().catch((e: unknown) => {
          app.say(`Couldn’t export the tape: ${e instanceof Error ? e.message : String(e)}`, {
            tone: 'error',
          });
        }),
    },
    {
      id: 'file.trash',
      title: 'Open Trash…',
      description: 'See deleted tapes and restore them.',
      group: 'File',
      keywords: 'restore deleted',
      run: () => {
        if (app.dialog.value === 'trash') app.close();
        else
          act('open the trash', async (s) => {
            await s.listTrash();
            app.open('trash');
          })();
      },
    },
  );
  return specs;
}

/** Dialogs that wait for an answer: no other window replaces them. */
const QUESTIONS: ReadonlySet<DialogKind> = new Set(['conflict', 'recovery', 'folder']);

export function buildCommands(app: AppController, folders?: TapeFolders): CommandCatalog {
  const s = () => app.settings.value;
  const specs: CommandSpec[] = [
    ...(folders ? tapeCommands(app, folders) : []),
    {
      id: 'app.settings',
      title: 'Settings…',
      description: 'Change the appearance, the angle unit and how results are shown.',
      group: 'File',
      shortcuts: ['mod+,'],
      keywords: 'preferences options',
      global: true,
      run: () => app.toggle('settings'),
    },
    {
      id: 'line.commit',
      title: 'Calculate',
      description: 'Put the expression line on the tape; on an empty line, repeat the last operation.',
      group: 'Edit',
      shortcuts: ['enter'],
      keywords: 'equals enter commit',
      keysOnly: true,
      run: () => app.commit(),
    },
    {
      id: 'line.clear',
      title: 'Clear Line',
      description: 'Clear the expression line; on an empty line, clear the last result too.',
      group: 'Edit',
      shortcuts: ['esc'],
      keywords: 'ac all clear',
      keysOnly: true,
      run: () => app.clear(),
    },
    {
      id: 'line.historyBack',
      title: 'Previous Tape Line',
      description: 'Put the previous tape line in the expression line.',
      group: 'Edit',
      shortcuts: ['up'],
      keysOnly: true,
      hidden: true,
      run: () => app.walkHistory(-1),
    },
    {
      id: 'line.historyForward',
      title: 'Next Tape Line',
      description: 'Put the next tape line in the expression line, then what you were typing.',
      group: 'Edit',
      shortcuts: ['down'],
      keysOnly: true,
      hidden: true,
      run: () => app.walkHistory(1),
    },
    {
      id: 'edit.copyResult',
      title: 'Copy Result',
      description: 'Copy the number on the display, without grouping commas.',
      group: 'Edit',
      shortcuts: ['shift+mod+c'],
      global: true,
      run: () => app.copyResult(),
    },
    {
      id: 'tape.undo',
      title: 'Undo Tape Change',
      description: 'Undo the last change to the tape: a new line, a deleted line or Clear Tape.',
      group: 'Edit',
      shortcuts: ['mod+z'],
      keysOnly: true,
      enabled: () => app.canStepTape('undo'),
      run: () => app.stepTape('undo'),
    },
    {
      id: 'tape.redo',
      title: 'Redo Tape Change',
      description: 'Redo the tape change you undid last.',
      group: 'Edit',
      shortcuts: ['shift+mod+z'],
      keysOnly: true,
      enabled: () => app.canStepTape('redo'),
      run: () => app.stepTape('redo'),
    },
    {
      id: 'tape.clear',
      title: 'Clear Tape',
      description: 'Remove every line from the tape.',
      group: 'Edit',
      shortcuts: ['shift+mod+backspace'],
      danger: true,
      enabled: () => app.tape.value.lines.length > 0,
      run: () => app.clearTape(),
    },
    {
      id: 'view.basic',
      title: 'Basic',
      description: 'Show the basic keypad.',
      group: 'View',
      shortcuts: ['mod+1'],
      keywords: 'mode keypad',
      checked: () => s().mode === 'basic',
      run: () => app.setMode('basic'),
    },
    {
      id: 'view.scientific',
      title: 'Scientific',
      description: 'Show the scientific keypad beside the basic one.',
      group: 'View',
      shortcuts: ['mod+2'],
      keywords: 'mode keypad functions',
      checked: () => s().mode === 'scientific',
      run: () => app.setMode('scientific'),
    },
    {
      id: 'view.classic',
      title: 'Classic Entry',
      description: 'Work the keypad like a pocket calculator, with no expression line.',
      group: 'View',
      shortcuts: ['mod+e'],
      keywords: 'entry mode calculator immediate',
      checked: () => s().entry === 'classic',
      run: () => app.toggleEntry(),
    },
    {
      id: 'view.tape',
      title: 'Show Tape',
      description: 'Show or hide the tape of past calculations.',
      group: 'View',
      shortcuts: ['mod+t'],
      keywords: 'history paper',
      checked: () => s().showTape,
      run: () => app.toggleTape(),
    },
    {
      id: 'view.angle',
      title: 'Radians',
      description: 'Switch trigonometry between degrees and radians.',
      group: 'View',
      shortcuts: ['shift+mod+r'],
      keywords: 'degrees angle deg rad',
      checked: () => s().angle === 'rad',
      run: () => app.toggleAngle(),
    },
    ...(['system', 'light', 'dark'] as const).map((theme): CommandSpec => ({
      id: `view.theme${theme[0]!.toUpperCase()}${theme.slice(1)}`,
      title: THEME_TITLES[theme],
      description: `Use the ${theme === 'system' ? 'system’s' : theme} appearance.`,
      group: 'View',
      keywords: 'theme dark mode light mode',
      checked: () => s().theme === theme,
      run: () => app.update({ theme }),
    })),
    {
      id: 'help.commands',
      title: 'Command Menu',
      description: 'Search every command.',
      group: 'Help',
      shortcuts: ['mod+k'],
      global: true,
      run: () => app.toggle('commands'),
    },
    {
      id: 'help.shortcuts',
      title: 'Keyboard Shortcuts',
      description: 'List every keyboard shortcut.',
      group: 'Help',
      shortcuts: ['mod+/'],
      keywords: 'keys help',
      global: true,
      run: () => app.toggle('shortcuts'),
    },
  ];
  const catalog = new CommandCatalog(specs);
  catalog.gate = (c) => {
    if (folders !== undefined && folders.session.value === null) return false;
    const open = app.dialog.value;
    return open === null || (DIALOG_TOGGLES.has(c.id) && !QUESTIONS.has(open));
  };
  return catalog;
}
