// Repo paths and the Electron binary, resolved once.

const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')

const ELECTRON = process.platform === 'darwin'
  ? path.join(ROOT, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
  : path.join(ROOT, 'node_modules/electron/dist', process.platform === 'win32' ? 'electron.exe' : 'electron')

const DAEMON_ENTRY = path.join(ROOT, 'dist/daemon/main.js')
const PRELOAD = path.join(ROOT, 'dist/main/preload.js')

module.exports = { ROOT, ELECTRON, DAEMON_ENTRY, PRELOAD }
