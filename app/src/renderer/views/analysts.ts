// The Analyst ratings view's state and the firms it shows (AnalystsPane.tsx). Its figures come
// from analystdb through the engine (get_analysts), each with its text already written, so this
// file only picks what to show.

import type { AnalystFirm, ReportAnalysts } from '../../shared/protocol'

export type AnalystsTab = 'firms' | 'changes' | 'check'
export type AnalystsSide = 'all' | 'buy' | 'hold' | 'sell'

export interface AnalystsState {
  tab: AnalystsTab
  side: AnalystsSide
}

export const ANALYSTS_START: AnalystsState = { tab: 'firms', side: 'all' }

export const SIDES: { side: AnalystsSide; label: string }[] = [
  { side: 'all', label: 'All' },
  { side: 'buy', label: 'Buy' },
  { side: 'hold', label: 'Hold' },
  { side: 'sell', label: 'Sell' }
]

// What a link from the report's Analyst ratings panel opens (tearsheet://open/analysts/<item>):
// a side of the ring or the legend opens the firms on that side, the targets every firm, and
// `changes` or `check` their own tabs. No item, or one it doesn't know, leaves the view as it was.
export function stateFor(item: string | null, state: AnalystsState): AnalystsState {
  if (item === 'buy' || item === 'hold' || item === 'sell') return { tab: 'firms', side: item }
  if (item === 'firms') return { tab: 'firms', side: 'all' }
  if (item === 'changes' || item === 'check') return { ...state, tab: item }
  return state
}

export function firmsOn(firms: AnalystFirm[], side: AnalystsSide): AnalystFirm[] {
  return side === 'all' ? firms : firms.filter((f) => f.side === side)
}

// The count beside each side's button: analystdb's own, as the report's panel shows it.
export function sideCount(view: ReportAnalysts, side: AnalystsSide): number {
  if (side === 'all') return view.n_firms ?? 0
  return view.sides?.[side] ?? 0
}

// "yahoo", "yahoo and fmp", "yahoo, fmp and finnhub".
export function andList(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '')
}
