// The panel beside the report, as a person uses it: a link in the report opens a bigger view with
// its item picked, pointing reads it out, the switches redraw it, and the panel's own switch,
// width buttons and close button work. The report's numbers come from the fake bridge.

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'

import { openReport, renderApp } from '../test/app'
import { bridge, ok, menu, openView } from '../test/bridge'
import { fullNumbers } from '../test/reportNumbers'
import { sizeReportPage } from '../test/screen'

beforeEach(() => {
  bridge.getReportNumbers.mockImplementation(async (id: string) => ok(fullNumbers(id)))
})

// The app with a report open and the panel shut.
async function reportOpen() {
  const app = await renderApp()
  sizeReportPage()
  await openReport(app.user)
  return app
}

// The bigger view on show (the price chart's pane stays mounted, hidden, beside it).
const view = async (name: string) => within(await screen.findByRole('region', { name }))
const panelRegion = (name: string) => screen.queryByRole('region', { name })
const vread = () => document.querySelector('.vpane .vread')?.textContent ?? ''

describe('opening a view from the report', () => {
  test('a link opens the view with the item it names picked', async () => {
    await reportOpen()
    openView('factors', '1')
    const factors = await view('Score by factor')
    await waitFor(() => expect(factors.getByText('value')).toBeInTheDocument())
    const picked = document.querySelectorAll('.vpane .picked')
    expect(picked).toHaveLength(1)
    expect(picked[0]).toHaveTextContent('value')
    expect(bridge.getReportNumbers).toHaveBeenCalledWith('r-aapl-2')
    expect(vread()).toBe('Score 72 of 100, ahead of 72% of peers')
  })

  test('a link naming nothing that is there opens the view with nothing picked', async () => {
    await reportOpen()
    openView('metrics', 'no_such_metric')
    await view('Key metrics')
    await screen.findByText('Price to earnings')
    expect(document.querySelectorAll('.vpane .picked')).toHaveLength(0)
  })

  test('a link to the price chart opens it with the 12-month range on, and another link while it is open turns it on again', async () => {
    const { user } = await reportOpen()
    openView('price', null)
    await screen.findByRole('img', { name: /daily price/ })
    const fan = () => screen.getByRole('button', { name: '12-month range' })
    await waitFor(() => expect(fan()).toHaveAttribute('aria-pressed', 'true'))
    await user.click(fan())
    expect(fan()).toHaveAttribute('aria-pressed', 'false')
    // The same link again, with the panel already showing it, does nothing; a link to another view and back asks again.
    openView('price', null)
    expect(fan()).toHaveAttribute('aria-pressed', 'false')
    openView('flags', null)
    await view('Red flags')
    openView('price', null)
    await waitFor(() => expect(fan()).toHaveAttribute('aria-pressed', 'true'))
  })

  test('a view that is still loading says so, and one that fails to load can try again', async () => {
    bridge.getReportNumbers.mockResolvedValueOnce({ ok: false, error: { message: 'The engine is busy.' } })
    const { user } = await reportOpen()
    openView('economy', null)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('This view didn’t load. The engine is busy.')
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    const economy = await view('Economy')
    await economy.findByText('Inflation')
    expect(bridge.getReportNumbers).toHaveBeenCalledTimes(2)
  })

  test('numbers that can’t be reached at all say the engine didn’t answer', async () => {
    bridge.getReportNumbers.mockRejectedValueOnce(new Error('socket closed'))
    await reportOpen()
    openView('economy', null)
    expect(await screen.findByRole('alert')).toHaveTextContent('socket closed')
  })

  test('an engine that gives no reason is said not to have answered', async () => {
    bridge.getReportNumbers.mockRejectedValueOnce('nope')
    await reportOpen()
    openView('economy', null)
    expect(await screen.findByRole('alert')).toHaveTextContent('Tearsheet’s engine didn’t answer.')
  })

  test('the loading skeleton shows until the numbers arrive', async () => {
    let release: (n: ReturnType<typeof fullNumbers>) => void = () => {}
    bridge.getReportNumbers.mockImplementationOnce(() => new Promise((r) => (release = (n) => r(ok(n)))))
    await reportOpen()
    openView('returns', null)
    expect(await screen.findByLabelText('Loading this view')).toBeInTheDocument()
    await act(async () => release(fullNumbers()))
    expect(await screen.findByText('+12.5%')).toBeInTheDocument()
    expect(screen.queryByLabelText('Loading this view')).toBeNull()
  })
})

describe('score by factor', () => {
  test('points to read out, leaves to clear, sorts by percentile or weight, and switches the peer median', async () => {
    const { user } = await reportOpen()
    openView('factors', null)
    const factors = await view('Score by factor')
    const rows = async () => (await view('Score by factor')).getAllByRole('button').filter((b) => b.classList.contains('frow')).map((b) => b.querySelector('.fname')?.textContent)
    await waitFor(async () => expect(await rows()).toEqual(['growth', 'quality', 'value']))

    const growth = factors.getByText('growth').closest('button') as HTMLElement
    await user.hover(growth)
    expect(vread()).toBe('Growth: ahead of 80% of peers')
    await user.unhover(growth)
    expect(vread()).toBe('Score 72 of 100, ahead of 72% of peers')
    act(() => growth.focus())
    expect(vread()).toBe('Growth: ahead of 80% of peers')
    act(() => growth.blur())
    expect(vread()).toBe('Score 72 of 100, ahead of 72% of peers')
    await user.hover(growth)
    fireEvent.pointerLeave(document.querySelector('.frows')!)
    expect(vread()).toBe('Score 72 of 100, ahead of 72% of peers')

    await user.click(factors.getByRole('button', { name: 'Weight' }))
    expect(factors.getByRole('button', { name: 'Weight' })).toHaveAttribute('aria-pressed', 'true')
    expect(await rows()).toEqual(['value', 'growth', 'quality'])
    expect(factors.getByText('40% of the score')).toBeInTheDocument()

    expect(document.querySelector('.vpane .fhead')).not.toBeNull()
    await user.click(factors.getByRole('button', { name: 'Peer median' }))
    expect(document.querySelector('.vpane .fhead')).toBeNull()
  })

  test('says so when the factors aren’t stored', async () => {
    bridge.getReportNumbers.mockResolvedValue(ok({ ...fullNumbers(), factors: [] }))
    await reportOpen()
    openView('factors', null)
    expect(await screen.findByText('Score by factor isn’t stored for this report.')).toBeInTheDocument()
  })
})

describe('key metrics', () => {
  test('reads out a metric and each peer’s own value, and switches the peers, the median and the order', async () => {
    const { user } = await reportOpen()
    openView('metrics', 'margin')
    const metrics = await view('Key metrics')
    await metrics.findByText('Operating margin')
    expect(document.querySelectorAll('.vpane .picked')).toHaveLength(1)

    const pe = metrics.getByText('Price to earnings').closest('.mrow') as HTMLElement
    await user.hover(pe)
    expect(vread()).toBe('Price to earnings: 28.0×, peers 24.0×')
    await user.unhover(pe)
    expect(vread()).toBe('')
    act(() => pe.focus())
    expect(vread()).toBe('Price to earnings: 28.0×, peers 24.0×')
    act(() => pe.blur())
    expect(vread()).toBe('')

    expect(metrics.queryByRole('button', { name: /^MSFT/ })).toBeNull()
    await user.click(metrics.getByRole('button', { name: 'Each peer' }))
    const msft = metrics.getByRole('button', { name: 'MSFT: 32.0×' })
    fireEvent.pointerEnter(msft)
    expect(vread()).toBe('MSFT: 32.0×')
    // Off the dot and onto its row, the metric reads out again.
    fireEvent.pointerOut(msft, { relatedTarget: pe })
    expect(vread()).toBe('Price to earnings: 28.0×, peers 24.0×')
    act(() => metrics.getByRole('button', { name: 'NVDA: 40.0×' }).focus())
    expect(vread()).toBe('NVDA: 40.0×')
    await user.click(metrics.getByRole('button', { name: 'Each peer' }))
    expect(metrics.queryByRole('button', { name: /^MSFT/ })).toBeNull()

    expect(document.querySelectorAll('.vpane .mmed')).toHaveLength(2)
    await user.click(metrics.getByRole('button', { name: 'Peer median' }))
    expect(document.querySelectorAll('.vpane .mmed')).toHaveLength(0)

    const order = () => Array.from(document.querySelectorAll('.vpane .mname')).map((e) => e.textContent)
    expect(order()).toEqual(['Price to earnings', 'Operating margin', 'Beta'])
    await user.click(metrics.getByRole('button', { name: 'Share below' }))
    expect(order()).toEqual(['Operating margin', 'Price to earnings', 'Beta'])
  })

  test('the peers switch is greyed out, and says why, when no peer values are stored', async () => {
    const n = fullNumbers()
    bridge.getReportNumbers.mockResolvedValue(ok({ ...n, metrics: n.metrics!.map((m) => ({ ...m, peers: [] })) }))
    await reportOpen()
    openView('metrics', null)
    const metrics = await view('Key metrics')
    const peers = await metrics.findByRole('button', { name: 'Each peer' })
    expect(peers).toBeDisabled()
    expect(peers).toHaveAttribute('title', 'No peer values are stored for this report.')
  })

  test('says so when the metrics aren’t stored', async () => {
    bridge.getReportNumbers.mockResolvedValue(ok({ ...fullNumbers(), metrics: null }))
    await reportOpen()
    openView('metrics', null)
    expect(await screen.findByText('Key metrics aren’t stored for this report.')).toBeInTheDocument()
  })
})

describe('value per share by method', () => {
  test('reads out the marks and the methods, and switches the range, the price and the estimate', async () => {
    const { user } = await reportOpen()
    openView('methods', 'multiples')
    const methods = await view('Value per share by method')
    await methods.findByText('Cash flow')
    expect(document.querySelectorAll('.vpane .picked')).toHaveLength(1)
    expect(vread()).toBe('Estimate: $250.00')

    const hoverOver = async (el: HTMLElement, said: string) => {
      await user.hover(el)
      expect(vread()).toBe(said)
      await user.unhover(el)
      expect(vread()).toBe('Estimate: $250.00')
    }
    const mark = (name: string) => methods.getAllByRole('button', { name }).find((b) => b.classList.contains('vmark')) as HTMLElement
    await hoverOver(mark('12-month range'), '12-month range: $190.00 to $290.00')
    await hoverOver(mark('Today’s price'), 'Today: $230.10')
    await hoverOver(mark('Estimate'), 'Estimate: $250.00')
    await hoverOver(methods.getByText('Cash flow').closest('.mrow') as HTMLElement, 'Cash flow: $260.00 a share')
    expect(methods.getByText('$260.00')).toBeInTheDocument()
    const row = methods.getByText('Multiples').closest('.mrow') as HTMLElement
    act(() => row.focus())
    expect(vread()).toBe('Multiples: $235.00 a share')
    act(() => row.blur())
    expect(vread()).toBe('Estimate: $250.00')

    for (const [name, mark] of [['12-month range', '.vmark.range'], ['Today’s price', '.vmark.price'], ['Estimate', '.vmark.est']] as const) {
      const toggle = () => methods.getAllByRole('button', { name }).find((b) => b.classList.contains('tg')) as HTMLElement
      expect(toggle()).toHaveAttribute('aria-pressed', 'true')
      expect(document.querySelector(`.vpane ${mark}`)).not.toBeNull()
      await user.click(toggle())
      expect(toggle()).toHaveAttribute('aria-pressed', 'false')
      expect(document.querySelector(`.vpane ${mark}`)).toBeNull()
    }
  })

  test('a switch with nothing stored behind it is greyed out and says so', async () => {
    bridge.getReportNumbers.mockResolvedValue(ok({ ...fullNumbers(), range: null, price: null, estimate: null }))
    await reportOpen()
    openView('methods', null)
    const methods = await view('Value per share by method')
    await methods.findByText('Cash flow')
    const toggle = (name: string) => methods.getAllByRole('button', { name }).find((b) => b.classList.contains('tg')) as HTMLElement
    expect(toggle('12-month range')).toBeDisabled()
    expect(toggle('12-month range')).toHaveAttribute('title', 'The 12-month range isn’t stored for this report.')
    expect(toggle('Today’s price')).toHaveAttribute('title', 'Today’s price isn’t stored for this report.')
    expect(toggle('Estimate')).toHaveAttribute('title', 'The estimate isn’t stored for this report.')
    expect(vread()).toBe('')
  })

  test('says so when no methods are stored', async () => {
    bridge.getReportNumbers.mockResolvedValue(ok({ ...fullNumbers(), methods: null }))
    await reportOpen()
    openView('methods', null)
    expect(await screen.findByText('Value per share by method isn’t stored for this report.')).toBeInTheDocument()
  })
})

describe('total return', () => {
  const bar = (name: string) => within(screen.getByRole('region', { name: 'Total return' })).getByText(name, { selector: '.mname' }).closest('.mrow') as HTMLElement
  const spanButton = (y: string) => within(screen.getByRole('group', { name: 'Span' })).getByRole('button', { name: y })

  test('picks the row a link names, reads rows out, and switches the spans, the peers, the S&P 500 and each peer', async () => {
    const { user } = await reportOpen()
    openView('returns', 'spy')
    const returns = await view('Total return')
    await returns.findByText('+12.5%')
    expect(document.querySelectorAll('.vpane .picked')).toHaveLength(1)
    expect(bar('S&P 500')).toHaveClass('picked')

    await user.hover(bar('Apple'))
    expect(vread()).toBe('Apple returned 12.5')
    await user.unhover(bar('Apple'))
    expect(vread()).toBe('')
    act(() => bar('Peers').focus())
    expect(vread()).toBe('Peers returned 8')
    act(() => bar('Peers').blur())
    expect(vread()).toBe('')

    // Each peer is only reached by switching it on.
    expect(returns.queryByText('MSFT')).toBeNull()
    await user.click(returns.getByRole('button', { name: 'Each peer' }))
    expect(returns.getByText('MSFT')).toBeInTheDocument()
    expect(returns.getByText('−3.0%')).toBeInTheDocument()
    expect(returns.getByText('Not stored')).toBeInTheDocument()
    await user.hover(bar('GOOG'))
    expect(vread()).toBe('GOOG: not stored')
    await user.click(returns.getByRole('button', { name: 'Each peer' }))
    expect(returns.queryByText('MSFT')).toBeNull()

    await user.click(returns.getByRole('button', { name: 'S&P 500' }))
    expect(returns.queryByText('S&P 500', { selector: '.mname' })).toBeNull()
    await user.click(returns.getByRole('button', { name: 'Peers' }))
    expect(returns.queryByText('Peers', { selector: '.mname' })).toBeNull()

    expect(spanButton('1Y')).toHaveAttribute('aria-pressed', 'true')
    await user.click(spanButton('3Y'))
    expect(spanButton('3Y')).toHaveAttribute('aria-pressed', 'true')
    expect(returns.getByText('+40.0%')).toBeInTheDocument()
  })

  test('spans that aren’t stored are greyed out with a title, and peers are left off the longer spans', async () => {
    const { user } = await reportOpen()
    openView('returns', null)
    const returns = await view('Total return')
    await returns.findByText('+12.5%')
    expect(spanButton('5Y')).toBeDisabled()
    expect(spanButton('5Y')).toHaveAttribute('title', expect.stringContaining('full price history'))
    expect(spanButton('3Y')).toBeEnabled()
    expect(returns.getByText(/Longer spans show once the full price history is stored/)).toBeInTheDocument()
    expect(returns.queryByText(/Peers have about 14 months/)).toBeNull()

    await user.click(spanButton('3Y'))
    expect(returns.getByText(/Peers have about 14 months/)).toBeInTheDocument()
    const peers = returns.getByRole('button', { name: 'Peers' })
    expect(peers).toBeDisabled()
    expect(peers).toHaveAttribute('aria-pressed', 'false')
    expect(returns.getByRole('button', { name: 'Each peer' })).toBeDisabled()
  })

  test('says so when the returns aren’t stored', async () => {
    bridge.getReportNumbers.mockResolvedValue(ok({ ...fullNumbers(), returns: [] }))
    await reportOpen()
    openView('returns', null)
    expect(await screen.findByText('Total return isn’t stored for this report.')).toBeInTheDocument()
  })
})

describe('red flags and the economy', () => {
  test('red flags count what was found, read each out, and pick the one a link names', async () => {
    await reportOpen()
    openView('flags', 'restatement')
    const flags = await view('Red flags')
    await flags.findByText('Restated results')
    expect(vread()).toBe('1 of 2 checks found')
    expect(flags.getByLabelText('1 of 2 checks found')).toBeInTheDocument()
    expect(flags.getByText('found')).toBeInTheDocument()
    expect(flags.getByText('clear')).toBeInTheDocument()
    expect(flags.getByText('Restated results').closest('button')).toHaveClass('picked')

    const row = flags.getByText('Going concern doubt').closest('button') as HTMLElement
    act(() => row.focus())
    expect(vread()).toBe('No going-concern doubt found')
    act(() => row.blur())
    expect(vread()).toBe('1 of 2 checks found')
    fireEvent.pointerEnter(row)
    expect(vread()).toBe('No going-concern doubt found')
    fireEvent.pointerLeave(document.querySelector('.rfrows')!)
    expect(vread()).toBe('1 of 2 checks found')
  })

  test('the economy’s figures read out on pointer and focus', async () => {
    await reportOpen()
    openView('economy', 'rate')
    const economy = await view('Economy')
    await economy.findByText('Fed funds')
    expect(economy.getByText('Fed funds').closest('button')).toHaveClass('picked')
    expect(vread()).toBe('')
    const tile = economy.getByText('Inflation').closest('button') as HTMLElement
    fireEvent.pointerEnter(tile)
    expect(vread()).toBe('Inflation was 2.9% in September')
    fireEvent.pointerLeave(document.querySelector('.etiles')!)
    expect(vread()).toBe('')
    act(() => tile.focus())
    expect(vread()).toBe('Inflation was 2.9% in September')
    act(() => tile.blur())
    expect(vread()).toBe('')
  })

  test('both say so when nothing is stored', async () => {
    bridge.getReportNumbers.mockResolvedValue(ok({ ...fullNumbers(), red_flags: [], economy: null }))
    await reportOpen()
    openView('flags', null)
    expect(await screen.findByText('Red flags isn’t stored for this report.')).toBeInTheDocument()
    openView('economy', null)
    expect(await screen.findByText('Economy isn’t stored for this report.')).toBeInTheDocument()
  })
})

describe('the rings', () => {
  test('each slice shows its list, or says what isn’t stored, and the arcs read out', async () => {
    await reportOpen()
    openView('rings', 'removed')
    const rings = await view('Peer ratings and checks')
    await rings.findByText('Claim checks')
    expect(rings.getByText('Peer ratings')).toBeInTheDocument()
    const summary = (text: string) => rings.getByText((_, el) => el?.tagName === 'SUMMARY' && el.textContent === text).closest('details') as HTMLDetailsElement
    const kept = summary('Kept 38')
    expect(kept.open).toBe(false)
    expect(within(kept).getByText('Revenue grew 6%')).toBeInTheDocument()
    expect(summary('Removed 3')).toHaveAttribute('open')
    expect(rings.getByText('Nothing here.')).toBeInTheDocument()
    expect(rings.getAllByText('Which peers are Buy, Hold or Sell isn’t stored for this report.')).toHaveLength(3)
    expect(summary('Buy 20').open).toBe(false)

    const arc = rings.getByRole('img', { name: '20 Buy' })
    fireEvent.pointerEnter(arc)
    expect(vread()).toBe('20 Buy')
    fireEvent.pointerLeave(arc)
    expect(vread()).toBe('')
    act(() => arc.focus())
    expect(vread()).toBe('20 Buy')
    act(() => arc.blur())
    expect(vread()).toBe('')
    expect(document.querySelector('.vpane .rarc.picked')).not.toBeNull()
  })

  test('a ring that was never stored says so, and a claims ring with no list says what was checked isn’t stored', async () => {
    const n = fullNumbers()
    bridge.getReportNumbers.mockResolvedValue(ok({ ...n, peer_ratings: null, claims: { total: 4, slices: [{ key: 'kept', label: 'Kept', count: 4, readout: '4 Kept', items: null }] } }))
    await reportOpen()
    openView('rings', null)
    expect(await screen.findByText('Peer ratings isn’t stored for this report.')).toBeInTheDocument()
    expect(screen.getByText('What was checked isn’t stored for this report.')).toBeInTheDocument()
  })
})

describe('a Full-report table', () => {
  const table = async () => within(await screen.findByRole('region', { name: 'Income statement table' }))
  const body = () => Array.from(document.querySelectorAll('.vpane tbody tr')).map((r) => r.querySelector('td')?.textContent)

  test('opens with the row a link names picked, and sorting toggles ascending and descending', async () => {
    const { user } = await reportOpen()
    openView('table-income', '1')
    const t = await table()
    await t.findByText('Net income')
    expect(document.querySelector('.vpane tr.picked')).toHaveTextContent('Net income')
    expect(t.getByText('3 of 3 rows')).toBeInTheDocument()

    const header = (name: string) => t.getByRole('columnheader', { name })
    expect(header('Line')).toHaveAttribute('aria-sort', 'none')
    await user.click(within(header('Line')).getByRole('button'))
    expect(header('Line')).toHaveAttribute('aria-sort', 'ascending')
    expect(body()).toEqual(['Net income', 'Notes', 'Revenue'])
    await user.click(within(header('Line')).getByRole('button'))
    expect(header('Line')).toHaveAttribute('aria-sort', 'descending')
    expect(body()).toEqual(['Revenue', 'Notes', 'Net income'])

    await user.click(within(header('FY2025')).getByRole('button'))
    expect(header('Line')).toHaveAttribute('aria-sort', 'none')
    expect(header('FY2025')).toHaveAttribute('aria-sort', 'ascending')
  })

  test('the filter counts the rows that match, and says when none do', async () => {
    const { user } = await reportOpen()
    openView('table-income', null)
    const t = await table()
    const filter = await t.findByRole('searchbox', { name: 'Filter rows' })
    await user.type(filter, 'net')
    expect(t.getByText('1 of 3 rows')).toBeInTheDocument()
    expect(body()).toEqual(['Net income'])
    await user.clear(filter)
    await user.type(filter, 'zzz')
    expect(t.getByText('0 of 3 rows')).toBeInTheDocument()
    expect(t.getByText('No rows match the filter.')).toBeInTheDocument()
  })

  test('a table that isn’t stored, or is empty, says so', async () => {
    await reportOpen()
    openView('table-segments', null)
    expect(await screen.findByText('This table isn’t stored for this report.')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Segments table' })).toBeInTheDocument()
    openView('table-gone', null)
    expect(await screen.findByRole('region', { name: 'Table' })).toBeInTheDocument()
  })
})

describe('the panel itself', () => {
  test('the switch goes between the price chart and the view, and keeps the view as it was left', async () => {
    const { user } = await reportOpen()
    expect(screen.queryByRole('group', { name: 'Panel shows' })).toBeNull()
    openView('factors', null)
    const factors = await view('Score by factor')
    await factors.findByText('growth')
    await user.click(factors.getByRole('button', { name: 'Weight' }))

    const sw = () => within(document.querySelector('.vpane')!.querySelector('.pswitch') as HTMLElement)
    expect(sw().getByRole('button', { name: 'Score by factor' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(sw().getByRole('button', { name: 'Price chart' }))
    await waitFor(() => expect(document.querySelector('.cpane:not(.vpane)')).not.toHaveClass('away'))
    expect(panelRegion('Score by factor')).toBeNull()
    await screen.findByRole('img', { name: /daily price/ })

    const chartSwitch = within(document.querySelector('.cpane:not(.vpane) .pswitch') as HTMLElement)
    expect(chartSwitch.getByRole('button', { name: 'Price chart' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(chartSwitch.getByRole('button', { name: 'Score by factor' }))
    const again = await view('Score by factor')
    expect(again.getByRole('button', { name: 'Weight' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelector('.cpane:not(.vpane)')).toHaveClass('away')
  })

  test('the width buttons resize it, and Close the panel closes it', async () => {
    const { user } = await reportOpen()
    openView('flags', null)
    const flags = await view('Red flags')
    expect(flags.getByRole('button', { name: 'Half' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(flags.getByRole('button', { name: 'Narrow' }))
    expect(flags.getByRole('button', { name: 'Narrow' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(flags.getByRole('button', { name: 'Full' }))
    expect(flags.getByRole('button', { name: 'Full' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(flags.getByRole('button', { name: 'Close the panel' }))
    await waitFor(() => expect(panelRegion('Red flags')).toBeNull())
    expect(document.querySelector('.vpane')).toBeNull()
  })

  test('⌘3 closes the panel, and opening it again shows the price chart', async () => {
    await reportOpen()
    openView('economy', null)
    await view('Economy')
    menu('chart')
    await waitFor(() => expect(document.querySelector('.vpane')).toBeNull())
    menu('chart')
    expect(await screen.findByRole('img', { name: /daily price/ })).toBeInTheDocument()
    expect(document.querySelector('.vpane')).toBeNull()
    expect(document.querySelector('.cpane')).not.toHaveClass('away')
    // The switch still offers the last view.
    expect(within(document.querySelector('.pswitch') as HTMLElement).getByRole('button', { name: 'Economy' })).toBeInTheDocument()
  })

  test('another report opened starts afresh on the price chart', async () => {
    const { user } = await reportOpen()
    openView('flags', null)
    await view('Red flags')
    await openReportAgain(user)
    await waitFor(() => expect(document.querySelector('.vpane')).toBeNull())
    expect(screen.queryByRole('group', { name: 'Panel shows' })).toBeNull()
    await waitFor(() => expect(bridge.getReport).toHaveBeenCalledWith('r-msft-1', expect.anything()))
  })

  test('a link with no room beside the report opens the view over the whole page, with no width buttons', async () => {
    const { setWindowWidth } = await import('../test/screen')
    setWindowWidth(700)
    const { user } = await renderApp()
    sizeReportPage(700)
    await openReport(user)
    openView('flags', null)
    const flags = await view('Red flags')
    expect(flags.queryByRole('group', { name: 'Chart width' })).toBeNull()
    expect(flags.getByRole('button', { name: 'Close the panel' })).toBeInTheDocument()
  })

  test('a numbers download that finishes reloads the longer spans', async () => {
    const { user } = await reportOpen()
    openView('price', null)
    await screen.findByRole('img', { name: /daily price/ })
    await user.click(screen.getByRole('button', { name: '5Y' }))
    await waitFor(() => expect(bridge.fetchHistory).toHaveBeenCalled())
    openView('returns', null)
    await view('Total return')
    await waitFor(() => expect(bridge.getReportNumbers).toHaveBeenCalled())
  })
})

async function openReportAgain(user: Awaited<ReturnType<typeof renderApp>>['user']) {
  await openReport(user, 'MSFT')
}
