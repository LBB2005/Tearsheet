import { describe, expect, it, vi } from 'vitest'

import { downloadToast, SAVING_MS } from './downloads'

describe('the download toast', () => {
  it('says it is making the file', () => {
    expect(downloadToast({ state: 'saving', kind: 'pptx', reportId: 'r' }, vi.fn()).title).toBe('Making the slide deck…')
  })

  it('stays up while the file is made, until the answer replaces it', () => {
    expect(downloadToast({ state: 'saving', kind: 'pdf', reportId: 'r' }, vi.fn()).ms).toBe(SAVING_MS)
    expect(SAVING_MS).toBeGreaterThanOrEqual(60_000)
  })

  it('names the saved file and offers Show in Finder', () => {
    const show = vi.fn()
    const toast = downloadToast({ state: 'saved', kind: 'pdf', reportId: 'r', name: 'JPM Tearsheet 7 Nov 2026.pdf', path: '/d/JPM Tearsheet 7 Nov 2026.pdf' }, show)
    expect(toast).toMatchObject({ title: 'Saved to Downloads', text: 'JPM Tearsheet 7 Nov 2026.pdf' })
    toast.action?.run()
    expect(show).toHaveBeenCalledWith('/d/JPM Tearsheet 7 Nov 2026.pdf')
  })

  it('says why it failed, in red', () => {
    expect(downloadToast({ state: 'failed', kind: 'xlsx', reportId: 'r', message: 'No room.' }, vi.fn())).toMatchObject({
      title: 'The Excel workbook wasn’t saved',
      text: 'No room.',
      tone: 'stop'
    })
  })
})
