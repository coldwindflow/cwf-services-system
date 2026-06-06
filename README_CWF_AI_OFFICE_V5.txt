CWF AI Office v5 Pixel Engine

ไฟล์นี้คือชุดแก้หน้า /admin/ai-office ให้เป็น canvas/grid based pixel-office engine

อัปขึ้น GitHub ตาม path เดิม:
- admin-ai-office.html
- admin-ai-office.js
- sw.js
- assets/ai-office-v5/agents.json
- assets/ai-office-v5/office-layout.json

หลักการ:
- ใช้ canvas วาดแผนที่ออฟฟิศ
- ตัวละคร 6 Agent เดินบน grid
- มี pathfinding เลี่ยงโต๊ะ
- มีสถานะ walking/thinking/talking/working
- มี Agent Manager เฉพาะ localStorage สำหรับแก้บทบาทในเครื่องนี้แบบไม่แตะฐานข้อมูล
- API งานจริงของ CWF ยังเป็น endpoint เดิม
- Phase 1 ยัง read-only
