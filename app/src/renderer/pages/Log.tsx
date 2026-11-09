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
import { compareSeries, sinceFor, type CompareRange, type Pick } from '../log/compare'
import { gradeCells, gradedLine, logSubtitle, ratingTone } from '../log/log'
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
      <span className="ends">
        <span>{price(p.bear)}</span>
        <span>{price(p.base)}</span>
        <span>{price(p.bull)}</span>
      </span>
    </span>
  )
}

function Options({ title, facet, options, filters, counts, onFlip }: { title: string; facet: Facet; options: [value: string, label: string][]; filters: Filters; counts: Map<string, number>; onFlip: (facet: Facet, value: string) => void }) {
  return (
    <fieldset className="fs">
      <legend>{title}</legend>
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
  const [line, setLine] = useState<string | null>(null)
  const [rule, setRuleState] = useState<Rule>(() => loadRule())
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [sort, setSort] = useState<SortKey>('checks')
  const [picks, setPicks] = useState<number[] | null>(null)
  const [range, setRange] = useState<CompareRange>('1Y')
  const [allCards, setAllCards] = useState(false)
  const [prices, setPrices] = useState<{ key: string; data: PredictionPrices | null } | null>(null)
  const [saved, setSaved] = useState<{ text: string; path?: string } | null>(null)
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
  }, [refresh])

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
          <p className="notice error mv" role="alert">
            The prediction log didn’t load. {failed}
          </p>
        ) : (
          <p className="loading">Loading the prediction log…</p>
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
            {head(null)}
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
  const series = compareSeries(prices && prices.key === priceKey ? prices.data : null, pickList, range)
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
            <legend>★ Good-pick consensus</legend>
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
              <input type="range" min={RULE_LIMITS.minUpside[0]} max={RULE_LIMITS.minUpside[1]} step={5} value={rule.minUpside} onChange={setNum('minUpside')} aria-label="Upside check, at least" />
            </label>
            <label className="rl">
              <span><i className="on" aria-hidden="true" />Peer score</span>
              <b>{rule.minScore}+</b>
              <input type="range" min={RULE_LIMITS.minScore[0]} max={RULE_LIMITS.minScore[1]} step={5} value={rule.minScore} onChange={setNum('minScore')} aria-label="Peer score check, at least" />
            </label>
            <label className="rl">
              <span><i className="on" aria-hidden="true" />Chance of beating peers</span>
              <b>{rule.minChance}%+</b>
              <input type="range" min={RULE_LIMITS.minChance[0]} max={RULE_LIMITS.minChance[1]} step={5} value={rule.minChance} onChange={setNum('minChance')} aria-label="Chance of beating peers check, at least" />
            </label>
          </fieldset>
          <fieldset className="fs">
            <legend>Show</legend>
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
                {cards.map((r) => {
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
          </section>

          <section className="p glass mv" style={at(3)} aria-label="Predictions">
            <h4>
              <span>
                {shown.length} of {rows.length} predictions
                <label className="sortby">
                  Sort
                  <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                    {SORTS.map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
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
              <div className="tablebox">
                <table className="t small">
                  <thead>
                    <tr>
                      <th aria-label="Compare" />
                      <th>Ticker</th>
                      <th>Company</th>
                      <th>Rating</th>
                      <th>Checks</th>
                      <th className="r" title="Peer score, and the chance of beating its peers">
                        Peer
                        <br />
                        beat
                      </th>
                      <th className="barh">
                        <span className="ticks" aria-hidden="true">
                          {BAR_TICKS.map((t) => (
                            <span key={t.label} style={{ left: `${t.x}%` }}>
                              {t.label}
                            </span>
                          ))}
                        </span>
                        <span className="sr">Bear, base and bull against today’s price</span>
                      </th>
                      <th className="r">Upside</th>
                      <th aria-label="Report" />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => {
                      const cells = gradeCells(r.p, now)
                      const on = r.newest && chosen.includes(r.p.cik)
                      return (
                        <tr key={r.p.prediction_id} className={`${r.good ? 'good' : ''}${on ? ' on' : ''}`}>
                          <td>
                            <input type="checkbox" checked={on} disabled={!r.newest} onChange={() => tick(r.p.cik)} aria-label={`Compare ${r.p.ticker}`} />
                          </td>
                          <td className="tk">{r.p.ticker}</td>
                          <td className="co">
                            <span className="nm">{companyName(r.p.name ?? r.p.ticker)}</span>
                            <span className="sub">
                              {r.p.sector ?? 'Unknown sector'} · {riskLabel(r.p.uncertainty).toLowerCase()} risk
                            </span>
                            <span className="grades">
                              <span className="made">
                                Made {shortDate(r.p.run_at.slice(0, 10), now)}
                                {!r.newest && ' · older prediction'}
                              </span>
                                {cells.graded.map((g) => (
                                  <span key={g.months} className="gr">
                                    <span className="gm">{g.label}</span>
                                    <span className={`pill ${g.verdict === 'hit' ? 'ok' : g.verdict === 'miss' ? 'bad' : 'off'}`}>{g.text}</span>
                                    {g.detail && <span className="gd">{g.detail}</span>}
                                  </span>
                                ))}
                                {cells.next && <span className="pill off">{cells.next}</span>}
                            </span>
                          </td>
                          <td>
                            <span className={`pill ${ratingTone(r.p.rating)}`}>{r.p.rating}</span>
                          </td>
                          <td className="cks">
                            {r.good && <span className="star" aria-label="Good pick">★ </span>}
                            <Squares row={r} />
                          </td>
                          <td className="r pb">
                            {r.p.score == null ? '—' : Math.round(r.p.score)}
                            <br />
                            <span>{pctOf(r.p.probability)}</span>
                          </td>
                          <td>
                            <Bar p={r.p} />
                          </td>
                          <td className={`r upv ${r.up === null ? '' : r.up >= 0 ? 'up' : 'down'}`}>{signedPct(r.up)}</td>
                          <td>
                            {r.p.report_id && onOpenReport && (
                              <button className="open" type="button" aria-label={`Open the ${r.p.ticker} report`} onClick={() => onOpenReport(r.p.report_id as string)}>
                                <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
                                  <path d="M6 3l5 5-5 5" />
                                </svg>
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <CompareChart
            series={series}
            range={range}
            loading={!!priceKey && prices?.key !== priceKey}
            picked={pickList.length}
            onRange={setRange}
            onRemove={(key) => setPicks(chosen.filter((c) => String(c) !== key))}
          />
        </div>
      </div>
    </div>
  )
}
