// The 52 px toolbar. It drags the window from any empty part (-webkit-app-region: drag); its
// buttons and fields are no-drag. It holds the page title with a one-line subtitle (or, on the
// report page, the report's top bar in its place), the page's own buttons on the right, and the
// find field (⌘F).

import { useEffect, useRef, useState, type ReactNode } from 'react'

import { ICONS } from './Sidebar'

export interface ToolbarProps {
  title?: string
  // A line of text, or the report page's menu of the company's other reports.
  subtitle?: ReactNode
  // In place of the title: the report page's top bar (report/ReportBar.tsx), which fills the room.
  lead?: ReactNode
  // No hairline under it: the home page's toolbar is empty apart from the window buttons.
  bare?: boolean
  // The find field is open; `findFocus` changes each time ⌘F is pressed, to put the cursor back.
  finding: boolean
  findFocus: number
  onFindClose: () => void
  children?: ReactNode
}

export function Toolbar({ title, subtitle, lead, bare, finding, findFocus, onFindClose, children }: ToolbarProps) {
  return (
    <header className={bare ? 'top bare' : 'top'}>
      {lead ?? (title ? (
        <h1 className="ttl">
          {title}
          {subtitle && <small>{subtitle}</small>}
        </h1>
      ) : (
        <span className="ttl" />
      ))}
      {children}
      {finding && <FindField focus={findFocus} onClose={onFindClose} />}
    </header>
  )
}

// Find in the page (⌘F). Typing finds the text; Return finds the next match and Shift-Return the
// previous one; Esc closes the field and clears the highlights.
//
// Chromium's find shapes this field in three ways.
//   - Finding a match takes the focus: it clears it in the window, or moves it into the report
//     frame when the match is there. The field takes the cursor back as each find ends, unless
//     something was clicked since it began, so a click into the report keeps its focus.
//   - Next and previous start from the frame that has the focus, and from its selection. With
//     the cursor left in the field, every Return would land on the match just after the field.
//     So for Return the field hands the focus to where the last match was (the report frame), or
//     clears its own caret, while the page moves on; then it takes the cursor back.
//   - The field's own text counts as one match.
function FindField({ focus, onClose }: { focus: number; onClose: () => void }) {
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const started = useRef(0)
  const clicked = useRef(0)
  const busy = useRef(0)
  const stepping = useRef(false)
  // The report frame, while the last match found is inside it.
  const matchFrame = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [focus])

  useEffect(() => {
    const down = () => {
      clicked.current = Date.now()
    }
    window.addEventListener('pointerdown', down, true)
    return () => window.removeEventListener('pointerdown', down, true)
  }, [])

  const takeBack = (since: number) => {
    const now = document.activeElement
    const inFrame = now instanceof HTMLIFrameElement
    if (!(now === null || now === document.body || inFrame) || clicked.current >= since) return
    matchFrame.current = inFrame ? now : null
    input.current?.focus()
  }

  const find = async (value: string, forward: boolean, step: boolean) => {
    const since = Date.now()
    started.current = since
    busy.current += 1
    if (step) {
      stepping.current = true
      const frame = matchFrame.current
      if (frame?.isConnected) frame.focus()
      else {
        // Leaving the field keeps its caret as the page's selection, so clear that too.
        input.current?.blur()
        window.getSelection()?.removeAllRanges()
      }
    } else matchFrame.current = null
    try {
      await window.tearsheet.find(value, forward)
    } finally {
      busy.current -= 1
      if (step) stepping.current = false
    }
    takeBack(since)
  }

  const close = () => {
    void window.tearsheet.stopFind()
    onClose()
  }

  return (
    <div className="find4" role="search">
      {ICONS.search}
      <input
        ref={input}
        type="text"
        placeholder="Find"
        aria-label="Find in the page"
        spellCheck={false}
        value={text}
        onBlur={() => {
          // While the page finds as you type, take the cursor straight back so no letter is lost.
          if (busy.current === 0 || stepping.current) return
          const since = started.current
          window.setTimeout(() => takeBack(since), 0)
        }}
        onChange={(e) => {
          const next = e.target.value
          setText(next)
          if (next) void find(next, true, false)
          else void window.tearsheet.stopFind()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (text) void find(text, !e.shiftKey, true)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            close()
          }
        }}
      />
      <button className="x4" aria-label="Close find" onClick={close}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 7l10 10M17 7L7 17" />
        </svg>
      </button>
    </div>
  )
}
