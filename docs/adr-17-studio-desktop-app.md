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
- **Content Security Policy** of the window: scripts only from the application, connections to the application, to Tauri and to `http(s)` addresses (OpenAPI import, registry), frames only from the application (the preview, ADR-08).
- **Builds on GitHub Actions** (`.github/workflows/desktop.yml`), one machine per operating system, because Tauri does not cross-compile: `.msi` and `.exe` for Windows, `.deb`, `.rpm` and `.AppImage` for Linux, `.dmg` and `.app` for macOS (one package for Apple silicon and Intel). The packages are downloaded from the run as artifacts.

## Consequences

- Studio on disk everywhere, with native dialogs, in a window of its own; the browser version is unchanged.
- **«Run project» is not available in the desktop app** (ADR-16): the project travels between two windows of the same browser (`window.opener`, `postMessage`), and the runtime would open in another program. A later version can open the runtime in a second window of the app and relay the messages.
- **The registry** is reached at relative addresses behind the BFF in the browser; in the desktop app there is no BFF, so saving to and opening from a registry are not available yet.
- The packages are **not signed**: Windows SmartScreen and macOS Gatekeeper warn the first time. Signing needs certificates (Windows) and an Apple Developer account (macOS), configured as secrets of the workflow.
- New dependencies: `@tauri-apps/cli` (development only, npm) and the Rust crates `tauri`, `tauri-build`, `tauri-plugin-dialog`, `tauri-plugin-fs`, `tauri-plugin-persisted-scope` (MIT or Apache-2.0). Building locally needs Rust 1.77.2 or later and the system prerequisites of Tauri.

## Alternatives considered

- **Electron**: a whole Chromium in every package (over 100 MB against about 10 MB) and Node.js next to the page; the File System Access API would work as in Chrome, but at the cost of size and of a larger surface.
- **A progressive web app**: installable, but on disk still only in Chrome and Edge.
- **Tauri with the npm packages of its API** (`@tauri-apps/api`, plugins): typed, but bundled in the web build too; the global object keeps the browser build as it is.
