CWF AI Office V25 - Separated Production Pages

เป้าหมายรอบนี้
- แก้ปัญหาหน้า AI Office ที่ยังดูรวมหลายงานเกินไป
- แยกหน้าแผนกจริง แทนการรวมทุกอย่างไว้ในหน้าเดียว
- แยก LINE OA Control ออกจาก AI Office หลักต่อไป
- รักษาหลัก read-only/admin controlled: ไม่สร้างงาน ไม่แก้งาน ไม่ส่งลูกค้าเองจากหน้าแผนก

ไฟล์หน้าใหม่
- /admin-ai-office.html                  หน้าเลือกแผนก/ภาพรวม
- /admin-ai-office-admin.html            Admin Office
- /admin-ai-office-ops.html              Ops & Queue
- /admin-ai-office-sales.html            Sales Reply
- /admin-ai-office-content.html          Content & Ads
- /admin-ai-office-dev.html              Dev / QA / Codex
- /admin-ai-line-control.html            LINE OA Control แยกหน้า

ไฟล์ที่เพิ่ม/แก้
- admin-ai-office.css
- admin-ai-office.js
- admin-ai-office.html
- admin-ai-office-admin.html
- admin-ai-office-ops.html
- admin-ai-office-sales.html
- admin-ai-office-content.html
- admin-ai-office-dev.html
- admin-ai-line-control.html
- server/routes/adminAiOfficeReadOnly.js
- server/routes/adminAiOfficeLineDraftV27.js
- server/routes/adminAiOfficeControlCenter.js
- migrations/20260612_ai_office_production_pages_v25.sql

สิ่งที่แก้
1. หน้า AI Office หลักไม่เปิด workspace ใหญ่ในหน้าเดียวแล้ว
2. แต่ละแผนกมี URL แยก ใช้งานเป็นหน้าเฉพาะของแผนกนั้น
3. หน้าแผนกโหลดข้อมูลงานจริงก่อน แล้วค่อยให้ AI สรุปเมื่อแอดมินกด
4. หน้าแผนกไม่มี Auto Safe/Playbook/Dashboard LINE ปนอยู่
5. LINE OA Control ยังคงอยู่ที่ /admin-ai-line-control.html
6. เพิ่มไฟล์ CSS แยก ลด HTML ยาวและลด CSS ซ้อน
7. แก้คำใน prompt จาก “ตัวละครที่ถูกเลือก” เป็น “แผนกที่เลือก”
8. เพิ่มการรองรับโทนตอบลูกค้าผ่าน AI_OFFICE_REPLY_TONE / CWF_REPLY_TONE

Reply tone env
- AI_OFFICE_REPLY_TONE=female  ใช้ ค่ะ/นะคะ เป็นค่าเริ่มต้นเดิม
- AI_OFFICE_REPLY_TONE=male    ใช้ ครับ/นะครับ
- AI_OFFICE_REPLY_TONE=neutral ไม่บังคับคำลงท้ายเพศ
- AI_OFFICE_REPLY_TONE=auto    อิงตัวอย่างคำตอบแอดมินถ้าชัดเจน

Migration
- 20260612_ai_office_production_pages_v25.sql เพิ่ม setting ai_office_customer_reply_tone

Manual test checklist
1. เปิด /admin-ai-office.html ต้องเป็นหน้าเลือกแผนก
2. กด Admin Office ต้องไป /admin-ai-office-admin.html
3. กด Ops & Queue ต้องไป /admin-ai-office-ops.html
4. กด Sales Reply ต้องไป /admin-ai-office-sales.html
5. กด LINE OA Control ต้องไป /admin-ai-line-control.html
6. หน้าแผนกต้องไม่เห็นแผง Auto Safe/Playbook ปนอยู่
7. งานวันนี้/งานพรุ่งนี้/ยังไม่ปิด/ยังไม่จ่าย ต้องโหลดจาก /admin/ai-office/jobs
8. กดสรุปด้วย AI หลังโหลดงานแล้วต้องเรียก /admin/ai-office/ask
9. ค้นงานจากเบอร์ต้องไม่ยอมถ้าใส่น้อยกว่า 6 ตัวเลข
10. ไม่มีหน้าเกม ไม่มีตัวละคร ไม่มีแผนที่เกม

Rollback
- ทับกลับด้วยไฟล์ก่อนหน้า หรือ restore commit ก่อนหน้า
- ถ้ารัน migration แล้วไม่จำเป็นต้อง rollback setting เพราะไม่กระทบงานจริง
