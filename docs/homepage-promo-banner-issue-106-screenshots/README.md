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

## Customer homepage — after (current branch)

Captured at 320px, 390px, and 480px viewport widths, each with three scroll
positions (top: Hero + quick actions; mid: Promo Banner + Featured Services;
bottom: Trust + bottom nav). No horizontal overflow was observed at any
width.

| File | What it shows |
|---|---|
| `after-320-top.png` / `after-390-top.png` / `after-480-top.png` | Compact no-image Hero (`is-no-image` variant), quick actions |
| `after-320-mid.png` / `after-390-mid.png` / `after-480-mid.png` | CWF × DAIKIN promo banner, full image, uncropped text |
| `after-320-bottom.png` / `after-390-bottom.png` / `after-480-bottom.png` | Trust section + bottom navigation |

## Customer homepage — before / after comparison (390px)

| File | What it shows |
|---|---|
| `before-390-top.png` | Pre-PR baseline (commit `551c7a5`): old tall gradient Hero panel, no Promo Banner section at all |
| `after-390-top.png` | This PR: compact restrained no-image Hero |
| `before-390-mid.png` | Pre-PR baseline: no Promo Banner section, placeholder news card instead |
| `after-390-mid.png` | This PR: CWF × DAIKIN training banner, full and uncropped |
| `before-390-bottom.png` / `after-390-bottom.png` | Trust + bottom nav, before vs. after the visual redesign |

## Admin CMS flow (real upload handler, local-disk Cloudinary stand-in)

| File | What it shows |
|---|---|
| `admin-01-loaded.png` | Admin Homepage CMS editor loaded |
| `admin-02-promo-section-empty.png` | Promo Banner section, empty state |
| `admin-03-promo-item-added.png` | Promo Banner item added before upload |
| `admin-04-upload-success.png` | Real DAIKIN PNG uploaded via the real upload handler |
| `admin-05-preview-with-banner.png` | Admin Preview pane showing the uploaded banner |
| `admin-06-draft-saved.png` | Draft saved confirmation |
| `admin-07-after-reload-persisted.png` | Page reloaded — banner persisted in Draft |
| `admin-08-published.png` | Published confirmation, public config now serves the banner |
