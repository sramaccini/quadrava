# ADR-17: Quadrava Studio as a desktop application

Status: Accepted (23 October 2026)

## Context

Studio is a web application. It works on a **project folder**, and the browser lets a page read and write a folder on disk only through the File System Access API, which only Chrome and Edge have. In Safari and Firefox, and so on most Macs and Linux desktops, projects stay in the private storage of the browser and travel as zip archives.

We want Studio installable as a desktop application on Windows, Linux and macOS, working directly on project folders on disk.

## Decision

**Tauri 2 around the web build of Studio.** The desktop app (`frontend/desktop/src-tauri`) is a small Rust program that shows `dist/editor/browser` in the webview of the system (WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux). All the logic stays in the web application: there is one Studio, built once, that also runs in the browser.

```
frontend/desktop/src-tauri
  tauri.conf.json   window, CSP, bundle (icons from assets/brand)
  src/main.rs       plugins: dialog, fs, persisted-scope
  capabilities/     what the page may call: choose a folder, read and write files in the folders chosen
         │
         ▼ window.__TAURI__ (withGlobalTauri)
Studio (web build)
  desktopApi()      null in the browser
  DesktopFolder     a ProjectFolder on a path: list, read, write, remove
  ProjectLibrary    «Open project folder…» → native dialog; the last project reopens at start
```

- **No Tauri code in the web build.** Studio reads the Tauri APIs from `window.__TAURI__`, which only the desktop app defines: no npm package of Tauri is bundled, and in the browser nothing changes.
- **Files only where the user chose.** The page may call the dialog and a few `fs` commands (read a folder, read and write text files, create folders, remove a file, check existence), only inside the folders chosen in the dialog (the scope of the `fs` plugin). `persisted-scope` keeps those folders between sessions, so the last project reopens at start without asking. Paths inside the project follow the same rule as on the web (`RESOURCE_PATH`): no `..`, no absolute paths.
- **Content Security Policy** of the window: scripts only from the application, connections to the application, to Tauri and to `http(s)` addresses (OpenAPI import, registry), frames only from the application (the preview, ADR-08). Styles allow `'unsafe-inline'`, which Angular and NG-ZORRO need; Tauri is told not to add its nonce to `style-src` (`dangerousDisableAssetCspModification`), because with a nonce the browser ignores `'unsafe-inline'` and the window stays white.
- **«Run project» in a second window of the app.** The runtime is bundled with Studio, built with `--base-href /runtime/` and copied into `runtime/` of the web build by `tools/desktop-runtime.mjs`, which also lists the origins of Studio in the app in its `runtime-config.json` (`tauri://localhost` on macOS and Linux, `http(s)://tauri.localhost` on Windows). «Run project» opens `/runtime/?studio=<origin>` in a window labelled `run` (`WebviewWindow`), or brings it to the front and reloads it. The two windows are on the same origin but the second has no `window.opener`: the messages of ADR-16 (`lc-studio:ready`, `project`, `reload`) travel on a `BroadcastChannel` named `quadrava-studio`, which the webview keeps to the windows of that origin. The runtime uses the channel only when it has no opener and Studio is on its own origin; it still accepts only well-formed messages. On reload the runtime window goes back to `/runtime/`, because the app does not serve deep routes. Only the main window has permissions (`capabilities/default.json`: create a window, focus it, plus the dialog and `fs`); the runtime window has none.

```
Studio (main window)                         runtime (window "run", /runtime/)
  ▶ Run project ── new WebviewWindow ──────▶ starts, ?studio=tauri://localhost
               ◀── lc-studio:ready ───────── on BroadcastChannel "quadrava-studio"
               ─── lc-studio:project ──────▶ draws the project
  ▶ again ─────── lc-studio:reload + focus ─▶ back to /runtime/, asks again
```

- **Builds on GitHub Actions** (`.github/workflows/desktop.yml`), one machine per operating system, because Tauri does not cross-compile: `.msi` and `.exe` for Windows, `.deb`, `.rpm` and `.AppImage` for Linux, `.dmg` and `.app` for macOS (one package for Apple silicon and Intel). The packages are downloaded from the run as artifacts.

## Consequences

- Studio on disk everywhere, with native dialogs, in a window of its own; the browser version is unchanged.
- **«Run project»** works with the runtime bundled in the app; «Runtime address…» is not offered there. The first version of the app did not have it (the runtime would have opened in another program); the package is now larger by the size of the runtime.
- **No registry in the app** (decided 28 October 2026). In the browser Studio reaches the registry at relative addresses behind the BFF, with the session cookie and the CSRF token of the BFF. None of this carries to the app: its origin (`tauri://localhost`) is another site for the BFF, the webviews block or restrict cookies of other sites (WKWebView by default), and a login in the system browser leaves the cookie in that browser, not in the app. The registry stays off in the app, whatever `studio-config.json` says; projects reach the registry through the Studio published in the browser (the same folder, or a zip archive).

  If it is needed later, the app would need a session of its own with the BFF, without handing it the tokens of the identity provider: the login in the system browser, then an opaque session handle given to the app (through a `quadrava://` link, with the deep-link and single-instance plugins, or by polling the BFF with a confirmation code shown in both places, with the opener plugin), kept in memory and sent in a header; CORS for the origins of the app on the BFF. A new ADR, a change to the BFF and new plugins.
- **Developer tools** (Inspect, Ctrl+Shift+I) are on in the installed app too (`devtools` feature of `tauri`), to read the errors of Studio while the app is young; to be switched off once it is stable.
- The packages are **not signed**: Windows SmartScreen and macOS Gatekeeper warn the first time. Signing needs certificates (Windows) and an Apple Developer account (macOS), configured as secrets of the workflow.
- New dependencies: `@tauri-apps/cli` (development only, npm) and the Rust crates `tauri`, `tauri-build`, `tauri-plugin-dialog`, `tauri-plugin-fs`, `tauri-plugin-persisted-scope` (MIT or Apache-2.0). Building locally needs Rust 1.77.2 or later and the system prerequisites of Tauri.

## Alternatives considered

- **Electron**: a whole Chromium in every package (over 100 MB against about 10 MB) and Node.js next to the page; the File System Access API would work as in Chrome, but at the cost of size and of a larger surface.
- **A progressive web app**: installable, but on disk still only in Chrome and Edge.
- **Tauri with the npm packages of its API** (`@tauri-apps/api`, plugins): typed, but bundled in the web build too; the global object keeps the browser build as it is.
