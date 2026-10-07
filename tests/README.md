# Tests

No unit test suite. These are end-to-end smoke tests that drive the real daemon
under the real Electron binary, so a broken native `node-pty` build fails them
too.

```bash
npm run smoke            # all of them
npm run smoke:panes      # the terminal pane split tree and tab order, plain Node
npm run smoke:daemon     # the daemon over its socket
npm run smoke:main       # the main-process DaemonClient under Electron
npm run smoke:renderer   # a real BrowserWindow with the real preload
npm run smoke:ides       # the IDEs feature's main-process modules, plus a live VS Code snapshot
```

```
tests/
  helpers/
    report.js       check() and the pass/fail summary
    paths.js        repo root, the Electron binary, build outputs
    daemonHome.js   a throwaway DEVREALM_DAEMON_HOME per run
    daemonClient.js a client for the daemon's wire protocol
    appDriver.js    launches the built app and drives its window over CDP
  smoke/
    daemon.js       persistence, snapshots, flow control, env stripping
    main.js         spawn, connect, stale-daemon replacement
    renderer.js     the MessagePort data plane, split panes, theming
    ides.js         title parsing, --status parsing, process classification, live snapshot
    terminalLayout.js  drag-and-drop splits: drop zones, the pane tree, tab order
  integration/
    terminalPanes.js   the Terminals screen's split panes, end to end in the app
  fixtures/
    ides/           `code --status` output and a `ps` listing captured from VS Code 1.107
```

## Integration

```bash
npm run integration:panes            # against the production build
npm run integration:panes -- --dev   # against Vite, so StrictMode double-mounts
```

Launches the real app and drives its window over the Chrome DevTools Protocol
with real mouse and keyboard input: drags tabs onto pane edges and tab bars,
pulls sashes, types into shells and checks the daemon got it, switches
workspaces and reloads. HTML drag and drop runs through
`Input.setInterceptDrags`, so no OS drag session is ever started.

The app gets a temporary `HOME` seeded with two workspaces of its own and a
temporary daemon home, so it never reads your workspaces or touches your
shells. Screenshots of a few states, and of any section that fails, land in
`tests/integration/screenshots/` (git-ignored). Run `--dev` at least once after
touching attach or remount code: the doubled-output bug only showed up there.

Each suite runs its own daemon against a temporary `DEVREALM_DAEMON_HOME`.
Never point one at the real home: the stale-build check would replace the
developer's daemon and kill the shells they are working in.

Every check here exists because something broke. Before removing one, find the
bug it was written for in `docs/terminals.md` or `docs/ides-implementation.md`.

The suites run under the Electron binary. From a VS Code terminal or a Claude
Code session, `ELECTRON_RUN_AS_NODE=1` is already set and turns that binary
into plain Node, so `require('electron')` returns a path string and `app` is
undefined. Run them with `env -u ELECTRON_RUN_AS_NODE npm run smoke` there.

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

The IDEs suite cannot reach the AppleScript path. `System Events` refuses a
process whose parent has no Automation consent, and the test's Electron binary
never gets one, so listing, raising and closing windows through Accessibility
are verified in the running app instead. The live section lists windows through
the CLI fallback, which is the same code the app runs before the permission is
granted.
