// A big line (8 Nov 2026): pasting a long list, the plan card's cost, warning, skips and 30-day
// skip, the quick adds (the whole S&P 500, a sector, the rest), the folded Up next and Done
// lists, and the waits: a usage limit that resets by itself, the 5-hour window past 80%, and the
// weekly window past 80%, which asks. A wait an hour or two away may read "tomorrow" late in the
// evening, so the times here allow it.

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import type { LineItem, LinePause, LinePlan, LineState } from '../../shared/protocol'
import { LineAdder, LinePaused, LinePlanCard, LineStrip } from '../home/LineParts'
import { renderApp } from '../test/app'
import { bridge, emit, fail, line, lineItem, ok } from '../test/bridge'

const field = () => screen.getByRole('combobox', { name: 'Look up a company' })
const card = () => within(screen.getByRole('group', { name: 'Several reports' }))
const strip = () => within(screen.getByRole('region', { name: 'Up next' }))

const TYPICAL = { seconds: 240, ai_calls: 34, runs: 20 }
const many = (n: number, from = 0, over: Partial<LineItem> = {}) => Array.from({ length: n }, (_, i) => lineItem(`T${from + i}`, over))
const pause = (over: Partial<LinePause>): LinePause => ({ code: 'USAGE_LIMIT', message: 'Your plan’s usage limit is reached.', reset_at: null, fix_command: null, run_id: null, wait_until: null, used: null, ...over })
const CLOCK = /\d{1,2}:\d{2} [ap]m/

function bigPlan(): LinePlan {
  const items = [...many(210), ...many(2, 210, { official: false })]
  const skipped = [
    ...many(40, 300).map((item) => ({ query: item.ticker, reason: `${item.ticker} has a report from Nov 2.`, kind: 'recent' as const })),
    { query: 'ZZZZ', reason: "No S&P 500 company matches 'ZZZZ'.", kind: 'unknown' as const },
    { query: 'T1', reason: 'T1 is listed twice.', kind: 'twice' as const }
  ]
  return { items, skipped, line: line({ typical: TYPICAL }) }
}

describe('pasting and typing a long list', () => {
  test('a pasted column becomes one company a line, and tickers with spaces make a list too', async () => {
    const { user } = await renderApp()
    await user.click(field())
    await user.paste('NVDA\nMSFT\r\n\tzz\n')
    expect(field()).toHaveValue('NVDA, MSFT, zz')
    await user.keyboard('{Enter}')
    expect(bridge.planLine).toHaveBeenLastCalledWith(['NVDA', 'MSFT', 'zz'], expect.objectContaining({ skipRecent: true }))
    // A paste with no new line goes in as it is.
    await user.clear(field())
    await user.paste('AAPL')
    expect(field()).toHaveValue('AAPL')
    await user.clear(field())
    await user.type(field(), 'NVDA MSFT')
    expect(screen.getByText('Return checks these 2 companies, then writes the reports one after another.')).toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(bridge.planLine).toHaveBeenLastCalledWith(['NVDA', 'MSFT'], expect.objectContaining({ skipRecent: true }))
  })

  test('a big list says what it takes, warns about official predictions, and folds', async () => {
    bridge.planLine.mockResolvedValue(ok(bigPlan()))
    const { user } = await renderApp()
    await user.type(field(), 'T0, T1{Enter}')
    expect(await card().findByText('Write 212 reports, one after another?')).toBeInTheDocument()
    expect(card().getByText('About 14 hours and about 7,208 AI calls in all. Keep your Mac open; Tearsheet keeps it awake until they’re done.')).toBeInTheDocument()
    expect(card().getByText(/the line waits for it to reset and carries on by itself\. Past 80% of your weekly usage, it asks you first\./)).toBeInTheDocument()
    expect(card().getByRole('note')).toHaveTextContent(
      'Each first report is an official prediction for 30 days. 210 new ones will be logged. 2 companies were rated in the last 30 days, so they won’t be.'
    )
    // The tickers fold after two dozen.
    expect(card().queryByText(/T211/)).toBeNull()
    await user.click(card().getByRole('button', { name: 'Show all 212' }))
    expect(card().getByText(/T211/)).toBeInTheDocument()
    await user.click(card().getByRole('button', { name: 'Show fewer' }))
    // What was left out, grouped by why, each group folded.
    const left = within(card().getByRole('group', { name: 'Left out' }))
    expect(left.getByText('1 company wasn’t found')).toBeInTheDocument()
    expect(left.getByText('40 companies have a report from the last 30 days')).toBeInTheDocument()
    expect(left.getByText('1 company was listed twice')).toBeInTheDocument()
    expect(left.queryByText(/T339/)).toBeNull()
    await user.click(left.getByRole('button', { name: 'Show all 40' }))
    expect(left.getByText(/T339/)).toBeInTheDocument()
    // The 30-day skip, on by default, asks again when it changes.
    const skip = card().getByRole('checkbox', { name: /Skip companies with a report from the last 30 days/ })
    expect(skip).toBeChecked()
    expect(card().getByText('40 skipped')).toBeInTheDocument()
    await user.click(skip)
    expect(bridge.planLine).toHaveBeenLastCalledWith(['T0', 'T1'], expect.objectContaining({ skipRecent: false }))
    await waitFor(() => expect(card().getByRole('checkbox', { name: /Skip companies/ })).not.toBeChecked())
    await user.click(card().getByRole('button', { name: 'Start 212 reports' }))
    expect(bridge.addToLine).toHaveBeenCalledWith(bigPlan().items.map((item) => item.ticker))
  })

  test('a big list with no new official predictions says so', () => {
    const items = many(12, 0, { official: false })
    render(<LinePlanCard plan={{ items, skipped: [], line: line() }} starting={false} onStart={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('note')).toHaveTextContent('None will be a new official prediction: each was rated in the last 30 days.')
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})

describe('the quick adds', () => {
  test('check the whole S&P 500, one sector, or the rest, before anything starts', async () => {
    const { user } = await renderApp()
    const adds = within(await screen.findByRole('group', { name: 'Add a group' }))
    await user.click(adds.getByRole('button', { name: /All S&P 500\s*503/ }))
    expect(bridge.planLine).toHaveBeenLastCalledWith([], { group: 'all', sector: undefined, skipRecent: true })
    await card().findByText(/one after another\?/)
    expect(bridge.addToLine).not.toHaveBeenCalled()
    await user.click(card().getByRole('button', { name: 'Cancel' }))

    const again = within(await screen.findByRole('group', { name: 'Add a group' }))
    await user.selectOptions(again.getByRole('combobox', { name: 'Add a sector' }), 'Energy')
    expect(bridge.planLine).toHaveBeenLastCalledWith([], { group: 'sector', sector: 'Energy', skipRecent: true })
    await user.click(await card().findByRole('button', { name: 'Cancel' }))

    await user.click(within(await screen.findByRole('group', { name: 'Add a group' })).getByRole('button', { name: /The rest\s*461/ }))
    expect(bridge.planLine).toHaveBeenLastCalledWith([], { group: 'rest', sector: undefined, skipRecent: true })
  })

  test('a quick add that can’t be checked says why', async () => {
    bridge.planLine.mockResolvedValueOnce(fail('The engine is busy.'))
    const { user } = await renderApp()
    await user.click(within(await screen.findByRole('group', { name: 'Add a group' })).getByRole('button', { name: /All S&P 500/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The engine is busy.')
  })

  test('The rest is left off before any report is finished', async () => {
    bridge.lineGroups.mockResolvedValueOnce(ok({ all: 503, rest: 503, sectors: [] }))
    await renderApp()
    const adds = within(await screen.findByRole('group', { name: 'Add a group' }))
    expect(adds.queryByRole('button', { name: /The rest/ })).toBeNull()
  })

  test('under the strip, a group joins the line being written', async () => {
    const user = userEvent.setup()
    bridge.planLine.mockResolvedValueOnce(ok({ items: many(22), skipped: [], line: line({ typical: TYPICAL }) }))
    const onAdd = vi.fn(async () => null)
    render(<LineAdder perReport={240} onAdd={onAdd} />)
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Add a sector' }), 'Energy')
    await user.click(await card().findByRole('button', { name: 'Start 22 reports' }))
    expect(onAdd).toHaveBeenCalledWith(many(22).map((item) => item.ticker))
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Several reports' })).toBeNull())
    // One that can't join says why.
    bridge.planLine.mockResolvedValueOnce(ok({ items: many(1), skipped: [], line: line() }))
    onAdd.mockResolvedValueOnce('The line couldn’t take them.' as never)
    await user.click(screen.getByRole('button', { name: /All S&P 500/ }))
    await user.click(await card().findByRole('button', { name: 'Start the report' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The line couldn’t take them.')
    // A check that fails says why too; Cancel puts the card away.
    bridge.planLine.mockResolvedValueOnce(fail('No list.'))
    await user.click(screen.getByRole('button', { name: /All S&P 500/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No list.')
    bridge.planLine.mockResolvedValueOnce(ok({ items: many(2), skipped: [], line: line() }))
    await user.click(screen.getByRole('button', { name: /All S&P 500/ }))
    await user.click(await card().findByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: 'Several reports' })).toBeNull()
  })
})

const strips = {
  onRemove: vi.fn(),
  onAdd: vi.fn(),
  onCancelAll: vi.fn(),
  onCarryOn: vi.fn(),
  onOpen: vi.fn()
}

describe('a long line on screen', () => {
  test('Up next says how far it has got and folds, and × and Cancel all still work', async () => {
    const user = userEvent.setup()
    const long = line({ writing: lineItem('NVDA', { run_id: 'run-1' }), waiting: many(200), finished: many(37, 500, { outcome: 'ready' }), typical: TYPICAL })
    render(<LineStrip line={long} runId="run-1" perReport={240} {...strips} adder={<span>adder</span>} />)
    expect(strip().getByText('Report 38 of 238')).toBeInTheDocument()
    expect(strip().getByText('37 of 238 done, about 13 hours left')).toBeInTheDocument()
    const chips = () => within(strip().getByRole('list', { name: 'Waiting' })).getAllByRole('listitem')
    expect(chips()).toHaveLength(12)
    await user.click(strip().getByRole('button', { name: 'Show all 200' }))
    expect(chips()).toHaveLength(200)
    await user.click(strip().getByRole('button', { name: 'Take T150 out of the line' }))
    expect(strips.onRemove).toHaveBeenCalledWith('T150')
    await user.click(strip().getByRole('button', { name: 'Cancel all' }))
    expect(strips.onCancelAll).toHaveBeenCalled()
    expect(strip().getByText('adder')).toBeInTheDocument()
  })

  test('a long Done list folds to the latest few', async () => {
    const user = userEvent.setup()
    const done = line({ finished: many(20, 0, { outcome: 'ready', report_id: 'r-1', run_id: 'run-x' }) })
    render(<LineStrip line={done} runId="run-x" perReport={240} {...strips} />)
    const list = within(screen.getByRole('region', { name: 'This line' }))
    expect(list.getAllByRole('listitem')).toHaveLength(8)
    expect(list.getByText('T19')).toBeInTheDocument()
    await user.click(list.getByRole('button', { name: 'Show all 20' }))
    expect(list.getAllByRole('listitem')).toHaveLength(20)
  })

  test('a line waiting for the plan says so, and only the weekly 80% asks', async () => {
    const user = userEvent.setup()
    const at = new Date(Date.now() + 3600_000).toISOString()
    const { rerender } = render(<LineStrip line={line({ waiting: many(3), paused: pause({ code: 'USAGE_HIGH', used: 0.91, wait_until: at, message: 'x' }) })} runId="run-1" perReport={240} {...strips} />)
    expect(strip().getByRole('status')).toHaveTextContent(/^Your plan’s 5-hour usage is at 91%\. Waiting for it to reset at \d{1,2}:\d{2} [ap]m(?: tomorrow)?, so you keep the rest\. The line carries on by itself then\.$/)
    expect(strip().queryByRole('button', { name: 'Add a company' })).toBeNull()
    await user.click(strip().getByRole('button', { name: 'Carry on now' }))
    expect(strips.onCarryOn).toHaveBeenCalledTimes(1)

    rerender(<LineStrip line={line({ waiting: many(3), paused: pause({ code: 'USAGE_WEEK', used: 0.82, message: 'x' }) })} runId="run-1" perReport={240} {...strips} />)
    expect(strip().getByRole('status')).toHaveTextContent('Your plan’s weekly usage is at 82%. Carry on writing the line?')
    await user.click(strip().getByRole('button', { name: 'Carry on' }))
    expect(strips.onCarryOn).toHaveBeenCalledTimes(2)

    rerender(<LineStrip line={line({ waiting: many(3), paused: pause({ code: 'USAGE_LIMIT', run_id: 'run-1', wait_until: at }) })} runId="run-1" perReport={240} {...strips} />)
    expect(strip().getByRole('status')).toHaveTextContent(/^Your plan’s usage limit is reached\. Trying again at \d{1,2}:\d{2} [ap]m(?: tomorrow)?\.$/)
    expect(strip().getByRole('button', { name: 'Skip it and carry on' })).toBeInTheDocument()
  })
})

describe('waiting for the plan, on the home page', () => {
  const at = () => new Date(Date.now() + 2 * 3600_000).toISOString()

  test('past 80% of the week, the line asks before it goes on', async () => {
    const user = userEvent.setup()
    const onCarryOn = vi.fn()
    const waiting = line({ waiting: [lineItem('NVDA'), lineItem('MSFT')], paused: pause({ code: 'USAGE_WEEK', used: 0.82, message: 'x' }) })
    render(<LinePaused line={waiting} onCarryOn={onCarryOn} onClear={vi.fn()} onRecheck={vi.fn()} onCancelAll={vi.fn()} />)
    expect(screen.getByText('Your weekly usage is past 80%')).toBeInTheDocument()
    expect(screen.getByText('Your plan’s weekly usage is at 82%. Carry on writing the line? NVDA and MSFT are waiting.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Carry on' }))
    expect(onCarryOn).toHaveBeenCalled()
  })

  test('a wait that ends by itself says when, and a long list is counted', () => {
    const waiting = line({ waiting: many(30), paused: pause({ code: 'USAGE_HIGH', wait_until: at(), used: null }) })
    const { rerender } = render(<LinePaused line={waiting} onCarryOn={vi.fn()} onClear={vi.fn()} onRecheck={vi.fn()} onCancelAll={vi.fn()} />)
    expect(screen.getByText('The line is waiting')).toBeInTheDocument()
    expect(screen.getByText(/^Your plan’s 5-hour usage is close to its limit\. Waiting for it to reset at .*T0, T1, T2, T3, T4, T5 and 24 more are waiting\.$/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Carry on now' })).toBeInTheDocument()
    rerender(<LinePaused line={line({ waiting: many(1), paused: pause({ wait_until: at(), reset_at: '3am', run_id: 'run-1' }) })} onCarryOn={vi.fn()} onClear={vi.fn()} onRecheck={vi.fn()} onCancelAll={vi.fn()} />)
    expect(screen.getByText(/^Waiting for your usage limit to reset at .*The line carries on by itself then\. T0 is waiting\.$/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skip it and carry on' })).toBeInTheDocument()
  })
})

describe('a usage limit in a running line', () => {
  test('waits for the reset, and the run view follows when the engine resumes the report', async () => {
    bridge.getLine.mockResolvedValue(ok(line({ writing: lineItem('NVDA', { run_id: 'run-l1' }), waiting: [lineItem('MSFT')] })))
    await renderApp()
    await screen.findByRole('region', { name: 'Report progress' })
    const resetAt = new Date(Date.now() + 3600_000)
    const until = new Date(resetAt.getTime() + 120_000).toISOString()
    emit('run_failed', { run_id: 'run-l1', step: 'narrate', code: 'USAGE_LIMIT', message: 'Your plan’s usage limit is reached.', reset_at: resetAt.toISOString() })
    const waiting: LineState = line({
      finished: [lineItem('NVDA', { run_id: 'run-l1', outcome: 'stopped', code: 'USAGE_LIMIT' })],
      waiting: [lineItem('MSFT')],
      paused: pause({ run_id: 'run-l1', reset_at: resetAt.toISOString(), wait_until: until })
    })
    emit('line_changed', waiting)
    expect(await screen.findByText('Your plan’s usage limit stopped the report')).toBeInTheDocument()
    const box = screen.getByRole('alert')
    expect(box).toHaveTextContent(CLOCK)
    expect(box).toHaveTextContent(/Waiting for your usage limit to reset at .*\. The line carries on by itself then\. Or resume it now\./)
    expect(box).not.toHaveTextContent('Your usage resets at')
    expect(strip().getByRole('status')).toHaveTextContent(/^Waiting for your usage limit to reset at/)
    // The limit has reset: the engine resumes NVDA, and the run view follows it.
    emit('line_changed', line({ writing: lineItem('NVDA', { run_id: 'run-l1' }), waiting: [lineItem('MSFT')] }))
    await waitFor(() => expect(screen.queryByText('Your plan’s usage limit stopped the report')).toBeNull())
    expect(screen.getByRole('region', { name: 'Report progress' })).toBeInTheDocument()
    expect(strip().getByRole('button', { name: 'Add a company' })).toBeInTheDocument()
  })
})
