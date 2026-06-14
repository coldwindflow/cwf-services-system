# CWF Technician Work Calendar & Daily Readiness v2

## ไฟล์ที่แก้
- `index.js`
- `app.js`
- `tech.html`

## สิ่งที่เพิ่ม
1. ระบบปฏิทินรับงานช่างรายเดือน
   - ช่างตั้งค่าได้ทั้งเดือนว่า วันไหนทำงาน / หยุด / รับงานล่วงหน้า / รับเฉพาะงานด่วน
   - ตั้งช่วงเวลาเริ่ม-เลิกงาน จำนวนงานต่อวัน และจำนวนเครื่องต่อวันได้
   - มีคู่มือใน modal พร้อมไอคอนอิโมจิให้ช่างอ่านเองได้

2. ระบบพร้อมทำงานวันนี้
   - ถ้าวันนั้นช่างมีงาน จะมีการ์ด “พร้อมทำงานวันนี้” ในหน้า Tech
   - ช่างกด ✅ พร้อมทำงาน หรือ ⚠️ ไม่พร้อมพร้อมเหตุผล
   - Backend มีตาราง `technician_daily_readiness` สำหรับให้แอดมินตรวจติดตามได้

3. ปุ่มเปิดรับงานวันนี้แบบ auto reset
   - เมื่อกดเปิดรับงาน จะมี `accept_status_expires_at` ถึงเที่ยงคืน Bangkok
   - เมื่อโหลดสถานะหลังหมดอายุ ระบบ auto reset เป็น `paused`
   - มี log ใน `technician_accept_status_log`

4. งานที่รับได้ UI ใหม่
   - ปรับ modal “งานที่รับได้” ให้สวย อ่านง่าย แยกหมวดชัดเจน
   - รองรับ ล้าง / ซ่อม / ติดตั้ง
   - รองรับแอร์ผนัง / สี่ทิศทาง / แขวนตั้งพื้น / เปลือยใต้ฝ้า
   - แอร์ผนังมีวิธีล้าง 4 แบบ: ธรรมดา / พรีเมียม / แขวนคอยล์ / ตัดล้างใหญ่

## ตารางใหม่ที่เพิ่มอัตโนมัติใน ensureSchema
- `company_holidays`
- `technician_monthly_work_calendar`
- `technician_daily_readiness`
- `technician_accept_status_log`

## คอลัมน์ใหม่ใน technician_profiles
- `accept_status_expires_at`
- `last_daily_ready_at`

## API ใหม่
- `GET /tech/work-calendar?month=YYYY-MM`
- `PUT /tech/work-calendar/day`
- `PUT /tech/work-calendar/bulk`
- `GET /tech/daily-readiness/today`
- `POST /tech/daily-readiness`
- `GET /admin/technician-readiness/today`

## จุดที่ตั้งใจไม่ลบเพื่อกันระบบอื่นพัง
- `weekly_off_days`
- `technician_workdays_v2`
- `technician_special_slots_v2`
- `technician_service_matrix`
- route เดิมของ workdays และ service matrix

ระบบใหม่เป็นแกนหลักของ UI แล้ว ส่วนของเดิมเหลือเป็น fallback / compatibility เพื่อลด regression.
