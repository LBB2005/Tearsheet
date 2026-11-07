// "Animations" on Settings' General page: Full, Subtle (the default) or Off, kept in the window's
// own storage and applied at once (motion.ts, which holds the rule each level follows).

import { useState } from 'react'

import { MOTION_LEVELS, motionLevel, setMotionLevel, type MotionLevel } from '../motion'
import { Label, PopUp } from './General'

export function MotionChoice() {
  const [level, setLevel] = useState<MotionLevel>(() => motionLevel())
  const pick = (value: string) => {
    const chosen = MOTION_LEVELS.find((m) => m.level === value)
    if (!chosen) return
    setMotionLevel(chosen.level)
    setLevel(chosen.level)
  }
  const help = MOTION_LEVELS.find((m) => m.level === level)?.text
  return (
    <div className="sline">
      <Label id="set-motion" title="Animations" help={help} />
      <PopUp labelledBy="set-motion" value={level} options={MOTION_LEVELS.map((m) => [m.level, m.label])} onChange={pick} />
    </div>
  )
}
