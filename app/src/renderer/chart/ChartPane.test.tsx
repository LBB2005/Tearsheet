// The price chart beside the report: its ranges and toggles, hover and measure, the line between
// price and volume, the full-history download for 5Y and All, and the divider that resizes it.

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import type { ChartSeries } from '../../shared/protocol'
import { openReport, renderApp } from '../test/app'
import { bridge, chart, fail, ok } from '../test/bridge'
import { setReducedMotion, setSize, sizeReportPage } from '../test/screen'
import { ChartPane } from './ChartPane'

// Each test uses its own company: the pane keeps each company's history download for the session.
let nextCik = 1000
function pane(over: Partial<Parameters<typeof ChartPane>[0]> = {}) {
  setSize('.chartwrap', 520, 420)
  const props = { reportId: 'r-aapl-2', cik: nextCik++, ticker: 'AAPL', name: 'Apple Inc.', width: 560, split: true, size: 'half' as const, onClose: vi.fn(), onSize: vi.fn(), ...over }
  const user = userEvent.setup()
  render(<ChartPane {...props} />)
  return { user, props }
}

const drawn = () => screen.findByRole('img', { name: /daily price/ })
const range = (name: string) => within(screen.getByRole('group', { name: 'Range' })).getByRole('button', { name })
const readout = () => document.querySelector('.cpbig')?.textContent
const wrap = () => document.querySelector('.chartwrap') as HTMLElement

describe('the chart', () => {
  test('draws the stored series on the range Settings chose, and reads out the last close', async () => {
    pane()
    expect(screen.getByLabelText('Loading the price chart')).toBeInTheDocument()
    expect(await drawn()).toHaveAccessibleName('AAPL daily price, 1Y')
    expect(range('1Y')).toHaveAttribute('aria-pressed', 'true')
    expect(readout()).toMatch(/^\$\d+\.\d\d[+−][\d.]+%over 1 year, to Nov 6$/)
    expect(screen.getByText('Apple Inc., daily close, adjusted for splits')).toBeInTheDocument()
  })

  test('opens on the range kept in Settings', async () => {
    localStorage.setItem('chart.startRange', '3M')
    pane()
    expect(await drawn()).toHaveAccessibleName('AAPL daily price, 3M')
  })

  test('each range button redraws it', async () => {
    const { user } = pane()
    await drawn()
    for (const r of ['1W', '1M', '3M', '6M', 'YTD', '1Y']) {
      await user.click(range(r))
      expect(range(r)).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('img', { name: /daily price/ })).toHaveAccessibleName(`AAPL daily price, ${r}`)
    }
  })

  test('the toggles add the range fan, the peers and the S&P 500, and turn the volume off and on', async () => {
    const { user } = pane()
    await drawn()
    const toggle = (name: string) => screen.getByRole('button', { name })
    await user.click(toggle('12-month range'))
    expect(toggle('12-month range')).toHaveAttribute('aria-pressed', 'true')
    await user.click(toggle('Peers'))
    expect(screen.getByText('Peers, equal-weighted')).toBeInTheDocument()
    expect(screen.getByText('Apple Inc., total return, with dividends')).toBeInTheDocument()
    expect(readout()).toContain('total return')
    await user.click(toggle('S&P 500'))
    expect(document.querySelector('.cfoot')).toHaveTextContent('S&P 500')

    expect(screen.getByRole('separator', { name: 'Price and volume heights' })).toBeInTheDocument()
    await user.click(toggle('Volume'))
    expect(localStorage.getItem('chart.volume')).toBe('0')
    expect(screen.queryByRole('separator', { name: 'Price and volume heights' })).toBeNull()
    await user.click(toggle('Volume'))
    expect(localStorage.getItem('chart.volume')).toBeNull()
  })

  test('a toggle with nothing behind it is greyed out and says why', async () => {
    const bare: ChartSeries = { ...chart(), peers: chart().peers.map(() => null), spy: chart().spy.map(() => null), range: null }
    bridge.getChart.mockResolvedValue(ok(bare))
    pane()
    await drawn()
    expect(screen.getByRole('button', { name: 'Peers' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Peers' })).toHaveAttribute('title', 'No peer prices are stored for this report.')
    expect(screen.getByRole('button', { name: 'S&P 500' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '12-month range' })).toHaveAttribute('title', 'This report has no 12-month range.')
  })

  test('hovering reads out a day, and dragging across measures between two days', async () => {
    pane()
    await drawn()
    fireEvent.pointerMove(wrap(), { clientX: 300 })
    expect(readout()).toMatch(/on [A-Z][a-z]{2} \d+(, \d{4})?, since Nov \d+, 2025$/)
    fireEvent.pointerLeave(wrap())
    expect(readout()).toMatch(/over 1 year/)

    fireEvent.pointerDown(wrap(), { clientX: 100, button: 0, pointerId: 1 })
    fireEvent.pointerMove(wrap(), { clientX: 400, pointerId: 1 })
    fireEvent.pointerUp(wrap(), { pointerId: 1 })
    expect(readout()).toMatch(/from [A-Z][a-z]{2} \d+(, \d{4})? to [A-Z][a-z]{2} \d+, \d+ trading days$/)
    expect(document.querySelector('.c-meas')).not.toBeNull()

    // A click without a drag clears the measure.
    fireEvent.pointerDown(wrap(), { clientX: 200, button: 0, pointerId: 1 })
    fireEvent.pointerUp(wrap(), { pointerId: 1 })
    expect(document.querySelector('.c-meas')).toBeNull()
    // Outside the plot there is no day to read.
    fireEvent.pointerDown(wrap(), { clientX: 2, button: 0, pointerId: 1 })
    expect(document.querySelector('.c-meas')).toBeNull()
  })

  test('the line between price and volume moves with the arrows or a drag, is kept, and a double-click puts it back', async () => {
    pane()
    await drawn()
    const line = screen.getByRole('separator', { name: 'Price and volume heights' })
    const start = Number(line.getAttribute('aria-valuenow'))
    fireEvent.keyDown(line, { key: 'ArrowUp' })
    expect(Number(line.getAttribute('aria-valuenow'))).toBe(start + 2)
    expect(localStorage.getItem('chart.volumeShare')).not.toBeNull()
    fireEvent.keyDown(line, { key: 'ArrowDown' })
    fireEvent.keyDown(line, { key: 'ArrowDown' })
    expect(Number(line.getAttribute('aria-valuenow'))).toBe(start - 2)
    fireEvent.keyDown(line, { key: 'Tab' })

    fireEvent.pointerDown(line, { clientY: 200, button: 0, pointerId: 2 })
    expect(line).toHaveClass('hot')
    fireEvent.pointerMove(line, { clientY: 250, pointerId: 2 })
    fireEvent.pointerUp(line, { clientY: 250, pointerId: 2 })
    expect(line).not.toHaveClass('hot')
    const dragged = Number(line.getAttribute('aria-valuenow'))
    expect(dragged).not.toBe(start - 2)
    expect(Math.round(Number(localStorage.getItem('chart.volumeShare')) * 100)).toBe(dragged)

    fireEvent.doubleClick(line)
    expect(Number(line.getAttribute('aria-valuenow'))).toBe(start)
  })

  test('the width buttons and the close button tell the report page; a narrow window has no width buttons', async () => {
    const { user, props } = pane({ size: 'wide' })
    await drawn()
    expect(screen.getByRole('button', { name: 'Wide' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Narrow' }))
    expect(props.onSize).toHaveBeenCalledWith('narrow')
    await user.click(screen.getByRole('button', { name: 'Close the panel' }))
    expect(props.onClose).toHaveBeenCalled()
  })

  test('with no room beside the report, the chart has no width buttons', async () => {
    pane({ split: false, size: null, width: 700 })
    await drawn()
    expect(screen.queryByRole('group', { name: 'Chart width' })).toBeNull()
    expect(screen.getByText('Hover for a day; drag across to measure.')).toBeInTheDocument()
  })

  test('a chart that doesn’t load says why, and Try again asks again', async () => {
    bridge.getChart.mockResolvedValueOnce(fail('No prices stored.'))
    const { user } = pane()
    expect(await screen.findByRole('alert')).toHaveTextContent('The price chart didn’t load. No prices stored.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await drawn()
  })

  test('a company with no prices yet says so', async () => {
    bridge.getChart.mockResolvedValue(ok({ ...chart(), dates: [], close: [], volume: [], total: [], peers: [], spy: [] }))
    pane()
    expect(await screen.findByText('No daily prices are stored for this company yet.')).toBeInTheDocument()
  })

  test('glides to a new range when motion is on, and settles', async () => {
    setReducedMotion(false)
    const { user } = pane()
    await drawn()
    await user.click(range('3M'))
    await waitFor(() => expect(screen.getByRole('img', { name: /daily price/ })).toHaveAccessibleName('AAPL daily price, 3M'))
    await user.click(screen.getByRole('button', { name: 'Peers' }))
    await act(() => new Promise((r) => setTimeout(r, 400)))
    expect(screen.getByText('Peers, equal-weighted')).toBeInTheDocument()
  })
})

describe('5Y and All', () => {
  test('the first time, download the company’s full history, then draw it', async () => {
    let landed: (v: ReturnType<typeof ok<{ first_date: string; days: number }>>) => void = () => undefined
    bridge.fetchHistory.mockReturnValue(new Promise((resolve) => (landed = resolve)))
    const { user } = pane()
    await drawn()
    bridge.getChart.mockResolvedValue(ok(chart(1300)))
    await user.click(range('5Y'))
    expect(bridge.fetchHistory).toHaveBeenCalledWith('r-aapl-2')
    expect(screen.getByRole('status')).toHaveTextContent('Downloading the full price history…')
    expect(readout()).toContain('getting the full history')
    // The shorter ranges stay usable meanwhile.
    await user.click(range('1M'))
    expect(screen.queryByText('Downloading the full price history…')).toBeNull()
    await user.click(range('5Y'))
    await act(async () => landed(ok({ first_date: '2021-11-08', days: 1300 })))
    expect(await drawn()).toHaveAccessibleName('AAPL daily price, 5Y')
    expect(bridge.fetchHistory).toHaveBeenCalledTimes(1)
  })

  test('a history still short after the download greys out 5Y and shows what there is', async () => {
    const { user } = pane()
    await drawn()
    await user.click(range('5Y'))
    await waitFor(() => expect(range('5Y')).toBeDisabled())
    expect(range('All')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/^Massive’s free plan serves/)).toBeInTheDocument()
  })

  test('a download that fails says why, and picking the range again tries again', async () => {
    bridge.fetchHistory.mockResolvedValueOnce(fail('Massive refused the key.')).mockResolvedValueOnce(fail('A report is running. Try again after it.', 'RUN_IN_PROGRESS'))
    const { user } = pane()
    await drawn()
    await user.click(range('All'))
    expect(await screen.findByText('The full price history didn’t download. Massive refused the key.')).toBeInTheDocument()
    await user.click(range('All'))
    expect(await screen.findByText('A report is running. Try again after it.')).toBeInTheDocument()
    expect(bridge.fetchHistory).toHaveBeenCalledTimes(2)
  })

  test('a history that downloaded but couldn’t be read again says so', async () => {
    const { user } = pane()
    await drawn()
    bridge.getChart.mockResolvedValue(fail('The database is locked.'))
    await user.click(range('All'))
    expect(await screen.findByText('The history downloaded, but the chart didn’t read it again. The database is locked.')).toBeInTheDocument()
  })
})

describe('the divider between the report and the chart', () => {
  const divider = () => screen.getByRole('separator', { name: 'Resize the chart' })

  test('moves with the arrows, goes back to Half with Return, and snaps where it is dragged', async () => {
    const { user } = await renderApp()
    sizeReportPage(1048)
    await openReport(user)
    await user.click(screen.getByRole('button', { name: /^Chart/ }))
    expect(screen.getByRole('button', { name: 'Half' })).toHaveAttribute('aria-pressed', 'true')
    const half = Number(divider().getAttribute('aria-valuenow'))

    fireEvent.keyDown(divider(), { key: 'ArrowLeft' })
    expect(Number(divider().getAttribute('aria-valuenow'))).toBeGreaterThan(half)
    fireEvent.keyDown(divider(), { key: 'Enter' })
    expect(Number(divider().getAttribute('aria-valuenow'))).toBe(half)
    fireEvent.keyDown(divider(), { key: 'ArrowRight' })
    expect(Number(divider().getAttribute('aria-valuenow'))).toBeLessThan(half)
    fireEvent.doubleClick(divider())
    expect(Number(divider().getAttribute('aria-valuenow'))).toBe(half)

    // Dragged nearly to the left edge, it snaps to Full and the report hides behind it.
    fireEvent.pointerDown(divider(), { clientX: 520, button: 0, pointerId: 3 })
    expect(document.querySelector('.dragshield')).not.toBeNull()
    fireEvent.pointerMove(divider(), { clientX: 20, pointerId: 3 })
    fireEvent.pointerUp(divider(), { pointerId: 3 })
    expect(document.querySelector('.dragshield')).toBeNull()
    expect(screen.getByRole('button', { name: 'Full' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelector('.rpage')).toHaveClass('full')
    // From Full, the left arrow brings the report back.
    fireEvent.keyDown(divider(), { key: 'ArrowRight' })
    expect(document.querySelector('.rpage')).not.toHaveClass('full')
    await user.click(screen.getByRole('button', { name: 'Narrow' }))
    expect(screen.getByRole('button', { name: 'Narrow' })).toHaveAttribute('aria-pressed', 'true')
  })
})
