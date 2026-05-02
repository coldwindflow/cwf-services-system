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
const crypto = require("crypto");
const fs = require("fs");

// =======================================
// 🔔 Web Push Notifications (optional / fail-open)
// - ใช้แจ้งเตือนงานเข้าให้ช่าง แม้ปิดหน้า PWA
// - ถ้า package/ENV ไม่พร้อม ระบบงานเดิมต้องไม่พัง
// =======================================
let webpush = null;
try {
  webpush = require("web-push");
} catch (e) {
  console.warn("⚠️ web-push not installed; push notifications disabled");
}

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
const ENABLE_SERVICE_ZONE_FILTER = envBool("ENABLE_SERVICE_ZONE_FILTER", true);
const ENABLE_PARTNER_DEPOSIT_DEDUCTION = envBool("ENABLE_PARTNER_DEPOSIT_DEDUCTION", true);
const ENABLE_WEB_PUSH_NOTIFICATIONS = envBool("ENABLE_WEB_PUSH_NOTIFICATIONS", true);
const WEB_PUSH_PUBLIC_KEY = String(process.env.WEB_PUSH_PUBLIC_KEY || "").trim();
const WEB_PUSH_PRIVATE_KEY = String(process.env.WEB_PUSH_PRIVATE_KEY || "").trim();
const WEB_PUSH_SUBJECT = String(process.env.WEB_PUSH_SUBJECT || "mailto:admin@cwf-air.com").trim();
const WEB_PUSH_READY = Boolean(ENABLE_WEB_PUSH_NOTIFICATIONS && webpush && WEB_PUSH_PUBLIC_KEY && WEB_PUSH_PRIVATE_KEY);
if (WEB_PUSH_READY) {
  try { webpush.setVapidDetails(WEB_PUSH_SUBJECT, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY); }
  catch (e) { console.warn("⚠️ web-push VAPID setup failed", e.message); }
}
const TRAVEL_BUFFER_MIN = Math.max(0, Number(process.env.TRAVEL_BUFFER_MIN || 30)); // นาที/งาน (Travel Buffer)

const SERVICE_ZONE_SEEDS = [
  { code: "A", name: "bangkok_east_core", label: "กรุงเทพตะวันออกแกนหลัก", group: "bangkok", color: "#0B4BB3", order: 10, districts: ["พระโขนง", "บางนา", "สวนหลวง", "ประเวศ", "บางกะปิ", "สะพานสูง", "ลาดกระบัง"] },
  { code: "B", name: "bangkok_north_east", label: "กรุงเทพเหนือ-ตะวันออก", group: "bangkok", color: "#2563EB", order: 20, districts: ["ดอนเมือง", "สายไหม", "บางเขน", "หลักสี่", "จตุจักร", "บางซื่อ", "ลาดพร้าว", "วังทองหลาง", "บึงกุ่ม", "คันนายาว", "คลองสามวา", "มีนบุรี", "หนองจอก"] },
  { code: "C", name: "bangkok_inner", label: "กรุงเทพชั้นใน", group: "bangkok", color: "#06B6D4", order: 30, districts: ["ปทุมวัน", "ราชเทวี", "พญาไท", "ดุสิต", "พระนคร", "ป้อมปราบศัตรูพ่าย", "สัมพันธวงศ์", "บางรัก", "สาทร", "ยานนาวา", "ห้วยขวาง", "ดินแดง", "วัฒนา", "คลองเตย", "บางคอแหลม"] },
  { code: "D", name: "thonburi_inner", label: "ธนบุรีตอนใน", group: "bangkok_west", color: "#10B981", order: 40, districts: ["คลองสาน", "ธนบุรี", "บางกอกใหญ่", "บางกอกน้อย", "บางพลัด", "ตลิ่งชัน"] },
  { code: "E", name: "west_southwest_river_side", label: "ฝั่งตะวันตกตอนล่าง / ข้ามฝั่งแม่น้ำ", group: "bangkok_west", color: "#F59E0B", order: 50, districts: ["ภาษีเจริญ", "บางแค", "หนองแขม", "ทวีวัฒนา", "จอมทอง", "ราษฎร์บูรณะ", "ทุ่งครุ", "บางขุนเทียน", "บางบอน", "พระประแดง", "พระสมุทรเจดีย์"] },
  { code: "F", name: "samut_prakan_east", label: "สมุทรปราการฝั่งตะวันออก", group: "samut_prakan", color: "#EF4444", order: 60, districts: ["เมืองสมุทรปราการ", "บางพลี", "บางเสาธง", "บางบ่อ"] },
  { code: "G", name: "nonthaburi", label: "นนทบุรี", group: "nonthaburi", color: "#8B5CF6", order: 70, districts: ["เมืองนนทบุรี", "ปากเกร็ด", "บางกรวย", "บางใหญ่", "บางบัวทอง", "ไทรน้อย"] },
  { code: "H", name: "pathum_thani", label: "ปทุมธานี", group: "pathum_thani", color: "#EC4899", order: 80, districts: ["เมืองปทุมธานี", "คลองหลวง", "ธัญบุรี", "ลำลูกกา", "หนองเสือ", "ลาดหลุมแก้ว", "สามโคก"] },
];
const SERVICE_ZONE_BY_CODE = new Map(SERVICE_ZONE_SEEDS.map(z => [z.code, z]));

function normalizeThaiAreaText(v) {
  return String(v || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .replace(/^(เขต|อำเภอ|อําเภอ|อ\.)/u, "");
}

async function getServiceZones() {
  try {
    const r = await pool.query(
      `SELECT zone_code, zone_name, zone_label, province_group, color_hex, is_active, sort_order
       FROM public.service_zones
       WHERE is_active=TRUE
       ORDER BY sort_order, zone_code`
    );
    if (r.rows.length) return r.rows;
  } catch (_) {}
  return SERVICE_ZONE_SEEDS.map(z => ({
    zone_code: z.code,
    zone_name: z.name,
    zone_label: z.label,
    province_group: z.group,
    color_hex: z.color,
    is_active: true,
    sort_order: z.order,
  }));
}

function safeDecodeText(v) {
  const raw = String(v || "");
  try { return decodeURIComponent(raw.replace(/\+/g, " ")); } catch (_) { return raw; }
}

function extractLatLngFromMapsText(v) {
  const raw = safeDecodeText(v);
  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /(?:^|[^\d-])(-?\d{1,2}\.\d{4,})\s*,\s*(100\.\d{4,})(?:[^\d]|$)/
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= 13.35 && lat <= 14.35 && lng >= 99.75 && lng <= 101.25) return { lat, lng };
  }
  return null;
}

function detectServiceZoneFromLatLng(lat, lng) {
  const la = Number(lat), ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  let code = null;
  if (la >= 13.50 && la <= 13.77 && ln >= 100.58 && ln <= 100.92) code = "F";
  else if (la >= 13.49 && la <= 13.72 && ln >= 100.34 && ln < 100.58) code = "E";
  else if (la >= 13.70 && la <= 13.90 && ln >= 100.36 && ln < 100.52) code = "D";
  else if (la >= 13.78 && la <= 14.16 && ln >= 100.15 && ln <= 100.78) code = "G";
  else if (la >= 13.88 && la <= 14.25 && ln >= 100.35 && ln <= 100.95) code = "H";
  else if (la >= 13.68 && la <= 13.82 && ln >= 100.48 && ln < 100.62) code = "C";
  else if (la >= 13.62 && la <= 13.86 && ln >= 100.58 && ln <= 100.86) code = "A";
  else if (la >= 13.76 && la <= 14.02 && ln >= 100.50 && ln <= 100.95) code = "B";
  if (!code) return null;
  const z = SERVICE_ZONE_BY_CODE.get(code);
  return z ? { service_zone_code: z.code, service_zone_label: z.label, service_zone_source: "maps_coordinate", matched_district: null, matched_lat: la, matched_lng: ln } : null;
}

async function detectServiceZoneFromText({ address_text, job_zone, service_zone_code, home_province, home_district, maps_url } = {}) {
  const explicit = String(service_zone_code || "").trim().toUpperCase();
  if (explicit && SERVICE_ZONE_BY_CODE.has(explicit)) {
    const z = SERVICE_ZONE_BY_CODE.get(explicit);
    return { service_zone_code: z.code, service_zone_label: z.label, service_zone_source: "admin_override", matched_district: null };
  }
  const decodedMapText = safeDecodeText(maps_url);
  const hay = normalizeThaiAreaText([home_district, job_zone, address_text, home_province, decodedMapText].filter(Boolean).join(" "));
  const matches = [];
  if (hay) {
    for (const z of SERVICE_ZONE_SEEDS) {
      for (const district of z.districts) {
        const d = normalizeThaiAreaText(district);
        if (d && hay.includes(d)) matches.push({ z, district, len: d.length });
      }
    }
  }
  matches.sort((a, b) => b.len - a.len || a.z.order - b.z.order);
  const best = matches[0];
  if (best) return { service_zone_code: best.z.code, service_zone_label: best.z.label, service_zone_source: "auto_detect", matched_district: best.district };
  const ll = extractLatLngFromMapsText(maps_url || address_text || job_zone || "");
  if (ll) return detectServiceZoneFromLatLng(ll.lat, ll.lng);
  return null;
}

async function getTechnicianPrimaryZone(username) {
  const u = String(username || "").trim();
  if (!u) return null;
  try {
    const r = await pool.query(
      `SELECT p.home_service_zone_code, p.secondary_service_zone_code, p.allow_out_of_zone, p.service_radius_km,
              z.zone_label, z2.zone_label AS secondary_service_zone_label
       FROM public.technician_profiles p
       LEFT JOIN public.service_zones z ON z.zone_code=p.home_service_zone_code
       LEFT JOIN public.service_zones z2 ON z2.zone_code=p.secondary_service_zone_code
       WHERE p.username=$1
       LIMIT 1`,
      [u]
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      zone_code: row.home_service_zone_code || null,
      zone_label: row.zone_label || (SERVICE_ZONE_BY_CODE.get(row.home_service_zone_code || "")?.label || null),
      secondary_zone_code: row.secondary_service_zone_code || null,
      secondary_zone_label: row.secondary_service_zone_label || (SERVICE_ZONE_BY_CODE.get(row.secondary_service_zone_code || "")?.label || null),
      allow_out_of_zone: !!row.allow_out_of_zone,
      service_radius_km: row.service_radius_km == null ? null : Number(row.service_radius_km),
    };
  } catch (_) {
    return null;
  }
}

async function updateTechnicianHomeZone(username, home_province, home_district, allow_out_of_zone = false, secondary_service_zone_code = "", service_radius_km = null) {
  const u = String(username || "").trim();
  if (!u) throw new Error("username required");
  const cleanProvinceInput = String(home_province || "").trim();
  const cleanDistrictInput = String(home_district || "").trim();
  let existingHome = null;
  if (!cleanProvinceInput || !cleanDistrictInput) {
    try {
      const existingQ = await pool.query(
        `SELECT home_province, home_district FROM public.technician_profiles WHERE username=$1 LIMIT 1`,
        [u]
      );
      existingHome = existingQ.rows?.[0] || null;
    } catch (_) {}
  }
  const cleanProvince = cleanProvinceInput || String(existingHome?.home_province || "").trim();
  const cleanDistrict = cleanDistrictInput || String(existingHome?.home_district || "").trim();
  const detected = await detectServiceZoneFromText({ home_province: cleanProvince, home_district: cleanDistrict });
  const zoneCode = detected?.service_zone_code || null;
  const secondaryCode = String(secondary_service_zone_code || "").trim().toUpperCase();
  const safeSecondaryCode = secondaryCode && SERVICE_ZONE_BY_CODE.has(secondaryCode) && secondaryCode !== zoneCode ? secondaryCode : null;
  const radiusNumRaw = Number(service_radius_km);
  const safeRadiusKm = Number.isFinite(radiusNumRaw) && radiusNumRaw > 0 ? Math.min(Math.max(radiusNumRaw, 1), 500) : null;
  await pool.query(
    `INSERT INTO public.technician_profiles
       (username, home_province, home_district, home_service_zone_code, secondary_service_zone_code, allow_out_of_zone, preferred_zone, service_radius_km, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
     ON CONFLICT (username) DO UPDATE SET
       home_province=EXCLUDED.home_province,
       home_district=EXCLUDED.home_district,
       home_service_zone_code=EXCLUDED.home_service_zone_code,
       secondary_service_zone_code=EXCLUDED.secondary_service_zone_code,
       allow_out_of_zone=EXCLUDED.allow_out_of_zone,
       preferred_zone=COALESCE(NULLIF(EXCLUDED.home_district,''), technician_profiles.preferred_zone),
       service_radius_km=EXCLUDED.service_radius_km,
       updated_at=NOW()`,
    [u, cleanProvince || null, cleanDistrict || null, zoneCode, safeSecondaryCode, !!allow_out_of_zone, cleanDistrict || null, safeRadiusKm]
  );
  await pool.query(`UPDATE public.technician_service_zones SET is_primary=FALSE, is_active=FALSE, updated_at=NOW() WHERE technician_username=$1`, [u]);
  const zoneRows = [[zoneCode, 1, true], [safeSecondaryCode, 2, false]].filter(x => x[0]);
  for (const [code, priority, isPrimary] of zoneRows) {
    await pool.query(
      `INSERT INTO public.technician_service_zones (technician_username, zone_code, priority, is_primary, is_active, updated_at)
       VALUES ($1,$2,$3,$4,TRUE,NOW())
       ON CONFLICT (technician_username, zone_code) DO UPDATE SET
         priority=EXCLUDED.priority, is_primary=EXCLUDED.is_primary, is_active=TRUE, updated_at=NOW()`,
      [u, code, priority, isPrimary]
    );
  }
  const secondaryZone = safeSecondaryCode ? SERVICE_ZONE_BY_CODE.get(safeSecondaryCode) : null;
  return { ...detected, home_province: cleanProvince, home_district: cleanDistrict, preferred_zone: cleanDistrict, allow_out_of_zone: !!allow_out_of_zone, secondary_service_zone_code: safeSecondaryCode, secondary_service_zone_label: secondaryZone?.label || null, service_radius_km: safeRadiusKm };
}

async function technicianMatchesServiceZone(username, zone_code) {
  const z = String(zone_code || "").trim().toUpperCase();
  if (!z) return { matches: false, allow_out_of_zone: false };
  const pz = await getTechnicianPrimaryZone(username);
  return {
    matches: (!!pz?.zone_code && String(pz.zone_code).toUpperCase() === z) || (!!pz?.secondary_zone_code && String(pz.secondary_zone_code).toUpperCase() === z),
    allow_out_of_zone: !!pz?.allow_out_of_zone,
    zone_code: pz?.zone_code || null,
    secondary_zone_code: pz?.secondary_zone_code || null,
  };
}

function rankTechniciansForServiceZone(technicians, zone_code) {
  const z = String(zone_code || "").trim().toUpperCase();
  const rows = Array.isArray(technicians) ? technicians : [];
  return rows.slice().sort((a, b) => {
    const az = String(a.home_service_zone_code || "").trim().toUpperCase();
    const bz = String(b.home_service_zone_code || "").trim().toUpperCase();
    const as = String(a.secondary_service_zone_code || "").trim().toUpperCase();
    const bs = String(b.secondary_service_zone_code || "").trim().toUpperCase();
    const ar = z && az === z ? 0 : (z && as === z ? 1 : (a.allow_out_of_zone ? 2 : 3));
    const br = z && bz === z ? 0 : (z && bs === z ? 1 : (b.allow_out_of_zone ? 2 : 3));
    if (ar !== br) return ar - br;
    return String(a.username || "").localeCompare(String(b.username || ""));
  });
}

// =======================================
// ☁️ CLOUDINARY (optional / backward compatible)
// - หากตั้ง ENV ครบ จะอัปโหลดรูปขึ้น Cloudinary แล้วเก็บ public_url เป็น https://...
// - ถ้าไม่ตั้ง จะ fallback เซฟลงดิสก์เดิม (/uploads)
// =======================================
const CLOUDINARY_CLOUD_NAME = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const CLOUDINARY_API_KEY = String(process.env.CLOUDINARY_API_KEY || '').trim();
const CLOUDINARY_API_SECRET = String(process.env.CLOUDINARY_API_SECRET || '').trim();
const CLOUDINARY_ENABLED = Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);

function cloudinarySignParams(params) {
  // signature = sha1( sort(params) as key=value&... + api_secret )
  const pairs = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && String(params[k]).length)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  const toSign = pairs + CLOUDINARY_API_SECRET;
  return crypto.createHash('sha1').update(toSign).digest('hex');
}

async function cloudinaryUploadBuffer({ buffer, mimetype, folder, publicId, transformation, resourceType = 'image' }) {
  if (!CLOUDINARY_ENABLED) throw new Error('CLOUDINARY_NOT_CONFIGURED');
  const ts = Math.floor(Date.now() / 1000);
  const params = {
    timestamp: ts,
    folder: folder || undefined,
    public_id: publicId || undefined,
    transformation: transformation || undefined,
  };
  const signature = cloudinarySignParams(params);

  // ใช้ data URI เพื่อลด dependency (ไม่ต้องใช้ SDK/FormData)
  const dataUri = `data:${mimetype || 'image/jpeg'};base64,${Buffer.from(buffer).toString('base64')}`;
  const body = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && String(v).length)),
    api_key: CLOUDINARY_API_KEY,
    signature,
    file: dataUri,
  });

  const safeResourceType = resourceType === 'raw' ? 'raw' : 'image';
  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUDINARY_CLOUD_NAME)}/${safeResourceType}/upload`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json || !json.secure_url) {
    const msg = json?.error?.message || `Cloudinary upload failed (${resp.status})`;
    const err = new Error(msg);
    err._cloudinary = json;
    throw err;
  }
  return json; // {secure_url, public_id, bytes, width, height, ...}
}


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

  // Prefer place-pin coordinates for Google Maps URLs.
  // Many Google Maps URLs contain both viewport coords (@lat,lng) and place coords (!3dlat!4dlng).
  // For check-in / navigation we must prefer the place coords to be precise.

  // 0) !3dlat!4dlng (place pin)
  {
    const m = s.match(/!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]), via: "3d4d" };
  }

  // try decode once (handles %2C etc.)
  let decoded = null;
  try {
    decoded = decodeURIComponent(s);
  } catch (_) {
    decoded = null;
  }

  if (decoded && decoded !== s) {
    // 0.1) !3dlat!4dlng in decoded
    const m = decoded.match(/!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]), via: "3d4d" };
  }

  // 1) q=lat,lng | query=lat,lng | ll=lat,lng
  {
    const m = s.match(/[?&](?:q|query|ll)=\s*(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]), via: "q" };
    if (decoded) {
      const md = decoded.match(/[?&](?:q|query|ll)=\s*(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/);
      if (md) return { lat: Number(md[1]), lng: Number(md[2]), via: "q" };
    }
  }

  // 2) center=lat,lng
  {
    const m = s.match(/[?&]center=\s*(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]), via: "center" };
    if (decoded) {
      const md = decoded.match(/[?&]center=\s*(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/);
      if (md) return { lat: Number(md[1]), lng: Number(md[2]), via: "center" };
    }
  }

  // 3) @lat,lng (viewport)
  {
    const m = s.match(/@\s*(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]), via: "@" };
    if (decoded) {
      const md = decoded.match(/@\s*(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/);
      if (md) return { lat: Number(md[1]), lng: Number(md[2]), via: "@" };
    }
  }

  // 5) JSON-ish "lat":..,"lng":..
  {
    const m = s.match(/"lat"\s*:\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*"lng"\s*:\s*(-?\d{1,3}(?:\.\d+)?)/);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]), via: "json" };
  }

  return null;
}

// ------------------------------------------------------------------
// Backward-compatible alias
// Some booking/admin flows reference `parseLatLngFromText`, but the
// actual implementation in this codebase is `extractLatLngFromText`.
// Missing this function will crash admin book v2 & slot loading.
// ------------------------------------------------------------------
function parseLatLngFromText(text) {
  const r = extractLatLngFromText(text);
  if (!r) return null;
  const lat = Number(r.lat);
  const lng = Number(r.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Basic sanity bounds
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return r;
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
const https = require("https");
const multer = require("multer");

const pool = require("./db");

const app = express();
// Render/Reverse-proxy: allow req.protocol to reflect X-Forwarded-Proto
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// =======================================
// 🔐 Public Login (LINE OAuth) - Production-ready (Minimal / No regression)
// - Cookie: cwf_token (HttpOnly)
// - CSRF protection via state stored in HttpOnly cookie
// - Routes:
//   GET /auth/line
//   GET /auth/line/callback
//   GET /public/me
// =======================================

function b64urlEncode(input) {
  const b = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecodeToBuffer(str) {
  const s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  return Buffer.from(s + pad, 'base64');
}

function jwtSign(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = b64urlEncode(JSON.stringify(header));
  const p = b64urlEncode(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const sig = crypto.createHmac('sha256', String(secret)).update(data).digest();
  return `${data}.${b64urlEncode(sig)}`;
}

function jwtVerify(token, secret) {
  const t = String(token || '').trim();
  const parts = t.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const data = `${h}.${p}`;
  const expected = crypto.createHmac('sha256', String(secret)).update(data).digest();
  const got = b64urlDecodeToBuffer(s);
  // timing safe compare
  if (got.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(got, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(b64urlDecodeToBuffer(p).toString('utf8'));
  } catch (_) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload && payload.exp && now > Number(payload.exp)) return null;
  return payload || null;
}

function appendSetCookie(res, cookieStr) {
  try {
    const prev = res.getHeader('Set-Cookie');
    if (!prev) {
      res.setHeader('Set-Cookie', cookieStr);
      return;
    }
    if (Array.isArray(prev)) {
      res.setHeader('Set-Cookie', [...prev, cookieStr]);
      return;
    }
    res.setHeader('Set-Cookie', [prev, cookieStr]);
  } catch (_) {}
}

function setHttpOnlyCookie(res, name, value, opts = {}) {
  const maxAgeSec = Number(opts.maxAgeSec || 7 * 24 * 60 * 60);
  const sameSite = opts.sameSite || 'Lax';
  const pathVal = opts.path || '/';
  const httpOnly = opts.httpOnly !== false;
  const secure = !!opts.secure;
  const encoded = encodeURIComponent(String(value));
  let c = `${name}=${encoded}; Max-Age=${maxAgeSec}; Path=${pathVal}; SameSite=${sameSite}`;
  if (httpOnly) c += '; HttpOnly';
  if (secure) c += '; Secure';
  appendSetCookie(res, c);
}

function clearCookie(res, name) {
  // Clear both with/without Secure for max compatibility
  appendSetCookie(res, `${name}=; Max-Age=0; Path=/; SameSite=Lax`);
  appendSetCookie(res, `${name}=; Max-Age=0; Path=/; SameSite=Lax; Secure`);
}

function getReqBaseUrl(req) {
  const xfProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = xfProto || req.protocol || 'http';
  const host = req.get('host');
  return `${proto}://${host}`;
}

function isHttpsReq(req) {
  const xfProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return (xfProto ? xfProto === 'https' : req.protocol === 'https');
}

function parseCookieValue(req, name) {
  try {
    const cookies = parseCookies(req.headers?.cookie || '');
    let v = cookies?.[name];
    if (!v) return null;
    v = v.replace(/^"|"$/g, '');
    try { v = decodeURIComponent(v); } catch (_) {}
    return v || null;
  } catch (_) {
    return null;
  }
}

function getJwtSecret() {
  return String(process.env.CWF_JWT_SECRET || process.env.JWT_SECRET || '').trim();
}

// 🔐 Customer JWT (LINE) helper (cookie: cwf_token)
function requireCustomerJwt(req, res, next) {
  try {
    const jwtSecret = getJwtSecret();
    if (!jwtSecret) return res.status(401).json({ error: 'NOT_LOGGED_IN' });
    const token = parseCookieValue(req, 'cwf_token');
    if (!token) return res.status(401).json({ error: 'NOT_LOGGED_IN' });
    const payload = jwtVerify(token, jwtSecret);
    if (!payload) return res.status(401).json({ error: 'NOT_LOGGED_IN' });
    req.customer = payload;
    return next();
  } catch (_) {
    return res.status(401).json({ error: 'NOT_LOGGED_IN' });
  }
}

app.get('/auth/line', (req, res) => {
  const clientId = String(process.env.LINE_CHANNEL_ID || '').trim();
  const callback = String(process.env.LINE_CALLBACK_URL || '').trim() || `${getReqBaseUrl(req)}/auth/line/callback`;
  if (!clientId) {
    return res.status(500).send('LINE_CHANNEL_ID is not set');
  }
  const state = crypto.randomBytes(18).toString('hex');
  // store state in HttpOnly cookie to prevent CSRF
  const secureCookie = callback.startsWith('https://');
  setHttpOnlyCookie(res, 'cwf_line_state', state, { maxAgeSec: 10 * 60, secure: secureCookie });
  const authorize = new URL('https://access.line.me/oauth2/v2.1/authorize');
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', callback);
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('scope', 'profile');
  res.redirect(authorize.toString());
});

app.get('/auth/line/callback', async (req, res) => {
  try {
    const code = String(req.query?.code || '').trim();
    const state = String(req.query?.state || '').trim();
    const stateCookie = parseCookieValue(req, 'cwf_line_state');

    // always clear state cookie
    clearCookie(res, 'cwf_line_state');

    if (!code) return res.redirect('/customer.html?login=failed&reason=no_code');
    if (!state || !stateCookie || state !== stateCookie) {
      return res.redirect('/customer.html?login=failed&reason=bad_state');
    }

    const clientId = String(process.env.LINE_CHANNEL_ID || '').trim();
    const clientSecret = String(process.env.LINE_CHANNEL_SECRET || '').trim();
    const callback = String(process.env.LINE_CALLBACK_URL || '').trim() || `${getReqBaseUrl(req)}/auth/line/callback`;
    const jwtSecret = getJwtSecret();
    if (!clientId || !clientSecret) return res.redirect('/customer.html?login=failed&reason=misconfig');
    if (!jwtSecret) return res.redirect('/customer.html?login=failed&reason=no_jwt_secret');

    // Exchange code for access token
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callback,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    const tokenText = await tokenRes.text().catch(()=> '');
    let tokenJson = {};
    try{ tokenJson = tokenText ? JSON.parse(tokenText) : {}; }catch(_){ tokenJson = {}; }
    if (!tokenRes.ok) {
      console.error('[LINE_TOKEN_HTTP]', tokenRes.status, tokenText);
      return res.redirect(`/customer.html?login=failed&reason=token_http_${tokenRes.status}`);
    }
    const accessToken = String(tokenJson?.access_token || '').trim();
    if (!accessToken) return res.redirect('/customer.html?login=failed&reason=no_access_token');

    // Fetch profile
    const profRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profText = await profRes.text().catch(()=> '');
    let prof = {};
    try{ prof = profText ? JSON.parse(profText) : {}; }catch(_){ prof = {}; }
    if (!profRes.ok) {
      console.error('[LINE_PROFILE_HTTP]', profRes.status, profText);
      return res.redirect(`/customer.html?login=failed&reason=profile_http_${profRes.status}`);
    }
    const userId = String(prof?.userId || '').trim();
    const name = String(prof?.displayName || '').trim();
    const picture = String(prof?.pictureUrl || '').trim();
    if (!userId) return res.redirect('/customer.html?login=failed&reason=no_user');

    // Issue JWT
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: `line:${userId}`,
      provider: 'line',
      name: name || 'LINE User',
      picture: picture || '',
      iat: now,
      exp: now + (7 * 24 * 60 * 60),
    };
    const token = jwtSign(payload, jwtSecret);
    const secureCookie2 = callback.startsWith('https://');
    setHttpOnlyCookie(res, 'cwf_token', token, { maxAgeSec: 7 * 24 * 60 * 60, secure: secureCookie2 });
    return res.redirect('/customer.html?login=success');
  } catch (e) {
    console.error('[LINE_CALLBACK_ERROR]', e);
    return res.redirect('/customer.html?login=failed&reason=server');
  }
});

// =======================================
// 🔐 App Login with LINE (Admin / Technician)
// - Existing customer LINE login remains unchanged at /auth/line
// - App LINE login binds LINE userId to an existing CWF user after password verification
// =======================================
app.get('/auth/line/app', (req, res) => {
  const clientId = String(process.env.LINE_CHANNEL_ID || '').trim();
  const callback = getLineAppCallbackUrl(req);
  if (!clientId) return res.status(500).send('LINE_CHANNEL_ID is not set');
  const state = crypto.randomBytes(18).toString('hex');
  const secureCookie = callback.startsWith('https://');
  const next = String(req.query?.next || '').trim();
  setHttpOnlyCookie(res, 'cwf_line_app_state', state, { maxAgeSec: 10 * 60, secure: secureCookie });
  if (['partner_apply','tech_bind'].includes(next)) setHttpOnlyCookie(res, 'cwf_line_next', next, { maxAgeSec: 10 * 60, secure: secureCookie });
  const authorize = new URL('https://access.line.me/oauth2/v2.1/authorize');
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', callback);
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('scope', 'profile');
  res.redirect(authorize.toString());
});

app.get('/auth/line/app/callback', async (req, res) => {
  try {
    const code = String(req.query?.code || '').trim();
    const state = String(req.query?.state || '').trim();
    const stateCookie = parseCookieValue(req, 'cwf_line_app_state');
    clearCookie(res, 'cwf_line_app_state');
    if (!code) return res.redirect('/login.html?line=failed&reason=no_code');
    if (!state || !stateCookie || state !== stateCookie) return res.redirect('/login.html?line=failed&reason=bad_state');

    const clientId = String(process.env.LINE_CHANNEL_ID || '').trim();
    const clientSecret = String(process.env.LINE_CHANNEL_SECRET || '').trim();
    const callback = getLineAppCallbackUrl(req);
    if (!clientId || !clientSecret) return res.redirect('/login.html?line=failed&reason=misconfig');

    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: callback, client_id: clientId, client_secret: clientSecret }),
    });
    const tokenText = await tokenRes.text().catch(()=> '');
    let tokenJson = {};
    try { tokenJson = tokenText ? JSON.parse(tokenText) : {}; } catch (_) {}
    if (!tokenRes.ok) {
      console.error('[LINE_APP_TOKEN_HTTP]', tokenRes.status, tokenText);
      return res.redirect(`/login.html?line=failed&reason=token_http_${tokenRes.status}`);
    }
    const accessToken = String(tokenJson?.access_token || '').trim();
    if (!accessToken) return res.redirect('/login.html?line=failed&reason=no_access_token');

    const profRes = await fetch('https://api.line.me/v2/profile', { headers: { Authorization: `Bearer ${accessToken}` } });
    const profText = await profRes.text().catch(()=> '');
    let prof = {};
    try { prof = profText ? JSON.parse(profText) : {}; } catch (_) {}
    if (!profRes.ok) {
      console.error('[LINE_APP_PROFILE_HTTP]', profRes.status, profText);
      return res.redirect(`/login.html?line=failed&reason=profile_http_${profRes.status}`);
    }
    const lineUserId = String(prof?.userId || '').trim();
    if (!lineUserId) return res.redirect('/login.html?line=failed&reason=no_user');
    const lineNext = parseCookieValue(req, 'cwf_line_next');
    clearCookie(res, 'cwf_line_next');


    if (lineNext === 'tech_bind') {
      const current = parseCwfAuth(req);
      if (current?.username) {
        await bindLineProfileToUser(current.username, prof, pool);
        const login = await issueAppLoginForUser(res, current.username);
        return res.redirect(`/line-login-bridge.html?username=${encodeURIComponent(login.username)}&role=${encodeURIComponent(login.role)}&to=${encodeURIComponent(safeRedirectTargetForRole(login.role))}`);
      }
      return res.redirect('/login.html?line=failed&reason=login_required');
    }

    const found = await pool.query(
      `SELECT username, role FROM public.users WHERE line_user_id=$1 LIMIT 1`,
      [lineUserId]
    );
    if ((found.rows || []).length) {
      const row = found.rows[0];
      const login = await issueAppLoginForUser(res, row.username);
      return res.redirect(`/line-login-bridge.html?username=${encodeURIComponent(login.username)}&role=${encodeURIComponent(login.role)}&to=${encodeURIComponent(safeRedirectTargetForRole(login.role))}`);
    }

    const bindToken = createLineBindToken(prof);
    if (!bindToken) return res.redirect('/login.html?line=failed&reason=no_jwt_secret');
    const secureCookie = callback.startsWith('https://');
    setHttpOnlyCookie(res, 'cwf_line_bind', bindToken, { maxAgeSec: 10 * 60, secure: secureCookie });
    if (lineNext === 'partner_apply') return res.redirect('/partner-apply.html?line_pending=1');
    return res.redirect('/login.html?line_new=1');
  } catch (e) {
    console.error('[LINE_APP_CALLBACK_ERROR]', e);
    return res.redirect('/login.html?line=failed&reason=server');
  }
});

app.post('/auth/line/bind', async (req, res) => {
  try {
    const lineProfile = readLineBindToken(req);
    if (!lineProfile) return res.status(401).json({ error: 'LINE_BIND_EXPIRED' });
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!username || !password) return res.status(400).json({ error: 'กรุณากรอก username และ password เพื่อผูก LINE' });
    const r = await pool.query(`SELECT username, role, password FROM public.users WHERE username=$1 LIMIT 1`, [username]);
    if (!(r.rows || []).length) return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านผิด' });
    const passwordOk = await verifyPasswordAgainstStored(password, r.rows[0].password);
    if (!passwordOk) return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านผิด' });
    await bindLineProfileToUser(r.rows[0].username, lineProfile, pool);
    clearCookie(res, 'cwf_line_bind');
    const login = await issueAppLoginForUser(res, r.rows[0].username);
    return res.json({ ok: true, username: login.username, role: login.role });
  } catch (e) {
    console.error('POST /auth/line/bind error:', e);
    return res.status(500).json({ error: 'ผูก LINE ไม่สำเร็จ' });
  }
});

app.post('/auth/password-reset/request', async (req, res) => {
  try {
    const usernameOrPhone = String(req.body?.username || req.body?.phone || '').trim();
    const note = String(req.body?.note || '').trim().slice(0, 500);
    if (!usernameOrPhone) return res.status(400).json({ error: 'กรุณากรอกเบอร์โทรหรือ username' });
    await pool.query(
      `INSERT INTO public.password_reset_requests(username_or_phone, note, status, created_at)
       VALUES($1,$2,'requested',NOW())`,
      [usernameOrPhone, note || null]
    );
    return res.json({ ok: true, message: 'ส่งคำขอรีเซ็ตรหัสผ่านแล้ว แอดมินจะตรวจสอบให้' });
  } catch (e) {
    console.error('POST /auth/password-reset/request error:', e);
    return res.status(500).json({ error: 'ส่งคำขอรีเซ็ตรหัสผ่านไม่สำเร็จ' });
  }
});

app.get('/public/me', (req, res) => {
  try {
    const jwtSecret = getJwtSecret();
    if (!jwtSecret) return res.json({ logged_in: false });
    const token = parseCookieValue(req, 'cwf_token');
    if (!token) return res.json({ logged_in: false });
    const payload = jwtVerify(token, jwtSecret);
    if (!payload) return res.json({ logged_in: false });
    // attach customer profile (address/phone/maps) if exists
    const sub = String(payload.sub || '').trim();
    const user = {
      name: String(payload.name || ''),
      picture: String(payload.picture || ''),
      provider: String(payload.provider || 'line'),
    };
    if (!sub) return res.json({ logged_in: true, user, profile: null });

    pool.query(
      `SELECT phone, address, maps_url FROM public.customer_profiles WHERE sub=$1 LIMIT 1`,
      [sub]
    ).then((r) => {
      const row = r.rows && r.rows[0] ? r.rows[0] : null;
      return res.json({
        logged_in: true,
        user,
        profile: row ? {
          phone: row.phone || '',
          address: row.address || '',
          maps_url: row.maps_url || ''
        } : null
      });
    }).catch(() => {
      return res.json({ logged_in: true, user, profile: null });
    });
    return;
  } catch (_) {
    return res.json({ logged_in: false });
  }
});

// ✅ Public LINE config (debug only - no secrets)
// ใช้ในหน้า customer debug panel เพื่อเช็คว่า ENV/callback ถูกต้องหรือไม่
app.get('/public/line_config', (req, res) => {
  try {
    const hasChannelId = !!String(process.env.LINE_CHANNEL_ID || '').trim();
    const hasChannelSecret = !!String(process.env.LINE_CHANNEL_SECRET || '').trim();
    const hasJwtSecret = !!String(process.env.CWF_JWT_SECRET || process.env.JWT_SECRET || '').trim();
    const callbackUrl = String(process.env.LINE_CALLBACK_URL || '').trim() || `${getReqBaseUrl(req)}/auth/line/callback`;

    return res.json({
      ok: true,
      env: {
        LINE_CHANNEL_ID: hasChannelId,
        LINE_CHANNEL_SECRET: hasChannelSecret,
        JWT_SECRET: hasJwtSecret,
        LINE_CALLBACK_URL: !!String(process.env.LINE_CALLBACK_URL || '').trim(),
      },
      callback_url: callbackUrl,
      base_url: getReqBaseUrl(req),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'LINE_CONFIG_FAILED' });
  }
});

// Update customer address (modal edit) - backward compatible
app.patch('/public/profile/address', requireCustomerJwt, async (req, res) => {
  try {
    const address = String(req.body?.address || '').trim();
    const maps_url = String(req.body?.maps_url || '').trim();
    if (address.length < 5) return res.status(400).json({ error: 'INVALID_ADDRESS' });
    if (maps_url && maps_url.length > 600) return res.status(400).json({ error: 'INVALID_MAPS_URL' });

    const sub = String(req.customer?.sub || '').trim();
    const provider = String(req.customer?.provider || 'line').trim();
    const name = String(req.customer?.name || '').trim();
    const picture = String(req.customer?.picture || '').trim();
    if (!sub) return res.status(401).json({ error: 'NOT_LOGGED_IN' });

    await pool.query(
      `INSERT INTO public.customer_profiles (sub, provider, display_name, picture_url, address, maps_url, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (sub)
       DO UPDATE SET
         provider=EXCLUDED.provider,
         display_name=EXCLUDED.display_name,
         picture_url=EXCLUDED.picture_url,
         address=EXCLUDED.address,
         maps_url=EXCLUDED.maps_url,
         updated_at=NOW()`,
      [sub, provider, name, picture, address, maps_url || null]
    );
    return res.json({ ok: true });
  } catch (e) {
    console.error('PATCH /public/profile/address', e);
    return res.status(500).json({ error: 'SAVE_FAILED' });
  }
});

// Customer logout (clears LINE JWT cookie)
app.get('/public/logout', (req, res) => {
  try { clearCookie(res, 'cwf_token'); } catch (_) {}
  return res.redirect('/customer.html?logout=1');
});
app.post('/public/logout', (req, res) => {
  try { clearCookie(res, 'cwf_token'); } catch (_) {}
  return res.json({ ok: true });
});

// =======================================
// 📝 Customer Register (minimal)
// - ต้อง login (LINE JWT)
// - เก็บข้อมูลพื้นฐานไว้ใช้ครั้งหน้า
// =======================================
app.post('/public/register', requireCustomerJwt, async (req, res) => {
  try {
    const phone = String(req.body?.phone || '').trim();
    const address = String(req.body?.address || '').trim();
    const maps_url = String(req.body?.maps_url || '').trim();

    // ✅ validate เบอร์โทรขั้นต่ำ (ไม่ strict เกินไป)
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 9) return res.status(400).json({ error: 'INVALID_PHONE' });
    if (address.length < 5) return res.status(400).json({ error: 'INVALID_ADDRESS' });
    if (maps_url && maps_url.length > 600) return res.status(400).json({ error: 'INVALID_MAPS_URL' });

    const sub = String(req.customer?.sub || '').trim();
    const provider = String(req.customer?.provider || 'line').trim();
    const name = String(req.customer?.name || '').trim();
    const picture = String(req.customer?.picture || '').trim();
    if (!sub) return res.status(401).json({ error: 'NOT_LOGGED_IN' });

    await pool.query(
      `INSERT INTO public.customer_profiles (sub, provider, display_name, picture_url, phone, address, maps_url, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (sub)
       DO UPDATE SET
         provider=EXCLUDED.provider,
         display_name=EXCLUDED.display_name,
         picture_url=EXCLUDED.picture_url,
         phone=EXCLUDED.phone,
         address=EXCLUDED.address,
         maps_url=EXCLUDED.maps_url,
         updated_at=NOW()`,
      [sub, provider, name, picture, phone, address, maps_url || null]
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error('POST /public/register', e);
    return res.status(500).json({ error: 'REGISTER_FAILED' });
  }
});

function normalizePhoneLookupDigits(phone) {
  return String(phone || "").replace(/\D/g, "").trim();
}

function buildPhoneLookupCandidates(phone) {
  const digits = normalizePhoneLookupDigits(phone);
  if (!digits) return [];
  const set = new Set([digits]);
  if (digits.startsWith("66") && digits.length >= 9) set.add(`0${digits.slice(2)}`);
  if (digits.startsWith("0066") && digits.length >= 11) set.add(`0${digits.slice(4)}`);
  if (digits.startsWith("0") && digits.length >= 9) set.add(`66${digits.slice(1)}`);
  return [...set].filter(Boolean);
}

// =======================================
// 📷 UPLOADS CONFIG (ต้องอยู่ก่อน route ที่ใช้ upload)
// - แก้ Deploy crash: "Cannot access 'upload' before initialization"
// =======================================
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const PARTNER_APPLICATION_UPLOAD_DIR = path.join(UPLOAD_DIR, "partner_applications");
if (!fs.existsSync(PARTNER_APPLICATION_UPLOAD_DIR)) fs.mkdirSync(PARTNER_APPLICATION_UPLOAD_DIR, { recursive: true });

// =======================================
// 🔐 AUTH (session cookie) for Admin pages/APIs
// - cookie: cwf_auth (base64 JSON: {u,r,exp})
// - validate exp and verify role against DB
// - used for:
//   1) protect admin HTML (prevent back/cached access after logout)
//   2) protect /admin/* APIs
// =======================================


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


function setAuthCookies(res, { cwf_auth_base64 = null, session_token = null, max_age_sec = 7 * 24 * 60 * 60 } = {}) {
  try {
    const secure = (process.env.FORCE_SECURE_COOKIE === '1') ? '; Secure' : '';
    const cookies = [];
    if (cwf_auth_base64 !== null) {
      cookies.push(`cwf_auth=${cwf_auth_base64}; Max-Age=${max_age_sec}; Path=/; SameSite=Lax${secure}`);
    }
    if (session_token !== null) {
      cookies.push(`cwf_session=${session_token}; Max-Age=${max_age_sec}; Path=/; SameSite=Lax; HttpOnly${secure}`);
    }
    if (cookies.length) res.setHeader('Set-Cookie', cookies);
  } catch (_) {}
}

function clearAuthCookies(res) {
  // Clear cookies in the most compatible way (with and without Secure)
  try {
    const base1 = 'cwf_auth=; Max-Age=0; Path=/; SameSite=Lax';
    const base2 = 'cwf_session=; Max-Age=0; Path=/; SameSite=Lax';
    res.setHeader('Set-Cookie', [
      base1, base1 + '; Secure',
      base2, base2 + '; Secure'
    ]);
  } catch (_) {}
}

function parseCwfSessionToken(req) {
  try {
    const cookies = parseCookies(req.headers?.cookie || '');
    let token = cookies.cwf_session;
    if (!token) return null;
    token = token.replace(/^"|"$/g, '');
    try { token = decodeURIComponent(token); } catch (_) {}
    if (!token) return null;
    return String(token);
  } catch (_) {
    return null;
  }
}

async function ensureSessionForUser(res, username) {
  const maxAgeSec = 7 * 24 * 60 * 60;
  const token = crypto.randomBytes(24).toString('hex');
  const exp = new Date(Date.now() + maxAgeSec * 1000);
  // role from DB
  const q = await pool.query('SELECT role FROM public.users WHERE username=$1 LIMIT 1', [username]);
  const role = String(q.rows?.[0]?.role || '');
  await pool.query(
    `INSERT INTO public.auth_sessions(session_token, username, role, expires_at)
     VALUES($1,$2,$3,$4)
     ON CONFLICT (session_token) DO NOTHING`,
    [token, username, role, exp]
  );
  setAuthCookies(res, { session_token: token, max_age_sec: maxAgeSec });
  return { token, role };
}

function makeCwfAuthCookieBase64(username, role, maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  const payload = { u: String(username || ''), r: String(role || ''), exp: Date.now() + maxAgeMs };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

async function issueAppLoginForUser(res, username) {
  const maxAgeSec = 7 * 24 * 60 * 60;
  const token = crypto.randomBytes(24).toString('hex');
  const exp = new Date(Date.now() + maxAgeSec * 1000);
  const q = await pool.query('SELECT role FROM public.users WHERE username=$1 LIMIT 1', [username]);
  const role = normalizeRole(q.rows?.[0]?.role || '');
  await pool.query(
    `INSERT INTO public.auth_sessions(session_token, username, role, expires_at)
     VALUES($1,$2,$3,$4)
     ON CONFLICT (session_token) DO NOTHING`,
    [token, username, role, exp]
  );
  const authB64 = makeCwfAuthCookieBase64(username, role);
  setAuthCookies(res, { session_token: token, cwf_auth_base64: authB64, max_age_sec: maxAgeSec });
  return { username: String(username), role };
}

function getLineAppCallbackUrl(req) {
  return String(process.env.LINE_APP_CALLBACK_URL || process.env.LINE_LOGIN_CALLBACK_URL || '').trim() || `${getReqBaseUrl(req)}/auth/line/app/callback`;
}

function safeRedirectTargetForRole(role) {
  const r = normalizeRole(role);
  if (r === 'super_admin') return '/admin-super-v2.html';
  if (r === 'admin') return '/admin-dashboard-v2.html';
  if (r === 'technician') return '/tech.html';
  return '/login.html';
}

function createLineBindToken(profile) {
  const secret = getJwtSecret();
  if (!secret) return '';
  const now = Math.floor(Date.now() / 1000);
  return jwtSign({
    kind: 'line_bind',
    line_user_id: String(profile.userId || ''),
    line_display_name: String(profile.displayName || ''),
    line_picture_url: String(profile.pictureUrl || ''),
    iat: now,
    exp: now + (10 * 60),
  }, secret);
}

function readLineBindToken(req) {
  const secret = getJwtSecret();
  if (!secret) return null;
  const token = parseCookieValue(req, 'cwf_line_bind');
  if (!token) return null;
  const payload = jwtVerify(token, secret);
  if (!payload || payload.kind !== 'line_bind' || !payload.line_user_id) return null;
  return payload;
}

async function bindLineProfileToUser(username, lineProfile, client = pool) {
  const u = String(username || '').trim();
  const lineUserId = String(lineProfile?.line_user_id || lineProfile?.userId || '').trim();
  const displayName = String(lineProfile?.line_display_name || lineProfile?.displayName || '').trim();
  const pictureUrl = String(lineProfile?.line_picture_url || lineProfile?.pictureUrl || '').trim();
  if (!u || !lineUserId) return;
  await client.query(
    `UPDATE public.users
        SET line_user_id=$2, line_display_name=$3, line_picture_url=$4, line_linked_at=NOW()
      WHERE username=$1`,
    [u, lineUserId, displayName || null, pictureUrl || null]
  );
  await client.query(
    `UPDATE public.technician_profiles
        SET line_user_id=$2,
            line_id=COALESCE(line_id, $3),
            updated_at=NOW()
      WHERE username=$1`,
    [u, lineUserId, displayName || null]
  ).catch(() => {});
  await client.query(
    `UPDATE public.partner_applications
        SET line_user_id=$2,
            line_id=COALESCE(line_id, $3),
            updated_at=NOW()
      WHERE technician_username=$1`,
    [u, lineUserId, displayName || null]
  ).catch(() => {});
}

// Normalize legacy/DB role strings to stable internal roles
function normalizeRole(role) {
  const r = String(role || "").trim().toLowerCase();
  if (!r) return "";
  if (["super_admin", "super-admin", "super admin", "superadmin"].includes(r)) return "super_admin";
  if (["admin", "administrator"].includes(r)) return "admin";
  if (["technician", "tech", "ช่าง"].includes(r)) return "technician";
  return r;
}

// =======================================
// 🛡️ Super Admin (Whitelist)
// - นิยาม Super Admin จาก ENV: SUPER_ADMIN_USERNAMES=USER1,USER2
// - ถ้า ENV ว่าง/ไม่ได้ตั้ง: fallback เป็น ['Super','S-arm'] เพื่อไม่ให้ระบบตัน
// =======================================
function getSuperAdminWhitelistSet() {
  const raw = String(process.env.SUPER_ADMIN_USERNAMES || '').trim();
  const list = raw
    ? raw.split(',').map(s => String(s || '').trim()).filter(Boolean)
    : ['Super', 'S-arm'];
  return new Set(list.map(x => x.toLowerCase()));
}

function isSuperAdmin(username) {
  const u = String(username || '').trim().toLowerCase();
  if (!u) return false;
  return getSuperAdminWhitelistSet().has(u);
}

async function getAuthContext(req, res) {
  // Returns: { ok, actor:{username,role}, effective:{username,role}, impersonating:boolean, session_token }
  // Priority: cwf_session (server-side) -> cwf_auth (legacy)
  const sessionToken = parseCwfSessionToken(req);
  if (sessionToken) {
    const s = await pool.query(
      `SELECT session_token, username, role, expires_at, impersonated_username, impersonated_role
       FROM public.auth_sessions
       WHERE session_token=$1 LIMIT 1`,
      [sessionToken]
    );
    if ((s.rows || []).length === 0) return { ok: false };
    const row = s.rows[0];
    if (row.expires_at && Date.now() > new Date(row.expires_at).getTime()) return { ok: false };

    // refresh last_seen (best-effort)
    pool.query('UPDATE public.auth_sessions SET last_seen_at=NOW() WHERE session_token=$1', [sessionToken]).catch(()=>{});

    // actor role must be trusted from DB (not from session row)
    const uq = await pool.query('SELECT username, role FROM public.users WHERE username=$1 LIMIT 1', [row.username]);
    if ((uq.rows || []).length === 0) return { ok: false };
    const actor = { username: String(uq.rows[0].username), role: normalizeRole(uq.rows[0].role) };

    let effective = actor;
    let impersonating = false;
    if (row.impersonated_username) {
      const iq = await pool.query('SELECT username, role FROM public.users WHERE username=$1 LIMIT 1', [row.impersonated_username]);
      if ((iq.rows || []).length) {
        effective = { username: String(iq.rows[0].username), role: normalizeRole(iq.rows[0].role) };
        impersonating = true;
      }
    }

    return { ok: true, actor, effective, impersonating, session_token: sessionToken };
  }

  // legacy cookie
  const auth = parseCwfAuth(req);
  if (!auth) return { ok: false };
  const uq = await pool.query('SELECT username, role FROM public.users WHERE username=$1 LIMIT 1', [auth.username]);
  if ((uq.rows || []).length === 0) return { ok: false };
  const actor = { username: String(uq.rows[0].username), role: normalizeRole(uq.rows[0].role) };
  return { ok: true, actor, effective: actor, impersonating: false, session_token: null };
}

function getInternalApiKeyCandidates() {
  return [
    process.env.INTERNAL_API_KEY,
    process.env.INTERNAL_API_KEYS,
    process.env.CWF_INTERNAL_API_KEY,
    process.env.CWF_INTERNAL_API_KEYS,
  ]
    .flatMap(v => String(v || '').split(','))
    .map(v => v.trim())
    .filter(Boolean);
}

function getInternalApiKeyFromRequest(req) {
  const direct = String(req.headers['x-internal-api-key'] || req.headers['x-api-key'] || '').trim();
  if (direct) return direct;
  const auth = String(req.headers.authorization || '').trim();
  const m = auth.match(/^Internal\s+(.+)$/i);
  return m ? String(m[1] || '').trim() : '';
}

async function requireAdminSession(req, res, next) {
  try {
    const ctx = await getAuthContext(req, res);
    if (!ctx.ok) {
      const accept = String(req.headers?.accept || '').toLowerCase();
      if (accept.includes('text/html')) return res.redirect(302, '/login.html');
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    // Admin pages/APIs are allowed if ACTOR is admin/super_admin
    if (ctx.actor.role !== 'admin' && ctx.actor.role !== 'super_admin') {
      const accept = String(req.headers?.accept || '').toLowerCase();
      if (accept.includes('text/html')) return res.redirect(302, '/login.html');
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    req.actor = ctx.actor;
    req.effective = ctx.effective;
    req.auth = ctx.effective;
    req.impersonating = !!ctx.impersonating;
    req.session_token = ctx.session_token;
    return next();
  } catch (e) {
    console.error('requireAdminSession error:', e);
    return res.status(500).json({ error: 'AUTH_FAILED' });
  }
}

function _accountingActor(req) {
  const actor = req?.actor || req?.auth || req?.effective || {};
  return {
    username: String(actor.username || '').trim(),
    role: normalizeRole(actor.role || ''),
  };
}

function requireAccountingPermission(permissionKey) {
  const key = String(permissionKey || '').trim();
  return async (req, res, next) => {
    try {
      const ctx = await getAuthContext(req, res);
      if (!ctx.ok) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      const actorRole = normalizeRole(ctx.actor?.role);
      if (actorRole !== 'admin' && actorRole !== 'super_admin') {
        return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
      }
      req.actor = ctx.actor;
      req.effective = ctx.effective;
      req.auth = ctx.effective;
      req.impersonating = !!ctx.impersonating;
      req.session_token = ctx.session_token;
      if (actorRole === 'super_admin') return next();

      // Phase 1/1.1 accounting: allow Admin read by default while granular
      // accounting_permissions rows are introduced. For the two MVP write
      // actions below, Admin is allowed only while that permission key has not
      // been seeded for anyone yet; once seeded, the explicit row is required.
      if (key.startsWith('accounting.read')) return next();

      const r = await pool.query(
        `SELECT 1 FROM public.accounting_permissions
         WHERE username=$1 AND permission_key=$2 AND revoked_at IS NULL
         LIMIT 1`,
        [ctx.actor.username, key]
      );
      if (r.rows.length) return next();

      if (['accounting_manage_revenue', 'accounting_mark_payout_paid'].includes(key)) {
        const seeded = await pool.query(
          `SELECT 1 FROM public.accounting_permissions
           WHERE permission_key=$1 AND revoked_at IS NULL
           LIMIT 1`,
          [key]
        );
        if (!seeded.rows.length) return next();
      }

      return res.status(403).json({ ok: false, error: 'ACCOUNTING_PERMISSION_REQUIRED' });
    } catch (e) {
      console.error('requireAccountingPermission error:', e);
      return res.status(500).json({ ok: false, error: 'ACCOUNTING_AUTH_FAILED' });
    }
  };
}

async function logAccountingAudit(req, { action, entity_type, entity_id = null, before_json = null, after_json = null, note = null } = {}) {
  try {
    const actor = _accountingActor(req);
    await pool.query(
      `INSERT INTO public.accounting_audit_log
        (actor_user_id, actor_username, actor_role, action, entity_type, entity_id,
         before_json, after_json, ip_address, user_agent, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11)`,
      [
        actor.username || null,
        actor.username || null,
        actor.role || null,
        String(action || '').trim(),
        String(entity_type || '').trim(),
        entity_id == null ? null : String(entity_id),
        before_json == null ? null : JSON.stringify(before_json),
        after_json == null ? null : JSON.stringify(after_json),
        req?.ip || req?.headers?.['x-forwarded-for'] || null,
        req?.headers?.['user-agent'] || null,
        note == null ? null : String(note),
      ]
    );
  } catch (e) {
    console.warn('[accounting_audit] log failed:', e.message);
  }
}

async function requireInternalApiKeyOnly(req, res, next) {
  try {
    const suppliedKey = getInternalApiKeyFromRequest(req);
    const validKeys = getInternalApiKeyCandidates();
    if (!suppliedKey || validKeys.length === 0 || !validKeys.includes(suppliedKey)) {
      return res.status(401).json({ error: 'INVALID_INTERNAL_API_KEY' });
    }
    const actor = { username: 'internal_automation', role: 'admin' };
    req.actor = actor;
    req.effective = actor;
    req.auth = actor;
    req.impersonating = false;
    req.session_token = null;
    req.internal_api_key = true;
    return next();
  } catch (e) {
    console.error('requireInternalApiKeyOnly error:', e);
    return res.status(500).json({ error: 'AUTH_FAILED' });
  }
}

async function requireSuperAdmin(req, res, next) {
  try {
    const ctx = await getAuthContext(req, res);
    if (!ctx.ok) return res.status(401).json({ error: 'UNAUTHORIZED' });
    // IMPORTANT: เช็คจาก actor (ไม่ใช่ effective) เพื่อกันยกระดับสิทธิ์ผ่าน impersonation
    if (!isSuperAdmin(ctx.actor.username)) return res.status(403).json({ error: 'FORBIDDEN' });
    req.actor = ctx.actor;
    req.effective = ctx.effective;
    req.auth = ctx.effective;
    req.impersonating = !!ctx.impersonating;
    req.session_token = ctx.session_token;
    return next();
  } catch (e) {
    console.error('requireSuperAdmin error:', e);
    return res.status(500).json({ error: 'AUTH_FAILED' });
  }
}

// =======================================
// 🧑‍🔧 Technician Session Guard (for technician-only APIs)
// - allow admin actor when impersonating technician (effective role)
// =======================================
function isTechnicianRole(role) {
  const r = String(role || '').trim().toLowerCase();
  return ['technician', 'tech', 'ช่าง', 'senior_technician', 'lead_technician'].includes(r);
}

async function requireTechnicianSession(req, res, next) {
  try {
    const ctx = await getAuthContext(req, res);
    if (!ctx.ok) {
      const accept = String(req.headers?.accept || '').toLowerCase();
      if (accept.includes('text/html')) return res.redirect(302, '/login.html');
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    // Allow if effective is technician-like (supports admin impersonation)
    if (!isTechnicianRole(ctx.effective.role)) {
      const accept = String(req.headers?.accept || '').toLowerCase();
      if (accept.includes('text/html')) return res.redirect(302, '/login.html');
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    req.actor = ctx.actor;
    req.effective = ctx.effective;
    req.auth = ctx.effective;
    req.impersonating = !!ctx.impersonating;
    req.session_token = ctx.session_token;
    return next();
  } catch (e) {
    console.error('requireTechnicianSession error:', e);
    return res.status(500).json({ error: 'AUTH_FAILED' });
  }
}


// =======================================
// 🔐 Technician job ownership guard
// - Use server-side session identity only; never trust technician_username from body/query.
// - Supports single-tech jobs, legacy technician_team, job_team_members, and job_assignments.
// =======================================
function _authUsername(req) {
  return String(req?.auth?.username || req?.effective?.username || '').trim();
}

function _isAdminActor(req) {
  const r = String(req?.actor?.role || req?.auth?.role || '').trim().toLowerCase();
  return r === 'admin' || r === 'super_admin';
}

async function assertTechBelongsToJob(clientOrPool, job_id, username) {
  const jid = Number(job_id);
  const u = String(username || '').trim();
  if (!jid || !u) return false;

  const q = await clientOrPool.query(
    `
    SELECT 1
    FROM public.jobs j
    LEFT JOIN public.job_team_members tm
      ON tm.job_id = j.job_id
     AND tm.username = $2
    LEFT JOIN public.job_assignments ja
      ON ja.job_id = j.job_id
     AND ja.technician_username = $2
    WHERE j.job_id = $1
      AND (
        j.technician_username = $2
        OR j.technician_team = $2
        OR $2 = ANY(regexp_split_to_array(COALESCE(j.technician_team,''), '\\s*,\\s*'))
        OR tm.username IS NOT NULL
        OR ja.technician_username IS NOT NULL
      )
    LIMIT 1
    `,
    [jid, u]
  );
  return !!q.rows.length;
}

async function requireTechOwnsResolvedJob(req, res, realId, clientOrPool = pool) {
  const tech = _authUsername(req);
  if (!tech) {
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return null;
  }
  const ok = await assertTechBelongsToJob(clientOrPool, realId, tech);
  if (!ok) {
    res.status(403).json({ error: 'ช่างคนนี้ไม่ได้อยู่ในทีมของงานนี้' });
    return null;
  }
  return tech;
}

async function auditLog(req, { action, target_username = null, target_role = null, meta = null }) {
  try {
    const actor = req.actor || null;
    await pool.query(
      `INSERT INTO public.admin_audit_log(actor_username, actor_role, action, target_role, target_username, meta_json)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [actor?.username || null, actor?.role || null, action, target_role, target_username, meta]
    );
  } catch (e) {
    console.warn('auditLog failed:', e.message);
  }
}

const PARTNER_APPLICATION_STATUSES = new Set([
  'draft',
  'submitted',
  'under_review',
  'need_more_documents',
  'rejected',
  'approved_for_training',
]);

const PARTNER_DOCUMENT_TYPES = new Set([
  'id_card',
  'profile_photo',
  'bank_book',
  'tools_photo',
  'vehicle_photo',
  'certificate_or_portfolio',
  'other',
]);

const PARTNER_DOCUMENT_STATUSES = new Set([
  'uploaded',
  'approved',
  'rejected',
  'need_reupload',
]);

const PARTNER_CERTIFICATION_CODES = [
  'cwf_basic_partner',
  'clean_wall_normal',
  'clean_wall_premium',
  'clean_wall_hanging_coil',
  'clean_wall_overhaul',
  'clean_ceiling_suspended',
  'clean_cassette_4way',
  'clean_duct_type',
  'repair_diagnosis_basic',
  'repair_water_leak',
  'repair_electrical_basic',
  'repair_refrigerant_basic',
  'repair_parts_replacement',
  'install_wall_standard',
  'install_condo',
  'install_relocation',
];

const PARTNER_CERTIFICATION_STATUSES = new Set([
  'not_started',
  'in_training',
  'exam_ready',
  'exam_failed',
  'exam_passed',
  'trial_unlocked',
  'approved',
  'suspended',
  'revoked',
]);

const PARTNER_TRIAL_RESULTS = new Set(['passed', 'failed', 'needs_more_trial']);

const PARTNER_WORK_INTENTS = new Set([
  'full_time_with_cwf',
  'part_time_extra_income',
  'has_regular_job_accept_extra',
  'team_partner',
  'company_subcontractor',
]);

const PARTNER_TRAVEL_METHODS = new Set([
  'motorcycle',
  'car',
  'pickup',
  'van',
  'public_transport',
]);

const PARTNER_JOB_INTEREST_LABELS = {
  clean_wall_normal: 'ล้างแอร์ผนังปกติ',
  clean_wall_premium: 'ล้างแอร์ผนังพรีเมียม',
  clean_wall_hanging_coil: 'ล้างแขวนคอยล์',
  clean_wall_overhaul: 'ตัดล้างใหญ่',
  clean_ceiling_suspended: 'ล้างแอร์แขวน/เปลือยใต้ฝ้า',
  clean_cassette_4way: 'ล้างแอร์สี่ทิศทาง',
  clean_duct_type: 'ล้างแอร์ท่อลม',
  repair_diagnosis_basic: 'ตรวจเช็กอาการ',
  repair_water_leak: 'แก้น้ำรั่ว',
  repair_electrical_basic: 'งานไฟฟ้าเบื้องต้น',
  repair_refrigerant_basic: 'เติมน้ำยา/ระบบน้ำยา',
  repair_parts_replacement: 'เปลี่ยนอะไหล่',
  install_wall_standard: 'ติดตั้งแอร์ผนัง',
  install_condo: 'ติดตั้งคอนโด',
  install_relocation: 'ย้ายแอร์',
};

const PARTNER_EQUIPMENT_CHOICES = [
  'มีครบพร้อมทำงาน',
  'ปั๊มน้ำแรงดัน',
  'เครื่องฉีดน้ำแรงดัน',
  'ผ้าใบรองน้ำ',
  'ถังรองน้ำ',
  'กระบอกฉีดน้ำยา',
  'น้ำยาล้างคอยล์',
  'แปรงล้างแอร์',
  'ถุงล้างแอร์',
  'เครื่องเป่าลม',
  'เครื่องดูดฝุ่น/ดูดน้ำ',
  'บันได',
  'สว่าน',
  'ไขควง/ชุดเครื่องมือช่าง',
  'ประแจ/คีม/คัตเตอร์',
  'มัลติมิเตอร์',
  'แคลมป์มิเตอร์',
  'เกจ์วัดน้ำยาแอร์',
  'เครื่องชั่งน้ำยา',
  'แวคคั่มปั๊ม',
  'ถังน้ำยา',
  'เครื่องเชื่อม/ชุดเชื่อมท่อทองแดง',
  'คัตเตอร์ตัดท่อ',
  'บานแฟร์',
  'ทอร์คประแจ',
  'ปั๊มน้ำทิ้ง',
  'อุปกรณ์ติดตั้งรางครอบท่อ',
  'ชุด PPE / ถุงมือ / แว่นตา',
  'ยูนิฟอร์มสุภาพพร้อมเข้าหน้างาน',
];

const BASIC_PARTNER_LESSONS = [
  'มาตรฐานแบรนด์ CWF',
  'การแต่งกายและมารยาทหน้างาน',
  'การสื่อสารกับลูกค้า',
  'การเช็กอิน',
  'การถ่ายรูปก่อนและหลังงาน',
  'ห้ามเปลี่ยนราคาเอง',
  'ห้ามรับเงินนอกระบบ',
  'วิธีปิดงาน',
  'ความรับผิดชอบงานรับประกัน',
  'กติกางานทดลอง',
];

const BASIC_PARTNER_LESSON_BODIES = [
  'รักษาความตรงเวลา ความสุภาพ ความสะอาด และคุณภาพงานทุกครั้ง งานของพาร์ทเนอร์สะท้อนแบรนด์ CWF โดยตรง หากเจอปัญหาต้องแจ้งแอดมินก่อนตัดสินใจแทนบริษัท',
  'แต่งกายสุภาพ ใส่รองเท้าที่เหมาะกับงาน เตรียมผ้าปู/อุปกรณ์ป้องกันพื้นที่ลูกค้า และหลีกเลี่ยงคำพูดหรือพฤติกรรมที่ทำให้ลูกค้าไม่สบายใจ',
  'อธิบายขั้นตอนก่อนเริ่มงาน แจ้งความเสี่ยงอย่างตรงไปตรงมา ใช้ภาษาสุภาพ และส่งต่อประเด็นราคา/ข้อพิพาทให้แอดมินดูแล',
  'เมื่อถึงหน้างานให้เช็กอินในระบบหรือแจ้งแอดมินตามช่องทางที่กำหนด เพื่อให้ลูกค้าและทีมทราบสถานะจริง',
  'ถ่ายรูปก่อนเริ่มงาน ระหว่างงานสำคัญ และหลังเสร็จงานให้ชัดเจน เห็นตัวเครื่อง พื้นที่ทำงาน และหลักฐานความเรียบร้อย',
  'ห้ามเปลี่ยนราคาเองหรือเสนอรายการเพิ่มเองโดยไม่ผ่านระบบ CWF รายการเพิ่มต้องได้รับการยืนยันจากแอดมินก่อน',
  'ห้ามรับเงินสด/โอนส่วนตัวนอกระบบ CWF เว้นแต่แอดมินแจ้งเป็นลายลักษณ์อักษรในเคสนั้น ๆ',
  'ก่อนปิดงานให้ตรวจความเรียบร้อย อธิบายงานที่ทำ ถ่ายรูปหลังงาน เก็บพื้นที่ และอัปเดตสถานะ/หมายเหตุในระบบให้ครบ',
  'งานที่มีปัญหาหลังบริการต้องแจ้ง CWF และร่วมแก้ไขตามนโยบายรับประกัน ห้ามปฏิเสธลูกค้าเองหรือปิดการสื่อสาร',
  'งานทดลองใช้วัดมาตรฐานจริง ทั้งเวลา เครื่องแบบ การสื่อสาร รูปถ่าย คุณภาพงาน และความรับผิดชอบ ผ่านงานทดลองแล้วแอดมินยังต้องอนุมัติ certification รายประเภทก่อนรับงานจริง',
];


const CWF_PARTNER_CONTRACT_REAL_HTML = `
<section class="cwf-contract-template" data-contract="partner-v3-real-pdf-full">
  <div class="contract-hero">
    <h2>หนังสือสัญญาพาร์ทเนอร์ช่างแอร์ Coldwindflow Air Services</h2>
    <p><strong>สำหรับงานล้าง / ซ่อม / ติดตั้งแอร์แบบพาร์ทเนอร์ - ฉบับใช้งานจริง</strong></p>
    <p class="contract-alert">เอกสารนี้นำเข้าจากไฟล์ PDF ฉบับใช้งานจริงของ CWF และใช้เป็นข้อความสัญญาที่ผู้สมัครอ่านก่อนลงนามอิเล็กทรอนิกส์</p>
  </div>

  <h3>ตารางเรทค่าตอบแทนพาร์ทเนอร์แบบขั้นบันได</h3>
  <table class="contract-rate-table"><thead><tr><th>ประเภทงาน</th><th>ขนาด BTU</th><th>เครื่องที่ 1</th><th>เครื่องที่ 2-3</th><th>เครื่องที่ 4+</th></tr></thead><tbody>
    <tr><td>ล้างปกติ</td><td>ไม่เกิน 12,000</td><td>400</td><td>350</td><td>320</td></tr>
    <tr><td>ล้างปกติ</td><td>18,000 ขึ้นไป</td><td>450</td><td>400</td><td>350</td></tr>
    <tr><td>ล้างพรีเมียม</td><td>ไม่เกิน 12,000</td><td>550</td><td>500</td><td>450</td></tr>
    <tr><td>ล้างพรีเมียม</td><td>18,000 ขึ้นไป</td><td>700</td><td>650</td><td>600</td></tr>
    <tr><td>แขวนคอยล์</td><td>ไม่เกิน 12,000</td><td>850</td><td>800</td><td>750</td></tr>
    <tr><td>แขวนคอยล์</td><td>18,000 ขึ้นไป</td><td>1,050</td><td>1,000</td><td>950</td></tr>
    <tr><td>ตัดล้างใหญ่</td><td>ไม่เกิน 12,000</td><td>1,200</td><td>1,100</td><td>1,000</td></tr>
    <tr><td>ตัดล้างใหญ่</td><td>18,000 ขึ้นไป</td><td>1,450</td><td>1,350</td><td>1,250</td></tr>
  </tbody></table>

  <div class="contract-full-text">
<p class="contract-lead"><strong>หนังสือสัญญาพาร์ทเนอร์ช่างแอร์</strong></p>
<p class="contract-lead"><strong>Coldwindflow Air Services</strong></p>
<p class="contract-lead"><strong>สำหรับงานล้าง / ซ่อม / ติดตั้งแอร์แบบพาร์ทเนอร์ - ฉบับใช้งานจริง</strong></p>
<p>เลขที่สัญญา: CWF-PARTNER-..............</p>
<p>วันที่ทำสัญญา: ........ / ........ / ........</p>
<p>วันที่เริ่มมีผล: ........ / ........ / ........</p>
<p>สถานที่ทำสัญญา: ................................................</p>
<p>เอกสารฉบับนี้เป็นหนังสือสัญญาสำหรับการร่วมงานระหว่าง Coldwindflow Air Services และพาร์ทเนอร์ช่างแอร์</p>
<p>โดยมีผลเมื่อคู่สัญญาทั้งสองฝ่ายลงนามเรียบร้อยแล้ว ครอบคลุมขอบเขตงาน มาตรฐานงาน เรทค่าตอบแทนแบบขั้นบันไดเริ่มต้นที่ 400 บาท</p>
<p>เงื่อนไขภาษีหัก ณ ที่จ่าย เงินประกันความเสียหาย 5,000 บาท กติกาการยกเลิกงาน / ทิ้งงาน</p>
<p>และข้อกำหนดในการใช้ทรัพย์สินและข้อมูลของบริษัท</p>
<h3>1. คู่สัญญา</h3>
<p>ฝ่ายผู้ว่าจ้าง / บริษัท</p>
<p class="contract-lead"><strong>Coldwindflow Air Services</strong></p>
<p>เจ้าของ/ผู้มีอำนาจ: นาย สุทธิพงษ์ ศรีวารินทร์</p>
<p>ที่อยู่: 23/61 ถ.พึ่งมี 50 แขวงบางจาก เขตพระโขนง กรุงเทพฯ</p>
<p>10260</p>
<p>โทร: 098-877-7321</p>
<p>ฝ่ายพาร์ทเนอร์ช่าง</p>
<p>ชื่อ-นามสกุล: ....................................................</p>
<p>เลขบัตรประชาชน: ...........................................</p>
<p>ที่อยู่: ................................................................</p>
<p>โทร: ........................ LINE: ........................</p>
<p>ผู้ติดต่อฉุกเฉิน: ........................ โทร: ........................</p>
<h3>2. ลักษณะการร่วมงาน</h3>
<ul>
<li>พาร์ทเนอร์ช่างมีสถานะเป็นผู้รับงานบริการอิสระ ไม่ใช่พนักงานประจำของบริษัท เว้นแต่มีสัญญาอื่นระบุเป็นลายลักษณ์อักษร</li>
<li>บริษัทเป็นผู้จัดหาลูกค้า ประสานงาน แจ้งรายละเอียดงาน กำหนดมาตรฐานงาน และตรวจสอบคุณภาพงานก่อนจ่ายค่าตอบแทน</li>
<li>พาร์ทเนอร์ช่างมีหน้าที่รับงานตามที่ตกลง ปฏิบัติงานให้เสร็จตามมาตรฐาน และรับผิดชอบต่อความเสียหายที่เกิดจากความประมาท การละเลยหน้าที่</li>
</ul>
<p>หรือการผิดเงื่อนไขของตน</p>
<ul>
<li>พาร์ทเนอร์ต้องรับผิดชอบเครื่องมือ ค่าเดินทาง ค่าใช้จ่ายส่วนตัว ภาษี และค่าใช้จ่ายอื่นของตนเอง เว้นแต่บริษัทตกลงรับผิดชอบเป็นรายงาน</li>
</ul>
<h3>3. ขอบเขตงานที่รับ</h3>
<ul>
<li>งานล้างแอร์ปกติ ล้างพรีเมียม ล้างแบบแขวนคอยล์ ตัดล้างใหญ่ งานซ่อม งานติดตั้ง หรือบริการอื่นที่บริษัทมอบหมายเป็นรายงาน</li>
<li>พาร์ทเนอร์ต้องตรวจสอบรายละเอียดงาน เวลา สถานที่ จำนวนเครื่อง ประเภทงาน เงื่อนไขหน้างาน และค่าตอบแทนก่อนกดยืนยันรับงาน</li>
<li>เมื่อยืนยันรับงานแล้ว ต้องเข้าหน้างานตามนัดหมาย หากมีเหตุจำเป็นต้องรีบแจ้งบริษัททันที เพื่อให้บริษัทจัดการลูกค้าและทีมทดแทนได้ทันเวลา</li>
<li>หากพบว่ารายละเอียดงานจริงไม่ตรงกับข้อมูลที่ได้รับ ต้องแจ้งบริษัทก่อนเริ่มงานหรือก่อนเสนอค่าใช้จ่ายเพิ่มกับลูกค้า</li>
</ul>
<h3>4. เรทค่าตอบแทนพาร์ทเนอร์แบบขั้นบันได</h3>
<p>หลักการสำคัญ: เรทนี้เป็น เรทพาร์ทเนอร์เท่านั้น ไม่ใช่เรทช่างบริษัท เริ่มต้นที่ 400 บาท สำหรับงานล้างปกติ ไม่เกิน 12,000 BTU เครื่องที่ 1</p>
<p>และปรับเป็นขั้นบันไดตามจำนวนเครื่องในหน้างานเดียวกัน เพื่อให้บริษัทแบกรับต้นทุนได้ และช่างไม่รู้สึกถูกเอาเปรียบ</p>
<p class="contract-table-line"><strong>ประเภทงาน</strong></p>
<p class="contract-table-line"><strong>ขนาด BTU</strong></p>
<p class="contract-table-line"><strong>เครื่องที่ 1</strong></p>
<p class="contract-table-line"><strong>เครื่องที่ 2-3</strong></p>
<p class="contract-table-line"><strong>เครื่องที่ 4+</strong></p>
<p>ล้างปกติ</p>
<p>ไม่เกิน 12,000</p>
<p>400</p>
<p>350</p>
<p>320</p>
<p>ล้างปกติ</p>
<p>18,000 ขึ้นไป</p>
<p>450</p>
<p>400</p>
<p>350</p>
<p>ล้างพรีเมียม</p>
<p>ไม่เกิน 12,000</p>
<p>550</p>
<p>500</p>
<p>450</p>
<p>ล้างพรีเมียม</p>
<p>18,000 ขึ้นไป</p>
<p>700</p>
<p>650</p>
<p>600</p>
<p>แขวนคอยล์</p>
<p>ไม่เกิน 12,000</p>
<p>850</p>
<p>800</p>
<p>750</p>
<p>แขวนคอยล์</p>
<p>18,000 ขึ้นไป</p>
<p>1,050</p>
<p>1,000</p>
<p>950</p>
<p>ตัดล้างใหญ่</p>
<p>ไม่เกิน 12,000</p>
<p>1,200</p>
<p>1,100</p>
<p>1,000</p>
<p>ตัดล้างใหญ่</p>
<p>18,000 ขึ้นไป</p>
<p>1,450</p>
<p>1,350</p>
<p>1,250</p>
<p>หมายเหตุ: ตัวเลขทั้งหมดเป็นเงินบาทต่อเครื่อง ใช้กับงานบ้านเดียว / คอนโดเดียว / ร้านเดียว / หน้างานเดียวกัน และทำในวันเดียวกันเท่านั้น</p>
<h3>5. ตัวอย่างการคำนวณ</h3>
<p class="contract-table-line"><strong>ลำดับ</strong></p>
<p class="contract-table-line"><strong>ตัวอย่างงาน</strong></p>
<p class="contract-table-line"><strong>วิธีคิด</strong></p>
<p class="contract-table-line"><strong>รวมจ่าย</strong></p>
<p>1</p>
<p>ล้างปกติ ไม่เกิน 12,000 จำนวน 5 เครื่อง</p>
<p>400 + 350 + 350 + 320 + 320</p>
<p>1,740</p>
<p>2</p>
<p>ล้างปกติ 18,000 ขึ้นไป จำนวน 4 เครื่อง</p>
<p>450 + 400 + 400 + 350</p>
<p>1,600</p>
<p>3</p>
<p>ล้างพรีเมียม ไม่เกิน 12,000 จำนวน 4 เครื่อง</p>
<p>550 + 500 + 500 + 450</p>
<p>2,000</p>
<p>4</p>
<p>แขวนคอยล์ ไม่เกิน 12,000 จำนวน 3 เครื่อง</p>
<p>850 + 800 + 800</p>
<p>2,450</p>
<p>5</p>
<p>ตัดล้างใหญ่ 18,000 ขึ้นไป จำนวน 2 เครื่อง</p>
<p>1,450 + 1,350</p>
<p>2,800</p>
<h3>6. เงื่อนไขการใช้เรทขั้นบันได</h3>
<ul>
<li>เครื่องที่ 1 จ่ายเต็ม เพราะมีต้นทุนเปิดงาน เดินทาง ยกของ ตั้งเครื่องมือ ตรวจหน้างาน และสื่อสารกับลูกค้า</li>
<li>เครื่องที่ 2-3 เป็นเรทงานต่อเนื่อง เพราะอยู่ในสถานที่เดียวกันและประหยัดเวลาบางส่วน</li>
<li>เครื่องที่ 4 ขึ้นไปเป็นเรทเหมาหลายเครื่อง เพื่อให้บริษัทและพาร์ทเนอร์สามารถทำงานร่วมกันได้ระยะยาว</li>
<li>หากเป็นคนละบ้าน คนละอาคาร คนละโลเคชัน หรือคนละนัดหมาย ให้คิดเป็นงานแยก ไม่รวมขั้นบันได</li>
<li>หากหน้างานยากพิเศษ บริษัทสามารถพิจารณาเพิ่มค่าแรงพิเศษเป็นรายงาน เช่น จอดรถยาก ปีนสูง ถอดยาก สกปรกมาก หรือใช้เวลามากกว่าปกติ</li>
</ul>
<h3>7. รอบจ่ายเงิน เงื่อนไขการจ่าย และภาษีหัก ณ ที่จ่าย</h3>
<ul>
<li>บริษัทจะจ่ายค่าตอบแทนตามรอบจ่ายที่บริษัทกำหนด เช่น วันที่ 10 และ 25 ของเดือน หรือรอบอื่นที่ตกลงกันเป็นลายลักษณ์อักษร</li>
<li>ค่าตอบแทนจะจ่ายเฉพาะงานที่ปิดสมบูรณ์ในระบบ มีรูปครบ สถานะครบ ข้อมูลครบ และผ่านการตรวจสอบจากบริษัทแล้ว</li>
<li>กรณีมีข้อร้องเรียน งานเสียหาย ข้อมูลไม่ครบ งานรับประกัน หรือมีรายการต้องตรวจสอบ</li>
</ul>
<p>บริษัทมีสิทธิชะลอการจ่ายเฉพาะงานนั้นจนกว่าจะตรวจสอบแล้วเสร็จ</p>
<ul>
<li>ค่าตอบแทนในตารางเรทถือเป็นยอด ก่อนหักภาษี ณ ที่จ่าย เว้นแต่บริษัทแจ้งเป็นอย่างอื่นเป็นลายลักษณ์อักษร</li>
<li>กรณีที่กฎหมายกำหนดให้บริษัทมีหน้าที่หักภาษี ณ ที่จ่าย บริษัทมีสิทธิหักภาษี ณ ที่จ่ายจากค่าตอบแทนของพาร์ทเนอร์ในอัตราที่กฎหมายกำหนด</li>
</ul>
<p>เช่น 3% สำหรับค่าบริการหรือค่าจ้างทำของ และนำส่งกรมสรรพากรในนามผู้รับเงิน</p>
<ul>
<li>บริษัทจะออกหนังสือรับรองการหักภาษี ณ ที่จ่ายให้พาร์ทเนอร์ เพื่อใช้เป็นหลักฐานประกอบการยื่นภาษีประจำปี</li>
<li>หากพาร์ทเนอร์เป็นบุคคลธรรมดา โดยทั่วไปบริษัทจะใช้แบบ ภ.ง.ด.3 ตามเงื่อนไขที่กฎหมายกำหนด และหากพาร์ทเนอร์เป็นนิติบุคคล</li>
</ul>
<p>โดยทั่วไปบริษัทจะใช้แบบ ภ.ง.ด.53</p>
<ul>
<li>หากพาร์ทเนอร์จดทะเบียนภาษีมูลค่าเพิ่ม ต้องแจ้งบริษัทล่วงหน้าและออกใบกำกับภาษี/เอกสารตามกฎหมายให้ถูกต้องก่อนรับเงิน</li>
<li>ตัวอย่าง: ค่าช่างพาร์ทเนอร์ 10,000 บาท หัก ณ ที่จ่าย 3% = 300 บาท บริษัทโอนให้ช่าง 9,700 บาท และนำส่งกรมสรรพากร 300 บาท</li>
</ul>
<p>ต้นทุนรวมของบริษัทตามงานนี้ยังเท่ากับ 10,000 บาท ไม่ใช่ 10,300 บาท</p>
<ul>
<li>กรณีมีเงินประกันรายเดือน: ให้คำนวณภาษีหัก ณ ที่จ่ายจากค่าตอบแทนก่อน แล้วจึงหักเงินประกันตามยอดที่ตกลง เช่น ค่าตอบแทน 10,000 บาท</li>
</ul>
<p>หักภาษี 300 บาท หักเงินประกัน 1,000 บาท บริษัทโอนสุทธิ 8,700 บาท และเงินประกัน 1,000 บาทยังเป็นเงินของพาร์ทเนอร์ตามเงื่อนไขสัญญา</p>
<h3>8. เงินประกันความเสียหาย / เงินมัดจำความเสียหาย</h3>
<ul>
<li>จำนวนเงินประกัน: 5,000 บาท</li>
<li>วิธีแบ่งจ่าย: หักจากค่าตอบแทนรายเดือน เดือนละ 1,000 บาท เป็นเวลา 5 เดือน หรือแบ่งจ่ายตามยอดที่ตกลงในใบแนบท้าย จนครบ 5,000 บาท</li>
<li>วัตถุประสงค์: ใช้เป็นหลักประกันกรณีเกิดความเสียหายจากการทิ้งงาน งานเสียหาย ทรัพย์สินลูกค้าเสียหาย รับเงินนอกระบบ หนี้ค้าง อุปกรณ์ค้าง</li>
</ul>
<p>หรือความเสียหายอื่นที่เกิดจากการกระทำของพาร์ทเนอร์</p>
<ul>
<li>เงินประกันนี้ยังเป็นกรรมสิทธิ์ของพาร์ทเนอร์ แต่บริษัทมีสิทธิยึด หัก หรือชดเชยได้เฉพาะกรณีมีความเสียหายจริงหรือมีหนี้ค้างตามสัญญา</li>
<li>การคืนเงินประกัน: หากสิ้นสุดการร่วมงานและไม่มีความเสียหาย ไม่มีงานค้าง ไม่มีอุปกรณ์ค้าง ไม่มีข้อพิพาท</li>
</ul>
<p>และพ้นช่วงรับประกันงานลูกค้าตามที่บริษัทกำหนดแล้ว บริษัทจะคืนเงินประกันภายในระยะเวลา 60 - 90 วัน</p>
<p>หลังจากตรวจสอบงานค้างและงานรับประกันเสร็จสิ้น</p>
<ul>
<li>เหตุผลของระยะเวลา 60 - 90 วัน: งานบริการของบริษัทมีระยะรับประกันให้ลูกค้า โดยเฉพาะช่วง 30 วันแรกยังอยู่ในช่วงรับประกันงาน</li>
</ul>
<p>หากมีเคลมหรือข้อร้องเรียนจากงานที่พาร์ทเนอร์รับผิดชอบ บริษัทมีสิทธิตรวจสอบและหักชดเชยจากเงินประกันตามความเสียหายจริง</p>
<ul>
<li>กรณีมีงานเคลม ข้อพิพาท หนี้ค้าง อุปกรณ์ค้าง หรือรายการตรวจสอบยังไม่เสร็จ</li>
</ul>
<p>บริษัทมีสิทธิชะลอการคืนเงินประกันจนกว่ารายการดังกล่าวจะตรวจสอบและปิดจบครบถ้วน</p>
<ul>
<li>หากความเสียหายสูงกว่าเงินประกัน 5,000 บาท พาร์ทเนอร์ยังต้องรับผิดชอบส่วนที่เกินตามความเสียหายจริง</li>
<li>กรณีพาร์ทเนอร์หยุดรับงานเองหรือขอยุติการร่วมงาน ต้องแจ้งล่วงหน้าอย่างน้อย 15 วัน และต้องเคลียร์งานค้างทั้งหมดก่อนขอคืนเงินประกัน</li>
</ul>
<h3>9. มาตรฐานงาน หลักฐาน และความปลอดภัยหน้างาน</h3>
<ul>
<li>ถ่ายรูปก่อนงาน ระหว่างงาน หลังงาน ให้ครบตามที่บริษัทกำหนด</li>
<li>อัปเดตสถานะในระบบ เช่น เดินทางถึง เริ่มงาน ปิดงาน และแนบรายละเอียดที่จำเป็น</li>
<li>รักษาความสะอาดหน้างาน ไม่ทิ้งคราบน้ำ ไม่ทิ้งขยะ และเก็บอุปกรณ์ให้เรียบร้อย</li>
<li>สื่อสารกับลูกค้าด้วยความสุภาพ ไม่พูดจาเสียหายต่อบริษัท ลูกค้า หรือทีมงาน</li>
<li>หากพบปัญหาหน้างาน ต้องแจ้งบริษัทก่อนตัดสินใจเพิ่มงาน เปลี่ยนราคา หรือเปลี่ยนเงื่อนไขกับลูกค้า</li>
<li>พาร์ทเนอร์ต้องปฏิบัติงานด้วยความปลอดภัย ใช้อุปกรณ์ให้เหมาะสมกับลักษณะงาน ไม่ทำงานในสภาพที่เสี่ยงอันตรายเกินสมควร</li>
<li>หากพบความเสี่ยง เช่น ไฟฟ้ารั่ว น้ำรั่ว จุดปีนสูง จุดยึดไม่ปลอดภัย ฝ้าเปราะ ท่อเสียหาย หรือพื้นที่เสี่ยงทำให้ทรัพย์สินลูกค้าเสียหาย</li>
</ul>
<p>ต้องแจ้งบริษัทและลูกค้าก่อนดำเนินการ</p>
<ul>
<li>หากพาร์ทเนอร์ฝ่าฝืนข้อควรระวังด้านความปลอดภัยหรือทำงานโดยประมาทจนเกิดความเสียหาย พาร์ทเนอร์ต้องรับผิดชอบตามความเสียหายจริง</li>
</ul>
<h3>10. กติกาการยกเลิกงาน เลื่อนงาน และการไม่แจ้งล่วงหน้า</h3>
<p>หลักสำคัญ: เมื่อพาร์ทเนอร์กดยืนยันรับงานแล้ว ให้ถือว่าเป็นการรับผิดชอบงานนั้นโดยสมบูรณ์ หากต้องยกเลิกหรือเลื่อนงาน</p>
<p>ต้องแจ้งบริษัทล่วงหน้าให้เร็วที่สุด โดยมาตรฐานที่ควรแจ้งคือ อย่างน้อย 72 ชั่วโมงก่อนเวลานัด</p>
<p>เพื่อให้บริษัทจัดทีมทดแทนและดูแลลูกค้าได้ทันเวลา</p>
<p class="contract-table-line"><strong>ช่วงเวลาที่แจ้งก่อนเวลานัด</strong></p>
<p class="contract-table-line"><strong>แนวทางพิจารณา</strong></p>
<p class="contract-table-line"><strong>กรอบหัก / ค่าเสียหาย</strong></p>
<p>มากกว่า 72 ชั่วโมง</p>
<p>แจ้งล่วงหน้าเพียงพอ หากไม่ได้เกิดซ้ำบ่อย</p>
<p>ไม่หัก แต่บริษัทบันทึกประวัติ</p>
<p>48 - 72 ชั่วโมง</p>
<p>ยังพอจัดทีมทดแทนได้ แต่หากลูกค้าได้รับผลกระทบ</p>
<p>บริษัทอาจพิจารณา</p>
<p>0 - 300 บาท/งาน</p>
<p>24 - 48 ชั่วโมง</p>
<p>กระทบการจัดทีมและการนัดหมายลูกค้าอย่างมีนัยสำคัญ</p>
<p>300 - 500 บาท/งาน</p>
<p>6 - 24 ชั่วโมง</p>
<p>ถือว่ายกเลิกกะทันหัน บริษัทต้องเร่งหาทีมแทน</p>
<p>500 - 1,000 บาท/งาน หรือค่าเสียหายจริง</p>
<p>วันงาน / น้อยกว่า 6 ชั่วโมง</p>
<p>กระทบลูกค้าโดยตรง</p>
<p>มีความเสี่ยงเสียชื่อเสียงและเสียค่าจัดทีมฉุกเฉิน</p>
<p>1,000 - 1,500 บาท/งาน หรือค่าเสียหายจริง</p>
<p>ไม่ไปหน้างาน / ติดต่อไม่ได้ /</p>
<p>ทิ้งงาน</p>
<p>ผิดเงื่อนไขร้ายแรง</p>
<p>1,500 - 3,000 บาท/งาน + ค่าเสียหายจริง +</p>
<p>อาจงดจ่ายงานนั้น</p>
<ul>
<li>กรอบหักข้างต้นเป็นค่าเสียหายเบื้องต้น บริษัทมีสิทธิหักตามความเสียหายจริง หากความเสียหายสูงกว่ากรอบดังกล่าว เช่น ค่าชดเชยลูกค้า</li>
</ul>
<p>ค่าเดินทางทีมทดแทน ค่าคอมเพลน หรือค่าใช้จ่ายอื่นที่พิสูจน์ได้</p>
<ul>
<li>หากพาร์ทเนอร์มีเหตุฉุกเฉินจริง เช่น อุบัติเหตุ เจ็บป่วยกะทันหัน หรือเหตุสุดวิสัย ต้องแจ้งบริษัททันทีและส่งหลักฐานตามสมควร</li>
</ul>
<p>บริษัทอาจยกเว้นหรือลดการหักตามความเหมาะสม</p>
<ul>
<li>หากยกเลิกหรือเลื่อนงานบ่อยเกินสมควร เช่น 3 ครั้งภายใน 60 วัน บริษัทมีสิทธิระงับการส่งงานใหม่ ลดลำดับการรับงาน หรือยุติสัญญา</li>
<li>หากเป็นงานด่วน งานล็อกคิว หรือมีลูกค้าคอนเฟิร์มเข้าพื้นที่แล้ว พาร์ทเนอร์ควรแจ้งล่วงหน้าอย่างน้อย 72 ชั่วโมง เว้นแต่เป็นเหตุฉุกเฉินจริง</li>
<li>การยุติการร่วมงานทั้งระบบ ไม่ใช่การยกเลิกงานรายวัน ต้องแจ้งล่วงหน้าอย่างน้อย 15 วัน และต้องเคลียร์งานค้าง งานรับประกัน</li>
</ul>
<p>และอุปกรณ์ให้ครบ</p>
<h3>11. การป้องกันปัญหาทิ้งงาน</h3>
<p>ถือว่าเป็นการทิ้งงานหรือผิดเงื่อนไขร้ายแรง หากเกิดกรณีใดกรณีหนึ่งต่อไปนี้</p>
<ul>
<li>กดยืนยันรับงานแล้วไม่ไปหน้างาน หรือไม่สามารถติดต่อได้ในเวลาที่ควรปฏิบัติงาน</li>
<li>เข้าหน้างานแล้วออกจากหน้างานก่อนงานเสร็จ โดยไม่ได้รับอนุญาตจากบริษัท</li>
<li>ยกเลิกงานกะทันหันโดยไม่มีเหตุจำเป็นสมควร ทำให้ลูกค้าเสียหายหรือบริษัทต้องจัดทีมทดแทนเร่งด่วน</li>
<li>ปฏิเสธการกลับไปแก้งานที่เกิดจากความผิดพลาดของตนเอง</li>
<li>รับเงินลูกค้าเองหรือรับงานต่อเอง แล้วทำให้บริษัทไม่สามารถควบคุมคุณภาพและการรับประกันงานได้</li>
</ul>
<p>ผลของการทิ้งงาน</p>
<ul>
<li>บริษัทมีสิทธิงดจ่ายค่าตอบแทนของงานนั้นทั้งหมดหรือบางส่วน</li>
<li>บริษัทมีสิทธิหักค่าเสียหายจริงจากค่าตอบแทนค้างจ่ายหรือเงินประกันความเสียหาย</li>
<li>บริษัทมีสิทธิระงับการส่งงานใหม่ ยกเลิกสถานะพาร์ทเนอร์ หรือยุติสัญญาทันที</li>
</ul>
<h3>12. ข้อห้ามเรื่องลูกค้า เงินสด งานนอกระบบ และข้อมูลภายใน</h3>
<ul>
<li>ห้ามรับเงินจากลูกค้าเอง เว้นแต่บริษัทอนุญาตเป็นรายงานและต้องส่งหลักฐานให้ครบ</li>
<li>ห้ามเสนอราคาใหม่ ห้ามเพิ่มงาน ห้ามลดราคา หรือเปลี่ยนเงื่อนไขกับลูกค้าเองโดยไม่ผ่านบริษัท</li>
<li>ห้ามรับงานต่อโดยตรงจากลูกค้าที่บริษัทจัดหาให้ ทั้งระหว่างร่วมงานและภายใน 12 เดือนหลังสิ้นสุดการร่วมงาน</li>
</ul>
<p>เว้นแต่ได้รับอนุญาตเป็นลายลักษณ์อักษร</p>
<ul>
<li>ห้ามนำเบอร์ลูกค้า ข้อมูลลูกค้า ราคา เอกสาร รูปภาพ หรือข้อมูลในระบบของบริษัทไปใช้ส่วนตัวหรือส่งต่อให้บุคคลอื่น</li>
<li>หากมีลูกค้าติดต่อพาร์ทเนอร์โดยตรงจากงานของบริษัท ต้องแจ้งบริษัทและให้ลูกค้าจองผ่านช่องทางบริษัทเท่านั้น</li>
<li>พาร์ทเนอร์ต้องรักษาความลับทางการค้า ข้อมูลลูกค้า ข้อมูลราคา รายละเอียดงาน รูปภาพหน้างาน และข้อมูลในระบบของบริษัท</li>
</ul>
<p>ทั้งระหว่างร่วมงานและหลังสิ้นสุดการร่วมงาน</p>
<ul>
<li>พาร์ทเนอร์ต้องใช้ข้อมูลส่วนบุคคลของลูกค้าเท่าที่จำเป็นต่อการปฏิบัติงานที่บริษัทมอบหมายเท่านั้น</li>
</ul>
<p>ห้ามนำไปใช้เพื่อวัตถุประสงค์อื่นโดยไม่ได้รับอนุญาต</p>
<h3>13. ทรัพย์สินบริษัท ยูนิฟอร์ม บัตรช่าง และการใช้ชื่อบริษัท</h3>
<ul>
<li>ทรัพย์สิน อุปกรณ์ เสื้อยูนิฟอร์ม บัตรประจำตัว เอกสาร หรือสิ่งของที่บริษัทมอบให้พาร์ทเนอร์เพื่อใช้ในการทำงาน ยังเป็นกรรมสิทธิ์ของบริษัท</li>
<li>พาร์ทเนอร์ต้องดูแลรักษาทรัพย์สินของบริษัทและคืนให้บริษัทเมื่อสิ้นสุดการร่วมงาน หากสูญหายหรือเสียหายจากความประมาท</li>
</ul>
<p>บริษัทมีสิทธิหักค่าเสียหายตามจริงจากค่าตอบแทนหรือเงินประกัน</p>
<ul>
<li>หลังสิ้นสุดการร่วมงาน พาร์ทเนอร์ไม่มีสิทธิใช้ชื่อ โลโก้ รูปภาพ ยูนิฟอร์ม เอกสาร ช่องทางติดต่อ หรือข้อมูลของ Coldwindflow Air Services</li>
</ul>
<p>เพื่อรับงานส่วนตัว หรือทำให้บุคคลภายนอกเข้าใจว่ายังเป็นตัวแทนของบริษัท เว้นแต่ได้รับอนุญาตเป็นลายลักษณ์อักษร</p>
<h3>14. การรับประกันงานและการกลับไปแก้งาน</h3>
<ul>
<li>หากเกิดปัญหาจากความผิดพลาดในการทำงานของพาร์ทเนอร์ เช่น ประกอบไม่ครบ น้ำรั่วจากการล้าง ทำความสะอาดไม่ครบ</li>
</ul>
<p>หรือเกิดความเสียหายจากความประมาท พาร์ทเนอร์ต้องให้ความร่วมมือในการตรวจสอบและแก้ไข</p>
<ul>
<li>กรณีต้องกลับไปแก้งานจากความผิดของพาร์ทเนอร์ บริษัทอาจให้พาร์ทเนอร์กลับไปแก้โดยไม่มีค่าตอบแทนเพิ่ม</li>
</ul>
<p>หรือหักค่าเดินทาง/ค่าแรงของทีมที่เข้าไปแก้แทนตามจริง</p>
<ul>
<li>หากงานเคลมเกิดจากสภาพเครื่องเดิม อายุเครื่อง หรือปัจจัยนอกเหนือการควบคุม บริษัทจะพิจารณาตามหลักฐานจริงและความเป็นธรรม</li>
<li>พาร์ทเนอร์ต้องไม่ปฏิเสธการตรวจสอบงาน หากบริษัทมีหลักฐานว่าปัญหาเกี่ยวข้องกับงานที่พาร์ทเนอร์ทำ</li>
</ul>
<h3>15. รายการหัก / กรณีปรับลดค่าตอบแทน</h3>
<p class="contract-table-line"><strong>ลำดับ</strong></p>
<p>กรณี</p>
<p>แนวทางหัก / แนวทางพิจารณา</p>
<p>1</p>
<p>ไม่ถ่ายรูปงานให้ครบตามที่กำหนด</p>
<p>หัก 50 - 100 บาท/เครื่อง หรือพิจารณาตามหลักฐานจริง</p>
<p>2</p>
<p>ไม่อัปเดตสถานะงานในระบบให้ครบ</p>
<p>หัก 50 บาท/ครั้ง หรือชะลอจ่ายจนกว่าข้อมูลครบ</p>
<p>3</p>
<p>เข้างานสายโดยไม่แจ้งล่วงหน้า</p>
<p>หัก 100 - 300 บาท/ครั้ง ตามผลกระทบต่อลูกค้า</p>
<p>4</p>
<p>ยกเลิกงานหลังรับงานแล้ว</p>
<p>ใช้ตารางข้อ 10 เป็นหลัก หรือหักค่าเสียหายจริงหากสูงกว่า</p>
<p>5</p>
<p>ทิ้งงาน / ไม่เข้าหน้างาน / ติดต่อไม่ได้</p>
<p>หัก 1,500 - 3,000 บาท/งาน + ค่าเสียหายจริง + อาจงดจ่ายงานนั้น</p>
<p>6</p>
<p>ออกจากหน้างานก่อนเสร็จโดยไม่ได้รับอนุญาต</p>
<p>อาจงดจ่ายงานนั้น และหักค่าทีมทดแทนหรือค่าเสียหายจริง</p>
<p>7</p>
<p>งานต้องกลับไปแก้จากความผิดของช่าง</p>
<p>หักค่าเดินทาง/ค่าแรงแก้งาน หรือให้กลับไปแก้โดยไม่มีค่าตอบแทนเพิ่ม</p>
<p>8</p>
<p>ทำทรัพย์สินลูกค้าเสียหายจากความประมาท</p>
<p>รับผิดชอบตามความเสียหายจริง โดยหักจากค่าตอบแทนหรือเงินประกัน</p>
<p>9</p>
<p>รับเงินลูกค้าเอง /</p>
<p>รับงานต่อนอกระบบจากลูกค้าของบริษัท</p>
<p>งดจ่ายงานนั้น เรียกค่าเสียหาย และอาจยุติการร่วมงานทันที</p>
<p>10</p>
<p>เปิดเผยข้อมูลลูกค้า ราคา หรือข้อมูลภายในบริษัท</p>
<p>หักตามความเสียหายจริง ระงับงาน และอาจยุติสัญญา</p>
<p>หมายเหตุ: รายการหักเป็นกรอบเบื้องต้น บริษัทจะพิจารณาจากหลักฐานจริงในระบบ สภาพหน้างาน ความเสียหาย ผลกระทบต่อลูกค้า และความเหมาะสมเป็นรายกรณี</p>
<h3>16. ระยะเวลาสัญญาและการยุติการร่วมงาน</h3>
<ul>
<li>สัญญานี้เริ่มมีผลตั้งแต่วันที่ลงนาม และมีผลต่อเนื่องจนกว่าฝ่ายใดฝ่ายหนึ่งจะแจ้งยุติเป็นลายลักษณ์อักษร</li>
<li>หากพาร์ทเนอร์ต้องการยุติการร่วมงาน ควรแจ้งล่วงหน้าอย่างน้อย 15 วัน และต้องเคลียร์งานค้าง งานรับประกัน อุปกรณ์</li>
</ul>
<p>หรือยอดเงินค้างทั้งหมดก่อน</p>
<ul>
<li>บริษัทมีสิทธิยุติสัญญาทันที หากพาร์ทเนอร์ทิ้งงาน รับเงินนอกระบบ ทำให้ลูกค้าหรือบริษัทเสียหายร้ายแรง เปิดเผยข้อมูลภายใน แอบอ้างชื่อบริษัท</li>
</ul>
<p>หรือผิดเงื่อนไขสำคัญของสัญญา</p>
<ul>
<li>หลังยุติสัญญา พาร์ทเนอร์ยังต้องรับผิดชอบงานที่ทำไว้ก่อนหน้า ข้อร้องเรียน งานรับประกัน และความเสียหายที่เกิดจากการกระทำของตน</li>
</ul>
<h3>17. การแก้ไขสัญญา เรทค่าตอบแทน และข้อกฎหมาย</h3>
<ul>
<li>บริษัทสามารถปรับปรุงเรทค่าตอบแทน เงื่อนไขการจ่าย รอบจ่าย หรือมาตรฐานงานได้ตามต้นทุน โปรโมชัน สภาพตลาด</li>
</ul>
<p>และความเหมาะสมในการบริหารงาน</p>
<ul>
<li>หากมีการเปลี่ยนแปลงสำคัญ บริษัทจะแจ้งให้พาร์ทเนอร์ทราบก่อนนำไปใช้กับงานใหม่</li>
<li>งานที่รับไว้ก่อนมีการเปลี่ยนแปลง ให้ยึดตามเงื่อนไขที่ตกลงไว้ในงานนั้น เว้นแต่ทั้งสองฝ่ายตกลงใหม่</li>
<li>หากมีการเปลี่ยนแปลงกฎหมายภาษีหรือข้อกำหนดราชการ บริษัทสามารถปรับวิธีจ่ายเงิน เอกสาร หรือการหักภาษีให้สอดคล้องกับกฎหมายได้ทันที</li>
<li>หากข้อความส่วนใดของสัญญานี้ไม่สามารถใช้บังคับได้ตามกฎหมาย ให้ข้อความส่วนนั้นถูกปรับใช้เท่าที่กฎหมายอนุญาต</li>
</ul>
<p>โดยไม่กระทบต่อข้อความส่วนอื่นของสัญญา</p>
<h3>18. เอกสารแนบท้ายและรายการตรวจรับก่อนเริ่มงาน</h3>
<p class="contract-table-line"><strong>รายการเอกสาร/ทรัพย์สิน/ข้อมูล</strong></p>
<p class="contract-table-line"><strong>สถานะตรวจรับ</strong></p>
<p>สำเนาบัตรประชาชนของพาร์ทเนอร์</p>
<p>□ ได้รับแล้ว □ ยังไม่ได้รับ</p>
<p>สำเนาหน้าบัญชีธนาคารสำหรับรับเงิน</p>
<p>□ ได้รับแล้ว □ ยังไม่ได้รับ</p>
<p>เบอร์โทร / LINE / ที่อยู่ปัจจุบัน</p>
<p>□ ได้รับแล้ว □ ยังไม่ได้รับ</p>
<p>รูปถ่ายพาร์ทเนอร์ / รูปโปรไฟล์สำหรับระบบ</p>
<p>□ ได้รับแล้ว □ ยังไม่ได้รับ</p>
<p>ทะเบียนรถ / ป้ายทะเบียน / ข้อมูลพาหนะที่ใช้ทำงาน (ถ้ามี)</p>
<p>□ ได้รับแล้ว □ ยังไม่ได้รับ</p>
<p>ข้อมูลผู้ติดต่อฉุกเฉิน</p>
<p>□ ได้รับแล้ว □ ยังไม่ได้รับ</p>
<p>หลักฐานประสบการณ์ ใบรับรอง หรือข้อมูลความชำนาญ (ถ้ามี)</p>
<p>□ ได้รับแล้ว □ ยังไม่ได้รับ</p>
<p>รายการอุปกรณ์ เสื้อยูนิฟอร์ม บัตรช่าง หรือทรัพย์สินบริษัทที่รับไป (ถ้ามี)</p>
<p>□ ได้รับแล้ว □ ไม่มีรายการ</p>
<p class="contract-table-line"><strong>เอกสารแนบท้าย</strong></p>
<p class="contract-table-line"><strong>สถานะ</strong></p>
<p>เอกสารแนบท้าย ก. ตารางเรทค่าตอบแทนพาร์ทเนอร์แบบขั้นบันได</p>
<p>ถือเป็นส่วนหนึ่งของสัญญานี้</p>
<p>เอกสารแนบท้าย ข. หลักฐานบัตรประชาชน / หน้าบัญชี / ช่องทางติดต่อ</p>
<p>ใช้ยืนยันตัวตนและจ่ายเงิน</p>
<p>เอกสารแนบท้าย ค. ข้อตกลงเงินประกันความเสียหาย 5,000 บาท</p>
<p>หักรายเดือนตามที่ตกลง</p>
<p>เอกสารแนบท้าย ง. หนังสือรับรองภาษีหัก ณ ที่จ่าย / เอกสารภาษีที่เกี่ยวข้อง</p>
<p>ใช้ตามกรณีที่กฎหมายกำหนด</p>
<p>เอกสารแนบท้าย จ. รายการทรัพย์สินบริษัทที่พาร์ทเนอร์รับไป (ถ้ามี)</p>
<p>ต้องคืนเมื่อสิ้นสุดการร่วมงาน</p>
<h3>19. ลงนามรับทราบและตกลง</h3>
<p>คู่สัญญาทั้งสองฝ่ายได้อ่าน เข้าใจ และตกลงยอมรับเงื่อนไขทั้งหมดในสัญญาฉบับนี้แล้ว จึงลงนามไว้เป็นหลักฐาน</p>
<p>โดยสัญญานี้มีผลใช้บังคับตั้งแต่วันที่คู่สัญญาทั้งสองฝ่ายลงนาม เว้นแต่ระบุวันที่เริ่มมีผลไว้เป็นอย่างอื่นในหน้าแรกของสัญญา</p>
<p>ฝ่ายบริษัท / ผู้ว่าจ้าง</p>
<p>ฝ่ายพาร์ทเนอร์ช่าง</p>
<p>............................................................</p>
<p>(นาย สุทธิพงษ์ ศรีวารินทร์)</p>
<p>วันที่ ........ / ........ / ........</p>
<p>............................................................</p>
<p>(....................................................)</p>
<p>วันที่ ........ / ........ / ........</p>
<p>พยานฝ่ายบริษัท</p>
<p>พยานฝ่ายพาร์ทเนอร์</p>
<p>............................................................</p>
<p>(....................................................)</p>
<p>วันที่ ........ / ........ / ........</p>
<p>............................................................</p>
<p>(....................................................)</p>
<p>วันที่ ........ / ........ / ........</p>
  </div>
</section>
`;

const BASIC_PARTNER_EXAM_QUESTIONS = [
  { q: 'เมื่อถึงหน้างานควรทำอะไรเป็นอันดับแรก', choices: ['เช็กอินและทักทายลูกค้า', 'เริ่มงานทันทีโดยไม่แจ้ง', 'ขอเงินก่อนเริ่มงาน'], answer: 0 },
  { q: 'หากต้องเปลี่ยนราคา ควรทำอย่างไร', choices: ['แจ้งแอดมินเพื่ออนุมัติก่อน', 'ตกลงกับลูกค้าเอง', 'เก็บเงินสดเพิ่มทันที'], answer: 0 },
  { q: 'รูปก่อนและหลังงานมีไว้เพื่ออะไร', choices: ['เป็นหลักฐานคุณภาพงาน', 'ใช้แทนการปิดงานได้ทั้งหมด', 'ไม่จำเป็นต้องถ่าย'], answer: 0 },
  { q: 'การรับเงินนอกระบบ CWF ทำได้หรือไม่', choices: ['ไม่ได้', 'ได้ถ้าลูกค้าสะดวก', 'ได้เฉพาะงานด่วน'], answer: 0 },
  { q: 'งานทดลองผ่านแล้วจะรับงานจริงได้ทันทีหรือไม่', choices: ['ต้องรอแอดมินอนุมัติสิทธิ์', 'ได้ทันทีทุกประเภท', 'ได้เฉพาะถ้าไม่มีเอกสาร'], answer: 0 },
];

function normalizeJsonArrayInput(value) {
  if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean);
  const raw = String(value || '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(v => String(v || '').trim()).filter(Boolean);
  } catch (_) {}
  return raw.split(',').map(v => v.trim()).filter(Boolean);
}

function normalizePartnerPhone(phone) {
  return String(phone || '').trim().replace(/\s+/g, '');
}

function partnerPhoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function getPhoneVariants(phone) {
  const normalized = normalizePartnerPhone(phone);
  const digits = partnerPhoneDigits(phone);
  const variants = new Set();
  if (normalized) variants.add(normalized);
  if (digits) variants.add(digits);
  if (digits.length === 10 && digits.startsWith('0')) {
    variants.add(digits);
    variants.add(`66${digits.slice(1)}`);
    variants.add(`+66${digits.slice(1)}`);
  }
  if (digits.length === 11 && digits.startsWith('66')) {
    variants.add(`0${digits.slice(2)}`);
    variants.add(digits);
    variants.add(`+${digits}`);
  }
  return Array.from(variants).filter(Boolean);
}

function makePartnerUsernameFromPhone(phone, fallbackCode = '') {
  const digits = partnerPhoneDigits(phone);
  if (digits.length >= 6) return normalizePartnerPhone(phone);
  return `partner${String(fallbackCode || crypto.randomBytes(4).toString('hex')).replace(/[^a-z0-9]/gi, '').slice(-8).toLowerCase()}`;
}

function getLineMessagingAccessToken() {
  return String(process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN || process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN || '').trim();
}

function getPartnerAdminLineTargets() {
  const raw = String(process.env.PARTNER_ADMIN_LINE_TARGETS || process.env.LINE_ADMIN_GROUP_ID || process.env.LINE_ADMIN_USER_ID || '').trim();
  return raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
}

function partnerAppUrl(path = '') {
  const base = String(process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || 'https://app.cwf-air.com').replace(/\/+$/, '');
  return `${base}${String(path || '').startsWith('/') ? path : `/${path}`}`;
}

function partnerNotifyEnabled() {
  return String(process.env.PARTNER_LINE_NOTIFY_ENABLED || 'true').toLowerCase() !== 'false';
}

async function logPartnerNotification(applicationId, channel, target, eventType, status, payload, errorMessage = null) {
  try {
    await pool.query(
      `INSERT INTO public.partner_notification_logs(application_id, channel, target, event_type, status, payload_json, error_message, created_at)
       VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,NOW())`,
      [applicationId || null, channel || 'line', target || null, eventType || 'unknown', status || 'unknown', JSON.stringify(payload || {}), errorMessage || null]
    );
  } catch (e) {
    console.warn('[partner_notify] log failed:', e?.message || e);
  }
}

async function pushLineText(targetId, text, meta = {}) {
  const token = getLineMessagingAccessToken();
  if (!partnerNotifyEnabled() || !targetId || !token) {
    await logPartnerNotification(meta.application_id, 'line', targetId || null, meta.event_type || 'line_push', 'skipped', { reason: !token ? 'missing_token' : 'disabled', text });
    return { ok: false, skipped: true };
  }
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: targetId, messages: [{ type: 'text', text: String(text || '').slice(0, 4900) }] }),
    });
    const raw = await res.text().catch(() => '');
    if (!res.ok) throw new Error(raw || `LINE push ${res.status}`);
    await logPartnerNotification(meta.application_id, 'line', targetId, meta.event_type || 'line_push', 'sent', { text, line_response: raw || null });
    return { ok: true };
  } catch (e) {
    await logPartnerNotification(meta.application_id, 'line', targetId, meta.event_type || 'line_push', 'failed', { text }, String(e?.message || e));
    console.warn('[partner_notify] LINE push failed:', e?.message || e);
    return { ok: false, error: String(e?.message || e) };
  }
}

async function notifyPartnerAdmins(eventType, text, applicationId = null) {
  const targets = getPartnerAdminLineTargets();
  if (!targets.length) {
    await logPartnerNotification(applicationId, 'line', null, eventType, 'skipped', { reason: 'missing_admin_targets', text });
    return;
  }
  await Promise.all(targets.map(t => pushLineText(t, text, { event_type: eventType, application_id: applicationId })));
}

async function getPartnerLineUserId(applicationId, client = pool) {
  try {
    const r = await client.query(
      `SELECT COALESCE(u.line_user_id, a.line_user_id) AS line_user_id
       FROM public.partner_applications a
       LEFT JOIN public.users u ON u.username=a.technician_username
       WHERE a.id=$1 LIMIT 1`,
      [applicationId]
    );
    return r.rows[0]?.line_user_id || null;
  } catch (_) {
    return null;
  }
}

async function notifyPartnerApplicant(applicationId, eventType, text, client = pool) {
  const lineUserId = await getPartnerLineUserId(applicationId, client);
  if (!lineUserId) {
    await logPartnerNotification(applicationId, 'line', null, eventType, 'skipped', { reason: 'partner_line_not_linked', text });
    return;
  }
  await pushLineText(lineUserId, text, { event_type: eventType, application_id: applicationId });
}

function partnerNotifyTextNewApplication(appRow) {
  return [
    '🔔 มีใบสมัครพาร์ทเนอร์ CWF ใหม่',
    `ชื่อ: ${appRow.full_name || '-'}`,
    `เบอร์: ${appRow.phone || '-'}`,
    `พื้นที่: ${[appRow.province, appRow.district].filter(Boolean).join(' / ') || '-'}`,
    `รหัส: ${appRow.application_code || '-'}`,
    partnerAppUrl('/admin-partner-onboarding.html')
  ].join('\n');
}

function partnerNotifyTextApplicant(title, lines = []) {
  return [`CWF Partner`, title, ...lines].filter(Boolean).join('\n');
}

function normalizePartnerBool(v) {
  return v === true || v === 'true' || v === 1 || v === '1' || String(v || '').toLowerCase() === 'on';
}

function normalizePartnerInt(v, fallback = null) {
  if (v === '' || v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
}

function normalizePartnerNumber(v, fallback = null) {
  if (v === '' || v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

const CWF_PASSWORD_HASH_PREFIX = 'cwf_scrypt$v1$';
const CWF_PASSWORD_SCRYPT_KEYLEN = 64;

function isCwfPasswordHash(stored) {
  return String(stored || '').startsWith(CWF_PASSWORD_HASH_PREFIX);
}

function hashPasswordForStorage(password) {
  const raw = String(password || '');
  if (!raw) return Promise.resolve('');
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(raw, salt, CWF_PASSWORD_SCRYPT_KEYLEN, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${CWF_PASSWORD_HASH_PREFIX}${salt}$${derivedKey.toString('hex')}`);
    });
  });
}

function verifyCwfPasswordHash(inputPassword, storedHash) {
  const raw = String(inputPassword || '');
  const stored = String(storedHash || '');
  const parts = stored.split('$');
  // cwf_scrypt$v1$<saltHex>$<hashHex>
  if (parts.length !== 4 || `${parts[0]}$${parts[1]}$` !== CWF_PASSWORD_HASH_PREFIX) return Promise.resolve(false);
  const salt = parts[2];
  const expectedHex = parts[3];
  return new Promise((resolve) => {
    crypto.scrypt(raw, salt, CWF_PASSWORD_SCRYPT_KEYLEN, (err, derivedKey) => {
      if (err) return resolve(false);
      try {
        const actual = Buffer.from(derivedKey.toString('hex'), 'hex');
        const expected = Buffer.from(expectedHex, 'hex');
        if (!expected.length || actual.length !== expected.length) return resolve(false);
        return resolve(crypto.timingSafeEqual(actual, expected));
      } catch (_) {
        return resolve(false);
      }
    });
  });
}

async function verifyPasswordAgainstStored(inputPassword, storedPassword) {
  const stored = String(storedPassword || '');
  if (isCwfPasswordHash(stored)) return verifyCwfPasswordHash(inputPassword, stored);
  // Legacy compatibility: existing CWF users remain plaintext until password change.
  return String(inputPassword || '') === stored;
}

async function findExistingPartnerTechnicianByPhone(client, phone) {
  const variants = getPhoneVariants(phone);
  if (!variants.length) return null;
  const r = await client.query(
    `SELECT u.username, p.phone
     FROM public.users u
     LEFT JOIN public.technician_profiles p ON p.username=u.username
     WHERE u.role='technician' AND (u.username = ANY($1::text[]) OR p.phone = ANY($1::text[]))
     ORDER BY CASE WHEN p.phone = ANY($1::text[]) THEN 0 ELSE 1 END
     LIMIT 1`,
    [variants]
  );
  return r.rows[0] || null;
}

async function ensurePartnerTechnicianAccount(client, { phone, password, fullName, lineId, applicationCode }) {
  const existing = await findExistingPartnerTechnicianByPhone(client, phone);
  if (existing?.username) {
    await client.query(
      `INSERT INTO public.technician_profiles(username, full_name, phone, employment_type, partner_status, line_id)
       VALUES($1,$2,$3,'partner','applicant',$4)
       ON CONFLICT(username) DO UPDATE SET
         full_name=COALESCE(public.technician_profiles.full_name, EXCLUDED.full_name),
         phone=COALESCE(public.technician_profiles.phone, EXCLUDED.phone),
         employment_type=COALESCE(public.technician_profiles.employment_type, 'partner'),
         partner_status=COALESCE(public.technician_profiles.partner_status, 'applicant'),
         line_id=COALESCE(public.technician_profiles.line_id, EXCLUDED.line_id),
         updated_at=NOW()`,
      [existing.username, fullName || existing.username, phone || null, lineId || null]
    );
    return { username: existing.username, created: false };
  }

  let username = makePartnerUsernameFromPhone(phone, applicationCode);
  for (let i = 0; i < 10; i++) {
    const taken = await client.query(`SELECT 1 FROM public.users WHERE username=$1 LIMIT 1`, [username]);
    if (!taken.rows.length) break;
    username = `${makePartnerUsernameFromPhone(phone, applicationCode)}${i + 1}`;
  }

  const storedPassword = await hashPasswordForStorage(password);
  await client.query(
    `INSERT INTO public.users(username, password, role, full_name)
     VALUES($1,$2,'technician',$3)
     ON CONFLICT(username) DO NOTHING`,
    [username, storedPassword, fullName || username]
  );
  await client.query(
    `INSERT INTO public.technician_profiles(username, full_name, phone, employment_type, partner_status, accept_status, line_id, rating, grade, done_count)
     VALUES($1,$2,$3,'partner','applicant','paused',$4,5,'A',0)
     ON CONFLICT(username) DO UPDATE SET
       full_name=COALESCE(EXCLUDED.full_name, public.technician_profiles.full_name),
       phone=COALESCE(EXCLUDED.phone, public.technician_profiles.phone),
       employment_type='partner',
       partner_status=COALESCE(public.technician_profiles.partner_status, 'applicant'),
       accept_status=COALESCE(public.technician_profiles.accept_status, 'paused'),
       line_id=COALESCE(public.technician_profiles.line_id, EXCLUDED.line_id),
       updated_at=NOW()`,
    [username, fullName || username, phone || null, lineId || null]
  );
  return { username, created: true };
}

function sanitizePartnerApplicationCode(code) {
  return String(code || '').trim().toUpperCase();
}

function makePartnerApplicationCode() {
  const day = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()).replace(/-/g, '');
  return `CWF-P${day}-${crypto.randomBytes(16).toString('hex').toUpperCase()}`;
}

async function generateUniquePartnerApplicationCode(client = pool) {
  for (let i = 0; i < 12; i++) {
    const code = makePartnerApplicationCode();
    const r = await client.query(
      `SELECT 1 FROM public.partner_applications WHERE application_code=$1 LIMIT 1`,
      [code]
    );
    if (!r.rows.length) return code;
  }
  return `CWF-P${Date.now()}-${crypto.randomBytes(16).toString('hex').toUpperCase()}`;
}

async function logPartnerOnboardingEvent(client, {
  application_id,
  actor_type = 'system',
  actor_username = null,
  event_type,
  from_status = null,
  to_status = null,
  note = null,
  metadata = null,
}) {
  const db = client || pool;
  await db.query(
    `INSERT INTO public.partner_onboarding_events
      (application_id, actor_type, actor_username, event_type, from_status, to_status, note, metadata_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    [
      application_id,
      actor_type,
      actor_username,
      event_type,
      from_status,
      to_status,
      note,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
}

const PARTNER_ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const PARTNER_ALLOWED_DOCUMENT_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.pdf',
]);

function validatePartnerDocumentFile(file) {
  if (!file) return 'ไม่พบไฟล์เอกสาร';
  const mimetype = String(file.mimetype || '').toLowerCase().trim();
  if (!PARTNER_ALLOWED_DOCUMENT_MIME_TYPES.has(mimetype)) {
    return 'รองรับเฉพาะไฟล์ JPG, PNG, WEBP หรือ PDF เท่านั้น';
  }
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ext || !PARTNER_ALLOWED_DOCUMENT_EXTENSIONS.has(ext)) {
    return 'นามสกุลไฟล์ต้องเป็น .jpg, .jpeg, .png, .webp หรือ .pdf เท่านั้น';
  }
  return null;
}

async function uploadPartnerDocumentFile(file, applicationCode, documentType) {
  if (!file) throw new Error('ไม่พบไฟล์เอกสาร');
  const safeCode = safeFilename(sanitizePartnerApplicationCode(applicationCode) || 'partner_application');
  const safeType = safeFilename(documentType || 'document');
  const ext = (() => {
    const fromName = path.extname(file.originalname || '').toLowerCase();
    if (fromName && fromName.length <= 8) return fromName;
    const mt = String(file.mimetype || '').toLowerCase();
    if (mt.includes('png')) return '.png';
    if (mt.includes('webp')) return '.webp';
    if (mt.includes('pdf')) return '.pdf';
    return '.jpg';
  })();

  if (CLOUDINARY_ENABLED) {
    const publicId = `${safeCode}_${safeType}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const isPdf = String(file.mimetype || '').toLowerCase() === 'application/pdf';
    const up = await cloudinaryUploadBuffer({
      buffer: file.buffer,
      mimetype: file.mimetype || (isPdf ? 'application/pdf' : 'image/jpeg'),
      folder: `cwf/partner_applications/${safeCode}/${safeType}`,
      publicId,
      transformation: isPdf ? undefined : 'c_limit,w_1600/q_auto/f_auto',
      resourceType: isPdf ? 'raw' : 'image',
    });
    return {
      public_url: up.secure_url,
      storage_path: up.public_id || publicId,
      cloud_public_id: up.public_id || publicId,
    };
  }

  const requireCloudinary = envBool('PARTNER_REQUIRE_CLOUDINARY_DOCS', String(process.env.NODE_ENV || '').toLowerCase() === 'production');
  if (requireCloudinary) {
    throw new Error('PARTNER_DOCUMENTS_REQUIRE_CLOUDINARY');
  }

  const dir = path.join(PARTNER_APPLICATION_UPLOAD_DIR, safeCode);
  fs.mkdirSync(dir, { recursive: true });
  const filename = safeFilename(`${safeType}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`);
  const diskPath = path.join(dir, filename);
  fs.writeFileSync(diskPath, file.buffer);
  const rel = diskPath.replace(UPLOAD_DIR, '').replace(/\\/g, '/');
  return {
    public_url: `/uploads${rel.startsWith('/') ? '' : '/'}${rel}`,
    storage_path: diskPath,
    cloud_public_id: null,
  };
}

function partnerApplicationPublicShape(row, docs = [], events = []) {
  return {
    id: row.id,
    application_code: row.application_code,
    full_name: row.full_name,
    phone: row.phone,
    line_id: row.line_id,
    line_user_id: row.line_user_id || null,
    email: row.email,
    address_text: row.address_text,
    province: row.province || null,
    district: row.district || null,
    service_zones: row.service_zones || [],
    preferred_job_types: row.preferred_job_types || [],
    work_intent: row.work_intent || null,
    available_days_per_week: row.available_days_per_week == null ? null : Number(row.available_days_per_week),
    preferred_work_days: row.preferred_work_days || [],
    max_jobs_per_day: row.max_jobs_per_day == null ? null : Number(row.max_jobs_per_day),
    max_units_per_day: row.max_units_per_day == null ? null : Number(row.max_units_per_day),
    can_accept_urgent_jobs: !!row.can_accept_urgent_jobs,
    can_work_condo: !!row.can_work_condo,
    can_issue_tax_invoice: !!row.can_issue_tax_invoice,
    has_helper_team: !!row.has_helper_team,
    team_size: row.team_size == null ? null : Number(row.team_size),
    travel_method: row.travel_method || null,
    service_radius_km: row.service_radius_km == null ? null : Number(row.service_radius_km),
    experience_years: row.experience_years == null ? null : Number(row.experience_years),
    has_vehicle: !!row.has_vehicle,
    vehicle_type: row.vehicle_type,
    equipment_json: row.equipment_json || [],
    equipment_notes: row.equipment_notes,
    technician_username: row.technician_username || null,
    account_created_at: row.account_created_at || null,
    notes: row.notes,
    status: row.status,
    admin_note: row.admin_note,
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    documents: docs,
    events,
  };
}

function getPartnerOnboardingEnabled() {
  return envBool('PARTNER_ONBOARDING_ENABLED', true);
}

function getCertificationEnforcementMode() {
  const mode = String(process.env.CERTIFICATION_ENFORCEMENT || 'off').trim().toLowerCase();
  return ['off', 'partner_soft', 'partner_strict', 'all_strict'].includes(mode) ? mode : 'off';
}

function getRequiredCertificationCodesForJob(payload = {}) {
  const jobType = String(payload.job_type || payload.jobType || '').trim();
  const acType = String(payload.ac_type || payload.acType || payload.air_type || '').trim();
  const washVariant = String(payload.wash_variant || payload.washVariant || '').trim();
  const repairVariant = String(payload.repair_variant || payload.repairVariant || '').trim();
  const installVariant = String(payload.install_variant || payload.installVariant || '').trim();
  const out = new Set();

  if (jobType === 'ล้าง') {
    if (acType.includes('สี่ทิศ')) out.add('clean_cassette_4way');
    else if (acType.includes('ท่อลม')) out.add('clean_duct_type');
    else if (acType.includes('แขวน') || acType.includes('ใต้ฝ้า') || acType.includes('เปลือย')) out.add('clean_ceiling_suspended');
    else if (washVariant.includes('พรีเมียม')) out.add('clean_wall_premium');
    else if (washVariant.includes('แขวนคอย')) out.add('clean_wall_hanging_coil');
    else if (washVariant.includes('ตัดล้าง') || washVariant.includes('ใหญ่')) out.add('clean_wall_overhaul');
    else out.add('clean_wall_normal');
  }
  if (jobType === 'ซ่อม') {
    if (repairVariant.includes('น้ำรั่ว')) out.add('repair_water_leak');
    else if (repairVariant.includes('ไฟ')) out.add('repair_electrical_basic');
    else if (repairVariant.includes('น้ำยา')) out.add('repair_refrigerant_basic');
    else if (repairVariant.includes('อะไหล่')) out.add('repair_parts_replacement');
    else out.add('repair_diagnosis_basic');
  }
  if (jobType === 'ติดตั้ง') {
    out.add('install_wall_standard');
    if (installVariant.includes('คอนโด') || acType.includes('คอนโด')) out.add('install_condo');
  }
  if (jobType === 'ย้าย') out.add('install_relocation');
  return Array.from(out);
}

async function technicianHasRequiredCertifications(username, requiredCodes = [], opts = {}) {
  const codes = (requiredCodes || []).filter(Boolean);
  if (!codes.length) return { ok: true, missing: [], blocked: [] };
  const r = await pool.query(
    `SELECT certification_code, status
     FROM public.technician_certifications
     WHERE technician_username=$1 AND certification_code = ANY($2::text[])`,
    [username, codes]
  );
  const statusMap = new Map((r.rows || []).map(x => [String(x.certification_code), String(x.status || '')]));
  const missing = codes.filter(code => statusMap.get(code) !== 'approved');
  const blocked = codes.filter(code => ['suspended', 'revoked'].includes(statusMap.get(code)));
  return { ok: missing.length === 0 && blocked.length === 0, missing, blocked, statuses: Object.fromEntries(statusMap) };
}

function explainCertificationBlockReason({ mode, username, required = [], missing = [], blocked = [] } = {}) {
  if (!missing.length && !blocked.length) return '';
  return `CERTIFICATION_BLOCK mode=${mode || 'off'} tech=${username || '-'} required=${required.join(',')} missing=${missing.join(',')} blocked=${blocked.join(',')}`;
}

async function getPartnerApplicationByCode(applicationCode, client = pool) {
  const code = sanitizePartnerApplicationCode(applicationCode);
  if (!code) return null;
  const r = await client.query(`SELECT * FROM public.partner_applications WHERE application_code=$1 LIMIT 1`, [code]);
  return r.rows[0] || null;
}

async function getPartnerApplicationById(id, client = pool) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return null;
  const r = await client.query(`SELECT * FROM public.partner_applications WHERE id=$1 LIMIT 1`, [n]);
  return r.rows[0] || null;
}

// =======================================
// 🤝 Partner Onboarding Phase 1A
// - Temporary public lookup token: application_code
// - Phase 1B should bind this to LINE/customer/technician session before deeper onboarding.
// =======================================
app.post('/partner/apply', async (req, res) => {
  const body = req.body || {};
  const full_name = String(body.full_name || '').trim();
  const phone = normalizePartnerPhone(body.phone);
  const password = String(body.password || '').trim();
  const confirm_password = String(body.confirm_password || '').trim();
  const consent_pdpa = body.consent_pdpa === true || body.consent_pdpa === 'true' || body.consent_pdpa === 1 || body.consent_pdpa === '1';
  const consent_terms = body.consent_terms === true || body.consent_terms === 'true' || body.consent_terms === 1 || body.consent_terms === '1';

  if (!full_name) return res.status(400).json({ error: 'กรุณากรอกชื่อ-นามสกุล' });
  if (!phone) return res.status(400).json({ error: 'กรุณากรอกเบอร์โทร' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'กรุณาตั้งรหัสผ่านอย่างน้อย 6 ตัวอักษร' });
  if (password !== confirm_password) return res.status(400).json({ error: 'ยืนยันรหัสผ่านไม่ตรงกัน' });
  if (!consent_pdpa || !consent_terms) return res.status(400).json({ error: 'กรุณายอมรับ PDPA และเงื่อนไขการสมัคร' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const application_code = await generateUniquePartnerApplicationCode(client);
    const service_zones = normalizeJsonArrayInput(body.service_zones);
    const preferred_job_types = normalizeJsonArrayInput(body.preferred_job_types);
    const equipment_json = normalizeJsonArrayInput(body.equipment_json).filter(x => PARTNER_EQUIPMENT_CHOICES.includes(x));
    const preferred_work_days = normalizeJsonArrayInput(body.preferred_work_days);
    const experienceRaw = body.experience_years === '' || body.experience_years == null ? null : Number(body.experience_years);
    const experience_years = Number.isFinite(experienceRaw) ? Math.max(0, experienceRaw) : null;
    const has_vehicle = body.has_vehicle === true || body.has_vehicle === 'true' || body.has_vehicle === 1 || body.has_vehicle === '1';
    const work_intent = PARTNER_WORK_INTENTS.has(String(body.work_intent || '')) ? String(body.work_intent) : null;
    const travel_method = PARTNER_TRAVEL_METHODS.has(String(body.travel_method || '')) ? String(body.travel_method) : null;
    const account = await ensurePartnerTechnicianAccount(client, {
      phone,
      password,
      fullName: full_name,
      lineId: body.line_id ? String(body.line_id).trim() : null,
      applicationCode: application_code,
    });

    const r = await client.query(
      `INSERT INTO public.partner_applications
        (application_code, user_id, technician_username, full_name, phone, line_id, email, address_text,
         service_zones, preferred_job_types, experience_years, has_vehicle, vehicle_type, equipment_notes,
         bank_account_name, bank_name, bank_account_last4, notes, consent_pdpa, consent_terms, status, submitted_at, updated_at,
         province, district, work_intent, available_days_per_week, preferred_work_days, max_jobs_per_day, max_units_per_day,
         can_accept_urgent_jobs, can_work_condo, can_issue_tax_invoice, has_helper_team, team_size, travel_method,
         service_radius_km, equipment_json, line_user_id, account_created_at, account_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'submitted',NOW(),NOW(),
         $21,$22,$23,$24,$25::jsonb,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35::jsonb,$36,NOW(),$37)
       RETURNING *`,
      [
        application_code,
        body.user_id ? String(body.user_id).trim() : null,
        account.username,
        full_name,
        phone,
        body.line_id ? String(body.line_id).trim() : null,
        body.email ? String(body.email).trim() : null,
        body.address_text ? String(body.address_text).trim() : null,
        JSON.stringify(service_zones),
        JSON.stringify(preferred_job_types),
        experience_years,
        has_vehicle,
        body.vehicle_type ? String(body.vehicle_type).trim() : null,
        body.equipment_notes ? String(body.equipment_notes).trim() : null,
        body.bank_account_name ? String(body.bank_account_name).trim() : null,
        body.bank_name ? String(body.bank_name).trim() : null,
        body.bank_account_last4 ? String(body.bank_account_last4).trim().slice(-4) : null,
        body.notes ? String(body.notes).trim() : null,
        consent_pdpa,
        consent_terms,
        body.province ? String(body.province).trim() : null,
        body.district ? String(body.district).trim() : null,
        work_intent,
        normalizePartnerInt(body.available_days_per_week),
        JSON.stringify(preferred_work_days),
        normalizePartnerInt(body.max_jobs_per_day),
        normalizePartnerInt(body.max_units_per_day),
        normalizePartnerBool(body.can_accept_urgent_jobs),
        normalizePartnerBool(body.can_work_condo),
        normalizePartnerBool(body.can_issue_tax_invoice),
        normalizePartnerBool(body.has_helper_team),
        normalizePartnerInt(body.team_size),
        travel_method,
        normalizePartnerNumber(body.service_radius_km),
        JSON.stringify(equipment_json),
        body.line_user_id ? String(body.line_user_id).trim() : null,
        account.created ? 'created_new_technician_account' : 'linked_existing_technician_account',
      ]
    );
    const appRow = r.rows[0];
    await logPartnerOnboardingEvent(client, {
      application_id: appRow.id,
      actor_type: 'applicant',
      event_type: 'application_submitted',
      to_status: 'submitted',
      note: 'Partner application submitted',
      metadata: { application_code, technician_username: account.username, account_created: account.created },
    });
    await client.query('COMMIT');
    notifyPartnerAdmins('partner_application_submitted', partnerNotifyTextNewApplication(appRow), appRow.id).catch(()=>{});
    return res.json({ ok: true, application: partnerApplicationPublicShape(appRow) });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST /partner/apply error:', e);
    return res.status(500).json({ error: 'ส่งใบสมัครไม่สำเร็จ' });
  } finally {
    client.release();
  }
});

app.get('/partner/application/:application_code', async (req, res) => {
  try {
    const application_code = sanitizePartnerApplicationCode(req.params.application_code);
    if (!application_code) return res.status(400).json({ error: 'ต้องมี application_code' });
    const appR = await pool.query(`SELECT * FROM public.partner_applications WHERE application_code=$1 LIMIT 1`, [application_code]);
    if (!appR.rows.length) return res.status(404).json({ error: 'ไม่พบใบสมัคร' });
    const appRow = appR.rows[0];
    const docsR = await pool.query(
      `SELECT id, document_type, original_filename, mime_type, file_size, status, admin_note, uploaded_at, reviewed_at
       FROM public.partner_application_documents
       WHERE application_id=$1
       ORDER BY created_at DESC, id DESC`,
      [appRow.id]
    );
    const eventsR = await pool.query(
      `SELECT id, actor_type, actor_username, event_type, from_status, to_status, note, metadata_json, created_at
       FROM public.partner_onboarding_events
       WHERE application_id=$1
       ORDER BY created_at DESC, id DESC
       LIMIT 50`,
      [appRow.id]
    );
    return res.json({ ok: true, application: partnerApplicationPublicShape(appRow, docsR.rows, eventsR.rows) });
  } catch (e) {
    console.error('GET /partner/application error:', e);
    return res.status(500).json({ error: 'โหลดใบสมัครไม่สำเร็จ' });
  }
});

app.post('/partner/application/:application_code/documents', upload.single('document'), async (req, res) => {
  const application_code = sanitizePartnerApplicationCode(req.params.application_code);
  const document_type = String(req.body?.document_type || '').trim();
  if (!application_code) return res.status(400).json({ error: 'ต้องมี application_code' });
  if (!PARTNER_DOCUMENT_TYPES.has(document_type)) return res.status(400).json({ error: 'document_type ไม่ถูกต้อง' });
  if (!req.file) return res.status(400).json({ error: 'กรุณาแนบไฟล์เอกสาร' });
  const fileError = validatePartnerDocumentFile(req.file);
  if (fileError) return res.status(400).json({ error: fileError });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const appR = await client.query(
      `SELECT id, application_code FROM public.partner_applications WHERE application_code=$1 FOR UPDATE`,
      [application_code]
    );
    if (!appR.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'ไม่พบใบสมัคร' });
    }
    const appRow = appR.rows[0];
    const stored = await uploadPartnerDocumentFile(req.file, application_code, document_type);
    const docR = await client.query(
      `INSERT INTO public.partner_application_documents
        (application_id, document_type, original_filename, mime_type, file_size, public_url, storage_path, cloud_public_id, status, uploaded_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'uploaded',NOW(),NOW())
       RETURNING id, document_type, original_filename, mime_type, file_size, status, uploaded_at, created_at`,
      [
        appRow.id,
        document_type,
        req.file.originalname || null,
        req.file.mimetype || null,
        req.file.size || null,
        stored.public_url,
        stored.storage_path,
        stored.cloud_public_id,
      ]
    );
    await logPartnerOnboardingEvent(client, {
      application_id: appRow.id,
      actor_type: 'applicant',
      event_type: 'document_uploaded',
      note: document_type,
      metadata: { document_id: docR.rows[0].id, document_type },
    });
    await client.query('COMMIT');
    notifyPartnerAdmins('partner_document_uploaded', [
      '📎 พาร์ทเนอร์อัปโหลดเอกสารใหม่',
      `รหัส: ${appRow.application_code}`,
      `เอกสาร: ${document_type}`,
      partnerAppUrl('/admin-partner-onboarding.html')
    ].join('\n'), appRow.id).catch(()=>{});
    return res.json({ ok: true, document: docR.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST partner document error:', e);
    const msg = e && e.code === 'LIMIT_FILE_SIZE'
      ? 'ไฟล์ใหญ่เกิน 8MB'
      : e && e.message === 'PARTNER_DOCUMENTS_REQUIRE_CLOUDINARY'
        ? 'ระบบเอกสารพาร์ทเนอร์ต้องใช้ Cloudinary ใน production กรุณาตั้งค่า Cloudinary ก่อนรับเอกสาร'
        : 'อัปโหลดเอกสารไม่สำเร็จ';
    return res.status(500).json({ error: msg });
  } finally {
    client.release();
  }
});

async function buildPartnerStatusForApplication(appRow) {
  const docsR = await pool.query(
    `SELECT id, document_type, original_filename, mime_type, file_size, status, admin_note, uploaded_at, reviewed_at
     FROM public.partner_application_documents
     WHERE application_id=$1
     ORDER BY created_at DESC, id DESC`,
    [appRow.id]
  );
  const sigR = await pool.query(
    `SELECT id, template_version, signer_full_name, signed_at
     FROM public.agreement_signatures
     WHERE application_id=$1
     ORDER BY signed_at DESC LIMIT 1`,
    [appRow.id]
  );
  await pool.query(`UPDATE public.agreement_templates SET is_active=FALSE, updated_at=NOW() WHERE template_code='partner_standard' AND version < 3`);
  const courseR = await pool.query(`SELECT id FROM public.academy_courses WHERE course_code='cwf_basic_partner' LIMIT 1`);
  const lessonsR = courseR.rows[0]
    ? await pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(p.id) FILTER (WHERE COALESCE(p.completed,FALSE))::int AS completed
         FROM public.academy_lessons l
         LEFT JOIN public.academy_progress p ON p.lesson_id=l.id AND p.application_id=$2
         WHERE l.course_id=$1 AND l.is_active=TRUE`,
        [courseR.rows[0].id, appRow.id]
      )
    : { rows: [{ total: 0, completed: 0 }] };
  const examR = await pool.query(
    `SELECT score_percent, passed, submitted_at
     FROM public.academy_exam_attempts
     WHERE application_id=$1
     ORDER BY submitted_at DESC LIMIT 1`,
    [appRow.id]
  );
  const certR = await pool.query(
    `SELECT c.certification_code, c.status, COALESCE(p.enabled,FALSE) AS preference_enabled
     FROM public.technician_certifications c
     LEFT JOIN public.technician_certification_preferences p
       ON p.technician_username=c.technician_username AND p.certification_code=c.certification_code
     WHERE c.application_id=$1
     ORDER BY c.certification_code ASC`,
    [appRow.id]
  );
  const availabilityR = appRow.technician_username
    ? await pool.query(`SELECT * FROM public.partner_availability_preferences WHERE technician_username=$1 LIMIT 1`, [appRow.technician_username])
    : { rows: [] };
  return {
    application: partnerApplicationPublicShape(appRow, docsR.rows, []),
    agreement: sigR.rows[0] || null,
    academy: lessonsR.rows[0] || { total: 0, completed: 0 },
    exam: examR.rows[0] || null,
    certifications: certR.rows || [],
    availability: availabilityR.rows[0] || null,
    stages: {
      applied: true,
      documents_pending: docsR.rows.some(d => d.status !== 'approved'),
      agreement_signed: !!sigR.rows[0],
      basic_training_done: Number(lessonsR.rows[0]?.total || 0) > 0 && Number(lessonsR.rows[0]?.completed || 0) >= Number(lessonsR.rows[0]?.total || 0),
      exam_passed: !!examR.rows[0]?.passed,
      real_jobs_unlocked: certR.rows.some(c => c.status === 'approved'),
    },
  };
}

app.get('/partner/status', async (req, res) => {
  try {
    const applicationCode = sanitizePartnerApplicationCode(req.query.application_code || req.query.ref || '');
    const phone = normalizePartnerPhone(req.query.phone || '');
    if (!applicationCode || !phone) return res.status(400).json({ error: 'ต้องมีรหัสอ้างอิงและเบอร์โทร' });
    const r = await pool.query(`SELECT * FROM public.partner_applications WHERE application_code=$1 AND phone=$2 LIMIT 1`, [applicationCode, phone]);
    if (!r.rows.length) return res.status(404).json({ error: 'ไม่พบข้อมูลใบสมัคร' });
    return res.json({ ok: true, ...(await buildPartnerStatusForApplication(r.rows[0])) });
  } catch (e) {
    console.error('GET partner status error:', e);
    return res.status(500).json({ error: 'โหลดสถานะไม่สำเร็จ' });
  }
});

app.get('/tech/partner-onboarding', requireTechnicianSession, async (req, res) => {
  try {
    const username = req.auth?.username;
    const r = await pool.query(`SELECT * FROM public.partner_applications WHERE technician_username=$1 ORDER BY created_at DESC LIMIT 1`, [username]);
    if (!r.rows.length) return res.json({ ok: true, partner: null });
    return res.json({ ok: true, partner: await buildPartnerStatusForApplication(r.rows[0]) });
  } catch (e) {
    console.error('GET tech partner onboarding error:', e);
    return res.status(500).json({ error: 'โหลดสถานะพาร์ทเนอร์ไม่สำเร็จ' });
  }
});

app.get('/tech/partner/preferences', requireTechnicianSession, async (req, res) => {
  try {
    const username = req.auth?.username;
    const r = await pool.query(
      `SELECT c.certification_code, c.status, COALESCE(p.enabled,FALSE) AS enabled
       FROM public.technician_certifications c
       LEFT JOIN public.technician_certification_preferences p
         ON p.technician_username=c.technician_username AND p.certification_code=c.certification_code
       WHERE c.technician_username=$1
       ORDER BY c.certification_code ASC`,
      [username]
    );
    return res.json({ ok: true, preferences: r.rows });
  } catch (e) {
    console.error('GET tech partner preferences error:', e);
    return res.status(500).json({ error: 'โหลดประเภทงานไม่สำเร็จ' });
  }
});

app.put('/tech/partner/preferences/:certification_code', requireTechnicianSession, async (req, res) => {
  const username = req.auth?.username;
  const code = String(req.params.certification_code || '').trim();
  const enabled = normalizePartnerBool(req.body?.enabled);
  if (!PARTNER_CERTIFICATION_CODES.includes(code)) return res.status(400).json({ error: 'certification_code ไม่ถูกต้อง' });
  try {
    const cert = await pool.query(`SELECT status FROM public.technician_certifications WHERE technician_username=$1 AND certification_code=$2 LIMIT 1`, [username, code]);
    const status = cert.rows[0]?.status || 'not_started';
    if (enabled && status !== 'approved') return res.status(403).json({ error: 'ยังเปิดรับงานประเภทนี้ไม่ได้จนกว่าแอดมินอนุมัติ certification' });
    const finalEnabled = enabled && status === 'approved';
    const r = await pool.query(
      `INSERT INTO public.technician_certification_preferences(technician_username, certification_code, enabled, updated_at)
       VALUES($1,$2,$3,NOW())
       ON CONFLICT(technician_username, certification_code) DO UPDATE SET enabled=EXCLUDED.enabled, updated_at=NOW()
       RETURNING *`,
      [username, code, finalEnabled]
    );
    return res.json({ ok: true, preference: r.rows[0] });
  } catch (e) {
    console.error('PUT tech partner preference error:', e);
    return res.status(500).json({ error: 'บันทึกประเภทงานไม่สำเร็จ' });
  }
});

app.get('/tech/partner/availability', requireTechnicianSession, async (req, res) => {
  try {
    const username = req.auth?.username;
    const r = await pool.query(`SELECT * FROM public.partner_availability_preferences WHERE technician_username=$1 LIMIT 1`, [username]);
    return res.json({ ok: true, availability: r.rows[0] || null });
  } catch (e) {
    console.error('GET tech partner availability error:', e);
    return res.status(500).json({ error: 'โหลดเวลารับงานไม่สำเร็จ' });
  }
});

app.put('/tech/partner/availability', requireTechnicianSession, async (req, res) => {
  try {
    const username = req.auth?.username;
    const workingDays = normalizeJsonArrayInput(req.body?.working_days);
    const timeWindows = Array.isArray(req.body?.time_windows) ? req.body.time_windows : [];
    const vacationDays = normalizeJsonArrayInput(req.body?.vacation_days);
    const r = await pool.query(
      `INSERT INTO public.partner_availability_preferences
        (technician_username, working_days, time_windows, max_jobs_per_day, max_units_per_day, paused, vacation_days, updated_at)
       VALUES($1,$2::jsonb,$3::jsonb,$4,$5,$6,$7::jsonb,NOW())
       ON CONFLICT(technician_username) DO UPDATE SET
         working_days=EXCLUDED.working_days,
         time_windows=EXCLUDED.time_windows,
         max_jobs_per_day=EXCLUDED.max_jobs_per_day,
         max_units_per_day=EXCLUDED.max_units_per_day,
         paused=EXCLUDED.paused,
         vacation_days=EXCLUDED.vacation_days,
         updated_at=NOW()
       RETURNING *`,
      [
        username,
        JSON.stringify(workingDays),
        JSON.stringify(timeWindows),
        normalizePartnerInt(req.body?.max_jobs_per_day),
        normalizePartnerInt(req.body?.max_units_per_day),
        normalizePartnerBool(req.body?.paused),
        JSON.stringify(vacationDays),
      ]
    );
    return res.json({ ok: true, availability: r.rows[0] });
  } catch (e) {
    console.error('PUT tech partner availability error:', e);
    return res.status(500).json({ error: 'บันทึกเวลารับงานไม่สำเร็จ' });
  }
});

app.get('/admin/partners/applications', requireAdminSession, async (req, res) => {
  try {
    const status = String(req.query.status || '').trim();
    const q = String(req.query.q || '').trim();
    if (status && !PARTNER_APPLICATION_STATUSES.has(status)) return res.status(400).json({ error: 'status ไม่ถูกต้อง' });
    const params = [];
    const where = [];
    if (status) {
      params.push(status);
      where.push(`a.status=$${params.length}`);
    }
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      where.push(`(LOWER(a.application_code) LIKE $${params.length} OR LOWER(a.full_name) LIKE $${params.length} OR LOWER(a.phone) LIKE $${params.length})`);
    }
    const sql = `
      SELECT a.id, a.application_code, a.full_name, a.phone, a.line_id, a.email,
             a.service_zones, a.preferred_job_types, a.status, a.admin_note,
             a.submitted_at, a.reviewed_by, a.reviewed_at, a.created_at, a.updated_at,
             COUNT(d.id)::int AS document_count,
             COUNT(d.id) FILTER (WHERE d.status='approved')::int AS approved_document_count,
             COUNT(d.id) FILTER (WHERE d.status IN ('rejected','need_reupload'))::int AS problem_document_count
      FROM public.partner_applications a
      LEFT JOIN public.partner_application_documents d ON d.application_id=a.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY a.id
      ORDER BY a.created_at DESC
      LIMIT 200`;
    const r = await pool.query(sql, params);
    return res.json({ ok: true, applications: r.rows });
  } catch (e) {
    console.error('GET admin partner applications error:', e);
    return res.status(500).json({ error: 'โหลดใบสมัครพาร์ทเนอร์ไม่สำเร็จ' });
  }
});

app.get('/admin/partners/applications/:id', requireAdminSession, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'id ไม่ถูกต้อง' });
    const appR = await pool.query(`SELECT * FROM public.partner_applications WHERE id=$1 LIMIT 1`, [id]);
    if (!appR.rows.length) return res.status(404).json({ error: 'ไม่พบใบสมัคร' });
    const docsR = await pool.query(
      `SELECT id, application_id, document_type, original_filename, mime_type, file_size, public_url, status, admin_note,
              uploaded_at, reviewed_by, reviewed_at, created_at, updated_at
       FROM public.partner_application_documents
       WHERE application_id=$1
       ORDER BY created_at DESC, id DESC`,
      [id]
    );
    const eventsR = await pool.query(
      `SELECT id, actor_type, actor_username, event_type, from_status, to_status, note, metadata_json, created_at
       FROM public.partner_onboarding_events
       WHERE application_id=$1
       ORDER BY created_at DESC, id DESC`,
      [id]
    );
    return res.json({ ok: true, application: appR.rows[0], documents: docsR.rows, events: eventsR.rows });
  } catch (e) {
    console.error('GET admin partner application detail error:', e);
    return res.status(500).json({ error: 'โหลดรายละเอียดใบสมัครไม่สำเร็จ' });
  }
});

app.put('/admin/partners/applications/:id/status', requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || '').trim();
  const admin_note = req.body?.admin_note == null ? null : String(req.body.admin_note || '').trim();
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'id ไม่ถูกต้อง' });
  if (!PARTNER_APPLICATION_STATUSES.has(status)) return res.status(400).json({ error: 'status ไม่ถูกต้อง' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(`SELECT id, application_code, status FROM public.partner_applications WHERE id=$1 FOR UPDATE`, [id]);
    if (!cur.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'ไม่พบใบสมัคร' });
    }
    const from_status = cur.rows[0].status;
    const actor = req.actor?.username || req.auth?.username || null;
    const upd = await client.query(
      `UPDATE public.partner_applications
       SET status=$1, admin_note=$2, reviewed_by=$3, reviewed_at=NOW(), updated_at=NOW()
       WHERE id=$4
       RETURNING *`,
      [status, admin_note || null, actor, id]
    );
    await logPartnerOnboardingEvent(client, {
      application_id: id,
      actor_type: 'admin',
      actor_username: actor,
      event_type: 'application_status_changed',
      from_status,
      to_status: status,
      note: admin_note || null,
      metadata: { application_code: cur.rows[0].application_code },
    });
    await client.query('COMMIT');
    await auditLog(req, {
      action: 'PARTNER_APPLICATION_STATUS_UPDATE',
      target_username: cur.rows[0].application_code,
      target_role: 'partner_application',
      meta: { application_id: id, from_status, to_status: status, admin_note },
    });
    return res.json({ ok: true, application: upd.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('PUT partner application status error:', e);
    return res.status(500).json({ error: 'อัปเดตสถานะใบสมัครไม่สำเร็จ' });
  } finally {
    client.release();
  }
});

app.put('/admin/partners/applications/:id/documents/:document_id/status', requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  const document_id = Number(req.params.document_id);
  const status = String(req.body?.status || '').trim();
  const admin_note = req.body?.admin_note == null ? null : String(req.body.admin_note || '').trim();
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(document_id) || document_id <= 0) {
    return res.status(400).json({ error: 'id เอกสารไม่ถูกต้อง' });
  }
  if (!PARTNER_DOCUMENT_STATUSES.has(status)) return res.status(400).json({ error: 'document status ไม่ถูกต้อง' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(
      `SELECT d.id, d.application_id, d.document_type, d.status, a.application_code
       FROM public.partner_application_documents d
       JOIN public.partner_applications a ON a.id=d.application_id
       WHERE d.id=$1 AND d.application_id=$2
       FOR UPDATE`,
      [document_id, id]
    );
    if (!cur.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'ไม่พบเอกสาร' });
    }
    const row = cur.rows[0];
    const actor = req.actor?.username || req.auth?.username || null;
    const upd = await client.query(
      `UPDATE public.partner_application_documents
       SET status=$1, admin_note=$2, reviewed_by=$3, reviewed_at=NOW(), updated_at=NOW()
       WHERE id=$4 AND application_id=$5
       RETURNING id, document_type, original_filename, mime_type, file_size, public_url, status, admin_note, uploaded_at, reviewed_by, reviewed_at, created_at, updated_at`,
      [status, admin_note || null, actor, document_id, id]
    );
    await logPartnerOnboardingEvent(client, {
      application_id: id,
      actor_type: 'admin',
      actor_username: actor,
      event_type: 'document_status_changed',
      from_status: row.status,
      to_status: status,
      note: admin_note || row.document_type,
      metadata: { document_id, document_type: row.document_type },
    });
    await client.query('COMMIT');
    notifyPartnerApplicant(id, 'partner_document_reviewed', partnerNotifyTextApplicant(
      status === 'approved' ? 'เอกสารของคุณผ่านการตรวจแล้ว' : 'มีการอัปเดตสถานะเอกสาร',
      [
        `เอกสาร: ${row.document_type}`,
        `สถานะ: ${status}`,
        admin_note ? `หมายเหตุ: ${admin_note}` : '',
        partnerAppUrl('/partner-dashboard.html')
      ].filter(Boolean)
    )).catch(()=>{});
    await auditLog(req, {
      action: 'PARTNER_DOCUMENT_STATUS_UPDATE',
      target_username: row.application_code,
      target_role: 'partner_application',
      meta: { application_id: id, document_id, document_type: row.document_type, from_status: row.status, to_status: status, admin_note },
    });
    return res.json({ ok: true, document: upd.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('PUT partner document status error:', e);
    return res.status(500).json({ error: 'อัปเดตสถานะเอกสารไม่สำเร็จ' });
  } finally {
    client.release();
  }
});

function isPartnerAgreementTemplateReady(template) {
  if (!template) return false;
  const sourceNote = String(template.source_note || '').toUpperCase();
  const content = String(template.content_html || template.body_text || '').trim();
  if (!content) return false;
  if (sourceNote.includes('PLACEHOLDER') || sourceNote.includes('IMPORT_REQUIRED')) return false;
  if (/placeholder/i.test(content) || content.includes('ต้องนำเนื้อหา') || content.includes('โปรดนำเนื้อหา')) return false;
  return true;
}

function partnerAgreementReadinessMessage(template) {
  if (isPartnerAgreementTemplateReady(template)) return '';
  return 'ยังไม่สามารถเซ็นสัญญาได้ เพราะยังไม่ได้นำเข้าสัญญาฉบับจริง';
}

// =======================================
// Partner Agreement / Academy / Exam / Certification / Trial
// Enforcement helpers are available above, but job-blocking remains OFF by default.
// =======================================
app.get('/partner/agreement/:application_code', async (req, res) => {
  try {
    const appRow = await getPartnerApplicationByCode(req.params.application_code);
    if (!appRow) return res.status(404).json({ error: 'ไม่พบใบสมัคร' });
    const tpl = await pool.query(
      `SELECT * FROM public.agreement_templates WHERE template_code='partner_standard' AND is_active=TRUE ORDER BY version DESC LIMIT 1`
    );
    const sig = await pool.query(
      `SELECT id, template_id, template_version, signer_full_name, signed_at
       FROM public.agreement_signatures
       WHERE application_id=$1
       ORDER BY signed_at DESC LIMIT 1`,
      [appRow.id]
    );
    const template = tpl.rows[0] || null;
    const contract_ready = isPartnerAgreementTemplateReady(template);
    return res.json({
      ok: true,
      application: partnerApplicationPublicShape(appRow),
      template,
      signature: sig.rows[0] || null,
      contract_ready,
      contract_ready_message: contract_ready ? '' : partnerAgreementReadinessMessage(template),
    });
  } catch (e) {
    console.error('GET partner agreement error:', e);
    return res.status(500).json({ error: 'โหลดสัญญาไม่สำเร็จ' });
  }
});

app.post('/partner/agreement/:application_code/sign', async (req, res) => {
  const applicationCode = sanitizePartnerApplicationCode(req.params.application_code);
  const signer = String(req.body?.signer_full_name || '').trim();
  const consent = req.body?.consent === true || req.body?.consent === 'true' || req.body?.consent === 1 || req.body?.consent === '1';
  const signatureDataUrl = String(req.body?.signature_data_url || '').trim();
  if (!signer) return res.status(400).json({ error: 'กรุณาพิมพ์ชื่อ-นามสกุลเพื่อเซ็นสัญญา' });
  if (!consent) return res.status(400).json({ error: 'กรุณายืนยันการยอมรับสัญญา' });
  if (!signatureDataUrl || !signatureDataUrl.startsWith('data:image/png;base64,') || signatureDataUrl.length < 800) {
    return res.status(400).json({ error: 'กรุณาเซ็นลายเซ็นบนหน้าจอก่อนยืนยันสัญญา' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const appR = await client.query(`SELECT * FROM public.partner_applications WHERE application_code=$1 FOR UPDATE`, [applicationCode]);
    if (!appR.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'ไม่พบใบสมัคร' });
    }
    const tplR = await client.query(
      `SELECT * FROM public.agreement_templates WHERE template_code='partner_standard' AND is_active=TRUE ORDER BY version DESC LIMIT 1`
    );
    if (!tplR.rows.length) throw new Error('ไม่พบ template สัญญาที่เปิดใช้งาน');
    const tpl = tplR.rows[0];
    if (!isPartnerAgreementTemplateReady(tpl)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: partnerAgreementReadinessMessage(tpl), contract_ready: false });
    }
    const sig = await client.query(
      `INSERT INTO public.agreement_signatures
        (application_id, template_id, template_version, signer_full_name, consent_terms, signature_data_url,
         signature_snapshot_html, signature_template_title, signature_template_source_note, application_snapshot_json,
         signed_ip, signed_user_agent, signed_at)
       VALUES ($1,$2,$3,$4,TRUE,$5,$6,$7,$8,$9::jsonb,$10,$11,NOW())
       RETURNING id, template_id, template_version, signer_full_name, signed_at`,
      [
        appR.rows[0].id,
        tpl.id,
        tpl.version,
        signer,
        signatureDataUrl,
        String(tpl.content_html || tpl.body_text || ''),
        String(tpl.title || ''),
        String(tpl.source_note || ''),
        JSON.stringify(partnerApplicationPublicShape(appR.rows[0])),
        req.ip || null,
        String(req.headers['user-agent'] || '').slice(0, 500)
      ]
    );
    await logPartnerOnboardingEvent(client, {
      application_id: appR.rows[0].id,
      actor_type: 'applicant',
      event_type: 'agreement_signed',
      note: `version ${tpl.version}`,
      metadata: { signature_id: sig.rows[0].id, template_code: tpl.template_code },
    });
    await client.query('COMMIT');
    notifyPartnerAdmins('partner_agreement_signed', [
      '📝 พาร์ทเนอร์เซ็นสัญญาแล้ว',
      `ชื่อ: ${appR.rows[0].full_name || '-'}`,
      `รหัส: ${appR.rows[0].application_code || '-'}`,
      partnerAppUrl('/admin-partner-onboarding.html')
    ].join('\n'), appR.rows[0].id).catch(()=>{});
    notifyPartnerApplicant(appR.rows[0].id, 'partner_agreement_signed', partnerNotifyTextApplicant(
      'เซ็นสัญญาเรียบร้อยแล้ว',
      ['ขั้นตอนต่อไป: เข้า Academy เพื่ออบรมและทำข้อสอบ', partnerAppUrl('/partner-dashboard.html')]
    ), client).catch(()=>{});
    return res.json({ ok: true, signature: sig.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST partner agreement sign error:', e);
    return res.status(500).json({ error: e.message || 'เซ็นสัญญาไม่สำเร็จ' });
  } finally {
    client.release();
  }
});

app.get('/partner/academy/:application_code', async (req, res) => {
  try {
    const appRow = await getPartnerApplicationByCode(req.params.application_code);
    if (!appRow) return res.status(404).json({ error: 'ไม่พบใบสมัคร' });
    const courseR = await pool.query(`SELECT * FROM public.academy_courses WHERE course_code='cwf_basic_partner' LIMIT 1`);
    const course = courseR.rows[0] || null;
    const lessonsR = course
      ? await pool.query(
          `SELECT l.*, COALESCE(p.completed,FALSE) AS completed, p.completed_at
           FROM public.academy_lessons l
           LEFT JOIN public.academy_progress p ON p.lesson_id=l.id AND p.application_id=$2
           WHERE l.course_id=$1 AND l.is_active=TRUE
           ORDER BY l.sort_order ASC, l.id ASC`,
          [course.id, appRow.id]
        )
      : { rows: [] };
    return res.json({ ok: true, application: partnerApplicationPublicShape(appRow), course, lessons: lessonsR.rows });
  } catch (e) {
    console.error('GET partner academy error:', e);
    return res.status(500).json({ error: 'โหลด Academy ไม่สำเร็จ' });
  }
});

app.post('/partner/academy/:application_code/lessons/:lesson_id/complete', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const appRow = await getPartnerApplicationByCode(req.params.application_code, client);
    if (!appRow) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'ไม่พบใบสมัคร' });
    }
    const lessonId = Number(req.params.lesson_id);
    if (!Number.isFinite(lessonId) || lessonId <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'lesson_id ไม่ถูกต้อง' });
    }
    const lessonR = await client.query(`SELECT id, course_id, lesson_title, COALESCE(min_watch_seconds,60)::int AS min_watch_seconds FROM public.academy_lessons WHERE id=$1 AND is_active=TRUE LIMIT 1`, [lessonId]);
    if (!lessonR.rows.length) throw new Error('ไม่พบบทเรียน');
    const watchedSeconds = Math.max(0, Math.round(Number(req.body?.watched_seconds || 0)));
    if (watchedSeconds < Number(lessonR.rows[0].min_watch_seconds || 60)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `ต้องดูบทเรียนอย่างน้อย ${lessonR.rows[0].min_watch_seconds} วินาทีก่อนยืนยัน`, min_watch_seconds: lessonR.rows[0].min_watch_seconds });
    }
    const saved = await client.query(
      `INSERT INTO public.academy_progress(application_id, course_id, lesson_id, completed, completed_at, updated_at, watched_seconds)
       VALUES($1,$2,$3,TRUE,NOW(),NOW(),$4)
       ON CONFLICT(application_id, lesson_id) DO UPDATE SET completed=TRUE, watched_seconds=GREATEST(COALESCE(public.academy_progress.watched_seconds,0), EXCLUDED.watched_seconds), completed_at=COALESCE(public.academy_progress.completed_at,NOW()), updated_at=NOW()
       RETURNING *`,
      [appRow.id, lessonR.rows[0].course_id, lessonId, watchedSeconds]
    );
    await logPartnerOnboardingEvent(client, {
      application_id: appRow.id,
      actor_type: 'applicant',
      event_type: 'academy_lesson_completed',
      note: lessonR.rows[0].lesson_title,
      metadata: { lesson_id: lessonId },
    });
    await client.query('COMMIT');
    return res.json({ ok: true, progress: saved.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST lesson complete error:', e);
    return res.status(500).json({ error: e.message || 'บันทึกบทเรียนไม่สำเร็จ' });
  } finally {
    client.release();
  }
});

app.get('/partner/academy/:application_code/exam', async (req, res) => {
  try {
    const appRow = await getPartnerApplicationByCode(req.params.application_code);
    if (!appRow) return res.status(404).json({ error: 'ไม่พบใบสมัคร' });
    const completeR = await pool.query(`
      SELECT COUNT(l.id)::int AS total, COUNT(p.id) FILTER (WHERE COALESCE(p.completed,FALSE))::int AS completed
      FROM public.academy_courses c
      JOIN public.academy_lessons l ON l.course_id=c.id AND l.is_active=TRUE
      LEFT JOIN public.academy_progress p ON p.lesson_id=l.id AND p.application_id=$1
      WHERE c.course_code='cwf_basic_partner'`, [appRow.id]);
    const totalLessons = Number(completeR.rows[0]?.total || 0);
    const completedLessons = Number(completeR.rows[0]?.completed || 0);
    if (totalLessons > 0 && completedLessons < totalLessons) {
      return res.status(403).json({ error: 'ต้องดูบทเรียนให้ครบก่อนทำข้อสอบ', total_lessons: totalLessons, completed_lessons: completedLessons });
    }
    const examR = await pool.query(
      `SELECT e.* FROM public.academy_exams e JOIN public.academy_courses c ON c.id=e.course_id WHERE c.course_code='cwf_basic_partner' AND e.is_active=TRUE ORDER BY e.id DESC LIMIT 1`
    );
    if (!examR.rows.length) return res.status(404).json({ error: 'ไม่พบข้อสอบ' });
    const qR = await pool.query(
      `SELECT id, question_text, choices_json, sort_order FROM public.academy_exam_questions WHERE exam_id=$1 ORDER BY sort_order ASC, id ASC`,
      [examR.rows[0].id]
    );
    return res.json({ ok: true, exam: examR.rows[0], questions: qR.rows.map(q => ({ id: q.id, question_text: q.question_text, choices_json: q.choices_json, sort_order: q.sort_order })) });
  } catch (e) {
    console.error('GET partner exam error:', e);
    return res.status(500).json({ error: 'โหลดข้อสอบไม่สำเร็จ' });
  }
});

app.post('/partner/academy/:application_code/exam/submit', async (req, res) => {
  const answers = (req.body && typeof req.body.answers === 'object' && !Array.isArray(req.body.answers)) ? req.body.answers : {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const appRow = await getPartnerApplicationByCode(req.params.application_code, client);
    if (!appRow) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'ไม่พบใบสมัคร' });
    }

    const completeR = await client.query(`
      SELECT COUNT(l.id)::int AS total, COUNT(p.id) FILTER (WHERE COALESCE(p.completed,FALSE))::int AS completed
      FROM public.academy_courses c
      JOIN public.academy_lessons l ON l.course_id=c.id AND l.is_active=TRUE
      LEFT JOIN public.academy_progress p ON p.lesson_id=l.id AND p.application_id=$1
      WHERE c.course_code='cwf_basic_partner'`, [appRow.id]);
    const totalLessons = Number(completeR.rows[0]?.total || 0);
    const completedLessons = Number(completeR.rows[0]?.completed || 0);
    if (totalLessons > 0 && completedLessons < totalLessons) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'ต้องดูบทเรียนให้ครบก่อนส่งข้อสอบ', total_lessons: totalLessons, completed_lessons: completedLessons });
    }
    const examR = await client.query(
      `SELECT e.* FROM public.academy_exams e JOIN public.academy_courses c ON c.id=e.course_id WHERE c.course_code='cwf_basic_partner' AND e.is_active=TRUE ORDER BY e.id DESC LIMIT 1`
    );
    if (!examR.rows.length) throw new Error('ไม่พบข้อสอบ');
    const questions = await client.query(`SELECT id, correct_choice_index FROM public.academy_exam_questions WHERE exam_id=$1`, [examR.rows[0].id]);
    const total = questions.rows.length;
    const correct = questions.rows.reduce((sum, q) => sum + (Number(answers[String(q.id)]) === Number(q.correct_choice_index) ? 1 : 0), 0);
    const score = total ? Math.round((correct / total) * 10000) / 100 : 0;
    const passed = score >= Number(examR.rows[0].passing_score_percent || 80);
    const saved = await client.query(
      `INSERT INTO public.academy_exam_attempts(application_id, exam_id, answers_json, score_percent, passed, submitted_at)
       VALUES($1,$2,$3::jsonb,$4,$5,NOW())
       RETURNING *`,
      [appRow.id, examR.rows[0].id, JSON.stringify(answers), score, passed]
    );
    await client.query(
      `INSERT INTO public.technician_certifications(application_id, technician_username, certification_code, status, updated_by, updated_at)
       VALUES($1,$2,'cwf_basic_partner',$3,'exam',NOW())
       ON CONFLICT(application_id, certification_code) DO UPDATE SET status=EXCLUDED.status, updated_by='exam', updated_at=NOW()`,
      [appRow.id, appRow.technician_username || null, passed ? 'exam_passed' : 'exam_failed']
    );
    await logPartnerOnboardingEvent(client, {
      application_id: appRow.id,
      actor_type: 'applicant',
      event_type: 'exam_submitted',
      note: `${score}% ${passed ? 'passed' : 'failed'}`,
      metadata: { attempt_id: saved.rows[0].id, passed, score },
    });
    await client.query('COMMIT');
    notifyPartnerApplicant(appRow.id, 'partner_exam_submitted', partnerNotifyTextApplicant(
      passed ? 'สอบผ่าน Basic Partner แล้ว' : 'สอบยังไม่ผ่าน',
      [`คะแนน: ${score}%`, passed ? 'รอแอดมินตรวจและอนุมัติขั้นถัดไป' : 'สามารถทบทวนบทเรียนและสอบใหม่ตามเงื่อนไข', partnerAppUrl('/partner-dashboard.html')]
    ), client).catch(()=>{});
    if (passed) {
      notifyPartnerAdmins('partner_exam_passed', [
        '🎓 พาร์ทเนอร์สอบผ่าน Basic Partner',
        `ชื่อ: ${appRow.full_name || '-'}`,
        `คะแนน: ${score}%`,
        `รหัส: ${appRow.application_code || '-'}`,
        partnerAppUrl('/admin-partner-onboarding.html')
      ].join('\n'), appRow.id).catch(()=>{});
    }
    return res.json({ ok: true, attempt: saved.rows[0], passed });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST exam submit error:', e);
    return res.status(500).json({ error: e.message || 'ส่งข้อสอบไม่สำเร็จ' });
  } finally {
    client.release();
  }
});

app.get('/admin/partners/applications/:id/agreement', requireAdminSession, async (req, res) => {
  try {
    const appRow = await getPartnerApplicationById(req.params.id);
    if (!appRow) return res.status(404).json({ error: 'ไม่พบใบสมัคร' });
    const tpl = await pool.query(
      `SELECT id, template_code, version, title, source_note, content_html, body_text
       FROM public.agreement_templates
       WHERE template_code='partner_standard' AND is_active=TRUE
       ORDER BY version DESC LIMIT 1`
    );
    const template = tpl.rows[0] || null;
    const contract_ready = isPartnerAgreementTemplateReady(template);
    const sig = await pool.query(
      `SELECT s.id, s.template_version, s.signer_full_name, s.signature_template_title, s.signature_template_source_note, (s.signature_snapshot_html IS NOT NULL) AS has_snapshot, s.signed_ip, s.signed_user_agent, s.signed_at, t.template_code, t.title, t.source_note
       FROM public.agreement_signatures s
       JOIN public.agreement_templates t ON t.id=s.template_id
       WHERE s.application_id=$1
       ORDER BY s.signed_at DESC`,
      [appRow.id]
    );
    return res.json({
      ok: true,
      signatures: sig.rows,
      template: template ? { id: template.id, template_code: template.template_code, version: template.version, title: template.title, source_note: template.source_note } : null,
      contract_ready,
      contract_ready_message: contract_ready ? '' : partnerAgreementReadinessMessage(template),
    });
  } catch (e) {
    console.error('GET admin agreement error:', e);
    return res.status(500).json({ error: 'โหลดสถานะสัญญาไม่สำเร็จ' });
  }
});

app.get('/admin/partners/applications/:id/academy', requireAdminSession, async (req, res) => {
  try {
    const appRow = await getPartnerApplicationById(req.params.id);
    if (!appRow) return res.status(404).json({ error: 'ไม่พบใบสมัคร' });
    const r = await pool.query(
      `SELECT c.course_code, c.title, COUNT(l.id)::int AS lesson_count,
              COUNT(p.lesson_id) FILTER (WHERE p.completed=TRUE)::int AS completed_count
       FROM public.academy_courses c
       LEFT JOIN public.academy_lessons l ON l.course_id=c.id AND l.is_active=TRUE
       LEFT JOIN public.academy_progress p ON p.lesson_id=l.id AND p.application_id=$1
       WHERE c.course_code='cwf_basic_partner'
       GROUP BY c.id`,
      [appRow.id]
    );
    return res.json({ ok: true, academy: r.rows[0] || null });
  } catch (e) {
    console.error('GET admin academy error:', e);
    return res.status(500).json({ error: 'โหลด Academy ไม่สำเร็จ' });
  }
});

app.get('/admin/partners/applications/:id/exams', requireAdminSession, async (req, res) => {
  try {
    const appRow = await getPartnerApplicationById(req.params.id);
    if (!appRow) return res.status(404).json({ error: 'ไม่พบใบสมัคร' });
    const r = await pool.query(
      `SELECT a.*, e.exam_code, e.title FROM public.academy_exam_attempts a JOIN public.academy_exams e ON e.id=a.exam_id WHERE a.application_id=$1 ORDER BY a.submitted_at DESC`,
      [appRow.id]
    );
    return res.json({ ok: true, attempts: r.rows });
  } catch (e) {
    console.error('GET admin exams error:', e);
    return res.status(500).json({ error: 'โหลดผลสอบไม่สำเร็จ' });
  }
});

app.get('/admin/partners/applications/:id/certifications', requireAdminSession, async (req, res) => {
  try {
    const appRow = await getPartnerApplicationById(req.params.id);
    if (!appRow) return res.status(404).json({ error: 'ไม่พบใบสมัคร' });
    const r = await pool.query(
      `SELECT c.certification_code, c.status, c.approved_by, c.approved_at, c.expires_at, c.admin_note, c.updated_by, c.updated_at,
              COALESCE(p.enabled,FALSE) AS preference_enabled
       FROM public.technician_certifications c
       LEFT JOIN public.technician_certification_preferences p
         ON p.technician_username=c.technician_username AND p.certification_code=c.certification_code
       WHERE c.application_id=$1
       ORDER BY c.certification_code ASC`,
      [appRow.id]
    );
    const map = new Map((r.rows || []).map(x => [x.certification_code, x]));
    return res.json({ ok: true, certifications: PARTNER_CERTIFICATION_CODES.map(code => map.get(code) || { certification_code: code, status: 'not_started' }) });
  } catch (e) {
    console.error('GET admin certifications error:', e);
    return res.status(500).json({ error: 'โหลด Certification ไม่สำเร็จ' });
  }
});

app.put('/admin/partners/applications/:id/certifications/:certification_code/status', requireAdminSession, async (req, res) => {
  const appId = Number(req.params.id);
  const code = String(req.params.certification_code || '').trim();
  const status = String(req.body?.status || '').trim();
  const admin_note = req.body?.admin_note == null ? null : String(req.body.admin_note || '').trim();
  if (!PARTNER_CERTIFICATION_CODES.includes(code)) return res.status(400).json({ error: 'certification_code ไม่ถูกต้อง' });
  if (!PARTNER_CERTIFICATION_STATUSES.has(status)) return res.status(400).json({ error: 'status ไม่ถูกต้อง' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const appRow = await getPartnerApplicationById(appId, client);
    if (!appRow) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'ไม่พบใบสมัคร' });
    }
    const actor = req.actor?.username || req.auth?.username || null;
    const saved = await client.query(
      `INSERT INTO public.technician_certifications(application_id, technician_username, certification_code, status, admin_note, approved_by, approved_at, updated_by, updated_at)
       VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $4='approved' THEN NOW() ELSE NULL END,$6,NOW())
       ON CONFLICT(application_id, certification_code) DO UPDATE SET
         technician_username=EXCLUDED.technician_username,
         status=EXCLUDED.status,
         admin_note=EXCLUDED.admin_note,
         approved_by=CASE WHEN EXCLUDED.status='approved' THEN EXCLUDED.approved_by ELSE public.technician_certifications.approved_by END,
         approved_at=CASE WHEN EXCLUDED.status='approved' THEN NOW() ELSE public.technician_certifications.approved_at END,
         updated_by=EXCLUDED.updated_by,
         updated_at=NOW()
       RETURNING *`,
      [appRow.id, appRow.technician_username || null, code, status, admin_note, actor]
    );
    await logPartnerOnboardingEvent(client, {
      application_id: appRow.id,
      actor_type: 'admin',
      actor_username: actor,
      event_type: 'certification_status_changed',
      to_status: status,
      note: `${code}: ${admin_note || ''}`.trim(),
      metadata: { certification_code: code },
    });
    if (['suspended', 'revoked'].includes(status) && appRow.technician_username) {
      await client.query(
        `INSERT INTO public.technician_certification_preferences(technician_username, certification_code, enabled, updated_at)
         VALUES($1,$2,FALSE,NOW())
         ON CONFLICT(technician_username, certification_code) DO UPDATE SET enabled=FALSE, updated_at=NOW()`,
        [appRow.technician_username, code]
      );
    }
    await client.query('COMMIT');
    notifyPartnerApplicant(appRow.id, 'partner_certification_updated', partnerNotifyTextApplicant(
      status === 'approved' ? 'คุณได้รับอนุมัติสิทธิ์รับงานแล้ว' : 'มีการอัปเดตสถานะ certification',
      [
        `ประเภท: ${code}`,
        `สถานะ: ${status}`,
        admin_note ? `หมายเหตุ: ${admin_note}` : '',
        partnerAppUrl('/partner-dashboard.html')
      ].filter(Boolean)
    ), client).catch(()=>{});
    await auditLog(req, { action: 'PARTNER_CERTIFICATION_STATUS_UPDATE', target_username: appRow.application_code, target_role: 'partner_application', meta: { certification_code: code, status, admin_note } });
    return res.json({ ok: true, certification: saved.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('PUT certification status error:', e);
    return res.status(500).json({ error: 'อัปเดต Certification ไม่สำเร็จ' });
  } finally {
    client.release();
  }
});

app.post('/admin/partners/certification-dry-run', requireAdminSession, async (req, res) => {
  try {
    const technicianUsername = String(req.body?.technician_username || '').trim();
    const requiredCodes = getRequiredCertificationCodesForJob(req.body || {});
    const check = await technicianHasRequiredCertifications(technicianUsername, requiredCodes, { partnerOnly: false });
    return res.json({
      ok: true,
      mode: getCertificationEnforcementMode(),
      technician_username: technicianUsername,
      required_certifications: requiredCodes,
      ...check,
      block_reason: check.ok ? null : explainCertificationBlockReason(requiredCodes, check.missing || []),
    });
  } catch (e) {
    console.error('POST certification dry-run error:', e);
    return res.status(500).json({ error: 'ตรวจ certification dry-run ไม่สำเร็จ' });
  }
});

app.post('/admin/partners/eligible-dry-run', requireAdminSession, async (req, res) => {
  try {
    const requiredCodes = getRequiredCertificationCodesForJob(req.body || {});
    const zone = String(req.body?.zone || req.body?.province || '').trim();
    const r = await pool.query(
      `SELECT a.id, a.application_code, a.full_name, a.phone, a.technician_username, a.province, a.district,
              a.service_zones, a.max_jobs_per_day, a.max_units_per_day,
              COALESCE(av.paused, TRUE) AS paused,
              COALESCE(av.working_days, '[]'::jsonb) AS working_days,
              COALESCE(av.time_windows, '[]'::jsonb) AS time_windows,
              COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                'code', c.certification_code,
                'status', c.status,
                'preference_enabled', COALESCE(pref.enabled,FALSE)
              )) FILTER (WHERE c.certification_code IS NOT NULL), '[]'::jsonb) AS certifications
       FROM public.partner_applications a
       LEFT JOIN public.partner_availability_preferences av ON av.technician_username=a.technician_username
       LEFT JOIN public.technician_certifications c ON c.application_id=a.id
       LEFT JOIN public.technician_certification_preferences pref
         ON pref.technician_username=a.technician_username AND pref.certification_code=c.certification_code
       WHERE a.technician_username IS NOT NULL
       GROUP BY a.id, av.paused, av.working_days, av.time_windows
       ORDER BY a.created_at DESC
       LIMIT 200`
    );
    const rows = r.rows.map(row => {
      const certs = Array.isArray(row.certifications) ? row.certifications : [];
      const missing = requiredCodes.filter(code => !certs.some(c => c.code === code && c.status === 'approved'));
      const preferenceOff = requiredCodes.filter(code => !certs.some(c => c.code === code && c.preference_enabled === true));
      const zones = Array.isArray(row.service_zones) ? row.service_zones : [];
      const zoneMatch = !zone || zones.some(z => String(z).includes(zone)) || String(row.province || '').includes(zone) || String(row.district || '').includes(zone);
      return {
        ...row,
        required_certifications: requiredCodes,
        checks: {
          certification_approved: missing.length === 0,
          preference_on: preferenceOff.length === 0,
          availability_on: row.paused !== true,
          zone_match: zoneMatch,
        },
        missing_certifications: missing,
        preferences_off: preferenceOff,
        eligible: missing.length === 0 && preferenceOff.length === 0 && row.paused !== true && zoneMatch,
      };
    });
    return res.json({ ok: true, mode: getCertificationEnforcementMode(), required_certifications: requiredCodes, partners: rows });
  } catch (e) {
    console.error('POST eligible dry-run error:', e);
    return res.status(500).json({ error: 'ตรวจรายชื่อพาร์ทเนอร์ที่เหมาะสมไม่สำเร็จ' });
  }
});


app.get('/admin/partners/applications/:id/interview', requireAdminSession, async (req, res) => {
  try {
    const appRow = await getPartnerApplicationById(req.params.id);
    if (!appRow) return res.status(404).json({ error: 'ไม่พบใบสมัคร' });
    const r = await pool.query(
      `SELECT * FROM public.partner_interviews WHERE application_id=$1 ORDER BY interviewed_at DESC, id DESC LIMIT 1`,
      [appRow.id]
    );
    return res.json({ ok: true, interview: r.rows[0] || null });
  } catch (e) {
    console.error('GET partner interview error:', e);
    return res.status(500).json({ error: 'โหลดข้อมูลสัมภาษณ์ไม่สำเร็จ' });
  }
});

app.put('/admin/partners/applications/:id/interview', requireAdminSession, async (req, res) => {
  const appId = Number(req.params.id);
  if (!Number.isFinite(appId) || appId <= 0) return res.status(400).json({ error: 'id ไม่ถูกต้อง' });
  const call_status = String(req.body?.call_status || 'contacted').trim();
  const result = String(req.body?.result || 'follow_up').trim();
  const allowedCall = new Set(['not_called','no_answer','contacted','follow_up','passed','failed']);
  const allowedResult = new Set(['passed','failed','follow_up']);
  if (!allowedCall.has(call_status)) return res.status(400).json({ error: 'call_status ไม่ถูกต้อง' });
  if (!allowedResult.has(result)) return res.status(400).json({ error: 'result ไม่ถูกต้อง' });
  const score = (v) => Math.max(0, Math.min(5, Number(v || 0)));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const appRow = await getPartnerApplicationById(appId, client);
    if (!appRow) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'ไม่พบใบสมัคร' });
    }
    const actor = req.actor?.username || req.auth?.username || null;
    const admin_note = String(req.body?.admin_note || '').trim();
    const saved = await client.query(
      `INSERT INTO public.partner_interviews
        (application_id, interviewer_username, call_status, attitude_score, experience_score, communication_score, tool_readiness_score, availability_score, result, admin_note, next_follow_up_at, interviewed_at, updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
       RETURNING *`,
      [
        appRow.id,
        actor,
        call_status,
        score(req.body?.attitude_score),
        score(req.body?.experience_score),
        score(req.body?.communication_score),
        score(req.body?.tool_readiness_score),
        score(req.body?.availability_score),
        result,
        admin_note || null,
        req.body?.next_follow_up_at ? new Date(req.body.next_follow_up_at) : null,
      ]
    );
    await logPartnerOnboardingEvent(client, {
      application_id: appRow.id,
      actor_type: 'admin',
      actor_username: actor,
      event_type: 'interview_saved',
      to_status: result,
      note: admin_note || `interview ${result}`,
      metadata: { interview_id: saved.rows[0].id, call_status },
    });
    await client.query('COMMIT');
    notifyPartnerApplicant(appRow.id, 'partner_interview_saved', partnerNotifyTextApplicant(
      result === 'passed' ? 'สัมภาษณ์ผ่านแล้ว' : result === 'failed' ? 'ผลสัมภาษณ์ยังไม่ผ่าน' : 'มีการบันทึกผลสัมภาษณ์',
      [
        `สถานะ: ${call_status}`,
        `ผล: ${result}`,
        admin_note ? `หมายเหตุ: ${admin_note}` : '',
        partnerAppUrl('/partner-dashboard.html')
      ].filter(Boolean)
    ), client).catch(()=>{});
    await auditLog(req, {
      action: 'PARTNER_INTERVIEW_SAVED',
      target_username: appRow.application_code,
      target_role: 'partner_application',
      meta: { application_id: appRow.id, interview_id: saved.rows[0].id, result, call_status },
    });
    return res.json({ ok: true, interview: saved.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('PUT partner interview error:', e);
    return res.status(500).json({ error: 'บันทึกสัมภาษณ์ไม่สำเร็จ' });
  } finally {
    client.release();
  }
});


app.post('/admin/partners/applications/:id/trial-jobs', requireAdminSession, async (req, res) => {
  const appId = Number(req.params.id);
  const certification_code = String(req.body?.certification_code || '').trim();
  const job_id = req.body?.job_id == null || String(req.body.job_id).trim() === '' ? null : Number(req.body.job_id);
  if (!PARTNER_CERTIFICATION_CODES.includes(certification_code)) return res.status(400).json({ error: 'certification_code ไม่ถูกต้อง' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const appRow = await getPartnerApplicationById(appId, client);
    if (!appRow) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'ไม่พบใบสมัคร' });
    }
    const actor = req.actor?.username || req.auth?.username || null;
    const saved = await client.query(
      `INSERT INTO public.partner_trial_jobs(application_id, technician_username, certification_code, job_id, status, admin_note, created_by)
       VALUES($1,$2,$3,$4,'unlocked',$5,$6)
       RETURNING *`,
      [appRow.id, appRow.technician_username || null, certification_code, Number.isFinite(job_id) ? job_id : null, req.body?.admin_note || null, actor]
    );
    await client.query(
      `INSERT INTO public.technician_certifications(application_id, technician_username, certification_code, status, updated_by, updated_at)
       VALUES($1,$2,$3,'trial_unlocked',$4,NOW())
       ON CONFLICT(application_id, certification_code) DO UPDATE SET status='trial_unlocked', updated_by=$4, updated_at=NOW()`,
      [appRow.id, appRow.technician_username || null, certification_code, actor]
    );
    await logPartnerOnboardingEvent(client, { application_id: appRow.id, actor_type: 'admin', actor_username: actor, event_type: 'trial_unlocked', to_status: 'trial_unlocked', note: certification_code, metadata: { trial_job_id: saved.rows[0].id } });
    await client.query('COMMIT');
    notifyPartnerApplicant(appRow.id, 'partner_trial_unlocked', partnerNotifyTextApplicant(
      'แอดมินปลดล็อกงานทดลองให้แล้ว',
      [`ประเภท: ${certification_code}`, req.body?.admin_note ? `หมายเหตุ: ${req.body.admin_note}` : '', partnerAppUrl('/partner-dashboard.html')].filter(Boolean)
    ), client).catch(()=>{});
    await auditLog(req, { action: 'PARTNER_TRIAL_UNLOCKED', target_username: appRow.application_code, target_role: 'partner_application', meta: { certification_code, trial_job_id: saved.rows[0].id } });
    return res.json({ ok: true, trial_job: saved.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST trial job error:', e);
    return res.status(500).json({ error: 'ปลดล็อก Trial ไม่สำเร็จ' });
  } finally {
    client.release();
  }
});

app.get('/admin/partners/applications/:id/trial-jobs', requireAdminSession, async (req, res) => {
  try {
    const appRow = await getPartnerApplicationById(req.params.id);
    if (!appRow) return res.status(404).json({ error: 'ไม่พบใบสมัคร' });
    const trials = await pool.query(`SELECT * FROM public.partner_trial_jobs WHERE application_id=$1 ORDER BY created_at DESC`, [appRow.id]);
    const evals = await pool.query(`SELECT * FROM public.partner_evaluations WHERE application_id=$1 ORDER BY evaluated_at DESC`, [appRow.id]);
    return res.json({ ok: true, trial_jobs: trials.rows, evaluations: evals.rows });
  } catch (e) {
    console.error('GET trial jobs error:', e);
    return res.status(500).json({ error: 'โหลด Trial ไม่สำเร็จ' });
  }
});

app.post('/admin/partners/trial-jobs/:trial_job_id/evaluate', requireAdminSession, async (req, res) => {
  const trialId = Number(req.params.trial_job_id);
  const result = String(req.body?.result || '').trim();
  if (!Number.isFinite(trialId) || trialId <= 0) return res.status(400).json({ error: 'trial_job_id ไม่ถูกต้อง' });
  if (!PARTNER_TRIAL_RESULTS.has(result)) return res.status(400).json({ error: 'result ไม่ถูกต้อง' });
  const score = (v) => Math.max(0, Math.min(5, Number(v || 0)));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const trialR = await client.query(`SELECT * FROM public.partner_trial_jobs WHERE id=$1 FOR UPDATE`, [trialId]);
    if (!trialR.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'ไม่พบ Trial job' });
    }
    const trial = trialR.rows[0];
    const actor = req.actor?.username || req.auth?.username || null;
    const saved = await client.query(
      `INSERT INTO public.partner_evaluations
        (trial_job_id, application_id, evaluator_username, punctuality_score, uniform_score, communication_score, photo_quality_score, job_quality_score, customer_issue, admin_note, result, evaluated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
       RETURNING *`,
      [trial.id, trial.application_id, actor, score(req.body?.punctuality_score), score(req.body?.uniform_score), score(req.body?.communication_score), score(req.body?.photo_quality_score), score(req.body?.job_quality_score), !!req.body?.customer_issue, req.body?.admin_note || null, result]
    );
    await client.query(`UPDATE public.partner_trial_jobs SET status=$1, evaluated_at=NOW(), updated_at=NOW() WHERE id=$2`, [result, trial.id]);
    const approveCertification = normalizePartnerBool(req.body?.approve_certification);
    if (approveCertification && result === 'passed' && trial.technician_username) {
      await client.query(
        `INSERT INTO public.technician_certifications(application_id, technician_username, certification_code, status, admin_note, approved_by, approved_at, updated_by, updated_at)
         VALUES($1,$2,$3,'approved',$4,$5,NOW(),$5,NOW())
         ON CONFLICT(application_id, certification_code) DO UPDATE SET
           technician_username=EXCLUDED.technician_username,
           status='approved',
           admin_note=EXCLUDED.admin_note,
           approved_by=EXCLUDED.approved_by,
           approved_at=NOW(),
           updated_by=EXCLUDED.updated_by,
           updated_at=NOW()`,
        [trial.application_id, trial.technician_username, trial.certification_code, req.body?.admin_note || 'ผ่าน Trial Evaluation และอนุมัติสิทธิ์รับงาน', actor]
      );
      await client.query(
        `INSERT INTO public.technician_certification_preferences(technician_username, certification_code, enabled, updated_at)
         VALUES($1,$2,TRUE,NOW())
         ON CONFLICT(technician_username, certification_code) DO UPDATE SET enabled=TRUE, updated_at=NOW()`,
        [trial.technician_username, trial.certification_code]
      );
    }
    await logPartnerOnboardingEvent(client, { application_id: trial.application_id, actor_type: 'admin', actor_username: actor, event_type: 'trial_evaluated', to_status: result, note: req.body?.admin_note || null, metadata: { trial_job_id: trial.id, evaluation_id: saved.rows[0].id } });
    await client.query('COMMIT');
    notifyPartnerApplicant(trial.application_id, 'partner_trial_evaluated', partnerNotifyTextApplicant(
      result === 'passed' ? 'งานทดลองผ่านแล้ว' : result === 'needs_more_trial' ? 'ต้องทดลองงานเพิ่มเติม' : 'งานทดลองไม่ผ่าน',
      [
        `ประเภท: ${trial.certification_code}`,
        `ผล: ${result}`,
        approveCertification ? 'เปิดสิทธิ์รับงานประเภทนี้แล้ว' : '',
        req.body?.admin_note ? `หมายเหตุ: ${req.body.admin_note}` : '',
        partnerAppUrl('/partner-dashboard.html')
      ].filter(Boolean)
    ), client).catch(()=>{});
    await auditLog(req, { action: 'PARTNER_TRIAL_EVALUATED', target_role: 'partner_application', meta: { trial_job_id: trial.id, result } });
    return res.json({ ok: true, evaluation: saved.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST trial evaluate error:', e);
    return res.status(500).json({ error: 'บันทึกประเมิน Trial ไม่สำเร็จ' });
  } finally {
    client.release();
  }
});

// Session check for frontend guards (returns actor + effective + impersonation)
app.get('/api/auth/me', async (req, res) => {
  try {
    const ctx = await getAuthContext(req, res);
    if (!ctx.ok) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

    // annotate super admin flags (whitelist-based)
    const actor = Object.assign({}, ctx.actor, { is_super_admin: isSuperAdmin(ctx.actor?.username) });
    const effectiveIsSuper = isSuperAdmin(ctx.effective?.username);

    return res.json({
      ok: true,
      username: ctx.effective.username,
      role: ctx.effective.role,
      actor,
      impersonating: ctx.impersonating,
      is_super_admin: effectiveIsSuper
    });
  } catch (e) {
    console.error('/api/auth/me error:', e);
    return res.status(500).json({ ok: false, error: 'AUTH_FAILED' });
  }
});

// Logout endpoint (clears cookies + deletes session)
app.post('/api/logout', async (req, res) => {
  try {
    const token = parseCwfSessionToken(req);
    if (token) {
      await pool.query('DELETE FROM public.auth_sessions WHERE session_token=$1', [token]);
    }
  } catch (_) {}
  clearAuthCookies(res);
  return res.json({ ok: true });
});
// Protect ALL /admin/* endpoints with server-side session validation
// (prevents bypassing by faking x-user-role header)
app.use("/admin", requireAdminSession);

// Protect Admin HTML pages (static files) as well
// NOTE: This does not touch UI; only blocks access when not logged in.
app.get(/^\/admin-[^\s]+\.html$/i, requireAdminSession, (req, res, next) => next());


// =======================================
// 📊 ADMIN DASHBOARD V2 (Phase 3)
// - Personal revenue/commission (created_by_admin OR approved_by_admin)
// - Company revenue series (day/week/month/year) + pending/active jobs
// =======================================
app.get("/admin/dashboard_v2", requireAdminSession, async (req, res) => {
  // NOTE: Endpoint must be resilient. Even if some queries fail, return a stable JSON shape
  // so the dashboard UI never renders blank.
  try {
    const me = req.auth;
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();

    const safeFrom = /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null;
    const safeTo = /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : null;

    const softErrors = [];
    async function safeQuery(sql, params = [], fallbackRows = []) {
      try {
        return await pool.query(sql, params);
      } catch (e) {
        softErrors.push(String(e?.message || e));
        return { rows: fallbackRows };
      }
    }

    // default: last 30 days
    // IMPORTANT: Postgres parameters must be contiguous ($1..$n). Referencing $2/$3 without $1
    // throws: "could not determine data type of parameter $1" (42P18).
    const rangeSql = `
      WITH bounds AS (
        SELECT 
          COALESCE($1::date, (CURRENT_DATE - INTERVAL '29 days')::date) AS d_from,
          COALESCE($2::date, CURRENT_DATE::date) AS d_to
      )
      SELECT d_from, d_to FROM bounds
    `;
    const b = await pool.query(rangeSql, [safeFrom, safeTo]);
    const d_from = b.rows[0].d_from;
    const d_to = b.rows[0].d_to;

    const debug = { partial: false, notes: [] };

    let meInfo = { username: me.username, role: me.role, full_name: "", photo_url: "", commission_rate_percent: 0 };
    try {
      const meRow = await pool.query(
        `SELECT username, role, COALESCE(full_name,'') AS full_name, COALESCE(photo_url,'') AS photo_url,
                COALESCE(commission_rate_percent,0) AS commission_rate_percent
         FROM public.users WHERE username=$1 LIMIT 1`,
        [me.username]
      );
      if (meRow.rows && meRow.rows[0]) meInfo = meRow.rows[0];
    } catch (e) {
      debug.partial = true;
      debug.notes.push('users query failed');
    }

    let pRow = { job_count: 0, revenue_total: 0 };
    try {
      const personal = await pool.query(
        `WITH gross AS (
           SELECT j.job_id,
                  COALESCE(NULLIF(SUM(COALESCE(ji.line_total,0)),0), COALESCE(j.job_price,0), 0)::double precision AS gross_total
           FROM public.jobs j
           LEFT JOIN public.job_items ji ON CAST(ji.job_id AS TEXT)=CAST(j.job_id AS TEXT)
           WHERE (j.created_by_admin=$1 OR j.approved_by_admin=$1)
             AND (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date BETWEEN $2::date AND $3::date
             AND COALESCE(j.job_status,'') NOT IN ('ยกเลิก','cancelled','canceled')
           GROUP BY j.job_id, j.job_price
         )
         SELECT COUNT(*)::int AS job_count,
                COALESCE(SUM(gross_total),0)::double precision AS revenue_total
         FROM gross`,
        [me.username, d_from, d_to]
      );
      if (personal.rows && personal.rows[0]) pRow = personal.rows[0];
    } catch (e) {
      debug.partial = true;
      debug.notes.push('personal stats gross query failed');
    }
    const commissionRate = Number(meInfo.commission_rate_percent || 0);
    const commissionTotal = (Number(pRow.revenue_total || 0) * commissionRate) / 100;

    let cRow = { job_count: 0, revenue_total: 0 };
    try {
      const company = await pool.query(
        `WITH gross AS (
           SELECT j.job_id,
                  COALESCE(NULLIF(SUM(COALESCE(ji.line_total,0)),0), COALESCE(j.job_price,0), 0)::double precision AS gross_total
           FROM public.jobs j
           LEFT JOIN public.job_items ji ON CAST(ji.job_id AS TEXT)=CAST(j.job_id AS TEXT)
           WHERE (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date BETWEEN $1::date AND $2::date
             AND COALESCE(j.job_status,'') NOT IN ('ยกเลิก','cancelled','canceled')
           GROUP BY j.job_id, j.job_price
         )
         SELECT COUNT(*)::int AS job_count,
                COALESCE(SUM(gross_total),0)::double precision AS revenue_total
         FROM gross`,
        [d_from, d_to]
      );
      if (company.rows && company.rows[0]) cRow = company.rows[0];
    } catch (e) {
      debug.partial = true;
      debug.notes.push('company gross stats query failed');
    }

    // Dashboard profit must be calculated from the current CWF contract engine, not from
    // technician_payout_lines. payout_lines is a cache and may contain old/incorrect rows
    // (for example premium wash 900 showing partner cost 850, leaving only 50 profit).
    // Correct definition:
    //   revenue_total = full selling price of sold jobs
    //   technician_cost_total = fresh technician payout from contract rules
    //   net_profit_total = revenue_total - technician_cost_total (VAT not included)
    // NOTE: cost is calculated for all non-cancelled sold jobs in range, not only finished jobs.
    let technicianCostTotal = 0;
    try {
      const costJobs = await pool.query(
        `SELECT job_id
         FROM public.jobs
         WHERE (appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date BETWEEN $1::date AND $2::date
           AND COALESCE(job_status,'') NOT IN ('ยกเลิก','cancelled','canceled')
         ORDER BY appointment_datetime ASC
         LIMIT 5000`,
        [d_from, d_to]
      );
      for (const row of (costJobs.rows || [])) {
        try {
          // Dashboard shows management profit for sold jobs in the selected range.
          // It must subtract the technician contract cost even before payout rows are generated.
          const lines = await _buildPayoutLinesForJob(row.job_id, { includeUnfinished: true });
          technicianCostTotal += (lines || []).reduce((sum, ln) => sum + Number(ln.earn_amount || 0), 0);
        } catch (lineErr) {
          debug.partial = true;
          debug.notes.push(`technician cost live skip job ${row.job_id}: ${lineErr?.message || lineErr}`);
        }
      }
    } catch (e) {
      debug.partial = true;
      debug.notes.push('technician cost live query failed');
      technicianCostTotal = 0;
    }
    const companyNetProfitTotal = Number(cRow.revenue_total || 0) - Number(technicianCostTotal || 0);

    let pending = { rows: [] };
    try {
      pending = await pool.query(
        `SELECT job_id, booking_code, customer_name, job_type, appointment_datetime, job_status, duration_min, job_price
         FROM public.jobs
         WHERE COALESCE(job_status,'') IN ('รอตรวจสอบ','pending_review')
         ORDER BY appointment_datetime ASC
         LIMIT 12`
      );
    } catch (e) {
      debug.partial = true;
      debug.notes.push('pending list query failed');
    }

    let active = { rows: [] };
    try {
      active = await pool.query(
        `SELECT job_id, booking_code, customer_name, job_type, appointment_datetime, job_status, duration_min, job_price
         FROM public.jobs
         WHERE COALESCE(job_status,'') IN ('รอดำเนินการ','กำลังทำ','ตีกลับ','รอช่างยืนยัน','งานแก้ไข')
         ORDER BY appointment_datetime ASC
         LIMIT 12`
      );
    } catch (e) {
      debug.partial = true;
      debug.notes.push('active list query failed');
    }

    let counts = { rows: [{ today: 0, month: 0, year: 0 }] };
    try {
      counts = await pool.query(
        `WITH now_bkk AS (
           SELECT (NOW() AT TIME ZONE 'Asia/Bangkok')::date AS today,
                  DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Bangkok'))::date AS m0,
                  DATE_TRUNC('year', (NOW() AT TIME ZONE 'Asia/Bangkok'))::date AS y0
         )
         SELECT
           (SELECT COUNT(*) FROM public.jobs j, now_bkk n WHERE (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date = n.today)::int AS today,
           (SELECT COUNT(*) FROM public.jobs j, now_bkk n WHERE (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date >= n.m0)::int AS month,
           (SELECT COUNT(*) FROM public.jobs j, now_bkk n WHERE (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date >= n.y0)::int AS year`
      );
    } catch (e) {
      debug.partial = true;
      debug.notes.push('counts query failed');
    }

    // Technician readiness snapshot for Dashboard UI.
    // Backward-compatible: if technician_profiles columns are missing/old, the dashboard still loads with zero stats.
    let techStats = {
      all: { open: 0, closed: 0, total: 0 },
      company: { open: 0, closed: 0, total: 0 },
      partner: { open: 0, closed: 0, total: 0 }
    };
    try {
      const tq = await pool.query(
        `SELECT
           CASE WHEN LOWER(COALESCE(p.employment_type,'company')) IN ('partner','พาร์ทเนอร์') THEN 'partner' ELSE 'company' END AS tech_type,
           CASE WHEN LOWER(COALESCE(p.accept_status,'ready')) IN ('ready','open','available','รับงาน') THEN 'open' ELSE 'closed' END AS bucket,
           COUNT(*)::int AS count
         FROM public.users u
         LEFT JOIN public.technician_profiles p ON p.username = u.username
         WHERE u.role='technician'
         GROUP BY 1,2`
      );
      for (const r of (tq.rows || [])) {
        const type = (r.tech_type === 'partner') ? 'partner' : 'company';
        const bucket = (r.bucket === 'open') ? 'open' : 'closed';
        const n = Number(r.count || 0);
        techStats[type][bucket] += n;
        techStats[type].total += n;
        techStats.all[bucket] += n;
        techStats.all.total += n;
      }
    } catch (e) {
      debug.partial = true;
      debug.notes.push('tech stats query failed');
    }

    // Status donut (bucketed)
    let statusRows = { rows: [] };
    try {
      statusRows = await pool.query(
      `SELECT COALESCE(job_status,'') AS status, COUNT(*)::int AS count
       FROM public.jobs
       WHERE (appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date BETWEEN $1::date AND $2::date
         AND COALESCE(job_status,'') NOT IN ('ยกเลิก','cancelled','canceled')
       GROUP BY 1`,
      [d_from, d_to]
      );
    } catch (e) {
      debug.partial = true;
      debug.notes.push('donut status query failed');
    }

    const STATUS_BUCKETS = {
      pending: new Set(['รอตรวจสอบ','pending_review']),
      active: new Set(['รอดำเนินการ','กำลังทำ','ตีกลับ','รอช่างยืนยัน','งานแก้ไข']),
      // NOTE: backend จริงใช้หลายคำ (กัน "งานหาย")
      done: new Set(['เสร็จแล้ว','เสร็จสิ้น','ปิดงาน','completed','done']),
    };
    const donut = { pending: 0, active: 0, done: 0, other: 0, total: 0 };
    for (const r of (statusRows.rows||[])){
      const st = String(r.status||'').trim();
      const n = Number(r.count||0);
      donut.total += n;
      if (STATUS_BUCKETS.pending.has(st)) donut.pending += n;
      else if (STATUS_BUCKETS.active.has(st)) donut.active += n;
      else if (STATUS_BUCKETS.done.has(st)) donut.done += n;
      else donut.other += n;
    }

    // Candlestick (daily OHLC from job_price)
    let ohlcQ = { rows: [] };
    try {
      ohlcQ = await pool.query(
      `WITH base AS (
         SELECT
           (DATE_TRUNC('day', j.appointment_datetime AT TIME ZONE 'Asia/Bangkok'))::date AS d,
           j.appointment_datetime AT TIME ZONE 'Asia/Bangkok' AS t,
           COALESCE(NULLIF(SUM(COALESCE(ji.line_total,0)),0), COALESCE(j.job_price,0), 0)::double precision AS p
         FROM public.jobs j
         LEFT JOIN public.job_items ji ON CAST(ji.job_id AS TEXT)=CAST(j.job_id AS TEXT)
         WHERE (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date BETWEEN $1::date AND $2::date
           AND COALESCE(j.job_status,'') NOT IN ('ยกเลิก','cancelled','canceled')
         GROUP BY j.job_id, j.appointment_datetime, j.job_price
       )
       SELECT
         d,
         MIN(p)::double precision AS low,
         MAX(p)::double precision AS high,
         (ARRAY_AGG(p ORDER BY t ASC))[1]::double precision AS open,
         (ARRAY_AGG(p ORDER BY t ASC))[ARRAY_LENGTH(ARRAY_AGG(p ORDER BY t ASC),1)]::double precision AS close,
         SUM(p)::double precision AS total,
         COUNT(*)::int AS count
       FROM base
       GROUP BY d
       ORDER BY d ASC`,
      [d_from, d_to]
      );
    } catch (e) {
      debug.partial = true;
      debug.notes.push('candles query failed');
    }
    const candles = (ohlcQ.rows||[]).map(x=>{
      const d = new Date(x.d);
      return {
        date: String(x.d),
        label: d.toLocaleDateString('th-TH',{month:'2-digit',day:'2-digit'}),
        open: Number(x.open||0),
        high: Number(x.high||0),
        low: Number(x.low||0),
        close: Number(x.close||0),
        total: Number(x.total||0),
        count: Number(x.count||0),
      };
    });

    async function series(kind){
      const map = {
        day:  "DATE_TRUNC('day', appointment_datetime AT TIME ZONE 'Asia/Bangkok')",
        week: "DATE_TRUNC('week', appointment_datetime AT TIME ZONE 'Asia/Bangkok')",
        month: "DATE_TRUNC('month', appointment_datetime AT TIME ZONE 'Asia/Bangkok')",
        year: "DATE_TRUNC('year', appointment_datetime AT TIME ZONE 'Asia/Bangkok')",
      };
      const trunc = map[kind] || map.day;
      try {
        const r = await pool.query(
        `WITH gross AS (
           SELECT j.job_id,
                  ${trunc.replace('appointment_datetime', 'j.appointment_datetime')} AS bucket,
                  COALESCE(NULLIF(SUM(COALESCE(ji.line_total,0)),0), COALESCE(j.job_price,0), 0)::double precision AS gross_total
           FROM public.jobs j
           LEFT JOIN public.job_items ji ON CAST(ji.job_id AS TEXT)=CAST(j.job_id AS TEXT)
           WHERE (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date BETWEEN $1::date AND $2::date
             AND COALESCE(j.job_status,'') NOT IN ('ยกเลิก','cancelled','canceled')
           GROUP BY j.job_id, j.appointment_datetime, j.job_price
         )
         SELECT bucket,
                COALESCE(SUM(gross_total),0)::double precision AS total
         FROM gross
         GROUP BY 1
         ORDER BY 1 ASC`,
        [d_from, d_to]
        );
        return (r.rows||[]).map(x=>{
        const d = new Date(x.bucket);
        const label = kind==='day'
          ? d.toLocaleDateString('th-TH',{month:'2-digit',day:'2-digit'})
          : kind==='week'
            ? d.toLocaleDateString('th-TH',{month:'2-digit',day:'2-digit'})
            : kind==='month'
              ? d.toLocaleDateString('th-TH',{year:'2-digit',month:'2-digit'})
              : d.toLocaleDateString('th-TH',{year:'2-digit'});
        return { label, total: Number(x.total||0) };
        });
      } catch (e) {
        debug.partial = true;
        debug.notes.push(`series(${kind}) query failed`);
        return [];
      }
    }

    const payload = {
      api_version: 2,
      me: meInfo,
      range: { from: d_from, to: d_to },
      personal: { job_count: pRow.job_count, revenue_total: Number(pRow.revenue_total||0), commission_total: commissionTotal },
      company: {
        job_count: cRow.job_count,
        revenue_total: Number(cRow.revenue_total||0),
        technician_cost_total: technicianCostTotal,
        net_profit_total: companyNetProfitTotal,
        series: {
          day: await series('day'),
          week: await series('week'),
          month: await series('month'),
          year: await series('year')
        },
        donut,
        candles
      },
      pending: { count: (pending.rows||[]).length, rows: pending.rows||[] },
      active: { rows: active.rows||[] },
      counts: counts.rows[0] || { today: 0, month: 0, year: 0 },
      tech_stats: techStats,
      debug
    };
    res.set('Cache-Control', 'no-store');
    return res.json(payload);
  } catch (e) {
    console.error('dashboard_v2 error', e);
    return res.status(500).json({ error: 'โหลด Dashboard ไม่สำเร็จ' });
  }
});

// =======================================
// 👤 ADMIN PROFILE V2 (Phase 3)
// =======================================
app.get("/admin/profile_v2/me", requireAdminSession, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT username, role, COALESCE(full_name,'') AS full_name, COALESCE(photo_url,'') AS photo_url,
              COALESCE(commission_rate_percent,0) AS commission_rate_percent
       FROM public.users WHERE username=$1 LIMIT 1`,
      [req.auth.username]
    );
    return res.json({ me: r.rows[0] || { username: req.auth.username, role: req.auth.role, full_name: '', photo_url: '', commission_rate_percent: 0 } });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'โหลดโปรไฟล์ไม่สำเร็จ' });
  }
});

app.put("/admin/profile_v2/me", requireAdminSession, async (req, res) => {
  try {
    const full_name = String(req.body?.full_name || '').trim();
    await pool.query(`UPDATE public.users SET full_name=$1 WHERE username=$2`, [full_name, req.auth.username]);
    const r = await pool.query(
      `SELECT username, role, COALESCE(full_name,'') AS full_name, COALESCE(photo_url,'') AS photo_url,
              COALESCE(commission_rate_percent,0) AS commission_rate_percent
       FROM public.users WHERE username=$1 LIMIT 1`,
      [req.auth.username]
    );
    return res.json({ me: r.rows[0] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'บันทึกชื่อไม่สำเร็จ' });
  }
});

app.post("/admin/profile_v2/me/photo", requireAdminSession, upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "ไม่พบไฟล์รูป" });
    const ext = (req.file.mimetype || '').includes('png') ? 'png' : 'jpg';
    const filename = `admin_${req.auth.username}_${Date.now()}.${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(filepath, req.file.buffer);
    const photo_url = `/uploads/${filename}`;
    await pool.query(`UPDATE public.users SET photo_url=$1 WHERE username=$2`, [photo_url, req.auth.username]);
    const r = await pool.query(
      `SELECT username, role, COALESCE(full_name,'') AS full_name, COALESCE(photo_url,'') AS photo_url,
              COALESCE(commission_rate_percent,0) AS commission_rate_percent
       FROM public.users WHERE username=$1 LIMIT 1`,
      [req.auth.username]
    );
    return res.json({ me: r.rows[0] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'อัปโหลดรูปไม่สำเร็จ' });
  }
});



// =======================================
// 🛡️ ADMIN SUPER V2 (Phase 5)
// - Role: super_admin (UI label must show "Super Admin")
// - Impersonate admin/technician with audit log
// - Manage Admin IDs, commission, duration rules
// =======================================

// List users (admins/technicians)
app.get('/admin/super/users', requireSuperAdmin, async (req, res) => {
  try {
    const role = String(req.query.role || '').trim();

    let rows = [];
    // role filter: if 'super_admin' -> filter by whitelist usernames
    if (role && normalizeRole(role) === 'super_admin') {
      const all = await pool.query(
        `SELECT username, role, COALESCE(full_name,'') AS full_name, COALESCE(photo_url,'') AS photo_url, COALESCE(commission_rate_percent,0) AS commission_rate_percent
         FROM public.users ORDER BY username ASC`
      );
      rows = (all.rows || []).filter(u => isSuperAdmin(u.username));
    } else if (role) {
      const q = await pool.query(
        `SELECT username, role, COALESCE(full_name,'') AS full_name, COALESCE(photo_url,'') AS photo_url, COALESCE(commission_rate_percent,0) AS commission_rate_percent
         FROM public.users WHERE role=$1 ORDER BY username ASC`,
        [role]
      );
      rows = q.rows || [];
    } else {
      const q = await pool.query(
        `SELECT username, role, COALESCE(full_name,'') AS full_name, COALESCE(photo_url,'') AS photo_url, COALESCE(commission_rate_percent,0) AS commission_rate_percent
         FROM public.users ORDER BY role ASC, username ASC`
      );
      rows = q.rows || [];
    }

    const out = (rows || []).map(u => {
      const baseRole = normalizeRole(u.role);
      const sup = isSuperAdmin(u.username);
      return Object.assign({}, u, {
        role: baseRole,
        is_super_admin: sup,
        display_role: sup ? 'super_admin' : baseRole
      });
    });
    return res.json({ ok: true, users: out });
  } catch (e) {
    console.error('GET /admin/super/users', e);
    return res.status(500).json({ error: 'โหลดรายชื่อไม่สำเร็จ' });
  }
});

// Create Admin (admin or super_admin)
app.post('/admin/super/admins', requireSuperAdmin, async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '').trim();
    const role = 'admin'; // locked: no super_admin role in DB
    const full_name = String(req.body?.full_name || '').trim();
    if (!username || !password) return res.status(400).json({ error: 'ต้องมี username และ password' });

    await pool.query(
      `INSERT INTO public.users(username, password, role, full_name) VALUES($1,$2,$3,$4)`,
      [username, password, role, full_name]
    );

    await auditLog(req, { action: 'ADMIN_CREATE', target_username: username, target_role: role, meta: { full_name } });
    return res.json({ ok: true });
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes('duplicate') || msg.includes('unique')) return res.status(409).json({ error: 'username ซ้ำ' });
    console.error('POST /admin/super/admins', e);
    return res.status(500).json({ error: 'สร้างแอดมินไม่สำเร็จ' });
  }
});

// Update Admin (role/full_name/password/commission)
app.put('/admin/super/admins/:username', requireSuperAdmin, async (req, res) => {
  try {
    const username = String(req.params.username || '').trim();
    const role = null; // locked: no super_admin role in DB
    const full_name = (req.body?.full_name !== undefined) ? String(req.body.full_name).trim() : null;
    const password = (req.body?.password !== undefined) ? String(req.body.password).trim() : null;
    const commission = (req.body?.commission_rate_percent !== undefined) ? Number(req.body.commission_rate_percent) : null;

    const fields = [];
    const vals = [];
    let i = 1;
    // role is intentionally not updatable
    if (full_name !== null) { fields.push(`full_name=$${i++}`); vals.push(full_name); }
    if (password !== null && password !== '') { fields.push(`password=$${i++}`); vals.push(password); }
    if (commission !== null && Number.isFinite(commission)) { fields.push(`commission_rate_percent=$${i++}`); vals.push(commission); }

    if (!fields.length) return res.json({ ok: true });
    vals.push(username);
    await pool.query(`UPDATE public.users SET ${fields.join(', ')} WHERE username=$${i}`, vals);

    await auditLog(req, { action: 'ADMIN_UPDATE', target_username: username, target_role: role || null, meta: { role, full_name, changed_password: !!password, commission_rate_percent: commission } });
    return res.json({ ok: true });
  } catch (e) {
    console.error('PUT /admin/super/admins/:username', e);
    return res.status(500).json({ error: 'อัปเดตแอดมินไม่สำเร็จ' });
  }
});

// Impersonate
app.post('/admin/super/impersonate', requireSuperAdmin, async (req, res) => {
  try {
    const target = String(req.body?.target_username || '').trim();
    if (!target) return res.status(400).json({ error: 'ต้องมี target_username' });

    const q = await pool.query(`SELECT username, role FROM public.users WHERE username=$1 LIMIT 1`, [target]);
    if ((q.rows || []).length === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    const targetRole = String(q.rows[0].role);

    // Ensure session exists (so impersonation is server-tracked)
    let token = req.session_token;
    if (!token) {
      const created = await ensureSessionForUser(res, req.actor.username);
      token = created.token;
    }

    await pool.query(
      `UPDATE public.auth_sessions
       SET impersonated_username=$1, impersonated_role=$2, impersonated_started_at=NOW(), last_seen_at=NOW()
       WHERE session_token=$3`,
      [target, targetRole, token]
    );

    await auditLog(req, { action: 'IMPERSONATE_START', target_username: target, target_role: targetRole, meta: { session_token: token } });
    return res.json({ ok: true, actor: req.actor, impersonated: { username: target, role: targetRole } });
  } catch (e) {
    console.error('POST /admin/super/impersonate', e);
    return res.status(500).json({ error: 'สวมสิทธิไม่สำเร็จ' });
  }
});

// Stop impersonation
app.post('/admin/super/impersonate/stop', requireSuperAdmin, async (req, res) => {
  try {
    const token = req.session_token;
    if (token) {
      await pool.query(
        `UPDATE public.auth_sessions
         SET impersonated_username=NULL, impersonated_role=NULL, impersonated_started_at=NULL, last_seen_at=NOW()
         WHERE session_token=$1`,
        [token]
      );
    }
    await auditLog(req, { action: 'IMPERSONATE_STOP', target_username: null, target_role: null, meta: { session_token: token || null } });
    return res.json({ ok: true, actor: req.actor });
  } catch (e) {
    console.error('POST /admin/super/impersonate/stop', e);
    return res.status(500).json({ error: 'หยุดสวมสิทธิไม่สำเร็จ' });
  }
});

// Audit log list
app.get('/admin/super/audit', requireSuperAdmin, async (req, res) => {
  try {
    const limit = Math.max(10, Math.min(500, Number(req.query.limit || 200)));
    const q = await pool.query(
      `SELECT log_id, actor_username, actor_role, action, target_role, target_username, meta_json, created_at
       FROM public.admin_audit_log
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    return res.json({ ok: true, rows: q.rows || [] });
  } catch (e) {
    console.error('GET /admin/super/audit', e);
    return res.status(500).json({ error: 'โหลด audit log ไม่สำเร็จ' });
  }
});

// Duration rules CRUD
app.get('/admin/super/durations', requireSuperAdmin, async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT service_key, duration_min, COALESCE(updated_by,'') AS updated_by, updated_at
       FROM public.service_duration_rules
       ORDER BY service_key ASC`
    );
    return res.json({ ok: true, rows: q.rows || [] });
  } catch (e) {
    console.error('GET /admin/super/durations', e);
    return res.status(500).json({ error: 'โหลด duration ไม่สำเร็จ' });
  }
});

app.post('/admin/super/durations', requireSuperAdmin, async (req, res) => {
  try {
    const service_key = String(req.body?.service_key || '').trim();
    const duration_min = Number(req.body?.duration_min);
    if (!service_key || !Number.isFinite(duration_min) || duration_min <= 0) {
      return res.status(400).json({ error: 'ข้อมูลไม่ครบ' });
    }
    await pool.query(
      `INSERT INTO public.service_duration_rules(service_key, duration_min, updated_by, updated_at)
       VALUES($1,$2,$3,NOW())
       ON CONFLICT (service_key)
       DO UPDATE SET duration_min=EXCLUDED.duration_min, updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
      [service_key, duration_min, req.actor.username]
    );
    await auditLog(req, { action: 'DURATION_UPSERT', target_username: null, target_role: null, meta: { service_key, duration_min } });
    return res.json({ ok: true });
  } catch (e) {
    console.error('POST /admin/super/durations', e);
    return res.status(500).json({ error: 'บันทึก duration ไม่สำเร็จ' });
  }
});

app.delete('/admin/super/durations/:service_key', requireSuperAdmin, async (req, res) => {
  try {
    const key = String(req.params.service_key || '').trim();
    if (!key) return res.status(400).json({ error: 'ข้อมูลไม่ครบ' });
    await pool.query('DELETE FROM public.service_duration_rules WHERE service_key=$1', [key]);
    await auditLog(req, { action: 'DURATION_DELETE', meta: { service_key: key } });
    return res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /admin/super/durations', e);
    return res.status(500).json({ error: 'ลบ duration ไม่สำเร็จ' });
  }
});

// =======================================
// 💰 Technician Income Settings (ISSUE-2/3)
// - Super Admin only
// - Defaults + Override per technician
// =======================================

function normalizeIncomeType(t) {
  const x = String(t || '').trim().toLowerCase();
  if (['company', 'partner', 'custom', 'special_only'].includes(x)) return x;
  return '';
}

async function upsertIncomeDefault(req, income_type, config) {
  await pool.query(
    `INSERT INTO public.technician_income_defaults(income_type, config_json, updated_by, updated_at)
     VALUES($1,$2,$3,NOW())
     ON CONFLICT (income_type)
     DO UPDATE SET config_json=EXCLUDED.config_json, updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
    [income_type, config || {}, req.actor.username]
  );
}

async function getIncomeDefaultsMap() {
  const q = await pool.query(`SELECT income_type, config_json FROM public.technician_income_defaults`);
  const out = {};
  (q.rows || []).forEach(r => { out[String(r.income_type)] = r.config_json || {}; });
  // ensure keys exist
  out.company = out.company || { commission_percent: 0 };
  out.partner = out.partner || { company_cut_percent: 0 };
  out.custom = out.custom || { mode: 'percent', percent: 0 };
  out.special_only = out.special_only || {};
  return out;
}

app.get('/admin/super/tech_income/defaults', requireSuperAdmin, async (req, res) => {
  try {
    const defaults = await getIncomeDefaultsMap();
    return res.json({ ok: true, defaults });
  } catch (e) {
    console.error('GET /admin/super/tech_income/defaults', e);
    return res.status(500).json({ error: 'โหลด defaults ไม่สำเร็จ' });
  }
});

app.put('/admin/super/tech_income/defaults/:income_type', requireSuperAdmin, async (req, res) => {
  try {
    const income_type = normalizeIncomeType(req.params.income_type);
    if (!income_type) return res.status(400).json({ error: 'INVALID_TYPE' });

    let config = {};
    if (income_type === 'company') {
      const commission_percent = Number(req.body?.commission_percent || 0);
      if (!Number.isFinite(commission_percent) || commission_percent < 0) return res.status(400).json({ error: 'INVALID_NUMBER' });
      config = { commission_percent };
    } else if (income_type === 'partner') {
      const company_cut_percent = Number(req.body?.company_cut_percent || 0);
      if (!Number.isFinite(company_cut_percent) || company_cut_percent < 0) return res.status(400).json({ error: 'INVALID_NUMBER' });
      config = { company_cut_percent };
    } else if (income_type === 'custom') {
      const mode = String(req.body?.mode || 'percent');
      if (mode === 'percent') {
        const percent = Number(req.body?.percent || 0);
        if (!Number.isFinite(percent) || percent < 0) return res.status(400).json({ error: 'INVALID_NUMBER' });
        config = { mode: 'percent', percent };
      } else {
        const amount = Number(req.body?.amount || 0);
        if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: 'INVALID_NUMBER' });
        config = { mode: 'fixed', amount };
      }
    } else if (income_type === 'special_only') {
      config = {};
    }

    await upsertIncomeDefault(req, income_type, config);
    await auditLog(req, { action: 'TECH_INCOME_DEFAULT_UPSERT', meta: { income_type, config } });
    return res.json({ ok: true });
  } catch (e) {
    console.error('PUT /admin/super/tech_income/defaults/:income_type', e);
    return res.status(500).json({ error: 'บันทึก defaults ไม่สำเร็จ' });
  }
});

app.get('/admin/super/tech_income/overrides', requireSuperAdmin, async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT username, income_type, config_json, updated_by, updated_at
       FROM public.technician_income_overrides
       ORDER BY username ASC`
    );
    return res.json({ ok: true, rows: q.rows || [] });
  } catch (e) {
    console.error('GET /admin/super/tech_income/overrides', e);
    return res.status(500).json({ error: 'โหลด overrides ไม่สำเร็จ' });
  }
});

app.put('/admin/super/tech_income/overrides/:username', requireSuperAdmin, async (req, res) => {
  try {
    const username = String(req.params.username || '').trim();
    const income_type = normalizeIncomeType(req.body?.income_type);
    const config = req.body?.config || {};
    if (!username || !income_type) return res.status(400).json({ error: 'INVALID_INPUT' });

    // validate target exists and is technician
    const uq = await pool.query(`SELECT username, role FROM public.users WHERE username=$1 LIMIT 1`, [username]);
    if ((uq.rows || []).length === 0) return res.status(404).json({ error: 'NOT_FOUND' });

    // minimal numeric checks (front-end already blocks)
    if (income_type === 'company') {
      const v = Number(config.commission_percent || 0);
      if (!Number.isFinite(v) || v < 0) return res.status(400).json({ error: 'INVALID_NUMBER' });
    }
    if (income_type === 'partner') {
      const v = Number(config.company_cut_percent || 0);
      if (!Number.isFinite(v) || v < 0) return res.status(400).json({ error: 'INVALID_NUMBER' });
    }
    if (income_type === 'custom') {
      const mode = String(config.mode || 'percent');
      if (mode === 'percent') {
        const v = Number(config.percent || 0);
        if (!Number.isFinite(v) || v < 0) return res.status(400).json({ error: 'INVALID_NUMBER' });
      } else {
        const v = Number(config.amount || 0);
        if (!Number.isFinite(v) || v < 0) return res.status(400).json({ error: 'INVALID_NUMBER' });
      }
    }

    await pool.query(
      `INSERT INTO public.technician_income_overrides(username, income_type, config_json, updated_by, updated_at)
       VALUES($1,$2,$3,$4,NOW())
       ON CONFLICT (username)
       DO UPDATE SET income_type=EXCLUDED.income_type, config_json=EXCLUDED.config_json, updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
      [username, income_type, config, req.actor.username]
    );
    await auditLog(req, { action: 'TECH_INCOME_OVERRIDE_UPSERT', target_username: username, meta: { income_type, config } });
    return res.json({ ok: true });
  } catch (e) {
    console.error('PUT /admin/super/tech_income/overrides/:username', e);
    return res.status(500).json({ error: 'บันทึก override ไม่สำเร็จ' });
  }
});

app.delete('/admin/super/tech_income/overrides/:username', requireSuperAdmin, async (req, res) => {
  try {
    const username = String(req.params.username || '').trim();
    if (!username) return res.status(400).json({ error: 'INVALID_INPUT' });
    await pool.query(`DELETE FROM public.technician_income_overrides WHERE username=$1`, [username]);
    await auditLog(req, { action: 'TECH_INCOME_OVERRIDE_DELETE', target_username: username });
    return res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /admin/super/tech_income/overrides/:username', e);
    return res.status(500).json({ error: 'ล้าง override ไม่สำเร็จ' });
  }
});

async function getIncomeSettingForTech(username, employment_type) {
  const ov = await pool.query(`SELECT income_type, config_json FROM public.technician_income_overrides WHERE username=$1 LIMIT 1`, [username]);
  if ((ov.rows || []).length) {
    return { income_type: normalizeIncomeType(ov.rows[0].income_type), config: ov.rows[0].config_json || {} };
  }
  // fallback to defaults based on employment_type
  const type = normalizeIncomeType(employment_type);
  const defs = await getIncomeDefaultsMap();
  return { income_type: type || 'company', config: defs[type || 'company'] || {} };
}

function inferIsServiceLine(it) {
  // Contract payroll strict service detector.
  // IMPORTANT: Old DB rows may have is_service=false even for real service lines.
  // A real service line must NEVER be treated as a special/extra item, otherwise the
  // technician receives the customer price (for example 1,400) instead of the contract rate.
  try {
    const name = String(it?.item_name || '').trim();
    if (!name) return false;
    const n = name.toLowerCase();
    const qty = Number(it?.qty || 0);
    if (/\bBTU\b/i.test(name)) return true;
    if (/\d+\s*เครื่อง/.test(name)) return true;
    if (n.includes('ล้างแอร์') || n.includes('ซ่อมแอร์') || n.includes('ติดตั้งแอร์')) return true;
    if (name.includes('ล้าง') && (name.includes('ผนัง') || name.includes('สี่ทิศ') || name.includes('แขวน') || name.includes('เปลือย') || name.includes('คอย'))) return true;
    if (/(ธรรมดา|ปกติ|normal|พรีเมียม|premium|แขวนคอย|แขวนคอยน์|แขวนคอยล์|ตัดล้าง|ล้างใหญ่|overhaul|สี่ทิศทาง|เปลือยใต้ฝ้า)/i.test(name)) return true;
    if (/•\s*\d{3,}/.test(name) && /(ธรรมดา|ปกติ|พรีเมียม|แขวน|คอย|ตัดล้าง|ล้างใหญ่|สี่ทิศ|เปลือย)/.test(name)) return true;
    if (qty > 0 && /(ล้าง|ซ่อม|ติดตั้ง|แอร์|คอยล์|คอยน์)/.test(name)) return true;
    return false;
  } catch {
    return false;
  }
}

function sumServiceLines(items) {
  // service lines = is_service true; use line_total (before discount)
  // backward-compatible: if `is_service` missing/false for all, infer from item_name.
  const arr = (items || []);
  let total = 0;
  for (const it of arr) {
    if (!it) continue;
    const isSvc = Boolean(it.is_service) || inferIsServiceLine(it);
    if (isSvc) total += Number(it.line_total || 0);
  }
  return total;
}

function sumSpecialLinesForTech(items, username) {
  // special lines = is_service false AND assigned to that tech
  let total = 0;
  for (const it of (items || [])) {
    if (!it) continue;
    if (Boolean(it.is_service) || inferIsServiceLine(it)) continue;
    const a = String(it.assigned_technician_username || '').trim();
    if (a && a === username) total += Number(it.line_total || 0);
  }
  return total;
}

async function getTeamForJob(job_id) {
  const set = new Set();
  // primary tech
  const jq = await pool.query(`SELECT technician_username FROM public.jobs WHERE job_id=$1 LIMIT 1`, [job_id]);
  if ((jq.rows || []).length && jq.rows[0].technician_username) set.add(String(jq.rows[0].technician_username));
  // team members
  const tq = await pool.query(`SELECT username FROM public.job_team_members WHERE job_id=$1`, [job_id]);
  (tq.rows || []).forEach(r => r.username && set.add(String(r.username)));
  // assignments
  const aq = await pool.query(`SELECT technician_username FROM public.job_assignments WHERE job_id=$1`, [job_id]);
  (aq.rows || []).forEach(r => r.technician_username && set.add(String(r.technician_username)));
  return Array.from(set).filter(Boolean);
}

// Reusable payout calculator (used by Super Admin preview + Technician income summary)
async function computeJobPayout(job_id) {
  // Contract-only compatibility wrapper. The old percent/cut engine is removed from runtime.
  // Any legacy caller now receives results derived from _buildPayoutLinesForJob only.
  const lines = await _buildPayoutLinesForJob(job_id);
  const team = Array.from(new Set((lines || []).map(x => String(x.technician_username || '').trim()).filter(Boolean)));
  return {
    job_id,
    note: 'contract_only: ใช้เรทบาท/เครื่องตามสัญญาเท่านั้น ไม่ใช้เปอร์เซ็นต์/ราคาขายลูกค้า',
    payout_mode: 'contract_only',
    team,
    base_service_total: (lines || []).reduce((a,x)=>a+Number(x.base_amount||0),0),
    items: [],
    payouts: (lines || []).map(x => ({
      username: x.technician_username,
      employment_type: x?.setting_snapshot?.employment_type || x?.detail_json?.technician_type || 'company',
      setting: { income_type: 'contract_only', config: { payroll_version: CWF_CONTRACT_PAYROLL_VERSION } },
      base_service: Number(x.base_amount || 0),
      service_income: Number(x.base_amount || 0),
      special_income: Number(x.detail_json?.special_income || 0),
      special_bonus: Number(x.detail_json?.special_bonus || 0),
      total_income: Number(x.earn_amount || 0),
      detail_json: x.detail_json || {},
    })),
  };
}

// =======================================
// 🧾 Technician Payout Periods (Phase 1)
// - Periods: 10 / 25 (Asia/Bangkok)
// - Lines cached in DB (idempotent)
// - Step ladder % per job per tech (rule-based)
// =======================================

function _bkkNow() {
  // Asia/Bangkok UTC+7 no DST
  const now = new Date();
  return new Date(now.getTime() + 7 * 60 * 60 * 1000);
}

// =======================================
// ✅ Done-status predicate (Bangkok production)
// - หลายหน้าฝั่ง PWA ใช้หลายคำ เช่น "เสร็จแล้ว/เสร็จสิ้น/ปิดงาน/done/completed"
// - ถ้า backend filter แค่ "เสร็จแล้ว" จะทำให้ "งานหาย" และยอดไม่ตรง
// - ใช้ predicate เดียวกันทุกที่ที่ต้องดึงงานที่ปิดแล้ว
// =======================================
function _sqlDonePredicate(alias = 'j') {
  // NOTE: ใช้ ILIKE '%เสร็จ%' เพื่อครอบคลุม "เสร็จสิ้น" "เสร็จแล้ว" และคำที่มีเสร็จอยู่
  // พร้อม fallback สำหรับคีย์อังกฤษ
  const a = String(alias || 'j');
  return `(COALESCE(${a}.job_status,'') ILIKE '%เสร็จ%' OR COALESCE(${a}.job_status,'') IN ('ปิดงาน','done','completed'))`;
}

function _bkkYmd(d) {
  const b = d || _bkkNow();
  return { y: b.getUTCFullYear(), m: b.getUTCMonth() + 1, d: b.getUTCDate() };
}

function _bangkokMidnightUTC(y, m, d) {
  // returns Date in UTC corresponding to Bangkok local midnight of y-m-d
  const utcMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - (7 * 60 * 60 * 1000);
  return new Date(utcMs);
}

function _periodBoundsBangkok(type, nowBkk) {
  const t = String(type || '').trim();
  const n = nowBkk || _bkkNow();
  const { y, m } = _bkkYmd(n);
  if (t === '10') {
    // finished_at in [prevMonth 16 00:00, thisMonth 1 00:00)
    let py = y, pm = m - 1;
    if (pm <= 0) { pm = 12; py = y - 1; }
    const start = _bangkokMidnightUTC(py, pm, 16);
    const endEx = _bangkokMidnightUTC(y, m, 1);
    return { period_type: '10', start, endEx, label_ym: `${y}-${String(m).padStart(2, '0')}` };
  }
  if (t === '25') {
    // finished_at in [thisMonth 1 00:00, thisMonth 16 00:00)
    const start = _bangkokMidnightUTC(y, m, 1);
    const endEx = _bangkokMidnightUTC(y, m, 16);
    return { period_type: '25', start, endEx, label_ym: `${y}-${String(m).padStart(2, '0')}` };
  }
  const err = new Error('INVALID_PERIOD_TYPE');
  err.code = 'INVALID_PERIOD_TYPE';
  throw err;
}


// ===== Phase 2 UX Upgrade =====
// สร้าง "งวดเสมือน" ได้แม้ยังไม่กด generate (ให้ช่างเห็นได้เลย)
// และใช้ payout_lines ถ้ามีเพื่อความเร็ว (fallback คำนวณสดเฉพาะช่วงนั้น)
function _periodBoundsForYm(type, y, m) {
  const t = String(type || '').trim();
  const yy = Number(y), mm = Number(m);
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || mm < 1 || mm > 12) {
    const err = new Error('INVALID_YM');
    err.code = 'INVALID_YM';
    throw err;
  }
  if (t === '10') {
    let py = yy, pm = mm - 1;
    if (pm <= 0) { pm = 12; py = yy - 1; }
    const start = _bangkokMidnightUTC(py, pm, 16);
    const endEx = _bangkokMidnightUTC(yy, mm, 1);
    return { period_type: '10', start, endEx, label_ym: `${yy}-${String(mm).padStart(2, '0')}` };
  }
  if (t === '25') {
    const start = _bangkokMidnightUTC(yy, mm, 1);
    const endEx = _bangkokMidnightUTC(yy, mm, 16);
    return { period_type: '25', start, endEx, label_ym: `${yy}-${String(mm).padStart(2, '0')}` };
  }
  const err = new Error('INVALID_PERIOD_TYPE');
  err.code = 'INVALID_PERIOD_TYPE';
  throw err;
}

function _parsePayoutId(payout_id) {
  const s = String(payout_id || '').trim();
  const m = /^payout_(\d{4})-(\d{2})_(10|25)$/.exec(s);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), type: String(m[3]) };
}

function _recentPeriods(countPairs = 6, nowBkk) {
  // countPairs = จำนวน "เดือน" ย้อนหลังที่เอามา (แต่ละเดือนมี 2 งวด)
  const n = nowBkk || _bkkNow();
  const { y, m } = _bkkYmd(n);

  const out = [];
  for (let i = 0; i < countPairs; i++) {
    let yy = y;
    let mm = m - i;
    while (mm <= 0) { mm += 12; yy -= 1; }
    // เดือนนี้: งวด 25 (1-15) และงวด 10 (16 เดือนก่อน - 1 เดือนนี้)
    const b25 = _periodBoundsForYm('25', yy, mm);
    const b10 = _periodBoundsForYm('10', yy, mm);
    out.push({ ...b25, payout_id: `payout_${b25.label_ym}_25` });
    out.push({ ...b10, payout_id: `payout_${b10.label_ym}_10` });
  }

  // sort ล่าสุดก่อน
  out.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
  return out;
}

// =======================================
// ✅ Technician compensation helpers
// - commission: per job (เดิม)
// - daily: daily_wage_amount * workdays
// - salary: monthly_salary_amount/2 ต่อ 1 งวด (10/25)
// =======================================
function _normCompMode(mode) {
  const m = String(mode || '').toLowerCase().trim();
  if (m === 'daily' || m === 'daily_wage' || m === 'day') return 'daily';
  if (m === 'salary' || m === 'monthly') return 'salary';
  return 'commission';
}

async function _getTechProfile(username) {
  if (!username) return null;
  try {
    const q = await pool.query(
      `SELECT username,
              COALESCE(employment_type,'company') AS employment_type,
              COALESCE(compensation_mode,'commission') AS compensation_mode,
              COALESCE(daily_wage_amount,0)::numeric AS daily_wage_amount,
              COALESCE(monthly_salary_amount,0)::numeric AS monthly_salary_amount
       FROM public.technician_profiles
       WHERE username=$1`,
      [username]
    );
    return q.rows[0] || null;
  } catch (e) {
    return null;
  }
}

async function _countWorkDays(username, startIso, endIso) {
  const q = await pool.query(
    `SELECT COUNT(*)::int AS days
     FROM (
       SELECT DISTINCT (j.finished_at AT TIME ZONE 'Asia/Bangkok')::date AS d
       FROM public.jobs j
       LEFT JOIN public.job_team_members tm ON tm.job_id=j.job_id AND tm.username=$1
       WHERE j.finished_at >= $2::timestamptz
         AND j.finished_at <  $3::timestamptz
         AND (
           tm.username IS NOT NULL
           OR j.technician_username = $1
         )
         AND (${_sqlDonePredicate('j')})
     ) x`,
    [username, startIso, endIso]
  );
  return q.rows?.[0]?.days || 0;
}

async function _listWorkDayDates(username, startIso, endIso) {
  const q = await pool.query(
    `SELECT DISTINCT (j.finished_at AT TIME ZONE 'Asia/Bangkok')::date AS d
     FROM public.jobs j
     LEFT JOIN public.job_team_members tm ON tm.job_id=j.job_id AND tm.username=$1
     WHERE j.finished_at >= $2::timestamptz
       AND j.finished_at <  $3::timestamptz
       AND (
         tm.username IS NOT NULL
         OR j.technician_username = $1
       )
       AND (${_sqlDonePredicate('j')})
     ORDER BY d ASC`,
    [username, startIso, endIso]
  );
  return (q.rows || []).map(r => {
    const d = r.d;
    if (!d) return null;
    // pg returns Date; keep yyyy-mm-dd
    const dt = new Date(d);
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }).filter(Boolean);
}

async function _buildNonCommissionLinesForPeriod({ payout_id, period_type, label_ym, start, endEx }) {
  // สร้างบรรทัดให้ช่างที่เป็น daily/salary (ผู้ช่วย) และไม่คิดรายได้ต่อ job
  const out = [];
  const tq = await pool.query(
    `SELECT u.username,
            COALESCE(p.employment_type,'company') AS employment_type,
            COALESCE(p.compensation_mode,'commission') AS compensation_mode,
            COALESCE(p.daily_wage_amount,0)::numeric AS daily_wage_amount,
            COALESCE(p.monthly_salary_amount,0)::numeric AS monthly_salary_amount
     FROM public.users u
     LEFT JOIN public.technician_profiles p ON p.username=u.username
     WHERE u.role='technician'
     ORDER BY u.username ASC`
  );

  const startIso = new Date(start).toISOString();
  const endIso = new Date(endEx).toISOString();
  const endForFinish = new Date(new Date(endEx).getTime() - 1000).toISOString();

  for (const r of (tq.rows || [])) {
    const username = String(r.username || '').trim();
    if (!username) continue;
    const cm = _normCompMode(r.compensation_mode);
    if (cm === 'commission') continue;

    if (cm === 'daily') {
      const wage = Number(r.daily_wage_amount || 0);
      if (!(wage > 0)) continue;
      const days = await _listWorkDayDates(username, startIso, endIso);
      for (const ymd of days) {
        out.push(
          _buildNonCommissionLine({
            payout_id,
            username,
            finished_at: `${ymd}T12:00:00.000Z`,
            earn_amount: wage,
            label: `ค่าแรงรายวัน (${ymd})`,
            key: ymd,
            mode: 'daily',
            snapshot: { non_commission: { mode: 'daily', daily_wage_amount: wage, counted_day: ymd } },
          })
        );
      }
    }

    if (cm === 'salary') {
      const sal = Number(r.monthly_salary_amount || 0);
      if (!(sal > 0)) continue;
      const half = sal / 2;
      const key = label_ym;
      const lbl = `เงินเดือน (${label_ym}) ${period_type === '25' ? 'งวด 25' : 'งวด 10'}`;
      out.push(
        _buildNonCommissionLine({
          payout_id,
          username,
          finished_at: endForFinish,
          earn_amount: half,
          label: lbl,
          key,
          mode: 'salary',
          snapshot: { non_commission: { mode: 'salary', monthly_salary_amount: sal, period_type } },
        })
      );
    }
  }
  return out;
}

function _pseudoJobId(prefix, key) {
  return `${String(prefix || 'X').toUpperCase()}:${key}`;
}

function _buildNonCommissionLine({ payout_id, username, finished_at, earn_amount, label, key, mode, snapshot }) {
  return {
    payout_id,
    technician_username: username,
    job_id: _pseudoJobId(mode, key),
    finished_at,
    earn_amount,
    base_amount: earn_amount,
    percent_final: null,
    machine_count_for_tech: 0,
    step_rule_key: `non_commission:${mode}`,
    detail_json: {
      kind: mode,
      label,
      job_type: null,
      ac_type: null,
      wash_variant: null,
      machine_count_total: 0,
      machine_count_for_tech: 0,
      items: [],
      mode: 'non_commission',
      how_machine_count_for_tech: 'N/A',
      how_percent_selected: 'N/A',
      how_split_applied: 'N/A',
    },
    setting_snapshot: snapshot || { non_commission: { mode } },
  };
}

async function _computeTechLinesInRange(tech, start, endEx, opts = null) {
  // คำนวณสดเฉพาะช่วงนั้น (กันช้า)
  // - commission: ดึงเฉพาะงานที่ tech เกี่ยวข้อง แล้วใช้ _buildPayoutLinesForJob
  // - daily/salary (ผู้ช่วย): สร้างบรรทัดแบบ non-commission
  const prof = await _getTechProfile(tech);
  const cm = _normCompMode(prof?.compensation_mode);
  if (cm !== 'commission') {
    const out = [];
    const startIso = start.toISOString();
    const endIso = endEx.toISOString();
    if (cm === 'daily') {
      const wage = Number(prof?.daily_wage_amount || 0);
      if (wage > 0) {
        const days = await _listWorkDayDates(tech, startIso, endIso);
        for (const ymd of days) {
          out.push(
            _buildNonCommissionLine({
              payout_id: opts?.payout_id || 'virtual',
              username: tech,
              finished_at: `${ymd}T12:00:00.000Z`,
              earn_amount: wage,
              label: `ค่าแรงรายวัน (${ymd})`,
              key: ymd,
              mode: 'daily',
              snapshot: { non_commission: { mode: 'daily', daily_wage_amount: wage, counted_day: ymd } },
            })
          );
        }
      }
    }
    if (cm === 'salary') {
      const sal = Number(prof?.monthly_salary_amount || 0);
      if (sal > 0 && opts?.period_type && opts?.label_ym) {
        const half = sal / 2;
        out.push(
          _buildNonCommissionLine({
            payout_id: opts?.payout_id || 'virtual',
            username: tech,
            finished_at: new Date(endEx.getTime() - 1000).toISOString(),
            earn_amount: half,
            label: `เงินเดือน (${opts.label_ym}) ${String(opts.period_type) === '25' ? 'งวด 25' : 'งวด 10'}`,
            key: opts.label_ym,
            mode: 'salary',
            snapshot: { non_commission: { mode: 'salary', monthly_salary_amount: sal, period_type: opts.period_type } },
          })
        );
      }
    }
    return out;
  }

  const donePred = _sqlDonePredicate('j');
  const jobsQ = await pool.query(
    `SELECT j.job_id, j.finished_at
       FROM public.jobs j
      WHERE ${donePred}
        AND j.finished_at IS NOT NULL
        AND j.finished_at >= $1 AND j.finished_at < $2
        AND (
          j.technician_username = $3
          OR EXISTS (SELECT 1 FROM public.job_team_members tm WHERE tm.job_id=j.job_id AND tm.username=$3)
          OR EXISTS (SELECT 1 FROM public.job_assignments a WHERE a.job_id=j.job_id AND a.technician_username=$3)
        )
      ORDER BY j.finished_at ASC`,
    [start.toISOString(), endEx.toISOString(), tech]
  );
  const jobs = (jobsQ.rows || []).map(r => Number(r.job_id)).filter(x => Number.isFinite(x) && x > 0);

  const lines = [];
  for (const job_id of jobs) {
    try {
      const arr = await _buildPayoutLinesForJob(job_id);
      const me = (arr || []).find(x => String(x.technician_username) === tech);
      if (me) lines.push(me);
    } catch (e) {
      continue;
    }
  }
  return lines;
}

async function _computePayoutLinesForPeriod(start, endEx, opts = {}) {
  const donePred = _sqlDonePredicate('j');
  const jobsQ = await pool.query(
    `SELECT j.job_id
       FROM public.jobs j
      WHERE ${donePred}
        AND j.finished_at IS NOT NULL
        AND j.finished_at >= $1 AND j.finished_at < $2
      ORDER BY j.finished_at ASC, j.job_id ASC`,
    [start.toISOString(), endEx.toISOString()]
  );
  const out = [];
  const errors = [];
  for (const r of (jobsQ.rows || [])) {
    const job_id = Number(r.job_id);
    if (!Number.isFinite(job_id) || job_id <= 0) continue;
    try {
      const lines = await _buildPayoutLinesForJob(job_id);
      for (const ln of (lines || [])) {
        out.push({
          ...ln,
          payout_id: opts.payout_id || ln.payout_id || 'virtual',
        });
      }
    } catch (e) {
      errors.push({ job_id: String(job_id), error: String(e?.code || e?.message || 'compute_failed') });
    }
  }
  if (opts.include_non_commission) {
    try {
      const extra = await _buildNonCommissionLinesForPeriod({
        payout_id: opts.payout_id || 'virtual',
        period_type: opts.period_type,
        label_ym: opts.label_ym,
        start,
        endEx,
      });
      out.push(...(extra || []));
    } catch (e) {
      errors.push({ job_id: null, error: String(e?.message || 'non_commission_failed') });
    }
  }
  return { lines: out, errors };
}

async function _computePayoutTechSummaryLive({ payout_id, start, endEx, period_type, label_ym }) {
  const { lines, errors } = await _computePayoutLinesForPeriod(start, endEx, {
    payout_id,
    period_type,
    label_ym,
    include_non_commission: true,
  });
  const map = new Map();
  for (const ln of (lines || [])) {
    const u = String(ln.technician_username || '').trim();
    if (!u) continue;
    if (!map.has(u)) map.set(u, { technician_username: u, gross_amount: 0, jobs_count: 0 });
    const o = map.get(u);
    o.gross_amount += Number(ln.earn_amount || 0);
    o.jobs_count += 1;
  }
  return { rows: Array.from(map.values()), lines, errors };
}

function _payoutCanUseStoredLines(status){
  return ['locked','paid'].includes(String(status || '').trim());
}

async function _loadPayoutLinesForTech({ payout_id, tech, status, start, endEx, period_type, label_ym }) {
  if (_payoutCanUseStoredLines(status)) {
    const linesQ = await pool.query(
      `SELECT line_id, job_id, finished_at, earn_amount, base_amount, percent_final, machine_count_for_tech, step_rule_key,
              detail_json
         FROM public.technician_payout_lines
        WHERE payout_id=$1 AND technician_username=$2
        ORDER BY finished_at ASC, line_id ASC`,
      [payout_id, tech]
    );
    return { source: 'stored_locked_or_paid', lines: linesQ.rows || [] };
  }
  const calc = await _computeTechLinesInRange(tech, start, endEx, { payout_id, period_type, label_ym });
  return {
    source: 'live_contract_recompute_draft',
    lines: (calc || []).map((x, idx) => ({
      line_id: -1 * (idx + 1),
      job_id: x.job_id,
      finished_at: x.finished_at,
      earn_amount: x.earn_amount,
      base_amount: x.base_amount,
      percent_final: x.percent_final,
      machine_count_for_tech: x.machine_count_for_tech,
      step_rule_key: x.step_rule_key,
      detail_json: x.detail_json,
    }))
  };
}

async function _buildPayoutTechSummaryRows(payout_id){
  const parsed = _parsePayoutId(payout_id);
  let period = await _getPayoutPeriod(payout_id);
  let bounds = null;
  if (period) {
    bounds = {
      period_type: period.period_type,
      start: new Date(period.period_start),
      endEx: new Date(period.period_end),
      label_ym: String(period.period_start || '').slice(0,7),
    };
  } else {
    if (!parsed) return { period: null, source: 'invalid', techs: [] };
    bounds = _periodBoundsForYm(parsed.type, parsed.y, parsed.m);
    period = {
      payout_id,
      status: 'draft',
      period_type: bounds.period_type,
      period_start: bounds.start.toISOString(),
      period_end: bounds.endEx.toISOString(),
    };
  }
  const status = String(period.status || 'draft');
  let baseRows = [];
  let source = 'live_contract_recompute_draft';
  if (_payoutCanUseStoredLines(status)) {
    const stored = await pool.query(
      `SELECT technician_username, COALESCE(SUM(earn_amount),0) AS gross_amount, COUNT(*)::int AS jobs_count
         FROM public.technician_payout_lines
        WHERE payout_id=$1
        GROUP BY technician_username`,
      [payout_id]
    );
    baseRows = stored.rows || [];
    source = 'stored_locked_or_paid';
  } else {
    const live = await _computePayoutTechSummaryLive({
      payout_id,
      start: bounds.start,
      endEx: bounds.endEx,
      period_type: bounds.period_type,
      label_ym: bounds.label_ym || (parsed ? `${parsed.y}-${String(parsed.m).padStart(2,'0')}` : ''),
    });
    baseRows = live.rows || [];
  }

  const out = [];
  for (const r of baseRows) {
    const tech = String(r.technician_username || '').trim();
    if (!tech) continue;
    const adjQ = await pool.query(
      `SELECT COALESCE(SUM(adj_amount),0) AS adj_total
         FROM public.technician_payout_adjustments
        WHERE payout_id=$1 AND technician_username=$2`,
      [payout_id, tech]
    );
    const payQ = await pool.query(
      `SELECT COALESCE(paid_amount,0) AS paid_amount, COALESCE(paid_status,'unpaid') AS paid_status
         FROM public.technician_payout_payments
        WHERE payout_id=$1 AND technician_username=$2
        LIMIT 1`,
      [payout_id, tech]
    );
    const gross_amount = Number(r.gross_amount || 0);
    const adj_total = Number(adjQ.rows?.[0]?.adj_total || 0);
    const paid_amount = Number(payQ.rows?.[0]?.paid_amount || 0);
    const deposit_deduction_amount = await _getDepositDeductionForPayout(payout_id, tech);
    const deposit = await _getDepositSummary(tech);
    const net_amount = _money(gross_amount + adj_total - deposit_deduction_amount);
    const paid_status = _paidStatus(net_amount, paid_amount);
    out.push({
      technician_username: tech,
      gross_amount,
      adj_total,
      deposit_deduction_amount,
      net_amount,
      paid_amount,
      paid_status,
      remaining_amount: _money(net_amount - paid_amount),
      ...deposit,
      latest_deposit_deduction: deposit_deduction_amount,
      jobs_count: Number(r.jobs_count || 0),
      source,
    });
  }
  out.sort((a,b)=> Number(b.net_amount||0)-Number(a.net_amount||0) || String(a.technician_username).localeCompare(String(b.technician_username)));
  return { period, source, techs: out };
}

function _normJobKey(s) {
  const v = String(s || '').toLowerCase();
  if (!v) return null;
  if (v.includes('ติดตั้ง') || v.includes('install')) return 'install';
  if (v.includes('ซ่อม') || v.includes('repair')) return 'repair';
  if (v.includes('ล้าง') || v.includes('wash') || v.includes('clean')) return 'wash';
  return null;
}
function _normAcKey(s) {
  const v = String(s || '').toLowerCase();
  if (!v) return null;
  if (v.includes('ผนัง') || v.includes('wall')) return 'wall';
  if (v.includes('สี่ทิศ') || v.includes('ฝังฝ้า') || v.includes('cassette') || v.includes('four') || v.includes('4')) return 'fourway';
  if (v.includes('แขวน') || v.includes('ตั้งพื้น') || v.includes('floor')) return 'hanging';
  if (v.includes('ใต้ฝ้า') || v.includes('เปลือย') || v.includes('ceiling') || v.includes('concealed')) return 'ceiling';
  return null;
}
function _normWashKey(s) {
  const v = String(s || '').toLowerCase();
  if (!v) return null;
  if (v.includes('ธรรมดา') || v.includes('normal')) return 'normal';
  if (v.includes('พรีเมียม') || v.includes('premium')) return 'premium';
  if (v.includes('แขวนคอย') || v.includes('coil')) return 'coil';
  if (v.includes('ตัดล้าง') || v.includes('overhaul') || v.includes('ใหญ่')) return 'overhaul';
  return null;
}

function _thaiLabelJob(k){
  if (k==='wash') return 'ล้าง';
  if (k==='repair') return 'ซ่อม';
  if (k==='install') return 'ติดตั้ง';
  return '';
}
function _thaiLabelAc(k){
  if (k==='wall') return 'ผนัง';
  if (k==='fourway') return 'สี่ทิศทาง';
  if (k==='hanging') return 'แขวน/ตั้งพื้น';
  if (k==='ceiling') return 'เปลือย';
  return '';
}
function _thaiLabelWash(k){
  if (k==='normal') return 'ธรรมดา';
  if (k==='premium') return 'พรีเมียม';
  if (k==='coil') return 'แขวนคอยน์';
  if (k==='overhaul') return 'ตัดล้าง';
  return '';
}


// =======================================
// 💰 CWF Contract Payroll Engine (2026)
// - Uses fixed per-machine ladder rates from the attached CWF technician contracts.
// - Replaces the old percent-based technician income calculation for completed jobs.
// =======================================
const CWF_CONTRACT_PAYROLL_VERSION = 'cwf_contract_2026_04_v10_2_contract_engine_live_draft_purge';
const CWF_CONTRACT_PAYROLL_RATES = Object.freeze({
  company: Object.freeze({
    normal:   Object.freeze({ small: [80, 70, 70, 60],    large: [100, 85, 85, 70] }),
    premium:  Object.freeze({ small: [130, 110, 110, 90],  large: [160, 140, 140, 120] }),
    coil:     Object.freeze({ small: [220, 190, 190, 160],  large: [280, 240, 240, 210] }),
    overhaul: Object.freeze({ small: [320, 280, 280, 240],  large: [400, 350, 350, 300] }),
  }),
  partner: Object.freeze({
    normal:   Object.freeze({ small: [400, 350, 350, 320],     large: [450, 400, 400, 350] }),
    premium:  Object.freeze({ small: [550, 500, 500, 450],     large: [700, 650, 650, 600] }),
    coil:     Object.freeze({ small: [850, 800, 800, 750],     large: [1050, 1000, 1000, 950] }),
    overhaul: Object.freeze({ small: [1200, 1100, 1100, 1000], large: [1450, 1350, 1350, 1250] }),
  }),
});

function _contractTechType(employmentType, incomeType){
  const it = normalizeIncomeType(incomeType);
  if (it === 'special_only') return 'special_only';
  if (it === 'partner') return 'partner';
  if (it === 'company') return 'company';
  const e = normalizeIncomeType(employmentType);
  if (e === 'special_only') return 'special_only';
  if (e === 'partner') return 'partner';
  return 'company';
}
function _contractBtuTierFromText(text){
  const v = String(text || '');
  const m = v.match(/([0-9][0-9,\.]{2,})\s*BTU/i);
  const btu = m ? Number(String(m[1]).replace(/[,]/g,'')) : 0;
  return { btu: Number.isFinite(btu) ? btu : 0, btu_tier: (Number.isFinite(btu) && btu >= 18000) ? 'large' : 'small' };
}
function _contractRateAt(techType, washKey, btuTier, machineIndex){
  const t = techType === 'partner' ? 'partner' : 'company';
  const w = ['normal','premium','coil','overhaul'].includes(washKey) ? washKey : 'normal';
  const tier = btuTier === 'large' ? 'large' : 'small';
  const arr = CWF_CONTRACT_PAYROLL_RATES[t]?.[w]?.[tier] || [];
  const idx = Math.max(1, Number(machineIndex || 1));
  return Number(arr[idx >= 4 ? 3 : idx - 1] || 0);
}
function _contractServiceKeyFromItem(it){
  const nm = String(it?.item_name || '');
  const ac_key = _normAcKey(nm) || 'wall';
  let wash_key = _normWashKey(nm);
  if (!wash_key) wash_key = 'normal';
  if (!['normal','premium','coil','overhaul'].includes(wash_key)) wash_key = 'normal';
  const { btu, btu_tier } = _contractBtuTierFromText(nm);
  return { ac_key, wash_key, btu, btu_tier, group_key: `${wash_key}|${btu_tier}` };
}

function _contractIsVagueServiceItem(it){
  const name = String(it?.item_name || '').trim();
  if (!name) return true;
  const n = name.toLowerCase();
  const hasSpecific = /(ล้างธรรมดา|ล้างปกติ|พรีเมียม|premium|แขวนคอย|แขวนคอยน์|แขวนคอยล์|ตัดล้าง|ล้างใหญ่|overhaul|BTU|เครื่อง|สี่ทิศ|เปลือย|ผนัง)/i.test(name);
  if (hasSpecific) return false;
  return /(ค่าบริการ|มาตรฐาน|override|ราคาเหมา|เหมารวม|service)/i.test(n);
}

function _contractLegacyStandardPriceSpec(amount){
  // Disabled by contract-payroll v10.
  // Customer selling prices (line_total/unit_price/final_price/etc.) must never be used
  // to infer or calculate technician income. Keep this stub only so older internal
  // references fail safely without throwing.
  void amount;
  return null;
}

function _contractInferItemFromLegacyPrice(meta, it){
  // Disabled by contract-payroll v10.
  // If old job_items are vague (ค่าบริการ/ราคาเหมา/override), the engine will infer
  // from job-level service fields only. If those are not enough, it returns no service
  // line / audit note instead of paying from customer price.
  void meta;
  void it;
  return null;
}

function _contractTopLevelItemFromPayloadLike(meta){
  const jobKey = _normJobKey(meta?.job_type);
  if (jobKey && jobKey !== 'wash') return null;
  const text = [meta?.job_type, meta?.ac_type, meta?.wash_variant, meta?.customer_note].filter(Boolean).join(' ');
  const wash_key = _normWashKey(text) || null;
  if (!wash_key) return null;
  const btu = Number(meta?.btu || 0) || (_contractBtuTierFromText(text).btu || 12000);
  const btu_tier = btu >= 18000 ? 'large' : 'small';
  const qty = Math.max(1, Math.round(Number(meta?.machine_count || 1)));
  return {
    job_item_id: null,
    item_name: `ล้างแอร์ผนัง • ${_thaiLabelWash(wash_key)} • ${btu_tier === 'large' ? 18000 : 12000} BTU • ${qty} เครื่อง`,
    qty,
    unit_price: 0,
    line_total: 0,
    assigned_technician_username: '',
    is_service: true,
    _contract_inferred_from_job_meta: true,
  };
}

function _contractNormalizeServiceItems(meta, items){
  const arr = Array.isArray(items) ? items : [];
  const service = [];
  const ignoredLegacyItems = [];
  for (const it of arr) {
    const realService = Boolean(it?.is_service) || inferIsServiceLine(it);
    if (realService && !_contractIsVagueServiceItem(it)) {
      service.push(it);
      continue;
    }

    // v10 hard rule: never infer from line_total/unit_price/customer price.
    // Keep vague legacy rows only as audit evidence, then infer from job meta below.
    if (realService || _contractIsVagueServiceItem(it)) ignoredLegacyItems.push({
      job_item_id: it?.job_item_id || null,
      item_name: String(it?.item_name || ''),
      qty: Number(it?.qty || 0),
      assigned_technician_username: String(it?.assigned_technician_username || '').trim() || null,
      ignored_reason: 'vague_legacy_item_not_used_for_income',
      ignored_legacy_fields: ['line_total','unit_price','total_price','paid_amount','final_price','special_bonus_amount','percentage','company_cut_percent','commission_percent'],
    });
  }
  if (!service.length) {
    const top = _contractTopLevelItemFromPayloadLike(meta);
    if (top) service.push(top);
  }
  return { serviceItems: service, ignoredLegacyItems };
}
function _contractMachineRates(washKey, btuTier, startIndex, qty, techType){
  const out = [];
  const n = Math.max(0, Math.round(Number(qty || 0)));
  for (let i = 0; i < n; i++) {
    const machine_index = Number(startIndex || 1) + i;
    out.push({ machine_index, rate: _contractRateAt(techType, washKey, btuTier, machine_index) });
  }
  return out;
}
function _sumContractMachineRates(washKey, btuTier, startIndex, qty, techType){
  return _contractMachineRates(washKey, btuTier, startIndex, qty, techType).reduce((a,x)=>a+Number(x.rate||0),0);
}

async function _pickStepRule({ job_type_key, ac_key, wash_key }) {
  // deterministic:
  // - match: (job_type, ac_type, wash_variant)
  // - specificity: wash > ac > job > default
  // - tie: higher priority, then rule_id
  const r = await pool.query(
    `SELECT rule_id, job_type, ac_type, wash_variant,
            step_1_percent, step_2_percent, step_3_percent, step_4p_percent,
            priority, enabled
     FROM public.technician_income_step_rules
     WHERE enabled=true
     ORDER BY priority DESC, rule_id ASC`
  );
  const rules = r.rows || [];
  const cand = [];
  for (const it of rules) {
    const rj = it.job_type ? String(it.job_type) : null;
    const ra = it.ac_type ? String(it.ac_type) : null;
    const rw = it.wash_variant ? String(it.wash_variant) : null;
    if (rj && job_type_key && rj !== job_type_key) continue;
    if (ra && ac_key && ra !== ac_key) continue;
    if (rw && wash_key && rw !== wash_key) continue;
    if (rj && !job_type_key) continue;
    if (ra && !ac_key) continue;
    if (rw && !wash_key) continue;
    const spec = (rw ? 3 : 0) + (ra ? 2 : 0) + (rj ? 1 : 0);
    cand.push({ ...it, _spec: spec });
  }
  if (!cand.length) return null;
  let best = cand[0];
  for (const c of cand) {
    if (c._spec > best._spec) best = c;
    else if (c._spec === best._spec) {
      const p1 = Number(c.priority || 0), p2 = Number(best.priority || 0);
      if (p1 > p2) best = c;
      else if (p1 === p2 && String(c.rule_id) < String(best.rule_id)) best = c;
    }
  }
  return best;
}
async function _pickTechOverrideRule({ technician_username, job_type_key, ac_key, wash_key }) {
  const tu = String(technician_username || '').trim();
  if (!tu) return null;

  const r = await pool.query(
    `SELECT override_id, technician_username, job_type, ac_type, wash_variant,
            step_1_percent, step_2_percent, step_3_percent, step_4p_percent,
            priority, enabled
       FROM public.technician_income_tech_step_overrides
      WHERE enabled=true AND technician_username=$1
      ORDER BY priority DESC, override_id ASC`,
    [tu]
  );
  const rules = r.rows || [];
  const cand = [];
  for (const it of rules) {
    const rj = it.job_type ? String(it.job_type) : null;
    const ra = it.ac_type ? String(it.ac_type) : null;
    const rw = it.wash_variant ? String(it.wash_variant) : null;
    if (rj && job_type_key && rj !== job_type_key) continue;
    if (ra && ac_key && ra !== ac_key) continue;
    if (rw && wash_key && rw !== wash_key) continue;
    if (rj && !job_type_key) continue;
    if (ra && !ac_key) continue;
    if (rw && !wash_key) continue;
    const spec = (rw ? 3 : 0) + (ra ? 2 : 0) + (rj ? 1 : 0);
    cand.push({ ...it, _spec: spec });
  }
  if (!cand.length) return null;

  let best = cand[0];
  for (const c of cand) {
    if (c._spec > best._spec) best = c;
    else if (c._spec === best._spec) {
      const p1 = Number(c.priority || 0), p2 = Number(best.priority || 0);
      if (p1 > p2) best = c;
      else if (p1 === p2 && String(c.override_id) < String(best.override_id)) best = c;
    }
  }
  return best;
}

async function _pickStepRuleForTech({ technician_username, job_type_key, ac_key, wash_key }) {
  // Priority: tech override first (more specific), then base step rules.
  try {
    const ov = await _pickTechOverrideRule({ technician_username, job_type_key, ac_key, wash_key });
    if (ov) return { ...ov, _source: 'tech_override', rule_id: `tech:${ov.override_id}` };
  } catch (e) {
    // fail-open
  }
  const base = await _pickStepRule({ job_type_key, ac_key, wash_key });
  if (!base) return null;
  return { ...base, _source: 'base_rule', rule_id: `base:${base.rule_id}` };
}



function _ladderPercent(rule, machineCount) {
  if (!rule) return null;
  const mc = Number(machineCount || 0);
  if (!Number.isFinite(mc) || mc <= 0) return null;
  if (mc >= 4) return Number(rule.step_4p_percent || 0);
  if (mc === 3) return Number(rule.step_3_percent || 0);
  if (mc === 2) return Number(rule.step_2_percent || 0);
  return Number(rule.step_1_percent || 0);
}

async function _loadJobMeta(job_id){
  const r = await pool.query(
    `SELECT *
     FROM public.jobs
     WHERE job_id=$1 LIMIT 1`,
    [job_id]
  );
  return r.rows[0] || null;
}

async function _buildPayoutLinesForJob(job_id, opts = {}){
  const meta = await _loadJobMeta(job_id);
  const includeUnfinished = Boolean(opts && opts.includeUnfinished);
  if (!meta || (!meta.finished_at && !includeUnfinished)) return [];

  const itemsQ = await pool.query(
    `SELECT job_item_id, item_name, qty, unit_price, line_total,
            COALESCE(assigned_technician_username,'') AS assigned_technician_username,
            COALESCE(is_service,false) AS is_service
       FROM public.job_items
      WHERE job_id=$1
      ORDER BY job_item_id ASC`,
    [job_id]
  );
  const items = itemsQ.rows || [];
  // Contract-only rebuild: never pay customer selling price as technician income.
  // Convert legacy/generic rows (e.g. 1,400 "ค่าบริการ") into service specs first.
  const { serviceItems: svcItems, ignoredLegacyItems } = _contractNormalizeServiceItems(meta, items);
  // Old special income is intentionally disabled here. Manual bonuses/หักเงิน must be entered
  // only via technician_payout_adjustments, never via job_items.line_total or job_assignments.special_bonus_amount.
  const specialItems = [];

  const team = await getTeamForJob(job_id);
  for (const it of svcItems) {
    const assignedTech = String(it.assigned_technician_username || '').trim();
    if (assignedTech && !team.includes(assignedTech)) team.push(assignedTech);
  }
  if (!team.length) {
    const err = new Error('EMPTY_TEAM');
    err.code = 'EMPTY_TEAM';
    throw err;
  }

  const profQ = await pool.query(
    `SELECT username,
            COALESCE(employment_type,'company') AS employment_type,
            COALESCE(compensation_mode,'commission') AS compensation_mode
       FROM public.technician_profiles
      WHERE username = ANY($1::text[])`,
    [team]
  );
  const profileMap = new Map();
  (profQ.rows || []).forEach(r => profileMap.set(String(r.username), r));

  // V9 hard reset: ignore legacy job_assignments.special_bonus_amount.
  // This column belongs to the old income system and can leak old top-ups into technician income
  // (example: company 220 + old 130 = 350, partner 850 + old 550 = 1,400).
  // Manual extra pay must be recorded as technician_payout_adjustments after payout generation.
  const bonusMap = new Map();

  const assignedSvc = svcItems.filter(it => String(it.assigned_technician_username || '').trim());
  const unassignedSvc = svcItems.filter(it => !String(it.assigned_technician_username || '').trim());
  const hasAssigned = assignedSvc.length > 0;
  const mode = (!hasAssigned && team.length > 1) ? 'coop_equal' : (hasAssigned && unassignedSvc.length ? 'mixed' : 'assigned');

  const relatedByTech = new Map(team.map(u => [u, []]));
  const contractRowsByTech = new Map(team.map(u => [u, []]));
  const serviceAmountByTech = new Map(team.map(u => [u, 0]));
  const machineCountByTech = new Map(team.map(u => [u, 0]));

  const addAmount = (tech, amount) => serviceAmountByTech.set(tech, Number(serviceAmountByTech.get(tech) || 0) + Number(amount || 0));
  const addMachine = (tech, qty) => machineCountByTech.set(tech, Number(machineCountByTech.get(tech) || 0) + Number(qty || 0));
  const addRelated = (tech, obj) => {
    if (!relatedByTech.has(tech)) relatedByTech.set(tech, []);
    relatedByTech.get(tech).push(obj);
  };
  const addRateRows = (tech, rows) => {
    if (!contractRowsByTech.has(tech)) contractRowsByTech.set(tech, []);
    contractRowsByTech.get(tech).push(...rows);
  };
  const techTypeOf = (tech) => {
    const prof = profileMap.get(String(tech)) || {};
    return _contractTechType(prof.employment_type, prof.compensation_mode);
  };

  const cursor = new Map();
  const nextStartIndex = (tech, groupKey, qty) => {
    const key = `${tech}|${groupKey}`;
    const start = Number(cursor.get(key) || 0) + 1;
    cursor.set(key, Number(cursor.get(key) || 0) + Math.max(0, Math.round(Number(qty || 0))));
    return start;
  };

  function applyWholeItemToTech(it, tech, reason){
    const qty = Math.max(0, Math.round(Number(it.qty || 0)));
    if (!qty || !tech) return;
    const spec = _contractServiceKeyFromItem(it);
    const techType = techTypeOf(tech);
    if (techType === 'special_only') return;
    const startIdx = nextStartIndex(tech, spec.group_key, qty);
    const rates = _contractMachineRates(spec.wash_key, spec.btu_tier, startIdx, qty, techType);
    const amount = rates.reduce((a, x) => a + Number(x.rate || 0), 0);
    addAmount(tech, amount);
    addMachine(tech, qty);
    addRelated(tech, {
      job_item_id: it.job_item_id,
      item_name: it.item_name,
      qty,
      line_total: Number(it.line_total || 0),
      assigned_technician_username: String(it.assigned_technician_username || '').trim() || null,
      contract_reason: reason,
    });
    addRateRows(tech, rates.map(x => ({
      item_name: it.item_name,
      wash_key: spec.wash_key,
      wash_label: _thaiLabelWash(spec.wash_key) || spec.wash_key,
      btu_tier: spec.btu_tier,
      btu: spec.btu || null,
      tech_type: techType,
      machine_index: x.machine_index,
      rate: Number(x.rate || 0),
      share: 1,
      paid_rate: Number(x.rate || 0),
      reason,
    })));
  }

  function applySharedItemToTeam(it, reason){
    const qty = Math.max(0, Math.round(Number(it.qty || 0)));
    if (!qty || !team.length) return;
    const spec = _contractServiceKeyFromItem(it);
    const divisor = team.length;
    for (const tech of team) {
      const techType = techTypeOf(tech);
      if (techType === 'special_only') continue;
      const startIdx = nextStartIndex(tech, spec.group_key, qty);
      const rates = _contractMachineRates(spec.wash_key, spec.btu_tier, startIdx, qty, techType);
      const amount = rates.reduce((a, x) => a + (Number(x.rate || 0) / divisor), 0);
      addAmount(tech, amount);
      addMachine(tech, qty / divisor);
      addRelated(tech, {
        job_item_id: it.job_item_id,
        item_name: it.item_name,
        qty: qty / divisor,
        original_qty: qty,
        line_total: Number(it.line_total || 0),
        assigned_technician_username: null,
        contract_reason: reason,
      });
      addRateRows(tech, rates.map(x => ({
        item_name: it.item_name,
        wash_key: spec.wash_key,
        wash_label: _thaiLabelWash(spec.wash_key) || spec.wash_key,
        btu_tier: spec.btu_tier,
        btu: spec.btu || null,
        tech_type: techType,
        machine_index: x.machine_index,
        rate: Number(x.rate || 0),
        share: 1 / divisor,
        paid_rate: Number(x.rate || 0) / divisor,
        reason,
      })));
    }
  }

  for (const it of assignedSvc) {
    const tech = String(it.assigned_technician_username || '').trim();
    if (!team.includes(tech)) team.push(tech);
    applyWholeItemToTech(it, tech, 'assigned_item');
  }
  for (const it of unassignedSvc) {
    if (team.length === 1) applyWholeItemToTech(it, team[0], 'single_or_unassigned_item');
    else applySharedItemToTeam(it, hasAssigned ? 'mixed_unassigned_shared' : 'coop_equal_shared');
  }

  const specialByTech = new Map(team.map(u => [u, 0]));
  // Contract-only rebuild: do not convert legacy job_items line_total into technician income.
  // This is the root fix for the 1,400 customer-price leak.
  void specialItems;

  const totalMachine = svcItems.reduce((a, it) => a + Math.max(0, Number(it.qty || 0)), 0);
  const lines = [];
  for (const tech of team) {
    const prof = profileMap.get(String(tech)) || {};
    const cm = _normCompMode(prof.compensation_mode);
    if (cm !== 'commission') continue;

    const techType = techTypeOf(tech);
    if (techType === 'special_only') continue;

    const base_amount = Number(serviceAmountByTech.get(tech) || 0);
    const special_income = Number(specialByTech.get(tech) || 0);
    const special_bonus = 0; // V9: assignment bonus disabled; use payout adjustments only
    const earn_amount = base_amount + special_income + special_bonus;
    const machine_count_for_tech = Number(machineCountByTech.get(tech) || 0);
    const rateRows = contractRowsByTech.get(tech) || [];
    const related_items = relatedByTech.get(tech) || [];

    if (Math.abs(earn_amount) < 0.0001 && !rateRows.length) continue;

    const detail_json = {
      payroll_version: CWF_CONTRACT_PAYROLL_VERSION,
      contract_only: true,
      job_type: _thaiLabelJob(_normJobKey(meta.job_type)) || String(meta.job_type || '').trim(),
      job_type_key: _normJobKey(meta.job_type),
      ac_type: '',
      ac_type_key: null,
      wash_variant: rateRows.length ? Array.from(new Set(rateRows.map(r => r.wash_label).filter(Boolean))).join(' + ') : '',
      wash_variant_key: rateRows.length ? Array.from(new Set(rateRows.map(r => r.wash_key).filter(Boolean))).join('+') : null,
      machine_count_total: totalMachine,
      machine_count_for_tech,
      mode,
      split_mode: mode,
      technician_type: techType,
      how_machine_count_for_tech: mode === 'assigned'
        ? 'คิดเฉพาะรายการที่ assign ให้ช่าง หรือรายการที่ไม่มี assign ในงานช่างเดี่ยว'
        : 'รายการที่ไม่ assign ในงานทีมถูกหารเท่ากันตามจำนวนช่างในทีม',
      how_percent_selected: 'ไม่ใช้เปอร์เซ็นต์แล้ว: ใช้เรทบาท/เครื่องตามสัญญา CWF 2026 เท่านั้น',
      how_split_applied: mode === 'mixed'
        ? 'รายการที่ assign คิดเต็มให้เจ้าของรายการ + รายการไม่ assign หารเท่ากัน'
        : (mode === 'coop_equal' ? 'ไม่มี assign รายการ: หารเรทสัญญาเท่ากันตามทีม' : 'คิดตามรายการที่ช่างรับผิดชอบ'),
      contract_rate_rows: rateRows,
      related_items,
      ignored_legacy_items: ignoredLegacyItems || [],
      ignored_legacy_fields: ['line_total','unit_price','total_price','paid_amount','final_price','special_bonus_amount','percentage','company_cut_percent','commission_percent'],
      rate_source: 'contract',
      audit_note: rateRows.length ? 'คำนวณจากเรทสัญญาเท่านั้น' : 'ต้องตรวจสอบ: ไม่พบ service line ที่ infer ได้จากข้อมูลใบงานโดยไม่ใช้ราคาขายลูกค้า',
      items: related_items,
      base_service_total: svcItems.reduce((a, it) => a + Number(it.line_total || 0), 0),
      base_amount,
      contract_service_income: base_amount,
      service_income_engine: 0,
      service_income_after_step: base_amount,
      special_income,
      special_bonus,
      total_income: earn_amount,
    };

    const setting_snapshot = {
      payroll_version: CWF_CONTRACT_PAYROLL_VERSION,
      contract_only: true,
      old_percent_defaults_ignored: true,
      employment_type: String(prof.employment_type || 'company'),
      technician_type: techType,
      machine_count_for_tech,
      computed_at: new Date().toISOString(),
      contract_rates: rateRows,
    };

    lines.push({
      technician_username: tech,
      job_id: String(job_id),
      finished_at: meta.finished_at,
      earn_amount,
      base_amount,
      percent_final: null,
      machine_count_for_tech,
      step_rule_key: `contract:${techType}`,
      detail_json,
      setting_snapshot,
    });
  }

  return lines;
}

// =======================================
// 🔒 Phase 5 Guard: prevent retroactive payout changes
// - If a job's finished_at falls inside a locked/paid payout period,
//   disallow edits that would change income. Use adjustment instead.
// =======================================
async function _findLockedOrPaidPeriodByFinishedAt(client, finishedAtIso){
  if (!finishedAtIso) return null;
  const r = await client.query(
    `SELECT payout_id, status, period_start, period_end
       FROM public.technician_payout_periods
      WHERE status IN ('locked','paid')
        AND $1::timestamptz >= period_start
        AND $1::timestamptz <  period_end
      ORDER BY period_start DESC
      LIMIT 1`,
    [finishedAtIso]
  );
  return r.rows[0] || null;
}

async function _assertJobMutableForPayout(client, job_id, ctx){
  const jr = await client.query(`SELECT job_id, finished_at FROM public.jobs WHERE job_id=$1 LIMIT 1`, [job_id]);
  const j = jr.rows[0];
  if (!j || !j.finished_at) return; // not finished => not in any payout window
  const period = await _findLockedOrPaidPeriodByFinishedAt(client, j.finished_at);
  if (!period) return;
  const msg = `งาน #${job_id} อยู่ในงวดที่ล็อก/จ่ายแล้ว (${period.payout_id}) แก้ย้อนหลังไม่ได้ ให้ใช้ Adjustment ในงวดแทน`;
  const err = new Error(msg);
  err.statusCode = 409;
  err.payout_id = period.payout_id;
  try { console.warn('[payout_freeze] blocked', { job_id, payout_id: period.payout_id, status: period.status, ctx }); } catch {}
  throw err;
}

app.get('/admin/super/tech_income/calc/job/:job_id', requireSuperAdmin, async (req, res) => {
  try {
    const job_id = Number(req.params.job_id);
    if (!Number.isFinite(job_id) || job_id <= 0) return res.status(400).json({ error: 'INVALID_JOB' });

    const lines = await _buildPayoutLinesForJob(job_id);
    const gross_amount = (lines || []).reduce((a, it) => a + Number(it.earn_amount || 0), 0);
    return res.json({
      ok: true,
      job_id,
      payroll_version: CWF_CONTRACT_PAYROLL_VERSION,
      note: 'ใช้เรทบาท/เครื่องแบบขั้นบันไดตามสัญญา CWF 2026 (ไม่ใช้เปอร์เซ็นต์รายได้เดิม)',
      gross_amount,
      lines,
    });
  } catch (e) {
    console.error('GET /admin/super/tech_income/calc/job/:job_id', e);
    if (String(e.code || '') === 'EMPTY_TEAM') return res.status(409).json({ error: 'EMPTY_TEAM' });
    return res.status(500).json({ error: 'คำนวณไม่สำเร็จ' });
  }
});

// =======================================
// 🪜 Step Ladder Rules (Super Admin) - Phase 1
// =======================================

app.get('/admin/super/income_step_rules', requireSuperAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT rule_id, scope_type, job_type, ac_type, wash_variant,
              step_1_percent, step_2_percent, step_3_percent, step_4p_percent,
              priority, enabled, updated_at, updated_by
       FROM public.technician_income_step_rules
       ORDER BY enabled DESC, priority DESC, rule_id ASC`
    );
    return res.json({ ok: true, rules: r.rows || [] });
  } catch (e) {
    console.error('GET /admin/super/income_step_rules', e);
    return res.status(500).json({ ok: false, error: 'LOAD_FAILED' });
  }
});

app.post('/admin/super/income_step_rules/upsert', requireSuperAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const rule_id = String(b.rule_id || '').trim() || null;
    if (!rule_id) return res.status(400).json({ ok: false, error: 'MISSING_RULE_ID' });

    // accept Thai or key; normalize to keys in DB
    const job_type = _normJobKey(b.job_type) || (String(b.job_type||'').trim() || null);
    const ac_type = _normAcKey(b.ac_type) || (String(b.ac_type||'').trim() || null);
    const wash_variant = _normWashKey(b.wash_variant) || (String(b.wash_variant||'').trim() || null);

    const scope_type = String(b.scope_type || 'combined').trim();
    const step_1_percent = Number(b.step_1_percent || 0);
    const step_2_percent = Number(b.step_2_percent || 0);
    const step_3_percent = Number(b.step_3_percent || 0);
    const step_4p_percent = Number(b.step_4p_percent || 0);
    const priority = Number.isFinite(Number(b.priority)) ? Number(b.priority) : 0;
    const enabled = (b.enabled === false || String(b.enabled||'').toLowerCase()==='false') ? false : true;

    await pool.query(
      `INSERT INTO public.technician_income_step_rules(
         rule_id, scope_type, job_type, ac_type, wash_variant,
         step_1_percent, step_2_percent, step_3_percent, step_4p_percent,
         priority, enabled, updated_at, updated_by
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),$12)
       ON CONFLICT (rule_id) DO UPDATE SET
         scope_type=EXCLUDED.scope_type,
         job_type=EXCLUDED.job_type,
         ac_type=EXCLUDED.ac_type,
         wash_variant=EXCLUDED.wash_variant,
         step_1_percent=EXCLUDED.step_1_percent,
         step_2_percent=EXCLUDED.step_2_percent,
         step_3_percent=EXCLUDED.step_3_percent,
         step_4p_percent=EXCLUDED.step_4p_percent,
         priority=EXCLUDED.priority,
         enabled=EXCLUDED.enabled,
         updated_at=NOW(),
         updated_by=EXCLUDED.updated_by`,
      [
        rule_id,
        scope_type,
        job_type,
        ac_type,
        wash_variant,
        step_1_percent,
        step_2_percent,
        step_3_percent,
        step_4p_percent,
        priority,
        enabled,
        req.actor?.username || null,
      ]
    );

    return res.json({ ok: true, rule_id });
  } catch (e) {
    console.error('POST /admin/super/income_step_rules/upsert', e);
    return res.status(500).json({ ok: false, error: 'UPSERT_FAILED' });
  }
});

app.get('/admin/super/income_step_overrides', requireSuperAdmin, async (req, res) => {
  try{
    const q = await pool.query(
      `SELECT override_id, technician_username, job_type, ac_type, wash_variant,
              step_1_percent, step_2_percent, step_3_percent, step_4p_percent,
              priority, enabled, updated_at, updated_by
         FROM public.technician_income_tech_step_overrides
        ORDER BY technician_username ASC, priority DESC, override_id ASC`
    );
    res.json({ ok:true, overrides: q.rows || [] });
  }catch(e){
    console.error('GET /admin/super/income_step_overrides', e);
    res.status(500).json({ ok:false, error: e.message || String(e) });
  }
});

app.post('/admin/super/income_step_overrides/upsert', requireSuperAdmin, async (req, res) => {
  try{
    const b = req.body || {};
    const override_id = String(b.override_id || '').trim();
    const technician_username = String(b.technician_username || '').trim();
    if (!override_id) return res.status(400).json({ ok:false, error:'missing override_id' });
    if (!technician_username) return res.status(400).json({ ok:false, error:'missing technician_username' });

    const payload = {
      override_id,
      technician_username,
      scope_type: String(b.scope_type || 'combined'),
      job_type: (b.job_type == null ? null : String(b.job_type || '').trim() || null),
      ac_type: (b.ac_type == null ? null : String(b.ac_type || '').trim() || null),
      wash_variant: (b.wash_variant == null ? null : String(b.wash_variant || '').trim() || null),
      step_1_percent: Number(b.step_1_percent || 0),
      step_2_percent: Number(b.step_2_percent || 0),
      step_3_percent: Number(b.step_3_percent || 0),
      step_4p_percent: Number(b.step_4p_percent || 0),
      priority: Number(b.priority || 0),
      enabled: (b.enabled === false) ? false : (String(b.enabled) !== 'false'),
      updated_by: (req.user?.username || req.headers['x-user'] || 'super')
    };

    await pool.query(
      `INSERT INTO public.technician_income_tech_step_overrides(
         override_id, technician_username, scope_type, job_type, ac_type, wash_variant,
         step_1_percent, step_2_percent, step_3_percent, step_4p_percent,
         priority, enabled, updated_at, updated_by
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),$13
       )
       ON CONFLICT (override_id) DO UPDATE SET
         technician_username=EXCLUDED.technician_username,
         scope_type=EXCLUDED.scope_type,
         job_type=EXCLUDED.job_type,
         ac_type=EXCLUDED.ac_type,
         wash_variant=EXCLUDED.wash_variant,
         step_1_percent=EXCLUDED.step_1_percent,
         step_2_percent=EXCLUDED.step_2_percent,
         step_3_percent=EXCLUDED.step_3_percent,
         step_4p_percent=EXCLUDED.step_4p_percent,
         priority=EXCLUDED.priority,
         enabled=EXCLUDED.enabled,
         updated_at=NOW(),
         updated_by=EXCLUDED.updated_by`,
      [
        payload.override_id, payload.technician_username, payload.scope_type, payload.job_type, payload.ac_type, payload.wash_variant,
        payload.step_1_percent, payload.step_2_percent, payload.step_3_percent, payload.step_4p_percent,
        payload.priority, payload.enabled, payload.updated_by
      ]
    );

    try { await auditLog(req, 'income_step_override_upsert', override_id, { technician_username }); } catch {}
    res.json({ ok:true });
  }catch(e){
    console.error('POST /admin/super/income_step_overrides/upsert', e);
    res.status(500).json({ ok:false, error: e.message || String(e) });
  }
});



// v10.1: payout line machine_count can be fractional when an unassigned team job is split equally.
// Older DBs created this column as INT, which breaks regenerate with values like 1.5.
async function _ensurePayoutLinesMachineCountNumeric(db = pool) {
  await db.query(`
    ALTER TABLE IF EXISTS public.technician_payout_lines
    ALTER COLUMN machine_count_for_tech TYPE NUMERIC(12,2)
    USING COALESCE(machine_count_for_tech, 0)::numeric
  `);
}
function _payoutMachineCountValue(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

// =======================================
// 🧾 Payout Periods (Super Admin) - Phase 1
// =======================================

app.post('/admin/super/payouts/generate', requireSuperAdmin, async (req, res) => {
  try {
    const type = String(req.query.type || '').trim();
    const bkkNow = _bkkNow();
    const { period_type, start, endEx, label_ym } = _periodBoundsBangkok(type, bkkNow);
    const payout_id = `payout_${label_ym}_${period_type}`;

    // create period if missing
    await pool.query(
      `INSERT INTO public.technician_payout_periods(payout_id, period_type, period_start, period_end, status, created_by)
       VALUES($1,$2,$3,$4,'draft',$5)
       ON CONFLICT (payout_id) DO NOTHING`,
      [payout_id, period_type, start.toISOString(), endEx.toISOString(), req.actor?.username || null]
    );

    // v10: draft payout lines are only a cache. Regenerate them from the contract engine
    // every time generate is called so old wrong 350/1400 rows cannot survive.
    const pstate = await pool.query(
      `SELECT status FROM public.technician_payout_periods WHERE payout_id=$1 LIMIT 1`,
      [payout_id]
    );
    const payoutStatus = String(pstate.rows?.[0]?.status || 'draft');
    const chk = await pool.query(
      `SELECT COUNT(*)::int AS c FROM public.technician_payout_lines WHERE payout_id=$1`,
      [payout_id]
    );
    const existing = Number(chk.rows[0]?.c || 0);
    if (existing > 0 && !_payoutCanUseStoredLines(payoutStatus)) {
      await pool.query(`DELETE FROM public.technician_payout_lines WHERE payout_id=$1`, [payout_id]);
    } else if (existing > 0) {
      return res.json({
        ok: true, payout_id, period_type, period_start: start, period_end_exclusive: endEx,
        already_generated: true, locked_or_paid: true, status: payoutStatus, lines: existing,
        note: 'งวด locked/paid แล้ว จึงไม่ regenerate แบบเงียบ ให้ใช้ adjustment หากต้องแก้ยอด'
      });
    }

    await _ensurePayoutLinesMachineCountNumeric(pool);

    // pick jobs within range
    const donePred = _sqlDonePredicate('j');
    const jobsQ = await pool.query(
      `SELECT j.job_id
         FROM public.jobs j
        WHERE ${donePred}
          AND j.finished_at IS NOT NULL
          AND j.finished_at >= $1
          AND j.finished_at < $2
        ORDER BY j.finished_at ASC`,
      [start.toISOString(), endEx.toISOString()]
    );
    const jobs = (jobsQ.rows || []).map(r => Number(r.job_id)).filter(x => Number.isFinite(x) && x > 0);

    let inserted = 0;
    for (const job_id of jobs) {
      let lines = [];
      try {
        lines = await _buildPayoutLinesForJob(job_id);
      } catch (e) {
        console.warn('[payout_generate] skip job', job_id, e.message);
        continue;
      }
      for (const ln of lines) {
        try {
          const r = await pool.query(
            `INSERT INTO public.technician_payout_lines(
               payout_id, technician_username, job_id, finished_at,
               earn_amount, base_amount, percent_final, machine_count_for_tech, step_rule_key,
               detail_json, setting_snapshot
             ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (payout_id, technician_username, job_id) DO NOTHING`,
            [
              payout_id,
              ln.technician_username,
              ln.job_id,
              ln.finished_at,
              ln.earn_amount,
              ln.base_amount,
              ln.percent_final,
              _payoutMachineCountValue(ln.machine_count_for_tech),
              ln.step_rule_key,
              ln.detail_json,
              ln.setting_snapshot,
            ]
          );
          inserted += (r.rowCount || 0);
        } catch (e) {
          console.warn('[payout_generate] insert line failed', payout_id, ln.technician_username, ln.job_id, e.message);
        }
      }
    }

    // ✅ เพิ่มบรรทัดสำหรับช่างผู้ช่วย (daily/salary) ในงวดนี้
    try {
      const extraLines = await _buildNonCommissionLinesForPeriod({ payout_id, period_type, label_ym, start, endEx });
      for (const ln of extraLines) {
        try {
          const r = await pool.query(
            `INSERT INTO public.technician_payout_lines(
               payout_id, technician_username, job_id, finished_at,
               earn_amount, base_amount, percent_final, machine_count_for_tech, step_rule_key,
               detail_json, setting_snapshot
             ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (payout_id, technician_username, job_id) DO NOTHING`,
            [
              payout_id,
              ln.technician_username,
              ln.job_id,
              ln.finished_at,
              ln.earn_amount,
              ln.base_amount,
              ln.percent_final,
              _payoutMachineCountValue(ln.machine_count_for_tech),
              ln.step_rule_key,
              ln.detail_json,
              ln.setting_snapshot,
            ]
          );
          inserted += (r.rowCount || 0);
        } catch (e) {
          console.warn('[payout_generate] insert non-commission line failed', payout_id, ln.technician_username, ln.job_id, e.message);
        }
      }
    } catch (e) {
      console.warn('[payout_generate] non-commission lines warn', e?.message || e);
    }

    return res.json({ ok: true, payout_id, period_type, period_start: start, period_end_exclusive: endEx, jobs: jobs.length, lines_inserted: inserted });
  } catch (e) {
    console.error('POST /admin/super/payouts/generate', e);
    if (String(e.code || '') === 'INVALID_PERIOD_TYPE') return res.status(400).json({ ok: false, error: 'INVALID_TYPE' });
    return res.status(500).json({ ok: false, error: 'GENERATE_FAILED' });
  }
});


async function _ensureDuePayoutPeriodsBangkok(actorUsername = null) {
  // Lazy auto-create: prepare payout periods when admin opens payout page.
  // Does not pay money, does not overwrite locked/paid periods, and is idempotent.
  const n = _bkkNow();
  const { d } = _bkkYmd(n);
  const dueTypes = [];
  if (d >= 10) dueTypes.push('10');
  if (d >= 25) dueTypes.push('25');
  const created = [];
  for (const type of dueTypes) {
    try {
      const { period_type, start, endEx, label_ym } = _periodBoundsBangkok(type, n);
      const payout_id = `payout_${label_ym}_${period_type}`;
      const r = await pool.query(
        `INSERT INTO public.technician_payout_periods(payout_id, period_type, period_start, period_end, status, created_by)
         VALUES($1,$2,$3,$4,'draft',$5)
         ON CONFLICT (payout_id) DO NOTHING`,
        [payout_id, period_type, start.toISOString(), endEx.toISOString(), actorUsername || 'system:auto_due']
      );
      if ((r.rowCount || 0) > 0) created.push(payout_id);
    } catch (e) {
      console.warn('[payout_auto_ensure] skipped', type, e?.message || e);
    }
  }
  return { created, checked_types: dueTypes };
}

async function _listPayoutPeriodsLiveAware({ limit = 24 } = {}) {
  // v10.2: draft payout_lines are disposable cache only.
  // Super Admin list must never show old 350/1400 stored rows for draft periods.
  const q = await pool.query(
    `SELECT p.payout_id, p.period_type, p.period_start, p.period_end, p.status, p.created_at, p.created_by
       FROM public.technician_payout_periods p
      ORDER BY p.period_start DESC, p.payout_id DESC
      LIMIT $1`,
    [Math.min(Math.max(Number(limit || 24), 1), 60)]
  );
  const rows = [];
  for (const p of (q.rows || [])) {
    const status = String(p.status || 'draft');
    let total_amount = 0;
    let lines_count = 0;
    let techs_count = 0;
    let source = 'live_contract_recompute_draft';
    if (_payoutCanUseStoredLines(status)) {
      const stored = await pool.query(
        `SELECT COALESCE(SUM(earn_amount),0)::numeric AS total_amount,
                COUNT(*)::int AS lines_count,
                COUNT(DISTINCT technician_username)::int AS techs_count
           FROM public.technician_payout_lines
          WHERE payout_id=$1`,
        [p.payout_id]
      );
      total_amount = Number(stored.rows?.[0]?.total_amount || 0);
      lines_count = Number(stored.rows?.[0]?.lines_count || 0);
      techs_count = Number(stored.rows?.[0]?.techs_count || 0);
      source = 'stored_locked_or_paid';
    } else {
      const live = await _computePayoutTechSummaryLive({
        payout_id: p.payout_id,
        start: new Date(p.period_start),
        endEx: new Date(p.period_end),
        period_type: String(p.period_type || ''),
        label_ym: String(p.period_start || '').slice(0,7),
      });
      const techSet = new Set();
      for (const ln of (live.lines || [])) {
        total_amount += Number(ln.earn_amount || 0);
        lines_count += 1;
        const u = String(ln.technician_username || '').trim();
        if (u) techSet.add(u);
      }
      techs_count = techSet.size;
    }
    rows.push({
      ...p,
      total_amount: Number(total_amount.toFixed ? total_amount.toFixed(2) : total_amount),
      lines_count,
      techs_count,
      source,
      cache_note: source === 'live_contract_recompute_draft'
        ? 'draft uses live contract engine; stored legacy lines ignored'
        : 'locked/paid uses stored lines',
    });
  }
  return rows;
}

app.get('/admin/super/payouts', requireSuperAdmin, async (req, res) => {
  try {
    const auto_ensure = await _ensureDuePayoutPeriodsBangkok(req.actor?.username || null);
    const payouts = await _listPayoutPeriodsLiveAware({ limit: req.query.limit || 24 });
    return res.json({ ok: true, payouts, auto_ensure });
  } catch (e) {
    console.error('GET /admin/super/payouts', e);
    return res.status(500).json({ ok: false, error: 'LOAD_FAILED' });
  }
});

app.get('/admin/super/payouts/:payout_id/techs', requireSuperAdmin, async (req, res) => {
  try {
    const payout_id = String(req.params.payout_id || '').trim();
    if (!payout_id) return res.status(400).json({ ok: false, error: 'MISSING_PAYOUT_ID' });
    const payload = await _buildPayoutTechSummaryRows(payout_id);
    return res.json({ ok: true, payout_id, status: payload.period?.status || 'draft', source: payload.source, techs: payload.techs || [] });
  } catch (e) {
    console.error('GET /admin/super/payouts/:payout_id/techs', e);
    return res.status(500).json({ ok: false, error: 'LOAD_FAILED' });
  }
});

// =======================================
// 👀 Admin (ปกติ) ดูรายได้ช่าง/สถานะจ่าย (READ-ONLY)
// - ตาม requirement: แอดมินทั่วไปต้องดูได้ว่า "จ่ายแล้ว/ยัง" โดยไม่ต้องเป็น Super
// - ปลอด regression: เป็น endpoint เพิ่ม ไม่กระทบของเดิม
// =======================================
app.get('/admin/payouts', requireAdminSession, async (req, res) => {
  try {
    const payouts = await _listPayoutPeriodsLiveAware({ limit: req.query.limit || 24 });
    return res.json({ ok: true, payouts });
  } catch (e) {
    console.error('GET /admin/payouts', e);
    return res.status(500).json({ ok: false, error: 'LOAD_FAILED' });
  }
});

app.get('/admin/payouts/:payout_id/techs', requireAdminSession, async (req, res) => {
  try {
    const payout_id = String(req.params.payout_id || '').trim();
    if (!payout_id) return res.status(400).json({ ok: false, error: 'MISSING_PAYOUT_ID' });
    const payload = await _buildPayoutTechSummaryRows(payout_id);
    return res.json({ ok: true, payout_id, status: payload.period?.status || 'draft', source: payload.source, techs: payload.techs || [] });
  } catch (e) {
    console.error('GET /admin/payouts/:payout_id/techs', e);
    return res.status(500).json({ ok: false, error: 'LOAD_FAILED' });
  }
});

app.get('/admin/super/payouts/:payout_id/tech/:username', requireSuperAdmin, async (req, res) => {
  try {
    const payout_id = String(req.params.payout_id || '').trim();
    const username = String(req.params.username || '').trim();
    if (!payout_id || !username) return res.status(400).json({ ok:false, error:'MISSING_PARAMS' });

    const parsed = _parsePayoutId(payout_id);
    const period = await _getPayoutPeriod(payout_id);
    if (!period && !parsed) return res.status(400).json({ ok:false, error:'INVALID_PAYOUT_ID' });
    const bounds = period
      ? { period_type: period.period_type, start: new Date(period.period_start), endEx: new Date(period.period_end), label_ym: String(period.period_start || '').slice(0,7) }
      : _periodBoundsForYm(parsed.type, parsed.y, parsed.m);
    const status = String(period?.status || 'draft');

    const loaded = await _loadPayoutLinesForTech({
      payout_id,
      tech: username,
      status,
      start: bounds.start,
      endEx: bounds.endEx,
      period_type: bounds.period_type,
      label_ym: bounds.label_ym || (parsed ? (parsed.y + '-' + String(parsed.m).padStart(2,'0')) : ''),
    });
    const lines = (loaded.lines || []).map(x => ({
      line_id: x.line_id || null,
      payout_id,
      technician_username: username,
      job_id: x.job_id == null ? null : String(x.job_id),
      finished_at: x.finished_at,
      earn_amount: Number(x.earn_amount || 0),
      base_amount: Number(x.base_amount || 0),
      percent_final: x.percent_final,
      machine_count_for_tech: Number(x.machine_count_for_tech || 0),
      step_rule_key: x.step_rule_key,
      detail_json: x.detail_json || {},
      source: loaded.source,
    }));

    const adjR = await pool.query(
      `SELECT adj_id, payout_id, technician_username, job_id::text AS job_id, adj_amount, reason, created_at, created_by
         FROM public.technician_payout_adjustments
        WHERE payout_id=$1 AND technician_username=$2
        ORDER BY created_at ASC, adj_id ASC`,
      [payout_id, username]
    );

    const payR = await pool.query(
      `SELECT payment_id, payout_id, technician_username, paid_amount, paid_status, paid_at, paid_by, slip_url, note
         FROM public.technician_payout_payments
        WHERE payout_id=$1 AND technician_username=$2
        LIMIT 1`,
      [payout_id, username]
    );

    const gross = lines.reduce((s,x)=>s+Number(x.earn_amount||0),0);
    const adj_total = (adjR.rows||[]).reduce((s,x)=>s+Number(x.adj_amount||0),0);
    const deposit_deduction_amount = await _getDepositDeductionForPayout(payout_id, username);
    const deposit = await _getDepositSummary(username);
    const net = _money(gross + adj_total - deposit_deduction_amount);
    const paid_amount = Number(payR.rows?.[0]?.paid_amount || 0);
    const remaining = _money(net - paid_amount);
    const paid_status = _paidStatus(net, paid_amount);
    return res.json({
      ok:true,
      payout_id,
      technician_username: username,
      status,
      source: loaded.source,
      gross_amount: gross,
      adj_total,
      deposit_deduction_amount,
      net_amount: net,
      paid_amount,
      remaining_amount: remaining,
      paid_status,
      ...deposit,
      latest_deposit_deduction: deposit_deduction_amount,
      payment: payR.rows?.[0] || null,
      adjustments: adjR.rows || [],
      lines,
      audit_note: status === 'draft'
        ? 'draft detail recomputed live from contract engine; stored legacy payout_lines ignored'
        : 'locked/paid detail uses stored payout_lines',
    });
  } catch (e) {
    console.error('GET /admin/super/payouts/:payout_id/tech/:username', e);
    return res.status(500).json({ ok:false, error:'LOAD_FAILED' });
  }
});

app.get('/admin/payouts/:payout_id/tech/:username', requireAdminSession, async (req, res) => {
  try {
    const payout_id = String(req.params.payout_id || '').trim();
    const username = String(req.params.username || '').trim();
    if (!payout_id || !username) return res.status(400).json({ ok:false, error:'MISSING_PARAMS' });

    const parsed = _parsePayoutId(payout_id);
    const period = await _getPayoutPeriod(payout_id);
    if (!period && !parsed) return res.status(400).json({ ok:false, error:'INVALID_PAYOUT_ID' });
    const bounds = period
      ? { period_type: period.period_type, start: new Date(period.period_start), endEx: new Date(period.period_end), label_ym: String(period.period_start || '').slice(0,7) }
      : _periodBoundsForYm(parsed.type, parsed.y, parsed.m);
    const status = String(period?.status || 'draft');
    const loaded = await _loadPayoutLinesForTech({
      payout_id,
      tech: username,
      status,
      start: bounds.start,
      endEx: bounds.endEx,
      period_type: bounds.period_type,
      label_ym: bounds.label_ym || (parsed ? (parsed.y + '-' + String(parsed.m).padStart(2,'0')) : ''),
    });
    const lines = (loaded.lines || []).map(x => ({
      line_id: x.line_id || null,
      payout_id,
      technician_username: username,
      job_id: x.job_id == null ? null : String(x.job_id),
      finished_at: x.finished_at,
      earn_amount: Number(x.earn_amount || 0),
      base_amount: Number(x.base_amount || 0),
      percent_final: x.percent_final,
      machine_count_for_tech: Number(x.machine_count_for_tech || 0),
      step_rule_key: x.step_rule_key,
      detail_json: x.detail_json || {},
      source: loaded.source,
    }));
    const adjR = await pool.query(
      `SELECT adj_id, payout_id, technician_username, job_id::text AS job_id, adj_amount, reason, created_at, created_by
         FROM public.technician_payout_adjustments
        WHERE payout_id=$1 AND technician_username=$2
        ORDER BY created_at ASC, adj_id ASC`,
      [payout_id, username]
    );
    const payR = await pool.query(
      `SELECT payment_id, payout_id, technician_username, paid_amount, paid_status, paid_at, paid_by, slip_url, note
         FROM public.technician_payout_payments
        WHERE payout_id=$1 AND technician_username=$2
        LIMIT 1`,
      [payout_id, username]
    );
    const gross = lines.reduce((s,x)=>s+Number(x.earn_amount||0),0);
    const adj_total = (adjR.rows||[]).reduce((s,x)=>s+Number(x.adj_amount||0),0);
    const deposit_deduction_amount = await _getDepositDeductionForPayout(payout_id, username);
    const deposit = await _getDepositSummary(username);
    const net = _money(gross + adj_total - deposit_deduction_amount);
    const paid_amount = Number(payR.rows?.[0]?.paid_amount || 0);
    return res.json({ ok:true, payout_id, technician_username: username, status, source: loaded.source, gross_amount: gross, adj_total, deposit_deduction_amount, net_amount: net, paid_amount, remaining_amount: _money(net-paid_amount), paid_status: _paidStatus(net, paid_amount), ...deposit, latest_deposit_deduction: deposit_deduction_amount, payment: payR.rows?.[0] || null, adjustments: adjR.rows || [], lines });
  } catch (e) {
    console.error('GET /admin/payouts/:payout_id/tech/:username', e);
    return res.status(500).json({ ok:false, error:'LOAD_FAILED' });
  }
});

// =======================================
// ✅ Phase 5: Reconciliation check
// - Compare stored payout_lines with current recompute results
// - Detect jobs changed after generate (via job_updates_v2)
// =======================================


// 🧹 Clear old cached payout_lines for all draft periods.
// Does not touch locked/paid periods, payments, or adjustments.
app.post('/admin/super/payouts/purge_draft_legacy', requireSuperAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `DELETE FROM public.technician_payout_lines l
        USING public.technician_payout_periods p
        WHERE l.payout_id = p.payout_id
          AND COALESCE(p.status,'draft') = 'draft'
          AND NOT EXISTS (
            SELECT 1 FROM public.technician_payout_payments pay
             WHERE pay.payout_id = p.payout_id
          )`
    );
    try { await auditLog(req, { action: 'PAYOUT_DRAFT_LEGACY_PURGE', meta: { deleted_lines: r.rowCount || 0, engine: CWF_CONTRACT_PAYROLL_VERSION } }); } catch {}
    return res.json({ ok:true, deleted_lines: r.rowCount || 0, note:'Deleted only cached payout_lines in draft periods. Locked/paid and payments/adjustments untouched.' });
  } catch (e) {
    console.error('POST /admin/super/payouts/purge_draft_legacy', e);
    return res.status(500).json({ ok:false, error:'PURGE_FAILED' });
  }
});

// 🔁 Regenerate a single draft payout from the contract engine only.
// Safety:
// - draft only; locked/paid are never changed silently
// - payout payments block regeneration
// - adjustments are preserved separately and are not mixed into job income
async function _regenerateDraftPayoutContractLines({ client, payout_id, actor_username, req }) {
  const metaQ = await client.query(
    `SELECT payout_id, period_type, period_start, period_end, status
       FROM public.technician_payout_periods
      WHERE payout_id=$1
      LIMIT 1`,
    [payout_id]
  );
  const meta = metaQ.rows?.[0] || null;
  if (!meta) {
    const err = new Error('PAYOUT_NOT_FOUND');
    err.statusCode = 404;
    throw err;
  }
  const status = String(meta.status || 'draft').trim() || 'draft';
  if (status !== 'draft') {
    const err = new Error('CANNOT_REGENERATE_LOCKED_OR_PAID');
    err.statusCode = 409;
    err.details = { status };
    throw err;
  }

  const payC = await client.query(
    `SELECT COUNT(*)::int AS c FROM public.technician_payout_payments WHERE payout_id=$1`,
    [payout_id]
  );
  const paymentsCount = Number(payC.rows?.[0]?.c || 0);
  if (paymentsCount > 0) {
    const err = new Error('CANNOT_REGENERATE_HAS_PAYMENTS');
    err.statusCode = 409;
    err.details = { payments_count: paymentsCount };
    throw err;
  }

  const beforeQ = await client.query(
    `SELECT COUNT(*)::int AS c, COALESCE(SUM(earn_amount),0)::numeric AS total
       FROM public.technician_payout_lines
      WHERE payout_id=$1`,
    [payout_id]
  );
  const oldLines = Number(beforeQ.rows?.[0]?.c || 0);
  const oldTotal = Number(beforeQ.rows?.[0]?.total || 0);

  const adjC = await client.query(
    `SELECT COUNT(*)::int AS c, COALESCE(SUM(adj_amount),0)::numeric AS total
       FROM public.technician_payout_adjustments
      WHERE payout_id=$1`,
    [payout_id]
  );
  const adjustmentsCount = Number(adjC.rows?.[0]?.c || 0);
  const adjustmentsTotal = Number(adjC.rows?.[0]?.total || 0);

  const start = new Date(meta.period_start);
  const endEx = new Date(meta.period_end);
  const period_type = String(meta.period_type || _parsePayoutId(payout_id)?.type || '').trim();
  const label_ym = String(meta.period_start || '').slice(0, 7);

  const computed = await _computePayoutLinesForPeriod(start, endEx, {
    payout_id,
    period_type,
    label_ym,
    include_non_commission: true,
  });

  await _ensurePayoutLinesMachineCountNumeric(client);

  await client.query(`DELETE FROM public.technician_payout_lines WHERE payout_id=$1`, [payout_id]);

  let inserted = 0;
  let newTotal = 0;
  for (const ln of (computed.lines || [])) {
    if (!ln || !ln.technician_username) continue;
    const r = await client.query(
      `INSERT INTO public.technician_payout_lines(
         payout_id, technician_username, job_id, finished_at,
         earn_amount, base_amount, percent_final, machine_count_for_tech, step_rule_key,
         detail_json, setting_snapshot
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (payout_id, technician_username, job_id) DO UPDATE SET
         finished_at=EXCLUDED.finished_at,
         earn_amount=EXCLUDED.earn_amount,
         base_amount=EXCLUDED.base_amount,
         percent_final=EXCLUDED.percent_final,
         machine_count_for_tech=EXCLUDED.machine_count_for_tech,
         step_rule_key=EXCLUDED.step_rule_key,
         detail_json=EXCLUDED.detail_json,
         setting_snapshot=EXCLUDED.setting_snapshot`,
      [
        payout_id,
        ln.technician_username,
        ln.job_id,
        ln.finished_at,
        ln.earn_amount,
        ln.base_amount,
        ln.percent_final,
        _payoutMachineCountValue(ln.machine_count_for_tech),
        ln.step_rule_key,
        ln.detail_json,
        ln.setting_snapshot,
      ]
    );
    inserted += (r.rowCount || 0);
    newTotal += Number(ln.earn_amount || 0);
  }

  try {
    await auditLog(req || { actor: { username: actor_username || 'super_admin', role: 'super_admin' } }, { action: 'PAYOUT_CONTRACT_REGENERATE', target_username: null, target_role: null, meta: {
      payout_id,
      status,
      old_lines: oldLines,
      old_total: oldTotal,
      new_lines: inserted,
      new_total: Number(newTotal.toFixed(2)),
      adjustments_count: adjustmentsCount,
      adjustments_total: adjustmentsTotal,
      errors: computed.errors || [],
      engine: 'contract-v10-app-button',
      ignored_legacy_fields: ['line_total','unit_price','total_price','paid_amount','final_price','special_bonus_amount','percentage','company_cut_percent','commission_percent'],
    } });
  } catch {}

  return {
    ok: true,
    payout_id,
    status,
    old_lines: oldLines,
    old_total: Number(oldTotal || 0),
    new_lines: inserted,
    new_total: Number(newTotal.toFixed(2)),
    adjustments_count: adjustmentsCount,
    adjustments_total: Number(adjustmentsTotal || 0),
    errors: computed.errors || [],
    note: 'Regenerated draft payout lines from contract engine only. Adjustments are preserved separately. Locked/paid periods are not changed.',
  };
}

app.post('/admin/super/payouts/:payout_id/regenerate_contract', requireSuperAdmin, async (req, res) => {
  const payout_id = String(req.params.payout_id || '').trim();
  if (!payout_id) return res.status(400).json({ ok:false, error:'MISSING_PAYOUT_ID' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await _regenerateDraftPayoutContractLines({
      client,
      payout_id,
      actor_username: req.actor?.username || null,
      req,
    });
    await client.query('COMMIT');
    return res.json(result);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    const code = Number(e.statusCode || 500);
    const payload = { ok:false, error: e.message || 'REGENERATE_FAILED' };
    if (e.details) payload.details = e.details;
    console.error('POST /admin/super/payouts/:payout_id/regenerate_contract', e);
    return res.status(code).json(payload);
  } finally {
    client.release();
  }
});

app.get('/admin/super/payouts/:payout_id/reconcile', requireSuperAdmin, async (req, res) => {
  const payout_id = String(req.params.payout_id || '').trim();
  if (!payout_id) return res.status(400).json({ ok:false, error:'MISSING_PAYOUT_ID' });
  try {
    const period = await _getPayoutPeriod(payout_id);
    if (!period) return res.status(404).json({ ok:false, error:'PAYOUT_NOT_FOUND' });

    // jobs in period
    const jr = await pool.query(
      `SELECT job_id
         FROM public.jobs
        WHERE finished_at IS NOT NULL
          AND finished_at >= $1::timestamptz
          AND finished_at <  $2::timestamptz
        ORDER BY job_id ASC`,
      [period.period_start, period.period_end]
    );
    const jobIds = (jr.rows||[]).map(r => String(r.job_id));

    const storedR = await pool.query(
      `SELECT job_id::text AS job_id, technician_username, earn_amount, base_amount, percent_final, machine_count_for_tech, detail_json
         FROM public.technician_payout_lines
        WHERE payout_id=$1`,
      [payout_id]
    );
    const stored = storedR.rows || [];
    const storedMap = new Map();
    for (const s of stored) storedMap.set(`${s.job_id}::${s.technician_username}`, s);

    const mismatches = [];
    const missingNow = [];
    const newExpected = [];

    for (const job_id of jobIds) {
      let expected = [];
      try {
        expected = await _buildPayoutLinesForJob(job_id);
      } catch (e) {
        mismatches.push({ job_id, technician_username:null, issue:'recompute_failed', message: e.message || 'recompute failed' });
        continue;
      }

      const expMap = new Map();
      for (const e of expected) expMap.set(`${String(e.job_id)}::${String(e.technician_username)}`, e);

      // compare stored -> expected
      for (const [k, s] of Array.from(storedMap.entries())) {
        const [sj, st] = k.split('::');
        if (sj !== String(job_id)) continue;
        const ex = expMap.get(k);
        if (!ex) {
          missingNow.push({ job_id: sj, technician_username: st, stored_earn: Number(s.earn_amount||0) });
          continue;
        }
        const se = Number(s.earn_amount||0);
        const ee = Number(ex.earn_amount||0);
        const delta = Number((ee - se).toFixed(2));
        if (Math.abs(delta) >= 0.01) {
          // detect changed after generate
          let changed_after_generate = false;
          try {
            const ur = await pool.query(
              `SELECT MAX(created_at) AS last_update_at FROM public.job_updates_v2 WHERE job_id=$1`,
              [Number(job_id)]
            );
            const last = ur.rows[0]?.last_update_at ? new Date(ur.rows[0].last_update_at) : null;
            const genAt = period.created_at ? new Date(period.created_at) : null;
            if (last && genAt && last.getTime() > genAt.getTime()) changed_after_generate = true;
          } catch {}

          mismatches.push({
            job_id: String(job_id),
            technician_username: String(st),
            issue: 'amount_changed',
            stored_earn: se,
            expected_earn: ee,
            delta,
            stored_percent: Number(s.percent_final||0) || null,
            expected_percent: Number(ex.percent_final||0) || null,
            stored_machine: Number(s.machine_count_for_tech||0) || null,
            expected_machine: Number(ex.machine_count_for_tech||0) || null,
            changed_after_generate,
          });
        }
      }

      // compare expected -> stored (new lines)
      for (const [k, ex] of Array.from(expMap.entries())) {
        if (!storedMap.has(k)) {
          const parts = k.split('::');
          newExpected.push({ job_id: parts[0], technician_username: parts[1], expected_earn: Number(ex.earn_amount||0) });
        }
      }
    }

    return res.json({
      ok:true,
      payout_id,
      status: period.status,
      period_start: period.period_start,
      period_end: period.period_end,
      jobs: jobIds.length,
      stored_lines: stored.length,
      mismatches,
      missing_now: missingNow,
      new_expected: newExpected,
    });
  } catch (e) {
    console.error('GET /admin/super/payouts/:payout_id/reconcile', e);
    return res.status(500).json({ ok:false, error:'RECONCILE_FAILED' });
  }
});

// =======================================
// 🧾 Payout Lock / Pay / Adjust / Slip (Phase 2)
// - Lock งวด: กันเลขเปลี่ยน
// - Payments: เก็บยอดจ่ายจริง + สลิป
// - Adjustments: ปรับยอดแบบมีเหตุผล (audit trail)
// =======================================

function _money(n){ const x = Number(n||0); return Number.isFinite(x) ? Number(x.toFixed(2)) : 0; }
function _isPartnerEmploymentType(v) {
  const s = String(v || '').trim().toLowerCase();
  return s === 'partner' || s === 'พาร์ทเนอร์';
}
function _paidStatus(netAmount, paidAmount){
  const net = _money(netAmount);
  const paid = _money(paidAmount);
  const EPS = 0.01;
  if (paid <= EPS) return 'unpaid';
  if (paid + EPS >= net) return 'paid';
  return 'partial';
}

async function _getDepositAccount(username){
  const tech = String(username || '').trim();
  if (!tech) return { technician_username: '', target_amount: 5000, is_required: true };
  try {
    const q = await pool.query(
      `SELECT technician_username, COALESCE(target_amount,5000)::numeric AS target_amount,
              COALESCE(is_required,TRUE) AS is_required, created_at, updated_at, updated_by
         FROM public.technician_deposit_accounts
        WHERE technician_username=$1
        LIMIT 1`,
      [tech]
    );
    if (q.rows[0]) return { ...q.rows[0], target_amount: _money(q.rows[0].target_amount || 5000) };
  } catch {}
  return { technician_username: tech, target_amount: 5000, is_required: true };
}

async function _getDepositCollected(username){
  const tech = String(username || '').trim();
  if (!tech) return 0;
  try {
    const q = await pool.query(
      `SELECT COALESCE(SUM(
          CASE transaction_type
            WHEN 'collect' THEN amount
            WHEN 'manual_adjust' THEN amount
            WHEN 'refund' THEN -amount
            WHEN 'claim_deduct' THEN -amount
            ELSE 0
          END
        ),0)::numeric AS collected
         FROM public.technician_deposit_ledger
        WHERE technician_username=$1`,
      [tech]
    );
    return _money(q.rows?.[0]?.collected || 0);
  } catch {
    return 0;
  }
}

async function _getDepositSummary(username){
  const account = await _getDepositAccount(username);
  const collected = await _getDepositCollected(username);
  const target = _money(account.target_amount || 5000);
  return {
    deposit_target_amount: target,
    deposit_collected_total: collected,
    deposit_remaining_amount: _money(Math.max(0, target - collected)),
    deposit_is_required: account.is_required !== false,
  };
}

async function _getDepositDeductionForPayout(payout_id, username){
  const pid = String(payout_id || '').trim();
  const tech = String(username || '').trim();
  if (!pid || !tech) return 0;
  try {
    const q = await pool.query(
      `SELECT COALESCE(SUM(amount),0)::numeric AS amount
         FROM public.technician_deposit_ledger
        WHERE payout_id=$1 AND technician_username=$2 AND transaction_type='collect'`,
      [pid, tech]
    );
    return _money(q.rows?.[0]?.amount || 0);
  } catch {
    return 0;
  }
}

async function _calcPartnerDepositDeduction({ username, gross_amount } = {}){
  const tech = String(username || '').trim();
  const gross = _money(gross_amount || 0);
  if (!tech || gross <= 0) return 0;
  const prof = await _getTechProfile(tech);
  if (!_isPartnerEmploymentType(prof?.employment_type || 'company')) return 0;
  const summary = await _getDepositSummary(tech);
  if (summary.deposit_is_required === false) return 0;
  const remaining = _money(summary.deposit_remaining_amount || 0);
  if (remaining <= 0) return 0;
  return _money(Math.min(_money(gross * 0.10), 500, remaining));
}

async function _ensureDepositCollectionForPayout({ payout_id, username, gross_amount, actor } = {}){
  const pid = String(payout_id || '').trim();
  const tech = String(username || '').trim();
  if (!pid || !tech) return { deposit_deduction_amount: 0, inserted: false, disabled: !ENABLE_PARTNER_DEPOSIT_DEDUCTION };
  const existing = await _getDepositDeductionForPayout(pid, tech);
  if (existing > 0) return { deposit_deduction_amount: existing, inserted: false, existing: true };
  if (!ENABLE_PARTNER_DEPOSIT_DEDUCTION) return { deposit_deduction_amount: 0, inserted: false, disabled: true };
  const deduction = await _calcPartnerDepositDeduction({ username: tech, gross_amount });
  if (deduction <= 0) return { deposit_deduction_amount: 0, inserted: false };
  const q = await pool.query(
    `INSERT INTO public.technician_deposit_ledger(
       technician_username, payout_id, transaction_type, amount, note, created_by, meta_json
     ) VALUES($1,$2,'collect',$3,$4,$5,$6::jsonb)
     ON CONFLICT (technician_username, payout_id, transaction_type)
     WHERE transaction_type='collect'
     DO NOTHING
     RETURNING ledger_id`,
    [
      tech,
      pid,
      deduction,
      'Automatic partner work deposit deduction',
      actor || null,
      JSON.stringify({ gross_amount: _money(gross_amount || 0), formula: 'min(gross*0.10,500,remaining)' })
    ]
  );
  const after = await _getDepositDeductionForPayout(pid, tech);
  return { deposit_deduction_amount: after, inserted: (q.rowCount || 0) > 0 };
}

async function _ensureDepositCollectionsForPayout(payout_id, actor) {
  const pid = String(payout_id || '').trim();
  if (!pid) return { checked: 0, inserted: 0 };
  const q = await pool.query(
    `SELECT technician_username, COALESCE(SUM(earn_amount),0)::numeric AS gross_amount
       FROM public.technician_payout_lines
      WHERE payout_id=$1
      GROUP BY technician_username`,
    [pid]
  );
  let checked = 0;
  let inserted = 0;
  for (const row of (q.rows || [])) {
    const username = String(row.technician_username || '').trim();
    if (!username) continue;
    checked++;
    const r = await _ensureDepositCollectionForPayout({
      payout_id: pid,
      username,
      gross_amount: row.gross_amount,
      actor,
    });
    if (r.inserted) inserted++;
  }
  return { checked, inserted };
}

async function _computeTechnicianTrueOutstanding(username){
  const tech = String(username || '').trim();
  if (!tech) return { true_outstanding_amount: 0, paid_total: 0, periods_count: 0, rows: [] };
  try {
    const q = await pool.query(
      `WITH gross AS (
         SELECT payout_id, technician_username,
                COALESCE(SUM(earn_amount),0)::numeric AS gross_amount,
                COUNT(*)::int AS lines_count
           FROM public.technician_payout_lines
          WHERE technician_username=$1
          GROUP BY payout_id, technician_username
       ),
       adj AS (
         SELECT payout_id, technician_username,
                COALESCE(SUM(adj_amount),0)::numeric AS adj_total
           FROM public.technician_payout_adjustments
          WHERE technician_username=$1
          GROUP BY payout_id, technician_username
       ),
       dep AS (
         SELECT payout_id, technician_username,
                COALESCE(SUM(amount),0)::numeric AS deposit_deduction_amount
           FROM public.technician_deposit_ledger
          WHERE technician_username=$1 AND transaction_type='collect'
          GROUP BY payout_id, technician_username
       ),
       pay AS (
         SELECT payout_id, technician_username,
                COALESCE(paid_amount,0)::numeric AS paid_amount,
                COALESCE(paid_status,'unpaid') AS paid_status
           FROM public.technician_payout_payments
          WHERE technician_username=$1
       )
       SELECT p.payout_id,
              COALESCE(p.status,'draft') AS period_status,
              g.technician_username,
              g.gross_amount,
              COALESCE(a.adj_total,0)::numeric AS adj_total,
              COALESCE(d.deposit_deduction_amount,0)::numeric AS deposit_deduction_amount,
              COALESCE(pay.paid_amount,0)::numeric AS paid_amount,
              COALESCE(pay.paid_status,'unpaid') AS paid_status,
              g.lines_count
         FROM gross g
         JOIN public.technician_payout_periods p ON p.payout_id=g.payout_id
         LEFT JOIN adj a ON a.payout_id=g.payout_id AND a.technician_username=g.technician_username
         LEFT JOIN dep d ON d.payout_id=g.payout_id AND d.technician_username=g.technician_username
         LEFT JOIN pay ON pay.payout_id=g.payout_id AND pay.technician_username=g.technician_username
        ORDER BY p.period_start DESC, p.payout_id DESC`,
      [tech]
    );
    let outstanding = 0;
    let paidTotal = 0;
    const rows = [];
    for (const r of (q.rows || [])) {
      const gross = _money(r.gross_amount || 0);
      const adj = _money(r.adj_total || 0);
      const dep = _money(r.deposit_deduction_amount || 0);
      const net = _money(gross + adj - dep);
      const paid = _money(r.paid_amount || 0);
      const statusCalc = _paidStatus(net, paid);
      const periodStatus = String(r.period_status || '').trim();
      const storedPaidStatus = String(r.paid_status || '').trim();
      const rawRemaining = _money(Math.max(0, net - paid));
      paidTotal += paid;

      // MVP rule: "ยอดรอจ่ายจริง" must not include draft/live estimates.
      // Draft/next-cycle money is already shown separately as "คาดว่าจะได้งวดถัดไป".
      // Count only locked periods that are not fully paid yet.
      const isLockedForPayout = periodStatus === 'locked';
      const isAlreadyPaid = periodStatus === 'paid' || storedPaidStatus === 'paid' || statusCalc === 'paid';
      const shouldCount = isLockedForPayout && !isAlreadyPaid && rawRemaining > 0;
      const remaining = shouldCount ? rawRemaining : 0;
      if (shouldCount) outstanding += rawRemaining;
      rows.push({
        payout_id: r.payout_id,
        period_status: periodStatus,
        paid_status: statusCalc,
        gross_amount: gross,
        adj_total: adj,
        deposit_deduction_amount: dep,
        net_amount: net,
        paid_amount: paid,
        raw_remaining_amount: rawRemaining,
        remaining_amount: remaining,
        counted_as_outstanding: shouldCount,
      });
    }
    return {
      true_outstanding_amount: _money(outstanding),
      paid_total: _money(paidTotal),
      outstanding_policy: 'locked_pending_only',
      periods_count: rows.filter(r => r.counted_as_outstanding).length,
      rows,
    };
  } catch (e) {
    console.error('_computeTechnicianTrueOutstanding', e);
    return { true_outstanding_amount: 0, paid_total: 0, periods_count: 0, rows: [] };
  }
}

function _technicianRollingDisplayMonthWindow(nowBkk = _bkkNow()){
  const ymd = _bkkYmd(nowBkk);
  let displayY = ymd.y;
  let displayM = ymd.m;
  if (ymd.d <= 15) {
    displayM -= 1;
    if (displayM <= 0) { displayM = 12; displayY -= 1; }
  }
  const displayYm = `${displayY}-${String(displayM).padStart(2, '0')}`;
  const start = _bangkokMidnightUTC(displayY, displayM, 1);
  let nextY = displayY;
  let nextM = displayM + 1;
  if (nextM > 12) { nextM = 1; nextY += 1; }
  const nextMonthStart = _bangkokMidnightUTC(nextY, nextM, 1);
  const isCurrentDisplayMonth = displayY === ymd.y && displayM === ymd.m;
  const endEx = isCurrentDisplayMonth ? nowBkk : nextMonthStart;
  return {
    y: displayY,
    m: displayM,
    ym: displayYm,
    start,
    endEx,
    is_current_month: isCurrentDisplayMonth,
    policy: 'day_1_15_show_previous_month_day_16_end_show_current_month_to_date',
  };
}

async function _computeTechnicianPayoutMonthTotal(username, ym = ''){
  const tech = String(username || '').trim();
  if (!tech) return { payout_month_total: 0, payout_month_net_total: 0, payout_month: '', periods: [] };
  try {
    void ym; // The display month follows CWF rolling payout-month rule, not caller input.
    const win = _technicianRollingDisplayMonthWindow(_bkkNow());
    const lines = await _computeTechLinesInRange(tech, win.start, win.endEx, {
      payout_id: `virtual_month_${win.ym}`,
      label_ym: win.ym,
    });
    const total = _money((lines || []).reduce((sum, line) => sum + Number(line.earn_amount || 0), 0));
    return {
      payout_month: win.ym,
      payout_month_total: total,
      payout_month_net_total: total,
      payout_month_policy: win.policy,
      monthly_income_display_amount: total,
      monthly_income_display_label: win.ym,
      monthly_income_period_start: win.start.toISOString(),
      monthly_income_period_end: win.endEx.toISOString(),
      periods: [{
        payout_id: `virtual_month_${win.ym}`,
        period_type: 'month_display',
        period_start: win.start.toISOString(),
        period_end: win.endEx.toISOString(),
        source: 'live_completed_jobs',
        mode: win.is_current_month ? 'current_month_to_date' : 'previous_full_month',
        gross_amount: total,
        adj_total: 0,
        deposit_deduction_amount: 0,
        payout_month_amount: total,
        payout_month_net_amount: total,
      }],
    };
  } catch (e) {
    console.error('_computeTechnicianPayoutMonthTotal', e);
    return { payout_month_total: 0, payout_month_net_total: 0, payout_month: '', periods: [] };
  }
}

function _cwfWorkNum(n){
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}
function _cwfAddWork(map, key, label, unit, qty){
  const q = _cwfWorkNum(qty);
  if (!q) return;
  if (!map.has(key)) map.set(key, { key, label, unit, count: 0 });
  const it = map.get(key);
  it.count = _cwfWorkNum(Number(it.count || 0) + q);
}
function _cwfWorkSummaryFromLines(lines, win){
  const cards = new Map();
  const byWash = new Map();
  const byAc = new Map();
  const jobTypeJobs = new Map();
  const jobSeen = new Set();
  let totalMachines = 0;
  for (const ln of (Array.isArray(lines) ? lines : [])) {
    const detail = (ln && typeof ln.detail_json === 'object') ? ln.detail_json : {};
    const jobId = String(ln?.job_id || '').trim();
    const jobType = String(detail.job_type_key || '').trim();
    if (jobId && !jobSeen.has(jobId)) {
      jobSeen.add(jobId);
      if (jobType === 'repair' || jobType === 'install') {
        _cwfAddWork(jobTypeJobs, jobType, _thaiLabelJob(jobType) || jobType, 'งาน', 1);
      }
    }

    const rateRows = Array.isArray(detail.contract_rate_rows) ? detail.contract_rate_rows : [];
    if (rateRows.length) {
      for (const r of rateRows) {
        const share = Number(r.share || 1);
        const qty = Number.isFinite(share) && share > 0 ? share : 1;
        const wash = String(r.wash_key || detail.wash_variant_key || '').split('+')[0] || 'normal';
        const acText = [r.item_name, detail.ac_type, detail.job_type].filter(Boolean).join(' ').toLowerCase();
        let ac = String(detail.ac_type_key || '').trim();
        if (!ac) {
          if (/สี่ทิศ|four|4way|4-way/.test(acText)) ac = 'fourway';
          else if (/เปลือย|ใต้ฝ้า|concealed|ceiling/.test(acText)) ac = 'ceiling';
          else if (/แขวน|ตั้งพื้น|floor/.test(acText) && !/แขวนคอย/.test(acText)) ac = 'hanging';
          else ac = 'wall';
        }
        totalMachines += qty;
        _cwfAddWork(byWash, wash, _thaiLabelWash(wash) || wash, 'เครื่อง', qty);
        _cwfAddWork(byAc, ac, _thaiLabelAc(ac) || ac, 'เครื่อง', qty);
        if (ac === 'wall') {
          _cwfAddWork(cards, `wall_${wash}`, _thaiLabelWash(wash) || wash, 'เครื่อง', qty);
        } else if (ac === 'fourway' || ac === 'hanging' || ac === 'ceiling') {
          _cwfAddWork(cards, `ac_${ac}`, _thaiLabelAc(ac) || ac, 'เครื่อง', qty);
        }
      }
      continue;
    }

    const mc = Number(detail.machine_count_for_tech ?? ln.machine_count_for_tech ?? 0);
    if (Number.isFinite(mc) && mc > 0) {
      const wash = String(detail.wash_variant_key || '').split('+')[0] || 'normal';
      const ac = String(detail.ac_type_key || '') || 'wall';
      totalMachines += mc;
      _cwfAddWork(byWash, wash, _thaiLabelWash(wash) || wash, 'เครื่อง', mc);
      _cwfAddWork(byAc, ac, _thaiLabelAc(ac) || ac, 'เครื่อง', mc);
      if (ac === 'wall') _cwfAddWork(cards, `wall_${wash}`, _thaiLabelWash(wash) || wash, 'เครื่อง', mc);
      else if (ac === 'fourway' || ac === 'hanging' || ac === 'ceiling') _cwfAddWork(cards, `ac_${ac}`, _thaiLabelAc(ac) || ac, 'เครื่อง', mc);
    }
  }

  for (const it of jobTypeJobs.values()) _cwfAddWork(cards, it.key, it.label, it.unit, it.count);

  const order = ['wall_normal','wall_premium','wall_coil','wall_overhaul','ac_fourway','ac_hanging','ac_ceiling','repair','install'];
  const fixedLabels = {
    wall_normal: 'ล้างธรรมดา',
    wall_premium: 'พรีเมี่ยม',
    wall_coil: 'แขวนคอยล์',
    wall_overhaul: 'ตัดล้างใหญ่',
    ac_fourway: 'สี่ทิศทาง',
    ac_hanging: 'แขวน/ตั้งพื้น',
    ac_ceiling: 'เปลือย',
    repair: 'ซ่อม',
    install: 'ติดตั้ง',
  };
  for (const k of order) {
    if (!cards.has(k)) cards.set(k, { key: k, label: fixedLabels[k], unit: (k === 'repair' || k === 'install') ? 'งาน' : 'เครื่อง', count: 0 });
  }
  const cardArr = order.map(k => cards.get(k)).filter(Boolean).map(x => ({ ...x, count: _cwfWorkNum(x.count) }));
  return {
    period_start: win?.start?.toISOString?.() || null,
    period_end: win?.endEx?.toISOString?.() || null,
    period_label: win?.ym || '',
    policy: 'same_period_as_rolling_month_income_card',
    total_machines: _cwfWorkNum(totalMachines),
    jobs_count: jobSeen.size,
    cards: cardArr,
    groups: [
      { key: 'wash', label: 'แยกตามประเภทการล้าง', items: Array.from(byWash.values()).map(x => ({ ...x, count: _cwfWorkNum(x.count) })).sort((a,b)=>Number(b.count)-Number(a.count)) },
      { key: 'ac', label: 'แยกตามประเภทแอร์', items: Array.from(byAc.values()).map(x => ({ ...x, count: _cwfWorkNum(x.count) })).sort((a,b)=>Number(b.count)-Number(a.count)) },
      { key: 'job', label: 'งานอื่น', items: Array.from(jobTypeJobs.values()).map(x => ({ ...x, count: _cwfWorkNum(x.count) })).sort((a,b)=>Number(b.count)-Number(a.count)) },
    ],
  };
}
async function _computeTechnicianWorkSummary(username, start, endEx, labelYm = ''){
  const tech = String(username || '').trim();
  if (!tech || !(start instanceof Date) || !(endEx instanceof Date)) {
    return { period_label: labelYm || '', total_machines: 0, jobs_count: 0, cards: [], groups: [] };
  }
  try {
    const lines = await _computeTechLinesInRange(tech, start, endEx, { payout_id: `work_summary_${labelYm || 'month'}`, label_ym: labelYm || '' });
    return _cwfWorkSummaryFromLines(lines || [], { start, endEx, ym: labelYm || '' });
  } catch (e) {
    console.error('_computeTechnicianWorkSummary', e);
    return { period_label: labelYm || '', total_machines: 0, jobs_count: 0, cards: [], groups: [] };
  }
}

async function _getPayoutPeriod(payout_id){
  const r = await pool.query(
    `SELECT payout_id, status, period_type, period_start, period_end, created_at
       FROM public.technician_payout_periods
      WHERE payout_id=$1
      LIMIT 1`,
    [payout_id]
  );
  return r.rows[0] || null;
}

async function _getTechGrossAdjNet(payout_id, tech){
  const g = await pool.query(
    `SELECT COALESCE(SUM(earn_amount),0) AS gross_amount
       FROM public.technician_payout_lines
      WHERE payout_id=$1 AND technician_username=$2`,
    [payout_id, tech]
  );
  const a = await pool.query(
    `SELECT COALESCE(SUM(adj_amount),0) AS adj_total
       FROM public.technician_payout_adjustments
      WHERE payout_id=$1 AND technician_username=$2`,
    [payout_id, tech]
  );
  const gross = _money(g.rows[0]?.gross_amount || 0);
  const adj = _money(a.rows[0]?.adj_total || 0);
  const deposit_deduction_amount = await _getDepositDeductionForPayout(payout_id, tech);
  const deposit = await _getDepositSummary(tech);
  return {
    gross_amount: gross,
    adj_total: adj,
    deposit_deduction_amount,
    net_amount: _money(gross + adj - deposit_deduction_amount),
    ...deposit,
    latest_deposit_deduction: deposit_deduction_amount,
  };
}

async function _requireWithdrawIfPartner(payout_id, tech, actor){
  // พาร์ทเนอร์ต้องมี withdraw request ก่อนจ่าย (requested/approved)
  const prof = await _getTechProfile(tech);
  if (!_isPartnerEmploymentType(prof?.employment_type || 'company')) return null;
  const q = await pool.query(
    `SELECT request_id, status
       FROM public.technician_withdraw_requests
      WHERE payout_id=$1 AND technician_username=$2
      ORDER BY created_at DESC, request_id DESC
      LIMIT 1`,
    [payout_id, tech]
  );
  const r = q.rows[0] || null;
  if (!r || !String(r.status || '')) {
    const err = new Error('WITHDRAW_REQUIRED');
    err.code = 'WITHDRAW_REQUIRED';
    throw err;
  }
  const st = String(r.status);
  if (st === 'rejected') {
    const err = new Error('WITHDRAW_REJECTED');
    err.code = 'WITHDRAW_REJECTED';
    throw err;
  }
  if (st === 'paid') return r.request_id;
  // requested/approved ok
  if (st === 'requested') {
    // auto-approve on first payment attempt (audit)
    await pool.query(
      `UPDATE public.technician_withdraw_requests
          SET status='approved', approved_at=NOW(), approved_by=$4
        WHERE request_id=$1 AND payout_id=$2 AND technician_username=$3 AND status='requested'`,
      [r.request_id, payout_id, tech, actor || null]
    );
  }
  return r.request_id;
}

async function _upsertPaymentAndMaybeMarkPaid(payout_id, tech, paid_amount, slip_url, note, actor){
  const period = await _getPayoutPeriod(payout_id);
  if (!period) {
    const err = new Error('PAYOUT_NOT_FOUND'); err.code='PAYOUT_NOT_FOUND'; throw err;
  }
  if (String(period.status) === 'paid') {
    const err = new Error('PAYOUT_ALREADY_PAID'); err.code='PAYOUT_ALREADY_PAID'; throw err;
  }

  let deposit_collections = { checked: 0, inserted: 0 };
  if (String(period.status) === 'draft') {
    deposit_collections = await _ensureDepositCollectionsForPayout(payout_id, actor);
  } else {
    const beforeDeposit = await _getTechGrossAdjNet(payout_id, tech);
    const r = await _ensureDepositCollectionForPayout({ payout_id, username: tech, gross_amount: beforeDeposit.gross_amount, actor });
    deposit_collections = { checked: 1, inserted: r.inserted ? 1 : 0 };
  }
  const { net_amount } = await _getTechGrossAdjNet(payout_id, tech);
  const paid_status = _paidStatus(net_amount, paid_amount);

  await pool.query(
    `INSERT INTO public.technician_payout_payments(
       payout_id, technician_username, paid_amount, paid_status, paid_at, paid_by, slip_url, note, updated_at
     ) VALUES($1,$2,$3,$4,NOW(),$5,$6,$7,NOW())
     ON CONFLICT (payout_id, technician_username)
     DO UPDATE SET
       paid_amount=EXCLUDED.paid_amount,
       paid_status=EXCLUDED.paid_status,
       paid_at=NOW(),
       paid_by=EXCLUDED.paid_by,
       slip_url=EXCLUDED.slip_url,
       note=EXCLUDED.note,
       updated_at=NOW()`,
    [payout_id, tech, _money(paid_amount), paid_status, actor || null, slip_url || null, note || null]
  );

  // auto-lock if still draft
  if (String(period.status) === 'draft') {
    await pool.query(`UPDATE public.technician_payout_periods SET status='locked' WHERE payout_id=$1 AND status='draft'`, [payout_id]);
  }

  if (String(paid_status) === 'paid') {
    try {
      const prof = await _getTechProfile(tech);
      if (_isPartnerEmploymentType(prof?.employment_type || '')) {
        await pool.query(
          `UPDATE public.technician_withdraw_requests
              SET status='paid', paid_at=NOW(), paid_by=$3
            WHERE payout_id=$1 AND technician_username=$2 AND status IN ('approved','requested')`,
          [payout_id, tech, actor || null]
        );
      }
    } catch {}
  }

  // if all techs paid -> mark payout as paid
  const techsQ = await pool.query(
    `
    WITH gross AS (
      SELECT technician_username,
             COALESCE(SUM(earn_amount),0) AS gross_amount
        FROM public.technician_payout_lines
       WHERE payout_id=$1
       GROUP BY technician_username
    ),
    adj AS (
      SELECT technician_username,
             COALESCE(SUM(adj_amount),0) AS adj_total
        FROM public.technician_payout_adjustments
       WHERE payout_id=$1
       GROUP BY technician_username
    ),
    dep AS (
      SELECT technician_username,
             COALESCE(SUM(amount),0) AS deposit_deduction_amount
        FROM public.technician_deposit_ledger
       WHERE payout_id=$1 AND transaction_type='collect'
       GROUP BY technician_username
    )
    SELECT g.technician_username,
           (g.gross_amount + COALESCE(a.adj_total,0) - COALESCE(d.deposit_deduction_amount,0)) AS net_amount,
           COALESCE(p.paid_amount,0) AS paid_amount
      FROM gross g
      LEFT JOIN adj a ON a.technician_username=g.technician_username
      LEFT JOIN dep d ON d.technician_username=g.technician_username
      LEFT JOIN public.technician_payout_payments p ON p.payout_id=$1 AND p.technician_username=g.technician_username
    `,
    [payout_id]
  );

  const allPaid = (techsQ.rows || []).length > 0 && (techsQ.rows || []).every(r => _paidStatus(r.net_amount, r.paid_amount) === 'paid');
  if (allPaid) {
    await pool.query(`UPDATE public.technician_payout_periods SET status='paid' WHERE payout_id=$1`, [payout_id]);
  }

  return { paid_status, net_amount, deposit_collections };
}

// ---- Super Admin: lock payout

// 🗑️ ลบงวด (เฉพาะ draft และต้องไม่มี payment/adjustment) — แก้ปัญหา "กดสร้างแล้วลบไม่ได้"
app.delete('/admin/super/payouts/:payout_id', requireSuperAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const payout_id = String(req.params.payout_id || '').trim();
    if (!payout_id) return res.status(400).json({ ok:false, error:'MISSING_PAYOUT_ID' });

    await client.query('BEGIN');

    const metaQ = await client.query(
      `SELECT status FROM public.technician_payout_periods WHERE payout_id=$1 LIMIT 1`,
      [payout_id]
    );
    const st = String(metaQ.rows[0]?.status || '');
    if (!st) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok:false, error:'NOT_FOUND' });
    }
    if (st !== 'draft') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok:false, error:'CANNOT_DELETE_NOT_DRAFT' });
    }

    const payC = await client.query(`SELECT COUNT(*)::int AS c FROM public.technician_payout_payments WHERE payout_id=$1`, [payout_id]);
    const adjC = await client.query(`SELECT COUNT(*)::int AS c FROM public.technician_payout_adjustments WHERE payout_id=$1`, [payout_id]);
    if (Number(payC.rows[0]?.c||0) > 0 || Number(adjC.rows[0]?.c||0) > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok:false, error:'CANNOT_DELETE_HAS_AUDIT_OR_PAYMENT' });
    }

    await client.query(`DELETE FROM public.technician_payout_lines WHERE payout_id=$1`, [payout_id]);
    await client.query(`DELETE FROM public.technician_payout_periods WHERE payout_id=$1`, [payout_id]);

    await client.query('COMMIT');
    return res.json({ ok:true, payout_id, deleted:true });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('DELETE /admin/super/payouts/:payout_id', e);
    return res.status(500).json({ ok:false, error:'DELETE_FAILED' });
  } finally {
    client.release();
  }
});
app.post('/admin/super/payouts/:payout_id/lock', requireSuperAdmin, async (req, res) => {
  try {
    const payout_id = String(req.params.payout_id || '').trim();
    if (!payout_id) return res.status(400).json({ ok:false, error:'MISSING_PAYOUT_ID' });

    const p = await _getPayoutPeriod(payout_id);
    if (!p) return res.status(404).json({ ok:false, error:'PAYOUT_NOT_FOUND' });
    if (String(p.status) === 'paid') return res.json({ ok:true, payout_id, status:'paid', already:true });

    // If this period was lazily auto-created, it may not have stored lines yet.
    // Before locking, regenerate draft lines from the contract engine so locked/paid periods use a stable snapshot.
    let regen = null;
    if (String(p.status || 'draft') === 'draft') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        regen = await _regenerateDraftPayoutContractLines({
          client,
          payout_id,
          actor_username: req.actor?.username || null,
          req,
        });
        await client.query('COMMIT');
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch {}
        throw e;
      } finally {
        client.release();
      }
    }

    const depositSummary = await _ensureDepositCollectionsForPayout(payout_id, req.actor?.username || null);

    await pool.query(`UPDATE public.technician_payout_periods SET status='locked' WHERE payout_id=$1 AND status='draft'`, [payout_id]);
    const p2 = await _getPayoutPeriod(payout_id);
    return res.json({ ok:true, payout_id, status: p2?.status || 'locked', regenerated: regen ? true : false, deposit_collections: depositSummary.inserted, deposit_checked: depositSummary.checked });
  } catch (e) {
    console.error('POST /admin/super/payouts/:payout_id/lock', e);
    return res.status(500).json({ ok:false, error:'LOCK_FAILED' });
  }
});

// ---- Super Admin: pay (upsert per tech)
app.post('/admin/super/payouts/:payout_id/pay', requireSuperAdmin, async (req, res) => {
  try {
    const payout_id = String(req.params.payout_id || '').trim();
    const b = req.body || {};
    const tech = String(b.technician_username || '').trim();
    const paid_amount = _money(b.paid_amount);
    const slip_url = String(b.slip_url || '').trim() || null;
    const note = String(b.note || '').trim() || null;

    if (!payout_id || !tech) return res.status(400).json({ ok:false, error:'MISSING_PARAMS' });

    const r = await _upsertPaymentAndMaybeMarkPaid(payout_id, tech, paid_amount, slip_url, note, req.actor?.username || null);
    return res.json({ ok:true, payout_id, technician_username: tech, paid_amount, paid_status: r.paid_status, net_amount: r.net_amount });
  } catch (e) {
    console.error('POST /admin/super/payouts/:payout_id/pay', e);
    if (String(e.code||'') === 'PAYOUT_NOT_FOUND') return res.status(404).json({ ok:false, error:'PAYOUT_NOT_FOUND' });
    if (String(e.code||'') === 'PAYOUT_ALREADY_PAID') return res.status(409).json({ ok:false, error:'PAYOUT_ALREADY_PAID' });
    return res.status(500).json({ ok:false, error:'PAY_FAILED' });
  }
});

// ---- Super Admin: pay bulk (Phase 6)
// ใช้สำหรับ “จ่ายครบหลายช่าง/ทั้งงวด” ให้ใช้ง่ายขึ้น
// body:
//   { mode: 'selected'|'all', technicians?: [username], slip_url?: string, note?: string }
// behavior:
//   - ตั้ง paid_amount = net_amount (gross + adjustments) ให้แต่ละช่าง
//   - idempotent (upsert)
//   - auto-lock งวดถ้ายัง draft
//   - ถ้าจ่ายครบทุกคน -> status=paid
app.post('/admin/super/payouts/:payout_id/pay_bulk', requireSuperAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const payout_id = String(req.params.payout_id || '').trim();
    const b = req.body || {};
    const mode = String(b.mode || 'selected').trim();
    const list = Array.isArray(b.technicians) ? b.technicians.map(x=>String(x||'').trim()).filter(Boolean) : [];
    const slip_url = String(b.slip_url || '').trim() || null;
    const note = String(b.note || '').trim() || null;
    if (!payout_id) return res.status(400).json({ ok:false, error:'MISSING_PAYOUT_ID' });

    const period = await _getPayoutPeriod(payout_id);
    if (!period) return res.status(404).json({ ok:false, error:'PAYOUT_NOT_FOUND' });
    if (String(period.status) === 'paid') return res.status(409).json({ ok:false, error:'PAYOUT_ALREADY_PAID' });

    // Load net amounts for all techs in this payout
    const techsQ = await pool.query(
      `
      WITH gross AS (
        SELECT technician_username,
               COALESCE(SUM(earn_amount),0) AS gross_amount
          FROM public.technician_payout_lines
         WHERE payout_id=$1
         GROUP BY technician_username
      ),
      adj AS (
        SELECT technician_username,
               COALESCE(SUM(adj_amount),0) AS adj_total
          FROM public.technician_payout_adjustments
         WHERE payout_id=$1
         GROUP BY technician_username
      )
      SELECT g.technician_username,
             g.gross_amount,
             COALESCE(a.adj_total,0) AS adj_total,
             (g.gross_amount + COALESCE(a.adj_total,0)) AS net_amount
        FROM gross g
        LEFT JOIN adj a ON a.technician_username=g.technician_username
      ORDER BY g.technician_username ASC
      `,
      [payout_id]
    );
    const rows = techsQ.rows || [];
    if (!rows.length) return res.json({ ok:true, payout_id, updated:0, status: period.status });
    const actor = req.actor?.username || null;
    const netMap = new Map(rows.map(r=>[String(r.technician_username), _money(r.net_amount)]));

    let targets = [];
    if (mode === 'all') {
      targets = rows.map(r=>String(r.technician_username));
    } else {
      targets = list.filter(u=>netMap.has(u));
    }
    if (!targets.length) return res.status(400).json({ ok:false, error:'NO_TECH_SELECTED' });

    const depositSummary = await _ensureDepositCollectionsForPayout(payout_id, actor);
    for (const r of rows) {
      const totals = await _getTechGrossAdjNet(payout_id, String(r.technician_username || ''));
      netMap.set(String(r.technician_username), _money(totals.net_amount));
    }

    await client.query('BEGIN');

    // auto-lock if draft
    if (String(period.status) === 'draft') {
      await client.query(`UPDATE public.technician_payout_periods SET status='locked' WHERE payout_id=$1 AND status='draft'`, [payout_id]);
    }

    let updated = 0;
    for (const tech of targets) {
      const net = _money(netMap.get(tech));
      const paid_amount = net;
      const paid_status = 'paid';
      await client.query(
        `INSERT INTO public.technician_payout_payments(
           payout_id, technician_username, paid_amount, paid_status, paid_at, paid_by, slip_url, note, updated_at
         ) VALUES($1,$2,$3,$4,NOW(),$5,$6,$7,NOW())
         ON CONFLICT (payout_id, technician_username)
         DO UPDATE SET
           paid_amount=EXCLUDED.paid_amount,
           paid_status=EXCLUDED.paid_status,
           paid_at=NOW(),
           paid_by=EXCLUDED.paid_by,
           slip_url=COALESCE(EXCLUDED.slip_url, public.technician_payout_payments.slip_url),
           note=COALESCE(EXCLUDED.note, public.technician_payout_payments.note),
           updated_at=NOW()`,
        [payout_id, tech, paid_amount, paid_status, actor, slip_url, note]
      );
      updated++;

      // ✅ mark withdraw request paid for partner
      try {
        const prof = await _getTechProfile(tech);
        if (_isPartnerEmploymentType(prof?.employment_type || '')) {
          await client.query(
            `UPDATE public.technician_withdraw_requests
                SET status='paid', paid_at=NOW(), paid_by=$3
              WHERE payout_id=$1 AND technician_username=$2 AND status IN ('approved','requested')`,
            [payout_id, tech, actor]
          );
        }
      } catch {}
    }

    // Mark paid if all techs are paid now
    const paidCheck = await client.query(
      `
      WITH gross AS (
        SELECT technician_username,
               COALESCE(SUM(earn_amount),0) AS gross_amount
          FROM public.technician_payout_lines
         WHERE payout_id=$1
         GROUP BY technician_username
      ),
      adj AS (
        SELECT technician_username,
               COALESCE(SUM(adj_amount),0) AS adj_total
          FROM public.technician_payout_adjustments
         WHERE payout_id=$1
         GROUP BY technician_username
      ),
      dep AS (
        SELECT technician_username,
               COALESCE(SUM(amount),0) AS deposit_deduction_amount
          FROM public.technician_deposit_ledger
         WHERE payout_id=$1 AND transaction_type='collect'
         GROUP BY technician_username
      )
      SELECT g.technician_username,
             (g.gross_amount + COALESCE(a.adj_total,0) - COALESCE(d.deposit_deduction_amount,0)) AS net_amount,
             COALESCE(p.paid_amount,0) AS paid_amount
        FROM gross g
        LEFT JOIN adj a ON a.technician_username=g.technician_username
        LEFT JOIN dep d ON d.technician_username=g.technician_username
        LEFT JOIN public.technician_payout_payments p ON p.payout_id=$1 AND p.technician_username=g.technician_username
      `,
      [payout_id]
    );
    const allPaid = (paidCheck.rows || []).length > 0 && (paidCheck.rows || []).every(r => _paidStatus(r.net_amount, r.paid_amount) === 'paid');
    if (allPaid) {
      await client.query(`UPDATE public.technician_payout_periods SET status='paid' WHERE payout_id=$1`, [payout_id]);
    }

    await client.query('COMMIT');
    const after = await _getPayoutPeriod(payout_id);
    return res.json({ ok:true, payout_id, updated, status: after?.status || period.status, mode, targets, deposit_collections: depositSummary.inserted, deposit_checked: depositSummary.checked });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('POST /admin/super/payouts/:payout_id/pay_bulk', e);
    return res.status(500).json({ ok:false, error:'PAY_BULK_FAILED' });
  } finally {
    client.release();
  }
});



// ---- Super Admin: legacy payout settlement
// One-time cleanup for payouts that were paid outside the app before Technician Payout MVP.
// This does NOT delete jobs, payout lines, or audit history. It only records payment rows
// so technician outstanding uses the same source of truth as current payout periods.
app.post('/admin/super/payouts/legacy_settle', requireSuperAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const b = req.body || {};
    const cutoff = String(b.cutoff_date || '').trim();
    const techFilter = String(b.technician_username || '').trim();
    const noteInput = String(b.note || '').trim();
    const actor = req.actor?.username || null;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) {
      return res.status(400).json({ ok:false, error:'INVALID_CUTOFF_DATE' });
    }

    const cutoffEnd = `${cutoff} 23:59:59+07`;
    const periodsQ = await pool.query(
      `SELECT payout_id, status, period_start, period_end
         FROM public.technician_payout_periods
        WHERE period_end <= $1::timestamptz
        ORDER BY period_end ASC, payout_id ASC`,
      [cutoffEnd]
    );

    let checked_periods = 0;
    let touched_periods = 0;
    let updated_payments = 0;
    let skipped_paid_rows = 0;
    const affected = [];

    await client.query('BEGIN');

    for (const period of (periodsQ.rows || [])) {
      const payout_id = String(period.payout_id || '').trim();
      if (!payout_id) continue;
      checked_periods++;

      const techRows = await _buildPayoutTechSummaryRows(payout_id);
      let periodTouched = false;

      for (const row of (techRows || [])) {
        const tech = String(row.technician_username || '').trim();
        if (!tech) continue;
        if (techFilter && tech !== techFilter) continue;

        const net = _money(row.net_amount ?? row.total_amount ?? 0);
        const paid = _money(row.paid_amount || 0);
        const status = String(row.paid_status || '').trim();
        const remaining = _money(Math.max(0, net - paid));

        if (net <= 0 || status === 'paid' || remaining <= 0.0001) {
          skipped_paid_rows++;
          continue;
        }

        const note = noteInput || `Legacy paid outside app before payout MVP. Settled by Super Admin cutoff ${cutoff}.`;
        await client.query(
          `INSERT INTO public.technician_payout_payments(
             payout_id, technician_username, paid_amount, paid_status, paid_at, paid_by, slip_url, note, updated_at
           ) VALUES($1,$2,$3,'paid',NOW(),$4,NULL,$5,NOW())
           ON CONFLICT (payout_id, technician_username)
           DO UPDATE SET
             paid_amount=GREATEST(public.technician_payout_payments.paid_amount, EXCLUDED.paid_amount),
             paid_status='paid',
             paid_at=NOW(),
             paid_by=EXCLUDED.paid_by,
             note=COALESCE(NULLIF(public.technician_payout_payments.note,''), EXCLUDED.note),
             updated_at=NOW()`,
          [payout_id, tech, net, actor, note]
        );

        updated_payments++;
        periodTouched = true;
        affected.push({ payout_id, technician_username: tech, paid_amount: net, previous_paid_amount: paid, previous_remaining_amount: remaining });
      }

      if (periodTouched) {
        touched_periods++;
        const paidCheck = await client.query(
          `WITH gross AS (
             SELECT technician_username, COALESCE(SUM(earn_amount),0) AS gross_amount
               FROM public.technician_payout_lines
              WHERE payout_id=$1
              GROUP BY technician_username
           ),
           adj AS (
             SELECT technician_username, COALESCE(SUM(adj_amount),0) AS adj_total
               FROM public.technician_payout_adjustments
              WHERE payout_id=$1
              GROUP BY technician_username
           ),
           dep AS (
             SELECT technician_username, COALESCE(SUM(amount),0) AS deposit_deduction_amount
               FROM public.technician_deposit_ledger
              WHERE payout_id=$1 AND transaction_type='collect'
              GROUP BY technician_username
           )
           SELECT g.technician_username,
                  (g.gross_amount + COALESCE(a.adj_total,0) - COALESCE(d.deposit_deduction_amount,0)) AS net_amount,
                  COALESCE(p.paid_amount,0) AS paid_amount
             FROM gross g
             LEFT JOIN adj a ON a.technician_username=g.technician_username
             LEFT JOIN dep d ON d.technician_username=g.technician_username
             LEFT JOIN public.technician_payout_payments p
               ON p.payout_id=$1 AND p.technician_username=g.technician_username`,
          [payout_id]
        );
        const allPaid = (paidCheck.rows || []).length > 0 && (paidCheck.rows || []).every(r => _paidStatus(r.net_amount, r.paid_amount) === 'paid');
        if (allPaid) {
          await client.query(`UPDATE public.technician_payout_periods SET status='paid' WHERE payout_id=$1`, [payout_id]);
        }
      }
    }

    await client.query('COMMIT');
    return res.json({ ok:true, cutoff_date: cutoff, technician_username: techFilter || null, checked_periods, touched_periods, updated_payments, skipped_paid_rows, affected });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('POST /admin/super/payouts/legacy_settle', e);
    return res.status(500).json({ ok:false, error:'LEGACY_SETTLE_FAILED' });
  } finally {
    client.release();
  }
});

// ---- Super Admin: adjust (create / delete)
app.post('/admin/super/payouts/:payout_id/adjust', requireSuperAdmin, async (req, res) => {
  try {
    const payout_id = String(req.params.payout_id || '').trim();
    const b = req.body || {};
    const tech = String(b.technician_username || '').trim();
    const action = String(b.action || 'create').trim();
    if (!payout_id || !tech) return res.status(400).json({ ok:false, error:'MISSING_PARAMS' });

    const period = await _getPayoutPeriod(payout_id);
    if (!period) return res.status(404).json({ ok:false, error:'PAYOUT_NOT_FOUND' });
    if (String(period.status) === 'paid') return res.status(409).json({ ok:false, error:'PAYOUT_ALREADY_PAID' });

    if (action === 'delete') {
      const adj_id = Number(b.adj_id);
      if (!Number.isFinite(adj_id) || adj_id <= 0) return res.status(400).json({ ok:false, error:'INVALID_ADJ_ID' });
      await pool.query(
        `DELETE FROM public.technician_payout_adjustments WHERE adj_id=$1 AND payout_id=$2 AND technician_username=$3`,
        [adj_id, payout_id, tech]
      );
    } else {
      const adj_amount = _money(b.adj_amount);
      const reason = String(b.reason || '').trim();
      const job_id = (b.job_id==null || String(b.job_id).trim()==='') ? null : String(b.job_id).trim();
      if (!reason) return res.status(400).json({ ok:false, error:'MISSING_REASON' });
      if (!Number.isFinite(adj_amount) || adj_amount === 0) return res.status(400).json({ ok:false, error:'INVALID_AMOUNT' });

      await pool.query(
        `INSERT INTO public.technician_payout_adjustments(payout_id, technician_username, job_id, adj_amount, reason, created_by)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [payout_id, tech, job_id, adj_amount, reason, req.actor?.username || null]
      );
    }

    // Recompute payment status if payment exists
    const payQ = await pool.query(
      `SELECT paid_amount FROM public.technician_payout_payments WHERE payout_id=$1 AND technician_username=$2 LIMIT 1`,
      [payout_id, tech]
    );
    if ((payQ.rows || []).length) {
      const paid_amount = _money(payQ.rows[0].paid_amount || 0);
      const { net_amount } = await _getTechGrossAdjNet(payout_id, tech);
      const paid_status = _paidStatus(net_amount, paid_amount);
      await pool.query(
        `UPDATE public.technician_payout_payments
            SET paid_status=$3, updated_at=NOW()
          WHERE payout_id=$1 AND technician_username=$2`,
        [payout_id, tech, paid_status]
      );
    }

    // keep payout locked if draft (adjust means numbers matter)
    if (String(period.status) === 'draft') {
      await pool.query(`UPDATE public.technician_payout_periods SET status='locked' WHERE payout_id=$1 AND status='draft'`, [payout_id]);
    }

    return res.json({ ok:true, payout_id, technician_username: tech });
  } catch (e) {
    console.error('POST /admin/super/payouts/:payout_id/adjust', e);
    if (String(e.code||'') === 'PAYOUT_NOT_FOUND') return res.status(404).json({ ok:false, error:'PAYOUT_NOT_FOUND' });
    return res.status(500).json({ ok:false, error:'ADJUST_FAILED' });
  }
});

// ---- Technician: payroll slip (HTML)
app.get('/tech/payouts/:payout_id/slip', requireTechnicianSession, async (req, res) => {
  try {
    const tech = String(req.auth?.username || '').trim();
    const payout_id = String(req.params.payout_id || '').trim();
    if (!payout_id) return res.status(400).send('MISSING_PAYOUT_ID');

    const parsed = _parsePayoutId(payout_id);

    // ✅ อนุญาตสลิปแม้ยังไม่ได้ generate งวด (งวดเสมือน)
    let period = await _getPayoutPeriod(payout_id);
    let bounds = null;
    if (!period) {
      if (!parsed) return res.status(404).send('PAYOUT_NOT_FOUND');
      bounds = _periodBoundsForYm(parsed.type, parsed.y, parsed.m);
      period = {
        payout_id,
        status: 'draft',
        period_type: parsed.type,
        period_start: bounds.start.toISOString(),
        period_end: bounds.endEx.toISOString()
      };
    }

    if (!bounds && parsed) {
      bounds = _periodBoundsForYm(parsed.type, parsed.y, parsed.m);
    }

    // lines: ใช้ DB ถ้ามี ไม่งั้นคำนวณสดเฉพาะงวดนั้น
    const dataQ = await pool.query(
      `SELECT job_id, finished_at, earn_amount, detail_json
         FROM public.technician_payout_lines
        WHERE payout_id=$1 AND technician_username=$2
        ORDER BY finished_at ASC, line_id ASC`,
      [payout_id, tech]
    );

    let rows = dataQ.rows || [];
    if (!rows.length && bounds) {
      const calc = await _computeTechLinesInRange(tech, bounds.start, bounds.endEx, { payout_id, period_type: bounds.period_type, label_ym: bounds.label_ym });
      rows = (calc || []).map(x => ({
        job_id: x.job_id,
        finished_at: x.finished_at,
        earn_amount: x.earn_amount,
        detail_json: x.detail_json
      }));
    }

    const adjQ = await pool.query(
      `SELECT adj_id, job_id, adj_amount, reason, created_at
         FROM public.technician_payout_adjustments
        WHERE payout_id=$1 AND technician_username=$2
        ORDER BY created_at ASC, adj_id ASC`,
      [payout_id, tech]
    );

    const payQ = await pool.query(
      `SELECT paid_amount, paid_status, paid_at, slip_url, note
         FROM public.technician_payout_payments
        WHERE payout_id=$1 AND technician_username=$2
        LIMIT 1`,
      [payout_id, tech]
    );

    const gross = (rows || []).reduce((a, it) => a + _money(it.earn_amount || 0), 0);
    const adj_total = (adjQ.rows || []).reduce((a, it) => a + _money(it.adj_amount || 0), 0);
    const deposit_deduction_amount = await _getDepositDeductionForPayout(payout_id, tech);
    const deposit = await _getDepositSummary(tech);
    const net = _money(gross + adj_total - deposit_deduction_amount);

    const payment = payQ.rows[0] || null;
    const paid_amount = _money(payment?.paid_amount || 0);
    const remaining = _money(net - paid_amount);

    let tpl = '';
    try{
      tpl = fs.readFileSync(path.join(__dirname, 'payroll-slip.html'), 'utf-8');
    }catch(e){
      tpl = '<html><head><meta charset="utf-8"><title>Payroll Slip</title></head><body>{{BODY}}</body></html>';
    }

    const esc = (s)=>String(s||'').replace(/[&<>"]/g,(c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
    const fmtBaht = (n)=> {
      const x = _money(n);
      try { return x.toLocaleString('th-TH', { minimumFractionDigits:0, maximumFractionDigits:0 }) + ' ฿'; } catch { return String(Math.round(x))+' ฿'; }
    };
    const fmtDate = (d)=>{ try{ const x=new Date(d); if (Number.isNaN(x.getTime())) return '-'; return x.toLocaleDateString('th-TH',{year:'numeric',month:'short',day:'numeric'});}catch{return '-';} };

    const slipDocNo = `CWF-PAY-${String(payout_id || '').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-+|-+$/g,'')}-${String(tech || '').replace(/[^A-Za-z0-9ก-๙]+/g,'-').replace(/^-+|-+$/g,'')}`.toUpperCase();
    const issuedAtTh = new Date().toLocaleString('th-TH', { timeZone:'Asia/Bangkok' });

    const rowsHtml = (rows||[]).map(r=>{
      const dj = r.detail_json || {};
      const jt = esc(dj.job_type||'');
      const ac = esc(dj.ac_type||'');
      const wv = esc(dj.wash_variant||'');
      const desc = [jt, ac, wv].filter(Boolean).join(' • ');
      return `<tr>
        <td class="mono">#${esc(r.job_id)}</td>
        <td>${esc(fmtDate(r.finished_at))}</td>
        <td>${desc||'-'}</td>
        <td class="right">${esc(fmtBaht(r.earn_amount))}</td>
      </tr>`;
    }).join('');

    const adjHtml = (adjQ.rows||[]).map(a=>{
      const j = a.job_id ? `#${esc(a.job_id)}` : '-';
      return `<tr>
        <td class="mono">${esc(j)}</td>
        <td>${esc(fmtDate(a.created_at))}</td>
        <td>${esc(a.reason)}</td>
        <td class="right">${esc(fmtBaht(a.adj_amount))}</td>
      </tr>`;
    }).join('');

    const body = `
      <div class="wrap">
        <div class="top">
          <div>
            <div class="brandRow">
              <img class="brandMark" src="/logo.png" alt="Coldwindflow logo" />
              <div>
                <div class="brand">Coldwindflow Air Services</div>
                <div class="subbrand">Technician Payout Slip • สลิปงวดช่าง</div>
                <div class="companyMeta">
                  <span class="companyContact"><strong>ที่อยู่:</strong> 23/61 ถ.พึ่งมี 50 แขวงบางจาก เขตพระโขนง กรุงเทพฯ 10260</span>
                  <span class="companyContact"><strong>โทร:</strong> 098-877-7321</span>
                </div>
              </div>
            </div>
          </div>
          <div class="right">
            <div class="docLabel">เลขที่เอกสาร</div>
            <div><b class="mono">${esc(slipDocNo)}</b></div>
            <div class="muted">งวด ${esc(period.period_type)} • ${esc(fmtDate(period.period_start))} - ${esc(fmtDate(period.period_end))}</div>
            <div class="muted">Payout ID: ${esc(payout_id)}</div>
          </div>
        </div>

        <div class="grid">
          <div class="card soft">
            <div class="row"><span class="muted">เลขที่เอกสาร</span><b class="mono">${esc(slipDocNo)}</b></div>
            <div class="row"><span class="muted">ช่าง</span><b class="mono">${esc(tech)}</b></div>
          <div class="row"><span class="muted">ยอดงวด (ก่อนปรับ)</span><b>${esc(fmtBaht(gross))}</b></div>
          <div class="row"><span class="muted">ปรับยอด (รวม)</span><b>${esc(fmtBaht(adj_total))}</b></div>
          <div class="row deposit-row"><span class="muted">หักเงินประกันงาน</span><b>${esc(fmtBaht(deposit_deduction_amount))}</b></div>
          <div class="row"><span class="muted">ยอดสุทธิ</span><b>${esc(fmtBaht(net))}</b></div>
          <div class="row"><span class="muted">เงินประกัน เป้า/เก็บแล้ว/คงเหลือ</span><b>${esc(fmtBaht(deposit.deposit_target_amount))} / ${esc(fmtBaht(deposit.deposit_collected_total))} / ${esc(fmtBaht(deposit.deposit_remaining_amount))}</b></div>
          <div class="row"><span class="muted">จ่ายแล้ว</span><b>${esc(fmtBaht(paid_amount))}</b></div>
          <div class="row"><span class="muted">คงเหลือ</span><b>${esc(fmtBaht(remaining))}</b></div>
          <div class="row"><span class="muted">สถานะ</span><b>${esc(payment?.paid_status || _paidStatus(net, paid_amount))}</b></div>
          </div>
          <div class="card yellow">
            <div class="row total"><span>ยอดสุทธิที่ใช้จ่าย</span><b>${esc(fmtBaht(net))}</b></div>
            <div class="row"><span>จ่ายแล้ว</span><b>${esc(fmtBaht(paid_amount))}</b></div>
            <div class="row"><span>คงเหลือ</span><b>${esc(fmtBaht(remaining))}</b></div>
            <div class="row"><span>วันที่จ่าย</span><b>${esc(payment?.paid_at ? fmtDate(payment.paid_at) : '-')}</b></div>
          </div>
        </div>

        <h3>รายการงาน</h3>
        <table>
          <thead><tr><th>งาน</th><th>วันที่เสร็จ</th><th>รายละเอียด</th><th class="right">รายได้</th></tr></thead>
          <tbody>${rowsHtml || '<tr><td colspan="4" class="muted">-</td></tr>'}</tbody>
        </table>

        <h3 style="margin-top:18px">รายการปรับยอด (Audit)</h3>
        <table>
          <thead><tr><th>งาน</th><th>วันที่</th><th>เหตุผล</th><th class="right">จำนวน</th></tr></thead>
          <tbody>${adjHtml || '<tr><td colspan="4" class="muted">-</td></tr>'}</tbody>
        </table>

        <div class="sign">
          <div class="signBox">
            <div class="signLine"></div>
            <div class="signTitle">ผู้รับเงิน / Technician</div>
            <div class="signName mono">${esc(tech)}</div>
            <div class="signDate">วันที่ ______ / ______ / ______</div>
          </div>
          <div class="signBox">
            <div class="signLine"></div>
            <div class="signTitle">ผู้อนุมัติจ่าย / Company Authorized Signature</div>
            <div class="signName">Coldwindflow Air Services</div>
            <div class="signDate">วันที่ ______ / ______ / ______</div>
          </div>
        </div>

        <div class="foot muted">
          <div>
            <div>เลขที่เอกสาร: ${esc(slipDocNo)}</div>
            <div>ออกเอกสารเมื่อ: ${esc(issuedAtTh)}</div>
            <div>Coldwindflow Air Services • 23/61 ถ.พึ่งมี 50 แขวงบางจาก เขตพระโขนง กรุงเทพฯ 10260 • โทร 098-877-7321</div>
          </div>
          ${payment?.slip_url ? `<div>หลักฐานแนบ: ${esc(payment.slip_url)}</div>` : ''}
        </div>

        <div class="printbar">
          <button class="secondary" onclick="history.back()">กลับ</button>
          <button onclick="window.print()">พิมพ์ / Save PDF</button>
        </div>
      </div>
    `;

    const html = tpl.replace('{{BODY}}', body)
                    .replace('{{TITLE}}', esc(`Slip ${payout_id} ${tech}`));
    res.setHeader('Content-Type','text/html; charset=utf-8');
    return res.send(html);
  } catch (e) {
    console.error('GET /tech/payouts/:payout_id/slip', e);
    return res.status(500).send('SLIP_FAILED');
  }
});

// =======================================
// 🧑‍🔧 Payout Periods (Technician) - Phase 1
// =======================================

app.get('/tech/payouts', requireTechnicianSession, async (req, res) => {
  try {
    const tech = String(req.auth?.username || '').trim();

    // ✅ สร้างรายการงวด "เสมือน" ให้ช่างเห็นได้เลย (ไม่ต้องกดสร้างงวด)
    const periods = _recentPeriods(6, _bkkNow());

    const rows = [];
    for (const p of periods) {
      // 1) meta/status จากตาราง period ถ้ามี
      const metaQ = await pool.query(
        `SELECT payout_id, status, period_start, period_end
           FROM public.technician_payout_periods
          WHERE payout_id=$1
          LIMIT 1`,
        [p.payout_id]
      );
      const meta = metaQ.rows[0] || null;
      const status = meta?.status || 'draft';
      const period_start = meta?.period_start || p.start.toISOString();
      const period_end = meta?.period_end || p.endEx.toISOString();

      // 2) gross: ถ้ามี lines ใน DB ใช้ DB ก่อน (เร็ว) ไม่งั้นคำนวณสดเฉพาะช่วงนั้น
      const hasLinesQ = await pool.query(
        `SELECT COUNT(*)::int AS c
           FROM public.technician_payout_lines
          WHERE payout_id=$1 AND technician_username=$2`,
        [p.payout_id, tech]
      );
      const hasLines = Number(hasLinesQ.rows[0]?.c || 0) > 0;

      let gross_amount = 0;
      let lines_count = 0;

      if (hasLines && _payoutCanUseStoredLines(status)) {
        const g = await pool.query(
          `SELECT COALESCE(SUM(earn_amount),0) AS gross_amount, COUNT(*)::int AS lines_count
             FROM public.technician_payout_lines
            WHERE payout_id=$1 AND technician_username=$2`,
          [p.payout_id, tech]
        );
        gross_amount = Number(g.rows[0]?.gross_amount || 0);
        lines_count = Number(g.rows[0]?.lines_count || 0);
      } else {
        const calcLines = await _computeTechLinesInRange(tech, p.start, p.endEx, { payout_id: p.payout_id, period_type: p.period_type, label_ym: p.label_ym });
        gross_amount = calcLines.reduce((a, it) => a + Number(it.earn_amount || 0), 0);
        lines_count = calcLines.length;
      }

      // 3) adjustments + payments (Phase 2)
      const adjQ = await pool.query(
        `SELECT COALESCE(SUM(adj_amount),0) AS adj_total
           FROM public.technician_payout_adjustments
          WHERE payout_id=$1 AND technician_username=$2`,
        [p.payout_id, tech]
      );
      const adj_total = Number(adjQ.rows[0]?.adj_total || 0);

      const payQ = await pool.query(
        `SELECT COALESCE(paid_amount,0) AS paid_amount, COALESCE(paid_status,'unpaid') AS paid_status, paid_at, slip_url
           FROM public.technician_payout_payments
          WHERE payout_id=$1 AND technician_username=$2
          LIMIT 1`,
        [p.payout_id, tech]
      );
      const payment = payQ.rows[0] || null;
      const paid_amount = Number(payment?.paid_amount || 0);
      const paid_status = String(payment?.paid_status || (paid_amount > 0 ? 'partial' : 'unpaid'));

      const deposit_deduction_amount = await _getDepositDeductionForPayout(p.payout_id, tech);
      const deposit = await _getDepositSummary(tech);
      const net_amount = _money(gross_amount + adj_total - deposit_deduction_amount);
      const remaining_amount = _money(net_amount - paid_amount);
      const paid_status_calc = _paidStatus(net_amount, paid_amount);

      rows.push({
        payout_id: p.payout_id,
        period_type: p.period_type,
        period_start,
        period_end,
        status,
        gross_amount,
        adj_total,
        deposit_deduction_amount,
        net_amount,
        paid_amount,
        paid_status: paid_status_calc,
        remaining_amount,
        ...deposit,
        latest_deposit_deduction: deposit_deduction_amount,
        lines_count,
        paid_at: payment?.paid_at || null,
        slip_url: payment?.slip_url || null,
      });
    }

    // sort latest first by period_start
    rows.sort((a, b) => new Date(b.period_start).getTime() - new Date(a.period_start).getTime());
    return res.json({ ok: true, username: tech, payouts: rows });
  } catch (e) {
    console.error('GET /tech/payouts', e);
    return res.status(500).json({ ok: false, error: 'LOAD_FAILED' });
  }
});

app.get('/tech/payouts/:payout_id', requireTechnicianSession, async (req, res) => {
  try {
    const tech = String(req.auth?.username || '').trim();
    const payout_id = String(req.params.payout_id || '').trim();
    if (!payout_id) return res.status(400).json({ ok: false, error: 'MISSING_PAYOUT_ID' });

    const parsed = _parsePayoutId(payout_id);
    if (!parsed) return res.status(400).json({ ok: false, error: 'INVALID_PAYOUT_ID' });

    const bounds = _periodBoundsForYm(parsed.type, parsed.y, parsed.m);

    // meta/status จาก period ถ้ามี (ไม่มีก็ถือว่า draft)
    const metaQ = await pool.query(
      `SELECT payout_id, status, period_start, period_end
         FROM public.technician_payout_periods
        WHERE payout_id=$1
        LIMIT 1`,
      [payout_id]
    );
    const meta = metaQ.rows[0] || null;
    const status = meta?.status || 'draft';

    // v10: draft/unpaid period detail must recompute live from contract engine.
    // Stored payout_lines are trusted only after locked/paid to avoid showing old 350/1400 rows.
    const loadedLines = await _loadPayoutLinesForTech({
      payout_id,
      tech,
      status,
      start: bounds.start,
      endEx: bounds.endEx,
      period_type: bounds.period_type,
      label_ym: bounds.label_ym,
    });
    let lines = loadedLines.lines || [];

    const adjQ = await pool.query(
      `SELECT adj_id, job_id, adj_amount, reason, created_at
         FROM public.technician_payout_adjustments
        WHERE payout_id=$1 AND technician_username=$2
        ORDER BY created_at ASC, adj_id ASC`,
      [payout_id, tech]
    );

    const payQ = await pool.query(
      `SELECT paid_amount, paid_status, paid_at, slip_url, note
         FROM public.technician_payout_payments
        WHERE payout_id=$1 AND technician_username=$2
        LIMIT 1`,
      [payout_id, tech]
    );

    const gross = (lines || []).reduce((a, it) => a + Number(it.earn_amount || 0), 0);
    const adj_total = (adjQ.rows || []).reduce((a, it) => a + Number(it.adj_amount || 0), 0);
    const deposit_deduction_amount = await _getDepositDeductionForPayout(payout_id, tech);
    const deposit = await _getDepositSummary(tech);
    const net = _money(gross + adj_total - deposit_deduction_amount);
    const payment = payQ.rows[0] || null;
    const paid_amount = Number(payment?.paid_amount || 0);
    const remaining = _money(net - paid_amount);

    const profile = await _getTechProfile(tech);
    const wrQ = await pool.query(
      `SELECT request_id, amount_requested, status, note, created_at, approved_at, approved_by, paid_at
         FROM public.technician_withdraw_requests
        WHERE payout_id=$1 AND technician_username=$2
        ORDER BY created_at DESC, request_id DESC
        LIMIT 1`,
      [payout_id, tech]
    );
    const withdraw_request = wrQ.rows[0] || null;

    return res.json({
      ok: true,
      payout_id,
      username: tech,
      profile: profile ? {
        employment_type: profile.employment_type,
        compensation_mode: profile.compensation_mode,
        daily_wage_amount: Number(profile.daily_wage_amount || 0),
        monthly_salary_amount: Number(profile.monthly_salary_amount || 0),
      } : null,
      status,
      source: loadedLines.source,
      period_type: parsed.type,
      period_start: meta?.period_start || bounds.start.toISOString(),
      period_end: meta?.period_end || bounds.endEx.toISOString(),
      gross_amount: gross,
      adj_total,
      deposit_deduction_amount,
      net_amount: net,
      paid_amount,
      paid_status: _paidStatus(net, paid_amount),
      remaining_amount: remaining,
      ...deposit,
      latest_deposit_deduction: deposit_deduction_amount,
      payment,
      withdraw_request,
      adjustments: adjQ.rows || [],
      total_amount: net,
      lines
    });
  } catch (e) {
    console.error('GET /tech/payouts/:payout_id', e);
    return res.status(500).json({ ok: false, error: 'LOAD_FAILED' });
  }
});

// =======================================
// 💳 Withdraw Requests (Partner)
// - Partner ต้องกดขอถอนก่อนจ่าย
// =======================================
app.post('/tech/withdraw_requests', requireTechnicianSession, async (req, res) => {
  try {
    const tech = String(req.auth?.username || '').trim();
    const b = req.body || {};
    const payout_id = String(b.payout_id || '').trim();
    if (!payout_id) return res.status(400).json({ ok:false, error:'MISSING_PAYOUT_ID' });
    const parsed = _parsePayoutId(payout_id);
    if (!parsed) return res.status(400).json({ ok:false, error:'INVALID_PAYOUT_ID' });

    const prof = await _getTechProfile(tech);
    if (String(prof?.employment_type || 'company').toLowerCase() !== 'partner') {
      return res.status(409).json({ ok:false, error:'NOT_PARTNER' });
    }

    // compute remaining
    const bounds = _periodBoundsForYm(parsed.type, parsed.y, parsed.m);
    const hasLinesQ = await pool.query(
      `SELECT COUNT(*)::int AS c FROM public.technician_payout_lines WHERE payout_id=$1 AND technician_username=$2`,
      [payout_id, tech]
    );
    const hasLines = Number(hasLinesQ.rows[0]?.c || 0) > 0;
    let gross = 0;
    if (hasLines) {
      const g = await pool.query(
        `SELECT COALESCE(SUM(earn_amount),0) AS gross_amount FROM public.technician_payout_lines WHERE payout_id=$1 AND technician_username=$2`,
        [payout_id, tech]
      );
      gross = Number(g.rows[0]?.gross_amount || 0);
    } else {
      const calc = await _computeTechLinesInRange(tech, bounds.start, bounds.endEx, { payout_id, period_type: bounds.period_type, label_ym: bounds.label_ym });
      gross = (calc || []).reduce((a, it) => a + Number(it.earn_amount || 0), 0);
    }
    const adjQ = await pool.query(
      `SELECT COALESCE(SUM(adj_amount),0) AS adj_total FROM public.technician_payout_adjustments WHERE payout_id=$1 AND technician_username=$2`,
      [payout_id, tech]
    );
    const adj_total = Number(adjQ.rows[0]?.adj_total || 0);
    const deposit_deduction_amount = await _getDepositDeductionForPayout(payout_id, tech);
    const net = _money(gross + adj_total - deposit_deduction_amount);
    const payQ = await pool.query(
      `SELECT COALESCE(paid_amount,0) AS paid_amount FROM public.technician_payout_payments WHERE payout_id=$1 AND technician_username=$2 LIMIT 1`,
      [payout_id, tech]
    );
    const paid_amount = Number(payQ.rows[0]?.paid_amount || 0);
    const remaining = _money(net - paid_amount);

    const reqAmount = (b.amount_requested == null || String(b.amount_requested).trim()==='') ? remaining : _money(b.amount_requested);
    if (!Number.isFinite(reqAmount) || reqAmount <= 0) return res.status(400).json({ ok:false, error:'INVALID_AMOUNT' });

    // prevent duplicates: if there is already requested/approved
    const existQ = await pool.query(
      `SELECT request_id, status
         FROM public.technician_withdraw_requests
        WHERE payout_id=$1 AND technician_username=$2
          AND status IN ('requested','approved')
        ORDER BY created_at DESC, request_id DESC
        LIMIT 1`,
      [payout_id, tech]
    );
    if ((existQ.rows || []).length) {
      return res.json({ ok:true, payout_id, request_id: existQ.rows[0].request_id, status: existQ.rows[0].status, already_exists: true });
    }

    const note = String(b.note || '').trim() || null;
    const ins = await pool.query(
      `INSERT INTO public.technician_withdraw_requests(payout_id, technician_username, amount_requested, status, note)
       VALUES($1,$2,$3,'requested',$4)
       RETURNING request_id, status, created_at`,
      [payout_id, tech, _money(reqAmount), note]
    );
    return res.json({ ok:true, payout_id, request: ins.rows[0] });
  } catch (e) {
    console.error('POST /tech/withdraw_requests', e);
    return res.status(500).json({ ok:false, error:'WITHDRAW_REQUEST_FAILED' });
  }
});

app.get('/tech/withdraw_requests', requireTechnicianSession, async (req, res) => {
  try {
    const tech = String(req.auth?.username || '').trim();
    const payout_id = String(req.query.payout_id || '').trim() || null;
    const q = await pool.query(
      `SELECT request_id, payout_id, amount_requested, status, note, created_at, approved_at, approved_by, decided_note, paid_at
         FROM public.technician_withdraw_requests
        WHERE technician_username=$1
          AND ($2::text IS NULL OR payout_id=$2)
        ORDER BY created_at DESC, request_id DESC
        LIMIT 50`,
      [tech, payout_id]
    );
    res.json({ ok:true, requests: q.rows || [] });
  } catch (e) {
    console.error('GET /tech/withdraw_requests', e);
    res.status(500).json({ ok:false, error:'LOAD_FAILED' });
  }
});

app.get('/admin/super/withdraw_requests', requireSuperAdmin, async (req, res) => {
  try {
    const payout_id = String(req.query.payout_id || '').trim() || null;
    const st = String(req.query.status || '').trim() || null;
    const q = await pool.query(
      `SELECT request_id, payout_id, technician_username, amount_requested, status, note, created_at, approved_at, approved_by, decided_note, paid_at, paid_by
         FROM public.technician_withdraw_requests
        WHERE ($1::text IS NULL OR payout_id=$1)
          AND ($2::text IS NULL OR status=$2)
        ORDER BY created_at DESC, request_id DESC
        LIMIT 200`,
      [payout_id, st]
    );
    res.json({ ok:true, requests: q.rows || [] });
  } catch (e) {
    console.error('GET /admin/super/withdraw_requests', e);
    res.status(500).json({ ok:false, error:'LOAD_FAILED' });
  }
});

app.post('/admin/super/withdraw_requests/:request_id/approve', requireSuperAdmin, async (req, res) => {
  try {
    const id = Number(req.params.request_id);
    const note = String((req.body||{}).note || '').trim() || null;
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok:false, error:'INVALID_REQUEST_ID' });
    await pool.query(
      `UPDATE public.technician_withdraw_requests
          SET status='approved', approved_at=NOW(), approved_by=$2, decided_note=$3
        WHERE request_id=$1 AND status='requested'`,
      [id, req.actor?.username || null, note]
    );
    res.json({ ok:true });
  } catch (e) {
    console.error('POST /admin/super/withdraw_requests/:id/approve', e);
    res.status(500).json({ ok:false, error:'APPROVE_FAILED' });
  }
});

app.post('/admin/super/withdraw_requests/:request_id/reject', requireSuperAdmin, async (req, res) => {
  try {
    const id = Number(req.params.request_id);
    const note = String((req.body||{}).note || '').trim();
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok:false, error:'INVALID_REQUEST_ID' });
    if (!note) return res.status(400).json({ ok:false, error:'MISSING_REASON' });
    await pool.query(
      `UPDATE public.technician_withdraw_requests
          SET status='rejected', approved_at=NOW(), approved_by=$2, decided_note=$3
        WHERE request_id=$1 AND status IN ('requested','approved')`,
      [id, req.actor?.username || null, note]
    );
    res.json({ ok:true });
  } catch (e) {
    console.error('POST /admin/super/withdraw_requests/:id/reject', e);
    res.status(500).json({ ok:false, error:'REJECT_FAILED' });
  }
});

// =======================================
// 💰 Technician Income Summary (for technician UI)
// - รายได้วันนี้ / เดือนนี้ / สะสมทั้งหมด
// - ใช้ finished_at + payout engine เดียวกับ Super Admin calc
// =======================================
function toBangkokDateKey(d) {
  try {
    // Asia/Bangkok = UTC+7 (no DST)
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    const ms = dt.getTime() + (7 * 60 * 60 * 1000);
    const b = new Date(ms);
    const y = b.getUTCFullYear();
    const m = String(b.getUTCMonth() + 1).padStart(2, '0');
    const day = String(b.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch { return ''; }
}

function parseDateYMD(s) {
  const x = String(s || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x)) return '';
  return x;
}

// NOTE: some tech clients may lose cookie/session in PWA webview.
// Fail-open by allowing ?username= for technicians only (validated against DB).
app.get('/tech/income_summary', async (req, res) => {
  try {
    let tech = String(req.effective?.username || '').trim();
    if (!tech) {
      const qUser = String(req.query.username || '').trim();
      if (!qUser) return res.status(401).json({ error: 'UNAUTHORIZED' });
      // Validate that this username is a real technician account (fail-closed).
      const vr = await pool.query(
        `SELECT username
         FROM public.technician_profiles
         WHERE username=$1
         LIMIT 1`,
        [qUser]
      );
      if (!vr.rows || !vr.rows.length) return res.status(403).json({ error: 'FORBIDDEN' });
      tech = qUser;
    }

    const qDate = parseDateYMD(req.query.date);
    const todayKey = toBangkokDateKey(new Date());
    const dateKey = qDate || todayKey;
    const ymKey = dateKey.slice(0, 7); // YYYY-MM

    // Fetch finished jobs where technician is in the job team/assignments
    const donePred = _sqlDonePredicate('j');
    const jobsQ = await pool.query(
      `SELECT j.job_id, j.finished_at
       FROM public.jobs j
       WHERE ${donePred}
         AND j.finished_at IS NOT NULL
         AND (
           j.technician_username = $1
           OR EXISTS (SELECT 1 FROM public.job_team_members tm WHERE tm.job_id=j.job_id AND tm.username=$1)
           OR EXISTS (SELECT 1 FROM public.job_assignments a WHERE a.job_id=j.job_id AND a.technician_username=$1)
         )
       ORDER BY j.finished_at DESC`,
      [tech]
    );
    const jobs = jobsQ.rows || [];

    let day_total = 0;
    let month_total = 0;
    let all_total = 0;
    let computed = 0;

    // Safety cap (กันระบบตันถ้ามีงานเยอะผิดปกติ)
    // NOTE: "สะสมทั้งหมด" ต้องคิดจากงานที่เสร็จสิ้นทั้งหมด
    // ตั้ง cap สูงมากเพื่อใช้งานจริง และยังกันเคสผิดปกติแบบสุดโต่ง
    const HARD_CAP = 50000;
    const slice = jobs.length > HARD_CAP ? jobs.slice(0, HARD_CAP) : jobs;

    for (const row of slice) {
      const job_id = Number(row.job_id);
      const fKey = toBangkokDateKey(row.finished_at);
      const fYm = fKey ? fKey.slice(0, 7) : '';
      let inc = 0;
      try {
        // ✅ ใช้เครื่องยนต์เดียวกับ "งวดเงินเดือน" เพื่อให้ % ขั้นบันไดตรงกัน (แก้รายได้ไม่ตรง)
        const lines = await _buildPayoutLinesForJob(job_id);
        const meLine = (lines || []).find(x => String(x.technician_username) === tech);
        inc = Number(meLine?.earn_amount || 0);
      } catch (e) {
        continue;
      }
all_total += inc;
      if (fYm === ymKey) month_total += inc;
      if (fKey === dateKey) day_total += inc;
      computed++;
    }

    const outstanding = await _computeTechnicianTrueOutstanding(tech);
    const payoutMonth = await _computeTechnicianPayoutMonthTotal(tech, ymKey);
    const monthlyStart = payoutMonth.monthly_income_period_start ? new Date(payoutMonth.monthly_income_period_start) : null;
    const monthlyEnd = payoutMonth.monthly_income_period_end ? new Date(payoutMonth.monthly_income_period_end) : null;
    const workSummary = (monthlyStart && monthlyEnd && !Number.isNaN(monthlyStart.getTime()) && !Number.isNaN(monthlyEnd.getTime()))
      ? await _computeTechnicianWorkSummary(tech, monthlyStart, monthlyEnd, payoutMonth.payout_month || ymKey)
      : { cards: [], groups: [], total_machines: 0, jobs_count: 0 };
    const depositSummary = await _getDepositSummary(tech);

    return res.json({
      ok: true,
      username: tech,
      date: dateKey,
      month: ymKey,
      day_total,
      month_total,
      all_total,
      lifetime_income_total: all_total,
      payout_month: payoutMonth.payout_month || ymKey,
      payout_month_total: payoutMonth.payout_month_total || 0,
      payout_month_net_total: payoutMonth.payout_month_net_total || 0,
      payout_month_policy: payoutMonth.payout_month_policy || 'sum_payout_10_and_25_for_label_month',
      payout_month_periods: payoutMonth.periods || [],
      monthly_income_display_amount: payoutMonth.monthly_income_display_amount ?? payoutMonth.payout_month_total ?? 0,
      monthly_income_display_label: payoutMonth.monthly_income_display_label || payoutMonth.payout_month || ymKey,
      monthly_income_period_start: payoutMonth.monthly_income_period_start || null,
      monthly_income_period_end: payoutMonth.monthly_income_period_end || null,
      work_summary: workSummary,
      deposit_target_amount: depositSummary.deposit_target_amount || 0,
      deposit_collected_total: depositSummary.deposit_collected_total || 0,
      deposit_remaining_amount: depositSummary.deposit_remaining_amount || 0,
      deposit_is_required: depositSummary.deposit_is_required !== false,
      // Backward-compatible fields kept for old clients, but the new income card no longer uses them.
      true_outstanding_amount: outstanding.true_outstanding_amount,
      pending_payout_remaining_total: outstanding.true_outstanding_amount,
      paid_total: outstanding.paid_total,
      outstanding_policy: outstanding.outstanding_policy || 'locked_pending_only',
      outstanding_periods_count: outstanding.periods_count,
      jobs_count: jobs.length,
      computed_jobs: computed,
      capped: jobs.length > HARD_CAP
    });
  } catch (e) {
    console.error('GET /tech/income_summary', e);
    return res.status(500).json({ error: 'LOAD_FAILED' });
  }
});

/**
 * (Phase 4 UX) สรุปเร็ว: วันนี้ + เดือนนี้ (fast) เพื่อโชว์บนการ์ดหลัก
 * - ไม่ต้องไล่งานทั้งหมดเหมือน /tech/income_summary
 * - ยังใช้ engine เดียวกับงวด (step ladder) ผ่าน _buildPayoutLinesForJob
 * GET /tech/income_today_month
 */
app.get('/tech/income_today_month', async (req, res) => {
  try {
    // fail-open like /tech/income_summary (some PWA lose cookie)
    let tech = String(req.effective?.username || '').trim();
    if (!tech) {
      const qUser = String(req.query.username || '').trim();
      if (!qUser) return res.status(401).json({ ok:false, error: 'UNAUTHORIZED' });
      const vr = await pool.query(
        `SELECT username FROM public.technician_profiles WHERE username=$1 LIMIT 1`,
        [qUser]
      );
      if (!vr.rows || !vr.rows.length) return res.status(403).json({ ok:false, error: 'FORBIDDEN' });
      tech = qUser;
    }

    const nowBkk = _bkkNow();
    const { y, m, d } = _bkkYmd(nowBkk);
    const todayStart = _bangkokMidnightUTC(y, m, d);
    const tomorrowStart = _bangkokMidnightUTC(y, m, d + 1);

    // month range
    const monthStart = _bangkokMidnightUTC(y, m, 1);
    let ny = y, nm = m + 1;
    if (nm > 12) { nm = 1; ny = y + 1; }
    const nextMonthStart = _bangkokMidnightUTC(ny, nm, 1);

    const donePred = _sqlDonePredicate('j');
    const jobsQ = await pool.query(
      `SELECT j.job_id, j.finished_at
         FROM public.jobs j
        WHERE ${donePred}
          AND j.finished_at IS NOT NULL
          AND j.finished_at >= $1 AND j.finished_at < $2
          AND (
            j.technician_username = $3
            OR EXISTS (SELECT 1 FROM public.job_team_members tm WHERE tm.job_id=j.job_id AND tm.username=$3)
            OR EXISTS (SELECT 1 FROM public.job_assignments a WHERE a.job_id=j.job_id AND a.technician_username=$3)
          )
        ORDER BY j.finished_at DESC`,
      [monthStart.toISOString(), nextMonthStart.toISOString(), tech]
    );
    const rows = jobsQ.rows || [];

    let day_total = 0;
    let month_total = 0;
    let computed = 0;

    // cap เฉพาะเดือน (กันเคสผิดปกติ)
    const HARD_CAP = 2000;
    const slice = rows.length > HARD_CAP ? rows.slice(0, HARD_CAP) : rows;

    for (const row of slice) {
      const job_id = Number(row.job_id);
      let inc = 0;
      try {
        const lines = await _buildPayoutLinesForJob(job_id);
        const meLine = (lines || []).find(x => String(x.technician_username) === tech);
        inc = Number(meLine?.earn_amount || 0);
      } catch (e) {
        continue;
      }
      month_total += inc;
      computed++;
      const finishedAt = row.finished_at ? new Date(row.finished_at) : null;
      if (finishedAt && finishedAt >= todayStart && finishedAt < tomorrowStart) {
        day_total += inc;
      }
    }

    return res.json({ ok:true, username: tech, day_total, month_total, jobs_count: rows.length, computed_jobs: computed, capped: rows.length > HARD_CAP });
  } catch (e) {
    console.error('GET /tech/income_today_month', e);
    return res.status(500).json({ ok:false, error:'LOAD_FAILED' });
  }
});

/**
 * (Phase 4 UX) งวดถัดไปที่ระบบโชว์บนการ์ด: "คาดว่าจะได้งวดถัดไป"
 * - วันที่ 1-15: งวด 25 ของเดือนนี้
 * - วันที่ 16-สิ้นเดือน: งวด 10 ของเดือนหน้า
 */
// Current rule: Bangkok day 1-15 => current month 25 cycle; day 16-end => next month 10 cycle.
app.get('/tech/income_next_period_estimate', requireTechnicianSession, async (req, res) => {
  try {
    const tech = String(req.auth?.username || '').trim();
    const nowBkk = _bkkNow();
    const { y, m, d } = _bkkYmd(nowBkk);

    let bounds;
    if (d <= 15) {
      bounds = _periodBoundsForYm('25', y, m);
    } else {
      // 16..end => งวด 10 ของเดือนหน้า
      let ny = y, nm = m + 1;
      if (nm > 12) { nm = 1; ny = y + 1; }
      bounds = _periodBoundsForYm('10', ny, nm);
    }

    const start = bounds.start;
    const endEx = bounds.endEx;
    const nowUtc = new Date();
    const effectiveEnd = nowUtc < endEx ? nowUtc : endEx;

    // ยังไม่ถึงช่วงงวด -> estimate = 0
    if (effectiveEnd <= start) {
      const fmtStart = (new Date(start.getTime() + 7*60*60*1000)).toISOString().slice(0,10);
      const fmtEnd = (new Date(endEx.getTime() + 7*60*60*1000 - 1)).toISOString().slice(0,10);
      return res.json({ ok:true, period_type: bounds.period_type, payout_id: `payout_${bounds.label_ym}_${bounds.period_type}`, period_start: start, period_end_exclusive: endEx, period_start_th: fmtStart, period_end_th: fmtEnd, estimate_total: 0 });
    }

    const donePred = _sqlDonePredicate('j');
    const jobsQ = await pool.query(
      `SELECT j.job_id
         FROM public.jobs j
        WHERE ${donePred}
          AND j.finished_at IS NOT NULL
          AND j.finished_at >= $1 AND j.finished_at < $2
          AND (
            j.technician_username = $3
            OR EXISTS (SELECT 1 FROM public.job_team_members tm WHERE tm.job_id=j.job_id AND tm.username=$3)
            OR EXISTS (SELECT 1 FROM public.job_assignments a WHERE a.job_id=j.job_id AND a.technician_username=$3)
          )
        ORDER BY j.finished_at DESC`,
      [start.toISOString(), effectiveEnd.toISOString(), tech]
    );
    const rows = jobsQ.rows || [];

    let total = 0;
    let computed = 0;
    const HARD_CAP = 2000;
    const slice = rows.length > HARD_CAP ? rows.slice(0, HARD_CAP) : rows;
    for (const row of slice) {
      const job_id = Number(row.job_id);
      try {
        const lines = await _buildPayoutLinesForJob(job_id);
        const meLine = (lines || []).find(x => String(x.technician_username) === tech);
        total += Number(meLine?.earn_amount || 0);
        computed++;
      } catch (e) {
        continue;
      }
    }

    const fmtStart = (new Date(start.getTime() + 7*60*60*1000)).toISOString().slice(0,10);
    const fmtEnd = (new Date(endEx.getTime() + 7*60*60*1000 - 1)).toISOString().slice(0,10);
    return res.json({ ok:true, period_type: bounds.period_type, payout_id: `payout_${bounds.label_ym}_${bounds.period_type}`, period_start: start, period_end_exclusive: endEx, period_start_th: fmtStart, period_end_th: fmtEnd, estimate_total: total, jobs_count: rows.length, computed_jobs: computed, capped: rows.length > HARD_CAP });
  } catch (e) {
    console.error('GET /tech/income_next_period_estimate', e);
    return res.status(500).json({ ok:false, error:'LOAD_FAILED' });
  }
});

/**
 * (Phase 4 UX) สรุป N วันล่าสุด (default 7)
 * GET /tech/income_last_days?days=7
 */
app.get('/tech/income_last_days', requireTechnicianSession, async (req, res) => {
  try {
    const tech = String(req.auth?.username || '').trim();
    const qStart = parseDateYMD(req.query.start);
    const qEnd = parseDateYMD(req.query.end);
    let days = Math.min(Math.max(Number(req.query.days || 7), 1), 92);

    const nowBkk = _bkkNow();
    const { y, m, d } = _bkkYmd(nowBkk);
    const todayStart = _bangkokMidnightUTC(y, m, d);
    let start = new Date(todayStart.getTime() - (days - 1) * 24*60*60*1000);
    let endEx = _bangkokMidnightUTC(y, m, d + 1);
    if (qStart && qEnd) {
      const [sy, sm, sd] = qStart.split('-').map(Number);
      const [ey, em, ed] = qEnd.split('-').map(Number);
      start = _bangkokMidnightUTC(sy, sm, sd);
      endEx = _bangkokMidnightUTC(ey, em, ed + 1);
      const diffDays = Math.ceil((endEx.getTime() - start.getTime()) / (24*60*60*1000));
      days = Math.min(Math.max(diffDays, 1), 92);
      if (diffDays > 92) {
        start = new Date(endEx.getTime() - 91 * 24*60*60*1000);
      }
    }

    const donePred = _sqlDonePredicate('j');
    const jobsQ = await pool.query(
      `SELECT j.job_id, j.finished_at
         FROM public.jobs j
        WHERE ${donePred}
          AND j.finished_at IS NOT NULL
          AND j.finished_at >= $1 AND j.finished_at < $2
          AND (
            j.technician_username = $3
            OR EXISTS (SELECT 1 FROM public.job_team_members tm WHERE tm.job_id=j.job_id AND tm.username=$3)
            OR EXISTS (SELECT 1 FROM public.job_assignments a WHERE a.job_id=j.job_id AND a.technician_username=$3)
          )
        ORDER BY j.finished_at DESC`,
      [start.toISOString(), endEx.toISOString(), tech]
    );
    const rows = jobsQ.rows || [];

    const byDay = new Map();
    for (let i=0;i<days;i++) {
      const dt = new Date(start.getTime() + i*24*60*60*1000);
      const ymd = toBangkokDateKey(dt);
      byDay.set(ymd, { date: ymd, total: 0, jobs: 0 });
    }

    const HARD_CAP = 2000;
    const slice = rows.length > HARD_CAP ? rows.slice(0, HARD_CAP) : rows;
    for (const row of slice) {
      const job_id = Number(row.job_id);
      const dayKey = toBangkokDateKey(row.finished_at);
      if (!byDay.has(dayKey)) continue;
      try {
        const lines = await _buildPayoutLinesForJob(job_id);
        const meLine = (lines || []).find(x => String(x.technician_username) === tech);
        const inc = Number(meLine?.earn_amount || 0);
        const o = byDay.get(dayKey);
        o.total += inc;
        o.jobs += 1;
      } catch (e) {
        continue;
      }
    }

    const out = Array.from(byDay.values()).sort((a,b)=> String(b.date).localeCompare(String(a.date)));
    return res.json({ ok:true, username: tech, days: out, range_start: toBangkokDateKey(start), range_end: toBangkokDateKey(new Date(endEx.getTime()-1)) });
  } catch (e) {
    console.error('GET /tech/income_last_days', e);
    return res.status(500).json({ ok:false, error:'LOAD_FAILED' });
  }
});

/**
 * (Phase 4 UX) รวมยอดจ่ายแล้วทั้งหมดของช่าง
 * GET /tech/payments_total
 */
app.get('/tech/payments_total', requireTechnicianSession, async (req, res) => {
  try {
    const tech = String(req.auth?.username || '').trim();
    const q = await pool.query(
      `SELECT COALESCE(SUM(paid_amount),0) AS paid_total
         FROM public.technician_payout_payments
        WHERE technician_username=$1`,
      [tech]
    );
    const paid_total = Number(q.rows?.[0]?.paid_total || 0);
    const outstanding = await _computeTechnicianTrueOutstanding(tech);
    const nowYmd = _bkkYmd(_bkkNow());
    const ymKey = `${nowYmd.y}-${String(nowYmd.m).padStart(2, '0')}`;
    const payoutMonth = await _computeTechnicianPayoutMonthTotal(tech, ymKey);
    const monthlyStart = payoutMonth.monthly_income_period_start ? new Date(payoutMonth.monthly_income_period_start) : null;
    const monthlyEnd = payoutMonth.monthly_income_period_end ? new Date(payoutMonth.monthly_income_period_end) : null;
    const workSummary = (monthlyStart && monthlyEnd && !Number.isNaN(monthlyStart.getTime()) && !Number.isNaN(monthlyEnd.getTime()))
      ? await _computeTechnicianWorkSummary(tech, monthlyStart, monthlyEnd, payoutMonth.payout_month || ymKey)
      : { cards: [], groups: [], total_machines: 0, jobs_count: 0 };
    const depositSummary = await _getDepositSummary(tech);
    return res.json({
      ok:true,
      username: tech,
      paid_total,
      payout_month: payoutMonth.payout_month || ymKey,
      payout_month_total: payoutMonth.payout_month_total || 0,
      payout_month_net_total: payoutMonth.payout_month_net_total || 0,
      payout_month_policy: payoutMonth.payout_month_policy || 'sum_payout_10_and_25_for_label_month',
      payout_month_periods: payoutMonth.periods || [],
      monthly_income_display_amount: payoutMonth.monthly_income_display_amount ?? payoutMonth.payout_month_total ?? 0,
      monthly_income_display_label: payoutMonth.monthly_income_display_label || payoutMonth.payout_month || ymKey,
      monthly_income_period_start: payoutMonth.monthly_income_period_start || null,
      monthly_income_period_end: payoutMonth.monthly_income_period_end || null,
      work_summary: workSummary,
      deposit_target_amount: depositSummary.deposit_target_amount || 0,
      deposit_collected_total: depositSummary.deposit_collected_total || 0,
      deposit_remaining_amount: depositSummary.deposit_remaining_amount || 0,
      deposit_is_required: depositSummary.deposit_is_required !== false,
      // Backward-compatible fields kept for old clients.
      true_outstanding_amount: outstanding.true_outstanding_amount,
      pending_payout_remaining_total: outstanding.true_outstanding_amount,
      outstanding_policy: outstanding.outstanding_policy || 'locked_pending_only',
      outstanding_periods_count: outstanding.periods_count
    });
  } catch (e) {
    console.error('GET /tech/payments_total', e);
    return res.status(500).json({ ok:false, error:'LOAD_FAILED' });
  }
});

/**
 * รายละเอียดรายได้รายวัน (เพื่อให้ช่างเห็นว่า "วันนี้ทำอะไร ได้เท่าไหร่" แบบไม่ต้องสร้างงวด)
 * GET /tech/income_day_detail?date=YYYY-MM-DD&limit=50&offset=0
 */
app.get('/tech/income_day_detail', requireTechnicianSession, async (req, res) => {
  try {
    const tech = String(req.auth?.username || '').trim();
    const qDate = parseDateYMD(req.query.date) || toBangkokDateKey(new Date());
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
    const offset = Math.max(Number(req.query.offset || 0), 0);

    // bangkok date -> UTC range
    const [yy, mm, dd] = qDate.split('-').map(x => Number(x));
    const start = _bangkokMidnightUTC(yy, mm, dd);
    const endEx = _bangkokMidnightUTC(yy, mm, dd + 1);

    const donePred = _sqlDonePredicate('j');
    const jobsQ = await pool.query(
      `SELECT j.job_id, j.finished_at
         FROM public.jobs j
        WHERE ${donePred}
          AND j.finished_at IS NOT NULL
          AND j.finished_at >= $1 AND j.finished_at < $2
          AND (
            j.technician_username = $3
            OR EXISTS (SELECT 1 FROM public.job_team_members tm WHERE tm.job_id=j.job_id AND tm.username=$3)
            OR EXISTS (SELECT 1 FROM public.job_assignments a WHERE a.job_id=j.job_id AND a.technician_username=$3)
          )
        ORDER BY j.finished_at DESC
        LIMIT $4 OFFSET $5`,
      [start.toISOString(), endEx.toISOString(), tech, limit, offset]
    );

    const out = [];
    for (const row of (jobsQ.rows || [])) {
      const job_id = Number(row.job_id);
      try {
        const lines = await _buildPayoutLinesForJob(job_id);
        const me = (lines || []).find(x => String(x.technician_username) === tech);
        if (!me) continue;
        out.push({
          job_id: String(job_id),
          finished_at: row.finished_at,
          earn_amount: Number(me.earn_amount || 0),
          percent_final: me.percent_final,
          machine_count_for_tech: Number(me.machine_count_for_tech || 0),
          detail_json: me.detail_json || null,
        });
      } catch (e) {
        continue;
      }
    }

    const total = out.reduce((a, it) => a + Number(it.earn_amount || 0), 0);
    return res.json({ ok: true, username: tech, date: qDate, total_amount: total, limit, offset, items: out });
  } catch (e) {
    console.error('GET /tech/income_day_detail', e);
    return res.status(500).json({ ok: false, error: 'LOAD_FAILED' });
  }
});


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


// 2.0) jobs: admin attribution (dashboard/commission) - backward compatible
await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS created_by_admin TEXT`);
await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS approved_by_admin TEXT`);
await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`);

    // 2.1) jobs: maps_url / job_zone / travel_started_at / started_at / finished_at / canceled_at / final_signature_*
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS maps_url TEXT`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS job_zone TEXT`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS service_zone_code TEXT`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS service_zone_source TEXT`);
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

    // ✅ Warranty fields (v2) - backward compatible
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS warranty_kind TEXT`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS warranty_months INT`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS warranty_start_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS warranty_end_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS warranty_extended_days INT DEFAULT 0`);

    // 2.5) jobs: การชำระเงิน (จ่ายเงิน + แนบสลิป)
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS paid_by TEXT`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid'`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS payment_method TEXT`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS payment_reference TEXT`);
    await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS payment_note TEXT`);


// 3) users: admin profile + commission rate (dashboard)
await pool.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name TEXT`);
await pool.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS photo_url TEXT`);
await pool.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS commission_rate_percent DOUBLE PRECISION DEFAULT 0`);
await pool.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS line_user_id TEXT`);
await pool.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS line_display_name TEXT`);
await pool.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS line_picture_url TEXT`);
await pool.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS line_linked_at TIMESTAMPTZ`);
await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_line_user_id ON public.users(line_user_id) WHERE line_user_id IS NOT NULL`);



// 3.0) Bootstrap default Super Admin user (only if missing) - keeps DB role constraint safe
// - Username: Super
// - Password: 1549 (can override via SUPER_ADMIN_DEFAULT_PASSWORD)
// NOTE: Super Admin privilege is still whitelist-based (isSuperAdmin), not DB role.
try {
  const superUser = 'Super';
  const superPass = String(process.env.SUPER_ADMIN_DEFAULT_PASSWORD || '1549').trim() || '1549';
  const chk = await pool.query('SELECT username FROM public.users WHERE username=$1 LIMIT 1', [superUser]);
  if (!chk.rows || chk.rows.length === 0) {
    await pool.query(
      `INSERT INTO public.users(username, password, role, full_name) VALUES($1,$2,$3,$4)`,
      [superUser, superPass, 'admin', 'Super Admin']
    );
  }
} catch (e) {
  console.warn('bootstrap Super user skipped:', e.message);
}
// 3.1) customer_profiles: เก็บข้อมูลลูกค้าที่ Login ด้วย LINE แล้วกด Register (minimal, ไม่ยุ่ง users เดิม)
await pool.query(`
  CREATE TABLE IF NOT EXISTS public.customer_profiles (
    sub TEXT PRIMARY KEY,
    provider TEXT DEFAULT 'line',
    display_name TEXT,
    picture_url TEXT,
    phone TEXT,
    address TEXT,
    maps_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_customer_profiles_phone ON public.customer_profiles(phone)`);
// 3.15) service zones: automatic district/amphoe mapping for dispatch
await pool.query(`
  CREATE TABLE IF NOT EXISTS public.service_zones (
    zone_code TEXT PRIMARY KEY,
    zone_name TEXT NOT NULL,
    zone_label TEXT NOT NULL,
    province_group TEXT,
    color_hex TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 100,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
await pool.query(`
  CREATE TABLE IF NOT EXISTS public.service_zone_areas (
    area_id BIGSERIAL PRIMARY KEY,
    zone_code TEXT NOT NULL REFERENCES public.service_zones(zone_code),
    province TEXT NOT NULL,
    district TEXT NOT NULL,
    subdistrict TEXT,
    river_side TEXT,
    is_primary BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_service_zone_areas_unique_area ON public.service_zone_areas(zone_code, province, district, (COALESCE(subdistrict,'')))`);
await pool.query(`
  CREATE TABLE IF NOT EXISTS public.technician_service_zones (
    technician_username TEXT NOT NULL,
    zone_code TEXT NOT NULL REFERENCES public.service_zones(zone_code),
    priority INTEGER NOT NULL DEFAULT 100,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (technician_username, zone_code)
  )
`);
for (const z of SERVICE_ZONE_SEEDS) {
  await pool.query(
    `INSERT INTO public.service_zones (zone_code, zone_name, zone_label, province_group, color_hex, sort_order, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT (zone_code) DO UPDATE SET
       zone_name=EXCLUDED.zone_name,
       zone_label=EXCLUDED.zone_label,
       province_group=EXCLUDED.province_group,
       color_hex=EXCLUDED.color_hex,
       sort_order=EXCLUDED.sort_order,
       is_active=TRUE,
       updated_at=NOW()`,
    [z.code, z.name, z.label, z.group, z.color, z.order]
  );
  const province = z.group === 'samut_prakan' ? 'สมุทรปราการ' : (z.group === 'nonthaburi' ? 'นนทบุรี' : (z.group === 'pathum_thani' ? 'ปทุมธานี' : 'กรุงเทพมหานคร'));
  for (const district of z.districts) {
    await pool.query(
      `INSERT INTO public.service_zone_areas (zone_code, province, district, is_primary)
       VALUES ($1,$2,$3,TRUE)
       ON CONFLICT (zone_code, province, district, (COALESCE(subdistrict,''))) DO NOTHING`,
      [z.code, province, district]
    );
  }
}

// 3.2) technician_service_matrix: กำหนดว่าช่างคนไหนรับงานประเภทไหน/แอร์ประเภทไหน/วิธีล้างไหนได้บ้าง
// - ใช้กับหน้าจองลูกค้า (ไม่กระทบงานเดิม: ถ้าไม่มี record -> allow all)
await pool.query(`
  CREATE TABLE IF NOT EXISTS public.technician_service_matrix (
    username TEXT PRIMARY KEY,
    matrix_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_technician_service_matrix_updated ON public.technician_service_matrix(updated_at DESC)`);

// 3.3) technician_base_status_assessments: isolated People Status / Team Status Forge module
// - New table only; does not modify existing technician/user/job logic.
await pool.query(`
  CREATE TABLE IF NOT EXISTS public.technician_base_status_assessments (
    id BIGSERIAL PRIMARY KEY,
    technician_username TEXT NOT NULL,
    assessed_by TEXT,
    assessment_source TEXT NOT NULL DEFAULT 'admin',
    review_status TEXT NOT NULL DEFAULT 'verified',
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    answers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    stats_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    level INT NOT NULL DEFAULT 0,
    rank TEXT NOT NULL DEFAULT 'C',
    suitable_jobs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    restricted_jobs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    strengths_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    risk_points_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    development_plan_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    generated_prompt TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_tech_base_status_tech_created ON public.technician_base_status_assessments(technician_username, created_at DESC)`);
await pool.query(`ALTER TABLE public.technician_base_status_assessments ADD COLUMN IF NOT EXISTS assessment_source TEXT NOT NULL DEFAULT 'admin'`);
await pool.query(`ALTER TABLE public.technician_base_status_assessments ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'verified'`);
await pool.query(`ALTER TABLE public.technician_base_status_assessments ADD COLUMN IF NOT EXISTS reviewed_by TEXT`);
await pool.query(`ALTER TABLE public.technician_base_status_assessments ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`);
await pool.query(`ALTER TABLE public.technician_base_status_assessments ADD COLUMN IF NOT EXISTS review_notes TEXT`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_tech_base_status_review ON public.technician_base_status_assessments(technician_username, review_status, created_at DESC)`);

// 4) audit logs (reserved for Super Admin impersonation - Phase 5)
await pool.query(`
  CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    log_id BIGSERIAL PRIMARY KEY,
    actor_username TEXT,
    actor_role TEXT,
    action TEXT,
    target_role TEXT,
    target_username TEXT,
    meta_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON public.admin_audit_log(created_at DESC)`);


// 4.1) Partner Onboarding Phase 1A: application + documents + event timeline
await pool.query(`
  CREATE TABLE IF NOT EXISTS public.partner_applications (
    id BIGSERIAL PRIMARY KEY,
    application_code TEXT NOT NULL UNIQUE,
    user_id TEXT,
    technician_username TEXT,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    line_id TEXT,
    email TEXT,
    address_text TEXT,
    service_zones JSONB NOT NULL DEFAULT '[]'::jsonb,
    preferred_job_types JSONB NOT NULL DEFAULT '[]'::jsonb,
    experience_years NUMERIC(6,2),
    has_vehicle BOOLEAN NOT NULL DEFAULT FALSE,
    vehicle_type TEXT,
    equipment_notes TEXT,
    bank_account_name TEXT,
    bank_name TEXT,
    bank_account_last4 TEXT,
    notes TEXT,
    consent_pdpa BOOLEAN NOT NULL DEFAULT FALSE,
    consent_terms BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted','under_review','need_more_documents','rejected','approved_for_training')),
    admin_note TEXT,
    submitted_at TIMESTAMPTZ,
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_partner_applications_status_created ON public.partner_applications(status, created_at DESC)`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_partner_applications_phone ON public.partner_applications(phone)`);
await pool.query(`ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS province TEXT`);
await pool.query(`ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS district TEXT`);
await pool.query(`ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS work_intent TEXT`);
await pool.query(`ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS available_days_per_week INT`);
await pool.query(`ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS preferred_work_days JSONB NOT NULL DEFAULT '[]'::jsonb`);
await pool.query(`ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS max_jobs_per_day INT`);
await pool.query(`ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS max_units_per_day INT`);
await pool.query(`ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS can_accept_urgent_jobs BOOLEAN NOT NULL DEFAULT FALSE`);
await pool.query(`ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS can_work_condo BOOLEAN NOT NULL DEFAULT FALSE`);
await pool.query(`ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS can_issue_tax_invoice BOOLEAN NOT NULL DEFAULT FALSE`);
await pool.query(`ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS has_helper_team BOOLEAN NOT NULL DEFAULT FALSE`);
await pool.query(`ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS team_size INT`);
await pool.query(`ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS travel_method TEXT`);
await pool.query(`ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS service_radius_km NUMERIC(8,2)`);
await pool.query(`ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS equipment_json JSONB NOT NULL DEFAULT '[]'::jsonb`);
await pool.query(`ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS line_user_id TEXT`);
await pool.query(`ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS account_created_at TIMESTAMPTZ`);
await pool.query(`ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS account_note TEXT`);
await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS partner_status TEXT`);
await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS line_id TEXT`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS public.partner_application_documents (
    id BIGSERIAL PRIMARY KEY,
    application_id BIGINT NOT NULL REFERENCES public.partner_applications(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CHECK (document_type IN ('id_card','profile_photo','bank_book','tools_photo','vehicle_photo','certificate_or_portfolio','other')),
    original_filename TEXT,
    mime_type TEXT,
    file_size BIGINT,
    public_url TEXT,
    storage_path TEXT,
    cloud_public_id TEXT,
    status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','approved','rejected','need_reupload')),
    admin_note TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_partner_docs_application ON public.partner_application_documents(application_id, created_at DESC)`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_partner_docs_status ON public.partner_application_documents(status, created_at DESC)`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS public.partner_onboarding_events (
    id BIGSERIAL PRIMARY KEY,
    application_id BIGINT NOT NULL REFERENCES public.partner_applications(id) ON DELETE CASCADE,
    actor_type TEXT,
    actor_username TEXT,
    event_type TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    note TEXT,
    metadata_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_partner_events_application_created ON public.partner_onboarding_events(application_id, created_at DESC)`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS public.technician_certification_preferences (
    id BIGSERIAL PRIMARY KEY,
    technician_username TEXT NOT NULL,
    certification_code TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(technician_username, certification_code)
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_cert_prefs_username_enabled ON public.technician_certification_preferences(technician_username, enabled)`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS public.partner_availability_preferences (
    id BIGSERIAL PRIMARY KEY,
    technician_username TEXT NOT NULL UNIQUE,
    working_days JSONB NOT NULL DEFAULT '[]'::jsonb,
    time_windows JSONB NOT NULL DEFAULT '[]'::jsonb,
    max_jobs_per_day INT,
    max_units_per_day INT,
    paused BOOLEAN NOT NULL DEFAULT TRUE,
    vacation_days JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`);

// 4.2) Partner Onboarding: agreement, academy, exams, certification, trial/evaluation
await pool.query(`
  CREATE TABLE IF NOT EXISTS public.agreement_templates (
    id BIGSERIAL PRIMARY KEY,
    template_code TEXT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    body_text TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(template_code, version)
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_agreement_templates_active ON public.agreement_templates(template_code, is_active, version DESC)`);
await pool.query(`ALTER TABLE public.agreement_templates ADD COLUMN IF NOT EXISTS content_html TEXT`);
await pool.query(`ALTER TABLE public.agreement_templates ADD COLUMN IF NOT EXISTS source_note TEXT`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS public.agreement_signatures (
    id BIGSERIAL PRIMARY KEY,
    application_id BIGINT NOT NULL REFERENCES public.partner_applications(id) ON DELETE CASCADE,
    template_id BIGINT NOT NULL REFERENCES public.agreement_templates(id),
    template_version INT NOT NULL,
    signer_full_name TEXT NOT NULL,
    consent_terms BOOLEAN NOT NULL DEFAULT FALSE,
    signed_ip TEXT,
    signed_user_agent TEXT,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_agreement_signatures_application ON public.agreement_signatures(application_id, signed_at DESC)`);
await pool.query(`ALTER TABLE public.agreement_signatures ADD COLUMN IF NOT EXISTS signature_data_url TEXT`);
await pool.query(`ALTER TABLE public.agreement_signatures ADD COLUMN IF NOT EXISTS signature_snapshot_html TEXT`);
await pool.query(`ALTER TABLE public.agreement_signatures ADD COLUMN IF NOT EXISTS signature_template_title TEXT`);
await pool.query(`ALTER TABLE public.agreement_signatures ADD COLUMN IF NOT EXISTS signature_template_source_note TEXT`);
await pool.query(`ALTER TABLE public.agreement_signatures ADD COLUMN IF NOT EXISTS application_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS public.academy_courses (
    id BIGSERIAL PRIMARY KEY,
    course_code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
await pool.query(`
  CREATE TABLE IF NOT EXISTS public.academy_lessons (
    id BIGSERIAL PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES public.academy_courses(id) ON DELETE CASCADE,
    lesson_title TEXT NOT NULL,
    body_text TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(course_id, sort_order)
  )
`);
await pool.query(`
  CREATE TABLE IF NOT EXISTS public.academy_progress (
    id BIGSERIAL PRIMARY KEY,
    application_id BIGINT NOT NULL REFERENCES public.partner_applications(id) ON DELETE CASCADE,
    course_id BIGINT NOT NULL REFERENCES public.academy_courses(id) ON DELETE CASCADE,
    lesson_id BIGINT NOT NULL REFERENCES public.academy_lessons(id) ON DELETE CASCADE,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(application_id, lesson_id)
  )
`);
await pool.query(`ALTER TABLE public.academy_lessons ADD COLUMN IF NOT EXISTS video_url TEXT`);
await pool.query(`ALTER TABLE public.academy_lessons ADD COLUMN IF NOT EXISTS min_watch_seconds INT NOT NULL DEFAULT 60`);
await pool.query(`ALTER TABLE public.academy_progress ADD COLUMN IF NOT EXISTS watched_seconds INT NOT NULL DEFAULT 0`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_academy_progress_application ON public.academy_progress(application_id, course_id)`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS public.academy_exams (
    id BIGSERIAL PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES public.academy_courses(id) ON DELETE CASCADE,
    exam_code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    passing_score_percent NUMERIC(5,2) NOT NULL DEFAULT 80,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
await pool.query(`
  CREATE TABLE IF NOT EXISTS public.academy_exam_questions (
    id BIGSERIAL PRIMARY KEY,
    exam_id BIGINT NOT NULL REFERENCES public.academy_exams(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    choices_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    correct_choice_index INT NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(exam_id, sort_order)
  )
`);
await pool.query(`
  CREATE TABLE IF NOT EXISTS public.academy_exam_attempts (
    id BIGSERIAL PRIMARY KEY,
    application_id BIGINT NOT NULL REFERENCES public.partner_applications(id) ON DELETE CASCADE,
    exam_id BIGINT NOT NULL REFERENCES public.academy_exams(id) ON DELETE CASCADE,
    answers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    score_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    passed BOOLEAN NOT NULL DEFAULT FALSE,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_exam_attempts_application ON public.academy_exam_attempts(application_id, submitted_at DESC)`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS public.technician_certifications (
    id BIGSERIAL PRIMARY KEY,
    application_id BIGINT REFERENCES public.partner_applications(id) ON DELETE CASCADE,
    technician_username TEXT,
    certification_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_training','exam_ready','exam_failed','exam_passed','trial_unlocked','approved','suspended','revoked')),
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    admin_note TEXT,
    updated_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(application_id, certification_code)
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_tech_cert_username_code ON public.technician_certifications(technician_username, certification_code, status)`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS public.partner_trial_jobs (
    id BIGSERIAL PRIMARY KEY,
    application_id BIGINT NOT NULL REFERENCES public.partner_applications(id) ON DELETE CASCADE,
    technician_username TEXT,
    certification_code TEXT NOT NULL,
    job_id BIGINT,
    status TEXT NOT NULL DEFAULT 'unlocked',
    admin_note TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    evaluated_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_partner_trial_jobs_application ON public.partner_trial_jobs(application_id, created_at DESC)`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS public.partner_evaluations (
    id BIGSERIAL PRIMARY KEY,
    trial_job_id BIGINT NOT NULL REFERENCES public.partner_trial_jobs(id) ON DELETE CASCADE,
    application_id BIGINT NOT NULL REFERENCES public.partner_applications(id) ON DELETE CASCADE,
    evaluator_username TEXT,
    punctuality_score NUMERIC(4,2) NOT NULL DEFAULT 0,
    uniform_score NUMERIC(4,2) NOT NULL DEFAULT 0,
    communication_score NUMERIC(4,2) NOT NULL DEFAULT 0,
    photo_quality_score NUMERIC(4,2) NOT NULL DEFAULT 0,
    job_quality_score NUMERIC(4,2) NOT NULL DEFAULT 0,
    customer_issue BOOLEAN NOT NULL DEFAULT FALSE,
    admin_note TEXT,
    result TEXT NOT NULL CHECK (result IN ('passed','failed','needs_more_trial')),
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_partner_evaluations_application ON public.partner_evaluations(application_id, evaluated_at DESC)`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS public.partner_incidents (
    id BIGSERIAL PRIMARY KEY,
    application_id BIGINT NOT NULL REFERENCES public.partner_applications(id) ON DELETE CASCADE,
    trial_job_id BIGINT REFERENCES public.partner_trial_jobs(id) ON DELETE SET NULL,
    incident_type TEXT,
    severity TEXT,
    note TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_partner_incidents_application ON public.partner_incidents(application_id, created_at DESC)`);


await pool.query(`
  CREATE TABLE IF NOT EXISTS public.partner_interviews (
    id BIGSERIAL PRIMARY KEY,
    application_id BIGINT NOT NULL REFERENCES public.partner_applications(id) ON DELETE CASCADE,
    interviewer_username TEXT,
    call_status TEXT NOT NULL DEFAULT 'not_called' CHECK (call_status IN ('not_called','no_answer','contacted','follow_up','passed','failed')),
    attitude_score NUMERIC(4,2) NOT NULL DEFAULT 0,
    experience_score NUMERIC(4,2) NOT NULL DEFAULT 0,
    communication_score NUMERIC(4,2) NOT NULL DEFAULT 0,
    tool_readiness_score NUMERIC(4,2) NOT NULL DEFAULT 0,
    availability_score NUMERIC(4,2) NOT NULL DEFAULT 0,
    result TEXT NOT NULL DEFAULT 'follow_up' CHECK (result IN ('passed','failed','follow_up')),
    admin_note TEXT,
    next_follow_up_at TIMESTAMPTZ,
    interviewed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_partner_interviews_application ON public.partner_interviews(application_id, interviewed_at DESC)`);


await pool.query(`
  CREATE TABLE IF NOT EXISTS public.partner_notification_logs (
    id BIGSERIAL PRIMARY KEY,
    application_id BIGINT REFERENCES public.partner_applications(id) ON DELETE SET NULL,
    channel TEXT NOT NULL DEFAULT 'line',
    target TEXT,
    event_type TEXT,
    status TEXT,
    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_partner_notification_logs_application ON public.partner_notification_logs(application_id, created_at DESC)`);

try {
  await pool.query(
    `INSERT INTO public.agreement_templates(template_code, version, title, body_text, content_html, source_note, is_active)
     VALUES('partner_standard', 3, 'CWF สัญญาพาร์ทเนอร์ช่างแอร์ ฉบับใช้งานจริง v3', $1, $2, $3, TRUE)
     ON CONFLICT(template_code, version) DO UPDATE SET
       title=EXCLUDED.title,
       body_text=EXCLUDED.body_text,
       content_html=EXCLUDED.content_html,
       source_note=EXCLUDED.source_note,
       is_active=TRUE,
       updated_at=NOW()`,
    [
      'CWF สัญญาพาร์ทเนอร์ช่างแอร์ ฉบับใช้งานจริง - จัดรูปแบบจากเอกสาร PDF สำหรับใช้ในระบบ',
      CWF_PARTNER_CONTRACT_REAL_HTML,
      'IMPORTED_FROM_CWF_PARTNER_CONTRACT_PDF_FULL_V3',
    ]
  );
  const courseR = await pool.query(
    `INSERT INTO public.academy_courses(course_code, title, description, is_active)
     VALUES('cwf_basic_partner', 'Basic Partner Course', 'หลักสูตรพื้นฐานสำหรับพาร์ทเนอร์ CWF', TRUE)
     ON CONFLICT(course_code) DO UPDATE SET title=EXCLUDED.title
     RETURNING id`
  );
  const courseId = courseR.rows[0]?.id;
  if (courseId) {
    for (let i = 0; i < BASIC_PARTNER_LESSONS.length; i++) {
      await pool.query(
        `INSERT INTO public.academy_lessons(course_id, lesson_title, body_text, sort_order, is_active, min_watch_seconds)
         VALUES($1,$2,$3,$4,TRUE,60)
         ON CONFLICT(course_id, sort_order) DO UPDATE SET lesson_title=EXCLUDED.lesson_title, body_text=EXCLUDED.body_text, is_active=TRUE, min_watch_seconds=COALESCE(public.academy_lessons.min_watch_seconds,60)`,
        [courseId, BASIC_PARTNER_LESSONS[i], BASIC_PARTNER_LESSON_BODIES[i] || BASIC_PARTNER_LESSONS[i], i + 1]
      );
    }
    const examR = await pool.query(
      `INSERT INTO public.academy_exams(course_id, exam_code, title, passing_score_percent, is_active)
       VALUES($1,'cwf_basic_partner_exam','Basic Partner Exam',80,TRUE)
       ON CONFLICT(exam_code) DO UPDATE SET title=EXCLUDED.title, passing_score_percent=80, is_active=TRUE
       RETURNING id`,
      [courseId]
    );
    const examId = examR.rows[0]?.id;
    for (let i = 0; examId && i < BASIC_PARTNER_EXAM_QUESTIONS.length; i++) {
      const q = BASIC_PARTNER_EXAM_QUESTIONS[i];
      await pool.query(
        `INSERT INTO public.academy_exam_questions(exam_id, question_text, choices_json, correct_choice_index, sort_order)
         VALUES($1,$2,$3::jsonb,$4,$5)
         ON CONFLICT(exam_id, sort_order) DO UPDATE SET question_text=EXCLUDED.question_text, choices_json=EXCLUDED.choices_json, correct_choice_index=EXCLUDED.correct_choice_index`,
        [examId, q.q, JSON.stringify(q.choices), q.answer, i + 1]
      );
    }
  }
} catch (e) {
  console.warn('[ensureSchema] seed partner academy/agreement skipped:', e.message);
}


// 5) auth sessions (server-side) - for Super Admin impersonation & real logout
await pool.query(`
  CREATE TABLE IF NOT EXISTS public.auth_sessions (
    session_token TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    role TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    impersonated_username TEXT,
    impersonated_role TEXT,
    impersonated_started_at TIMESTAMPTZ
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON public.auth_sessions(username)`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS public.password_reset_requests (
    id BIGSERIAL PRIMARY KEY,
    username_or_phone TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'requested',
    admin_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_password_reset_requests_status_created ON public.password_reset_requests(status, created_at DESC)`);

// 6) duration rules (managed by Super Admin)
await pool.query(`
  CREATE TABLE IF NOT EXISTS public.service_duration_rules (
    service_key TEXT PRIMARY KEY,
    duration_min INT NOT NULL,
    updated_by TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`);

// 7) Technician income settings (Super Admin only)
await pool.query(`
  CREATE TABLE IF NOT EXISTS public.technician_income_defaults (
    income_type TEXT PRIMARY KEY,
    config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
await pool.query(`
  CREATE TABLE IF NOT EXISTS public.technician_income_overrides (
    username TEXT PRIMARY KEY,
    income_type TEXT NOT NULL,
    config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_tech_income_overrides_type ON public.technician_income_overrides(income_type)`);


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
    await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS preferred_zone TEXT`);
    await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS home_province TEXT`);
    await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS home_district TEXT`);
    await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS home_service_zone_code TEXT`);
    await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS allow_out_of_zone BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS secondary_service_zone_code TEXT`);
    await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS service_radius_km NUMERIC(8,2)`);

    // 3.3) technician_profiles: เบอร์โทร (ใช้แสดงให้ลูกค้า "หลังเริ่มเดินทาง" เท่านั้น)
    await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS phone TEXT`);
    await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'company'`);

    // 3.35) technician_profiles: ✅ รูปแบบค่าตอบแทน (ผู้ช่วยช่าง/เงินเดือน)
    // - commission (default): คิดรายได้ต่อ job ตาม step rules
    // - daily: ได้รายวันตามจำนวนวันทำงาน (มีงานเสร็จในวันนั้น)
    // - salary: ได้เงินเดือน (จ่ายแบ่งงวด 10/25 = ครึ่งเดือน)
    await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS compensation_mode TEXT DEFAULT 'commission'`);
    await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS daily_wage_amount NUMERIC DEFAULT 0`);
    await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS monthly_salary_amount NUMERIC DEFAULT 0`);
    // ✅ customer_slot_visible: ช่างบางคนเป็นลูกมือ/ฝึกงาน ไม่ต้องแสดงในสลอตหน้าลูกค้า
    // - ใช้เฉพาะการคำนวณสลอตฝั่งลูกค้าเท่านั้น (แอดมินเพิ่มงาน/จัดทีมยังเลือกได้ตามปกติ)
    await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS customer_slot_visible BOOLEAN DEFAULT TRUE`);
    await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS work_start TEXT DEFAULT '09:00'`);
    await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS work_end TEXT DEFAULT '18:00'`);
    // ✅ วันหยุดประจำสัปดาห์ (0=อาทิตย์ ... 6=เสาร์) เช่น '0,6'
    await pool.query(`ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS weekly_off_days TEXT DEFAULT ''`);

    // ✅ ตารางกำหนดวันทำงาน/วันหยุดรายวัน (override) - ช่างตั้งล่วงหน้าได้ (1 สัปดาห์)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.technician_workdays_v2 (
        workday_id BIGSERIAL PRIMARY KEY,
        technician_username TEXT NOT NULL,
        work_date DATE NOT NULL,
        is_off BOOLEAN DEFAULT FALSE,
        note TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(technician_username, work_date)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_twd_v2_user_date ON public.technician_workdays_v2(technician_username, work_date)`);

    // 3.5) technician special slots (admin can add extra availability windows)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.technician_special_slots_v2 (
        slot_id BIGSERIAL PRIMARY KEY,
        technician_username TEXT NOT NULL,
        slot_date DATE NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tss_v2_date_user ON public.technician_special_slots_v2(slot_date, technician_username)`);


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
    -- optional targeting rules (super admin can set)
    job_type TEXT,
    ac_type TEXT,
    wash_variant TEXT,
    btu_min INT,
    btu_max INT,
    machine_min INT,
    machine_max INT,
    priority INT DEFAULT 0,
    is_customer_visible BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`);

// backward compatible
await pool.query(`ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS is_customer_visible BOOLEAN DEFAULT FALSE`);

// targeting rules (backward compatible)
await pool.query(`ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS job_type TEXT`);
await pool.query(`ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS ac_type TEXT`);
await pool.query(`ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS wash_variant TEXT`);
await pool.query(`ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS btu_min INT`);
await pool.query(`ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS btu_max INT`);
await pool.query(`ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS machine_min INT`);
await pool.query(`ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS machine_max INT`);
await pool.query(`ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS priority INT DEFAULT 0`);

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

    // job_items: support assigning each service line to a technician (backward compatible)
    await pool.query(`ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS assigned_technician_username TEXT`);
    await pool.query(`ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS is_service BOOLEAN DEFAULT FALSE`);

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

// 3.4.1) ✅ Job updates / audit log (admin + technician)
await pool.query(`
  CREATE TABLE IF NOT EXISTS public.job_updates_v2 (
    update_id BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES public.jobs(job_id) ON DELETE CASCADE,
    actor_username TEXT,
    actor_role TEXT,
    action TEXT NOT NULL,
    message TEXT,
    payload_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_job_updates_v2_job_id ON public.job_updates_v2(job_id, created_at DESC)`);

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
await pool.query(`ALTER TABLE IF EXISTS public.job_team_members ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT FALSE`);
// 3.5.1) ✅ งานทีม: สถานะรายช่าง (job_assignments) - Source of Truth สำหรับ "ช่างคนไหนเสร็จแล้ว"
await pool.query(`
  CREATE TABLE IF NOT EXISTS public.job_assignments (
    job_id BIGINT NOT NULL REFERENCES public.jobs(job_id) ON DELETE CASCADE,
    technician_username TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','done')),
    done_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (job_id, technician_username)
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_job_assignments_user ON public.job_assignments(technician_username, status)`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_job_assignments_job ON public.job_assignments(job_id)`);

// 3.5.1.1) job_assignments: เงินพิเศษเป็นก้อน (แยกจาก pool/ไม่หาร) - backward compatible
await pool.query(`ALTER TABLE public.job_assignments ADD COLUMN IF NOT EXISTS special_bonus_amount DOUBLE PRECISION DEFAULT 0`);

// 3.4.2) job_photos: ผู้ที่อัปโหลด (uploaded_by) เพื่อกันรูปหาย/สับสนในงานทีม
await pool.query(`ALTER TABLE public.job_photos ADD COLUMN IF NOT EXISTS uploaded_by TEXT`);
// 3.4.3) job_photos: เก็บ public_id ของ Cloudinary (เผื่อลบ/จัดการภายหลัง)
await pool.query(`ALTER TABLE public.job_photos ADD COLUMN IF NOT EXISTS cloud_public_id TEXT`);

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


    // =======================================
    // 💰 Technician Payout Periods + Step Ladder Rules (Phase 1)
    // - Cached payout lines per period (10/25)
    // - Deterministic step rule matching + snapshot
    // =======================================

    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.technician_payout_periods (
        payout_id TEXT PRIMARY KEY,
        period_type TEXT NOT NULL CHECK (period_type IN ('10','25')),
        period_start TIMESTAMPTZ NOT NULL,
        period_end TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','locked','paid')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        created_by TEXT
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tech_payout_periods_type_start ON public.technician_payout_periods(period_type, period_start DESC)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.technician_payout_lines (
        line_id BIGSERIAL PRIMARY KEY,
        payout_id TEXT NOT NULL REFERENCES public.technician_payout_periods(payout_id) ON DELETE CASCADE,
        technician_username TEXT NOT NULL,
        job_id TEXT NOT NULL,
        finished_at TIMESTAMPTZ,
        earn_amount NUMERIC(12,2) DEFAULT 0,
        base_amount NUMERIC(12,2) DEFAULT 0,
        percent_final NUMERIC(12,4),
        machine_count_for_tech INT DEFAULT 0,
        step_rule_key TEXT,
        detail_json JSONB,
        setting_snapshot JSONB,
        UNIQUE(payout_id, technician_username, job_id)
      )
    `);
    await _ensurePayoutLinesMachineCountNumeric(pool);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tech_payout_lines_pid_tech ON public.technician_payout_lines(payout_id, technician_username)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tech_payout_lines_job ON public.technician_payout_lines(job_id)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.technician_income_step_rules (
        rule_id TEXT PRIMARY KEY,
        scope_type TEXT,
        job_type TEXT,
        ac_type TEXT,
        wash_variant TEXT,
        step_1_percent NUMERIC(12,4) DEFAULT 0,
        step_2_percent NUMERIC(12,4) DEFAULT 0,
        step_3_percent NUMERIC(12,4) DEFAULT 0,
        step_4p_percent NUMERIC(12,4) DEFAULT 0,
        priority INT DEFAULT 0,
        enabled BOOLEAN DEFAULT TRUE,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        updated_by TEXT
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_income_step_rules_enabled ON public.technician_income_step_rules(enabled, priority DESC)`);

// Technician-specific step ladder overrides (special rate per tech)
await pool.query(`
  CREATE TABLE IF NOT EXISTS public.technician_income_tech_step_overrides (
    override_id TEXT PRIMARY KEY,
    technician_username TEXT NOT NULL,
    scope_type TEXT,
    job_type TEXT,
    ac_type TEXT,
    wash_variant TEXT,
    step_1_percent NUMERIC(12,4) DEFAULT 0,
    step_2_percent NUMERIC(12,4) DEFAULT 0,
    step_3_percent NUMERIC(12,4) DEFAULT 0,
    step_4p_percent NUMERIC(12,4) DEFAULT 0,
    priority INT DEFAULT 0,
    enabled BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by TEXT
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_income_tech_overrides_enabled ON public.technician_income_tech_step_overrides(technician_username, enabled, priority DESC)`);

    // ensure at least 1 default rule (fallback)
    try {
      const chk = await pool.query(`SELECT rule_id FROM public.technician_income_step_rules LIMIT 1`);
      if (!chk.rows || chk.rows.length === 0) {
        await pool.query(
          `INSERT INTO public.technician_income_step_rules(
             rule_id, scope_type, job_type, ac_type, wash_variant,
             step_1_percent, step_2_percent, step_3_percent, step_4p_percent,
             priority, enabled, updated_by
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (rule_id) DO NOTHING`,
          ['default', 'default', null, null, null, 60, 60, 60, 60, 0, true, 'system']
        );
      }
    } catch(e){
      console.warn('[ensureSchema] seed default step rule failed', e.message);
    }



    // =======================================
    // 💸 Technician Payout Payments + Adjustments (Phase 2)
    // - payments: เก็บยอดจ่ายจริง/สลิป/โน้ต ต่อ งวด-ช่าง (1 แถว)
    // - adjustments: ปรับยอดแบบมีเหตุผล/audit (หลายแถว)
    // =======================================

    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.technician_payout_payments (
        payment_id BIGSERIAL PRIMARY KEY,
        payout_id TEXT NOT NULL REFERENCES public.technician_payout_periods(payout_id) ON DELETE CASCADE,
        technician_username TEXT NOT NULL,
        paid_amount NUMERIC(12,2) DEFAULT 0,
        paid_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (paid_status IN ('unpaid','partial','paid')),
        paid_at TIMESTAMPTZ,
        paid_by TEXT,
        slip_url TEXT,
        note TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(payout_id, technician_username)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_payout_payments_pid_tech ON public.technician_payout_payments(payout_id, technician_username)`);
    await pool.query(`ALTER TABLE public.technician_payout_payments ADD COLUMN IF NOT EXISTS payment_method TEXT`);
    await pool.query(`ALTER TABLE public.technician_payout_payments ADD COLUMN IF NOT EXISTS payment_reference TEXT`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.technician_payout_adjustments (
        adj_id BIGSERIAL PRIMARY KEY,
        payout_id TEXT NOT NULL REFERENCES public.technician_payout_periods(payout_id) ON DELETE CASCADE,
        technician_username TEXT NOT NULL,
        job_id TEXT,
        adj_amount NUMERIC(12,2) NOT NULL,
        reason TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        created_by TEXT
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_payout_adjustments_pid_tech ON public.technician_payout_adjustments(payout_id, technician_username, created_at DESC)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.technician_deposit_accounts (
        technician_username TEXT PRIMARY KEY,
        target_amount NUMERIC(12,2) NOT NULL DEFAULT 5000,
        is_required BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        updated_by TEXT
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.technician_deposit_ledger (
        ledger_id BIGSERIAL PRIMARY KEY,
        technician_username TEXT NOT NULL,
        payout_id TEXT,
        transaction_type TEXT NOT NULL CHECK (transaction_type IN ('collect','refund','claim_deduct','manual_adjust')),
        amount NUMERIC(12,2) NOT NULL,
        note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        created_by TEXT,
        meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_deposit_ledger_tech_created ON public.technician_deposit_ledger(technician_username, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_deposit_ledger_payout ON public.technician_deposit_ledger(payout_id)`);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_deposit_collect_once_per_payout_tech
      ON public.technician_deposit_ledger(technician_username, payout_id, transaction_type)
      WHERE transaction_type='collect'
    `);

    // =======================================
    // 📘 Accounting module foundation (Phase 1)
    // - Read-only dashboard now; write/issue/void flows come later with audit.
    // - Backward compatible only: no destructive migration.
    // =======================================
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.accounting_permissions (
        username TEXT NOT NULL,
        permission_key TEXT NOT NULL,
        granted_by TEXT,
        granted_at TIMESTAMPTZ DEFAULT NOW(),
        revoked_at TIMESTAMPTZ,
        note TEXT,
        PRIMARY KEY(username, permission_key)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.accounting_audit_log (
        id BIGSERIAL PRIMARY KEY,
        actor_user_id TEXT,
        actor_username TEXT,
        actor_role TEXT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        before_json JSONB,
        after_json JSONB,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        note TEXT
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_accounting_audit_created ON public.accounting_audit_log(created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_accounting_audit_entity ON public.accounting_audit_log(entity_type, entity_id, created_at DESC)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.accounting_documents (
        document_id BIGSERIAL PRIMARY KEY,
        document_no TEXT UNIQUE,
        document_type TEXT NOT NULL CHECK (document_type IN ('quotation','invoice','receipt')),
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','voided','paid')),
        job_id BIGINT REFERENCES public.jobs(job_id) ON DELETE SET NULL,
        customer_name TEXT,
        customer_phone TEXT,
        issue_date DATE,
        due_date DATE,
        subtotal NUMERIC(12,2) DEFAULT 0,
        discount_amount NUMERIC(12,2) DEFAULT 0,
        vat_amount NUMERIC(12,2) DEFAULT 0,
        withholding_amount NUMERIC(12,2) DEFAULT 0,
        total_amount NUMERIC(12,2) DEFAULT 0,
        payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_by TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        issued_by TEXT,
        issued_at TIMESTAMPTZ,
        voided_by TEXT,
        voided_at TIMESTAMPTZ,
        void_reason TEXT
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_accounting_documents_job ON public.accounting_documents(job_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_accounting_documents_status ON public.accounting_documents(document_type, status, created_at DESC)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.accounting_document_sequences (
        document_type TEXT NOT NULL,
        year INT NOT NULL,
        last_number INT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY(document_type, year)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.accounting_expenses (
        expense_id BIGSERIAL PRIMARY KEY,
        expense_date DATE NOT NULL,
        category TEXT NOT NULL,
        vendor_name TEXT,
        description TEXT,
        amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        vat_amount NUMERIC(12,2) DEFAULT 0,
        withholding_amount NUMERIC(12,2) DEFAULT 0,
        payment_method TEXT,
        job_id BIGINT REFERENCES public.jobs(job_id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','voided')),
        created_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_by TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        voided_by TEXT,
        voided_at TIMESTAMPTZ,
        void_reason TEXT
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_accounting_expenses_status ON public.accounting_expenses(status, expense_date DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_accounting_expenses_job ON public.accounting_expenses(job_id)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.accounting_expense_attachments (
        attachment_id BIGSERIAL PRIMARY KEY,
        expense_id BIGINT NOT NULL REFERENCES public.accounting_expenses(expense_id) ON DELETE CASCADE,
        public_url TEXT NOT NULL,
        original_name TEXT,
        mime_type TEXT,
        file_size BIGINT,
        uploaded_by TEXT,
        uploaded_at TIMESTAMPTZ DEFAULT NOW(),
        is_voided BOOLEAN NOT NULL DEFAULT FALSE,
        voided_by TEXT,
        voided_at TIMESTAMPTZ
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_accounting_expense_attachments_expense ON public.accounting_expense_attachments(expense_id, uploaded_at DESC)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.technician_push_subscriptions (
        subscription_id BIGSERIAL PRIMARY KEY,
        technician_username TEXT NOT NULL,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        device_label TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tech_push_subs_username ON public.technician_push_subscriptions(technician_username, is_active)`);

    // =======================================
    // 💳 Technician Withdraw Requests (Partners)
    // - พาร์ทเนอร์ต้องกด "ขอถอน" ก่อน Super Admin จ่าย
    // =======================================
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.technician_withdraw_requests (
        request_id BIGSERIAL PRIMARY KEY,
        payout_id TEXT NOT NULL,
        technician_username TEXT NOT NULL,
        amount_requested NUMERIC(12,2) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected','paid')),
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        approved_at TIMESTAMPTZ,
        approved_by TEXT,
        decided_note TEXT,
        paid_at TIMESTAMPTZ,
        paid_by TEXT
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_withdraw_requests_pid ON public.technician_withdraw_requests(payout_id, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_withdraw_requests_user ON public.technician_withdraw_requests(technician_username, created_at DESC)`);
    // 4) position check constraint: เพิ่ม founder_ceo
    await pool.query(`ALTER TABLE public.technician_profiles DROP CONSTRAINT IF EXISTS technician_profiles_position_check`);
    await pool.query(`
      ALTER TABLE public.technician_profiles
      ADD CONSTRAINT technician_profiles_position_check
      CHECK (position = ANY (ARRAY['junior'::text,'senior'::text,'lead'::text,'founder_ceo'::text]))
    `);

    // ✅ Seed Super Admin Accounts (Whitelist-based)
    // NOTE: ห้ามใช้ role=super_admin เพราะ DB มี constraint users_role_check
    // Super Admin จะตัดสินจาก isSuperAdmin(username) เท่านั้น
    const seedSupers = [
      { username: 'Super', password: '1549', full_name: 'Super Admin' },
      { username: 'S-arm', password: '1549', full_name: 'Super Admin' },
    ];
    for (const s of seedSupers) {
      await pool.query(
        `INSERT INTO public.users(username, password, role, full_name)
         VALUES($1,$2,'admin',$3)
         ON CONFLICT (username)
         DO UPDATE SET password=EXCLUDED.password, role='admin', full_name=EXCLUDED.full_name`,
        [s.username, s.password, s.full_name]
      );
    }
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

  // ✅ Safety toggle (OFF by default):
  // Some clients mistakenly send Bangkok wall-clock time with a trailing 'Z'
  // (e.g. '2026-02-09T09:00:00.000Z') which would become 16:00 in Thailand.
  // If enabled, we treat 'Z' (or +00:00) as *local Bangkok wall-clock*.
  // This is risky to enable globally unless you are sure clients send wrong 'Z'.
  const TREAT_Z_AS_BKK_LOCAL = envBool("APPT_TREAT_Z_AS_BKK_LOCAL", false);

  // 1) มี timezone อยู่แล้ว (Z หรือ +07:00)
  if (/[zZ]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) {
    if (TREAT_Z_AS_BKK_LOCAL) {
      // Treat explicit UTC as Bangkok wall-clock (keep HH:mm)
      // - '...Z' => '...+07:00'
      // - '...+00:00' => '...+07:00'
      if (/[zZ]$/.test(s)) return s.replace(/[zZ]$/, "+07:00");
      if (/\+00:00$/.test(s)) return s.replace(/\+00:00$/, "+07:00");
    }
    return s;
  }

  // 2) รูปแบบจาก <input type="datetime-local">: YYYY-MM-DDTHH:mm
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
    return `${s}:00+07:00`;
  }

  // 2.1) datetime-local with seconds / milliseconds but still no timezone
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(s)) {
    return `${s.replace(/\.(\d{1,3})$/, "")}+07:00`;
  }

  // 3) บางที่อาจส่งมาเป็น "YYYY-MM-DD HH:mm" หรือมีวินาที
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) {
    const t = s.replace(" ", "T");
    const withSec = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t) ? `${t}:00` : t;
    return `${withSec}+07:00`;
  }

  // 3.1) date-only -> treat as Bangkok midnight
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return `${s}T00:00:00+07:00`;
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

// ✅ Helper: convert Date -> Bangkok ISO (+07:00) (wall-clock, no UTC shift)
function dateToBangkokISO(d) {
  try {
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return null;
    // sv-SE gives stable 'YYYY-MM-DD HH:mm:ss'
    const s = dt.toLocaleString('sv-SE', {
      timeZone: 'Asia/Bangkok',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    return s.replace(' ', 'T') + '+07:00';
  } catch {
    return null;
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
      `SELECT username, role, password FROM public.users WHERE username=$1 LIMIT 1`,
      [username]
    );
    if (r.rows.length === 0) return res.status(401).json({ error: "ชื่อผู้ใช้หรือรหัสผ่านผิด" });
    const passwordOk = await verifyPasswordAgainstStored(password, r.rows[0].password);
    if (!passwordOk) return res.status(401).json({ error: "ชื่อผู้ใช้หรือรหัสผ่านผิด" });

    const u = String(r.rows[0].username);
    const role = normalizeRole(r.rows[0].role);

    try {
      const maxAgeSec = 7 * 24 * 60 * 60;
      const token = crypto.randomBytes(24).toString('hex');
      const exp = new Date(Date.now() + maxAgeSec * 1000);
      await pool.query(
        `INSERT INTO public.auth_sessions(session_token, username, role, expires_at)
         VALUES($1,$2,$3,$4)`,
        [token, u, role, exp]
      );
      setAuthCookies(res, { session_token: token, max_age_sec: maxAgeSec });
    } catch (e) {
      console.warn('create session failed:', e.message);
    }

    return res.json({ username: u, role });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server error" });
  }
});

app.post("/auth/change-password", async (req, res) => {
  try {
    const username = (req.body?.username || "").toString().trim();
    const oldPassword = (req.body?.old_password || "").toString();
    const newPassword = (req.body?.new_password || "").toString();
    const confirmPassword = (req.body?.confirm_password || "").toString();

    if (!username) return res.status(400).json({ error: "username หาย" });
    if (!oldPassword) return res.status(400).json({ error: "ต้องใส่รหัสเดิม" });
    if (!newPassword) return res.status(400).json({ error: "ต้องใส่รหัสใหม่" });
    if (newPassword !== confirmPassword) return res.status(400).json({ error: "ยืนยันรหัสใหม่ไม่ตรงกัน" });
    if (newPassword.length < 4) return res.status(400).json({ error: "รหัสใหม่ต้องยาวอย่างน้อย 4 ตัวอักษร" });

    const r = await pool.query(
      `SELECT username, password FROM public.users WHERE username=$1 LIMIT 1`,
      [username]
    );
    if (r.rows.length === 0 || !(await verifyPasswordAgainstStored(oldPassword, r.rows[0].password))) {
      return res.status(401).json({ error: "รหัสเดิมไม่ถูกต้อง" });
    }

    const storedNewPassword = await hashPasswordForStorage(newPassword);
    await pool.query(`UPDATE public.users SET password=$2 WHERE username=$1`, [username, storedNewPassword]);
    return res.json({ ok: true });
  } catch (e) {
    console.error("POST change-password error:", e);
    return res.status(500).json({ error: "เปลี่ยนรหัสผ่านไม่สำเร็จ" });
  }
});

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
    const cols = await getPromotionColumns();
    const select = [
      'promo_id','promo_name','promo_type','promo_value',
      cols.has('is_customer_visible') ? 'is_customer_visible' : 'FALSE AS is_customer_visible',
      cols.has('job_type') ? 'job_type' : 'NULL::text AS job_type',
      cols.has('ac_type') ? 'ac_type' : 'NULL::text AS ac_type',
      cols.has('wash_variant') ? 'wash_variant' : 'NULL::text AS wash_variant',
      cols.has('btu_min') ? 'btu_min' : 'NULL::int AS btu_min',
      cols.has('btu_max') ? 'btu_max' : 'NULL::int AS btu_max',
      cols.has('machine_min') ? 'machine_min' : 'NULL::int AS machine_min',
      cols.has('machine_max') ? 'machine_max' : 'NULL::int AS machine_max',
      cols.has('priority') ? 'priority' : '0::int AS priority',
      cols.has('created_at') ? 'created_at' : 'NOW() AS created_at'
    ].join(', ');

    const r = await pool.query(
      `SELECT ${select}
       FROM public.promotions
       WHERE is_active = TRUE
         AND ($1::boolean = FALSE OR is_customer_visible = TRUE)
       ORDER BY ${(cols.has('priority') ? 'priority DESC,' : '')} ${(cols.has('created_at') ? 'created_at DESC,' : '')} promo_id DESC`,
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
        return_reason, returned_at, returned_by,
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

	    // ✅ Duration Source of Truth (CWF Spec)
	    // Backward compatible:
	    // - if client sends services[] (multi service lines), compute duration via computeDurationMinMulti
	    // - else if client sends duration_min, use it
	    // - else fallback 60
	    let duration_min = 0;
	    try {
	      const servicesIn = Array.isArray(req.body?.services) ? req.body.services : (Array.isArray(req.body?.service_lines) ? req.body.service_lines : null);
	      if (servicesIn && servicesIn.length) {
	        const payloadV2 = { job_type: String(job_type).trim(), services: servicesIn, admin_override_duration_min: 0 };
	        duration_min = computeDurationMinMulti(payloadV2, { source: 'jobs_legacy', conservative: true });
	      }
	    } catch (e) {
	      // fail-open
	      duration_min = 0;
	    }
	    if (!(duration_min > 0)) {
	      const n = Number(req.body?.duration_min || 0);
	      duration_min = Number.isFinite(n) && n > 0 ? Math.floor(n) : 60;
	    }


	    // ✅ Hard Validation: กันชนคิวที่ backend (Source of Truth)
	    // IMPORTANT (Production spec): ห้ามลงงานทับเวลาช่างคนเดิมทุกกรณี
	    // - Forced ใช้เพื่อ “ล็อคช่าง/ข้าม accept_status” เท่านั้น ไม่ใช่เพื่อให้ซ้อนเวลาได้
	    // - ถ้าต้องการ override จริง ๆ ให้เพิ่ม flow เฉพาะในอนาคต (เช่น allow_overlap=true พร้อมสิทธิ์)
	    const conflict = await checkTechCollision(technician_username, appointment_dt, duration_min, null);
	    if (conflict) return http409Conflict(res, conflict);

	    const jobInsert = await client.query(
      `
      INSERT INTO public.jobs
      (customer_name, customer_phone, job_type, appointment_datetime, job_price, address_text,
       maps_url, job_zone,
       gps_latitude, gps_longitude,
       technician_team, technician_username, job_status,
       job_source, dispatch_mode, duration_min,
       created_by_admin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'admin',$14,$15,$16)
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
	        duration_min,
        (req.auth && req.auth.username) ? req.auth.username : (parseCwfAuth(req)?.username || null),
      ]
    );


    const job_id = jobInsert.rows[0].job_id;

    // ✅ booking_code (สุ่ม ไม่เรียง)
    const booking_code = await generateUniqueBookingCode(client);


    await client.query(`UPDATE public.jobs SET booking_code=$1 WHERE job_id=$2`, [booking_code, job_id]);

    
// ✅ job_assignments upsert (single tech) - ทำให้ระบบทีม/เสร็จรายคนทำงานได้แม้เป็นงานเดี่ยว
try {
  await client.query(
    `
    INSERT INTO public.job_assignments (job_id, technician_username, status)
    VALUES ($1,$2,'in_progress')
    ON CONFLICT (job_id, technician_username) DO UPDATE SET status=EXCLUDED.status
    `,
    [job_id, technician_username]
  );
} catch (e) {
  // fail-open
  console.warn("[jobs] upsert job_assignments failed (fail-open)", e.message);
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
        INSERT INTO public.job_items (job_id, item_id, item_name, qty, unit_price, line_total, assigned_technician_username, is_service)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [job_id, it.item_id || null, item_name, qty, unit_price, line_total, it.assigned_technician_username || null, !!it.is_service]
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
      const conflict = await checkTechCollision(u, j.appointment_datetime, j.duration_min, job_id);
      if (conflict) {
        await client.query('ROLLBACK');
        return http409Conflict(res, conflict);
      }
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
      await client.query(
        `UPDATE public.jobs SET job_status='รอดำเนินการ', approved_by_admin=COALESCE(approved_by_admin,$2), approved_at=COALESCE(approved_at,NOW()) WHERE job_id=$1`,
        [job_id, (req.auth && req.auth.username) ? req.auth.username : (parseCwfAuth(req)?.username || null)]
      );
    }
    if (mode === 'offer' && bm === 'urgent' && (curSt === 'รอตรวจสอบ' || curSt === 'รอดำเนินการ')) {
      await client.query(`UPDATE public.jobs SET job_status='รอช่างยืนยัน' WHERE job_id=$1`, [job_id]);
    }


// ✅ sync job_assignments (team status per technician)
try {
  for (const u of safeTeam) {
    await client.query(
      `
      INSERT INTO public.job_assignments (job_id, technician_username, status)
      VALUES ($1,$2,'in_progress')
      ON CONFLICT (job_id, technician_username) DO UPDATE SET status=EXCLUDED.status
      `,
      [job_id, u]
    );
  }
} catch (e) {
  console.warn("[dispatch_v2] upsert job_assignments failed (fail-open)", e.message);
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

// =======================================
// 🔎 Resolve job identifier
// - รับทั้ง job_id (ตัวเลข) และ booking_code (ตัวอักษร)
// - ใช้เพื่อกันเคส "งานจากระบบเดิม" ที่ UI ส่ง id มาไม่ใช่เลข
// - fail-open: ถ้า resolve ไม่เจอ → คืน NaN แล้วให้ handler ตัดสินใจเอง
// =======================================
async function resolveJobIdAny(db, raw) {
  const s = String(raw || "").trim();
  if (!s) return NaN;
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return n;
  try {
    const r = await db.query(
      `SELECT job_id FROM public.jobs WHERE booking_code=$1 OR booking_token=$1 LIMIT 1`,
      [s]
    );
    const id = Number(r.rows?.[0]?.job_id);
    return Number.isFinite(id) && id > 0 ? id : NaN;
  } catch (e) {
    console.warn('resolveJobIdAny failed', e.message);
    return NaN;
  }
}

async function logJobUpdate(job_id, { actor_username, actor_role, action, message, payload } = {}, db = null) {
  // db optional: pass a transaction client to avoid deadlocks/locks when called inside BEGIN/COMMIT
  const q = (db && typeof db.query === "function") ? db.query.bind(db) : pool.query.bind(pool);
  try {
    await q(
      `INSERT INTO public.job_updates_v2 (job_id, actor_username, actor_role, action, message, payload_json)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        Number(job_id),
        actor_username || null,
        actor_role || null,
        (String(action || "").slice(0, 64) || "unknown"),
        message || null,
        payload ? JSON.stringify(payload) : null,
      ]
    );
  } catch (e) {
    // fail-open (do not break production flow)
    try { console.warn('logJobUpdate failed', e.message); } catch {}
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

function validateInternalBookingPayload(body) {
  const b = body || {};
  const missing = [];
  if (!String(b.customer_name || '').trim()) missing.push('customer_name');
  if (!String(b.job_type || '').trim()) missing.push('job_type');
  if (!String(b.appointment_datetime || '').trim()) missing.push('appointment_datetime');
  if (!String(b.address_text || '').trim()) missing.push('address_text');
  return missing;
}

function buildAdminBookingNotificationPayload(body, bookingResult) {
  const b = body || {};
  const r = bookingResult || {};
  const services = Array.isArray(b.services) ? b.services : (Array.isArray(b.service_lines) ? b.service_lines : []);
  const machineCountFromServices = services.reduce((sum, s) => sum + Math.max(0, Number(s?.machine_count || 0)), 0);
  const machine_count = Math.max(
    1,
    Number(b.machine_count || 0) || Number(machineCountFromServices || 0) || 1
  );
  const customer_name = String(b.customer_name || '').trim();
  const customer_phone = String(b.customer_phone || '').trim() || null;
  const appointment_datetime = String(b.appointment_datetime || '').trim();
  const service_type = String(b.job_type || '').trim();
  const address_text = String(b.address_text || '').trim();
  const technician_username = String(r.technician_username || '').trim() || null;
  const booking_code = String(r.booking_code || '').trim() || null;
  const job_id = Number(r.job_id || 0) || null;

  return {
    channel: 'admin_group',
    event: 'new_booking_created_from_ai',
    message_fields: {
      booking_code,
      job_id,
      customer_name,
      customer_phone,
      appointment_datetime,
      service_type,
      machine_count,
      address_text,
      technician_username,
    },
    message_text:
      `มีงานใหม่จาก AI\n` +
      `เลขงาน: ${booking_code || '-'} / #${job_id || '-'}\n` +
      `ลูกค้า: ${customer_name || '-'}\n` +
      `โทร: ${customer_phone || '-'}\n` +
      `นัดหมาย: ${appointment_datetime || '-'}\n` +
      `ประเภทงาน: ${service_type || '-'}\n` +
      `จำนวนเครื่อง: ${machine_count}\n` +
      `ที่อยู่: ${address_text || '-'}\n` +
      `ช่างที่ได้งาน: ${technician_username || 'ยังไม่ระบุ'}`
  };
}

async function handleAdminBookV2(req, res) {
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
    service_zone_code,
    booking_mode,
    tech_type,
    technician_username,
    team_members: team_members_raw,
    assign_mode: assign_mode_raw,
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

  // ✅ assign_mode (auto|single|team)
  // Backward compatible: infer if missing.
  const assign_mode = (() => {
    const v = (assign_mode_raw || '').toString().trim().toLowerCase();
    if (v === 'auto' || v === 'single' || v === 'team') return v;
    const hasTeam = Array.isArray(team_members_raw) && team_members_raw.some(Boolean);
    if (hasTeam) return 'team';
    const hasTech = (technician_username || '').toString().trim().length > 0;
    return hasTech ? 'single' : 'auto';
  })();

  if (!customer_name || !job_type || !appointment_datetime || !address_text) {
    return res.status(400).json({ error: "กรอกข้อมูลไม่ครบ (ชื่อ/ประเภทงาน/วันนัด/ที่อยู่)" });
  }

  // ✅ Timezone safety (Asia/Bangkok):
  // Frontend often sends `YYYY-MM-DDTHH:mm:ss` (no tz). In Node.js that is treated as UTC,
  // causing +7h drift in technician view (e.g., 09:00 -> 16:00).
  // Normalize ONCE and use the normalized value everywhere in this handler.
  const apptIso = normalizeAppointmentDatetime(appointment_datetime);

  const bm = (booking_mode || "scheduled").toString().trim().toLowerCase();
  const ttype = (tech_type || (bm === "urgent" ? "partner" : "company")).toString().trim().toLowerCase();
  const mode = (dispatch_mode || "normal").toString().trim().toLowerCase();
  const zoneDetected = await detectServiceZoneFromText({ address_text, job_zone, service_zone_code, maps_url });
  const detectedZoneCode = zoneDetected?.service_zone_code || null;
  const detectedZoneLabel = zoneDetected?.service_zone_label || null;
  const detectedZoneSource = zoneDetected?.service_zone_source || (detectedZoneCode ? "auto_detect" : null);
  let zone_filter_applied = false;
  let zone_matched_technicians_count = 0;
  let zone_fallback_used = false;
  let forced_assignment_zone_warning = null;
  if (!['company','partner','all'].includes(ttype)) return res.status(400).json({ error: "tech_type ต้องเป็น company|partner|all" });
  if (!['normal','forced','offer'].includes(mode)) return res.status(400).json({ error: "dispatch_mode ต้องเป็น normal|forced|offer" });

  // ✅ Enforce assign_mode contract (R2)
  // - single: technician_username required, team_members must be empty
  // - auto: technician_username optional, team_members must be empty
  // - team: technician_username required, team_members allowed
  const tmRawArr = Array.isArray(team_members_raw) ? team_members_raw : [];
  const tmAny = tmRawArr.some(x => (x||'').toString().trim());
  const techProvided = (technician_username || '').toString().trim().length > 0;
  if (assign_mode === 'single') {
    if (!techProvided) return res.status(400).json({ error: 'โหมด single ต้องระบุ technician_username' });
    if (tmAny) return res.status(400).json({ error: 'โหมด single ห้ามส่ง team_members' });
  } else if (assign_mode === 'auto') {
    if (tmAny) return res.status(400).json({ error: 'โหมด auto ห้ามส่ง team_members' });
  } else if (assign_mode === 'team') {
    if (!techProvided) return res.status(400).json({ error: 'โหมด team ต้องระบุ technician_username (ช่างหลัก)' });
  }

  const payloadV2 = {
    job_type: String(job_type).trim(),
    ac_type: (ac_type || "").toString().trim(),
    btu: coerceNumber(btu, 0),
    machine_count: Math.max(1, coerceNumber(machine_count, 1)),
    wash_variant: (wash_variant || "").toString().trim(),
    repair_variant: (repair_variant || "").toString().trim(),
    // ✅ รองรับหลายรายการบริการในใบงานเดียว (admin-add-v2 ส่งมาเป็น services[])
    services: Array.isArray(body.services) ? body.services : (Array.isArray(body.service_lines) ? body.service_lines : null),
    admin_override_duration_min: Math.max(0, coerceNumber(override_duration_min, 0)),
  };

  // CWF Spec: Always use conservative duration for booking/collision (no parallel/team reduction)
  let duration_min = computeDurationMinMulti(payloadV2, { source: "admin_book_v2", conservative: true });
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

  // ✅ Best-effort resolve short Google Maps links to precise lat/lng (fail-open)
  // - ensures check-in / navigation uses correct pin coordinates
  let final_lat = Number.isFinite(Number(parsed_lat)) ? Number(parsed_lat) : null;
  let final_lng = Number.isFinite(Number(parsed_lng)) ? Number(parsed_lng) : null;
  if ((final_lat == null || final_lng == null) && maps_url) {
    const m = String(maps_url || '').trim();
    if (m && /maps\.app\.goo\.gl|goo\.gl/i.test(m)) {
      try {
        const rr = await resolveMapsUrlToLatLng(m);
        if (rr && Number.isFinite(Number(rr.lat)) && Number.isFinite(Number(rr.lng))) {
          final_lat = Number(rr.lat);
          final_lng = Number(rr.lng);
        }
      } catch (e) {
        // fail-open
      }
    }
  }


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

const serviceLineItems = buildServiceLineItemsFromPayload(
  (payloadV2.services && Array.isArray(payloadV2.services))
    ? payloadV2
    : { ...payloadV2, services: [{
        job_type: payloadV2.job_type,
        ac_type: payloadV2.ac_type,
        btu: payloadV2.btu,
        machine_count: payloadV2.machine_count,
        wash_variant: payloadV2.wash_variant,
        repair_variant: payloadV2.repair_variant,
        assigned_to: (technician_username || null),
      }] }
);

if (coerceNumber(override_price, 0) > 0) {
  // Customer override price only. Payroll must never use this as technician income.
  computedItems.push({ item_id: null, item_name: `ค่าบริการ (override)`, qty: 1, unit_price: coerceNumber(override_price, 0), line_total: coerceNumber(override_price, 0), is_service: false });
} else if (serviceLineItems.length) {
  for (const it of serviceLineItems) computedItems.push(it);
} else if (standard_price > 0) {
  computedItems.push({ item_id: null, item_name: `ค่าบริการมาตรฐาน (${payloadV2.job_type || '-'})`, qty: 1, unit_price: Number(standard_price), line_total: Number(standard_price), is_service: false });
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
      
      // list group techs (Admin assign ignores accept_status; Offer must respect paused)
      const isAll = (ttype === 'all');
      const offerOnly = (mode === 'offer'); // offer flow must respect accept_status
      const tr = await client.query(
        `
        SELECT u.username, p.home_service_zone_code, p.secondary_service_zone_code, COALESCE(p.allow_out_of_zone,FALSE) AS allow_out_of_zone
        FROM public.users u
        LEFT JOIN public.technician_profiles p ON p.username=u.username
        WHERE u.role='technician'
          AND ($2::boolean IS TRUE OR COALESCE(p.accept_status,'ready') <> 'paused')
          AND ($3::boolean IS TRUE OR (
                ($1='company' AND COALESCE(p.employment_type,'company') IN ('company','custom','special_only'))
             OR ($1<>'company' AND COALESCE(p.employment_type,'company') = $1)
          ))
        ORDER BY u.username
        `,
        [ttype === 'all' ? 'company' : ttype, !offerOnly, isAll]
      );
      const rankedRows = (ENABLE_SERVICE_ZONE_FILTER && detectedZoneCode) ? rankTechniciansForServiceZone(tr.rows || [], detectedZoneCode) : (tr.rows || []);
      const list = rankedRows.map((r) => r.username).slice(0, 60);
      selectedTech = await pickFirstAvailableTech(list, apptIso, duration_min);
    } else {
      // ✅ Forced lock: allow even if technician hasn't opened accept_status,
      // but still block lock on the technician's off-day.
      if (mode === 'forced') {
        try {
          const pr = await client.query(
            `SELECT username, weekly_off_days FROM public.technician_profiles WHERE username=$1 LIMIT 1`,
            [selectedTech]
          );
          const techRow = { username: selectedTech, weekly_off_days: pr.rows[0]?.weekly_off_days || '' };
          const apptDate = String(apptIso).slice(0,10);
          const offMap = await buildOffMapForDate(apptDate, [selectedTech]);
          if (isTechOffOnDate(techRow, apptDate, offMap)) {
            return res.status(409).json({ error: `ช่างวันหยุด: ${selectedTech} (ไม่สามารถล็อคงานได้)` });
          }
        } catch (e) {
          console.warn('[admin_book_v2] off-day check failed (fail-open)', e.message);
        }
      }
      const conflict = await checkTechCollision(selectedTech, apptIso, duration_min, null);
      if (conflict) {
        return http409Conflict(res, conflict);
      }
      if (detectedZoneCode) {
        const zoneMatch = await technicianMatchesServiceZone(selectedTech, detectedZoneCode);
        if (!zoneMatch.matches) {
          forced_assignment_zone_warning = {
            technician_username: selectedTech,
            job_zone: detectedZoneCode,
            technician_zone: zoneMatch.zone_code,
            allow_out_of_zone: zoneMatch.allow_out_of_zone,
          };
          console.warn("[admin_book_v2] forced out-of-zone assignment", forced_assignment_zone_warning);
        }
      }
    }

    if (!selectedTech) {
      return res.status(409).json({ error: "ไม่พบช่างว่างในช่วงเวลานี้" });
    }

    // ✅ Team members collision check (including buffer) - backward compatible
    const tmIn = (assign_mode === 'team') ? (Array.isArray(team_members_raw) ? team_members_raw : []) : [];
    const tmList = [...new Set(tmIn.map(x => (x||"").toString().trim()).filter(Boolean))].slice(0, 10);
    for (const u of tmList) {
      if (u === selectedTech) continue;
      const conflict = await checkTechCollision(u, apptIso, duration_min, null);
      if (conflict) {
        return http409Conflict(res, conflict);
      }
    }

    const jobStatus = bm === "urgent" ? "รอช่างยืนยัน" : "รอดำเนินการ";
    const jobInsert = await client.query(
      `
      INSERT INTO public.jobs
      (customer_name, customer_phone, job_type, appointment_datetime, job_price,
       address_text, technician_team, technician_username, job_status,
       booking_token, job_source, dispatch_mode, customer_note,
       maps_url, job_zone, duration_min, booking_mode, admin_override_duration_min,
       gps_latitude, gps_longitude, service_zone_code, service_zone_source)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,'admin',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING job_id
      `,
      [
        String(customer_name).trim(),
        (customer_phone || "").toString().trim(),
        String(job_type).trim(),
        apptIso,
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
        final_lat,
        final_lng,
        detectedZoneCode,
        detectedZoneSource,
      ]
    );

    const job_id = jobInsert.rows[0].job_id;
    const booking_code = await generateUniqueBookingCode(client);
    await client.query(`UPDATE public.jobs SET booking_code=$1 WHERE job_id=$2`, [booking_code, job_id]);

    // ✅ Team members (primary + assistants) - backward compatible
    // NOTE: some production DBs may not have is_primary column yet.
    try {
      const tmAll = [...new Set([selectedTech, ...tmList].map(x => (x||"").toString().trim()).filter(Boolean))].slice(0, 10);
      await client.query(`DELETE FROM public.job_team_members WHERE job_id=$1`, [job_id]);
      for (const u of tmAll) {
        try {
          await client.query(
            `INSERT INTO public.job_team_members (job_id, username, is_primary)
             VALUES ($1,$2,$3)`,
            [job_id, u, u === selectedTech]
          );
        } catch (insErr) {
          if (insErr && String(insErr.code) === '42703') {
            await client.query(
              `INSERT INTO public.job_team_members (job_id, username)
               VALUES ($1,$2)
               ON CONFLICT (job_id, username) DO NOTHING`,
              [job_id, u]
            );
          } else {
            throw insErr;
          }
        }
      }
    } catch (e) {
      console.warn("[admin_book_v2] save team members failed", e);
    }

    // ✅ job_assignments upsert (team status per technician)
    try {
      const tmAll = [...new Set([selectedTech, ...tmList].map(x => (x||"").toString().trim()).filter(Boolean))].slice(0, 10);
      for (const u of tmAll) {
        await client.query(
          `
          INSERT INTO public.job_assignments (job_id, technician_username, status)
          VALUES ($1,$2,'in_progress')
          ON CONFLICT (job_id, technician_username) DO UPDATE SET status=EXCLUDED.status
          `,
          [job_id, u]
        );
      }
    } catch (e) {
      console.warn("[admin_book_v2] upsert job_assignments failed (fail-open)", e.message);
    }

    // job_items
    for (const it of computedItems) {
      await client.query(
        `INSERT INTO public.job_items (job_id, item_id, item_name, qty, unit_price, line_total, assigned_technician_username, is_service)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          job_id,
          it.item_id || null,
          it.item_name,
          Number(it.qty || 0),
          Number(it.unit_price || 0),
          Number(it.line_total || 0),
          (it.assigned_technician_username || null),
          !!it.is_service,
        ]
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

    const directPushTargets = (bm === "urgent") ? [] : [...new Set([selectedTech, ...tmList].map(x => (x||"").toString().trim()).filter(Boolean))];
    let urgentPushTargets = [];

    // urgent offers to partner (ถ้า bm=urgent และกลุ่ม partner)
    if (bm === "urgent") {
      const partners = await client.query(
        `
        SELECT u.username, p.home_service_zone_code, p.secondary_service_zone_code, COALESCE(p.allow_out_of_zone,FALSE) AS allow_out_of_zone
        FROM public.users u
        LEFT JOIN public.technician_profiles p ON p.username=u.username
        WHERE u.role='technician'
          AND COALESCE(p.accept_status,'ready') <> 'paused'
          AND COALESCE(p.employment_type,'company') = 'partner'
        ORDER BY u.username
        `
      );

      const partnerRows = partners.rows || [];
      let candidateRows = partnerRows;
      if (ENABLE_SERVICE_ZONE_FILTER && detectedZoneCode) {
        const primary = partnerRows.filter(r => String(r.home_service_zone_code || "").toUpperCase() === detectedZoneCode);
        const secondary = partnerRows.filter(r => String(r.home_service_zone_code || "").toUpperCase() !== detectedZoneCode && String(r.secondary_service_zone_code || "").toUpperCase() === detectedZoneCode);
        const fallback = partnerRows.filter(r => String(r.home_service_zone_code || "").toUpperCase() !== detectedZoneCode && String(r.secondary_service_zone_code || "").toUpperCase() !== detectedZoneCode && r.allow_out_of_zone);
        zone_filter_applied = true;
        zone_matched_technicians_count = primary.length + secondary.length;
        zone_fallback_used = primary.length === 0 && secondary.length === 0 && fallback.length > 0;
        candidateRows = (primary.length || secondary.length || fallback.length) ? [...primary, ...secondary, ...fallback] : partnerRows;
        if (!primary.length && !secondary.length && !fallback.length) zone_fallback_used = true;
      }
      const list = rankTechniciansForServiceZone(candidateRows, detectedZoneCode).map((r) => r.username);
      // จำกัด 30 ทีม
      const maxTeams = 30;
      const shuffled = list.slice(0, maxTeams);
      const available = [];
      for (const u of shuffled) {
        const ok = await isTechFree(u, apptIso, duration_min, null);
        if (ok) available.push(u);
      }

      for (const u of available) {
        await client.query(
          `INSERT INTO public.job_offers (job_id, technician_username, status, expires_at)
           VALUES ($1,$2,'pending', NOW() + INTERVAL '10 minutes')`,
          [job_id, u]
        );
      }
      urgentPushTargets = available.slice();
      console.log("[admin_book_v2] urgent_offers", { job_id, booking_code, count: available.length });
    }

    await client.query("COMMIT");

    // 🔔 best-effort push: ห้ามให้แจ้งเตือนพังจนการลงงาน fail
    try {
      if (urgentPushTargets.length) {
        _notifyUrgentOffer({ usernames: urgentPushTargets, job_id, booking_code, job_type, appointment_datetime: apptIso, job_zone }).catch(()=>{});
      } else if (directPushTargets.length) {
        _notifyDirectJobAssigned({ usernames: directPushTargets, job_id, booking_code, job_type, appointment_datetime: apptIso, job_zone }).catch(()=>{});
      }
    } catch (_) {}

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
      service_zone_code: detectedZoneCode,
      service_zone_label: detectedZoneLabel,
      service_zone_source: detectedZoneSource,
      zone_filter_applied,
      zone_matched_technicians_count,
      zone_fallback_used,
      forced_assignment_zone_warning,
      offers_count: urgentPushTargets.length,
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("/admin/book_v2 error:", e);
    return res.status(500).json({ error: e.message || "admin book v2 failed" });
  } finally {
    client.release();
  }
}

function getBangkokTodayYMD() {
  try {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return dateToBangkokISO(new Date())?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  }
}

async function handleInternalBookFromAi(req, res) {
  const missing = validateInternalBookingPayload(req.body);
  if (missing.length) {
    return res.status(400).json({
      error: 'MISSING_REQUIRED_FIELDS',
      missing_fields: missing,
    });
  }
  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    if (payload && payload.success) {
      return originalJson({
        ...payload,
        admin_notification: buildAdminBookingNotificationPayload(req.body, payload),
      });
    }
    return originalJson(payload);
  };
  return handleAdminBookV2(req, res);
}

app.get("/admin/customer_lookup_by_phone_v2", requireAdminSoft, async (req, res) => {
  try {
    const rawPhone = String(req.query.phone || "").trim();
    const candidates = buildPhoneLookupCandidates(rawPhone);
    if (!candidates.length || normalizePhoneLookupDigits(rawPhone).length < 8) {
      return res.json({ found: false, source: null });
    }

    const profileR = await pool.query(
      `
      SELECT
        COALESCE(NULLIF(display_name, ''), NULLIF(phone, ''), 'ลูกค้าเดิม') AS customer_name,
        phone AS customer_phone,
        address AS address_text,
        maps_url
      FROM public.customer_profiles
      WHERE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = ANY($1::text[])
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1
      `,
      [candidates]
    );
    if (profileR.rows.length) {
      const row = profileR.rows[0];
      return res.json({
        found: true,
        source: "customer_profiles",
        customer_name: row.customer_name || null,
        customer_phone: row.customer_phone || null,
        address_text: row.address_text || null,
        maps_url: row.maps_url || null,
      });
    }

    const jobR = await pool.query(
      `
      SELECT
        customer_name,
        customer_phone,
        address_text,
        maps_url,
        booking_code,
        job_id
      FROM public.jobs
      WHERE regexp_replace(COALESCE(customer_phone, ''), '[^0-9]', '', 'g') = ANY($1::text[])
      ORDER BY COALESCE(finished_at, appointment_datetime, created_at) DESC NULLS LAST, job_id DESC
      LIMIT 1
      `,
      [candidates]
    );
    if (jobR.rows.length) {
      const row = jobR.rows[0];
      return res.json({
        found: true,
        source: "latest_job",
        customer_name: row.customer_name || null,
        customer_phone: row.customer_phone || null,
        address_text: row.address_text || null,
        maps_url: row.maps_url || null,
        booking_code: row.booking_code || null,
        job_id: row.job_id || null,
      });
    }

    return res.json({ found: false, source: null });
  } catch (e) {
    console.error("GET /admin/customer_lookup_by_phone_v2", e);
    return res.status(500).json({ error: "ค้นหาข้อมูลลูกค้าเก่าไม่สำเร็จ" });
  }
});

app.post("/admin/book_v2", requireAdminSoft, handleAdminBookV2);
app.post("/admin/urgent_broadcast_v2", requireAdminSoft, (req, res) => {
  req.body = {
    ...(req.body || {}),
    booking_mode: "urgent",
    dispatch_mode: req.body?.dispatch_mode || "offer",
  };
  console.log("[urgent_broadcast_v2 alias] forwarding to /admin/book_v2", {
    booking_mode: req.body?.booking_mode,
    dispatch_mode: req.body?.dispatch_mode,
  });
  return handleAdminBookV2(req, res);
});
app.post("/internal/book_from_ai", requireInternalApiKeyOnly, handleInternalBookFromAi);

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

    // IMPORTANT: Force Bangkok boundary for date filters.
    // If we pass naive timestamps while the runtime or DB uses UTC, results can appear "missing".
    if (date_from) {
      params.push(date_from + " 00:00:00+07:00");
      where.push(`appointment_datetime >= $${p++}::timestamptz`);
    }
    if (date_to) {
      params.push(date_to + " 23:59:59+07:00");
      where.push(`appointment_datetime <= $${p++}::timestamptz`);
    }
    if (technician) {
      params.push(technician);
      where.push(`technician_username = $${p++}`);
    }
    if (q) {
      params.push(`%${q}%`);
      // PATCH: allow search by customer phone as well (requested by Admin)
      where.push(`(customer_name ILIKE $${p} OR customer_phone ILIKE $${p} OR address_text ILIKE $${p} OR job_zone ILIKE $${p} OR booking_code ILIKE $${p})`);
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
// 🗑️ ADMIN HARD DELETE JOB (DB)
// DELETE /admin/jobs/:job_id
// - admin only (use existing auth style)
// - delete related rows (best-effort, fail-safe)
// =======================================
app.delete("/admin/jobs/:job_id", requireAdminSoft, async (req, res) => {
  const jobId = Number(req.params.job_id);
  if (!Number.isFinite(jobId) || jobId <= 0) {
    return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const jr = await client.query(
      `SELECT job_id, booking_code FROM public.jobs WHERE job_id=$1 LIMIT 1`,
      [jobId]
    );
    if (!jr.rows?.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "ไม่พบงาน" });
    }

    
// delete related tables (best-effort)
// IMPORTANT: In Postgres, any error inside a transaction aborts the whole transaction.
// So we MUST wrap each best-effort delete with SAVEPOINT.
let _sp_i = 0;
const deleteFrom = async (sql, params) => {
  const sp = `sp_del_${++_sp_i}`;
  try {
    await client.query(`SAVEPOINT ${sp}`);
    await client.query(sql, params);
    await client.query(`RELEASE SAVEPOINT ${sp}`);
  } catch (e) {
    try { await client.query(`ROLLBACK TO SAVEPOINT ${sp}`); } catch(_e) {}
    try { await client.query(`RELEASE SAVEPOINT ${sp}`); } catch(_e) {}
    console.warn("[admin_delete_job] skip", e.message);
  }
};

// delete children first (FK-safe)
await deleteFrom(`DELETE FROM public.job_photo_metadata WHERE job_id=$1`, [jobId]);
await deleteFrom(`DELETE FROM public.job_photos WHERE job_id=$1`, [jobId]);
await deleteFrom(`DELETE FROM public.job_updates_v2 WHERE job_id=$1`, [jobId]);
await deleteFrom(`DELETE FROM public.job_team_members WHERE job_id=$1`, [jobId]);
await deleteFrom(`DELETE FROM public.job_assignments WHERE job_id=$1`, [jobId]);
await deleteFrom(`DELETE FROM public.job_offer_recipients WHERE job_id=$1`, [jobId]);
await deleteFrom(`DELETE FROM public.job_offers WHERE job_id=$1`, [jobId]);

// v2 pricing/items/promotions (some deployments have these tables + FK to jobs)
await deleteFrom(`DELETE FROM public.job_items WHERE job_id=$1`, [jobId]);
await deleteFrom(`DELETE FROM public.job_promotions WHERE job_id=$1`, [jobId]);
await deleteFrom(`DELETE FROM public.job_pricing_requests WHERE job_id=$1`, [jobId]);
// reviews can reference job_id as well
await deleteFrom(`DELETE FROM public.technician_reviews WHERE job_id=$1`, [jobId]);

// -----------------------------------------------------------------
// Dynamic cleanup (no regression):
// Some production DBs may have extra tables referencing jobs(job_id).
// If we miss one FK, deleting from jobs will fail with 23503.
// So we proactively scan FK references and best-effort delete rows.
// -----------------------------------------------------------------
const quoteIdent = (s) => {
  const v = String(s || '');
  return '"' + v.replace(/"/g, '""') + '"';
};

try {
  const fk = await client.query(
    `
    SELECT
      con.conrelid::regclass::text AS rel,
      att.attname AS col
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON TRUE
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ck.attnum
    WHERE con.contype = 'f'
      AND con.confrelid = 'public.jobs'::regclass
      AND nsp.nspname = 'public'
      AND att.attname = 'job_id'
    GROUP BY con.conrelid, att.attname
    ORDER BY rel;
    `
  );
  for (const row of (fk.rows || [])) {
    const rel = String(row.rel || '').trim();
    if (!rel) continue;
    // rel is already schema-qualified text (e.g. public.some_table)
    const parts = rel.split('.');
    if (parts.length !== 2) continue;
    const tbl = `${quoteIdent(parts[0])}.${quoteIdent(parts[1])}`;
    // skip the parent table
    if (parts[1] === 'jobs') continue;
    await deleteFrom(`DELETE FROM ${tbl} WHERE job_id=$1`, [jobId]);
  }
} catch (e) {
  console.warn('[admin_delete_job] fk scan skipped', e.message);
}

const dr = await client.query(`DELETE FROM public.jobs WHERE job_id=$1`, [jobId]);
    await client.query("COMMIT");
    return res.json({ ok: true, deleted: dr.rowCount || 0 });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch(_e) {}
    console.error("/admin/jobs/:job_id delete error:", e);
    return res.status(500).json({ error: e.message || "ลบงานไม่สำเร็จ" });
  } finally {
    client.release();
  }
});

// =======================================


// =======================================
// 🧨 ADMIN RESET JOB TABLES (TEST CLEANUP)
// POST /admin/reset_jobs_v2
// - admin only
// - deletes job-related data (NOT technicians/users/prices/promotions)
// - requires confirm token in body: { confirm: "RESET" }
// =======================================
app.post("/admin/reset_jobs_v2", requireAdminSoft, async (req, res) => {
  const confirmToken = String(req.body?.confirm || "").trim().toUpperCase();
  if (confirmToken !== "RESET") {
    return res.status(400).json({ error: "ต้องยืนยันด้วยคำว่า RESET" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    
    // delete children first (best-effort for older DBs)
    // IMPORTANT: use DO block to ignore undefined_table without breaking transaction
    const safeDelete = async (tableName) => {
      const tn = String(tableName || '').trim();
      if(!tn) return;
      const sql = `DO $$
BEGIN
  EXECUTE 'DELETE FROM ${tn}';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'skip relation % does not exist', '${tn}';
END $$;`;
      try {
        await client.query(sql);
      } catch (e) {
        console.warn("[reset_jobs_v2] skip", tn, e.message);
      }
    };

    await safeDelete('public.job_photo_metadata');
    await safeDelete('public.job_photos');
    await safeDelete('public.job_updates_v2');
    await safeDelete('public.job_offer_recipients');
    await safeDelete('public.job_offers');
    await safeDelete('public.job_team_members');
    await safeDelete('public.job_assignments');
    await safeDelete('public.job_promotions');
    await safeDelete('public.job_items');
    await safeDelete('public.job_pricing_requests');

    // finally jobs
    const dr = await client.query(`DELETE FROM public.jobs`);

    await client.query("COMMIT");
    return res.json({ ok: true, deleted_jobs: dr.rowCount || 0 });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch(_e) {}
    console.error("[reset_jobs_v2] error", e);
    return res.status(500).json({ error: e.message || "reset ไม่สำเร็จ" });
  } finally {
    client.release();
  }
});

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
  // PATCH: รองรับทั้ง job_id (ตัวเลข) และ booking_code (เช่น CWF0000123)
  const raw = String(req.params.job_id || "").trim();
  const isNumeric = /^\d+$/.test(raw);
  const job_id = isNumeric ? Number(raw) : 0;
  const booking_code = (!isNumeric && raw) ? raw : null;
  if (!job_id && !booking_code) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });
  try {
    const jr = await pool.query(
      `SELECT *
       FROM public.jobs
       WHERE ${job_id ? "job_id=$1" : "booking_code=$1"}
       LIMIT 1`,
      [job_id || booking_code]
    );
    const job = jr.rows[0];
    if (!job) return res.status(404).json({ error: "ไม่พบงาน" });

    const jid = Number(job.job_id);

    let ir;
    try {
      ir = await pool.query(
        `SELECT item_id, item_name, qty, unit_price, line_total, assigned_technician_username
         FROM public.job_items
         WHERE job_id=$1
         ORDER BY job_item_id ASC`,
        [jid]
      );
    } catch (e) {
      // backward compatible: older schema without assigned_technician_username
      ir = await pool.query(
        `SELECT item_id, item_name, qty, unit_price, line_total
         FROM public.job_items
         WHERE job_id=$1
         ORDER BY job_item_id ASC`,
        [jid]
      );
    }

    const pr = await pool.query(
      `SELECT jp.promo_id, p.promo_name, p.promo_type, p.promo_value
       FROM public.job_promotions jp
       JOIN public.promotions p ON p.promo_id=jp.promo_id
       WHERE jp.job_id=$1
	   -- NOTE: บางฐานข้อมูลไม่มีคอลัมน์ jp.job_promo_id (เคยทำให้ /admin/job_v2 พังทั้งหน้า)
	   -- ใช้ promo_id แทนเพื่อให้ backward compatible
	   ORDER BY jp.promo_id DESC
       LIMIT 1`,
      [jid]
    );

    // photos + updates + team (non-breaking additions)
    const ph = await pool.query(
      `SELECT photo_id, phase, created_at, uploaded_at, public_url
       FROM public.job_photos WHERE job_id=$1 ORDER BY photo_id ASC`,
      [jid]
    );
    const up = await pool.query(
      `SELECT update_id, actor_username, actor_role, action, message, payload_json, created_at
       FROM public.job_updates_v2 WHERE job_id=$1 ORDER BY created_at DESC, update_id DESC LIMIT 200`,
      [jid]
    );
    const tm = await pool.query(
      `SELECT m.username, COALESCE(p.full_name, m.username) AS full_name, p.phone
       FROM public.job_team_members m
       LEFT JOIN public.technician_profiles p ON p.username=m.username
       WHERE m.job_id=$1
       ORDER BY m.added_at ASC`,
      [jid]
    );

    const now = new Date();
    const wEnd = job.warranty_end_at ? new Date(job.warranty_end_at) : null;
    const isInWarranty = !!(wEnd && wEnd.getTime() >= now.getTime());

    return res.json({
      success: true,
      job: Object.assign({}, job, { is_in_warranty: isInWarranty }),
      items: ir.rows || [],
      promotion: pr.rows[0] || null,
      photos: ph.rows || [],
      updates: up.rows || [],
      team_members: tm.rows || [],
    });
  } catch (e) {
    console.error("/admin/job_v2 error:", e);
    // SAFE FALLBACK (Backward compatible):
    // บางระบบ production อาจยังไม่มีตารางเสริม (job_photos/job_updates_v2/job_team_members)
    // ให้ยังโหลดใบงานหลัก + รายการ ได้ เพื่อไม่ให้แอดมินทำงานสะดุด
    try {
      const jr = await pool.query(
        `SELECT * FROM public.jobs WHERE ${job_id ? "job_id=$1" : "booking_code=$1"} LIMIT 1`,
        [job_id || booking_code]
      );
      const job = jr.rows[0];
      if (!job) return res.status(404).json({ error: "ไม่พบงาน" });

      let ir;
      try {
        ir = await pool.query(
          `SELECT item_id, item_name, qty, unit_price, line_total, assigned_technician_username
           FROM public.job_items WHERE job_id=$1 ORDER BY job_item_id ASC`,
          [Number(job.job_id)]
        );
      } catch (e) {
        ir = await pool.query(
          `SELECT item_id, item_name, qty, unit_price, line_total
           FROM public.job_items WHERE job_id=$1 ORDER BY job_item_id ASC`,
          [Number(job.job_id)]
        );
      }

      const now = new Date();
      const wEnd = job.warranty_end_at ? new Date(job.warranty_end_at) : null;
      const isInWarranty = !!(wEnd && wEnd.getTime() >= now.getTime());

      return res.json({
        success: true,
        job: Object.assign({}, job, { is_in_warranty: isInWarranty }),
        items: ir.rows || [],
        promotion: null,
        photos: [],
        updates: [],
        team_members: [],
        _fallback: true,
      });
    } catch (e2) {
      console.error("/admin/job_v2 fallback error:", e2);
      return res.status(500).json({ error: "โหลดใบงานไม่สำเร็จ" });
    }
  }
});

// Backward-compatible alias:
// Some clients / shared links call: /admin/job_v2?id=<JOB_ID_OR_BOOKING_CODE>
// Support that by redirecting to the canonical route /admin/job_v2/:job_id
app.get('/admin/job_v2', requireAdminSoft, (req, res) => {
  const id = String(req.query?.id || req.query?.job_id || req.query?.booking_code || '').trim();
  if (!id) return res.status(400).json({ error: 'ต้องระบุ id' });
  return res.redirect(302, `/admin/job_v2/${encodeURIComponent(id)}`);
});

function createHttpError(status, message, extra) {
  const err = new Error(message || 'เกิดข้อผิดพลาด');
  err.status = Number(status || 500);
  if (extra && typeof extra === 'object') err.extra = extra;
  return err;
}

function normalizeAdminEditItemRow(it) {
  const row = it && typeof it === 'object' ? it : {};
  return {
    item_id: row.item_id ? Number(row.item_id) : null,
    item_name: String(row.item_name || '').trim(),
    qty: Number(row.qty || 0),
    unit_price: Number(row.unit_price || 0),
    assigned_technician_username: String(row.assigned_technician_username || '').trim() || null,
  };
}

function normalizeAdminEditItemsSnapshot(items) {
  return (Array.isArray(items) ? items : [])
    .map(normalizeAdminEditItemRow)
    .filter((it) => it.item_name);
}

function normalizeAdminEditTeamSnapshot(payload) {
  const body = payload && typeof payload === 'object' ? payload : {};
  const rawPrimary = String(body.primary_username || body.primary || '').trim();
  let members = Array.isArray(body.members) ? body.members : [];
  members = members.map((x) => String(x || '').trim()).filter(Boolean);
  if (rawPrimary && !members.includes(rawPrimary)) members.unshift(rawPrimary);
  members = [...new Set(members)];
  const primary_username = rawPrimary && members.includes(rawPrimary) ? rawPrimary : (members[0] || null);
  return { primary_username, members };
}

async function loadJobItemsSnapshotForAdminEdit(client, job_id) {
  try {
    const r = await client.query(
      `SELECT item_id, item_name, qty, unit_price, assigned_technician_username
       FROM public.job_items
       WHERE job_id=$1
       ORDER BY job_item_id ASC`,
      [job_id]
    );
    return normalizeAdminEditItemsSnapshot(r.rows || []);
  } catch (e) {
    if (!String(e?.message || '').includes('assigned_technician_username')) throw e;
    const r = await client.query(
      `SELECT item_id, item_name, qty, unit_price
       FROM public.job_items
       WHERE job_id=$1
       ORDER BY job_item_id ASC`,
      [job_id]
    );
    return normalizeAdminEditItemsSnapshot(r.rows || []);
  }
}

async function loadJobTeamSnapshotForAdminEdit(client, job_id) {
  const jr = await client.query(
    `SELECT technician_username
     FROM public.jobs
     WHERE job_id=$1
     LIMIT 1`,
    [job_id]
  );
  const primary_username = String(jr.rows?.[0]?.technician_username || '').trim() || null;

  let members = [];
  try {
    const tr = await client.query(
      `SELECT username
       FROM public.job_team_members
       WHERE job_id=$1
       ORDER BY added_at ASC, username ASC`,
      [job_id]
    );
    members = (tr.rows || []).map((r) => String(r.username || '').trim()).filter(Boolean);
  } catch (_) {
    members = [];
  }

  if (primary_username && !members.includes(primary_username)) members.unshift(primary_username);
  return normalizeAdminEditTeamSnapshot({ primary_username, members });
}

function ensureAdminEditSnapshotMatches(baseSnapshot, currentSnapshot, conflictMessage, extra) {
  if (baseSnapshot === undefined) return;
  if (JSON.stringify(baseSnapshot) !== JSON.stringify(currentSnapshot)) {
    throw createHttpError(409, conflictMessage, extra);
  }
}

function getPerTechDurationFromRequestedItems(jobType, items, techUsername, fallbackDuration) {
  const durFallback = Math.max(1, Number(fallbackDuration || 60));
  const tech = String(techUsername || '').trim();
  if (!tech) return durFallback;
  const rows = (Array.isArray(items) ? items : [])
    .map(normalizeAdminEditItemRow)
    .filter((it) => it.item_name && String(it.assigned_technician_username || '').trim() === tech)
    .map((it) => ({ item_name: it.item_name, qty: it.qty }));
  if (!rows.length) return durFallback;
  const d = computePerTechDurationFromAssignedItems(jobType, rows);
  return d > 0 ? d : durFallback;
}

async function saveJobItemsAdminWithClient(client, job_id, items, options = {}) {
  const hasPromotionId = !!options.hasPromotionId;
  const promotion_id = hasPromotionId ? (options.promotion_id ? Number(options.promotion_id) : null) : null;
  const baseItemsSnapshot = options.baseItemsSnapshot;

  if (baseItemsSnapshot !== undefined) {
    // Snapshot-based stale protection:
    // if another admin already changed job_items, reject this save with 409
    // instead of deleting/reinserting rows on top of newer data.
    const currentSnapshot = await loadJobItemsSnapshotForAdminEdit(client, job_id);
    ensureAdminEditSnapshotMatches(
      normalizeAdminEditItemsSnapshot(baseItemsSnapshot),
      currentSnapshot,
      'มีการแก้ไขรายการบริการจากหน้าจออื่นก่อนหน้านี้ ระบบยังไม่บันทึกทับข้อมูลรอบนี้ กรุณารีโหลดใบงานแล้วตรวจสอบก่อนบันทึกใหม่',
      { code: 'STALE_ITEMS' }
    );
  }

  let promoIdToApply = null;
  if (hasPromotionId) {
    promoIdToApply = promotion_id;
  } else {
    const curPromo = await client.query(
      `SELECT promo_id
       FROM public.job_promotions
       WHERE job_id=$1
       ORDER BY promo_id DESC
       LIMIT 1`,
      [job_id]
    );
    promoIdToApply = curPromo.rows?.[0]?.promo_id ? Number(curPromo.rows[0].promo_id) : null;
  }

  let promo = null;
  if (promoIdToApply) {
    const pr = await client.query(
      `SELECT promo_id, promo_name, promo_type, promo_value
       FROM public.promotions WHERE promo_id=$1 AND is_active=TRUE`,
      [promoIdToApply]
    );
    promo = pr.rows[0] || null;
  }

  let allowedAssignees = new Set();
  const optionAssignees = Array.isArray(options.allowedAssignees)
    ? options.allowedAssignees.map((x) => String(x || "").trim()).filter(Boolean)
    : null;
  if (optionAssignees) {
    allowedAssignees = new Set(optionAssignees);
  } else {
  try {
    const jr = await client.query(`SELECT technician_username FROM public.jobs WHERE job_id=$1 LIMIT 1`, [job_id]);
    const primaryU = String(jr.rows?.[0]?.technician_username || "").trim();
    if (primaryU) allowedAssignees.add(primaryU);
    try {
      const tr = await client.query(`SELECT username FROM public.job_team_members WHERE job_id=$1`, [job_id]);
      for (const r of (tr.rows || [])) {
        const u = String(r.username || "").trim();
        if (u) allowedAssignees.add(u);
      }
    } catch (_) {}
  } catch (_) {
    allowedAssignees = new Set();
  }

  }

  const safeItems = (Array.isArray(items) ? items : [])
    .map((it) => {
      const rawAssignee = String(it.assigned_technician_username || "").trim();
      const assignee = rawAssignee && (allowedAssignees.size === 0 || allowedAssignees.has(rawAssignee)) ? rawAssignee : null;
      const explicitIsService = (typeof it.is_service === 'boolean') ? it.is_service : null;
      const inferredIsService = inferIsServiceLine({ item_name: String(it.item_name || '').trim() });
      const nameForNorm = String(it.item_name || "").trim();
      let qtyN = Math.max(0, Number(it.qty || 0));
      let unitN = Math.max(0, Number(it.unit_price || 0));
      try {
        const mm = nameForNorm.match(/(\d+)\s*เครื่อง/);
        const mc = mm ? Number(mm[1]) : 0;
        if (Number.isFinite(mc) && mc > 1 && (qtyN <= 1) && Number.isFinite(unitN) && unitN >= (mc * 100)) {
          const per = unitN / mc;
          if (Number.isFinite(per) && per > 0) {
            unitN = Number(per.toFixed(2));
            qtyN = mc;
          }
        }
      } catch (_) {}

      return {
        item_id: it.item_id || null,
        item_name: nameForNorm,
        qty: qtyN,
        unit_price: unitN,
        assigned_technician_username: assignee,
        is_service: (explicitIsService != null) ? explicitIsService : inferredIsService,
      };
    })
    .filter((it) => it.item_name);

  const pricing = safeItems.length
    ? calcPricing(safeItems, promo)
    : { subtotal: 0, discount: 0, total: 0 };

  await client.query(`DELETE FROM public.job_items WHERE job_id=$1`, [job_id]);
  await client.query(`DELETE FROM public.job_promotions WHERE job_id=$1`, [job_id]);

  for (const it of safeItems) {
    const line_total = Number(it.qty) * Number(it.unit_price);
    try {
      await client.query(
        `INSERT INTO public.job_items (job_id, item_id, item_name, qty, unit_price, line_total, assigned_technician_username, is_service)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [job_id, it.item_id, it.item_name, it.qty, it.unit_price, line_total, it.assigned_technician_username || null, !!it.is_service]
      );
    } catch (e) {
      if (String(e?.message || "").includes("assigned_technician_username")) {
        await client.query(
          `INSERT INTO public.job_items (job_id, item_id, item_name, qty, unit_price, line_total, is_service)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [job_id, it.item_id, it.item_name, it.qty, it.unit_price, line_total, !!it.is_service]
        );
      } else {
        throw e;
      }
    }
  }

  if (promo && safeItems.length) {
    await client.query(
      `INSERT INTO public.job_promotions (job_id, promo_id, applied_discount)
       VALUES ($1,$2,$3)`,
      [job_id, promo.promo_id, pricing.discount]
    );
  }

  await client.query(`UPDATE public.jobs SET job_price=$1 WHERE job_id=$2`, [pricing.total, job_id]);
  return { pricing, safeItems, promotion: promo };
}

async function saveJobTeamWithClient(client, job_id, members, primaryFromBody, options = {}) {
  const normalized = normalizeAdminEditTeamSnapshot({ members, primary_username: primaryFromBody });
  const safe = normalized.members;
  const explicitPrimary = normalized.primary_username;
  const skipCollisionCheck = !!options.skipCollisionCheck;
  const baseTeamSnapshot = options.baseTeamSnapshot;

  const jobRow = await client.query(
    `SELECT technician_username, technician_team
     FROM public.jobs
     WHERE job_id=$1
     FOR UPDATE`,
    [job_id]
  );
  const curJob = jobRow.rows?.[0] || {};

  const currentTeamSnapshot = await loadJobTeamSnapshotForAdminEdit(client, job_id);
  if (baseTeamSnapshot !== undefined) {
    // Same protection for team edits: do not overwrite a newer team/leader change silently.
    ensureAdminEditSnapshotMatches(
      normalizeAdminEditTeamSnapshot(baseTeamSnapshot),
      currentTeamSnapshot,
      'มีการแก้ไขทีมช่างจากหน้าจออื่นก่อนหน้านี้ ระบบยังไม่บันทึกทับข้อมูลรอบนี้ กรุณารีโหลดใบงานแล้วตรวจสอบก่อนบันทึกใหม่',
      { code: 'STALE_TEAM' }
    );
  }

  const pickPrimary = () => {
    if (explicitPrimary && safe.includes(explicitPrimary)) return explicitPrimary;
    const curPrimary = String(curJob.technician_username || '').trim();
    if (curPrimary && safe.includes(curPrimary)) return curPrimary;
    return safe[0] || null;
  };
  const primary = pickPrimary();

  if (!skipCollisionCheck) {
    const jr = await client.query(
      `SELECT appointment_datetime, COALESCE(duration_min,60) AS duration_min, COALESCE(job_type,'') AS job_type
       FROM public.jobs WHERE job_id=$1 FOR UPDATE`,
      [job_id]
    );
    if (jr.rows.length) {
      const appt = jr.rows[0].appointment_datetime;
      const dur = Number(jr.rows[0].duration_min || 60);
      const jobType = String(jr.rows[0].job_type || '').trim();
      if (appt) {
        for (const u of safe) {
          const perDur = await getPerTechDurationForJobWithClient(client, job_id, u, dur, jobType);
          const conflict = await checkTechCollision(u, appt, perDur, job_id);
          if (conflict) throw createHttpError(409, conflict.error || 'เวลาช่างชนกับงานอื่น', conflict);
        }
      }
    }
  }

  await client.query(`DELETE FROM public.job_team_members WHERE job_id=$1`, [job_id]);
  for (const u of safe) {
    await client.query(
      `INSERT INTO public.job_team_members (job_id, username)
       VALUES ($1,$2) ON CONFLICT (job_id, username) DO NOTHING`,
      [job_id, u]
    );
  }

  try {
    if (primary) {
      await client.query(
        `UPDATE public.job_team_members
         SET is_primary = (username = $2)
         WHERE job_id = $1`,
        [job_id, primary]
      );
    }
  } catch (e) {
    console.warn('[team] set is_primary failed (fail-open)', e.message);
  }

  try {
    if (primary) {
      await client.query(
        `UPDATE public.jobs
         SET technician_username = COALESCE(NULLIF($2,''), technician_username),
             technician_team = COALESCE(NULLIF($2,''), technician_team)
         WHERE job_id=$1`,
        [job_id, primary]
      );
    }
  } catch (e) {
    console.warn('[team] sync jobs.tech fields failed (fail-open)', e.message);
  }

  try {
    if (safe.length) {
      await client.query(
        `DELETE FROM public.job_assignments
         WHERE job_id=$1
           AND technician_username <> ALL($2::text[])`,
        [job_id, safe]
      );
    }

    for (const u of safe) {
      await client.query(
        `
        INSERT INTO public.job_assignments (job_id, technician_username, status)
        VALUES ($1,$2,'in_progress')
        ON CONFLICT (job_id, technician_username) DO UPDATE SET status=EXCLUDED.status
        `,
        [job_id, u]
      );
    }
  } catch (e) {
    console.warn("[team] sync job_assignments failed (fail-open)", e.message);
  }

  return { members: safe, primary };
}

// =======================================
// 🛡️ WARRANTY / RETURN FOR FIX / CLONE (Admin v2)
// - Backward compatible: new endpoints only
// =======================================
const ENABLE_WARRANTY_ENFORCE = (process.env.ENABLE_WARRANTY_ENFORCE || "1") === "1";
// ✅ Admin force finish (safety toggle)
const ENABLE_ADMIN_FORCE_FINISH = (process.env.ENABLE_ADMIN_FORCE_FINISH || "1") === "1";

function computeWarrantyEnd({ job_type, warranty_kind, warranty_months, start }) {
  const jt = String(job_type||'').trim();
  const kind = String(warranty_kind||'').trim();
  const s = start instanceof Date ? start : new Date(start);
  const end = new Date(s.getTime());
  // Rules:
  // - ล้าง: 30 วัน
  // - ซ่อม: 3/6/12 เดือน
  // - ติดตั้ง: 3 ปี
  if (kind === 'clean' || jt.includes('ล้าง')) {
    end.setDate(end.getDate()+30);
    return { kind: 'clean', months: null, end };
  }
  if (kind === 'install' || jt.includes('ติดตั้ง')) {
    end.setFullYear(end.getFullYear()+3);
    return { kind: 'install', months: null, end };
  }
  // repair
  const m = Number(warranty_months);
  if (![3,6,12].includes(m)) {
    throw new Error('งานซ่อมต้องเลือกประกัน 3/6/12 เดือน');
  }
  end.setMonth(end.getMonth()+m);
  return { kind: 'repair', months: m, end };
}

app.post('/admin/jobs/:job_id/extend_warranty_v2', requireAdminSoft, async (req, res) => {
  const job_id = Number(req.params.job_id);
  const days = Number(req.body?.days || 0);
  const actor_username = String(req.body?.actor_username || '').trim() || null;
  if (!job_id) return res.status(400).json({ error: 'job_id ไม่ถูกต้อง' });
  if (!Number.isFinite(days) || days <= 0 || days > 3650) return res.status(400).json({ error: 'จำนวนวันต้องเป็นตัวเลข > 0' });
  try {
    const jr = await pool.query(`SELECT warranty_end_at, warranty_extended_days FROM public.jobs WHERE job_id=$1`, [job_id]);
    if (!jr.rows.length) return res.status(404).json({ error: 'ไม่พบงาน' });
    const current = jr.rows[0].warranty_end_at ? new Date(jr.rows[0].warranty_end_at) : null;
    if (!current) return res.status(400).json({ error: 'งานนี้ยังไม่มีวันหมดประกัน' });
    const newEnd = new Date(current.getTime());
    newEnd.setDate(newEnd.getDate() + days);
    await pool.query(
      `UPDATE public.jobs
       SET warranty_end_at=$1,
           warranty_extended_days = COALESCE(warranty_extended_days,0) + $2
       WHERE job_id=$3`,
      [newEnd.toISOString(), days, job_id]
    );
    await logJobUpdate(job_id, { actor_username, actor_role: 'admin', action: 'extend_warranty', message: `extend +${days} days`, payload: { days, new_end: newEnd.toISOString() } });
    return res.json({ success: true, warranty_end_at: newEnd.toISOString() });
  } catch (e) {
    console.error('extend_warranty_v2 error', e);
    return res.status(500).json({ error: e.message || 'extend warranty ไม่สำเร็จ' });
  }
});

// =======================================
// 🧯 ADMIN: FORCE FINISH (fallback when tech cannot finalize)
// - Backward compatible: new endpoint only
// - No signature required (admin override), logs to updates
// =======================================
app.post('/admin/jobs/:job_id/force_finish_v2', requireAdminSoft, async (req, res) => {
  // Admin override: must be able to close the job in emergency cases even if the
  // technician flow is stuck. Keep this path minimal and resilient.
  if (!ENABLE_ADMIN_FORCE_FINISH) return res.status(403).json({ error: 'Feature disabled' });

  const raw = String(req.params.job_id || '').trim();
  const job_id = (/^\d+$/.test(raw) ? Number(raw) : 0);
  const actor_username = String(req.body?.actor_username || '').trim() || null;
  const reason = String(req.body?.reason || '').trim() || 'admin force finish';

  let realId = job_id;
  if (!realId) {
    try { realId = await resolveJobIdAny(pool, raw); } catch { realId = 0; }
  }
  if (!realId) return res.status(400).json({ error: 'job_id ไม่ถูกต้อง' });
  try { console.log('[admin_force_finish_v2] hit', { raw, job_id: Number(realId), actor_username, reason }); } catch {}

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const jr = await client.query(
      `SELECT job_id, job_type, warranty_end_at, job_status
         FROM public.jobs
        WHERE job_id=$1
        FOR UPDATE`,
      [realId]
    );
    if (!jr.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'ไม่พบงาน' });
    }

    const cur = jr.rows[0] || {};
    const jt = String(cur.job_type || '').trim();

    // Admin override should always be able to finish the job. Do not block on
    // payout-freeze checks here; this route is the recovery path for stuck jobs.
    let wEndIso = null, wKind = null, wMonths = null;
    if (!cur.warranty_end_at) {
      const isClean = jt.includes('ล้าง');
      const isInstall = jt.includes('ติดตั้ง');
      const kind = isClean ? 'clean' : (isInstall ? 'install' : '');
      if (kind) {
        const w = computeWarrantyEnd({ job_type: jt, warranty_kind: kind, warranty_months: null, start: new Date() });
        wEndIso = w.end.toISOString();
        wKind = w.kind;
        wMonths = w.months;
      }
    }

    await client.query(
      `UPDATE public.jobs
          SET job_status='เสร็จแล้ว',
              finished_at=COALESCE(finished_at, NOW()),
              canceled_at=NULL,
              cancel_reason=NULL,
              returned_at=NULL,
              return_reason=NULL,
              returned_by=NULL,
              warranty_kind = COALESCE($2, warranty_kind),
              warranty_months = COALESCE($3, warranty_months),
              warranty_start_at = COALESCE(warranty_start_at, NOW()),
              warranty_end_at = COALESCE($4, warranty_end_at)
        WHERE job_id=$1`,
      [realId, wKind, wMonths, wEndIso]
    );

    // Mark every assignment in this job as done so technician/admin views stay consistent.
    try {
      await client.query(
        `UPDATE public.job_assignments
            SET status='done',
                done_at=COALESCE(done_at, NOW())
          WHERE job_id=$1`,
        [realId]
      );
    } catch (e) {
      try { console.warn('[admin_force_finish_v2] job_assignments sync failed', e.message); } catch {}
    }

    await logJobUpdate(realId, {
      actor_username,
      actor_role: 'admin',
      action: 'admin_force_finish_v2',
      message: `แอดมินปิดงานแทนช่าง: ${reason}`,
      payload: {
        force_closed_from_status: String(cur.job_status || ''),
        warranty_kind: wKind || null,
        warranty_end_at: wEndIso || null,
      }
    }, client);

    await client.query('COMMIT');
    return res.json({ success: true, job_id: Number(realId), status: 'เสร็จแล้ว' });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[admin_force_finish_v2] error', e);
    return res.status(Number(e.statusCode || 500)).json({ error: e.message || 'force finish ไม่สำเร็จ' });
  } finally {
    client.release();
  }
});


// ✅ Admin-only: Delete job permanently (DBจริง) + cleanup related tables
app.delete('/admin/jobs/:job_id', requireAdminSoft, async (req, res) => {
  const job_id = Number(req.params.job_id);
  if (!Number.isFinite(job_id) || job_id <= 0) {
    return res.status(400).json({ ok:false, error:'invalid job_id' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const chk = await client.query(
      `SELECT job_id, booking_code, technician_username, appointment_datetime
         FROM public.jobs WHERE job_id=$1`,
      [job_id]
    );
    if (!chk.rows || !chk.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok:false, error:'job not found' });
    }

    // 🔒 Phase 5: do not allow delete if job affects locked/paid payout
    await _assertJobMutableForPayout(client, job_id, 'admin_delete_job');

    // child tables (fail-safe: some DB might miss tables in older deploys)
    const safeDel = async (sql, params) => {
      try { await client.query(sql, params); } catch(e){ console.warn('[admin_delete_job] ignore', e.message); }
    };

    await safeDel(`DELETE FROM public.job_photos WHERE job_id=$1`, [job_id]);
    await safeDel(`DELETE FROM public.job_updates_v2 WHERE job_id=$1`, [job_id]);
    await safeDel(`DELETE FROM public.job_offers WHERE job_id=$1`, [job_id]);
    await safeDel(`DELETE FROM public.job_team_members WHERE job_id=$1`, [job_id]);
    await safeDel(`DELETE FROM public.job_assignments WHERE job_id=$1`, [job_id]);
    await safeDel(`DELETE FROM public.job_promotions WHERE job_id=$1`, [job_id]);
    await safeDel(`DELETE FROM public.job_items WHERE job_id=$1`, [job_id]);

    await client.query(`DELETE FROM public.jobs WHERE job_id=$1`, [job_id]);

    await client.query('COMMIT');
    return res.json({ ok:true });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch(_){}
    console.error('[admin_delete_job] error', e);
    return res.status(500).json({ ok:false, error:'delete failed' });
  } finally {
    client.release();
  }
});

app.post('/admin/jobs/:job_id/return_for_fix_v2', requireAdminSoft, async (req, res) => {
  const job_id = Number(req.params.job_id);
  const reason = String(req.body?.reason || '').trim();
  const actor_username = String(req.body?.actor_username || '').trim() || null;
  if (!job_id) return res.status(400).json({ error: 'job_id ไม่ถูกต้อง' });
  if (!reason) return res.status(400).json({ error: 'ต้องระบุปัญหา/เหตุผล' });
  const client = await pool.connect();
  try {
    // 🔒 Phase 5: block retroactive income change for locked/paid periods
    await _assertJobMutableForPayout(client, job_id, 'return_for_fix_v2');

    const jr = await client.query(`SELECT job_status, warranty_end_at, booking_code FROM public.jobs WHERE job_id=$1`, [job_id]);
    if (!jr.rows.length) return res.status(404).json({ error: 'ไม่พบงาน' });
    const wEnd = jr.rows[0].warranty_end_at ? new Date(jr.rows[0].warranty_end_at) : null;
    const inWarranty = !!(wEnd && wEnd.getTime() >= Date.now());
    if (!inWarranty) return res.status(400).json({ error: 'หมดประกันแล้ว ไม่สามารถตีกลับเป็นงานแก้ไขได้' });

    await client.query(
      `UPDATE public.jobs
       SET job_status='งานแก้ไข',
           returned_at=NOW(),
           return_reason=$1,
           returned_by=COALESCE($2, returned_by),
           travel_started_at=NULL,
           started_at=NULL,
           checkin_at=NULL,
           checkin_latitude=NULL,
           checkin_longitude=NULL,
           finished_at=NULL,
           canceled_at=NULL,
           cancel_reason=NULL,
           final_signature_path=NULL,
           final_signature_status=NULL,
           final_signature_at=NULL
       WHERE job_id=$3`,
      [reason, actor_username, job_id]
    );

    // งานแก้ไขต้องกลับมาเห็นในแอปช่างอีกครั้ง
    // ถ้ารอบก่อนช่างถูก mark done ไปแล้ว ให้ reset กลับเป็น in_progress
    await client.query(
      `UPDATE public.job_assignments
       SET status='in_progress',
           done_at=NULL
       WHERE job_id=$1`,
      [job_id]
    );
    await logJobUpdate(job_id, { actor_username, actor_role: 'admin', action: 'return_for_fix', message: reason });
    return res.json({ success: true });
  } catch (e) {
    console.error('return_for_fix_v2 error', e);
    return res.status(500).json({ error: e.message || 'ตีกลับงานแก้ไขไม่สำเร็จ' });
  } finally {
    try { client.release(); } catch {}
  }
});

app.post('/admin/jobs/:job_id/clone_v2', requireAdminSoft, async (req, res) => {
  const source_job_id = Number(req.params.job_id);
  const actor_username = String(req.body?.actor_username || '').trim() || null;
  const appointment_datetime = String(req.body?.appointment_datetime || '').trim();
  const technician_username = (req.body?.technician_username == null) ? null : String(req.body.technician_username).trim();
  const override_job_type = String(req.body?.job_type || '').trim() || null;
  const keep_item_ids = Array.isArray(req.body?.keep_item_ids) ? req.body.keep_item_ids.map(n=>Number(n)).filter(n=>Number.isFinite(n)) : null;
  if (!source_job_id) return res.status(400).json({ error: 'job_id ไม่ถูกต้อง' });
  if (!appointment_datetime) return res.status(400).json({ error: 'ต้องเลือกวัน/เวลาใหม่' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const jr = await client.query(`SELECT * FROM public.jobs WHERE job_id=$1 FOR UPDATE`, [source_job_id]);
    if (!jr.rows.length) throw new Error('ไม่พบงานต้นฉบับ');
    const src = jr.rows[0];

    // create new job (copy safe fields only)
    const ins = await client.query(
      `INSERT INTO public.jobs (
         customer_name, customer_phone, job_type, appointment_datetime, job_status,
         duration_min, address_text, maps_url, job_zone,
         technician_username, dispatch_mode, booking_mode,
         job_source
       ) VALUES (
         $1,$2,$3,$4,'รอดำเนินการ',
         $5,$6,$7,$8,
         $9,'forced','scheduled',
         'admin'
       ) RETURNING job_id`,
      [
        src.customer_name, src.customer_phone,
        (override_job_type || src.job_type),
        apptIso,
        src.duration_min,
        src.address_text, src.maps_url, src.job_zone,
        technician_username
      ]
    );
    const new_job_id = Number(ins.rows[0].job_id);

    // booking_code
    const booking_code_new = await generateUniqueBookingCode(client);
    await client.query(`UPDATE public.jobs SET booking_code=$1 WHERE job_id=$2`, [booking_code_new, new_job_id]);

    // copy items (allow drop items for cleaning)
    const items = await client.query(
      `SELECT item_id, item_name, qty, unit_price, line_total
       FROM public.job_items WHERE job_id=$1 ORDER BY job_item_id ASC`,
      [source_job_id]
    );
    for (const it of (items.rows||[])) {
      if (keep_item_ids && !keep_item_ids.includes(Number(it.item_id))) continue;
      await client.query(
        `INSERT INTO public.job_items (job_id, item_id, item_name, qty, unit_price, line_total)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [new_job_id, it.item_id, it.item_name, it.qty, it.unit_price, it.line_total]
      );
    }

    await client.query('COMMIT');
    await logJobUpdate(source_job_id, { actor_username, actor_role: 'admin', action: 'clone_source', message: `cloned to #${new_job_id}`, payload: { new_job_id, booking_code_new } });
    await logJobUpdate(new_job_id, { actor_username, actor_role: 'admin', action: 'clone_new', message: `cloned from #${source_job_id}`, payload: { source_job_id, source_booking_code: src.booking_code } });
    return res.json({ success: true, new_job_id, booking_code: booking_code_new });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('clone_v2 error', e);
    return res.status(500).json({ error: e.message || 'clone ไม่สำเร็จ' });
  } finally {
    client.release();
  }
});


// =======================================
// ✅ Promotions v2 (Admin manage) - backward compatible with legacy DB
// =======================================

function normalizePromoType(raw) {
  const t = String(raw || "").trim().toLowerCase();
  if (!t) return "";
  // english variants
  if (["percent", "percentage", "%", "pct"].includes(t)) return "percent";
  if (["amount", "fixed", "baht", "thb", "฿"].includes(t)) return "amount";
  // thai variants
  if (t.includes("เปอร์") || t.includes("percent") || t === "เปอร์เซ็นต์" || t === "เปอร์เซนต์") return "percent";
  if (t.includes("บาท") || t.includes("จำนวนเงิน")) return "amount";
  return t;
}

const __promoColsCache = { ts: 0, cols: null };
async function getPromotionColumns() {
  const now = Date.now();
  if (__promoColsCache.cols && (now - __promoColsCache.ts) < 5 * 60 * 1000) return __promoColsCache.cols;
  try {
    const r = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema='public' AND table_name='promotions'`
    );
    const cols = new Set((r.rows || []).map(x => String(x.column_name)));
    __promoColsCache.ts = now;
    __promoColsCache.cols = cols;
    return cols;
  } catch (e) {
    // fail-open (assume modern schema)
    const cols = new Set(["promo_id","promo_name","promo_type","promo_value","is_customer_visible","is_active","created_at"]);
    __promoColsCache.ts = now;
    __promoColsCache.cols = cols;
    return cols;
  }
}

function __isBlank(v){
  return v === undefined || v === null || String(v).trim() === '';
}

function promoMatchesPayloadV2(promo, payload){
  if(!promo || !payload) return false;

  if(!__isBlank(promo.job_type) && String(promo.job_type).trim() !== String(payload.job_type||'').trim()) return false;
  if(!__isBlank(promo.ac_type) && String(promo.ac_type).trim() !== String(payload.ac_type||'').trim()) return false;

  const btu = Number(payload.btu || 0);
  const bmin = __isBlank(promo.btu_min) ? null : Number(promo.btu_min);
  const bmax = __isBlank(promo.btu_max) ? null : Number(promo.btu_max);
  if(Number.isFinite(bmin) && bmin !== null && btu && btu < bmin) return false;
  if(Number.isFinite(bmax) && bmax !== null && btu && btu > bmax) return false;

  const mc = Math.max(1, Number(payload.machine_count || 1));
  const mmin = __isBlank(promo.machine_min) ? null : Number(promo.machine_min);
  const mmax = __isBlank(promo.machine_max) ? null : Number(promo.machine_max);
  if(Number.isFinite(mmin) && mmin !== null && mc < mmin) return false;
  if(Number.isFinite(mmax) && mmax !== null && mc > mmax) return false;

  if(String(payload.job_type||'').trim()==='ล้าง'){
    if(!__isBlank(promo.wash_variant) && String(promo.wash_variant).trim() !== String(payload.wash_variant||'').trim()) return false;
  }

  return true;
}

function calcDiscountServer(subtotal, promo){
  if(!promo) return 0;
  const v = Number(promo.promo_value || 0);
  if (promo.promo_type === 'percent') return subtotal * (Math.max(0, v) / 100);
  if (promo.promo_type === 'amount') return Math.max(0, v);
  return 0;
}

async function findBestCustomerPromotion(payloadV2, subtotal, clientOrPool){
  try{
    const cols = await getPromotionColumns();
    const select = [
      'promo_id','promo_name','promo_type','promo_value',
      cols.has('job_type') ? 'job_type' : 'NULL::text AS job_type',
      cols.has('ac_type') ? 'ac_type' : 'NULL::text AS ac_type',
      cols.has('wash_variant') ? 'wash_variant' : 'NULL::text AS wash_variant',
      cols.has('btu_min') ? 'btu_min' : 'NULL::int AS btu_min',
      cols.has('btu_max') ? 'btu_max' : 'NULL::int AS btu_max',
      cols.has('machine_min') ? 'machine_min' : 'NULL::int AS machine_min',
      cols.has('machine_max') ? 'machine_max' : 'NULL::int AS machine_max',
      cols.has('priority') ? 'priority' : '0::int AS priority',
      cols.has('created_at') ? 'created_at' : 'NOW() AS created_at'
    ].join(', ');

    const c = clientOrPool || pool;
    const r = await c.query(
      `SELECT ${select}
       FROM public.promotions
       WHERE is_active=TRUE AND is_customer_visible=TRUE
       ORDER BY ${(cols.has('priority') ? 'priority DESC,' : '')} ${(cols.has('created_at') ? 'created_at DESC,' : '')} promo_id DESC`
    );
    const promos = Array.isArray(r.rows) ? r.rows : [];
    const matches = promos.filter(p => promoMatchesPayloadV2(p, payloadV2));
    if(!matches.length) return { promo: null, discount: 0 };

    const best = matches
      .map(p => ({ p, discount: Math.min(Number(subtotal||0), calcDiscountServer(Number(subtotal||0), p)), prio: Number(p.priority||0), id: Number(p.promo_id||0) }))
      .sort((a,b)=> (b.discount-a.discount) || (b.prio-a.prio) || (b.id-a.id))[0];
    if(!best || !best.p) return { promo: null, discount: 0 };
    return { promo: best.p, discount: Number(best.discount||0) };
  }catch(e){
    // fail-open: never break booking/pricing
    console.warn('[promo] findBestCustomerPromotion failed', e.message);
    return { promo: null, discount: 0 };
  }
}

app.get("/admin/promotions_v2", requireAdminSoft, async (req, res) => {
  try {
    const cols = await getPromotionColumns();

    // build SELECT safely for legacy DBs
    const select = [
      `promo_id`,
      `promo_name`,
      `promo_type`,
      `promo_value`,
      cols.has("job_type") ? `job_type` : `NULL::text AS job_type`,
      cols.has("ac_type") ? `ac_type` : `NULL::text AS ac_type`,
      cols.has("wash_variant") ? `wash_variant` : `NULL::text AS wash_variant`,
      cols.has("btu_min") ? `btu_min` : `NULL::int AS btu_min`,
      cols.has("btu_max") ? `btu_max` : `NULL::int AS btu_max`,
      cols.has("machine_min") ? `machine_min` : `NULL::int AS machine_min`,
      cols.has("machine_max") ? `machine_max` : `NULL::int AS machine_max`,
      cols.has("priority") ? `priority` : `0::int AS priority`,
      cols.has("is_customer_visible") ? `is_customer_visible` : `FALSE AS is_customer_visible`,
      cols.has("is_active") ? `is_active` : `TRUE AS is_active`,
      cols.has("created_at") ? `created_at` : `NOW() AS created_at`,
    ].join(", ");

    const r = await pool.query(
      `SELECT ${select}
       FROM public.promotions
       ORDER BY ${cols.has("created_at") ? "created_at DESC," : ""} promo_id DESC`
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
  const promo_type = normalizePromoType(b.promo_type);
  const promo_value = Number(b.promo_value ?? 0);
  const is_customer_visible = !!b.is_customer_visible;
  const is_active = (b.is_active === undefined) ? true : !!b.is_active;

  const job_type = __isBlank(b.job_type) ? null : String(b.job_type || '').trim();
  const ac_type = __isBlank(b.ac_type) ? null : String(b.ac_type || '').trim();
  const wash_variant = __isBlank(b.wash_variant) ? null : String(b.wash_variant || '').trim();
  const btu_min = (__isBlank(b.btu_min) ? null : Number(b.btu_min));
  const btu_max = (__isBlank(b.btu_max) ? null : Number(b.btu_max));
  const machine_min = (__isBlank(b.machine_min) ? null : Number(b.machine_min));
  const machine_max = (__isBlank(b.machine_max) ? null : Number(b.machine_max));
  const priority = (__isBlank(b.priority) ? 0 : Number(b.priority));

  if (!promo_name) return res.status(400).json({ error: "กรอกชื่อโปรโมชัน" });
  if (!["percent","amount"].includes(promo_type)) return res.status(400).json({ error: "promo_type ต้องเป็น percent หรือ amount" });
  if (!Number.isFinite(promo_value) || promo_value < 0) return res.status(400).json({ error: "promo_value ไม่ถูกต้อง" });

  try {
    const cols = await getPromotionColumns();

    const colNames = ["promo_name","promo_type","promo_value"];
    const vals = [promo_name, promo_type, promo_value];
    if (cols.has("job_type")) { colNames.push("job_type"); vals.push(job_type); }
    if (cols.has("ac_type")) { colNames.push("ac_type"); vals.push(ac_type); }
    if (cols.has("wash_variant")) { colNames.push("wash_variant"); vals.push(wash_variant); }
    if (cols.has("btu_min")) { colNames.push("btu_min"); vals.push(Number.isFinite(btu_min) ? btu_min : null); }
    if (cols.has("btu_max")) { colNames.push("btu_max"); vals.push(Number.isFinite(btu_max) ? btu_max : null); }
    if (cols.has("machine_min")) { colNames.push("machine_min"); vals.push(Number.isFinite(machine_min) ? machine_min : null); }
    if (cols.has("machine_max")) { colNames.push("machine_max"); vals.push(Number.isFinite(machine_max) ? machine_max : null); }
    if (cols.has("priority")) { colNames.push("priority"); vals.push(Number.isFinite(priority) ? priority : 0); }
    if (cols.has("is_customer_visible")) { colNames.push("is_customer_visible"); vals.push(is_customer_visible); }
    if (cols.has("is_active")) { colNames.push("is_active"); vals.push(is_active); }

    const placeholders = colNames.map((_, i) => `$${i+1}`).join(",");
    const r = await pool.query(
      `INSERT INTO public.promotions (${colNames.join(",")})
       VALUES (${placeholders})
       RETURNING promo_id`,
      vals
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

  try {
    const cols = await getPromotionColumns();

    const fields = [];
    const params = [];
    let p = 1;
    const setField = (name, val) => { params.push(val); fields.push(`${name}=$${p++}`); };

    if (b.promo_name !== undefined && cols.has("promo_name")) setField("promo_name", String(b.promo_name || "").trim());
    if (b.promo_type !== undefined && cols.has("promo_type")) {
      const t = normalizePromoType(b.promo_type);
      if (!["percent","amount"].includes(t)) return res.status(400).json({ error: "promo_type ต้องเป็น percent หรือ amount" });
      setField("promo_type", t);
    }
    if (b.promo_value !== undefined && cols.has("promo_value")) {
      const v = Number(b.promo_value ?? 0);
      if (!Number.isFinite(v) || v < 0) return res.status(400).json({ error: "promo_value ไม่ถูกต้อง" });
      setField("promo_value", v);
    }
    if (b.job_type !== undefined && cols.has("job_type")) setField("job_type", __isBlank(b.job_type) ? null : String(b.job_type || '').trim());
    if (b.ac_type !== undefined && cols.has("ac_type")) setField("ac_type", __isBlank(b.ac_type) ? null : String(b.ac_type || '').trim());
    if (b.wash_variant !== undefined && cols.has("wash_variant")) setField("wash_variant", __isBlank(b.wash_variant) ? null : String(b.wash_variant || '').trim());
    if (b.btu_min !== undefined && cols.has("btu_min")) {
      const v = __isBlank(b.btu_min) ? null : Number(b.btu_min);
      setField("btu_min", (v === null || Number.isFinite(v)) ? v : null);
    }
    if (b.btu_max !== undefined && cols.has("btu_max")) {
      const v = __isBlank(b.btu_max) ? null : Number(b.btu_max);
      setField("btu_max", (v === null || Number.isFinite(v)) ? v : null);
    }
    if (b.machine_min !== undefined && cols.has("machine_min")) {
      const v = __isBlank(b.machine_min) ? null : Number(b.machine_min);
      setField("machine_min", (v === null || Number.isFinite(v)) ? v : null);
    }
    if (b.machine_max !== undefined && cols.has("machine_max")) {
      const v = __isBlank(b.machine_max) ? null : Number(b.machine_max);
      setField("machine_max", (v === null || Number.isFinite(v)) ? v : null);
    }
    if (b.priority !== undefined && cols.has("priority")) {
      const v = __isBlank(b.priority) ? 0 : Number(b.priority);
      setField("priority", Number.isFinite(v) ? v : 0);
    }
    if (b.is_customer_visible !== undefined && cols.has("is_customer_visible")) setField("is_customer_visible", !!b.is_customer_visible);
    if (b.is_active !== undefined && cols.has("is_active")) setField("is_active", !!b.is_active);

    if (!fields.length) return res.json({ success: true });

    params.push(promo_id);
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
    const cols = await getPromotionColumns();
    if (cols.has("is_active")) {
      await pool.query(`UPDATE public.promotions SET is_active=FALSE WHERE promo_id=$1`, [promo_id]);
    } else {
      await pool.query(`DELETE FROM public.promotions WHERE promo_id=$1`, [promo_id]);
    }
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
        AND (
              ($1='company' AND COALESCE(p.employment_type,'company') IN ('company','custom','special_only'))
           OR ($1<>'company' AND COALESCE(p.employment_type,'company') = $1)
        )
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
        start_iso: dateToBangkokISO(start) || start.toISOString(),
        end_iso: dateToBangkokISO(end) || end.toISOString(),
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
      WHERE
  (
    -- New (team assignments): show only if this technician is assigned AND not marked done yet
    EXISTS (
      SELECT 1 FROM public.job_assignments ja
      WHERE ja.job_id = public.jobs.job_id
        AND ja.technician_username=$1
        AND COALESCE(ja.status,'in_progress') <> 'done'
    )

    OR

    -- ✅ IMPORTANT: keep completed/canceled jobs visible in technician history
    -- even if this technician already marked assignment as done
    (
      EXISTS (
        SELECT 1 FROM public.job_assignments ja_done
        WHERE ja_done.job_id = public.jobs.job_id
          AND ja_done.technician_username=$1
          AND COALESCE(ja_done.status,'') = 'done'
      )
      AND COALESCE(public.jobs.job_status,'') IN ('เสร็จแล้ว','ยกเลิก')
    )

    OR

    -- Legacy fallback: show jobs from old logic, but hide them if this tech already marked done in job_assignments
    (
      (technician_team=$1
        OR EXISTS (
          SELECT 1 FROM public.job_team_members tm
          WHERE tm.job_id = public.jobs.job_id AND tm.username=$1
        )
        OR (technician_username=$1 AND COALESCE(dispatch_mode,'') <> 'offer')
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.job_assignments ja2
          WHERE ja2.job_id = public.jobs.job_id
            AND ja2.technician_username=$1
            AND COALESCE(ja2.status,'') = 'done'
        )
        OR COALESCE(public.jobs.job_status,'') IN ('เสร็จแล้ว','ยกเลิก')
      )
    )
  )
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
    // backward-compatible: some frontend versions send latitude/longitude
    latitude,
    longitude,
    technician_username,
    primary_username,
    items,
    team_members,
    members,
    base_items_snapshot,
    base_team_snapshot,
  } = req.body || {};
  const hasPromotionId = Object.prototype.hasOwnProperty.call(req.body || {}, 'promotion_id');
  const promotion_id = hasPromotionId ? req.body?.promotion_id : undefined;
  const nextTeamRaw = Array.isArray(team_members) ? team_members : (Array.isArray(members) ? members : null);
  const wantsItemsSave = Array.isArray(items);
  const wantsTeamSave = Array.isArray(nextTeamRaw) || primary_username !== undefined || technician_username !== undefined;
  const desiredPrimaryFromBody = String(primary_username || technician_username || '').trim() || null;

  // Backward-compatible mapping (do not break existing callers)
  const toFiniteOrNull = (v) => {
    if (v === null || v === undefined) return null;
    const s = typeof v === 'string' ? v.trim() : v;
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const gpsLat = gps_latitude !== undefined ? toFiniteOrNull(gps_latitude) : toFiniteOrNull(latitude);
  const gpsLng = gps_longitude !== undefined ? toFiniteOrNull(gps_longitude) : toFiniteOrNull(longitude);

  // ✅ FIX TIMEZONE: ถ้ามีการแก้วันนัด ให้ normalize เป็นเวลาไทยก่อนบันทึก
  const appointment_dt =
    appointment_datetime === undefined || appointment_datetime === null || appointment_datetime === ""
      ? null
      : normalizeAppointmentDatetime(appointment_datetime);

  
try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const curR = await client.query(
        `SELECT appointment_datetime,
                COALESCE(duration_min,60) AS duration_min,
                technician_username,
                job_type
         FROM public.jobs WHERE job_id=$1
         FOR UPDATE`,
        [job_id]
      );
      if (!curR.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "ไม่พบงาน" });
      }

      const cur = curR.rows[0];
      const apptToUse = appointment_dt || cur.appointment_datetime;
      const durToUse = Number(cur.duration_min || 60);
      const jobTypeToUse = (job_type ?? cur.job_type);
      const currentTeamSnapshot = await loadJobTeamSnapshotForAdminEdit(client, job_id);
      const nextTeamSnapshot = wantsTeamSave
        ? normalizeAdminEditTeamSnapshot({ members: nextTeamRaw || currentTeamSnapshot.members, primary_username: desiredPrimaryFromBody })
        : currentTeamSnapshot;
      const techSet = new Set(nextTeamSnapshot.members);

      if (apptToUse) {
        for (const u of [...techSet].filter(Boolean)) {
          const perDur = wantsItemsSave
            ? getPerTechDurationFromRequestedItems(jobTypeToUse, items, u, durToUse)
            : await getPerTechDurationForJobWithClient(client, job_id, u, durToUse, jobTypeToUse);
          const conflict = await checkTechCollision(u, apptToUse, perDur, job_id);
          if (conflict) {
            await client.query("ROLLBACK");
            return http409Conflict(res, conflict);
          }
        }
      }

      // When this request also saves team_members/primary_username, do not update
      // jobs.technician_username in the header step first. saveJobTeamWithClient()
      // performs the stale-team check against base_team_snapshot and then syncs
      // jobs.technician_username + technician_team in the same transaction.
      // Updating the primary here first makes the later stale check see our own
      // change as an external team edit, blocking legitimate technician swaps.
      const headerPrimaryToSave = wantsTeamSave ? null : desiredPrimaryFromBody;

      await client.query(
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
          gps_longitude = COALESCE($10, gps_longitude),
          technician_username = COALESCE(NULLIF($11, ''), technician_username),
          technician_team = COALESCE(NULLIF($11, ''), technician_team)
      WHERE job_id=$12
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
        gpsLat,
        gpsLng,
        headerPrimaryToSave,
        job_id,
      ]
    );

      let pricing = null;
      let savedTeam = null;

      // Single transaction orchestration:
      // header + items + team either commit together or roll back together.
      // Keep legacy routes intact, but avoid partial-save drift for the Admin v2 edit screen.
      if (wantsItemsSave) {
        await _assertJobMutableForPayout(client, job_id, 'admin-edit');
        const itemResult = await saveJobItemsAdminWithClient(client, job_id, items, {
          hasPromotionId,
          promotion_id,
          baseItemsSnapshot: base_items_snapshot,
          allowedAssignees: nextTeamSnapshot.members,
        });
        pricing = itemResult.pricing;
      }

      if (wantsTeamSave) {
        savedTeam = await saveJobTeamWithClient(client, job_id, nextTeamSnapshot.members, nextTeamSnapshot.primary_username, {
          baseTeamSnapshot: base_team_snapshot,
          skipCollisionCheck: true,
        });
      }

      await client.query("COMMIT");
      return res.json({
        success: true,
        steps: {
          header: true,
          items: !!wantsItemsSave,
          team: !!wantsTeamSave,
        },
        pricing,
        team: savedTeam,
      });
    } catch (innerErr) {
      try { await client.query("ROLLBACK"); } catch (_) {}
      throw innerErr;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error(e);
    if (e?.status === 409) {
      return res.status(409).json({ error: e.message, ...(e.extra || {}) });
    }
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
app.delete("/jobs/:job_id/admin-delete", requireAdminSoft, async (req, res) => {
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

    // server log (at least)
    try {
      const who = (req.headers["x-admin-username"] || req.headers["x-user"] || req.headers["x-forwarded-for"] || req.ip || "").toString();
      console.log("[admin_delete_job]", { job_id, who, ok: true });
    } catch (e) {}

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
  const allow = ["รอดำเนินการ", "กำลังทำ", "เสร็จแล้ว", "ยกเลิก", "ตีกลับ", "งานแก้ไข"];
  if (!allow.includes(status)) return res.status(400).json({ error: "status ไม่ถูกต้อง" });

  try {
    const realId = await resolveJobIdAny(pool, job_id);
    if (!realId) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });

    // ✅ เมื่อเริ่มงานครั้งแรก ให้บันทึก started_at
    if (status === 'กำลังทำ') {
      await pool.query(
        `UPDATE public.jobs
         SET job_status=$1,
             started_at = COALESCE(started_at, NOW())
         WHERE job_id=$2`,
        [status, realId]
      );
    } else {
      await pool.query(`UPDATE public.jobs SET job_status=$1 WHERE job_id=$2`, [status, realId]);
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
    const realId = await resolveJobIdAny(pool, job_id);
    if (!realId) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });

    const itemsR = await pool.query(
      `SELECT item_name, qty, unit_price, line_total FROM public.job_items WHERE job_id=$1 ORDER BY job_item_id ASC`,
      [realId]
    );

    const promoR = await pool.query(
      `
      SELECT p.promo_id, p.promo_name, p.promo_type, p.promo_value, jp.applied_discount
      FROM public.job_promotions jp
      JOIN public.promotions p ON p.promo_id = jp.promo_id
      WHERE jp.job_id=$1
      LIMIT 1
      `,
      [realId]
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
  const job_id = await resolveJobIdAny(pool, req.params.job_id);
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

app.get("/admin/pricing-requests", requireAdminSession, async (req, res) => {
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

app.post("/admin/pricing-requests/:id/approve", requireAdminSession, async (req, res) => {
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

    // 🔒 Phase 5: block retroactive income change for locked/paid periods
    await _assertJobMutableForPayout(client, reqRow.job_id, 'pricing-request-approve');

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

app.post("/admin/pricing-requests/:id/decline", requireAdminSession, async (req, res) => {
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
  const hasPromotionId = Object.prototype.hasOwnProperty.call(req.body || {}, 'promotion_id');
  const promotion_id = hasPromotionId && req.body?.promotion_id ? Number(req.body.promotion_id) : null;
  const base_items_snapshot = req.body?.base_items_snapshot;

  if (!job_id) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 🔒 Phase 5: block retroactive income change for locked/paid periods
    await _assertJobMutableForPayout(client, job_id, 'items-admin');
    const result = await saveJobItemsAdminWithClient(client, job_id, items, {
      hasPromotionId,
      promotion_id,
      baseItemsSnapshot: base_items_snapshot,
    });

    await client.query("COMMIT");
    res.json({ success: true, pricing: result.pricing });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    if (e?.status === 409) {
      return res.status(409).json({ error: e.message, ...(e.extra || {}) });
    }
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
  // optional: allow frontend to explicitly pick primary/leader
  const primaryFromBody = (req.body?.primary_username || req.body?.primary || "").toString().trim();
  const base_team_snapshot = req.body?.base_team_snapshot;
  if (!job_id) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await saveJobTeamWithClient(client, job_id, members, primaryFromBody, {
      baseTeamSnapshot: base_team_snapshot,
    });

    await client.query("COMMIT");
    res.json({ success: true, members: result.members, primary_username: result.primary || null });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    if (e?.status === 409) {
      return res.status(409).json({ error: e.message, ...(e.extra || {}) });
    }
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

function translateJobTypeEN(t){
  const s = (t||'').toString().trim();
  // Be tolerant: sometimes stored with extra words/spaces
  if (/ล้าง/.test(s)) return 'Cleaning';
  if (/ซ่อม/.test(s)) return 'Repair';
  if (/ติดตั้ง/.test(s)) return 'Installation';
  return s || '-';
}



function translateServiceItemNameEN(name){
  let t = (name||'').toString();
  // Normalize separators
  t = t.replace(/\s*•\s*/g, ' • ');

  // Common Thai->EN mappings found in CWF item labels
  const map = [
    [/ล้างแอร์/gi, 'AC Cleaning'],
    [/ซ่อมแอร์/gi, 'AC Repair'],
    [/ติดตั้งแอร์/gi, 'AC Installation'],

    [/ผนัง/g, 'Wall-mounted'],
    [/สี่ทิศทาง/g, '4-way Cassette'],
    [/เปลือยใต้ฝ้า/g, 'Concealed Ceiling'],
    [/แขวน/g, 'Ceiling Suspended'],

    [/ล้างธรรมดา/g, 'Standard Wash'],
    [/ล้างพรีเมียม/g, 'Premium Wash'],
    [/ล้างแขวนคอยน์/g, 'Ceiling Cassette Wash'],
    [/ล้างแบบตัดล้างใหญ่/g, 'Deep Clean (Major)'],
    [/ตัดล้างใหญ่/g, 'Deep Clean (Major)'],
    [/ล้างแบบตัดล้าง/g, 'Deep Clean (Disassemble)'],
    [/ตัดล้าง/g, 'Deep Clean (Disassemble)'],

    [/ช่าง\s*/g, 'Tech '],
  ];
  for (const [re, rep] of map) t = t.replace(re, rep);

  // Units / counters
  // "3 เครื่อง" -> "3 units"
  t = t.replace(/(\d+)\s*เครื่อง/gi, (m,n)=>`${n} units`);
  t = t.replace(/เครื่อง/gi, 'unit');

  // If label already contains an extra "xN" or Thai remnants, clean them safely
  t = t.replace(/\s+×\s*/g, ' x');

  // If still contains Thai letters, strip them but keep numbers/symbols/latin.
  if (/[฀-๿]/.test(t)) {
    t = t.replace(/[฀-๿]+/g, ' ').replace(/\s{2,}/g,' ').trim();
  }

  return t.trim();
}


app.get("/jobs/:job_id/summary", async (req, res) => {
  const { job_id } = req.params;
  const lang = String(req.query.lang || 'th').toLowerCase();

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
    const ddTH = dt.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" });
    const ttTH = dt.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
    const ddEN = dt.toLocaleDateString("en-GB", { timeZone: "Asia/Bangkok" });
    const ttEN = dt.toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });

    const lines = itemsR.rows.map((it) => {
      const qty = Number(it.qty);
      const up = Number(it.unit_price);
      const lt = Number(it.line_total);
      return `- ${it.item_name} x${qty} @ ${up} บาท = ${lt} บาท`;
    });

    let text = '';
    if(lang === 'en'){
      const lineEN = itemsR.rows.map((it) => {
        const qty = Number(it.qty);
        const up = Number(it.unit_price);
        const lt = Number(it.line_total);
        return `- ${translateServiceItemNameEN(it.item_name)} x${qty} @ ${up} THB = ${lt} THB`;
      });
      text =
        `Service Appointment Confirmation\n\n` +
        `Coldwindflow Air Services\n` +
        `Our admin team would like to confirm your appointment details:\n\n` +
        `🔎 Job No.: ${job.booking_code || "#" + job.job_id}\n` +
        `🔗 Track: ${origin}/track.html?q=${encodeURIComponent(job.booking_code || String(job.job_id))}\n` +
        `📍 Customer: ${job.customer_name || "-"}\n` +
        `📞 Phone: ${job.customer_phone || "-"}\n` +
        `📅 Appointment: ${ddEN} ${ttEN}\n` +
        `🧾 Job Type: ${translateJobTypeEN(job.job_type)}\n` +
        `🏠 Address: ${job.address_text || "-"}\n\n` +
        `🧾 Items:\n${lineEN.length ? lineEN.join("\n") : "- (no items)"}\n\n` +
        `💰 Net Total: ${Number(job.job_price || 0).toFixed(2)} THB\n\n` +
        `Thank you.\nLINE OA: @cwfair\nCall: 098-877-7321`;
    } else {
      text =
        `ยืนยันนัดหมายบริการแอร์\n\n` +
        `Coldwindflow Air Services\n` +
        `แอดมินฝ่ายบริการลูกค้า ขอเรียนยืนยันนัดหมายดังนี้ค่ะ\n\n` +
        `🔎 เลขงาน: ${job.booking_code || "#" + job.job_id}\n🔗 ติดตามงาน: ${origin}/track.html?q=${encodeURIComponent(job.booking_code || String(job.job_id))}\n` +
        `📍 ชื่อลูกค้า: ${job.customer_name || "-"}\n` +
        `📞 เบอร์: ${job.customer_phone || "-"}\n` +
        `📅 วันที่นัด: ${ddTH} เวลา ${ttTH} น.\n` +
        `🧾 ประเภทงาน: ${job.job_type || "-"}\n` +
        `🏠 ที่อยู่: ${job.address_text || "-"}\n\n` +
        `🧾 รายการ:\n${lines.length ? lines.join("\n") : "- (ไม่มีรายการ)"}\n\n` +
        `💰 ยอดชำระสุทธิ: ${Number(job.job_price || 0).toFixed(2)} บาท\n\n` +
        `ขอบคุณค่ะ\nLINE OA: @cwfair\nโทร: 098-877-7321`;
    }

    res.json({ text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "สร้างข้อความสรุปไม่สำเร็จ" });
  }
});

// =======================================
// ✅ OFFERS
// =======================================


// =======================================
// 🔔 Technician Web Push helpers (best-effort)
// =======================================
function _pushReady() {
  return Boolean(WEB_PUSH_READY && webpush);
}

function _safePushUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '/tech.html';
  // Keep notifications on this origin only.
  if (raw.startsWith('/')) return raw;
  try {
    const u = new URL(raw);
    return u.origin === `https://${u.host}` && u.pathname ? `${u.pathname}${u.search || ''}` : '/tech.html';
  } catch {
    return '/tech.html';
  }
}

function _shortJobText(job) {
  const jt = String(job?.job_type || 'งานใหม่').trim();
  const zone = String(job?.job_zone || '').trim();
  const when = job?.appointment_datetime ? (() => {
    try { return new Date(job.appointment_datetime).toLocaleString('th-TH', { timeZone:'Asia/Bangkok', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }); } catch { return ''; }
  })() : '';
  return [jt, when, zone].filter(Boolean).join(' • ');
}

async function _sendPushToTechnician(username, payload = {}) {
  const tech = String(username || '').trim();
  if (!tech || !_pushReady()) return { attempted: 0, sent: 0, disabled: true };

  const q = await pool.query(
    `SELECT subscription_id, endpoint, p256dh, auth
       FROM public.technician_push_subscriptions
      WHERE technician_username=$1 AND is_active=TRUE
      ORDER BY updated_at DESC
      LIMIT 10`,
    [tech]
  );
  const rows = q.rows || [];
  let sent = 0;
  for (const r of rows) {
    const sub = {
      endpoint: r.endpoint,
      keys: { p256dh: r.p256dh, auth: r.auth }
    };
    try {
      await webpush.sendNotification(sub, JSON.stringify({
        title: payload.title || 'CWF มีงานใหม่',
        body: payload.body || 'มีงานใหม่เข้ามา กรุณาเปิดแอพเพื่อตรวจสอบ',
        url: _safePushUrl(payload.url || '/tech.html'),
        tag: payload.tag || `cwf-job-${payload.job_id || Date.now()}`,
        job_id: payload.job_id || null,
        kind: payload.kind || 'job'
      }));
      sent += 1;
    } catch (e) {
      const code = Number(e?.statusCode || e?.status || 0);
      console.warn('[webpush] send failed', { tech, subscription_id: r.subscription_id, code, message: e?.message });
      if (code === 404 || code === 410) {
        try {
          await pool.query(`UPDATE public.technician_push_subscriptions SET is_active=FALSE, updated_at=NOW() WHERE subscription_id=$1`, [r.subscription_id]);
        } catch (_) {}
      }
    }
  }
  return { attempted: rows.length, sent };
}

async function _sendPushToTechnicians(usernames = [], payload = {}) {
  const targets = Array.from(new Set((Array.isArray(usernames) ? usernames : [usernames]).map(x => String(x || '').trim()).filter(Boolean)));
  let attempted = 0;
  let sent = 0;
  for (const u of targets) {
    try {
      const r = await _sendPushToTechnician(u, payload);
      attempted += Number(r.attempted || 0);
      sent += Number(r.sent || 0);
    } catch (e) {
      console.warn('[webpush] target failed', { tech: u, message: e?.message });
    }
  }
  return { targets: targets.length, attempted, sent };
}

async function _notifyDirectJobAssigned({ usernames, job_id, booking_code, job_type, appointment_datetime, job_zone }) {
  try {
    const title = 'CWF มีงานใหม่';
    const body = _shortJobText({ job_type, appointment_datetime, job_zone }) || `งานใหม่ ${booking_code || ''}`;
    return await _sendPushToTechnicians(usernames, {
      title,
      body,
      job_id,
      kind: 'direct_job',
      tag: `cwf-direct-${job_id}`,
      url: `/tech.html?tab=active&job_id=${encodeURIComponent(String(job_id || ''))}`
    });
  } catch (e) { console.warn('[webpush] direct job notify failed', e?.message); return null; }
}

async function _notifyUrgentOffer({ usernames, job_id, booking_code, job_type, appointment_datetime, job_zone }) {
  try {
    const title = 'CWF มีงานให้รับ';
    const body = _shortJobText({ job_type, appointment_datetime, job_zone }) || `มีงานให้รับ ${booking_code || ''}`;
    return await _sendPushToTechnicians(usernames, {
      title,
      body,
      job_id,
      kind: 'urgent_offer',
      tag: `cwf-offer-${job_id}`,
      url: `/tech.html?tab=new&job_id=${encodeURIComponent(String(job_id || ''))}`
    });
  } catch (e) { console.warn('[webpush] urgent offer notify failed', e?.message); return null; }
}

// Technician push subscription APIs
app.get('/tech/push_public_key', requireTechnicianSession, async (req, res) => {
  return res.json({ success: true, enabled: _pushReady(), publicKey: WEB_PUSH_PUBLIC_KEY || '' });
});

app.post('/tech/push_subscribe', requireTechnicianSession, async (req, res) => {
  try {
    if (!_pushReady()) return res.status(503).json({ error: 'PUSH_NOT_CONFIGURED' });
    const tech = _authUsername(req);
    const sub = req.body?.subscription || req.body || {};
    const endpoint = String(sub.endpoint || '').trim();
    const p256dh = String(sub.keys?.p256dh || req.body?.p256dh || '').trim();
    const auth = String(sub.keys?.auth || req.body?.auth || '').trim();
    if (!tech || !endpoint || !p256dh || !auth) return res.status(400).json({ error: 'ข้อมูลแจ้งเตือนไม่ครบ' });
    await pool.query(
      `INSERT INTO public.technician_push_subscriptions
        (technician_username, endpoint, p256dh, auth, user_agent, device_label, is_active, updated_at, last_seen_at)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE,NOW(),NOW())
       ON CONFLICT (endpoint) DO UPDATE SET
         technician_username=EXCLUDED.technician_username,
         p256dh=EXCLUDED.p256dh,
         auth=EXCLUDED.auth,
         user_agent=EXCLUDED.user_agent,
         device_label=EXCLUDED.device_label,
         is_active=TRUE,
         updated_at=NOW(),
         last_seen_at=NOW()`,
      [tech, endpoint, p256dh, auth, String(req.headers['user-agent'] || '').slice(0, 500), String(req.body?.device_label || '').slice(0, 120)]
    );
    return res.json({ success: true });
  } catch (e) {
    console.error('POST /tech/push_subscribe', e);
    return res.status(500).json({ error: 'เปิดแจ้งเตือนไม่สำเร็จ' });
  }
});

app.post('/tech/push_unsubscribe', requireTechnicianSession, async (req, res) => {
  try {
    const tech = _authUsername(req);
    const endpoint = String(req.body?.endpoint || req.body?.subscription?.endpoint || '').trim();
    if (endpoint) {
      await pool.query(`UPDATE public.technician_push_subscriptions SET is_active=FALSE, updated_at=NOW() WHERE technician_username=$1 AND endpoint=$2`, [tech, endpoint]);
    }
    return res.json({ success: true });
  } catch (e) {
    console.error('POST /tech/push_unsubscribe', e);
    return res.status(500).json({ error: 'ปิดแจ้งเตือนไม่สำเร็จ' });
  }
});

app.post('/tech/push_test', requireTechnicianSession, async (req, res) => {
  try {
    const tech = _authUsername(req);
    const result = await _sendPushToTechnician(tech, {
      title: 'CWF ทดสอบแจ้งเตือน',
      body: 'ระบบแจ้งเตือนงานเข้าพร้อมใช้งานแล้ว',
      kind: 'test',
      tag: `cwf-test-${tech}`,
      url: '/tech.html'
    });
    return res.json({ success: true, result });
  } catch (e) {
    console.error('POST /tech/push_test', e);
    return res.status(500).json({ error: 'ส่งทดสอบไม่สำเร็จ' });
  }
});

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

app.post("/offers/:offer_id/accept", requireTechnicianSession, async (req, res) => {
  const { offer_id } = req.params;
  const username = _authUsername(req);

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
    if (!username || username !== offer.technician_username) throw new Error("username ไม่ตรงกับ offer");

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

app.post("/offers/:offer_id/decline", requireTechnicianSession, async (req, res) => {
  const { offer_id } = req.params;
  const username = _authUsername(req);

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
    if (!username || username !== offer.technician_username) throw new Error("username ไม่ตรงกับ offer");

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
app.post("/jobs/:job_id/travel-start", requireTechnicianSession, async (req, res) => {
  const { job_id } = req.params;
  try {
    const realId = await resolveJobIdAny(pool, job_id);
    if (!realId) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });
    const technician_username = await requireTechOwnsResolvedJob(req, res, realId, pool);
    if (!technician_username) return;

    await pool.query(
      `UPDATE public.jobs
       SET travel_started_at = COALESCE(travel_started_at, NOW())
       WHERE job_id=$1`,
      [realId]
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
app.post("/jobs/:job_id/checkin", requireTechnicianSession, async (req, res) => {
  const { job_id } = req.params;
  const { lat, lng } = req.body || {};

  if (lat == null || lng == null) return res.status(400).json({ error: "พิกัด GPS ไม่ครบ" });

  try {
    const realId = await resolveJobIdAny(pool, job_id);
    if (!realId) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });
    const technician_username = await requireTechOwnsResolvedJob(req, res, realId, pool);
    if (!technician_username) return;

    const r = await pool.query(
      `SELECT gps_latitude, gps_longitude, maps_url FROM public.jobs WHERE job_id=$1`,
      [realId]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "ไม่พบงาน" });

    const mapsUrl = String(r.rows[0].maps_url || "").trim();

    // ⚠️ IMPORTANT:
    // Number(null) === 0 which would incorrectly force check-in against (0,0).
    // Use a safe converter so NULL/empty stays NaN.
    const toFiniteOrNaN = (v) => {
      if (v === null || v === undefined) return NaN;
      const s = typeof v === 'string' ? v.trim() : v;
      if (s === '') return NaN;
      const n = Number(s);
      return Number.isFinite(n) ? n : NaN;
    };

    let siteLat = toFiniteOrNaN(r.rows[0].gps_latitude);
    let siteLng = toFiniteOrNaN(r.rows[0].gps_longitude);

    // Treat (0,0) and out-of-bounds as invalid sentinel.
    // Some older records accidentally stored 0/0 when parsing failed.
    const isValidSiteLatLng = (la, lo) => {
      if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
      if (la < -90 || la > 90 || lo < -180 || lo > 180) return false;
      // (0,0) is almost always a bad value for Thailand jobs
      if (Math.abs(la) < 1e-9 && Math.abs(lo) < 1e-9) return false;
      return true;
    };

    // For Google Maps URLs, not all extracted coordinates are equally trustworthy.
    // - "3d4d" and "q" usually represent the pinned place / explicit lat,lng (high confidence)
    // - "@" and "center" are viewport coordinates (often NOT the place pin) -> must NOT enforce 500m
    const isEnforcementQualityVia = (via) => {
      const v = String(via || "").toLowerCase();
      return v === "3d4d" || v === "q" || v === "json";
    };

    // ✅ ISSUE-1 (ตาม requirement ล่าสุด):
    // - ถ้า "maps_url" แปลงพิกัดได้จริง -> บังคับ 500m (ใช้พิกัดที่แปลงจาก URL เป็นหลัก)
    // - ถ้า "maps_url" แปลงพิกัดไม่ได้ -> ไม่บังคับ 500m และเช็คอินได้ปกติ
    // - ถ้าไม่มี maps_url เลย -> fallback ใช้ gps_latitude/gps_longitude ที่เก็บไว้ (backward-compatible)
    let hasSiteLatLng = false;

    // Try to derive from maps_url first (authoritative for enforcement)
    let derivedFromUrl = null;
    if (mapsUrl) {
      derivedFromUrl = parseLatLngFromText(mapsUrl);
      if (!derivedFromUrl && /maps\.app\.goo\.gl|goo\.gl/i.test(mapsUrl)) {
        try {
          const rr = await resolveMapsUrlToLatLng(mapsUrl);
          if (rr && Number.isFinite(rr.lat) && Number.isFinite(rr.lng)) {
            // Preserve rr.via so we can decide whether to enforce based on quality.
            derivedFromUrl = { lat: rr.lat, lng: rr.lng, via: rr.via || "resolver" };
          }
        } catch (_) {
          // fail-open
        }
      }

      if (
        derivedFromUrl &&
        isValidSiteLatLng(Number(derivedFromUrl.lat), Number(derivedFromUrl.lng)) &&
        isEnforcementQualityVia(derivedFromUrl.via)
      ) {
        // ✅ Enforce only when we have high-confidence site coordinates.
        siteLat = Number(derivedFromUrl.lat);
        siteLng = Number(derivedFromUrl.lng);
        hasSiteLatLng = true;

        // cache (best-effort) only for high-confidence coordinates
        try {
          await pool.query(
            `UPDATE public.jobs SET gps_latitude=$1, gps_longitude=$2 WHERE job_id=$3 AND (gps_latitude IS NULL OR gps_longitude IS NULL OR (gps_latitude=0 AND gps_longitude=0))`,
            [siteLat, siteLng, realId]
          );
        } catch (_) {}
      } else {
        // maps_url exists but:
        // - cannot be parsed, OR
        // - only viewport/center coords (low confidence)
        // -> allow check-in (no 500m enforcement)
        hasSiteLatLng = false;
      }
    } else {
      // No maps_url -> fallback to stored coords for legacy jobs
      hasSiteLatLng = isValidSiteLatLng(siteLat, siteLng);
    }

    let distance = null;
    if (hasSiteLatLng) {
      const toRad = (v) => (v * Math.PI) / 180;
      const R = 6371000;
      const dLat = toRad(Number(lat) - siteLat);
      const dLng = toRad(Number(lng) - siteLng);

      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(siteLat)) * Math.cos(toRad(Number(lat))) * Math.sin(dLng / 2) ** 2;

      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      distance = R * c;

      if (distance > 500) {
        // ✅ Precision recovery: if stored coords are wrong but maps_url is correct,
        // re-derive coords from maps_url and re-check once (fail-open except for true-outside)
        if (mapsUrl) {
          try {
            let derived = parseLatLngFromText(mapsUrl);
            if (!derived && /maps\.app\.goo\.gl|goo\.gl/i.test(mapsUrl)) {
              const rr = await resolveMapsUrlToLatLng(mapsUrl);
              if (rr && Number.isFinite(rr.lat) && Number.isFinite(rr.lng)) derived = { lat: rr.lat, lng: rr.lng, via: rr.via || "resolver" };
            }
            // Re-check only when derived coords are high-confidence; viewport coords must not block check-in.
            if (derived && isValidSiteLatLng(Number(derived.lat), Number(derived.lng)) && isEnforcementQualityVia(derived.via)) {
              const dLat2 = toRad(Number(lat) - Number(derived.lat));
              const dLng2 = toRad(Number(lng) - Number(derived.lng));
              const a2 =
                Math.sin(dLat2 / 2) ** 2 +
                Math.cos(toRad(Number(derived.lat))) * Math.cos(toRad(Number(lat))) * Math.sin(dLng2 / 2) ** 2;
              const c2 = 2 * Math.atan2(Math.sqrt(a2), Math.sqrt(1 - a2));
              const dist2 = R * c2;

              if (dist2 <= 500) {
                // cache corrected coords (best-effort)
                try {
                  await pool.query(`UPDATE public.jobs SET gps_latitude=$1, gps_longitude=$2 WHERE job_id=$3`, [Number(derived.lat), Number(derived.lng), realId]);
                } catch (_) {}
                distance = dist2;
              }
            }
          } catch (_) {
            // ignore and keep original distance
          }
        }

        if (distance > 500) {
          // ✅ Requirement: if we cannot confidently obtain a valid site coordinate (URL not parseable)
          // then do not block check-in.
          // Here, if the only coordinates were invalid/sentinel and we couldn't derive a valid one,
          // `hasSiteLatLng` would be false and we wouldn't be inside this block.
          return res.status(400).json({ error: "อยู่นอกพื้นที่หน้างาน", distance: Math.round(distance) });
        }
      }
    }

    await pool.query(
      `UPDATE public.jobs SET checkin_latitude=$1, checkin_longitude=$2, checkin_at=NOW() WHERE job_id=$3`,
      [lat, lng, realId]
    );

    res.json({ success: true, distance: distance == null ? null : Math.round(distance), site_required: hasSiteLatLng });
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
  const { phase, mime_type, original_name, file_size, uploaded_by } = req.body || {};

  const allowedPhases = [
    "before",
    "after",
    "pressure",
    "current",
    "temp",
    "defect",
    "payment_slip",
    "revisit_before",
    "revisit_after",
    "revisit_defect",
  ];
  if (!allowedPhases.includes(String(phase))) {
    return res.status(400).json({ error: `phase ไม่ถูกต้อง (ต้องเป็น ${allowedPhases.join(", ")})` });
  }
  if (!mime_type) return res.status(400).json({ error: "mime_type ห้ามว่าง" });

  try {
    const realId = await resolveJobIdAny(pool, job_id);
    if (!realId) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });

    // uploaded_by: ต้องเป็นช่างที่อยู่ในทีมของงาน (หรือช่างหลัก) เพื่อผูกหลักฐานให้ถูกคน
    if (uploaded_by) {
      try {
        const u = String(uploaded_by || '').trim();
        if (u) {
          const okR = await pool.query(
            `
            SELECT 1
            FROM public.jobs j
            LEFT JOIN public.job_team_members tm ON tm.job_id=j.job_id AND tm.username=$2
            LEFT JOIN public.job_assignments ja ON ja.job_id=j.job_id AND ja.technician_username=$2
            WHERE j.job_id=$1 AND (j.technician_username=$2 OR j.technician_team=$2 OR tm.username IS NOT NULL OR ja.technician_username IS NOT NULL)
            LIMIT 1
            `,
            [realId, u]
          );
          if (!okR.rows.length) {
            return res.status(400).json({ error: "uploaded_by ไม่ถูกต้อง (ไม่ได้อยู่ในทีมของงาน)" });
          }
        }
      } catch (e) {
        // fail-open: ถ้าเช็คไม่สำเร็จ ไม่บล็อคการอัปโหลด แต่จะเก็บ null
        console.warn('[photos/meta] uploaded_by validate failed', e.message);
      }
    }
    const r = await pool.query(
      `
      INSERT INTO public.job_photos (job_id, phase, mime_type, original_name, file_size, photo_type, uploaded_by)
      VALUES ($1,$2,$3,$4,$5,NULL,$6)
      RETURNING photo_id
      `,
      [realId, phase, mime_type, original_name || null, file_size || null, uploaded_by || null]
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
    const realId = await resolveJobIdAny(pool, job_id);
    if (!realId) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });

    const meta = await pool.query(
      `SELECT photo_id, phase, mime_type FROM public.job_photos WHERE photo_id=$1 AND job_id=$2`,
      [photo_id, realId]
    );
    if (meta.rows.length === 0) return res.status(404).json({ error: "ไม่พบ metadata รูป" });

    const phase = String(meta.rows[0].phase || 'job');

    let ext = "jpg";
    const mt = String(req.file.mimetype || "").toLowerCase();
    if (mt.includes("png")) ext = "png";
    if (mt.includes("webp")) ext = "webp";
    if (mt.includes("jpeg") || mt.includes("jpg")) ext = "jpg";

    // ✅ Prefer Cloudinary if configured (no local disk dependency)
    if (CLOUDINARY_ENABLED) {
      const publicId = `${realId}_${photo_id}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
      const folder = `cwf/jobs/${realId}/${phase}`;
      // Cloudinary transformation string
      // - limit width to 1600
      // - auto quality & format
      const transformation = 'c_limit,w_1600/q_auto/f_auto';

      const up = await cloudinaryUploadBuffer({
        buffer: req.file.buffer,
        mimetype: req.file.mimetype || meta.rows[0].mime_type || 'image/jpeg',
        folder,
        publicId,
        transformation,
      });

      await pool.query(
        `UPDATE public.job_photos
         SET uploaded_at=NOW(), storage_path=$1, public_url=$2, cloud_public_id=$3
         WHERE photo_id=$4 AND job_id=$5`,
        [up.public_id || publicId, up.secure_url, up.public_id || publicId, photo_id, realId]
      );

      return res.json({ success: true, url: up.secure_url, public_id: up.public_id || publicId });
    }

    // Fallback: local disk (/uploads)
    const safeName = `${realId}_${photo_id}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const diskPath = path.join(UPLOAD_DIR, safeName);
    fs.writeFileSync(diskPath, req.file.buffer);
    const publicUrl = `/uploads/${safeName}`;

    await pool.query(
      `UPDATE public.job_photos SET uploaded_at=NOW(), storage_path=$1, public_url=$2, cloud_public_id=NULL WHERE photo_id=$3 AND job_id=$4`,
      [diskPath, publicUrl, photo_id, realId]
    );

    return res.json({ success: true, url: publicUrl });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "อัปโหลดรูปไม่สำเร็จ" });
  }
});

app.get("/jobs/:job_id/photos", async (req, res) => {
  const { job_id } = req.params;
  try {
    const realId = await resolveJobIdAny(pool, job_id);
    if (!realId) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });

    const r = await pool.query(
      `SELECT photo_id, phase, created_at, uploaded_at, public_url FROM public.job_photos WHERE job_id=$1 ORDER BY photo_id ASC`,
      [realId]
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
    const realId = await resolveJobIdAny(pool, job_id);
    if (!realId) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });

    await pool.query(
      `UPDATE public.jobs SET technician_note=$1, technician_note_at=NOW() WHERE job_id=$2`,
      [note || "", realId]
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
app.post("/jobs/:job_id/finalize", requireTechnicianSession, async (req, res) => {
  const { job_id } = req.params;
  // DEBUG (production-safe): ช่วยยืนยันว่า request วิ่งถึง server จริง
  // (กรณีช่างกดปิดงานแล้วเงียบ ไม่มี log) — log แค่ id+status ไม่ log ข้อมูลลูกค้า
  try { console.log('[finalize] hit', { job_id: String(job_id), tech: _authUsername(req), status: String(req.body?.status || '').trim() }); } catch {}
  const status = String(req.body?.status || "").trim();
  const signature_data = req.body?.signature_data;
  const note = String(req.body?.note || "").trim();
  const revisit_result = String(req.body?.revisit_result || "").trim().toLowerCase();
  const revisit_note = String(req.body?.revisit_note || "").trim();
  const warranty_kind = String(req.body?.warranty_kind || "").trim();
  const warranty_months = req.body?.warranty_months;

  if (!["เสร็จแล้ว", "ยกเลิก"].includes(status)) {
    return res.status(400).json({ error: "status ต้องเป็น 'เสร็จแล้ว' หรือ 'ยกเลิก'" });
  }
  if (!signature_data) {
    return res.status(400).json({ error: "ต้องมีลายเซ็นต์ลูกค้า" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const realId = await resolveJobIdAny(client, job_id);
    if (!realId) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });
    }
    const technician_username = await requireTechOwnsResolvedJob(req, res, realId, client);
    if (!technician_username) {
      await client.query("ROLLBACK");
      return;
    }
// ✅ งานทีม: กัน finalize ก่อนที่ทุกคนกดเสร็จของตัวเอง
if (status === "เสร็จแล้ว") {
  try {
    const a = await client.query(
      `SELECT COUNT(*)::int AS total,
              SUM(CASE WHEN status='done' THEN 1 ELSE 0 END)::int AS done
       FROM public.job_assignments
       WHERE job_id=$1`,
      [realId]
    );
    const total = Number(a.rows?.[0]?.total || 0);
    const done = Number(a.rows?.[0]?.done || 0);
    if (total > 0 && done < total) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "ยังมีช่างในทีมที่ยังไม่กดเสร็จ" , assignments: { total, done } });
    }
  } catch (e) {
    // fail-open: ถ้าตารางยังไม่มี/เช็คไม่ได้ อย่าบล็อคการปิดงาน (backward compatible)
    console.warn("[finalize] assignment guard check failed", e.message);
  }
}

    const metaR = await client.query(
      `SELECT job_status, job_type, warranty_end_at, return_reason, returned_at
       FROM public.jobs
       WHERE job_id=$1
       FOR UPDATE`,
      [realId]
    );
    const meta = metaR.rows[0] || {};
    const isRevisitFlow = String(meta.job_status || "").trim() === "งานแก้ไข" || !!meta.returned_at || !!meta.return_reason;
    const revisitResult = ["successful", "unsuccessful"].includes(revisit_result) ? revisit_result : "";
    const revisitNote = revisit_note || note;

    if (isRevisitFlow && status === "เสร็จแล้ว") {
      if (!revisitResult) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "งานแก้ไขต้องระบุ revisit_result เป็น successful หรือ unsuccessful" });
      }
      if (!revisitNote) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "งานแก้ไขต้องระบุ revisit_note หรือ note" });
      }
    }

    // บันทึกลายเซ็นต์เป็นไฟล์
    const sigPath = saveDataUrlPng(signature_data, SIGNATURE_DIR, `job_${realId}_${status}`);

    // Keep technician_note updated with the latest summary.
    // For revisit jobs we prefer the structured revisit_note when provided.
    if (revisitNote) {
      await client.query(
        `UPDATE public.jobs SET technician_note=$1, technician_note_at=NOW() WHERE job_id=$2`,
        [revisitNote, realId]
      );
    }

    if (status === "เสร็จแล้ว") {
      // ✅ Warranty enforcement (feature flag)
      // - Allow if already set (backward compatibility)
      // - IMPORTANT (production fix): งานล้าง/ติดตั้ง ต้อง auto-lock warranty ได้แม้ client ไม่ส่งค่า
      //   เพื่อแก้เคส "งานจากระบบเดิม" ที่ UI ไม่ส่ง warranty_kind แล้วทำให้ปิดงานไม่ได้
      const curW = await client.query(`SELECT job_type, warranty_end_at FROM public.jobs WHERE job_id=$1 FOR UPDATE`, [realId]);
      const cur = curW.rows[0] || {};
      const hasWarranty = !!cur.warranty_end_at;

      const jt = String(cur.job_type || '').trim();
      const isClean = jt.includes('ล้าง');
      const isInstall = jt.includes('ติดตั้ง');

      // If client didn't send warranty_kind/months, but job_type indicates clean/install, auto-derive.
      const clientWKind = String(warranty_kind || '').trim();
      const clientHasAnyWarrantyInput = !!clientWKind || warranty_months != null;
      const canAutoWarranty = (isClean || isInstall);

	      // IMPORTANT (production hotfix):
	      // ห้ามให้ประกันมาเป็นเงื่อนไขที่ทำให้ช่างปิดงานไม่ได้
	      // - ล้าง/ติดตั้ง: auto-derive ได้
	      // - ซ่อม: ถ้าไม่ส่งมา ให้คงค่าเดิม/ว่างไว้ได้ (admin ค่อยแก้ภายหลัง)

      let wEndIso = null;
      let wKind = null;
      let wMonths = null;

	      if (!hasWarranty) {
	        // Use client input when present. Otherwise auto based on job_type for clean/install.
	        // For repair with no input: allow empty (do NOT throw) to avoid blocking finalize.
	        const inferredKind = (clientWKind || (isClean ? 'clean' : (isInstall ? 'install' : '')));
	        const shouldCompute = !!inferredKind && (inferredKind !== 'repair' || [3,6,12].includes(Number(warranty_months)));
	        if (shouldCompute) {
	          const w = computeWarrantyEnd({
	            job_type: jt,
	            warranty_kind: inferredKind,
	            warranty_months,
	            start: new Date(),
	          });
	          wEndIso = w.end.toISOString();
	          wKind = w.kind;
	          wMonths = w.months;
	        }
	      }
      await client.query(
        `UPDATE public.jobs
         SET job_status='เสร็จแล้ว',
             finished_at = NOW(),
             final_signature_path = $1,
             final_signature_status = 'เสร็จแล้ว',
             final_signature_at = NOW(),
             warranty_kind = COALESCE($3, warranty_kind),
             warranty_months = COALESCE($4, warranty_months),
             warranty_start_at = COALESCE(warranty_start_at, NOW()),
         warranty_end_at = COALESCE($5, warranty_end_at)
         WHERE job_id=$2`,
        [sigPath, realId, wKind, wMonths, wEndIso]
      );
      if (isRevisitFlow && revisitResult) {
        await logJobUpdate(
          realId,
          {
            actor_username: technician_username,
            actor_role: "tech",
            action: "revisit_result",
            message: revisitResult === "successful" ? "successful" : "unsuccessful",
            payload: {
              revisit_result: revisitResult,
              revisit_note: revisitNote || null,
              evidence_phases: ["revisit_before", "revisit_after", "revisit_defect"],
            },
          },
          client
        );
      }
      await logJobUpdate(realId, {
        actor_username: technician_username,
        actor_role: 'tech',
        action: 'finalize_done',
        message: 'เสร็จแล้ว',
        payload: {
          warranty_kind: wKind || null,
          warranty_months: wMonths || null,
          warranty_end_at: wEndIso || null,
          revisit_result: revisitResult || null,
          revisit_note: revisitNote || null,
        }
      }, client);
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
        [note, sigPath, realId]
      );
      await logJobUpdate(realId, { actor_username: technician_username, actor_role: 'tech', action: 'finalize_cancel', message: note || 'ยกเลิก' }, client);
    }

    await client.query("COMMIT");
    res.json({ success: true, job_id: Number(realId), status });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: e.message || "ปิดงาน/ยกเลิกไม่สำเร็จ" });
  } finally {
    client.release();
  }
});

// =======================================
// ✅ TEAM ASSIGNMENT: mark done per technician
// - POST /jobs/:job_id/assignment-done { technician_username }
// - returns { success, all_done, assignments:{total,done} }
// =======================================
app.post("/jobs/:job_id/assignment-done", requireTechnicianSession, async (req, res) => {
  const job_id = Number(req.params.job_id);
  const technician_username = _authUsername(req);
  if (!job_id) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });
  if (!technician_username) return res.status(401).json({ error: "UNAUTHORIZED" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const realId = await resolveJobIdAny(client, job_id);
    if (!realId) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });
    }

    // Ensure this tech is actually part of the job
    const ok = await client.query(
      `
      SELECT 1
      FROM public.jobs j
      LEFT JOIN public.job_team_members tm ON tm.job_id=j.job_id AND tm.username=$2
      LEFT JOIN public.job_assignments ja ON ja.job_id=j.job_id AND ja.technician_username=$2
      WHERE j.job_id=$1 AND (j.technician_username=$2 OR j.technician_team=$2 OR tm.username IS NOT NULL OR ja.technician_username IS NOT NULL)
      LIMIT 1
      `,
      [realId, technician_username]
    );
    if (!ok.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "ช่างคนนี้ไม่ได้อยู่ในทีมของงานนี้" });
    }

    // Upsert to done (idempotent)
    await client.query(
      `
      INSERT INTO public.job_assignments (job_id, technician_username, status, done_at)
      VALUES ($1,$2,'done',NOW())
      ON CONFLICT (job_id, technician_username)
      DO UPDATE SET status='done', done_at=NOW()
      `,
      [realId, technician_username]
    );

    const a = await client.query(
      `SELECT COUNT(*)::int AS total,
              SUM(CASE WHEN status='done' THEN 1 ELSE 0 END)::int AS done
       FROM public.job_assignments
       WHERE job_id=$1`,
      [realId]
    );
    const total = Number(a.rows?.[0]?.total || 0);
    const done = Number(a.rows?.[0]?.done || 0);
    const all_done = total > 0 ? done >= total : true;

    await client.query("COMMIT");
    return res.json({ success: true, job_id: Number(realId), all_done, assignments: { total, done } });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    return res.status(500).json({ error: e.message || "บันทึกสถานะงานไม่สำเร็จ" });
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

  try {
    const ctx = await getAuthContext(req, res);
    if (!ctx.ok) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const actorRole = String(ctx.actor?.role || '').trim().toLowerCase();
    const actorIsAdmin = actorRole === 'admin' || actorRole === 'super_admin';
    const effectiveUser = String(ctx.effective?.username || '').trim();
    const effectiveIsTech = isTechnicianRole(ctx.effective?.role);
    if (!actorIsAdmin && (!effectiveIsTech || effectiveUser !== String(username || '').trim())) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    req.actor = ctx.actor;
    req.effective = ctx.effective;
    req.auth = ctx.effective;
    req.impersonating = !!ctx.impersonating;
    req.session_token = ctx.session_token;
  } catch (e) {
    console.error('accept-status auth error:', e);
    return res.status(500).json({ error: 'AUTH_FAILED' });
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
// 🗓️ TECH: Weekly off-days + Workday overrides (v2)
// - weekly_off_days: '0,6' (Sun,Sat)
// - overrides: technician_workdays_v2 (work_date, is_off)
// Safety: limit edit window (default 14 days ahead)
// =======================================
const ENABLE_TECH_WORKDAYS_V2 = (process.env.ENABLE_TECH_WORKDAYS_V2 || "1") === "1";
const TECH_WORKDAYS_MAX_AHEAD_DAYS = Number(process.env.TECH_WORKDAYS_MAX_AHEAD_DAYS || 14);

function toIsoDate(d){
  const dt = (d instanceof Date) ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth()+1).padStart(2,'0');
  const dd = String(dt.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}

app.get('/technicians/:username/weekly-off-days', async (req, res) => {
  const { username } = req.params;
  try {
    const r = await pool.query(`SELECT COALESCE(weekly_off_days,'') AS weekly_off_days FROM public.technician_profiles WHERE username=$1 LIMIT 1`, [username]);
    const raw = r.rows[0]?.weekly_off_days || '';
    const days = raw.split(',').map(x=>Number(String(x).trim())).filter(n=>Number.isFinite(n) && n>=0 && n<=6);
    res.json({ success:true, weekly_off_days: raw, days });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'โหลดวันหยุดประจำสัปดาห์ไม่สำเร็จ' });
  }
});

app.put('/technicians/:username/weekly-off-days', async (req, res) => {
  if (!ENABLE_TECH_WORKDAYS_V2) return res.status(403).json({ error: 'Feature disabled' });
  const { username } = req.params;
  const days = Array.isArray(req.body?.days) ? req.body.days : [];
  const norm = Array.from(
    new Set(days.map(d=>Number(d)).filter(n=>Number.isFinite(n) && n>=0 && n<=6))
  ).sort((a,b)=>a-b);
  const raw = norm.join(',');
  try {
    await pool.query(
      `INSERT INTO public.technician_profiles (username, weekly_off_days)
       VALUES ($1,$2)
       ON CONFLICT (username) DO UPDATE SET weekly_off_days=EXCLUDED.weekly_off_days`,
      [username, raw]
    );
    res.json({ success:true, weekly_off_days: raw, days: norm });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'บันทึกวันหยุดประจำสัปดาห์ไม่สำเร็จ' });
  }
});

app.get('/technicians/:username/workdays-v2', async (req, res) => {
  const { username } = req.params;
  const from = String(req.query?.from || '').trim();
  const to = String(req.query?.to || '').trim();
  const fromIso = from || toIsoDate(new Date());
  const toIso = to || toIsoDate(new Date(Date.now() + 14*86400000));
  try {
    const r = await pool.query(
      `SELECT work_date::date AS work_date, is_off, updated_at
       FROM public.technician_workdays_v2
       WHERE technician_username=$1 AND work_date::date BETWEEN $2::date AND $3::date
       ORDER BY work_date ASC`,
      [username, fromIso, toIso]
    );
    res.json({ success:true, items: r.rows.map(x=>({ work_date: toIsoDate(x.work_date), is_off: !!x.is_off, updated_at: x.updated_at })) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'โหลดวันหยุดล่วงหน้าไม่สำเร็จ' });
  }
});

app.put('/technicians/:username/workdays-v2', async (req, res) => {
  if (!ENABLE_TECH_WORKDAYS_V2) return res.status(403).json({ error: 'Feature disabled' });
  const { username } = req.params;
  const work_date = String(req.body?.work_date || '').trim();
  const is_off = !!req.body?.is_off;
  if (!work_date) return res.status(400).json({ error: 'ต้องมี work_date (YYYY-MM-DD)' });
  const iso = toIsoDate(work_date);
  if (!iso) return res.status(400).json({ error: 'รูปแบบ work_date ไม่ถูกต้อง' });

  // limit edit window
  const today = new Date();
  today.setHours(0,0,0,0);
  const max = new Date(today.getTime() + (Math.max(1, TECH_WORKDAYS_MAX_AHEAD_DAYS) * 86400000));
  const d = new Date(iso + 'T00:00:00');
  if (d < today || d > max) {
    return res.status(400).json({ error: `ตั้งค่าได้เฉพาะวันนี้ถึง ${toIsoDate(max)} เท่านั้น` });
  }

  try {
    const r = await pool.query(
      `INSERT INTO public.technician_workdays_v2 (technician_username, work_date, is_off, updated_at)
       VALUES ($1,$2::date,$3,NOW())
       ON CONFLICT (technician_username, work_date)
       DO UPDATE SET is_off=EXCLUDED.is_off, updated_at=EXCLUDED.updated_at
       RETURNING work_date::date AS work_date, is_off, updated_at`,
      [username, iso, is_off]
    );
    const row = r.rows[0];
    res.json({ success:true, item: { work_date: toIsoDate(row.work_date), is_off: !!row.is_off, updated_at: row.updated_at } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'บันทึกวันหยุดล่วงหน้าไม่สำเร็จ' });
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
app.get("/service_zones", async (req, res) => {
  try {
    res.json({ ok: true, zones: await getServiceZones(), filter_enabled: ENABLE_SERVICE_ZONE_FILTER });
  } catch (e) {
    console.error("GET /service_zones", e);
    res.status(500).json({ error: "LOAD_SERVICE_ZONES_FAILED" });
  }
});

app.post("/service_zones/detect", async (req, res) => {
  try {
    const detected = await detectServiceZoneFromText(req.body || {});
    res.json({ ok: true, detected });
  } catch (e) {
    console.error("POST /service_zones/detect", e);
    res.status(500).json({ error: "DETECT_SERVICE_ZONE_FAILED" });
  }
});

app.put("/technicians/:username/service-zone", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim();
    const home_province = String(req.body?.home_province || "").trim();
    const home_district = String(req.body?.home_district || "").trim();
    const secondary_service_zone_code = String(req.body?.secondary_service_zone_code || "").trim().toUpperCase();
    const allow_out_of_zone = req.body?.allow_out_of_zone === true || String(req.body?.allow_out_of_zone || "").toLowerCase() === "true";
    const service_radius_km = req.body?.service_radius_km ?? null;
    const saved = await updateTechnicianHomeZone(username, home_province, home_district, allow_out_of_zone, secondary_service_zone_code, service_radius_km);
    res.json({ ok: true, ...saved });
  } catch (e) {
    console.error("PUT /technicians/:username/service-zone", e);
    res.status(500).json({ error: "SAVE_TECH_SERVICE_ZONE_FAILED" });
  }
});
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

// ✅ Cloudinary helper (for technician profile photos)
// - Returns { url, public_id }
async function uploadTechProfileToCloudinary(file, { username, folderSuffix }) {
  if (!file) return null;
  if (!CLOUDINARY_ENABLED) return null;
  const safeUser = safeFilename(String(username || 'unknown'));
  const stamp = Date.now();
  const publicId = `${safeUser}_${stamp}`;
  const folder = `cwf/tech_profiles${folderSuffix ? `/${folderSuffix}` : ''}`;
  const transformation = 'c_limit,w_800,q_auto,f_auto';
  const r = await cloudinaryUploadBuffer({
    buffer: file.buffer,
    mimetype: file.mimetype,
    folder,
    publicId,
    transformation,
  });
  return { url: r.secure_url, public_id: r.public_id };
}

app.get("/technicians/:username/profile", async (req, res) => {
  try {
    const username = req.params.username;

    const p = await pool.query(
      `SELECT username, technician_code, full_name, photo_path, position, rank_level, rank_key, rating, grade, done_count,
              COALESCE(accept_status,'ready') AS accept_status, accept_status_updated_at,
              COALESCE(preferred_zone,'') AS preferred_zone,
              COALESCE(phone,'') AS phone,
              COALESCE(home_province,'') AS home_province,
              COALESCE(home_district,'') AS home_district,
              COALESCE(home_service_zone_code,'') AS home_service_zone_code,
              COALESCE(secondary_service_zone_code,'') AS secondary_service_zone_code,
              service_radius_km,
              COALESCE(allow_out_of_zone,FALSE) AS allow_out_of_zone,
              z.zone_label AS home_service_zone_label,
              z2.zone_label AS secondary_service_zone_label
       FROM public.technician_profiles p
       LEFT JOIN public.service_zones z ON z.zone_code=p.home_service_zone_code
       LEFT JOIN public.service_zones z2 ON z2.zone_code=p.secondary_service_zone_code
       WHERE p.username=$1`,
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

    // ✅ IMPORTANT: profile request photos must NOT be stored on local disk (Render ephemeral)
    // Prefer Cloudinary. If Cloudinary not configured, fallback to local disk to keep backward compatibility.
    let photo_temp_path = null;
    if (req.file && CLOUDINARY_ENABLED) {
      const up = await uploadTechProfileToCloudinary(req.file, { username, folderSuffix: 'requests' });
      photo_temp_path = up?.url || null;
    } else {
      photo_temp_path = saveUploadedFile(req.file, PROFILE_REQ_DIR, username);
    }

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
app.get("/admin/profile/requests", requireAdminSession, async (req, res) => {
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

app.post("/admin/profile/requests/:id/approve", requireAdminSession, async (req, res) => {
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
      const p = String(reqRow.photo_temp_path);
      // ✅ If request photo already stored on Cloudinary, keep it as-is
      if (/^https?:\/\//i.test(p) && p.includes('res.cloudinary.com')) {
        finalPhotoPath = p;
      } else {
        // Backward compatible: local temp file -> move to tech_profiles
        const tempAbs = path.join(__dirname, p.replace("/uploads/", "uploads/"));
        if (fs.existsSync(tempAbs)) {
          const ext = path.extname(tempAbs) || ".jpg";
          const finalName = safeFilename(`${reqRow.username}_${Date.now()}${ext}`);
          const finalAbs = path.join(TECH_PROFILE_DIR, finalName);
          fs.renameSync(tempAbs, finalAbs);

          const rel = finalAbs.replace(UPLOAD_DIR, "").replace(/\\/g, "/");
          finalPhotoPath = `/uploads${rel.startsWith("/") ? "" : "/"}${rel}`;
        }
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

app.post("/admin/profile/requests/:id/reject", requireAdminSession, async (req, res) => {
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
app.post("/admin/technicians/create", requireAdminSession, async (req, res) => {
  const { username, password, full_name, technician_code, position, phone, employment_type } = req.body || {};
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
      `INSERT INTO public.technician_profiles (username, full_name, technician_code, position, phone, employment_type, rating, grade, done_count)
       VALUES ($1,$2,$3,$4,$5,$6, 5, 'A', 0)
       ON CONFLICT (username) DO NOTHING`,
      [
        u,
        (full_name || u).toString().trim(),
        code,
        pos,
        (phone || '').toString().trim() || null,
        (employment_type || '').toString().trim() || null,
      ]
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

app.get("/admin/technicians", requireAdminSession, async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT u.username,
              p.full_name, p.technician_code, p.position, p.rank_level, p.rank_key, p.photo_path, p.phone,
              COALESCE(p.employment_type,'company') AS employment_type,
              COALESCE(p.compensation_mode,'commission') AS compensation_mode,
              COALESCE(p.daily_wage_amount,0)::numeric AS daily_wage_amount,
              COALESCE(p.monthly_salary_amount,0)::numeric AS monthly_salary_amount,
              COALESCE(p.work_start,'09:00') AS work_start,
              COALESCE(p.work_end,'18:00') AS work_end,
              COALESCE(p.customer_slot_visible, TRUE) AS customer_slot_visible,
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


// =======================================
// 🧑‍🔧 ADMIN: Technician Base Status (People Status / Team Status Forge)
// Phase 1: baseline assessment only; no AI/image API; isolated and read-only toward existing systems.
// =======================================
const TECH_BASE_STATUS_CAPS = {
  basic_clean: { label: 'ล้างแอร์ผนัง', skill: 4, wis: 1, int: 0 },
  premium_clean: { label: 'ล้างพรีเมียม', skill: 6, wis: 2, int: 1 },
  coil_clean: { label: 'แขวนคอยล์', skill: 8, wis: 3, int: 1 },
  overhaul: { label: 'ตัดล้างใหญ่', skill: 9, wis: 3, int: 2 },
  cassette_or_hanging: { label: 'ล้างแอร์แขวน/สี่ทิศทาง', skill: 8, wis: 3, int: 2 },
  install: { label: 'ติดตั้งแอร์', skill: 8, wis: 3, int: 3 },
  relocate: { label: 'ย้ายแอร์', skill: 8, wis: 3, int: 3 },
  leak_repair: { label: 'ซ่อมรั่ว', skill: 11, wis: 6, int: 5 },
  refrigerant: { label: 'เติมน้ำยา/เช็กระบบน้ำยา', skill: 7, wis: 5, int: 4 },
  electrical: { label: 'เช็กไฟ/บอร์ด/คาปา/มอเตอร์', skill: 8, wis: 6, int: 6 },
  complex_diagnosis: { label: 'วิเคราะห์อาการเสียซับซ้อน', skill: 10, wis: 8, int: 8 },
};

function clamp100(n){ n = Number(n || 0); if (!Number.isFinite(n)) n = 0; return Math.max(0, Math.min(100, Math.round(n))); }
function avgNums(arr){ const xs = (arr || []).map(Number).filter(Number.isFinite); return xs.length ? xs.reduce((a,b)=>a+b,0) / xs.length : 0; }
function score100(v){ return clamp100(Number(v || 0) * 20); }
function pickEvidence(answers, key){ return Number(answers?.evidence_scores?.[key] || answers?.[key]?.evidence_score || 0); }
function selectedCaps(answers){ return Array.isArray(answers?.capabilities) ? answers.capabilities.map(String) : []; }
function rankFromAverage(avg){ avg = Number(avg || 0); if (avg >= 90) return 'S'; if (avg >= 80) return 'A+'; if (avg >= 70) return 'A'; if (avg >= 60) return 'B'; return 'C'; }
function expSkill(exp){
  const v = String(exp || '').trim();
  if (v === 'lt1') return 20;
  if (v === '1-2') return 35;
  if (v === '3-5') return 55;
  if (v === '5-10') return 70;
  if (v === '10plus') return 85;
  return 20;
}
function optionScore(value, table, def = 50){ return Number.isFinite(table[String(value || '')]) ? table[String(value || '')] : def; }
function capLabels(caps){ return (caps || []).map(k => TECH_BASE_STATUS_CAPS[k]?.label).filter(Boolean); }

function calculateTechnicianBaseStatus(answers = {}, technician = {}) {
  const caps = selectedCaps(answers);
  const capScores = caps.map(k => TECH_BASE_STATUS_CAPS[k]).filter(Boolean);
  const capSkillBonus = capScores.reduce((s,c)=>s + Number(c.skill || 0), 0);
  const capWisBonus = capScores.reduce((s,c)=>s + Number(c.wis || 0), 0);
  const capIntBonus = capScores.reduce((s,c)=>s + Number(c.int || 0), 0);

  const q5 = score100(pickEvidence(answers, 'q5'));
  const q6 = score100(pickEvidence(answers, 'q6'));
  const q10 = score100(pickEvidence(answers, 'q10'));
  const q12 = score100(pickEvidence(answers, 'q12'));

  const q7 = optionScore(answers.q7_photo_discipline, { always: 95, sometimes_forget: 75, need_reminder: 55, dislike: 35, dont_understand: 20 }, 50);
  const q8 = optionScore(answers.q8_app_updates, { full: 95, need_training: 78, if_easy: 68, dislike_app: 40, refuse: 15 }, 50);
  const q9 = optionScore(answers.q9_price_issue, { A: 48, B: 95, C: 35, D: 25 }, 50);
  const q11 = optionScore(answers.q11_heavy_day, { A: 95, B: 35, C: 68, D: 5 }, 50);
  const q13 = optionScore(answers.q13_work_style, { solo: 55, pair: 75, team: 82, all: 95, depends: 85 }, 60);
  const q14 = optionScore(answers.q14_disagree, { A: 62, B: 35, C: 95, D: 10 }, 50);
  const q16 = optionScore(answers.q16_growth_role, { stable: 70, hard_jobs: 82, team_lead: 92, main_partner: 88, subcontractor: 78, unsure: 55 }, 60);
  const q15Evidence = (()=>{
    const q = answers.q15_growth_plan || {};
    const filled = ['technical','communication','system','goal'].filter(k => String(q[k] || '').trim()).length;
    return clamp100(40 + (filled * 15));
  })();

  const skill = clamp100(avgNums([expSkill(answers.experience_years), q5, q12]) + Math.min(24, capSkillBonus));
  const wis = clamp100(avgNums([q5, q6]) + Math.min(22, capWisBonus));
  const intv = clamp100(avgNums([q5, q15Evidence]) + Math.min(22, capIntBonus));
  const disc = clamp100(avgNums([q7, q8]));
  const comm = clamp100(avgNums([q8, q9, q10, q14]));
  const service = clamp100(avgNums([q9, q10]));
  const end = clamp100(avgNums([q11, q12]));
  const trust = clamp100(avgNums([q6, q9, q11, q12]));
  const team = clamp100(avgNums([q13, q14]));
  const growth = clamp100(avgNums([q6, q15Evidence, q16]));

  const stats = { SKILL: skill, END: end, WIS: wis, INT: intv, DISC: disc, SERVICE: service, COMM: comm, TEAM: team, TRUST: trust, GROWTH: growth };
  const averageStats = avgNums(Object.values(stats));
  const level = Math.min(40, Math.max(1, Math.round(averageStats / 2.5)));
  const rank = rankFromAverage(averageStats);
  const strengths = [];
  if (skill >= 80) strengths.push('ทักษะช่างพื้นฐานดี');
  if (wis >= 80) strengths.push('แก้ปัญหาเฉพาะหน้าได้ดี');
  if (disc >= 75) strengths.push('พร้อมทำตามระบบและเช็กลิสต์');
  if (service >= 75) strengths.push('เหมาะกับงานที่ต้องเจอลูกค้า');
  if (team >= 75) strengths.push('ทำงานร่วมกับทีมได้ดี');
  if (trust >= 80) strengths.push('ไว้ใจให้รับผิดชอบงานได้');
  if (growth >= 80) strengths.push('มีศักยภาพเติบโตต่อ');
  if (!strengths.length) strengths.push('ควรเริ่มจากงานพื้นฐานพร้อมหัวหน้าคุม เพื่อเก็บหลักฐานจริง');

  const suitable = [];
  if (skill >= 80 && wis >= 80) suitable.push('งานยาก / งานซ่อม / งานวิเคราะห์อาการ');
  if (disc >= 75 && service >= 75) suitable.push('งานลูกค้าคอนโด / ลูกค้า VIP');
  if (team >= 75) suitable.push('งานทีม');
  if (skill < 60) suitable.push('เริ่มจากงานล้างทั่วไปหรือผู้ช่วย');
  for (const label of capLabels(caps)) suitable.push(label);
  const suitableJobs = Array.from(new Set(suitable)).slice(0, 10);

  const restricted = [];
  if (skill < 70 || wis < 70) restricted.push('ยังไม่ควรรับงานซ่อมยากหรืองานวิเคราะห์อาการคนเดียว');
  if (comm < 60) restricted.push('ยังไม่ควรคุยราคาเพิ่มกับลูกค้าเอง ต้องให้แอดมิน/เจ้าของอนุมัติ');
  if (trust < 60) restricted.push('ต้องมีหัวหน้าคุมก่อนจนกว่าจะมีหลักฐานความสม่ำเสมอ');
  if (disc < 60) restricted.push('ต้องฝึกใช้แอพ / ถ่ายรูปก่อน-หลัง / อัปเดตสถานะก่อนรับงานเดี่ยว');
  if (service < 60) restricted.push('ยังไม่ควรลงงานลูกค้า VIP หรือเคสลูกค้าจุกจิก');
  if (!restricted.length) restricted.push('ไม่มีข้อจำกัดรุนแรงจากแบบประเมินเบื้องต้น แต่ต้องยืนยันด้วยงานจริง');

  const dev = [];
  if (disc < 75) dev.push('ฝึกกดสถานะในแอพและถ่ายรูปก่อน-หลังให้ครบทุกงาน');
  if (comm < 75) dev.push('ฝึกการแจ้งปัญหาหน้างานและการขออนุมัติเพิ่มราคา');
  if (service < 75) dev.push('ฝึกการอธิบายลูกค้าอย่างสุภาพและไม่ปะทะ');
  if (team < 75) dev.push('ฝึกทำงานร่วมทีมและเสนอความเห็นแบบไม่ทำลายทีม');
  if (skill < 75) dev.push('เริ่มแผนพัฒนาทักษะช่างจากงานที่ยังไม่มั่นใจ');
  if (growth < 75) dev.push('กำหนดเป้าหมาย 30 วันและทักษะที่ต้องฝึกให้ชัด');
  if (!dev.length) dev.push('เริ่มทดลองงาน 30 วันด้วย KPI จากระบบจริง เพื่อยืนยันคะแนนฐาน');

  const prompt = buildTechnicianCharacterPrompt({ technician, stats, level, rank, strengths, restricted, dev, answers });
  return { stats, level, rank, suitable_jobs: suitableJobs, restricted_jobs: restricted, strengths, risk_points: restricted, development_plan: dev, generated_prompt: prompt };
}

function buildTechnicianCharacterPrompt({ technician = {}, stats = {}, level, rank, strengths = [], restricted = [], dev = [], answers = {} }) {
  const name = technician.full_name || technician.username || 'CWF Technician';
  const role = answers.q16_growth_role || technician.employment_type || 'technician';
  return `Create a premium 9:16 RPG-style Thai character status card for Coldwindflow Air Services. Use the technician profile photo as identity reference only, not for judging ability. Character name: ${name}. Class/Role: ${role}. Level: ${level}. Rank: ${rank}. Use navy blue, electric blue, white, and yellow CWF branding. Include stats: SKILL ${stats.SKILL}, END ${stats.END}, WIS ${stats.WIS}, INT ${stats.INT}, DISC ${stats.DISC}, SERVICE ${stats.SERVICE}, COMM ${stats.COMM}, TEAM ${stats.TEAM}, TRUST ${stats.TRUST}, GROWTH ${stats.GROWTH}. Passive skills/strengths: ${strengths.join(', ')}. Upgrade points: ${dev.join(', ')}. Risk warnings: ${restricted.join(', ')}. Add Thai footer: "Base Status ก่อนเริ่มงาน / คะแนนจริงต้องปรับด้วยผลงานจริง". Make it look like a premium game status screen, clean readable Thai typography, stat bars, badges, and Coldwindflow technician theme.`;
}

async function getTechnicianForStatus(username) {
  const r = await pool.query(
    `SELECT u.username, u.role, COALESCE(p.full_name, u.full_name, u.username) AS full_name,
            p.technician_code, p.position, p.photo_path, p.phone,
            COALESCE(p.employment_type,'company') AS employment_type,
            p.rating, p.grade, p.done_count
     FROM public.users u
     LEFT JOIN public.technician_profiles p ON p.username=u.username
     WHERE u.username=$1 AND u.role='technician'
     LIMIT 1`,
    [username]
  );
  return (r.rows || [])[0] || null;
}

async function getLatestBaseStatus(username, opts = {}) {
  const values = [username];
  let where = `technician_username=$1`;
  if (opts.review_status) {
    values.push(String(opts.review_status));
    where += ` AND COALESCE(review_status,'verified')=$${values.length}`;
  }
  const r = await pool.query(
    `SELECT * FROM public.technician_base_status_assessments
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT 1`,
    values
  );
  return (r.rows || [])[0] || null;
}

app.get('/admin/team-status', requireAdminSession, (req, res) => res.sendFile(sendHtml('admin-team-status.html')));
app.get('/admin/team-status.html', requireAdminSession, (req, res) => res.redirect(302, '/admin/team-status'));
app.get('/admin-team-status.html', requireAdminSession, (req, res) => res.sendFile(sendHtml('admin-team-status.html')));

app.get('/admin/api/team-status', requireAdminSession, async (req, res) => {
  try {
    const techs = await pool.query(
      `SELECT u.username, COALESCE(p.full_name, u.full_name, u.username) AS full_name,
              p.photo_path, p.phone, p.technician_code, COALESCE(p.employment_type,'company') AS employment_type,
              p.rating, p.grade, p.done_count
       FROM public.users u
       LEFT JOIN public.technician_profiles p ON p.username=u.username
       WHERE u.role='technician'
       ORDER BY COALESCE(p.full_name, u.username) ASC`
    );
    const latest = await pool.query(
      `SELECT DISTINCT ON (technician_username)
          id, technician_username, level, rank, stats_json, suitable_jobs_json, restricted_jobs_json,
          strengths_json, risk_points_json, development_plan_json, generated_prompt,
          COALESCE(assessment_source,'admin') AS assessment_source,
          COALESCE(review_status,'verified') AS review_status,
          assessed_by, reviewed_by, reviewed_at, created_at
       FROM public.technician_base_status_assessments
       ORDER BY technician_username, created_at DESC`
    );
    const pending = await pool.query(
      `SELECT DISTINCT ON (technician_username)
          id, technician_username, level, rank, created_at,
          COALESCE(assessment_source,'self') AS assessment_source,
          COALESCE(review_status,'pending_review') AS review_status
       FROM public.technician_base_status_assessments
       WHERE COALESCE(review_status,'verified')='pending_review'
       ORDER BY technician_username, created_at DESC`
    );
    const map = new Map((latest.rows || []).map(r => [String(r.technician_username), r]));
    const pendingMap = new Map((pending.rows || []).map(r => [String(r.technician_username), r]));
    const people = (techs.rows || []).map(t => ({ ...t, latest_status: map.get(String(t.username)) || null, pending_status: pendingMap.get(String(t.username)) || null }));
    return res.json({ ok: true, people });
  } catch (e) {
    console.error('GET team-status error:', e);
    return res.status(500).json({ error: 'โหลด Team Status ไม่สำเร็จ' });
  }
});

app.get('/admin/api/technicians/:username/base-status', requireAdminSession, async (req, res) => {
  try {
    const username = String(req.params.username || '').trim();
    const technician = await getTechnicianForStatus(username);
    if (!technician) return res.status(404).json({ error: 'ไม่พบช่าง' });
    const latest = await getLatestBaseStatus(username);
    return res.json({ ok: true, technician, latest });
  } catch (e) {
    console.error('GET base-status error:', e);
    return res.status(500).json({ error: 'โหลด Base Status ไม่สำเร็จ' });
  }
});

app.post('/admin/api/technicians/:username/base-status', requireAdminSession, async (req, res) => {
  try {
    const username = String(req.params.username || '').trim();
    const technician = await getTechnicianForStatus(username);
    if (!technician) return res.status(404).json({ error: 'ไม่พบช่าง' });
    const answers = (req.body && typeof req.body.answers === 'object' && !Array.isArray(req.body.answers)) ? req.body.answers : {};
    const result = calculateTechnicianBaseStatus(answers, technician);
    const assessedBy = String(req.actor?.username || req.auth?.username || 'admin');
    const saved = await pool.query(
      `INSERT INTO public.technician_base_status_assessments
        (technician_username, assessed_by, assessment_source, review_status, reviewed_by, reviewed_at, answers_json, stats_json, level, rank,
         suitable_jobs_json, restricted_jobs_json, strengths_json, risk_points_json, development_plan_json, generated_prompt, updated_at)
       VALUES ($1,$2,'admin','verified',$2,NOW(),$3::jsonb,$4::jsonb,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12,NOW())
       RETURNING *`,
      [
        username,
        assessedBy,
        JSON.stringify(answers),
        JSON.stringify(result.stats),
        result.level,
        result.rank,
        JSON.stringify(result.suitable_jobs),
        JSON.stringify(result.restricted_jobs),
        JSON.stringify(result.strengths),
        JSON.stringify(result.risk_points),
        JSON.stringify(result.development_plan),
        result.generated_prompt,
      ]
    );
    return res.json({ ok: true, technician, assessment: saved.rows[0] });
  } catch (e) {
    console.error('POST base-status error:', e);
    return res.status(500).json({ error: 'บันทึก Base Status ไม่สำเร็จ' });
  }
});

app.get('/admin/api/technicians/:username/status', requireAdminSession, async (req, res) => {
  try {
    const username = String(req.params.username || '').trim();
    const technician = await getTechnicianForStatus(username);
    if (!technician) return res.status(404).json({ error: 'ไม่พบช่าง' });
    const latest = await getLatestBaseStatus(username);
    return res.json({ ok: true, technician, latest, future_work_adjustment: ['Completed jobs','On-time check-in','Status update completeness','Before/after photos','Customer reviews','Complaints','Rework','Admin override notes'] });
  } catch (e) {
    console.error('GET tech status error:', e);
    return res.status(500).json({ error: 'โหลด Status ไม่สำเร็จ' });
  }
});

// Technician Self Assessment entrypoint (Phase 1.1)
// - ช่างทำแบบประเมินเองได้จากเมนูช่าง
// - บันทึกเป็น pending_review เพื่อให้ Admin/Super Admin ตรวจต่อ ไม่ใช่คะแนน official อัตโนมัติ
app.get('/tech/base-status', requireTechnicianSession, (req, res) => res.sendFile(sendHtml('tech-base-status.html')));
app.get('/tech/base-status.html', requireTechnicianSession, (req, res) => res.redirect(302, '/tech/base-status'));

app.get('/tech/api/base-status', requireTechnicianSession, async (req, res) => {
  try {
    const username = String(req.auth?.username || req.effective?.username || '').trim();
    const technician = await getTechnicianForStatus(username);
    if (!technician) return res.status(404).json({ error: 'ไม่พบข้อมูลช่างของคุณ' });
    const latest = await getLatestBaseStatus(username);
    const latest_self = await getLatestBaseStatus(username, { review_status: 'pending_review' });
    const latest_verified = await getLatestBaseStatus(username, { review_status: 'verified' });
    return res.json({ ok: true, technician, latest, latest_self, latest_verified });
  } catch (e) {
    console.error('GET tech self base-status error:', e);
    return res.status(500).json({ error: 'โหลดแบบประเมินของช่างไม่สำเร็จ' });
  }
});

app.post('/tech/api/base-status', requireTechnicianSession, async (req, res) => {
  try {
    const username = String(req.auth?.username || req.effective?.username || '').trim();
    const technician = await getTechnicianForStatus(username);
    if (!technician) return res.status(404).json({ error: 'ไม่พบข้อมูลช่างของคุณ' });
    const answers = (req.body && typeof req.body.answers === 'object' && !Array.isArray(req.body.answers)) ? req.body.answers : {};
    answers.__self_assessment = true;
    answers.__submitted_by = username;
    answers.__submitted_at = new Date().toISOString();
    const result = calculateTechnicianBaseStatus(answers, technician);
    const saved = await pool.query(
      `INSERT INTO public.technician_base_status_assessments
        (technician_username, assessed_by, assessment_source, review_status, answers_json, stats_json, level, rank,
         suitable_jobs_json, restricted_jobs_json, strengths_json, risk_points_json, development_plan_json, generated_prompt, updated_at)
       VALUES ($1,$2,'self','pending_review',$3::jsonb,$4::jsonb,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12,NOW())
       RETURNING *`,
      [
        username,
        username,
        JSON.stringify(answers),
        JSON.stringify(result.stats),
        result.level,
        result.rank,
        JSON.stringify(result.suitable_jobs),
        JSON.stringify(result.restricted_jobs),
        JSON.stringify(result.strengths),
        JSON.stringify(result.risk_points),
        JSON.stringify(result.development_plan),
        result.generated_prompt,
      ]
    );
    return res.json({ ok: true, technician, assessment: saved.rows[0], pending_review: true });
  } catch (e) {
    console.error('POST tech self base-status error:', e);
    return res.status(500).json({ error: 'ส่งแบบประเมินไม่สำเร็จ' });
  }
});
app.put("/admin/technicians/:username", requireAdminSession, async (req, res) => {
  try {
    const username = req.params.username;
    const technician_code = (req.body.technician_code || "").trim();
    const full_name = (req.body.full_name || "").trim();
    const position = (req.body.position || "").trim() || null; // ✅ ไม่ส่ง = ไม่ทับ
    const phoneRaw = (req.body.phone ?? "").toString().trim();
    const employment_type = (req.body.employment_type ?? "").toString().trim() || null;
    const compensation_mode_in = (req.body.compensation_mode ?? "").toString().trim() || null;
    const daily_wage_amount_in = req.body.daily_wage_amount;
    const monthly_salary_amount_in = req.body.monthly_salary_amount;
    const work_start = (req.body.work_start ?? "").toString().trim() || null;
    const work_end = (req.body.work_end ?? "").toString().trim() || null;
    // customer_slot_visible: optional
    const customer_slot_visible_in = (req.body.customer_slot_visible);
    const hasCustomerSlotVisible = (customer_slot_visible_in === true || customer_slot_visible_in === false || customer_slot_visible_in === 'true' || customer_slot_visible_in === 'false' || customer_slot_visible_in === 1 || customer_slot_visible_in === 0 || customer_slot_visible_in === '1' || customer_slot_visible_in === '0');
    const customer_slot_visible = hasCustomerSlotVisible ? (String(customer_slot_visible_in).trim() === '1' || String(customer_slot_visible_in).trim().toLowerCase() === 'true') : null;
    const newPassword = (req.body.new_password ?? "").toString();
    const confirmPassword = (req.body.confirm_password ?? "").toString();

    if (!technician_code) return res.status(400).json({ error: "ต้องใส่รหัสช่าง" });

    if (phoneRaw && !/^[0-9+\-()\s]{6,20}$/.test(phoneRaw)) {
      return res.status(400).json({ error: "รูปแบบเบอร์โทรไม่ถูกต้อง" });
    }

    if (employment_type && !['company','partner','custom','special_only'].includes(String(employment_type).toLowerCase())) {
      return res.status(400).json({ error: "employment_type ต้องเป็น company / partner / custom / special_only" });
    }

    const compensation_mode = compensation_mode_in ? _normCompMode(compensation_mode_in) : null;
    const daily_wage_amount = (daily_wage_amount_in==null || String(daily_wage_amount_in).trim()==='') ? null : _money(daily_wage_amount_in);
    const monthly_salary_amount = (monthly_salary_amount_in==null || String(monthly_salary_amount_in).trim()==='') ? null : _money(monthly_salary_amount_in);
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
         customer_slot_visible = COALESCE($9, public.technician_profiles.customer_slot_visible),
         compensation_mode = COALESCE($10, public.technician_profiles.compensation_mode),
         daily_wage_amount = COALESCE($11, public.technician_profiles.daily_wage_amount),
         monthly_salary_amount = COALESCE($12, public.technician_profiles.monthly_salary_amount),
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
        hasCustomerSlotVisible ? customer_slot_visible : null,
        compensation_mode,
        daily_wage_amount,
        monthly_salary_amount,
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
// 🧩 ADMIN: Technician Service Matrix (Option B)
// - กำหนดว่า ช่างคนไหนรับงานประเภทไหน/แอร์ประเภทไหน/วิธีล้างอะไรได้บ้าง
// - Default (no record): allow all (backward compatible)
// =======================================
app.get("/admin/technicians/:username/service-matrix", requireAdminSession, async (req, res) => {
  try {
    const username = String(req.params.username || '').trim();
    const r = await pool.query(
      `SELECT username, matrix_json, updated_by, updated_at
       FROM public.technician_service_matrix
       WHERE username=$1`,
      [username]
    );
    if (!r.rows || !r.rows.length) {
      return res.json({ username, matrix_json: {}, updated_by: null, updated_at: null });
    }
    return res.json(r.rows[0]);
  } catch (e) {
    console.error('GET service-matrix error:', e);
    return res.status(500).json({ error: 'โหลดสิทธิ์งานของช่างไม่สำเร็จ' });
  }
});

app.put("/admin/technicians/:username/service-matrix", requireAdminSession, async (req, res) => {
  try {
    const username = String(req.params.username || '').trim();
    const matrix_json = req.body?.matrix_json ?? req.body?.matrix ?? {};
    // Minimal validation (fail-open): accept object only
    if (matrix_json == null || typeof matrix_json !== 'object' || Array.isArray(matrix_json)) {
      return res.status(400).json({ error: 'matrix_json ต้องเป็น Object' });
    }
    const updated_by = String(req?.actor?.username || req?.auth?.username || 'admin').trim();
    await pool.query(
      `INSERT INTO public.technician_service_matrix(username, matrix_json, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, NOW())
       ON CONFLICT (username) DO UPDATE SET
         matrix_json = EXCLUDED.matrix_json,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()`,
      [username, JSON.stringify(matrix_json), updated_by]
    );
    return res.json({ ok: true });
  } catch (e) {
    console.error('PUT service-matrix error:', e);
    return res.status(500).json({ error: 'บันทึกสิทธิ์งานของช่างไม่สำเร็จ' });
  }
});

// =======================================
// 🧑‍🔧 TECH: Service Matrix (Self-Config)
// - ช่างสามารถเลือกเองได้ว่า รับงานอะไร/แอร์ประเภทไหน/วิธีล้างอะไร (ใช้คัดกรองสลอตหน้าลูกค้า)
// - ถ้าไม่ติ๊กอะไรเลย => ไม่แสดงสลอตหน้าลูกค้า (ตามสเปก)
// =======================================
app.get('/tech/service-matrix', requireTechnicianSession, async (req, res) => {
  try {
    const username = req.effective?.username;
    const r = await pool.query(
      `SELECT matrix_json FROM public.technician_service_matrix WHERE username=$1 LIMIT 1`,
      [username]
    );
    const row = (r.rows || [])[0] || null;
    return res.json({ ok: true, username, matrix_json: row?.matrix_json || {} });
  } catch (e) {
    console.error('GET tech service-matrix error:', e);
    return res.status(500).json({ error: 'โหลดไม่สำเร็จ' });
  }
});

app.put('/tech/service-matrix', requireTechnicianSession, async (req, res) => {
  try {
    const username = req.effective?.username;
    const matrix_json = (req.body && req.body.matrix_json) ? req.body.matrix_json : {};
    // minimal validation (shape)
    const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
    if (!isObj(matrix_json)) return res.status(400).json({ error: 'matrix_json ต้องเป็น object' });

    await pool.query(
      `INSERT INTO public.technician_service_matrix (username, matrix_json, updated_by)
       VALUES ($1,$2,$3)
       ON CONFLICT (username) DO UPDATE SET
         matrix_json = EXCLUDED.matrix_json,
         updated_by = EXCLUDED.updated_by,
         updated_at = CURRENT_TIMESTAMP`,
      [username, matrix_json, username]
    );
    return res.json({ ok: true });
  } catch (e) {
    console.error('PUT tech service-matrix error:', e);
    return res.status(500).json({ error: 'บันทึกไม่สำเร็จ' });
  }
});

// Admin: add/list special availability slots per technician (v2)
app.get("/admin/technicians/:username/special_slots_v2", requireAdminSession, async (req, res) => {
  try {
    const username = (req.params.username || "").toString();
    const date = (req.query.date || new Date().toISOString().slice(0,10)).toString();
    const r = await pool.query(
      `SELECT slot_id, slot_date, start_time, end_time, created_at
       FROM public.technician_special_slots_v2
       WHERE technician_username=$1 AND slot_date=$2::date
       ORDER BY start_time ASC`,
      [username, date]
    );
    res.json({ username, date, slots: r.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "โหลดสลอตพิเศษไม่สำเร็จ" });
  }
});

app.post("/admin/technicians/:username/special_slots_v2", requireAdminSession, async (req, res) => {
  try {
    const username = (req.params.username || "").toString();
    const slot_date = (req.body.date || req.body.slot_date || new Date().toISOString().slice(0,10)).toString();
    const start_time_raw = (req.body.start_time || "").toString();
    const end_time_raw = (req.body.end_time || "").toString();
    if (!/^\d{1,2}:\d{2}$/.test(start_time_raw) || !/^\d{1,2}:\d{2}$/.test(end_time_raw)) {
      return res.status(400).json({ error: "เวลาไม่ถูกต้อง (HH:MM)" });
    }
    // Normalize HH:MM (end_time is clamped at 24:00 to avoid invalid JS Date parsing)
    const norm = (hhmm, allow24) => {
      const m = String(hhmm).match(/^([0-9]{1,2}):([0-9]{2})$/);
      if (!m) return null;
      let h = Number(m[1]);
      let mm = Number(m[2]);
      if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
      if (mm < 0 || mm > 59) return null;
      if (allow24) {
        if (h > 24) { h = 24; mm = 0; }
        if (h === 24 && mm > 0) { mm = 0; }
      } else {
        if (h < 0 || h > 23) return null;
      }
      const pad = (n)=>String(n).padStart(2,'0');
      return `${pad(h)}:${pad(mm)}`;
    };
    const start_time = norm(start_time_raw, false);
    const end_time = norm(end_time_raw, true);
    if (!start_time || !end_time) {
      return res.status(400).json({ error: "เวลาไม่ถูกต้อง (HH:MM)" });
    }
    if (toMin(end_time) <= toMin(start_time)) {
      return res.status(400).json({ error: "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม" });
    }
    await pool.query(
      `INSERT INTO public.technician_special_slots_v2 (technician_username, slot_date, start_time, end_time)
       VALUES ($1, $2::date, $3, $4)`,
      [username, slot_date, start_time, end_time]
    );
    console.log("[admin_special_slot_v2]", { username, slot_date, start_time, end_time });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "เพิ่มสลอตพิเศษไม่สำเร็จ" });
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


app.post("/admin/technicians/:username/photo", requireAdminSession, upload.single("photo"), async (req, res) => {
  try {
    const username = req.params.username;
    if (!req.file) return res.status(400).json({ error: "ไม่มีไฟล์รูป" });

    // ✅ Store technician profile photo on Cloudinary to prevent loss after deploy
    let photo_path = null;
    if (CLOUDINARY_ENABLED) {
      const up = await uploadTechProfileToCloudinary(req.file, { username, folderSuffix: 'profiles' });
      photo_path = up?.url || null;
    } else {
      photo_path = saveUploadedFile(req.file, TECH_PROFILE_DIR, username);
    }
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
// 📘 ADMIN ACCOUNTING (Phase 1 read-only)
// =======================================
function _maskPhone(phone) {
  const s = String(phone || '').replace(/\D/g, '');
  if (s.length < 7) return phone ? 'xxx' : '';
  return `${s.slice(0, 3)}xxx${s.slice(-4)}`;
}

function _accountingCard(key, label, count = 0, total_amount = null, tone = 'blue', target_tab = 'overview') {
  return { key, label, count: Number(count || 0), total_amount: total_amount == null ? null : _money(total_amount), status_key: tone, target_tab };
}

function _accountingRevenueStatus(row = {}) {
  const raw = String(row.payment_status || row.raw_payment_status || '').trim().toLowerCase();
  if (raw === 'paid' || row.paid_at) return 'paid';
  if (raw === 'partial') return 'partial';
  return 'unpaid';
}

async function _accountingSafeQuery(soft_errors, label, sql, params = [], fallbackRows = []) {
  try {
    return await pool.query(sql, params);
  } catch (e) {
    soft_errors.push({ scope: label, message: String(e?.message || e) });
    return { rows: fallbackRows };
  }
}

app.get('/admin/accounting/summary', requireAccountingPermission('accounting.read.summary'), async (req, res) => {
  const soft_errors = [];
  try {
    const waitingReceipts = await _accountingSafeQuery(soft_errors, 'waiting_receipts',
      `WITH gross AS (
         SELECT j.job_id, COALESCE(NULLIF(SUM(COALESCE(ji.line_total,0)),0), COALESCE(j.job_price,0), 0) AS total_amount
           FROM public.jobs j
           LEFT JOIN public.job_items ji ON CAST(ji.job_id AS TEXT)=CAST(j.job_id AS TEXT)
          WHERE ${_sqlDonePredicate('j')}
            AND j.finished_at IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM public.accounting_documents d
               WHERE d.job_id=j.job_id AND d.document_type='receipt' AND COALESCE(d.status,'') <> 'voided'
            )
          GROUP BY j.job_id, j.job_price
       )
       SELECT COUNT(*)::int AS count, COALESCE(SUM(total_amount),0)::numeric AS total_amount FROM gross`);

    const unpaidRevenue = await _accountingSafeQuery(soft_errors, 'unpaid_revenue',
      `WITH gross AS (
         SELECT j.job_id, COALESCE(NULLIF(SUM(COALESCE(ji.line_total,0)),0), COALESCE(j.job_price,0), 0) AS total_amount
           FROM public.jobs j
           LEFT JOIN public.job_items ji ON CAST(ji.job_id AS TEXT)=CAST(j.job_id AS TEXT)
          WHERE ${_sqlDonePredicate('j')}
            AND j.finished_at IS NOT NULL
            AND NOT (COALESCE(j.payment_status,'unpaid') = 'paid' OR j.paid_at IS NOT NULL)
          GROUP BY j.job_id, j.job_price
       )
       SELECT COUNT(*)::int AS count, COALESCE(SUM(total_amount),0)::numeric AS total_amount FROM gross`);

    const waitingProof = await _accountingSafeQuery(soft_errors, 'waiting_payment_proof',
      `WITH gross AS (
         SELECT j.job_id, COALESCE(NULLIF(SUM(COALESCE(ji.line_total,0)),0), COALESCE(j.job_price,0), 0) AS total_amount
           FROM public.jobs j
           LEFT JOIN public.job_items ji ON CAST(ji.job_id AS TEXT)=CAST(j.job_id AS TEXT)
          WHERE ${_sqlDonePredicate('j')}
            AND j.finished_at IS NOT NULL
            AND (COALESCE(j.payment_status,'unpaid')='paid' OR j.paid_at IS NOT NULL)
            AND NOT EXISTS (
              SELECT 1 FROM public.job_photos p
               WHERE p.job_id=j.job_id AND COALESCE(p.phase,'')='payment_slip' AND COALESCE(p.public_url,'') <> ''
            )
          GROUP BY j.job_id, j.job_price
       )
       SELECT COUNT(*)::int AS count, COALESCE(SUM(total_amount),0)::numeric AS total_amount FROM gross`);

    const payoutPending = await _accountingSafeQuery(soft_errors, 'pending_payout_periods',
      `WITH period_sum AS (
         SELECT p.payout_id,
                COALESCE(SUM(l.earn_amount),0) AS gross_amount,
                COALESCE(adj.adj_total,0) AS adj_total,
                COALESCE(dep.deposit_deduction_amount,0) AS deposit_deduction_amount,
                COALESCE(pay.paid_amount,0) AS paid_amount
           FROM public.technician_payout_periods p
           LEFT JOIN public.technician_payout_lines l ON l.payout_id=p.payout_id
           LEFT JOIN (SELECT payout_id, SUM(adj_amount) AS adj_total FROM public.technician_payout_adjustments GROUP BY payout_id) adj ON adj.payout_id=p.payout_id
           LEFT JOIN (SELECT payout_id, SUM(amount) AS deposit_deduction_amount FROM public.technician_deposit_ledger WHERE transaction_type='collect' GROUP BY payout_id) dep ON dep.payout_id=p.payout_id
           LEFT JOIN (SELECT payout_id, SUM(paid_amount) AS paid_amount FROM public.technician_payout_payments GROUP BY payout_id) pay ON pay.payout_id=p.payout_id
          WHERE COALESCE(p.status,'draft') <> 'paid'
          GROUP BY p.payout_id, adj.adj_total, dep.deposit_deduction_amount, pay.paid_amount
       )
       SELECT COUNT(*)::int AS count,
              COALESCE(SUM(gross_amount + adj_total - deposit_deduction_amount - paid_amount),0)::numeric AS total_amount
         FROM period_sum`);

    const pendingExpenses = await _accountingSafeQuery(soft_errors, 'pending_expenses',
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount),0)::numeric AS total_amount FROM public.accounting_expenses WHERE status IN ('draft','submitted')`);
    const pendingDocuments = await _accountingSafeQuery(soft_errors, 'pending_documents',
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(total_amount),0)::numeric AS total_amount FROM public.accounting_documents WHERE status='draft'`);
    const recentAudit = await _accountingSafeQuery(soft_errors, 'recent_audit',
      `SELECT id, actor_username, actor_role, action, entity_type, entity_id, created_at, note FROM public.accounting_audit_log ORDER BY created_at DESC LIMIT 10`);
    const docs = await _accountingSafeQuery(soft_errors, 'documents',
      `SELECT document_id, document_no, document_type, status, job_id, customer_name, issue_date, total_amount, created_at FROM public.accounting_documents ORDER BY created_at DESC LIMIT 30`);
    const expenses = await _accountingSafeQuery(soft_errors, 'expenses',
      `SELECT expense_id, expense_date, category, vendor_name, description, amount, vat_amount, withholding_amount, status, created_at FROM public.accounting_expenses ORDER BY expense_date DESC, created_at DESC LIMIT 30`);

    const wr = waitingReceipts.rows[0] || {};
    const ur = unpaidRevenue.rows[0] || {};
    const wp = waitingProof.rows[0] || {};
    const pp = payoutPending.rows[0] || {};
    const pe = pendingExpenses.rows[0] || {};
    const pd = pendingDocuments.rows[0] || {};
    return res.json({
      ok: true,
      cards: [
        _accountingCard('waiting_receipts', 'รอออกใบเสร็จ', wr.count, wr.total_amount, 'yellow', 'documents'),
        _accountingCard('unpaid_revenue', 'ค้างรับเงิน', ur.count, ur.total_amount, 'red', 'revenue'),
        _accountingCard('waiting_payment_proof', 'รอแนบหลักฐานรับเงิน', wp.count, wp.total_amount, 'sky', 'revenue'),
        _accountingCard('pending_payout_periods', 'งวดจ่ายช่างค้างจ่าย', pp.count, pp.total_amount, 'blue', 'payouts'),
        _accountingCard('pending_expenses', 'รายจ่ายรอตรวจ', pe.count, pe.total_amount, 'orange', 'expenses'),
        _accountingCard('pending_documents', 'เอกสารรอตรวจ', pd.count, pd.total_amount, 'purple', 'documents'),
        _accountingCard('recommended_exports', 'รายงานที่ควร Export', 6, null, 'green', 'reports'),
      ],
      recent_audit: recentAudit.rows,
      documents: docs.rows,
      expenses: expenses.rows,
      soft_errors,
    });
  } catch (e) {
    console.error('GET /admin/accounting/summary', e);
    return res.status(500).json({ ok: false, cards: [], recent_audit: [], documents: [], expenses: [], soft_errors: [{ scope: 'summary', message: e.message }] });
  }
});

app.get('/admin/accounting/revenue', requireAccountingPermission('accounting.read.revenue'), async (req, res) => {
  const soft_errors = [];
  try {
    const q = await _accountingSafeQuery(soft_errors, 'revenue',
      `WITH gross AS (
         SELECT j.job_id, COALESCE(NULLIF(SUM(COALESCE(ji.line_total,0)),0), COALESCE(j.job_price,0), 0)::numeric AS gross_sales_amount
           FROM public.jobs j
           LEFT JOIN public.job_items ji ON CAST(ji.job_id AS TEXT)=CAST(j.job_id AS TEXT)
          WHERE ${_sqlDonePredicate('j')} AND j.finished_at IS NOT NULL
          GROUP BY j.job_id, j.job_price
       ),
       proof AS (
         SELECT DISTINCT ON (job_id) job_id, public_url
           FROM public.job_photos
          WHERE COALESCE(phase,'')='payment_slip' AND COALESCE(public_url,'') <> ''
          ORDER BY job_id, COALESCE(uploaded_at, created_at) DESC
       ),
       doc AS (
         SELECT job_id, jsonb_object_agg(document_type, status ORDER BY created_at DESC) AS document_status
           FROM public.accounting_documents
          WHERE COALESCE(status,'') <> 'voided'
          GROUP BY job_id
       )
       SELECT j.job_id, j.booking_code, j.finished_at,
              COALESCE(j.customer_name,'') AS customer_name,
              COALESCE(j.customer_phone,'') AS customer_phone,
              g.gross_sales_amount,
              COALESCE(j.payment_status,'unpaid') AS raw_payment_status,
              j.paid_at,
              j.paid_by,
              j.payment_method,
              j.payment_reference,
              COALESCE(doc.document_status, '{}'::jsonb) AS document_status,
              proof.public_url AS payment_proof_url
         FROM gross g
         JOIN public.jobs j ON j.job_id=g.job_id
         LEFT JOIN proof ON proof.job_id=j.job_id
         LEFT JOIN doc ON doc.job_id=j.job_id
        ORDER BY j.finished_at DESC
        LIMIT 200`);
    const rows = q.rows.map(r => {
      const doc = r.document_status || {};
      return {
        job_id: r.job_id,
        booking_code: r.booking_code,
        finished_at: r.finished_at,
        customer_name: r.customer_name,
        masked_customer_phone: _maskPhone(r.customer_phone),
        gross_sales_amount: r.gross_sales_amount,
        payment_status: _accountingRevenueStatus(r),
        raw_payment_status: r.raw_payment_status,
        paid_at: r.paid_at,
        paid_by: r.paid_by,
        payment_method: r.payment_method,
        payment_reference: r.payment_reference,
        document_status: doc,
        payment_proof_url: r.payment_proof_url,
        action_label: Object.keys(doc).length ? 'ดูรายละเอียด' : 'ออกเอกสาร',
      };
    });
    return res.json({ ok: true, rows, soft_errors });
  } catch (e) {
    console.error('GET /admin/accounting/revenue', e);
    return res.status(500).json({ ok: false, rows: [], soft_errors: [{ scope: 'revenue', message: e.message }] });
  }
});

app.post('/admin/accounting/revenue/:job_id/mark-paid', requireAccountingPermission('accounting_manage_revenue'), async (req, res) => {
  try {
    const job_id = String(req.params.job_id || '').trim();
    const body = req.body || {};
    if (!job_id) return res.status(400).json({ ok: false, error: 'MISSING_JOB_ID' });
    if (!/^\d+$/.test(job_id)) return res.status(400).json({ ok: false, error: 'INVALID_JOB_ID' });
    if (body.confirm_received !== true) return res.status(400).json({ ok: false, error: 'CONFIRM_RECEIVED_REQUIRED' });

    const beforeQ = await pool.query(
      `SELECT job_id, booking_code, job_status, finished_at, canceled_at, payment_status, paid_at, paid_by,
              payment_method, payment_reference, payment_note,
              (${_sqlDonePredicate('j')}) AS is_completed
         FROM public.jobs j
        WHERE j.job_id=$1
        LIMIT 1`,
      [job_id]
    );
    const before = beforeQ.rows[0];
    if (!before) return res.status(404).json({ ok: false, error: 'JOB_NOT_FOUND' });
    const st = String(before.job_status || '').trim().toLowerCase();
    if (before.canceled_at || ['ยกเลิก', 'cancelled', 'canceled'].includes(st)) {
      return res.status(409).json({ ok: false, error: 'CANNOT_MARK_CANCELED_JOB_PAID' });
    }
    const actor = _accountingActor(req);
    if (!before.is_completed && actor.role !== 'super_admin') {
      return res.status(409).json({ ok: false, error: 'JOB_NOT_COMPLETED' });
    }
    if (!before.is_completed && body.confirm_non_completed !== true) {
      return res.status(400).json({ ok: false, error: 'CONFIRM_NON_COMPLETED_REQUIRED' });
    }

    const payment_method = String(body.payment_method || '').trim() || null;
    const payment_reference = String(body.payment_reference || '').trim() || null;
    const payment_note = String(body.note || '').trim() || null;

    await pool.query(
      `UPDATE public.jobs
          SET payment_status='paid',
              paid_at=COALESCE(paid_at, NOW()),
              paid_by=$2,
              payment_method=COALESCE($3, payment_method),
              payment_reference=COALESCE($4, payment_reference),
              payment_note=COALESCE($5, payment_note)
        WHERE job_id=$1`,
      [job_id, actor.username || null, payment_method, payment_reference, payment_note]
    );

    const afterQ = await pool.query(
      `SELECT job_id, booking_code, job_status, finished_at, payment_status, paid_at, paid_by,
              payment_method, payment_reference, payment_note
         FROM public.jobs
        WHERE job_id=$1
        LIMIT 1`,
      [job_id]
    );
    const after = afterQ.rows[0] || null;
    await logAccountingAudit(req, {
      action: 'MARK_REVENUE_PAID',
      entity_type: 'job',
      entity_id: job_id,
      before_json: before,
      after_json: after,
      note: payment_note || payment_reference || payment_method || null,
    });
    return res.json({ ok: true, job_id, payment_status: 'paid', row: after });
  } catch (e) {
    console.error('POST /admin/accounting/revenue/:job_id/mark-paid', e);
    return res.status(500).json({ ok: false, error: 'MARK_REVENUE_PAID_FAILED' });
  }
});

app.get('/admin/accounting/payouts', requireAccountingPermission('accounting.read.payouts'), async (req, res) => {
  const soft_errors = [];
  try {
    const q = await _accountingSafeQuery(soft_errors, 'payouts',
      `WITH line_sum AS (
         SELECT payout_id, COUNT(DISTINCT technician_username)::int AS technician_count, COALESCE(SUM(earn_amount),0)::numeric AS gross_amount
           FROM public.technician_payout_lines GROUP BY payout_id
       ),
       adj AS (SELECT payout_id, COALESCE(SUM(adj_amount),0)::numeric AS adj_total FROM public.technician_payout_adjustments GROUP BY payout_id),
       dep AS (SELECT payout_id, COALESCE(SUM(amount),0)::numeric AS deposit_deduction_amount FROM public.technician_deposit_ledger WHERE transaction_type='collect' GROUP BY payout_id),
       pay AS (SELECT payout_id, COALESCE(SUM(paid_amount),0)::numeric AS paid_amount FROM public.technician_payout_payments GROUP BY payout_id)
       SELECT p.payout_id, p.period_type, p.period_start, p.period_end, p.status,
              COALESCE(line_sum.technician_count,0)::int AS technician_count,
              COALESCE(line_sum.gross_amount,0)::numeric AS gross_amount,
              COALESCE(dep.deposit_deduction_amount,0)::numeric AS deposit_deduction_amount,
              COALESCE(adj.adj_total,0)::numeric AS adj_total,
              (COALESCE(line_sum.gross_amount,0) + COALESCE(adj.adj_total,0) - COALESCE(dep.deposit_deduction_amount,0))::numeric AS net_payable,
              COALESCE(pay.paid_amount,0)::numeric AS paid_amount,
              GREATEST(0, COALESCE(line_sum.gross_amount,0) + COALESCE(adj.adj_total,0) - COALESCE(dep.deposit_deduction_amount,0) - COALESCE(pay.paid_amount,0))::numeric AS remaining_amount
         FROM public.technician_payout_periods p
         LEFT JOIN line_sum ON line_sum.payout_id=p.payout_id
         LEFT JOIN adj ON adj.payout_id=p.payout_id
         LEFT JOIN dep ON dep.payout_id=p.payout_id
         LEFT JOIN pay ON pay.payout_id=p.payout_id
        ORDER BY p.period_start DESC, p.payout_id DESC
        LIMIT 80`);
    return res.json({ ok: true, rows: q.rows, note: 'ระบบไม่โอนเงินอัตโนมัติ กรุณาโอนเงินจริงก่อน แล้วจึงบันทึกจ่ายแล้ว', soft_errors });
  } catch (e) {
    console.error('GET /admin/accounting/payouts', e);
    return res.status(500).json({ ok: false, rows: [], note: '', soft_errors: [{ scope: 'payouts', message: e.message }] });
  }
});

app.get('/admin/accounting/payouts/:payout_id/techs', requireAccountingPermission('accounting.read.payouts'), async (req, res) => {
  try {
    const payout_id = String(req.params.payout_id || '').trim();
    if (!payout_id) return res.status(400).json({ ok: false, error: 'MISSING_PAYOUT_ID', rows: [] });
    const payload = await _buildPayoutTechSummaryRows(payout_id);
    if (!payload.period) return res.status(404).json({ ok: false, error: 'PAYOUT_NOT_FOUND', rows: [] });
    const pays = await pool.query(
      `SELECT technician_username, paid_amount, paid_status, paid_at, paid_by, slip_url, note,
              payment_method, payment_reference
         FROM public.technician_payout_payments
        WHERE payout_id=$1`,
      [payout_id]
    );
    const payMap = new Map((pays.rows || []).map(r => [String(r.technician_username || ''), r]));
    const rows = (payload.techs || []).map(t => {
      const p = payMap.get(String(t.technician_username || '')) || {};
      const paid_amount = _money(p.paid_amount == null ? t.paid_amount : p.paid_amount);
      const net_amount = _money(t.net_amount);
      return {
        technician_username: t.technician_username,
        job_count: Number(t.jobs_count || t.job_count || 0),
        gross_amount: _money(t.gross_amount),
        deposit_deduction_amount: _money(t.deposit_deduction_amount),
        adj_total: _money(t.adj_total),
        net_amount,
        paid_amount,
        remaining_amount: _money(Math.max(0, Number(net_amount || 0) - Number(paid_amount || 0))),
        paid_status: _paidStatus(net_amount, paid_amount),
        paid_at: p.paid_at || null,
        paid_by: p.paid_by || null,
        slip_url: p.slip_url || null,
        note: p.note || null,
        payment_method: p.payment_method || null,
        payment_reference: p.payment_reference || null,
      };
    });
    return res.json({ ok: true, payout_id, period: payload.period, source: payload.source, rows, soft_errors: [] });
  } catch (e) {
    console.error('GET /admin/accounting/payouts/:payout_id/techs', e);
    return res.status(500).json({ ok: false, rows: [], soft_errors: [{ scope: 'payout_techs', message: e.message }] });
  }
});

app.post('/admin/accounting/payouts/:payout_id/pay', requireAccountingPermission('accounting_mark_payout_paid'), async (req, res) => {
  try {
    const payout_id = String(req.params.payout_id || '').trim();
    const body = req.body || {};
    const tech = String(body.technician_username || '').trim();
    const paidNow = _money(body.paid_amount);
    if (!payout_id) return res.status(400).json({ ok: false, error: 'MISSING_PAYOUT_ID' });
    if (!tech) return res.status(400).json({ ok: false, error: 'MISSING_TECHNICIAN_USERNAME' });
    if (body.confirm_paid !== true) return res.status(400).json({ ok: false, error: 'CONFIRM_PAID_REQUIRED' });
    if (Number(paidNow || 0) <= 0) return res.status(400).json({ ok: false, error: 'INVALID_PAID_AMOUNT' });

    const beforeTotals = await _getTechGrossAdjNet(payout_id, tech);
    const beforePayQ = await pool.query(
      `SELECT paid_amount, paid_status, paid_at, paid_by, slip_url, note, payment_method, payment_reference
         FROM public.technician_payout_payments
        WHERE payout_id=$1 AND technician_username=$2
        LIMIT 1`,
      [payout_id, tech]
    );
    const beforePayment = beforePayQ.rows[0] || null;
    const currentPaid = Number(beforePayment?.paid_amount || 0);
    const remaining = Math.max(0, Number(beforeTotals.net_amount || 0) - currentPaid);
    if (remaining <= 0.0001) return res.status(409).json({ ok: false, error: 'PAYOUT_ALREADY_PAID' });
    if (Number(paidNow) - remaining > 0.01) return res.status(400).json({ ok: false, error: 'PAID_AMOUNT_EXCEEDS_REMAINING', remaining_amount: _money(remaining) });

    const payment_method = String(body.payment_method || '').trim() || null;
    const payment_reference = String(body.payment_reference || '').trim() || null;
    const note = String(body.note || '').trim() || null;
    const slip_url = String(body.slip_url || '').trim() || null;
    const cumulativePaid = _money(currentPaid + Number(paidNow));
    const result = await _upsertPaymentAndMaybeMarkPaid(payout_id, tech, cumulativePaid, slip_url, note, _accountingActor(req).username || null);

    await pool.query(
      `UPDATE public.technician_payout_payments
          SET payment_method=COALESCE($3, payment_method),
              payment_reference=COALESCE($4, payment_reference)
        WHERE payout_id=$1 AND technician_username=$2`,
      [payout_id, tech, payment_method, payment_reference]
    );

    const afterPayQ = await pool.query(
      `SELECT paid_amount, paid_status, paid_at, paid_by, slip_url, note, payment_method, payment_reference
         FROM public.technician_payout_payments
        WHERE payout_id=$1 AND technician_username=$2
        LIMIT 1`,
      [payout_id, tech]
    );
    const afterTotals = await _getTechGrossAdjNet(payout_id, tech);
    await logAccountingAudit(req, {
      action: 'MARK_PAYOUT_PAID',
      entity_type: 'technician_payout_payment',
      entity_id: `${payout_id}:${tech}`,
      before_json: { totals: beforeTotals, payment: beforePayment },
      after_json: { totals: afterTotals, payment: afterPayQ.rows[0] || null },
      note: note || payment_reference || payment_method || null,
    });

    return res.json({
      ok: true,
      payout_id,
      technician_username: tech,
      paid_amount: cumulativePaid,
      paid_status: result.paid_status,
      net_amount: result.net_amount,
      payment: afterPayQ.rows[0] || null,
    });
  } catch (e) {
    console.error('POST /admin/accounting/payouts/:payout_id/pay', e);
    if (String(e.code || '') === 'PAYOUT_NOT_FOUND') return res.status(404).json({ ok: false, error: 'PAYOUT_NOT_FOUND' });
    if (String(e.code || '') === 'PAYOUT_ALREADY_PAID') return res.status(409).json({ ok: false, error: 'PAYOUT_ALREADY_PAID' });
    return res.status(500).json({ ok: false, error: 'MARK_PAYOUT_PAID_FAILED' });
  }
});

app.get('/admin/accounting/deposits', requireAccountingPermission('accounting.read.deposits'), async (req, res) => {
  const soft_errors = [];
  try {
    const q = await _accountingSafeQuery(soft_errors, 'deposits',
      `WITH ledger AS (
         SELECT technician_username,
                COALESCE(SUM(CASE
                  WHEN transaction_type='collect' THEN amount
                  WHEN transaction_type='manual_adjust' THEN amount
                  WHEN transaction_type IN ('refund','claim_deduct') THEN -amount
                  ELSE 0 END),0)::numeric AS collected_total,
                MAX(created_at) AS latest_at
           FROM public.technician_deposit_ledger
          GROUP BY technician_username
       )
       SELECT COALESCE(a.technician_username, ledger.technician_username) AS technician_username,
              COALESCE(a.target_amount,5000)::numeric AS target_amount,
              COALESCE(ledger.collected_total,0)::numeric AS collected_total,
              GREATEST(0, COALESCE(a.target_amount,5000) - COALESCE(ledger.collected_total,0))::numeric AS remaining_amount,
              ledger.latest_at
         FROM public.technician_deposit_accounts a
         FULL OUTER JOIN ledger ON ledger.technician_username=a.technician_username
        ORDER BY collected_total DESC, technician_username ASC`);
    const ledger = await _accountingSafeQuery(soft_errors, 'deposit_ledger',
      `SELECT ledger_id, technician_username, payout_id, transaction_type, amount, note, created_at, created_by
         FROM public.technician_deposit_ledger
        ORDER BY created_at DESC
        LIMIT 80`);
    const totalHeld = q.rows.reduce((sum, r) => sum + Number(r.collected_total || 0), 0);
    return res.json({ ok: true, total_deposit_held: _money(totalHeld), rows: q.rows, ledger: ledger.rows, note: 'เงินประกันไม่ใช่กำไรบริษัท', soft_errors });
  } catch (e) {
    console.error('GET /admin/accounting/deposits', e);
    return res.status(500).json({ ok: false, total_deposit_held: 0, rows: [], ledger: [], note: 'เงินประกันไม่ใช่กำไรบริษัท', soft_errors: [{ scope: 'deposits', message: e.message }] });
  }
});

app.get('/admin/accounting/audit', requireAccountingPermission('accounting.read.audit'), async (req, res) => {
  const soft_errors = [];
  try {
    const action = String(req.query.action || '').trim();
    const entity = String(req.query.entity_type || '').trim();
    const params = [];
    const where = [];
    if (action) { params.push(action); where.push(`action=$${params.length}`); }
    if (entity) { params.push(entity); where.push(`entity_type=$${params.length}`); }
    const q = await _accountingSafeQuery(soft_errors, 'audit',
      `SELECT id, actor_username, actor_role, action, entity_type, entity_id, created_at, note
         FROM public.accounting_audit_log
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY created_at DESC
        LIMIT 120`,
      params);
    return res.json({ ok: true, rows: q.rows, soft_errors });
  } catch (e) {
    console.error('GET /admin/accounting/audit', e);
    return res.status(500).json({ ok: false, rows: [], soft_errors: [{ scope: 'audit', message: e.message }] });
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

function getNowBangkokParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  return {
    dateStr: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour || 0),
    minute: Number(map.minute || 0),
  };
}

function getNowBangkokMin() {
  const p = getNowBangkokParts();
  return p.hour * 60 + p.minute;
}
function computeDurationMin(payload = {}, opts = {}) {
  const src = opts.source || "unknown";
  const job_type_raw = String(payload.job_type || payload.jobType || "").trim();
  const job_type = job_type_raw;
  const ac_type = String(payload.ac_type || payload.acType || "").trim();
  const wash_variant = String(payload.wash_variant || payload.washVariant || "").trim();
  const repair_variant = String(payload.repair_variant || payload.repairVariant || "").trim();
  const machine_count = Math.max(1, Number(payload.machine_count || payload.machineCount || 1));
  const admin_override = Number(payload.admin_override_duration_min || payload.adminOverrideDurationMin || 0);

  let duration = 0;

  // Helper: step-rate for "บ้านเดียวหลายเครื่อง"
  // duration = first + (n-1)*next
  const step = (first, next) => {
    const n = machine_count;
    if (n <= 1) return first;
    return first + (n - 1) * next;
  };

  if (job_type === "ล้าง") {
    // ✅ กติกาเวลางาน CWF (ตามที่ล็อคไว้)
    if (ac_type === "ผนัง" || !ac_type) {
      if (wash_variant === "ล้างพรีเมียม") duration = step(80, 50);
      else if (wash_variant === "ล้างแขวนคอยน์") duration = step(120, 90);
      else if (wash_variant === "ล้างแบบตัดล้าง" || wash_variant === "ตัดล้างใหญ่" || wash_variant === "ล้างแบบตัดล้างใหญ่") duration = step(180, 120);
      else duration = step(60, 40); // ล้างธรรมดา
    } else {
      // แอร์สี่ทิศทาง / แขวน / เปลือยใต้ฝ้า
      duration = step(120, 90);
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
  const ac_type_raw = String(payload.ac_type || "").trim();
  const ac_type = (ac_type_raw === "ใต้ฝ้า") ? "เปลือยใต้ฝ้า" : ac_type_raw;
  const wash_variant = String(payload.wash_variant || "").trim();
  const repair_variant = String(payload.repair_variant || "").trim();
  const machine_count = Math.max(1, Number(payload.machine_count || 1));
  const btu = Number(payload.btu || 0);

  if (job_type === "ติดตั้ง") return 0;

  if (job_type === "ซ่อม") {
    if (repair_variant === "ตรวจเช็ครั่ว") return 1000;
    return 700;
  }

  if (job_type !== "ล้าง") return 0;

  const qty = machine_count;

  if (ac_type === "ผนัง" || !ac_type) {
    const tier18000 = Number.isFinite(btu) && btu >= 18000;
    if (!tier18000) {
      if (wash_variant === "ล้างพรีเมียม") return 900 * qty;
      if (wash_variant === "ล้างแขวนคอยน์") return 1400 * qty;
      if (wash_variant === "ล้างแบบตัดล้าง" || wash_variant === "ตัดล้างใหญ่") return 2000 * qty;
      return 600 * qty;
    } else {
      if (wash_variant === "ล้างพรีเมียม") return 1100 * qty;
      if (wash_variant === "ล้างแขวนคอยน์") return 1700 * qty;
      if (wash_variant === "ล้างแบบตัดล้าง" || wash_variant === "ตัดล้างใหญ่") return 2300 * qty;
      return 750 * qty;
    }
  }

  if (ac_type === "สี่ทิศทาง") {
    return 1500 * qty;
  }

  if (ac_type === "แขวน") {
    return 1200 * qty;
  }

  if (ac_type === "เปลือยใต้ฝ้า") {
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
      assigned_to: (s.assigned_to || s.assigned_technician_username || null) ? String(s.assigned_to || s.assigned_technician_username).trim() : null,
      // IMPORTANT: keep allocations from admin-add-v2.js so server can split job_items per technician.
      // Backward-compatible: accept both `allocations` and legacy `allocation`.
      allocations: (() => {
        const a = s && (s.allocations || s.allocation || null);
        return (a && typeof a === 'object') ? a : null;
      })(),
    }))
    .filter((s) => s.job_type && s.ac_type && Number.isFinite(s.btu) && s.btu > 0 && Number.isFinite(s.machine_count) && s.machine_count > 0);
}

function computeDurationMinMulti(payload = {}, opts = {}) {
  const services = normalizeServicesFromPayload(payload);
  if (!services) return computeDurationMin(payload, opts);

  // If services are assigned to multiple technicians and parallel mode is on,
  // compute duration as max(total duration per tech) to reflect "ทำพร้อมกัน".
  // IMPORTANT (CWF Spec): Availability/Collision must be conservative.
  // - Do NOT reduce duration by team/crew/parallel tricks when deciding "ว่างจริง".
  // - We still keep parallel_by_tech for legacy UI preview, but callers can force conservative.
  const conservative = opts && opts.conservative === true;
  const parallel = !conservative && payload && (payload.parallel_by_tech === true || payload.parallel_by_tech === "true" || payload.parallel_by_tech === 1 || payload.parallel_by_tech === "1");
  const byTech = new Map();
  let total = 0;

  for (const s of services) {
    if (s.job_type === "ล้าง" && (s.ac_type === "ผนัง" || !s.ac_type) && !s.wash_variant) s.wash_variant = "ล้างธรรมดา";
    const d = computeDurationMin(s, opts);
    if (d <= 0) return 0;
    total += d;

    const mc = Math.max(1, Number(s.machine_count || 1));
    const allocations = s && (s.allocations || s.allocation || null);
    if (allocations && typeof allocations === "object") {
      // distribute line duration proportionally by machine count per tech
      const perMachine = d / mc;
      for (const [tech, qty] of Object.entries(allocations)) {
        const q = Math.max(0, Number(qty || 0));
        if (!tech || q <= 0) continue;
        byTech.set(tech, (byTech.get(tech) || 0) + perMachine * q);
      }
    } else {
      const tech = (s.assigned_to || s.assigned_technician_username || "").toString().trim();
      if (tech) byTech.set(tech, (byTech.get(tech) || 0) + d);
    }
  }

  const distinctTech = byTech.size;
  if (parallel && distinctTech >= 2) {
    let mx = 0;
    for (const v of byTech.values()) mx = Math.max(mx, Number(v || 0));
    console.log("[computeDurationMinMulti]", { src: opts.source || "unknown", lines: services.length, parallel: true, distinctTech, max: mx, sum: total });
    return Math.round(mx);
  }

  console.log("[computeDurationMinMulti]", { src: opts.source || "unknown", lines: services.length, parallel: false, conservative, total });
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
    const mc = Math.max(1, Number(s.machine_count || 1));
    const labelParts = [];
    // Build a user-friendly service label per job type (backward compatible)
    if (s.job_type === "ซ่อม") {
      labelParts.push(`ซ่อมแอร์${s.ac_type || ""}`.trim());
      if (s.repair_variant) labelParts.push(s.repair_variant);
    } else if (s.job_type === "ติดตั้ง") {
      labelParts.push(`ติดตั้งแอร์${s.ac_type || ""}`.trim());
    } else {
      // default: wash
      labelParts.push(`ล้างแอร์${s.ac_type || ""}`.trim());
      if (s.ac_type === "ผนัง") labelParts.push(s.wash_variant || "ล้างธรรมดา");
    }
    labelParts.push(`${Number(s.btu || 0)} BTU`);
    labelParts.push(`${Number(s.machine_count || 1)} เครื่อง`);
    const item_name = labelParts.join(" • ");
    const allocations = s && (s.allocations || s.allocation || null);
    if (allocations && typeof allocations === "object") {
      // Split by technician (per-machine), but keep the base item_name stable.
      // The assignee is stored in `assigned_technician_username` (so admin edit UI can show it clearly).
      const perMachine = (mc > 0) ? (linePrice / mc) : linePrice;
      for (const [tech, qty] of Object.entries(allocations)) {
        const q = Math.max(0, Number(qty || 0));
        if (!tech || q <= 0) continue;
        // Keep numeric precision (do not over-round; NUMERIC column supports decimals).
        const unit = Number((Number(perMachine) || 0).toFixed(2));
        items.push({
          item_id: null,
          item_name,
          qty: q,
          unit_price: unit,
          line_total: unit * q,
          is_service: true,
          assigned_technician_username: tech,
        });
      }
    } else {
      // Single assignee or unallocated line: store per-machine pricing for clarity in admin edit/history.
      // This ensures qty reflects machine_count and total remains correct.
      const perMachine = (mc > 0) ? (linePrice / mc) : linePrice;
      const unit = Number((Number(perMachine) || 0).toFixed(2));
      items.push({
        item_id: null,
        item_name,
        qty: mc,
        unit_price: unit,
        line_total: unit * mc,
        is_service: true,
        assigned_technician_username: (s.assigned_to || s.assigned_technician_username || null),
      });
    }
  }
  return items;
}



function effectiveBlockMin(durationMin) {
  return Math.max(0, Number(durationMin || 0)) + TRAVEL_BUFFER_MIN;
}

async function listTechniciansByType(tech_type, opts = {}) {
  const t = (tech_type || "company").toString().trim().toLowerCase();
  const include_paused = !!opts.include_paused;
  // Support tech_type=all (company+partner)
  const isAll = t === 'all';
  // NOTE:
  // - Default behavior (include_paused=false): exclude paused technicians.
  // - Forced lock behavior (include_paused=true): include paused technicians,
  //   but downstream logic (offer flow) should still respect accept_status.
  const r = await pool.query(
    `
    SELECT u.username,
           COALESCE(p.employment_type,'company') AS employment_type,
           COALESCE(p.work_start,'09:00') AS work_start,
           COALESCE(p.work_end,'18:00') AS work_end,
           COALESCE(p.accept_status,'ready') AS accept_status,
           COALESCE(p.weekly_off_days,'') AS weekly_off_days,
           COALESCE(p.customer_slot_visible, TRUE) AS customer_slot_visible
    FROM public.users u
    LEFT JOIN public.technician_profiles p ON p.username=u.username
    WHERE u.role='technician'
      AND ($2::boolean IS TRUE OR COALESCE(p.accept_status,'ready') <> 'paused')
      AND ($3::boolean IS TRUE OR (
            ($1='company' AND COALESCE(p.employment_type,'company') IN ('company','custom','special_only'))
         OR ($1<>'company' AND COALESCE(p.employment_type,'company') = $1)
      ))
    ORDER BY u.username
    `,
    [t, include_paused, isAll]
  );
  // Fallback (fail-open): if filtering by employment_type yields 0 technicians,
  // return all technicians that are not paused. This prevents the UI from showing
  // all slots "เต็ม" when profiles haven't been backfilled yet.
  if ((r.rows || []).length === 0) {
    try {
      const r2 = await pool.query(
        `
        SELECT u.username,
               COALESCE(p.employment_type,'company') AS employment_type,
               COALESCE(p.work_start,'09:00') AS work_start,
               COALESCE(p.work_end,'18:00') AS work_end,
               COALESCE(p.accept_status,'ready') AS accept_status,
               COALESCE(p.weekly_off_days,'') AS weekly_off_days,
               COALESCE(p.customer_slot_visible, TRUE) AS customer_slot_visible
        FROM public.users u
        LEFT JOIN public.technician_profiles p ON p.username=u.username
        WHERE u.role='technician'
          AND ($1::boolean IS TRUE OR COALESCE(p.accept_status,'ready') <> 'paused')
        ORDER BY u.username
        `
      , [include_paused]);
      console.warn('[availability_v2] no technicians matched tech_type=%s (include_paused=%s) -> fallback to all (%s)', t, include_paused, (r2.rows||[]).length);
      return r2.rows || [];
    } catch (e) {
      console.warn('[availability_v2] fallback technicians query failed', e.message);
    }
  }
  return r.rows || [];
}

function parseWeeklyOffDays(s) {
  const raw = (s || '').toString().trim();
  if (!raw) return new Set();
  const parts = raw.split(',').map(x => x.trim()).filter(Boolean);
  const out = new Set();
  for (const p of parts) {
    const n = Number(p);
    if (Number.isInteger(n) && n >= 0 && n <= 6) out.add(n);
  }
  return out;
}

async function buildOffMapForDate(dateStr, usernames) {
  // Returns Map(technician_username -> {is_off:boolean})
  const out = new Map();
  try {
    if (!Array.isArray(usernames) || usernames.length === 0) return out;
    const r = await pool.query(
      `
      SELECT technician_username, is_off
      FROM public.technician_workdays_v2
      WHERE work_date = $1::date
        AND technician_username = ANY($2::text[])
      `,
      [dateStr, usernames]
    );
    for (const row of (r.rows || [])) {
      out.set(row.technician_username, { is_off: !!row.is_off });
    }
  } catch (e) {
    // fail-open
    console.warn('[workdays_v2] overrides query failed', e.message);
  }
  return out;
}

function isTechOffOnDate(techRow, dateStr, offMap, opts = {}) {
  // Priority: override table > weekly_off_days
  const u = techRow?.username;
  if (!u) return false;
  const o = offMap?.get(u);
  if (o && typeof o.is_off === 'boolean') return !!o.is_off;
  // SAFETY (production): weekly_off_days บางระบบอาจถูก backfill ผิดพลาด
  // ทำให้แอดมินเห็น "ไม่มีช่างว่าง" ทั้งเดือน. ในโหมด forced (admin view)
  // ให้เชื่อ override table เป็นหลัก และข้าม weekly_off_days เพื่อ fail-open.
  if (opts && opts.ignoreWeekly === true) return false;

  const weekly = parseWeeklyOffDays(techRow?.weekly_off_days);
  if (!weekly || weekly.size === 0) return false;
  const d = new Date(`${String(dateStr).slice(0,10)}T00:00:00+07:00`);
  const dow = d.getDay(); // 0..6
  return weekly.has(dow);
}

async function listAssignedJobsForTechOnDate(username, dateStr, ignoreJobId) {
  // ✅ Timezone-robust filter (source of truth: Asia/Bangkok)
  // กรองด้วยช่วงเวลา [dayStart, dayEnd) แบบ Bangkok offset แล้ว cast เป็น timestamptz เสมอ
  // โดยเราได้บังคับ timezone ของ session ที่ db.js แล้ว (options: -c timezone=Asia/Bangkok)
  const day = String(dateStr || "").slice(0, 10);
  const addDays = (ymd, n) => {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    dt.setUTCDate(dt.getUTCDate() + Number(n || 0));
    const yy = String(dt.getUTCFullYear()).padStart(4, '0');
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };
  const dayStart = `${day}T00:00:00+07:00`;
  const dayEnd = `${addDays(day, 1)}T00:00:00+07:00`;

  const params = [username, dayStart, dayEnd];
  let extra = "";
  if (ignoreJobId) { params.push(ignoreJobId); extra = ` AND j.job_id <> $4`; }

  // IMPORTANT (ISSUE): ช่างที่เสร็จก่อน ต้องรับงานใหม่ได้
  // - งานเดียวกันอาจแบ่งรายการให้หลายช่าง (job_items.assigned_technician_username)
  // - duration_min ของ jobs เป็น “รวมใบงาน/หัวหน้าทีม” จึงห้ามเอาไปล็อกคิวทุกคน
  // ทางแก้: คืน assigned_items เฉพาะของช่างคนนั้น แล้วคำนวณ duration ต่อคน (per-tech) ตอนทำ availability/collision
  const r = await pool.query(
    `
    SELECT
      j.job_id,
      j.appointment_datetime,
      COALESCE(j.duration_min,60) AS duration_min,
      COALESCE(j.job_type,'') AS job_type,
      COALESCE(
        json_agg(DISTINCT jsonb_build_object('item_name', it.item_name, 'qty', it.qty))
          FILTER (WHERE it.job_id IS NOT NULL),
        '[]'::json
      ) AS assigned_items
    FROM public.jobs j
    LEFT JOIN public.job_items it
      ON it.job_id = j.job_id
     AND it.assigned_technician_username = $1
     AND COALESCE(it.is_service, true) = true
    WHERE (j.appointment_datetime::timestamptz) >= $2
      AND (j.appointment_datetime::timestamptz) <  $3
      AND COALESCE(j.job_status,'') <> 'ยกเลิก'
      ${extra}
      AND (
        j.technician_username=$1
        OR j.technician_team=$1
        OR EXISTS (SELECT 1 FROM public.job_team_members m WHERE m.job_id=j.job_id AND m.username=$1)
        OR EXISTS (SELECT 1 FROM public.job_assignments a WHERE a.job_id=j.job_id AND a.technician_username=$1)
        OR EXISTS (SELECT 1 FROM public.job_items it2 WHERE it2.job_id=j.job_id AND it2.assigned_technician_username=$1)
      )
    GROUP BY j.job_id, j.appointment_datetime, j.duration_min, j.job_type
    `,
    params
  );
  return r.rows || [];
}

async function getPerTechDurationForJobWithClient(client, jobId, techUsername, fallbackDuration, jobTypeFallback) {
  const durFallback = Math.max(1, Number(fallbackDuration || 60));
  const tech = String(techUsername || "").trim();
  if (!jobId || !tech) return durFallback;

  try {
    const r = await client.query(
      `SELECT item_name, qty
       FROM public.job_items
       WHERE job_id=$1
         AND assigned_technician_username=$2
         AND COALESCE(is_service, true) = true
       ORDER BY job_item_id ASC`,
      [jobId, tech]
    );
    const items = r.rows || [];
    if (!items.length) return durFallback;
    const d = computePerTechDurationFromAssignedItems(jobTypeFallback, items);
    return d > 0 ? d : durFallback;
  } catch (_) {
    return durFallback;
  }
}

// ================================
// 🔧 Per-tech duration helpers
// - ใช้สำหรับ Availability/Collision เท่านั้น
// - Fail-open: ถ้า parse ไม่ได้ ให้ fallback เป็น jobs.duration_min เดิม (กัน regression)
// ================================
function parseServiceFromJobItemRow(itemName, qty, jobTypeFallback){
  const name = String(itemName || '').trim();
  const qn = Number(qty || 0);
  if (!name) return null;

  // Split by bullets (legacy label format)
  const parts = name.split('•').map(s => String(s || '').trim()).filter(Boolean);

  // Detect job type (we only parse "ล้าง" reliably here; others fallback)
  let job_type = String(jobTypeFallback || '').trim();
  if (!job_type) {
    if (name.includes('ล้างแอร์')) job_type = 'ล้าง';
    else if (name.includes('ซ่อม')) job_type = 'ซ่อม';
    else if (name.includes('ติดตั้ง')) job_type = 'ติดตั้ง';
  }
  if (job_type !== 'ล้าง') return null;

  // ac_type from first token like "ล้างแอร์ผนัง"
  let ac_type = null;
  if (parts.length) {
    const p0 = parts[0];
    if (p0.startsWith('ล้างแอร์')) {
      ac_type = p0.replace('ล้างแอร์', '').trim() || null;
    }
  }

  // wash_variant
  let wash_variant = null;
  for (const p of parts) {
    if (p.includes('ล้าง') && !p.includes('ล้างแอร์') && !p.includes('BTU') && !p.includes('เครื่อง')) {
      wash_variant = p.trim();
      break;
    }
  }

  // btu
  let btu = 0;
  for (const p of parts) {
    if (p.toUpperCase().includes('BTU')) {
      const n = Number(String(p).replace(/[^0-9]/g, ''));
      if (Number.isFinite(n) && n > 0) { btu = Math.floor(n); break; }
    }
  }

  // machine_count: prefer qty from row, else try parse "... เครื่อง"
  let machine_count = 0;
  if (Number.isFinite(qn) && qn > 0) machine_count = qn;
  if (!(machine_count > 0)) {
    for (const p of parts) {
      if (p.includes('เครื่อง')) {
        const n = Number(String(p).replace(/[^0-9]/g, ''));
        if (Number.isFinite(n) && n > 0) { machine_count = Math.floor(n); break; }
      }
    }
  }
  if (!(machine_count > 0)) machine_count = 1;

  return {
    job_type: 'ล้าง',
    ac_type: ac_type || 'ผนัง',
    wash_variant: wash_variant || 'ล้างธรรมดา',
    btu: btu || 12000,
    machine_count,
    assigned_technician_username: null,
  };
}

function computePerTechDurationFromAssignedItems(jobType, assignedItems){
  try {
    const arr = Array.isArray(assignedItems) ? assignedItems : [];
    if (!arr.length) return 0;
    const services = [];
    for (const it of arr) {
      const s = parseServiceFromJobItemRow(it?.item_name, it?.qty, jobType);
      if (s) services.push(s);
    }
    if (!services.length) return 0;
    // conservative=true just makes sure we don't apply any parallel shortening
    const payload = { job_type: String(jobType || 'ล้าง').trim() || 'ล้าง', services };
    const d = computeDurationMinMulti(payload, { source: 'per_tech_items', conservative: true });
    return Math.max(1, Number(d || 0));
  } catch (e) {
    return 0;
  }
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

// =======================================
// 🕒 Availability helpers (per-tech, Bangkok-safe)
// - Travel Buffer rule (LOCKED SPEC)
//   ✅ Buffer +30 นาที "ต่อ 1 ใบงาน" แบบ conservative (รวมงานสุดท้ายของวัน)
//   ✅ Busy interval ต่อใบงาน = [start, start+duration+30)  (half-open)
// - Overlap check (Hard Validation):
//   if new_start < old_busy_end && old_start < new_busy_end => ชนคิว
// =======================================

const ENABLE_AVAILABILITY_DEBUG = String(process.env.ENABLE_AVAILABILITY_DEBUG || '').trim() === '1';
// Runtime toggle for admin debug logging (no deploy needed). Default OFF.
// This is intentionally in-memory to avoid DB migrations and any production risk.
let RUNTIME_AVAILABILITY_DEBUG = false;
function avlog(tag, obj){
  if(!(ENABLE_AVAILABILITY_DEBUG || RUNTIME_AVAILABILITY_DEBUG)) return;
  try{ console.log(tag, obj); }catch{}
}

// Admin Debug Controls (availability logging)
// - GET  /admin/debug/status
// - POST /admin/debug/toggle  { enabled: true|false }
// Backward compatible + safe: only affects console logging when enabled.
app.get('/admin/debug/status', requireAdminSoft, async (req, res) => {
  try {
    return res.json({
      success: true,
      availability_debug_env: ENABLE_AVAILABILITY_DEBUG,
      availability_debug_runtime: !!RUNTIME_AVAILABILITY_DEBUG,
      tz: process.env.TZ || null,
    });
  } catch (e) {
    return res.status(500).json({ error: 'debug status failed' });
  }
});

app.post('/admin/debug/toggle', requireAdminSoft, async (req, res) => {
  try {
    const enabled = String(req.body?.enabled ?? '').trim();
    if (enabled === '1' || enabled === 'true') {
      RUNTIME_AVAILABILITY_DEBUG = true;
    } else if (enabled === '0' || enabled === 'false') {
      RUNTIME_AVAILABILITY_DEBUG = false;
    } else {
      // toggle if invalid/empty
      RUNTIME_AVAILABILITY_DEBUG = !RUNTIME_AVAILABILITY_DEBUG;
    }
    return res.json({ success: true, availability_debug_runtime: !!RUNTIME_AVAILABILITY_DEBUG });
  } catch (e) {
    return res.status(500).json({ error: 'debug toggle failed' });
  }
});

function fmtHHMMFromMin(m){
  return minToHHMM(Math.max(0, Math.min(24*60, Math.round(m))));
}

function bangkokHMToMinFromDate(date){
  // Extract hour/minute in Asia/Bangkok, then convert to minutes from midnight.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hh = Number(parts.find(p=>p.type==='hour')?.value || 0);
  const mm = Number(parts.find(p=>p.type==='minute')?.value || 0);
  return hh * 60 + mm;
}

function mergeMinIntervals(intervals){
  // intervals: [{startMin,endMin}] with startMin<=endMin
  const arr = (Array.isArray(intervals) ? intervals : [])
    .map(x=>({ startMin: Number(x.startMin), endMin: Number(x.endMin) }))
    .filter(x=>Number.isFinite(x.startMin) && Number.isFinite(x.endMin) && x.endMin > x.startMin)
    .sort((a,b)=>a.startMin-b.startMin || a.endMin-b.endMin);
  const out = [];
  for(const it of arr){
    if(!out.length){ out.push({ ...it }); continue; }
    const last = out[out.length-1];
    if(it.startMin <= last.endMin){
      last.endMin = Math.max(last.endMin, it.endMin);
    } else {
      out.push({ ...it });
    }
  }
  return out;
}

async function listJobBlocksForTechOnDate(username, dateStr, ignoreJobId){
  // Returns merged RAW job blocks (no buffer) in Bangkok minutes: [{job_id,startMin,endMin,startIso,durationMin}]
  const jobs = await listAssignedJobsForTechOnDate(username, dateStr, ignoreJobId);
  const raw = [];
  for(const j of (jobs||[])){
    const startDate = new Date(j.appointment_datetime);
    const startMin = bangkokHMToMinFromDate(startDate);
    const perTechDur = computePerTechDurationFromAssignedItems(j.job_type, j.assigned_items);
    const dur = perTechDur > 0 ? perTechDur : Math.max(1, Number(j.duration_min || 60));
    const endMin = startMin + dur;
    raw.push({
      job_id: j.job_id,
      startMin,
      endMin,
      startIso: j.appointment_datetime,
      durationMin: dur,
    });
  }
  return mergeMinIntervals(raw);
}

async function listBusyBlocksForTechOnDate(username, dateStr, ignoreJobId){
  // Returns merged BUSY blocks (with conservative buffer) in Bangkok minutes:
  // [{job_id,startMin,busyEndMin,startIso,durationMin}]
  const jobs = await listAssignedJobsForTechOnDate(username, dateStr, ignoreJobId);
  const raw = [];
  for(const j of (jobs||[])){
    const startDate = new Date(j.appointment_datetime);
    const startMin = bangkokHMToMinFromDate(startDate);
    const perTechDur = computePerTechDurationFromAssignedItems(j.job_type, j.assigned_items);
    const dur = perTechDur > 0 ? perTechDur : Math.max(1, Number(j.duration_min || 60));
    const busyEndMin = startMin + dur + TRAVEL_BUFFER_MIN;
    raw.push({
      job_id: j.job_id,
      startMin,
      endMin: startMin + dur, // raw end (no buffer)
      busyEndMin,
      startIso: j.appointment_datetime,
      durationMin: dur,
    });
  }
  // merge using busyEndMin
  const merged = [];
  const sorted = raw
    .filter(x=>Number.isFinite(x.startMin) && Number.isFinite(x.busyEndMin) && x.busyEndMin > x.startMin)
    .sort((a,b)=>a.startMin-b.startMin || a.busyEndMin-b.busyEndMin);

  for(const it of sorted){
    if(!merged.length){ merged.push({ ...it }); continue; }
    const last = merged[merged.length-1];
    if(it.startMin < last.busyEndMin){
      // overlap -> extend
      last.busyEndMin = Math.max(last.busyEndMin, it.busyEndMin);
      last.endMin = Math.max(last.endMin, it.endMin);
      // keep earliest job_id/startIso for debug
    } else {
      merged.push({ ...it });
    }
  }
  return merged;
}

function buildTechWindowsMin(techRow, dateStr, specialMap, uiStartMin, uiEndMin){
  // Union of per-tech work hours + special slots, intersected with UI window.
  const wins = [];
  const ts = toMin(techRow?.work_start || '09:00');
  const te = toMin(techRow?.work_end || '18:00');
  if(Number.isFinite(ts) && Number.isFinite(te) && te > ts){
    const a = Math.max(uiStartMin, ts);
    const b = Math.min(uiEndMin, te);
    if(b > a) wins.push({ startMin: a, endMin: b });
  }
  const sp = specialMap?.get(techRow?.username) || [];
  for(const w of sp){
    const ws = toMin(w.start);
    const we = toMin(w.end);
    if(!Number.isFinite(ws) || !Number.isFinite(we) || we <= ws) continue;
    const a = Math.max(uiStartMin, ws);
    const b = Math.min(uiEndMin, we);
    if(b > a) wins.push({ startMin: a, endMin: b });
  }
  return mergeMinIntervals(wins);
}

function buildBusyIntervalsConservative(busyBlocks){
  // Convert busyBlocks -> [{startMin,endMin}] using busyEndMin.
  const blocks = Array.isArray(busyBlocks) ? busyBlocks : [];
  return mergeMinIntervals(blocks.map(b => ({ startMin: b.startMin, endMin: b.busyEndMin })));
}

function buildFreeIntervalsForWindow(busyIntervals, windowStartMin, windowEndMin){
  // Returns free gaps in [windowStartMin, windowEndMin) given busy intervals (minutes)
  const busy = mergeMinIntervals((Array.isArray(busyIntervals) ? busyIntervals : [])
    .map(x => ({ startMin: Number(x.startMin), endMin: Number(x.endMin) }))
    .filter(x => Number.isFinite(x.startMin) && Number.isFinite(x.endMin) && x.endMin > x.startMin));

  const out = [];
  let cursor = windowStartMin;
  for (const b of busy) {
    const s = Math.max(windowStartMin, b.startMin);
    const e = Math.min(windowEndMin, b.endMin);
    if (e <= windowStartMin || s >= windowEndMin) continue;
    if (s > cursor) out.push({ startMin: cursor, endMin: s });
    cursor = Math.max(cursor, e);
  }
  if (cursor < windowEndMin) out.push({ startMin: cursor, endMin: windowEndMin });
  return out;
}

function buildStartIntervalsForWindow(busyBlocks, windowStartMin, windowEndMin, durationMin){
  // Returns intervals of START times (minutes) where a job can start, using conservative busy blocks.
  const d = Math.max(1, Number(durationMin||0));
  if(windowEndMin <= windowStartMin) return [];

  const busy = buildBusyIntervalsConservative(busyBlocks);
  const free = buildFreeIntervalsForWindow(busy, windowStartMin, windowEndMin);

  const out = [];
  for(const f of free){
    const latest = f.endMin - d;
    if(latest >= f.startMin){
      out.push({ startMin: f.startMin, endMin: latest });
    }
  }
  return out;
}

// ✅ Spec: allow starting within UI window (09:00–18:00) even if the job ends after 18:00.
// Compute startable ranges by checking collision against conservative busy intervals (including buffer)
// across the whole day, not just within the UI window.
function buildStartIntervalsByCollision(busyBlocks, uiStartMin, uiEndMin, durationMin) {
  const d = Math.max(1, Number(durationMin || 0));
  if (uiEndMin <= uiStartMin) return [];
  const blockLen = d + TRAVEL_BUFFER_MIN;

  // Convert to conservative busy intervals [start, busyEnd)
  const busy = buildBusyIntervalsConservative(busyBlocks);

  // Forbidden start ranges derived from overlap condition:
  // newStart < oldEnd && oldStart < newEnd  where newEnd = newStart + blockLen
  // => newStart in (oldStart - blockLen, oldEnd)
  const forbidden = [];
  for (const b of busy) {
    const s = Math.floor(b.startMin - blockLen);
    const e = Math.ceil(b.endMin);
    forbidden.push({ startMin: s, endMin: e });
  }
  const forb = mergeMinIntervals(forbidden);

  // Allowed = [uiStartMin, uiEndMin) \ forbidden
  const allowed = [];
  let cursor = uiStartMin;
  for (const f of forb) {
    const s = Math.max(uiStartMin, f.startMin);
    const e = Math.min(uiEndMin, f.endMin);
    if (e <= uiStartMin || s >= uiEndMin) continue;
    if (s > cursor) allowed.push({ startMin: cursor, endMin: s });
    cursor = Math.max(cursor, e);
  }
  if (cursor < uiEndMin) allowed.push({ startMin: cursor, endMin: uiEndMin });

  // Convert allowed half-open intervals to inclusive output blocks like the existing sweep expects.
  // We'll output [start, end] inclusive minutes for 'start' mode.
  return allowed
    .map(a => ({ startMin: a.startMin, endMin: Math.max(a.startMin, a.endMin - 1) }))
    .filter(a => a.endMin >= a.startMin);
}

function normalizeBangkokIso(iso){
  const t = normalizeAppointmentDatetime(iso);
  if (!t) return '';
  // If no timezone suffix, assume Asia/Bangkok (+07:00) to avoid UTC shifting bugs.
  // Optional safety toggle: treat trailing 'Z' / '+00:00' as Bangkok wall-clock.
  const TREAT_Z_AS_BKK_LOCAL = envBool("APPT_TREAT_Z_AS_BKK_LOCAL", false);
  if (/(Z|z|[+-]\d\d:\d\d)$/.test(t)) {
    if (TREAT_Z_AS_BKK_LOCAL) {
      if (/[zZ]$/.test(t)) return t.replace(/[zZ]$/, "+07:00");
      if (/\+00:00$/.test(t)) return t.replace(/\+00:00$/, "+07:00");
    }
    return t;
  }
  return `${String(t).replace(/\.(\d{1,3})$/, "")}+07:00`;
}

async function checkTechCollision(username, startIso, durationMin, ignoreJobId) {
  // Returns null if free, else returns conflict detail
  const iso = normalizeBangkokIso(startIso);
  const dateStr = String(iso).slice(0, 10);
  const startDate = new Date(iso);
  if (Number.isNaN(startDate.getTime())) return { error: 'invalid_datetime' };

  const startMin = bangkokHMToMinFromDate(startDate);
  const d = Math.max(1, Number(durationMin || 0));
  const busyEndMin = startMin + d + TRAVEL_BUFFER_MIN;

  // IMPORTANT (ISSUE): collision ต้องยึด duration ต่อคน (per-tech) จาก job_items ที่ assign ให้ช่างคนนั้น
  // เลยต้องใช้ listBusyBlocksForTechOnDate() ซึ่งคำนวณ per-tech duration แบบ fail-open แล้ว
  const blocks = await listBusyBlocksForTechOnDate(username, dateStr, ignoreJobId);

  for (const b of blocks) {
    const oldStart = b.startMin;
    const oldBusyEnd = b.busyEndMin;
    if (startMin < oldBusyEnd && oldStart < busyEndMin) {
      const detail = {
        conflict_job_id: b.job_id,
        username,
        date: dateStr,
        new_range: { start: fmtHHMMFromMin(startMin), busy_end: fmtHHMMFromMin(busyEndMin) },
        old_range: { start: fmtHHMMFromMin(oldStart), busy_end: fmtHHMMFromMin(oldBusyEnd) },
      };
      avlog('[collision]', detail);
      return detail;
    }
  }
  return null;
}

async function isTechFree(username, startIso, durationMin, ignoreJobId) {
  const conflict = await checkTechCollision(username, startIso, durationMin, ignoreJobId);
  return !conflict;
}

function http409Conflict(res, conflict){
  return res.status(409).json({
    error: "ช่างไม่ว่างช่วงเวลานี้",
    conflict: conflict || null,
  });
}

// =======================================
// 💰 Pricing + Duration Preview (public)
// =======================================
app.post("/public/pricing_preview", async (req, res) => {
  try {
    const payload = req.body || {};
    // CWF Spec: pricing preview should match conservative schedule duration
    const duration_min = computeDurationMinMulti(payload, { source: "pricing_preview", conservative: true });
    if (duration_min <= 0) return res.status(400).json({ error: "งานประเภทนี้ต้องให้แอดมินกำหนดเวลา (duration)" });
    const standard_price = computeStandardPriceMulti(payload);

    // customer promo auto-apply (preview)
    const promoPick = await findBestCustomerPromotion(payload, standard_price, pool);
    const promo = promoPick?.promo || null;
    const promo_discount = Number(promoPick?.discount || 0);
    const total_after_discount = Math.max(0, Number(standard_price || 0) - Math.min(Number(standard_price || 0), promo_discount));
    res.json({
      standard_price,
      promo: promo ? {
        promo_id: promo.promo_id,
        promo_name: promo.promo_name,
        promo_type: promo.promo_type,
        promo_value: promo.promo_value,
        discount: promo_discount,
        total_after_discount,
      } : null,
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
  // forced=1 (Admin lock): allow showing technicians even if accept_status='paused'
  const forced = String(req.query.forced || '').trim() === '1';
  const duration_min = Math.max(15, Number(req.query.duration_min || 60));
  // crew_size: if a job can be shared by multiple technicians simultaneously,
  // callers (Admin v2) can request availability based on per-tech workload time.
  // This is backward compatible: if omitted or invalid, crew_size=1.
  const crew_size_raw = Number(req.query.crew_size || req.query.crewSize || 1);
  let crew_size = Math.max(1, Math.min(10, Number.isFinite(crew_size_raw) ? Math.floor(crew_size_raw) : 1));
  // auto_crew (deprecated): ignored by spec (ห้ามหารเวลา/auto crew)
  const auto_crew = false;
  // include_full=1: debug/admin usage to return even unavailable time steps.
  const include_full = String(req.query.include_full || '').trim() === '1';
  const slot_step_min = 30;
  // mode:
  // - 'start' (default): return blocks of *startable ranges* (เริ่มได้) for the given duration
  // - 'free': return blocks of *free time* (เวลาว่างจริง) within UI window
  const mode = String(req.query.mode || req.query.view || 'start').trim().toLowerCase();

  // debug=1 (admin/dev): include backend busy/free + reasons in response
  const debugFlag = String(req.query.debug || '').trim() === '1';
  const debugBusy = {};
  const debugFree = {};
  const debugReasons = [];
  const debugInfo = { busy_by_tech: debugBusy, free_by_tech: debugFree, reasons: debugReasons };

  // ===== Service Matrix (Option B) =====
  // criteria from customer booking page (Thai values)
  const q_job_type = String(req.query.job_type || req.query.jobType || '').trim();
  const q_ac_type = String(req.query.ac_type || req.query.acType || '').trim();
  const q_wash_variant = String(req.query.wash_variant || req.query.washVariant || '').trim();
  const q_repair_variant = String(req.query.repair_variant || req.query.repairVariant || '').trim();

  const normalizeJobKey = (s) => {
    const v = String(s || '').toLowerCase();
    if (!v) return null;
    if (v.includes('ติดตั้ง')) return 'install';
    if (v.includes('ซ่อม')) return 'repair';
    if (v.includes('ล้าง')) return 'wash';
    return null;
  };
  const normalizeAcKey = (s) => {
    const v = String(s || '').toLowerCase();
    if (!v) return null;
    if (v.includes('ผนัง') || v.includes('wall')) return 'wall';
    if (v.includes('สี่ทิศ') || v.includes('4') || v.includes('four')) return 'fourway';
    if (v.includes('แขวน')) return 'hanging';
    if (v.includes('ใต้ฝ้า') || v.includes('เปลือย') || v.includes('ฝัง')) return 'ceiling';
    return null;
  };
  const normalizeWashKey = (s) => {
    const v = String(s || '').toLowerCase();
    if (!v) return null;
    if (v.includes('ธรรมดา') || v.includes('normal')) return 'normal';
    if (v.includes('พรีเมียม') || v.includes('premium')) return 'premium';
    if (v.includes('แขวนคอย') || v.includes('coil')) return 'coil';
    if (v.includes('ตัดล้าง') || v.includes('overhaul') || v.includes('ใหญ่')) return 'overhaul';
    return null;
  };

  const criteria = {
    job: normalizeJobKey(q_job_type),
    ac: normalizeAcKey(q_ac_type),
    wash: normalizeWashKey(q_wash_variant),
    repair_variant: q_repair_variant || null,
  };

  // Multi-service criteria (customer booking can include multiple AC types in one job)
  // Query param: services=<JSON.stringify([{job_type,ac_type,wash_variant}...])>
  let criteriaList = null;
  try {
    const sRaw = req.query.services;
    if (sRaw) {
      const parsed = JSON.parse(String(sRaw));
      if (Array.isArray(parsed) && parsed.length) {
        criteriaList = parsed
          .map((s) => ({
            job: normalizeJobKey(s.job_type || q_job_type),
            ac: normalizeAcKey(s.ac_type),
            wash: normalizeWashKey(s.wash_variant),
            repair_variant: String(s.repair_variant || '').trim() || null,
          }))
          .filter((c) => c.job && c.ac);
        if (!criteriaList.length) criteriaList = null;
      }
    }
  } catch (e) {
    criteriaList = null;
  }

  const hasCriteria = Boolean(criteriaList?.length || criteria.job || criteria.ac || criteria.wash || criteria.repair_variant);

  async function loadServiceMatrixMap(usernames) {
    // NOTE: For customer booking we want strict filtering (no record => not eligible).
    // But if DB query fails, we fail-open by skipping matrix filtering entirely.
    loadServiceMatrixMap._ok = true;
    try {
      if (!usernames || !usernames.length) return new Map();
      const r = await pool.query(
        `SELECT username, matrix_json FROM public.technician_service_matrix WHERE username = ANY($1::text[])`,
        [usernames]
      );
      const m = new Map();
      for (const row of (r.rows || [])) m.set(String(row.username), row.matrix_json || {});
      return m;
    } catch (e) {
      // fail-open
      loadServiceMatrixMap._ok = false;
      console.warn('[availability_v2] loadServiceMatrixMap failed:', e.message);
      return new Map();
    }
  }

  function techMatchesMatrixStrict(matrix, c) {
    // Strict: missing matrix or missing keys => NOT eligible for customer slots
    if (!matrix || typeof matrix !== 'object') return false;
    const mustTrue = (obj, key) => {
      if (!key) return true;
      if (!obj || typeof obj !== 'object') return false;
      return Boolean(obj[key]);
    };
    if (!mustTrue(matrix.job_types, c.job)) return false;
    if (!mustTrue(matrix.ac_types, c.ac)) return false;
    if (c.job === 'wash' && c.ac === 'wall') {
      if (!mustTrue(matrix.wash_wall_variants, c.wash)) return false;
    }
    return true;
  }

  function techMatchesAllCriteriaStrict(matrix, list) {
    if (!Array.isArray(list) || !list.length) return techMatchesMatrixStrict(matrix, criteria);
    for (const c of list) {
      if (!techMatchesMatrixStrict(matrix, c)) return false;
    }
    return true;
  }

  try {
    // Customer booking must NOT depend on technician "open/close accept jobs" status.
    // The accept_status (paused/ready) is reserved for the "urgent push" flow only.
    // Therefore, availability should always include paused technicians.
    // (Admin lock forced=1 remains meaningful for other rules like weekly off-days handling.)
    const techsAll = await listTechniciansByType(tech_type, { include_paused: true });
    // workday overrides (block forced lock on off-days)
    const offMap = await buildOffMapForDate(date, techsAll.map(t => t.username));
    const techs = techsAll.filter(t => {
      // If forced lock mode (admin calendar): include paused technicians.
      // Still respect explicit overrides (technician_workdays_v2) but
      // ignore weekly_off_days to prevent bad backfill from hiding all techs.
      if (forced && isTechOffOnDate(t, date, offMap, { ignoreWeekly: true })) return false;
      return true;
    });

    // Option B: filter technicians by service matrix + slot visibility (customer booking only)
    // - Do NOT apply when forced=1 (admin lock) to avoid hiding technicians in admin calendar.
    // - Strict rule (as requested):
    //   1) ถ้า "ไม่ติ๊กเลือกอะไรเลย" => ไม่แสดงในสลอตลูกค้า
    //   2) ถ้าไม่มี record matrix => ไม่แสดงในสลอตลูกค้า
    //   3) customer_slot_visible=false (ลูกมือ/ฝึกงาน) => ไม่แสดงในสลอตลูกค้า
    // - If DB loading matrices fails => skip matrix filtering (fail-open) to avoid total outage.
    let techsFiltered = techs;
    if (!forced && hasCriteria) {
      const matrixMap = await loadServiceMatrixMap(techs.map(t => t.username));
      const matrixOk = (loadServiceMatrixMap._ok !== false);
      techsFiltered = techs.filter(t => {
        // hide trainees/assistants from customer slot list
        if (t && t.customer_slot_visible === false) return false;
        // If DB read failed -> do not apply strict filter
        if (!matrixOk) return true;
        const u = String(t.username);
        if (!matrixMap.has(u)) return false;
        const mx = matrixMap.get(u) || null;
        return techMatchesAllCriteriaStrict(mx, criteriaList || null);
      });
      if (debugFlag && techsFiltered.length === 0 && techs.length > 0) {
        debugReasons.push({ code: 'NO_MATCH_MATRIX', message: 'ไม่มีช่างที่เข้าเงื่อนไขตามสิทธิ์งานที่ตั้งไว้ (service matrix)' });
      }

      // ✅ Fail-safe for production usability:
      // ถ้า matrix strict กรองจนเหลือ 0 ทั้งระบบ (เช่นยังไม่ได้ตั้งค่า matrix ใน DB)
      // ให้ fallback ไปใช้ช่างที่แสดงใน customer slot ได้ (customer_slot_visible != false)
      // เพื่อให้ “หน้าจองคิวลูกค้า” ไม่ล่มทั้งระบบ
      if (matrixOk && techsFiltered.length === 0 && techs.length > 0) {
        techsFiltered = techs.filter(t => (t && t.customer_slot_visible === false) ? false : true);
        if (debugFlag) {
          debugReasons.push({ code: 'FALLBACK_MATRIX_EMPTY', message: 'fallback: ไม่มี matrix ตรงเงื่อนไข จึงใช้ช่างทั้งหมดที่อนุญาตให้แสดงในสลอตลูกค้า' });
        }
      }
    }
    // special slots map (admin can extend availability)
    const specialMap = new Map();
    try {
      const sr = await pool.query(
        `SELECT technician_username, start_time, end_time
         FROM public.technician_special_slots_v2
         WHERE slot_date=$1::date`,
        [date]
      );
      for (const row of sr.rows) {
        const u = row.technician_username;
        if (!specialMap.has(u)) specialMap.set(u, []);
        specialMap.get(u).push({ start: row.start_time, end: row.end_time });
      }
    } catch (e) {
      // fail-open: do not break availability
      console.warn("[availability_v2] special slots query failed", e.message);
    }
    const tech_count = techsFiltered.length;

    if (debugFlag && tech_count === 0) {
      debugReasons.push({ code: 'NO_TECH', message: 'ไม่มีช่างที่ตรงเงื่อนไข (tech_type/วันหยุด/สิทธิ์งาน) — หมายเหตุ: โหมดเปิด/ปิดรับงาน (accept_status) ไม่ถูกนำมาใช้กับการจองของลูกค้า' });
    }
    // ✅ Crew sizing / parallel work preview
    // ตามสเปก CWF:
    // - ห้ามเอา crew_size ไปหารเวลาในโหมด auto/single
    // - อนุญาตเฉพาะ "preview" โหมด team (เพื่อแสดงข้อมูลเท่านั้น)
    // ดังนั้น availability จะใช้ duration_min จริงเสมอ (ไม่ divide) เว้นแต่ caller ระบุ preview_team=1 และ assign_mode=team
    const assign_mode_q = String(req.query.assign_mode || req.query.assignMode || '').trim().toLowerCase();
    const preview_team = String(req.query.preview_team || req.query.previewTeam || '').trim() === '1';
    const allowPreviewParallel = preview_team && assign_mode_q === 'team';

    if (!allowPreviewParallel) {
      crew_size = 1;
    } else {
      // preview only: clamp crew_size to [1, tech_count]
      crew_size = Math.max(1, Math.min(tech_count || 1, Number(crew_size || 1) || 1));
    }

    // ✅ UI primary window is LOCKED to 09:00–18:00
    let uiStartMin = toMin('09:00');
    const uiEndMin = toMin('18:00');
    const work_start = '09:00';
    const work_end = '18:00';

    // ✅ If checking "today" in Bangkok time, do not show slots in the past.
    // Only applies to start-mode slot display; free-mode still shows full-day free/busy ranges.
    try {
      const nowBkk = getNowBangkokParts();
      const todayBkk = `${nowBkk.Y}-${nowBkk.M}-${nowBkk.D}`;
      if (mode === 'start' && date === todayBkk) {
        const nowMin = nowBkk.hh * 60 + nowBkk.mm;
        // round up to slot boundary
        const step = slot_step_min;
        const rounded = Math.ceil(nowMin / step) * step;
        uiStartMin = Math.max(uiStartMin, Math.min(rounded, uiEndMin));
      }
    } catch (e) {
      // ignore timeZone failures
    }

    // ✅ Duration for collision is ALWAYS the real duration_total (no crew division)
    const effective_duration_min = Math.max(1, Number(duration_min || 0));
    const default_effective_block_min = effective_duration_min + TRAVEL_BUFFER_MIN;

    // Build per-tech intervals, then sweep to produce "blocks" (non-fixed steps)
    const events = new Map(); // min -> { add:[], remove:[] }
    const addEvent = (min, type, techUser) => {
      const k = Math.round(min);
      if (!events.has(k)) events.set(k, { add: [], remove: [] });
      events.get(k)[type].push(techUser);
    };

    for (const tech of techsFiltered) {
      const techWindows = buildTechWindowsMin(tech, date, specialMap, uiStartMin, uiEndMin);
      if (!techWindows.length) continue;

      const busyBlocks = await listBusyBlocksForTechOnDate(tech.username, date, null);

      // DEBUG: raw job blocks (no buffer) if needed
      const jobBlocks = null;

      // For each availability window of the technician, compute intervals.
      for (const w of techWindows) {
        if (mode === 'free') {
          // Free blocks: window - busy(with conditional buffer between jobs)
          const busy = buildBusyIntervalsConservative(busyBlocks);
          const freeIntervals = buildFreeIntervalsForWindow(busy, w.startMin, w.endMin);
          if (debugFlag) {
            debugBusy[tech.username] = (debugBusy[tech.username] || []).concat(busy.map(b=>({ start: fmtHHMMFromMin(b.startMin), end: fmtHHMMFromMin(b.endMin) })));
            debugFree[tech.username] = (debugFree[tech.username] || []).concat(freeIntervals.map(f=>({ start: fmtHHMMFromMin(f.startMin), end: fmtHHMMFromMin(f.endMin) })));
          }
          for (const it of freeIntervals) {
            // half-open [start, end) -> remove at end
            addEvent(it.startMin, 'add', tech.username);
            addEvent(it.endMin, 'remove', tech.username);
          }
        } else {
          // Start ranges: minutes where a job can START (respecting buffer rules)
          const startIntervals = buildStartIntervalsByCollision(busyBlocks, w.startMin, w.endMin, effective_duration_min);
        if (debugFlag) {
          const busy = buildBusyIntervalsConservative(busyBlocks);
          const free = buildFreeIntervalsForWindow(busy, w.startMin, w.endMin);
          debugBusy[tech.username] = (debugBusy[tech.username] || []).concat(busy.map(b=>({ start: fmtHHMMFromMin(b.startMin), end: fmtHHMMFromMin(b.endMin) })));
          debugFree[tech.username] = (debugFree[tech.username] || []).concat(free.map(f=>({ start: fmtHHMMFromMin(f.startMin), end: fmtHHMMFromMin(f.endMin) })));
        }
          for (const it of startIntervals) {
            // Represent as half-open [start, end+1) so we can sweep cleanly in minutes.
            addEvent(it.startMin, 'add', tech.username);
            addEvent(it.endMin + 1, 'remove', tech.username);
          }
        }
      }
    }

    const points = Array.from(events.keys()).sort((a,b)=>a-b);
    const active = new Set();
    const slots = [];

    // Ensure deterministic sweep start from uiStartMin
    const sweepPoints = points.length ? points : [];
    if (!sweepPoints.length) {
      if (debugFlag) debugReasons.push({ code: 'NO_EVENTS', message: 'ไม่มีช่วงเวลาว่าง/ช่วงเริ่มงานในหน้าต่าง 09:00–18:00 (อาจเกิดจากวันหยุด/ไม่มี special slot/หรือถูก busy block ทั้งหมด)' });
      console.log("[availability_v2]", { date, tech_type, forced, duration_min, crew_size, effective_duration_min, tech_count, slots: 0, reason: debugReasons.map(r=>r.code).join(',') });
      // Public customer response should not reveal technician counts.
      const isPublicCustomer = !forced && !debugFlag;
      return res.json({
        date,
        tech_type,
        forced,
        work_start,
        work_end,
        travel_buffer_min: TRAVEL_BUFFER_MIN,
        duration_min: effective_duration_min,
        effective_block_min: default_effective_block_min,
        slot_step_min,
        tech_count: isPublicCustomer ? undefined : tech_count,
        crew_size: isPublicCustomer ? undefined : crew_size,
        slots: [],
        debug: debugFlag ? debugInfo : undefined,
      });
    }

    // Add guard points so sweep covers the whole UI range even if first event starts after uiStartMin
    if (!events.has(uiStartMin)) events.set(uiStartMin, { add: [], remove: [] });
    if (!events.has(uiEndMin + 1)) events.set(uiEndMin + 1, { add: [], remove: [] });
    const pts = Array.from(events.keys()).sort((a,b)=>a-b);

    for (let i=0;i<pts.length;i++) {
      const t = pts[i];
      const bucket = events.get(t) || { add: [], remove: [] };
      // Apply removes first (defensive)
      for (const u of bucket.remove) active.delete(u);
      for (const u of bucket.add) active.add(u);

      const next = pts[i+1];
      if (next == null) continue;
      const segStart = Math.max(uiStartMin, t);
      // All internal segments are half-open [t, next).
      // - start mode: we store end+1 so output should be inclusive (end = next-1)
      // - free mode: output should stay half-open end (end = next)
      const segEndExclusive = Math.min(uiEndMin + 1, next);
      const segEndOut = (mode === 'free') ? Math.min(uiEndMin, segEndExclusive) : (segEndExclusive - 1);
      if (segEndOut < segStart) continue;

      const ids = Array.from(active);
      const ok = ids.length >= crew_size;
      if (!ok && !include_full) continue;

      if (mode === 'start') {
        // explode "start_range" into fixed step slots so UI shows 09:00-09:30, 09:30-10:00, ...
        const lastStart = Math.min(segEndOut, uiEndMin - slot_step_min);
        for (let s = segStart; s <= lastStart; s += slot_step_min) {
          const e = Math.min(uiEndMin, s + slot_step_min);
          slots.push({
            start: minToHHMM(s),
            end: minToHHMM(e),
            available: ok,
            available_tech_ids: ok ? ids : [],
            capacity: tech_count,
            available_count: ids.length,
            crew_size,
            slot_kind: 'start_step',
          });
        }
      } else {
        slots.push({
          start: minToHHMM(segStart),
          end: minToHHMM(segEndOut),
          available: ok,
          available_tech_ids: ok ? ids : [],
          capacity: tech_count,
          available_count: ids.length,
          crew_size,
          slot_kind: 'free_block',
        });
      }
    }

    if (debugFlag && slots.length === 0 && tech_count > 0) {
      debugReasons.push({ code: 'BLOCKED', message: 'พบช่างแต่ไม่มีช่วงที่เริ่มงานได้ (ถูก block จาก busy+buffer หรือ duration ยาวเกินช่วงว่าง)' });
    }

    console.log("[availability_v2]", { date, tech_type, forced, duration_min, crew_size, effective_duration_min, tech_count, slots: slots.length, reason: (debugReasons.length ? debugReasons.map(r=>r.code).join(',') : undefined) });

    // Public customer response should not reveal technician counts or available tech IDs.
    const isPublicCustomer = !forced && !debugFlag;
    const outSlots = isPublicCustomer
      ? (slots || []).map(s => ({ start: s.start, end: s.end, available: !!s.available }))
      : slots;

    res.json({
      date,
      tech_type,
      forced,
      work_start,
      work_end,
      travel_buffer_min: TRAVEL_BUFFER_MIN,
      duration_min: effective_duration_min,
      effective_block_min: default_effective_block_min,
      slot_step_min,
      tech_count: isPublicCustomer ? undefined : tech_count,
      crew_size: isPublicCustomer ? undefined : crew_size,
      mode: (mode === 'free') ? 'free' : 'start',
      slots: outSlots,
      debug: debugFlag ? debugInfo : undefined,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "โหลดตารางว่างไม่สำเร็จ" });
  }
});

// Admin: availability by technician (v2) - used for colored rows per tech
app.get("/admin/availability_by_tech_v2", async (req, res) => {
  if (!ENABLE_AVAILABILITY_V2) return res.status(404).json({ error: "DISABLED" });
  const date = (req.query.date || new Date().toISOString().slice(0, 10)).toString();
  const tech_type = (req.query.tech_type || "company").toString().trim().toLowerCase();
  const duration_min = Math.max(15, Number(req.query.duration_min || 60));
  const slot_step_min = 30;
  try {
    const include_paused = String(req.query.forced || req.query.include_paused || "").trim() === "1";
    const techsAll = await listTechniciansByType(tech_type, { include_paused });
    // Same safety as /public/availability_v2:
    // - respect explicit off override table
    // - ignore weekly_off_days when include_paused (admin view) to avoid bad backfill hiding all techs
    const offMap = await buildOffMapForDate(date, (techsAll || []).map(t => t.username));
    const techs = (techsAll || []).filter(t => {
      if (include_paused && isTechOffOnDate(t, date, offMap, { ignoreWeekly: true })) return false;
      return true;
    });
    const specialMap = new Map();
    try {
      const sr = await pool.query(
        `SELECT technician_username, start_time, end_time
         FROM public.technician_special_slots_v2
         WHERE slot_date=$1::date`,
        [date]
      );
      for (const row of sr.rows) {
        const u = row.technician_username;
        if (!specialMap.has(u)) specialMap.set(u, []);
        specialMap.get(u).push({ start: row.start_time, end: row.end_time });
      }
    } catch (e) {
      console.warn("[admin_availability_by_tech_v2] special slots query failed", e.message);
    }

    // ✅ Determine global working window:
let globalStart = toMin("09:00");
let globalEnd = toMin("18:00");

for (const tech of techs) {
  const ts = toMin(tech.work_start || "09:00");
  const te = toMin(tech.work_end || "18:00");
  if (Number.isFinite(ts)) globalStart = Math.min(globalStart, ts);
  if (Number.isFinite(te)) globalEnd = Math.max(globalEnd, te);
  const wins = specialMap.get(tech.username) || [];
  for (const w of wins) {
    globalStart = Math.min(globalStart, toMin(w.start));
    globalEnd = Math.max(globalEnd, toMin(w.end));
  }
}

globalStart = Math.max(0, Math.min(24 * 60, globalStart));
globalEnd = Math.max(0, Math.min(24 * 60, globalEnd));

const work_start = minToHHMM(globalStart);
const work_end = minToHHMM(globalEnd);
const startMin = globalStart;
const endMin = globalEnd;

const default_effective_block_min = Math.max(15, Number(duration_min || 60)) + TRAVEL_BUFFER_MIN;

const all_slots = [];
for (let t = startMin; t < endMin; t += slot_step_min) {
  let base = Math.max(15, Number(duration_min || 60));
  let block = base + TRAVEL_BUFFER_MIN;

  if (t + block > endMin && t + base <= endMin) {
    block = base;
  }
  if (t + base > endMin && t + (base - TRAVEL_BUFFER_MIN) <= endMin) {
    base = Math.max(15, base - TRAVEL_BUFFER_MIN);
    block = base;
  }

  if (t + block > endMin) continue;

  all_slots.push({ start: minToHHMM(t), end: minToHHMM(t + block), service_min: base, block_min: block });
}

// build per-tech availability

    const techRows = [];
    for (const tech of techs) {
      const ts = toMin(tech.work_start || work_start);
      const te = toMin(tech.work_end || work_end);
      const wins = specialMap.get(tech.username) || [];
      const slots = [];
      for (const s of all_slots) {
        const t0 = toMin(s.start);
        let within = (t0 >= ts && t0 + (s.block_min || default_effective_block_min) <= te);
        if (!within) {
          for (const w of wins) {
            const ws = toMin(w.start);
            const we = toMin(w.end);
            if (t0 >= ws && t0 + (s.block_min || default_effective_block_min) <= we) { within = true; break; }
          }
        }
        if (!within) {
          slots.push({ start: s.start, end: s.end, available: false });
          continue;
        }
        const free = await isTechFree(tech.username, `${date}T${s.start}:00`, (s.service_min || duration_min), null);
        slots.push({ start: s.start, end: s.end, available: !!free });
      }
      techRows.push({ username: tech.username, full_name: tech.full_name || null, slots });
    }

    console.log("[admin_availability_by_tech_v2]", { date, tech_type, duration_min, tech_count: techs.length, slots: all_slots.length });
    res.json({ date, tech_type, work_start, work_end, duration_min, effective_block_min: default_effective_block_min, slot_step_min, tech_count: techs.length, all_slots, techs: techRows, // aliases for older admin UI code
      technicians: techs.map(t => ({ username: t.username, full_name: t.full_name || t.username })),
      slots_by_tech: Object.fromEntries((techRows||[]).map(tr => [tr.username, tr.slots || []]))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "โหลดตารางว่างไม่สำเร็จ" });
  }
});

app.get("/public/availability", async (req, res) => {
  const date = (req.query.date || getBangkokTodayYMD()).toString();
  const start = (req.query.start || "08:00").toString();
  const end = (req.query.end || "18:00").toString();
  const slotMin = Math.max(15, Math.min(120, Number(req.query.slot_min || 30)));

  try {
    // Customer booking availability must NOT depend on technician open/close status.
    // accept_status is reserved for urgent push offer flow only.
    const techR = await pool.query(`
      SELECT u.username
      FROM public.users u
      LEFT JOIN public.technician_profiles p ON p.username=u.username
      WHERE u.role='technician'
    `);
    const technicians = (techR.rows || []).map((r) => String(r.username || "").trim()).filter(Boolean);
    const techCount = technicians.length;

    const toMin = (hhmm) => {
      const [h, m] = hhmm.split(":").map((x) => Number(x || 0));
      return h * 60 + m;
    };
    const startMin = toMin(start);
    const endMin = toMin(end);

    const slots = [];
    for (let t = startMin; t + slotMin <= endMin; t += slotMin) slots.push(t);

    const result = [];
    for (const t of slots) {
      const hh = String(Math.floor(t / 60)).padStart(2, "0");
      const mm = String(t % 60).padStart(2, "0");
      const iso = `${date}T${hh}:${mm}:00+07:00`;
      let freeCount = 0;
      for (const tech of technicians) {
        if (await isTechFree(tech, iso, slotMin, null)) freeCount++;
      }
      result.push({
        time: `${hh}:${mm}`,
        available: techCount === 0 ? false : freeCount > 0,
        capacity: techCount,
        busy: Math.max(0, techCount - freeCount),
      });
    }

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
  // CWF Spec: conservative duration for schedule/collision
  const duration_min_v2 = computeDurationMinMulti(payloadV2, { source: "public_book", conservative: true });
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
    let techs = await listTechniciansByType(requestedTechType);

    // Option B strict matrix filter for customer booking (supports multi-services)
    // - If matrix DB read fails, skip filtering (fail-open) to avoid total outage.
    // - Enforce customer_slot_visible=true (hide trainees/assistants from customer booking slots).
    techs = techs.filter(t => t && t.customer_slot_visible !== false);
    if (Array.isArray(payloadV2.services) && payloadV2.services.length) {
      const normalizeJobKey = (s) => {
        const v = String(s || '').toLowerCase();
        if (!v) return null;
        if (v.includes('ติดตั้ง')) return 'install';
        if (v.includes('ซ่อม')) return 'repair';
        if (v.includes('ล้าง')) return 'wash';
        return null;
      };
      const normalizeAcKey = (s) => {
        const v = String(s || '').toLowerCase();
        if (!v) return null;
        if (v.includes('ผนัง') || v.includes('wall')) return 'wall';
        if (v.includes('สี่ทิศ') || v.includes('4') || v.includes('four')) return 'fourway';
        if (v.includes('แขวน')) return 'hanging';
        if (v.includes('ใต้ฝ้า') || v.includes('เปลือย') || v.includes('ฝัง')) return 'ceiling';
        return null;
      };
      const normalizeWashKey = (s) => {
        const v = String(s || '').toLowerCase();
        if (!v) return null;
        if (v.includes('ธรรมดา') || v.includes('normal')) return 'normal';
        if (v.includes('พรีเมียม') || v.includes('premium')) return 'premium';
        if (v.includes('แขวนคอย') || v.includes('coil')) return 'coil';
        if (v.includes('ตัดล้าง') || v.includes('overhaul') || v.includes('ใหญ่')) return 'overhaul';
        return null;
      };
      const listCriteria = payloadV2.services
        .map(s => ({ job: normalizeJobKey(s.job_type || payloadV2.job_type), ac: normalizeAcKey(s.ac_type), wash: normalizeWashKey(s.wash_variant), repair_variant: (s.repair_variant || null) }))
        .filter(c => c.job && c.ac);

      const mustTrue = (obj, key) => {
        if (!key) return true;
        if (!obj || typeof obj !== 'object') return false;
        return Boolean(obj[key]);
      };
      const techMatches = (mx, c) => {
        if (!mx || typeof mx !== 'object') return false;
        if (!mustTrue(mx.job_types, c.job)) return false;
        if (!mustTrue(mx.ac_types, c.ac)) return false;
        if (c.job === 'wash' && c.ac === 'wall') {
          if (!mustTrue(mx.wash_wall_variants, c.wash)) return false;
        }
        return true;
      };

      // batch load matrices
      let matrixOk = true;
      const usernames = techs.map(t => String(t.username));
      const matrixMap = new Map();
      try {
        const rMx = await pool.query(
          `SELECT username, matrix_json FROM public.technician_service_matrix WHERE username = ANY($1::text[])`,
          [usernames]
        );
        for (const row of (rMx.rows || [])) matrixMap.set(String(row.username), row.matrix_json || {});
      } catch (e) {
        matrixOk = false;
        console.warn('[public_book] loadServiceMatrixMap failed:', e.message);
      }

      if (matrixOk && listCriteria.length) {
        techs = techs.filter(t => {
          const u = String(t.username);
          if (!matrixMap.has(u)) return false; // strict
          const mx = matrixMap.get(u) || null;
          return listCriteria.every(c => techMatches(mx, c));
        });
      }
    }
    // Timezone-safe: normalize appointment datetime once (Asia/Bangkok)
    const startIso = normalizeAppointmentDatetime(appointment_datetime);
    const tMin = toMin(String(startIso).slice(11, 16));
    let anyFree = false;
    for (const tech of techs) {
      // CWF Spec: UI start window is LOCKED 09:00–18:00 (startable time only)
      if (!(tMin >= toMin('09:00') && tMin < toMin('18:00'))) continue;
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
const serviceLineItems = buildServiceLineItemsFromPayload(
  (payloadV2.services && Array.isArray(payloadV2.services))
    ? payloadV2
    : { ...payloadV2, services: [{
        job_type: payloadV2.job_type,
        ac_type: payloadV2.ac_type,
        btu: payloadV2.btu,
        machine_count: payloadV2.machine_count,
        wash_variant: payloadV2.wash_variant,
        repair_variant: payloadV2.repair_variant,
      }] }
);

// fallback (single service)
let computedItems = [];
let total = Number(standard_price || 0);

if (serviceLineItems.length) {
  computedItems = computedItems.concat(serviceLineItems);
  total = serviceLineItems.reduce((s,it)=> s + Number(it.line_total||0), 0);
} else if (total > 0) {
  // customer price fallback only; payroll will not treat this as technician income
  computedItems.push({ item_id: null, item_name: `ค่าบริการมาตรฐาน (${payloadV2.job_type || '-'})`, qty: 1, unit_price: total, line_total: total, is_service: false });
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

    // ✅ โปรโมชั่นฝั่งลูกค้า: ระบบเลือกให้อัตโนมัติตามเงื่อนไข (super admin ตั้งค่า)
    // IMPORTANT: "ราคา" ของงานต้องเป็นราคาพื้นฐานเดิม (ห้ามเปลี่ยนราคา)
    // - jobs.job_price เก็บ base_total เท่านั้น
    // - ส่วนลดบันทึกแยกที่ job_promotions.applied_discount
    const base_total = Number(total || 0);
    const promoPick = await findBestCustomerPromotion(payloadV2, base_total, client);
    const appliedPromo = promoPick?.promo || null;
    const appliedDiscount = Math.min(Number(base_total || 0), Number(promoPick?.discount || 0));

    // ✅ dispatch_mode:
    // - scheduled (ลูกค้าจองปกติ) => normal (ให้เข้าแอดมิน/คิวตามปกติ)
    // - urgent (ยิงงานด่วน)      => offer  (ไป flow offer)
    const dispatchMode = (bm === 'urgent') ? 'offer' : 'normal';

    const r = await client.query(
      `
      INSERT INTO public.jobs
      (customer_name, customer_phone, job_type, appointment_datetime, job_price,
       address_text, technician_team, technician_username, job_status,
       booking_token, job_source, dispatch_mode, customer_note,
       maps_url, job_zone, duration_min, booking_mode)
      VALUES ($1,$2,$3,$4,$5,$6,NULL,NULL,$11,$7,'customer',$14,$8,$9,$10,$12,$13)
      RETURNING job_id, booking_token
      `,
      [
        String(customer_name).trim(),
        (customer_phone || "").toString().trim(),
        String(job_type).trim(),
        appointment_datetime,
        Number(base_total || 0),
        String(address_text).trim(),
        token,
        (customer_note || "").toString(),
        (maps_url || "").toString(),
        (job_zone || "").toString(),
        bm === 'urgent' ? 'รอช่างยืนยัน' : 'รอตรวจสอบ',
        duration_min_v2,
        (bm === 'urgent' ? 'urgent' : 'scheduled'),
        dispatchMode,
      ]
    );

    // attach promo to job (if any)
    if(appliedPromo && appliedDiscount > 0){
      try{
        await client.query(
          `INSERT INTO public.job_promotions (job_id, promo_id, applied_discount)
           VALUES ($1,$2,$3)
           ON CONFLICT (job_id) DO UPDATE SET promo_id=EXCLUDED.promo_id, applied_discount=EXCLUDED.applied_discount`,
          [r.rows[0].job_id, Number(appliedPromo.promo_id), Number(appliedDiscount)]
        );
      }catch(e){
        // fail-open: don't break booking
        console.warn('[public_book] promo attach failed', e.message);
      }
    }

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
        INSERT INTO public.job_items (job_id, item_id, item_name, qty, unit_price, line_total, assigned_technician_username, is_service)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [job_id, it.item_id, it.item_name, it.qty, it.unit_price, it.line_total]
      );
    }

    await client.query("COMMIT");

    console.log('[public_book]', { job_id, booking_code, booking_mode: bm, requested_tech_type: requestedTechType, duration_min: duration_min_v2, effective_block_min: effectiveBlockMin(duration_min_v2) });
    res.json({
      success: true,
      job_id,
      booking_code,
      token: r.rows[0].booking_token,
      booking_mode: bm,
      duration_min: duration_min_v2,
      effective_block_min: effectiveBlockMin(duration_min_v2),
      travel_buffer_min: TRAVEL_BUFFER_MIN,
      applied_promo: (appliedPromo && appliedDiscount > 0) ? {
        promo_id: appliedPromo.promo_id,
        promo_name: appliedPromo.promo_name,
        promo_type: appliedPromo.promo_type,
        promo_value: appliedPromo.promo_value,
        discount: appliedDiscount,
      } : null,
      base_total: Number(base_total || 0),
    });
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
    const publicStatus = (rawStatus === "ตีกลับ" || rawStatus === "งานแก้ไข") ? "รอดำเนินการ" : rawStatus;

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

function sendHtml(file) {
  const p1 = path.join(FRONTEND_DIR, file);
  const p2 = path.join(ROOT_DIR, file);
  return fs.existsSync(p1) ? p1 : p2;
}

// Protected admin pages that also exist as root static files must be registered
// before express.static(ROOT_DIR), otherwise static serving can bypass auth.
app.get("/admin-partner-onboarding", requireAdminSession, (req, res) => res.sendFile(sendHtml("admin-partner-onboarding.html")));
app.get("/admin-partner-onboarding.html", requireAdminSession, (req, res) => res.sendFile(sendHtml("admin-partner-onboarding.html")));

if (fs.existsSync(FRONTEND_DIR)) app.use(express.static(FRONTEND_DIR));
app.use(express.static(ROOT_DIR));

// ✅ รองรับ Refresh/Deep-link แบบ "ไม่ต้องมี .html" (กันรีเฟรชเด้งไปหน้าแรก)
// - ตัวอย่าง: /tech, /admin, /track, /customer
app.get("/login", (req, res) => res.sendFile(sendHtml("login.html")));
// Admin landing: ใช้ V2 เป็นหลัก (หน้าเก่าเลิกใช้แล้ว)
app.get("/admin", (req, res) => res.redirect(302, "/admin-review-v2.html"));
app.get("/admin-add", (req, res) => res.sendFile(sendHtml("admin-add-v2.html")));
app.get("/admin-review", (req, res) => res.sendFile(sendHtml("admin-review-v2.html")));
app.get("/admin-queue", (req, res) => res.sendFile(sendHtml("admin-queue-v2.html")));
app.get("/admin-history", (req, res) => res.sendFile(sendHtml("admin-history-v2.html")));
app.get("/admin-tech", (req, res) => res.redirect(302, "/admin-review-v2.html"));
// หน้า legacy เลิกใช้แล้ว ให้ redirect ไป V2
app.get("/admin-legacy", (req, res) => res.redirect(302, "/admin-review-v2.html"));
app.get("/edit-profile", (req, res) => res.sendFile(sendHtml("edit-profile.html")));
app.get("/tech", (req, res) => res.sendFile(sendHtml("tech.html")));
app.get("/add-job", (req, res) => res.redirect(302, "/admin-add-v2.html"));
app.get("/customer", (req, res) => res.sendFile(sendHtml("customer.html")));
app.get("/partner-apply", (req, res) => res.sendFile(sendHtml("partner-apply.html")));
app.get("/partner-status", (req, res) => res.sendFile(sendHtml("partner-status.html")));
app.get("/partner-agreement", (req, res) => res.sendFile(sendHtml("partner-agreement.html")));
app.get("/partner-academy", (req, res) => res.sendFile(sendHtml("partner-academy.html")));
// ✅ หน้าใหม่: คำนวณราคาติดตั้งแอร์ (ลูกค้า)
app.get("/install-quote", (req, res) => res.sendFile(sendHtml("install-quote.html")));
// Canonical path: keep short URL, redirect direct-file access
app.get("/install-quote.html", (req, res) => res.redirect(302, "/install-quote"));
app.get("/register", (req, res) => res.sendFile(sendHtml("register.html")));
app.get("/track", (req, res) => res.sendFile(sendHtml("track.html")));
app.get("/home", (req, res) => res.sendFile(sendHtml("index.html")));

app.get("/login.html", (req, res) => res.sendFile(sendHtml("login.html")));
app.get("/admin.html", (req, res) => res.redirect(302, "/admin-review-v2.html"));
app.get("/admin-add-v2.html", (req, res) => res.sendFile(sendHtml("admin-add-v2.html")));
app.get("/admin-review-v2.html", (req, res) => res.sendFile(sendHtml("admin-review-v2.html")));
app.get("/admin-queue-v2.html", (req, res) => res.sendFile(sendHtml("admin-queue-v2.html")));
app.get("/admin-history-v2.html", (req, res) => res.sendFile(sendHtml("admin-history-v2.html")));
app.get("/admin-tech.html", (req, res) => res.redirect(302, "/admin-review-v2.html"));
app.get("/admin-legacy.html", (req, res) => res.redirect(302, "/admin-review-v2.html"));
app.get("/edit-profile.html", (req, res) => res.sendFile(sendHtml("edit-profile.html")));
app.get("/tech.html", (req, res) => res.sendFile(sendHtml("tech.html")));
app.get("/add-job.html", (req, res) => res.redirect(302, "/admin-add-v2.html"));
app.get("/register.html", (req, res) => res.sendFile(sendHtml("register.html")));
app.get("/partner-apply.html", (req, res) => res.sendFile(sendHtml("partner-apply.html")));
app.get("/partner-status.html", (req, res) => res.sendFile(sendHtml("partner-status.html")));
app.get("/partner-agreement.html", (req, res) => res.sendFile(sendHtml("partner-agreement.html")));
app.get("/partner-academy.html", (req, res) => res.sendFile(sendHtml("partner-academy.html")));
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
