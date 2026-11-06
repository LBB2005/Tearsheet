// Whether the window is wide enough for the sidebar beside the page. Below 1,100 px the sidebar
// is hidden, and its button opens it over the page instead (the spec's "Narrow windows").

import { useEffect, useState } from 'react'

export const WIDE_MIN_PX = 1100

const QUERY = `(min-width: ${WIDE_MIN_PX}px)`

export function useWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(QUERY).matches)
  useEffect(() => {
    const media = window.matchMedia(QUERY)
    const update = () => setWide(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return wide
}
