# Phase 2D Technician Directory Route Map

Date: 2026-05-10

Scope: audit and preparation only. No route was moved in Phase 2D, and no runtime file was changed.

Phase 2E status: `GET /users/technicians` has been extracted to `server/routes/users/technicians.js`.

## Candidate Summary

Recommended future candidate:

```text
GET /users/technicians
```

This is the smallest currently inline DB-backed read-only route after `/test-db`. It should not be extracted into the system router because it is not a health/status route. If extracted later, it should go into a dedicated user or directory route module.

## Current Location

Current route location:

```text
Was `index.js:12906`; now `server/routes/users/technicians.js`
```

Nearby markers:

- Immediately after the password change route block.
- Immediately before the `CATALOG` section marker.
- `index.js` now mounts `app.use(createTechnicianDirectoryRoutes({ pool }))` at the old inline route location.

Current handler:

```js
app.get("/users/technicians", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT username FROM public.users WHERE role='technician' ORDER BY username`
    );
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "โหลดรายชื่อช่างไม่สำเร็จ" });
  }
});
```

## Dependencies

- `pool.query`
- `console.error`

SQL:

```sql
SELECT username FROM public.users WHERE role='technician' ORDER BY username
```

No direct dependency found on:

- Auth/session middleware
- Upload middleware
- Pricing helpers
- Booking helpers
- Availability helpers
- LINE APIs
- Accounting, tax, or VAT helpers
- Technician income helpers
- Close-job or unit evidence helpers
- External APIs

## Behavior And Response Shape

Success response:

```js
[
  { username: "..." }
]
```

Failure response:

```js
res.status(500).json({ error: "โหลดรายชื่อช่างไม่สำเร็จ" });
```

Side effects:

- No DB mutation.
- No state mutation.
- No external API call.

## Caller Audit

Searches for `users/technicians` and `/users/technicians` found:

- `index.js` current route definition.
- `docs/index.js` historical snapshot only.

No current `.js` or `.html` frontend caller was found for `/users/technicians`.

Admin screens currently use separate admin routes such as:

- `GET /admin/technicians`
- `GET /admin/technicians/work-readiness`
- Other `/admin/technicians/:username/...` routes

Because hidden external callers or older deployed pages may still depend on `/users/technicians`, validate production access logs or a staging smoke test before extraction.

## Risk Rating

Risk: low-to-medium.

Technical complexity is low because the route is a single GET handler with one `pool.query` call and a small response shape.

Product risk is medium because it exposes a technician directory from `public.users`, has no auth/session middleware, and may be a legacy endpoint used by older admin assignment flows or external tooling that is not visible in the repo.

## Recommendation

Phase 2E completed the extraction for only this route.

If this route needs future edits, keep changes isolated to `server/routes/users/technicians.js` unless the mount location or dependency injection must be changed.

Current module path:

```text
server/routes/users/technicians.js
```

## Current Factory Pattern

```js
module.exports = function createTechnicianDirectoryRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();
  const pool = deps.pool || require("../../db/pool");

  router.get("/users/technicians", async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT username FROM public.users WHERE role='technician' ORDER BY username`
      );
      res.json(r.rows);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "โหลดรายชื่อช่างไม่สำเร็จ" });
    }
  });

  return router;
};
```

## Exact Mount Plan For A Future Extraction

Phase 2E mount in `index.js`:

1. Import the route factory near other route module imports:

```js
const createTechnicianDirectoryRoutes = require("./server/routes/users/technicians");
```

2. Mount the router at the exact old route location, between the password change route block and the `CATALOG` marker:

```js
app.use(createTechnicianDirectoryRoutes({ pool }));
```

3. The old inline `app.get("/users/technicians", ...)` block was removed.

Do not change route path, SQL, response shape, middleware behavior, or surrounding business routes.

## Tests For Phase 2E

Syntax checks:

```bash
node --check index.js
node --check server/routes/users/technicians.js
node --check server/routes/system/index.js
node --check server/db/pool.js
```

Route behavior checks in a safe environment:

- Call `GET /users/technicians`.
- Confirm success response is still an array of rows containing `username`.
- Confirm SQL is still `SELECT username FROM public.users WHERE role='technician' ORDER BY username`.
- Confirm DB error response is still HTTP 500 with `{ error: "โหลดรายชื่อช่างไม่สำเร็จ" }`.
- Confirm no auth/session, upload, pricing, booking, availability, LINE, accounting, income, close-job, or evidence code changed.

Regression smoke checklist:

- App starts with `node index.js`.
- `GET /users/technicians` still returns an array of `{ username }` rows in a safe environment.
- If DB is unavailable, `GET /users/technicians` still returns HTTP 500 with `{ error: "โหลดรายชื่อช่างไม่สำเร็จ" }`.
- Admin technician list still loads through `/admin/technicians`.
- Admin add-job technician selection still works.
- Technician page still opens.
- Public booking still opens.

## Rollback Plan For Phase 2E

If extraction causes any issue:

1. Remove the `createTechnicianDirectoryRoutes` import from `index.js`.
2. Remove the `app.use(createTechnicianDirectoryRoutes({ pool }))` mount from `index.js`.
3. Restore the original inline `app.get("/users/technicians", ...)` block at the old location.
4. Delete `server/routes/users/technicians.js` if it is no longer used.
5. Run syntax checks again.
