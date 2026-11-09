// The paste-and-check card for a data key (first-run design item 36), shared by the setup
// screen's price key and Settings → Data keys. It does the whole check, and its page only learns
// that the key works:
//   - a local shape check runs before any call (helpers.ts keyShape);
//   - with `checkOnPaste`, the check runs as soon as a key is pasted, and the masked key shows;
//   - one check at a time, and only the latest answer counts;
//   - a rejected key is cleared and the field focused;
//   - "Try again" appears when the service can't be reached.
// The engine saves the key to the Keychain only when the check works; the window then forgets it
// and never shows it again. `showCheck` adds a Check button (Settings); setup has none (D7).

import { useEffect, useRef, useState, type ClipboardEvent, type ReactNode, type RefObject } from 'react'

import { keyProblem, keyShape, maskKey, SERVICE_NAME, type KeyService } from './helpers'
import { Card, CheckIcon, Changes, ExternalIcon, Spinner } from './parts'

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

type Status = { kind: 'idle' } | { kind: 'checking'; masked: string } | { kind: 'works'; proof: string } | { kind: 'bad'; text: string; retry: boolean }

export interface KeyCardProps {
  service: KeyService
  i: number
  // The line from a check that already worked, if any.
  proof?: string
  // In place of the numbered "Paste it here"; null for none.
  heading?: ReactNode
  // The check runs as soon as a key is pasted.
  checkOnPaste?: boolean
  // A Check button beside the field.
  showCheck?: boolean
  // Setup's version: "Get a free key" beside the field, with no card around them.
  getKey?: { onOpen?: () => void }
  placeholder?: string
  inputRef?: RefObject<HTMLInputElement>
  onWorks: (proof: string) => void
}

export function KeyCard({ service, i, proof, heading, checkOnPaste = false, showCheck = false, getKey, placeholder, inputRef, onWorks }: KeyCardProps) {
  const [value, setValue] = useState('')
  const [status, setStatus] = useState<Status>(proof ? { kind: 'works', proof } : { kind: 'idle' })
  const own = useRef<HTMLInputElement>(null)
  const field = inputRef ?? own
  // Only the latest check's answer counts.
  const latest = useRef(0)
  // The key a check that couldn't reach the service was sent, for Try again.
  const last = useRef('')
  const live = useRef(true)
  useEffect(
    () => () => {
      live.current = false
    },
    []
  )
  const name = SERVICE_NAME[service]
  const text = KEY_TEXT[service]
  const checking = status.kind === 'checking'

  const reject = (problem: string, retry = false) => {
    setValue('')
    setStatus({ kind: 'bad', text: problem, retry })
    if (!retry) window.setTimeout(() => field.current?.focus(), 0)
  }

  const check = async (raw: string) => {
    const key = raw.trim()
    const shape = keyShape(key)
    if (shape) return reject(shape)
    const ask = ++latest.current
    last.current = key
    setStatus({ kind: 'checking', masked: maskKey(key) })
    const reply = await window.tearsheet.checkKey(service, key).catch(() => ({ ok: false as const, result: undefined, error: undefined }))
    if (!live.current || ask !== latest.current) return
    if (reply.ok && reply.result) {
      // Saved in the Keychain by the engine; the window lets go of it.
      setValue('')
      last.current = ''
      setStatus({ kind: 'works', proof: reply.result.proof })
      onWorks(reply.result.proof)
    } else {
      const code = reply.error?.code
      reject(keyProblem(service, code), code === 'SERVICE_UNREACHABLE')
    }
  }

  const paste = (e: ClipboardEvent<HTMLInputElement>) => {
    if (!checkOnPaste) return
    const pasted = e.clipboardData.getData('text')
    if (!pasted) return
    e.preventDefault()
    setValue(pasted.trim())
    void check(pasted)
  }

  const works = Boolean(proof) || status.kind === 'works'
  let line = null
  if (status.kind === 'checking') {
    line = (
      <>
        <Spinner />
        Checking <span className="mono">{status.masked}</span> with {name}…
      </>
    )
  } else if (status.kind === 'works') {
    line = (
      <>
        <CheckIcon />
        {status.proof}
      </>
    )
  } else if (status.kind === 'bad') {
    line = (
      <>
        {status.text}
        {status.retry && (
          <button className="link" onClick={() => void check(last.current)}>
            Try again
          </button>
        )}
      </>
    )
  }
  const tone = status.kind === 'works' ? 'st ok' : status.kind === 'bad' ? 'st bad' : 'st'

  const row = (
    <div className={getKey ? 'krow3' : 'field'}>
      {getKey && (
        <button
          className="btn2"
          onClick={() => {
            getKey.onOpen?.()
            void window.tearsheet.openExternal(text.url)
          }}
        >
          Get a free key <ExternalIcon />
        </button>
      )}
      <input
        ref={field}
        className={getKey ? 'kin' : undefined}
        type="password"
        placeholder={placeholder ?? text.placeholder}
        aria-label={text.placeholder}
        autoComplete="off"
        spellCheck={false}
        value={value}
        disabled={checking}
        onChange={(e) => setValue(e.target.value)}
        onPaste={paste}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (!checking) void check(value)
          }
        }}
      />
      {showCheck && (
        <button className="btn2" disabled={checking} onClick={() => void check(value)}>
          Check
        </button>
      )}
    </div>
  )
  const note = (
    <Changes k={status.kind === 'bad' ? `bad:${status.text}` : status.kind} className={tone} live>
      {line}
    </Changes>
  )

  if (getKey) {
    return (
      <div className="keyask">
        {row}
        {note}
        <p className="fine">Saved in your Mac’s Keychain, never in a file.</p>
      </div>
    )
  }
  return (
    <Card i={i} className={works ? 'done' : undefined}>
      {heading === undefined ? (
        <h4>
          <span className="n">{works ? <CheckIcon /> : '2'}</span>Paste it here
        </h4>
      ) : (
        heading
      )}
      {row}
      {note}
      <p className="fine">Saved in your Mac’s Keychain, never in a file.</p>
    </Card>
  )
}
