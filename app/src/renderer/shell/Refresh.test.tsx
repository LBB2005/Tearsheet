// Refresh (Liam's pick of 8 Nov 2026): from a company's right-click menu in the sidebar, from
// "Refresh N selected", and from the report page's toolbar. A small confirm says how old the
// latest report is and whether the new one will be an official prediction (the engine's check,
// plan_line); then the companies go into the line (add_to_line), and the old reports stay.

import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { openReport, renderApp } from '../test/app'
import { bridge, emit, fail, line, lineItem, ok } from '../test/bridge'

const side = () => within(screen.getByRole('complementary', { name: 'Sidebar' }))
const rowOf = (ticker: string) => side().getByRole('button', { name: new RegExp(`^${ticker}\\b`) })
const confirm = () => within(screen.getByRole('dialog', { name: /refresh/i }))

async function refreshFromMenu(user: Awaited<ReturnType<typeof renderApp>>['user'], ticker: string) {
  fireEvent.contextMenu(rowOf(ticker), { clientX: 40, clientY: 300 })
  await user.click(within(screen.getByRole('menu', { name: `${ticker} report` })).getByRole('menuitem', { name: 'Refresh report…' }))
  await screen.findByRole('dialog', { name: /refresh/i })
}

describe('Refresh from the sidebar', () => {
  test('asks first, saying how old the report is and that it will be official, then adds it to the line', async () => {
    const { user } = await renderApp()
    await refreshFromMenu(user, 'AAPL')
    expect(bridge.planLine).toHaveBeenCalledWith(['AAPL'])
    expect(await confirm().findByText(/^Your latest AAPL report is from Nov 5/)).toBeInTheDocument()
    expect(confirm().getByText('It will be a new official prediction in your log.')).toBeInTheDocument()
    expect(confirm().getByText('Your old report stays. Switch between them from the report’s date at the top.')).toBeInTheDocument()
    expect(bridge.addToLine).not.toHaveBeenCalled()
    await user.click(confirm().getByRole('button', { name: 'Write a new report' }))
    expect(bridge.addToLine).toHaveBeenCalledWith(['AAPL'])
    expect(await screen.findByText('Refreshing AAPL')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // No report was hidden or deleted: the old one stays.
    expect(bridge.hideReports).not.toHaveBeenCalled()
  })

  test('inside 30 days says it won’t be official, and Cancel adds nothing', async () => {
    const { user } = await renderApp()
    await refreshFromMenu(user, 'MSFT')
    expect(await confirm().findByText('It won’t be an official prediction: MSFT was rated in the last 30 days.')).toBeInTheDocument()
    await user.click(confirm().getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(bridge.addToLine).not.toHaveBeenCalled()
  })

  test('several selected go into the line together, each with its age', async () => {
    const { user } = await renderApp()
    await user.keyboard('{Meta>}')
    await user.click(rowOf('AAPL'))
    await user.click(rowOf('MSFT'))
    await user.keyboard('{/Meta}')
    fireEvent.contextMenu(rowOf('MSFT'), { clientX: 40, clientY: 300 })
    await user.click(screen.getByRole('menuitem', { name: 'Refresh 2 selected…' }))
    expect(bridge.planLine).toHaveBeenCalledWith(['AAPL', 'MSFT'])
    const ages = within(await confirm().findByRole('list', { name: 'Latest reports' }))
    expect(ages.getByText('AAPL').closest('li')).toHaveTextContent(/AAPL from Nov 5/)
    expect(ages.getByText('MSFT').closest('li')).toHaveTextContent(/MSFT from Nov 3/)
    expect(confirm().getByText('1 of these will be a new official prediction in your log. MSFT was rated in the last 30 days, so it won’t be.')).toBeInTheDocument()
    await user.click(confirm().getByRole('button', { name: 'Write 2 new reports' }))
    expect(bridge.addToLine).toHaveBeenCalledWith(['AAPL', 'MSFT'])
    expect(await screen.findByText('Refreshing 2 reports')).toBeInTheDocument()
    // The selection is put away.
    expect(side().queryByRole('toolbar', { name: 'Selected reports' })).toBeNull()
  })

  test('of several, one that can’t be added is listed, and only the rest are written', async () => {
    bridge.planLine.mockResolvedValueOnce(ok({ items: [lineItem('AAPL')], skipped: [{ query: 'MSFT', reason: 'MSFT is already in the line.' }], line: line() }))
    const { user } = await renderApp()
    await user.keyboard('{Meta>}')
    await user.click(rowOf('AAPL'))
    await user.click(rowOf('MSFT'))
    await user.keyboard('{/Meta}')
    fireEvent.contextMenu(rowOf('AAPL'), { clientX: 40, clientY: 300 })
    await user.click(screen.getByRole('menuitem', { name: 'Refresh 2 selected…' }))
    expect(within(await confirm().findByRole('list', { name: 'Left out' })).getByText('MSFT is already in the line.')).toBeInTheDocument()
    await user.click(confirm().getByRole('button', { name: 'Write a new report' }))
    expect(bridge.addToLine).toHaveBeenCalledWith(['AAPL'])
  })

  test('while a report is being written, says it waits its turn', async () => {
    const { user } = await renderApp()
    emit('line_changed', line({ writing: lineItem('NVDA', { run_id: 'run-l1' }) }))
    await refreshFromMenu(user, 'AAPL')
    expect(await confirm().findByText('It starts once the reports before it are done.')).toBeInTheDocument()
    await user.click(confirm().getByRole('button', { name: 'Write a new report' }))
    expect(await screen.findByText('AAPL is in the line')).toBeInTheDocument()
  })

  test('one already in the line says so, with nothing to start', async () => {
    bridge.planLine.mockResolvedValueOnce(ok({ items: [], skipped: [{ query: 'AAPL', reason: 'AAPL is already in the line.' }], line: line() }))
    const { user } = await renderApp()
    await refreshFromMenu(user, 'AAPL')
    expect(await confirm().findByText('AAPL is already in the line.')).toBeInTheDocument()
    expect(confirm().queryByRole('button', { name: /Write/ })).toBeNull()
    await user.click(confirm().getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  test('when the check or the adding fails, says why and stays open', async () => {
    bridge.planLine.mockResolvedValueOnce(fail('The engine is busy.'))
    const { user } = await renderApp()
    await refreshFromMenu(user, 'AAPL')
    expect(await confirm().findByText('The engine is busy.')).toBeInTheDocument()
    await user.click(confirm().getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    bridge.addToLine.mockResolvedValueOnce(fail('The line is full.'))
    await refreshFromMenu(user, 'AAPL')
    await user.click(await confirm().findByRole('button', { name: 'Write a new report' }))
    expect(await confirm().findByText('The line is full.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('Refresh on the report page', () => {
  test('the toolbar’s button asks about the company on show, and Esc closes it', async () => {
    const { user } = await renderApp()
    await openReport(user, 'AAPL')
    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(bridge.planLine).toHaveBeenCalledWith(['AAPL'])
    expect(await confirm().findByText(/^Your latest AAPL report is from Nov 5/)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(bridge.addToLine).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    await user.click(await confirm().findByRole('button', { name: 'Write a new report' }))
    expect(bridge.addToLine).toHaveBeenCalledWith(['AAPL'])
    // You stay on the report you were reading.
    expect(document.querySelector('.win')).toHaveClass('on-report')
  })
})
