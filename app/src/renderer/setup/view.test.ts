// screenView (first-run design item 31): each tool state's card and AI row, the other rows'
// actions, Start and its reason, where the focus goes, and the safety chip.

import { describe, expect, it } from 'vitest'

import type { InstallProgress } from '../../shared/install'
import { toolFlags, type ToolKind, type ToolState, type ToolStatus } from '../../shared/tools'
import { emailReducer, emailStart, type EmailEvent } from './state/email'
import { safetyStarted } from './state/safety'
import { toolReducer, toolStart, type ToolEvent, type ToolMachine } from './state/tool'
import { screenView, type FocusInput, type KeyState, type SafetyInput } from './view'

const tool = (kind: ToolKind, state: ToolState, over: Partial<ToolStatus> = {}): ToolStatus => ({
  kind,
  name: kind === 'claude' ? 'Claude Code' : 'Codex',
  path: state === 'missing' ? null : `/Users/me/.local/bin/${kind}`,
  version: state === 'missing' ? null : kind === 'claude' ? '2.1.317 (Claude Code)' : 'codex-cli 0.165.0',
  reason: null,
  state,
  ...toolFlags(state),
  plan: kind === 'claude' && state === 'ready' ? 'max' : null,
  email: kind === 'claude' && state === 'ready' ? 'you@example.com' : null,
  ...over
})
const machine = (claude: ToolState, codex: ToolState, events: ToolEvent[] = []): ToolMachine =>
  [{ type: 'tools', tools: [tool('claude', claude), tool('codex', codex)] } as ToolEvent, ...events].reduce(toolReducer, toolStart())
const p = (t: ToolKind, step: InstallProgress['step'], status: InstallProgress['status'], reason?: string): ToolEvent => ({ type: 'progress', progress: { tool: t, step, status, reason } })
const email = (...events: EmailEvent[]) => events.reduce(emailReducer, emailStart())
const SAFETY: SafetyInput = { state: null, alreadyPassed: false, startError: null, started: false }
const FOCUS: FocusInput = { backFromMassive: false, elsewhere: false }

function view(m: ToolMachine, o: { key?: KeyState; email?: ReturnType<typeof email>; buttonOn?: boolean; long?: boolean; blocked?: Partial<Record<ToolKind, string>>; safety?: SafetyInput; focus?: FocusInput; news?: boolean } = {}) {
  return screenView({ machine: m, waitedLong: o.long ?? false, blocked: o.blocked ?? {} }, o.key ?? 'missing', o.email ?? email(), o.safety ?? SAFETY, o.focus ?? FOCUS, o.buttonOn ?? true, o.news ?? false)
}

describe('each tool state’s card and AI row', () => {
  it('missing: the Install buttons, or the paste command when the button is off', () => {
    const v = view(machine('missing', 'missing'))
    expect(v.card).toBe('connect')
    expect(v.connect).toEqual({ kind: 'pick', mode: 'button' })
    expect(v.rows.ai).toMatchObject({ tone: 'cur', icon: 'num', words: 'Not set up yet', actions: [] })
    expect(view(machine('missing', 'missing'), { buttonOn: false }).connect).toEqual({ kind: 'pick', mode: 'paste' })
    expect(view(machine('missing', 'missing', [{ type: 'pick', kinds: ['claude'] }, { type: 'result', result: { outcome: 'refused' } }])).connect).toEqual({ kind: 'pick', mode: 'paste' })
    expect(v.start).toEqual({ enabled: false, reason: 'Waiting for Claude Code or Codex' })
  })

  it('missing, after the copy to Terminal worked: the key card, and "Waiting for Claude Code" with Show the command again', () => {
    const v = view(machine('missing', 'missing', [{ type: 'copied', kinds: ['claude'] }]), { buttonOn: false })
    expect(v.card).toBe('key')
    expect(v.rows.ai).toMatchObject({ tone: '', icon: 'busy', words: 'Waiting for Claude Code', actions: ['show_command'] })
    expect(v.keyStep).toBe('While Claude Code signs in')
    expect(v.start.reason).toBe('Waiting for Claude Code to sign in')
  })

  it('installing: the connect card with the progress words, which the AI row says too', () => {
    const v = view(machine('missing', 'missing', [{ type: 'pick', kinds: ['claude', 'codex'] }, p('claude', 'install', 'downloading'), p('claude', 'install', 'installing')]))
    expect(v.card).toBe('connect')
    expect(v.connect).toEqual({ kind: 'progress', title: 'Installing Claude Code and Codex', lines: ['Downloading the Claude Code installer from claude.ai', 'Installing Claude Code'] })
    expect(v.rows.ai).toMatchObject({ icon: 'busy', words: 'Installing Claude Code' })
    expect(view(machine('missing', 'missing', [{ type: 'pick', kinds: ['codex'] }])).rows.ai.words).toBe('Installing Codex')
  })

  it('signing in: the card moves on; the row offers Stop, then the sign-in page at slow, and the paste command at stuck', () => {
    let m = machine('missing', 'missing', [{ type: 'pick', kinds: ['claude'] }, p('claude', 'signIn', 'opening_browser')])
    let v = view(m)
    expect(v.card).toBe('key')
    expect(v.rows.ai).toMatchObject({ words: 'Waiting for you to sign in, in your browser.', actions: ['stop_sign_in'] })
    m = toolReducer(m, p('claude', 'signIn', 'slow'))
    expect(view(m).rows.ai.actions).toEqual(['stop_sign_in', 'open_sign_in'])
    m = toolReducer(m, p('claude', 'signIn', 'stuck'))
    v = view(m, { key: 'works' })
    expect(v.rows.ai.actions).toEqual(['stop_sign_in', 'open_sign_in', 'paste'])
    expect(v.card).toBe('finish')
    expect(v.start).toEqual({ enabled: false, reason: 'Waiting for Claude Code to sign in' })
  })

  it('signed out, too old, an API key and a free plan: the CUJ 5 sentence and its one button, or the paste command', () => {
    const cases: [ToolKind, ToolState, string, string][] = [
      ['claude', 'signed_out', 'Claude Code is signed out.', 'Sign in to Claude Code'],
      ['claude', 'too_old', 'This Claude Code is too old for Tearsheet.', 'Update Claude Code'],
      ['claude', 'api_key', 'This sign-in uses an API key. Tearsheet runs on your Claude plan.', 'Sign in with your Claude account'],
      ['claude', 'free_plan', 'Claude Code needs a paid Claude plan, like Pro or Max.', 'Sign in again'],
      ['codex', 'signed_out', 'Codex is signed out.', 'Sign in to Codex'],
      ['codex', 'api_key', "This Codex sign-in doesn’t use your ChatGPT plan. Signing in with ChatGPT replaces it for all your Codex use, not only Tearsheet’s.", 'Sign in with ChatGPT']
    ]
    for (const [kind, state, sentence, button] of cases) {
      const m = kind === 'claude' ? machine(state, 'missing') : machine('missing', state)
      const v = view(m)
      expect(v.card).toBe('connect')
      expect(v.connect).toEqual({ kind: 'fix', tool: kind, state, sentence, button, mode: 'button' })
      expect(v.rows.ai).toMatchObject({ icon: 'num', words: sentence })
      expect(view(m, { buttonOn: false }).connect).toMatchObject({ button: 'Copy and open Terminal', mode: 'paste' })
    }
  })

  it('too old, installed another way: the reason, and no button', () => {
    const reason = 'This Claude Code was installed another way (/opt/homebrew/bin). Update it the way you installed it.'
    const v = view(machine('too_old', 'missing'), { blocked: { claude: reason } })
    expect(v.connect).toMatchObject({ kind: 'fix', sentence: reason, button: null })
    expect(v.rows.ai.words).toBe(reason)
  })

  it('can’t tell: checking, then after 2 minutes what was found, and the other tool when it is ready', () => {
    const m = [{ type: 'tools', tools: [tool('claude', 'cant_tell'), tool('codex', 'ready')] } as ToolEvent].reduce(toolReducer, toolStart('claude'))
    let v = view(m)
    expect(v.card).toBe('connect')
    expect(v.connect).toMatchObject({ kind: 'checking', tool: 'claude', sentence: 'Checking your Claude sign-in…', long: false, other: 'codex' })
    expect(v.rows.ai).toMatchObject({ icon: 'busy', words: 'Checking…', actions: [] })
    v = view(m, { long: true })
    expect(v.connect).toMatchObject({ long: true, found: { path: '/Users/me/.local/bin/claude' } })
    expect(view(machine('cant_tell', 'signed_out')).connect).toMatchObject({ other: null })
    // Before the first read.
    expect(view(toolStart()).connect).toMatchObject({ kind: 'checking', found: null })
  })

  it('failed: the reason, Try again and the paste command', () => {
    const m = machine('missing', 'missing', [{ type: 'pick', kinds: ['codex'] }, p('codex', 'install', 'failed', 'The download failed.'), { type: 'result', result: { outcome: 'failed' } }])
    const v = view(m)
    expect(v.connect).toEqual({ kind: 'failed', reason: 'The download failed.', kinds: ['codex'], mode: 'button' })
    expect(v.rows.ai.words).toBe('The download failed.')
  })

  it('ready: the key card until the key works, then the finish; the Connected lines, two with both tools', () => {
    let v = view(machine('ready', 'missing'))
    expect(v.card).toBe('key')
    expect(v.keyStep).toBe('Step 2 of 3')
    expect(v.rows.ai).toMatchObject({ tone: 'done', icon: 'done', words: null })
    expect(v.rows.ai.connected).toEqual([{ kind: 'claude', name: 'Claude Code', account: 'Signed in as you@example.com, Claude Max · 2.1.317', role: null }])
    v = view(machine('ready', 'ready'), { key: 'saved' })
    expect(v.card).toBe('finish')
    expect(v.rows.ai.connected).toEqual([
      { kind: 'claude', name: 'Claude Code', account: 'Signed in as you@example.com, Claude Max · 2.1.317', role: 'writes your reports' },
      { kind: 'codex', name: 'Codex', account: 'Signed in with ChatGPT · 0.165.0', role: 'checks each draft' }
    ])
    expect(v.finish.data).toContain('Codex checks each draft on your ChatGPT plan')
    // No version read: the account alone.
    const noVersion = [{ type: 'tools', tools: [tool('claude', 'ready', { version: null }), tool('codex', 'missing')] } as ToolEvent].reduce(toolReducer, toolStart())
    expect(view(noVersion).rows.ai.connected[0].account).toBe('Signed in as you@example.com, Claude Max')
  })
})

describe('the other rows', () => {
  it('the price key: missing, works or saved, with Use another key once it is in', () => {
    const m = machine('ready', 'missing')
    expect(view(m).rows.key).toEqual({ tone: 'cur', icon: 'num', words: 'A free key from Massive', actions: [] })
    expect(view(machine('missing', 'missing')).rows.key.tone).toBe('later')
    expect(view(m, { key: 'works' }).rows.key).toEqual({ tone: 'done', icon: 'done', words: 'Massive key works', actions: ['other_key'] })
    expect(view(m, { key: 'saved' }).rows.key.words).toBe('Massive key saved')
  })

  it('the email: where it fills in from, the suggestion, a typed one, and Change', () => {
    expect(view(machine('ready', 'missing')).rows.email).toEqual({ tone: 'later', icon: 'num', words: 'Fills in from your Claude sign-in', actions: [] })
    expect(view(machine('missing', 'ready')).rows.email.words).toBe('Codex doesn’t share one, so you type it')
    const suggested = view(machine('ready', 'missing'), { email: email({ type: 'suggest', email: 'you@example.com' }) })
    expect(suggested.rows.email).toEqual({ tone: 'done', icon: 'done', words: 'you@example.com, from your Claude sign-in', actions: ['change'] })
    const typed = view(machine('ready', 'missing'), { key: 'works', email: email({ type: 'type', value: 'me@x' }) })
    expect(typed.rows.email).toEqual({ tone: 'cur', icon: 'num', words: 'Fills in from your Claude sign-in', actions: ['change'] })
    expect(view(machine('ready', 'missing'), { email: email({ type: 'saved', email: 'saved@x.com' }) }).rows.email.words).toBe('saved@x.com')
  })
})

describe('Start', () => {
  it('needs the tool ready, the key and an email, and says which is missing', () => {
    const m = machine('ready', 'missing')
    expect(view(m).start).toEqual({ enabled: false, reason: 'Waiting for your Massive key' })
    expect(view(m, { key: 'works' }).start).toEqual({ enabled: false, reason: 'Add your email' })
    const ok = view(m, { key: 'works', email: email({ type: 'suggest', email: 'you@example.com' }) })
    expect(ok.start).toEqual({ enabled: true, reason: 'Ready when you are' })
    expect(ok.finish.title).toBe('You’re ready')
    expect(view(m, { key: 'works', email: email({ type: 'type', value: 'me@x.com' }) }).finish).toMatchObject({ title: 'Last thing: your email', emailFixed: false })
    expect(view(m, { key: 'works', email: email({ type: 'type', value: 'me@x.com' }, { type: 'refused', problem: 'No.' }) }).start).toEqual({ enabled: false, reason: 'Add your email' })
  })

  it('says where data goes, with the install scripts only when Install ran, and the news sites only when the setting is on', () => {
    const m = machine('ready', 'missing', [{ type: 'pick', kinds: ['claude'] }, p('claude', 'install', 'downloading'), { type: 'result', result: { outcome: 'done' } }])
    const data = view(m, { key: 'works' }).finish.data
    expect(data).toContain('Anthropic')
    expect(data).toContain('The install script came from claude.ai.')
    expect(data).not.toContain('news sites')
    expect(view(machine('ready', 'missing'), { news: true }).finish.data).toContain('The news sites on the allowlist')
  })
})

describe('focus', () => {
  it('goes to the key field back from massive.com, unless something else was focused', () => {
    const m = machine('ready', 'missing')
    expect(view(m).focus).toBeNull()
    expect(view(m, { focus: { backFromMassive: true, elsewhere: false } }).focus).toBe('key')
    expect(view(m, { focus: { backFromMassive: true, elsewhere: true } }).focus).toBeNull()
  })

  it('goes to the email field once the key works, if it is empty or being changed', () => {
    const m = machine('ready', 'missing')
    expect(view(m, { key: 'works' }).focus).toBe('email')
    expect(view(m, { key: 'works', email: email({ type: 'suggest', email: 'you@example.com' }) }).focus).toBeNull()
    expect(view(m, { key: 'works', email: email({ type: 'suggest', email: 'you@example.com' }, { type: 'change' }) }).focus).toBe('email')
    expect(view(m, { key: 'works', email: email({ type: 'type', value: 'me@x.com' }) }).focus).toBeNull()
  })
})

describe('the safety chip', () => {
  it('shows once a check was asked for, has passed before, couldn’t start, or runs for the writing tool', () => {
    const m = machine('ready', 'missing')
    expect(view(m).chip).toBeNull()
    expect(view(m, { safety: { ...SAFETY, started: true } }).chip).toEqual({ state: 'running', n: 0, total: 25, stopping: false, startedAt: null })
    expect(view(m, { safety: { ...SAFETY, alreadyPassed: true } }).chip).toEqual({ state: 'passed' })
    expect(view(m, { safety: { ...SAFETY, startError: 'No.' } }).chip).toEqual({ state: 'failed', reason: 'No.' })
    expect(view(m, { safety: { ...SAFETY, state: { ...safetyStarted('claude', 5), n: 3 } } }).chip).toMatchObject({ state: 'running', n: 3 })
    expect(view(m, { safety: { ...SAFETY, state: safetyStarted('codex', 5) } }).chip).toBeNull()
  })
})
