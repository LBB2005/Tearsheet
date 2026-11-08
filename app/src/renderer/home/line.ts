// Pure logic for the line: several reports written one after another (the engine's batch.py,
// Liam's pick of 7 Nov 2026). The home page's field takes several companies separated by commas;
// the engine checks each one and says which would make a new official prediction before anything
// starts. The run view then shows the report being written with "Up next" under it, and at the
// end a list of how each one went.

import { about, USUAL } from '../../shared/pace'
import type { LineItem, LineState } from '../../shared/protocol'

// The problems that pause the line, because every report after would meet them too (batch.py's
// PAUSE_CODES). Any other problem stops just that company's report, and the line moves on.
export const PAUSES = new Set(['USAGE_LIMIT', 'AUTH_EXPIRED', 'SEC_BLOCKED', 'LOCKDOWN_FAILED', 'NO_TOOL', 'AI_UNAVAILABLE'])
// The pause a line comes back with when Tearsheet opens again with reports waiting.
export const REOPENED = 'REOPENED'

const SEPARATORS = /[,;\n]/

// Several companies typed at once: any comma (or semicolon, or a pasted new line) makes a list.
// Names keep their spaces, so "Bank of America, Realty Income" is two companies.
export const isList = (text: string) => SEPARATORS.test(text)

export function splitQueries(text: string): string[] {
  return text
    .split(SEPARATORS)
    .map((part) => part.trim())
    .filter(Boolean)
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// Reports still to come: the one being written and those waiting, with nothing paused.
export const lineGoing = (line: LineState | null): boolean => line !== null && line.paused === null && (line.writing !== null || line.waiting.length > 0)

// Whether a run is one of the line's (being written, or finished in this line).
export function inLine(line: LineState | null, runId: string | null | undefined): boolean {
  if (!line || !runId) return false
  return line.writing?.run_id === runId || line.finished.some((item) => item.run_id === runId)
}

// "Report 2 of 5": the one being written, counted with those done and waiting.
export function linePlace(line: LineState): { at: number; total: number } {
  const at = line.finished.length + (line.writing ? 1 : 0)
  return { at, total: line.finished.length + (line.writing ? 1 : 0) + line.waiting.length }
}

// About how long a number of reports take, by the usual time of one (seconds).
export function lineTime(reports: number, perReport: number = usualReport()): string {
  return about(reports * perReport)
}

export const usualReport = (times: Record<string, number> = USUAL) => Object.values(times).reduce((sum, s) => sum + s, 0)

// What the line's companies will do to the prediction log, said before it starts. A company's
// first rated report in 30 days is its official prediction, as for a single report.
export function officialNote(items: LineItem[]): string {
  const fresh = items.filter((item) => item.official)
  const repeat = items.filter((item) => !item.official)
  if (items.length === 0) return ''
  if (repeat.length === 0) return items.length === 1 ? 'It will be a new official prediction in your log.' : `Each will be a new official prediction in your log.`
  const names = joinNames(repeat.map((item) => item.ticker))
  const was = repeat.length === 1 ? 'was' : 'were'
  if (fresh.length === 0) return `None will be a new official prediction: ${names} ${was} rated in the last 30 days.`
  const lead = fresh.length === 1 ? '1 of these will be a new official prediction' : `${fresh.length} of these will be new official predictions`
  return `${lead} in your log. ${names} ${was} rated in the last 30 days, so ${repeat.length === 1 ? 'it won’t be' : 'they won’t be'}.`
}

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// How a finished report in the line went, in a word or two.
export function outcomeText(item: LineItem): string {
  if (item.outcome === 'ready') return 'Ready'
  if (item.outcome === 'cancelled') return 'Cancelled'
  if (item.outcome === 'stopped') return item.report_id ? 'Stopped, report so far saved' : 'Stopped'
  return 'Didn’t finish'
}

// The Done list's headline: "4 ready, 1 stopped".
export function doneCount(finished: LineItem[]): string {
  const ready = finished.filter((item) => item.outcome === 'ready').length
  const cancelled = finished.filter((item) => item.outcome === 'cancelled').length
  const stopped = finished.length - ready - cancelled
  return [ready ? `${ready} ready` : '', stopped ? `${stopped} stopped` : '', cancelled ? `${cancelled} cancelled` : ''].filter(Boolean).join(', ') || 'Nothing finished'
}

// Companies the engine couldn't start, new in the line since the last note: their run never
// began, so no run note says so.
export function newlyUnstarted(before: LineState | null, after: LineState): LineItem[] {
  const seen = before?.finished.length ?? 0
  return after.finished.slice(seen).filter((item) => item.run_id === null && item.outcome === 'failed')
}
