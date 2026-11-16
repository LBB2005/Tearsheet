// The stock menu on the screens (stock/StockMenu.tsx): a right-click on a company, or ⇧F10 in its
// row, opens the same menu on the prediction log, the watchlist, the home page and the look-up
// box, and each option does what its page would. The sidebar's own tests cover its rows.

import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'

import type { PredictionSummary } from '../../shared/protocol'
import { renderApp, win } from '../test/app'
import { bridge, linePlan, ok } from '../test/bridge'

const side = () => within(screen.getByRole('complementary', { name: 'Sidebar' }))
const menuOf = (ticker: string) => within(screen.getByRole('menu', { name: `${ticker} options` }))
const legend = () => [...document.querySelectorAll('.legend li b')].map((b) => b.textContent)

const p = (ticker: string, cik: number, over: Partial<PredictionSummary> = {}): PredictionSummary => ({
  prediction_id: `p-${ticker}`,
  cik,
  ticker,
  run_at: '2026-11-08T03:00:00+00:00',
  rating: 'Buy',
  bear: 50,
  base: 190,
  bull: 200,
  grades: [],
  name: `${ticker} Co`,
  sector: 'Energy',
  share_class: '',
  score: 96,
  probability: 0.75,
  uncertainty: 'high',
  report_id: `rep-${ticker}`,
  price: 100,
  price_date: '2026-11-06',
  ...over
})

beforeEach(() => {
  localStorage.clear()
  bridge.listPredictions.mockResolvedValue(ok([p('MU', 723125), p('F', 37996, { rating: 'Hold', base: 110, score: 18, probability: 0.4 })]))
})

describe('on the prediction log', () => {
  async function openLog() {
    const app = await renderApp()
    await app.user.click(side().getByRole('button', { name: /Prediction log/ }))
    await screen.findByRole('cell', { name: 'MU' })
    return app
  }
  const row = (ticker: string) => screen.getByRole('cell', { name: ticker }).closest('[role="row"]') as HTMLElement

  test('a right-click on a row opens the stock menu, with its report and its place on the chart', async () => {
    await openLog()
    await waitFor(() => expect(legend()).toEqual(['S&P 500', 'MU']))
    fireEvent.contextMenu(row('MU'), { clientX: 300, clientY: 300 })
    const m = menuOf('MU')
    expect(m.getByRole('menuitem', { name: 'Open report' })).toHaveFocus()
    expect(m.getByRole('menuitem', { name: 'Refresh report…' })).toBeInTheDocument()
    // The fake's two watchlists both have MU.
    expect(await m.findByRole('menuitemcheckbox', { name: 'Core' })).toHaveAttribute('aria-checked', 'true')
    expect(m.getByRole('menuitemcheckbox', { name: 'Chips' })).toHaveAttribute('aria-checked', 'true')
    expect(m.getByRole('menuitem', { name: 'Copy ticker' })).toBeInTheDocument()
    expect(m.getByRole('menuitem', { name: 'Open on SEC EDGAR' })).toBeInTheDocument()
    // Already on the log: it doesn't offer the log.
    expect(m.queryByRole('menuitem', { name: 'Show in Prediction log' })).toBeNull()

    // Compare is the row's tick.
    fireEvent.click(m.getByRole('menuitem', { name: 'Stop comparing' }))
    await waitFor(() => expect(legend()).toEqual([]))
    fireEvent.contextMenu(row('F'))
    fireEvent.click(menuOf('F').getByRole('menuitem', { name: 'Compare' }))
    await waitFor(() => expect(legend()).toEqual(['S&P 500', 'F']))
  })

  test('⇧F10 in a row opens it below the row, and Open report opens the prediction’s report', async () => {
    const { user } = await openLog()
    within(row('MU')).getByRole('checkbox').focus()
    await user.keyboard('{Shift>}{F10}{/Shift}')
    await user.click(menuOf('MU').getByRole('menuitem', { name: 'Open report' }))
    await waitFor(() => expect(win()).toHaveClass('on-report'))
    expect(bridge.getReport).toHaveBeenCalledWith('rep-MU', expect.anything())
  })

  test('a card has it too; Copy ticker and Open on SEC EDGAR go through the main process', async () => {
    const { user } = await openLog()
    const card = within(screen.getByRole('region', { name: 'Good picks' })).getByRole('button', { name: /MU/ })
    fireEvent.contextMenu(card)
    await user.click(menuOf('MU').getByRole('menuitem', { name: 'Copy ticker' }))
    expect(bridge.copyTicker).toHaveBeenCalledWith('MU')
    expect(await screen.findByText('Copied MU')).toBeInTheDocument()
    fireEvent.contextMenu(card)
    await user.click(menuOf('MU').getByRole('menuitem', { name: 'Open on SEC EDGAR' }))
    expect(bridge.openExternal).toHaveBeenCalledWith('https://www.sec.gov/edgar/browse/?CIK=723125')
  })

  test('the chart’s legend has it, and says when copying fails', async () => {
    bridge.copyTicker.mockResolvedValueOnce(false)
    const { user } = await openLog()
    await waitFor(() => expect(legend()).toEqual(['S&P 500', 'MU']))
    fireEvent.contextMenu(document.querySelector('.legend li:nth-child(2)') as Element)
    await user.click(menuOf('MU').getByRole('menuitem', { name: 'Copy ticker' }))
    expect(await screen.findByText('Couldn’t copy the ticker')).toBeInTheDocument()
    fireEvent.contextMenu(document.querySelector('.legend li:nth-child(2)') as Element)
    await user.click(menuOf('MU').getByRole('menuitem', { name: 'Stop comparing' }))
    await waitFor(() => expect(legend()).toEqual([]))
  })
})

describe('on the watchlist', () => {
  async function openWatch() {
    const app = await renderApp()
    await app.user.click(side().getByRole('button', { name: /Watchlist/ }))
    await screen.findByRole('navigation', { name: 'Watchlists' })
    return app
  }
  const watchRow = (ticker: string) => [...document.querySelectorAll('.watchv .wrow')].find((r) => r.querySelector('b')?.childNodes[0]?.textContent === ticker) as HTMLElement

  test('a tick takes a company out of a list, with Undo', async () => {
    const { user } = await openWatch()
    fireEvent.contextMenu(watchRow('AMD'))
    const core = await menuOf('AMD').findByRole('menuitemcheckbox', { name: 'Core' })
    await waitFor(() => expect(core).toHaveAttribute('aria-checked', 'true'))
    await user.click(core)
    await waitFor(() => expect(bridge.removeFromWatchlist).toHaveBeenCalledWith(1, [2488]))
    // A tick keeps the menu open, and it follows the change.
    await waitFor(() => expect(menuOf('AMD').getByRole('menuitemcheckbox', { name: 'Core' })).toHaveAttribute('aria-checked', 'false'))
    await user.keyboard('{Escape}')
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(bridge.restoreWatchItems).toHaveBeenCalledWith(1, expect.any(Array)))
  })

  test('Compare ticks the row, and the needs-a-look strip has the menu too', async () => {
    const { user } = await openWatch()
    fireEvent.contextMenu(watchRow('AMD'))
    await user.click(menuOf('AMD').getByRole('menuitem', { name: 'Compare' }))
    expect(within(watchRow('AMD')).getByRole('checkbox')).toBeChecked()
    fireEvent.contextMenu(within(screen.getByRole('region', { name: 'Needs a look' })).getByRole('button', { name: /^AMD/ }))
    await user.click(menuOf('AMD').getByRole('menuitem', { name: 'Stop comparing' }))
    expect(within(watchRow('AMD')).getByRole('checkbox')).not.toBeChecked()
  })

  test('a company with no report greys Open report and asks before writing the first one', async () => {
    // The fake's look-up list hasn't LULU; the engine's check finds it.
    const found = async (queries: string[]) => ok({ ...linePlan([]), items: queries.map((ticker) => ({ ticker, name: ticker, official: true })) })
    bridge.planLine.mockImplementation(found)
    bridge.addToLine.mockImplementation(found)
    const { user } = await openWatch()
    fireEvent.contextMenu(watchRow('LULU'))
    const open = menuOf('LULU').getByRole('menuitem', { name: /Open report/ })
    expect(open).toHaveAttribute('aria-disabled', 'true')
    expect(open).toHaveTextContent('No report yet')
    // Picking a greyed option does nothing, and the menu stays.
    await user.click(open)
    expect(screen.getByRole('menu', { name: 'LULU options' })).toBeInTheDocument()
    await user.click(menuOf('LULU').getByRole('menuitem', { name: 'Write a report…' }))
    const sheet = within(await screen.findByRole('dialog', { name: 'Write a LULU report?' }))
    expect(await sheet.findByText('There’s no LULU report yet.')).toBeInTheDocument()
    await user.click(sheet.getByRole('button', { name: 'Write the report' }))
    await waitFor(() => expect(bridge.addToLine).toHaveBeenCalledWith(['LULU']))
    expect(await screen.findByText('Writing LULU')).toBeInTheDocument()
  })

  test('the detail’s heading and the compare table have it', async () => {
    const { user } = await openWatch()
    await user.click(within(watchRow('AMD')).getByRole('button'))
    fireEvent.contextMenu(document.querySelector('.watchv .wdet h3') as Element)
    expect(screen.getByRole('menu', { name: 'AMD options' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(within(watchRow('AMD')).getByRole('checkbox'))
    await user.click(within(watchRow('LULU')).getByRole('checkbox'))
    const tableRow = (await screen.findAllByRole('cell', { name: 'LULU' }))[0].closest('tr') as HTMLElement
    fireEvent.contextMenu(tableRow)
    expect(screen.getByRole('menu', { name: 'LULU options' })).toBeInTheDocument()
  })
})

describe('on the home page and in the look-up box', () => {
  test('a Recent company opens its report from the menu', async () => {
    const { user } = await renderApp()
    const recent = document.querySelector('.homev .sugg .sg') as HTMLElement
    fireEvent.contextMenu(recent)
    const m = menuOf('AAPL')
    // AAPL's latest report is an official prediction.
    await user.click(m.getByRole('menuitem', { name: 'Show in Prediction log' }))
    await waitFor(() => expect(win()).toHaveClass('on-log'))
  })

  test('the field’s list has it, from a right-click or ⇧F10 on the highlighted company', async () => {
    const { user } = await renderApp()
    const field = screen.getByRole('combobox', { name: 'Look up a company' })
    await user.type(field, 'msft')
    const hit = await screen.findByRole('option', { name: /MSFT/ })
    fireEvent.contextMenu(hit)
    expect(screen.getByRole('menu', { name: 'MSFT options' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(field)
    await user.keyboard('{Shift>}{F10}{/Shift}')
    await user.click(menuOf('MSFT').getByRole('menuitem', { name: 'Refresh report…' }))
    expect(await screen.findByRole('dialog', { name: /Refresh MSFT/ })).toBeInTheDocument()
    // The sheet's check has answered before the test ends.
    expect(await screen.findByRole('button', { name: 'Write a new report' })).toBeInTheDocument()
  })

  test('in the look-up box, an option closes the box', async () => {
    const { user } = await renderApp()
    await user.click(side().getByRole('button', { name: /Look up/ }))
    // On the home page ⌘K is the field; from another page it is the box.
    await user.click(side().getByRole('button', { name: /Prediction log/ }))
    await user.click(side().getByRole('button', { name: /Look up/ }))
    const box = within(await screen.findByRole('dialog', { name: 'Look up a company' }))
    await user.type(box.getByRole('combobox'), 'aapl')
    await box.findByRole('option', { name: /AAPL/ })
    await user.keyboard('{Shift>}{F10}{/Shift}')
    await user.click(menuOf('AAPL').getByRole('menuitem', { name: 'Copy ticker' }))
    expect(bridge.copyTicker).toHaveBeenCalledWith('AAPL')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Look up a company' })).toBeNull())
  })
})
