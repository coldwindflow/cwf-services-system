# Customer Homepage Visual Polish — QA Screenshots

Browser QA evidence for a visual-polish pass on the customer homepage,
done in response to feedback that the page felt empty/bland and not
"commercial-grade": flat pale-blue placeholder boxes on featured-service
cards without a real catalog photo, a flat single-color CTA button, and
flat (non-gradient) icon chips throughout.

## What changed (CSS-only, no markup/JS/data contract changes)

- Featured-service (and other card-type) image placeholders: replaced the
  flat `--soft-blue-2` box + tiny centered icon with a richer brand
  gradient tile and a white icon chip with its own shadow. Real catalog
  photos are unaffected — `object-fit: cover` images fully cover this box
  whenever a real `image_url` exists, so the gradient/chip styling is
  only ever visible in the no-image fallback state.
- Hero CTA button (`.hero-main-btn`): flat `--yellow` → existing
  `--grad-gold` design token (was defined but unused).
- No-image hero card: flat shadow → `--shadow-soft` design token (also
  previously unused), plus a very subtle two-tone brand-tint radial
  overlay instead of a fully flat white card.
- Quick-action icon chips, trust-grid checkmark chips, and the "bookable"
  service badge: flat `--soft-blue` background → soft two-stop gradient
  with a small matching shadow for depth.
- Section-header accent bar: flat `--blue` → existing `--grad-cta`
  gradient token (also previously unused).
- `BUILD_ID` bumped (`20260630_homepage_visual_polish_v2`) across
  `index.html`, `customer-app.js`, `sw.js`, `manifest.webmanifest` for
  cache-busting, matching the existing project convention.

## Environment

Screenshots were captured with Playwright (Chromium) against an
in-memory QA server (`.qa-tmp/qa-server.js`) that mounts the real,
unmodified `createHomepageRoutes` from `server/routes/homepage.js` with
a mock `pool` and a local-disk Cloudinary stand-in for uploads — no
production database or environment was touched. The DAIKIN promo banner
was uploaded through the real Admin CMS upload flow
(`.qa-tmp/admin-flow.js`). The QA-only `/catalog/items` stub was given
one item with a real photo (to prove real images still render correctly)
and three items without a photo (to show the improved placeholder
state) — the same mix every screenshot below uses.

## Contact sheets

- `contact-sheet-390-before-after.jpg` — 390px, top / mid / bottom
  scroll positions, before (`origin/main`, code stashed during capture)
  vs. after (this branch). The "before" mid section shows the flat pale
  placeholder box on the photo-less featured card and flat checkmark
  chips in the trust grid; "after" shows the gradient placeholder tile,
  gradient icon/checkmark chips, and gold-gradient hero CTA.
- `contact-sheet-customer-320-390-480.jpg` — after-state customer
  homepage at 320 / 390 / 480px, top / mid / bottom scroll positions.
  Confirms no horizontal overflow at any width and consistent styling
  across breakpoints.
