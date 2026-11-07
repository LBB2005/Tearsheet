// "The chart opens on" on Settings' General page: the range the chart shows first, kept in the
// window's own storage (chart/prefs.ts, startRange; 1Y until it is picked). The chart opens at
// Half every time, and its own buttons set Narrow, Half, Wide or Full. It has a file of its own
// so a change to the chart's starting choice stays in one place.

import { useState } from 'react'

import { setStartRange, startRange } from '../chart/prefs'
import { RANGE_ORDER, type Range } from '../chart/series'
import { Label, PopUp } from './General'

// Each range as the menu names it, in the chart's own order.
const RANGE_NAMES: Record<Range, string> = {
  '1W': '1 week',
  '1M': '1 month',
  '3M': '3 months',
  '6M': '6 months',
  YTD: 'Year to date',
  '1Y': '1 year',
  '5Y': '5 years',
  All: 'All'
}

export function ChartChoice() {
  const [opensOn, setOpensOn] = useState<Range>(() => startRange())
  const pick = (value: string) => {
    const range = RANGE_ORDER.find((r) => r === value)
    if (!range) return
    setStartRange(range)
    setOpensOn(range)
  }
  return (
    <div className="sline">
      <Label id="set-opens" title="The chart opens on" help="It always opens at half width. ⌘3 opens and closes it." />
      <PopUp labelledBy="set-opens" value={opensOn} options={RANGE_ORDER.map((r) => [r, RANGE_NAMES[r]])} onChange={pick} />
    </div>
  )
}
