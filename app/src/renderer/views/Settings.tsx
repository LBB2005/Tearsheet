import { useEffect, useState } from 'react'

import type { SettingsResult } from '../../shared/protocol'

const KEY_LABELS: Record<string, string> = { massive: 'Massive (prices)', fred: 'FRED (economic data)', alphavantage: 'Alpha Vantage (not used yet)' }

export function Settings() {
  const [s, setS] = useState<SettingsResult | null>(null)
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [fields, setFields] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)

  const load = () => void window.tearsheet.getSettings().then((r) => r.ok && r.result && setS(r.result))
  useEffect(load, [])

  const saveKey = async (service: string) => {
    const value = keys[service]
    if (!value) return
    const reply = await window.tearsheet.setKey(service, value)
    setKeys({ ...keys, [service]: '' })
    setMessage(reply.ok ? `Saved the ${KEY_LABELS[service]} key in the Keychain.` : reply.error?.message ?? 'Not saved.')
    load()
  }
  const saveField = async (key: string) => {
    const reply = await window.tearsheet.setSetting(key, fields[key] ?? '')
    setMessage(reply.ok ? 'Saved.' : reply.error?.message ?? 'Not saved.')
    load()
  }
  if (!s) return <p className="muted">Loading…</p>
  const field = (key: string, label: string, current: string | number | null) => (
    <tr key={key}>
      <td>{label}</td>
      <td>{current ?? <span className="muted">not set</span>}</td>
      <td className="row">
        <input type="text" value={fields[key] ?? ''} onChange={(e) => setFields({ ...fields, [key]: e.target.value })} />
        <button className="plain" onClick={() => void saveField(key)}>Change</button>
      </td>
    </tr>
  )
  return (
    <section>
      <h2>Settings</h2>
      {message && <p className="notice">{message}</p>}
      <h3>Data keys</h3>
      <p className="muted">Keys are kept in the macOS Keychain, never in files, and never shown again.</p>
      <table>
        <tbody>
          {Object.entries(s.keys).map(([service, state]) => (
            <tr key={service}>
              <td>{KEY_LABELS[service] ?? service}</td>
              <td className={state === 'set' ? 'ok' : 'error'}>{state}</td>
              <td className="row">
                <input type="password" placeholder="Paste a new key" value={keys[service] ?? ''} onChange={(e) => setKeys({ ...keys, [service]: e.target.value })} />
                <button className="plain" onClick={() => void saveKey(service)}>Save</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>General</h3>
      <table>
        <tbody>
          {field('sec_contact_email', 'SEC contact email', s.sec_contact_email)}
          {field('primary_tool', 'Main AI tool (claude or codex)', s.primary_tool)}
          {field('raw_cap', 'Raw-data cap (GB)', s.raw_cap)}
          {field('backup_dir', 'Backup folder', s.backup_dir)}
          {field('goal1_round', 'Goal 1 round', s.goal1_round)}
        </tbody>
      </table>
      <p className="muted">
        Raw downloads stored: {(s.raw_bytes / 1024 ** 2).toFixed(1)} MB of {s.raw_cap} GB.
        {s.backup_in_icloud && ' The backup folder is synced by iCloud, so backup copies also go to Apple’s servers.'}
      </p>
      <h3>What leaves your Mac</h3>
      <table>
        <thead>
          <tr><th>Service</th><th>Key</th><th>Cost</th><th>What is sent</th></tr>
        </thead>
        <tbody>
          {s.services.map((x) => (
            <tr key={x.name}><td>{x.name}</td><td>{x.key}</td><td>{x.cost}</td><td>{x.sent}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
