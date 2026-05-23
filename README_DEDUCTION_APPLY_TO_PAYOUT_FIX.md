# CWF Fix: อนุมัติเคสหักเงินแล้วต้องหักเงินจริงในงวดจ่ายช่าง

## ปัญหาเดิม
หน้า `หักเงินและงานแก้ไข` สร้างเคสได้ และ Super Admin กดอนุมัติได้ แต่ backend เดิมเปลี่ยนสถานะเป็น `approved` เท่านั้น ยังไม่ได้สร้างรายการติดลบใน `technician_payout_adjustments` จึงไม่ถูกนำไปคำนวณในงวดจ่ายช่างจริง

## สิ่งที่แก้
1. เพิ่ม service แยก `server/services/technicianDeductionPayoutApply.js`
   - คำนวณงวดจ่ายที่ต้องหักจาก `job.finished_at` ถ้ามี
   - ถ้างานยังไม่ปิดหรือไม่ผูกงาน จะหักเข้ารอบจ่ายปัจจุบัน/ถัดไปตามเวลา Asia/Bangkok
   - ถ้างวดนั้น paid แล้ว จะเลื่อนไปงวดถัดไปที่ยังไม่ paid
   - สร้าง `technician_payout_periods` แบบ draft อัตโนมัติถ้ายังไม่มี
   - สร้าง `technician_payout_adjustments` เป็นยอดติดลบ
   - อัปเดตเคสเป็น `applied` พร้อม `applied_payout_id` และ `applied_adjustment_id`

2. แก้ปุ่มอนุมัติ
   - จากเดิม: `pending_approval -> approved`
   - ใหม่: `pending_approval -> approved -> applied` ใน transaction เดียว
   - มี audit log ทั้งตอนอนุมัติและตอน apply เข้า payout

3. เพิ่ม endpoint สำหรับเคสที่อนุมัติไปแล้วก่อน patch
   - `POST /admin/deductions/:id/apply`
   - หน้า UI แสดงปุ่ม `หักเข้ารอบจ่าย` สำหรับเคสสถานะ `approved`

4. แก้หน้า payout ให้เห็นช่างที่มี adjustment อย่างเดียว
   - เดิมถ้าช่างไม่มี gross income ในงวด แต่มีรายการหัก จะไม่โผล่ในรายชื่อช่างของงวด
   - ใหม่ union รายชื่อจาก `technician_payout_adjustments` และ `technician_payout_payments` ด้วย

5. ปรับ schema safety
   - เพิ่ม column `applied_by`, `applied_at`, `applied_payout_id`, `applied_adjustment_id` ถ้ายังไม่มี
   - refresh check constraint ของ status ให้รองรับ `applied`

## วิธีใช้กับเคสที่กดอนุมัติไปแล้ว
1. เข้า `Admin > หักเงินและงานแก้ไข`
2. หาเคสสถานะ `approved`
3. กดปุ่ม `หักเข้ารอบจ่าย`
4. ระบบจะสร้าง adjustment ติดลบ และเปลี่ยนเคสเป็น `applied`
5. เข้า `Admin Accounting > จ่ายเงินช่าง` แล้วเปิดงวดนั้น จะเห็นยอดปรับยอดติดลบและยอดสุทธิช่างลดลงจริง

## วิธีทดสอบเคสใหม่
1. สร้างเคสหักเงินให้ช่าง จำนวน 100 บาท
2. ส่งอนุมัติ
3. Super Admin กด `อนุมัติ+หักจริง`
4. ตรวจว่าเคสเปลี่ยนเป็น `applied`
5. เปิดรายละเอียดเคส ต้องเห็น `applied_payout_id` และ `applied_adjustment_id`
6. เปิดหน้างวดจ่ายของช่าง ต้องเห็น adjustment `-100`
7. ยอด net/remaining ต้องลดลง 100 บาท

## Static checks
```bash
node --check index.js
node --check admin-deductions-v2.js
node --check server/routes/adminDeductionsReadOnly.js
node --check server/services/technicianDeductionPayoutApply.js
node --check admin-accounting-v2.js
node --check server/routes/accountingReadOnly.js
node --check server/services/technicianCashCollections.js
node --check server/services/technicianPayoutPeriods.js
node --check server/services/technicianPayoutPrepay.js
```
