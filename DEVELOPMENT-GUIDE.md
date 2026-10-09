# Development Guide

How to work on the LowCode Platform: set up, build, test, extend and contribute. For what the project is, read [README.md](README.md) first. Design rationale lives in the documents linked from [docs/README.md](docs/README.md).

## 1. Prerequisites and setup

* Node.js 22.22.3+ (or 24.15+) and npm.
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
editor  (scaffold)
```

* `schema`: JSON Schemas (`screen`, `theme`, `navigation`), Ajv validators, TypeScript types. The `.schema.ts` files are **generated** from the JSON by `tools/sync-schema.mjs`.
* `expressions`: the CEL evaluator. No Angular dependency.
* `core`: interpreter, action engine, ports, theme service, screen shell. **No UI-library code except the screen shell's alert and typography.**
* `components`: everything that depends on NG-ZORRO (standard components, side menu, confirmation dialog, notifier, theme bridge).
* `services`: production implementations of the ports.
* `runtime`: the demo application; wiring only, plus `demo/` fakes.

## 3. Daily commands

| Command | What it does |
| --- | --- |
| `npm run build:libs` | Builds all libraries in dependency order |
| `npm run test:libs` | Unit tests for every library |
| `npx ng test <project> --watch=false` | Tests of one project (`schema`, `expressions`, `core`, `components`, `services`, `runtime`, `editor`) |
| `npm run demo:prepare` | Copies `examples/` into `projects/runtime/public/examples` (git-ignored); required by the runtime specs and the demo |
| `npm run start:runtime` | Builds libs, prepares examples and serves the demo on port 4200 |
| `npm run schema:sync` / `schema:check` | Regenerate / verify the generated schema constants |
| `npm run validate:examples` | Validates every JSON in `examples/` against the schemas |
| `npx ng build runtime` | Production build (budgets: warning 2.5 MB, error 4 MB initial) |

Before opening a pull request, all of these must pass: `schema:check`, `validate:examples`, `build:libs`, `test:libs`, runtime tests, production build.

## 4. Adding or changing a component

Example: adding a `progress` node.

1. **Schema.** Add the node definition in `projects/schema/src/lib/screen.schema.json` (properties, `required`, `additionalProperties: false`), run `npm run schema:sync`, and add the TypeScript type next to the others.
2. **Component.** Create `projects/components/src/lib/progress.component.ts`: standalone, `ChangeDetectionStrategy.OnPush`, inputs through `input()` / `input.required()`. Resolve expressions through the screen runtime from `core`; never evaluate strings yourself.
3. **Register.** Add it to `STANDARD_COMPONENTS` (and export it from `public-api.ts`). Application-specific components are registered with `provideLowcodeComponents(extra)`.
4. **Tests.** Cover rendering, expression-driven state (`visibleIf`, `enabledIf`, `can()`), the fail-closed behaviour, and any action it triggers.
5. **Example.** Add the usage to a showcase screen in `examples/vetrina-*.json` and run `npm run validate:examples`.
6. **Docs.** Update the component catalogue and, if the language changed, the functional document.

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

The Italian locale is patched in `provide.ts` (`rangeQuarterPlaceholder` is missing upstream); keep that patch when upgrading.

## 6. Theming

* The theme JSON becomes `--lc-*` variables (shell, sidebar, spacing) in `core`.
* `theme-bridge.ts` converts the primary, success and error colours into the full `--ant-*` palette with `@ant-design/colors` `generate`. Only colour variables exist at run time in NG-ZORRO, so radius, density and typography tokens are not mapped.
* Dark themes add `<link id="lc-nz-dark-theme" href="nz-dark.css">`; the stylesheet is built by `angular.json` (bundle `nz-dark`, `inject: false`). Light themes remove it.
* Never hard-code colours in components: use `var(--lc-*)` or NG-ZORRO tokens.

## 7. Ports and dependency injection

Everything external to the interpreter is an abstract class used as a DI token: `Authorization`, `UserProvider`, `DataClient`, `ScreenNavigator`, `Notifier`, `RuntimeDiagnostics`, `Confirmation`. To add one: declare the abstract class in `core`, inject it where needed, provide a fake in `runtime/demo`, and a real implementation in `services` (or `components` when it is UI). Components must depend on the abstraction only.

## 8. Security rules (non-negotiable)

* No `innerHTML`, `bypassSecurityTrust*` or `eval`/`new Function` in application code.
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
* `select-testing.ts` provides `stubViewportHeight()` and `openSelect(...)`: `nz-select` options use CDK virtual scroll and render nothing in jsdom unless the viewport height is stubbed.
* Overlays: closed modals remain in the DOM during animation; select the **last** `.ant-modal-confirm`. Toasts are in `document.body .ant-message-notice`; tables exclude `.ant-table-placeholder` when counting rows.
* Test the configuration of what jsdom cannot verify (for example `nzAutofocus: 'cancel'`), and note the limit in the test.
* Runtime specs import the demo JSON, so run `npm run demo:prepare` first.

Layout, real focus and the dark theme are not covered by tests (the application shell follows the Ant Design Pro look: dark side bar, light top bar, card content); check them manually with `npm run start:runtime` for UI changes.

## 10. Code style

* TypeScript strict; no `any` without a comment; prefer `readonly`, signals and `computed`.
* Standalone components, `OnPush`, `input()` / `output()` functions, new control flow (`@if`, `@for`).
* Accessibility: landmarks and labels (`role`, `aria-label`), keyboard operability, no colour-only meaning.
* Code, identifiers and comments are in English. The user-facing demo strings and the Italian design documents under `docs/` are in Italian by project choice.
* Keep libraries free of application knowledge: there are no built-in use cases or domains.

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

* No real-browser check of the NG-ZORRO migration yet; the collapsed side menu now opens groups in a popup.
* `services` is not yet wired into `runtime`; the BFF lacks CSRF protection, API forwarding and a host allow-list.
* Java modules are not yet compiled in CI.
* Ajv needs `unsafe-eval` under CSP until validators are precompiled.
* `validate:examples` does not check CEL expressions.
