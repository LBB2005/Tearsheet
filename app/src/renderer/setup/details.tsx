// Setup's last screens: Prices (6) and Economic figures (7), the SEC email (8), and You're set
// up (9).

import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { ToolStatus } from '../../preload/api'
import { GetKeyCard, KEY_TEXT, KeyCard } from './KeyCard'
import { at, Card, CheckIcon, Changes, Ring } from './parts'
import { isEmail, versionNumber } from '../../shared/tools'
import { TOOL_TEXT, type KeyService, type SafetyView, type ToolKind } from './steps'

export interface KeyStepProps {
  service: KeyService
  // The proof line once a key works.
  proof?: string
  // FRED only: Skip for now was pressed.
  skipped?: boolean
  onWorks: (proof: string) => void
  onSkip?: () => void
  onContinue: () => void
}

// 6 and 7. The prices key is required; the FRED key is optional and can be skipped.
export function KeyStep({ service, proof, skipped = false, onWorks, onSkip, onContinue }: KeyStepProps) {
  const text = KEY_TEXT[service]
  const optional = service === 'fred'
  const skipShown = optional && skipped && !proof
  return (
    <div className="col">
      <h1 className="h1 mv" style={at(0)}>
        {text.title}
        {optional && <span className="pill">Optional</span>}
      </h1>
      <p className="lead mv" style={at(1)}>
        {text.lead}
      </p>
      <GetKeyCard service={service} i={2} />
      <KeyCard service={service} i={3} proof={proof} onWorks={onWorks} />
      {skipShown ? (
        <p key="skip" className="skipnote chg" role="status">
          Skipped. Reports will say “economic figures not connected” until you add the key in Settings.
        </p>
      ) : (
        <p key="fine" className="fine mv" style={at(4)}>
          {text.fine}
        </p>
      )}
      <div className="row mv" style={at(5)}>
        <button className="btn" disabled={!proof && !skipShown} onClick={onContinue}>
          {skipShown ? 'Continue without it' : 'Continue'}
        </button>
        {optional && !skipped && !proof && (
          <button className="btn3" onClick={onSkip}>
            Skip for now
          </button>
        )}
      </div>
    </div>
  )
}

type EmailState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'bad'; text: string }

// 8. The SEC email: one field, with the reason SEC asks for it. Continue checks it looks like an
// email, saves it, shows "Saved" and moves on.
export function Email({ initial, onSaved }: { initial: string; onSaved: (email: string) => void }) {
  const [value, setValue] = useState(initial)
  const [state, setState] = useState<EmailState>({ kind: 'idle' })
  const done = useRef(onSaved)
  done.current = onSaved

  const save = async () => {
    if (state.kind === 'saving' || state.kind === 'saved') return
    const email = value.trim()
    if (!isEmail(email)) return setState({ kind: 'bad', text: 'That doesn’t look like an email address.' })
    setState({ kind: 'saving' })
    const reply = await window.tearsheet.setSetting('sec_contact_email', email)
    if (!reply.ok) return setState({ kind: 'bad', text: reply.error?.message ?? 'The email wasn’t saved. Try again.' })
    setState({ kind: 'saved' })
    done.current(email)
  }

  return (
    <div className="col">
      <h1 className="h1 mv" style={at(0)}>
        Your email, for SEC
      </h1>
      <p className="lead mv" style={at(1)}>
        SEC asks every program that downloads its filings for a contact email. Tearsheet sends yours only to SEC, with each request.
      </p>
      <Card i={2} className={state.kind === 'saved' ? 'done' : undefined}>
        <div className="field">
          <input
            type="email"
            placeholder="you@example.com"
            aria-label="Your email"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              if (state.kind === 'bad') setState({ kind: 'idle' })
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void save()
              }
            }}
          />
        </div>
        <Changes k={state.kind === 'bad' ? `bad:${state.text}` : state.kind} className={state.kind === 'saved' ? 'st ok' : state.kind === 'bad' ? 'st bad' : 'st'} live>
          {state.kind === 'saved' && (
            <>
              <CheckIcon />
              Saved
            </>
          )}
          {state.kind === 'bad' && state.text}
        </Changes>
      </Card>
      <p className="fine mv" style={at(3)}>
        You can change it any time in Settings.
      </p>
      <div className="row mv" style={at(4)}>
        <button className="btn" disabled={state.kind === 'saving'} onClick={() => void save()}>
          Continue
        </button>
      </div>
    </div>
  )
}

function Row({ i, icon, iconClass, title, text }: { i: number; icon: ReactNode; iconClass?: string; title: string; text: string }) {
  return (
    <div className="ci mv" style={at(i)}>
      <span className={iconClass ? `ic ${iconClass}` : 'ic'}>{icon}</span>
      <b>{title}</b>
      <span>{text}</span>
    </div>
  )
}

function SafetyRow({ view }: { view: SafetyView }) {
  let icon
  let text
  if (view.state === 'passed') {
    icon = <CheckIcon />
    text = 'Passed'
  } else if (view.state === 'running') {
    icon = <Ring p={view.total > 0 ? view.n / view.total : 0} size={18} width={3} />
    text = `Finishing: ${view.total - view.n} of ${view.total} calls to go`
  } else if (view.state === 'unfinished') {
    icon = <i />
    text = 'Didn’t finish. The chip at the top right can run it again; it also runs by itself before the first report.'
  } else {
    icon = <i />
    text = 'Didn’t pass. The chip at the top right says why.'
  }
  // Only a change of state fades in; the count ticks down in place.
  return (
    <Changes k={view.state} className="ci mv" style={at(2)} live>
      <span className={view.state === 'failed' ? 'ic bad' : view.state === 'unfinished' ? 'ic muted' : 'ic'}>{icon}</span>
      <b>Safety check</b>
      <span>{text}</span>
    </Changes>
  )
}

export interface ReadyProps {
  kind: ToolKind
  tool: ToolStatus | undefined
  view: SafetyView
  fred: 'works' | 'skipped'
  email: string
  // Saves that setup is finished and goes into the app; answers with a problem, or null.
  onOpen: () => Promise<string | null>
}

// 9. You're set up: what's connected, then Open Tearsheet hands over to the app.
export function Ready({ kind, tool, view, fred, email, onOpen }: ReadyProps) {
  const T = TOOL_TEXT[kind]
  // Pressed once: it stays pressed while the app opens, and comes back only if saving failed.
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const pressed = useRef(false)
  const live = useRef(true)
  useEffect(
    () => () => {
      live.current = false
    },
    []
  )
  const open = () => {
    if (pressed.current) return
    pressed.current = true
    setBusy(true)
    setProblem(null)
    void onOpen().then(
      (failed) => {
        if (!failed || !live.current) return
        pressed.current = false
        setBusy(false)
        setProblem(failed)
      },
      () => {
        if (!live.current) return
        pressed.current = false
        setBusy(false)
        setProblem('Tearsheet couldn’t save that setup is finished. Try again.')
      }
    )
  }
  return (
    <div className="col">
      <h1 className="h1 mv" style={at(0)}>
        You’re set up
      </h1>
      <Card i={1} className="chk">
        <Row i={1} icon={<CheckIcon />} title={T.name} text={`Connected, version ${versionNumber(tool?.version ?? null) ?? 'unknown'}`} />
        <SafetyRow view={view} />
        <Row i={3} icon={<CheckIcon />} title="Prices" text="Massive key works" />
        {fred === 'skipped' ? (
          <Row i={4} icon={<i />} iconClass="skip" title="Economic figures" text="Skipped. Add the key in Settings" />
        ) : (
          <Row i={4} icon={<CheckIcon />} title="Economic figures" text="FRED key works" />
        )}
        <Row i={5} icon={<CheckIcon />} title="SEC email" text={email} />
      </Card>
      <p className="lead small mv" style={at(6)}>
        Your first report takes about 20 minutes, mostly fetching a year of prices for the company and about 40 peers on the free plan. Later reports in the same sector are quicker.
      </p>
      <div className="row mv" style={at(7)}>
        <button className="btn big" disabled={busy} onClick={open}>
          Open Tearsheet
        </button>
        {problem && (
          <div className="st bad chg" role="alert">
            {problem}
          </div>
        )}
      </div>
    </div>
  )
}
