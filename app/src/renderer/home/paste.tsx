// The paste command: the way to install, update or sign in an AI tool until the Install button
// comes (first-run design §3). The main process builds the command from the tool's status, copies
// it, checks the copy and opens a new Terminal window; the person pastes it there. The window only
// names the tool. Home's and the run view's "Sign in again" and the rows on Settings → AI tools
// use it. While its steps show, the window waits on the person (shell/waiting.ts), so the change
// shows up by itself within a few seconds (tools_changed).

import { useCallback, useEffect, useRef, useState } from 'react'

import type { TerminalResult } from '../../shared/tools'
import { CodeLine, Spinner } from '../setup/parts'
import { TOOL_TEXT, type ToolKind } from '../setup/steps'
import { useWaiting } from '../shell/waiting'

export type PasteFor = 'signIn' | 'install' | 'update'

export interface Pasted {
  result: TerminalResult
  // The command to copy by hand, when the copy didn't work.
  command: string | null
  // Why there is nothing to run (main/toolSteps.ts), when that is why nothing was copied.
  blocked: string | null
}

// 'asking' while the main process copies; null until asked.
export type PasteState = Pasted | 'asking' | null

const NOTHING: TerminalResult = { copied: false, opened: false }

export function usePaste(kind: ToolKind): { state: PasteState; start: () => Promise<void>; reset: () => void } {
  const [state, setState] = useState<PasteState>(null)
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])
  const asking = useRef(false)
  const start = async () => {
    if (asking.current) return
    asking.current = true
    setState('asking')
    const result = await window.tearsheet.copyAndOpenTerminal([kind]).catch(() => NOTHING)
    let command: string | null = null
    let blocked: string | null = null
    if (!result.copied) {
      const commands = await window.tearsheet.commandsFor([kind]).catch(() => null)
      command = commands?.paste ?? null
      blocked = commands?.blocked.find((b) => b.tool === kind)?.reason ?? null
    }
    asking.current = false
    if (live.current) setState({ result, command, blocked })
  }
  useWaiting(state !== null)
  const reset = useCallback(() => setState(null), [])
  return { state, start, reset }
}

export interface PasteStepsProps {
  state: Pasted | 'asking'
  kind: ToolKind
  purpose: PasteFor
  onAgain: () => void
  // The button's class: the home page's btn2, or Settings' pill (pb).
  buttonClass?: string
}

// What to do once the command is copied, or why it wasn't, with Copy and open Terminal again.
export function PasteSteps({ state, kind, purpose, onAgain, buttonClass = 'btn2' }: PasteStepsProps) {
  const name = TOOL_TEXT[kind].name
  if (state === 'asking') {
    return (
      <div className="signin">
        <span className="st">
          <Spinner />
          Copying the command…
        </span>
      </div>
    )
  }
  const { result, command, blocked } = state
  const after =
    purpose === 'signIn' ? 'Your browser opens so you can sign in.' : purpose === 'install' ? `It installs ${name}, then your browser opens so you can sign in.` : `It updates ${name}, then signs it in if it needs to.`
  let say: string
  if (result.copied && result.opened) say = `The command is copied, and a new Terminal window is open. Paste it there (⌘V) and press Return. ${after}`
  else if (result.copied) say = `The command is copied, but Terminal didn’t open. Open Terminal, paste it (⌘V) and press Return. ${after}`
  else if (blocked) say = blocked
  else if (command) say = `The copy didn’t work. Paste this in Terminal and press Return. ${after}`
  else say = `There’s nothing for Tearsheet to run for ${name} just now.`
  const waits = result.copied || (!blocked && command !== null)
  return (
    <div className="signin">
      <span>{say}</span>
      {!result.copied && command && <CodeLine text={command} />}
      {waits && (
        <div className="row">
          <button className={buttonClass} onClick={onAgain}>
            Copy and open Terminal again
          </button>
          <span className="st">
            <Spinner />
            {purpose === 'signIn' ? 'Waiting for you to sign in' : 'Waiting for it to finish'}
          </span>
        </div>
      )}
    </div>
  )
}

// "Sign in again", then its steps in its place: the run view's red box, for a run a sign-out
// stopped.
export function SignInAgain({ kind }: { kind: ToolKind }) {
  const paste = usePaste(kind)
  if (paste.state) return <PasteSteps state={paste.state} kind={kind} purpose="signIn" onAgain={() => void paste.start()} />
  return (
    <div className="row">
      <button className="btn2" onClick={() => void paste.start()}>
        Sign in again
      </button>
    </div>
  )
}
