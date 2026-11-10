// The Key numbers under the price chart (Liam's design 4, "Groups you open and close"): four
// groups, each a header row with its arrow, name and one-line summary that opens and closes its
// rows. Each row is the number's name, the company's value and the peer median where the report
// has one; a number that can't be filled shows a dash and why, in a few words. Clicking a row
// shows its working underneath, in the engine's own words. Every number and every line comes from
// the engine (key_numbers.py), so the panel and the PDF never round a number differently. Which
// groups are open is kept across reports (prefs.ts). You scroll the chart panel down to reach it;
// the chart above is left as it is.

import { memo, useState, type ReactElement } from 'react'

import type { KeyNumbers as Numbers, KeyRow } from '../../shared/protocol'
import { shortDate } from '../nav'
import { keyGroupsOpen, setKeyGroupsOpen } from './prefs'

function Row({ row, id }: { row: KeyRow; id: string }): ReactElement {
  const [shown, setShown] = useState(false)
  const missing = row.text === null
  return (
    <div className="knr">
      <button className={shown ? 'knrow on' : 'knrow'} aria-expanded={shown} aria-controls={id} onClick={() => setShown(!shown)}>
        <span className="knl">{row.label}</span>
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
  const asOf = numbers.close_date ? `${shortDate(numbers.close_date)} close · ` : ''
  return (
    <section className="kn" aria-labelledby="kn-title">
      <div className="knh">
        <h2 id="kn-title">Key numbers</h2>
        <span>{asOf}click a group to open it</span>
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
                  <span className="knname">{g.name}</span>
                  <span className="knsum">{g.summary}</span>
                </button>
              </h3>
              {on && (
                <div id={rowsId} className="knrows">
                  {g.rows.map((r) => (
                    <Row key={r.key} row={r} id={`kn-${g.key}-${r.key}`} />
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
