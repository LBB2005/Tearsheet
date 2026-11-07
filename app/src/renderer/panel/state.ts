// What the right-hand panel shows (the spec's "One view at a time"): the price chart, or one
// chart or table opened bigger from the report. Pure, so the report page, ⌘3, the report's links
// and the tests share it. The panel's open, closing and closed states stay in report/useReport.ts.

import type { ViewId } from '../../main/navigation'

export interface Panel {
  view: ViewId
  // The item the report's link picked out in the view, such as a metric or a table row.
  item: string | null
  // The last view other than the price chart, for the switch back to it.
  last: ViewId | null
  // Counts the links to the price chart; each one turns its 12-month range on.
  rangeAsk: number
}

export const FIRST: Panel = { view: 'price', item: null, last: null, rangeAsk: 0 }

// ⌘3 and the Chart button, as the panel opens: always the price chart, which starts afresh with
// its range off, since no link asked for it. The switch keeps the last view.
export function opened(p: Panel): Panel {
  return { ...p, view: 'price', item: null, rangeAsk: 0 }
}

// A link from the report. Only the same view and item, already on show, does nothing: while the
// panel is closed or sliding shut, the link always opens it again.
export function asked(p: Panel, open: boolean, view: ViewId, item: string | null): Panel | null {
  if (open && p.view === view && p.item === item) return null
  const price = view === 'price'
  return { view, item, last: price ? p.last : view, rangeAsk: price ? p.rangeAsk + 1 : p.rangeAsk }
}

// The panel's own switch, between the price chart and the last view.
export function switched(p: Panel, view: ViewId): Panel {
  return { ...p, view, item: null }
}
