// installer.ts with a fake spawn, a fake kill and a fake tool watcher: no installer, curl or
// sign-in ever runs. The commands below are only compared as text. The last block runs real
// /bin/bash, but only with harmless commands (printf, sleep) given by a fake stepsFor.

import { spawn as nodeSpawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { FAILURES, STATE_SENTENCES, type InstallProgress } from '../shared/install'
import { toolFlags, type BlockedStep, type ToolKind, type ToolState, type ToolStatus, type ToolStep } from '../shared/tools'
import {
  INSTALL_LIMIT_MS,
  Installer,
  signInLink,
  SLOW_MS,
  STUCK_MS,
  type InstallerDeps,
  type SpawnStep,
  type StepChild,
  type ToolReader
} from './installer'
import type { SetupEvent, SetupFields } from './setupLog'
import { stepsFor as realStepsFor, type StepRules } from './toolSteps'

const HOME = '/Users/you'
const OFFICIAL: Record<ToolKind, string> = { claude: '/Users/you/.local/bin/claude', codex: '/Users/you/.local/bin/codex' }
const NAMES: Record<ToolKind, string> = { claude: 'Claude Code', codex: 'Codex' }
const TEST_DIR = '/tmp/tearsheet-test'
const TEST_PATHS: Record<ToolKind, string> = { claude: `${TEST_DIR}/tools/claude`, codex: `${TEST_DIR}/tools/codex` }
const TEST_RULES: StepRules = { noRealInstallers: true, testTools: TEST_DIR, programPaths: TEST_PATHS, home: HOME }

const CLAUDE_INSTALL = 'curl -fsSL https://claude.ai/install.sh | bash'
const CODEX_INSTALL = 'curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh'

// Claude Code's sign-in link, wrapped in terminal link codes as it prints it.
const CLAUDE_LINK = 'https://claude.com/cai/oauth/authorize?code=true&client_id=abc&state=xyz'
const CODEX_LINK = 'https://auth.openai.com/oauth/authorize?response_type=code&client_id=app_x&state=s1'
const linked = (url: string, text = url) => `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`

const status = (kind: ToolKind, state: ToolState, path: string | null = state === 'missing' ? null : OFFICIAL[kind]): ToolStatus => ({
  kind,
  name: NAMES[kind],
  path,
  ...toolFlags(state),
  version: state === 'missing' ? null : '2.1.317',
  reason: null,
  state,
  plan: state === 'ready' ? 'max' : null,
  email: null
})

class FakeStream extends EventEmitter {
  setEncoding(): this {
    return this
  }
}

class FakeChild extends EventEmitter {
  readonly stdout = new FakeStream()
  readonly stderr = new FakeStream()
  constructor(
    readonly command: string,
    readonly pid: number | undefined
  ) {
    super()
  }
  out(text: string): void {
    this.stdout.emit('data', text)
  }
  err(text: string): void {
    this.stderr.emit('data', text)
  }
  end(code: number | null, signal: NodeJS.Signals | null = null): void {
    this.stdout.emit('end')
    this.stderr.emit('end')
    this.emit('exit', code, signal)
    this.emit('close', code, signal)
  }
}

const kindOf = (command: string): ToolKind => (command.includes('codex') ? 'codex' : 'claude')
const isSignIn = (command: string) => command.endsWith(' login')

interface Harness {
  installer: Installer
  tools: Record<ToolKind, ToolStatus>
  sent: InstallProgress[]
  entries: [SetupEvent, SetupFields][]
  children: FakeChild[]
  // spawn and read calls, in order
  order: string[]
  spawn: ReturnType<typeof vi.fn<SpawnStep>>
  kill: ReturnType<typeof vi.fn<(pid: number, signal: NodeJS.Signals) => void>>
  read: ReturnType<typeof vi.fn<(force?: boolean) => Promise<ToolStatus[]>>>
  readAfter: ReturnType<typeof vi.fn<() => Promise<ToolStatus[]>>>
  openExternal: ReturnType<typeof vi.fn<(url: string) => Promise<void>>>
  // Where an install writes each tool (the official folder, or the test path).
  writes: Record<ToolKind, string>
  // Whether a stopped step ends at SIGTERM (else only at SIGKILL).
  endsOnTerm: boolean
}

type Behaviour = (child: FakeChild, h: Harness) => void

// What the real tools do, quickly: an install prints a line, writes the tool (signed out) and
// exits 0; a sign-in prints its link and exits 0, signed in. Codex's sign-in signs out first.
const works: Behaviour = (child, h) => {
  const kind = kindOf(child.command)
  if (isSignIn(child.command)) {
    if (kind === 'codex') h.tools.codex = status('codex', 'signed_out', h.tools.codex.path)
    if (kind === 'claude') child.out(`Opening browser to sign in…\nIf the browser didn't open, visit: ${linked(CLAUDE_LINK)}\nPaste code here if prompted > `)
    else child.err(`Starting local login server on http://localhost:1455.\nIf your browser did not open, navigate to this URL to authenticate:\n\n${CODEX_LINK}\n\n`)
    h.tools[kind] = status(kind, 'ready', h.tools[kind].path)
    child.out(kind === 'claude' ? 'Login successful.\n' : '')
    child.err(kind === 'codex' ? 'Successfully logged in\n' : '')
    child.end(0)
  } else {
    child.out(`Setting up ${NAMES[kind]}...\n`)
    h.tools[kind] = status(kind, 'signed_out', h.writes[kind])
    child.out(`\n✔ ${NAMES[kind]} successfully installed!\n`)
    child.end(0)
  }
}

// Nothing happens until the test drives the child itself.
const waits: Behaviour = () => undefined

function harness(
  start: Partial<Record<ToolKind, ToolStatus>>,
  options: { rules?: StepRules; behave?: Behaviour; deps?: Partial<InstallerDeps> } = {}
): Harness {
  const behave = options.behave ?? works
  const rules = options.rules ?? { noRealInstallers: false, home: HOME }
  const h = {
    tools: { claude: start.claude ?? status('claude', 'missing'), codex: start.codex ?? status('codex', 'ready') },
    sent: [],
    entries: [],
    children: [],
    order: [],
    writes: rules.testTools ? { ...TEST_PATHS } : { ...OFFICIAL },
    endsOnTerm: true
  } as unknown as Harness
  const snapshot = () => [h.tools.claude, h.tools.codex]
  h.read = vi.fn(async (force?: boolean) => {
    h.order.push(force ? 'read(force)' : 'read')
    return snapshot()
  })
  h.readAfter = vi.fn(async () => {
    h.order.push('readAfter')
    return snapshot()
  })
  h.spawn = vi.fn<SpawnStep>((_command, args) => {
    const child = new FakeChild(args[3], 4100 + h.children.length)
    h.children.push(child)
    h.order.push(`spawn ${args[3]}`)
    queueMicrotask(() => behave(child, h))
    return child as StepChild
  })
  h.kill = vi.fn((pid: number, signal: NodeJS.Signals) => {
    const child = h.children.find((c) => c.pid === -pid)
    if (child && (signal === 'SIGKILL' || h.endsOnTerm)) child.end(null, signal)
  })
  h.openExternal = vi.fn(async () => undefined)
  const watch: ToolReader = { read: h.read, readAfter: h.readAfter }
  h.installer = new Installer({
    watch,
    rules,
    pathValue: '/usr/bin:/bin:/Users/you/.local/bin',
    claudeConfigDir: '/Users/you/.claude-work',
    codexHome: '/Users/you/.codex-work',
    env: { HOME, LANG: 'en_GB.UTF-8' },
    send: (progress) => void h.sent.push(progress),
    openExternal: h.openExternal,
    switchOn: () => true,
    testMode: Boolean(rules.testTools),
    spawn: h.spawn,
    kill: h.kill,
    log: { log: (event, fields = {}) => void h.entries.push([event, fields]) },
    ...options.deps
  })
  return h
}

// Lets the run reach its next step (the fakes answer on microtasks).
async function settle(): Promise<void> {
  for (let i = 0; i < 50; i++) await Promise.resolve()
}

const statuses = (h: Harness) => h.sent.map((p) => `${p.tool} ${p.step} ${p.status}`)
const commands = (h: Harness) => h.children.map((c) => c.command)
const logged = (h: Harness, event: SetupEvent) => h.entries.filter(([e]) => e === event).map(([, f]) => f)

afterEach(() => {
  vi.useRealTimers()
})

describe('the order of steps, re-planned after each', () => {
  it('both tools missing: both installs, then both sign-ins, each followed by a fresh read', async () => {
    const h = harness({ claude: status('claude', 'missing'), codex: status('codex', 'missing') })
    expect(await h.installer.run(['claude', 'codex'])).toEqual({ outcome: 'done' })
    expect(h.order).toEqual([
      'read',
      `spawn ${CLAUDE_INSTALL}`,
      'readAfter',
      `spawn ${CODEX_INSTALL}`,
      'readAfter',
      'spawn /Users/you/.local/bin/claude auth login',
      'readAfter',
      'spawn /Users/you/.local/bin/codex login',
      'readAfter'
    ])
    expect(h.sent).toEqual([
      { tool: 'claude', step: 'install', status: 'downloading' },
      { tool: 'claude', step: 'install', status: 'installing' },
      { tool: 'claude', step: 'install', status: 'installed' },
      { tool: 'codex', step: 'install', status: 'downloading' },
      { tool: 'codex', step: 'install', status: 'installing' },
      { tool: 'codex', step: 'install', status: 'installed' },
      { tool: 'claude', step: 'signIn', status: 'opening_browser' },
      { tool: 'claude', step: 'signIn', status: 'done' },
      { tool: 'codex', step: 'signIn', status: 'opening_browser' },
      { tool: 'codex', step: 'signIn', status: 'done' }
    ])
  })

  it('stepsFor is asked again after each step, with the fresh status', async () => {
    const stepsFor = vi.fn(realStepsFor)
    const h = harness({ claude: status('claude', 'missing') }, { deps: { stepsFor } })
    await h.installer.run(['claude'])
    expect(stepsFor).toHaveBeenCalledTimes(3)
    expect(stepsFor.mock.calls.map(([, tools]) => tools.find((t) => t.kind === 'claude')?.state)).toEqual(['missing', 'signed_out', 'ready'])
  })

  it('one tool missing: its install, then its sign-in at the path the installer wrote', async () => {
    const h = harness({ claude: status('claude', 'missing') })
    expect(await h.installer.run(['claude'])).toEqual({ outcome: 'done' })
    expect(commands(h)).toEqual([CLAUDE_INSTALL, '/Users/you/.local/bin/claude auth login'])
  })

  it('an update that leaves the tool signed in drops the sign-in', async () => {
    const h = harness(
      { claude: status('claude', 'too_old') },
      {
        behave: (child, hh) => {
          hh.tools.claude = status('claude', 'ready')
          child.out('Setting up Claude Code...\n')
          child.end(0)
        }
      }
    )
    expect(await h.installer.run(['claude'])).toEqual({ outcome: 'done' })
    expect(commands(h)).toEqual([CLAUDE_INSTALL])
    expect(statuses(h)).toEqual(['claude install downloading', 'claude install installing', 'claude install installed'])
  })

  it('signed out: only the sign-in, at the path the status gives (a Homebrew Codex signs in where it is)', async () => {
    const h = harness({ claude: status('claude', 'ready'), codex: status('codex', 'signed_out', '/opt/homebrew/bin/codex') })
    expect(await h.installer.run(['codex'])).toEqual({ outcome: 'done' })
    expect(commands(h)).toEqual(['/opt/homebrew/bin/codex login'])
  })

  it('Codex is skipped when it reads ready', async () => {
    const h = harness({ claude: status('claude', 'signed_out'), codex: status('codex', 'ready') })
    expect(await h.installer.run(['claude', 'codex'])).toEqual({ outcome: 'done' })
    expect(commands(h)).toEqual(['/Users/you/.local/bin/claude auth login'])
    expect(h.sent.every((p) => p.tool === 'claude')).toBe(true)
  })

  it('only the tools asked for are set up', async () => {
    const h = harness({ claude: status('claude', 'missing'), codex: status('codex', 'missing') })
    await h.installer.run(['codex'])
    expect(commands(h)).toEqual([CODEX_INSTALL, '/Users/you/.local/bin/codex login'])
  })

  it('nothing to do: nothing runs and nothing is sent', async () => {
    const h = harness({ claude: status('claude', 'ready'), codex: status('codex', 'cant_tell') })
    expect(await h.installer.run(['claude', 'codex'])).toEqual({ outcome: 'done' })
    expect(h.children).toEqual([])
    expect(h.sent).toEqual([])
  })

  it('both tools signed out: Claude Code’s sign-in, then Codex’s', async () => {
    const h = harness({ claude: status('claude', 'signed_out'), codex: status('codex', 'api_key') })
    expect(await h.installer.run(['claude', 'codex'])).toEqual({ outcome: 'done' })
    expect(commands(h)).toEqual(['/Users/you/.local/bin/claude auth login', '/Users/you/.local/bin/codex login'])
  })
})

describe('how a step runs', () => {
  it('bash with pipefail, the login shell’s PATH, CLAUDE_CONFIG_DIR and CODEX_HOME, input closed, in its own process group', async () => {
    const h = harness({ claude: status('claude', 'missing') })
    await h.installer.run(['claude'])
    expect(h.spawn).toHaveBeenNthCalledWith(1, '/bin/bash', ['-o', 'pipefail', '-c', CLAUDE_INSTALL], {
      env: { HOME, LANG: 'en_GB.UTF-8', PATH: '/usr/bin:/bin:/Users/you/.local/bin', CLAUDE_CONFIG_DIR: '/Users/you/.claude-work', CODEX_HOME: '/Users/you/.codex-work' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true
    })
  })

  it('no CLAUDE_CONFIG_DIR or CODEX_HOME from the login shell: none is added', async () => {
    const h = harness({ claude: status('claude', 'signed_out') }, { deps: { claudeConfigDir: undefined, codexHome: undefined } })
    await h.installer.run(['claude'])
    expect(h.spawn.mock.calls[0][2].env).toEqual({ HOME, LANG: 'en_GB.UTF-8', PATH: '/usr/bin:/bin:/Users/you/.local/bin' })
  })

  it('installing is sent at the first line that says something, once', async () => {
    const h = harness({ claude: status('claude', 'missing') }, { behave: waits })
    void h.installer.run(['claude'])
    await settle()
    const child = h.children[0]
    expect(statuses(h)).toEqual(['claude install downloading'])
    child.out('\n   \n')
    expect(statuses(h)).toEqual(['claude install downloading'])
    child.out('Setting up Claude Code...\nmore\n')
    child.out('and more\n')
    expect(statuses(h)).toEqual(['claude install downloading', 'claude install installing'])
  })

  it('messages on standard error count: an installer that only writes there', async () => {
    const h = harness({ claude: status('claude', 'missing') }, { behave: waits })
    void h.installer.run(['claude'])
    await settle()
    h.children[0].err('  % Total    % Received\n')
    expect(statuses(h)).toEqual(['claude install downloading', 'claude install installing'])
  })

  it('lines split across chunks, \\r\\n and lone \\r line ends, and a last line with no line end', async () => {
    const h = harness({ claude: status('claude', 'missing') }, { behave: waits })
    const run = h.installer.run(['claude'])
    await settle()
    const child = h.children[0]
    child.out('Sett')
    expect(statuses(h)).toEqual(['claude install downloading'])
    child.out('ing up\r\n50%\r100%\r')
    child.out('✔ Claude Code successfully ')
    // An update that left it signed in, so the run ends here.
    h.tools.claude = status('claude', 'ready')
    child.out('installed!')
    child.end(0)
    await run
    expect(statuses(h).slice(0, 3)).toEqual(['claude install downloading', 'claude install installing', 'claude install installed'])
    // The success line, read whole only at the end, is noted in the log.
    expect(logged(h, 'install_step')[0]).toMatchObject({ status: 'installed', value: 'success_line' })
  })

  it('a very long line with no line end is read as it stands', async () => {
    const h = harness({ claude: status('claude', 'missing') }, { behave: waits })
    void h.installer.run(['claude'])
    await settle()
    h.children[0].out('#'.repeat(70 * 1024))
    expect(statuses(h)).toEqual(['claude install downloading', 'claude install installing'])
  })

  it('a step whose streams a helper keeps open has ended once it exits, after a moment', async () => {
    vi.useFakeTimers()
    const h = harness({ claude: status('claude', 'signed_out') }, { behave: waits, deps: { timings: { exitGraceMs: 200 } } })
    const run = h.installer.run(['claude'])
    await settle()
    h.tools.claude = status('claude', 'ready')
    h.children[0].emit('exit', 0, null)
    await vi.advanceTimersByTimeAsync(199)
    expect(statuses(h)).toEqual(['claude signIn opening_browser'])
    await vi.advanceTimersByTimeAsync(1)
    expect(await run).toEqual({ outcome: 'done' })
  })

  it('output after a step has ended is ignored', async () => {
    vi.useFakeTimers()
    const h = harness({ claude: status('claude', 'missing') }, { behave: waits, deps: { timings: { exitGraceMs: 100 } } })
    const run = h.installer.run(['claude'])
    await settle()
    h.tools.claude = status('claude', 'ready')
    h.children[0].emit('exit', 0, null)
    await vi.advanceTimersByTimeAsync(100)
    h.children[0].out('a late line\n')
    expect(await run).toEqual({ outcome: 'done' })
    expect(statuses(h)).toEqual(['claude install downloading', 'claude install installed'])
  })

  it('without a home folder in the rules, the person’s own is used', async () => {
    const own = join(homedir(), '.local', 'bin', 'claude')
    const h = harness({ claude: status('claude', 'missing') }, { rules: { noRealInstallers: false } })
    h.writes.claude = own
    expect(await h.installer.run(['claude'])).toEqual({ outcome: 'done' })
    expect(commands(h)).toEqual([CLAUDE_INSTALL, `${own} auth login`])
  })

  it('each step logs one install_step entry, with no output and no link', async () => {
    let t = 1000
    const h = harness({ claude: status('claude', 'missing') }, { deps: { now: () => (t += 250) } })
    await h.installer.run(['claude'])
    expect(logged(h, 'install_step')).toEqual([
      { tool: 'claude', step: 'install', status: 'installed', exit: 0, signal: null, ms: 250, value: 'success_line', state: 'signed_out' },
      { tool: 'claude', step: 'signIn', status: 'done', exit: 0, signal: null, ms: 250, value: 'success_line', state: 'ready' }
    ])
  })

  it('a failed download: “The download failed.”, and nothing after it runs', async () => {
    const h = harness(
      { claude: status('claude', 'missing') },
      {
        behave: (child) => {
          child.err('curl: (22) The requested URL returned error: 503\n')
          child.end(22)
        }
      }
    )
    expect(await h.installer.run(['claude'])).toEqual({ outcome: 'failed' })
    expect(h.sent.at(-1)).toEqual({ tool: 'claude', step: 'install', status: 'failed', reason: 'The download failed.' })
    expect(commands(h)).toEqual([CLAUDE_INSTALL])
    expect(h.readAfter).not.toHaveBeenCalled()
    expect(logged(h, 'install_step')).toEqual([{ tool: 'claude', step: 'install', status: 'failed', exit: 22, signal: null, ms: expect.any(Number), value: undefined, reason_code: 'exit_nonzero' }])
  })

  it('a sign-in that exits with an error: “The sign-in didn’t finish.”', async () => {
    const h = harness({ claude: status('claude', 'signed_out') }, { behave: (child) => child.end(1) })
    expect(await h.installer.run(['claude'])).toEqual({ outcome: 'failed' })
    expect(h.sent.at(-1)).toEqual({ tool: 'claude', step: 'signIn', status: 'failed', reason: "The sign-in didn’t finish." })
  })

  it('an install still running after its limit is stopped, with its sentence', async () => {
    vi.useFakeTimers()
    const h = harness({ claude: status('claude', 'missing') }, { behave: waits, deps: { timings: { installLimitMs: 1000 } } })
    const run = h.installer.run(['claude'])
    await settle()
    await vi.advanceTimersByTimeAsync(999)
    expect(h.kill).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(h.kill).toHaveBeenCalledWith(-4100, 'SIGTERM')
    expect(await run).toEqual({ outcome: 'failed' })
    expect(h.sent.at(-1)).toEqual({ tool: 'claude', step: 'install', status: 'failed', reason: 'The install took more than 10 minutes, so it was stopped.' })
    expect(logged(h, 'install_step')[0]).toMatchObject({ status: 'failed', signal: 'SIGTERM', reason_code: 'install_timeout' })
  })

  it('an install that ignores the stop is killed after the grace time', async () => {
    vi.useFakeTimers()
    const h = harness({ claude: status('claude', 'missing') }, { behave: waits, deps: { timings: { installLimitMs: 1000, killGraceMs: 500 } } })
    h.endsOnTerm = false
    const run = h.installer.run(['claude'])
    await settle()
    await vi.advanceTimersByTimeAsync(1000)
    expect(h.kill.mock.calls).toEqual([[-4100, 'SIGTERM']])
    await vi.advanceTimersByTimeAsync(500)
    expect(h.kill.mock.calls).toEqual([
      [-4100, 'SIGTERM'],
      [-4100, 'SIGKILL']
    ])
    expect(await run).toEqual({ outcome: 'failed' })
  })

  it('the limits are 15 seconds, 2 minutes and 10 minutes unless others are passed in', async () => {
    expect([SLOW_MS, STUCK_MS, INSTALL_LIMIT_MS]).toEqual([15_000, 120_000, 600_000])
    vi.useFakeTimers()
    const h = harness({ claude: status('claude', 'missing') }, { behave: waits })
    void h.installer.run(['claude'])
    await settle()
    await vi.advanceTimersByTimeAsync(600_000 - 1)
    expect(h.kill).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(h.kill).toHaveBeenCalledWith(-4100, 'SIGTERM')
  })

  it.each([
    ['claude', 'free_plan', 'Claude Code needs a paid Claude plan, like Pro or Max.'],
    ['claude', 'api_key', 'This sign-in uses an API key. Tearsheet runs on your Claude plan.'],
    ['codex', 'api_key', "This Codex sign-in doesn’t use your ChatGPT plan. Signing in with ChatGPT replaces it for all your Codex use, not only Tearsheet’s."]
  ] as const)('a %s sign-in that exits 0 but reads %s fails with that state’s sentence', async (kind, state, sentence) => {
    const h = harness(
      { [kind]: status(kind, 'signed_out') },
      {
        behave: (child, hh) => {
          hh.tools[kind] = status(kind, state)
          child.end(0)
        }
      }
    )
    expect(await h.installer.run([kind])).toEqual({ outcome: 'failed' })
    expect(h.sent.at(-1)).toEqual({ tool: kind, step: 'signIn', status: 'failed', reason: sentence })
    expect(STATE_SENTENCES[kind][state]).toBe(sentence)
    expect(logged(h, 'install_step')[0]).toMatchObject({ status: 'failed', reason_code: state, state })
  })

  it.each(['signed_out', 'cant_tell', 'missing'] as const)('exit 0 that then reads %s is not done', async (state) => {
    const h = harness(
      { claude: status('claude', 'signed_out') },
      {
        behave: (child, hh) => {
          hh.tools.claude = status('claude', state)
          child.out('Login successful.\n')
          child.end(0)
        }
      }
    )
    expect(await h.installer.run(['claude'])).toEqual({ outcome: 'failed' })
    expect(statuses(h)).not.toContain('claude signIn done')
    expect(h.sent.at(-1)).toEqual({ tool: 'claude', step: 'signIn', status: 'failed', reason: "The sign-in didn’t finish." })
    expect(logged(h, 'install_step')[0]).toMatchObject({ reason_code: 'not_ready_after', state, value: 'success_line' })
  })

  it('the same step coming up again stops the run', async () => {
    // A too-old copy in the official folder that the installer leaves too old.
    const h = harness({ claude: status('claude', 'too_old') }, { behave: (child) => child.end(0) })
    expect(await h.installer.run(['claude'])).toEqual({ outcome: 'failed' })
    expect(commands(h)).toEqual([CLAUDE_INSTALL])
    expect(statuses(h)).toEqual(['claude install downloading', 'claude install installed', 'claude install failed'])
    expect(h.sent.at(-1)?.reason).toBe('Tearsheet stopped, because the same step came up again.')
    expect(logged(h, 'install_step').at(-1)).toEqual({ tool: 'claude', step: 'install', status: 'failed', reason_code: 'same_step' })
  })

  it.each([
    ['/opt/homebrew/bin/claude', 'Another copy at /opt/homebrew/bin is found first.'],
    ['/Users/you/.npm-global/bin/claude', 'Another copy at ~/.npm-global/bin is found first.']
  ])('another copy found first (%s): said, logged, and the installer isn’t run again', async (found, sentence) => {
    const h = harness({ claude: status('claude', 'missing') })
    h.writes.claude = found
    expect(await h.installer.run(['claude'])).toEqual({ outcome: 'failed' })
    expect(h.sent.at(-1)).toEqual({ tool: 'claude', step: 'install', status: 'failed', reason: sentence })
    expect(commands(h)).toEqual([CLAUDE_INSTALL])
    expect(logged(h, 'another_copy_found')).toEqual([{ tool: 'claude', path: found }])
    expect(logged(h, 'install_step')[0]).toMatchObject({ reason_code: 'another_copy' })
  })

  it('the same folder written another way is still the official one', async () => {
    const h = harness({ claude: status('claude', 'missing') })
    h.writes.claude = '/Users/you/.local/bin//claude'
    expect(await h.installer.run(['claude'])).toEqual({ outcome: 'done' })
  })

  it('a fresh read that leaves the tool out entirely: neither installed nor done', async () => {
    const install = harness({ claude: status('claude', 'missing') }, { behave: (child) => child.end(0) })
    install.readAfter.mockResolvedValue([status('codex', 'ready')])
    expect(await install.installer.run(['claude'])).toEqual({ outcome: 'failed' })
    expect(install.sent.at(-1)?.reason).toBe("The install finished, but Claude Code wasn’t found.")
    const signIn = harness({ claude: status('claude', 'signed_out') }, { behave: (child) => child.end(0) })
    signIn.readAfter.mockResolvedValue([])
    expect(await signIn.installer.run(['claude'])).toEqual({ outcome: 'failed' })
    expect(logged(signIn, 'install_step')[0]).toMatchObject({ reason_code: 'not_ready_after', state: 'missing' })
  })

  it('an install that exits 0 but leaves the tool missing', async () => {
    const h = harness({ claude: status('claude', 'missing') }, { behave: (child) => child.end(0) })
    expect(await h.installer.run(['claude'])).toEqual({ outcome: 'failed' })
    expect(h.sent.at(-1)).toEqual({ tool: 'claude', step: 'install', status: 'failed', reason: "The install finished, but Claude Code wasn’t found." })
    expect(FAILURES.notFound('Codex')).toBe("The install finished, but Codex wasn’t found.")
  })

  it('a step that can’t be started', async () => {
    const throwing = harness({ claude: status('claude', 'missing') }, { deps: { spawn: () => { throw new Error('EAGAIN') } } })
    expect(await throwing.installer.run(['claude'])).toEqual({ outcome: 'failed' })
    expect(throwing.sent.at(-1)).toEqual({ tool: 'claude', step: 'install', status: 'failed', reason: "Tearsheet couldn’t start the installer." })
    // An 'error' with no process: never started.
    const erroring = harness(
      { claude: status('claude', 'signed_out') },
      {
        deps: {
          spawn: () => {
            const child = new FakeChild('x', undefined)
            // As Node does when a program can't be started: an error, then the close.
            queueMicrotask(() => {
              child.emit('error', new Error('ENOENT'))
              child.end(-2)
            })
            return child as StepChild
          }
        }
      }
    )
    expect(await erroring.installer.run(['claude'])).toEqual({ outcome: 'failed' })
    expect(erroring.sent.at(-1)).toEqual({ tool: 'claude', step: 'signIn', status: 'failed', reason: "Tearsheet couldn’t start the sign-in." })
    expect(logged(erroring, 'install_step')[0]).toMatchObject({ reason_code: 'spawn_failed' })
  })

  it('an error after the step started counts as a failed step', async () => {
    const h = harness({ claude: status('claude', 'signed_out') }, { behave: (child) => child.emit('error', new Error('EPIPE')) })
    expect(await h.installer.run(['claude'])).toEqual({ outcome: 'failed' })
    expect(h.sent.at(-1)?.reason).toBe("The sign-in didn’t finish.")
  })

  it('a status read that fails, before the first step or after one', async () => {
    const before = harness({ claude: status('claude', 'missing') })
    before.read.mockRejectedValue(new Error('probe'))
    expect(await before.installer.run(['codex', 'claude'])).toEqual({ outcome: 'failed' })
    expect(before.sent).toEqual([{ tool: 'codex', step: 'install', status: 'failed', reason: "Tearsheet couldn’t read the AI tools’ status." }])
    expect(before.children).toEqual([])
    const empty = harness({})
    empty.read.mockRejectedValue(new Error('probe'))
    await empty.installer.run([])
    expect(empty.sent[0].tool).toBe('claude')

    const after = harness({ claude: status('claude', 'missing') })
    after.readAfter.mockRejectedValue(new Error('probe'))
    expect(await after.installer.run(['claude'])).toEqual({ outcome: 'failed' })
    expect(after.sent.at(-1)).toEqual({ tool: 'claude', step: 'install', status: 'failed', reason: "Tearsheet couldn’t read the AI tools’ status." })
    expect(logged(after, 'install_step')[0]).toMatchObject({ reason_code: 'status_unread' })
  })
})

describe('blocked steps', () => {
  it('a too-old copy installed another way is blocked with its reason, once, and the other tool still runs', async () => {
    const h = harness({ claude: status('claude', 'too_old', '/opt/homebrew/bin/claude'), codex: status('codex', 'missing') })
    expect(await h.installer.run(['claude', 'codex'])).toEqual({ outcome: 'blocked' })
    expect(h.sent[0]).toEqual({
      tool: 'claude',
      step: 'install',
      status: 'blocked',
      reason: 'This Claude Code was installed another way (/opt/homebrew/bin). Update it the way you installed it.'
    })
    expect(h.sent.filter((p) => p.status === 'blocked')).toHaveLength(1)
    expect(commands(h)).toEqual([CODEX_INSTALL, '/Users/you/.local/bin/codex login'])
    expect(logged(h, 'step_blocked')).toEqual([{ tool: 'claude', step: 'install', reason_code: 'installed_elsewhere' }])
  })

  it.each([
    [{ noRealInstallers: true, programPaths: { claude: '/somewhere/claude' }, home: HOME }, 'program_path_set', 'A program path is set for Claude Code (TEARSHEET_CLAUDE_BIN)'],
    [{ noRealInstallers: true, home: HOME }, 'test_settings', "Test settings are on, so Tearsheet won't run the real installer."]
  ] as const)('no real installer under the test rules: blocked (%#)', async (rules, code, reason) => {
    const h = harness({ claude: status('claude', 'missing') }, { rules })
    expect(await h.installer.run(['claude'])).toEqual({ outcome: 'blocked' })
    expect(h.children).toEqual([])
    expect(h.sent).toEqual([{ tool: 'claude', step: 'install', status: 'blocked', reason: expect.stringContaining(reason) }])
    expect(logged(h, 'step_blocked')[0]).toMatchObject({ reason_code: code })
  })

  it('a reason the log doesn’t know is logged as blocked', async () => {
    const stepsFor = (): { steps: ToolStep[]; blocked: BlockedStep[] } => ({ steps: [], blocked: [{ tool: 'codex', reason: 'Something new.' }] })
    const h = harness({}, { deps: { stepsFor } })
    expect(await h.installer.run(['codex'])).toEqual({ outcome: 'blocked' })
    expect(logged(h, 'step_blocked')).toEqual([{ tool: 'codex', step: 'install', reason_code: 'blocked' }])
  })
})

describe('only when the switch is on, and one run at a time', () => {
  it('a switch that is off refuses the run, and nothing is read or run', async () => {
    const h = harness({ claude: status('claude', 'missing') }, { deps: { switchOn: () => false } })
    expect(await h.installer.run(['claude'])).toEqual({ outcome: 'refused', why: 'switch_off' })
    expect(h.read).not.toHaveBeenCalled()
    expect(h.children).toEqual([])
    expect(h.sent).toEqual([])
    expect(logged(h, 'step_blocked')).toEqual([{ reason_code: 'switch_off' }])
  })

  it('a second run while one is under way is refused; after it, a new one is taken', async () => {
    const h = harness({ claude: status('claude', 'signed_out') }, { behave: waits })
    const first = h.installer.run(['claude'])
    expect(await h.installer.run(['claude'])).toEqual({ outcome: 'refused', why: 'busy' })
    await settle()
    h.tools.claude = status('claude', 'ready')
    h.children[0].end(0)
    expect(await first).toEqual({ outcome: 'done' })
    h.tools.claude = status('claude', 'signed_out')
    const second = h.installer.run(['claude'])
    await settle()
    expect(h.children).toHaveLength(2)
    h.tools.claude = status('claude', 'ready')
    h.children[1].end(0)
    expect(await second).toEqual({ outcome: 'done' })
  })
})

describe('a sign-in stopped from the window', () => {
  it('cancel stops it, sends cancelled, then reads the tools again', async () => {
    const h = harness({ claude: status('claude', 'signed_out'), codex: status('codex', 'signed_out') }, { behave: waits })
    const run = h.installer.run(['claude', 'codex'])
    await settle()
    expect(statuses(h)).toEqual(['claude signIn opening_browser'])
    const cancelled = h.installer.cancel()
    expect(h.kill).toHaveBeenCalledWith(-4100, 'SIGTERM')
    expect(await cancelled).toBe(true)
    expect(statuses(h)).toEqual(['claude signIn opening_browser', 'claude signIn cancelled'])
    expect(h.order).toEqual(['read', 'spawn /Users/you/.local/bin/claude auth login', 'readAfter'])
    // The run ends there: Codex's sign-in doesn't start.
    expect(await run).toEqual({ outcome: 'cancelled' })
    expect(h.children).toHaveLength(1)
    expect(logged(h, 'install_step')).toEqual([{ tool: 'claude', step: 'signIn', status: 'cancelled', exit: null, signal: 'SIGTERM', ms: expect.any(Number), value: undefined, reason_code: 'cancelled' }])
  })

  it('a Codex sign-in stopped partway reads signed out afterwards, since it signed out first', async () => {
    const h = harness(
      { codex: status('codex', 'api_key') },
      {
        behave: (child, hh) => {
          hh.tools.codex = status('codex', 'signed_out')
          child.err(`Starting local login server on http://localhost:1455.\n${CODEX_LINK}\n`)
        }
      }
    )
    const run = h.installer.run(['codex'])
    await settle()
    expect(await h.installer.cancel()).toBe(true)
    expect(await run).toEqual({ outcome: 'cancelled' })
    expect(await h.readAfter.mock.results[0].value).toEqual([h.tools.claude, status('codex', 'signed_out')])
  })

  it('a sign-in that ignores the stop is killed after the grace time', async () => {
    vi.useFakeTimers()
    const h = harness({ claude: status('claude', 'signed_out') }, { behave: waits, deps: { timings: { killGraceMs: 300 } } })
    h.endsOnTerm = false
    void h.installer.run(['claude'])
    await settle()
    let answered = false
    void h.installer.cancel().then(() => (answered = true))
    await vi.advanceTimersByTimeAsync(299)
    expect(answered).toBe(false)
    expect(h.kill.mock.calls).toEqual([[-4100, 'SIGTERM']])
    await vi.advanceTimersByTimeAsync(1)
    expect(h.kill.mock.calls.at(-1)).toEqual([-4100, 'SIGKILL'])
    await settle()
    expect(answered).toBe(true)
  })

  it('cancel twice stops it once; both answer true', async () => {
    const h = harness({ claude: status('claude', 'signed_out') }, { behave: waits })
    h.endsOnTerm = false
    void h.installer.run(['claude'])
    await settle()
    const one = h.installer.cancel()
    const two = h.installer.cancel()
    expect(h.kill).toHaveBeenCalledTimes(1)
    h.children[0].end(null, 'SIGTERM')
    expect([await one, await two]).toEqual([true, true])
    expect(statuses(h).filter((s) => s.endsWith('cancelled'))).toHaveLength(1)
  })

  it('cancel with nothing running, or during an install, stops nothing', async () => {
    const h = harness({ claude: status('claude', 'missing') }, { behave: waits })
    expect(await h.installer.cancel()).toBe(false)
    const run = h.installer.run(['claude'])
    await settle()
    expect(await h.installer.cancel()).toBe(false)
    expect(h.kill).not.toHaveBeenCalled()
    h.tools.claude = status('claude', 'ready')
    h.children[0].end(0)
    expect(await run).toEqual({ outcome: 'done' })
    expect(statuses(h)).toEqual(['claude install downloading', 'claude install installed'])
  })

  it('a step with no process to stop', async () => {
    const h = harness({ claude: status('claude', 'signed_out') }, { deps: { spawn: () => new FakeChild('x', undefined) as StepChild } })
    void h.installer.run(['claude'])
    await settle()
    void h.installer.cancel()
    expect(h.kill).not.toHaveBeenCalled()
  })

  it('a stop on a process already gone is fine', async () => {
    const h = harness({ claude: status('claude', 'signed_out') }, { behave: waits })
    h.kill.mockImplementation(() => {
      throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' })
    })
    const run = h.installer.run(['claude'])
    await settle()
    void h.installer.cancel()
    h.children[0].end(null, 'SIGTERM')
    expect(await run).toEqual({ outcome: 'cancelled' })
  })

  it('stop() ends whatever runs, for quitting', async () => {
    const h = harness({ claude: status('claude', 'missing') }, { behave: waits })
    h.installer.stop()
    const run = h.installer.run(['claude'])
    await settle()
    h.installer.stop()
    expect(h.kill).toHaveBeenCalledWith(-4100, 'SIGTERM')
    expect(await run).toEqual({ outcome: 'cancelled' })
    expect(h.sent.at(-1)).toEqual({ tool: 'claude', step: 'install', status: 'cancelled' })
  })
})

describe('a sign-in that seems stuck', () => {
  it('slow after the first limit and stuck after the second, with short timings passed in', async () => {
    vi.useFakeTimers()
    const h = harness({ claude: status('claude', 'signed_out') }, { behave: waits, deps: { timings: { slowMs: 100, stuckMs: 300 } } })
    const run = h.installer.run(['claude'])
    await settle()
    await vi.advanceTimersByTimeAsync(99)
    expect(statuses(h)).toEqual(['claude signIn opening_browser'])
    await vi.advanceTimersByTimeAsync(1)
    expect(statuses(h)).toEqual(['claude signIn opening_browser', 'claude signIn slow'])
    await vi.advanceTimersByTimeAsync(199)
    expect(statuses(h)).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(statuses(h)).toEqual(['claude signIn opening_browser', 'claude signIn slow', 'claude signIn stuck'])
    h.tools.claude = status('claude', 'ready')
    h.children[0].end(0)
    expect(await run).toEqual({ outcome: 'done' })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(statuses(h).at(-1)).toBe('claude signIn done')
  })

  it('15 seconds and 2 minutes by default', async () => {
    vi.useFakeTimers()
    const h = harness({ claude: status('claude', 'signed_out') }, { behave: waits })
    void h.installer.run(['claude'])
    await settle()
    await vi.advanceTimersByTimeAsync(14_999)
    expect(statuses(h)).toEqual(['claude signIn opening_browser'])
    await vi.advanceTimersByTimeAsync(1)
    expect(statuses(h).at(-1)).toBe('claude signIn slow')
    await vi.advanceTimersByTimeAsync(120_000 - 15_000)
    expect(statuses(h).at(-1)).toBe('claude signIn stuck')
  })

  it('a sign-in that ends sooner, or is being stopped, sends neither; an install never does', async () => {
    vi.useFakeTimers()
    const quick = harness({ claude: status('claude', 'signed_out') }, { deps: { timings: { slowMs: 100, stuckMs: 300 } } })
    await quick.installer.run(['claude'])
    await vi.advanceTimersByTimeAsync(1000)
    expect(statuses(quick)).toEqual(['claude signIn opening_browser', 'claude signIn done'])

    const stopping = harness({ claude: status('claude', 'signed_out') }, { behave: waits, deps: { timings: { slowMs: 100, stuckMs: 300, killGraceMs: 5000 } } })
    stopping.endsOnTerm = false
    void stopping.installer.run(['claude'])
    await settle()
    void stopping.installer.cancel()
    await vi.advanceTimersByTimeAsync(400)
    expect(statuses(stopping)).toEqual(['claude signIn opening_browser'])

    const install = harness({ claude: status('claude', 'missing') }, { behave: waits, deps: { timings: { slowMs: 100, stuckMs: 300 } } })
    void install.installer.run(['claude'])
    await settle()
    await vi.advanceTimersByTimeAsync(1000)
    expect(statuses(install)).toEqual(['claude install downloading'])
  })
})

describe('the sign-in link', () => {
  it('Claude Code’s link, inside terminal link codes, is kept and opened by openSignInPage', async () => {
    const h = harness({ claude: status('claude', 'signed_out') }, { behave: waits })
    void h.installer.run(['claude'])
    await settle()
    // The text shown is cut short; the link's own target is the whole link.
    h.children[0].out(`Opening browser to sign in…\nIf the browser didn't open, visit: ${linked(CLAUDE_LINK, 'https://claude.com/cai/oauth/auth…')}\n`)
    expect(await h.installer.openSignInPage()).toBe(true)
    expect(h.openExternal).toHaveBeenCalledWith(CLAUDE_LINK)
    expect(logged(h, 'sign_in_link_opened')).toEqual([{ tool: 'claude', opened: true, test_mode: false }])
  })

  it('Codex’s link on standard error, after its localhost line', async () => {
    const h = harness({ codex: status('codex', 'signed_out') }, { behave: waits })
    void h.installer.run(['codex'])
    await settle()
    h.children[0].err(`Starting local login server on http://localhost:1455.\nIf your browser did not open, navigate to this URL to authenticate:\n\n${CODEX_LINK}\n`)
    await h.installer.openSignInPage()
    expect(h.openExternal).toHaveBeenCalledWith(CODEX_LINK)
  })

  it('a link split across chunks is read whole, and the first sign-in link is the one kept', async () => {
    const h = harness({ claude: status('claude', 'signed_out') }, { behave: waits })
    void h.installer.run(['claude'])
    await settle()
    const child = h.children[0]
    child.out('visit: \x1b]8;;https://claude.com/cai/oa')
    child.out('uth/authorize?state=first\x07here\x1b]8;;\x07\n')
    child.out('or https://claude.ai/oauth/authorize?state=second.\n')
    await h.installer.openSignInPage()
    expect(h.openExternal).toHaveBeenCalledWith('https://claude.com/cai/oauth/authorize?state=first')
  })

  it('kept only when its host is a sign-in host', async () => {
    const h = harness({ claude: status('claude', 'signed_out') }, { behave: waits })
    void h.installer.run(['claude'])
    await settle()
    h.children[0].out(
      [
        'http://localhost:54545/callback',
        'https://platform.claude.com/oauth/authorize?x=1',
        'https://evil.example/https://claude.ai/',
        'http://claude.ai/oauth/authorize',
        'https://claude.ai:8443/oauth/authorize',
        'https://someone@claude.ai/oauth/authorize',
        linked('https://claude.ai.evil.example/oauth')
      ].join('\n') + '\n'
    )
    expect(await h.installer.openSignInPage()).toBe(false)
    expect(h.openExternal).not.toHaveBeenCalled()
    expect(logged(h, 'sign_in_link_opened')).toEqual([{ opened: false, reason_code: 'no_link', test_mode: false }])
  })

  it('never sent or logged', async () => {
    const h = harness({ claude: status('claude', 'missing'), codex: status('codex', 'missing') })
    await h.installer.run(['claude', 'codex'])
    const everything = JSON.stringify([h.sent, h.entries])
    for (const piece of ['oauth', 'authorize', 'localhost', 'claude.com', 'auth.openai.com', 'Paste code']) expect(everything).not.toContain(piece)
  })

  it('not kept from an install’s output, and gone once the sign-in has ended', async () => {
    const h = harness({ claude: status('claude', 'missing') }, { behave: waits })
    const run = h.installer.run(['claude'])
    await settle()
    h.children[0].out(`Fetching ${linked('https://claude.ai/oauth/authorize?from=install')}\n`)
    expect(await h.installer.openSignInPage()).toBe(false)
    h.tools.claude = status('claude', 'signed_out')
    h.children[0].end(0)
    await settle()
    h.children[1].out(`visit: ${linked(CLAUDE_LINK)}\n`)
    h.tools.claude = status('claude', 'ready')
    h.children[1].end(0)
    await run
    expect(await h.installer.openSignInPage()).toBe(false)
    expect(h.openExternal).not.toHaveBeenCalled()
  })

  it('a browser that can’t be opened says so', async () => {
    const h = harness({ claude: status('claude', 'signed_out') }, { behave: waits })
    h.openExternal.mockRejectedValue(new Error('no browser'))
    void h.installer.run(['claude'])
    await settle()
    h.children[0].out(`${linked(CLAUDE_LINK)}\n`)
    expect(await h.installer.openSignInPage()).toBe(false)
    expect(logged(h, 'sign_in_link_opened')).toEqual([{ tool: 'claude', opened: false, reason_code: 'open_failed', test_mode: false }])
  })

  it('not opened in test mode: only logged', async () => {
    const h = harness({ claude: status('claude', 'signed_out', TEST_PATHS.claude) }, { rules: TEST_RULES, behave: waits })
    void h.installer.run(['claude'])
    await settle()
    h.children[0].out(`If the browser didn't open, visit: ${linked('https://claude.ai/oauth/authorize?standin=1')}\n`)
    expect(await h.installer.openSignInPage()).toBe(true)
    expect(h.openExternal).not.toHaveBeenCalled()
    expect(logged(h, 'sign_in_link_opened')).toEqual([{ tool: 'claude', opened: false, test_mode: true }])
  })

  it('a host list passed in replaces the built-in one', async () => {
    const h = harness({ claude: status('claude', 'signed_out') }, { behave: waits, deps: { signInHosts: ['sign-in.example'] } })
    void h.installer.run(['claude'])
    await settle()
    h.children[0].out(`${CLAUDE_LINK}\nhttps://sign-in.example/start\n`)
    await h.installer.openSignInPage()
    expect(h.openExternal).toHaveBeenCalledWith('https://sign-in.example/start')
  })
})

describe('signInLink', () => {
  it('a terminal link’s target comes before the text, either ending; a plain link loses trailing punctuation', () => {
    expect(signInLink(`visit ${linked(CLAUDE_LINK, 'here')}`)).toBe(CLAUDE_LINK)
    expect(signInLink(`\x1b]8;id=1;${CLAUDE_LINK}\x07here\x1b]8;;\x07`)).toBe(CLAUDE_LINK)
    expect(signInLink(`(see \x1b[4m${CODEX_LINK}\x1b[24m).`)).toBe(CODEX_LINK)
    expect(signInLink('no link here')).toBeNull()
    expect(signInLink(linked('https://example.com/'))).toBeNull()
  })
})

describe('test mode', () => {
  it('the stand-in installer, then a sign-in at the test path, never ~/.local/bin and never curl', async () => {
    const h = harness({ claude: status('claude', 'missing', TEST_PATHS.claude), codex: status('codex', 'missing', TEST_PATHS.codex) }, { rules: TEST_RULES })
    expect(await h.installer.run(['claude', 'codex'])).toEqual({ outcome: 'done' })
    expect(commands(h)).toEqual([
      `${TEST_DIR}/install-claude.sh`,
      `${TEST_DIR}/install-codex.sh`,
      `${TEST_PATHS.claude} auth login`,
      `${TEST_PATHS.codex} login`
    ])
    expect(commands(h).join(' ')).not.toMatch(/curl|\.local\/bin/)
    expect(statuses(h)).toContain('claude install installed')
  })

  it('a stand-in install that the status finds elsewhere is another copy', async () => {
    const h = harness({ claude: status('claude', 'missing', TEST_PATHS.claude) }, { rules: TEST_RULES })
    h.writes.claude = OFFICIAL.claude
    expect(await h.installer.run(['claude'])).toEqual({ outcome: 'failed' })
    expect(h.sent.at(-1)?.reason).toBe('Another copy at ~/.local/bin is found first.')
  })
})

describe('with real /bin/bash and harmless commands', () => {
  // Only printf and sleep run: stepsFor is faked, so no installer or sign-in is ever named.
  const fakeSteps =
    (command: string, kind: ToolStep['kind']) =>
    (_kinds: ToolKind[], tools: ToolStatus[]): { steps: ToolStep[]; blocked: BlockedStep[] } => {
      const claude = tools.find((t) => t.kind === 'claude')
      const done = kind === 'install' ? claude?.state !== 'missing' : claude?.state === 'ready'
      return { steps: done ? [] : [{ tool: 'claude', kind, command }], blocked: [] }
    }

  // `track` wraps the real spawn to keep each process's id; without it the installer's own
  // default spawn runs.
  function real(command: string, kind: ToolStep['kind'], after: ToolStatus, track = true) {
    const sent: InstallProgress[] = []
    const children: { pid?: number }[] = []
    let tools = [kind === 'install' ? status('claude', 'missing') : status('claude', 'signed_out'), status('codex', 'ready')]
    const tracked: SpawnStep = (cmd, args, options) => {
      const child = nodeSpawn(cmd, args, options)
      children.push(child)
      return child
    }
    const installer = new Installer({
      watch: { read: async () => tools, readAfter: async () => tools },
      rules: { noRealInstallers: false, home: HOME },
      stepsFor: fakeSteps(command, kind),
      pathValue: '/usr/bin:/bin',
      env: { HOME },
      send: (p) => void sent.push(p),
      openExternal: async () => undefined,
      switchOn: () => true,
      testMode: true,
      ...(track ? { spawn: tracked } : {}),
      timings: { killGraceMs: 2000 }
    })
    const finish = () => {
      tools = [after, status('codex', 'ready')]
    }
    return { installer, sent, children, finish }
  }

  it('reads both streams of a real process, and its exit code', async () => {
    const { installer, sent, finish } = real(`printf 'Setting up\\n' >&2; printf 'done\\n'; exit 0`, 'install', status('claude', 'signed_out'), false)
    const run = installer.run(['claude'])
    finish()
    expect(await run).toEqual({ outcome: 'done' })
    expect(sent.map((p) => p.status)).toEqual(['downloading', 'installing', 'installed'])
  })

  it('pipefail: a failing first half of a pipe fails the step', async () => {
    const { installer, sent } = real(`false | cat`, 'install', status('claude', 'signed_out'))
    expect(await installer.run(['claude'])).toEqual({ outcome: 'failed' })
    expect(sent.at(-1)?.reason).toBe('The download failed.')
  })

  it('input is closed: a step that reads its input gets nothing', async () => {
    const { installer, sent, finish } = real(`read -r line; [ -z "$line" ]`, 'signIn', status('claude', 'ready'))
    const run = installer.run(['claude'])
    finish()
    expect(await run).toEqual({ outcome: 'done' })
    expect(sent.at(-1)?.status).toBe('done')
  })

  it('a sign-in that hangs is stopped with its whole process group, and its link was kept', async () => {
    const { installer, sent, children } = real(
      `printf 'visit: \\033]8;;https://claude.ai/oauth/authorize?real=1\\033\\\\here\\033]8;;\\033\\\\\\n'; sleep 30 & sleep 30; wait`,
      'signIn',
      status('claude', 'ready')
    )
    const run = installer.run(['claude'])
    // Wait for the link line to arrive.
    await vi.waitFor(async () => expect(await installer.openSignInPage()).toBe(true), { timeout: 5000 })
    const pid = children[0].pid as number
    expect(await installer.cancel()).toBe(true)
    expect(await run).toEqual({ outcome: 'cancelled' })
    expect(sent.at(-1)?.status).toBe('cancelled')
    // Nothing of the group is left (once the system has collected the stopped sleeps).
    await vi.waitFor(() => expect(() => process.kill(-pid, 0)).toThrow(), { timeout: 5000 })
  }, 10_000)
})
