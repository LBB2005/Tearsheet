// The stock menu (stock/menu.ts) for the whole window: App puts one StockMenuProvider round the
// app, and any row, card or chip that shows a company asks for it with useStockMenu's bind, which
// opens it on a right-click, on the context-menu key or on ⇧F10 (below the row). There is only ever
// one open. It reads the watchlists each time it opens, so a tick here matches the Watchlist page,
// and its watchlist options write through the same calls as that page, with the same Undo.

import { createContext, useCallback, useContext, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'

import type { CompanyRow, LineState } from '../../shared/protocol'
import type { Notice } from '../overlays/Toast'
import { Menu } from '../shell/Menu'
import type { Refreshing } from '../shell/refresh'
import { edgarUrl, stockEntries, stockFacts, type Stock, type StockActions, type StockExtras, type Watched } from './menu'

type At = { left: number; top: number }
// A surface's extras, what to do once the menu closes (the sidebar unmarks its row), and what to
// do once an option is picked (the look-up box closes).
export type StockOptions = StockExtras & { onClose?: () => void; onPick?: () => void }

interface Api {
  open: (stock: Stock, at: At, options?: StockOptions) => void
}

const Ctx = createContext<Api | null>(null)
const UNDO_MS = 8000

export interface StockMenuProviderProps {
  companies: CompanyRow[]
  line: LineState | null
  onOpen: (reportId: string) => void
  // Dig deeper on the company (it has a report, so the engine knows its CIK).
  onDig: (stock: { cik: number; ticker: string }) => void
  // Refresh report… and Write a report…: the Refresh confirm, then the line.
  onWrite: (asked: Refreshing) => void
  onLog: () => void
  onShowWatch: () => void
  // A watchlist was changed here, so the Watchlist page and the sidebar's count load again.
  onWatchChanged: () => void
  notify: (title: string, text?: string, tone?: Notice['tone'], extra?: Pick<Notice, 'action' | 'ms'>) => void
  children: ReactNode
}

export function StockMenuProvider({ companies, line, onOpen, onDig, onWrite, onLog, onShowWatch, onWatchChanged, notify, children }: StockMenuProviderProps) {
  const [opened, setOpened] = useState<{ n: number; stock: Stock; at: At; options: StockOptions } | null>(null)
  const [watched, setWatched] = useState<Watched | null>(null)
  const count = useRef(0)

  const loadWatch = useCallback(() => {
    void window.tearsheet.getWatchlist().then(
      (r) => {
        if (r.ok && r.result) setWatched({ lists: r.result.lists, rows: r.result.rows })
        else setWatched((w) => w ?? { lists: [], rows: [] })
      },
      () => setWatched((w) => w ?? { lists: [], rows: [] })
    )
  }, [])

  const open = useCallback(
    (stock: Stock, at: At, options: StockOptions = {}) => {
      count.current += 1
      setOpened({ n: count.current, stock, at, options })
      loadWatch()
    },
    [loadWatch]
  )
  const api = useMemo(() => ({ open }), [open])

  let menu: ReactNode = null
  if (opened) {
    const { stock, options } = opened
    const { ticker } = stock
    const facts = stockFacts(stock, companies, line, watched)
    const changed = () => {
      loadWatch()
      onWatchChanged()
    }
    const picked = <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => {
      options.onPick?.()
      fn(...args)
    }
    const actions: StockActions = {
      open: onOpen,
      dig: () => (facts.cik === null ? notify('Couldn’t open Dig deeper', 'Tearsheet doesn’t know this company’s SEC number yet.', 'stop') : onDig({ cik: facts.cik, ticker })),
      write: () => onWrite({ ticker, created_at: facts.latest }),
      watch: (listId) =>
        void window.tearsheet.addToWatchlist(listId, [ticker]).then((r) => {
          if (!r.ok || !r.result) return notify('Couldn’t add it to the watchlist', r.error?.message, 'stop')
          changed()
          if (r.result.added.length) notify(`Added ${ticker} to ${r.result.list.name}`, undefined, undefined, { action: { label: 'Show', run: onShowWatch } })
          else notify(`${ticker} is already in ${r.result.list.name}`, r.result.skipped.map((s) => s.reason).join(' ') || undefined)
        }),
      unwatch: (list) => {
        if (facts.cik === null) return
        void window.tearsheet.removeFromWatchlist(list.list_id, [facts.cik]).then((r) => {
          if (!r.ok || !r.result) return notify('Couldn’t take it out', r.error?.message, 'stop')
          changed()
          const items = r.result.removed
          notify(`Took ${ticker} out of ${list.name}`, undefined, undefined, {
            action: { label: 'Undo', run: () => void (items.length ? window.tearsheet.restoreWatchItems(list.list_id, items).then(changed) : undefined) },
            ms: UNDO_MS
          })
        })
      },
      log: onLog,
      copy: () => void window.tearsheet.copyTicker(ticker).then((done) => (done ? notify(`Copied ${ticker}`) : notify('Couldn’t copy the ticker', undefined, 'stop'))),
      edgar: () => void window.tearsheet.openExternal(edgarUrl({ ticker, cik: facts.cik })).then((done) => done || notify('Couldn’t open SEC EDGAR', undefined, 'stop'))
    }
    const entries = stockEntries(
      stock,
      facts,
      {
        open: picked(actions.open),
        dig: picked(actions.dig),
        write: picked(actions.write),
        watch: picked(actions.watch),
        unwatch: picked(actions.unwatch),
        log: picked(actions.log),
        copy: picked(actions.copy),
        edgar: picked(actions.edgar)
      },
      options
    )
    menu = (
      <Menu
        key={opened.n}
        label={`${ticker} options`}
        at={opened.at}
        entries={entries}
        onClose={() => {
          setOpened((o) => (o && o.n === opened.n ? null : o))
          options.onClose?.()
        }}
      />
    )
  }

  return (
    <Ctx.Provider value={api}>
      {children}
      {menu}
    </Ctx.Provider>
  )
}

// Whether a key press asks for a context menu: the context-menu key, or ⇧F10.
export const menuKey = (e: Pick<KeyboardEvent, 'key' | 'shiftKey'>) => e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)

export interface StockMenu {
  // Opens the menu at a point (a "…" button's, say).
  open: (stock: Stock, at: At, options?: StockOptions) => void
  // Opens it below an element.
  openBelow: (stock: Stock, el: Element, options?: StockOptions) => void
  // The handlers that open it on a row: a right-click there, or the context-menu key or ⇧F10 while
  // the focus is on it or inside it. Without a provider (a page drawn on its own), they do nothing.
  bind: (stock: Stock, options?: StockOptions) => { onContextMenu: (e: MouseEvent) => void; onKeyDown: (e: KeyboardEvent) => void }
}

export function useStockMenu(): StockMenu {
  const api = useContext(Ctx)
  return useMemo(() => {
    const open = (stock: Stock, at: At, options?: StockOptions) => api?.open(stock, at, options)
    const openBelow = (stock: Stock, el: Element, options?: StockOptions) => {
      const r = el.getBoundingClientRect()
      open(stock, { left: r.left, top: r.bottom + 4 }, options)
    }
    return {
      open,
      openBelow,
      bind: (stock, options) => ({
        onContextMenu: (e) => {
          if (!api) return
          e.preventDefault()
          e.stopPropagation()
          open(stock, { left: e.clientX, top: e.clientY }, options)
        },
        onKeyDown: (e) => {
          if (!api || !menuKey(e)) return
          e.preventDefault()
          e.stopPropagation()
          openBelow(stock, e.currentTarget, options)
        }
      })
    }
  }, [api])
}
