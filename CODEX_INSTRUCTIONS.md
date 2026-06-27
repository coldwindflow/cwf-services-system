# CWF Codex Instructions

> เอกสารนี้คือกติกาหลักสำหรับ AI/Codex ทุกครั้งก่อนแก้ระบบ CWF  
> ถ้าคำสั่งผู้ใช้ขัดกับเอกสารนี้ ให้หยุดและรายงานก่อนแก้

## 1) Production Safety Rules

CWF เป็นระบบใช้งานจริง ห้ามแก้แบบทดลองหรือ rewrite กว้าง ๆ

ทุกงานต้องทำแบบ:
- Minimal targeted change
- Regression-safe
- Preserve existing route/file/function names
- No unrelated refactor
- No cleanup แถม
- No framework rewrite
- No “แก้เผื่อ” ถ้าไม่อยู่ใน scope

ถ้าจำเป็นต้องแตะระบบนอก scope ให้หยุดแล้วรายงานก่อน coding

## 2) Required Workflow Before Coding

ก่อนแก้ทุกครั้ง ต้อง trace flow ปัจจุบันก่อน:

1. UI รับค่าจาก element/state ไหน
2. Payload ส่ง field อะไร
3. Backend route ไหนรับ
4. Database บันทึก column/table ไหน
5. หน้าแสดงผลอ่าน field ไหน
6. Cache/PWA ต้อง bump ไหม
7. มี regression risk ตรงไหน

ห้ามเดา root cause

## 3) One Task Rule

ถ้า user ส่งหลายเรื่อง ให้แยกเป็น backlog ก่อน  
ห้ามแก้ทุกเรื่องพร้อมกัน ยกเว้น user ยืนยันว่าให้ทำเป็น phase เดียว

ลำดับ priority:
- P0: งานจริงพัง / assign ผิดคน / ปิดงานไม่ได้ / เงินผิด
- P1: ข้อมูลใบงาน ราคา รายการบริการผิด
- P2: UX ที่ทำให้ใช้งานยาก
- P3: งานสวยงาม / polish

## 4) Frontend Cache Rule

ถ้าแก้ไฟล์ `.js` ที่ถูกโหลดจาก HTML:
- ต้อง bump query string ใน HTML เช่น `?v=YYYYMMDD_feature_vX`
- ต้อง bump `CACHE_NAME` ใน `sw.js`
- ต้อง update ASSETS ใน `sw.js` ให้ตรงกับ version ใหม่
- ต้องเพิ่ม console marker เช่น `[admin-job-view] feature vX loaded`

ห้ามบอกว่าเสร็จถ้าไม่ได้ทำ cache busting

## 5) Testing Rule

ก่อนส่งงาน ต้องทำอย่างน้อย:
- `node --check <changed-js-file>`
- ตรวจ `git diff` ว่าเปลี่ยนเฉพาะไฟล์ที่ตั้งใจ
- Manual test checklist ตาม flow งานจริง
- ถ้าเป็น save flow ให้ fetch กลับมาตรวจผลหลัง save ถ้าทำได้

## 6) Deliverables

ทุกครั้งต้องส่ง:
- Commit hash หรือ PR
- Changed-files-only ZIP
- สรุปภาษาไทย:
  - root cause
  - files changed
  - routes changed
  - DB changed
  - cache bumped หรือไม่
  - tests performed
  - risks
  - rollback notes

## Active hotfix handoff

Fix Customer Store product-detail content missing for the same Catalog item. Trace one exact item_id from Admin load/save through GET /catalog/items/:itemId and renderDetailContent. Do not use sibling content inheritance. Full scope is in the Draft PR conversation; remove this temporary section before finalizing the PR.