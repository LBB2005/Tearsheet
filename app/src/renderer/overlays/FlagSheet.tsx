// The flag sheet: it drops from the toolbar when a Flag link in the report is clicked
// (tearsheet://flag/…, main/navigation.ts). It shows the claim, takes a note on what looks wrong,
// and saves it with flag_claim, for the next spot-check. Esc or Cancel closes it; ⌘Return saves.

import { useEffect, useRef, useState } from 'react'

import { leaveMs } from '../motion'

export interface FlagSheetProps {
  // The claim's sentence, as plain text, when the report has it.
  claim: string | null
  // Answers with what went wrong, or null once the flag is saved.
  onSave: (note: string) => Promise<string | null>
  onClose: () => void
}

export function FlagSheet({ claim, onSave, onClose }: FlagSheetProps) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)

  useEffect(() => field.current?.focus(), [])

  const close = () => {
    if (leaving) return
    setLeaving(true)
    window.setTimeout(onClose, leaveMs())
  }
  const save = async () => {
    if (saving || leaving) return
    setSaving(true)
    setProblem(null)
    // A flag that wasn't saved keeps the sheet open, with the note, so it can be tried again.
    const why = await onSave(note)
    setSaving(false)
    if (why) setProblem(why)
    else close()
  }

  return (
    <>
      <div className={leaving ? 'scrim leave' : 'scrim'} onMouseDown={close} />
      <div
        className={leaving ? 'sheet leave' : 'sheet'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="flag-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            close()
          } else if (e.key === 'Enter' && e.metaKey) {
            e.preventDefault()
            void save()
          }
        }}
      >
        <b id="flag-title">Flag this claim</b>
        {claim && <q>{claim}</q>}
        <textarea ref={field} rows={4} placeholder="What looks wrong?" aria-label="What looks wrong?" value={note} onChange={(e) => setNote(e.target.value)} />
        {problem && (
          <p className="why" role="alert">
            The flag wasn’t saved. {problem}
          </p>
        )}
        <div className="row">
          <button className="plain" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save flag'}
          </button>
        </div>
      </div>
    </>
  )
}
