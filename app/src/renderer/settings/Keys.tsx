// Settings' data keys: Massive and FRED with setup's paste-and-check card (setup/KeyCard.tsx),
// and Alpha Vantage, which isn't used yet, saved as it is. Keys are never shown: the window lets
// go of a key once the engine has it.

import { useState } from 'react'

import { KEY_TEXT, KeyCard } from '../setup/KeyCard'
import { at, Changes, ExternalIcon, Spinner } from '../setup/parts'
import type { KeyService } from '../setup/steps'

const KEYS: { service: KeyService | 'alphavantage'; name: string; what: string }[] = [
  { service: 'massive', name: 'Massive', what: 'prices' },
  { service: 'fred', name: 'FRED', what: 'economic data' },
  { service: 'alphavantage', name: 'Alpha Vantage', what: 'not used yet' }
]

export function KeysPanel({ i, keys, onSaved }: { i: number; keys: Record<string, 'set' | 'missing'>; onSaved: () => Promise<void> }) {
  return (
    <section className="p glass keys mv" style={at(i)}>
      <h4>
        <span>Data keys</span>
        <em>kept in the macOS Keychain</em>
      </h4>
      {KEYS.map(({ service, name, what }) =>
        service === 'alphavantage' ? (
          <PlainKeyRow key={service} name={name} what={what} state={keys[service] ?? 'missing'} onSaved={onSaved} />
        ) : (
          <KeyRow key={service} service={service} name={name} what={what} state={keys[service] ?? 'missing'} onSaved={onSaved} />
        )
      )}
    </section>
  )
}

function KeyHead({ name, what, state, tone, open, action, onToggle }: { name: string; what: string; state: 'set' | 'missing'; tone: string; open: boolean; action: string; onToggle: () => void }) {
  return (
    <div className="field">
      <span>
        {name} <small>({what})</small>
      </span>
      <span className={`pill ${state === 'set' ? 'ok' : tone}`}>{state === 'set' ? 'set' : 'missing'}</span>
      <button className="act" aria-expanded={open} onClick={onToggle}>
        {action}
      </button>
    </div>
  )
}

// Massive and FRED: setup's Paste it here card, which checks the key with one call before the
// engine saves it. A missing key opens with the card showing.
function KeyRow({ service, name, what, state, onSaved }: { service: KeyService; name: string; what: string; state: 'set' | 'missing'; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(state === 'missing')
  const [proof, setProof] = useState<string | null>(null)
  const text = KEY_TEXT[service]
  const toggle = () => {
    setOpen((o) => !o)
    setProof(null)
  }
  const action = open ? (proof ? 'Done' : state === 'set' ? 'Cancel' : 'Hide') : state === 'set' ? 'Replace key' : 'Add key'
  return (
    <div className="keyrow">
      <KeyHead name={name} what={what} state={state} tone={service === 'massive' ? 'bad' : 'hold'} open={open} action={action} onToggle={toggle} />
      {open && (
        <div className="keyform">
          {!proof && (
            <button className="link" onClick={() => void window.tearsheet.openExternal(text.url)}>
              Get a free key at {text.site} <ExternalIcon />
            </button>
          )}
          <KeyCard
            service={service}
            i={0}
            heading={null}
            onWorks={(p) => {
              setProof(p)
              void onSaved()
            }}
          />
        </div>
      )}
    </div>
  )
}

type PlainStatus = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'bad'; text: string }

// Alpha Vantage isn't used yet, so its key is saved as it is, with no check (checkKey covers
// Massive and FRED only), as the settings always did.
function PlainKeyRow({ name, what, state, onSaved }: { name: string; what: string; state: 'set' | 'missing'; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [status, setStatus] = useState<PlainStatus>({ kind: 'idle' })
  const saving = status.kind === 'saving'
  const toggle = () => {
    setOpen((o) => !o)
    setValue('')
    setStatus({ kind: 'idle' })
  }
  const save = async () => {
    const key = value.trim()
    if (saving) return
    if (!key) return setStatus({ kind: 'bad', text: 'Paste your key first.' })
    setStatus({ kind: 'saving' })
    const reply = await window.tearsheet.setKey('alphavantage', key).catch(() => null)
    // The window lets go of the key either way. The engine's own text is never shown, so a key
    // can't reach the window even if an error ever echoed one.
    setValue('')
    if (reply?.ok) {
      setStatus({ kind: 'saved' })
      void onSaved()
    } else setStatus({ kind: 'bad', text: 'The key wasn’t saved. Try again.' })
  }
  const action = open ? (status.kind === 'saved' ? 'Done' : 'Cancel') : state === 'set' ? 'Replace key' : 'Add key'
  return (
    <div className="keyrow">
      <KeyHead name={name} what={what} state={state} tone="off" open={open} action={action} onToggle={toggle} />
      {open && (
        <div className="keyform">
          <div className={status.kind === 'saved' ? 'card mv done' : 'card mv'} style={at(0)}>
            <div className="field">
              <input
                type="password"
                placeholder="Your Alpha Vantage key"
                aria-label="Your Alpha Vantage key"
                autoComplete="off"
                spellCheck={false}
                value={value}
                disabled={saving}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void save()
                  }
                }}
              />
              <button className="btn2" disabled={saving} onClick={() => void save()}>
                Save
              </button>
            </div>
            {status.kind !== 'idle' && (
              <Changes k={status.kind === 'bad' ? `bad:${status.text}` : status.kind} className={status.kind === 'saved' ? 'st ok' : status.kind === 'bad' ? 'st bad' : 'st'} live>
                {status.kind === 'saving' ? (
                  <>
                    <Spinner />
                    Saving…
                  </>
                ) : status.kind === 'saved' ? (
                  'Saved.'
                ) : (
                  status.text
                )}
              </Changes>
            )}
            <p className="fine">Saved in your Mac’s Keychain, never in a file. Tearsheet doesn’t use it yet, so it isn’t checked.</p>
          </div>
        </div>
      )}
    </div>
  )
}
