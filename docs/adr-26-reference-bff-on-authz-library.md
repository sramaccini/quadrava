# ADR-26: the reference BFF on authz-library

Status: accepted (November 2026).

## Context

The reference BFF (`reference/bff`) had its own login, session, CSRF, logout, tenants and user endpoint. That was
about 650 lines repeating, in a simpler form, what [authz-library](https://github.com/sramaccini/authz-library) does
for real applications. The library implements `contracts/bff.yaml` and `contracts/authz.yaml`. Since 2.5.0 it can also
keep the user's access token in the session, to forward it to separate services (token relay).

The reference BFF also kept its sessions in memory. A restart signed everybody out, and Keycloak could not close them.

## Decision

- **The reference BFF uses authz-library** (`com.logicwarez.authz:authz-bff`, MPL-2.0, like Quadrava CE). The library
  does the login, the session, `/bff/*`, `/logout` and `/authz/*`. Two things stay in the BFF:
  - the forwarding of the routes to the services, with the token of the session (token relay);
  - the configuration of the users.
- **Permissions are not in the token.** Keycloak says who the user is. The BFF configuration holds the roles of each
  user (`quadrava.bff.users`) and the permissions of each role (`quadrava.bff.role-permissions`).
  - They are resolved at the login and kept in the session. A user who is not configured cannot sign in.
  - The BFF answers `/authz/capabilities` and `/authz/check` from the session.
  - The reference `authz` service stays. It is a separate implementation of `authz.yaml`, called with the access
    token, and it is what the authorization conformance kit checks.
- **Sessions in Redis** (Spring Session, `repository-type: indexed`). `idp/` starts Redis next to Keycloak.
- **Back-channel logout.** When Keycloak closes a session, it calls `POST /bff/backchannel-logout` and the BFF closes
  its own.
- **Java 25 and Spring Boot 4.1.2** for the whole of `reference/`, as the library requires.

## Consequences

- The reference BFF is what a real application gets from the library.
  - The BFF conformance kit tests the library too.
  - `ContractTest` checks that the library's endpoints and the fields of the user are in `bff.yaml`.
- Building `reference/` needs a GitHub token with `read:packages`, because the library is on GitHub Packages
  (DEVELOPMENT-GUIDE § 1). CI uses the token of the workflow.
- The stack needs Redis. Keycloak must answer before the BFF starts, because the BFF reads its discovery document at
  start-up.
- `/bff/user` no longer has the user's e-mail. The library takes it from the resolver, which knows only the user name.
  The contract leaves the e-mail optional.
- The roles of the example are written twice, in the BFF and in the `authz` service, and must be kept equal by hand.
