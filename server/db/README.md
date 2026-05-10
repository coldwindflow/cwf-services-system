# Server DB

Future home for database connection helpers.

Current helper:

- `pool.js`

Current pool entry is still `db.js` at the repository root. `server/db/pool.js` re-exports `../../db` so future modules can share the same pool without creating another PostgreSQL pool.

Do not move root `db.js` or change connection settings until all imports are mapped and `node index.js` startup is verified.
