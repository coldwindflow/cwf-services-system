# Customer Homepage Final Redesign — QA Screenshots

Browser QA evidence for the final customer homepage redesign (compact hero,
single-row quick actions, full-width promo banner, 4:3 featured-service
cards, compact trust grid, and a non-floating bottom nav booking button).

## Environment

Screenshots were captured with Playwright (Chromium) against an in-memory
QA server (`.qa-tmp/qa-server.js`) that mounts the real, unmodified
`createHomepageRoutes` from `server/routes/homepage.js` with a mock `pool`
and a local-disk Cloudinary stand-in for uploads — no production database
or environment was touched. The DAIKIN promo banner shown in the
screenshots was uploaded through the real Admin CMS upload flow
(`.qa-tmp/admin-flow.js`), not hand-edited into the mock config.

## Contact sheets

- `contact-sheet-customer-320-390-480.jpg` — customer homepage at 320 /
  390 / 480px, top / mid / bottom scroll positions. Confirms: no
  horizontal overflow at any width, compact white hero with exactly one
  primary CTA and one text-link secondary CTA, single row of 4 quick
  action tiles, full (uncropped) DAIKIN promo banner, 4:3 featured-service
  cards, 2×2 trust grid, and the bottom nav booking button in the same
  flex flow/baseline as the other four items. No announcements section is
  rendered anywhere (the section type is intentionally suppressed on the
  customer homepage).
- `contact-sheet-390-before-after.jpg` — same 390px scroll positions
  before (current `origin/main`) vs. after (this branch). The "before"
  state shows the always-visible empty announcements header and a broken
  Featured Services catalog call; the "after" state shows the compact
  hero, full promo banner, and working featured cards.
- `contact-sheet-admin-flow.jpg` — 8-step Admin Homepage CMS flow: load,
  empty promo section, item added, real file upload success, live
  preview with banner, draft saved, persisted after reload, published.
  Draft/Publish status indicators are visible at every step; no
  `alert()`/`prompt()` dialogs are used.
- `contact-sheet-bottom-nav-zoom.jpg` — pixel-level zoom on the bottom
  nav at 320 / 390 / 480px proving the booking item's yellow icon tile
  stays aligned with the other four items and the "จอง" label is never
  truncated or overlapped.
