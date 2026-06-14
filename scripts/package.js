const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const outputDir = path.join(projectRoot, 'release')
const electronBuilder = path.join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder')

// Per-platform args: build only the single installer needed for a local install.
const targetsByPlatform = {
  darwin: ['--mac', 'dmg', '--arm64'],
  win32: ['--win', 'nsis', '--x64'],
  linux: ['--linux', 'AppImage', '--x64'],
}

const platformArgs = targetsByPlatform[process.platform]
if (!platformArgs) {
  console.error(`[package] Unsupported platform: ${process.platform}`)
  process.exit(1)
}

// `--publish never` builds without uploading; the package.json `build.publish`
// block stays intact for real releases.
const result = spawnSync(electronBuilder, [...platformArgs, '--publish', 'never'], {
  stdio: 'inherit',
  cwd: projectRoot,
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

// Keep only the installer; remove update metadata, diagnostics, and the
// unpacked app directory that a local install doesn't need.
const isInstaller = (name) => /\.(dmg|exe|AppImage)$/.test(name)

for (const name of fs.readdirSync(outputDir)) {
  if (!isInstaller(name)) fs.rmSync(path.join(outputDir, name), { recursive: true, force: true })
}

console.log('[package] Done. Installer left in release/.')
