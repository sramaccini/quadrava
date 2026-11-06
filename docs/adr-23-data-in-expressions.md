# ADR-23: The data of the screen's data sources in expressions

Status: Accepted (6 November 2026)

## Context

An expression sees the user, the state of the screen (`state`), its parameters (`params`), the settings of the
application (`settings`) and the variables of the point where it is written: `row` in a table, `form` inside a form,
`value` in a field. A component outside a form cannot see what the form has loaded.

Request Q9 of OpenDevTrack shows the gap. The detail of an issue has a form, loaded by the data source `issue`, and,
in a tab next to it, the thread of its comments. The thread may be written only by those the back end allows: the
issue carries `_perm.comment`. The condition of the thread, `postIf: "{{ form._perm.comment }}"`, is always false there:
`form` does not exist outside the form, and an expression that fails grants nothing. No step runs when a data source
loads, so the value cannot be copied into `state` either.

## Decision

**`data`: the data of the screen's read data sources, by name.** Every expression of a screen sees `data.<name>`, the
last response of the data source `<name>` declared by the screen with the method GET:

```json
{ "type": "comments", "source": "comments", "postIf": "{{ data.issue._perm.comment }}" }
```

```
dataSources.issue (GET /api/issues/{{ params.id }}) ──answer──▶ data.issue ──▶ any expression of the screen
                                                                   │
                                     form, comments, buttons, tabs ┘ (same value, same moment)
```

- **Read only, and only reads.** `data` holds GET data sources only: a write (POST, PUT, PATCH, DELETE) is an action,
  whose answer the steps already see with `as`. Nothing writes into `data`.
- **Fail-closed.** A data source not yet answered, failed, or not declared is not in `data`: an expression that reads
  it fails and grants, shows and enables nothing. While a data source reloads, `data` keeps its previous answer, as
  the components do. `has(data.issue)` tells whether it has answered.
- **The same answer the components show.** `data.issue` is the state the form shows, not a new request.
- **`data` is a reserved name**: the `as` of a `call` step cannot be `data`.

## Alternatives

- **`form` of the screen's main form visible to the components next to it.** A screen may have several forms, or none
  with a data source; «the main form» would be a new notion of the schema, and it would cover only the data of a form.
- **A step on the loading of a data source (`onLoad`) that copies values into `state`.** More general, but it adds a
  life cycle to design (order, reloads, errors) and duplicates the data in the state, for a reading need.

## Consequences

- No new contract, no change of the BFF: the data is already in the page.
- A condition that depends on data is false until the data arrives, as every failed expression.
- The front end is not an authorization boundary: a value of `data` decides what is shown, the back end still decides
  what is allowed.
- `data` cannot be the name of a response (`as`) any more; no published example used it.
