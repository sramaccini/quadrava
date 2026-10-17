# Quadrava: status and roadmap

What has been verified, the known limits and the next steps. What the project is: [README.md](README.md).

**Verified:** the four JSON Schemas (screens, navigation, themes, catalogues), the CEL evaluator, the interpreter, the NG-ZORRO component catalogue, the services library, the runtime and Quadrava Studio, with the automated tests described in [README.md § Testing](README.md#testing); the build of every app and library; the validity of the three OpenAPI contracts and of the examples.

**End to end** in a browser with Keycloak 26.8 in Docker and every reference service started by `npm run stack` (October 13, 2026):

* login through the BFF, navigation, themes, screens and catalogues from the registry, permissions from the authorization service;
* data, writes with CSRF and menu counters through the BFF, logout that ends the Keycloak session;
* in Quadrava Studio behind the BFF: saving, review (request, approval, protected environment), comparison, publishing and the live-data preview (writes blocked).

Also without Keycloak, with the registry's `no-auth` profile and file storage.

**Not verified / known limits:**

* The end-to-end suite runs in Chromium only; automatic accessibility checks find only part of the problems (keyboard and screen-reader checks by hand are still needed).
* Expressions are not checked by the registry (Quadrava Studio and the runtime do it, fail-closed); a real implementation can add a server-side CEL check.
* Component limits are listed in the catalogue (§ 3), Quadrava Studio limits in [docs/editor.md](docs/editor.md).

**Next steps:**

* Quadrava Studio: comparison between two registry versions (today: a version against the open document); resizing the border sides from the preview.
* Conformance kits in CI against the reference services (today they are run by hand, for example after `npm run stack`).
* Firefox and WebKit in the end-to-end suite.
* The full list of what was done and what remains is in [HANDOFF.md](HANDOFF.md).
