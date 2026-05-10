# Phase 1 Low-Risk Route Map

Date: 2026-05-10

This document prepared the first safe route extraction from `index.js`.

Phase 1A status: `GET /api/version` has been extracted to `server/routes/system/index.js` and mounted from the existing `Health / Version` location in `index.js`.

Phase 1B status: no additional route was extracted. The next visible health/status candidates all require DB, auth/session, LINE-adjacent config, or business-flow context, so moving them would exceed the Phase 1 low-risk boundary.

## Scope

Recommended first route group:

- `/api/version`
- Health/status/pure read-only routes if they exist.

Current audit result:

- `/api/version` exists and is the safest first extraction candidate.
- No separate `/health` or `/status` route was found in `index.js`.
- `/test-db` exists but uses the database, so it is not the first extraction candidate.
- `/admin/debug/status` exists but uses admin middleware and availability debug state, so it should not move before `/api/version`.
- `/public/line_config`, `/public/me`, and `/api/auth/me` are read-like routes, but they touch LINE config, JWT/session, or auth context and are not Phase 1 first candidates.
- Phase 1B rechecked health/status/system candidates after Phase 1A and found no next route that meets all constraints: no DB, no auth/session, no upload, no pricing, no external APIs, no state mutation, and no technician/admin/customer/business-flow impact.

## Candidate Route Matrix

| Route | Current location | Nearby marker | Dependencies | DB | Auth/session | Upload | Pricing | External APIs | Phase 1 recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `GET /api/version` | `index.js` `Health / Version` marker | `Health / Version` marker | `res`, `Date` | No | No | No | No | No | Extracted in Phase 1A to `server/routes/system/index.js`. |
| `GET /test-db` | `index.js:12841` | `TEST DB` | `pool.query`, `console.error` | Yes, read-only `SELECT NOW()` | No | No | No | No | Do not move first. Candidate only after `/api/version`. |
| `GET /admin/debug/status` | `index.js:25201` | `Admin Debug Controls (availability logging)` | `requireAdminSoft`, `ENABLE_AVAILABILITY_DEBUG`, `RUNTIME_AVAILABILITY_DEBUG`, `process.env.TZ` | No | Yes, admin soft guard | No | No | No | Do not move first. Requires middleware dependency mapping. |
| `GET /public/line_config` | `index.js:1011` | `Public LINE config (debug only - no secrets)` | `process.env`, `getReqBaseUrl(req)` | No | No | No | No | No direct call, but LINE env/callback config | Do not move in Phase 1. LINE-adjacent. |
| `GET /public/me` | `index.js:969` | public customer session area | `getJwtSecret`, `parseCookieValue`, `jwtVerify`, `pool.query` for customer profile | Yes, conditional profile read | Yes, customer JWT/cookie | No | No | No | Frozen. Auth/session/customer profile. |
| `GET /api/auth/me` | `index.js:4312` | `Session check for frontend guards` | `getAuthContext`, `isSuperAdmin` | Possible through auth context | Yes | No | No | No | Frozen. Auth/session. |

## Phase 1B Finding

No route was moved in Phase 1B.

Rejected candidates:

- `GET /test-db` at previous `index.js:12840`: uses `pool.query("SELECT NOW() as now")`, returns database time, and may fail based on DB connectivity. It is read-only but not DB-free.
- `GET /admin/debug/status` at previous `index.js:25200`: uses `requireAdminSoft`, `ENABLE_AVAILABILITY_DEBUG`, `RUNTIME_AVAILABILITY_DEBUG`, and `process.env.TZ`. It is read-only but auth/session and runtime debug-state adjacent.
- `GET /public/line_config` at `index.js:1012`: reads LINE/JWT environment configuration and builds callback/base URLs through `getReqBaseUrl(req)`. It is LINE-adjacent and should stay frozen for now.
- Other `status` routes found by grep are partner, technician, admin, attendance, or job business-flow routes. They are outside the system/health scope.

Dependencies used by the route extracted so far:

- `GET /api/version`: `Date`, `res.json`.
- DB: no.
- Auth/session: no.
- Upload: no.
- Pricing: no.
- External APIs: no.
- State mutation: no.

Phase 1B rollback instruction:

- No runtime rollback is needed because Phase 1B did not move a route.
- To roll back the documentation-only Phase 1B note, revert this docs commit.

## Safest First Extraction Candidate

Moved only:

```text
GET /api/version
```

Why:

- No database access.
- No auth/session middleware.
- No upload middleware.
- No pricing helpers.
- No external APIs.
- No business logic.
- Response shape is tiny and easy to compare:

```js
{ ok: true, version: "gps-v4", ts: new Date().toISOString() }
```

Risk note: the timestamp is intentionally dynamic. Future tests should validate shape and parseability, not exact `ts` value.

## Proposed New File Path

Phase 1A uses this path:

```text
server/routes/system/index.js
```

This runtime file now exists and is mounted from `index.js`.

## Proposed Factory Pattern

```js
module.exports = function createSystemRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();

  router.get("/api/version", (req, res) => {
    res.json({ ok: true, version: "gps-v4", ts: new Date().toISOString() });
  });

  return router;
};
```

Notes:

- Keep CommonJS.
- Pass `express` explicitly through `deps`.
- Keep the route path exactly `/api/version`.
- Do not add middleware.
- Do not change the response fields or version string.

## Exact index.js Mount Plan For Future Extraction

Phase 1A did exactly this and no more:

1. Added `server/routes/system/index.js`.
2. Near the existing route dependencies in `index.js`, added:

```js
const createSystemRoutes = require("./server/routes/system");
```

3. Replaced only the previous inline route:

```js
app.get("/api/version", (req, res) => {
  res.json({ ok: true, version: "gps-v4", ts: new Date().toISOString() });
});
```

with:

```js
app.use(createSystemRoutes({}));
```

4. The mount remains in the same general location as the current `Health / Version` marker, before `/api/maps/resolve`.
5. `/api/maps/resolve` was not moved.
6. `/test-db` was not touched.
7. Auth/session, LINE login, pricing, booking, availability, accounting/tax/VAT, public tracking, technician income, payout, and close-job/finalize logic were not touched.

## Manual Test Checklist

For Phase 1A and future checks:

- Run `node --check index.js`.
- Run `node --check server/routes/system/index.js`.
- Start the app with `node index.js`.
- Call `GET /api/version`.
- Confirm response has:
  - `ok: true`
  - `version: "gps-v4"`
  - `ts` as a valid ISO timestamp string.
- Confirm login page still loads.
- Confirm no PWA/cache bump is needed because no frontend JS changed.
- Confirm runtime `git diff` touches only `index.js` and `server/routes/system/index.js` for the extraction task.

For Phase 1B:

- Run `node --check index.js`.
- Run `node --check server/routes/system/index.js`.
- Confirm no runtime route diff exists.
- Confirm `server/routes/system/index.js` still exposes only `GET /api/version`.
- Confirm no PWA/cache bump is needed because no frontend JS changed.

## Rollback Plan

If the Phase 1A extraction causes any startup or routing issue:

1. Remove the `createSystemRoutes` require from `index.js`.
2. Remove the `app.use(createSystemRoutes({}))` mount.
3. Restore the original inline `app.get("/api/version", ...)` block in the same location.
4. Delete `server/routes/system/index.js`.
5. Run `node --check index.js`.
6. Restart and re-check `GET /api/version`.

Because `/api/version` has no DB, auth, upload, pricing, or external API dependencies, rollback should be low risk.
