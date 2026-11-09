// The AI tool's reducer (first-run design item 30): each status state maps to the state of the
// same name, and the Install button's messages give installing, signing_in and failed.

import { describe, expect, it } from 'vitest'

import { FAILURES, type InstallProgress } from '../../../shared/install'
import { toolFlags, type ToolKind, type ToolState, type ToolStatus } from '../../../shared/tools'
import { checkerOf, phaseOf, signInWait, toolReducer, toolStart, waitsOnPaste, writerOf, writerStatus, type ToolEvent, type ToolMachine } from './tool'

const tool = (kind: ToolKind, state: ToolState): ToolStatus => ({
  kind,
  name: kind === 'claude' ? 'Claude Code' : 'Codex',
  path: state === 'missing' ? null : `/Users/me/.local/bin/${kind}`,
  version: state === 'missing' ? null : '1.0.0',
  reason: null,
  state,
  ...toolFlags(state),
  plan: null,
  email: null
})
const read = (claude: ToolState, codex: ToolState): ToolEvent => ({ type: 'tools', tools: [tool('claude', claude), tool('codex', codex)] })
const p = (t: ToolKind, step: InstallProgress['step'], status: InstallProgress['status'], reason?: string): ToolEvent => ({ type: 'progress', progress: { tool: t, step, status, reason } })
const run = (events: ToolEvent[], start: ToolMachine = toolStart()) => events.reduce(toolReducer, start)

describe('the status states', () => {
  it('maps each state to the state of the same name, for the writing tool', () => {
    for (const state of ['missing', 'too_old', 'cant_tell', 'signed_out', 'api_key', 'free_plan', 'ready'] as const) {
      expect(phaseOf(run([read(state, 'missing')]))).toBe(state)
    }
  })

  it('reads as checking until the first read comes', () => {
    expect(phaseOf(toolStart())).toBe('cant_tell')
    expect(writerOf(toolStart())).toBe('claude')
    expect(writerStatus(toolStart())).toBeUndefined()
  })
})

describe('the writing tool', () => {
  it('is pickTool’s: the first ready one, Claude Code before Codex', () => {
    expect(writerOf(run([read('signed_out', 'ready')]))).toBe('codex')
    expect(writerOf(run([read('ready', 'ready')]))).toBe('claude')
    expect(writerOf(run([read('missing', 'signed_out')]))).toBe('codex')
    expect(writerOf(run([read('missing', 'missing')]))).toBe('claude')
  })

  it('is the one chosen (a saved primary_tool, or Use Codex instead) while it is on this Mac', () => {
    expect(writerOf(run([read('cant_tell', 'ready')], toolStart('claude')))).toBe('claude')
    expect(writerOf(run([read('missing', 'ready')], toolStart('claude')))).toBe('codex')
    expect(writerOf(run([read('cant_tell', 'ready'), { type: 'use', kind: 'codex' }], toolStart('claude')))).toBe('codex')
  })

  it('is the first one picked', () => {
    expect(writerOf(run([read('missing', 'missing'), { type: 'pick', kinds: ['codex'] }]))).toBe('codex')
    expect(writerOf(run([read('missing', 'missing'), { type: 'pick', kinds: ['claude', 'codex'] }]))).toBe('claude')
  })

  it('has a checking tool only when the other one is ready too', () => {
    expect(checkerOf(run([read('ready', 'ready')]))).toBe('codex')
    expect(checkerOf(run([read('ready', 'signed_out')]))).toBeNull()
    expect(checkerOf(run([read('missing', 'ready')]))).toBeNull()
  })
})

describe('the Install button', () => {
  it('installs, then signs in, then is ready once the run ends with the tool ready', () => {
    let m = run([read('missing', 'missing'), { type: 'pick', kinds: ['claude'] }])
    expect(phaseOf(m)).toBe('installing')
    m = run([p('claude', 'install', 'downloading'), p('claude', 'install', 'installing'), p('claude', 'install', 'installed')], m)
    expect(phaseOf(m)).toBe('installing')
    expect(m.installed).toEqual(['claude'])
    m = toolReducer(m, p('claude', 'signIn', 'opening_browser'))
    expect(phaseOf(m)).toBe('signing_in')
    expect(signInWait(m)).toBe('waiting')
    m = run([p('claude', 'signIn', 'slow')], m)
    expect(signInWait(m)).toBe('slow')
    m = run([p('claude', 'signIn', 'stuck')], m)
    expect(signInWait(m)).toBe('stuck')
    m = run([p('claude', 'signIn', 'done'), read('ready', 'missing')], m)
    // Still the run's until it answers.
    expect(phaseOf(m)).toBe('signing_in')
    expect(signInWait(m)).toBeNull()
    m = toolReducer(m, { type: 'result', result: { outcome: 'done' } })
    expect(phaseOf(m)).toBe('ready')
    expect(signInWait(m)).toBeNull()
  })

  it('starts as a sign-in for a tool that is already installed', () => {
    expect(phaseOf(run([read('signed_out', 'missing'), { type: 'pick', kinds: ['claude'] }]))).toBe('signing_in')
    expect(phaseOf(run([read('too_old', 'missing'), { type: 'pick', kinds: ['claude'] }]))).toBe('installing')
    expect(signInWait(run([read('too_old', 'missing'), { type: 'pick', kinds: ['claude'] }]))).toBeNull()
  })

  it('fails with the message’s reason, or the step’s own words when it gives none', () => {
    const base = run([read('missing', 'missing'), { type: 'pick', kinds: ['claude'] }])
    let m = run([p('claude', 'install', 'failed', 'The download failed.')], base)
    expect(phaseOf(m)).toBe('failed')
    m = toolReducer(m, { type: 'result', result: { outcome: 'failed' } })
    expect(m.failure).toBe('The download failed.')
    expect(phaseOf(m)).toBe('failed')
    expect(run([p('claude', 'install', 'blocked')], base).failure).toBe(FAILURES.download)
    expect(run([p('claude', 'signIn', 'failed')], base).failure).toBe(FAILURES.signIn)
    expect(toolReducer(base, { type: 'result', result: { outcome: 'blocked' } }).failure).toBe(FAILURES.signIn)
    // Try again clears it.
    expect(phaseOf(toolReducer(m, { type: 'retry' }))).toBe('missing')
  })

  it('ignores another tool’s messages, messages outside a run, and a second answer', () => {
    const base = run([read('missing', 'missing'), { type: 'pick', kinds: ['codex'] }])
    expect(toolReducer(base, p('claude', 'install', 'downloading'))).toBe(base)
    const idle = run([read('missing', 'missing')])
    expect(toolReducer(idle, p('claude', 'install', 'downloading'))).toBe(idle)
    expect(toolReducer(idle, { type: 'result', result: { outcome: 'done' } })).toBe(idle)
  })

  it('is refused after a fresh off: the paste command from then on', () => {
    const m = run([read('missing', 'missing'), { type: 'pick', kinds: ['claude'] }, { type: 'result', result: { outcome: 'refused', why: 'switch_off' } }])
    expect(m.refused).toBe(true)
    expect(m.running).toBe(false)
    expect(phaseOf(m)).toBe('missing')
  })

  it('a cancelled sign-in goes back to what the status reads', () => {
    const m = run([read('signed_out', 'missing'), { type: 'pick', kinds: ['claude'] }, p('claude', 'signIn', 'cancelled'), { type: 'result', result: { outcome: 'cancelled' } }])
    expect(phaseOf(m)).toBe('signed_out')
  })

  it('counts an install only once for the data sentence', () => {
    const m = run([read('missing', 'missing'), { type: 'pick', kinds: ['claude'] }, p('claude', 'install', 'downloading'), p('claude', 'install', 'downloading')])
    expect(m.installed).toEqual(['claude'])
  })
})

describe('the paste command', () => {
  it('waits on the copied command until the tool is ready', () => {
    let m = run([read('missing', 'missing'), { type: 'copied', kinds: ['claude'] }])
    expect(waitsOnPaste(m)).toBe(true)
    expect(phaseOf(m)).toBe('missing')
    m = toolReducer(m, read('ready', 'missing'))
    expect(waitsOnPaste(m)).toBe(false)
    expect(phaseOf(m)).toBe('ready')
  })

  it('a ready tool is ready even after a failure', () => {
    const m = run([read('missing', 'missing'), { type: 'pick', kinds: ['claude'] }, p('claude', 'install', 'failed'), { type: 'result', result: { outcome: 'failed' } }, read('ready', 'missing')])
    expect(phaseOf(m)).toBe('ready')
  })
})
