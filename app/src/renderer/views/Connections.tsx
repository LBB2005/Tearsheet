import { useEffect, useState } from 'react'

import type { ToolStatus } from '../../preload/api'
import type { LockdownState } from '../../shared/protocol'

// A tool is usable once it is found and has passed the lock-down check for its version
// (Technical Plan §4). A changed version is checked again before the next AI step.
function lockdownText(tool: ToolStatus, state: LockdownState | undefined): string {
  const command = `tearsheet-engine lockdown-check --tool ${tool.kind}`
  if (!state) return `Not checked yet. Run: ${command}`
  if (state.blocked_reason === 'lockdown_failed' || (!state.passed && state.form === 'full')) {
    return `Not usable with Tearsheet: its lock-down check failed. Run: ${command}`
  }
  if (state.blocked_reason === 'tool_use_attempt') return 'It tried to use a tool, so it is checked again before the next AI step.'
  if (!state.passed) return `Not passed yet. Run: ${command}`
  if (tool.version && state.version && !tool.version.includes(state.version) && !state.version.includes(tool.version)) {
    return `Passed for ${state.version}; this version is checked again before the next AI step.`
  }
  return `Passed (${state.form} check${state.checked_at ? `, ${new Date(state.checked_at).toLocaleDateString()}` : ''})`
}

export function Connections() {
  const [tools, setTools] = useState<ToolStatus[] | null>(null)
  const [lockdown, setLockdown] = useState<Record<string, LockdownState>>({})
  const check = (force: boolean) => {
    void window.tearsheet.getTools(force).then(setTools)
    void window.tearsheet.getSettings().then((r) => setLockdown(r.ok && r.result?.lockdown ? r.result.lockdown : {}))
  }
  useEffect(() => check(false), [])
  return (
    <section>
      <h2>Connections</h2>
      <p className="muted">Tearsheet uses your own AI tool, signed in to your subscription. It runs with no tools of its own.</p>
      <table>
        <thead>
          <tr><th>Tool</th><th>Found</th><th>Version</th><th>Signed in</th><th>Lock-down check</th></tr>
        </thead>
        <tbody>
          {(tools ?? []).map((t) => (
            <tr key={t.kind}>
              <td>{t.name}</td>
              <td className={t.available ? 'ok' : 'error'}>{t.available ? t.path : t.reason}</td>
              <td>{t.version ?? '—'}</td>
              <td>{t.loggedIn === null ? 'unknown' : t.loggedIn ? 'yes' : 'no'}</td>
              <td>{t.available ? lockdownText(t, lockdown[t.kind]) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">When both tools pass, the other tool checks each report's draft. Install and sign-in buttons come in Phase 3.</p>
      <button className="plain" onClick={() => check(true)}>Check again</button>
    </section>
  )
}
