# ADR-16: Running the project of Studio in the runtime

Status: Accepted (20 October 2026)

## Context

Studio previews one screen at a time (or the menu, or a theme) in an iframe of its own (ADR-08). To try the application as a whole (the menu, moving from screen to screen with `navigate`, the themes and languages of the project, the real shell with its header and breadcrumbs) the project had to be saved, published to a registry and opened in a runtime configured for that registry. That needs the services running, and shows only what was published.

We want a «Run» command in Studio that opens the current project in the runtime, in another window of the browser, unsaved changes included.

## Decision

**The real runtime, fed by Studio.** «Run project» opens the runtime (its address is a setting of Studio, remembered in the browser) in a new window with `?studio=<origin of Studio>`. The runtime, before starting, checks that origin against its own configuration, asks Studio (`window.opener`) for the project and starts with a `DefinitionSource` that serves that snapshot from memory. Everything else is the runtime as it is: its shell, its routes, its ports (fake data in the demo, the real services behind the BFF), its validation of every document.

```
Studio (4201)                                   runtime (4200)
  «Run project» ── window.open(runtime?studio=http://localhost:4201)
                                                 runtime-config.json: studio.origins includes it?  no → normal start
                 ◄── { type: lc-studio:ready } ── yes: asks the opener
  snapshot of the project ── { type: lc-studio:project, project } ──►
                                                 SnapshotDefinitions → the runtime starts
  «Run project» again ── { type: lc-studio:reload } ──► reload → ready → new snapshot
```

**The snapshot** is the project as Studio sees it: the files of the project (manifest, navigation, screens, data sources, themes, translation catalogues) with the documents of the open windows in place of their files, unsaved changes and translations written in the screens included. Only definitions travel: no data, no credentials.

**Safety.**
- The runtime accepts a project only from the origins listed in `runtime-config.json` (`studio.origins`); without that list the feature is off (fail-closed) and `?studio` is ignored. The demo lists the development addresses of Studio (4201, 4301).
- Messages are accepted only from the window that opened the runtime and from that origin, and are sent only to it (`postMessage` with an explicit target origin). The snapshot is checked in its shape (identifiers, sizes) before use; every document is then validated as always, and an invalid one shows its problems as it would from the registry.
- Studio sends the snapshot only to the window it opened and only to the origin of the runtime address.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| A «run» mode inside Studio (like the preview iframe) | It would have to rebuild the shell of the runtime (header, menu, routes, themes, languages) inside the editor: a second runtime to keep in step |
| Publishing to the registry and opening the runtime on it | Needs the services; shows what is published, not what is being edited |
| Sharing the browser storage of the project | Studio and the runtime are on different origins (and a project on disk is reachable only by the window that opened it) |
| Sending the project in the URL | Size limits, and definitions would end up in history and logs |

## Consequences

- The runtime used for trying must list the origin of Studio in its configuration; a production runtime normally does not.
- The data are those of the runtime: in the demo its fake back end (screens calling other services get errors), behind the BFF the real services, with their permissions.
- The window shows the snapshot taken when it was opened (or reloaded with «Run project» again), not every keystroke.
