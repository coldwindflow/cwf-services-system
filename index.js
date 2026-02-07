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

// =======================================
// 🚩 FEATURE FLAGS (safe / backward compatible)
// - เปิด/ปิดการโชว์ทีมช่าง + เบอร์โทรใน Tracking แบบไม่กระทบของเดิม
// - ค่าเริ่มต้น: เปิด (true) ตาม requirement และยังต้องผ่านลิงก์ tracking ที่ถูกต้องเท่านั้น
// =======================================
function envBool(name, defVal = false) {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  if (!v) return defVal;
  return ["1", "true", "yes", "on"].includes(v);
}

const FLAG_SHOW_TECH_TEAM_ON_TRACKING = envBool("SHOW_TECH_TEAM_ON_TRACKING", true);
const FLAG_SHOW_TECH_PHONE_ON_TRACKING = envBool("SHOW_TECH_PHONE_ON_TRACKING", true);

const ENABLE_AVAILABILITY_V2 = envBool("ENABLE_AVAILABILITY_V2", true);
// ✅ Safe toggle: urgent offer flow (public booking + offers)
const ENABLE_URGENT_FLOW = envBool("ENABLE_URGENT_FLOW", true);
const TRAVEL_BUFFER_MIN = Math.max(0, Number(process.env.TRAVEL_BUFFER_MIN || 30)); // นาที/งาน (Travel Buffer)


// ==============================
// 🧭 GPS/Maps Resolver (safe)
// - รองรับ maps.app.goo.gl (short link)
// - พยายามดึง lat/lng จาก URL หรือ HTML (best-effort)
// - มี allowlist + timeout + จำกัดขนาด response กัน SSRF/ค้าง
// ==============================
const MAPS_ALLOW_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "google.com",
  "www.google.com",
  "maps.google.com",
  "google.co.th",
  "www.google.co.th",
]);

function extractLatLngFromText(text) {
  if (!text) return null;
  const s = String(text);

  // 1) @lat,lng
  {
    const m = s.match(/@\s*(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]), via: "@" };
  }

  // 2) q=lat,lng | query=lat,lng | ll=lat,lng
  {
    const m = s.match(/[?&](?:q|query|ll)=\s*(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]), via: "q" };
  }

  // 3) !3dlat!4dlng
  {
    const m = s.match(/!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]), via: "3d4d" };
  }

  // 4) center=lat%2Clng (อาจถูก encode)
  try {
    const decoded = decodeURIComponent(s);
    const m = decoded.match(/[?&]center=\s*(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]), via: "center" };
  } catch (_) {}

  // 5) JSON-ish "lat":..,"lng":..
  {
    const m = s.match(/"lat"\s*:\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*"lng"\s*:\s*(-?\d{1,3}(?:\.\d+)?)/);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]), via: "json" };
  }

  return null;
}

async function fetchWithTimeout(url, ms, opts = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      ...opts,
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (CWF Maps Resolver)",
        ...(opts.headers || {}),
      },
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function resolveMapsUrlToLatLng(inputUrl) {
  const u = new URL(inputUrl);
  if (!MAPS_ALLOW_HOSTS.has(u.hostname)) {
    throw new Error("HOST_NOT_ALLOWED");
  }

  // 1) fetch ตาม redirect เพื่อให้ได้ res.url (ลิงก์เต็ม)
  const res = await fetchWithTimeout(u.toString(), 6000, { method: "GET" });
  const finalUrl = res.url || u.toString();

  // 2) พยายามดึงจาก URL ก่อน
  const fromUrl = extractLatLngFromText(finalUrl);
  if (fromUrl) return { ...fromUrl, resolvedUrl: finalUrl };

  // 3) ถ้ายังไม่ได้ → อ่าน HTML แล้วหา pattern
  const ctype = String(res.headers.get("content-type") || "");
  let body = "";
  if (ctype.includes("text") || ctype.includes("html") || ctype.includes("json")) {
    // จำกัดขนาดอ่านกันกินแรม
    const raw = await res.text();
    body = raw.slice(0, 200_000);
  }

  // 3.1) หา @lat,lng ใน HTML
  const fromHtmlDirect = extractLatLngFromText(body);
  if (fromHtmlDirect) return { ...fromHtmlDirect, resolvedUrl: finalUrl };

  // 3.2) หา canonical / maps URL ที่ฝังอยู่
  const mUrl = body.match(/https?:\/\/[^\s"']*google\.[^\s"']*\/maps[^\s"']*/i);
  if (mUrl) {
    const fromEmbed = extractLatLngFromText(mUrl[0]);
    if (fromEmbed) return { ...fromEmbed, resolvedUrl: finalUrl, embeddedUrl: mUrl[0] };
  }

  return { lat: null, lng: null, via: "not_found", resolvedUrl: finalUrl };
}
const fs = require("fs");
const https = require("https");
const crypto = require("crypto");
const multer = require("multer");

const pool = require("./db");

const app = express();
app.use(cors());
app.use(express.json());


// =======================================
// 🔐 AUTH (minimal) for admin-only rank update
// - ระบบเดิมใช้ localStorage/cookie (cwf_auth) ฝั่ง client
// - สำหรับงานนี้: กันสิทธิ์ "แก้แรงค์" ที่ฝั่ง server ด้วยการ
//   1) อ่าน cookie cwf_auth (base64 JSON: {u,r,exp})
//   2) validate exp
//   3) เช็คซ้ำกับ DB ว่า user นั้น role=admin จริง
// =======================================
function parseCookies(cookieHeader) {
  const out = {};
  const raw = String(cookieHeader || "");
  raw.split(";").forEach((part) => {
    const s = part.trim();
    if (!s) return;
    const idx = s.indexOf("=");
    if (idx <= 0) return;
    const k = s.slice(0, idx).trim();
    const v = s.slice(idx + 1).trim();
    out[k] = v;
  });
  return out;
}

function parseCwfAuth(req) {
  try {
    const cookies = parseCookies(req.headers?.cookie || "");
    let token = cookies.cwf_auth;
    if (!token) return null;

    // cookie อาจถูก encode/quote มาได้ (บาง browser/hosting)
    token = token.replace(/^"|"$/g, "");
    try { token = decodeURIComponent(token); } catch (_) {}

    // รองรับทั้งแบบ base64 JSON และแบบ JSON ตรงๆ (กันของเดิม/ของหลุด)
    let obj;
    try {
      obj = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    } catch (_e) {
      obj = JSON.parse(token);
    }
    if (!obj || !obj.u || !obj.r) return null;
    if (obj.exp && Date.now() > Number(obj.exp)) return null;
    return { username: String(obj.u), role: String(obj.r) };
  } catch (_) {
    return null;
  }
}

async function requireAdminForRank(req, res, next) {
  try {
    const auth = parseCwfAuth(req);
    if (!auth) return res.status(401).json({ error: "UNAUTHORIZED" });
    const q = await pool.query(
      `SELECT username FROM public.users WHERE username=$1 AND role='admin' LIMIT 1`,
      [auth.username]
    );
    if ((q.rows || []).length === 0) return res.status(403).json({ error: "FORBIDDEN" });
    req.auth = auth;
    return next();
  } catch (e) {
    console.error("requireAdminForRank error:", e);
    return res.status(500).json({ error: "AUTH_FAILED" });
  }
}

// =======================================
// 🔎 Health / Version (ใช้เช็คว่า deploy ล่าสุดจริง)
// =======================================
app.get("/api/version", (req, res) => {
  res.json({ ok: true, version: "gps-v4", ts: new Date().toISOString() });
});

// =======================================
// 📍 Resolve Google Maps URL -> lat/lng (best-effort)
// รองรับ: maps.app.goo.gl + ลิงก์เต็ม + วางพิกัดตรงๆ
// =======================================
app.get("/api/maps/resolve", async (req, res) => {
  try {
    const input = String(req.query.url || "").trim();
    if (!input) return res.status(400).json({ error: "MISSING_URL" });

    // 1) ถ้าวางพิกัดตรงๆ เช่น 13.705,100.601
    const direct = extractLatLngFromText(input);
    if (direct && Number.isFinite(direct.lat) && Number.isFinite(direct.lng)) {
      return res.json({ ok: true, lat: direct.lat, lng: direct.lng, via: "direct", resolvedUrl: input });
    }

    // 2) ต้องเป็น URL
    let u;
    try {
      u = new URL(input);
    } catch (_) {
      return res.status(400).json({ error: "INVALID_URL" });
    }

    // 3) Resolve เฉพาะโดเมนที่อนุญาต
    const r = await resolveMapsUrlToLatLng(u.toString());
    return res.json({ ok: true, ...r });
  } catch (e) {
    const msg = String(e?.message || "");
    if (msg === "HOST_NOT_ALLOWED") return res.status(400).json({ error: "HOST_NOT_ALLOWED" });
    console.error("/api/maps/resolve error:", e);
    return res.status(500).json({ error: "RESOLVE_FAILED" });
  }
});

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
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS booking_mode TEXT DEFAULT 'scheduled'`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS admin_override_duration_min INT`);

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
    await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'company'`);
    await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS work_start TEXT DEFAULT '09:00'`);
    await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS work_end TEXT DEFAULT '18:00'`);


    // 3.4) technician_profiles: ✅ Premium Rank (Lv.1-5)
    // - Backward compatible: เก็บเพิ่ม โดยไม่แตะ/เปลี่ยนความหมายของ position เดิม
    await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS rank_level INT`);
    await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS rank_key TEXT`);

    // backfill: ถ้า rank_level ยังว่าง ให้ map จาก position เดิมแบบปลอดภัย
    // junior -> Lv.2 Technician, senior -> Lv.3 Senior Technician, lead -> Lv.4 Team Lead, founder_ceo -> Lv.5 Head Supervisor, null/อื่น ๆ -> Lv.1 Apprentice
    await pool.query(`
      UPDATE public.technician_profiles
      SET rank_level = CASE
        WHEN rank_level IS NOT NULL THEN rank_level
        WHEN position='junior' THEN 2
        WHEN position='senior' THEN 3
        WHEN position='lead' THEN 4
        WHEN position='founder_ceo' THEN 5
        ELSE 1
      END,
      rank_key = CASE
        WHEN rank_key IS NOT NULL AND rank_key<>'' THEN rank_key
        WHEN position='junior' THEN 'technician'
        WHEN position='senior' THEN 'senior_technician'
        WHEN position='lead' THEN 'team_lead'
        WHEN position='founder_ceo' THEN 'head_supervisor'
        ELSE 'apprentice'
      END
      WHERE rank_level IS NULL OR rank_key IS NULL OR rank_key=''
    `);


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
await pool.query(`ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS job_category TEXT`);
await pool.query(`ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS ac_type TEXT`);
await pool.query(`ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS btu_min INT`);
await pool.query(`ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS btu_max INT`);
await pool.query(`ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS is_customer_visible BOOLEAN DEFAULT FALSE`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS public.promotions (
    promo_id BIGSERIAL PRIMARY KEY,
    promo_name TEXT NOT NULL,
    promo_type TEXT NOT NULL CHECK (promo_type IN ('percent','amount')),
    promo_value NUMERIC(12,2) DEFAULT 0,
    is_customer_visible BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`);

// backward compatible
await pool.query(`ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS is_customer_visible BOOLEAN DEFAULT FALSE`);

// Backward compatible for existing DBs
await pool.query(`ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS is_customer_visible BOOLEAN DEFAULT FALSE`);

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
// 🔑 CHANGE PASSWORD (Technician)
// - ต้องใส่รหัสเดิม
// - ต้องยืนยันรหัสใหม่ 2 ครั้ง
// หมายเหตุ: ระบบเดิมเก็บรหัสแบบ plaintext (ยังไม่เปลี่ยนเพื่อกัน regression)
// =======================================
app.post("/auth/change-password", async (req, res) => {
  try {
    const username = (req.body?.username || "").toString().trim();
    const oldPassword = (req.body?.old_password || "").toString();
    const newPassword = (req.body?.new_password || "").toString();
    const confirmPassword = (req.body?.confirm_password || "").toString();

    if (!username) return res.status(400).json({ error: "username หาย" });
    if (!oldPassword) return res.status(400).json({ error: "ต้องใส่รหัสเดิม" });
    if (!newPassword) return res.status(400).json({ error: "ต้องใส่รหัสใหม่" });
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "ยืนยันรหัสใหม่ไม่ตรงกัน" });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ error: "รหัสใหม่ต้องยาวอย่างน้อย 4 ตัวอักษร" });
    }

    const r = await pool.query(
      `SELECT username FROM public.users WHERE username=$1 AND password=$2 LIMIT 1`,
      [username, oldPassword]
    );
    if (r.rows.length === 0) {
      return res.status(401).json({ error: "รหัสเดิมไม่ถูกต้อง" });
    }

    await pool.query(`UPDATE public.users SET password=$2 WHERE username=$1`, [username, newPassword]);
    return res.json({ ok: true });
  } catch (e) {
    console.error("POST change-password error:", e);
    return res.status(500).json({ error: "เปลี่ยนรหัสผ่านไม่สำเร็จ" });
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

// =======================================
// 📦 CATALOG
// =======================================
app.get("/catalog/items", async (req, res) => {
  try {
    const customer = String(req.query.customer || "").trim() === "1";
    const job_category = (req.query.job_category || "").toString().trim();
    const ac_type = (req.query.ac_type || "").toString().trim();
    const btu = Number(req.query.btu || 0);

    const where = [`is_active = TRUE`];
    const params = [];
    let p = 1;

    if (customer) where.push(`is_customer_visible = TRUE`);
    if (job_category) { params.push(job_category); where.push(`job_category = $${p++}`); }
    if (ac_type) { params.push(ac_type); where.push(`ac_type = $${p++}`); }
    if (Number.isFinite(btu) && btu > 0) {
      params.push(btu); where.push(`(btu_min IS NULL OR btu_min <= $${p++})`);
      params.push(btu); where.push(`(btu_max IS NULL OR btu_max >= $${p++})`);
    }

    const r = await pool.query(
      `
      SELECT item_id, item_name, item_category, base_price, unit_label, is_active,
             job_category, ac_type, btu_min, btu_max, is_customer_visible
      FROM public.catalog_items
      WHERE ${where.join(" AND ")}
      ORDER BY item_category, item_name
      `,
      params
    );
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
    const isCustomer = String(req.query.customer || "").trim() === "1";
    const r = await pool.query(
      `
      SELECT promo_id, promo_name, promo_type, promo_value, is_customer_visible
      FROM public.promotions
      WHERE is_active = TRUE
        AND ($1::boolean = FALSE OR is_customer_visible = TRUE)
      ORDER BY promo_name
      `,
      [isCustomer]
    );
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
    maps_url,
    job_zone,
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
       maps_url, job_zone,
       gps_latitude, gps_longitude,
       technician_team, technician_username, job_status,
       job_source, dispatch_mode)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'admin',$14)
      RETURNING job_id
      `,
      [
        customer_name,
        customer_phone || "",
        job_type,
        appointment_dt,
        pricing.total,
        address_text || "",
        (String(maps_url || "").trim() || null),
        (String(job_zone || "").trim() || null),
        (() => { const n = Number(gps_latitude); return Number.isFinite(n) ? n : null; })(),
        (() => { const n = Number(gps_longitude); return Number.isFinite(n) ? n : null; })(),
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


// ✅ Team members (primary + assistants) - backward compatible
const tmIn = Array.isArray(team_members) ? team_members : [];
const tmList = [...new Set([selectedTech, ...tmIn].map(x => (x||'').toString().trim()).filter(Boolean))].slice(0, 10);
await client.query(`DELETE FROM public.job_team_members WHERE job_id=$1`, [job_id]);
for (const u of tmList) {
  await client.query(
    `INSERT INTO public.job_team_members (job_id, username, is_primary)
     VALUES ($1,$2,$3)`,
    [job_id, u]
  );
}

    await client.query(`UPDATE public.jobs SET booking_code=$1 WHERE job_id=$2`, [booking_code, job_id]);

    // ✅ Team members (primary + assistants) - backward compatible
    try {
      const tmAll = [...new Set([selectedTech, ...tmList].map(x => (x||"").toString().trim()).filter(Boolean))].slice(0, 10);
      await client.query(`DELETE FROM public.job_team_members WHERE job_id=$1`, [job_id]);
      for (const u of tmAll) {
        await client.query(
          `INSERT INTO public.job_team_members (job_id, username, is_primary)
           VALUES ($1,$2,$3)`,
          [job_id, u, u === selectedTech]
        );
      }
    } catch (e) {
      console.warn("[admin_book_v2] save team members failed", e);
    }

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
    // ASSIGN_COLLISION_V2
    const jobR = await client.query(
      `SELECT appointment_datetime, COALESCE(duration_min,60) AS duration_min FROM public.jobs WHERE job_id=$1 FOR UPDATE`,
      [job_id]
    );
    if (jobR.rows.length === 0) throw new Error("ไม่พบงาน");
    const j = jobR.rows[0];
    const free = await isTechFree(technician_username, j.appointment_datetime, j.duration_min, job_id);
    if (!free) throw new Error("เวลาชนกับงานอื่นของช่าง (รวมเวลาเดินทาง 30 นาที)");


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
// 🚀 ADMIN DISPATCH V2 (สำหรับ Review Queue)
// - ไม่กระทบ endpoint เดิม (/jobs/:job_id/assign)
// - เช็คชนคิวแบบทีม (ทุกคน) + buffer
// - forced: ยืนยันงานให้ช่างทันที (เหมาะกับงานลูกค้าจอง scheduled)
// - offer: ส่ง offer (ใช้กับ partner/urgent หรือกรณีพิเศษ)
// =======================================
app.post("/jobs/:job_id/dispatch_v2", requireAdminSoft, async (req, res) => {
  const job_id = Number(req.params.job_id);
  if (!job_id) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });

  const technician_username = String(req.body?.technician_username || "").trim();
  const mode = String(req.body?.mode || "forced").toLowerCase().trim();
  const members = Array.isArray(req.body?.team_members) ? req.body.team_members : [];

  if (!technician_username) return res.status(400).json({ error: "ต้องระบุ technician_username" });
  if (!['forced','offer'].includes(mode)) return res.status(400).json({ error: "mode ต้องเป็น forced|offer" });

  // team: ต้องมีช่างหลักเสมอ
  const safeTeam = Array.from(new Set([technician_username, ...members].map(x=>String(x||"").trim()).filter(Boolean)));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const jobR = await client.query(
      `SELECT job_id, booking_mode, job_status, appointment_datetime, COALESCE(duration_min,60) AS duration_min
       FROM public.jobs WHERE job_id=$1 FOR UPDATE`,
      [job_id]
    );
    if (!jobR.rows.length) throw new Error('ไม่พบงาน');
    const j = jobR.rows[0];

    // collision check: ทุกคนในทีม
    for (const u of safeTeam) {
      const free = await isTechFree(u, j.appointment_datetime, j.duration_min, job_id);
      if (!free) throw new Error(`เวลาชนกับงานอื่นของช่าง (${u}) (รวมเวลาเดินทาง ${TRAVEL_BUFFER_MIN} นาที)`);
    }

    // อัปเดตทีมในตารางกลางก่อน (เพื่อให้ Tracking/ช่างเห็นครบ)
    await client.query(`DELETE FROM public.job_team_members WHERE job_id=$1`, [job_id]);
    for (const u of safeTeam) {
      await client.query(
        `INSERT INTO public.job_team_members (job_id, username)
         VALUES ($1,$2) ON CONFLICT (job_id, username) DO NOTHING`,
        [job_id, u]
      );
    }

    // set คนหลัก + dispatch_mode
    await client.query(
      `UPDATE public.jobs
       SET technician_username=$1::text,
           technician_team=$1::text,
           dispatch_mode=$2::text
       WHERE job_id=$3`,
      [technician_username, mode === 'offer' ? 'offer' : 'forced', job_id]
    );

    let offer = null;
    if (mode === 'offer') {
      const ready = await isTechReady(technician_username);
      if (!ready) throw new Error('ช่างคนนี้กดหยุดรับงานอยู่');

      const offerR = await client.query(
        `INSERT INTO public.job_offers (job_id, technician_username, status, expires_at)
         VALUES ($1,$2,'pending', NOW() + INTERVAL '10 minutes')
         RETURNING offer_id, expires_at`,
        [job_id, technician_username]
      );
      offer = offerR.rows[0] || null;
    }

    // ✅ status update: งานลูกค้าจอง (รอตรวจสอบ) เมื่อยิงแบบ forced => รอดำเนินการ
    // - urgent/offer ให้คงสถานะเดิม (รอช่างยืนยัน)
    const curSt = String(j.job_status || '').trim();
    const bm = String(j.booking_mode || '').trim().toLowerCase();
    if (mode === 'forced' && (curSt === 'รอตรวจสอบ' || curSt === 'pending_review')) {
      await client.query(`UPDATE public.jobs SET job_status='รอดำเนินการ' WHERE job_id=$1`, [job_id]);
    }
    if (mode === 'offer' && bm === 'urgent' && (curSt === 'รอตรวจสอบ' || curSt === 'รอดำเนินการ')) {
      await client.query(`UPDATE public.jobs SET job_status='รอช่างยืนยัน' WHERE job_id=$1`, [job_id]);
    }

    await client.query('COMMIT');

    // notify (best effort)
    if (mode === 'forced') notifyTechnician(technician_username, `📌 มีงานใหม่ (ยืนยันโดยแอดมิน) งาน #${job_id}`);
    else notifyTechnician(technician_username, `📨 มีข้อเสนองานใหม่ งาน #${job_id} (กดรับภายใน 10 นาที)`);

    console.log('[admin_dispatch_v2]', { job_id, mode, technician_username, team_count: safeTeam.length });
    return res.json({ success: true, job_id, mode, offer, team_members: safeTeam });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('/jobs/:job_id/dispatch_v2 error:', e);
    return res.status(400).json({ error: e.message || 'dispatch ไม่สำเร็จ' });
  } finally {
    client.release();
  }
});

// =======================================
// ✅ ADMIN V2 (ไม่ลบของเดิม / กัน regression)
// - Flow เหมือน customer 100% แต่แอดมิน override ราคา/เวลา + เลือกกลุ่มช่างได้
// - รองรับหลายรายการ (extras) + โปรฯ (เหมือนโหมดเดิม /jobs)
// - เพิ่ม endpoint สำหรับ Calendar (รายช่าง) + History filters
// =======================================

function isAdminRole(role) {
  const r = (role || "").toString().toLowerCase().trim();
  return r === "admin";
}

// ⚠️ ปลอด regression: ไม่บังคับ auth แบบใหม่
// - ถ้าหน้า admin ส่ง header x-user-role=admin จะตรวจ
// - ถ้าไม่ส่ง จะปล่อยผ่าน แต่ log เตือน (กันระบบเดิมพัง)
function requireAdminSoft(req, res, next) {
  try {
    const hdr = (req.headers["x-user-role"] || "").toString();
    const q = (req.query.role || "").toString();
    const b = (req.body?.role || "").toString();
    const role = hdr || q || b;
    if (role && !isAdminRole(role)) {
      return res.status(403).json({ error: "admin only" });
    }
    if (!role) {
      console.warn("[admin_v2] role missing (soft-allow)", { path: req.path });
    }
    return next();
  } catch (e) {
    console.error("requireAdminSoft error:", e);
    return next();
  }
}

async function pickFirstAvailableTech(usernames, apptIso, durationMin) {
  for (const u of usernames) {
    const ok = await isTechFree(u, apptIso, durationMin, null);
    if (ok) return u;
  }
  return null;
}

function coerceNumber(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

app.post("/admin/book_v2", requireAdminSoft, async (req, res) => {
  const body = req.body || {};
  const {
    customer_name,
    customer_phone,
    job_type,
    appointment_datetime,
    address_text,
    customer_note,
    maps_url,
    job_zone,
    booking_mode,
    tech_type,
    technician_username,
    team_members,
    dispatch_mode,
    // v2 payload
    ac_type,
    btu,
    machine_count,
    wash_variant,
    repair_variant,
    // pricing
    items, // [{item_id, qty}]
    promotion_id,
    override_price,
    override_duration_min,
  } = body;

  if (!customer_name || !job_type || !appointment_datetime || !address_text) {
    return res.status(400).json({ error: "กรอกข้อมูลไม่ครบ (ชื่อ/ประเภทงาน/วันนัด/ที่อยู่)" });
  }

  const bm = (booking_mode || "scheduled").toString().trim().toLowerCase();
  const ttype = (tech_type || (bm === "urgent" ? "partner" : "company")).toString().trim().toLowerCase();
  const mode = (dispatch_mode || "forced").toString().trim().toLowerCase();
  if (!['company','partner'].includes(ttype)) return res.status(400).json({ error: "tech_type ต้องเป็น company หรือ partner" });
  if (!['forced','offer'].includes(mode)) return res.status(400).json({ error: "dispatch_mode ต้องเป็น forced หรือ offer" });

  const payloadV2 = {
    job_type: String(job_type).trim(),
    ac_type: (ac_type || "").toString().trim(),
    btu: coerceNumber(btu, 0),
    machine_count: Math.max(1, coerceNumber(machine_count, 1)),
    wash_variant: (wash_variant || "").toString().trim(),
    repair_variant: (repair_variant || "").toString().trim(),
    admin_override_duration_min: Math.max(0, coerceNumber(override_duration_min, 0)),
  };

  let duration_min = computeDurationMin(payloadV2, { source: "admin_book_v2" });
  if (duration_min <= 0) {
    return res.status(400).json({ error: "งานประเภทนี้ต้องให้แอดมินกำหนดเวลา (duration_min)" });
  }

  // override duration (admin)
  if (coerceNumber(override_duration_min, 0) > 0) {
    duration_min = Math.max(1, Math.floor(coerceNumber(override_duration_min, duration_min)));
  }

  const standard_price = computeStandardPriceMulti(payloadV2);


// ✅ Parse lat/lng from maps_url or address_text (fail-open)
const parsedAdminLL = parseLatLngFromText(maps_url) || parseLatLngFromText(address_text);
const parsed_lat = parsedAdminLL ? parsedAdminLL.lat : null;
const parsed_lng = parsedAdminLL ? parsedAdminLL.lng : null;
console.log("[latlng_parse]", { ok: !!parsedAdminLL });


  // sanitize items
  const safeItemsIn = Array.isArray(items) ? items : [];
  const itemIdQty = safeItemsIn
    .map((x) => ({ item_id: Number(x.item_id), qty: Number(x.qty || 1) }))
    .filter((x) => Number.isFinite(x.item_id) && x.item_id > 0 && Number.isFinite(x.qty) && x.qty > 0);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // promo
    let promo = null;
    if (promotion_id) {
      const pr = await client.query(
        `SELECT promo_id, promo_name, promo_type, promo_value
         FROM public.promotions
         WHERE promo_id=$1 AND is_active=TRUE LIMIT 1`,
        [promotion_id]
      );
      promo = pr.rows[0] || null;
    }

    // resolve items
const computedItems = [];

const serviceLineItems = (payloadV2.services && Array.isArray(payloadV2.services))
  ? buildServiceLineItemsFromPayload(payloadV2)
  : [];

if (coerceNumber(override_price, 0) > 0) {
  computedItems.push({ item_id: null, item_name: `ค่าบริการ (override)`, qty: 1, unit_price: coerceNumber(override_price, 0), line_total: coerceNumber(override_price, 0) });
} else if (serviceLineItems.length) {
  for (const it of serviceLineItems) computedItems.push(it);
} else if (standard_price > 0) {
  computedItems.push({ item_id: null, item_name: `ค่าบริการมาตรฐาน (${payloadV2.job_type || '-'})`, qty: 1, unit_price: Number(standard_price), line_total: Number(standard_price) });
}

    if (itemIdQty.length) {
      const ids = itemIdQty.map((x) => x.item_id);
      const catR = await client.query(
        `SELECT item_id, item_name, base_price
         FROM public.catalog_items
         WHERE is_active=TRUE AND item_id = ANY($1::bigint[])`,
        [ids]
      );
      const map = new Map(catR.rows.map((r) => [Number(r.item_id), r]));
      for (const x of itemIdQty) {
        const it = map.get(Number(x.item_id));
        if (!it) continue;
        const qty = Number(x.qty);
        const unit_price = Number(it.base_price || 0);
        computedItems.push({
          item_id: Number(it.item_id),
          item_name: it.item_name,
          qty,
          unit_price,
          line_total: qty * unit_price,
        });
      }
    }

    // pricing via existing calcPricing
    const pricing = calcPricing(computedItems, promo);

    // choose technician
    let selectedTech = (technician_username || "").toString().trim();
    if (!selectedTech) {
      // list group techs
      const tr = await client.query(
        `
        SELECT u.username
        FROM public.users u
        LEFT JOIN public.technician_profiles p ON p.username=u.username
        WHERE u.role='technician'
          AND COALESCE(p.accept_status,'ready') <> 'paused'
          AND COALESCE(p.employment_type,'company') = $1
        ORDER BY u.username
        `,
        [ttype]
      );
      const list = (tr.rows || []).map((r) => r.username).slice(0, 30);
      selectedTech = await pickFirstAvailableTech(list, appointment_datetime, duration_min);
    } else {
      const ok = await isTechFree(selectedTech, appointment_datetime, duration_min, null);
      if (!ok) {
        return res.status(409).json({ error: "ช่างคนนี้คิวชน (รวม buffer)" });
      }
    }

    if (!selectedTech) {
      return res.status(409).json({ error: "ไม่พบช่างว่างในช่วงเวลานี้" });
    }

    // ✅ Team members collision check (including buffer) - backward compatible
    const tmIn = Array.isArray(team_members) ? team_members : [];
    const tmList = [...new Set(tmIn.map(x => (x||"").toString().trim()).filter(Boolean))].slice(0, 10);
    for (const u of tmList) {
      if (u === selectedTech) continue;
      const ok = await isTechFree(u, appointment_datetime, duration_min, null);
      if (!ok) {
        return res.status(409).json({ error: `ช่างร่วมคิวชน (รวม buffer): ${u}` });
      }
    }

    const jobStatus = bm === "urgent" ? "รอช่างยืนยัน" : "รอดำเนินการ";
    const jobInsert = await client.query(
      `
      INSERT INTO public.jobs
      (customer_name, customer_phone, job_type, appointment_datetime, job_price,
       address_text, technician_team, technician_username, job_status,
       booking_token, job_source, dispatch_mode, customer_note,
       maps_url, job_zone, duration_min, booking_mode, admin_override_duration_min)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,'admin',$10,$11,$12,$13,$14,$15,$16)
      RETURNING job_id
      `,
      [
        String(customer_name).trim(),
        (customer_phone || "").toString().trim(),
        String(job_type).trim(),
        appointment_datetime,
        Number(pricing.total || 0),
        String(address_text).trim(),
        mode === "forced" ? selectedTech : null,
        selectedTech,
        jobStatus,
        mode,
        (customer_note || "").toString(),
        (String(maps_url || "").trim() || null),
        (String(job_zone || "").trim() || null),
        duration_min,
        (bm === "urgent" ? "urgent" : "scheduled"),
        Math.max(0, coerceNumber(override_duration_min, 0)),
      ]
    );

    const job_id = jobInsert.rows[0].job_id;
    const booking_code = await generateUniqueBookingCode(client);
    await client.query(`UPDATE public.jobs SET booking_code=$1 WHERE job_id=$2`, [booking_code, job_id]);

    // ✅ Team members (primary + assistants) - backward compatible
    try {
      const tmAll = [...new Set([selectedTech, ...tmList].map(x => (x||"").toString().trim()).filter(Boolean))].slice(0, 10);
      await client.query(`DELETE FROM public.job_team_members WHERE job_id=$1`, [job_id]);
      for (const u of tmAll) {
        await client.query(
          `INSERT INTO public.job_team_members (job_id, username, is_primary)
           VALUES ($1,$2,$3)`,
          [job_id, u, u === selectedTech]
        );
      }
    } catch (e) {
      console.warn("[admin_book_v2] save team members failed", e);
    }

    // job_items
    for (const it of computedItems) {
      await client.query(
        `INSERT INTO public.job_items (job_id, item_id, item_name, qty, unit_price, line_total)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [job_id, it.item_id || null, it.item_name, it.qty, it.unit_price, it.line_total]
      );
    }

    if (promo) {
      await client.query(
        `INSERT INTO public.job_promotions (job_id, promo_id, applied_discount)
         VALUES ($1,$2,$3)
         ON CONFLICT (job_id) DO UPDATE SET promo_id=EXCLUDED.promo_id, applied_discount=EXCLUDED.applied_discount`,
        [job_id, promo.promo_id, Number(pricing.discount || 0)]
      );
    }

    // urgent offers to partner (ถ้า bm=urgent และกลุ่ม partner)
    if (bm === "urgent") {
      const partners = await client.query(
        `
        SELECT u.username
        FROM public.users u
        LEFT JOIN public.technician_profiles p ON p.username=u.username
        WHERE u.role='technician'
          AND COALESCE(p.accept_status,'ready') <> 'paused'
          AND COALESCE(p.employment_type,'company') = 'partner'
        ORDER BY u.username
        `
      );

      const list = (partners.rows || []).map((r) => r.username);
      // จำกัด 30 ทีม
      const maxTeams = 30;
      const shuffled = list.sort(() => Math.random() - 0.5).slice(0, maxTeams);
      const available = [];
      for (const u of shuffled) {
        const ok = await isTechFree(u, appointment_datetime, duration_min, null);
        if (ok) available.push(u);
      }

      for (const u of available) {
        await client.query(
          `INSERT INTO public.job_offers (job_id, technician_username, status, expires_at)
           VALUES ($1,$2,'pending', NOW() + INTERVAL '10 minutes')`,
          [job_id, u]
        );
      }
      console.log("[admin_book_v2] urgent_offers", { job_id, booking_code, count: available.length });
    }

    await client.query("COMMIT");

    console.log("[admin_book_v2]", {
      job_id,
      booking_code,
      tech_type: ttype,
      technician_username: selectedTech,
      duration_min,
      effective_block_min: effectiveBlockMin(duration_min),
      standard_price,
      total: pricing.total,
      promo_id: promo?.promo_id || null,
    });

    return res.json({
      success: true,
      job_id,
      booking_code,
      technician_username: selectedTech,
      tech_type: ttype,
      duration_min,
      effective_block_min: effectiveBlockMin(duration_min),
      travel_buffer_min: TRAVEL_BUFFER_MIN,
      standard_price: Number(standard_price || 0),
      subtotal: Number(pricing.subtotal || 0),
      discount: Number(pricing.discount || 0),
      total: Number(pricing.total || 0),
      booking_mode: bm,
      dispatch_mode: mode,
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("/admin/book_v2 error:", e);
    return res.status(500).json({ error: e.message || "admin book v2 failed" });
  } finally {
    client.release();
  }
});

app.get("/admin/jobs_v2", requireAdminSoft, async (req, res) => {
  try {
    const date_from = (req.query.date_from || "").toString().trim();
    const date_to = (req.query.date_to || "").toString().trim();
    const technician = (req.query.technician || "").toString().trim();
    const q = (req.query.q || "").toString().trim();
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200)));

    const where = [];
    const params = [];
    let p = 1;

    if (date_from) {
      params.push(date_from + " 00:00:00");
      where.push(`appointment_datetime >= $${p++}::timestamptz`);
    }
    if (date_to) {
      params.push(date_to + " 23:59:59");
      where.push(`appointment_datetime <= $${p++}::timestamptz`);
    }
    if (technician) {
      params.push(technician);
      where.push(`technician_username = $${p++}`);
    }
    if (q) {
      params.push(`%${q}%`);
      where.push(`(customer_name ILIKE $${p} OR address_text ILIKE $${p} OR job_zone ILIKE $${p} OR booking_code ILIKE $${p})`);
      p++;
    }

    const sqlWhere = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const r = await pool.query(
      `
      SELECT job_id, booking_code, customer_name, customer_phone, job_type,
             appointment_datetime, job_status, job_price, address_text, maps_url, job_zone,
             technician_username, job_source, dispatch_mode, booking_mode, duration_min,
             created_at
      FROM public.jobs
      ${sqlWhere}
      ORDER BY appointment_datetime DESC, created_at DESC
      LIMIT ${limit}
      `,
      params
    );
    return res.json({ success: true, rows: r.rows, jobs: r.rows });
  } catch (e) {
    console.error("/admin/jobs_v2 error:", e);
    return res.status(500).json({ error: "โหลดประวัติงานไม่สำเร็จ" });
  }
});

// =======================================
// 📥 ADMIN REVIEW QUEUE V2
// - งานลูกค้าจองเข้ามา (รอตรวจสอบ) + งานที่ตีกลับ
// - ใช้หน้า admin-review-v2.html
// =======================================
app.get("/admin/review_queue_v2", requireAdminSoft, async (req, res) => {
  try {
    const status = String(req.query.status || 'รอตรวจสอบ').trim();
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200)));
    const q = String(req.query.q || '').trim();

    // support: status=all (ดูทั้งหมดที่ควร review)
    const allow = ['รอตรวจสอบ', 'pending_review', 'ตีกลับ', 'ไม่พบช่างรับงาน'];
    const wantAll = status.toLowerCase() === 'all';

    const params = [];
    let p = 1;
    const where = [];

    // default: scheduled bookings ที่ยังไม่ยกเลิก
    where.push(`canceled_at IS NULL`);
    where.push(`COALESCE(booking_mode,'scheduled') IN ('scheduled','')`);

    if (!wantAll) {
      if (!allow.includes(status)) return res.status(400).json({ error: 'status ไม่ถูกต้อง' });
      params.push(status);
      where.push(`job_status = $${p++}`);
    } else {
      // include statuses ที่ต้อง review
      where.push(`job_status = ANY($${p++}::text[])`);
      params.push(allow);
    }

    if (q) {
      params.push(`%${q}%`);
      where.push(`(customer_name ILIKE $${p} OR address_text ILIKE $${p} OR booking_code ILIKE $${p} OR customer_phone ILIKE $${p})`);
      p++;
    }

    const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const r = await pool.query(
      `
      SELECT job_id, booking_code, customer_name, customer_phone, job_type,
             appointment_datetime, job_status, duration_min, job_price,
             address_text, maps_url, job_zone,
             technician_username, dispatch_mode, booking_mode,
             created_at
      FROM public.jobs
      ${sqlWhere}
      ORDER BY created_at DESC
      LIMIT ${limit}
      `,
      params
    );

    console.log('[admin_review_queue_v2]', { status, q: q ? true : false, count: (r.rows||[]).length });
    return res.json({ success: true, rows: r.rows });
  } catch (e) {
    console.error('/admin/review_queue_v2 error:', e);
    return res.status(500).json({ error: 'โหลดคิวงานรอตรวจสอบไม่สำเร็จ' });
  }
});

app.get("/admin/job_v2/:job_id", requireAdminSoft, async (req, res) => {
  const job_id = Number(req.params.job_id);
  if (!job_id) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });
  try {
    const jr = await pool.query(
      `SELECT *
       FROM public.jobs
       WHERE job_id=$1
       LIMIT 1`,
      [job_id]
    );
    const job = jr.rows[0];
    if (!job) return res.status(404).json({ error: "ไม่พบงาน" });

    const ir = await pool.query(
      `SELECT item_id, item_name, qty, unit_price, line_total
       FROM public.job_items
       WHERE job_id=$1
       ORDER BY job_item_id ASC`,
      [job_id]
    );

    const pr = await pool.query(
      `SELECT jp.promo_id, p.promo_name, p.promo_type, p.promo_value
       FROM public.job_promotions jp
       JOIN public.promotions p ON p.promo_id=jp.promo_id
       WHERE jp.job_id=$1
       ORDER BY jp.job_promo_id DESC
       LIMIT 1`,
      [job_id]
    );

    return res.json({
      success: true,
      job,
      items: ir.rows || [],
      promotion: pr.rows[0] || null,
    });
  } catch (e) {
    console.error("/admin/job_v2 error:", e);
    return res.status(500).json({ error: "โหลดใบงานไม่สำเร็จ" });
  }
});

app.get("/admin/promotions_v2", requireAdminSoft, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT promo_id, promo_name, promo_type, promo_value, is_customer_visible, is_active, created_at
       FROM public.promotions
       ORDER BY created_at DESC, promo_id DESC`
    );
    return res.json({ success: true, promotions: r.rows });
  } catch (e) {
    console.error("/admin/promotions_v2 list error:", e);
    return res.status(500).json({ error: "โหลดโปรโมชันไม่สำเร็จ" });
  }
});

app.post("/admin/promotions_v2", requireAdminSoft, async (req, res) => {
  const b = req.body || {};
  const promo_name = String(b.promo_name || "").trim();
  const promo_type = String(b.promo_type || "").trim();
  const promo_value = Number(b.promo_value || 0);
  const is_customer_visible = !!b.is_customer_visible;
  const is_active = (b.is_active === undefined) ? true : !!b.is_active;

  if (!promo_name || !["percent","amount"].includes(promo_type)) {
    return res.status(400).json({ error: "ข้อมูลโปรโมชันไม่ครบ/ไม่ถูกต้อง" });
  }
  try {
    const r = await pool.query(
      `INSERT INTO public.promotions (promo_name, promo_type, promo_value, is_customer_visible, is_active)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING promo_id`,
      [promo_name, promo_type, promo_value, is_customer_visible, is_active]
    );
    return res.json({ success: true, promo_id: r.rows[0]?.promo_id });
  } catch (e) {
    console.error("/admin/promotions_v2 create error:", e);
    return res.status(500).json({ error: "สร้างโปรโมชันไม่สำเร็จ" });
  }
});

app.put("/admin/promotions_v2/:promo_id", requireAdminSoft, async (req, res) => {
  const promo_id = Number(req.params.promo_id);
  const b = req.body || {};
  if (!promo_id) return res.status(400).json({ error: "promo_id ไม่ถูกต้อง" });

  const fields = [];
  const params = [];
  let p = 1;

  const setField = (name, val) => { params.push(val); fields.push(`${name}=$${p++}`); };

  if (b.promo_name !== undefined) setField("promo_name", String(b.promo_name || "").trim());
  if (b.promo_type !== undefined) setField("promo_type", String(b.promo_type || "").trim());
  if (b.promo_value !== undefined) setField("promo_value", Number(b.promo_value || 0));
  if (b.is_customer_visible !== undefined) setField("is_customer_visible", !!b.is_customer_visible);
  if (b.is_active !== undefined) setField("is_active", !!b.is_active);

  if (!fields.length) return res.json({ success: true });

  params.push(promo_id);
  try {
    await pool.query(`UPDATE public.promotions SET ${fields.join(", ")} WHERE promo_id=$${p}`, params);
    return res.json({ success: true });
  } catch (e) {
    console.error("/admin/promotions_v2 update error:", e);
    return res.status(500).json({ error: "แก้ไขโปรโมชันไม่สำเร็จ" });
  }
});

app.delete("/admin/promotions_v2/:promo_id", requireAdminSoft, async (req, res) => {
  const promo_id = Number(req.params.promo_id);
  if (!promo_id) return res.status(400).json({ error: "promo_id ไม่ถูกต้อง" });
  try {
    await pool.query(`UPDATE public.promotions SET is_active=FALSE WHERE promo_id=$1`, [promo_id]);
    return res.json({ success: true });
  } catch (e) {
    console.error("/admin/promotions_v2 delete error:", e);
    return res.status(500).json({ error: "ลบโปรโมชันไม่สำเร็จ" });
  }
});




app.get("/admin/schedule_v2", requireAdminSoft, async (req, res) => {
  try {
    const date = (req.query.date || "").toString().trim();
    const tech_type = (req.query.tech_type || "company").toString().trim().toLowerCase();
    if (!date) return res.status(400).json({ error: "ต้องส่ง date=YYYY-MM-DD" });
    if (!['company','partner'].includes(tech_type)) return res.status(400).json({ error: "tech_type ต้องเป็น company|partner" });

    const techR = await pool.query(
      `
      SELECT u.username,
             COALESCE(p.full_name, u.username) AS full_name,
             COALESCE(p.work_start,'09:00') AS work_start,
             COALESCE(p.work_end,'18:00') AS work_end
      FROM public.users u
      LEFT JOIN public.technician_profiles p ON p.username=u.username
      WHERE u.role='technician'
        AND COALESCE(p.employment_type,'company') = $1
      ORDER BY u.username
      `,
      [tech_type]
    );

    const techs = (techR.rows || []).slice(0, 30);
    const usernames = techs.map((t) => t.username);

    const jobsR = await pool.query(
      `
      SELECT job_id, booking_code, customer_name, job_type, job_status,
             appointment_datetime, duration_min, technician_username, address_text, job_zone
      FROM public.jobs
      WHERE technician_username = ANY($1::text[])
        AND appointment_datetime::date = $2::date
        AND canceled_at IS NULL
      ORDER BY appointment_datetime ASC
      `,
      [usernames, date]
    );

    const jobs_by_tech = {};
    for (const u of usernames) jobs_by_tech[u] = [];
    for (const j of jobsR.rows || []) {
      const start = new Date(j.appointment_datetime);
      const end = new Date(start.getTime() + (Number(j.duration_min || 60) + TRAVEL_BUFFER_MIN) * 60000);
      jobs_by_tech[j.technician_username] = jobs_by_tech[j.technician_username] || [];
      jobs_by_tech[j.technician_username].push({
        job_id: j.job_id,
        booking_code: j.booking_code,
        customer_name: j.customer_name,
        job_type: j.job_type,
        job_status: j.job_status,
        start_iso: start.toISOString(),
        end_iso: end.toISOString(),
        duration_min: Number(j.duration_min || 60),
        effective_block_min: Number(j.duration_min || 60) + TRAVEL_BUFFER_MIN,
        job_zone: j.job_zone,
        address_text: j.address_text,
      });
    }

    console.log("[admin_schedule_v2]", { date, tech_type, tech_count: techs.length, jobs: jobsR.rows.length });
    return res.json({
      success: true,
      date,
      tech_type,
      travel_buffer_min: TRAVEL_BUFFER_MIN,
      technicians: techs,
      jobs_by_tech,
    });
  } catch (e) {
    console.error("/admin/schedule_v2 error:", e);
    return res.status(500).json({ error: "โหลดปฏิทินคิวช่างไม่สำเร็จ" });
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
          maps_url = COALESCE(NULLIF($7, ''), maps_url),
          job_zone = COALESCE(NULLIF($8, ''), job_zone),
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

  const wantDetails = String(req.query.details || "").trim() === "1";

  try {
    if (wantDetails) {
      const r = await pool.query(
        `
        SELECT tm.username,
               tp.full_name,
               tp.photo_path,
               tp.phone
        FROM public.job_team_members tm
        LEFT JOIN public.technician_profiles tp ON tp.username = tm.username
        WHERE tm.job_id=$1
        ORDER BY tm.username ASC
        `,
        [job_id]
      );

      return res.json({
        members: (r.rows || []).map((x) => ({
          username: x.username,
          full_name: x.full_name || null,
          photo: x.photo_path || null,
          phone: x.phone || null,
        })),
      });
    }

    // legacy (เดิม): ส่งแค่ username[]
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

    // ✅ collision check (ทุกคน) + buffer
    // - ปลอด regression: ถ้า job ไม่มีวันนัด จะไม่บล็อก
    try {
      const jr = await client.query(
        `SELECT appointment_datetime, COALESCE(duration_min,60) AS duration_min
         FROM public.jobs WHERE job_id=$1 FOR UPDATE`,
        [job_id]
      );
      if (jr.rows.length) {
        const appt = jr.rows[0].appointment_datetime;
        const dur = Number(jr.rows[0].duration_min || 60);
        if (appt) {
          for (const u of safe) {
            const free = await isTechFree(u, appt, dur, job_id);
            if (!free) {
              console.log('[team_collision]', { job_id, tech: u });
              throw new Error(`เวลาชนกับงานอื่นของช่าง (${u}) (รวมเวลาเดินทาง ${TRAVEL_BUFFER_MIN} นาที)`);
            }
          }
        }
      }
    } catch (e) {
      // ถ้าเป็น error ที่เราตั้งใจ throw ให้บล็อก
      if (String(e.message || '').includes('เวลาชนกับงานอื่น')) throw e;
      console.warn('[team_collision] skip (non-blocking)', { job_id, err: e.message });
    }

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

// ✅ Auto finalize urgent jobs when no one accepts
// - Safe: ไม่กระทบงานปกติ / ไม่ล้มระบบ ถ้า query fail
async function autoFinalizeUrgentJobs() {
  try {
    await pool.query(
      `
      UPDATE public.jobs j
      SET job_status='ไม่พบช่างรับงาน'
      WHERE COALESCE(j.booking_mode,'scheduled')='urgent'
        AND j.technician_team IS NULL
        AND j.canceled_at IS NULL
        AND (j.job_status='รอช่างยืนยัน' OR j.job_status='pending_accept')
        AND NOT EXISTS (
          SELECT 1 FROM public.job_offers o
          WHERE o.job_id=j.job_id
            AND o.status='pending'
            AND o.expires_at >= NOW()
        )
      `
    );
  } catch (e) {
    console.warn('[autoFinalizeUrgentJobs] skip', e.message);
  }
}

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

    // ถ้า urgent ไม่มีใครรับแล้ว ให้ขึ้นสถานะลูกค้าแบบปลอดภัย
    await autoFinalizeUrgentJobs();

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
    // COLLISION_CHECK_V2
    const jobInfoR = await client.query(
      `SELECT appointment_datetime, COALESCE(duration_min,60) AS duration_min FROM public.jobs WHERE job_id=$1`,
      [offer.job_id]
    );
    const jobInfo = jobInfoR.rows[0];
    const ok = await isTechFree(offer.technician_username, jobInfo.appointment_datetime, jobInfo.duration_min, offer.job_id);
    if (!ok) {
      console.log("[urgent_accept] collision", { offer_id, job_id: offer.job_id, tech: offer.technician_username });
      throw new Error("เวลาชนกับงานอื่นของช่าง (รวมเวลาเดินทาง 30 นาที)");
    }
    console.log("[urgent_accept] ok", { offer_id, job_id: offer.job_id, tech: offer.technician_username });


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

    // best effort: ถ้าเป็น urgent และไม่มี offer ค้างแล้ว ให้สรุปสถานะ
    await autoFinalizeUrgentJobs();
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

      await autoFinalizeUrgentJobs();
      return res.json({ success: true, status: "expired" });
    }

    await client.query(`UPDATE public.job_offers SET status='declined', responded_at=NOW() WHERE offer_id=$1`, [offer_id]);
    console.log("[urgent_decline]", { offer_id, job_id: offer.job_id, tech: offer.technician_username });

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
    await autoFinalizeUrgentJobs();
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
      `SELECT username, technician_code, full_name, photo_path, position, rank_level, rank_key, rating, grade, done_count,
              COALESCE(accept_status,'ready') AS accept_status, accept_status_updated_at,
              COALESCE(preferred_zone,'') AS preferred_zone,
              COALESCE(phone,'') AS phone
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

// 📞 Technician: update own phone (shown on Tracking)
// - allow empty = clear
// - basic validation to avoid broken values
app.put("/technicians/:username/phone", async (req, res) => {
  try {
    const username = req.params.username;
    const phoneRaw = (req.body?.phone ?? "").toString().trim();

    if (phoneRaw && !/^[0-9+\-()\s]{6,20}$/.test(phoneRaw)) {
      return res.status(400).json({ error: "รูปแบบเบอร์โทรไม่ถูกต้อง" });
    }

    await pool.query(
      `INSERT INTO public.technician_profiles (username, phone)
       VALUES ($1,$2)
       ON CONFLICT (username) DO UPDATE SET
         phone = EXCLUDED.phone,
         updated_at = CURRENT_TIMESTAMP`,
      [username, phoneRaw || null]
    );

    res.json({ ok: true, phone: phoneRaw || "" });
  } catch (e) {
    console.error("PUT technician phone error:", e);
    res.status(500).json({ error: "บันทึกเบอร์โทรไม่สำเร็จ" });
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
              p.full_name, p.technician_code, p.position, p.rank_level, p.rank_key, p.photo_path, p.phone,
              COALESCE(p.employment_type,'company') AS employment_type,
              COALESCE(p.work_start,'09:00') AS work_start,
              COALESCE(p.work_end,'18:00') AS work_end,
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
    const phoneRaw = (req.body.phone ?? "").toString().trim();
    const employment_type = (req.body.employment_type ?? "").toString().trim() || null;
    const work_start = (req.body.work_start ?? "").toString().trim() || null;
    const work_end = (req.body.work_end ?? "").toString().trim() || null;
    const newPassword = (req.body.new_password ?? "").toString();
    const confirmPassword = (req.body.confirm_password ?? "").toString();

    if (!technician_code) return res.status(400).json({ error: "ต้องใส่รหัสช่าง" });

    if (phoneRaw && !/^[0-9+\-()\s]{6,20}$/.test(phoneRaw)) {
      return res.status(400).json({ error: "รูปแบบเบอร์โทรไม่ถูกต้อง" });
    }

    if (employment_type && !['company','partner'].includes(String(employment_type).toLowerCase())) {
      return res.status(400).json({ error: "employment_type ต้องเป็น company หรือ partner" });
    }
    const isHHMM = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s||''));
    if (work_start && !isHHMM(work_start)) {
      return res.status(400).json({ error: "work_start ต้องเป็นรูปแบบ HH:MM เช่น 09:00" });
    }
    if (work_end && !isHHMM(work_end)) {
      return res.status(400).json({ error: "work_end ต้องเป็นรูปแบบ HH:MM เช่น 18:00" });
    }

    // profile
    await pool.query(
      `INSERT INTO public.technician_profiles (username, technician_code, full_name, position, phone)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (username) DO UPDATE SET
         technician_code = EXCLUDED.technician_code,
         full_name = COALESCE(EXCLUDED.full_name, public.technician_profiles.full_name),
         position = COALESCE(EXCLUDED.position, public.technician_profiles.position),
         phone = COALESCE(EXCLUDED.phone, public.technician_profiles.phone),
         employment_type = COALESCE($6, public.technician_profiles.employment_type),
         work_start = COALESCE($7, public.technician_profiles.work_start),
         work_end = COALESCE($8, public.technician_profiles.work_end),
         updated_at = CURRENT_TIMESTAMP`,
      [
        username,
        technician_code,
        full_name || null,
        position,
        phoneRaw || null,
        employment_type ? String(employment_type).toLowerCase() : null,
        work_start,
        work_end,
      ]
    );

    // password (optional)
    if (newPassword) {
      if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: "ยืนยันรหัสใหม่ไม่ตรงกัน" });
      }
      if (newPassword.length < 4) {
        return res.status(400).json({ error: "รหัสใหม่ต้องยาวอย่างน้อย 4 ตัวอักษร" });
      }
      await pool.query(`UPDATE public.users SET password=$2 WHERE username=$1`, [username, newPassword]);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("PUT admin technician error:", e);
    res.status(500).json({ error: "บันทึกไม่สำเร็จ" });
  }
});

// =======================================
// 🏅 ADMIN: update technician rank (Premium Rank Set)
// - IMPORTANT: server-side guard (admin-only)
// - ไม่กระทบ position เดิม / ไม่เปลี่ยน meaning ของ role เดิม
// =======================================
const PREMIUM_RANKS = {
  1: { key: "apprentice", label: "Apprentice" },
  2: { key: "technician", label: "Technician" },
  3: { key: "senior_technician", label: "Senior Technician" },
  4: { key: "team_lead", label: "Team Lead" },
  5: { key: "head_supervisor", label: "Head Supervisor" },
};

app.put("/admin/technicians/:username/rank", requireAdminForRank, async (req, res) => {
  try {
    const username = String(req.params.username || "").trim();
    const level = Number(req.body?.rank_level);

    if (!username) return res.status(400).json({ error: "username หาย" });
    if (!Number.isFinite(level) || level < 1 || level > 5) {
      return res.status(400).json({ error: "rank_level ต้องอยู่ระหว่าง 1-5" });
    }

    const rank = PREMIUM_RANKS[level];

    await pool.query(
      `INSERT INTO public.technician_profiles (username, rank_level, rank_key)
       VALUES ($1,$2,$3)
       ON CONFLICT (username) DO UPDATE SET
         rank_level = EXCLUDED.rank_level,
         rank_key = EXCLUDED.rank_key,
         updated_at = CURRENT_TIMESTAMP`,
      [username, level, rank.key]
    );

    res.json({ ok: true, username, rank_level: level, rank_key: rank.key, rank_label: rank.label });
  } catch (e) {
    console.error("PUT admin rank error:", e);
    res.status(500).json({ error: "อัปเดตแรงค์ไม่สำเร็จ" });
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

// =======================================
// ⏱️ Duration + Pricing Engine (v2) + Travel Buffer
// =======================================
function toMin(hhmm) {
  const [h, m] = String(hhmm || "00:00").split(":").map((x) => Number(x || 0));
  return h * 60 + m;
}
function minToHHMM(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function computeDurationMin(payload = {}, opts = {}) {
  const src = opts.source || "unknown";
  const job_type = String(payload.job_type || payload.jobType || "").trim();
  const ac_type = String(payload.ac_type || payload.acType || "").trim();
  const wash_variant = String(payload.wash_variant || payload.washVariant || "").trim();
  const repair_variant = String(payload.repair_variant || payload.repairVariant || "").trim();
  const machine_count = Math.max(1, Number(payload.machine_count || payload.machineCount || 1));
  const admin_override = Number(payload.admin_override_duration_min || payload.adminOverrideDurationMin || 0);

  let duration = 0;

  if (job_type === "ล้าง") {
    if (ac_type === "ผนัง" || !ac_type) {
      if (wash_variant === "ล้างพรีเมียม") duration = machine_count === 1 ? 80 : 50 * machine_count;
      else if (wash_variant === "ล้างแขวนคอยน์") duration = machine_count === 1 ? 120 : 90 * machine_count;
      else if (wash_variant === "ล้างแบบตัดล้าง" || wash_variant === "ตัดล้างใหญ่") duration = machine_count === 1 ? 180 : 120 * machine_count;
      else duration = machine_count === 1 ? 60 : 40 * machine_count; // ล้างธรรมดา
    } else {
      duration = machine_count === 1 ? 120 : 90 * machine_count;
    }
  } else if (job_type === "ซ่อม") {
    if (repair_variant === "ซ่อมเปลี่ยนอะไหล่") duration = admin_override > 0 ? admin_override : 0;
    else duration = 60;
  } else if (job_type === "ติดตั้ง") {
    duration = admin_override > 0 ? admin_override : 0;
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    if (job_type === "ซ่อม" && repair_variant === "ซ่อมเปลี่ยนอะไหล่") return 0;
    if (job_type === "ติดตั้ง") return 0;
    duration = 60;
  }

  console.log("[computeDurationMin]", { src, job_type, ac_type, wash_variant, repair_variant, machine_count, duration });
  return Math.round(duration);
}

function computeStandardPrice(payload = {}) {
  const job_type = String(payload.job_type || "").trim();
  const ac_type = String(payload.ac_type || "").trim();
  const wash_variant = String(payload.wash_variant || "").trim();
  const repair_variant = String(payload.repair_variant || "").trim();
  const machine_count = Math.max(1, Number(payload.machine_count || 1));
  const btu = Number(payload.btu || 0);

  if (job_type === "ติดตั้ง") return 0;

  if (job_type === "ซ่อม") {
    if (repair_variant === "ตรวจเช็ครั่ว") return 1000;
    return 500;
  }

  if (job_type !== "ล้าง") return 0;

  const qty = machine_count;

  if (ac_type === "ผนัง" || !ac_type) {
    const tier18000 = Number.isFinite(btu) && btu > 12000;
    if (!tier18000) {
      if (wash_variant === "ล้างพรีเมียม") return 800 * qty;
      if (wash_variant === "ล้างแขวนคอยน์") return 1250 * qty;
      if (wash_variant === "ล้างแบบตัดล้าง" || wash_variant === "ตัดล้างใหญ่") return 1800 * qty;
      return 500 * qty;
    } else {
      if (wash_variant === "ล้างพรีเมียม") return 1000 * qty;
      if (wash_variant === "ล้างแขวนคอยน์") return 1500 * qty;
      if (wash_variant === "ล้างแบบตัดล้าง" || wash_variant === "ตัดล้างใหญ่") return 2000 * qty;
      return 650 * qty;
    }
  }

  if (ac_type === "สี่ทิศทาง") {
    if (Number.isFinite(btu) && btu > 48000) return 1700 * qty;
    return 1500 * qty;
  }

  if (ac_type === "แขวน") {
    if (Number.isFinite(btu) && btu >= 38000) return 1500 * qty;
    if (Number.isFinite(btu) && btu <= 18000) return 800 * qty;
    return 1200 * qty;
  }

  if (ac_type === "เปลือยใต้ฝ้า") {
    if (Number.isFinite(btu) && btu >= 40000) return 1500 * qty;
    return 1200 * qty;
  }

  return 0;
}

function normalizeServicesFromPayload(payload = {}) {
  const services = Array.isArray(payload.services) ? payload.services : null;
  if (!services || !services.length) return null;
  return services
    .map((s) => ({
      job_type: String(s.job_type || payload.job_type || "").trim() || String(payload.job_type || "").trim(),
      ac_type: String(s.ac_type || "").trim(),
      btu: Number(s.btu || 0),
      machine_count: Math.max(1, Number(s.machine_count || 1)),
      wash_variant: String(s.wash_variant || "").trim(),
      repair_variant: String(s.repair_variant || "").trim(),
      admin_override_duration_min: Number(s.admin_override_duration_min || payload.admin_override_duration_min || 0),
    }))
    .filter((s) => s.job_type && s.ac_type && Number.isFinite(s.btu) && s.btu > 0 && Number.isFinite(s.machine_count) && s.machine_count > 0);
}

function computeDurationMinMulti(payload = {}, opts = {}) {
  const services = normalizeServicesFromPayload(payload);
  if (!services) return computeDurationMin(payload, opts);
  let total = 0;
  for (const s of services) {
    // default wash variant for wall if missing
    if (s.job_type === "ล้าง" && (s.ac_type === "ผนัง" || !s.ac_type) && !s.wash_variant) s.wash_variant = "ล้างธรรมดา";
    const d = computeDurationMin(s, opts);
    if (d <= 0) return 0;
    total += d;
  }
  console.log("[computeDurationMinMulti]", { src: opts.source || "unknown", lines: services.length, total });
  return Math.round(total);
}

function computeStandardPriceMulti(payload = {}) {
  const services = normalizeServicesFromPayload(payload);
  if (!services) return computeStandardPrice(payload);
  let total = 0;
  for (const s of services) {
    if (s.job_type === "ล้าง" && (s.ac_type === "ผนัง" || !s.ac_type) && !s.wash_variant) s.wash_variant = "ล้างธรรมดา";
    total += Number(computeStandardPrice(s) || 0);
  }
  return Number(total || 0);
}

function buildServiceLineItemsFromPayload(payload = {}) {
  const services = normalizeServicesFromPayload(payload);
  if (!services) return [];
  const items = [];
  for (const s of services) {
    const linePrice = Number(computeStandardPrice(s) || 0);
    const labelParts = [];
    labelParts.push(`ล้างแอร์${s.ac_type || ""}`.trim());
    if (s.ac_type === "ผนัง") labelParts.push(s.wash_variant || "ล้างธรรมดา");
    labelParts.push(`${Number(s.btu || 0)} BTU`);
    labelParts.push(`${Number(s.machine_count || 1)} เครื่อง`);
    const item_name = labelParts.join(" • ");
    items.push({ item_id: null, item_name, qty: 1, unit_price: linePrice, line_total: linePrice, is_service: true });
  }
  return items;
}



function effectiveBlockMin(durationMin) {
  return Math.max(0, Number(durationMin || 0)) + TRAVEL_BUFFER_MIN;
}

async function listTechniciansByType(tech_type) {
  const t = (tech_type || "company").toString().trim().toLowerCase();
  const r = await pool.query(
    `
    SELECT u.username,
           COALESCE(p.employment_type,'company') AS employment_type,
           COALESCE(p.work_start,'09:00') AS work_start,
           COALESCE(p.work_end,'18:00') AS work_end,
           COALESCE(p.accept_status,'ready') AS accept_status
    FROM public.users u
    LEFT JOIN public.technician_profiles p ON p.username=u.username
    WHERE u.role='technician'
      AND COALESCE(p.accept_status,'ready') <> 'paused'
      AND COALESCE(p.employment_type,'company') = $1
    ORDER BY u.username
    `,
    [t]
  );
  return r.rows || [];
}

async function listAssignedJobsForTechOnDate(username, dateStr, ignoreJobId) {
  const params = [username, dateStr];
  let extra = "";
  if (ignoreJobId) { params.push(ignoreJobId); extra = ` AND j.job_id <> $3`; }

  const r = await pool.query(
    `
    SELECT j.job_id, j.appointment_datetime, COALESCE(j.duration_min,60) AS duration_min
    FROM public.jobs j
    LEFT JOIN public.job_team_members m ON m.job_id=j.job_id AND m.username=$1
    WHERE j.appointment_datetime::date = $2::date
      AND j.job_status <> 'ยกเลิก'
      ${extra}
      AND (j.technician_username=$1 OR j.technician_team=$1 OR m.username IS NOT NULL)
    `,
    params
  );
  return r.rows || [];
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

async function isTechFree(username, startIso, durationMin, ignoreJobId) {
  const start = new Date(startIso);
  const dateStr = start.toISOString().slice(0, 10);

  const reqStart = start.getTime() - TRAVEL_BUFFER_MIN * 60000;
  const reqEnd = start.getTime() + (Number(durationMin || 0) + TRAVEL_BUFFER_MIN) * 60000;

  const jobs = await listAssignedJobsForTechOnDate(username, dateStr, ignoreJobId);
  for (const j of jobs) {
    const js = new Date(j.appointment_datetime).getTime() - TRAVEL_BUFFER_MIN * 60000;
    const je = new Date(j.appointment_datetime).getTime() + (Number(j.duration_min || 60) + TRAVEL_BUFFER_MIN) * 60000;
    if (overlaps(reqStart, reqEnd, js, je)) return false;
  }
  return true;
}


// =======================================
// 💰 Pricing + Duration Preview (public)
// =======================================
app.post("/public/pricing_preview", async (req, res) => {
  try {
    const payload = req.body || {};
    const duration_min = computeDurationMinMulti(payload, { source: "pricing_preview" });
    if (duration_min <= 0) return res.status(400).json({ error: "งานประเภทนี้ต้องให้แอดมินกำหนดเวลา (duration)" });
    const standard_price = computeStandardPriceMulti(payload);
    res.json({
      standard_price,
      duration_min,
      travel_buffer_min: TRAVEL_BUFFER_MIN,
      effective_block_min: effectiveBlockMin(duration_min),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "คำนวณราคาไม่สำเร็จ" });
  }
});


// =======================================
// 📅 Availability v2 (รายช่าง + แยก company/partner + ใช้ buffer)
// =======================================
app.get("/public/availability_v2", async (req, res) => {
  if (!ENABLE_AVAILABILITY_V2) return res.status(404).json({ error: "DISABLED" });

  const date = (req.query.date || new Date().toISOString().slice(0, 10)).toString();
  const tech_type = (req.query.tech_type || "company").toString().trim().toLowerCase();
  const duration_min = Math.max(15, Number(req.query.duration_min || 60));
  const slot_step_min = 30;

  try {
    const techs = await listTechniciansByType(tech_type);
    const tech_count = techs.length;
    // ✅ Work hours: ใช้ per-tech จริง (แต่ยังคง default 09:00-18:00)
    // สำหรับการสร้าง slot: ใช้ช่วงเวลามาตรฐานทั้งวัน แล้วคัด tech ที่อยู่ในช่วงเวลาของตัวเองอีกที
    const work_start = "09:00";
    const work_end = "18:00";

    const startMin = toMin(work_start);
    const endMin = toMin(work_end);
    const block = effectiveBlockMin(duration_min);

    const slots = [];
    for (let t = startMin; t + block <= endMin; t += slot_step_min) {
      const startHHMM = minToHHMM(t);
      const endHHMM = minToHHMM(t + block);
      const startIso = `${date}T${startHHMM}:00`;

      const available_tech_ids = [];
      for (const tech of techs) {
        // Respect per-tech working hours
        const ts = toMin(tech.work_start || "09:00");
        const te = toMin(tech.work_end || "18:00");
        if (!(t >= ts && t + block <= te)) continue;

        const free = await isTechFree(tech.username, startIso, duration_min, null);
        if (free) available_tech_ids.push(tech.username);
      }

      slots.push({
        start: startHHMM,
        end: endHHMM,
        available: available_tech_ids.length > 0,
        available_tech_ids,
      });
    }

    console.log("[availability_v2]", { date, tech_type, duration_min, tech_count, slots: slots.length });

    res.json({
      date,
      tech_type,
      work_start,
      work_end,
      travel_buffer_min: TRAVEL_BUFFER_MIN,
      duration_min,
      effective_block_min: block,
      slot_step_min,
      tech_count,
      slots,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "โหลดตารางว่างไม่สำเร็จ" });
  }
});

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
    items, // [{item_id, qty}] (extras)
    booking_mode,
    ac_type,
    btu,
    machine_count,
    wash_variant,
    repair_variant,
    services,
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
  // DURATION_PRICE_V2_PUBLIC_BOOK
  let bm = (booking_mode || "scheduled").toString().trim().toLowerCase();
  if (bm === "urgent" && !ENABLE_URGENT_FLOW) bm = "scheduled"; // safe fallback
  const payloadV2 = {
    job_type: String(job_type).trim(),
    ac_type: (ac_type || "").toString().trim(),
    btu: Number(btu || 0),
    machine_count: Number(machine_count || 1),
    wash_variant: (wash_variant || "").toString().trim(),
    repair_variant: (repair_variant || "").toString().trim(),
    admin_override_duration_min: 0, // ลูกค้าห้าม override
  };
  if (Array.isArray(services) && services.length) payloadV2.services = services;
  const duration_min_v2 = computeDurationMinMulti(payloadV2, { source: "public_book" });
  if (duration_min_v2 <= 0) return res.status(400).json({ error: "งานประเภทนี้ต้องให้แอดมินกำหนดเวลา (duration)" });
  const standard_price = computeStandardPriceMulti(payloadV2);

// ✅ Parse lat/lng from maps_url or address_text (fail-open)
const parsedLL = parseLatLngFromText(maps_url) || parseLatLngFromText(address_text);
const parsed_lat = parsedLL ? parsedLL.lat : null;
const parsed_lng = parsedLL ? parsedLL.lng : null;
console.log("[latlng_parse]", { ok: !!parsedLL });


  // ✅ Server-side validation: ต้องมีอย่างน้อย 1 ช่างว่างจริงในช่วงเวลานี้ (คิด buffer)
  // - scheduled => company, urgent => partner
  const requestedTechType = bm === "urgent" ? "partner" : "company";
  try {
    const techs = await listTechniciansByType(requestedTechType);
    const startIso = `${String(appointment_datetime).slice(0, 16)}:00`;
    const block = effectiveBlockMin(duration_min_v2);
    const tMin = toMin(String(startIso).slice(11, 16));
    let anyFree = false;
    for (const tech of techs) {
      const ts = toMin(tech.work_start || "09:00");
      const te = toMin(tech.work_end || "18:00");
      if (!(tMin >= ts && tMin + block <= te)) continue;
      const ok = await isTechFree(tech.username, startIso, duration_min_v2, null);
      if (ok) { anyFree = true; break; }
    }
    if (!anyFree) {
      return res.status(400).json({ error: "ช่วงเวลานี้เต็มแล้ว กรุณาเลือกเวลาอื่น" });
    }
  } catch (e) {
    // fail-open: ถ้าเช็คไม่ได้ไม่ให้จองพัง แต่ log ไว้
    console.warn("[public_book] availability_check_fail", { bm, err: e.message });
  }


  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) ดึงราคา base_price จาก DB
const serviceLineItems = (payloadV2.services && Array.isArray(payloadV2.services))
  ? buildServiceLineItemsFromPayload(payloadV2)
  : [];

// fallback (single service)
let computedItems = [];
let total = Number(standard_price || 0);

if (serviceLineItems.length) {
  computedItems = computedItems.concat(serviceLineItems);
  total = serviceLineItems.reduce((s,it)=> s + Number(it.line_total||0), 0);
} else if (total > 0) {
  computedItems.push({ item_id: null, item_name: `ค่าบริการมาตรฐาน (${payloadV2.job_type || '-'})`, qty: 1, unit_price: total, line_total: total });
}

// extras (customer-visible only)
if (itemIdQty.length) {
  const ids = itemIdQty.map((x) => x.item_id);
  const catR = await client.query(
    `SELECT item_id, item_name, base_price
     FROM public.catalog_items
     WHERE is_active=TRUE AND is_customer_visible=TRUE /* CUSTOMER_CATALOG_VISIBLE_ONLY */ AND item_id = ANY($1::bigint[])`,
    [ids]
  );

  const map = new Map(catR.rows.map((r) => [Number(r.item_id), r]));
  const extraLines = itemIdQty
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

  computedItems = computedItems.concat(extraLines);
}

// 2) สร้างงาน

    const r = await client.query(
      `
      INSERT INTO public.jobs
      (customer_name, customer_phone, job_type, appointment_datetime, job_price,
       address_text, technician_team, technician_username, job_status,
       booking_token, job_source, dispatch_mode, customer_note,
       maps_url, job_zone, duration_min, booking_mode)
      VALUES ($1,$2,$3,$4,$5,$6,NULL,NULL,$11,$7,'customer','offer',$8,$9,$10,$12,$13)
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
        bm === 'urgent' ? 'รอช่างยืนยัน' : 'รอตรวจสอบ',
        duration_min_v2,
        (bm === 'urgent' ? 'urgent' : 'scheduled'),
      ]
    );

    const job_id = r.rows[0].job_id;
    // ✅ booking_code (สุ่ม ไม่เรียง)
    const booking_code = await generateUniqueBookingCode(client);

    await client.query(`UPDATE public.jobs SET booking_code=$1 WHERE job_id=$2`, [booking_code, job_id]);

    // CREATE_URGENT_OFFERS_V2
    if (bm === "urgent" && ENABLE_URGENT_FLOW) {
      const partners = await client.query(
        `
        SELECT u.username
        FROM public.users u
        LEFT JOIN public.technician_profiles p ON p.username=u.username
        WHERE u.role='technician'
          AND COALESCE(p.accept_status,'ready') <> 'paused'
          AND COALESCE(p.employment_type,'company') = 'partner'
        ORDER BY u.username
        `
      );

      const apptIso = appointment_datetime;
      const availablePartners = [];
      for (const row of partners.rows || []) {
        const ok = await isTechFree(row.username, apptIso, duration_min_v2, null);
        if (ok) availablePartners.push(row.username);
        if (availablePartners.length >= 30) break; // limit scan
      }

      // ✅ safety: จำกัดไม่เกิน 30 ช่าง/ทีมที่ส่ง offer
      for (const u of availablePartners) {
        await client.query(
          `INSERT INTO public.job_offers (job_id, technician_username, status, expires_at)
           VALUES ($1,$2,'pending', NOW() + INTERVAL '10 minutes')`,
          [job_id, u]
        );
      }

      console.log("[public_book] urgent_offers", { job_id, booking_code, count: availablePartners.length });
    }


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

    console.log('[public_book]', { job_id, booking_code, booking_mode: bm, requested_tech_type: requestedTechType, duration_min: duration_min_v2, effective_block_min: effectiveBlockMin(duration_min_v2) });
    res.json({ success: true, job_id, booking_code, token: r.rows[0].booking_token, booking_mode: bm, duration_min: duration_min_v2, effective_block_min: effectiveBlockMin(duration_min_v2), travel_buffer_min: TRAVEL_BUFFER_MIN });
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
        tp.full_name AS tech_name, tp.photo_path AS tech_photo, tp.rank_level AS tech_rank_level, tp.rank_key AS tech_rank_key, tp.rating, tp.grade, tp.phone AS tech_phone
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



// =======================================
// 👥 TEAM (Public Tracking)
// - แสดงรายชื่อทีมช่างทั้งหมดในงาน (ถ้าเปิด flag)
// - Backward compatible: ยังส่ง field technician (ช่างหลัก) เหมือนเดิม
// =======================================
let technician_team = null;

if (FLAG_SHOW_TECH_TEAM_ON_TRACKING) {
  try {
    // ดึงสมาชิกทีมจากตารางใหม่ (job_team_members)
    const tmR = await pool.query(
      `SELECT username FROM public.job_team_members WHERE job_id=$1 ORDER BY username ASC`,
      [row.job_id]
    );
    const fromJoin = (tmR.rows || []).map((x) => String(x.username || "").trim()).filter(Boolean);

    // รองรับ legacy fields
    const legacy = [row.technician_username, row.technician_team]
      .map((x) => String(x || "").trim())
      .filter(Boolean);

    const uniq = Array.from(new Set([...fromJoin, ...legacy]));
    if (uniq.length) {
      const detR = await pool.query(
        `
        SELECT username, full_name, photo_path, rank_level, rank_key, rating, grade, phone
        FROM public.technician_profiles
        WHERE username = ANY($1::text[])
        `,
        [uniq]
      );
      const byU = new Map((detR.rows || []).map((x) => [String(x.username || "").trim(), x]));

      const allowPhone = FLAG_SHOW_TECH_PHONE_ON_TRACKING;
      const showPhone = allowPhone ? true : !!row.travel_started_at;

      technician_team = uniq.map((u) => {
        const d = byU.get(u) || {};
        return {
          username: u,
          full_name: d.full_name || null,
          photo: d.photo_path || null,
          rank_level: d.rank_level ?? null,
          rank_key: d.rank_key || null,
          rating: d.rating ?? null,
          grade: d.grade || null,
          phone: showPhone ? (d.phone || null) : null,
        };
      });
    } else {
      technician_team = [];
    }
  } catch (e) {
    // ไม่ให้ tracking ล่ม (fail-open แบบไม่พังหน้า)
    technician_team = [];
  }
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
            rank_level: row.tech_rank_level ?? null,
            rank_key: row.tech_rank_key || null,
            rating: row.rating,
            grade: row.grade,
            // ✅ เบอร์โทรช่างสำหรับ Tracking (ต้องผ่าน token/booking_code ที่ถูกต้องเท่านั้น)
            // - ถ้าเปิด flag: แสดงได้เลย
            // - ถ้าไม่เปิด: คงพฤติกรรมเดิม (แสดงหลังเริ่มเดินทาง)
            phone: FLAG_SHOW_TECH_PHONE_ON_TRACKING ? (row.tech_phone || null) : (row.travel_started_at ? (row.tech_phone || null) : null),
          }
        : null,

      // ✅ รายชื่อทีมช่างทั้งหมด (ถ้าเปิด flag) — ใช้ในหน้า Tracking
      technician_team,
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

// ✅ รองรับ Refresh/Deep-link แบบ "ไม่ต้องมี .html" (กันรีเฟรชเด้งไปหน้าแรก)
// - ตัวอย่าง: /tech, /admin, /track, /customer
app.get("/login", (req, res) => res.sendFile(sendHtml("login.html")));
app.get("/admin", (req, res) => res.sendFile(sendHtml("admin.html")));
app.get("/admin-add", (req, res) => res.sendFile(sendHtml("admin-add-v2.html")));
app.get("/admin-review", (req, res) => res.sendFile(sendHtml("admin-review-v2.html")));
app.get("/admin-queue", (req, res) => res.sendFile(sendHtml("admin-queue-v2.html")));
app.get("/admin-history", (req, res) => res.sendFile(sendHtml("admin-history-v2.html")));
app.get("/admin-tech", (req, res) => res.sendFile(sendHtml("admin-tech.html")));
app.get("/admin-legacy", (req, res) => res.sendFile(sendHtml("admin-legacy.html")));
app.get("/edit-profile", (req, res) => res.sendFile(sendHtml("edit-profile.html")));
app.get("/tech", (req, res) => res.sendFile(sendHtml("tech.html")));
app.get("/add-job", (req, res) => res.sendFile(sendHtml("add-job.html")));
app.get("/customer", (req, res) => res.sendFile(sendHtml("customer.html")));
app.get("/track", (req, res) => res.sendFile(sendHtml("track.html")));
app.get("/home", (req, res) => res.sendFile(sendHtml("index.html")));

app.get("/login.html", (req, res) => res.sendFile(sendHtml("login.html")));
app.get("/admin.html", (req, res) => res.sendFile(sendHtml("admin.html")));
app.get("/admin-add-v2.html", (req, res) => res.sendFile(sendHtml("admin-add-v2.html")));
app.get("/admin-review-v2.html", (req, res) => res.sendFile(sendHtml("admin-review-v2.html")));
app.get("/admin-queue-v2.html", (req, res) => res.sendFile(sendHtml("admin-queue-v2.html")));
app.get("/admin-history-v2.html", (req, res) => res.sendFile(sendHtml("admin-history-v2.html")));
app.get("/admin-tech.html", (req, res) => res.sendFile(sendHtml("admin-tech.html")));
app.get("/admin-legacy.html", (req, res) => res.sendFile(sendHtml("admin-legacy.html")));
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
