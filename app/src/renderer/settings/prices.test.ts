import { describe, expect, it } from 'vitest'

import type { PriceDownload } from '../../shared/protocol'
import { priceLine } from './prices'

const at = (over: Partial<PriceDownload>): PriceDownload => ({ state: 'downloading', companies_ready: 0, companies: 503, ...over })

describe('the price download line', () => {
  it('counts trading days while it downloads, and keeps asking', () => {
    expect(priceLine(at({ days_done: 120, days_total: 295 }))).toEqual({ text: '120 of 295 trading days so far, in the background.', tone: 'run', going: true })
  })

  it('says it is starting before the first day is counted', () => {
    expect(priceLine(at({})).text).toBe('Starting…')
  })

  it('says what it is waiting for while paused, and keeps asking', () => {
    expect(priceLine(at({ state: 'paused', paused_for: 'report', days_done: 120, days_total: 295 }))).toEqual({
      text: 'Paused while a report runs, at 120 of 295 trading days. It goes on by itself.',
      tone: 'off',
      going: true
    })
    expect(priceLine(at({ state: 'paused', paused_for: 'grading' })).text).toBe('Paused while past predictions are graded. It goes on by itself.')
    expect(priceLine(at({ state: 'paused', paused_for: 'history' })).text).toContain('while a full price history downloads')
    expect(priceLine(at({ state: 'paused', paused_for: 'safety' })).text).toContain('while a safety check runs')
  })

  it('says it is done for every company, or for how many', () => {
    expect(priceLine(at({ state: 'done', companies_ready: 503 }))).toEqual({ text: 'Done: 14 months of prices for all 503 companies.', tone: 'ok', going: false })
    expect(priceLine(at({ state: 'done', companies_ready: 498 })).text).toBe('Done: 14 months of prices for 498 of 503 companies. The rest download when a report needs them.')
  })

  it('says why it stopped and that it tries again', () => {
    expect(priceLine(at({ state: 'stopped', stopped_because: 'Massive turned down the key' }))).toEqual({
      text: 'Stopped: Massive turned down the key. It starts again the next time Tearsheet opens.',
      tone: 'hold',
      going: false
    })
  })

  it('waits for the Massive key, the next open, or being switched on, without asking again', () => {
    for (const state of ['no_key', 'waiting', 'off'] as const) expect(priceLine(at({ state })).going).toBe(false)
    expect(priceLine(at({ state: 'no_key' })).text).toMatch(/^Starts once the Massive key is added/)
    expect(priceLine(at({ state: 'off' })).text).toBe('Switched off. Reports download the prices they need as they go.')
  })
})
