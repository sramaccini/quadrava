# Reference implementation

Implements the contracts in `../contracts` to demonstrate them and to serve as a test bench. **Not for production**: in-memory stores, development users, no high availability.

| Module | Port | Contract |
| --- | --- | --- |
| `bff` | 8080 | `bff.yaml` and `authz.yaml`: OIDC session with Keycloak, tokens server-side only |
| `bff-node` | 8080 | The same contracts in a minimal Node BFF (ADR-27): sessions in memory, no tenants or back-channel logout. Not a Maven module: [`bff-node/README.md`](bff-node/README.md) |
| `authz` | 8082 | `authz.yaml`, as a separate service called with the access token |
| `telemetry` | 8083 | `telemetry.yaml` |

**The BFF** is built on [authz-library](https://github.com/sramaccini/authz-library) 2.6 (ADR-26). The library does
the login, the session and the endpoints of `bff.yaml` and `authz.yaml`. The BFF adds the forwarding and the
configuration of the users.

- **Session.**
  - OIDC login with Keycloak (`/bff/login?return=...`). It returns only to `authz.bff.frontend.allowed-origins`.
  - The session is kept in Redis (Spring Session).
  - Without a session every call gets 401, never a redirect.
  - Writes need the CSRF token (`XSRF-TOKEN` cookie, `X-XSRF-TOKEN` header) and pass an Origin check.
  - Logout (`POST /logout`) answers `{"redirect": "<address>"}`, the logout address of Keycloak.
  - When Keycloak closes its session (sign-out elsewhere, the console), it calls `POST /bff/backchannel-logout` and
    the BFF closes its own.
- **Roles and permissions** come from the configuration, not from the token.
  - `quadrava.bff.users` gives the roles of each user. A user who is not listed cannot sign in.
  - `quadrava.bff.role-permissions` gives the permissions of each role, the same map as the `authz` service.
  - They are fixed at the login and kept in the session. `/authz/capabilities` and `/authz/check` answer from
    there, and every answer carries `X-Permissions-Version`.
- **Forwarding.** The routes in `quadrava.bff.routes` go to their service:
  - `/registry` → a registry that follows `registry.yaml` (`LC_REGISTRY_URL`, port 8081 if absent: Quadrava CE has
    none of its own);
  - `/telemetry` → telemetry;
  - `/api` → the application back end (in development `npm run demo-api` in `frontend/`, port 8084).

  Each call carries the user's access token, kept in the session and renewed when it expires (token relay), plus
  `traceparent` and `baggage` (screen and action, for the audit). The browser's cookies and `Authorization` do not
  pass. If the service does not respond, the answer is 502. Event streams (`text/event-stream`, the data sources with
  `live`, ADR-19) pass as they arrive. A service's `X-Permissions-Version` does not pass: the version is that of the
  session.
- **Tenants** (optional, ADR-18). `quadrava.bff.tenants` lists them, each with an id, a label and the users who may
  use it (no users = everybody).
  - The user's `tenants` and `currentTenant` are in `/bff/user`.
  - `POST /bff/tenant` with `{"tenant": "<id>"}` and the CSRF token switches the session.
  - The last tenant chosen is remembered per user, in memory, for the next login.
  - Forwarded calls carry `X-Tenant`; one sent by the browser never passes.
- **Operational roles** (optional, ADR-28) are not in this BFF yet: they need a new version of authz-library.

**The authorization service** (`authz`) answers `authz.yaml` 0.2.0 from the roles in the token
(`realm_access.roles`) and two maps of `application.yml`:

- `quadrava.authz.role-permissions`: the permissions of each role;
- `quadrava.authz.roles`: the label of each role and whether it is a `base` role (ADR-28). A base role, `user` in
  the example, always applies; the others are operational roles, one at a time. `/authz/roles` lists those of the
  user; with `role` on `/authz/capabilities` and `/authz/check` the answer covers the base roles plus that role
  (a role the user does not hold adds nothing), without it all the roles of the user. In the development realm the
  administrator holds two operational roles, `administrator` and `manager`.

- The library also serves:
  - `/bff/sessions`: the user's own sessions, to close them;
  - `/bff/admin/users/{username}/sessions`: needs the permission `authz.session.revoke`, which no role of the
    example has.

Commands:

- `mvn verify` builds and tests everything. It needs JDK 25, Maven 3.9 and the GitHub token for authz-library
  (DEVELOPMENT-GUIDE § 1).
- `mvn -pl authz spring-boot:run` (or `java -jar <module>/target/*.jar`) starts a module.
- Keycloak and Redis must be running (`cd idp && docker compose up`). Keycloak must be up before the BFF, which reads
  its discovery document at start-up.

A customer back end must pass the same contract conformance tests as this implementation. The kits are in `frontend/tools` and run with `npm run conformance:registry`, `conformance:authz`, `conformance:telemetry` and `conformance:bff`: over HTTP they check a registry's saving, validation, If-Match, history, publication with ETag, protected environments and review (17 checks); capabilities, permission format, version and batch checks of authorization (11); OTLP payloads, errors and limits of telemetry (6); what the runtime expects from the BFF (`contracts/bff.yaml`: current user, login with return, logout, CSRF; 6 checks without a session, 2 more with the cookies of a signed-in browser, or with a user and password of the development realm, and 4 more on the tenants when the user lists them). The reference services pass theirs, in CI on every push (`npm run conformance`, job «conformance»); authorization and telemetry answer errors in Problem format (RFC 9457). The whole stack starts with `npm run stack` (see the main README).
