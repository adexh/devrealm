// Shared pass/fail reporting for the smoke suites.

let failures = 0

/** Records one assertion. `extra` is context shown after the label. */
function check(label, ok, extra = '') {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ' | ' + extra : ''}`)
}

/** Prints the summary and returns the process exit code. */
function summary() {
  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
  return failures === 0 ? 0 : 1
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

module.exports = { check, summary, wait }
