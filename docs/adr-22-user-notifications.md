# ADR-22: Messages for the user in the top bar

Status: Accepted (5 November 2026)

## Context

An application has things to tell its user that do not belong to one screen: an invoice was approved, a task was
assigned, an export is ready. Until now the only place for them was a screen of the application itself, which the user
has to open to find out. The shell should show that there is something new wherever the user is, and let them read it.

The browser talks only to the BFF, which adds the user's token (ADR-19 and `contracts/bff.yaml`); a mechanism for
messages must not open another way for data to reach the page, nor need a new endpoint that every BFF implements.

## Decision

**A bell in the top bar, fed by a service of the application.** The navigation document (the shell's own, published
in the registry like the menu) may declare `notifications`, in the same spirit as the menu counters (`badges`):

```json
"notifications": {
  "url": "/api/notifications",
  "readUrl": "/api/notifications/read",
  "live": { "url": "/api/streams/notifications", "events": ["notifications.changed"] }
}
```

```
service ──event: notifications.changed──▶ BFF ──(SSE, passed on as it arrives)──▶ browser
                                                                               │
shell ◀──────────── GET /api/notifications (token, tenant as always) ───────────┘
        → bell with the number of unread messages, list in a panel
click on a message ──▶ POST /api/notifications/read { "ids": ["n-12"] } ──▶ read again
```

- **The list.** A GET on `url` returns an array of messages `{ id, title, text, date, read, screen, params }`: `id` and
  `title` are required, `date` is ISO 8601, `screen` (with `params`) opens a screen of the application when the message
  is chosen. Texts are shown as plain text. An entry without `id` or `title` is left out (fail-closed), and a failed
  read keeps the previous list and goes to the technical reports, as for the menu counters.
- **Marking read.** Opening a message, or «Mark all as read», sends a POST to `readUrl` with the identifiers, then reads
  the list again. Without `readUrl` the messages are shown but stay unread: the service decides what read means.
- **Push, as in ADR-19.** With `live`, an event of the stream reads the list again; the events carry no data. The
  stream is listened to for the whole session, not only while a screen is open: it is one more connection per page.
  Without `live` (or without the `LiveUpdates` port) the list is read at intervals (`refreshSeconds`, 60 if absent),
  when the page comes back to the foreground and when the panel opens.
- **No new contract.** The list and the POST go through `DataClient` like every other call (the BFF adds the token and
  the CSRF protection of writes); the stream goes through the BFF as ADR-19 already requires. The shape of the list is
  part of the navigation schema, as the shape of the counters is.
- **The demo** has a fake inbox in its in-memory back end, with a new message from time to time.

## Alternatives considered

- **Data source documents** (`{ "ref": "inbox/list" }`). More flexible (response mapping, parameters), but a data
  source is executed by the runtime of a screen: the shell would need one for itself, with its state and expressions,
  for a list with a fixed shape. The counters already showed that a fixed shape and a path are enough.
- **Fixed endpoints in the BFF contract** (`GET /bff/notifications`). One shape for everybody, but every BFF would have
  to implement it; with a path in the navigation each application connects its own service.
- **WebSocket.** As in ADR-19: the page only needs to hear that something changed.
- **Web push** (notifications of the operating system, with the page closed). A different need (service worker,
  permission of the user, a push service): outside this decision.

## Consequences

- An application that wants the bell offers a GET with the list and, optionally, a POST and an event stream.
- One connection more per page with `live`: behind HTTP/1.1 browsers allow six per host, so a BFF with many streams
  should use HTTP/2, or the services should share one stream with several event names.
- Messages are read by the shell, not by a screen: their visibility is decided by the service, for the user of the
  session (the front end is not an authorization boundary).
