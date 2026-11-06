// The look-up box (⌘K). It searches the bundled S&P 500 list as you type, shows up to five
// companies, says which already have a report, and gives the highlighted one's peer-group rule.
// Return (on a hit for the text typed now) or a click opens the company's report, or starts a
// new one; the arrows move; Esc closes it.

import { useEffect, useRef, useState } from 'react'

import type { SearchHit } from '../../shared/protocol'
import { leaveMs } from '../motion'
import { freshHits, peerRule, shortDate } from '../nav'
import { ICONS } from '../shell/Sidebar'

const LIMIT = 5

export function LookUp({ onPick, onClose }: { onPick: (hit: SearchHit) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searched, setSearched] = useState('')
  const [failed, setFailed] = useState<string | null>(null)
  const [at, setAt] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const latest = useRef(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => input.current?.focus(), [])

  // Only the newest answer counts, so a slow reply can't replace a newer one.
  useEffect(() => {
    const q = query.trim()
    const ask = ++latest.current
    if (!q) {
      setHits([])
      setSearched('')
      setFailed(null)
      return
    }
    void window.tearsheet.searchCompanies(q, LIMIT).then((reply) => {
      if (ask !== latest.current) return
      setHits(reply.ok && reply.result ? reply.result.slice(0, LIMIT) : [])
      setFailed(reply.ok ? null : reply.error?.message ?? 'The look-up didn’t work.')
      setSearched(q)
      setAt(0)
    })
  }, [query])

  const close = () => {
    if (leaving) return
    setLeaving(true)
    window.setTimeout(onClose, leaveMs())
  }
  const pick = (hit: SearchHit | undefined) => {
    if (!hit || leaving) return
    onPick(hit)
    close()
  }

  const note = (h: SearchHit) => {
    const sector = h.sector ? `${h.sector}, ` : ''
    return h.report_id && h.report_date ? `${sector}report from ${shortDate(h.report_date)}` : `${sector}no report yet`
  }

  return (
    <>
      <div className={leaving ? 'scrim leave' : 'scrim'} onMouseDown={close} />
      <div className={leaving ? 'palette leave' : 'palette'} role="dialog" aria-label="Look up a company">
        <div className="pin">
          {ICONS.search}
          <input
            ref={input}
            type="text"
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls="lookup-list"
            aria-activedescendant={hits.length ? `lookup-${at}` : undefined}
            aria-autocomplete="list"
            placeholder="Ticker or company name"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setAt((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setAt((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                // Only a hit for the text in the field now: never one left from an older query.
                pick(freshHits(query, searched, hits)[at])
              } else if (e.key === 'Escape') {
                e.preventDefault()
                close()
              }
            }}
          />
        </div>
        {hits.length > 0 && (
          <ul id="lookup-list" role="listbox" aria-label="Companies">
            {hits.map((h, i) => (
              <li key={h.cik} id={`lookup-${i}`} role="option" aria-selected={i === at}>
                <button className={i === at ? 'on' : ''} tabIndex={-1} onMouseEnter={() => setAt(i)} onClick={() => pick(h)}>
                  <b>{h.ticker}</b>
                  <span>{h.name}</span>
                  <small>{note(h)}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
        {peerRule(hits, at) && <p className="rule">{peerRule(hits, at)}</p>}
        {failed && <p className="none">{failed}</p>}
        {!failed && searched && hits.length === 0 && <p className="none">No S&amp;P 500 company matches “{searched}”.</p>}
        <div className="ft">
          <span>↑ ↓ to move</span>
          <span>Return to open, or write a new report</span>
          <span>Esc to close</span>
        </div>
      </div>
    </>
  )
}
