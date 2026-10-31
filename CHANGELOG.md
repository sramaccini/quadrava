# Changelog

Notable changes of Quadrava, per release. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) (ADR-20).

What a version covers: the JSON languages (`frontend/projects/schema`), the libraries, the runtime and its container
image, Quadrava Studio and the contracts (`contracts/*.yaml`, which also carry their own version). Before 1.0.0 a minor
version may break compatibility; the entry then says so under **Changed** or **Removed**, with what to do.

How to release: DEVELOPMENT-GUIDE, «Releasing a version».

## [Unreleased]

### Added

- **Quadrava CLI** (`@sramaccini/quadrava-cli` on GitHub Packages, from this version): `quadrava validate` checks a
  project as the runtime and Studio read it, CEL expressions included; `quadrava publish` publishes it in a registry.
- `npm run conformance:authz` with `--cookie` and `--other-cookie`: checks a BFF that answers `/authz` itself on the
  session (the `cookieAuth` of `contracts/authz.yaml`), with the CSRF token on writes.

## [0.1.0] - 2026-10-31

The first versioned release.

### Added

- **Runtime**: screens, data sources, navigation, themes and translations defined in JSON, validated with the JSON
  Schemas and rendered with the standard component catalogue (forms, fields, tables, the data table for large volumes,
  charts, KPI tiles, wizard, tree, calendar, kanban, comments and more: `docs/component-catalogue.md`).
- **Expressions** in CEL, fail-closed, with permissions, the user, the state of the screen and the settings of the
  application.
- **Definitions** from the examples or from a registry (`contracts/registry.yaml`); services through a BFF
  (`contracts/bff.yaml`): session, permissions (`contracts/authz.yaml`), data, telemetry (`contracts/telemetry.yaml`).
- **Kanban**: order within columns, swimlanes, WIP limits, rich cards, columns from an expression or a data source.
- **Fields**: text fields with suggestions from a data source.
- **Comments**: a thread of comments with Markdown and mentions.
- **Live data sources** (ADR-19): a GET data source read again when an event stream on the same origin signals a change.
- **Tenant selection** in the shell, optional (ADR-18).
- **Quadrava Studio**: the visual editor of projects, screens, navigation, themes and translations, with previews
  rendered by the real runtime, the registry workflow and a desktop app for Windows, Linux and macOS (ADR-17).
- **Reference implementation** (`reference/`, not for production): BFF, registry, authorization and telemetry services
  in Spring Boot, with conformance kits for the contracts.
- **Distribution** (ADR-20): semantic versions, this changelog, a release workflow on GitHub Actions and a container
  image of the runtime (`ghcr.io/sramaccini/quadrava-runtime`) configured when it starts; the development realm and
  the reference BFF accept the image on `http://localhost:8090` for trying it against the local stack.
- **Demo back end of the stack**: the event stream `/api/streams/tasks`, so that behind the BFF the live boards of the
  showcase follow the changes of other users.

[Unreleased]: https://github.com/sramaccini/quadrava/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/sramaccini/quadrava/releases/tag/v0.1.0
