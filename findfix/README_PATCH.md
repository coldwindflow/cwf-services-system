FindFix refreshed UI patch

สิ่งที่แก้รอบนี้:
- แก้ปัญหาโลโก้ใหญ่เกินและบัง layout
- สร้าง asset ใหม่จากโลโก้เดิม:
  - `assets/logo-findfix-clean.png` = โลโก้เต็มแบบพื้นหลังโปร่งใสและครอปให้กระชับ
  - `assets/logo-findfix-icon.png` = ไอคอนสำหรับ Sidebar / Topbar / Login pill
- ปรับโครงสร้างหน้า Login ใหม่ให้สวยและอ่านง่ายขึ้น
- ปรับขนาดโลโก้ในทุกจุดให้เหมาะสม โดยเฉพาะมือถือ
- ไม่แตะระบบ CWF เดิม และไม่ผูกฐานข้อมูลจริง

โครงสร้าง:
findfix/
  index.html
  app.css
  app.js
  assets/logo-findfix-clean.png
  assets/logo-findfix-icon.png
  README_PATCH.md

วิธีวาง:
- นำโฟลเดอร์ `findfix/` ไปวางที่ root repo
- เข้าใช้งานที่ `/findfix/`
