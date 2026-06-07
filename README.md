# CWF AI Office Customer Chat v14

แพ็กนี้เป็น patch สำหรับแก้แอพจริงใน repo CWF โดยไม่สร้าง mock/demo

## สิ่งที่แก้

1. ปุ่ม AI Office บนแถบเมนูจริงของแอดมิน
   - อยู่ข้างปุ่ม hamburger ใน topbar
   - ใช้ asset `assets/icons/cwf-ai-office-entry.png`
   - กดเข้า `/admin/ai-office`

2. กล่องแชทลูกค้าให้ใช้งานเหมือนแชทจริงมากขึ้น
   - เลือกลูกค้าแล้วระบบร่างคำตอบให้อัตโนมัติ
   - เพิ่มช่อง “ถาม AI สำหรับแชทนี้” ให้แอดมินพิมพ์ถามว่า “ควรตอบยังไง”
   - AI ตอบกลับเป็นข้อความพร้อมส่งลูกค้า
   - แอดมินคัดลอกไปส่ง LINE เอง

3. ข้อความส่งลูกค้าเป็นโทนแอดมินผู้หญิง
   - ภาษาไทยใช้ “ค่ะ / นะคะ” อย่างเป็นธรรมชาติ
   - ไม่ใช่รายงาน ไม่ใช่ bullet ไม่ใช่สรุปหลังบ้าน

4. คัดลอกเฉพาะข้อความส่งลูกค้า
   - ไม่ติดสรุป
   - ไม่ติดคำแปล
   - ไม่ติดข้อมูลที่ยังขาด
   - ไม่ติด next step

5. อัปเกรดบุคลิก AI แต่ละตำแหน่ง
   - Admin AI = Senior Admin Manager
   - Sales AI = Master Closer
   - Ops AI = Dispatch & Operations Commander
   - Ads AI = Elite Performance Marketer
   - Content AI = Creative Director
   - Dev AI = Senior Production Engineer
   - Office Chat = AI Chief of Staff

## วิธีลง

แตก ZIP ที่ root repo แล้วรัน:

```bash
bash cwf-ai-office-customer-chat-v14/tools/apply-cwf-ai-office-customer-chat-v14.sh .
```

จากนั้น commit/push:

```bash
git add admin-v2-common.js admin-ai-office.js admin-ai-office.html server/routes/adminAiOfficeReadOnly.js assets/icons/cwf-ai-office-entry.png
git commit -m "Improve AI Office topbar shortcut and customer chat replies"
git push
```

แล้วให้ Render deploy ใหม่

## ทดสอบหลัง deploy

- ทุกหน้าแอดมินต้องเห็นปุ่ม AI ข้าง hamburger บน topbar
- กดปุ่ม AI แล้วเข้า `/admin/ai-office`
- เข้า “กล่องแชทลูกค้า”
- เลือกลูกค้า 1 คน
- ระบบร่างข้อความให้อัตโนมัติ
- แอดมินพิมพ์ในช่อง “ถาม AI สำหรับแชทนี้” ได้
- กดคัดลอกแล้วได้เฉพาะข้อความส่งลูกค้า
- ข้อความไทยต้องเป็นโทนผู้หญิง เช่น ค่ะ / นะคะ
- ระบบยังไม่ส่ง LINE เอง
