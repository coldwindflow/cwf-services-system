# Phase 2J Static Page Route Audit

Date: 2026-05-11

Scope: Phase 2J was audit only. No runtime code was changed, no route was moved, and no new module was created.

Phase 2K update: `GET /login` and `GET /login.html` have been extracted to `server/routes/pages/index.js`. The router is mounted with `app.use(createPageRoutes({ sendHtml }))` in the bottom static page route area after `express.static(FRONTEND_DIR)` and `express.static(ROOT_DIR)`.

This audit reviews only the bottom static login page routes as the next possible low-risk extraction candidate after Phase 2I.

## Candidate Summary

| Route | Method | Current location | Current handler | Dependencies | DB | Auth/session | Frontend/static sensitivity | Risk | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/login` | GET | `index.js:26872` | `res.sendFile(sendHtml("login.html"))` | `sendHtml`, `res.sendFile` | No | No | Must remain after `express.static(FRONTEND_DIR)` and `express.static(ROOT_DIR)` to preserve current order | Low | Best first Phase 2K candidate |
| `/login.html` | GET | `index.js:26898` | `res.sendFile(sendHtml("login.html"))` | `sendHtml`, `res.sendFile` | No | No | Highly order-sensitive because `express.static(ROOT_DIR)` is mounted before this route and root `login.html` exists | Low-medium | Move only with `/login` if preserving exact mount location after static middleware |

## Current Location And Order

Relevant current order in `index.js`:

```text
26856: function sendHtml(file) { ... }
26867: if (fs.existsSync(FRONTEND_DIR)) app.use(express.static(FRONTEND_DIR));
26868: app.use(express.static(ROOT_DIR));
26872: app.get("/login", (req, res) => res.sendFile(sendHtml("login.html")));
26898: app.get("/login.html", (req, res) => res.sendFile(sendHtml("login.html")));
26915: app.get("/", (req, res) => res.sendFile(sendHtml("login.html")));
```

`login.html` exists at the repository root. Because `express.static(ROOT_DIR)` is mounted before `app.get("/login.html", ...)`, a request to `/login.html` may be served by static middleware before reaching the explicit route. This means any extraction must preserve the mount location after static middleware to avoid changing current request ordering.

## Dependency Review

Both candidate handlers use only:

- `sendHtml("login.html")`
- `res.sendFile(...)`

`sendHtml(file)` checks:

1. `frontend/<file>`
2. repo root `<file>`

and returns the frontend path if present, otherwise the root path.

No DB access, no `pool`, no upload middleware, no auth/session middleware, no pricing, no promotion helper, no external API, and no mutable cache are used by either candidate route.

## Static And Redirect Sensitivity

Known nearby login-related behavior:

- LINE callback failures redirect to `/login.html?...`.
- Auth helpers redirect HTML requests to `/login.html`.
- `POST /login` remains in `index.js` and must not move with this page-route extraction.
- `/` also serves `login.html` at `index.js:26915`, but it should not move in the first Phase 2K extraction because it is the default app landing route.

Important order rule:

- Do not mount any future page router before `express.static(FRONTEND_DIR)` or `express.static(ROOT_DIR)`.
- Do not include protected admin/partner page routes in the same extraction, because protected routes rely on auth middleware and order relative to static serving.

## Extract One Or Both?

Phase 2K extraction:

```text
GET /login
GET /login.html
```

Reason:

- They are a tiny pair serving the same file with the same dependency.
- Moving only `/login` is the absolute smallest change, but leaves the alias route split across two locations.
- Moving both together is still narrow and easier to verify, as long as the mount remains at the same bottom static-page location after `express.static(...)`.

Do not include:

- `GET /`
- `POST /login`
- protected admin/partner static page routes
- `/tech` or `/tech.html`
- any customer, booking, tracking, pricing, promotion, auth/session core, technician income, accounting, tax/VAT, or attendance route

## Phase 2K Target

Target module:

```text
server/routes/pages/index.js
```

Factory pattern:

```js
module.exports = function createPageRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();
  const sendHtml = deps.sendHtml;

  router.get("/login", (req, res) => res.sendFile(sendHtml("login.html")));
  router.get("/login.html", (req, res) => res.sendFile(sendHtml("login.html")));

  return router;
};
```

Mount plan:

```js
app.use(createPageRoutes({ sendHtml }));
```

Mount location:

- Replaced only the existing `/login` and `/login.html` inline route handlers.
- Mounted after:
  - `if (fs.existsSync(FRONTEND_DIR)) app.use(express.static(FRONTEND_DIR));`
  - `app.use(express.static(ROOT_DIR));`
- Kept all other static page routes in `index.js`.

## Manual Smoke Checklist

For the Phase 2K extraction:

- App starts with `node index.js`.
- `GET /login` returns the login page.
- `GET /login.html` returns the login page or continues to be served by static middleware exactly as before.
- `GET /` still returns the login page.
- LINE login failure redirects to `/login.html?...` and still displays the login page.
- Auth/session redirects to `/login.html` still display the login page.
- `POST /login` still authenticates exactly as before.
- `GET /tech` and `GET /tech.html` still load the technician app.
- Admin page redirects and static page aliases still work.

## Rollback Plan

If the extraction causes any issue:

1. Remove the `createPageRoutes` import from `index.js`.
2. Remove the `app.use(createPageRoutes({ sendHtml }))` mount from `index.js`.
3. Restore these exact inline handlers at the bottom static-page location:

```js
app.get("/login", (req, res) => res.sendFile(sendHtml("login.html")));
app.get("/login.html", (req, res) => res.sendFile(sendHtml("login.html")));
```

4. Delete `server/routes/pages/index.js`.
5. Run:

```bash
node --check index.js
```

6. Manually smoke test `/login`, `/login.html`, `/`, and `POST /login`.

## Risk And Protections

Risk level:

```text
Low for /login
Low-medium for /login.html because of static middleware order
```

Protections for Phase 2K:

- Keep the mount after both static middlewares.
- Move only `/login` and `/login.html`.
- Do not move `POST /login`.
- Do not move `/`.
- Do not move `/tech` or `/tech.html`.
- Do not include protected routes.
- Do not change `sendHtml`.
- Do not change frontend files.
- Do not touch auth/session core logic.
