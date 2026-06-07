CWF AI Office v21 — Admin Usability + Persistence

Files:
- admin-ai-office.html
- admin-ai-office.js
- server/routes/adminAiOfficeAgentMemory.js
- migrations/20260608_ai_agent_chat_memory.sql
- README_BACKEND_AGENT_MEMORY_MOUNT.md

Frontend improvements:
1. Adds quick actions: วันนี้ / พรุ่งนี้ / ยังไม่ปิด / ยังไม่จ่าย / แชทลูกค้า / ตอบลูกค้า.
2. Quick actions open the correct AI agent and ask the prepared question.
3. Enter sends; Shift+Enter creates a new line.
4. Loading state uses typing dots.
5. API errors show retry button.
6. Copy in LINE customer chat shows clear toast.
7. Agent chat persists to existing reply-learning event endpoint.
8. Agent chat can load/save database history when the optional v21 backend route is mounted.

Backend additions:
1. Adds ai_agent_messages table migration.
2. Adds a safe read/write-only AI agent chat memory route.
3. This does not modify jobs, customers, payments, statuses, LINE sending, or production business data.

Important:
The new backend route file must be mounted in the main server/bootstrap using existing pool and requireAdminSession.
See README_BACKEND_AGENT_MEMORY_MOUNT.md.
