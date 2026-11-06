// The report being written: starting it, following its notes, Resume, Cancel run, and the
// "report ready" moment before the report opens. App's one notification listener hands each
// note to `onNote`. The run is named by the company the engine resolved, not by the query typed.

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'

import type { EngineNotification } from '../../preload/api'
import type { RunStarted } from '../../shared/protocol'
import type { StepStates } from '../../shared/steps'
import { leaveMs, readyPauseMs } from '../motion'
import type { Page } from '../nav'
import type { Notice } from '../overlays/Toast'
import type { RunState } from './RunView'

// A cancelled run stops at its next step, and the engine says nothing when it has, so for a
// while afterwards "already running" most likely means the cancelled run is still stopping.
const STOPPING_MS = 5 * 60_000

export interface RunDeps {
  page: Page
  // The page being shown, or the one on its way in.
  target: MutableRefObject<Page>
  go: (page: Page) => void
  notify: (title: string, text?: string, tone?: Notice['tone']) => void
  loadCompanies: () => void
  loadTools: (force?: boolean) => void
  openReport: (reportId: string) => void
}

export function useRun({ page, target, go, notify, loadCompanies, loadTools, openReport }: RunDeps) {
  const [run, setRun] = useState<RunState | null>(null)
  // Holds the run view on screen for the "report ready" moment before the report opens.
  const [readyHold, setReadyHold] = useState(false)
  const [resuming, setResuming] = useState(false)
  const current = useRef(run)
  current.current = run
  // run_report answers once step 1 is done, so its first notes come before the run is known.
  const early = useRef<{ runId: string; steps: StepStates } | null>(null)
  const cancelledAt = useRef(0)

  const track = (next: RunState | null) => {
    current.current = next
    setRun(next)
  }

  useEffect(() => {
    if (page !== 'home') setReadyHold(false)
  }, [page])

  const onNote = useCallback(
    (note: EngineNotification) => {
      const p = note.params as Record<string, never>
      const mine = current.current !== null && current.current.runId === p.run_id
      if (note.method === 'progress') {
        if (mine) setRun((r) => (r && r.runId === p.run_id ? { ...r, steps: { ...r.steps, [p.step_name]: p.state } } : r))
        else early.current = { runId: p.run_id, steps: { ...(early.current?.runId === p.run_id ? early.current.steps : {}), [p.step_name]: p.state } }
      } else if (note.method === 'report_ready') {
        setRun((r) => (r && r.runId === p.run_id ? { ...r, reportId: p.report_id } : r))
        openReport(p.report_id)
        loadCompanies()
        // On the run view, hold the "report ready" moment before opening the report. A run
        // that stopped (a usage limit saves the report so far) stays, with its red box and
        // Resume; the report so far opens from the sidebar.
        if (mine && target.current === 'home') {
          setReadyHold(true)
          window.setTimeout(() => {
            // Going to the report, the hold ends once the page has changed (above), so the
            // run view stays while it leaves.
            if (target.current === 'home' && !current.current?.failure) go('report')
            else setReadyHold(false)
          }, readyPauseMs())
        } else go('report')
      } else if (note.method === 'run_failed') {
        if (!mine) return
        setRun((r) => (r && r.runId === p.run_id ? { ...r, failure: { message: p.message, code: p.code, resetAt: p.reset_at, fix: p.fix_command } } : r))
        if (p.code === 'AUTH_EXPIRED') loadTools(true)
        go('home')
      } else if (note.method === 'engine_restarted') {
        // A restart ends the run with it, if it was still going.
        setRun((r) => (r && !r.reportId && !r.failure ? { ...r, failure: { message: 'The engine stopped and was restarted. You can resume the run.', code: 'ENGINE_ERROR' } } : r))
      }
    },
    [go, loadCompanies, loadTools, openReport, target]
  )

  const begin = (started: RunStarted) => {
    const steps = early.current?.runId === started.run_id ? early.current.steps : {}
    early.current = null
    track({ runId: started.run_id, ticker: started.ticker, name: started.name, steps, reportId: null, failure: null })
    setReadyHold(false)
    go('home')
  }

  // Start a report for a ticker or name. Gives what went wrong, or null once it has started.
  const start = async (query: string): Promise<string | null> => {
    const reply = await window.tearsheet.runReport(query)
    if (reply.ok && reply.result) {
      begin(reply.result)
      return null
    }
    if (reply.error?.code === 'RUN_IN_PROGRESS') {
      return Date.now() - cancelledAt.current < STOPPING_MS
        ? 'The cancelled report is still stopping. Try again in a minute.'
        : 'A report is already running. You can start another when it finishes.'
    }
    return reply.error?.message || 'The report didn’t start.'
  }

  // Resume a stopped run. It keeps its steps so far, its company and its id.
  const resume = async () => {
    const r = current.current
    if (!r || resuming) return
    setResuming(true)
    const reply = await window.tearsheet.resume(r.runId)
    setResuming(false)
    if (reply.ok && reply.result) {
      const { ticker, name } = reply.result
      setRun((cur) => (cur && cur.runId === r.runId ? { ...cur, ticker: ticker ?? cur.ticker, name: name ?? cur.name, reportId: null, failure: null } : cur))
      setReadyHold(false)
      go('home')
    } else notify('The report didn’t resume', reply.error?.message, 'stop')
  }

  // Cancel run: the engine stops it at the next step. Nothing more is heard of it.
  const cancel = async () => {
    const r = current.current
    if (!r) return
    const reply = await window.tearsheet.cancel(r.runId)
    if (!reply.ok) return notify('The report didn’t cancel', reply.error?.message, 'stop')
    cancelledAt.current = Date.now()
    if (current.current?.runId === r.runId) track(null)
    const label = r.ticker ?? r.name
    notify(label ? `Cancelled the ${label} report` : 'Cancelled the report', 'No report was saved. Start it again any time.')
  }

  // New report on the home page puts a stopped run away, so a new one can start.
  const putAway = () => {
    if (current.current?.failure) track(null)
  }

  const running = run !== null && !run.reportId && !run.failure
  // The home page shows the run view while a run goes, while a stopped one waits for Resume,
  // and for the "report ready" moment.
  const showsRun = (run !== null && (!run.reportId || run.failure !== null)) || readyHold

  // Between the home page and the run view, the one on screen fades and lifts away before the
  // other settles in (A. Settle). Away from home, the choice just follows.
  const [shownRun, setShownRun] = useState(showsRun)
  const [swapping, setSwapping] = useState(false)
  // The run the view shows, kept while it leaves after Cancel run.
  const last = useRef(run)
  if (run) last.current = run
  useEffect(() => {
    if (showsRun === shownRun || page !== 'home') {
      setShownRun(showsRun)
      setSwapping(false)
      return
    }
    setSwapping(true)
    const timer = window.setTimeout(() => {
      setShownRun(showsRun)
      setSwapping(false)
    }, leaveMs())
    return () => window.clearTimeout(timer)
  }, [showsRun, shownRun, page])

  const view = shownRun ? (run ?? last.current) : null

  return { run, running, readyHold, view, swapping, resuming, onNote, start, resume, cancel, putAway }
}
