// A low-to-high bar with marks on it: the report's range with the close and the rating-change
// prices (dig.ts rangeSpots), or the analysts' targets with our base. Positions are percents
// across the bar, worked out before; this only draws them. The section lists the values beside
// matching keys, so the bar carries no labels of its own to collide.

export interface Mark {
  key: string
  at: number
  title: string
}

export function RangeBar({ from, to, marks, label }: { from: number; to: number; marks: Mark[]; label: string }) {
  return (
    <div className="dbar" role="img" aria-label={label}>
      <i className="band" style={{ left: `${from}%`, width: `${Math.max(to - from, 0.5)}%` }} />
      {marks.map((m) => (
        <i key={m.key} className={`mk ${m.key}`} style={{ left: `${m.at}%` }} title={m.title} />
      ))}
    </div>
  )
}
