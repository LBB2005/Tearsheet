// Pure logic for the line: several reports written one after another (the engine's batch.py,
// Liam's pick of 7 Nov 2026). The home page's field takes several companies separated by commas,
// new lines or (for tickers) spaces, as many as Liam likes, up to the whole S&P 500 (8 Nov 2026);
// the engine checks each one and says which would make a new official prediction before anything
// starts. The run view then shows the report being written with "Up next" under it, and at the
// end a list of how each one went. A usage limit's pause ends by itself once the limit resets,
// and so does a wait for the plan's 5-hour window past 80%; past 80% of the week, the line asks.

import { about, USUAL } from '../../shared/pace'
import type { LineItem, LinePause, LineSkip, LineState } from '../../shared/protocol'

// The problems that pause the line, because every report after would meet them too (batch.py's
// PAUSE_CODES). Any other problem stops just that company's report, and the line moves on.
export const PAUSES = new Set(['USAGE_LIMIT', 'AUTH_EXPIRED', 'SEC_BLOCKED', 'LOCKDOWN_FAILED', 'NO_TOOL', 'AI_UNAVAILABLE'])
// The pause a line comes back with when Tearsheet opens again with reports waiting.
export const REOPENED = 'REOPENED'
// The plan's 5-hour window past 80%: the line waits for it to reset (batch.py).
export const USAGE_HIGH = 'USAGE_HIGH'
// The plan's weekly window past 80%: the line asks before it goes on.
export const USAGE_WEEK = 'USAGE_WEEK'
// The pauses a safety check that didn't pass sets on a brand-new install (batch.py's
// SAFETY_PAUSES): the person stopped it, or it couldn't finish. A later full pass carries the
// line on by itself.
export const SAFETY_PAUSES = new Set(['SAFETY_CHECK_STOPPED', 'SAFETY_CHECK_UNFINISHED'])

// Whether the line waits on the safety check: one of those two, or a failed check
// (LOCKDOWN_FAILED). Carrying on past one would skip the full check, so its only ways on are
// running the check again and cancelling.
export const safetyPause = (code: string | null | undefined): boolean => code === 'LOCKDOWN_FAILED' || SAFETY_PAUSES.has(code ?? '')

const sentenceEnd = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`)

// What a safety pause says. A failed check gives its reason (this session's, else the engine's
// message); a stopped one and one that couldn't finish say so in plain words.
export function safetyPauseText(code: string, message: string, checkReason?: string | null): string {
  if (code === 'SAFETY_CHECK_STOPPED') return 'You stopped the safety check. Reports wait until it passes.'
  if (code === 'SAFETY_CHECK_UNFINISHED') {
    // The engine's message already starts "The check couldn't finish: ".
    const why = message.replace(/^The (?:safety )?check couldn[’']t finish:\s*/i, '').trim()
    return sentenceEnd(`The safety check couldn’t finish: ${why || 'it stopped part way'}`)
  }
  return sentenceEnd(checkReason || message || 'The safety check didn’t pass')
}

// The reports waiting on a safety check that runs now: some waiting, none being written, and
// nothing else holding the line (only a pause the check itself set, which a pass carries on).
export const waitsForCheck = (line: LineState | null, checking: boolean): boolean =>
  checking && line !== null && line.writing === null && line.waiting.length > 0 && (line.paused === null || SAFETY_PAUSES.has(line.paused.code))

// What a plan is asked for: companies typed, a quick add (the whole S&P 500, one sector, or the
// rest without a finished report), or both.
export interface PlanAsk {
  queries?: string[]
  group?: 'all' | 'sector' | 'rest'
  sector?: string
}

const SEPARATORS = /[,;\n\r\t]/
// A word that looks like a ticker as typed: capitals, maybe a class dot (BRK.B).
const TICKER = /^[A-Z][A-Z0-9]{0,4}([.-][A-Z])?$/

// Several companies typed at once: any comma (or semicolon, or a pasted new line) makes a list,
// and so do tickers in capitals with spaces between them ("AAPL MSFT NVDA"). Names keep their
// spaces, so "Bank of America, Realty Income" is two companies; the engine splits spaced tickers.
export function isList(text: string): boolean {
  return SEPARATORS.test(text) || spacedTickers(text.trim()) !== null
}

// "AAPL MSFT NVDA": tickers in capitals with spaces between them, one company each; null for
// anything else (a name keeps its spaces).
function spacedTickers(part: string): string[] | null {
  const words = part.split(/\s+/)
  return words.length > 1 && words.every((word) => TICKER.test(word)) ? words : null
}

export function splitQueries(text: string): string[] {
  return text
    .split(SEPARATORS)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => spacedTickers(part) ?? [part])
}

// A pasted list in the one-line field: its new lines and tabs become commas, so a column copied
// from a spreadsheet stays one company a line.
export function pastedList(text: string): string {
  return text
    .split(/[\r\n\t]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ')
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

// One report's usual time, in seconds: from Liam's own finished runs (the engine's `typical`),
// or the run view's step times until a few have finished.
export const perReportOf = (line: LineState | null, fallback: number = usualReport()) => (line?.typical?.seconds && line.typical.seconds > 0 ? line.typical.seconds : fallback)

// About how many AI calls a report makes: Liam's own runs, or about 35 until a few have finished.
export const CALLS_PER_REPORT = 35
export const callsPerReportOf = (line: LineState | null) => (line?.typical?.ai_calls && line.typical.ai_calls > 0 ? line.typical.ai_calls : CALLS_PER_REPORT)

// "37 of 212 done, about 12 hours left": the line's progress, the report being written counted
// as half done.
export function lineProgress(line: LineState, perReport: number): string {
  const { total } = linePlace(line)
  const done = line.finished.length
  const left = (line.waiting.length + (line.writing ? 0.5 : 0)) * perReport
  const head = `${done.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} done`
  return left > 0 ? `${head}, ${aboutLong(left)} left` : head
}

// About how long and how many AI calls a number of reports take: "about 14 hours and 7,100 AI calls".
export function lineCost(reports: number, perReport: number, callsPerReport: number): string {
  return `${lineTime(reports, perReport)} and ${(reports * callsPerReport).toLocaleString('en-US')} AI calls`
}

// The warning before a big line starts: each company's first rated report in 30 days is logged
// for good, so Liam knows how many a line will add. Said, never blocking.
export function officialWarning(items: LineItem[]): string {
  const fresh = items.filter((item) => item.official).length
  if (fresh === 0) return ''
  return `Each first report is an official prediction for 30 days. ${fresh === 1 ? '1 new one' : `${fresh.toLocaleString('en-US')} new ones`} will be logged.`
}

// Names shown in a sentence, with the rest counted: "AAPL, MSFT, NVDA and 209 more".
export function someNames(names: string[], show: number = 6): string {
  if (names.length <= show + 1) return joinNames(names)
  return `${names.slice(0, show).join(', ')} and ${(names.length - show).toLocaleString('en-US')} more`
}

// What the check left out, grouped by why, biggest group first after the not-founds: each with
// a heading and the companies, for the plan card.
const SKIP_HEAD: Record<LineSkip['kind'], [string, string]> = {
  unknown: ['wasn’t found', 'weren’t found'],
  recent: ['has a report from the last 30 days', 'have a report from the last 30 days'],
  in_line: ['is already in the line', 'are already in the line'],
  twice: ['was listed twice', 'were listed twice']
}
const SKIP_ORDER: LineSkip['kind'][] = ['unknown', 'recent', 'in_line', 'twice']

export interface SkipGroup {
  kind: LineSkip['kind']
  head: string
  skips: LineSkip[]
}

export function skipGroups(skipped: LineSkip[]): SkipGroup[] {
  return SKIP_ORDER.flatMap((kind) => {
    const skips = skipped.filter((skip) => (skip.kind ?? 'unknown') === kind)
    if (skips.length === 0) return []
    const [one, many] = SKIP_HEAD[kind]
    return [{ kind, head: `${plural(skips.length, 'company', 'companies')} ${skips.length === 1 ? one : many}`, skips }]
  })
}

// A time on Liam's clock: "3:40 pm", with the day when it isn't today ("3:40 pm tomorrow",
// "3:40 pm on Tue 10 Nov").
export function clockTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?([AP])M$/i, (_, h: string) => ` ${h.toLowerCase()}m`)
  const day = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  if (day(at) === day(now)) return time
  if (day(at) === day(tomorrow)) return `${time} tomorrow`
  // Month first, as the app writes dates: "9:05 am on Wed, Nov 11".
  return `${time} on ${at.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
}

// Whether the line waits for something to reset and then carries on by itself.
export const waitsByItself = (pause: LinePause | null | undefined): boolean => Boolean(pause?.wait_until)

const percent = (used: number | null | undefined) => (typeof used === 'number' ? `${Math.round(used * 100)}%` : null)

// What a paused line is waiting for, in a sentence: a usage limit or the 5-hour window, to reset
// by itself; the weekly window past 80%, for Liam's yes.
export function waitText(pause: LinePause, now: Date = new Date()): string {
  const at = pause.wait_until ? clockTime(pause.wait_until, now) : null
  if (pause.code === 'USAGE_LIMIT' && at) return pause.reset_at ? `Waiting for your usage limit to reset at ${at}. The line carries on by itself then.` : `Your plan’s usage limit is reached. Trying again at ${at}.`
  if (pause.code === USAGE_HIGH && at) {
    const used = percent(pause.used)
    return `Your plan’s 5-hour usage is ${used ? `at ${used}` : 'close to its limit'}. Waiting for it to reset at ${at}, so you keep the rest. The line carries on by itself then.`
  }
  if (pause.code === USAGE_WEEK) {
    const used = percent(pause.used)
    return `Your plan’s weekly usage is ${used ? `at ${used}` : 'close to its limit'}. Carry on writing the line?`
  }
  return pause.message
}

// About how long a number of reports take, by the usual time of one (seconds): minutes for a
// few, hours for a long line ("about 14 hours"), days past three.
export function lineTime(reports: number, perReport: number = usualReport()): string {
  return aboutLong(reports * perReport)
}

export function aboutLong(seconds: number): string {
  const hours = seconds / 3600
  if (hours < 1.5) return about(seconds)
  if (hours < 72) return `about ${Math.round(hours)} hours`
  return `about ${Math.round(hours / 24)} days`
}

export const usualReport = (times: Record<string, number> = USUAL) => Object.values(times).reduce((sum, s) => sum + s, 0)

// What the line's companies will do to the prediction log, said before it starts. A company's
// first rated report in 30 days is its official prediction, as for a single report.
export function officialNote(items: LineItem[]): string {
  const fresh = items.filter((item) => item.official)
  const repeat = items.filter((item) => !item.official)
  if (items.length === 0) return ''
  if (repeat.length === 0) return items.length === 1 ? 'It will be a new official prediction in your log.' : `Each will be a new official prediction in your log.`
  const names = someNames(repeat.map((item) => item.ticker))
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
