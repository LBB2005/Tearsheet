// analystdb's view of a report's company (get_analysts), loaded when the Analyst ratings view
// opens and again by Try again. analystdb being off is an answer (the view's quiet note), not a
// problem; a problem is the engine not answering.

import { useCallback, useEffect, useState } from 'react'

import type { ReportAnalysts } from '../../shared/protocol'

const UNANSWERED = 'Tearsheet’s engine didn’t answer.'

export function useAnalysts(reportId: string): { view: ReportAnalysts | null; problem: string | null; retry: () => void } {
  const [attempt, setAttempt] = useState(0)
  const [got, setGot] = useState<{ view: ReportAnalysts | null; problem: string | null } | null>(null)

  useEffect(() => {
    let live = true
    setGot(null)
    const done = (view: ReportAnalysts | null, problem: string | null) => {
      if (live) setGot({ view, problem })
    }
    window.tearsheet.getAnalysts(reportId).then(
      (r) => (r.ok && r.result ? done(r.result, null) : done(null, r.error?.message || UNANSWERED)),
      (e: unknown) => done(null, e instanceof Error ? e.message : UNANSWERED)
    )
    return () => {
      live = false
    }
  }, [reportId, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { view: got?.view ?? null, problem: got?.problem ?? null, retry }
}
