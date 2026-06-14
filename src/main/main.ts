import { app, BrowserWindow, Menu } from 'electron'
import { autoUpdater } from 'electron-updater'
import path from 'path'
import { registerIpcHandlers } from './ipc'
import { readConfig, saveAuthToken } from './store'
import { syncAllWorkspaceGithub } from './workspaceGithub'
import {
  AUTH_DEEP_LINK_HOST,
  DEEP_LINK_PROTOCOL,
  DEV_RENDERER_URL,
  WINDOW_DEFAULTS,
  WORKSPACE_GITHUB_POLL_MS,
} from './constants'

const isDev = process.env.NODE_ENV === 'development'
const isMac = process.platform === 'darwin'
const isWin = process.platform === 'win32'

let isQuitting = false
export let mainWindow: BrowserWindow | null = null
let workspaceGithubPoller: NodeJS.Timeout | null = null

// Must acquire lock before app is ready so second-instance fires on Windows/Linux
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

function handleDeepLink(url: string): void {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== `${DEEP_LINK_PROTOCOL}:` || parsed.hostname !== AUTH_DEEP_LINK_HOST) return
    const token = parsed.searchParams.get('token')
    if (!token) return
    saveAuthToken(token)
    mainWindow?.webContents.send('auth:token-received', token)
    if (mainWindow?.isMinimized()) mainWindow.restore()
    mainWindow?.focus()
  } catch {
    // malformed URL — ignore
  }
}

export function setupAutoUpdater(win: BrowserWindow): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = false

  autoUpdater.on('update-available', (info) => {
    win.webContents.send('updater:update-available', { version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    win.webContents.send('updater:update-not-available')
  })

  autoUpdater.on('error', (err: Error) => {
    win.webContents.send('updater:error', err.message)
  })

  void autoUpdater.checkForUpdates()
}

// macOS: deep link arrives via open-url while app is running
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

// Windows / Linux: second instance receives the protocol URL in argv
app.on('second-instance', (_, argv) => {
  const url = argv.find(arg => arg.startsWith(`${DEEP_LINK_PROTOCOL}://`))
  if (url) handleDeepLink(url)
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  BrowserWindow.getAllWindows().forEach(w => w.hide())
})

function createWindow(): BrowserWindow {
  mainWindow = null
  Menu.setApplicationMenu(null)

  const dark = readConfig().darkMode ?? false
  const bg = dark ? '#0c0c0c' : '#ffffff'

  const win = new BrowserWindow({
    width: WINDOW_DEFAULTS.width,
    height: WINDOW_DEFAULTS.height,
    minWidth: WINDOW_DEFAULTS.minWidth,
    minHeight: WINDOW_DEFAULTS.minHeight,
    titleBarStyle: 'hidden',
    backgroundColor: bg,
    show: false,
    ...(isMac && { trafficLightPosition: { x: 12, y: 13 } }),
    ...(isWin && { titleBarOverlay: { height: 40 } }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow = win
  win.once('ready-to-show', () => win.show())

  win.on('close', (e) => {
    if (isQuitting) return
    e.preventDefault()
    app.quit()
  })

  if (isDev) {
    win.loadURL(DEV_RENDERER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

function startWorkspaceGithubPolling(): void {
  if (workspaceGithubPoller) return
  workspaceGithubPoller = setInterval(() => {
    void syncAllWorkspaceGithub()
  }, WORKSPACE_GITHUB_POLL_MS)
}

app.whenReady().then(() => {
  app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL)
  registerIpcHandlers()
  const win = createWindow()
  setupAutoUpdater(win)
  startWorkspaceGithubPolling()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
