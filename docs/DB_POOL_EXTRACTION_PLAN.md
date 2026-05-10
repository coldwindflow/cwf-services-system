# DB Pool Extraction Plan

Date: 2026-05-10

This document records the Phase 2A database pool audit and preparation. It does not move queries, change connection settings, or change runtime behavior.

## Current Pool Source

Current single source of truth:

```text
db.js
```

`db.js` creates the PostgreSQL pool:

```js
const { Pool } = require("pg");
const pool = new Pool({ ... });
module.exports = pool;
```

The exported value is the pool object itself, not an object shaped like `{ pool }`.

## Current Import/Export Shape

Current root import in `index.js`:

```js
const pool = require("./db");
```

Other direct DB import found:

```js
cwf-revisit-tech-preload.js
try { pool = require('./db'); } catch (e) { ... }
```

No other JavaScript file was found creating `new Pool(...)`. Existing server helper modules either do not use the DB directly or accept `pool` through dependency injection.

## Phase 2A Preparation

Created:

```text
server/db/pool.js
```

Current contents:

```js
module.exports = require("../../db");
```

This preserves the exact export shape from `db.js`. Future route and service modules can import:

```js
const pool = require("../../db/pool");
```

from files under `server/routes/...`, adjusting the relative path as needed.

## Why This Does Not Create A Second Pool

`server/db/pool.js` does not call `new Pool(...)`. It only re-exports the existing root `db.js` module. Node resolves `../../db` to the same root file, so the root module remains the only place that creates the pool.

## index.js Status

Phase 2A did not change `index.js`.

Reason:

- Keeping `const pool = require("./db")` avoids any startup behavior change.
- Future modules can use `server/db/pool.js` without forcing a large `index.js` diff.
- A later cleanup may switch `index.js` to `require("./server/db/pool")`, but only after a focused check confirms shape and startup behavior.

Phase 2C update:

- `index.js` still imports the root pool with `const pool = require("./db")`.
- `index.js` now passes that existing pool into the system router with `app.use(createSystemRoutes({ pool }))`.
- `server/routes/system/index.js` can fall back to `server/db/pool.js`, but the production mount receives the existing pool explicitly.
- No second pool was created.

## Recommended Future Import Style

For new modules under `server/routes` or `server/services`, prefer importing the shared wrapper:

```js
const pool = require("../../db/pool");
```

For route factory modules, prefer dependency injection when the route already receives dependencies from `index.js`:

```js
module.exports = function createSomeRoutes(deps = {}) {
  const pool = deps.pool || require("../../db/pool");
};
```

Use one style per module. Do not create a new `Pool`.

## Risks

- `db.js` logs DB config when required. Any module importing `server/db/pool.js` will trigger the same root `db.js` behavior if it has not already been loaded.
- `cwf-revisit-tech-preload.js` still imports `./db` directly. Do not change preload behavior without a separate audit.
- Some existing helper modules accept `pool` through dependency injection. Do not replace injected dependencies casually.
- `index.js` contains many direct `pool.query` and `pool.connect` calls; moving those calls requires route-by-route extraction, not a broad DB refactor.

## Rollback

If the wrapper causes any issue:

1. Remove `server/db/pool.js`.
2. Keep all existing imports pointed at `./db`.
3. Run `node --check index.js`.
4. Run `node --check server/routes/system/index.js`.

Because Phase 2A does not change `index.js`, rollback is low risk.

## Files To Migrate First Later

Recommended first future migrations:

- New low-risk route modules that need read-only DB access.
- Small service modules created during future route extraction.
- Avoid high-risk areas until dedicated route maps and tests exist.

Do not migrate first:

- auth/session
- LINE login
- public booking
- availability/timezone
- pricing
- technician income and payouts
- close-job/finalize/unit evidence
- accounting/tax/VAT
- `cwf-revisit-tech-preload.js`
