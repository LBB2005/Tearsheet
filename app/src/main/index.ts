// The Electron main process (design item 42; first-run design item 12). The PATH fix runs first;
// then the engine is started and the window opens, with context isolation and the sandbox on and
// Node integration off, and the first read of the AI tools runs while it loads (toolWatch.ts).
// The window never navigates; clicks inside the report frame go through navigationAction and are
// always cancelled.

import { existsSync as fileExists } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { app, BrowserWindow, ipcMain, Menu, net, powerSaveBlocker, shell } from 'electron'

import { INSTALL_BUTTON, SWITCH_URL } from '../shared/flags'

import { keepAwakeDuringLine } from './awake'
import { dockUpdate, NO_RUN } from './dockProgress'
import { Downloads, printHtmlToPdf, writeNew } from './downloads'
import { Engine, engineCommand, type Notification } from './engine'
import { Installer } from './installer'
import { InstallSwitch } from './installSwitch'
import { notify, registerIpc } from './ipc'
import { readWindowLook, registerLookIpc } from './look'
import { debugSwitches, dropDevHooks, hooksAllowed, TEST_BUILD } from './devHooks'
import { claimOnlyCopy, closeHides, hiddenForChecks } from './lifecycle'
import { loginShellPath } from './loginShellPath'
import { menuTemplate } from './menu'
import { navigationAction } from './navigation'
import { Probe } from './probe'
import { createSetupLog } from './setupLog'
import { sweepStaleTemp } from './tempSweep'
import { stepRules } from './toolSteps'
import { testMode } from './tools'
import { ToolWatch } from './toolWatch'

// A release build ignores every development and test hook (devHooks.ts): they are removed from
// the environment before anything below reads it, so the engine never gets them either. Nor does
// it start with Chromium's remote-debugging switches. A development run and a test build
// (`npm run package:test`) keep them.
const hooks = hooksAllowed(app.isPackaged, TEST_BUILD)
const droppedHooks = dropDevHooks(process.env, hooks)
const refusedSwitches = hooks ? [] : debugSwitches((name) => app.commandLine.hasSwitch(name))
if (refusedSwitches.length) {
  console.error(`Tearsheet doesn't start with ${refusedSwitches.map((s) => `--${s}`).join(', ')}.`)
  app.exit(1)
  process.exit(1)
}

// The login shell's PATH, and its CLAUDE_CONFIG_DIR and CODEX_HOME, so the tools and the engine
// read the same sign-in as Terminal.
const loginShell = loginShellPath()
const fixedPath = loginShell.path
process.env.PATH = fixedPath

// Electron's own files go in a sub-folder, so they stay apart from the engine's data.
const dataDir = process.env.TEARSHEET_DATA_DIR || join(app.getPath('appData'), 'Tearsheet')
app.setPath('userData', join(dataDir, 'app-shell'))

// The setup log (setupLog.ts), and this launch's test rules, worked out once from the environment
// (tools.ts): no real installers when any test switch or program path is set, and test mode only
// with TEARSHEET_TEST_TOOLS.
const setupLogFile = join(dataDir, 'logs', 'setup.log')
const setupLog = createSetupLog(setupLogFile)
const rules = stepRules(process.env, homedir())
const inTestMode = testMode(process.env)

// The online off switch (installSwitch.ts). The value saved by an earlier launch is read now; this
// launch's own read starts once the app is ready (net.fetch needs it), and counts from the next
// launch. INSTALL_BUTTON and SWITCH_URL come from shared/flags.ts, which only this file imports.
const installSwitch = new InstallSwitch({
  dataDir,
  installButton: INSTALL_BUTTON,
  switchUrl: SWITCH_URL,
  testMode: inTestMode,
  env: process.env,
  fetch: (url, init) => net.fetch(url, init),
  log: setupLog
})

// The one owner of the tools' status reads. Its first read runs while the window loads.
const probe = new Probe({
  pathValue: fixedPath,
  env: process.env,
  claudeConfigDir: loginShell.claudeConfigDir,
  codexHome: loginShell.codexHome,
  log: setupLog
})
const watch = new ToolWatch({ probe: () => probe.getTools() })

// A check's window, never shown (lifecycle.ts). Tearsheet then can't come to the front at all,
// even as it starts: no Dock icon and no menu bar.
const hidden = hiddenForChecks(process.env)
if (hidden && process.platform === 'darwin') app.setActivationPolicy('prohibited')

let engine: Engine | null = null
// The Install button (installer.ts), made only when INSTALL_BUTTON is on.
let installer: Installer | null = null
let mainWindow: BrowserWindow | null = null
// Set once Tearsheet is quitting, so closing the window then closes it for good (lifecycle.ts).
let quitting = false

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
  setupLog.log('path_source', { source: loginShell.source })
  setupLog.log('test_rules', { test_mode: inTestMode, no_real_installers: rules.noRealInstallers })
  if (droppedHooks.length) setupLog.log('dev_hooks_ignored', { value: droppedHooks.length })
  void installSwitch.read()
  // Old temporary folders a stopped copy left behind (tempSweep.ts).
  void sweepStaleTemp()
  const { command, args, cwd } = engineCommand({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    dataDir,
    repo: process.env.TEARSHEET_REPO
  })
  engine = new Engine({
    command,
    args,
    cwd,
    // No program paths from a probe: the engine looks each tool up on this PATH when it needs it,
    // so it finds the same program as the window, even one installed after launch. A program path
    // set in the environment (a test launch) passes through untouched and is final.
    env: {
      ...process.env,
      PATH: fixedPath,
      TEARSHEET_PATH: fixedPath,
      TEARSHEET_DATA_DIR: dataDir,
      ...(loginShell.claudeConfigDir ? { CLAUDE_CONFIG_DIR: loginShell.claudeConfigDir } : {}),
      ...(loginShell.codexHome ? { CODEX_HOME: loginShell.codexHome } : {})
    },
    logFile: join(dataDir, 'logs', 'engine.log'),
    setupLog
  })

  const lookFile = join(app.getPath('userData'), 'window-look.json')
  const look = readWindowLook(lookFile)
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 820,
    minHeight: 600,
    title: 'Tearsheet',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    // The click that brings the window back also presses what is under it (first-run design §4).
    acceptFirstMouse: true,
    // The look's own colour and zoom from last time (look.ts), so a light look opens light.
    backgroundColor: look.background,
    show: !hidden,
    webPreferences: {
      zoomFactor: look.zoom,
      backgroundThrottling: !hidden,
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  mainWindow = window
  // With the build's switch off there is no installer, and ipc.ts registers no install calls.
  installer = INSTALL_BUTTON
    ? new Installer({
        watch,
        rules,
        pathValue: fixedPath,
        claudeConfigDir: loginShell.claudeConfigDir,
        codexHome: loginShell.codexHome,
        env: process.env,
        send: (progress) => notify(window, { method: 'install_progress', params: progress }),
        openExternal: (url) => shell.openExternal(url),
        // An install pressed after this launch's fresh off is refused.
        switchOn: () => installSwitch.allowsInstall(),
        testMode: inTestMode,
        log: setupLog
      })
    : null
  const started = engine
  registerIpc(window, engine, {
    watch,
    rules,
    log: setupLog,
    setupLogFile,
    installer: installer ?? undefined,
    installButton: () => installSwitch.getInstallButton(),
    engineLogFile: join(dataDir, 'logs', 'engine.log'),
    about: () => ({
      app: app.getVersion(),
      engine: started.hello?.engine_version ?? null,
      macos: process.getSystemVersion(),
      electron: process.versions.electron
    })
  })
  // The watcher reads only while the window is in front (toolWatch.ts). The first read runs now,
  // while the window loads, and the window's own getTools shares it.
  window.on('focus', () => watch.onWindowFocus())
  window.on('blur', () => watch.onWindowBlur())
  void watch.read().catch(() => undefined)
  // The downloads at the end of a report (downloads.ts): straight to ~/Downloads. A hidden check
  // run points them at a scratch folder instead.
  const running = engine
  const downloads = new Downloads({
    request: (method, params) => running.request(method, params),
    dir: process.env.TEARSHEET_DOWNLOADS_DIR || app.getPath('downloads'),
    exists: fileExists,
    write: writeNew,
    printPdf: printHtmlToPdf,
    notify: (note) => {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('tearsheet:download', note)
    }
  })
  ipcMain.handle('tearsheet:saveCsv', (_event, name: unknown, text: unknown) => downloads.saveCsv(name, text))
  ipcMain.handle('tearsheet:showDownload', (_event, path: unknown) => {
    if (!downloads.isSaved(path)) return false
    shell.showItemInFolder(path)
    return true
  })
  registerLookIpc(window, lookFile)
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate((command) => {
        if (window.isDestroyed() || window.webContents.isDestroyed()) return
        // A shortcut used while the window is hidden (⌘N, say) brings it back first.
        if (!window.isVisible() && !hidden) window.show()
        window.webContents.send('tearsheet:menu', command)
      }, !app.isPackaged)))
  showProgressInDock(window, engine)
  // The Mac stays awake while the line has reports to write (awake.ts).
  keepAwakeDuringLine(engine, powerSaveBlocker)
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
    else if (action.kind === 'open') window.webContents.send('tearsheet:open-view', { view: action.view, item: action.item })
    else if (action.kind === 'download') void downloads.start(action.format, action.reportId)
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
if (claimOnlyCopy(app, () => (hidden ? null : mainWindow))) app.whenReady().then(createWindow)
// Clicking the Dock icon brings the hidden window back as it was.
app.on('activate', () => {
  if (mainWindow && !mainWindow.isDestroyed() && !hidden) mainWindow.show()
})
app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => {
  quitting = true
  watch.stop()
  // A sign-in or install still running is stopped with Tearsheet, not left behind.
  installer?.stop()
  engine?.stop()
})
