// The prediction log as Liam uses it (docs/superpowers/specs/2026-11-08-prediction-log-page-design.md):
// the good-pick consensus picks the cards and opens the chart on them, the filters narrow the
// table with counts, "see all" is always one click away, ticking adds a line, Since prediction
// says plainly when nothing has moved yet, Export saves the shown rows, and a row opens its report.

import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'

import type { PredictionSummary } from '../../shared/protocol'
import { renderApp } from '../test/app'
import { bridge, ok } from '../test/bridge'
import { dragAreas, describe as named } from '../test/dragMap'

const p = (ticker: string, cik: number, over: Partial<PredictionSummary> = {}): PredictionSummary => ({
  prediction_id: `p-${ticker}`,
  cik,
  ticker,
  run_at: '2026-11-08T03:00:00+00:00',
  rating: 'Hold',
  bear: 50,
  base: 110,
  bull: 200,
  grades: [],
  name: `${ticker} Co`,
  sector: 'Energy',
  share_class: '',
  score: 30,
  probability: 0.4,
  uncertainty: 'high',
  report_id: `rep-${ticker}`,
  price: 100,
  price_date: '2026-11-06',
  ...over
})

// Two good picks (4 of 4 and 3 of 4) and two that aren't.
const LOG = [
  p('MU', 1, { rating: 'Buy', base: 190, score: 96, probability: 0.75, sector: 'Information Technology', uncertainty: 'extreme' }),
  p('CMCSA', 2, { base: 157, score: 45, probability: 0.75, sector: 'Communication Services' }),
  p('F', 3, { base: 178, score: 18, probability: 0.75 }),
  p('BLK', 4, { rating: 'Sell', base: 92, score: 6, probability: 0.36, sector: 'Financials', uncertainty: 'medium' })
]

beforeEach(() => {
  localStorage.clear()
  bridge.listPredictions.mockResolvedValue(ok(LOG))
})

async function openLog() {
  const app = await renderApp()
  await app.user.click(within(screen.getByRole('complementary', { name: 'Sidebar' })).getByRole('button', { name: /Prediction log/ }))
  await screen.findByRole('cell', { name: 'MU' })
  return app
}

const tickers = () => within(screen.getByRole('region', { name: 'Predictions' })).getAllByRole('row').slice(1).map((r) => r.querySelector('.tk')?.textContent)
const cards = () => within(screen.getByRole('region', { name: 'Good picks' })).queryAllByRole('button').map((b) => b.querySelector('.tk')?.textContent)
const legend = () => [...document.querySelectorAll('.legend li b')].map((b) => b.textContent)

describe('the page and the window', () => {
  // A card's parts once borrowed the toolbar's class name, .top, and with it the toolbar's height,
  // line and window dragging: a real click on a card's ticker moved the window.
  test('nothing on the page drags the window, cards included', async () => {
    await openLog()
    expect(cards().length).toBeGreaterThan(0)
    const page = document.querySelector('.pagebody') as Element
    expect(dragAreas(page).map(named)).toEqual([])
  })
})

describe('the good-pick consensus', () => {
  test('shows every prediction, the good picks as cards, and charts them first', async () => {
    await openLog()
    expect(tickers()).toEqual(['MU', 'CMCSA', 'F', 'BLK'])
    expect(cards()).toEqual(['MU', 'CMCSA'])
    await waitFor(() => expect(legend()).toEqual(['S&P 500', 'MU', 'CMCSA']))
    expect(bridge.predictionPrices).toHaveBeenCalledWith([1, 2], expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
  })

  test('asking for fewer checks adds F, and the rule is remembered', async () => {
    const { user } = await openLog()
    await user.click(screen.getByRole('button', { name: '2 of 4' }))
    expect(cards()).toEqual(['MU', 'CMCSA', 'F'])
    expect(JSON.parse(localStorage.getItem('log.goodRule') as string).need).toBe(2)
  })

  test('“Show all as cards” lists every shown prediction as a card', async () => {
    const { user } = await openLog()
    await user.click(screen.getByRole('checkbox', { name: 'Show all as cards' }))
    expect(cards()).toEqual(['MU', 'CMCSA', 'F', 'BLK'])
  })
})

describe('filters', () => {
  test('narrow the table with counts, and see all is one click away', async () => {
    const { user } = await openLog()
    const filters = within(screen.getByRole('complementary', { name: 'Filters' }))
    expect(filters.getByRole('checkbox', { name: /Energy/ }).closest('label')).toHaveTextContent('Energy1')
    await user.click(filters.getByRole('checkbox', { name: /Energy/ }))
    expect(tickers()).toEqual(['F'])
    await user.click(filters.getByRole('radio', { name: /Good picks only/ }))
    expect(screen.getByText('No predictions match')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'see all 4' }))
    expect(tickers()).toEqual(['MU', 'CMCSA', 'F', 'BLK'])
    expect(filters.getByRole('radio', { name: /All predictions/ })).toBeChecked()
  })

  test('sort by peer score', async () => {
    const { user } = await openLog()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'score')
    expect(tickers()).toEqual(['MU', 'CMCSA', 'F', 'BLK'])
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'ticker')
    expect(tickers()).toEqual(['BLK', 'CMCSA', 'F', 'MU'])
  })
})

describe('the compare chart', () => {
  test('a tick adds a line and × takes it off', async () => {
    const { user } = await openLog()
    await waitFor(() => expect(legend()).toEqual(['S&P 500', 'MU', 'CMCSA']))
    await user.click(screen.getByRole('checkbox', { name: 'Compare BLK' }))
    await waitFor(() => expect(legend()).toEqual(['S&P 500', 'MU', 'CMCSA', 'BLK']))
    await user.click(screen.getByRole('button', { name: 'Remove MU from the chart' }))
    await waitFor(() => expect(legend()).toEqual(['S&P 500', 'CMCSA', 'BLK']))
    expect(screen.getByRole('checkbox', { name: 'Compare MU' })).not.toBeChecked()
  })

  test('since prediction says so when nothing has moved yet', async () => {
    const { user } = await openLog()
    await user.click(screen.getByRole('button', { name: 'Since prediction' }))
    expect(await screen.findByText(/No prices since the predictions yet/)).toBeInTheDocument()
  })
})

describe('export and reports', () => {
  test('Export saves the shown rows to Downloads and offers Show in Finder', async () => {
    const { user } = await openLog()
    await user.click(within(screen.getByRole('complementary', { name: 'Filters' })).getByRole('checkbox', { name: /Financials/ }))
    await user.click(screen.getByRole('button', { name: 'Export 1 row (CSV)' }))
    const [name, text] = bridge.saveCsv.mock.calls[0]
    expect(name).toMatch(/^Tearsheet predictions \d+ \w{3} \d{4}\.csv$/)
    expect((text as string).trim().split('\n')).toHaveLength(2)
    expect(text).toContain('BLK')
    expect(await screen.findByText(`Saved ${name} to Downloads.`)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show in Finder' }))
    expect(bridge.showDownload).toHaveBeenCalledWith(`/Users/liam/Downloads/${name}`)
  })

  test('a row’s arrow opens its report', async () => {
    const { user } = await openLog()
    await user.click(screen.getByRole('button', { name: 'Open the CMCSA report' }))
    await waitFor(() => expect(bridge.getReport).toHaveBeenCalledWith('rep-CMCSA', expect.anything()))
  })
})

describe('the 10 Nov polish', () => {
  test('the table says when each next grade is due, on one short row', async () => {
    await openLog()
    const table = screen.getByRole('table', { name: 'Logged predictions' })
    expect(within(table).getByRole('columnheader', { name: 'Next grade' })).toBeInTheDocument()
    const mu = within(table).getAllByRole('row').find((r) => r.querySelector('.tk')?.textContent === 'MU')!
    expect(mu).toHaveTextContent(/Feb 8/)
    expect(mu).toHaveTextContent(/Made Nov 8/)
    expect(within(mu).getByTitle('The 3-month grade')).toHaveTextContent('Feb 8')
  })

  test('the first 8 good picks show, and Show all brings the rest', async () => {
    const many = Array.from({ length: 11 }, (_, i) => p(`T${i}`, 100 + i, { rating: 'Buy', base: 190, score: 90, probability: 0.8 }))
    bridge.listPredictions.mockResolvedValue(ok(many))
    const app = await renderApp()
    await app.user.click(within(screen.getByRole('complementary', { name: 'Sidebar' })).getByRole('button', { name: /Prediction log/ }))
    await screen.findByRole('cell', { name: 'T0' })
    const region = within(screen.getByRole('region', { name: 'Good picks' }))
    expect(region.getAllByRole('button').filter((b) => b.classList.contains('pcard'))).toHaveLength(8)
    await app.user.click(region.getByRole('button', { name: 'Show all 11' }))
    expect(region.getAllByRole('button').filter((b) => b.classList.contains('pcard'))).toHaveLength(11)
  })

  test('a log that didn’t load can be tried again', async () => {
    bridge.listPredictions.mockResolvedValue({ ok: false, error: { code: 'ENGINE', message: 'No answer.' } } as never)
    const app = await renderApp()
    await app.user.click(within(screen.getByRole('complementary', { name: 'Sidebar' })).getByRole('button', { name: /Prediction log/ }))
    const again = await screen.findByRole('button', { name: 'Try again' })
    bridge.listPredictions.mockResolvedValue(ok(LOG))
    await app.user.click(again)
    expect(await screen.findByRole('cell', { name: 'MU' })).toBeInTheDocument()
  })
})
