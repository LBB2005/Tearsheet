// The Data keys page's line for the one-time price download: the engine's background job that
// fills 14 months of prices for every S&P 500 company once the Massive key is saved (about 1.5
// hours on Massive's free plan), and pauses while a report runs. Settings reads it again every
// few seconds while it goes, so the count moves (PRICE_POLL_MS).

import type { PriceDownload } from '../../shared/protocol'

export interface PriceLine {
  text: string
  // run: going (with a spinner); ok: done; hold: stopped for now; off: not going.
  tone: 'run' | 'ok' | 'hold' | 'off'
  // Going or paused: Settings asks again until it isn't.
  going: boolean
}

// Each trading day is one call, 12 seconds apart on the free plan; this sees most of them.
export const PRICE_POLL_MS = 15_000

const PAUSED_FOR: Record<NonNullable<PriceDownload['paused_for']>, string> = {
  report: 'a report runs',
  grading: 'past predictions are graded',
  history: 'a full price history downloads',
  safety: 'a safety check runs'
}

export function priceLine(p: PriceDownload): PriceLine {
  const days = p.days_done != null && p.days_total ? `${p.days_done} of ${p.days_total} trading days` : null
  switch (p.state) {
    case 'downloading':
      return { text: days ? `${days} so far, in the background.` : 'Starting…', tone: 'run', going: true }
    case 'paused':
      return { text: `Paused while ${PAUSED_FOR[p.paused_for ?? 'report']}${days ? `, at ${days}` : ''}. It goes on by itself.`, tone: 'off', going: true }
    case 'done':
      return {
        text: p.companies_ready >= p.companies ? `Done: 14 months of prices for all ${p.companies} companies.` : `Done: 14 months of prices for ${p.companies_ready} of ${p.companies} companies. The rest download when a report needs them.`,
        tone: 'ok',
        going: false
      }
    case 'stopped':
      return { text: `Stopped: ${p.stopped_because ?? 'something went wrong'}. It starts again the next time Tearsheet opens.`, tone: 'hold', going: false }
    case 'off':
      return { text: 'Switched off. Reports download the prices they need as they go.', tone: 'off', going: false }
    case 'waiting':
      return { text: 'Starts the next time Tearsheet opens.', tone: 'off', going: false }
    case 'no_key':
      return { text: 'Starts once the Massive key is added: 14 months of prices for every S&P 500 company, about 1.5 hours in the background.', tone: 'off', going: false }
  }
}
