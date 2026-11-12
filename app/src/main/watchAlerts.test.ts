import { describe, expect, test, vi } from 'vitest'

import type { Notification } from './engine'
import { alertEvents, alertNotice, showWatchAlerts } from './watchAlerts'

const ev = (cik: number, ticker: string, text = `${ticker} closed below its low case.`) => ({ cik, ticker, text, kind: 'range' })
const note = (events: unknown[], notify = true): Notification => ({ method: 'watch_changed', params: { events, counts: { watched: 3, needs_look: 1, no_report: 0 }, notify } })

function fakeEngine() {
  let fn: ((n: Notification) => void) | null = null
  return { on: (_e: 'notification', f: (n: Notification) => void) => { fn = f }, send: (n: Notification) => fn?.(n) }
}

describe('alertNotice', () => {
  test('one alert: the ticker as the title and the engine sentence as the body', () => {
    expect(alertNotice([ev(2488, 'AMD', 'AMD closed at $552.90, above its high case of $881.94.')])).toEqual({
      title: 'AMD · Watchlist',
      body: 'AMD closed at $552.90, above its high case of $881.94.',
      cik: 2488
    })
  })
  test('several: one notice with the count and each ticker once', () => {
    expect(alertNotice([ev(1, 'MU'), ev(2, 'AMD'), ev(1, 'MU')])).toEqual({ title: '3 watchlist alerts', body: 'MU, AMD', cik: 1 })
  })
  test('many tickers are cut to six and a count', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((t, i) => ev(i, t))
    expect(alertNotice(many)?.body).toBe('A, B, C, D, E, F and 2 more')
  })
  test('none: no notice', () => expect(alertNotice([])).toBeNull())
})

describe('alertEvents', () => {
  test('reads only well-formed events from watch_changed', () => {
    expect(alertEvents(note([ev(1, 'MU'), { cik: 'x' }, null]))).toEqual([ev(1, 'MU')])
    expect(alertEvents({ method: 'line_changed', params: {} })).toEqual([])
    expect(alertEvents({ method: 'watch_changed', params: {} })).toEqual([])
  })
})

describe('showWatchAlerts', () => {
  test('shows a notice and opens the company on click', () => {
    const engine = fakeEngine()
    const show = vi.fn()
    const open = vi.fn()
    showWatchAlerts(engine, { show }, { enabled: true, open })
    engine.send(note([ev(2488, 'AMD')]))
    expect(show).toHaveBeenCalledTimes(1)
    show.mock.calls[0][1]()
    expect(open).toHaveBeenCalledWith(2488)
  })
  test('nothing when the setting is off, there are no events, or it is another note', () => {
    const engine = fakeEngine()
    const show = vi.fn()
    showWatchAlerts(engine, { show }, { enabled: true, open: vi.fn() })
    engine.send(note([ev(1, 'MU')], false))
    engine.send(note([]))
    engine.send({ method: 'progress', params: {} })
    expect(show).not.toHaveBeenCalled()
  })
  test('never from a hidden check window or a test copy', () => {
    const engine = fakeEngine()
    const on = vi.spyOn(engine, 'on')
    const show = vi.fn()
    showWatchAlerts(engine, { show }, { enabled: false, open: vi.fn() })
    engine.send(note([ev(1, 'MU')]))
    expect(on).not.toHaveBeenCalled()
    expect(show).not.toHaveBeenCalled()
  })
})
