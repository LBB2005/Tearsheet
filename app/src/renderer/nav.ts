// Pure logic for the app shell: the pages, ⌘[ and ⌘] through the sidebar's companies, and the
// sidebar's status line.

import type { CompanyRow } from '../shared/protocol'
import { REPORT_STEPS, stepsBehind, type StepStates } from '../shared/steps'

export type Page = 'setup' | 'home' | 'report' | 'log' | 'settings'

// The company before or after `current` (a ticker) in the sidebar's list, wrapping around at
// both ends. With no current company, or one not in the list, going forward starts at the first
// company and going back at the last.
export function nextCompany(list: CompanyRow[], current: string | null, dir: 1 | -1): string | null {
  if (list.length === 0) return null
  const at = current === null ? -1 : list.findIndex((c) => c.ticker === current)
  if (at < 0) return (dir === 1 ? list[0] : list[list.length - 1]).ticker
  return list[(at + dir + list.length) % list.length].ticker
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// A stored date (YYYY-MM-DD) as the spec writes it: "Nov 5", with the year when it isn't this
// year's. It is read as a calendar day, so no time zone moves it.
export function shortDate(iso: string, now: Date = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (month < 1 || month > 12) return iso
  const text = `${MONTHS[month - 1]} ${day}`
  return year === now.getFullYear() ? text : `${text}, ${year}`
}

export interface StatusInput {
  // A report being written: the company's ticker and its step states so far.
  run?: { ticker: string; steps: StepStates } | null
  // The safety check (the lock-down check) while it runs: calls made out of the total.
  safety?: { n: number; total: number } | null
  // The AI tool's name, like "Claude Code".
  tools: string
  signedOut: boolean
}

export interface StatusLine {
  tone: 'ok' | 'run' | 'stop'
  text: string
  // 0–1, for the thin progress bar under the line.
  progress?: number
}

// The sidebar's status line. A sign-out comes first, in red, because new reports can't be
// written until it's fixed; then a run, then the safety check, then "ready".
export function statusLine(input: StatusInput): StatusLine {
  const total = REPORT_STEPS.length
  if (input.signedOut) return { tone: 'stop', text: `${input.tools} signed out` }
  if (input.run) {
    const behind = Math.min(stepsBehind(input.run.steps), total - 1)
    return { tone: 'run', text: `Writing ${input.run.ticker}, step ${behind + 1} of ${total}`, progress: (behind + 0.5) / total }
  }
  if (input.safety) {
    const { n, total: calls } = input.safety
    return { tone: 'run', text: `Safety check, ${n} of ${calls}`, progress: calls > 0 ? Math.min(1, n / calls) : 0 }
  }
  return { tone: 'ok', text: `${input.tools} ready` }
}
