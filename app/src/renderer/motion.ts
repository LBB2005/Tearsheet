// How Tearsheet moves, decided in one place. Liam's rule (2026-11-06), the Animations level
// "Subtle", which is the default:
// - Big entrances play once: a report's own entrance (its panels rising, rings and lines
//   drawing) the first time that report is ever opened, and the home page's build-up when the
//   app opens. Every other page comes in with one quick fade of about 150 ms.
// - Changes in place never replay an entrance or leave a blank frame: another report, ⌘1 / ⌘2,
//   and the chart (which draws its line once as it opens, then glides; chart/glide.ts).
// - Under the Mac's Reduce motion setting, or with Animations set to Off, nothing moves.
// "Full" is the earlier way: every page and report plays its entrance each time it shows.
//
// Kept in localStorage:
//   motion.level        'full', 'subtle' or 'off' (Subtle if none). The page carries it as
//                       data-motion on <html>, for the CSS (styles.css).
//   motion.seenReports  the reports whose entrance has played, newest last (at most 500).
// The level has no control in Settings yet: whichever Settings change lands second adds one,
// from MOTION_LEVELS and setMotionLevel.

export type MotionLevel = 'full' | 'subtle' | 'off'

export const MOTION_LEVELS: { level: MotionLevel; label: string; text: string }[] = [
  { level: 'full', label: 'Full', text: 'Every page and report plays its entrance each time it opens.' },
  { level: 'subtle', label: 'Subtle', text: 'Each report plays its entrance the first time you open it; everything else fades in quickly.' },
  { level: 'off', label: 'Off', text: 'Nothing moves.' }
]

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type Root = Pick<Element, 'setAttribute'>

const LEVEL_KEY = 'motion.level'
const SEEN_KEY = 'motion.seenReports'
const SEEN_MAX = 500

const local = (): Store | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const page = (): Root | null => (typeof document === 'undefined' ? null : document.documentElement)

const osReduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function motionLevel(store: Store | null = local()): MotionLevel {
  let value: string | null = null
  try {
    value = store?.getItem(LEVEL_KEY) ?? null
  } catch {
    // The default applies.
  }
  return value === 'full' || value === 'off' ? value : 'subtle'
}

// The level in force: Reduce motion on the Mac counts as Off.
const now = (level: MotionLevel): MotionLevel => (osReduced() ? 'off' : level)

// Keeps the choice and applies it to the page at once.
export function setMotionLevel(level: MotionLevel, store: Store | null = local(), root: Root | null = page()): void {
  try {
    store?.setItem(LEVEL_KEY, level)
  } catch {
    // Not kept; it still applies until the window reloads.
  }
  root?.setAttribute('data-motion', level)
}

// At start-up (main.tsx), so the CSS knows the level before anything shows.
export function applyMotionLevel(store: Store | null = local(), root: Root | null = page()): void {
  root?.setAttribute('data-motion', motionLevel(store))
}

// Nothing waits, and nothing moves: the Mac's Reduce motion, or Animations set to Off.
export function reduced(level: MotionLevel = motionLevel()): boolean {
  return now(level) === 'off'
}

// ---------- pages ----------

// The pages that have come in once since the app opened.
const pagesSeen = new Set<string>()

// Whether a page coming into view builds up part by part (styles.css, `enter`) or comes in with
// one quick fade (`quiet`). Asked once each time a page comes in. Under Subtle only the home
// page's first showing since the app opened builds up; `page` is the frame's key, so the run
// view ('home-run') is a page of its own.
export function pageEntrance(name: string, level: MotionLevel = motionLevel(), seen: Set<string> = pagesSeen): boolean {
  const first = !seen.has(name)
  seen.add(name)
  const l = now(level)
  return l === 'full' || (l === 'subtle' && name === 'home' && first)
}

// How long a page takes to leave before the next one comes in. Only Full keeps the old fade and
// lift (the CSS class `leave`); otherwise the next page takes its place at once.
export function pageLeaveMs(level: MotionLevel = motionLevel()): number {
  return now(level) === 'full' ? 240 : 0
}

// ---------- reports ----------

function seenReports(store: Store | null): string[] {
  try {
    const list: unknown = JSON.parse(store?.getItem(SEEN_KEY) ?? '[]')
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

// Whether a report's frame plays the report's own entrance (render_html's `motion`). Under
// Subtle, only the first time that report is ever opened.
export function reportEntrance(reportId: string, level: MotionLevel = motionLevel(), store: Store | null = local()): boolean {
  const l = now(level)
  if (l !== 'subtle') return l === 'full'
  return !seenReports(store).includes(reportId)
}

// The report's frame is on show: its entrance has had its turn.
export function markReportSeen(reportId: string, store: Store | null = local()): void {
  const list = seenReports(store).filter((id) => id !== reportId)
  list.push(reportId)
  try {
    store?.setItem(SEEN_KEY, JSON.stringify(list.slice(-SEEN_MAX)))
  } catch {
    // Not kept; the entrance plays once more next time.
  }
}

// ---------- timings for A. Settle that scripts need ----------

// How long the run view holds the "report ready" moment before the report opens.
export function readyPauseMs(): number {
  return reduced() ? 0 : 1600
}

// How long an overlay takes to leave (the CSS class `leave`: it fades and lifts 8 px).
export function leaveMs(): number {
  return reduced() ? 0 : 240
}

// How long the chart split takes to slide away when it closes (chart/chart.css, `closing`).
export function splitOutMs(): number {
  return reduced() ? 0 : 300
}
