import { describe, expect, it } from 'vitest'

import { toolFlags, type ToolKind, type ToolState, type ToolStatus } from '../shared/tools'
import { INSTALL_COMMANDS, shellWord, stepRules, stepsFor, type StepRules } from './toolSteps'
import { TEST_VARIABLES } from './tools'

const HOME = '/Users/you'
const LOCAL = '/Users/you/.local/bin'
const REAL: StepRules = { noRealInstallers: false, home: HOME }

const tool = (kind: ToolKind, state: ToolState, path: string | null = state === 'missing' ? null : `${LOCAL}/${kind}`): ToolStatus => ({
  kind,
  name: kind === 'claude' ? 'Claude Code' : 'Codex',
  path,
  ...toolFlags(state),
  version: state === 'missing' ? null : '1.0.0',
  reason: null,
  state,
  plan: null,
  email: null
})

const CLAUDE_INSTALL = 'curl -fsSL https://claude.ai/install.sh | bash'
const CODEX_INSTALL = 'curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh'
const commands = (r: ReturnType<typeof stepsFor>) => r.steps.map((s) => [s.tool, s.kind, s.command])

describe('which state gets which steps', () => {
  it('the official commands', () => {
    expect(INSTALL_COMMANDS).toEqual({ claude: CLAUDE_INSTALL, codex: CODEX_INSTALL })
  })

  it.each(['claude', 'codex'] as const)('%s missing: the installer, then the sign-in in the official folder', (kind) => {
    const r = stepsFor([kind], [tool(kind, 'missing')], REAL)
    expect(commands(r)).toEqual([
      [kind, 'install', kind === 'claude' ? CLAUDE_INSTALL : CODEX_INSTALL],
      [kind, 'signIn', kind === 'claude' ? `${LOCAL}/claude auth login` : `${LOCAL}/codex login`]
    ])
    expect(r.blocked).toEqual([])
  })

  it('no status at all counts as missing', () => {
    expect(commands(stepsFor(['claude'], [], REAL))).toEqual([
      ['claude', 'install', CLAUDE_INSTALL],
      ['claude', 'signIn', `${LOCAL}/claude auth login`]
    ])
  })

  it.each(['claude', 'codex'] as const)('%s too old in the official folder: the installer again, then the sign-in', (kind) => {
    expect(stepsFor([kind], [tool(kind, 'too_old')], REAL).steps.map((s) => s.kind)).toEqual(['install', 'signIn'])
  })

  it.each([
    ['claude', 'Claude Code'],
    ['codex', 'Codex']
  ] as const)('%s too old anywhere else (Homebrew): nothing, blocked with why', (kind, name) => {
    const r = stepsFor([kind], [tool(kind, 'too_old', `/opt/homebrew/bin/${kind}`)], REAL)
    expect(r.steps).toEqual([])
    expect(r.blocked).toEqual([{ tool: kind, reason: `This ${name} was installed another way (/opt/homebrew/bin). Update it the way you installed it.` }])
  })

  it('a too-old copy elsewhere in the home folder is named from ~', () => {
    const r = stepsFor(['claude'], [tool('claude', 'too_old', '/Users/you/.npm-global/bin/claude')], REAL)
    expect(r.blocked[0].reason).toBe('This Claude Code was installed another way (~/.npm-global/bin). Update it the way you installed it.')
  })

  it.each([
    ['claude', 'signed_out'],
    ['claude', 'api_key'],
    ['claude', 'free_plan'],
    ['codex', 'signed_out'],
    ['codex', 'api_key'],
    ['codex', 'free_plan']
  ] as const)('%s %s: the sign-in only', (kind, state) => {
    expect(commands(stepsFor([kind], [tool(kind, state)], REAL))).toEqual([[kind, 'signIn', kind === 'claude' ? `${LOCAL}/claude auth login` : `${LOCAL}/codex login`]])
  })

  it.each([
    ['claude', 'ready'],
    ['claude', 'cant_tell'],
    ['codex', 'ready'],
    ['codex', 'cant_tell']
  ] as const)('%s %s: nothing', (kind, state) => {
    expect(stepsFor([kind], [tool(kind, state)], REAL)).toEqual({ steps: [], blocked: [] })
  })
})

describe('the order and the paths', () => {
  it('every install first, then every sign-in, Claude Code before Codex, whatever order is asked', () => {
    const r = stepsFor(['codex', 'claude'], [tool('codex', 'missing'), tool('claude', 'missing')], REAL)
    expect(r.steps.map((s) => `${s.tool} ${s.kind}`)).toEqual(['claude install', 'codex install', 'claude signIn', 'codex signIn'])
  })

  it('Codex is skipped when it reads ready', () => {
    const r = stepsFor(['claude', 'codex'], [tool('claude', 'missing'), tool('codex', 'ready')], REAL)
    expect(r.steps.map((s) => s.tool)).toEqual(['claude', 'claude'])
  })

  it('a tool asked for only once, and only the tools asked for', () => {
    const r = stepsFor(['codex', 'codex'], [tool('claude', 'missing'), tool('codex', 'signed_out')], REAL)
    expect(commands(r)).toEqual([['codex', 'signIn', `${LOCAL}/codex login`]])
  })

  it('a tool installed by Homebrew signs in at its own path', () => {
    const r = stepsFor(['codex'], [tool('codex', 'signed_out', '/opt/homebrew/bin/codex')], REAL)
    expect(commands(r)).toEqual([['codex', 'signIn', '/opt/homebrew/bin/codex login']])
  })

  it('a path with a space is quoted as one word', () => {
    const r = stepsFor(['claude'], [tool('claude', 'signed_out', '/Users/you/My Tools/claude')], REAL)
    expect(r.steps[0].command).toBe("'/Users/you/My Tools/claude' auth login")
    expect(shellWord("it's")).toBe(`'it'\\''s'`)
  })
})

describe('test mode', () => {
  const env = {
    TEARSHEET_TEST_TOOLS: '/tmp/tt',
    TEARSHEET_CLAUDE_BIN: '/tmp/tt/tools/claude',
    TEARSHEET_CODEX_BIN: '/tmp/tt/tools/codex',
    TEARSHEET_KEYCHAIN_SERVICE: 'Tearsheet-test'
  }
  const rules = stepRules(env, HOME)

  it('gives the stand-in installers, and a sign-in after an install names the test path, never ~/.local/bin', () => {
    const r = stepsFor(['claude', 'codex'], [tool('claude', 'missing', '/tmp/tt/tools/claude'), tool('codex', 'missing', '/tmp/tt/tools/codex')], rules)
    expect(commands(r)).toEqual([
      ['claude', 'install', '/tmp/tt/install-claude.sh'],
      ['codex', 'install', '/tmp/tt/install-codex.sh'],
      ['claude', 'signIn', '/tmp/tt/tools/claude auth login'],
      ['codex', 'signIn', '/tmp/tt/tools/codex login']
    ])
    expect(JSON.stringify(r)).not.toContain('.local/bin')
    expect(JSON.stringify(r)).not.toContain('curl')
  })

  it('a too-old stand-in at the test path is installed again by its stand-in installer', () => {
    const r = stepsFor(['claude'], [tool('claude', 'too_old', '/tmp/tt/tools/claude')], rules)
    expect(commands(r)).toEqual([
      ['claude', 'install', '/tmp/tt/install-claude.sh'],
      ['claude', 'signIn', '/tmp/tt/tools/claude auth login']
    ])
  })

  it('a signed-out stand-in signs in at its test path', () => {
    expect(commands(stepsFor(['codex'], [tool('codex', 'signed_out', '/tmp/tt/tools/codex')], rules))).toEqual([['codex', 'signIn', '/tmp/tt/tools/codex login']])
  })
})

describe('no real installers', () => {
  const missing = [tool('claude', 'missing'), tool('codex', 'missing')]

  it.each(TEST_VARIABLES)('%s alone never gives a real installer', (name) => {
    const r = stepsFor(['claude', 'codex'], missing, stepRules({ [name]: '/tmp/test' }, HOME))
    expect(JSON.stringify(r.steps)).not.toContain('curl')
  })

  it('a program path set gives that reason, for that tool', () => {
    const r = stepsFor(['claude', 'codex'], missing, stepRules({ TEARSHEET_CLAUDE_BIN: '/tmp/test/claude' }, HOME))
    expect(r.steps).toEqual([])
    expect(r.blocked).toEqual([
      { tool: 'claude', reason: "A program path is set for Claude Code (TEARSHEET_CLAUDE_BIN), so Tearsheet won't install another copy." },
      { tool: 'codex', reason: "Test settings are on, so Tearsheet won't run the real installer." }
    ])
    const codex = stepsFor(['codex'], missing, stepRules({ TEARSHEET_CODEX_BIN: '/tmp/test/codex' }, HOME))
    expect(codex.blocked).toEqual([{ tool: 'codex', reason: "A program path is set for Codex (TEARSHEET_CODEX_BIN), so Tearsheet won't install another copy." }])
  })

  it('a test Keychain name alone gives the test-settings reason', () => {
    const r = stepsFor(['claude'], missing, stepRules({ TEARSHEET_KEYCHAIN_SERVICE: 'Tearsheet-test' }, HOME))
    expect(r.blocked).toEqual([{ tool: 'claude', reason: "Test settings are on, so Tearsheet won't run the real installer." }])
  })

  it('the test folder alone gives only the stand-in installers', () => {
    const r = stepsFor(['claude'], missing, stepRules({ TEARSHEET_TEST_TOOLS: '/tmp/test' }, HOME))
    expect(r.steps.map((s) => s.command)).toEqual(['/tmp/test/install-claude.sh', `${LOCAL}/claude auth login`])
  })

  it('a sign-in still runs, since it installs nothing', () => {
    const r = stepsFor(['claude'], [tool('claude', 'signed_out', '/tmp/test/claude')], stepRules({ TEARSHEET_CLAUDE_BIN: '/tmp/test/claude' }, HOME))
    expect(commands(r)).toEqual([['claude', 'signIn', '/tmp/test/claude auth login']])
  })

  it('with nothing set, the real installers', () => {
    expect(stepRules({}, HOME)).toEqual({ noRealInstallers: false, testTools: undefined, programPaths: { claude: undefined, codex: undefined }, home: HOME })
  })
})
