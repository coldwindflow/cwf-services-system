# Phase 2F Catalog, Promotion, And Service Zone Route Audit

Date: 2026-05-10

Scope: audit only. No route was moved in Phase 2F, and no runtime file was changed.

This audit compares the next three small read-only route candidates after `GET /users/technicians` was extracted in Phase 2E.

## Summary Recommendation

Recommended next extraction candidate:

```text
GET /catalog/items
```

Reason:

- It is the smallest of the three candidates by dependency surface.
- It uses only request query filters, local `where`/`params` construction, `pool.query`, and `console.error`.
- It does not use auth/session middleware.
- It does not mutate the database.
- It does not call pricing helpers directly.
- The current repo search found only `admin-add-v2.js` calling this route directly.

Risk remains **medium**, not low, because the route is catalog/pricing-adjacent and is used by the admin add-job flow. Extract it only in a focused PR that moves this route and nothing else.

Do **not** extract `GET /promotions` next. It is customer-public, promotion/pricing-adjacent, uses dynamic schema detection, and mutates the in-memory promotion column cache.

Do **not** extract `GET /service_zones` next unless the service-zone helper boundary is audited first. The route itself is small, but it depends on top-level service-zone helpers and flags that are shared with admin booking, technician zone detection, and service-zone assignment behavior.

## Candidate Comparison

| Route | Method | Current location | SQL used | Dependencies | Auth/session | DB mutation | Pricing touch | Public booking/customer flow | Admin add/edit job flow | Technician app use | Side effects | Risk | Safe next PR? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/catalog/items` | GET | `index.js:12916` | Dynamic `SELECT item_id, item_name, item_category, base_price, unit_label, is_active, job_category, ac_type, btu_min, btu_max, is_customer_visible FROM public.catalog_items WHERE ... ORDER BY item_category, item_name` | `req.query`, local `where`/`params`, `pool.query`, `console.error` | No | No | Yes, catalog/pricing-adjacent because it returns `base_price` and item filters | No direct current caller found in customer files | Yes, `admin-add-v2.js` calls `/catalog/items` for add-job extra item selection | No direct caller found in `app.js` or `tech.html` | No state mutation | Medium | Yes, first among these candidates, with focused tests |
| `/promotions` | GET | `index.js:12981` | `getPromotionColumns()` reads `information_schema.columns`; route queries `public.promotions` with dynamic selected columns, active/customer visibility filter, and dynamic priority/created ordering | `req.query.customer`, `getPromotionColumns`, `__promoColsCache`, `pool.query`, `console.error` | No | No DB mutation | Yes, promotion/pricing-adjacent | Yes, `customer.html` calls `/promotions?customer=1` | Indirectly related to admin promotion management, though admin v2 uses `/admin/promotions_v2` | No direct caller found in technician app | Mutates in-memory `__promoColsCache` through `getPromotionColumns()` | High | No |
| `/service_zones` | GET | `index.js:21314` | Via `getServiceZones()`: `SELECT zone_code, zone_name, zone_label, province_group, color_hex, is_active, sort_order FROM public.service_zones WHERE is_active=TRUE ORDER BY sort_order, zone_code`; fallback to `SERVICE_ZONE_SEEDS` | `getServiceZones`, `SERVICE_ZONE_SEEDS`, `ENABLE_SERVICE_ZONE_FILTER`, `pool.query`, `console.error` | No | No | No direct pricing logic | Not a customer booking route, but service zones influence booking/assignment behavior elsewhere | Yes, `admin-add-v2.js` calls `/service_zones` and `/service_zones/detect` | `app.js` calls `/service_zones/detect`, not this GET route; helpers are shared with technician zone behavior | No DB mutation; fallback seed behavior if DB unavailable | Medium-high | Not before helper boundary audit |

## Detailed Route Notes

### GET /catalog/items

Current location:

```text
index.js:12916
```

Current route shape:

```js
app.get("/catalog/items", async (req, res) => {
  // builds customer/job_category/ac_type/btu filters
  const r = await pool.query(`SELECT ... FROM public.catalog_items WHERE ... ORDER BY item_category, item_name`, params);
  res.json(r.rows);
});
```

Response shape:

- Success: array of catalog item rows.
- Failure: HTTP 500 with `{ error: "โหลดรายการสินค้า/บริการไม่สำเร็จ" }`.

Current known direct caller:

- `admin-add-v2.js:1335` calls `apiFetch("/catalog/items")`.

No direct current caller was found in:

- `customer.html`
- `app.js`
- `tech.html`

Risk notes:

- The route returns `base_price`, `item_category`, `job_category`, `ac_type`, BTU bounds, and `is_customer_visible`.
- It is not itself a pricing calculator, but it feeds admin add-job UI item selection.
- Keep the POST `/catalog/items` route in `index.js` for now.

Future target path:

```text
server/routes/catalog/items.js
```

Required dependencies for future extraction:

- `pool`
- `express`

Recommended future factory:

```js
module.exports = function createCatalogItemRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();
  const pool = deps.pool || require("../../db/pool");

  router.get("/catalog/items", async (req, res) => {
    // exact existing handler
  });

  return router;
};
```

Future mount location:

- Mount at the exact old inline location before the `POST /catalog/items` route.
- Remove only the old inline `app.get("/catalog/items", ...)` block.

### GET /promotions

Current location:

```text
index.js:12981
```

Current route shape:

```js
app.get("/promotions", async (req, res) => {
  const isCustomer = String(req.query.customer || "").trim() === "1";
  const cols = await getPromotionColumns();
  // dynamic SELECT based on schema columns
  const r = await pool.query(`SELECT ... FROM public.promotions WHERE is_active = TRUE ... ORDER BY ...`, [isCustomer]);
  res.json(r.rows);
});
```

Response shape:

- Success: array of promotion rows.
- Failure: HTTP 500 with `{ error: "โหลดโปรโมชั่นไม่สำเร็จ" }`.

Current known direct caller:

- `customer.html:1483` calls `/promotions?customer=1`.

Risk notes:

- This route is public customer-facing.
- It affects promotions visible in customer booking.
- It uses `getPromotionColumns()` at `index.js:17065`.
- `getPromotionColumns()` reads `information_schema.columns` and mutates the top-level `__promoColsCache`.
- It is promotion/pricing-adjacent and should remain frozen until a promotion helper/module boundary is designed.

Future target path:

```text
server/routes/promotions/index.js
```

Required dependencies for future extraction:

- `pool`
- `getPromotionColumns`
- `express`

Protection before extraction:

- Do not duplicate `__promoColsCache`.
- Prefer passing `getPromotionColumns` into the route factory from `index.js` unless that helper is moved with dedicated tests.
- Confirm customer booking promotion dropdown still behaves exactly the same.

### GET /service_zones

Current location:

```text
index.js:21314
```

Current route shape:

```js
app.get("/service_zones", async (req, res) => {
  res.json({ ok: true, zones: await getServiceZones(), filter_enabled: ENABLE_SERVICE_ZONE_FILTER });
});
```

Response shape:

- Success: `{ ok: true, zones, filter_enabled }`.
- Failure: HTTP 500 with `{ error: "LOAD_SERVICE_ZONES_FAILED" }`.

Current known direct caller:

- `admin-add-v2.js:151` calls `/service_zones`.

Related service-zone callers:

- `admin-add-v2.js:177` calls `POST /service_zones/detect`.
- `app.js:1047` calls `POST /service_zones/detect`.

Risk notes:

- The GET route is small, but it depends on `getServiceZones()` at `index.js:100`.
- `getServiceZones()` queries `public.service_zones` and falls back to `SERVICE_ZONE_SEEDS` if the query fails or returns no rows.
- `ENABLE_SERVICE_ZONE_FILTER`, `SERVICE_ZONE_SEEDS`, and service-zone detection helpers are shared with admin add-job and technician zone behavior.
- Moving only the GET route is possible later, but it should not be done before deciding whether `getServiceZones()` remains injected from `index.js` or moves to a service module with tests.

Future target path:

```text
server/routes/serviceZones/index.js
```

Required dependencies for future extraction:

- `getServiceZones`
- `ENABLE_SERVICE_ZONE_FILTER`
- `express`

Protection before extraction:

- Keep fallback seed behavior exactly the same.
- Do not move `POST /service_zones/detect` in the same PR.
- Do not change technician zone detection or admin service-zone assignment behavior.

## Suggested Route Grouping

Recommended future modules:

```text
server/routes/catalog/items.js
server/routes/promotions/index.js
server/routes/serviceZones/index.js
```

Rationale:

- Catalog items are related to item selection and price-bearing catalog data, so they should not be grouped with system routes.
- Promotions are customer-public and pricing-adjacent, and should have a dedicated module.
- Service zones are operational routing/assignment data and should not be grouped with catalog or promotions.

## Manual Test Checklist

For `GET /catalog/items` extraction:

- App starts with `node index.js`.
- `GET /catalog/items` returns the same array shape as before.
- Query filters still work:
  - `?customer=1`
  - `?job_category=...`
  - `?ac_type=...`
  - `?btu=...`
- Admin add-job page loads.
- Admin add-job extra item dropdown loads and shows item names/prices.
- Admin add-job save flow still works if extra items are selected.
- Public booking still opens.
- Technician page still opens.

For `GET /promotions` extraction:

- Customer booking page loads.
- `/promotions?customer=1` returns the same array shape.
- Customer promotion dropdown still renders.
- Hidden non-customer promotions remain hidden for `customer=1`.
- Promotion ordering remains unchanged.
- Admin promotion v2 screens still load.

For `GET /service_zones` extraction:

- `/service_zones` returns `{ ok: true, zones, filter_enabled }`.
- Admin add-job service-zone dropdown loads.
- Admin add-job auto-detect still works through `POST /service_zones/detect`.
- Technician home-zone detection still works through `POST /service_zones/detect`.
- Fallback seed behavior still works in a safe test environment when `public.service_zones` is unavailable or empty.

## Rollback Plan

For any future extraction:

1. Remove the new route factory import from `index.js`.
2. Remove the new `app.use(...)` mount from `index.js`.
3. Restore the original inline `app.get(...)` block at the exact old location.
4. Delete the new route module if it is no longer used.
5. Run syntax checks:

```bash
node --check index.js
node --check server/routes/system/index.js
node --check server/routes/users/technicians.js
node --check server/db/pool.js
```

## Risks And Protections

- Do not move multiple candidate routes in one PR.
- Do not move neighboring POST routes in the same PR.
- Do not change SQL text, query parameters, response keys, status codes, or console logging.
- Do not create a new PostgreSQL Pool.
- Do not change customer pricing, booking, availability, auth/session, LINE, accounting, technician income, close-job/finalize, or unit evidence logic.
- Prefer dependency injection for shared helpers:
  - `pool` for catalog.
  - `pool` and `getPromotionColumns` for promotions.
  - `getServiceZones` and `ENABLE_SERVICE_ZONE_FILTER` for service zones.
