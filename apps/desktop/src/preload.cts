// Sandboxed preload: CommonJS, and it may only require('electron'), so the channel names from
// bridge.ts are repeated here. Keep them in step. It exposes exactly one object, `abaciteNative`.
import type { NativeMenuItem } from './bridge.ts';

const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? '';

contextBridge.exposeInMainWorld('abaciteNative', {
  version: arg('abacite-version'),
  setMenu: (items: readonly NativeMenuItem[]) => ipcRenderer.send('abacite:set-menu', items),
  onCommand: (fn: (id: string) => void) => ipcRenderer.on('abacite:command', (_e, id: string) => fn(id)),
  fitWidth: (width: number) => ipcRenderer.send('abacite:fit-width', width),
  folderInfo: () => ipcRenderer.invoke('abacite:folder-info'),
  useDefaultFolder: () => ipcRenderer.invoke('abacite:use-default-folder'),
  chooseFolder: () => ipcRenderer.invoke('abacite:choose-folder'),
  folder: (op: string, args: readonly unknown[]) => ipcRenderer.invoke('abacite:folder', op, args),
  exportSession: (name: string, text: string) => ipcRenderer.invoke('abacite:export-session', name, text),
  latestRelease: () => ipcRenderer.invoke('abacite:latest-release'),
});
