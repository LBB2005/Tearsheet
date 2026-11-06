// The home page, which is also New report (⌘N): the spec's "The home page" and "When something
// breaks later". A greeting with the Glass mark, the one question, and a big look-up field over
// the bundled S&P 500 list. Below it, "Try" companies for a new user, or "Recent" ones and
// "Since you were last here" for a returning one. A problem shows at the top, in a red box with
// its fix. Starting a company replaces the page with the run view (App.tsx). Ported from
// docs/designs/opening-and-setup.html (S.home, ddInner, since) in A. Settle only.

import '../home/home.css'

import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'

import type { ToolStatus } from '../../preload/api'
import type { CompanyRow, PredictionSummary, SearchHit, SettingsResult } from '../../shared/protocol'
import { greeting, sinceLines, type SinceLine } from '../home/since'
import { Mark } from '../mark/Mark'
import { shortDate } from '../nav'
import { at, CodeLine, Spinner } from '../setup/parts'
import { TOOL_TEXT, type ToolKind } from '../setup/steps'
import { ICONS, money } from '../shell/Sidebar'

const LIMIT = 5
const POLL_MS = 2000

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
  tool: { kind: ToolKind; name: string; signedOut: boolean; safetyFailed: boolean }
  // ⌘K on this page puts the cursor here.
  fieldRef: RefObject<HTMLInputElement>
  // Starts a report; gives what went wrong, or null once it has started.
  onStart: (ticker: string) => Promise<string | null>
  onOpen: (row: CompanyRow) => void
  onAddFred: () => void
  // The AI tools, looked at again while waiting for a sign-in.
  onTools: (tools: ToolStatus[]) => void
  // Runs the safety check again; gives what went wrong, or null once it has started.
  onRecheck: () => Promise<string | null>
}

export function Home({ companies, tool, fieldRef, onStart, onOpen, onAddFred, onTools, onRecheck }: HomeProps) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searched, setSearched] = useState('')
  const [lookFailed, setLookFailed] = useState<string | null>(null)
  const [sel, setSel] = useState(0)
  const [starting, setStarting] = useState<string | null>(null)
  const [why, setWhy] = useState<string | null>(null)
  const [predictions, setPredictions] = useState<PredictionSummary[] | null>(null)
  const [settings, setSettings] = useState<SettingsResult | null>(null)
  const latest = useRef(0)

  // The since lines need the predictions and the keys; asked for each time the page opens.
  useEffect(() => {
    let live = true
    void window.tearsheet.listPredictions().then((r) => live && setPredictions(r.ok && r.result ? r.result : []))
    void window.tearsheet.getSettings().then((r) => live && r.ok && r.result && setSettings(r.result))
    return () => {
      live = false
    }
  }, [])

  // Searching on each keystroke. Only the newest answer counts, so a slow one can't replace it.
  useEffect(() => {
    const q = query.trim()
    const ask = ++latest.current
    if (!q) {
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

  const begin = async (ticker: string) => {
    if (starting) return
    setStarting(ticker)
    setWhy(null)
    const problem = await onStart(ticker)
    // Once it has started, the run view takes this page's place.
    if (problem) {
      setStarting(null)
      setWhy(problem)
    }
  }

  const q = query.trim()
  // The hits shown belong to what is in the field now, so Return never starts an older one.
  const current = q !== '' && searched === q
  const shown = current ? hits : []
  const first = companies !== null && companies.length === 0

  const lines = sinceLines({
    companies: companies ?? [],
    predictions: predictions ?? [],
    // Until the settings answer, nothing is said about the FRED key.
    keys: settings?.keys ?? { fred: 'set' },
    fredSkipped: settings?.fred_skipped ?? false,
    tool
  })
  const problems = lines.filter((l) => l.tone === 'down')
  const since = companies && predictions && settings ? lines.filter((l) => l.tone !== 'down') : []

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (shown.length) setSel((i) => (i + (e.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
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
      {problems.map((line) => (
        <Problem key={line.action ?? line.text} line={line} login={TOOL_TEXT[tool.kind].login} onTools={onTools} onRecheck={onRecheck} />
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
          aria-expanded={q !== ''}
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
          }}
          onKeyDown={onKey}
        />
        <kbd>⌘K</kbd>
        {q !== '' && (current || lookFailed) && (
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
            {shown.length > 0 && <div className="ft">Return starts the report. The up and down arrows move.</div>}
            {lookFailed && <div className="none">{lookFailed}</div>}
            {!lookFailed && current && shown.length === 0 && <div className="none">No S&amp;P 500 company matches “{searched}”. Tearsheet covers the S&amp;P 500 only.</div>}
          </div>
        )}
      </div>
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
              {line.text}
              {line.action === 'addFred' && (
                <button className="btn2" onClick={onAddFred}>
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

// A problem, in red at the top of the page, with its fix. "Sign in again" shows the one Terminal
// line and notices by itself, looking again every 2 seconds; the box goes once it is fixed.
function Problem({ line, login, onTools, onRecheck }: { line: SinceLine; login: string; onTools: (tools: ToolStatus[]) => void; onRecheck: () => Promise<string | null> }) {
  const [signing, setSigning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    if (!signing) return
    let live = true
    let timer: number | undefined
    const look = () => {
      const again = () => {
        if (live) timer = window.setTimeout(look, POLL_MS)
      }
      window.tearsheet.getTools(true).then((tools) => {
        if (live) onTools(tools)
        again()
      }, again)
    }
    timer = window.setTimeout(look, POLL_MS)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [signing, onTools])

  const recheck = async () => {
    setBusy(true)
    setFailed(null)
    const problem = await onRecheck()
    setBusy(false)
    setFailed(problem)
  }

  return (
    <div className="card alert mv" style={at(0)} role="alert">
      <div>
        <b>{line.text}</b>
        <span>{line.detail}</span>
        {signing && (
          <div className="signin">
            <span>Paste this in Terminal and press Return. Your browser opens so you can sign in.</span>
            <CodeLine text={login} />
            <div className="row">
              <button className="btn2" onClick={() => void window.tearsheet.openTerminal()}>
                Open Terminal
              </button>
              <span className="st">
                <Spinner />
                Waiting for you to sign in
              </span>
            </div>
          </div>
        )}
        {failed && <span className="bad">{failed}</span>}
      </div>
      {line.action === 'signIn' && !signing && (
        <button className="btn2" onClick={() => setSigning(true)}>
          Sign in again
        </button>
      )}
      {line.action === 'recheck' && (
        <button className="btn2" disabled={busy} onClick={() => void recheck()}>
          Run the check again
        </button>
      )}
    </div>
  )
}
