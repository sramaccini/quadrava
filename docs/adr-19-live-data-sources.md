# ADR-19: Data sources updated by push

Status: Accepted (31 October 2026)

## Context

A board shared by a team (a kanban, a thread of comments) goes stale as soon as someone else changes it. Until now
the only remedy was a `refresh`: after one's own actions, or on a timer, which reads again even when nothing changed
and still lags behind.

The browser talks only to the BFF, which adds the user's token; every rule on data (permissions, tenant, filters)
lives in the request of the data source. A push mechanism must not open a second way for data to reach the page.

## Decision

**The events signal, the data source reads.** A GET data source may declare `live`: an event stream (Server-Sent
Events) on the same origin, and the names of the events that concern it. When one of them arrives, the runtime reads
the data source again with its normal request; the `data` of the event is ignored.

```json
"tasks": { "type": "rest", "method": "GET", "url": "/api/tasks",
           "live": { "url": "/api/streams/tasks", "events": ["tasks.changed"] } }
```

```
service ──event: tasks.changed──▶ BFF ──(passed on as it arrives)──▶ browser (EventSource)
                                                                        │ 200 ms: a burst is one read
runtime ◀───────────── GET /api/tasks (token, tenant, filters as always) ┘
```

- **A port.** `LiveUpdates` (`core`) listens to a stream and calls back for the named events and after a reconnection,
  when some may have been missed. `services` implements it with `EventSource`, one connection per address however many
  data sources use it, closed with the last one. Without the port (an application that does not provide it) the data
  sources are read as before: `live` is optional by construction.
- **Only the same origin.** The address is a fixed path: no expressions, query or host (schema, and checked again by
  the runtime, which reports and ignores any other value). The session cookie goes with it like any call.
- **While the screen is open and allowed.** The runtime listens only while the user has the permission of the screen
  and stops when the screen is left; a read already scheduled is cancelled. The read is a `refresh`: the previous data
  stay visible while it loads, and components that query the source themselves follow it.
- **The BFF passes streams through.** `contracts/bff.yaml` 0.3.0 adds the rule: a `text/event-stream` answer is passed
  on as it arrives, without buffering or a time limit, with the user's token. The reference BFF flushes after every
  read of such a response.
- **The demo** has a fake stream fed by its in-memory back end: «A colleague moves a card» changes a task a moment
  later, and the boards of the showcase follow without any `refresh` step.

## Alternatives considered

- **Data in the events** (the changed rows pushed to the page). Faster by one call, but the events would bypass the
  request of the data source, with its parameters, paging and permissions, and every service would have to shape its
  events like its responses. A read is simpler and certainly consistent.
- **WebSocket.** Two-way and more capable, but it needs its own protocol, its own reconnection and a BFF that upgrades
  connections; the page only needs to hear that something changed.
- **Polling** (`refresh` on a timer, possibly a new `every` property). Simple, but it reads when nothing changed and
  lags by its interval; it remains possible with today's steps for services that have no stream.

## Consequences

- A service that wants live boards offers an event stream and names its events; nothing else changes for it.
- One open connection per stream address per page. Browsers limit connections per host over HTTP/1.1 (six), so a BFF
  serving many streams should use HTTP/2, or the services should share one stream with several event names.
- After a refused stream (`401`, `403`) the browser does not reconnect: the board goes back to being read on demand
  until the page is reloaded, and the next normal call handles the expired session.
- The conformance kit of the BFF does not check streams yet: it needs a service that sends events.
