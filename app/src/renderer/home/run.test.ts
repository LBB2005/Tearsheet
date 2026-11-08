import { describe, expect, it } from 'vitest'

import type { Tally } from '../../shared/protocol'
import { REPORT_STEPS } from '../../shared/steps'
import { doneFacts, freshNotes, GRADING_FIRST, HISTORY_FIRST, liveRows, refusal, runStep, runTitle, stageLine, stageMark, stageOf, stageTime, STAGES, withNote, type RunState } from './run'

// The first `n` steps done, and the next one started.
function stepsDone(n: number): Record<string, string> {
  const states: Record<string, string> = {}
  REPORT_STEPS.forEach((step, i) => {
    if (i < n) states[step] = 'done'
    else if (i === n) states[step] = 'started'
  })
  return states
}

const T0 = 1_000_000
const sec = (s: number) => T0 + s * 1000

const run = (over: Partial<RunState> = {}): RunState => ({ runId: 'run-1', ticker: 'JPM', name: 'JPMorgan Chase', ...freshNotes(T0), reportId: null, failure: null, ...over })
const tally = (over: Partial<Tally> = {}): Tally => ({ writer: 'Claude Code', checker: 'Codex', ...over })

// A usage limit during narrate: the pipeline still fills in the numbers, checks and saves the
// report so far (each step done), then the engine says the run stopped at narrate.
const usageLimit = (): RunState =>
  run({
    steps: stepsDone(14),
    reportId: 'rep-1',
    failure: { message: 'You’ve hit your limit.', code: 'USAGE_LIMIT', resetAt: null, fix: null, step: 'narrate' }
  })

// Each step started and finished on these seconds from the start: the run of 7 Nov 2026.
const AT: Record<string, [number, number]> = {
  resolve: [0, 1],
  fetch: [1, 101],
  normalize: [101, 101.2],
  text: [101.2, 101.4],
  metrics: [101.4, 101.6],
  score: [101.6, 101.8],
  value: [101.8, 102],
  rate: [102, 102.2],
  news: [102.2, 112],
  extract: [112, 232],
  narrate: [232, 249],
  render: [249, 249.1],
  verify: [249.1, 291],
  save: [291, 291.2]
}

// What the notes say by `t` seconds in.
function notesAt(t: number, extra: Partial<Tally> = {}): RunState {
  let r = run({ tally: tally(extra) })
  for (const step of REPORT_STEPS) {
    const [s, e] = AT[step]
    if (s <= t) r = withNote(r, 'progress', { step_name: step, state: 'started' }, sec(s))
    if (e <= t) r = withNote(r, 'progress', { step_name: step, state: 'done' }, sec(e))
  }
  return r
}

describe('withNote', () => {
  it('keeps the steps and when each started and finished', () => {
    let r = run()
    r = withNote(r, 'progress', { step_name: 'resolve', state: 'started' }, sec(0))
    r = withNote(r, 'progress', { step_name: 'resolve', state: 'done' }, sec(1))
    r = withNote(r, 'progress', { step_name: 'fetch', state: 'started' }, sec(1))
    expect(r.steps).toEqual({ resolve: 'done', fetch: 'started' })
    expect(r.times).toEqual({ resolve: { started: sec(0), done: sec(1) }, fetch: { started: sec(1) } })
  })

  it('keeps the latest tally, and when each call under way was first seen', () => {
    let r = run()
    r = withNote(r, 'run_tally', { tally: tally({ reads_total: 23, reads_done: 0, now: ['A', 'B'] }) }, sec(112))
    r = withNote(r, 'run_tally', { tally: tally({ reads_total: 23, reads_done: 1, now: ['B', 'C'] }) }, sec(120))
    expect(r.tally?.reads_done).toBe(1)
    expect(r.seen).toEqual({ A: sec(112), B: sec(112), C: sec(120) })
  })

  it('leaves the run as it is for other notes, or a tally note without a tally', () => {
    const r = run()
    expect(withNote(r, 'hello', {}, sec(0))).toBe(r)
    expect(withNote(r, 'run_tally', {}, sec(0))).toBe(r)
  })
})

describe('runStep', () => {
  it('counts the step being worked on, never past the last', () => {
    expect(runStep(run(), false)).toBe(0)
    expect(runStep(run({ steps: stepsDone(8) }), false)).toBe(8)
    expect(runStep(run({ steps: stepsDone(14) }), false)).toBe(13)
  })

  it('is past the last step once the report is ready', () => {
    expect(runStep(run({ steps: stepsDone(14), reportId: 'rep-1' }), true)).toBe(14)
  })

  it('puts a stopped run at the step the engine says it stopped at, never ready', () => {
    expect(runStep(usageLimit(), false)).toBe(REPORT_STEPS.indexOf('narrate'))
    expect(runStep(usageLimit(), true)).toBe(REPORT_STEPS.indexOf('narrate'))
  })

  it('falls back to the furthest step when the engine names none', () => {
    const stopped = run({ steps: stepsDone(5), failure: { message: 'The engine stopped.', code: 'ENGINE_ERROR', step: null } })
    expect(runStep(stopped, false)).toBe(5)
  })
})

describe('runTitle', () => {
  it('names the company the engine resolved, with the time left', () => {
    expect(runTitle(run({ steps: stepsDone(8) }), false, 'about 3 min left')).toEqual({ title: 'JPMorgan Chase', subtitle: 'Writing the report, about 3 min left' })
  })

  it('says, in plain words, where a stopped run stopped', () => {
    expect(runTitle(usageLimit(), true, 'x').subtitle).toBe('Stopped while writing')
    const atFetch = run({ steps: stepsDone(1), failure: { message: 'Network down.', code: 'ENGINE_ERROR', step: 'fetch' } })
    expect(runTitle(atFetch, false, 'x').subtitle).toBe('Stopped while downloading the data')
  })

  it('says when the report is ready', () => {
    expect(runTitle(run({ steps: stepsDone(14), reportId: 'rep-1' }), true, 'x').subtitle).toBe('The report is ready')
  })

  it('falls back to the ticker, then to New report', () => {
    expect(runTitle(run({ name: null }), false, 'x').title).toBe('JPM')
    expect(runTitle(run({ name: null, ticker: null }), false, 'x').title).toBe('New report')
  })
})

describe('the five stages', () => {
  it('cover the 14 steps in order', () => {
    expect(STAGES.map((s) => s.name)).toEqual(['Data', 'Numbers', 'Evidence', 'Writing', 'Checks'])
    expect(STAGES[0].from).toBe(0)
    STAGES.forEach((s, k) => k > 0 && expect(s.from).toBe(STAGES[k - 1].to))
    expect(STAGES[4].to).toBe(14)
    expect(stageOf(REPORT_STEPS.indexOf('verify'))).toBe(4)
  })

  it('mark the stages done, under way and not reached', () => {
    const r = notesAt(150)
    expect([0, 1, 2, 3, 4].map((k) => stageMark(r, false, k))).toEqual(['d', 'd', 'now', 'w', 'w'])
    const ready = { ...notesAt(292), reportId: 'rep-1' }
    expect([0, 1, 2, 3, 4].map((k) => stageMark(ready, true, k))).toEqual(['d', 'd', 'd', 'd', 'd'])
  })

  it('mark where a stopped run stopped, and the stages that ran on after it as done', () => {
    expect([0, 1, 2, 3, 4].map((k) => stageMark(usageLimit(), false, k))).toEqual(['d', 'd', 'd', 'x', 'd'])
    const early = run({ steps: stepsDone(10), failure: { message: 'Signed out.', code: 'AUTH_EXPIRED', step: 'narrate' } })
    expect(stageMark(early, false, 4)).toBe('w')
  })

  it('time each stage: how long it took, or has taken so far', () => {
    const r = notesAt(150)
    expect(stageTime(r, false, 0, sec(150))).toBe('1:41')
    expect(stageTime(r, false, 1, sec(150))).toBe('1 s')
    expect(stageTime(r, false, 2, sec(150))).toBe('0:47')
    expect(stageTime(r, false, 3, sec(150))).toBe('')
    const ready = { ...notesAt(292), reportId: 'rep-1', readyAt: sec(292) }
    expect(stageTime(ready, true, 4, sec(300))).toBe('43 s')
  })

  it('say how long a stage not reached usually takes', () => {
    const r = notesAt(50)
    expect(stageLine(r, false, 1)).toBe('Usually about a second')
    expect(stageLine(r, false, 2)).toBe('Usually about 2 min')
    expect(stageLine(r, false, 4)).toBe('Usually about 45 s')
    // From the engine's usual times once it has some.
    expect(stageLine(notesAt(50, { typical: { verify: 70 } }), false, 4)).toBe('Usually about a minute')
  })

  it('write down what the data stage has downloaded', () => {
    expect(stageLine(run(), false, 0)).toBe('Finding the company and its peers')
    expect(stageLine(notesAt(5, { companies: 9, fetching: 'prices' }), false, 0)).toBe('Found JPMorgan Chase and 8 peers')
    const most = notesAt(95, { companies: 9, prices: true, facts: 9, filings: 13, rates: true, insider: 30 })
    expect(stageLine(most, false, 0)).toBe('Prices for 9 companies · SEC figures for 9 of 9 · 13 filings · Treasury yields · 30 insider trades')
    expect(stageLine(notesAt(95, { companies: 2, prices: true, filings: 1, insider: 1 }), false, 0)).toBe('Prices for 2 companies · 1 filing · 1 insider trade')
  })

  it('give the peer score once the numbers are worked out, and keep the rating for the end', () => {
    expect(stageLine(notesAt(150, { score: 58.4, rating: 'Hold' }), false, 1)).toBe('Metrics, peer score (58th percentile) and value worked out')
    expect(stageLine(notesAt(150, { score: 71 }), false, 1)).toBe('Metrics, peer score (71st percentile) and value worked out')
    expect(stageLine(notesAt(150, { score: 12 }), false, 1)).toBe('Metrics, peer score (12th percentile) and value worked out')
    expect(stageLine(notesAt(150), false, 1)).toBe('Metrics, peer score and value worked out')
    expect(stageLine(notesAt(101.5), false, 1)).toBe('Working out the numbers')
  })

  it('count the evidence, the writing and the checks', () => {
    expect(stageLine(notesAt(105), false, 2)).toBe('Finding recent news')
    expect(stageLine(notesAt(105, { articles: 0 }), false, 2)).toBe('Finding recent news')
    expect(stageLine(notesAt(115, { articles: 0, reads_total: 6, reads_done: 0 }), false, 2)).toBe('0 recent articles · 0 of 6 AI reads done')
    expect(stageLine(notesAt(150, { articles: 12, reads_total: 23, reads_done: 11, evidence: 52 }), false, 2)).toBe('12 recent articles · 11 of 23 AI reads done · 52 pieces of evidence')
    expect(stageLine(notesAt(240, { sections_total: 6, sections_done: 3 }), false, 3)).toBe('3 of 6 sections written by Claude Code')
    expect(stageLine(notesAt(232.5), false, 3)).toBe('Writing with Claude Code')
    expect(stageLine(notesAt(270, { checks_total: 6, checks_done: 4, claims_kept: 22, claims_removed: 1 }), false, 4)).toBe('4 of 6 sections checked by Codex · 22 claims kept, 1 removed')
    expect(stageLine(notesAt(250, { checker: null }), false, 4)).toBe('Checking with a fresh Claude Code session')
  })
})

describe('liveRows', () => {
  it('names what the data stage is downloading now', () => {
    expect(liveRows(run(), false, sec(0))).toEqual([{ name: 'Finding the company and its peers', frac: null }])
    expect(liveRows(notesAt(5, { fetching: 'prices' }), false, sec(5))).toEqual([{ name: 'Bringing prices up to date', frac: null }])
    expect(liveRows(notesAt(30, { fetching: 'facts', facts: 3, companies: 9 }), false, sec(30))).toEqual([{ name: 'SEC figures, 3 of 9 companies', frac: 1 / 3 }])
    expect(liveRows(notesAt(70, { fetching: 'peer filings' }), false, sec(70))[0].name).toBe('Peers’ annual reports')
    expect(liveRows(notesAt(2), false, sec(2))[0].name).toBe('Starting the downloads')
    expect(liveRows(notesAt(101.3), false, sec(101.3))[0].name).toBe('Splitting the filings into sections')
    expect(liveRows(notesAt(105), false, sec(105))[0].name).toBe('Finding recent news')
  })

  it('gives each AI call under way a bar for its time so far', () => {
    let r = notesAt(112)
    r = withNote(r, 'run_tally', { tally: tally({ reads_total: 23, reads_done: 0, now: ['10-K Item 1A (Risk factors)', 'Reuters: Alphabet beats'] }) }, sec(112))
    const rows = liveRows(r, false, sec(120))
    expect(rows.map((x) => x.name)).toEqual(['10-K Item 1A (Risk factors)', 'Reuters: Alphabet beats'])
    // A read usually takes 120 s × 3 / 23, about 15.7 s: 8 s in is about half.
    expect(rows[0].frac).toBeCloseTo(8 / ((120 * 3) / 23))
    expect(liveRows(r, false, sec(200))[0].frac).toBe(0.9)
  })

  it('shows nothing when no call is under way, for a stopped run, or once ready', () => {
    expect(liveRows(notesAt(150, { reads_total: 23, reads_done: 23, now: [] }), false, sec(150))).toEqual([])
    expect(liveRows(usageLimit(), false, sec(0))).toEqual([])
    expect(liveRows({ ...notesAt(292), reportId: 'rep-1' }, true, sec(292))).toEqual([])
  })
})

describe('doneFacts', () => {
  it('says how long it took, the claims kept and the rating', () => {
    const r = { ...notesAt(292, { claims_kept: 41, claims_removed: 3, rating: 'Hold', score: 58 }), reportId: 'rep-1', readyAt: sec(291.5) }
    expect(doneFacts(r)).toEqual({ took: '4:51', claims: '41 claims kept · 3 removed by Codex', rating: 'Rated Hold' })
  })

  it('says when the rating was withheld, and leaves out what it doesn’t know', () => {
    expect(doneFacts({ ...notesAt(292, { score: 40, rating: null }), readyAt: sec(60) }).rating).toBe('Rating withheld')
    expect(doneFacts(run())).toEqual({ took: '0:00', claims: null, rating: null })
  })
})

describe('refusal', () => {
  it('says plainly why a start or a resume was refused', () => {
    expect(refusal('GRADING_IN_PROGRESS', 'engine words', false)).toBe(GRADING_FIRST)
    expect(refusal('HISTORY_DOWNLOADING', 'engine words', false)).toBe(HISTORY_FIRST)
    expect(HISTORY_FIRST).toBe('Tearsheet is downloading a price history for the chart. Try again in a minute.')
  })

  it('tells a cancelled run still stopping apart from another run', () => {
    expect(refusal('RUN_IN_PROGRESS', 'x', true)).toBe('The cancelled report is still stopping. Try again in a minute.')
    expect(refusal('RUN_IN_PROGRESS', 'x', false)).toBe('A report is already running. You can start another when it finishes.')
  })

  it('gives the engine’s own sentence otherwise, or a fixed one', () => {
    expect(refusal('NOT_COVERED', 'Not in the S&P 500.', false)).toBe('Not in the S&P 500.')
    expect(refusal(undefined, undefined, false)).toBe('The report didn’t start.')
  })
})
