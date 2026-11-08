// Deleting, bringing back and pinning reports from the sidebar (engine report_marks.py).
//
// Delete hides the reports at once and shows a notice with Undo for UNDO_MS. Undo brings them
// back. Once the undo has passed, the ones that can go are erased for good. An official
// prediction's report, or one with reviews, is never erased: it stays hidden, in the sort and
// filter menu's Hidden reports, and its prediction stays in the log. A delete made while another
// one's undo is still open settles the earlier one first. If the window closes before the undo
// has passed, nothing is erased: the reports stay hidden, and can be deleted again from there.

import { useCallback, useEffect, useRef, useState } from 'react'

import type { CompanyRow, ReportSummary } from '../../shared/protocol'
import type { Notice } from '../overlays/Toast'
import { deleteNotice } from './reportList'

export const UNDO_MS = 8000

export type Notify = (title: string, text?: string, tone?: Notice['tone'], extra?: Pick<Notice, 'action' | 'ms'>) => void

interface Pending {
  hidden: string[]
  erasable: string[]
  // Undo shows them again; false for reports that were already hidden.
  restore: boolean
  timer: number
}

export function useMarks({ notify, loadCompanies, onGone }: { notify: Notify; loadCompanies: () => void; onGone: (reportIds: string[]) => void }) {
  const [hidden, setHidden] = useState<ReportSummary[] | null>(null)
  const [wantHidden, setWantHidden] = useState(false)
  const pending = useRef<Pending | null>(null)
  const want = useRef(wantHidden)
  want.current = wantHidden
  const gone = useRef(onGone)
  gone.current = onGone

  const loadHidden = useCallback(() => {
    void window.tearsheet.listReports(500, true).then((r) => {
      if (want.current && r.ok && r.result) setHidden(r.result)
    })
  }, [])
  useEffect(() => {
    if (wantHidden) loadHidden()
    else setHidden(null)
  }, [wantHidden, loadHidden])

  const refresh = useCallback(() => {
    loadCompanies()
    if (want.current) loadHidden()
  }, [loadCompanies, loadHidden])

  // The undo has passed: erase what can go for good. The rest stays hidden.
  const settle = useCallback(() => {
    const p = pending.current
    if (!p) return
    pending.current = null
    window.clearTimeout(p.timer)
    if (p.erasable.length === 0) return
    void window.tearsheet.eraseReports(p.erasable).then(() => {
      if (want.current) loadHidden()
    })
  }, [loadHidden])

  const undo = useCallback(async () => {
    const p = pending.current
    if (!p) return
    pending.current = null
    window.clearTimeout(p.timer)
    if (p.restore) await window.tearsheet.showReports(p.hidden)
    refresh()
  }, [refresh])

  const hide = useCallback(
    async (reportIds: string[], who: Pick<CompanyRow, 'ticker'>[], restore: boolean) => {
      if (reportIds.length === 0) return
      settle()
      const r = await window.tearsheet.hideReports(reportIds)
      if (!r.ok || !r.result) {
        notify('The report wasn’t deleted', r.error?.message || 'Tearsheet’s engine didn’t answer.', 'stop')
        return
      }
      const { hidden: done, erasable } = r.result
      gone.current(done)
      refresh()
      pending.current = { hidden: done, erasable, restore, timer: window.setTimeout(settle, UNDO_MS) }
      const said = deleteNotice(who, done.length, erasable.length)
      notify(said.title, said.text, undefined, { action: { label: 'Undo', run: () => void undo() }, ms: UNDO_MS })
    },
    [notify, refresh, settle, undo]
  )

  // Every report of each company row.
  const remove = useCallback((rows: CompanyRow[]) => void hide(rows.flatMap((c) => c.report_ids), rows, true), [hide])
  // One report, from the toolbar's menu of the company's reports.
  const removeOne = useCallback((reportId: string, ticker: string) => void hide([reportId], [{ ticker }], true), [hide])
  // A report already hidden: Undo keeps it hidden.
  const removeHidden = useCallback((report: ReportSummary) => void hide([report.report_id], [{ ticker: report.ticker ?? 'hidden' }], false), [hide])

  const bringBack = useCallback(
    async (report: ReportSummary) => {
      const r = await window.tearsheet.showReports([report.report_id])
      if (!r.ok) {
        notify('The report didn’t come back', r.error?.message || 'Tearsheet’s engine didn’t answer.', 'stop')
        return
      }
      refresh()
      notify(`Brought back the ${report.ticker ?? ''} report`.replace('  ', ' '))
    },
    [notify, refresh]
  )

  const pin = useCallback(
    async (row: CompanyRow, pinned: boolean) => {
      const r = await window.tearsheet.pinCompany(row.cik, pinned)
      if (!r.ok) notify(pinned ? `${row.ticker} wasn’t pinned` : `${row.ticker} wasn’t unpinned`, r.error?.message || 'Tearsheet’s engine didn’t answer.', 'stop')
      loadCompanies()
    },
    [loadCompanies, notify]
  )

  return { hidden, setWantHidden, remove, removeOne, removeHidden, bringBack, pin }
}
