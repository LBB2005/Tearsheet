import { useEffect, useState } from 'react'

import type { EngineNotification } from '../preload/api'
import { readyPauseMs } from './motion'
import { Connections } from './views/Connections'
import { Log } from './views/Log'
import { Progress, type RunState } from './views/Progress'
import { Report } from './views/Report'
import { Search } from './views/Search'
import { Settings } from './views/Settings'

type View = 'search' | 'progress' | 'report' | 'log' | 'settings' | 'connections'

const NAV: [View, string][] = [
  ['search', 'New report'],
  ['progress', 'Progress'],
  ['report', 'Reports'],
  ['log', 'Prediction log'],
  ['settings', 'Settings'],
  ['connections', 'Connections']
]

export function App() {
  const [view, setView] = useState<View>('search')
  const [run, setRun] = useState<RunState | null>(null)
  const [openReport, setOpenReport] = useState<string | null>(null)
  const [fatal, setFatal] = useState<string | null>(null)

  // Grade whatever has come due each time the app opens (design item 48). It waits behind any run.
  useEffect(() => {
    void window.tearsheet.gradeDue()
  }, [])

  useEffect(() => {
    return window.tearsheet.onNotification((note: EngineNotification) => {
      const p = note.params as Record<string, never>
      if (note.method === 'progress') {
        setRun((r) => (r && r.runId === p.run_id ? { ...r, steps: { ...r.steps, [p.step_name]: p.state } } : r))
      } else if (note.method === 'report_ready') {
        setRun((r) => (r && r.runId === p.run_id ? { ...r, reportId: p.report_id } : r))
        setOpenReport(p.report_id)
        // On the Progress view, hold the "report ready" moment before opening the report.
        setView((v) => (v === 'progress' ? v : 'report'))
        window.setTimeout(() => setView((v) => (v === 'progress' ? 'report' : v)), readyPauseMs())
      } else if (note.method === 'run_failed') {
        setRun((r) => (r && r.runId === p.run_id ? { ...r, failure: { message: p.message, code: p.code, resetAt: p.reset_at, fix: p.fix_command } } : r))
        setView('progress')
      } else if (note.method === 'engine_restarted') {
        setRun((r) => (r ? { ...r, failure: { message: 'The engine stopped and was restarted. You can resume the run.', code: 'ENGINE_ERROR' } } : r))
      } else if (note.method === 'engine_fatal') {
        setFatal(String(p.message))
      }
    })
  }, [])

  const started = (runId: string) => {
    setRun({ runId, steps: {}, reportId: null, failure: null })
    setView('progress')
  }

  return (
    <div className="shell">
      <nav>
        <h1>Tearsheet</h1>
        {NAV.map(([key, label]) => (
          <button key={key} className={view === key ? 'on' : ''} onClick={() => setView(key)}>
            {label}
          </button>
        ))}
      </nav>
      <main>
        {fatal && <p className="notice error">{fatal}</p>}
        {view === 'search' && <Search onStarted={started} />}
        {view === 'progress' && <Progress run={run} onResumed={started} />}
        {view === 'report' && <Report openId={openReport} onOpen={setOpenReport} />}
        {view === 'log' && <Log />}
        {view === 'settings' && <Settings />}
        {view === 'connections' && <Connections />}
      </main>
    </div>
  )
}
