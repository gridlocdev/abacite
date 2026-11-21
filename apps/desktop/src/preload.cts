// Sandboxed preload: CommonJS, and it may only require('electron'), so the channel names from
// bridge.ts are repeated here. Keep them in step. It exposes exactly one object, `abaciteNative`.
import type { NativeMenuItem } from './bridge.ts';

const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? '';

contextBridge.exposeInMainWorld('abaciteNative', {
  version: arg('abacite-version'),
  chrome: arg('abacite-chrome'),
  onFullScreen: (fn: (full: boolean) => void) =>
    ipcRenderer.on('abacite:full-screen', (_e, full: boolean) => fn(full)),
  setMenu: (items: readonly NativeMenuItem[]) => ipcRenderer.send('abacite:set-menu', items),
  onCommand: (fn: (id: string) => void) => ipcRenderer.on('abacite:command', (_e, id: string) => fn(id)),
  resizeWindow: (from: number, to: number) => ipcRenderer.send('abacite:resize-window', from, to),
  folderInfo: () => ipcRenderer.invoke('abacite:folder-info'),
  useDefaultFolder: () => ipcRenderer.invoke('abacite:use-default-folder'),
  chooseFolder: () => ipcRenderer.invoke('abacite:choose-folder'),
  folder: (op: string, args: readonly unknown[]) => ipcRenderer.invoke('abacite:folder', op, args),
  exportSession: (name: string, text: string) => ipcRenderer.invoke('abacite:export-session', name, text),
  latestRelease: () => ipcRenderer.invoke('abacite:latest-release'),
});
