// Timings for A. Settle that scripts need. Nothing waits under the Mac's Reduce motion setting.

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// How long the run view holds the "report ready" moment before the report opens.
export function readyPauseMs(): number {
  return reduced() ? 0 : 1600
}

// How long a page or overlay takes to leave (the CSS class `leave`: it fades and lifts 8 px).
export function leaveMs(): number {
  return reduced() ? 0 : 240
}

// How long the chart split takes to slide away when it closes (chart/chart.css, `closing`).
export function splitOutMs(): number {
  return reduced() ? 0 : 300
}
