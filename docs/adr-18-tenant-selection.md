# ADR-18: Optional tenant selection in the shell

Status: Accepted (31 October 2026)

## Context

Some back ends serve users who work for several **tenants**: customers, companies, offices. An identity or
authorization service may then refuse to open a session until a tenant is chosen, and send the user to an error page;
Quadrava had no page to choose one, so the user went round in circles on the login.

Quadrava must not know what a tenant is: for one application it is a customer, for another a hospital ward. And most
applications have no tenants at all, so nothing may change for them.

## Decision

**The BFF chooses at login, the shell lets the user switch.** The login never asks: the BFF opens the session on a
tenant it chooses (for example the last one used). The tenants are an optional part of the BFF contract
(`contracts/bff.yaml`, 0.2.0):

- the current user (`GET /bff/user`) may carry `tenants: [{ id, label }]` and `currentTenant`;
- switching is `POST /bff/tenant` with `{ "tenant": "<id>" }` and the CSRF token: `204`, `404` for a tenant not
  offered to the user, `400` for a malformed body. **A POST, never a GET**: a session cookie with `SameSite=Lax` travels
  with the GETs of links from other sites, so a GET could be used to switch someone's tenant from outside.

```
runtime                                   BFF
  GET /bff/user ───────────────────────▶  { …, tenants: [north, south], currentTenant: north }
  user menu: Workspace ✓ North office
                         South office  ◀── the user picks it
  POST /bff/tenant {tenant: south} ────▶  204, session on south (remembered for the next login)
  reload the page ─────────────────────▶  permissions, navigation and screens read again
```

- **Shown only when it means something.** The shell shows the choice, as the first group of the user menu, only if
  the runtime configuration has `services.tenantSwitchUrl` **and** the user has more than one tenant. The address is a
  path of the same origin (the browser talks only to the BFF); any other value is ignored with a warning.
- **A reload after the switch.** Permissions, navigation, data and even the screens can depend on the tenant: rather
  than refreshing each of them, the page starts again. If the BFF refuses, the page stays where it is and says so.
- **Quadrava does not interpret tenants.** It shows the labels as text, sends back the identifier and exposes it to the
  expressions as `user.tenant` (empty without tenants). Permissions stay in the authorization contract: the BFF or the
  services take the tenant of the session into account.
- **The reference BFF** reads the tenants from its configuration (`lowcode.bff.tenants`, each with the users who may
  use it), keeps the current one in the session, remembers the last one per user in memory, and forwards it to the
  services in the `X-Tenant` header (one sent by the browser never passes). The conformance kit
  (`npm run conformance:bff`) checks the tenant part only when the user of the session lists tenants.
- **The demo** gives the administrator profile two offices, so the choice can be tried without a back end; there
  nothing depends on the tenant but `user.tenant`, and the page is not reloaded.

## Alternatives considered

- **A tenant selection page at login.** It needs a public page of Quadrava in the login flow of every identity
  provider, and it asks a question the BFF can answer by itself in most cases.
- **The tenant in the URL** (`/t/north/...`). Every link and every route would change for all applications, also those
  without tenants; and a link could switch the tenant, which is what the POST avoids.
- **Refreshing permissions and navigation without a reload.** Possible, but every cache (data sources, screens of the
  registry, translations) would have to know about the tenant: a reload is simpler and certainly complete.

## Consequences

- Applications without tenants see no change: no field in the user, no item in the menu, no call.
- A BFF that wants the choice implements one more endpoint and two fields, and declares it in the runtime
  configuration. The label of the group («Workspace», «Spazio di lavoro») is a platform text (`lc.tenant`), which an
  application catalogue can override.
- The last tenant used is kept by the BFF: the reference one keeps it in memory and forgets it at restart.
