// The fake bridge's watchlist (test/bridge.ts): lists and companies kept in memory the way the
// engine keeps them (engine watchlist.py), so the Watchlist page can be tested end to end: add,
// take out and put back, make, rename, delete and bring back a list, notes, alerts and seen.

import type { WatchAdd, WatchCounts, WatchEvent, WatchItemBack, WatchList, WatchPage, WatchRow } from '../../shared/protocol'

const ALERTS = { range: true, trigger: true, move: 0.1, age: true }

const levels = (over: Partial<NonNullable<WatchRow['levels']>>): NonNullable<WatchRow['levels']> => ({
  report_id: 'rep-1',
  report_date: '2026-11-07',
  price_date: '2026-11-06',
  official: true,
  rating: 'Hold',
  capped: false,
  report_price: 100,
  bear: 70,
  base: 110,
  bull: 160,
  buy_trigger: null,
  sell_trigger: null,
  buy_reachable: null,
  sell_reachable: null,
  score_percentile: 50,
  uncertainty: 'high',
  source: 'run',
  ...over
})

const row = (over: Partial<WatchRow>): WatchRow => ({
  cik: 1,
  ticker: 'X',
  name: 'X Inc.',
  sector: 'Information Technology',
  lists: [],
  added_at: '2026-11-12T10:00:00+00:00',
  in_index: true,
  price: 100,
  price_date: '2026-11-11',
  previous_close: 99,
  stale: false,
  levels: null,
  since_report: null,
  to_base: null,
  range_position: null,
  outside: null,
  trigger_side: null,
  official_from: '2026-12-07T06:11:18+00:00',
  slot_open: false,
  report_age_days: 5,
  queued: null,
  note: '',
  alerts: { ...ALERTS },
  unseen: 0,
  reasons: [],
  ...over
})

// The companies the fake knows, by ticker: AMD (Hold, up 23% since its report, with a new
// alert), MU (Buy, near its rating-change price) and LULU (no report yet, in the line).
export const WATCH_ROWS: Record<string, WatchRow> = {
  AMD: row({
    cik: 2488,
    ticker: 'AMD',
    name: 'Advanced Micro Devices',
    price: 552.9,
    previous_close: 515.21,
    levels: levels({ report_id: 'rep-amd', report_price: 449.04, bear: 176.03, base: 394.02, bull: 881.94, sell_trigger: 297.54, sell_reachable: true, buy_reachable: false, score_percentile: 28, uncertainty: 'very_high' }),
    since_report: 0.2313,
    to_base: -0.2874,
    range_position: 0.53,
    unseen: 1,
    reasons: [{ kind: 'moved', text: 'Up 23.1% since the Nov 7 report.' }]
  }),
  MU: row({
    cik: 723125,
    ticker: 'MU',
    name: 'Micron Technology',
    price: 811.3,
    previous_close: 725.11,
    levels: levels({ report_id: 'rep-mu', rating: 'Buy', report_price: 690, bear: 546.13, base: 1311.13, bull: 3147.8, buy_trigger: 2119.78, buy_reachable: true, sell_reachable: false, score_percentile: 96, uncertainty: 'extreme' }),
    since_report: 0.1758,
    to_base: 0.616,
    range_position: 0.1,
    reasons: [{ kind: 'moved', text: 'Up 17.6% since the Nov 8 report.' }]
  }),
  LULU: row({ cik: 1397187, ticker: 'LULU', name: 'Lululemon Athletica', sector: 'Consumer Discretionary', price: 107.45, previous_close: 105, official_from: null, slot_open: true, report_age_days: null, queued: 'waiting', reasons: [{ kind: 'no_report', text: 'No report yet.' }] }),
  TSLA: row({ cik: 1318605, ticker: 'TSLA', name: 'Tesla', price: 390.84, levels: levels({ report_id: 'rep-tsla', rating: 'Sell', report_price: 358.22, bear: 177.4, base: 297.35, bull: 498.3 }), since_report: 0.091, to_base: -0.239 })
}

export const WATCH_EVENTS: WatchEvent[] = [
  { event_id: 1, cik: 2488, ticker: 'AMD', kind: 'move', side: 'up', close_date: '2026-11-11', price: 552.9, level: 493.94, text: 'AMD closed at $552.90, more than 10% above its report’s $449.04.', created_at: '2026-11-11T23:00:00+00:00', seen: false }
]

interface ListRec {
  id: number
  name: string
  ciks: number[]
  added: Map<number, { at: string; as: string }>
  deleted: boolean
}

export function watchStore() {
  let next = 3
  const lists: ListRec[] = [
    { id: 1, name: 'Core', ciks: [2488, 723125], added: new Map(), deleted: false },
    { id: 2, name: 'Chips', ciks: [723125, 1397187], added: new Map(), deleted: false }
  ]
  const rows = new Map<number, WatchRow>(Object.values(WATCH_ROWS).map((r) => [r.cik, { ...r }]))
  const watched = () => [...new Set(lists.filter((l) => !l.deleted).flatMap((l) => l.ciks))]
  const live = () => lists.filter((l) => !l.deleted)
  const asList = (l: ListRec, at: number): WatchList => ({ list_id: l.id, name: l.name, position: at, count: l.ciks.length, ciks: [...l.ciks] })
  const counts = (): WatchCounts => {
    const w = watched().map((c) => rows.get(c)!)
    return { watched: w.length, needs_look: w.filter((r) => r.unseen > 0).length, no_report: w.filter((r) => !r.levels).length }
  }
  const byTicker = (t: string) => [...rows.values()].find((r) => r.ticker === t.toUpperCase())
  const find = (id: number) => {
    const l = lists.find((x) => x.id === id && !x.deleted)
    if (!l) throw new Error(`No watchlist ${id}.`)
    return l
  }

  return {
    page(): WatchPage {
      const ls = live()
      return {
        lists: ls.map(asList),
        rows: watched().map((cik) => ({ ...rows.get(cik)!, lists: ls.filter((l) => l.ciks.includes(cik)).map((l) => l.id) })),
        counts: counts(),
        as_of: '2026-11-11',
        prices_note: null
      }
    },
    counts,
    create(name: string): WatchList {
      if (live().some((l) => l.name.toLowerCase() === name.toLowerCase())) throw new Error(`A watchlist called “${name}” already exists.`)
      const l: ListRec = { id: next++, name, ciks: [], added: new Map(), deleted: false }
      lists.push(l)
      return asList(l, live().length - 1)
    },
    rename(id: number, name: string): WatchList {
      const l = find(id)
      l.name = name
      return asList(l, live().indexOf(l))
    },
    remove(id: number) {
      const l = find(id)
      l.deleted = true
      const others = new Set(live().flatMap((x) => x.ciks))
      const leaving = l.ciks.filter((c) => !others.has(c))
      return { list_id: id, leaving, with_notes: leaving.filter((c) => rows.get(c)?.note) }
    },
    restore(id: number) {
      const l = lists.find((x) => x.id === id)
      if (l) l.deleted = false
    },
    erase(id: number) {
      const at = lists.findIndex((x) => x.id === id && x.deleted)
      if (at >= 0) lists.splice(at, 1)
    },
    add(id: number | null, queries: string[]): WatchAdd {
      const l = id === null ? live()[0] ?? (lists.push({ id: next++, name: 'Watchlist', ciks: [], added: new Map(), deleted: false }), lists[lists.length - 1]) : find(id)
      const added: WatchAdd['added'] = []
      const skipped: WatchAdd['skipped'] = []
      for (const q of queries) {
        const r = byTicker(q)
        if (!r) skipped.push({ query: q, reason: `“${q}” isn’t an S&P 500 company Tearsheet covers.`, kind: 'unknown' })
        else if (l.ciks.includes(r.cik)) skipped.push({ query: q, reason: `${r.ticker} is already in ${l.name}.`, kind: 'in_list' })
        else {
          l.ciks.push(r.cik)
          l.added.set(r.cik, { at: '2026-11-12T11:00:00+00:00', as: q })
          added.push({ cik: r.cik, ticker: r.ticker, name: r.name, note: null })
        }
      }
      return { list: asList(l, live().indexOf(l)), added, skipped }
    },
    take(id: number, ciks: number[]): { removed: WatchItemBack[] } {
      const l = find(id)
      const removed = ciks
        .filter((c) => l.ciks.includes(c))
        .map((c) => ({ cik: c, position: l.ciks.indexOf(c), added_at: l.added.get(c)?.at ?? '2026-11-12T10:00:00+00:00', added_as: l.added.get(c)?.as ?? rows.get(c)!.ticker }))
      l.ciks = l.ciks.filter((c) => !ciks.includes(c))
      return { removed }
    },
    putBack(id: number, items: WatchItemBack[]) {
      const l = find(id)
      for (const it of [...items].sort((a, b) => a.position - b.position)) if (!l.ciks.includes(it.cik)) l.ciks.splice(it.position, 0, it.cik)
    },
    order(id: number, ciks: number[]) {
      find(id).ciks = [...ciks]
    },
    note(cik: number, text: string) {
      const r = rows.get(cik)
      if (r) r.note = text
      return { cik, note_at: '2026-11-12T11:00:00+00:00' }
    },
    alerts(ciks: number[], change: { range?: boolean; trigger?: boolean; move?: number; age?: boolean }) {
      for (const c of ciks) {
        const r = rows.get(c)
        if (!r) continue
        r.alerts = {
          range: change.range ?? r.alerts.range,
          trigger: change.trigger ?? r.alerts.trigger,
          move: change.move === undefined ? r.alerts.move : change.move === 0 ? null : change.move,
          age: change.age ?? r.alerts.age
        }
      }
    },
    seen(ciks?: number[]) {
      for (const r of rows.values()) if (!ciks || ciks.includes(r.cik)) r.unseen = 0
      return counts()
    }
  }
}
