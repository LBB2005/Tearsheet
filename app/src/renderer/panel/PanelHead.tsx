// The parts of the panel's head that every view shares with the price chart: the switch back to
// the price chart, and the width buttons with the close button. pages/Report.tsx builds them once,
// so the price chart and the view beside it never differ.

import type { ViewId } from '../../main/navigation'
import { PRESETS, type Preset, type SnapMode } from '../chart/split'

import './panel.css'

const PRESET_WORDS: Record<Preset, string> = { narrow: 'Narrow', half: 'Half', wide: 'Wide', full: 'Full' }

const CLOSE = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

// Between the price chart and the last view opened from the report. Until a view has opened,
// the panel only ever shows the price chart, so there is nothing to switch to.
export function PanelSwitch({ view, last, title, onShow }: { view: ViewId; last: ViewId | null; title: (view: ViewId) => string; onShow: (view: ViewId) => void }) {
  if (last === null) return null
  const name = title(last)
  return (
    <div className="segc pswitch" role="group" aria-label="Panel shows">
      <button className={view === 'price' ? 'on' : ''} aria-pressed={view === 'price'} onClick={() => onShow('price')}>
        Price chart
      </button>
      <button className={view === last ? 'on' : ''} aria-pressed={view === last} title={name} onClick={() => onShow(last)}>
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
