/**
 * The channels between the main process and the preload. The sandboxed preload can't import this file,
 * so it repeats the names: keep the two in step.
 */
export const Channels = {
  setMenu: 'abacite:set-menu',
  command: 'abacite:command',
  fitWidth: 'abacite:fit-width',
  folderInfo: 'abacite:folder-info',
  useDefaultFolder: 'abacite:use-default-folder',
  chooseFolder: 'abacite:choose-folder',
  folder: 'abacite:folder',
} as const;

/** One item of the menu bar the page sends, as `NativeMenuItem` in @abacite/ui. */
export interface NativeMenuItem {
  readonly type?: 'separator' | 'checkbox';
  readonly role?: string;
  readonly label?: string;
  readonly command?: string;
  readonly accelerator?: string;
  readonly enabled?: boolean;
  readonly checked?: boolean;
  readonly submenu?: readonly NativeMenuItem[];
}
