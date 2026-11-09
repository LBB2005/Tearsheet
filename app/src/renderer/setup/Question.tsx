// The setup screen's one question at a time (first-run design item 33), under the list: connect
// the AI, then the price key, then the email and Start. Ported from
// docs/designs/first-run/canvas/Spine.dc.html (.ask, .pick, .prog, .inst, .krow3, .erow, .go).
//
// The Install guard: every button that starts an install or a sign-in (the three Install buttons,
// and CUJ 5's Update and Sign in buttons) ignores a click within half a second of the window's
// focus event, so a click meant only to bring the window back never starts one (§4, Focus).

import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from 'react'

import type { TerminalResult, ToolCommands, ToolKind } from '../../shared/tools'
import { tildePath, versionNumber } from '../../shared/tools'
import { KeyCard } from './KeyCard'
import { Keys } from './List'
import { CodeLine, Spinner } from './parts'
import type { EmailMachine } from './state/email'
import type { ConnectCard, ScreenView } from './view'
import { TOOL_TEXT, WORDS } from './words'

// A click this soon after the window comes to the front only brought it forward.
export const GUARD_MS = 500

// Wraps a handler so it ignores a click that arrives within GUARD_MS of the window's focus event.
export function useInstallGuard(): <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => void {
  const focusedAt = useRef(Number.NEGATIVE_INFINITY)
  useEffect(() => {
    const on = () => {
      focusedAt.current = Date.now()
    }
    window.addEventListener('focus', on)
    return () => window.removeEventListener('focus', on)
  }, [])
  return useCallback(
    <A extends unknown[]>(fn: (...args: A) => void) =>
      (...args: A) => {
        if (Date.now() - focusedAt.current < GUARD_MS) return
        fn(...args)
      },
    []
  )
}

const CHOICES: { kinds: ToolKind[]; install: string; has: string }[] = [
  { kinds: ['claude'], install: WORDS.installClaude, has: WORDS.hasClaude },
  { kinds: ['codex'], install: WORDS.installCodex, has: WORDS.hasCodex },
  { kinds: ['claude', 'codex'], install: WORDS.installBoth, has: WORDS.hasBoth }
]

// The last copy to Terminal, for the card to say what happened.
export interface CopyState {
  kinds: ToolKind[]
  result: TerminalResult
  // The command to copy by hand, when the copy didn't work.
  command: string | null
}

export interface QuestionHandlers {
  install: (kinds: ToolKind[]) => void
  copy: (kinds: ToolKind[]) => void
  recheck: () => void
  showLog: () => void
  use: (kind: ToolKind) => void
  keyWorks: (proof: string) => void
  toMassive: () => void
  typeEmail: (value: string) => void
  changeEmail: () => void
  start: () => void
}

export interface QuestionProps {
  view: ScreenView
  // What commandsFor answered for these tools, once it has.
  commands: (kinds: ToolKind[]) => ToolCommands | null
  copy: CopyState | null
  email: EmailMachine
  keyRef: RefObject<HTMLInputElement>
  emailRef: RefObject<HTMLInputElement>
  saving: boolean
  // Why Start didn't finish, or why Show log didn't open.
  problem: string | null
  note: string | null
  on: QuestionHandlers
}

// The exact commands, in small type and in full (§2, "The commands are shown before they run").
function Commands({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null
  return (
    <div className="cmdbox">
      <p className="fine">{WORDS.commandsHead}</p>
      {lines.map((line) => (
        <div key={line} className="cmds">
          {line}
        </div>
      ))}
    </div>
  )
}

// What a copy to Terminal did, when it didn't simply work.
export function CopyNote({ copy }: { copy: CopyState | null }) {
  if (!copy || (copy.result.copied && copy.result.opened)) return null
  if (copy.result.copied) return <p className="st">{WORDS.copiedNoTerminal}</p>
  return (
    <div className="copyfail">
      <p className="st bad">{WORDS.copyFailed}</p>
      {copy.command && <CodeLine text={copy.command} />}
    </div>
  )
}

function Connect({ card, commands, copy, guard, on, note }: { card: ConnectCard; commands: QuestionProps['commands']; copy: CopyState | null; guard: ReturnType<typeof useInstallGuard>; on: QuestionHandlers; note: string | null }) {
  const stepsOf = (kinds: ToolKind[]) => commands(kinds)?.steps.map((s) => s.command) ?? []
  const pasteOf = (kinds: ToolKind[]) => commands(kinds)?.paste ?? null
  let body: ReactNode = null
  if (card.kind === 'pick' && card.mode === 'button') {
    body = (
      <>
        <p className="lead">{WORDS.connectLead}</p>
        <div className="pick">
          {CHOICES.map((c) => (
            <button key={c.install} className="pbtn" onClick={guard(() => on.install(c.kinds))}>
              <span className="pg" aria-hidden="true">
                &gt;_
              </span>
              <span>
                <b>{c.install}</b>
                <small>{c.has}</small>
              </span>
            </button>
          ))}
        </div>
        <p className="fine">{WORDS.connectFine}</p>
        <Commands lines={CHOICES.map((c) => `${c.install}: ${stepsOf(c.kinds).join(', then ')}`).filter((l) => !l.endsWith(': '))} />
      </>
    )
  } else if (card.kind === 'pick') {
    body = (
      <>
        <p className="lead">{WORDS.connectLead}</p>
        <div className="inst">
          {CHOICES.map((c) => (
            <div key={c.has} className="opt">
              <span className="ot">{c.has}</span>
              <div className="code">
                <span>{pasteOf(c.kinds) ?? '…'}</span>
              </div>
              <button className="btn2" aria-label={`${WORDS.copyOpen}: ${c.has}`} onClick={() => on.copy(c.kinds)}>
                {WORDS.copyOpen}
              </button>
            </div>
          ))}
        </div>
        <p className="fine">
          {WORDS.pasteFine} <Keys />, {WORDS.pasteFineAfter}
        </p>
        <CopyNote copy={copy} />
      </>
    )
  } else if (card.kind === 'progress') {
    body = (
      <div className="prog" aria-live="polite">
        <div className="pl">
          <Spinner />
          <b>{card.title}</b>
        </div>
        {card.lines.map((line, k) => (
          <div key={`${k}:${line}`} className={k === card.lines.length - 1 && /installed$/.test(line) ? 'pline ok' : 'pline'}>
            {line}
          </div>
        ))}
      </div>
    )
  } else if (card.kind === 'fix') {
    const kinds = [card.tool]
    body = (
      <>
        <p className="lead" role="status">
          {card.sentence}
        </p>
        {card.button && (
          <div className="row">
            {card.mode === 'button' ? (
              <button className="btn" onClick={guard(() => on.install(kinds))}>
                {card.button}
              </button>
            ) : (
              <>
                <div className="code grow">
                  <span>{pasteOf(kinds) ?? '…'}</span>
                </div>
                <button className="btn2" onClick={() => on.copy(kinds)}>
                  {card.button}
                </button>
              </>
            )}
          </div>
        )}
        {card.button && card.mode === 'paste' && (
          <p className="fine">
            {WORDS.pasteFine} <Keys />, {WORDS.pasteFineAfter}
          </p>
        )}
        {card.button && card.mode === 'button' && <Commands lines={stepsOf(kinds)} />}
        <CopyNote copy={copy} />
      </>
    )
  } else if (card.kind === 'checking') {
    const T = TOOL_TEXT[card.tool]
    body = card.long ? (
      <>
        <p className="lead">Tearsheet can’t tell whether {T.name} is signed in.</p>
        {card.found?.path && (
          <p className="fine">
            Found {T.name} {versionNumber(card.found.version) ?? ''} in {tildePath(card.found.path.replace(/\/[^/]+$/, ''))}.
          </p>
        )}
        <div className="row">
          <button className="btn2" onClick={on.recheck}>
            {WORDS.tryAgain}
          </button>
          <button className="btn2" onClick={on.showLog}>
            {WORDS.showLog}
          </button>
          {card.other && (
            <button className="btn3" onClick={() => on.use(card.other as ToolKind)}>
              Use {TOOL_TEXT[card.other].name} instead
            </button>
          )}
        </div>
        {note && <p className="st">{note}</p>}
      </>
    ) : (
      <p className="st" role="status">
        <Spinner />
        {card.sentence}
      </p>
    )
  } else {
    body = (
      <>
        <p className="lead bad" role="alert">
          {card.reason}
        </p>
        <div className="row">
          {card.mode === 'button' && (
            <button className="btn" onClick={guard(() => on.install(card.kinds))}>
              {WORDS.tryAgain}
            </button>
          )}
          <button className="btn2" onClick={() => on.copy(card.kinds)}>
            {WORDS.copyOpen}
          </button>
        </div>
        {pasteOf(card.kinds) && (
          <div className="code">
            <span>{pasteOf(card.kinds)}</span>
          </div>
        )}
        <CopyNote copy={copy} />
      </>
    )
  }
  return (
    <section className="ask" aria-label="Connect your AI" key={`connect:${card.kind}`}>
      <p className="step">{WORDS.connectStep}</p>
      <h1 className="h1 big3">{WORDS.connectTitle}</h1>
      {body}
    </section>
  )
}

export function Question({ view, commands, copy, email, keyRef, emailRef, saving, problem, note, on }: QuestionProps) {
  const guard = useInstallGuard()
  if (view.card === 'connect' && view.connect) return <Connect card={view.connect} commands={commands} copy={copy} guard={guard} on={on} note={note} />
  if (view.card === 'key') {
    return (
      <section className="ask" aria-label="Your price key" key="key">
        <p className="step">{view.keyStep}</p>
        <h1 className="h1 big3">{WORDS.keyTitle}</h1>
        <p className="lead">{WORDS.keyLead}</p>
        <KeyCard service="massive" i={0} checkOnPaste getKey={{ onOpen: on.toMassive }} placeholder="Then paste it here" inputRef={keyRef} onWorks={on.keyWorks} />
      </section>
    )
  }
  const { finish, start } = view
  return (
    <section className="ask" aria-label="Your email, then Start" key="finish">
      <p className="step">{WORDS.finishStep}</p>
      <h1 className="h1 big3">{finish.title}</h1>
      {finish.emailFixed ? (
        <div className="erow">
          <span className="grow">
            SEC will see <b>{email.value}</b>
            {email.state === 'suggested' ? ', from your Claude sign-in,' : ''} with each filing download. No one else gets it.
          </span>
          <button className="link" onClick={on.changeEmail}>
            {WORDS.change}
          </button>
        </div>
      ) : (
        <>
          <p className="lead">{WORDS.emailLead}</p>
          <input
            ref={emailRef}
            className="ein"
            type="email"
            placeholder="you@example.com"
            aria-label={WORDS.emailLabel}
            autoComplete="off"
            spellCheck={false}
            value={email.value}
            onChange={(e) => on.typeEmail(e.target.value)}
            onKeyDown={(e) => {
              // Return in the email field presses Start.
              if (e.key === 'Enter') {
                e.preventDefault()
                if (start.enabled && !saving) on.start()
              }
            }}
          />
          {email.problem && (
            <p className="st bad" role="alert">
              {email.problem}
            </p>
          )}
        </>
      )}
      <p className="fine data">{finish.data}</p>
      <div className="go">
        <button className={start.enabled ? 'btn big ready' : 'btn big'} disabled={!start.enabled || saving} onClick={on.start}>
          {WORDS.start}
        </button>
        <span className="why">{saving ? 'Saving…' : start.reason}</span>
      </div>
      {problem && (
        <p className="st bad" role="alert">
          {problem}
        </p>
      )}
    </section>
  )
}
