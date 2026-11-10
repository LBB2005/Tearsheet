// The report page's state, kept in the shell so the toolbar, the menus and the flag sheet can
// share it (pages/Report.tsx draws it). It asks the engine for the report in the view and column
// the window needs (view.ts), keeps the company's other reports for the subtitle's menu, holds
// the flag sheet that a Flag link in the frame opens (tearsheet://flag/…, main/navigation.ts),
// and holds the chart split: whether it is open, and where its divider sits (chart/split.ts). The
// split's panel shows one view at a time (panel/state.ts): the price chart, or a chart or table
// that a link in the frame opened bigger (tearsheet://open/…).

import { useCallback, useEffect, useRef, useState } from 'react'

import type { ViewId } from '../../main/navigation'
import type { ReportResult, ReportSummary } from '../../shared/protocol'
import type { Split } from '../chart/split'
import { markReportSeen, reportEntrance, splitOutMs } from '../motion'
import type { Notice } from '../overlays/Toast'
import { ViewMemory } from '../panel/memory'
import { asked as askedView, FIRST, opened, switched, type Panel } from '../panel/state'
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
  // The report the frame shows, once it has loaded; null while another one loads. It is laid
  // out by the frame's own width (view.ts), so the chart opening, closing or resizing never
  // loads it again, and the reader keeps their place.
  report: ReportResult | null
  // Names the text frame's load: a new one (another report or view, ⌘1 / ⌘2) replaces the
  // frame. The window crossing 1,100 px doesn't: the report lays itself out by its own width.
  textKey: string
  // The same report with Numbers as its one column, loaded the first time the switch picks it
  // (without the entrance motion), so switching never reloads either frame and each keeps its
  // own place. Null until then, and again once the text frame's load changes.
  numbers: ReportResult | null
  // The numbers frame has drawn, so it can be shown without a blank moment.
  numbersReady: boolean
  setNumbersReady: (ready: boolean) => void
  // The report is down to one column beside the chart (view.ts oneColumn); the page measures it.
  oneColumn: boolean
  setOneColumn: (one: boolean) => void
  error: string | null
  // The open report's row in list_reports, for the toolbar while the report itself loads.
  listed: ReportSummary | null
  view: View
  side: Side
  // The chart is open beside the report, or on its way out (`chartClosing`).
  chartOpen: boolean
  chartClosing: boolean
  // Where the chart sits while it is open; null until the report page places it at Half as it
  // opens. Nothing is kept once it closes.
  split: Split | null
  // What the panel shows, and what each of its views remembers; both start afresh for each report.
  panel: Panel
  memory: ViewMemory
  // Changes when the company's full price history has downloaded, so the views' numbers load
  // again with the longer spans.
  numbersVersion: number
  others: ReportSummary[]
  flag: FlagRequest | null
  // ⌘1 and ⌘2: reload the frame with that view, even if the frame's own switch moved away.
  show: (view: View) => void
  setSide: (side: Side) => void
  toggleChart: () => void
  // A link in the frame: opens the panel on that view, or switches it there, without touching the
  // report frames.
  openView: (view: ViewId, item: string | null) => void
  // The panel's own switch, between the price chart and the last view.
  showView: (view: ViewId) => void
  historyDownloaded: () => void
  // Moves the divider, or picks one of the chart's width buttons.
  setSplit: (split: Split) => void
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
  const [textKey, setTextKey] = useState('')
  const [numbersDoc, setNumbersDoc] = useState<{ key: string; doc: ReportResult } | null>(null)
  const [numbersReady, setNumbersReady] = useState(false)
  const [oneColumn, setOneColumn] = useState(false)
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
  const [numbersVersion, setNumbersVersion] = useState(0)
  // The panel and its views' memory belong to one report. Another report starts on the price
  // chart with nothing remembered, reset here as it renders, so a view never draws for it with
  // the last report's view or state.
  const [held, setHeld] = useState(() => ({ reportId, panel: FIRST, memory: new ViewMemory() }))
  let mine = held
  if (held.reportId !== reportId) {
    mine = { reportId, panel: FIRST, memory: new ViewMemory() }
    setHeld(mine)
  }
  const panelNow = useRef(mine.panel)
  panelNow.current = mine.panel

  const chartOpen = chart !== 'closed'
  const view: View = chosen.reportId === reportId ? chosen.view : 'summary'
  const opts = renderOptions({ view, side: 'text', motion: true })
  const report = loaded && loaded.report_id === reportId ? loaded : null

  // The last load asked for, and the last one shown: only the newest answer counts, and coming
  // back to the page doesn't reload a report already showing as asked.
  const latest = useRef(0)
  const shownKey = useRef('')
  const key = JSON.stringify([reportId, opts.view, asked])

  useEffect(() => {
    if (!active || !reportId || key === shownKey.current) return
    const ask = ++latest.current
    setError(null)
    const done = (result: ReportResult | null, problem: string | null) => {
      if (ask !== latest.current) return
      if (result) {
        shownKey.current = key
        setLoaded(result)
        setTextKey(key)
        markReportSeen(result.report_id)
      }
      setError(problem)
    }
    // The report's own entrance plays the first time it is ever opened (motion.ts), not each time
    // it loads again (another view, coming back to it).
    window.tearsheet.getReport(reportId, { ...opts, motion: reportEntrance(reportId) }).then(
      (r) => (r.ok && r.result ? done(r.result, null) : done(null, r.error?.message || 'Tearsheet’s engine didn’t answer.')),
      (e: unknown) => done(null, e instanceof Error ? e.message : 'Tearsheet’s engine didn’t answer.')
    )
  }, [active, reportId, key, opts.view])

  // The numbers frame, the first time the switch picks Numbers for the text frame on show. A
  // failed load leaves the text on show; picking Numbers again tries again.
  const numbers = numbersDoc && numbersDoc.key === textKey && report ? numbersDoc.doc : null
  const numbersAsk = useRef('')
  useEffect(() => {
    // Only while the switch can show it: the chart open beside the report, in a wide window.
    if (!active || !reportId || side !== 'numbers' || !chartOpen || !wide || !report || textKey !== key) return
    if (numbersDoc?.key === key || numbersAsk.current === key) return
    numbersAsk.current = key
    const ask = key
    window.tearsheet.getReport(reportId, renderOptions({ view, side: 'numbers', motion: false })).then(
      (r) => {
        if (r.ok && r.result) {
          setNumbersReady(false)
          setNumbersDoc({ key: ask, doc: r.result })
        } else numbersAsk.current = ''
      },
      () => {
        numbersAsk.current = ''
      }
    )
  }, [active, reportId, side, chartOpen, report, textKey, key, numbersDoc, view, wide])

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

  // An open link in the frame, while the report page is showing a report.
  const activeNow = useRef(active)
  activeNow.current = active
  const reportNow = useRef(reportId)
  reportNow.current = reportId
  const openViewNow = useRef<(view: ViewId, item: string | null) => void>(() => {})
  useEffect(
    () =>
      window.tearsheet.onOpenView(({ view, item }) => {
        if (activeNow.current && reportNow.current) openViewNow.current(view, item)
      }),
    []
  )

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
  const setPanel = useCallback((next: Panel) => {
    panelNow.current = next
    setHeld((h) => ({ ...h, panel: next }))
  }, [])
  // Opens the panel, or stops it sliding shut. From closed, the switch starts on Text and the
  // panel is placed afresh (at Half, by the report page).
  const openPanel = useCallback(() => {
    window.clearTimeout(closeTimer.current)
    if (chartNow.current === 'closed') {
      setSide('text')
      setSplitState(null)
    }
    setChart('open')
  }, [])
  // ⌘3 and the Chart button open the panel on the price chart (or stop it sliding shut), and
  // close it whatever it shows.
  const toggleChart = useCallback(() => {
    window.clearTimeout(closeTimer.current)
    if (chartNow.current === 'open') {
      setChart('closing')
      closeTimer.current = window.setTimeout(() => setChart('closed'), splitOutMs())
    } else {
      if (chartNow.current === 'closed') setPanel(opened(panelNow.current))
      openPanel()
    }
  }, [openPanel, setPanel])
  // A link opens the panel as ⌘3 would, then on the view it names: a closed panel starts afresh,
  // so the price chart that mounts in it counts only this opening's links for its range. A link
  // while the panel slides shut opens it again. It never reloads the report: the text frame's
  // load is left as it is.
  const openView = useCallback(
    (view: ViewId, item: string | null) => {
      const from = chartNow.current === 'closed' ? opened(panelNow.current) : panelNow.current
      const next = askedView(from, chartNow.current === 'open', view, item)
      if (!next) return
      setPanel(next)
      if (chartNow.current !== 'open') openPanel()
    },
    [openPanel, setPanel]
  )
  openViewNow.current = openView
  const showView = useCallback((view: ViewId) => setPanel(switched(panelNow.current, view)), [setPanel])
  const historyDownloaded = useCallback(() => setNumbersVersion((n) => n + 1), [])
  const setSplit = useCallback((next: Split) => setSplitState(next), [])
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
    textKey,
    numbers,
    numbersReady,
    setNumbersReady,
    oneColumn,
    setOneColumn,
    error,
    listed: list.find((r) => r.report_id === reportId) ?? null,
    view,
    side,
    chartOpen,
    chartClosing: chart === 'closing',
    split,
    panel: mine.panel,
    memory: mine.memory,
    numbersVersion,
    others: report ? otherReports(list, report.cik, report.report_id) : [],
    flag,
    show,
    setSide,
    toggleChart,
    openView,
    showView,
    historyDownloaded,
    setSplit,
    closeFlag,
    saveFlag
  }
}
