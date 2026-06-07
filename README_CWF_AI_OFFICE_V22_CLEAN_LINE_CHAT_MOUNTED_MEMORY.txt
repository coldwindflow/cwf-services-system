CWF AI Office v22 — Clean LINE Chat + Mounted Agent Memory

Files:
- admin-ai-office.html
- admin-ai-office.js
- server/routes/adminAiOfficeAgentMemory.js
- migrations/20260608_ai_agent_chat_memory.sql
- tools/mount-ai-office-agent-memory-v22.sh

Frontend changes:
1. Removes the duplicate body toolbar inside selected LINE customer chat.
2. The selected LINE chat now uses only the top menu bar for:
   - back
   - สมองเสริม
   - รีเฟรช
3. Top back button now behaves correctly:
   - from selected chat -> goes back to conversation list
   - from list -> closes inbox
4. No inner “← กลับ / เพิ่มคำตอบ” row blocking customer chat.
5. Version bumped to v22.

Backend mount:
Run:
  bash tools/mount-ai-office-agent-memory-v22.sh .

This copies/mounts:
  server/routes/adminAiOfficeAgentMemory.js
  migrations/20260608_ai_agent_chat_memory.sql

If the script cannot find the real Express entry file, it prints the exact manual mount line.
