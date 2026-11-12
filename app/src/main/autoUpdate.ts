// Full auto-update with electron-updater (docs/launch/signing.md), for later. It runs only in a
// release build that is packaged, isn't a test build, and is signed with an Apple Developer ID
// (it has app-update.yml, below): macOS refuses to install an update into an app that isn't.
// Every other copy (today's ad-hoc signed download, test builds, `npm run dev`) uses the update
// banner (updates.ts) instead.
//
// electron-updater reads app-update.yml in the bundle's Resources, which electron-builder writes
// only for a signed build (electron-builder.cjs, `publish`), and then latest-mac.yml from the
// newest GitHub release. It downloads the update in the background and installs it when Tearsheet
// quits. "Check for updates" in Settings turns it off too, including an install already waiting
// for quit (setAutoInstall).

import { existsSync } from 'node:fs'
import { join } from 'node:path'

export type UpdateMode = 'auto' | 'banner'

export function updateMode(options: { packaged: boolean; testBuild: boolean; feed: boolean }): UpdateMode {
  return options.packaged && !options.testBuild && options.feed ? 'auto' : 'banner'
}

// electron-builder writes Resources/app-update.yml only from a `publish` block, and
// build/signing.cjs gives one only to a build signed with a Developer ID (CSC_LINK or CSC_NAME).
// So the file is the mark of a signed release build. Checking it is instant, which lets the update
// check exist before the window first asks for it (code review, 12 Nov 2026: the earlier
// `codesign -dv` child process left a gap in which the window got a default answer).
export function hasUpdateFeed(resourcesPath: string, exists: (path: string) => boolean = existsSync): boolean {
  try {
    return exists(join(resourcesPath, 'app-update.yml'))
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

// The updater once a check has loaded it, so turning "Check for updates" off can reach it.
let loaded: Updater | null = null

// Asks once (the caller keeps it to once a day). Never throws: offline is silent.
export async function checkWithUpdater(load: () => Promise<Updater>, prerelease: boolean): Promise<boolean> {
  try {
    const updater = await load()
    loaded = updater
    updater.autoDownload = true
    updater.autoInstallOnAppQuit = true
    updater.allowPrerelease = prerelease
    await updater.checkForUpdates()
    return true
  } catch {
    return false
  }
}

// "Check for updates" turned off (or back on): an update already downloaded in the background is
// installed at quit only while the setting is on. Before any check has loaded the updater there
// is nothing to change.
export function setAutoInstall(on: boolean): void {
  if (loaded) loaded.autoInstallOnAppQuit = on
}

// For tests: forget the loaded updater.
export function forgetUpdater(): void {
  loaded = null
}

// electron-updater itself, loaded only when it is used.
export async function loadUpdater(): Promise<Updater> {
  const mod = await import('electron-updater')
  return mod.autoUpdater as unknown as Updater
}
