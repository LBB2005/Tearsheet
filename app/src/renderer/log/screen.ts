// The prediction log's screener (docs/superpowers/specs/2026-11-08-prediction-log-page-design.md):
// the good-pick consensus, the filters with their counts, sorting, the bear-to-bull bar and the
// CSV. Pure: pages/Log.tsx draws what these work out. Nothing here changes a prediction.

import type { PredictionSummary } from '../../shared/protocol'
import { latest } from './log'

// --- the good-pick consensus --------------------------------------------------------------------

// A good pick meets at least `need` of the four checks. The three numbers are percentages or a
// score, as Liam sets them on the page.
export interface Rule {
  need: number
  minUpside: number
  minScore: number
  minChance: number
}

export const DEFAULT_RULE: Rule = { need: 3, minUpside: 20, minScore: 40, minChance: 50 }
export const RULE_LIMITS = { minUpside: [0, 60], minScore: [0, 90], minChance: [30, 80] } as const

export type CheckKey = 'buy' | 'upside' | 'score' | 'chance'

export interface Check {
  key: CheckKey
  label: string
  met: boolean
}

// Base case over today's price, minus one; null without both.
export function upside(p: PredictionSummary): number | null {
  return p.base != null && p.price != null && p.price > 0 ? p.base / p.price - 1 : null
}

export function checks(p: PredictionSummary, rule: Rule): Check[] {
  const up = upside(p)
  return [
    { key: 'buy', label: 'Rated Buy', met: p.rating === 'Buy' },
    { key: 'upside', label: `Base case ${rule.minUpside}%+ above today’s price`, met: up !== null && up * 100 >= rule.minUpside - 1e-9 },
    { key: 'score', label: `Peer score ${rule.minScore}+`, met: p.score != null && p.score >= rule.minScore },
    { key: 'chance', label: `Chance of beating peers ${rule.minChance}%+`, met: p.probability != null && p.probability * 100 >= rule.minChance - 1e-9 }
  ]
}

export function ruleText(rule: Rule): string {
  return `${rule.need} of 4 agree: rated Buy · base case ${rule.minUpside}%+ above today’s price · peer score ${rule.minScore}+ · chance of beating peers ${rule.minChance}%+`
}

const clamp = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback)

// A rule read back from storage, kept inside the page's limits.
export function cleanRule(raw: unknown): Rule {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    need: clamp(r.need, 1, 4, DEFAULT_RULE.need),
    minUpside: clamp(r.minUpside, ...RULE_LIMITS.minUpside, DEFAULT_RULE.minUpside),
    minScore: clamp(r.minScore, ...RULE_LIMITS.minScore, DEFAULT_RULE.minScore),
    minChance: clamp(r.minChance, ...RULE_LIMITS.minChance, DEFAULT_RULE.minChance)
  }
}

type Store = Pick<Storage, 'getItem' | 'setItem'>
const RULE_KEY = 'log.goodRule'
const local = (): Store | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function loadRule(store: Store | null = local()): Rule {
  try {
    const text = store?.getItem(RULE_KEY)
    return cleanRule(text ? JSON.parse(text) : null)
  } catch {
    return { ...DEFAULT_RULE }
  }
}

export function saveRule(rule: Rule, store: Store | null = local()): void {
  try {
    store?.setItem(RULE_KEY, JSON.stringify(cleanRule(rule)))
  } catch {
    // The rule is only a convenience; the page works without it.
  }
}

// --- rows -------------------------------------------------------------------------------------

export interface LogRow {
  p: PredictionSummary
  up: number | null
  checks: Check[]
  met: number
  // The newest prediction for its company: only these can be good picks or go on the chart.
  newest: boolean
  good: boolean
  graded: boolean
}

export function logRows(predictions: PredictionSummary[], rule: Rule): LogRow[] {
  const newestAt = new Map<number, string>()
  for (const p of predictions) if (!newestAt.has(p.cik) || p.run_at > (newestAt.get(p.cik) as string)) newestAt.set(p.cik, p.run_at)
  return predictions.map((p) => {
    const c = checks(p, rule)
    const met = c.filter((x) => x.met).length
    const newest = newestAt.get(p.cik) === p.run_at
    return { p, up: upside(p), checks: c, met, newest, good: newest && met >= rule.need, graded: latest(p.grades).length > 0 }
  })
}

// --- filters ------------------------------------------------------------------------------------

export type GradeState = 'waiting' | 'graded'

export interface Filters {
  goodOnly: boolean
  ratings: string[]
  sectors: string[]
  risks: string[]
  grades: GradeState[]
}

export const NO_FILTERS: Filters = { goodOnly: false, ratings: [], sectors: [], risks: [], grades: [] }

export const RISKS: [key: string, label: string][] = [
  ['low', 'Low'],
  ['medium', 'Medium'],
  ['high', 'High'],
  ['very_high', 'Very high'],
  ['extreme', 'Extreme']
]
export const riskLabel = (u: string | null | undefined) => RISKS.find(([k]) => k === u)?.[1] ?? (u ? u.replace(/_/g, ' ') : '—')

export type Facet = 'ratings' | 'sectors' | 'risks' | 'grades'

const valueOf: Record<Facet, (r: LogRow) => string> = {
  ratings: (r) => r.p.rating,
  sectors: (r) => r.p.sector ?? 'Unknown sector',
  risks: (r) => r.p.uncertainty ?? '',
  grades: (r) => (r.graded ? 'graded' : 'waiting')
}

const passes = (r: LogRow, f: Filters, skip?: Facet) =>
  (!f.goodOnly || r.good) && (Object.keys(valueOf) as Facet[]).every((facet) => facet === skip || f[facet].length === 0 || (f[facet] as string[]).includes(valueOf[facet](r)))

export function applyFilters(rows: LogRow[], f: Filters): LogRow[] {
  return rows.filter((r) => passes(r, f))
}

// Each option of a facet with how many rows it would show, given the other filters.
export function facetCounts(rows: LogRow[], f: Filters, facet: Facet): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) if (passes(r, f, facet)) out.set(valueOf[facet](r), (out.get(valueOf[facet](r)) ?? 0) + 1)
  return out
}

// The sectors present, A to Z.
export function sectorsOf(rows: LogRow[]): string[] {
  return [...new Set(rows.map((r) => valueOf.sectors(r)))].sort()
}

export function toggled<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

// --- sorting ------------------------------------------------------------------------------------

export type SortKey = 'checks' | 'upside' | 'score' | 'chance' | 'made' | 'ticker'

export const SORTS: [key: SortKey, label: string][] = [
  ['checks', 'Checks met, then upside'],
  ['upside', 'Upside to base case'],
  ['score', 'Peer score'],
  ['chance', 'Chance of beating peers'],
  ['made', 'Newest first'],
  ['ticker', 'Ticker, A to Z']
]

const desc = (a: number | null | undefined, b: number | null | undefined) => (b ?? -Infinity) - (a ?? -Infinity)

export function sortRows(rows: LogRow[], key: SortKey): LogRow[] {
  const by: Record<SortKey, (a: LogRow, b: LogRow) => number> = {
    checks: (a, b) => b.met - a.met || desc(a.up, b.up),
    upside: (a, b) => desc(a.up, b.up),
    score: (a, b) => desc(a.p.score, b.p.score),
    chance: (a, b) => desc(a.p.probability, b.p.probability),
    made: (a, b) => (a.p.run_at < b.p.run_at ? 1 : a.p.run_at > b.p.run_at ? -1 : 0),
    ticker: (a, b) => a.p.ticker.localeCompare(b.p.ticker)
  }
  return [...rows].sort((a, b) => by[key](a, b) || a.p.ticker.localeCompare(b.p.ticker))
}

// --- picks for the chart ----------------------------------------------------------------------

export const MAX_PICKS = 6

// Adds or removes a company; a seventh is refused.
export function togglePick(picks: number[], cik: number): number[] {
  if (picks.includes(cik)) return picks.filter((c) => c !== cik)
  return picks.length >= MAX_PICKS ? picks : [...picks, cik]
}

// --- the bear-to-bull bar -----------------------------------------------------------------------

// Log scale from 0.3× to 5× today's price, so +100% and −50% sit the same distance from today.
const LO = Math.log(0.3)
const HI = Math.log(5)
export const barX = (ratio: number) => Math.max(0, Math.min(100, ((Math.log(ratio) - LO) / (HI - LO)) * 100))

export interface BarPlace {
  // Percentages across the bar's track.
  left: number
  width: number
  base: number
  today: number
}

export function barPlace(p: PredictionSummary): BarPlace | null {
  if (p.bear == null || p.bull == null || p.base == null || p.price == null || p.price <= 0 || p.bear <= 0) return null
  const left = barX(p.bear / p.price)
  return { left, width: Math.max(0.5, barX(p.bull / p.price) - left), base: barX(p.base / p.price), today: barX(1) }
}

export const BAR_TICKS: { x: number; label: string }[] = [0.5, 1, 2, 4].map((k) => ({ x: barX(k), label: k === 1 ? 'today' : `${k < 1 ? '−' : '+'}${Math.round(Math.abs(k - 1) * 100)}%` }))

// "MICRON TECHNOLOGY INC" → "Micron Technology Inc"; names already in mixed case stay as they are.
export const companyName = (name: string) =>
  name === name.toUpperCase() ? name.toLowerCase().replace(/(^|[\s(&/-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase()).replace(/\s*\/de\/?$/i, '') : name

// --- numbers in words ---------------------------------------------------------------------------

// "+57%", "−8%" (a true minus, as the report writes it).
export const signedPct = (v: number | null, digits = 0) => (v === null ? '—' : `${v < 0 ? '−' : '+'}${Math.abs(v * 100).toFixed(digits)}%`)

// --- the CSV ------------------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function csvFileName(now: Date = new Date()): string {
  return `Tearsheet predictions ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}.csv`
}

const cell = (v: unknown): string => {
  const text = v === null || v === undefined ? '' : String(v)
  // Quoted when needed; a leading = + - @ is made plain text, so a spreadsheet never runs it.
  const safe = /^[=+\-@]/.test(text) && !/^-?\d/.test(text) ? `'${text}` : text
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

const num = (v: number | null | undefined, digits: number) => (v === null || v === undefined ? '' : Number(v.toFixed(digits)))

export function csvText(rows: LogRow[]): string {
  const head = ['Made', 'Ticker', 'Company', 'Sector', 'Rating', 'Peer score', 'Chance of beating peers', 'Price', 'Price date', 'Bear', 'Base', 'Bull', 'Upside to base', 'Risk', 'Checks met', 'Good pick', 'Newest for company', '3-month grade', '6-month grade', '12-month grade']
  const lines = rows.map((r) => {
    const grade = (m: number) => {
      const g = latest(r.p.grades).find((x) => x.horizon_months === m)
      return g ? (g.hit === null ? 'no peer data' : g.hit ? 'hit' : 'miss') : ''
    }
    return [
      r.p.run_at.slice(0, 10),
      r.p.ticker,
      r.p.name ?? '',
      r.p.sector ?? '',
      r.p.rating,
      num(r.p.score, 1),
      num(r.p.probability, 3),
      num(r.p.price, 2),
      r.p.price_date ?? '',
      num(r.p.bear, 2),
      num(r.p.base, 2),
      num(r.p.bull, 2),
      num(r.up, 4),
      riskLabel(r.p.uncertainty),
      r.met,
      r.good ? 'yes' : 'no',
      r.newest ? 'yes' : 'no',
      grade(3),
      grade(6),
      grade(12)
    ]
      .map(cell)
      .join(',')
  })
  return [head.map(cell).join(','), ...lines].join('\n') + '\n'
}
