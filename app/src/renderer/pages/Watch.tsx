// The Watchlist (Liam's pick E of round two, 12 Nov 2026): a row of list tabs; a strip of what
// needs a look; the companies on the left, grouped by list under All watched, each with its range
// bar; and the picked company on the right (price with the report's range ahead, key numbers,
// factors, alerts and a note), or, with 2 to 6 ticked, a chart comparing them with the S&P 500.
// Every number comes from the engine (get_watchlist, engine watchlist.py); alerts arrive as
// watch_changed notes, which App turns into a fresh `refresh`.

import '../watch/watch.css'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import type { CallResult } from '../../preload/api'
import type { FactorItem, PredictionPrices, WatchEvent, WatchItemBack, WatchList, WatchPage, WatchRow } from '../../shared/protocol'
import { ADVICE_SHORT } from '../../shared/wording'
import { CompareChart } from '../log/CompareChart'
import { compareSeries, sinceFor, type CompareRange, type CompareSeries } from '../log/compare'
import { signedPct } from '../log/screen'
import { shortDate } from '../nav'
import type { Notice } from '../overlays/Toast'
import { Spinner } from '../setup/parts'
import { money } from '../shell/Sidebar'
import { PriceChart } from '../watch/PriceChart'
import {
  attention,
  averageSince,
  barSpot,
  flipOf,
  groups,
  isSmart,
  listName,
  liveKey,
  loadKey,
  loadPick,
  needsLook,
  readable,
  rowsOf,
  saveKey,
  savePick,
  SMART,
  toQueue,
  topReason,
  watchCsv,
  watchCsvName,
  type ListKey
} from '../watch/watch'

export interface WatchProps {
  // Changes whenever the watchlist may have changed: an alert check, a finished report, the line.
  refresh: number
  // A company to open, from a Mac notification's click (main/watchAlerts.ts); `n` makes a second
  // click on the same company count.
  focus: { cik: number; n: number } | null
  onOpenReport: (reportId: string) => void
  onNotify: (title: string, text?: string, tone?: Notice['tone'], extra?: Pick<Notice, 'action' | 'ms'>) => void
  // The toolbar's line under the title.
  onSubtitle: (text: string) => void
}

const SPANS: [days: number, label: string][] = [
  [63, '3M'],
  [126, '6M'],
  [252, '1Y']
]
const UNCERTAINTY: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', very_high: 'Very high', extreme: 'Extreme' }
const UNDO_MS = 8000
const answerOf = <T,>(r: CallResult<T>) => (r.ok ? (r.result as T) : null)
const why = (r: CallResult<unknown>) => r.error?.message || 'Tearsheet’s engine didn’t answer.'

function Tag({ rating }: { rating: string | null | undefined }) {
  if (!rating) return <span className="tag4 none">No report</span>
  return <span className={`tag4 ${rating.toLowerCase()}`}>{rating}</span>
}

function Bar({ row }: { row: WatchRow }) {
  const spot = barSpot(row)
  if (!spot) return <span className="wbar empty" aria-hidden="true" />
  const lv = row.levels!
  const label = `Low ${money.format(lv.bear!)}, base ${money.format(lv.base!)}, high ${money.format(lv.bull!)}; now ${money.format(row.price!)}`
  return (
    <span className="wbar" role="img" aria-label={label} title={label}>
      <i className="range" style={{ left: `${spot.bear}%`, width: `${spot.bull - spot.bear}%` }} />
      <i className="base" style={{ left: `${spot.base}%` }} />
      {spot.then !== null && <i className="then" style={{ left: `${spot.then}%` }} />}
      <i className="now" style={{ left: `${spot.now}%` }} />
    </span>
  )
}

export function Watch({ refresh, focus, onOpenReport, onNotify, onSubtitle }: WatchProps) {
  const [page, setPage] = useState<WatchPage | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [tries, setTries] = useState(0)
  const [again, setAgain] = useState(0)
  const [key, setKeyState] = useState<ListKey>(loadKey)
  const [pick, setPickState] = useState<number | null>(loadPick)
  const [ticked, setTicked] = useState<number[]>([])
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const [naming, setNaming] = useState<'new' | 'rename' | null>(null)
  const [nameText, setNameText] = useState('')
  const [adding, setAdding] = useState('')
  const [busy, setBusy] = useState(false)
  const [lists, setListsOpen] = useState(false)
  const [newFor, setNewFor] = useState(false)
  const [queueAsk, setQueueAsk] = useState<{ tickers: string[]; text: string } | null>(null)
  const subtitle = useRef(onSubtitle)
  subtitle.current = onSubtitle
  const reload = useCallback(() => setAgain((n) => n + 1), [])

  useEffect(() => {
    let live = true
    window.tearsheet.getWatchlist().then(
      (r) => {
        if (!live) return
        if (r.ok && r.result) {
          setPage(r.result)
          setFailed(null)
          const c = r.result.counts
          subtitle.current(c.watched ? `${c.watched} watched${c.needs_look ? ` · ${c.needs_look} with new alerts` : ''}${r.result.as_of ? ` · ${shortDate(r.result.as_of)} close` : ''}` : 'Nothing watched yet')
        } else setFailed(why(r))
      },
      (e: unknown) => live && setFailed(e instanceof Error ? e.message : 'Tearsheet’s engine didn’t answer.')
    )
    return () => {
      live = false
    }
  }, [refresh, tries, again])

  const setKey = (k: ListKey) => {
    setKeyState(k)
    saveKey(k)
    setTicked([])
    setNaming(null)
    setQueueAsk(null)
  }
  const setPick = useCallback((cik: number) => {
    setPickState(cik)
    savePick(cik)
    setListsOpen(false)
    setNewFor(false)
  }, [])

  // A Mac notification's click: All watched, on that company.
  useEffect(() => {
    if (!focus) return
    setKeyState('all')
    setPick(focus.cik)
    setTicked([])
  }, [focus, setPick])

  const shownKey = page ? liveKey(page, key) : key
  const rows = useMemo(() => (page ? rowsOf(page, shownKey) : []), [page, shownKey])
  const row = rows.find((r) => r.cik === pick) ?? rows[0] ?? null
  const looks = useMemo(() => attention(rows), [rows])
  const avg = averageSince(rows)
  const compareOn = ticked.length >= 2

  // Seeing a company marks its alerts seen.
  useEffect(() => {
    if (!row || row.unseen === 0) return
    void window.tearsheet.markWatchSeen([row.cik]).then(() => reload())
  }, [row?.cik, row?.unseen, reload]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- writes ----------

  const listId = (): number | null => (typeof shownKey === 'number' ? shownKey : null)

  const add = async () => {
    const text = adding.trim()
    if (!text || busy) return
    setBusy(true)
    const r = await window.tearsheet.addToWatchlist(listId(), text.split(/[\s,]+/).filter(Boolean))
    setBusy(false)
    const a = answerOf(r)
    if (!a) return onNotify('Couldn’t add that', why(r), 'stop')
    setAdding('')
    if (a.added.length) {
      setPick(a.added[0].cik)
      const notes = a.added.map((x) => x.note).filter(Boolean).join(' ')
      onNotify(`Added ${a.added.map((x) => x.ticker).join(', ')} to ${a.list.name}`, [notes, a.skipped.map((s) => s.reason).join(' ')].filter(Boolean).join(' ') || undefined)
    } else if (a.skipped.length) onNotify('Nothing added', a.skipped.map((s) => s.reason).join(' '), 'stop')
    if (typeof shownKey !== 'number' && shownKey !== 'all') setKey(a.list.list_id)
    reload()
  }

  const saveName = async () => {
    const name = nameText.trim()
    if (!name) return setNaming(null)
    const r = naming === 'rename' && typeof shownKey === 'number' ? await window.tearsheet.renameWatchlist(shownKey, name) : await window.tearsheet.createWatchlist(name)
    const l = answerOf(r)
    if (!l) return onNotify(naming === 'rename' ? 'Couldn’t rename the list' : 'Couldn’t make the list', why(r), 'stop')
    setNaming(null)
    if (naming === 'new') setKey(l.list_id)
    reload()
  }

  const newListWith = async (cik: number) => {
    const name = nameText.trim()
    if (!name) return setNewFor(false)
    const made = answerOf(await window.tearsheet.createWatchlist(name))
    const r = row
    if (!made || !r) return onNotify('Couldn’t make the list', undefined, 'stop')
    await window.tearsheet.addToWatchlist(made.list_id, [r.ticker])
    setNewFor(false)
    setNameText('')
    onNotify(`Made “${made.name}” with ${r.ticker}`)
    void cik
    reload()
  }

  const deleteList = async (l: WatchList) => {
    const r = await window.tearsheet.deleteWatchlist(l.list_id)
    const d = answerOf(r)
    if (!d) return onNotify('Couldn’t delete the list', why(r), 'stop')
    setKey('all')
    reload()
    let undone = false
    const timer = window.setTimeout(() => {
      if (!undone) void window.tearsheet.eraseWatchlist(l.list_id)
    }, UNDO_MS + 500)
    const leaving = d.leaving.length
    onNotify(
      `Deleted “${l.name}”`,
      leaving ? `${leaving} ${leaving === 1 ? 'company was' : 'companies were'} only in it and leave the watchlist; notes are kept for when they come back.` : 'Its companies are still in your other lists.',
      undefined,
      {
        action: {
          label: 'Undo',
          run: () => {
            undone = true
            window.clearTimeout(timer)
            void window.tearsheet.restoreWatchlist(l.list_id).then(() => {
              setKey(l.list_id)
              reload()
            })
          }
        },
        ms: UNDO_MS
      }
    )
  }

  const takeOut = async (l: WatchList, r: WatchRow) => {
    const res = await window.tearsheet.removeFromWatchlist(l.list_id, [r.cik])
    const back = answerOf(res)
    if (!back) return onNotify('Couldn’t take it out', why(res), 'stop')
    reload()
    const items: WatchItemBack[] = back.removed
    const elsewhere = r.lists.filter((id) => id !== l.list_id).length
    onNotify(`Took ${r.ticker} out of ${l.name}`, elsewhere ? 'Still in your other lists.' : 'It’s no longer watched; its note is kept.', undefined, {
      action: {
        label: 'Undo',
        run: () => {
          if (items.length) void window.tearsheet.restoreWatchItems(l.list_id, items).then(reload)
        }
      },
      ms: UNDO_MS
    })
  }

  const toggleIn = async (l: WatchList, r: WatchRow) => {
    if (r.lists.includes(l.list_id)) return takeOut(l, r)
    const res = await window.tearsheet.addToWatchlist(l.list_id, [r.ticker])
    if (!res.ok) onNotify('Couldn’t add it', why(res), 'stop')
    reload()
  }

  const stopWatching = async (r: WatchRow) => {
    if (!page) return
    const taken: [number, WatchItemBack[]][] = []
    for (const id of r.lists) {
      const back = answerOf(await window.tearsheet.removeFromWatchlist(id, [r.cik]))
      if (back) taken.push([id, back.removed])
    }
    setListsOpen(false)
    reload()
    onNotify(`Stopped watching ${r.ticker}`, 'Its reports stay in the sidebar, and its note is kept.', undefined, {
      action: { label: 'Undo', run: () => void Promise.all(taken.map(([id, items]) => window.tearsheet.restoreWatchItems(id, items))).then(reload) },
      ms: UNDO_MS
    })
  }

  const setAlert = async (r: WatchRow, change: { range?: boolean; trigger?: boolean; move?: number; age?: boolean }) => {
    const res = await window.tearsheet.setWatchAlerts([r.cik], change)
    if (!res.ok) onNotify('Couldn’t change the alert', why(res), 'stop')
    reload()
  }

  // Queue reports: ask the line first (it changes nothing), then add on Yes.
  const askQueue = async () => {
    const tickers = toQueue(rows).map((r) => r.ticker)
    if (!tickers.length) return onNotify('Nothing to queue', 'Every company here has a report from the last 30 days or is already in the line.')
    const plan = answerOf(await window.tearsheet.planLine(tickers, { skipRecent: true }))
    if (!plan) return onNotify('The report line didn’t answer', undefined, 'stop')
    const n = plan.items.length
    const official = plan.items.filter((i) => i.official).length
    if (!n) return onNotify('Nothing to queue', plan.skipped.map((s) => s.reason).join(' ') || undefined)
    setQueueAsk({
      tickers: plan.items.map((i) => i.ticker),
      text: `${n} ${n === 1 ? 'report' : 'reports'}, ${official} as official ${official === 1 ? 'prediction' : 'predictions'}${plan.skipped.length ? `; ${plan.skipped.length} left out` : ''}.`
    })
  }
  const queue = async () => {
    if (!queueAsk) return
    const r = await window.tearsheet.addToLine(queueAsk.tickers)
    setQueueAsk(null)
    if (!r.ok) return onNotify('Couldn’t add to the report line', why(r), 'stop')
    onNotify(`Added ${queueAsk.tickers.length} to the report line`, 'They’re written one after another; the sidebar shows progress.')
    reload()
  }

  const exportCsv = async () => {
    if (!page) return
    const r = await window.tearsheet.saveCsv(watchCsvName(listName(page, shownKey)), watchCsv(rows, page.lists))
    if (r.ok) onNotify(`Saved ${r.name}`, 'In your Downloads folder.', undefined, { action: { label: 'Show in Finder', run: () => void window.tearsheet.showDownload(r.path) } })
    else onNotify('Couldn’t save the CSV', r.message, 'stop')
  }

  const onListKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const at = rows.findIndex((r) => r.cik === row?.cik)
    const next = rows[at + (e.key === 'ArrowDown' ? 1 : -1)]
    if (next) {
      setPick(next.cik)
      ;(document.querySelector(`.watchv [data-cik="${next.cik}"]`) as HTMLElement | null)?.focus()
    }
  }

  // ---------- drawing ----------

  if (failed && !page)
    return (
      <div className="panels watchv">
        <div className="notice error lfail">
          <span>The watchlist didn’t load: {failed}</span>
          <button className="btn2" onClick={() => setTries((n) => n + 1)}>
            Try again
          </button>
        </div>
      </div>
    )
  if (!page)
    return (
      <div className="panels watchv">
        <p className="loading fine">
          <Spinner />
          Loading the watchlist…
        </p>
      </div>
    )

  const current = typeof shownKey === 'number' ? page.lists.find((l) => l.list_id === shownKey) ?? null : null
  const queueN = toQueue(rows).length
  const nameField = (onSave: () => void, label: string) => (
    <span className="inl">
      <input
        className="textfield"
        autoFocus
        aria-label={label}
        placeholder="List name"
        maxLength={60}
        value={nameText}
        onChange={(e) => setNameText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void onSave()
          if (e.key === 'Escape') {
            setNaming(null)
            setNewFor(false)
          }
        }}
      />
      <button className="btn2 sm" onClick={() => void onSave()}>
        {naming === 'rename' ? 'Save' : 'Make list'}
      </button>
      <button
        className="btn2 sm quiet"
        onClick={() => {
          setNaming(null)
          setNewFor(false)
        }}
      >
        Cancel
      </button>
    </span>
  )

  const rowButton = (r: WatchRow, group: string) => (
    <div className={`wrow${r.cik === row?.cik && !compareOn ? ' on' : ''}`} key={`${group}:${r.cik}`}>
      <input
        type="checkbox"
        aria-label={`Compare ${r.ticker}`}
        checked={ticked.includes(r.cik)}
        disabled={!ticked.includes(r.cik) && ticked.length >= 6}
        onChange={() => setTicked((t) => (t.includes(r.cik) ? t.filter((c) => c !== r.cik) : [...t, r.cik]))}
      />
      <button data-cik={r.cik} onClick={() => setPick(r.cik)} title={readable(topReason(r)?.text ?? '') || undefined}>
        <b>
          {r.ticker}
          {needsLook(r) && <i className={r.unseen ? 'dot new' : 'dot'} aria-label={r.unseen ? 'New alert' : 'Needs a look'} />}
        </b>
        <Bar row={r} />
        <span className="px">{r.price === null ? '—' : money.format(r.price)}</span>
        <span className={`chg ${r.since_report === null ? '' : r.since_report >= 0 ? 'up' : 'down'}`}>{r.since_report === null ? '' : signedPct(r.since_report, 1)}</span>
        {r.queued ? <span className="tag4 none">{r.queued === 'writing' ? 'Writing' : 'Queued'}</span> : <Tag rating={r.levels?.rating} />}
      </button>
    </div>
  )

  const listColumn = (
    <section className="glass wlist" aria-label={listName(page, shownKey)} onKeyDown={onListKey}>
      {ticked.length ? (
        <div className="selbar4">
          <span>
            {ticked.length} ticked{ticked.length < 2 ? ': tick one more to compare' : ''}
          </span>
          <button onClick={() => setTicked([])}>Clear</button>
        </div>
      ) : (
        <p className="hint">Tick 2 to 6 to compare them.</p>
      )}
      {rows.length === 0 ? (
        <div className="empty">
          <b>{shownKey === 'look' ? 'Nothing needs a look.' : shownKey === 'norep' ? 'Every company here has a report.' : 'Nothing here yet.'}</b>
          <span>{isSmart(shownKey) && shownKey !== 'all' ? 'This list fills itself.' : 'Add a ticker with the box above.'}</span>
        </div>
      ) : shownKey === 'all' ? (
        groups(page).map((g) => {
          const id = String(g.id)
          const shut = folded.has(id)
          return (
            <div key={id} className="wgroup">
              <button
                className="gh"
                aria-expanded={!shut}
                onClick={() => setFolded((f) => (f.has(id) ? new Set([...f].filter((x) => x !== id)) : new Set([...f, id])))}
              >
                <span>
                  {shut ? '▸' : '▾'} {g.name}
                </span>
                <em>{g.rows.length}</em>
              </button>
              {!shut && g.rows.map((r) => rowButton(r, id))}
            </div>
          )
        })
      ) : (
        rows.map((r) => rowButton(r, 'l'))
      )}
    </section>
  )

  return (
    <div className="panels watchv">
      <nav className="wtabs" aria-label="Watchlists">
        {[SMART[0], ...page.lists.map((l) => [l.list_id, l.name] as [ListKey, string])].map(([k, label]) => {
          const n = rowsOf(page, k).length
          const flagged = rowsOf(page, k).some(needsLook)
          return (
            <button key={String(k)} className={`wtab${shownKey === k ? ' on' : ''}`} aria-current={shownKey === k ? 'page' : undefined} onClick={() => setKey(k)}>
              {label}
              <em>{n}</em>
              {flagged && k !== 'all' && <i className="dot" aria-label="Something needs a look" />}
            </button>
          )
        })}
        <span className="sep" />
        {SMART.slice(1).map(([k, label]) => (
          <button key={k} className={`wtab smart${shownKey === k ? ' on' : ''}`} aria-current={shownKey === k ? 'page' : undefined} onClick={() => setKey(k)}>
            {label}
            <em>{rowsOf(page, k).length}</em>
          </button>
        ))}
        <span className="sep" />
        {naming === 'new' ? (
          nameField(saveName, 'New list name')
        ) : (
          <button
            className="wtab"
            onClick={() => {
              setNameText('')
              setNaming('new')
            }}
          >
            + New list
          </button>
        )}
      </nav>

      {page.prices_note && <p className="notice">{page.prices_note}</p>}

      {looks.length > 0 ? (
        <div className="attn" role="region" aria-label="Needs a look">
          <b>
            {looks.length} {looks.length === 1 ? 'needs' : 'need'} a look
          </b>
          {looks.slice(0, 6).map(({ row: r, reason }) => (
            <button key={r.cik} onClick={() => setPick(r.cik)} className={r.unseen ? 'new' : ''}>
              <b>{r.ticker}</b> {readable(reason?.text ?? '')}
            </button>
          ))}
          {looks.length > 6 && <button onClick={() => setKey('look')}>and {looks.length - 6} more</button>}
        </div>
      ) : (
        rows.length > 0 && <p className="attn ok">Nothing here needs a look today.</p>
      )}

      <div className="whead">
        {naming === 'rename' ? (
          nameField(saveName, 'List name')
        ) : (
          <h3>{listName(page, shownKey)}</h3>
        )}
        <span className="meta">
          {rows.length} {rows.length === 1 ? 'company' : 'companies'}
          {avg !== null && (
            <>
              {' '}
              · average since report <b className={avg >= 0 ? 'up' : 'down'}>{signedPct(avg, 1)}</b>
            </>
          )}
        </span>
        <span className="grow" />
        <span className="find4 wadd">
          <input
            aria-label="Add a ticker"
            placeholder={`Add to ${current ? current.name : page.lists[0]?.name ?? 'Watchlist'}`}
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
          />
          {busy && <Spinner />}
        </span>
        {queueAsk ? (
          <span className="confirm">
            <span>{queueAsk.text}</span>
            <button className="btn2 sm primary2" onClick={() => void queue()}>
              Add to the line
            </button>
            <button className="btn2 sm quiet" onClick={() => setQueueAsk(null)}>
              Cancel
            </button>
          </span>
        ) : (
          <button className="btn2 sm" disabled={queueN === 0} onClick={() => void askQueue()} title="Companies with no report, or whose next report would be an official prediction">
            Queue {queueN ? `${queueN} ` : ''}
            {queueN === 1 ? 'report' : 'reports'}
          </button>
        )}
        <button className="btn2 sm quiet" disabled={!rows.length} onClick={() => void exportCsv()}>
          Export CSV
        </button>
        {current && naming !== 'rename' && (
          <>
            <button
              className="btn2 sm quiet"
              onClick={() => {
                setNameText(current.name)
                setNaming('rename')
              }}
            >
              Rename
            </button>
            <button className="btn2 sm danger" onClick={() => void deleteList(current)}>
              Delete list
            </button>
          </>
        )}
      </div>

      {page.rows.length === 0 ? (
        <section className="glass p wfirst">
          <h4>
            <span>Start a watchlist</span>
          </h4>
          <p>Type tickers in the box above (MU, AMD…) to follow their price against each report’s low, base and high, and hear when one crosses a line. Companies with no report yet can be watched too.</p>
          <p className="fine">{ADVICE_SHORT}</p>
        </section>
      ) : (
        <div className="wsplit">
          {listColumn}
          {compareOn ? (
            <Compare rows={page.rows.filter((r) => ticked.includes(r.cik))} order={ticked} onClear={() => setTicked([])} />
          ) : row ? (
            <Detail
              key={row.cik}
              row={row}
              lists={page.lists}
              listsOpen={lists}
              onListsOpen={setListsOpen}
              newFor={newFor}
              onNewFor={(on) => {
                setNameText('')
                setNewFor(on)
              }}
              newField={nameField(() => newListWith(row.cik), 'New list name')}
              onToggleIn={(l) => void toggleIn(l, row)}
              onTakeOut={(l) => void takeOut(l, row)}
              onStop={() => void stopWatching(row)}
              onAlert={(c) => void setAlert(row, c)}
              onOpenReport={onOpenReport}
              onQueue={() => {
                setQueueAsk(null)
                void window.tearsheet.planLine([row.ticker], { skipRecent: false }).then((p) => {
                  const plan = answerOf(p)
                  if (plan?.items.length)
                    setQueueAsk({ tickers: [row.ticker], text: `${row.ticker}: ${plan.items[0].official ? 'an official prediction' : 'a report, not an official prediction (one was made in the last 30 days)'}.` })
                  else onNotify('Can’t queue it', plan?.skipped.map((s) => s.reason).join(' '), 'stop')
                })
              }}
              onSaved={reload}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}

// ---------- the picked company ----------

interface DetailProps {
  row: WatchRow
  lists: WatchList[]
  listsOpen: boolean
  onListsOpen: (open: boolean) => void
  newFor: boolean
  onNewFor: (on: boolean) => void
  newField: React.ReactNode
  onToggleIn: (l: WatchList) => void
  onTakeOut: (l: WatchList) => void
  onStop: () => void
  onAlert: (change: { range?: boolean; trigger?: boolean; move?: number; age?: boolean }) => void
  onOpenReport: (reportId: string) => void
  onQueue: () => void
  onSaved: () => void
}

function Detail({ row, lists, listsOpen, onListsOpen, newFor, onNewFor, newField, onToggleIn, onTakeOut, onStop, onAlert, onOpenReport, onQueue, onSaved }: DetailProps) {
  const lv = row.levels
  const [span, setSpan] = useState(252)
  const [series, setSeries] = useState<{ dates: string[]; close: number[] } | null>(null)
  const [factors, setFactors] = useState<FactorItem[] | null>(null)
  const [events, setEvents] = useState<WatchEvent[]>([])
  const [note, setNote] = useState(row.note)
  const [noteSaved, setNoteSaved] = useState<string | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)
  const reportId = lv?.report_id ?? null

  useEffect(() => {
    let live = true
    setSeries(null)
    const since = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10)
    const load = reportId
      ? window.tearsheet.getChart(reportId).then((r) => (r.ok && r.result ? { dates: r.result.dates, close: r.result.close } : null))
      : window.tearsheet.watchPrices(row.cik, since).then((r) => (r.ok && r.result ? r.result : null))
    load.then(
      (s) => live && setSeries(s ?? { dates: [], close: [] }),
      () => live && setSeries({ dates: [], close: [] })
    )
    if (reportId)
      window.tearsheet.getReportNumbers(reportId).then(
        (r) => live && setFactors(r.ok && r.result ? r.result.factors : null),
        () => live && setFactors(null)
      )
    window.tearsheet.watchEvents(row.cik, 6).then(
      (r) => live && setEvents(r.ok && r.result ? r.result : []),
      () => undefined
    )
    return () => {
      live = false
    }
  }, [row.cik, reportId, row.unseen])

  const saveNote = (text: string) => {
    window.clearTimeout(saveTimer.current)
    void window.tearsheet.setWatchNote(row.cik, text).then((r) => {
      if (r.ok) {
        setNoteSaved('Saved')
        onSaved()
      } else setNoteSaved('Not saved: ' + (r.error?.message ?? 'the engine didn’t answer'))
    })
  }
  useEffect(() => () => window.clearTimeout(saveTimer.current), [])

  const flip = flipOf(row)
  const inLists = lists.filter((l) => row.lists.includes(l.list_id))
  const day = row.price !== null && row.previous_close ? row.price / row.previous_close - 1 : null

  return (
    <section className="wdet" aria-label={`${row.ticker}, ${row.name}`}>
      <div className="dhead">
        <h3>{row.ticker}</h3>
        <span className="nm">{row.name}</span>
        <Tag rating={lv?.rating} />
        {lv?.capped && <span className="pill hold" title="A red flag holds the rating at Hold">Capped</span>}
        <span className="grow" />
        <span className="big">{row.price === null ? '—' : money.format(row.price)}</span>
        {day !== null && <span className={day >= 0 ? 'up' : 'down'}>{signedPct(day, 1)}</span>}
        {row.price_date && <span className="mut">{shortDate(row.price_date)} close{row.stale ? ' (old)' : ''}</span>}
      </div>

      <div className="mem">
        <span className="mut">In</span>
        {inLists.length ? (
          inLists.map((l) => (
            <span className="mchip" key={l.list_id}>
              {l.name}
              <button aria-label={`Take ${row.ticker} out of ${l.name}`} onClick={() => onTakeOut(l)}>
                ×
              </button>
            </span>
          ))
        ) : (
          <span className="mut">no list</span>
        )}
        <span className="relw">
          <button className="link" aria-expanded={listsOpen} onClick={() => onListsOpen(!listsOpen)}>
            + Add to a list
          </button>
          {listsOpen && (
            <div className="wpop" role="dialog" aria-label={`Lists for ${row.ticker}`} onKeyDown={(e) => e.key === 'Escape' && onListsOpen(false)}>
              <span className="mh">Lists for {row.ticker}</span>
              {lists.map((l) => (
                <label key={l.list_id}>
                  <input type="checkbox" checked={row.lists.includes(l.list_id)} onChange={() => onToggleIn(l)} />
                  {l.name}
                  <em>{l.count}</em>
                </label>
              ))}
              <span className="sepl" />
              {newFor ? newField : <button onClick={() => onNewFor(true)}>New list with {row.ticker}</button>}
              <span className="sepl" />
              <button className="danger" onClick={onStop}>
                Stop watching {row.ticker}
              </button>
            </div>
          )}
        </span>
        {row.queued && <span className="pill run">{row.queued === 'writing' ? 'Being written now' : 'In the report line'}</span>}
      </div>

      {row.reasons.length > 0 && (
        <ul className="reasons">
          {row.reasons.map((r) => (
            <li key={r.kind} className={r.kind}>
              {readable(r.text)}
            </li>
          ))}
        </ul>
      )}

      <div className="glass p">
        <h4>
          <span>{lv?.bear != null ? 'Price, then the report’s 12-month range' : 'Price'}</span>
          <span className="segc" role="group" aria-label="How far back">
            {SPANS.map(([d, label]) => (
              <button key={d} className={span === d ? 'on' : ''} aria-pressed={span === d} onClick={() => setSpan(d)}>
                {label}
              </button>
            ))}
          </span>
        </h4>
        {series === null ? (
          <p className="loading fine wchartwait">
            <Spinner />
            Loading prices…
          </p>
        ) : (
          <PriceChart row={row} dates={series.dates} close={series.close} span={span} />
        )}
      </div>

      {lv ? (
        <div className="wgrid">
          <div className="glass p">
            <h4>
              <span>Key numbers</span>
              {reportId && (
                <button className="link" onClick={() => onOpenReport(reportId)}>
                  Open report
                </button>
              )}
            </h4>
            <dl className="kv">
              <dt>Base case</dt>
              <dd>
                {lv.base === null ? '—' : money.format(lv.base)} {row.to_base !== null && <small className={row.to_base >= 0 ? 'up' : 'down'}>{signedPct(row.to_base, 0)}</small>}
              </dd>
              <dt>Low – high</dt>
              <dd>{lv.bear === null || lv.bull === null ? '—' : `${money.format(lv.bear)} – ${money.format(lv.bull)}`}</dd>
              <dt>Since the report{lv.report_price !== null ? ` (${money.format(lv.report_price)})` : ''}</dt>
              <dd className={row.since_report === null ? '' : row.since_report >= 0 ? 'up' : 'down'}>{signedPct(row.since_report, 1)}</dd>
              <dt>Score · uncertainty</dt>
              <dd>
                {lv.score_percentile ?? '—'} · {lv.uncertainty ? UNCERTAINTY[lv.uncertainty] ?? lv.uncertainty : '—'}
              </dd>
              <dt>Rating changes at</dt>
              <dd>{flip ? `${flip.above ? 'above' : 'below'} ${money.format(flip.price)} → ${flip.to}` : lv.rating ? 'not by price alone' : '—'}</dd>
              <dt>Report</dt>
              <dd>
                {shortDate(lv.report_date)}
                {lv.official ? ', official' : ''}
              </dd>
              <dt>Next official prediction</dt>
              <dd>{row.slot_open ? 'now' : row.official_from ? `from ${shortDate(row.official_from)}` : '—'}</dd>
            </dl>
            <p className="fine">
              <button className="link" onClick={onQueue} disabled={row.queued !== null}>
                {row.slot_open ? 'Queue a new report (official)' : 'Queue a new report'}
              </button>
            </p>
          </div>

          <div className="glass p">
            <h4>
              <span>Six factors</span>
              <span className="mut">percentile among peers</span>
            </h4>
            {factors === null ? (
              <p className="fine">{reportId ? 'Not stored for this report.' : 'No report on show.'}</p>
            ) : (
              <div className="wfbars">
                {factors.map((f) => (
                  <div className="wfbar" key={f.name} title={f.readout}>
                    <span>{f.name}</span>
                    <i>
                      <s style={{ width: `${f.percentile}%` }} />
                    </i>
                    <small>{f.percentile}</small>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass p">
            <h4>
              <span>Tell me when</span>
              <span className="mut">for {row.ticker}, in every list</span>
            </h4>
            <div className="alerts">
              <label>
                <input type="checkbox" checked={row.alerts.range} onChange={(e) => onAlert({ range: e.target.checked })} />
                <span>
                  It closes outside the low–high range
                  <small>{lv.bear !== null && lv.bull !== null ? `below ${money.format(lv.bear)} or above ${money.format(lv.bull)}` : 'no range in this report'}</small>
                </span>
              </label>
              <label>
                <input type="checkbox" checked={row.alerts.trigger} onChange={(e) => onAlert({ trigger: e.target.checked })} />
                <span>
                  It crosses the rating-change price
                  <small>{flip ? `${flip.above ? 'above' : 'below'} ${money.format(flip.price)}, holding the score and peers fixed` : 'none the price can reach'}</small>
                </span>
              </label>
              <label>
                <input type="checkbox" checked={row.alerts.move !== null && row.alerts.move > 0} onChange={(e) => onAlert({ move: e.target.checked ? 0.1 : 0 })} />
                <span>
                  It moves {Math.round((row.alerts.move ?? 0.1) * 100)}% from the report’s price
                  <small>{lv.report_price !== null ? `${money.format(lv.report_price * (1 - (row.alerts.move ?? 0.1)))} or ${money.format(lv.report_price * (1 + (row.alerts.move ?? 0.1)))}` : ''}</small>
                </span>
              </label>
              <label>
                <input type="checkbox" checked={row.alerts.age} onChange={(e) => onAlert({ age: e.target.checked })} />
                <span>
                  A new report would be an official prediction
                  <small>{row.official_from ? `from ${shortDate(row.official_from)}` : '30 days after the last one'}</small>
                </span>
              </label>
            </div>
            <p className="fine">Checked on each day’s close while Tearsheet is open; ⌘W keeps it open.</p>
          </div>

          <div className="glass p">
            <h4>
              <span>My note</span>
              <span className="mut">{noteSaved ?? 'kept on this Mac'}</span>
            </h4>
            <textarea
              className="wnote"
              aria-label={`Note on ${row.ticker}`}
              placeholder={`Why am I watching ${row.ticker}?`}
              maxLength={10000}
              value={note}
              onChange={(e) => {
                const text = e.target.value
                setNote(text)
                setNoteSaved(null)
                window.clearTimeout(saveTimer.current)
                saveTimer.current = window.setTimeout(() => saveNote(text), 800)
              }}
              onBlur={() => note !== row.note && saveNote(note)}
            />
            {events.length > 0 && (
              <>
                <h4 className="evh">
                  <span>Recent alerts</span>
                </h4>
                <ul className="events">
                  {events.map((e) => (
                    <li key={e.event_id}>
                      <span className="mut">{shortDate(e.close_date)}</span> {readable(e.text)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="glass p">
          <div className="empty">
            <b>{row.ticker} has no report yet.</b>
            <span>{row.queued ? 'It’s in the report line. Its first report will be an official prediction.' : 'Queue one to get a rating, a base case and a range. Its first report is an official prediction.'}</span>
          </div>
          {!row.queued && (
            <p>
              <button className="btn2" onClick={onQueue}>
                Queue a report
              </button>
            </p>
          )}
          <h4>
            <span>My note</span>
          </h4>
          <textarea
            className="wnote"
            aria-label={`Note on ${row.ticker}`}
            placeholder={`Why am I watching ${row.ticker}?`}
            value={note}
            onChange={(e) => {
              const text = e.target.value
              setNote(text)
              window.clearTimeout(saveTimer.current)
              saveTimer.current = window.setTimeout(() => saveNote(text), 800)
            }}
          />
        </div>
      )}
    </section>
  )
}

// ---------- 2 to 6 ticked: the Prediction log's compare chart ----------

function Compare({ rows, order, onClear }: { rows: WatchRow[]; order: number[]; onClear: () => void }) {
  const [range, setRange] = useState<CompareRange>('3M')
  const [prices, setPrices] = useState<{ key: string; data: PredictionPrices | null } | null>(null)
  const drawnLast = useRef<CompareSeries | null>(null)
  const picks = useMemo(
    () =>
      order
        .map((cik) => rows.find((r) => r.cik === cik))
        .filter((r): r is WatchRow => !!r)
        .map((r) => ({ cik: r.cik, ticker: r.ticker, run_at: r.levels?.report_date ?? new Date().toISOString().slice(0, 10) })),
    [rows, order]
  )
  const since = sinceFor(picks)
  const key = `${picks.map((p) => p.cik).join(',')}@${since}`
  useEffect(() => {
    let live = true
    window.tearsheet.predictionPrices(picks.map((p) => p.cik), since).then(
      (r) => live && setPrices({ key, data: r.ok && r.result ? r.result : null }),
      () => live && setPrices({ key, data: null })
    )
    return () => {
      live = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const fresh = prices?.key === key
  const series = fresh ? compareSeries(prices?.data ?? null, picks, range) : drawnLast.current
  if (fresh && series) drawnLast.current = series
  const byCik = new Map(rows.map((r) => [r.cik, r]))
  return (
    <section className="wdet" aria-label="Comparing">
      <div className="dhead">
        <h3>Comparing {picks.length}</h3>
        <span className="nm">{picks.map((p) => p.ticker).join(', ')}</span>
        <span className="grow" />
        <button className="btn2 sm quiet" onClick={onClear}>
          Back to one company
        </button>
      </div>
      <div className="logv">
        {series ? (
          <CompareChart series={series} range={range} loading={!fresh} stale={!fresh} picked={picks.length} onRange={setRange} onRemove={() => undefined} />
        ) : (
          <p className="loading fine">
            <Spinner />
            Loading prices…
          </p>
        )}
      </div>
      <div className="glass p">
        <table className="t compact">
          <thead>
            <tr>
              <th>Company</th>
              <th>Rating</th>
              <th className="r">Since report</th>
              <th className="r">To base</th>
              <th>Range</th>
              <th className="r">Rating changes at</th>
            </tr>
          </thead>
          <tbody>
            {picks.map((p) => {
              const r = byCik.get(p.cik)!
              const flip = flipOf(r)
              return (
                <tr key={p.cik}>
                  <td className="tk">{r.ticker}</td>
                  <td>
                    <Tag rating={r.levels?.rating} />
                  </td>
                  <td className={`r ${r.since_report === null ? '' : r.since_report >= 0 ? 'up' : 'down'}`}>{signedPct(r.since_report, 1)}</td>
                  <td className={`r ${r.to_base === null ? '' : r.to_base >= 0 ? 'up' : 'down'}`}>{signedPct(r.to_base, 0)}</td>
                  <td>
                    <Bar row={r} />
                  </td>
                  <td className="r">{flip ? `${money.format(flip.price)} → ${flip.to}` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
