// The first-time setup (the spec's "The first-time path"): nine screens inside the window, with
// no sidebar. The toolbar holds the four-part progress line from step 3 and the safety chip from
// step 5. Setup opens at the first step that isn't done (resumeStep), so an app that quit halfway
// carries on where it stopped. Each screen settles in (A. Settle) and lifts away as the next one
// comes; Open Tearsheet hands over to the app.
//
// Nothing here runs a command for the person: Open Terminal only opens Terminal, and each line is
// pasted by them. Keys go straight to the engine's check and are never shown again.

import '../setup/setup.css'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import type { ToolStatus } from '../../preload/api'
import type { SettingsResult } from '../../shared/protocol'
import { leaveMs } from '../motion'
import { Email, KeyStep, Ready } from '../setup/details'
import { HowItWorks, Welcome } from '../setup/intro'
import { CheckIcon } from '../setup/parts'
import { SafetyChip, SafetyPopover } from '../setup/SafetyChip'
import {
  AFTER_CONNECT,
  hasProgress,
  nextStep,
  ONE_CLICK_ENABLED,
  progressSegment,
  resumeStep,
  safetyPassedFor,
  safetyView,
  TOOL_TEXT,
  type KeyService,
  type SafetyState,
  type SetupStep,
  type ToolKind
} from '../setup/steps'
import { Connected, Find, Install, OneClick } from '../setup/tool'

// Step 4 checks for the tool again this often while it is open.
const POLL_MS = 2000
// The "Looking for Claude Code" screen stays at least this long, so it doesn't flash past.
const SCAN_MIN_MS = 1500
// The safety ring moves to the chip this long after step 5 opens.
const DOCK_AFTER_MS = 2000
// The email's "Saved" shows this long before the next screen.
const SAVED_MS = 500

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

export interface SetupProps {
  // The app is leaving setup for the home page: everything fades and lifts away.
  leaving: boolean
  // This session's safety check, kept by App from the engine's notes.
  safety: SafetyState | null
  onSafetyStarted: (tool: ToolKind) => void
  // Setup is finished (setup_done is saved): go to the home page.
  onFinish: () => void
  // A notice to show under the toolbar, like the engine failing to start.
  children?: ReactNode
}

export function Setup({ leaving, safety, onSafetyStarted, onFinish, children }: SetupProps) {
  const [step, setStep] = useState<SetupStep | null>(null)
  // Counts screen changes, so a screen shown again (Find, for the other tool) enters afresh.
  const [visit, setVisit] = useState(0)
  const [out, setOut] = useState(false)
  const [kind, setKind] = useState<ToolKind>('claude')
  const [tools, setTools] = useState<ToolStatus[]>([])
  const [settings, setSettings] = useState<SettingsResult | null>(null)
  const [scanning, setScanning] = useState(true)
  const [proofs, setProofs] = useState<Partial<Record<KeyService, string>>>({})
  const [fredSkipped, setFredSkipped] = useState(false)
  const [email, setEmail] = useState('')
  const [manual, setManual] = useState(false)
  const [docking, setDocking] = useState(false)
  const [docked, setDocked] = useState(false)
  const [popOpen, setPopOpen] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const screen = useRef<HTMLElement>(null)
  const switching = useRef(false)
  const startedFor = useRef<ToolKind | null>(null)
  const finish = useRef(onFinish)
  finish.current = onFinish

  const tool = tools.find((t) => t.kind === kind)
  const T = TOOL_TEXT[kind]
  const alreadyPassed = safetyPassedFor(tool, settings?.lockdown?.[kind])
  const view = safetyView(safety, kind, alreadyPassed, startError)
  const keys: Record<string, 'set' | 'missing'> = { ...(settings?.keys ?? {}) }
  if (proofs.massive) keys.massive = 'set'
  if (proofs.fred) keys.fred = 'set'

  // What the next screen is decided from, read when a Continue is pressed.
  const latest = useRef({ tool, keys, fredSkipped, email })
  latest.current = { tool, keys, fredSkipped, email }

  // Change screens: this one fades and lifts away, then the next settles in. `then` runs as the
  // new screen arrives.
  const goStep = useCallback((next: SetupStep, then?: () => void) => {
    if (switching.current) return
    if (next === 'done') return finish.current()
    switching.current = true
    setPopOpen(false)
    setOut(true)
    window.setTimeout(() => {
      then?.()
      setStep(next)
      setVisit((v) => v + 1)
      setOut(false)
      switching.current = false
    }, leaveMs())
  }, [])

  // From step 5 on, go to the next step that isn't done.
  const advance = useCallback(
    (from: SetupStep) => {
      const { tool: t, keys: k, fredSkipped: skipped, email: e } = latest.current
      goStep(nextStep(from, { tool: t, keys: k, fredSkipped: skipped, email: e }))
    },
    [goStep]
  )

  // Open at the first step that isn't done.
  useEffect(() => {
    let live = true
    void Promise.all([window.tearsheet.getSettings(), window.tearsheet.getTools(false)]).then(([reply, list]) => {
      if (!live) return
      const s = reply.ok ? (reply.result ?? null) : null
      const k: ToolKind = s?.primary_tool === 'codex' ? 'codex' : 'claude'
      setSettings(s)
      setTools(list)
      setKind(k)
      setFredSkipped(Boolean(s?.fred_skipped))
      setEmail(s?.sec_contact_email ?? '')
      const first = resumeStep({
        setupDone: Boolean(s?.setup_done),
        tool: list.find((t) => t.kind === k),
        keys: s?.keys ?? {},
        fredSkipped: Boolean(s?.fred_skipped),
        email: s?.sec_contact_email ?? null,
        anyProgress: s ? hasProgress(s) : false
      })
      if (first === 'done') finish.current()
      else setStep(first)
    })
    return () => {
      live = false
    }
  }, [])

  // The new screen takes the focus, so the keyboard carries on from its top.
  useEffect(() => {
    if (visit > 0) screen.current?.focus({ preventScroll: true })
  }, [visit])

  // 3. Look for the tool. Found and signed in goes straight to step 5; found but signed out
  // opens step 4 at its sign-in card.
  useEffect(() => {
    if (step !== 'find') return
    let live = true
    setScanning(true)
    const t0 = Date.now()
    void window.tearsheet.getTools(true).then(async (list) => {
      const wait = SCAN_MIN_MS - (Date.now() - t0)
      if (wait > 0) await sleep(wait)
      if (!live) return
      setTools(list)
      const found = list.find((t) => t.kind === kind)
      if (found?.available && found.loggedIn === true) goStep('connected')
      else if (found?.available) goStep('install')
      else setScanning(false)
    })
    return () => {
      live = false
    }
  }, [step, visit, kind, goStep])

  // 4. Check again every 2 seconds while the page is open; each card ticks itself off.
  useEffect(() => {
    if (step !== 'install') return
    let live = true
    let timer: number | undefined
    const poll = () => {
      void window.tearsheet.getTools(true).then((list) => {
        if (!live) return
        setTools(list)
        timer = window.setTimeout(poll, POLL_MS)
      })
    }
    timer = window.setTimeout(poll, POLL_MS)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [step])

  // 5. Remember which tool was connected, and move the safety ring to the chip after about 2 s.
  useEffect(() => {
    if (step !== 'connected') return
    void window.tearsheet.setSetting('primary_tool', kind)
    setDocking(false)
    setDocked(false)
    const fade = reduced() ? 0 : 350
    const a = window.setTimeout(() => setDocking(true), DOCK_AFTER_MS)
    const b = window.setTimeout(() => {
      setDocked(true)
      setDocking(false)
    }, DOCK_AFTER_MS + fade)
    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
      setDocked(true)
      setDocking(false)
    }
  }, [step, kind])

  // The safety check starts at step 5 (or wherever setup resumes after it), unless it has
  // already passed for this version. It runs once per session; the chip offers to run it again.
  const startCheck = useCallback(() => {
    startedFor.current = kind
    setStartError(null)
    void window.tearsheet.runSafetyCheck(kind).then((reply) => {
      if (reply.ok || reply.error?.code === 'SAFETY_CHECK_RUNNING') onSafetyStarted(kind)
      else setStartError(reply.error?.message || 'The safety check didn’t start.')
    })
  }, [kind, onSafetyStarted])

  const signedIn = tool?.available === true && tool.loggedIn === true
  const checkedNow = safety !== null && safety.tool === kind
  useEffect(() => {
    if (!step || !AFTER_CONNECT.has(step) || !signedIn || alreadyPassed || checkedNow) return
    if (startedFor.current === kind) return
    startCheck()
  }, [step, signedIn, alreadyPassed, checkedNow, kind, startCheck])

  const openTearsheet = async () => {
    await window.tearsheet.setSetting('setup_done', '1')
    finish.current()
  }

  let content: ReactNode = null
  switch (step) {
    case 'welcome':
      content = <Welcome onStart={() => goStep('connect')} />
      break
    case 'connect':
      content = <HowItWorks onNext={() => goStep('find')} />
      break
    case 'find':
      content = (
        <Find
          kind={kind}
          scanning={scanning}
          onHowTo={() => goStep('install')}
          onSwitch={() =>
            goStep('find', () => {
              setKind(kind === 'claude' ? 'codex' : 'claude')
              setScanning(true)
            })
          }
        />
      )
      break
    case 'install':
      content =
        ONE_CLICK_ENABLED && kind === 'claude' && !manual ? (
          <OneClick kind={kind} tool={tool} onManual={() => goStep('install', () => setManual(true))} onContinue={() => goStep('connected')} />
        ) : (
          <Install kind={kind} tool={tool} onContinue={() => goStep('connected')} />
        )
      break
    case 'connected':
      content = <Connected kind={kind} tool={tool} view={view} docking={docking} docked={docked} onNext={() => advance('connected')} />
      break
    case 'prices':
      content = <KeyStep service="massive" proof={proofs.massive} onWorks={(proof) => setProofs((p) => ({ ...p, massive: proof }))} onContinue={() => advance('prices')} />
      break
    case 'fred':
      content = (
        <KeyStep
          service="fred"
          proof={proofs.fred}
          skipped={fredSkipped}
          onWorks={(proof) => {
            setProofs((p) => ({ ...p, fred: proof }))
            if (fredSkipped) {
              setFredSkipped(false)
              void window.tearsheet.setSetting('fred_skipped', '0')
            }
          }}
          onSkip={() => {
            setFredSkipped(true)
            void window.tearsheet.setSetting('fred_skipped', '1')
          }}
          onContinue={() => advance('fred')}
        />
      )
      break
    case 'email':
      content = (
        <Email
          initial={email}
          onSaved={(saved) => {
            setEmail(saved)
            latest.current = { ...latest.current, email: saved }
            window.setTimeout(() => advance('email'), SAVED_MS)
          }}
        />
      )
      break
    case 'ready':
      content = <Ready kind={kind} tool={tool} view={view} fred={keys.fred === 'set' ? 'works' : 'skipped'} email={email} onOpen={openTearsheet} />
      break
  }

  const seg = step ? progressSegment(step) : null
  // The chip shows from step 5 on, once the large ring on step 5 has moved up to it.
  const chipShown = step !== null && AFTER_CONNECT.has(step) && !(step === 'connected' && view.state === 'running' && !docking && !docked)
  const names = [T.name, 'Prices', 'Details', 'Ready']

  return (
    <div className={leaving ? 'setup leaving' : 'setup'}>
      <header className="top bare stp">
        {seg !== null && (
          <div className="prog" aria-label="Setup progress">
            {names.map((name, k) => (
              <span key={k} className={k < seg ? 'done' : k === seg ? 'on' : undefined} aria-current={k === seg ? 'step' : undefined}>
                {k < seg && <CheckIcon />}
                {name}
              </span>
            ))}
          </div>
        )}
        {chipShown && <SafetyChip view={view} open={popOpen} onToggle={() => setPopOpen((o) => !o)} />}
      </header>
      {children}
      <main key={visit} ref={screen} tabIndex={-1} className={out ? 'screen leave' : 'screen setup-in'}>
        {content}
      </main>
      {popOpen && chipShown && (
        <SafetyPopover
          view={view}
          tool={T}
          onRetry={() => {
            setPopOpen(false)
            startCheck()
          }}
          onClose={() => setPopOpen(false)}
        />
      )}
    </div>
  )
}
