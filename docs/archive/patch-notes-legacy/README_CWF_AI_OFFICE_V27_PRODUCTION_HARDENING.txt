CWF AI Office V27 Production Hardening + Workbench Completion

สรุป:
V27 ต่อจาก V26 โดยไม่เพิ่ม AI mode ใหม่ แต่เก็บบั๊ก production และทำให้หน้า workbench ใช้งานจริงขึ้น

สิ่งที่แก้:
1. แก้ Health Check ไม่ให้เรียก POST /shared-memory/context ด้วย GET ผิด method
2. เพิ่ม /admin/ai-office/config ให้ส่ง reply_tone กลับมาเพื่อ frontend ใช้โทนเดียวกัน
3. แก้ข้อความตามชำระไม่พูดเรื่องสลิปก่อนลูกค้าถาม
4. แก้ข้อความยืนยันลูกค้า/ตามชำระให้ใช้ AI_OFFICE_REPLY_TONE ผ่าน config/localStorage
5. เพิ่ม Admin/Ops action log แยกของ AI Office ไม่แก้สถานะงานหลัก
6. เพิ่ม endpoint POST /admin/ai-office/work-actions
7. เพิ่ม migration ai_office_work_action_logs
8. เพิ่ม Ops timeline ตามเวลา พร้อมมุมมองแยกตามช่าง
9. เพิ่ม Sales Reply Builder ให้รองรับแพ็กเกจครบ: ปกติ/พรีเมียม/แขวนคอยล์/ตัดล้างใหญ่/เทียบราคา 4 แบบ
10. ปรับ LINE OA Control ให้หน้าแรกเน้นกล่องแชท/คิวอนุมัติ ไม่ใช่ setting ก่อน
11. เพิ่ม route no-cache ชัดเจนสำหรับหน้าแผนก: admin/ops/sales/content/dev และ CSS
12. เพิ่ม /ai-office fallback สำหรับ subdomain ai.cwf-air.com โดยไม่แตะ root / ของระบบหลัก
13. Production Health ส่ง setup_notes, webhook_url, reply_tone และตรวจ table action log

ไฟล์ที่แก้:
- admin-ai-office.js
- admin-ai-office.css
- admin-ai-line-control.html
- index.js
- server/routes/adminAiOfficeReadOnly.js
- migrations/20260612_ai_office_workbench_hardening_v27.sql

วิธีอัป:
1. แตก ZIP ทับ repo ปัจจุบัน
2. commit
3. deploy Render
4. run migration: migrations/20260612_ai_office_workbench_hardening_v27.sql ถ้ายังไม่เคยรัน
5. เปิด /admin-ai-office.html และ /admin-ai-line-control.html ตรวจงาน

Manual Test:
- เปิด /admin-ai-office.html ต้องเห็น Operator Dashboard
- เปิด /admin-ai-office-admin.html กดงานยังไม่จ่าย แล้วกดตามชำระ ต้องไม่มีคำว่าสลิป
- เปิด /admin-ai-office-ops.html ต้องเห็น Timeline ตามเวลา + แยกตามช่าง
- เปิด /admin-ai-office-sales.html ต้องเลือกแพ็กเกจได้ครบ 4 แบบ
- เปิด /admin-ai-line-control.html ต้องเริ่มจากกล่องแชท/คิวอนุมัติ ไม่ใช่ setting รก
- เรียก /admin/ai-office/production-health ต้องได้ setup_notes และ checks
- เรียก /admin/ai-office/shared-memory ต้องผ่าน

Rollback:
- revert commit ล่าสุด
- ไม่ต้อง rollback ข้อมูลงานหลัก เพราะ V27 ไม่แก้ status งานจริง
- ตาราง ai_office_work_action_logs เป็น log แยก ลบได้ถ้าต้องการ rollback เต็ม
