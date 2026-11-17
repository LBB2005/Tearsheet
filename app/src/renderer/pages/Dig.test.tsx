// Dig deeper (pages/Dig.tsx): the research step for one stock. It opens from the stock menu, a
// Watchlist company's panel and the report's toolbar, and shows the engine's newest snapshot.

import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { ADVICE_SHORT } from '../../shared/wording'
import { openReport, renderApp } from '../test/app'
import { bridge, fail, ok } from '../test/bridge'
import { digPage, digSnapshot } from '../test/dig'

const sidebar = () => within(screen.getByRole('complementary', { name: 'Sidebar' }))
const digRegion = () => screen.findByRole('region', { name: /^Dig deeper/ })

describe('opening it', () => {
  test('from a stock’s right-click menu', async () => {
    const { user } = await renderApp()
    const row = (await sidebar().findAllByRole('button', { name: /^MSFT/ }))[0]
    fireEvent.contextMenu(row, { clientX: 100, clientY: 100 })
    await user.click(within(screen.getByRole('menu', { name: 'MSFT options' })).getByRole('menuitem', { name: 'Dig deeper' }))
    expect(await digRegion()).toHaveAccessibleName('Dig deeper: MSFT')
    expect(bridge.getDigDeeper).toHaveBeenCalledWith(789019)
  })

  test('from a Watchlist company’s panel', async () => {
    const { user } = await renderApp()
    await user.click(sidebar().getByRole('button', { name: /Watchlist/ }))
    await screen.findByRole('navigation', { name: 'Watchlists' })
    await user.click(screen.getAllByRole('button', { name: /^AMD/ })[0])
    const panel = document.querySelector('.watchv .wdet') as HTMLElement
    await user.click(within(panel).getByRole('button', { name: 'Dig deeper' }))
    await digRegion()
    expect(bridge.getDigDeeper).toHaveBeenCalledWith(2488)
  })

  test('from the report’s toolbar', async () => {
    const { user } = await renderApp()
    await openReport(user, 'AAPL')
    await user.click(await screen.findByRole('button', { name: 'Dig deeper' }))
    await digRegion()
    expect(bridge.getDigDeeper).toHaveBeenCalledWith(320193)
  })

  test('on the page, its own menu greys Dig deeper', async () => {
    const { user } = await renderApp()
    await openReport(user, 'AAPL')
    await user.click(await screen.findByRole('button', { name: 'Dig deeper' }))
    const page = await digRegion()
    fireEvent.contextMenu(within(page).getByRole('heading', { level: 2 }))
    const item = within(screen.getByRole('menu', { name: 'AAPL options' })).getByRole('menuitem', { name: /Dig deeper/ })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    expect(item).toHaveTextContent('Open now')
    await waitFor(() => expect(bridge.getDigDeeper).toHaveBeenCalledTimes(1))
  })
})

// ---------- the page ----------

const now = () => new Date().toISOString()
const fresh = (changes: Parameters<typeof digSnapshot>[1] = {}) => digPage(320193, { snapshot: digSnapshot(320193, { created_at: now(), ...changes }) })

async function openDig(page = fresh()) {
  bridge.getDigDeeper.mockResolvedValueOnce(ok(page))
  const app = await renderApp()
  await openReport(app.user, 'AAPL')
  await app.user.click(await screen.findByRole('button', { name: 'Dig deeper' }))
  const region = await digRegion()
  return { ...app, region }
}
const headings = (region: HTMLElement) => within(region).getAllByRole('heading', { level: 3 }).map((h) => h.firstChild?.textContent)

describe('the page', () => {
  test('shows its parts in order, with the advice line', async () => {
    const { region } = await openDig()
    expect(await within(region).findByRole('heading', { level: 3, name: /^Today/ })).toBeInTheDocument()
    expect(headings(region)).toEqual(['Today', 'The report’s range', 'Sector', 'Market', 'Peers', 'Analysts', 'Insiders', 'News', 'Sources'])
    expect(within(region).getByText(ADVICE_SHORT)).toBeInTheDocument()
    expect(within(region).getByText('Prices to the close of Nov 16. Gathered Nov 17.', { exact: false })).toBeInTheDocument()
    expect(bridge.refreshDigDeeper).not.toHaveBeenCalled()
  })

  test('the top shows today’s close against the report, with the Watchlist’s rating-change wording', async () => {
    const { region } = await openDig()
    const today = within(region).getByRole('region', { name: 'Today' })
    expect(within(today).getByText('$236.50')).toBeInTheDocument()
    expect(within(today).getByText('+2.8%')).toBeInTheDocument()
    expect(within(today).getByText('Buy')).toBeInTheDocument()
    const range = within(region).getByRole('region', { name: 'The report’s range' })
    expect(within(range).getByRole('img', { name: /Close \$236\.50 against the report’s low \$190\.00, base \$250\.00 and high \$290\.00/ })).toBeInTheDocument()
    expect(within(range).getByText('Rating changes at')).toBeInTheDocument()
    expect(within(range).getByText('above $238.00 → Hold')).toBeInTheDocument()
  })

  test('a part carried from an earlier look says so, and one that’s off gives the reason', async () => {
    const snap = digSnapshot()
    const { region } = await openDig(
      fresh({
        rates: { ...snap.rates, state: 'stale', as_of: '2026-11-15T21:00:00+00:00', note: 'FRED didn’t answer.' },
        news: { ...snap.news, state: 'off', note: 'Massive’s plan doesn’t include news. Tearsheet checks again on 24 Nov.', items: [] }
      })
    )
    expect(within(region).getByText('From Nov 15: FRED didn’t answer this time.')).toBeInTheDocument()
    expect(within(region).getByText('Massive’s plan doesn’t include news. Tearsheet checks again on 24 Nov.')).toBeInTheDocument()
  })

  test('Refresh fetches today’s numbers and shows them', async () => {
    const { user, region } = await openDig()
    const later = digPage(320193, { snapshot: digSnapshot(320193, { created_at: now(), header: { ...digSnapshot().header, close: 240.25 } }), older: 1 })
    bridge.refreshDigDeeper.mockResolvedValueOnce(ok(later))
    await user.click(within(region).getByRole('button', { name: 'Refresh' }))
    expect(bridge.refreshDigDeeper).toHaveBeenCalledWith(320193)
    const today = within(region).getByRole('region', { name: 'Today' })
    expect(await within(today).findByText('$240.25')).toBeInTheDocument()
  })

  test('a refresh that fails says why and keeps what was there', async () => {
    const { user, region } = await openDig()
    bridge.refreshDigDeeper.mockResolvedValueOnce(fail('The engine is busy.'))
    await user.click(within(region).getByRole('button', { name: 'Refresh' }))
    expect(await within(region).findByText('Couldn’t get today’s numbers: The engine is busy.')).toBeInTheDocument()
    expect(within(within(region).getByRole('region', { name: 'Today' })).getByText('$236.50')).toBeInTheDocument()
  })

  test('with no snapshot yet, or an old one, it fetches today’s numbers at once', async () => {
    const { region } = await openDig(digPage(320193, { snapshot: null }))
    await waitFor(() => expect(bridge.refreshDigDeeper).toHaveBeenCalledWith(320193))
    expect(await within(region).findByRole('heading', { level: 3, name: /^Today/ })).toBeInTheDocument()
  })

  test('news titles open in the browser only for allowlisted sites', async () => {
    const { user, region } = await openDig()
    const news = within(region).getByRole('region', { name: 'News' })
    await user.click(within(news).getByRole('link', { name: 'Apple’s new chip gets an early look' }))
    expect(bridge.openExternal).toHaveBeenCalledWith('https://www.reuters.com/technology/apple-chip-example')
    expect(within(news).queryByRole('link', { name: 'A supplier warns on orders' })).toBeNull()
    expect(within(news).getByText('A supplier warns on orders')).toBeInTheDocument()
    expect(within(news).getByText('Since Nov 5: 1 positive, 1 negative, 1 with no tone')).toBeInTheDocument()
  })

  test('the peers table marks the company and ends with the peers’ median', async () => {
    const { region } = await openDig()
    const peers = within(region).getByRole('region', { name: 'Peers' })
    const rows = within(peers).getAllByRole('row').map((r) => r.querySelector('th, td')?.textContent)
    expect(rows).toEqual(['Company', 'AAPLApple Inc.', 'NVDANVIDIA Corp', 'MSFTMicrosoft Corp', 'Peers’ median'])
    expect(within(peers).getByText(/Scores recomputed from the report’s stored numbers\./)).toBeInTheDocument()
  })

  test('Open report opens the report it was dug from', async () => {
    const { user, region } = await openDig()
    await user.click(within(region).getByRole('button', { name: 'Open report' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: /^Dig deeper/ })).toBeNull())
    expect(await screen.findByRole('button', { name: 'Dig deeper' })).toBeInTheDocument()
  })

  test('a load that fails says why and tries again', async () => {
    bridge.getDigDeeper.mockResolvedValueOnce(fail('The engine stopped.'))
    const app = await renderApp()
    await openReport(app.user, 'AAPL')
    await app.user.click(await screen.findByRole('button', { name: 'Dig deeper' }))
    const region = await digRegion()
    expect(await within(region).findByText('Dig deeper didn’t load: The engine stopped.')).toBeInTheDocument()
    await app.user.click(within(region).getByRole('button', { name: 'Try again' }))
    expect(await within(region).findByRole('heading', { level: 3, name: /^Today/ })).toBeInTheDocument()
  })

  test('a company with nothing to dig from says what to do', async () => {
    const { region } = await openDig(digPage(320193, { snapshot: null, has_report: false }))
    expect(await within(region).findByText('No report on AAPL yet. Write one first, then dig deeper beside it.')).toBeInTheDocument()
    expect(bridge.refreshDigDeeper).not.toHaveBeenCalled()
  })
})

describe('a thin snapshot', () => {
  test('parts that are off or down give their reasons, and the top makes do without a range', async () => {
    const s = digSnapshot()
    const down = { state: 'down' as const, as_of: s.created_at }
    const { region } = await openDig(
      digPage(320193, {
        older: 2,
        snapshot: digSnapshot(320193, {
          created_at: now(),
          report_id: null,
          header: { ...s.header, close: null, close_date: null, since_report: null, levels: null },
          sector: { ...s.sector, ...down, note: 'No stored prices for this company yet.' },
          market: { ...s.market, ...down, note: 'No stored SPY prices yet.', spy_12m: null, volatility_percentile: null, scaling_note: null },
          rates: { ...s.rates, state: 'off', note: 'Add a FRED key in Settings to see rates.', rates: [] },
          peers: { ...s.peers, state: 'off', note: 'No report run to compare peers from.', rows: [] },
          analysts: { ...s.analysts, ...down, note: 'analystdb didn’t answer.', view: null, ours: null },
          insiders: { ...s.insiders, ...down, note: 'SEC didn’t answer.', rows: [], buys: null, sells: null, routine_free_buyers: [] },
          news: { ...s.news, ...down, note: 'Massive didn’t answer.', items: [] },
          sources: s.sources.map((x) => ({ ...x, state: x.part === 'rates' || x.part === 'peers' ? ('off' as const) : ('down' as const) }))
        })
      })
    )
    for (const reason of ['No stored prices for this company yet.', 'Add a FRED key in Settings to see rates.', 'No report run to compare peers from.', 'analystdb didn’t answer.', 'SEC didn’t answer.', 'Massive didn’t answer.'])
      expect(within(region).getByText(reason)).toBeInTheDocument()
    expect(within(region).getByText('The report has no range to place today’s close on.')).toBeInTheDocument()
    expect(within(region).getByText('Withheld')).toBeInTheDocument()
    expect(within(region).getByText(/2 earlier looks are saved\./)).toBeInTheDocument()
    expect(within(region).queryByRole('button', { name: 'Open report' })).toBeNull()
    expect(within(region).getAllByText('didn’t answer').length).toBe(5)
    expect(within(region).getAllByText('not used').length).toBe(2)
  })

  test('a refresh the engine never answers says so', async () => {
    const { user, region } = await openDig()
    bridge.refreshDigDeeper.mockRejectedValueOnce(new Error('The engine stopped.'))
    await user.click(within(region).getByRole('button', { name: 'Refresh' }))
    expect(await within(region).findByText('Couldn’t get today’s numbers: The engine stopped.')).toBeInTheDocument()
  })

  test('a load the engine never answers says so', async () => {
    bridge.getDigDeeper.mockRejectedValueOnce(new Error('No engine.'))
    const app = await renderApp()
    await openReport(app.user, 'AAPL')
    await app.user.click(await screen.findByRole('button', { name: 'Dig deeper' }))
    expect(await within(await digRegion()).findByText('Dig deeper didn’t load: No engine.')).toBeInTheDocument()
  })

  test('a prediction with its report hidden, a capped rating and one earlier look', async () => {
    const s = digSnapshot()
    const lv = { ...s.header.levels!, source: 'prediction' as const, report_id: null, buy_trigger: null, sell_trigger: null, buy_reachable: null, sell_reachable: null, report_price: null }
    const { region } = await openDig(digPage(320193, { older: 1, snapshot: digSnapshot(320193, { created_at: now(), header: { ...s.header, levels: lv, since_report: -0.05 } }) }))
    const today = within(region).getByRole('region', { name: 'Today' })
    expect(within(today).getByText('Since the prediction')).toBeInTheDocument()
    expect(within(today).getByText('−5.0%')).toHaveClass('down')
    expect(within(region).getByText('not by price alone')).toBeInTheDocument()
    expect(within(region).getByText(/1 earlier look is saved\./)).toBeInTheDocument()
  })
})
