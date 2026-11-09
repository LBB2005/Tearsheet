// The setup screen's words (first-run design item 32).

import { describe, expect, it } from 'vitest'

import { toolFlags, type ToolStatus } from '../../shared/tools'
import { checkText, dataSentence, fixLabel, planLabel, progressWords, signedInAs, signingWords, stateSentence, TOOL_TEXT, WORDS } from './words'

const claude = (over: Partial<ToolStatus> = {}): ToolStatus => ({ kind: 'claude', name: 'Claude Code', path: '/x/claude', version: '2.1.317', reason: null, state: 'ready', ...toolFlags('ready'), plan: 'max', email: 'you@example.com', ...over })

describe('the tool words', () => {
  it('names the plan, and who the tool is signed in as', () => {
    expect(planLabel({ kind: 'claude', plan: 'max' })).toBe('Claude Max')
    expect(planLabel({ kind: 'claude', plan: 'pro' })).toBe('Claude Pro')
    expect(planLabel({ kind: 'claude', plan: null })).toBe('Claude plan')
    expect(planLabel({ kind: 'codex', plan: 'plus' })).toBe('ChatGPT plan')
    expect(signedInAs(claude())).toBe('Signed in as you@example.com, Claude Max')
    expect(signedInAs(claude({ email: null }))).toBe('Signed in, Claude Max')
    expect(signedInAs({ ...claude(), kind: 'codex' })).toBe('Signed in with ChatGPT')
    expect(checkText('{t} on your {p}', TOOL_TEXT.codex)).toBe('Codex on your ChatGPT plan')
  })

  it('says each state, from the shared sentences where there is one', () => {
    expect(stateSentence('claude', 'signed_out')).toBe('Claude Code is signed out.')
    expect(stateSentence('claude', 'missing')).toBe('Not set up yet')
    expect(stateSentence('codex', 'cant_tell')).toBe('Checking your Codex sign-in…')
    expect(stateSentence('codex', 'free_plan')).toBe('Codex needs a paid ChatGPT plan, like Plus or Pro.')
    expect(stateSentence('codex', 'too_old')).toBe('This Codex is too old for Tearsheet.')
    expect(stateSentence('codex', 'ready')).toBe('Codex is connected.')
  })

  it('gives each state that has a fix its one button, and none to the rest', () => {
    expect(fixLabel('claude', 'too_old')).toBe('Update Claude Code')
    expect(fixLabel('codex', 'api_key')).toBe('Sign in with ChatGPT')
    expect(fixLabel('claude', 'cant_tell')).toBeNull()
    expect(fixLabel('claude', 'ready')).toBeNull()
  })

  it('says each step of the Install button, and a failure in its own words', () => {
    expect(progressWords({ tool: 'codex', step: 'install', status: 'downloading' })).toBe('Downloading the Codex installer from chatgpt.com')
    expect(progressWords({ tool: 'claude', step: 'signIn', status: 'stuck' })).toBe('Waiting for you to sign in to Claude, in your browser')
    expect(progressWords({ tool: 'claude', step: 'install', status: 'failed', reason: 'The download failed.' })).toBe('The download failed.')
    expect(progressWords({ tool: 'claude', step: 'install', status: 'blocked' })).toBe('The download failed.')
    expect(progressWords({ tool: 'claude', step: 'signIn', status: 'failed' })).toBe("The sign-in didn’t finish.")
    expect(signingWords(['claude', 'codex'])).toBe('Waiting for you to sign in to Claude, then ChatGPT, in your browser.')
  })
})

describe('the data sentence', () => {
  it('for one tool: the AI maker, SEC, Massive, iShares and GitHub', () => {
    const s = dataSentence({ writer: 'codex', checker: null, installed: [], news: false })
    for (const part of ['Codex writes each report on your ChatGPT plan, so OpenAI', 'SEC gets your email', 'Massive and FRED get your keys', 'GitHub', '~/.codex/AGENTS.md']) expect(s).toContain(part)
    // The S&P 500 list ships with Tearsheet; iShares is no longer contacted.
    expect(s).not.toContain('iShares')
    expect(s).not.toContain('Anthropic')
    expect(s).not.toContain('came from')
    expect(s).not.toContain('news')
  })

  it('for both tools, after Install both, with the news setting on', () => {
    const s = dataSentence({ writer: 'claude', checker: 'codex', installed: ['codex', 'claude'], news: true })
    expect(s).toContain('so Anthropic gets')
    expect(s).toContain('so OpenAI sees the drafts too')
    expect(s).toContain('The install scripts came from claude.ai and chatgpt.com.')
    expect(s).toContain('The news sites on the allowlist')
    expect(s).toContain('~/.codex/AGENTS.md')
    expect(dataSentence({ writer: 'claude', checker: null, installed: [], news: false })).not.toContain('AGENTS.md')
  })
})

describe('the install line', () => {
  it('says the Install button runs each maker’s official installer, and from where', () => {
    expect(WORDS.connectFine).toContain('official installer from Anthropic (claude.ai) or OpenAI (chatgpt.com)')
  })
})
