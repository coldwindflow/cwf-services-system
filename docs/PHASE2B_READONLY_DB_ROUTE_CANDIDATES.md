# Phase 2B Read-Only DB Route Candidates

Date: 2026-05-10

This document audits small DB-backed GET routes for extraction. No route was moved in Phase 2B.

Phase 2C status: `GET /test-db` has been extracted into `server/routes/system/index.js` and is mounted through the existing system router from `index.js`.

Phase 2D status: `GET /users/technicians` was audited in `docs/PHASE2D_TECHNICIAN_DIRECTORY_ROUTE_MAP.md`. No route was moved in Phase 2D.

## Summary

Recommended Phase 2C candidate:

```text
GET /test-db
```

Why:

- It is the smallest DB-backed GET route found.
- It uses only `pool.query`.
- It has no auth/session middleware.
- It has no upload middleware.
- It has no pricing, booking, availability, LINE, accounting, income, close-job, or technician evidence dependency.
- It does not mutate state.
- It has a very small response shape.

## Candidate Routes Inspected

| Route | Method | Current location | SQL used | Dependencies | Auth/session | Side effects | Response shape | Risk | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/test-db` | GET | Was `index.js:12840`; now `server/routes/system/index.js` | `SELECT NOW() as now` | `pool.query`, `console.error` | No | No DB mutation; does require DB connectivity | Success: `{ ok: true, now }`; failure: `{ ok: false, error: "db connection failed" }` | Low | Extracted in Phase 2C. |
| `/users/technicians` | GET | `index.js:12906` | `SELECT username FROM public.users WHERE role='technician' ORDER BY username` | `pool.query`, `console.error` | No | No mutation | Array of `{ username }`; failure `{ error }` | Low-to-medium | Audited in Phase 2D. Candidate for a future dedicated users route module only after confirming no hidden caller depends on the legacy endpoint. |
| `/catalog/items` | GET | `index.js:12938` | Dynamic `SELECT item_id, item_name, item_category, base_price, unit_label, is_active, job_category, ac_type, btu_min, btu_max, is_customer_visible FROM public.catalog_items WHERE ... ORDER BY item_category, item_name` | `pool.query`, request query filters | No | No mutation | Array of catalog item rows; failure `{ error }` | High | Do not move yet. Catalog/pricing-adjacent and customer-visible. |
| `/promotions` | GET | `index.js:13003` | `getPromotionColumns()` reads `information_schema.columns`; route then queries `public.promotions` with dynamic selected columns | `pool.query`, `getPromotionColumns`, in-memory column cache, request query filters | No | No DB mutation; mutates in-memory column cache | Array of promotion rows; failure `{ error }` | High | Do not move yet. Promotion/pricing/customer-visible behavior. |
| `/service_zones` | GET | `index.js:21336` | Via `getServiceZones()`: `SELECT zone_code, zone_name, zone_label, province_group, color_hex, is_active, sort_order FROM public.service_zones WHERE is_active=TRUE ORDER BY sort_order, zone_code` | `getServiceZones`, `pool.query`, `SERVICE_ZONE_SEEDS`, `ENABLE_SERVICE_ZONE_FILTER` | No | No mutation; has fallback seed behavior | `{ ok: true, zones, filter_enabled }`; failure `{ error }` | Medium | Do not move yet. Availability/service-zone behavior affects booking and technician assignment. |
| `/public/line_config` | GET | `index.js:1012` | None | `process.env`, `getReqBaseUrl(req)` | No | No mutation | `{ ok, env, callback_url, base_url }`; failure `{ ok: false, error }` | High | Do not move. LINE-adjacent config is frozen. |
| `/admin/debug/status` | GET | `index.js:25200` | None | `requireAdminSoft`, `ENABLE_AVAILABILITY_DEBUG`, `RUNTIME_AVAILABILITY_DEBUG`, `process.env.TZ` | Yes, admin soft guard | No mutation in GET, but runtime debug-state adjacent | `{ success, availability_debug_env, availability_debug_runtime, tz }`; failure `{ error }` | Medium | Do not move yet. Middleware and debug-state dependency. |

## Phase 2C Extracted Route

Moved only:

```text
GET /test-db
```

Current handler:

```js
app.get("/test-db", async (req, res) => {
  try {
    const r = await pool.query("SELECT NOW() as now");
    res.json({ ok: true, now: r.rows[0].now });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "db connection failed" });
  }
});
```

## Target Module

Phase 2C kept the route in the existing system router:

```text
server/routes/system/index.js
```

## Dependency Pattern

`index.js` now passes the existing root pool into the system router:

```js
app.use(createSystemRoutes({ pool }));
```

`server/routes/system/index.js` uses the injected pool and keeps a fallback to the shared wrapper:

```js
const pool = deps.pool || require("../../db/pool");
```

Do not create a new `Pool`.

## Exact Tests For Phase 2C

Syntax checks:

```bash
node --check index.js
node --check server/routes/system/index.js
node --check server/db/pool.js
```

Route shape checks without production DB:

- Inspect Express router stack and confirm `/api/version` is still GET.
- Inspect Express router stack and confirm `/test-db` is GET after extraction.

Manual check only in a safe environment:

- Start app with safe non-production DB configuration.
- Call `GET /test-db`.
- Confirm success response shape is still `{ ok: true, now }`.
- If DB is unavailable, confirm failure response shape is still `{ ok: false, error: "db connection failed" }` with HTTP 500.

## Rollback Plan For Phase 2C

If extraction causes any startup or routing issue:

1. Remove the `router.get("/test-db", ...)` block from `server/routes/system/index.js`.
2. Restore the original inline `app.get("/test-db", ...)` block in `index.js` at the `TEST DB` marker.
3. Restore `app.use(createSystemRoutes({}))` if the system router no longer needs `pool`.
4. Run:

```bash
node --check index.js
node --check server/routes/system/index.js
node --check server/db/pool.js
```

## Do Not Move In Phase 2C

Do not move:

- `/users/technicians`
- `/catalog/items`
- `/promotions`
- `/service_zones`
- `/public/line_config`
- `/admin/debug/status`
- Any technician, admin, customer booking, pricing, availability, LINE, accounting, income, close-job, or unit evidence route.

## Phase 2D Follow-Up

`GET /users/technicians` is the next smallest DB-backed read-only candidate, but it should not be placed in the existing system router. See `docs/PHASE2D_TECHNICIAN_DIRECTORY_ROUTE_MAP.md` for the dedicated future mount plan, dependency notes, caller audit, manual tests, and rollback steps.
