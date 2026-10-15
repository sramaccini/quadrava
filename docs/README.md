# Quadrava documentation

For the project description and the contributor guide see [README.md](../README.md) and [DEVELOPMENT-GUIDE.md](../DEVELOPMENT-GUIDE.md).

Reference documents:

- [Functional specification](functional-spec.md): purpose, actors, scope, requirements, examples.
- [Architecture](architecture.md): components, security, architectural decisions (ADR-11: NG-ZORRO as the target UI library).
- [Implementation guidelines](implementation-guidelines.md): stack, structure, conventions, tests, release.
- [Dynamic texts and i18n](dynamic-texts-and-i18n.md): options considered for dynamic texts and i18n, the choice made (presentation functions and application catalogue) and the departures from it.
- [Component catalogue](component-catalogue.md): available components, with the specification of each.
- [Schema reference](schema-reference.md): all the properties of components, steps, fields and data sources, generated from `screen.schema.json` (`npm run schema:docs`).
- [Quadrava Studio](editor.md): how the visual screen editor is built, how it generates the property panel from the schema, the preview, the shortcuts, the limits.

The functional specification, architecture and implementation guidelines date from 7–13 October 2026: the most recent detail is in the component catalogue, in `editor.md` and in the code.

Architectural decisions (ADRs) are copied into this folder, one per file, when they move from "Proposed" to "Accepted".
