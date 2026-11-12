/** Startup variables required by native executables before model evaluation. */

/** Native executable search, Windows system/profile paths, and sandbox temporary paths retained in the OS environment. */
export const STARTUP_ENVIRONMENT_NAMES: ReadonlySet<string> = new Set([
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'SYSTEMDRIVE',
  'WINDIR',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'HOMEPATH',
  'HOMEDRIVE',
  'APPDATA',
  'LOCALAPPDATA',
  'COMSPEC',
])
