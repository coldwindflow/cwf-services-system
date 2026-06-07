# CWF AI Office LINE Reading + Foreign Customer Translation Fix v2

แพ็กนี้แก้ปัญหา:
- `/admin/ai-office/connectors/status` ขึ้น `Cannot GET`
- AI Office ยังไม่ดึง LINE OA inbox เข้าไปในคำตอบ
- LINE tables อาจยังไม่ถูกสร้างตอนมีข้อความเข้า
- ลูกค้าต่างชาติพิมพ์ LINE แล้วแอดมินอ่านยาก

สิ่งที่แพ็กนี้ทำ:
- เพิ่ม endpoint `/admin/ai-office/connectors/status` ใน route ที่มีอยู่แล้ว
- ให้ `/admin/ai-office/line-inbox` อ่านแชท LINE จริงจาก `line_conversations`
- ให้ `/admin/ai-office/line-conversations/:id/messages` อ่านข้อความจริงจาก `line_messages`
- ถ้าข้อความลูกค้าเป็นภาษาต่างประเทศ ระบบจะเพิ่ม field แปลไทยให้แอดมิน พร้อมกำกับชื่อ LINE ของลูกค้า
- ให้ `/admin/ai-office/ask` แนบ LINE inbox ล่าสุดเข้า context ของ Admin/Sales/Ops/Content AI
- ปิด PIN ซ้ำหลัง admin login
- ทำให้ webhook สร้างตาราง LINE อัตโนมัติก่อนเก็บข้อความเข้า DB

ยังคง Phase 1 read-only:
- ไม่ส่ง LINE เอง
- ไม่สร้างงาน
- ไม่แก้งาน
- ไม่เปลี่ยนสถานะ
- ไม่ปรับแอด
