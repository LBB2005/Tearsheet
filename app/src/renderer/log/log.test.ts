import { describe, expect, it } from 'vitest'

import type { CallResult } from '../../preload/api'
import type { Grade, GradeResult, PredictionSummary } from '../../shared/protocol'
import { gradeCells, gradedLine, latest, logSubtitle, logTiles, ratingTone } from './log'

const NOW = new Date(2026, 10, 6, 10, 0) // Nov 6, 2026, local time

const grade = (months: number, over: Partial<Grade> = {}): Grade => ({
  horizon_months: months,
  graded_at: '2027-02-06T12:00:00+00:00',
  grading_version: 1,
  start_price: 100,
  hit: true,
  excess: 0.041,
  company_return: 0.12,
  end_date: '2027-02-05',
  inside_range: true,
  ...over
})

const prediction = (ticker: string, runAt: string, grades: Grade[] = []): PredictionSummary => ({
  prediction_id: `p-${ticker}`,
  cik: ticker.length,
  ticker,
  run_at: runAt,
  rating: 'Hold',
  bear: 130.16,
  base: 233.7,
  bull: 419.62,
  grades
})

describe('latest', () => {
  it('keeps each horizon’s grade under the newest grading rules, in horizon order', () => {
    const old6 = grade(6, { grading_version: 1, hit: false })
    const new6 = grade(6, { grading_version: 2, hit: true })
    expect(latest([new6, grade(12), old6, grade(3)])).toEqual([grade(3), new6, grade(12)])
    expect(latest([])).toEqual([])
  })
})

describe('gradeCells', () => {
  it('with nothing graded, gives the first grade’s date', () => {
    expect(gradeCells(prediction('NVDA', '2026-11-05T21:00:00+00:00'), NOW)).toEqual({ graded: [], next: '3-month grade due Feb 5, 2027' })
  })

  it('describes each graded horizon in plain words, then the next one due', () => {
    const p = prediction('NVDA', '2026-08-05T21:00:00+00:00', [grade(3), grade(6, { hit: false, excess: -0.027, inside_range: false })])
    expect(gradeCells(p, new Date(2027, 1, 10))).toEqual({
      graded: [
        { months: 3, label: '3 months', verdict: 'hit', text: 'hit', detail: '+4.1% vs peers, inside the range' },
        { months: 6, label: '6 months', verdict: 'miss', text: 'miss', detail: '−2.7% vs peers, outside the range' }
      ],
      next: '12-month grade due Aug 5'
    })
  })

  it('says when a grade had no peer data or no range, and when every grade is in', () => {
    const p = prediction('NVDA', '2025-08-05T21:00:00+00:00', [grade(3, { hit: null, excess: null, inside_range: null }), grade(6), grade(12, { inside_range: null })])
    const cells = gradeCells(p, NOW)
    expect(cells.graded[0]).toEqual({ months: 3, label: '3 months', verdict: 'none', text: 'no peer data', detail: '' })
    expect(cells.graded[2].detail).toBe('+4.1% vs peers')
    expect(cells.next).toBeNull()
  })

  it('a date gone by is due now: it is graded as the prices come in', () => {
    expect(gradeCells(prediction('AAPL', '2026-08-01T21:00:00+00:00'), NOW).next).toBe('3-month grade due now')
    // Due today still reads as a date, as on the home page.
    expect(gradeCells(prediction('AAPL', '2026-08-06T21:00:00+00:00'), NOW).next).toBe('3-month grade due Nov 6')
  })
})

describe('logTiles', () => {
  it('before anything is logged', () => {
    expect(logTiles([], NOW)).toEqual([
      { big: '0', text: 'predictions logged; each company’s first full report in any 30 days is logged' },
      { big: '0', text: 'graded so far' },
      { big: '3, 6, 12', text: 'months: when each logged prediction is graded' }
    ])
  })

  it('logged but not graded yet: the first grade’s date', () => {
    const t = logTiles([prediction('NVDA', '2026-11-05T21:00:00+00:00'), prediction('AAPL', '2026-10-20T21:00:00+00:00')], NOW)
    expect(t[0]).toEqual({ big: '2', text: 'predictions logged; each company’s first full report in any 30 days is logged' })
    expect(t[1]).toEqual({ big: '0', text: 'graded so far; the first is due Jan 20, 2027' })
  })

  it('logged, with its first grade gone by but not in yet: due now', () => {
    expect(logTiles([prediction('AAPL', '2026-08-01T21:00:00+00:00')], NOW)[1]).toEqual({ big: '0', text: 'graded so far; the first is due now' })
  })

  it('one logged prediction reads in the singular', () => {
    expect(logTiles([prediction('NVDA', '2026-11-05T21:00:00+00:00')], NOW)[0].text).toBe('prediction logged; each company’s first full report in any 30 days is logged')
  })

  it('once graded: how many were hits against the peers, out of those with peer data', () => {
    const t = logTiles(
      [
        prediction('NVDA', '2026-02-05T21:00:00+00:00', [grade(3), grade(6, { hit: false }), grade(6, { grading_version: 0, hit: true })]),
        prediction('AAPL', '2026-07-01T21:00:00+00:00', [grade(3, { hit: null })])
      ],
      NOW
    )
    expect(t[1]).toEqual({ big: '3', text: 'grades so far; 1 of 2 hits against the peers' })
    expect(logTiles([prediction('NVDA', '2026-07-01T21:00:00+00:00', [grade(3, { hit: null })])], NOW)[1]).toEqual({ big: '1', text: 'grade so far; none had peer data' })
  })
})

describe('logSubtitle', () => {
  it('counts what is logged and graded, for the toolbar', () => {
    expect(logSubtitle([])).toBe('Nothing logged yet')
    expect(logSubtitle([prediction('NVDA', '2026-11-05T21:00:00+00:00')])).toBe('1 logged, 0 graded')
    expect(logSubtitle([prediction('NVDA', '2026-02-05T21:00:00+00:00', [grade(3), grade(6)])])).toBe('1 logged, 2 graded')
  })
})

describe('gradedLine', () => {
  const ok = (result: GradeResult): CallResult<GradeResult> => ({ ok: true, result })
  it('says what grading did', () => {
    expect(gradedLine(ok({ graded: 2 }))).toBe('Graded 2 new horizons.')
    expect(gradedLine(ok({ graded: 1 }))).toBe('Graded 1 new horizon.')
    expect(gradedLine(ok({ graded: 0 }))).toBe('Nothing new was due.')
    expect(gradedLine(ok({ graded: 0, note: 'No predictions are logged yet.' }))).toBe('No predictions are logged yet.')
    expect(gradedLine(ok({ graded: 3, note: 'Some prices were missing.' }))).toBe('Graded 3 new horizons. Some prices were missing.')
  })

  it('a report or grading under way: the engine’s own sentence, as a plain line', () => {
    const busy = (code: string, message: string): CallResult<GradeResult> => ({ ok: false, error: { code, message } })
    expect(gradedLine(busy('GRADING_IN_PROGRESS', 'Tearsheet is grading past predictions. Try again in a few minutes.'))).toBe('Tearsheet is grading past predictions. Try again in a few minutes.')
    expect(gradedLine(busy('RUN_IN_PROGRESS', 'A report is already running.'))).toBe('A report is already running.')
    expect(gradedLine(busy('ENGINE_ERROR', 'Massive answered 500.'))).toBe('Grading didn’t finish. Massive answered 500.')
    expect(gradedLine({ ok: false })).toBe('Grading didn’t finish. Tearsheet’s engine didn’t answer.')
    expect(gradedLine(null)).toBe('Grading didn’t finish. Tearsheet’s engine didn’t answer.')
  })
})

describe('ratingTone', () => {
  it('colours the rating as the report does', () => {
    expect(ratingTone('Buy')).toBe('ok')
    expect(ratingTone('Hold')).toBe('hold')
    expect(ratingTone('Sell')).toBe('bad')
    expect(ratingTone('Unrated')).toBe('off')
  })
})
