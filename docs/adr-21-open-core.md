# ADR-21: Open core — Quadrava CE and the commercial edition

Status: Accepted (1 November 2026)

## Context

Quadrava has been one repository under MPL-2.0: the language, the runtime, the libraries, the CLI, the contracts, the
reference services, and also the visual editor (Quadrava Studio, with its desktop app) and the reference registry. The
editor and a registry fit for production are what a company pays for; the language and the runtime are what makes
people adopt the platform. They need different licences, so they need to live apart.

What is already published stays under MPL-2.0: versions up to 0.2.1, their tags and source archives. Anyone holding a
copy keeps the rights MPL-2.0 gives. The split protects what is written from now on, not what is out already.

## Decision

**Two products from two repositories: Quadrava CE (open source, MPL-2.0) and the commercial edition (proprietary),
which builds on the published packages of CE.**

```
 sramaccini/quadrava  ── Quadrava CE, MPL-2.0, public ─────────────────────────────────────────────────────────
   schema  expressions  core  components  services   ──release──▶ @sramaccini/quadrava-<library> (npm)
   runtime (app, image, web build)                    ──release──▶ ghcr.io/…/quadrava-runtime, quadrava-runtime-web-x.y.z.tar.gz
   cli                                                ──release──▶ @sramaccini/quadrava-cli
   contracts/*.yaml (registry, bff, authz, telemetry, problem), the Studio ↔ runtime protocol, the conformance kits
   reference/: bff, authz, telemetry (not for production)
                                    │ packages at a fixed version
                                    ▼
 sramaccini/quadrava-studio  ── commercial edition, proprietary, private ───────────────────────────────────────
   editor (Quadrava Studio), desktop (Tauri app with the runtime web build), registry (Java)
```

- **What stays in CE**: the JSON languages and their schemas, the CEL expressions, the interpreter, the component
  catalogue, the service adapters, the runtime and its image, the CLI (`validate`, and `publish` towards any registry
  that follows the contract), every contract in `contracts/` — `registry.yaml` included — the protocol by which Studio
  hands a project to the runtime («Run project», ADR-16), the conformance kits (the registry kit too) and the reference
  BFF, authz and telemetry services. CE is complete on its own: a project is written by hand or with any tool, checked
  with the CLI, run by the runtime from files or from any registry that follows the contract.
- **What becomes commercial**: Quadrava Studio (`frontend/projects/editor`), its desktop app (`frontend/desktop`, ADR-17)
  and the registry (`reference/registry`), which the commercial edition takes towards production. Their tests, their
  end-to-end tests, the Desktop workflow and their documents (`docs/editor.md`, ADR-08, ADR-16 for the Studio side,
  ADR-17) move with them.
- **Names**: the open project is **Quadrava CE**; the commercial edition keeps the name of its repository, **Quadrava
  Studio**, until a final name is chosen. The technical names do not change (`quadrava-runtime`, `quadrava-cli`, the
  schema identifiers). The brand stays with its owner in both (TRADEMARKS.md).
- **CE libraries as packages.** Every release publishes the five libraries on GitHub Packages as
  `@sramaccini/quadrava-schema`, `-expressions`, `-core`, `-components` and `-services`, with the same version as the
  rest (ADR-20). The sources keep importing the short names (`core`, `schema/validation`…): a consumer installs the
  packages under those names with npm aliases (`"core": "npm:@sramaccini/quadrava-core@0.3.0"`), so that no import
  changes. Between themselves the libraries require the same version (`^x.y.z` peer dependencies, checked by
  `npm run release:check`). The `schema` package also carries the JSON schemas (`schemas/*.schema.json`): the registry
  validates with them, so they keep a single source. At 1.0.0 the packages move to npmjs under `@logicwarez` (ADR-20).
- **The runtime as a web build.** Every release also attaches `quadrava-runtime-web-x.y.z.tar.gz` to the GitHub release:
  the production build of the runtime with the examples, the same that goes into the image. The desktop app puts it
  under `/runtime/` for «Run project», adjusting its base address.
- **Versions.** The commercial edition has its own version and says which CE version it is built on. A CE change that
  breaks Studio is a breaking change of CE, with its line in the changelog.
- **The CE repository** loses the commercial parts in one minor release, without rewriting history: the code published
  so far stays where it is, under the licence it had.

## Consequences

- The public API of the libraries (`public-api.ts`) becomes a contract with the commercial edition: Studio must use
  nothing else.
- The commercial edition needs read access to the CE packages: with CE private, in the settings of each package
  («Manage Actions access») the `quadrava-studio` repository is given read access; with CE public, a token with
  `read:packages` is still needed by GitHub Packages.
- CE development without Studio: screens are written in JSON (the schemas give completion and checks in an editor such
  as VS Code), checked with `quadrava validate`, tried in the runtime from files. The local stack of CE runs without a
  registry, or with any registry that follows the contract.
- New code of Studio and of the registry is written only in the commercial repository.

## Alternatives considered

- **Rewriting the history of the CE repository** to remove Studio: it would not take back any right already given by
  MPL-2.0, and it would break tags, releases and every clone.
- **A git submodule or a copy of the CE sources in the commercial repository**: two sources of truth and no versions;
  the packages make the boundary visible and testable.
- **Renaming the imports to the scoped package names now**: hundreds of files touched twice (again at 1.0.0 for
  `@logicwarez`); npm aliases give the same result without it.
- **Keeping the registry contract commercial**: CE would lose its only way to serve published definitions, and the
  contract is what lets the commercial registry be replaced or checked; the implementation is what is sold.
