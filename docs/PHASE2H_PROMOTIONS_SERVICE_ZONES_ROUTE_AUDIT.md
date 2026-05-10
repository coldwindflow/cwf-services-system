# Phase 2H Promotions And Service Zones Route Audit

Date: 2026-05-11

Scope: audit only. No route was moved in Phase 2H, and no runtime file was changed.

This audit compares the two remaining read-only candidates from Phase 2F after `GET /catalog/items` was extracted in Phase 2G.

## Summary Recommendation

Recommended next extraction candidate:

```text
GET /service_zones
```

Reason:

- Its route handler is smaller than `GET /promotions`.
- Its response shape is compact: `{ ok: true, zones, filter_enabled }`.
- It has no auth/session middleware.
- It does not mutate the database.
- It does not call pricing or promotion helpers.
- It is not directly called by the customer booking promotion UI.

Risk remains **medium-high**, not low. The route depends on top-level service-zone helpers and flags that are shared with admin add-job, technician home-zone detection, and service-zone assignment behavior. Extract it only if the next PR moves **only** `GET /service_zones`, injects existing dependencies, keeps the old mount location, and does not move `POST /service_zones/detect`.

Do **not** extract `GET /promotions` next. It is customer-public, promotion/pricing-adjacent, calls `getPromotionColumns()`, and mutates the in-memory `__promoColsCache`.

## Candidate Comparison

| Route | Method | Current location | SQL used | Query parameters | Response shape | Dependencies | Auth/session | DB mutation | Pricing touch | Customer/public flow | Admin add/edit job flow | Technician app use | Side effects | Route order sensitivity | Risk | Safe next PR? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/promotions` | GET | `index.js:12948` | `getPromotionColumns()` reads `information_schema.columns`; route queries `public.promotions` with dynamic selected columns, `is_active = TRUE`, customer visibility filter, and dynamic `priority`/`created_at` ordering | `customer`; `"1"` limits results to `is_customer_visible = TRUE` | Success: array of promotion rows; failure: HTTP 500 with `{ error: "โหลดโปรโมชั่นไม่สำเร็จ" }` | `pool.query`, `getPromotionColumns`, `__promoColsCache`, `req.query.customer`, `console.error` | No | No DB mutation | Yes, promotion/pricing-adjacent | Yes, `customer.html` calls `/promotions?customer=1` for customer booking promotion dropdown | Admin v2 uses `/admin/promotions_v2`; route is still related to promotion data used in booking | No direct caller found in `app.js` or `tech.html` | Mutates in-memory `__promoColsCache` through `getPromotionColumns()` | Must stay before `POST /promotions`; do not move with admin promotion routes | High | No |
| `/service_zones` | GET | `index.js:21281` | Via `getServiceZones()`: `SELECT zone_code, zone_name, zone_label, province_group, color_hex, is_active, sort_order FROM public.service_zones WHERE is_active=TRUE ORDER BY sort_order, zone_code`; fallback to `SERVICE_ZONE_SEEDS` | None | Success: `{ ok: true, zones, filter_enabled }`; failure: HTTP 500 with `{ error: "LOAD_SERVICE_ZONES_FAILED" }` | `getServiceZones`, `ENABLE_SERVICE_ZONE_FILTER`, `pool.query` inside helper, `SERVICE_ZONE_SEEDS` fallback inside helper, `console.error` | No | No | No direct pricing logic | Not directly customer-public booking UI, but service zones influence assignment/availability behavior elsewhere | Yes, `admin-add-v2.js` calls `/service_zones`; same page calls `POST /service_zones/detect` | `app.js` calls `POST /service_zones/detect`, not this GET route; helpers/zone concepts are shared with technician behavior | No DB mutation; fallback seed behavior if DB unavailable or empty | Must stay before `POST /service_zones/detect`; do not move detect route in same PR | Medium-high | Yes, safer than promotions, with helper injection and focused tests |

## Detailed Route Notes

### GET /promotions

Current location:

```text
index.js:12948
```

Current route shape:

```js
app.get("/promotions", async (req, res) => {
  const isCustomer = String(req.query.customer || "").trim() === "1";
  const cols = await getPromotionColumns();
  const select = [/* dynamic columns */].join(", ");
  const r = await pool.query(
    `SELECT ${select}
     FROM public.promotions
     WHERE is_active = TRUE
       AND ($1::boolean = FALSE OR is_customer_visible = TRUE)
     ORDER BY ${(cols.has('priority') ? 'priority DESC,' : '')} ${(cols.has('created_at') ? 'created_at DESC,' : '')} promo_id DESC`,
    [isCustomer]
  );
  res.json(r.rows);
});
```

Helper:

```text
getPromotionColumns() at index.js:17032
```

Helper behavior:

- Reads `information_schema.columns` for `public.promotions`.
- Stores the discovered column set in `__promoColsCache`.
- Reuses the cache for five minutes.
- On helper failure, caches a fail-open modern-schema column set.

Known direct caller:

- `customer.html:1483` calls `/promotions?customer=1`.

Risk notes:

- This route feeds the customer booking promotion dropdown.
- The `customer=1` query changes visibility behavior.
- Dynamic selected columns preserve compatibility across deployments.
- Moving this route without moving or injecting `getPromotionColumns()` correctly could duplicate or reset cache behavior.
- It is promotion/pricing-adjacent and should remain frozen until a dedicated promotion route/service boundary exists.

Future target path:

```text
server/routes/promotions/index.js
```

Required dependencies for future extraction:

- `pool`
- `getPromotionColumns`
- `express`

Extraction protection:

- Do not move `POST /promotions` in the same PR.
- Do not move `/admin/promotions_v2` routes in the same PR.
- Do not duplicate `__promoColsCache`.
- Prefer dependency injection: `createPromotionRoutes({ pool, getPromotionColumns })`.
- Keep route path, query parameter behavior, dynamic SELECT, ordering, response shape, status codes, and console logging exactly the same.

### GET /service_zones

Current location:

```text
index.js:21281
```

Current route shape:

```js
app.get("/service_zones", async (req, res) => {
  try {
    res.json({ ok: true, zones: await getServiceZones(), filter_enabled: ENABLE_SERVICE_ZONE_FILTER });
  } catch (e) {
    console.error("GET /service_zones", e);
    res.status(500).json({ error: "LOAD_SERVICE_ZONES_FAILED" });
  }
});
```

Helper:

```text
getServiceZones() at index.js:101
```

Helper behavior:

- Queries active zones from `public.service_zones`.
- Orders by `sort_order, zone_code`.
- If the DB query fails or returns no rows, returns mapped `SERVICE_ZONE_SEEDS`.

Known direct caller:

- `admin-add-v2.js:151` calls `/service_zones` for the admin add-job service-zone dropdown.

Related callers and adjacent routes:

- `admin-add-v2.js:177` calls `POST /service_zones/detect`.
- `app.js:1047` calls `POST /service_zones/detect` for technician home-zone detection.
- `POST /service_zones/detect` shares service-zone detection helpers and must not move with this GET route.

Risk notes:

- The route itself is small, but the helper boundary is shared with zone detection and assignment behavior.
- `ENABLE_SERVICE_ZONE_FILTER` is used in booking/assignment logic elsewhere in `index.js`.
- `SERVICE_ZONE_SEEDS` is used by `getServiceZones()` and detection helpers.
- Moving only the GET route is safer than moving detection or helper logic, but the route should receive existing dependencies explicitly.

Future target path:

```text
server/routes/serviceZones/index.js
```

Required dependencies for future extraction:

- `getServiceZones`
- `ENABLE_SERVICE_ZONE_FILTER`
- `express`

Recommended future factory:

```js
module.exports = function createServiceZoneRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();
  const getServiceZones = deps.getServiceZones;
  const ENABLE_SERVICE_ZONE_FILTER = deps.ENABLE_SERVICE_ZONE_FILTER;

  router.get("/service_zones", async (req, res) => {
    // exact existing handler
  });

  return router;
};
```

Future mount location:

- Mount at the exact old inline route location before `POST /service_zones/detect`.
- Remove only the old inline `app.get("/service_zones", ...)` block.

Extraction protection:

- Do not move `POST /service_zones/detect`.
- Do not move `getServiceZones()` in the same PR unless a separate service-zone helper test exists.
- Do not change `SERVICE_ZONE_SEEDS`, `ENABLE_SERVICE_ZONE_FILTER`, or detection helpers.
- Preserve fallback seed behavior exactly.
- Preserve success and error response shapes exactly.

## Manual Test Checklist

For a future `GET /service_zones` extraction:

- App starts with `node index.js`.
- `GET /service_zones` returns `{ ok: true, zones, filter_enabled }`.
- `zones` row shape remains unchanged:
  - `zone_code`
  - `zone_name`
  - `zone_label`
  - `province_group`
  - `color_hex`
  - `is_active`
  - `sort_order`
- Admin add-job page loads.
- Admin add-job service-zone dropdown loads.
- `POST /service_zones/detect` still works for admin add-job auto-detect.
- Technician home-zone detection still works through `POST /service_zones/detect`.
- Fallback seed behavior is unchanged in a safe environment where DB zones are unavailable or empty.
- Public booking still opens.
- Technician page still opens.

For a future `GET /promotions` extraction:

- Customer booking page loads.
- `/promotions?customer=1` returns the same array shape.
- Customer promotion dropdown still renders.
- Hidden non-customer promotions remain hidden for `customer=1`.
- Promotion ordering remains unchanged.
- Promotion cache behavior remains shared and unchanged.
- Admin promotion v2 pages still load.
- Public booking total/promotion behavior still matches prior behavior.

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
node --check server/routes/catalog/items.js
node --check server/db/pool.js
```

For `GET /service_zones` specifically:

1. Remove the future `createServiceZoneRoutes` import and mount from `index.js`.
2. Restore the original inline `app.get("/service_zones", ...)` block before `POST /service_zones/detect`.
3. Delete `server/routes/serviceZones/index.js`.
4. Confirm `POST /service_zones/detect` was never moved.

## Risks And Protections

- Do not move both candidates in one PR.
- Do not move neighboring POST routes in the same PR.
- Do not change SQL text, query parameters, response keys, status codes, ordering, fallback behavior, or console logging.
- Do not create a new PostgreSQL Pool.
- Do not change customer booking, public promotion behavior, availability, admin add-job, technician zone detection, auth/session, LINE, accounting, technician income, close-job/finalize, or unit evidence logic.
- Prefer dependency injection instead of duplicating helpers:
  - `getServiceZones` and `ENABLE_SERVICE_ZONE_FILTER` for service zones.
  - `pool` and `getPromotionColumns` for promotions.
