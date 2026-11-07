// How the chart's height is shared between the price chart and the volume bars under it. The
// line between them drags (ChartPane), and the share is kept (prefs.ts), so it survives window
// resizes. The price chart always keeps room for two axis labels, and the bars never get too
// short to read; in a plot too short for both, the price chart comes first. Pure.

export const VOL_MIN = 24
export const PRICE_MIN = 90
export const SHARE_DEFAULT = 0.1

// The bars' height in px, in a plot `plotH` px tall (the price chart and the bars together).
export function volumeHeight(share: number, plotH: number, on: boolean): number {
  if (!on) return 0
  const most = plotH - PRICE_MIN
  if (most < VOL_MIN) return Math.max(0, most)
  return Math.min(most, Math.max(VOL_MIN, Math.round(share * plotH)))
}

// A dragged height, as a share to keep.
export function shareFor(volH: number, plotH: number): number {
  return plotH > 0 ? volH / plotH : SHARE_DEFAULT
}
