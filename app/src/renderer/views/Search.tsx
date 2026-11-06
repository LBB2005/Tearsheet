import { useState } from 'react'

import { Mark } from '../mark/Mark'

export function Search({ onStarted }: { onStarted: (runId: string, query: string) => void }) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<string[]>([])

  const go = async (text = query) => {
    if (!text.trim()) return
    setBusy(true)
    setError(null)
    setCandidates([])
    const reply = await window.tearsheet.runReport(text.trim())
    setBusy(false)
    if (reply.ok && reply.result) return onStarted(reply.result.run_id, text.trim())
    const code = reply.error?.code
    if (code === 'NOT_COVERED') {
      const found = (reply.error?.data?.candidates as string[] | undefined) ?? []
      setCandidates(found)
      setError(found.length ? 'More than one company matches. Pick one:' : `${reply.error?.message}`)
    } else if (code === 'RUN_IN_PROGRESS') setError('A report is already running. See Progress.')
    else setError(reply.error?.message ?? 'Something went wrong.')
  }

  return (
    <section>
      <div className="mark-heading">
        <Mark size={64} />
        <h2>New report</h2>
      </div>
      <p className="muted">Type an S&amp;P 500 company name or ticker. Code makes every number; your AI tool writes the cited narrative.</p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          void go()
        }}
      >
        <input className="big" type="text" autoFocus placeholder="AAPL, Apple, Google…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="primary" disabled={busy || !query.trim()}>
          {busy ? 'Looking it up…' : 'Write report'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {candidates.map((c) => (
        <button key={c} className="plain" onClick={() => void go(c)}>
          {c}
        </button>
      ))}
      <p className="muted" style={{ marginTop: 28 }}>
        General research, not personalised investment advice. A first report in a new sector takes about 20 minutes, mostly to download prices.
      </p>
    </section>
  )
}
