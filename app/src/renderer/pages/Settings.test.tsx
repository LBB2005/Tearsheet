// Settings: the eight topics and what each page's buttons send to the engine. The app is opened on
// the fake bridge and Settings reached with ⌘, as a person would.

import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { renderApp } from '../test/app'
import { bridge, emit, endInstall, fail, inState, menu, ok, progress, settings, TOOLS } from '../test/bridge'

const openSettings = async (over: Parameters<typeof settings>[0] = {}) => {
  bridge.getSettings.mockResolvedValue(ok(settings(over)))
  const app = await renderApp()
  menu('settings')
  await screen.findByRole('navigation', { name: 'Settings topics' })
  return app
}
const topics = () => within(screen.getByRole('navigation', { name: 'Settings topics' }))
const topic = (name: string) => topics().getByRole('button', { name: new RegExp(`^${name}`) })
const pageHeading = () => screen.getByRole('heading', { level: 2 })
const toolbarTitle = () => document.querySelector('.top .ttl')?.textContent

describe('the topic list', () => {
  test('opens on General, and each topic opens its page and is named in the toolbar', async () => {
    const { user } = await openSettings()
    expect(topic('General')).toHaveAttribute('aria-current', 'page')
    expect(pageHeading()).toHaveTextContent('General')
    expect(toolbarTitle()).toBe('SettingsGeneral')
    const pages: [string, string][] = [
      ['Appearance', 'Appearance'],
      ['AI tools', 'AI tools'],
      ['Data keys', 'Data keys'],
      ['Storage and backup', 'Storage and backup'],
      ['Privacy', 'Privacy'],
      ['Advanced', 'Advanced'],
      ['About and help', 'About and help'],
      ['General', 'General']
    ]
    for (const [name, title] of pages) {
      await user.click(topic(name))
      expect(topic(name)).toHaveAttribute('aria-current', 'page')
      expect(pageHeading()).toHaveTextContent(title)
      expect(toolbarTitle()).toBe(`Settings${name}`)
    }
  })

  test('moves with the arrow keys, Home and End, and stops at the ends', async () => {
    const { user } = await openSettings()
    topic('General').focus()
    await user.keyboard('{ArrowUp}')
    expect(pageHeading()).toHaveTextContent('General')
    await user.keyboard('{ArrowDown}')
    expect(pageHeading()).toHaveTextContent('Appearance')
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(pageHeading()).toHaveTextContent('Data keys')
    expect(topic('Data keys')).toHaveFocus()
    await user.keyboard('{End}')
    expect(pageHeading()).toHaveTextContent('About and help')
    await user.keyboard('{Home}')
    expect(pageHeading()).toHaveTextContent('General')
    await user.keyboard('a')
    expect(pageHeading()).toHaveTextContent('General')
  })

  test('stays on the topic last shown between visits', async () => {
    const { user } = await openSettings()
    await user.click(topic('Privacy'))
    menu('new')
    menu('settings')
    expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent('Privacy')
  })

  test('a topic that needs you has a dot, and General has a note whose button opens it', async () => {
    const { user } = await openSettings({ keys: { massive: 'missing', fred: 'set' }, raw_bytes: 4_900_000_000 })
    expect(topic('Data keys')).toHaveTextContent('needs you')
    expect(topic('Storage and backup')).toHaveTextContent('needs you')
    expect(topic('Privacy')).not.toHaveTextContent('needs you')
    expect(screen.getByText('Massive key not added')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open storage' }))
    expect(pageHeading()).toHaveTextContent('Storage and backup')
    expect(screen.getByText(/near its limit/)).toBeInTheDocument()
  })

  test('says so when the settings don’t load', async () => {
    await renderApp()
    bridge.getSettings.mockResolvedValue(fail('The engine is busy.'))
    menu('settings')
    expect(await screen.findByRole('alert')).toHaveTextContent('Settings didn’t load. The engine is busy.')
  })
})

describe('General', () => {
  test('the main AI tool is saved, and the page reads the settings again', async () => {
    const { user } = await openSettings()
    const asked = bridge.getSettings.mock.calls.length
    await user.selectOptions(screen.getByRole('combobox', { name: 'Main AI tool' }), 'codex')
    expect(bridge.setSetting).toHaveBeenCalledWith('primary_tool', 'codex')
    await waitFor(() => expect(bridge.getSettings.mock.calls.length).toBeGreaterThan(asked))
  })

  test('a main AI tool that isn’t saved says so', async () => {
    const { user } = await openSettings()
    bridge.setSetting.mockResolvedValue(fail('Locked.'))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Main AI tool' }), 'codex')
    expect(await screen.findByRole('alert')).toHaveTextContent('Locked.')
  })

  test('the chart’s first range is kept on this Mac, and the animations moved to Appearance', async () => {
    const { user } = await openSettings()
    await user.selectOptions(screen.getByRole('combobox', { name: 'The chart opens on' }), '3M')
    expect(localStorage.getItem('chart.startRange')).toBe('3M')
    expect(screen.queryByRole('combobox', { name: 'Animations' })).toBeNull()
    await user.click(topic('Appearance'))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Animations' }), 'off')
    expect(localStorage.getItem('motion.level')).toBe('off')
    expect(document.documentElement).toHaveAttribute('data-motion', 'off')
    expect(screen.getByText('Nothing moves.')).toBeInTheDocument()
  })

  test('the SEC email is shown masked, checked before it is saved, and Esc puts it back', async () => {
    const { user } = await openSettings()
    expect(screen.getByText('l••••••••@example.com')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Change SEC contact email' }))
    const field = screen.getByRole('textbox', { name: 'SEC contact email' })
    expect(field).toHaveValue('liam@example.com')
    await user.clear(field)
    await user.type(field, 'nope{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('That doesn’t look like an email address.')
    expect(bridge.setSetting).not.toHaveBeenCalled()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('textbox', { name: 'SEC contact email' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Change SEC contact email' }))
    await user.clear(screen.getByRole('textbox', { name: 'SEC contact email' }))
    await user.type(screen.getByRole('textbox', { name: 'SEC contact email' }), ' sam@example.com ')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(bridge.setSetting).toHaveBeenCalledWith('sec_contact_email', 'sam@example.com')
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'SEC contact email' })).toBeNull())
  })

  test('a setting the engine won’t save keeps the field open with its reason', async () => {
    const { user } = await openSettings()
    bridge.setSetting.mockResolvedValue(fail('That folder can’t be written.'))
    await user.click(screen.getByRole('button', { name: 'Change SEC contact email' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That folder can’t be written.')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('AI tools', () => {
  test('lists each tool with its state, looks again, and shows the details', async () => {
    const { user } = await openSettings()
    await user.click(topic('AI tools'))
    expect(screen.getByText('Writes your reports · version 2.1.3')).toBeInTheDocument()
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('Not found')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Check again' }))
    expect(bridge.getTools).toHaveBeenCalledWith(true)

    await user.click(screen.getByRole('button', { name: 'Show details' }))
    expect(screen.getByText('~/.local/bin/claude')).toBeInTheDocument()
    expect(screen.getAllByText('Not found on this Mac')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Hide details' }))
    expect(screen.queryByText('~/.local/bin/claude')).toBeNull()
  })

  test('runs the safety check again and follows it to the end', async () => {
    const { user } = await openSettings()
    await user.click(topic('AI tools'))
    await user.click(screen.getByRole('button', { name: 'Run again' }))
    expect(bridge.runSafetyCheck).toHaveBeenCalledWith('claude')
    emit('safety_progress', { tool: 'claude', n: 4, total: 25 })
    expect(screen.getByText('Checking, 4 of 25')).toBeInTheDocument()
    expect(screen.getByText('Checking')).toBeInTheDocument()
    // The sidebar's status line follows the same check, and its chip shows in the toolbar.
    expect(within(screen.getByRole('complementary', { name: 'Sidebar' })).getByText('Safety check, 4 of 25')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Safety check, 4 of 25, under 1 min so far/ })).toBeInTheDocument()
    const asked = bridge.getSettings.mock.calls.length
    emit('safety_done', { tool: 'claude', passed: true, finished: true })
    expect(await screen.findByText('Passed just now.')).toBeInTheDocument()
    await waitFor(() => expect(bridge.getSettings.mock.calls.length).toBeGreaterThan(asked))
  })

  test('a safety check that can’t start, or fails, says why', async () => {
    const { user } = await openSettings()
    await user.click(topic('AI tools'))
    bridge.runSafetyCheck.mockResolvedValueOnce(fail('A report is running.'))
    await user.click(screen.getByRole('button', { name: 'Run again' }))
    expect(await screen.findByText('A report is running.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Run again' }))
    emit('safety_done', { tool: 'claude', passed: false, finished: true, reason: 'It read a file.' })
    expect(await screen.findByText('It read a file.')).toBeInTheDocument()
  })

  test('a signed-out tool is a problem on General, can’t run the check, and, with the button off, signs in as on the home page', async () => {
    bridge.getInstallButton.mockResolvedValue(false)
    bridge.getTools.mockResolvedValue([inState(TOOLS[0], 'signed_out'), TOOLS[1]])
    const { user } = await openSettings()
    expect(topic('AI tools')).toHaveTextContent('needs you')
    await user.click(screen.getByRole('button', { name: 'Open AI tools' }))
    expect(screen.getByText('Signed out')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Run again' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Sign in again' }))
    expect(bridge.copyAndOpenTerminal).toHaveBeenCalledWith(['claude'])
    expect(await screen.findByText(/^The command is copied, and a new Terminal window is open\./)).toBeInTheDocument()
    expect(bridge.windowState).toHaveBeenLastCalledWith({ waiting: true })
    expect(screen.queryByRole('button', { name: 'Sign in again' })).toBeNull()
    // Signed in: the main process says so, and the steps have done their job.
    emit('tools_changed', { tools: TOOLS })
    await waitFor(() => expect(screen.queryByText(/^The command is copied/)).toBeNull())
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run again' })).toBeInTheDocument()
    expect(bridge.windowState).toHaveBeenLastCalledWith({ waiting: false })
  })

  test('each tool’s row offers what its state needs, with the button off', async () => {
    bridge.getInstallButton.mockResolvedValue(false)
    const codex = inState(TOOLS[1], 'missing')
    bridge.getTools.mockResolvedValue([inState(TOOLS[0], 'api_key'), codex])
    const { user } = await openSettings()
    await user.click(topic('AI tools'))
    // Signed in with an API key: the same sign-in, and no safety check until it is ready.
    expect(screen.getByText('Not on a plan')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Run again' })).toBeNull()
    // Missing: the paste command that installs it and signs it in.
    bridge.copyAndOpenTerminal.mockResolvedValueOnce({ copied: true, opened: false })
    await user.click(screen.getByRole('button', { name: 'Copy and open Terminal' }))
    expect(bridge.copyAndOpenTerminal).toHaveBeenCalledWith(['codex'])
    expect(await screen.findByText(/^The command is copied, but Terminal didn’t open\. .* It installs Codex, then your browser opens/)).toBeInTheDocument()
    expect(screen.getByText('Waiting for it to finish')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Copy and open Terminal again' }))
    expect(bridge.copyAndOpenTerminal).toHaveBeenCalledTimes(2)
  })

  test('a tool that is too old updates, unless it was installed another way (the button off)', async () => {
    bridge.getInstallButton.mockResolvedValue(false)
    bridge.getTools.mockResolvedValue([inState(TOOLS[0], 'too_old', { version: '2.1.200 (Claude Code)' }), TOOLS[1]])
    const { user, unmount } = await openSettings()
    await user.click(topic('AI tools'))
    expect(screen.getByText('Too old')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Update' }))
    expect(bridge.copyAndOpenTerminal).toHaveBeenCalledWith(['claude'])
    expect(await screen.findByText(/It updates Claude Code, then signs it in if it needs to\./)).toBeInTheDocument()
    unmount()

    const reason = 'This Claude Code was installed another way (/opt/homebrew/bin). Update it the way you installed it.'
    bridge.commandsFor.mockResolvedValue({ steps: [], blocked: [{ tool: 'claude', reason }], paste: null })
    const again = await openSettings()
    await again.user.click(topic('AI tools'))
    expect(await screen.findByText(reason)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Update' })).toBeNull()
  })

  test('a tool Tearsheet can’t read offers Try again and its log', async () => {
    bridge.getTools.mockResolvedValue([inState(TOOLS[0], 'cant_tell'), TOOLS[1]])
    const { user } = await openSettings()
    await user.click(topic('AI tools'))
    expect(screen.getByText('Can’t tell')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(bridge.getTools).toHaveBeenLastCalledWith(true)
    bridge.showSetupLog.mockResolvedValueOnce(false)
    await user.click(screen.getByRole('button', { name: 'Show log' }))
    expect(await screen.findByText('There’s no setup log yet.')).toBeInTheDocument()
    bridge.showSetupLog.mockRejectedValueOnce(new Error('no'))
    await user.click(screen.getByRole('button', { name: 'Show log' }))
    expect(await screen.findByText('The log didn’t open.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show log' }))
    await waitFor(() => expect(screen.queryByText('The log didn’t open.')).toBeNull())
    expect(bridge.showSetupLog).toHaveBeenCalledTimes(3)
  })

  test('a copy that didn’t work shows the command to copy by hand, or why there is nothing to run', async () => {
    bridge.getInstallButton.mockResolvedValue(false)
    bridge.getTools.mockResolvedValue([inState(TOOLS[0], 'signed_out'), TOOLS[1]])
    bridge.copyAndOpenTerminal.mockResolvedValue({ copied: false, opened: false })
    const { user } = await openSettings()
    await user.click(topic('AI tools'))
    await user.click(screen.getByRole('button', { name: 'Sign in again' }))
    expect(await screen.findByText(/^The copy didn’t work\. Paste this in Terminal/)).toBeInTheDocument()
    expect(screen.getByText('/Users/test/.local/bin/claude auth login')).toBeInTheDocument()

    bridge.commandsFor.mockResolvedValueOnce({ steps: [], blocked: [{ tool: 'claude', reason: 'Test settings are on, so Tearsheet won’t run the real installer.' }], paste: null })
    await user.click(screen.getByRole('button', { name: 'Copy and open Terminal again' }))
    expect(await screen.findByText('Test settings are on, so Tearsheet won’t run the real installer.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy and open Terminal again' })).toBeNull()
  })

  test('a copy that fails outright, with nothing to run, says so', async () => {
    bridge.getInstallButton.mockResolvedValue(false)
    bridge.getTools.mockResolvedValue([inState(TOOLS[0], 'free_plan'), TOOLS[1]])
    bridge.copyAndOpenTerminal.mockRejectedValue(new Error('gone'))
    bridge.commandsFor.mockRejectedValue(new Error('gone'))
    const { user } = await openSettings()
    await user.click(topic('AI tools'))
    expect(screen.getByText('Free plan')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sign in again' }))
    expect(await screen.findByText('There’s nothing for Tearsheet to run for Claude Code just now.')).toBeInTheDocument()
  })

  test('Show log in Finder opens the setup log, or says there is none yet', async () => {
    const { user } = await openSettings()
    await user.click(topic('AI tools'))
    await user.click(screen.getByRole('button', { name: 'Show log in Finder' }))
    expect(bridge.showSetupLog).toHaveBeenCalledTimes(1)
    bridge.showSetupLog.mockResolvedValueOnce(false)
    await user.click(screen.getByRole('button', { name: 'Show log in Finder' }))
    expect(await screen.findByText('There’s no setup log yet.')).toBeInTheDocument()
    bridge.showSetupLog.mockRejectedValueOnce(new Error('no'))
    await user.click(screen.getByRole('button', { name: 'Show log in Finder' }))
    expect(await screen.findByText('The log didn’t open.')).toBeInTheDocument()
  })

  test('Codex signed in another way than ChatGPT doesn’t check the drafts', async () => {
    bridge.getTools.mockResolvedValue([TOOLS[0], inState(TOOLS[1], 'api_key', { path: '/Users/test/.local/bin/codex', version: 'codex-cli 0.165.0' })])
    const { user } = await openSettings()
    await user.click(topic('AI tools'))
    expect(screen.getByText('Not checking drafts · version 0.165.0')).toBeInTheDocument()
  })
})

describe('Data keys', () => {
  test('a key that is missing opens its form; a key that works is saved and the page reads it again', async () => {
    const { user } = await openSettings({ keys: { massive: 'set', fred: 'missing' } })
    await user.click(topic('Data keys'))
    expect(screen.getByRole('button', { name: 'Hide: FRED' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Replace key: Massive' })).toHaveAttribute('aria-expanded', 'false')

    await user.click(screen.getByRole('button', { name: 'Get a free key at fred.stlouisfed.org' }))
    expect(bridge.openExternal).toHaveBeenCalledWith('https://fredaccount.stlouisfed.org/apikeys')
    const asked = bridge.getSettings.mock.calls.length
    await user.type(screen.getByLabelText('Your FRED key'), 'fk-1{Enter}')
    expect(bridge.checkKey).toHaveBeenCalledWith('fred', 'fk-1')
    expect(await screen.findByText('Works: inflation was 2.9% in September')).toBeInTheDocument()
    await waitFor(() => expect(bridge.getSettings.mock.calls.length).toBeGreaterThan(asked))
    await user.click(screen.getByRole('button', { name: 'Done: FRED' }))
    expect(screen.queryByLabelText('Your FRED key')).toBeNull()
  })

  test('a key that was turned down says so, and can be replaced', async () => {
    const { user } = await openSettings({ rejected_keys: ['massive'] })
    await user.click(topic('Data keys'))
    expect(screen.getByText('Not accepted')).toBeInTheDocument()
    // Its form is open already.
    expect(screen.getByLabelText('Your Massive key')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel: Massive' }))
    expect(screen.queryByLabelText('Your Massive key')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Replace key: Massive' }))
    expect(screen.getByLabelText('Your Massive key')).toBeInTheDocument()
  })

  test('a key macOS kept locked says so, and its form stays closed until asked for', async () => {
    const { user } = await openSettings({ keys: { massive: 'locked', fred: 'set', alphavantage: 'missing' } })
    await user.click(topic('Data keys'))
    expect(screen.getByText('Locked in Keychain')).toBeInTheDocument()
    expect(screen.queryByLabelText('Your Massive key')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Replace key: Massive' }))
    expect(screen.getByLabelText('Your Massive key')).toBeInTheDocument()
  })

  test('a fresh copy has no Alpha Vantage row: it is only for Tearsheet’s author', async () => {
    const { user } = await openSettings()
    await user.click(topic('Data keys'))
    expect(screen.getByRole('button', { name: 'Replace key: Massive' })).toBeInTheDocument()
    expect(screen.queryByText('Alpha Vantage')).toBeNull()
  })

  test('with author tools on, the Alpha Vantage key is saved as it is, with no check', async () => {
    const { user } = await openSettings({ author_tools: true })
    await user.click(topic('Data keys'))
    await user.click(screen.getByRole('button', { name: 'Add key: Alpha Vantage' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Paste your key first.')).toBeInTheDocument()
    bridge.setKey.mockResolvedValueOnce(fail('Keychain locked'))
    await user.type(screen.getByLabelText('Your Alpha Vantage key'), 'av-1{Enter}')
    expect(await screen.findByText('The key wasn’t saved. Try again.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Your Alpha Vantage key'), 'av-2')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(bridge.setKey).toHaveBeenLastCalledWith('alphavantage', 'av-2')
    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect(screen.getByLabelText('Your Alpha Vantage key')).toHaveValue('')
  })

  test('the price download line counts up while it goes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const going = settings({ price_download: { state: 'downloading', days_done: 40, days_total: 300, companies_ready: 0, companies: 503 } })
      bridge.getSettings.mockResolvedValue(ok(going))
      const { user } = await renderApp({ advanceTimers: vi.advanceTimersByTime })
      menu('settings')
      await user.click(await screen.findByRole('button', { name: /^Data keys/ }))
      expect(screen.getByText('40 of 300 trading days so far, in the background.')).toBeInTheDocument()
      bridge.getSettings.mockResolvedValue(ok(settings({ price_download: { ...going.price_download, days_done: 41 } })))
      await act(() => vi.advanceTimersByTimeAsync(15_100))
      expect(await screen.findByText('41 of 300 trading days so far, in the background.')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  test('other price download states', async () => {
    const lines: [Parameters<typeof settings>[0], RegExp][] = [
      [{ price_download: { state: 'paused', paused_for: 'grading', companies_ready: 0, companies: 503 } }, /Paused while past predictions are graded/],
      [{ price_download: { state: 'stopped', stopped_because: 'Massive refused the key', companies_ready: 10, companies: 503 } }, /Stopped: Massive refused the key/],
      [{ price_download: { state: 'done', companies_ready: 400, companies: 503 } }, /for 400 of 503 companies/]
    ]
    for (const [over, line] of lines) {
      const { user, unmount } = await openSettings(over)
      await user.click(topic('Data keys'))
      expect(screen.getByText(line)).toBeInTheDocument()
      unmount()
    }
  })
})

describe('Storage, Privacy and Advanced', () => {
  test('storage shows what is used against the limit, and the limit and backup folder can change', async () => {
    const { user } = await openSettings({ backup_in_icloud: true })
    await user.click(topic('Storage and backup'))
    expect(screen.getByRole('meter', { name: 'Downloads against the storage limit' })).toBeInTheDocument()
    expect(screen.getByText('~/Backups/Tearsheet')).toBeInTheDocument()
    expect(screen.getByText(/Synced by iCloud/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Change Storage limit' }))
    await user.clear(screen.getByRole('textbox', { name: 'Storage limit' }))
    await user.type(screen.getByRole('textbox', { name: 'Storage limit' }), '0{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('Give a size in GB, more than 0.')
    await user.clear(screen.getByRole('textbox', { name: 'Storage limit' }))
    await user.type(screen.getByRole('textbox', { name: 'Storage limit' }), '20{Enter}')
    expect(bridge.setSetting).toHaveBeenCalledWith('raw_cap', '20')

    await user.click(screen.getByRole('button', { name: 'Change Backup folder' }))
    await user.clear(screen.getByRole('textbox', { name: 'Backup folder' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Give the folder’s path')
  })

  test('privacy lists every service and what it is sent', async () => {
    const { user } = await openSettings()
    await user.click(topic('Privacy'))
    expect(screen.getByText('SEC EDGAR')).toBeInTheDocument()
    expect(screen.getByText('Requests for company filings, with your contact email. Key: none.')).toBeInTheDocument()
    expect(screen.getByText('Free plan')).toBeInTheDocument()
  })

  test('a fresh copy has no Goal 1 round: it is only for Tearsheet’s author', async () => {
    const { user } = await openSettings()
    await user.click(topic('Advanced'))
    expect(screen.getByText('5Y and All chart ranges')).toBeInTheDocument()
    expect(screen.queryByText('Goal 1 round')).toBeNull()
  })

  test('with author tools on, advanced changes the Goal 1 round, as a whole number', async () => {
    const { user } = await openSettings({ author_tools: true })
    await user.click(topic('Advanced'))
    await user.click(screen.getByRole('button', { name: 'Change Goal 1 round' }))
    await user.clear(screen.getByRole('textbox', { name: 'Goal 1 round' }))
    await user.type(screen.getByRole('textbox', { name: 'Goal 1 round' }), '1.5{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('Give a whole number, 1 or more.')
    await user.clear(screen.getByRole('textbox', { name: 'Goal 1 round' }))
    await user.type(screen.getByRole('textbox', { name: 'Goal 1 round' }), '2{Enter}')
    expect(bridge.setSetting).toHaveBeenCalledWith('goal1_round', '2')
  })
})

describe('About and help', () => {
  test('shows the versions, the terms, privacy, uninstall steps and FRED’s notice', async () => {
    const { user } = await openSettings()
    await user.click(topic('About and help'))
    expect(pageHeading()).toHaveTextContent('About and help')
    expect(await screen.findByText('Tearsheet 0.1.0 · engine 0.1.0')).toBeInTheDocument()
    expect(screen.getByText(/Tearsheet 0.1.0, engine 0.1.0, macOS 26.1, Electron 33.2.0/)).toBeInTheDocument()
    expect(screen.getByText(/not personalised investment advice/)).toBeInTheDocument()
    expect(screen.getByText(/provided as is, with no warranty/)).toBeInTheDocument()
    expect(screen.getByText(/sends nothing to its author/)).toBeInTheDocument()
    expect(screen.getByText(/~\/Library\/Application Support\/Tearsheet/)).toBeInTheDocument()
    expect(screen.getByText('This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.')).toBeInTheDocument()
  })

  test('Send feedback opens Mail through main, FRED’s terms open in the browser, and Open Privacy goes to Privacy', async () => {
    const { user } = await openSettings()
    await user.click(topic('About and help'))
    await user.click(await screen.findByRole('button', { name: 'Send feedback' }))
    expect(bridge.sendFeedback).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/Opens a new email to lbb\.aifinance@gmail\.com in your Mail app/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'FRED’s terms' }))
    expect(bridge.openExternal).toHaveBeenCalledWith('https://fred.stlouisfed.org/docs/api/terms_of_use.html')
    await user.click(screen.getByRole('button', { name: 'Open Privacy' }))
    expect(pageHeading()).toHaveTextContent('Privacy')
  })

  test('opens even while the engine is down', async () => {
    const { user } = await renderApp()
    bridge.getSettings.mockResolvedValue(fail('Tearsheet’s engine didn’t answer.'))
    menu('settings')
    expect(await screen.findByRole('alert')).toHaveTextContent('Settings didn’t load.')
    await user.click(topic('About and help'))
    expect(pageHeading()).toHaveTextContent('About and help')
  })

  test('Help > Tearsheet Help opens it, and Help > Send Feedback opens Mail', async () => {
    await openSettings()
    menu('help')
    expect(await screen.findByRole('heading', { level: 2, name: 'About and help' })).toBeInTheDocument()
    menu('feedback')
    expect(bridge.sendFeedback).toHaveBeenCalledTimes(1)
  })
})

// First-run design item 39: with the button on, each tool row's action runs inside Tearsheet, and
// its progress, fallbacks and failure show under the row.
describe('AI tools with the Install button on', () => {
  test('a missing tool installs and signs in from its row, with each step under it, and the row settles once it is ready', async () => {
    bridge.getTools.mockResolvedValue([TOOLS[0], inState(TOOLS[1], 'missing')])
    const { user } = await openSettings()
    await user.click(topic('AI tools'))
    await user.click(screen.getByRole('button', { name: 'Install' }))
    expect(bridge.install).toHaveBeenCalledWith(['codex'])
    expect(bridge.copyAndOpenTerminal).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull()
    const steps: [Parameters<typeof progress>[1], Parameters<typeof progress>[2], string][] = [
      ['install', 'downloading', 'Downloading the Codex installer from chatgpt.com'],
      ['install', 'installing', 'Installing Codex'],
      ['install', 'installed', 'Codex is installed'],
      ['signIn', 'opening_browser', 'Opening your browser to sign in to Codex'],
      ['signIn', 'slow', 'Waiting for you to sign in to Codex, in your browser'],
      ['signIn', 'done', 'Signed in to Codex']
    ]
    for (const [step, status, words] of steps) {
      progress('codex', step, status)
      expect(screen.getByText(words)).toBeInTheDocument()
    }
    emit('tools_changed', { tools: [TOOLS[0], inState(TOOLS[1], 'ready', { path: '/Users/test/.local/bin/codex', version: 'codex-cli 0.165.0' })] })
    await endInstall({ outcome: 'done' })
    await waitFor(() => expect(screen.queryByText('Signed in to Codex')).toBeNull())
  })

  test('a too-old tool updates, and a signed-out one signs in, from the row; stuck, the row offers the paste command', async () => {
    bridge.getTools.mockResolvedValue([inState(TOOLS[0], 'too_old', { version: '2.1.200 (Claude Code)' }), inState(TOOLS[1], 'signed_out', { path: '/opt/homebrew/bin/codex', version: 'codex-cli 0.165.0' })])
    const { user } = await openSettings()
    await user.click(topic('AI tools'))
    await user.click(await screen.findByRole('button', { name: 'Update' }))
    expect(bridge.install).toHaveBeenLastCalledWith(['claude'])
    progress('claude', 'install', 'failed', 'The download failed.')
    await endInstall({ outcome: 'failed' })
    expect(screen.getByText('The download failed.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sign in again' }))
    expect(bridge.install).toHaveBeenLastCalledWith(['codex'])
    progress('codex', 'signIn', 'stuck')
    await user.click(screen.getByRole('button', { name: 'Browser didn’t open? Open the sign-in page' }))
    expect(bridge.openSignInPage).toHaveBeenCalled()
    const copies = screen.getAllByRole('button', { name: 'Copy and open Terminal' })
    await user.click(copies[copies.length - 1])
    expect(bridge.cancelInstall).toHaveBeenCalledTimes(1)
    expect(bridge.copyAndOpenTerminal).toHaveBeenCalledWith(['codex'])
  })
})
