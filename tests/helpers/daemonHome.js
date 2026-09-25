// A throwaway DEVREALM_DAEMON_HOME per run.
//
// Without this a suite drives the developer's real daemon, and can trigger the
// stale-build replacement that kills the shells they are working in.

const fs = require('fs')
const os = require('os')
const path = require('path')

function useTemporaryDaemonHome(label) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `devrealm-${label}-`))
  process.env.DEVREALM_DAEMON_HOME = home
  return {
    home,
    cleanup: () => {
      try {
        fs.rmSync(home, { recursive: true, force: true })
      } catch {
        // A leftover temp dir is not worth failing a passing run over.
      }
    },
  }
}

module.exports = { useTemporaryDaemonHome }
