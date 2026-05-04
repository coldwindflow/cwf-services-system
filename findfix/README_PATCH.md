FindFix updated app shell patch

สิ่งที่ปรับรอบนี้:
- ใส่โลโก้ FindFix จริงลงในหน้าแอพ
- เพิ่มไฟล์ asset: `findfix/assets/logo-findfix.png`
- ปรับหน้า Login ให้ดูเป็นแบรนด์มากขึ้น
- ปรับ Sidebar / Topbar ให้ใช้โลโก้จริง
- ปรับสไตล์โดยรวมให้ดูพรีเมียมและพร้อมต่อยอด
- ไม่แตะระบบ CWF เดิม และไม่ผูกฐานข้อมูลจริง

โครงสร้าง:
findfix/
  index.html
  app.css
  app.js
  assets/logo-findfix.png
  README_PATCH.md

วิธีวาง:
- นำโฟลเดอร์ `findfix/` ไปวางที่ root repo
- เข้าใช้งานที่ `/findfix/`
