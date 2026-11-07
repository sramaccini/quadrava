# Quadrava — Implementation Guidelines

Simone Ramaccini · 7 October 2026, updated on 7 November 2026 (Quadrava CE 0.12.1)

> The rules are the target. Where a check is not automated yet, section 12 says so; the day-to-day path for a change
> (commands, a new component step by step, the known traps) is in [DEVELOPMENT-GUIDE.md](../DEVELOPMENT-GUIDE.md).
> Quadrava Studio and the registry are the commercial edition (ADR-21): their rules live in their own repository.

## 1. Purpose and audience

These guidelines explain **how** to build the platform consistently with the functional specification and the architecture document. They are meant for those who write code and those who write applications in JSON. The rules use "must" for what cannot be broken and "should" for good practices with justified exceptions.

| Audience | Main sections |
| --- | --- |
| Developers of runtime, libraries, CLI, BFF and reference services | 2, 3, 4, 7, 8, 9, 10, 11, 12 |
| Those adding components to the catalogue | 6, 8, 9, 10, 11 |
| Authors of applications in JSON | 5, 8, 9 |
| Code reviewers | 13 |

## 2. Stack and reference versions

The current stable version of every component is used; exact versions are pinned in the repository (`package.json`, `.nvmrc`, `pom.xml`) and updated through a regular process.

| Area | Choice | Notes |
| --- | --- | --- |
| Front end (runtime and libraries) | Angular 22.2, standalone components, signals, zoneless, TypeScript 6.0 in strict mode; Node 24 | No NgModule for new code. TypeScript 7 cannot be used: Angular 22.2 declares compatibility with 6.0 |
| UI library | NG-ZORRO 22.x (Ant Design for Angular), with Angular CDK and date-fns | For all standard components (ADR-11). Compatible with Angular 22; the platform theme reaches its --ant-\* variables through the provideLcComponents bridge. English and Italian locales and the date adapter included |
| Schema validation | JSON Schema with Ajv, validators precompiled (Ajv standalone) | The same schema serves editor, registry, CLI and runtime; no `unsafe-eval` in the browser |
| Expressions | CEL, `@marcbachmann/cel-js` 8 | With limits on size and depth of an expression (`expressions/engine.ts`) |
| Telemetry | OTLP/HTTP JSON export written in `services` (no OpenTelemetry SDK, ADR-05) | To the ingestion endpoint |
| Identity | OIDC with Authorization Code and PKCE; Keycloak 26.8.0 (latest version) | No provider-specific logic |
| Reference implementation (BFF, authz, telemetry ingestion) | Spring Boot 4.1.1 on Java 21, multi-module Maven, Spring Security as OAuth2 client and resource server | Not for production |
| Unit and component tests | Vitest through `ng test`, jsdom | One `*.spec.ts` next to the unit |
| End-to-end tests | Playwright in Chromium, Firefox and WebKit, with axe-core | Run against the demo |
| Code quality | Strict TypeScript, Prettier, `.editorconfig` | No linter yet: the security rules of section 10 are checked by review |
| Repository organisation | One repository, an Angular CLI workspace in `frontend` | No incremental build tool: the build of the libraries takes about a minute |
| Distribution | Container image of the runtime on GHCR, packages `@sramaccini/quadrava-*` on GitHub Packages (ADR-20, ADR-21) | One version for everything, `CHANGELOG.md` |

## 3. Repository structure

The structure makes the architectural boundaries visible: the front end in `frontend`, the contracts in `contracts`, the reference implementation in `reference`.

```text
/frontend         Angular workspace (projects in /frontend/projects)
  /projects
    /runtime      application that interprets the JSON (the demo and the BFF mode)
    /schema       JSON Schemas of screens, data sources, navigation, themes, messages, project; types and validators
    /expressions  sandboxed CEL evaluator and message format
    /core         interpreter, state, action engine, ports
    /components   catalogue on NG-ZORRO, shell (side menu, top bar)
    /services     real ports: session, authorization, data client, telemetry, live updates
    /cli          Quadrava CLI: validate and publish a project
  /e2e            Playwright suites
  /tools          scripts: schemas, examples, conformance kits, stack, release, notices
/contracts        OpenAPI specifications: bff, authz, telemetry, registry, problem
/reference        Spring Boot reference implementation (not for production)
  /bff            OIDC session, tokens server-side only, forwarding of the APIs
  /authz          example authorization service
  /telemetry      example ingestion endpoint
/docker           runtime container image
/idp              Keycloak for local development
/examples         the example project (screens, data sources, navigation, themes, translations), used in tests
/samples          sample projects for the runtime image
/docs             documentation and architectural decisions
```

**Dependency rules.** Dependencies go in one direction only: `runtime` → `components` → `core` → `expressions` / `schema`, and `runtime` → `services` → `core`. No library depends on an application. Today a cycle breaks the build of the libraries (each one is built from the `dist` of the ones below); an explicit check in the pipeline is still to be added.

**Contracts are the source.** A change starts from the OpenAPI specification in `contracts`, then the code. Types are not generated from them yet: what keeps code and contract together is the conformance kits (`npm run conformance`, in CI against the reference services) and the tests.

**The reference implementation is not a production service.** The product boundary, on the back-end side, is the REST interface plus this reference implementation. It must pass the same conformance tests that a customer back end must pass, and it is not designed for production loads or security requirements.

## 4. Code and naming conventions

| Scope | Convention |
| --- | --- |
| JSON keys | camelCase (for example `visibleIf`, `dataSources`) |
| Component types | camelCase (for example `filterBar`, `table`) |
| Screen identifiers | kebab-case (for example `order-list`) |
| Permissions | `domain.resource.action` in lower case (for example `orders.iban.write`) |
| TypeScript | Strict mode; `any` forbidden; errors as explicit types, not strings |
| Angular | Standalone components with `OnPush`; state with signals; no business logic in templates |
| Commits | Conventional Commits; one commit, one logical change |
| Branches and review | Review mandatory; changes to the schema or the contracts require a platform reviewer |

**Identifiers are forever.** A screen, component or action `id`, once published, does not change: telemetry, tests and comments are tied to it. Renaming means migrating.

## 5. Writing an application in JSON: authoring rules

A well-written application reads like a table of contents: screens with clear names, data declared at the top, simple logic. The rules below keep it governable.

| Prefer | Avoid | Why |
| --- | --- | --- |
| `can('orders.order.approve')` | Checking roles by hand, for example `user.roles` contains 'admin' | Roles change; permissions are the contract with the back end |
| Short, one-line expressions | Long expressions with many nested conditions | If it cannot be read at a glance, the logic belongs in the back end or in a data source |
| Data sources in a data sources document, used by reference (`{ "ref": "orders/list" }`) | Copying the same call into several screens | One fix, one place |
| `{{ t('orders.approve', 'Approve') }}` for texts | Texts written directly in the JSON | Allows internationalisation without changing the logic; the second argument is the text when the key is missing |
| `"sensitive": true` on personal fields | Forgetting the marking | Without it the value could end up in the logs |
| An explicit `onError` in every action that changes data | Leaving the error to the default behaviour | The user must know what happened and how to continue |
| Stable, meaningful `id`s | Random or reused identifiers | They serve telemetry, tests and comments |

**Never secrets in the JSON.** Keys, passwords and tokens never appear in the definition: only references to configuration owned by the BFF or the environment.

**Example.** The same button written badly and written well:

```json
// Avoid: role written by hand, error not handled
{ "label": "Approve",
  "visibleIf": "{{user.roles.contains('admin')}}",
  "onClick": [ { "call": "approveOrder" } ] }

// Prefer: permission, correct state, error handled
{ "id": "btn-approve", "label": "{{ t('orders.approve', 'Approve') }}",
  "visibleIf": "{{can('orders.order.approve') && row.status == 'submitted'}}",
  "onClick": [ { "call": "approveOrder", "args": { "id": "{{row.id}}" },
                 "onError": { "toast": "{{ t('errors.approval', 'Approval failed') }}" } } ] }
```

**Permission names.** Always `domain.resource.action`, exactly three parts in lower-case letters and digits (for example `orders.order.approve`, `orders.iban.read`). The schema rejects any other format. In row or form expressions the permissions of the single record are read as `row._perm.update` or `form._perm.update`.

**Themes.** A component never writes a fixed colour, font or size: it uses only the `--lc-*` variables (`--lc-color-*`, `--lc-font-family`, `--lc-font-size`, `--lc-radius`, `--lc-gap`, `--lc-control-height`). A new look is obtained with a theme document, not with extra CSS. The standard components are built with NG-ZORRO: their colours (primary, success, error, light or dark) come from the theme through the bridge in the components library, so the ant-\* classes are not overridden with custom CSS. The --lc-\* variables serve the parts written in house (screen shell, side menu, page header, spacing). The shell has its own: --lc-sider-\*, --lc-header-\*, --lc-page-header-\* and --lc-content-padding, declared in the theme's layout group with fallbacks derived from the base colours; side menu and page header read only those, and the theme's tone (light or dark) only selects the library's menu style. Colour and font values follow the schema patterns, which prevent CSS injection.

**Menu and areas.** The menu is a navigation document, not code: areas are parts of the application with their own menu, up to three levels deep. Permissions are checked with `requires` on the item (not with roles), `visibleIf` only for state conditions, and every `screen` must exist. Use-case, group and item ids are unique; `default` names an existing area.

## 6. Adding a component to the catalogue

A component is complete only when it has schema, code, tests, an example and documentation. The order below avoids discovering at the end that something is missing.

1. **Define the schema.** Add the node to `schema/src/lib/schemas/screen.schema.json` (every property with a `description`), its type in `types.ts`, then `npm run schema:sync` and `npm run schema:docs`. From here editor and validation work on their own.
2. **Write the Angular component.** Standalone, `OnPush`, with `input()`; built with NG-ZORRO components imported one module at a time (for example NzTableModule), not with hand-styled native elements; no direct HTTP calls; data logic in pure functions.
3. **Wire up permissions.** `visibleIf`, `hiddenIf` and `requires` are applied by `lc-node`; `enabledIf` and `readOnlyIf` are read through the screen runtime (`isEnabled`), not with logic of its own.
4. **Wire up telemetry.** Emit events only through the telemetry service; never write data values to the logs.
5. **Ensure accessibility.** Keyboard navigation, labels, contrast and announcements for assistive technologies according to WCAG 2.2 level AA.
6. **Register the component.** A single registration call, see below.
7. **Write the tests.** Component test, contract test between schema and component, and a case in the example applications.
8. **Add an example and the documentation.** A showcase example in `examples/screens` with its texts in `en.json` and `it.json`, the entry in `docs/component-catalogue.md` and a line in `CHANGELOG.md` (Studio adds its template in the commercial repository).
9. **Ask for review.** Mandatory, by a platform reviewer.

```ts
// components/src/lib/provide.ts: the standard catalogue
export const STANDARD_COMPONENTS: ComponentCatalog = { /* … */ kanban: KanbanComponent };

// an application adds its own components to the catalogue
provideLcComponents({ signature: SignatureComponent });
```

**Custom components from application teams.** They follow the same path; in addition they must be registered by the platform through review, not loaded from an address chosen by the application author.

**Component contract.** Every catalogue component declares the three inputs `node` (the JSON definition), `runtime` (the screen state) and `scope` (local variables such as `row` or `form`). Visibility is not implemented in the component: `lc-node` applies it (`visibleIf`, `hiddenIf`, `requires`), so every component inherits it the same way. To read permissions, data or navigation a component uses the core ports (`Authorization`, `DataClient`, `ScreenNavigator`), never concrete services.

**NG-ZORRO usage rules.** There are seven, and they come from problems found in tests. First: import the individual modules (`ng-zorro-antd/table`, `ng-zorro-antd/select`...), never a module that bundles them all. Second: every string passed to the library's modals, messages, notifications and tooltips is read as HTML; a text containing data values must therefore be shown through a content component that interpolates it (as `DialogConfirmation` does with `ConfirmMessageComponent`) or made harmless first (as `NzNotifier` does), never passed as is. Third: icons are registered one by one with `provideNzIcons` and the name comes only from the built-in set (`ICON_TYPES`), because an unregistered icon would be fetched from the network. Fourth: locale and date adapter are set once in `provideLcComponents`, not in individual components. Fifth: a control with `ngModel` must not receive a new object on every change-detection run (for example a `Date` created in the template), because it rewrites itself endlessly; compute it with a `computed`, and declare forms with `ngNoForm` so they are not attached to an `NgForm` that is not needed. Sixth: dropdowns, dialogs and messages live in the CDK overlay layer, outside the component: in tests look for them in `document.body` and clean up at the end of the test. Seventh: in jsdom the option list of `nz-select` is not rendered, because virtual scrolling sees zero height; in tests use `stubViewportHeight` and `openSelect`.

**Layout and colours: NG-ZORRO traps.** First: nz-layout stacks its children in a column and switches to a row only if it contains an nz-sider; since the side menu is our own component (lc-sidebar), the body container explicitly declares flex-direction: row, otherwise the menu ends up above the content. Second: Ant's tonal scale (generate) is designed for mid-light colours and on a dark green or red produces greyish tints; for success and error tags on the light theme the bridge therefore computes background and border by lightening the colour towards white. Third: a container with overflow-x: auto also shows a vertical scrollbar if its content is one pixel too tall, so pagination stays outside the scrolling area. Whoever adds components always checks their look in a real browser, light and dark, because jsdom tests do not cover it.

**Rules added with the October 2026 components.** Lists and dates passed to `ngModel` (multiple selection, ranges) are computed once per value with `computed`, otherwise change detection never stops. The default title of `nz-tree` inserts HTML while searching: titles are rendered with a template, as text. The language of date pickers follows `NzDateAdapter.setLocale`. An element meant for an NG-ZORRO slot (for example the filter in a table header) must be the only node of its `@if`. A component that writes to the state (`bind`) gives it an initial value in `ScreenRuntime`, so expressions and data sources never find a missing key; data logic lives in pure functions, testable without rendering. Specifications and limits of every component: `docs/component-catalogue.md`.

## 7. HTTP client, errors and state

| Rule | Detail |
| --- | --- |
| A single client | All calls go through the `DataClient` port (`HttpDataClient` and `lcHttpInterceptor` in `services`); components never use `fetch` or `HttpClient` (checked by review: there is no linter rule yet) |
| Uniform error model | Errors are Problems (RFC 9457, `contracts/problem.yaml`); the runtime keeps the status, the correlation identifier and the field errors (`DataError`), never the server's text |
| 401 | The session is marked expired and the browser goes to the login of the BFF (once: no loop) |
| 403 | Generic message; the permissions are reloaded when `X-Permissions-Version` changes. Target: a refresh on the 403 itself |
| 5xx and network errors | Generic message for the user; the correlation identifier goes to the technical report |
| Retries | None today. Target: only for reads, with back-off; never for writes without an idempotency key |
| Timeouts and cancellation | Reads in progress are cancelled when the screen is left or the request changes; no timeout of its own yet (the browser's applies) |
| Per-screen state | A store with signals, immutable; derived values with `computed`; no global state shared across screens |
| Data cache | Explicit, with invalidation declared by the action (`refresh`), never implicit |

## 8. Authentication and authorization: practical rules

| Rule | Reason |
| --- | --- |
| Tokens never go into `localStorage` or `sessionStorage` | They are readable by any injected script (XSS) |
| In BFF mode the session cookie is `HttpOnly`, `Secure` and `SameSite`, with CSRF protection on requests that change data | The browser must not be able to read the session or send it cross-site |
| In SPA mode (not implemented: BFF only today) the token would stay only in memory and be short-lived | Limits the damage in case of compromise |
| The front end never takes security decisions | Hiding is user experience; the back end always checks and filters |
| Conditions use permissions (`can`), never roles | Permissions are the contract with the back end |
| Capabilities are loaded after login and renewed when the permission version changes | Avoids both continuous requests and stale interfaces |
| For every permission condition there is a test with at least one user who has the permission and one who does not | An untested rule cannot be considered working |
| Logout clears the application state and the capabilities in memory | No data stays visible to the next user of the same browser |
| Data-source URLs are relative to the same origin; the BFF forwards only its configured prefixes to its configured hosts | Prevents a tampered JSON from sending data elsewhere |

## 9. Telemetry, logs and sensitive data

The ground rule: record **what happened**, never **which data was involved**. It is fine to know that the "approve" action failed on the orders screen; the customer's name is not written.

| Element | Rule |
| --- | --- |
| Console use | `console.log` and similar are forbidden in production code; the telemetry service is used |
| Trace names | `screen.open`, `action.run`, `http.client` (architecture § 8) |
| Allowed attributes | Technical identifiers: `lc.screen`, `lc.action` (step kinds and names), `lc.datasource`, HTTP method and status, outcome; never a URL with its values (data calls carry the data source name instead) |
| Data values | Never in attributes, error messages or logs |
| `sensitive` fields | Excluded at the source by the runtime; the ingestion endpoint applies a second redaction |
| Propagation | Every REST call carries `traceparent` and the context (screen, action) in the baggage |
| Log levels | Every technical report is `error`, `warn` or `info`; each environment chooses the lightest to send (`services.logLevel`, `warn` if absent) |
| Sampling | Configurable; errors are never discarded |
| Audit | Produced only by the back end; the front end neither writes audit nor replaces it with logs |

## 10. Security: rules that must not be broken

The JSON document is untrusted input. The rules below are checked by the pipeline, not only by review.

**Ajv and CSP.** Ajv generates the validator with `new Function`: in the browser the validators are compiled ahead of time (Ajv standalone, `validators.generated.ts`), so the CSP needs no `unsafe-eval`. Data-source URLs are relative: absolute URLs, `//`, `\` and `..` are rejected, and parameters are encoded with `encodeURIComponent`. Server errors are not shown to the user.

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

**Useful commands.** From the `frontend` folder: `npm run validate:examples` checks the example project with the Quadrava CLI (schemas, references, CEL expressions, translations); `npm run test:libs` runs the tests of the libraries and `npx ng test runtime --watch=false` those of the demo; `npm run e2e` the Playwright suites; the demo application starts with a single command and uses simulated data with three profiles (operator, manager, administrator) to try out permissions and menus. For every change to permissions or the menu, add a test that covers both the user with the permission and the one without.

**Component and showcase tests.** Every component has three levels of tests: the schema (`schema/new-components.spec.ts`), the component mounted in a screen with fake ports (`renderScreen` in `components/screen-testing.ts`) and the demo showcase (`openShowcase` in `runtime/showcase-testing.ts`), which also checks that technical diagnostics stay empty. What jsdom cannot see (layout, real focus, colours, timing) is checked in the browser on the demo before every commit; data-table performance has tests with 20,000 and 50,000 rows.

| Level | What it checks | Tools |
| --- | --- | --- |
| Unit | Expression evaluator, action engine, HTTP client, pure data functions | Vitest through `ng test` |
| Schema contract | Every component accepts and rejects exactly what its schema declares | Ajv and tests generated from the schemas |
| REST contract | Services follow the OpenAPI specifications; the reference implementation and customer back ends pass the same conformance tests | Conformance kits in `frontend/tools` (`npm run conformance`), written by hand from `contracts` |
| Component | Rendering, events, permissions, accessibility | Angular component tests, automatic accessibility checks |
| Runtime integration | Loading an example app, interpretation, calls to simulated APIs | Runtime with a simulated back end |
| End-to-end | Complete journeys on example apps, with the **permission matrix**: the same journey with different users, checking what they see and can do | Playwright |
| Security | XSS payloads in data, hostile JSON, edge-case expressions, disallowed hosts | Dedicated tests and automatic scans |
| Migrations | Every schema version migrates the example apps and the result stays valid and working (none yet: there is only version 1.0) | Regression tests on migrations |
| Telemetry | Traces carry the expected attributes and sensitive fields do not appear | Tests of `core` and `services` with a fake tracer and exporter |

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

**Where the pipeline stands (November 2026).** `.github/workflows/ci.yml` runs on every push and pull request; `release.yml` repeats it before publishing a `v*` tag.

| Stage | Today |
| --- | --- |
| Quality | Strict TypeScript in the build; versions and changelog consistent (`release:check`). No linter, no formatting check, no explicit check of the dependency rules |
| Unit and component tests | All the projects, including the runtime with the showcase |
| Schema and example validation | `schema:check`, `schema:docs:check`, `validate:examples` |
| REST contracts | `mvn verify` of the reference implementation and the conformance kits against it (`npm run conformance`); the BFF test reads `contracts/bff.yaml`, the other OpenAPI files have no automatic validation yet |
| Security | Licences of the dependencies inventoried (`notices:check`); no vulnerability scan, SBOM or secret scanning in the pipeline yet |
| End-to-end and accessibility | Playwright in three browsers with axe-core |
| Artefacts | Runtime image built and started in CI; published with the packages on a `v*` tag |

**Versions.** The platform follows semantic versioning (ADR-20), with one version for workspace and libraries; before 1.0.0 a minor version may break, and the changelog says how. `schemaVersion` has its own version: an incompatible schema change requires a major version and an automatic migration, both mandatory. The runtime supports the current and the previous version.

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
