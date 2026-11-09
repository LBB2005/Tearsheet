// Small pieces the setup screens share: icons, the progress ring, cards, a line to copy, and a
// wrapper that fades a line up when it changes in place.

import { useRef, useState, type CSSProperties, type ReactNode } from 'react'

// A part's place in the A. Settle entrance (class mv): 70 ms apart.
export const at = (i: number): CSSProperties => ({ ['--i' as string]: i })

export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

export function ExternalIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  )
}

// A small spinning ring, for waiting. It stands still under Reduce motion.
export function Spinner() {
  return <span className="sp" aria-hidden="true" />
}

// A progress ring: `p` from 0 to 1, drawn clockwise from the top.
export function Ring({ p, size, width }: { p: number; size: number; width: number }) {
  const c = size / 2
  const r = size / 2 - width / 2 - 1
  const offset = 100 - Math.round(Math.min(1, Math.max(0, p)) * 1000) / 10
  return (
    <svg className="ring" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle className="rt" cx={c} cy={c} r={r} strokeWidth={width} />
      <circle className="rf" cx={c} cy={c} r={r} strokeWidth={width} pathLength={100} strokeDasharray={100} style={{ strokeDashoffset: offset }} transform={`rotate(-90 ${c} ${c})`} />
    </svg>
  )
}

export function Card({ i, className, children }: { i: number; className?: string; children: ReactNode }) {
  return (
    <div className={className ? `card mv ${className}` : 'card mv'} style={at(i)}>
      {children}
    </div>
  )
}

// A line to type in Terminal, with a Copy button. Nothing is run; the person pastes it.
export function CodeLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false)
    )
  }
  return (
    <div className="code">
      <span>{text}</span>
      <button className="cbtn" aria-label={copied ? `Copied: ${text}` : `Copy: ${text}`} onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

// A line that fades up when `k` changes (A. Settle's "changes in place"), but not when it first
// appears with its screen, which has its own entrance. With `live`, a screen reader reads the
// new line out.
export function Changes({ k, className, style, live, children }: { k: string; className: string; style?: CSSProperties; live?: boolean; children: ReactNode }) {
  const first = useRef(k)
  const line = (
    <div key={k} className={k === first.current ? className : `${className} chg`} style={style}>
      {children}
    </div>
  )
  return live ? <div aria-live="polite">{line}</div> : line
}
