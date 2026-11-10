// The Key numbers under the price chart: four groups that open and close (kept across reports),
// each row's working on a click, a dash and a reason for a number that can't be filled, and the
// whole of it reached by scrolling the chart panel, under the chart.

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { openReport, renderApp } from '../test/app'
import { bridge, chart, KEY_NUMBERS, ok } from '../test/bridge'
import { setSize, sizeReportPage } from '../test/screen'
import { ChartPane } from './ChartPane'
import { datedSummary, KeyNumbers, returnDate } from './KeyNumbers'

const header = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) })
const rowsOf = (key: string) => document.getElementById(`kn-${key}`)

describe('the date the 12-month return runs to', () => {
  test('is named only when it isn’t the close’s day', () => {
    expect(returnDate({ close_date: '2026-11-09', report_date: '2026-11-06' })).toBe('Nov 6')
    expect(returnDate({ close_date: '2026-11-06', report_date: '2026-11-06' })).toBeNull()
    expect(returnDate({ close_date: '2026-11-06', report_date: null })).toBeNull()
  })

  test('goes after the summary’s year', () => {
    expect(datedSummary('$346.31 · up 117.9% in a year', 'Nov 6')).toBe('$346.31 · up 117.9% in a year, to Nov 6')
    expect(datedSummary('$10.00 · level over a year', 'Nov 6')).toBe('$10.00 · level over a year, to Nov 6')
    expect(datedSummary('$10.00', 'Nov 6')).toBe('$10.00')
    expect(datedSummary('$10.00 · up 1.0% in a year', null)).toBe('$10.00 · up 1.0% in a year')
  })
})

describe('the Key numbers', () => {
  test('show the four groups with their summaries; Price and trading and Size and value start open', () => {
    render(<KeyNumbers numbers={KEY_NUMBERS} />)
    expect(screen.getByRole('heading', { name: 'Key numbers' })).toBeInTheDocument()
    expect(screen.getByText('Nov 6 close')).toBeInTheDocument()
    const heads = screen.getAllByRole('heading', { level: 3 })
    expect(heads.map((h) => h.textContent)).toEqual([
      // The return runs to the report's price date (Nov 5), not to the Nov 6 close: it says so.
      'Price and trading$230.10 · down 9.1% in a year, to Nov 5',
      'Size and value$3.45T · cheaper than peers on 2 of 3',
      'Profit and cash$391.0B revenue · above peers on 2 of 3',
      'Debt and safetyNet debt $30.3B · more debt than peers'
    ])
    expect(header('Price and trading')).toHaveAttribute('aria-expanded', 'true')
    expect(header('Size and value')).toHaveAttribute('aria-expanded', 'true')
    expect(header('Profit and cash')).toHaveAttribute('aria-expanded', 'false')
    expect(header('Debt and safety')).toHaveAttribute('aria-expanded', 'false')
    expect(header('Price and trading')).toHaveAttribute('aria-controls', 'kn-trading')
    expect(rowsOf('trading')).toBeInTheDocument()
    expect(rowsOf('profit')).toBeNull()
    expect(screen.getByText(/Peers: the median of the 38 peers/)).toBeInTheDocument()
  })

  test('each row has its name, the company’s value and the peer median where there is one', () => {
    render(<KeyNumbers numbers={KEY_NUMBERS} />)
    const pe = within(rowsOf('value')!).getByRole('button', { name: /^P\/E/ })
    expect(pe).toHaveTextContent('P/E19.6×Peers 32.2×')
    const move = within(rowsOf('trading')!).getByRole('button', { name: /^12-month return/ })
    expect(move.querySelector('.knv')).toHaveClass('down')
    expect(move).toHaveTextContent('12-month return, to Nov 5−9.1%Peers +55.7%')
    expect(within(rowsOf('trading')!).getByRole('button', { name: /^Price/ })).toHaveTextContent(/^Price\$230\.10$/)
  })

  test('a number that can’t be filled shows a dash and why, never a number', async () => {
    const user = userEvent.setup()
    render(<KeyNumbers numbers={KEY_NUMBERS} />)
    await user.click(header('Debt and safety'))
    const row = within(rowsOf('debt')!).getByRole('button', { name: /^Interest cover/ })
    expect(row).toHaveTextContent('Interest cover–no interest found')
    await user.click(row)
    expect(screen.getByText(/No interest expense was found in its SEC filings/)).toBeInTheDocument()
  })

  test('clicking a group opens and closes it, and what is open is kept for the next report', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<KeyNumbers numbers={KEY_NUMBERS} />)
    await user.click(header('Profit and cash'))
    expect(header('Profit and cash')).toHaveAttribute('aria-expanded', 'true')
    expect(within(rowsOf('profit')!).getAllByRole('button')).toHaveLength(5)
    await user.click(header('Price and trading'))
    expect(header('Price and trading')).toHaveAttribute('aria-expanded', 'false')
    expect(rowsOf('trading')).toBeNull()
    expect(localStorage.getItem('chart.keyGroups')).toBe('["value","profit"]')
    unmount()
    render(<KeyNumbers numbers={KEY_NUMBERS} />)
    expect(header('Price and trading')).toHaveAttribute('aria-expanded', 'false')
    expect(header('Profit and cash')).toHaveAttribute('aria-expanded', 'true')
  })

  test('two quick clicks on two groups both count', () => {
    render(<KeyNumbers numbers={KEY_NUMBERS} />)
    act(() => {
      header('Profit and cash').click()
      header('Debt and safety').click()
    })
    expect(header('Profit and cash')).toHaveAttribute('aria-expanded', 'true')
    expect(header('Debt and safety')).toHaveAttribute('aria-expanded', 'true')
    expect(localStorage.getItem('chart.keyGroups')).toBe('["trading","value","profit","debt"]')
  })

  test('the keyboard opens and closes groups and rows: Tab to a header, then Enter or Space', async () => {
    const user = userEvent.setup()
    render(<KeyNumbers numbers={KEY_NUMBERS} />)
    header('Debt and safety').focus()
    await user.keyboard('{Enter}')
    expect(header('Debt and safety')).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard(' ')
    expect(header('Debt and safety')).toHaveAttribute('aria-expanded', 'false')
    header('Size and value').focus()
    await user.tab()
    const market = within(rowsOf('value')!).getByRole('button', { name: /^Market value/ })
    expect(market).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(market).toHaveAttribute('aria-expanded', 'true')
  })

  test('clicking a number shows its working under it, and clicking again hides it', async () => {
    const user = userEvent.setup()
    render(<KeyNumbers numbers={KEY_NUMBERS} />)
    const pe = within(rowsOf('value')!).getByRole('button', { name: /^P\/E/ })
    expect(pe).toHaveAttribute('aria-expanded', 'false')
    await user.click(pe)
    expect(pe).toHaveAttribute('aria-expanded', 'true')
    const working = document.getElementById(pe.getAttribute('aria-controls')!)
    expect(working).toHaveTextContent('P/E: the working for 19.6×.')
    await user.click(pe)
    expect(pe).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('P/E: the working for 19.6×.')).toBeNull()
  })
})

describe('in the chart panel', () => {
  // `loading`: the report hasn't loaded yet, so the pane has no Key numbers at all (undefined).
  function pane(keyNumbers: typeof KEY_NUMBERS | null = KEY_NUMBERS, loading = false) {
    setSize('.chartwrap', 520, 420)
    bridge.getChart.mockResolvedValue(ok(chart()))
    render(<ChartPane reportId="r-aapl-2" cik={5000} ticker="AAPL" name="Apple Inc." width={560} split size="half" onClose={vi.fn()} onSize={vi.fn()} keyNumbers={loading ? undefined : keyNumbers} />)
  }

  test('sit under the chart, which keeps the panel’s height, in the panel that scrolls', async () => {
    pane()
    await screen.findByRole('img', { name: /daily price/ })
    const scroller = document.querySelector('.cpin')!
    const view = scroller.querySelector(':scope > .cview')!
    const table = scroller.querySelector(':scope > .kn')!
    expect(view.querySelector('.chartwrap')).toBeInTheDocument()
    expect(view.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Key numbers' })).toBe(table)
  })

  test('aren’t shown until the report’s numbers are there', async () => {
    pane(null, true)
    await screen.findByRole('img', { name: /daily price/ })
    expect(screen.queryByRole('region', { name: 'Key numbers' })).toBeNull()
  })

  test('that can’t be read say so, in one line', async () => {
    pane(null)
    await screen.findByRole('img', { name: /daily price/ })
    expect(screen.getByRole('region', { name: 'Key numbers' })).toHaveTextContent('Key numbers aren’t available for this report.')
  })

  test('on the report page, are the open report’s, under its chart', async () => {
    const { user } = await renderApp()
    sizeReportPage(1048)
    await openReport(user)
    await user.click(screen.getByRole('button', { name: /^Chart/ }))
    const table = await screen.findByRole('region', { name: 'Key numbers' })
    expect(table.closest('.cpane')).toBeInTheDocument()
    expect(within(table).getByText('$3.45T · cheaper than peers on 2 of 3')).toBeInTheDocument()
  })
})
