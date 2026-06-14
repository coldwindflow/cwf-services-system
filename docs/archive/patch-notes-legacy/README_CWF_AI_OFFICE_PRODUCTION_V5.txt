CWF AI Office Production v5

เป้าหมายรอบนี้:
- ใช้งานจริงบนมือถือและคอม
- เลือกตัวละคร AI จากหน้าออฟฟิศได้จริง
- เปิดแชทเต็มจอแบบ ChatGPT
- ไม่มีปุ่มคำสั่งด่วนให้รก
- ไม่มีปุ่มค้นเบอร์แยกให้รก
- ถ้าต้องการค้นเบอร์ ให้พิมพ์ถามเอง เช่น "ค้นงานจากเบอร์ 098xxxxxxx"
- ตัวละครในออฟฟิศต้องมีชีวิตขึ้น: เดิน ประจำจุด ทำงาน ประสานงาน และมี bubble สั้น ๆ
- แก้ backend ให้ admin login ครั้งเดียว ไม่ถาม PIN ซ้ำ
- เพิ่ม conversation_history เพื่อให้คุยต่อเนื่องได้เหมือนผู้ช่วยจริง

ไฟล์ในชุดนี้:
- admin-ai-office.html
- admin-ai-office.js
- tools/apply-ai-office-production-v5.sh
- README_CWF_AI_OFFICE_PRODUCTION_V5.txt

วิธีติดตั้งจาก root repo:
1) แตก zip
2) รันคำสั่ง:
   bash cwf-ai-office-production-v5/tools/apply-ai-office-production-v5.sh .
3) commit + deploy
4) เปิด /admin/ai-office แล้ว hard refresh

สิ่งที่ script ทำ:
- backup admin-ai-office.html/js เดิม
- วางไฟล์ frontend v5
- patch server/routes/adminAiOfficeReadOnly.js
  - ปิด PIN ซ้ำหลัง admin login
  - ให้ config ส่ง pin_required=false
  - เพิ่ม sanitizeConversationHistory
  - ปรับ buildGroundedPrompt ให้คุยต่อเนื่อง
  - ส่ง conversation_history เข้า OpenAI prompt
- bump service worker cache name ถ้ามี
- run node --check กับ frontend JS และ backend route

หลัง deploy ต้องทดสอบ:
[ ] login admin แล้วเข้า /admin/ai-office ได้เลย
[ ] ไม่ขึ้น AI_OFFICE_PIN_REQUIRED
[ ] status cards โหลดตัวเลขจริง
[ ] ตัวละครในแผนที่ขยับ/เดิน/ทำงาน/ประสานกัน
[ ] กดตัวละครบนแมพแล้วเข้าแชทเต็มจอ
[ ] กด chip ด้านล่างแล้วเข้าแชทเต็มจอ
[ ] ถาม "วันนี้มีงานอะไรบ้าง" ได้จากข้อมูลจริง
[ ] ถามต่อ "งานไหนเสี่ยงสุด" แล้วเข้าใจบริบท
[ ] ถาม "ค้นงานจากเบอร์ 098xxxxxxx" ได้
[ ] ปุ่มส่งเล็ก อ่านง่ายในมือถือ
[ ] กลับหน้าออฟฟิศได้
[ ] คอมใช้งานได้

ข้อห้ามที่ยังรักษาไว้:
- ไม่เพิ่มงาน
- ไม่แก้งาน
- ไม่ลบงาน
- ไม่เปลี่ยนสถานะงาน
- ไม่ส่ง LINE/SMS/email
- ไม่แก้ฐานข้อมูลจาก AI Office
- ไม่เอา OPENAI_API_KEY ไปไว้ frontend

ถ้ายังเห็น AI_OFFICE_PIN_REQUIRED หลังลงชุดนี้:
- แปลว่า backend patch ยังไม่ได้ deploy หรือยังไม่ได้รัน script
- ให้เช็ก server/routes/adminAiOfficeReadOnly.js ว่า requireAiOfficePin(_req) { return; } แล้วหรือยัง
- อีกทางแก้เร็วคือเอา AI_OFFICE_ACCESS_PIN ออกจาก Render Environment แล้ว redeploy
