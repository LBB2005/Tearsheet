import { describe, expect, it } from 'vitest'

import { USUAL } from '../../shared/pace'
import type { LineItem, LineState } from '../../shared/protocol'
import {
  aboutLong,
  callsPerReportOf,
  clockTime,
  doneCount,
  inLine,
  isList,
  joinNames,
  lineCost,
  lineGoing,
  linePlace,
  lineProgress,
  lineTime,
  newlyUnstarted,
  officialNote,
  officialWarning,
  outcomeText,
  pastedList,
  perReportOf,
  safetyPause,
  safetyPauseText,
  skipGroups,
  someNames,
  splitQueries,
  usualReport,
  waitsByItself,
  waitsForCheck,
  waitText
} from './line'

const item = (ticker: string, over: Partial<LineItem> = {}): LineItem => ({ ticker, name: ticker, official: true, run_id: null, outcome: null, report_id: null, code: null, message: null, ...over })
const state = (over: Partial<LineState> = {}): LineState => ({ waiting: [], writing: null, finished: [], paused: null, typical: null, ...over })

describe('a typed list', () => {
  it('is any text with a comma, semicolon or new line, and names keep their spaces', () => {
    expect(isList('JPM')).toBe(false)
    expect(isList('Bank of America')).toBe(false)
    expect(isList('JPM, O')).toBe(true)
    expect(isList('JPM,')).toBe(true)
    expect(splitQueries(' JPM, Bank of America ;O\nXOM,, ')).toEqual(['JPM', 'Bank of America', 'O', 'XOM'])
  })

  it('takes tickers in capitals with spaces between them, and pasted columns', () => {
    expect(isList('AAPL MSFT NVDA')).toBe(true)
    expect(isList('BRK.B  JPM')).toBe(true)
    expect(isList('Ford Motor')).toBe(false)
    expect(isList('aapl msft')).toBe(false)
    expect(isList('AAPL\tMSFT')).toBe(true)
    expect(splitQueries('AAPL MSFT, Bank of America, BRK.B JPM')).toEqual(['AAPL', 'MSFT', 'Bank of America', 'BRK.B', 'JPM'])
    expect(pastedList('AAPL\r\nMSFT\n\n NVDA \tJPM\n')).toBe('AAPL, MSFT, NVDA, JPM')
  })
})

describe('a big line', () => {
  const typical = { seconds: 240, ai_calls: 34, runs: 20 }

  it('takes one report’s time and AI calls from Liam’s own runs, or the usual ones', () => {
    expect(perReportOf(state({ typical }))).toBe(240)
    expect(perReportOf(state(), 300)).toBe(300)
    expect(perReportOf(null, 300)).toBe(300)
    expect(callsPerReportOf(state({ typical }))).toBe(34)
    expect(callsPerReportOf(null)).toBe(35)
  })

  it('says how far it has got and about how long is left', () => {
    const big = state({ finished: Array.from({ length: 37 }, (_, i) => item(`D${i}`)), writing: item('W'), waiting: Array.from({ length: 174 }, (_, i) => item(`T${i}`)) })
    expect(lineProgress(big, 240)).toBe('37 of 212 done, about 12 hours left')
    expect(lineProgress(state({ finished: [item('A'), item('B')] }), 240)).toBe('2 of 2 done')
    expect(lineCost(212, 240, 34)).toBe('about 14 hours and about 7,208 AI calls')
  })

  it('counts long times in hours, then days', () => {
    expect(aboutLong(600)).toBe('about 10 min')
    expect(aboutLong(5 * 3600)).toBe('about 5 hours')
    expect(aboutLong(35 * 3600)).toBe('about 35 hours')
    expect(aboutLong(100 * 3600)).toBe('about 4 days')
    expect(lineTime(500, 250)).toBe('about 35 hours')
  })

  it('warns how many new official predictions a line will log', () => {
    expect(officialWarning([item('A'), item('B'), item('C', { official: false })])).toBe('Each first report is an official prediction for 30 days. 2 new ones will be logged.')
    expect(officialWarning([item('A')])).toBe('Each first report is an official prediction for 30 days. 1 new one will be logged.')
    expect(officialWarning([item('A', { official: false })])).toBe('')
    const many = Array.from({ length: 20 }, (_, i) => item(`T${i}`, { official: false }))
    expect(officialNote([item('X'), ...many])).toBe('1 of these will be a new official prediction in your log. T0, T1, T2, T3, T4, T5 and 14 more were rated in the last 30 days, so they won’t be.')
  })

  it('names a few, and counts the rest', () => {
    expect(someNames(['A', 'B', 'C'])).toBe('A, B and C')
    expect(someNames(['A', 'B', 'C', 'D', 'E', 'F', 'G'])).toBe('A, B, C, D, E, F and G')
    expect(someNames(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], 2)).toBe('A, B and 6 more')
  })

  it('groups what was left out by why', () => {
    const groups = skipGroups([
      { query: 'MSFT', reason: 'MSFT is already in the line.', kind: 'in_line' },
      { query: 'JPM', reason: 'JPM has a report from Nov 2.', kind: 'recent' },
      { query: 'O', reason: 'O has a report from Nov 3.', kind: 'recent' },
      { query: 'zz', reason: 'No match.', kind: 'unknown' }
    ])
    expect(groups.map((g) => [g.kind, g.head, g.skips.length])).toEqual([
      ['unknown', '1 company wasn’t found', 1],
      ['recent', '2 companies have a report from the last 30 days', 2],
      ['in_line', '1 company is already in the line', 1]
    ])
    expect(skipGroups([])).toEqual([])
  })
})

describe('waiting for the plan', () => {
  const now = new Date(2026, 10, 8, 14, 0)
  const at = (h: number, m = 0, day = 8) => new Date(2026, 10, day, h, m).toISOString()

  it('says times on Liam’s clock, with the day when it isn’t today', () => {
    expect(clockTime(at(15, 40), now)).toBe('3:40 pm')
    expect(clockTime(at(9, 5, 9), now)).toBe('9:05 am tomorrow')
    expect(clockTime(at(9, 5, 11), now)).toMatch(/^9:05 am on Wed,? 11 Nov$/)
    expect(clockTime('soon', now)).toBe('soon')
  })

  it('says what a paused line waits for', () => {
    const pause = { code: 'USAGE_LIMIT', message: 'Limit.', reset_at: '3:40pm', fix_command: null, run_id: 'r1', wait_until: at(15, 42), used: null }
    expect(waitsByItself(pause)).toBe(true)
    expect(waitsByItself({ ...pause, wait_until: null })).toBe(false)
    expect(waitsByItself(null)).toBe(false)
    expect(waitText(pause, now)).toBe('Waiting for your usage limit to reset at 3:42 pm. The line carries on by itself then.')
    expect(waitText({ ...pause, reset_at: null, wait_until: at(15) }, now)).toBe('Your plan’s usage limit is reached. Trying again at 3:00 pm.')
    expect(waitText({ ...pause, code: 'USAGE_HIGH', used: 0.84, wait_until: at(16, 2) }, now)).toBe(
      'Your plan’s 5-hour usage is at 84%. Waiting for it to reset at 4:02 pm, so you keep the rest. The line carries on by itself then.'
    )
    expect(waitText({ ...pause, code: 'USAGE_WEEK', used: 0.81, wait_until: null }, now)).toBe('Your plan’s weekly usage is at 81%. Carry on writing the line?')
    expect(waitText({ ...pause, code: 'USAGE_WEEK', used: null, wait_until: null }, now)).toBe('Your plan’s weekly usage is close to its limit. Carry on writing the line?')
    expect(waitText({ ...pause, code: 'AUTH_EXPIRED', wait_until: null }, now)).toBe('Limit.')
  })
})

describe('the line', () => {
  it('goes while a report is written or waiting, and not while paused', () => {
    expect(lineGoing(null)).toBe(false)
    expect(lineGoing(state())).toBe(false)
    expect(lineGoing(state({ waiting: [item('O')] }))).toBe(true)
    expect(lineGoing(state({ writing: item('JPM', { run_id: 'r1' }) }))).toBe(true)
    expect(lineGoing(state({ waiting: [item('O')], paused: { code: 'USAGE_LIMIT', message: 'x' } }))).toBe(false)
  })

  it('knows its own runs, being written or finished', () => {
    const line = state({ writing: item('O', { run_id: 'r2' }), finished: [item('JPM', { run_id: 'r1', outcome: 'ready' })] })
    expect(inLine(line, 'r1')).toBe(true)
    expect(inLine(line, 'r2')).toBe(true)
    expect(inLine(line, 'r3')).toBe(false)
    expect(inLine(null, 'r1')).toBe(false)
    expect(inLine(line, null)).toBe(false)
  })

  it('counts the report being written with those done and waiting', () => {
    expect(linePlace(state({ finished: [item('A')], writing: item('B'), waiting: [item('C'), item('D')] }))).toEqual({ at: 2, total: 4 })
    expect(linePlace(state({ waiting: [item('C')] }))).toEqual({ at: 0, total: 1 })
  })

  it('says about how long reports take', () => {
    const one = Object.values(USUAL).reduce((a, b) => a + b, 0)
    expect(usualReport()).toBeCloseTo(one)
    expect(lineTime(1, 300)).toBe('about 5 min')
    expect(lineTime(10, 150)).toBe('about 25 min')
    expect(lineTime(2)).toBe(`about ${Math.round((2 * one) / 60)} min`)
  })
})

describe('official predictions, said before the line starts', () => {
  it('names the companies rated in the last 30 days, which won’t be', () => {
    expect(officialNote([])).toBe('')
    expect(officialNote([item('JPM')])).toBe('It will be a new official prediction in your log.')
    expect(officialNote([item('JPM'), item('O')])).toBe('Each will be a new official prediction in your log.')
    expect(officialNote([item('JPM'), item('MU', { official: false })])).toBe('1 of these will be a new official prediction in your log. MU was rated in the last 30 days, so it won’t be.')
    expect(officialNote([item('JPM'), item('O'), item('MU', { official: false }), item('COST', { official: false })])).toBe(
      '2 of these will be new official predictions in your log. MU and COST were rated in the last 30 days, so they won’t be.'
    )
    expect(officialNote([item('MU', { official: false })])).toBe('None will be a new official prediction: MU was rated in the last 30 days.')
  })

  it('joins names in plain words', () => {
    expect(joinNames([])).toBe('')
    expect(joinNames(['A'])).toBe('A')
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C')
  })
})

describe('how each report went', () => {
  it('in a word or two, and counted', () => {
    expect(outcomeText(item('A', { outcome: 'ready' }))).toBe('Ready')
    expect(outcomeText(item('A', { outcome: 'cancelled' }))).toBe('Cancelled')
    expect(outcomeText(item('A', { outcome: 'stopped', report_id: 'r' }))).toBe('Stopped, report so far saved')
    expect(outcomeText(item('A', { outcome: 'stopped' }))).toBe('Stopped')
    expect(outcomeText(item('A', { outcome: 'failed' }))).toBe('Didn’t finish')
    const finished = [item('A', { outcome: 'ready' }), item('B', { outcome: 'ready' }), item('C', { outcome: 'failed' }), item('D', { outcome: 'cancelled' })]
    expect(doneCount(finished)).toBe('2 ready, 1 stopped, 1 cancelled')
    expect(doneCount([])).toBe('Nothing finished')
  })

  it('finds companies the engine couldn’t start since the last note', () => {
    const before = state({ finished: [item('A', { run_id: 'r1', outcome: 'ready' })] })
    const after = state({ finished: [...before.finished, item('ZZ', { outcome: 'failed', message: 'Not found.' }), item('B', { run_id: 'r2', outcome: 'failed' })] })
    expect(newlyUnstarted(before, after).map((i) => i.ticker)).toEqual(['ZZ'])
    expect(newlyUnstarted(null, after).map((i) => i.ticker)).toEqual(['ZZ'])
    expect(newlyUnstarted(after, after)).toEqual([])
  })
})

describe('the safety check and the line', () => {
  const pause = (code: string) => ({ code, message: 'm', reset_at: null, fix_command: null, run_id: null })

  it('knows the pauses only the check can lift', () => {
    for (const code of ['LOCKDOWN_FAILED', 'SAFETY_CHECK_STOPPED', 'SAFETY_CHECK_UNFINISHED']) expect(safetyPause(code)).toBe(true)
    for (const code of ['USAGE_LIMIT', 'REOPENED', '', null, undefined]) expect(safetyPause(code)).toBe(false)
  })

  it('says why each one waits', () => {
    expect(safetyPauseText('SAFETY_CHECK_STOPPED', 'You stopped the safety check.')).toBe('You stopped the safety check. Reports wait until it passes.')
    expect(safetyPauseText('SAFETY_CHECK_UNFINISHED', 'The check couldn’t finish: you hit your usage limit')).toBe('The safety check couldn’t finish: you hit your usage limit.')
    expect(safetyPauseText('SAFETY_CHECK_UNFINISHED', "The check couldn't finish: Claude Code is signed out.")).toBe('The safety check couldn’t finish: Claude Code is signed out.')
    expect(safetyPauseText('SAFETY_CHECK_UNFINISHED', 'The check stopped unexpectedly.')).toBe('The safety check couldn’t finish: The check stopped unexpectedly.')
    expect(safetyPauseText('SAFETY_CHECK_UNFINISHED', '')).toBe('The safety check couldn’t finish: it stopped part way.')
    // A failed check: this session's reason, else the engine's message.
    expect(safetyPauseText('LOCKDOWN_FAILED', 'Claude Code is blocked.', 'It read a file')).toBe('It read a file.')
    expect(safetyPauseText('LOCKDOWN_FAILED', 'Claude Code is blocked.')).toBe('Claude Code is blocked.')
    expect(safetyPauseText('LOCKDOWN_FAILED', '', null)).toBe('The safety check didn’t pass.')
  })

  it('waits for the check only with reports waiting, none written, and nothing else holding the line', () => {
    const waiting = state({ waiting: [item('NVDA')] })
    expect(waitsForCheck(waiting, true)).toBe(true)
    expect(waitsForCheck(waiting, false)).toBe(false)
    expect(waitsForCheck(null, true)).toBe(false)
    expect(waitsForCheck(state(), true)).toBe(false)
    expect(waitsForCheck(state({ waiting: [item('NVDA')], writing: item('AAPL') }), true)).toBe(false)
    expect(waitsForCheck(state({ waiting: [item('NVDA')], paused: pause('SAFETY_CHECK_STOPPED') }), true)).toBe(true)
    expect(waitsForCheck(state({ waiting: [item('NVDA')], paused: pause('USAGE_LIMIT') }), true)).toBe(false)
    expect(waitsForCheck(state({ waiting: [item('NVDA')], paused: pause('LOCKDOWN_FAILED') }), true)).toBe(false)
  })
})
