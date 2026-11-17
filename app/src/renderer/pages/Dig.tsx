// Dig deeper: the research step for one stock, after its report and before buying anywhere. Today's
// picture beside the report: the sector, the market, the peers, the analysts, insiders and news,
// all worked out by the engine (engine dig/) and saved as a dated snapshot. It opens from the stock
// menu, a Watchlist company's panel and the report's toolbar.

import { useCallback, useEffect, useState, type ReactNode } from 'react'

import type { DigPage, DigSnapshot, WatchLevels } from '../../shared/protocol'
import { ADVICE_SHORT } from '../../shared/wording'
import { asOfLine, compact, FIRST_ROWS, metricText, needsRefresh, partNote, plainPct, rangeSpots, subtitle, toneLine, tradeLine, type PartState } from '../dig/dig'
import '../dig/dig.css'
import { RangeBar, type Mark } from '../dig/RangeBar'
import { SectorChart } from '../dig/SectorChart'
import { signedPct } from '../log/screen'
import { shortDate } from '../nav'
import { Spinner } from '../setup/parts'
import { money } from '../shell/Sidebar'
import { useStockMenu } from '../stock/StockMenu'
import { flipOf } from '../watch/watch'

export interface DigProps {
  cik: number
  // The ticker the surface knew, until the engine's answer names the company.
  ticker: string
  onOpenReport: (reportId: string) => void
  // The toolbar's line under the title.
  onSubtitle: (text: string) => void
}

const why = (r: { error?: { message?: string } }) => r.error?.message ?? 'Tearsheet’s engine didn’t answer.'
const usd = (v: number | null | undefined) => (v === null || v === undefined ? '—' : money.format(v))
const tone = (v: number | null) => (v === null ? '' : v >= 0 ? 'up' : 'down')

export function Dig({ cik, ticker, onOpenReport, onSubtitle }: DigProps) {
  const [page, setPage] = useState<DigPage | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [tries, setTries] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFailed, setRefreshFailed] = useState<string | null>(null)
  const menu = useStockMenu()

  const refresh = useCallback(() => {
    setRefreshing(true)
    setRefreshFailed(null)
    window.tearsheet.refreshDigDeeper(cik).then(
      (r) => {
        setRefreshing(false)
        if (r.ok && r.result) setPage(r.result)
        else setRefreshFailed(why(r))
      },
      (e) => {
        setRefreshing(false)
        setRefreshFailed(e instanceof Error ? e.message : 'Tearsheet’s engine didn’t answer.')
      }
    )
  }, [cik])

  useEffect(() => {
    let live = true
    setFailed(null)
    window.tearsheet.getDigDeeper(cik).then(
      (r) => {
        if (!live) return
        if (!r.ok || !r.result) return setFailed(why(r))
        setPage(r.result)
        if (needsRefresh(r.result)) refresh()
      },
      (e) => live && setFailed(e instanceof Error ? e.message : 'Tearsheet’s engine didn’t answer.')
    )
    return () => {
      live = false
    }
  }, [cik, tries, refresh])

  const shown = page?.ticker ?? ticker
  useEffect(() => onSubtitle(page ? subtitle(page) : shown), [page, shown, onSubtitle])

  const snap = page?.snapshot ?? null
  return (
    <div className="panels digv" role="region" aria-label={`Dig deeper: ${shown}`}>
      <div className="dhead">
        <h2 {...menu.bind({ ticker: shown, cik }, { here: 'dig' })}>{shown}</h2>
        {page && <span className="nm">{page.name}</span>}
        <span className="grow" />
        {snap?.report_id && (
          <button className="btn2" onClick={() => onOpenReport(snap.report_id!)}>
            Open report
          </button>
        )}
        {page?.has_report && (
          <button className="btn2" onClick={refresh} disabled={refreshing}>
            Refresh
          </button>
        )}
      </div>
      {snap && (
        <p className="fine">
          {asOfLine(snap)}
          {page && page.older > 0 && ` ${page.older} earlier ${page.older === 1 ? 'look is' : 'looks are'} saved.`}
        </p>
      )}
      {refreshing && (
        <p className="fine loading">
          <Spinner />
          Gathering today’s numbers…
        </p>
      )}
      {refreshFailed && <p className="notice error">Couldn’t get today’s numbers: {refreshFailed}</p>}
      {failed ? (
        <div className="notice error dfail">
          <span>Dig deeper didn’t load: {failed}</span>
          <button className="btn2" onClick={() => setTries((n) => n + 1)}>
            Try again
          </button>
        </div>
      ) : !page ? (
        <p className="loading fine">
          <Spinner />
          Loading…
        </p>
      ) : !page.has_report ? (
        <div className="empty">
          <b>No report on {shown} yet. Write one first, then dig deeper beside it.</b>
        </div>
      ) : snap ? (
        <Parts snap={snap} menu={menu} />
      ) : null}
    </div>
  )
}

// ---------- the parts ----------

function Part({ title, part, source, wide, children }: { title: string; part?: { state: PartState; note: string | null; as_of: string | null }; source?: string; wide?: boolean; children: ReactNode }) {
  const note = part && source ? partNote(part, source) : null
  return (
    <section className={wide ? 'glass p dpart wide' : 'glass p dpart'} aria-label={title}>
      <h3>
        <span>{title}</span>
        {part?.as_of && part.state !== 'stale' && <small>{shortDate(part.as_of)}</small>}
      </h3>
      {note && <p className={part?.state === 'stale' ? 'fine hold' : 'fine'}>{note}</p>}
      {children}
    </section>
  )
}

function Parts({ snap, menu }: { snap: DigSnapshot; menu: ReturnType<typeof useStockMenu> }) {
  const h = snap.header
  const lv = h.levels
  return (
    <div className="dgrid">
      <Today snap={snap} />
      <Range levels={lv} close={h.close} />
      <Sector snap={snap} />
      <Market snap={snap} />
      <Peers snap={snap} menu={menu} />
      <Analysts snap={snap} />
      <Insiders snap={snap} />
      <News snap={snap} />
      <Part title="Sources" wide>
        <ul className="dsrc">
          {snap.sources.filter((s, i, all) => all.findIndex((o) => o.name === s.name) === i).map((s) => (
            <li key={s.part}>
              <span>{s.name}</span>
              <small>{s.state === 'ok' ? (s.as_of ? shortDate(s.as_of) : '') : s.state === 'stale' ? `from ${s.as_of ? shortDate(s.as_of) : 'earlier'}` : s.state === 'off' ? 'not used' : 'didn’t answer'}</small>
            </li>
          ))}
        </ul>
        <p className="fine">Peers’ numbers are as of the report. News tone is Massive’s and never enters a score.</p>
        <p className="fine">{ADVICE_SHORT}</p>
      </Part>
    </div>
  )
}

function Today({ snap }: { snap: DigSnapshot }) {
  const h = snap.header
  const lv = h.levels
  return (
    <Part title="Today">
      <dl className="kv">
        <dt>Close{h.close_date ? `, ${shortDate(h.close_date)}` : ''}</dt>
        <dd className="big">{usd(h.close)}</dd>
        <dt>Since the {lv?.source === 'prediction' ? 'prediction' : 'report'}</dt>
        <dd className={tone(h.since_report)}>{signedPct(h.since_report, 1)}</dd>
        <dt>Rating{lv ? `, as of ${shortDate(lv.report_date)}` : ''}</dt>
        <dd>{lv?.rating ? <span className={`tag4 ${lv.rating.toLowerCase()}`}>{lv.rating}</span> : 'Withheld'}</dd>
        <dt>Low – base – high</dt>
        <dd>{lv ? `${usd(lv.bear)} – ${usd(lv.base)} – ${usd(lv.bull)}` : '—'}</dd>
      </dl>
    </Part>
  )
}

function Range({ levels, close }: { levels: WatchLevels | null; close: number | null }) {
  const spots = levels && close !== null ? rangeSpots(levels, close) : null
  const flip = levels && close !== null ? flipOf({ levels, price: close }) : null
  if (!levels || close === null || !spots)
    return (
      <Part title="The report’s range">
        <p className="fine">The report has no range to place today’s close on.</p>
      </Part>
    )
  const marks: Mark[] = [
    { key: 'base', at: spots.base, title: `Base ${usd(levels.base)}` },
    ...(spots.then !== null ? [{ key: 'then', at: spots.then, title: `At the report ${usd(levels.report_price)}` }] : []),
    ...(spots.sell !== null ? [{ key: 'sell', at: spots.sell, title: `Sell line ${usd(levels.sell_trigger)}` }] : []),
    ...(spots.buy !== null ? [{ key: 'buy', at: spots.buy, title: `Buy line ${usd(levels.buy_trigger)}` }] : []),
    { key: 'now', at: spots.now, title: `Close ${usd(close)}` }
  ]
  const label = `Close ${usd(close)} against the report’s low ${usd(levels.bear)}, base ${usd(levels.base)} and high ${usd(levels.bull)}`
  return (
    <Part title="The report’s range">
      <RangeBar from={spots.bear} to={spots.bull} marks={marks} label={label} />
      <dl className="kv dkeys">
        <dt>
          <i className="key now" aria-hidden="true" />
          Close
        </dt>
        <dd>{usd(close)}</dd>
        {spots.then !== null && (
          <>
            <dt>
              <i className="key then" aria-hidden="true" />
              At the report
            </dt>
            <dd>{usd(levels.report_price)}</dd>
          </>
        )}
        <dt>
          <i className="key base" aria-hidden="true" />
          Base
        </dt>
        <dd>{usd(levels.base)}</dd>
        <dt>Rating changes at</dt>
        <dd>{flip ? `${flip.above ? 'above' : 'below'} ${usd(flip.price)} → ${flip.to}` : levels.rating ? 'not by price alone' : '—'}</dd>
      </dl>
    </Part>
  )
}

function Sector({ snap }: { snap: DigSnapshot }) {
  const s = snap.sector
  const year = s.returns.find((r) => r.period === '12M')
  const label = year
    ? `${snap.header.ticker} ${signedPct(year.stock, 1)} over 12 months, the sector’s median ${signedPct(year.sector_median, 1)}, SPY ${signedPct(year.spy, 1)}`
    : `${snap.header.ticker}, its sector and SPY over 12 months`
  return (
    <Part title="Sector" part={s} source="Prices" wide>
      {s.state !== 'off' && s.state !== 'down' && (
        <div className="dsector">
          <SectorChart part={s} ticker={snap.header.ticker} label={label} />
          <div>
            <table className="t compact small">
              <thead>
                <tr>
                  <th />
                  <th className="r">{snap.header.ticker}</th>
                  <th className="r">Sector median</th>
                  <th className="r">SPY</th>
                </tr>
              </thead>
              <tbody>
                {s.returns.map((r) => (
                  <tr key={r.period}>
                    <td>{r.period}</td>
                    <td className={`r ${tone(r.stock)}`}>{signedPct(r.stock, 1)}</td>
                    <td className="r">{signedPct(r.sector_median, 1)}</td>
                    <td className="r">{signedPct(r.spy, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {s.rank !== null && s.rank_of !== null && (
              <p className="fine">
                Ranks {s.rank} of {s.rank_of} in {s.sector} over 12 months.
              </p>
            )}
            {s.left_out > 0 && <p className="fine">The sector line leaves out {s.left_out} {s.left_out === 1 ? 'member' : 'members'} without a year of prices.</p>}
          </div>
        </div>
      )}
    </Part>
  )
}

function Market({ snap }: { snap: DigSnapshot }) {
  const m = snap.market
  const r = snap.rates
  return (
    <Part title="Market" part={m} source="Prices" wide>
      <dl className="kv dmarket">
        <dt>SPY, 12 months</dt>
        <dd className={tone(m.spy_12m)}>{signedPct(m.spy_12m, 1)}</dd>
        <dt>SPY’s 1-month swings</dt>
        <dd>{m.volatility_percentile === null ? '—' : `${Math.round(m.volatility_percentile)}th percentile of the last two years`}</dd>
        {r.rates.map((x) => (
          <div key={x.id} className="drate">
            <dt>{x.label}</dt>
            <dd>
              {plainPct(x.value, 1)} <small>{shortDate(x.date)}</small>
            </dd>
          </div>
        ))}
      </dl>
      {m.scaling_note && <p className="fine">{m.scaling_note}</p>}
      {partNote(r, 'FRED') && <p className={r.state === 'stale' ? 'fine hold' : 'fine'}>{partNote(r, 'FRED')}</p>}
    </Part>
  )
}

function Peers({ snap, menu }: { snap: DigSnapshot; menu: ReturnType<typeof useStockMenu> }) {
  const p = snap.peers
  const [all, setAll] = useState(false)
  const peerCount = p.rows.filter((r) => !r.is_company).length
  const shownRows = all ? p.rows : p.rows.filter((r, i) => r.is_company || i <= FIRST_ROWS)
  return (
    <Part title="Peers" part={p} source="The report’s stored numbers" wide>
      {p.rows.length > 0 && (
        <>
          <div className="dscroll">
            <table className="t compact small dpeers">
              <thead>
                <tr>
                  <th>Company</th>
                  <th className="r">Score</th>
                  <th>Our rating</th>
                  {p.columns.map((c) => (
                    <th key={c.key} className="r">
                      {c.label}
                    </th>
                  ))}
                  <th className="r">Since the report</th>
                  <th className="r">12 months</th>
                </tr>
              </thead>
              <tbody>
                {shownRows.map((r) => (
                  <tr key={r.cik} className={r.is_company ? 'me' : undefined} {...menu.bind({ ticker: r.ticker, cik: r.cik })}>
                    <th scope="row">
                      <b>{r.ticker}</b>
                      <span>{r.name}</span>
                    </th>
                    <td className="r">{r.score === null ? '—' : Math.round(r.score)}</td>
                    <td>{r.rating ? <span className={`tag4 ${r.rating.toLowerCase()}`}>{r.rating}</span> : <span className="faint">—</span>}</td>
                    {p.columns.map((c) => (
                      <td key={c.key} className="r">
                        {metricText(c.key, r.numbers[c.key] ?? null)}
                      </td>
                    ))}
                    <td className={`r ${tone(r.since_report)}`}>{signedPct(r.since_report, 1)}</td>
                    <td className={`r ${tone(r.return_12m)}`}>{signedPct(r.return_12m, 1)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Peers’ median</th>
                  <td className="r">{p.median.score === undefined || p.median.score === null ? '—' : Math.round(p.median.score)}</td>
                  <td />
                  {p.columns.map((c) => (
                    <td key={c.key} className="r">
                      {metricText(c.key, p.median[c.key] ?? null)}
                    </td>
                  ))}
                  <td className="r">{signedPct(p.median.since_report ?? null, 1)}</td>
                  <td className="r">{signedPct(p.median.return_12m ?? null, 1)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {!all && peerCount > FIRST_ROWS && (
            <button className="link dmore" onClick={() => setAll(true)}>
              Show all {peerCount} peers
            </button>
          )}
          <p className="fine">
            Numbers as of the report{p.report_date ? ` of ${shortDate(p.report_date)}` : ''}; returns to today. {p.recomputed_note}
          </p>
        </>
      )}
    </Part>
  )
}

function Analysts({ snap }: { snap: DigSnapshot }) {
  const a = snap.analysts
  const v = a.view
  const t = v?.target
  const ours = a.ours
  let bar: ReactNode = null
  if (t && t.low !== null && t.high !== null && t.high > t.low && t.low > 0) {
    const values = [t.low, t.high, ...(ours?.base ? [ours.base] : []), ...(snap.header.close ? [snap.header.close] : [])]
    const lo = Math.log(Math.min(...values) * 0.96)
    const hi = Math.log(Math.max(...values) * 1.04)
    const x = (p: number) => ((Math.log(p) - lo) / (hi - lo)) * 100
    const marks: Mark[] = [
      ...(t.mean !== null ? [{ key: 'base', at: x(t.mean), title: `Their average ${usd(t.mean)}` }] : []),
      ...(ours?.base ? [{ key: 'ours', at: x(ours.base), title: `Our base ${usd(ours.base)}` }] : []),
      ...(snap.header.close ? [{ key: 'now', at: x(snap.header.close), title: `Close ${usd(snap.header.close)}` }] : [])
    ]
    bar = <RangeBar plain from={x(t.low)} to={x(t.high)} marks={marks} label={`Analysts’ targets ${usd(t.low)} to ${usd(t.high)}, average ${usd(t.mean)}; our base ${usd(ours?.base)}`} />
  }
  return (
    <Part title="Analysts" part={a} source="analystdb">
      {a.state !== 'off' && a.state !== 'down' && v && (
        <>
          {bar}
          <dl className="kv dkeys">
            <dt>Firms</dt>
            <dd>{v.n_firms ?? '—'}</dd>
            <dt>Ratings</dt>
            <dd>{v.sides ? `${v.sides.buy} Buy, ${v.sides.hold} Hold, ${v.sides.sell} Sell` : '—'}</dd>
            <dt>
              <i className="key base" aria-hidden="true" />
              Their average target
            </dt>
            <dd>{usd(t?.mean)}</dd>
            <dt>Their low – high</dt>
            <dd>{t ? `${usd(t.low)} – ${usd(t.high)}` : '—'}</dd>
            <dt>
              <i className="key ours" aria-hidden="true" />
              Our base
            </dt>
            <dd>{usd(ours?.base)}</dd>
          </dl>
          {v.changes && v.changes.length > 0 && (
            <table className="t compact small">
              <tbody>
                {v.changes.slice(0, 6).map((c, i) => (
                  <tr key={`${c.date}-${c.firm}-${i}`}>
                    <td>{c.date_text}</td>
                    <td>{c.firm}</td>
                    <td>{c.rating_text}</td>
                    <td className="r">{c.target_text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="fine">The analysts’ view, shown beside our numbers and never part of them.</p>
        </>
      )}
    </Part>
  )
}

function Insiders({ snap }: { snap: DigSnapshot }) {
  const s = snap.insiders
  return (
    <Part title="Insiders" part={s} source="SEC Form 4 filings">
      {s.state !== 'off' && s.state !== 'down' && (
        <>
          <dl className="kv">
            <dt>Bought, last 6 months</dt>
            <dd>{tradeLine(s.buys)}</dd>
            <dt>Sold, last 6 months</dt>
            <dd>{tradeLine(s.sells)}</dd>
          </dl>
          {s.routine_free_buyers.length > 0 && <p className="fine">Not a yearly routine: {s.routine_free_buyers.join(', ')} bought in the last 6 months.</p>}
          {s.rows.length > 0 && (
            <table className="t compact small">
              <tbody>
                {s.rows.slice(0, 8).map((r, i) => (
                  <tr key={`${r.date}-${r.owner}-${i}`}>
                    <td>{shortDate(r.date)}</td>
                    <td>{r.owner}</td>
                    <td className={r.code === 'P' ? 'up' : 'down'}>{r.code === 'P' ? 'Bought' : 'Sold'}</td>
                    <td className="r">{r.shares === null ? '—' : r.shares.toLocaleString('en-US')}</td>
                    <td className="r">{r.price === null || r.shares === null ? '' : compact(r.price * r.shares)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Part>
  )
}

function News({ snap }: { snap: DigSnapshot }) {
  const n = snap.news
  const [all, setAll] = useState(false)
  const items = all ? n.items : n.items.slice(0, FIRST_ROWS)
  const open = (url: string) => void window.tearsheet.openExternal(url)
  return (
    <Part title="News" part={n} source="Massive news" wide>
      {n.state !== 'off' && n.state !== 'down' && (
        <>
          <p className="fine">
            {n.since ? `Since ${shortDate(n.since)}: ` : ''}
            {toneLine(n.tone)}
          </p>
          <ul className="dnews">
            {items.map((item, i) => (
              <li key={`${item.url}-${i}`}>
                <span className={`dtone ${item.tone ?? 'none'}`} title={item.tone_why ?? undefined}>
                  {item.tone ?? 'no tone'}
                </span>
                <span className="dhl">
                  {item.openable ? (
                    <a
                      href={item.url}
                      onClick={(e) => {
                        e.preventDefault()
                        open(item.url)
                      }}
                    >
                      {item.title}
                    </a>
                  ) : (
                    <span>{item.title}</span>
                  )}
                  <small>
                    {item.publisher}
                    {item.published ? `, ${shortDate(item.published)}` : ''}
                  </small>
                </span>
              </li>
            ))}
          </ul>
          {!all && n.items.length > FIRST_ROWS && (
            <button className="link dmore" onClick={() => setAll(true)}>
              Show all {n.items.length} articles
            </button>
          )}
        </>
      )}
    </Part>
  )
}
