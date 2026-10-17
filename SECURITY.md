# Security policy

## Reporting a vulnerability

Please do **not** open a public issue for a security problem. Use GitHub's private reporting instead: on the repository page, **Security → Report a vulnerability**. Describe the problem, how to reproduce it and the version (commit) affected.

You will get an answer within a week. Once a fix is available, the advisory is published with credit to the reporter, unless they prefer otherwise.

## Scope

- The libraries, the runtime and Quadrava Studio in `frontend/`, the JSON schemas and the OpenAPI contracts.
- The reference services in `reference/` and the Keycloak setup in `idp/` are **for development only**: they use fixed development credentials (`dev-only-secret`, users whose password is their name) and must not be exposed. Problems there are welcome, but they are not vulnerabilities of a production component.

## Supported versions

Until the first release, only the latest commit of `main` is supported.
