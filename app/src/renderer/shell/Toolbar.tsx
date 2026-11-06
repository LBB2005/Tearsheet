// The 52 px toolbar. It drags the window from any empty part (-webkit-app-region: drag); its
// buttons and fields are no-drag. It holds the page title with a one-line subtitle, the page's own
// buttons on the right, and the find field (⌘F).

import { useEffect, useRef, useState, type ReactNode } from 'react'

import { ICONS } from './Sidebar'

export interface ToolbarProps {
  title?: string
  subtitle?: string
  // No hairline under it: the home page's toolbar is empty apart from the window buttons.
  bare?: boolean
  // The find field is open; `findFocus` changes each time ⌘F is pressed, to put the cursor back.
  finding: boolean
  findFocus: number
  onFindClose: () => void
  children?: ReactNode
}

export function Toolbar({ title, subtitle, bare, finding, findFocus, onFindClose, children }: ToolbarProps) {
  return (
    <header className={bare ? 'top bare' : 'top'}>
      {title ? (
        <h1 className="ttl">
          {title}
          {subtitle && <small>{subtitle}</small>}
        </h1>
      ) : (
        <span className="ttl" />
      )}
      {children}
      {finding && <FindField focus={findFocus} onClose={onFindClose} />}
    </header>
  )
}

// How long after a find the field takes the cursor back. Chromium selects the match it finds,
// which moves the focus out of the field, so the next letter typed would go to the page instead.
const REFOCUS_MS = 600

// Find in the page (⌘F). Typing finds the text; Return finds the next match and Shift-Return the
// previous one; Esc closes the field and clears the highlights.
function FindField({ focus, onClose }: { focus: number; onClose: () => void }) {
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const lastFind = useRef(0)

  const find = (value: string, forward: boolean) => {
    lastFind.current = Date.now()
    void window.tearsheet.find(value, forward)
  }

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [focus])

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
        onBlur={(e) => {
          // A click on something else keeps its focus; only a find's own selection is undone.
          if (e.relatedTarget === null && Date.now() - lastFind.current < REFOCUS_MS) window.setTimeout(() => input.current?.focus(), 0)
        }}
        onChange={(e) => {
          const next = e.target.value
          setText(next)
          if (next) find(next, true)
          else void window.tearsheet.stopFind()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (text) find(text, !e.shiftKey)
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
