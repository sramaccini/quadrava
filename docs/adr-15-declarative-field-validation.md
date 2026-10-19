# ADR-15: Declarative, pluggable field validation

Status: Accepted (19 October 2026), amended the same day with phases 2 and 3 · Requirement: RF-DEF-06 (declarative validation: required, format, rules across several fields)

## Context

Until now a field could only say `required` and carry **one** CEL rule (`validate: { rule, message }`). Everything else (a length, a number range, an IBAN, an Italian tax code, «the end date comes after the start date») had to be written as a CEL expression by hand, with its own message, in every screen. There were no formats, no check digits, no number limits, no warnings, no rules spanning several fields, and applications had no way to add a check of their own.

We want:

- the common cases in one line (`"maxLength": 50`, `"format": "iban"`), and the rare ones still possible;
- national formats for Italy and the main EU countries, with their check digits;
- rules across fields (confirmation, date ranges, «at least one of»), conditional rules and warnings that do not block;
- one place where a check is written, reused by the runtime, the expressions, the messages and the editor;
- applications able to register their own checks, the same way they register their own components.

## Decision

### One engine, validators as descriptors

A **validator** is a small descriptor registered by name:

```ts
const staffNumber: ValidatorDescriptor = {
  name: 'staffNumber',
  appliesTo: ['text'],                 // field types (all if absent)
  hints: { inputMode: 'numeric' },     // inputmode / autocomplete of the control
  validate: (value) => (/^S\d{6}$/.test(String(value)) ? null : {}),
};
```

`validate(value, params, context)` is a pure function: it returns `null` when the value is valid, or a failure `{ params? }` whose parameters fill the translated message (`lc.validation.<name>`, Italian and English in `messages.ts`). The context gives the values of the sibling fields (the form, or the row of a repeater) and their labels, for the rules across fields. It never sees the screen runtime.

The built-in validators are the standard set `STANDARD_VALIDATORS` in `core`; the `ValidatorRegistry` (root service) holds them plus those of the application, provided with `provideValidators(...)` (a multi-provider, like `provideLowcodeComponents(extra)`; a validator with the same name replaces the built-in one).

The same descriptor powers:

| Where | How |
| --- | --- |
| Runtime | `form`, `input`, `filterBar` and the rows of `repeater` run the rules of the field through the engine |
| Messages | the default message is `lc.validation.<name>` with the parameters of the failure (`{min}`, `{max}`…), overridable per rule |
| Expressions | one CEL function, `isValid(name, value[, params])`, e.g. `isValid('iban', form.iban)` or `isValid('vatNumber', x, {'country': 'DE'})` |
| Controls | `hints` set `inputmode` and `autocomplete` of the text box (email, phone, postal code…) |
| Editor | the parameters of the built-in validators are described in `screen.schema.json`, so the property panel and the generated reference show them like any other property |

### Two syntaxes, one list of rules

**Simple**: flat properties on the field for the common cases.

```json
{ "name": "iban", "type": "text", "required": true, "format": "iban", "transform": ["removeSpaces", "uppercase"] }
{ "name": "qty", "type": "number", "min": 1, "max": 999, "integer": true }
{ "name": "vat", "type": "text", "format": "vatNumber", "country": "{{form.country}}", "messages": { "format": "{{t('order.vatInvalid')}}" } }
```

| Field type | Properties |
| --- | --- |
| text, textarea, richtext | `minLength`, `maxLength`, `pattern`, `format` (+ `country`), `transform` |
| number | `min`, `max`, `step`, `decimals`, `integer` |
| date, datetime | `minDate`, `maxDate` (absolute for now) |
| all | `required`, `validate` (CEL), `messages` (text per constraint) |

**Advanced**: a `validation` list on the field, and one on the form for rules across fields. Each rule is an object **named by its key**, like the steps of an action, with three optional companions: `message`, `when` (CEL condition: the rule applies only when it is true) and `severity` (`error` blocks the submit, `warning` only informs).

```json
"validation": [
  { "required": true, "when": "{{form.customerType == 'company'}}" },
  { "format": "vatNumber", "country": "{{form.country}}" },
  { "pattern": "^IT", "severity": "warning", "message": "{{t('order.foreignVat')}}" },
  { "rule": "{{value != form.referrer}}", "message": "{{t('order.sameAsReferrer')}}" },
  { "use": "staffNumber" }
]
```

On the form the rules name the fields that receive the message (`fields`):

```json
"validation": [
  { "after": "start", "fields": ["end"], "inclusive": true },
  { "sameAs": "email", "fields": ["emailConfirm"] },
  { "atLeastOne": ["phone", "email"] }
]
```

Rules of a repeater: the cells have their own rules (they see the row in `item`, and cross-field rules compare the cells of the same row); on the repeater field, `{ "unique": "code" }` marks the cells whose value repeats in another row.

Both syntaxes compile into the same list (flat properties first, in a fixed order, then `validate`, then `validation`), checked in order; the first error wins, a warning is shown only when there is no error. Empty values are left to `required` (and to `atLeastOne`): every other rule passes on an empty field. `transform` (trim, uppercase, lowercase, removeSpaces) is applied when the user leaves the field and before checking and sending, never while typing.

The rule list is keyed (`{ "minLength": 3 }`, not `{ "use": "minLength", "value": 3 }`) because the flat property and the rule then read the same, and because the editor already builds a panel per variant from a keyed `oneOf` (as for steps). `use` is the generic form, for validators of the application.

### Built-in validators

- Generic: `required`, `minLength`, `maxLength`, `pattern`, `min`, `max`, `step`, `decimals`, `integer`, `minDate`, `maxDate`, `sameAs`, `after`, `before`, `atLeastOne`, `unique`.
- Formats: `email`, `url` (http and https), `phone` (lenient international: 6–15 digits), `iban` (length per country and mod-97), `bic`, `uuid`, `alphanumeric` (ASCII letters and digits).
- National formats, with `country` fixed or as an expression:
  - `vatNumber`: IT, DE, FR, ES, NL, BE, AT, PT, PL, SE, with the national check digit where one is published; without `country` the prefix of the number decides;
  - `taxCode` (personal tax number): IT codice fiscale (16 characters with omocodia, or 11 digits), ES NIF/NIE, PT NIF, NL BSN;
  - `companyId`: IT partita IVA, FR SIREN/SIRET, ES CIF, PT NIPC, BE enterprise number, NL KvK;
  - `postalCode`: IT, DE, FR, ES, NL, BE, AT, PT, PL, SE.

  A country the format does not support makes the field invalid and is reported (fail-closed).

### Safety

- **Fail-closed.** An unknown validator, a validator used on the wrong field type, invalid parameters, a pattern that does not compile, a rule or a message that cannot be evaluated: the field is invalid and the problem goes to `RuntimeDiagnostics` once per rule, never as an exception while rendering. A `when` that cannot be evaluated keeps the rule active.
- **Patterns from the JSON** are compiled once with the `u` flag, are capped at 500 characters, match the whole value (as the HTML `pattern` attribute) and are tested only on values up to 1000 characters (a longer value does not match). The editor and `validate:examples` report a pattern that does not compile.
- **No values in diagnostics or messages.** Diagnostics name the screen, the field and the rule; default messages carry only the parameters of the rule (limits, dates, labels), never what the user typed.
- The front end is not an authorization or integrity boundary: every rule that matters is repeated by the service receiving the data (CLAUDE.md § 9).

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| Only CEL rules, with functions for formats (`isIban(form.iban)`) | Every rule needs its own message and is repeated in every screen; no editor panel, no input hints, no warnings |
| Angular validators (`Validators.minLength`…) | Validation stays in the platform (DEVELOPMENT-GUIDE § 5): NG-ZORRO controls are bound with `ngModel`, and the same rules are needed outside forms (filters, standalone inputs, expressions) |
| A JSON Schema per field, checked with Ajv at run time | Heavy in the bundle, messages hard to translate, no cross-field rules, no national check digits |
| Rules as `{ "use": "<name>", ...params }` only | Every rule would read differently from the flat property, and the editor could not tell the variants apart without new code; kept as the generic form for application validators |
| Parameter schemas inside the TS descriptors | Two sources for the same thing; the screen schema is the only source (CLAUDE.md § 6), and the editor and reference already read it |
| zxcvbn or a validation library (validator.js, libphonenumber) | New dependencies and hundreds of kB for a few checks; the algorithms needed are short and testable |
| One CEL function per validator (`isIban`, `isTaxCode`…) | The set of functions would change with the registry, so the static check of expressions would depend on the application; one function with a fixed signature works everywhere |

## Consequences

- Screens written before keep working: `required` and `validate` mean the same as before.
- `validate` stays a single rule; several CEL rules go in `validation`.
- A validator of the application used with `use` is not described by the schema: the editor shows its `params` as JSON.
- Phases 2 and 3 are below.

## Amendment: phases 2 and 3 (19 October 2026)

### Password fields

A new field type `password`: a masked text box with a show/hide button (`aria-pressed`, its own label) and, with `newPassword: true`, a strength meter under it and `autocomplete="new-password"` (`current-password` otherwise). The value is always treated as sensitive. The constraints of text apply (`minLength`, `maxLength`, `pattern`), plus `minStrength` (0–4), flat or as a rule `{ "minStrength": 3 }`.

Strength is our own light estimate (a pure function, `passwordStrength`), not zxcvbn: the length that counts is what is left after taking away repeated characters, sequences (`abcd`, `1234`, keyboard rows), years, common words and passwords (a short list, also written with digits for letters: `p4ssw0rd`) and the values of the other fields of the form (a name, an e-mail); that length times the bits of the character classes used gives a score from 0 (very weak) to 4 (strong), with the reasons as hints. The meter shows the score as segments **and** as text, and announces it politely to screen readers. The password never leaves the browser for the estimate.

Not in a repeater nor in a filter bar.

### Remote (asynchronous) rules

A rule `{ "remote": "<data source>", "debounce": 400, "message"?, "when"?, "severity"? }` checks the value on a service: the data source sees the value in `value` (and the form in `form`), for example `"params": { "staffNumber": "{{ value }}" }`, and answers `true` / `false` or `{ "valid": false, "code": "taken", "params": {…} }`. The check starts when the user stops typing (`debounce` ms, 400 if absent), only when every other rule of the field passes, and a newer value cancels the request still in progress (`AbortSignal`). Results are kept per value, so going back to a value already checked asks nothing. While it runs the field shows a spinner; the form waits for the checks in progress before sending. A check that fails (network, error status, an answer of another shape) does not pass (fail-closed) with its own message. Remote rules exist in forms and standalone fields, not in the rows of a repeater nor in filters; a standalone field still being checked does not pass the `validate` step.

The message: the rule's own, otherwise the `code` of the answer translated (`validation.<code>` in the application's catalogue, then `lc.validation.<code>`), otherwise `lc.validation.remote`. The text written by the service is never shown, as for every other error of the services.

### Relative dates and list limits

`minDate` / `maxDate` also accept `today`, `today+30d`, `today-18y` (units d, w, m, y), resolved on the local day at every check and in the calendar. `minItems` / `maxItems` limit the choices of a multiple selection (an empty selection is left to `required`).

### Field errors from the services (contract first)

`contracts/problem.yaml` describes the RFC 9457 Problem that application services return for invalid data (400 or 422), with `errors`: `{ "path": "/email", "code": "taken", "params"?: {…}, "message"?: "…" }`. `path` is a JSON Pointer into the request body (`/lines/0/code` for a cell of a repeater), as in the registry's validation problems; `code` is translated by the front end like the code of a remote rule; `message` is for developers and is never shown. The `services` data client reads these entries (at most 50, codes and paths of limited length, parameters only with simple values) into the error of the call; the form that ran the `call` step puts each message on its field (or cell) until that field changes, and the default message of the failure becomes «Check the highlighted fields». Entries that match no field are ignored.

### Alternatives considered (amendment)

| Alternative | Why not |
| --- | --- |
| zxcvbn | About 800 kB with its dictionaries, for a meter; a light estimate with the same principles (patterns, dictionary, personal data) is enough to guide the user, and the rule that matters is repeated by the service |
| Remote checks as `isValid` in CEL | Expressions are synchronous and without side effects; a call belongs to the data sources |
| Showing the message of the service | It can contain internal details and is in the language of the service: codes translated by the front end, as for every other error |
| Field errors with the names of the fields | A JSON Pointer also reaches the cells of a repeater and is what the registry already uses |
