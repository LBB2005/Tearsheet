// Setup's AI tool screens: Looking for Claude Code (3), Install and sign in (4) with its
// one-click version kept switched off, and Connected (5) with the safety check's large ring.
// Nothing here runs a command: Open Terminal only opens Terminal, and the person pastes each line.

import { useState } from 'react'

import type { ToolStatus } from '../../preload/api'
import { at, Card, CheckIcon, Changes, CodeLine, Ring, Spinner, TerminalIcon } from './parts'
import { versionNumber } from '../../shared/tools'
import { TOOL_TEXT, type SafetyView, type ToolKind } from './steps'

const openTerminal = () => void window.tearsheet.openTerminal()

// 3. Looking for the tool. Three small dots pulse under its icon while the probe runs; if it
// isn't found the screen says so plainly and offers the steps.
export function Find({ kind, scanning, onHowTo, onSwitch }: { kind: ToolKind; scanning: boolean; onHowTo: () => void; onSwitch: () => void }) {
  const T = TOOL_TEXT[kind]
  const [looked, setLooked] = useState(false)
  return (
    <div className="col center">
      <div className={scanning ? 'scan on mv' : 'scan off mv'} style={at(0)}>
        <span className="dots" aria-hidden="true">
          <i style={{ ['--k' as string]: 0 }} />
          <i style={{ ['--k' as string]: 1 }} />
          <i style={{ ['--k' as string]: 2 }} />
        </span>
        <span className="glyph">
          <TerminalIcon />
        </span>
      </div>
      {scanning ? (
        <>
          <h1 className="h1 mv" style={at(1)}>
            Looking for {T.name}…
          </h1>
          <p className="lead mv" style={at(2)}>
            Tearsheet works through {T.name}, {T.maker}’s app that runs on your {T.plan}.
          </p>
        </>
      ) : (
        <div className="col center chg">
          <h1 className="h1">{T.name} isn’t on this Mac yet</h1>
          <p className="lead">Adding it takes about two minutes. You’ll need {T.needs}.</p>
          <div className="row mid">
            <button className="btn" onClick={onHowTo}>
              Show me how
            </button>
            <button className="btn3" onClick={onSwitch}>
              {kind === 'claude' ? 'I use ChatGPT: connect Codex instead' : 'Use Claude Code instead'}
            </button>
          </div>
          <button className="btn3 small" aria-expanded={looked} onClick={() => setLooked((l) => !l)}>
            {looked ? 'Hide where Tearsheet looked' : 'Where Tearsheet looked'}
          </button>
          {looked && <p className="fine chg">Homebrew’s folder, /usr/local/bin, ~/.local/bin and every folder on your shell’s PATH.</p>}
        </div>
      )}
    </div>
  )
}

// 4. Install and sign in: two numbered cards, each with the exact line and a Copy button. The
// page checks again every 2 seconds (in Setup) and ticks each card off by itself.
export function Install({ kind, tool, onContinue }: { kind: ToolKind; tool: ToolStatus | undefined; onContinue: () => void }) {
  const T = TOOL_TEXT[kind]
  const installed = tool?.available === true
  const signed = installed && tool?.loggedIn === true
  const version = versionNumber(tool?.version ?? null)
  return (
    <div className="col">
      <h1 className="h1 mv" style={at(0)}>
        Add {T.name} in two steps
      </h1>
      <p className="lead mv" style={at(1)}>
        You’ll paste two lines into Terminal, the Mac’s command window. This page ticks each step off by itself.
      </p>
      <Card i={2} className={installed ? 'done' : undefined}>
        <h4>
          <span className="n">{installed ? <CheckIcon /> : '1'}</span>Install it
        </h4>
        <p>Open Terminal, paste this line and press Return.</p>
        <CodeLine text={T.install} />
        {kind === 'codex' && (
          <p className="fine">
            If Terminal says npm isn’t found, install Node.js from{' '}
            <button className="link" onClick={() => void window.tearsheet.openExternal('https://nodejs.org')}>
              nodejs.org
            </button>{' '}
            first.
          </p>
        )}
        <div className="row">
          <button className="btn2" onClick={openTerminal}>
            Open Terminal
          </button>
          <Changes k={installed ? 'in' : 'wait'} className={installed ? 'st ok' : 'st'} live>
            {installed ? (
              <>
                <CheckIcon />
                Installed: {T.name} {version}
              </>
            ) : (
              <>
                <Spinner />
                Waiting for the install to finish
              </>
            )}
          </Changes>
        </div>
      </Card>
      <Card i={3} className={signed ? 'done' : installed ? undefined : 'later'}>
        <h4>
          <span className="n">{signed ? <CheckIcon /> : '2'}</span>Sign in
        </h4>
        <p>Then paste this in the same window. Your browser opens so you can sign in to your {T.plan}.</p>
        <CodeLine text={T.login} />
        <Changes k={signed ? 'in' : installed ? 'wait' : 'later'} className={signed ? 'st ok' : 'st'} live>
          {signed ? (
            <>
              <CheckIcon />
              Signed in to your {T.plan}
            </>
          ) : installed ? (
            <>
              <Spinner />
              Waiting for you to sign in
            </>
          ) : (
            'After step 1'
          )}
        </Changes>
      </Card>
      <div className="row mv" style={at(4)}>
        <button className="btn" disabled={!signed} onClick={onContinue}>
          Continue
        </button>
        <span className="fine">Tearsheet never sees your password.</span>
      </div>
    </div>
  )
}

// 4, the one-click version: one card showing both commands in full, and an Install and sign in
// button. It is built but switched off (ONE_CLICK_ENABLED in steps.ts) until Anthropic approves
// it. There is no bridge command that runs the install yet; it arrives, with that approval, as
// `onInstall`. Until then the button stays disabled.
export function OneClick({ kind, tool, onInstall, onManual, onContinue }: { kind: ToolKind; tool: ToolStatus | undefined; onInstall?: () => void; onManual: () => void; onContinue: () => void }) {
  const T = TOOL_TEXT[kind]
  const [running, setRunning] = useState(false)
  const installed = tool?.available === true
  const signed = installed && tool?.loggedIn === true
  const state = signed ? 'done' : installed ? 'signing' : running ? 'installing' : 'idle'
  return (
    <div className="col">
      <h1 className="h1 mv" style={at(0)}>
        Add {T.name}
      </h1>
      <p className="lead mv" style={at(1)}>
        Tearsheet can install it and start the sign-in for you. These are the exact commands it runs:
      </p>
      <Card i={2} className={signed ? 'done' : undefined}>
        <div className="code">
          <span>{T.install}</span>
        </div>
        <div className="code">
          <span>{T.login}</span>
        </div>
        <div className="row">
          <button
            className="btn"
            disabled={!onInstall || state !== 'idle'}
            onClick={() => {
              setRunning(true)
              onInstall?.()
            }}
          >
            Install and sign in
          </button>
          <Changes k={state} className={signed ? 'st ok' : 'st'} live>
            {state === 'installing' && (
              <>
                <Spinner />
                Installing, about a minute
              </>
            )}
            {state === 'signing' && (
              <>
                <Spinner />
                Waiting for you to sign in, in your browser
              </>
            )}
            {state === 'done' && (
              <>
                <CheckIcon />
                Installed and signed in to your {T.plan}
              </>
            )}
          </Changes>
        </div>
      </Card>
      <div className="row mv" style={at(3)}>
        <button className="btn" disabled={!signed} onClick={onContinue}>
          Continue
        </button>
        <button className="btn3" onClick={onManual}>
          Do it myself in Terminal
        </button>
      </div>
    </div>
  )
}

export interface ConnectedProps {
  kind: ToolKind
  tool: ToolStatus | undefined
  view: SafetyView
  // About 2 s in, the large ring fades out (docking) and the chip takes its place (docked).
  docking: boolean
  docked: boolean
  // The button's words, for the screen it goes to: "Next: prices" unless prices is done.
  nextLabel: string
  onNext: () => void
}

// 5. Connected: a check, three facts, and the safety check starting as a large ring.
export function Connected({ kind, tool, view, docking, docked, nextLabel, onNext }: ConnectedProps) {
  const T = TOOL_TEXT[kind]
  const version = versionNumber(tool?.version ?? null)
  const ring = view.state === 'running' && !docked
  let after
  if (view.state === 'passed') after = `The safety check has passed for ${T.name} ${version}: ${T.short} can only read and write text.`
  else if (view.state === 'failed') after = 'The safety check didn’t pass. The chip at the top right says why.'
  else if (view.state === 'unfinished') after = 'The safety check didn’t finish. The chip at the top right can run it again.'
  else after = 'The safety check keeps running at the top right. You can carry on.'
  return (
    <div className="col center">
      <div className="okmark mv" style={at(0)}>
        <svg viewBox="0 0 76 76" aria-hidden="true">
          <circle className="mv-l" cx="38" cy="38" r="36" />
          <path className="mv-l" style={at(3)} d="M23 39.5l10 10L54 28" />
        </svg>
      </div>
      <h1 className="h1 mv" style={at(1)}>
        {T.name} is connected
      </h1>
      <div className="facts mv" style={at(2)}>
        <span>
          {T.name} {version}
        </span>
        <span>Signed in to your {T.plan}</span>
        <span>No API key in use</span>
      </div>
      {ring && view.state === 'running' ? (
        <>
          <div className={docking ? 'bigring out' : 'bigring mv'} style={at(3)} role="img" aria-label={`Safety check, ${view.n} of ${view.total}`}>
            <Ring p={view.total > 0 ? view.n / view.total : 0} size={132} width={8} />
            <div className="bt">
              <b>{view.n}</b>
              <small>of {view.total}</small>
            </div>
          </div>
          <p className={docking ? 'lead small out' : 'lead small mv'} style={at(4)}>
            <b>Next, a safety check.</b> Tearsheet makes sure {T.short} can only read and write text: no commands, no files, none of your own settings or plugins. It takes about 3 minutes and keeps going while you carry on.
          </p>
        </>
      ) : (
        <p key="after" className={docked ? 'lead small chg' : 'lead small mv'} style={at(3)}>
          {after}
        </p>
      )}
      <div className="row mv" style={at(5)}>
        <button className="btn" onClick={onNext}>
          {nextLabel}
        </button>
      </div>
    </div>
  )
}
