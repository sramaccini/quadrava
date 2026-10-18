# Quadrava Studio (visual editor)

Quadrava Studio, the visual editor of Quadrava (`frontend/projects/editor`), works on a **project**: the folder with the configuration and the resources of an application (§ 1a). It edits its **screens**, **data sources** shared by the screens, **navigation** (areas and menus), **themes** and **settings**, each one in its own window inside a workspace, as in an IDE: several documents can be open at once, of any kind (§ 1b). For screens it produces the same JSON the runtime reads: its users compose the screen with palette, structure and property panel, and immediately see the result drawn by the real runtime. There is no intermediate format: the files of the project are what the runtime reads (the demo project is `examples/`) or what is published in the registry.

Start it with `cd frontend && npm run start:editor` (port 4201; it builds the libraries and copies the examples).

The editor's interface is in English, with an Italian translation; the labels below are the English ones.

## 1. How it is laid out

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ▣ Quadrava Studio  File Edit View Window Help  ↶ ↷        Valid  Unsaved  EN │
├───────────────┬──────────────────────────────────────────┬───────────────────┤
│ COMPONENTS    │ ┌ orders — Screen ──────────── _ □ × ┐   │ PROPERTIES        │
│ Section Text  │ │ [Desktop|Tablet|Phone] …           │─┐ │ Table             │
│ Table …       │ │ ┌────────────────────────────────┐ │ │ │ id     table-1    │
│               │ │ │ the screen, drawn by the       │ │ │ │ source list ▾     │
│ STRUCTURE     │ │ │ runtime (node highlighted)     │ │ │ │ columns           │
│ Screen        │ │ └────────────────────────────────┘ │ │ │  ▸ Id (id)        │
│  Section      │ │ Preview ▔JSON▔ Data sources ▔Texts▔│ │ │  ▾ Description    │
│   Table ↑↓⧉✂🗑│ └────────────────────────────────────┘ │ │     field …       │
│               │   └ app — Navigation ──────────────────┘ │                   │
│               │ [orders — Screen] [app — Navigation]     │                   │
├───────────────┴──────────────────────────────────────────┴───────────────────┤
│ Problems (0)                                                                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

The side panels (components, structure, properties) and the problems always show the document of the **window in front**.

At the top left is the **Quadrava Studio** logotype (icon and name; the Studio icon in the browser tab), then a **menu bar** as in desktop applications:

- **File**: New project…, Open project folder… (Chrome and Edge), Open the demo project, Close project; New ▸ (Screen…, Data sources…, Navigation, Theme), Import file… (Ctrl+O), Import example ▸, Open from registry ▸ (Screen…, Data sources…, Navigation…, Theme…); Save (Ctrl+S), Save all, Export…, Save to registry, Registry…; Close, Close all. The commands that bring in a document write it into the project and open it in a **new window**; the others work on the document of the active window:
  - **New**: a screen first asks for the **title** and the **identifier** (`screen`), a theme for its name, a data sources document for a description; the identifier is derived (kebab-case, without accents, up to 60 characters) until you edit it, and «Create» stays disabled while the name is missing, the identifier is not valid or another resource of the kind has it. The file is created in the project at once. The navigation is one per project: «New › Navigation» opens it (or creates it, if the project has none).
  - **Import file…**: a `.json` file from the computer, written into the project as the resource of its kind, recognised from the document's identifier property (`screen`, `datasources`, `navigation` or `theme`; any other file is refused with a message), and opened. If the project already has that resource, it asks before replacing it. **Import example ▸** does the same with a resource of the demo project.
  - **Save**: the document in its file of the project, as indented JSON (`screens/<identifier>.json`…). The file follows the identifier: changing it renames the resource (written under the new name, the old file removed); an identifier already used by another resource is refused. A document with errors is saved anyway (it is work in progress), and the message says how many errors there are. **Save all** saves every window with changes; **Export…** writes the document to a file outside the project (downloaded where the browser cannot write files).
  - **Save to registry**: a new version of the document in the registry application, as «Save version» in the Registry panel does: blocked while the document has errors, with the concurrent-change check (If-Match, starting from the version opened or last saved) and the registry's validation problems listed point by point in the Registry panel. If no application has been chosen yet, a small window asks for it (the list comes from the registry, a new name can be typed).
  - **Open from registry ▸**: a window with the application, its documents of the chosen kind (with the review status of the latest version and the environments where it is published) and the version to open: the latest or the one published in an environment. The version is written into the project and opened; a later «Save to registry» starts from it.
  - The two registry commands are enabled when `GET /registry/apps` answers (checked at start-up and every time the File menu opens); without a registry, as in the demo editor (`npm run start:editor`), they are disabled and the tooltip says why. If the registry asks for authentication (401), they go through the BFF login and come back to the editor.
  - Next to the document status the tag **«Unsaved changes»** appears while the document of the active window differs from the last one saved (to file or to the registry), opened or created; the window's title bar shows a dot. **Close** asks for confirmation only when there are unsaved changes; «Close all» closes the windows one by one and stops at the first one you keep.
- **Edit**: Undo, Redo; for screens Cut, Copy, Paste; Duplicate, Delete, Move up, Move down (in navigation too). Every item shows its shortcut; those that cannot be used (nothing to undo, no node selected, empty clipboard) are disabled. The clipboard is shared: a node copied in one screen can be pasted into another.
- **View**: the pinned state of the panels of the active document («Components», «Structure», «Properties») and «Problems panel» (items with a check mark); for screens, the central view (Preview, JSON, Data sources, Texts), as single-choice items.
- **Window**: Cascade, Tile, Minimize, Maximize, Next window (Ctrl+F6), Previous window (Ctrl+Shift+F6) and the list of the open windows (the active one marked): § 1b.
- **Help**: «Keyboard shortcuts» (also **F1**), a window with all the shortcuts by group, and «About Quadrava Studio».

A click opens and closes a menu and, with a menu open, moving over another title switches menu; a click outside closes it. An item with a submenu opens it on hover or on click. From the keyboard (WAI-ARIA «menubar» pattern): Tab reaches the bar, left and right arrows move between menus, down (or Enter, Space) opens it and moves through the items skipping disabled ones, Home and End, right enters a submenu and left leaves it, Esc closes and returns focus to the title. After a command focus goes back where it was. Next to the menus are the undo and redo icons; on the right the status of the active document and the language, which stay together even when the bar wraps.

In every window the tabs (Preview, JSON, Data sources, Texts for a screen; Menu preview and JSON for a navigation; Theme preview and JSON for a theme) sit below the content like folder tabs: the content is a panel with its own border, the active tab (white) joins it and the others (grey) stay outside, so the edge of the content is clear. Components, structure and properties are in **separate panels**, each with its title on a dark grey bar with white text (the editor's colours, not those of the theme being edited) preceded by an icon: blocks for components, a tree for the structure, sliders for properties, a badge for the simulated profile, and each scrolls on its own; the same applies to structure, simulated profile and properties in navigation and to the theme's properties. Below 1100 px components and structure sit side by side above the preview and properties go below.

**Auto-hide panels**, like IDE windows (Visual Studio, Eclipse): every panel has its own pin in the title bar (Components and Structure on the left, Properties on the right).

- **Unpinning a panel:** it becomes a vertical tab on the strip along its side, and the other panels on that side stay in the column and take its space (with only Structure hidden, Components fill the whole column). If all the panels on a side are hidden only the strip remains and the workspace takes the space. This works for every kind of document (Structure and Properties in navigation, Properties in the theme) and the choice is per panel, the same for all the kinds.
- **Opening:** hovering a tab (150 ms: a quick pass opens nothing), a click or Enter opens **only that panel**, over the central area and over the other panels on that side, with a shadow; moving onto the other tab opens the other one.
- **Closing:** it closes 400 ms after the mouse has left the side. It does not close while focus is in one of its fields (a property is being typed): in that case it closes when focus moves elsewhere.
- **Esc:** closes the panel and returns focus to its tab.
- **Dragging:** when a component is dragged from the open palette over the preview, the panel closes at once to leave the preview free for the drop.
- **Pinning again:** the pin, upright when the panel is pinned and lying down when it auto-hides, puts it back in the column. The same items, one per panel, are in the View menu.
- **Memory and narrow windows:** the choices are remembered in the browser (`lc.editor.dock`; those saved per whole side by the previous version apply to the panels on that side). With stacked panels (below 1100 px) panels do not auto-hide.
- **Width:** the inner edge of a side with pinned panels can be dragged to widen or narrow it (200 to 640 px); a double click restores the default width. From the keyboard the edge is a separator reachable with Tab: 16 px arrows (towards the central area the side grows), Home and End to the limits, Enter for the default width. The width is remembered per side.

- **Palette.** At the top a **search**: it filters as you type (name in the editor's language or type, ignoring accents and case), Enter adds the first component found (outlined), Esc clears. Groups: «Structure and text» (section, box, grid, border layout, tabs, wizard, text, formatted text — a `text` with `format: markdown` and a sample list —, message, image, link; the message also accepts `format: markdown`), «Fields» (one standalone field per type: text box, drop-down, date, rich text editor…, with names that are not repeated within the screen), «Input and actions», «Data», «Visualisation» (indicators, chart, progress, timeline, kanban, tree, calendar). A click adds the component at the insertion point: inside the selected container (screen, section, box, grid, border, tab, step), otherwise right after the selected node. Alternatively it can be dragged into the structure **or directly onto the preview**: there the component under the pointer decides the position (top edge before, bottom edge after, centre inside if it is a container; outside any component at the end of the screen) and an indicator shows it. Every component starts from a valid template; if it uses a data source (`source`) that does not exist, the editor creates it (GET `/api/<name>`, POST with `{{ request }}` for the server data table).
- **Structure.** The tree of nodes, with tabs and steps. The selected node shows the move up/down, duplicate (new identifiers), cut and delete commands; tabs and wizard also «add tab/step». Nodes can be dragged before, after or into another row. A red or yellow dot flags the node's errors or warnings.
  - **Branches:** the arrow next to a container collapses or expands it (from the keyboard, on the row: right expands, left collapses); «Collapse all» and «Expand all» at the top. Selecting a node, from the preview too, expands the branches that contain it; collapsing everything keeps the branch of the selected element open.
  - **Search:** the box at the top shows the nodes whose type, text or identifier contains what was typed, with the branches that contain them (matches underlined); Esc clears.
  - **Several nodes at once:** Ctrl+click adds or removes a node from the selection, Shift+click selects the range from the last chosen node, Shift+↑ and Shift+↓ extend or shrink it from the keyboard. They work among nodes of the same container (a node of another container starts a simple selection again). The context menu on one of the selected nodes **wraps them together** in a section, a box or a grid (in place of the first one, in their original order) or **deletes** them; Del and «Edit → Delete» delete them all too. Properties show the last chosen node, with a notice; the other commands apply to that node.
  - **Context menu:** right click on a row, Shift+F10 or the menu key. Cut, Copy, Paste, Duplicate, Delete, Move up and down, Add tab or step; **Wrap in a section, a box or a grid** (the new container takes the node's place and its placement properties: `region`, `span`, `grow`); Select the container. Arrows, Home, End, Enter; Esc or a click outside close it and focus returns to the row.
- **Properties.** The text areas of properties (titles, texts, messages, conditions: all those that accept `{{ }}`) have **syntax highlighting**: fixed text stays plain, the braces are highlighted and inside the expression functions (`t`, `has`, `fmtCurrency`… and methods after the dot), variables (`state`, `params`, `row`, `form`, `user`…) and their properties, quoted strings, numbers, `true`/`false`/`null` and operators (`&&`, `==`, `in`, `? :`…) are told apart; colours update as you type, even with an expression not yet closed, and completion works as before. At the top the element's **path** («Screen › Section › Table»): a click on a container selects it. Below the type, a **filter** by property name (empty again on every selection). The fields of the selected element are generated from the JSON schema (§ 2). Conditions (`visibleIf`, `hiddenIf`, `enabledIf`, `readOnlyIf`, `nextIf`) and the tooltip are in a separate group, open only if one of them is set. Inside `{{ }}`, after the start of a name, **completion** appears: context variables (row, form, state and parameters used in the document, user) and functions; arrows to choose, Enter or Tab to insert (for functions the cursor goes between the parentheses or quotes), Esc to close.
- **Preview.** The screen drawn by `lc-screen`, with the theme being edited, in an isolated iframe (§ 3). The selected node is highlighted by a dashed frame (if it is in a hidden tab, the preview opens that tab); Alt+click on a component, or a click in «Select» mode, selects it instead of activating it. In «Select» mode components can be **dragged to move them** (before, after or into another, with the indicator) and the selected one inside a grid or a box has a **handle** on its right edge: dragging it changes the columns it takes (`span`, in whole columns) or its share of space (`grow`). With **«Live data»** reads go to the application's services (editor behind the BFF: `npm run stack` or `start:editor:bff`) instead of the sample data; writes stay blocked and the preview log says so.
- **JSON.** The whole document, editable by hand; «Apply» replaces it in a single undoable step, invalid text touches nothing. The **syntax is highlighted**, here and in the JSON fields of the property panel and of data sources (and in the text areas of properties, see above): keys, strings, numbers, `true`/`false`/`null`, punctuation, and inside strings the `{{ }}` expressions highlighted separately. Typing works as before (cursor, selection, undo and paste are the browser's): behind the transparent text area there is the same text, coloured, built with elements and `textContent` (never HTML) and updated on every key; above 400,000 characters it stays uncoloured.
- **Data sources.** Method, URL, parameters, body and paging of every data source; renaming one updates the nodes (`source`) and the steps (`call`, `refresh`) that use it. Next to it, the **sample data** the preview returns in place of the service. A data source can also **refer to one of the project** (§ 1a): «Use from the project» adds a reference (`{ "ref": "orders/list" }`), chosen from a list, with the call it points to next to it and parameters and body that adjust it for the screen; the link icon turns it back into a copy written in the screen. The arrow on a data source written in the screen **moves it into the project**: into a data sources document (new or existing) under a name, leaving a reference in its place, so the other screens can use it too. A reference that does not resolve is a warning, and the preview leaves it out as the runtime does.
  - **Import from OpenAPI:** reads an OpenAPI 3.x or Swagger 2.0 document in JSON from an address (in Spring Boot with springdoc it is `/v3/api-docs`; the last one used is remembered) or from a file, and lists its GET, POST, PUT, PATCH and DELETE operations by tag, with method, path, description and the name the data source will have. You choose the operations (or «Select all») and the **address prefix** (proposed from the first server or from `basePath`); those that already have a data source with the same method and address are disabled. Every operation becomes a data source: name from the `operationId` (in camelCase, valid and unique; without one, from method and path), address = prefix + path with the path parameters taken from the screen parameters (`/api/orders/{{ params.id }}`), **required** query parameters likewise (optional ones are listed to be added by hand: a missing variable would make the expression fail), the body `{{ form }}` for POST, PUT and PATCH. For reads the **sample data** is set from the response: the document's example, or built from the schema (enums, date and email formats, lists of two items with distinct numbers, references and `allOf` resolved, limited depth). All in a single undoable step.
  - **Where it reads from:** an address starting with `/` goes through the editor's origin (behind the BFF it reaches the services, for example `/api/v3/api-docs`); an address on another origin works only if the service allows CORS (springdoc does not by itself); otherwise load the file. The document is data: paths with unexpected characters or `{{ }}` are discarded, external references are not followed, beyond 5 MB or 500 operations it is not read.
  - **To try it out:** the demo back end (`npm run demo-api`) publishes its description at `http://localhost:8084/v3/api-docs` (no token and readable from other origins: it is only the description) and, behind the BFF, at `/api/v3/api-docs`.
- **Texts.** All the texts the user reads (titles, labels, messages, tooltips, confirmations…), with where they are. A plain text does not change with the language: «Make translatable» replaces it with `{{ t('screen.key', 'Text') }}` (key from the screen prefix and the first words, unique) and uses it as the Italian translation (the line breaks of a formatted text become `\n` in the expression). For every key the translations are written in every language (one column each), and they apply immediately in the preview; missing translations are flagged and counted in the tab title. «Export translations» downloads `<screen>.i18n.json` (`{ "it": {…}, "en": {…} }`) to be merged into the `examples/i18n/<language>.json` catalogues; «Save to the registry and publish to <environment>» merges the edited translations into the latest version of the language catalogue (a `messages` document, with If-Match) and publishes it in the environment chosen in the registry panel. Texts with braces (message parameters) and more complex expressions are made translatable by hand.
  - **Languages:** above the table, the translation languages, with their name in the editor's language and their code («French fr»). It starts with the demo's languages (Italian, the default, and English). The «Add language» box offers a list of named languages (those of the European Union, the most widespread and some country variants, names provided by the browser): pick from the list, type the name (in English too) or a code of two or three lower-case letters with an optional country (`fr`, `de`, `pt-BR`); the language gets its own column. The × removes a language, asking for confirmation if it has translations written in the editor, which would be lost. Languages are remembered with the draft; export and saving to the registry include all of them.
  - **With a project** the languages are those of the project (§ 1a): adding, removing and changing the default one happen in its settings, and the translations go into its catalogues when the screen is saved. What follows on languages applies to screens edited outside a project.
  - **Default language:** the one of the fallback texts written in the screens (`t('key', 'Text')`). The star on a language makes it the default: it moves to the front, texts made translatable assign it their text, for it the fallback is enough (it is not counted as missing), it cannot be removed, and the preview uses it when a translation is missing. It is remembered with the draft.
  - **Import translations:** reads the «Export translations» file (`{ "<language>": { … } }`) or the catalogue of one language (`{ "<key>": "text" }`) with the language in the file name (`fr.json`, `demo.fr.json`); new languages are added.
  - **Preview in another language:** the selector in the preview bar offers all the translation languages; it follows the editor's language until another one is chosen, and goes back to the editor's language if the chosen one is removed. The editor's own interface language stays Italian or English.
- **Problems.** Schema errors, invalid CEL expressions, repeated identifiers (errors) and undefined data sources (warnings). A click takes you to the element. With errors the preview stays at the last valid version.

- **Registry.** «File → Registry…» opens a panel for the open document (screen, navigation or theme), which in the registry is a document of its own (`contracts/registry.yaml` 0.6): you give application and environment (remembered in the browser; «development» to begin with); «Save version» sends the document (blocked if it has errors or if the identifier is invalid) stating the version it started from: if someone else saved in the meantime, the panel says so and asks whether to save anyway; if the registry rejects the document, schema errors are listed one by one. «History» lists the versions, newest first, with their **review status** (draft, in review, approved, rejected, with who decided and the note) and the environments where each one is published; every version can be reopened, **compared** with the open document (differences by path), sent for review, approved or rejected (reviewers only, never the author: the registry decides) or published in the given environment (with confirmation; testing and production accept only approved versions). Before publishing a screen or the navigation, the panel asks the registry which screens the version refers to that are not published in that environment: the confirmation lists them («… refers to screens not published in the production environment: order-list. Publish anyway?»). In testing and production the registry rejects a navigation with missing screens: the panel lists them with their position in the document (see architecture § 10). Service errors are shown as short messages (registry unreachable, permissions, not found, rejected with the Problem's title), never with technical details. Calls go to `/registry` on the same origin and the BFF forwards them, with the user's token: writes send back the CSRF token from the `XSRF-TOKEN` cookie (if the cookie was not there yet, the first write gets 403 and is retried once). Without a session the panel shows «Sign in», which goes through the BFF login and returns to the editor. In development without Keycloak: `npm run start:editor:registry` talks directly to the reference registry started with the `no-auth` profile.

The draft of every open document (document, sample data and translations written in the editor) saves itself in the browser on every change and is restored on reopening; it stays in that browser only, so the real copy is the one saved in the project with «Save» (or in the registry).

## 1a. Projects

Studio always works inside a **project**: the folder with the configuration and the resources of an application.

```
my-app/
  project.json          manifest: identifier, name, languages and default language, themes
  navigation.json       the navigation (areas and menus)
  screens/              one file per screen: order-list.json, order-detail.json…
  datasources/          data sources shared by the screens: orders.json (orders/list, orders/approve…)
  themes/               one file per theme: light.json, dark.json…
  i18n/                 translation catalogues, one per language: en.json, it.json
```

- **Where it is.** In a **folder on disk** (Chrome and Edge, File System Access API): Studio reads and writes the files there, so the project can be kept under git. Or **in the browser** (its private file storage, every modern browser): it stays in that browser only. The demo project (`examples/`, the same files the runtime demo reads) opens in the browser: the first time it is copied there from the examples, then it is yours to change.
- **Start page.** Without a project Studio shows «New project…» (name and identifier of the application, and where to keep it), «Open project folder…», «Open the demo project», «Reopen» the last one (a folder on disk asks the browser for permission again) and the projects kept in this browser (to open or delete). The last project kept in the browser opens again by itself.
- **Project panel.** On the left, above the panels of the document, as the solution explorer of an IDE: Settings, Screens, Data sources, Navigation, Themes, Translations, with how many of each. A click (or Enter) opens a resource in its window, or brings it in front if it is open; «+» on a group creates one; the bin (or Del on the row) deletes one after a confirmation, closing its window. The resources open in a window are in bold, with a dot for unsaved changes and a red or yellow mark for errors or warnings. It can be hidden like the other panels.
- **Settings.** `project.json` opens in a window with an overview (name, languages, themes, how many resources of each kind) and the JSON; the properties are on the right, generated from `project.schema.json`: the default language must be one of the languages, the themes listed must be in the project.
- **Translations.** The catalogues `i18n/<language>.json` (key → text, the format the runtime reads) are resources too: one per language of the project, in the «Translations» group. A catalogue opens in a window with a table: the key, the text in that language and, next to it, the text in the default language; keys without a text are flagged (warnings), a search filters by key or text, keys are added and removed; the JSON is in the second tab. Languages are added in the settings: saving them creates the missing catalogues («+» on the group opens the settings). In a screen, the «Texts» panel uses the languages and the catalogues of the project; the translations written there stay in the draft of the screen (the preview already uses them) and go into the catalogues when the screen is saved: into the window of a catalogue, if it is open (to be saved with it), otherwise into its file.
- **Data sources documents.** A window with the data sources of the document, edited as in the «Data sources» tab of a screen (with their sample data), and the JSON; identifier and description in the properties. The changes reach the screens that refer to them at once, in their previews and checks, also before saving.
- **Windows and projects.** The windows of every project are remembered apart: closing the project (with a confirmation if there are unsaved changes, which stay as drafts) and opening it again gives them back.

## 1b. Workspace and windows

Studio, with a project open, starts with an **empty workspace**: no editor, an invitation to create a resource (Screen…, Data sources…, Navigation, Theme) or import a file. Every document opens in its **own window** inside the workspace, with the editor of its kind only: preview, JSON, data sources and texts for a screen; menu preview with the simulated profile and JSON for a navigation; theme preview and JSON for a theme. Several documents can be open at once, also of the same kind.

- **Active window.** A click (or the focus) inside a window brings it in front. The menus, the toolbar (undo, redo, status), the shortcuts, the problems at the bottom and the **side panels** work on its document: changing window, palette, structure and properties are created again for the new document. A kind without panels on a side (a theme has no structure) leaves the column with a short note, so the windows do not move.
- **Moving and resizing.** Drag the title bar to move a window, its edges or corners to resize it; windows stay whole inside the workspace and are not smaller than 360 × 220 px. A double click on the title, or its button, **maximizes** the window over the whole workspace (and restores it); while one window is maximized, new ones open maximized too. From the keyboard, on the title: arrows move by 16 px, Shift+arrows resize, Enter maximizes or restores.
- **Minimizing.** The window goes to the bottom of the stack and the next one becomes active. The **bar of the open documents** below the workspace has a button per window (the active one pressed, the minimized ones in italics): a click brings it in front, or minimizes it if it is already in front.
- **Window menu.** Cascade, Tile (side by side, filling the workspace), Minimize, Maximize, Next and Previous window (**Ctrl+F6**, **Ctrl+Shift+F6**: the window in front goes to the bottom), and the list of the windows.
- **Closing.** The × on the title bar, File › Close or Close all; with unsaved changes a confirmation names the document. A closed document leaves nothing in the browser (draft, saved state, file and registry version are forgotten).
- **Between documents.** The previews use the other windows: a screen is drawn with the theme of the theme window used last (the demo's light one if there is none, or if it has errors); a theme draws the screen and the menu of the screen and navigation windows used last; a navigation takes the translations of the screen used last. The screens open in the workspace are **known screens** (suggested and checked in navigations and in `navigate` steps), together with the examples and those of the registry application.
- **Memory.** The windows (kind, file of the resource, position, size, maximized or minimized), their order and the active one are remembered in the browser for every project (`lc.editor.workspace:<project>`), each document under its own draft (`lc.editor.doc.<id>`): reloading the page gives back the same workspace. What earlier versions of the editor left (the windows without a project, or the drafts of the single documents) goes to the first project opened, as documents not saved in it yet.

## 2. Property panel generated from the schema

The editor has no list of component properties of its own: it reads them from `screen.schema.json` (`model/schema-info.ts`). This way a new component or property appears in the editor by itself; it is enough to add the initial template in `model/templates.ts` and the name in the palette (a container of nodes also in `LAYOUT_CONTAINERS` in `model/schema-info.ts`). The position of a node inside a layout container (`grow`, `span`, `region`) is set in the property panel of the node itself (a test fails if a schema type has no valid template or is missing from the palette).

| In the schema | In the panel |
| --- | --- |
| `enum` | choice (empty = property absent, if optional) |
| `$ref: expression` | text area with `{{ … }}` and the «Variables and functions» help: the variables of the place where you are writing (`row.<field>` in columns and row actions, `form.<field>` in forms and dialogs, `value` in validation rules, `search`/`lookupKey`/`request` in data sources), the state and parameters already used in the document, the user, and the functions (`can`, `t`, `has`, `fmt*`, `plural`); a click inserts them at the cursor |
| `string` | text; a text area for long texts and for every value with `{{ }}`; `source`, `call`, `refresh` suggest the data sources, `navigate` the known screens (the examples and, with the registry reachable and an application chosen, the application's screens in the registry): the list opens below the box (also with the arrow key) and filters as you type |
| `boolean` | checkbox (unchecked = property absent) |
| `integer` / `number` | number with the schema's minimum and maximum |
| closed object (`sort`, `selection`, `lookup`, `dialog`…) | group of fields, «Set» / «Remove» if optional |
| list of objects (`columns`, `fields`, `rowActions`, `items`, `series`…) | items that open one by one, with move, delete, add (a new item already has its required properties, including a step if the list of steps is required); JSON view of the list |
| list of steps (`onClick`, `onSubmit`, `onSelect`) | as above, and «Add» asks for the variant: `call`, `refresh`, `navigate`, `toast`, `set`, `confirm`, `dialog`, `validate`, `print`, `export`, `if` (created with `{{ true }}` and a message), `run` (suggests the sequences in `actions`, flagged until the name exists). The expression help includes the responses of previous `call`s with `as` and, inside `onError`, `error.status`. Named sequences (the screen's `actions`) are written as JSON |
| list of nodes (`components`) | not in the panel: handled in the structure |
| free maps (`params`, `initial`, `badges`, `args`) and the rest | JSON |

Columns inherit their fields from several definitions (`columnProps` → `tableColumnProps` → `dataColumn`): the editor follows `$ref` and merges the properties, so a data-table column also shows `filter` and `groupable`.

An empty text removes an optional property; a required one stays empty and validation flags it. Example: in the table, open the «Descrizione» column, choose `format: currency` and `aggregate: sum`; the preview immediately shows the totals row.

## 3. Preview

The previews (screen, menu, theme) run in an **isolated iframe** (ADR-08): the editor's own application, started with `?preview`, with its own root (`PreviewApp`) and the real runtime. Being a page of its own, theme, styles and NG-ZORRO's dark stylesheet apply only there, as in production. Editor and preview talk through messages with a defined format (`preview/protocol.ts`), only between windows of the same origin and only with their own iframe:

| From → to | Message | Content |
| --- | --- | --- |
| preview → editor | `lc-preview:ready` | the iframe is ready: the editor sends it the state (after a reload too) |
| editor → preview | `lc-preview:state` | screen, menu, theme (valid ones), simulated profile, sample data, parameters, language, draft translations, selected node, select mode, version (Reload) |
| preview → editor | `lc-preview:select` | id of the component chosen with Alt+click or in select mode |
| preview → editor | `lc-preview:event` | log line: request, navigation, diagnostic |

Every message arrives cloned: the preview compares screen, parameters, menu and theme by content, so a message that changes only the selection does not redraw the screen (tabs stay where they are, forms are not cleared). The iframe stays alive in the other views (JSON, data sources, texts) and is not reloaded on every change.

No call leaves the browser. The preview's ports (`preview/preview-ports.ts`, inside the iframe):

- **DataClient**: recognises the data source from the request (method and URL, with the `{{ }}` parts free) and responds with its sample data; without data, `[]` for reads and `{}` for writes. Every request goes into the log.
- **Authorization / UserProvider**: the permissions of the simulated profile sent by the editor (all of them, or none with the «All permissions» switch off; in navigation those chosen one by one); user `preview` in the editor's language.
- **ScreenNavigator**: does not change page; it sends the navigation to the editor's log and shows a message.
- **RuntimeDiagnostics**: technical diagnostics go into the editor's log.

If the chosen width (tablet, phone) does not fit in the preview area, the page is scaled down to fit, as in Chrome's device toolbar: it stays as wide as the device (same breakpoints), only smaller, and a label in the corner gives the percentage. Before, the page overflowed the panel and was cut off on the right. Widths can be tried with the three icons in the bar, as in Chrome's device toolbar (desktop, tablet 768 px, phone 375 px; the name and pixels in the tooltip), and so can the screen parameters (`params`, for example `{"id": 1}`). Redrawing starts 250 ms after the last change.

To link drawing and structure, `lc-node` exposes `data-node-id` and `data-node-type` (never data): this is why the editor gives an `id` to every node it creates. Nodes without an `id` (written by hand) can be selected only from the structure.

## 3b. Navigation

A navigation window: the `navigation.json` document (areas, groups, subgroups, items).

- **Structure** on the left, with «+ Area», «+ Group», «+ Item»: a new element goes inside the selected area or group, or next to the selected item; groups stop at the second level, as the schema requires. Move, duplicate (new ids), delete as for screens.
- **Properties** on the right, generated from `navigation.schema.json` with the same panel as screens: `screen` suggests the known screens, `icon` the icons of the built-in set, `requires` the permissions already used, `default` the areas.
- **Menu preview** in the window: the real menu (`lc-sidebar` with `NavigationRuntime`) and a **simulated profile**. With «All permissions» off you choose which permissions the user has (those mentioned by the menu's `requires`) and see what appears for them. A click on an item does not navigate: it shows which screen it would open.
- **Problems**: schema, expressions, ids repeated among siblings (errors), unknown screens and a default area that does not exist (warnings).

The navigation draft is saved in the browser like the screen's; «Open example» opens the demo's navigation, «Save» writes `<navigation>.json`.

## 3c. Theme

A theme window: a file of `themes/` in the project (design tokens). The panel on the right shows all the tokens, group by group (colours, typography, shape, density, layout of side bar, header, page), generated from `theme.schema.json`; colours have a picker next to the text (`#rrggbb`; `rgb()` and `hsl()` are typed in the text). The preview draws **the screen and the menu of the screen and navigation windows used last** with the theme, in its iframe: dark themes are complete (NG-ZORRO's surfaces too) and the editor stays as it is. The screen and menu previews also use the theme of the theme window used last (the demo's light one, if there is none or it has errors). With errors the preview stays at the last valid theme.

## 4. Shortcuts

| Keys | Action |
| --- | --- |
| F1 | keyboard shortcuts |
| Tab to the menu bar, then arrows | opens the File, Edit, View, Window and Help menus (see above) |
| Ctrl+S / Ctrl+O | save the active document to file / open a file in a new window (inside fields too; not with a dialog open) |
| Ctrl+F6 / Ctrl+Shift+F6 | next / previous window |
| arrows / Shift+arrows on the title of a window | move / resize the window |
| Enter on the title of a window (or double click) | maximize / restore |
| Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) | undo / redo (inside fields too: rapid changes to the same property are a single step) |
| Del | deletes the selected node |
| Ctrl+D | duplicate |
| Ctrl+C / Ctrl+X / Ctrl+V | copy / cut / paste at the insertion point |
| Alt+↑ / Alt+↓ | move up / down |
| → / ← on a structure row | expands / collapses the branch |
| Shift+F10 or the menu key on a structure row | context menu |
| Ctrl+click, Shift+click, Shift+↑ / ↓ in the structure | selects several nodes of the same container |
| Alt+click in the preview | selects the component |
| Ctrl+Enter in a JSON field | apply |

Apart from undo and redo, shortcuts apply when focus is not in a text field.

## 5. Code structure

```
editor/src/app/
  model/      doc-ops (pure operations on the document), schema-info (SchemaReader: reading a schema),
              document-state (document, selection, history, problems: shared by all documents),
              editor-store (the screen), datasources-store (a data sources document, and the DataSourceList the panel edits),
              navigation-store (the navigation), theme-store (the theme), project-store (the manifest),
              project (the open project: manifest, resources, data sources), project-folder (folder on disk, in the browser, in memory),
              project-library (where the projects are, the last one), project-commands (create, open, import, save, delete),
              project-data-sources (references and moves into the project), messages-store (a translation catalogue),
              workspace (the open windows, each with the injector of its document), window-layout (geometry of the windows),
              shared-state (known screens, data sources of the project and clipboard, shared by the documents), saved-documents, file-access,
              templates (templates, initial values, summaries), drop (drag and drop), texts (texts and keys), registry-client (registry client)
  ui/         start-page (without a project), project-panel (the resources of the project), new-screen (the dialog of a new resource or project),
              workspace (the area of the windows and the bar of the open documents), document-window (a window: title bar, move, resize),
              screen-editor, datasources-editor, navigation-editor, theme-editor, project-editor, messages-editor (the editor inside a window of each kind),
              document-inspector (properties of the manifest and of a data sources document),
              menu-bar (menu bar), context-menu (context menu), code-highlight (syntax highlighting of JSON and of texts with expressions), dock, dock-side, dock-panel and dock-pin (auto-hide panels one by one, for all the kinds), palette, outline, inspector, nav-outline, nav-inspector, theme-inspector (the side panels of each kind), fields (recursive fields), json-field, json-view,
              data-sources, texts, issues, registry-panel
  preview/    protocol (messages), preview-frame (the iframe, editor side), preview (the screen preview
              bar), preview-log (log); inside the iframe: preview-app, preview-config, preview-ports
  app.*       shell, menus, toolbar, side panels of the active window, shortcuts
  messages.ts editor strings (ed.* keys, it and en)
```

- The document is **immutable**: every operation returns a copy that shares the untouched parts, so the history (200 steps) is cheap.
- `DocumentState` holds the document, the selection (a path such as `['components', 0, 'tabs', 1]`), the history and the computed problems (`computed`); `EditorStore` (the screen, with sample data and translations), `DataSourcesStore`, `NavigationStore`, `ThemeStore` and `ProjectStore` extend it. They are not singletons: `Workspace` creates an **injector per window** (`createEnvironmentInjector` with `documentProviders(kind, id)`: the identifier `DOCUMENT_ID`, the store, the store as `DocumentState`). The editor of the window and, for the active window, the side panels are drawn with that injector (`ngTemplateOutlet` with `injector`), so palette, outline, inspector, `ed-fields` and the JSON view keep injecting their store and get the one of their document. Closing a window destroys its injector (and the store's effects). See ADR-13 in the architecture.
- The windows keep their order in the page (`Workspace.windows`); the stacking order is a separate list (`order`, used for the z-index), so bringing a window in front never moves its preview iframe in the page, which would reload it.
- The project is read and written through `ProjectFolder` (`DirectoryFolder` on a directory handle, on disk or in the private storage of the browser; `MemoryFolder` in the tests). A window knows the file of its resource (`path`); `Workspace.saveToProject` writes it, renaming the file when the identifier changes. `Workspace.dataSources` gives the data sources documents as the screens see them (saved, with the valid changes of the open windows); the application puts them in `KnownDataSources`, which the screen store reads to check its references and the previews to resolve them (`resolveDataSources` of the `schema` library). See ADR-14.
- Tests: document operations, schema reading (every type has a valid template), editor state, project (resources, open, create, write, remove, commands, references, data sources documents, manifest), workspace (open, focus, minimize, cycle, close, restore per project, save and rename in the project, data sources of the windows, drafts of earlier versions) and window geometry, drag and drop, preview ports; the preview inside the iframe driven through its messages (drawing, sample data, selection, tabs, menu and profile, dark theme, foreign messages ignored); an overall test that uses the real interface and checks the states sent to the iframe (in jsdom the iframe does not load the application: the test simulates its «ready»); in the browser (Playwright, `e2e/editor-windows.spec.ts`) a project created in the browser, windows moved, resized and maximized with the mouse, and an accessibility check of the workspace.

## 6. Limits and next steps

- **Translations.** Languages are added in the «Texts» panel; the editor's interface is in English and Italian. Catalogues (`messages` documents) are reviewed through the registry APIs; the «Texts» panel saves and publishes directly.
- **Expressions.** Completion and syntax checking, but no check that the fields used (`row.x`) really exist in the services' responses.
- **Preview.** In «Select» mode components are dragged to move them and the selected one in a grid or a box has a handle for `span` or `grow`; the sides of the border can be resized only in the runtime (in the editor with `westWidth` and `eastWidth`).
- **Comparison.** Between a registry version and the open document; to compare two versions, open one and compare it with the other.
- **Preview and wizards.** Selecting a node in a later step of a wizard does not go to that step (steps are passed only through their conditions).
- **Width.** Below 1100 px the panels stack; the editor is designed for desktop screens. A window is never smaller than 360 × 220 px.
- **Translations between windows.** Outside a project, translations written in a screen apply at once to the previews of all the windows (the catalogue of the editor is one) and are saved with the draft of that screen. With a project they go into its catalogues; «Save to the registry and publish» of the «Texts» panel publishes the translations still in the draft, so with a project the catalogues are published from the registry tools for now.
- **Catalogues and the registry.** The windows of the catalogues have no «Save to registry» (in the registry a catalogue is a `messages` document with `texts`, while the project keeps the plain format of the runtime).
- **Projects.** A folder on disk needs Chrome or Edge; Safari's private storage does not let a page write files from the main thread, so projects in the browser need a recent Chrome, Edge or Firefox there. A project in the browser can be moved out only resource by resource (Export…) for now.
- **Toolbar.** The inner search field of the language select has no label of its own (NG-ZORRO): the accessibility check of the workspace leaves it out.

**Decisions (13 October 2026).** ADR-08 accepted: preview in an isolated iframe (implemented). ADR-09 amended: the history keeps immutable versions of the document instead of JSON Patch operations; patches will be derived by difference when diffs between versions and locks are needed. Registry: one document per screen, one for the navigation, one per theme.
