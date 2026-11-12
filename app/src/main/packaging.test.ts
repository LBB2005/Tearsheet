// The build settings (electron-builder.cjs, build/signing.cjs): signing switches on only from the
// environment, and without it the build is the old ad-hoc one (docs/launch/signing.md).

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, test, vi } from 'vitest'

const require = createRequire(import.meta.url)
const APP = join(__dirname, '..', '..')
const { macSigning, notarizeWith, certificate } = require(join(APP, 'build', 'signing.cjs')) as {
  macSigning: (env: Record<string, string | undefined>) => { signed: boolean; notarize: string | null; why: string; mac: Record<string, unknown>; publish: unknown[] | null }
  notarizeWith: (env: Record<string, string | undefined>) => string | null
  certificate: (env: Record<string, string | undefined>) => string | null
}

const UNSIGNED_MAC = { target: [{ target: 'dir', arch: 'arm64' }], identity: '-', hardenedRuntime: false, notarize: false }
const APPLE_ID = { APPLE_ID: 'a@example.com', APPLE_APP_SPECIFIC_PASSWORD: 'abcd-efgh-ijkl-mnop', APPLE_TEAM_ID: 'ABCDE12345' }

describe('signing is off until a certificate is in the environment', () => {
  test('no certificate: ad hoc, no hardened runtime, no notarization, no publish block', () => {
    for (const env of [{}, APPLE_ID, { CSC_LINK: '  ' }, { CSC_KEY_PASSWORD: 'x' }]) {
      const s = macSigning(env)
      expect(s.signed).toBe(false)
      expect(s.mac).toEqual(UNSIGNED_MAC)
      expect(s.publish).toBeNull()
    }
  })

  test('a test build is never signed with a Developer ID', () => {
    const s = macSigning({ TEARSHEET_TEST_BUILD: '1', CSC_LINK: '/certs/id.p12', ...APPLE_ID })
    expect(s.signed).toBe(false)
    expect(s.mac).toEqual(UNSIGNED_MAC)
    expect(s.why).toMatch(/test build/)
  })

  test('a .p12 or a keychain identity signs, with the hardened runtime and the entitlements', () => {
    expect(certificate({ CSC_LINK: '/certs/id.p12' })).toBe('CSC_LINK')
    expect(certificate({ CSC_NAME: 'Example Person (ABCDE12345)' })).toBe('CSC_NAME')
    for (const env of [{ CSC_LINK: '/certs/id.p12', CSC_KEY_PASSWORD: 'x' }, { CSC_NAME: 'Example Person (ABCDE12345)' }]) {
      const s = macSigning(env)
      expect(s.signed).toBe(true)
      expect(s.mac).toMatchObject({ hardenedRuntime: true, entitlements: 'build/entitlements.mac.plist', entitlementsInherit: 'build/entitlements.mac.plist', notarize: false })
      expect(s.mac).not.toHaveProperty('identity')
      expect(s.mac.artifactName).toBe('Tearsheet-${version}-${arch}.${ext}')
      expect(s.mac.target).toEqual([
        { target: 'dmg', arch: 'arm64' },
        { target: 'zip', arch: 'arm64' }
      ])
      expect(s.publish).toEqual([{ provider: 'github', owner: 'LBB2005', repo: 'Tearsheet', releaseType: 'draft' }])
      expect(s.why).toMatch(/not notarized/)
    }
  })

  test('notarization needs one full set of Apple credentials', () => {
    expect(notarizeWith(APPLE_ID)).toBe('apple-id')
    expect(notarizeWith({ APPLE_ID: 'a', APPLE_TEAM_ID: 'b' })).toBeNull()
    expect(notarizeWith({ APPLE_API_KEY: '/k.p8', APPLE_API_KEY_ID: 'K', APPLE_API_ISSUER: 'I' })).toBe('api-key')
    expect(notarizeWith({ APPLE_KEYCHAIN_PROFILE: 'tearsheet' })).toBe('keychain-profile')
    const s = macSigning({ CSC_NAME: 'X', ...APPLE_ID })
    expect(s.mac.notarize).toBe(true)
    expect(s.why).toBe('signed from CSC_NAME, notarized with apple-id')
  })
})

describe('electron-builder.cjs', () => {
  const SIGNING_VARS = ['CSC_LINK', 'CSC_NAME', 'TEARSHEET_TEST_BUILD']
  afterEach(() => vi.unstubAllEnvs())

  test('with no certificate it holds the settings the old electron-builder.yml had', () => {
    for (const name of SIGNING_VARS) vi.stubEnv(name, '')
    const path = join(APP, 'electron-builder.cjs')
    delete require.cache[path]
    const config = require(path)
    expect(config).toMatchObject({ appId: 'com.liamblackshawbrown.tearsheet', productName: 'Tearsheet', directories: { output: 'dist', buildResources: 'build' }, files: ['out/**/*', 'package.json'], afterPack: 'build/afterPack.cjs' })
    expect(config.electronFuses).toEqual({ runAsNode: false, enableNodeOptionsEnvironmentVariable: false, enableNodeCliInspectArguments: false })
    expect(config.mac).toEqual({ icon: 'build/icon.icns', category: 'public.app-category.finance', minimumSystemVersion: '15.0', ...UNSIGNED_MAC })
    expect(config).not.toHaveProperty('publish')
  })

  test('it asks for macOS 15, which the bundled Python libraries need, signed or not', () => {
    for (const env of [{ CSC_LINK: '', CSC_NAME: '' }, { CSC_LINK: '/certs/id.p12', CSC_NAME: '' }]) {
      vi.stubEnv('TEARSHEET_TEST_BUILD', '')
      for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
      const path = join(APP, 'electron-builder.cjs')
      delete require.cache[path]
      expect(require(path).mac.minimumSystemVersion).toBe('15.0')
    }
  })

  test('the entitlements are the three an Electron app with a bundled Python needs, and no more', () => {
    const plist = readFileSync(join(APP, 'build', 'entitlements.mac.plist'), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
    const keys = [...plist.matchAll(/<key>([^<]+)<\/key>/g)].map((m) => m[1])
    expect(keys).toEqual(['com.apple.security.cs.allow-jit', 'com.apple.security.cs.allow-unsigned-executable-memory', 'com.apple.security.cs.disable-library-validation'])
    expect(plist).not.toMatch(/app-sandbox|allow-dyld/)
  })
})
