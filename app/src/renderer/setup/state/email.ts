// The SEC email on the setup screen (first-run design item 30 and §4, "The email"), as a pure
// reducer. It is filled in from Claude Code's status when none is saved, shown in full with
// Change, and saved only at Start. A suggestion never replaces an email the person typed, and the
// engine's email rule decides: its answer at Start is shown if it says no.

import { isEmail } from '../../../shared/tools'

export type EmailState = 'none' | 'suggested' | 'typed' | 'editing' | 'invalid' | 'saved'

export interface EmailMachine {
  state: EmailState
  value: string
  // The engine's reason, when it refused the email at Start.
  problem: string | null
}

export type EmailEvent =
  // The email saved before (setup opened again after a Start that failed partway).
  | { type: 'saved'; email: string | null }
  // Claude Code's status gave one.
  | { type: 'suggest'; email: string | null }
  // Change was pressed.
  | { type: 'change' }
  | { type: 'type'; value: string }
  // The engine said no at Start.
  | { type: 'refused'; problem: string }

export const emailStart = (): EmailMachine => ({ state: 'none', value: '', problem: null })

export function emailReducer(m: EmailMachine, e: EmailEvent): EmailMachine {
  switch (e.type) {
    case 'saved':
      return e.email && (m.state === 'none' || m.state === 'suggested') ? { state: 'saved', value: e.email, problem: null } : m
    case 'suggest':
      return e.email && (m.state === 'none' || m.state === 'suggested') ? { state: 'suggested', value: e.email, problem: null } : m
    case 'change':
      return { ...m, state: 'editing', problem: null }
    case 'type':
      return { state: m.state === 'editing' ? 'editing' : 'typed', value: e.value, problem: null }
    case 'refused':
      return { ...m, state: 'invalid', problem: e.problem }
  }
}

// The email shows in full, with Change, rather than in a field.
export const emailFixed = (m: EmailMachine) => (m.state === 'suggested' || m.state === 'saved') && isEmail(m.value)

// Start can use it: it looks like an email, and the engine hasn't refused it.
export const emailUsable = (m: EmailMachine) => m.state !== 'invalid' && isEmail(m.value)
