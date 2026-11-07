// The report being written: starting it, following its notes (progress and the live tally),
// Resume, Cancel run, and the Done card the run view waits on until Open the report. App's one
// notification listener hands each note to `onNote`. The run is named by the company the
// engine resolved, not by the query typed.
//
// The run is kept in a ref as well as in state, and both change together (`track`), so a note
// handled straight after another sees what the first one did: a stopped run's `run_failed`
// comes just before its report so far (`report_ready`).

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'

import type { EngineNotification } from '../../preload/api'
import type { RunStarted } from '../../shared/protocol'
import { pageLeaveMs } from '../motion'
import type { Page } from '../nav'
import type { Notice } from '../overlays/Toast'
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
}

export function useRun({ page, target, go, notify, loadCompanies, loadTools, openReport, onLockdownFailed }: RunDeps) {
  const [run, setRun] = useState<RunState | null>(null)
  // Holds the run view on screen with its Done card until Open the report (or another page).
  const [readyHold, setReadyHold] = useState(false)
  const [resuming, setResuming] = useState(false)
  const current = useRef<RunState | null>(null)
  // Notes for a run not tracked yet: run_report answers once step 1 is done, so the first notes
  // come before the run is known; and a resume replays from step 1 while its call is answered.
  const early = useRef<{ runId: string; notes: RunNotes } | null>(null)
  const resumingId = useRef<string | null>(null)
  const cancelled = useRef(new Set<string>())
  const cancelledAt = useRef(0)

  const track = useCallback((next: RunState | null) => {
    current.current = next
    setRun(next)
  }, [])

  useEffect(() => {
    if (page !== 'home') setReadyHold(false)
  }, [page])

  const onNote = useCallback(
    (note: EngineNotification) => {
      const p = note.params as Record<string, never>
      const r = current.current
      const mine = r !== null && r.runId === p.run_id
      if (note.method === 'progress' || note.method === 'run_tally') {
        const at = Date.now()
        if (mine && resumingId.current !== r.runId) track(withNote(r, note.method, p, at))
        else {
          const had = early.current?.runId === p.run_id ? early.current.notes : freshNotes(at)
          early.current = { runId: p.run_id, notes: withNote(had, note.method, p, at) }
        }
      } else if (note.method === 'report_ready') {
        loadCompanies()
        // A cancelled run that saved its report anyway: it shows in the sidebar, and nothing
        // opens by itself.
        if (cancelled.current.has(p.run_id)) return
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
        go('home')
      } else if (note.method === 'engine_restarted') {
        // A restart ends the run with it, if it was still going.
        if (r && !r.reportId && !r.failure) track({ ...r, failure: { message: 'The engine stopped and was restarted. You can resume the run.', code: 'ENGINE_ERROR' } })
      }
    },
    [go, loadCompanies, loadTools, onLockdownFailed, openReport, target, track]
  )

  const begin = (started: RunStarted) => {
    const notes = early.current?.runId === started.run_id ? early.current.notes : freshNotes(Date.now())
    early.current = null
    track({ runId: started.run_id, ticker: started.ticker, name: started.name, ...notes, reportId: null, readyAt: null, failure: null })
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
    return refusal(reply.error?.code, reply.error?.message, Date.now() - cancelledAt.current < STOPPING_MS)
  }

  // Resume a stopped run. The engine replays it from step 1 with its stored inputs, so its steps
  // start again; it keeps its company and its id.
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
    if (!reply.ok) notify('The report didn’t resume', refusal(reply.error?.code, reply.error?.message, false), 'stop')
  }

  // Cancel run: the engine stops it at the next step. Nothing more is heard of it.
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
    notify(label ? `Cancelled the ${label} report` : 'Cancelled the report', 'No report was saved. Start it again any time.')
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
  // The home page shows the run view while a run goes, while a stopped one waits for Resume,
  // and for the "report ready" moment.
  const showsRun = (run !== null && (!run.reportId || run.failure !== null)) || readyHold

  // Between the home page and the run view, the other one takes its place at once, as pages do
  // (motion.ts); under Animations Full, the one on screen first fades and lifts away. Away from
  // home, the choice just follows.
  const [shownRun, setShownRun] = useState(showsRun)
  const [swapping, setSwapping] = useState(false)
  // The run the view shows, kept while it leaves after Cancel run.
  const last = useRef(run)
  if (run) last.current = run
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

  return { run, running, readyHold, view, swapping, resuming, onNote, start, resume, cancel, putAway, openReady }
}
