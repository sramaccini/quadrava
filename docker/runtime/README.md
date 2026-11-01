# Runtime image

The Quadrava runtime as a container image (ADR-20, `docs/adr-20-versioned-distribution.md`): the built application
served by nginx on port 8080. It is configured when the container starts, so an application that uses Quadrava never
builds Angular: it runs the image of a version and points it at its definitions.

```bash
docker run -p 8080:8080 ghcr.io/sramaccini/quadrava-runtime:0.2.1     # the demo, with the examples
```

Tags: the exact version (`0.2.1`), the minor line (`0.2`) and `latest` (the most recent stable version). A version
with a pre-release part (`0.2.0-rc.1`) gets only its exact tag.

## Configuration

At start-up the image writes `runtime-config.json`, the file the runtime reads before anything else, in this order:

1. a file mounted at `/etc/quadrava/runtime-config.json`: served as it is (every option of `RuntimeConfig`);
2. `QUADRAVA_REGISTRY_APP` set: the definitions published in a registry, the services through the BFF;
3. nothing: the demo with the examples and its fake back end.

| Variable | Meaning | Default |
| --- | --- | --- |
| `QUADRAVA_REGISTRY_APP` | Application in the registry; selects the registry | (demo) |
| `QUADRAVA_REGISTRY_ENV` | Environment whose published versions are loaded | `production` |
| `QUADRAVA_NAVIGATION` | Identifier of the navigation document (required with the registry) | |
| `QUADRAVA_THEMES` | Themes to choose from, comma separated; the first is the initial one | `light` |
| `QUADRAVA_LANGUAGES` | Languages of the application, comma separated | `en` |
| `QUADRAVA_DEFAULT_LANGUAGE` | Language offered when the browser's is not among them | the first |
| `QUADRAVA_REGISTRY_BASE` | Base path of the registry APIs on the same origin | `/registry` (runtime default) |
| `QUADRAVA_APP_ID` | Identifier of the application towards the BFF services | `QUADRAVA_REGISTRY_APP` |
| `QUADRAVA_TENANT_SWITCH_URL` | Path that switches the tenant (ADR-18); without it no choice is shown | |
| `QUADRAVA_STUDIO_ORIGINS` | Origins of Quadrava Studio allowed to open this runtime with their project (ADR-16) | none |
| `QUADRAVA_BFF_URL` | Address of the BFF (`http://bff:8080`): nginx forwards its paths to it | not forwarded |

Names accept letters, digits, `.`, `-` and `_`; paths must start with a single `/`; origins and the BFF address are
scheme, host and port only. Any other value stops the container with a message, instead of starting with another
configuration.

```bash
docker run -p 8080:8080 \
  -e QUADRAVA_REGISTRY_APP=invoicing -e QUADRAVA_NAVIGATION=main \
  -e QUADRAVA_THEMES=light,dark -e QUADRAVA_LANGUAGES=en,it \
  -e QUADRAVA_BFF_URL=http://bff:8080 \
  ghcr.io/sramaccini/quadrava-runtime:0.1
```

## One origin

The browser talks only to the BFF, on the origin of the page (`contracts/bff.yaml`). Two ways to get there:

- **A proxy in front** (an ingress, a gateway, the BFF itself) sends `/` to this image and the paths of the BFF to the
  BFF; leave `QUADRAVA_BFF_URL` unset.
- **This image as the front**: with `QUADRAVA_BFF_URL`, nginx forwards `/bff/`, `/logout`, `/oauth2/`,
  `/login/oauth2/`, `/api/`, `/registry/`, `/authz/` and `/telemetry/` to the BFF, without buffering (event streams,
  ADR-19), with `Host` and the `X-Forwarded-*` headers so that the BFF builds its own addresses (the login callback on the
  address of this image). Behind a TLS terminator, the terminator must set `X-Forwarded-Proto` itself and the BFF must
  honour it (for Spring Boot: `server.forward-headers-strategy=framework`). The address of this image must be among the
  redirect URIs of the identity provider and the return pages the BFF accepts. nginx resolves the host of the BFF
  when it starts: it must already be known then (in Docker Compose, `depends_on` the BFF).

`runtime-config.json` and `index.html` are served with `Cache-Control: no-cache`; the bundles, which have the hash of
their content in the name, are cached for a year.

## Against the local stack

The development stack (`npm run stack`, README) is ready for the image on port 8090: the Keycloak realm accepts
`http://localhost:8090` as a login callback and after the logout, and the reference BFF accepts it as a return page.
With the stack running:

```bash
docker run -d --name quadrava-runtime -p 8090:8080 \
  -e QUADRAVA_REGISTRY_APP=demo -e QUADRAVA_REGISTRY_ENV=development -e QUADRAVA_NAVIGATION=invoicing \
  -e QUADRAVA_THEMES=light,classic,dark -e QUADRAVA_LANGUAGES=en,it \
  -e QUADRAVA_BFF_URL=http://host.docker.internal:8080 quadrava-runtime
```

Then open http://localhost:8090 and sign in (`operator`, `manager` or `administrator`, password = user name): the
screens come from the registry, the data from the demo back end through the BFF, and the boards of the showcase tasks
screen follow the changes of other users over the event stream. From Git Bash on Windows, run it with
`MSYS_NO_PATHCONV=1`, otherwise a value such as `/bff/tenant` is rewritten into a Windows path (and refused).

The realm is imported only when Keycloak is created: after a change to `idp/realm-quadrava.json`, recreate it with
`cd idp && docker compose down && docker compose up -d` (its users and sessions start again from the file).

## Building it

From the root of the repository:

```bash
docker build -f docker/runtime/Dockerfile --build-arg VERSION=0.2.1 -t quadrava-runtime .
```

The release workflow (`.github/workflows/release.yml`) builds it for `linux/amd64` and `linux/arm64` and publishes it
on a `v*` tag.
