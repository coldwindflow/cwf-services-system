# Issue #106 — Homepage Promo Banner / Hero redesign — visual QA

Screenshots captured for PR #107 (`claude/homepage-premium-banner-redesign`).

## Environment used for these screenshots

All screenshots were captured against **local, in-memory QA harnesses** that
mount the real, unmodified Express route code from `server/routes/homepage.js`
(`createHomepageRoutes`) and the real customer-app static assets. These
harnesses use an **in-memory mock `pool.query()`** (no real Postgres
connection) and write uploaded images to local disk standing in for
Cloudinary. **No production database, production config row, or production
Cloudinary asset was read or written.** The real admin upload code path
(`multer` + `cloudinaryUploadBuffer`-shaped function + draft/publish
endpoints) was exercised end-to-end through a real headless-browser session,
not mocked at the request level — only the storage backends are local
stand-ins for the database and Cloudinary.

- **"After" harness** — current branch code (`server/routes/homepage.js`,
  `customer-app/modules/ui.js`, `customer-app/assets/customer-app.css` as of
  this PR), seeded with `DEFAULT_CONFIG` from this branch.
- **"Before" harness** — an isolated git worktree checked out at the pre-PR
  base commit (`551c7a5`), running that commit's own unmodified route code
  and `DEFAULT_CONFIG`, to produce an honest baseline (no fabricated/mocked
  "before" state).

## Contact sheets

Individual full-resolution screenshots were composited into three JPEG
contact sheets (kept under version control at moderate size) instead of 21
separate PNGs. Customer-facing rows are laid out at their native mobile
viewport width (320/390/480px) so the DAIKIN banner text and UI detail stay
legible; the admin flow sheet is scaled to 640px-wide thumbnails since it's
full-page admin UI captures, not pixel-level image proof.

| File | What it shows |
|---|---|
| `contact-sheet-customer-320-390-480.jpg` | Customer homepage at 320/390/480px, 3 rows: top (Hero + quick actions), mid (CWF × DAIKIN promo banner, full/uncropped, + Featured Services), bottom (Trust + bottom nav). No horizontal overflow observed at any width. |
| `contact-sheet-390-before-after.jpg` | 390px before/after comparison: BEFORE = pre-PR baseline (commit `551c7a5`, run from its own unmodified route code) showing the old tall gradient Hero and the complete absence of a Promo Banner section; AFTER = this PR's compact `is-no-image` Hero variant and the live DAIKIN promo banner. |
| `contact-sheet-admin-flow.jpg` | Admin Promo Banner CMS flow, 8 steps: section editor (empty) → item added → real DAIKIN upload → Preview pane → Draft saved → reload-persists → Publish. |
