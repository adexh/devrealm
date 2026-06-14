const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const electronBinary = require('electron')
const projectRoot = path.resolve(__dirname, '..')
const mainEntry = path.join(projectRoot, 'dist', 'main', 'main.js')
const watchDir = path.join(projectRoot, 'dist', 'main')

let child = null
let restartTimer = null
let isShuttingDown = false

function startElectron() {
  if (isShuttingDown) return

  child = spawn(electronBinary, [mainEntry], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
    },
  })

  child.on('exit', (code, signal) => {
    child = null
    if (isShuttingDown) return

    if (signal !== 'SIGTERM' && signal !== 'SIGINT') {
      console.log(`[electron-dev] Electron exited (${signal ?? code}). Waiting for changes to restart.`)
    }
  })
}

function restartElectron() {
  if (isShuttingDown) return

  if (!child) {
    startElectron()
    return
  }

  const previous = child
  child = null
  previous.once('exit', () => {
    if (!isShuttingDown) startElectron()
  })
  previous.kill('SIGTERM')
}

function scheduleRestart() {
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = setTimeout(() => {
    restartTimer = null
    restartElectron()
  }, 150)
}

function shutdown() {
  isShuttingDown = true
  if (restartTimer) clearTimeout(restartTimer)
  if (child) {
    child.kill('SIGTERM')
    child = null
  }
  process.exit(0)
}

fs.watch(watchDir, { recursive: true }, (_eventType, fileName) => {
  if (!fileName || !fileName.endsWith('.js')) return
  scheduleRestart()
})

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

startElectron()
