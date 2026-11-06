// The report page's state, kept in the shell so the toolbar, the menus and the flag sheet can
// share it (pages/Report.tsx draws it). It asks the engine for the report in the view and column
// the window needs (view.ts), keeps the company's other reports for the subtitle's menu, holds
// the flag sheet that a Flag link in the frame opens (tearsheet://flag/…, main/navigation.ts),
// and holds the chart split: whether it is open, and where its divider sits (chart/split.ts).

import { useCallback, useEffect, useRef, useState } from 'react'

import type { ReportResult, ReportSummary } from '../../shared/protocol'
import { setLastWidth } from '../chart/prefs'
import type { Split } from '../chart/split'
import { splitOutMs } from '../motion'
import type { Notice } from '../overlays/Toast'
import { flagClaimId, otherReports, renderOptions, type Side, type View } from './view'

// Enough to hold every report of one company; list_reports is newest first.
const LIST_LIMIT = 500

export interface FlagRequest {
  reportId: string
  claimId: string
  // The claim's sentence, as plain text, when it can be found in the report.
  text: string | null
}

export interface ReportPage {
  // The report asked for, which may still be loading.
  reportId: string | null
  // The report the frame shows, once it has loaded; null while another one loads.
  report: ReportResult | null
  // Changes with every load, so the frame reloads and its scroll position resets.
  frame: number
  error: string | null
  // The open report's row in list_reports, for the toolbar while the report itself loads.
  listed: ReportSummary | null
  view: View
  side: Side
  // The chart is open beside the report, or on its way out (`chartClosing`).
  chartOpen: boolean
  chartClosing: boolean
  // Where the chart sits while it is open; null until the report page places it as it opens
  // (from the Settings choice "When the chart opens" and the space there is).
  split: Split | null
  others: ReportSummary[]
  flag: FlagRequest | null
  // ⌘1 and ⌘2: reload the frame with that view, even if the frame's own switch moved away.
  show: (view: View) => void
  setSide: (side: Side) => void
  toggleChart: () => void
  // Moves the divider; `keep` remembers the place for "Where I left it".
  setSplit: (split: Split, keep?: boolean) => void
  closeFlag: () => void
  // Saves the flag; answers with what went wrong, or null once it is saved.
  saveFlag: (note: string) => Promise<string | null>
}

interface Options {
  reportId: string | null
  wide: boolean
  // The report page is showing (or on its way in); nothing loads while it isn't.
  active: boolean
  notify: (title: string, text?: string, tone?: Notice['tone']) => void
  // Changes when the sidebar's list does, so a newly written report joins the menu.
  refresh?: unknown
}

// The sentence of a claim, found by its Flag link. The report's HTML is parsed into an inert
// document (no scripts run, nothing loads), and only its text is taken.
function claimText(html: string | undefined, claimId: string): string | null {
  if (!html) return null
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const href = `tearsheet://flag/${claimId}`
    const link = Array.from(doc.querySelectorAll('a.flag')).find((a) => a.getAttribute('href') === href)
    return link?.closest('.cl')?.querySelector('p')?.textContent?.trim() || null
  } catch {
    return null
  }
}

export function useReport({ reportId, wide, active, notify, refresh }: Options): ReportPage {
  const [loaded, setLoaded] = useState<ReportResult | null>(null)
  const [frame, setFrame] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // Each report opens on its Summary; the view chosen applies to that report only.
  const [chosen, setChosen] = useState<{ reportId: string | null; view: View }>({ reportId: null, view: 'summary' })
  // Counts ⌘1 / ⌘2 presses, so pressing one always reloads.
  const [asked, setAsked] = useState(0)
  const [side, setSide] = useState<Side>('text')
  const [chart, setChart] = useState<'closed' | 'open' | 'closing'>('closed')
  const [split, setSplitState] = useState<Split | null>(null)
  const [list, setList] = useState<ReportSummary[]>([])
  const [flag, setFlag] = useState<FlagRequest | null>(null)

  const chartOpen = chart !== 'closed'
  const view: View = chosen.reportId === reportId ? chosen.view : 'summary'
  const opts = renderOptions({ view, side, chartOpen, wide })
  const report = loaded && loaded.report_id === reportId ? loaded : null

  // The last load asked for, and the last one shown: only the newest answer counts, and coming
  // back to the page doesn't reload a report already showing as asked.
  const latest = useRef(0)
  const shownKey = useRef('')
  const key = JSON.stringify([reportId, opts.view, opts.column, opts.narrow, asked])

  useEffect(() => {
    if (!active || !reportId || key === shownKey.current) return
    const ask = ++latest.current
    setError(null)
    const done = (result: ReportResult | null, problem: string | null) => {
      if (ask !== latest.current) return
      if (result) {
        shownKey.current = key
        setLoaded(result)
        setFrame((n) => n + 1)
      }
      setError(problem)
    }
    window.tearsheet.getReport(reportId, { view: opts.view, column: opts.column, narrow: opts.narrow }).then(
      (r) => (r.ok && r.result ? done(r.result, null) : done(null, r.error?.message || 'Tearsheet’s engine didn’t answer.')),
      (e: unknown) => done(null, e instanceof Error ? e.message : 'Tearsheet’s engine didn’t answer.')
    )
  }, [active, reportId, key, opts.view, opts.column, opts.narrow])

  // The company's reports, for the subtitle's menu of its other reports.
  useEffect(() => {
    if (!active || !reportId) return
    let live = true
    void window.tearsheet.listReports(LIST_LIMIT).then((r) => {
      if (live && r.ok && r.result) setList(r.result)
    })
    return () => {
      live = false
    }
  }, [active, reportId, refresh])

  // A Flag link in the frame. The sheet names the claim by the report on show.
  const html = useRef<string | undefined>(undefined)
  html.current = report?.html
  const shownId = useRef<string | null>(null)
  shownId.current = report?.report_id ?? null
  useEffect(
    () =>
      window.tearsheet.onFlagRequested(({ claimId }) => {
        const id = shownId.current
        if (id) setFlag({ reportId: id, claimId, text: claimText(html.current, claimId) })
      }),
    []
  )
  // The sheet belongs to the report it was opened on.
  useEffect(() => setFlag(null), [reportId, active])

  const show = useCallback(
    (next: View) => {
      setChosen({ reportId, view: next })
      setAsked((n) => n + 1)
    },
    [reportId]
  )
  // ⌘3 and the Chart button. Opening starts the Numbers / Text switch on Text every time, and
  // places the chart afresh; closing lets the split slide away before the report gets its
  // columns back.
  const chartNow = useRef(chart)
  chartNow.current = chart
  const closeTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(closeTimer.current), [])
  const toggleChart = useCallback(() => {
    window.clearTimeout(closeTimer.current)
    if (chartNow.current === 'open') {
      setChart('closing')
      closeTimer.current = window.setTimeout(() => setChart('closed'), splitOutMs())
    } else {
      if (chartNow.current === 'closed') {
        setSide('text')
        setSplitState(null)
      }
      setChart('open')
    }
  }, [])
  const setSplit = useCallback((next: Split, keep = false) => {
    setSplitState(next)
    if (keep) setLastWidth(next)
  }, [])
  const closeFlag = useCallback(() => setFlag(null), [])

  const saveFlag = useCallback(
    async (note: string): Promise<string | null> => {
      if (!flag) return null
      const reply = await window.tearsheet.flagClaim(flagClaimId(flag.reportId, flag.claimId), note)
      if (!reply.ok) return reply.error?.message || 'The flag wasn’t saved.'
      notify('Flag saved', 'Resolve it in the next spot-check.')
      return null
    },
    [flag, notify]
  )

  return {
    reportId,
    report,
    frame,
    error,
    listed: list.find((r) => r.report_id === reportId) ?? null,
    view,
    side,
    chartOpen,
    chartClosing: chart === 'closing',
    split,
    others: report ? otherReports(list, report.cik, report.report_id) : [],
    flag,
    show,
    setSide,
    toggleChart,
    setSplit,
    closeFlag,
    saveFlag
  }
}
