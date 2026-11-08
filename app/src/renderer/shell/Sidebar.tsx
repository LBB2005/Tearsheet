// The Claude-style sidebar (the spec's "The window"): flat dark, with no boxes or borders. From
// top to bottom: New report and Look up; "Reports", with Search and the sort and filter menu, and
// one row per company (the one being written first, as "writing…"); Prediction log, Settings
// and the status line.
//
// A row is its ticker, a tick for an official prediction, the last close and a rating tag (look 3
// of the sidebar mockups, 2026-11-07). Pinned companies come first, then the date groups
// (reportList.ts). Each row has a "…" menu, also on right-click: Pin, Show in Prediction log,
// Select and Delete. ⌘-click or ⇧-click selects several. In the list, ↑ ↓ Home End move,
// Return opens, ⌘⌫ deletes and Esc ends a selection or the search. Deleting is App's
// (useMarks.ts): it hides at once and offers Undo.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactElement } from 'react'

import type { CompanyRow, ReportSummary } from '../../shared/protocol'
import { shortDate, type Page, type StatusLine } from '../nav'
import { Menu, type MenuEntry } from './Menu'
import { filtersOn, groupRows, loadPrefs, matches, moveText, RATINGS, savePrefs, sectorsOf, selectRange, SORT_NAMES, type ListPrefs, type SortKey } from './reportList'

// Line icons from the prototype (report-look-c-chart-split.html, ICON4).
export const ICONS: Record<'side' | 'plus' | 'search' | 'log' | 'gear' | 'sliders' | 'more' | 'official', ReactElement> = {
  side: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9 4v16" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </svg>
  ),
  log: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 19h16M7 16V9M12 16V5M17 16v-4" />
    </svg>
  ),
  gear: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </svg>
  ),
  sliders: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </svg>
  ),
  official: (
    <svg className="off4" viewBox="0 0 24 24" role="img" aria-label="Official prediction">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.2l2.4 2.4 4.6-4.9" />
    </svg>
  )
}

export const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

// The button beside the window buttons (left 88 px, top 13 px). It stays when the sidebar is
// hidden, so the sidebar can come back. It sits on strips that drag the window, so App puts it
// after them in the page: there, the later of two overlapping drag areas wins, not z-index.
export function SidebarButton({ shown, onClick }: { shown: boolean; onClick: () => void }) {
  return (
    <button className="sbt" aria-label={shown ? 'Hide the sidebar' : 'Show the sidebar'} aria-expanded={shown} title="Show or hide the sidebar (⌃⌘S)" onClick={onClick}>
      {ICONS.side}
    </button>
  )
}

// The report being written, at the top of the list as "writing…". `on` while the home page
// shows its run view; `waiting`, how many more are in the line after it.
export interface WritingRow {
  ticker: string
  on: boolean
  waiting?: number
}

export interface SidebarProps {
  page: Page
  companies: CompanyRow[]
  openReport: string | null
  writing: WritingRow | null
  status: StatusLine
  // The Hidden group's reports, while the filter menu shows it; null until they have loaded.
  hidden: ReportSummary[] | null
  onNew: () => void
  onWriting: () => void
  onLookUp: () => void
  onCompany: (row: CompanyRow) => void
  onPage: (page: 'log' | 'settings') => void
  onDelete: (rows: CompanyRow[]) => void
  onPin: (row: CompanyRow, pinned: boolean) => void
  onShowHidden: (on: boolean) => void
  onOpenHidden: (report: ReportSummary) => void
  onBringBack: (report: ReportSummary) => void
  onDeleteHidden: (report: ReportSummary) => void
  // The companies in the order the list shows them, for ⌘[ and ⌘].
  onOrder?: (rows: CompanyRow[]) => void
}

type Opened = { key: string; at: { left: number; top: number } }

const cikKey = (cik: number) => `c:${cik}`
const hiddenKey = (id: string) => `h:${id}`

export function Sidebar(props: SidebarProps) {
  const { page, companies, openReport, writing, status, hidden, onNew, onWriting, onLookUp, onCompany, onPage, onDelete, onPin, onOpenHidden, onBringBack, onDeleteHidden } = props
  const row = (on: boolean) => (on ? 'row4 on' : 'row4')
  const newOn = page === 'home' && !writing?.on

  const [prefs, setPrefsState] = useState<ListPrefs>(loadPrefs)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [anchor, setAnchor] = useState<number | null>(null)
  const [menu, setMenu] = useState<Opened | null>(null)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const rows = useRef(new Map<string, HTMLButtonElement>())
  const searchField = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  // A row to put the cursor on once the list has redrawn (after a delete).
  const refocus = useRef<string | null>(null)

  const setPrefs = (next: ListPrefs) => {
    setPrefsState(next)
    savePrefs(next)
    setSelected([])
  }

  // App loads the Hidden group while it is on.
  const showHidden = useRef(props.onShowHidden)
  showHidden.current = props.onShowHidden
  useEffect(() => showHidden.current(prefs.showHidden), [prefs.showHidden])

  // One row per company: while its report is written, the company's own row gives way to it.
  const listed = useMemo(() => (writing ? companies.filter((c) => c.ticker !== writing.ticker) : companies), [companies, writing])
  const groups = useMemo(() => groupRows(listed, prefs, query), [listed, prefs, query])
  const visible = useMemo(() => groups.flatMap((g) => g.rows), [groups])
  const hiddenRows = prefs.showHidden ? (hidden ?? []).filter((r) => matches(r, query)) : []
  const order = [...(writing ? ['w'] : []), ...visible.map((c) => cikKey(c.cik)), ...hiddenRows.map((r) => hiddenKey(r.report_id))]
  const openKey = visible.find((c) => page === 'report' && c.report_id === openReport)
  const tabKey = focusKey && order.includes(focusKey) ? focusKey : openKey ? cikKey(openKey.cik) : order[0]

  const selectedRows = visible.filter((c) => selected.includes(c.cik))
  const selecting = selectedRows.length > 0
  const filters = filtersOn(prefs)

  const orderOut = useRef(props.onOrder)
  orderOut.current = props.onOrder
  useEffect(() => orderOut.current?.(visible), [visible])

  useEffect(() => {
    if (searching) searchField.current?.focus()
  }, [searching])

  useEffect(() => {
    const key = refocus.current
    if (!key) return
    refocus.current = null
    rows.current.get(order.includes(key) ? key : order[order.length - 1])?.focus()
  })

  const focusRow = (key: string | undefined) => {
    if (!key) return
    setFocusKey(key)
    rows.current.get(key)?.focus()
  }
  const keep = (key: string) => (el: HTMLButtonElement | null) => {
    if (el) rows.current.set(key, el)
    else rows.current.delete(key)
  }

  const clearSelection = () => {
    setSelected([])
    setAnchor(null)
  }
  const closeSearch = () => {
    setQuery('')
    setSearching(false)
  }

  // Delete rows, and put the cursor on the row after them.
  const remove = (gone: CompanyRow[]) => {
    if (gone.length === 0) return
    const keys = gone.map((c) => cikKey(c.cik))
    const first = Math.min(...keys.map((k) => order.indexOf(k)).filter((i) => i >= 0))
    const next = order.filter((k) => !keys.includes(k))[Math.max(0, first)] ?? null
    const inList = list.current?.contains(document.activeElement) ?? false
    if (next && (inList || (focusKey !== null && keys.includes(focusKey)))) {
      refocus.current = next
      setFocusKey(next)
    }
    clearSelection()
    onDelete(gone)
  }

  const clickCompany = (e: MouseEvent, c: CompanyRow) => {
    setFocusKey(cikKey(c.cik))
    if (e.shiftKey) {
      const from = anchor ?? openKey?.cik ?? null
      setSelected(
        selectRange(
          visible.map((r) => r.cik),
          from,
          c.cik
        )
      )
      if (anchor === null) setAnchor(from ?? c.cik)
      return
    }
    if (e.metaKey || selecting) {
      setSelected((s) => (s.includes(c.cik) ? s.filter((x) => x !== c.cik) : [...s, c.cik]))
      setAnchor(c.cik)
      return
    }
    onCompany(c)
  }

  const openMenu = (key: string, at: { left: number; top: number }) => {
    setFocusKey(key)
    setMenu({ key, at })
  }
  const menuBelow = (key: string, el: Element) => {
    const r = el.getBoundingClientRect()
    openMenu(key, { left: r.left, top: r.bottom + 4 })
  }

  const companyEntries = (c: CompanyRow): MenuEntry[] => {
    if (selectedRows.length > 1 && selected.includes(c.cik)) {
      return [
        { kind: 'item', label: `Delete ${selectedRows.length} selected`, shortcut: '⌘⌫', danger: true, onSelect: () => remove(selectedRows) },
        { kind: 'item', label: 'Cancel selection', onSelect: clearSelection }
      ]
    }
    return [
      { kind: 'item', label: c.pinned ? 'Unpin' : 'Pin to top', onSelect: () => onPin(c, !c.pinned) },
      ...(c.official ? [{ kind: 'item', label: 'Show in Prediction log', onSelect: () => onPage('log') } as MenuEntry] : []),
      {
        kind: 'item',
        label: 'Select',
        onSelect: () => {
          setSelected([c.cik])
          setAnchor(c.cik)
        }
      },
      { kind: 'separator' },
      { kind: 'item', label: c.reports > 1 ? `Delete all ${c.reports} reports` : 'Delete report', shortcut: '⌘⌫', danger: true, onSelect: () => remove([c]) }
    ]
  }

  const hiddenEntries = (r: ReportSummary): MenuEntry[] => [
    { kind: 'item', label: 'Open', onSelect: () => onOpenHidden(r) },
    { kind: 'item', label: 'Bring back', onSelect: () => onBringBack(r) },
    ...(r.kept_because === null ? ([{ kind: 'separator' }, { kind: 'item', label: 'Delete report', danger: true, onSelect: () => onDeleteHidden(r) }] as MenuEntry[]) : [])
  ]

  const sectors = sectorsOf(listed)
  const sortEntries = (): MenuEntry[] => [
    { kind: 'heading', label: 'Sort' },
    ...(Object.keys(SORT_NAMES) as SortKey[]).map((sort): MenuEntry => ({ kind: 'check', radio: true, label: SORT_NAMES[sort], checked: prefs.sort === sort, onSelect: () => setPrefs({ ...prefs, sort }) })),
    { kind: 'separator' },
    { kind: 'heading', label: 'Show' },
    ...RATINGS.map(
      (rating): MenuEntry => ({
        kind: 'check',
        label: rating,
        checked: !prefs.hideRatings.includes(rating),
        onSelect: () => setPrefs({ ...prefs, hideRatings: prefs.hideRatings.includes(rating) ? prefs.hideRatings.filter((x) => x !== rating) : [...prefs.hideRatings, rating] })
      })
    ),
    { kind: 'check', label: 'Only official predictions', checked: prefs.officialOnly, onSelect: () => setPrefs({ ...prefs, officialOnly: !prefs.officialOnly }) },
    ...(sectors.length > 1 || prefs.sector
      ? ([
          { kind: 'heading', label: 'Sector' },
          { kind: 'check', radio: true, label: 'Every sector', checked: prefs.sector === null, onSelect: () => setPrefs({ ...prefs, sector: null }) },
          ...sectors.map((sector): MenuEntry => ({ kind: 'check', radio: true, label: sector, checked: prefs.sector === sector, onSelect: () => setPrefs({ ...prefs, sector }) }))
        ] as MenuEntry[])
      : []),
    { kind: 'separator' },
    { kind: 'check', label: 'Hidden reports', checked: prefs.showHidden, onSelect: () => setPrefs({ ...prefs, showHidden: !prefs.showHidden }) },
    ...(filters > 0 ? ([{ kind: 'item', label: 'Clear filters', onSelect: () => setPrefs({ ...prefs, hideRatings: [], officialOnly: false, sector: null }) }] as MenuEntry[]) : [])
  ]

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const key = (e.target as HTMLElement).dataset.key
    if (!key) return
    const i = order.indexOf(key)
    const company = visible.find((c) => cikKey(c.cik) === key)
    const report = hiddenRows.find((r) => hiddenKey(r.report_id) === key)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusRow(order[Math.min(order.length - 1, i + 1)])
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (i === 0 && searching) searchField.current?.focus()
      else focusRow(order[Math.max(0, i - 1)])
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusRow(order[0])
    } else if (e.key === 'End') {
      e.preventDefault()
      focusRow(order[order.length - 1])
    } else if ((e.key === 'Backspace' && e.metaKey) || e.key === 'Delete') {
      e.preventDefault()
      if (company) remove(selecting && selected.includes(company.cik) ? selectedRows : [company])
      else if (report && report.kept_because === null) onDeleteHidden(report)
    } else if (e.key === 'Escape' && (selecting || searching)) {
      e.preventDefault()
      e.stopPropagation()
      if (selecting) clearSelection()
      else closeSearch()
    } else if (e.key === 'a' && e.metaKey && company) {
      e.preventDefault()
      setSelected(visible.map((c) => c.cik))
    } else if ((e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) && (company || report)) {
      e.preventDefault()
      menuBelow(key, e.target as Element)
    }
  }

  const companyRow = (c: CompanyRow) => {
    const key = cikKey(c.cik)
    const on = page === 'report' && c.report_id === openReport
    const picked = selected.includes(c.cik)
    const shown = menu?.key === key
    const figure = prefs.sort === 'move' ? moveText(c.since_report) : c.price === null ? null : money.format(c.price)
    return (
      <div role="listitem" key={key} className={['ri4', picked ? 'sel' : '', shown ? 'menu' : ''].filter(Boolean).join(' ')}>
        <button
          ref={keep(key)}
          data-key={key}
          tabIndex={key === tabKey ? 0 : -1}
          className={row(on)}
          aria-current={on ? 'page' : undefined}
          aria-pressed={selecting ? picked : undefined}
          title={c.name}
          onClick={(e) => clickCompany(e, c)}
          onFocus={() => setFocusKey(key)}
          onContextMenu={(e) => {
            e.preventDefault()
            openMenu(key, { left: e.clientX, top: e.clientY })
          }}
        >
          {selecting && <i className="ck4" aria-hidden="true" />}
          <b>{c.ticker}</b>
          {c.official && ICONS.official}
          {figure && <span className="px">{figure}</span>}
          {c.rating && <span className={`tag4 ${c.rating.toLowerCase()}`}>{c.rating}</span>}
        </button>
        <button className="more4" tabIndex={-1} aria-label={`Options for ${c.ticker}`} aria-haspopup="menu" aria-expanded={shown} onClick={(e) => menuBelow(key, e.currentTarget)}>
          {ICONS.more}
        </button>
      </div>
    )
  }

  const hiddenRow = (r: ReportSummary) => {
    const key = hiddenKey(r.report_id)
    const on = page === 'report' && r.report_id === openReport
    const shown = menu?.key === key
    return (
      <div role="listitem" key={key} className={shown ? 'ri4 hid4 menu' : 'ri4 hid4'}>
        <button
          ref={keep(key)}
          data-key={key}
          tabIndex={key === tabKey ? 0 : -1}
          className={row(on)}
          aria-current={on ? 'page' : undefined}
          title={r.name ?? undefined}
          onClick={() => onOpenHidden(r)}
          onFocus={() => setFocusKey(key)}
          onContextMenu={(e) => {
            e.preventDefault()
            openMenu(key, { left: e.clientX, top: e.clientY })
          }}
        >
          <b>{r.ticker ?? '—'}</b>
          {r.kept_because === 'official' && ICONS.official}
          <span className="px">{shortDate(r.created_at)}</span>
          {r.rating && <span className={`tag4 ${r.rating.toLowerCase()}`}>{r.rating}</span>}
        </button>
        <button className="more4" tabIndex={-1} aria-label={`Options for the hidden ${r.ticker ?? ''} report`} aria-haspopup="menu" aria-expanded={shown} onClick={(e) => menuBelow(key, e.currentTarget)}>
          {ICONS.more}
        </button>
      </div>
    )
  }

  const menuCompany = menu ? visible.find((c) => cikKey(c.cik) === menu.key) : undefined
  const menuHidden = menu ? hiddenRows.find((r) => hiddenKey(r.report_id) === menu.key) : undefined
  const sortShown = menu?.key === 'sort'

  return (
    <aside className="side4" aria-label="Sidebar">
      {/* The strip beside the window buttons drags the window, as the toolbar does. */}
      <div className="sidedrag" />
      <div className="in">
        <button className={row(newOn)} aria-current={newOn ? 'page' : undefined} onClick={onNew}>
          {ICONS.plus}New report<kbd>⌘N</kbd>
        </button>
        <button className="row4" onClick={onLookUp}>
          {ICONS.search}Look up<kbd>⌘K</kbd>
        </button>
        <div className="hd4">
          <span id="side-reports">Reports</span>
          <button
            className={searching || query ? 'ib4 on' : 'ib4'}
            aria-label="Search your reports"
            aria-pressed={searching}
            title="Search your reports"
            onClick={() => (searching ? closeSearch() : setSearching(true))}
          >
            {ICONS.search}
          </button>
          <button
            className={filters > 0 || prefs.showHidden || prefs.sort !== 'newest' ? 'ib4 on' : 'ib4'}
            aria-label={filters > 0 ? `Sort and filter (${filters === 1 ? 'a filter' : `${filters} filters`} on)` : 'Sort and filter'}
            aria-haspopup="menu"
            aria-expanded={sortShown}
            title="Sort and filter"
            onClick={(e) => menuBelow('sort', e.currentTarget)}
          >
            {ICONS.sliders}
            {filters > 0 && <i className="dot4" />}
          </button>
        </div>
        {searching && (
          <label className="find4">
            {ICONS.search}
            <input
              ref={searchField}
              value={query}
              placeholder="Search your reports"
              aria-label="Search your reports"
              spellCheck={false}
              onChange={(e) => {
                setQuery(e.target.value)
                setSelected([])
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  e.stopPropagation()
                  closeSearch()
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  focusRow(order.find((k) => k !== 'w'))
                } else if (e.key === 'Enter' && visible[0]) {
                  e.preventDefault()
                  onCompany(visible[0])
                }
              }}
              onBlur={() => {
                if (!query) setSearching(false)
              }}
            />
          </label>
        )}
        <div className="list4" ref={list} onKeyDown={onListKey}>
          {writing && (
            <div role="list" aria-labelledby="side-reports">
              <div role="listitem">
                <button ref={keep('w')} data-key="w" tabIndex={tabKey === 'w' ? 0 : -1} className={row(writing.on)} aria-current={writing.on ? 'page' : undefined} onClick={onWriting} onFocus={() => setFocusKey('w')}>
                  <b>{writing.ticker}</b>
                  <span className="px">{writing.waiting ? `writing… · ${writing.waiting} waiting` : 'writing…'}</span>
                </button>
              </div>
            </div>
          )}
          {!writing && companies.length === 0 && <div className="empty4">Your reports will show here.</div>}
          {companies.length > 0 && visible.length === 0 && (
            <div className="empty4">
              {query.trim() ? (
                <>No reports match “{query.trim()}”.</>
              ) : (
                <>
                  No reports match these filters.{' '}
                  <button className="link4" onClick={() => setPrefs({ ...prefs, hideRatings: [], officialOnly: false, sector: null })}>
                    Clear filters
                  </button>
                </>
              )}
            </div>
          )}
          {groups.map((g) => (
            <div key={g.key} className="grp4">
              {g.label && (
                <div className="gl4" id={`side-g-${g.key}`}>
                  {g.label}
                </div>
              )}
              <div role="list" aria-labelledby={g.label ? `side-g-${g.key}` : 'side-reports'}>
                {g.rows.map(companyRow)}
              </div>
            </div>
          ))}
          {prefs.showHidden && (
            <div className="grp4">
              <div className="gl4" id="side-g-hidden">
                Hidden
              </div>
              {hidden !== null && hiddenRows.length === 0 && <div className="empty4">{query.trim() ? 'No hidden reports match.' : 'No hidden reports.'}</div>}
              <div role="list" aria-labelledby="side-g-hidden">
                {hiddenRows.map(hiddenRow)}
              </div>
            </div>
          )}
        </div>
        {selecting && (
          <div className="selbar4" role="toolbar" aria-label="Selected reports">
            <span>{selectedRows.length} selected</span>
            <button className="danger" onClick={() => remove(selectedRows)}>
              Delete
            </button>
            <button onClick={clearSelection}>Cancel</button>
          </div>
        )}
        <button className={row(page === 'log')} aria-current={page === 'log' ? 'page' : undefined} onClick={() => onPage('log')}>
          {ICONS.log}Prediction log
        </button>
        <button className={row(page === 'settings')} aria-current={page === 'settings' ? 'page' : undefined} onClick={() => onPage('settings')}>
          {ICONS.gear}Settings<kbd>⌘,</kbd>
        </button>
        <div className={status.tone === 'ok' ? 'status4' : `status4 ${status.tone}`} role="status">
          <i />
          <span>{status.text}</span>
          {status.progress !== undefined && (
            <div className="pb">
              <i style={{ width: `${Math.round(status.progress * 1000) / 10}%` }} />
            </div>
          )}
        </div>
      </div>
      {menu && menuCompany && <Menu label={`${menuCompany.ticker} report`} at={menu.at} entries={companyEntries(menuCompany)} onClose={() => setMenu(null)} />}
      {menu && menuHidden && <Menu label={`Hidden ${menuHidden.ticker ?? ''} report`} at={menu.at} entries={hiddenEntries(menuHidden)} onClose={() => setMenu(null)} />}
      {sortShown && <Menu label="Sort and filter" at={menu.at} entries={sortEntries()} onClose={() => setMenu(null)} />}
    </aside>
  )
}
