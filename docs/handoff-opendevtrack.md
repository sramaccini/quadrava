# Handoff — Quadrava work requested by OpenDevTrack

For the Claude Code session that continues Quadrava locally. Written on 30 October 2026, at the end of the planning
session of **OpenDevTrack**. Read [HANDOFF.md](../HANDOFF.md) first: its working principles apply here too.

> **Status (31 October 2026): implemented.** Every item and decision was approved in one go and done in the order
> B1, B2, K1–K5, L1, L2, L3, Q0. The proposals below are kept as they were written; § 0 says where each item is.

## 0. What was done

| # | Commit | Where |
| --- | --- | --- |
| B1 | `fcde14f`, `2ea4904` | `contracts/bff.yaml`, `npm run conformance:bff`; the reference BFF now forwards `X-Permissions-Version` |
| B2 (D8) | `528d016` | ADR-18: `tenants` and `currentTenant` in the user, `POST /bff/tenant`, `tenantSwitchUrl` in the runtime configuration |
| K1–K4 | `0c76db6` | `kanban`: order within columns, swimlanes, WIP limits, rich cards (catalogue § 2.24) |
| K5 (D6) | `8e85497` | `kanban`: `columns` as an expression, `columnsFrom` a data source |
| L1 | `efd9858` | `suggest` on text fields (catalogue § 2.7) |
| L2 | `5fa0010` | `comments` component (catalogue § 2.30) |
| L3 | `af55d09` | ADR-19: `live` on GET data sources, Server-Sent Events through the BFF (`bff.yaml` 0.3.0) |
| Q0 (D1) | `c5b06e9` | ADR-20: version 0.1.0, `CHANGELOG.md`, release workflow, the runtime image `ghcr.io/sramaccini/quadrava-runtime` (`docker/runtime/README.md`) |

**What ms-authz must adapt** (in its own repository; nothing changes in Quadrava). The check is
`npm run conformance:bff -- --bff <address> --return <page>`, with `--cookie` for the signed-in part.

1. **Logout**: `POST /logout` with `Accept: application/json` answers `{ "redirect": "<address>" }`, not `logout_url`.
2. **Login**: `GET /bff/login?return=<page>` goes back to `return` after the login, accepted only when its origin is
   one of the applications (no open redirect); `400` otherwise.
3. **Capabilities**: `GET /authz/capabilities` as in `contracts/authz.yaml` (the permissions of the user, with their
   version).
4. **Permission codes** in the format `domain.resource.action` (for example `tracker.issue.edit`), not
   `resource:action`.
5. **Rules of every call** (`bff.yaml`): `401` instead of a redirect when the session is missing; the `XSRF-TOKEN`
   cookie readable by the page and `X-XSRF-TOKEN` required on writes; `X-Permissions-Version` passed on to the browser.
6. **Tenants**, only if OpenDevTrack has more than one: `tenants` and `currentTenant` in `/bff/user`,
   `POST /bff/tenant` with CSRF (ADR-18).
7. **Event streams**, only if boards use `live`: `text/event-stream` answers passed on unbuffered and without a time
   limit, with the user's token (ADR-19).
8. **Behind the runtime image** with `QUADRAVA_BFF_URL`: honour `X-Forwarded-Host` and `X-Forwarded-Proto` (for Spring
   Boot `server.forward-headers-strategy=framework`), so that the login callback and the `return` check use the public
   address.

## 1. Context in three lines

- **OpenDevTrack** is an open-source Jira-like tracker. Its front end is **a Quadrava project** (JSON only: screens,
  data sources, navigation, themes, i18n) run by the Quadrava runtime, used **as a versioned dependency, never cloned
  or forked**. Anything missing is added to Quadrava, with its own tests and release.
- Its back end is a Spring Boot 4.1 + Spring Modulith monolith on PostgreSQL, with login, session and RBAC coming from
  **ms-authz 2.0**: three libraries embedded in the monolith (`authz-bff`, `authz-session`, `authz-rbac`; Spring Session
  on Redis), branch `feature/librerie` of [sramaccini/ms-authz](https://github.com/sramaccini/ms-authz/tree/feature/librerie).
- Project plan (Claude doc, Italian): https://claude.ai/artifact/HBk1PW4u8x9C3gHaFsZZYF — sections «Uso della
  piattaforma Quadrava», «Uso di ms-authz», «Roadmap», «Decisioni aperte».

## 2. Rule for every change: Quadrava stays independent

OpenDevTrack and ms-authz are the first real consumers, not the only ones. Every item below must follow these rules,
so that an adopter with another back end (the reference BFF, or anything else) sees no difference:

1. **Optional by construction.** A new capability turns on only when the back end offers it (a configured URL, a
   field present in a response). Absent → today's behaviour, unchanged.
2. **Quadrava owns the contract.** Names and shapes are decided in `contracts/`, neutral and in Quadrava's style.
   If ms-authz uses other names, ms-authz adapts, not Quadrava.
3. **Proven by a test.** A conformance kit checks each contract in both modes (with and without the optional part),
   against the reference implementation; ms-authz must pass it too.

As usual: schema first, `npm run schema:sync` and `schema:docs`, tests for schema, component and showcase, an example
in the demo showcase, the component catalogue and `docs/editor.md` updated, an ADR for anything structural.

## 3. Work items, in priority order

| # | Item | Needed by (OpenDevTrack phase) | Approval |
| --- | --- | --- | --- |
| Q0 | Versioned distribution of Quadrava | F0, 27 Nov 2026 | Decision D1 |
| B1 | `contracts/bff.yaml` + conformance kit | F1, 8 Jan 2027 | Go-ahead |
| B2 | Optional tenant selection in the shell | F2, 19 Feb 2027 | Decision D8 |
| K1–K5 | `kanban` evolutions | F3, 19 Feb 2027 (before F3 starts) | Go-ahead; K5 is decision D6 |
| L1 | Text query field with suggestions | F4, Apr 2027 | Go-ahead |
| L2, L3 | `comments` component, push data sources (SSE) | after 1.0 | Later |

### Q0 — Versioned distribution (decision D1)

Today the libraries are not published (`0.0.1`, no npm scope), so a consumer can only clone the repository, which is
exactly what OpenDevTrack must not do. Options: npm packages `@quadrava/*`; a **container image of the runtime**
configured with the address of the definitions (recommended in the plan: the consumer never builds Angular); git tags
as a stopgap. Needs semantic versioning, a changelog and a release workflow on GitHub Actions.

### B1 — BFF contract and conformance kit

Gap: `authz.yaml`, `registry.yaml` and `telemetry.yaml` exist, but what the runtime expects from the BFF lives only in
code (`frontend/projects/services/src/lib/session.ts`, `config.ts`, `interceptor.ts`). Write `contracts/bff.yaml`
describing what the runtime relies on today:

- current user: `GET {sessionUrl}` (default `/bff/user`) → `{ name?, username?, roles? }`; `401` when no session;
- login: navigation to `{loginUrl}?return=<current page>` (default `/bff/login`);
- logout: `POST {logoutUrl}` (default `/logout`), `Accept: application/json` → `{ "redirect": "<url>" }`;
- writes: `X-XSRF-TOKEN` sent when an `XSRF-TOKEN` cookie exists; same-origin requests only;
- `401` on any API call → login redirect; `X-Permissions-Version` → permissions reloaded (already in `authz.yaml`).

Then a kit `npm run conformance:bff` in the style of the existing ones, run against the reference BFF. Unknowns to
settle with Simone before writing: whether the session payload gets more standard fields (`email`, `permissions`).

Known differences in ms-authz 2.0 today (ms-authz will adapt, nothing to do in Quadrava): it answers the logout with
`logout_url` instead of `redirect`, ignores `return`, has no `/authz/capabilities`, and uses `resource:action`
permission codes instead of Quadrava's `domain.resource.action`.

### B2 — Optional tenant selection (decision D8)

Problem: a user with several tenants is sent by ms-authz to `login-error?error=tenant_selection_required`; Quadrava
has no public page to choose one, so the user loops on the login. Agreed direction (to approve):

- the back end logs in on the last tenant used, no question at login;
- the optional part of `bff.yaml`: the session response may carry `tenants: [{ id, label }]` and `currentTenant`;
  switching is `POST {tenantSwitchUrl}` with `{ "tenant": "<id>" }` — **a POST, never a GET** (the session cookie of
  ms-authz is `SameSite=Lax`, so GETs coming from external links carry it);
- the shell shows a tenant selector in the user menu **only if** `tenantSwitchUrl` is configured **and** the list has
  more than one entry; after switching it reloads permissions, navigation and the current screen;
- Quadrava never interprets what a tenant is: it shows a list and calls a URL. Names above are proposals: Quadrava
  decides them.

### K1–K5 — `kanban` evolutions

Today: cards with title and description in columns from a field, moved between columns only, `onMove` with `row`,
`from`, `to`, `moveIf`. A tracker board needs:

| # | Need | Proposal | Temporary workaround in OpenDevTrack |
| --- | --- | --- | --- |
| K1 | Order of cards inside a column (rank) | `onMove` also receives the neighbours, e.g. `beforeId` / `afterId`; drop between cards; keyboard «move up/down» | Order from the service, «move up/down» as card actions |
| K2 | Swimlanes | `laneField` (+ optional `lanes` with labels), collapsible lanes | One `kanban` per lane |
| K3 | WIP limits | `columns[].limit` with count «3/5» and a visible warning when exceeded | Count + `alert` |
| K4 | Rich cards | `badges` (tone by value), `avatarField`, `footerFields` (e.g. story points) | Text composed in `descriptionField` |
| K5 | Columns from data (decision D6) | `columns` from an expression or a data source, so one screen serves every board | Fixed columns per screen |

Keep keyboard access and screen-reader announcements at today's level for every new interaction.

### Later

- **L1** a text field with suggestions from a data source (for OpenDevTrack's query language).
- **L2** a `comments` component (thread, Markdown, mentions); today: `timeline` + `richtext` in a `dialog`.
- **L3** data sources updated by push (SSE) for shared boards; today: periodic `refresh`.

## 4. What not to do

- Do not add anything specific to OpenDevTrack or ms-authz to Quadrava (no hard-coded paths, field names or tenant
  logic beyond the optional contract).
- Do not change ms-authz from the Quadrava session: list what it must adapt and leave it to its own repository.
- Do not start Q0, B2 or K5 before the related decision is approved.
