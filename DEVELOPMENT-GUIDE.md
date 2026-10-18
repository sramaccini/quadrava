# Development Guide

How to work on Quadrava: set up, build, test, extend and contribute. For what the project is, read [README.md](README.md) first. Design rationale lives in the documents linked from [docs/README.md](docs/README.md).

## 1. Prerequisites and setup

* Node.js 24 and npm (pinned in `.nvmrc` and in `engines` of `frontend/package.json`; `nvm use` or `fnm use` from the repository root picks it).
* JDK 21 and Maven 3.9+ (only for `reference/`).
* Docker (only for the Keycloak in `idp/`).

```bash
cd frontend
npm ci
npm run build:libs        # mandatory before running or testing any app
```

**Why `build:libs`?** The `tsconfig` paths map `@lowcode/*` to `./dist/*`, so apps and their tests consume the *built* libraries. After changing a library, rebuild it (`npm run build:libs`); stale `dist` output causes confusing errors (for example NG01354 in templates).

## 2. Workspace structure

Dependency order (an arrow means "depends on"); never introduce a cycle or an upward dependency:

```
runtime ──► components ──► core ──► expressions
   │                          └───► schema
   └──► services ──► core
editor  ──► components ──► core   (the preview renders screens with the real runtime)
```

* `schema`: JSON Schemas (`screen`, `theme`, `navigation`), Ajv validators, TypeScript types. The `.schema.ts` files are **generated** from the JSON by `tools/sync-schema.mjs`.
* `expressions`: the CEL evaluator. No Angular dependency.
* `core`: interpreter, action engine, ports, theme service, screen shell. **No UI-library code except the screen shell's alert and typography.**
* `components`: everything that depends on NG-ZORRO (standard components, side menu, user menu, confirmation dialog, notifier, theme bridge).
* `services`: production implementations of the ports.
* `runtime`: the demo application; wiring only, plus `demo/` fakes.
* `editor`: **Quadrava Studio**, the visual editor for screens, navigation and themes. `model/` holds pure, tested logic (immutable document operations, the `SchemaReader`, templates, drop positions, `DocumentState` with its stores `EditorStore`, `DataSourcesStore`, `NavigationStore`, `ThemeStore` and `ProjectStore`, one per open window, created by `Workspace` in an injector of the window; `Project`, `ProjectFolder` and `ProjectCommands` for the project on disk or in the browser); `ui/` the start page, the project panel, the workspace, the windows and the panels; `preview/` the live preview and its fake ports. The property panel is generated from `screen.schema.json` (`model/schema-info.ts`): do not hand-write per-component forms. See `docs/editor.md`.

## 3. Daily commands

| Command | What it does |
| --- | --- |
| `npm run stack` | The whole development stack with the real login in one command (Keycloak in Docker, reference services, demo back end, examples published, runtime on 4200 and editor on 4201 behind the BFF); `-- --services-only`, `-- --rebuild`; logs in `.stack/logs`, registry data in `data/registry` |
| `npm run build:libs` | Builds all libraries in dependency order |
| `npm run test:libs` | Unit tests for every library |
| `npx ng test <project> --watch=false` | Tests of one project (`schema`, `expressions`, `core`, `components`, `services`, `runtime`, `editor`) |
| `npm run demo:prepare` | Copies `examples/` into `projects/runtime/public/examples` and `projects/editor/public/examples` (git-ignored), with an `index.json` of the screens; required by the runtime and editor specs |
| `npm run start:runtime` | Builds libs, prepares examples and serves the demo on port 4200 |
| `npm run start:editor` | Builds libs, prepares examples and serves Quadrava Studio on port 4201 |
| `npm run start:runtime:registry` / `start:editor:registry` | Same apps, with `/registry` proxied to the reference registry on 8081 (run it with the `no-auth` profile); the runtime loads its definitions from the registry |
| `npm run start:runtime:bff` / `start:editor:bff` | Same apps behind the BFF on 8080 (needs Keycloak and the reference services): `/registry`, `/api`, `/authz`, `/telemetry`, `/bff`, `/oauth2`, `/logout` are proxied; the runtime uses the real `services` ports (`projects/runtime/config/bff/runtime-config.json`) |
| `npm run demo-api` | Demo application back end on 8084 (the `/api` route of the BFF): the in-browser demo logic (`runtime/src/demo/demo-backend.ts`, bundled with esbuild at start-up) behind RS256 token verification against the local realm; `-- --no-auth` switches it off. It also serves its OpenAPI description (`tools/demo-api.openapi.json`) at `/v3/api-docs` without a token and with CORS open, and at `/api/v3/api-docs` behind the BFF, for the editor's OpenAPI import; keep it in step when demo endpoints change |
| `npm run publish:examples -- --user <u> --password <p>` | Publishes every example into the registry with a token from the development client `lowcode-tools` (local realm only); without arguments it works against the `no-auth` registry |
| `npm run publish:examples` | Publishes every example screen, the navigation, every theme and every language catalogue (as `messages` documents) to a registry (`--registry`, `--app`, `--env`, `--token`) |
| `npm run schema:sync` / `schema:check` | Regenerate / verify the generated schema constants and the precompiled validators (`validators.generated.ts`, Ajv standalone) |
| `npm run schema:docs` / `schema:docs:check` | Regenerate / verify `docs/schema-reference.md` from the schema descriptions |
| `npm run notices` / `notices:check` | Regenerate / verify `THIRD-PARTY-NOTICES.md` (the packages shipped in the bundles, with their licences); run it after changing the dependencies. The file is copied into the runtime and editor builds |
| `npm run conformance:registry` / `conformance:authz` / `conformance:telemetry` | Conformance kits: check a service over HTTP against its contract (`--registry`, `--authz`, `--telemetry` for the address; `--user`/`--password` or `--token`; `--reviewer-user` for the registry, `--other-user` for authorization). Shared helpers in `tools/conformance-lib.mjs` |
| `npm run validate:examples` | Validates every JSON in `examples/` against the schemas |
| `npx ng build runtime` | Production build (budgets: warning 2.5 MB, error 4 MB initial) |
| `npm run e2e` | Playwright end-to-end tests (`e2e/`, including the axe-core accessibility check of every showcase screen) in Chromium against the demo and Studio; starts `ng serve runtime` on port 4300 and `ng serve editor` on port 4301 (`E2E_PORT` and `E2E_EDITOR_PORT` to change them) unless a server is already running there. Needs `npm run demo:prepare` and, once, `npx playwright install chromium` |

Before opening a pull request, all of these must pass: `schema:check`, `schema:docs:check`, `validate:examples`, `notices:check`, `build:libs`, `test:libs`, runtime and editor tests, production builds, `npm run e2e`. CI (`.github/workflows/ci.yml`) runs the same checks on every push to `main` and every pull request, in three jobs: `frontend`, `e2e` and `java` (`mvn -B verify`). When the e2e job fails, the Playwright report and traces are uploaded as the `playwright-report` artifact (open a trace with `npx playwright show-trace <trace.zip>`).

## 4. Adding or changing a component

Example: adding a `progress` node.

1. **Schema.** Add the node definition in `projects/schema/src/lib/screen.schema.json` (properties, `required`, `additionalProperties: false`), run `npm run schema:sync`, and add the TypeScript type next to the others.
   * Columns are layered: `columnProps` (shared with detail fields) → `tableColumnProps` (`sortable`, `onClick`, `aggregate`) → `dataColumn` (`filter`, `groupable`); each closed variant uses `unevaluatedProperties: false`. State paths use `$defs/statePath`.
   * Ajv runs in strict mode: a subschema with `properties` needs `type: object`, and a `required` inside `if/then` or `anyOf` needs the property declared there too.
   * Write regex patterns from a script file, not a shell heredoc (double backslashes get collapsed).
2. **Component.** Create `projects/components/src/lib/progress.component.ts`: standalone, `ChangeDetectionStrategy.OnPush`, inputs through `input()` / `input.required()`. Resolve expressions through the screen runtime from `core`; never evaluate strings yourself. Keep data logic in pure functions (see `table-data.ts`, `chart-geometry.ts`) so it can be tested without rendering. If the node writes to the screen state (`bind`), give the state an initial value in `ScreenRuntime.seedFilters`, so expressions and data sources never see a missing key.
   * If it reads a data source, wrap its content in `<lc-busy [busy]="source().status === 'loading'" [empty]="…no data yet…">`: the shared activity indicator (delay, minimum time, "taking longer than usual", `aria-busy` and the live announcement). Do not draw a loading state of your own, and do not show "no results" while loading.
3. **Register.** Add it to `STANDARD_COMPONENTS` (and export it from `public-api.ts`). Application-specific components are registered with `provideLowcodeComponents(extra)`.
4. **Tests.** Cover rendering, expression-driven state (`visibleIf`, `enabledIf`, `can()`), the fail-closed behaviour, and any action it triggers.
5. **Example.** Add the usage to a showcase screen in `examples/showcase-*.json` and run `npm run validate:examples`.
6. **Editor.** Add a starting template in `projects/editor/src/app/model/templates.ts` (and its data source in `TEMPLATE_SOURCES` if it reads one), put the type in a palette group (`ui/palette.component.ts`) and add `ed.type.<type>` to the editor messages (it and en). A test fails if a schema type has no valid template or is missing from the palette. Properties need nothing: the panel reads them from the schema.
7. **Docs.** Update the component catalogue and, if the language changed, the functional document.

## 5. NG-ZORRO rules

1. **Import per component** (`NzCardModule`, `NzTableModule`, ...) in the standalone component; never import a whole bundle.
2. **Icons are registered, not fetched.** Add the icon to `ICON_TYPES` in `icon.component.ts` (that map also decides which JSON icon names are accepted). An unregistered icon would trigger a network request.
3. **Strings in modals and messages are HTML.** `NzModalService` and `NzMessageService` render strings as HTML. Pass dynamic text through a component (`ConfirmMessageComponent` with `NZ_MODAL_DATA`) or `escapeHtml` (see `NzNotifier`). Never pass a JSON value through unescaped.
4. **Modals need the module provider.** `NzModalService` is provided through `importProvidersFrom(NzModalModule)` in `provideLowcodeComponents`; do not add `NzMessageModule` (it does not exist; the service is root-provided).
5. **Forms:** NG-ZORRO controls use `ngModel`, so form elements carry `ngNoForm` to avoid the NG01352 / NG01354 errors, and validation stays in the platform (CEL rules), not in Angular validators.
6. **Dates:** never create a new `Date` inside a template binding with `ngModel`; it loops change detection. Use a `computed` map (see `dates` in `filter-bar.component.ts`).
7. **Tables:** do not use `nzScroll` (it adds a measuring row); wrap in an `overflow-x: auto` container. Paginate on the server with `nz-pagination`, not the table's built-in paging.

8. **Layout trap.** `nz-layout` stacks its children in a column and switches to a row only when it contains an `nz-sider`. The side menu here is our own `lc-sidebar`, so the app shell sets `flex-direction: row` explicitly.
9. **Palette trap.** `@ant-design/colors` `generate` turns dark base colours into greyish tints; for the light theme the bridge derives success/error tag backgrounds by mixing the colour with white.
10. **Scroll containers.** An `overflow-x: auto` wrapper also shows a vertical scrollbar when its content is one pixel too tall: keep pagination outside it.
11. **Arrays in `ngModel`.** Like dates, a new array on every change detection (multi-select values, range pickers) makes NG-ZORRO re-render forever (NG0103): compute them once per value in a `computed` map.
12. **Tree titles are HTML.** The default `nz-tree` title uses `innerHTML` while searching: render titles with `nzTreeTemplate` and plain text (see `tree.component.ts`).
13. **Date picker language.** With the date-fns adapter, month and day names follow `NzDateAdapter.setLocale` (not `NzI18nService.setDateLocale`); `provide.ts` keeps it in step with the active language.
14. **Content projection.** Elements meant for a NG-ZORRO slot (for example `nz-filter-trigger` in a `th`) must be the only root node of their `@if` block; put companion elements (the dropdown menu) inside them.
15. **Sorting events.** Sorting one column makes `nz-table` emit "no sort" for the others: ignore a reset for a column that is not the sorted one.

The Italian locale is patched in `provide.ts` (`rangeQuarterPlaceholder` is missing upstream); keep that patch when upgrading.

## 6. Theming

* The theme JSON becomes `--lc-*` variables (shell, sidebar, spacing) in `core`.
* `theme-bridge.ts` converts the primary, success and error colours into the full `--ant-*` palette with `@ant-design/colors` `generate`. Only colour variables exist at run time in NG-ZORRO, so radius, density and typography tokens are not mapped.
* Dark themes add `<link id="lc-nz-dark-theme" href="nz-dark.css">`; the stylesheet is built by `angular.json` (bundle `nz-dark`, `inject: false`). Light themes remove it.
* The application shell is theme-driven too. `tokens.layout` (optional) sets `sider` (tone, background, text, mutedText, activeBackground, activeText, border, width, collapsedWidth), `header` (background, text, border, height), `pageHeader` and `content.padding`; they become `--lc-sider-*`, `--lc-header-*`, `--lc-page-header-*` and `--lc-content-padding`, with fallbacks derived from the base colours. The side bar and page header read only those variables; `tone` merely selects the NG-ZORRO menu style.
* Never hard-code colours in components: use `var(--lc-*)` or NG-ZORRO tokens.

## 6a. Brand

* `assets/brand/` is the single source of the Quadrava brand (read its README: colours, typeface, minimum sizes, clear space; do not recolour or distort). Apps copy what they need into `projects/<app>/public/brand/`; when the assets change, copy them again.
* The logotype is `lc-quadrava-wordmark` (`product`, `icon`, `tone`, `compact`), HTML text in Sora rather than the SVG logos, which use `<text>` and would fall back to another typeface when loaded as images. Sora comes from `@fontsource/sora` (`latin-400.css`, `latin-600.css` in the `styles` of both apps in `angular.json`).
* Brand colours are an exception to the no-hard-coded-colours rule: they are fixed by the brand, with a light and a dark variant, and never follow the theme.
* Below 32 px use the `*-icon-small.svg` variants (favicon, header, side bar).
* `lc-sidebar` takes an application brand through content projection (`<x lcBrand>`); without it, it shows `logo` (or a default icon) and `brand`.

## 6b. Texts and languages

* Never write user-facing text in a component. Texts that come from the JSON go through `runtime().text(value, scope)`, which evaluates `{{ }}` (including `t()`); this includes labels of columns, fields and actions. The platform's own strings use `inject(I18n).t('lc.something')` and a key in `components/src/lib/messages.ts` (add it to both `it` and `en`).
* `I18n` (core) holds the active language and two layers of messages: the application's (wins) and the built-in `lc.*` layer. Reading it inside a template or a `computed` is reactive: changing the language updates the screen without reloading.
* Expression functions (`t`, `fmtCurrency`, `fmtNumber`, `fmtDate`, `plural`) live in `expressions` and have no side effects. CEL cannot register namespaced functions (`fmt.currency`), so the names are flat. A map with mixed value types in `t()` needs `dyn(...)` around the values: `{'n': dyn(1), 'name': state.name}`. A plain `{n}` placeholder is not localised: write `{n, number}` for numbers. Reading a state key that does not exist yet is an error (reported to diagnostics): guard with `has(state.key)`.
* The result is always plain text. Never bind a translation to `innerHTML` or to NG-ZORRO modal/message strings without escaping.
* NG-ZORRO's own locale follows the active language (`provide.ts`); an unknown language falls back to English.

## 7. Ports and dependency injection

Everything external to the interpreter is an abstract class used as a DI token: `Authorization`, `UserProvider`, `DataClient`, `ScreenNavigator`, `Notifier`, `RuntimeDiagnostics`, `RuntimeTracer` (optional: spans `screen.open`, `action.run`, `http.client`, architecture § 8), `Confirmation`, `FormDialog` (the `dialog` step; implemented by `DialogForm` in `components`).

**Files.** `DataRequest` may carry a `file` (`field`, `name`, `type`, `blob`): `HttpDataClient` then sends a multipart body (`FormData`) with the file in its part and each body entry as a text part. `ScreenRuntime.execute(name, args, scope, file)` attaches it.

**Queries and refresh.**

* `ScreenRuntime.query(name, args, scope)` runs a data source without changing its shared state (used by lookup fields and by the server data table, so that two components on the same source do not disturb each other).
* Components that query a source themselves should watch `ScreenRuntime.refreshCount()[source]`: the `refresh` step increments it for every source, and on non-GET sources that is all it does (it returns `{ ok: true, data: null }`).
* Data source expressions always see `search`, `lookupKey` and `request` (null until a component sets them).

**Choosing the implementations.** The runtime chooses them at start-up from `runtime-config.json`: without `services` it plugs in the demo fakes and `DemoShellSession` (profile selector); with `services: { source: 'bff', appId }` it calls `provideLowcodeServices` and uses `BffShellSession` (user name, permission count, logout). In a `provideAppInitializer` callback call every `inject()` before the first `await`: afterwards the injection context is gone (NG0203) and the app does not start.

**Adding a port.** Declare the abstract class in `core`, inject it where needed, provide a fake in `runtime/demo`, and a real implementation in `services` (or `components` when it is UI). Components must depend on the abstraction only.

## 8. Security rules (non-negotiable)

* No `innerHTML`, `bypassSecurityTrust*` or `eval`/`new Function` in application code.
* Rich text goes through `parseMarkdown` (core) and `lc-markdown`, which renders the tree with templates. Never add raw HTML support to the Markdown dialect. In the rich text editor the DOM is built with `createElement`/`textContent` (`renderMarkdownInto`) and read back only through `domToMarkdown`, which keeps the allowed tags and checks link addresses with `safeHref`.
* No secrets, tokens or personal data in JSON, logs, URLs or storage. Tokens are never put in `localStorage` / `sessionStorage`.
* Expressions fail closed; evaluation errors go to `RuntimeDiagnostics`, never thrown during rendering.
* Data-source URLs must stay relative; trace headers are same-origin only.
* Permissions have the shape `domain.resource.action`.
* The front end is not an authorization boundary: every rule must also hold in the back end.

## 9. Testing

Vitest runs in jsdom through `ng test`. Conventions:

* One `*.spec.ts` beside the unit; describe behaviour, not implementation.
* Use `provideLowcodeComponents()` in any test that renders NG-ZORRO components (otherwise icons and the modal service are missing).
* `settle(fixture)` flushes microtasks and change detection; prefer it to arbitrary timeouts.
* `select-testing.ts` provides `stubViewportHeight()` and `openSelect(...)`: `nz-select` options use CDK virtual scroll and render nothing in jsdom unless the viewport height is stubbed; wait for the options before clicking them.
* `components/src/lib/screen-testing.ts` renders a screen with the standard catalogue and recording fakes (`renderScreen`, with `requests`, `toasts`, `navigations`, `reports`, `settle`, `until`). `runtime/src/app/showcase-testing.ts` opens a demo screen with the showcase documents (`openShowcase`); it also stubs `Element.scrollTo`, which jsdom lacks and the select option list calls.
* Showcase tests also assert that `DemoDiagnostics` stays empty: an expression error in an example is a bug.
* Overlays: closed modals remain in the DOM during animation; select the **last** `.ant-modal-confirm`. Toasts are in `document.body .ant-message-notice`; tables exclude `.ant-table-placeholder` when counting rows.
* Test the configuration of what jsdom cannot verify (for example `nzAutofocus: 'cancel'`), and note the limit in the test.
* Runtime specs import the demo JSON, so run `npm run demo:prepare` first.

### End-to-end tests (Playwright)

What jsdom cannot see (layout, real NG-ZORRO overlays, attributes as the browser applies them) is tested with Playwright in `frontend/e2e/`, against the demo with its in-browser fake back end and against Studio (moving and resizing its windows; `playwright.config.ts`).

* One `*.spec.ts` per showcase screen; open it by URL (`/showcase/<screen>`) after fixing the language with `page.addInitScript(() => localStorage.setItem('lc.language', 'it'))`.
* Prefer user-facing locators: `getByLabel` (field labels are `<label for>`; for `nz-select` and `nz-switch` they point at the control), `getByRole`, the visible text of `nz-option-item`. Use `data-region`, `data-node-id` and `data-node-type` when there is no accessible name.
* Check layout with `boundingBox()` at explicit viewport sizes (`page.setViewportSize`), with a tolerance of a pixel or two, not with full-page screenshots.
* Rely on Playwright's auto-waiting assertions (`toBeVisible`, `toBeEditable`, `toHaveCount`), never on fixed timeouts.

Real focus handling and the dark theme are not covered yet (the application shell follows the Ant Design Pro look, driven by the theme); check them manually with `npm run start:runtime` for UI changes.

## 10. Code style

* TypeScript strict; no `any` without a comment; prefer `readonly`, signals and `computed`.
* Standalone components, `OnPush`, `input()` / `output()` functions, new control flow (`@if`, `@for`).
* Accessibility: landmarks and labels (`role`, `aria-label`), keyboard operability, no colour-only meaning.
* Everything is in English (the project is open source): code, identifiers, comments, test names, schema and contract descriptions, diagnostics, documentation and commit messages. Italian is only one of the translation catalogues of the user-facing texts.
* Keep libraries free of application knowledge: there are no built-in areas or domains.

## 11. Contracts and reference implementation

* **Contract first.** Change `contracts/*.yaml`, validate it, then change the code. Breaking changes need a new version path.
* The reference implementation (`reference/`) is non-production by design: keep it simple and clearly labelled.
* Build with `mvn verify` from `reference/`. Permission checks and the `X-Permissions-Version` header must match `authz.yaml`.

## 12. Commits and pull requests

* Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`), a scope when helpful (`feat(components): ...`).
* Small, reviewable pull requests; commit generated files (`*.schema.ts`) together with their source JSON.
* Include tests and documentation updates in the same change. Describe how you verified UI changes.
* Architecture-level decisions are recorded as ADRs (see the architecture document).

## 13. Known limits

* The collapsed side menu opens groups in a popup.
* The reference registry keeps its data in memory unless `lowcode.registry.storage-dir` is set (`npm run stack` sets it to `data/registry`). Logout from the apps is a JSON call (`Accept: application/json`, CSRF header) answered with `{"redirect": …}`: with `csrf().spa()` a form field would need the masked token.
* The Playwright suite runs in Chromium only.
* jsdom has no `document.execCommand`: the rich text toolbar is tested end to end (`e2e/showcase-input.spec.ts`); unit tests cover the Markdown ↔ DOM conversions and the value flow.
* Inside a CEL single-quoted string a real newline is a syntax error: write `\n` in `t()` fallbacks (in screen JSON, `\\n`).
* `validate:examples` checks translation keys but not CEL expressions (the runtime test `i18n-examples.spec.ts` does).
* Component limits that remain (no nested repeaters, no chart zoom, no row selection in the server data table) are listed in the component catalogue, § 3.
* NG-ZORRO 22's `nz-input` has its own `readonly` input and writes the attribute from it: bind `[readonly]`, never `[readOnly]` (the property binding is overwritten and the field stays editable).
* Single fields are drawn by `lc-field-control` (`components`), shared by `form`, `input` and `filterBar` (`variant="filter"`: "all" placeholder and choice, switched-off checkboxes mean no filter): a new field type goes there once.
* `DataClient.request(request, { signal })`: the runtime aborts a GET that a newer one supersedes (and all of them when the screen is left); writes are never aborted. Identical concurrent `query` GETs share one call. A custom `DataClient` should honour the signal.
* The expression engine caches compiled CEL and parsed templates (2000 entries, least recently used evicted): evaluating the same text again costs no parsing.
* NG-ZORRO parts with fixed or too light colours (tag text, select placeholders and arrows, waiting steps, out-of-month calendar days) are overridden by a stylesheet the theme bridge adds (`NZ_CONTRAST_CSS`); tag text colours are computed from the theme to reach 4.5:1. Group titles of the side menu get `tabindex`, `role` and `aria-expanded` after every render, and `nz-tree`'s hidden input and icons leave the accessibility tree: NG-ZORRO does not provide them.
* The editor preview talks to the editor only through messages (`preview/protocol.ts`): `drop` (a palette component), `move` (an existing component dragged in *Select* mode) and `resize` (`span` or `grow` from the handle, computed by the pure `preview/resize.ts`) are validated and applied by the editor with the outline's rules.
* The editor bootstraps lazily: `main.ts` imports either the editor app or the preview app (`?preview`), so the iframe does not download the editor UI.
* Steps `validate`, `print` and `export` live in `core/action-engine.ts`; standalone fields register their check with `ScreenRuntime.registerValidator(group, check)` while they are on screen.
* `DefinitionSource.messages(locale)` returns a catalogue (key → text): the demo reads `examples/i18n`, the registry the published `messages` document. A new language needs its catalogue in both places (`publish:examples` publishes the files).
* Layout containers (`box`, `grid`, `border`) read the position of each child from the child itself (`grow`, `span`, `region`, declared on every node in the schema). Inside them `--lc-input-max: none` lets fields fill the cell; a new container that holds nodes must also be added to `seedFilters` in `ScreenRuntime` (so that the state of nested fields exists before the first load) and to `LAYOUT_CONTAINERS` in the editor's `schema-info.ts`.
* After `npm run build:libs` restart the dev servers: they do not reload `dist`, and one left running while `dist` is rebuilt fails with "module 'components' could not be found" until restarted.
* `provideNzIcons` is not cumulative: a second call replaces the icons registered by `provideLowcodeComponents`. An app that registers its own icons must repeat `Object.values(ICON_TYPES).map((i) => i.icon)` (the editor does).
* Developer diagnostics are not translated and are written in English: schema and expression issues, the technical detail of loading errors, and the messages of the `services` library. Everything the end user reads is translatable: a screen or a menu that cannot be loaded shows `lc.screenNotFound` (404 or 403 from the definition source), `lc.screenLoadFailed` or `lc.navigationLoadFailed`, and the detail goes to `RuntimeDiagnostics`. A `DefinitionSource` puts the HTTP code in the error's `status` so that the two cases can be told apart.
* Adding a language means adding `examples/i18n/<code>.json` (same keys as `it.json`), an entry in `LANGUAGES` of the demo, and, for the platform strings, a block in `components/src/lib/messages.ts` and a NG-ZORRO locale in `provide.ts`.
