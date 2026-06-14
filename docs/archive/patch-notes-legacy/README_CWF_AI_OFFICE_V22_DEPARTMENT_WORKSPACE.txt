CWF AI Office V22 - Department Workspace

สรุป:
- ต่อจาก V21 โดยไม่ต้องอัป V21 ก่อน ใช้ไฟล์นี้ทับ repo ได้เลย
- เพิ่ม Department Workspace แบบ inline สำหรับสั่งงาน AI แต่ละแผนกบนหน้า AI Office หลัก
- ปุ่มการ์ดแผนก/คำสั่งด่วนจะไม่เปิดแชท overlay เป็นหลักแล้ว แต่เลื่อนไปทำงานใน workspace เดียว
- ยังเก็บแชทแบบเต็มไว้เป็นปุ่มสำรองสำหรับกรณีต้องใช้
- ไม่แก้ฐานข้อมูล ไม่ส่ง LINE เองจาก workspace และไม่กระทบ backend กว้าง

ไฟล์หลัก:
- admin-ai-office.html
- admin-ai-office.js
- admin-ai-control-center.js
- server/routes/adminAiOfficeControlCenter.js
- server/routes/lineWebhook.js
- migrations V12-V19
