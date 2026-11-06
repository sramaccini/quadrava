# ADR-24: Links from the rows of a table

Status: Accepted (6 November 2026)

## Context

From a row of a table the user can run steps: a column with `onClick`, the actions of the row. A step calls a data
source, changes the state or opens a screen (`navigate`); none opens an address. Only the `link` component has an
`href`, written once, without the values of a row.

Request Q10 of OpenDevTrack shows the gap. An issue has attachments; each one is downloaded from
`GET /api/issues/{key}/attachments/{id}/content`, which the BFF serves with `Content-Disposition: attachment`. The
address depends on the row, and the browser must open it itself: a call made by the runtime gets the bytes, not a
download, and an answer of several megabytes does not belong in the state.

## Decision

**`href` on a column and on a row action: a relative path of the application, with the row in `row`.**

```json
{
  "type": "table",
  "source": "attachments",
  "columns": [{ "field": "filename", "href": "/api/issues/{{ params.issue }}/attachments/{{ row.id }}/content" }],
  "rowActions": [{ "label": "Download", "href": "/api/issues/{{ params.issue }}/attachments/{{ row.id }}/content" }]
}
```

```
row { id: 7 } ──▶ href template ──▶ /api/issues/QD-1/attachments/7/content ──▶ <a href> ──▶ browser ──▶ BFF (session cookie)
                    values encoded        only a path of the same origin        a real link: keyboard, new tab
```

- **The same rules as the URL of a data source.** The values of `{{ }}` are encoded, so a value cannot add segments
  or turn the path into another origin (`/{{ row.to }}` with `/evil.example` gives `/%2Fevil.example`); the result
  must be a path of the same origin, without `..`. The schema accepts only a template that starts with a single `/`.
- **Fail-closed.** An address that does not resolve (a missing value, another origin) opens nothing: the value stays
  text, the action is not drawn as a link, and the problem goes to the technical reports. A disabled action opens
  nothing.
- **A real link.** The cell and the action are an `<a href>`: they work from the keyboard, can be opened in a new tab
  and say what they are to a screen reader. The browser sends the session cookie of the BFF, as for every request of
  the same origin; with `Content-Disposition: attachment` it downloads the file and the screen stays where it is.
- **`href` or steps, not both**, on a column and on a row action. The other actions (of a form, of the selection, of a
  toolbar) keep their steps: they are not about a row.

## Alternatives

- **A step `open: { href }`.** More general, but a step is run by the runtime: the browser sees a click on a button,
  not a link, so no «open in a new tab», and the address is known only when it runs.
- **A call that saves the answer as a file.** It would read the whole file into the page, and needs its own way of
  naming and saving files; the browser already does it with a link.

## Consequences

- No new contract: the BFF already forwards `/api/` with the session; the runtime image passes bodies up to
  `QUADRAVA_MAX_BODY_SIZE` (request Q11), which does not limit downloads.
- `rowActions` items are `RowActionDefinition` in the types of `schema` (onClick or href); code that read `onClick`
  of a row action must handle its absence.
- The front end is not an authorization boundary: the BFF and the service still decide who may download what.
