// The width of the report's numbers column, beside the Summary / Full report text, which Liam sets
// by dragging the line between the two columns (report/NumbersSizer.tsx). The arrow keys move the
// line too, and a double-click (or Return) puts back the usual width. It is the same on every
// report and kept between launches (Liam's pick, 12 Nov 2026).
//
// The report's own CSS draws the columns (engine report.html.j2 .nums): the numbers column takes
// the width kept here, the text column keeping at least TEXT_MIN and the numbers at least
// NUMBERS_MIN. So as the window narrows the text gives way first, then the numbers; as it widens
// the text takes the room, and the numbers keep the width set. The page does this by CSS alone,
// so a window resize needs nothing from here. The engine keeps the same numbers (render.py,
// checked in numbersWidth.test.ts).
//
// The frame's page runs one fixed script that takes a new width from the app as it is dragged
// (engine render.FRAME_SCRIPT, allowed there and in index.html by its hash alone), so the column
// moves with the pointer and the report never loads again.
//
// Kept in localStorage as report.numbersWidth, in whole pixels; none means the usual width.

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export const NUMBERS_DEFAULT = 548
export const NUMBERS_MIN = 320
export const TEXT_MIN = 312
// The widest a width is kept at: wider than any screen's report, so it is only a guard.
export const NUMBERS_KEEP_MAX = 4000
// One arrow key press; with Shift, a bigger step.
export const NUMBERS_STEP = 16
export const NUMBERS_BIG_STEP = 64

const KEY = 'report.numbersWidth'

const local = (): Store | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

// A width to keep, in whole pixels. Anything that isn't a number is the usual width.
export function keepable(px: number): number {
  if (!Number.isFinite(px)) return NUMBERS_DEFAULT
  return Math.min(NUMBERS_KEEP_MAX, Math.max(NUMBERS_MIN, Math.round(px)))
}

// The width kept, or the usual one.
export function numbersWidth(store: Store | null = local()): number {
  let value: string | null = null
  try {
    value = store?.getItem(KEY) ?? null
  } catch {
    // The usual width applies.
  }
  return value === null || value.trim() === '' ? NUMBERS_DEFAULT : keepable(Number(value))
}

// Keeps a width. Returns the width kept.
export function setNumbersWidth(px: number, store: Store | null = local()): number {
  const width = keepable(px)
  try {
    if (width === NUMBERS_DEFAULT) store?.removeItem(KEY)
    else store?.setItem(KEY, String(width))
  } catch {
    // Not kept; it still shows until the report page is opened again.
  }
  return width
}

// The widest the numbers column can be in a report `frame` px wide: the text keeps TEXT_MIN.
export function widest(frame: number): number {
  return Math.max(NUMBERS_MIN, Math.round(frame) - TEXT_MIN)
}

// The width the numbers column shows at in a report `frame` px wide, as the page's CSS works it
// out: clamp(NUMBERS_MIN, width, frame - TEXT_MIN).
export function shownWidth(px: number, frame: number): number {
  return Math.max(NUMBERS_MIN, Math.min(keepable(px), widest(frame)))
}

// The width a key asks for on the line, or null for a key the line doesn't use: ← and → a step
// narrower or wider (Shift, a bigger step), Home and End the narrowest and the widest the report
// allows now, Return the usual width.
export function keyWidth(key: string, width: number, frame: number, shift = false): number | null {
  const step = shift ? NUMBERS_BIG_STEP : NUMBERS_STEP
  if (key === 'ArrowLeft') return shownWidth(width - step, frame)
  if (key === 'ArrowRight') return shownWidth(width + step, frame)
  if (key === 'Home') return NUMBERS_MIN
  if (key === 'End') return widest(frame)
  if (key === 'Enter') return NUMBERS_DEFAULT
  return null
}

// The width a drag asks for: where it started, moved by how far the pointer has gone, inside what
// the report allows now.
export function dragWidth(from: number, startX: number, x: number, frame: number): number {
  return shownWidth(from + x - startX, frame)
}

// What the frames' script takes: a message with the width, which it checks once more.
export const widthMessage = (px: number) => ({ tearsheetNumbersWidth: keepable(px) })

// The style block a frame starts with, so it draws at the width kept before its script runs.
export const widthCss = (px: number) => `:root{--nums-w:${keepable(px)}px}`
