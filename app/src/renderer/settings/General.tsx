// Settings' rows (pages/Settings.tsx): a row's label with its one line of help, the Mac pop-up
// menu, a typed setting (its value, and Change, which turns it into a field with Save or
// Cancel), and the choice of the main AI tool.

import { useState, type KeyboardEvent, type ReactNode } from 'react'

import type { ToolKind } from '../../shared/tools'
import { TOOL_TEXT } from '../setup/words'
import { fieldProblem, type FieldKey } from './settings'

// A row's name, and one line under it on what it does. A hold tone turns the line amber.
export function Label({ id, title, help, tone }: { id?: string; title: string; help?: ReactNode; tone?: 'hold' }) {
  return (
    <div className="slab">
      <b id={id}>{title}</b>
      {help && <span className={tone ? `help ${tone}` : 'help'}>{help}</span>}
    </div>
  )
}

// A Mac pop-up button: the native select, so the menu that opens is the Mac's own, with the ⌃⌄
// chevrons drawn over its right end.
export function PopUp({ labelledBy, value, options, disabled, onChange }: { labelledBy: string; value: string; options: [string, string][]; disabled?: boolean; onChange: (value: string) => void }) {
  return (
    <span className="popw">
      <select className="pop" aria-labelledby={labelledBy} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
      </svg>
    </span>
  )
}

// One typed setting: its value, and Change, which turns it into a field with Save and Cancel.
export function FieldRow({ k, label, help, helpTone, shown, initial, onSaved }: { k: FieldKey; label: string; help?: ReactNode; helpTone?: 'hold'; shown: string | null; initial: string; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const start = () => {
    setValue(initial)
    setProblem(null)
    setEditing(true)
  }
  const cancel = () => {
    setEditing(false)
    setProblem(null)
  }
  const save = async () => {
    if (saving) return
    const wrong = fieldProblem(k, value)
    if (wrong) return setProblem(wrong)
    setSaving(true)
    const reply = await window.tearsheet.setSetting(k, value.trim()).catch(() => null)
    setSaving(false)
    if (!reply?.ok) return setProblem(reply?.error?.message || 'It wasn’t saved. Try again.')
    setEditing(false)
    setProblem(null)
    void onSaved()
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void save()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }
  return (
    <>
      <div className="sline">
        <Label id={`set-${k}`} title={label} help={help} tone={helpTone} />
        {editing ? (
          <input type="text" className="sin" aria-labelledby={`set-${k}`} autoFocus spellCheck={false} value={value} disabled={saving} onChange={(e) => setValue(e.target.value)} onKeyDown={onKey} />
        ) : (
          <span className="sval">{shown ?? <em>not set</em>}</span>
        )}
        {editing ? (
          <span className="acts">
            <button className="pb go" disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="pb" disabled={saving} onClick={cancel}>
              Cancel
            </button>
          </span>
        ) : (
          <button className="pb" aria-label={`Change ${label}`} onClick={start}>
            Change
          </button>
        )}
      </div>
      {problem && (
        <p className="fine bad sfine" role="alert">
          {problem}
        </p>
      )}
    </>
  )
}

// The main AI tool, which writes the reports, as a pop-up menu of the two. While the choice is
// saved, the menu keeps showing it.
export function ToolChoice({ primary, onSaved }: { primary: ToolKind; onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState<ToolKind | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const choose = async (kind: ToolKind) => {
    if (saving || kind === primary) return
    setSaving(kind)
    setProblem(null)
    const reply = await window.tearsheet.setSetting('primary_tool', kind).catch(() => null)
    if (!reply?.ok) {
      setSaving(null)
      return setProblem(reply?.error?.message || 'It wasn’t saved. Try again.')
    }
    await onSaved()
    setSaving(null)
  }
  return (
    <>
      <div className="sline">
        <Label id="set-primary" title="Main AI tool" help="Writes your reports. The other one checks each draft." />
        <PopUp
          labelledBy="set-primary"
          value={saving ?? primary}
          disabled={saving !== null}
          options={(['claude', 'codex'] as const).map((kind) => [kind, TOOL_TEXT[kind].name])}
          onChange={(v) => void choose(v === 'codex' ? 'codex' : 'claude')}
        />
      </div>
      {problem && (
        <p className="fine bad sfine" role="alert">
          {problem}
        </p>
      )}
    </>
  )
}
