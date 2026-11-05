// The tool table (design item 43; adapted from Realm, MIT). The only place that describes the
// AI tools the app can use.

export type ToolKind = 'claude' | 'codex'

export interface ToolSpec {
  kind: ToolKind
  name: string
  binary: string
  overrideEnv: string
  versionArgs: string[]
  statusArgs: string[]
  loginCommand: string
  install: string
}

export const TOOLS: ToolSpec[] = [
  {
    kind: 'claude',
    name: 'Claude Code',
    binary: 'claude',
    overrideEnv: 'TEARSHEET_CLAUDE_BIN',
    versionArgs: ['--version'],
    statusArgs: ['auth', 'status', '--json'],
    loginCommand: 'claude auth login',
    install: 'https://docs.anthropic.com/claude-code'
  },
  {
    kind: 'codex',
    name: 'Codex',
    binary: 'codex',
    overrideEnv: 'TEARSHEET_CODEX_BIN',
    versionArgs: ['--version'],
    statusArgs: ['login', 'status'],
    loginCommand: 'codex login',
    install: 'https://github.com/openai/codex'
  }
]

export interface ToolStatus {
  kind: ToolKind
  name: string
  path: string | null
  available: boolean
  version: string | null
  loggedIn: boolean | null
  reason: string | null
}
