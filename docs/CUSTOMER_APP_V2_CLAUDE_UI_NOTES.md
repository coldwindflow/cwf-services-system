# Customer App V2 — Claude UI/UX Redesign Notes

รอบนี้เป็นการ **redesign ชั้นการแสดงผล (presentation layer)** ของ Customer App V2
ให้ดูพรีเมียมระดับแอพบริการปี 2026 โดย **ไม่แตะ business logic / API contract**
ที่ Codex ทำไว้ และ **ไม่แตะไฟล์ backend / protected** ใด ๆ

## หลักการที่ยึด (Safety-first)
- ไม่แก้ `index.js`, `customer.html`, `track.html`, `sw.js`, backend routes ทั้งหมด
  (ตรวจด้วย checksum แล้วว่าไฟล์เหล่านี้ไม่เปลี่ยน)
- คง `booking_mode: "scheduled"` ใน `api.js` และ payload builder
- คง `/public/book` payload contract เดิมทุก field (ไม่เพิ่ม/ลบ key)
- คงการ disabled ของคิวด่วน — `submitUrgentRequest()` ยัง return `{ disabled: true }`
- คง validation, double-submit guard, success/error state machine ของ scheduled booking
- ไม่ redirect / ไม่แตะ `track.html` เดิม และไม่เปลี่ยน `/public/track` behavior
- ไม่ได้ merge, ไม่ได้ deploy, ไม่ได้สร้าง booking จริง
  (พรีวิวทั้งหมด render ผ่าน mock API ภายในเครื่องเท่านั้น)

## ไฟล์ที่แก้ (ทั้งหมดอยู่ใน customer-app/)
1. `assets/customer-app.css` — เขียน design system ใหม่ทั้งไฟล์
2. `modules/utils.js` — เพิ่ม helper `icon()` (inline SVG) และ `progressRing()` (visual only)
3. `modules/ui.js` — อัปเกรด markup ของ action cards (Home) + trust grid ให้ใช้ไอคอน
4. `modules/services.js` — เพิ่ม key `glyph` ให้ primaryActions / trustItems (ข้อมูล ไม่ใช่ logic)
5. `modules/bookingUrgent.js` — ใส่ progress ring ใน waiting room (คงข้อความบังคับเป๊ะ)

ไฟล์ logic หลัก (`bookingScheduled.js`, `tracking.js`, `profile.js`, `auth.js`,
`api.js`, `state.js`, `router.js`) **ไม่ถูกแก้** — UI ใหม่ได้มาจาก CSS + helper ที่ใช้ร่วมกัน
และ markup เดิมที่ผูก `data-*` hook ไว้แล้ว

## Design system ใหม่
- โทนแบรนด์ CWF: deep navy `#06182f`, royal blue `#1659e0`, cobalt `#3d8bff`,
  yellow `#ffd23b`, white/soft surfaces
- การ์ดมุมโค้ง (radius 22px), เงานุ่ม, gradient ใช้อย่างพอดี
- ปุ่มหลักเป็น gradient CTA สูง 54px แตะง่าย
- ไอคอนเป็น inline SVG stroke-based (คมทุก DPI, เปลี่ยนสีตาม currentColor)
- bottom nav ใช้ไอคอนเส้น 4 เมนูชัด (หน้าแรก / จองคิว / ติดตาม / บัญชี) พร้อม active state
- มี motion เบา ๆ: screen fade-in + stagger, ปุ่มกดหด, success badge เด้ง, pulse / progress ring
- เคารพ `prefers-reduced-motion`

## สรุปการออกแบบรายหน้า
1. **Home** — hero พรีเมียม + trust pill, การ์ด CTA หลัก (จองคิว) เป็น gradient เด่น,
   ตามด้วยติดตามงาน / โทร-LINE, แล้ว services / โปรโมชัน / พื้นที่บริการ / trust grid
2. **Booking mode** — 2 การ์ดแยกชัด (แถบน้ำเงิน = จองล่วงหน้า, แถบทอง = คิวด่วน)
   เข้าใจใน 3 วินาที + คำเตือนคิวด่วนคงเดิม
3. **Scheduled** — เปลี่ยนจากฟอร์มยาวเป็น guided wizard: stepper ด้านบน,
   การ์ดข้อมูลแยกเป็นสัดส่วน, ราคาเป็น price card gradient, slot เป็น chip เลือกได้,
   review card ชัดเจน, success state อุ่นใจ (เครื่องหมายถูกเด้ง), error สุภาพ
4. **Urgent waiting room** — progress ring + pulse ให้รู้สึกว่าระบบทำงานจริง,
   step cards, status pills, ปุ่มส่งจริงยัง disabled, คงข้อความบังคับเป๊ะ ๆ
5. **Tracking** — pill รหัสงาน gradient, data rows อ่านง่าย, timeline 2 ชุด
   (จองล่วงหน้า / คิวด่วน) จุดสีบอกสถานะ — ไม่ยุ่ง track เดิม
6. **Profile** — ไม่ใช่หน้าว่าง: hero + guest panel, login รอง, saved address,
   history chip, support actions

## คุณภาพที่ตรวจแล้ว
- ไม่มี horizontal overflow ที่ 390px และ 360px (ตรวจทุกหน้า)
- ข้อความไทยไม่ถูกตัด
- `node --check` ผ่านทุกไฟล์ JS + index.js
- ไม่มีคำว่า stub / placeholder / phase / mock โผล่ใน UI ลูกค้า

## ข้อจำกัด / งาน polish รอบหน้าที่แนะนำ
- ปุ่มโทร / LINE และปุ่ม login ยัง `disabled` (รอ phase auth / contact จริง)
- wizard ยังเป็น single-scroll พร้อม stepper บอกตำแหน่ง — ถ้าต้องการ
  อาจทำเป็น multi-step จริง (ทีละ step) ในรอบถัดไป โดยไม่ต้องแตะ logic
- progress ring / countdown ของคิวด่วนเป็น visual loop (ยังไม่ต่อเวลา dispatch จริง
  ตามข้อกำหนดที่ห้ามเปิด urgent)
- ยังไม่ได้เพิ่ม web font ไทย (ใช้ system Thai font stack) — ถ้าต้องการลุคเฉพาะ
  แบรนด์ยิ่งขึ้น แนะนำฝัง Noto Sans Thai / IBM Plex Sans Thai ภายหลัง

---

# อัปเดต: แก้ Urgent Booking Flow ให้ถูก + ยกระดับพรีเมียม

## ปัญหาเดิม
หน้าคิวด่วนแสดง progress ring / waiting room ทันทีที่เข้า — เหมือนระบบกำลังหาช่าง
ก่อนลูกค้ากรอกข้อมูล ซึ่งผิด business flow

## Flow ที่แก้ใหม่ (form-first)
1. เข้าหน้าคิวด่วน → เริ่มที่ **ฟอร์มกรอกข้อมูล** เสมอ (ไม่ใช่ waiting room)
   - ชื่อ / เบอร์ / ที่อยู่ / maps_url / โซน / ประเภทบริการ / ชนิดแอร์ / BTU /
     จำนวนเครื่อง / อาการ — **ไม่มีการเลือกวันเวลาแบบ scheduled**
2. กด "ตรวจสอบคำขอคิวด่วน" → ผ่าน validation → หน้า **review** สรุปคำขอ
3. กด "ส่งคำขอคิวด่วน" (confirm) เท่านั้น → จึงเข้า **waiting room**
4. waiting room แสดงข้อความ partner-first ที่บังคับไว้ครบ
5. เข้าหน้าคิวด่วนใหม่ทุกครั้ง → reset กลับไปที่ฟอร์ม

partner-first = "หลังจากลูกค้าส่งคำขอแล้ว" ไม่ใช่ก่อนกรอกข้อมูล ✅

## State machine
เพิ่ม `state.urgentFlow = { step: "form"|"review"|"waiting" }` + setter `setUrgentFlow()`
และ urgent draft fields ใน `state.draft.urgent`

## ลูกเล่น/เอฟเฟกต์พรีเมียมที่เพิ่ม (CSS)
- **Aurora hero**: gradient เคลื่อนไหว + ดาวกระพริบใน hero คิวด่วน
- **Flow rail 3 step**: bullet เด้ง, เส้นเชื่อมเปลี่ยนเป็นเขียวเมื่อผ่าน
- **Shine button**: แสงวิ่งผ่านปุ่มหลัก
- **Radar/sonar partner search** (เฉพาะ waiting room): วงกวาดหมุน, ping ขยาย,
  core ⚡ เต้น, blip ช่างกระพริบ — สื่อว่า "กำลังกระจายคำขอหาช่าง"
- **Status stack**: ไอคอน + จุด pending กระพริบ
- card entrance animation ต่อ step + เคารพ `prefers-reduced-motion`

## ความปลอดภัย
- urgent dispatch ยัง **disabled** — โมดูลคิวด่วนไม่เรียก network/dispatch ใด ๆ,
  ปุ่มส่งจริงยัง disabled, confirm แค่พา UI ไป waiting room (mock/skeleton)
- ข้อความบังคับ "ส่งคำขอคิวด่วนแล้ว..." ยังอยู่ครบเป๊ะ
- ไม่แตะ scheduled / tracking / protected files
# Codex update: service taxonomy and pricing safety

This follow-up keeps the Customer App V2 changes inside the safe frontend scope for PR #38.

## What changed
- Added shared frontend service taxonomy data in `customer-app/modules/services.js`.
- Scheduled booking now lets customers choose service type, AC type, wall-wash variant, BTU, and machine count.
- Urgent booking captures the same service structure, but still does not submit or dispatch urgent jobs.
- Wall AC cleaning shows exactly four options:
  - `ล้างธรรมดา` displayed as `ล้างปกติ`
  - `ล้างพรีเมียม`
  - `ล้างแขวนคอยล์` displayed as `ล้างแบบแขวนคอยล์`
  - `ล้างแบบตัดล้าง` displayed as `ตัดล้างใหญ่`
- Non-wall AC types do not force wall-only cleaning variants.
- Unknown AC type or unknown BTU is shown as admin-estimate only and cannot submit as a priced scheduled booking.

## Pricing source
- Customer App V2 does not add a separate price book.
- Customer App V2 does not hardcode a final customer price.
- Scheduled price preview still uses only the existing `/public/pricing_preview` endpoint.
- Scheduled submit still uses the existing `/public/book` wrapper with `booking_mode: "scheduled"`.

## Safety notes
- `index.js`, `customer.html`, `track.html`, `sw.js`, backend routes, migrations, payment, tax, receipt, and accounting logic remain unchanged.
- Urgent dispatch remains disabled.
- Repair, install, inspect, unknown AC, and unknown BTU are treated as admin-estimate cases until owner/backend pricing policy is approved.
