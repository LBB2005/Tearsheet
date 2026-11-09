import { describe, expect, it } from 'vitest'

import { toolFlags, type ToolKind, type ToolState, type ToolStatus } from '../shared/tools'
import { commandFor, toolCommands } from './pasteCommand'
import { stepRules, type StepRules } from './toolSteps'
import { TEST_VARIABLES } from './tools'

const HOME = '/Users/you'
const LOCAL = '/Users/you/.local/bin'
const REAL: StepRules = { noRealInstallers: false, home: HOME }

const tool = (kind: ToolKind, state: ToolState, path: string | null = state === 'missing' ? null : `${LOCAL}/${kind}`): ToolStatus => ({
  kind,
  name: kind === 'claude' ? 'Claude Code' : 'Codex',
  path,
  ...toolFlags(state),
  version: null,
  reason: null,
  state,
  plan: null,
  email: null
})

describe('the paste command', () => {
  it('starts with set -o pipefail; and joins the steps with &&, keeping the sign-in after the install', () => {
    expect(commandFor(['claude'], [tool('claude', 'missing')], REAL)).toBe(`set -o pipefail; curl -fsSL https://claude.ai/install.sh | bash && ${LOCAL}/claude auth login`)
  })

  it('both tools: both installs, then both sign-ins', () => {
    expect(commandFor(['claude', 'codex'], [tool('claude', 'missing'), tool('codex', 'missing')], REAL)).toBe(
      'set -o pipefail; curl -fsSL https://claude.ai/install.sh | bash && curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh' +
        ` && ${LOCAL}/claude auth login && ${LOCAL}/codex login`
    )
  })

  it('skips a Codex that reads ready', () => {
    expect(commandFor(['claude', 'codex'], [tool('claude', 'signed_out'), tool('codex', 'ready')], REAL)).toBe(`set -o pipefail; ${LOCAL}/claude auth login`)
  })

  it('a Homebrew Codex signs in at its own path', () => {
    expect(commandFor(['codex'], [tool('codex', 'signed_out', '/opt/homebrew/bin/codex')], REAL)).toBe('set -o pipefail; /opt/homebrew/bin/codex login')
  })

  it('nothing to run gives no command', () => {
    expect(commandFor(['claude'], [tool('claude', 'ready')], REAL)).toBeNull()
    expect(commandFor(['claude'], [tool('claude', 'too_old', '/opt/homebrew/bin/claude')], REAL)).toBeNull()
  })

  it('test mode: the stand-in installer, then the sign-in at the test path', () => {
    const rules = stepRules({ TEARSHEET_TEST_TOOLS: '/tmp/tt', TEARSHEET_CLAUDE_BIN: '/tmp/tt/tools/claude' }, HOME)
    expect(commandFor(['claude'], [tool('claude', 'missing', '/tmp/tt/tools/claude')], rules)).toBe('set -o pipefail; /tmp/tt/install-claude.sh && /tmp/tt/tools/claude auth login')
  })

  it.each(TEST_VARIABLES)('%s alone never gives a real installer', (name) => {
    const command = commandFor(['claude', 'codex'], [tool('claude', 'missing'), tool('codex', 'missing')], stepRules({ [name]: '/tmp/test' }, HOME))
    expect(command ?? '').not.toContain('curl')
  })
})

describe('the commands for the connect card', () => {
  it('gives the steps, the refusals and the paste command from one list', () => {
    const r = toolCommands(['claude', 'codex'], [tool('claude', 'too_old', '/opt/homebrew/bin/claude'), tool('codex', 'signed_out')], REAL)
    expect(r).toEqual({
      steps: [{ tool: 'codex', kind: 'signIn', command: `${LOCAL}/codex login` }],
      blocked: [{ tool: 'claude', reason: 'This Claude Code was installed another way (/opt/homebrew/bin). Update it the way you installed it.' }],
      paste: `set -o pipefail; ${LOCAL}/codex login`
    })
  })
})
