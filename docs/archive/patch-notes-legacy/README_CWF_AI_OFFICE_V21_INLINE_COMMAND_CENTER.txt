CWF AI Office V21 - Inline Command Center

เป้าหมาย:
- ต่อจาก V20 โดยไม่ต้องอัป repo ก่อนหน้าเป็นลำดับ
- ลดปุ่มซ้อน/overlay ซ้อนหลายชั้น
- รวม AI Reply Control, Auto Safe, Approval, Playbook, Quality Dashboard ไว้บนหน้า AI Office หลัก
- ยังเก็บแผงขั้นสูง admin-ai-control-center.js ไว้สำหรับตั้งค่าละเอียด แต่ซ่อน floating button ไม่ให้รก

ไฟล์หลัก:
- admin-ai-office.html
- admin-ai-office.js
- admin-ai-control-center.js
- server/routes/adminAiOfficeControlCenter.js
- server/routes/lineWebhook.js
- migrations/20260611_ai_*.sql

วิธีใช้:
1) แตก ZIP ทับ repo root
2) commit/deploy Render
3) run migrations ตามระบบ deploy ปกติ
4) เปิด /admin-ai-office.html

ตรวจหลังอัป:
- ไม่เห็นปุ่ม floating control ซ้อนทับหน้า
- หน้า AI Office มี AI Reply Command Center
- ปุ่ม Auto Safe / Draft only / Pause all ใช้งานได้
- ปุ่มตั้งค่าขั้นสูงยังเปิด overlay ได้เมื่อจำเป็น

ข้อห้ามที่ยังคงไว้:
- AI ไม่เพิ่ม/แก้/ลบงานเอง
- เคสจองคิว ยืนยันช่าง ลดราคา เคลม ใบกำกับภาษี ต้องให้แอดมินจัดการ
- Auto Safe ส่งเองเฉพาะคำถามปลอดภัยและผ่าน Playbook/Quality Guard
