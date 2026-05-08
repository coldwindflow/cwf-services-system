# CWF Source of Truth

เอกสารนี้กำหนดว่าแต่ละระบบต้องยึด logic จากที่ไหน ห้าม AI สร้าง logic ซ้ำมั่วเอง

## 1) App Architecture

- Backend entry: `index.js`
- Main database: PostgreSQL
- Static frontend: HTML + JS files
- PWA service worker: `sw.js`
- Technician frontend: `tech.html`, `app.js`
- Admin Add Job: `admin-add-v2.html`, `admin-add-v2.js`
- Admin Job View/Edit: `admin-job-view-v2.html`, `admin-job-view-v2.js`
- Shared admin common: `admin-v2-common.js`

## 2) Pricing Source of Truth

ห้าม frontend แต่ละหน้ามี pricing logic คนละชุด

Source of truth ต้องมาจาก backend pricing/preview logic ที่ใช้ร่วมกับ:
- Admin Add Job
- Public booking / pricing preview
- Admin Edit Job
- Job items generation

หลักสำคัญ:
- หน้าเพิ่มงานและหน้าแก้ไขใบงานต้องได้ราคาตรงกัน
- ถ้ามี endpoint preview อยู่แล้ว ให้ reuse
- ถ้าจำเป็นต้องเพิ่ม endpoint ให้ใช้ backend functions เดิม ไม่ hardcode แยกอีกชุด
- Manual override ต้องเป็น explicit override เท่านั้น ไม่ใช่ default flow

## 3) Service Line Model

ระบบงานบริการควรใช้ structured service lines เป็นหลัก ไม่ใช่ parse จาก `item_name`

Canonical service line:

```json
{
  "job_type": "ล้าง | ซ่อม | ติดตั้ง",
  "ac_type": "ผนัง | สี่ทิศทาง | แขวน | เปลือยใต้ฝ้า",
  "wash_variant": "ล้างธรรมดา | ล้างพรีเมียม | ล้างแขวนคอยล์ | ตัดล้างใหญ่",
  "repair_variant": "",
  "btu": 12000,
  "machine_count": 1,
  "assigned_technician_username": ""
}
```

## 4) Wall AC Coil-Hanging Rule

สำคัญมาก:

`ล้างแขวนคอยล์` หรือ `ล้างแขวนคอยน์` คือ **วิธีล้างของแอร์ผนัง**  
ไม่ใช่ `ac_type = แขวน`

ถูก:
- `job_type = ล้าง`
- `ac_type = ผนัง`
- `wash_variant = ล้างแขวนคอยล์`

ผิด:
- `ac_type = แขวน`
- `แอร์แขวน/ตั้งพื้น`

ห้าม infer ประเภทแอร์จากราคา 1,400

## 5) Technician Assignment Source of Truth

ถ้า Admin เลือกช่างจาก dropdown ที่มองเห็น:
- visible dropdown ต้องเป็น source of truth ตอน submit
- hidden input/state ต้อง sync ตาม visible dropdown
- stale `state.confirmed_tech_username` ห้าม override ค่าใหม่
- single mode ต้องส่ง `technician_username` ตรงกับ dropdown
- urgent/offer mode ต้องไม่ lock technician ตรง ๆ

หลัง save ควร fetch job กลับมาตรวจว่า technician ตรงกับที่เลือก

## 6) Admin Edit Job Requirement

หน้าแก้ไขใบงานต้องเป็น “Admin Add Job เวอร์ชันแก้ไขข้อมูลเดิม”

ต้องรองรับ:
- หลาย service lines
- งานล้าง / ซ่อม / ติดตั้ง
- ประเภทแอร์
- วิธีล้างเฉพาะแอร์ผนัง
- BTU
- จำนวนเครื่อง
- ราคาเด้งอัตโนมัติ
- ระยะเวลาเด้งอัตโนมัติ
- มอบหมายช่างหลัก / ช่างรายรายการตามที่ระบบรองรับ

ห้ามทำเป็นแค่ตารางกรอก `item_name / qty / unit_price` เป็น flow หลัก

## 7) Cloudinary Source of Truth

รูปหน้างานและสลิปต้องขึ้น Cloudinary เป็นหลัก

ENV ที่ต้องมี:
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Job photos ห้าม fallback ไป `/uploads` แบบเงียบ ๆ บน Render  
ถ้า Cloudinary ไม่พร้อม ให้ error ชัดเจน

## 8) Revisit / งานแก้ไข Source of Truth

งานแก้ไขคือ flow เฉพาะ ไม่ใช่งานปกติ

งานแก้ไข:
- ไม่ควรมีรายได้ช่างใหม่
- ไม่ควรเก็บเงินลูกค้าใหม่
- ไม่ต้องบังคับเนมเพลท
- ต้องมีรูปก่อนแก้ไข / หลังแก้ไข / รูปสาเหตุ
- ต้องมี cause party + reason
- ต้องมีประวัติให้แอดมินตรวจสอบ
- ถ้าช่างผิด แอดมินเปิดเคสหักเงินได้ แต่ห้าม auto-deduct โดยไม่ผ่าน flow อนุมัติ

## 9) Partner Payout Rule

ห้ามแก้ payout/income โดยไม่ถูกสั่งตรง ๆ

ถ้า task ไม่เกี่ยวกับ payout:
- ห้ามแตะ partner rate
- ห้ามแตะ payout period
- ห้ามแตะ technician income
- ห้าม auto-deduct
