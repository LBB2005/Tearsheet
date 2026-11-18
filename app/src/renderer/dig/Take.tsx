// Dig deeper's AI take (engine dig/take.py): five answers to one investor checklist and a Next
// move box, written on a click from this page, the report and the news. Every figure in it was
// filled in by code, every sentence cites its sources (the numbered buttons), and the checks
// removed any sentence they couldn't back. Takes are saved with their date; older ones stay listed.

import { useCallback, useEffect, useState } from 'react'

import type { DigTake, TakeDone, TakeList, TakeSentence } from '../../shared/protocol'
import { ADVICE_SHORT, TAKE_LINE } from '../../shared/wording'
import { clockTime } from '../home/line'
import { Spinner } from '../setup/parts'
import { dayOf } from './dig'
import { doneMessage, EMPTY_ANSWER, removedLine, STEP_LABELS, writtenLine, type TakeStep } from './takeLines'

const why = (r: { error?: { message?: string } }) => r.error?.message ?? 'Tearsheet’s engine didn’t answer.'
const said = (e: unknown) => (e instanceof Error ? e.message : 'Tearsheet’s engine didn’t answer.')

export function Take({ cik, onDone }: { cik: number; onDone: () => void }) {
  const [list, setList] = useState<TakeList | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [tries, setTries] = useState(0)
  // A take on this company under way: its step, or null between the click and the first note.
  const [running, setRunning] = useState(false)
  const [step, setStep] = useState<TakeStep | null>(null)
  const [ended, setEnded] = useState<string | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)

  const load = useCallback(() => {
    window.tearsheet.listTakes(cik).then(
      (r) => {
        if (!r.ok || !r.result) return setFailed(why(r))
        setFailed(null)
        setList(r.result)
        const mine = r.result.running?.cik === cik ? r.result.running : null
        if (mine) {
          setRunning(true)
          setStep(mine.step)
        }
      },
      (e) => setFailed(said(e))
    )
  }, [cik])
  useEffect(load, [load, tries])

  useEffect(
    () =>
      window.tearsheet.onNotification((note) => {
        const p = note.params as { cik?: unknown; step?: unknown }
        if (p.cik !== cik) return
        if (note.method === 'take_progress') {
          setRunning(true)
          setStep(p.step as TakeStep)
        } else if (note.method === 'take_done') {
          setRunning(false)
          setStep(null)
          setEnded(doneMessage(note.params as unknown as TakeDone))
          setChosen(null)
          load()
          onDone()
        }
      }),
    [cik, load, onDone]
  )

  const write = () => {
    setEnded(null)
    setRunning(true)
    setStep(null)
    window.tearsheet.writeTake(cik).then(
      (r) => {
        if (r.ok) return
        setRunning(false)
        setEnded(`The take didn’t start: ${why(r)}`)
        load()
      },
      (e) => {
        setRunning(false)
        setEnded(`The take didn’t start: ${said(e)}`)
      }
    )
  }
  const cancel = () => void window.tearsheet.cancelTake(cik)

  const newest = list?.takes[0] ?? null
  const shown = (chosen && list?.takes.find((t) => t.take_id === chosen)) || newest
  return (
    <section className="glass p dpart wide dtake" aria-label="AI take">
      <h3>
        <span>AI take</span>
        {shown && <small>{writtenLine(shown)}</small>}
      </h3>
      {failed ? (
        <div className="notice error dfail">
          <span>The takes didn’t load: {failed}</span>
          <button className="btn2" onClick={() => setTries((n) => n + 1)}>
            Try again
          </button>
        </div>
      ) : !list ? (
        <p className="loading fine">
          <Spinner />
          Loading…
        </p>
      ) : (
        <>
          <div className="dtbar">
            {running ? (
              <>
                <p className="fine loading">
                  <Spinner />
                  {step ? STEP_LABELS[step] : 'Starting'}…
                </p>
                <button className="plain" onClick={cancel}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button className={newest ? 'plain' : 'primary'} onClick={write} disabled={list.blocked !== null}>
                  {newest ? 'Write a new take' : 'Write the take'}
                </button>
                {list.blocked && <p className="fine">{list.blocked}</p>}
              </>
            )}
          </div>
          {ended && <p className="notice error">{ended}</p>}
          {!shown && !running && (
            <p className="fine dtintro">
              The AI answers five questions from this page, the report and the news, then gives a next move. Every figure comes from Tearsheet’s numbers, and the checks remove any sentence its sources don’t back. It takes a minute or two.
            </p>
          )}
          {shown && <TakeBody key={shown.take_id} take={shown} />}
          {list.takes.length > 1 && (
            <nav className="dearlier" aria-label="Earlier takes">
              <span className="fine">Takes:</span>
              {list.takes.map((t, i) => (
                <button key={t.take_id} className="plain sm" aria-pressed={t === shown} onClick={() => setChosen(i === 0 ? null : t.take_id)}>
                  {i === 0 ? 'Newest' : `${dayOf(t.created_at)}, ${clockTime(t.created_at)}`}
                </button>
              ))}
            </nav>
          )}
        </>
      )}
    </section>
  )
}

// ---------- one take ----------

type Open = { sentence: string; index: number } | null

function TakeBody({ take }: { take: DigTake }) {
  const [open, setOpen] = useState<Open>(null)
  const toggle = (sentence: string, index: number) => setOpen((o) => (o && o.sentence === sentence && o.index === index ? null : { sentence, index }))
  const lines = (sentences: TakeSentence[]) => <Sentences sentences={sentences} open={open} onChip={toggle} />
  return (
    <div className="dtbody">
      <div className="danswers">
        {take.answers.map((a) => (
          <div key={a.key} className="dq">
            <h4>{a.question}</h4>
            {a.sentences.length ? lines(a.sentences) : <p className="fine">{EMPTY_ANSWER}</p>}
          </div>
        ))}
        {take.removed.length > 0 && (
          <details className="dremoved">
            <summary className="fine">{removedLine(take.removed.length)}</summary>
            <ul>
              {take.removed.map((r) => (
                <li key={r.id}>
                  {r.text} <small>({r.reasons.join('; ')})</small>
                </li>
              ))}
            </ul>
          </details>
        )}
        {take.notes.map((n) => (
          <p key={n} className="fine">
            {n}
          </p>
        ))}
      </div>
      <aside className="dnext" role="group" aria-label="Next move">
        <h4>Next move</h4>
        <p className="dprice">{take.next_move.price_line}</p>
        {take.next_move.close_line && <p className="fine">{take.next_move.close_line}</p>}
        <h5>Check first</h5>
        {take.next_move.check_first.length ? lines(take.next_move.check_first) : <p className="fine">{EMPTY_ANSWER}</p>}
        <h5>What would prove it wrong</h5>
        {take.next_move.proven_wrong.length ? lines(take.next_move.proven_wrong) : <p className="fine">{EMPTY_ANSWER}</p>}
        <p className="fine">{TAKE_LINE}</p>
        <p className="fine">{ADVICE_SHORT}</p>
      </aside>
    </div>
  )
}

function Sentences({ sentences, open, onChip }: { sentences: TakeSentence[]; open: Open; onChip: (sentence: string, index: number) => void }) {
  const cited = open ? sentences.find((s) => s.id === open.sentence)?.citations[open.index] : undefined
  return (
    <>
      <p className="dsents">
        {sentences.map((s) => (
          <span key={s.id} className={`dsent ${s.stance}`}>
            {s.text}
            {s.citations.map((c, i) => (
              <button key={c.id} className="dchip" aria-label={`Source ${i + 1}: ${c.label}`} aria-expanded={open?.sentence === s.id && open.index === i} onClick={() => onChip(s.id, i)}>
                {i + 1}
              </button>
            ))}
            {s.note && <small className="dnote">Checker’s note: {s.note}</small>}{' '}
          </span>
        ))}
      </p>
      {cited && (
        <div className="dcite" role="note" aria-label={cited.label}>
          <b>{cited.label}</b>
          <p>{cited.text}</p>
          {cited.url && (
            <button className="plain sm" onClick={() => void window.tearsheet.openExternal(cited.url!)}>
              Open
            </button>
          )}
        </div>
      )}
    </>
  )
}
