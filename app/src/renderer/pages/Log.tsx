// The prediction log (the spec's "Prediction log"), version B of the redesign
// (docs/superpowers/specs/2026-11-08-prediction-log-page-design.md): a filter column on the left
// with the good-pick consensus; on the right the good-pick cards, every prediction in a table with
// its bear-to-bull bar, and a chart comparing the ticked ones with the S&P 500. It only reads:
// predictions are write-once, and nothing here writes them. Only real predictions and real grades
// show.

import '../log/log.css'

import { useEffect, useMemo, useRef, useState } from 'react'

import type { CallResult } from '../../preload/api'
import type { GradeResult, PredictionPrices, PredictionSummary } from '../../shared/protocol'
import { CompareChart } from '../log/CompareChart'
import { compareSeries, sinceFor, type CompareRange, type CompareSeries, type Pick } from '../log/compare'
import { gradeCells, gradedLine, logSubtitle, nextGrade, ratingTone } from '../log/log'
import {
  applyFilters,
  BAR_TICKS,
  barPlace,
  companyName,
  csvFileName,
  csvText,
  facetCounts,
  loadRule,
  logRows,
  NO_FILTERS,
  RISKS,
  riskLabel,
  RULE_LIMITS,
  saveRule,
  sectorsOf,
  signedPct,
  SORTS,
  sortRows,
  toggled,
  togglePick,
  type Facet,
  type Filters,
  type LogRow,
  type Rule,
  type SortKey
} from '../log/screen'
import { shortDate } from '../nav'
import { PopUp, rangeFill } from '../settings/General'
import { at, Changes, Spinner } from '../setup/parts'
import { money } from '../shell/Sidebar'

export interface LogProps {
  // Past predictions being graded, from the app's launch or from Grade what is due here. The
  // sidebar's status line says "Grading past predictions" meanwhile.
  grading: boolean
  // Changes each time grading finishes, so the predictions are read again.
  refresh: number
  // Grades whatever is due (App's gradeDue), with the engine's answer.
  onGrade: () => Promise<CallResult<GradeResult> | null>
  // The toolbar's line under the title.
  onSubtitle: (text: string) => void
  // Opens a prediction's report.
  onOpenReport?: (reportId: string) => void
}

// Two rows of four cards show at first.
const CARDS_SHOWN = 8

const price = (v: number | null | undefined) => (v === null || v === undefined ? '—' : money.format(v))
const pctOf = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`)

function Squares({ row }: { row: LogRow }) {
  return (
    <span className="sq" title={row.checks.map((c) => `${c.met ? '✓' : '✗'} ${c.label}`).join('\n')} aria-label={`${row.met} of 4 checks: ${row.checks.filter((c) => c.met).map((c) => c.label).join(', ') || 'none'}`}>
      {row.checks.map((c) => (
        <i key={c.key} className={c.met ? 'on' : ''} aria-hidden="true" />
      ))}
    </span>
  )
}

function Bar({ p }: { p: PredictionSummary }) {
  const bar = barPlace(p)
  if (!bar) return <span className="nobar">no range</span>
  return (
    <span className="bar" title={`Bear ${price(p.bear)} · base ${price(p.base)} · bull ${price(p.bull)} · today ${price(p.price)}`}>
      <span className="track" aria-hidden="true">
        <i className="today" style={{ left: `${bar.today}%` }} />
        <i className="range" style={{ left: `${bar.left}%`, width: `${bar.width}%` }} />
        <i className="base" style={{ left: `${bar.base}%` }} />
      </span>
      {/* The base case's price sits under its own mark; bear and bull are in the tooltip. */}
      <span className="ends">
        <span style={{ left: `${Math.min(82, Math.max(18, bar.base))}%` }}>{price(p.base)}</span>
      </span>
    </span>
  )
}

function Options({ title, facet, options, filters, counts, onFlip }: { title: string; facet: Facet; options: [value: string, label: string][]; filters: Filters; counts: Map<string, number>; onFlip: (facet: Facet, value: string) => void }) {
  return (
    <fieldset className="fs">
      <legend className="eyebrow">{title}</legend>
      {options.map(([value, label]) => (
        <label key={value} className="ck">
          <input type="checkbox" checked={(filters[facet] as string[]).includes(value)} onChange={() => onFlip(facet, value)} />
          <span>{label}</span>
          <em>{counts.get(value) ?? 0}</em>
        </label>
      ))}
    </fieldset>
  )
}

export function Log({ grading, refresh, onGrade, onSubtitle, onOpenReport }: LogProps) {
  const [all, setAll] = useState<PredictionSummary[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [tries, setTries] = useState(0)
  const [line, setLine] = useState<string | null>(null)
  const [rule, setRuleState] = useState<Rule>(() => loadRule())
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [sort, setSort] = useState<SortKey>('checks')
  const [picks, setPicks] = useState<number[] | null>(null)
  const [range, setRange] = useState<CompareRange>('1Y')
  const [allCards, setAllCards] = useState(false)
  // The first two rows of cards show; the rest behind Show all (Liam, 10 Nov 2026).
  const [moreCards, setMoreCards] = useState(false)
  const [prices, setPrices] = useState<{ key: string; data: PredictionPrices | null } | null>(null)
  const [saved, setSaved] = useState<{ text: string; path?: string } | null>(null)
  // The chart last drawn: it stays up, dimmed, while the next one's prices load, so the panel
  // never collapses to a line of text and springs back on every tick.
  const drawnLast = useRef<CompareSeries | null>(null)
  const subtitle = useRef(onSubtitle)
  subtitle.current = onSubtitle

  useEffect(() => {
    let live = true
    window.tearsheet.listPredictions().then(
      (r) => {
        if (!live) return
        if (r.ok && r.result) {
          setAll(r.result)
          setFailed(null)
          subtitle.current(logSubtitle(r.result))
        } else setFailed(r.error?.message || 'Tearsheet’s engine didn’t answer.')
      },
      (e: unknown) => live && setFailed(e instanceof Error ? e.message : 'Tearsheet’s engine didn’t answer.')
    )
    return () => {
      live = false
    }
  }, [refresh, tries])

  const rows = useMemo(() => logRows(all ?? [], rule), [all, rule])
  // The chart opens on the good picks (up to 6), until Liam ticks something himself.
  const chosen = useMemo(() => picks ?? sortRows(rows.filter((r) => r.good), 'checks').slice(0, 6).map((r) => r.p.cik), [picks, rows])
  const pickList: Pick[] = useMemo(
    () => chosen.map((cik) => rows.find((r) => r.newest && r.p.cik === cik)).filter((r): r is LogRow => !!r).map((r) => ({ cik: r.p.cik, ticker: r.p.ticker, run_at: r.p.run_at })),
    [chosen, rows]
  )
  const priceKey = pickList.length ? `${pickList.map((p) => p.cik).join(',')}@${sinceFor(pickList)}` : ''

  useEffect(() => {
    if (!priceKey) return
    let live = true
    window.tearsheet.predictionPrices(pickList.map((p) => p.cik), sinceFor(pickList)).then(
      (r) => live && setPrices({ key: priceKey, data: r.ok && r.result ? r.result : null }),
      () => live && setPrices({ key: priceKey, data: null })
    )
    return () => {
      live = false
    }
    // pickList is read through priceKey, which names everything the call depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceKey])

  const setRule = (next: Rule) => {
    setRuleState(next)
    saveRule(next)
  }
  const flip = (facet: Facet, value: string) => setFilters((f) => ({ ...f, [facet]: toggled(f[facet] as string[], value) }))
  const tick = (cik: number) => setPicks(togglePick(chosen, cik))

  const grade = async () => {
    if (grading) return
    setLine(null)
    setLine(gradedLine(await onGrade()))
  }

  const head = (count: number | null) => (
    <span className="acts">
      {count !== null && (
        <button className="btn2" type="button" disabled={count === 0} onClick={() => void exportCsv()}>
          Export {count} {count === 1 ? 'row' : 'rows'} (CSV)
        </button>
      )}
      <button className="btn2" type="button" disabled={grading} onClick={() => void grade()}>
        {grading ? (
          <>
            <Spinner />
            Grading…
          </>
        ) : (
          'Grade what is due'
        )}
      </button>
    </span>
  )
  const said = line && !grading && (
    <Changes k={line} className="gline" live>
      {line}
    </Changes>
  )

  const shown = useMemo(() => sortRows(applyFilters(rows, filters), sort), [rows, filters, sort])

  async function exportCsv() {
    setSaved(null)
    const answer = await window.tearsheet.saveCsv(csvFileName(), csvText(shown))
    setSaved(answer.ok ? { text: `Saved ${answer.name} to Downloads.`, path: answer.path } : { text: `The CSV wasn’t saved. ${answer.message}` })
  }

  if (!all) {
    return (
      <div className="logv panels">
        {failed ? (
          <div className="notice error mv lfail" role="alert">
            <span>The prediction log didn’t load. {failed}</span>
            <button
              className="btn2"
              type="button"
              onClick={() => {
                setFailed(null)
                setTries((n) => n + 1)
              }}
            >
              Try again
            </button>
          </div>
        ) : (
          <p className="loading fine">
            <Spinner />
            Loading the prediction log…
          </p>
        )}
      </div>
    )
  }

  const notice = (
    <div className="notice mv" style={at(0)}>
      <b>Descriptive, not conclusive.</b> This log grades the companies you chose to look up, not the method as a whole. Good picks are a filter on the method’s own numbers. Research data, not investment advice.
    </div>
  )

  if (all.length === 0) {
    return (
      <div className="logv panels">
        {notice}
        <section className="p glass mv" style={at(1)}>
          <h4>
            <span>Logged predictions</span>
          </h4>
          {said}
          <div className="empty">
            <b>No official predictions yet</b>
            <span>Each company’s first full report in any 30 days is logged here, and graded at 3, 6 and 12 months.</span>
          </div>
        </section>
      </div>
    )
  }

  const now = new Date()
  const good = shown.filter((r) => r.good)
  const cards = allCards ? shown : good
  const anyGraded = rows.some((r) => r.graded)
  const loadingPrices = !!priceKey && prices?.key !== priceKey
  const fresh = compareSeries(prices && prices.key === priceKey ? prices.data : null, pickList, range)
  if (!loadingPrices && !fresh.empty) drawnLast.current = fresh
  const stale = loadingPrices && drawnLast.current !== null
  const series = stale ? (drawnLast.current as CompareSeries) : fresh
  const count = (facet: Facet) => facetCounts(rows, filters, facet)
  const goodCount = rows.filter((r) => r.good).length
  const setNum = (key: 'minUpside' | 'minScore' | 'minChance') => (e: { target: { value: string } }) => setRule({ ...rule, [key]: Number(e.target.value) })
  const filtered = filters !== NO_FILTERS && JSON.stringify(filters) !== JSON.stringify(NO_FILTERS)

  return (
    <div className="logv panels">
      {notice}
      <div className="split">
        <aside className="p glass mv side" style={at(1)} aria-label="Filters">
          <fieldset className="fs">
            <legend className="eyebrow">★ Good-pick consensus</legend>
            <p className="lead">A good pick meets at least this many of the 4 checks:</p>
            <div className="chips" role="group" aria-label="Checks that must agree">
              {[1, 2, 3, 4].map((n) => (
                <button key={n} type="button" className={`chip${rule.need === n ? ' on' : ''}`} aria-pressed={rule.need === n} aria-label={`${n} of 4`} onClick={() => setRule({ ...rule, need: n })}>
                  {n}
                </button>
              ))}
            </div>
            <p className="rl buy"><span><i className="on" aria-hidden="true" />Rated Buy</span></p>
            <label className="rl">
              <span><i className="on" aria-hidden="true" />Upside to base case</span>
              <b>{rule.minUpside}%+</b>
              <input type="range" min={RULE_LIMITS.minUpside[0]} max={RULE_LIMITS.minUpside[1]} step={5} value={rule.minUpside} style={rangeFill(rule.minUpside, ...RULE_LIMITS.minUpside)} onChange={setNum('minUpside')} aria-label="Upside check, at least" />
            </label>
            <label className="rl">
              <span><i className="on" aria-hidden="true" />Peer score</span>
              <b>{rule.minScore}+</b>
              <input type="range" min={RULE_LIMITS.minScore[0]} max={RULE_LIMITS.minScore[1]} step={5} value={rule.minScore} style={rangeFill(rule.minScore, ...RULE_LIMITS.minScore)} onChange={setNum('minScore')} aria-label="Peer score check, at least" />
            </label>
            <label className="rl">
              <span><i className="on" aria-hidden="true" />Chance of beating peers</span>
              <b>{rule.minChance}%+</b>
              <input type="range" min={RULE_LIMITS.minChance[0]} max={RULE_LIMITS.minChance[1]} step={5} value={rule.minChance} style={rangeFill(rule.minChance, ...RULE_LIMITS.minChance)} onChange={setNum('minChance')} aria-label="Chance of beating peers check, at least" />
            </label>
          </fieldset>
          <fieldset className="fs">
            <legend className="eyebrow">Show</legend>
            <label className="ck">
              <input type="radio" name="logshow" checked={!filters.goodOnly} onChange={() => setFilters((f) => ({ ...f, goodOnly: false }))} />
              <span>All predictions</span>
              <em>{rows.length}</em>
            </label>
            <label className="ck">
              <input type="radio" name="logshow" checked={filters.goodOnly} onChange={() => setFilters((f) => ({ ...f, goodOnly: true }))} />
              <span>★ Good picks only</span>
              <em>{goodCount}</em>
            </label>
          </fieldset>
          <Options title="Rating" facet="ratings" options={[['Buy', 'Buy'], ['Hold', 'Hold'], ['Sell', 'Sell']]} filters={filters} counts={count('ratings')} onFlip={flip} />
          <Options title="Sector" facet="sectors" options={sectorsOf(rows).map((s) => [s, s])} filters={filters} counts={count('sectors')} onFlip={flip} />
          <Options title="Risk" facet="risks" options={RISKS.filter(([k]) => rows.some((r) => r.p.uncertainty === k))} filters={filters} counts={count('risks')} onFlip={flip} />
          <Options title="Grades" facet="grades" options={[['waiting', 'Waiting'], ['graded', 'Graded']]} filters={filters} counts={count('grades')} onFlip={flip} />
          <button className="link" type="button" disabled={!filtered} onClick={() => setFilters(NO_FILTERS)}>
            Clear filters
          </button>
        </aside>

        <div className="main">
          <section className="p glass mv" style={at(2)} aria-label="Good picks">
            <h4>
              <span>
                ★ {allCards ? `All shown predictions · ${cards.length}` : `Good picks · ${good.length}`} <em className="rule">{rule.need} of 4 checks agree</em>
              </span>
              <label className="ck inline">
                <input type="checkbox" checked={allCards} onChange={() => setAllCards((v) => !v)} />
                <span>Show all as cards</span>
              </label>
            </h4>
            {cards.length === 0 ? (
              <p className="fine">No prediction meets {rule.need} of the 4 checks with these filters. Lower a number on the left, or ask for fewer checks.</p>
            ) : (
              <div className="cards">
                {(moreCards ? cards : cards.slice(0, CARDS_SHOWN)).map((r) => {
                  const on = chosen.includes(r.p.cik) && r.newest
                  return (
                    <button key={r.p.prediction_id} type="button" className={`pcard${on ? ' on' : ''}${r.good ? ' good' : ''}`} aria-pressed={on} disabled={!r.newest} onClick={() => tick(r.p.cik)} title={r.newest ? `Add ${r.p.ticker} to the chart` : 'An older prediction for this company'}>
                      <span className="pchead">
                        <span className="tk">{r.p.ticker}</span>
                        <span className={`pill ${ratingTone(r.p.rating)}`}>{r.p.rating}</span>
                      </span>
                      <span className={`big ${r.up === null ? '' : r.up >= 0 ? 'up' : 'down'}`}>{signedPct(r.up)}</span>
                      <span className="foot">
                        <Squares row={r} />
                        <span>{r.met} of 4</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            {cards.length > CARDS_SHOWN && (
              <button className="link more" type="button" aria-expanded={moreCards} onClick={() => setMoreCards((v) => !v)}>
                {moreCards ? 'Show fewer' : `Show all ${cards.length}`}
              </button>
            )}
          </section>

          <section className="p glass mv tablep" style={at(3)} aria-label="Predictions">
            <h4>
              <span>
                {shown.length} of {rows.length} predictions
                <span className="sortby">
                  <span id="log-sort">Sort</span>
                  <span className="small">
                    <PopUp labelledBy="log-sort" value={sort} options={SORTS} onChange={(v) => setSort(v as SortKey)} />
                  </span>
                </span>
              </span>
              {head(shown.length)}
            </h4>
            {said}
            {saved && (
              <p className="gline" role="status">
                {saved.text}{' '}
                {saved.path && (
                  <button className="link" type="button" onClick={() => void window.tearsheet.showDownload(saved.path as string)}>
                    Show in Finder
                  </button>
                )}
              </p>
            )}
            {!anyGraded && (
              <p className="ngy">
                <b>Nothing graded yet</b> · each grade shows on its row as it comes in: a hit or a miss against the peers, and whether the price ended inside the range.
              </p>
            )}
            {shown.length === 0 ? (
              <div className="empty">
                <b>No predictions match</b>
                <span>
                  Loosen a filter on the left, or{' '}
                  <button className="link" type="button" onClick={() => setFilters(NO_FILTERS)}>
                    see all {rows.length}
                  </button>
                  .
                </span>
              </div>
            ) : (
              // A grid, not an auto-sized table: every row shares one column template, so a row never
              // waits on the others to size itself, and rows out of view skip layout and paint
              // (content-visibility). The header row stays at the top while the page scrolls.
              <div className="ltable" role="table" aria-label="Logged predictions" aria-rowcount={shown.length + 1}>
                <div className="lhead" role="rowgroup">
                  <div className="lrow" role="row">
                    <span role="columnheader" className="c-ck">
                      <span className="sr">Compare</span>
                    </span>
                    <span role="columnheader">Ticker</span>
                    <span role="columnheader">Company</span>
                    <span role="columnheader">Rating</span>
                    <span role="columnheader" className="c-checks">
                      Checks
                    </span>
                    <span role="columnheader" className="r c-peer" title="Peer score, and the chance of beating its peers">
                      Peer
                    </span>
                    <span role="columnheader" className="c-bar">
                      <span className="ticks" aria-hidden="true">
                        {BAR_TICKS.map((t) => (
                          <span key={t.label} style={{ left: `${t.x}%` }}>
                            {t.label}
                          </span>
                        ))}
                      </span>
                      <span className="sr">Bear, base and bull against today’s price</span>
                    </span>
                    <span role="columnheader" className="r">
                      Upside
                    </span>
                    <span role="columnheader">Next grade</span>
                    <span role="columnheader">
                      <span className="sr">Report</span>
                    </span>
                  </div>
                </div>
                <div role="rowgroup">
                  {shown.map((r) => {
                    const cells = gradeCells(r.p, now)
                    const next = nextGrade(r.p, now)
                    const on = r.newest && chosen.includes(r.p.cik)
                    return (
                      <div key={r.p.prediction_id} role="row" className={`lrow${r.good ? ' good' : ''}${on ? ' on' : ''}`}>
                        <span role="cell" className="c-ck">
                          <input type="checkbox" checked={on} disabled={!r.newest} onChange={() => tick(r.p.cik)} aria-label={`Compare ${r.p.ticker}`} />
                        </span>
                        <span role="cell" className="tk">
                          {r.p.ticker}
                        </span>
                        <span role="cell" className="co" title={companyName(r.p.name ?? r.p.ticker)}>
                          <span className="nm">{companyName(r.p.name ?? r.p.ticker)}</span>
                          <span className="sub">
                            {r.p.sector ?? 'Unknown sector'} · {riskLabel(r.p.uncertainty).toLowerCase()} risk
                          </span>
                        </span>
                        <span role="cell">
                          <span className={`pill ${ratingTone(r.p.rating)}`}>{r.p.rating}</span>
                        </span>
                        <span role="cell" className="cks c-checks">
                          {r.good && <span className="star" aria-label="Good pick">★ </span>}
                          <Squares row={r} />
                        </span>
                        <span role="cell" className="r pb c-peer">
                          {r.p.score == null ? '—' : Math.round(r.p.score)}
                          <span>{pctOf(r.p.probability)}</span>
                        </span>
                        <span role="cell" className="c-bar">
                          <Bar p={r.p} />
                        </span>
                        <span role="cell" className={`r upv ${r.up === null ? '' : r.up >= 0 ? 'up' : 'down'}`}>
                          {signedPct(r.up)}
                        </span>
                        <span role="cell" className="ng">
                          <span className="ngl">
                            {cells.graded.map((g) => (
                              <span key={g.months} className={`pill ${g.verdict === 'hit' ? 'ok' : g.verdict === 'miss' ? 'bad' : 'off'}`} title={[g.label, g.detail].filter(Boolean).join(': ')}>
                                {g.months} mo {g.text}
                              </span>
                            ))}
                            {next ? (
                              <span className="due" title={`The ${next.months}-month grade`}>
                                {next.when === 'due now' ? 'Due now' : next.when}
                              </span>
                            ) : (
                              !cells.graded.length && '—'
                            )}
                          </span>
                          <span className="sub">
                            Made {shortDate(r.p.run_at.slice(0, 10), now)}
                            {!r.newest && ' · older'}
                          </span>
                        </span>
                        <span role="cell">
                          {r.p.report_id && onOpenReport && (
                            <button className="open" type="button" aria-label={`Open the ${r.p.ticker} report`} onClick={() => onOpenReport(r.p.report_id as string)}>
                              <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
                                <path d="M6 3l5 5-5 5" />
                              </svg>
                            </button>
                          )}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>

          <CompareChart
            series={series}
            range={range}
            loading={loadingPrices}
            stale={stale}
            picked={pickList.length}
            onRange={setRange}
            onRemove={(key) => setPicks(chosen.filter((c) => String(c) !== key))}
          />
        </div>
      </div>
    </div>
  )
}
