// Refresh: what the confirm says before a company's report is written again (refresh.ts).

import { describe, expect, it } from 'vitest'

import type { LineItem, LinePlan } from '../../shared/protocol'
import { ageText, CALLS_PER_REPORT, refreshNote, refreshText } from './refresh'

const NOW = new Date(2026, 10, 8, 15, 0)

const item = (ticker: string, official = true): LineItem => ({ ticker, name: `${ticker} Inc.`, official, run_id: null, outcome: null, report_id: null, code: null, message: null })
const plan = (items: LineItem[], skipped: LinePlan['skipped'] = []): LinePlan => ({ items, skipped, line: { waiting: items, writing: null, finished: [], paused: null, typical: null } })

describe('ageText', () => {
  it('counts whole days on the calendar, not 24-hour spans', () => {
    expect(ageText('2026-11-08T09:00:00', NOW)).toBe('today')
    expect(ageText('2026-11-07T23:30:00', NOW)).toBe('yesterday')
    expect(ageText('2026-11-05T14:00:00', NOW)).toBe('3 days ago')
    expect(ageText('2026-08-02T14:00:00', NOW)).toBe('98 days ago')
  })

  it('goes by the local day, as the sidebar’s Today and Yesterday do, not the UTC date', () => {
    // 11:51 pm here is already the next day in UTC (the engine's timestamps end in Z).
    const lateLastNight = new Date(2026, 10, 7, 23, 51).toISOString()
    expect(ageText(lateLastNight, NOW)).toBe('yesterday')
    const t = refreshText([{ ticker: 'NOW', created_at: lateLastNight }], plan([item('NOW', false)]), { busy: false, now: NOW })
    expect(t.lines[0]).toBe('Your latest NOW report is from Nov 7, yesterday.')
  })

  it('says nothing odd for a date it can’t read or one in the future', () => {
    expect(ageText('not a date', NOW)).toBe('')
    expect(ageText('2026-11-09T09:00:00', NOW)).toBe('today')
  })
})

describe('refreshText for one company', () => {
  const asked = [{ ticker: 'AAPL', created_at: '2026-08-02T14:00:00' }]

  it('says how old the report is, what a new one costs, and that it will be official', () => {
    const t = refreshText(asked, plan([item('AAPL')]), { busy: false, now: NOW, perReport: 300 })
    expect(t.title).toBe('Refresh AAPL?')
    expect(t.lines).toEqual([
      'Your latest AAPL report is from Aug 2, 98 days ago.',
      `A new full report takes about 5 min and about ${CALLS_PER_REPORT} AI calls.`,
      'It will be a new official prediction in your log.',
      'Your old report stays. Switch between them from the report’s date at the top.'
    ])
    expect(t.ages).toEqual([])
    expect(t.start).toBe('Write a new report')
  })

  it('says it won’t be official inside 30 days, and that it waits when a report is being written', () => {
    const t = refreshText([{ ticker: 'MSFT', created_at: '2026-11-05T14:00:00' }], plan([item('MSFT', false)]), { busy: true, now: NOW, perReport: 300 })
    expect(t.lines).toContain('It won’t be an official prediction: MSFT was rated in the last 30 days.')
    expect(t.lines).toContain('It starts once the reports before it are done.')
    expect(t.lines[0]).toBe('Your latest MSFT report is from Nov 5, 3 days ago.')
  })

  it('a report from today says so', () => {
    const t = refreshText([{ ticker: 'AAPL', created_at: '2026-11-08T09:00:00' }], plan([item('AAPL')]), { busy: false, now: NOW })
    expect(t.lines[0]).toBe('Your latest AAPL report is from today.')
  })

  it('one that can’t be added says why, with no Start', () => {
    const t = refreshText(asked, plan([], [{ query: 'AAPL', reason: 'AAPL is already in the line.', kind: 'in_line' as const }]), { busy: true, now: NOW })
    expect(t.title).toBe('AAPL can’t be refreshed now')
    expect(t.lines).toEqual(['AAPL is already in the line.'])
    expect(t.skipped).toEqual([])
    expect(t.start).toBeNull()
  })
})

describe('refreshText for several companies', () => {
  const asked = [
    { ticker: 'AAPL', created_at: '2026-08-02T14:00:00' },
    { ticker: 'MSFT', created_at: '2026-11-05T14:00:00' },
    { ticker: 'JPM', created_at: '2026-10-01T14:00:00' }
  ]

  it('lists each one’s age, the time and calls in all, and which will be official', () => {
    const t = refreshText(asked, plan([item('AAPL'), item('MSFT', false), item('JPM')]), { busy: false, now: NOW, perReport: 300 })
    expect(t.title).toBe('Refresh 3 reports?')
    expect(t.ages).toEqual([
      { ticker: 'AAPL', text: 'from Aug 2, 98 days ago' },
      { ticker: 'MSFT', text: 'from Nov 5, 3 days ago' },
      { ticker: 'JPM', text: 'from Oct 1, 38 days ago' }
    ])
    expect(t.lines).toEqual([
      `Written one after another: about 15 min in all, and about ${3 * CALLS_PER_REPORT} AI calls.`,
      '2 of these will be new official predictions in your log. MSFT was rated in the last 30 days, so it won’t be.',
      'Your old reports stay.'
    ])
    expect(t.start).toBe('Write 3 new reports')
  })

  it('keeps the ones left out, and only counts the ones that will be written', () => {
    const skipped = [{ query: 'MSFT', reason: 'MSFT is already in the line.', kind: 'in_line' as const }]
    const t = refreshText(asked, plan([item('AAPL'), item('JPM')], skipped), { busy: true, now: NOW, perReport: 300 })
    expect(t.title).toBe('Refresh 2 reports?')
    expect(t.ages.map((a) => a.ticker)).toEqual(['AAPL', 'JPM'])
    expect(t.skipped).toEqual(skipped)
    expect(t.lines).toContain('They start once the reports before them are done.')
    expect(t.start).toBe('Write 2 new reports')
  })

  it('none that can be added says so, with no Start', () => {
    const skipped = asked.map((a) => ({ query: a.ticker, reason: `${a.ticker} is already in the line.`, kind: 'in_line' as const }))
    const t = refreshText(asked, plan([], skipped), { busy: true, now: NOW })
    expect(t.title).toBe('None of these can be refreshed now')
    expect(t.lines).toEqual([])
    expect(t.skipped).toEqual(skipped)
    expect(t.start).toBeNull()
  })
})

describe('refreshNote, once they are in the line', () => {
  it('says it has started, or that it is waiting its turn', () => {
    expect(refreshNote([item('AAPL')], { busy: false, paused: false })).toEqual({ title: 'Refreshing AAPL', text: 'It’s under “writing…” in the sidebar. Your old report stays.' })
    expect(refreshNote([item('AAPL')], { busy: true, paused: false })).toEqual({ title: 'AAPL is in the line', text: 'It starts once the reports before it are done.' })
    expect(refreshNote([item('AAPL'), item('JPM')], { busy: false, paused: false })).toEqual({ title: 'Refreshing 2 reports', text: 'AAPL first, then JPM. They’re under “writing…” in the sidebar.' })
    expect(refreshNote([item('AAPL'), item('JPM')], { busy: true, paused: false })).toEqual({ title: 'AAPL and JPM are in the line', text: 'They start once the reports before them are done.' })
  })

  it('behind a paused line, says how to go on', () => {
    expect(refreshNote([item('AAPL')], { busy: false, paused: true })).toEqual({ title: 'AAPL is in the line', text: 'The line is paused. Carry on from the home page.' })
  })
})
