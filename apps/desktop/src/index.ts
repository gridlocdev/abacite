// The desktop app's pure parts, for its tests. Electron starts from main.ts.
export { Channels, type NativeMenuItem } from './bridge.ts';
export { editMenuTemplate, toTemplate, withStandardMenus, type EditMenuParams } from './menu.ts';
export {
  allowPermission,
  appFile,
  appRequestFile,
  dataPaths,
  HEADLESS_PREFIX,
  isAppUrl,
  isHeadless,
  removeStaleHeadlessProfiles,
  type DataPaths,
} from './paths.ts';
export {
  loadSavedWindow,
  parseSavedWindow,
  placeWindow,
  saveWindow,
  saveWindowSync,
  widened,
  type Rect,
  type SavedWindow,
} from './windowState.ts';
export {
  folderCall,
  folderExists,
  loadFolderChoice,
  saveFolderChoice,
  type FolderInfo,
  type FolderReply,
} from './folderChoice.ts';
export { FolderError, NodeFolder, versionOf, type FileRead, type FolderErrorKind } from './tapeFolder.ts';
export {
  CHECK_INTERVAL_MS,
  RELEASES_API,
  RELEASES_PAGE,
  checkForUpdate,
  fetchLatestRelease,
  isNewer,
  loadLastCheck,
  parseRelease,
  parseVersion,
  saveLastCheck,
  type Release,
} from './updates.ts';
