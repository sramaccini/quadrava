# ADR-27: a BFF only, with two light ones

Status: accepted (November 2026). It replaces the SPA option of ADR-03.

## Context

ADR-03 chose the BFF pattern for the tokens and kept an «SPA mode» as an option: the browser would sign in by itself
(OpenID Connect with PKCE), keep the tokens in memory and send them to the services. RF-AUT-03 of the functional
specification asked for both modes. Only the BFF mode was ever built.

The SPA mode goes against the security rules of the project («tokens stay in the BFF», «the browser talks only to the
BFF, on its own origin»):

- a token in the page can be read by any script that runs in it, so a single XSS gives it away; the session cookie of
  the BFF is `HttpOnly`;
- every service would need CORS and its own check of the token, and the runtime its own renewal of the tokens;
- the runtime would carry an OpenID Connect library and a second path for every call.

The reason to want it is real: a BFF is one more service to run. The reference BFF (`reference/bff`) is Spring Boot on
authz-library with Redis (ADR-26), which is a lot for a prototype or a small application.

## Decision

- **The runtime talks only to a BFF** that follows `contracts/bff.yaml`. There is no SPA mode: RF-AUT-03 becomes «a BFF
  is required».
- **Two light BFFs make it cheap to have one**, both following the same contract and checked by its conformance kit:
  - **oauth2-proxy and nginx** (`docker/bff-lite-proxy/`): a ready Compose file. oauth2-proxy does the login, the
    session and the token; nginx forwards the calls with `auth_request` and adds what oauth2-proxy lacks: the CSRF
    cookie and header, `/bff/user` and the answers of `/authz/capabilities` and `/authz/check`, built by a small njs
    script from the roles in the token and a file of permissions per role. Configuration only, no code to build.
  - **A minimal BFF in Node** (`reference/bff-node/`): one small service with the whole contract (login with PKCE,
    session in memory, CSRF, `/bff/user`, permissions from a file, forwarding of `/api` with the token, event streams,
    logout), on Node 24 and `openid-client`. Easy to read and to change.
- Like the rest of `reference/`, the two are examples to start from, labelled as not meant for production as they are.
  A real application uses authz-library (ADR-26) or its own BFF.

## Consequences

- The security rules stay as they are: the browser has only a session cookie, and every call is relative to the page.
- An application can start with a light BFF and move to authz-library later without touching its JSON: the contract is
  the same.
- Three implementations of the BFF contract to keep in line when it changes: the conformance kit checks all of them.
- `openid-client` is a dependency of `reference/bff-node` only, not of the CE packages.
- What the light BFFs do not do: sessions shared between instances (the Node BFF keeps them in memory), back-channel
  logout, tenants. The reference BFF on authz-library has them.
