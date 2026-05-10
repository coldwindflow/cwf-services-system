# CWF Technician App Master Spec

ไฟล์กลางสเปกหน้าช่าง CWF เพื่อใช้เปิดโครงการ Tech App Stable

เอกสารฉบับเต็มอยู่ในไฟล์ DOCX; ไฟล์ Markdown นี้ใช้สำหรับคัดลอกเข้า Codex/Claude ได้ง่าย

## สรุปสั้น
- หน้าช่างต้องเร็ว ไม่คำนวณรายได้สดตอนโหลดการ์ด
- ใช้ข้อความ “ที่ช่างจะได้รับ” เหมือนเดิม ห้ามใส่ “โดยประมาณ”
- ใช้ job_technician_income_preview และ technician_job_income_display เป็น source ของการ์ด
- งานยกเลิก = ได้รับ 0 ฿
- งานแก้ไข = ยอดที่พักไว้ / คืนรายได้เดิม / ยังไม่คืนรายได้
- ประวัติงานห้ามคำนวณรายได้สดทีละใบ
- สรุปจำนวนเครื่องห้ามหาย
- รายได้ต้องอิงเรทสัญญา ไม่ใช่ราคาขายลูกค้า
- แยก logic ออกจาก index.js เท่าที่ปลอดภัย

## Prompt เปิดโครงการ

```text
You are working on the production CWF technician app.

Goal:
Stabilize the technician-side app based on the approved CWF Technician App Master Spec.

Do not rewrite the app.
Do not change customer pricing.
Do not change admin booking flows.
Do not change auth/session unless the bug is directly related.
Do not calculate technician income from customer price.
Do not count rework/revisit/warranty jobs as new income.
Do not change the visible label “ที่ช่างจะได้รับ”.
Do not add “โดยประมาณ”.
Do not remove existing working UI.

First task:
Read the Tech App Master Spec and audit the current technician app.

Files to inspect:
- tech.html
- app.js
- index.js
- server/technicianIncome.js
- server/normalizers.js
- server/pricing.js
- sw.js

Audit these areas:
1. รับงานใหม่
2. งานปัจจุบัน
3. ประวัติงาน
4. รายได้
5. เมนูตั้งค่า
6. งานยิงด่วน / ข้อเสนอ
7. งานที่แอดมิน assign ล่วงหน้า
8. งานแก้ไข / rework
9. close job flow
10. income summary
11. PWA cache
12. technician identity mapping
13. live income recalculation on cards/history

Output:
- Current behavior
- Expected behavior from spec
- PASS/FAIL
- Risk level
- Files involved
- Minimal fix plan

Do not edit code in the first response.
```
