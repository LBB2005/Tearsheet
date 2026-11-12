import { afterEach, describe, expect, test, vi } from 'vitest'

import { checkWithUpdater, forgetUpdater, hasUpdateFeed, setAutoInstall, updateMode, type Updater } from './autoUpdate'

describe('which update path a copy uses', () => {
  test('only a packaged release build with an update feed (signed) updates itself', () => {
    expect(updateMode({ packaged: true, testBuild: false, feed: true })).toBe('auto')
    expect(updateMode({ packaged: true, testBuild: false, feed: false })).toBe('banner')
    expect(updateMode({ packaged: true, testBuild: true, feed: true })).toBe('banner')
    expect(updateMode({ packaged: false, testBuild: false, feed: true })).toBe('banner')
  })

  test('the feed is app-update.yml in Resources; any failure is a no', () => {
    const exists = vi.fn((path: string) => path === '/A.app/Contents/Resources/app-update.yml')
    expect(hasUpdateFeed('/A.app/Contents/Resources', exists)).toBe(true)
    expect(hasUpdateFeed('/B.app/Contents/Resources', exists)).toBe(false)
    expect(
      hasUpdateFeed('/A.app/Contents/Resources', () => {
        throw new Error('no disk')
      })
    ).toBe(false)
    expect(hasUpdateFeed('/definitely/not/here')).toBe(false)
  })
})

describe('electron-updater', () => {
  const fake = (check: () => Promise<unknown>): Updater => ({ autoDownload: false, autoInstallOnAppQuit: false, allowPrerelease: false, checkForUpdates: vi.fn(check) })

  test('downloads in the background, installs at quit, and takes betas only on a beta', async () => {
    const updater = fake(async () => null)
    expect(await checkWithUpdater(async () => updater, true)).toBe(true)
    expect(updater).toMatchObject({ autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: true })
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
    await checkWithUpdater(async () => updater, false)
    expect(updater.allowPrerelease).toBe(false)
  })

  afterEach(() => forgetUpdater())

  test('turning updates off stops a downloaded update from installing at quit, and on again restores it', async () => {
    setAutoInstall(false) // nothing loaded yet: nothing to change, no throw
    const updater = fake(async () => null)
    await checkWithUpdater(async () => updater, false)
    expect(updater.autoInstallOnAppQuit).toBe(true)
    setAutoInstall(false)
    expect(updater.autoInstallOnAppQuit).toBe(false)
    setAutoInstall(true)
    expect(updater.autoInstallOnAppQuit).toBe(true)
  })

  test('offline, or no updater, is silent', async () => {
    expect(await checkWithUpdater(async () => fake(async () => Promise.reject(new Error('offline'))), false)).toBe(false)
    expect(await checkWithUpdater(async () => Promise.reject(new Error('missing')), false)).toBe(false)
  })
})
