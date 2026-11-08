// The Analyst ratings view in the panel beside the report, as Liam uses it: a part of the
// report's Analyst ratings panel opens it on the matching tab, the tabs and the side filter
// switch it, pointing at a row reads it out, and when analystdb is off it says so quietly and
// can try again. Its answers come from the fake bridge, built from saved real ones.

import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'

import { analysts } from '../test/analysts'
import { openReport, renderApp } from '../test/app'
import { bridge, fail, ok, openView } from '../test/bridge'
import { fullNumbers } from '../test/reportNumbers'
import { sizeReportPage } from '../test/screen'

beforeEach(() => {
  bridge.getReportNumbers.mockImplementation(async (id: string) => ok(fullNumbers(id)))
  bridge.getAnalysts.mockImplementation(async (id: string) => ok(analysts(id)))
})

async function reportOpen() {
  const app = await renderApp()
  sizeReportPage()
  await openReport(app.user)
  return app
}

const pane = async () => within(await screen.findByRole('region', { name: 'Analyst ratings' }))
const vread = () => document.querySelector('.vpane .vread')?.textContent ?? ''
const bodyRows = (p: ReturnType<typeof within>) => p.getAllByRole('row').slice(1)

describe('opening the view from the report', () => {
  test('a Buy, Hold or Sell link opens the firms on that side', async () => {
    await reportOpen()
    openView('analysts', 'hold')
    const view = await pane()
    await view.findByText('Morgan Stanley')
    expect(bridge.getAnalysts).toHaveBeenCalledWith('r-aapl-2')
    expect(bodyRows(view)).toHaveLength(6)
    expect(view.getByRole('button', { name: 'Hold 6' })).toHaveAttribute('aria-pressed', 'true')
    expect(view.getByRole('tab', { name: 'Firms 38' })).toHaveAttribute('aria-selected', 'true')
  })

  test('opening another side while it is open switches to it', async () => {
    await reportOpen()
    openView('analysts', 'buy')
    const view = await pane()
    await view.findByText('UBS')
    openView('analysts', 'sell')
    await waitFor(() => expect(view.getByRole('button', { name: 'Sell 0' })).toHaveAttribute('aria-pressed', 'true'))
    expect(view.getByText('No firm rates it Sell.')).toBeInTheDocument()
  })

  test('the tab and side come back when it opens again', async () => {
    const { user } = await reportOpen()
    openView('analysts', 'hold')
    let view = await pane()
    await view.findByText('Morgan Stanley')
    await user.click(view.getByRole('tab', { name: 'Recent changes 20' }))
    openView('economy', null)
    await screen.findByRole('region', { name: 'Economy' })
    openView('analysts', null)
    view = await pane()
    await waitFor(() => expect(view.getByRole('tab', { name: 'Recent changes 20' })).toHaveAttribute('aria-selected', 'true'))
  })
})

describe('the firms', () => {
  test('each firm shows its rating, target, date and track record', async () => {
    await reportOpen()
    openView('analysts', 'firms')
    const view = await pane()
    const ubs = (await view.findByText('UBS')).closest('tr') as HTMLElement
    expect(within(ubs).getAllByRole('cell').map((c) => c.textContent)).toEqual(['UBS', 'Buy', '$700', '4 Nov 2026', '#38 of 77', '−0.5%'])
    const stonex = view.getByText('StoneX').closest('tr') as HTMLElement
    expect(within(stonex).getByText('not ranked')).toBeInTheDocument()
    expect(within(stonex).getByText('not enough data')).toBeInTheDocument()
    expect(bodyRows(view)).toHaveLength(38)
  })

  test('the side filter shows one side or all of them', async () => {
    const { user } = await reportOpen()
    openView('analysts', 'firms')
    const view = await pane()
    await view.findByText('UBS')
    await user.click(view.getByRole('button', { name: 'Hold 6' }))
    expect(bodyRows(view)).toHaveLength(6)
    await user.click(view.getByRole('button', { name: 'All 38' }))
    expect(bodyRows(view)).toHaveLength(38)
  })

  test('pointing at a firm reads it out', async () => {
    await reportOpen()
    openView('analysts', 'firms')
    const view = await pane()
    const row = (await view.findByText('UBS')).closest('tr') as HTMLElement
    fireEvent.pointerEnter(row)
    expect(vread()).toBe(
      'UBS rates it Buy with a $700.00 target (4 Nov 2026). Track record: #38 of 77 ranked firms; its rating calls averaged −0.5% against the S&P 500.'
    )
    fireEvent.pointerLeave(row.closest('tbody') as HTMLElement)
    expect(vread()).toBe('')
    fireEvent.focus(row)
    expect(vread()).toContain('UBS rates it Buy')
    fireEvent.blur(row)
    expect(vread()).toBe('')
  })

  test('track records that didn’t load say so', async () => {
    const firms = analysts().firms!.map((f) => ({ ...f, rank: null, rank_text: '—', avg_excess: null, excess_text: '—' }))
    bridge.getAnalysts.mockResolvedValue(ok(analysts('r-aapl-2', { firms, ranked_of: null, tracks_asof_text: null, firms_note: 'Track records didn’t load: analystdb isn’t answering.' })))
    await reportOpen()
    openView('analysts', 'firms')
    const view = await pane()
    expect(await view.findByText('Track records didn’t load: analystdb isn’t answering.')).toBeInTheDocument()
    expect(view.getByText('UBS')).toBeInTheDocument()
  })
})

describe('the recent changes', () => {
  test('list the 20 latest, each with what changed', async () => {
    const { user } = await reportOpen()
    openView('analysts', 'firms')
    const view = await pane()
    await view.findByText('UBS')
    await user.click(view.getByRole('tab', { name: 'Recent changes 20' }))
    expect(bodyRows(view)).toHaveLength(20)
    expect(within(bodyRows(view)[0]).getAllByRole('cell').map((c) => c.textContent)).toEqual(['4 Nov 2026', 'UBS', 'Maintained', 'Buy', '$730 → $700'])
    fireEvent.pointerEnter(bodyRows(view)[0])
    expect(vread()).toBe('UBS maintained Buy and cut its target from $730.00 to $700.00 on 4 Nov 2026.')
  })

  test('that didn’t load say so', async () => {
    bridge.getAnalysts.mockResolvedValue(ok(analysts('r-aapl-2', { changes: null, changes_note: 'Recent changes didn’t load: analystdb isn’t answering.' })))
    await reportOpen()
    openView('analysts', 'changes')
    const view = await pane()
    expect(await view.findByText('Recent changes didn’t load: analystdb isn’t answering.')).toBeInTheDocument()
    expect(view.getByRole('tab', { name: 'Recent changes' })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('the trust check', () => {
  test('compares our targets with S&P Global’s', async () => {
    await reportOpen()
    openView('analysts', 'check')
    const view = await pane()
    const hero = await view.findByRole('group', { name: 'Average target against S&P Global' })
    expect(within(hero).getByText('$587.92')).toBeInTheDocument()
    expect(within(hero).getByText('$650.01')).toBeInTheDocument()
    expect(within(hero).getByText('−9.6%')).toBeInTheDocument()
    expect(within(hero).getByText('outside the 3% tolerance')).toBeInTheDocument()
    expect(bodyRows(view)).toHaveLength(8)
    expect(view.getByText('S&P Global, fetched 6 Nov 2026', { exact: false })).toBeInTheDocument()
    fireEvent.pointerEnter(bodyRows(view)[0])
    expect(vread()).toBe('Average target: analystdb $587.92, S&P Global $650.01, 9.6% lower; outside the 3% tolerance.')
  })

  test('without S&P Global’s figures says so', async () => {
    bridge.getAnalysts.mockResolvedValue(ok(analysts('r-aapl-2', { check: null, check_note: 'S&P Global has no figures for AMD as of 6 Nov 2026.' })))
    await reportOpen()
    openView('analysts', 'check')
    const view = await pane()
    expect(await view.findByText('S&P Global has no figures for AMD as of 6 Nov 2026.')).toBeInTheDocument()
  })
})

describe('what it always says', () => {
  test('its source, its date and that it is research data, not investment advice', async () => {
    await reportOpen()
    openView('analysts', 'firms')
    const view = await pane()
    await view.findByText('UBS')
    expect(view.getByText('AMD · analystdb, as of 6 Nov 2026')).toBeInTheDocument()
    expect(view.getByText(/Research data, not investment advice\./)).toBeInTheDocument()
    expect(view.getByText(/Track records as of 7 Nov 2026/)).toBeInTheDocument()
  })

  test('a source that missed analystdb’s evening run, and a day rebuilt from history', async () => {
    bridge.getAnalysts.mockResolvedValue(ok(analysts('r-aapl-2', { stale: ['yahoo', 'fmp'], rebuilt: true })))
    await reportOpen()
    openView('analysts', 'firms')
    const view = await pane()
    expect(await view.findByText('Some of this may be out of date: yahoo and fmp missed analystdb’s last evening run.')).toBeInTheDocument()
    expect(view.getByText(/rebuilt from history/)).toBeInTheDocument()
  })
})

describe('when analystdb can’t answer', () => {
  test('the view says so quietly and can try again', async () => {
    bridge.getAnalysts.mockResolvedValueOnce(ok(analysts('r-aapl-2', { ...quiet('down'), note: 'Analyst ratings: analystdb isn’t answering.' })))
    const { user } = await reportOpen()
    openView('analysts', 'buy')
    const view = await pane()
    expect(await view.findByText('Analyst ratings: analystdb isn’t answering.')).toBeInTheDocument()
    expect(view.queryByRole('tab')).toBeNull()
    await user.click(view.getByRole('button', { name: 'Try again' }))
    expect(await view.findByText('UBS')).toBeInTheDocument()
    expect(bridge.getAnalysts).toHaveBeenCalledTimes(2)
  })

  test('a company analystdb has nothing for says so', async () => {
    bridge.getAnalysts.mockResolvedValue(ok(analysts('r-aapl-2', { ...quiet('missing'), note: 'Analyst ratings: analystdb has none for AMD as of 6 Nov 2026.' })))
    await reportOpen()
    openView('analysts', 'firms')
    const view = await pane()
    expect(await view.findByText('Analyst ratings: analystdb has none for AMD as of 6 Nov 2026.')).toBeInTheDocument()
  })

  test('an engine that doesn’t answer gives the usual message', async () => {
    bridge.getAnalysts.mockResolvedValueOnce(fail('The engine stopped.'))
    const { user } = await reportOpen()
    openView('analysts', 'firms')
    const view = await pane()
    const alert = await view.findByRole('alert')
    expect(alert).toHaveTextContent('This view didn’t load. The engine stopped.')
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await view.findByText('UBS')).toBeInTheDocument()
  })

  test('a call that throws gives the usual message too', async () => {
    bridge.getAnalysts.mockRejectedValueOnce(new Error('IPC closed'))
    await reportOpen()
    openView('analysts', 'firms')
    const view = await pane()
    expect(await view.findByRole('alert')).toHaveTextContent('This view didn’t load. IPC closed')
  })
})

function quiet(state: 'down' | 'missing') {
  return { state, sides: null, target: null, n_firms: null, firms: null, changes: null, check: null, ranked_of: null, tracks_asof_text: null } as const
}
