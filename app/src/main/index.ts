// The Electron main process (design item 42). The PATH fix runs first; then the AI tools are
// detected, the engine is started, and the window opens with context isolation and the sandbox
// on and Node integration off. The window never navigates; clicks inside the report frame go
// through navigationAction and are always cancelled.

import { join, resolve } from 'node:path'

import { app, BrowserWindow, Menu, shell } from 'electron'

import { dockUpdate, NO_RUN } from './dockProgress'
import { Engine, type Notification } from './engine'
import { registerIpc } from './ipc'
import { claimOnlyCopy, closeHides } from './lifecycle'
import { loginShellPath } from './loginShellPath'
import { menuTemplate } from './menu'
import { navigationAction } from './navigation'
import { getTools } from './probe'

const fixedPath = loginShellPath()
process.env.PATH = fixedPath

// Electron's own files go in a sub-folder, so they stay apart from the engine's data.
const dataDir = process.env.TEARSHEET_DATA_DIR || join(app.getPath('appData'), 'Tearsheet')
app.setPath('userData', join(dataDir, 'app-shell'))

let engine: Engine | null = null
let mainWindow: BrowserWindow | null = null
// Set once Tearsheet is quitting, so closing the window then closes it for good (lifecycle.ts).
let quitting = false

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
    width: 1280,
    height: 840,
    minWidth: 820,
    minHeight: 600,
    title: 'Tearsheet',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: '#0A0D14',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  mainWindow = window
  registerIpc(window, engine, fixedPath)
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate((command) => {
        if (window.isDestroyed() || window.webContents.isDestroyed()) return
        // A shortcut used while the window is hidden (⌘N, say) brings it back first.
        if (!window.isVisible()) window.show()
        window.webContents.send('tearsheet:menu', command)
      }, !app.isPackaged)))
  showProgressInDock(window, engine)
  engine.start()

  // ⌘W and the red button hide the window while Tearsheet keeps running (lifecycle.ts). A
  // full-screen window leaves full screen first, so no empty space is left behind.
  window.on('close', (event) => {
    if (!closeHides(process.platform, quitting)) return
    event.preventDefault()
    if (window.isFullScreen()) {
      window.once('leave-full-screen', () => window.hide())
      window.setFullScreen(false)
    } else window.hide()
  })

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

// One copy per data folder: starting Tearsheet again brings this window back (lifecycle.ts).
if (claimOnlyCopy(app, () => mainWindow)) app.whenReady().then(createWindow)
// Clicking the Dock icon brings the hidden window back as it was.
app.on('activate', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show()
})
app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => {
  quitting = true
  engine?.stop()
})
