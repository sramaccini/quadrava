# LowCode Platform — Functional Specification

Simone Ramaccini · 7 October 2026

## 1. Purpose and vision

The LowCode Platform lets you build business and administrative applications by describing the user interface in JSON, instead of writing front-end code every time. It is aimed at teams that have to produce many similar applications (lists, filters, forms, detail views) without redoing authentication, permissions and tracing each time.

A simple picture: the platform works like a box of building bricks with its instruction booklet. The **JSON** is the booklet (it says which pieces are needed and where they go), the **runtime** is whoever assembles the pieces by reading the booklet, and the **visual editor** is the tool that lets you write the booklet by dragging pieces instead of typing it by hand.

The platform is a product in its own right, used to develop different applications. Every application inherits three base services that it does not have to rewrite: OAuth2/JWT authentication, fine-grained authorization through back-end REST APIs, and distributed tracing/logging.

The expected strength is **governability**: the whole application is a JSON document that can be validated, versioned and compared, and therefore reviewed just like code.

## 2. Actors and roles

Five roles interact with the platform; the most important distinction is between those who build the application and those who use it.

| Actor | Who they are | What they do with the platform |
| --- | --- | --- |
| Application developer | Builds a business application | Defines screens, data and actions with the editor or by writing the JSON; publishes the application |
| End user | Uses the business application | Signs in and uses the screens their permissions allow |
| Platform administrator | Runs the product | Manages the application registry, versions, themes and available components |
| Application back-end team | Develops the business APIs | Implements the business APIs and the REST contracts for authorization and telemetry |
| Security / audit officer | Checks compliance | Consults technical traces and the audit trail, verifies who did what and when |

## 3. Product scope

The platform **provides the front end, the REST interfaces and a reference implementation**; it does not provide business back ends or an identity management system. This choice is agreed and sets the product boundary.

**In scope**

- A declarative JSON language for describing business applications, with its JSON Schema.
- A runtime that interprets the JSON and produces the application.
- A visual editor that creates and edits the JSON.
- Base services built into the runtime: authentication, authorization, tracing/logging.
- The REST contracts (OpenAPI specifications) that back ends must implement for authorization and telemetry.
- A registry to store, version and publish application definitions.
- A reference implementation of the back-end services (authorization, telemetry, registry) that demonstrates and verifies conformance to the REST contracts.

**Out of scope**

- The business APIs of individual applications.
- The identity provider (a standard OIDC provider such as Keycloak is used).
- Production implementations of the back-end services: the reference implementation is not meant for production; the real ones belong to the customer.
- The log collection and analysis platform (standard OpenTelemetry-compatible tools are used).

**Key principle:** the front end is never the enforcement point. Hiding a button improves the user experience; real security always lives in the back end.

## 4. Application definition (the JSON language)

The whole application is a JSON document built from a few concepts, always the same ones. Priorities follow MoSCoW: M = must have, S = should have, C = could have.

| Concept | What it is, in plain words | Example |
| --- | --- | --- |
| Application | The whole: name, version, theme, navigation menu | "Order management" |
| Screen | A page of the application | Order list |
| Component | A piece of a screen | Table, form, field, button, chart |
| Data source | Where data comes from: a declared REST call | GET /orders with filters and paging |
| Action | What happens on a click: a sequence of steps | Save, then show a message, then go back to the list |
| Expression | A small formula for conditions and calculations | "show only if status = draft" |
| State | The values the screen remembers | Chosen filter, selected row |
| Area | A functional area of the application with its own menu, chosen from a selector | "Invoice Entry", "Expense Review" |
| Permission | A key that enables an action, in the format domain.resource.action | orders.order.approve |

| ID | Requirement | Priority |
| --- | --- | --- |
| RF-DEF-01 | The application is a JSON document validated by a JSON Schema; the schema version is written in the document | M |
| RF-DEF-02 | A screen contains nested components with a declared layout | M |
| RF-DEF-03 | Data sources declare method, URL, parameters, headers and response transformation; they support paging, sorting and filters | M |
| RF-DEF-04 | Actions are sequences of steps (call an API, navigate, update state, show a message) with explicit error handling | M |
| RF-DEF-05 | Expressions govern visibility, enablement, computed values and validations; the language is deterministic and sandboxed (no access to the DOM, the network or arbitrary code) | M |
| RF-DEF-06 | Field validation is declarative: required, format, rules across several fields | M |
| RF-DEF-07 | Navigation is a separate document (areas with three-level menus) that opens screens with parameters; see RF-DEF-12 onwards | M |
| RF-DEF-08 | The system allows registering custom components with a defined contract (an escape hatch for cases not covered) | M |
| RF-DEF-09 | A data source can be generated by importing an OpenAPI specification | S |
| RF-DEF-10 | The theme is a design-token document (colours, typography, corners, density), validated by a schema, applied as CSS variables and to the main colours of the NG-ZORRO UI library, and switchable at run time without reloading (also between light and dark); the overall look of the application follows the Ant Design Pro style (side bar, top bar, page header with breadcrumbs, content in cards); these aspects too, colours and sizes included, are theme tokens and change without touching the code; screens contain no hard-coded colours | M |
| RF-DEF-11 | Definitions are versioned and support automatic migration to newer schemas | M |
| RF-DEF-12 | The menu is defined by a navigation document separate from the screens: a list of areas, each with a tree of items up to three levels deep (group, subgroup, item); an item opens a screen with static parameters | M |
| RF-DEF-13 | Menu items are visible according to permissions (requires) and to an expression (visibleIf); groups and areas with no visible items do not appear; an expression in error hides the item. The menu is only a convenience: the check stays in the screen and in the back end | M |
| RF-DEF-14 | A selector switches from one area to another: it shows only those the user is allowed, does not appear if there is only one, and switching returns to the last screen visited in that area | M |
| RF-DEF-15 | Every screen has an address like /area/screen?parameters: Back, bookmarks and shared links work, and the active menu item is highlighted | M |
| RF-DEF-16 | A form may have no data source (insertion) and start from declared initial values; actions can send the form values as the request body | M |
| RF-DEF-17 | Translations (i18n) can be declared and are applied uniformly | S |
| RF-DEF-18 | Tables sort (in the page or through the service), select rows with bulk actions, gather row actions in a menu, open detail rows and show a totals row; the data table filters, sorts and groups tens of thousands of loaded rows in the page | M |
| RF-DEF-19 | Forms offer text area, date and time, radio, switch, multiple selection, search on a data source (lookup, which also shows the text of a value not loaded), file upload (multipart up to 100 MB), a column grid and repeatable rows | M |
| RF-DEF-20 | A dialog step opens a window with a form; if the user cancels, the sequence stops without errors, as with confirmation | M |
| RF-DEF-21 | Screens can show indicators (KPIs), bar, line and pie charts (stacked, with a secondary axis, combined), step-by-step procedures, keyboard-operable tree views and a monthly calendar; specifications and limits are in the repository's component catalogue (docs/component-catalogue.md) | M |

## 5. Runtime and authentication

The runtime reads the application definition and turns it into working screens. All traffic to the APIs goes through **a single HTTP client** in the runtime: this is where tokens, tracing and error handling are applied uniformly, without the application author having to deal with them.

| ID | Requirement | Priority |
| --- | --- | --- |
| RF-RUN-01 | The runtime loads the definition published in the registry and validates it before use | M |
| RF-RUN-02 | The runtime produces the screens from the JSON, without compiling for every change | M |
| RF-RUN-03 | All REST calls go through a single client that applies tokens, tracing identifiers and uniform handling of 401, 403 and network errors | M |
| RF-RUN-04 | The runtime handles loading, empty and error states consistently | M |
| RF-RUN-05 | The runtime exposes the built-in objects to expressions: current user, permissions, screen state | M |
| RF-RUN-06 | When the user's permissions change, menu and screens update without reloading the page; conditions in error fail closed (the part stays hidden or read-only) | M |
| RF-RUN-07 | An invalid screen or menu (schema or expressions) is not shown: the runtime reports the reason instead of drawing it halfway | M |

Authentication uses current standards and provides no proprietary alternatives.

| ID | Requirement | Priority |
| --- | --- | --- |
| RF-AUT-01 | Login through OAuth2 Authorization Code with PKCE over OIDC (external provider, for example Keycloak) | M |
| RF-AUT-02 | No application screen is shown before authentication (landing gate) | M |
| RF-AUT-03 | Token handling is configurable: BFF mode (tokens server-side only, the browser has a session cookie) or SPA mode with tokens in memory; BFF mode is recommended for regulated contexts | M |
| RF-AUT-04 | Expiry, renewal and logout are handled by the runtime, with a clean return to the sign-in screen | M |
| RF-AUT-05 | The application JSON never contains secrets: only references to the identity provider | M |
| RF-AUT-06 | User data (name, roles, claims) is available to expressions through the built-in user object | M |

## 6. Fine-grained authorization

Authentication says **who you are** (the badge at the entrance); authorization says **what you can do** (which doors that badge opens). The back end decides and the front end adapts: if a permission is missing, the corresponding part of the interface disappears or is locked, but the back end rejects the request anyway.

The application back end exposes a standard REST contract, defined by the platform, that returns the **capabilities** of the current user. The runtime loads them after login, caches them and makes them available to expressions, for example the condition "show the button only if the user can approve orders".

| Level | What can be controlled | Example |
| --- | --- | --- |
| Screen | Access to the page and its menu item | Only managers see "Approvals" |
| Section / component | Presence of a block | The "History" panel is visible to auditors only |
| Field | Hidden, read-only or editable | The IBAN is read-only for the operator |
| Action | Button visible and enabled | "Cancel order" only with a dedicated permission |
| Data row | Per-instance permissions | Only the orders of one's own branch can be edited |

| ID | Requirement | Priority |
| --- | --- | --- |
| RF-AUZ-01 | The authorization REST contract is published as an OpenAPI specification and can be implemented by any back end | M |
| RF-AUZ-02 | The runtime loads the user's capabilities after login and caches them; it renews them periodically or on an event | M |
| RF-AUZ-03 | Every node of the JSON (screen, section, component, field, action) can declare visibility, enablement and read-only conditions based on permissions | M |
| RF-AUZ-04 | Per-row permissions arrive together with the data, not from a global list | M |
| RF-AUZ-05 | A 403 response from the back end is handled uniformly (clear message and permission refresh) | M |
| RF-AUZ-06 | The back end filters out disallowed data anyway: the front end is never the enforcement point | M |
| RF-AUZ-07 | Editor and registry apply the same mechanism: who can edit and publish an application is a permission | M |

## 7. Tracing, logging and audit

These are three different things with different guarantees. The **technical trace** helps understand where a request went wrong, the **application log** tells what the application did, and the **audit** answers the question "who did what and when" and must be reliable and tamper-proof.

For the technical part an open standard, **OpenTelemetry**, is used instead of a proprietary protocol. A single user action becomes a trace that crosses front end and back end thanks to the W3C `traceparent` header added to every REST call.

| ID | Requirement | Priority |
| --- | --- | --- |
| RF-TEL-01 | The runtime generates traces for significant moments: opening a screen, running an action, calling an API | M |
| RF-TEL-02 | Every REST call includes the `traceparent` header, so the trace continues in the back-end services | M |
| RF-TEL-03 | The runtime sends traces and logs to a protected REST ingestion endpoint (OTLP/HTTP format), not directly to a collector | M |
| RF-TEL-04 | Sending is batched, with configurable sampling, and is not lost when the page closes | M |
| RF-TEL-05 | Unhandled errors and API errors are recorded with context: screen, action, correlation identifier | M |
| RF-TEL-06 | Fields marked as sensitive in the JSON are excluded from traces and logs (redaction of personal data) | M |
| RF-TEL-07 | The log level of detail is configurable per application and per environment | S |
| RF-AUD-01 | The audit trail is produced by the back end, not by the front end, because the front end is not a trustworthy source | M |
| RF-AUD-02 | The front end gives the back end the context useful for audit (screen, action, correlation identifier) through the same tracing headers | M |
| RF-AUD-03 | Audit immutability and retention are defined per application and comply with the customer's regulatory constraints | M |

## 8. Visual editor

The editor lets those who do not want to write JSON by hand build an application by dragging pieces. The JSON remains the single source of truth: the editor has no format of its own and reads and writes the same document the runtime uses. This allows switching between the visual editor and direct text editing without losing anything.

| ID | Requirement | Priority |
| --- | --- | --- |
| RF-EDT-01 | Canvas with components dragged from a palette, organised by screen | M |
| RF-EDT-02 | Property panel generated automatically from each component's JSON Schema | M |
| RF-EDT-03 | JSON view synchronised with the canvas, editable in both directions | M |
| RF-EDT-04 | Live preview with the real runtime, not a simulation | M |
| RF-EDT-05 | Real-time validation with understandable errors and their position in the document | M |
| RF-EDT-06 | Undo/redo and saving with a version in the registry | M |
| RF-EDT-07 | Readable comparison (diff) between two versions of an application | M |
| RF-EDT-08 | "View as" preview for a user with chosen permissions, to check visibility and locks | S |
| RF-EDT-09 | Guided creation of data sources and screens from an OpenAPI specification | S |
| RF-EDT-10 | Controlled publication: a change becomes available to users only after an explicit publication, with the option to roll back | M |
| RF-EDT-11 | Simultaneous editing with locking: not in the first version, from later ones | C |

## 9. Practical examples

The examples show the indicative syntax of the language; the exact field names will be fixed in the official JSON Schema. Formulas in double braces are expressions; `can(...)` queries the user's permissions, with names in the format domain.resource.action (for example ordini.order.approva); row.\_perm and form.\_perm carry the permissions on the single record.

**Example 1 — Order list with a filter and a row action.** The "Approva" button appears only if the user has the permission and the order is in the right state.

```json
{
  "schemaVersion": "1.0",
  "screen": "order-list",
  "title": "Ordini",
  "requires": "orders.order.read",
  "dataSources": {
    "orders": {
      "type": "rest", "method": "GET", "url": "/api/orders",
      "params": { "status": "{{state.filters.status}}", "page": "{{state.page}}" },
      "paging": "server"
    },
    "approveOrder": { "type": "rest", "method": "POST", "url": "/api/orders/{{id}}/approve" }
  },
  "components": [
    { "type": "filterBar", "bind": "state.filters",
      "fields": [ { "name": "status", "type": "select", "label": "Status",
                    "options": ["draft", "submitted", "approved"] } ] },
    { "type": "table", "source": "orders",
      "columns": [ { "field": "number" }, { "field": "customer" }, { "field": "status" } ],
      "rowActions": [ {
        "label": "Approve",
        "visibleIf": "{{can('orders.order.approve') && row.status == 'submitted'}}",
        "onClick": [
          { "call": "approveOrder", "args": { "id": "{{row.id}}" } },
          { "refresh": "orders" },
          { "toast": "Order approved" }
        ]
      } ]
    }
  ]
}
```

**Example 2 — Detail form with fields conditioned by permissions.** The IBAN can be hidden, read-only or editable depending on permissions; saving also depends on the permissions of the single row.

```json
{
  "schemaVersion": "1.0",
  "screen": "order-detail",
  "requires": "orders.order.read",
  "components": [ {
    "type": "form", "source": "order",
    "fields": [
      { "name": "customer", "type": "text", "required": true },
      { "name": "type", "type": "select", "options": ["private", "business"] },
      { "name": "discount", "type": "number",
        "visibleIf": "{{form.type == 'business'}}",
        "validate": { "rule": "{{value <= 20}}", "message": "Sconto massimo 20%" } },
      { "name": "iban", "type": "text", "sensitive": true,
        "hiddenIf": "{{!can('orders.iban.read')}}",
        "readOnlyIf": "{{!can('orders.iban.write')}}" }
    ],
    "actions": [ {
      "label": "Save",
      "enabledIf": "{{can('orders.order.write') && form._perm.update}}",
      "onClick": [ { "call": "saveOrder" }, { "navigate": "order-list" } ]
    } ]
  } ]
}
```

The `sensitive: true` field tells the runtime never to include that value in traces and logs (requirement RF-TEL-06).

**Example 3 — the menu.** A separate document lists the areas; each has its own three-level menu (group, subgroup, item). An operator sees only the areas and items they have permission for; a group with no visible items disappears. Two items can open the same screen with different parameters.

```json
{
  "schemaVersion": "1.0",
  "navigation": "invoicing",
  "default": "invoice-lookup",
  "areas": [
    { "id": "invoice-entry", "label": "Invoice entry", "requires": "invoices.invoice.create",
      "items": [ { "id": "new-invoice", "label": "New invoice", "children": [
        { "id": "sales-invoice", "label": "Sales invoice", "screen": "invoice-new", "params": { "type": "sales" } },
        { "id": "from-order", "label": "From order", "children": [
          { "id": "choose-order", "label": "Choose the order", "screen": "order-list", "requires": "orders.order.read" } ] } ] } ] },
    { "id": "expense-review", "label": "Expense review", "requires": "expenses.expense.read",
      "items": [ { "id": "expenses", "label": "Expenses", "children": [
        { "id": "to-review", "label": "To review", "screen": "expense-list", "params": { "status": "to-review" } },
        { "id": "reviewed", "label": "Reviewed", "screen": "expense-list", "params": { "status": "reviewed" } } ] } ] }
  ]
}
```

The areas in this example are just data: the platform has no built-in ones. Every screen has an address such as /expense-review/expense-list?status=to-review, so Back, bookmarks and shared links work.

## 10. Non-functional requirements

Quantitative targets (times, volumes) are not defined yet: they must be agreed before the detailed design phase.

| Area | Requirement |
| --- | --- |
| Security | Expressions run in a sandbox; restrictive CSP; no secrets in the JSON; protection against XSS and injection through data values |
| Privacy | Redaction of personal data in traces and logs; minimisation of collected data; GDPR compatibility |
| Performance | Initial load and rendering of long lists within targets to be defined; server-side paging by default |
| Accessibility | WCAG 2.2 level AA conformance for all base components |
| Compatibility | Up-to-date stack (Angular and TypeScript in their current versions); modern browsers officially supported |
| Maintainability | Versioned schema with automatic migrations; documented and tested components |
| Governability | JSON that can be versioned, compared and reviewed; publication history and rollback |
| Observability | Metrics and traces of the runtime itself, not only of the applications built with it |
| Testability | Ability to write declarative tests for applications, reusable in continuous integration |
| Internationalisation | Translatable texts and regional formats handled by the runtime |

## 11. Assumptions, open points and decisions to make

**Agreed assumptions:** the platform provides front end, REST interfaces and a reference implementation, not production business back ends; the identity provider is external and standard OIDC; OpenTelemetry is adopted for telemetry; the front end is never the enforcement point.

| # | Open point | Where it is decided |
| --- | --- | --- |
| 1 | Token handling: BFF or tokens in browser memory | Architecture document |
| 2 | Expression language: CEL, JSONata or JSONLogic | Architecture document |
| 3 | Exact format of the authorization contract (permission list, batch checks, per-row permissions) | Architecture document |
| 4 | Multi-tenant model and environments (development, testing, production) | Architecture document |
| 5 | Where and how definitions are stored (registry) and who can publish them | Architecture document |
| 6 | Runtime delivery form: standalone application or component embeddable in another shell | Architecture document |
| 7 | Base UI component library to adopt | Decided: NG-ZORRO (Ant Design for Angular); see ADR-11 in the architecture document and the guidelines |
| 8 | Quantitative performance and volume targets | With the client |
| 9 | Audit retention and immutability for regulated contexts | With the client |
| 10 | Simultaneous editing: not needed in the first version; locking will be introduced in later ones | Decided |
