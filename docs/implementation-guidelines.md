# LowCode Platform — Implementation Guidelines

Simone Ramaccini · 7 October 2026

## 1. Purpose and audience

These guidelines explain **how** to build the platform consistently with the functional specification and the architecture document. They are meant for those who write code and those who write applications in JSON. The rules use "must" for what cannot be broken and "should" for good practices with justified exceptions.

| Audience | Main sections |
| --- | --- |
| Developers of runtime, editor, BFF, registry | 2, 3, 4, 7, 8, 9, 10, 11, 12 |
| Those adding components to the catalogue | 6, 8, 9, 10, 11 |
| Authors of applications in JSON | 5, 8, 9 |
| Code reviewers | 13 |

## 2. Stack and reference versions

The current stable version of every component is used; exact versions are pinned in the repository and updated through a regular process. Items marked "to be confirmed" depend on decisions still open.

| Area | Choice | Notes |
| --- | --- | --- |
| Front end (runtime and editor) | Angular 22.2.1 (latest version), standalone components, signals, TypeScript 6.0.x in strict mode | No NgModule for new code. TypeScript 7 cannot be used: Angular 22.2 declares compatibility with 6.0 |
| UI library | NG-ZORRO 22.x (Ant Design for Angular), with Angular CDK and date-fns | For all standard components (ADR-11). Compatible with Angular 22; the platform theme reaches its --ant-\* variables through the provideLowcodeComponents bridge. Italian locale and date adapter included |
| Schema validation | JSON Schema with Ajv | The same schema serves editor, registry and runtime |
| JSON text editor | Monaco with an associated schema | Real-time suggestions and errors |
| Expressions | CEL | Confirmed: cel-js 8, after the proof of concept (architecture, section 5) |
| Telemetry | OpenTelemetry for JavaScript, OTLP/HTTP export | To the ingestion endpoint |
| Identity | OIDC with Authorization Code and PKCE; Keycloak 26.8.0 (latest version) | No provider-specific logic |
| Reference implementation (BFF, registry, authz, ingestion) | Spring Boot 4.1.1 on Java 21, multi-module Maven, Spring Security as OAuth2 client and resource server | Choice confirmed |
| End-to-end tests | Playwright | Run against the example applications |
| Code quality | ESLint and Prettier with platform rules | The security rules (section 10) are blocking |
| Repository organisation | Monorepo with an incremental build tool (for example Nx) | To be confirmed |

## 3. Repository structure

The structure makes the architectural boundaries visible: the front end in `frontend`, the contracts in `contracts`, the reference implementation in `reference`.

```text
/frontend         Angular workspace (projects in /frontend/projects)
  /projects
    /runtime      application that interprets the JSON
    /editor       visual editor
    /schema       JSON Schemas of screens, themes and navigation; generated types
    /core         interpreter, state, action engine
    /expressions  sandboxed expression evaluator
    /services     authentication, authorization, telemetry, HTTP client
    /components   catalogue: one folder per component
  /tools          example validation scripts
/contracts        OpenAPI specifications: authz, telemetry, registry
/reference        Spring Boot reference implementation (not for production)
  /bff            OIDC session, tokens server-side only
  /registry       application registry
  /authz          example authorization service
  /telemetry      example ingestion endpoint
/idp              Keycloak for local development
/examples         reference JSON applications, used in tests
/docs             documentation and architectural decisions
```

**Dependency rules.** Dependencies go in one direction only: `components` depends on `core`, `core` on `schema` and `expressions`. No library depends on an application. This rule is enforced by an automatic check in the pipeline, not left to review.

**Contracts are the source.** Client and server types for authz, telemetry and registry are generated from the OpenAPI specifications in `contracts`, never written by hand.

**The reference implementation is not a production service.** The product boundary, on the back-end side, is the REST interface plus this reference implementation. It must pass the same conformance tests that a customer back end must pass, and it is not designed for production loads or security requirements.

## 4. Code and naming conventions

| Scope | Convention |
| --- | --- |
| JSON keys | camelCase (for example `visibleIf`, `dataSources`) |
| Component types | camelCase (for example `filterBar`, `table`) |
| Screen identifiers | kebab-case (for example `ordini-elenco`) |
| Permissions | `domain.resource.action` in lower case (for example `ordini.iban.scrivi`) |
| TypeScript | Strict mode; `any` forbidden; errors as explicit types, not strings |
| Angular | Standalone components with `OnPush`; state with signals; no business logic in templates |
| Commits | Conventional Commits; one commit, one logical change |
| Branches and review | Review mandatory; changes to the schema or the contracts require a platform reviewer |

**Identifiers are forever.** A screen, component or action `id`, once published, does not change: telemetry, tests and comments are tied to it. Renaming means migrating.

## 5. Writing an application in JSON: authoring rules

A well-written application reads like a table of contents: screens with clear names, data declared at the top, simple logic. The rules below keep it governable.

| Prefer | Avoid | Why |
| --- | --- | --- |
| `can('ordini.ordine.approva')` | Checking roles by hand, for example `user.roles` contains 'admin' | Roles change; permissions are the contract with the back end |
| Short, one-line expressions | Long expressions with many nested conditions | If it cannot be read at a glance, the logic belongs in the back end or in a data source |
| `$ref` to a shared fragment | Copying the same block into several screens | One fix, one place |
| Translation keys for texts | Texts written directly in the JSON | Allows internationalisation without changing the logic |
| `"sensitive": true` on personal fields | Forgetting the marking | Without it the value could end up in the logs |
| An explicit `onError` in every action that changes data | Leaving the error to the default behaviour | The user must know what happened and how to continue |
| Stable, meaningful `id`s | Random or reused identifiers | They serve telemetry, tests and comments |

**Never secrets in the JSON.** Keys, passwords and tokens never appear in the definition: only references to configuration owned by the BFF or the environment.

**Example.** The same button written badly and written well:

```json
// Avoid: role written by hand, error not handled
{ "label": "Approva",
  "visibleIf": "{{user.roles.contains('admin')}}",
  "onClick": [ { "call": "approvaOrdine" } ] }

// Prefer: permission, correct state, error handled
{ "id": "btn-approva", "label": "@ordini.approva",
  "visibleIf": "{{can('ordini.ordine.approva') && row.stato == 'inviato'}}",
  "onClick": [ { "call": "approvaOrdine", "args": { "id": "{{row.id}}" },
                 "onError": { "toast": "@errori.approvazione" } } ] }
```

**Permission names.** Always `domain.resource.action`, exactly three parts in lower-case letters and digits (for example `ordini.ordine.approva`, `ordini.iban.leggi`). The schema rejects any other format. In row or form expressions the permissions of the single record are read as `row._perm.update` or `form._perm.update`.

**Themes.** A component never writes a fixed colour, font or size: it uses only the `--lc-*` variables (`--lc-color-*`, `--lc-font-family`, `--lc-font-size`, `--lc-radius`, `--lc-gap`, `--lc-control-height`). A new look is obtained with a theme document, not with extra CSS. The standard components are built with NG-ZORRO: their colours (primary, success, error, light or dark) come from the theme through the bridge in the components library, so the ant-\* classes are not overridden with custom CSS. The --lc-\* variables serve the parts written in house (screen shell, side menu, page header, spacing). The shell has its own: --lc-sider-\*, --lc-header-\*, --lc-page-header-\* and --lc-content-padding, declared in the theme's layout group with fallbacks derived from the base colours; side menu and page header read only those, and the theme's tone (light or dark) only selects the library's menu style. Colour and font values follow the schema patterns, which prevent CSS injection.

**Menu and use cases.** The menu is a navigation document, not code: use cases are functional areas with their own menu, up to three levels deep. Permissions are checked with `requires` on the item (not with roles), `visibleIf` only for state conditions, and every `screen` must exist. Use-case, group and item ids are unique; `default` names an existing use case.

## 6. Adding a component to the catalogue

A component is complete only when it has schema, code, tests, an example and documentation. The order below avoids discovering at the end that something is missing.

1. **Define the schema.** Create the component's JSON Schema in `libs/schema`: properties, events, insertion points. From here editor and validation work on their own.
2. **Write the Angular component.** Standalone, `OnPush`, with inputs derived from the schema; built with NG-ZORRO components imported one module at a time (for example NzTableModule), not with hand-styled native elements; no direct HTTP calls.
3. **Wire up permissions.** Support `hiddenIf`, `readOnlyIf` and `enabledIf` through the platform's shared directive, not with logic of its own.
4. **Wire up telemetry.** Emit events only through the telemetry service; never write data values to the logs.
5. **Ensure accessibility.** Keyboard navigation, labels, contrast and announcements for assistive technologies according to WCAG 2.2 level AA.
6. **Register the component.** A single registration call, see below.
7. **Write the tests.** Component test, contract test between schema and component, and a case in the example applications.
8. **Add an example and the documentation.** A commented JSON fragment in `examples`.
9. **Ask for review.** Mandatory, by a platform reviewer.

```ts
registerComponent({
  type: 'filterBar',
  schema: filterBarSchema,        // the component's JSON Schema
  component: FilterBarComponent,  // standalone Angular component
  since: '1.0'                    // schema version in which it appears
});
```

**Custom components from application teams.** They follow the same path; in addition they must be registered by the platform through review, not loaded from an address chosen by the application author.

**Component contract.** Every catalogue component declares the three inputs `node` (the JSON definition), `runtime` (the screen state) and `scope` (local variables such as `row` or `form`). Visibility is not implemented in the component: `lc-node` applies it (`visibleIf`, `hiddenIf`, `requires`), so every component inherits it the same way. To read permissions, data or navigation a component uses the core ports (`Authorization`, `DataClient`, `ScreenNavigator`), never concrete services.

**NG-ZORRO usage rules.** There are seven, and they come from problems found in tests. First: import the individual modules (`ng-zorro-antd/table`, `ng-zorro-antd/select`...), never a module that bundles them all. Second: every string passed to the library's modals, messages, notifications and tooltips is read as HTML; a text containing data values must therefore be shown through a content component that interpolates it (as `DialogConfirmation` does with `ConfirmMessageComponent`) or made harmless first (as `NzNotifier` does), never passed as is. Third: icons are registered one by one with `provideNzIcons` and the name comes only from the built-in set (`ICON_TYPES`), because an unregistered icon would be fetched from the network. Fourth: locale and date adapter are set once in `provideLowcodeComponents`, not in individual components. Fifth: a control with `ngModel` must not receive a new object on every change-detection run (for example a `Date` created in the template), because it rewrites itself endlessly; compute it with a `computed`, and declare forms with `ngNoForm` so they are not attached to an `NgForm` that is not needed. Sixth: dropdowns, dialogs and messages live in the CDK overlay layer, outside the component: in tests look for them in `document.body` and clean up at the end of the test. Seventh: in jsdom the option list of `nz-select` is not rendered, because virtual scrolling sees zero height; in tests use `stubViewportHeight` and `openSelect`.

**Layout and colours: NG-ZORRO traps.** First: nz-layout stacks its children in a column and switches to a row only if it contains an nz-sider; since the side menu is our own component (lc-sidebar), the body container explicitly declares flex-direction: row, otherwise the menu ends up above the content. Second: Ant's tonal scale (generate) is designed for mid-light colours and on a dark green or red produces greyish tints; for success and error tags on the light theme the bridge therefore computes background and border by lightening the colour towards white. Third: a container with overflow-x: auto also shows a vertical scrollbar if its content is one pixel too tall, so pagination stays outside the scrolling area. Whoever adds components always checks their look in a real browser, light and dark, because jsdom tests do not cover it.

**Rules added with the October 2026 components.** Lists and dates passed to `ngModel` (multiple selection, ranges) are computed once per value with `computed`, otherwise change detection never stops. The default title of `nz-tree` inserts HTML while searching: titles are rendered with a template, as text. The language of date pickers follows `NzDateAdapter.setLocale`. An element meant for an NG-ZORRO slot (for example the filter in a table header) must be the only node of its `@if`. A component that writes to the state (`bind`) gives it an initial value in `ScreenRuntime`, so expressions and data sources never find a missing key; data logic lives in pure functions, testable without rendering. Specifications and limits of every component: `docs/component-catalogue.md`.

## 7. HTTP client, errors and state

| Rule | Detail |
| --- | --- |
| A single client | All calls go through the platform's HTTP client; direct use of `fetch` or `HttpClient` in components is blocked by a code-analysis rule |
| Uniform error model | Every error has `code`, `message`, `correlationId` and, where useful, `details`; the interface never shows the raw technical error |
| 401 | The client starts session renewal or returns to sign-in; it does not show a generic error |
| 403 | Uniform message, permission refresh request, re-evaluation of the interface |
| 5xx and network errors | Generic message for the user; the correlation identifier is visible for support |
| Retries | Only for read requests, with increasing back-off and a maximum number of attempts; never for operations that change data, unless there is an idempotency key |
| Timeouts and cancellation | Every call has a configurable timeout and is cancelled when the screen is left |
| Per-screen state | A store with signals, immutable; derived values with `computed`; no global state shared across screens |
| Data cache | Explicit, with invalidation declared by the action (`refresh`), never implicit |

## 8. Authentication and authorization: practical rules

| Rule | Reason |
| --- | --- |
| Tokens never go into `localStorage` or `sessionStorage` | They are readable by any injected script (XSS) |
| In BFF mode the session cookie is `HttpOnly`, `Secure` and `SameSite`, with CSRF protection on requests that change data | The browser must not be able to read the session or send it cross-site |
| In SPA mode the token stays only in memory and is short-lived | Limits the damage in case of compromise |
| The front end never takes security decisions | Hiding is user experience; the back end always checks and filters |
| Conditions use permissions (`can`), never roles | Permissions are the contract with the back end |
| Capabilities are loaded after login and renewed when the permission version changes | Avoids both continuous requests and stale interfaces |
| For every permission condition there is a test with at least one user who has the permission and one who does not | An untested rule cannot be considered working |
| Logout clears the application state and the capabilities in memory | No data stays visible to the next user of the same browser |
| Calls to hosts not in the allowed list are rejected | Prevents a tampered JSON from sending data elsewhere |

## 9. Telemetry, logs and sensitive data

The ground rule: record **what happened**, never **which data was involved**. It is fine to know that the "approve" action failed on the orders screen; the customer's name is not written.

| Element | Rule |
| --- | --- |
| Console use | `console.log` and similar are forbidden in production code; the telemetry service is used |
| Trace names | `screen.open`, `action.run`, `http.client`, with agreed attributes |
| Allowed attributes | Technical identifiers: `screenId`, `componentId`, `actionId`, `appVersion`, `schemaVersion`, outcome |
| Data values | Never in attributes, error messages or logs |
| `sensitive` fields | Excluded at the source by the runtime; the ingestion endpoint applies a second redaction |
| Propagation | Every REST call carries `traceparent` and the context (screen, action) in the baggage |
| Log levels | `error` and `warn` always sent; `info` and `debug` according to per-environment configuration |
| Sampling | Configurable; errors are never discarded |
| Audit | Produced only by the back end; the front end neither writes audit nor replaces it with logs |

## 10. Security: rules that must not be broken

The JSON document is untrusted input. The rules below are checked by the pipeline, not only by review.

**Ajv and CSP.** Ajv generates the validator with `new Function`: in the browser it must be compiled ahead of time (Ajv standalone) or validation must happen on publication, otherwise `unsafe-eval` is needed in the CSP, which is not allowed in production. Data-source URLs are relative: absolute URLs, `//`, `\` and `..` are rejected, and parameters are encoded with `encodeURIComponent`. Server errors are not shown to the user.

| Rule | How it is checked |
| --- | --- |
| `eval`, `new Function` and equivalent techniques are forbidden | Blocking code-analysis rule |
| `innerHTML` and Angular's sanitisation bypass functions are forbidden, unless an exception is approved | Code-analysis rule; every exception has a comment and a reviewer |
| Data values are always inserted as text, NG-ZORRO included: modals and messages interpret strings as HTML, so components or harmless text are passed | Tests with XSS payloads in the example applications |
| Restrictive CSP, without `unsafe-eval` and without inline scripts | Automatic test on the headers of the runtime and of the reference implementation |
| No loading of scripts, styles or components from addresses given in the JSON | Schema validation and regression tests |
| Calls only to hosts in the allowed list | HTTP client tests with disallowed hosts |
| Limits on JSON size and depth and on expression evaluation time | Tests with hostile documents; exceeding the limits is a handled error, not a hang |
| Dependencies analysed and inventoried | Vulnerability analysis and SBOM on every build; severe vulnerabilities block the release |
| No secrets in the repository | Secret scanning on commits |
| Custom components only after review | The catalogue accepts registrations only from approved code, never at run time |

## 11. Test strategy

The example applications in `examples` are the common thread: every test level uses them, so a change that breaks them shows up immediately.

**Useful commands.** From the `frontend` folder: `npm run validate:examples` validates screens, themes and `navigation.json`; `npm test` runs all the tests; the demo application starts with a single command and uses simulated data with three profiles (operator, manager, administrator) to try out permissions and menus. For every change to permissions or the menu, add a test that covers both the user with the permission and the one without.

**Component and showcase tests.** Every component has three levels of tests: the schema (`schema/new-components.spec.ts`), the component mounted in a screen with fake ports (`renderScreen` in `components/screen-testing.ts`) and the demo showcase (`openShowcase` in `runtime/showcase-testing.ts`), which also checks that technical diagnostics stay empty. What jsdom cannot see (layout, real focus, colours, timing) is checked in the browser on the demo before every commit; data-table performance has tests with 20,000 and 50,000 rows.

| Level | What it checks | Tools |
| --- | --- | --- |
| Unit | Expression evaluator, action engine, schema migrations, HTTP client | Angular and TypeScript unit test frameworks |
| Schema contract | Every component accepts and rejects exactly what its schema declares | Ajv and tests generated from the schemas |
| REST contract | Services follow the OpenAPI specifications; the reference implementation and customer back ends pass the same conformance tests | Contract tests generated from `contracts` |
| Component | Rendering, events, permissions, accessibility | Angular component tests, automatic accessibility checks |
| Runtime integration | Loading an example app, interpretation, calls to simulated APIs | Runtime with a simulated back end |
| End-to-end | Complete journeys on example apps, with the **permission matrix**: the same journey with different users, checking what they see and can do | Playwright |
| Security | XSS payloads in data, hostile JSON, edge-case expressions, disallowed hosts | Dedicated tests and automatic scans |
| Migrations | Every schema version migrates the example apps and the result stays valid and working | Regression tests on migrations |
| Telemetry | Traces carry the expected attributes and sensitive fields do not appear | Tests with a simulated collector |

## 12. Continuous integration, versioning and release

| Pipeline stage | What it does | Blocks the release? |
| --- | --- | --- |
| Quality | Code analysis, types, formatting, dependency rules between libraries | Yes |
| Unit and component tests | See section 11 | Yes |
| Schema and example validation | Examples are valid against the current schema and migrate from previous versions | Yes |
| REST contracts | Valid OpenAPI specifications; contract tests on the reference implementation | Yes |
| Security | Dependency analysis, secret scanning, SBOM generation | Yes for high severity |
| End-to-end and accessibility | Journeys on example apps and accessibility checks | Yes |
| Artefact publication | Packages, images and documentation, with version and hash | No, it happens once the pipeline is green |

**Versions.** The platform follows semantic versioning. `schemaVersion` has its own version: an incompatible schema change requires a major version and an automatic migration, both mandatory. The runtime supports the current and the previous version.

**Contracts and reference implementation.** The OpenAPI specifications and the reference implementation are versioned together: a contract change without updating the reference implementation and the conformance tests is not accepted.

**Release notes.** Every release lists schema changes, new permissions, contract changes and migration instructions.

**Environments.** Development, testing and production; promoting a version is explicit and tracked. New and risky features are switched on with configuration toggles, not with separate releases.

## 13. Review checklist

To be used for every change request; an item that does not apply is marked as such, not skipped.

**Schema and language**

- [ ] Schema changes are compatible, or have a major version and a migration
- [ ] Published `id`s have not been changed
- [ ] Examples are updated and valid

**Security and permissions**

- [ ] No `eval`, `innerHTML` or sanitisation bypass without an approved exception
- [ ] No tokens in browser storage and no secrets in the code or the JSON
- [ ] Conditions use `can`, not roles; there are tests with and without the permission
- [ ] Personal fields are marked `sensitive`

**Behaviour**

- [ ] All calls go through the HTTP client; 401, 403 and network errors handled
- [ ] Every action that changes data has an `onError`
- [ ] Telemetry present, with no data values in the attributes

**Quality**

- [ ] Tests added at the right levels (section 11)
- [ ] Accessibility checked for new components
- [ ] If a REST contract changes: specification, reference implementation and conformance tests updated together
- [ ] Documentation and release notes updated
