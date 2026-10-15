# Quadrava component catalogue

List of the components of the Quadrava JSON language, with the specification of those added in October 2026. Every new component has unit tests in the `components` library and an example in the demo **showcase** (area «Vetrina componenti»).

Rules common to all components, new ones included:

- texts go through `{{ }}` and the translation catalogue (`t('key', 'fallback')`); Quadrava's own strings are `lc.*` keys in Italian and English;
- no HTML from data or translations: values are always shown as text;
- expressions are **fail-closed**: if a condition cannot be evaluated, the component is hidden or disabled;
- `visibleIf`, `hiddenIf`, `tooltip` apply to every node (the `lc-node` container applies them); `grow`, `span` and `region` apply to every node inside a layout container (§ 2.21);
- colours and sizes only from the theme (`var(--lc-*)` or the NG-ZORRO tokens);
- a component that reads a data source shows the wait with the shared `lc-busy` indicator (§ 2.27), not with one of its own.

## 1. Available

| Node / element | What it is for |
| --- | --- |
| `section` | Panel with a title that groups other nodes, stacked or side by side (`layout: "row"`). |
| `box`, `grid`, `border` | Layout containers without a frame: row or column, column grid, north/south/west/east/centre regions (§ 2.21). |
| `input` | A standalone field (text box, drop-down, date…) bound to the screen state (§ 2.20). |
| `image`, `link` | Image with alternative text; link to a screen or to an https address (§ 2.23). |
| `progress` | Progress bar or circle (§ 2.23). |
| `timeline`, `kanban` | Events in date order; cards in columns that can be moved (§ 2.24). |
| `text` | Plain text (with line breaks), heading (`style: heading`) or formatted text (`format: markdown`, § 2.26). |
| `button` | Button that runs a sequence of steps (`onClick`). |
| `filterBar` | Filter bar that writes to the screen state (`bind`). |
| `table` | Table with server-side paging, cell formats, sorting, selection and bulk actions, action menu, expandable rows, clickable cells and totals. |
| `dataTable` | Data table with filters, sorting and grouping in the page (§ 2.18). |
| `serverDataTable` | The same data table, but filters, sorting, groups, totals and pages are computed by the service (§ 2.19). |
| `form` | Form with validation, conditional fields, column grid and actions. |
| `tabs` | Tabs, each with its own nodes. |
| `detail` | Read-only detail card (label and value; a `format: markdown` field is shown formatted). |
| `alert` | In-page message (info, success, error), also formatted (`format: markdown`). |
| `stats` | Indicators (KPIs). |
| `wizard` | Step-by-step procedure. |
| `tree` | Tree view. |
| `calendar` | Monthly calendar with events. |
| `chart` | Bar, line and pie charts. |
| Fields | `text`, `number`, `select`, `checkbox`, `date`, `textarea`, `datetime`, `radio`, `switch`, `multiselect`, `lookup`, `file`, `repeater`, `richtext` (§ 2.26). |
| Cell formats | `text`, `number`, `currency`, `percent`, `date`, `datetime`, `boolean`, `badge`, `markdown`. |
| Steps | `set`, `call` (with `as` and `onError`), `refresh`, `navigate`, `toast`, `confirm`, `dialog`, `validate`, `print`, `export` (§ 2.22), `if` and `run`; named sequences in `actions` (§ 2.22b). |
| Shell | Side bar (`lc-sidebar`, with search, counters and keyboard support: § 2.25; the application brand is inserted with an `lcBrand` element, otherwise logo and name), user menu (`lc-user-menu`), responsive top bar, `lc-quadrava-wordmark` logotype, syntax-highlighted code viewer `lc-code-view`, tools in section headers (`SectionTools`: «JSON» and «Aiuto» in the demo showcase). |

## 2. Added in October 2026

Built in this order, one per commit, each with tests (schema, component and showcase) and an example in the demo showcase: «Tabelle avanzate» (1–5), «Campi e form» (6–11), «Schede, dettaglio e messaggi» (12), «Cruscotto» (13, 17), «Procedure e viste» (14–16), «Datatable» (18, 19), «Campi a sé» (20, 22), «Contenitori di layout» (21, 22), «Attività e avanzamento» (23, 24); the menu (25) is visible in all of them.

| # | Component | Area | Status |
| --- | --- | --- | --- |
| 1 | Column sorting | table | done |
| 2 | Row selection and bulk actions | table | done |
| 3 | Row action menu | table | done |
| 4 | Expandable detail rows | table | done |
| 5 | Number format, clickable cells, totals row | table | done |
| 6 | New field types: text area, date and time, radio, switch, multiple selection | fields | done |
| 7 | Field with search on a data source (lookup) | fields | done |
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
| 22 | validate, print and export (CSV) steps | actions | done |
| 23 | Image, link, progress | visualisation | done |
| 24 | Timeline and kanban | visualisation | done |
| 25 | Menu: search, counters, keyboard | shell | done |

### 2.1 Column sorting

Columns with `sortable: true` show the sort arrows. A click cycles through ascending, descending and no sorting.

```json
{ "type": "table", "source": "ordini",
  "sort": { "bind": "state.ordinamento", "default": { "field": "numero", "direction": "desc" } },
  "columns": [{ "field": "numero", "sortable": true }, { "field": "cliente", "sortable": true }] }
```

- **Table without server-side paging**: it sorts the loaded rows in the page (numbers as numbers, texts according to the active language, ISO dates as text).
- **Table with `paging: server`**: the service does the sorting. The table writes `{ "field": …, "direction": "asc" | "desc" }` to the state given by `sort.bind` and goes back to the first page; the data source reads it in its parameters, for example `"sort": "{{state.ordinamento.field}}"`. Without `bind` the rows of the current page are sorted in the page only, with a technical diagnostic.
- `sort.default` applies when the screen opens (the state already exists at the first load, as for filters).

### 2.2 Row selection and bulk actions

```json
{ "type": "table", "source": "fatture",
  "selection": { "bind": "state.selezionate", "key": "id" },
  "bulkActions": [{ "label": "{{ t('fatture.invia_selezionate', 'Invia le selezionate') }}",
    "enabledIf": "{{ size(selection) > 0 }}",
    "onClick": [{ "call": "inviaMolte", "args": { "ids": "{{ selection.map(r, r.id) }}" } }, { "refresh": "fatture" }] }] }
```

- One checkbox per row and one in the header (all / none / partial).
- The `bind` state holds the **keys** of the chosen rows; bulk actions see the whole rows in the `selection` variable.
- The selection applies to the loaded rows: keys that no longer appear (new page, new filters) are removed.
- Above the table appears the bulk-action bar with the number of chosen rows.

### 2.3 Row action menu

`rowActionsInline: n` shows only the first `n` visible actions as buttons; the others go into a «⋯» menu (`0` = all in the menu). Without the property they all stay buttons. Disabled actions stay visible and disabled in the menu too.

### 2.4 Expandable detail rows

```json
"expand": { "components": [{ "type": "text", "text": "{{ row.note }}" }] }
```

Every row has a button that opens below it an area with the nodes of `expand.components`, which see the row as `row` (tables, details and buttons too). `expand.expandIf` (an expression with `row`) decides which rows can be expanded.

### 2.5 Number format, clickable cells, totals row

- Cell format `number` with `decimals` (0 to 6), right-aligned and with digit grouping according to the language.
- `onClick` on a column: the value becomes a link that runs the steps with the row in `row` (for example `navigate` to the detail).
- `aggregate` on a column (`sum`, `avg`, `min`, `max`, `count`): a totals row appears at the bottom of the table, computed on the loaded rows and with the same format as the column.

### 2.6 New field types

| Type | Value | Notes |
| --- | --- | --- |
| `textarea` | text | `rows` (visible rows, 2 to 20) |
| `datetime` | `YYYY-MM-DDTHH:mm` (local time) | date picker with time |
| `radio` | one of the values of `options` | radio buttons, translated with `optionKey` |
| `switch` | `true` / `false` | switch |
| `multiselect` | list of values from `options` | becomes a list parameter in filters |

They work in the form and, where it makes sense, in the filter bar (`switch`, `multiselect`, `datetime`, `radio`; there `textarea` behaves like `text`).

### 2.7 Field with search on a data source (lookup)

```json
{ "name": "cliente", "type": "lookup",
  "lookup": { "source": "clienti", "valueField": "id", "labelField": "nome", "minChars": 2 } }
```

```json
"clienti": { "type": "rest", "method": "GET", "url": "/api/clienti",
             "params": { "q": "{{ search }}", "id": "{{ lookupKey }}" } }
```

As the user types, the field runs the `source` data source (GET) with the `search` variable and offers the returned rows. The field value is `valueField`; the text shown is `labelField`. Searches in quick succession are merged (300 ms wait) and an old response does not overwrite a newer one.

If the current value is not among the known rows (for example in an edit form) and the data source uses `{{ lookupKey }}`, the field asks the service for that value's row, once, and shows its text instead of the id. The field's requests do not change the rows the same data source shows to other components (`ScreenRuntime.query`).

### 2.8 File upload

```json
{ "name": "allegato", "type": "file", "accept": ".pdf,image/*", "maxSizeKb": 20480, "upload": "caricaAllegato" }
```

- One file per field; `accept` and `maxSizeKb` are checked before anything is sent.
- With `upload` the file is sent immediately to the data source (POST). In **multipart** (`uploadAs: "multipart"`, the default) the file travels as a file in the `file` part of the request, up to 100 MB; the `file` variable has `name`, `type` and `size`, and every body entry (for example `"body": "{{ file }}"`) becomes a text part. In **base64** (`uploadAs: "base64"`) the content is in `file.content` inside the JSON body, up to 10 MB.
- The field value becomes `{ name, type, size }` plus the service response (for example the `id`). Without `upload` the value also contains `content` (base64, up to 10 MB).
- The `DataClient` port receives the file in `DataRequest.file`; `HttpDataClient` sends it as `FormData`.
- The file name is always shown as text.

### 2.9 Column grid in the form

`columns` (1–4) on the form and `span` on the field (how many columns it takes). When space is tight (less than 600 px of available width) the form goes back to one column.

### 2.10 Repeatable rows in the form

```json
{ "name": "righe", "type": "repeater", "minRows": 1, "maxRows": 20,
  "fields": [{ "name": "descrizione", "type": "text", "required": true }, { "name": "importo", "type": "number" }] }
```

The value is a list of objects. Every row has its own fields (`text`, `number`, `select`, `checkbox`, `date`, `textarea`, `switch`, `lookup`, `file`; no nested rows) and a button to remove it; below is the button to add one. Required flags and validation rules apply row by row; rules and data sources of the row's fields see the row as `item`. A form with repeatable rows widens up to 880 px.

### 2.11 Dialog with a form

New `dialog` step: it opens a window with a form; the `onSubmit` steps see the values in `form`. If they succeed the window closes and the sequence continues; if the user cancels, the sequence stops silently (like `confirm`).

```json
{ "dialog": { "title": "{{ t('ordini.nota', 'Aggiungi una nota') }}",
  "fields": [{ "name": "testo", "type": "textarea", "required": true }],
  "initial": { "testo": "{{ row.note }}" },
  "submitLabel": "{{ t('comune.salva', 'Salva') }}",
  "onSubmit": [{ "call": "salvaNota", "args": { "id": "{{ row.id }}" } }] } }
```

The window is a new core port (`FormDialog`), implemented with the NG-ZORRO modal; without an implementation the step does not proceed (fail-closed).

### 2.12 Tooltip in the detail card

`detail` fields with a `tooltip` show the help icon next to the label, as in forms.

### 2.13 Indicators (KPIs)

```json
{ "type": "stats", "source": "riepilogo",
  "items": [{ "label": "{{ t('cruscotto.fatturato', 'Fatturato') }}", "field": "fatturato", "format": "currency", "tone": "success" },
            { "label": "{{ t('cruscotto.da_incassare', 'Da incassare') }}", "value": "{{ state.totale }}", "format": "number" }] }
```

A row of tiles with a label and a large value. The value comes from a field of the data source (`field`) or from an expression (`value`), with the same formats as columns. They are laid out in a grid and wrap on narrow screens.

### 2.14 Step-by-step procedure (wizard)

```json
{ "type": "wizard", "bind": "state.passo",
  "steps": [{ "label": "Dati", "components": [...], "nextIf": "{{ state.cliente != null }}" },
            { "label": "Riepilogo", "components": [...] }] }
```

Step indicator at the top, content of the current step, Back and Next buttons. The current step lives in the state (`bind`), so a button can also move it with `set`. Next is disabled until `nextIf` is true. The last step has no Next: it usually contains the form or the confirmation button.

### 2.15 Tree view

```json
{ "type": "tree", "source": "categorie", "keyField": "id", "labelField": "nome", "childrenField": "figli",
  "bind": "state.categoria", "searchable": true, "onSelect": [{ "toast": "{{ row.nome }}" }] }
```

The data source returns the root nodes with their children nested. Choosing a node writes its key to the state (`bind`) and runs `onSelect` with the node in `row`. With `searchable` a field appears that highlights and opens the matching branches.

From the keyboard it follows the WAI-ARIA «tree» pattern: up and down arrows between visible nodes, right opens the branch or enters the first child, left closes the branch or goes up to the parent, Home and End, Enter or Space choose; only one node at a time is reachable with Tab.

### 2.16 Calendar

```json
{ "type": "calendar", "source": "scadenze", "dateField": "data", "labelField": "titolo",
  "badgeField": "stato", "badges": { "scaduta": "danger", "pagata": "success" },
  "bind": "state.mese", "onSelect": [{ "navigate": "fattura-dettaglio", "params": { "id": "{{ row.id }}" } }] }
```

Month view with the events in the days (at most three, then «+n»). When the month changes the calendar writes `YYYY-MM` to the `bind` state, so the data source can load just that month. A click on an event runs `onSelect` with the event in `row`.

### 2.17 Charts

```json
{ "type": "chart", "kind": "bar", "stacked": true, "source": "vendite", "categoryField": "mese", "categoryFormat": "month",
  "series": [{ "field": "attive", "label": "Attive" }, { "field": "passive", "label": "Passive", "tone": "danger" },
             { "field": "margine", "label": "Margine", "kind": "line", "axis": "right" }],
  "format": "currency", "rightFormat": "percent", "height": 280 }
```

`bar`, `line` and `pie` types, drawn in SVG by Quadrava (no external library) with the theme colours. Bars can be side by side or stacked (`stacked`, negatives downwards); a series can sit on a second axis on the right (`axis: "right"`, format `rightFormat`) and have its own type (`kind`), for combined charts such as bars plus a line. Every chart has a legend, values on hover and, for accessibility, an equivalent table readable by screen readers.

### 2.18 Data table

Table for analysing an already loaded set of rows in the page: every column can be filtered, sorted and used for grouping.

```json
{ "type": "dataTable", "source": "movimenti", "pageSize": 15, "groupBy": ["conto"],
  "columns": [
    { "field": "data", "format": "date", "sortable": true, "filter": "date" },
    { "field": "conto", "sortable": true, "filter": "select", "groupable": true },
    { "field": "categoria", "filter": "select", "groupable": true },
    { "field": "descrizione", "filter": "text" },
    { "field": "importo", "format": "currency", "sortable": true, "filter": "number", "aggregate": "sum" }] }
```

- **Per-column filters** from the header: `text` (contains), `select` (choice among the values present), `number` (from / to), `date` (range). A button clears all filters.
- **Sorting** on one column at a time, as in the table.
- **Grouping**: the user picks one or more `groupable` columns (in order) from a selector above the table; `groupBy` is the initial choice. Every group has a header with the value, the number of rows and the totals of the columns with `aggregate`; groups open and close.
- Grand total at the bottom, in-page paging (`pageSize`), row actions as in the table.
- Filters, sorting and groups work on the loaded rows. Only the current page is rendered, cell texts are computed once per row and the text filter waits for a 200 ms pause: with 20,000 rows, in the browser, sorting takes about 20 ms and filtering about 40 ms on top of the wait. For stores of hundreds of thousands of rows, use `serverDataTable` (§ 2.19).

### 2.19 Service-driven data table

The same interface as the data table (header filters, sorting, group choice, totals, row actions), but the browser receives only the visible page and groups: all computation belongs to the service. Suited to stores of hundreds of thousands or millions of rows.

```json
"dataSources": { "ricerca": { "type": "rest", "method": "POST", "url": "/api/movimenti/ricerca", "body": "{{ request }}" } },
...
{ "type": "serverDataTable", "source": "ricerca", "groupBy": ["conto"], "pageSize": 15,
  "defaultSort": { "field": "data", "direction": "desc" }, "bind": "state.ricercaMovimenti",
  "columns": [ ...as in the dataTable... ] }
```

**Request.** The table runs the data source with the `request` variable (usually the whole body of a POST):

```json
{ "page": 0, "size": 15,
  "sort": { "field": "data", "direction": "desc" },
  "filters": [ { "field": "descrizione", "kind": "text", "text": "affitto" },
               { "field": "conto", "kind": "select", "values": ["Cassa"] },
               { "field": "importo", "kind": "number", "from": 100, "to": null },
               { "field": "data", "kind": "date", "from": "2026-01-01", "to": "2026-03-31" } ],
  "groupBy": ["conto"], "groupPath": [ { "field": "conto", "value": "Cassa" } ],
  "distinct": "categoria" }
```

- `groupPath` tells which open group is being read; empty at the first level.
- `distinct` is present only when the table asks for the values of a choice filter: the response is `{ "values": [...] }`, computed with the other filters applied.

**Response.**
- If `groupPath` is shorter than `groupBy`, the service responds with the groups of the next level: `{ "groups": [ { "value": "Cassa", "count": 50000, "aggregates": { "importo": -1234.5 } } ], "total": 4, "totals": { "importo": ... } }`.
- Otherwise it responds with the rows: `{ "items": [...], "total": 50000, "totals": { "importo": ... } }`.
- `total` is the number of groups or rows at that level (used for paging); `totals` are the grand totals of the columns with `aggregate`, shown at the bottom.

**Behaviour.**
- Sorting, filters and groups go back to the first page; the text filter waits for a 300 ms pause. A response arriving after a newer one is discarded.
- An open group loads its rows (or subgroups) in pages, with the «Mostra altre» (show more) button. The `refresh` step on the data source and a page change keep groups open and reload their content up to the point reached.
- `bind` writes `{ sort, filters, groupBy }` to the state, useful for exports or other calls with the same criteria.
- The service must check the fields it receives (only known columns in `sort`, `filters`, `groupBy`, `distinct`) and cap `size`: the request comes from the browser and cannot be trusted.

### 2.20 Standalone fields (input)

A field used on its own, outside forms and filters: text box, number, drop-down, multiple choice, radio buttons, checkbox, switch, date, date and time, search (lookup), file, repeatable rows. The value lives in the **screen state**, so data sources, expressions, texts and steps read it like any other state.

```json
{ "type": "input", "bind": "state.filtro.tipo", "default": "attiva",
  "field": { "name": "tipo", "type": "select", "label": "Tipo", "options": ["attiva", "passiva"], "optionKey": "valori.tipo" },
  "onChange": [ { "refresh": "fatture" } ] }
```

- `field` has the same properties as form fields (type, label, options, `required`, `validate`, `readOnlyIf`, `lookup`, `upload`…). Form and standalone field draw the control with the same component (`lc-field-control`).
- `bind` is the path in the state; if missing it is `state.<field name>`. The runtime creates the state **before** the first load of the data sources: `default`, otherwise false for checkbox and switch and null for the others.
- Free text (text, number, text area) is written to the state when leaving the field or on Enter, so data sources are not reloaded on every keystroke; the other types on every choice. A cleared field is `null`; numbers arrive as numbers.
- `onChange`: steps run after every change, with the new value in `value`.
- `required` and `validate` errors after the first change. The node also accepts `enabledIf` and `readOnlyIf`, which add to those of the field.
- In the editor palette every type is an item of the «Campi» group (Casella di testo, Elenco a discesa…); names of new fields are not repeated within the screen.

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
  { "type": "input", "region": "west", "field": { "name": "stato", "type": "radio", ... } },
  { "type": "table", "source": "fatture", "columns": [ ... ] } ] }
```

Common rules: a hidden child (`visibleIf`) takes no space; inside containers fields fill the cell (outside they stay at most 560 px wide); sections side by side stretch to the row height. Containers nest freely (a box inside a border region, a grid in a section…). In the editor they are in the «Struttura e testi» group; the border starts with three sample areas (north, west, centre).

### 2.22 validate, print and export steps

```json
"onClick": [
  { "validate": "ordine" },
  { "call": "salva", "args": { "nome": "{{ state.nome }}" } },
  { "export": { "source": "fatture", "fileName": "fatture",
                "columns": [ { "field": "numero", "label": "{{ t('comune.numero', 'Numero') }}" }, { "field": "importo" } ] } },
  { "print": true }
]
```

- **validate**: checks the standalone fields of the given group (`group` of `input` nodes, `default` if not given; `*` = all those on screen). Every field shows its own errors; if one is invalid the warning «Controlla i campi evidenziati» (check the highlighted fields) appears and the sequence stops. A hidden field does not count.
- **print**: opens the browser's print dialog; the runtime's print stylesheet hides menu, top bar, buttons and pagination.
- **export**: runs the data source (GET; `args` as in `call`) and downloads the rows (a list, or the `items` of a paged response) as CSV for Excel in Italian: semicolons, CRLF line endings, UTF-8 BOM. Headers go through `t()`; values are the raw ones (unformatted numbers). Cells starting with `=`, `+`, `-`, `@` (or tab and carriage return) are prefixed with an apostrophe: a spreadsheet does not run them as formulas. The file name is cleaned up and gets `.csv`.

### 2.22b Before and after a call: response, conditions, named sequences, errors

Steps are a sequence: what has to happen before a call (`validate`, `confirm`, `set`) and after it (`toast`, `refresh`, `navigate`) goes before and after the `call` step, which stops the sequence if it fails. Four additions let you use the response and avoid repeating yourself:

```json
"actions": {
  "salvaOrdine": [
    { "validate": "ordine" },
    { "confirm": "{{ t('ordini.conferma', 'Salvare l\\'ordine?') }}" },
    { "call": "creaOrdine", "as": "creato",
      "onError": { "if": "{{ error.status == 409 }}", "then": { "toast": "Ordine già presente" }, "else": { "toast": "Salvataggio non riuscito" } } },
    { "if": "{{ creato.stato == 'bozza' }}", "then": { "toast": "Salvato come bozza" } },
    { "refresh": "ordini" },
    { "navigate": "ordine-dettaglio", "params": { "id": "{{ creato.id }}" } }
  ]
},
"components": [{ "type": "button", "label": "Salva", "onClick": { "run": "salvaOrdine" } }]
```

- **`as` in the `call` step**: the following steps of the same sequence see the response under that name (`{{ creato.id }}`). The name cannot be that of an existing variable (`user`, `state`, `params`, `row`, `form`, `error`…).
- **`if`** with `then` and `else` (optional): one step or a list of steps per branch. The condition must yield true or false; if it cannot be evaluated (or yields something else) the sequence stops with the generic warning and the technical diagnostic, without running either branch (fail-closed).
- **`actions` and `run`**: named sequences of the screen, called from buttons, row actions, forms… with the variables of the place where they are called (`row`, `form`). Variables created inside (`as`) stay theirs. A sequence that does not exist, or calls nested more than eight levels deep (a cycle), stop the sequence. The editor suggests the names in `run` and flags missing ones.
- **`error.status` in `onError`**: the HTTP status of the response (0 if the service cannot be reached), to behave differently according to the error. The server's message is not available: it might contain internal details.

What **must** happen regardless (checks, rules, audit, several calls to keep consistent) does not belong in the interface, which can be bypassed: it belongs in the service, in the BFF or in an endpoint that combines them. Steps serve the user experience. The «Componenti base» showcase has an example of each (section «Sequenze e risposte»).

### 2.23 Image, link, progress

- **image**: `src` (relative, `https://` or `data:image/png|jpeg|gif|webp|svg+xml;base64`; may contain `{{ }}`), mandatory `alt`, `width`/`height` in px, `fit` (`contain` or `cover`). Any other address (javascript:, http:, `//`, `..`) is not loaded: the alternative text is shown, as when the image fails to load. Lazy loading, no `Referer`.
- **link**: `label` and `screen` (+ `params`) to open a screen of the application, **or** `href`: `https://…` (new tab, `noopener noreferrer`, external-link icon) or a relative path (same tab). The schema rejects other protocols and the presence of both.
- **progress**: `value` and `max` (100 if missing) as numbers or expressions, `label`, `kind` (`line` or `circle`), `tone`. Percentage rounded between 0 and 100; a non-numeric value shows «—». Accessible as a `progressbar` with its current value.

### 2.24 Timeline and kanban

```json
{ "type": "timeline", "source": "eventi", "dateField": "data", "labelField": "titolo", "descriptionField": "nota",
  "toneField": "esito", "tones": { "ok": "success", "ko": "danger" }, "withTime": true }

{ "type": "kanban", "source": "attivita", "columnField": "stato", "titleField": "titolo", "descriptionField": "chi",
  "columns": [ { "value": "da-fare", "label": "Da fare" }, { "value": "fatto", "label": "Fatto", "tone": "success" } ],
  "moveIf": "{{ can('attivita.attivita.modifica') }}",
  "onMove": [ { "call": "sposta", "args": { "id": "{{ row.id }}", "stato": "{{ to }}" } }, { "refresh": "attivita" } ] }
```

- **timeline**: the data-source rows in date order (`order`: `desc` by default, `asc`); a date without a time counts as a local day; rows without a valid date are not shown.
- **kanban**: columns in the order of `columns`, with a count; rows whose value is not a column are not shown. With `onMove` a card is moved by dragging it to another column or, from the keyboard, with the «Sposta «…» in…» (move to) button (menu of the other columns). The steps see `row`, `from` and `to`; the card changes column when the reloaded data says so (the actual move belongs to the service). `moveIf` decides per row, fail-closed.

### 2.25 Menu: search, counters, keyboard

- **Search**: a box at the top of the menu (expanded bar). It finds the area's items whose name, or whose group's name, contains the text, ignoring case and accents; every result shows its path. Enter opens the first one, Down arrow moves into the results, Esc clears.
- **Counters**: in the navigation, `"badges": { "url": "/api/menu/contatori", "refreshSeconds": 60 }`. The service (relative GET, through the BFF) responds `{ "<item id>": number }`; positive integers are kept, above 99 «99+», a dot when the bar is collapsed. A closed group shows the sum of its items' counters (subgroups included); when open, the numbers move to the items. They are re-read periodically (only while the page is visible) and when returning to the page. Screen readers read «Bozze, 3 da gestire» (Drafts, 3 to handle).
- **Keyboard**: up and down arrows between visible items and groups, Home and End, right opens a group (or enters the first item), left closes it (or goes back to the group), Enter and Space on groups. Group titles are reachable with Tab and say whether they are open (`aria-expanded`).

### 2.26 Formatted text and rich text editor

**Before**, text components showed only plain text: no lists, bold or links, and plain text even lost its line breaks. Now:

- plain text (`text` without a format) keeps line breaks;
- `text` and `alert` with `"format": "markdown"`, and `detail` fields with `"format": "markdown"`, show **classic typography** written in a restricted Markdown;
- the `richtext` field type is a rich text editor with a toolbar, in the form and as a standalone field.

```json
{ "type": "text", "format": "markdown",
  "text": "{{ t('ordini.istruzioni', 'Prima di **inviare**:\\n\\n- controlla i dati\\n- allega la fattura') }}" }
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
- **Timing.** The spinner appears only if the wait exceeds 300 ms, so fast responses do not make it flash; once shown it stays at least 400 ms. After 8 seconds the label becomes «Ci vuole più del solito…» (taking longer than usual).
- **Accessibility.** The content has `aria-busy` throughout the wait. A `status` region, always present, announces «Caricamento…» (loading) when the spinner appears. With the operating system's "reduce motion" setting the spinner does not spin.
- **Actions.** Buttons, form actions and file uploads keep the spinner inside the button, which is disabled meanwhile.

In the demo the **Rete** (network) selector (normal, slow, very slow) in the top bar slows down the in-browser back end, to see the indicator and the long-wait message; it applies to the browser tab.

### 2.28 Table footer: «Aggiorna», first and last page

Table, data table and server data table share the same footer (`lc-table-footer`):

- **on the left**, optional, the **Aggiorna** (refresh) button (`"refreshable": true`): an icon with a tooltip that reloads the data source like the `refresh` step. After the click the icon spins immediately and for at least one turn (800 ms), even if the data arrives earlier, and for the same time the spinner in the centre of the table appears immediately with «Caricamento…» (without the 300 ms delay of loads not requested by the user, § 2.27): with fast responses the click would otherwise seem to do nothing. The button does not change size and another click while it spins does nothing; it is not disabled, so keyboard users do not lose focus;
- **on the right** the pages, with **first page** and **last page** buttons at the sides (disabled at the ends). Pages appear only if there is more than one.

In the showcase «Aggiorna» is in the first table of «Filtri e tabelle» and in the three tables of «Datatable».

## 3. Implementation notes and known limits

- **Loading data sources.** A GET data source reloads by itself only if the resolved request (URL and parameters) changes. A state change that does not touch the request (a selection, a wizard step, a chosen node) does not trigger new calls; to reload anyway, use the `refresh` step.
- **Expressions before the data.** A state variable that does not exist yet makes the expression fail, and the error ends up in the technical diagnostics: in conditions use `has(state.x)`. Parameter maps of `t()` with values of different types need `dyn(...)`; for numbers formatted in the language write `{n, number}`.
- **Lookup and file field variables.** Data sources always have `search` and `lookupKey` (null until needed); `file` exists in `upload` data sources.
- **Lookup.** The text of a value not loaded is resolved only if the data source uses `{{ lookupKey }}`; otherwise the field shows the value itself until the user searches.
- **Repeatable rows.** No nested rows inside a row.
- **Data table.** Works on the loaded rows (tested up to 50,000 rows in the functions and 20,000 in the component); beyond that, `serverDataTable`.
- **Server data table.** No row selection or expandable rows; open groups are not remembered between visits to the screen. The `refresh` step on a non-GET data source calls nothing: it only notifies the components that query it themselves.
- **Charts.** No zoom, filled areas or more than two axes.
- **Standalone fields.** To block an action until the fields are valid, use the `validate` step (§ 2.22); as always, the real check belongs to the service.
- **Layout containers.** Widths chosen with the dividers last for the visit to the screen (they are not remembered); no grid cells spanning several rows; fixed stacking thresholds (600 px grid, 768 px border).
- **Kanban.** No reordering of cards within a column and no per-column limits; a move waits for the service's response (no optimistic update).
- **Formatted text.** No tables, images, colours or HTML; three levels of headings and lists. The editor uses the browser's editing commands: the result is always normalised to the restricted Markdown, but rendering while typing may vary slightly between browsers.
- **Export.** The rows are those the data source returns in one call: for paged stores the service must offer a complete read (or an export of its own).

### 3.1 Limits overcome (October 2026)

After the first delivery these were solved: text of values not loaded in the lookup (`lookupKey`); multipart files up to 100 MB; lookup and file in repeatable rows; a tree fully usable from the keyboard; data table for tens of thousands of rows and, server-side, for stores of any size; stacked bars, right axis and combined charts.
