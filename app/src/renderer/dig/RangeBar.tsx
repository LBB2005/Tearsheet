// A low-to-high bar with marks on it: the report's range with the close and the rating-change
// prices (dig.ts rangeSpots), or the analysts' targets with our base. Positions are percents
// across the bar, worked out before; this only draws them. The section lists the values beside
// matching keys, so the bar carries no labels of its own to collide.

export interface Mark {
  key: string
  at: number
  title: string
}

// `plain`: a band with no low-to-high colouring, for ranges that aren't the report's own (the
// analysts' targets), so it doesn't read as the report's Sell-to-Buy scale.
export function RangeBar({ from, to, marks, label, plain }: { from: number; to: number; marks: Mark[]; label: string; plain?: boolean }) {
  return (
    <div className={plain ? 'dbar plain' : 'dbar'} role="img" aria-label={label}>
      <i className="band" style={{ left: `${from}%`, width: `${Math.max(to - from, 0.5)}%` }} />
      {marks.map((m) => (
        <i key={m.key} className={`mk ${m.key}`} style={{ left: `${m.at}%` }} title={m.title} />
      ))}
    </div>
  )
}
