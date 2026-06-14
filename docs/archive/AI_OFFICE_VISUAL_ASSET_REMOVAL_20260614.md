# AI Office Visual Asset Removal

Date: 2026-06-14  
Branch: `remove-ai-office-visual-assets-20260614`  
Mode: approved implementation  

## Product Decision

CWF no longer uses the AI Office cartoon/game visual UI.

AI Office should remain a lightweight production admin dashboard with CSS/cards/text/icons, backed by the existing AI Office routes and business logic.

## Scope

Removed the retired visual asset dependency:

- `assets/ai-office-final/**`
- `assets/ai-office-final/manifest.json`
- diagnostics checks that required cartoon/map/prop/character images
- service worker reference to the retired visual asset path

Kept:

- AI Office pages and routes
- AI chat/business logic
- AI Office read-only route behavior
- `server/ai-brain`
- auth/payment/accounting/migrations
- customer/admin/technician production workflows

## Reference Audit

Live references before implementation were concentrated in:

- `server/routes/adminAiOfficeReadOnly.js`
  - read `assets/ai-office-final/manifest.json`
  - collected `/assets/ai-office-final/...` paths
  - failed diagnostics when visual assets were missing
- `sw.js`
  - network-first bypass included `/assets/ai-office-final/`
- `README.md`
  - described AI Office assets as a production entry point
- historical docs under `docs/archive/`
  - retained as history

The active `admin-ai-office*.html`, `admin-ai-office.js`, and `admin-ai-office.css` files already render the current lightweight card/chat UI and do not directly load `assets/ai-office-final` images.

## Implementation Notes

- Diagnostics now pass when `assets/ai-office-final` is absent, because the visual pack is intentionally retired.
- Service worker still keeps AI Office pages/API network-first, without referencing the retired asset path.
- README now describes AI Office as the lightweight admin workspace instead of an artwork asset system.

## Size Impact

Before deletion:

- Non-`node_modules` working tree: about 141.95 MiB
- `assets/ai-office-final`: about 131.22 MiB

Expected after deletion:

- Non-`node_modules` working tree reduced by about 131 MiB
- GitHub repository history is not rewritten in this PR, so historical pack size remains in Git history until a separate approved history-rewrite task.

## Verification Checklist

- `node --check server/routes/adminAiOfficeReadOnly.js`
- `node --check sw.js`
- AI Office page still opens behind admin auth.
- `/admin/ai-office/diagnostics` no longer fails because visual assets are absent.
- `rg "assets/ai-office-final|ai-office-final"` should show only historical docs and this audit note after deletion.
