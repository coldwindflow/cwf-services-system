# Manual Test Checklist

1. รัน script จาก root repo
   `bash cwf-ai-office-line-translation-fix-v2/tools/apply-ai-office-line-translation-fix-v2.sh .`

2. Commit + deploy Render

3. เปิดหลัง login admin:
   `/admin/ai-office/connectors/status`
   ต้องไม่ขึ้น Cannot GET

4. ส่ง LINE เข้า @cwfair:
   `Hello, my aircon is not cold. Can you check the price? 098xxxxxxx`

5. เปิด:
   `/admin/ai-office/line-inbox`
   ต้องมี conversation และถ้า OpenAI key พร้อม ควรมี field:
   - `is_foreign_customer: true`
   - `foreign_customer_label`
   - `last_message_thai_translation`
   - `last_message_text_for_admin`

6. ถาม Admin AI:
   `มีลูกค้า LINE ทักเข้ามาล่าสุดไหม ถ้ามีต่างชาติแปลไทยให้ด้วย`

Expected:
- AI ระบุชื่อ LINE ของลูกค้าต่างชาติ
- AI แสดงต้นฉบับ + แปลไทย
- AI ไม่บอกว่าส่งข้อความแล้ว
