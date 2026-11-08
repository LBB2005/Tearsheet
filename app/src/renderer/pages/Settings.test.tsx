// Settings: the six topics and what each page's buttons send to the engine. The app is opened on
// the fake bridge and Settings reached with ⌘, as a person would.

import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { renderApp } from '../test/app'
import { bridge, emit, fail, menu, ok, settings, TOOLS } from '../test/bridge'

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
      ['AI tools', 'AI tools'],
      ['Data keys', 'Data keys'],
      ['Storage and backup', 'Storage and backup'],
      ['Privacy', 'What leaves your Mac'],
      ['Advanced', 'Advanced'],
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
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(pageHeading()).toHaveTextContent('Data keys')
    expect(topic('Data keys')).toHaveFocus()
    await user.keyboard('{End}')
    expect(pageHeading()).toHaveTextContent('Advanced')
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
    expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent('What leaves your Mac')
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

  test('the chart’s first range and the animations are kept on this Mac', async () => {
    const { user } = await openSettings()
    await user.selectOptions(screen.getByRole('combobox', { name: 'The chart opens on' }), '3M')
    expect(localStorage.getItem('chart.startRange')).toBe('3M')
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
    // The sidebar's status line follows the same check.
    expect(screen.getByText('Safety check, 4 of 25')).toBeInTheDocument()
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

  test('a signed-out tool is a problem on General, and can’t run the check', async () => {
    bridge.getTools.mockResolvedValue([{ ...TOOLS[0], loggedIn: false }, TOOLS[1]])
    const { user } = await openSettings()
    expect(topic('AI tools')).toHaveTextContent('needs you')
    await user.click(screen.getByRole('button', { name: 'Open AI tools' }))
    expect(screen.getByText('Signed out')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Run again' })).toBeNull()
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

  test('the Alpha Vantage key is saved as it is, with no check', async () => {
    const { user } = await openSettings()
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

  test('advanced changes the Goal 1 round, as a whole number', async () => {
    const { user } = await openSettings()
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
