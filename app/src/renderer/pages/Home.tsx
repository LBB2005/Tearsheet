// The home page, which is also New report (⌘N): the spec's "The home page" and "When something
// breaks later". A greeting with the Glass mark, the one question, and a big look-up field over
// the bundled S&P 500 list. Below it, "Try" companies for a new user, or "Recent" ones and
// "Since you were last here" for a returning one. A problem shows at the top, in a red box with
// its fix. Starting a company replaces the page with the run view (App.tsx). Several companies
// separated by commas are checked by the engine first, then written one after another (the line,
// home/line.ts). Ported from docs/designs/opening-and-setup.html (S.home, ddInner, since) in A.
// Settle only.

import '../home/home.css'

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'

import type { CompanyRow, LinePlan, PredictionSummary, SearchHit, SettingsResult } from '../../shared/protocol'
import { isList, plural, splitQueries } from '../home/line'
import { LinePlanCard } from '../home/LineParts'
import { useFix } from '../home/fix'
import { greeting, sinceLines, type SinceLine } from '../home/since'
import { Mark } from '../mark/Mark'
import { freshHits, peerRule, shortDate } from '../nav'
import { FRED_NOTICE, FRED_TERMS } from '../settings/About'
import { at } from '../setup/parts'
import type { ToolKind } from '../../shared/tools'
import { ICONS, money } from '../shell/Sidebar'

const LIMIT = 5

// For a new user: four companies to try.
const TRY: [string, string][] = [
  ['AAPL', 'Apple'],
  ['MSFT', 'Microsoft'],
  ['JPM', 'JPMorgan Chase'],
  ['COST', 'Costco']
]

export interface HomeProps {
  // The sidebar's companies, or null until they are listed.
  companies: CompanyRow[] | null
  tool: { kind: ToolKind; name: string; signedOut: boolean; safetyFailed: boolean; safetyUnfinished: boolean }
  // ⌘K on this page puts the cursor here.
  fieldRef: RefObject<HTMLInputElement>
  // "The button is on": Sign in again runs inside Tearsheet; off, it copies the paste command.
  buttonOn: boolean
  // Changes when grading finishes, so the predictions are asked for again.
  refresh: number
  // Starts a report; gives what went wrong, or null once it has started.
  onStart: (ticker: string) => Promise<string | null>
  // Starts the line with the companies checked; gives what went wrong, or null once it has started.
  onStartLine: (queries: string[]) => Promise<string | null>
  // A note at the top, before the problems: reports waiting in a paused line, or waiting for the
  // safety check.
  notice?: ReactNode
  onOpen: (row: CompanyRow) => void
  // Settings, to add a missing key.
  onKeys: () => void
  // Runs the safety check again; gives what went wrong, or null once it has started.
  onRecheck: () => Promise<string | null>
}

export function Home({ companies, tool, fieldRef, buttonOn, refresh, onStart, onStartLine, notice, onOpen, onKeys, onRecheck }: HomeProps) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searched, setSearched] = useState('')
  const [lookFailed, setLookFailed] = useState<string | null>(null)
  const [sel, setSel] = useState(0)
  const [starting, setStarting] = useState<string | null>(null)
  const [why, setWhy] = useState<string | null>(null)
  // Several companies: the engine's check of them, shown before anything starts.
  const [plan, setPlan] = useState<LinePlan | null>(null)
  const [checking, setChecking] = useState(false)
  const [predictions, setPredictions] = useState<PredictionSummary[] | null>(null)
  const [settings, setSettings] = useState<SettingsResult | null>(null)
  const latest = useRef(0)

  // The since lines need the predictions and the keys; asked for each time the page opens, and
  // again after grading.
  useEffect(() => {
    let live = true
    void window.tearsheet.listPredictions().then((r) => live && setPredictions(r.ok && r.result ? r.result : []))
    void window.tearsheet.getSettings().then((r) => live && r.ok && r.result && setSettings(r.result))
    return () => {
      live = false
    }
  }, [refresh])

  // Searching on each keystroke. Only the newest answer counts, so a slow one can't replace it.
  useEffect(() => {
    const q = query.trim()
    const ask = ++latest.current
    if (!q || isList(q)) {
      setHits([])
      setSearched('')
      setLookFailed(null)
      return
    }
    void window.tearsheet.searchCompanies(q, LIMIT).then((reply) => {
      if (ask !== latest.current) return
      setHits(reply.ok && reply.result ? reply.result.slice(0, LIMIT) : [])
      setLookFailed(reply.ok ? null : reply.error?.message || 'The look-up didn’t work.')
      setSearched(q)
      setSel(0)
    })
  }, [query])

  // Return on a list: the engine looks each company up, and says which would be new official
  // predictions. Nothing starts until Start.
  const check = async (text: string) => {
    if (checking) return
    setChecking(true)
    setWhy(null)
    const reply = await window.tearsheet.planLine(splitQueries(text))
    setChecking(false)
    if (reply.ok && reply.result) setPlan(reply.result)
    else setWhy(reply.error?.message || 'The companies couldn’t be checked.')
  }

  const beginLine = async (queries: string[]) => {
    if (starting) return
    setStarting('line')
    const problem = await onStartLine(queries)
    // Once the line's first report starts, the run view takes this page's place; behind a paused
    // line, the companies just join it, and the box at the top says so.
    setStarting(null)
    setPlan(null)
    if (problem) setWhy(problem)
    else setQuery('')
  }

  const begin = async (ticker: string) => {
    if (starting) return
    setStarting(ticker)
    setWhy(null)
    const problem = await onStart(ticker)
    // Once it has started, the run view takes this page's place. A report that joined the line
    // to wait for the safety check leaves this page up, so the field is free again.
    setStarting(null)
    if (problem) setWhy(problem)
    else setQuery('')
  }

  const q = query.trim()
  const listed = isList(q) ? splitQueries(q) : null
  // The hits shown belong to what is in the field now, so Return never starts an older one.
  const current = q !== '' && searched === q
  const shown = freshHits(query, searched, hits)
  const first = companies !== null && companies.length === 0

  const lines = sinceLines({
    companies: companies ?? [],
    predictions: predictions ?? [],
    // Until the settings answer, nothing is said about the keys.
    keys: settings?.keys ?? { fred: 'set' },
    rejected: settings?.rejected_keys ?? [],
    fredSkipped: settings?.fred_skipped ?? false,
    tool
  })
  // Problems in red at the top, and notes without alarm (a safety check that didn't finish) there too.
  const problems = lines.filter((l) => l.tone === 'down' || l.tone === 'muted')
  const since = companies && predictions && settings ? lines.filter((l) => l.tone !== 'down' && l.tone !== 'muted') : []

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (shown.length) setSel((i) => (i + (e.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (listed) {
        if (listed.length && !plan) void check(q)
        return
      }
      const hit = shown[sel]
      if (hit) void begin(hit.ticker)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setQuery('')
      setWhy(null)
    }
  }

  return (
    <div className="homev">
      {notice}
      {problems.map((line) => (
        <Problem key={line.action ?? line.text} line={line} kind={tool.kind} buttonOn={buttonOn} onRecheck={onRecheck} onKeys={onKeys} />
      ))}
      {companies !== null && (
        <div className="hello mv" style={at(0)}>
          <Mark size={22} />
          {greeting(new Date(), first)}
        </div>
      )}
      <h1 className="mv" style={at(1)}>
        Which company today?
      </h1>
      <div className="bigq mv" style={at(2)}>
        {ICONS.search}
        <input
          ref={fieldRef}
          autoFocus
          role="combobox"
          aria-label="Look up a company"
          aria-expanded={q !== '' && !why && !listed}
          aria-controls="home-hits"
          aria-activedescendant={shown.length ? `home-hit-${sel}` : undefined}
          aria-autocomplete="list"
          placeholder="Ticker or company name, like NVDA or Nvidia"
          autoComplete="off"
          spellCheck={false}
          readOnly={starting !== null}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setWhy(null)
            setPlan(null)
          }}
          onKeyDown={onKey}
        />
        <kbd>⌘K</kbd>
        {/* Why a report didn't start shows in the dropdown's place until the text changes. */}
        {q !== '' && (current || lookFailed) && !why && (
          <div className="dd" id="home-hits" role="listbox" aria-label="Companies">
            {shown.map((h, i) => (
              <button
                key={h.cik}
                id={`home-hit-${i}`}
                role="option"
                aria-selected={i === sel}
                className={i === sel ? 'ddr on' : 'ddr'}
                tabIndex={-1}
                disabled={starting !== null}
                onMouseEnter={() => setSel(i)}
                onClick={() => void begin(h.ticker)}
              >
                <b>{h.ticker}</b>
                <span>
                  {h.name}
                  {h.sector && <small>{h.sector}</small>}
                </span>
                <em>{starting === h.ticker ? 'Starting…' : h.report_id && h.report_date ? `Report from ${shortDate(h.report_date)}` : 'New report'}</em>
              </button>
            ))}
            {/* The company, its sector (above) and the peer-group rule, as the engine words it. */}
            {peerRule(shown, sel) && <div className="rule">{peerRule(shown, sel)}</div>}
            {shown.length > 0 && <div className="ft">Return starts the report. The up and down arrows move. Several at once? Separate them with commas.</div>}
            {lookFailed && <div className="none">{lookFailed}</div>}
            {!lookFailed && current && shown.length === 0 && <div className="none">No S&amp;P 500 company matches “{searched}”. Tearsheet covers the S&amp;P 500 only.</div>}
          </div>
        )}
      </div>
      {listed && !plan && !why && listed.length > 0 && (
        <p className="fine listhint mv" style={at(0)}>
          {checking ? 'Checking…' : `Return checks ${listed.length === 1 ? 'this company' : `these ${plural(listed.length, 'company', 'companies')}`}, then writes the reports one after another.`}
        </p>
      )}
      {plan && <LinePlanCard plan={plan} starting={starting === 'line'} onStart={() => void beginLine(plan.items.map((item) => item.ticker))} onCancel={() => setPlan(null)} />}
      {why && (
        <p className="why mv" style={at(0)} role="alert">
          {why}
        </p>
      )}
      {companies !== null &&
        (first ? (
          <>
            <div className="sugg mv" style={at(3)}>
              <span>Try</span>
              {TRY.map(([ticker, name]) => (
                <button key={ticker} className="sg" disabled={starting !== null} onClick={() => void begin(ticker)}>
                  {starting === ticker ? 'Starting…' : name}
                </button>
              ))}
            </div>
            <p className="fine mv" style={at(4)}>
              Your first report takes about 20 minutes. Keep using your Mac; Tearsheet tells you when it’s ready.
            </p>
          </>
        ) : (
          <div className="sugg mv" style={at(3)}>
            <span>Recent</span>
            {companies.slice(0, 4).map((c) => (
              <button key={c.cik} className="sg" title={c.name} onClick={() => onOpen(c)}>
                <b>{c.ticker}</b>
                {c.price !== null && <em>{money.format(c.price)}</em>}
              </button>
            ))}
          </div>
        ))}
      {!first && since.length > 0 && (
        <div className="card since mv" style={at(4)}>
          <h4>Since you were last here</h4>
          {since.map((line) => (
            <div key={line.text} className="sr">
              <i className={line.tone} />
              {line.detail || line.fredNotice ? (
                <span className="srt">
                  {line.text}
                  {line.detail && <small>{line.detail}</small>}
                  {line.fredNotice && (
                    <small className="fredn">
                      {FRED_NOTICE}{' '}
                      <button className="lk" onClick={() => void window.tearsheet.openExternal(FRED_TERMS)}>
                        FRED’s terms
                      </button>
                    </small>
                  )}
                </span>
              ) : (
                line.text
              )}
              {line.action === 'addFred' && (
                <button className="btn2" onClick={onKeys}>
                  Add the key
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// A problem, in red at the top of the page, with its fix. "Sign in again" runs the sign-in inside
// Tearsheet when the button is on, with its progress in this box, or copies the paste command and
// opens Terminal when it is off (home/fix.tsx); the window then waits on the person, so the main
// process notices the sign-in by itself (tools_changed) and the box goes once it is fixed.
function Problem({ line, kind, buttonOn, onRecheck, onKeys }: { line: SinceLine; kind: ToolKind; buttonOn: boolean; onRecheck: () => Promise<string | null>; onKeys: () => void }) {
  const fix = useFix(kind, buttonOn, 'signIn')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  const recheck = async () => {
    setBusy(true)
    setFailed(null)
    const problem = await onRecheck()
    setBusy(false)
    setFailed(problem)
  }

  return (
    <div className={line.tone === 'muted' ? 'card alert note mv' : 'card alert mv'} style={at(0)} role={line.tone === 'muted' ? 'status' : 'alert'}>
      <div>
        <b>{line.text}</b>
        <span>{line.detail}</span>
        {fix.below}
        {failed && <span className="bad">{failed}</span>}
      </div>
      {line.action === 'signIn' && !fix.active && (
        <button className="btn2" onClick={fix.start}>
          Sign in again
        </button>
      )}
      {line.action === 'recheck' && (
        <button className="btn2" disabled={busy} onClick={() => void recheck()}>
          Run the check again
        </button>
      )}
      {line.action === 'addMassive' && (
        <button className="btn2" onClick={onKeys}>
          Add the key
        </button>
      )}
      {line.action === 'replaceMassive' && (
        <button className="btn2" onClick={onKeys}>
          Replace the key
        </button>
      )}
    </div>
  )
}
