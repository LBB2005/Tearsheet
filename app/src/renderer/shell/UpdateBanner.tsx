// The update banner (main/updates.ts): one quiet line under the toolbar when a newer Tearsheet is
// out, "Tearsheet X is out · Download · What's new · Dismiss". Download opens the release's page in
// the browser and What's new the changelog; the main process holds both addresses. Dismiss hides
// it for that version only. With "Check for updates" off, or no newer release, nothing shows.

import { useEffect, useState } from 'react'

import type { UpdateStatus } from '../../main/updates'

// The main process's update status, kept current: it asks once, then hears each change. The
// setter lets a page show its own change (Dismiss, the setting) before main answers.
export function useUpdateStatus(): [UpdateStatus | null, (status: UpdateStatus) => void] {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  useEffect(() => {
    let live = true
    // A change main sends is newer than the first answer, which may have been worked out before
    // it: once one has come, the first answer is ignored (code review, 12 Nov 2026).
    let heard = false
    window.tearsheet.updates().then(
      (s) => live && !heard && setStatus(s),
      () => undefined
    )
    const off = window.tearsheet.onUpdate((s) => {
      heard = true
      setStatus(s)
    })
    return () => {
      live = false
      off()
    }
  }, [])
  return [status, setStatus]
}

export function UpdateBanner() {
  const [status, setStatus] = useUpdateStatus()
  const update = status?.update
  if (!update) return null
  const dismiss = () => {
    setStatus({ check: status.check, update: null })
    window.tearsheet.dismissUpdate(update.version).then(
      (s) => setStatus(s),
      () => undefined
    )
  }
  return (
    <div className="upbar" role="status">
      <span className="uptext">Tearsheet {update.version} is out</span>
      <span className="upsep" aria-hidden="true">
        ·
      </span>
      <button className="uplink" onClick={() => void window.tearsheet.openUpdate('download')}>
        Download
      </button>
      <span className="upsep" aria-hidden="true">
        ·
      </span>
      <button className="uplink" onClick={() => void window.tearsheet.openUpdate('notes')}>
        What’s new
      </button>
      <span className="upsep" aria-hidden="true">
        ·
      </span>
      <button className="uplink quiet" aria-label={`Dismiss Tearsheet ${update.version}`} onClick={dismiss}>
        Dismiss
      </button>
    </div>
  )
}
