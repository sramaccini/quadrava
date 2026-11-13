# Changelog

Notable changes of Quadrava Community Edition (CE), per release. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) (ADR-20).

What a version covers: the JSON languages (`frontend/projects/schema`), the libraries, the runtime and its container
image, the CLI and the contracts (`contracts/*.yaml`, which also carry their own version); up to 0.3.0 also
Quadrava Studio and the reference registry, which since 0.4.0 are the commercial edition (ADR-21). Before 1.0.0 a minor
version may break compatibility; the entry then says so under **Changed** or **Removed**, with what to do.

How to release: DEVELOPMENT-GUIDE, «Releasing a version».

## [Unreleased]

### Changed

- The Content-Security-Policy of the runtime image is tighter (request Q21 of OpenDevTrack): images only from the same
  origin and `data:` addresses, plus the new `QUADRAVA_CSP_IMG_SRC` (`https://cdn.example.com`, `https:` for any); an
  installation that shows images from other hosts sets it. Style elements need the nonce of the answer, which nginx
  writes in `index.html` (`ngCspNonce`, served with `no-store`); style attributes stay allowed for NG-ZORRO
  (`style-src-attr 'unsafe-inline'`, the reason is in `docker/runtime/README.md`).

### Fixed

- The style elements of the theme (contrast rules, dark surfaces) carry the nonce of the page (`CSP_NONCE`), so a
  policy without `'unsafe-inline'` allows them.

## [0.14.0] - 2026-11-13

### Changed

- The runtime image runs nginx as the user `nginx` (101, group 0), not root, still on port 8080: it works with
  `runAsNonRoot` in Kubernetes and with any user id in group 0 (OpenShift). A configuration mounted at
  `/etc/quadrava/runtime-config.json` must be readable by that user (request Q20 of OpenDevTrack).

### Added

- `optionKeys` on fields and `valueKeys` on table columns and stats: the catalogue key of a single value that cannot be
  part of a key, such as `*` for every event (`{ "*": "values.events.all" }`), before `optionKey` and `valueKey`
  (request Q16 of OpenDevTrack). The «Sent by» field of the flow form in the showcase «Forms» has one.
- The runtime image sends a Content-Security-Policy with the files of the runtime (scripts, data and frames from the same
  origin only) and, with `QUADRAVA_HSTS` (`max-age=31536000`), `Strict-Transport-Security` on every answer; the
  answers of the BFF keep their own headers (request Q18 of OpenDevTrack). The production build of the runtime no
  longer inlines the critical CSS, whose loader was an inline script that such a policy blocks.

### Fixed

- The buttons of a form, of a wizard and of a comment wrap when they do not fit instead of widening the page
  (WCAG 1.4.10, reflow; request Q17 of OpenDevTrack). The flow form of the showcase «Forms» has a row of four.
- A select, multiselect, radio, checkbox, date or text field that cannot be changed (`readOnlyIf`, `enabledIf`) keeps
  the colour of its text instead of the pale grey of NG-ZORRO, so the value stays readable (WCAG 1.4.3, contrast;
  request Q19 of OpenDevTrack). The flow form of the showcase «Forms» has three read-only fields.

## [0.13.1] - 2026-11-12

### Fixed

- A `select`, `multiselect` or `radio` field whose value is not among its `options` (a status added by the service,
  for example) showed an empty field, «—» when read only. The value is now shown as it is, after the options, translated
  with `optionKey` like them (request of OpenDevTrack).

## [0.13.0] - 2026-11-08

### Added

- Fields: `width` (`xs`, `s`, `m`, `l`: about 8, 16, 32 and 48 characters) makes an input narrower than its cell, in
  `form`, `input` and `filterBar`; the theme can change the sizes (`--lc-field-width-xs` … `-l`). Without it nothing
  changes.
- Form: `layout: "flow"` places the fields one after the other on the same line while they fit, each as wide as its
  `width`, a field without `width` on a line of its own; `columns` and `span` are not used there. The showcase «Forms»
  has an example. Quadrava Studio: the two properties appear in the property panel from the schema.

## [0.12.1] - 2026-11-07

### Added

- An address opens the settings dialog on a tab: `?settings=<tab>` (`general`, the `id` of a section of the
  application, `debug` in the demo), for example `/?settings=notification-settings` from a mail (ADR-25, request Q15 of
  OpenDevTrack). It works after the sign-in and from the root (over the default screen), a reload keeps the dialog
  open, changing tab updates the address and closing removes it. `settings` is now a parameter of the shell: a screen
  no longer receives a query parameter with that name.

## [0.12.0] - 2026-11-07

### Added

- **Items of the application in the user menu and sections in the settings dialog** (ADR-25): `userMenu` and
  `settings` in the navigation, with the shape of a menu item (label, icon, screen with parameters, `requires`,
  `visibleIf`). An item opens its screen; a section is a tab of the settings that draws a screen of the application,
  for example a form read with a GET and saved with a PUT. `NavigationRuntime` gains `userMenu()` and `settings()`,
  and `checkNavigation` checks their identifiers and screens. The demo has «Notifications» in the settings and
  «Expenses to review» in the user menu.
- **The chosen language reaches the services**: the interceptor of `services` sends `Accept-Language` with the language
  of the user on every call to the same origin (BFF contract 0.4: the BFF forwards it; the reference BFF already did).
- Chart: with many categories the labels that do not fit are left out of the axis, keeping the first, the last and
  others at an even step between, and dates that do not fit pass to a short form («7 Oct»); the tooltip and the table
  for screen readers keep the full label (request Q14 of OpenDevTrack). The showcase dashboard has a thirty-day chart.
- `npm run conformance:bff` signs in by itself with `--user` and `--password` (through the Keycloak login page of the
  development realm) instead of the cookies of a signed-in browser. `npm run conformance` runs the kits of
  authorization, telemetry and BFF against the local stack, and CI runs it on every push against the reference
  services (job «conformance»).

### Fixed

- `quadrava validate` checks the navigation as the runtime does at start-up: unique identifiers, a `default` that is
  an area, screens that are in the project (user menu and settings included). Before, a `default` naming a screen
  passed and the runtime then refused the whole menu.

## [0.11.1] - 2026-11-07

### Added

- Kanban: `onOpen` opens a card. Its title becomes a button that runs the steps with the row in `row` (usually
  `navigate` to the detail screen); a click elsewhere on the card does the same, the «Move» button and dragging do not.
- Kanban: `badges[].valueKey` translates the shown value, as in table columns (`values.priority` shows
  `t('values.priority.high')` instead of `high`); the tones stay tied to the stored value.
- Kanban: `laneField` and `lanes` can be expressions, so one board can be grouped in several ways
  (`"laneField": "{{ state.groupBy }}"`). An empty text gives the board without lanes, an empty list the lanes found in
  the data; an expression that fails shows no cards.

### Fixed

- The round button that collapses the side menu is back on the edge of the menu: in 0.11.0 it ended up at the top
  right of the page, which became a little wider than the window. It still stays in view while the page scrolls.

## [0.11.0] - 2026-11-06

### Changed

- **Breaking.** The word «lowcode» is gone from the code: names, tokens, telemetry attributes and environment variables
  use `lc`, the prefix already used by tags, CSS variables and message keys. Old names are not kept as aliases.

  | Before | After |
  | --- | --- |
  | `provideLowcodeComponents`, `provideLowcodeServices` | `provideLcComponents`, `provideLcServices` |
  | `LowcodeServicesConfig` | `LcServicesConfig` |
  | `LOWCODE_SERVICES_CONFIG`, `LOWCODE_REDIRECT`, `LOWCODE_TRACE` | `LC_SERVICES_CONFIG`, `LC_REDIRECT`, `LC_TRACE` |
  | `lowcodeHttpInterceptor` | `lcHttpInterceptor` |
  | span and baggage attributes `lowcode.screen`, `lowcode.action`, `lowcode.datasource`, `lowcode.datasources`, `lowcode.cancelled`, `lowcode.interrupted`; OTLP scope `lowcode.runtime` | `lc.screen`, `lc.action`, `lc.datasource`, `lc.datasources`, `lc.cancelled`, `lc.interrupted`; `lc.runtime` |
  | reference BFF variables `LOWCODE_REGISTRY_URL`, `LOWCODE_AUTHZ_URL`, `LOWCODE_TELEMETRY_URL`, `LOWCODE_API_URL`, `LOWCODE_HOME` | `LC_REGISTRY_URL`, `LC_AUTHZ_URL`, `LC_TELEMETRY_URL`, `LC_API_URL`, `LC_HOME` |
  | session cookie named in the contracts `LOWCODE_SESSION` | `LC_SESSION` |

  Dashboards and queries on the telemetry attributes, and deployments that set the BFF variables, need the new names.

### Added

- Context for the audit of the services (RF-AUD-02): every data-source call carries a W3C `baggage` header with
  `lc.screen` and, for the calls of an action, `lc.action` (its steps, as in the traces), never data values.
  `DataRequestOptions` has a new optional `baggage`; the reference BFF forwards the header.
- Redaction at the source (RF-TEL-06): the current values of the fields marked `sensitive`, and of passwords, are
  replaced by `[sensitive]` in the technical reports of the screen (an expression error, the text of a failed call).
  New `ScreenRuntime.markSensitive`, called by every field.
- Log level per environment (RF-TEL-07): the technical reports have a weight (`error`, `warn` for a missing
  translation key or a table sorted only on the current page, `info`), sent as the OTLP severity; `logLevel` in
  `provideLcServices` and `services.logLevel` in `runtime-config.json` (`QUADRAVA_LOG_LEVEL` in the image) leave
  out the lighter ones (`warn` if absent, `off` for none). `RuntimeDiagnostics.report` receives an optional `severity`.

### Changed

- Every property of the JSON schemas has a description (about a hundred had none: the navigation, the theme, the
  common properties of the components and of the fields, several steps); a test keeps it so. They are the help of the
  property panel of an editor, of «Aiuto» in the showcase and of `docs/schema-reference.md`.
- The last developer diagnostics still in Italian are in English: the error of a failed call (`Request failed (status)`),
  of a cancelled one (`Request cancelled`; `CallResult.error` is `cancelled`) and of a plural or select message without a
  body (`missing body`).

### Fixed

- The column of the side menu runs the whole height of the page: a full-page capture or a print showed it only one
  window tall, with an empty gap below. The menu still stays in view while the page scrolls.

## [0.10.0] - 2026-11-06

### Added

- `comments`: changing and deleting a single comment, with `onEdit`, `editIf`, `onDelete` and `deleteIf` (the comment in
  `row`, conditions fail-closed), and `editedField` to show «edited» next to the date.
- Field type `tags`: a free list of short texts (the labels of an issue), with suggestions from `options` and from a
  data source (`suggest`), `minItems` and `maxItems`; in the form, the filter bar, `input` and `fieldsFrom`.

### Changed

- A list of texts or numbers in a table cell or in the detail is shown as its items separated by commas and a space
  (`bug, ui`), each formatted and translated as a single value; it was `bug,ui`.

### Fixed

- `dataTable` and `serverDataTable` ignored `onClick` on a column, which their schema accepts: the value is now a link
  that runs the steps with the row in `row`, as in `table`.

## [0.9.0] - 2026-11-06

### Added

- Links from the rows of a table ([ADR-24](docs/adr-24-links-from-the-rows.md)): `href` on a column of `table`,
  `dataTable` and `serverDataTable` and on a row action, a relative path of the application built from the row, for
  example to download an attachment (request Q10 of OpenDevTrack). The values are encoded and the address must stay a
  path of the same origin; one that does not resolve opens nothing and is reported. `ScreenRuntime.href()` resolves
  them. Example in the «Filters and tables» showcase.

### Changed

- The items of `rowActions` have their own schema (`rowAction`: `onClick` or `href`) and type
  (`RowActionDefinition`); the actions of forms, of the selection and of toolbars keep `onClick` required. Code that
  read `onClick` of a row action must handle its absence.
- The description of an expression in the screen schema lists the variables and functions it sees today.

### Fixed

- The runtime image forwarded to the BFF request bodies of at most 1 MB, the default of nginx, so a larger upload from a
  `file` field got 413 though `maxSizeKb` allows up to 100 MB. `QUADRAVA_MAX_BODY_SIZE` sets the limit (`100m` if
  absent; request Q11 of OpenDevTrack).

## [0.8.0] - 2026-11-06

### Added

- The data of the screen's data sources in expressions ([ADR-23](docs/adr-23-data-in-expressions.md)): `data.<name>`
  is the last answer of a GET data source of the screen, the same the components show, so a component outside a form
  can depend on what the form loaded (`postIf: "{{ data.issue._perm.comment }}"`). Missing until it arrives, so a
  condition on it grants nothing meanwhile, without a technical report; `has(data.issue)` tells. Example: a message
  of the dashboard of the demo. Request Q9 of OpenDevTrack.

### Changed

- `data` is a reserved name: the `as` of a `call` step cannot be `data` any more (no published example used it).

- `SHELL_MESSAGES` in the public API of `components`: the built-in texts of the runtime shell (`app.*`, English and
  Italian), until now inside the runtime application. An editor can list the keys a project may override, for example
  to translate the shell into another language. Renaming or removing one of them is from now on a breaking change.

### Fixed

- Confirmation window: the icon is level with the first line of the message (the space NG-ZORRO keeps for a title
  pushed the text 8px lower).
- User menu: its items are a menu for screen readers (roles menu, menuitem, separator) and work from the keyboard.
  Opening it moves the focus to the first item; arrows, Home and End move, Enter or Space chooses, Esc closes, and the
  focus goes back to the icon. A submenu opens with Enter or the right arrow and closes with the left arrow. Before,
  the items could not be reached without a mouse.

## [0.7.0] - 2026-11-05

### Added

- Messages for the user ([ADR-22](docs/adr-22-user-notifications.md)): with `notifications` in the navigation the top bar
  shows a bell, before the user menu, with the number of unread messages and their list. The service of the
  application lists them with a GET, marks them read with an optional POST (`readUrl`) and announces new ones with an
  optional event stream (`live`, as in ADR-19). Choosing a message marks it read and opens its screen. Without
  `notifications` there is no bell. New component `lc-notification-bell` in `components`. The demo has an inbox:
  sending an invoice adds a message.
- `squareChart`, a compact chart of square columns for dense time series on dashboards, with an equivalent table for
  assistive technology.
- A user menu in the top bar of the runtime (`lc-user-menu` in `components`): the name of the user in the tooltip of
  the icon («User: Administrator»), «Settings…» and «Sign out», which asks for confirmation. «Settings…» opens a dialog
  of fixed size: «General» with the theme and the language, applied at once, and, only in the demo, «Debug» with the
  simulated network.

### Changed

- The theme, language and network controls leave the top bar of the runtime for the settings dialog. The demo no longer
  changes profile from the top bar: one signs out and chooses the profile on the page that signs in again.
- Screen header: the breadcrumbs are smaller (10px, spaced letters), with `›` separators and the current screen in the
  primary colour of the theme.

## [0.6.0] - 2026-11-04

### Added

- The texts of the runtime shell (`app.*`: sign-in, settings, language, theme, invalid menu or screen, technical
  reports) are built into the runtime in English and Italian. A project no longer copies them into its catalogues: a key
  it defines still overrides the built-in text. Only `app.title` and the names of its themes stay in the project.
- The browser tab shows the brand of the theme: `brand.name` as title and the new `brand.icons` (`svg`, `png32`,
  `appleTouch`) as icons, in place of Quadrava's. An application that deploys the runtime image no longer needs to mount
  its files over `brand/quadrava-icon-*`. Example: the `classic` theme of the demo.

## [0.5.0] - 2026-11-04

### Added

- Sample project `samples/sandbox-store`: a back office generated from the OpenAPI of the API Learning Sandbox
  (users, products, orders: dashboard, paged lists, details, forms, order board, session), in English and Italian, with
  the store adapter it needs behind the BFF (session per user, response and error mapping, business rules) and its tests.

### Changed

- Registry contract 0.7 (compatible with 0.6): protected environments, and so the approval before publishing, are a choice of each registry's configuration, not an obligation of the contract. A registry without protected environments publishes every version anywhere, and `quadrava publish` needs nothing else. The conformance kit takes `--protected-env none` for such a registry, and checks the approval apart from the publication in a protected environment.

## [0.4.1] - 2026-11-01

The first published version of Quadrava Community Edition (CE): the changes of 0.4.0, below, with these.

### Fixed

- The accessibility check of the end-to-end tests measures contrast once loading has visually ended (the primary button
  of a form still turning from grey to its colour made the CI of 0.4.0 fail on a slower machine).

### Security

- The Angular packages at their latest 22.2 patch and the audited transitive packages of the development tools (vite,
  zod, undici, fast-uri): `npm audit` finds no vulnerability. Nothing of this reaches the browser bundles.

## [0.4.0] - 2026-11-01

Tagged but not published: the CI checks of the release failed (see 0.4.1).

### Removed

- **Quadrava Studio, its desktop app and the reference registry** leave this repository for the commercial edition
  (ADR-21): `frontend/projects/editor`, `frontend/desktop`, `reference/registry`, the Desktop workflow, the scripts
  `start:editor`, `start:editor:registry`, `start:editor:bff`, `desktop:dev`, `desktop:build`, the Studio settings
  of `deploy:config` (`STUDIO_RUNTIME_ADDRESS`, `STUDIO_REGISTRY`) and `docs/editor.md`, ADR-17. What was published up
  to 0.3.0 stays under MPL-2.0. The registry contract (`contracts/registry.yaml`), its conformance kit, the support of
  registries in the runtime and in the CLI, and the «Run project» protocol (ADR-16) stay.

### Changed

- **The project is Quadrava Community Edition (CE)**: README, guides and notices carry the name.
- **Local stack without a registry**: `npm run stack` starts Keycloak, authorization, telemetry, the BFF and the demo
  back end, and the runtime behind the BFF loads the example project from its files (`config/bff/runtime-config.json`:
  `definitions.source` `examples`). To use a registry, start one that follows `registry.yaml` on port 8081 (the BFF
  forwards `/registry` to `LOWCODE_REGISTRY_URL`), then `npm run publish:examples` and `start:runtime:registry`.
- `npm run demo:prepare` copies the examples into the runtime only; its `examples/files.json` lists the files of the
  project, as before.

## [0.3.0] - 2026-11-01

### Added

- **The libraries as packages** (ADR-21): every release publishes `@sramaccini/quadrava-schema`, `-expressions`, `-core`,
  `-components` and `-services` on GitHub Packages, at the version of the release; another project installs them with
  npm aliases under the names the sources import (DEVELOPMENT-GUIDE, «Releasing a version»). The `schema` package carries
  the JSON schemas too (`schemas/*.schema.json`).
- **The runtime web build** attached to every GitHub release (`quadrava-runtime-web-x.y.z.tar.gz`): the build that goes
  into the image, examples included, for serving the runtime without the image.

### Changed

- The libraries require each other at the same version (peer dependencies `^x.y.z`, checked by `npm run release:check`);
  until now they asked for `^0.0.1`.

## [0.2.1] - 2026-11-01

### Fixed

- **Release workflow**: the CLI is published from `./dist/cli`; with `dist/cli` npm took the folder for a GitHub
  repository and the release of 0.2.0 stopped after the runtime image, without the CLI and the GitHub release.

## [0.2.0] - 2026-11-01

The runtime image `0.2.0` was published; the CLI and the GitHub release were not (see 0.2.1).

### Added

- **Quadrava CLI** (`@sramaccini/quadrava-cli` on GitHub Packages, from this version): `quadrava validate` checks a
  project as the runtime and Studio read it, CEL expressions included; `quadrava publish` publishes it in a registry.
- **Form**: fields from a data source (`fieldsFrom`), for forms whose fields are data, like the custom fields of a
  project. One row per field with name, label, type, options and required; labels and options are shown as they are;
  `types` maps a type of the data to a model field (a lookup, for example); with `into` the values travel in an object
  of their own (`custom`), and the field errors of the service land on them (`/custom/contract`).
- **Studio and `quadrava validate`** check every data source a screen names, not only the `source` of the nodes:
  lookups, suggestions, `columnsFrom`, `fieldsFrom`, mentions, export, steps, remote rules and uploads. Renaming a
  data source in Studio updates all of them.
- `npm run conformance:authz` with `--cookie` and `--other-cookie`: checks a BFF that answers `/authz` itself on the
  session (the `cookieAuth` of `contracts/authz.yaml`), with the CSRF token on writes.

### Changed

- **Reference implementation** (`reference/`): groupId `com.logicwarez.quadrava.reference`, artifacts
  `quadrava-reference-authz`, `-bff`, `-registry` and `-telemetry`, Java packages `com.logicwarez.quadrava.reference.*`.
  Its configuration moves from `lowcode.*` to `quadrava.*` (for example `quadrava.registry.storage-dir`,
  `quadrava.bff.frontend-origins`) and the secret of the BFF client from `LOWCODE_BFF_CLIENT_SECRET` to
  `QUADRAVA_BFF_CLIENT_SECRET`: rename them in your own configuration. Rebuild with `mvn clean` (or `npm run stack --
  --rebuild`), so that the jars with the old names are gone.
- **Development realm**: `quadrava` instead of `lowcode` (`idp/realm-quadrava.json`), clients `quadrava-bff` and
  `quadrava-tools`; the issuer of the reference services and of the tools is `http://localhost:8180/realms/quadrava`.
  Recreate Keycloak: `cd idp && docker compose down && docker compose up -d`.
- **JSON schemas**: `$id` under `https://quadrava.logicwarez.com/schemas/` instead of `https://lowcode.example/schemas/`
  (the documents do not carry it, nothing to change in a project). The workspace is called `quadrava`.
- **Telemetry of the runtime**: `service.name` is `quadrava-runtime` and the application goes in the attribute
  `quadrava.app` (was `lowcode-runtime` and `lowcode.app`): update the filters of your collector.

### Fixed

- **Form**: after a call or a lookup of the same screen (a save refused by the service, for example) the form went
  back to the values loaded from its data source while still showing what the user had typed, so the next save sent
  the old values. Now only new data of the form's own source replaces them.
- **Runtime**: a BFF that answers `401` again right after a login (a call that always refuses the session, cookies
  blocked) no longer sends the page round in a circle with the identity provider: within 30 seconds of a login the
  runtime does not start another one and shows that signing in did not work, with the button to try again. Two new
  texts in the catalogue of the application: `app.loginRefusedTitle` and `app.loginRefusedText`.

## [0.1.0] - 2026-10-31

The first versioned release.

### Added

- **Runtime**: screens, data sources, navigation, themes and translations defined in JSON, validated with the JSON
  Schemas and rendered with the standard component catalogue (forms, fields, tables, the data table for large volumes,
  charts, KPI tiles, wizard, tree, calendar, kanban, comments and more: `docs/component-catalogue.md`).
- **Expressions** in CEL, fail-closed, with permissions, the user, the state of the screen and the settings of the
  application.
- **Definitions** from the examples or from a registry (`contracts/registry.yaml`); services through a BFF
  (`contracts/bff.yaml`): session, permissions (`contracts/authz.yaml`), data, telemetry (`contracts/telemetry.yaml`).
- **Kanban**: order within columns, swimlanes, WIP limits, rich cards, columns from an expression or a data source.
- **Fields**: text fields with suggestions from a data source.
- **Comments**: a thread of comments with Markdown and mentions.
- **Live data sources** (ADR-19): a GET data source read again when an event stream on the same origin signals a change.
- **Tenant selection** in the shell, optional (ADR-18).
- **Quadrava Studio**: the visual editor of projects, screens, navigation, themes and translations, with previews
  rendered by the real runtime, the registry workflow and a desktop app for Windows, Linux and macOS (ADR-17).
- **Reference implementation** (`reference/`, not for production): BFF, registry, authorization and telemetry services
  in Spring Boot, with conformance kits for the contracts.
- **Distribution** (ADR-20): semantic versions, this changelog, a release workflow on GitHub Actions and a container
  image of the runtime (`ghcr.io/sramaccini/quadrava-runtime`) configured when it starts; the development realm and
  the reference BFF accept the image on `http://localhost:8090` for trying it against the local stack.
- **Demo back end of the stack**: the event stream `/api/streams/tasks`, so that behind the BFF the live boards of the
  showcase follow the changes of other users.

[Unreleased]: https://github.com/sramaccini/quadrava/compare/v0.14.0...HEAD
[0.14.0]: https://github.com/sramaccini/quadrava/compare/v0.13.1...v0.14.0
[0.13.1]: https://github.com/sramaccini/quadrava/compare/v0.13.0...v0.13.1
[0.13.0]: https://github.com/sramaccini/quadrava/compare/v0.12.1...v0.13.0
[0.12.1]: https://github.com/sramaccini/quadrava/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/sramaccini/quadrava/compare/v0.11.1...v0.12.0
[0.11.1]: https://github.com/sramaccini/quadrava/compare/v0.11.0...v0.11.1
[0.11.0]: https://github.com/sramaccini/quadrava/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/sramaccini/quadrava/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/sramaccini/quadrava/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/sramaccini/quadrava/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/sramaccini/quadrava/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/sramaccini/quadrava/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/sramaccini/quadrava/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/sramaccini/quadrava/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/sramaccini/quadrava/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/sramaccini/quadrava/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/sramaccini/quadrava/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/sramaccini/quadrava/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/sramaccini/quadrava/releases/tag/v0.1.0
