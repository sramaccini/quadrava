# Quadrava documentation

For the project description and the contributor guide see [README.md](../README.md), [DEVELOPMENT-GUIDE.md](../DEVELOPMENT-GUIDE.md) and, for status and next steps, [ROADMAP.md](../ROADMAP.md).

Reference documents:

- [Functional specification](functional-spec.md): purpose, actors, scope, requirements, examples.
- [Architecture](architecture.md): components, security, architectural decisions (ADR-11: NG-ZORRO as the target UI library).
- [Implementation guidelines](implementation-guidelines.md): stack, structure, conventions, tests, release.
- [Dynamic texts and i18n](dynamic-texts-and-i18n.md): options considered for dynamic texts and i18n, the choice made (presentation functions and application catalogue) and the departures from it.
- [Component catalogue](component-catalogue.md): available components, with the specification of each.
- [Schema reference](schema-reference.md): all the properties of components, steps, fields and data sources, generated from `screen.schema.json` (`npm run schema:docs`).
- [ADR-15: declarative field validation](adr-15-declarative-field-validation.md): validators, the two syntaxes of the rules, built-in and national formats, safety.
- [ADR-16: running the project of Studio in the runtime](adr-16-run-project-from-studio.md): the «Run project» command, the handshake between the two windows, safety.
- [ADR-17: Quadrava Studio as a desktop application](adr-17-studio-desktop-app.md): Tauri around the web build, project folders on disk on Windows, Linux and macOS, builds on GitHub Actions.
- [Quadrava Studio](editor.md): how the visual screen editor is built, how it generates the property panel from the schema, the preview, the shortcuts, the limits.

The functional specification, architecture and implementation guidelines date from 7–13 October 2026: the most recent detail is in the component catalogue, in `editor.md` and in the code.

Architectural decisions (ADRs) are copied into this folder, one per file, when they move from "Proposed" to "Accepted".
