// The app shell: the sidebar, the toolbar and the page frame, routed by page. It opens on the
// first-time setup until setup is finished (setup_done), and on the home page after that. Home is
// New report, and shows the run view while a report is written (home/useRun.ts). The report page
// keeps its state in report/useReport.ts, so the toolbar, the menus and the flag sheet share it.
// The prediction log grades through the same gradeDue as the launch, so the sidebar's status line
// follows it; Settings shares the AI tools and this session's safety check with the sidebar.

import { useCallback, useEffect, useRef, useState } from 'react'

import type { MenuCommand } from '../main/menu'
import type { CallResult, EngineNotification, ToolStatus } from '../preload/api'
import type { CompanyRow, GradeResult, SearchHit, SettingsResult } from '../shared/protocol'
import { bootView, GIVE_UP_AFTER_MS, STARTING_AFTER_MS } from './boot'
import { forgetOldChartPrefs, setSidebarHidden, sidebarHidden } from './chart/prefs'
import { runTitle } from './home/run'
import { RunView } from './home/RunView'
import { useRun } from './home/useRun'
import { Mark } from './mark/Mark'
import { leaveMs, pageEntrance, pageLeaveMs } from './motion'
import { nextCompany, safetyFailed, safetyUnfinished, shortDate, statusLine, type Page } from './nav'
import { FlagSheet } from './overlays/FlagSheet'
import { LookUp } from './overlays/LookUp'
import { Toast, type Notice } from './overlays/Toast'
import { Home } from './pages/Home'
import { Log } from './pages/Log'
import { Report, ReportSubtitle, ReportTools } from './pages/Report'
import { Settings } from './pages/Settings'
import { Setup } from './pages/Setup'
import { useReport } from './report/useReport'
import { topicName, type Topic } from './settings/topics'
import { nextView, reportSubtitle } from './report/view'
import { applySafetyNote, SAFETY_CALLS, safetyStarted, type SafetyState, type ToolKind } from './setup/steps'
import { Sidebar, SidebarButton } from './shell/Sidebar'
import { Toolbar } from './shell/Toolbar'
import { useWide } from './shell/useWide'

export function App() {
  const wide = useWide()
  const [page, setPage] = useState<Page>('home')
  // False until the settings say whether to open on setup or on home. Until then the window
  // shows empty glass, then "Starting Tearsheet…", or why the engine can't start (boot.ts).
  const [booted, setBooted] = useState(false)
  const [bootSettings, setBootSettings] = useState<SettingsResult | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [waited, setWaited] = useState(0)
  const [bootTry, setBootTry] = useState(0)
  // Into the app from setup: the sidebar opens by width while the home page fades up.
  const [opening, setOpening] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [openReport, setOpenReport] = useState<string | null>(null)
  const [fatal, setFatal] = useState<string | null>(null)
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  // False until the first list arrives, so the home page knows a new user from a returning one.
  const [listed, setListed] = useState(false)
  // Past predictions being graded (grade_due); no report starts until it is done. `graded`
  // counts the gradings finished, so the home page asks for the predictions again.
  const [grading, setGrading] = useState(false)
  const [graded, setGraded] = useState(0)
  const [tools, setTools] = useState<ToolStatus[]>([])
  const [primaryTool, setPrimaryTool] = useState<string | null>(null)
  // This session's safety check; setup's chip and the sidebar's status line both read it.
  const [safety, setSafety] = useState<SafetyState | null>(null)
  // Kept between launches (chart/prefs.ts, sidebar.hidden).
  const [sideHidden, setSideHidden] = useState(sidebarHidden)
  // An earlier version kept the chart's last width; it opens at Half now.
  useEffect(() => forgetOldChartPrefs(), [])
  const [sideOver, setSideOver] = useState(false)
  const [lookUp, setLookUp] = useState(false)
  const [finding, setFinding] = useState(false)
  const [findFocus, setFindFocus] = useState(0)
  const [notice, setNotice] = useState<Notice | null>(null)
  // The prediction log's line in the toolbar ("2 logged, 0 graded"), once it has loaded.
  const [logLine, setLogLine] = useState<string | undefined>(undefined)
  // The Settings topic shown. It stays put between visits, and the toolbar names it.
  const [settingsTopic, setSettingsTopic] = useState<Topic>('general')

  // The page being shown, or the one on its way in while the old one leaves.
  const target = useRef<Page>('home')
  const switchTimer = useRef<number | undefined>(undefined)
  const noticeId = useRef(0)
  // The home page's field, for ⌘K.
  const homeField = useRef<HTMLInputElement>(null)

  // Change pages: the new page takes the old one's place at once and comes in with a quick fade.
  // Under Animations Full, the content first fades and lifts away (motion.ts).
  const go = useCallback((next: Page) => {
    if (next === target.current) return
    target.current = next
    window.clearTimeout(switchTimer.current)
    const away = pageLeaveMs()
    if (away === 0) {
      setLeaving(false)
      setPage(next)
      return
    }
    setLeaving(true)
    switchTimer.current = window.setTimeout(() => {
      setPage(next)
      setLeaving(false)
    }, away)
  }, [])
  // How the page frame comes in, asked once each time it does (its key changes): built up part
  // by part (`enter`), or with one quick fade (`quiet`).
  const frameKey = useRef<string | null>(null)
  const builds = useRef(false)

  const notify = useCallback((title: string, text?: string, tone?: Notice['tone']) => {
    noticeId.current += 1
    setNotice({ id: noticeId.current, title, text, tone })
  }, [])

  const loadCompanies = useCallback(() => {
    void window.tearsheet.listCompanies().then((r) => {
      if (!r.ok || !r.result) return
      setCompanies(r.result)
      setListed(true)
    })
  }, [])
  const loadTools = useCallback((force = false) => {
    void window.tearsheet.getTools(force).then(setTools)
  }, [])

  // Grade whatever has come due each time the app opens (design item 48). The engine answers it
  // off its request loop, so look-ups go on meanwhile; it waits behind any run, and no report
  // starts until it is done. Grading may update prices. During setup it waits until setup is
  // finished, so it can't hold up the key checks. The prediction log's Grade what is due comes
  // here too, and gets the engine's answer (null if it never came).
  const gradeDue = useCallback((): Promise<CallResult<GradeResult> | null> => {
    setGrading(true)
    const done = () => {
      setGrading(false)
      setGraded((n) => n + 1)
      loadCompanies()
    }
    const asked = window.tearsheet.gradeDue()
    asked.then(done, done)
    return asked.catch(() => null)
  }, [loadCompanies])

  useEffect(() => {
    loadCompanies()
    loadTools()
  }, [loadCompanies, loadTools])

  // Ask the engine for the settings: setup until it is finished (Ruling 3), else home. Try
  // again asks again; an answer that comes after the window gave up waiting still opens the app.
  useEffect(() => {
    if (booted) return
    let live = true
    setBootError(null)
    setWaited(0)
    const slow = window.setTimeout(() => setWaited(STARTING_AFTER_MS), STARTING_AFTER_MS)
    const late = window.setTimeout(() => setWaited(GIVE_UP_AFTER_MS), GIVE_UP_AFTER_MS)
    window.tearsheet.getSettings().then(
      (r) => {
        if (!live) return
        if (!r.ok || !r.result) {
          setBootError(r.error?.message || 'Tearsheet’s engine didn’t answer.')
          return
        }
        setPrimaryTool(r.result.primary_tool)
        const first: Page = r.result.setup_done ? 'home' : 'setup'
        target.current = first
        setPage(first)
        setBootSettings(r.result)
        setBooted(true)
        if (first === 'home') gradeDue()
      },
      (error: unknown) => {
        if (live) setBootError(error instanceof Error ? error.message : 'Tearsheet’s engine didn’t answer.')
      }
    )
    return () => {
      live = false
      window.clearTimeout(slow)
      window.clearTimeout(late)
    }
  }, [booted, bootTry, gradeDue])

  // The engine's gate found the tool failing its safety check during a run: the red status line
  // and the home page's red box show at once, as for a check that failed here.
  const kindNow = useRef<ToolKind>('claude')
  const lockdownFailed = useCallback((message: string) => {
    setSafety({ tool: kindNow.current, n: 0, total: SAFETY_CALLS, done: true, passed: false, stopped: false, reason: message })
  }, [])
  const report = useRun({ page, target, go, notify, loadCompanies, loadTools, openReport: setOpenReport, onLockdownFailed: lockdownFailed })
  const { run, onNote } = report
  const reportPage = useReport({ reportId: openReport, wide, active: page === 'report', notify, refresh: companies })
  // The sidebar's row for the report on show, which may be one of the company's older reports.
  const shownCik = reportPage.report?.cik ?? reportPage.listed?.cik ?? null
  const openRow = companies.find((c) => c.report_id === openReport) ?? (shownCik === null ? undefined : companies.find((c) => c.cik === shownCik))

  // The one listener for the engine's notes. The run's notes go to useRun.
  useEffect(() => {
    return window.tearsheet.onNotification((note: EngineNotification) => {
      if (note.method === 'progress' || note.method === 'report_ready' || note.method === 'run_failed') {
        onNote(note)
        // A run may have found a key that stopped working, or one that works again.
        if (note.method !== 'progress') void window.tearsheet.getSettings().then((r) => r.ok && r.result && setBootSettings(r.result))
      } else if (note.method === 'safety_progress' || note.method === 'safety_done') {
        setSafety((s) => applySafetyNote(s, note.method, note.params))
      } else if (note.method === 'engine_restarted') {
        onNote(note)
        setSafety((s) => applySafetyNote(s, note.method, note.params))
        notify('The engine stopped and was restarted', 'Your saved reports are safe.', 'stop')
      } else if (note.method === 'engine_fatal') {
        setFatal(String(note.params.message))
      } else if (note.method === 'reread_done') {
        // A Re-read this filing link in the report (tearsheet://reread/…).
        notify(`Saved evidence for ${String(note.params.accession)} was cleared`, 'The next report re-reads the filing.')
      }
    })
  }, [notify, onNote])

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

  const openCompany = (row: CompanyRow) => {
    setOpenReport(row.report_id)
    setSideOver(false)
    go('report')
  }

  const newReport = () => {
    setSideOver(false)
    // On the home page, New report puts a stopped run away so a new one can start.
    if (target.current === 'home') report.putAway()
    go('home')
  }

  // ⌘K: on the home page, its own field takes the cursor; elsewhere (and on the run view, which
  // has no field) the look-up box opens.
  const openLookUp = () => {
    setSideOver(false)
    const field = homeField.current
    if (target.current === 'home' && !leaving && field) {
      field.focus()
      field.select()
    } else setLookUp(true)
  }

  // The look-up box opens a company's report, or starts a new one.
  const pick = async (hit: SearchHit) => {
    if (hit.report_id) {
      setOpenReport(hit.report_id)
      go('report')
      return
    }
    const problem = await report.start(hit.ticker)
    if (problem) notify('The report didn’t start', problem, 'stop')
  }

  // "Run the check again", from the home page's red box.
  const recheck = async (): Promise<string | null> => {
    const kind = tool?.kind ?? 'claude'
    const reply = await window.tearsheet.runSafetyCheck(kind)
    if (reply.ok || reply.error?.code === 'SAFETY_CHECK_RUNNING') {
      safetyBegan(kind)
      return null
    }
    return reply.error?.message || 'The safety check didn’t start.'
  }

  const currentTicker = () => (target.current === 'report' ? openRow?.ticker ?? null : null)
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
  useEffect(() => setSidebarHidden(sideHidden), [sideHidden])
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
    else if (target.current === 'report') {
      // ⌘1 and ⌘2 reload the report in that view; ⌘3 opens or closes the chart.
      const view = nextView(command)
      if (view) reportPage.show(view)
      else if (command === 'chart') reportPage.toggleChart()
    }
  }
  const menu = useRef(onMenu)
  menu.current = onMenu
  useEffect(() => window.tearsheet.onMenu((c) => menu.current(c)), [])

  const tool = tools.find((t) => t.kind === (primaryTool ?? 'claude')) ?? tools.find((t) => t.available) ?? tools[0]
  const toolKind: ToolKind = tool?.kind ?? 'claude'
  kindNow.current = toolKind
  const toolName = tool?.name ?? 'Claude Code'
  const signedOut = tool?.available === true && tool.loggedIn === false
  const checkFailed = safetyFailed(safety, toolKind, bootSettings?.lockdown?.[toolKind])
  const checkUnfinished = safetyUnfinished(safety, toolKind)
  const runLabel = run ? (run.ticker ?? run.name ?? 'New report') : ''
  const status = statusLine({
    run: report.running && run ? { ticker: runLabel, steps: run.steps } : null,
    safety: safety && !safety.done ? { n: safety.n, total: safety.total } : null,
    tools: toolName,
    signedOut,
    safetyFailed: checkFailed,
    grading,
    keyRefused: bootSettings?.keys.massive === 'set' && Boolean(bootSettings.rejected_keys?.includes('massive'))
  })

  // The run view, on the home page while a report is written (or waits for Resume).
  const runView = page === 'home' ? report.view : null
  // While a report loads, the toolbar names it from the lists.
  const shown = reportPage.report
  const entry = reportPage.listed
  const bar =
    page === 'report'
      ? {
          title: shown?.name ?? shown?.ticker ?? entry?.name ?? openRow?.name ?? 'Reports',
          subtitle: shown ? (
            <ReportSubtitle text={reportSubtitle(shown.created_at, shown.kept)} others={reportPage.others} onOpen={setOpenReport} />
          ) : entry ? (
            reportSubtitle(entry.created_at, null)
          ) : openRow?.report_id === openReport ? (
            `Report of ${shortDate(openRow.report_date)}`
          ) : undefined
        }
      : page === 'log'
        ? { title: 'Prediction log', subtitle: logLine }
        : page === 'settings'
          ? { title: 'Settings', subtitle: topicName(settingsTopic) }
          : runView
            ? runTitle(runView, report.readyHold)
            : {}

  let content = null
  if (page === 'home')
    content = runView ? (
      <RunView
        run={runView}
        ready={report.readyHold}
        resuming={report.resuming}
        safety={checkFailed ? 'failed' : safety && !safety.done ? 'running' : 'ok'}
        onResume={() => void report.resume()}
        onRecheck={() => void recheck().then((problem) => problem && notify('The safety check didn’t start', problem, 'stop'))}
      />
    ) : (
      <Home
        companies={listed ? companies : null}
        tool={{ kind: toolKind, name: toolName, signedOut, safetyFailed: checkFailed, safetyUnfinished: checkUnfinished }}
        fieldRef={homeField}
        refresh={graded}
        onStart={report.start}
        onOpen={openCompany}
        onKeys={() => {
          setSettingsTopic('keys')
          go('settings')
        }}
        onTools={setTools}
        onRecheck={recheck}
      />
    )
  else if (page === 'report') content = <Report page={reportPage} wide={wide} />
  else if (page === 'log') content = <Log grading={grading} refresh={graded} onGrade={gradeDue} onSubtitle={setLogLine} />
  else if (page === 'settings')
    content = (
      <Settings
        tools={tools}
        onTools={setTools}
        safety={safety}
        onSafetyStarted={safetyBegan}
        onSettings={(s) => {
          setPrimaryTool(s.primary_tool)
          setBootSettings(s)
        }}
        topic={settingsTopic}
        onTopic={setSettingsTopic}
      />
    )

  const sideShown = page !== 'setup' && (wide ? !sideHidden : sideOver)
  const cls = ['win', `on-${page}`, wide ? '' : 'narrow', sideShown ? '' : 'sbhidden', !wide && sideOver ? 'sbover' : '', opening ? 'opening' : ''].filter(Boolean).join(' ')

  // Until the settings answer: empty glass for a moment, then "Starting Tearsheet…", then why
  // the engine can't start and what to do. The window is never left blank.
  if (!booted) {
    const view = bootView({ waitedMs: waited, answered: false, error: bootError, fatal })
    return (
      <div className="win on-setup sbhidden">
        <div className="mainarea">
          <header className="top bare" />
          {view.kind === 'starting' && (
            <div className="boot" role="status">
              <Mark size={64} />
              <p>Starting Tearsheet…</p>
            </div>
          )}
          {view.kind === 'failed' && (
            <div className="boot" role="alert">
              <Mark size={64} />
              <h1>Tearsheet couldn’t start</h1>
              <p className="why">{view.message}</p>
              <p>Quit Tearsheet and open it again. If it still doesn’t start, the details are in the engine’s log: logs/engine.log in Tearsheet’s folder in Application Support.</p>
              <button className="primary" onClick={() => setBootTry((n) => n + 1)}>
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const shownKey = runView ? 'home-run' : page
  if (page !== 'setup' && frameKey.current !== shownKey) {
    frameKey.current = shownKey
    builds.current = pageEntrance(shownKey)
  }
  const frameClass = leaving || report.swapping ? 'pagebody leave' : builds.current ? 'pagebody enter' : 'pagebody quiet'

  const fatalNotice = fatal && (
    <p className="notice error fatal" role="alert">
      {fatal}
    </p>
  )

  return (
    <div className={cls}>
      <Sidebar
        page={page}
        companies={companies}
        openReport={openRow?.report_id ?? openReport}
        writing={report.running ? { ticker: runLabel, on: runView !== null } : null}
        status={status}
        onNew={newReport}
        onWriting={() => {
          setSideOver(false)
          go('home')
        }}
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
          <Setup settings={bootSettings} leaving={leaving} safety={safety} onSafetyStarted={safetyBegan} onFinish={setupFinished}>
            {fatalNotice}
          </Setup>
        ) : (
          <>
            <Toolbar
              title={bar.title}
              subtitle={bar.subtitle}
              bare={page === 'home' && !runView}
              finding={finding}
              findFocus={findFocus}
              onFindClose={() => setFinding(false)}
            >
              {runView && report.running && (
                <button className="btn2" onClick={() => void report.cancel()}>
                  Cancel run
                </button>
              )}
              {page === 'report' && <ReportTools page={reportPage} wide={wide} />}
            </Toolbar>
            {fatalNotice}
            <main key={shownKey} className={frameClass} data-page={page}>
              {content}
            </main>
          </>
        )}
        {page === 'report' && reportPage.flag && (
          <FlagSheet key={`${reportPage.flag.reportId}:${reportPage.flag.claimId}`} claim={reportPage.flag.text} onSave={reportPage.saveFlag} onClose={reportPage.closeFlag} />
        )}
        {lookUp && <LookUp onPick={(hit) => void pick(hit)} onClose={() => setLookUp(false)} />}
      </div>
      {/* After the sidebar and the toolbar, whose top strips drag the window under it: where drag
          areas overlap, the later one in the page wins (shell/sidebar.test.ts). */}
      {page !== 'setup' && <SidebarButton shown={sideShown} onClick={toggleSidebar} />}
      <div className="toasts" aria-live="polite">
        {notice && <Toast key={notice.id} notice={notice} onDone={() => setNotice((n) => (n && n.id === notice.id ? null : n))} />}
      </div>
    </div>
  )
}
