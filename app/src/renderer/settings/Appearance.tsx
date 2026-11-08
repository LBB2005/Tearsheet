// Settings → Appearance, version B of the three Liam was shown ("Look gallery", 7 Nov 2026): a
// picture of each look first, with Dark, Light or Match the Mac beside the title; then the few
// choices most people make (accent, text size, glow, the Buy/Hold/Sell colours, Animations, and a
// place kept for the home background); then Customize…, a page of its own with four tabs for
// every colour, the font and boldness, corners and glass, and the chart's lines. At the bottom,
// theme files (Import…, Export…) and Reset. Every change shows at once, in the window and the
// report (appearance/store.ts), and a look that makes text hard to read says so.

import '../settings/appearance.css'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import { contrast, isHex } from '../appearance/colour'
import { ACCENTS, FONTS, LOOKS, RATINGS, type AccentId, type FontId, type RatingSet } from '../appearance/looks'
import { canSave, importTheme, lookName, pickLook, removeSaved, resetLook, restore, saveCurrent, setLook, useAppearance, type AppearanceNow } from '../appearance/store'
import { BOLDNESS, CORNERS, DEFAULT_APPEARANCE, GLASSES, GLOW, LINES, sameLook, SIZE, themeText, type Appearance, type Boldness, type ColourKey, type Glass, type Lines, type Mode } from '../appearance/themeFile'
import { pickerValue, readability, resolve, type Resolved } from '../appearance/tokens'
import { Label, PopUp } from './General'
import { MotionChoice } from './MotionChoice'

export type Notify = (title: string, text?: string, tone?: 'ok' | 'stop', extra?: { action?: { label: string; run: () => void }; ms?: number }) => void

type Tab = 'colours' | 'text' | 'shape' | 'chart'

const systemDark = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)').matches : true)

export function AppearancePage({ onNotify }: { onNotify?: Notify }) {
  const now = useAppearance()
  const [page, setPage] = useState<'main' | 'customize'>('main')
  const [tab, setTab] = useState<Tab>('colours')
  const [problem, setProblem] = useState<string | null>(null)
  const notify: Notify = onNotify ?? (() => undefined)
  const change = (part: Partial<Appearance>) => setLook({ ...now.look, ...part })

  if (page === 'customize') {
    return (
      <>
        <button className="lk apback" onClick={() => setPage('main')}>
          ‹ Appearance
        </button>
        <h2 className="sh2">Customize</h2>
        <p className="slead">Every part of the look. Changes show at once; Reset is on the Appearance page.</p>
        <Sample />
        <HardToRead resolved={now.resolved} />
        <div className="aptabs">
          <Segmented label="Part of the look" value={tab} options={[['colours', 'Colours'], ['text', 'Text'], ['shape', 'Shape'], ['chart', 'Chart']]} onChange={setTab} />
        </div>
        {tab === 'colours' && <ColoursTab now={now} change={change} />}
        {tab === 'text' && <TextTab look={now.look} change={change} />}
        {tab === 'shape' && <ShapeTab look={now.look} change={change} />}
        {tab === 'chart' && <ChartTab now={now} change={change} />}
      </>
    )
  }

  return (
    <>
      <div className="aphead">
        <div>
          <h2 className="sh2">Appearance</h2>
          <p className="slead">Pick a look, then make it yours. Changes show at once.</p>
        </div>
        <Segmented label="Light or dark" value={now.look.mode} options={[['dark', 'Dark'], ['light', 'Light'], ['auto', 'Match the Mac']]} onChange={(mode: Mode) => change({ mode })} />
      </div>
      <HardToRead resolved={now.resolved} />
      <Gallery now={now} notify={notify} onProblem={setProblem} />
      <LookLine now={now} notify={notify} />
      <div className="sgrp">
        <div className="sline">
          <Label id="ap-accent" title="Accent colour" help="Buttons, links and the chart’s line." />
          <Swatches now={now} change={change} />
        </div>
        <RangeRow id="ap-size" title="Text size" help="Everything grows together, the report too." value={now.look.size} range={SIZE} unit="%" onChange={(size) => change({ size })} />
        <RangeRow id="ap-glow" title="Glow" help="The soft light behind every page and the report." value={now.look.glow} range={GLOW} unit="%" onChange={(glow) => change({ glow })} />
        <RatingsRow look={now.look} change={change} />
        <MotionChoice />
        {/* Kept for the home backgrounds being made in another session, which will fill it. */}
        <div className="sline">
          <Label id="ap-home" title="Home background" help="Your new home backgrounds will be picked here." />
          <PopUp labelledBy="ap-home" value="plain" options={[['plain', 'Plain (today’s look)']]} disabled onChange={() => undefined} />
        </div>
      </div>
      <div className="sgrp">
        <div className="sline">
          <Label title="Customize" help="Every colour, the font and boldness, corners, glass and the chart’s lines." />
          <button className="pb go" onClick={() => setPage('customize')}>
            Customize…
          </button>
        </div>
      </div>
      <ThemeFile now={now} notify={notify} problem={problem} onProblem={setProblem} />
    </>
  )
}

// ---------- the looks ----------

// A picture of a look: its sidebar, the main area under its glow, two lines of text, a panel and
// a line of the accent, in that look's own colours.
function Thumb({ r, glow }: { r: Resolved; glow: number }) {
  const c = r.colours
  const g = Math.max(glow, 25) / 100
  const rgb = (hex: string, a: number) => `rgb(${parseInt(hex.slice(1, 3), 16)} ${parseInt(hex.slice(3, 5), 16)} ${parseInt(hex.slice(5, 7), 16)} / ${a.toFixed(2)})`
  return (
    <span className="thumb" aria-hidden="true" style={{ background: c.bg }}>
      <span className="th-side">
        <i style={{ background: c.muted, width: '80%' }} />
        <i style={{ background: c.muted, width: '60%', opacity: 0.7 }} />
        <i style={{ background: c.up, width: '40%' }} />
        <i style={{ background: c.hold, width: '40%' }} />
      </span>
      <span className="th-main" style={{ background: `radial-gradient(90% 100% at 15% 0%, ${rgb(c.g1, 0.5 * g)}, transparent 70%), radial-gradient(80% 90% at 95% 40%, ${rgb(c.g2, 0.45 * g)}, transparent 70%), ${c.base}` }}>
        <i style={{ background: c.text, width: '55%', height: 6 }} />
        <i style={{ background: c.muted, width: '80%' }} />
        <span className="th-box" style={{ background: rgb(c.ink, 0.06), borderColor: rgb(c.ink, 0.12) }} />
        <i style={{ background: c.accent, width: '30%' }} />
      </span>
    </span>
  )
}

function Gallery({ now, notify, onProblem }: { now: AppearanceNow; notify: Notify; onProblem: (why: string | null) => void }) {
  const dark = systemDark()
  const cards = useMemo(
    () => [
      ...LOOKS.map((l) => ({ id: l.id, name: l.name, note: l.note, r: resolve({ ...now.look, basedOn: l.id, accent: 'look', colours: {} }, dark) })),
      ...now.saved.map((s) => ({ id: `saved:${s.id}`, name: s.name, note: 'Yours', r: resolve({ ...s.look, mode: now.look.mode }, dark) }))
    ],
    [now.look, now.saved, dark]
  )
  return (
    <div className="lgrid" role="group" aria-label="Looks">
      {cards.map((c) => (
        <button key={c.id} className={now.picked === c.id ? 'lcard on' : 'lcard'} aria-pressed={now.picked === c.id} onClick={() => pickLook(c.id)}>
          <Thumb r={c.r} glow={now.look.glow} />
          <span className="nm">
            {c.name}
            <small>{c.note}</small>
          </span>
        </button>
      ))}
      <ImportButton className="lcard" notify={notify} onProblem={onProblem}>
        <span className="thumb add" aria-hidden="true">
          +
        </span>
        <span className="nm">
          Import a theme…<small>From a file</small>
        </span>
      </ImportButton>
    </div>
  )
}

// The picked look's name, and Save as a look… (with a name field) or Remove this look.
function LookLine({ now, notify }: { now: AppearanceNow; notify: Notify }) {
  const [naming, setNaming] = useState<string | null>(null)
  const [why, setWhy] = useState<string | null>(null)
  const saved = now.saved.find((s) => `saved:${s.id}` === now.picked)
  const save = () => {
    const r = saveCurrent(naming ?? '')
    if (!r.ok) return setWhy(r.message)
    setWhy(null)
    setNaming(null)
    notify(`Saved “${r.look.name}”`, 'It’s with your looks now.', 'ok')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') save()
    else if (e.key === 'Escape') setNaming(null)
  }
  const remove = () => {
    if (!saved) return
    const before = { ...now }
    removeSaved(saved.id)
    notify(`Removed “${saved.name}”`, undefined, 'ok', { action: { label: 'Undo', run: () => restore(before) } })
  }
  return (
    <>
      <div className="lookline">
        {naming === null ? (
          <>
            <span aria-live="polite">{lookName(now)}</span>
            {canSave(now) && (
              <button className="pb" onClick={() => setNaming(saved ? saved.name : 'My look')}>
                Save as a look…
              </button>
            )}
            {saved && (
              <button className="lk" onClick={remove}>
                Remove this look
              </button>
            )}
          </>
        ) : (
          <>
            <input className="sin" aria-label="Name for this look" autoFocus maxLength={40} spellCheck={false} value={naming} onChange={(e) => setNaming(e.target.value)} onKeyDown={onKey} />
            <span className="acts">
              <button className="pb go" onClick={save}>
                Save
              </button>
              <button className="pb" onClick={() => setNaming(null)}>
                Cancel
              </button>
            </span>
          </>
        )}
      </div>
      {why && (
        <p className="fine bad" role="alert">
          {why}
        </p>
      )}
    </>
  )
}

// ---------- small parts ----------

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (value: T) => void }) {
  return (
    <div className="aseg" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} className={v === value ? 'on' : undefined} aria-pressed={v === value} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  )
}

function RangeRow({ id, title, help, value, range, unit, onChange }: { id: string; title: string; help?: ReactNode; value: number; range: { min: number; max: number; step: number }; unit: string; onChange: (value: number) => void }) {
  return (
    <div className="sline">
      <Label id={id} title={title} help={help} />
      <span className="aprange">
        <input type="range" aria-labelledby={id} min={range.min} max={range.max} step={range.step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <output>
          {value}
          {unit}
        </output>
      </span>
    </div>
  )
}

function Swatches({ now, change }: { now: AppearanceNow; change: (part: Partial<Appearance>) => void }) {
  const shade = now.resolved.shade
  const own = resolve({ ...now.look, accent: 'look', colours: {} }, systemDark()).colours.accent
  const custom = now.look.colours.accent
  const pick = (accent: AccentId) => {
    const colours = { ...now.look.colours }
    delete colours.accent
    change({ accent, colours })
  }
  return (
    <span className="apsw" role="group" aria-labelledby="ap-accent">
      {ACCENTS.map((a) => {
        const on = !custom && now.look.accent === a.id
        return <button key={a.id} className={on ? 'sw on' : 'sw'} aria-pressed={on} aria-label={a.name} title={a.name} style={{ background: a.id === 'look' ? own : shade === 'dark' ? a.dark : a.light }} onClick={() => pick(a.id)} />
      })}
      <label className={custom ? 'sw any on' : 'sw any'} title="Any colour">
        <input type="color" aria-label="Any accent colour" value={(custom ?? now.resolved.colours.accent).toLowerCase()} onChange={(e) => change({ colours: { ...now.look.colours, accent: e.target.value.toUpperCase() } })} />
      </label>
    </span>
  )
}

function RatingsRow({ look, change }: { look: Appearance; change: (part: Partial<Appearance>) => void }) {
  return (
    <div className="sline">
      <Label id="ap-ratings" title="Buy, Hold and Sell colours" help="Also up and down, in the report and the chart." />
      <PopUp labelledBy="ap-ratings" value={look.ratings} options={RATINGS.map((r): [string, string] => [r.id, r.name])} onChange={(v) => change({ ratings: v as RatingSet })} />
    </div>
  )
}

// One line per check that fails: which text, and how far it is from readable.
function HardToRead({ resolved }: { resolved: Resolved }) {
  const bad = readability(resolved).filter((r) => !r.ok)
  if (bad.length === 0) return null
  return (
    <div className="apwarn" role="status">
      <b>Hard to read.</b> {bad.map((r) => `${r.what} is ${r.ratio.toFixed(1)}:1 against its background`).join('; ')}. Aim for {bad.some((r) => r.need > 3) ? '4.5:1' : '3:1'} or more.
    </div>
  )
}

// What Settings itself doesn't show: a report's heading and rating, up and down numbers, the
// chart's three lines, the Buy, Hold and Sell tags, a link and a button.
const CO = [52, 50, 53, 55, 54, 58, 57, 61, 60, 63, 66, 64, 68, 71, 70, 74]
const PE = [50, 51, 51, 52, 54, 53, 55, 56, 56, 58, 57, 59, 60, 60, 62, 63]
const SPY = [50, 50, 51, 51, 52, 52, 53, 53, 54, 54, 55, 55, 56, 56, 57, 57]
const line = (a: number[]) => a.map((v, i) => `${i ? 'L' : 'M'}${((i * 300) / (a.length - 1)).toFixed(1)},${(64 - ((v - 46) / 30) * 60).toFixed(1)}`).join(' ')

function Sample() {
  return (
    <div className="apsample" aria-label="Sample of the look" role="img">
      <span className="eyebrow">Sample</span>
      <div className="smp-hd">
        <b className="tk">AAPL</b>
        <span className="nm">Apple Inc.</span>
        <span className="tag4 buy">Buy</span>
      </div>
      <div className="smp-nums">
        <span>
          <small>Last close</small>
          <b className="big">$227.48</b>
        </span>
        <span className="upc">▲ 1.8% today</span>
        <span className="dnc">▼ 0.6% against peers</span>
      </div>
      <svg className="spark" viewBox="0 0 300 64" preserveAspectRatio="none" aria-hidden="true">
        <path className="sp-area" d={`${line(CO)} L300,64 L0,64 Z`} />
        <path className="sp-spy" d={line(SPY)} />
        <path className="sp-peer" d={line(PE)} />
        <path className="sp-co" d={line(CO)} />
      </svg>
      <div className="smp-ft">
        <span className="tag4 buy">Buy</span>
        <span className="tag4 hold">Hold</span>
        <span className="tag4 sell">Sell</span>
        <span className="lk">Read the 10-K</span>
        <span className="smp-btn">New report</span>
      </div>
    </div>
  )
}

// ---------- Customize's tabs ----------

const COLOUR_ROWS: [ColourKey, string, string?][] = [
  ['background', 'Background'],
  ['sidebar', 'Sidebar'],
  ['text', 'Text'],
  ['secondary-text', 'Secondary text'],
  ['accent', 'Accent'],
  ['second-accent', 'Second accent', 'The peers’ line on the chart, and a few highlights.']
]

// How a colour reads against what it sits on, for its row's help line.
function readsAs(key: ColourKey, r: Resolved): { text: string; ok: boolean } | null {
  const c = r.colours
  const pair: Partial<Record<ColourKey, [string, string, number]>> = {
    background: [c.text, c.base, 4.5],
    sidebar: [c.text, c.bg, 4.5],
    text: [c.text, c.base, 4.5],
    'secondary-text': [c.muted, c.base, 4.5],
    accent: [c.accent, c.base, 3]
  }
  const p = pair[key]
  if (!p) return null
  const ratio = contrast(p[0], p[1])
  return { text: `${ratio >= 7 ? 'Easy to read' : ratio >= p[2] ? 'Readable' : 'Hard to read'} · ${ratio.toFixed(1)}:1`, ok: ratio >= p[2] }
}

function ColourRow({ k, title, help, now, change }: { k: ColourKey; title: string; help?: string; now: AppearanceNow; change: (part: Partial<Appearance>) => void }) {
  const value = pickerValue(now.resolved, k)
  const [text, setText] = useState(value)
  const typing = useRef(false)
  useEffect(() => {
    if (!typing.current) setText(value)
  }, [value])
  const custom = Boolean(now.look.colours[k]) || (k === 'accent' && now.look.accent !== 'look')
  const set = (hex: string) => change({ colours: { ...now.look.colours, [k]: hex.toUpperCase() } })
  const clear = () => {
    const colours = { ...now.look.colours }
    delete colours[k]
    change({ colours, ...(k === 'accent' ? { accent: 'look' as AccentId } : {}) })
  }
  const reads = readsAs(k, now.resolved)
  const id = `ap-c-${k}`
  return (
    <div className="sline">
      <Label id={id} title={title} help={reads ? reads.text : help} tone={reads && !reads.ok ? 'hold' : undefined} />
      {custom && (
        <button className="lk" onClick={clear}>
          Use the look’s own
        </button>
      )}
      <span className="apcol">
        <input type="color" aria-labelledby={id} value={value.toLowerCase()} onChange={(e) => set(e.target.value)} />
        <input
          type="text"
          className="aphex"
          aria-label={`${title} as a hex code`}
          maxLength={7}
          spellCheck={false}
          value={text}
          onFocus={() => (typing.current = true)}
          onBlur={() => {
            typing.current = false
            setText(value)
          }}
          onChange={(e) => {
            const v = e.target.value.trim()
            setText(v)
            if (isHex(v)) set(v)
          }}
        />
      </span>
    </div>
  )
}

function ColoursTab({ now, change }: { now: AppearanceNow; change: (part: Partial<Appearance>) => void }) {
  const glows: [ColourKey, string][] = [
    ['glow-1', 'Glow, top left'],
    ['glow-2', 'Glow, right'],
    ['glow-3', 'Glow, bottom']
  ]
  return (
    <div className="sgrp">
      {COLOUR_ROWS.map(([k, title, help]) => (
        <ColourRow key={k} k={k} title={title} help={help} now={now} change={change} />
      ))}
      <div className="sline">
        <Label id="ap-glows" title="Glow colours" help="The three soft lights behind the page." />
        <span className="apcol" role="group" aria-labelledby="ap-glows">
          {glows.map(([k, name]) => (
            <input key={k} type="color" aria-label={name} value={pickerValue(now.resolved, k).toLowerCase()} onChange={(e) => change({ colours: { ...now.look.colours, [k]: e.target.value.toUpperCase() } })} />
          ))}
        </span>
      </div>
      <div className="sline">
        <Label title="Lines" help="The thin lines between rows and around panels." />
        <Segmented label="Lines" value={now.look.lines} options={LINES.map((l): [Lines, string] => [l, l === 'soft' ? 'Soft' : l === 'standard' ? 'Standard' : 'Strong'])} onChange={(lines) => change({ lines })} />
      </div>
    </div>
  )
}

const BOLD_NAMES: Record<Boldness, string> = { [-100]: 'Lighter', 0: 'Regular', 100: 'Bolder', 200: 'Bold' }

function TextTab({ look, change }: { look: Appearance; change: (part: Partial<Appearance>) => void }) {
  return (
    <div className="sgrp">
      <div className="sline">
        <Label id="ap-font" title="Font" help="Mac fonts only, so nothing is downloaded." />
        <PopUp labelledBy="ap-font" value={look.font} options={FONTS.map((f): [string, string] => [f.id, f.name])} onChange={(v) => change({ font: v as FontId })} />
      </div>
      <div className="sline">
        <Label title="Boldness" help="Every weight, a step lighter or heavier." />
        <Segmented label="Boldness" value={String(look.boldness)} options={BOLDNESS.map((b): [string, string] => [String(b), BOLD_NAMES[b]])} onChange={(v) => change({ boldness: Number(v) as Boldness })} />
      </div>
      <RangeRow id="ap-size2" title="Text size" help="Everything grows together, the report too." value={look.size} range={SIZE} unit="%" onChange={(size) => change({ size })} />
    </div>
  )
}

const GLASS_NAMES: Record<Glass, string> = { clear: 'Clear', frosted: 'Frosted', solid: 'Solid' }

function ShapeTab({ look, change }: { look: Appearance; change: (part: Partial<Appearance>) => void }) {
  return (
    <div className="sgrp">
      <RangeRow id="ap-corners" title="Corners" help="From square to round. Every corner follows the panels’." value={look.corners} range={CORNERS} unit=" px" onChange={(corners) => change({ corners })} />
      <div className="sline">
        <Label title="Glass" help="How much of the glow shows through the panels." />
        <Segmented label="Glass" value={look.glass} options={GLASSES.map((g): [Glass, string] => [g, GLASS_NAMES[g]])} onChange={(glass) => change({ glass })} />
      </div>
    </div>
  )
}

function ChartTab({ now, change }: { now: AppearanceNow; change: (part: Partial<Appearance>) => void }) {
  return (
    <div className="sgrp">
      <RatingsRow look={now.look} change={change} />
      <ColourRow k="chart-company" title="Company line" help="The accent, unless you pick one." now={now} change={change} />
      <ColourRow k="chart-peers" title="Peers line" now={now} change={change} />
      <ColourRow k="chart-sp500" title="S&P 500 line" now={now} change={change} />
    </div>
  )
}

// ---------- theme files ----------

function ImportButton({ className, notify, onProblem, children }: { className: string; notify: Notify; onProblem: (why: string | null) => void; children: ReactNode }) {
  const [busy, setBusy] = useState(false)
  const run = async () => {
    if (busy) return
    setBusy(true)
    const opened = await window.tearsheet.openTheme().catch(() => ({ ok: false as const, message: 'That file couldn’t be opened. Nothing changed.' }))
    setBusy(false)
    if (!opened.ok) {
      if (!('cancelled' in opened && opened.cancelled)) onProblem('message' in opened ? opened.message : 'That file couldn’t be opened. Nothing changed.')
      return
    }
    const done = importTheme(opened.text)
    if (!done.ok) return onProblem(done.message)
    onProblem(null)
    const skipped = done.skipped ? `${done.skipped} part${done.skipped === 1 ? '' : 's'} couldn’t be used and ${done.skipped === 1 ? 'was' : 'were'} skipped.` : 'It’s with your looks now.'
    notify(`Imported “${done.name}”`, skipped, 'ok', { action: { label: 'Undo', run: () => restore(done.before) } })
  }
  return (
    <button className={className} disabled={busy} onClick={() => void run()}>
      {children}
    </button>
  )
}

// Theme files and Reset. `problem` is why the last import or export didn't work; the gallery's
// Import card sets it too, so the page keeps it.
function ThemeFile({ now, notify, problem, onProblem }: { now: AppearanceNow; notify: Notify; problem: string | null; onProblem: (why: string | null) => void }) {
  const [busy, setBusy] = useState(false)
  const plain = now.picked === 'tearsheet' && sameLook(now.look, DEFAULT_APPEARANCE)

  const exportLook = async () => {
    if (busy) return
    setBusy(true)
    const name = lookName(now).replace(/^Custom, based on /, 'My ')
    const saved = await window.tearsheet.saveTheme(name, themeText(now.look, name)).catch(() => ({ ok: false as const, message: 'Tearsheet couldn’t save the file.' }))
    setBusy(false)
    if (saved.ok) {
      onProblem(null)
      notify('Look exported', `Saved as ${saved.file.split('/').pop() ?? saved.file}.`, 'ok')
    } else if (!('cancelled' in saved && saved.cancelled)) onProblem('message' in saved ? saved.message : 'Tearsheet couldn’t save the file.')
  }
  const reset = () => {
    const before = resetLook()
    onProblem(null)
    notify('Back to Tearsheet’s own look', 'Your saved looks are still there.', 'ok', { action: { label: 'Undo', run: () => restore(before) } })
  }

  return (
    <div className="sgrp">
      <div className="sline">
        <Label title="Theme file" help="Save your look as a file to share, or open one someone sent you." />
        <span className="acts">
          <ImportButton className="pb" notify={notify} onProblem={onProblem}>
            Import…
          </ImportButton>
          <button className="pb" disabled={busy} onClick={() => void exportLook()}>
            Export…
          </button>
        </span>
      </div>
      {problem && (
        <p className="fine bad sfine" role="alert">
          {problem}
        </p>
      )}
      <div className="sline">
        <Label title="Reset" help="Back to Tearsheet’s own look. Your saved looks stay." />
        <button className="pb" disabled={plain} onClick={reset}>
          Reset to default
        </button>
      </div>
    </div>
  )
}
