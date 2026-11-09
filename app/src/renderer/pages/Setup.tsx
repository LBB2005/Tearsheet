// The first-time setup, version 6 of the design canvas (first-run design §4): one screen, with a
// short list of three rows on top (Your AI, Price key, SEC email) and under it one question at a
// time: connect the AI, then the price key, then the email and Start. It fills in what it can
// find by itself and asks only for what it can't.
//
// The page only connects events to three pure state machines (setup/state/: the tool, the email
// and the safety check, which App keeps) and renders what screenView (setup/view.ts) decides. The
// AI tools come from the main process (getTools, then tools_changed); the Install button's
// progress comes as install_progress. The window only ever names the tools to set up: the main
// process builds and runs every command. Keys go straight to the engine's check and are never
// shown again.
//
// The first click on any button or field is the go-ahead for the safety check (Goal 5): it starts
// then if the writing tool is ready, or by itself the moment it becomes ready, and never when the
// window opens. Start saves the tool and the email, then setup_done last.

import '../setup/setup.css'

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'

import type { CallResult, ToolStatus } from '../../preload/api'
import type { InstallProgress, RunResult } from '../../shared/install'
import type { SettingsResult } from '../../shared/protocol'
import type { ToolCommands, ToolKind } from '../../shared/tools'
import { CodeLine } from '../setup/parts'
import { Keys, List } from '../setup/List'
import { CopyNote, Question, type CopyState } from '../setup/Question'
import { SafetyChip, SafetyPopover } from '../setup/SafetyChip'
import { emailReducer, emailStart } from '../setup/state/email'
import { safetyPassedFor, type SafetyState } from '../setup/state/safety'
import { phaseOf, toolReducer, toolStart, writerOf } from '../setup/state/tool'
import { screenView, type KeyState } from '../setup/view'
import { TOOL_TEXT, WORDS } from '../setup/words'
import { useWaiting } from '../shell/waiting'

// "Can't tell" shows what was found, with Try again and Show log, after this long (CUJ 5).
const CANT_TELL_MS = 120_000

// The news setting is on when the engine lists the news sites it reads (server.py NEWS_READ).
const newsOn = (s: SettingsResult | null) => Boolean(s?.services?.some((x) => x.name === 'News sites on the allowlist'))

export interface SetupProps {
  // The settings App opened with (it read them to choose setup); null if they couldn't be read.
  settings: SettingsResult | null
  // The app is leaving setup for the home page: everything fades and lifts away.
  leaving: boolean
  // This session's safety check, kept by App from the engine's notes.
  safety: SafetyState | null
  onSafetyStarted: (tool: ToolKind) => void
  // The chip's Stop the check (App's cancel_safety_check).
  onStopSafety?: () => void
  // "The button is on" (App's getInstallButton): the Install buttons, or the paste command.
  buttonOn: boolean
  // Setup is finished (setup_done is saved): go to the home page.
  onFinish: () => void
  // A notice to show under the toolbar, like the engine failing to start.
  children?: ReactNode
}

const key = (kinds: ToolKind[]) => kinds.join('+')

export function Setup({ settings, leaving, safety, onSafetyStarted, onStopSafety, buttonOn, onFinish, children }: SetupProps) {
  const [tool, toTool] = useReducer(toolReducer, settings?.primary_tool === 'codex' || settings?.primary_tool === 'claude' ? settings.primary_tool : null, toolStart)
  const [email, toEmail] = useReducer(emailReducer, settings?.sec_contact_email ?? null, (saved) => emailReducer(emailStart(), { type: 'saved', email: saved }))
  const [keyState, setKeyState] = useState<KeyState>(settings?.keys?.massive === 'set' ? 'saved' : 'missing')
  const [goAhead, setGoAhead] = useState(false)
  const [startedFor, setStartedFor] = useState<ToolKind | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const [popOpen, setPopOpen] = useState(false)
  const [waitedLong, setWaitedLong] = useState(false)
  const [commands, setCommands] = useState<Record<string, ToolCommands>>({})
  const [copy, setCopy] = useState<CopyState | null>(null)
  const [commandShown, setCommandShown] = useState(false)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [away, setAway] = useState(false)
  const keyRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const finish = useRef(onFinish)
  finish.current = onFinish

  // The tools: one read as the screen opens, then each change the main process sees, and the
  // Install button's progress.
  useEffect(() => {
    let live = true
    void window.tearsheet.getTools(false).then(
      (tools) => live && toTool({ type: 'tools', tools }),
      () => undefined
    )
    const off = window.tearsheet.onNotification((note) => {
      if (note.method === 'tools_changed' && Array.isArray(note.params.tools)) toTool({ type: 'tools', tools: note.params.tools as ToolStatus[] })
      else if (note.method === 'install_progress') toTool({ type: 'progress', progress: note.params as unknown as InstallProgress })
    })
    return () => {
      live = false
      off()
    }
  }, [])

  // Claude Code's email fills in the SEC email, unless one is saved or typed (the reducer decides).
  const claudeEmail = tool.tools?.find((t) => t.kind === 'claude' && t.state === 'ready')?.email ?? null
  useEffect(() => {
    if (claudeEmail) toEmail({ type: 'suggest', email: claudeEmail })
  }, [claudeEmail])

  const writer = writerOf(tool)
  const phase = phaseOf(tool)
  const writerStatus = tool.tools?.find((t) => t.kind === writer)
  const alreadyPassed = safetyPassedFor(writerStatus, settings?.lockdown?.[writer])

  // "Can't tell" for 2 minutes.
  useEffect(() => {
    setWaitedLong(false)
    if (phase !== 'cant_tell') return
    const timer = window.setTimeout(() => setWaitedLong(true), CANT_TELL_MS)
    return () => window.clearTimeout(timer)
  }, [phase, writer])

  // The exact commands for the connect card, from the main process; it only reads.
  const wanted = useMemo<ToolKind[][]>(() => {
    if (phase === 'missing') return [['claude'], ['codex'], ['claude', 'codex']]
    if (phase === 'ready' || phase === 'cant_tell') return tool.copied ? [tool.copied] : []
    return [tool.picked ?? [writer]]
  }, [phase, tool.picked, tool.copied, writer])
  const toolsKey = JSON.stringify(tool.tools?.map((t) => [t.kind, t.state, t.path]) ?? null)
  useEffect(() => {
    let live = true
    for (const kinds of wanted) {
      void window.tearsheet.commandsFor(kinds).then(
        (c) => live && setCommands((all) => ({ ...all, [key(kinds)]: c })),
        () => undefined
      )
    }
    return () => {
      live = false
    }
  }, [wanted, toolsKey])
  const commandsOf = useCallback((kinds: ToolKind[]) => commands[key(kinds)] ?? null, [commands])
  const blocked: Partial<Record<ToolKind, string>> = {}
  const mine = commandsOf([writer])?.blocked.find((b) => b.tool === writer)
  if (mine) blocked[writer] = mine.reason

  const view = screenView(
    { machine: tool, waitedLong, blocked },
    keyState,
    email,
    { state: safety, alreadyPassed, startError, started: startedFor === writer },
    { backFromMassive: away, elsewhere: false },
    buttonOn,
    newsOn(settings)
  )

  // While the tool isn't ready, the main process reads it every 5 seconds with the window in front.
  useWaiting(phase !== 'ready')

  // The safety check: after the go-ahead, once the writing tool is ready, unless a full check
  // already passed for its version or this session already ran one for it.
  const checkedNow = safety !== null && safety.tool === writer
  const startCheck = useCallback(
    (kind: ToolKind) => {
      setStartedFor(kind)
      setStartError(null)
      void window.tearsheet.runSafetyCheck(kind).then(
        (reply) => {
          if (reply.ok || reply.error?.code === 'SAFETY_CHECK_RUNNING') onSafetyStarted(kind)
          else setStartError(reply.error?.message || 'The safety check didn’t start.')
        },
        () => setStartError('The safety check didn’t start.')
      )
    },
    [onSafetyStarted]
  )
  useEffect(() => {
    if (!goAhead || phase !== 'ready' || alreadyPassed || checkedNow || startedFor === writer) return
    startCheck(writer)
  }, [goAhead, phase, alreadyPassed, checkedNow, startedFor, writer, startCheck])

  // Focus: once the key works, the email field when it is empty or being changed.
  const lastFocus = useRef<string | null>(null)
  useEffect(() => {
    if (view.focus === 'email' && lastFocus.current !== 'email') emailRef.current?.focus()
    lastFocus.current = view.focus
  }, [view.focus])
  // Back from massive.com: the key field, if the key is still missing and nothing else was focused.
  const viewNow = useRef(view)
  viewNow.current = view
  useEffect(() => {
    if (!away) return
    const back = () => {
      setAway(false)
      const active = document.activeElement
      const elsewhere = active !== null && active !== document.body && active.tagName !== 'BUTTON'
      if (viewNow.current.card === 'key' && !elsewhere) keyRef.current?.focus()
    }
    window.addEventListener('focus', back)
    return () => window.removeEventListener('focus', back)
  }, [away])

  // ---------- the handlers ----------

  const install = (kinds: ToolKind[]) => {
    setCopy(null)
    setCommandShown(false)
    toTool({ type: 'pick', kinds })
    void window.tearsheet.install(kinds).then(
      (result) => toTool({ type: 'result', result }),
      () => toTool({ type: 'result', result: { outcome: 'failed' } as RunResult })
    )
  }

  // The paste command: copies it and opens a new Terminal window. During a sign-in, the in-app
  // sign-in stops first, so two sign-ins of one tool never run at once.
  const copyCommand = async (kinds: ToolKind[]) => {
    if (tool.running) await window.tearsheet.cancelInstall().catch(() => false)
    const result = await window.tearsheet.copyAndOpenTerminal(kinds).catch(() => ({ copied: false, opened: false }))
    let command: string | null = null
    if (!result.copied) command = (await window.tearsheet.commandsFor(kinds).catch(() => null))?.paste ?? null
    setCopy({ kinds, result, command })
    if (result.copied) toTool({ type: 'copied', kinds })
  }

  const showLog = () =>
    void window.tearsheet.showSetupLog().then(
      (shown) => setNote(shown ? null : 'There’s no setup log yet.'),
      () => setNote('The log didn’t open.')
    )

  const changeEmail = () => {
    toEmail({ type: 'change' })
    window.setTimeout(() => emailRef.current?.focus(), 0)
  }

  const start = async () => {
    if (saving || !view.start.enabled) return
    setSaving(true)
    setProblem(null)
    const save = (k: string, v: string): Promise<CallResult<unknown>> => window.tearsheet.setSetting(k, v).catch(() => ({ ok: false }))
    const tried = await save('primary_tool', writer)
    if (!tried.ok) {
      setSaving(false)
      return setProblem(tried.error?.message || WORDS.saveFailed)
    }
    const mail = await save('sec_contact_email', email.value.trim())
    if (!mail.ok) {
      setSaving(false)
      return toEmail({ type: 'refused', problem: mail.error?.message || WORDS.saveFailed })
    }
    // setup_done last: a failure partway leaves setup open with what was saved.
    const done = await save('setup_done', '1')
    if (!done.ok) {
      setSaving(false)
      return setProblem(done.error?.message || WORDS.saveFailed)
    }
    finish.current()
  }

  // ---------- what shows ----------

  const pasteFor = tool.copied ?? tool.picked ?? [writer]
  const pasteCommand = commandsOf(pasteFor)?.paste ?? copy?.command ?? null
  let aiBelow: ReactNode = null
  if (commandShown && view.rows.ai.actions.includes('show_command')) {
    aiBelow = (
      <div className="again">
        {pasteCommand && <CodeLine text={pasteCommand} />}
        <span className="fine">
          {WORDS.pasteFine} <Keys />, {WORDS.pasteFineAfter}
        </span>
        <button className="btn2" onClick={() => void copyCommand(pasteFor)}>
          {WORDS.copyAgain}
        </button>
        <CopyNote copy={copy} />
      </div>
    )
  } else if (view.rows.ai.actions.includes('paste')) {
    aiBelow = (
      <div className="again">
        <span className="fine">{WORDS.stuck}</span>
        {pasteCommand && <CodeLine text={pasteCommand} />}
        <button className="btn2" onClick={() => void copyCommand(pasteFor)}>
          {WORDS.copyOpen}
        </button>
        <CopyNote copy={copy} />
      </div>
    )
  }

  return (
    <div
      className={leaving ? 'setup leaving' : 'setup'}
      onClickCapture={(e) => {
        // The first click on any button or field is the go-ahead for the safety check.
        if (!goAhead && e.target instanceof Element && e.target.closest('button, input')) setGoAhead(true)
      }}
    >
      <header className="top bare stp">
        <span className="ttl">Tearsheet</span>
        {view.chip && <SafetyChip view={view.chip} open={popOpen} onToggle={() => setPopOpen((o) => !o)} />}
      </header>
      {children}
      <main className="screen setup-in">
        <div className="col6">
          <List
            ai={view.rows.ai}
            keyRow={view.rows.key}
            email={view.rows.email}
            commandShown={commandShown}
            aiBelow={aiBelow}
            onAi={(action) => {
              if (action === 'show_command') setCommandShown((s) => !s)
              else if (action === 'stop_sign_in') void window.tearsheet.cancelInstall()
              else if (action === 'open_sign_in') void window.tearsheet.openSignInPage()
            }}
            onOtherKey={() => {
              setKeyState('missing')
              window.setTimeout(() => keyRef.current?.focus(), 0)
            }}
            onChangeEmail={changeEmail}
          />
          <Question
            view={view}
            commands={commandsOf}
            copy={copy}
            email={email}
            keyRef={keyRef}
            emailRef={emailRef}
            saving={saving}
            problem={problem}
            note={note}
            on={{
              install,
              copy: (kinds) => void copyCommand(kinds),
              recheck: () =>
                void window.tearsheet.getTools(true).then(
                  (tools) => toTool({ type: 'tools', tools }),
                  () => undefined
                ),
              showLog,
              use: (kind) => toTool({ type: 'use', kind }),
              keyWorks: () => setKeyState('works'),
              toMassive: () => setAway(true),
              typeEmail: (value) => toEmail({ type: 'type', value }),
              changeEmail,
              start: () => void start()
            }}
          />
        </div>
      </main>
      {popOpen && view.chip && (
        <SafetyPopover
          view={view.chip}
          tool={TOOL_TEXT[writer]}
          onRetry={() => {
            setPopOpen(false)
            startCheck(writer)
          }}
          onStop={onStopSafety}
          onClose={() => setPopOpen(false)}
        />
      )}
    </div>
  )
}
