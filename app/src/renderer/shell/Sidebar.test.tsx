// The sidebar's list of reports (look 3): the rows, the search, the sort and filter menu, the
// "…" and right-click menu, pinning, selecting several, the keys, and deleting with Undo, where
// an official prediction's report is only hidden. The fake bridge keeps hidden, erased and
// pinned reports as the engine does (test/bridge.ts).

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { bridge, COMPANIES, menu, ok } from '../test/bridge'
import { openReport, renderApp, win } from '../test/app'
import { UNDO_MS } from './useMarks'

const side = () => within(screen.getByRole('complementary', { name: 'Sidebar' }))
const rowOf = (ticker: string) => side().getByRole('button', { name: new RegExp(`^${ticker}\\b`) })
const shown = () => Array.from(document.querySelectorAll('.side4 .ri4:not(.hid4) .row4 b')).map((b) => b.textContent)
const options = (ticker: string) => side().getByRole('button', { name: `Options for ${ticker}` })
const sortButton = () => side().getByRole('button', { name: /^Sort and filter/ })

describe('a row', () => {
  test('shows the ticker, a tick for an official prediction, the last close and the rating', async () => {
    await renderApp()
    const aapl = rowOf('AAPL')
    expect(within(aapl).getByRole('img', { name: 'Official prediction' })).toBeInTheDocument()
    expect(aapl).toHaveTextContent('$230.10')
    expect(aapl.querySelector('.tag4.buy')).toHaveTextContent('Buy')
    expect(within(rowOf('MSFT')).queryByRole('img')).toBeNull()
    expect(rowOf('MSFT').querySelector('.tag4.hold')).toHaveTextContent('Hold')
    expect(aapl).toHaveAttribute('title', 'Apple Inc.')
  })
})

describe('the search', () => {
  test('narrows the list as you type, says when nothing matches, and Esc closes it', async () => {
    const { user } = await renderApp()
    await user.click(side().getByRole('button', { name: 'Search your reports' }))
    const field = side().getByRole('textbox', { name: 'Search your reports' })
    expect(field).toHaveFocus()
    await user.type(field, 'micro')
    expect(shown()).toEqual(['MSFT'])
    await user.clear(field)
    await user.type(field, 'zz')
    expect(side().getByText('No reports match “zz”.')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(side().queryByRole('textbox')).toBeNull()
    expect(shown()).toEqual(['AAPL', 'MSFT'])
  })

  test('↓ goes from the field to the first match, and Return opens it', async () => {
    const { user } = await renderApp()
    await user.click(side().getByRole('button', { name: 'Search your reports' }))
    await user.keyboard('ms{ArrowDown}')
    expect(rowOf('MSFT')).toHaveFocus()
    await user.click(side().getByRole('textbox'))
    await user.keyboard('{Enter}')
    await waitFor(() => expect(bridge.getReport).toHaveBeenCalledWith('r-msft-1', expect.anything()))
  })
})

describe('the sort and filter menu', () => {
  test('sorts by the move since the report, which the rows then show, and is kept', async () => {
    const { user } = await renderApp()
    await user.click(sortButton())
    const sort = within(screen.getByRole('menu', { name: 'Sort and filter' }))
    expect(sort.getByRole('menuitemradio', { name: /Newest first/ })).toHaveAttribute('aria-checked', 'true')
    await user.click(sort.getByRole('menuitemradio', { name: /Biggest move since the report/ }))
    // A tick keeps the menu open.
    expect(screen.getByRole('menu', { name: 'Sort and filter' })).toBeInTheDocument()
    expect(shown()).toEqual(['MSFT', 'AAPL'])
    expect(rowOf('MSFT')).toHaveTextContent('−3.0%')
    expect(rowOf('AAPL')).toHaveTextContent('+1.2%')
    expect(JSON.parse(localStorage.getItem('sidebar.list') ?? '{}').sort).toBe('move')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(sortButton()).toHaveFocus()
  })

  test('filters by rating and by official prediction, and Clear filters brings everything back', async () => {
    const { user } = await renderApp()
    await user.click(sortButton())
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Buy/ }))
    expect(shown()).toEqual(['MSFT'])
    expect(sortButton()).toHaveAccessibleName('Sort and filter (a filter on)')
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Only official predictions/ }))
    expect(shown()).toEqual([])
    expect(sortButton()).toHaveAccessibleName('Sort and filter (2 filters on)')
    await user.keyboard('{Escape}')
    expect(side().getByText(/No reports match these filters/)).toBeInTheDocument()
    await user.click(side().getByRole('button', { name: 'Clear filters' }))
    expect(shown()).toEqual(['AAPL', 'MSFT'])
    expect(sortButton()).toHaveAccessibleName('Sort and filter')
  })

  test('filters by sector once the companies span more than one', async () => {
    bridge.listCompanies.mockResolvedValue(ok([COMPANIES[0], { ...COMPANIES[1], sector: 'Financials' }]))
    const { user } = await renderApp()
    await user.click(sortButton())
    expect(screen.getByRole('menuitemradio', { name: /Every sector/ })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('menuitemradio', { name: /Financials/ }))
    expect(shown()).toEqual(['MSFT'])
    await user.click(screen.getByRole('menuitem', { name: 'Clear filters' }))
    expect(shown()).toEqual(['AAPL', 'MSFT'])
  })

  test('without any sectors to choose from, has no sector part', async () => {
    const { user } = await renderApp()
    await user.click(sortButton())
    expect(screen.queryByRole('menuitemradio', { name: /Every sector/ })).toBeNull()
  })
})

describe('the row menu', () => {
  test('opens from …, pins a company to the top, and right-click opens it too', async () => {
    const { user } = await renderApp()
    await user.click(options('MSFT'))
    const rowMenu = within(screen.getByRole('menu', { name: 'MSFT report' }))
    expect(rowMenu.getByRole('menuitem', { name: 'Pin to top' })).toHaveFocus()
    // MSFT isn't an official prediction, so the menu doesn't offer the log.
    expect(rowMenu.queryByRole('menuitem', { name: 'Show in Prediction log' })).toBeNull()
    await user.click(rowMenu.getByRole('menuitem', { name: 'Pin to top' }))
    expect(bridge.pinCompany).toHaveBeenCalledWith(789019, true)
    await waitFor(() => expect(side().getByText('Pinned')).toBeInTheDocument())
    expect(shown()).toEqual(['MSFT', 'AAPL'])

    fireEvent.contextMenu(rowOf('MSFT'), { clientX: 40, clientY: 300 })
    await user.click(within(screen.getByRole('menu', { name: 'MSFT report' })).getByRole('menuitem', { name: 'Unpin' }))
    expect(bridge.pinCompany).toHaveBeenLastCalledWith(789019, false)
    await waitFor(() => expect(side().queryByText('Pinned')).toBeNull())
  })

  test('opens the Prediction log for an official prediction', async () => {
    const { user } = await renderApp()
    await user.click(options('AAPL'))
    await user.click(screen.getByRole('menuitem', { name: 'Show in Prediction log' }))
    await waitFor(() => expect(win()).toHaveClass('on-log'))
  })

  test('says how many reports a company’s delete takes', async () => {
    const { user } = await renderApp()
    await user.click(options('AAPL'))
    expect(screen.getByRole('menuitem', { name: /Delete all 2 reports/ })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(options('MSFT'))
    expect(screen.getByRole('menuitem', { name: /Delete report/ })).toBeInTheDocument()
  })
})

describe('deleting', () => {
  test('hides an ordinary report at once, Undo brings it back, and it is erased once the undo has passed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { user } = await renderApp({ advanceTimers: vi.advanceTimersByTime })
      await user.click(options('MSFT'))
      await user.click(screen.getByRole('menuitem', { name: /Delete report/ }))
      expect(bridge.hideReports).toHaveBeenCalledWith(['r-msft-1'])
      await waitFor(() => expect(shown()).toEqual(['AAPL']))
      expect(screen.getByText('Deleted the MSFT report')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Undo' }))
      await waitFor(() => expect(shown()).toEqual(['AAPL', 'MSFT']))
      expect(bridge.showReports).toHaveBeenCalledWith(['r-msft-1'])
      expect(bridge.eraseReports).not.toHaveBeenCalled()

      await user.click(options('MSFT'))
      await user.click(screen.getByRole('menuitem', { name: /Delete report/ }))
      await waitFor(() => expect(shown()).toEqual(['AAPL']))
      await act(() => vi.advanceTimersByTimeAsync(UNDO_MS))
      expect(bridge.eraseReports).toHaveBeenCalledWith(['r-msft-1'])
      expect(shown()).toEqual(['AAPL'])
    } finally {
      vi.useRealTimers()
    }
  })

  test('only hides an official prediction’s report, which waits in Hidden reports to be brought back', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { user } = await renderApp({ advanceTimers: vi.advanceTimersByTime })
      rowOf('AAPL').focus()
      await user.keyboard('{Meta>}{Backspace}{/Meta}')
      expect(bridge.hideReports).toHaveBeenCalledWith(['r-aapl-2', 'r-aapl-1'])
      expect(await screen.findByText('Deleted a report and hid one')).toBeInTheDocument()
      expect(screen.getByText(/stays in the Prediction log/)).toBeInTheDocument()
      await waitFor(() => expect(shown()).toEqual(['MSFT']))
      // The cursor moves on to the next row.
      expect(rowOf('MSFT')).toHaveFocus()
      await act(() => vi.advanceTimersByTimeAsync(UNDO_MS))
      // The older, ordinary report goes; the official one stays hidden.
      expect(bridge.eraseReports).toHaveBeenCalledWith(['r-aapl-1'])

      await user.click(sortButton())
      await user.click(screen.getByRole('menuitemcheckbox', { name: /Hidden reports/ }))
      await user.keyboard('{Escape}')
      expect(bridge.listReports).toHaveBeenCalledWith(500, true)
      const hiddenRow = await side().findByRole('button', { name: /^AAPL\b.*Official prediction/ })
      expect(hiddenRow.closest('.ri4')).toHaveClass('hid4')
      await user.click(side().getByRole('button', { name: 'Options for the hidden AAPL report' }))
      const hiddenMenu = within(screen.getByRole('menu', { name: 'Hidden AAPL report' }))
      expect(hiddenMenu.queryByRole('menuitem', { name: /Delete/ })).toBeNull()
      await user.click(hiddenMenu.getByRole('menuitem', { name: 'Bring back' }))
      expect(bridge.showReports).toHaveBeenCalledWith(['r-aapl-2'])
      await waitFor(() => expect(shown()).toEqual(['AAPL', 'MSFT']))
      expect(screen.getByText('Brought back the AAPL report')).toBeInTheDocument()
      expect(side().getByText('No hidden reports.')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  test('deletes an ordinary hidden report for good from Hidden reports, and opens one', async () => {
    const { user } = await renderApp()
    await user.click(options('MSFT'))
    await user.click(screen.getByRole('menuitem', { name: /Delete report/ }))
    await waitFor(() => expect(shown()).toEqual(['AAPL']))
    await user.click(sortButton())
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Hidden reports/ }))
    await user.keyboard('{Escape}')
    await user.click(await side().findByRole('button', { name: /^MSFT\b/ }))
    await waitFor(() => expect(bridge.getReport).toHaveBeenCalledWith('r-msft-1', expect.anything()))
    await waitFor(() => expect(win()).toHaveClass('on-report'))
    await user.click(side().getByRole('button', { name: 'Options for the hidden MSFT report' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete report' }))
    expect(bridge.hideReports).toHaveBeenLastCalledWith(['r-msft-1'])
    // Undo leaves it hidden, where it was.
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(bridge.showReports).not.toHaveBeenCalled()
  })

  test('the report on show goes home when it is deleted', async () => {
    const { user } = await renderApp()
    await openReport(user, 'MSFT')
    await user.click(options('MSFT'))
    await user.click(screen.getByRole('menuitem', { name: /Delete report/ }))
    await waitFor(() => expect(win()).toHaveClass('on-home'))
  })

  test('the toolbar’s menu deletes the report on show and opens the company’s next one', async () => {
    const { user } = await renderApp()
    await openReport(user, 'AAPL')
    await user.click(await screen.findByRole('button', { name: 'Nov 5' }))
    await user.click(within(screen.getByRole('menu', { name: 'Other reports' })).getByRole('menuitem', { name: 'Delete this report' }))
    expect(bridge.hideReports).toHaveBeenCalledWith(['r-aapl-2'])
    await waitFor(() => expect(bridge.getReport).toHaveBeenLastCalledWith('r-aapl-1', expect.anything()))
    expect(await screen.findByText('Hid the AAPL report')).toBeInTheDocument()
    expect(win()).toHaveClass('on-report')
  })

  test('says so when the engine refuses', async () => {
    bridge.hideReports.mockResolvedValue({ ok: false, error: { message: 'The engine is busy.' } })
    const { user } = await renderApp()
    await user.click(options('MSFT'))
    await user.click(screen.getByRole('menuitem', { name: /Delete report/ }))
    expect(await screen.findByText('The report wasn’t deleted')).toBeInTheDocument()
    expect(shown()).toEqual(['AAPL', 'MSFT'])
  })
})

describe('selecting several', () => {
  test('⌘-click picks rows, and the bar deletes them all', async () => {
    const { user } = await renderApp()
    await user.keyboard('{Meta>}')
    await user.click(rowOf('AAPL'))
    await user.click(rowOf('MSFT'))
    await user.keyboard('{/Meta}')
    const bar = within(side().getByRole('toolbar', { name: 'Selected reports' }))
    expect(bar.getByText('2 selected')).toBeInTheDocument()
    expect(rowOf('AAPL')).toHaveAttribute('aria-pressed', 'true')
    // Nothing opened.
    expect(bridge.getReport).not.toHaveBeenCalled()
    await user.click(bar.getByRole('button', { name: 'Delete' }))
    expect(bridge.hideReports).toHaveBeenCalledWith(['r-aapl-2', 'r-aapl-1', 'r-msft-1'])
    await waitFor(() => expect(shown()).toEqual([]))
    expect(screen.getByText('Deleted 2 reports and hid one')).toBeInTheDocument()
  })

  test('Select starts it, ⇧-click takes the rows between, a plain click toggles, and Esc or Cancel ends it', async () => {
    const { user } = await renderApp()
    await user.click(options('AAPL'))
    await user.click(screen.getByRole('menuitem', { name: 'Select' }))
    await user.keyboard('{Shift>}')
    await user.click(rowOf('MSFT'))
    await user.keyboard('{/Shift}')
    expect(side().getByText('2 selected')).toBeInTheDocument()
    await user.click(rowOf('MSFT'))
    expect(side().getByText('1 selected')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(side().queryByRole('toolbar')).toBeNull()

    rowOf('AAPL').focus()
    await user.keyboard('{Meta>}a{/Meta}')
    expect(side().getByText('2 selected')).toBeInTheDocument()
    fireEvent.contextMenu(rowOf('MSFT'))
    expect(screen.getByRole('menuitem', { name: /Delete 2 selected/ })).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Cancel selection' }))
    expect(side().queryByRole('toolbar')).toBeNull()
    await user.keyboard('{Meta>}')
    await user.click(rowOf('MSFT'))
    await user.keyboard('{/Meta}')
    await user.click(side().getByRole('button', { name: 'Cancel' }))
    expect(side().queryByRole('toolbar')).toBeNull()
  })
})

describe('the keys', () => {
  test('↑ ↓ Home End move through the rows, which are one Tab stop', async () => {
    const { user } = await renderApp()
    expect(rowOf('AAPL')).toHaveAttribute('tabindex', '0')
    expect(rowOf('MSFT')).toHaveAttribute('tabindex', '-1')
    rowOf('AAPL').focus()
    await user.keyboard('{ArrowDown}')
    expect(rowOf('MSFT')).toHaveFocus()
    expect(rowOf('MSFT')).toHaveAttribute('tabindex', '0')
    await user.keyboard('{ArrowDown}{ArrowUp}')
    expect(rowOf('AAPL')).toHaveFocus()
    await user.keyboard('{End}')
    expect(rowOf('MSFT')).toHaveFocus()
    await user.keyboard('{Home}')
    expect(rowOf('AAPL')).toHaveFocus()
  })

  test('⇧F10 opens the row’s menu, and Esc puts the cursor back', async () => {
    const { user } = await renderApp()
    rowOf('MSFT').focus()
    await user.keyboard('{Shift>}{F10}{/Shift}')
    const rowMenu = screen.getByRole('menu', { name: 'MSFT report' })
    await user.keyboard('{ArrowDown}')
    expect(within(rowMenu).getByRole('menuitem', { name: 'Refresh report…' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(within(rowMenu).getByRole('menuitem', { name: 'Select' })).toHaveFocus()
    await user.keyboard('{ArrowUp}{End}')
    expect(within(rowMenu).getByRole('menuitem', { name: /Delete report/ })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(within(rowMenu).getByRole('menuitem', { name: 'Pin to top' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(rowOf('MSFT')).toHaveFocus()
  })

  test('Delete deletes the row, and Tab closes a menu', async () => {
    const { user } = await renderApp()
    await user.click(options('MSFT'))
    await user.keyboard('{Tab}')
    expect(screen.queryByRole('menu')).toBeNull()
    rowOf('MSFT').focus()
    await user.keyboard('{Delete}')
    expect(bridge.hideReports).toHaveBeenCalledWith(['r-msft-1'])
  })

  test('⌘[ and ⌘] follow the list as it is searched', async () => {
    const { user } = await renderApp()
    await openReport(user, 'AAPL')
    await user.click(side().getByRole('button', { name: 'Search your reports' }))
    await user.type(side().getByRole('textbox'), 'aapl')
    menu('next')
    menu('prev')
    await waitFor(() => expect(bridge.getReport).toHaveBeenCalled())
    expect(bridge.getReport).not.toHaveBeenCalledWith('r-msft-1', expect.anything())
  })
})
