// Dig deeper: the research step for one stock, after its report and before buying anywhere. Today's
// picture beside the report: the sector, the market, the peers, the analysts, insiders and news,
// all worked out by the engine (engine dig/) and saved as a dated snapshot. It opens from the stock
// menu, a Watchlist company's panel and the report's toolbar.

import { useEffect, useState } from 'react'

import type { DigPage } from '../../shared/protocol'
import { Spinner } from '../setup/parts'
import { useStockMenu } from '../stock/StockMenu'

export interface DigProps {
  cik: number
  // The ticker the surface knew, until the engine's answer names the company.
  ticker: string
  onOpenReport: (reportId: string) => void
  // The toolbar's line under the title.
  onSubtitle: (text: string) => void
}

const why = (r: { error?: { message?: string } }) => r.error?.message ?? 'Tearsheet’s engine didn’t answer.'

export function Dig({ cik, ticker, onSubtitle }: DigProps) {
  const [page, setPage] = useState<DigPage | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const menu = useStockMenu()

  useEffect(() => {
    let live = true
    window.tearsheet.getDigDeeper(cik).then(
      (r) => {
        if (!live) return
        if (r.ok && r.result) setPage(r.result)
        else setFailed(why(r))
      },
      (e) => live && setFailed(e instanceof Error ? e.message : 'Tearsheet’s engine didn’t answer.')
    )
    return () => {
      live = false
    }
  }, [cik])

  const shown = page?.ticker ?? ticker
  useEffect(() => onSubtitle(page ? `${page.ticker} · ${page.name}` : shown), [page, shown, onSubtitle])

  return (
    <div className="panels digv" role="region" aria-label={`Dig deeper: ${shown}`}>
      <h2 {...menu.bind({ ticker: shown, cik }, { here: 'dig' })}>{shown}</h2>
      {failed ? (
        <p className="notice error">Dig deeper didn’t load: {failed}</p>
      ) : !page ? (
        <p className="loading fine">
          <Spinner />
          Loading…
        </p>
      ) : null}
    </div>
  )
}
