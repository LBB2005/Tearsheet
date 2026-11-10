// The toast for a download from the end of the report (main/downloads.ts): while the file is made,
// once it is saved (with Show in Finder), or why it wasn't.

import type { DownloadNote } from '../../main/downloads'
import type { Notice } from '../overlays/Toast'

// Longer than any file takes to make; the saved or failed notice takes its place well before.
export const SAVING_MS = 5 * 60_000

const NAMES: Record<DownloadNote['kind'], string> = { pdf: 'PDF', pptx: 'slide deck', xlsx: 'Excel workbook' }

export function downloadToast(note: DownloadNote, show: (path: string) => void): Omit<Notice, 'id'> {
  const what = NAMES[note.kind] ?? 'file'
  // While it is made, the notice stays up until the answer replaces it (saved, or why not), so
  // a slow PDF never leaves a gap where nothing says it is still working.
  if (note.state === 'saving') return { title: `Making the ${what}…`, text: 'From the saved report. It stays here until it’s saved.', ms: SAVING_MS }
  if (note.state === 'saved') {
    const path = note.path ?? ''
    return {
      title: 'Saved to Downloads',
      text: note.name ?? what,
      ms: 9000,
      action: path ? { label: 'Show in Finder', run: () => show(path) } : undefined
    }
  }
  return { title: `The ${what} wasn’t saved`, text: note.message ?? 'Please try again.', tone: 'stop', ms: 12000 }
}
