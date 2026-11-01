# Quadrava CLI

Checks and publishes [Quadrava CE](https://github.com/sramaccini/quadrava) projects: the screens, data sources,
navigation, themes and translations in JSON that the Quadrava runtime shows. Made for the CI of a project: a problem is
found before the project reaches the registry, with the same checks the runtime applies.

Node.js 20 or later; no dependencies. The version of the CLI is the version of Quadrava whose schemas it checks.

## Install

The package is on GitHub Packages, which asks for a token even to read public packages. In the project, an `.npmrc`:

```
@sramaccini:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

with `GITHUB_TOKEN` a token with `read:packages` (in GitHub Actions, the token of the workflow with
`permissions: packages: read`). Then:

```bash
npm install --save-dev @sramaccini/quadrava-cli@0.4.1
npx quadrava validate
```

## Commands

```bash
quadrava validate [folder]
quadrava publish [folder] --registry <url> --app <id> [--env <environment>] [--token-env <variable>]
```

**`validate`** reads the project in the folder (default: the current one), laid out as a Quadrava project:

```
project.json          manifest: name, languages, themes
navigation.json       areas and menus
screens/*.json        one file per screen, named after its identifier
datasources/*.json    data sources documents shared by the screens
themes/*.json         one file per theme
i18n/*.json           one catalogue per language: key → text
```

and checks, as the runtime reads them:

- every document against its JSON Schema;
- the identifier of every screen, data sources document and theme against the name of its file;
- the references of the screens to data sources (`{ "ref": "orders/list" }`), and every data source a screen names
  (components, lookups, `columnsFrom`, `fieldsFrom`, steps, remote rules, uploads) among its `dataSources`;
- the `pattern` of fields and validation rules (Unicode, whole value, at most 500 characters);
- the CEL expressions (`{{ … }}`) of screens, data sources and navigation;
- the themes and the languages of the manifest;
- the catalogues: the same keys in every language, and every `t('…')` in the catalogue of the default language.

```
ERROR  screens/order-list.json /components/2/visibleIf: expression {{ can('orders.order.edit' }}: Expected RPAREN, got EOF
ERROR  i18n/it.json: missing key orders.title
12 files checked: 2 problems.
```

**`publish`** checks the project first and stops if it has problems; then, for every document (data sources first,
since the screens refer to them), saves a version in the registry and publishes it in the environment (default:
`development`), as described by the registry contract (`contracts/registry.yaml`). The token is read from the
environment variable `QUADRAVA_TOKEN`, or from the one named by `--token-env`; never from the command line, which would
leave it in logs and process lists. Protected environments (such as `production`) accept approved versions only:
there publishing fails until a reviewer approves them in the registry.

Exit code: `0` when everything is fine, `1` when the project has problems or a document was not published, `2` for a
wrong command.

## In GitHub Actions

```yaml
permissions:
  contents: read
  packages: read
steps:
  - uses: actions/checkout@v7
  - uses: actions/setup-node@v7
    with:
      node-version: 24
      registry-url: https://npm.pkg.github.com
      scope: '@sramaccini'
  - run: npx --yes @sramaccini/quadrava-cli@0.4.1 validate quadrava
    env:
      NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  - run: npx --yes @sramaccini/quadrava-cli@0.4.1 publish quadrava --registry https://registry.example --app tracker --env testing
    env:
      NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      QUADRAVA_TOKEN: ${{ secrets.REGISTRY_TOKEN }}
```

## Licence

MPL-2.0. The bundled CEL engine keeps its own licence: `THIRD-PARTY-NOTICES.md`.
