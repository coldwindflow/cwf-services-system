# CWF AI — Final Price & Symptom Fix (สเปก a–k)

## ไฟล์ที่แก้ (5 ไฟล์ ตามที่อนุญาต)
```
server/aiOfficeCoreBrain.js                       ← แกนหลักของทุกข้อ
server/routes/adminAiOfficeLineDraftV27.js        ← + enforceRepairCheckReply
server/routes/adminAiOfficeTrainingCenterV35B.js  ← + enforceRepairCheckReply
server/aiTrainingAutoReplyV36.js                  ← + enforceRepairCheckReply
admin-ai-control-center.js                        ← (ไม่มีการแก้เพิ่มในรอบนี้)
```

## สิ่งที่แก้ตามสเปก

### 1. แยก "แขวนคอยล์" (แพ็กเกจ) ออกจาก "แอร์แขวน" (ชนิดแอร์)
- ลบ "แขวนคอยล์" ออกจาก text ก่อน detect aircon_type → ไม่ตีเป็น hanging อีก
- hanging ต้องเจอ "แอร์แขวน / ล้างแอร์แขวน / แขวนเพดาน" เท่านั้น
- "แขวนคอยล์ ราคา" ลอย ๆ → ตั้ง known.package_mentioned ไม่กำหนด type

### 2. wall AC ไม่มี BTU → คืน price_quote ทั้งสองกลุ่ม BTU
- ≤15,000: 550/790/1290/1850 · >15,000: 690/990/1550/2150
- มี count → คิด total ให้ทั้งสองกลุ่ม
- มีคำอธิบายแต่ละแพ็กเกจครบ แล้วถาม BTU เพื่อเลือก tier

### 3. ขยาย water leak detection
ครอบทุกวลี: น้ำหยด/น้ำแอร์หยด/แอร์มีน้ำหยด/แอร์มีน้ำรั่ว/แอร์รั่วน้ำ/น้ำแอร์ไหล/แอร์มีน้ำไหล/น้ำรั่วจากแอร์/แอร์น้ำรั่ว/แอร์น้ำหยด
→ intent = water_leak_cleaning, แนะนำแขวนคอยล์ก่อน, ไม่ตอบ 700

### 4. enforce ค่าตรวจซ่อม 700 (เพิ่ม enforceRepairCheckReply ใน core brain + 3 path)
- intent=repair_symptom + ถามราคา/ค่าตรวจ/ซ่อมเท่าไหร่ → บังคับตอบ 700 + หักลดค่าซ่อมได้
- ถ้า LLM ฟันธงอะไหล่ (คอมเพรสเซอร์/แผงวงจร/ฯลฯ เสีย) → แทนด้วยคำตอบมาตรฐาน (ไม่ฟันธง)
- ไม่ใช้กับน้ำหยด

### 5. water_leak_cleaning ขาดข้อมูล → guided_reply (ไม่ใช่ safe_reply)
- คำตอบยังโชว์ราคาได้ แต่ guard บอกว่ายังต้องการ BTU/count/location

## Definition of Done — ครบ
- ✅ node --check ผ่านทั้ง 5 ไฟล์
- ✅ เทสต์ a–k ผ่าน 11/11 + regression 3/3 = 14/14
- ✅ no_line_send:true ยังอยู่
- ✅ guard รันก่อน OpenAI (เช็ก can_answer ก่อน fetch ทั้ง 3 path)
- ✅ ไม่แตะ auth/payment/DB migration/env/booking/LINE real-send
