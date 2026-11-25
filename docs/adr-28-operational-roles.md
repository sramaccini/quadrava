# ADR-28: working with one role at a time

Status: accepted (November 2026); implemented on 25 November 2026 in the contracts, the reference authorization
service, the conformance kits, `services`, `components`, the runtime shell, the two light BFFs and the reference BFF
(on authz-library 2.7.0, which has the same part).

## Context

A user may hold several roles, for example «clerk» and «approver». Today they always work with the sum of their
permissions. Many administrative applications want the user to work as one role at a time:

- the interface shows only the screens and actions of that role;
- the audit trail says in which role something was done;
- separation of duties: the same person does not enter and approve the same thing in one go.

The user already chooses a tenant in the same way (ADR-18): the BFF opens the session on one, `/bff/user` lists them,
the shell offers the switch and `POST /bff/tenant` changes it. Roles follow that pattern. Unlike the tenant, a role
changes the permissions, so the services and the authorization contract must know which role is active.

## Decision

**The authorization service says which roles can be chosen.** `contracts/authz.yaml` (0.2.0) gains:

- `GET /authz/roles?app=<app>`: the roles of the user for the application, `[{ id, label, base }]`. A **base** role
  (for example «user») always applies and is not offered as a choice; the others are the **operational** roles, one of
  which is active at a time.
- An optional `role` on `/authz/capabilities` (query) and `/authz/check` (body): the answer covers the base roles plus
  that operational role. Without `role` the answer covers all the roles of the user, as today, so existing clients and
  services keep working.

**The BFF keeps the active role in the session** (`contracts/bff.yaml` 0.6.0, an optional part like the tenants):

- At login the BFF reads `/authz/roles` and opens the session on an operational role it chooses (the last one used, or
  the first): **it never asks**.
- `/bff/user` carries `operationalRoles: [{ id, label }]` and `currentRole`. The existing `roles` field is unchanged.
- `POST /bff/role` with `{ "role": "<id>" }` and the CSRF token switches it: `204`, `404` for a role not offered to the
  user, `400` for a malformed body. A POST, never a GET, as for the tenant.
- The BFF answers, or forwards, `/authz/*` with the active role, **overriding any `role` sent by the page**: the
  browser cannot widen its own permissions.
- On every call forwarded to the services the BFF adds the active role in the `X-Active-Role` header, removing one
  sent by the page. A service that enforces separation of duties authorizes with the base roles plus that role.
- After a switch the permissions version changes (`X-Permissions-Version`), so the runtime reloads the permissions.

**The runtime offers the switch** as it does for the tenant:

- a `roleSwitchUrl` in the services configuration of `runtime-config.json` (like `tenantSwitchUrl`); without it, or
  with fewer than two operational roles, nothing is shown;
- a «Role» choice in the shell next to the tenant one; after a switch the current screen is checked again against the
  new permissions, and the user goes to the home of the application if it is no longer allowed;
- `user.role` in the expressions; the role in the W3C `baggage` of every call, for the audit trail.

## Consequences

- Separation of duties is enforced where it matters, in the services, which receive the active role from the BFF; the
  front end only follows the permissions (as always, it is not a boundary).
- The part is optional on both sides: a BFF without operational roles leaves the fields out, an authorization service
  without `/authz/roles` answers 404 and the BFF opens the session without a role, as today.
- Every implementation follows: the reference `authz` service (`/authz/roles`, `role`), the two light BFFs of ADR-27,
  the conformance kits (BFF and authorization), the runtime shell. The reference BFF needs the same in authz-library,
  a separate repository: a new version of the library, then the reference BFF moves to it.
- Roles are written in the authorization configuration with their `base` flag; the light BFFs mark it in their file of
  permissions per role.
