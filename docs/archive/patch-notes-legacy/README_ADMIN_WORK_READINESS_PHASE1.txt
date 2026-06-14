CWF Admin Work Readiness Phase 1

ไฟล์ที่แก้/เพิ่ม:
- index.js
- admin-dashboard-v2.html
- admin-dashboard-v2.js
- admin-work-readiness-v2.html
- admin-work-readiness-v2.js
- sw.js

สิ่งที่เพิ่ม:
1) เพิ่มหน้า Admin ใหม่: /admin-work-readiness-v2.html
   ชื่อหน้า: 👷 ความพร้อมช่าง

2) เพิ่มปุ่มทางเข้าจาก Admin Dashboard:
   👷 ความพร้อมช่าง

3) เพิ่ม API อ่านข้อมูลแบบ read-only:
   GET /admin/technicians/work-readiness?date=YYYY-MM-DD

4) หน้า Admin ดูได้:
   - ช่างทั้งหมด
   - ใครรับงานล่วงหน้าได้ในวันที่เลือก
   - ใครไม่รับงานล่วงหน้า
   - ใครมีงานอยู่แล้ว
   - ใครยังไม่ได้ตั้งค่าปฏิทิน
   - เวลา / งานสูงสุด / เครื่องสูงสุด / หมายเหตุ
   - พื้นที่รับงาน
   - ประเภทงานที่ตั้งไว้
   - เปิดปฏิทินรายเดือนรายช่างแบบอ่านอย่างเดียว

ขอบเขตสำคัญ:
- Phase นี้เป็น read-only visibility เท่านั้น
- ยังไม่ block การมอบหมายงาน
- ไม่แตะ flow งานด่วน
- ไม่แตะ pricing / payout / check-in / finalize / booking

วิธีติดตั้ง:
1) แตก ZIP
2) คัดลอกไฟล์ทั้งหมดไปทับ root repo
3) commit และ push ขึ้น main
4) รอ Render deploy
5) ปิด PWA/เปิดใหม่ หรือ refresh เพื่อรับ sw.js ใหม่

Checklist หลัง deploy:
1) เข้า Admin Dashboard
2) เห็นปุ่ม 👷 ความพร้อมช่าง
3) กดเข้า /admin-work-readiness-v2.html ได้
4) เลือกวันที่แล้วข้อมูลโหลด
5) การ์ดสรุปแสดงจำนวน
6) ตารางช่างแสดงสถานะ รับ/ไม่รับ/มีงาน/ยังไม่ตั้งค่า
7) กดดูปฏิทินรายเดือนแล้ว modal เปิดได้
8) หน้า Tech ปฏิทินเดิมยังใช้งานได้
9) ปุ่มเปิด/ปิดรับงานด่วนช่างยังใช้ flow เดิม

ตรวจ syntax แล้ว:
- node --check index.js
- node --check admin-dashboard-v2.js
- node --check admin-work-readiness-v2.js
- node --check sw.js
