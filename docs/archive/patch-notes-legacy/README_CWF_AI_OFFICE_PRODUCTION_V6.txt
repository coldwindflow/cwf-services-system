CWF AI Office Production V6

เป้าหมายรอบนี้:
- ขัด UX ของหน้า office map ให้ใช้งานจริงกว่าเดิม
- แก้ bubble บนหัวตัวละครให้อ่านเป็นบรรทัดปกติ ไม่แตกเป็นแนวตั้ง
- กระจายตำแหน่งตัวละครบนมือถือ ไม่ให้กองตรงกลางเกินไป
- ลดขนาดแถบเลือก AI ด้านล่างให้กินพื้นที่น้อยลง
- กดตัวละครแล้วเข้า full-screen chat ทันที
- เพิ่ม ambient office movement ให้ดูเหมือนทีม AI กำลังเดิน ทำงาน และประสานงานกันแบบเบา ๆ
- ยังไม่มี quick command และไม่มีปุ่มค้นเบอร์แยก ผู้ใช้พิมพ์ถามเองทั้งหมด
- ยังเป็น read-only ไม่เพิ่ม/แก้/ลบงาน ไม่เปลี่ยนสถานะ ไม่ส่ง LINE/SMS

ไฟล์ที่แก้:
- admin-ai-office.html
- admin-ai-office.js
- tools/apply-ai-office-production-v6.sh

วิธีลง:
1) แตก zip ในเครื่องหรือบน repo
2) จาก root repo รัน:
   bash cwf-ai-office-production-v6/tools/apply-ai-office-production-v6.sh .
3) commit + deploy Render
4) hard refresh /admin/ai-office

สิ่งที่ควรเช็กหลัง deploy:
- เข้า /admin/ai-office หลัง login admin ได้เลย
- summary card โหลดตัวเลขจริง
- bubble อ่านได้ ไม่แตกเป็นคำแนวตั้ง
- ตัวละครไม่กองตรงกลางมากเกินไปบนมือถือ
- กดตัวละครบน map แล้วเข้า chat เต็มจอ
- ถาม “วันนี้มีงานอะไรบ้าง” ได้
- ถามต่อ “งานไหนเสี่ยงสุด” ได้
- พิมพ์ “ค้นงานจากเบอร์ 098...” ได้

หมายเหตุ:
script ยัง patch backend ให้ไม่ต้องใช้ PIN ซ้ำหลัง admin login และเพิ่ม conversation_history เหมือน v5 ต่อไปด้วย
