# Quadrava component catalogue

List of the components of the Quadrava JSON language, with the specification of those added in October 2026. Every new component has unit tests in the `components` library and an example in the demo **showcase** (area «Component showcase»).

Rules common to all components, new ones included:

- texts go through `{{ }}` and the translation catalogue (`t('key', 'fallback')`); Quadrava's own strings are `lc.*` keys in English and Italian;
- no HTML from data or translations: values are always shown as text;
- expressions are **fail-closed**: if a condition cannot be evaluated, the component is hidden or disabled;
- `visibleIf`, `hiddenIf`, `tooltip` apply to every node (the `lc-node` container applies them); `grow`, `span` and `region` apply to every node inside a layout container (§ 2.21);
- colours and sizes only from the theme (`var(--lc-*)` or the NG-ZORRO tokens);
- a component that reads a data source shows the wait with the shared `lc-busy` indicator (§ 2.27), not with one of its own.

## 1. Available

| Node / element | What it is for |
| --- | --- |
| `section` | Panel with a title that groups other nodes, stacked or side by side (`layout: "row"`). |
| `box`, `grid`, `border` | Layout containers without a frame (a `box` can have a dashed one): row or column, column grid, north/south/west/east/centre regions (§ 2.21). |
| `input` | A standalone field (text box, drop-down, date…) bound to the screen state (§ 2.20). |
| `image`, `link` | Image with alternative text; link to a screen or to an https address (§ 2.23). |
| `progress` | Progress bar or circle (§ 2.23). |
| `timeline`, `kanban` | Events in date order; cards in columns that can be moved (§ 2.24). |
| `comments` | Thread of comments in Markdown with a box for writing and @mentions; with `kindField` a feed of activity that mixes comments, field changes and work logs, with filter chips and the order chosen by the user (§ 2.30). |
| `text` | Plain text (with line breaks), heading (`style: heading`) or formatted text (`format: markdown`, § 2.26). |
| `button` | Button that runs a sequence of steps (`onClick`). |
| `menuButton` | Button that opens a menu of fixed items, items from a data source and dividers; label and tone are expressions (§ 2.34). |
| `filterBar` | Filter bar that writes to the screen state (`bind`). |
| `table` | Table with server-side paging, cell formats, sorting, selection and bulk actions, action menu, expandable rows, clickable cells, totals and highlighted rows (§ 2.37). |
| `dataTable` | Data table with filters, sorting and grouping in the page, and highlighted rows (§ 2.18, § 2.37). |
| `serverDataTable` | The same data table, but filters, sorting, groups, totals and pages are computed by the service; highlighted rows as in § 2.37 (§ 2.19). |
| `form` | Form with validation, conditional fields, column grid, fields from a data source (§ 2.31) and actions, also under a single field (§ 2.38); with `edit: "inline"` each field is changed on its own, click to edit (§ 2.36). |
| `tabs` | Tabs, each with its own nodes. |
| `detail` | Read-only detail card (label and value; a `format: markdown` field is shown formatted). Its columns follow its own width, not the window: three, two from 840 px down, one under 480 px with the label above the value, so it fits a narrow side column. |
| `alert` | In-page message (info, success, error), also formatted (`format: markdown`). |
| `stats` | Indicators (KPIs). |
| `wizard` | Step-by-step procedure. |
| `tree` | Tree view. |
| `calendar` | Monthly calendar with events. |
| `chart` | Bar, line and pie charts. |
| `squareChart` | Compact square columns for dense time-series data. |
| `graph` | Nodes and connections laid out from left to right, for example a workflow (§ 2.35). |
| Fields | `text`, `number`, `select`, `checkbox`, `date`, `textarea`, `datetime`, `radio`, `switch`, `multiselect`, `tags`, `lookup`, `file`, `repeater`, `richtext` (§ 2.26). |
| Cell formats | `text`, `number`, `currency`, `percent`, `date`, `datetime`, `relative`, `boolean`, `badge`, `markdown`. `relative` shows a date as its distance from now («3 days ago», «yesterday», «in 2 hours»; with `Intl.RelativeTimeFormat`, in the language of the user), with the full date as tooltip and, for screen readers, as text; a date without time counts calendar days («today»). In tables and in the detail. |
| Steps | `set`, `call` (with `as` and `onError`), `refresh`, `navigate`, `toast`, `confirm`, `dialog`, `view` and `popover` (§ 2.11), `validate`, `print`, `export`, `download`, `copy` and `copyLink` (§ 2.22), `if` and `run`; named sequences in `actions` (§ 2.22b). |
| Shell | Side bar (`lc-sidebar`, with search, counters and keyboard support: § 2.25; the application brand is inserted with an `lcBrand` element, otherwise logo and name), messages of the user (`lc-notification-bell`: a bell with the unread count and the list, ADR-22; `notificationsOf` keeps only well-formed messages), user menu (`lc-user-menu`: an icon with the initial and the name in its tooltip, application items (in the runtime those of `userMenu` of the navigation, ADR-25), optional groups of choices with the current one ticked in each, such as the tenants of ADR-18 and the operational roles of ADR-28 (`choices` takes one group or a list, `choiceIn` gives the group of a choice), and sign-out last, after a confirmation; a menu for screen readers and the keyboard: arrows, Home, End, Enter, Esc, submenus with the side arrows), responsive top bar, `lc-quadrava-wordmark` logotype, syntax-highlighted code viewer `lc-code-view`, tools in section headers (`SectionTools`: «JSON» and «Aiuto» in the demo showcase). |

## 2. Added in October 2026

Built in this order, one per commit, each with tests (schema, component and showcase) and an example in the demo showcase: «Advanced tables» (1–5), «Fields and forms» (6–11), «Tabs, detail and messages» (12), «Dashboard» (13, 17), «Procedures and views» (14–16), «Data table» (18, 19), «Standalone fields» (20, 22), «Layout containers» (21, 22), «Tasks and progress» (23, 24), «Validation» (26); the menu (25) is visible in all of them.

| # | Component | Area | Status |
| --- | --- | --- | --- |
| 1 | Column sorting | table | done |
| 2 | Row selection and bulk actions | table | done |
| 3 | Row action menu | table | done |
| 4 | Expandable detail rows | table | done |
| 5 | Number format, clickable cells, totals row | table | done |
| 6 | New field types: text area, date and time, radio, switch, multiple selection | fields | done |
| 7 | Field with search on a data source (lookup); text with suggestions | fields | done |
| 8 | File upload | fields | done |
| 9 | Column grid in the form | form | done |
| 10 | Repeatable rows in the form | form | done |
| 11 | Dialog with a form (`dialog` step) | actions | done |
| 12 | Tooltip in the detail card | detail | done |
| 13 | Indicators (KPIs) | visualisation | done |
| 14 | Step-by-step procedure (wizard) | layout | done |
| 15 | Tree view | visualisation | done |
| 16 | Calendar | visualisation | done |
| 17 | Charts | visualisation | done |
| 18 | Data table with filterable, sortable and groupable columns | table | done |
| 19 | Service-driven data table, for very large tables | table | done |
| 20 | Standalone fields (`input`) and row sections | fields | done |
| 21 | Layout containers: box, grid, border (with resizable sides) | layout | done |
| 22 | validate, print, export (CSV) and download steps | actions | done |
| 23 | Image, link, progress | visualisation | done |
| 24 | Timeline and kanban | visualisation | done |
| 25 | Menu: search, counters, keyboard | shell | done |
| 26 | Declarative validation: constraints, formats, rules across fields, warnings | fields | done |
| 27 | Comments: thread, Markdown, mentions | visualisation | done |

### 2.1 Column sorting

Columns with `sortable: true` show the sort arrows. A click cycles through ascending, descending and no sorting. The title of a sortable column is a button, so sorting also works from the keyboard (Tab, then Enter or Space); the header tells screen readers the current order (`aria-sort`).

```json
{ "type": "table", "source": "orders",
  "sort": { "bind": "state.sorting", "default": { "field": "number", "direction": "desc" } },
  "columns": [{ "field": "number", "sortable": true }, { "field": "customer", "sortable": true }] }
```

- **Table without server-side paging**: it sorts the loaded rows in the page (numbers as numbers, texts according to the active language, ISO dates as text).
- **Table with `paging: server`**: the service does the sorting. The table writes `{ "field": …, "direction": "asc" | "desc" }` to the state given by `sort.bind` and goes back to the first page; the data source reads it in its parameters, for example `"sort": "{{state.sorting.field}}"`. Without `bind` the rows of the current page are sorted in the page only, with a technical diagnostic.
- `sort.default` applies when the screen opens (the state already exists at the first load, as for filters).

### 2.2 Row selection and bulk actions

```json
{ "type": "table", "source": "invoices",
  "selection": { "bind": "state.selected", "key": "id" },
  "bulkActions": [{ "label": "{{ t('invoices.send_selected', 'Send the selected ones') }}",
    "enabledIf": "{{ size(selection) > 0 }}",
    "onClick": [{ "call": "sendMany", "args": { "ids": "{{ selection.map(r, r.id) }}" } }, { "refresh": "invoices" }] }] }
```

- One checkbox per row and one in the header (all / none / partial).
- The `bind` state holds the **keys** of the chosen rows; bulk actions see the whole rows in the `selection` variable.
- The selection applies to the loaded rows: keys that no longer appear (new page, new filters) are removed.
- Above the table appears the bulk-action bar with the number of chosen rows.

### 2.3 Row action menu

`rowActionsInline: n` shows only the first `n` visible actions as buttons; the others go into a «⋯» menu (`0` = all in the menu). Without the property they all stay buttons. Disabled actions stay visible and disabled in the menu too.

A row action runs steps (`onClick`) or, with `href`, is a link to a relative path of the application built from the row, for example to download an attachment ([ADR-24](adr-24-links-from-the-rows.md)):

```json
"rowActions": [{ "label": "Download", "href": "/api/issues/{{ params.issue }}/attachments/{{ row.id }}/content" }]
```

The values of `{{ }}` are encoded and the address must stay a path of the same origin; one that does not resolve, or a disabled action, opens nothing.

### 2.4 Expandable detail rows

```json
"expand": { "components": [{ "type": "text", "text": "{{ row.note }}" }] }
```

Every row has a button that opens below it an area with the nodes of `expand.components`, which see the row as `row` (tables, details and buttons too). `expand.expandIf` (an expression with `row`) decides which rows can be expanded.

### 2.5 Number format, clickable cells, totals row

- Cell format `number` with `decimals` (0 to 6), right-aligned and with digit grouping according to the language.
- `onClick` on a column (`table`, `dataTable`, `serverDataTable`): the value becomes a link that runs the steps with the row in `row` (for example `navigate` to the detail).
- `href` on a column (`table`, `dataTable`, `serverDataTable`): the value becomes a link to a relative path of the application built from the row, as for the row actions above; not together with `onClick`. A service that answers with `Content-Disposition: attachment` makes the browser download the file without leaving the screen.
- `aggregate` on a column (`sum`, `avg`, `min`, `max`, `count`): a totals row appears at the bottom of the table, computed on the loaded rows and with the same format as the column.

### 2.6 New field types

| Type | Value | Notes |
| --- | --- | --- |
| `textarea` | text | `rows` (visible rows, 2 to 20) |
| `datetime` | `YYYY-MM-DDTHH:mm` (local time) | date picker with time |
| `radio` | one of the values of `options` | radio buttons, translated with `optionKey` |
| `switch` | `true` / `false` | switch |
| `multiselect` | list of values from `options` | becomes a list parameter in filters |
| `tags` | list of free texts | `options` and `suggest` only suggest; becomes a list parameter in filters |

They work in the form and, where it makes sense, in the filter bar (`switch`, `multiselect`, `tags`, `datetime`, `radio`; there `textarea` behaves like `text`).

**A value outside the options.** When the value of a `select`, `multiselect` or `radio` field is not among its `options` (for example a status a service added, `triage` where the options are `open` and `closed`), it is shown as it is, after the options, translated with `optionKey` like them (`values.status.triage`) or else as the value itself, instead of an empty field. The user can keep it or choose an option; the service checks the value anyway.

**A value that cannot be part of a key.** Catalogue keys hold letters, digits, `.`, `-` and `_`: an option such as `*` (every event) has no `<prefix>.<value>` key. `optionKeys` gives such values a key of their own, before `optionKey`; on table columns and stats `valueKeys` does the same before `valueKey`. A missing key shows the value.

```json
{ "name": "events", "type": "multiselect", "options": ["*", "push", "tag"],
  "optionKey": "values.events", "optionKeys": { "*": "values.events.all" } }
```

**Tags** (`tags`): a free list of short texts, such as the labels of an issue. Enter or a comma adds what was typed; the
cross on a tag removes it. The tags are kept without spaces at the ends and each once, without regard to case (the
first one written wins). `options` (translated with `optionKey`) and `suggest` (a GET data source asked with
`search` while typing, as for a text field, § 2.7) are only suggestions: any text is a tag. `minItems` and
`maxItems` count the tags (at `maxItems` the field takes no more). In tables and in the detail a list of texts is shown
as its items separated by commas.

```json
{ "name": "labels", "type": "tags", "label": "Labels", "maxItems": 5,
  "suggest": { "source": "labels", "valueField": "name" } }

"labels": { "type": "rest", "method": "GET", "url": "/api/labels", "params": { "q": "{{ search }}" } }
```

```
Labels
┌──────────────────────────────────────────────┐
│ [fragile ×] [gift ×] ref▌                    │
│   ┌ refrigerated ┐  ← rows of «suggest»       │
└──────────────────────────────────────────────┘
```

### 2.7 Field with search on a data source (lookup)

```json
{ "name": "customer", "type": "lookup",
  "lookup": { "source": "customers", "valueField": "id", "labelField": "name", "minChars": 2 } }
```

```json
"customers": { "type": "rest", "method": "GET", "url": "/api/customers",
             "params": { "q": "{{ search }}", "id": "{{ lookupKey }}" } }
```

As the user types, the field runs the `source` data source (GET) with the `search` variable and offers the returned rows. The field value is `valueField`; the text shown is `labelField`. Searches in quick succession are merged (300 ms wait) and an old response does not overwrite a newer one.

If the current value is not among the known rows (for example in an edit form) and the data source uses `{{ lookupKey }}`, the field asks the service for that value's row, once, and shows its text instead of the id. The field's requests do not change the rows the same data source shows to other components (`ScreenRuntime.query`).

#### Text with suggestions (`suggest`)

A `lookup` chooses a row; a `text` field with `suggest` stays **free text** and only proposes words to insert, which is what a query language needs (`status:paid customer:smith`).

```json
{ "name": "query", "type": "text",
  "suggest": { "source": "queryWords", "valueField": "insert", "labelField": "label", "descriptionField": "example" } }

"queryWords": { "type": "rest", "method": "GET", "url": "/api/invoices/query-words",
                "params": { "q": "{{ search }}", "word": "{{ word }}" } }
```

```
status:paid cust▌            → word = "cust", search = "status:paid cust"
   ┌──────────────────────────────┐
   │ customer:   customer:smith   │   ← label, then description
   └──────────────────────────────┘
status:paid customer:▌        → Enter: only the word at the cursor is replaced
```

- The data source sees the whole text in `search` and the **word at the cursor** in `word`: the characters between spaces, brackets (`( ) [ ] { }`) and commas around it. The service decides what to suggest, so the language is entirely its own.
- Each row gives the text inserted (`valueField`, `value` if absent), the text in the list (`labelField`, the inserted text if absent) and an optional `descriptionField` in a lighter colour. Texts from the service are shown as they are; empty and repeated values are left out.
- A chosen suggestion replaces the word at the cursor (`replace: "all"`: the whole text) and the cursor goes right after it. The suggestion is inserted as it is: a service that wants a space after a complete term includes it (`"status:paid "`).
- The request starts once the word has `minChars` characters (1 if absent; 0 also at the start of a word). Requests in quick succession are merged (300 ms) and an old response never replaces a newer one; an error of the data source shows no suggestions.
- Keyboard: the arrows open the list and move in it, Enter inserts (without submitting the form), Escape closes only the list (not the dialog around it). The field is a WAI-ARIA combobox (`aria-expanded`, `aria-activedescendant`, a listbox of options) and the number of suggestions is announced.
- Only for `text` fields; it works in forms, in standalone fields and in the filter bar.

### 2.8 File upload

```json
{ "name": "attachment", "type": "file", "accept": ".pdf,image/*", "maxSizeKb": 20480, "upload": "uploadAttachment" }
```

- One file per field; `accept` and `maxSizeKb` are checked before anything is sent.
- With `upload` the file is sent immediately to the data source (POST). In **multipart** (`uploadAs: "multipart"`, the default) the file travels as a file in the `file` part of the request, up to 100 MB; the `file` variable has `name`, `type` and `size`, and every body entry (for example `"body": "{{ file }}"`) becomes a text part. In **base64** (`uploadAs: "base64"`) the content is in `file.content` inside the JSON body, up to 10 MB.
- The field value becomes `{ name, type, size }` plus the service response (for example the `id`). Without `upload` the value also contains `content` (base64, up to 10 MB).
- The `DataClient` port receives the file in `DataRequest.file`; `HttpDataClient` sends it as `FormData`.
- The file name is always shown as text.

As a **drop zone**, like the attachments of an issue: `display: "dropzone"` draws an area with a dashed border across
the cell, the button in the middle with the `label` as its text (the label is not repeated above the area) and `hint`
under it. A file dragged over the area highlights it; dropped, it is checked and uploaded as a chosen one (the first, if
more are dropped). From the keyboard the button works as always.

```json
{ "type": "input", "field": { "name": "attachment", "type": "file", "label": "Add attachment", "display": "dropzone",
  "hint": "Up to 25 MB per file", "maxSizeKb": 25600, "upload": "uploadAttachment" } }
```

The showcase «Fields and forms» has one in the section «File upload».

### 2.9 Column grid, field widths and flow in the form

`columns` (1–4) on the form and `span` on the field (how many columns it takes). When space is tight (less than 600 px of available width) the form goes back to one column.

**Width of a field.** Without `width` the input takes its whole cell. With `width` it takes one of four sizes, the same in every screen, and never more than the room it has:

| `width` | About | For |
| --- | --- | --- |
| `xs` | 8 characters (6rem) | postcodes, short codes, quantities |
| `s` | 16 characters (10rem) | dates, amounts, codes |
| `m` | 32 characters (18rem) | names, emails |
| `l` | 48 characters (28rem) | addresses |
| `full` | the whole line, with no limit | long texts: a description, notes |

The theme can change the sizes with the variables `--lc-field-width-xs`, `-s`, `-m` and `-l`. `width` holds for the fields of `form`, `input` and `filterBar` too (a filter with `width` loses the minimum of 160 px of the filters).

**Flow** (`"layout": "flow"`): the fields sit one after the other on the same line while they fit, then on the next, each as wide as its `width`; a field without `width` takes a whole line (its input at most 560 px), one with `"width": "full"` the whole line with no limit. `columns` and `span` are not used. The showcase «Forms» has an example.

```json
{ "type": "form", "layout": "flow", "fields": [
  { "name": "code", "type": "text", "label": "Code", "width": "xs" },
  { "name": "issueDate", "type": "date", "label": "Issue date", "width": "s" },
  { "name": "amount", "type": "number", "label": "Amount", "width": "s" },
  { "name": "customer", "type": "text", "label": "Customer", "width": "m" },
  { "name": "description", "type": "textarea", "label": "Description" } ] }
```

```
Code      Issue date     Amount         Customer
[______]  [__________]  [__________]   [__________________]
Description
[____________________________________________________]
```

### 2.10 Repeatable rows in the form

```json
{ "name": "rows", "type": "repeater", "minRows": 1, "maxRows": 20,
  "fields": [{ "name": "description", "type": "text", "required": true }, { "name": "amount", "type": "number" }] }
```

The value is a list of objects. Every row has its own fields (`text`, `number`, `select`, `checkbox`, `date`, `textarea`, `switch`, `lookup`, `file`; no nested rows) and a button to remove it; below is the button to add one. Required flags and validation rules apply row by row; rules and data sources of the row's fields see the row as `item`. A form with repeatable rows widens up to 880 px.

### 2.11 Dialog with a form, window with components, panel under a button

New `dialog` step: it opens a window with a form; the `onSubmit` steps see the values in `form`. If they succeed the window closes and the sequence continues; if the user cancels, the sequence stops silently (like `confirm`).

```json
{ "dialog": { "title": "{{ t('orders.add_note', 'Add a note') }}",
  "fields": [{ "name": "testo", "type": "textarea", "required": true }],
  "initial": { "testo": "{{ row.note }}" },
  "submitLabel": "{{ t('common.save', 'Save') }}",
  "onSubmit": [{ "call": "salvaNota", "args": { "id": "{{ row.id }}" } }] } }
```

The window is a new core port (`FormDialog`), implemented with the NG-ZORRO modal; without an implementation the step does not proceed (fail-closed).

The `view` step opens a window that shows components instead of a form: tables, details, charts, buttons. They read the
data sources and the state of the screen and see the variables of the place where the step runs (`row`, `item`,
`form`). The sequence goes on when the user closes the window (its button, Esc, the cross or a click outside).

```json
{ "view": { "title": "{{ t('issues.workflow', 'Workflow') }}", "size": "large",
  "components": [{ "type": "table", "source": "transitions", "columns": [{ "field": "name" }, { "field": "to" }] }] } }
```

| Property | What it does |
| --- | --- |
| `title` | Title of the window, plain text or an expression. |
| `size` | `small` 520 px, `medium` 720 px (default), `large` 960 px, `full` almost the whole screen. |
| `components` | The nodes shown, as in a screen. Those that write to the state (`bind`) get their initial value when the window opens. |
| `closeLabel` | Text of the button that closes it («Close», translated, if absent). |

The port is `ViewDialog`; without an implementation the step does not go on. A data source used only by a remote rule
of a field inside the window is loaded when the screen opens, as an ordinary data source. The menu of the status in the
showcase «Tasks and progress» opens the workflow of the task in a window.

The `popover` step opens a small panel with a form right under the button that ran it, instead of a window in the middle
of the screen: the «Flag added» of the issue trackers, with an optional comment. For an item of a «…» menu the panel
opens under the «…» button. Like `dialog`, the `onSubmit` steps see the values in `form`; if they succeed the panel
closes and the sequence goes on. The cross, Esc or a click outside close it and stop the sequence silently: the steps
before it stay done (the flag stays added).

```json
{ "label": "Add flag", "icon": "flag", "onClick": [
  { "call": "flag", "args": { "key": "{{ params.key }}" } },
  { "popover": { "title": "Flag added", "icon": "flag", "tone": "danger",
    "fields": [{ "name": "comment", "type": "textarea", "label": "Optional: let your team know why" }],
    "submitLabel": "Add comment", "submitEnabledIf": "{{ isValid(required, form.comment) }}",
    "onSubmit": [{ "call": "addComment", "args": { "text": "{{ form.comment }}" } }] } }] }
```

| Property | What it does |
| --- | --- |
| `title` | Title of the panel, plain text or an expression. |
| `icon`, `tone` | Icon before the title and its colour (`danger` for a red flag; neutral if absent). |
| `fields`, `initial`, `submitLabel`, `onSubmit` | As in `dialog`. |
| `submitEnabledIf` | The confirm button is enabled only while it is true; it sees `form`, where an empty field is `null`: `isValid(required, form.comment)` keeps it disabled while the comment is empty. |

The panel is a dialog for screen readers, named by its title; the focus starts on the first field, stays inside the
panel while it is open and goes back to the button when it closes. The port is `FormPopover` (on the CDK overlay); without
it, or without a button to point at, the step opens as a `dialog` window. In the showcase «Tasks and progress»,
«Add flag» in the «…» menu opens it.

### 2.12 Tooltip in the detail card

`detail` fields with a `tooltip` show the help icon next to the label, as in forms.

### 2.13 Indicators (KPIs)

```json
{ "type": "stats", "source": "summary",
  "items": [{ "label": "{{ t('dashboard.revenue', 'Revenue') }}", "field": "revenue", "format": "currency", "tone": "success" },
            { "label": "{{ t('dashboard.to_collect', 'To collect') }}", "value": "{{ state.total }}", "format": "number" }] }
```

A row of tiles with a label and a large value. The value comes from a field of the data source (`field`) or from an expression (`value`), with the same formats as columns. They are laid out in a grid and wrap on narrow screens.

### 2.14 Step-by-step procedure (wizard)

```json
{ "type": "wizard", "bind": "state.step",
  "steps": [{ "label": "Data", "components": [...], "nextIf": "{{ state.customer != null }}" },
            { "label": "Riepilogo", "components": [...] }] }
```

Step indicator at the top, content of the current step, Back and Next buttons. The current step lives in the state (`bind`), so a button can also move it with `set`. Next is disabled until `nextIf` is true. The last step has no Next: it usually contains the form or the confirmation button.

### 2.15 Tree view

```json
{ "type": "tree", "source": "categories", "keyField": "id", "labelField": "name", "childrenField": "children",
  "bind": "state.category", "searchable": true, "onSelect": [{ "toast": "{{ row.name }}" }] }
```

The data source returns the root nodes with their children nested. Choosing a node writes its key to the state (`bind`) and runs `onSelect` with the node in `row`. With `searchable` a field appears that highlights and opens the matching branches.

From the keyboard it follows the WAI-ARIA «tree» pattern: up and down arrows between visible nodes, right opens the branch or enters the first child, left closes the branch or goes up to the parent, Home and End, Enter or Space choose; only one node at a time is reachable with Tab.

### 2.16 Calendar

```json
{ "type": "calendar", "source": "deadlines", "dateField": "data", "labelField": "title",
  "badgeField": "status", "badges": { "overdue": "danger", "paid": "success" },
  "bind": "state.month", "onSelect": [{ "navigate": "invoice-detail", "params": { "id": "{{ row.id }}" } }] }
```

Month view with the events in the days (at most three, then «+n»). When the month changes the calendar writes `YYYY-MM` to the `bind` state, so the data source can load just that month. A click on an event runs `onSelect` with the event in `row`.

### 2.17 Charts

```json
{ "type": "chart", "kind": "bar", "stacked": true, "source": "sales", "categoryField": "month", "categoryFormat": "month",
  "series": [{ "field": "sales", "label": "Sales" }, { "field": "purchases", "label": "Purchases", "tone": "danger" },
             { "field": "margin", "label": "Margin", "kind": "line", "axis": "right" }],
  "format": "currency", "rightFormat": "percent", "height": 280 }
```

`bar`, `line` and `pie` types, drawn in SVG by Quadrava (no external library) with the theme colours. Bars can be side by side or stacked (`stacked`, negatives downwards); a series can sit on a second axis on the right (`axis: "right"`, format `rightFormat`) and have its own type (`kind`), for combined charts such as bars plus a line. Every chart has a legend, values on hover and, for accessibility, an equivalent table readable by screen readers.

Many categories (thirty days, a sprint at half width) do not crowd the axis: the labels that do not fit are left out, keeping the first, the last and others at an even step between, and dates that do not fit in full pass to day and short month («7 Oct»). The full label stays in the tooltip and in the table. The showcase dashboard has an example with thirty days.

```
thirty days in 600 px, axis:      1 Oct   4 Oct   7 Oct   11 Oct   14 Oct   17 Oct   20 Oct   24 Oct   27 Oct   30 Oct
tooltip of the point of the 12th: 12/10/2026 · Issued: 2
```

For a denser activity view, `squareChart` draws small square columns for each category, with their height scaled to the largest value. It accepts one row per category and a numeric `valueField`; `categoryFormat`, `format`, `currency`, `decimals`, `height` and `caption` control labels and presentation. Every square has a value tooltip and the chart includes an equivalent table for assistive technology.

```json
{ "type": "squareChart", "source": "activity", "categoryField": "day", "categoryFormat": "date",
  "valueField": "activated", "format": "number", "height": 220, "caption": "Daily activations" }
```

### 2.18 Data table

Table for analysing an already loaded set of rows in the page: every column can be filtered, sorted and used for grouping.

```json
{ "type": "dataTable", "source": "transactions", "pageSize": 15, "groupBy": ["account"],
  "columns": [
    { "field": "data", "format": "date", "sortable": true, "filter": "date" },
    { "field": "account", "sortable": true, "filter": "select", "groupable": true },
    { "field": "category", "filter": "select", "groupable": true },
    { "field": "description", "filter": "text" },
    { "field": "amount", "format": "currency", "sortable": true, "filter": "number", "aggregate": "sum" }] }
```

- **Per-column filters** from the header: `text` (contains), `select` (choice among the values present), `number` (from / to), `date` (range). A button clears all filters. The filter of a column is a button named after it («Filter Status»): Enter opens its panel with the focus on the first field, Esc closes it and the focus goes back to the button.
- **Sorting** on one column at a time, as in the table.
- **Grouping**: the user picks one or more `groupable` columns (in order) from a selector above the table; `groupBy` is the initial choice. Every group has a header with the value, the number of rows and the totals of the columns with `aggregate`; groups open and close.
- Grand total at the bottom, in-page paging (`pageSize`), row actions as in the table.
- Filters, sorting and groups work on the loaded rows. Only the current page is rendered, cell texts are computed once per row and the text filter waits for a 200 ms pause: with 20,000 rows, in the browser, sorting takes about 20 ms and filtering about 40 ms on top of the wait. For stores of hundreds of thousands of rows, use `serverDataTable` (§ 2.19).

### 2.19 Service-driven data table

The same interface as the data table (header filters, sorting, group choice, totals, row actions), but the browser receives only the visible page and groups: all computation belongs to the service. Suited to stores of hundreds of thousands or millions of rows.

```json
"dataSources": { "search": { "ref": "transactions/search" } },
// datasources/transactions.json: "search": { "type": "rest", "method": "POST", "url": "/api/transactions/search", "body": "{{ request }}" }
...
{ "type": "serverDataTable", "source": "search", "groupBy": ["account"], "pageSize": 15,
  "defaultSort": { "field": "data", "direction": "desc" }, "bind": "state.transactionSearch",
  "columns": [ ...as in the dataTable... ] }
```

**Request.** The table runs the data source with the `request` variable (usually the whole body of a POST):

```json
{ "page": 0, "size": 15,
  "sort": { "field": "data", "direction": "desc" },
  "filters": [ { "field": "description", "kind": "text", "text": "affitto" },
               { "field": "account", "kind": "select", "values": ["Cassa"] },
               { "field": "amount", "kind": "number", "from": 100, "to": null },
               { "field": "data", "kind": "date", "from": "2026-01-01", "to": "2026-03-31" } ],
  "groupBy": ["account"], "groupPath": [ { "field": "account", "value": "Cassa" } ],
  "distinct": "category" }
```

- `groupPath` tells which open group is being read; empty at the first level.
- `distinct` is present only when the table asks for the values of a choice filter: the response is `{ "values": [...] }`, computed with the other filters applied.

**Response.**
- If `groupPath` is shorter than `groupBy`, the service responds with the groups of the next level: `{ "groups": [ { "value": "Cassa", "count": 50000, "aggregates": { "amount": -1234.5 } } ], "total": 4, "totals": { "amount": ... } }`.
- Otherwise it responds with the rows: `{ "items": [...], "total": 50000, "totals": { "amount": ... } }`.
- `total` is the number of groups or rows at that level (used for paging); `totals` are the grand totals of the columns with `aggregate`, shown at the bottom.

**Behaviour.**
- Sorting, filters and groups go back to the first page; the text filter waits for a 300 ms pause. A response arriving after a newer one is discarded.
- An open group loads its rows (or subgroups) in pages, with the «Mostra altre» (show more) button. The `refresh` step on the data source and a page change keep groups open and reload their content up to the point reached.
- `bind` writes `{ sort, filters, groupBy }` to the state, useful for exports or other calls with the same criteria.
- The service must check the fields it receives (only known columns in `sort`, `filters`, `groupBy`, `distinct`) and cap `size`: the request comes from the browser and cannot be trusted.

**Selection and bulk actions** (`selection`, `bulkActions`), as in the `table` (§ 2.2): a checkbox per row, one in the header
for the visible rows (those of the page and of the open groups), the count of the chosen rows and «Svuota la selezione»
(clear selection) above the table. The selection stays across pages, sorting, groups and open groups: the keys are in the
`bind` state and the bulk actions see the whole rows in `selection`, also those of other pages. A change of the filters
empties it, since the chosen rows may no longer be among those shown. The showcase «Datatable» has an example.

### 2.20 Standalone fields (input)

A field used on its own, outside forms and filters: text box, number, drop-down, multiple choice, radio buttons, checkbox, switch, date, date and time, search (lookup), file, repeatable rows. The value lives in the **screen state**, so data sources, expressions, texts and steps read it like any other state.

```json
{ "type": "input", "bind": "state.filtro.type", "default": "sales",
  "field": { "name": "type", "type": "select", "label": "Tipo", "options": ["sales", "purchase"], "optionKey": "values.type" },
  "onChange": [ { "refresh": "invoices" } ] }
```

- `field` has the same properties as form fields (type, label, options, `required`, `validate`, `readOnlyIf`, `lookup`, `upload`…). Form and standalone field draw the control with the same component (`lc-field-control`).
- `bind` is the path in the state; if missing it is `state.<field name>`. The runtime creates the state **before** the first load of the data sources: `default`, otherwise false for checkbox and switch and null for the others.
- Free text (text, number, text area) is written to the state when leaving the field or on Enter, so data sources are not reloaded on every keystroke; the other types on every choice. A cleared field is `null`; numbers arrive as numbers.
- `onChange`: steps run after every change, with the new value in `value`.
- `errorPath`: where the value sits in the body of a `call` started outside a form, as a JSON Pointer, for example `"/customer/address/city"` when the body is `{ "customer": { "address": { "city": "{{ state.city }}" } } }`. The field errors of the service with that path go to this field, as do those with `/<field name>` (§ 2.29).
- `required`, constraints and rules (§ 2.29) give their errors and warnings after the first change. The node also accepts `enabledIf` and `readOnlyIf`, which add to those of the field.
- A field that cannot be changed (`readOnlyIf`, `enabledIf`) keeps the colour of its text on the grey background of a locked field, so its value stays readable (WCAG 1.4.3).
- In the editor palette every type is an item of the «Fields» group (Text box, Drop-down list…); names of new fields are not repeated within the screen.

To put several fields side by side: a `section` with `layout: "row"` (200 to 360 px wide each, wrapping when space runs out) or a `box` or a `grid` (§ 2.21).

### 2.21 Layout containers

Three containers that decide only **where** their children go (no frame or background: for a panel with a title there is `section`). Position properties live on the **children**, like the constraints of classic layout managers: in the editor you move nodes in the structure and set the position in the child's property panel.

```text
 box (row)                  grid (columns: 3)          border
 ┌────┬──────────┬────┐     ┌──────────────┬─────┐     ┌──────────── north ───────────┐
 │ A  │ B grow 1 │ C  │     │ span 2       │     │     ├──────┬──────────────┬────────┤
 └────┴──────────┴────┘     ├──────────────┴─────┤     │ west │    center    │  east  │
                            │ span 3             │     ├──────┴──────────────┴────────┤
                            └────────────────────┘     └──────────── south ───────────┘
```

**Box** (`box`): children in a row (`direction: "row"`, the default) or in a column.
- `align`: cross-axis alignment (`start`, `center`, `end`, `stretch` by default); `justify`: distribution (`start`, `center`, `end`, `between`).
- `wrap`: in a row, wraps when space runs out (true if missing).
- `gap`: `none`, `small`, `medium` (default), `large`, derived from the theme's `--lc-gap`.
- Children: `grow` (0–12) shares the free space proportionally; a child with `grow` in a wrapping row does not shrink below 200 px.
- `variant: "dashed"`: a quiet dashed frame with some padding, as around the action that adds an item under a list (the
  same frame as a file drop zone); `plain` (the default) draws nothing.

```json
{ "type": "box", "justify": "between", "align": "center", "components": [
  { "type": "text", "style": "heading", "text": "Fatture" },
  { "type": "box", "gap": "small", "components": [ { "type": "button", ... }, { "type": "button", ... } ] } ] }
```

**Grid** (`grid`): `columns` equal columns (2 if missing, up to 12); children take `span` of them (never more than the columns). Below 600 px of container width it becomes a single column.

**Border** (`border`): every child declares its `region`: `north` and `south` across the full width, `west` and `east` on the sides (`westWidth`, `eastWidth` in px, 240 if missing), `center` (the default) takes the rest. With `resizable: true` there are dividers between the centre and the sides, which can be dragged (touch included) or moved with the arrow keys (16 px, 64 px with Shift; Home and End to the limits), between 120 and 600 px; they are accessible (`role="separator"` with the current value). Several children in the same region are stacked; an empty region takes no space. Below 768 px of width the regions stack: north, west, centre, east, south.

```json
{ "type": "border", "westWidth": 220, "components": [
  { "type": "alert", "region": "north", "kind": "info", "text": "..." },
  { "type": "input", "region": "west", "field": { "name": "status", "type": "radio", ... } },
  { "type": "table", "source": "invoices", "columns": [ ... ] } ] }
```

Common rules: a hidden child (`visibleIf`) takes no space; inside containers fields fill the cell (outside they stay at most 560 px wide); sections side by side stretch to the row height. Containers nest freely (a box inside a border region, a grid in a section…). In the editor they are in the «Struttura e testi» group; the border starts with three sample areas (north, west, centre).

### 2.22 validate, print, export, download and copy steps

```json
"onClick": [
  { "validate": "order" },
  { "call": "save", "args": { "name": "{{ state.name }}" } },
  { "export": { "source": "invoices", "fileName": "invoices",
                "columns": [ { "field": "number", "label": "{{ t('common.number', 'Numero') }}" }, { "field": "amount" } ] } },
  { "download": "exportUser", "args": { "username": "{{ row.username }}" }, "fileName": "{{ row.username }}.json" },
  { "print": true }
]
```

- **validate**: checks the standalone fields of the given group (`group` of `input` nodes, `default` if not given; `*` = all those on screen). Every field shows its own errors; if one is invalid the warning «Controlla i campi evidenziati» (check the highlighted fields) appears and the sequence stops. A hidden field does not count.
- **print**: opens the browser's print dialog; the runtime's print stylesheet hides menu, top bar, buttons and pagination.
- **export**: runs the data source (GET; `args` as in `call`) and downloads the rows (a list, or the `items` of a paged response) as CSV for Excel in Italian: semicolons, CRLF line endings, UTF-8 BOM. Headers go through `t()`; values are the raw ones (unformatted numbers). Cells starting with `=`, `+`, `-`, `@` (or tab and carriage return) are prefixed with an apostrophe: a spreadsheet does not run them as formulas. The file name is cleaned up and gets `.csv`.
- **download**: saves as a file the answer of a GET data source (`args` as in `call`), such as an export the service
  writes itself (a JSON, a PDF, a ZIP).
  - **Behaves like `call`**: it goes through the runtime with the session, the trace and `onError` (which sees
    `error.status`). An expired session, or a service that asks for a recent login, signs the user in again; a link
    with `href` (ADR-24) cannot do that, because the browser follows it by itself.
  - **The file**: its type is the one of the answer. Its name is the one the service gives in `Content-Disposition`
    (`filename*`, then `filename`), else `fileName` (with `{{ }}`), else the last segment of the address. Folders and
    characters a file name cannot have are removed.
  - **Accessibility**: screen readers hear «Download started» (`lc.downloadStarted`). The browser shows the file in its
    own bar.
  - **Size**: the file passes through the memory of the page. For very large files a link with `href` is lighter.
  - In the showcase, «Download JSON» on the containers page saves the invoices as the service sends them.
- **copy** and **copyLink**: write to the clipboard, for «Copy link» or «Copy key» from a button or a menu item.

  ```json
  { "copy": "{{ data.issue.key }}", "copied": "{{ t('issue.keyCopied', 'Key copied') }}" }
  { "copyLink": {} }
  { "copyLink": { "screen": "issue-detail", "params": { "key": "{{ row.key }}" } } }
  ```

  - **copy** writes the text, resolved like any text (an expression in error copies nothing).
  - **copyLink** writes the full address of a screen, built by the application as for the links of the breadcrumb
    and made absolute: the same link whatever way the user reached the page. `{}` is the current screen with its
    parameters; with `screen` another one, with the `params` given.
  - **Outcome**: a notice confirms it, `copied` or «Copied to the clipboard» (`lc.copied`). If the browser refuses
    (no permission, a page not served over https) the step fails with «Could not copy to the clipboard»
    (`lc.copyFailed`), or runs `onError`. The copied text never goes to the reports.
  - **Port**: the runtime uses the clipboard of the browser; an application can provide its own `ClipboardWriter`.
  - In the showcase «Forms», the section «Inline editing» has «Copy link» and, in the «…» menu, «Copy key».

### 2.22b Before and after a call: response, conditions, named sequences, errors

Steps are a sequence: what has to happen before a call (`validate`, `confirm`, `set`) and after it (`toast`, `refresh`, `navigate`) goes before and after the `call` step, which stops the sequence if it fails. Four additions let you use the response and avoid repeating yourself:

```json
"actions": {
  "saveOrder": [
    { "validate": "order" },
    { "confirm": "{{ t('orders.confirm_save', 'Save the order?') }}" },
    { "call": "creaOrdine", "as": "created",
      "onError": { "if": "{{ error.status == 409 }}", "then": { "toast": "Order already exists" }, "else": { "toast": "Saving failed" } } },
    { "if": "{{ created.status == 'draft' }}", "then": { "toast": "Saved as a draft" } },
    { "refresh": "orders" },
    { "navigate": "order-detail", "params": { "id": "{{ created.id }}" } }
  ]
},
"components": [{ "type": "button", "label": "Save", "onClick": { "run": "saveOrder" } }]
```

- **`as` in the `call` step**: the following steps of the same sequence see the response under that name (`{{ created.id }}`). The name cannot be that of an existing variable (`user`, `state`, `params`, `settings`, `data`, `row`, `form`, `formFields`, `error`…).
- **`form` and `formFields`**: inside a form, `form` is the whole record (with `source`, everything the service returned, keys and dates included, plus the values typed); `formFields` holds only the fields of the form, those of `fields` and of `fieldsFrom` (in its `into` object when there is one), a field without a value as `null`. `"body": "{{ formFields }}"` sends only what the form edits, for a service that refuses unknown properties; `"{{ form }}"` sends everything, as before.
- **`if`** with `then` and `else` (optional): one step or a list of steps per branch. The condition must yield true or false; if it cannot be evaluated (or yields something else) the sequence stops with the generic warning and the technical diagnostic, without running either branch (fail-closed).
- **`actions` and `run`**: named sequences of the screen, called from buttons, row actions, forms… with the variables of the place where they are called (`row`, `form`). Variables created inside (`as`) stay theirs. A sequence that does not exist, or calls nested more than eight levels deep (a cycle), stop the sequence. The editor suggests the names in `run` and flags missing ones.
- **`error.status` in `onError`**: the HTTP status of the response (0 if the service cannot be reached), to behave differently according to the error. The server's message is not available: it might contain internal details.
  A 401 runs neither `onError` nor the default message: the session handles it (it signs the user in again, after an expired session or when the service asks for a recent login) and says so itself.

What **must** happen regardless (checks, rules, audit, several calls to keep consistent) does not belong in the interface, which can be bypassed: it belongs in the service, in the BFF or in an endpoint that combines them. Steps serve the user experience. The «Componenti base» showcase has an example of each (section «Sequenze e risposte»).

### 2.23 Image, link, progress

- **image**: `src` (relative, `https://`, `data:image/png|jpeg|gif|webp|svg+xml;base64` or an image of an asset pack of the application, `asset:pack/name`; may contain `{{ }}`), mandatory `alt`, `width`/`height` in px, `fit` (`contain` or `cover`). Any other address (javascript:, http:, `//`, `..`) is not loaded: the alternative text is shown, as when the image fails to load. Lazy loading, no `Referer`. An image of a pack is taken from the pack, loaded once, as a `data:` address; nothing is shown while it loads, and the alternative text if the pack does not have it. The theme takes the same addresses for its logo and icons (`"logo": "asset:brand/logo"`): the classic theme of the demo has its brand in `examples/assets/brand.json`.
- **link**: `label` and `screen` (+ `params`) to open a screen of the application, **or** `href`: `https://…` (new tab, `noopener noreferrer`, external-link icon) or a relative path (same tab). The schema rejects other protocols and the presence of both.
- **progress**: `value` and `max` (100 if missing) as numbers or expressions, `label`, `kind` (`line` or `circle`), `tone`. Percentage rounded between 0 and 100; a non-numeric value shows «—». Accessible as a `progressbar` with its current value.

### 2.24 Timeline and kanban

```json
{ "type": "timeline", "source": "events", "dateField": "data", "labelField": "title", "descriptionField": "note",
  "toneField": "outcome", "tones": { "ok": "success", "ko": "danger" }, "withTime": true }

{ "type": "kanban", "source": "tasks", "columnField": "status", "titleField": "title", "descriptionField": "who",
  "columns": [ { "value": "to-do", "label": "Da fare" }, { "value": "done", "label": "Fatto", "tone": "success" } ],
  "moveIf": "{{ can('tasks.tasks.modifica') }}",
  "onMove": [ { "call": "move", "args": { "id": "{{ row.id }}", "status": "{{ to }}" } }, { "refresh": "tasks" } ] }

{ "type": "kanban", "source": "tasks", "columnField": "status", "titleField": "title", "reorder": true,
  "laneField": "assignee", "avatarField": "assignee",
  "badges": [ { "field": "priority", "tones": { "high": "danger" } } ], "footerFields": [ { "field": "points", "label": "Points" } ],
  "columns": [ { "value": "to-do", "label": "To do" }, { "value": "doing", "label": "Doing", "tone": "primary", "limit": 3 } ],
  "onMove": [ { "call": "move", "args": { "id": "{{ row.id }}", "status": "{{ to }}", "beforeId": "{{ beforeId }}", "afterId": "{{ afterId }}" } },
              { "refresh": "tasks" } ] }

{ "type": "kanban", "source": "issues", "columnField": "status", "titleField": "title", "laneField": "{{ state.groupBy }}",
  "badges": [ { "field": "priority", "valueKey": "values.priority", "tones": { "high": "danger" } } ],
  "columnsFrom": { "source": "statuses" },
  "onOpen": [ { "navigate": "issue-detail", "params": { "id": "{{ row.id }}" } } ] }
```

- **timeline**: the data-source rows in date order (`order`: `desc` by default, `asc`); a date without a time counts as a local day; rows without a valid date are not shown.
- **kanban**: columns in the order of `columns`, with a count; rows whose value is not a column are not shown. Inside a column the cards keep the order of the data: the service decides it. With `onMove` a card is moved by dragging it to another column or, from the keyboard, with the «Move “…” to…» button (menu of the other columns). The steps see `row`, `from`, `to` and the keys (`keyField`, `id` if absent) of the cards that will be around it in `beforeId` and `afterId` (null at the ends; at the end of the column when it goes to another one from the menu); the card changes place when the reloaded data says so (the actual move belongs to the service). `moveIf` decides per row, fail-closed. After a move screen readers hear where the card is now («“Quote” is in Done, position 2 of 4»).
  - **Order** (`reorder: true`): a card can also be dropped between the cards of its own column (a line shows where it goes), and the menu gains «Move up» and «Move down». Without it a card dropped on its own column does not move.
  - **Swimlanes** (`laneField`): the board is divided into horizontal lanes, one per value of the field (in order of appearance, cards without a value in a last lane «No group»), or the ones listed in `lanes` with their headers. The column headers stay at the top; each lane has a header with its count that collapses it (`aria-expanded`). A card moves only within its lane; every cell is a region named «lane — column».
  - **Moving between lanes** (`moveAcrossLanes: true`, with `laneField`): a card can also be dropped in a cell of another lane, which changes its value of the lane field (the assignee, the priority…), and the «Move» menu gains a «Move to row» group with the other lanes, which keeps the column. The steps of `onMove` see the starting lane in `fromLane` and `fromLaneLabel` and the target one in `lane` and `laneLabel` (the value is null for the lane «No group» and for the board without lanes): the call sends the lane, a `confirm` can name it. `moveIf` sees the same variables: when deciding whether a card moves at all `lane` is equal to `fromLane`, then it is asked again for each other lane, so a rule written as a change forbids only some lanes: `"{{ lane == fromLane || can('issues.issue.assign') }}"`. As for every move, the card changes place only with the reloaded data: if the confirm is cancelled or the call fails it stays where it was. After a move screen readers hear the lane too.

    ```json
    "moveAcrossLanes": true,
    "onMove": [
      { "if": "{{ lane != fromLane }}", "then": { "confirm": "{{ t('issues.confirm_lane', 'The assignee will be changed to {lane}', {'lane': laneLabel}) }}" } },
      { "call": "moveIssue", "args": { "id": "{{ row.id }}", "status": "{{ to }}", "assignee": "{{ lane }}" } },
      { "refresh": "issues" }
    ]
    ```

    The second board of the «Tasks» showcase moves its tasks between people or priorities.
  - **Limits** (`columns[].limit`): the header shows «3/5»; above the limit the column is tinted and its header says «over the limit» next to a warning icon (not only colour). The count includes every lane; moves are not blocked.
  - **Columns from data**: instead of a fixed list, `columns` can be an expression that returns the list (`"{{ settings.board.columns }}"`), or `columnsFrom` reads it from a data source (`{ "source": "statuses", "valueField": "id", "labelField": "name", "toneField": "tone", "limitField": "wip" }`; without the field names it reads `value`, `label`, `tone` and `limit`). One screen then serves boards with different workflows. Labels that come from data are shown as they are, never evaluated; unknown tones and limits that are not positive whole numbers are ignored, as are rows without a value or with a value already seen. In a CEL list all the values of a column must have the same type, so a limit is written as text: `{'value': 'doing', 'label': 'Doing', 'limit': '3'}`. While the columns load the board shows the wait; if their source fails the board shows the error.
  - **Swimlanes chosen on the screen**: `laneField` can be an expression that returns the name of the field (`"{{ state.groupBy }}"`, with an `input` that writes `state.groupBy`), and `lanes` an expression that returns the list of `{value, label}` (labels shown as they are). An empty text gives the board without lanes; an empty list the lanes found in the data, which suits a CEL condition because both branches must have the same type: `{{ state.groupBy == 'priority' ? [{'value': 'high', 'label': t('values.priority.high', 'High')}] : [] }}`. An expression that fails shows no cards (fail-closed).
  - **Opening a card** (`onOpen`): the title of the card becomes a button that runs the steps with the row in `row`, usually `navigate` to the detail screen; it is reached with Tab and pressed with Enter or Space. A click elsewhere on the card does the same; the «Move» button and dragging a card do not open it.
  - **Rich cards**: `badges` (labels with the value of a field, coloured by `tones`; `valueKey` shows the translation of the value, `<prefix>.<value>`, as in table columns, while the tones stay tied to the stored value), `avatarField` (initials of a person in a circle, the full name in the tooltip and for screen readers), `footerFields` (values at the bottom, with an optional label). Empty values show nothing.

### 2.25 Menu: search, counters, keyboard

- **Search**: a box at the top of the menu (expanded bar). It finds the area's items whose name, or whose group's name, contains the text, ignoring case and accents; every result shows its path. Enter opens the first one, Down arrow moves into the results, Esc clears.
- **Counters**: in the navigation, `"badges": { "url": "/api/menu/counters", "refreshSeconds": 60 }`. The service (relative GET, through the BFF) responds `{ "<item id>": number }`; positive integers are kept, above 99 «99+», a dot when the bar is collapsed. A closed group shows the sum of its items' counters (subgroups included); when open, the numbers move to the items. They are re-read periodically (only while the page is visible) and when returning to the page. Screen readers read «Bozze, 3 da gestire» (Drafts, 3 to handle).
- **Keyboard**: up and down arrows between visible items and groups, Home and End, right opens a group (or enters the first item), left closes it (or goes back to the group), Enter and Space on groups. Group titles are reachable with Tab and say whether they are open (`aria-expanded`).

### 2.26 Formatted text and rich text editor

**Before**, text components showed only plain text: no lists, bold or links, and plain text even lost its line breaks. Now:

- plain text (`text` without a format) keeps line breaks;
- `text` and `alert` with `"format": "markdown"`, and `detail` fields with `"format": "markdown"`, show **classic typography** written in a restricted Markdown;
- the `richtext` field type is a rich text editor with a toolbar, in the form and as a standalone field.

```json
{ "type": "text", "format": "markdown",
  "text": "{{ t('orders.instructions', 'Before **sending**:\\n\\n- check the data\\n- attach the invoice') }}" }
```

| Written | Result |
| --- | --- |
| empty line | new paragraph (a single line break stays a line break) |
| `# `, `## `, `### ` | headings (three levels, below the section title) |
| `- ` (or `* `, `+ `), `1. ` | bulleted and numbered lists; indent by two spaces to nest (up to three levels) |
| `> ` | quotation |
| `**bold**`, `*italic*` (or `_italic_`), `~~strikethrough~~`, `` `code` `` | emphasis |
| `[text](https://…)` | link: only `https:`, `mailto:` or paths starting with `/`; others stay text. External addresses open in a new tab |
| `\*` | the character without special meaning |

**Security.** Text is parsed and drawn with elements built by Quadrava: **never HTML**. An `<img onerror=…>` or a `<script>` in the text, even when it comes from data or a translation, is shown as text. `javascript:`, `data:` and similar links do not become links. Text is limited to 20,000 characters.

**In tables** the `markdown` column format shows the plain text (without symbols); in the detail card it is formatted.

**`richtext` editor.** Toolbar with bold (Ctrl+B), italic (Ctrl+I), strikethrough, heading, bulleted and numbered list, quotation, link and «remove formatting»; `rows` for the minimum height. The value is the **same restricted Markdown**, never HTML: it is shown with a `text` or a `format: markdown` detail field. What the browser produces while editing is reduced to the allowed format (styles, scripts and unknown tags disappear); only plain text can be pasted; a link is accepted only with an allowed address. The area is a multi-line `textbox` with its label; the buttons say whether they are active (`aria-pressed`). In the filter bar `richtext` behaves like `text`. The «Campi a sé» showcase has an example with the preview alongside.

**Labels.** Labels (of fields, columns, buttons, the menu) deliberately stay **plain text**: they are short, screen readers read them as the element's name and they must be the same everywhere.

**In translations.** Inside a CEL expression a quoted string cannot contain real line breaks: in the fallback text of `t()` write `\n` (in the screen JSON `\\n`). In translation files line breaks are ordinary JSON `\n`.

### 2.27 Activity indicator

All components that read a data source (table, data table, server data table, chart, detail, indicators, tree, calendar, timeline, kanban) show the wait in the same way, with the shared `lc-busy` component wrapping their content.

- **A spinner, for large tables too.** Not a *skeleton*: for a table you cannot know how many rows will arrive, and grey rows standing still for seconds look like a broken page. The table header (the columns are in the definition) is visible immediately.
- **First load.** The spinner takes the place of the content, in an area with a reserved minimum height (`--lc-busy-min-height`, 160 px), so the page jumps little when the data arrives. While waiting the table does not say «Nessun risultato» (no results).
- **Reload** (filters, `refresh`, page). The previous data stays visible and dimmed (`--lc-busy-dim`), with the spinner on top. The indicator does not intercept clicks: filters, grouping and scrolling stay usable. On a long table the spinner stays in the visible part while scrolling.
- **Timing.** The spinner appears only if the wait exceeds 300 ms, so fast responses do not make it flash; once shown it stays at least 400 ms. After 8 seconds the label becomes «This is taking longer than usual…».
- **Accessibility.** The content has `aria-busy` throughout the wait. A `status` region, always present, announces «Caricamento…» (loading) when the spinner appears. With the operating system's "reduce motion" setting the spinner does not spin.
- **Actions.** Buttons, form actions and file uploads keep the spinner inside the button, which is disabled meanwhile.

In the demo the **Rete** (network) selector (normal, slow, very slow) in the top bar slows down the in-browser back end, to see the indicator and the long-wait message; it applies to the browser tab.

### 2.28 Table footer: «Aggiorna», first and last page

Table, data table and server data table share the same footer (`lc-table-footer`):

- **on the left**, optional, the **Aggiorna** (refresh) button (`"refreshable": true`): an icon with a tooltip that reloads the data source like the `refresh` step. After the click the icon spins immediately and for at least one turn (800 ms), even if the data arrives earlier, and for the same time the spinner in the centre of the table appears immediately with «Caricamento…» (without the 300 ms delay of loads not requested by the user, § 2.27): with fast responses the click would otherwise seem to do nothing. The button does not change size and another click while it spins does nothing; it is not disabled, so keyboard users do not lose focus;
- **on the right** the pages, with **first page** and **last page** buttons at the sides (disabled at the ends). Pages appear only if there is more than one.

In the showcase «Aggiorna» is in the first table of «Filtri e tabelle» and in the three tables of «Datatable».

### 2.29 Declarative validation

Fields are checked by rules written in the JSON (ADR-15): the common cases as properties of the field, the others in a `validation` list. The same rules apply in forms, standalone fields, filter bars and the rows of repeaters; the messages are translated (`lc.validation.*`) and appear after the first save (after the first change for standalone fields).

```json
{ "name": "code", "type": "text", "required": true, "minLength": 3, "maxLength": 10, "pattern": "[A-Z0-9-]+", "transform": ["trim", "uppercase"],
  "messages": { "pattern": "{{ t('product.codePattern', 'Use capitals, digits and dashes only') }}" } }
{ "name": "quantity", "type": "number", "min": 1, "max": 999, "integer": true }
{ "name": "vat", "type": "text", "format": "vatNumber", "country": "{{form.country}}", "transform": ["removeSpaces", "uppercase"] }
```

| Field type | Flat properties |
| --- | --- |
| text, textarea | `minLength`, `maxLength`, `pattern` (the whole value, Unicode), `format` (+ `country`), `transform` (`trim`, `uppercase`, `lowercase`, `removeSpaces`: applied when leaving the field and before sending) |
| richtext | `minLength`, `maxLength` |
| number | `min`, `max`, `step` (from `min`), `decimals`, `integer` |
| date, datetime | `minDate`, `maxDate`: a date, or relative to the day (`today`, `today+30d`, `today-18y`; units d, w, m, y); days outside cannot be chosen in the calendar |
| password | `minLength`, `maxLength`, `pattern`, `newPassword` (strength meter), `minStrength` (0–4) |
| multiselect, tags | `minItems`, `maxItems` |
| all | `required`, `validate` (one CEL rule, as before), `messages` (a text per constraint) |

**Formats.** `email`, `url` (http and https), `phone` (international, 6 to 15 digits), `iban` (country length and check digits), `bic`, `uuid`, `alphanumeric`; national ones with `country` fixed or from an expression: `vatNumber` (IT, DE, FR, ES, NL, BE, AT, PT, PL, SE; without a country the prefix decides), `taxCode` (IT codice fiscale with omocodia, ES NIF/NIE, PT NIF, NL BSN), `companyId` (IT partita IVA, FR SIREN/SIRET, ES CIF, PT NIPC, BE enterprise number, NL KvK), `postalCode` (the ten countries of `vatNumber`). Check digits are verified where an algorithm is published. A format also sets the keyboard and autocomplete of the text box (email, telephone, postal code).

**Rules.** `validation` is a list of rules, each named by its key like the steps of an action, with an optional `message`, `when` (CEL condition: the rule applies only while it is true) and `severity` (`warning` shows the message in orange without blocking):

```json
"validation": [
  { "required": true, "when": "{{form.customerType == 'business'}}" },
  { "format": "vatNumber" },
  { "max": 20, "severity": "warning", "message": "{{ t('order.bigDiscount', 'Above 20% the discount needs approval') }}" },
  { "rule": "{{value != form.referrer}}", "message": "{{ t('order.notYourself', 'Not yourself') }}" },
  { "use": "staffNumber" }
]
```

The keys are those of the flat properties plus `sameAs` (equal to another field), `after` / `before` (date after or before another field, `inclusive` to allow the same day), `atLeastOne` (this field or one of the listed ones), `unique` (on a repeater: the column whose values must not repeat across rows), `rule` (CEL) and `use` (a validator of the application, with `params`). A conditional `required` also puts the asterisk on the label while its condition holds.

**Across fields.** The form has its own `validation` list; each rule names the fields it checks and that receive the message (`fields`; `atLeastOne` by default its own fields):

```json
"validation": [
  { "sameAs": "email", "fields": ["emailConfirm"] },
  { "atLeastOne": ["phone", "mobile"] },
  { "after": "start", "fields": ["end"], "inclusive": true }
]
```

In the rows of a repeater the rules of a cell compare it with the other cells of the same row (and see the row in `item`).

**Standalone fields.** The standalone fields (`input`) of the same validation group (`group`, `default` if absent) see each other as the fields of a form do: their rules read the values of the group in `form`, and `sameAs`, `after`, `before` and `atLeastOne` name the other fields of the group by their `name`. The `validate` step checks them together:

```json
{ "type": "input", "group": "newsletter", "bind": "state.newsletter.email", "field": { "name": "email", "type": "text", "format": "email" } },
{ "type": "input", "group": "newsletter", "bind": "state.newsletter.confirm", "field": { "name": "confirm", "type": "text", "validation": [{ "sameAs": "email" }] } },
{ "type": "button", "label": "Subscribe", "onClick": [{ "validate": "newsletter" }, { "call": "subscribe" }] }
```

**Passwords.** `"type": "password"` is a masked box with a button that shows the text (its label says «Show the password» / «Hide the password», `aria-pressed`). With `newPassword: true` it gets `autocomplete="new-password"` and a strength meter: four segments and the level in words (very weak … strong), with the first hint («Avoid common words and passwords»), announced politely by screen readers; `minStrength` blocks a weaker one. The estimate is ours and light (ADR-15): it discounts repetitions, sequences and keyboard rows, years, common words and passwords (also `p4ssw0rd`) and the values of the text fields of the form (a name, an e-mail); never other passwords, so a confirmation (`{ "sameAs": "password" }`) does not weaken it. The password never leaves the browser for the estimate. Not in repeaters nor in filter bars.

```json
{ "name": "password", "type": "password", "required": true, "newPassword": true, "minLength": 10, "minStrength": 3 }
{ "name": "passwordConfirm", "type": "password", "validation": [{ "sameAs": "password" }] }
```

**Checks on a service (remote rules).** `{ "remote": "<data source>" }` asks a service whether the value is valid, for example whether a staff number is already used:

```json
"dataSources": { "checkStaff": { "ref": "staff/check", "params": { "number": "{{ value }}" } } },
// datasources/staff.json: "check": { "type": "rest", "method": "GET", "url": "/api/staff/check" }
…
{ "name": "staffNumber", "type": "text", "pattern": "S\\d{6}", "validation": [{ "remote": "checkStaff", "debounce": 400 }] }
```

The data source sees the value in `value` (and the form in `form`) and answers `true` / `false` or `{ "valid": false, "code": "staffNumberTaken" }`. The check starts `debounce` ms (400 if absent) after the user stops typing and only when every other rule of the field passes; a newer value cancels the request in progress, and a value already checked is not asked again. While it runs the field shows a spinner; its outcome appears as soon as it is known, before the first save too; the form waits for the checks in progress before sending. The message: the rule's own, otherwise the `code` translated (`validation.<code>` in the application's catalogue, then `lc.validation.<code>`), otherwise «Value not accepted». A check that fails (network, error, another kind of answer) does not pass («The value could not be checked: try again»). The data sources of remote rules do not load when the screen opens. Remote rules work in forms, in standalone fields (a field still being checked does not pass the `validate` step), in the cells of a repeater (one check per row and column, «Checking…» under the cell while it runs) and in the filter bar, where the value reaches the state, and so starts the search, only once the service accepts it: while the check runs, or after it refuses the value or fails, the search stays the one of the last value accepted.

**Errors of the services.** When a `call` fails with a Problem that lists field errors (`contracts/problem.yaml`: `{ "errors": [{ "path": "/email", "code": "emailDomainBlocked" }] }`, `path` a JSON Pointer into the body sent, `/lines/0/code` for a cell of a repeater), the form shows each message on its field until that field changes (a `call` started outside a form, by a button, sends them to the standalone fields whose `errorPath` is that path, and `/<field name>` to the fields with that name), and the default message of the failure becomes «Check the highlighted fields»; `onError` sees how many were shown in `error.fields`. In a form a path is shown only when it ends exactly on a visible field (`/email`), on a data field kept in `into` (`/custom/contract`) or on a cell of a row that exists (`/lines/0/code`; rows have no nested rows, so there is nothing deeper); any other path, deeper or unknown, is not counted and leaves the default message of the failure. When the body wraps the values of the form, the form's `errorPath` says where they are, and only the paths below it are read:

```json
{ "type": "form", "errorPath": "/order", "fields": [ … ], "actions": [{ "label": "Save", "onClick": [{ "call": "saveOrder" }] }] }
```

with `saveOrder` sending `{ "order": "{{ form }}" }`: `/order/lines/0/code` goes to the cell, `/email` or `/order` to no field. Names with `/` or `~` are written `~1` and `~0`, as JSON Pointer wants. Codes are translated as above; the text written by the service is never shown, and such a rejection is not reported to the diagnostics (it is an answer for the user).

**In expressions.** `isValid(name, value[, params])` runs a validator anywhere, for example `{{ isValid('iban', state.iban) }}` or `{{ isValid('vatNumber', form.vat, {'country': 'DE'}) }}`.

**Validators of the application.** A validator is a pure function registered by name:

```ts
provideValidators({
  name: 'staffNumber',
  appliesTo: ['text'],
  validate: (value) => (/^S\d{6}$/.test(String(value)) ? null : {}),
}),
```

Its message is `lc.validation.staffNumber` (or `messageKey`) in the application's catalogues; one with the name of a built-in validator replaces it.

**Order and fail-closed.** Flat constraints first, then `validate`, then `validation`: the first error wins, a warning shows only without errors, and every rule except `required` and `atLeastOne` passes on an empty field. An unknown validator, a rule on the wrong field type, invalid parameters or a pattern that does not compile make the field invalid and are reported once to the diagnostics, never with the value; the editor and `validate:examples` report patterns that do not compile. In the filter bar an empty filter still means «all», and a value that breaks its rules is not searched for.

In the showcase: «Validazione» (Validation), also with a staff form for passwords, the check of a staff number on the service and the errors returned by it.

### 2.30 Comments

A thread of comments read from a data source, with a box for writing below it. Today a discussion can also be built with `timeline`, `richtext` and a `dialog`; `comments` puts it in one node.

```json
{ "type": "comments", "source": "comments",
  "onPost": [ { "call": "addComment" }, { "refresh": "comments" } ],
  "postIf": "{{ can('tasks.comments.create') }}",
  "onEdit":   [ { "call": "updateComment", "args": { "id": "{{ row.id }}" } }, { "refresh": "comments" } ],
  "editIf":   "{{ row._perm.update }}",
  "onDelete": [ { "confirm": "Delete the comment?" },
                { "call": "deleteComment", "args": { "id": "{{ row.id }}" } }, { "refresh": "comments" } ],
  "deleteIf": "{{ row._perm.delete }}",
  "editedField": "editedAt",
  "mentions": { "source": "people", "valueField": "id", "labelField": "name" } }

"addComment":    { "type": "rest", "method": "POST", "url": "/api/comments",
                   "body": { "text": "{{ text }}", "mentions": "{{ mentions }}" } },
"updateComment": { "type": "rest", "method": "PUT", "url": "/api/comments/{{ id }}",
                   "body": { "text": "{{ text }}", "mentions": "{{ mentions }}" } },
"deleteComment": { "type": "rest", "method": "DELETE", "url": "/api/comments/{{ id }}" },
"people":     { "type": "rest", "method": "GET", "url": "/api/people", "params": { "q": "{{ search }}" } }
```

```
 AR  Anna Rossi · 27 Oct 2026, 10:12
     The quote for Smith Ltd is ready for review.
 LB  Luca Bianchi · 27 Oct 2026, 11:40 · edited
     @Anna Rossi looks good. Two notes:
     • the delivery date
 MV  Marta Verdi · 27 Oct 2026, 12:05
     I will send it tomorrow.
     Edit  Delete                ← editIf, deleteIf with the comment in «row»
┌ Write a comment ─────────────────────────────┐
│ Thanks @ma▌                                  │
│   ┌ Marta Verdi ┐  ← people of «mentions»    │
└──────────────────────────────────────────────┘
 Markdown: **bold**, *italic*, lists; @ to mention someone.   [ Publish ]
```

- **Thread**: one row per comment, with `authorField` (`author`), `dateField` (`date`, ISO 8601) and `textField` (`text`). Comments are in date order, oldest first so the newest sits next to the box (`order: "desc"` for the newest first); those without a valid date come last, those without text are left out. The author has a circle with the initials; the text is restricted Markdown drawn by `lc-markdown`, never HTML, and texts from the data are never evaluated. While loading the thread shows the wait (`lc-busy`); an error of the data source shows the error.
- **Writing**: with `onPost` a labelled multi-line box appears (`postIf` decides who sees it, fail-closed: an error hides it). «Publish» or Ctrl+Enter (Cmd+Enter) runs the steps with `text` (the Markdown written, without spaces at the ends) and `mentions`; when they succeed the box is emptied and «Comment published» is announced, otherwise the text stays where it is. The steps usually end with a `refresh` of the thread. A real service takes the author from the session, not from the page (the fake service of the showcase receives `{{ user.username }}` in the body).
- **Mentions** (`mentions`): typing `@` followed by letters (`minChars`, 1 if absent) asks the data source with `search`, like a lookup, so the same source of people serves both. The chosen person is inserted as `@` followed by `labelField` and a space; `mentions` holds, as texts, the `valueField` (`id`) of the people chosen who are still in the text when it is published, once each. The list of people is the same combobox as a text field with suggestions (§ 2.7): arrows, Enter, Escape, the number announced.
- **Changing and deleting** (`onEdit`, `onDelete`): each comment gets «Edit» and «Delete» buttons where `editIf` and `deleteIf` say yes, with the comment in `row` (absent: always; an error: never). The service decides who may do what, for example with `_perm` in each row; the front end only follows it. «Edit» turns the comment into the same box, with its Markdown and the mentions, and moves the focus there: «Save» or Ctrl+Enter runs `onEdit` with `row`, `text` and `mentions` (the people chosen while changing it who are still in the text; those of the first version are the service's to keep). When the steps succeed the box closes and «Comment changed» is announced; «Cancel» or Escape restores the comment without running anything, and the focus goes back to «Edit». «Delete» runs `onDelete` with `row`: the confirmation is a `confirm` step of the author, so a screen can also do without it. With `editedField` a comment whose field has a value (a date or `true`) shows «edited» next to the date.

**Activity feed.** The same node can show everything that happened to an item, as the Activity of a Jira issue: the
service returns one list with comments, changes of fields and time logged, and `kindField` says which is which.

```json
{ "type": "comments", "source": "activity", "kindField": "kind",
  "changes": { "fieldKey": "issue.fields", "valueKey": "values" },
  "workLog": { "minutesField": "minutes" },
  "filters": true, "orderToggle": true, "order": "desc",
  "onPost": [ … ], "onEdit": [ … ], "onDelete": [ … ] }
```

```
 [ All ][ Comments ][ History ][ Work log ]                ⇅ Newest first
 AR  Anna Rossi · 27 Oct 2026, 11:05
     I will send it tomorrow.                                   Edit  Delete
 LB  Luca Bianchi logged 1 hr 30 mins · 27 Oct 2026, 10:45
     Checked the figures of the quote.
 LB  Luca Bianchi changed Status from To do to In progress · 27 Oct 2026, 10:00
 AR  Anna Rossi set Priority to High · 27 Oct 2026, 09:30
```

- **Rows.** A row whose `kindField` is the kind of `changes` (`change` if absent) is the change of a field, one line:
  «changed *field* from *a* to *b*», «set *field* to *b*» without an old value, «cleared *field*» without a new one.
  The field is read from `fieldField`, `fromField` and `toField` (`field`, `from`, `to`); its name is translated with
  `fieldKey` (`issue.fields.status`) and the values with `valueKey`, the field and the value (`values.status.done`),
  the text as it is when there is no translation. A change has no buttons. A row of the kind of `workLog` (`worklog`)
  is time spent: «logged 2 hrs 30 mins» from `minutesField` (`minutes`), in the language of the user, with the text
  of the row under it and the Edit and Delete buttons of the comments. Every other row is a comment.
- **Chips** (`filters`): `true` gives All, Comments and, for the kinds the feed has, History and Work log. A list gives
  the chips of the screen, in order, with their labels and the values of `kindField` each one shows (all rows without
  `kinds`), for kinds of its own such as attachments:

  ```json
  "filters": [ { "label": "{{ t('issue.all', 'All') }}" },
               { "label": "{{ t('issue.talk', 'Comments') }}", "kinds": ["comment", "attachment"] },
               { "label": "{{ t('issue.history', 'History') }}", "kinds": ["change"] } ]
  ```

  The rows are filtered in the page, so one data source serves every chip; the first chip is chosen at the start.
  The chips are buttons that say which one is pressed. The box for writing stays under every chip.
- **Order** (`orderToggle`): a button turns the order between newest and oldest first, starting from `order`. With
  `orderBind` the choice is also written to the state (`asc` or `desc`), so the screen can read it or keep it while it
  is open; it is not remembered across sessions.

In the showcase: «Vetrina: attività e avanzamento» (Showcase: tasks and progress), «Attività» (Activity) section: the
comments of the team with two changes and an hour and a half of work.

### 2.31 Form fields from a data source

One screen serves forms whose fields are data: the custom fields of a project, the attributes of a product category.
`fieldsFrom` reads them from a data source, one row per field, and draws them after those of `fields`.

```json
{ "type": "form", "source": "issue",
  "fields": [{ "name": "title", "type": "text", "required": true }],
  "fieldsFrom": { "source": "customFields", "into": "custom", "nameField": "key",
    "types": { "user": { "name": "user", "type": "lookup", "lookup": { "source": "people", "valueField": "id", "labelField": "name" } } } } }
```

```text
 rows of «customFields»                                  the form
 { key: contract, label: Contract number,      ──▶   * Title            [Printer offline   ]
   type: text, required: true }                       * Contract number  [C-1042            ]
 { key: severity, label: Severity, type: select,  ──▶   Severity         [High            ▾]
   options: [{ value: low, label: Low }, …] }
 { key: reviewer, label: Reviewer, type: user } ──▶     Reviewer         [Luca Bianchi    ▾]   (model «user»)
                                                        [ Save ]  ──▶  { title, custom: { contract, severity, reviewer } }
```

- **Rows**: `nameField` (`name`), `labelField` (`label`), `typeField` (`type`), `optionsField` (`options`, values or `{ value, label }`) and `requiredField` (`required`, true or false). Labels and options are data: shown as they are, never evaluated or translated; without a label the name is shown. At most 50 fields; rows without a valid name (letters, digits and `_`, starting with a letter), with a name already seen or with an unknown type are left out.
- **Types**: a row can ask for the simple controls (`text`, `textarea`, `number`, `date`, `datetime`, `checkbox`, `switch`, `select`, `multiselect`, `radio`, `tags`) or for a model of `types`: a field of the screen, with its control and rules (a lookup and its source, `maxLength`, `readOnlyIf`…). The row gives name, label, options and required; the rest comes from the model, and the row cannot loosen it.
- **Values**: with `into` the values of the data fields live in that object (`form.custom.contract`), so they cannot clash with those of the screen and travel to the service as they arrived from it. Without `into` they sit next to the others, and a row cannot take the name of a field of the screen.
- **Checks**: required flags and the rules of the models apply as for the other fields when an action runs. The field errors of the service land on the data fields too, with the path inside the object (`/custom/contract`): this is where the rules that depend on other fields belong (required only for one kind of issue, for example).
- **Loading**: while the fields load the form shows the wait (`lc-busy`) and its actions are disabled; if their source fails the form shows the error and keeps the fields of the screen.
- **Studio and `quadrava validate`** warn when the `source` of `fieldsFrom` or of a model is not among the screen's `dataSources`, like every other data source a screen names.

In the showcase: «Vetrina: form» (Showcase: forms), «Campi dal servizio» (Fields from the service) section.

### 2.32 Icons on buttons and actions

The `button` component and every action (the actions of a `form`, the `bulkActions` of a `table`, the `rowActions`,
as buttons and in the «⋯» menu) take an optional `icon`, shown before the text. While the steps run, the icon of a button
gives way to the spinner.

```json
{ "id": "btn-save", "label": "Save", "icon": "save", "onClick": [{ "call": "saveIssue" }] }
```

**Icon buttons, counts and toggles.** `button` and `menuButton` also take three properties for toolbars such as the
actions at the top of an item:

| Property | What it does |
| --- | --- |
| `display: "icon"` | Only the icon (`icon` is then required: the schema and `quadrava validate` refuse it without). The `label` stays required: it becomes the name read by screen readers and the tooltip. A `menuButton` shown as an icon has no arrow (the «…» button, icon `more`). |
| `count` | A number next to the icon or the text, usually an expression (`{{ size(data.watchers) }}`); screen readers hear it after the text («Watchers: 2»). Nothing is shown when it is empty or not a number. |
| `pressed` | An expression: while it is true the button is highlighted with the colour of `tone` (primary if absent) and announced as pressed (`aria-pressed`); an icon with a filled form (`flag`, `like`) is drawn filled. An expression in error is not pressed. |
| `tone` | `neutral`, `primary`, `success` or `danger`, or an expression that gives one. On a toggle it is the colour of the pressed state: `danger` for a flag. On a button that is not a toggle it fills the button, as on a `menuButton`. |

```json
{ "type": "menuButton", "label": "Watchers", "icon": "eye", "display": "icon",
  "count": "{{ size(data.watchers) }}", "pressed": "{{ data.issue.watching }}",
  "items": [{ "label": "{{ data.issue.watching ? 'Stop watching' : 'Watch' }}", "onClick": [{ "call": "toggleWatch" }] }] }
```

An icon button and a toggle have the default look; a `button` with text and no `pressed` stays primary. A fixed item of
a `menuButton` can take `tone: "danger"` for an action that removes something (Delete): its text is red.

A flag, as in the issue trackers: «Add flag» in the «…» menu, and a red pressed button while the item is flagged (a
click removes the flag); the thumb counts the votes:

```json
{ "type": "button", "label": "Remove the flag", "icon": "flag", "display": "icon", "tone": "danger",
  "pressed": "{{ data.issue.flagged }}", "visibleIf": "{{ data.issue.flagged }}", "onClick": [{ "call": "unflag" }] },
{ "type": "button", "label": "Votes", "icon": "like", "display": "icon", "count": "{{ data.issue.votes }}",
  "pressed": "{{ data.issue.voted }}", "onClick": [{ "call": "toggleVote" }] }
```

The names are those of the built-in set, the same as in the navigation, or the name of any Ant Design icon in the
outlined form (`share-alt`, `team`, `calendar`, as on the Ant Design site without the `Outlined` suffix); a pressed toggle
draws the filled form when the icon has one. The short names come with the bundle; an Ant Design icon is fetched the first
time it is drawn, from the static files of the runtime (`assets/outline`, `assets/fill`), then the browser keeps it. An unknown name shows no icon. The short names for the actions:
`save`, `edit`, `delete`, `plus`, `check`, `close`, `link`, `eye`, `eye-invisible`, `flag`, `like`, `user-add`, `back`, `move`,
`play`, `reload`, `download`, `upload`, `external`, `copy`, `share`, `search`, `filter`, `settings`. The showcases «Tables»,
«Forms» and «Containers» have examples.

**Icons of the application (asset packs, ADR-29).** An application brings its own icons in an asset pack, a document
`assets/<pack>.json` of the project next to `screens/` and `themes/`, and names them `pack/name` wherever an icon is
taken, in the screens and in the navigation:

```json
{ "type": "button", "label": "Ship", "icon": "logistics/truck", "onClick": [{ "call": "ship" }] }
```

`quadrava assets add pack.zip` writes the pack from a zip of SVG files (see the README of the CLI), and `quadrava
publish` publishes only the icons the project names. The pack is geometry only: for every icon a `viewBox` and the path data, drawn in the colour of the text, and an optional
`filled` form for a pressed toggle (format in [schema-reference.md](schema-reference.md#asset-pack-assetsschemajson)).
The runtime loads a pack the first time a screen draws one of its icons, checks it against the schema and builds the
SVG itself; a pack that is missing or not valid draws nothing and goes to the diagnostics. The showcase «Basic
components» uses the pack of the demo, `examples/assets/logistics.json`, in its section «Icons», for an image too
(`asset:logistics/parcel`).

### 2.33 Breadcrumb declared by the screen

Above the title the runtime shows the path of the screen in the menu (area, groups, item). A screen that is not in the
menu, or that sits below another one (the detail of an item of a list), declares its own path with `breadcrumb`. It
takes the place of the one from the menu:

```json
"breadcrumb": [
  { "label": "{{ t('projects.title', 'Projects') }}", "navigate": "project-list" },
  { "label": "{{ has(data.project) ? data.project.name : '' }}", "navigate": "project-detail", "params": { "key": "{{ params.key }}" } },
  { "label": "Issues", "navigate": "issue-list", "params": { "key": "{{ params.key }}" } },
  { "label": "{{ params.issue }}" }
]
```

Projects › Website relaunch › Issues › WEB-4: the first three are links, the last one is the screen itself and is
marked as the current page. An item with `navigate` opens its screen as the navigate step does (in the current area if
the screen is there); a click with Ctrl, Cmd or Shift opens it in a new tab. A label that reads a data source uses
`has()`, so it stays empty while the data loads instead of failing; an item whose label is empty is left out of the
path, never drawn as an empty step.

An item that only some screens have takes `visibleIf`: the parent of an issue, for the issues that have one
(Projects › WEB › Issues › WEB-1 › WEB-18, and Projects › WEB › Issues › WEB-2 without a parent). An expression in
error leaves the item out.

```json
{ "label": "{{ has(data.issue) && data.issue.parent != null ? data.issue.parent.key : '' }}", "navigate": "issue-detail",
  "params": { "issue": "{{ data.issue.parent.key }}" }, "visibleIf": "{{ has(data.issue) && data.issue.parent != null }}" }
```

`quadrava validate` checks that the screens of
`navigate` exist. The order detail of the examples has a path back to the list of orders.

### 2.34 Menu button

A button that opens a menu. Its label and its tone (`neutral`, `primary`, `success`, `danger`; any other value is
`neutral`) are expressions, so the button can show the current status of an item and offer the moves it can make:

```json
{
  "type": "menuButton",
  "label": "{{ has(data.issue) ? data.issue.statusName : '…' }}",
  "tone": "{{ has(data.issue) ? data.issue.tone : 'neutral' }}",
  "items": [
    { "source": "transitions", "labelField": "name", "badgeField": "to", "toneField": "category",
      "tones": { "new": "neutral", "indeterminate": "primary", "done": "success" }, "valueKey": "values.status",
      "onClick": [{ "call": "move", "args": { "to": "{{ item.to }}" } }, { "refresh": "issue" }, { "refresh": "transitions" }] },
    { "divider": true },
    { "label": "View workflow", "icon": "eye", "onClick": [{ "run": "showWorkflow" }] }
  ]
}
```

`items` mixes three kinds of entries:

| Entry | What it gives |
| --- | --- |
| `{ "label", "icon"?, "visibleIf"?, "enabledIf"?, "onClick" }` | One fixed item. |
| `{ "source", "labelField", "keyField"?, "badgeField"?, "toneField"?, "tones"?, "valueKey"?, "enabledIf"?, "onClick" }` | One item per row of the data source (a list, or the `items` of a paged answer). The steps and `enabledIf` see the row as `item`. `badgeField` adds a coloured label, translated with `valueKey` like a badge cell; its colour is `tones[row[toneField]]` (by default the badge value itself). |
| `{ "divider": true }` | A line between groups. Dividers at the start, at the end or next to each other are left out, so an empty data source leaves no stray line. |

While the data source loads, the menu shows the activity indicator in its place; a menu with nothing to show says so.
The fixed items stay when the data source is empty.

Keyboard and screen readers: the button announces a menu (`aria-haspopup`, `aria-expanded`); opening it moves the focus
to the first item, the arrows, Home and End move among the items, Enter or Space choose, Esc closes and gives the focus
back to the button. While the steps of an item run the button is busy. The showcase «Tasks and progress» has the status
of a task with its transitions.

### 2.35 Graph

Nodes and connections read from one data source and laid out automatically from left to right: the statuses of a
workflow and its transitions, the steps of a process, the dependencies between items. It is read-only.

```json
{
  "type": "graph",
  "source": "workflow",
  "nodes": { "field": "statuses", "valueKey": "values.status", "toneField": "category",
             "tones": { "new": "neutral", "indeterminate": "primary", "done": "success" } },
  "edges": { "field": "transitions", "labelField": "name" },
  "highlight": "{{ has(data.issue) ? data.issue.status : '' }}",
  "start": "open",
  "caption": "Workflow of the issues"
}
```

The data source answers with both lists, for example `{ "statuses": [...], "transitions": [...] }`; `field` says where
each one is (the answer itself, or its `items`, without it).

| Property | What it does |
| --- | --- |
| `nodes` | `keyField` (`id`), `labelField` (`name`), `valueKey` to translate the labels, `toneField` and `tones` for the colour; without `tones` the value of `toneField` is the tone itself. |
| `edges` | `fromField` (`from`), `toField` (`to`), `labelField` for the name of the connection. An empty `from` means «from any node»: the connection starts from a small «Any» marker above its node. |
| `highlight` | Key of the node to outline, usually an expression (the current status). |
| `start` | Key of the first node, marked with a dot; without it the nodes that nobody reaches come first. |
| `edgeLabels` | Whether the names of the connections are shown at first (`true` by default). |
| `height` | Height of the drawing area (360 px by default); a larger graph scrolls inside it. |
| `caption` | Caption under the graph, also the name of the drawing for screen readers. |

How the layout works (`layoutGraph`, a pure function): the start node goes in the first column, every other node in
the column after the nearest node that leads to it; within a column the nodes are ordered to cross fewer connections.
Connections that go back (to the same or an earlier column) are dashed arcs below the nodes, one lane each.

```
     (Any)
       ╎ Back to the start
       ▼
 ● [To do] ──Start──▶ [In progress] ──Finish──▶ [Done]
       ▲                 ╎   ▲                     ╎
       ╰╌╌╌╌╌╌Pause╌╌╌╌╌╌╯   ╰╌╌╌╌╌╌Reopen╌╌╌╌╌╌╌╌╯
```

The toolbar zooms from 50% to 200% and switches the names of the connections on and off. The drawing follows the light
and dark themes. Screen readers do not read the drawing: they get the nodes (with «current» and «start») and the
connections («To do → In progress: Start») as two lists. The workflow window of the showcase «Tasks and progress»
shows the statuses of the tasks with the current one outlined.

### 2.36 Inline editing in the form

Like the summary and the description of a work item: the form shows its values as text and each field is changed on its
own. With `edit: "inline"` there are no input boxes until the user opens one field, and every confirmation saves only
that field with the steps of `onSave`, which see its name in `field` and its new value in `value`.

```json
{ "type": "form", "source": "workItem", "edit": "inline",
  "fields": [
    { "name": "summary", "type": "text", "label": "Summary", "display": "heading", "required": true, "maxLength": 120 },
    { "name": "description", "type": "richtext", "label": "Description", "emptyText": "Add a description…" },
    { "name": "key", "type": "text", "label": "Key", "readOnlyIf": "{{ true }}" }
  ],
  "onSave": [{ "call": "patchWorkItem" }, { "refresh": "workItem" }] }
```

with the call sending only the field that changed: `"body": "{{ {field: value} }}"` and `"method": "PATCH"`.

```
  Summary (heading)               opened with a click, Enter or Space
  Login fails after the change    ┌──────────────────────────────┐
                                  │ Login fails with SSO         │
  Description                     └──────────────────────────────┘
  Add a description…                                       [✓] [✕]
```

- **Reading.** Each value is text: options by their label, a `lookup` by the label of its row (asked of the service
  with `lookupKey` when it is not among the loaded rows), dates in the format of the language, lists separated by
  commas, `richtext` as formatted text. `display: "heading"` makes a text field a large title (its label stays for
  screen readers only). An empty value shows `emptyText` («Click to add» if absent) in a quiet colour.
- **Opening.** A click, or Enter or Space on the focused value, opens the editor of that field only, with the focus in
  it. Opening another field closes the first one without saving it. A field with `readOnlyIf` true is only text: no
  button, no focus.
- **Confirming.** Single-line fields (`text`, `number`, `radio`, `multiselect`, `tags`, `date`, `datetime`)
  have two small buttons on the right, ✓ and ✕; Enter in the text box confirms. A `select` or a `lookup` opens with
  its list and is confirmed by choosing a value (clearing it confirms an empty value); it has only ✕. `textarea` and
  `richtext` have Save and Cancel under them; Ctrl+Enter (⌘+Enter) saves. Escape cancels, after closing a list of
  options or a calendar that is open.
- **Checkboxes and switches** stay controls: every change runs `onSave` at once, and the control goes back to the
  old value if the checks or a step fail. With `readOnlyIf` true they are disabled.
- **Checks and errors.** Confirming checks the field with its rules (`required`, `maxLength`, `validation`…): an
  error keeps the editor open with the message. Then `onSave` runs; if a step fails the editor stays open with what
  the user typed, and the field errors of the service (`/summary`) go under the field. A value that did not change
  closes the editor without running the steps. Cancel puts back the value the field had. An emptied field that is not
  text (a number, a date, a choice) is saved as null.
- **Fields from the data** (`fieldsFrom`) behave the same; their `field` is the full key, for example
  `custom.reviewDate` when `into` is `custom` (a body `{{ {field: value} }}` sends `{"custom.reviewDate": …}`).
- **Other types.** `file`, `password` and `repeater` fields are drawn as in a normal form; the `actions` of the
  form, if any, stay under the fields.

The showcase «Forms» has a work item in the section «Inline editing».

### 2.37 Highlighted rows and cards

A `table`, a `dataTable`, a `serverDataTable` or a `kanban` can make some rows stand out, for example the flagged issues of a backlog or a board.

```json
{ "type": "kanban", "source": "issues", "columnField": "status", "titleField": "summary",
  "highlight": { "when": "{{ row.flagged }}", "icon": "flag", "label": "{{ t('issues.flagged', 'Flagged') }}" } }
```

```
 kanban                               table
 ┌────────────────────────┐           ┌──┬──────────┬──────────┐
 ▌ ⚑ ODT-12 Login fails   │  warning   ▌⚑ ODT-12  │ To do    │  ← tinted row, mark in the first cell
 ▌   High   Points: 3     │  tone      ├──┼──────────┼──────────┤
 └────────────────────────┘           │  ODT-13  │ Done     │
                                      └──┴──────────┴──────────┘
```

- **`when`** decides, with the row as `row`. An expression in error does not highlight (fail-closed) and goes to the
  diagnostics.
- **`tone`**: `warning` (default), `danger`, `success` or `primary`. The background, the stripe on the leading edge
  and the icon take the colours of the theme, the same as the alerts, dark themes included.
- **Not by colour alone** (WCAG 1.4.1): the card has the mark before its title, the row in its first cell. The mark is
  an icon (`icon`, `warning` if absent, drawn filled when it has a filled form) whose name is `label`, read by screen
  readers and shown as its tooltip. `label` is required; if it resolves to empty text the name is «Highlighted».
- **A selected row** keeps the colour of the selection; the mark stays.
- **Group rows** of `dataTable` and `serverDataTable` are never highlighted, only the rows of data under them.
- `when` is evaluated once per load of the data, not at every redraw; in `dataTable` only for the rows of the current
  page (with tens of thousands of rows the others are never drawn), in `serverDataTable` for the rows in view.
- In the showcases: «Tasks» flags the reminder to Walker & Co. on the board; «Tables» highlights the orders awaiting
  approval with `clock-circle`, an Ant Design icon; «Datatable» marks the transactions to check, in the page and from
  the service.

### 2.38 Actions under a field

A field of a form can have small links under it, such as «Assign to me» under the assignee of an issue:

```json
{ "name": "assignee", "type": "lookup", "label": "Assignee", "lookup": { "source": "people", "valueField": "id", "labelField": "name" },
  "actions": [
    { "label": "Assign to me", "value": "{{ user.id }}", "visibleIf": "{{ value != user.id }}" }
  ] }
```

```
 Assignee
 ┌──────────────────────────┐
 │ Luca Bianchi             │
 └──────────────────────────┘
 Assign to me                     ← a link, after the field in the tab order
```

- **`value`** puts a value in the field, as if the user had chosen it. In an inline form (§ 2.36) it is saved at
  once through `onSave`, with `field` and `value`, and goes back if the checks or a step fail; in a normal form it only
  changes the field. It is disabled while the field is read-only.
- **`onClick`** runs steps instead, for anything else (open a dialog, call a service). An action has one of the two.
- The expressions of an action (`label`, `visibleIf`, `enabledIf`, `value`, the steps) see `form`, `field` (the
  name of the field) and `value` (its current value): «Assign to me» hides itself once the issue is assigned to the
  user. `icon` and `tooltip` are as on the other actions.
- The links are grouped under the label of the field, so a screen reader says which field they belong to. While an
  inline field is being edited they are hidden. Only in a form: a standalone `input` and the filter bar ignore them.
- The showcase «Forms» has «Unassign» under the assignee of the work item, in the section «Inline editing».

## 3. Implementation notes and known limits

- **Loading data sources.** A GET data source reloads by itself only if the resolved request (URL and parameters) changes. A state change that does not touch the request (a selection, a wizard step, a chosen node) does not trigger new calls; to reload anyway, use the `refresh` step.
- **Live data sources.** With `live` (a same-origin event stream and the names of its events) a GET data source is read again when one of its events arrives, or after the stream reconnects; a burst of events within 200 ms is one read, and it behaves like a `refresh` (previous data visible while loading). Only while the screen is open and allowed; without the `LiveUpdates` port (an application that does not provide it) nothing is listened to. The boards of the showcase tasks screen use it ([ADR-19](adr-19-live-data-sources.md)).
- **Expressions before the data.** A state variable that does not exist yet makes the expression fail, and the error ends up in the technical diagnostics: in conditions use `has(state.x)`. Parameter maps of `t()` with values of different types need `dyn(...)`; for numbers formatted in the language write `{n, number}`.
- **Lookup and file field variables.** Data sources always have `search`, `lookupKey` and `word` (null until needed: lookups, text fields with suggestions, mentions); `file` exists in `upload` data sources.
- **Lookup.** The text of a value not loaded is resolved only if the data source uses `{{ lookupKey }}`; otherwise the field shows the value itself until the user searches.
- **Repeatable rows.** No nested rows inside a row.
- **Fields from a data source.** The rules across fields of the form (`validation`, § 2.29) check only the fields of `fields`; expressions read a data field as `form.custom.name`. A lookup, or any control with settings of its own, comes only from a model of `types`.
- **Data table.** Works on the loaded rows (tested up to 50,000 rows in the functions and 20,000 in the component); beyond that, `serverDataTable`.
- **Server data table.** No row selection or expandable rows; open groups are not remembered between visits to the screen. The `refresh` step on a non-GET data source calls nothing: it only notifies the components that query it themselves.
- **Charts.** No zoom, filled areas or more than two axes.
- **Standalone fields.** To block an action until the fields are valid, use the `validate` step (§ 2.22); as always, the real check belongs to the service. Rules across fields (§ 2.29) see the other standalone fields of the same validation group.
- **Validation.** Relative dates are counted on the local day (no time of day); patterns are tested on values up to 1000 characters; the password strength is an estimate, not a check against leaked passwords. The front end is not a boundary: every rule that matters is repeated by the service.
- **Layout containers.** Widths chosen with the dividers last for the visit to the screen (they are not remembered); no grid cells spanning several rows; fixed stacking thresholds (600 px grid, 768 px border).
- **Kanban.** A move waits for the service's response (no optimistic update); a card changes lane only with `moveAcrossLanes`; limits warn but do not block; with swimlanes the board needs about 220 px per column and scrolls sideways on narrow screens.
- **Formatted text.** No tables, images, colours or HTML; three levels of headings and lists. The editor uses the browser's editing commands: the result is always normalised to the restricted Markdown, but rendering while typing may vary slightly between browsers.
- **Export.** The rows are those the data source returns in one call: for paged stores the service must offer a complete read (or an export of its own).

### 3.1 Limits overcome (October 2026)

After the first delivery these were solved: text of values not loaded in the lookup (`lookupKey`); multipart files up to 100 MB; lookup and file in repeatable rows; a tree fully usable from the keyboard; data table for tens of thousands of rows and, server-side, for stores of any size; stacked bars, right axis and combined charts.
