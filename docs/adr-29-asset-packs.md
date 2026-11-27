# ADR-29: asset packs, only what each application uses

Status: accepted (27 November 2026); phases 1, 2 and 3 implemented on 27 November 2026, phase 4 to follow.

## Context

Release 0.29.0 made every Ant Design icon available by its name (`share-alt`, `team`), all registered statically. It
works, but it has two limits:

- **Every application pays for every icon.** The initial bundle of the runtime grew from 2.68 MB (497 kB gzip) to
  3.33 MB (620 kB gzip). An application that uses fifteen icons downloads about 700.
- **An application cannot bring its own.** A company icon set (a truck, a pallet, the logo of a product line), or the
  images of the empty states, have no place: an `image` or the `logo` of a theme accepts only an `https://` address
  (outside the origin, so the Content-Security-Policy must be widened), a relative path that the runtime image does not
  serve, or a `data:` address of up to 100 kB written inside the JSON.

Three facts of the platform limit the solution:

1. **The runtime is never rebuilt for an application** (ADR-20). The image of a version is the same for everybody, and
   the definitions arrive at start-up, from the registry or from mounted files. Anything specific to an application must
   therefore be a definition, not code.
2. **Definitions are JSON documents with a version** in the registry: each one is saved, hashed, approved in the
   protected environments and published (contracts/registry.yaml). A binary file has none of this.
3. **Icon names are fixed strings** in screens and navigation, never expressions. A tool can therefore know exactly
   which icons an application uses.

## Decision

Two parts: the Ant Design icons are loaded on demand, and an application brings its own icons and images as an
**asset pack**.

```
 authors                         project (Git)                 registry               browser
 ───────                         ─────────────                 ────────               ───────
 acme-icons-1.2.0.zip  ──add──▶  assets/acme.json   ──publish──▶  assets/acme    ──▶  only the entries
 (pack.json + SVG/PNG)  (CLI)    (whole pack,        (CLI, keeps   (only the            the screen shows,
                                 already cleaned)    the used      used entries)         loaded on first use
                                                     entries)
```

### 1. The Ant Design icons, loaded on demand

- The initial bundle goes back to the short names of the built-in set (the ones the platform uses itself: `save`, `edit`,
  `more` and so on).
- The outlined and filled Ant SVG files (already in `@ant-design/icons-angular`) are copied into the runtime as static
  files, `/assets/{outline,fill}/<name>.svg`, served by the same origin and cached for a day. The components ask for
  one the first time it is drawn through the port `IconFiles` (`HttpIconFiles` in `services`, which refuses an answer
  that is not an SVG) and register it with NG-ZORRO; nginx answers 404 for a missing file, never the page.
- The bundle holds only the **list of names**, about 8 kB. A name on the list is fetched the first time it is drawn. Any
  other name still shows nothing and fetches nothing, so `../../evil` never reaches the network.
- The icons of a screen are requested together when it is drawn, in parallel, each once.
- Names stay those of 0.29.0, so nothing changes for the applications. The bundle returns to about 497 kB gzip.

### 2. The asset pack, as it is distributed: a zip with a descriptor

The zip is the exchange format: it is what a designer exports, a team shares, or the commercial edition offers in a
catalogue.

```
acme-icons-1.2.0.zip
├── pack.json
├── icons/truck.svg
├── icons/truck-filled.svg
├── icons/pallet.svg
└── images/empty-orders.svg
```

```json
{
  "name": "acme",
  "version": "1.2.0",
  "license": "Proprietary, ACME S.p.A.",
  "icons": {
    "truck": { "file": "icons/truck.svg", "filled": "icons/truck-filled.svg", "keywords": ["delivery", "shipping"] },
    "pallet": { "file": "icons/pallet.svg" }
  },
  "images": {
    "empty-orders": { "file": "images/empty-orders.svg", "alt": "An empty box" }
  }
}
```

- `name` is the namespace of the pack: lower case, digits and hyphens.
- `license` is required, because the notices of the application must be able to name it.
- `keywords` help the icon picker of Studio, and `alt` is the default text of an image.

### 3. In the project: a JSON document, already cleaned

`quadrava assets add acme-icons-1.2.0.zip` reads the zip, checks `pack.json` and the files it names, and writes
**`assets/acme.json`** next to `screens/` and `themes/`. This file is a definition like the others: in Git, readable in
a diff, validated by `quadrava validate`. The zip is not needed after this step.

```json
{
  "schemaVersion": "1.0",
  "assets": "acme",
  "version": "1.2.0",
  "license": "Proprietary, ACME S.p.A.",
  "icons": {
    "truck": { "viewBox": "0 0 1024 1024", "paths": ["M64 256h576v448H64z", "M640 384h192l128 160v160H640z"] }
  },
  "images": {
    "empty-orders": { "type": "image/svg+xml", "data": "PHN2ZyB4bWxucz0i…", "alt": "An empty box" }
  }
}
```

- Icons become **geometry only**: a `viewBox` and the path data. Other shapes (`circle`, `rect`, `polygon`) are turned
  into paths, colours become the current text colour (so the icon follows the theme and the tone), and anything else is
  dropped (scripts, styles, links, `foreignObject`, event attributes).
- Images keep their content, as base64, within a size limit (PNG, JPEG, WebP, GIF, and SVG cleaned in the same way).
  They become `data:` addresses in the browser, which the Content-Security-Policy already allows.
- What cannot become geometry filled with one colour is refused, with the reason, rather than drawn wrongly: strokes
  (outlined in the drawing tool), text, embedded images, masks, paths with different fill rules.
- The document follows `assets.schema.json`; `assets` is its identifier, as `screen` is for a screen, and the name of
  the file. The demo has one, `examples/assets/logistics.json`.

### 4. Used by name, with the namespace

```json
{ "type": "button", "label": "Ship", "icon": "acme/truck", "onClick": [{ "call": "ship" }] }
{ "type": "image", "src": "asset:acme/empty-orders" }
```

In a theme: `"logo": "asset:acme/logo"`.

- A short name (`save`) and an Ant name (`share-alt`) have no prefix. An icon of a pack has always the prefix, so two
  packs never collide and a new Ant icon never hides one of the application.
- A pressed toggle draws `filled` when the pack has it.
- Inside, the icon is registered with NG-ZORRO as `acme--truck`: the names of packs, of their entries and of the Ant
  icons have no double hyphen, so the two kinds never meet.

### 5. Only what the application uses

The pruning happens **when publishing**, the one moment when the whole application is known:

- `quadrava validate` collects every icon name and every `asset:` address of the screens, the navigation and the themes.
  It reports a name that no pack has (an error), and a pack entry that nobody uses (only a notice).
- `quadrava publish` publishes the document `assets/acme` with **only the used entries**. The project keeps the whole
  pack, so a new screen that uses `acme/pallet` adds it at the next publish.
- The runtime loads a pack document the first time a screen uses one of its names, and registers its icons with
  NG-ZORRO. An application that does not use packs loads nothing.

Example: a pack of 300 icons, of which an application uses 12, publishes 12 icons, about 6 kB.

### 6. Security

- **No SVG reaches the browser as the author wrote it.**
  - The CLI cleans it: geometry only, as in point 3.
  - The runtime checks the document again with the schema (a pattern for the path data, numbers for the `viewBox`, size
    limits), and builds the SVG markup itself before passing it to NG-ZORRO.
  - The rules of § 9 of CLAUDE.md still hold: the components never handle HTML or SVG strings themselves.
- **Limits**:
  - 1 MB per published pack document;
  - 8 kB of path data per icon;
  - 200 kB per image;
  - names `^[a-z0-9]+(-[a-z0-9]+)*$`.
- The pack documents go through the registry like the other definitions: version, hash, approval in the protected
  environments.
- The Content-Security-Policy does not change. Ant icons are fetched from `'self'`, and images are `data:` addresses,
  already allowed by `img-src`.

### 7. Contracts and public API

- **Contract first:**
  - `contracts/registry.yaml` gains the document kind `assets` (a minor version);
  - the new schema is `assets.schema.json`, with `description` on every property;
  - `project.json` does not change, since the packs are the files of `assets/`.
- **`DefinitionSource`** gains `assets(name)`. It comes with a default implementation that answers «not there», so an
  existing implementation (the commercial edition's included) keeps compiling.
- **`ANT_ICONS`**, exported in 0.29.0, is removed because the icons are no longer in the bundle. This is a breaking
  change of the public API, to be named in the changelog. It was introduced a release earlier and the commercial edition
  does not use it. `ICON_TYPES` and `iconType` stay.
- **Commercial edition:** Studio shows the icons of the packs in its picker and imports a zip through the same cleaning
  code. That code must therefore work in the browser too, so it is written as pure functions on a parsed tree, with two
  parsers: the DOM one in the browser, a library in Node.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| Keep everything static (0.29.0) | Every application pays +124 kB gzip, and none can bring its own icons. |
| The browser reads the zip | It needs an unzip library in the bundle and a binary file in the registry, with no version, hash or approval per document. The zip stays the exchange format. |
| Rebuild the runtime per application with only its icons | Against ADR-20: an application never builds Angular. |
| Icon font | It needs `font-src` from the application, cannot be pruned icon by icon, and an icon font reads badly to screen readers. |
| NG-ZORRO dynamic loading for any name | It would fetch from the network any name found in the JSON. Here only names on the list, or in a published pack, are fetched. |
| Images as files served by the runtime image | They would have to be mounted next to the image, outside the registry and its approvals. |

## Consequences

- The bundle goes back to its size before 0.29.0. The first time a screen draws an Ant icon it costs a small request,
  then the browser cache serves it.
- An application brings its own icons and images, versioned and approved like its screens, and publishes only the ones it
  uses.
- The CLI gains a dependency to read and clean SVG in Node, `svgo`. It is used only by the CLI and Studio, never in the
  runtime bundle.
- One more document kind for the BFFs that serve the registry (reference, light BFFs) and for their conformance kits.

## Phases

1. **Ant icons on demand**: the bundle back to 497 kB gzip, `ANT_ICONS` removed. A small release on its own.
2. **Packs in the runtime**: the schema, the document kind, the registry contract, `DefinitionSource.assets`, icons
   with a namespace. The showcase gets a sample pack.
3. **The CLI**: `assets add` from the zip, with the cleaning; the checks of `validate`; the pruning in `publish`.
4. **Images and logo** with `asset:` addresses.

## Decided on acceptance

- The name of a pack icon is `acme/truck` (first proposed as `acme:truck`), the same form as the images,
  `asset:acme/empty-orders`.
- Phase 1 is a release of its own; the phases follow one another.
- The SVG parser of the CLI is `svgo`, approved before phase 3.
