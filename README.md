# LowCode Platform

A platform for building **management and administrative front ends by describing them in JSON**, plus a visual editor that produces that JSON.

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
| **Visual editor** (`frontend/projects/editor`) | Drag-and-drop editing of the JSON documents | Not started (empty scaffold) |
| **Contracts** (`contracts/`) | OpenAPI 3.1: authorization, telemetry ingestion, registry | Defined and validated |
| **Reference implementation** (`reference/`) | Spring Boot BFF, registry, authorization and telemetry services that implement the contracts | Written, not yet compiled in CI |
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

**Components** (node `type`): `section`, `text`, `button`, `filterBar`, `table`, `form`, `tabs`, `detail`, `alert`. Forms and filters support `text`, `number`, `select`, `checkbox` and `date` fields, required fields, CEL validation rules, and conditional visibility / read-only state. Table columns and detail fields support cell formats (`currency`, `percent`, `date`, `datetime`, `boolean`, `badge`). The component catalogue document lists what exists and what is planned.

**Actions** are sequences of steps: `set` (screen state), `call` (a data source, with `onError`), `refresh`, `navigate`, `toast`, `confirm` (stops the sequence silently if the user cancels).

**Expressions** are written in [CEL](https://github.com/google/cel-spec) inside `{{ ... }}` and see these variables: `user`, `state`, `params`, `row`, `form`, `value`, and the function `can('domain.resource.action')`. Visibility (`visibleIf`, `hiddenIf`), read-only (`readOnlyIf`), enablement (`enabledIf`) and permissions (`requires`) all use them.

**Permissions** always have three lowercase parts, `domain.resource.action` (for example `ordini.iban.leggi`). The schema rejects any other shape. Record-level permissions arrive as `row._perm.update` / `form._perm.update`.

### Theme

A theme is a document of **design tokens only** (colours, typography, radius, density, light/dark mode, and the layout of the application shell: side bar tone/colours/widths, top bar, page header, content padding), validated with restrictive patterns so it cannot inject CSS. The runtime applies it as CSS variables (`--lc-*`) and a bridge translates the primary, success and error colours into NG-ZORRO's `--ant-*` variables (computing the tonal scale); a dark theme additionally loads NG-ZORRO's dark stylesheet. Themes switch at run time without reloading.

### Navigation

A navigation document lists **use cases** (functional areas), each with a menu of up to three levels (group → subgroup → item). Items point to a screen with optional parameters and may carry `requires` (a permission) and `visibleIf`. Groups and use cases with no visible items disappear. The platform has no built-in use cases; those in the examples are only examples.

### Texts, tooltips and languages

Every text is a string that may contain `{{ … }}` expressions, and every component (and every action, field and column) accepts an optional `tooltip` (plain text, never HTML). Translations live in **catalogues**, one flat JSON file per language (`examples/i18n/it.json`, `en.json`), and a screen refers to them with `t('key', 'fallback text', {params})`:

```json
{ "type": "button", "label": "{{ t('fatture.nuova', 'Nuova fattura') }}", "tooltip": "{{ t('fatture.nuova_aiuto', 'Crea una fattura') }}" }
```

The lookup order is: active language, default language, the fallback written in the JSON, the key itself. Messages use a subset of ICU (`{n}`, `plural`, `select`). Expressions also offer `fmtCurrency(v, 'EUR')`, `fmtNumber(v)`, `fmtDate(v)` and `plural(n, 'one', '{n} many')`, all following the active language, and `user.locale` holds the language code. The platform's own strings (`lc.*`) ship in Italian and English; an application can override any of them. Menu labels use the same mechanism. `validate:examples` checks that every language has the same keys and that every key used with `t()` exists.

## Repository layout

| Folder | Content |
| --- | --- |
| `frontend/` | Angular workspace: apps `runtime` and `editor`; libraries `schema`, `expressions`, `core`, `components`, `services` |
| `contracts/` | OpenAPI 3.1: `authz.yaml`, `telemetry.yaml`, `registry.yaml` |
| `reference/` | Spring Boot (Maven multi-module): `bff`, `registry`, `authz`, `telemetry` |
| `idp/` | Keycloak for local development (Docker Compose and sample realm) |
| `examples/` | Reference JSON applications used by validation and tests |
| `docs/` | Documentation entry point and architecture decision records |

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
| Tests (front end) | Vitest 5 through `ng test`, jsdom |
| Telemetry | OpenTelemetry-style signals sent as OTLP/HTTP JSON |
| Back end (reference) | Spring Boot 4.1.1, Java 21 |
| Identity | Keycloak 26.8, OIDC with PKCE through the BFF |
| Node.js | 22.22.3 or later (or 24.15+) |

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
* **Component showcase** (visible to every profile): four screens, `examples/vetrina-*.json`, exercising every component: basics and actions, forms (all field types, validation, conditional fields), filters and tables (server paging, row actions, cell formats, confirmation), and tabs, detail view and in-page messages.
* The look follows Ant Design Pro and is entirely driven by the theme: full-height light side bar with the logo above the use-case selector and a round collapse button on its edge, top bar with the user menu (name, avatar, sign-out as the last entry), page header with breadcrumb, title and description, cards on a light grey background. Three themes are provided: `chiaro`, `classico` (dark navy side bar) and `scuro`. The round button on the side bar edge collapses it to icons (groups then open as pop-ups). *Sign out* in the user menu ends the demo session.

The libraries are not hot-reloaded: after changing anything in `frontend/projects/<library>` run `npm run build:libs` again.

## Run the full stack

Prerequisites: Node.js 22.22.3+, JDK 21, Maven 3.9+, Docker.

1. Identity provider: `cd idp && docker compose up` (console at http://localhost:8180, user `admin`, password `admin`).
2. Reference implementation: `cd reference && mvn verify`, then `mvn -pl <module> spring-boot:run` for each module. Ports: bff 8080, registry 8081, authz 8082, telemetry 8083.
3. Front end: `cd frontend && npm ci`, then `npm run start:runtime` (port 4200) or `npm run start:editor` (port 4201, scaffold).
4. Validate the examples against the schemas: `cd frontend && npm run validate:examples`.

Development users in Keycloak: `operatore`, `responsabile`, `amministratore` (password equal to the user name). For local development only.

## Testing

```bash
cd frontend
npm run test:libs                     # schema, expressions, core, components, services
npx ng test runtime --watch=false     # end-to-end demo tests (needs `npm run demo:prepare` once)
npx ng test editor --watch=false      # scaffold
npm run schema:check                  # generated schema constants are in sync
npm run validate:examples             # examples are valid
```

At the time of writing there are **181 automated tests**: schema 25, expressions 27, core 42, components 44, services 18, runtime 23, editor 2. They run in jsdom, so layout, real focus handling and pixel-level rendering are **not** covered; see the development guide for the helpers that make NG-ZORRO overlays testable.

## Security model

* **No secrets in JSON.** Keys, passwords and tokens never appear in a definition; only references to configuration owned by the BFF or the environment.
* **Tokens stay out of the browser** in BFF mode (HttpOnly, Secure, SameSite cookie); in SPA mode they live in memory only, never in `localStorage` / `sessionStorage`.
* **Expressions are sandboxed** (CEL, no `eval`), and a failing expression denies.
* **Values are always inserted as text.** `innerHTML` and sanitizer bypasses are forbidden. NG-ZORRO's modals and messages interpret strings as HTML, so the platform passes them text that has been neutralised or rendered through a component.
* **URLs of data sources are relative**; absolute, protocol-relative, backslash and `..` forms are rejected, and tracing headers are sent same-origin only.
* **Authorization is enforced by the back end.** The front end hides and disables for usability; permission versions (`X-Permissions-Version`) make the client refresh when permissions change.
* **Sensitive fields** marked `sensitive` never reach traces or logs; the ingestion endpoint applies a second layer of redaction.

Open point: Ajv generates validators with `new Function`, so browser-side validation needs `unsafe-eval` in the Content-Security-Policy. Before production, precompile the validators (Ajv standalone) or validate at publication time in the registry.

## Status and roadmap

**Verified:** the three JSON Schemas, the CEL evaluator, the interpreter, the NG-ZORRO component catalogue, the services library and the runtime demo, with the automated tests above; the build of every app and library; the validity of the three OpenAPI contracts and of the examples.

**Not verified:**

* The Java modules have not been compiled or tested (`mvn verify` is pending; Spring Boot 4 starter names must be checked at the first build).
* The `services` library is tested against simulated HTTP only, not against the real BFF.
* The demo has not been run in a real browser after the move to NG-ZORRO: it is covered by jsdom tests, so the visual result (including the dark theme stylesheet) still needs a manual look.

**Next steps:**

* Wire `services` into the `runtime` app (today it uses the demo's fake ports) and complete the BFF: CSRF protection, API forwarding with token and `traceparent`, host allow-list.
* Visual editor (`editor`): node tree, property panel, preview, themes and menus.
* Components still to build (see the catalogue): sorting, selection, detail rows, dialog with form, row-action menus, repeatable form rows, tree and calendar views.
* Menu: arrow-key navigation, badges, search.
* Check expressions in `validate:examples` too.
* Language catalogues loaded from a service (today they are files shipped with the app) and an editor picker for translation keys.

## License

Not yet defined.
