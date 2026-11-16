import { describe, expect, it, vi } from 'vitest'

import { downloadToast, SAVING_MS } from './downloads'

describe('the download toast', () => {
  it('says it is making the file', () => {
    expect(downloadToast({ state: 'saving', kind: 'pptx', reportId: 'r' }, vi.fn()).title).toBe('Making the slide deck…')
  })

  it('stays up while the file is made, until the answer replaces it', () => {
    expect(downloadToast({ state: 'saving', kind: 'pdf', reportId: 'r' }, vi.fn()).ms).toBe(SAVING_MS)
    expect(downloadToast({ state: 'saving', kind: 'pdf', reportId: 'r' }, vi.fn()).busy).toBe(true)
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

  it('names the Excel file of all data while it is made, saved or failed', () => {
    const base = { kind: 'xlsx' as const, reportId: '', all: true }
    expect(downloadToast({ state: 'saving', ...base }, vi.fn())).toMatchObject({ title: 'Making the Excel file of all data…', text: 'From everything Tearsheet has stored. It stays here until it’s saved.', busy: true })
    const show = vi.fn()
    const saved = downloadToast({ state: 'saved', ...base, name: 'Tearsheet all data 16 Nov 2026.xlsx', path: '/d/Tearsheet all data 16 Nov 2026.xlsx' }, show)
    expect(saved).toMatchObject({ title: 'Saved to Downloads', text: 'Tearsheet all data 16 Nov 2026.xlsx' })
    expect(saved.action?.label).toBe('Show in Finder')
    saved.action?.run()
    expect(show).toHaveBeenCalledWith('/d/Tearsheet all data 16 Nov 2026.xlsx')
    expect(downloadToast({ state: 'failed', ...base, message: 'No room.' }, vi.fn()).title).toBe('The Excel file of all data wasn’t saved')
  })
})
