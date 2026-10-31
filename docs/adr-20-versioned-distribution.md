# ADR-20: Versioned distribution

Status: Accepted (31 October 2026)

## Context

Until now Quadrava had no versions: the libraries said `0.0.1`, the workspace `0.0.0`, and the only way to use it was
to clone the repository and build it. An application that wants to rely on Quadrava (its screens in a registry, its
own BFF) needs a fixed thing to deploy and to go back to, and a way to know what changed between two of them, without
building Angular itself.

## Decision

**One version for everything, a container image of the runtime, a release started by a tag.**

```
CHANGELOG.md: ## [0.2.0] - date      git tag v0.2.0 ──push──▶ Release workflow
package.json files: 0.2.0                                        │ the checks of CI
                                                                 │ tools/release.mjs: tag = versions, changelog section
                                                                 ├▶ ghcr.io/…/quadrava-runtime:0.2.0, :0.2, :latest
                                                                 └▶ GitHub release with the notes of the changelog
```

- **Semantic Versioning, one version.** The workspace, its lock file and the five libraries carry the same version;
  `npm run release:check` (in CI on every push) fails when they differ. A version covers the JSON languages, the
  libraries, the runtime and its image, Studio and the contracts (which keep their own version as well). Before 1.0.0
  a minor version may break compatibility, and the changelog says so with what to do.
- **A changelog** in the Keep a Changelog format, at the root: an `[Unreleased]` section filled with the work, renamed
  to the version on release. The release refuses a version without its section.
- **The runtime as a container image**: the production build served by nginx, configured when the container starts:
  environment variables for the common case (an application in a registry, services through the BFF), or a mounted
  `runtime-config.json` for everything else; nothing set, the demo with the examples. Every value is checked and a wrong
  one stops the container. With `QUADRAVA_BFF_URL` nginx forwards the paths of the BFF, without buffering, so that the
  browser keeps talking to one origin; otherwise a proxy in front does it. Published on GitHub Container Registry for
  `linux/amd64` and `linux/arm64`, tagged with the exact version, the minor line and `latest` (stable versions only).
- **A release workflow** (`.github/workflows/release.yml`) on a `v*` tag: the jobs of CI (called as a reusable
  workflow), then the check of tag, versions and changelog, the image and the GitHub release (a pre-release when the
  version has a pre-release part). CI builds and starts the image on every push, so a broken image is found before a
  tag.

- **A command line for projects** (`frontend/projects/cli`): `quadrava validate` checks a project folder with the
  checks of the runtime and Studio (schemas, identifiers, references, patterns, CEL expressions, themes, languages,
  catalogues), `quadrava publish` saves and publishes it in a registry, with the token from an environment variable.
  One bundled file without dependencies, built from the sources of the libraries, so it checks exactly the schemas
  of its version. Published with the release on **GitHub Packages** as `@sramaccini/quadrava-cli` (the scope of
  GitHub Packages is the owner of the repository); on npmjs, under `@quadrava`, from 1.0.0. The examples of the
  repository are validated and published with it too (`validate:examples`, `publish:examples`).

## Alternatives considered

- **The Angular libraries as npm packages `@quadrava/*`.** Useful to an application that builds its own Angular
  front end with the libraries (its own components or shell), but it means renaming the libraries (today `schema`,
  `core`, …, imported by those names everywhere), publishing partial Ivy builds and keeping their public API stable:
  a larger commitment than needed for an application that only runs screens. Left for the first consumer that needs
  them; the single version already fits it.
- **The CLI on npmjs now.** Anonymous installation, but it needs an organisation on npmjs and a token among the
  secrets; GitHub Packages needs a token to read even public packages, which a CI on GitHub already has. Until 1.0.0
  the consumers are few and on GitHub.
- **Git tags only.** A fixed point, but the consumer still builds Angular.
- **A Node server in the image** (to read the configuration at each request). nginx with a start-up script is smaller
  and enough: the configuration changes with the deployment, not while running.
- **Building the configuration into the image** (one image per application). Simpler for one consumer, but every
  change of address would need a build; one image per version, configured by its deployment, is what makes it a
  product.

## Consequences

- A consumer deploys `quadrava-runtime:<version>` and its configuration; going back is changing the tag.
- Every change visible to users or to applications adds a line to `[Unreleased]` in the same commit; a release is one
  commit (versions and changelog) and one tag, pushed by the maintainer.
- The image is the demo when unconfigured: it must never be exposed that way as if it were an application.
- nginx resolves the host of the BFF when it starts; a BFF whose name is not known yet at that moment stops the container.
- Studio has no image yet: it is published as static files (DEVELOPMENT-GUIDE) and as the desktop app (ADR-17).
- A project checks itself in its own CI with the CLI of the version of Quadrava it runs on, before reaching the
  registry; installing the CLI from GitHub Packages needs a token with `read:packages`.
