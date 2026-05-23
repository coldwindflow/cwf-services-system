# CWF Admin Add Job Team Assignment: No Primary Required Fix

## ปัญหา
หน้า Admin > เพิ่มงาน เมื่อเลือกโหมดทีม ระบบยังบังคับให้เลือก “ช่างหลัก” (`technician_username`) แม้เลือกช่างหลายคนแล้ว ทำให้กดบันทึกงานไม่ได้ หรือ backend `/admin/book_v2` reject ด้วยเงื่อนไข `โหมด team ต้องระบุ technician_username`.

## แนวทางแก้
- เอา requirement “เลือกช่างหลัก” ออกจาก UX หน้าเพิ่มงาน
- ให้ทีมใช้รายชื่อช่างที่เลือกหลายคนจาก `team_members` เป็น source of truth
- เพื่อ backward compatibility กับ column เดิม `jobs.technician_username` / `jobs.technician_team`, frontend/backend จะเลือกช่างคนแรกในทีมเป็น internal representative อัตโนมัติเท่านั้น แอดมินไม่ต้องเลือกเอง
- backend `/admin/book_v2` ยอมรับ team job ที่มี `team_members` แม้ไม่ได้ส่ง `technician_username`
- บันทึกสมาชิกทีมลง `job_team_members` และ `job_assignments` เหมือนเดิม

## ไฟล์ที่แก้
- `admin-add-v2.html`
- `admin-add-v2.js`
- `index.js`

## วิธีทดสอบ
1. เปิดหน้า Admin > เพิ่มงาน
2. เลือกรูปแบบมอบหมายเป็น “ทีม”
3. โหลดคิวว่าง / เลือกสล็อต
4. เลือกช่างหลายคนในทีม โดยไม่ต้องเลือกช่างหลัก
5. กดบันทึกงาน
6. ตรวจว่า API `/admin/book_v2` สำเร็จ และใบงานมีสมาชิกใน `job_team_members` ครบทุกคน
7. ตรวจว่าโหมดเดี่ยวและโหมด auto ยังทำงานเหมือนเดิม

## Syntax check
```bash
node --check index.js
node --check admin-add-v2.js
```
