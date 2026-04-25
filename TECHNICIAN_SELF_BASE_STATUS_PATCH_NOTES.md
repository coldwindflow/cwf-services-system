# Technician Self Base Status Patch (Phase 1.1)

## Summary
เพิ่มทางให้ช่างทำแบบประเมิน Base Status เองจากเมนูช่าง และบันทึกผลเป็น `pending_review` เพื่อให้ Admin/Super Admin ตรวจสอบต่อ ก่อนใช้เป็นคะแนน Official

## Files changed / added
- `index.js`
  - เพิ่ม route หน้า `/tech/base-status`
  - เพิ่ม API ฝั่งช่าง:
    - `GET /tech/api/base-status`
    - `POST /tech/api/base-status`
  - เพิ่มคอลัมน์สถานะในตาราง `technician_base_status_assessments`
  - แยกผลช่างส่งเองเป็น `assessment_source='self'` และ `review_status='pending_review'`
  - Admin assessment ยังบันทึกเป็น `verified`
- `tech.html`
  - เพิ่มปุ่มเมนูช่าง “แบบประเมิน Base Status”
- `tech-base-status.html`
  - หน้าแบบประเมินสำหรับช่าง
- `tech-base-status.js`
  - Logic โหลดโปรไฟล์ช่าง, กรอกแบบประเมิน, ส่งผล, แสดงผลลัพธ์ล่าสุด
- `admin-team-status.js`
  - แสดงป้าย “ช่างส่งเอง: รอตรวจ” ใน Team Status Dashboard
- `migrations/technician_base_status_assessments.sql`
  - เพิ่มคอลัมน์และ index สำหรับ self assessment / review status

## Database migration
รันไฟล์:
`migrations/technician_base_status_assessments.sql`

คอลัมน์ใหม่ในตารางโมดูลนี้เท่านั้น:
- `assessment_source`
- `review_status`
- `reviewed_by`
- `reviewed_at`
- `review_notes`

## Manual test checklist
1. Login เป็นช่าง
2. เปิดเมนูช่าง
3. เห็นปุ่ม “แบบประเมิน Base Status”
4. กดแล้วเข้า `/tech/base-status`
5. หน้าแสดงรูปโปรไฟล์เดิมของช่าง
6. กรอกแบบประเมินและกดส่ง
7. ระบบบันทึกสำเร็จและแสดงผล Rank / Level / Status bars
8. สถานะผลประเมินเป็น “รอแอดมินตรวจสอบ”
9. Login เป็น Admin/Super Admin
10. เข้า `/admin/team-status`
11. เห็นป้าย “ช่างส่งเอง: รอตรวจ” ที่ช่างคนนั้น
12. Existing flows ไม่พัง:
    - Booking
    - Tracking
    - E-Slip
    - Technician app
    - Profile image
    - Pricing

## Rollback
ลบไฟล์ใหม่:
- `tech-base-status.html`
- `tech-base-status.js`

ย้อนกลับไฟล์ที่แก้:
- `index.js`
- `tech.html`
- `admin-team-status.js`
- `migrations/technician_base_status_assessments.sql`

ตารางเดิมของระบบงานหลักไม่ได้ถูกแก้ไข
