// The app shell: the sidebar, the toolbar and the page frame, routed by page. It opens on the
// first-time setup until setup is finished (setup_done), and on the home page after that. The
// other pages are still the interim views (views/) until their replacements land: home is New
// report (or the run while one is going), then the report, the prediction log, and settings with
// connections.

import { useCallback, useEffect, useRef, useState } from 'react'

import type { MenuCommand } from '../main/menu'
import type { EngineNotification, ToolStatus } from '../preload/api'
import type { CompanyRow, SearchHit } from '../shared/protocol'
import { leaveMs, readyPauseMs } from './motion'
import { nextCompany, shortDate, statusLine, type Page } from './nav'
import { LookUp } from './overlays/LookUp'
import { Toast, type Notice } from './overlays/Toast'
import { Setup } from './pages/Setup'
import { applySafetyNote, safetyStarted, type SafetyState, type ToolKind } from './setup/steps'
import { Sidebar, SidebarButton } from './shell/Sidebar'
import { Toolbar } from './shell/Toolbar'
import { useWide } from './shell/useWide'
import { Connections } from './views/Connections'
import { Log } from './views/Log'
import { Progress, type RunState } from './views/Progress'
import { Report } from './views/Report'
import { Search } from './views/Search'
import { Settings } from './views/Settings'

export function App() {
  const wide = useWide()
  const [page, setPage] = useState<Page>('home')
  // False until the settings say whether to open on setup or on home.
  const [booted, setBooted] = useState(false)
  // Into the app from setup: the sidebar opens by width while the home page fades up.
  const [opening, setOpening] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [run, setRun] = useState<RunState | null>(null)
  const [runLabel, setRunLabel] = useState('')
  // Holds the run view on screen for the "report ready" moment before the report opens.
  const [readyHold, setReadyHold] = useState(false)
  const [openReport, setOpenReport] = useState<string | null>(null)
  const [fatal, setFatal] = useState<string | null>(null)
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [tools, setTools] = useState<ToolStatus[]>([])
  const [primaryTool, setPrimaryTool] = useState<string | null>(null)
  // This session's safety check; setup's chip and the sidebar's status line both read it.
  const [safety, setSafety] = useState<SafetyState | null>(null)
  const [sideHidden, setSideHidden] = useState(false)
  const [sideOver, setSideOver] = useState(false)
  const [lookUp, setLookUp] = useState(false)
  const [finding, setFinding] = useState(false)
  const [findFocus, setFindFocus] = useState(0)
  const [notice, setNotice] = useState<Notice | null>(null)

  // The page being shown, or the one on its way in while the old one leaves.
  const target = useRef<Page>('home')
  const switchTimer = useRef<number | undefined>(undefined)
  const noticeId = useRef(0)

  // Change pages: the content fades and lifts away, then the new page settles in.
  const go = useCallback((next: Page) => {
    if (next === target.current) return
    target.current = next
    window.clearTimeout(switchTimer.current)
    setLeaving(true)
    switchTimer.current = window.setTimeout(() => {
      setPage(next)
      setLeaving(false)
      setReadyHold(false)
    }, leaveMs())
  }, [])

  const notify = useCallback((title: string, text?: string, tone?: Notice['tone']) => {
    noticeId.current += 1
    setNotice({ id: noticeId.current, title, text, tone })
  }, [])

  const loadCompanies = useCallback(() => {
    void window.tearsheet.listCompanies().then((r) => {
      if (r.ok && r.result) setCompanies(r.result)
    })
  }, [])
  const loadTools = useCallback((force = false) => {
    void window.tearsheet.getTools(force).then(setTools)
  }, [])

  // Grade whatever has come due each time the app opens (design item 48). It waits behind any
  // run, and behind the calls before it, so the sidebar fills first; grading may update prices.
  // During setup it waits until setup is finished, so it can't hold up the key checks.
  const gradeDue = useCallback(() => {
    void window.tearsheet.gradeDue().then(loadCompanies)
  }, [loadCompanies])

  useEffect(() => {
    loadCompanies()
    loadTools()
    void window.tearsheet.getSettings().then((r) => {
      if (r.ok && r.result) setPrimaryTool(r.result.primary_tool)
      // Setup until it is finished (Ruling 3). If the settings can't be read, open on home,
      // where the engine's problem shows.
      const first: Page = r.ok && r.result && !r.result.setup_done ? 'setup' : 'home'
      target.current = first
      setPage(first)
      setBooted(true)
      if (first === 'home') gradeDue()
    })
  }, [loadCompanies, loadTools, gradeDue])

  useEffect(() => {
    return window.tearsheet.onNotification((note: EngineNotification) => {
      const p = note.params as Record<string, never>
      if (note.method === 'progress') {
        setRun((r) => (r && r.runId === p.run_id ? { ...r, steps: { ...r.steps, [p.step_name]: p.state } } : r))
      } else if (note.method === 'report_ready') {
        setRun((r) => (r && r.runId === p.run_id ? { ...r, reportId: p.report_id } : r))
        setOpenReport(p.report_id)
        loadCompanies()
        // On the run view, hold the "report ready" moment before opening the report.
        if (target.current === 'home') {
          setReadyHold(true)
          window.setTimeout(() => {
            if (target.current === 'home') go('report')
            else setReadyHold(false)
          }, readyPauseMs())
        } else go('report')
      } else if (note.method === 'run_failed') {
        setRun((r) => (r && r.runId === p.run_id ? { ...r, failure: { message: p.message, code: p.code, resetAt: p.reset_at, fix: p.fix_command } } : r))
        if (p.code === 'AUTH_EXPIRED') loadTools(true)
        go('home')
      } else if (note.method === 'safety_progress' || note.method === 'safety_done') {
        setSafety((s) => applySafetyNote(s, note.method, note.params))
      } else if (note.method === 'engine_restarted') {
        setRun((r) => (r ? { ...r, failure: { message: 'The engine stopped and was restarted. You can resume the run.', code: 'ENGINE_ERROR' } } : r))
        setSafety((s) => applySafetyNote(s, note.method, note.params))
        notify('The engine stopped and was restarted', 'Your saved reports are safe.', 'stop')
      } else if (note.method === 'engine_fatal') {
        setFatal(String(p.message))
        // The settings may never answer now; open on home, where the problem shows.
        setBooted(true)
      }
    })
  }, [go, loadCompanies, loadTools, notify])

  // Setup started the safety check; it counts from 0 until the engine's first note.
  const safetyBegan = useCallback((tool: ToolKind) => {
    setSafety((s) => (s && s.tool === tool && !s.done ? s : safetyStarted(tool)))
  }, [])

  // Open Tearsheet, at the end of setup: the tool may be new, so look again, then grade and go
  // home with the sidebar.
  const openingTimer = useRef<number | undefined>(undefined)
  const setupFinished = useCallback(() => {
    loadTools(true)
    void window.tearsheet.getSettings().then((r) => {
      if (r.ok && r.result) setPrimaryTool(r.result.primary_tool)
    })
    gradeDue()
    setOpening(true)
    window.clearTimeout(openingTimer.current)
    openingTimer.current = window.setTimeout(() => setOpening(false), leaveMs() + 900)
    go('home')
  }, [go, gradeDue, loadTools])

  // A run started from the home page or the look-up box. A resumed run keeps its label.
  const started = (runId: string, query?: string) => {
    setRun({ runId, steps: {}, reportId: null, failure: null })
    setReadyHold(false)
    if (query !== undefined) {
      setRunLabel(query)
      void window.tearsheet.searchCompanies(query, 1).then((r) => {
        if (r.ok && r.result?.[0]) setRunLabel(r.result[0].ticker)
      })
    }
    go('home')
  }

  const openCompany = (row: CompanyRow) => {
    setOpenReport(row.report_id)
    setSideOver(false)
    go('report')
  }

  const newReport = () => {
    setSideOver(false)
    // On the home page, New report puts a stopped run away so a new one can start.
    if (target.current === 'home' && run && !run.reportId && run.failure) setRun(null)
    go('home')
  }

  // ⌘K: on the home page, its own field takes the cursor; elsewhere the look-up box opens.
  const openLookUp = () => {
    setSideOver(false)
    const field = document.querySelector<HTMLInputElement>('.pagebody[data-page="home"] input[type="text"]')
    if (target.current === 'home' && field) {
      field.focus()
      field.select()
    } else setLookUp(true)
  }

  const pick = async (hit: SearchHit) => {
    if (hit.report_id) {
      setOpenReport(hit.report_id)
      go('report')
      return
    }
    const reply = await window.tearsheet.runReport(hit.ticker)
    if (reply.ok && reply.result) started(reply.result.run_id, hit.ticker)
    else if (reply.error?.code === 'RUN_IN_PROGRESS') notify('A report is already running', 'You can start another when it finishes.', 'stop')
    else notify('The report didn’t start', reply.error?.message, 'stop')
  }

  const currentTicker = () => (target.current === 'report' ? companies.find((c) => c.report_id === openReport)?.ticker ?? null : null)
  const step = (dir: 1 | -1) => {
    const ticker = nextCompany(companies, currentTicker(), dir)
    const row = companies.find((c) => c.ticker === ticker)
    if (row) openCompany(row)
  }

  // Wide windows hide and show the sidebar in place; narrow ones open it over the page.
  const toggleSidebar = () => (wide ? setSideHidden((h) => !h) : setSideOver((o) => !o))
  useEffect(() => {
    if (wide) setSideOver(false)
  }, [wide])
  // A sidebar opened over the page closes once the page changes.
  useEffect(() => setSideOver(false), [page])
  useEffect(() => {
    if (!sideOver) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSideOver(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sideOver])

  const openFind = () => {
    setFinding(true)
    setFindFocus((n) => n + 1)
  }
  // Finding belongs to the page it started on.
  const findingNow = useRef(finding)
  findingNow.current = finding
  useEffect(() => {
    if (!findingNow.current) return
    void window.tearsheet.stopFind()
    setFinding(false)
  }, [page])

  const onMenu = (command: MenuCommand) => {
    // Setup comes first: the menus' pages open once it is finished.
    if (target.current === 'setup') return
    if (command === 'new') newReport()
    else if (command === 'lookup') openLookUp()
    else if (command === 'prev') step(-1)
    else if (command === 'next') step(1)
    else if (command === 'sidebar') toggleSidebar()
    else if (command === 'find') openFind()
    else if (command === 'settings') go('settings')
    // 'summary', 'full' and 'chart' arrive with the new report page and the chart.
  }
  const menu = useRef(onMenu)
  menu.current = onMenu
  useEffect(() => window.tearsheet.onMenu((c) => menu.current(c)), [])

  const tool = tools.find((t) => t.kind === (primaryTool ?? 'claude')) ?? tools.find((t) => t.available) ?? tools[0]
  const running = run !== null && !run.reportId && !run.failure
  const status = statusLine({
    run: running ? { ticker: runLabel, steps: run.steps } : null,
    safety: safety && !safety.done ? { n: safety.n, total: safety.total } : null,
    tools: tool?.name ?? 'Claude Code',
    signedOut: tool?.available === true && tool.loggedIn === false
  })

  const homeShowsRun = (run !== null && !run.reportId) || readyHold
  const company = companies.find((c) => c.report_id === openReport)
  const bar =
    page === 'report'
      ? { title: company?.name ?? 'Reports', subtitle: company ? `Report of ${shortDate(company.report_date)}` : undefined }
      : page === 'log'
        ? { title: 'Prediction log' }
        : page === 'settings'
          ? { title: 'Settings', subtitle: 'and connections' }
          : {}

  let content = null
  if (page === 'home') content = homeShowsRun ? <Progress run={run} onResumed={(id) => started(id)} /> : <Search onStarted={started} />
  else if (page === 'report') content = <Report openId={openReport} onOpen={setOpenReport} />
  else if (page === 'log') content = <Log />
  else if (page === 'settings')
    content = (
      <>
        <Settings />
        <Connections />
      </>
    )

  const sideShown = page !== 'setup' && (wide ? !sideHidden : sideOver)
  const cls = ['win', `on-${page}`, wide ? '' : 'narrow', sideShown ? '' : 'sbhidden', !wide && sideOver ? 'sbover' : '', opening ? 'opening' : ''].filter(Boolean).join(' ')

  // Until the settings answer, the window is empty glass.
  if (!booted)
    return (
      <div className="win on-setup sbhidden">
        <div className="mainarea" />
      </div>
    )

  const fatalNotice = fatal && (
    <p className="notice error fatal" role="alert">
      {fatal}
    </p>
  )

  return (
    <div className={cls}>
      {page !== 'setup' && <SidebarButton shown={sideShown} onClick={toggleSidebar} />}
      <Sidebar
        page={page}
        companies={companies}
        openReport={openReport}
        status={status}
        onNew={newReport}
        onLookUp={openLookUp}
        onCompany={openCompany}
        onPage={(p) => {
          setSideOver(false)
          go(p)
        }}
      />
      {!wide && sideOver && <div className="sidescrim" onMouseDown={() => setSideOver(false)} />}
      <div className="mainarea">
        {page === 'setup' ? (
          <Setup leaving={leaving} safety={safety} onSafetyStarted={safetyBegan} onFinish={setupFinished}>
            {fatalNotice}
          </Setup>
        ) : (
          <>
            <Toolbar
              title={bar.title}
              subtitle={bar.subtitle}
              bare={page === 'home' && !homeShowsRun}
              finding={finding}
              findFocus={findFocus}
              onFindClose={() => setFinding(false)}
            />
            {fatalNotice}
            <main key={page === 'home' && homeShowsRun ? 'home-run' : page} className={leaving ? 'pagebody leave' : 'pagebody enter'} data-page={page}>
              {content}
            </main>
          </>
        )}
        {lookUp && <LookUp onPick={(hit) => void pick(hit)} onClose={() => setLookUp(false)} />}
      </div>
      <div className="toasts" aria-live="polite">
        {notice && <Toast key={notice.id} notice={notice} onDone={() => setNotice((n) => (n && n.id === notice.id ? null : n))} />}
      </div>
    </div>
  )
}
