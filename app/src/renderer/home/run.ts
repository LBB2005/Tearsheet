// Pure logic for the run view (RunView.tsx, "Receipt", Liam's pick of 7 Nov 2026): which step a
// run is on, the toolbar's title, the five stages with what each has done in plain words, their
// times, the calls under way, and the Done card. The live counts come from the engine's tally
// (protocol Tally), the steps from its progress notes; the times are the app's own clock.

import { about, calls, clock, noteStep, parallelOf, usualTimes, type StepTimes } from '../../shared/pace'
import type { Tally } from '../../shared/protocol'
import { REPORT_STEPS, stepsBehind, type StepStates } from '../../shared/steps'

export interface RunFailure {
  message: string
  code: string
  resetAt?: string | null
  fix?: string | null
  // The step the engine says the run stopped at (run_failed's `step`), if it named one.
  step?: string | null
}

// What the engine's notes have said about a run so far.
export interface RunNotes {
  steps: StepStates
  times: StepTimes
  tally: Tally | null
  // When each call under way (the tally's `now`) was first seen, by the app's clock.
  seen: Record<string, number>
  // When the run began, by the app's clock: its first note, or the start if none came first.
  startedAt: number
}

export interface RunState extends RunNotes {
  runId: string
  // The company the engine resolved in step 1 (run_report's answer).
  ticker: string | null
  name: string | null
  reportId: string | null
  // When the report was ready, by the app's clock.
  readyAt?: number | null
  failure: RunFailure | null
}

export const TOTAL = REPORT_STEPS.length

export const freshNotes = (at: number): RunNotes => ({ steps: {}, times: {}, tally: null, seen: {}, startedAt: at })

// One of the engine's notes (progress, run_tally) added to what is known of a run.
export function withNote<R extends RunNotes>(r: R, method: string, params: Record<string, unknown>, at: number): R {
  if (method === 'progress') {
    const step = String(params.step_name)
    const state = String(params.state)
    return { ...r, steps: { ...r.steps, [step]: state }, times: noteStep(r.times, step, state, at) }
  }
  if (method === 'run_tally' && params.tally) {
    const tally = params.tally as Tally
    const seen = { ...r.seen }
    for (const name of tally.now ?? []) if (seen[name] === undefined) seen[name] = at
    return { ...r, tally, seen }
  }
  return r
}

// The step the run is on (0–13), or 14 once the report is ready. A stopped run is at the step
// the engine names: after a usage limit the pipeline still fills in the numbers, checks and
// saves the report so far, so the furthest step done would say 14. A stopped run is never ready.
export function runStep(run: RunState, ready: boolean): number {
  if (run.failure) {
    const at = REPORT_STEPS.indexOf(run.failure.step as (typeof REPORT_STEPS)[number])
    if (at >= 0) return at
  } else if (ready && run.reportId) return TOTAL
  return Math.min(stepsBehind(run.steps), TOTAL - 1)
}

// ---------- the five stages ----------

export const STAGES = [
  { name: 'Data', from: 0, to: 4, stopped: 'Stopped while downloading the data' },
  { name: 'Numbers', from: 4, to: 8, stopped: 'Stopped while working out the numbers' },
  { name: 'Evidence', from: 8, to: 10, stopped: 'Stopped while reading the sources' },
  { name: 'Writing', from: 10, to: 12, stopped: 'Stopped while writing' },
  { name: 'Checks', from: 12, to: 14, stopped: 'Stopped while checking' }
] as const

// Done (d), under way (now), where a stopped run stopped (x), or not reached (w).
export type StageMark = 'd' | 'now' | 'x' | 'w'

export function stageOf(step: number): number {
  return Math.max(0, STAGES.findIndex((s) => step >= s.from && step < s.to))
}

export function stageMark(run: RunState, ready: boolean, k: number): StageMark {
  const at = runStep(run, ready)
  const { from, to } = STAGES[k]
  if (at >= to) return 'd'
  if (at >= from) return run.failure ? 'x' : 'now'
  // After a stop, the steps that ran on (the report so far) count as done.
  return run.failure && stepsBehind(run.steps) >= to ? 'd' : 'w'
}

function stageStart(run: RunState, k: number): number | undefined {
  const { from, to } = STAGES[k]
  for (let j = from; j < to; j++) {
    const at = run.times[REPORT_STEPS[j]]?.started
    if (at !== undefined) return at
  }
  return k === 0 ? run.startedAt : undefined
}

function stageEnd(run: RunState, k: number): number | undefined {
  const next = k + 1 < STAGES.length ? stageStart(run, k + 1) : (run.readyAt ?? undefined)
  if (next !== undefined) return next
  let end: number | undefined
  for (let j = STAGES[k].from; j < STAGES[k].to; j++) {
    const done = run.times[REPORT_STEPS[j]]?.done
    if (done !== undefined) end = Math.max(end ?? done, done)
  }
  return end
}

// A stage's time: how long it took, or how long it has taken so far.
export function stageTime(run: RunState, ready: boolean, k: number, now: number): string {
  const mark = stageMark(run, ready, k)
  const start = stageStart(run, k)
  if (start === undefined) return ''
  if (mark === 'now') return clock(now - start)
  const end = mark === 'd' ? stageEnd(run, k) : undefined
  if (end === undefined) return ''
  const ms = Math.max(0, end - start)
  return ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} s` : clock(ms)
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const ordinal = (n: number) => {
  const r = n % 100
  return `${n}${r >= 11 && r <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`
}
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const writerOf = (t: Tally | null) => t?.writer ?? 'the AI tool'
const checkerOf = (t: Tally | null) => t?.checker ?? `a fresh ${writerOf(t)} session`

// What a stage has done, in plain words, or for one not reached yet, how long it usually takes.
export function stageLine(run: RunState, ready: boolean, k: number): string {
  const mark = stageMark(run, ready, k)
  const t = run.tally
  if (mark === 'w') {
    const usual = usualTimes(t)
    const secs = REPORT_STEPS.slice(STAGES[k].from, STAGES[k].to).reduce((sum, s) => sum + usual[s], 0)
    return `Usually ${about(secs)}`
  }
  if (k === 0) {
    const parts: string[] = []
    const companies = t?.companies ?? null
    if (t?.prices && companies) parts.push(`prices for ${plural(companies, 'company', 'companies')}`)
    if (t?.facts && companies) parts.push(`SEC figures for ${t.facts} of ${companies}`)
    if (t?.filings) parts.push(plural(t.filings, 'filing'))
    if (t?.rates) parts.push('Treasury yields')
    if (t?.insider != null) parts.push(plural(t.insider, 'insider trade'))
    if (parts.length) return capital(parts.join(' · '))
    return companies ? `Found ${run.name ?? run.ticker ?? 'the company'} and ${plural(companies - 1, 'peer')}` : 'Finding the company and its peers'
  }
  if (k === 1) {
    if (mark !== 'd') return 'Working out the numbers'
    return t?.score != null ? `Metrics, peer score (${ordinal(Math.round(t.score))} percentile) and value worked out` : 'Metrics, peer score and value worked out'
  }
  if (k === 2) {
    const parts: string[] = []
    const reads = calls(t, 'extract')
    // No articles yet is "Finding recent news" until the reading starts.
    if (t?.articles != null && (t.articles > 0 || reads)) parts.push(plural(t.articles, 'recent article'))
    if (reads) parts.push(`${reads.done} of ${reads.total} AI reads done`)
    if (t?.evidence) parts.push(plural(t.evidence, 'piece of evidence', 'pieces of evidence'))
    return parts.length ? capital(parts.join(' · ')) : 'Finding recent news'
  }
  if (k === 3) {
    const done = calls(t, 'narrate')
    return done ? `${done.done} of ${plural(done.total, 'section')} written by ${writerOf(t)}` : `Writing with ${writerOf(t)}`
  }
  const done = calls(t, 'verify')
  const kept = t?.claims_kept ?? 0
  const removed = t?.claims_removed ?? 0
  const claims = kept + removed > 0 ? ` · ${plural(kept, 'claim')} kept, ${removed} removed` : ''
  return (done ? `${done.done} of ${plural(done.total, 'section')} checked by ${checkerOf(t)}` : `Checking with ${checkerOf(t)}`) + claims
}

const FETCHING: Record<string, string> = {
  prices: 'Bringing prices up to date',
  filings: 'The company’s latest filings',
  'peer filings': 'Peers’ annual reports',
  rates: 'Treasury yields from FRED',
  'insider trades': 'Insider trades (Form 4)'
}

export interface LiveRow {
  name: string
  // 0–1 for its bar, or null for no bar.
  frac: number | null
}

// What the stage under way is doing now: one row while data downloads, else a row per AI
// call under way, each with its bar (its time so far against a call's usual time).
export function liveRows(run: RunState, ready: boolean, now: number): LiveRow[] {
  if (run.failure) return []
  const at = runStep(run, ready)
  if (at >= TOTAL) return []
  const step = REPORT_STEPS[at]
  const t = run.tally
  if (step === 'resolve') return [{ name: 'Finding the company and its peers', frac: null }]
  if (step === 'fetch') {
    if (t?.fetching === 'facts') return [{ name: `SEC figures, ${t.facts ?? 0} of ${t.companies ?? 0} companies`, frac: t.companies ? (t.facts ?? 0) / t.companies : null }]
    return [{ name: FETCHING[t?.fetching ?? ''] ?? 'Starting the downloads', frac: null }]
  }
  if (step === 'normalize' || step === 'text') return [{ name: 'Splitting the filings into sections', frac: null }]
  if (step === 'news') return [{ name: 'Finding recent news', frac: null }]
  const counted = calls(t, step)
  if (!counted || !t?.now?.length) return []
  const item = (usualTimes(t)[step] * parallelOf(t)) / counted.total
  return t.now.map((name) => {
    const since = run.seen[name]
    return { name, frac: since === undefined || item <= 0 ? 0 : Math.min(0.9, Math.max(0, (now - since) / 1000) / item) }
  })
}

// The Done card: how long the run took, the claims kept, and the rating.
export function doneFacts(run: RunState): { took: string; claims: string | null; rating: string | null } {
  const t = run.tally
  const took = clock((run.readyAt ?? run.startedAt) - run.startedAt)
  const claims = t?.claims_kept != null ? `${plural(t.claims_kept, 'claim')} kept · ${t.claims_removed ?? 0} removed by ${checkerOf(t)}` : null
  const rating = t?.rating ? `Rated ${t.rating}` : t?.score != null ? 'Rating withheld' : null
  return { took, claims, rating }
}

// The toolbar's title and subtitle while the run view shows; `left` is "about 3 min left".
export function runTitle(run: RunState, ready: boolean, left: string): { title: string; subtitle: string } {
  const title = run.name ?? run.ticker ?? 'New report'
  const k = runStep(run, ready)
  if (k === TOTAL) return { title, subtitle: 'The report is ready' }
  if (run.failure) return { title, subtitle: STAGES[stageOf(k)].stopped }
  return { title, subtitle: `Writing the report, ${left}` }
}

// What a start or a resume refused while past predictions are graded says.
export const GRADING_FIRST = 'Tearsheet is grading past predictions first. Try again in a few minutes.'

// What a start or a resume refused while a company's full price history downloads says.
export const HISTORY_FIRST = 'Tearsheet is downloading a price history for the chart. Try again in a minute.'

// What a start refused while the safety check runs says: the report joins the line instead.
export const CHECK_FIRST = 'The safety check is running. The report joins the line.'

// Why a start or a resume was refused, as a plain line: grading, a history download or the
// safety check first, another run (or a cancelled one still stopping), else the engine's own
// sentence.
export function refusal(code: string | undefined, message: string | undefined, stopping: boolean): string {
  if (code === 'GRADING_IN_PROGRESS') return GRADING_FIRST
  if (code === 'HISTORY_DOWNLOADING') return HISTORY_FIRST
  if (code === 'SAFETY_CHECK_RUNNING') return CHECK_FIRST
  if (code === 'RUN_IN_PROGRESS') {
    return stopping ? 'The cancelled report is still stopping. Try again in a minute.' : 'A report is already running. You can start another when it finishes.'
  }
  return message || 'The report didn’t start.'
}
