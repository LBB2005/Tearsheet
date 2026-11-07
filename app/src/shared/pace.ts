// How far a report run has got, paced by time rather than by counting steps, and about how long
// is left. Counting steps made every bar jump: six of the 14 steps take about a second together,
// then the AI reading takes two minutes. Here each step weighs its usual time instead: the
// median of the last few finished runs (the engine's tally, `typical`), or the times of the
// first run on the faster engine until there are some. Within a step the bar follows its AI
// calls done (reads, sections, checks) where the tally counts them, else the time it has taken.
// Used by the run view, the sidebar's status line (renderer) and the Dock bar (main process).

import type { Tally } from './protocol'
import { REPORT_STEPS, stepsBehind, type StepStates } from './steps'

// The run of 7 Nov 2026 (4 min 51 s), the first on the faster engine.
export const USUAL: Record<string, number> = {
  resolve: 1,
  fetch: 100,
  normalize: 0.2,
  text: 0.3,
  metrics: 0.2,
  score: 0.2,
  value: 0.2,
  rate: 0.2,
  news: 10,
  extract: 120,
  narrate: 17,
  render: 0.1,
  verify: 42,
  save: 0.5
}

// How many AI calls the engine runs at a time: the tally says (config.AI_CALLS_IN_PARALLEL).
export const parallelOf = (tally?: Tally | null) => (tally?.parallel && tally.parallel > 0 ? tally.parallel : 3)
// A step that has run past its usual time still has a few seconds left, until it says it's done.
const FLOOR = 3
// A call under way counts as at most this much done, until it is.
const PART = 0.85

// When each step started and finished, by the app's clock (ms), from the progress notes.
export type StepTimes = Record<string, { started?: number; done?: number }>

export function noteStep(times: StepTimes, step: string, state: string, at: number): StepTimes {
  const had = times[step] ?? {}
  if (state === 'started' || state === 'retrying') return had.started === undefined ? { ...times, [step]: { ...had, started: at } } : times
  if (state === 'done' || state === 'skipped') return { ...times, [step]: { started: had.started ?? at, done: had.done ?? at } }
  return times
}

// The usual seconds per step: the engine's, with this table for any it has none for.
export function usualTimes(tally?: Tally | null): Record<string, number> {
  const out = { ...USUAL }
  for (const [step, seconds] of Object.entries(tally?.typical ?? {})) if (Number.isFinite(seconds) && seconds >= 0) out[step] = seconds
  return out
}

// The AI calls a step makes, done out of all, as the tally counts them.
export function calls(tally: Tally | null | undefined, step: string): { done: number; total: number } | null {
  if (!tally) return null
  const pair =
    step === 'extract' ? [tally.reads_done, tally.reads_total] : step === 'narrate' ? [tally.sections_done, tally.sections_total] : step === 'verify' ? [tally.checks_done, tally.checks_total] : []
  const [done, total] = pair
  return typeof total === 'number' && total > 0 ? { done: done ?? 0, total } : null
}

export interface Pace {
  // 0–1, for the bars.
  progress: number
  // Seconds, for "about 3 min left".
  left: number
}

// `seen` holds when the app first saw each call under way (the tally's `now`), so a call
// half done counts as half done.
export function pace(states: StepStates, times: StepTimes, tally: Tally | null | undefined, now: number, seen: Record<string, number> = {}): Pace {
  const usual = usualTimes(tally)
  const i = stepsBehind(states)
  if (i >= REPORT_STEPS.length) return { progress: 1, left: 0 }
  const step = REPORT_STEPS[i]
  const typ = usual[step]
  let frac: number
  let remain: number
  const counted = calls(tally, step)
  if (counted) {
    const item = (typ * parallelOf(tally)) / counted.total
    const partial = (tally?.now ?? []).reduce((sum, name) => {
      const since = seen[name]
      return sum + (since === undefined || item <= 0 ? 0 : Math.min(PART, Math.max(0, (now - since) / 1000) / item))
    }, 0)
    frac = Math.min(1, (counted.done + partial) / counted.total)
    remain = Math.max(typ * (1 - frac), counted.done < counted.total ? FLOOR : 0)
  } else {
    const started = times[step]?.started
    const elapsed = started === undefined ? 0 : Math.max(0, (now - started) / 1000)
    remain = Math.max(typ - elapsed, Math.min(FLOOR, typ * 0.2))
    frac = elapsed + remain > 0 ? elapsed / (elapsed + remain) : 0
  }
  let before = 0
  let after = 0
  let all = 0
  REPORT_STEPS.forEach((s, j) => {
    all += usual[s]
    if (j < i) before += usual[s]
    if (j > i) after += usual[s]
  })
  return { progress: all > 0 ? Math.min(1, (before + typ * frac) / all) : 0, left: after + remain }
}

// "about 3 min left", rounded so it doesn't flicker.
export function leftText(seconds: number): string {
  if (seconds >= 90) return `about ${Math.round(seconds / 60)} min left`
  if (seconds >= 45) return 'about a minute left'
  if (seconds >= 12) return 'under a minute left'
  return 'a few seconds left'
}

// A span of time as the clock shows it: 0:07, 2:50, 12:04.
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// A usual span in words: "about a second", "about 15 s", "about 2 min".
export function about(seconds: number): string {
  if (seconds >= 90) return `about ${Math.round(seconds / 60)} min`
  if (seconds >= 50) return 'about a minute'
  if (seconds >= 3) return `about ${Math.max(5, Math.round(seconds / 5) * 5)} s`
  return 'about a second'
}
