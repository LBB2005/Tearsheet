// Pure logic for the home page (the spec's "The home page" and "When something breaks later"):
// the greeting, and the lines under the field. Lines with the tone 'down' are problems, shown in
// the red box at the top of the page; the others are "Since you were last here".

import type { CompanyRow, PredictionSummary } from '../../shared/protocol'
import { shortDate } from '../nav'

export type SinceTone = 'up' | 'accent' | 'hold' | 'down'

// The fix a line offers: add the FRED or Massive key (Settings), sign the AI tool in again, or
// run the safety check again.
export type SinceAction = 'addFred' | 'addMassive' | 'signIn' | 'recheck'

export interface SinceLine {
  tone: SinceTone
  text: string
  // A problem's second line, under its bold first line.
  detail?: string
  action?: SinceAction
}

export interface SinceInput {
  companies: CompanyRow[]
  predictions: PredictionSummary[]
  keys: Record<string, 'set' | 'missing'>
  // Skipped in setup or not, a missing FRED key reads the same: reports leave the figures out.
  fredSkipped: boolean
  // The AI tool in use, by name, and what is wrong with it.
  tool: { name: string; signedOut: boolean; safetyFailed: boolean }
  now?: Date
}

// The grading horizons, in months (engine/src/tearsheet/methodology/grading.yaml).
const HORIZONS: [months: number, ordinal: string, after: string][] = [
  [3, 'first', 'three months'],
  [6, 'second', 'six months'],
  [12, 'third', 'a year']
]

const pad = (n: number) => String(n).padStart(2, '0')
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// A calendar day plus whole months, kept inside the month as the engine does (grading.add_months):
// Aug 31 plus 6 months is Feb 28.
function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const index = m - 1 + months
  const year = y + Math.floor(index / 12)
  const month = (index % 12) + 1
  const last = new Date(year, month, 0).getDate()
  return `${year}-${pad(month)}-${pad(Math.min(d, last))}`
}

// The weekday before today: the last close that should be out by now on end-of-day prices.
function lastClose(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1)
  return isoDay(d)
}

// A company's name without its legal ending, for a sentence: "NVIDIA CORP" gives "NVIDIA".
export function shortName(name: string): string {
  const short = name.replace(/(?:,?\s+(?:&\s+)?(?:inc|incorporated|corp|corporation|co|ltd|plc)\.?)+$/i, '').trim()
  return short || name
}

function pricesLine(companies: CompanyRow[], now: Date): SinceLine | null {
  const dates = companies.map((c) => c.price_date).filter((d): d is string => Boolean(d))
  if (dates.length === 0) return null
  // The oldest close, so the line holds for every company.
  const close = dates.reduce((a, b) => (b < a ? b : a))
  const whose = dates.length === 1 ? 'your company and its peers' : `your ${dates.length} companies and their peers`
  const day = shortDate(close, now)
  if (close >= lastClose(now)) return { tone: 'up', text: `Prices are up to date to the ${day} close, for ${whose}.` }
  return { tone: 'hold', text: `The latest prices are from the ${day} close, for ${whose}.` }
}

function gradeLine(predictions: PredictionSummary[], companies: CompanyRow[], now: Date): SinceLine | null {
  const today = isoDay(now)
  let next: { due: string; p: PredictionSummary; ordinal: string; after: string } | null = null
  for (const p of predictions) {
    const graded = new Set(p.grades.map((g) => g.horizon_months))
    for (const [months, ordinal, after] of HORIZONS) {
      if (graded.has(months)) continue
      const due = addMonths(p.run_at.slice(0, 10), months)
      // A date gone by is graded as the app opens, once its prices are in.
      if (due < today) continue
      if (!next || due < next.due) next = { due, p, ordinal, after }
    }
  }
  if (!next) return null
  const row = companies.find((c) => c.cik === next.p.cik)
  const name = row ? shortName(row.name) : next.p.ticker
  return { tone: 'accent', text: `${name}’s ${next.ordinal} grade is due ${shortDate(next.due, now)}, ${next.after} after its report.` }
}

export function sinceLines(s: SinceInput): SinceLine[] {
  const now = s.now ?? new Date()
  const lines: SinceLine[] = []
  if (s.tool.signedOut) {
    lines.push({
      tone: 'down',
      text: `${s.tool.name} is signed out`,
      detail: 'New reports can’t be written until you sign in again. Your saved reports still open.',
      action: 'signIn'
    })
  }
  if (s.tool.safetyFailed) {
    lines.push({
      tone: 'down',
      text: `${s.tool.name} didn’t pass the safety check`,
      detail: 'New reports can’t be written until it passes. Your saved reports still open.',
      action: 'recheck'
    })
  }
  // Only a key the settings say is missing counts; one not yet known doesn't.
  if (s.keys.massive === 'missing') {
    lines.push({
      tone: 'down',
      text: 'Prices aren’t connected, so new reports can’t be rated',
      detail: 'Add your Massive key in Settings. Your saved reports still open.',
      action: 'addMassive'
    })
  }
  const prices = pricesLine(s.companies, now)
  if (prices) lines.push(prices)
  const grade = gradeLine(s.predictions, s.companies, now)
  if (grade) lines.push(grade)
  if (s.keys.fred !== 'set') lines.push({ tone: 'hold', text: 'Economic figures aren’t connected, so reports leave them out.', action: 'addFred' })
  return lines
}

// The small line above the question: a welcome the first time, then the time of day.
export function greeting(now: Date, first: boolean): string {
  if (first) return 'Welcome to Tearsheet'
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}
