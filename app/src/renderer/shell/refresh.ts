// Refresh: write a company's report again, as a new full report through the line (home/line.ts,
// the engine's batch.py), Liam's pick of 8 Nov 2026. The old report stays, and the report page's
// date menu switches between them. Before anything starts, a small confirm says how old the
// latest report is, what a new one costs, and whether it will be a new official prediction: the
// engine's check (plan_line) says, by the same 30-day rule as any report. Several companies
// selected in the sidebar go into the line together.

import type { LineItem, LinePlan, LineSkip } from '../../shared/protocol'
import { joinNames, lineTime, officialNote, usualReport } from '../home/line'
import { shortDate } from '../nav'

// About how many AI calls a full report makes, a little over the 34 of Liam’s runs (the line says his own: home/line.ts).
export const CALLS_PER_REPORT = 40

// A company to refresh, with the date of its latest report.
export interface Refreshing {
  ticker: string
  created_at: string
}

const DAY_MS = 86_400_000

// The day a report was written, here: a timestamp's local day, as the sidebar's Today and
// Yesterday groups go by (reportList.ts), or a plain date as it is.
function localDay(iso: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(T.*)?$/.exec(iso)
  if (!m) return null
  const at = m[4] ? new Date(iso) : null
  if (at && !Number.isNaN(at.getTime())) return [at.getFullYear(), at.getMonth() + 1, at.getDate()]
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

// How long ago a report was written, in days on the calendar: "today", "yesterday", "3 days ago".
export function ageText(iso: string, now: Date = new Date()): string {
  const day = localDay(iso)
  if (!day) return ''
  const then = Date.UTC(day[0], day[1] - 1, day[2])
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.max(0, Math.round((today - then) / DAY_MS))
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

// "from Aug 2, 98 days ago", or "from today".
function fromText(iso: string, now: Date): string {
  const day = localDay(iso)
  if (!day) return `from ${iso}`
  const age = ageText(iso, now)
  if (age === 'today') return 'from today'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `from ${shortDate(`${day[0]}-${pad(day[1])}-${pad(day[2])}`, now)}, ${age}`
}

export interface RefreshText {
  title: string
  // For several companies: each one's latest report, by age.
  ages: { ticker: string; text: string }[]
  lines: string[]
  // Those the engine's check left out, and why (several companies only).
  skipped: LineSkip[]
  // The Start button's words, or null when nothing can be written.
  start: string | null
}

// What the confirm says. `busy`: a report is being written, or the line has more to come, so
// these wait their turn.
export function refreshText(asked: Refreshing[], plan: LinePlan, opts: { busy: boolean; now?: Date; perReport?: number }): RefreshText {
  const now = opts.now ?? new Date()
  const perReport = opts.perReport ?? usualReport()
  const items = plan.items
  const n = items.length
  const dateOf = (ticker: string) => asked.find((a) => a.ticker === ticker)?.created_at ?? null

  if (asked.length === 1) {
    const ticker = asked[0].ticker
    const it = items[0]
    if (!it) return { title: `${ticker} can’t be refreshed now`, ages: [], lines: plan.skipped.map((s) => s.reason), skipped: [], start: null }
    return {
      title: `Refresh ${it.ticker}?`,
      ages: [],
      lines: [
        `Your latest ${it.ticker} report is ${fromText(asked[0].created_at, now)}.`,
        `A new full report takes ${lineTime(1, perReport)} and about ${CALLS_PER_REPORT} AI calls.`,
        it.official ? 'It will be a new official prediction in your log.' : `It won’t be an official prediction: ${it.ticker} was rated in the last 30 days.`,
        ...(opts.busy ? ['It starts once the reports before it are done.'] : []),
        'Your old report stays. Switch between them from the report’s date at the top.'
      ],
      skipped: [],
      start: 'Write a new report'
    }
  }

  if (n === 0) return { title: 'None of these can be refreshed now', ages: [], lines: [], skipped: plan.skipped, start: null }
  return {
    title: `Refresh ${n} reports?`,
    ages: items.map((it) => {
      const at = dateOf(it.ticker)
      return { ticker: it.ticker, text: at ? fromText(at, now) : '' }
    }),
    lines: [
      `Written one after another: ${lineTime(n, perReport)} in all, and about ${n * CALLS_PER_REPORT} AI calls.`,
      officialNote(items),
      ...(opts.busy ? ['They start once the reports before them are done.'] : []),
      'Your old reports stay.'
    ],
    skipped: plan.skipped,
    start: n === 1 ? 'Write a new report' : `Write ${n} new reports`
  }
}

// The note once they are in the line. `busy`: something was being written already; `paused`:
// the line is paused (by a usage limit, say), so they wait until it carries on.
export function refreshNote(items: LineItem[], opts: { busy: boolean; paused: boolean }): { title: string; text: string } {
  const one = items.length === 1
  const names = joinNames(items.map((it) => it.ticker))
  const inLine = `${names} ${one ? 'is' : 'are'} in the line`
  if (opts.paused) return { title: inLine, text: 'The line is paused. Carry on from the home page.' }
  if (opts.busy) return { title: inLine, text: one ? 'It starts once the reports before it are done.' : 'They start once the reports before them are done.' }
  if (one) return { title: `Refreshing ${names}`, text: 'It’s under “writing…” in the sidebar. Your old report stays.' }
  const [first, ...rest] = items.map((it) => it.ticker)
  return { title: `Refreshing ${items.length} reports`, text: `${first} first, then ${joinNames(rest)}. They’re under “writing…” in the sidebar.` }
}
