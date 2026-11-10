// A button for something that can't be taken back (the line's Cancel all and Clear, the toolbar's
// Cancel run). The first press asks in place, beside where it was pressed: the question, the
// button again in its own words, and a way back. Esc or the way back closes the question. What the
// button does is unchanged; it only waits for the second press. Its look is the destructive
// button (home.css .btn2.danger).

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

export interface ConfirmButtonProps {
  // The button's words, and the question with its two answers once it is pressed.
  label: string
  question: string
  yes: string
  no: string
  disabled?: boolean
  onConfirm: () => void
}

export function ConfirmButton({ label, question, yes, no, disabled, onConfirm }: ConfirmButtonProps) {
  const [asking, setAsking] = useState(false)
  const first = useRef<HTMLButtonElement>(null)
  const yesButton = useRef<HTMLButtonElement>(null)
  const wasAsking = useRef(false)

  // The keyboard goes to the question's answer, and back to the button when the question closes.
  useEffect(() => {
    if (asking) yesButton.current?.focus()
    else if (wasAsking.current) first.current?.focus()
    wasAsking.current = asking
  }, [asking])

  if (!asking) {
    return (
      <button ref={first} className="btn2 danger" disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </button>
    )
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    setAsking(false)
  }
  return (
    <span className="confirm" role="group" aria-label={question} onKeyDown={onKey}>
      <span>{question}</span>
      <button
        ref={yesButton}
        className="btn2 danger"
        disabled={disabled}
        onClick={() => {
          setAsking(false)
          onConfirm()
        }}
      >
        {yes}
      </button>
      <button className="btn2" onClick={() => setAsking(false)}>
        {no}
      </button>
    </span>
  )
}
