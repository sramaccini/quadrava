# KinetiX: project rules

KinetiX is a low-code platform for business front ends defined in JSON (screens, data sources, actions, CEL expressions), with the Angular runtime, the visual editor **KinetiX Studio** and base services described by OpenAPI contracts. What the project does: [README.md](README.md). How to work on it in detail: [DEVELOPMENT-GUIDE.md](DEVELOPMENT-GUIDE.md). Status and next steps: [HANDOFF.md](HANDOFF.md).

This file collects the rules to follow at all times. Where the development guide goes into detail, only the pointer is given here.

## 1. Way of working

- **Do what was asked.** An unrequested change (a refactoring, a new dependency, a change in behaviour) is proposed first and waits for approval. Problems found along the way are reported separately, not fixed quietly.
- **Architectural review.** Inconsistencies, missing pieces and shortcomings against the requirements are pointed out explicitly, even when they are not the subject of the work.
- **Look at the code first.** Behaviour, defaults and names are checked in the sources before writing about them (in code, documents or schema descriptions).
- **Light, governable solutions.** Up-to-date stack, simple DSLs and expressions; no heavy rule engines or extra frameworks for small problems.
- **One task, one commit, one push.** In long work: one commit per component, with tests and a visual check before moving on to the next.
- **Report outcomes faithfully.** If a test fails or a check was skipped, say so.

## 2. Languages

| What | Language |
| --- | --- |
| Code, identifiers | English |
| Comments in code | as in the rest of the file (today mostly Italian) |
| All documentation: `README.md`, `DEVELOPMENT-GUIDE.md`, `HANDOFF.md`, `CLAUDE.md`, `docs/`, package READMEs | English |
| Descriptions in the JSON schemas (shown in the editor and in the showcase's «Aiuto») | Italian |
| Demo and example texts | Italian and English (`examples/i18n/it.json`, `en.json`) |
| Developer diagnostics (schema, expressions, `services`) | Italian, not translated |
| Commit messages | Italian |

Documents explain things simply, with figures and practical examples. New content goes into the relevant sections, not into isolated comparison paragraphs. File names in `docs/` are in English.

## 3. Commits and history

- Conventional Commits in Italian, with a scope when it helps: `feat(editor): …`, `fix(tabelle): …`, `docs(schema): …`. The body explains what changes and why.
- Commits are in the repository author's name only: **no trailers** (`Co-Authored-By`, automatic `Signed-off-by`, session identifiers), and no references to tools used to write code or text in commits, comments, documents or pull requests.
- Generated files are committed together with their source (`*.schema.json` with `*.schema.ts`, `validators.generated.ts` and `docs/schema-reference.md`).
- Tests and documentation updated in the same commit as the change.
- Never `push --force`, history rewrites or `reset --hard` on `main` without explicit confirmation. Before rewriting, `git fetch` and check that nobody else has pushed in the meantime.
- Never commit secrets, tokens, `.env` files, personal data, `dist/`, `data/`, `.stack/`.

## 4. Environment and commands

- Node 24 (`.nvmrc`). If the shell has another version: `eval "$(fnm env --shell bash)"; fnm use 24.21.0`. JDK 21 and Maven 3.9 only for `reference/`; Docker only for Keycloak in `idp/`.
- Work from `frontend/`. **`npm run build:libs` before running or testing the apps**: the `tsconfig` paths point to `./dist/*`, and a stale `dist` gives misleading errors. Restart the dev servers after `build:libs`.
- Tests of one project: `npx ng test <schema|expressions|core|components|services|runtime|editor> --watch=false`. Runtime specs need `npm run demo:prepare` first.
- Long commands (builds, test suites, `npm run stack`) run in the background.
- Full command table: DEVELOPMENT-GUIDE § 3.

### Before considering a piece of work finished

Run the checks affected by the change, and all of them before a pull request:

1. `npm run schema:check` and `npm run schema:docs:check` (if a schema changed: first `schema:sync` and `schema:docs`);
2. `npm run validate:examples`;
3. `npm run build:libs`;
4. tests of the projects touched (before a PR: `npm run test:libs` plus runtime and editor);
5. for the UI: a check in the browser on the demo (port 4300, `.claude/launch.json`) and, if needed, `npm run e2e`;
6. for `reference/`: `mvn verify`.

CI (`.github/workflows/ci.yml`) repeats the same checks: it must stay green.

## 5. Architecture: boundaries not to cross

- Dependencies only downwards, never cycles: `runtime → components → core → expressions / schema`, `runtime → services → core`, `editor → components → core`.
- `core` contains no NG-ZORRO code (except the screen shell's alert and typography); everything that uses NG-ZORRO lives in `components`.
- Everything external to the interpreter is a **port** (an abstract class used as a DI token). Components depend on the abstraction; the demo has fake implementations, `services` the real ones.
- Libraries know nothing about applications: no built-in use cases or domains.
- **Contract first.** Change `contracts/*.yaml`, validate it, then the code. Breaking changes need a new version path.
- The reference implementation (`reference/`) is not for production: it stays simple and labelled as such.
- Architectural decisions are recorded as ADRs.

## 6. JSON schemas

- The `*.schema.json` schemas are the only source. After every change: `npm run schema:sync`, the types in `schema/src/lib/types.ts`, `npm run schema:docs`. `*.schema.ts` and `validators.generated.ts` are never edited by hand.
- **Every property has a `description`**, short, accurate and in Italian: it appears in the editor's property panel, in the showcase's «Aiuto» and in the generated reference. Next to a `$ref` the description goes in the same object. State the default value when there is one («(3 se assente)»).
- No literal `<…>` in descriptions: they become HTML in the Markdown reference.
- Ajv in strict mode: `type: object` next to `properties`; a property in a `required` inside `if/then` or `anyOf` must be declared there too. Closed nodes with `additionalProperties: false` or `unevaluatedProperties: false`.
- Regular expressions are written from a script file, not from a shell heredoc (double backslashes get lost).

## 7. Components

The full path for a new component is in DEVELOPMENT-GUIDE § 4. In short: schema and type, standalone `OnPush` component with `input()`, registration in `STANDARD_COMPONENTS`, tests, showcase example with its texts in `it.json` and `en.json`, template and palette entry in the editor with `ed.type.<type>`, entry in `docs/component-catalogue.md`.

- Expressions are resolved only through the screen runtime (`runtime().text(...)`, `isVisible`, `isEnabled`); never evaluate strings yourself.
- Data logic lives in pure functions that can be tested without rendering (like `table-data.ts`, `chart-geometry.ts`).
- A component that writes to the state (`bind`) gives it an initial value in `ScreenRuntime.seedFilters`.
- A component that reads a data source uses `<lc-busy>` for waiting; no indicators of its own, no «no results» while loading.
- Single fields are drawn in `lc-field-control`, shared by `form`, `input` and `filterBar`: a new field type goes there once.
- The editor's property panel is generated from the schema: no hand-written form for a component.
- The known NG-ZORRO traps (HTML strings in modals and messages, icons to register, arrays and dates in `ngModel`, `nzScroll`, `[readonly]`, etc.) are in DEVELOPMENT-GUIDE § 5 and HANDOFF § 6: read them before touching a component.

## 8. Texts, languages and theme

- Never user-facing text written in a component. Texts from the JSON go through `runtime().text(value, scope)`; the platform's own through `inject(I18n).t('lc.…')` with the key in `components/src/lib/messages.ts`, in Italian **and** English.
- The result of a translation is always plain text.
- Never hard-coded colours: `var(--lc-*)` or the NG-ZORRO tokens. The only exception is the brand colours (`assets/brand/`), which do not follow the theme.

## 9. Security (non-negotiable)

- No HTML from data, translations or the JSON: no `innerHTML`, `bypassSecurityTrust*`, `eval`, `new Function`. Formatted text goes through `parseMarkdown` and `lc-markdown`; the Markdown dialect does not accept HTML.
- Dynamic strings towards `NzModalService` / `NzMessageService` only through a content component or `escapeHtml`.
- No secrets, tokens or personal data in JSON, logs, URLs, diagnostics or browser storage. Tokens stay in the BFF.
- Data-source URLs are relative to the same origin: the browser talks only to the BFF, which adds the user's token and protects writes with CSRF.
- Expressions are **fail-closed**: an error grants nothing, shows nothing and enables nothing; it goes to `RuntimeDiagnostics`, never into an exception during rendering.
- Permissions in the format `domain.resource.action`. The front end is not an authorization boundary: every rule also holds in the back end.

## 10. Tests

- One `*.spec.ts` next to the unit; describe behaviour, not implementation.
- Tests that render NG-ZORRO components use `provideLowcodeComponents()`; screens are tested with `renderScreen` (`components`) or `openShowcase` (`runtime`).
- `settle(fixture)` and auto-waiting assertions, never fixed timeouts.
- Showcase tests check that diagnostics stay empty: an expression error in an example is a bug.
- What jsdom cannot see (layout, real overlays, focus) is tested with Playwright in `frontend/e2e/`, with accessible locators (`getByLabel`, `getByRole`).
- Tests do not compare texts that change often (schema descriptions, documentation): they compare structure and behaviour.
- A fixed bug comes with a test that would have caught it.

## 11. Code quality

- Strict TypeScript; no `any` without a comment justifying it; `readonly`, signals and `computed`.
- Standalone components, `OnPush`, `input()` / `output()`, the new control flow (`@if`, `@for`).
- Accessibility: landmarks and labels, everything operable from the keyboard, no meaning conveyed by colour alone.
- New code looks like the code around it: same names, same density of comments, same idioms. No dead code, no premature abstractions.
- Formatting from `.editorconfig`: UTF-8, LF, two spaces (four in Java), final newline.
- New dependencies are proposed before being added.

## 12. Documentation

- A visible change updates the documents in the same commit: component catalogue, `docs/editor.md`, README or development guide as appropriate.
- `HANDOFF.md` is updated at the end of a block of work: test status, known limits, next steps.
- `docs/schema-reference.md` is not written by hand: it is generated with `npm run schema:docs`.
