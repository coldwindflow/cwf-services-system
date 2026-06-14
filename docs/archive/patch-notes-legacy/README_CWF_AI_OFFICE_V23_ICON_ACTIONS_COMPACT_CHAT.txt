CWF AI Office v23 — Icon Actions / Compact LINE Chat

Files:
- admin-ai-office.html
- admin-ai-office.js

What changed:
1. In LINE customer chat topbar, "สมองเสริม" is now a compact 🧠 icon button.
2. Refresh remains a compact ↻ icon button.
3. AI reply bubble no longer uses large long action buttons.
4. Copy is now an icon button: ⧉
5. Save as learning example is now a like icon: 👍
6. Mark as not useful is now a dislike icon: 👎
7. Dislike logs a reply-learning event and visually marks the AI bubble as not used.
8. Version/cache bumped to v23.

Optional backend files are included only if you still need to mount DB-backed agent memory:
- server/routes/adminAiOfficeAgentMemory.js
- migrations/20260608_ai_agent_chat_memory.sql
- tools/mount-ai-office-agent-memory-v23.sh

Install:
Copy admin-ai-office.html and admin-ai-office.js to the repository root and deploy.
If you need backend memory mount, run:
  bash tools/mount-ai-office-agent-memory-v23.sh .
