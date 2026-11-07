// Settings (the spec's "Settings and connections"), laid out like the Mac's own settings: a list
// of six topics on the left (settings/topics.ts) and one short page for the topic picked. A topic
// that needs you has a dot, and General opens with a note and a button for each problem; together
// they replace the four health tiles. The look is "Outline" (round 2 of the settings mockups):
// the app sidebar's own line icons with no box, Mac pop-up menus and pill buttons. Each page
// settles in part by part (A. Settle), and the picked topic's icon draws itself. Under Reduce
// motion nothing moves (styles.css).
//
// The rows are in settings/General.tsx (labels, pop-up menus, typed settings, the main AI tool),
// settings/ChartChoice.tsx and settings/Keys.tsx, with the price download line under the keys
// (settings/prices.ts); the AI tools, storage, privacy and advanced pages are below. Keys are
// never shown: a pasted key goes to the engine, which saves it to the Keychain, and the window
// lets go of it.

import '../settings/settings.css'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from 'react'

import type { ToolStatus } from '../../preload/api'
import type { LockdownState, PriceDownload, SettingsResult } from '../../shared/protocol'
import { ChartChoice } from '../settings/ChartChoice'
import { FieldRow, Label, ToolChoice } from '../settings/General'
import { MotionChoice } from '../settings/MotionChoice'
import { KeysPanel } from '../settings/Keys'
import { lockdownText } from '../settings/lockdown'
import { PRICE_POLL_MS, priceLine } from '../settings/prices'
import { healthTiles, maskEmail, storage, tildePath, toolPill, type HealthInput } from '../settings/settings'
import { moveTopic, needsYou, problems, toolRole, TOPICS, type Problem, type Topic } from '../settings/topics'
import { Changes, Spinner } from '../setup/parts'
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
  // The topic shown. App keeps it, so the toolbar names it and the home page can open Data keys.
  topic: Topic
  onTopic: (topic: Topic) => void
}

const unanswered = 'Tearsheet’s engine didn’t answer.'

export function Settings({ tools, onTools, safety, onSafetyStarted, onSettings, topic, onTopic }: SettingsProps) {
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

  // While the price download goes, Data keys reads the settings again so its count moves.
  const pricesGoing = s ? priceLine(s.price_download).going : false
  useEffect(() => {
    if (topic !== 'keys' || !pricesGoing) return
    const timer = window.setInterval(() => void load(), PRICE_POLL_MS)
    return () => window.clearInterval(timer)
  }, [topic, pricesGoing, load])

  if (!s) {
    return (
      <div className="setv">
        <div className="tpage">
          <div className="tpin panels">
            {failed ? (
              <p className="notice error" role="alert">
                Settings didn’t load. {failed}
              </p>
            ) : (
              <p className="loading">Loading settings…</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  const primary: ToolKind = s.primary_tool === 'codex' ? 'codex' : 'claude'
  const lockdown = s.lockdown ?? {}
  const health: HealthInput = { tools, primary, lockdown, safety, keys: s.keys, rejected: s.rejected_keys, rawBytes: s.raw_bytes, rawCap: s.raw_cap }
  const found = problems(health)

  let page: ReactNode
  if (topic === 'general') page = <GeneralPage s={s} primary={primary} found={found} onSaved={load} onTopic={onTopic} />
  else if (topic === 'ai') page = <ToolsPage tools={tools} health={health} lockdown={lockdown} safety={safety} onTools={onTools} onReload={load} onSafetyStarted={onSafetyStarted} />
  else if (topic === 'keys')
    page = (
      <>
        <Head title="Data keys" lead="Kept in your Mac’s Keychain. Tearsheet never shows a key." />
        <KeysPanel keys={s.keys} rejected={s.rejected_keys} onSaved={load} />
        <PriceRow p={s.price_download} />
      </>
    )
  else if (topic === 'storage') page = <StoragePage s={s} onSaved={load} />
  else if (topic === 'privacy') page = <PrivacyPage services={s.services} />
  else page = <AdvancedPage s={s} onSaved={load} />

  return (
    <div className="setv">
      <TopicList topic={topic} dots={needsYou(found)} onTopic={onTopic} />
      {/* A new topic is a new page: it settles in afresh and starts at the top. */}
      <div className="tpage" key={topic}>
        <div className="tpin panels">{page}</div>
      </div>
    </div>
  )
}

// ---------- the topic list ----------

// The app sidebar's line icons (shell/Sidebar.tsx's ICONS, the prototype's ICON4), one per topic.
// Each part has pathLength 1, so the picked one can draw itself in (settings.css, set-draw).
const ICONS: Record<Topic, ReactElement> = {
  general: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" pathLength={1} />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" pathLength={1} />
    </svg>
  ),
  ai: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" pathLength={1} />
      <path d="M18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z" pathLength={1} />
    </svg>
  ),
  keys: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="8" cy="15" r="4" pathLength={1} />
      <path d="M11 12l8-8M16 7l3 3M14 9l2 2" pathLength={1} />
    </svg>
  ),
  storage: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <ellipse cx="12" cy="6" rx="7" ry="2.5" pathLength={1} />
      <path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" pathLength={1} />
    </svg>
  ),
  privacy: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" pathLength={1} />
    </svg>
  ),
  advanced: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" pathLength={1} />
      <circle cx="16" cy="7" r="2" pathLength={1} />
      <circle cx="10" cy="17" r="2" pathLength={1} />
    </svg>
  )
}

// The six topics. Click one, or move with ↑ ↓ (and Home, End) while the list has the focus.
function TopicList({ topic, dots, onTopic }: { topic: Topic; dots: Map<Topic, Problem['tone']>; onTopic: (topic: Topic) => void }) {
  const buttons = useRef<Partial<Record<Topic, HTMLButtonElement | null>>>({})
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    const next = moveTopic(topic, e.key)
    if (!next) return
    e.preventDefault()
    onTopic(next)
    buttons.current[next]?.focus()
  }
  return (
    <nav className="topics" aria-label="Settings topics" onKeyDown={onKey}>
      {TOPICS.map(({ id, name }) => {
        const dot = dots.get(id)
        return (
          <button
            key={id}
            ref={(el) => {
              buttons.current[id] = el
            }}
            className={id === topic ? 'topic on' : 'topic'}
            aria-current={id === topic ? 'page' : undefined}
            onClick={() => onTopic(id)}
          >
            {ICONS[id]}
            {name}
            {dot && (
              <>
                <i className={`need ${dot}`} />
                <span className="vh">, needs you</span>
              </>
            )}
          </button>
        )
      })}
    </nav>
  )
}

// ---------- the parts of a page ----------

function Head({ title, lead }: { title: string; lead: string }) {
  return (
    <>
      <h2 className="sh2">{title}</h2>
      <p className="slead">{lead}</p>
    </>
  )
}

// One problem on General: what needs you, why, and the button that opens its topic.
function Note({ p, onOpen }: { p: Problem; onOpen: () => void }) {
  return (
    <div className={`snote ${p.tone}`} role="status">
      <Label title={p.title} help={p.detail} />
      <button className="pb go" onClick={onOpen}>
        {p.action}
      </button>
    </div>
  )
}

// ---------- General ----------

function GeneralPage({ s, primary, found, onSaved, onTopic }: { s: SettingsResult; primary: ToolKind; found: Problem[]; onSaved: () => Promise<void>; onTopic: (topic: Topic) => void }) {
  const email = s.sec_contact_email
  return (
    <>
      <Head title="General" lead="The few choices most people set once." />
      {found.map((p) => (
        <Note key={p.title} p={p} onOpen={() => onTopic(p.topic)} />
      ))}
      <div className="sgrp">
        <ToolChoice primary={primary} onSaved={onSaved} />
        <ChartChoice />
        <MotionChoice />
      </div>
      <div className="sgrp">
        <FieldRow k="sec_contact_email" label="SEC contact email" help="SEC asks every app that downloads its filings for one. Only SEC gets it." shown={email ? maskEmail(email) : null} initial={email ?? ''} onSaved={onSaved} />
      </div>
    </>
  )
}

// ---------- AI tools ----------

interface ToolsPageProps {
  tools: ToolStatus[]
  health: HealthInput
  lockdown: Record<string, LockdownState>
  safety: SafetyState | null
  onTools: (tools: ToolStatus[]) => void
  onReload: () => Promise<void>
  onSafetyStarted: (tool: ToolKind) => void
}

function ToolsPage({ tools, health, lockdown, safety, onTools, onReload, onSafetyStarted }: ToolsPageProps) {
  const [looking, setLooking] = useState(false)
  const [details, setDetails] = useState(false)
  // Check again: look for the tools afresh, skipping the probe's 30-second memory.
  const lookAgain = () => {
    if (looking) return
    setLooking(true)
    const done = () => setLooking(false)
    Promise.all([window.tearsheet.getTools(true).then(onTools), onReload()]).then(done, done)
  }
  const skeptic = healthTiles(health)[3]
  const checking = safety !== null && !safety.done
  return (
    <>
      <Head title="AI tools" lead="Tearsheet uses your own AI tool, signed in to your own plan. It runs with no tools of its own." />
      <div className="sgrp">
        {tools.length === 0 && (
          <div className="sline">
            <span className="fine">
              <Spinner />
              Looking for your AI tools…
            </span>
          </div>
        )}
        {tools.map((t) => {
          const pill = toolPill(t, lockdown[t.kind], safety)
          return (
            <div key={t.kind} className="sline">
              <Label title={t.name} help={toolRole(t, health.primary, skeptic)} />
              <span className={`pill ${pill.tone}`}>{pill.text}</span>
            </div>
          )
        })}
      </div>
      <div className="sgrp">
        {tools
          .filter((t) => t.available)
          .map((t) => (
            <SafetyRow key={t.kind} tool={t} stored={lockdown[t.kind]} safety={safety} anyChecking={checking} onSafetyStarted={onSafetyStarted} />
          ))}
        <div className="sline">
          <Label title="Look for AI tools again" help="Use this after you install one or sign in." />
          <button className="pb" disabled={looking} onClick={lookAgain}>
            {looking ? 'Checking…' : 'Check again'}
          </button>
        </div>
      </div>
      <div className="lkw">
        <button className="lk" aria-expanded={details} onClick={() => setDetails((d) => !d)}>
          {details ? 'Hide details' : 'Show details'}
        </button>
      </div>
      {details && (
        <div className="sgrp">
          {tools.map((t) => (
            <div key={t.kind} className="sline">
              <dl className="sdl">
                <dt>{t.name}</dt>
                <dd className={t.available ? 'path' : 'bad'}>{t.available ? tildePath(t.path ?? '') : t.reason}</dd>
                <dt>Version</dt>
                <dd>{t.version ?? '—'}</dd>
                <dt>Signed in</dt>
                <dd>{t.loggedIn === null ? 'unknown' : t.loggedIn ? 'yes' : 'no'}</dd>
                <dt>Lock-down check</dt>
                <dd>{t.available ? lockdownText(t, lockdown[t.kind]) : '—'}</dd>
              </dl>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// One tool's safety check: how it stands, and the button that runs it again, as setup's chip and
// the home page's red box do. A report running, or past predictions being graded, gets the
// engine's own sentence as a plain line.
function SafetyRow({ tool, stored, safety, anyChecking, onSafetyStarted }: { tool: ToolStatus; stored: LockdownState | undefined; safety: SafetyState | null; anyChecking: boolean; onSafetyStarted: (tool: ToolKind) => void }) {
  const [starting, setStarting] = useState(false)
  const [why, setWhy] = useState<string | null>(null)
  const mine = safety && safety.tool === tool.kind ? safety : null
  const running = mine && !mine.done ? mine : null

  const recheck = async () => {
    if (starting) return
    setStarting(true)
    setWhy(null)
    const reply = await window.tearsheet.runSafetyCheck(tool.kind).catch(() => null)
    setStarting(false)
    if (reply?.ok || reply?.error?.code === 'SAFETY_CHECK_RUNNING') onSafetyStarted(tool.kind)
    else setWhy(reply?.error?.message || 'The safety check didn’t start.')
  }

  let line: ReactNode = lockdownText(tool, stored)
  if (running) {
    line = (
      <>
        <Spinner />
        Checking, {running.n} of {running.total}
      </>
    )
  } else if (why) line = why
  else if (mine?.done && mine.stopped) line = mine.reason ?? 'The check stopped before it finished.'
  else if (mine?.done && !mine.passed) line = mine.reason ?? 'The check did not pass.'
  else if (mine?.done && mine.passed) line = 'Passed just now.'
  // Why a check didn't start is the newest news, so it shows over the last check's result. A
  // check stopped part way is muted: it gave no verdict.
  const tone = running || why || mine?.stopped ? 'st' : mine?.done && !mine.passed ? 'st bad' : mine?.done && mine.passed ? 'st ok' : 'st'
  const canCheck = tool.loggedIn !== false && !running

  return (
    <div className="sline">
      <div className="slab">
        <b>Safety check for {tool.name}</b>
        <Changes k={running ? 'running' : `${tone}:${String(line)}`} className={tone} live>
          {line}
        </Changes>
      </div>
      {canCheck && (
        <button className="pb" disabled={starting || anyChecking} onClick={() => void recheck()}>
          {stored || mine ? 'Run again' : 'Run the check'}
        </button>
      )}
    </div>
  )
}

// ---------- Data keys ----------

// The one-time price download, under the Massive key that starts it (settings/prices.ts). The
// count changes in place; a new state fades up.
function PriceRow({ p }: { p: PriceDownload }) {
  const line = priceLine(p)
  const tone = line.tone === 'ok' ? 'st ok' : line.tone === 'hold' ? 'st hold' : 'st'
  return (
    <div className="sgrp">
      <div className="sline">
        <div className="slab">
          <b>Price download</b>
          <Changes k={p.state} className={tone}>
            {line.tone === 'run' && <Spinner />}
            {line.text}
          </Changes>
        </div>
      </div>
    </div>
  )
}

// ---------- Storage and backup ----------

function StoragePage({ s, onSaved }: { s: SettingsResult; onSaved: () => Promise<void> }) {
  const st = storage(s.raw_bytes, s.raw_cap)
  return (
    <>
      <Head title="Storage and backup" lead="Where Tearsheet keeps its files." />
      <div className="sgrp">
        <div className="sline col">
          <div className="sbarhead">
            <b>Downloads</b>
            <span className="sval">
              {st.used} of {st.cap}
            </span>
          </div>
          <div className={`stor ${st.tone}`} role="meter" aria-label="Downloads against the storage limit" aria-valuemin={0} aria-valuemax={100} aria-valuenow={parseFloat(st.width)}>
            <i style={{ width: st.width }} />
          </div>
          {st.tone === 'hold' ? (
            <span className="help hold">The folder is {st.over ? 'over' : 'near'} its limit. Raise the limit below.</span>
          ) : (
            <span className="help">Raw files from SEC, Massive and FRED, kept so every number can be traced.</span>
          )}
        </div>
        <FieldRow k="raw_cap" label="Storage limit" help="Tearsheet warns you when downloads get close." shown={st.cap} initial={String(s.raw_cap)} onSaved={onSaved} />
      </div>
      <div className="sgrp">
        <FieldRow
          k="backup_dir"
          label="Backup folder"
          help={s.backup_in_icloud ? 'Synced by iCloud, so backup copies also go to Apple’s servers.' : 'Not synced by iCloud, so backup copies stay on this Mac.'}
          helpTone={s.backup_in_icloud ? 'hold' : undefined}
          shown={tildePath(s.backup_dir)}
          initial={tildePath(s.backup_dir)}
          onSaved={onSaved}
        />
      </div>
    </>
  )
}

// ---------- Privacy ----------

function PrivacyPage({ services }: { services: SettingsResult['services'] }) {
  return (
    <>
      <Head title="What leaves your Mac" lead="Tearsheet talks only to these services. Nothing else is sent." />
      <div className="sgrp">
        {services.map((x) => (
          <div key={x.name} className="sline">
            <Label title={x.name} help={`${x.sent}. Key: ${x.key}.`} />
            <span className="sval">{x.cost}</span>
          </div>
        ))}
      </div>
    </>
  )
}

// ---------- Advanced ----------

function AdvancedPage({ s, onSaved }: { s: SettingsResult; onSaved: () => Promise<void> }) {
  return (
    <>
      <Head title="Advanced" lead="Rarely needed." />
      <div className="sgrp">
        <FieldRow k="goal1_round" label="Goal 1 round" help="New full reports count toward this round. Raise it to restart the test after a fix." shown={String(s.goal1_round)} initial={String(s.goal1_round)} onSaved={onSaved} />
      </div>
      <div className="sgrp">
        <div className="sline">
          <Label title="5Y and All chart ranges" help="The first time you open them, Tearsheet downloads the company’s full price history in one call, and shows whatever your price plan serves." />
        </div>
      </div>
    </>
  )
}
