# KinetiX

A platform for building **management and administrative front ends by describing them in JSON**, plus a visual editor, **KinetiX Studio**, that produces that JSON.

An application is a set of JSON documents: screens (components, data sources, actions), a theme and a navigation menu. A generic runtime reads those documents and renders a working Angular application, built on the [NG-ZORRO](https://ng.ant.design) UI library (Ant Design for Angular). Authors never write Angular code: they declare *what* a screen shows and *which* API each action calls, and the platform takes care of authentication, authorization, tracing and error handling in one place.

> **Product boundary.** On the back-end side the platform delivers **REST contracts (OpenAPI) and a non-production reference implementation only**. Business back ends and the identity provider belong to the customer. The platform never ships production back-end services.

Contributor documentation: [DEVELOPMENT-GUIDE.md](DEVELOPMENT-GUIDE.md). Design documents (functional, architecture, implementation guidelines, component catalogue) are linked from [docs/README.md](docs/README.md).

---

## Table of contents

1. [What you get](#what-you-get)
2. [How it works](#how-it-works)
3. [The JSON language](#the-json-language)
4. [Repository layout](#repository-layout)
5. [Technology stack](#technology-stack)
6. [Run the demo](#run-the-demo)
7. [Run the full stack](#run-the-full-stack)
8. [Testing](#testing)
9. [Security model](#security-model)
10. [Status and roadmap](#status-and-roadmap)

---

## What you get

| Piece | Purpose | State |
| --- | --- | --- |
| **Runtime** (`frontend/projects/runtime`) | Angular application that loads screens, theme and navigation, validates them, and renders them | Working demo, fake back end |
| **Libraries** (`schema`, `expressions`, `core`, `components`, `services`) | JSON Schema and types, expression evaluator, interpreter, NG-ZORRO component catalogue, HTTP/session/authorization/telemetry services | Working, tested |
| **Visual editor** (`frontend/projects/editor`) | Builds screens and the navigation (use cases and menus) with property panels generated from the JSON Schemas and live previews rendered by the real runtime | Screens, navigation and themes |
| **Contracts** (`contracts/`) | OpenAPI 3.1: authorization, telemetry ingestion, registry | Defined and validated |
| **Reference implementation** (`reference/`) | Spring Boot BFF, registry, authorization and telemetry services that implement the contracts | Compiles and its unit tests pass (JDK 21, Maven 3.9), in CI too |
| **Identity provider** (`idp/`) | Keycloak with a sample realm for local development | Ready |
| **Examples** (`examples/`) | Reference applications used by tests and by the demo | Working |

## How it works

```
 JSON documents (screens, theme, navigation)
          │  validated by JSON Schema (Ajv)
          ▼
 ┌────────────────────────── Runtime (Angular) ──────────────────────────┐
 │  interpreter (core)  ── looks up node types in ──►  component catalogue │
 │        │                                             (NG-ZORRO)         │
 │        ├── expressions: CEL, `{{ ... }}`, fail-closed                   │
 │        ├── actions: set, call, refresh, navigate, toast, confirm        │
 │        └── ports: Authorization, UserProvider, DataClient,              │
 │                   ScreenNavigator, Notifier, Confirmation, Diagnostics  │
 └──────────────────────────────┬──────────────────────────────────────────┘
                                │ services library implements the ports
              single HTTP client │ (token or session cookie, traceparent,
                                │  401/403 handling, redaction)
                                ▼
        BFF (OIDC, token custody) ─► customer back ends
        authorization service      (REST contract)
        telemetry ingestion        (OTLP/HTTP)
```

Key design choices:

* **The runtime interprets the JSON** (it does not generate code), so changes are immediate and previews are faithful. Safety comes from validation and from running expressions in a sandbox.
* **Everything the runtime needs from the outside is a port** (an abstract class used as a dependency-injection token). The demo plugs in fakes; production plugs in the `services` library.
* **Fail closed.** Any expression that fails to evaluate denies access or hides the component, and the failure is reported to diagnostics out of band, never during rendering.
* **One HTTP client.** Every call, business or technical, goes through it: this is where tokens, tracing, error normalisation and log redaction are applied uniformly.

## The JSON language

### Screens

```json
{
  "schemaVersion": "1.0",
  "screen": "ordini-elenco",
  "title": "Orders",
  "requires": "ordini.ordine.leggi",
  "dataSources": {
    "ordini": { "type": "rest", "method": "GET", "url": "/api/ordini",
                "params": { "stato": "{{state.filtri.stato}}", "page": "{{state.page}}" },
                "paging": "server" },
    "approvaOrdine": { "type": "rest", "method": "POST", "url": "/api/ordini/{{id}}/approva" }
  },
  "components": [
    { "type": "filterBar", "bind": "state.filtri",
      "fields": [{ "name": "stato", "type": "select", "label": "Status", "options": ["bozza", "inviato", "approvato"] }] },
    { "type": "table", "source": "ordini",
      "columns": [{ "field": "numero" }, { "field": "stato", "format": "badge" }],
      "rowActions": [{
        "label": "Approve",
        "visibleIf": "{{can('ordini.ordine.approva') && row.stato == 'inviato'}}",
        "onClick": [
          { "confirm": "Approve order {{row.numero}}?" },
          { "call": "approvaOrdine", "args": { "id": "{{row.id}}" }, "onError": { "toast": "Approval failed" } },
          { "refresh": "ordini" },
          { "toast": "Order approved" }
        ]
      }] }
  ]
}
```

**Components** (node `type`): `section`, `box`, `grid`, `border`, `text`, `image`, `link`, `button`, `input`, `filterBar`, `table`, `dataTable`, `serverDataTable`, `form`, `tabs`, `detail`, `alert`, `stats`, `progress`, `timeline`, `kanban`, `wizard`, `tree`, `calendar`, `chart`. Every property of every component is listed in [docs/riferimento-schema.md](docs/riferimento-schema.md) (Italian, generated from the schema).

**Display components**: `image` (mandatory alternative text; only relative, `https` or `data:image` addresses), `link` (to a screen with parameters, or to an `https` address opened in a new tab without access to the opener), `progress` (bar or circle), `timeline` (events of a data source ordered by date, coloured by a field) and `kanban` (cards in columns by a field, moved by dragging or with a keyboard-accessible *Sposta in* menu, which runs the `onMove` steps with `row`, `from` and `to`; `moveIf` decides which cards can move).

**Layout containers** place their children without drawing a frame: `box` puts them in a row (wrapping) or a column, with alignment, distribution, gap and a `grow` share per child; `grid` has 1–12 equal columns, each child taking `span` of them, and becomes a single column below 600 px; `border` is a border layout where each child picks a `region` (`north`, `south`, `west`, `east`, `center`), with fixed-width sides (draggable with the mouse or the arrow keys when `resizable`), stacking below 768 px. The position properties live on the children, like the constraints of classic layout managers. `section` is the framed group with a title (`layout: "row"` puts its children side by side).

**Standalone fields** (`input`) are single fields outside forms (text box, dropdown, date, switch, lookup…) bound to the screen state (`bind`, default `state.<name>`), with a `default` value, `onChange` steps and a validation `group` checked by the `validate` step; data sources depending on that state reload when it changes. Forms and filters support `text`, `number`, `select`, `checkbox`, `date`, `textarea`, `datetime`, `radio`, `switch`, `multiselect`, `lookup` (search on a data source, which also resolves the label of an unloaded value through `{{ lookupKey }}`), `file` (uploaded as multipart up to 100 MB, or base64), `repeater` (repeatable rows, which may contain lookups and files) and `richtext` (a rich text editor with a toolbar: bold, italic, strikethrough, headings, bulleted and numbered lists, quotes, links) fields, required fields, CEL validation rules, conditional visibility / read-only state and a column grid. Tables add sorting (in page or server side), row selection with bulk actions, row-action menus, expandable detail rows, clickable cells and a totals row; the data table filters, sorts and groups the loaded rows (tens of thousands of rows), and the server data table offers the same interface for archives of any size by sending a `{{ request }}` (page, sort, filters, grouping) to the service, which returns pages, groups with counts and totals. Charts draw grouped or stacked bars, lines and doughnuts, with an optional right axis and combined bar/line series; the tree view is fully keyboard operable. Table columns and detail fields support cell formats (`number`, `currency`, `percent`, `date`, `datetime`, `boolean`, `badge`, `markdown`).

**Rich text.** `text` and `alert` with `"format": "markdown"`, and detail fields with the `markdown` format, show classic typography — paragraphs, three heading levels, nested bulleted and numbered lists, quotes, bold, italic, strikethrough, inline code and links — written in a restricted Markdown dialect; tables show the same values as plain text. The `richtext` field edits that same Markdown, so its value can be stored and shown anywhere. Plain text keeps its line breaks. Labels (fields, columns, buttons, menu) deliberately stay plain text. The component catalogue ([docs/catalogo-componenti.md](docs/catalogo-componenti.md), in Italian) lists what exists and specifies what is being built.

**Actions** are sequences of steps: `set` (screen state), `call` (a data source, with `onError`), `refresh`, `navigate`, `toast`, `confirm` (stops the sequence silently if the user cancels), `dialog` (a modal form whose submit steps see `form`; cancelling stops the sequence), `validate` (checks the standalone fields of a group, shows their errors and stops the sequence if one is invalid), `print` (the browser print dialog; the print stylesheet hides menu, header and buttons) and `export` (downloads the rows of a GET data source as CSV: semicolon separator and UTF-8 BOM for Excel, cells starting with `=`, `+`, `-` or `@` neutralised against formula injection). GET data sources reload by themselves only when their resolved request (URL and parameters) changes; `refresh` on a non-GET source only notifies the components that query it themselves (such as the server data table).

**Expressions** are written in [CEL](https://github.com/google/cel-spec) inside `{{ ... }}` and see these variables: `user`, `state`, `params`, `row`, `form`, `value`, and the function `can('domain.resource.action')`. Visibility (`visibleIf`, `hiddenIf`), read-only (`readOnlyIf`), enablement (`enabledIf`) and permissions (`requires`) all use them.

**Permissions** always have three lowercase parts, `domain.resource.action` (for example `ordini.iban.leggi`). The schema rejects any other shape. Record-level permissions arrive as `row._perm.update` / `form._perm.update`.

### Theme

A theme is a document of **design tokens only** (colours, typography, radius, density, light/dark mode, and the layout of the application shell: side bar tone/colours/widths, top bar, page header, content padding), validated with restrictive patterns so it cannot inject CSS. The runtime applies it as CSS variables (`--lc-*`) and a bridge translates the primary, success and error colours into NG-ZORRO's `--ant-*` variables (computing the tonal scale); a dark theme additionally loads NG-ZORRO's dark stylesheet. Themes switch at run time without reloading.

### Navigation

A navigation document lists **use cases** (functional areas), each with a menu of up to three levels (group → subgroup → item). Items point to a screen with optional parameters and may carry `requires` (a permission) and `visibleIf`. Groups and use cases with no visible items disappear. The platform has no built-in use cases; those in the examples are only examples. An optional `badges.url` (a relative GET returning `{ "<item id>": number }`) shows counters next to the items, refreshed periodically and when the page becomes visible again; a closed group shows the sum of its items. The side menu has a search box (case- and accent-insensitive, also by group name) and full keyboard navigation (arrows, Home/End, left/right to close and open groups; group titles are focusable and announce whether they are open).

### Texts, tooltips and languages

Every text is a string that may contain `{{ … }}` expressions, and every component (and every action, field and column) accepts an optional `tooltip` (plain text, never HTML). Translations live in **catalogues**, one per language: flat JSON files in the demo (`examples/i18n/it.json`, `en.json`) and `messages` documents in the registry (versioned, reviewed and published like screens; the runtime loads them from the same source as the definitions). A screen refers to them with `t('key', 'fallback text', {params})`:

```json
{ "type": "button", "label": "{{ t('fatture.nuova', 'Nuova fattura') }}", "tooltip": "{{ t('fatture.nuova_aiuto', 'Crea una fattura') }}" }
```

The lookup order is: active language, default language, the fallback written in the JSON, the key itself. Messages use a subset of ICU (`{n}`, `plural`, `select`). Expressions also offer `fmtCurrency(v, 'EUR')`, `fmtNumber(v)`, `fmtDate(v)` and `plural(n, 'one', '{n} many')`, all following the active language, and `user.locale` holds the language code. The platform's own strings (`lc.*`) ship in Italian and English; an application can override any of them. Menu labels use the same mechanism. Values that come from the service (statuses, types) keep their original value and are translated only for display: a column takes `"valueKey": "valori.stato"` (the text shown is `t('valori.stato.<value>')`, with the value itself as fallback; badge colours stay bound to the original value) and a select field takes `"optionKey": "valori.tipo"`. Validation messages and the "required field" message are translated too. The demo remembers the chosen language and starts from the browser language when it is supported. `validate:examples` checks that every language has the same keys and that every key used with `t()` exists, and a runtime test checks that no text in the example screens is left untranslated.

## Repository layout

| Folder | Content |
| --- | --- |
| `frontend/` | Angular workspace: apps `runtime` and `editor`; libraries `schema`, `expressions`, `core`, `components`, `services` |
| `contracts/` | OpenAPI 3.1: `authz.yaml`, `telemetry.yaml`, `registry.yaml` |
| `reference/` | Spring Boot (Maven multi-module): `bff`, `registry`, `authz`, `telemetry` |
| `idp/` | Keycloak for local development (Docker Compose and sample realm) |
| `examples/` | Reference JSON applications used by validation and tests |
| `docs/` | Documentation entry point and architecture decision records |
| `assets/brand/` | KinetiX brand: icons, logos, colours and usage rules (`assets/brand/README.md`) |

Frontend libraries, from the bottom up:

| Library | Responsibility |
| --- | --- |
| `schema` | JSON Schemas (screen, theme, navigation) with generated TypeScript constants, Ajv validators, TypeScript types |
| `expressions` | CEL evaluator (cel-js) with the platform's operators and an isolated environment |
| `core` | Interpreter: screen runtime, action engine, formatting, navigation runtime, theme service, the abstract **ports**, and the screen shell |
| `components` | The standard component catalogue built on NG-ZORRO, the side menu, the confirmation dialog, the notifier, and the theme bridge |
| `services` | Production implementations of the ports: HTTP data client, session (BFF), authorization with permissions version, OTLP telemetry |

## Technology stack

| Area | Choice |
| --- | --- |
| Front end | Angular 22.2 (standalone components, signals, zoneless-ready), TypeScript 6.0 strict |
| UI library | NG-ZORRO (`ng-zorro-antd`) 22.1 on Angular CDK, date-fns for dates, Italian locale |
| Validation | JSON Schema 2020-12 with Ajv 8 (strict) |
| Expressions | CEL via `@marcbachmann/cel-js` 8 |
| Tests (front end) | Vitest 5 through `ng test`, jsdom; Playwright for end-to-end tests in Chromium |
| Telemetry | OpenTelemetry-style signals sent as OTLP/HTTP JSON |
| Back end (reference) | Spring Boot 4.1.1, Java 21 |
| Identity | Keycloak 26.8, OIDC with PKCE through the BFF |
| Node.js | 24 (pinned in `.nvmrc` and in `engines` of `frontend/package.json`) |

TypeScript 7 is not usable: Angular 22.2 declares compatibility with `>=6.0 <6.1`.

## Run the demo

The demo needs only Node.js. It uses an in-memory fake back end, simulated permissions and the JSON screens in `examples/`.

```bash
cd frontend
npm ci
npm run start:runtime        # builds the libraries, copies the examples, serves on http://localhost:4200
```

In the top bar choose the **user** (`operatore`, `responsabile`, `amministratore`) and the **theme** (light, dark). The side menu is defined by `examples/navigation.json`; a selector at its top switches the use case. Things to try:

* Switch users: the available use cases and menu entries follow the permissions of the profile. The URL of a screen you may not open shows a denial even if typed by hand.
* *Inserimento Fattura*: a form with validation that saves a draft and navigates to the drafts list.
* *Revisione Spese*: two menu entries open the same screen with different parameters; Approve and Reject only appear with the review permission.
* **Component showcase** (visible to every profile): eleven screens, `examples/vetrina-*.json`, exercising every component: basics and actions; forms; layout containers (box, grid, border layout); standalone fields; fields and forms (new field types, lookup, file upload, grid, repeatable rows, form dialogs); filters and tables; advanced tables (sorting, selection, action menus, expandable rows, totals); the data table; tabs, detail view and in-page messages; a dashboard (KPI tiles and charts); procedures and views (wizard, tree, calendar).
* The look follows Ant Design Pro and is entirely driven by the theme: full-height light side bar with the logo above the use-case selector and a round collapse button on its edge, top bar with the user menu (name, avatar, sign-out as the last entry), page header with breadcrumb, title and description, cards on a light grey background. Three themes are provided: `chiaro`, `classico` (dark navy side bar) and `scuro`. The round button on the side bar edge collapses it to icons (groups then open as pop-ups). *Sign out* in the user menu ends the demo session.

The libraries are not hot-reloaded: after changing anything in `frontend/projects/<library>` run `npm run build:libs` again.

## Brand

The product is **KinetiX**; the visual editor is **KinetiX Studio**. The source assets live in `assets/brand/` (icons, logos, colours, usage); each app copies only what it needs into `public/brand/` (favicon in SVG with a 32 px PNG fallback, Apple touch icon, the small icon for the header). The logotype is drawn by `lc-kinetix-wordmark` (components library): the icon plus "Kineti**X**" (and "Studio") as HTML text in the Sora typeface, bundled locally from `@fontsource/sora` (weights 300 and 600, no request to Google), because an SVG logo used as an image cannot use the page's fonts. Brand colours are fixed (light and dark variants), not theme colours. The demo puts the logotype in the side bar (icon only when the bar is collapsed, dark variant on a dark bar) through the side bar's `lcBrand` slot, which any application can use for its own brand; KinetiX Studio shows it at the top left. Technical identifiers (Keycloak realm `lowcode`, Java packages, `lc-` prefixes, schema `$id`s) keep their names.

## Run the editor

```bash
cd frontend
npm run start:editor         # builds the libraries, copies the examples, serves on http://localhost:4201
```

A desktop-style menu bar offers *File* (new, open example, import, export, registry) and *Edit* (undo, redo, cut, copy, paste, duplicate, delete, move, with their shortcuts), fully keyboard operable; the switch between screen, navigation and theme sits on the right. As in classic IDEs, in every mode each panel (components, outline, properties) can be unpinned on its own: it becomes a vertical tab on the edge strip while the other panels of the side keep the column, and it slides over the preview on hover, closing again when the pointer leaves (not while a field inside has the focus). A *View* menu toggles the pinned sides, the problems panel and the central view; *Help* lists every keyboard shortcut (also F1). Open an example (*File → Apri esempio*) or start a new screen. The palette and the outline have search boxes; the outline has collapsible branches, multiple selection of sibling nodes (Ctrl+click, Shift+click) and a context menu (right click or Shift+F10) that can also wrap one or several nodes in a new section, box or grid; the property panel shows the path of the selected element and filters properties by name; the sides can be resized by dragging their inner edge. The *Data source* tab imports data sources from an OpenAPI 3 or Swagger 2 document (for example springdoc's `/v3/api-docs` in Spring Boot, or a file): operations are picked from a list grouped by tag and become data sources with path parameters, required query parameters, a `{{ form }}` body and sample data built from the response schema. Translations are not limited to Italian and English: languages are added in the *Testi* tab from a list with their names (or imported from files), any of them can become the default language of the fallback texts, and the preview can switch to any of them. Fixed preview widths that do not fit the pane are scaled down to fit, as in Chrome's device toolbar. The palette adds components (click, or drag into the outline); the outline selects, reorders, duplicates, cuts and pastes nodes; the property panel is generated from `screen.schema.json`, so columns, form fields, actions and steps are edited item by item; the *Data source* tab defines the services and the sample data the preview returns; the *Testi* tab lists every user-facing text, turns plain texts into translation keys with one click, edits the Italian and English translations (applied to the preview at once), exports them, or saves them to the registry (merged into the latest catalogue version) and publishes them. JSON is syntax-highlighted (with `{{ }}` expressions marked inside strings) in the *JSON* tab and in JSON fields. Inside `{{ }}` the property panel completes variables and functions while typing (arrows, Enter or Tab, Escape). The preview is the real `lc-screen` in an isolated iframe (the same app started with `?anteprima`, talking to the editor through a small postMessage protocol) with fake ports: nothing leaves the browser, permissions can be switched off, and Alt+click on a component selects it. Components can be dragged from the palette straight onto the preview (before, after or inside the component under the pointer); in *Seleziona* mode the components already there can be dragged to move them, and the selected one inside a grid or a box has a handle to change its `span` or `grow`. With *Dati veri* the preview reads from the real services (editor behind the BFF); writes stay blocked. Problems (schema, CEL expressions, duplicate ids, missing data sources) are listed at the bottom; the draft is saved in the browser; *Esporta* downloads the JSON. The *Navigazione* mode edits `navigation.json` the same way (outline of use cases, groups and items; schema-driven fields) and previews the real side menu with a simulated profile: switch permissions off to see what a user without them gets. The *Tema* mode edits a theme's tokens (with colour pickers) and previews the screen and menu being edited with that theme, applied to the preview only. The *Registro* panel saves the open document as a new immutable version (warning when someone else saved in the meantime, and listing the registry validation errors point by point), lists its history with the review state and the environments it is published to, compares a version with the open document, requests a review, approves or rejects it (reviewers only, never the author), reopens a version and publishes it (protected environments accept approved versions only). Details, shortcuts and limits: [docs/editor.md](docs/editor.md) (Italian).

## Run the full stack

Prerequisites: Node.js 24, JDK 21, Maven 3.9+, Docker.

**One command:**

```bash
cd frontend && npm run stack
```

`tools/stack.mjs` starts Keycloak in Docker, builds the Java modules when their jars are missing (`-- --ricompila` forces it), starts registry (file storage in `data/registry`), authorization, telemetry, BFF and the demo back end waiting for each to answer, publishes the examples with a real user, then serves the runtime (http://localhost:4200) and the editor (http://localhost:4201) behind the BFF (`-- --solo-servizi` skips them). Logs go to `.stack/logs/`; Ctrl+C stops everything except Keycloak (`cd idp && docker compose down`).

**Step by step:**

1. Identity provider: `cd idp && docker compose up` (console at http://localhost:8180, user `admin`, password `admin`).
2. Reference implementation: `cd reference && mvn verify`, then `mvn -pl <module> spring-boot:run` for each module (or `java -jar <module>/target/*.jar`). Ports: bff 8080, registry 8081, authz 8082, telemetry 8083.
3. Demo application back end: `cd frontend && npm run demo-api` (port 8084). It serves the data of the demo screens (the same logic as the in-browser demo, `projects/runtime/src/demo/demo-backend.ts`) and accepts only access tokens signed by the local Keycloak realm (RS256, issuer, expiry); `--senza-auth` switches the check off. Like a Spring Boot service with springdoc, it publishes its OpenAPI description at `/v3/api-docs` (description only, no token, CORS open) and, behind the BFF, at `/api/v3/api-docs`: the editor can import data sources from it.
4. Publish the examples into the registry with a real token: `npm run publish:examples -- --user amministratore --password amministratore` (the script gets the token from the development client `lowcode-strumenti`, local realm only).
5. Front end through the BFF: `npm run start:runtime:bff` (port 4200) and `npm run start:editor:bff` (port 4201). The dev servers proxy `/registry`, `/api`, `/authz`, `/telemetry`, `/bff`, `/oauth2` and `/logout` to the BFF, which keeps the session, adds the user's access token and `traceparent` to the forwarded calls and protects writes with CSRF (`XSRF-TOKEN` cookie, `X-XSRF-TOKEN` header). BFF routes (`lowcode.bff.routes`): `/registry` → registry, `/authz` → authorization, `/telemetry` → telemetry, `/api` → the application back end.
   * **Runtime** (`projects/runtime/config/bff/runtime-config.json`): without a session it goes straight to the Keycloak login and comes back; then it loads navigation, theme and screens published in the registry (application `demo`, environment `sviluppo`), the user's permissions from the authorization service, the data from `/api`, and sends diagnostics to the telemetry service. The header shows the user name, the number of permissions and an *Esci* button: logout closes the BFF session and the Keycloak session (OIDC end-session), so the next login asks for the password again.
   * **Editor**: the *Registro* panel offers *Accedi* when there is no session; versions are recorded with the user name as author.
   * After login the BFF returns only to the origins listed in `lowcode.bff.frontend-origins`; a visit to the BFF root goes to `lowcode.bff.home` (the runtime).
6. Validate the examples against the schemas: `cd frontend && npm run validate:examples`.

**Registry only, without Keycloak** (local development): start the registry with authentication switched off and publish the examples into it, then run the runtime and the editor against it.

```bash
cd reference && mvn -q -pl registry -am package -DskipTests
java -jar registry/target/lowcode-registry-0.1.0-SNAPSHOT.jar --spring.profiles.active=senza-auth
cd frontend && npm run publish:examples      # every screen, the navigation, every theme and catalogue, published in "sviluppo"
npm run start:runtime:registro               # port 4200: definitions from the registry
npm run start:editor:registro                # port 4201: Registro panel → save, publish → reload the runtime
```

The `senza-auth` profile logs a warning at start-up and must never be used outside a developer's machine. Add `--lowcode.registry.storage-dir=<folder>` to keep the registry data across restarts.

Development users in Keycloak: `operatore`, `responsabile`, `amministratore` (password equal to the user name). For local development only.

## Testing

```bash
cd frontend
npm run test:libs                     # schema, expressions, core, components, services
npx ng test runtime --watch=false     # end-to-end demo tests (needs `npm run demo:prepare` once)
npx ng test editor --watch=false      # visual editor
npm run schema:check                  # generated schema constants and precompiled validators are in sync
npm run schema:docs:check             # docs/riferimento-schema.md is in sync (npm run schema:docs regenerates it)
npm run validate:examples             # examples are valid
npx playwright install chromium       # once: the browser used by the end-to-end tests
npm run e2e                           # Playwright end-to-end tests in a real browser (needs `npm run demo:prepare`)
npm run conformance:registry -- --user operatore --password operatore --reviewer-user responsabile --reviewer-password responsabile
npm run conformance:authz -- --user operatore --password operatore --other-user responsabile --other-password responsabile
npm run conformance:telemetry -- --user operatore --password operatore
                                      # conformance kits: check a service (reference or customer) against its contract
```

`npm run e2e` starts the demo itself (`ng serve runtime` on port 4300, override with `E2E_PORT`; outside CI a server already running on that port is reused) and runs the suites in `frontend/e2e/` against the in-browser fake back end.

Every push to `main` and every pull request runs [`.github/workflows/ci.yml`](.github/workflows/ci.yml) on GitHub Actions: the front-end job (`schema:check`, `validate:examples`, `build:libs`, the tests of every project, the production builds of runtime and editor), the end-to-end job (Playwright in Chromium; report uploaded as an artifact when it fails) and the Java job (`mvn -B verify`).

At the time of writing there are **569 automated tests**: schema 71, expressions 42, core 76, components 169, services 27, runtime 78, editor 106. The Java modules add 39 (`mvn verify`: authz 7, bff 8, registry 18 — including the parity of the server-side schema validation with Ajv on every example and the coherence between controller and contract —, telemetry 6). They run in jsdom, so layout, real focus handling and pixel-level rendering are **not** covered there; see the development guide for the helpers that make NG-ZORRO overlays testable. The Playwright suite (18 tests) checks in a real browser what jsdom cannot see: the standalone fields showcase, the rich text editor (toolbar commands are executed by the browser), the border layout at 1400 px and 375 px, and **accessibility** with axe-core (WCAG 2.1 A/AA, no serious or critical violation) on all twelve showcase screens. The conformance kits pass against the reference services: registry 17 of 17, authorization 11 of 11, telemetry 6 of 6 (they found real deviations in the authorization and telemetry services, now fixed: unchecked permission format and batch size, a 500 on a missing `checks`, non-OTLP bodies accepted, errors without a Problem body).

## Security model

* **No secrets in JSON.** Keys, passwords and tokens never appear in a definition; only references to configuration owned by the BFF or the environment.
* **Tokens stay out of the browser** in BFF mode (HttpOnly, Secure, SameSite cookie); in SPA mode they live in memory only, never in `localStorage` / `sessionStorage`.
* **Expressions are sandboxed** (CEL, no `eval`), and a failing expression denies.
* **Values are always inserted as text.** `innerHTML` and sanitizer bypasses are forbidden. NG-ZORRO's modals and messages interpret strings as HTML, so the platform passes them text that has been neutralised or rendered through a component.
* **Rich text is never HTML.** Markdown is parsed into a tree and rendered with Angular templates, so HTML inside the text (from data or translations) stays visible text; links are accepted only with `https:`, `mailto:` or a relative `/` path. The rich text editor normalises whatever the browser produces back to the allowed Markdown (styles, scripts and unknown tags are dropped), pastes plain text only and refuses links with other schemes.
* **URLs of data sources are relative**; absolute, protocol-relative, backslash and `..` forms are rejected, and tracing headers are sent same-origin only.
* **Authorization is enforced by the back end.** The front end hides and disables for usability; permission versions (`X-Permissions-Version`) make the client refresh when permissions change.
* **Sensitive fields** marked `sensitive` never reach traces or logs; the ingestion endpoint applies a second layer of redaction.

* **Definitions are validated twice**: in the browser by validators precompiled at build time (Ajv standalone: no `new Function`, so the Content-Security-Policy does not need `unsafe-eval`) and by the registry on every save, against the same JSON Schemas.
* **URLs in components** are restricted: images accept relative, `https` and `data:image` addresses only; links accept screens, relative paths and `https` (opened with `noopener noreferrer`); never `javascript:` or other protocols.
* **CSV exports** neutralise cells that a spreadsheet would run as formulas.
* **The editor preview with live data** only reads (GET, same origin); writes are blocked.

Recommended Content-Security-Policy for the runtime and the editor served behind the BFF: `default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'self'` (`unsafe-inline` styles are needed by Angular's inlined critical CSS and NG-ZORRO).

## Status and roadmap

**Verified:** the four JSON Schemas (screens, navigation, themes, catalogues), the CEL evaluator, the interpreter, the NG-ZORRO component catalogue, the services library, the runtime and the visual editor, with the automated tests above; the build of every app and library; the validity of the three OpenAPI contracts and of the examples. End to end in a browser with Keycloak 26.8 in Docker and every reference service started by `npm run stack` (October 13, 2026): login through the BFF, navigation, themes, screens and catalogues from the registry, permissions from the authorization service, data, writes with CSRF and menu counters through the BFF, logout that ends the Keycloak session; in the editor behind the BFF saving, review (request, approval, protected environment), comparison, publishing and the live-data preview (writes blocked). Also without Keycloak, with the registry's `senza-auth` profile and file storage.

**Not verified / known limits:**

* The end-to-end suite runs in Chromium only; automatic accessibility checks find only part of the problems (keyboard and screen-reader checks by hand are still needed).
* Expressions are not checked by the registry (the editor and the runtime do it, fail-closed); a real implementation can add a server-side CEL check.
* Component limits are listed in the catalogue (§ 3), editor limits in [docs/editor.md](docs/editor.md).

**Next steps:**

* Editor: comparison between two registry versions (today: a version against the open document); resizing the border sides from the preview.
* Conformance kits in CI against the reference services (today they are run by hand, for example after `npm run stack`).
* Firefox and WebKit in the end-to-end suite.
* The full list of what was done and what remains is in [HANDOFF.md](HANDOFF.md) (Italian).

## License

Not yet defined.
