// The one-screen setup (first-run design §4, item 35), on the fake bridge: every journey from CUJ
// 1 to CUJ 4b with its click count, with the Install button on and off, then the rest of item
// 35's list. Clicks are counted as Goal 1 counts them: every click in the window, including the
// click that brings it back to the front, which is modelled as one click on the control under the
// pointer. Keys (⌘V, Return) and typing don't count. What happens outside the window (the browser,
// Terminal) is the main process's messages: install_progress, tools_changed and install()'s answer.

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { ToolStatus } from '../../preload/api'
import type { SettingsResult } from '../../shared/protocol'
import type { ToolKind } from '../../shared/tools'
import { renderApp, win } from '../test/app'
import { BOTH, bridge, CLAUDE, CODEX, emit, endInstall, fail, freshSettings, line, lineItem, NEITHER, ok, progress, tools } from '../test/bridge'

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => {
  vi.useRealTimers()
})

// ---------- helpers ----------

async function open(found: ToolStatus[], opts: { buttonOn?: boolean; over?: Partial<SettingsResult> } = {}) {
  bridge.getSettings.mockResolvedValue(ok(freshSettings(opts.over ?? {})))
  bridge.getTools.mockResolvedValue(found)
  bridge.getInstallButton.mockResolvedValue(opts.buttonOn ?? true)
  const app = await renderApp({ advanceTimers: vi.advanceTimersByTime })
  await screen.findByRole('group', { name: 'Your AI' })
  await act(() => vi.advanceTimersByTimeAsync(0))
  return app
}

const row = (name: 'Your AI' | 'Price key' | 'SEC email') => within(screen.getByRole('group', { name }))
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const card = (name: string) => screen.findByRole('region', { name })
const keyField = () => screen.getByLabelText('Your Massive key')
const emailField = () => screen.getByLabelText('Your email for SEC')
const dataSentence = () => document.querySelector('.setup .data')?.textContent ?? ''
const NAME: Record<ToolKind, string> = { claude: 'Claude Code', codex: 'Codex' }
const MAKER: Record<ToolKind, string> = { claude: 'Anthropic', codex: 'OpenAI' }
const SITE: Record<ToolKind, string> = { claude: 'claude.ai', codex: 'chatgpt.com' }

type User = Awaited<ReturnType<typeof open>>['user']

// The price key: Get a free key, back from massive.com onto the key field, ⌘V. Two clicks.
async function addKey(user: User) {
  await user.click(button('Get a free key'))
  expect(bridge.openExternal).toHaveBeenLastCalledWith('https://massive.com')
  await user.click(keyField())
  await user.paste('mk-123')
  expect(bridge.checkKey).toHaveBeenLastCalledWith('massive', 'mk-123')
  await card('Your email, then Start')
}

// Goal 6: what shows before Start.
function shownBeforeStart(o: { writer: ToolKind; account: RegExp; email: string; checker?: ToolKind; installed?: ToolKind[] }) {
  expect(row('Your AI').getByText(o.account)).toBeInTheDocument()
  if (o.checker) {
    expect(row('Your AI').getByText('writes your reports')).toBeInTheDocument()
    expect(row('Your AI').getByText('checks each draft')).toBeInTheDocument()
  }
  expect(row('SEC email').getByText(new RegExp(`^${o.email.replace(/[.]/g, '\\.')}`))).toBeInTheDocument()
  const data = dataSentence()
  expect(data).toContain(`${NAME[o.writer]} writes each report`)
  expect(data).toContain(MAKER[o.writer])
  if (o.checker) expect(data).toContain(MAKER[o.checker])
  for (const service of ['SEC gets your email with each filing download', 'Massive', 'FRED', 'GitHub']) expect(data).toContain(service)
  expect(data).not.toContain('iShares')
  const sites = (o.installed ?? []).map((k) => SITE[k])
  if (sites.length) expect(data).toContain(`came from ${sites.join(' and ')}`)
  else expect(data).not.toContain('came from')
  expect(data).not.toContain('news sites')
}

// Start: the tool and the email, then setup_done last; Home opens with its field focused.
async function startTearsheet(user: User, writer: ToolKind, email: string) {
  await user.click(button('Start Tearsheet'))
  await screen.findByRole('heading', { name: 'Which company today?' })
  const saved = bridge.setSetting.mock.calls
  expect(saved).toEqual([
    ['primary_tool', writer],
    ['sec_contact_email', email],
    ['setup_done', '1']
  ])
  expect(win()).toHaveClass('on-home')
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Look up a company' })).toHaveFocus())
}

// Goal 10: with the button on, no journey asks for Terminal unless a step fails.
function noTerminal() {
  expect(bridge.copyAndOpenTerminal).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: /Copy and open Terminal/ })).toBeNull()
}

// The Install button's run for these tools, as the main process sends it: every install first,
// then each sign-in; `between` runs after the first sign-in, before the next.
async function installRun(kinds: ToolKind[], missing: boolean, between?: () => Promise<void>) {
  if (missing) {
    for (const k of kinds) {
      progress(k, 'install', 'downloading')
      progress(k, 'install', 'installing')
      progress(k, 'install', 'installed')
    }
  }
  for (const [i, k] of kinds.entries()) {
    progress(k, 'signIn', 'opening_browser')
    if (i === 0) {
      await card('Your price key')
      expect(bridge.runSafetyCheck).not.toHaveBeenCalled()
    }
    progress(k, 'signIn', 'done')
    const signedIn = kinds.slice(0, i + 1)
    emit('tools_changed', { tools: tools(signedIn.includes('claude') ? 'ready' : kinds.includes('claude') ? 'signed_out' : 'missing', signedIn.includes('codex') ? 'ready' : kinds.includes('codex') ? 'signed_out' : 'missing') })
    if (i === 0 && between) await between()
  }
  await endInstall({ outcome: 'done' })
}

// ---------- the journeys ----------

describe.each([
  ['on', true],
  ['off', false]
])('the journeys, with the button %s', (_, buttonOn) => {
  test('CUJ 1: Claude Code already set up, in 3 clicks', async () => {
    const { user, clicks } = await open([CLAUDE.ready, CODEX.missing], { buttonOn })
    // Found by itself: no click yet, and no AI call before the first click (Goal 5).
    expect(row('Your AI').getByText('Connected')).toBeInTheDocument()
    expect(row('Your AI').getByText('Signed in as you@example.com, Claude Max · 2.1.317')).toBeInTheDocument()
    expect(row('SEC email').getByText('you@example.com, from your Claude sign-in')).toBeInTheDocument()
    expect(await card('Your price key')).toHaveTextContent('Step 2 of 3')
    await act(() => vi.advanceTimersByTimeAsync(5000))
    expect(bridge.runSafetyCheck).not.toHaveBeenCalled()
    expect(bridge.windowState).toHaveBeenLastCalledWith({ waiting: false })

    await addKey(user)
    // The first click was the go-ahead for the safety check.
    expect(bridge.runSafetyCheck).toHaveBeenCalledWith('claude')
    expect(row('Price key').getByText('Massive key works')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'You’re ready' })).toBeInTheDocument()
    expect(screen.getByText(/SEC will see/)).toHaveTextContent('SEC will see you@example.com, from your Claude sign-in, with each filing download. No one else gets it.')
    shownBeforeStart({ writer: 'claude', account: /Signed in as you@example.com, Claude Max/, email: 'you@example.com' })
    expect(button('Start Tearsheet')).toHaveClass('ready')
    noTerminal()
    await startTearsheet(user, 'claude', 'you@example.com')
    expect(clicks.count()).toBeLessThanOrEqual(3)
    expect(clicks.count()).toBe(3)
  })

  test('both already set up, in 3 clicks: Claude Code writes and Codex checks each draft', async () => {
    const { user, clicks } = await open(BOTH, { buttonOn })
    await addKey(user)
    shownBeforeStart({ writer: 'claude', account: /Signed in as you@example.com/, email: 'you@example.com', checker: 'codex' })
    expect(row('Your AI').getByText('Signed in with ChatGPT · 0.165.0')).toBeInTheDocument()
    await startTearsheet(user, 'claude', 'you@example.com')
    expect(bridge.runSafetyCheck).toHaveBeenCalledTimes(1)
    expect(clicks.count()).toBe(3)
  })

  test('CUJ 3: only Codex, already set up, in 3 clicks plus typing the email', async () => {
    const { user, clicks } = await open([CLAUDE.missing, CODEX.ready], { buttonOn })
    // Codex is picked by itself, and Claude Code is never said to be missing.
    expect(row('Your AI').getByText('Codex')).toBeInTheDocument()
    expect(within(document.querySelector('.setup') as HTMLElement).queryByText(/Claude Code/)).toBeNull()
    expect(screen.queryByText('Not set up yet')).toBeNull()
    expect(row('SEC email').getByText('Codex doesn’t share one, so you type it')).toBeInTheDocument()
    await addKey(user)
    // Once the key works, the email field takes the focus: type it, and Return presses Start.
    expect(screen.getByRole('heading', { name: 'Last thing: your email' })).toBeInTheDocument()
    expect(emailField()).toHaveFocus()
    expect(button('Start Tearsheet')).toBeDisabled()
    expect(screen.getByText('Add your email')).toBeInTheDocument()
    await user.keyboard('you@example.com')
    shownBeforeStart({ writer: 'codex', account: /Signed in with ChatGPT/, email: 'you@example.com' })
    expect(bridge.runSafetyCheck).toHaveBeenCalledWith('codex')
    await startTearsheet(user, 'codex', 'you@example.com')
    expect(clicks.count()).toBe(3)
  })

  test('CUJ 2: a brand-new Mac with a Claude plan, in 4 clicks', async () => {
    const { user, clicks } = await open(NEITHER, { buttonOn })
    expect(row('Your AI').getByText('Not set up yet')).toBeInTheDocument()
    expect(await card('Connect your AI')).toHaveTextContent('Neither Claude Code nor Codex is on this Mac yet.')
    expect(bridge.windowState).toHaveBeenLastCalledWith({ waiting: true })
    if (buttonOn) {
      expect(screen.getByText('These are the commands Tearsheet runs')).toBeInTheDocument()
      await user.click(button(/^Install Claude Code/))
      expect(bridge.install).toHaveBeenCalledWith(['claude'])
      progress('claude', 'install', 'downloading')
      expect(within(await card('Connect your AI')).getByText('Downloading the Claude Code installer from claude.ai')).toBeInTheDocument()
      expect(row('Your AI').getByText('Downloading the Claude Code installer from claude.ai')).toBeInTheDocument()
      await installRun(['claude'], true)
      noTerminal()
    } else {
      expect(screen.queryByRole('button', { name: /^Install/ })).toBeNull()
      await user.click(button('Copy and open Terminal: I have a Claude plan'))
      expect(bridge.copyAndOpenTerminal).toHaveBeenCalledWith(['claude'])
      // The card moves on to the price key once the copy works.
      expect(await card('Your price key')).toHaveTextContent('While Claude Code signs in')
      expect(row('Your AI').getByText('Waiting for Claude Code')).toBeInTheDocument()
      expect(bridge.runSafetyCheck).not.toHaveBeenCalled()
      emit('tools_changed', { tools: [CLAUDE.ready, CODEX.missing] })
    }
    // The check starts only once the tool reads ready.
    await waitFor(() => expect(bridge.runSafetyCheck).toHaveBeenCalledWith('claude'))
    expect(bridge.windowState).toHaveBeenLastCalledWith({ waiting: false })
    await addKey(user)
    shownBeforeStart({ writer: 'claude', account: /Signed in as you@example.com, Claude Max/, email: 'you@example.com', installed: buttonOn ? ['claude'] : [] })
    await startTearsheet(user, 'claude', 'you@example.com')
    expect(clicks.count()).toBe(4)
  })

  test('CUJ 4: a brand-new Mac with a ChatGPT plan, in 4 clicks plus typing the email', async () => {
    const { user, clicks } = await open(NEITHER, { buttonOn })
    if (buttonOn) {
      await user.click(button(/^Install Codex/))
      expect(bridge.install).toHaveBeenCalledWith(['codex'])
      await installRun(['codex'], true)
      noTerminal()
    } else {
      await user.click(button('Copy and open Terminal: I have a ChatGPT plan'))
      expect(bridge.copyAndOpenTerminal).toHaveBeenCalledWith(['codex'])
      await card('Your price key')
      emit('tools_changed', { tools: [CLAUDE.missing, CODEX.ready] })
    }
    await addKey(user)
    expect(emailField()).toHaveFocus()
    await user.keyboard('you@example.com')
    shownBeforeStart({ writer: 'codex', account: /Signed in with ChatGPT/, email: 'you@example.com', installed: buttonOn ? ['codex'] : [] })
    await startTearsheet(user, 'codex', 'you@example.com')
    expect(clicks.count()).toBe(4)
  })

  test('CUJ 4b: a brand-new Mac with both plans, staying in the browser for both sign-ins, in 4 clicks', async () => {
    const { user, clicks } = await open(NEITHER, { buttonOn })
    if (buttonOn) {
      await user.click(button(/^Install both/))
      expect(bridge.install).toHaveBeenCalledWith(['claude', 'codex'])
      progress('claude', 'install', 'downloading')
      progress('claude', 'install', 'installed')
      progress('codex', 'install', 'downloading')
      expect(within(await card('Connect your AI')).getByText('Installing Claude Code and Codex')).toBeInTheDocument()
      progress('claude', 'signIn', 'opening_browser')
      expect(row('Your AI').getByText('Waiting for you to sign in to Claude, then ChatGPT, in your browser.')).toBeInTheDocument()
      progress('claude', 'signIn', 'done')
      emit('tools_changed', { tools: [CLAUDE.ready, CODEX.signed_out] })
      progress('codex', 'signIn', 'opening_browser')
      progress('codex', 'signIn', 'done')
      emit('tools_changed', { tools: BOTH })
      await endInstall({ outcome: 'done' })
      noTerminal()
    } else {
      await user.click(button('Copy and open Terminal: I have both plans'))
      expect(bridge.copyAndOpenTerminal).toHaveBeenCalledWith(['claude', 'codex'])
      emit('tools_changed', { tools: [CLAUDE.ready, CODEX.signed_out] })
      emit('tools_changed', { tools: BOTH })
    }
    await addKey(user)
    shownBeforeStart({ writer: 'claude', account: /Signed in as you@example.com/, email: 'you@example.com', checker: 'codex', installed: buttonOn ? ['claude', 'codex'] : [] })
    await startTearsheet(user, 'claude', 'you@example.com')
    // The first report waits only for Claude Code's check.
    expect(bridge.runSafetyCheck).toHaveBeenCalledTimes(1)
    expect(bridge.runSafetyCheck).toHaveBeenCalledWith('claude')
    expect(clicks.count()).toBe(4)
  })

  test('CUJ 4b: coming back to Tearsheet between the two sign-ins costs one more click, so 5', async () => {
    const { user, clicks } = await open(NEITHER, { buttonOn })
    const comeBack = async () => {
      // Back in the window after the Claude sign-in: a click on the control under the pointer.
      await user.click(keyField())
    }
    if (buttonOn) {
      await user.click(button(/^Install both/))
      await installRun(['claude', 'codex'], true, comeBack)
    } else {
      await user.click(button('Copy and open Terminal: I have both plans'))
      emit('tools_changed', { tools: [CLAUDE.ready, CODEX.signed_out] })
      await card('Your price key')
      await comeBack()
      emit('tools_changed', { tools: BOTH })
    }
    await addKey(user)
    shownBeforeStart({ writer: 'claude', account: /Signed in as you@example.com/, email: 'you@example.com', checker: 'codex', installed: buttonOn ? ['claude', 'codex'] : [] })
    await startTearsheet(user, 'claude', 'you@example.com')
    expect(clicks.count()).toBe(5)
  })
})

// ---------- the rest of item 35's list ----------

describe('can’t tell', () => {
  test('never shows an install or a sign-in, and after 2 minutes shows what it found, Try again, Show log and the other tool', async () => {
    const { user } = await open([CLAUDE.cant_tell, CODEX.ready], { over: { primary_tool: 'claude' } })
    expect(row('Your AI').getByText('Checking…')).toBeInTheDocument()
    const connect = within(await card('Connect your AI'))
    expect(connect.getByText('Checking your Claude sign-in…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Install|Sign in|Update|Copy and open/ })).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(119_000))
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(1_000))
    expect(screen.getByText('Tearsheet can’t tell whether Claude Code is signed in.')).toBeInTheDocument()
    expect(screen.getByText('Found Claude Code 2.1.317 in ~/.local/bin.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Install|Sign in|Update/ })).toBeNull()
    await user.click(button('Try again'))
    expect(bridge.getTools).toHaveBeenLastCalledWith(true)
    bridge.showSetupLog.mockResolvedValueOnce(false)
    await user.click(button('Show log'))
    expect(await screen.findByText('There’s no setup log yet.')).toBeInTheDocument()
    bridge.showSetupLog.mockRejectedValueOnce(new Error('no'))
    await user.click(button('Show log'))
    expect(await screen.findByText('The log didn’t open.')).toBeInTheDocument()
    await user.click(button('Use Codex instead'))
    expect(await card('Your price key')).toBeInTheDocument()
    expect(row('Your AI').getByText('Codex')).toBeInTheDocument()
  })

  test('shows no other tool when the other isn’t ready, and the first read not arriving yet reads as checking', async () => {
    bridge.getTools.mockReturnValue(new Promise(() => undefined))
    bridge.getSettings.mockResolvedValue(ok(freshSettings()))
    await renderApp({ advanceTimers: vi.advanceTimersByTime })
    expect(await screen.findByText('Checking your Claude sign-in…')).toBeInTheDocument()
    emit('tools_changed', { tools: [CLAUDE.cant_tell, CODEX.signed_out] })
    await act(() => vi.advanceTimersByTimeAsync(120_000))
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /instead$/ })).toBeNull()
  })
})

describe('each state of the tool (item 31’s table)', () => {
  const CASES: [ToolKind, 'signed_out' | 'too_old' | 'api_key' | 'free_plan', string, string][] = [
    ['claude', 'signed_out', 'Claude Code is signed out.', 'Sign in to Claude Code'],
    ['claude', 'too_old', 'This Claude Code is too old for Tearsheet.', 'Update Claude Code'],
    ['claude', 'free_plan', 'Claude Code needs a paid Claude plan, like Pro or Max.', 'Sign in again'],
    ['claude', 'api_key', 'This sign-in uses an API key. Tearsheet runs on your Claude plan.', 'Sign in with your Claude account'],
    ['codex', 'signed_out', 'Codex is signed out.', 'Sign in to Codex'],
    ['codex', 'api_key', 'This Codex sign-in doesn’t use your ChatGPT plan. Signing in with ChatGPT replaces it for all your Codex use, not only Tearsheet’s.', 'Sign in with ChatGPT']
  ]

  test.each(CASES)('%s %s: its sentence on the row and the card, and its one button', async (kind, state, sentence, label) => {
    const found = kind === 'claude' ? [CLAUDE[state], CODEX.missing] : [CLAUDE.missing, CODEX[state]]
    const { user } = await open(found)
    expect(row('Your AI').getByText(sentence)).toBeInTheDocument()
    const connect = within(await card('Connect your AI'))
    expect(connect.getByText(sentence)).toBeInTheDocument()
    // One button, and the commands it runs shown first.
    expect(screen.getAllByRole('button', { name: /^Sign in|^Update/ })).toHaveLength(1)
    expect(connect.getByText('These are the commands Tearsheet runs')).toBeInTheDocument()
    await user.click(connect.getByRole('button', { name: label }))
    expect(bridge.install).toHaveBeenCalledWith([kind])
    // A sign-in only: the card moves on to the key while the browser is open.
    if (state !== 'too_old') {
      progress(kind, 'signIn', 'opening_browser')
      expect(await card('Your price key')).toHaveTextContent(`While ${NAME[kind]} signs in`)
    } else {
      progress(kind, 'install', 'downloading')
      expect(within(await card('Connect your AI')).getByText('Installing Claude Code')).toBeInTheDocument()
    }
  })

  test.each(CASES)('%s %s with the button off: the paste command for the same steps', async (kind, state, sentence) => {
    const found = kind === 'claude' ? [CLAUDE[state], CODEX.missing] : [CLAUDE.missing, CODEX[state]]
    const { user } = await open(found, { buttonOn: false })
    const connect = within(await card('Connect your AI'))
    expect(connect.getByText(sentence)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Sign in|^Update/ })).toBeNull()
    expect(connect.getByText(`/Users/test/.local/bin/${kind}${kind === 'claude' ? ' auth login' : ' login'}`)).toBeInTheDocument()
    await user.click(connect.getByRole('button', { name: 'Copy and open Terminal' }))
    expect(bridge.copyAndOpenTerminal).toHaveBeenCalledWith([kind])
    expect(await card('Your price key')).toBeInTheDocument()
    expect(row('Your AI').getByText(`Waiting for ${NAME[kind]}`)).toBeInTheDocument()
    await user.click(row('Your AI').getByRole('button', { name: 'Show the command again' }))
    expect(screen.getByRole('button', { name: 'Copy and open Terminal again' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Copy and open Terminal again' }))
    expect(bridge.copyAndOpenTerminal).toHaveBeenCalledTimes(2)
    await user.click(row('Your AI').getByRole('button', { name: 'Hide the command' }))
    expect(screen.queryByRole('button', { name: 'Copy and open Terminal again' })).toBeNull()
  })

  test('a too-old copy installed another way gets no button, only its reason', async () => {
    const reason = 'This Claude Code was installed another way (/opt/homebrew/bin). Update it the way you installed it.'
    bridge.commandsFor.mockResolvedValue({ steps: [], blocked: [{ tool: 'claude', reason }], paste: null })
    await open([CLAUDE.too_old, CODEX.missing])
    const connect = within(await card('Connect your AI'))
    expect(await connect.findByText(reason)).toBeInTheDocument()
    expect(row('Your AI').getByText(reason)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Update|^Sign in/ })).toBeNull()
  })

  test('Codex’s sign-in is never offered when Codex is ready', async () => {
    const first = await open([CLAUDE.missing, CODEX.ready])
    expect(screen.queryByRole('button', { name: /Sign in/ })).toBeNull()
    first.unmount()
    await open([CLAUDE.ready, CODEX.ready])
    expect(screen.queryByRole('button', { name: /Sign in/ })).toBeNull()
  })

  test('signed out, Codex is offered its sign-in with no warning', async () => {
    await open([CLAUDE.missing, CODEX.signed_out])
    const connect = within(await card('Connect your AI'))
    expect(connect.getByRole('button', { name: 'Sign in to Codex' })).toBeInTheDocument()
    expect(screen.queryByText(/replaces it/)).toBeNull()
  })
})

describe('the Install button', () => {
  test('a failed download says so, with Try again and the paste command (goal 10)', async () => {
    const { user } = await open(NEITHER)
    await user.click(button(/^Install Claude Code/))
    progress('claude', 'install', 'downloading')
    noTerminal()
    progress('claude', 'install', 'failed', 'The download failed.')
    await endInstall({ outcome: 'failed' })
    const connect = within(await card('Connect your AI'))
    expect(connect.getByRole('alert')).toHaveTextContent('The download failed.')
    expect(row('Your AI').getByText('The download failed.')).toBeInTheDocument()
    expect(connect.getByText('/Users/test/.local/bin/claude auth login')).toBeInTheDocument()
    await user.click(connect.getByRole('button', { name: 'Try again' }))
    expect(bridge.install).toHaveBeenCalledTimes(2)
    progress('claude', 'install', 'blocked', 'Test settings are on, so Tearsheet won’t run the real installer.')
    await endInstall({ outcome: 'blocked' })
    expect(within(await card('Connect your AI')).getByRole('alert')).toHaveTextContent('Test settings are on')
    // The paste command: copied, the card moves on to the key.
    await user.click(within(await card('Connect your AI')).getByRole('button', { name: 'Copy and open Terminal' }))
    expect(bridge.copyAndOpenTerminal).toHaveBeenCalledWith(['claude'])
    expect(await card('Your price key')).toBeInTheDocument()
  })

  test('a run that fails with no reason, or whose call throws, still says what failed', async () => {
    const { user } = await open([CLAUDE.signed_out, CODEX.missing])
    await user.click(button('Sign in to Claude Code'))
    await endInstall({ outcome: 'failed' })
    expect(within(await card('Connect your AI')).getByRole('alert')).toHaveTextContent('The sign-in didn')
    bridge.install.mockRejectedValueOnce(new Error('gone'))
    await user.click(button('Try again'))
    expect(within(await card('Connect your AI')).getByRole('alert')).toHaveTextContent('The sign-in didn')
  })

  test('slow and stuck show their fallbacks on the AI row while the key card is up, and the paste command only at stuck', async () => {
    const { user } = await open([CLAUDE.signed_out, CODEX.missing])
    await user.click(button('Sign in to Claude Code'))
    progress('claude', 'signIn', 'opening_browser')
    await card('Your price key')
    expect(row('Your AI').getByText('Waiting for you to sign in, in your browser.')).toBeInTheDocument()
    expect(row('Your AI').queryByRole('button', { name: 'Browser didn’t open? Open the sign-in page' })).toBeNull()
    noTerminal()
    progress('claude', 'signIn', 'slow')
    await user.click(row('Your AI').getByRole('button', { name: 'Browser didn’t open? Open the sign-in page' }))
    expect(bridge.openSignInPage).toHaveBeenCalledTimes(1)
    noTerminal()
    // The key card is still up the whole time.
    expect(await card('Your price key')).toBeInTheDocument()
    progress('claude', 'signIn', 'stuck')
    expect(screen.getByText('Still waiting? Sign in from Terminal instead, where you can paste a code.')).toBeInTheDocument()
    // Copying it stops the in-app sign-in first.
    await user.click(button('Copy and open Terminal'))
    expect(bridge.cancelInstall).toHaveBeenCalledTimes(1)
    expect(bridge.copyAndOpenTerminal).toHaveBeenCalledWith(['claude'])
    expect(bridge.cancelInstall.mock.invocationCallOrder[0]).toBeLessThan(bridge.copyAndOpenTerminal.mock.invocationCallOrder[0])
    progress('claude', 'signIn', 'cancelled')
    await endInstall({ outcome: 'cancelled' })
    expect(row('Your AI').getByText('Waiting for Claude Code')).toBeInTheDocument()
    emit('tools_changed', { tools: [CLAUDE.ready, CODEX.missing] })
    expect(await row('Your AI').findByText('Connected')).toBeInTheDocument()
  })

  test('Stop signing in stops the in-app sign-in, and the card says what the status found', async () => {
    const { user } = await open([CLAUDE.signed_out, CODEX.missing])
    await user.click(button('Sign in to Claude Code'))
    progress('claude', 'signIn', 'opening_browser')
    await user.click(row('Your AI').getByRole('button', { name: 'Stop signing in' }))
    expect(bridge.cancelInstall).toHaveBeenCalledTimes(1)
    progress('claude', 'signIn', 'cancelled')
    await endInstall({ outcome: 'cancelled' })
    expect(within(await card('Connect your AI')).getByText('Claude Code is signed out.')).toBeInTheDocument()
  })

  test('the Install guard ignores a click within half a second of the window coming forward', async () => {
    const { user } = await open(NEITHER)
    fireEvent.focus(window)
    await user.click(button(/^Install Claude Code/))
    expect(bridge.install).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(600))
    await user.click(button(/^Install Claude Code/))
    expect(bridge.install).toHaveBeenCalledWith(['claude'])
  })

  test('an Install refused after a fresh off shows the paste command on the card (CUJ 10)', async () => {
    const { user } = await open(NEITHER)
    await user.click(button(/^Install Codex/))
    await endInstall({ outcome: 'refused', why: 'switch_off' })
    expect(await card('Connect your AI')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Install/ })).toBeNull()
    await user.click(button('Copy and open Terminal: I have a ChatGPT plan'))
    expect(bridge.copyAndOpenTerminal).toHaveBeenCalledWith(['codex'])
  })

  test('progress from another run, or after the run ended, changes nothing here', async () => {
    const { user } = await open(NEITHER)
    progress('claude', 'install', 'downloading')
    expect(screen.queryByText(/Downloading/)).toBeNull()
    await user.click(button(/^Install Codex/))
    progress('claude', 'install', 'downloading')
    expect(screen.queryByText(/Downloading the Claude/)).toBeNull()
    await endInstall({ outcome: 'done' })
    await endInstall({ outcome: 'done' }).catch(() => undefined)
    expect(await card('Connect your AI')).toBeInTheDocument()
  })
})

describe('with the button off', () => {
  test('a copy that didn’t work shows the line to copy by hand, and one where Terminal didn’t open says so', async () => {
    const { user } = await open(NEITHER, { buttonOn: false })
    bridge.copyAndOpenTerminal.mockResolvedValueOnce({ copied: false, opened: false })
    await user.click(button('Copy and open Terminal: I have a Claude plan'))
    expect(await screen.findByText('The copy didn’t work. Copy this line yourself, paste it in Terminal and press Return.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Copy: /Users/test/.local/bin/claude auth login' }))
    expect(await screen.findByRole('button', { name: 'Copied: /Users/test/.local/bin/claude auth login' })).toBeInTheDocument()
    expect(within(await card('Connect your AI')).getAllByText('/Users/test/.local/bin/claude auth login').length).toBeGreaterThan(0)
    bridge.copyAndOpenTerminal.mockResolvedValueOnce({ copied: true, opened: false })
    await user.click(button('Copy and open Terminal: I have a Claude plan'))
    expect(await card('Your price key')).toBeInTheDocument()
    await user.click(row('Your AI').getByRole('button', { name: 'Show the command again' }))
    expect(screen.getByText('The command is copied, but Terminal didn’t open. Open Terminal, paste it and press Return.')).toBeInTheDocument()
  })
})

describe('the price key', () => {
  test('a key rejected by its shape never reaches Massive, and the field is cleared and focused', async () => {
    const { user } = await open([CLAUDE.ready, CODEX.missing])
    await user.click(keyField())
    await user.paste('curl -fsSL https://claude.ai/install.sh | bash')
    expect(await screen.findByText(/^That looks like a Terminal line/)).toBeInTheDocument()
    expect(bridge.checkKey).not.toHaveBeenCalled()
    expect(keyField()).toHaveValue('')
    await waitFor(() => expect(keyField()).toHaveFocus())
  })

  test('a key Massive turns down is cleared; one it can’t reach offers Try again; the masked key shows while it checks', async () => {
    const { user } = await open([CLAUDE.ready, CODEX.missing])
    bridge.checkKey.mockResolvedValueOnce(fail('401 for mk-bad', 'KEY_REJECTED'))
    await user.click(keyField())
    await user.paste('mk-bad-key')
    expect(await screen.findByText('Massive didn’t accept that key. Check that you copied all of it.')).toBeInTheDocument()
    expect(screen.queryByText(/mk-bad/)).toBeNull()
    let answer: (v: Awaited<ReturnType<typeof bridge.checkKey>>) => void = () => undefined
    bridge.checkKey.mockResolvedValueOnce(fail('timeout', 'SERVICE_UNREACHABLE')).mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    await user.paste('mk-good-key')
    expect(await screen.findByText('Couldn’t reach Massive just now. Try again in a minute.')).toBeInTheDocument()
    await user.click(button('Try again'))
    expect(bridge.checkKey).toHaveBeenLastCalledWith('massive', 'mk-good-key')
    expect(screen.getByText('•••• -key')).toBeInTheDocument()
    await act(async () => answer(ok({ proof: 'Works: AAPL closed at $230.10 on Nov 6' })))
    expect(row('Price key').getByText('Massive key works')).toBeInTheDocument()
  })

  test('a key typed and sent with Return works too, and Use another key asks again', async () => {
    const { user } = await open([CLAUDE.ready, CODEX.missing])
    await user.type(keyField(), 'mk-typed{Enter}')
    expect(bridge.checkKey).toHaveBeenCalledWith('massive', 'mk-typed')
    await card('Your email, then Start')
    await user.click(row('Price key').getByRole('button', { name: 'Use another key' }))
    expect(await card('Your price key')).toBeInTheDocument()
    await waitFor(() => expect(keyField()).toHaveFocus())
  })

  test('back from massive.com, the key field takes the focus', async () => {
    const { user } = await open([CLAUDE.ready, CODEX.missing])
    await user.click(button('Get a free key'))
    fireEvent.focus(window)
    expect(keyField()).toHaveFocus()
  })

  test('a key saved before counts, and goes straight to the finish', async () => {
    await open([CLAUDE.ready, CODEX.missing], { over: { keys: { massive: 'set', fred: 'missing' } } })
    expect(await card('Your email, then Start')).toBeInTheDocument()
    expect(row('Price key').getByText('Massive key saved')).toBeInTheDocument()
  })
})

describe('the email', () => {
  test('a suggestion never replaces an email the person typed, and Change edits a suggested one', async () => {
    const { user } = await open([{ ...CLAUDE.ready, email: null }, CODEX.missing], { over: { keys: { massive: 'set', fred: 'missing' } } })
    expect(await card('Your email, then Start')).toBeInTheDocument()
    expect(emailField()).toHaveFocus()
    await user.keyboard('me@mine.com')
    emit('tools_changed', { tools: [CLAUDE.ready, CODEX.missing] })
    expect(emailField()).toHaveValue('me@mine.com')
    expect(row('SEC email').getByText('me@mine.com')).toBeInTheDocument()
    // Return presses Start.
    await user.keyboard('{Enter}')
    await screen.findByRole('heading', { name: 'Which company today?' })
    expect(bridge.setSetting).toHaveBeenCalledWith('sec_contact_email', 'me@mine.com')
  })

  test('Change on a suggested email opens the field with the focus, and the engine’s no is shown', async () => {
    const { user } = await open([CLAUDE.ready, CODEX.missing], { over: { keys: { massive: 'set', fred: 'missing' } } })
    await user.click(screen.getByRole('button', { name: 'Change' }))
    await waitFor(() => expect(emailField()).toHaveFocus())
    expect(emailField()).toHaveValue('you@example.com')
    await user.clear(emailField())
    await user.keyboard('who@bad.example')
    bridge.setSetting.mockImplementation(async (k: string) => (k === 'sec_contact_email' ? fail('SEC needs a real contact email.') : ok({ ok: true })))
    await user.click(button('Start Tearsheet'))
    expect(await screen.findByText('SEC needs a real contact email.')).toBeInTheDocument()
    expect(button('Start Tearsheet')).toBeDisabled()
    expect(win()).toHaveClass('on-setup')
    bridge.setSetting.mockResolvedValue(ok({ ok: true }))
    await user.type(emailField(), 'm')
    expect(button('Start Tearsheet')).toBeEnabled()
    // The row's own Change does the same.
    await user.click(row('SEC email').getByRole('button', { name: 'Change the SEC email' }))
    await waitFor(() => expect(emailField()).toHaveFocus())
  })

  test('an email saved before shows with Change, and setup reopened after a failed Start keeps the saved tool', async () => {
    await open([CLAUDE.ready, CODEX.ready], { over: { keys: { massive: 'set', fred: 'missing' }, sec_contact_email: 'saved@example.com', primary_tool: 'codex' } })
    expect(await screen.findByText(/SEC will see/)).toHaveTextContent('SEC will see saved@example.com with each filing download. No one else gets it.')
    expect(row('Your AI').getByText('writes your reports').previousSibling).toHaveTextContent('Signed in with ChatGPT')
  })
})

describe('Start', () => {
  test('stays, with the engine’s reason, if a save fails, and works on a second try', async () => {
    const { user } = await open([CLAUDE.ready, CODEX.missing], { over: { keys: { massive: 'set', fred: 'missing' } } })
    bridge.setSetting.mockResolvedValueOnce(fail('The settings file is locked.'))
    await user.click(button('Start Tearsheet'))
    expect(await screen.findByText('The settings file is locked.')).toBeInTheDocument()
    expect(win()).toHaveClass('on-setup')
    bridge.setSetting.mockImplementation(async (k: string) => (k === 'setup_done' ? fail('') : ok({ ok: true })))
    await user.click(button('Start Tearsheet'))
    expect(await screen.findByText('Tearsheet couldn’t save your setup. Try again.')).toBeInTheDocument()
    bridge.setSetting.mockRejectedValue(new Error('gone'))
    await user.click(button('Start Tearsheet'))
    expect(await screen.findByText('Tearsheet couldn’t save your setup. Try again.')).toBeInTheDocument()
    expect(win()).toHaveClass('on-setup')
  })

  test('says what it waits for while it can’t be pressed', async () => {
    await open(NEITHER, { over: { keys: { massive: 'set', fred: 'missing' } } })
    expect(await card('Connect your AI')).toBeInTheDocument()
    // The finish card isn't up, but the list says what is missing.
    expect(row('Price key').getByText('Massive key saved')).toBeInTheDocument()
    emit('tools_changed', { tools: [CLAUDE.signed_out, CODEX.missing] })
    await screen.findByText('Sign in to Claude Code')
  })

  test('with a sign-in still in the browser, Start waits for it', async () => {
    const { user } = await open([CLAUDE.signed_out, CODEX.missing], { over: { keys: { massive: 'set', fred: 'missing' } } })
    await user.click(button('Sign in to Claude Code'))
    progress('claude', 'signIn', 'opening_browser')
    expect(await card('Your email, then Start')).toBeInTheDocument()
    expect(button('Start Tearsheet')).toBeDisabled()
    expect(screen.getByText('Waiting for Claude Code to sign in')).toBeInTheDocument()
  })
})

describe('the safety check', () => {
  test('starts at the first click, shows in the chip, and its details stop it or run it again', async () => {
    const { user } = await open([CLAUDE.ready, CODEX.missing])
    expect(screen.queryByRole('button', { name: /Safety check/ })).toBeNull()
    await user.click(keyField())
    expect(bridge.runSafetyCheck).toHaveBeenCalledWith('claude')
    emit('safety_progress', { tool: 'claude', n: 6, total: 25 })
    await user.click(await screen.findByRole('button', { name: /^Safety check, 6 of 25/ }))
    const details = within(screen.getByRole('dialog', { name: 'Safety check details' }))
    await user.click(details.getByRole('button', { name: 'Stop the check' }))
    expect(bridge.cancelSafetyCheck).toHaveBeenCalledTimes(1)
    emit('safety_done', { tool: 'claude', passed: false, finished: true, reason: 'Claude ran a shell command.' })
    expect(await details.findByText('Claude ran a shell command.')).toBeInTheDocument()
    await user.click(details.getByRole('button', { name: 'Run the check again' }))
    expect(bridge.runSafetyCheck).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('dialog', { name: 'Safety check details' })).toBeNull()
    await user.click(screen.getByRole('button', { name: /^Safety check/ }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Safety check details' })).toBeNull()
  })

  test('doesn’t run again when a full check passed for this version, and says why when it can’t start', async () => {
    const first = await open([CLAUDE.ready, CODEX.missing], { over: { lockdown: { claude: { version: '2.1.317', passed: true, form: 'full', checked_at: '2026-11-08T10:00:00Z', blocked_reason: null } } } })
    expect(screen.getByRole('button', { name: /Safety check passed/ })).toBeInTheDocument()
    await first.user.click(keyField())
    expect(bridge.runSafetyCheck).not.toHaveBeenCalled()
    first.unmount()

    bridge.runSafetyCheck.mockResolvedValue(fail('Claude Code is signed out.'))
    const again = await open([CLAUDE.ready, CODEX.missing])
    await again.user.click(keyField())
    await again.user.click(await screen.findByRole('button', { name: /Safety check didn’t pass/ }))
    expect(screen.getByText('Claude Code is signed out.')).toBeInTheDocument()
  })

  test('a check the engine’s restart ended is muted, not failed, and can run again', async () => {
    const { user } = await open([CLAUDE.ready, CODEX.missing])
    await user.click(keyField())
    emit('engine_restarted')
    await user.click(await screen.findByRole('button', { name: /Safety check didn’t finish/ }))
    expect(screen.getByText(/engine stopped and restarted/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Run the check again' }))
    expect(bridge.runSafetyCheck).toHaveBeenCalledTimes(2)
  })

  test('a check whose call throws says it didn’t start', async () => {
    bridge.runSafetyCheck.mockRejectedValue(new Error('gone'))
    const { user } = await open([CLAUDE.ready, CODEX.missing])
    await user.click(keyField())
    expect(await screen.findByRole('button', { name: /Safety check didn’t pass/ })).toBeInTheDocument()
  })

  test('the first report waits for it, and shows the reason after each of the three endings (goal 4)', async () => {
    const { user } = await open([CLAUDE.ready, CODEX.missing])
    await addKey(user)
    emit('safety_progress', { tool: 'claude', n: 8, total: 25 })
    await startTearsheet(user, 'claude', 'you@example.com')
    await user.type(screen.getByRole('combobox', { name: 'Look up a company' }), 'nv')
    await user.click(await screen.findByRole('option', { name: /NVDA/ }))
    expect(bridge.runReport).not.toHaveBeenCalled()
    expect(bridge.addToLine).toHaveBeenCalledWith(['NVDA'])
    emit('line_changed', line({ waiting: [lineItem('NVDA')] }))
    expect(await screen.findByText('Starts when the safety check finishes (8 of 25).')).toBeInTheDocument()
    const paused = (code: string, message: string) => line({ waiting: [lineItem('NVDA')], paused: { code, message, reset_at: null, fix_command: null, run_id: null } })
    emit('safety_done', { tool: 'claude', passed: false, finished: false, reason: 'You stopped the safety check.' })
    emit('line_changed', paused('SAFETY_CHECK_STOPPED', 'You stopped the safety check.'))
    expect(await screen.findByText('You stopped the safety check. Reports wait until it passes. NVDA is waiting.')).toBeInTheDocument()
    emit('line_changed', paused('SAFETY_CHECK_UNFINISHED', 'The check couldn’t finish: you hit your usage limit'))
    expect(await screen.findByText('The safety check couldn’t finish: you hit your usage limit. NVDA is waiting.')).toBeInTheDocument()
    emit('safety_done', { tool: 'claude', passed: false, finished: true, reason: 'It read a file.' })
    emit('line_changed', paused('LOCKDOWN_FAILED', 'It read a file.'))
    expect(await screen.findByText('It read a file. NVDA is waiting.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run it again' })).toBeInTheDocument()
  })
})

describe('the news setting', () => {
  test('names the news sites only when the news setting is on', async () => {
    const services = [...freshSettings().services, { name: 'News sites on the allowlist', key: 'none', cost: 'Free', sent: 'A request for each article page' }]
    await open([CLAUDE.ready, CODEX.missing], { over: { keys: { massive: 'set', fred: 'missing' }, services } })
    await card('Your email, then Start')
    expect(dataSentence()).toContain('news sites on the allowlist')
  })
})
