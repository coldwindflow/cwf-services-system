FindFix premium dashboard + accounting upgrade

สิ่งที่เพิ่ม/ปรับในรอบนี้:
- ปรับ Dashboard ให้ดูพรีเมียมขึ้น คล้ายแนวคิด CWF command center
- เพิ่มโมดูลใหม่: `งานบัญชี`
- เพิ่มเมนู `งานบัญชี` ใน FindFix sidebar
- เพิ่ม Accounting Control Room สำหรับแต่ละ Workspace
- เพิ่มสรุปรายได้, ค่าช่าง demo, ค่าใช้จ่าย demo, VAT 7%, หัก ณ ที่จ่าย 3%, กำไรสุทธิ demo
- เพิ่ม Document Center: ใบเสนอราคา, ใบรับเงิน/E-Receipt, ใบกำกับภาษี, ทวิ50 ช่าง
- เพิ่มปุ่มสร้างเอกสารบัญชีแบบ Demo และบันทึกลง Audit timeline
- เพิ่ม AI Operation Insight / Money Guard / Auto Tax Checklist เป็นฟีเจอร์ว้าวสำหรับต่อยอดจริง
- ใช้โลโก้ FindFix ใน Login, Sidebar, Topbar และ Dashboard hero
- ยังแยกจาก CWF เดิม 100% และใช้ localStorage เท่านั้น

โครงสร้างไฟล์:
findfix/
  index.html
  app.css
  app.js
  assets/logo-findfix.png
  README_PATCH.md

วิธีติดตั้ง:
1. เอาโฟลเดอร์ `findfix/` ไปวางที่ root repo
2. Deploy
3. เข้า `/findfix/`

หมายเหตุ:
- ถ้าเคยเปิดหน้า FindFix มาก่อนแล้วข้อมูลเก่าไม่เปลี่ยน ให้กด `รีเซ็ตข้อมูล Demo` ที่หน้า login หรือเคลียร์ localStorage key `findfix.v1.workspaces`
- แพตช์นี้ยังไม่แตะ database จริง และไม่แก้ route/index.js/admin-v2-common.js ของ CWF เดิม
