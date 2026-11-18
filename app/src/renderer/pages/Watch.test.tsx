// The Watchlist as Liam uses it (pick E, 12 Nov 2026): the sidebar row and ⌘J open it; the tabs
// switch lists; the strip says what needs a look; a company opens on the right with its chart,
// numbers, alerts and note; lists are made, renamed, deleted and brought back; companies are
// added, taken out and put back; 2 to 6 ticked compare on one chart; a Mac notification's click
// opens its company.

import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { renderApp } from '../test/app'
import { bridge, emit, menu, openWatch } from '../test/bridge'
import { dragAreas, describe as named } from '../test/dragMap'

const sidebar = () => within(screen.getByRole('complementary', { name: 'Sidebar' }))
const tabs = () => within(screen.getByRole('navigation', { name: 'Watchlists' }))
const listRows = () => [...document.querySelectorAll('.watchv .wrow > button b')].map((b) => b.childNodes[0]?.textContent)
const detail = () => document.querySelector('.watchv .wdet') as HTMLElement

async function openWatch_() {
  const app = await renderApp()
  await app.user.click(sidebar().getByRole('button', { name: /Watchlist/ }))
  await screen.findByRole('navigation', { name: 'Watchlists' })
  return app
}

describe('opening it', () => {
  test('from the sidebar, with the count of companies with new alerts, and from ⌘J', async () => {
    const app = await renderApp()
    await waitFor(() => expect(sidebar().getByRole('button', { name: /Watchlist/ })).toHaveTextContent('1'))
    menu('watch')
    await screen.findByRole('navigation', { name: 'Watchlists' })
    expect(screen.getByRole('heading', { name: 'All watched' })).toBeInTheDocument()
    void app
  })

  test('nothing on the page drags the window', async () => {
    await openWatch_()
    expect(dragAreas(document.querySelector('.pagebody') as Element).map(named)).toEqual([])
  })

  test('All watched groups the companies by list, and the strip says what needs a look', async () => {
    await openWatch_()
    expect(listRows()).toEqual(['AMD', 'MU', 'MU', 'LULU'])
    const strip = within(screen.getByRole('region', { name: 'Needs a look' }))
    expect(strip.getByText(/2 need a look/)).toBeInTheDocument()
    expect(strip.getAllByRole('button').map((b) => b.textContent)).toEqual(['AMD Up 23.1% since the Nov 7 report.', 'MU Up 17.6% since the Nov 8 report.'])
  })
})

describe('a company', () => {
  test('opens on the right with its numbers, its lists and the rating-change price; its alerts are marked seen', async () => {
    const { user } = await openWatch_()
    await user.click(screen.getAllByRole('button', { name: /^AMD/ })[0])
    await waitFor(() => expect(detail()).toHaveTextContent('Advanced Micro Devices'))
    expect(detail()).toHaveTextContent('below $297.54 → Sell')
    expect(detail()).toHaveTextContent('InCore×')
    await waitFor(() => expect(bridge.markWatchSeen).toHaveBeenCalledWith([2488]))
    expect(await within(detail()).findByText(/more than 10% above/)).toBeInTheDocument()
  })

  test('a note is saved as it is typed', async () => {
    const { user } = await openWatch_()
    await user.click(screen.getAllByRole('button', { name: /^MU/ })[0])
    await user.type(screen.getByRole('textbox', { name: 'Note on MU' }), 'Wait for the refresh')
    await waitFor(() => expect(bridge.setWatchNote).toHaveBeenLastCalledWith(723125, 'Wait for the refresh'), { timeout: 2000 })
  })

  test('an alert switched off is sent for that company', async () => {
    const { user } = await openWatch_()
    await user.click(screen.getAllByRole('button', { name: /^MU/ })[0])
    await user.click(await screen.findByRole('checkbox', { name: /moves 10% from the report/ }))
    expect(bridge.setWatchAlerts).toHaveBeenCalledWith([723125], { move: 0 })
  })

  test('with no report: says so and offers to queue one', async () => {
    const { user } = await openWatch_()
    await user.click(tabs().getByRole('button', { name: /No report yet/ }))
    expect(listRows()).toEqual(['LULU'])
    expect(detail()).toHaveTextContent('LULU has no report yet.')
    expect(detail()).toHaveTextContent('It’s in the report line.')
  })
})

describe('lists', () => {
  test('make one, add a ticker to it, rename it, and the tab follows', async () => {
    const { user } = await openWatch_()
    await user.click(tabs().getByRole('button', { name: '+ New list' }))
    await user.type(screen.getByRole('textbox', { name: 'New list name' }), 'Bets{Enter}')
    await screen.findByRole('heading', { name: 'Bets' })
    await user.type(screen.getByRole('textbox', { name: 'Add a ticker' }), 'tsla{Enter}')
    await waitFor(() => expect(listRows()).toEqual(['TSLA']))
    expect(bridge.addToWatchlist).toHaveBeenCalledWith(3, ['tsla'])
    await user.click(screen.getByRole('button', { name: 'Rename' }))
    const field = screen.getByRole('textbox', { name: 'List name' })
    await user.clear(field)
    await user.type(field, 'Big bets{Enter}')
    await screen.findByRole('heading', { name: 'Big bets' })
    expect(tabs().getByRole('button', { name: /Big bets/ })).toHaveAttribute('aria-current', 'page')
  })

  test('a ticker that isn’t covered is refused in plain words', async () => {
    const { user } = await openWatch_()
    await user.type(screen.getByRole('textbox', { name: 'Add a ticker' }), 'ZZZZ{Enter}')
    expect(await screen.findByText(/isn’t an S&P 500 company Tearsheet covers/)).toBeInTheDocument()
  })

  test('delete a list, then Undo brings it back', async () => {
    const { user } = await openWatch_()
    await user.click(tabs().getByRole('button', { name: /Chips/ }))
    await user.click(screen.getByRole('button', { name: 'Delete list' }))
    expect(await screen.findByText('Deleted “Chips”')).toBeInTheDocument()
    expect(tabs().queryByRole('button', { name: /Chips/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(tabs().getByRole('button', { name: /Chips/ })).toHaveAttribute('aria-current', 'page'))
    expect(bridge.restoreWatchlist).toHaveBeenCalledWith(2)
  })

  test('deleting an empty list says it was empty, not that its companies are elsewhere', async () => {
    const { user } = await openWatch_()
    await user.click(tabs().getByRole('button', { name: '+ New list' }))
    await user.type(screen.getByRole('textbox', { name: 'New list name' }), 'Empty{Enter}')
    await screen.findByRole('heading', { name: 'Empty' })
    await user.click(screen.getByRole('button', { name: 'Delete list' }))
    expect(await screen.findByText('Deleted “Empty”')).toBeInTheDocument()
    expect(screen.getByText('It was empty.')).toBeInTheDocument()
    expect(screen.queryByText('Its companies are still in your other lists.')).toBeNull()
  })

  test('take a company out of a list from its chip, then Undo puts it back where it was', async () => {
    const { user } = await openWatch_()
    await user.click(tabs().getByRole('button', { name: /Core/ }))
    await user.click(screen.getAllByRole('button', { name: /^MU/ })[0])
    await user.click(screen.getByRole('button', { name: 'Take MU out of Core' }))
    await waitFor(() => expect(listRows()).toEqual(['AMD']))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(listRows()).toEqual(['AMD', 'MU']))
    expect(bridge.restoreWatchItems).toHaveBeenCalledWith(1, [expect.objectContaining({ cik: 723125, position: 1 })])
  })

  test('Add to a list puts a company in another list too', async () => {
    const { user } = await openWatch_()
    await user.click(screen.getAllByRole('button', { name: /^AMD/ })[0])
    await user.click(within(detail()).getByRole('button', { name: '+ Add to a list' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Lists for AMD' })).getByRole('checkbox', { name: /Chips/ }))
    expect(bridge.addToWatchlist).toHaveBeenCalledWith(2, ['AMD'])
    await waitFor(() => expect(detail()).toHaveTextContent('InCore×Chips×'))
  })
})

describe('queue, compare and alerts', () => {
  test('Queue reports is off when everything is recent or already in the line', async () => {
    const { user } = await openWatch_()
    await user.click(tabs().getByRole('button', { name: /Chips/ }))
    // LULU is in the line already and MU's report is from this week.
    expect(screen.getByRole('button', { name: /^Queue( \d+)? reports?$/ })).toBeDisabled()
  })

  test('Queue reports asks the line first, then adds on Yes', async () => {
    const page = (await bridge.getWatchlist()).result!
    bridge.getWatchlist.mockResolvedValue({ ok: true, result: { ...page, rows: page.rows.map((r) => (r.ticker === 'AMD' ? { ...r, slot_open: true } : r)) } })
    const line = (await bridge.getLine()).result!
    bridge.planLine.mockResolvedValue({ ok: true, result: { items: [{ ticker: 'AMD', name: 'Advanced Micro Devices', official: true }], skipped: [], line } })
    const { user } = await openWatch_()
    await user.click(screen.getByRole('button', { name: 'Queue 1 report' }))
    expect(await screen.findByText('1 report, 1 as official prediction.')).toBeInTheDocument()
    expect(bridge.planLine).toHaveBeenCalledWith(['AMD'], { skipRecent: true })
    expect(bridge.addToLine).not.toHaveBeenCalled()
    await user.click(await screen.findByRole('button', { name: 'Add to the line' }))
    expect(bridge.addToLine).toHaveBeenCalledWith(['AMD'])
  })

  test('two ticked compare on one chart; Back returns to the company', async () => {
    const { user } = await openWatch_()
    await user.click(screen.getByRole('checkbox', { name: 'Compare AMD' }))
    expect(screen.getByText(/tick one more to compare/)).toBeInTheDocument()
    await user.click(screen.getAllByRole('checkbox', { name: 'Compare MU' })[0])
    await screen.findByRole('heading', { name: 'Comparing 2' })
    expect(bridge.predictionPrices).toHaveBeenCalledWith([2488, 723125], expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
    await user.click(await screen.findByRole('button', { name: 'Remove MU from the chart' }))
    expect(screen.queryByRole('heading', { name: 'Comparing 2' })).toBeNull()
    await user.click(screen.getAllByRole('checkbox', { name: 'Compare MU' })[0])
    await screen.findByRole('heading', { name: 'Comparing 2' })
    await user.click(screen.getByRole('button', { name: 'Back to one company' }))
    expect(screen.queryByRole('heading', { name: 'Comparing 2' })).toBeNull()
  })

  test('a watch_changed note updates the sidebar count and the page', async () => {
    await openWatch_()
    const calls = bridge.getWatchlist.mock.calls.length
    emit('watch_changed', { events: [], counts: { watched: 4, needs_look: 3, no_report: 1 }, notify: false })
    await waitFor(() => expect(sidebar().getByRole('button', { name: /Watchlist/ })).toHaveTextContent('3'))
    await waitFor(() => expect(bridge.getWatchlist.mock.calls.length).toBeGreaterThan(calls))
  })

  test('a Mac notification’s click opens the Watchlist on that company', async () => {
    await renderApp()
    openWatch(723125)
    await screen.findByRole('navigation', { name: 'Watchlists' })
    await waitFor(() => expect(detail()).toHaveTextContent('Micron Technology'))
  })

  test('Export CSV saves the list shown', async () => {
    const { user } = await openWatch_()
    await user.click(screen.getByRole('button', { name: 'Export CSV' }))
    expect(bridge.saveCsv).toHaveBeenCalledWith(expect.stringMatching(/^Tearsheet All watched .+\.csv$/), expect.stringContaining('AMD,Advanced Micro Devices,Core'))
  })
})

describe('the sidebar', () => {
  test('a company’s menu adds it to the watchlist', async () => {
    const { user } = await renderApp()
    const row = [...screen.getByRole('complementary', { name: 'Sidebar' }).querySelectorAll('.ri4')][0] as HTMLElement
    await user.pointer({ keys: '[MouseRight]', target: row.querySelector('.row4') as Element })
    // Two lists: a tick for each.
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Core' }))
    await waitFor(() => expect(bridge.addToWatchlist).toHaveBeenCalledWith(1, [expect.any(String)]))
  })
})

describe('the rest of the page', () => {
  test('a load that fails says why, and Try again loads it', async () => {
    bridge.getWatchlist.mockResolvedValueOnce({ ok: false, error: { message: 'database is locked' } })
    const { user } = await renderApp()
    await user.click(sidebar().getByRole('button', { name: /Watchlist/ }))
    expect(await screen.findByText(/The watchlist didn’t load: database is locked/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('navigation', { name: 'Watchlists' })
  })

  test('with nothing watched, it says how to start', async () => {
    bridge.getWatchlist.mockResolvedValue({ ok: true, result: { lists: [], rows: [], counts: { watched: 0, needs_look: 0, no_report: 0 }, as_of: null, prices_note: 'Prices are from Nov 6: add a Massive key in Settings to keep them current.' } })
    await openWatch_()
    expect(screen.getByText('Start a watchlist')).toBeInTheDocument()
    expect(screen.getByText(/Prices are from Nov 6/)).toBeInTheDocument()
  })

  test('Stop watching takes a company out of every list, and Undo puts it back', async () => {
    const { user } = await openWatch_()
    await user.click(screen.getAllByRole('button', { name: /^MU/ })[0])
    await user.click(within(detail()).getByRole('button', { name: '+ Add to a list' }))
    await user.click(screen.getByRole('button', { name: 'Stop watching MU' }))
    await waitFor(() => expect(listRows()).toEqual(['AMD', 'LULU']))
    expect(bridge.removeFromWatchlist).toHaveBeenCalledWith(1, [723125])
    expect(bridge.removeFromWatchlist).toHaveBeenCalledWith(2, [723125])
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(listRows()).toEqual(['AMD', 'MU', 'MU', 'LULU']))
  })

  test('New list with a company makes the list with it in', async () => {
    const { user } = await openWatch_()
    await user.click(screen.getAllByRole('button', { name: /^AMD/ })[0])
    await user.click(within(detail()).getByRole('button', { name: '+ Add to a list' }))
    await user.click(screen.getByRole('button', { name: 'New list with AMD' }))
    await user.type(screen.getByRole('textbox', { name: 'New list name' }), 'Turnarounds{Enter}')
    await waitFor(() => expect(tabs().getByRole('button', { name: /Turnarounds/ })).toBeInTheDocument())
    expect(bridge.addToWatchlist).toHaveBeenCalledWith(3, ['AMD'])
  })

  test('a group folds, and the arrow keys move through the list', async () => {
    const { user } = await openWatch_()
    await user.click(screen.getByRole('button', { name: /▾ Chips/ }))
    expect(listRows()).toEqual(['AMD', 'MU'])
    await user.click(document.querySelector('.wlist [data-cik="2488"]') as HTMLElement)
    await user.keyboard('{ArrowDown}')
    await waitFor(() => expect(detail()).toHaveTextContent('Micron Technology'))
    await user.keyboard('{ArrowUp}')
    await waitFor(() => expect(detail()).toHaveTextContent('Advanced Micro Devices'))
  })

  test('the chart reads a close under the pointer, and its span changes', async () => {
    const { user } = await openWatch_()
    await user.click(screen.getAllByRole('button', { name: /^MU/ })[0])
    const svg = (await waitFor(() => detail().querySelector('.wchart svg'))) as SVGSVGElement
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 760, height: 260, right: 760, bottom: 260, x: 0, y: 0, toJSON: () => ({}) })
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.mouseMove(svg, { clientX: 300, clientY: 100 })
    expect(detail().querySelector('.wread')).toHaveTextContent(/: \$[\d,.]+ · to base/)
    fireEvent.mouseLeave(svg)
    expect(detail().querySelector('.wread')).toHaveTextContent('Point at the chart')
    await user.click(within(detail()).getByRole('button', { name: '3M' }))
    expect(within(detail()).getByRole('button', { name: '3M' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('every alert can be switched, and Open report opens it', async () => {
    const { user } = await openWatch_()
    await user.click(screen.getAllByRole('button', { name: /^AMD/ })[0])
    await user.click(await screen.findByRole('checkbox', { name: /outside the low–high range/ }))
    await user.click(screen.getByRole('checkbox', { name: /crosses the rating-change price/ }))
    await user.click(screen.getByRole('checkbox', { name: /official prediction/ }))
    expect(bridge.setWatchAlerts).toHaveBeenCalledWith([2488], { range: false })
    expect(bridge.setWatchAlerts).toHaveBeenCalledWith([2488], { trigger: false })
    expect(bridge.setWatchAlerts).toHaveBeenCalledWith([2488], { age: false })
    await user.click(within(detail()).getByRole('button', { name: 'Open report' }))
    await waitFor(() => expect(bridge.getReport).toHaveBeenCalledWith('rep-amd', expect.anything()))
  })

  test('a company can be queued from its panel, and the strip opens a company', async () => {
    const line = (await bridge.getLine()).result!
    bridge.planLine.mockResolvedValue({ ok: true, result: { items: [{ ticker: 'MU', name: 'Micron', official: false }], skipped: [], line } })
    const { user } = await openWatch_()
    await user.click(within(screen.getByRole('region', { name: 'Needs a look' })).getByRole('button', { name: /^MU/ }))
    await waitFor(() => expect(detail()).toHaveTextContent('Micron Technology'))
    await user.click(within(detail()).getByRole('button', { name: 'Queue a new report' }))
    expect(await screen.findByText(/MU: a report, not an official prediction/)).toBeInTheDocument()
    expect(bridge.planLine).toHaveBeenCalledWith(['MU'], { skipRecent: false })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText(/MU: a report/)).toBeNull()
  })
})

// ---------- Write takes (Dig deeper's AI take on each company, one after another) ----------

const takeLine = (over: object = {}) => ({ waiting: [], writing: null, finished: [], paused: null, typical: null, ...over })
const item = (ticker: string, over: object = {}) => ({ ticker, name: `${ticker} Inc.`, official: false, run_id: null, outcome: null, report_id: null, code: null, message: null, resumable: null, ...over })

describe('Write takes', () => {
  test('counts the companies with a report and no recent take, asks first, then starts the line', async () => {
    const { user } = await openWatch_()
    // AMD and MU have reports; LULU has none.
    await user.click(screen.getByRole('button', { name: 'Write 2 takes' }))
    expect(await screen.findByText('Write AI takes on 2 companies, one after another? About a minute each, on your AI plan.')).toBeInTheDocument()
    expect(bridge.startTakeLine).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Write takes' }))
    expect(bridge.startTakeLine).toHaveBeenCalledWith([2488, 723125])
  })

  test('is off when every company has a recent take or no report', async () => {
    const page = (await bridge.getWatchlist()).result!
    bridge.getWatchlist.mockResolvedValue({ ok: true, result: { ...page, rows: page.rows.map((r) => ({ ...r, take_at: new Date().toISOString() })) } })
    await openWatch_()
    expect(screen.getByRole('button', { name: /^Write( \d+)? takes?$/ })).toBeDisabled()
  })

  test('the strip shows the take under way and the ones waiting, which can be taken out or all cancelled', async () => {
    bridge.getTakeLine.mockResolvedValue({ ok: true, result: takeLine({ writing: item('AMD', { run_id: 'take-1' }), waiting: [item('MU')] }) })
    bridge.removeFromTakeLine.mockResolvedValue({ ok: true, result: takeLine({ writing: item('AMD', { run_id: 'take-1' }) }) })
    const { user } = await openWatch_()
    const strip = within(await screen.findByRole('region', { name: 'Takes' }))
    expect(strip.getByText('Writing takes')).toBeInTheDocument()
    expect(strip.getByText('1 of 2: AMD now')).toBeInTheDocument()
    await user.click(strip.getByRole('button', { name: 'Take MU out of the takes' }))
    expect(bridge.removeFromTakeLine).toHaveBeenCalledWith('MU')
    await user.click(strip.getByRole('button', { name: 'Cancel all' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel all takes' }))
    expect(bridge.clearTakeLine).toHaveBeenCalled()
  })

  test('a paused take line says why and carries on', async () => {
    bridge.getTakeLine.mockResolvedValue({ ok: true, result: takeLine({ waiting: [item('MU')], paused: { code: 'NO_TOOL', message: 'Neither Claude Code nor Codex was found.', reset_at: null, fix_command: null, run_id: null, wait_until: null, used: null } }) })
    const { user } = await openWatch_()
    const strip = within(await screen.findByRole('region', { name: 'Takes' }))
    expect(strip.getByText('Takes are paused')).toBeInTheDocument()
    expect(strip.getByText('Neither Claude Code nor Codex was found. MU is waiting.')).toBeInTheDocument()
    await user.click(strip.getByRole('button', { name: 'Carry on' }))
    expect(bridge.carryOnTakeLine).toHaveBeenCalled()
  })

  test('a finished line says how it went, and Done puts it away', async () => {
    bridge.getTakeLine.mockResolvedValue({ ok: true, result: takeLine({ finished: [item('AMD', { outcome: 'ready' }), item('MU', { outcome: 'failed', message: 'No answer within 300 seconds.' })] }) })
    const { user } = await openWatch_()
    const strip = within(await screen.findByRole('region', { name: 'Takes' }))
    expect(strip.getByText('Takes written')).toBeInTheDocument()
    expect(strip.getByText('1 of 2 written. MU: No answer within 300 seconds.')).toBeInTheDocument()
    await user.click(strip.getByRole('button', { name: 'Done' }))
    expect(bridge.clearTakeLine).toHaveBeenCalled()
  })

  test('a take_line_changed note updates the strip', async () => {
    await openWatch_()
    expect(screen.queryByRole('region', { name: 'Takes' })).toBeNull()
    emit('take_line_changed', takeLine({ writing: item('AMD', { run_id: 'take-1' }) }))
    expect(await screen.findByRole('region', { name: 'Takes' })).toBeInTheDocument()
  })

  test('each row shows its take’s day, or its place in the take line', async () => {
    const page = (await bridge.getWatchlist()).result!
    const day = new Date(2026, 10, 17, 15, 0).toISOString()
    bridge.getWatchlist.mockResolvedValue({ ok: true, result: { ...page, rows: page.rows.map((r) => (r.ticker === 'AMD' ? { ...r, take_at: day } : r.ticker === 'MU' ? { ...r, take_queued: 'waiting' as const } : r)) } })
    await openWatch_()
    const rowOf = (t: string) => [...document.querySelectorAll('.watchv .wrow > button')].find((b) => b.querySelector('b')?.childNodes[0]?.textContent === t) as HTMLElement
    expect(within(rowOf('AMD')).getByText(/^Nov 17/)).toHaveClass('wtake')
    expect(within(rowOf('MU')).getByText('Next')).toHaveClass('wtake')
  })
})
