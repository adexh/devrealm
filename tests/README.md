# Tests

No unit test suite. These are end-to-end smoke tests that drive the real daemon
under the real Electron binary, so a broken native `node-pty` build fails them
too.

```bash
npm run smoke            # all three
npm run smoke:daemon     # the daemon over its socket
npm run smoke:main       # the main-process DaemonClient under Electron
npm run smoke:renderer   # a real BrowserWindow with the real preload
```

```
tests/
  helpers/
    report.js       check() and the pass/fail summary
    paths.js        repo root, the Electron binary, build outputs
    daemonHome.js   a throwaway DEVREALM_DAEMON_HOME per run
    daemonClient.js a client for the daemon's wire protocol
  smoke/
    daemon.js       persistence, snapshots, flow control, env stripping
    main.js         spawn, connect, stale-daemon replacement
    renderer.js     the MessagePort data plane, split panes, theming
```

Each suite runs its own daemon against a temporary `DEVREALM_DAEMON_HOME`.
Never point one at the real home: the stale-build check would replace the
developer's daemon and kill the shells they are working in.

Every check here exists because something broke. Before removing one, find the
bug it was written for in `docs/terminals.md`.

## Known gaps

The renderer suite drives a plain page, which cannot import the bundled renderer
modules, so two checks stand in for code they do not actually run:

- The split-pane checks use their own `window` listener rather than
  `onSessionPort`, which is where the sibling-port bug was. They prove the main
  process delivers two usable ports, not that the renderer's router is correct.
- The theme checks compare CSS custom properties between a `.dark` subtree and
  the document root. They prove the tokens resolve differently, not that
  `XtermHost` reads from the right element; it could regress to
  `documentElement` and these would still pass.

Closing either means loading the built renderer chunk into the page, which ties
the test to hashed filenames and module side effects. Worth it only if one of
these regresses again.
