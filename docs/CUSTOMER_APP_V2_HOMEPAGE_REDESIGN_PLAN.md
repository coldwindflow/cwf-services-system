# Customer App V2 Homepage Redesign Plan

Date: 2026-06-22
Status: Proposal only. Planning/design document. Do not implement runtime or schema changes from this plan without owner approval, per `docs/CUSTOMER_APP_V2_SPEC_LOCK_WITH_URGENT_BOOKING.md`.

## Request

ทำให้หน้าแรกของ Customer App สวยงาม ทันสมัย และดึงดูดให้ลูกค้าใช้บริการมากขึ้น โดยต้องมี:

- แบนเนอร์สไลด์ (hero banner slider) ที่แอดมินอัปโหลดรูปเองได้
- การเลือกบริการในรูปแบบ "สินค้า" (e-commerce style service catalog) พร้อมราคาเริ่มต้น

## Current State (from code audit)

- หน้าแรก (`customer-app/modules/ui.js` → `renderHome`) เป็น static hero ข้อความล้วน ไม่มีรูปภาพหรือสไลด์
- รายการบริการ (`commerceCategories`, `quickServices`, `cleaningMethods` ใน `customer-app/modules/services.js`) เป็น array ฮาร์ดโค้ดในไฟล์ JS ไม่มีรูปภาพ ไม่มีช่องให้แอดมินแก้ไขผ่านระบบ
- ตาราง `public.promotions` (จัดการผ่าน `admin-promotions-v2.html`) มีอยู่แล้วแต่ไม่มีคอลัมน์รูปภาพ/ลิงก์/ลำดับการแสดงผล — ใช้สำหรับส่วนลดเท่านั้น ไม่ใช่แบนเนอร์
- ไม่มีระบบอัปโหลดไฟล์รูปสำหรับหน้าลูกค้าในระบบปัจจุบัน (ต้องตรวจสอบ object storage ที่มีอยู่ เช่นที่ใช้กับ media-retention ก่อนออกแบบ endpoint อัปโหลด)
- ทุก endpoint สาธารณะที่เกี่ยวกับ booking/pricing/tracking ถูกล็อกห้ามแก้ตาม spec lock — ฟีเจอร์นี้ไม่แตะส่วนนั้น แต่เป็น "ของใหม่" ทั้งหมด จึงต้องผ่าน owner approval ก่อน (ห้าม migration เอง, ห้ามเพิ่ม business logic ใหม่ใน `index.js`)

## Decisions Already Made By Owner

- แบนเนอร์: แอดมินอัปโหลดไฟล์รูปเข้าระบบจริง (ไม่ใช่แค่วาง URL ภายนอก) → ต้องมี storage/upload endpoint
- การ์ดบริการแบบสินค้า: แสดง "ราคาเริ่มต้น" บนการ์ดเลย (เช่น "เริ่มต้น 500 บาท") โดยคำนวณจากค่าที่ถูกที่สุดของ BTU/จำนวนเครื่องที่ระบบมีอยู่
- ขอบเขตรอบนี้: วางแผน/ออกแบบเอกสารเท่านั้น ยังไม่ลงมือเขียนโค้ด

## Homepage Layout Proposal (top to bottom)

1. **Hero Banner Slider**
   - ภาพเต็มความกว้าง, autoplay 4-5 วินาที, swipe ได้บนมือถือ, จุดบอกตำแหน่ง (dots), หยุด autoplay เมื่อแถบอยู่นอกจอ (performance)
   - แต่ละสไลด์: รูปภาพ (อัปโหลดจริง), หัวข้อ/คำโปรย (optional overlay text), ปุ่ม CTA ที่ลิงก์ไปยัง route ในแอป (เช่น `#scheduled`, `#urgent`, หรือบริการเฉพาะ) หรือลิงก์ภายนอก (โปรโมชัน LINE OA)
   - แอดมินกำหนด: ลำดับการแสดง (sort_order), ช่วงวันที่แสดงผล (active_from/active_to), เปิด/ปิดสไลด์ (is_active)
   - Fallback: ถ้าไม่มีสไลด์ที่ active เลย ให้ใช้ hero ข้อความเดิมเป็น fallback (ไม่ให้หน้าแรกพังถ้าแอดมินยังไม่ตั้งค่า)

2. **Quick Action Shortcuts** (ของเดิม ปรับเป็นไอคอนกลมเด่นขึ้น)
   - จองล้างแอร์ / คิวด่วน / ติดตามงาน / ติดต่อ CWF

3. **Service Catalog ("เลือกบริการ" แบบสินค้า)**
   - แทนปุ่มเดิมด้วยการ์ดสไตล์สินค้า: รูปภาพบริการ, ชื่อบริการ, ราคาเริ่มต้น, ป้ายสถานะ ("จองได้ทันที" สีเขียว / "ติดต่อแอดมิน" สีเทา), ปุ่มกดเลือก
   - บริการที่ `bookable: true` (ล้างแอร์) แสดงราคาเริ่มต้นจริงจากระบบคำนวณราคาที่มีอยู่ (`pricing.js` / preview endpoint เดิม) — ไม่เปลี่ยนตรรกะราคา แค่ดึงมาแสดงผล
   - บริการที่ `bookable: false` (ซ่อม/ติดตั้ง/ย้าย/ตรวจอาการ) ไม่แสดงราคา แสดง "ติดต่อแอดมินเพื่อประเมิน" แทนเสมอ — ห้ามให้ดูเหมือนจองสำเร็จ

4. **บริการล้างที่เลือกบ่อย (Quick Services)** — ของเดิม ปรับการ์ดให้มีรูปภาพ + ราคาเริ่มต้น เหมือนข้อ 3

5. **โปรโมชันปัจจุบัน** — carousel เล็กแยกจาก hero banner ใช้ข้อมูลจาก `promotions` (ถ้าจะมีรูปต้องเพิ่มคอลัมน์ image_url ในตารางเดียวกัน หรือใช้ภาพจาก hero banner ที่ลิงก์โปรโมชันนั้น)

6. **มาตรฐานบริการ (Trust section)** — ของเดิม

7. **พื้นที่ให้บริการ** — ของเดิม

8. **บัญชี/ติดต่อ** — ของเดิม

## New Technical Components Required (for future implementation phase)

| Component | Description | Needs owner approval for |
|---|---|---|
| `home_banners` table (proposed) | columns: `banner_id`, `image_url`, `title`, `cta_label`, `cta_target` (route or URL), `sort_order`, `is_active`, `active_from`, `active_to`, `created_at` | New DB migration |
| Banner upload endpoint | Accepts image upload, stores file, returns `image_url`. Must reuse existing object storage infra if present (needs audit of what `admin-media-retention-v2` uses) | New backend route module (not in `index.js`) |
| `GET /home/banners` (public) | Returns active banners ordered by `sort_order`, filtered by active date range | New public endpoint, read-only |
| `admin-banners-v2.html` | New admin page: list/add/edit/delete/reorder banners, upload image, set schedule | New admin file |
| Service catalog images | Add `image_url` per service kind. Likely a small new table (`service_catalog_items`) so admin can manage images without code deploys, instead of hardcoding in `services.js` | New DB table + admin UI, or interim: static asset files keyed by service id (no DB change, faster but not admin-editable) |
| Starting price display | Reuse existing pricing calculation (no new pricing logic) — compute min price across existing BTU/machine-count options client-side or via a lightweight read-only aggregation endpoint | Read-only endpoint only, no pricing logic changes |

## Two Implementation Options For Service Images

**Option A — Static assets (no DB change, faster, not admin-editable)**
- Put images in `customer-app/assets/services/*.jpg`, reference by service id in `services.js`.
- Pros: no migration, no upload infra needed, ships fast.
- Cons: admin cannot change images without a code deploy — does not fully satisfy "แอดมินใส่รูปเองได้" for service cards (though that requirement was stated specifically for the banner, not necessarily the service catalog).

**Option B — Admin-managed via new table (matches "admin can manage images" spirit fully)**
- New `service_catalog_items` table + admin UI, same upload mechanism as banners.
- Pros: fully admin-editable, consistent with banner system.
- Cons: needs migration + new admin page, more work, more owner approval needed.

Recommendation: Build the **banner upload system first** (explicitly requested), use **Option A static assets for the service catalog initially** since only 3-6 service kinds rarely change, and revisit Option B later if the owner wants frequent visual updates to the catalog without deploys.

## Open Decisions Needed From Owner Before Implementation

1. Confirm new DB table `home_banners` is approved (requires a migration — forbidden to run without explicit approval per spec lock).
2. Confirm where uploaded banner images are stored (existing object storage vs. new setup) — need infra audit first.
3. Confirm whether service catalog images should be static assets (Option A, fast) or admin-managed (Option B, more work) for this round.
4. Confirm "ราคาเริ่มต้น" wording/rounding rules (e.g., "เริ่มต้น 500 บาท" vs. exact lowest computed price) so it matches existing pricing display conventions used elsewhere in the app.
5. Confirm max number of banner slides and recommended image aspect ratio for design consistency across devices.
6. Confirm whether banner CTA can link to external URLs (e.g., LINE OA) or must stay in-app only, for security/consistency review.

## Phasing (to be appended to `docs/CUSTOMER_APP_V2_IMPLEMENTATION_PLAN.md` if approved)

- **Phase H0 (this doc):** Design/plan only. No code.
- **Phase H1:** Frontend-only redesign of `renderHome` with static placeholder banner (1 fallback slide) and service catalog cards using Option A static images + existing pricing preview for "starting price." No DB changes, no new endpoints.
- **Phase H2 (needs approval):** `home_banners` table + upload endpoint + `admin-banners-v2.html`, wired into `renderHome` slider, with Phase H1 hero as fallback when no active banners exist.
- **Phase H3 (optional, later):** Migrate service catalog from static assets to admin-managed `service_catalog_items` if the owner wants frequent visual changes without deploys.

## Forbidden / Out Of Scope (carried over from spec lock)

- No DB migrations until owner approves H2 design.
- No new business logic in `index.js`; any new banner/catalog endpoints go in a separate route module.
- No changes to `/public/book`, `/public/availability_v2`, `/public/pricing_preview`, `/public/track`.
- No change to booking confirmation wording or urgent booking semantics.
- No payment/accounting/tax/payout/receipt logic changes.
