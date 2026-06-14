CWF AI Office v28 — Smart Assistant / Deterministic Availability / Auto Learning

This pack includes v26 + v27 and adds v28.

Included from v26:
- Selected customer question is the main LINE reply question.
- Natural LINE reply bubble.
- ai_line_chat_drafts.

Included from v27:
- Shared AI Memory across Agent chat and LINE customer chat.
- ai_memory_events.
- copied / saved / disliked / drafted events.

New in v28:
1. Deterministic Technician Availability Engine.
2. POST /admin/ai-office/ask is intercepted only for availability questions.
3. It computes availability from real jobs, appointment times, duration_min, technician fields, and 30-minute travel buffer.
4. It parses:
   - วันนี้ / พรุ่งนี้
   - หลังบ่าย 2 / หลัง 14:00
   - ก่อนเที่ยง / ช่วงเช้า / ตอนเย็น
   - ช่างเฉพาะ เช่น ช่างอร์ม
5. It refuses to say "คิวเต็ม" just because there are jobs.
6. If available slots exist, it says the slots.
7. If data is insufficient, it says to check job duration / travel / job area.
8. Admin corrections are auto-learned into ai_memory_events.
9. Non-availability questions fall through to existing adminAiOfficeReadOnly route.

Files:
- admin-ai-office.html
- admin-ai-office.js
- server/routes/adminAiOfficeSharedMemoryV27.js
- server/routes/adminAiOfficeLineDraftV27.js
- server/routes/adminAiOfficeSmartAssistantV28.js
- migrations/20260608_ai_shared_memory_v27.sql
- migrations/20260608_ai_line_chat_drafts_v26.sql
- tools/mount-ai-office-v28-smart-assistant.sh

Install:
1. Copy frontend files to repo root.
2. Copy server route files.
3. Copy and run migrations.
4. Run: bash tools/mount-ai-office-v28-smart-assistant.sh .
5. Deploy Render and hard refresh mobile.

Important:
The v28 route must be mounted BEFORE the existing adminAiOfficeReadOnly route.
