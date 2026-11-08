import { describe, expect, it } from 'vitest'

import { USUAL } from '../../shared/pace'
import type { LineItem, LineState } from '../../shared/protocol'
import { doneCount, inLine, isList, joinNames, lineGoing, linePlace, lineTime, newlyUnstarted, officialNote, outcomeText, splitQueries, usualReport } from './line'

const item = (ticker: string, over: Partial<LineItem> = {}): LineItem => ({ ticker, name: ticker, official: true, run_id: null, outcome: null, report_id: null, code: null, message: null, ...over })
const state = (over: Partial<LineState> = {}): LineState => ({ waiting: [], writing: null, finished: [], paused: null, limit: 10, ...over })

describe('a typed list', () => {
  it('is any text with a comma, semicolon or new line, and names keep their spaces', () => {
    expect(isList('JPM')).toBe(false)
    expect(isList('Bank of America')).toBe(false)
    expect(isList('JPM, O')).toBe(true)
    expect(isList('JPM,')).toBe(true)
    expect(splitQueries(' JPM, Bank of America ;O\nXOM,, ')).toEqual(['JPM', 'Bank of America', 'O', 'XOM'])
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
