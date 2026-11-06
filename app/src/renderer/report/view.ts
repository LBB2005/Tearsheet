// Pure logic for the report page: the toolbar's subtitle, the company's other reports, and which
// render options the frame asks the engine for (the spec's "Pages → 1. Report").

import type { MenuCommand } from '../../main/menu'
import type { ReportSummary } from '../../shared/protocol'
import { shortDate } from '../nav'

// The text view the frame shows first, and the column that stays beside the open chart.
export type View = 'summary' | 'full'
export type Side = 'numbers' | 'text'

export interface RenderOptions {
  view: View
  column: 'both' | 'numbers' | 'text'
  narrow: boolean
}

// "Report of Nov 5, 41 claims kept". A report saved before claim counts were stored gives the
// date alone.
export function reportSubtitle(createdAt: string, kept: number | null, now: Date = new Date()): string {
  const date = `Report of ${shortDate(createdAt, now)}`
  if (kept === null) return date
  return `${date}, ${kept} ${kept === 1 ? 'claim' : 'claims'} kept`
}

// The same company's other reports, newest first, for the subtitle's menu. A report whose company
// isn't known has none.
export function otherReports(list: ReportSummary[], cik: number | null, currentId: string): ReportSummary[] {
  if (cik === null) return []
  return list
    .filter((r) => r.cik === cik && r.report_id !== currentId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
}

// One row of that menu.
export function reportChoice(report: ReportSummary, now: Date = new Date()): { label: string; note: string } {
  return { label: `Report of ${shortDate(report.created_at, now)}`, note: report.rating ?? 'No rating' }
}

// What the frame asks the engine for. A wide window shows both columns, or, while the chart is
// open, the one the Numbers / Text switch picks. A narrow window shows the text with its row of
// key-number tiles (the chart, when open, takes the whole window there).
export function renderOptions(o: { view: View; side: Side; chartOpen: boolean; wide: boolean }): RenderOptions {
  if (!o.wide) return { view: o.view, column: 'text', narrow: true }
  return { view: o.view, column: o.chartOpen ? o.side : 'both', narrow: false }
}

// ⌘1 and ⌘2.
export function nextView(command: MenuCommand | string): View | null {
  return command === 'summary' || command === 'full' ? command : null
}

// flag_claim names a claim by its report and its id in that report.
export function flagClaimId(reportId: string, claimId: string): string {
  return `${reportId}:${claimId}`
}
