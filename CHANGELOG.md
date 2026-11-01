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
- **Form**: fields from a data source (`fieldsFrom`), for forms whose fields are data, like the custom fields of a
  project. One row per field with name, label, type, options and required; labels and options are shown as they are;
  `types` maps a type of the data to a model field (a lookup, for example); with `into` the values travel in an object
  of their own (`custom`), and the field errors of the service land on them (`/custom/contract`).
- **Studio and `quadrava validate`** check every data source a screen names, not only the `source` of the nodes:
  lookups, suggestions, `columnsFrom`, `fieldsFrom`, mentions, export, steps, remote rules and uploads. Renaming a
  data source in Studio updates all of them.
- `npm run conformance:authz` with `--cookie` and `--other-cookie`: checks a BFF that answers `/authz` itself on the
  session (the `cookieAuth` of `contracts/authz.yaml`), with the CSRF token on writes.

### Changed

- **Reference implementation** (`reference/`): groupId `com.logicwarez.quadrava.reference`, artifacts
  `quadrava-reference-authz`, `-bff`, `-registry` and `-telemetry`, Java packages `com.logicwarez.quadrava.reference.*`.
  Its configuration moves from `lowcode.*` to `quadrava.*` (for example `quadrava.registry.storage-dir`,
  `quadrava.bff.frontend-origins`) and the secret of the BFF client from `LOWCODE_BFF_CLIENT_SECRET` to
  `QUADRAVA_BFF_CLIENT_SECRET`: rename them in your own configuration. Rebuild with `mvn clean` (or `npm run stack --
  --rebuild`), so that the jars with the old names are gone.
- **Development realm**: `quadrava` instead of `lowcode` (`idp/realm-quadrava.json`), clients `quadrava-bff` and
  `quadrava-tools`; the issuer of the reference services and of the tools is `http://localhost:8180/realms/quadrava`.
  Recreate Keycloak: `cd idp && docker compose down && docker compose up -d`.
- **JSON schemas**: `$id` under `https://quadrava.logicwarez.com/schemas/` instead of `https://lowcode.example/schemas/`
  (the documents do not carry it, nothing to change in a project). The workspace is called `quadrava`.
- **Telemetry of the runtime**: `service.name` is `quadrava-runtime` and the application goes in the attribute
  `quadrava.app` (was `lowcode-runtime` and `lowcode.app`): update the filters of your collector.

### Fixed

- **Form**: after a call or a lookup of the same screen (a save refused by the service, for example) the form went
  back to the values loaded from its data source while still showing what the user had typed, so the next save sent
  the old values. Now only new data of the form's own source replaces them.
- **Runtime**: a BFF that answers `401` again right after a login (a call that always refuses the session, cookies
  blocked) no longer sends the page round in a circle with the identity provider: within 30 seconds of a login the
  runtime does not start another one and shows that signing in did not work, with the button to try again. Two new
  texts in the catalogue of the application: `app.loginRefusedTitle` and `app.loginRefusedText`.

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
