FindFix real-usable mobile fix patch

รอบนี้แก้เพื่อให้ใช้งานได้จริงมากขึ้น โดยแก้ปัญหาหลักจากรอบก่อนที่หน้า Dashboard และมือถือแสดงผลเพี้ยนจาก class ที่ยังไม่มี CSS และมีการอ้าง asset โลโก้เก่าที่ใหญ่เกินไป

สิ่งที่แก้:
1) แก้การอ้างอิงโลโก้ใน dashboard hero
- เปลี่ยนจากไฟล์โลโก้เก่าขนาดใหญ่ เป็น `logo-findfix-icon.png`
- เพิ่ม cache busting `?v=3` ให้ css/js/logo

2) เพิ่ม CSS ที่ขาดสำหรับ component จริง
- command-hero
- command-logo
- wow-grid
- accounting-hero
- accounting-grid
- ledger-row
- doc-grid
- timeline-item
- signal-list
- accounting-score
- stat variants

3) ปรับมือถือ
- ลดขนาดโลโก้ใน dashboard hero
- จัด grid ให้ collapse เป็น 1 คอลัมน์บนจอเล็ก
- แก้กล่องข้อมูล/การ์ดให้ไม่ล้นและอ่านง่าย

4) ลบ asset โลโก้เก่าที่ทำให้สับสน
- ลบ `assets/logo-findfix.png`

ไฟล์ที่แก้:
- findfix/index.html
- findfix/app.css
- findfix/app.js
- findfix/assets/logo-findfix-clean.png
- findfix/assets/logo-findfix-icon.png
- findfix/README_PATCH.md

วิธีวาง:
- เอาโฟลเดอร์ `findfix/` ไปวางที่ root repo
- เข้าใช้งานที่ `/findfix/`
- ถ้าเบราว์เซอร์ยังค้าง cache ให้ hard refresh 1 ครั้ง
