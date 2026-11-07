// Total return: which spans can be shown, the switches it remembers, and the rows each span draws.

import type { ReturnRow, ReturnSpan } from '../../shared/protocol'

export type Years = 1 | 3 | 5

export interface ReturnsState {
  years: Years
  // The peer group’s average, as one bar.
  peers: boolean
  // The S&P 500, as one bar.
  spy: boolean
  // Every peer’s own return, as a bar each.
  each: boolean
}

export const RETURNS_START: ReturnsState = { years: 1, peers: true, spy: true, each: false }

export const PEERS_NOTE = 'Peers have about 14 months of prices stored, so they are left off spans longer than 1 year.'
export const SPANS_NOTE = 'Longer spans show once the full price history is stored. Picking 5Y on the price chart downloads it.'

export const spansOffered = (spans: ReturnSpan[]): Years[] => spans.map((s) => s.years)

// The history can grow while the report is open, and a span can be remembered that the next report
// doesn’t have, so a span that isn’t stored shows the 1-year one instead.
export function shownSpan(spans: ReturnSpan[], years: Years): ReturnSpan | null {
  return spans.find((s) => s.years === years) ?? spans.find((s) => s.years === 1) ?? null
}

export type ReturnKind = 'company' | 'peers' | 'spy' | 'peer'

// A row with no value stays in the list: its readout is what says it isn’t stored.
export function returnRows(span: ReturnSpan, s: ReturnsState): { kind: ReturnKind; row: ReturnRow }[] {
  const rows: { kind: ReturnKind; row: ReturnRow }[] = [{ kind: 'company', row: span.company }]
  if (s.peers && span.peers) rows.push({ kind: 'peers', row: span.peers })
  if (s.spy) rows.push({ kind: 'spy', row: span.spy })
  if (s.each) for (const row of span.each_peer) rows.push({ kind: 'peer', row })
  return rows
}

// A return as the reader sees it, to one decimal with its sign. A move that rounds to nothing has
// no sign, so it never reads as "-0.0%".
export function returnText(v: number | null): string {
  if (v === null) return 'Not stored'
  const shown = Math.abs(v).toFixed(1)
  if (shown === '0.0') return '0.0%'
  return `${v > 0 ? '+' : '−'}${shown}%`
}
