# CWF AI Office LINE live fix v3

แก้:
- `/admin/ai-office/connectors/status` ที่ขึ้น `Cannot GET`
- ให้ AI Office อ่าน LINE inbox จริงจาก `line_conversations` / `line_messages`
- ใส่ label กันแอดมินงงถ้าลูกค้าเป็นต่างชาติ เช่น `ลูกค้าต่างชาติ: John`
- ให้ `/ask` ดึง LINE context ล่าสุดเข้า prompt สำหรับ Admin/Sales/Ops/Content
- ปิด PIN ซ้ำหลัง admin login
- ให้ webhook สร้าง LINE table ก่อนเก็บข้อความ

วิธีใช้:
```bash
bash cwf-ai-office-line-live-fix-v3/tools/apply-ai-office-line-live-fix-v3.sh .
git add server/routes/adminAiOfficeReadOnly.js server/routes/lineWebhook.js
git commit -m "Fix AI Office LINE inbox status and foreign customer labels"
git push
```

จากนั้น redeploy Render แล้วเปิด:
`/admin/ai-office/connectors/status`
