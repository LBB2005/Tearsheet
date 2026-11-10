// Pure logic for the prediction log (pages/Log.tsx, the spec's "Prediction log"): each
// prediction's grades in plain words, the three tiles, the toolbar's line, and what "Grade what
// is due" says when it finishes. Only real predictions and real grades are described; there are
// no examples.

import type { CallResult } from '../../preload/api'
import type { Grade, GradeResult, PredictionSummary } from '../../shared/protocol'
import { addMonths, HORIZONS, isoDay } from '../home/since'
import { shortDate } from '../nav'
import type { Tone } from '../settings/settings'

// Each horizon's grade under the newest grading rules (older versions stay in the database).
export function latest(grades: Grade[]): Grade[] {
  const by = new Map<number, Grade>()
  for (const g of grades) {
    const seen = by.get(g.horizon_months)
    if (!seen || g.grading_version > seen.grading_version) by.set(g.horizon_months, g)
  }
  return [...by.values()].sort((a, b) => a.horizon_months - b.horizon_months)
}

// "+4.1%", "−2.7%" (a true minus, as the report writes it).
const pct = (v: number) => `${v < 0 ? '−' : '+'}${Math.abs(v * 100).toFixed(1)}%`

export interface GradedHorizon {
  months: number
  label: string
  verdict: 'hit' | 'miss' | 'none'
  // The pill's word.
  text: string
  // Against the peers and the range, when known.
  detail: string
}

function describe(g: Grade): GradedHorizon {
  const verdict = g.hit === null ? 'none' : g.hit ? 'hit' : 'miss'
  const detail = [g.excess === null ? '' : `${pct(g.excess)} vs peers`, g.inside_range === null ? '' : g.inside_range ? 'inside the range' : 'outside the range'].filter(Boolean).join(', ')
  return { months: g.horizon_months, label: `${g.horizon_months} months`, verdict, text: verdict === 'none' ? 'no peer data' : verdict, detail }
}

// The horizons not graded yet, with their due dates (the run's calendar day plus the months, as
// the engine counts them).
function ungraded(p: PredictionSummary): { months: number; due: string }[] {
  const graded = new Set(p.grades.map((g) => g.horizon_months))
  return HORIZONS.filter(([months]) => !graded.has(months)).map(([months]) => ({ months, due: addMonths(p.run_at.slice(0, 10), months) }))
}

// A date gone by is graded as the app opens, once its prices are in; until then it is due now.
const dueText = (due: string, now: Date) => (due < isoDay(now) ? 'due now' : `due ${shortDate(due, now)}`)

// One prediction's Grades cell: what is graded, then the next grade due (null once all are in).
export function gradeCells(p: PredictionSummary, now: Date = new Date()): { graded: GradedHorizon[]; next: string | null } {
  const next = ungraded(p)[0]
  return { graded: latest(p.grades).map(describe), next: next ? `${next.months}-month grade ${dueText(next.due, now)}` : null }
}

// The table's Next grade column: the next horizon and its day ("3 months", "Feb 10, 2027" or
// "due now"), or null once every grade is in.
export function nextGrade(p: PredictionSummary, now: Date = new Date()): { months: number; when: string } | null {
  const next = ungraded(p)[0]
  if (!next) return null
  return { months: next.months, when: next.due < isoDay(now) ? 'due now' : shortDate(next.due, now) }
}

export interface LogTile {
  big: string
  text: string
}

const LOGGED = 'each company’s first full report in any 30 days is logged'

export function logTiles(predictions: PredictionSummary[], now: Date = new Date()): LogTile[] {
  const n = predictions.length
  const grades = predictions.flatMap((p) => latest(p.grades))
  const withPeers = grades.filter((g) => g.hit !== null)
  const hits = withPeers.filter((g) => g.hit === true).length
  let graded: LogTile
  if (grades.length > 0) {
    const so = `${grades.length === 1 ? 'grade' : 'grades'} so far`
    graded = { big: String(grades.length), text: withPeers.length ? `${so}; ${hits} of ${withPeers.length} hits against the peers` : `${so}; none had peer data` }
  } else {
    const first = predictions.flatMap(ungraded).reduce<string | null>((a, b) => (a === null || b.due < a ? b.due : a), null)
    graded = { big: '0', text: first ? `graded so far; the first is ${dueText(first, now)}` : 'graded so far' }
  }
  return [
    { big: String(n), text: `${n === 1 ? 'prediction' : 'predictions'} logged; ${LOGGED}` },
    graded,
    { big: '3, 6, 12', text: 'months: when each logged prediction is graded' }
  ]
}

// The toolbar's line under "Prediction log".
export function logSubtitle(predictions: PredictionSummary[]): string {
  if (predictions.length === 0) return 'Nothing logged yet'
  const graded = predictions.reduce((sum, p) => sum + latest(p.grades).length, 0)
  return `${predictions.length} logged, ${graded} graded`
}

// What "Grade what is due" says when it finishes. A report running, or grading already under
// way, gets the engine's own sentence as it is.
export function gradedLine(reply: CallResult<GradeResult> | null): string {
  if (reply?.ok && reply.result) {
    const { graded, note } = reply.result
    if (graded === 0) return note || 'Nothing new was due.'
    const line = `Graded ${graded} new ${graded === 1 ? 'horizon' : 'horizons'}.`
    return note ? `${line} ${note}` : line
  }
  const code = reply?.error?.code
  const message = reply?.error?.message || 'Tearsheet’s engine didn’t answer.'
  if (code === 'GRADING_IN_PROGRESS' || code === 'RUN_IN_PROGRESS') return message
  return `Grading didn’t finish. ${message}`
}

// The rating's pill: green Buy, amber Hold, red Sell.
export function ratingTone(rating: string): Tone {
  return rating === 'Buy' ? 'ok' : rating === 'Hold' ? 'hold' : rating === 'Sell' ? 'bad' : 'off'
}
