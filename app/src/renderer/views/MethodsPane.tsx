// Value per share by method, opened bigger: a dot for each method on one line, with the 12-month
// range as a band and today’s price and the estimate as lines. This file is MethodsPane, not
// Methods, because Methods.ts would be read as methods.ts beside it on a case-insensitive disk.

import { useEffect, useRef, useState, type ReactElement } from 'react'

import type { MethodItem } from '../../shared/protocol'
import { money } from '../report/bar'
import { ViewFrame, type ViewProps } from '../panel/ViewFrame'
import { viewTitle } from '../panel/titles'
import { canShow, methodsScale, type MethodsState } from './methods'
import { pickKey } from './pick'
import { at } from './scale'

import './views.css'

// What is pointed at or focused: a method, or one of the marks in the strip above them.
type Pointed = { kind: 'method'; method: string } | { kind: 'range' | 'price' | 'estimate' }

export function Methods({ chrome, numbers, ticker, item, state, setState }: ViewProps<MethodsState>): ReactElement {
  const methods: MethodItem[] | null = numbers.methods && numbers.methods.length > 0 ? numbers.methods : null
  const [pointed, setPointed] = useState<Pointed | null>(null)
  const picked = methods ? pickKey(item, methods, (m) => m.method) : null
  const pickedMethod = methods && picked !== null ? methods[picked].method : null
  const pickedRow = useRef<HTMLDivElement | null>(null)
  const scrolled = useRef(false)
  const stored = canShow(numbers)

  // The row the link named comes into view once; after that the reader scrolls for themselves.
  useEffect(() => {
    if (scrolled.current || !pickedRow.current) return
    scrolled.current = true
    pickedRow.current.scrollIntoView({ block: 'nearest' })
  })

  // Nothing pointed at reads as the estimate, which is the view’s headline number.
  let readout: string | null = numbers.estimate?.readout ?? null
  if (pointed?.kind === 'method') readout = methods?.find((m) => m.method === pointed.method)?.readout ?? readout
  else if (pointed?.kind === 'range') readout = numbers.range?.readout ?? readout
  else if (pointed?.kind === 'price') readout = numbers.price?.readout ?? readout

  const toggle = (key: keyof MethodsState, label: string, swatch: string, what: string) => (
    <button
      className={state[key] && stored[key] ? 'tg on' : 'tg'}
      aria-pressed={state[key] && stored[key]}
      disabled={!stored[key]}
      title={stored[key] ? undefined : `${what} isn’t stored for this report.`}
      onClick={() => setState({ ...state, [key]: !state[key] })}
    >
      <i style={{ background: swatch }} />
      {label}
    </button>
  )
  const controls = (
    <>
      {toggle('range', '12-month range', 'var(--accent2)', 'The 12-month range')}
      {toggle('price', 'Today’s price', 'var(--hold)', 'Today’s price')}
      {toggle('estimate', 'Estimate', 'var(--accent)', 'The estimate')}
    </>
  )

  if (!methods)
    return (
      <ViewFrame chrome={chrome} title={viewTitle('methods', null)} subtitle={ticker} readout={readout}>
        <p className="vgap">Value per share by method isn’t stored for this report.</p>
      </ViewFrame>
    )

  const scale = methodsScale(numbers, state)
  const range = state.range ? numbers.range : null
  const price = state.price ? numbers.price : null
  const estimate = state.estimate ? numbers.estimate : null
  // The range, today's price and the estimate, drawn again in each row's track, under the
  // method's dot: in line with the marks in the strip above, and never across a name or a value.
  const marks = (
    <>
      {range && <i className="vband" aria-hidden="true" style={{ left: `${at(range.bear, scale)}%`, width: `${at(range.bull, scale) - at(range.bear, scale)}%` }} />}
      {price && <i className="vline price" aria-hidden="true" style={{ left: `${at(price.value, scale)}%` }} />}
      {estimate && <i className="vline est" aria-hidden="true" style={{ left: `${at(estimate.value, scale)}%` }} />}
    </>
  )
  const hover = (p: Pointed) => ({ onPointerEnter: () => setPointed(p), onFocus: () => setPointed(p), onBlur: () => setPointed(null) })

  return (
    <ViewFrame chrome={chrome} title={viewTitle('methods', null)} subtitle={ticker} readout={readout} controls={controls}>
      <div className="vplot" onPointerLeave={() => setPointed(null)}>
        <div className="vhead">
          {range && (
            <button
              className="vmark range"
              style={{ left: `${at(range.bear, scale)}%`, width: `${at(range.bull, scale) - at(range.bear, scale)}%` }}
              aria-label="12-month range"
              {...hover({ kind: 'range' })}
            />
          )}
          {price && <button className="vmark tick price" style={{ left: `${at(price.value, scale)}%` }} aria-label="Today’s price" {...hover({ kind: 'price' })} />}
          {estimate && <button className="vmark tick est" style={{ left: `${at(estimate.value, scale)}%` }} aria-label="Estimate" {...hover({ kind: 'estimate' })} />}
        </div>
        <div className="vrows">
          {methods.map((m) => (
            <div
              key={m.method}
              ref={m.method === pickedMethod ? pickedRow : undefined}
              className={m.method === pickedMethod ? 'mrow picked' : 'mrow'}
              tabIndex={0}
              {...hover({ kind: 'method', method: m.method })}
            >
              <span className="mname">{m.label}</span>
              <span className="mval">{money.format(m.value)}</span>
              <span className="mtrack">
                {marks}
                <i className="mdot" style={{ left: `${at(m.value, scale)}%` }} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </ViewFrame>
  )
}
