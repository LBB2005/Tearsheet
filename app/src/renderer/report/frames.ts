// The report's text frames, so the report area is never blank between two of them. When another
// report opens, or the same one loads again (⌘1, ⌘2), the frame on show stays
// until the new one has loaded and faded in over it (report.css, `wait` and `fadein`).

import { useCallback, useEffect, useRef, useState } from 'react'

export interface FrameDoc {
  key: string
  html: string
}

// The frames to keep in the page, oldest first, so a frame already there never moves (an iframe
// moved in the page loads again): the one on show until the asked-for one is in, then that one.
// `current` is the frame asked for, null while it loads; `shown` the last one fully on show.
// After an error, the old report goes, so it can't sit under the error as if it were the new one.
export function textFrames(current: FrameDoc | null, shown: FrameDoc | null, error: boolean): FrameDoc[] {
  const held = !error && shown && shown.key !== current?.key ? [shown] : []
  return current ? [...held, current] : held
}

// How long the frame it replaces stays under a new frame after the new one has loaded. A frame
// says it has loaded a little before it draws its first picture (about 0.1 s in the app), so the
// old one stays a while longer than the 150 ms fade (report.css).
const KEEP_MS = 400

export function useTextFrames(current: FrameDoc | null, error: boolean) {
  const [shown, setShown] = useState<FrameDoc | null>(null)
  // The asked-for frame has loaded and is fading in.
  const [ready, setReady] = useState<string | null>(null)
  const asked = useRef(current)
  asked.current = current
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const loaded = useCallback((key: string) => {
    setReady(key)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const doc = asked.current
      if (doc && doc.key === key) setShown(doc)
    }, KEEP_MS)
  }, [])

  return { frames: textFrames(current, shown, error), shown: shown?.key ?? null, ready, loaded }
}
