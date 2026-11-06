// The lock-down check's line for one AI tool on Settings (Technical Plan §4), moved word for word
// from views/Connections.tsx; lockdown.test.ts pins its words.

import type { ToolStatus } from '../../preload/api'
import type { LockdownState } from '../../shared/protocol'

// A tool is usable once it is found and has passed the lock-down check for its version
// (Technical Plan §4). A changed version is checked again before the next AI step.
export function lockdownText(tool: ToolStatus, state: LockdownState | undefined): string {
  const command = `tearsheet-engine lockdown-check --tool ${tool.kind}`
  if (!state) return 'Ready: checked automatically before its first use.'
  if (state.blocked_reason === 'lockdown_failed' || (!state.passed && state.form === 'full')) {
    return `Not usable with Tearsheet: its lock-down check failed. Run: ${command}`
  }
  if (state.blocked_reason === 'tool_use_attempt') return 'It tried to use a tool, so it is checked again before the next AI step.'
  if (!state.passed) return 'Checked again automatically before its next use.'
  if (tool.version && state.version && !tool.version.includes(state.version) && !state.version.includes(tool.version)) {
    return `Passed for ${state.version}; this version is checked again before the next AI step.`
  }
  return `Passed (${state.form} check${state.checked_at ? `, ${new Date(state.checked_at).toLocaleDateString()}` : ''})`
}
