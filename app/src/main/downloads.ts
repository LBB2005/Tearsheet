// Downloads of a saved report (docs/superpowers/specs/2026-11-08-report-downloads-design.md):
// the links at the end of the report, tearsheet://download/<pdf|pptx|xlsx>/<report id>, save a
// PDF, a slide deck or an Excel workbook straight to ~/Downloads. The engine makes each file from
// the saved report, with no AI (export_report); for the PDF it gives a print page, which a hidden
// window here prints. The window hears how each one went on 'tearsheet:download', and can ask to
// show a file it saved in Finder.

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

export type DownloadKind = 'pdf' | 'pptx' | 'xlsx'

export const KIND_NAMES: Record<DownloadKind, string> = { pdf: 'PDF', pptx: 'slide deck', xlsx: 'Excel workbook' }

export interface DownloadNote {
  state: 'saving' | 'saved' | 'failed'
  kind: DownloadKind
  reportId: string
  // The file's name and full path, once saved.
  name?: string
  path?: string
  // Why it failed, in plain words.
  message?: string
}

interface ExportAnswer {
  file_name: string
  html: string | null
  data_base64: string | null
  footer: string
}

export interface DownloadDeps {
  request(method: string, params: Record<string, unknown>): Promise<unknown>
  dir: string
  exists(path: string): boolean
  // Writes a new file; fails rather than replace one that is there.
  write(path: string, data: Buffer): Promise<void>
  printPdf(html: string, footer: string): Promise<Buffer>
  notify(note: DownloadNote): void
}

// "JPM Tearsheet 7 Nov 2026.pdf", or with " (2)", " (3)" … before the extension if taken.
export function freeName(name: string, taken: (name: string) => boolean): string {
  if (!taken(name)) return name
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let i = 2; i < 1000; i++) {
    const next = `${stem} (${i})${ext}`
    if (!taken(next)) return next
  }
  return `${stem} (${Date.now()})${ext}`
}

// The engine's name, kept to plain characters, so it can never point outside the folder.
export function safeName(name: unknown, kind: DownloadKind): string {
  const plain = typeof name === 'string' ? basename(name).replace(/[^A-Za-z0-9 .()_-]/g, '').trim() : ''
  const withExt = plain.toLowerCase().endsWith(`.${kind}`) ? plain : `${plain || 'Tearsheet report'}.${kind}`
  return withExt.startsWith('.') ? `Tearsheet report${withExt}` : withExt
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

// The PDF's footer on every page, in the bottom margin: Chromium draws it from this template,
// which takes inline styles only and needs its sizes in points.
export function footerTemplate(text: string): string {
  return (
    '<div style="width:100%;margin:0 0.6in;display:flex;justify-content:space-between;' +
    'font-family:Arial,Helvetica,sans-serif;font-size:6.5pt;color:#595959;">' +
    `<span>${escapeHtml(text)}</span>` +
    '<span style="white-space:nowrap;margin-left:12pt;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>'
  )
}

// What to tell Liam when a file couldn't be saved.
export function failureMessage(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code
  if (code === 'EPERM' || code === 'EACCES')
    return 'Tearsheet isn’t allowed to save in Downloads. Turn it on in System Settings → Privacy & Security → Files and Folders → Tearsheet → Downloads Folder, then try again.'
  if (code === 'ENOSPC') return 'There isn’t enough space on this Mac to save it.'
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return message ? `It couldn’t be made: ${message}` : 'It couldn’t be made. Please try again.'
}

// The prediction log's CSV name, kept to plain characters and always ending .csv.
export function csvName(name: unknown): string {
  const plain = typeof name === 'string' ? basename(name).replace(/[^A-Za-z0-9 .()_-]/g, '').trim() : ''
  const stem = plain.toLowerCase().endsWith('.csv') ? plain.slice(0, -4).trim() : plain
  return `${stem && !stem.startsWith('.') ? stem : 'Tearsheet predictions'}.csv`
}

export class Downloads {
  private busy = new Set<string>()
  // The files saved this session: only these can be shown in Finder.
  private saved = new Set<string>()

  constructor(private deps: DownloadDeps) {}

  isSaved(path: unknown): path is string {
    return typeof path === 'string' && this.saved.has(path)
  }

  // Saves a CSV the window made (the prediction log's Export), never replacing a file.
  async saveCsv(name: unknown, text: unknown): Promise<{ ok: true; name: string; path: string } | { ok: false; message: string }> {
    if (typeof text !== 'string' || text.length > 20_000_000) return { ok: false, message: 'There was nothing to save.' }
    try {
      const file = freeName(csvName(name), (n) => this.deps.exists(join(this.deps.dir, n)))
      const path = join(this.deps.dir, file)
      await this.deps.write(path, Buffer.from(text, 'utf8'))
      this.saved.add(path)
      return { ok: true, name: file, path }
    } catch (error) {
      return { ok: false, message: failureMessage(error) }
    }
  }

  // Makes one file. A second click on the same file while it is being made is ignored.
  async start(kind: DownloadKind, reportId: string): Promise<DownloadNote | null> {
    const key = `${kind}:${reportId}`
    if (this.busy.has(key)) return null
    this.busy.add(key)
    this.deps.notify({ state: 'saving', kind, reportId })
    try {
      const answer = (await this.deps.request('export_report', { report_id: reportId, kind })) as ExportAnswer
      let data: Buffer
      if (kind === 'pdf') {
        if (typeof answer.html !== 'string') throw new Error('the engine sent no page to print')
        data = await this.deps.printPdf(answer.html, answer.footer ?? '')
      } else {
        if (typeof answer.data_base64 !== 'string') throw new Error('the engine sent no file')
        data = Buffer.from(answer.data_base64, 'base64')
      }
      const name = freeName(safeName(answer.file_name, kind), (n) => this.deps.exists(join(this.deps.dir, n)))
      const path = join(this.deps.dir, name)
      await this.deps.write(path, data)
      this.saved.add(path)
      const note: DownloadNote = { state: 'saved', kind, reportId, name, path }
      this.deps.notify(note)
      return note
    } catch (error) {
      const note: DownloadNote = { state: 'failed', kind, reportId, message: failureMessage(error) }
      this.deps.notify(note)
      return note
    } finally {
      this.busy.delete(key)
    }
  }
}

// Writes a new file, never replacing one (another app may have saved the same name meanwhile).
export async function writeNew(path: string, data: Buffer): Promise<void> {
  await writeFile(path, data, { flag: 'wx' })
}

// The print page to PDF, in a window that is never shown or focused and runs no scripts. The page
// is loaded from a file in a fresh temporary folder, removed afterwards.
export async function printHtmlToPdf(html: string, footer: string): Promise<Buffer> {
  const { BrowserWindow } = await import('electron')
  const folder = await mkdtemp(join(tmpdir(), 'tearsheet-print-'))
  const file = join(folder, 'report.html')
  const window = new BrowserWindow({
    show: false,
    focusable: false,
    skipTaskbar: true,
    paintWhenInitiallyHidden: true,
    webPreferences: { sandbox: true, javascript: false, contextIsolation: true, nodeIntegration: false }
  })
  try {
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    await writeFile(file, html, 'utf8')
    await window.loadFile(file)
    return await window.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: footerTemplate(footer),
      margins: { top: 0.5, bottom: 0.72, left: 0.6, right: 0.6 },
      generateDocumentOutline: false
    })
  } finally {
    if (!window.isDestroyed()) window.destroy()
    await rm(folder, { recursive: true, force: true })
  }
}
