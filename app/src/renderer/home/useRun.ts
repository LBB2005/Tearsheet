// The report being written: starting it, following its notes (progress and the live tally),
// Resume, Cancel run, and the Done card the run view waits on until Open the report. App's one
// notification listener hands each note to `onNote`. The run is named by the company the
// engine resolved, not by the query typed.
//
// The line (home/line.ts) writes several reports one after another. The engine starts each one
// itself and says so in `line_changed`; the run view then follows it, without leaving the page
// you're on. A line's report that is ready doesn't open by itself: it shows in the sidebar, and
// the last one waits on the Done card with the whole line listed under it. While a report is
// written, starting another adds it to the line.
//
// The run is kept in a ref as well as in state, and both change together (`track`), so a note
// handled straight after another sees what the first one did: a stopped run's `run_failed`
// comes just before its report so far (`report_ready`). The line is kept the same way.
//
// The safety check (first-run design §5): a report asked for while a check runs joins the line,
// which waits for it, instead of being refused. On a brand-new install, where the writing tool
// has never been checked and no check has passed while the app has been open, starting a report
// starts the full check first, and the report waits in the line for it.

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'

import type { EngineNotification } from '../../preload/api'
import type { LineState, LockdownState, RunStarted } from '../../shared/protocol'
import { pageLeaveMs } from '../motion'
import type { Page } from '../nav'
import type { Notice } from '../overlays/Toast'
import type { ToolKind } from '../../shared/tools'
import type { SafetyState } from '../setup/state/safety'
import { refreshNote } from '../shell/refresh'
import { lineGoing, newlyUnstarted, PAUSES, REOPENED } from './line'
import { freshNotes, refusal, withNote, type RunNotes, type RunState } from './run'

// A cancelled run stops at its next step, and the engine says nothing when it has, so for a
// while afterwards "already running" most likely means the cancelled run is still stopping.
const STOPPING_MS = 5 * 60_000
// How often the toolbar's and the sidebar's time left are worked out again during a run.
const TICK_MS = 5000

export interface RunDeps {
  page: Page
  // The page being shown, or the one on its way in.
  target: MutableRefObject<Page>
  go: (page: Page) => void
  notify: (title: string, text?: string, tone?: Notice['tone']) => void
  loadCompanies: () => void
  loadTools: (force?: boolean) => void
  openReport: (reportId: string) => void
  // The AI tool's safety check failed during the run (the engine's gate).
  onLockdownFailed: (message: string) => void
  // The writing tool (primary_tool, or Claude Code): the one whose check a new install waits for.
  writer: ToolKind
  // App's safety state: this session's check, from the engine's notes.
  safety: SafetyState | null
  // The settings' stored checks, by tool (get_settings' lockdown).
  lockdown: Record<string, LockdownState>
  // Starts the full safety check for a tool; gives what went wrong, or null once it has started.
  startSafetyCheck: (tool: ToolKind) => Promise<string | null>
}

export function useRun({ page, target, go, notify, loadCompanies, loadTools, openReport, onLockdownFailed, writer, safety, lockdown, startSafetyCheck }: RunDeps) {
  const [run, setRun] = useState<RunState | null>(null)
  // Holds the run view on screen with its Done card until Open the report (or another page).
  const [readyHold, setReadyHold] = useState(false)
  const [resuming, setResuming] = useState(false)
  const current = useRef<RunState | null>(null)
  // The line as the engine last said (line_changed), or null until it has.
  const [line, setLineState] = useState<LineState | null>(null)
  const lineNow = useRef<LineState | null>(null)
  // Notes for a run not tracked yet: run_report answers once step 1 is done, so the first notes
  // come before the run is known; and a resume replays from step 1 while its call is answered.
  const early = useRef<{ runId: string; notes: RunNotes } | null>(null)
  const resumingId = useRef<string | null>(null)
  const cancelled = useRef(new Set<string>())
  const cancelledAt = useRef(0)
  // The tools whose full check has passed while the app has been open (a test copy's check is
  // never stored, so the settings alone can't say).
  const passedNow = useRef(new Set<ToolKind>())
  if (safety?.done && safety.passed) passedNow.current.add(safety.tool)
  const checking = safety !== null && !safety.done

  const track = useCallback((next: RunState | null) => {
    current.current = next
    setRun(next)
  }, [])

  useEffect(() => {
    if (page !== 'home') setReadyHold(false)
  }, [page])

  // Follow a run that has started: the run view shows it. `show` goes to the home page as well,
  // for a report you started; the line's later reports leave you where you are.
  const begin = useCallback(
    (started: RunStarted, show = true) => {
      const notes = early.current?.runId === started.run_id ? early.current.notes : freshNotes(Date.now())
      early.current = null
      track({ runId: started.run_id, ticker: started.ticker, name: started.name, ...notes, reportId: null, readyAt: null, failure: null })
      setReadyHold(false)
      if (show) go('home')
    },
    [go, track]
  )

  // A new line from the engine. When it has started its next report, the run view follows it.
  const takeLine = useCallback(
    (next: LineState) => {
      const before = lineNow.current
      lineNow.current = next
      setLineState(next)
      for (const item of newlyUnstarted(before, next)) notify(`${item.ticker} didn’t start`, item.message ?? undefined, 'stop')
      const writing = next.writing
      if (!writing?.run_id || cancelled.current.has(writing.run_id)) return
      const r = current.current
      if (r?.runId === writing.run_id) {
        // The engine resumed the stopped report itself, once the plan's usage limit had reset
        // (batch.py): the run view follows the replay, as after Resume.
        if (r.failure && before?.paused && !next.paused && resumingId.current !== r.runId) {
          const notes = early.current?.runId === r.runId ? early.current.notes : freshNotes(Date.now())
          early.current = null
          track({ ...r, ...notes, reportId: null, readyAt: null, failure: null })
          setReadyHold(false)
        }
        return
      }
      begin({ run_id: writing.run_id, ticker: writing.ticker, name: writing.name }, false)
    },
    [begin, notify, track]
  )

  // The line as the engine has it when the window opens: it may come back paused from last
  // time, or be part-way through after the window reloaded.
  useEffect(() => {
    let live = true
    void window.tearsheet.getLine().then((r) => live && r.ok && r.result && takeLine(r.result))
    return () => {
      live = false
    }
  }, [takeLine])

  const onNote = useCallback(
    (note: EngineNotification) => {
      const p = note.params as Record<string, never>
      const r = current.current
      const mine = r !== null && r.runId === p.run_id
      // The line's own report, being written now.
      const lined = lineNow.current?.writing?.run_id === p.run_id
      if (note.method === 'progress' || note.method === 'run_tally') {
        const at = Date.now()
        if (mine && resumingId.current !== r.runId) track(withNote(r, note.method, p, at))
        else {
          const had = early.current?.runId === p.run_id ? early.current.notes : freshNotes(at)
          early.current = { runId: p.run_id, notes: withNote(had, note.method, p, at) }
        }
      } else if (note.method === 'line_changed') {
        takeLine(note.params as unknown as LineState)
      } else if (note.method === 'report_ready') {
        loadCompanies()
        // A cancelled run that saved its report anyway: it shows in the sidebar, and nothing
        // opens by itself.
        if (cancelled.current.has(p.run_id)) return
        if (lined) return lineReady(p.run_id, p.report_id)
        openReport(p.report_id)
        if (!mine) return go('report')
        track({ ...r, reportId: p.report_id, readyAt: Date.now() })
        // A stopped run's report so far: the run view stays, with its red box and Resume.
        if (r.failure) return
        if (target.current !== 'home') return go('report')
        // On the run view, the Done card waits for Open the report. Going to the report, the
        // hold ends once the page has changed (above), so the run view stays while it leaves.
        setReadyHold(true)
      } else if (note.method === 'run_failed') {
        if (!mine) return
        track({ ...r, failure: { message: p.message, code: p.code, resetAt: p.reset_at, fix: p.fix_command, step: p.step } })
        setReadyHold(false)
        if (p.code === 'AUTH_EXPIRED') loadTools(true)
        if (p.code === 'LOCKDOWN_FAILED') onLockdownFailed(p.message)
        // A problem with just this company: the line moves on to the next one.
        if (lined && !PAUSES.has(p.code) && (lineNow.current?.waiting.length ?? 0) > 0) {
          notify(`${r.ticker ?? r.name ?? 'The report'} stopped`, `${p.message} The next one is starting.`, 'stop')
          return
        }
        go('home')
      } else if (note.method === 'engine_restarted') {
        // A restart ends the run with it, if it was still going.
        if (r && !r.reportId && !r.failure) track({ ...r, failure: { message: 'The engine stopped and was restarted. You can resume the run.', code: 'ENGINE_ERROR' } })
      }

      // A report in the line is ready. It doesn't open by itself unless it is the last one and
      // the run view is on show, where the Done card waits with the whole line under it.
      function lineReady(runId: string, reportId: string) {
        const now = lineNow.current as LineState
        const ours = r !== null && r.runId === runId
        if (ours) track({ ...r, reportId, readyAt: Date.now() })
        // A stopped report so far: the red box stays, with Resume.
        if (ours && r.failure) return
        const label = (ours ? (r.ticker ?? r.name) : null) ?? now.writing?.ticker ?? 'The report'
        if (now.waiting.length > 0 && now.paused === null) return notify(`${label} is ready`, 'It’s in the sidebar. The next one is starting.')
        if (!ours || target.current !== 'home') return notify('The line is done', 'Its reports are in the sidebar.')
        openReport(reportId)
        setReadyHold(true)
      }
    },
    [go, loadCompanies, loadTools, notify, onLockdownFailed, openReport, takeLine, target, track]
  )

  // Whether a new company would wait its turn: a report is being written, or the line has more.
  const isBusy = () => {
    const r = current.current
    return (r !== null && !r.reportId && !r.failure) || lineGoing(lineNow.current)
  }

  // Start a report for a ticker or name. Gives what went wrong, or null once it has started.
  // While a report is being written (or the line has more to come), or a safety check runs, it
  // joins the line instead. On a brand-new install the full check starts first, and the report
  // waits in the line for it.
  const start = async (query: string): Promise<string | null> => {
    if (isBusy() || checking) return addOne(query, checking)
    if (!lockdown[writer] && !passedNow.current.has(writer)) {
      const problem = await startSafetyCheck(writer)
      return problem ?? addOne(query, true)
    }
    const reply = await window.tearsheet.runReport(query)
    if (reply.ok && reply.result) {
      begin(reply.result)
      return null
    }
    // A check the window hadn't heard of yet: the line waits for it.
    if (reply.error?.code === 'SAFETY_CHECK_RUNNING') return addOne(query, true)
    return refusal(reply.error?.code, reply.error?.message, Date.now() - cancelledAt.current < STOPPING_MS)
  }

  // `check`: a safety check runs, so the line waits for it first.
  const addOne = async (query: string, check = false): Promise<string | null> => {
    const reply = await window.tearsheet.addToLine([query])
    if (!reply.ok || !reply.result) return reply.error?.message || 'It couldn’t join the line.'
    const added = reply.result.items[0]
    if (!added) return reply.result.skipped[0]?.reason ?? 'It couldn’t join the line.'
    const waiting = reply.result.line.waiting.length
    let text = waiting > 1 ? `${waiting} waiting. It starts when the ones before it are done.` : 'It starts when this report is done.'
    if (check) text = waiting > 1 ? `${waiting} waiting. It starts when the safety check finishes and the ones before it are done.` : 'It starts when the safety check finishes.'
    notify(`${added.ticker} is in the line`, text)
    return null
  }

  // Start the line with several companies (the home page's list, checked first). The engine says
  // when its first report has started, and the run view follows it.
  const startLine = async (queries: string[]): Promise<string | null> => {
    const reply = await window.tearsheet.addToLine(queries)
    if (!reply.ok || !reply.result) return reply.error?.message || 'The reports didn’t start.'
    if (reply.result.items.length === 0) return reply.result.skipped[0]?.reason ?? 'None of these could be added.'
    // A stopped run waiting for Resume is put away, as New report does.
    if (current.current?.failure) track(null)
    setReadyHold(false)
    return null
  }

  // Refresh (shell/refresh.ts): companies written again through the line, after the confirm.
  // You stay on the page you're on; a note says they started, or are waiting their turn.
  const refresh = async (tickers: string[]): Promise<string | null> => {
    const busy = isBusy()
    const reply = await window.tearsheet.addToLine(tickers)
    if (!reply.ok || !reply.result) return reply.error?.message || 'The reports didn’t start.'
    const added = reply.result.items
    if (added.length === 0) return reply.result.skipped[0]?.reason ?? 'None of these could be added.'
    const paused = reply.result.line.paused
    const note = refreshNote(added, { busy, paused: paused !== null && paused.code !== REOPENED })
    notify(note.title, note.text)
    return null
  }

  // × on a company waiting in the line.
  const removeFromLine = async (ticker: string) => {
    const reply = await window.tearsheet.removeFromLine(ticker)
    if (!reply.ok) notify(`${ticker} is still in the line`, reply.error?.message, 'stop')
  }

  // Cancel all: the report being written stops, and nothing else starts.
  const cancelAll = async () => {
    const r = current.current
    const reply = await window.tearsheet.clearLine()
    if (!reply.ok) return notify('The line didn’t cancel', reply.error?.message, 'stop')
    if (r && !r.reportId) {
      cancelled.current.add(r.runId)
      cancelledAt.current = Date.now()
    }
    track(null)
    setReadyHold(false)
    notify('Cancelled the line', 'The report being written was stopped, and nothing else will start. Finished reports stay in the sidebar.')
  }

  // Carry on with the companies waiting: after Tearsheet opened again, or past a stopped report
  // without resuming it (it stays in the sidebar).
  const carryOn = async () => {
    const reply = await window.tearsheet.carryOnLine()
    if (!reply.ok) return notify('The line didn’t carry on', reply.error?.message, 'stop')
    if (current.current?.failure) track(null)
  }

  // Clear a line that came back from last time, without writing it.
  const clearLine = async () => {
    const reply = await window.tearsheet.clearLine()
    if (!reply.ok) notify('The line didn’t clear', reply.error?.message, 'stop')
  }

  // Resume a stopped run. The engine replays it from step 1 with its stored inputs, so its steps
  // start again; it keeps its company and its id. Resuming the report that paused the line
  // carries on with the line after it.
  const resume = async () => {
    const r = current.current
    if (!r || resuming) return
    setResuming(true)
    resumingId.current = r.runId
    early.current = null
    const reply = await window.tearsheet.resume(r.runId)
    resumingId.current = null
    setResuming(false)
    const now = current.current
    if (reply.ok && reply.result && now && now.runId === r.runId) {
      // The replay's notes that came in while the call was answered (read afresh: they
      // arrived during the await).
      const buffered = early.current as { runId: string; notes: RunNotes } | null
      const notes = buffered?.runId === r.runId ? buffered.notes : freshNotes(Date.now())
      early.current = null
      const { ticker, name } = reply.result
      track({ ...now, ...notes, ticker: ticker ?? now.ticker, name: name ?? now.name, reportId: null, readyAt: null, failure: null })
      setReadyHold(false)
      go('home')
      return
    }
    early.current = null
    if (!reply.ok) {
      const why = reply.error?.code === 'SAFETY_CHECK_RUNNING' ? 'The safety check is running. Resume the report once it finishes.' : refusal(reply.error?.code, reply.error?.message, false)
      notify('The report didn’t resume', why, 'stop')
    }
  }

  // Cancel run: the engine stops it at the next step. Nothing more is heard of it. In the line,
  // the next report then starts.
  const cancel = async () => {
    const r = current.current
    if (!r) return
    const reply = await window.tearsheet.cancel(r.runId)
    if (!reply.ok) return notify('The report didn’t cancel', reply.error?.message, 'stop')
    // The engine had no such run going: it has just ended, and its own note says how.
    if (reply.result?.ok === false) return notify('The report had already finished')
    cancelled.current.add(r.runId)
    cancelledAt.current = Date.now()
    if (current.current?.runId === r.runId) track(null)
    const label = r.ticker ?? r.name
    const next = (lineNow.current?.waiting.length ?? 0) > 0 && lineNow.current?.writing?.run_id === r.runId
    notify(label ? `Cancelled the ${label} report` : 'Cancelled the report', next ? 'No report was saved. The next one in the line is starting.' : 'No report was saved. Start it again any time.')
  }

  // New report on the home page puts a stopped run away, so a new one can start, and closes a
  // Done card.
  const putAway = () => {
    if (current.current?.failure) track(null)
    setReadyHold(false)
  }

  // The Done card's Open the report.
  const openReady = () => go('report')

  const running = run !== null && !run.reportId && !run.failure
  // While a run goes, a tick every few seconds keeps the time left in the toolbar and the
  // sidebar current between the engine's notes.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setTick((n) => n + 1), TICK_MS)
    return () => window.clearInterval(timer)
  }, [running])
  // The run the view shows, kept while it leaves after Cancel run, and between the line's reports.
  const last = useRef(run)
  if (run) last.current = run
  // The home page shows the run view while a run goes, while a stopped one waits for Resume,
  // for the "report ready" moment, and while the line has more to come.
  const showsRun = (run !== null && (!run.reportId || run.failure !== null)) || readyHold || (lineGoing(line) && last.current !== null)

  // Between the home page and the run view, the other one takes its place at once, as pages do
  // (motion.ts); under Animations Full, the one on screen first fades and lifts away. Away from
  // home, the choice just follows.
  const [shownRun, setShownRun] = useState(showsRun)
  const [swapping, setSwapping] = useState(false)
  useEffect(() => {
    const away = pageLeaveMs()
    if (showsRun === shownRun || page !== 'home' || away === 0) {
      setShownRun(showsRun)
      setSwapping(false)
      return
    }
    setSwapping(true)
    const timer = window.setTimeout(() => {
      setShownRun(showsRun)
      setSwapping(false)
    }, away)
    return () => window.clearTimeout(timer)
  }, [showsRun, shownRun, page])

  const view = shownRun ? (run ?? last.current) : null

  return {
    run,
    running,
    readyHold,
    view,
    swapping,
    resuming,
    line,
    onNote,
    start,
    startLine,
    // Whether a company added now would wait its turn.
    busy: running || lineGoing(line),
    refresh,
    removeFromLine,
    cancelAll,
    carryOn,
    clearLine,
    resume,
    cancel,
    putAway,
    openReady
  }
}
