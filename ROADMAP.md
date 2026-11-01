# Quadrava CE: status and roadmap

What has been verified, the known limits and the next steps. What the project is: [README.md](README.md).

**Verified:** the four JSON Schemas (screens, navigation, themes, catalogues), the CEL evaluator, the interpreter, the NG-ZORRO component catalogue, the services library, the runtime and the CLI, with the automated tests described in [README.md § Testing](README.md#testing); the build of every app and library; the validity of the OpenAPI contracts and of the examples.

**End to end** in a browser with Keycloak 26.8 in Docker and every reference service started by `npm run stack` (October 13, 2026, when the registry and Quadrava Studio were still part of this repository):

* login through the BFF, navigation, themes, screens and catalogues from the registry, permissions from the authorization service;
* data, writes with CSRF and menu counters through the BFF, logout that ends the Keycloak session;

Since 0.4.0 the stack runs without a registry: the runtime behind the BFF loads the example project from its files.

**Not verified / known limits:**

* The end-to-end suite runs in Chromium only; automatic accessibility checks find only part of the problems (keyboard and screen-reader checks by hand are still needed).
* The registry contract does not require a server-side check of the CEL expressions (the CLI and the runtime check them, fail-closed); an implementation can add one.
* Component limits are listed in the catalogue (§ 3).

**Next steps:**

* Conformance kits in CI against the reference services (today they are run by hand, for example after `npm run stack`).
* Firefox and WebKit in the end-to-end suite.
* The full list of what was done and what remains is in [HANDOFF.md](HANDOFF.md).
