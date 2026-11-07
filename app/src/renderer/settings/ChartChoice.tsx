// "When the chart opens" on Settings' General page, kept in the window's own storage
// (chart/prefs.ts); the chart reads it each time it opens. It has a file of its own so a change
// to the chart's starting choice stays in one place.

import { useState } from 'react'

import { chartOpens, setChartOpens } from '../chart/prefs'
import type { ChartOpens } from '../chart/split'
import { Label, PopUp } from './General'

const OPENS: [ChartOpens, string][] = [
  ['full', 'Full'],
  ['half', 'Half'],
  ['last', 'Where I left it']
]

export function ChartChoice() {
  const [opens, setOpens] = useState<ChartOpens>(() => chartOpens())
  const pick = (value: string) => {
    const next = OPENS.find(([v]) => v === value)?.[0] ?? 'last'
    setChartOpens(next)
    setOpens(next)
  }
  return (
    <div className="sline">
      <Label id="set-opens" title="When the chart opens" help="⌘3 opens and closes it. Full never covers the sidebar." />
      <PopUp labelledBy="set-opens" value={opens} options={OPENS} onChange={pick} />
    </div>
  )
}
