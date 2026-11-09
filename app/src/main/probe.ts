// AI tool detection (design item 43; adapted from Realm, MIT; first-run design §1, item 3): walk
// the PATH, run `--version` with a 5-second limit, then read the sign-in status from the one
// stream each tool writes it on, reading the output even on a non-zero exit. Tool credential
// files are never read. toolWatch.ts decides when to read; there is no cache here.
//
// A status command is never killed, because killing one partway has signed people out (Claude
// Code's changelog, 2.1.301 and 2.1.317). One that runs past `statusLimitMs` reads as
// `cant_tell`; it is left to finish, its late answer is ignored, and no new status read of that
// tool starts until it has ended. A Claude Code older than MIN_CLAUDE_VERSION, the version with
// the last of those fixes, is `too_old`, and its status command is never run.

import { execFile, spawn } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { join } from 'node:path'

import { isEmail, MIN_CLAUDE_VERSION, toolFlags, versionBelow, versionNumber, type ToolKind, type ToolState, type ToolStatus } from '../shared/tools'
import { NO_LOG, type SetupLog } from './setupLog'
import { TOOLS, type ToolSpec } from './tools'

const VERSION_LIMIT_MS = 5000
export const STATUS_LIMIT_MS = 60_000
// More than any real status message; the rest is dropped rather than kept in memory.
const MAX_OUTPUT = 64 * 1024
const EXIT_GRACE_MS = 1000

export function findOnPath(binary: string, pathValue: string): string | null {
  for (const dir of pathValue.split(':').filter(Boolean)) {
    const candidate = join(dir, binary)
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // not here
    }
  }
  return null
}

// Terminal escape codes: colours and cursor moves (CSI), links and titles (OSC), and the short
// two-character ones. Stripped before any output is read.
export function stripTerminalCodes(text: string): string {
  return text
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '')
    .replace(/(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-Z\\-_]/g, '')
}

export interface ReadStatus {
  state: ToolState
  plan: string | null
  email: string | null
}

// The first JSON object in the output, so a warning line printed before it doesn't matter.
function jsonObject(text: string): Record<string, unknown> | null {
  const end = text.lastIndexOf('}')
  for (let start = text.indexOf('{'); start >= 0 && start < end; start = text.indexOf('{', start + 1)) {
    try {
      const value: unknown = JSON.parse(text.slice(start, end + 1))
      if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
    } catch {
      // try the next brace
    }
  }
  return null
}

// Codex's status lines (login.rs, run_login_status, at rust-v0.165.0). Only a ChatGPT sign-in is
// a plan; an API key, an access token, Amazon Bedrock and workload identity are not.
const CODEX_LINES: [string, ToolState][] = [
  ['Logged in using ChatGPT', 'ready'],
  ['API key configured', 'api_key'],
  ['Logged in using access token', 'api_key'],
  ['Logged in using personal access token', 'api_key'],
  ['Logged in using Amazon Bedrock', 'api_key'],
  ['Logged in using workload identity', 'api_key'],
  ['Not logged in', 'signed_out']
]

// What a status command's output (from its own stream) says, as one state. Claude Code's JSON
// is read with these rules, in order: no JSON object is cant_tell; loggedIn false is signed_out;
// loggedIn anything but true is cant_tell; an authMethod other than claude.ai, or an apiProvider
// other than Anthropic's own (firstParty), is api_key; a free subscriptionType is free_plan;
// anything else is ready, including a subscriptionType Tearsheet doesn't know. For Codex the
// first line that starts with a known message decides.
export function readStatus(kind: ToolKind, output: string): ReadStatus {
  const text = stripTerminalCodes(output)
  if (kind === 'codex') {
    for (const line of text.split(/\r?\n/)) {
      const hit = CODEX_LINES.find(([start]) => line.trim().startsWith(start))
      if (hit) return { state: hit[1], plan: null, email: null }
    }
    return { state: 'cant_tell', plan: null, email: null }
  }
  const data = jsonObject(text)
  if (!data) return { state: 'cant_tell', plan: null, email: null }
  if (data.loggedIn === false) return { state: 'signed_out', plan: null, email: null }
  if (data.loggedIn !== true) return { state: 'cant_tell', plan: null, email: null }
  const plan = typeof data.subscriptionType === 'string' && data.subscriptionType.trim() ? data.subscriptionType.trim() : null
  const email = typeof data.email === 'string' && isEmail(data.email) ? data.email.trim() : null
  const provider = data.apiProvider
  const otherProvider = provider !== undefined && provider !== null && provider !== '' && provider !== 'firstParty'
  if (data.authMethod !== 'claude.ai' || otherProvider) return { state: 'api_key', plan, email }
  if (plan?.toLowerCase() === 'free') return { state: 'free_plan', plan, email }
  return { state: 'ready', plan, email }
}

interface Ran {
  code: number | null
  signal: string | null
  out: string
}

// --version, with its 5-second limit (it is quick and safe to stop).
function runVersion(path: string, args: string[], env: NodeJS.ProcessEnv): Promise<Ran> {
  return new Promise((resolve) => {
    execFile(path, args, { timeout: VERSION_LIMIT_MS, env, encoding: 'utf8', maxBuffer: MAX_OUTPUT }, (error, stdout, stderr) => {
      const failed = error as (NodeJS.ErrnoException & { code?: unknown; signal?: string | null }) | null
      const code = failed ? (typeof failed.code === 'number' ? failed.code : 1) : 0
      const out = String(stdout ?? '')
      resolve({ code, signal: failed?.signal ?? null, out: out.trim() ? out : String(stderr ?? '') })
    })
  })
}

type StatusRun = ({ ended: true } & Ran) | { ended: false; stillRunning: boolean }

interface Running {
  late: boolean
  outcome: Promise<StatusRun>
}

export interface ProbeOptions {
  pathValue: string
  // The environment the tools run in (process.env); PATH is replaced by `pathValue`.
  env?: NodeJS.ProcessEnv
  // CLAUDE_CONFIG_DIR and CODEX_HOME from the login shell (loginShellPath.ts), so Tearsheet reads
  // the same sign-in as Terminal.
  claudeConfigDir?: string
  codexHome?: string
  statusLimitMs?: number
  log?: SetupLog
}

export class Probe {
  private running = new Map<ToolKind, Running>()

  constructor(private readonly options: ProbeOptions) {}

  getTools(): Promise<ToolStatus[]> {
    return Promise.all(TOOLS.map((spec) => this.read(spec)))
  }

  // Whether a status command of this tool is still running (for tests, and nothing else).
  isRunning(kind: ToolKind): boolean {
    return this.running.has(kind)
  }

  private env(): NodeJS.ProcessEnv {
    const { env = process.env, pathValue, claudeConfigDir, codexHome } = this.options
    return { ...env, PATH: pathValue, ...(claudeConfigDir ? { CLAUDE_CONFIG_DIR: claudeConfigDir } : {}), ...(codexHome ? { CODEX_HOME: codexHome } : {}) }
  }

  private async read(spec: ToolSpec): Promise<ToolStatus> {
    const log = this.options.log ?? NO_LOG
    const startedAt = Date.now()
    const env = this.env()
    const path = (this.options.env ?? process.env)[spec.overrideEnv] || findOnPath(spec.binary, this.options.pathValue)
    const status = (state: ToolState, rest: Partial<ToolStatus> = {}): ToolStatus => ({
      kind: spec.kind,
      name: spec.name,
      path: path ?? null,
      ...toolFlags(state),
      version: null,
      reason: null,
      state,
      plan: null,
      email: null,
      ...rest
    })
    const done = (result: ToolStatus, fields: { exit?: number | null; signal?: string | null; reason_code?: string } = {}): ToolStatus => {
      log.log('status_read', {
        tool: spec.kind,
        path: result.path,
        ...fields,
        ms: Date.now() - startedAt,
        state: result.state,
        // An unknown or missing plan is written too, so it can be seen.
        plan: spec.kind === 'claude' && result.loggedIn === true ? (result.plan ?? 'missing') : undefined,
        value: versionNumber(result.version) ?? undefined
      })
      return result
    }

    if (!path) return done(status('missing', { reason: `${spec.binary} wasn't found on your PATH.` }), { reason_code: 'not_found' })
    const version = await runVersion(path, spec.versionArgs, env)
    if (version.code !== 0) {
      return done(status('missing', { reason: `${spec.binary} --version didn't answer.` }), { exit: version.code, signal: version.signal, reason_code: 'version_failed' })
    }
    const versionLine = stripTerminalCodes(version.out).trim().split('\n')[0]?.trim() || null
    if (spec.kind === 'claude') {
      const below = versionBelow(versionLine, MIN_CLAUDE_VERSION)
      if (below) return done(status('too_old', { version: versionLine }), { reason_code: 'below_minimum' })
      // A version Tearsheet can't read can't be shown to be new enough, so its status isn't run.
      if (below === null) return done(status('cant_tell', { version: versionLine }), { reason_code: 'version_unreadable' })
    }

    const run = await this.runStatus(spec, path, env)
    if (!run.ended) {
      return done(status('cant_tell', { version: versionLine }), { reason_code: run.stillRunning ? 'status_still_running' : 'status_slow' })
    }
    const read = readStatus(spec.kind, run.out)
    return done(status(read.state, { version: versionLine, plan: read.plan, email: read.email }), { exit: run.code, signal: run.signal })
  }

  // The status command, never killed. A read while an earlier one of this tool is still within
  // its limit shares its answer; once that one is late, the read is cant_tell until it ends.
  private runStatus(spec: ToolSpec, path: string, env: NodeJS.ProcessEnv): Promise<StatusRun> {
    const current = this.running.get(spec.kind)
    if (current) return current.late ? Promise.resolve({ ended: false, stillRunning: true }) : current.outcome
    const limit = this.options.statusLimitMs ?? STATUS_LIMIT_MS
    const entry: Running = { late: false, outcome: Promise.resolve({ ended: false, stillRunning: false }) }
    let ended = false
    entry.outcome = new Promise<StatusRun>((resolve) => {
      const finish = (run: StatusRun) => {
        ended = true
        clearTimeout(timer)
        if (this.running.get(spec.kind) === entry) this.running.delete(spec.kind)
        resolve(run)
      }
      const timer = setTimeout(() => {
        entry.late = true
        resolve({ ended: false, stillRunning: false })
      }, limit)
      let out = ''
      try {
        // Input closed, and only the tool's own status stream read; the other goes nowhere.
        const child = spawn(path, spec.statusArgs, {
          env,
          stdio: ['ignore', spec.statusStream === 'stdout' ? 'pipe' : 'ignore', spec.statusStream === 'stderr' ? 'pipe' : 'ignore']
        })
        const stream = spec.statusStream === 'stdout' ? child.stdout : child.stderr
        stream?.setEncoding('utf8')
        stream?.on('data', (chunk: string) => {
          if (out.length < MAX_OUTPUT) out += chunk
        })
        child.on('error', () => finish({ ended: true, code: null, signal: null, out: '' }))
        child.on('close', (code, signal) => finish({ ended: true, code, signal, out }))
        // The output is complete at 'close'. A program that leaves a helper holding the stream
        // open has still ended, so its exit counts too, after a moment for the last output.
        child.on('exit', (code, signal) => {
          setTimeout(() => finish({ ended: true, code, signal, out }), EXIT_GRACE_MS).unref?.()
        })
      } catch {
        finish({ ended: true, code: null, signal: null, out: '' })
      }
    })
    // A spawn that threw at once has already finished, so there is nothing still running.
    if (!ended) this.running.set(spec.kind, entry)
    return entry.outcome
  }
}
