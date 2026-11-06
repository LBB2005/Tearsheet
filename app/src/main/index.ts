// The Electron main process (design item 42). The PATH fix runs first; then the AI tools are
// detected, the engine is started, and the window opens with context isolation and the sandbox
// on and Node integration off. The window never navigates; clicks inside the report frame go
// through navigationAction and are always cancelled.

import { join, resolve } from 'node:path'

import { app, BrowserWindow, shell } from 'electron'

import { dockUpdate, NO_RUN } from './dockProgress'
import { Engine, type Notification } from './engine'
import { registerIpc } from './ipc'
import { loginShellPath } from './loginShellPath'
import { navigationAction } from './navigation'
import { getTools } from './probe'

const fixedPath = loginShellPath()
process.env.PATH = fixedPath

// Electron's own files go in a sub-folder, so they stay apart from the engine's data.
const dataDir = process.env.TEARSHEET_DATA_DIR || join(app.getPath('appData'), 'Tearsheet')
app.setPath('userData', join(dataDir, 'app-shell'))

let engine: Engine | null = null

function engineCommand(): { command: string; args: string[]; cwd: string } {
  // Development: the engine from this repository, through uv. Phase 3 bundles it.
  const repo = process.env.TEARSHEET_REPO || resolve(app.getAppPath(), '..')
  return { command: 'uv', args: ['run', '--project', join(repo, 'engine'), 'tearsheet-engine', 'serve'], cwd: repo }
}

// The Dock icon in development. A packaged app takes build/icon.icns from its bundle instead.
function setDevDockIcon(): void {
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(join(app.getAppPath(), 'build', 'icon.png'))
}

// macOS's own progress bar on the Dock icon while a report runs, and one bounce when it is ready
// if Tearsheet is behind another app.
function showProgressInDock(window: BrowserWindow, engine: Engine): void {
  let run = NO_RUN
  const apply = (note: Notification) => {
    const update = dockUpdate(run, note)
    run = update.run
    if (window.isDestroyed()) return
    if (update.bar !== null) window.setProgressBar(update.bar)
    if (update.bounce && !window.isFocused()) app.dock?.bounce('informational')
  }
  engine.on('notification', apply)
  engine.on('crashed', () => apply({ method: 'engine_restarted', params: {} }))
}

async function createWindow(): Promise<void> {
  setDevDockIcon()
  const tools = await getTools(fixedPath)
  const tool = (kind: string) => tools.find((t) => t.kind === kind)?.path ?? ''
  const { command, args, cwd } = engineCommand()
  engine = new Engine({
    command,
    args,
    cwd,
    env: {
      ...process.env,
      PATH: fixedPath,
      TEARSHEET_PATH: fixedPath,
      TEARSHEET_DATA_DIR: dataDir,
      TEARSHEET_CLAUDE_BIN: tool('claude'),
      TEARSHEET_CODEX_BIN: tool('codex')
    },
    logFile: join(dataDir, 'logs', 'engine.log')
  })

  const window = new BrowserWindow({
    width: 1200,
    height: 880,
    title: 'Tearsheet',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  registerIpc(window, engine, fixedPath)
  showProgressInDock(window, engine)
  engine.start()

  // The window itself never navigates, and never opens pop-ups.
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // Links inside the report frame.
  window.webContents.on('will-frame-navigate', (event) => {
    if (event.isMainFrame) return
    event.preventDefault()
    const action = navigationAction(event.url)
    if (action.kind === 'flag') window.webContents.send('tearsheet:flag-requested', { claimId: action.claimId })
    else if (action.kind === 'reread') {
      engine
        ?.request('reread_filing', { accession: action.accession })
        .then((result) => window.webContents.send('tearsheet:notification', { method: 'reread_done', params: { accession: action.accession, ...(result as object) } }))
        .catch(() => undefined)
    } else if (action.kind === 'external') void shell.openExternal(action.url)
  })

  if (process.env.ELECTRON_RENDERER_URL) await window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else await window.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => engine?.stop())
