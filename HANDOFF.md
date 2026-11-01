# HANDOFF — Quadrava Community Edition (CE)

Project status, conventions and next steps, for picking the work up locally. Last updated: 1 November 2026, release 0.4.0: Quadrava Studio, its desktop app and the registry have left this repository for the commercial edition (ADR-21); this is Quadrava CE. Before that, 0.3.0 published the libraries as packages and the runtime web build; 0.2.1 brought the CLI and form fields from a data source (`fieldsFrom`); on 31 October the work requested by OpenDevTrack (`docs/handoff-opendevtrack.md`, § 0): the BFF contract and its kit, tenant selection (ADR-18), the kanban evolutions, text fields with suggestions, comments, live data sources (ADR-19) and the versioned distribution with the runtime image (ADR-20, version 0.1.0).

## 1. What it is

**Quadrava Community Edition (CE)** is the open-source edition of Quadrava, a low-code platform for business/administrative front ends **defined in JSON** (screens, data sources, actions, CEL expressions): the language, the runtime, the libraries, the CLI, the contracts and base services. The visual editor (Quadrava Studio), its desktop app and the registry are the commercial edition, in the private repository `sramaccini/quadrava-studio`, built on the packages of CE (ADR-21). The back end consists of OpenAPI contracts and a Spring Boot reference implementation not meant for production (it builds and its tests pass with `mvn verify`, JDK 21 and Maven 3.9, in CI too).

## 2. Working principles

- **Approval before changes** that were not explicitly requested; when in doubt, propose and wait.
- **Architectural review** mode: point out inconsistencies, missing pieces and shortcomings against the requirements.
- Documents explain things simply, with figures and practical examples; new content goes into the relevant sections, not into isolated comparison paragraphs.
- Latest stack; lightweight, governable DSL/expression solutions (no heavy rule engines).
- **Everything is in English**: code, identifiers, comments, tests, documentation, schema descriptions, contracts, commit messages, the demo (ids, data, permissions, API paths). Italian survives only as a translation catalogue (`examples/i18n/it.json`, the `it` halves of `messages.ts`) and in the tests that check it. The default language is English (platform, demo, formats `en-GB`); the tests run in English, except those that check the Italian translation.
- In long blocks of work: one commit per component, tests and a visual check before moving on to the next.

## 3. Stack and commands

Angular 22.2 (standalone, signals, OnPush), TypeScript 6.0, Node 24 (if the shell has another version: `eval "$(fnm env --shell bash)"; fnm use 24.21.0`), tests with vitest through `ng test` (jsdom), Ajv 8, cel-js 8, ng-zorro-antd 22.1.1, date-fns 4, Spring Boot 4.1.1, Keycloak 26.8.

From `frontend/`:

- `npm ci` (mandatory after every pull that changes dependencies)
- `npm run build:libs` — **before** building and testing the apps: the tsconfig paths point to `./dist/*`
- **`npm run stack`** — the whole stack with the real login in one command (Keycloak in Docker, Java services, demo back end, runtime on 4200 behind the BFF with the example project); logs in `.stack/logs`; Ctrl+C stops everything except Keycloak
- `npm run schema:sync` — regenerates the `*.schema.ts` files and the precompiled validators (`validators.generated.ts`) from the JSON schemas; `schema:docs` regenerates `docs/schema-reference.md`
- `npm run conformance:registry` / `conformance:authz` / `conformance:telemetry` / `conformance:bff` — conformance kits of the services and of the BFF against the contracts (see README)
- `npm run e2e` — Playwright (standalone fields, border layout, axe accessibility on the whole showcase; it starts the runtime on 4300)
- `npm run validate:examples` — checks the examples with the Quadrava CLI (schema, identifiers, references, patterns, CEL expressions, translation keys); `npm run cli:test` — tests of the CLI
- `npm run demo:prepare` / `npm run start:runtime` — copies `examples/` into `projects/runtime/public/examples` and starts the demo (port 4200). The dev server does **not** reload `dist`: restart it after changing libraries or examples.
- With a registry that follows `contracts/registry.yaml` on port 8081 (CE has none of its own): `npm run publish:examples`, then `npm run start:runtime:registry`.
- `runtime-config.json` (the runtime's public folder) decides where definitions come from: `examples` (demo) or `registry` (app, environment, navigation, themes); the `registry` configuration in angular.json uses `projects/runtime/config/registry/`. With `services: { source: 'bff', appId }` the runtime uses the real ports from `services` (`bff` configuration, `projects/runtime/config/bff/`).
- **Full stack with Keycloak step by step** (Docker Desktop running): `cd idp && docker compose up -d`; in `reference/` `mvn -q package -DskipTests` and `java -jar <module>/target/*.jar` for authz, telemetry, bff; in `frontend/` `npm run demo-api` (8084), then `npm run start:runtime:bff` (4200). The origins allowed by the BFF are 4200 and 4201 (the port of Studio in development).
- tests per project: `npx ng test <schema|expressions|core|components|services|runtime> --watch=false`

Test status (all green, 1 November 2026, in English): schema 95, expressions 46, core 200, components 243, services 44, runtime 113 (**741**), CLI 9; Java 28 (authz 7, bff 15, telemetry 6), `mvn verify` complete; Playwright 19 (13 of them for accessibility on the showcase, 2 for the rich text editor); conformance kits: authorization 11/11, telemetry 6/6 against the reference services, the registry kit for any registry that follows the contract. Production build of the runtime: 2.37 MB initial (439 kB transferred, under the 2.5 MB budget; the precompiled schema validators are a lazy chunk of 367 kB, 24 kB transferred).

## 4. Architecture in brief

Libraries (`frontend/projects/`): `schema` (JSON Schema + types), `expressions` (CEL, `{{ }}` templates, message formatter), `core` (ScreenRuntime, action engine, NavigationRuntime, I18n, abstract ports, catalogue, theme), `components` (NG-ZORRO), `services` (real ports: HTTP/BFF/OIDC). Apps: `runtime` (demo/shell); the `cli`.

- Ports (abstract classes used as DI tokens): Authorization, UserProvider, DataClient (with `{ signal }` to cancel superseded reads, `source` and `trace` for the HTTP span), ScreenNavigator, Notifier, RuntimeDiagnostics, **RuntimeTracer** (optional; `HttpTracer` in `services` sends OTLP spans to `/telemetry/v1/traces`), Confirmation, **FormDialog** (`dialog` step), DefinitionSource (screens, navigation, themes and **catalogues** `messages(language)`).
- Nodes: section (also `layout: "row"`), **box, grid, border** (layout containers; children declare `grow`, `span`, `region`; border with resizable sides), **input** (standalone field bound to the state, with a validation `group`), text, **image, link**, button, filterBar, table, **dataTable**, **serverDataTable**, form, tabs, detail, alert, **stats, progress, timeline, kanban**, **wizard**, **tree**, **calendar**, **chart**. Steps: set, call, refresh, navigate, toast, confirm, **dialog, validate, print, export** (CSV).
- Logo of the applications: `brand` in the theme (20 October 2026), drawn by `lc-app-brand` in the runtime (and in the previews of Studio); without it the Quadrava logo (classic theme of the demo: Acme Office).
- Brand: the product is called **Quadrava**, this edition **Quadrava Community Edition (CE)**, the commercial one **Quadrava Studio** (`assets/brand/`, brand README). Logotype `lc-quadrava-wordmark` (text in Sora from `@fontsource/sora`, not the SVGs with `<text>`), in the demo's side bar through the `lcBrand` slot; favicon. Technical identifiers: realm `quadrava` and Java packages `com.logicwarez.quadrava.reference`; the `lc-` prefixes stay.
- Fields: text, number, select, checkbox, date, **textarea, datetime, radio, switch, multiselect, lookup, file, repeater, richtext**.
- **Validation (19 October 2026, ADR-15, catalogue § 2.29).** Validators are pure descriptors in `core` (`validators.ts`, `formats.ts`): `STANDARD_VALIDATORS` plus those of the application (`provideValidators`), in the root `ValidatorRegistry`. The engine (`validation.ts`) compiles the flat constraints of a field (`minLength`, `pattern`, `format` + `country`, `min`, `step`, `minDate`…, `transform`, `messages`), `validate` and the keyed `validation` list (with `when`, `severity`, `message`), plus the form's `validation` across fields, into one list; `form`, `input`, `filterBar` and `repeater` use it through `checkValue` (`components/field-validation.ts`). Warnings do not block; fail-closed with one diagnostic per broken rule, never values. National formats with check digits for IT, DE, FR, ES, NL, BE, AT, PT (PL, SE for VAT and postal codes). CEL: `isValid(name, value[, params])`. Messages: `{x, date}` placeholder. Phases 2–3 (same day): `password` fields with show/hide and a strength meter of our own (`passwordStrength`, `minStrength`), remote rules on a data source (`RemoteChecks`: debounced, cancellable, results kept per value, the form waits for them), relative dates (`today+30d`), `minItems` / `maxItems`, field errors from the Problem of the services (`contracts/problem.yaml`, `CallResult.fieldErrors`, `runSteps(…, { onFieldErrors })`), and a `warning` colour in the theme. 20 October: rules across the standalone fields of a validation group (`ScreenRuntime.registerField`, `groupValues`), field errors of a `call` started outside a form routed to standalone fields, remote rules in the cells of repeaters, and the precompiled validators in the lazily loaded entry point `schema/validation` (import `validateScreen`… from there). Formats: **number**, currency, percent, date, datetime, boolean, badge, markdown.
- Formatted text: `format: markdown` on text, alert and detail fields (restricted Markdown: `core/src/lib/markdown.ts`, drawn by `lc-markdown` without HTML); `richtext` editor (`lc-rich-text-editor`, contenteditable + browser commands, value in Markdown). Labels deliberately stay plain text. Catalogue § 2.26.
- Table: sorting (in the page or server-side with `sort.bind`), selection + bulk actions, action menu (`rowActionsInline`), expandable rows, clickable cells, totals row (`aggregate`).
- `lc-node` applies `visibleIf/hiddenIf` and `tooltip`, and exposes `data-node-id`/`data-node-type` (for the editor and tests). Permissions `domain.resource.action`; expressions **fail-closed**.
- GET data sources reload **only if the resolved request changes** (URL and parameters); `refresh` reloads anyway. `ScreenRuntime.query` runs a data source without touching its shared state (used by lookups and by the serverDataTable). `refresh` on a non-GET data source only increments `ScreenRuntime.refreshCount`, which the serverDataTable watches to reload.
- `DataRequest.file`: multipart file upload (`HttpDataClient` uses `FormData`), up to 100 MB; base64 inside the JSON remains for files up to 10 MB.
- Variables always present in data sources: `search` and `lookupKey` (lookup), `request` (serverDataTable, contract in the catalogue § 2.19), `file` in `upload` data sources.
- Responsive shell with three bands (≥1200 expanded, 768–1199 collapsed, <768 drawer); round button next to the logo.

## 5. Component catalogue

`docs/component-catalogue.md`: specification of every component added (up to § 2.31, form fields from a data source), common rules and **known limits** (§ 3); `docs/schema-reference.md`: all the properties, generated from the schema. The demo showcase has thirteen screens (`examples/showcase-*.json`): basics, form, tasks and progress, layout containers, standalone fields, fields and forms, validation, tables, advanced tables, datatable, layout (tabs, detail, messages), dashboard, views.

**Work for OpenDevTrack (30–31 October 2026).** `contracts/bff.yaml` (0.3.0) describes what the runtime expects from a BFF, checked by `npm run conformance:bff`; optional tenants (ADR-18); `kanban` with order, swimlanes, WIP limits, rich cards and columns from data; `suggest` on text fields (the `word` variable); the `comments` component with mentions; `live` data sources over Server-Sent Events and the `LiveUpdates` port (ADR-19). What ms-authz must adapt is listed in `docs/handoff-opendevtrack.md` § 0.

**ms-authz checked (31 October 2026).** [authz-library](https://github.com/sramaccini/authz-library) (`com.logicwarez.authz` 2.0.1) is a BFF compatible with Quadrava: BFF kit 13/13 without and with a session, authorization kit 11/11 on the session (`--cookie`, new), runtime image in front of it. Found on the way, in 2.0.0: `401` instead of `404` on unknown paths with a valid session, and on asynchronous answers (fixed in 2.0.1); the runtime then looped on the login. The runtime now stops: a `401` within 30 seconds of a login it started shows that signing in did not work (`refused` in `HttpSession`, the time of the last login in `sessionStorage`), checked in the browser against the faulty build.

**Versions and releases (31 October 2026, ADR-20).** One semantic version (0.3.0 since 1 November 2026) for workspace and libraries, `CHANGELOG.md` (every visible change adds a line to `[Unreleased]`), `npm run release:check` in CI, `.github/workflows/release.yml` on a `v*` tag, and the runtime image `ghcr.io/sramaccini/quadrava-runtime` (`docker/runtime/`: nginx, configuration written at start-up from `QUADRAVA_*` variables or a mounted `runtime-config.json`, optional forwarding of the BFF paths). CI builds and starts the image (job `image`). The Quadrava CLI (`frontend/projects/cli`, `@sramaccini/quadrava-cli` on GitHub Packages with every release; npmjs from 1.0.0): `quadrava validate` and `quadrava publish` for the CI of a project; `validate:examples` and `publish:examples` use it. How to release: DEVELOPMENT-GUIDE § 3.

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
- `provideNzIcons` is not cumulative: a second call replaces the icons of `provideLowcodeComponents` (Studio repeats them).
- NG-ZORRO 22: `NzTooltipModule` (not `NzToolTipModule`), `nz-tabs` (not `nz-tabset`), no `nzAutosize` on textareas (`field-sizing: content` is used). Angular has no `.capture` event modifier: `addEventListener(..., true)`.
- `nz-input` (NG-ZORRO 22) has a `readonly` input that writes the attribute: bind `[readonly]`, never `[readOnly]`. A field is drawn in `lc-field-control`, shared by form and `input`.
- After `build:libs` restart the dev servers: one left running while `dist` is rebuilt fails («module 'components' could not be found») until restarted.
- Messages with literal braces (`{{ }}`, JSON): write them `\\{` `\\}` in the TypeScript source.

**Data sources (28 October 2026).** Defined only in data sources documents (`datasources/*.json`, with an optional `baseUrl`); a screen only refers to them (`{ ref, params, body }`; the schema rejects definitions in a screen). `settings` of `project.json` (with the registry: `definitions.settings` of `runtime-config.json`) are read by the expressions as `settings.<name>`; in a url a setting written alone goes in unencoded when it holds only path characters.

**Themes (28 October 2026).** The demo has thirteen themes (`examples/themes/`: light, classic, dark, ocean, forest, sunset, lavender, slate, sand, high-contrast, midnight, graphite, polar), all within WCAG AA for text, muted text, status colours and menu. Trying them brought out three defects of the shell, fixed: the secondary texts of a coloured top bar (`--lc-header-muted`), the link colour of the selected menu item with dark side bars, and cards, tables and pop-ups painted with the fixed greys of the NG-ZORRO dark stylesheet (`NZ_DARK_SURFACES_CSS` in `theme-bridge.ts`).

## 7. Known limits / debt

- Runtime: in `bff` mode it uses `provideLowcodeServices` (session, authorization, data client, telemetry) and `BffShellSession`; in the demo the fake ports and `DemoShellSession`. The demo's data logic lives in `runtime/src/demo/demo-backend.ts`, used by `MockDataClient` and by `tools/demo-api.mjs`.
- BFF: routes `/registry`, `/authz`, `/telemetry`, `/api`; CSRF for SPAs; OIDC logout. Tried live on 13 October 2026 (also with `npm run stack`).
- Telemetry (15 October 2026): traces `screen.open`, `action.run`, `http.client` and logs of the technical reports, both OTLP/HTTP JSON in batches, also sent when the page closes. Not done yet: the W3C `baggage` header with screen and action (guidelines § 9, RF-AUD-02), the `sensitive` redaction at the source (RF-TEL-06: the spans carry no data values, so today it matters only for logs) and the log level per environment (RF-TEL-07).
- Registry: CE has the contract (`registry.yaml` 0.6) and its kit, not an implementation; the runtime (`registry` definitions) and the CLI (`quadrava publish`) work with any registry that follows it. The stack runs without one.
- e2e in Chromium only; the automatic accessibility check does not replace manual testing.
- The runtime published as a static site uses the in-browser demo back end: it answers the demo screens and `samples/medical-staff` (`/api/medical-staff`); any other project with its own `/api` opens without data there.
- Quadrava CLI: built with esbuild, which does not check types; type checking it needs `@types/node`, not in the workspace (a new dependency to propose). The pattern check repeats the rule of `compilePattern`, whose file in `core` imports Angular.
- BFF kit: 13/13 against the reference BFF with a signed-in session and two tenants configured (31 October 2026); it does not check event streams. Per-event flushing of the reference BFF was measured by hand with a temporary stream (one event a second arrives one a second, directly, through the BFF and through the image): the MockMvc test alone cannot show it.
- Stack mode: `tools/demo-api.mjs` serves `/api/streams/tasks` and announces every change of the tasks, so behind the BFF a card moved by one user appears on the boards of the others (checked with two users through the image, 31 October 2026).
- Live data sources: one connection per stream address; over HTTP/1.1 browsers allow six per host (ADR-19).
- Runtime image (checked by hand on 31 October 2026 too, in front of the stack: session, permissions, registry definitions, data, CSRF, tenant switch from the shell, event streams): nginx resolves the host of `QUADRAVA_BFF_URL` at start-up. The BFF builds the login callback from the forwarded `Host`, so over plain HTTP it needs nothing; behind TLS the reference BFF would also need `server.forward-headers-strategy` for the scheme. The development realm and the reference BFF accept the image on port 8090 (login, return page, logout): docker/runtime/README.md, «Against the local stack»; complete login and logout through the image checked on 31 October 2026. From Git Bash, `-e VAR=/path` needs `MSYS_NO_PATHCONV=1`, or the path is rewritten into a Windows one (and refused).
- Component limits: catalogue § 3 (validation: absolute dates only, no async checks, no field errors from the services, no rules across standalone `input` fields).
- Project documents in `docs/` (functional specification, architecture, implementation guidelines, dynamic texts and i18n): they stop at 11–12 October; the most recent detail is in the catalogue and in the code.

## 8. Next steps (in the suggested order)

**Open core (ADR-21), done on 1 November 2026.** Studio, the desktop app and the registry live in the private repository `sramaccini/quadrava-studio` (proprietary, the commercial edition), which builds on the CE packages (`@sramaccini/quadrava-*`) and on the runtime web build of every release; 0.4.0 removed them from here, without rewriting history (what was published up to 0.3.0 stays MPL-2.0). New code of Studio and of the registry goes only into `quadrava-studio`. A CE change that breaks Studio is a breaking change of CE (changelog); a new component or field type needs its template in Studio (DEVELOPMENT-GUIDE § 4). Next: the repository public again (point 1).

0. **Names of the project** (`com.logicwarez.quadrava`). Done: the Java side of `reference/` (groupId `com.logicwarez.quadrava.reference`, artifacts `quadrava-reference-*`, packages `com.logicwarez.quadrava.reference.*`, properties `quadrava.*`, `QUADRAVA_BFF_CLIENT_SECRET`), the development realm `quadrava` (`idp/realm-quadrava.json`, clients `quadrava-bff` and `quadrava-tools`), the `$id` of the JSON schemas (`https://quadrava.logicwarez.com/schemas/`, the web form of `com.logicwarez.quadrava`: an `$id` must be a URL for the relative `$ref`s to resolve), the workspace `quadrava` and the telemetry of the runtime (`service.name` `quadrava-runtime`, attribute `quadrava.app`). Decided for 1.0.0: the npm scope `@logicwarez` on npmjs (`@logicwarez/quadrava-cli`, and `@logicwarez/*` for the libraries if they are published); until then the CLI stays `@sramaccini/quadrava-cli` on GitHub Packages, whose scope must be the owner of the repository. Release 0.1.0 is out (tag on `d6d5598`); 0.2.0 brings `fieldsFrom`; 0.2.1, the same with the release workflow fixed, is the first with the CLI.
1. Before making the repository public: enable GitHub's private vulnerability reporting (Settings → Code security), check the repository description and topics, and decide whether the author e-mail in the commits may stay public. The tree and the history contain no secrets: only the development credentials of `idp/` and `reference/`, labelled as such.
2. Trademark: a web search (17 October 2026) found no «Quadrava» mark or product, but similar registered software marks exist (for example US «QUADRA», class 42, asset-management software). A professional search on EUIPO TMview, WIPO Global Brand Database and USPTO, and possibly a filing in class 9/42, are advised before investing in the brand. Legal review of `CLA.md` before the first external pull request.
3. Local data after the October renames: Keycloak was recreated on 31 October 2026 (the realm is imported only when the container is created: after changing `idp/realm-quadrava.json`, `cd idp && docker compose down && docker compose up -d`); `data/registry`, left by the registry that used to be here, can be deleted.
4. Conformance kits in CI against the reference services (today they are run by hand, for example after `npm run stack`).
5. e2e in Firefox and WebKit.
6. Bring the project documents (architecture § 9, functional specification, guidelines) up to date with the October status.
7. Validation, what is left: remote rules in filters; field errors of the services deeper than one level of rows; a check of passwords against leaked lists (a service with k-anonymity) if a customer needs it.

## 8b. What was missing and proposed optimisations (13 October 2026)

List drawn up on 13 October and **implemented the same day**. For each item, where it is:

| Item | Status |
| --- | --- |
| CI and first e2e suite | done (dedicated session): `.github/workflows/ci.yml`, `frontend/e2e` |
| Accessibility check (axe) | done: `e2e/accessibility.spec.ts` on 12 screens; fixed contrasts, labels, `nz-steps`, `nz-tree`, menu group titles |
| Conformance kits | done for registry (17 checks), authorization (11/11) and telemetry (6/6); they found differences in the reference services, which were fixed |
| Persistent registry, review, comparison, promotion, validation on save | done: registry 0.3 (file store, four eyes, protected environments, If-Match, server-side JSON Schema; the registry is now in the commercial edition); comparison in Studio |
| Expression completion, direct editing on the preview, live data, concurrent changes | done (on the preview components can be added, moved and resized) |
| Screen-level validation, CSV, printing | done: `validate`, `export`, `print` steps |
| Image, link, progress, timeline, kanban | done (`image`, `link`, `progress`, `timeline`, `kanban`); coloured tags already exist as the `badge` format |
| Border with draggable dividers | done (`resizable`) |
| Menu with keyboard, badges, search | done, with counters on closed groups too |
| Language catalogues from a service | done: `messages` documents in the registry |
| CSP without `unsafe-eval` | done: precompiled validators (Ajv standalone) |
| Pinned Node | done (`.nvmrc`, `engines`) |
| Optimisation 2 (validate on publication) | done (validation in the registry + precompiled validators); the `immutable` HTTP cache for versions was not added |
| Optimisation 3 (deferred loading) | partly done: Studio and its preview split; the runtime stays in one bundle (NG-ZORRO needs almost everything for the first screen) |
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
- Project documents: `docs/functional-spec.md`, `docs/architecture.md`, `docs/implementation-guidelines.md`, `docs/dynamic-texts-and-i18n.md`; `docs/component-catalogue.md`, `docs/schema-reference.md`.
- Recent history (October 2026): `e6b5c41` security policy and templates, `100b72d` third-party notices, `cd2952e` English as the default language, `965d633` MPL-2.0 licence, `b25b72a`/`084e5d9`/`01002b8`/`365396e`/`caac5ff` English everywhere (libraries, editor, demo, services, components), `3e3ea53`/`803a734` Quadrava brand, `0c6c9f1` cross-document references in the registry. Earlier: `0a81b58` editor: drag and drop, `5e45e21` suggestions, `01a3233` linked preview, `7ba8c36` field-by-field lists, `ac3988f` first version of the editor; `417c426` serverDataTable; `3347671` stacked charts and dual axis, `3115710` data table for large volumes, `35b0faf` keyboard tree, `d57f0c8` lookup and file in rows, `59c2971` multipart files, `7c621e5` text of values in the lookup; `01c6367` data table … `72af122` sorting, `659c4f3` catalogue; `bc1424d` data source reload fix; `90224d7` responsive shell; `e67dfbe` full i18n.
