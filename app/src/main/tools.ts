// The tool table (design item 43; adapted from Realm, MIT). The only place that describes the
// AI tools the app can use, and the two test rules read from the environment (first-run design
// §6, item 10).

import type { ToolKind } from '../shared/tools'

export type { ToolKind, ToolStatus } from '../shared/tools'

export interface ToolSpec {
  kind: ToolKind
  name: string
  binary: string
  // A program path set here is final: it wins over the PATH, and nothing installs another copy.
  overrideEnv: 'TEARSHEET_CLAUDE_BIN' | 'TEARSHEET_CODEX_BIN'
  versionArgs: string[]
  statusArgs: string[]
  // The one stream its status is read from; the other is ignored. Claude Code writes its JSON to
  // standard output; Codex writes every message to standard error (login.rs uses eprintln!).
  statusStream: 'stdout' | 'stderr'
}

export const TOOLS: ToolSpec[] = [
  {
    kind: 'claude',
    name: 'Claude Code',
    binary: 'claude',
    overrideEnv: 'TEARSHEET_CLAUDE_BIN',
    versionArgs: ['--version'],
    statusArgs: ['auth', 'status', '--json'],
    statusStream: 'stdout'
  },
  {
    kind: 'codex',
    name: 'Codex',
    binary: 'codex',
    overrideEnv: 'TEARSHEET_CODEX_BIN',
    versionArgs: ['--version'],
    statusArgs: ['login', 'status'],
    statusStream: 'stderr'
  }
]

// The four test variables: a test Keychain name, the two program paths, and the test folder.
export const TEST_VARIABLES = ['TEARSHEET_KEYCHAIN_SERVICE', 'TEARSHEET_CLAUDE_BIN', 'TEARSHEET_CODEX_BIN', 'TEARSHEET_TEST_TOOLS'] as const

const isSet = (value: string | undefined): boolean => Boolean(value && value.trim())

// No real installer runs when any test switch or program path is set. Broad on purpose: a set
// program path is final, so a second copy installed elsewhere would never be used.
export function noRealInstallers(env: NodeJS.ProcessEnv): boolean {
  return TEST_VARIABLES.some((name) => isSet(env[name]))
}

// Test mode: only TEARSHEET_TEST_TOOLS, which the test script always sets and nothing else does.
// A program path alone doesn't turn it on.
export function testMode(env: NodeJS.ProcessEnv): boolean {
  return isSet(env.TEARSHEET_TEST_TOOLS)
}
