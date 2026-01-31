/**
 * CWF Backend (Express) - FIXED
 * - รวมทุก route ให้ถูกต้อง (แก้ syntax/วงเล็บหลุด/โค้ดแทรกกลางบรรทัด)
 * - รองรับ: booking_code CWF+7, public booking/track, forced/offer, accept_status, attendance,
 *          docs quote/receipt, profile requests, photos, checkin
 */

try {
  require("dotenv").config();
} catch (e) {
  console.warn("⚠️ dotenv not installed or failed to load:", e.message);
}

// =======================================
// 🕒 TIMEZONE (Fix: เวลาเพี้ยน +7 ชม.)
// - Server (เช่น Render) มักใช้ UTC
// - แต่ระบบ CWF ใช้เวลาไทย (Asia/Bangkok)
// - ตั้งค่า TZ ให้ Node เพื่อให้การ format เวลาในฝั่ง server ตรง
// =======================================
process.env.TZ = process.env.TZ || "Asia/Bangkok";

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const https = require("https");
const crypto = require("crypto");
const multer = require("multer");

const pool = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

// =======================================
// 📣 LINE OA (optional)
// =======================================
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";

function pushLineMessage(lineUserId, text) {
  return new Promise((resolve) => {
    if (!LINE_CHANNEL_ACCESS_TOKEN || !lineUserId) return resolve(false);

    const body = JSON.stringify({
      to: lineUserId,
      messages: [{ type: "text", text: String(text || "").slice(0, 900) }],
    });

    const req = https.request(
      {
        hostname: "api.line.me",
        path: "/v2/bot/message/push",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (resp) => {
        resp.on("data", () => {});
        resp.on("end", () => resolve(true));
      }
    );

    req.on("error", () => resolve(false));
    req.write(body);
    req.end();
  });
}

async function notifyTechnician(username, text) {
  try {
    const r = await pool.query(
      `SELECT line_user_id FROM public.technician_profiles WHERE username=$1`,
      [username]
    );
    const lineUserId = r.rows[0]?.line_user_id || null;
    await pushLineMessage(lineUserId, text);
  } catch (_) {
    // ignore
  }
}

// =======================================
// 📷 UPLOADS CONFIG
// =======================================
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// =======================================
// 🧱 DB SCHEMA ENSURE (AUTO)
// =======================================
async function ensureSchema() {
  try {
    // 1) attendance
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.technician_attendance (
        attendance_id BIGSERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        clock_in_at TIMESTAMPTZ,
        clock_out_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_attendance_username_created ON public.technician_attendance(username, created_at DESC)`
    );

    // 2) jobs: booking token + source + dispatch_mode + duration_min + customer_note + booking_code
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS booking_token TEXT`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS job_source TEXT DEFAULT 'admin'`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS dispatch_mode TEXT DEFAULT 'offer'`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS duration_min INT DEFAULT 60`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS customer_note TEXT`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS booking_code TEXT`);

    // 2.1) jobs: maps_url / job_zone / travel_started_at / started_at / finished_at / canceled_at / final_signature_*
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS maps_url TEXT`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS job_zone TEXT`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS travel_started_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS cancel_reason TEXT`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS final_signature_path TEXT`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS final_signature_status TEXT`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS final_signature_at TIMESTAMPTZ`);

    // 2.2) jobs: check-in lat/lng + checkin_at (บางฐานเดิมยังไม่มี)
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS checkin_latitude DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS checkin_longitude DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS checkin_at TIMESTAMPTZ`);

    // 2.3) jobs: customer review fields (ใช้แสดงใน Tracking + โปรไฟล์ช่าง)
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS customer_rating INT`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS customer_review TEXT`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS customer_complaint TEXT`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`);

    // 2.4) jobs: งานตีกลับ (ช่างคืนงานให้แอดมิน) - เก็บไว้เพื่อ audit
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS return_reason TEXT`);
        await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS returned_by TEXT`);

    // 2.5) jobs: การชำระเงิน (จ่ายเงิน + แนบสลิป)
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS paid_by TEXT`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid'`);


    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_booking_code_unique ON public.jobs(booking_code)`
    );

    // backfill booking_code
    await pool.query(`
      UPDATE public.jobs
      SET booking_code = 'CWF' || LPAD(job_id::text, 7, '0')
      WHERE booking_code IS NULL
    `);

    // 3) technician_profiles: line_user_id + accept_status + accept_status_updated_at
    await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS line_user_id TEXT`);
    await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS accept_status TEXT DEFAULT 'ready'`);
    await pool.query(
      `ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS accept_status_updated_at TIMESTAMPTZ`
    );

    // 3.3) technician_profiles: เบอร์โทร (ใช้แสดงให้ลูกค้า "หลังเริ่มเดินทาง" เท่านั้น)
    await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS phone TEXT`);


    // 3.1) technician_profiles: preferred_zone (โซนที่รับงาน)
    // 3.2) ✅ บังคับชนิดคอลัมน์ทีมช่างให้เป็น TEXT (กัน error inconsistent types)
// - โปรเจกต์เก่าบางชุด technician_team อาจเป็น INT ทำให้ UPDATE แบบใช้ username (TEXT) พัง
await pool.query(`
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='jobs' AND column_name='technician_team'
        AND data_type <> 'text'
    ) THEN
      ALTER TABLE public.jobs ALTER COLUMN technician_team TYPE TEXT USING technician_team::text;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='jobs' AND column_name='technician_username'
        AND data_type <> 'text'
    ) THEN
      ALTER TABLE public.jobs ALTER COLUMN technician_username TYPE TEXT USING technician_username::text;
    END IF;
  END$$;
`);

// 3.3) ✅ ตาราง catalog / promotions / job_items / job_promotions / job_offers (สร้างถ้ายังไม่มี)
await pool.query(`
  CREATE TABLE IF NOT EXISTS public.catalog_items (
    item_id BIGSERIAL PRIMARY KEY,
    item_name TEXT NOT NULL,
    item_category TEXT NOT NULL CHECK (item_category IN ('service','product')),
    base_price NUMERIC(12,2) DEFAULT 0,
    unit_label TEXT DEFAULT 'รายการ',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS public.promotions (
    promo_id BIGSERIAL PRIMARY KEY,
    promo_name TEXT NOT NULL,
    promo_type TEXT NOT NULL CHECK (promo_type IN ('percent','amount')),
    promo_value NUMERIC(12,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS public.job_items (
    job_item_id BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES public.jobs(job_id) ON DELETE CASCADE,
    item_id BIGINT NULL REFERENCES public.catalog_items(item_id),
    item_name TEXT NOT NULL,
    qty NUMERIC(12,2) DEFAULT 1,
    unit_price NUMERIC(12,2) DEFAULT 0,
    line_total NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_job_items_job_id ON public.job_items(job_id)`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS public.job_promotions (
    job_id BIGINT PRIMARY KEY REFERENCES public.jobs(job_id) ON DELETE CASCADE,
    promo_id BIGINT NOT NULL REFERENCES public.promotions(promo_id),
    applied_discount NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS public.job_offers (
    offer_id BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES public.jobs(job_id) ON DELETE CASCADE,
    technician_username TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired')),
    offered_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_job_offers_tech_status ON public.job_offers(technician_username, status)`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_job_offers_job_id ON public.job_offers(job_id)`);


// 3.4) ✅ รูปภาพหน้างาน (job_photos)
await pool.query(`
  CREATE TABLE IF NOT EXISTS public.job_photos (
    photo_id BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES public.jobs(job_id) ON DELETE CASCADE,
    phase TEXT NOT NULL,
    mime_type TEXT,
    original_name TEXT,
    file_size BIGINT,
    photo_type TEXT DEFAULT 'job',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    uploaded_at TIMESTAMPTZ,
    storage_path TEXT,
    public_url TEXT
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_job_photos_job_id ON public.job_photos(job_id)`);

// 3.5) ✅ ทีมช่างหลายคนต่อ 1 งาน (job_team_members)
await pool.query(`
  CREATE TABLE IF NOT EXISTS public.job_team_members (
    job_id BIGINT NOT NULL REFERENCES public.jobs(job_id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (job_id, username)
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_job_team_members_user ON public.job_team_members(username)`);

// 3.6) ✅ คำขอแก้ไขราคา/รายการ (ช่าง -> แอดมินอนุมัติ)
await pool.query(`
  CREATE TABLE IF NOT EXISTS public.job_pricing_requests (
    request_id BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES public.jobs(job_id) ON DELETE CASCADE,
    requested_by TEXT NOT NULL,
    payload_json JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    decided_by TEXT,
    admin_note TEXT
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_job_pricing_requests_status ON public.job_pricing_requests(status, created_at DESC)`);

// 3.7) ✅ รีวิวลูกค้า (ผูกกับ job_id) -> คำนวณ rating ช่าง
await pool.query(`
  CREATE TABLE IF NOT EXISTS public.technician_reviews (
    review_id BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES public.jobs(job_id) ON DELETE CASCADE,
    technician_username TEXT NOT NULL,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review_text TEXT,
    complaint_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_technician_reviews_job_unique ON public.technician_reviews(job_id)`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_technician_reviews_tech ON public.technician_reviews(technician_username, created_at DESC)`);


    // 4) position check constraint: เพิ่ม founder_ceo
    await pool.query(`ALTER TABLE public.technician_profiles DROP CONSTRAINT IF EXISTS technician_profiles_position_check`);
    await pool.query(`
      ALTER TABLE public.technician_profiles
      ADD CONSTRAINT technician_profiles_position_check
      CHECK (position = ANY (ARRAY['junior'::text,'senior'::text,'lead'::text,'founder_ceo'::text]))
    `);
  } catch (e) {
    console.warn("⚠️ ensureSchema warning:", e.message);
  }
}
ensureSchema();

// =======================================
// 🧮 Helper: pricing
// =======================================
function calcPricing(items, promo) {
  const safeItems = Array.isArray(items) ? items : [];
  const subtotal = safeItems.reduce((sum, it) => {
    const qty = Number(it.qty || 0);
    const price = Number(it.unit_price || 0);
    const line = Math.max(0, qty) * Math.max(0, price);
    return sum + line;
  }, 0);

  let discount = 0;
  if (promo) {
    const v = Number(promo.promo_value || 0);
    if (promo.promo_type === "percent") discount = subtotal * (Math.max(0, v) / 100);
    if (promo.promo_type === "amount") discount = Math.max(0, v);
  }

  const total = Math.max(0, subtotal - discount);
  return {
    subtotal: Number(subtotal.toFixed(2)),
    discount: Number(discount.toFixed(2)),
    total: Number(total.toFixed(2)),
  };
}

// =======================================
// 🕒 Helper: normalize/format เวลาไทย
// - แก้เคส "เลือก 11:00 แต่แสดง 18:00" (server UTC + input ไม่มี timezone)
// - หลักการ: ถ้าค่า input ไม่มี timezone ให้ถือว่าเป็นเวลาไทย (+07:00)
// =======================================
function normalizeAppointmentDatetime(input) {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;

  // 1) มี timezone อยู่แล้ว (Z หรือ +07:00)
  if (/[zZ]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) return s;

  // 2) รูปแบบจาก <input type="datetime-local">: YYYY-MM-DDTHH:mm
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
    return `${s}:00+07:00`;
  }

  // 3) บางที่อาจส่งมาเป็น "YYYY-MM-DD HH:mm" หรือมีวินาที
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) {
    const t = s.replace(" ", "T");
    const withSec = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t) ? `${t}:00` : t;
    return `${withSec}+07:00`;
  }

  // 4) fallback: ให้ JS ลอง parse แล้วแปลงเป็น ISO (UTC)
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return s;
}

function formatBangkokDateTime(input) {
  try {
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return "-";

    // รูปแบบ: dd/mm/yyyy HH:mm
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return "-";
  }
}

// =======================================
// 🔢 Booking code / token / accept-status helpers
// =======================================
function genToken(len = 10) {
  return crypto.randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len);
}
// ✅ Booking Code (สุ่ม ไม่เรียงตาม job_id)
// - รูปแบบ: CWF + 7 ตัว (ตัวอักษร/ตัวเลขที่อ่านง่าย)
// - ไม่ใช้ O/0 และ I/1 เพื่อลดสับสนเวลาพูด/พิมพ์
function makeRandomBookingCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ตัด I,O,0,1
  let out = "";
  for (let i = 0; i < 7; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return `CWF${out}`;
}

// ✅ สุ่มจนกว่าจะไม่ซ้ำ (พึ่ง unique index booking_code ใน DB ช่วยกันซ้ำชั้นสุดท้าย)
async function generateUniqueBookingCode(client) {
  for (let i = 0; i < 12; i++) {
    const code = makeRandomBookingCode();
    const r = await client.query(
      `SELECT 1 FROM public.jobs WHERE booking_code=$1 LIMIT 1`,
      [code]
    );
    if (!r.rows.length) return code;
  }
  // ถ้าเกิด rare-case ชนซ้ำติด ๆ กัน ให้ fallback เป็น token
  return `CWF${genToken(10).toUpperCase()}`;
}
async function isTechReady(username) {
  if (!username) return false;
  try {
    const r = await pool.query(
      `SELECT COALESCE(accept_status,'ready') AS accept_status
       FROM public.technician_profiles
       WHERE username=$1
       LIMIT 1`,
      [username]
    );
    const st = (r.rows[0]?.accept_status || "ready").toString().toLowerCase();
    return st !== "paused";
  } catch (_) {
    return true; // fallback
  }
}

// =======================================
// ✅ TEST DB
// =======================================
app.get("/test-db", async (req, res) => {
  try {
    const r = await pool.query("SELECT NOW() as now");
    res.json({ ok: true, now: r.rows[0].now });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "db connection failed" });
  }
});

// =======================================
// 🔐 LOGIN
// =======================================
app.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  try {
    const r = await pool.query(
      `SELECT username, role FROM public.users WHERE username=$1 AND password=$2`,
      [username, password]
    );
    if (r.rows.length === 0) return res.status(401).json({ error: "ชื่อผู้ใช้หรือรหัสผ่านผิด" });
    res.json({ username: r.rows[0].username, role: r.rows[0].role });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

// =======================================
// 👷 USERS: technicians list (legacy)
// =======================================
app.get("/users/technicians", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT username FROM public.users WHERE role='technician' ORDER BY username`
    );
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "โหลดรายชื่อช่างไม่สำเร็จ" });
  }
});

// =======================================
// 📦 CATALOG
// =======================================
app.get("/catalog/items", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT item_id, item_name, item_category, base_price, unit_label, is_active
      FROM public.catalog_items
      WHERE is_active = TRUE
      ORDER BY item_category, item_name
    `);
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "โหลดรายการสินค้า/บริการไม่สำเร็จ" });
  }
});

app.post("/catalog/items", async (req, res) => {
  const { item_name, item_category, base_price, unit_label } = req.body || {};
  if (!item_name) return res.status(400).json({ error: "กรอกชื่อรายการ" });

  const category = (item_category || "service").toLowerCase();
  if (!["service", "product"].includes(category)) {
    return res.status(400).json({ error: "item_category ต้องเป็น service หรือ product" });
  }

  try {
    const r = await pool.query(
      `
      INSERT INTO public.catalog_items (item_name, item_category, base_price, unit_label)
      VALUES ($1,$2,$3,$4)
      RETURNING item_id
      `,
      [item_name.trim(), category, Number(base_price || 0), (unit_label || "รายการ").trim()]
    );
    res.json({ success: true, item_id: r.rows[0].item_id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "เพิ่มรายการไม่สำเร็จ" });
  }
});

// =======================================
// 🎁 PROMOTIONS
// =======================================
app.get("/promotions", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT promo_id, promo_name, promo_type, promo_value
      FROM public.promotions
      WHERE is_active = TRUE
      ORDER BY promo_name
    `);
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "โหลดโปรโมชั่นไม่สำเร็จ" });
  }
});

app.post("/promotions", async (req, res) => {
  const { promo_name, promo_type, promo_value } = req.body || {};
  if (!promo_name) return res.status(400).json({ error: "กรอกชื่อโปร" });

  const type = (promo_type || "").toLowerCase();
  if (!["percent", "amount"].includes(type)) {
    return res.status(400).json({ error: "promo_type ต้องเป็น percent หรือ amount" });
  }

  try {
    const r = await pool.query(
      `
      INSERT INTO public.promotions (promo_name, promo_type, promo_value)
      VALUES ($1,$2,$3)
      RETURNING promo_id
      `,
      [promo_name.trim(), type, Number(promo_value || 0)]
    );
    res.json({ success: true, promo_id: r.rows[0].promo_id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "เพิ่มโปรไม่สำเร็จ" });
  }
});

// =======================================
// 📋 JOBS: admin list all
// =======================================
app.get("/jobs", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        job_id, booking_code, booking_token, job_source, dispatch_mode,
        customer_name, customer_phone, job_type, appointment_datetime,
        job_status, job_price, paid_at, paid_by, payment_status, address_text,
        gps_latitude, gps_longitude, air_type, air_quantity,
        technician_team, technician_username, created_at,
        maps_url, job_zone,
        travel_started_at, started_at, finished_at, canceled_at, cancel_reason,
        checkin_at,
        technician_note, technician_note_at,
        final_signature_path, final_signature_status, final_signature_at
      FROM public.jobs
      ORDER BY created_at DESC
    `);
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "โหลดข้อมูลงานไม่สำเร็จ" });
  }
});

// =======================================
// ➕ ADD JOB (admin)
// =======================================
app.post("/jobs", async (req, res) => {
  const {
    customer_name,
    customer_phone,
    job_type,
    appointment_datetime,
    job_price,
    address_text,
    gps_latitude,
    gps_longitude,
    technician_username,
    items,
    promotion_id,
    dispatch_mode,
  } = req.body || {};

  // ✅ FIX TIMEZONE: ถ้ามีการส่งวันนัดมา ให้ normalize เป็นเวลาไทยก่อนบันทึก
  const appointment_dt =
    appointment_datetime === undefined || appointment_datetime === null || appointment_datetime === ""
      ? null
      : normalizeAppointmentDatetime(appointment_datetime);

  if (!customer_name || !job_type || !appointment_dt || !technician_username) {
    return res.status(400).json({ error: "กรอกข้อมูลไม่ครบ (ชื่อลูกค้า/ประเภทงาน/วันนัด/ช่าง)" });
  }

  const safeItems = Array.isArray(items) ? items : [];

  const mode = (dispatch_mode || "offer").toString().toLowerCase().trim();
  if (!["offer", "forced"].includes(mode)) {
    return res.status(400).json({ error: "dispatch_mode ต้องเป็น offer หรือ forced" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let promo = null;
    if (promotion_id) {
      const pr = await client.query(
        `SELECT promo_id, promo_name, promo_type, promo_value FROM public.promotions WHERE promo_id=$1 AND is_active=TRUE`,
        [promotion_id]
      );
      promo = pr.rows[0] || null;
    }

    const pricing = safeItems.length
      ? calcPricing(safeItems, promo)
      : { subtotal: Number(job_price || 0), discount: 0, total: Number(job_price || 0) };

    const jobInsert = await client.query(
      `
      INSERT INTO public.jobs
      (customer_name, customer_phone, job_type, appointment_datetime, job_price, address_text,
       gps_latitude, gps_longitude,
       technician_team, technician_username, job_status,
       job_source, dispatch_mode)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'admin',$12)
      RETURNING job_id
      `,
      [
        customer_name,
        customer_phone || "",
        job_type,
        appointment_dt,
        pricing.total,
        address_text || "",
        gps_latitude ? Number(gps_latitude) : null,
        gps_longitude ? Number(gps_longitude) : null,
        // technician_team: ใส่เฉพาะกรณี forced (บังคับงาน)
        mode === "forced" ? technician_username : null,
        // technician_username: คนที่แอดมินเลือกส่งงาน (จำเป็นเสมอ)
        technician_username,
        "รอดำเนินการ",
        mode,
      ]
    );

    const job_id = jobInsert.rows[0].job_id;

    // ✅ booking_code (สุ่ม ไม่เรียง)
    const booking_code = await generateUniqueBookingCode(client);
    await client.query(`UPDATE public.jobs SET booking_code=$1 WHERE job_id=$2`, [booking_code, job_id]);

    // job_items
    for (const it of safeItems) {
      const item_name = (it.item_name || "").trim();
      if (!item_name) continue;

      const qty = Math.max(0, Number(it.qty || 0));
      const unit_price = Math.max(0, Number(it.unit_price || 0));
      const line_total = qty * unit_price;

      await client.query(
        `
        INSERT INTO public.job_items (job_id, item_id, item_name, qty, unit_price, line_total)
        VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [job_id, it.item_id || null, item_name, qty, unit_price, line_total]
      );
    }

    if (promo && safeItems.length) {
      await client.query(
        `
        INSERT INTO public.job_promotions (job_id, promo_id, applied_discount)
        VALUES ($1,$2,$3)
        `,
        [job_id, promo.promo_id, pricing.discount]
      );
    }

    // offer (เฉพาะ mode=offer)
    let offer_id = null;
    let expires_at = null;

    if (mode === "offer") {
      const ready = await isTechReady(technician_username);
      if (!ready) throw new Error("ช่างคนนี้กดหยุดรับงานอยู่ (ถ้าจะยัดให้ทำ ใช้โหมด forced)");

      const offerR = await client.query(
        `
        INSERT INTO public.job_offers (job_id, technician_username, status, expires_at)
        VALUES ($1,$2,'pending', NOW() + INTERVAL '10 minutes')
        RETURNING offer_id, expires_at
        `,
        [job_id, technician_username]
      );
      offer_id = offerR.rows[0].offer_id;
      expires_at = offerR.rows[0].expires_at;
    }

    await client.query("COMMIT");

    // notify
    if (mode === "forced") {
      notifyTechnician(
        technician_username,
        `📌 มีงานใหม่ (บังคับ) ${booking_code} นัด: ${formatBangkokDateTime(appointment_dt)}`
      );
    } else {
      notifyTechnician(technician_username, `📨 มีข้อเสนองานใหม่ ${booking_code} (กดรับภายใน 10 นาที)`);
    }

    res.json({
      success: true,
      job_id,
      booking_code,
      dispatch_mode: mode,
      offer_id,
      expires_at,
      pricing,
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: e.message || "เพิ่มงานไม่สำเร็จ" });
  } finally {
    client.release();
  }
});

// =======================================
// 🧲 ASSIGN JOB (admin) - offer / forced
// =======================================
app.put("/jobs/:job_id/assign", async (req, res) => {
  const job_id = Number(req.params.job_id);
  const { technician_username, mode } = req.body || {};
  const m = (mode || "offer").toString().toLowerCase().trim();

  if (!job_id) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });
  if (!technician_username) return res.status(400).json({ error: "ต้องระบุ technician_username" });
  if (!["offer", "forced"].includes(m)) return res.status(400).json({ error: "mode ต้องเป็น offer หรือ forced" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE public.jobs
       SET technician_username=$1::text,
           technician_team = CASE WHEN $2::text='forced' THEN $1::text ELSE technician_team END,
           dispatch_mode=$2::text
       WHERE job_id=$3`,
      [technician_username, m, job_id]
    );

    let offer = null;
    if (m === "offer") {
      const ready = await isTechReady(technician_username);
      if (!ready) throw new Error("ช่างคนนี้กดหยุดรับงานอยู่ (ถ้าจะยัดให้ทำ ใช้โหมด forced)");

      const offerR = await client.query(
        `
        INSERT INTO public.job_offers (job_id, technician_username, status, expires_at)
        VALUES ($1,$2,'pending', NOW() + INTERVAL '10 minutes')
        RETURNING offer_id, expires_at
        `,
        [job_id, technician_username]
      );
      offer = offerR.rows[0];
    } else {
      // ✅ set ทั้ง technician_username + technician_team (กันหน้าช่าง/Tracking มองคนละคอลัมน์)
    await client.query(
      `UPDATE public.jobs
       SET technician_username=$1,
           technician_team=$1
       WHERE job_id=$2`,
      [technician_username, job_id]
    );

    // ✅ เพิ่มเป็นสมาชิกทีมของงาน (ไว้รองรับหลายช่าง)
    await client.query(
      `INSERT INTO public.job_team_members (job_id, username)
       VALUES ($1,$2)
       ON CONFLICT (job_id, username) DO NOTHING`,
      [job_id, technician_username]
    );
    }

    await client.query("COMMIT");

    if (m === "forced") {
      notifyTechnician(technician_username, `📌 มีงานใหม่ (บังคับ) งาน #${job_id}`);
    } else {
      notifyTechnician(technician_username, `📨 มีข้อเสนองานใหม่ งาน #${job_id} (กดรับภายใน 10 นาที)`);
    }

    res.json({ success: true, mode: m, offer });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: e.message || "assign ไม่สำเร็จ" });
  } finally {
    client.release();
  }
});

// =======================================
// 👨‍🔧 JOBS: technician sees only own jobs
// =======================================
app.get("/jobs/tech/:username", async (req, res) => {
  const { username } = req.params;
  try {
    const r = await pool.query(
      `
      SELECT
        job_id, booking_code, booking_token, job_source, dispatch_mode,
        customer_name, customer_phone, job_type, appointment_datetime,
        job_status, job_price, paid_at, paid_by, payment_status, address_text,
        gps_latitude, gps_longitude, air_type, air_quantity,
        technician_team, technician_username, created_at,
        maps_url, job_zone,
        travel_started_at, started_at, finished_at, canceled_at, cancel_reason,
        checkin_at,
        technician_note, technician_note_at,
        final_signature_path, final_signature_status, final_signature_at,
        checkin_latitude, checkin_longitude, checkin_at,
        technician_note, technician_note_at
      FROM public.jobs
      WHERE technician_team=$1
         OR EXISTS (
            SELECT 1 FROM public.job_team_members tm
            WHERE tm.job_id = public.jobs.job_id AND tm.username=$1
         )
         OR (technician_username=$1 AND COALESCE(dispatch_mode,'') <> 'offer')
ORDER BY appointment_datetime ASC
      `,
      [username]
    );
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "โหลดงานไม่สำเร็จ" });
  }
});

// =======================================
// 🛠️ ADMIN: EDIT JOB (แก้ไขข้อมูลใบงาน) + CANCEL JOB
// - ใช้ตอนลูกค้ากรอกข้อมูลไม่ตรงรูปแบบ / แอดมินอยากแก้ไข
// =======================================
app.put("/jobs/:job_id/admin-edit", async (req, res) => {
  const job_id = Number(req.params.job_id);
  if (!job_id) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });

  const {
    customer_name,
    customer_phone,
    job_type,
    appointment_datetime,
    address_text,
    customer_note,
    maps_url,
    job_zone,
    gps_latitude,
    gps_longitude,
  } = req.body || {};

  // ✅ FIX TIMEZONE: ถ้ามีการแก้วันนัด ให้ normalize เป็นเวลาไทยก่อนบันทึก
  const appointment_dt =
    appointment_datetime === undefined || appointment_datetime === null || appointment_datetime === ""
      ? null
      : normalizeAppointmentDatetime(appointment_datetime);

  try {
    await pool.query(
      `
      UPDATE public.jobs
      SET customer_name = COALESCE($1, customer_name),
          customer_phone = COALESCE($2, customer_phone),
          job_type = COALESCE($3, job_type),
          appointment_datetime = COALESCE($4, appointment_datetime),
          address_text = COALESCE($5, address_text),
          customer_note = COALESCE($6, customer_note),
          maps_url = COALESCE($7, maps_url),
          job_zone = COALESCE($8, job_zone),
          gps_latitude = COALESCE($9, gps_latitude),
          gps_longitude = COALESCE($10, gps_longitude)
      WHERE job_id=$11
      `,
      [
        customer_name ?? null,
        customer_phone ?? null,
        job_type ?? null,
        appointment_dt,
        address_text ?? null,
        customer_note ?? null,
        maps_url ?? null,
        job_zone ?? null,
        gps_latitude ?? null,
        gps_longitude ?? null,
        job_id,
      ]
    );
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "แก้ไขใบงานไม่สำเร็จ" });
  }
});



// =======================================
// 🎁 ADMIN: SET/CLEAR PROMOTION (เพิ่ม/ลบโปร เฉพาะแอดมิน)
// - promo_id: ส่งเป็นเลขโปร หรือส่ง null/"" เพื่อ "ลบโปร"
// =======================================
app.post("/jobs/:job_id/admin-set-promo", async (req, res) => {
  const job_id = Number(req.params.job_id);
  if (!job_id) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });

  const promo_id_raw = req.body?.promo_id;
  const promo_id = promo_id_raw === null || promo_id_raw === "" || promo_id_raw === undefined ? null : Number(promo_id_raw);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (!promo_id) {
      // ลบโปร
      await client.query(`DELETE FROM public.job_promotions WHERE job_id=$1`, [job_id]);
    } else {
      // เช็คโปรมีจริงและ active
      const pr = await client.query(
        `SELECT promo_id FROM public.promotions WHERE promo_id=$1 AND is_active=TRUE LIMIT 1`,
        [promo_id]
      );
      if (!pr.rows.length) throw new Error("ไม่พบโปรโมชั่น หรือโปรถูกปิดใช้งาน");

      // upsert
      await client.query(
        `
        INSERT INTO public.job_promotions (job_id, promo_id, applied_discount)
        VALUES ($1,$2,0)
        ON CONFLICT (job_id) DO UPDATE SET promo_id=EXCLUDED.promo_id, created_at=NOW()
        `,
        [job_id, promo_id]
      );
    }

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: e.message || "ตั้งค่าโปรไม่สำเร็จ" });
  } finally {
    client.release();
  }
});

app.post("/jobs/:job_id/admin-cancel", async (req, res) => {
  const job_id = Number(req.params.job_id);
  if (!job_id) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });

  const reason = String(req.body?.reason || "admin_cancel").trim();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // expire offers ที่ค้าง
    await client.query(`UPDATE public.job_offers SET status='expired', responded_at=NOW() WHERE job_id=$1 AND status='pending'`, [job_id]);

    // ยกเลิกงาน + เคลียร์คนรับ
    await client.query(
      `
      UPDATE public.jobs
      SET job_status='ยกเลิก',
          canceled_at=NOW(),
          cancel_reason=$1,
          technician_username=NULL,
          technician_team=NULL,
          dispatch_mode='offer'
      WHERE job_id=$2
      `,
      [reason, job_id]
    );

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "ยกเลิกงานไม่สำเร็จ" });
  } finally {
    client.release();
  }
});




// =======================================
// 🗑️ ADMIN HARD DELETE JOB (ลบถาวร)
// - ใช้กับงานทดสอบ/งานลงผิด (ลบจะหายทุกหน้าทันที)
// - ต้องส่ง confirm_code = booking_code หรือคำว่า "DELETE"
// =======================================
app.delete("/jobs/:job_id/admin-delete", async (req, res) => {
  const job_id = Number(req.params.job_id);
  const confirm_code = (req.body?.confirm_code || "").toString().trim().toUpperCase();

  if (!job_id) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const jr = await client.query(
      `SELECT booking_code FROM public.jobs WHERE job_id=$1 FOR UPDATE`,
      [job_id]
    );
    if (!jr.rows.length) throw new Error("ไม่พบงาน");

    const code = (jr.rows[0].booking_code || "").toString().trim().toUpperCase();
    const ok = confirm_code === "DELETE" || (code && confirm_code === code);

    if (!ok) {
      throw new Error(`ต้องยืนยันด้วย booking_code (${code}) หรือพิมพ์ DELETE`);
    }

    await client.query(`DELETE FROM public.jobs WHERE job_id=$1`, [job_id]);

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: e.message || "ลบงานไม่สำเร็จ" });
  } finally {
    client.release();
  }
});

// =======================================
// 🔄 UPDATE JOB STATUS
// =======================================
app.put("/jobs/:job_id/status", async (req, res) => {
  const { job_id } = req.params;
  const { status } = req.body || {};

  // ✅ เพิ่มสถานะ "ตีกลับ" (ช่างคืนงานให้แอดมิน) เพื่อให้ admin คุม workflow ได้ครบ
  const allow = ["รอดำเนินการ", "กำลังทำ", "เสร็จแล้ว", "ยกเลิก", "ตีกลับ"];
  if (!allow.includes(status)) return res.status(400).json({ error: "status ไม่ถูกต้อง" });

  try {
    // ✅ เมื่อเริ่มงานครั้งแรก ให้บันทึก started_at
    if (status === 'กำลังทำ') {
      await pool.query(
        `UPDATE public.jobs
         SET job_status=$1,
             started_at = COALESCE(started_at, NOW())
         WHERE job_id=$2`,
        [status, job_id]
      );
    } else {
      await pool.query(`UPDATE public.jobs SET job_status=$1 WHERE job_id=$2`, [status, job_id]);
    }
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "อัปเดตสถานะไม่สำเร็จ" });
  }
});

// =======================================
// 🧾 JOB PRICING
// =======================================
app.get("/jobs/:job_id/pricing", async (req, res) => {
  const { job_id } = req.params;

  try {
    const itemsR = await pool.query(
      `SELECT item_name, qty, unit_price, line_total FROM public.job_items WHERE job_id=$1 ORDER BY job_item_id ASC`,
      [job_id]
    );

    const promoR = await pool.query(
      `
      SELECT p.promo_id, p.promo_name, p.promo_type, p.promo_value, jp.applied_discount
      FROM public.job_promotions jp
      JOIN public.promotions p ON p.promo_id = jp.promo_id
      WHERE jp.job_id=$1
      LIMIT 1
      `,
      [job_id]
    );

    const items = itemsR.rows.map((x) => ({
      item_name: x.item_name,
      qty: Number(x.qty),
      unit_price: Number(x.unit_price),
      line_total: Number(x.line_total),
    }));

    const subtotal = items.reduce((s, it) => s + Number(it.line_total || 0), 0);
    const promo = promoR.rows[0] || null;

    let discount = 0;
    if (promo) {
      if (promo.applied_discount != null) discount = Number(promo.applied_discount || 0);
      else if (promo.promo_type === "percent") discount = subtotal * (Number(promo.promo_value || 0) / 100);
      else if (promo.promo_type === "amount") discount = Number(promo.promo_value || 0);
    }

    const total = Math.max(0, subtotal - discount);

    res.json({
      items,
      promo: promo
        ? {
            promo_id: promo.promo_id,
            promo_name: promo.promo_name,
            promo_type: promo.promo_type,
            promo_value: Number(promo.promo_value),
          }
        : null,
      subtotal: Number(subtotal.toFixed(2)),
      discount: Number(discount.toFixed(2)),
      total: Number(total.toFixed(2)),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "โหลดสรุปราคาไม่สำเร็จ" });
  }
});


// =======================================
// 💳 MARK PAID (ช่างกดจ่ายเงินแล้ว)
// - บันทึก paid_at + payment_status='paid'
// =======================================
app.post("/jobs/:job_id/pay", async (req, res) => {
  const job_id = Number(req.params.job_id);
  const { username } = req.body || {};
  const paid_by = (username || "").toString().trim() || null;

  if (!job_id) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });

  try {
    await pool.query(
      `UPDATE public.jobs
       SET paid_at = COALESCE(paid_at, NOW()),
           paid_by = COALESCE(paid_by, $1),
           payment_status = 'paid'
       WHERE job_id=$2`,
      [paid_by, job_id]
    );
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "บันทึกการจ่ายเงินไม่สำเร็จ" });
  }
});


// =======================================
// 💸 PRICING CHANGE REQUEST (ช่างเสนอแก้ไขราคา/รายการ)
// - ช่างส่ง: POST /jobs/:job_id/pricing-request { username, items, note }
// - แอดมินดูคิว: GET /admin/pricing-requests
// - แอดมินอนุมัติ: POST /admin/pricing-requests/:id/approve { decided_by }
// - แอดมินปฏิเสธ: POST /admin/pricing-requests/:id/decline { decided_by, admin_note }
// =======================================
app.post("/jobs/:job_id/pricing-request", async (req, res) => {
  const job_id = Number(req.params.job_id);
  const { username, items, note } = req.body || {};
  const requested_by = (username || "").toString().trim();

  if (!job_id) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });
  if (!requested_by) return res.status(400).json({ error: "ต้องส่ง username" });

  const safeItems = Array.isArray(items) ? items : [];
  const cleaned = safeItems
    .map((x) => ({
      item_name: (x.item_name || "").toString().trim(),
      qty: Number(x.qty || 0),
      unit_price: Number(x.unit_price || 0),
    }))
    .filter((x) => x.item_name && Number.isFinite(x.qty) && x.qty > 0 && Number.isFinite(x.unit_price) && x.unit_price >= 0);

  if (!cleaned.length) return res.status(400).json({ error: "ต้องมีรายการอย่างน้อย 1 รายการ" });

  const payload = {
    requested_by,
    note: (note || "").toString().trim() || null,
    items: cleaned.map((x) => ({
      ...x,
      line_total: Number((x.qty * x.unit_price).toFixed(2)),
    })),
  };

  payload.pricing = calcPricing(payload.items, null);

  try {
    const r = await pool.query(
      `INSERT INTO public.job_pricing_requests (job_id, requested_by, payload_json)
       VALUES ($1,$2,$3::jsonb)
       RETURNING request_id`,
      [job_id, requested_by, JSON.stringify(payload)]
    );
    res.json({ success: true, request_id: r.rows[0].request_id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "ส่งคำขอแก้ไขราคาไม่สำเร็จ" });
  }
});

app.get("/admin/pricing-requests", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT pr.request_id, pr.job_id, pr.requested_by, pr.payload_json, pr.status, pr.created_at,
              j.booking_code, j.customer_name, j.job_type, j.appointment_datetime
       FROM public.job_pricing_requests pr
       LEFT JOIN public.jobs j ON j.job_id = pr.job_id
       WHERE pr.status='pending'
       ORDER BY pr.created_at ASC`
    );
    res.json(r.rows || []);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "โหลดคำขอแก้ไขราคาไม่สำเร็จ" });
  }
});

app.post("/admin/pricing-requests/:id/approve", async (req, res) => {
  const request_id = Number(req.params.id);
  const decided_by = (req.body.decided_by || "admin").toString().trim();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const rr = await client.query(
      `SELECT request_id, job_id, payload_json, status
       FROM public.job_pricing_requests
       WHERE request_id=$1
       FOR UPDATE`,
      [request_id]
    );
    if (!rr.rows.length) throw new Error("ไม่พบคำขอ");
    const reqRow = rr.rows[0];
    if (reqRow.status !== "pending") throw new Error("คำขอนี้ถูกตัดสินไปแล้ว");

    const payload = reqRow.payload_json || {};
    const items = Array.isArray(payload.items) ? payload.items : [];

    // ล้างรายการเดิม แล้วใส่ใหม่
    await client.query(`DELETE FROM public.job_items WHERE job_id=$1`, [reqRow.job_id]);

    for (const it of items) {
      const name = (it.item_name || "").toString().trim();
      const qty = Number(it.qty || 0);
      const unit_price = Number(it.unit_price || 0);
      if (!name || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unit_price) || unit_price < 0) continue;

      const line_total = Number((qty * unit_price).toFixed(2));
      await client.query(
        `INSERT INTO public.job_items (job_id, item_name, qty, unit_price, line_total)
         VALUES ($1,$2,$3,$4,$5)`,
        [reqRow.job_id, name, qty, unit_price, line_total]
      );
    }

    const total = Number(payload.pricing?.total || 0);
    await client.query(`UPDATE public.jobs SET job_price=$1 WHERE job_id=$2`, [total, reqRow.job_id]);

    await client.query(
      `UPDATE public.job_pricing_requests
       SET status='approved', decided_at=NOW(), decided_by=$1
       WHERE request_id=$2`,
      [decided_by, request_id]
    );

    await client.query("COMMIT");
    res.json({ success: true, job_id: reqRow.job_id, total });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: e.message || "อนุมัติไม่สำเร็จ" });
  } finally {
    client.release();
  }
});

app.post("/admin/pricing-requests/:id/decline", async (req, res) => {
  const request_id = Number(req.params.id);
  const decided_by = (req.body.decided_by || "admin").toString().trim();
  const admin_note = (req.body.admin_note || "").toString().trim() || null;

  try {
    const r = await pool.query(
      `UPDATE public.job_pricing_requests
       SET status='declined', decided_at=NOW(), decided_by=$1, admin_note=$2
       WHERE request_id=$3 AND status='pending'
       RETURNING request_id`,
      [decided_by, admin_note, request_id]
    );

    if (!r.rows.length) return res.status(400).json({ error: "ไม่พบคำขอ หรือคำขอถูกตัดสินไปแล้ว" });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "ปฏิเสธคำขอไม่สำเร็จ" });
  }
});


// =======================================
// 🧾 ADMIN: EDIT JOB ITEMS / PROMOTION (แก้รายการ-ราคา-โปร)
// - แอดมินแก้ได้เลย ไม่ต้องผ่าน workflow (ใช้กับงานลงผิด/แก้หน้างาน)
// - ไม่กระทบของเดิม: เป็น endpoint เพิ่มเติม
// =======================================
app.put("/jobs/:job_id/items-admin", async (req, res) => {
  const job_id = Number(req.params.job_id);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const promotion_id = req.body?.promotion_id ? Number(req.body.promotion_id) : null;

  if (!job_id) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // โหลดโปร (ถ้าเลือก)
    let promo = null;
    if (promotion_id) {
      const pr = await client.query(
        `SELECT promo_id, promo_name, promo_type, promo_value
         FROM public.promotions WHERE promo_id=$1 AND is_active=TRUE`,
        [promotion_id]
      );
      promo = pr.rows[0] || null;
    }

    // คำนวณราคา (subtotal/discount/total)
    const safeItems = items
      .map((it) => ({
        item_id: it.item_id || null,
        item_name: String(it.item_name || "").trim(),
        qty: Math.max(0, Number(it.qty || 0)),
        unit_price: Math.max(0, Number(it.unit_price || 0)),
      }))
      .filter((it) => it.item_name);

    const pricing = safeItems.length
      ? calcPricing(safeItems, promo)
      : { subtotal: 0, discount: 0, total: 0 };

    // ล้างรายการเดิม
    await client.query(`DELETE FROM public.job_items WHERE job_id=$1`, [job_id]);
    await client.query(`DELETE FROM public.job_promotions WHERE job_id=$1`, [job_id]);

    // ใส่รายการใหม่
    for (const it of safeItems) {
      const line_total = Number(it.qty) * Number(it.unit_price);
      await client.query(
        `INSERT INTO public.job_items (job_id, item_id, item_name, qty, unit_price, line_total)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [job_id, it.item_id, it.item_name, it.qty, it.unit_price, line_total]
      );
    }

    // ใส่โปร (ถ้ามี)
    if (promo && safeItems.length) {
      await client.query(
        `INSERT INTO public.job_promotions (job_id, promo_id, applied_discount)
         VALUES ($1,$2,$3)`,
        [job_id, promo.promo_id, pricing.discount]
      );
    }

    // อัปเดตราคารวมใน jobs
    await client.query(`UPDATE public.jobs SET job_price=$1 WHERE job_id=$2`, [pricing.total, job_id]);

    await client.query("COMMIT");
    res.json({ success: true, pricing });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: e.message || "แก้รายการไม่สำเร็จ" });
  } finally {
    client.release();
  }
});


// =======================================
// 👥 TEAM: เพิ่ม/แก้สมาชิกทีมช่างของงาน (admin)
// - ใช้กรณีงานต้องเข้าพร้อมกันหลายคน และช่วยกันลงรูปได้
// =======================================
app.get("/jobs/:job_id/team", async (req, res) => {
  const job_id = Number(req.params.job_id);
  if (!job_id) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });

  try {
    const r = await pool.query(
      `SELECT username FROM public.job_team_members WHERE job_id=$1 ORDER BY username ASC`,
      [job_id]
    );
    res.json({ members: r.rows.map((x) => x.username) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "โหลดทีมไม่สำเร็จ" });
  }
});

app.put("/jobs/:job_id/team", async (req, res) => {
  const job_id = Number(req.params.job_id);
  const members = Array.isArray(req.body?.members) ? req.body.members : [];
  if (!job_id) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });

  const safe = [...new Set(members.map((x) => String(x || "").trim()).filter(Boolean))];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM public.job_team_members WHERE job_id=$1`, [job_id]);
    for (const u of safe) {
      await client.query(
        `INSERT INTO public.job_team_members (job_id, username)
         VALUES ($1,$2) ON CONFLICT (job_id, username) DO NOTHING`,
        [job_id, u]
      );
    }
    await client.query("COMMIT");
    res.json({ success: true, members: safe });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "อัปเดตทีมไม่สำเร็จ" });
  } finally {
    client.release();
  }
});


// =======================================
// ↩️ RETURN JOB (technician) - ตีกลับงานให้แอดมิน
// - ใช้กรณีรับงานแล้วแต่ไม่สะดวก/ติดเหตุฉุกเฉิน
// - แอดมินจะเห็นงานเป็นสถานะ "ตีกลับ" และส่งต่อให้ช่างคนอื่นได้
// =======================================
app.post("/jobs/:job_id/return", async (req, res) => {
  const job_id = Number(req.params.job_id);
  const username = (req.body?.username || "").toString().trim();
  const reason = (req.body?.reason || "").toString().trim();

  if (!job_id) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });
  if (!username) return res.status(400).json({ error: "ต้องส่ง username" });

  try {
    // ✅ ดึงคนที่ถูกมอบหมายล่าสุด เพื่อกันคืนงานคนละ job
    const j = await pool.query(
      `SELECT technician_username, technician_team, job_status FROM public.jobs WHERE job_id=$1`,
      [job_id]
    );
    if (!j.rows.length) return res.status(404).json({ error: "ไม่พบงาน" });

    const current = j.rows[0];
    const st = String(current.job_status || "").trim();
    if (["เสร็จแล้ว", "ยกเลิก"].includes(st)) {
      return res.status(400).json({ error: "งานนี้ปิดไปแล้ว ไม่สามารถตีกลับได้" });
    }

    // ✅ อัปเดตสถานะ + ล้างคนมอบหมาย เพื่อให้แอดมินส่งต่อได้
    await pool.query(
      `UPDATE public.jobs
       SET job_status='ตีกลับ',
           returned_at=NOW(),
           return_reason=$1,
           returned_by=$2,
           technician_username=NULL,
           technician_team=NULL,
           dispatch_mode='offer'
       WHERE job_id=$3`,
      [reason || null, username, job_id]
    );

    // ล้างทีม (ไม่ให้ยังเห็นงานในหน้าช่าง)
    await pool.query(`DELETE FROM public.job_team_members WHERE job_id=$1`, [job_id]);

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "ตีกลับงานไม่สำเร็จ" });
  }
});


// =======================================
// 📩 JOB SUMMARY TEXT
// =======================================
app.get("/jobs/:job_id/summary", async (req, res) => {
  const { job_id } = req.params;

  try {
    const jobR = await pool.query(
      `SELECT job_id, booking_code, customer_name, customer_phone, appointment_datetime, address_text, job_type, job_price
       FROM public.jobs WHERE job_id=$1`,
      [job_id]
    );
    if (jobR.rows.length === 0) return res.status(404).json({ error: "ไม่พบงาน" });

    const job = jobR.rows[0];

    // ✅ ใช้ทำลิงก์ Tracking ให้ลูกค้า
    const origin = `${req.protocol}://${req.get("host")}`;

    const itemsR = await pool.query(
      `SELECT item_name, qty, unit_price, line_total FROM public.job_items WHERE job_id=$1 ORDER BY job_item_id ASC`,
      [job_id]
    );

    const dt = new Date(job.appointment_datetime);
    const dd = dt.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" });
    const tt = dt.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });

    const lines = itemsR.rows.map((it) => {
      const qty = Number(it.qty);
      const up = Number(it.unit_price);
      const lt = Number(it.line_total);
      return `- ${it.item_name} x${qty} @ ${up} บาท = ${lt} บาท`;
    });

    const text =
      `ยืนยันนัดหมายบริการแอร์\n\n` +
      `Coldwindflow Air Services\n` +
      `แอดมินฝ่ายบริการลูกค้า ขอเรียนยืนยันนัดหมายดังนี้ค่ะ\n\n` +
      `🔎 เลขงาน: ${job.booking_code || "#" + job.job_id}\n🔗 ติดตามงาน: ${origin}/track.html?q=${encodeURIComponent(job.booking_code || String(job.job_id))}
` +
      `📍 ชื่อลูกค้า: ${job.customer_name || "-"}\n` +
      `📞 เบอร์: ${job.customer_phone || "-"}\n` +
      `📅 วันที่นัด: ${dd} เวลา ${tt} น.\n` +
      `🧾 ประเภทงาน: ${job.job_type || "-"}\n` +
      `🏠 ที่อยู่: ${job.address_text || "-"}\n\n` +
      `🧾 รายการ:\n${lines.length ? lines.join("\n") : "- (ไม่มีรายการ)"}\n\n` +
      `💰 ยอดชำระสุทธิ: ${Number(job.job_price || 0).toFixed(2)} บาท\n\n` +
      `ขอบคุณค่ะ\nLINE OA: @cwfair\nโทร: 098-877-7321`;

    res.json({ text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "สร้างข้อความสรุปไม่สำเร็จ" });
  }
});

// =======================================
// ✅ OFFERS
// =======================================
app.get("/offers/tech/:username", async (req, res) => {
  const { username } = req.params;

  const ready = await isTechReady(username);
  if (!ready) return res.json([]);

  try {
    await pool.query(`
      UPDATE public.job_offers
      SET status='expired'
      WHERE status='pending' AND expires_at < NOW()
    `);

    const r = await pool.query(
      `
      SELECT
        o.offer_id, o.job_id, o.status, o.offered_at, o.expires_at,
        j.customer_name, j.customer_phone, j.job_type, j.appointment_datetime,
        j.address_text, j.job_price, j.job_status, j.booking_code,
        COALESCE(j.job_zone,'') AS job_zone
      FROM public.job_offers o
      JOIN public.jobs j ON j.job_id = o.job_id
      WHERE o.technician_username=$1
        AND o.status='pending'
        AND o.expires_at >= NOW()
      ORDER BY o.expires_at ASC
      `,
      [username]
    );

    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "โหลดข้อเสนองานไม่สำเร็จ" });
  }
});

app.post("/offers/:offer_id/accept", async (req, res) => {
  const { offer_id } = req.params;
  const { username } = req.body || {};

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const offerR = await client.query(
      `SELECT offer_id, job_id, technician_username, status, expires_at
       FROM public.job_offers
       WHERE offer_id=$1
       FOR UPDATE`,
      [offer_id]
    );
    if (offerR.rows.length === 0) throw new Error("ไม่พบ offer");

    const offer = offerR.rows[0];
    if (offer.status !== "pending") throw new Error("offer นี้ถูกตอบไปแล้ว");
    if (new Date(offer.expires_at) < new Date()) throw new Error("หมดเวลารับงานแล้ว");
    if (username && username !== offer.technician_username) throw new Error("username ไม่ตรงกับ offer");

    const jobR = await client.query(
      `SELECT job_id, technician_team FROM public.jobs WHERE job_id=$1 FOR UPDATE`,
      [offer.job_id]
    );
    if (jobR.rows.length === 0) throw new Error("ไม่พบงาน");
    if (jobR.rows[0].technician_team) throw new Error("งานนี้ถูกช่างคนอื่นรับไปแล้ว");

    await client.query(`UPDATE public.job_offers SET status='accepted', responded_at=NOW() WHERE offer_id=$1`, [offer_id]);
    await client.query(
      `UPDATE public.job_offers SET status='expired' WHERE job_id=$1 AND status='pending' AND offer_id<>$2`,
      [offer.job_id, offer_id]
    );

    // ✅ FIX สำคัญ: ต้อง set technician_team ถึงจะไปอยู่ “งานปัจจุบัน”
    // ✅ set ทั้ง technician_username + technician_team เพื่อให้ทุกหน้ามองเห็นตรงกัน
    await client.query(
      `UPDATE public.jobs
       SET technician_username=$1,
           technician_team=$1
       WHERE job_id=$2`,
      [offer.technician_username, offer.job_id]
    );

    // ✅ เผื่อกรณีงานนี้มีทีม (ให้คนรับเป็นสมาชิกทีมด้วย)
    await client.query(
      `INSERT INTO public.job_team_members (job_id, username)
       VALUES ($1,$2)
       ON CONFLICT (job_id, username) DO NOTHING`,
      [offer.job_id, offer.technician_username]
    );

    await client.query("COMMIT");
    res.json({ success: true, job_id: offer.job_id });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(400).json({ error: e.message || "รับงานไม่สำเร็จ" });
  } finally {
    client.release();
  }
});

app.post("/offers/:offer_id/decline", async (req, res) => {
  const { offer_id } = req.params;
  const { username } = req.body || {};

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const offerR = await client.query(
      `SELECT offer_id, job_id, technician_username, status, expires_at
       FROM public.job_offers
       WHERE offer_id=$1
       FOR UPDATE`,
      [offer_id]
    );
    if (offerR.rows.length === 0) throw new Error("ไม่พบ offer");

    const offer = offerR.rows[0];
    if (offer.status !== "pending") throw new Error("offer นี้ถูกตอบไปแล้ว");
    if (username && username !== offer.technician_username) throw new Error("username ไม่ตรงกับ offer");

    if (new Date(offer.expires_at) < new Date()) {
      await client.query(`UPDATE public.job_offers SET status='expired', responded_at=NOW() WHERE offer_id=$1`, [offer_id]);

      // ✅ คืนงานกลับหน้าแอดมิน (ถ้าเป็น offer และยังไม่ได้รับจริง)
      await client.query(
        `UPDATE public.jobs
         SET technician_username=NULL,
             technician_team=NULL,
             dispatch_mode='offer'
         WHERE job_id=$1
           AND COALESCE(dispatch_mode,'')='offer'
           AND technician_team IS NULL
           AND technician_username=$2`,
        [offer.job_id, offer.technician_username]
      );

      await client.query("COMMIT");
      return res.json({ success: true, status: "expired" });
    }

    await client.query(`UPDATE public.job_offers SET status='declined', responded_at=NOW() WHERE offer_id=$1`, [offer_id]);

    // ✅ คืนงานกลับหน้าแอดมิน (ถ้าเป็น offer และยังไม่ได้รับจริง)
    await client.query(
      `UPDATE public.jobs
       SET technician_username=NULL,
           technician_team=NULL,
           dispatch_mode='offer'
       WHERE job_id=$1
         AND COALESCE(dispatch_mode,'')='offer'
         AND technician_team IS NULL
         AND technician_username=$2`,
      [offer.job_id, offer.technician_username]
    );

    await client.query("COMMIT");
    res.json({ success: true, status: "declined", job_id: offer.job_id });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(400).json({ error: e.message || "ไม่รับงานไม่สำเร็จ" });
  } finally {
    client.release();
  }
});

// =======================================
// 🚗 TRAVEL START (เริ่มเดินทาง)
// =======================================
app.post("/jobs/:job_id/travel-start", async (req, res) => {
  const { job_id } = req.params;
  try {
    await pool.query(
      `UPDATE public.jobs
       SET travel_started_at = COALESCE(travel_started_at, NOW())
       WHERE job_id=$1`,
      [job_id]
    );
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "บันทึกเริ่มเดินทางไม่สำเร็จ" });
  }
});

// =======================================
// 📍 CHECK-IN
// =======================================
app.post("/jobs/:job_id/checkin", async (req, res) => {
  const { job_id } = req.params;
  const { lat, lng } = req.body || {};

  if (lat == null || lng == null) return res.status(400).json({ error: "พิกัด GPS ไม่ครบ" });

  try {
    const r = await pool.query(`SELECT gps_latitude, gps_longitude FROM public.jobs WHERE job_id=$1`, [job_id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "ไม่พบงาน" });

    const siteLat = Number(r.rows[0].gps_latitude);
    const siteLng = Number(r.rows[0].gps_longitude);
    if (!siteLat || !siteLng) return res.status(400).json({ error: "งานนี้ไม่มีพิกัดหน้างาน" });

    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(Number(lat) - siteLat);
    const dLng = toRad(Number(lng) - siteLng);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(siteLat)) * Math.cos(toRad(Number(lat))) * Math.sin(dLng / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    if (distance > 500) {
      return res.status(400).json({ error: "อยู่นอกพื้นที่หน้างาน", distance: Math.round(distance) });
    }

    await pool.query(
      `UPDATE public.jobs SET checkin_latitude=$1, checkin_longitude=$2, checkin_at=NOW() WHERE job_id=$3`,
      [lat, lng, job_id]
    );

    res.json({ success: true, distance: Math.round(distance) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "เช็คอินไม่สำเร็จ" });
  }
});

// =======================================
// 📷 PHOTOS
// =======================================
app.post("/jobs/:job_id/photos/meta", async (req, res) => {
  const { job_id } = req.params;
  const { phase, mime_type, original_name, file_size } = req.body || {};

  const allowedPhases = ["before", "after", "pressure", "current", "temp", "defect", "payment_slip"];
  if (!allowedPhases.includes(String(phase))) {
    return res.status(400).json({ error: `phase ไม่ถูกต้อง (ต้องเป็น ${allowedPhases.join(", ")})` });
  }
  if (!mime_type) return res.status(400).json({ error: "mime_type ห้ามว่าง" });

  try {
    const r = await pool.query(
      `
      INSERT INTO public.job_photos (job_id, phase, mime_type, original_name, file_size, photo_type)
      VALUES ($1,$2,$3,$4,$5,NULL)
      RETURNING photo_id
      `,
      [job_id, phase, mime_type, original_name || null, file_size || null]
    );
    res.json({ success: true, photo_id: r.rows[0].photo_id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "สร้าง metadata รูปไม่สำเร็จ" });
  }
});

function safeFilename(name) {
  return String(name || "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

// ✅ บันทึก dataURL (image/png;base64,...) เป็นไฟล์
function saveDataUrlPng(dataUrl, folder, prefix) {
  if (!dataUrl) return null;
  const m = String(dataUrl).match(/^data:image\/png;base64,(.+)$/);
  if (!m) throw new Error("signature_data ต้องเป็นรูปแบบ data:image/png;base64,...");

  const b64 = m[1];
  const buf = Buffer.from(b64, "base64");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fname = safeFilename(`${prefix}_${stamp}.png`);
  const absPath = path.join(folder, fname);
  fs.writeFileSync(absPath, buf);

  const rel = absPath.replace(UPLOAD_DIR, "").replace(/\\/g, "/");
  return `/uploads${rel.startsWith("/") ? "" : "/"}${rel}`;
}

app.post("/jobs/:job_id/photos/:photo_id/upload", upload.single("photo"), async (req, res) => {
  const { job_id, photo_id } = req.params;
  if (!req.file) return res.status(400).json({ error: "ไม่พบไฟล์ photo" });

  try {
    const meta = await pool.query(
      `SELECT photo_id, mime_type FROM public.job_photos WHERE photo_id=$1 AND job_id=$2`,
      [photo_id, job_id]
    );
    if (meta.rows.length === 0) return res.status(404).json({ error: "ไม่พบ metadata รูป" });

    let ext = "jpg";
    const mt = String(req.file.mimetype || "").toLowerCase();
    if (mt.includes("png")) ext = "png";
    if (mt.includes("webp")) ext = "webp";
    if (mt.includes("jpeg") || mt.includes("jpg")) ext = "jpg";

    const safeName = `${job_id}_${photo_id}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const diskPath = path.join(UPLOAD_DIR, safeName);
    fs.writeFileSync(diskPath, req.file.buffer);

    const publicUrl = `/uploads/${safeName}`;

    await pool.query(
      `UPDATE public.job_photos SET uploaded_at=NOW(), storage_path=$1, public_url=$2 WHERE photo_id=$3 AND job_id=$4`,
      [diskPath, publicUrl, photo_id, job_id]
    );

    res.json({ success: true, url: publicUrl });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "อัปโหลดรูปไม่สำเร็จ" });
  }
});

app.get("/jobs/:job_id/photos", async (req, res) => {
  const { job_id } = req.params;
  try {
    const r = await pool.query(
      `SELECT photo_id, phase, created_at, uploaded_at, public_url FROM public.job_photos WHERE job_id=$1 ORDER BY photo_id ASC`,
      [job_id]
    );
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "โหลดรายการรูปไม่สำเร็จ" });
  }
});

// =======================================
// 📝 TECH NOTE
// =======================================
app.put("/jobs/:job_id/note", async (req, res) => {
  const { job_id } = req.params;
  const { note } = req.body || {};

  try {
    await pool.query(
      `UPDATE public.jobs SET technician_note=$1, technician_note_at=NOW() WHERE job_id=$2`,
      [note || "", job_id]
    );
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "บันทึกหมายเหตุไม่สำเร็จ" });
  }
});

// =======================================
// ✅ FINALIZE JOB (เสร็จสิ้น / ยกเลิก) + ลายเซ็นต์ลูกค้า
// =======================================
app.post("/jobs/:job_id/finalize", async (req, res) => {
  const { job_id } = req.params;
  const status = String(req.body?.status || "").trim();
  const signature_data = req.body?.signature_data;
  const note = String(req.body?.note || "").trim();

  if (!["เสร็จแล้ว", "ยกเลิก"].includes(status)) {
    return res.status(400).json({ error: "status ต้องเป็น 'เสร็จแล้ว' หรือ 'ยกเลิก'" });
  }
  if (!signature_data) {
    return res.status(400).json({ error: "ต้องมีลายเซ็นต์ลูกค้า" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // บันทึกลายเซ็นต์เป็นไฟล์
    const sigPath = saveDataUrlPng(signature_data, SIGNATURE_DIR, `job_${job_id}_${status}`);

    // บันทึก note ล่าสุด (ถ้ามี)
    if (note) {
      await client.query(
        `UPDATE public.jobs SET technician_note=$1, technician_note_at=NOW() WHERE job_id=$2`,
        [note, job_id]
      );
    }

    if (status === "เสร็จแล้ว") {
      await client.query(
        `UPDATE public.jobs
         SET job_status='เสร็จแล้ว',
             finished_at = NOW(),
             final_signature_path = $1,
             final_signature_status = 'เสร็จแล้ว',
             final_signature_at = NOW()
         WHERE job_id=$2`,
        [sigPath, job_id]
      );
    } else {
      await client.query(
        `UPDATE public.jobs
         SET job_status='ยกเลิก',
             canceled_at = NOW(),
             cancel_reason = COALESCE(NULLIF($1,''), cancel_reason),
             final_signature_path = $2,
             final_signature_status = 'ยกเลิก',
             final_signature_at = NOW()
         WHERE job_id=$3`,
        [note, sigPath, job_id]
      );
    }

    await client.query("COMMIT");
    res.json({ success: true, job_id: Number(job_id), status });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: e.message || "ปิดงาน/ยกเลิกไม่สำเร็จ" });
  } finally {
    client.release();
  }
});

// =======================================
// 🟢/🔴 TECH: accept status (พร้อมเริ่มงาน / หยุดรับงาน)
// =======================================
app.get("/technicians/:username/accept-status", async (req, res) => {
  const { username } = req.params;
  try {
    const r = await pool.query(
      `SELECT COALESCE(accept_status,'ready') AS accept_status, accept_status_updated_at
       FROM public.technician_profiles
       WHERE username=$1
       LIMIT 1`,
      [username]
    );
    res.json(r.rows[0] || { accept_status: "ready", accept_status_updated_at: null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "โหลดสถานะรับงานไม่สำเร็จ" });
  }
});

app.put("/technicians/:username/accept-status", async (req, res) => {
  const { username } = req.params;
  const status = (req.body?.status || "").toString().toLowerCase().trim();

  if (!["ready", "paused"].includes(status)) {
    return res.status(400).json({ error: "status ต้องเป็น ready หรือ paused" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO public.technician_profiles (username, accept_status, accept_status_updated_at)
       VALUES ($1,$2,NOW())
       ON CONFLICT (username) DO UPDATE SET
         accept_status = EXCLUDED.accept_status,
         accept_status_updated_at = EXCLUDED.accept_status_updated_at`,
      [username, status]
    );

    if (status === "paused") {
      await client.query(
        `UPDATE public.job_offers SET status='expired' WHERE technician_username=$1 AND status='pending'`,
        [username]
      );
    }

    await client.query("COMMIT");
    res.json({ success: true, accept_status: status });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "อัปเดตสถานะรับงานไม่สำเร็จ" });
  } finally {
    client.release();
  }
});

// =======================================
// 🗺️ TECH: preferred zone (โซนรับงาน)
// =======================================
app.put("/technicians/:username/zone", async (req, res) => {
  const { username } = req.params;
  const zone = (req.body?.zone || "").toString().trim();

  try {
    await pool.query(
      `INSERT INTO public.technician_profiles (username, preferred_zone)
       VALUES ($1,$2)
       ON CONFLICT (username) DO UPDATE SET preferred_zone = EXCLUDED.preferred_zone`,
      [username, zone]
    );
    res.json({ success: true, preferred_zone: zone });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "บันทึกโซนไม่สำเร็จ" });
  }
});

// =======================================
// 👤 TECHNICIAN PROFILE (v4)
// =======================================
const PROFILE_REQ_DIR = path.join(UPLOAD_DIR, "profile_requests");
const TECH_PROFILE_DIR = path.join(UPLOAD_DIR, "tech_profiles");
const SIGNATURE_DIR = path.join(UPLOAD_DIR, "signatures");
fs.mkdirSync(PROFILE_REQ_DIR, { recursive: true });
fs.mkdirSync(TECH_PROFILE_DIR, { recursive: true });
fs.mkdirSync(SIGNATURE_DIR, { recursive: true });

function saveUploadedFile(file, folder, prefix) {
  if (!file) return null;
  const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
  const stamp = Date.now();
  const fname = safeFilename(`${prefix}_${stamp}${ext}`);
  const absPath = path.join(folder, fname);
  fs.writeFileSync(absPath, file.buffer);
  const rel = absPath.replace(UPLOAD_DIR, "").replace(/\\/g, "/");
  return `/uploads${rel.startsWith("/") ? "" : "/"}${rel}`;
}

app.get("/technicians/:username/profile", async (req, res) => {
  try {
    const username = req.params.username;

    const p = await pool.query(
      `SELECT username, technician_code, full_name, photo_path, position, rating, grade, done_count,
              COALESCE(accept_status,'ready') AS accept_status, accept_status_updated_at,
              COALESCE(preferred_zone,'') AS preferred_zone
       FROM public.technician_profiles
       WHERE username=$1`,
      [username]
    );

    const r = await pool.query(
      `SELECT status
       FROM public.technician_profile_requests
       WHERE username=$1
       ORDER BY requested_at DESC
       LIMIT 1`,
      [username]
    );

    const profile = p.rows[0] || { username };
    profile.request_status = r.rows[0]?.status || "none";
    res.json(profile);
  } catch (e) {
    console.error("GET profile error:", e);
    res.status(500).json({ error: "โหลดโปรไฟล์ไม่สำเร็จ" });
  }
});

// ช่างส่งคำขอแก้ไข (ชื่อ + รูป)
app.post("/profile/request", upload.single("photo"), async (req, res) => {
  try {
    const username = (req.body.username || "").trim();
    const full_name = (req.body.full_name || "").trim();
    if (!username) return res.status(400).json({ error: "username หาย" });

    const photo_temp_path = saveUploadedFile(req.file, PROFILE_REQ_DIR, username);

    if (!full_name && !photo_temp_path) {
      return res.status(400).json({ error: "ต้องส่งชื่อใหม่ หรือรูป อย่างน้อย 1 อย่าง" });
    }

    await pool.query(
      `INSERT INTO public.technician_profile_requests (username, full_name, photo_temp_path, status)
       VALUES ($1,$2,$3,'pending')`,
      [username, full_name || null, photo_temp_path || null]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error("POST profile request error:", e);
    res.status(500).json({ error: "ส่งคำขอไม่สำเร็จ" });
  }
});

// admin list pending requests
app.get("/admin/profile/requests", async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT r.id, r.username, r.full_name, r.photo_temp_path, r.requested_at,
              p.technician_code, p.position
       FROM public.technician_profile_requests r
       LEFT JOIN public.technician_profiles p ON p.username = r.username
       WHERE r.status='pending'
       ORDER BY r.requested_at ASC`
    );
    res.json(q.rows);
  } catch (e) {
    console.error("GET admin requests error:", e);
    res.status(500).json({ error: `โหลดคำขอไม่สำเร็จ: ${e?.message || "unknown"}` });
  }
});

app.post("/admin/profile/requests/:id/approve", async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    const technician_code = (req.body.technician_code || "").trim();

    // ✅ FIX: ถ้าแอดมินไม่ส่ง position มา = อย่าทับของเดิม
    const position = (req.body.position || "").trim() || null;

    if (!id) return res.status(400).json({ error: "id ไม่ถูกต้อง" });
    if (!technician_code) return res.status(400).json({ error: "ต้องใส่รหัสช่าง" });

    await client.query("BEGIN");

    const rq = await client.query(
      `SELECT * FROM public.technician_profile_requests WHERE id=$1 FOR UPDATE`,
      [id]
    );
    if (rq.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "ไม่พบคำขอ" });
    }
    const reqRow = rq.rows[0];
    if (reqRow.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "คำขอนี้ไม่อยู่ในสถานะ pending" });
    }

    let finalPhotoPath = null;
    if (reqRow.photo_temp_path) {
      const tempAbs = path.join(__dirname, reqRow.photo_temp_path.replace("/uploads/", "uploads/"));
      if (fs.existsSync(tempAbs)) {
        const ext = path.extname(tempAbs) || ".jpg";
        const finalName = safeFilename(`${reqRow.username}_${Date.now()}${ext}`);
        const finalAbs = path.join(TECH_PROFILE_DIR, finalName);
        fs.renameSync(tempAbs, finalAbs);

        const rel = finalAbs.replace(UPLOAD_DIR, "").replace(/\\/g, "/");
        finalPhotoPath = `/uploads${rel.startsWith("/") ? "" : "/"}${rel}`;
      }
    }

    await client.query(
      `INSERT INTO public.technician_profiles (username, technician_code, full_name, photo_path, position)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (username) DO UPDATE SET
         technician_code = EXCLUDED.technician_code,
         full_name = COALESCE(EXCLUDED.full_name, public.technician_profiles.full_name),
         photo_path = COALESCE(EXCLUDED.photo_path, public.technician_profiles.photo_path),
         position = COALESCE(EXCLUDED.position, public.technician_profiles.position),
         accept_status = COALESCE(public.technician_profiles.accept_status,'ready'),
         updated_at = CURRENT_TIMESTAMP`,
      [reqRow.username, technician_code, reqRow.full_name || null, finalPhotoPath || null, position]
    );

    await client.query(
      `UPDATE public.technician_profile_requests
       SET status='approved', reviewed_at=CURRENT_TIMESTAMP
       WHERE id=$1`,
      [id]
    );

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("APPROVE request error:", e);
    res.status(500).json({ error: "อนุมัติไม่สำเร็จ" });
  } finally {
    client.release();
  }
});

app.post("/admin/profile/requests/:id/reject", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "id ไม่ถูกต้อง" });

    await pool.query(
      `UPDATE public.technician_profile_requests
       SET status='rejected', reviewed_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND status='pending'`,
      [id]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error("REJECT request error:", e);
    res.status(500).json({ error: "ปฏิเสธไม่สำเร็จ" });
  }
});

// =======================================
// 🧑‍🔧 ADMIN: create technician user
// =======================================
app.post("/admin/technicians/create", async (req, res) => {
  const { username, password, full_name, technician_code, position } = req.body || {};
  const u = (username || "").toString().trim();
  const p = (password || "").toString().trim();
  if (!u || !p) return res.status(400).json({ error: "ต้องมี username และ password" });

  const code = (technician_code || "").toString().trim() || null;
  const pos = (position || "junior").toString().trim();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO public.users (username, password, role) VALUES ($1,$2,'technician')`,
      [u, p]
    );

    await client.query(
      `INSERT INTO public.technician_profiles (username, full_name, technician_code, position, rating, grade, done_count)
       VALUES ($1,$2,$3,$4, 5, 'A', 0)
       ON CONFLICT (username) DO NOTHING`,
      [u, (full_name || u).toString().trim(), code, pos]
    );

    await client.query("COMMIT");
    res.json({ success: true, username: u });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: e.message || "สร้างช่างไม่สำเร็จ" });
  } finally {
    client.release();
  }
});

app.get("/admin/technicians", async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT u.username,
              p.full_name, p.technician_code, p.position, p.photo_path,
              p.rating, p.grade, p.done_count,
              COALESCE(p.accept_status,'ready') AS accept_status, p.accept_status_updated_at
       FROM public.users u
       LEFT JOIN public.technician_profiles p ON p.username=u.username
       WHERE u.role='technician'
       ORDER BY u.username ASC`
    );
    res.json(q.rows);
  } catch (e) {
    console.error("GET admin technicians error:", e);
    res.status(500).json({ error: `โหลดรายชื่อช่างไม่สำเร็จ: ${e?.message || "unknown"}` });
  }
});

app.put("/admin/technicians/:username", async (req, res) => {
  try {
    const username = req.params.username;
    const technician_code = (req.body.technician_code || "").trim();
    const full_name = (req.body.full_name || "").trim();
    const position = (req.body.position || "").trim() || null; // ✅ ไม่ส่ง = ไม่ทับ

    if (!technician_code) return res.status(400).json({ error: "ต้องใส่รหัสช่าง" });

    await pool.query(
      `INSERT INTO public.technician_profiles (username, technician_code, full_name, position)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (username) DO UPDATE SET
         technician_code = EXCLUDED.technician_code,
         full_name = COALESCE(EXCLUDED.full_name, public.technician_profiles.full_name),
         position = COALESCE(EXCLUDED.position, public.technician_profiles.position),
         updated_at = CURRENT_TIMESTAMP`,
      [username, technician_code, full_name || null, position]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error("PUT admin technician error:", e);
    res.status(500).json({ error: "บันทึกไม่สำเร็จ" });
  }
});

app.post("/admin/technicians/:username/photo", upload.single("photo"), async (req, res) => {
  try {
    const username = req.params.username;
    if (!req.file) return res.status(400).json({ error: "ไม่มีไฟล์รูป" });

    const photo_path = saveUploadedFile(req.file, TECH_PROFILE_DIR, username);
    await pool.query(
      `UPDATE public.technician_profiles SET photo_path=$2, updated_at=CURRENT_TIMESTAMP WHERE username=$1`,
      [username, photo_path]
    );

    res.json({ ok: true, photo_path });
  } catch (e) {
    console.error("POST admin tech photo error:", e);
    res.status(500).json({ error: "อัปโหลดรูปไม่สำเร็จ" });
  }
});

// =======================================
// 🧾 DOCUMENTS (quote/receipt)
// =======================================
function money(n) {
  return Number(n || 0).toFixed(2);
}

async function getJobDocData(job_id) {
  const jobR = await pool.query(
    `SELECT job_id, booking_code, customer_name, customer_phone, job_type, appointment_datetime, address_text, job_price,
            paid_at, paid_by, payment_status,
            final_signature_path, final_signature_at
     FROM public.jobs WHERE job_id=$1`,
    [job_id]
  );
  if (jobR.rows.length === 0) return null;

  const itemsR = await pool.query(
    `SELECT item_name, qty, unit_price, line_total
     FROM public.job_items WHERE job_id=$1 ORDER BY job_item_id`,
    [job_id]
  );

  const promoR = await pool.query(
    `SELECT p.promo_name, p.promo_type, p.promo_value, jp.applied_discount
     FROM public.job_promotions jp
     JOIN public.promotions p ON p.promo_id=jp.promo_id
     WHERE jp.job_id=$1
     LIMIT 1`,
    [job_id]
  );

  const subtotal = itemsR.rows.reduce((s, it) => s + Number(it.line_total || 0), 0);
  const discount = promoR.rows[0]?.applied_discount ? Number(promoR.rows[0].applied_discount) : 0;
  const total = Math.max(
    0,
    subtotal > 0 ? subtotal - discount : Number(jobR.rows[0].job_price || 0)
  );

  return { job: jobR.rows[0], items: itemsR.rows, promo: promoR.rows[0] || null, subtotal, discount, total };
}

function docHtml(title, data) {
  const j = data.job;

  // ✅ ข้อมูลบริษัท (ปรับได้จาก .env)
  const COMPANY_NAME = process.env.COMPANY_NAME || "Coldwindflow air services";
  const COMPANY_ADDRESS = process.env.COMPANY_ADDRESS || "23/61 ถ.พึ่งมี 50 แขวงบางจาก เขตพระโขนง กรุงเทพฯ 10260";
  const COMPANY_PHONE = process.env.COMPANY_PHONE || "098-877-7321";
  const COMPANY_LINE = process.env.COMPANY_LINE || "@cwfair";

  const BANK_NAME = process.env.COMPANY_BANK_NAME || "";
  const BANK_ACCOUNT = process.env.COMPANY_BANK_ACCOUNT || "";
  const BANK_QR_URL = process.env.COMPANY_BANK_QR_URL || "";
  const rows =
    data.items && data.items.length
      ? data.items
          .map(
            (it) => `
      <tr>
        <td>${it.item_name}</td>
        <td style="text-align:right;">${it.qty}</td>
        <td style="text-align:right;">${money(it.unit_price)}</td>
        <td style="text-align:right;">${money(it.line_total)}</td>
      </tr>`
          )
          .join("")
      : `<tr><td colspan="4">-</td></tr>`;

  const promoLine = data.promo
    ? `<div>โปรโมชั่น: <b>${data.promo.promo_name}</b> (ลด ${money(data.discount)})</div>`
    : "";

  return `<!doctype html>
  <html lang="th"><head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>${title} - ${j.booking_code || "งาน #" + j.job_id}</title>
    <style>
      body{ font-family: system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif; padding:24px; color:#0f172a;}
      .top{ display:flex; justify-content:space-between; gap:16px; align-items:flex-start;}
      .box{ border:1px solid rgba(15,23,42,.15); border-radius:12px; padding:14px; }
      table{ width:100%; border-collapse:collapse; margin-top:12px;}
      th,td{ border:1px solid rgba(15,23,42,.15); padding:8px; font-size:14px;}
      th{ background: rgba(37,99,235,.08); text-align:left;}
      .muted{ color:#64748b;}
      @media print{ .noprint{ display:none; } }
    </style>
  </head><body>
    <div class="top">
      <div style="display:flex;gap:12px;align-items:center;">
        <img src="/logo.png" alt="CWF" style="width:54px;height:54px;border-radius:14px;object-fit:cover;"/>
        <div>
          <h2 style="margin:0;">${title}</h2>
          <div class="muted"><b>${COMPANY_NAME}</b></div>
          <div class="muted">${COMPANY_ADDRESS}</div>
          <div class="muted">โทร ${COMPANY_PHONE} | LINE ${COMPANY_LINE}</div>
        </div>
      </div>
      <div class="box">
        <div><b>${j.booking_code || "งาน #" + j.job_id}</b></div>
        <div class="muted">วันที่พิมพ์: ${new Date().toLocaleString("th-TH")}</div>
      </div>
    </div>

    <div class="box" style="margin-top:14px;">
      <div><b>ลูกค้า:</b> ${j.customer_name}</div>
      <div><b>โทร:</b> ${j.customer_phone || "-"}</div>
      <div><b>ประเภทงาน:</b> ${j.job_type}</div>
      <div><b>นัด:</b> ${j.appointment_datetime ? new Date(j.appointment_datetime).toLocaleString("th-TH") : "-"}</div>
      <div><b>ที่อยู่:</b> ${j.address_text || "-"}</div>
    </div>

    <table>
      <thead><tr>
        <th>รายการ</th><th style="text-align:right;">จำนวน</th><th style="text-align:right;">ราคา/หน่วย</th><th style="text-align:right;">รวม</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="box" style="margin-top:12px;">
      ${promoLine}
      <div>รวมก่อนลด: <b>${money(data.subtotal)}</b> บาท</div>
      <div>ส่วนลด: <b>${money(data.discount)}</b> บาท</div>
      <div style="font-size:18px;margin-top:6px;">ยอดสุทธิ: <b>${money(data.total)}</b> บาท</div>
    </div>
    <div class="box" style="margin-top:12px;">
      <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start;">
        <div style="flex:1;min-width:240px;">
          <div><b>ข้อมูลการชำระเงิน</b></div>
          ${BANK_NAME || BANK_ACCOUNT ? `
            <div class="muted" style="margin-top:6px;">โอนเข้าบัญชี: <b>${BANK_NAME}</b></div>
            <div class="muted">เลขบัญชี: <b>${BANK_ACCOUNT}</b></div>
          ` : `<div class="muted" style="margin-top:6px;">(ยังไม่ได้ตั้งค่าบัญชีใน .env)</div>`}
        </div>
        <div style="width:170px;">
          ${BANK_QR_URL ? `<img src="${BANK_QR_URL}" alt="QR" style="width:170px;height:auto;border:1px solid rgba(15,23,42,.15);border-radius:12px;">` : ``}
        </div>
      </div>
    </div>

    <div class="box" style="margin-top:12px;">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div style="flex:1;min-width:240px;">
          <div class="muted">ลายเซ็นผู้รับเงิน / ผู้ให้บริการ</div>
          <div style="height:70px;border-bottom:1px dashed rgba(15,23,42,.35);margin-top:8px;"></div>
          <div class="muted" style="margin-top:6px;">(${COMPANY_NAME})</div>
        </div>
        <div style="width:220px;text-align:center;">
          ${j.final_signature_path ? `
            <div class="muted">ลายเซ็นลูกค้า</div>
            <img src="${j.final_signature_path}" alt="signature" style="width:220px;height:auto;border:1px solid rgba(15,23,42,.15);border-radius:12px;margin-top:6px;">
          ` : `<div class="muted">ลายเซ็นลูกค้า: -</div>`}
        </div>
      </div>
    </div>

    <div class="noprint" style="margin-top:12px;">
      <button onclick="window.print()">🖨️ พิมพ์/บันทึกเป็น PDF</button>
    </div>
  </body></html>`;
}



function eSlipHtml(data, slipUrl) {
  const j = data.job;

  const COMPANY_NAME = process.env.COMPANY_NAME || "Coldwindflow air services";
  const COMPANY_ADDRESS = process.env.COMPANY_ADDRESS || "23/61 ถ.พึ่งมี 50 แขวงบางจาก เขตพระโขนง กรุงเทพฯ 10260";
  const COMPANY_PHONE = process.env.COMPANY_PHONE || "098-877-7321";
  const COMPANY_LINE = process.env.COMPANY_LINE || "@cwfair";

  const BANK_QR_URL = process.env.COMPANY_BANK_QR_URL || "";

  const phoneDigits = String(COMPANY_PHONE || "").replace(/[^0-9]/g, "");
  const total = Number(data.total || 0);
  const qrUrl = BANK_QR_URL || (phoneDigits ? `https://promptpay.io/${phoneDigits}/${total.toFixed(2)}.png` : "");

  const rows =
    data.items && data.items.length
      ? data.items
          .map(
            (it) => `
      <tr>
        <td>${it.item_name}</td>
        <td style="text-align:right;">${it.qty}</td>
        <td style="text-align:right;">${money(it.unit_price)}</td>
        <td style="text-align:right;">${money(it.line_total)}</td>
      </tr>`
          )
          .join("")
      : `<tr><td colspan="4">-</td></tr>`;

  const paidAt = j.paid_at ? new Date(j.paid_at).toLocaleString("th-TH") : new Date().toLocaleString("th-TH");

  return `<!doctype html>
  <html lang="th"><head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>e-slip - ${j.booking_code || "งาน #" + j.job_id}</title>
    <style>
      body{ font-family: system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif; padding:18px; color:#0f172a; background:#f8fafc;}
      .card{ background:#fff;border:1px solid rgba(15,23,42,.12); border-radius:16px; padding:14px; box-shadow: 0 12px 25px rgba(2,6,23,.08); }
      .row{ display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:flex-start;}
      .muted{ color:#64748b; font-size:13px;}
      table{ width:100%; border-collapse:collapse; margin-top:12px;}
      th,td{ border:1px solid rgba(15,23,42,.12); padding:8px; font-size:13px;}
      th{ background: rgba(37,99,235,.08); text-align:left;}
      @media print{ .noprint{ display:none; } body{ background:#fff; } }
    </style>
  </head><body>
    <div class="card">
      <div class="row">
        <div style="display:flex;gap:10px;align-items:center;">
          <img src="/logo.png" alt="CWF" style="width:44px;height:44px;border-radius:14px;object-fit:cover;"/>
          <div>
            <div style="font-size:18px;font-weight:900;">e-slip</div>
            <div class="muted"><b>${COMPANY_NAME}</b></div>
            <div class="muted">${COMPANY_ADDRESS}</div>
            <div class="muted">โทร ${COMPANY_PHONE} | LINE ${COMPANY_LINE}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:900;">${j.booking_code || "งาน #" + j.job_id}</div>
          <div class="muted">ชำระเมื่อ: ${paidAt}</div>
        </div>
      </div>

      <div class="card" style="margin-top:12px;background:#fff;">
        <div><b>ลูกค้า:</b> ${j.customer_name}</div>
        <div><b>โทร:</b> ${j.customer_phone || "-"}</div>
        <div><b>ประเภทงาน:</b> ${j.job_type}</div>
        <div><b>ที่อยู่:</b> ${j.address_text || "-"}</div>
      </div>

      <table>
        <thead><tr>
          <th>รายการ</th><th style="text-align:right;">จำนวน</th><th style="text-align:right;">ราคา/หน่วย</th><th style="text-align:right;">รวม</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="card" style="margin-top:12px;background:#fff;">
        <div class="row" style="align-items:center;">
          <div>
            <div class="muted">ยอดสุทธิ</div>
            <div style="font-size:22px;font-weight:900;">${money(total)} บาท</div>
          </div>
          <div style="text-align:center;min-width:170px;">
            ${qrUrl ? `<img src="${qrUrl}" alt="QR" style="width:160px;height:auto;border:1px solid rgba(15,23,42,.12);border-radius:14px;background:#fff;">` : ``}
            <div class="muted" style="margin-top:6px;">QR Payment</div>
          </div>
        </div>
      </div>

      ${slipUrl ? `
        <div class="card" style="margin-top:12px;background:#fff;">
          <div style="font-weight:800;">สลิปที่แนบ</div>
          <img src="${slipUrl}" alt="slip" style="width:100%;max-width:520px;margin-top:8px;border-radius:14px;border:1px solid rgba(15,23,42,.12);">
        </div>
      ` : ``}

      <div class="noprint" style="margin-top:12px;">
        <button onclick="window.print()">🖨️ พิมพ์/บันทึกเป็น PDF</button>
      </div>
    </div>
  </body></html>`;
}


app.get("/docs/quote/:job_id", async (req, res) => {
  const job_id = Number(req.params.job_id);
  const data = await getJobDocData(job_id);
  if (!data) return res.status(404).send("ไม่พบงาน");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(docHtml("ใบเสนอราคา", data));
});

app.get("/docs/receipt/:job_id", async (req, res) => {
  const job_id = Number(req.params.job_id);
  const data = await getJobDocData(job_id);
  if (!data) return res.status(404).send("ไม่พบงาน");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(docHtml("ใบเสร็จรับเงิน", data));
});


app.get("/docs/eslip/:job_id", async (req, res) => {
  const job_id = Number(req.params.job_id);
  if (!job_id) return res.status(400).send("job_id ไม่ถูกต้อง");

  try {
    const data = await getJobDocData(job_id);
    if (!data) return res.status(404).send("ไม่พบงาน");

    // ✅ ดึงสลิป (ถ้ามี) - phase = payment_slip
    const slipR = await pool.query(
      `SELECT public_url
       FROM public.job_photos
       WHERE job_id=$1 AND phase='payment_slip' AND public_url IS NOT NULL
       ORDER BY photo_id DESC
       LIMIT 1`,
      [job_id]
    );
    const slipUrl = slipR.rows?.[0]?.public_url || null;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(eSlipHtml(data, slipUrl));
  } catch (e) {
    console.error(e);
    res.status(500).send("สร้าง e-slip ไม่สำเร็จ");
  }
});


// =======================================
// 🌍 PUBLIC (ลูกค้าจองเอง/ติดตามงาน)
// =======================================
app.get("/public/availability", async (req, res) => {
  const date = (req.query.date || new Date().toISOString().slice(0, 10)).toString();
  const start = (req.query.start || "08:00").toString();
  const end = (req.query.end || "18:00").toString();
  const slotMin = Math.max(15, Math.min(120, Number(req.query.slot_min || 30)));

  try {
    const techR = await pool.query(`
      SELECT COUNT(*)::int AS cnt
      FROM public.users u
      LEFT JOIN public.technician_profiles p ON p.username=u.username
      WHERE u.role='technician'
        AND COALESCE(p.accept_status,'ready') <> 'paused'
    `);
    const techCount = techR.rows[0]?.cnt || 0;

    const jobsR = await pool.query(
      `SELECT appointment_datetime, COALESCE(duration_min,60) AS duration_min
       FROM public.jobs
       WHERE appointment_datetime::date = $1::date
         AND job_status <> 'ยกเลิก'`,
      [date]
    );

    const toMin = (hhmm) => {
      const [h, m] = hhmm.split(":").map((x) => Number(x || 0));
      return h * 60 + m;
    };
    const startMin = toMin(start);
    const endMin = toMin(end);

    const slots = [];
    for (let t = startMin; t + slotMin <= endMin; t += slotMin) slots.push(t);

    const jobWindows = jobsR.rows.map((j) => {
      const d = new Date(j.appointment_datetime);
      const hhmm = d.toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false });
      const [hh, mm] = hhmm.split(":").map((x) => Number(x || 0));
      const m = hh * 60 + mm;
      const dur = Number(j.duration_min || 60);
      const buffer = 30;
      return { start: m - buffer, end: m + dur + buffer };
    });

    const result = slots.map((t) => {
      const busy = jobWindows.reduce((acc, w) => {
        const overlap = t < w.end && t + slotMin > w.start;
        return acc + (overlap ? 1 : 0);
      }, 0);
      return {
        time: `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`,
        available: techCount === 0 ? false : busy < techCount,
        capacity: techCount,
        busy,
      };
    });

    res.json({ date, start, end, slot_min: slotMin, tech_count: techCount, slots: result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "โหลดตารางว่างไม่สำเร็จ" });
  }
});

app.post("/public/book", async (req, res) => {
  // ✅ ลูกค้าจองคิว (ไม่บังคับกรอก lat/lng) + เลือกรายการบริการ/สินค้าได้
  // - โปรโมชั่น: ให้แอดมินเป็นคนใส่/ลบเท่านั้น (ฝั่งลูกค้าไม่รับ promo_id)
  const {
    customer_name,
    customer_phone,
    job_type,
    appointment_datetime,
    address_text,
    customer_note,
    maps_url,
    job_zone,
    items, // [{item_id, qty}]
  } = req.body || {};

  if (!customer_name || !job_type || !appointment_datetime || !address_text) {
    return res.status(400).json({ error: "กรอกข้อมูลไม่ครบ (ชื่อ/ประเภทงาน/วันนัด/ที่อยู่)" });
  }

  // ✅ sanitize items (ไม่เชื่อราคา/ชื่อจากฝั่งลูกค้า)
  const safeItemsIn = Array.isArray(items) ? items : [];
  const itemIdQty = safeItemsIn
    .map((x) => ({ item_id: Number(x.item_id), qty: Number(x.qty || 1) }))
    .filter((x) => Number.isFinite(x.item_id) && x.item_id > 0 && Number.isFinite(x.qty) && x.qty > 0);

  const token = genToken(12);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) ดึงราคา base_price จาก DB
    let computedItems = [];
    let total = 0;

    if (itemIdQty.length) {
      const ids = itemIdQty.map((x) => x.item_id);
      const catR = await client.query(
        `SELECT item_id, item_name, base_price
         FROM public.catalog_items
         WHERE is_active=TRUE AND item_id = ANY($1::bigint[])`,
        [ids]
      );

      const map = new Map(catR.rows.map((r) => [Number(r.item_id), r]));
      computedItems = itemIdQty
        .map((x) => {
          const it = map.get(Number(x.item_id));
          if (!it) return null;
          const qty = Number(x.qty);
          const unit_price = Number(it.base_price || 0);
          const line_total = qty * unit_price;
          total += line_total;
          return {
            item_id: Number(it.item_id),
            item_name: it.item_name,
            qty,
            unit_price,
            line_total,
          };
        })
        .filter(Boolean);
    }

    // 2) สร้างงาน
    const r = await client.query(
      `
      INSERT INTO public.jobs
      (customer_name, customer_phone, job_type, appointment_datetime, job_price,
       address_text, technician_team, technician_username, job_status,
       booking_token, job_source, dispatch_mode, customer_note,
       maps_url, job_zone)
      VALUES ($1,$2,$3,$4,$5,$6,NULL,NULL,'รอดำเนินการ',$7,'customer','offer',$8,$9,$10)
      RETURNING job_id, booking_token
      `,
      [
        String(customer_name).trim(),
        (customer_phone || "").toString().trim(),
        String(job_type).trim(),
        appointment_datetime,
        Number(total || 0),
        String(address_text).trim(),
        token,
        (customer_note || "").toString(),
        (maps_url || "").toString(),
        (job_zone || "").toString(),
      ]
    );

    const job_id = r.rows[0].job_id;
    // ✅ booking_code (สุ่ม ไม่เรียง)
    const booking_code = await generateUniqueBookingCode(client);

    await client.query(`UPDATE public.jobs SET booking_code=$1 WHERE job_id=$2`, [booking_code, job_id]);

    // 3) บันทึกรายการ (ถ้ามี)
    for (const it of computedItems) {
      await client.query(
        `
        INSERT INTO public.job_items (job_id, item_id, item_name, qty, unit_price, line_total)
        VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [job_id, it.item_id, it.item_name, it.qty, it.unit_price, it.line_total]
      );
    }

    await client.query("COMMIT");

    res.json({ success: true, job_id, booking_code, token: r.rows[0].booking_token });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: e.message || "จองงานไม่สำเร็จ" });
  } finally {
    client.release();
  }
});

app.get("/public/track", async (req, res) => {
  const q = (req.query.q || req.query.token || req.query.booking_code || "").toString().trim();
  if (!q) return res.status(400).json({ error: "ต้องส่ง q (token หรือ booking_code)" });

  try {
    const r = await pool.query(
      `
      SELECT
        j.job_id, j.booking_code, j.booking_token,
        j.customer_name, j.customer_phone, j.job_type,
        j.appointment_datetime, j.job_status,
        j.address_text, j.gps_latitude, j.gps_longitude, j.maps_url, j.job_zone,
        j.technician_username, j.technician_team,
        j.travel_started_at, j.checkin_at, j.started_at, j.finished_at, j.canceled_at, j.cancel_reason,
        j.technician_note,
        j.customer_rating, j.customer_review, j.customer_complaint, j.reviewed_at,
        tp.full_name AS tech_name, tp.photo_path AS tech_photo, tp.rating, tp.grade, tp.phone AS tech_phone
      FROM public.jobs j
      LEFT JOIN public.technician_profiles tp ON tp.username = j.technician_username
      WHERE (j.booking_token=$1 OR j.booking_code=$1)
      LIMIT 1
      `,
      [q]
    );

    if (r.rows.length === 0) return res.status(404).json({ error: "ไม่พบงาน" });

    const row = r.rows[0];
    const origin = `${req.protocol}://${req.get("host")}`;

    // ✅ รูป/หมายเหตุ แสดงเฉพาะหลังปิดงาน
    const isDone = String(row.job_status || "").trim() === "เสร็จแล้ว";

    // ✅ กันลูกค้าสับสน: สถานะ "ตีกลับ" เป็นสถานะภายใน (ให้ลูกค้าเห็นเป็นรอดำเนินการ)
    const rawStatus = String(row.job_status || "").trim();
    const publicStatus = rawStatus === "ตีกลับ" ? "รอดำเนินการ" : rawStatus;

    let photos = [];
    if (isDone) {
      const pr = await pool.query(
        `SELECT photo_id, phase, created_at, uploaded_at, public_url
         FROM public.job_photos
         WHERE job_id=$1 AND public_url IS NOT NULL
         ORDER BY photo_id ASC`,
        [row.job_id]
      );
      photos = pr.rows || [];
    }

    res.json({
      job_id: row.job_id,
      booking_code: row.booking_code || null,
      booking_token: row.booking_token || null,
      customer_name: row.customer_name,
      customer_phone: row.customer_phone || null,
      job_type: row.job_type,
      appointment_datetime: row.appointment_datetime,
      job_status: publicStatus,
      address_text: row.address_text,
      maps_url: row.maps_url || null,
      job_zone: row.job_zone || null,
      gps_latitude: row.gps_latitude,
      gps_longitude: row.gps_longitude,

      travel_started_at: row.travel_started_at,
      checkin_at: row.checkin_at,
      started_at: row.started_at,
      finished_at: row.finished_at,
      canceled_at: row.canceled_at,
      cancel_reason: row.cancel_reason || null,

      // ✅ notes/photos only after done
      technician_note: isDone ? (row.technician_note || "") : null,
      photos,

      receipt_url: isDone ? `${origin}/docs/receipt/${row.job_id}` : null,

      review: {
        already_reviewed: !!row.customer_rating,
        rating: row.customer_rating || null,
        review_text: row.customer_review || null,
        complaint_text: row.customer_complaint || null,
        reviewed_at: row.reviewed_at || null,
      },

      technician: row.technician_username
        ? {
            username: row.technician_username,
            full_name: row.tech_name,
            photo: row.tech_photo,
            rating: row.rating,
            grade: row.grade,
            // ✅ ให้ลูกค้าเห็นเบอร์ "หลังเริ่มเดินทาง" เท่านั้น
            phone: row.travel_started_at ? (row.tech_phone || null) : null,
          }
        : null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "ติดตามงานไม่สำเร็จ" });
  }
});


// =======================================
// ⭐ PUBLIC REVIEW (ลูกค้าให้คะแนน/รีวิว หลังปิดงาน)
// - ยืนยันด้วย booking_code หรือ token
// - จำกัด 1 รีวิวต่อ 1 job_id
// =======================================
app.post("/public/review", async (req, res) => {
  const { q, booking_code, token, rating, review_text, complaint_text } = req.body || {};
  const key = (q || booking_code || token || "").toString().trim();
  const star = Number(rating);

  if (!key) return res.status(400).json({ error: "ต้องส่ง booking_code หรือ token" });
  if (!Number.isFinite(star) || star < 1 || star > 5) return res.status(400).json({ error: "rating ต้องอยู่ระหว่าง 1-5" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const jr = await client.query(
      `SELECT job_id, job_status, technician_username, customer_rating
       FROM public.jobs
       WHERE booking_code=$1 OR booking_token=$1
       LIMIT 1
       FOR UPDATE`,
      [key]
    );

    if (!jr.rows.length) throw new Error("ไม่พบงาน");
    const job = jr.rows[0];

    if (String(job.job_status || "").trim() !== "เสร็จแล้ว") {
      throw new Error("งานยังไม่ปิด ไม่สามารถให้คะแนนได้");
    }
    if (job.customer_rating) {
      throw new Error("งานนี้ให้คะแนนไปแล้ว");
    }
    if (!job.technician_username) {
      throw new Error("งานนี้ยังไม่มีช่างรับงาน");
    }

    await client.query(
      `INSERT INTO public.technician_reviews (job_id, technician_username, rating, review_text, complaint_text)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (job_id) DO NOTHING`,
      [
        job.job_id,
        job.technician_username,
        Math.round(star),
        (review_text || "").toString().trim() || null,
        (complaint_text || "").toString().trim() || null,
      ]
    );

    await client.query(
      `UPDATE public.jobs
       SET customer_rating=$1,
           customer_review=$2,
           customer_complaint=$3,
           reviewed_at=NOW()
       WHERE job_id=$4`,
      [
        Math.round(star),
        (review_text || "").toString().trim() || null,
        (complaint_text || "").toString().trim() || null,
        job.job_id,
      ]
    );

    // ✅ อัปเดตคะแนนเฉลี่ยลงโปรไฟล์ (เก็บในคอลัมน์ rating)
    const ar = await client.query(
      `SELECT AVG(rating)::numeric(10,2) AS avg_rating
       FROM public.technician_reviews
       WHERE technician_username=$1`,
      [job.technician_username]
    );
    const avg = Number(ar.rows[0]?.avg_rating || 0);

    await client.query(
      `UPDATE public.technician_profiles
       SET rating=$1
       WHERE username=$2`,
      [avg, job.technician_username]
    );

    await client.query("COMMIT");
    res.json({ success: true, avg_rating: avg });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: e.message || "ส่งรีวิวไม่สำเร็จ" });
  } finally {
    client.release();
  }
});

// =======================================
// ⭐ TECH REVIEWS (ช่างดูข้อความรีวิว)
// =======================================
app.get("/technicians/:username/reviews", async (req, res) => {
  const username = (req.params.username || "").toString().trim();
  if (!username) return res.status(400).json({ error: "username หาย" });

  try {
    const r = await pool.query(
      `SELECT review_id, job_id, rating, review_text, complaint_text, created_at
       FROM public.technician_reviews
       WHERE technician_username=$1
       ORDER BY created_at DESC
       LIMIT 50`,
      [username]
    );
    res.json(r.rows || []);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "โหลดรีวิวไม่สำเร็จ" });
  }
});

// =======================================
// 🕘 ATTENDANCE
// =======================================
app.get("/attendance/status/:username", async (req, res) => {
  const { username } = req.params;
  try {
    const r = await pool.query(
      `SELECT attendance_id, clock_in_at, clock_out_at
       FROM public.technician_attendance
       WHERE username=$1
       ORDER BY created_at DESC
       LIMIT 1`,
      [username]
    );
    res.json(r.rows[0] || { clock_in_at: null, clock_out_at: null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "โหลดสถานะตอกบัตรไม่สำเร็จ" });
  }
});

app.post("/attendance/clockin", async (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: "ต้องส่ง username" });
  try {
    const r = await pool.query(
      `INSERT INTO public.technician_attendance (username, clock_in_at) VALUES ($1, NOW())
       RETURNING attendance_id, clock_in_at`,
      [username]
    );
    res.json({ success: true, ...r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "ตอกบัตรเข้าไม่สำเร็จ" });
  }
});

app.post("/attendance/clockout", async (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: "ต้องส่ง username" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const r = await client.query(
      `SELECT attendance_id
       FROM public.technician_attendance
       WHERE username=$1 AND clock_out_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [username]
    );
    if (r.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "ยังไม่ได้ตอกบัตรเข้า" });
    }

    const attendance_id = r.rows[0].attendance_id;

    const u = await client.query(
      `UPDATE public.technician_attendance
       SET clock_out_at = NOW()
       WHERE attendance_id=$1
       RETURNING attendance_id, clock_in_at, clock_out_at`,
      [attendance_id]
    );

    await client.query("COMMIT");
    res.json({ success: true, ...u.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "ตอกบัตรออกไม่สำเร็จ" });
  } finally {
    client.release();
  }
});

app.get("/admin/attendance/today", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT username,
              MAX(clock_in_at) AS last_clock_in,
              MAX(clock_out_at) AS last_clock_out
       FROM public.technician_attendance
       WHERE created_at::date = NOW()::date
       GROUP BY username
       ORDER BY username`
    );
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "โหลดตอกบัตรวันนี้ไม่สำเร็จ" });
  }
});

// =======================================
// 🌐 SERVE FRONTEND
// =======================================
const FRONTEND_DIR = path.join(__dirname, "frontend");
const ROOT_DIR = __dirname;

if (fs.existsSync(FRONTEND_DIR)) app.use(express.static(FRONTEND_DIR));
app.use(express.static(ROOT_DIR));

function sendHtml(file) {
  const p1 = path.join(FRONTEND_DIR, file);
  const p2 = path.join(ROOT_DIR, file);
  return fs.existsSync(p1) ? p1 : p2;
}

app.get("/login.html", (req, res) => res.sendFile(sendHtml("login.html")));
app.get("/admin.html", (req, res) => res.sendFile(sendHtml("admin.html")));
app.get("/admin-tech.html", (req, res) => res.sendFile(sendHtml("admin-tech.html")));
app.get("/edit-profile.html", (req, res) => res.sendFile(sendHtml("edit-profile.html")));
app.get("/tech.html", (req, res) => res.sendFile(sendHtml("tech.html")));
app.get("/add-job.html", (req, res) => res.sendFile(sendHtml("add-job.html")));
app.get("/index.html", (req, res) => res.sendFile(sendHtml("index.html")));
app.get("/", (req, res) => res.sendFile(sendHtml("login.html")));

// =======================================
// ✅ START SERVER (HTTPS first, fallback HTTP)
// =======================================
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const CERT_KEY_PATH = process.env.HTTPS_KEY_PATH || "./cert/192.168.1.105+2-key.pem";
const CERT_CRT_PATH = process.env.HTTPS_CERT_PATH || "./cert/192.168.1.105+2.pem";

function startServer() {
  try {
    if (fs.existsSync(CERT_KEY_PATH) && fs.existsSync(CERT_CRT_PATH)) {
      const options = {
        key: fs.readFileSync(CERT_KEY_PATH),
        cert: fs.readFileSync(CERT_CRT_PATH),
      };

      https.createServer(options, app).listen(PORT, HOST, () => {
        console.log(`🔒 HTTPS CWF Server running`);
        console.log(`🔒 Local: https://localhost:${PORT}`);
      });
      return;
    }
  } catch (e) {
    console.error("HTTPS init failed, fallback to HTTP:", e);
  }

  app.listen(PORT, HOST, () => {
    console.log(`🌐 HTTP CWF Server running at http://localhost:${PORT}`);
  });
}

startServer();
