CWF AI Office V26 - Real Department Workflows

เป้าหมาย:
- เปลี่ยนหน้าแผนกจากกล่องถาม AI เป็น workbench ใช้งานจริง
- ข้อมูลจริงต้องขึ้นก่อน AI
- AI เป็นตัวช่วยสรุป/ร่างข้อความ ไม่ใช่ตัวตัดสินใจหรือแก้ฐานข้อมูล
- LINE OA Control แยกจาก AI Office หลักเหมือนเดิม

ไฟล์หลัก:
- admin-ai-office.html
- admin-ai-office-admin.html
- admin-ai-office-ops.html
- admin-ai-office-sales.html
- admin-ai-office-content.html
- admin-ai-office-dev.html
- admin-ai-line-control.html
- admin-ai-office.js
- admin-ai-office.css
- server/routes/adminAiOfficeReadOnly.js
- server/routes/adminAiOfficeControlCenter.js
- server/routes/lineWebhook.js

สิ่งที่เพิ่ม:
1. Operator Dashboard บนหน้า AI Office หลัก
2. Admin Workbench: งานยังไม่จ่าย / ยังไม่ปิด / ค้นเบอร์ / ร่างตามชำระ / เปิดใบงาน
3. Ops Workbench: วันนี้ / พรุ่งนี้ / ยังไม่ปิด / แยกตามช่าง / badge ความเสี่ยง / ร่างแจ้งช่าง / ร่างยืนยันลูกค้า
4. Sales Reply Builder: ฟอร์มตอบราคา/แพง/นัด/ซ่อม/ต่างชาติ โดยอิงราคา CWF ปัจจุบัน
5. Content Builder: ฟอร์มโพสต์/รีวิว/วิดีโอ/แอด จากบริการ พื้นที่ และ proof
6. Dev/Codex Prompt Builder: ฟอร์มสร้าง prompt แบบมี rules, DoD, tests, rollback
7. Production Health: /admin/ai-office/production-health ตรวจ env และตารางสำคัญ
8. แยก LINE Messaging secret ให้รองรับ LINE_MESSAGING_CHANNEL_SECRET โดย fallback เป็น LINE_CHANNEL_SECRET
9. แก้ line draft system ให้ใช้ AI_OFFICE_REPLY_TONE จริง ไม่ hardcode เป็น ค่ะ เสมอ

ข้อห้ามที่ยังคงไว้:
- ไม่ส่ง LINE จากหน้า AI Office แผนก
- ไม่สร้างงานจาก AI Office
- ไม่แก้สถานะงาน
- ไม่แก้ฐานข้อมูลจากหน้าแผนก
- ไม่ expose OPENAI_API_KEY ใน frontend
- ไม่เอาเกม/ตัวละคร/แผนที่กลับมา

หลัง deploy ต้องทดสอบ:
1. /admin-ai-office.html เห็น Operator Dashboard และการ์ดแผนก
2. /admin-ai-office-admin.html โหลดงานยังไม่จ่ายและงานยังไม่ปิด
3. ปุ่มเปิดงานไป /admin-job-view-v2.html?job_id=...
4. ปุ่มตามชำระสร้างข้อความคัดลอกได้
5. /admin-ai-office-ops.html แยกงานตามช่างและมี risk badge
6. ปุ่มแจ้งช่าง/ยืนยันลูกค้าใน Ops สร้างข้อความได้
7. /admin-ai-office-sales.html สร้างข้อความจากฟอร์มได้โดยไม่ต้องพิมพ์ prompt
8. /admin-ai-line-control.html ยังเปิด LINE Control ได้ และไม่ปนในหน้า AI Office
9. /admin/ai-office/production-health ตอบ JSON พร้อม checks
10. /line/webhook ใช้ LINE_MESSAGING_CHANNEL_SECRET ได้ ถ้ามี

Rollback:
- revert ไฟล์ใน patch นี้กลับเวอร์ชันก่อนหน้า
- ไม่มี migration ใหม่ที่จำเป็นใน V26
- ถ้า LINE webhook verify ผิด ให้ตรวจ LINE_MESSAGING_CHANNEL_SECRET หรือ fallback LINE_CHANNEL_SECRET
