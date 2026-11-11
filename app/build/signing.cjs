// Developer ID signing and notarization, off until the credentials are there (docs/launch/signing.md).
// electron-builder.cjs takes its mac signing settings and its `publish` block from macSigning().
//
// Without a certificate in the environment — today, and on every machine but a signed release's —
// the build is exactly the old one: signed ad hoc ("-"), no hardened runtime, no notarization, no
// publish block, target `dir`. A test build (`npm run package:test`) is never signed with a
// Developer ID, whatever the environment holds: test builds are never handed out.
//
// A certificate turns signing on:
//   CSC_LINK (a .p12 file path or base64) + CSC_KEY_PASSWORD, or
//   CSC_NAME, the name of a "Developer ID Application" identity already in the login keychain.
// Then the build uses the hardened runtime with build/entitlements.mac.plist, makes a DMG and a zip
// (electron-updater needs the zip), and writes latest-mac.yml for the GitHub release.
//
// Notarization runs on top when one full set of Apple credentials is there too (electron-builder's
// own @electron/notarize step reads them):
//   APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID, or
//   APPLE_API_KEY (path to the .p8) + APPLE_API_KEY_ID + APPLE_API_ISSUER, or
//   APPLE_KEYCHAIN_PROFILE (made with `xcrun notarytool store-credentials`, optional APPLE_KEYCHAIN).

const REPO = { owner: 'LBB2005', repo: 'Tearsheet' }

const SETS = {
  'apple-id': ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'],
  'api-key': ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'],
  'keychain-profile': ['APPLE_KEYCHAIN_PROFILE']
}

const has = (env, name) => typeof env[name] === 'string' && env[name].trim() !== ''

// Which full set of notarization credentials the environment has, or null.
function notarizeWith(env) {
  for (const [name, vars] of Object.entries(SETS)) if (vars.every((v) => has(env, v))) return name
  return null
}

// Where the certificate comes from, or null.
function certificate(env) {
  if (has(env, 'CSC_LINK')) return 'CSC_LINK'
  if (has(env, 'CSC_NAME')) return 'CSC_NAME'
  return null
}

// The mac settings and the publish block for this build.
function macSigning(env = process.env) {
  const cert = certificate(env)
  if (env.TEARSHEET_TEST_BUILD === '1' || !cert) {
    return {
      signed: false,
      notarize: null,
      why: env.TEARSHEET_TEST_BUILD === '1' ? 'a test build is never signed with a Developer ID' : 'no CSC_LINK or CSC_NAME',
      mac: {
        target: [{ target: 'dir', arch: 'arm64' }],
        // "-" signs ad hoc, which Apple silicon needs for the renamed app to run. The hardened
        // runtime waits for Developer ID signing: with ad-hoc signing it would refuse Electron's
        // own frameworks.
        identity: '-',
        hardenedRuntime: false,
        notarize: false
      },
      publish: null
    }
  }
  const notarize = notarizeWith(env)
  return {
    signed: true,
    notarize,
    why: `signed from ${cert}${notarize ? `, notarized with ${notarize}` : ', not notarized (no full set of APPLE_* variables)'}`,
    mac: {
      target: [
        { target: 'dmg', arch: 'arm64' },
        { target: 'zip', arch: 'arm64' }
      ],
      hardenedRuntime: true,
      gatekeeperAssess: false,
      entitlements: 'build/entitlements.mac.plist',
      entitlementsInherit: 'build/entitlements.mac.plist',
      notarize: notarize !== null
    },
    // electron-updater's feed: app-update.yml in the bundle, latest-mac.yml beside the DMG.
    // Nothing is uploaded unless the build is run with --publish always and a GH_TOKEN, and then
    // only to a draft release that Liam publishes by hand.
    publish: [{ provider: 'github', ...REPO, releaseType: 'draft' }]
  }
}

module.exports = { macSigning, notarizeWith, certificate, SETS }
