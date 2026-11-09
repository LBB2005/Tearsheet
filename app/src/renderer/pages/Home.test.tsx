// The home page (New report): the look-up field, the companies to try or reopen, the problems at
// the top, and what happens once a report starts: the run view, its steps, Cancel and Resume, and
// the report opening when it is ready. Also the look-up box (⌘K) on the other pages.

import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { FAILURES } from '../../shared/install'
import { renderApp, win } from '../test/app'
import { bridge, emit, endInstall, fail, inState, line, lineItem, menu, ok, progress, settings, TOOLS } from '../test/bridge'

const field = () => screen.getByRole('combobox', { name: 'Look up a company' })
const hits = () => within(screen.getByRole('listbox', { name: 'Companies' }))
const toolbarTitle = () => document.querySelector('.top .ttl')?.textContent

describe('the look-up field', () => {
  test('searches as you type, and the arrows move through the companies', async () => {
    const { user } = await renderApp()
    expect(field()).toHaveFocus()
    await user.type(field(), 'a')
    expect(bridge.searchCompanies).toHaveBeenLastCalledWith('a', 5)
    expect(await hits().findByRole('option', { name: /AAPL/ })).toHaveAttribute('aria-selected', 'true')
    expect(hits().getByText('Report from Nov 5')).toBeInTheDocument()
    expect(hits().getByText('Peers: the S&P 500’s Information Technology companies')).toBeInTheDocument()

    await user.clear(field())
    await user.type(field(), 'n')
    expect(await hits().findByRole('option', { name: /NVDA/ })).toBeInTheDocument()
    expect(hits().getByText('New report')).toBeInTheDocument()

    await user.clear(field())
    bridge.searchCompanies.mockResolvedValueOnce(ok([]))
    await user.type(field(), 'zz')
    expect(await screen.findByText('No S&P 500 company matches “zz”. Tearsheet covers the S&P 500 only.')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(field()).toHaveValue('')
  })

  test('Return starts a report on the company picked, and the run view takes the page', async () => {
    const { user } = await renderApp()
    bridge.searchCompanies.mockResolvedValue(ok([
      { ticker: 'NVDA', name: 'NVIDIA Corp', sector: null, cik: 1045810, report_id: null, report_date: null },
      { ticker: 'NFLX', name: 'Netflix', sector: null, cik: 1065280, report_id: null, report_date: null }
    ]))
    await user.type(field(), 'n')
    await hits().findByRole('option', { name: /NFLX/ })
    await user.keyboard('{ArrowDown}')
    expect(hits().getByRole('option', { name: /NFLX/ })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowDown}{ArrowUp}{ArrowUp}{ArrowUp}')
    expect(hits().getByRole('option', { name: /NFLX/ })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Enter}')
    expect(bridge.runReport).toHaveBeenCalledWith('NFLX')
    expect(await screen.findByRole('region', { name: 'Report progress' })).toBeInTheDocument()
    expect(toolbarTitle()).toBe('NFLXWriting the report, about 5 min left')
  })

  test('a report that doesn’t start says why in the field’s place', async () => {
    const { user } = await renderApp()
    bridge.runReport.mockResolvedValue(fail('busy', 'GRADING_IN_PROGRESS'))
    await user.type(field(), 'a')
    await user.click(await hits().findByRole('option', { name: /AAPL/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Tearsheet is grading past predictions first. Try again in a few minutes.')
    expect(screen.queryByRole('listbox')).toBeNull()
    await user.type(field(), 'p')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('a look-up that fails says so', async () => {
    const { user } = await renderApp()
    bridge.searchCompanies.mockResolvedValue(fail('The company list didn’t load.'))
    await user.type(field(), 'x')
    expect(await screen.findByText('The company list didn’t load.')).toBeInTheDocument()
  })
})

describe('below the field', () => {
  test('a new user is offered four companies to try', async () => {
    bridge.listCompanies.mockResolvedValue(ok([]))
    const { user } = await renderApp()
    expect(await screen.findByText('Try')).toBeInTheDocument()
    expect(screen.getByText('Your reports will show here.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Costco' }))
    expect(bridge.runReport).toHaveBeenCalledWith('COST')
  })

  test('a returning user gets their recent companies, which open their reports', async () => {
    const { user } = await renderApp()
    const recent = screen.getByText('Recent').parentElement as HTMLElement
    await user.click(within(recent).getByRole('button', { name: /MSFT/ }))
    expect(win()).toHaveClass('on-report')
    await waitFor(() => expect(bridge.getReport).toHaveBeenCalledWith('r-msft-1', expect.objectContaining({ view: 'summary' })))
  })

  test('“Since you were last here” offers to add a missing FRED key, with FRED’s notice and terms', async () => {
    bridge.getSettings.mockResolvedValue(ok(settings({ keys: { massive: 'set', fred: 'missing' } })))
    const { user } = await renderApp()
    expect(await screen.findByText('Since you were last here')).toBeInTheDocument()
    expect(screen.getByText('A FRED key is optional and free, and takes about 2 minutes to get.')).toBeInTheDocument()
    expect(screen.getByText(/^This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St\. Louis\./)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'FRED’s terms' }))
    expect(bridge.openExternal).toHaveBeenCalledWith('https://fred.stlouisfed.org/docs/api/terms_of_use.html')
    await user.click(screen.getByRole('button', { name: 'Add key' }))
    expect(win()).toHaveClass('on-settings')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Data keys')
  })
})

describe('problems at the top', () => {
  test('with the button off, a signed-out tool’s Sign in again copies the command and opens Terminal, and the box goes once the main process sees the sign-in', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      bridge.getInstallButton.mockResolvedValue(false)
      bridge.getTools.mockResolvedValue([inState(TOOLS[0], 'signed_out'), TOOLS[1]])
      const { user } = await renderApp({ advanceTimers: vi.advanceTimersByTime })
      expect(await screen.findByRole('alert')).toHaveTextContent('Claude Code is signed out')
      expect(screen.getByText('Claude Code signed out')).toBeInTheDocument()
      expect(bridge.windowState).not.toHaveBeenCalled()
      await user.click(screen.getByRole('button', { name: 'Sign in again' }))
      expect(bridge.copyAndOpenTerminal).toHaveBeenCalledWith(['claude'])
      expect(await screen.findByText('The command is copied, and a new Terminal window is open. Paste it there (⌘V) and press Return. Your browser opens so you can sign in.')).toBeInTheDocument()
      expect(screen.getByText('Waiting for you to sign in')).toBeInTheDocument()
      // The window waits on the person; the main process reads the tools, and the window never polls.
      expect(bridge.windowState).toHaveBeenCalledWith({ waiting: true })
      const asked = bridge.getTools.mock.calls.length
      await act(() => vi.advanceTimersByTimeAsync(2100))
      expect(bridge.getTools.mock.calls.length).toBe(asked)
      // Copy and open Terminal again asks the main process again.
      await user.click(screen.getByRole('button', { name: 'Copy and open Terminal again' }))
      expect(bridge.copyAndOpenTerminal).toHaveBeenCalledTimes(2)
      emit('tools_changed', { tools: TOOLS })
      await waitFor(() => expect(screen.queryByText('Claude Code is signed out')).toBeNull())
      expect(screen.getByText('Claude Code ready')).toBeInTheDocument()
      expect(bridge.windowState).toHaveBeenLastCalledWith({ waiting: false })
    } finally {
      vi.useRealTimers()
    }
  })

  test('a failed safety check can be run again from the red box, and its chip shows in the toolbar while it runs', async () => {
    bridge.getSettings.mockResolvedValue(ok(settings({ lockdown: { claude: { version: '2.1.3', passed: false, form: null, checked_at: null, blocked_reason: 'lockdown_failed' } } })))
    const { user } = await renderApp()
    expect(await screen.findByRole('alert')).toHaveTextContent('Claude Code didn’t pass the safety check')
    await user.click(screen.getByRole('button', { name: 'Run the check again' }))
    expect(bridge.runSafetyCheck).toHaveBeenCalledWith('claude')
    expect(await within(screen.getByRole('complementary', { name: 'Sidebar' })).findByText('Safety check, 0 of 25')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Safety check, 0 of 25, under 1 min so far\. Show what it checks\.$/ })).toBeInTheDocument()
  })

  test('a safety check that won’t start says why in the box', async () => {
    bridge.getSettings.mockResolvedValue(ok(settings({ lockdown: { claude: { version: '2.1.3', passed: false, form: null, checked_at: null, blocked_reason: 'lockdown_failed' } } })))
    bridge.runSafetyCheck.mockResolvedValue(fail('A report is running.'))
    const { user } = await renderApp()
    await user.click(await screen.findByRole('button', { name: 'Run the check again' }))
    expect(await screen.findByText('A report is running.')).toBeInTheDocument()
  })

  test('a run a sign-out stopped offers the same Sign in again in its red box (the button off)', async () => {
    bridge.getInstallButton.mockResolvedValue(false)
    const { user } = await renderApp()
    await user.type(field(), 'nv')
    await user.click(await hits().findByRole('option', { name: /NVDA/ }))
    await screen.findByRole('region', { name: 'Report progress' })
    emit('run_failed', { run_id: 'run-new', message: 'Claude Code is signed out.', code: 'AUTH_EXPIRED', step: 'narrate', fix_command: 'claude auth login' })
    const box = within(await screen.findByRole('alert'))
    expect(box.queryByText(/claude auth login/)).toBeNull()
    await user.click(box.getByRole('button', { name: 'Sign in again' }))
    expect(bridge.copyAndOpenTerminal).toHaveBeenCalledWith(['claude'])
    expect(await box.findByText(/^The command is copied, and a new Terminal window is open\./)).toBeInTheDocument()
    expect(box.getByRole('button', { name: 'Resume' })).toBeInTheDocument()
  })

  test('a missing or refused Massive key opens Data keys', async () => {
    bridge.getSettings.mockResolvedValue(ok(settings({ rejected_keys: ['massive'] })))
    const { user } = await renderApp()
    expect(await screen.findByText('Massive stopped accepting your key')).toBeInTheDocument()
    expect(screen.getByText('Massive key not accepted')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Replace the key' }))
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Data keys')
  })
})

describe('a report and the safety check', () => {
  const sidebar = () => within(screen.getByRole('complementary', { name: 'Sidebar' }))
  const waiting = () => within(screen.getByRole('status', { name: 'Waiting for the safety check' }))
  const pick = async (user: Awaited<ReturnType<typeof renderApp>>['user'], ticker = 'NVDA') => {
    await user.type(field(), ticker.toLowerCase().slice(0, 2))
    await user.click(await hits().findByRole('option', { name: new RegExp(ticker) }))
  }

  test('a report asked for while a check runs joins the line and waits for it, then starts', async () => {
    const { user } = await renderApp()
    emit('safety_progress', { tool: 'claude', n: 7, total: 25 })
    await pick(user)
    expect(bridge.runReport).not.toHaveBeenCalled()
    expect(bridge.addToLine).toHaveBeenCalledWith(['NVDA'])
    expect(await screen.findByText('It starts when the safety check finishes.')).toBeInTheDocument()
    // The home page shows the report waiting, with the check's progress.
    emit('line_changed', line({ waiting: [lineItem('NVDA')] }))
    expect(waiting().getByText('NVDA is in the line')).toBeInTheDocument()
    expect(waiting().getByText('Starts when the safety check finishes (7 of 25).')).toBeInTheDocument()
    emit('safety_progress', { tool: 'claude', n: 8, total: 25 })
    expect(waiting().getByText('Starts when the safety check finishes (8 of 25).')).toBeInTheDocument()
    // A second one waits behind it.
    bridge.addToLine.mockResolvedValueOnce(ok({ items: [lineItem('MSFT')], skipped: [], line: line({ waiting: [lineItem('NVDA'), lineItem('MSFT')] }) }))
    expect(field()).toHaveValue('')
    await pick(user, 'MSFT')
    expect(await screen.findByText('2 waiting. It starts when the safety check finishes and the ones before it are done.')).toBeInTheDocument()
    // The check passes, and the line starts its report: the run view follows it.
    emit('safety_done', { tool: 'claude', passed: true, finished: true })
    expect(screen.queryByRole('status', { name: 'Waiting for the safety check' })).toBeNull()
    emit('line_changed', line({ writing: lineItem('NVDA', { run_id: 'run-l1' }), waiting: [lineItem('MSFT')] }))
    expect(await screen.findByRole('region', { name: 'Report progress' })).toBeInTheDocument()
    expect(sidebar().getByRole('button', { name: /NVDA\s*writing…/ })).toBeInTheDocument()
  })

  test('on a brand-new install, the first report starts the full check and waits for it', async () => {
    bridge.getSettings.mockResolvedValue(ok(settings({ lockdown: {} })))
    const { user } = await renderApp()
    await pick(user)
    expect(bridge.runSafetyCheck).toHaveBeenCalledWith('claude')
    expect(bridge.addToLine).toHaveBeenCalledWith(['NVDA'])
    expect(bridge.runReport).not.toHaveBeenCalled()
    expect(await screen.findByText('It starts when the safety check finishes.')).toBeInTheDocument()
    expect(sidebar().getByText('Safety check, 0 of 25')).toBeInTheDocument()
  })

  test('a check that has passed while the app is open isn’t run again before a report', async () => {
    bridge.getSettings.mockResolvedValue(ok(settings({ lockdown: {} })))
    const { user } = await renderApp()
    emit('safety_done', { tool: 'claude', passed: true, finished: true })
    await pick(user)
    expect(bridge.runSafetyCheck).not.toHaveBeenCalled()
    expect(bridge.runReport).toHaveBeenCalledWith('NVDA')
  })

  test('a check that won’t start says why, and the report doesn’t join the line', async () => {
    bridge.getSettings.mockResolvedValue(ok(settings({ lockdown: {} })))
    bridge.runSafetyCheck.mockResolvedValue(fail('Tearsheet is grading past predictions first.'))
    const { user } = await renderApp()
    await pick(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Tearsheet is grading past predictions first.')
    expect(bridge.addToLine).not.toHaveBeenCalled()
  })

  test('a start the engine refuses because a check runs joins the line instead', async () => {
    bridge.runReport.mockResolvedValue(fail('The safety check is running.', 'SAFETY_CHECK_RUNNING'))
    const { user } = await renderApp()
    await pick(user)
    expect(bridge.addToLine).toHaveBeenCalledWith(['NVDA'])
    expect(await screen.findByText('It starts when the safety check finishes.')).toBeInTheDocument()
  })

  test('a resume refused while a check runs says to wait for it', async () => {
    const { user } = await renderApp()
    await pick(user)
    await screen.findByRole('region', { name: 'Report progress' })
    emit('run_failed', { run_id: 'run-new', message: 'Network down.', code: 'ENGINE_ERROR', step: 'fetch' })
    bridge.resume.mockResolvedValue(fail('The safety check is running.', 'SAFETY_CHECK_RUNNING'))
    await user.click(screen.getByRole('button', { name: 'Resume' }))
    expect(await screen.findByText('The safety check is running. Resume the report once it finishes.')).toBeInTheDocument()
  })
})

describe('a report being written', () => {
  const startNvda = async () => {
    const app = await renderApp()
    await app.user.type(field(), 'nv')
    await app.user.click(await hits().findByRole('option', { name: /NVDA/ }))
    await screen.findByRole('region', { name: 'Report progress' })
    return app
  }
  const receipt = () => within(screen.getByRole('region', { name: 'Report progress' }))
  const stage = (name: string) => receipt().getByText(name, { selector: 'b' }).closest('li') as HTMLElement
  const tally = (t: Record<string, unknown>) => emit('run_tally', { run_id: 'run-new', tally: { writer: 'Claude Code', checker: 'Codex', ...t } })

  test('writes down each stage on the receipt, with the time left in the toolbar and the sidebar', async () => {
    await startNvda()
    const sidebar = within(screen.getByRole('complementary', { name: 'Sidebar' }))
    expect(sidebar.getByRole('button', { name: /NVDA\s*writing…/ })).toHaveAttribute('aria-current', 'page')
    expect(stage('Data')).toHaveAttribute('aria-current', 'step')
    expect(within(stage('Data')).getByText('Finding the company and its peers', { selector: 'p' })).toBeInTheDocument()
    emit('progress', { run_id: 'run-new', step_name: 'resolve', state: 'done' })
    emit('progress', { run_id: 'run-new', step_name: 'fetch', state: 'started' })
    tally({ companies: 9, prices: true, facts: 9, filings: 13, fetching: 'rates' })
    expect(within(stage('Data')).getByText('Prices for 9 companies · SEC figures for 9 of 9 · 13 filings')).toBeInTheDocument()
    expect(within(stage('Data')).getByText('Treasury yields from FRED')).toBeInTheDocument()
    expect(receipt().getByText('NVDA · 8 peers')).toBeInTheDocument()
    expect(within(stage('Evidence')).getByText('Usually about 2 min')).toBeInTheDocument()
    expect(toolbarTitle()).toMatch(/^NVIDIA CorpWriting the report, about \d+ min left$/)
    expect(sidebar.getByText(/^Writing NVDA, about \d+ min left$/)).toBeInTheDocument()
    expect(receipt().getByRole('progressbar', { name: 'How far the report has got' })).toBeInTheDocument()
    // Notes for some other run change nothing.
    emit('run_tally', { run_id: 'other', tally: { companies: 2, filings: 1 } })
    expect(within(stage('Data')).getByText('Prices for 9 companies · SEC figures for 9 of 9 · 13 filings')).toBeInTheDocument()
  })

  test('lists the AI reads under way, and counts them as they finish', async () => {
    await startNvda()
    for (const step of ['resolve', 'fetch', 'normalize', 'text', 'metrics', 'score', 'value', 'rate', 'news']) emit('progress', { run_id: 'run-new', step_name: step, state: 'done' })
    emit('progress', { run_id: 'run-new', step_name: 'extract', state: 'started' })
    tally({ articles: 12, reads_total: 23, reads_done: 4, evidence: 18, now: ['10-K Item 1A (Risk factors)', 'Reuters: NVIDIA ships Rubin'] })
    expect(stage('Evidence')).toHaveAttribute('aria-current', 'step')
    expect(within(stage('Evidence')).getByText('12 recent articles · 4 of 23 AI reads done · 18 pieces of evidence')).toBeInTheDocument()
    expect(within(stage('Evidence')).getByText('10-K Item 1A (Risk factors)')).toBeInTheDocument()
    expect(within(stage('Evidence')).getByText('Reuters: NVIDIA ships Rubin')).toBeInTheDocument()
    expect(within(stage('Data')).getByText(/^\d+ s$|^\d+:\d\d$/)).toBeInTheDocument()
    tally({ articles: 12, reads_total: 23, reads_done: 23, evidence: 80, now: [] })
    expect(within(stage('Evidence')).queryByText('10-K Item 1A (Risk factors)')).toBeNull()
  })

  test('waits on a Done card with the time taken, the claims and the rating, until Open the report', async () => {
    const { user } = await startNvda()
    tally({ claims_kept: 41, claims_removed: 3, score: 58, rating: 'Hold' })
    emit('report_ready', { run_id: 'run-new', report_id: 'r-msft-1' })
    expect(await receipt().findByText(/^Done in \d+:\d\d$/)).toBeInTheDocument()
    expect(receipt().getByText('41 claims kept · 3 removed by Codex')).toBeInTheDocument()
    expect(receipt().getByText('Rated Hold')).toHaveClass('pill', 'hold')
    expect(toolbarTitle()).toBe('NVIDIA CorpThe report is ready')
    expect(screen.queryByRole('button', { name: 'Cancel run' })).toBeNull()
    const open = receipt().getByRole('button', { name: 'Open the report' })
    expect(open).toHaveFocus()
    expect(win()).toHaveClass('on-home')
    await user.click(open)
    await waitFor(() => expect(win()).toHaveClass('on-report'))
    expect(bridge.getReport).toHaveBeenCalledWith('r-msft-1', expect.anything())
    expect(bridge.listCompanies).toHaveBeenCalledTimes(3)
  })

  test('New report from the Done card goes back to the home page', async () => {
    const { user } = await startNvda()
    emit('report_ready', { run_id: 'run-new', report_id: 'r-msft-1' })
    await receipt().findByRole('button', { name: 'Open the report' })
    await user.click(screen.getByRole('button', { name: /New report/ }))
    expect(field()).toBeInTheDocument()
  })

  test('a report that is ready while you are on another page opens', async () => {
    await startNvda()
    menu('settings')
    emit('report_ready', { run_id: 'run-new', report_id: 'r-msft-1' })
    await waitFor(() => expect(win()).toHaveClass('on-report'))
  })

  test('Cancel run stops it, says so, and leaves the home page for a new one', async () => {
    const { user } = await startNvda()
    await user.click(screen.getByRole('button', { name: 'Cancel run' }))
    expect(bridge.cancel).toHaveBeenCalledWith('run-new')
    expect(await screen.findByText('Cancelled the NVDA report')).toBeInTheDocument()
    expect(field()).toBeInTheDocument()
    // A report that finishes after its cancel doesn't open.
    emit('report_ready', { run_id: 'run-new', report_id: 'r-msft-1' })
    expect(win()).toHaveClass('on-home')
  })

  test('a cancel the engine refuses, or that came too late, says so', async () => {
    const { user } = await startNvda()
    bridge.cancel.mockResolvedValueOnce(fail('No such run.')).mockResolvedValueOnce(ok({ ok: false }))
    await user.click(screen.getByRole('button', { name: 'Cancel run' }))
    expect(await screen.findByText('The report didn’t cancel')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel run' }))
    expect(await screen.findByText('The report had already finished')).toBeInTheDocument()
  })

  test('a run that stops says why, and Resume carries it on', async () => {
    const { user } = await startNvda()
    emit('progress', { run_id: 'run-new', step_name: 'resolve', state: 'done' })
    menu('settings')
    emit('run_failed', { run_id: 'run-new', message: 'You hit your usage limit.', code: 'USAGE_LIMIT', reset_at: '2026-11-07T18:00:00Z', step: 'fetch' })
    // A run that stops brings the home page back with the reason.
    expect(win()).toHaveClass('on-home')
    expect(screen.getByRole('alert')).toHaveTextContent('Your plan’s usage limit stopped the report')
    expect(screen.getByText('You hit your usage limit.')).toBeInTheDocument()
    expect(toolbarTitle()).toBe('NVIDIA CorpStopped while downloading the data')
    expect(within(stage('Data')).getByText('Stopped')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel run' })).toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()

    bridge.resume.mockResolvedValue(ok({ run_id: 'run-new', ticker: 'NVDA', name: 'NVIDIA Corp' }))
    await user.click(screen.getByRole('button', { name: 'Resume' }))
    expect(bridge.resume).toHaveBeenCalledWith('run-new')
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByRole('button', { name: 'Cancel run' })).toBeInTheDocument()
  })

  test('a resumed run takes the notes that came in while Resume was answered', async () => {
    const { user } = await startNvda()
    emit('run_failed', { run_id: 'run-new', message: 'Network down.', code: 'ENGINE_ERROR', step: 'fetch' })
    let answer: (v: unknown) => void = () => undefined
    bridge.resume.mockReturnValue(new Promise((r) => (answer = r)) as never)
    await user.click(screen.getByRole('button', { name: 'Resume' }))
    emit('progress', { run_id: 'run-new', step_name: 'resolve', state: 'done' })
    emit('progress', { run_id: 'run-new', step_name: 'fetch', state: 'started' })
    tally({ companies: 4, prices: true })
    await act(async () => answer(ok({ run_id: 'run-new', ticker: null, name: null })))
    expect(await within(stage('Data')).findByText('Prices for 4 companies')).toBeInTheDocument()
    expect(receipt().getByText('NVDA · 3 peers')).toBeInTheDocument()
  })

  test('a run the safety check stopped offers the check, not Resume', async () => {
    await startNvda()
    emit('run_failed', { run_id: 'run-new', message: 'Claude Code ran a tool.', code: 'LOCKDOWN_FAILED', step: 'narrate' })
    expect(screen.getByText('The safety check stopped the report')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run the check again' })).toBeInTheDocument()
    expect(screen.getByText('Safety check didn’t pass')).toBeInTheDocument()
  })

  test('a resume the engine refuses says why', async () => {
    const { user } = await startNvda()
    emit('engine_restarted')
    expect(await screen.findByText('The engine stopped and was restarted. You can resume the run.')).toBeInTheDocument()
    bridge.resume.mockResolvedValue(fail('That run is gone.'))
    await user.click(screen.getByRole('button', { name: 'Resume' }))
    expect(await screen.findByText('The report didn’t resume')).toBeInTheDocument()
  })

  test('New report from a stopped run puts it away', async () => {
    const { user } = await startNvda()
    emit('run_failed', { run_id: 'run-new', message: 'Network down.', code: 'ENGINE_ERROR' })
    await user.click(screen.getByRole('button', { name: /New report/ }))
    expect(field()).toBeInTheDocument()
  })
})

describe('the look-up box (⌘K)', () => {
  test('on the home page ⌘K puts the cursor in the field; elsewhere it opens the box', async () => {
    const { user } = await renderApp()
    field().blur()
    menu('lookup')
    expect(field()).toHaveFocus()
    expect(screen.queryByRole('dialog', { name: 'Look up a company' })).toBeNull()

    await user.click(screen.getByRole('button', { name: /Prediction log/ }))
    await user.click(screen.getByRole('button', { name: /Look up/ }))
    const box = within(screen.getByRole('dialog', { name: 'Look up a company' }))
    expect(box.getByRole('combobox')).toHaveFocus()
    await user.keyboard('xyz')
    bridge.searchCompanies.mockResolvedValueOnce(ok([]))
    expect(await box.findByText(/matches “xyz”/)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Look up a company' })).toBeNull())
  })

  test('picking a company with a report opens it; one without starts a report', async () => {
    const { user } = await renderApp()
    menu('settings')
    menu('lookup')
    await user.keyboard('a')
    const box = within(screen.getByRole('dialog', { name: 'Look up a company' }))
    expect(await box.findByText('Information Technology, report from Nov 5')).toBeInTheDocument()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(win()).toHaveClass('on-report'))
    expect(bridge.getReport).toHaveBeenCalledWith('r-aapl-2', expect.anything())

    menu('lookup')
    await user.keyboard('n')
    const again = within(await screen.findByRole('dialog', { name: 'Look up a company' }))
    await user.click(await again.findByRole('button', { name: /NVDA/ }))
    expect(bridge.runReport).toHaveBeenCalledWith('NVDA')
    await waitFor(() => expect(win()).toHaveClass('on-home'))
  })

  test('the arrows move, and a report that won’t start says why', async () => {
    const { user } = await renderApp()
    bridge.runReport.mockResolvedValue(fail('busy', 'RUN_IN_PROGRESS'))
    menu('settings')
    menu('lookup')
    await user.keyboard('n')
    const box = within(screen.getByRole('dialog', { name: 'Look up a company' }))
    bridge.searchCompanies.mockResolvedValue(ok([]))
    await box.findAllByRole('option')
    await user.keyboard('{ArrowDown}{ArrowUp}{Enter}')
    expect(await screen.findByText('The report didn’t start')).toBeInTheDocument()
    expect(screen.getByText('A report is already running. You can start another when it finishes.')).toBeInTheDocument()
  })
})

// First-run design item 39: with the button on, "Sign in again" runs the sign-in inside
// Tearsheet, and its progress, its two fallbacks and a failure show in the same box.
describe('Sign in again with the Install button on', () => {
  const signedOut = async () => {
    bridge.getTools.mockResolvedValue([inState(TOOLS[0], 'signed_out'), TOOLS[1]])
    const app = await renderApp()
    await screen.findByText('Claude Code is signed out')
    const box = () => within(screen.getByText('Claude Code is signed out').closest('.alert') as HTMLElement)
    return { ...app, box }
  }

  test('signs in inside Tearsheet, shows each step, and the box goes once the tool reads ready', async () => {
    const { user, box } = await signedOut()
    await user.click(box().getByRole('button', { name: 'Sign in again' }))
    expect(bridge.install).toHaveBeenCalledWith(['claude'])
    expect(bridge.copyAndOpenTerminal).not.toHaveBeenCalled()
    expect(box().getByText('Starting…')).toBeInTheDocument()
    expect(bridge.windowState).toHaveBeenLastCalledWith({ waiting: true })
    progress('claude', 'signIn', 'opening_browser')
    expect(box().getByText('Opening your browser to sign in to Claude')).toBeInTheDocument()
    // Another tool's progress isn't this box's.
    progress('codex', 'signIn', 'stuck')
    expect(box().queryByRole('button', { name: 'Copy and open Terminal' })).toBeNull()
    progress('claude', 'signIn', 'done')
    expect(box().getByText('Signed in to Claude Code')).toBeInTheDocument()
    emit('tools_changed', { tools: TOOLS })
    await endInstall({ outcome: 'done' })
    await waitFor(() => expect(screen.queryByText('Claude Code is signed out')).toBeNull())
  })

  test('offers the sign-in page at 15 seconds, and the paste command at 2 minutes, which stops the in-app sign-in first', async () => {
    const { user, box } = await signedOut()
    await user.click(box().getByRole('button', { name: 'Sign in again' }))
    progress('claude', 'signIn', 'opening_browser')
    expect(box().queryByRole('button', { name: 'Browser didn’t open? Open the sign-in page' })).toBeNull()
    progress('claude', 'signIn', 'slow')
    await user.click(box().getByRole('button', { name: 'Browser didn’t open? Open the sign-in page' }))
    expect(bridge.openSignInPage).toHaveBeenCalledTimes(1)
    expect(box().queryByRole('button', { name: 'Copy and open Terminal' })).toBeNull()
    progress('claude', 'signIn', 'stuck')
    await user.click(box().getByRole('button', { name: 'Copy and open Terminal' }))
    expect(bridge.cancelInstall).toHaveBeenCalledTimes(1)
    expect(bridge.copyAndOpenTerminal).toHaveBeenCalledWith(['claude'])
    expect(bridge.cancelInstall.mock.invocationCallOrder[0]).toBeLessThan(bridge.copyAndOpenTerminal.mock.invocationCallOrder[0])
    expect(await box().findByText(/^The command is copied, and a new Terminal window is open\./)).toBeInTheDocument()
  })

  test('a failure says why, with Try again and the paste command', async () => {
    const { user, box } = await signedOut()
    await user.click(box().getByRole('button', { name: 'Sign in again' }))
    progress('claude', 'signIn', 'failed', 'Another copy at ~/bin is found first.')
    await endInstall({ outcome: 'failed' })
    expect(box().getByText('Another copy at ~/bin is found first.')).toBeInTheDocument()
    await user.click(box().getByRole('button', { name: 'Try again' }))
    expect(bridge.install).toHaveBeenCalledTimes(2)
    await endInstall({ outcome: 'failed' })
    // No message said why: the sign-in's own words.
    expect(box().getByText(FAILURES.signIn)).toBeInTheDocument()
    await user.click(box().getByRole('button', { name: 'Copy and open Terminal' }))
    expect(bridge.cancelInstall).not.toHaveBeenCalled()
    expect(bridge.copyAndOpenTerminal).toHaveBeenCalledWith(['claude'])
  })

  test('a sign-in stopped offers Try again; an Install refused by a fresh off shows the paste command (CUJ 10)', async () => {
    const { user, box } = await signedOut()
    await user.click(box().getByRole('button', { name: 'Sign in again' }))
    progress('claude', 'signIn', 'cancelled')
    await endInstall({ outcome: 'cancelled' })
    expect(box().getByText('Signing in to Claude Code was stopped')).toBeInTheDocument()
    await user.click(box().getByRole('button', { name: 'Try again' }))
    await endInstall({ outcome: 'refused', why: 'switch_off' })
    expect(box().getByText('The Install button is off in this copy now. Paste the command in Terminal instead.')).toBeInTheDocument()
    await user.click(box().getByRole('button', { name: 'Copy and open Terminal' }))
    expect(bridge.copyAndOpenTerminal).toHaveBeenCalledWith(['claude'])
    expect(await box().findByText(/^The command is copied/)).toBeInTheDocument()
    // From now on this box uses the paste command.
    expect(bridge.install).toHaveBeenCalledTimes(2)
  })

  test('an install call that throws counts as failed', async () => {
    const { user, box } = await signedOut()
    bridge.install.mockRejectedValueOnce(new Error('gone'))
    await user.click(box().getByRole('button', { name: 'Sign in again' }))
    expect(await box().findByText(FAILURES.signIn)).toBeInTheDocument()
  })

  test('the run view’s red box signs in the same way', async () => {
    const { user } = await renderApp()
    await user.type(field(), 'nv')
    await user.click(await hits().findByRole('option', { name: /NVDA/ }))
    await screen.findByRole('region', { name: 'Report progress' })
    emit('run_failed', { run_id: 'run-new', message: 'Claude Code is signed out.', code: 'AUTH_EXPIRED', step: 'narrate', fix_command: 'claude auth login' })
    const box = within(await screen.findByRole('alert'))
    await user.click(box.getByRole('button', { name: 'Sign in again' }))
    expect(bridge.install).toHaveBeenCalledWith(['claude'])
    progress('claude', 'signIn', 'opening_browser')
    expect(box.getByText('Opening your browser to sign in to Claude')).toBeInTheDocument()
    expect(box.getByRole('button', { name: 'Resume' })).toBeInTheDocument()
  })
})
