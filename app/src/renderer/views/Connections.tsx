import { useEffect, useState } from 'react'

import type { ToolStatus } from '../../preload/api'

export function Connections() {
  const [tools, setTools] = useState<ToolStatus[] | null>(null)
  const check = (force: boolean) => void window.tearsheet.getTools(force).then(setTools)
  useEffect(() => check(false), [])
  return (
    <section>
      <h2>Connections</h2>
      <p className="muted">Tearsheet uses your own AI tool, signed in to your subscription. It runs with no tools of its own.</p>
      <table>
        <thead>
          <tr><th>Tool</th><th>Found</th><th>Version</th><th>Signed in</th></tr>
        </thead>
        <tbody>
          {(tools ?? []).map((t) => (
            <tr key={t.kind}>
              <td>{t.name}</td>
              <td className={t.available ? 'ok' : 'error'}>{t.available ? t.path : t.reason}</td>
              <td>{t.version ?? '—'}</td>
              <td>{t.loggedIn === null ? 'unknown' : t.loggedIn ? 'yes' : 'no'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Codex support arrives in Phase 2. Install and sign-in buttons come in Phase 3.</p>
      <button className="plain" onClick={() => check(true)}>Check again</button>
    </section>
  )
}
