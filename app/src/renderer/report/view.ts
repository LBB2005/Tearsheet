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
  column: 'both' | 'numbers' | 'text' | 'auto'
  narrow: boolean
  side: Side
  motion: boolean
}

// Where the report drops from two columns to one, the column the Numbers / Text switch picks. It
// is the report's own CSS that does it (the engine's render.TWO_COLUMNS_MIN, checked against
// this one in columns.test.ts); the toolbar only needs to know when to show the switch.
export const TWO_COLUMNS_MIN = 860

export const oneColumn = (reportWidth: number): boolean => reportWidth < TWO_COLUMNS_MIN

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

// What a frame asks the engine for: the layout that follows the frame's width (column "auto"),
// so opening, closing or resizing the chart never loads the report again. The text frame plays
// the report's entrance; a numbers frame, loaded when the switch first picks Numbers, doesn't.
// A narrow window adds the row of key-number tiles above the text.
export function renderOptions(o: { view: View; side: Side; wide: boolean; motion: boolean }): RenderOptions {
  return { view: o.view, column: 'auto', side: o.side, narrow: !o.wide, motion: o.motion }
}

// Which frame is on show: the numbers one only while the report is down to one column with
// Numbers picked, and only once it has loaded, so a switch never shows a blank frame.
export function shownSide(side: Side, one: boolean, numbersReady: boolean): Side {
  return one && side === 'numbers' && numbersReady ? 'numbers' : 'text'
}

// ⌘1 and ⌘2.
export function nextView(command: MenuCommand | string): View | null {
  return command === 'summary' || command === 'full' ? command : null
}

// flag_claim names a claim by its report and its id in that report.
export function flagClaimId(reportId: string, claimId: string): string {
  return `${reportId}:${claimId}`
}
