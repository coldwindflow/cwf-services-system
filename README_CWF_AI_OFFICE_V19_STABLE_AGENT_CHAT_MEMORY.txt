CWF AI Office v19 stable agent chat + memory fix

Files in this ZIP:
- admin-ai-office.html
- admin-ai-office.js

Fixes:
1. Rolebar buttons now open the selected AI chat directly, not just select the role.
2. Map character buttons have bigger hit targets and direct event listeners after every render.
3. Removed Office Chat duplication from frontend agent list; the visible map/rolebar contains 6 agents only.
4. Agent chat now keeps longer local per-agent conversation history and sends recent context with each question.
5. Agent chat logs questions/answers to the existing reply-learning event endpoint when available.
6. Main topbar still keeps only Customer Inbox + reload. The memory panel remains inside the inbox workflow, not on the main header.
7. Cache/version bumped to v19.

Backend note:
The repo already has server-side AI reply learning/memory support:
- server/aiReplyLearning.js
- /admin/ai-office/reply-examples
- /admin/ai-office/reply-learning/event
- /admin/ai-office/line-draft-reply uses matching reply examples

Install:
Copy these files to the repository root, replacing the existing files:
- admin-ai-office.html
- admin-ai-office.js

Deploy to Render, then hard refresh mobile browser.
