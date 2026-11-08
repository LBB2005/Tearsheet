// The toast for a download from the end of the report (main/downloads.ts): while the file is made,
// once it is saved (with Show in Finder), or why it wasn't.

import type { DownloadNote } from '../../main/downloads'
import type { Notice } from '../overlays/Toast'

const NAMES: Record<DownloadNote['kind'], string> = { pdf: 'PDF', pptx: 'slide deck', xlsx: 'Excel workbook' }

export function downloadToast(note: DownloadNote, show: (path: string) => void): Omit<Notice, 'id'> {
  const what = NAMES[note.kind] ?? 'file'
  if (note.state === 'saving') return { title: `Making the ${what}…`, text: 'From the saved report. It takes a few seconds.', ms: 20000 }
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
