import { describe, expect, it } from 'vitest'

import type { CompanyRow, Grade, PredictionSummary } from '../../shared/protocol'
import { greeting, shortName, sinceLines, type SinceInput } from './since'

const NOW = new Date(2026, 10, 6, 9, 30) // Fri Nov 6, 2026, the morning after the Nov 5 close

const company = (ticker: string, name: string, cik: number, priceDate: string | null = '2026-11-05'): CompanyRow => ({
  cik,
  ticker,
  name,
  report_id: `rep-${ticker}`,
  report_date: '2026-11-05',
  reports: 1,
  price: priceDate ? 100 : null,
  price_date: priceDate
})

const grade = (months: number): Grade => ({
  horizon_months: months,
  graded_at: '2027-02-06T00:00:00+00:00',
  grading_version: 1,
  start_price: 100,
  hit: true,
  excess: 0.01,
  company_return: 0.02,
  end_date: null,
  inside_range: null
})

const prediction = (ticker: string, cik: number, runAt: string, graded: number[] = []): PredictionSummary => ({
  prediction_id: `p-${ticker}-${runAt}`,
  cik,
  ticker,
  run_at: runAt,
  rating: 'Buy',
  bear: 1,
  base: 2,
  bull: 3,
  grades: graded.map(grade)
})

const NVDA = company('NVDA', 'NVIDIA CORP', 1045810)
const AAPL = company('AAPL', 'Apple Inc.', 320193)

const input = (over: Partial<SinceInput> = {}): SinceInput => ({
  companies: [NVDA, AAPL],
  predictions: [],
  keys: { massive: 'set', fred: 'set' },
  fredSkipped: false,
  tool: { name: 'Claude Code', signedOut: false, safetyFailed: false },
  now: NOW,
  ...over
})

describe('sinceLines', () => {
  it('says to which close the prices are up to date, for the companies and their peers', () => {
    expect(sinceLines(input())).toEqual([{ tone: 'up', text: 'Prices are up to date to the Nov 5 close, for your 2 companies and their peers.' }])
  })

  it('counts one company in the singular', () => {
    expect(sinceLines(input({ companies: [NVDA] }))[0].text).toBe('Prices are up to date to the Nov 5 close, for your company and its peers.')
  })

  it('gives the oldest close, so the line holds for every company', () => {
    const older = company('JPM', 'JPMORGAN CHASE & CO', 19617, '2026-11-04')
    expect(sinceLines(input({ companies: [NVDA, older], now: new Date(2026, 10, 5, 20) }))[0].text).toBe('Prices are up to date to the Nov 4 close, for your 2 companies and their peers.')
  })

  it('leaves out companies with no stored price', () => {
    const none = company('JPM', 'JPMORGAN CHASE & CO', 19617, null)
    expect(sinceLines(input({ companies: [NVDA, none] }))[0].text).toBe('Prices are up to date to the Nov 5 close, for your company and its peers.')
    expect(sinceLines(input({ companies: [none] }))).toEqual([])
  })

  it('counts a Friday close as up to date over the weekend and on Monday', () => {
    const friday = company('NVDA', 'NVIDIA CORP', 1045810, '2026-11-06')
    for (const day of [7, 8, 9]) {
      expect(sinceLines(input({ companies: [friday], now: new Date(2026, 10, day, 10) }))[0].tone).toBe('up')
    }
    // By Tuesday, Monday's close is out.
    expect(sinceLines(input({ companies: [friday], now: new Date(2026, 10, 10, 10) }))[0].tone).toBe('hold')
  })

  it('says plainly when the prices are behind', () => {
    const old = company('NVDA', 'NVIDIA CORP', 1045810, '2026-10-01')
    expect(sinceLines(input({ companies: [old, { ...AAPL, price_date: '2026-10-01' }] }))).toEqual([
      { tone: 'hold', text: 'The latest prices are from the Oct 1 close, for your 2 companies and their peers.' }
    ])
  })

  it('gives the next grade due, three months after the report', () => {
    const lines = sinceLines(input({ predictions: [prediction('NVDA', 1045810, '2026-11-05T19:55:10+00:00')] }))
    expect(lines[1]).toEqual({ tone: 'accent', text: 'NVIDIA’s first grade is due Feb 5, 2027, three months after its report.' })
  })

  it('gives the second and third grades once the earlier ones are in', () => {
    const second = sinceLines(input({ predictions: [prediction('NVDA', 1045810, '2026-11-05T19:55:10+00:00', [3])], now: new Date(2027, 1, 8) }))
    expect(second[1].text).toBe('NVIDIA’s second grade is due May 5, six months after its report.')
    const third = sinceLines(input({ predictions: [prediction('NVDA', 1045810, '2026-11-05T19:55:10+00:00', [3, 6])], now: new Date(2027, 4, 8) }))
    expect(third[1].text).toBe('NVIDIA’s third grade is due Nov 5, a year after its report.')
  })

  it('picks the soonest grade across every prediction', () => {
    const lines = sinceLines(
      input({
        predictions: [prediction('NVDA', 1045810, '2026-11-05T19:55:10+00:00'), prediction('AAPL', 320193, '2026-09-20T15:00:00+00:00')]
      })
    )
    expect(lines[1].text).toBe('Apple’s first grade is due Dec 20, three months after its report.')
  })

  it('passes over a grade whose date has gone by, and ends the month like the engine', () => {
    // Aug 31 + 3 months is Nov 30 (gone by on Dec 2); + 6 months is the end of February.
    const lines = sinceLines(input({ predictions: [prediction('NVDA', 1045810, '2026-08-31T15:00:00+00:00')], now: new Date(2026, 11, 2) }))
    expect(lines[1].text).toBe('NVIDIA’s second grade is due Feb 28, 2027, six months after its report.')
  })

  it('has no grade line once every grade is in, and uses the ticker for a company not listed', () => {
    expect(sinceLines(input({ predictions: [prediction('NVDA', 1045810, '2026-11-05T19:55:10+00:00', [3, 6, 12])] }))).toHaveLength(1)
    const lines = sinceLines(input({ companies: [], predictions: [prediction('MSFT', 789019, '2026-11-05T19:55:10+00:00')] }))
    expect(lines).toEqual([{ tone: 'accent', text: 'MSFT’s first grade is due Feb 5, 2027, three months after its report.' }])
  })

  it('says economic figures aren’t connected, with the fix, while there is no FRED key', () => {
    const fred = { tone: 'hold', text: 'Economic figures aren’t connected, so reports leave them out.', action: 'addFred' }
    expect(sinceLines(input({ keys: { massive: 'set', fred: 'missing' }, fredSkipped: true }))).toContainEqual(fred)
    expect(sinceLines(input({ keys: { massive: 'set' }, fredSkipped: false }))).toContainEqual(fred)
  })

  it('has no FRED line when the key is set', () => {
    expect(sinceLines(input()).some((l) => l.text.startsWith('Economic figures'))).toBe(false)
  })

  it('puts a signed-out tool first, as a problem with its fix', () => {
    const lines = sinceLines(input({ tool: { name: 'Claude Code', signedOut: true, safetyFailed: false } }))
    expect(lines[0]).toEqual({
      tone: 'down',
      text: 'Claude Code is signed out',
      detail: 'New reports can’t be written until you sign in again. Your saved reports still open.',
      action: 'signIn'
    })
  })

  it('makes a failed safety check a problem too', () => {
    const lines = sinceLines(input({ tool: { name: 'Codex', signedOut: false, safetyFailed: true } }))
    expect(lines[0]).toEqual({
      tone: 'down',
      text: 'Codex didn’t pass the safety check',
      detail: 'New reports can’t be written until it passes. Your saved reports still open.',
      action: 'recheck'
    })
  })

  it('says, without alarm, that a stopped safety check didn’t finish', () => {
    const lines = sinceLines(input({ tool: { name: 'Claude Code', signedOut: false, safetyFailed: false, safetyUnfinished: true } }))
    expect(lines[0]).toEqual({
      tone: 'muted',
      text: 'Claude Code’s safety check didn’t finish',
      detail: 'It runs again by itself before the next report, or you can run it now.',
      action: 'recheck'
    })
    expect(lines.some((l) => l.tone === 'down')).toBe(false)
  })

  it('makes a missing Massive key a problem, with the fix', () => {
    expect(sinceLines(input({ keys: { massive: 'missing', fred: 'set' } }))[0]).toEqual({
      tone: 'down',
      text: 'Prices aren’t connected, so new reports can’t be rated',
      detail: 'Add your Massive key in Settings. Your saved reports still open.',
      action: 'addMassive'
    })
    // Not yet known is not missing.
    expect(sinceLines(input({ keys: { fred: 'set' } })).some((l) => l.action === 'addMassive')).toBe(false)
  })

  it('orders problems, then prices, the next grade and anything not connected', () => {
    const lines = sinceLines(
      input({
        predictions: [prediction('NVDA', 1045810, '2026-11-05T19:55:10+00:00')],
        keys: { massive: 'missing', fred: 'missing' },
        tool: { name: 'Claude Code', signedOut: true, safetyFailed: true }
      })
    )
    expect(lines.map((l) => l.action ?? l.tone)).toEqual(['signIn', 'recheck', 'addMassive', 'up', 'accent', 'addFred'])
  })
})

describe('shortName', () => {
  it('drops the legal ending from a company’s name', () => {
    expect(shortName('NVIDIA CORP')).toBe('NVIDIA')
    expect(shortName('Apple Inc.')).toBe('Apple')
    expect(shortName('JPMORGAN CHASE & CO')).toBe('JPMORGAN CHASE')
    expect(shortName('Nike, Inc.')).toBe('Nike')
  })

  it('keeps names with no legal ending, and never empties a name', () => {
    expect(shortName('Walt Disney Company (The)')).toBe('Walt Disney Company (The)')
    expect(shortName('The Hershey Company')).toBe('The Hershey Company')
    expect(shortName('Inc.')).toBe('Inc.')
  })
})

describe('greeting', () => {
  it('welcomes a new user, whatever the time', () => {
    expect(greeting(new Date(2026, 10, 6, 9), true)).toBe('Welcome to Tearsheet')
    expect(greeting(new Date(2026, 10, 6, 20), true)).toBe('Welcome to Tearsheet')
  })

  it('says good morning before 12, good afternoon before 18, and good evening after', () => {
    expect(greeting(new Date(2026, 10, 6, 0, 0), false)).toBe('Good morning')
    expect(greeting(new Date(2026, 10, 6, 11, 59), false)).toBe('Good morning')
    expect(greeting(new Date(2026, 10, 6, 12, 0), false)).toBe('Good afternoon')
    expect(greeting(new Date(2026, 10, 6, 17, 59), false)).toBe('Good afternoon')
    expect(greeting(new Date(2026, 10, 6, 18, 0), false)).toBe('Good evening')
    expect(greeting(new Date(2026, 10, 6, 23, 59), false)).toBe('Good evening')
  })
})

describe('a key that stops working', () => {
  it('puts a refused Massive key in the red box, with the fix', () => {
    const lines = sinceLines(input({ rejected: ['massive'] }))
    expect(lines[0]).toEqual({
      tone: 'down',
      text: 'Massive stopped accepting your key',
      detail: 'New reports can’t be rated until you replace it in Settings. Your saved reports still open.',
      action: 'replaceMassive'
    })
  })

  it('says a refused FRED key leaves the economic figures out, as a missing one does', () => {
    const lines = sinceLines(input({ rejected: ['fred'] }))
    expect(lines.filter((l) => l.tone === 'down')).toEqual([])
    expect(lines).toContainEqual({ tone: 'hold', text: 'FRED stopped accepting your key, so reports leave the economic figures out.', action: 'addFred' })
    expect(lines.some((l) => l.text.startsWith('Economic figures aren’t connected'))).toBe(false)
  })

  it('says nothing when no key was refused', () => {
    expect(sinceLines(input({ rejected: [] }))).toEqual(sinceLines(input()))
  })
})

describe('a key macOS wouldn’t hand over', () => {
  it('says how to let the Massive key through, not to add one', () => {
    const lines = sinceLines(input({ keys: { massive: 'locked', fred: 'set' } }))
    expect(lines[0]).toEqual({
      tone: 'down',
      text: 'macOS didn’t let Tearsheet open your Massive key',
      detail: 'New reports can’t be rated until it does. Quit Tearsheet, open it again, and click Always Allow when macOS asks.'
    })
    expect(lines.some((l) => l.text.startsWith('Prices aren’t connected'))).toBe(false)
  })

  it('says the same of the FRED key, as a warning', () => {
    const lines = sinceLines(input({ keys: { massive: 'set', fred: 'locked' } }))
    expect(lines).toContainEqual({ tone: 'hold', text: 'macOS didn’t let Tearsheet open your FRED key, so reports leave the economic figures out. Quit Tearsheet, open it again, and click Always Allow.' })
    expect(lines.some((l) => l.text.startsWith('Economic figures aren’t connected'))).toBe(false)
  })
})
