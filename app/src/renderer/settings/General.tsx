// Settings' general settings: the typed ones (each with Change, then Save or Cancel) and the
// choice of the main AI tool.

import { useState, type KeyboardEvent } from 'react'

import type { SettingsResult } from '../../shared/protocol'
import { at } from '../setup/parts'
import { TOOL_TEXT, type ToolKind } from '../setup/steps'
import { fieldProblem, maskEmail, storage, tildePath, type FieldKey } from './settings'

export function GeneralPanel({ i, s, primary, onSaved }: { i: number; s: SettingsResult; primary: ToolKind; onSaved: () => Promise<void> }) {
  const email = s.sec_contact_email
  return (
    <section className="p glass mv" style={at(i)}>
      <h4>
        <span>General</span>
      </h4>
      <FieldRow k="sec_contact_email" label="SEC contact email" shown={email ? maskEmail(email) : null} initial={email ?? ''} onSaved={onSaved} />
      <ToolChoice primary={primary} onSaved={onSaved} />
      <FieldRow k="backup_dir" label="Backup folder" shown={tildePath(s.backup_dir)} initial={tildePath(s.backup_dir)} onSaved={onSaved} />
      {s.backup_in_icloud && <p className="fine hold">The backup folder is synced by iCloud, so backup copies also go to Apple’s servers.</p>}
      <FieldRow k="raw_cap" label="Raw-download cap" shown={storage(0, s.raw_cap).cap} initial={String(s.raw_cap)} onSaved={onSaved} />
      <FieldRow k="goal1_round" label="Goal 1 round" shown={String(s.goal1_round)} initial={String(s.goal1_round)} onSaved={onSaved} />
    </section>
  )
}

// One typed setting: its value, and Change, which turns it into a field with Save and Cancel.
function FieldRow({ k, label, shown, initial, onSaved }: { k: FieldKey; label: string; shown: string | null; initial: string; onSaved: () => Promise<void> }) {
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
      <div className="field">
        <span id={`set-${k}`}>{label}</span>
        {editing ? (
          <input type="text" className="in" aria-labelledby={`set-${k}`} autoFocus spellCheck={false} value={value} disabled={saving} onChange={(e) => setValue(e.target.value)} onKeyDown={onKey} />
        ) : (
          <span className="in">{shown ?? <em>not set</em>}</span>
        )}
        {editing ? (
          <span className="acts">
            <button className="act" disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="act quiet" disabled={saving} onClick={cancel}>
              Cancel
            </button>
          </span>
        ) : (
          <button className="act" onClick={start}>
            Change
          </button>
        )}
      </div>
      {problem && (
        <p className="fine bad" role="alert">
          {problem}
        </p>
      )}
    </>
  )
}

// The main AI tool, which writes the reports: a choice of the two.
function ToolChoice({ primary, onSaved }: { primary: ToolKind; onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const choose = async (kind: ToolKind) => {
    if (saving || kind === primary) return
    setSaving(true)
    setProblem(null)
    const reply = await window.tearsheet.setSetting('primary_tool', kind).catch(() => null)
    setSaving(false)
    if (!reply?.ok) return setProblem(reply?.error?.message || 'It wasn’t saved. Try again.')
    void onSaved()
  }
  return (
    <>
      <div className="field">
        <span id="set-primary">Main AI tool</span>
        <div className="segc" role="group" aria-labelledby="set-primary">
          {(['claude', 'codex'] as const).map((kind) => (
            <button key={kind} className={primary === kind ? 'on' : undefined} aria-pressed={primary === kind} disabled={saving} onClick={() => void choose(kind)}>
              {TOOL_TEXT[kind].name}
            </button>
          ))}
        </div>
      </div>
      {problem && (
        <p className="fine bad" role="alert">
          {problem}
        </p>
      )}
    </>
  )
}
