// The first-time setup, screen by screen, on the fake bridge: what each step shows, what its
// buttons send to the engine, where it goes next, and where setup opens again after a quit.

import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { ToolStatus } from '../../preload/api'
import { renderApp, win } from '../test/app'
import { bridge, emit, fail, freshSettings, ok, settings, TOOLS } from '../test/bridge'

const heading = (name: string | RegExp) => screen.findByRole('heading', { level: 1, name })
const button = (name: string | RegExp) => screen.getByRole('button', { name })
// The "Looking for Claude Code" screen stays at least 1.5 s, so it doesn't flash past.
const pastTheScan = () => act(() => vi.advanceTimersByTimeAsync(1600))

const claude = TOOLS[0]
const noClaude: ToolStatus = { ...claude, available: false, path: null, version: null, loggedIn: null, reason: 'Not found' }
const codexIn: ToolStatus = { ...TOOLS[1], available: true, path: '/opt/homebrew/bin/codex', version: 'codex-cli 0.165.0', loggedIn: true, reason: null }

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => {
  vi.useRealTimers()
})

const start = () => renderApp({ advanceTimers: vi.advanceTimersByTime })

describe('a first-time user', () => {
  test('goes through every step, from the welcome screen to the home page', async () => {
    bridge.getSettings.mockResolvedValue(ok(freshSettings()))
    const { user } = await start()

    // 1 and 2: the welcome and how it works. The sidebar and its button stay away while setting up.
    await heading('Tearsheet')
    expect(win()).toHaveClass('on-setup', 'sbhidden')
    expect(screen.queryByRole('button', { name: /the sidebar$/ })).toBeNull()
    await user.click(button('Set up Tearsheet'))
    await heading('How Tearsheet works')
    await user.click(button('Next'))

    // 3: looking for Claude Code, found and signed in: straight to step 5.
    await heading('Looking for Claude Code…')
    expect(within(screen.getByLabelText('Setup progress')).getByText('Claude Code')).toHaveAttribute('aria-current', 'step')
    await pastTheScan()
    await heading('Claude Code is connected')
    expect(bridge.setSetting).toHaveBeenCalledWith('primary_tool', 'claude')
    // The safety check starts by itself, and its chip follows the engine's notes.
    expect(bridge.runSafetyCheck).toHaveBeenCalledWith('claude')
    emit('safety_progress', { tool: 'claude', n: 10, total: 25 })
    expect(await screen.findByRole('img', { name: 'Safety check, 10 of 25' })).toBeInTheDocument()
    await user.click(button('Next: prices'))

    // 6: the Massive key, checked before Continue.
    await heading('Prices come from Massive')
    expect(button('Continue')).toBeDisabled()
    await user.click(button('Open massive.com'))
    expect(bridge.openExternal).toHaveBeenCalledWith('https://massive.com')
    await user.click(button('Check'))
    expect(screen.getByText('Paste your key first.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Your Massive key'), 'mk-123{Enter}')
    expect(bridge.checkKey).toHaveBeenCalledWith('massive', 'mk-123')
    expect(await screen.findByText('Works: AAPL closed at $230.10 on Nov 6')).toBeInTheDocument()
    expect(screen.getByLabelText('Your Massive key')).toHaveValue('')
    await user.click(button('Continue'))

    // 7: FRED is optional; skipping it is saved and said.
    await heading(/Economic figures from FRED/)
    await user.click(button('Skip for now'))
    expect(bridge.setSetting).toHaveBeenCalledWith('fred_skipped', '1')
    expect(screen.getByText(/^Skipped. Reports will say/)).toBeInTheDocument()
    emit('safety_done', { tool: 'claude', passed: true, finished: true })
    await user.click(button('Continue without it'))

    // 8: the email for SEC, which has to look like one.
    await heading('Your email, for SEC')
    await user.type(screen.getByLabelText('Your email'), 'liam at example')
    await user.click(button('Continue'))
    expect(screen.getByText('That doesn’t look like an email address.')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Your email'))
    await user.type(screen.getByLabelText('Your email'), 'liam@example.com{Enter}')
    expect(bridge.setSetting).toHaveBeenCalledWith('sec_contact_email', 'liam@example.com')
    expect(await screen.findByText('Saved')).toBeInTheDocument()

    // 9: ready, with what was set up; Open Tearsheet saves that setup is done.
    await heading('You’re set up')
    expect(screen.getByText('Connected, version 2.1.3')).toBeInTheDocument()
    expect(screen.getByText('Skipped. Add the key in Settings')).toBeInTheDocument()
    expect(screen.getByText('liam@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Safety check passed/ })).toBeInTheDocument()
    await user.click(button('Open Tearsheet'))
    expect(bridge.setSetting).toHaveBeenCalledWith('setup_done', '1')
    await heading('Which company today?')
    expect(win()).toHaveClass('on-home')
    expect(win()).not.toHaveClass('sbhidden')
    // Past predictions are graded once setup is finished, not before.
    expect(bridge.gradeDue).toHaveBeenCalledTimes(1)
  })

  test('without Claude Code is shown where Tearsheet looked, can switch to Codex, and is walked through installing it', async () => {
    bridge.getSettings.mockResolvedValue(ok(freshSettings({ primary_tool: 'claude' })))
    bridge.getTools.mockResolvedValue([noClaude, TOOLS[1]])
    const { user } = await start()

    // Some progress already, so setup opens on the step that isn't done.
    await heading('Looking for Claude Code…')
    await pastTheScan()
    await heading('Claude Code isn’t on this Mac yet')
    await user.click(button('Where Tearsheet looked'))
    expect(screen.getByText(/every folder on your shell’s PATH/)).toBeInTheDocument()

    await user.click(button('I use ChatGPT: connect Codex instead'))
    await heading('Looking for Codex…')
    await pastTheScan()
    await heading('Codex isn’t on this Mac yet')
    await user.click(button('Show me how'))

    await heading('Add Codex in two steps')
    expect(button('Continue')).toBeDisabled()
    await user.click(button('Copy: npm install -g @openai/codex'))
    expect(await screen.findByRole('button', { name: 'Copied: npm install -g @openai/codex' })).toBeInTheDocument()
    await user.click(button('Open Terminal'))
    expect(bridge.openTerminal).toHaveBeenCalled()
    await user.click(button('nodejs.org'))
    expect(bridge.openExternal).toHaveBeenCalledWith('https://nodejs.org')

    // The page looks again every 2 seconds, and ticks each step off by itself.
    bridge.getTools.mockResolvedValue([noClaude, codexIn])
    await act(() => vi.advanceTimersByTimeAsync(2100))
    expect(await screen.findByText('Signed in to your ChatGPT plan')).toBeInTheDocument()
    await user.click(button('Continue'))
    await heading('Codex is connected')
    expect(bridge.setSetting).toHaveBeenCalledWith('primary_tool', 'codex')
    expect(bridge.runSafetyCheck).toHaveBeenCalledWith('codex')
  })
})

describe('setup after a quit', () => {
  test('opens at the first step that isn’t done, and a safety check that passed for this version doesn’t run again', async () => {
    bridge.getSettings.mockResolvedValue(ok(settings({ setup_done: false, keys: { massive: 'set', fred: 'missing' }, sec_contact_email: null })))
    await start()
    await heading(/Economic figures from FRED/)
    const progress = within(screen.getByLabelText('Setup progress'))
    expect(progress.getByText('Details')).toHaveAttribute('aria-current', 'step')
    expect(progress.getByText('Prices')).toHaveClass('done')
    expect(screen.getByRole('button', { name: /Safety check passed/ })).toBeInTheDocument()
    expect(bridge.runSafetyCheck).not.toHaveBeenCalled()
  })

  test('with everything done but the email, a FRED key added now still counts', async () => {
    bridge.getSettings.mockResolvedValue(ok(settings({ setup_done: false, keys: { massive: 'set', fred: 'missing' }, fred_skipped: true, sec_contact_email: null })))
    const { user } = await start()
    await heading('Your email, for SEC')
    await user.type(screen.getByLabelText('Your email'), 'liam@example.com{Enter}')
    await heading('You’re set up')
    expect(screen.getByText('Skipped. Add the key in Settings')).toBeInTheDocument()
  })
})

describe('when something goes wrong', () => {
  test('a key the service turns down says so, and nothing moves on', async () => {
    bridge.getSettings.mockResolvedValue(ok(settings({ setup_done: false, keys: { massive: 'missing', fred: 'missing' } })))
    bridge.checkKey.mockResolvedValueOnce(fail('401 for key mk-bad', 'KEY_REJECTED')).mockResolvedValueOnce(fail('timeout', 'SERVICE_UNREACHABLE'))
    const { user } = await start()
    await heading('Prices come from Massive')
    await user.type(screen.getByLabelText('Your Massive key'), 'mk-bad{Enter}')
    expect(await screen.findByText('Massive didn’t accept that key. Check that you copied all of it.')).toBeInTheDocument()
    // The engine's own words are never shown, so a key can't be either.
    expect(screen.queryByText(/mk-bad/)).toBeNull()
    await user.clear(screen.getByLabelText('Your Massive key'))
    await user.click(button('Check'))
    expect(screen.getByText('Paste your key first.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Your Massive key'), 'mk-2')
    await user.click(button('Check'))
    expect(await screen.findByText('Couldn’t reach Massive just now. Try again in a minute.')).toBeInTheDocument()
    expect(button('Continue')).toBeDisabled()
  })

  test('a safety check that fails shows in the chip, whose details run it again', async () => {
    bridge.getSettings.mockResolvedValue(ok(settings({ setup_done: false, keys: { massive: 'missing', fred: 'missing' }, lockdown: {} })))
    const { user } = await start()
    await heading('Prices come from Massive')
    expect(bridge.runSafetyCheck).toHaveBeenCalledTimes(1)
    emit('safety_done', { tool: 'claude', passed: false, finished: true, reason: 'Claude ran a shell command.' })
    const chip = await screen.findByRole('button', { name: /Safety check didn’t pass/ })
    await user.click(chip)
    const details = screen.getByRole('dialog', { name: 'Safety check details' })
    expect(within(details).getByText('Claude ran a shell command.')).toBeInTheDocument()
    await user.click(within(details).getByRole('button', { name: 'Run the check again' }))
    expect(bridge.runSafetyCheck).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('dialog', { name: 'Safety check details' })).toBeNull()
  })

  test('a safety check that stopped part way is muted, and Esc closes its details', async () => {
    bridge.getSettings.mockResolvedValue(ok(settings({ setup_done: false, keys: { massive: 'missing', fred: 'missing' }, lockdown: {} })))
    const { user } = await start()
    await heading('Prices come from Massive')
    emit('engine_restarted')
    await user.click(await screen.findByRole('button', { name: /Safety check didn’t finish/ }))
    expect(screen.getByText(/engine stopped and restarted/)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Safety check details' })).toBeNull()
  })

  test('a safety check that can’t start says why in the chip', async () => {
    bridge.getSettings.mockResolvedValue(ok(settings({ setup_done: false, keys: { massive: 'missing', fred: 'missing' }, lockdown: {} })))
    bridge.runSafetyCheck.mockResolvedValue(fail('Claude Code is signed out.'))
    const { user } = await start()
    await heading('Prices come from Massive')
    await user.click(await screen.findByRole('button', { name: /Safety check didn’t pass/ }))
    expect(screen.getByText('Claude Code is signed out.')).toBeInTheDocument()
  })

  test('Open Tearsheet stays on Ready, and says so, if setup can’t be saved as finished', async () => {
    bridge.getSettings.mockResolvedValue(ok(settings({ setup_done: false })))
    bridge.setSetting.mockImplementation(async (key: string) => (key === 'setup_done' ? fail('disk full') : ok({ ok: true })))
    const { user } = await start()
    await heading('You’re set up')
    await user.click(button('Open Tearsheet'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Tearsheet couldn’t save that setup is finished. Try again.')
    expect(button('Open Tearsheet')).toBeEnabled()
    expect(win()).toHaveClass('on-setup')
  })

  test('the email that can’t be saved says why', async () => {
    bridge.getSettings.mockResolvedValue(ok(settings({ setup_done: false, sec_contact_email: null })))
    bridge.setSetting.mockResolvedValue(fail('The settings file is locked.'))
    const { user } = await start()
    await heading('Your email, for SEC')
    await user.type(screen.getByLabelText('Your email'), 'liam@example.com{Enter}')
    expect(await screen.findByText('The settings file is locked.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your email, for SEC'))
  })
})
