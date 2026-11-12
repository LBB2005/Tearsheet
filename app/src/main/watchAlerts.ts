// Mac notifications for watchlist alerts. The engine checks a watched company's price against its
// report after each new close and sends watch_changed with the alerts that fired (engine
// watchlist.py); this shows them as one Mac notification, the engine's own sentence for one alert
// and a short summary for several, so a catch-up after days away is one notice, not forty.
// Clicking it brings Tearsheet back and opens the Watchlist on the company.
//
// Never shown from a check's hidden window or a test copy (index.ts passes `enabled`): those must
// never reach the screen.

import type { Notification as EngineNote } from './engine'

export interface WatchEventNote {
  cik: number
  ticker: string
  text: string
}

export interface AlertNotice {
  title: string
  body: string
  // The company the click opens: the only one, or the first of several.
  cik: number
}

interface Notes {
  on(event: 'notification', fn: (note: EngineNote) => void): unknown
}

export interface Shower {
  // Shows one Mac notification; `onClick` runs when it is clicked.
  show(notice: AlertNotice, onClick: () => void): void
}

// The events a watch_changed note carries, read defensively: anything malformed is left out.
export function alertEvents(note: EngineNote): WatchEventNote[] {
  if (note.method !== 'watch_changed') return []
  const events = (note.params as { events?: unknown }).events
  if (!Array.isArray(events)) return []
  return events.filter(
    (e): e is WatchEventNote =>
      typeof e === 'object' && e !== null && typeof (e as WatchEventNote).cik === 'number' && typeof (e as WatchEventNote).ticker === 'string' && typeof (e as WatchEventNote).text === 'string'
  )
}

// The notice for these events, or null for none. One: the ticker as the title and the engine's
// sentence. Several: how many, and the tickers, each once, in the order they fired.
export function alertNotice(events: WatchEventNote[]): AlertNotice | null {
  if (!events.length) return null
  if (events.length === 1) return { title: `${events[0].ticker} · Watchlist`, body: events[0].text, cik: events[0].cik }
  const tickers = [...new Set(events.map((e) => e.ticker))]
  const shown = tickers.length > 6 ? `${tickers.slice(0, 6).join(', ')} and ${tickers.length - 6} more` : tickers.join(', ')
  return { title: `${events.length} watchlist alerts`, body: shown, cik: events[0].cik }
}

// Listens for watch_changed and shows its alerts when the note says to (the watch_notifications
// setting) and this launch may show anything at all.
export function showWatchAlerts(engine: Notes, shower: Shower, opts: { enabled: boolean; open: (cik: number) => void }): void {
  if (!opts.enabled) return
  engine.on('notification', (note) => {
    if (note.method !== 'watch_changed' || (note.params as { notify?: unknown }).notify !== true) return
    const notice = alertNotice(alertEvents(note))
    if (notice) shower.show(notice, () => opts.open(notice.cik))
  })
}
