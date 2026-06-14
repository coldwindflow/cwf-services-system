CWF AI Office Agent-first UI Fix

Files in this ZIP:
- admin-ai-office.html
- admin-ai-office.js
- tools/disable-ai-office-extra-pin.patch.sh

What this fixes:
1. Mobile UI becomes agent-first.
2. Bottom panel is split into 3 clean modes: คำสั่ง / แชท / ค้นเบอร์.
3. Chat input is ChatGPT-style with a small send button, not a large messy button.
4. Phone search is separated into its own tab.
5. Agent selector chips are added so all 6 AI roles can be selected even when map characters are hard to tap.
6. Character hitboxes are larger on mobile.
7. Speech bubbles are shortened to status previews only. Full answers stay in chat.
8. Admin login is intended to be enough. Use the patch script to remove the extra AI_OFFICE_ACCESS_PIN enforcement from the AI Office route.

How to apply:
1. Replace admin-ai-office.html in the repo root.
2. Replace admin-ai-office.js in the repo root.
3. Run from repo root:
   bash tools/disable-ai-office-extra-pin.patch.sh
4. Commit and deploy on Render.
5. Hard refresh / clear app cache if the old UI appears.

Backend safety:
- This UI still calls existing read-only endpoints:
  /admin/ai-office/summary
  /admin/ai-office/ask
  /admin/ai-office/search-by-phone
- No job create/edit/status/payment actions are added.
- No LINE/SMS/email sending is added.
- No frontend secret is added.

Manual tests:
- Login admin once and open /admin/ai-office.
- Confirm no second PIN screen appears after route patch.
- Tap each AI character.
- Tap each agent chip.
- Use คำสั่ง tab.
- Use แชท tab and ask: วันนี้มีงานอะไรบ้าง
- Use ค้นเบอร์ tab with a real customer phone.
- Test mobile Chrome width 360/390/414.
- Test desktop.
