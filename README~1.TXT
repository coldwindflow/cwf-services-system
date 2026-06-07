CWF AI Office v25 — Select Customer Question + Persistent LINE AI Context

Files:
- admin-ai-office.html
- admin-ai-office.js

What changed:
1. Long-press, double-tap, or context-menu on a customer message to select it as the question to answer.
2. Selected customer question is highlighted and shown in a small bar above the chat.
3. AI draft now uses the selected customer question instead of always using the latest customer message.
4. Saving as learning example uses the selected customer question.
5. Copy/dislike learning events also use the selected customer question.
6. AI replies in LINE chat are persisted in localStorage per conversation, so closing/reopening the inbox does not lose recent AI draft context.
7. Reopened drafts show "จากประวัติก่อนหน้า".
8. Version/cache bumped to v25.

Important:
The system still cannot see admin replies sent directly inside LINE OA Manager.
Use:
- Long-press customer question
- Ask AI
- Edit reply
- Copy or 👍 save as example

Install:
Copy admin-ai-office.html and admin-ai-office.js to the repository root and deploy.
Hard refresh mobile browser after deploy.
