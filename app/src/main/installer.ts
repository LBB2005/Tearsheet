// The Install button (first-run design §2, item 29). It runs the steps toolSteps gives, one at a
// time: after each it forces a fresh read of the tools' status and asks stepsFor again, until
// nothing is left. So a sign-in always uses the path the status gives (Homebrew, npm or a test
// path), a sign-in an update made unnecessary is dropped, and each step runs at most once per
// run. The window only says which tools to set up; every command comes from toolSteps.
//
// Each step runs as `/bin/bash -o pipefail -c <command>` with the login shell's PATH,
// CLAUDE_CONFIG_DIR and CODEX_HOME, its input closed, and both output streams read line by line.
// A sign-in's link is read out of each line before terminal codes are stripped (Claude Code wraps
// it in terminal link codes) and kept here, only when its host is a sign-in host, for
// openSignInPage. Raw lines and links are never sent or logged. Progress reaches the window as
// install_progress messages; done means exit 0 and then a fresh read that shows the step worked.
//
// Each step runs in its own process group, so stopping it stops what it started too (curl, the
// installer, the tool's own helpers). A sign-in can be stopped; an install is stopped only when it
// runs past its limit. Status commands are never run or stopped here (probe.ts owns them).

import { spawn as nodeSpawn } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join, normalize } from 'node:path'

import { FAILURES, STATE_SENTENCES, type InstallProgress, type InstallStatus, type RunResult } from '../shared/install'
import { installDir, type BlockedStep, type ToolKind, type ToolState, type ToolStatus, type ToolStep } from '../shared/tools'
import { isSignInLink, SIGN_IN_HOSTS } from './external'
import { stripTerminalCodes } from './probe'
import { NO_LOG, type SetupFields, type SetupLog } from './setupLog'
import { stepsFor as planSteps, type StepRules } from './toolSteps'
import { TOOLS } from './tools'

// ---------- the sign-in link ----------

// A terminal link: ESC ] 8 ; params ; link, then BEL or ESC \.
const TERMINAL_LINK = /\x1b\]8;[^;\x07\x1b]*;([^\x07\x1b]*)(?:\x07|\x1b\\)/g
const PLAIN_LINK = /https?:\/\/[^\s<>"'`]+/g
const TRAILING = /[.,;:!?)\]}]+$/

// The first sign-in link in one raw output line. Terminal links are read before the codes are
// stripped, since their target can differ from the text shown; then plain links in the text.
export function signInLink(raw: string, hosts: readonly string[] = SIGN_IN_HOSTS): string | null {
  const linked = [...raw.matchAll(TERMINAL_LINK)].map((m) => m[1])
  const plain = (stripTerminalCodes(raw).match(PLAIN_LINK) ?? []).map((link) => link.replace(TRAILING, ''))
  return [...linked, ...plain].find((link) => isSignInLink(link, hosts)) ?? null
}

// ---------- running a step ----------

export const SLOW_MS = 15_000
export const STUCK_MS = 120_000
export const INSTALL_LIMIT_MS = 10 * 60_000

export interface InstallTimings {
  // A sign-in still running after these sends slow, then stuck.
  slowMs: number
  stuckMs: number
  // An install still running after this is stopped.
  installLimitMs: number
  // How long a stopped step has to end before it is killed outright.
  killGraceMs: number
  // A step that has exited but whose streams a helper still holds open counts as ended after this.
  exitGraceMs: number
}

const TIMINGS: InstallTimings = { slowMs: SLOW_MS, stuckMs: STUCK_MS, installLimitMs: INSTALL_LIMIT_MS, killGraceMs: 3000, exitGraceMs: 1000 }

// A line longer than this (with no line end) is read as it stands rather than kept growing.
const MAX_LINE = 64 * 1024

// The tools' own success lines, only noted in the log: done is decided by the fresh read.
const SUCCESS = /successfully installed|installation complete|login successful|successfully logged in/i

export interface StepStream {
  setEncoding(encoding: 'utf8'): unknown
  on(event: 'data', listener: (chunk: string) => void): unknown
  on(event: 'end' | 'error', listener: () => void): unknown
}

// Both output streams are piped, so neither is ever null.
export interface StepChild {
  pid?: number
  stdout: StepStream
  stderr: StepStream
  on(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
}

export interface StepSpawnOptions {
  env: NodeJS.ProcessEnv
  stdio: ['ignore', 'pipe', 'pipe']
  detached: true
}

export type SpawnStep = (command: string, args: string[], options: StepSpawnOptions) => StepChild

const defaultSpawn: SpawnStep = nodeSpawn

// The status reads the installer needs: toolWatch's. readAfter starts after the call, so the read
// after a step never shares one that began before the step ended.
export interface ToolReader {
  read(force?: boolean): Promise<ToolStatus[]>
  readAfter(): Promise<ToolStatus[]>
}

export interface InstallerDeps {
  // The one owner of the tools' status reads (toolWatch.ts). Its forced reads send tools_changed.
  watch: ToolReader
  // This launch's rules (toolSteps.stepRules), and stepsFor itself (faked in tests if need be).
  rules: StepRules
  stepsFor?: typeof planSteps
  // The login shell's PATH, CLAUDE_CONFIG_DIR and CODEX_HOME (loginShellPath.ts), and the rest of
  // the environment (process.env).
  pathValue: string
  claudeConfigDir?: string
  codexHome?: string
  env?: NodeJS.ProcessEnv
  // Sends one install_progress message to the window.
  send: (progress: InstallProgress) => void
  // Opens a link in the person's browser (shell.openExternal).
  openExternal: (url: string) => Promise<void>
  // Whether an install call is taken now (installSwitch.allowsInstall).
  switchOn: () => boolean
  // testMode(process.env) (tools.ts): the sign-in page is then never opened.
  testMode: boolean
  signInHosts?: readonly string[]
  spawn?: SpawnStep
  // Sends a signal to a process group (process.kill with a negative pid).
  kill?: (pid: number, signal: NodeJS.Signals) => void
  log?: SetupLog
  timings?: Partial<InstallTimings>
  now?: () => number
}

interface Ended {
  started: boolean
  code: number | null
  signal: NodeJS.Signals | null
}

interface Running {
  step: ToolStep
  child: StepChild | null
  // Stopped by cancel() or stop(), or by the install limit.
  cancelled: boolean
  timedOut: boolean
  ended: boolean
  sawSuccess: boolean
  end: Promise<Ended>
}

type StepOutcome = { outcome: 'ok'; tools: ToolStatus[] } | { outcome: 'failed' | 'cancelled' }

const SPEC = Object.fromEntries(TOOLS.map((t) => [t.kind, t])) as Record<ToolKind, (typeof TOOLS)[number]>

// Reads a stream line by line: \n, \r\n or a lone \r ends a line.
function readLines(stream: StepStream, onLine: (line: string) => void): void {
  let rest = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk: string) => {
    const parts = (rest + chunk).split(/\r\n|\n|\r/)
    // The text after the last line end, kept for the next chunk.
    rest = parts.splice(-1)[0]
    if (rest.length > MAX_LINE) {
      parts.push(rest)
      rest = ''
    }
    for (const line of parts) onLine(line)
  })
  stream.on('end', () => {
    if (rest) onLine(rest)
    rest = ''
  })
  stream.on('error', () => undefined)
}

const withTilde = (path: string, home: string) => {
  const base = home.replace(/\/+$/, '')
  return base && (path === base || path.startsWith(`${base}/`)) ? `~${path.slice(base.length)}` : path
}

// The log's short code for a blocked step's reason (toolSteps' sentences).
function blockedCode(reason: string): string {
  if (reason.includes('installed another way')) return 'installed_elsewhere'
  if (reason.includes('program path')) return 'program_path_set'
  if (reason.includes('Test settings')) return 'test_settings'
  return 'blocked'
}

export class Installer {
  private underway: Promise<RunResult> | null = null
  private current: Running | null = null
  // The sign-in link of the sign-in running now, if it printed one. Never sent or logged.
  private link: { tool: ToolKind; url: string } | null = null
  private readonly timings: InstallTimings
  private readonly log: SetupLog
  private readonly now: () => number

  constructor(private readonly deps: InstallerDeps) {
    this.timings = { ...TIMINGS, ...deps.timings }
    this.log = deps.log ?? NO_LOG
    this.now = deps.now ?? Date.now
  }

  // Sets up `kinds` (['claude'], ['codex'] or both), one step at a time. Refused, with nothing
  // run, when the switch is off or a run is already under way.
  run(kinds: ToolKind[]): Promise<RunResult> {
    if (!this.deps.switchOn()) {
      this.log.log('step_blocked', { reason_code: 'switch_off' })
      return Promise.resolve({ outcome: 'refused', why: 'switch_off' })
    }
    if (this.underway) return Promise.resolve({ outcome: 'refused', why: 'busy' })
    const underway = this.runAll(kinds).finally(() => {
      if (this.underway === underway) this.underway = null
    })
    this.underway = underway
    return underway
  }

  // Stops the sign-in running now. It answers once the sign-in has ended, `cancelled` has been
  // sent and the tools read again, so a paste command copied after it never runs alongside it.
  // An install isn't stopped (that could leave a half-written copy): it answers false.
  async cancel(): Promise<boolean> {
    const running = this.current
    if (!running || running.ended || running.step.kind !== 'signIn') return false
    if (!running.cancelled) {
      running.cancelled = true
      this.terminate(running)
    }
    await this.underway?.catch(() => undefined)
    return true
  }

  // Stops whatever step is running, for when Tearsheet quits.
  stop(): void {
    const running = this.current
    if (!running || running.ended) return
    running.cancelled = true
    this.terminate(running)
  }

  // Opens the running sign-in's own page, for "Browser didn't open? Open the sign-in page". In
  // test mode it only logs, and the browser isn't opened.
  async openSignInPage(): Promise<boolean> {
    const kept = this.link
    if (!kept || !isSignInLink(kept.url, this.hosts)) {
      this.log.log('sign_in_link_opened', { opened: false, reason_code: 'no_link', test_mode: this.deps.testMode })
      return false
    }
    if (this.deps.testMode) {
      this.log.log('sign_in_link_opened', { tool: kept.tool, opened: false, test_mode: true })
      return true
    }
    try {
      await this.deps.openExternal(kept.url)
      this.log.log('sign_in_link_opened', { tool: kept.tool, opened: true, test_mode: false })
      return true
    } catch {
      this.log.log('sign_in_link_opened', { tool: kept.tool, opened: false, reason_code: 'open_failed', test_mode: false })
      return false
    }
  }

  private get hosts(): readonly string[] {
    return this.deps.signInHosts ?? SIGN_IN_HOSTS
  }

  private get home(): string {
    return this.deps.rules.home ?? homedir()
  }

  private send(progress: InstallProgress): void {
    this.deps.send(progress)
  }

  private async runAll(kinds: ToolKind[]): Promise<RunResult> {
    const stepsFor = this.deps.stepsFor ?? planSteps
    const ran = new Set<string>()
    const told = new Set<ToolKind>()
    let tools: ToolStatus[]
    try {
      tools = await this.deps.watch.read()
    } catch {
      const tool = kinds[0] ?? 'claude'
      this.send({ tool, step: 'install', status: 'failed', reason: FAILURES.cantRead })
      this.log.log('install_step', { tool, status: 'failed', reason_code: 'status_unread' })
      return { outcome: 'failed' }
    }
    for (;;) {
      const plan = stepsFor(kinds, tools, this.deps.rules)
      this.tellBlocked(plan.blocked, told)
      const step = plan.steps[0]
      if (!step) return { outcome: told.size > 0 ? 'blocked' : 'done' }
      const key = `${step.tool}:${step.kind}`
      if (ran.has(key)) {
        this.send({ tool: step.tool, step: step.kind, status: 'failed', reason: FAILURES.sameStep })
        this.log.log('install_step', { tool: step.tool, step: step.kind, status: 'failed', reason_code: 'same_step' })
        return { outcome: 'failed' }
      }
      ran.add(key)
      const result = await this.runStep(step)
      if (result.outcome !== 'ok') return { outcome: result.outcome }
      tools = result.tools
    }
  }

  // Each blocked tool is told once per run; the other tools' steps still run.
  private tellBlocked(blocked: BlockedStep[], told: Set<ToolKind>): void {
    for (const { tool, reason } of blocked) {
      if (told.has(tool)) continue
      told.add(tool)
      this.send({ tool, step: 'install', status: 'blocked', reason })
      this.log.log('step_blocked', { tool, step: 'install', reason_code: blockedCode(reason) })
    }
  }

  // Where the installer writes the tool: the set test path, else the official folder.
  private installedPath(kind: ToolKind): string {
    return this.deps.rules.programPaths?.[kind] ?? join(installDir(kind, this.home), SPEC[kind].binary)
  }

  private async runStep(step: ToolStep): Promise<StepOutcome> {
    const startedAt = this.now()
    const signIn = step.kind === 'signIn'
    this.send({ tool: step.tool, step: step.kind, status: signIn ? 'opening_browser' : 'downloading' })
    const running = this.start(step)
    this.current = running
    const ended = await running.end
    this.current = null
    if (signIn) this.link = null

    const entry = (status: InstallStatus, fields: SetupFields = {}) =>
      this.log.log('install_step', {
        tool: step.tool,
        step: step.kind,
        status,
        exit: ended.code,
        signal: ended.signal,
        ms: this.now() - startedAt,
        value: running.sawSuccess ? 'success_line' : undefined,
        ...fields
      })
    const fail = (reason: string, code: string, fields: SetupFields = {}): StepOutcome => {
      this.send({ tool: step.tool, step: step.kind, status: 'failed', reason })
      entry('failed', { reason_code: code, ...fields })
      return { outcome: 'failed' }
    }

    if (running.cancelled) {
      this.send({ tool: step.tool, step: step.kind, status: 'cancelled' })
      entry('cancelled', { reason_code: 'cancelled' })
      // The status is read again, and tools_changed shows what it found (for Codex, usually
      // signed out: its sign-in signs out first).
      await this.deps.watch.readAfter().catch(() => undefined)
      return { outcome: 'cancelled' }
    }
    if (!ended.started) return fail(FAILURES.cantStart(step.kind), 'spawn_failed')
    if (running.timedOut) return fail(FAILURES.installTooLong, 'install_timeout')
    if (ended.code !== 0) return fail(signIn ? FAILURES.signIn : FAILURES.download, 'exit_nonzero')

    let tools: ToolStatus[]
    try {
      tools = await this.deps.watch.readAfter()
    } catch {
      return fail(FAILURES.cantRead, 'status_unread')
    }
    const tool = tools.find((t) => t.kind === step.tool)
    const state: ToolState = tool?.state ?? 'missing'

    if (signIn) {
      if (state === 'ready') {
        this.send({ tool: step.tool, step: 'signIn', status: 'done' })
        entry('done', { state })
        return { outcome: 'ok', tools }
      }
      const sentence = state === 'free_plan' || state === 'api_key' ? STATE_SENTENCES[step.tool][state] : undefined
      return sentence ? fail(sentence, state, { state }) : fail(FAILURES.signIn, 'not_ready_after', { state })
    }

    if (!tool?.path || state === 'missing') return fail(FAILURES.notFound(SPEC[step.tool].name), 'not_found_after', { state })
    if (normalize(tool.path) !== normalize(this.installedPath(step.tool))) {
      // An older copy (Homebrew, npm) earlier on the PATH. Said, never worked around: the
      // installer isn't run again.
      this.log.log('another_copy_found', { tool: step.tool, path: tool.path })
      return fail(FAILURES.anotherCopy(withTilde(dirname(tool.path), this.home)), 'another_copy', { state })
    }
    this.send({ tool: step.tool, step: 'install', status: 'installed' })
    entry('installed', { state })
    return { outcome: 'ok', tools }
  }

  private env(): NodeJS.ProcessEnv {
    const { env = process.env, pathValue, claudeConfigDir, codexHome } = this.deps
    return { ...env, PATH: pathValue, ...(claudeConfigDir ? { CLAUDE_CONFIG_DIR: claudeConfigDir } : {}), ...(codexHome ? { CODEX_HOME: codexHome } : {}) }
  }

  private start(step: ToolStep): Running {
    const signIn = step.kind === 'signIn'
    const running: Running = { step, child: null, cancelled: false, timedOut: false, ended: false, sawSuccess: false, end: Promise.resolve({ started: false, code: null, signal: null }) }
    running.end = new Promise<Ended>((resolve) => {
      const timers: ReturnType<typeof setTimeout>[] = []
      const later = (ms: number, fn: () => void) => {
        const timer = setTimeout(fn, ms)
        timer.unref?.()
        timers.push(timer)
      }
      const finish = (ended: Ended) => {
        if (running.ended) return
        running.ended = true
        timers.forEach(clearTimeout)
        resolve(ended)
      }
      let child: StepChild
      try {
        child = (this.deps.spawn ?? defaultSpawn)('/bin/bash', ['-o', 'pipefail', '-c', step.command], {
          env: this.env(),
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: true
        })
      } catch {
        finish({ started: false, code: null, signal: null })
        return
      }
      running.child = child

      let lines = 0
      const onLine = (raw: string) => {
        if (running.ended) return
        // The link first, while its terminal link codes are still there.
        if (signIn && !this.link) {
          const url = signInLink(raw, this.hosts)
          if (url) this.link = { tool: step.tool, url }
        }
        const text = stripTerminalCodes(raw).trim()
        if (!text) return
        if (SUCCESS.test(text)) running.sawSuccess = true
        if (!signIn && lines++ === 0) this.send({ tool: step.tool, step: 'install', status: 'installing' })
      }
      readLines(child.stdout, onLine)
      readLines(child.stderr, onLine)

      child.on('error', () => finish({ started: child.pid !== undefined, code: null, signal: null }))
      child.on('close', (code, signal) => finish({ started: true, code, signal }))
      // The output is complete at 'close'. A step that leaves a helper holding a stream open has
      // still ended, so its exit counts too, after a moment for the last output.
      child.on('exit', (code, signal) => later(this.timings.exitGraceMs, () => finish({ started: true, code, signal })))

      if (signIn) {
        const tell = (status: 'slow' | 'stuck') => () => {
          if (!running.cancelled) this.send({ tool: step.tool, step: 'signIn', status })
        }
        later(this.timings.slowMs, tell('slow'))
        later(this.timings.stuckMs, tell('stuck'))
      } else {
        later(this.timings.installLimitMs, () => {
          running.timedOut = true
          this.terminate(running)
        })
      }
    })
    return running
  }

  // Asks the step's whole process group to stop, then kills it if it hasn't ended in time.
  private terminate(running: Running): void {
    this.signalGroup(running, 'SIGTERM')
    const timer = setTimeout(() => this.signalGroup(running, 'SIGKILL'), this.timings.killGraceMs)
    timer.unref?.()
    void running.end.then(() => clearTimeout(timer))
  }

  private signalGroup(running: Running, signal: NodeJS.Signals): void {
    const pid = running.child?.pid
    if (running.ended || !pid) return
    try {
      ;(this.deps.kill ?? ((p: number, s: NodeJS.Signals) => process.kill(p, s)))(-pid, signal)
    } catch {
      // already gone
    }
  }
}
