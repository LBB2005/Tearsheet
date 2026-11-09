// The paste command, kept as the fallback (first-run design §3, item 6): the same list of steps as
// the Install button, joined into one command the person pastes into Terminal. `pipefail` is on,
// so a failed download stops the rest. It can't re-read the status between its steps, so it keeps
// a sign-in after an install, at the set test path or the official folder (toolSteps.ts).

import type { ToolCommands, ToolKind, ToolStatus, ToolStep } from '../shared/tools'
import { stepsFor, type StepRules } from './toolSteps'

export function joinSteps(steps: ToolStep[]): string | null {
  return steps.length ? `set -o pipefail; ${steps.map((s) => s.command).join(' && ')}` : null
}

export function commandFor(kinds: ToolKind[], tools: ToolStatus[], rules: StepRules): string | null {
  return joinSteps(stepsFor(kinds, tools, rules).steps)
}

// What the connect card shows under "These are the commands Tearsheet runs": the steps, the ones
// refused with why, and the paste command.
export function toolCommands(kinds: ToolKind[], tools: ToolStatus[], rules: StepRules): ToolCommands {
  const { steps, blocked } = stepsFor(kinds, tools, rules)
  return { steps, blocked, paste: joinSteps(steps) }
}
