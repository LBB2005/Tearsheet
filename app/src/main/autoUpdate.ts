// Full auto-update with electron-updater (docs/launch/signing.md), for later. It runs only in a
// release build that is packaged, isn't a test build, and is signed with an Apple Developer ID:
// macOS refuses to install an update into an app that isn't. Every other copy (today's ad-hoc
// signed download, test builds, `npm run dev`) uses the update banner (updates.ts) instead.
//
// electron-updater reads app-update.yml in the bundle's Resources, which electron-builder writes
// only for a signed build (electron-builder.cjs, `publish`), and then latest-mac.yml from the
// newest GitHub release. It downloads the update in the background and installs it when Tearsheet
// quits. "Check for updates" in Settings turns it off too.

import { execFile } from 'node:child_process'

export type UpdateMode = 'auto' | 'banner'

export function updateMode(options: { packaged: boolean; testBuild: boolean; developerId: boolean }): UpdateMode {
  return options.packaged && !options.testBuild && options.developerId ? 'auto' : 'banner'
}

// The .app bundle around the running executable: …/Tearsheet.app/Contents/MacOS/Tearsheet.
export function appBundle(exePath: string): string | null {
  const at = exePath.lastIndexOf('.app/Contents/MacOS/')
  return at < 0 ? null : exePath.slice(0, at + 4)
}

// codesign -dv prints the signature's details on stderr. A Developer ID signature names its
// authority "Developer ID Application: <name> (<team>)"; an ad-hoc one says "Signature=adhoc".
export function signedByDeveloperId(codesignOutput: string): boolean {
  return /^Authority=Developer ID Application: /m.test(codesignOutput) && !/^Signature=adhoc$/m.test(codesignOutput)
}

export type Run = (file: string, args: string[]) => Promise<string>

const runCodesign: Run = (file, args) =>
  new Promise((resolve) => {
    execFile(file, args, { timeout: 5000 }, (_error, stdout, stderr) => resolve(`${stdout}${stderr}`))
  })

// Whether the bundle at `bundle` is signed with a Developer ID. Any failure is a no.
export async function developerIdSigned(bundle: string | null, run: Run = runCodesign): Promise<boolean> {
  if (!bundle) return false
  try {
    return signedByDeveloperId(await run('/usr/bin/codesign', ['-dv', '--verbose=2', bundle]))
  } catch {
    return false
  }
}

// The part of electron-updater's autoUpdater used here, so tests can pass a fake.
export interface Updater {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  checkForUpdates(): Promise<unknown>
}

// Asks once (the caller keeps it to once a day). Never throws: offline is silent.
export async function checkWithUpdater(load: () => Promise<Updater>, prerelease: boolean): Promise<boolean> {
  try {
    const updater = await load()
    updater.autoDownload = true
    updater.autoInstallOnAppQuit = true
    updater.allowPrerelease = prerelease
    await updater.checkForUpdates()
    return true
  } catch {
    return false
  }
}

// electron-updater itself, loaded only when it is used.
export async function loadUpdater(): Promise<Updater> {
  const mod = await import('electron-updater')
  return mod.autoUpdater as unknown as Updater
}
