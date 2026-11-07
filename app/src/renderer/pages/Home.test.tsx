// The home page (New report): the look-up field, the companies to try or reopen, the problems at
// the top, and what happens once a report starts: the run view, its steps, Cancel and Resume, and
// the report opening when it is ready. Also the look-up box (⌘K) on the other pages.

import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { renderApp, win } from '../test/app'
import { bridge, emit, fail, menu, ok, settings, TOOLS } from '../test/bridge'

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
    expect(await screen.findByRole('img', { name: 'Step 1 of 14' })).toBeInTheDocument()
    expect(toolbarTitle()).toBe('NFLXWriting the report, step 1 of 14')
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

  test('“Since you were last here” offers to add a missing FRED key', async () => {
    bridge.getSettings.mockResolvedValue(ok(settings({ keys: { massive: 'set', fred: 'missing' } })))
    const { user } = await renderApp()
    expect(await screen.findByText('Since you were last here')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add the key' }))
    expect(win()).toHaveClass('on-settings')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Data keys')
  })
})

describe('problems at the top', () => {
  test('a signed-out tool shows the line to sign in again, and looks for the sign-in every 2 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      bridge.getTools.mockResolvedValue([{ ...TOOLS[0], loggedIn: false }, TOOLS[1]])
      const { user } = await renderApp({ advanceTimers: vi.advanceTimersByTime })
      expect(await screen.findByRole('alert')).toHaveTextContent('Claude Code is signed out')
      expect(screen.getByText('Claude Code signed out')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Sign in again' }))
      expect(screen.getByText('claude auth login')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Open Terminal' }))
      expect(bridge.openTerminal).toHaveBeenCalled()
      bridge.getTools.mockResolvedValue(TOOLS)
      await act(() => vi.advanceTimersByTimeAsync(2100))
      await waitFor(() => expect(screen.queryByText('Claude Code is signed out')).toBeNull())
      expect(screen.getByText('Claude Code ready')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  test('a failed safety check can be run again from the red box', async () => {
    bridge.getSettings.mockResolvedValue(ok(settings({ lockdown: { claude: { version: '2.1.3', passed: false, form: null, checked_at: null, blocked_reason: 'lockdown_failed' } } })))
    const { user } = await renderApp()
    expect(await screen.findByRole('alert')).toHaveTextContent('Claude Code didn’t pass the safety check')
    await user.click(screen.getByRole('button', { name: 'Run the check again' }))
    expect(bridge.runSafetyCheck).toHaveBeenCalledWith('claude')
    expect(await screen.findByText('Safety check, 0 of 25')).toBeInTheDocument()
  })

  test('a safety check that won’t start says why in the box', async () => {
    bridge.getSettings.mockResolvedValue(ok(settings({ lockdown: { claude: { version: '2.1.3', passed: false, form: null, checked_at: null, blocked_reason: 'lockdown_failed' } } })))
    bridge.runSafetyCheck.mockResolvedValue(fail('A report is running.'))
    const { user } = await renderApp()
    await user.click(await screen.findByRole('button', { name: 'Run the check again' }))
    expect(await screen.findByText('A report is running.')).toBeInTheDocument()
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

describe('a report being written', () => {
  const startNvda = async () => {
    const app = await renderApp()
    await app.user.type(field(), 'nv')
    await app.user.click(await hits().findByRole('option', { name: /NVDA/ }))
    await screen.findByRole('img', { name: 'Step 1 of 14' })
    return app
  }

  test('follows the engine’s steps in the ring, the list, the toolbar and the sidebar', async () => {
    await startNvda()
    const sidebar = within(screen.getByRole('complementary', { name: 'Sidebar' }))
    expect(sidebar.getByRole('button', { name: /NVDA\s*writing…/ })).toHaveAttribute('aria-current', 'page')
    for (const step of ['resolve', 'fetch', 'normalize']) emit('progress', { run_id: 'run-new', step_name: step, state: 'done' })
    emit('progress', { run_id: 'run-new', step_name: 'text', state: 'running' })
    expect(screen.getByRole('img', { name: 'Step 4 of 14' })).toBeInTheDocument()
    expect(screen.getByText('Split filings into sections and paragraphs').closest('li')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('Writing NVDA, step 4 of 14')).toBeInTheDocument()
    expect(toolbarTitle()).toBe('NVIDIA CorpWriting the report, step 4 of 14')
    // Notes for some other run change nothing.
    emit('progress', { run_id: 'other', step_name: 'metrics', state: 'done' })
    expect(screen.getByRole('img', { name: 'Step 4 of 14' })).toBeInTheDocument()
  })

  test('opens the report once it is ready', async () => {
    await startNvda()
    emit('report_ready', { run_id: 'run-new', report_id: 'r-msft-1' })
    await waitFor(() => expect(win()).toHaveClass('on-report'))
    expect(bridge.getReport).toHaveBeenCalledWith('r-msft-1', expect.anything())
    expect(bridge.listCompanies).toHaveBeenCalledTimes(3)
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
    expect(toolbarTitle()).toBe('NVIDIA CorpStopped at step 2 of 14')
    expect(screen.queryByRole('button', { name: 'Cancel run' })).toBeNull()

    bridge.resume.mockResolvedValue(ok({ run_id: 'run-new', ticker: 'NVDA', name: 'NVIDIA Corp' }))
    await user.click(screen.getByRole('button', { name: 'Resume' }))
    expect(bridge.resume).toHaveBeenCalledWith('run-new')
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByRole('button', { name: 'Cancel run' })).toBeInTheDocument()
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
