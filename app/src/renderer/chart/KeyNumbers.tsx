// The Key numbers under the price chart (Liam's design 4, "Groups you open and close"): four
// groups, each a header row with its arrow, name and one-line summary that opens and closes its
// rows. Each row is the number's name, the company's value and the peer median where the report
// has one; a number that can't be filled shows a dash and why, in a few words. Clicking a row
// shows its working underneath, in the engine's own words. Every number and every line comes from
// the engine (key_numbers.py), so the panel and the PDF never round a number differently. Which
// groups are open is kept across reports (prefs.ts). You scroll the chart panel down to reach it;
// the chart above is left as it is. The 12-month return is the report's, to its price date, while
// the prices are the last close: when the two dates differ, the return names its own.

import { memo, useState, type ReactElement } from 'react'

import type { KeyNumbers as Numbers, KeyRow } from '../../shared/protocol'
import { shortDate } from '../nav'
import { keyGroupsOpen, setKeyGroupsOpen } from './prefs'

// The 12-month return runs to the report's price date, not to the close the rest of the group
// shows: "up 117.9% in a year, to Nov 6". Null when the two are the same day (or unknown).
export function returnDate(numbers: Pick<Numbers, 'close_date' | 'report_date'>): string | null {
  const to = numbers.report_date
  return to && to !== numbers.close_date ? shortDate(to) : null
}

// A group summary's "in a year" (or "over a year"), with the date the return runs to.
export function datedSummary(summary: string, to: string | null): string {
  return to ? summary.replace(/\b(in|over) a year\b/, `$1 a year, to ${to}`) : summary
}

function Row({ row, id, to }: { row: KeyRow; id: string; to: string | null }): ReactElement {
  const [shown, setShown] = useState(false)
  const missing = row.text === null
  return (
    <div className="knr">
      <button className={shown ? 'knrow on' : 'knrow'} aria-expanded={shown} aria-controls={id} onClick={() => setShown(!shown)}>
        <span className="knl">{to && row.key === 'return_12m' ? `${row.label}, to ${to}` : row.label}</span>
        <span className={['knv', missing && 'none', row.tone].filter(Boolean).join(' ')}>{missing ? '–' : row.text}</span>
        <span className={missing ? 'knp why' : 'knp'}>{missing ? row.note : row.peer_text ? `Peers ${row.peer_text}` : ''}</span>
      </button>
      {shown && (
        <p id={id} className="knwork">
          {row.working}
        </p>
      )}
    </div>
  )
}

// Memoised: the chart pane draws again on every frame of a resize, and the numbers don't change.
export const KeyNumbers = memo(function KeyNumbers({ numbers }: { numbers: Numbers }): ReactElement {
  const [open, setOpen] = useState<string[]>(keyGroupsOpen)
  // From the latest state, so two quick clicks both count; kept for the next report.
  const toggle = (key: string) =>
    setOpen((was) => {
      const next = was.includes(key) ? was.filter((k) => k !== key) : [...was, key]
      setKeyGroupsOpen(next)
      return next
    })
  const asOf = numbers.close_date ? `${shortDate(numbers.close_date)} close` : ''
  const to = returnDate(numbers)
  return (
    <section className="kn" aria-labelledby="kn-title">
      <div className="knh">
        <h2 id="kn-title">Key numbers</h2>
        {asOf && <span>{asOf}</span>}
      </div>
      <div className="kngroups">
        {numbers.groups.map((g) => {
          const on = open.includes(g.key)
          const rowsId = `kn-${g.key}`
          return (
            <div key={g.key} className={on ? 'kng on' : 'kng'}>
              <h3>
                <button className="knhead" aria-expanded={on} aria-controls={rowsId} onClick={() => toggle(g.key)}>
                  <svg className="knarrow" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M4 2.5L7.5 6 4 9.5" />
                  </svg>
                  <span className="knname eyebrow">{g.name}</span>
                  <span className="knsum">{g.key === 'trading' ? datedSummary(g.summary, to) : g.summary}</span>
                </button>
              </h3>
              {on && (
                <div id={rowsId} className="knrows">
                  {g.rows.map((r) => (
                    <Row key={r.key} row={r} id={`kn-${g.key}-${r.key}`} to={to} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="knsrc">{numbers.source}</p>
    </section>
  )
})
