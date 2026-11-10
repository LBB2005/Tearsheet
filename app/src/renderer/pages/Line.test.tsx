// The line: several reports written one after another. Typing companies with commas on the home
// page, the check before anything starts (with which will be new official predictions), the run
// view following each report with Up next under it, the Done list at the end, pausing on a usage
// limit, Cancel all, adding a company while a report runs, and a line left from last time.

import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { renderApp, win } from '../test/app'
import { bridge, emit, fail, line, lineItem, menu, ok } from '../test/bridge'

const field = () => screen.getByRole('combobox', { name: 'Look up a company' })
const card = () => within(screen.getByRole('group', { name: 'Several reports' }))
const strip = () => within(screen.getByRole('region', { name: 'Up next' }))
const receipt = () => within(screen.getByRole('region', { name: 'Report progress' }))
const sidebar = () => within(screen.getByRole('complementary', { name: 'Sidebar' }))

const NVDA = (over = {}) => lineItem('NVDA', { run_id: 'run-l1', ...over })
const MSFT = (over = {}) => lineItem('MSFT', { official: false, ...over })

// Type two companies and a typo, check them, and start the line; the engine starts NVDA.
async function startLine() {
  const app = await renderApp()
  await app.user.type(field(), 'nvda, msft, zz')
  expect(screen.getByText('Return checks these 3 companies, then writes the reports one after another.')).toBeInTheDocument()
  expect(bridge.searchCompanies).not.toHaveBeenCalledWith(expect.stringContaining(','), expect.anything())
  await app.user.keyboard('{Enter}')
  expect(bridge.planLine).toHaveBeenCalledWith(['nvda', 'msft', 'zz'], expect.objectContaining({ skipRecent: true }))
  await app.user.click(await card().findByRole('button', { name: 'Start 2 reports' }))
  expect(bridge.addToLine).toHaveBeenCalledWith(['NVDA', 'MSFT'])
  emit('line_changed', line({ writing: lineItem('NVDA'), waiting: [MSFT()] }))
  // Step 1's notes come before the engine says which run it is.
  emit('progress', { run_id: 'run-l1', step_name: 'resolve', state: 'started' })
  emit('line_changed', line({ writing: NVDA(), waiting: [MSFT()] }))
  await screen.findByRole('region', { name: 'Report progress' })
  return app
}

describe('several companies at once', () => {
  test('are checked first, saying which will be new official predictions and which were left out', async () => {
    const { user } = await renderApp()
    await user.type(field(), 'nvda, msft, zz{Enter}')
    expect(card().getByText('Write 2 reports, one after another?')).toBeInTheDocument()
    expect(card().getByText('NVDA · MSFT')).toBeInTheDocument()
    expect(card().getByText('1 of these will be a new official prediction in your log. MSFT was rated in the last 30 days, so it won’t be.')).toBeInTheDocument()
    expect(card().getByText(/in all\. Keep your Mac open; Tearsheet keeps it awake until they’re done\./)).toBeInTheDocument()
    const left = within(card().getByRole('group', { name: 'Left out' }))
    expect(left.getByText('1 company wasn’t found')).toBeInTheDocument()
    expect(left.getByText(/No S&P 500 company matches 'zz'/)).toBeInTheDocument()
    expect(card().getByRole('checkbox', { name: 'Skip companies with a report from the last 30 days' })).toBeChecked()
    await user.click(card().getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: 'Several reports' })).toBeNull()
    expect(bridge.addToLine).not.toHaveBeenCalled()
  })

  test('none found says so, and changing the text puts the card away', async () => {
    const { user } = await renderApp()
    await user.type(field(), 'zz, yy{Enter}')
    expect(card().getByText('None of these can be written')).toBeInTheDocument()
    expect(card().queryByRole('button', { name: /Start/ })).toBeNull()
    await user.type(field(), 'x')
    expect(screen.queryByRole('group', { name: 'Several reports' })).toBeNull()
  })

  test('a check or a start that fails says why', async () => {
    const { user } = await renderApp()
    bridge.planLine.mockResolvedValueOnce(fail('The engine is busy.'))
    await user.type(field(), 'nvda, msft{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('The engine is busy.')
    await user.type(field(), ' ')
    await user.keyboard('{Enter}')
    bridge.addToLine.mockResolvedValueOnce(fail('The line is full.'))
    await user.click(await card().findByRole('button', { name: 'Start 2 reports' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The line is full.')
  })

  test('one company reads as one report', async () => {
    const { user } = await renderApp()
    await user.type(field(), 'nvda,{Enter}')
    expect(card().getByText('Write the NVDA report?')).toBeInTheDocument()
    expect(card().getByText('It will be a new official prediction in your log.')).toBeInTheDocument()
    expect(card().getByRole('button', { name: 'Start the report' })).toBeInTheDocument()
  })
})

describe('the line being written', () => {
  test('the run view follows each report, with Up next under it, and lists them all at the end', async () => {
    const { user } = await startLine()
    expect(receipt().getByText('NVIDIA Corp')).toBeInTheDocument()
    expect(strip().getByText('Report 1 of 2')).toBeInTheDocument()
    expect(strip().getByText(/^0 of 2 done, about \d+ min left$/)).toBeInTheDocument()
    expect(sidebar().getByRole('button', { name: /NVDA\s*writing… · 1 waiting/ })).toBeInTheDocument()

    // NVDA is ready: it doesn't open, and the next one starts in its place.
    emit('report_ready', { run_id: 'run-l1', report_id: 'r-aapl-2' })
    expect(await screen.findByText('NVDA is ready')).toBeInTheDocument()
    expect(win()).toHaveClass('on-home')
    expect(bridge.getReport).not.toHaveBeenCalled()
    const done = NVDA({ outcome: 'ready', report_id: 'r-aapl-2' })
    emit('line_changed', line({ finished: [done], writing: lineItem('MSFT', { official: false }) }))
    emit('line_changed', line({ finished: [done], writing: MSFT({ run_id: 'run-l2' }) }))
    expect(await receipt().findByText('Microsoft Corp')).toBeInTheDocument()
    expect(strip().getByText('Report 2 of 2')).toBeInTheDocument()
    expect(strip().getByText('This is the last one.')).toBeInTheDocument()

    // The last one waits on the Done card, with the whole line listed under it.
    emit('report_ready', { run_id: 'run-l2', report_id: 'r-msft-1' })
    expect(await receipt().findByRole('button', { name: 'Open the report' })).toBeInTheDocument()
    emit('line_changed', line({ finished: [done, MSFT({ run_id: 'run-l2', outcome: 'ready', report_id: 'r-msft-1' })] }))
    const list = within(screen.getByRole('region', { name: 'This line' }))
    expect(list.getByText('2 reports in this line')).toBeInTheDocument()
    expect(list.getByText('2 ready')).toBeInTheDocument()
    await user.click(list.getByRole('button', { name: 'Open the NVDA report' }))
    await waitFor(() => expect(win()).toHaveClass('on-report'))
    expect(bridge.getReport).toHaveBeenCalledWith('r-aapl-2', expect.anything())
  })

  test('× takes a company out of the line, and Cancel all stops it', async () => {
    const { user } = await startLine()
    await user.click(strip().getByRole('button', { name: 'Take MSFT out of the line' }))
    expect(bridge.removeFromLine).toHaveBeenCalledWith('MSFT')
    // Cancel all asks first, in place; Esc takes the question back.
    await user.click(strip().getByRole('button', { name: 'Cancel all' }))
    expect(bridge.clearLine).not.toHaveBeenCalled()
    expect(strip().getByRole('group', { name: /^Stop this report and drop the \d+ waiting\?$/ })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(strip().queryByRole('group', { name: /^Stop this report/ })).toBeNull()
    await user.click(strip().getByRole('button', { name: 'Cancel all' }))
    await user.click(strip().getByRole('button', { name: 'Cancel all' }))
    expect(bridge.clearLine).toHaveBeenCalled()
    expect(await screen.findByText('Cancelled the line')).toBeInTheDocument()
    emit('line_changed', line())
    await waitFor(() => expect(field()).toBeInTheDocument())
    // The stopped report that saves anyway doesn't open.
    emit('report_ready', { run_id: 'run-l1', report_id: 'r-aapl-2' })
    expect(win()).toHaveClass('on-home')
  })

  test('Cancel run stops only the report being written', async () => {
    const { user } = await startLine()
    await user.click(screen.getByRole('button', { name: 'Cancel run' }))
    await user.click(screen.getByRole('button', { name: 'Cancel run' }))
    expect(bridge.cancel).toHaveBeenCalledWith('run-l1')
    expect(await screen.findByText('No report was saved. The next one in the line is starting.')).toBeInTheDocument()
  })

  test('a usage limit pauses the line; Resume carries on, or skip past the stopped report', async () => {
    const { user } = await startLine()
    emit('run_failed', { run_id: 'run-l1', step: 'narrate', code: 'USAGE_LIMIT', message: 'Your plan’s usage limit is reached.', reset_at: '2026-11-08T03:00:00Z' })
    emit('line_changed', line({ finished: [NVDA({ outcome: 'stopped', code: 'USAGE_LIMIT' })], waiting: [MSFT()], paused: { code: 'USAGE_LIMIT', message: 'Your plan’s usage limit is reached.', reset_at: null, fix_command: null, run_id: 'run-l1' } }))
    expect(await screen.findByText('Your plan’s usage limit stopped the report')).toBeInTheDocument()
    expect(strip().getByText('The line is paused. Resume carries on with this report, then the one waiting.')).toBeInTheDocument()
    expect(strip().queryByRole('button', { name: 'Add a company' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Resume' }))
    expect(bridge.resume).toHaveBeenCalledWith('run-l1')
    emit('run_failed', { run_id: 'run-new', step: 'narrate', code: 'USAGE_LIMIT', message: 'Still limited.' })
    await user.click(await strip().findByRole('button', { name: 'Skip it and carry on' }))
    expect(bridge.carryOnLine).toHaveBeenCalled()
  })

  test('a problem with one company moves on to the next, without leaving the page you’re on', async () => {
    await startLine()
    menu('settings')
    emit('run_failed', { run_id: 'run-l1', step: 'fetch', code: 'ENGINE_ERROR', message: 'A filing couldn’t be read.' })
    expect(await screen.findByText('NVDA stopped')).toBeInTheDocument()
    expect(screen.getByText('A filing couldn’t be read. The next one is starting.')).toBeInTheDocument()
    expect(win()).toHaveClass('on-settings')
    // A company the engine couldn't start at all says so too.
    emit('line_changed', line({ finished: [NVDA({ outcome: 'failed' }), lineItem('ZZ', { outcome: 'failed', message: 'No S&P 500 company matches.' })], waiting: [MSFT()] }))
    expect(await screen.findByText('ZZ didn’t start')).toBeInTheDocument()
  })

  test('the last report ready while you’re elsewhere says the line is done', async () => {
    await startLine()
    emit('line_changed', line({ finished: [NVDA({ outcome: 'ready' })], writing: MSFT({ run_id: 'run-l2' }) }))
    menu('settings')
    emit('report_ready', { run_id: 'run-l2', report_id: 'r-msft-1' })
    expect(await screen.findByText('The line is done')).toBeInTheDocument()
    expect(win()).toHaveClass('on-settings')
  })
})

describe('adding to the line while a report is written', () => {
  test('a company picked in the look-up box joins the line, and Add a company does the same', async () => {
    const { user } = await renderApp()
    await user.type(field(), 'a')
    await user.click(await within(screen.getByRole('listbox', { name: 'Companies' })).findByRole('option', { name: /AAPL/ }))
    await screen.findByRole('region', { name: 'Report progress' })
    bridge.addToLine.mockResolvedValueOnce(ok({ items: [lineItem('NVDA')], skipped: [], line: line({ waiting: [lineItem('NVDA')] }) }))
    menu('lookup')
    await user.keyboard('n')
    const box = within(await screen.findByRole('dialog', { name: 'Look up a company' }))
    await user.click(await box.findByRole('button', { name: /NVDA/ }))
    expect(bridge.addToLine).toHaveBeenCalledWith(['NVDA'])
    expect(await screen.findByText('NVDA is in the line')).toBeInTheDocument()
    expect(screen.getByText('It starts when this report is done.')).toBeInTheDocument()

    // Up next shows under the report already running, and its Add a company joins any company.
    emit('line_changed', line({ waiting: [lineItem('NVDA')] }))
    expect(strip().getByText('Up next')).toBeInTheDocument()
    bridge.addToLine.mockResolvedValueOnce(ok({ items: [lineItem('MSFT')], skipped: [], line: line({ waiting: [lineItem('NVDA'), lineItem('MSFT')] }) }))
    await user.click(strip().getByRole('button', { name: 'Add a company' }))
    await user.keyboard('ms')
    const again = within(await screen.findByRole('dialog', { name: 'Look up a company' }))
    await user.click(await again.findByRole('button', { name: /MSFT/ }))
    expect(bridge.addToLine).toHaveBeenLastCalledWith(['MSFT'])
    expect(await screen.findByText('2 waiting. It starts when the ones before it are done.')).toBeInTheDocument()
    expect(win()).toHaveClass('on-home')
  })

  test('during a safety check, the company waits for the check, and the toast says so', async () => {
    const { user } = await renderApp()
    emit('safety_progress', { tool: 'claude', n: 3, total: 25 })
    menu('settings')
    menu('lookup')
    await user.keyboard('n')
    const box = within(await screen.findByRole('dialog', { name: 'Look up a company' }))
    await user.click(await box.findByRole('button', { name: /NVDA/ }))
    expect(bridge.runReport).not.toHaveBeenCalled()
    expect(bridge.addToLine).toHaveBeenCalledWith(['NVDA'])
    expect(await screen.findByText('NVDA is in the line')).toBeInTheDocument()
    expect(screen.getByText('It starts when the safety check finishes.')).toBeInTheDocument()
  })

  test('a company that can’t join says why', async () => {
    const { user } = await renderApp()
    await user.type(field(), 'a')
    await user.click(await within(screen.getByRole('listbox', { name: 'Companies' })).findByRole('option', { name: /AAPL/ }))
    await screen.findByRole('region', { name: 'Report progress' })
    bridge.addToLine.mockResolvedValueOnce(ok({ items: [], skipped: [{ query: 'NVDA', reason: 'NVDA is already in the line.', kind: 'in_line' }], line: line() }))
    menu('lookup')
    await user.keyboard('n')
    const box = within(await screen.findByRole('dialog', { name: 'Look up a company' }))
    await user.click(await box.findByRole('button', { name: /NVDA/ }))
    expect(await screen.findByText('NVDA is already in the line.')).toBeInTheDocument()
  })
})

describe('a line left from last time', () => {
  const reopened = () =>
    line({ waiting: [lineItem('NVDA'), lineItem('MSFT')], paused: { code: 'REOPENED', message: '2 reports were waiting when Tearsheet closed.', reset_at: null, fix_command: null, run_id: null } })

  test('waits at the top of the home page to be carried on or cleared', async () => {
    bridge.getLine.mockResolvedValue(ok(reopened()))
    const { user } = await renderApp()
    expect(await screen.findByText('2 reports were waiting when Tearsheet closed')).toBeInTheDocument()
    expect(screen.getByText('NVDA and MSFT. Carry on writing them one after another, or clear the line.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Carry on' }))
    expect(bridge.carryOnLine).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(bridge.clearLine).not.toHaveBeenCalled()
    expect(screen.getByRole('group', { name: 'Drop the 2 waiting?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(bridge.clearLine).toHaveBeenCalled()
    emit('line_changed', line())
    await waitFor(() => expect(screen.queryByText('2 reports were waiting when Tearsheet closed')).toBeNull())
  })

  test('a line paused by a usage limit shows at the top, and a new list just joins it', async () => {
    bridge.getLine.mockResolvedValue(
      ok(line({ waiting: [lineItem('NVDA')], finished: [lineItem('AAPL', { outcome: 'stopped', run_id: 'run-a' })], paused: { code: 'USAGE_LIMIT', message: 'Your plan’s usage limit is reached.', reset_at: null, fix_command: null, run_id: 'run-a' } }))
    )
    const { user } = await renderApp()
    expect(await screen.findByText('The line is paused')).toBeInTheDocument()
    expect(screen.getByText('Your plan’s usage limit is reached. NVDA is waiting. Carry on with it, or clear the line.')).toBeInTheDocument()
    await user.type(field(), 'msft,{Enter}')
    bridge.addToLine.mockResolvedValueOnce(ok({ items: [lineItem('MSFT')], skipped: [], line: line() }))
    await user.click(await card().findByRole('button', { name: 'Start the report' }))
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Several reports' })).toBeNull())
    expect(field()).toHaveValue('')
  })

  test('a line part-way through when the window opens is followed', async () => {
    bridge.getLine.mockResolvedValue(ok(line({ writing: NVDA(), waiting: [MSFT()] })))
    await renderApp()
    expect(await screen.findByRole('region', { name: 'Report progress' })).toBeInTheDocument()
    expect(strip().getByText('Report 1 of 2')).toBeInTheDocument()
  })

  const pausedBy = (code: string, message: string) => line({ waiting: [lineItem('NVDA')], paused: { code, message, reset_at: null, fix_command: null, run_id: null } })

  test('a line the stopped safety check paused offers only the check again or Cancel all', async () => {
    bridge.getLine.mockResolvedValue(ok(pausedBy('SAFETY_CHECK_STOPPED', 'You stopped the safety check.')))
    const { user } = await renderApp()
    expect(await screen.findByText('The line is paused')).toBeInTheDocument()
    expect(screen.getByText('You stopped the safety check. Reports wait until it passes. NVDA is waiting.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Carry on' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Run it again' }))
    expect(bridge.runSafetyCheck).toHaveBeenCalledWith('claude')
    // While the check runs, the report waits for it; a pass carries the line on by itself.
    expect(await screen.findByText('Starts when the safety check finishes (0 of 25).')).toBeInTheDocument()
    emit('safety_done', { tool: 'claude', passed: false, finished: false, reason: 'You stopped the safety check.' })
    await user.click(await screen.findByRole('button', { name: 'Cancel all' }))
    await user.click(screen.getByRole('button', { name: 'Cancel all' }))
    expect(bridge.clearLine).toHaveBeenCalled()
    expect(await screen.findByText('Cancelled the line')).toBeInTheDocument()
  })

  test('a check that couldn’t finish says why, and one that won’t start again says so', async () => {
    bridge.getLine.mockResolvedValue(ok(pausedBy('SAFETY_CHECK_UNFINISHED', 'The check couldn’t finish: you hit your usage limit')))
    bridge.runSafetyCheck.mockResolvedValue(fail('A report is running.'))
    const { user } = await renderApp()
    expect(await screen.findByText('The safety check couldn’t finish: you hit your usage limit. NVDA is waiting.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Run it again' }))
    expect(await screen.findByText('The safety check didn’t start')).toBeInTheDocument()
    expect(screen.getByText('A report is running.')).toBeInTheDocument()
  })

  test('a line a failed check paused gives the check’s reason, waits while it runs again, and carries on after a pass', async () => {
    bridge.getLine.mockResolvedValue(ok(pausedBy('LOCKDOWN_FAILED', 'Claude Code is blocked because its lock-down check failed.')))
    const { user } = await renderApp()
    expect(await screen.findByText('Claude Code is blocked because its lock-down check failed. NVDA is waiting.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Run it again' }))
    // A failed check's pause stays while it runs again: its report waits for Resume or Carry on.
    expect(await screen.findByRole('button', { name: 'Checking…' })).toBeDisabled()
    emit('safety_done', { tool: 'claude', passed: false, finished: true, reason: 'It read a file.' })
    expect(await screen.findByText('It read a file. NVDA is waiting.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Run it again' }))
    emit('safety_done', { tool: 'claude', passed: true, finished: true })
    await user.click(await screen.findByRole('button', { name: 'Carry on' }))
    expect(bridge.carryOnLine).toHaveBeenCalled()
  })

  test('under the run view, a safety pause hides Skip it and carry on, and offers the check', async () => {
    bridge.getLine.mockResolvedValue(ok(line({ writing: NVDA(), waiting: [MSFT()] })))
    const { user } = await renderApp()
    await screen.findByRole('region', { name: 'Report progress' })
    emit('line_changed', line({ finished: [NVDA({ outcome: 'ready', report_id: 'r-aapl-2' })], waiting: [MSFT()], paused: { code: 'SAFETY_CHECK_STOPPED', message: 'You stopped the safety check.', reset_at: null, fix_command: null, run_id: null } }))
    expect(strip().getByText('You stopped the safety check. Reports wait until it passes.')).toBeInTheDocument()
    expect(strip().queryByRole('button', { name: 'Skip it and carry on' })).toBeNull()
    await user.click(strip().getByRole('button', { name: 'Run it again' }))
    expect(bridge.runSafetyCheck).toHaveBeenCalledWith('claude')
    // While it runs, there is nothing to press but Cancel all.
    expect(strip().queryByRole('button', { name: 'Run it again' })).toBeNull()
    expect(strip().getByRole('button', { name: 'Cancel all' })).toBeInTheDocument()
  })

  test('a carry on or clear the engine refuses says so', async () => {
    bridge.getLine.mockResolvedValue(ok(reopened()))
    bridge.carryOnLine.mockResolvedValue(fail('No.'))
    bridge.clearLine.mockResolvedValue(fail('No.'))
    const { user } = await renderApp()
    await user.click(await screen.findByRole('button', { name: 'Carry on' }))
    expect(await screen.findByText('The line didn’t carry on')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(await screen.findByText('The line didn’t clear')).toBeInTheDocument()
  })
})
