// The two key cards of setup's Prices and Economic figures steps: Get a free key, which opens
// the service's site in the browser, and Paste it here, which checks the key with one call
// (checkKey) and shows a real number as proof. The engine saves the key to the Keychain only
// when the check works; the window then forgets it and never shows it again.

import { useState } from 'react'

import { Card, CheckIcon, Changes, ExternalIcon, Spinner } from './parts'
import { keyProblem, SERVICE_NAME, type KeyService } from './steps'

export interface KeyText {
  title: string
  lead: string
  // The site's name on the button, and the page it opens (an allowed host in main/external.ts).
  site: string
  url: string
  how: string
  placeholder: string
  fine: string
}

export const KEY_TEXT: Record<KeyService, KeyText> = {
  massive: {
    title: 'Prices come from Massive',
    lead: 'A free Massive key gives Tearsheet each day’s closing prices. Getting one takes about a minute.',
    site: 'massive.com',
    url: 'https://massive.com',
    how: 'Sign up with your email, then copy the key from your Massive dashboard.',
    placeholder: 'Your Massive key',
    fine: 'The free plan gives end-of-day prices at 5 calls a minute, which is why a first report takes about 20 minutes.'
  },
  fred: {
    title: 'Economic figures from FRED',
    lead: 'A free key from the St. Louis Fed adds inflation, jobs, growth and interest rates to each report.',
    site: 'fred.stlouisfed.org',
    url: 'https://fredaccount.stlouisfed.org/apikeys',
    how: 'Sign up, then open API Keys in your account and ask for one.',
    placeholder: 'Your FRED key',
    fine: 'Without it, reports leave out the economic figures and say so.'
  }
}

export function GetKeyCard({ service, i }: { service: KeyService; i: number }) {
  const text = KEY_TEXT[service]
  return (
    <Card i={i}>
      <h4>
        <span className="n">1</span>Get a free key
      </h4>
      <p>{text.how}</p>
      <div className="row">
        <button className="btn2" onClick={() => void window.tearsheet.openExternal(text.url)}>
          Open {text.site} <ExternalIcon />
        </button>
      </div>
    </Card>
  )
}

type Status = { kind: 'idle' } | { kind: 'checking' } | { kind: 'works'; proof: string } | { kind: 'bad'; text: string }

// Paste it here. `proof` is the line from a check that already worked, if any.
export function KeyCard({ service, i, proof, onWorks }: { service: KeyService; i: number; proof?: string; onWorks: (proof: string) => void }) {
  const [value, setValue] = useState('')
  const [status, setStatus] = useState<Status>(proof ? { kind: 'works', proof } : { kind: 'idle' })
  const name = SERVICE_NAME[service]
  const checking = status.kind === 'checking'

  const check = async () => {
    const key = value.trim()
    if (checking) return
    if (!key) return setStatus({ kind: 'bad', text: 'Paste your key first.' })
    setStatus({ kind: 'checking' })
    const reply = await window.tearsheet.checkKey(service, key)
    if (reply.ok && reply.result) {
      // Saved in the Keychain by the engine; the window lets go of it.
      setValue('')
      setStatus({ kind: 'works', proof: reply.result.proof })
      onWorks(reply.result.proof)
    } else setStatus({ kind: 'bad', text: keyProblem(service, reply.error?.code, reply.error?.message) })
  }

  const works = Boolean(proof) || status.kind === 'works'
  let line = null
  if (status.kind === 'checking') {
    line = (
      <>
        <Spinner />
        Checking with {name}…
      </>
    )
  } else if (status.kind === 'works') {
    line = (
      <>
        <CheckIcon />
        {status.proof}
      </>
    )
  } else if (status.kind === 'bad') line = status.text
  const tone = status.kind === 'works' ? 'st ok' : status.kind === 'bad' ? 'st bad' : 'st'

  return (
    <Card i={i} className={works ? 'done' : undefined}>
      <h4>
        <span className="n">{works ? <CheckIcon /> : '2'}</span>Paste it here
      </h4>
      <div className="field">
        <input
          type="password"
          placeholder={KEY_TEXT[service].placeholder}
          aria-label={KEY_TEXT[service].placeholder}
          autoComplete="off"
          spellCheck={false}
          value={value}
          disabled={checking}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void check()
            }
          }}
        />
        <button className="btn2" disabled={checking} onClick={() => void check()}>
          Check
        </button>
      </div>
      <Changes k={status.kind === 'bad' ? `bad:${status.text}` : status.kind} className={tone} live>
        {line}
      </Changes>
      <p className="fine">Saved in your Mac’s Keychain, never in a file.</p>
    </Card>
  )
}
