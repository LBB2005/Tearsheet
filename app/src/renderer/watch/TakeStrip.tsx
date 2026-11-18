// The Watchlist's take line (engine dig/take_line.py): Write takes on each company, one after
// another. While it goes: the one under way and the ones waiting, each of which can be taken out,
// and Cancel all. Paused: why, in the report line's words (home/line.ts), with Carry on. Once
// finished: how it went, with Done to put it away. Each take opens on its company's Dig deeper.

import type { LineState } from '../../shared/protocol'
import { ConfirmButton } from '../home/Confirm'
import { linePlace, plural, REOPENED, someNames, USAGE_WEEK, waitsByItself, waitText } from '../home/line'

export interface TakeStripProps {
  line: LineState
  onRemove: (ticker: string) => void
  onCarryOn: () => void
  onClear: () => void
}

export function TakeStrip({ line, onRemove, onCarryOn, onClear }: TakeStripProps) {
  const pause = line.paused
  const names = line.waiting.map((i) => i.ticker)
  const going = line.writing !== null || names.length > 0
  if (!going && !pause && line.finished.length === 0) return null

  if (pause) {
    const byItself = waitsByItself(pause)
    const why = pause.code === REOPENED ? pause.message : byItself || pause.code === USAGE_WEEK ? waitText(pause) : pause.message
    return (
      <section className="glass wtakes" aria-label="Takes">
        <div className="wth">
          <b>{byItself ? 'Takes are waiting' : 'Takes are paused'}</b>
        </div>
        <p className="fine" role="status">
          {why} {names.length ? `${someNames(names)} ${names.length === 1 ? 'is' : 'are'} waiting.` : ''}
        </p>
        <div className="wtrow">
          {names.length > 0 && (
            <button className="btn2 sm" onClick={onCarryOn}>
              {byItself ? 'Carry on now' : 'Carry on'}
            </button>
          )}
          <ConfirmButton label="Cancel all" question={`Drop the ${plural(names.length, 'take', 'takes')} waiting?`} yes="Cancel all takes" no="Keep them" onConfirm={onClear} />
        </div>
      </section>
    )
  }

  if (going) {
    const place = linePlace(line)
    return (
      <section className="glass wtakes" aria-label="Takes">
        <div className="wth">
          <b>Writing takes</b>
          <span className="fine">{line.writing ? `${place.at} of ${place.total}: ${line.writing.ticker} now` : `${names.length} waiting`}</span>
        </div>
        {names.length > 0 && (
          <ul className="wtchips" aria-label="Waiting">
            {line.waiting.map((i) => (
              <li key={i.ticker} title={i.name}>
                <b>{i.ticker}</b>
                <button aria-label={`Take ${i.ticker} out of the takes`} onClick={() => onRemove(i.ticker)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="wtrow">
          <ConfirmButton
            label="Cancel all"
            question={line.writing ? (names.length ? `Stop this take and drop the ${plural(names.length, 'waiting', 'waiting')}?` : 'Stop this take?') : `Drop the ${plural(names.length, 'take', 'takes')} waiting?`}
            yes="Cancel all takes"
            no="Keep going"
            onConfirm={onClear}
          />
        </div>
      </section>
    )
  }

  const ready = line.finished.filter((i) => i.outcome === 'ready').length
  const missed = line.finished.filter((i) => i.outcome !== 'ready' && i.outcome !== 'cancelled')
  return (
    <section className="glass wtakes" aria-label="Takes">
      <div className="wth">
        <b>Takes written</b>
      </div>
      <p className="fine">
        {ready} of {line.finished.length} written.{missed.map((i) => ` ${i.ticker}: ${i.message ?? 'it wasn’t written'}`).join('')}
      </p>
      <div className="wtrow">
        <button className="btn2 sm" onClick={onClear}>
          Done
        </button>
      </div>
    </section>
  )
}
