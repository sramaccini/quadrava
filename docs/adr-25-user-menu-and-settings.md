# ADR-25: Items of the application in the user menu and in the settings

Status: Accepted (7 November 2026)

## Context

The user menu of the shell has the built-in «Settings…» and «Sign out»; the settings dialog has «General» (theme and
language) and, in the demo, «Debug». An application could add neither: things that belong to the user rather than to
the work (their profile, their notification preferences) ended up as screens in the side menu, among the work.

The first case came from OpenDevTrack (request Q13): per-user notification preferences, one row per kind of message
(mentioned, assigned, commented, status changed) with «in the application» on or off and «email» off, at once or as a
daily summary, plus the user's address, read only. They belong next to theme and language. The same request asked that
the language chosen in the dialog reach the services: until now their messages followed the language of the browser.

## Decision

**Two lists in the navigation document, with the shape of a menu item.** The navigation (the shell's own document,
published in the registry like the menu) may declare `userMenu` and `settings`. Both are lists of the same `leaf` as the
side menu: `id`, `label` (text or expression, translated), `icon` from the built-in set, `screen` with `params`,
`requires` and `visibleIf`.

```json
"userMenu": [
  { "id": "my-expense-review", "label": "{{ t('nav.my_expense_review', 'Expenses to review') }}", "icon": "euro",
    "screen": "expense-list", "params": { "status": "to-review" }, "requires": "expenses.expense.read" }
],
"settings": [
  { "id": "notification-settings", "label": "{{ t('nav.notification_settings', 'Notifications') }}",
    "screen": "notification-settings" }
]
```

```
user menu                         settings dialog
┌──────────────────────┐          ┌ General │ Notifications │ Debug ┐
│ Expenses to review   │ userMenu │                               │
│ Settings…            │          │  lc-screen «notification-     │  settings[0]: a screen
│──────────────────────│          │  settings»: form, GET / PUT,   │  of the application,
│ Sign out             │          │  validation, its own Save      │  drawn in the tab
└──────────────────────┘          └───────────────────────────────┘
```

- **User menu.** The items of the application come first, then «Settings…», then «Sign out» after its separator. Choosing
  one opens its screen with its parameters, in the area of the menu that has it (or the current one), as a message of the
  bell does. The keyboard and screen-reader behaviour is that of the menu (`lc-user-menu`).
- **Settings.** Every section is a tab after «General», drawing a screen of the application, loaded and checked as the
  router does (schema, expressions, references to data sources). It is drawn when its tab is first opened, so its reads
  start then. The dialog is larger when there are sections, and keeps its size from tab to tab. A screen that navigates
  closes the dialog.
- **An address for the settings.** The URL says whether the dialog is open and on which tab: `?settings=general`, the
  `id` of a section (`?settings=notification-settings`) or `debug` in the demo. A link (for example in a mail) opens the
  dialog on that tab, after the sign-in if needed, over the screen of the address or, from the root, over the default
  one; a reload keeps it; changing tab updates the address, closing the dialog removes the parameter. An unknown tab, or
  a section the user does not have, shows «General». `settings` is a parameter of the shell: the screen does not
  receive it, so a screen cannot use a parameter with that name. Added on 7 November 2026 (request Q15 of OpenDevTrack).
- **Visibility, fail-closed, as the side menu.** An item without the permission in `requires`, or whose `visibleIf` is
  false or fails, is left out. As for the menu, it is only a convenience: the screen checks its `requires` again, the
  services check everything.
- **The language reaches the services.** The interceptor of `services` sends `Accept-Language` with the language chosen
  by the user on every call to the same origin, unless the call sets it itself; the BFF passes it on (BFF contract 0.4).
  A service can therefore answer with labels and messages in the user's language, as the fields of a `fieldsFrom` do.

**No new form language.** A section is a screen, so it has what a screen has: a `form` with `source` (the GET of the
values), `actions` with a `call` to a PUT and a `toast`, `readOnlyIf`, validation, errors of the service on their fields.
The rows of the OpenDevTrack case are fields described by the service (`fieldsFrom`, with `into` and `columns: 2`): one
row per kind of message, the labels in the user's language. The demo has the same section («Notifications»).

## Alternatives considered

- **A form language inside the navigation** (fields, a GET and a PUT declared in the section). Shorter for the simplest
  case, but a second, smaller copy of the form of the screens, which would grow towards it (validation, read-only fields,
  errors, rows). A screen already does all of it and Studio already edits it.
- **Items that run steps** directly from the user menu. Steps live in the runtime of a screen (its state, its data
  sources, its forms); the shell has none. An item that opens a screen covers it: the screen runs its steps.
- **A header of its own** (`X-Language`) instead of `Accept-Language`. The standard header is the one the services and
  their frameworks already read, and the browser sends one anyway: the runtime only puts the user's choice in it.

## Consequences

- The navigation document has two more optional lists; with none of them nothing changes.
- `checkNavigation` checks their identifiers and screens too; the registry of the commercial edition sees their screens
  as references, as it does for the side menu.
- BFF contract 0.4: the BFF forwards `Accept-Language` to the services.
