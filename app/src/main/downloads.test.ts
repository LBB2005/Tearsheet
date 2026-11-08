import { describe, expect, it, vi } from 'vitest'

import { Downloads, failureMessage, footerTemplate, freeName, safeName, type DownloadDeps, type DownloadNote } from './downloads'

const DIR = '/Users/liam/Downloads'

function deps(over: Partial<DownloadDeps> = {}, files: Set<string> = new Set()) {
  const notes: DownloadNote[] = []
  const written = new Map<string, Buffer>()
  const all: DownloadDeps = {
    request: vi.fn(async (_method: string, params: Record<string, unknown>) =>
      params.kind === 'pdf'
        ? { file_name: 'JPM Tearsheet 7 Nov 2026.pdf', html: '<p>report</p>', data_base64: null, footer: 'Tearsheet Research · Research data, not investment advice.' }
        : { file_name: `JPM Tearsheet 7 Nov 2026.${String(params.kind)}`, html: null, data_base64: Buffer.from('file bytes').toString('base64'), footer: '' }
    ),
    dir: DIR,
    exists: (path) => files.has(path) || written.has(path),
    write: vi.fn(async (path: string, data: Buffer) => {
      written.set(path, data)
    }),
    printPdf: vi.fn(async () => Buffer.from('%PDF-1.7')),
    notify: (note) => notes.push(note),
    ...over
  }
  return { all, notes, written }
}

describe('file names', () => {
  it('adds (2), (3)… before the extension when the name is taken', () => {
    const taken = new Set(['JPM Tearsheet 7 Nov 2026.pdf', 'JPM Tearsheet 7 Nov 2026 (2).pdf'])
    expect(freeName('JPM Tearsheet 7 Nov 2026.pdf', (n) => taken.has(n))).toBe('JPM Tearsheet 7 Nov 2026 (3).pdf')
    expect(freeName('JPM Tearsheet 7 Nov 2026.xlsx', (n) => taken.has(n))).toBe('JPM Tearsheet 7 Nov 2026.xlsx')
  })

  it('keeps the engine’s name to plain characters inside the folder', () => {
    expect(safeName('BRK.B Tearsheet 7 Nov 2026.pdf', 'pdf')).toBe('BRK.B Tearsheet 7 Nov 2026.pdf')
    expect(safeName('../../evil/JPM.pdf', 'pdf')).toBe('JPM.pdf')
    expect(safeName('JPM Tearsheet', 'xlsx')).toBe('JPM Tearsheet.xlsx')
    expect(safeName('', 'pptx')).toBe('Tearsheet report.pptx')
    expect(safeName(undefined, 'pdf')).toBe('Tearsheet report.pdf')
    expect(safeName('.pdf', 'pdf')).toBe('Tearsheet report.pdf')
  })
})

describe('the PDF footer', () => {
  it('carries the line and the page numbers, escaped, with sizes in points', () => {
    const footer = footerTemplate('A & B <script>x</script>')
    expect(footer).toContain('A &#38; B &#60;script&#62;x&#60;/script&#62;')
    expect(footer).toContain('class="pageNumber"')
    expect(footer).toContain('class="totalPages"')
    expect(footer).toContain('font-size:6.5pt')
    expect(footer).not.toContain('<script>')
  })
})

describe('failures in plain words', () => {
  it('says where to allow Downloads when macOS refuses', () => {
    expect(failureMessage(Object.assign(new Error('denied'), { code: 'EPERM' }))).toContain('Privacy & Security → Files and Folders')
    expect(failureMessage(Object.assign(new Error('denied'), { code: 'EACCES' }))).toContain('Downloads Folder')
  })

  it('passes on any other reason', () => {
    expect(failureMessage(new Error('No report rep-1.'))).toBe('It couldn’t be made: No report rep-1.')
    expect(failureMessage(null)).toBe('It couldn’t be made. Please try again.')
  })
})

describe('making a download', () => {
  it('saves the workbook the engine made straight to Downloads and says so', async () => {
    const { all, notes, written } = deps()
    const note = await new Downloads(all).start('xlsx', 'rep-1')
    expect(all.request).toHaveBeenCalledWith('export_report', { report_id: 'rep-1', kind: 'xlsx' })
    const path = `${DIR}/JPM Tearsheet 7 Nov 2026.xlsx`
    expect(written.get(path)?.toString()).toBe('file bytes')
    expect(all.printPdf).not.toHaveBeenCalled()
    expect(notes.map((n) => n.state)).toEqual(['saving', 'saved'])
    expect(note).toEqual({ state: 'saved', kind: 'xlsx', reportId: 'rep-1', name: 'JPM Tearsheet 7 Nov 2026.xlsx', path })
  })

  it('prints the PDF from the engine’s page, with its footer', async () => {
    const { all, written } = deps()
    await new Downloads(all).start('pdf', 'rep-1')
    expect(all.printPdf).toHaveBeenCalledWith('<p>report</p>', 'Tearsheet Research · Research data, not investment advice.')
    expect(written.get(`${DIR}/JPM Tearsheet 7 Nov 2026.pdf`)?.toString()).toBe('%PDF-1.7')
  })

  it('never replaces a file already in Downloads', async () => {
    const { all, written } = deps({}, new Set([`${DIR}/JPM Tearsheet 7 Nov 2026.pptx`]))
    const note = await new Downloads(all).start('pptx', 'rep-1')
    expect(note?.name).toBe('JPM Tearsheet 7 Nov 2026 (2).pptx')
    expect([...written.keys()]).toEqual([`${DIR}/JPM Tearsheet 7 Nov 2026 (2).pptx`])
  })

  it('ignores a second click while the same file is being made', async () => {
    let release: () => void = () => undefined
    const { all } = deps({
      request: vi.fn(
        () =>
          new Promise((done) => {
            release = () => done({ file_name: 'a.xlsx', html: null, data_base64: '', footer: '' })
          })
      )
    })
    const downloads = new Downloads(all)
    const first = downloads.start('xlsx', 'rep-1')
    expect(await downloads.start('xlsx', 'rep-1')).toBeNull()
    release()
    await first
    expect(all.request).toHaveBeenCalledTimes(1)
  })

  it('says why when it fails, and saves nothing', async () => {
    const { all, notes, written } = deps({ write: vi.fn(async () => Promise.reject(Object.assign(new Error('no'), { code: 'EPERM' }))) })
    const note = await new Downloads(all).start('xlsx', 'rep-1')
    expect(note?.state).toBe('failed')
    expect(note?.message).toContain('System Settings')
    expect(notes.at(-1)?.state).toBe('failed')
    expect(written.size).toBe(0)
  })

  it('fails plainly when the engine sends no file', async () => {
    const { all } = deps({ request: vi.fn(async () => ({ file_name: 'a.pdf', html: null, data_base64: null, footer: '' })) })
    const note = await new Downloads(all).start('pdf', 'rep-1')
    expect(note).toMatchObject({ state: 'failed', message: 'It couldn’t be made: the engine sent no page to print' })
  })

  it('shows in Finder only a file it saved', async () => {
    const { all } = deps()
    const downloads = new Downloads(all)
    const note = await downloads.start('xlsx', 'rep-1')
    expect(downloads.isSaved(note?.path)).toBe(true)
    expect(downloads.isSaved('/etc/passwd')).toBe(false)
    expect(downloads.isSaved(42)).toBe(false)
  })
})
