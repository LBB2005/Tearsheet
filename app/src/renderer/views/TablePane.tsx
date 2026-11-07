// A Full-report table, opened bigger: the same rows as in the report, with a filter that matches
// any cell and a header that sorts by a column. The sort and filter are kept in the view's state.

import { useEffect, useRef, type ReactElement } from 'react'

import { ViewFrame, type ViewProps } from '../panel/ViewFrame'
import { viewTitle } from '../panel/titles'
import { pickIndex } from './pick'
import { cellNumber, nextSort, numericColumn, tableRows, type TableState } from './table'

import './views.css'

export function Table({ chrome, view, numbers, ticker, item, state, setState }: ViewProps<TableState>): ReactElement {
  const title = viewTitle(view, numbers.tables)
  const key = view.slice('table-'.length)
  const table = numbers.tables?.find((t) => t.key === key) ?? null
  const pickedRow = useRef<HTMLTableRowElement | null>(null)
  const scrolled = useRef(false)

  // The row the link named comes into view once; after that the reader scrolls for themselves.
  useEffect(() => {
    if (scrolled.current || !pickedRow.current) return
    scrolled.current = true
    pickedRow.current.scrollIntoView({ block: 'nearest' })
  })

  if (!table || table.rows.length === 0)
    return (
      <ViewFrame chrome={chrome} title={title} subtitle={ticker}>
        <p className="vgap">This table isn’t stored for this report.</p>
      </ViewFrame>
    )

  const [header, ...data] = table.rows
  const rows = tableRows(table.rows, state)
  const picked = pickIndex(item, data.length)
  const numeric = header.map((_, col) => numericColumn(table.rows, col))
  const count = `${rows.length} of ${data.length} rows`

  return (
    <ViewFrame chrome={chrome} title={title} subtitle={ticker}>
      <div className="tctl">
        <input
          type="search"
          className="tfilter"
          aria-label="Filter rows"
          placeholder="Filter rows"
          value={state.filter}
          onChange={(e) => setState({ ...state, filter: e.target.value })}
        />
        <span className="tcount" aria-live="polite">
          {count}
        </span>
      </div>
      <div className="tscroll">
        <table className="ttable">
          <thead>
            <tr>
              {header.map((h, col) => {
                const on = state.sort?.col === col ? state.sort : null
                return (
                  <th key={col} className={numeric[col] ? 'num' : undefined} scope="col" aria-sort={on ? (on.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button className="tsort" onClick={() => setState({ ...state, sort: nextSort(state.sort, col) })}>
                      {h}
                      {on && <span aria-hidden="true">{on.dir === 'asc' ? '▲' : '▼'}</span>}
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.at} ref={r.at === picked ? pickedRow : undefined} className={r.at === picked ? 'picked' : undefined}>
                {r.cells.map((c, col) => (
                  <td key={col} className={numeric[col] && cellNumber(c) !== null ? 'num' : undefined}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="tnone">No rows match the filter.</p>}
      </div>
    </ViewFrame>
  )
}
