import { describe, expect, test, vi } from 'vitest'

import { appBundle, checkWithUpdater, developerIdSigned, signedByDeveloperId, updateMode, type Updater } from './autoUpdate'

const DEVELOPER_ID = `Executable=/Applications/Tearsheet.app/Contents/MacOS/Tearsheet
Identifier=com.liamblackshawbrown.tearsheet
Format=app bundle with Mach-O thin (arm64)
CodeDirectory v=20500 size=1234 flags=0x10000(runtime) hashes=27+7 location=embedded
Authority=Developer ID Application: Example Person (ABCDE12345)
Authority=Developer ID Certification Authority
Authority=Apple Root CA
TeamIdentifier=ABCDE12345
`
const AD_HOC = `Executable=/Applications/Tearsheet.app/Contents/MacOS/Tearsheet
Identifier=com.liamblackshawbrown.tearsheet
CodeDirectory v=20400 size=1234 flags=0x2(adhoc) hashes=27+7 location=embedded
Signature=adhoc
TeamIdentifier=not set
`

describe('which update path a copy uses', () => {
  test('only a packaged release build signed with a Developer ID updates itself', () => {
    expect(updateMode({ packaged: true, testBuild: false, developerId: true })).toBe('auto')
    expect(updateMode({ packaged: true, testBuild: false, developerId: false })).toBe('banner')
    expect(updateMode({ packaged: true, testBuild: true, developerId: true })).toBe('banner')
    expect(updateMode({ packaged: false, testBuild: false, developerId: true })).toBe('banner')
  })

  test('the bundle is found around the executable', () => {
    expect(appBundle('/Applications/Tearsheet.app/Contents/MacOS/Tearsheet')).toBe('/Applications/Tearsheet.app')
    expect(appBundle('/usr/local/bin/electron')).toBeNull()
  })

  test('a Developer ID signature counts; ad hoc does not', () => {
    expect(signedByDeveloperId(DEVELOPER_ID)).toBe(true)
    expect(signedByDeveloperId(AD_HOC)).toBe(false)
    expect(signedByDeveloperId('')).toBe(false)
    expect(signedByDeveloperId(`${DEVELOPER_ID}Signature=adhoc\n`)).toBe(false)
  })

  test('codesign is asked about the bundle; any failure is a no', async () => {
    const run = vi.fn(async () => DEVELOPER_ID)
    expect(await developerIdSigned('/Applications/Tearsheet.app', run)).toBe(true)
    expect(run).toHaveBeenCalledWith('/usr/bin/codesign', ['-dv', '--verbose=2', '/Applications/Tearsheet.app'])
    expect(await developerIdSigned(null, run)).toBe(false)
    expect(
      await developerIdSigned('/x.app', async () => {
        throw new Error('no codesign')
      })
    ).toBe(false)
  })

  test('the real codesign on something unsigned says no', async () => {
    expect(await developerIdSigned('/definitely/not/here.app')).toBe(false)
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

  test('offline, or no updater, is silent', async () => {
    expect(await checkWithUpdater(async () => fake(async () => Promise.reject(new Error('offline'))), false)).toBe(false)
    expect(await checkWithUpdater(async () => Promise.reject(new Error('missing')), false)).toBe(false)
  })
})
