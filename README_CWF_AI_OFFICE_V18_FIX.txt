CWF AI Office v18 frontend fix

Files in this ZIP:
- admin-ai-office.html
- admin-ai-office.js

What changed:
- Removed the topbar "คลังคำตอบ" button from the main AI Office header.
- Kept only "กล่องแชทลูกค้า" and reload on the main header.
- Removed Office Chat as a map character to stop duplicate Admin-like characters.
- Main map now has exactly 6 agents: Admin, Sales, Ops, Ads, Content, Dev.
- Rebuilt Customer Inbox as a real single-view mobile chat workflow:
  list -> selected customer chat -> AI reply bubble.
- Removed quick command buttons from selected customer chat.
- Added editable AI customer_reply bubble with copy and save-to-memory actions.
- Added "สมองเสริม / คลังคำตอบแอดมิน" panel inside the inbox workflow, not on the main topbar.
- Uses existing backend routes:
  /admin/ai-office/line-inbox
  /admin/ai-office/line-conversations/:id/messages
  /admin/ai-office/line-draft-reply
  /admin/ai-office/reply-examples
  /admin/ai-office/reply-learning/event

Install:
Copy these two files to the repository root, replacing the existing files:
- admin-ai-office.html
- admin-ai-office.js

Then deploy to Render and hard refresh the mobile browser.
