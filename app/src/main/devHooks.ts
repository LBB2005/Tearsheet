// Development and test hooks, and who may use them (security audit, 9 Nov 2026).
//
// A development run (`npm run dev`) and a test build honour the variables below: another data or
// downloads folder, a hidden window, stand-in AI programs, a test Keychain name, another off-switch
// address, another checkout's engine, and the dev server's page. A release build — what
// `npm run package` and scripts/release.sh make, and what everyone else runs — ignores them all:
// they are removed from the environment before anything reads it, so neither the window nor the
// engine (which gets this environment) ever sees them. Nor does a release build start with
// Chromium's remote-debugging switches.
//
// A test build is only made by `npm run package:test` (docs/test-builds.md), which bakes
// TEST_BUILD in at build time and puts test-build.txt in the bundle's Resources, so the test
// scripts can refuse to start a release build. Nothing a normal user's copy has turns it on: not a
// variable, a switch or a file.

declare const __TEARSHEET_TEST_BUILD__: boolean | undefined

// Set by electron.vite.config.ts from TEARSHEET_TEST_BUILD=1 at build time. Off in the tests.
export const TEST_BUILD: boolean = typeof __TEARSHEET_TEST_BUILD__ === 'boolean' && __TEARSHEET_TEST_BUILD__

// The marker file a test build carries in Contents/Resources (build/afterPack.cjs).
export const TEST_BUILD_MARKER = 'test-build.txt'

export const DEV_VARIABLES = [
  'ELECTRON_RENDERER_URL',
  'TEARSHEET_DATA_DIR',
  'TEARSHEET_DOWNLOADS_DIR',
  'TEARSHEET_HIDDEN_WINDOW',
  'TEARSHEET_CLAUDE_BIN',
  'TEARSHEET_CODEX_BIN',
  'TEARSHEET_TEST_TOOLS',
  'TEARSHEET_KEYCHAIN_SERVICE',
  'TEARSHEET_SWITCH_URL',
  'TEARSHEET_REPO'
] as const

// Chromium's switches that let another program drive the window. Node's --inspect switches are
// turned off in a release build by its fuses (electron-builder.yml).
export const DEBUG_SWITCHES = ['remote-debugging-port', 'remote-debugging-pipe', 'remote-allow-origins'] as const

export function hooksAllowed(packaged: boolean, testBuild: boolean = TEST_BUILD): boolean {
  return !packaged || testBuild
}

// Removes the hooks from `env` in place when they aren't allowed. Returns the names it removed.
export function dropDevHooks(env: NodeJS.ProcessEnv, allowed: boolean): string[] {
  if (allowed) return []
  const removed = DEV_VARIABLES.filter((name) => name in env)
  for (const name of removed) delete env[name]
  return removed
}

// The debugging switches on this launch's command line, which a release build refuses to start
// with.
export function debugSwitches(hasSwitch: (name: string) => boolean): string[] {
  return DEBUG_SWITCHES.filter((name) => hasSwitch(name))
}
