# CWF AI Office Practical Admin UX v13

แก้ตาม production scope:

- ปุ่ม AI Office อยู่บนแถบเมนูจริง ข้างปุ่ม hamburger ไม่ใช่อยู่แค่ใน drawer menu
- ใช้ไอคอน AI ที่แนบเป็น asset จริง: `/assets/icons/cwf-ai-office-entry.png`
- กล่องแชทลูกค้าเลือกแชทแล้วร่างคำตอบให้อัตโนมัติ
- หน้าหลักแสดงเฉพาะ `customer_reply`
- ปุ่มคัดลอกคัดลอกเฉพาะข้อความตอบลูกค้า ไม่ติดสรุป/คำแปล/ข้อมูลขาด
- ซ่อนรายละเอียดแอดมินไว้ใน `ดูรายละเอียดสำหรับแอดมิน`
- เพิ่ม prompt/sanitizer/fallback ให้ AI ตอบธรรมชาติขึ้น ไม่ใช่รายงานยาว
- อัปเกรด Agent roles เป็นระดับ expert เฉพาะตำแหน่ง

## วิธีใช้

แตก zip ที่ root repo แล้วรัน:

```bash
bash cwf-ai-office-practical-admin-ux-v13/tools/apply-cwf-ai-office-practical-admin-ux-v13.sh .
```

จากนั้น commit/push:

```bash
git add admin-v2-common.js admin-ai-office.js admin-ai-office.html server/routes/adminAiOfficeReadOnly.js assets/icons/cwf-ai-office-entry.png
git commit -m "Improve AI Office topbar entry and customer reply quality"
git push
```

แล้วให้ Render deploy ใหม่

## เช็กหลัง deploy

- ทุกหน้าแอดมินที่ใช้ admin-v2-common.js ต้องมีปุ่ม AI ข้าง hamburger บนแถบเมนู
- กดปุ่ม AI แล้วเข้า `/admin/ai-office`
- กล่องแชทลูกค้าเลือกแชทแล้วร่างคำตอบเอง
- คัดลอกแล้วได้เฉพาะข้อความส่งลูกค้า
- ไม่มีการส่ง LINE เอง
- `/line/webhook` ยัง verify ได้
