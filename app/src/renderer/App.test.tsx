// The app shell on the fake bridge: how it starts, how the sidebar and the menus move between
// pages, the report page around the engine's frame (its other reports, ⌘1 / ⌘2, the flag sheet,
// find), the prediction log, and the engine's notes.

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { App } from './App'
import { openReport, renderApp, win } from './test/app'
import { bridge, download, emit, fail, flag, inState, menu, ok, PREDICTIONS, settings, TOOLS } from './test/bridge'
import { setSize, setWindowWidth, sizeReportPage } from './test/screen'

const sidebar = () => within(screen.getByRole('complementary', { name: 'Sidebar' }))
const chartPane = () => screen.getByRole('region', { name: 'Price chart' })
const toolbarTitle = () => document.querySelector('.top .ttl')?.textContent
const frameHeading = () => {
  const frame = document.querySelector('iframe.report-frame.on') as HTMLIFrameElement | null
  return frame?.getAttribute('srcdoc')?.match(/<h1>(.*?)<\/h1>/)?.[1]
}

describe('starting', () => {
  test('opens on the home page once setup is done, and grades what has come due', async () => {
    await renderApp()
    expect(win()).toHaveClass('on-home')
    expect(screen.getByRole('heading', { name: 'Which company today?' })).toBeInTheDocument()
    expect(bridge.gradeDue).toHaveBeenCalledTimes(1)
    expect(sidebar().getByRole('button', { name: /New report/ })).toHaveAttribute('aria-current', 'page')
  })

  test('opens on setup until setup is done, where the menus do nothing', async () => {
    await renderApp({ setupDone: false })
    expect(win()).toHaveClass('on-setup')
    menu('settings')
    menu('new')
    expect(win()).toHaveClass('on-setup')
    expect(bridge.gradeDue).not.toHaveBeenCalled()
  })

  test('says it is starting after a second, gives up after 20, and Try again asks again', async () => {
    vi.useFakeTimers()
    try {
      bridge.getSettings.mockReturnValue(new Promise(() => undefined))
      render(<App />)
      expect(screen.queryByText('Starting Tearsheet…')).toBeNull()
      await act(() => vi.advanceTimersByTimeAsync(1000))
      expect(screen.getByRole('status')).toHaveTextContent('Starting Tearsheet…')
      await act(() => vi.advanceTimersByTimeAsync(19_000))
      expect(screen.getByRole('alert')).toHaveTextContent('Tearsheet’s engine didn’t answer within 20 seconds.')
      bridge.getSettings.mockResolvedValue(ok(settings()))
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(win()).toHaveClass('on-home')
    } finally {
      vi.useRealTimers()
    }
  })

  test('says why the engine can’t start', async () => {
    bridge.getSettings.mockResolvedValue(fail('Python wasn’t found.'))
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Python wasn’t found.')
    bridge.getSettings.mockRejectedValue(new Error('The engine crashed.'))
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('The engine crashed.')).toBeInTheDocument()
  })
})

describe('moving between pages', () => {
  test('the sidebar opens each page and marks the one on show', async () => {
    const { user } = await renderApp()
    await user.click(sidebar().getByRole('button', { name: /Prediction log/ }))
    expect(win()).toHaveClass('on-log')
    expect(sidebar().getByRole('button', { name: /Prediction log/ })).toHaveAttribute('aria-current', 'page')
    await user.click(sidebar().getByRole('button', { name: /Settings/ }))
    expect(win()).toHaveClass('on-settings')
    await openReport(user, 'MSFT')
    expect(win()).toHaveClass('on-report')
    expect(sidebar().getByRole('button', { name: /^MSFT/ })).toHaveAttribute('aria-current', 'page')
    await user.click(sidebar().getByRole('button', { name: /New report/ }))
    expect(win()).toHaveClass('on-home')
  })

  test('⌘N, ⌘, and ⌘[ / ⌘] move through the pages and the companies, wrapping at the ends', async () => {
    const { user } = await renderApp()
    menu('settings')
    expect(win()).toHaveClass('on-settings')
    menu('log')
    expect(win()).toHaveClass('on-log')
    menu('new')
    expect(win()).toHaveClass('on-home')
    menu('next')
    await waitFor(() => expect(bridge.getReport).toHaveBeenLastCalledWith('r-aapl-2', expect.anything()))
    menu('next')
    await waitFor(() => expect(bridge.getReport).toHaveBeenLastCalledWith('r-msft-1', expect.anything()))
    menu('next')
    await waitFor(() => expect(bridge.getReport).toHaveBeenLastCalledWith('r-aapl-2', expect.anything()))
    menu('prev')
    await waitFor(() => expect(bridge.getReport).toHaveBeenLastCalledWith('r-msft-1', expect.anything()))
    expect(sidebar().getByRole('button', { name: /^MSFT/ })).toHaveAttribute('aria-current', 'page')
    await user.click(sidebar().getByRole('button', { name: /Settings/ }))
    menu('prev')
    await waitFor(() => expect(win()).toHaveClass('on-report'))
  })

  test('the sidebar’s status line follows grading, a refused key and a sign-out', async () => {
    let graded: (v: ReturnType<typeof ok<{ graded: number }>>) => void = () => undefined
    bridge.gradeDue.mockReturnValue(new Promise((resolve) => (graded = resolve)))
    await renderApp()
    expect(screen.getByText('Grading past predictions')).toBeInTheDocument()
    await act(async () => graded(ok({ graded: 1 })))
    expect(screen.getByText('Claude Code ready')).toBeInTheDocument()
    // Graded, so the home page asks for the predictions again.
    expect(bridge.listPredictions).toHaveBeenCalledTimes(2)
  })
})

describe('the report page', () => {
  test('shows the report’s top bar, and the date opens the company’s other reports', async () => {
    const { user } = await renderApp()
    await openReport(user)
    expect(screen.getByRole('heading', { name: 'AAPL, Apple Inc.' })).toBeInTheDocument()
    expect(within(document.querySelector('.top .rbar-line') as HTMLElement).getByText('$230.10')).toBeInTheDocument()
    expect(frameHeading()).toBe('AAPL summary text')

    await user.click(await screen.findByRole('button', { name: 'Nov 5' }))
    const others = within(screen.getByRole('menu', { name: 'Other reports' }))
    expect(others.getByRole('menuitem', { name: /Report of Oct 1\s*Hold/ })).toHaveFocus()
    await user.keyboard('{ArrowDown}{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'Nov 5' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Nov 5' }))
    await user.click(screen.getByRole('menuitem', { name: /Report of Oct 1/ }))
    await waitFor(() => expect(bridge.getReport).toHaveBeenLastCalledWith('r-aapl-1', expect.anything()))
    await waitFor(() => expect(frameHeading()).toBe('AAPL summary text'))
    expect(await screen.findByRole('button', { name: 'Oct 1' })).toBeInTheDocument()
  })

  test('⌘1 and ⌘2 load the Summary or the Full report', async () => {
    const { user } = await renderApp()
    await openReport(user)
    menu('full')
    await waitFor(() => expect(frameHeading()).toBe('AAPL full text'))
    expect(bridge.getReport).toHaveBeenLastCalledWith('r-aapl-2', expect.objectContaining({ view: 'full', column: 'auto', narrow: false }))
    menu('summary')
    await waitFor(() => expect(frameHeading()).toBe('AAPL summary text'))
  })

  test('the window crossing 1,100 px never loads the report again', async () => {
    const { user } = await renderApp()
    await openReport(user)
    await waitFor(() => expect(frameHeading()).toBe('AAPL summary text'))
    const asked = bridge.getReport.mock.calls.length
    setWindowWidth(1000)
    setWindowWidth(1280)
    setWindowWidth(1000)
    expect(bridge.getReport.mock.calls.length).toBe(asked)
  })

  test('a narrow window asks for the same layout as a wide one, and the chart stays beside the report', async () => {
    setWindowWidth(900)
    const { user } = await renderApp()
    await user.click(screen.getByRole('button', { name: 'Show the sidebar' }))
    await openReport(user)
    sizeReportPage(900)
    // The report lays itself out by its own width; the window's width never changes what is asked.
    expect(bridge.getReport).toHaveBeenLastCalledWith('r-aapl-2', expect.objectContaining({ narrow: false }))
    menu('chart')
    expect(chartPane().style.width).toBe('450px')
    expect(screen.getByRole('separator', { name: 'Resize the chart' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Full' })).toBeInTheDocument()
    expect(document.querySelector('.rpage')).not.toHaveClass('full')
    expect(screen.queryByRole('group', { name: 'Beside the chart' })).toBeNull()
  })

  test('resizing the window keeps the chart beside the report at its share, with no glide', async () => {
    const { user } = await renderApp()
    sizeReportPage()
    await openReport(user)
    menu('chart')
    const page = () => document.querySelector('.rpage') as HTMLElement
    expect(chartPane().style.width).toBe('524px')
    // Across the 1,100 px line, where the sidebar goes over the page: still beside the report, at half.
    for (const [windowW, pageW] of [[1100, 868], [1099, 1099], [960, 960], [1280, 1048]]) {
      setWindowWidth(windowW)
      setSize('.rpage', pageW, 760)
      expect(chartPane().style.width).toBe(`${Math.round(pageW / 2)}px`)
      expect(screen.getByRole('separator', { name: 'Resize the chart' })).toBeInTheDocument()
      // The chart follows the window at once: its width doesn't glide (chart.css).
      expect(page()).toHaveClass('resizing')
    }
    // A width button still glides the divider to its place.
    await user.click(screen.getByRole('button', { name: 'Wide' }))
    expect(chartPane().style.width).toBe('699px')
    expect(page()).not.toHaveClass('resizing')
  })

  test('a report that doesn’t open says why, and Try again asks again', async () => {
    const { user } = await renderApp()
    bridge.getReport.mockResolvedValueOnce(fail('The report file is missing.'))
    await user.click(sidebar().getByRole('button', { name: /^AAPL/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The report didn’t open. The report file is missing.')
    // The toolbar names the report from the sidebar's row while it can't load.
    expect(screen.getByRole('heading', { name: 'AAPL, Apple Inc.' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(frameHeading()).toBe('AAPL summary text'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('a Flag link opens the flag sheet with the claim, and saves the note', async () => {
    const { user } = await renderApp()
    await openReport(user)
    flag('c1')
    const sheet = within(screen.getByRole('dialog', { name: 'Flag this claim' }))
    expect(sheet.getByText('Revenue grew 6% last year.')).toBeInTheDocument()
    expect(sheet.getByRole('textbox', { name: 'What looks wrong?' })).toHaveFocus()

    bridge.flagClaim.mockResolvedValueOnce(fail('The review queue is full.'))
    await user.keyboard('The filing says 5%.')
    await user.click(sheet.getByRole('button', { name: 'Save flag' }))
    expect(await sheet.findByRole('alert')).toHaveTextContent('The flag wasn’t saved. The review queue is full.')
    expect(sheet.getByRole('textbox')).toHaveValue('The filing says 5%.')

    await user.keyboard('{Meta>}{Enter}{/Meta}')
    expect(bridge.flagClaim).toHaveBeenLastCalledWith('r-aapl-2:c1', 'The filing says 5%.')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Flag this claim' })).toBeNull())
    expect(screen.getByText('Flag saved')).toBeInTheDocument()
  })

  test('the flag sheet closes with Cancel, Esc or a click outside it, and goes with its report', async () => {
    const { user } = await renderApp()
    await openReport(user)
    flag('c1')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    flag('nope')
    expect(screen.getByRole('dialog', { name: 'Flag this claim' })).not.toHaveTextContent('Revenue grew')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    flag('c1')
    fireEvent.mouseDown(document.querySelector('.scrim')!)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    flag('c1')
    menu('settings')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('⌘F finds in the page; Return goes on, Shift-Return goes back, Esc stops', async () => {
    const { user } = await renderApp()
    await openReport(user)
    menu('find')
    const find = screen.getByRole('textbox', { name: 'Find in the page' })
    expect(find).toHaveFocus()
    await user.keyboard('rev')
    expect(bridge.find).toHaveBeenLastCalledWith('rev', true)
    await user.keyboard('{Enter}')
    expect(bridge.find).toHaveBeenLastCalledWith('rev', true)
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(bridge.find).toHaveBeenLastCalledWith('rev', false)
    await user.clear(find)
    expect(bridge.stopFind).toHaveBeenCalledTimes(1)
    await user.type(find, 'x{Escape}')
    expect(bridge.stopFind).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('textbox', { name: 'Find in the page' })).toBeNull()

    // Finding belongs to the page it started on.
    menu('find')
    await user.click(screen.getByRole('button', { name: 'Close find' }))
    expect(screen.queryByRole('search')).toBeNull()
    menu('find')
    menu('settings')
    expect(screen.queryByRole('search')).toBeNull()
    expect(bridge.stopFind).toHaveBeenCalledTimes(4)
  })
})

describe('the prediction log', () => {
  test('lists the logged reports and grades what is due', async () => {
    const { user } = await renderApp()
    await user.click(sidebar().getByRole('button', { name: /Prediction log/ }))
    const row = (await screen.findByRole('cell', { name: 'AAPL' })).closest('[role="row"]') as HTMLElement
    expect(within(row).getByText('Buy')).toBeInTheDocument()
    expect(within(row).getByText('$250.00')).toBeInTheDocument()
    // The row's arrow opens its report.
    expect(within(row).getByRole('button', { name: 'Open the AAPL report' })).toBeInTheDocument()
    expect(toolbarTitle()).toBe('Prediction log1 logged, 0 graded')
    expect(screen.getByText('Nothing graded yet')).toBeInTheDocument()

    bridge.gradeDue.mockResolvedValue(ok({ graded: 2 }))
    await user.click(screen.getByRole('button', { name: 'Grade what is due' }))
    expect(await screen.findByText('Graded 2 new horizons.')).toBeInTheDocument()
  })

  test('says when nothing is logged yet', async () => {
    bridge.listPredictions.mockResolvedValue(ok([]))
    const { user } = await renderApp()
    await user.click(sidebar().getByRole('button', { name: /Prediction log/ }))
    expect(await screen.findByText('No official predictions yet')).toBeInTheDocument()
    expect(toolbarTitle()).toBe('Prediction logNothing logged yet')
    // The log shows ratings and ranges, so it carries the line too (launch-readiness M5).
    expect(screen.getByText(/General research, not personalised investment advice\./)).toBeInTheDocument()
    // Nothing is logged, so there is nothing to grade.
    expect(screen.queryByRole('button', { name: 'Grade what is due' })).toBeNull()
  })

  test('says so when the log doesn’t load', async () => {
    bridge.listPredictions.mockResolvedValue(fail('The database is locked.'))
    const { user } = await renderApp()
    await user.click(sidebar().getByRole('button', { name: /Prediction log/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The prediction log didn’t load. The database is locked.')
  })

  test('a graded prediction shows its grade', async () => {
    bridge.listPredictions.mockResolvedValue(ok([{ ...PREDICTIONS[0], grades: [{ horizon_months: 3, graded_at: '2026-11-01', grading_version: 1, start_price: 210, hit: true, excess: 0.04, company_return: 0.09, end_date: '2026-11-01', inside_range: true }] }]))
    const { user } = await renderApp()
    await user.click(sidebar().getByRole('button', { name: /Prediction log/ }))
    expect(await screen.findByText('3 mo hit')).toBeInTheDocument()
    expect(screen.queryByText('Nothing graded yet')).toBeNull()
  })
})

describe('the engine’s notes', () => {
  test('a restart, a cleared filing and a fatal error are told', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      await renderApp({ advanceTimers: vi.advanceTimersByTime })
      emit('engine_restarted')
      expect(screen.getByText('The engine stopped and was restarted')).toBeInTheDocument()
      emit('reread_done', { accession: '0000320193-26-000010' })
      expect(screen.getByText('Saved evidence for 0000320193-26-000010 was cleared')).toBeInTheDocument()
      expect(screen.queryByText('The engine stopped and was restarted')).toBeNull()
      // A notice goes by itself after a few seconds.
      await act(() => vi.advanceTimersByTimeAsync(5100))
      expect(screen.queryByText(/Saved evidence/)).toBeNull()
      emit('engine_fatal', { message: 'The engine can’t start: its database is damaged.' })
      expect(screen.getByRole('alert')).toHaveTextContent('its database is damaged')
    } finally {
      vi.useRealTimers()
    }
  })

  test('a finished run reads the settings again, so a key that stopped working shows', async () => {
    await renderApp()
    bridge.getSettings.mockResolvedValue(ok(settings({ rejected_keys: ['massive'] })))
    emit('run_failed', { run_id: 'someone-else', message: 'x', code: 'ENGINE_ERROR' })
    expect(await screen.findByText('Massive key not accepted')).toBeInTheDocument()
  })
})

describe('the AI tools and the safety check', () => {
  const chip = (name: RegExp) => screen.getByRole('button', { name })
  const details = () => within(screen.getByRole('dialog', { name: 'Safety check details' }))

  test('the tools arrive from the main process when they change, and the window never polls', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      await renderApp({ advanceTimers: vi.advanceTimersByTime })
      expect(sidebar().getByText('Claude Code ready')).toBeInTheDocument()
      const asked = bridge.getTools.mock.calls.length
      await act(() => vi.advanceTimersByTimeAsync(10_000))
      expect(bridge.getTools.mock.calls.length).toBe(asked)
      emit('tools_changed', { tools: [inState(TOOLS[0], 'signed_out'), TOOLS[1]] })
      expect(sidebar().getByText('Claude Code signed out')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent('Claude Code is signed out')
      // Something else in the note changes nothing.
      emit('tools_changed', { tools: 'none' })
      expect(sidebar().getByText('Claude Code signed out')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  test('only a signed-out state counts as signed out', async () => {
    bridge.getTools.mockResolvedValue([inState(TOOLS[0], 'cant_tell'), TOOLS[1]])
    await renderApp()
    expect(sidebar().getByText('Claude Code ready')).toBeInTheDocument()
    expect(screen.queryByText('Claude Code is signed out')).toBeNull()
  })

  test('a check under way when the window opens shows its real count and minutes, and Stop the check stops it after this call', async () => {
    const started = new Date(Date.now() - 3 * 60_000 - 5_000).toISOString()
    bridge.getSettings.mockResolvedValue(ok(settings({ safety_running: { tool: 'claude', n: 8, total: 25, started_at: started } })))
    const { user } = await renderApp()
    expect(sidebar().getByText('Safety check, 8 of 25')).toBeInTheDocument()
    await user.click(chip(/^Safety check, 8 of 25, 3 min so far\. Show what it checks\.$/))
    expect(details().getByText('Tearsheet sends Claude 25 short test requests and makes sure that:')).toBeInTheDocument()
    await user.click(details().getByRole('button', { name: 'Stop the check' }))
    expect(bridge.cancelSafetyCheck).toHaveBeenCalledTimes(1)
    expect(await details().findByText('Stopping after this call')).toBeInTheDocument()
    // The calls go on until the one in progress ends; the stop is kept.
    emit('safety_progress', { tool: 'claude', n: 9, total: 25 })
    expect(details().getByText('Stopping after this call')).toBeInTheDocument()
    // Once it ends, the chip goes, and the stored checks are read again.
    const asked = bridge.getSettings.mock.calls.length
    emit('safety_done', { tool: 'claude', passed: false, finished: false, reason: 'You stopped the safety check.' })
    expect(screen.queryByRole('dialog', { name: 'Safety check details' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Safety check, / })).toBeNull()
    await waitFor(() => expect(bridge.getSettings.mock.calls.length).toBeGreaterThan(asked))
  })

  test('the chip’s details close with a click elsewhere, and a stop the engine refuses says so', async () => {
    const { user } = await renderApp()
    emit('safety_progress', { tool: 'codex', n: 2, total: 25 })
    await user.click(chip(/^Safety check, 2 of 25/))
    expect(details().getByText(/Tearsheet sends Codex 25 short test requests/)).toBeInTheDocument()
    await user.click(chip(/^Safety check, 2 of 25/))
    expect(screen.queryByRole('dialog', { name: 'Safety check details' })).toBeNull()
    await user.click(chip(/^Safety check, 2 of 25/))
    bridge.cancelSafetyCheck.mockResolvedValueOnce(fail('The engine is busy.'))
    await user.click(details().getByRole('button', { name: 'Stop the check' }))
    expect(await screen.findByText('The safety check didn’t stop')).toBeInTheDocument()
    expect(screen.getByText('The engine is busy.')).toBeInTheDocument()
    // A check that had already ended: nothing to stop.
    bridge.cancelSafetyCheck.mockResolvedValueOnce(ok({ stopping: false }))
    await user.click(details().getByRole('button', { name: 'Stop the check' }))
    expect(details().getByRole('button', { name: 'Stop the check' })).toBeInTheDocument()
    bridge.cancelSafetyCheck.mockRejectedValueOnce(new Error('gone'))
    await user.click(details().getByRole('button', { name: 'Stop the check' }))
    expect(await screen.findByText('Tearsheet’s engine didn’t answer.')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('dialog', { name: 'Safety check details' })).toBeNull()
  })

  test('a safety check whose start is refused says why', async () => {
    bridge.getSettings.mockResolvedValue(ok(settings({ lockdown: { claude: { version: '2.1.3', passed: false, form: null, checked_at: null, blocked_reason: 'lockdown_failed' } } })))
    bridge.runSafetyCheck.mockRejectedValue(new Error('gone'))
    const { user } = await renderApp()
    await user.click(await screen.findByRole('button', { name: 'Run the check again' }))
    expect(await screen.findByText('The safety check didn’t start.')).toBeInTheDocument()
  })
})

describe('downloads from the end of the report', () => {
  test('a saved file shows as a toast whose Show in Finder asks for that file', async () => {
    const { user } = await renderApp()
    download({ state: 'saving', kind: 'pdf', reportId: 'rep-1' })
    expect(await screen.findByText('Making the PDF…')).toBeInTheDocument()
    download({ state: 'saved', kind: 'pdf', reportId: 'rep-1', name: 'JPM Tearsheet 7 Nov 2026.pdf', path: '/d/JPM Tearsheet 7 Nov 2026.pdf' })
    expect(await screen.findByText('Saved to Downloads')).toBeInTheDocument()
    expect(screen.getByText('JPM Tearsheet 7 Nov 2026.pdf')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show in Finder' }))
    expect(bridge.showDownload).toHaveBeenCalledWith('/d/JPM Tearsheet 7 Nov 2026.pdf')
  })

  test('a failure says why', async () => {
    await renderApp()
    download({ state: 'failed', kind: 'xlsx', reportId: 'rep-1', message: 'Tearsheet isn’t allowed to save in Downloads.' })
    expect(await screen.findByText('The Excel workbook wasn’t saved')).toBeInTheDocument()
    expect(screen.getByText('Tearsheet isn’t allowed to save in Downloads.')).toBeInTheDocument()
  })
})
