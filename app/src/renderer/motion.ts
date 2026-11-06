// How long the Progress view holds the "report ready" moment before the report opens. Nothing
// waits under the Mac's Reduce motion setting.
export function readyPauseMs(): number {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1600
}
