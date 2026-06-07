CWF AI Office v20 — Production Mobile Chat UX Reset

Files:
- admin-ai-office.html
- admin-ai-office.js

Fix focus:
1. Main office screen is cleaner and less oversized on mobile.
2. Agent characters are smaller and positioned to reduce overlap.
3. Agent map buttons and bottom agent chips both open ChatGPT-style chat.
4. Agent chat overlay is rebuilt:
   - compact header
   - message bubbles
   - ChatGPT-style composer
   - small round send button
   - no huge empty-state text
5. Customer LINE chat composer is also ChatGPT-style:
   - textarea gets full width
   - small round send button
   - better keyboard behavior on Android
6. Memory/brain panel remains inside Customer Inbox flow, not on main header.
7. Uses existing backend endpoints already present in the repo:
   - /admin/ai-office/ask
   - /admin/ai-office/line-inbox
   - /admin/ai-office/line-conversations/:id/messages
   - /admin/ai-office/line-draft-reply
   - /admin/ai-office/reply-examples
   - /admin/ai-office/reply-learning/event

Install:
Copy admin-ai-office.html and admin-ai-office.js to the repository root.
Deploy to Render.
Hard refresh on Android Chrome or clear site cache if old UI still appears.
