# Sample project: Sandbox Store

A complete back office for the **API Learning Sandbox** store (<https://demo.totalshiftleft.ai>, OpenAPI at
`/openapi.json`): users, products and orders, as a Quadrava project in English and Italian. It comes with the small
back end it needs, the **store adapter** (`adapter/`), because the sandbox's contract and Quadrava's do not match
(see «Why an adapter»).

```
browser ── runtime (Quadrava) ── BFF ──/api/store──▶ store adapter ──x-session-id──▶ demo.totalshiftleft.ai/api/v1
                                  token, CSRF          token, permissions,            users, products, orders
                                                       mapping, business rules        (session-scoped, 30 min)
```

## Resources

| File | What it is |
| --- | --- |
| `project.json` | manifest: languages `en` (default) and `it`, themes `store-light` and `store-dark`, setting `storeApi` (`/api/store`) |
| `navigation.json` | five areas: Overview, Sales, Catalogue, Customers, Administration |
| `datasources/users.json`, `products.json`, `orders.json` | the calls of each entity: paged list, all rows, one row, lookup search, create, update (PATCH), delete; orders also `setStatus`, `byUser`, `byProduct`, `recent`; products also `categories` |
| `datasources/store.json` | indicators (`summary`, `ordersByStatus`, `stockByCategory`) and the sandbox session (`session`, `resetData`, `newSession`) |
| `screens/dashboard.json` | four indicators, orders by status (pie), stock and stock value by category (bars, right axis), latest orders |
| `screens/order-list.json` | filters (status, customer and product lookups), server paging and sorting, CSV export, Open / Edit / Delete |
| `screens/order-board.json` | kanban by status; a move is a status change, refused by the adapter if the transition is not allowed |
| `screens/order-detail.json` | the order with customer, product and amount; workflow buttons shown only in the statuses where they apply |
| `screens/order-new.json`, `order-edit.json` | entry with lookups; in editing customer and product are read-only (the sandbox does not let them change) |
| `screens/product-*.json`, `user-*.json` | list (filters, paging, sorting, export), detail with the related orders in a tab, new, edit |
| `screens/sandbox-session.json` | the current sandbox session, restore of the demo data, new session |
| `i18n/en.json`, `i18n/it.json` | 152 keys: texts, option values (`values.*`), field-error codes of the adapter (`validation.*`) |
| `themes/` | light and dark, WCAG AA contrasts |
| `adapter/` | the store adapter (`store.mjs` logic, `server.mjs` HTTP), an imitation of the sandbox (`sandbox-mock.mjs`), 21 tests |

`quadrava validate` on the folder: 25 files, no problems.

## How the OpenAPI maps to the screens

| Sandbox (OpenAPI) | Adapter (`/api/store`) | Screens |
| --- | --- | --- |
| `GET /api/v1/users` (+ `QUERY` for contains) | `GET /users?page&size&sort&direction&q&role` → `{items,total,size}` | user list |
| `GET /api/v1/users/{id}` | `GET /users/{id}` | user detail, edit |
| `POST`, `PATCH`, `DELETE /api/v1/users/{id}` | same paths, camelCase bodies | new, edit, delete |
| `GET /api/v1/products` | `GET /products?…&q&category&lowStock` | product list (+ `stockLevel` badge) |
| `GET /api/v1/orders?expand=user,product` | `GET /orders?…&status&userId&productId` → flat rows (`userName`, `productName`, `unitPrice`, `amount`, `number`) | order list, board, detail |
| `PATCH /api/v1/orders/{id}` (quantity, status, notes) | `PATCH /orders/{id}`, transitions checked | order edit, detail workflow, board |
| — (computed from all rows) | `GET /summary`, `/stats/orders-by-status`, `/stats/stock-by-category` | dashboard |
| `GET /session`, `POST /session/new`, `POST /api/v1/demo/reset` | `GET /session`, `POST /session/new`, `POST /session/reset` | sandbox session |

Not used by the application, on purpose: the protected store `/api/v1/secure/*` (its identities — alice, bob, charlie
and the demo API keys — are the sandbox's own, not the application's: the application signs in with Keycloak and keeps
permissions in the authorization service), GraphQL and SOAP (same data store), the simulation parameters (`delay`,
`error`, `random_fail`), flows, learning and requirements endpoints.

## Why an adapter

Five differences between what the sandbox offers and what Quadrava expects (data sources are relative, same-origin
calls through the BFF, without custom headers or response mapping):

1. **Session header.** The sandbox keeps the data per `x-session-id` (a new one on every request without it). A data
   source cannot send custom headers, and the browser must not hold the id: the adapter keeps one session for each
   signed-in user (`sub` of the token, plus the tenant if any) and renews it transparently when it expires.
2. **Response envelope.** `{ success, data, pagination }` versus a plain record or `{ items, total, size }`.
3. **Paging and sorting.** 1-based `page`, `limit`, `order` versus the table's 0-based `state.page`, `size`, `direction`.
4. **Names.** `snake_case` (`user_id`, `created_at`) versus Quadrava field names, which must be camelCase
   (`^[a-zA-Z][A-Za-z0-9]*$`, the CLI refuses `user_id`).
5. **Errors.** `400 { details: [{ field, message }] }` versus `422` Problem with `errors: [{ path, code }]`, which the
   runtime shows next to the fields (`contracts/problem.yaml`).

It also holds the **business rules the sandbox does not enforce**:

| Rule | Answer |
| --- | --- |
| Order status: pending → processing → completed; pending or processing → cancelled; completed and cancelled are final | 409 |
| Quantity of a completed or cancelled order cannot change | 409 |
| New order: customer and product must exist, quantity ≤ stock, initial status pending or processing | 422 on `/userId`, `/productId`, `/quantity` (`stock`, with `available`), `/status` |
| A user or product that orders refer to cannot be deleted | 409 |
| E-mail unique within the session (checked before the call; the sandbox's own 409 is mapped too) | 422 on `/email` (`taken`) |

## Permissions and roles

| Permission | operator | manager | administrator |
| --- | :-: | :-: | :-: |
| `store.dashboard.read` | ✓ | ✓ | ✓ |
| `store.user.read`, `store.product.read`, `store.order.read` | ✓ | ✓ | ✓ |
| `store.order.create`, `store.order.update` | ✓ | ✓ | ✓ |
| `store.user.create`, `store.user.update`, `store.product.create`, `store.product.update` | | ✓ | ✓ |
| `store.user.delete`, `store.product.delete`, `store.order.delete` | | | ✓ |
| `store.session.manage` | | | ✓ |

The screens hide what the user cannot do; the adapter checks the same permission on every route (`permissionOf` in
`server.mjs`) through `GET /authz/capabilities?app=sandbox-store` when started with `--authz`. For the reference
authorization service, in `reference/authz/src/main/resources/application.yml` under `quadrava.authz.role-permissions`:

```yaml
      operator:
        - store.dashboard.read
        - store.user.read
        - store.product.read
        - store.order.read
        - store.order.create
        - store.order.update
      manager:
        # the operator's, plus
        - store.user.create
        - store.user.update
        - store.product.create
        - store.product.update
      administrator:
        # the manager's, plus
        - store.user.delete
        - store.product.delete
        - store.order.delete
        - store.session.manage
```

## Running it

**Tests of the adapter** (Node 24, no dependencies): `node --test adapter/*.test.mjs` → 21 passed.

**Offline, with the imitation of the sandbox** (no network to the sandbox needed):

```bash
node adapter/sandbox-mock.mjs --port 8099
node adapter/server.mjs --port 8085 --upstream http://127.0.0.1:8099 --no-auth
```

**Against the real sandbox, behind the stack** (Quadrava CE repository, `npm run stack` or the step-by-step stack):

```bash
node adapter/server.mjs --port 8085 --authz http://localhost:8082        # tokens of the quadrava realm, permissions checked
# BFF: forward /api to the adapter (application.yml of reference/bff, route prefix /api)
LC_API_URL=http://localhost:8085 java -jar bff/target/*.jar
```

The runtime loads the project like the examples: with the runtime image, mount this folder at
`/usr/share/nginx/html/examples` and a `runtime-config.json` with `"services": { "source": "bff", "appId": "sandbox-store" }`
(docker/runtime/README.md). In Quadrava Studio: zip the folder (without `adapter/`) and **File → Import project (zip)…**.

## Known limits and open points

- **Undocumented behaviour of the sandbox**, assumed and to check against the live service (the workspace that built
  this project could not reach it): the status of a duplicate e-mail (409 assumed, a 400 works too), `page` in the body
  of `QUERY`, case sensitivity of `contains` and of exact filters, ordering of `expand` with `QUERY`. The business rules
  in `/requirements/store.txt` were not readable either: compare them with the table above.
- **Stock is not decremented** when an order is created or completed: the sandbox does not do it and the adapter only
  checks availability. Decrementing on «completed» would need a compensating write on the product (two calls, no
  transaction): to decide.
- **Concurrency.** Checks and writes are two calls (check-then-act): two users of the same session could both pass the
  stock check. The sandbox gives each user their own session, so it does not happen here.
- **Indicators** read every row of the session (up to the sandbox's per-session limit) at each dashboard load: fine for
  a sandbox, not for a real store, where they belong to the service.
- **Sorting** works on the sandbox's fields; amount and product name are computed and not sortable server-side.
- **Sessions in memory.** The user → sandbox session map lives in the adapter process: after a restart each user gets
  a new session with the standard data. With more instances it must move to a shared store.
- **Amounts** are shown in EUR (the sandbox has no currency).
