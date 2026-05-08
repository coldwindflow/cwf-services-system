# CWF Regression Checklist

ใช้เช็กทุกครั้งก่อน merge/push งาน production

## 1) Syntax

- [ ] `node --check index.js`
- [ ] `node --check app.js` ถ้าแก้ฝั่งช่าง
- [ ] `node --check admin-add-v2.js` ถ้าแก้หน้าเพิ่มงาน
- [ ] `node --check admin-job-view-v2.js` ถ้าแก้ใบงานแอดมิน
- [ ] `node --check admin-*.js` ทุกไฟล์ที่แก้

## 2) Cache / PWA

ถ้าแก้ frontend JS:
- [ ] HTML ที่เรียกไฟล์นั้น bump `?v=...`
- [ ] `sw.js` bump `CACHE_NAME`
- [ ] `sw.js` ASSETS ใช้ path/version ใหม่
- [ ] มี console marker ระบุ version ใหม่
- [ ] ทดสอบ incognito หรือ clear PWA cache

## 3) Admin Add Job

- [ ] เพิ่มงานแบบเลือกช่างเดี่ยว A แล้วใบงานอยู่กับ A
- [ ] เปลี่ยนจาก B เป็น A ก่อน save แล้วสุดท้ายต้องเป็น A
- [ ] Auto mode ยังให้ระบบเลือกช่างได้
- [ ] Urgent mode ไม่ lock technician โดยตรง
- [ ] ล้างแอร์ผนัง + ล้างแขวนคอยล์ ไม่กลายเป็นแอร์แขวน
- [ ] หลายรายการในใบงานเดียวบันทึกถูก
- [ ] ราคาคำนวณถูก
- [ ] เวลางานคำนวณถูก

## 4) Admin Edit Job

- [ ] เปิดใบงานเก่าได้
- [ ] แก้รายการบริการได้เหมือนหน้าเพิ่มงาน
- [ ] เพิ่มหลายรายการได้
- [ ] ราคาเด้งอัตโนมัติ
- [ ] manual override แยกชัดเจน
- [ ] save แล้ว fetch กลับมาตรวจว่ารายการตรงกับที่เลือก
- [ ] ช่างที่เลือกไม่เปลี่ยนเป็นคนอื่น
- [ ] legacy/manual item ไม่ถูกแปลงมั่ว

## 5) Technician Job Flow

- [ ] ช่างเห็นงานที่ assigned ให้ตัวเอง
- [ ] ช่าง B ไม่เห็นงานของช่าง A
- [ ] รับงาน/หยุดรับงานด่วนยังทำงาน
- [ ] เช็คความพร้อมวันนี้ยังทำงาน
- [ ] ปิดงานปกติได้
- [ ] งานแก้ไขปิดตาม requirement ได้

## 6) Photos / Cloudinary

- [ ] nameplate upload ขึ้น Cloudinary
- [ ] before upload ขึ้น Cloudinary
- [ ] after upload ขึ้น Cloudinary
- [ ] cash transfer slip upload ขึ้น Cloudinary
- [ ] payment slip upload ขึ้น Cloudinary
- [ ] upload UI ไม่บังหน้าจอ
- [ ] ลบรูปแล้วลบ Cloudinary public_id ถ้า route รองรับ

## 7) Payments

- [ ] ลูกค้าจ่ายเงินสด: ต้องแนบสลิปช่างโอนเข้าบริษัทก่อนปิดงาน
- [ ] ลูกค้าสแกนจ่าย: ต้องแนบสลิปก่อนปิดงาน
- [ ] ลูกค้าจ่ายกับแอดมิน: ปิดงานได้โดยรอแอดมินอัปเดต
- [ ] สถานะจ่ายแล้วเกิดเฉพาะ flow ครบ

## 8) Payout / Income Safety

ถ้า task ไม่เกี่ยว payout:
- [ ] ไม่มี diff ใน partner rates
- [ ] ไม่มี diff ใน payout period logic
- [ ] ไม่มี auto-deduct
- [ ] ไม่มีการเปลี่ยน technician income calculation โดยไม่ตั้งใจ
