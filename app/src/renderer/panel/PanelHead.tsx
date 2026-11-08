// The parts of the panel's head that every view shares with the price chart: the switch back to
// the price chart, and the width buttons with the close button. pages/Report.tsx builds them once,
// so the price chart and the view beside it never differ.

import { useLayoutEffect, useRef } from 'react'

import type { ViewId } from '../../main/navigation'
import { PRESETS, type Preset, type SnapMode } from '../chart/split'

import './panel.css'

const PRESET_WORDS: Record<Preset, string> = { narrow: 'Narrow', half: 'Half', wide: 'Wide', full: 'Full' }

const CLOSE = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

// Using the switch hides the pane it sits in (the price chart's stays mounted, hidden; a view's
// goes), and the focus would fall to the page with it. So a use is noted here, and the switch in
// the pane now showing puts the focus on its pressed button, where the keyboard left off.
let refocus = false

// Between the price chart and the last view opened from the report. Until a view has opened,
// the panel only ever shows the price chart, so there is nothing to switch to.
export function PanelSwitch({ view, last, title, onShow }: { view: ViewId; last: ViewId | null; title: (view: ViewId) => string; onShow: (view: ViewId) => void }) {
  const group = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!refocus) return
    const pressed = group.current?.querySelector<HTMLButtonElement>('button.on')
    pressed?.focus()
    // The hidden price chart's switch can't take the focus, so the note waits for the one showing.
    if (pressed && document.activeElement === pressed) refocus = false
  }, [view])
  if (last === null) return null
  const name = title(last)
  // The button already pressed changes nothing, so no switch would take up the note.
  const show = (next: ViewId) => {
    if (next !== view) refocus = true
    onShow(next)
  }
  return (
    <div ref={group} className="segc pswitch" role="group" aria-label="Panel shows">
      <button className={view === 'price' ? 'on' : ''} aria-pressed={view === 'price'} onClick={() => show('price')}>
        Price chart
      </button>
      <button className={view === last ? 'on' : ''} aria-pressed={view === last} title={name} onClick={() => show(last)}>
        {name}
      </button>
    </div>
  )
}

// The width buttons, in a wide window, and the close button (⌘3), which closes whatever shows.
export function PanelSize({ wide, size, onSize, onClose }: { wide: boolean; size: SnapMode | null; onSize: (p: Preset) => void; onClose: () => void }) {
  return (
    <>
      {wide && (
        <div className="segc cwid" role="group" aria-label="Chart width">
          {PRESETS.map((p) => (
            <button key={p} className={size === p ? 'on' : ''} aria-pressed={size === p} onClick={() => onSize(p)}>
              {PRESET_WORDS[p]}
            </button>
          ))}
        </div>
      )}
      <button className="ibtn" aria-label="Close the panel" title="Close the panel (⌘3)" onClick={onClose}>
        {CLOSE}
      </button>
    </>
  )
}
