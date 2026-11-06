// Settings and connections (the spec's "Settings and connections" and "The chart → The Settings
// choice"), in look C. In order: the Chart section ("When the chart opens"), four health tiles,
// the AI tools with their lock-down status, the data keys (each with setup's paste-and-check
// card), the raw downloads against their cap, the general settings, and "What leaves your Mac".
// Ported from docs/designs/report-look-c-chart-split.html (settingsPage, chartSettings), in
// A. Settle only. Replaces views/Settings.tsx and views/Connections.tsx. The data keys are in
// settings/Keys.tsx and the general settings in settings/General.tsx.
//
// Keys are never shown: a pasted key goes to the engine, which saves it to the Keychain, and the
// window lets go of it.

import '../settings/settings.css'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { ToolStatus } from '../../preload/api'
import type { LockdownState, SettingsResult } from '../../shared/protocol'
import { chartOpens, setChartOpens } from '../chart/prefs'
import type { ChartOpens } from '../chart/split'
import { GeneralPanel } from '../settings/General'
import { KeysPanel } from '../settings/Keys'
import { lockdownText } from '../settings/lockdown'
import { healthTiles, storage, tildePath, toolPill } from '../settings/settings'
import { at, Changes, Spinner } from '../setup/parts'
import type { SafetyState, ToolKind } from '../setup/steps'

export interface SettingsProps {
  // The AI tools as the probe last found them (App keeps them for the sidebar too).
  tools: ToolStatus[]
  onTools: (tools: ToolStatus[]) => void
  // This session's safety check; the sidebar's status line follows the same one.
  safety: SafetyState | null
  onSafetyStarted: (tool: ToolKind) => void
  // Each fresh read of the settings, so the shell follows the main AI tool and its stored check.
  onSettings: (settings: SettingsResult) => void
}

const unanswered = 'Tearsheet’s engine didn’t answer.'

export function Settings({ tools, onTools, safety, onSafetyStarted, onSettings }: SettingsProps) {
  const [s, setS] = useState<SettingsResult | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const told = useRef(onSettings)
  told.current = onSettings

  const load = useCallback(() => {
    return window.tearsheet.getSettings().then(
      (r) => {
        if (r.ok && r.result) {
          setS(r.result)
          setFailed(null)
          told.current(r.result)
        } else setFailed(r.error?.message || unanswered)
      },
      (e: unknown) => setFailed(e instanceof Error ? e.message : unanswered)
    )
  }, [])

  const toolsNow = useRef(onTools)
  toolsNow.current = onTools
  useEffect(() => {
    void load()
    // The probe's answer is kept for 30 seconds; older than that, the tools are looked at again.
    void window.tearsheet.getTools(false).then((t) => toolsNow.current(t))
  }, [load])

  // A safety check that finishes changes the stored lock-down state, so read it again.
  const finished = safety?.done ? `${safety.tool}:${safety.passed}` : null
  const seen = useRef(finished)
  useEffect(() => {
    if (finished && finished !== seen.current) void load()
    seen.current = finished
  }, [finished, load])

  if (!s) {
    return (
      <div className="setv panels">
        {failed ? (
          <p className="notice error mv" role="alert">
            Settings didn’t load. {failed}
          </p>
        ) : (
          <p className="loading">Loading settings…</p>
        )}
      </div>
    )
  }

  const primary: ToolKind = s.primary_tool === 'codex' ? 'codex' : 'claude'
  const lockdown = s.lockdown ?? {}
  const tiles = healthTiles({ tools, primary, lockdown, safety, keys: s.keys, rejected: s.rejected_keys, rawBytes: s.raw_bytes, rawCap: s.raw_cap })

  return (
    <div className="setv panels">
      <ChartSection i={0} />
      <div className="tiles4 mv" style={at(1)}>
        {tiles.map((t) => (
          <section key={t.name} className="p glass">
            <h4>
              <span>{t.name}</span>
            </h4>
            <div className="tl">
              <i className={`dot ${t.tone}`} />
              {t.text}
            </div>
          </section>
        ))}
      </div>
      <div className="two">
        <ToolsPanel i={2} tools={tools} lockdown={lockdown} safety={safety} onTools={onTools} onReload={load} onSafetyStarted={onSafetyStarted} />
        <div className="stack">
          <KeysPanel i={3} keys={s.keys} rejected={s.rejected_keys} onSaved={load} />
          <StoragePanel i={4} rawBytes={s.raw_bytes} rawCap={s.raw_cap} />
        </div>
      </div>
      <div className="two">
        <GeneralPanel i={5} s={s} primary={primary} onSaved={load} />
        <section className="p glass mv" style={at(6)}>
          <h4>
            <span>What leaves your Mac</span>
          </h4>
          <table className="t small">
            <thead>
              <tr>
                <th>Service</th>
                <th>Key</th>
                <th>Cost</th>
                <th>What is sent</th>
              </tr>
            </thead>
            <tbody>
              {s.services.map((x) => (
                <tr key={x.name}>
                  <td>{x.name}</td>
                  <td>{x.key}</td>
                  <td>{x.cost}</td>
                  <td>{x.sent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}

// ---------- the Chart section ----------

const OPENS: [ChartOpens, string][] = [
  ['full', 'Full'],
  ['half', 'Half'],
  ['last', 'Where I left it']
]

// "When the chart opens", kept in the window's own storage (chart/prefs.ts); the chart reads it
// each time it opens.
function ChartSection({ i }: { i: number }) {
  const [opens, setOpens] = useState<ChartOpens>(() => chartOpens())
  const pick = (value: ChartOpens) => {
    setChartOpens(value)
    setOpens(value)
  }
  return (
    <section className="p glass prefc mv" style={at(i)}>
      <h4>
        <span>Chart</span>
        <em>⌘3 opens and closes it</em>
      </h4>
      <div className="field">
        <span id="set-opens">When the chart opens</span>
        <div className="segc" role="group" aria-labelledby="set-opens">
          {OPENS.map(([value, label]) => (
            <button key={value} className={opens === value ? 'on' : undefined} aria-pressed={opens === value} onClick={() => pick(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Full size</span>
        <span>Everything right of the sidebar. It never covers the sidebar.</span>
      </div>
      <div className="field">
        <span>Longest ranges</span>
        <span>5Y and All download a company’s full price history the first time you open them, in one call, and show whatever your price plan serves.</span>
      </div>
    </section>
  )
}

// ---------- the AI tools ----------

interface ToolsPanelProps {
  i: number
  tools: ToolStatus[]
  lockdown: Record<string, LockdownState>
  safety: SafetyState | null
  onTools: (tools: ToolStatus[]) => void
  onReload: () => Promise<void>
  onSafetyStarted: (tool: ToolKind) => void
}

function ToolsPanel({ i, tools, lockdown, safety, onTools, onReload, onSafetyStarted }: ToolsPanelProps) {
  const [looking, setLooking] = useState(false)
  // Check again: look for the tools afresh, skipping the probe's 30-second memory.
  const lookAgain = () => {
    if (looking) return
    setLooking(true)
    const done = () => setLooking(false)
    Promise.all([window.tearsheet.getTools(true).then(onTools), onReload()]).then(done, done)
  }
  const checking = safety !== null && !safety.done
  return (
    <section className="p glass mv" style={at(i)}>
      <h4>
        <span>AI tools</span>
        <button className="act" disabled={looking} onClick={lookAgain}>
          {looking ? 'Checking…' : 'Check again'}
        </button>
      </h4>
      <p className="fine">Tearsheet uses your own AI tool, signed in to your subscription. It runs with no tools of its own.</p>
      {tools.length === 0 && (
        <p className="fine">
          <Spinner />
          Looking for your AI tools…
        </p>
      )}
      {tools.map((t) => (
        <ToolRow key={t.kind} tool={t} stored={lockdown[t.kind]} safety={safety} anyChecking={checking} onSafetyStarted={onSafetyStarted} />
      ))}
      <p className="fine">When both tools pass, the other tool checks each report’s draft.</p>
    </section>
  )
}

function ToolRow({ tool, stored, safety, anyChecking, onSafetyStarted }: { tool: ToolStatus; stored: LockdownState | undefined; safety: SafetyState | null; anyChecking: boolean; onSafetyStarted: (tool: ToolKind) => void }) {
  const [starting, setStarting] = useState(false)
  const [why, setWhy] = useState<string | null>(null)
  const pill = toolPill(tool, stored, safety)
  const mine = safety && safety.tool === tool.kind ? safety : null
  const running = mine && !mine.done ? mine : null

  // Run the check again, as setup's chip and the home page's red box do. A report running, or
  // past predictions being graded, gets the engine's own sentence as a plain line.
  const recheck = async () => {
    if (starting) return
    setStarting(true)
    setWhy(null)
    const reply = await window.tearsheet.runSafetyCheck(tool.kind).catch(() => null)
    setStarting(false)
    if (reply?.ok || reply?.error?.code === 'SAFETY_CHECK_RUNNING') onSafetyStarted(tool.kind)
    else setWhy(reply?.error?.message || 'The safety check didn’t start.')
  }

  let line = null
  if (running) {
    line = (
      <>
        <Spinner />
        Safety check, {running.n} of {running.total}
      </>
    )
  } else if (why) line = why
  else if (mine?.done && mine.stopped) line = mine.reason ?? 'The check stopped before it finished.'
  else if (mine?.done && !mine.passed) line = mine.reason ?? 'The check did not pass.'
  else if (mine?.done && mine.passed) line = 'Safety check passed.'
  // Why a check didn't start is the newest news, so it shows over the last check's result. A
  // check stopped part way is muted: it gave no verdict.
  const tone = running || why || mine?.stopped ? 'st' : mine?.done && !mine.passed ? 'st bad' : mine?.done && mine.passed ? 'st ok' : 'st'
  const canCheck = tool.available && tool.loggedIn !== false && !running

  return (
    <div className="tool">
      <span className="ic" aria-hidden="true">
        {tool.kind === 'claude' ? 'C' : 'X'}
      </span>
      <div className="tw">
        <b>{tool.name}</b>
        <dl>
          <dt>Found</dt>
          <dd className={tool.available ? 'path' : 'bad'}>{tool.available ? tildePath(tool.path ?? '') : tool.reason}</dd>
          <dt>Version</dt>
          <dd>{tool.version ?? '—'}</dd>
          <dt>Signed in</dt>
          <dd>{tool.loggedIn === null ? 'unknown' : tool.loggedIn ? 'yes' : 'no'}</dd>
          <dt>Lock-down check</dt>
          <dd>{tool.available ? lockdownText(tool, stored) : '—'}</dd>
        </dl>
        {line && (
          <Changes k={running ? 'running' : `${tone}:${String(line)}`} className={tone} live>
            {line}
          </Changes>
        )}
        {canCheck && (
          <div className="row">
            <button className="btn2" disabled={starting || anyChecking} onClick={() => void recheck()}>
              {stored || mine ? 'Run the check again' : 'Run the safety check'}
            </button>
          </div>
        )}
      </div>
      <span className={`pill ${pill.tone}`}>{pill.text}</span>
    </div>
  )
}

// ---------- storage ----------

function StoragePanel({ i, rawBytes, rawCap }: { i: number; rawBytes: number; rawCap: number }) {
  const st = storage(rawBytes, rawCap)
  return (
    <section className="p glass mv" style={at(i)}>
      <h4>
        <span>Raw downloads</span>
        <em>cap {st.cap}</em>
      </h4>
      <div className={`stor ${st.tone}`} role="meter" aria-label="Raw downloads against the cap" aria-valuemin={0} aria-valuemax={100} aria-valuenow={parseFloat(st.width)}>
        <i style={{ width: st.width }} />
      </div>
      <div className="kv">
        <span>{st.used} stored</span>
        <b>{st.share}</b>
      </div>
      {st.tone === 'hold' && <p className="fine hold">The folder is {st.over ? 'over' : 'near'} its cap. Raise the cap under General.</p>}
    </section>
  )
}
