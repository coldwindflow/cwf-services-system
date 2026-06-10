CWF AI Office Brain v2 Step 1

สิ่งที่อยู่ใน ZIP นี้:
- server/ai-brain/cwf-complete-reply-brain-v2.0/  ไฟล์สมอง v2.0 จริง 34 ไฟล์
- server/aiBrainImportV30.js  ตัวแปลงไฟล์สมองเป็น ai_brain_items
- server/routes/adminAiOfficeBrainV30.js  route seed/import/export/list/context
- migrations/20260609_ai_brain_items_v30.sql  migration additive-only
- tools/mount-ai-office-brain-v2-step1.sh  script mount route เข้า index.js อย่างปลอดภัย

วิธีติดตั้ง:
1. แตก ZIP นี้ทับ root repo coldwindflow/cwf-services-system
2. รัน:
   bash tools/mount-ai-office-brain-v2-step1.sh .
3. commit/push ขึ้น GitHub หรือ deploy ผ่าน Render
4. หลัง deploy login admin แล้วเรียก:
   POST /admin/ai-office/brain/seed-cwf-v2
5. ตรวจ:
   GET /admin/ai-office/brain/items?q=แพง
   GET /admin/ai-office/brain/export

Rollback:
- ลบ mount line createAdminAiOfficeBrainV30Routes ใน index.js
- ลบไฟล์ที่เพิ่มใน ZIP นี้
- ไม่ต้อง drop ai_brain_items; ถ้าต้องปิดใช้งานให้ UPDATE public.ai_brain_items SET is_active=false WHERE source='cwf_brain_v2';

ข้อห้ามที่รักษาไว้:
- ไม่แก้ jobs/customers/payments/payouts
- ไม่ส่ง LINE อัตโนมัติ
- ไม่ expose OPENAI_API_KEY
- ใช้ read-only/draft-only กับ production data
