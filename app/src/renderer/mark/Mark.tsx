// The Tearsheet mark (the Glass icon) as a React component. With `fill` (0–1) the price line
// draws in over a dim track, following a report's 14 steps. The SVG is built by markSvg() from
// fixed numbers and contains no user data, so it is safe to set as markup.

import './mark.css'

import { useId } from 'react'

import { markSvg } from './drawing'

export function Mark({ size, fill }: { size: number; fill?: number }) {
  const id = 'mk' + useId().replace(/[^A-Za-z0-9_-]/g, '')
  return (
    <span
      className="mark"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: markSvg({ small: size <= 32, fill, id }) }}
    />
  )
}
