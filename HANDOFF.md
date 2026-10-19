# HANDOFF — Quadrava

Project status, conventions and next steps, for picking the work up locally. Last updated: 19 October 2026, after phases 1, 2 and 3 of declarative field validation (ADR-15).

## 1. What it is

**Quadrava** is a low-code platform for business/administrative front ends **defined in JSON** (screens, data sources, actions, CEL expressions), plus the visual editor **Quadrava Studio** (screens, navigation, themes) and base services. The back end consists of OpenAPI contracts and a Spring Boot reference implementation not meant for production (it builds and its tests pass with `mvn verify`, JDK 21 and Maven 3.9, in CI too).

## 2. Working principles

- **Approval before changes** that were not explicitly requested; when in doubt, propose and wait.
- **Architectural review** mode: point out inconsistencies, missing pieces and shortcomings against the requirements.
- Documents explain things simply, with figures and practical examples; new content goes into the relevant sections, not into isolated comparison paragraphs.
- Latest stack; lightweight, governable DSL/expression solutions (no heavy rule engines).
- **Everything is in English**: code, identifiers, comments, tests, documentation, schema descriptions, contracts, commit messages, the demo (ids, data, permissions, API paths). Italian survives only as a translation catalogue (`examples/i18n/it.json`, the `it` halves of `messages.ts`) and in the tests that check it. The default language is English (platform, demo, editor, formats `en-GB`); the tests run in English, except those that check the Italian translation.
- In long blocks of work: one commit per component, tests and a visual check before moving on to the next.

## 3. Stack and commands

Angular 22.2 (standalone, signals, OnPush), TypeScript 6.0, Node 24 (if the shell has another version: `eval "$(fnm env --shell bash)"; fnm use 24.21.0`), tests with vitest through `ng test` (jsdom), Ajv 8, cel-js 8, ng-zorro-antd 22.1.1, date-fns 4, Spring Boot 4.1.1, Keycloak 26.8.

From `frontend/`:

- `npm ci` (mandatory after every pull that changes dependencies)
- `npm run build:libs` — **before** building and testing the apps: the tsconfig paths point to `./dist/*`
- **`npm run stack`** — the whole stack with the real login in one command (Keycloak in Docker, Java services, demo back end, examples published, runtime on 4200 and editor on 4201 behind the BFF); logs in `.stack/logs`, registry data in `data/registry`; Ctrl+C stops everything except Keycloak
- `npm run schema:sync` — regenerates the `*.schema.ts` files and the precompiled validators (`validators.generated.ts`) from the JSON schemas; `schema:docs` regenerates `docs/schema-reference.md`
- `npm run conformance:registry` / `conformance:authz` / `conformance:telemetry` — conformance kits of the services against the contracts (see README)
- `npm run e2e` — Playwright (standalone fields, border layout, axe accessibility on the whole showcase, Studio windows; it starts the runtime on 4300 and the editor on 4301)
- `npm run validate:examples` — validates the examples (schema, translation keys, patterns of the fields)
- `npm run demo:prepare` / `npm run start:runtime` — copies `examples/` into `projects/runtime/public/examples` and starts the demo (port 4200). The dev server does **not** reload `dist`: restart it after changing libraries or examples.
- `npm run start:editor` — Quadrava Studio (visual editor) on port 4201 (it also prepares the examples, with `examples/index.json`).
- Local registry without Keycloak: `java -jar reference/registry/target/lowcode-registry-0.1.0-SNAPSHOT.jar --spring.profiles.active=no-auth`, then `npm run publish:examples`, then `npm run start:runtime:registry` / `start:editor:registry`.
- `runtime-config.json` (the runtime's public folder) decides where definitions come from: `examples` (demo) or `registry` (app, environment, navigation, themes); the `registry` configuration in angular.json uses `projects/runtime/config/registry/`. With `services: { source: 'bff', appId }` the runtime uses the real ports from `services` (`bff` configuration, `projects/runtime/config/bff/`).
- **Full stack with Keycloak step by step** (Docker Desktop running): `cd idp && docker compose up -d`; in `reference/` `mvn -q package -DskipTests` and `java -jar <module>/target/*.jar` for registry (with `--lowcode.registry.storage-dir=<folder>` to keep the data), authz, telemetry, bff; in `frontend/` `npm run demo-api` (8084), `npm run publish:examples -- --user administrator --password administrator`, then `npm run start:runtime:bff` (4200) and `start:editor:bff` (4201). The origins allowed by the BFF are 4200 and 4201.
- tests per project: `npx ng test <schema|expressions|core|components|services|runtime|editor> --watch=false`

Test status (all green, 19 October 2026, in English): schema 85, expressions 46, core 188, components 199, services 35, runtime 93, editor 179 (**825**); Java 46 (authz 7, bff 8, registry 25, telemetry 6), `mvn verify` complete; Playwright 21 (13 of them for accessibility on the showcase, 2 for the rich text editor, 2 for Studio: project, windows and accessibility of the whole workspace); conformance kits: registry 23/23 against the reference registry with the no-auth profile (contract 0.6; 5 checks need tokens and are skipped there: run them with --user/--reviewer-user against the stack), authorization 11/11, telemetry 6/6. Production builds: runtime 2.73 MB initial (460 kB transferred; the precompiled schema validators are 506 kB of source after the slimming of cfd99f4), editor 825 kB initial (preview and editor load separately). `mvn verify` fails at the repackaging of the registry jar while a registry started from `target/` is running (the file is locked on Windows): stop the stack first.

## 4. Architecture in brief

Libraries (`frontend/projects/`): `schema` (JSON Schema + types), `expressions` (CEL, `{{ }}` templates, message formatter), `core` (ScreenRuntime, action engine, NavigationRuntime, I18n, abstract ports, catalogue, theme), `components` (NG-ZORRO), `services` (real ports: HTTP/BFF/OIDC). Apps: `runtime` (demo/shell), `editor` (visual editor, see § 5b).

- Ports (abstract classes used as DI tokens): Authorization, UserProvider, DataClient (with `{ signal }` to cancel superseded reads, `source` and `trace` for the HTTP span), ScreenNavigator, Notifier, RuntimeDiagnostics, **RuntimeTracer** (optional; `HttpTracer` in `services` sends OTLP spans to `/telemetry/v1/traces`), Confirmation, **FormDialog** (`dialog` step), DefinitionSource (screens, navigation, themes and **catalogues** `messages(language)`).
- Nodes: section (also `layout: "row"`), **box, grid, border** (layout containers; children declare `grow`, `span`, `region`; border with resizable sides), **input** (standalone field bound to the state, with a validation `group`), text, **image, link**, button, filterBar, table, **dataTable**, **serverDataTable**, form, tabs, detail, alert, **stats, progress, timeline, kanban**, **wizard**, **tree**, **calendar**, **chart**. Steps: set, call, refresh, navigate, toast, confirm, **dialog, validate, print, export** (CSV).
- Brand: the product is called **Quadrava**, the editor **Quadrava Studio** (`assets/brand/`, brand README). Logotype `lc-quadrava-wordmark` (text in Sora from `@fontsource/sora`, not the SVGs with `<text>`), in the demo's side bar through the `lcBrand` slot and at the top left in the editor; favicon in both. Technical identifiers (realm `lowcode`, Java packages, `lc-` prefixes) stay as they are.
- Fields: text, number, select, checkbox, date, **textarea, datetime, radio, switch, multiselect, lookup, file, repeater, richtext**.
- **Validation (19 October 2026, ADR-15, catalogue § 2.29).** Validators are pure descriptors in `core` (`validators.ts`, `formats.ts`): `STANDARD_VALIDATORS` plus those of the application (`provideValidators`), in the root `ValidatorRegistry`. The engine (`validation.ts`) compiles the flat constraints of a field (`minLength`, `pattern`, `format` + `country`, `min`, `step`, `minDate`…, `transform`, `messages`), `validate` and the keyed `validation` list (with `when`, `severity`, `message`), plus the form's `validation` across fields, into one list; `form`, `input`, `filterBar` and `repeater` use it through `checkValue` (`components/field-validation.ts`). Warnings do not block; fail-closed with one diagnostic per broken rule, never values. National formats with check digits for IT, DE, FR, ES, NL, BE, AT, PT (PL, SE for VAT and postal codes). CEL: `isValid(name, value[, params])`. Messages: `{x, date}` placeholder. Phases 2–3 (same day): `password` fields with show/hide and a strength meter of our own (`passwordStrength`, `minStrength`), remote rules on a data source (`RemoteChecks`: debounced, cancellable, results kept per value, the form waits for them), relative dates (`today+30d`), `minItems` / `maxItems`, field errors from the Problem of the services (`contracts/problem.yaml`, `CallResult.fieldErrors`, `runSteps(…, { onFieldErrors })`), and a `warning` colour in the theme. Formats: **number**, currency, percent, date, datetime, boolean, badge, markdown.
- Formatted text: `format: markdown` on text, alert and detail fields (restricted Markdown: `core/src/lib/markdown.ts`, drawn by `lc-markdown` without HTML); `richtext` editor (`lc-rich-text-editor`, contenteditable + browser commands, value in Markdown). Labels deliberately stay plain text. Catalogue § 2.26.
- Table: sorting (in the page or server-side with `sort.bind`), selection + bulk actions, action menu (`rowActionsInline`), expandable rows, clickable cells, totals row (`aggregate`).
- `lc-node` applies `visibleIf/hiddenIf` and `tooltip`, and exposes `data-node-id`/`data-node-type` (for the editor and tests). Permissions `domain.resource.action`; expressions **fail-closed**.
- GET data sources reload **only if the resolved request changes** (URL and parameters); `refresh` reloads anyway. `ScreenRuntime.query` runs a data source without touching its shared state (used by lookups and by the serverDataTable). `refresh` on a non-GET data source only increments `ScreenRuntime.refreshCount`, which the serverDataTable watches to reload.
- `DataRequest.file`: multipart file upload (`HttpDataClient` uses `FormData`), up to 100 MB; base64 inside the JSON remains for files up to 10 MB.
- Variables always present in data sources: `search` and `lookupKey` (lookup), `request` (serverDataTable, contract in the catalogue § 2.19), `file` in `upload` data sources.
- Responsive shell with three bands (≥1200 expanded, 768–1199 collapsed, <768 drawer); round button next to the logo.

## 5. Component catalogue

`docs/component-catalogue.md`: specification of every component added (up to § 2.29, declarative validation), common rules and **known limits** (§ 3); `docs/schema-reference.md`: all the properties, generated from the schema. The demo showcase has thirteen screens (`examples/showcase-*.json`): basics, form, tasks and progress, layout containers, standalone fields, fields and forms, validation, tables, advanced tables, datatable, layout (tabs, detail, messages), dashboard, views.

## 5b. Quadrava Studio (visual editor)

`docs/editor.md` describes everything. In short: palette (click or drag), structure (select, move, duplicate, cut/paste, drag), property panel **generated from `screen.schema.json`** (lists of columns/fields/actions/steps editable item by item, steps by variant, objects as groups), preview with the real runtime and fake ports (sample data per data source, permissions, widths, parameters, log; Alt+click selects), JSON view, data-source panel (renaming updates references), texts panel (make translatable, it/en translations applied to the preview, export for the catalogues), problems (schema, CEL, repeated ids, missing data sources), undo history, draft in the browser, File menu with open / save on file (rewriting the same file where the browser allows it), open from / save to the registry and an «Unsaved changes» tag. A new component needs only its template in `model/templates.ts`, its group in the palette and `ed.type.<type>` in the messages. Since 13 October: expression completion while typing; components dragged from the palette straight onto the preview; preview with **live data** (reads only, editor behind the BFF); «Registry» panel with review status, Request review/Approve/Reject, Compare (version against the open document), concurrent-change warning (If-Match), registry validation errors item by item; «Texts» panel that saves and publishes the catalogues to the registry.

**Multi-document workspace (18 October 2026, ADR-13).** Studio starts empty; File › New › Screen / Navigation / Theme (and Open…, Open example, Open from registry) open every document in its own window inside the workspace: move, resize, maximize, minimize to the bar of the open documents, Cascade / Tile, Ctrl+F6, Window menu, close with confirmation when there are unsaved changes. Every window has an environment injector with its own store (`Workspace`, `documentProviders`); the side panels, toolbar, Edit/View menus, shortcuts and problems work on the active window and the panels are drawn again with its injector when it changes. Drafts, saved state, file handle and registry version are per document (`lc.editor.doc.<id>`); the workspace is restored after a reload (`lc.editor.workspace`) and the per-kind drafts of earlier versions open in windows the first time. Previews of one kind use the other windows used last (a screen with the last theme, a theme with the last screen and navigation). Clipboard and known screens are shared.

**Projects (18 October 2026, ADR-14).** Studio works on a project: `project.json` (manifest, `project.schema.json`) and one file per resource (`screens/`, `datasources/`, `navigation.json`, `themes/`, `i18n/`), in a folder on disk (Chrome, Edge) or in the private storage of the browser (`ProjectFolder`, `ProjectLibrary`). Start page without a project; Project panel (open, create, delete resources); Save writes the resource file (renaming it when the identifier changes); Import file / example / registry version write into the project; windows remembered per project. Data sources documents (`datasources.schema.json`) are shared by the screens through `{ "ref": "orders/list" }` (inline definitions stay valid): resolved by `resolveDataSources` (schema) in the runtime (`loadDataSources`, fail-closed, reported to diagnostics), in the previews and in the checks of Studio; «Move to the project» turns an inline data source into a reference. «Publish project to registry…» publishes every resource; «Review versions in registry…» reviews and publishes several documents at once. The demo is a project (`examples/`, order-list and order-detail use `datasources/orders.json`). Registry contract 0.6: kind `datasources`, `missingDataSources` on publication in the protected environments. Translations are resources too (`i18n/<language>.json`, one per language of the project, «Translations» group, a window with keys, texts and the default language as a reference); the «Texts» panel of a screen uses the languages and catalogues of the project and its translations go into them when the screen is saved (`Workspace.saveToProject`); languages are added in the settings, which create the catalogues.

Navigation windows: structure of areas/groups/items with «+ Area / Group / Item», fields from `navigation.schema.json`, preview of the real menu with a simulated profile (permissions that can be switched off), problems (schema, ids repeated among siblings, unknown screens, missing default). Theme windows: tokens from the fields of the theme schema (colour pickers), preview of the last screen and menu with the theme. **Previews in an iframe** (ADR-08): the same app with `?preview` (`PreviewApp`, `preview-config.ts`), messages defined in `preview/protocol.ts` (state → preview; ready, selection, events → editor), same origin and own iframe only; the state arrives cloned and the preview compares by content so it does not redraw on every selection. `DocumentState` is the common base; `ed-fields` and the JSON view inject it, and every window provides it as its own store.

## 6. Known traps (NG-ZORRO / Angular / tools)

The main ones are in the DEVELOPMENT-GUIDE (§ 4, 5, 6b, 9). In short:

- Strings in modals, messages and tree titles are **HTML** → content components, `escapeHtml` or custom templates.
- jsdom has no `execCommand`: the rich text editor toolbar is tested only end to end. In fallback texts of `t()` line breaks are written `\n` (CEL does not allow real line breaks inside quotes).
- Icons must be registered in `ICON_TYPES`. Arrays and dates in `ngModel` must be computed once per value (`computed`), otherwise NG0103.
- Date picker language: `NzDateAdapter.setLocale`. Sorting one column makes `nz-table` reset the others.
- Ajv strict: `type: object` next to `properties`, properties declared next to the `required` of `if/then`/`anyOf`.
- Scripts with regular expressions: write them in a file, not in a shell heredoc (double backslashes get lost). The same goes for `node -e` and for template literals in generator scripts: check the result for `\d` that became `d`.
- NG-ZORRO animates a form message out: right after a change the old text is still in the DOM; tests wait for the new one (`until`).
- CEL: `has(state.x)` for keys that do not exist yet; `dyn(...)` in mixed parameter maps of `t()`; `{n, number}` for numbers in messages.
- In tests: `stubViewportHeight` + wait for the options of `nz-select`; `Element.scrollTo` stubbed; closed dialogs stay in the DOM.
- `provideNzIcons` is not cumulative: a second call replaces the icons of `provideLowcodeComponents` (the editor repeats them).
- NG-ZORRO 22: `NzTooltipModule` (not `NzToolTipModule`), `nz-tabs` (not `nz-tabset`), no `nzAutosize` on textareas (`field-sizing: content` is used). Angular has no `.capture` event modifier: `addEventListener(..., true)`.
- `nz-input` (NG-ZORRO 22) has a `readonly` input that writes the attribute: bind `[readonly]`, never `[readOnly]`. A field is drawn in `lc-field-control`, shared by form and `input`.
- After `build:libs` restart the dev servers: one left running while `dist` is rebuilt fails («module 'components' could not be found») until restarted.
- Messages with literal braces (`{{ }}`, JSON): write them `\\{` `\\}` in the TypeScript source.
- Studio windows: an iframe moved in the page reloads, so the windows keep their order in the page and only their z-index changes (`Workspace.order`). The stores are not singletons: inject them only inside a window or a side panel (drawn with the window's injector), or reach them through `Workspace` (`latest`, `injector.get`). The side columns stay even without panels, otherwise the area of the windows changes size when the first document opens.

## 7. Known limits / debt

- Runtime: in `bff` mode it uses `provideLowcodeServices` (session, authorization, data client, telemetry) and `BffShellSession`; in the demo the fake ports and `DemoShellSession`. The demo's data logic lives in `runtime/src/demo/demo-backend.ts`, used by `MockDataClient` and by `tools/demo-api.mjs`.
- BFF: routes `/registry`, `/authz`, `/telemetry`, `/api`; CSRF for SPAs; OIDC logout. Tried live on 13 October 2026 (also with `npm run stack`).
- Telemetry (15 October 2026): traces `screen.open`, `action.run`, `http.client` and logs of the technical reports, both OTLP/HTTP JSON in batches, also sent when the page closes. Not done yet: the W3C `baggage` header with screen and action (guidelines § 9, RF-AUD-02), the `sensitive` redaction at the source (RF-TEL-06: the spans carry no data values, so today it matters only for logs) and the log level per environment (RF-TEL-07).
- Reference registry (contract 0.5, 15 October: cross-document reference check, see architecture § 10): validation with the same JSON Schemas as the front end (networknt), four-eyes review (roles `manager`, `administrator`), protected environments `testing` and `production`, If-Match, optional file store, `messages` documents for translations. CEL expressions are **not** checked server-side (editor and runtime check them).
- e2e in Chromium only; the automatic accessibility check does not replace manual testing.
- Editor: on the preview components can be added, moved and resized (span, grow); the border's sides can be resized only in the runtime; comparison is between a version and the open document, not between two versions. Translations written in a screen apply to the previews of all the windows (one editor catalogue).
- `validate:examples` does not check CEL expressions (the `i18n-examples.spec.ts` test does).
- Component limits: catalogue § 3 (validation: absolute dates only, no async checks, no field errors from the services, no rules across standalone `input` fields).
- Project documents in `docs/` (functional specification, architecture, implementation guidelines, dynamic texts and i18n): they stop at 11–12 October; the most recent detail is in the catalogue, in `docs/editor.md` and in the code.

## 8. Next steps (in the suggested order)

1. Before making the repository public: enable GitHub's private vulnerability reporting (Settings → Code security), check the repository description and topics, and decide whether the author e-mail in the commits may stay public. The tree and the history contain no secrets: only the development credentials of `idp/` and `reference/`, labelled as such.
2. Trademark: a web search (17 October 2026) found no «Quadrava» mark or product, but similar registered software marks exist (for example US «QUADRA», class 42, asset-management software). A professional search on EUIPO TMview, WIPO Global Brand Database and USPTO, and possibly a filing in class 9/42, are advised before investing in the brand. Legal review of `CLA.md` before the first external pull request.
3. Local data after the October renames: recreate Keycloak (`cd idp && docker compose down && docker compose up -d`) and delete `data/registry` (old review states, roles, identifiers and permissions).
4. Conformance kits in CI against the reference services (today they are run by hand, for example after `npm run stack`).
5. Editor: comparison between two registry versions; border side widths from the preview.
6. e2e in Firefox and WebKit.
7. CEL in `validate:examples` and, eventually, in the registry.
8. Bring the project documents (architecture § 9, functional specification, guidelines) up to date with the October status.
9. Size of the precompiled schema validators (`validators.generated.ts`, 506 kB of source after the shared rule options): the field definition is still compiled in several contexts; loading the validators lazily would bring the runtime back under its 2.5 MB budget (2.73 MB today).
10. Validation, what is left: rules across the standalone fields of a validation group; remote rules in the rows of a repeater; field errors of the services for standalone fields (the `validate` step and `call` outside a form); a check of passwords against leaked lists (a service, k-anonymity) if a customer needs it.

## 8b. What was missing and proposed optimisations (13 October 2026)

List drawn up on 13 October and **implemented the same day**. For each item, where it is:

| Item | Status |
| --- | --- |
| CI and first e2e suite | done (dedicated session): `.github/workflows/ci.yml`, `frontend/e2e` |
| Accessibility check (axe) | done: `e2e/accessibility.spec.ts` on 12 screens; fixed contrasts, labels, `nz-steps`, `nz-tree`, menu group titles |
| Conformance kits | done for registry (17/17), authorization (11/11) and telemetry (6/6); they found differences in the reference services, which were fixed |
| Persistent registry, review, comparison, promotion, validation on save | done: registry 0.3 (file store, four eyes, protected environments, If-Match, server-side JSON Schema); comparison in the editor |
| Expression completion, direct editing on the preview, live data, concurrent changes | done (on the preview components can be added, moved and resized) |
| Screen-level validation, CSV, printing | done: `validate`, `export`, `print` steps |
| Image, link, progress, timeline, kanban | done (`image`, `link`, `progress`, `timeline`, `kanban`); coloured tags already exist as the `badge` format |
| Border with draggable dividers | done (`resizable`) |
| Menu with keyboard, badges, search | done, with counters on closed groups too |
| Language catalogues from a service | done: `messages` documents in the registry |
| CSP without `unsafe-eval` | done: precompiled validators (Ajv standalone) |
| Pinned Node | done (`.nvmrc`, `engines`) |
| Optimisation 2 (validate on publication) | done (validation in the registry + precompiled validators); the `immutable` HTTP cache for versions was not added |
| Optimisation 3 (deferred loading) | partly done: editor and preview split; the runtime stays in one bundle (NG-ZORRO needs almost everything for the first screen) |
| Optimisations 4, 5, 6, 7 | done: request cancellation and merging, CEL cache, `npm run stack`, `filterBar` on `lc-field-control` and `schema:docs` |

## 9. Working conventions

- Commits in English (Conventional Commits), one per component, in the author's name: no trailers (details in DEVELOPMENT-GUIDE). Licence MPL-2.0; external contributions under the CLA (`CONTRIBUTING.md`).
- After every code change: `build:libs`, tests of the projects touched, `validate:examples` if examples or schemas are touched; for the UI a check in the browser (demo on 4300).
- The JSON schemas are the source: edit `*.schema.json`, then `schema:sync`, then the types in `schema/src/lib/types.ts`.
- Every new component: schema, type, component registered in `STANDARD_COMPONENTS`, tests (schema in `schema/new-components.spec.ts`, component in `components/*.spec.ts` with `renderScreen`, showcase in `runtime/showcase-advanced.spec.ts` with `openShowcase`), example in `examples/showcase-*.json` with texts in `examples/i18n/it.json` and `en.json`.
- Never hard-coded colours in components: `var(--lc-*)` or NG-ZORRO tokens. Never user-facing text in components: `runtime().text(...)` or `lc.*` keys in `messages.ts` (it and en).
- Security (non-negotiable): no HTML from data or translations, fail-closed expressions, no data values in diagnostics, real enforcement lives in the back end.

## 10. References

- `README.md`, `DEVELOPMENT-GUIDE.md`, `docs/README.md` (index of the documentation).
- Project documents: `docs/functional-spec.md`, `docs/architecture.md`, `docs/implementation-guidelines.md`, `docs/dynamic-texts-and-i18n.md`; `docs/component-catalogue.md`, `docs/editor.md`, `docs/schema-reference.md`.
- Recent history (October 2026): `e6b5c41` security policy and templates, `100b72d` third-party notices, `cd2952e` English as the default language, `965d633` MPL-2.0 licence, `b25b72a`/`084e5d9`/`01002b8`/`365396e`/`caac5ff` English everywhere (libraries, editor, demo, services, components), `3e3ea53`/`803a734` Quadrava brand, `0c6c9f1` cross-document references in the registry. Earlier: `0a81b58` editor: drag and drop, `5e45e21` suggestions, `01a3233` linked preview, `7ba8c36` field-by-field lists, `ac3988f` first version of the editor; `417c426` serverDataTable; `3347671` stacked charts and dual axis, `3115710` data table for large volumes, `35b0faf` keyboard tree, `d57f0c8` lookup and file in rows, `59c2971` multipart files, `7c621e5` text of values in the lookup; `01c6367` data table … `72af122` sorting, `659c4f3` catalogue; `bc1424d` data source reload fix; `90224d7` responsive shell; `e67dfbe` full i18n.
