// The report's numbers for the panel's bigger views (get_report_numbers), loaded the first time a
// view other than the price chart shows, and again when `version` changes: the price chart's
// full-history download makes the longer total-return spans available.

import { useCallback, useEffect, useRef, useState } from 'react'

import type { ReportNumbers } from '../../shared/protocol'

interface Loaded {
  reportId: string
  numbers: ReportNumbers
}

// Only the numbers for this report: another report's load never shows for it. An older load of
// the same report stays on show while a newer one loads, so a view never blanks.
export function currentNumbers(loaded: Loaded | null, reportId: string | null): ReportNumbers | null {
  return loaded !== null && reportId !== null && loaded.reportId === reportId ? loaded.numbers : null
}

const UNANSWERED = 'Tearsheet’s engine didn’t answer.'

export function useReportNumbers(reportId: string | null, wanted: boolean, version: number): { numbers: ReportNumbers | null; problem: string | null; retry: () => void } {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState<{ reportId: string; problem: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  // The last load asked for, so only the newest answer counts, and a view switching or the price
  // chart showing in between never asks twice.
  const latest = useRef(0)
  const askedFor = useRef('')

  useEffect(() => {
    if (!wanted || !reportId) return
    const key = JSON.stringify([reportId, version, attempt])
    if (askedFor.current === key) return
    askedFor.current = key
    const ask = ++latest.current
    const id = reportId
    const done = (numbers: ReportNumbers | null, problem: string) => {
      if (ask !== latest.current) return
      if (numbers) {
        setLoaded({ reportId: id, numbers })
        setFailed(null)
      } else {
        // A failed load is asked for again the next time a view wants it, or by Try again.
        askedFor.current = ''
        setFailed({ reportId: id, problem })
      }
    }
    window.tearsheet.getReportNumbers(id).then(
      (r) => (r.ok && r.result ? done(r.result, '') : done(null, r.error?.message || UNANSWERED)),
      (e: unknown) => done(null, e instanceof Error ? e.message : UNANSWERED)
    )
  }, [reportId, wanted, version, attempt])

  const retry = useCallback(() => {
    setFailed(null)
    setAttempt((n) => n + 1)
  }, [])

  const numbers = currentNumbers(loaded, reportId)
  // A newer load that failed leaves the older numbers on show, which are still this report's.
  const problem = numbers === null && failed !== null && failed.reportId === reportId ? failed.problem : null
  return { numbers, problem, retry }
}
