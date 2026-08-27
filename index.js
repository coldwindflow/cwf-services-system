Y��x-���jם��i��+��j[h��ܢ���O5�n|��vo+^����ם/**
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
const { createCompressionMiddleware, staticOptions, uploadStaticOptions } = require("./server/middleware/staticAssetDelivery");
const normalizerHelpers = require("./server/normalizers");
const pricingHelpers = require("./server/pricing");
const jobTiming = require("./server/services/jobTiming");
const urgentPublicAdapter = require("./server/services/urgentPublicAdapter");
const urgentFinalizer = require("./server/services/urgent/finalizer");
const urgentCapability = require("./server/services/urgent/capability");
const { createUrgentDispatchService, normalizeUrgentTechType } = require("./server/services/urgent/dispatch");
const {
  SERVICE_ZONE_SEEDS,
  SERVICE_ZONE_BY_CODE,
  detectServiceZoneFromText,
  publicServiceZoneView,
} = require("./server/services/serviceZoneResolver");
const trackingPrivacy = require("./server/services/public/trackingPrivacy");
const customerPricingHelpers = require("./server/customerPricing");
const customerAuth = require("./server/customerAuth");
const technicianIncomeHelpers = require("./server/technicianIncome");
const customerLookupHelpers = require("./server/customerLookup");
const technicianJobIncomeDisplayHelpers = require("./server/technicianJobIncomeDisplay");
const technicianReworkHelpers = require("./server/technicianRework");
const technicianReworkIncome = require("./server/services/technicianReworkIncome");
const adminJobItemsHelpers = require("./server/adminJobItems");
const customerAvailability = require("./server/services/public/customerAvailability");
const { registerPublicCustomerAvailabilityRoutes } = require("./server/routes/public/customerAvailability");
const { registerAdminAvailabilityRoutes } = require("./server/routes/admin/adminAvailability");
const { createBookingJobService } = require("./server/services/booking/createBookingJob");
const scheduledCapability = require("./server/services/booking/scheduledCapability");
const { createCustomerCatalogQuoteService } = require("./server/services/booking/customerCatalogQuote");
const { calcBookingPricing } = require("./server/services/booking/exactPricing");
const { pendingCustomerScheduledReservationSql } = require("./server/services/booking/bookingStatuses");
const { createBookingApprovalService } = require("./server/services/booking/bookingApprovalService");
const { registerBookingApprovalRoutes } = require("./server/routes/admin/bookingApprovals");
const { registerPublicCustomerBookingRoutes } = require("./server/routes/public/customerBookings");
const { registerPublicServicePackageRoutes } = require("./server/routes/public/servicePackages");
const { createServicePackageResolver } = require("./server/services/packages/servicePackageResolver");
const { createPublicServicePackageService } = require("./server/services/public/servicePackages");
const { registerAdminBookingRoutes } = require("./server/routes/admin/adminBookings");
const { createServicePackageCatalogService } = require("./server/services/packages/servicePackageCatalogService");
const { createServicePackageCatalogRoutes } = require("./server/routes/admin/servicePackageCatalog");
const { createStoreServicePackageCatalogService } = require("./server/services/packages/storeServicePackageCatalogService");
const { createStoreServicePackageCatalogRoutes } = require("./server/routes/admin/storeServicePackageCatalog");
const { createTechnicianJobMoneyHelpers } = require("./server/technicianJobMoneySummary");
const createSystemRoutes = require("./server/routes/system");
const createTechnicianDirectoryRoutes = require("./server/routes/users/technicians");
const createCatalogItemRoutes = require("./server/routes/catalog/items");
const createCatalogReviewRoutes = require("./server/routes/catalog/reviews");
const { createHomepageRoutes, CONFIG_KEY: HOMEPAGE_CONFIG_KEY } = require("./server/routes/homepage");
const { createCustomerOrdersRoutes } = require("./server/routes/customerOrders");
const createCustomerHistoryRoutes = require("./server/routes/public/customerHistory");
const articleSync = require("./server/services/articleSync");
const createServiceZoneRoutes = require("./server/routes/serviceZones");
const createPageRoutes = require("./server/routes/pages");
const createDocumentRoutes = require("./server/routes/docs");
const createAccountingReadOnlyRoutes = require("./server/routes/accountingReadOnly");
const { ensurePayoutPeriodAndSnapshotForPayment } = require("./server/services/technicianPayoutPrepay");
const { buildAccountingPayoutCalendar, isPeriodCutoffClosed } = require("./server/services/technicianPayoutPeriods");
const accountingPayoutAdjustments = require("./server/services/accountingPayoutAdjustments");
const technicianDepositCollections = require("./server/services/technicianDepositCollections");
const technicianPayoutIntegrity = require("./server/services/technicianPayoutIntegrity");
const { createTechnicianCashCollectionService } = require("./server/services/technicianCashCollections");
const { createTechnicianDeductionPayoutApplyService } = require("./server/services/technicianDeductionPayoutApply");
const createAdminReworkDeductionsHelpers = require("./server/helpers/adminReworkDeductionsHelpers");
const createAdminReworkReadOnlyRoutes = require("./server/routes/adminReworkReadOnly");
const createAdminDeductionsReadOnlyRoutes = require("./server/routes/adminDeductionsReadOnly");
const createTechnicianBaseStatusDataHelpers = require("./server/helpers/technicianBaseStatusDataHelpers");
const createTechnicianBaseStatusReadOnlyRoutes = require("./server/routes/technicianBaseStatusReadOnly");
const createTechnicianCalendarReadOnlyRoutes = require("./server/routes/technicianCalendarReadOnly");
const createTechnicianCalendarWriteRoutes = require("./server/routes/technicianCalendarWrite");
const {
  toIsoDate,
  normWorkDayPayload,
  countLockedAdvanceJobsForDate,
  resolveTechnicianCalendarCaps,
  sourceForWorkDayPayload,
} = require("./server/lib/technicianCalendar");
const { upsertTechnicianProfile } = require("./server/services/technicianProfileUpsert");
const createTechnicianCountSummaryReadOnlyRoutes = require("./server/routes/technicianCountSummaryReadOnly");
const createAdminAiOfficeReadOnlyRoutes = require("./server/routes/adminAiOfficeReadOnly");
const createAdminAiBookingIntakeRoutes = require("./server/routes/adminAiBookingIntake");
const createAdminAiOfficeControlCenterRoutes = require("./server/routes/adminAiOfficeControlCenter");
const createAdminAiOfficeSharedMemoryV27Routes = require("./server/routes/adminAiOfficeSharedMemoryV27");
const createAdminAiOfficeLineDraftV27Routes = require("./server/routes/adminAiOfficeLineDraftV27");
const createAdminAiOfficeTrainingCenterV35BRoutes = require("./server/routes/adminAiOfficeTrainingCenterV35B");
const createAdminAiOfficeSmartAssistantV28Routes = require("./server/routes/adminAiOfficeSmartAssistantV28");
const createAdminAiOfficeAgentMemoryRoutes = require("./server/routes/adminAiOfficeAgentMemory");
const createAdminAiOfficeBrainV30Routes = require("./server/routes/adminAiOfficeBrainV30");
const { createLineWebhookRoutes, ensureLineInboxSchema } = require("./server/routes/lineWebhook");
const {
  calculateTechnicianBaseStatus,
} = require("./server/helpers/technicianBaseStatusScoring");

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
// Customer scheduled booking is controlled by the published Admin runtime
// switch (page_availability.scheduled). It is read for every request, needs no
// ENV or restart, and fails closed if the published configuration is unavailable.
const ENABLE_CUSTOMER_URGENT_BOOKING = envBool("ENABLE_CUSTOMER_URGENT_BOOKING", false);
const CWF_LINE_CONTACT_URL = String(process.env.CWF_LINE_CONTACT_URL || "https://lin.ee/fG1Oq7y").trim();
// Rate limits for the public tracking lookups (per client IP, per minute).
// Budgets cover a real customer's polling comfortably while making
// booking_code/token guessing impractical.
const publicTrackRateLimiter = trackingPrivacy.createPublicLookupRateLimiter({ windowMs: 60000, max: 30 });
const publicUrgentStatusRateLimiter = trackingPrivacy.createPublicLookupRateLimiter({ windowMs: 60000, max: 120 });
const publicDocsRateLimiter = trackingPrivacy.createPublicLookupRateLimiter({ windowMs: 60000, max: 20 });
// Public review is a WRITE gated by an identifier, so it gets two independent
// budgets: per trusted client IP, and per booking code/token (so one job's code
// can't be hammered from many IPs). Both must pass.
const publicReviewIpRateLimiter = trackingPrivacy.createPublicLookupRateLimiter({ windowMs: 60000, max: 15 });
const publicReviewKeyRateLimiter = trackingPrivacy.createPublicLookupRateLimiter({ windowMs: 600000, max: 8 });
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
const TRAVEL_BUFFER_MIN = jobTiming.TURNAROUND_BUFFER_MIN; // นาที/งาน (Travel Buffer)

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


async function cloudinaryDestroyPublicId(publicId, { resourceType = 'image', invalidate = true } = {}) {
  if (!CLOUDINARY_ENABLED) throw new Error('CLOUDINARY_NOT_CONFIGURED');
  const pid = String(publicId || '').trim();
  if (!pid) return { ok: true, skipped: true, public_id: pid };
  const safeResourceType = resourceType === 'raw' ? 'raw' : 'image';
  const ts = Math.floor(Date.now() / 1000);
  const params = { public_id: pid, timestamp: ts };
  if (invalidate) params.invalidate = true;
  const signature = cloudinarySignParams(params);
  const body = new URLSearchParams({
    public_id: pid,
    timestamp: String(ts),
    api_key: CLOUDINARY_API_KEY,
    signature,
  });
  if (invalidate) body.set('invalidate', 'true');
  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUDINARY_CLOUD_NAME)}/${safeResourceType}/destroy`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await resp.json().catch(() => ({}));
  const result = String(json?.result || '').toLowerCase();
  const ok = resp.ok && (result === 'ok' || result === 'not found');
  if (!ok) {
    const err = new Error(json?.error?.message || `Cloudinary destroy failed (${resp.status})`);
    err._cloudinary = json;
    err.public_id = pid;
    throw err;
  }
  return { ok: true, public_id: pid, result: json?.result || 'ok' };
}

async function cloudinaryDestroyMany(publicIds = []) {
  const unique = [...new Set((publicIds || []).map(x => String(x || '').trim()).filter(Boolean))];
  const rows = [];
  for (const publicId of unique) {
    try {
      const r = await cloudinaryDestroyPublicId(publicId);
      rows.push({ public_id: publicId, ok: true, result: r.result || 'ok' });
    } catch (e) {
      console.error('[photos/delete] Cloudinary destroy failed', { public_id: publicId, error: e?.message || e });
      rows.push({ public_id: publicId, ok: false, error: e?.message || 'Cloudinary destroy failed' });
    }
  }
  return rows;
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
const technicianCashCollections = createTechnicianCashCollectionService({ pool, periodBoundsForYm: _periodBoundsForYm, money: _money });
const technicianDeductionPayoutApply = createTechnicianDeductionPayoutApplyService();

const app = express();
// Render/Reverse-proxy: allow req.protocol to reflect X-Forwarded-Proto
app.set('trust proxy', 1);
// Issue 314: compress text responses before anything else can send one, so API
// JSON and the Customer App shell both benefit. See server/middleware/staticAssetDelivery.js.
app.use(createCompressionMiddleware());
app.use(cors());
app.use(createLineWebhookRoutes({ pool }));
app.use(express.json({
  verify: (req, _res, buf) => {
    const pathOnly = String(req.originalUrl || req.url || "").split("?")[0];
    if (pathOnly === "/webhooks/omise") req.rawBody = Buffer.from(buf);
  },
}));
app.use(customerAuth.createCustomerAuthRoutes({ pool, env: process.env, logger: console }));

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

const CUSTOMER_APP_BOOKING_URL = "/customer-app/index.html#booking";
const CUSTOMER_APP_PROFILE_URL = "/customer-app/index.html#profile";
const CUSTOMER_APP_TRACKING_URL = "/customer-app/index.html#tracking";

function legacyTrackingRedirectTarget(req) {
  const credential = String(req.query?.q || req.query?.token || "").trim();
  return credential
    ? `${CUSTOMER_APP_TRACKING_URL}?q=${encodeURIComponent(credential)}`
    : CUSTOMER_APP_TRACKING_URL;
}

function redirectLegacyCustomerPage(res, destination) {
  res.set("Cache-Control", "private, no-store");
  res.set("Referrer-Policy", "no-referrer");
  return res.redirect(302, destination);
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

app.use(createCustomerHistoryRoutes({ pool, requireCustomerJwt, getSecret: getJwtSecret, logger: console }));

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

    if (!code) return redirectLegacyCustomerPage(res, CUSTOMER_APP_PROFILE_URL);
    if (!state || !stateCookie || state !== stateCookie) {
      return redirectLegacyCustomerPage(res, CUSTOMER_APP_PROFILE_URL);
    }

    const clientId = String(process.env.LINE_CHANNEL_ID || '').trim();
    const clientSecret = String(process.env.LINE_CHANNEL_SECRET || '').trim();
    const callback = String(process.env.LINE_CALLBACK_URL || '').trim() || `${getReqBaseUrl(req)}/auth/line/callback`;
    const jwtSecret = getJwtSecret();
    if (!clientId || !clientSecret) return redirectLegacyCustomerPage(res, CUSTOMER_APP_PROFILE_URL);
    if (!jwtSecret) return redirectLegacyCustomerPage(res, CUSTOMER_APP_PROFILE_URL);

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
      return redirectLegacyCustomerPage(res, CUSTOMER_APP_PROFILE_URL);
    }
    const accessToken = String(tokenJson?.access_token || '').trim();
    if (!accessToken) return redirectLegacyCustomerPage(res, CUSTOMER_APP_PROFILE_URL);

    // Fetch profile
    const profRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profText = await profRes.text().catch(()=> '');
    let prof = {};
    try{ prof = profText ? JSON.parse(profText) : {}; }catch(_){ prof = {}; }
    if (!profRes.ok) {
      console.error('[LINE_PROFILE_HTTP]', profRes.status, profText);
      return redirectLegacyCustomerPage(res, CUSTOMER_APP_PROFILE_URL);
    }
    const userId = String(prof?.userId || '').trim();
    const name = String(prof?.displayName || '').trim();
    const picture = String(prof?.pictureUrl || '').trim();
    if (!userId) return redirectLegacyCustomerPage(res, CUSTOMER_APP_PROFILE_URL);

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
    return redirectLegacyCustomerPage(res, CUSTOMER_APP_PROFILE_URL);
  } catch (e) {
    console.error('[LINE_CALLBACK_ERROR]', e);
    return redirectLegacyCustomerPage(res, CUSTOMER_APP_PROFILE_URL);
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

app.get('/public/me', async (req, res) => {
  try {
    const jwtSecret = getJwtSecret();
    if (!jwtSecret) return res.json({ logged_in: false });
    const token = parseCookieValue(req, 'cwf_token');
    if (!token) return res.json({ logged_in: false });
    const payload = jwtVerify(token, jwtSecret);
    if (!payload) return res.json({ logged_in: false });
    return res.json(await customerAuth.publicMePayload({ pool, payload }));
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
  return redirectLegacyCustomerPage(res, CUSTOMER_APP_PROFILE_URL);
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
  return normalizerHelpers.normalizePhone(phone);
}

function buildPhoneLookupCandidates(phone) {
  return customerLookupHelpers.buildPhoneLookupCandidates(phone);
}

// =======================================
// 📷 UPLOADS CONFIG (ต้องอยู่ก่อน route ที่ใช้ upload)
// - แก้ Deploy crash: "Cannot access 'upload' before initialization"
// =======================================
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }, // 12MB
});

app.use("/uploads", express.static(path.join(__dirname, "uploads"), uploadStaticOptions()));

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

      if (['accounting_manage_revenue', 'accounting_mark_payout_paid', 'accounting_manage_expense', 'accounting_manage_documents'].includes(key)) {
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

async function logAccountingAudit(req, { action, entity_type, entity_id = null, before_json = null, after_json = null, note = null } = {}, opts = {}) {
  try {
    const actor = _accountingActor(req);
    const db = opts.client || pool;
    await db.query(
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
    if (opts.strict) throw e;
    console.warn('[accounting_audit] log failed:', e.message);
  }
}

const DEDUCTION_TYPES = new Set([
  'late_arrival','missing_status_update','missing_required_photos','poor_work_quality',
  'customer_complaint_valid','left_before_complete','no_show','same_day_cancel',
  'warranty_rework_minor','warranty_rework_major','rework_failed','replacement_technician_cost',
  'customer_property_damage','company_equipment_damage','off_platform_payment',
  'confidentiality_breach','fraud_or_false_report','deposit_installment',
  'deposit_damage_offset','manual_adjustment','overpayment_recovery'
]);
const DEDUCTION_SEVERITIES = new Set(['low','medium','high','critical']);
const REWORK_REASON_TYPES = new Set(['water_leak','not_clean','customer_complaint','missing_photos','same_issue_not_fixed','poor_work_standard','other']);
const REWORK_RESOLUTIONS = new Set(['fixed','failed','changed_technician','company_absorbed','deduction_required']);
const PAYOUT_DEDUCTION_WARNING = 'เมื่ออนุมัติแล้ว ระบบจะหักจริงในงวดจ่ายช่างผ่าน payout adjustment แบบ audit ได้ทันที';

function getActorUsername(req) {
  const actor = req?.actor || req?.auth || req?.effective || {};
  return String(actor.username || '').trim() || null;
}

function getActorRole(req) {
  const actor = req?.actor || req?.auth || req?.effective || {};
  return normalizeRole(actor.role || '') || null;
}

async function generateDeductionCaseCode(client) {
  const prefix = `DED-${new Date().toISOString().slice(0,10).replace(/-/g,'')}`;
  for (let i = 0; i < 8; i++) {
    const r = await client.query(`SELECT nextval(pg_get_serial_sequence('public.technician_deduction_cases','case_id')) AS n`);
    const code = `${prefix}-${String(r.rows[0].n).padStart(6,'0')}`;
    const exists = await client.query(`SELECT 1 FROM public.technician_deduction_cases WHERE case_code=$1 LIMIT 1`, [code]);
    if (!exists.rows.length) return code;
  }
  return `${prefix}-${Date.now()}`;
}

async function generateReworkCaseCode(client) {
  const prefix = `RW-${new Date().toISOString().slice(0,10).replace(/-/g,'')}`;
  for (let i = 0; i < 8; i++) {
    const r = await client.query(`SELECT nextval(pg_get_serial_sequence('public.technician_rework_cases','rework_case_id')) AS n`);
    const code = `${prefix}-${String(r.rows[0].n).padStart(6,'0')}`;
    const exists = await client.query(`SELECT 1 FROM public.technician_rework_cases WHERE case_code=$1 LIMIT 1`, [code]);
    if (!exists.rows.length) return code;
  }
  return `${prefix}-${Date.now()}`;
}

async function logDeductionAudit(client, req, { action, entity_type, entity_id = null, before = null, after = null, note = null } = {}) {
  await client.query(
    `INSERT INTO public.technician_deduction_audit_logs
      (actor_username, actor_role, action, entity_type, entity_id, before_json, after_json, note)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`,
    [
      getActorUsername(req),
      getActorRole(req),
      String(action || '').trim(),
      String(entity_type || '').trim(),
      entity_id == null ? null : String(entity_id),
      before == null ? null : JSON.stringify(before),
      after == null ? null : JSON.stringify(after),
      note == null ? null : String(note),
    ]
  );
}

function validateDeductionType(type) {
  return DEDUCTION_TYPES.has(String(type || '').trim());
}

function validateSeverity(severity) {
  return DEDUCTION_SEVERITIES.has(String(severity || '').trim());
}

function validateDeductionStatusTransition(from, to) {
  const key = `${String(from || '').trim()}->${String(to || '').trim()}`;
  return new Set([
    'open->pending_approval',
    'pending_approval->approved',
    'pending_approval->rejected',
    'open->voided',
    'pending_approval->voided',
    'approved->voided',
  ]).has(key);
}

function normalizeEvidenceJson(input) {
  if (input == null || input === '') return [];
  if (Array.isArray(input)) return input.slice(0, 30);
  if (typeof input === 'object') return input;
  const s = String(input || '').trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed.slice(0, 30);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  return [{ note: s.slice(0, 2000) }];
}

function deductionListFilters(query = {}) {
  const where = [];
  const params = [];
  let p = 1;
  const add = (sql, val) => { params.push(val); where.push(sql.replace('?', `$${p++}`)); };
  if (query.from) add(`created_at >= ?::timestamptz`, `${String(query.from).slice(0,10)} 00:00:00+07:00`);
  if (query.to) add(`created_at <= ?::timestamptz`, `${String(query.to).slice(0,10)} 23:59:59+07:00`);
  if (query.technician_username) add(`technician_username = ?`, String(query.technician_username).trim());
  if (query.status) add(`status = ?`, String(query.status).trim());
  if (query.deduction_type) add(`deduction_type = ?`, String(query.deduction_type).trim());
  if (query.severity) add(`severity = ?`, String(query.severity).trim());
  if (query.job_id) add(`job_id = ?`, Number(query.job_id));
  if (String(query.pending_approval || '') === '1') add(`status = ?`, 'pending_approval');
  return { where, params, p };
}

async function assertTechnicianExistsIfSafe(client, username) {
  const u = String(username || '').trim();
  if (!u) return false;
  try {
    const r = await client.query(
      `SELECT 1 FROM public.users WHERE username=$1
       UNION SELECT 1 FROM public.technician_profiles WHERE username=$1
       LIMIT 1`,
      [u]
    );
    return !!r.rows.length;
  } catch (e) {
    console.warn('[deductions] technician validation skipped:', e.message);
    return true;
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
        (j.technician_username = $2 AND NOT ${pendingCustomerScheduledReservationSql("j")})
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
    res.status(401).json({ error: 'UNAUTHORIZED', code: 'AUTH_REQUIRED' });
    return null;
  }
  const ok = await assertTechBelongsToJob(clientOrPool, realId, tech);
  if (!ok) {
    res.status(403).json({ error: 'ช่างคนนี้ไม่ได้อยู่ในทีมของงานนี้', code: 'TECH_NOT_ASSIGNED' });
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
<p>หลักการสำคัญ: เรทนี้เป็น เรทพาร์ทเนอร์เท่านั้น ไม่ใช่เรทที่จะได้รับบริษัท เริ่มต้นที่ 400 บาท สำหรับงานล้างปกติ ไม่เกิน 12,000 BTU เครื่องที่ 1</p>
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
    contract_version: row.contract_version || null,
    contract_accepted_at: row.contract_accepted_at || null,
    contract_accepted_ip: row.contract_accepted_ip || null,
    contract_acceptance_json: row.contract_acceptance_json || {},
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
  const consent_contract_rate = body.consent_contract_rate === true || body.consent_contract_rate === 'true' || body.consent_contract_rate === 1 || body.consent_contract_rate === '1';
  const consent_deposit = body.consent_deposit === true || body.consent_deposit === 'true' || body.consent_deposit === 1 || body.consent_deposit === '1';

  if (!full_name) return res.status(400).json({ error: 'กรุณากรอกชื่อ-นามสกุล' });
  if (!phone) return res.status(400).json({ error: 'กรุณากรอกเบอร์โทร' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'กรุณาตั้งรหัสผ่านอย่างน้อย 6 ตัวอักษร' });
  if (password !== confirm_password) return res.status(400).json({ error: 'ยืนยันรหัสผ่านไม่ตรงกัน' });
  if (!consent_pdpa || !consent_terms || !consent_contract_rate || !consent_deposit) return res.status(400).json({ error: 'กรุณายอมรับ PDPA เงื่อนไขการสมัคร สัญญาเรทเดียว และเงินประกันก่อนส่งใบสมัคร' });

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
         service_radius_km, equipment_json, line_user_id, account_created_at, account_note,
         contract_version, contract_accepted_at, contract_accepted_ip, contract_user_agent, contract_acceptance_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'submitted',NOW(),NOW(),
         $21,$22,$23,$24,$25::jsonb,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35::jsonb,$36,NOW(),$37,
         $38,NOW(),$39,$40,$41::jsonb)
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
        'partner_single_rate_2026_05',
        req.ip || null,
        String(req.headers['user-agent'] || '').slice(0, 500),
        JSON.stringify({
          consent_terms,
          consent_contract_rate,
          consent_deposit,
          accepted_contract_pdf: '/docs/CWF_partner_contract_single_rate_2026.pdf',
          accepted_contract_version: 'partner_single_rate_2026_05',
          accepted_at: new Date().toISOString(),
        }),
      ]
    );
    const appRow = r.rows[0];
    await client.query(
      `UPDATE public.partner_applications
          SET tax_id=$2, tax_address=$3, tax_branch=$4, wht_income_type=$5, wht_default_rate=$6, updated_at=NOW()
        WHERE id=$1`,
      [appRow.id, tax_id, tax_address, tax_branch, wht_income_type, wht_default_rate]
    );
    if (tax_id || tax_address) {
      await client.query(
        `UPDATE public.technician_profiles
            SET tax_id=COALESCE($2, tax_id),
                tax_address=COALESCE($3, tax_address),
                tax_branch=COALESCE($4, tax_branch),
                wht_income_type=COALESCE($5, wht_income_type),
                wht_default_rate=COALESCE($6, wht_default_rate),
                tax_profile_status=CASE WHEN COALESCE($2,'')<>'' AND COALESCE($3,'')<>'' THEN 'pending_review' ELSE COALESCE(tax_profile_status,'not_submitted') END,
                updated_at=NOW()
          WHERE username=$1`,
        [account.username, tax_id, tax_address, tax_branch, wht_income_type, wht_default_rate]
      );
    }
    await logPartnerOnboardingEvent(client, {
      application_id: appRow.id,
      actor_type: 'applicant',
      event_type: 'application_submitted',
      to_status: 'submitted',
      note: 'Partner application submitted with partner_single_rate_2026_05 acceptance',
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
    if (template && Number(template.version || 0) >= 4) {
      const rateCtx = await _loadActiveTechnicianIncomeRateSet('partner');
      template.content_html = _buildPartnerAgreementV4RateHtml(rateCtx.rate_source === 'database' ? rateCtx.items : CWF_TECHNICIAN_INCOME_DEFAULT_ITEMS);
      template.source_note = `${template.source_note || 'TECHNICIAN_INCOME_RATE_SET_V4'};rate_source=${rateCtx.rate_source};rate_set=${rateCtx.rate_set_version || 'fallback'}`;
    }
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
    if (Number(tpl.version || 0) >= 4) {
      const rateCtx = await _loadActiveTechnicianIncomeRateSet('partner');
      tpl.content_html = _buildPartnerAgreementV4RateHtml(rateCtx.rate_source === 'database' ? rateCtx.items : CWF_TECHNICIAN_INCOME_DEFAULT_ITEMS);
      tpl.source_note = `${tpl.source_note || 'TECHNICIAN_INCOME_RATE_SET_V4'};rate_source=${rateCtx.rate_source};rate_set=${rateCtx.rate_set_version || 'fallback'}`;
    }
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

app.use(createAdminAiOfficeControlCenterRoutes({ pool, requireAdminSession }));
app.use(createAdminAiOfficeSharedMemoryV27Routes({ pool, requireAdminSession }));
app.use(createAdminAiOfficeLineDraftV27Routes({ pool, requireAdminSession }));
app.use(createAdminAiOfficeTrainingCenterV35BRoutes({ pool, requireAdminSession }));
app.use(createAdminAiOfficeSmartAssistantV28Routes({ pool, requireAdminSession }));
app.use(createAdminAiOfficeBrainV30Routes({ pool, requireAdminSession }));
app.use(createAdminAiOfficeAgentMemoryRoutes({ pool, requireAdminSession }));
app.use(createAdminAiOfficeReadOnlyRoutes({ pool, requireAdminSession }));
app.use(createAdminAiBookingIntakeRoutes({ pool, requireAdminSession }));
app.get("/ai-office", aiOfficeNoCache, requireAdminSession, (req, res) => res.sendFile(sendHtml("admin-ai-office.html")));
app.get("/admin/ai-office", aiOfficeNoCache, requireAdminSession, (req, res) => res.sendFile(sendHtml("admin-ai-office.html")));
app.get("/admin/ai-office.html", aiOfficeNoCache, requireAdminSession, (req, res) => res.sendFile(sendHtml("admin-ai-office.html")));
app.get("/admin-ai-office.html", aiOfficeNoCache, requireAdminSession, (req, res) => res.sendFile(sendHtml("admin-ai-office.html")));
app.get("/admin-ai-office.css", aiOfficeNoCache, requireAdminSession, (req, res) => res.sendFile(sendHtml("admin-ai-office.css")));
app.get("/admin-ai-office.js", aiOfficeNoCache, requireAdminSession, (req, res) => res.sendFile(sendHtml("admin-ai-office.js")));
["admin","ops","sales","content","dev"].forEach((pageName) => {
  const fileName = `admin-ai-office-${pageName}.html`;
  app.get(`/admin-ai-office-${pageName}.html`, aiOfficeNoCache, requireAdminSession, (req, res) => res.sendFile(sendHtml(fileName)));
  app.get(`/admin/ai-office/${pageName}`, aiOfficeNoCache, requireAdminSession, (req, res) => res.sendFile(sendHtml(fileName)));
});
app.get("/admin-ai-control-center.js", aiOfficeNoCache, requireAdminSession, (req, res) => res.sendFile(sendHtml("admin-ai-control-center.js")));
app.get("/admin-ai-line-control.html", aiOfficeNoCache, requireAdminSession, (req, res) => res.sendFile(sendHtml("admin-ai-line-control.html")));
app.get("/admin/ai-office/line-control", aiOfficeNoCache, requireAdminSession, (req, res) => res.sendFile(sendHtml("admin-ai-line-control.html")));
app.get("/admin/ai-office/line-control.html", aiOfficeNoCache, requireAdminSession, (req, res) => res.sendFile(sendHtml("admin-ai-line-control.html")));

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
      await expireTechnicianAcceptStatuses(pool);
      const tq = await pool.query(
        `SELECT
           CASE WHEN LOWER(COALESCE(p.employment_type,'company')) IN ('partner','พาร์ทเนอร์') THEN 'partner' ELSE 'company' END AS tech_type,
           CASE WHEN LOWER(COALESCE(p.accept_status,'paused')) IN ('ready','open','available','รับงาน') AND p.accept_status_expires_at IS NOT NULL AND p.accept_status_expires_at > NOW() THEN 'open' ELSE 'closed' END AS bucket,
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

// Customer appointment confirmation template (Super Admin)
app.get('/admin/super/customer_confirmation_template', requireSuperAdmin, async (req, res) => {
  try {
    await ensureCustomerMessageTemplatesTable();
    const q = await pool.query(
      `SELECT template_key, lang, template_text, enabled, updated_by, updated_at
         FROM public.customer_message_templates
        WHERE template_key=$1
        ORDER BY lang ASC`,
      [CUSTOMER_CONFIRMATION_TEMPLATE_KEY]
    );
    const rows = q.rows || [];
    const byLang = {};
    for (const r of rows) byLang[String(r.lang || 'th')] = r;
    return res.json({
      ok: true,
      template_key: CUSTOMER_CONFIRMATION_TEMPLATE_KEY,
      placeholders: CUSTOMER_CONFIRMATION_PLACEHOLDERS,
      defaults: DEFAULT_CUSTOMER_CONFIRMATION_TEMPLATES,
      templates: {
        th: byLang.th || { lang:'th', template_text: DEFAULT_CUSTOMER_CONFIRMATION_TEMPLATES.th, enabled:true },
        en: byLang.en || { lang:'en', template_text: DEFAULT_CUSTOMER_CONFIRMATION_TEMPLATES.en, enabled:true },
      }
    });
  } catch (e) {
    console.error('GET /admin/super/customer_confirmation_template', e);
    return res.status(500).json({ error: 'โหลดข้อความยืนยันนัดไม่สำเร็จ' });
  }
});

app.post('/admin/super/customer_confirmation_template', requireSuperAdmin, async (req, res) => {
  try {
    await ensureCustomerMessageTemplatesTable();
    const lang = String(req.body?.lang || 'th').toLowerCase() === 'en' ? 'en' : 'th';
    const reset = !!req.body?.reset;
    const template_text = reset
      ? DEFAULT_CUSTOMER_CONFIRMATION_TEMPLATES[lang]
      : String(req.body?.template_text || '').trim();
    if (!template_text || template_text.length < 20) {
      return res.status(400).json({ error: 'ข้อความสั้นเกินไปหรือไม่ครบ' });
    }
    const missing = missingCustomerConfirmationPlaceholders(template_text, lang);
    if (missing.length) {
      return res.status(400).json({ error: `ยังบันทึกไม่ได้ ขาดตัวแปรจำเป็น: ${missing.map(k => `{{${k}}}`).join(', ')}`, missing_placeholders: missing });
    }
    await pool.query(
      `INSERT INTO public.customer_message_templates(template_key, lang, template_text, enabled, updated_by, updated_at)
       VALUES($1,$2,$3,TRUE,$4,NOW())
       ON CONFLICT (template_key, lang)
       DO UPDATE SET template_text=EXCLUDED.template_text, enabled=TRUE, updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
      [CUSTOMER_CONFIRMATION_TEMPLATE_KEY, lang, template_text, req.actor?.username || null]
    );
    await auditLog(req, {
      action: reset ? 'CUSTOMER_CONFIRMATION_TEMPLATE_RESET' : 'CUSTOMER_CONFIRMATION_TEMPLATE_UPDATE',
      target_role: 'message_template',
      target_username: CUSTOMER_CONFIRMATION_TEMPLATE_KEY,
      meta: { lang, length: template_text.length }
    });
    return res.json({ ok: true, lang, template_text });
  } catch (e) {
    console.error('POST /admin/super/customer_confirmation_template', e);
    return res.status(500).json({ error: 'บันทึกข้อความยืนยันนัดไม่สำเร็จ' });
  }
});

app.post('/admin/super/customer_confirmation_template/preview', requireSuperAdmin, async (req, res) => {
  try {
    const lang = String(req.body?.lang || 'th').toLowerCase() === 'en' ? 'en' : 'th';
    const template = String(req.body?.template_text || '').trim() || DEFAULT_CUSTOMER_CONFIRMATION_TEMPLATES[lang];
    const origin = `${req.protocol}://${req.get('host')}`;
    const sampleJob = {
      job_id: 250,
      booking_code: 'CWF4P7YAPX',
      customer_name: 'Test ลูกค้า',
      customer_phone: '0987654321',
      appointment_datetime: new Date(),
      address_text: 'อ่อนนุช ถนนสุขุมวิท กรุงเทพฯ',
      job_type: 'ล้าง',
      job_price: 1600,
    };
    const dt = new Date(sampleJob.appointment_datetime);
    const vars = buildCustomerConfirmationVars({
      job: sampleJob,
      items: [{ item_name:'ล้างแอร์ผนัง ไม่เกิน 12,000 BTU', qty:2, unit_price:800, line_total:1600 }],
      origin,
      ddTH: dt.toLocaleDateString('th-TH', { timeZone:'Asia/Bangkok' }),
      ttTH: dt.toLocaleTimeString('th-TH', { timeZone:'Asia/Bangkok', hour:'2-digit', minute:'2-digit' }),
      ddEN: dt.toLocaleDateString('en-GB', { timeZone:'Asia/Bangkok' }),
      ttEN: dt.toLocaleTimeString('en-GB', { timeZone:'Asia/Bangkok', hour:'2-digit', minute:'2-digit' }),
    });
    return res.json({ ok:true, text: renderCustomerConfirmationTemplate(template, vars) });
  } catch (e) {
    console.error('POST /admin/super/customer_confirmation_template/preview', e);
    return res.status(500).json({ error: 'preview ไม่สำเร็จ' });
  }
});

// =======================================
// 💲 Technician Income Settings (ISSUE-2/3)
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

async function _insertRateAudit(clientOrPool, req, { rate_set_id, action, field_name = null, old_value = null, new_value = null }) {
  await clientOrPool.query(
    `INSERT INTO public.technician_income_rate_audit_logs
      (rate_set_id, action, field_name, old_value, new_value, actor_username, actor_role, ip_address, user_agent)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      rate_set_id || null,
      action,
      field_name,
      old_value == null ? null : String(old_value),
      new_value == null ? null : String(new_value),
      req.actor?.username || null,
      req.actor?.role || 'super_admin',
      req.ip || null,
      String(req.headers['user-agent'] || '').slice(0, 500)
    ]
  );
}
function _sanitizeRateItemsPayload(items) {
  if (!Array.isArray(items) || !items.length) {
    const err = new Error('INVALID_RATE_ITEMS'); err.statusCode = 400; throw err;
  }
  const cleaned = items.map((it, idx) => ({
    ac_type_key: String(it.ac_type_key || '').trim(),
    wash_type_key: String(it.wash_type_key || '').trim(),
    btu_tier: String(it.btu_tier || '').trim(),
    step_from: Number(it.step_from || 0),
    step_to: it.step_to == null || it.step_to === '' ? null : Number(it.step_to),
    amount: Number(it.amount),
    unit: 'per_unit',
    sort_order: Number.isFinite(Number(it.sort_order)) ? Number(it.sort_order) : idx + 1,
  }));
  for (const it of cleaned) {
    if (!_validTechRateItemShape(it)) {
      const err = new Error('INVALID_RATE_COMBINATION'); err.statusCode = 400; throw err;
    }
  }
  const keys = new Set();
  for (const it of cleaned) {
    const k = `${it.ac_type_key}|${it.wash_type_key}|${it.btu_tier}|${it.step_from}|${it.step_to == null ? '' : it.step_to}`;
    if (keys.has(k)) { const err = new Error('DUPLICATE_RATE_ROW'); err.statusCode = 400; throw err; }
    keys.add(k);
  }
  return cleaned;
}
async function _fetchRateSetWithItems(rateSetId) {
  const rs = await pool.query(`SELECT * FROM public.technician_income_rate_sets WHERE id=$1 LIMIT 1`, [rateSetId]);
  const rate_set = rs.rows?.[0] || null;
  if (!rate_set) return null;
  const items = await pool.query(
    `SELECT id, rate_set_id, ac_type_key, wash_type_key, btu_tier, step_from, step_to, amount, unit, sort_order, created_at, updated_at
       FROM public.technician_income_rate_items
      WHERE rate_set_id=$1
      ORDER BY sort_order ASC, id ASC`,
    [rateSetId]
  );
  return { rate_set, items: items.rows || [] };
}

app.get('/api/super/technician-income-rates', requireSuperAdmin, async (req, res) => {
  try {
    const active = await pool.query(
      `SELECT * FROM public.technician_income_rate_sets WHERE contract_type='partner' AND status='active' ORDER BY activated_at DESC NULLS LAST, id DESC LIMIT 1`
    );
    const drafts = await pool.query(
      `SELECT * FROM public.technician_income_rate_sets WHERE contract_type='partner' AND status='draft' ORDER BY updated_at DESC, id DESC LIMIT 5`
    );
    const activeFull = active.rows?.[0] ? await _fetchRateSetWithItems(active.rows[0].id) : null;
    const draftFull = [];
    for (const d of (drafts.rows || [])) {
      const full = await _fetchRateSetWithItems(d.id);
      if (full) draftFull.push(full);
    }
    return res.json({
      ok: true,
      active: activeFull,
      drafts: draftFull,
      fallback_items: CWF_TECHNICIAN_INCOME_DEFAULT_ITEMS,
      warning: activeFull ? '' : 'ยังไม่มี active rate set ในฐานข้อมูล ระบบจะใช้ fallback v4 ชั่วคราว'
    });
  } catch (e) {
    console.error('GET /api/super/technician-income-rates', e);
    return res.status(500).json({ ok:false, error:'LOAD_TECH_RATE_SET_FAILED' });
  }
});

app.post('/api/super/technician-income-rates/draft', requireSuperAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const active = await client.query(
      `SELECT * FROM public.technician_income_rate_sets WHERE contract_type='partner' AND status='active' ORDER BY activated_at DESC NULLS LAST, id DESC LIMIT 1`
    );
    const src = active.rows?.[0] || null;
    const version = String(req.body?.version || `partner_v4_draft_${Date.now()}`).trim().slice(0, 80);
    const name = String(req.body?.name || `Draft from ${src?.version || 'fallback v4'}`).trim().slice(0, 200);
    const rs = await client.query(
      `INSERT INTO public.technician_income_rate_sets(version, name, contract_type, status, effective_from, notes, created_by, updated_by)
       VALUES($1,$2,'partner','draft',NOW(),$3,$4,$4)
       RETURNING *`,
      [version, name, String(req.body?.notes || '').trim() || 'Draft created from active technician income rates', req.actor.username]
    );
    const newId = rs.rows[0].id;
    const srcItems = src
      ? (await client.query(`SELECT * FROM public.technician_income_rate_items WHERE rate_set_id=$1 ORDER BY sort_order ASC, id ASC`, [src.id])).rows
      : CWF_TECHNICIAN_INCOME_DEFAULT_ITEMS;
    for (const it of srcItems) {
      await client.query(
        `INSERT INTO public.technician_income_rate_items
          (rate_set_id, ac_type_key, wash_type_key, btu_tier, step_from, step_to, amount, unit, sort_order)
         VALUES($1,$2,$3,$4,$5,$6,$7,'per_unit',$8)`,
        [newId, it.ac_type_key, it.wash_type_key, it.btu_tier, it.step_from, it.step_to, it.amount, it.sort_order]
      );
    }
    await _insertRateAudit(client, req, { rate_set_id: newId, action:'create_draft', field_name:'source', new_value: src?.version || 'fallback_v4' });
    await auditLog(req, { action:'TECH_INCOME_RATE_DRAFT_CREATE', meta:{ rate_set_id:newId, source_rate_set_id:src?.id || null } });
    await client.query('COMMIT');
    return res.json({ ok:true, draft: await _fetchRateSetWithItems(newId) });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('POST /api/super/technician-income-rates/draft', e);
    return res.status(Number(e.statusCode || 500)).json({ ok:false, error:e.message || 'CREATE_DRAFT_FAILED' });
  } finally {
    client.release();
  }
});

app.put('/api/super/technician-income-rates/:rate_set_id/items', requireSuperAdmin, async (req, res) => {
  const rateSetId = Number(req.params.rate_set_id);
  if (!Number.isFinite(rateSetId) || rateSetId <= 0) return res.status(400).json({ ok:false, error:'INVALID_RATE_SET_ID' });
  const client = await pool.connect();
  try {
    const items = _sanitizeRateItemsPayload(req.body?.items);
    await client.query('BEGIN');
    const rs = await client.query(`SELECT * FROM public.technician_income_rate_sets WHERE id=$1 FOR UPDATE`, [rateSetId]);
    const rateSet = rs.rows?.[0];
    if (!rateSet) throw Object.assign(new Error('RATE_SET_NOT_FOUND'), { statusCode:404 });
    if (String(rateSet.status) !== 'draft') throw Object.assign(new Error('ONLY_DRAFT_CAN_BE_EDITED'), { statusCode:409 });
    const oldItems = (await client.query(`SELECT * FROM public.technician_income_rate_items WHERE rate_set_id=$1 ORDER BY sort_order ASC, id ASC`, [rateSetId])).rows || [];
    await client.query(`DELETE FROM public.technician_income_rate_items WHERE rate_set_id=$1`, [rateSetId]);
    for (const it of items) {
      await client.query(
        `INSERT INTO public.technician_income_rate_items
          (rate_set_id, ac_type_key, wash_type_key, btu_tier, step_from, step_to, amount, unit, sort_order)
         VALUES($1,$2,$3,$4,$5,$6,$7,'per_unit',$8)`,
        [rateSetId, it.ac_type_key, it.wash_type_key, it.btu_tier, it.step_from, it.step_to, it.amount, it.sort_order]
      );
    }
    const oldMap = new Map(oldItems.map(it => [`${it.ac_type_key}|${it.wash_type_key}|${it.btu_tier}|${it.step_from}|${it.step_to || ''}`, Number(it.amount || 0)]));
    for (const it of items) {
      const k = `${it.ac_type_key}|${it.wash_type_key}|${it.btu_tier}|${it.step_from}|${it.step_to || ''}`;
      const oldAmount = oldMap.get(k);
      if (oldAmount !== Number(it.amount)) {
        await _insertRateAudit(client, req, { rate_set_id: rateSetId, action:'update_item', field_name:k, old_value: oldAmount == null ? null : oldAmount, new_value: it.amount });
      }
    }
    await client.query(`UPDATE public.technician_income_rate_sets SET updated_by=$2, updated_at=NOW() WHERE id=$1`, [rateSetId, req.actor.username]);
    await auditLog(req, { action:'TECH_INCOME_RATE_ITEMS_UPDATE', meta:{ rate_set_id:rateSetId, items_count:items.length } });
    await client.query('COMMIT');
    return res.json({ ok:true, draft: await _fetchRateSetWithItems(rateSetId) });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('PUT /api/super/technician-income-rates/:rate_set_id/items', e);
    return res.status(Number(e.statusCode || 500)).json({ ok:false, error:e.message || 'UPDATE_RATE_ITEMS_FAILED' });
  } finally {
    client.release();
  }
});

app.post('/api/super/technician-income-rates/:rate_set_id/activate', requireSuperAdmin, async (req, res) => {
  const rateSetId = Number(req.params.rate_set_id);
  if (!Number.isFinite(rateSetId) || rateSetId <= 0) return res.status(400).json({ ok:false, error:'INVALID_RATE_SET_ID' });
  if (req.body?.confirm !== true) return res.status(400).json({ ok:false, error:'CONFIRM_REQUIRED' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rs = await client.query(`SELECT * FROM public.technician_income_rate_sets WHERE id=$1 FOR UPDATE`, [rateSetId]);
    const rateSet = rs.rows?.[0];
    if (!rateSet) throw Object.assign(new Error('RATE_SET_NOT_FOUND'), { statusCode:404 });
    if (String(rateSet.status) !== 'draft') throw Object.assign(new Error('ONLY_DRAFT_CAN_BE_ACTIVATED'), { statusCode:409 });
    const itemCount = await client.query(`SELECT COUNT(*)::int AS c FROM public.technician_income_rate_items WHERE rate_set_id=$1`, [rateSetId]);
    if (Number(itemCount.rows?.[0]?.c || 0) < CWF_TECHNICIAN_INCOME_DEFAULT_ITEMS.length) {
      throw Object.assign(new Error('INCOMPLETE_RATE_ITEMS'), { statusCode:400 });
    }
    await client.query(
      `UPDATE public.technician_income_rate_sets
          SET status='inactive', effective_to=COALESCE(effective_to,NOW()), updated_at=NOW(), updated_by=$2
        WHERE contract_type='partner' AND status='active' AND id<>$1`,
      [rateSetId, req.actor.username]
    );
    await client.query(
      `UPDATE public.technician_income_rate_sets
          SET status='active', activated_at=NOW(), activated_by=$2, updated_by=$2, updated_at=NOW()
        WHERE id=$1`,
      [rateSetId, req.actor.username]
    );
    await _insertRateAudit(client, req, { rate_set_id: rateSetId, action:'activate', field_name:'status', old_value:'draft', new_value:'active' });
    await auditLog(req, { action:'TECH_INCOME_RATE_ACTIVATE', meta:{ rate_set_id:rateSetId, version:rateSet.version } });
    await client.query('COMMIT');
    // New active rate affects only unlocked/unpaid jobs. Mark preview stale so next request/admin save recalculates.
    try {
      await pool.query(`
        UPDATE public.job_technician_income_preview p
           SET is_stale=TRUE, updated_at=NOW()
          FROM public.jobs j
         WHERE j.job_id=p.job_id
           AND j.finished_at IS NULL
           AND COALESCE(j.payment_status,'') <> 'paid'
      `);
    } catch (e) { console.warn('[income_preview] stale after rate activate failed', e.message); }
    return res.json({ ok:true, active: await _fetchRateSetWithItems(rateSetId) });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('POST /api/super/technician-income-rates/:rate_set_id/activate', e);
    return res.status(Number(e.statusCode || 500)).json({ ok:false, error:e.message || 'ACTIVATE_RATE_SET_FAILED' });
  } finally {
    client.release();
  }
});

app.get('/api/super/technician-income-rates/audit', requireSuperAdmin, async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT l.*, s.version, s.name
         FROM public.technician_income_rate_audit_logs l
         LEFT JOIN public.technician_income_rate_sets s ON s.id=l.rate_set_id
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT 80`
    );
    return res.json({ ok:true, rows:q.rows || [] });
  } catch (e) {
    console.error('GET /api/super/technician-income-rates/audit', e);
    return res.status(500).json({ ok:false, error:'LOAD_RATE_AUDIT_FAILED' });
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
  const aq = await pool.query(`�my��$z{-���jם4::bigint, file_size_bytes)
       WHERE photo_id=$5::bigint AND job_id=$6::bigint`,
      [
        up.public_id || publicId,
        up.secure_url,
        up.public_id || publicId,
        Number.isFinite(Number(up.bytes)) ? Number(up.bytes) : null,
        photo_id,
        realId,
      ]
    );

    console.log('[photos/upload] uploaded to Cloudinary', {
      job_id: realId,
      photo_id,
      phase,
      public_id: up.public_id || publicId,
      bytes: up.bytes || req.file.size || null,
    });

    return res.json({
      success: true,
      storage: 'cloudinary',
      url: up.secure_url,
      public_id: up.public_id || publicId,
      bytes: up.bytes || req.file.size || null,
    });
  } catch (e) {
    console.error(e);
    res.status(Number(e.status || 500)).json({ error: e.message || "อัปโหลดรูปไม่สำเร็จ", code: e.code || undefined });
  }
});

app.get("/jobs/:job_id/photos", async (req, res) => {
  const { job_id } = req.params;
  try {
    const realId = await resolveJobIdAny(pool, job_id);
    if (!realId) return res.status(400).json({ error: "job_id ไม่ถูกต้อง" });

    const unitId = Number(req.query?.unit_id || 0);
    const params = [realId];
    let unitWhere = '';
    if (Number.isFinite(unitId) && unitId > 0) { params.push(unitId); unitWhere = ' AND unit_id=$2'; }
    const r = await pool.query(
      `SELECT photo_id, phase, created_at, uploaded_at, public_url, uploaded_by, unit_id, unit_code, unit_no, photo_category, photo_note
       FROM public.job_photos WHERE job_id=$1 ${unitWhere} AND deleted_at IS NULL ORDER BY unit_no NULLS LAST, photo_id ASC`,
      params
    );
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "โหลดรายการรูปไม่สำเร็จ" });
  }
});

app.get("/jobs/:job_id/units", async (req, res) => {
  try {
    const realId = await resolveJobIdAny(pool, req.params.job_id);
    if (!realId) return res.status(400).json({ error: "ไม่พบงานนี้" });
    await assertJobActionableForTechnician(pool, realId);
    // เปิดระบบแยกเครื่องแบบปลอดภัยเมื่อช่าง/แอดมินเข้าหน้านี้
    // เพื่อให้งานเก่าหรืองานที่สร้างก่อน migration เห็นการ์ดเครื่องทันที ไม่กลับไปลงรูปรวม
    const units = await getUnitsWithEvidence(realId, pool);
    if (units.length) {
      await pool.query(`UPDATE public.jobs SET per_unit_evidence_enabled=TRUE WHERE job_id=$1 AND COALESCE(per_unit_evidence_enabled,FALSE)=FALSE`, [realId]).catch(()=>{});
    }
    return res.json({ success: true, per_unit_evidence_enabled: units.length > 0, units });
  } catch (e) {
    console.error('GET /jobs/:job_id/units', e);
    return res.status(Number(e.status || 500)).json({ error: e.message || "โหลดข้อมูลเครื่องไม่สำเร็จ", code: e.code || undefined });
  }
});

app.put("/jobs/:job_id/units/:unit_id/checklist", requireTechnicianSession, async (req, res) => {
  try {
    const realId = await resolveJobIdAny(pool, req.params.job_id);
    if (!realId) return res.status(400).json({ error: "ไม่พบงานนี้" });
    const technician = await requireTechOwnsResolvedJob(req, res, realId, pool);
    if (!technician) return;
    await assertJobActionableForTechnician(pool, realId);
    const unitId = Number(req.params.unit_id || 0);
    const type = String(req.body?.checklist_type || '').trim();
    if (!['pre','post'].includes(type)) return res.status(400).json({ error: "ประเภทเช็คลิสไม่ถูกต้อง" });
    const list = Array.isArray(req.body?.checklist_json) ? req.body.checklist_json : [];
    const unitR = await pool.query(`SELECT unit_id FROM public.job_units WHERE job_id=$1 AND unit_id=$2 AND ${activeJobUnitWhere()} LIMIT 1`, [realId, unitId]);
    if (!unitR.rows.length) return res.status(404).json({ error: "ไม่พบเครื่องนี้ในงาน" });
    await pool.query(
      `INSERT INTO public.job_unit_checklists (job_id, unit_id, technician_username, checklist_type, checklist_json, completed_at, updated_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,NOW(),NOW())
       ON CONFLICT (unit_id, checklist_type)
       DO UPDATE SET technician_username=EXCLUDED.technician_username, checklist_json=EXCLUDED.checklist_json, completed_at=NOW(), updated_at=NOW()`,
      [realId, unitId, technician || _authUsername(req) || null, type, JSON.stringify(list)]
    );
    return res.json({ success: true, message: "บันทึกเช็คลิสเครื่องนี้แล้ว" });
  } catch (e) {
    console.error('PUT /jobs/:job_id/units/:unit_id/checklist', e);
    return res.status(Number(e.status || 500)).json({ error: e.message || "บันทึกเช็คลิสเครื่องนี้ไม่สำเร็จ", code: e.code || undefined });
  }
});

async function mediaRetentionRows() {
  const r = await pool.query(
    `SELECT j.job_id, j.booking_code, j.customer_name, j.customer_phone, j.job_type, j.job_status,
            j.finished_at, j.completed_at, j.closed_at, j.media_retention_locked, j.media_retention_purged_at,
            COUNT(DISTINCT CASE WHEN p.deleted_at IS NULL AND NOT (COALESCE(p.photo_category,'')='payment_slip' OR COALESCE(p.phase,'') ILIKE '%slip%') THEN p.photo_id END)::int AS photo_count,
            COUNT(DISTINCT CASE WHEN p.deleted_at IS NULL AND (COALESCE(p.photo_category,'')='payment_slip' OR COALESCE(p.phase,'') ILIKE '%slip%' OR COALESCE(p.phase,'')='payment_slip') THEN p.photo_id END)::int AS slip_count,
            COUNT(DISTINCT c.checklist_id)::int AS checklist_count,
            COUNT(DISTINCT u.unit_id)::int AS unit_count,
            COALESCE(SUM(CASE WHEN p.deleted_at IS NULL AND NOT (COALESCE(p.photo_category,'')='payment_slip' OR COALESCE(p.phase,'') ILIKE '%slip%') THEN COALESCE(p.file_size_bytes,0) ELSE 0 END),0)::bigint AS bytes_estimated,
            COALESCE(SUM(CASE WHEN p.deleted_at IS NULL AND (COALESCE(p.photo_category,'')='payment_slip' OR COALESCE(p.phase,'') ILIKE '%slip%') THEN COALESCE(p.file_size_bytes,0) ELSE 0 END),0)::bigint AS slip_bytes_estimated,
            (SELECT string_agg(COALESCE(ji.item_name,''), ' ') FROM public.job_items ji WHERE ji.job_id=j.job_id) AS service_items_text
       FROM public.jobs j
       LEFT JOIN public.job_photos p ON p.job_id=j.job_id AND p.deleted_at IS NULL
       LEFT JOIN public.job_unit_checklists c ON c.job_id=j.job_id
       LEFT JOIN public.job_units u ON u.job_id=j.job_id
      WHERE j.finished_at IS NOT NULL OR COALESCE(j.job_status,'') ILIKE '%เสร็จ%' OR COALESCE(j.job_status,'') IN ('done','completed','ปิดงาน')
      GROUP BY j.job_id
      HAVING COUNT(DISTINCT CASE WHEN p.deleted_at IS NULL THEN p.photo_id END) > 0
      ORDER BY COALESCE(j.finished_at, j.completed_at, j.closed_at) ASC NULLS LAST, j.job_id ASC
      LIMIT 500`
  );
  return (r.rows || []).map(j => {
    const el = mediaPurgeEligibility(j);
    const completion = getJobCompletionDate(j);
    const warrantyEnd = completion ? new Date(new Date(completion).getTime() + (getRetentionDaysForJob(j) - 15) * 86400000) : null;
    return { ...j, completion_date: completion, warranty_end_date: warrantyEnd ? warrantyEnd.toISOString() : null, purge_eligible_date: el.eligible_at || null, eligibility: el };
  });
}

app.get('/admin/media-retention/summary', requireAdminSession, async (_req, res) => {
  try {
    const jobs = await mediaRetentionRows();
    const photosR = await pool.query(`SELECT COUNT(*)::int AS total, SUM(CASE WHEN COALESCE(photo_category,'')='payment_slip' OR COALESCE(phase,'') ILIKE '%slip%' OR COALESCE(phase,'')='payment_slip' THEN 1 ELSE 0 END)::int AS slips, COALESCE(SUM(COALESCE(file_size_bytes,0)),0)::bigint AS bytes FROM public.job_photos WHERE deleted_at IS NULL`);
    const eligible = jobs.filter(j=>j.eligibility?.eligible);
    return res.json({ success:true,
      total_photos:Number(photosR.rows?.[0]?.total||0),
      eligible_photos:eligible.reduce((sum,j)=>sum+Number(j.photo_count||0),0),
      eligible_jobs:eligible.length,
      slip_photos:Number(photosR.rows?.[0]?.slips||0),
      bytes_estimated:eligible.reduce((sum,j)=>sum+Number(j.bytes_estimated||0),0),
      total_bytes_estimated:Number(photosR.rows?.[0]?.bytes||0),
      slip_bytes_estimated:jobs.reduce((sum,j)=>sum+Number(j.slip_bytes_estimated||0),0),
      storage_free_note:'พื้นที่ว่างจริงต้องดูจาก Render/Cloudinary; ระบบนี้คำนวณพื้นที่ที่ล้างได้จากขนาดไฟล์ที่บันทึกไว้',
      note:'รูปสลิปไม่ถูกลบอัตโนมัติ ต้องเลือกลบสลิปเองเท่านั้น' });
  } catch (e) { return res.status(500).json({ error:'โหลดสรุปพื้นที่จัดเก็บไม่สำเร็จ' }); }
});

app.get('/admin/media-retention/jobs', requireAdminSession, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const type = String(req.query.job_type || 'all').trim();
    let jobs = await mediaRetentionRows();
    if (type && type !== 'all') jobs = jobs.filter(j => String(j.job_type || '').includes(type));
    if (q) jobs = jobs.filter(j => `${j.customer_name||''} ${j.customer_phone||''} ${j.booking_code||''}`.toLowerCase().includes(q));
    return res.json({ success:true, jobs });
  } catch (e) { return res.status(500).json({ error:'โหลดรายการงานสำหรับล้างข้อมูลไม่สำเร็จ' }); }
});

app.post('/admin/media-retention/purge', requireAdminSession, async (req, res) => {
  const dryRun = req.body?.dry_run !== false;
  const slipOnly = req.body?.slip_only === true || String(req.body?.purge_type || '').trim() === 'slips';
  const ids = Array.isArray(req.body?.job_ids) ? req.body.job_ids.map(Number).filter(n => Number.isFinite(n) && n > 0).slice(0,200) : [];
  const actor = _authUsername(req) || req.actor?.username || 'admin';
  if (!ids.length) return res.status(400).json({ error:'กรุณาเลือกงานที่ต้องการตรวจสอบ' });
  if (!dryRun) {
    const need = slipOnly ? 'ยืนยันลบสลิป' : 'ยืนยันลบ';
    if (String(req.body?.confirm_text || '').trim() !== need) return res.status(400).json({ error:`กรุณาพิมพ์คำว่า ${need} เพื่อยืนยันการลบ` });
  }
  const runId = crypto.randomUUID();
  const results = [];
  for (const id of ids) {
    const jobR = await pool.query(`SELECT j.*, (SELECT string_agg(COALESCE(ji.item_name,''), ' ') FROM public.job_items ji WHERE ji.job_id=j.job_id) AS service_items_text FROM public.jobs j WHERE j.job_id=$1`, [id]);
    const el = mediaPurgeEligibility(jobR.rows[0]);
    const photosR = await pool.query(`SELECT photo_id, phase, photo_category, cloud_public_id, storage_path, public_url, COALESCE(file_size_bytes,0)::bigint AS bytes FROM public.job_photos WHERE job_id=$1 AND deleted_at IS NULL`, [id]);
    const evidence = (photosR.rows || []).filter(isEvidencePhotoRow);
    const slips = (photosR.rows || []).filter(p => normalizePhotoCategory(p.phase, p.photo_category) === 'payment_slip' || String(p.phase||'').toLowerCase().includes('slip'));
    const targetPhotos = slipOnly ? slips : evidence;
    const summary = { eligible: slipOnly ? slips.length > 0 : !!el.eligible, reason: slipOnly ? 'เลือกลบเฉพาะรูปสลิปโดยแอดมิน' : el.reason, photos_count:evidence.length, checklist_count:0, units_count:0, slips_count:slips.length, bytes_estimated:targetPhotos.reduce((s,p)=>s+Number(p.bytes||0),0), purge_type: slipOnly ? 'slips' : 'job_evidence', cloudinary_deleted_count:0, cloudinary_delete_failed_count:0 };
    if (summary.eligible && !dryRun && targetPhotos.length) {
      const cloudPublicIds = [...new Set(targetPhotos.map(p => String(p.cloud_public_id || p.storage_path || '').trim()).filter(v => v && !/^https?:\/\//i.test(v)))];
      let destroyRows = [];
      if (cloudPublicIds.length) {
        if (!CLOUDINARY_ENABLED) {
          summary.cloudinary_delete_failed_count = cloudPublicIds.length;
          summary.reason = 'ยังไม่ได้ตั้งค่า Cloudinary ENV จึงยังลบไฟล์จริงบน Cloudinary ไม่ได้';
          results.push({ job_id:id, ...summary });
          await pool.query(`INSERT INTO public.media_retention_logs (run_id, job_id, dry_run, action, photos_count, checklist_count, units_count, slips_count, bytes_estimated, result, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [runId, id, dryRun, dryRun?'dry_run':'purge_cloudinary_not_configured', summary.photos_count, summary.checklist_count, summary.units_count, summary.slips_count, summary.bytes_estimated, summary.reason, actor]).catch(()=>null);
          continue;
        }
        destroyRows = await cloudinaryDestroyMany(cloudPublicIds);
        summary.cloudinary_deleted_count = destroyRows.filter(r => r.ok).length;
        summary.cloudinary_delete_failed_count = destroyRows.filter(r => !r.ok).length;
        if (summary.cloudinary_delete_failed_count) {
          summary.cloudinary_delete_failures = destroyRows.filter(r => !r.ok).slice(0, 5);
          summary.reason = `ลบบางรูปบน Cloudinary ไม่สำเร็จ ${summary.cloudinary_delete_failed_count} รูป ระบบจะไม่ตัดรูปที่ลบไม่สำเร็จออกจากฐานข้อมูลเพื่อให้กดลบซ้ำได้`;
        }
      }
      const okCloudIds = new Set(destroyRows.filter(r => r.ok).map(r => r.public_id));
      const photoIds = targetPhotos
        .filter(p => {
          const pid = String(p.cloud_public_id || p.storage_path || '').trim();
          return !pid || /^https?:\/\//i.test(pid) || okCloudIds.has(pid);
        })
        .map(p => Number(p.photo_id)).filter(Boolean);
      if (photoIds.length) {
        await pool.query(`UPDATE public.job_photos SET deleted_at=NOW(), deleted_by=$2, public_url=NULL, storage_path=NULL, cloud_public_id=NULL WHERE job_id=$1 AND photo_id=ANY($3::bigint[])`, [id, actor, photoIds]);
      }
      if (!slipOnly && photoIds.length && summary.cloudinary_delete_failed_count === 0) {
        await pool.query(`UPDATE public.job_unit_checklists SET checklist_json='[]'::jsonb, updated_at=NOW() WHERE job_id=$1`, [id]);
        await pool.query(`UPDATE public.job_units SET ac_type=NULL, wash_type=NULL, btu=NULL, location_label=NULL, updated_at=NOW() WHERE job_id=$1`, [id]);
        await pool.query(`UPDATE public.jobs SET media_retention_purged_at=NOW(), media_retention_purged_by=$2, media_retention_summary=$3::jsonb WHERE job_id=$1`, [id, actor, JSON.stringify(summary)]);
      }
    }
    await pool.query(`INSERT INTO public.media_retention_logs (run_id, job_id, dry_run, action, photos_count, checklist_count, units_count, slips_count, bytes_estimated, result, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [runId, id, dryRun, dryRun?'dry_run':'purge', summary.photos_count, summary.checklist_count, summary.units_count, summary.slips_count, summary.bytes_estimated, summary.reason, actor]).catch(()=>null);
    results.push({ job_id:id, ...summary });
  }
  return res.json({ success:true, run_id:runId, dry_run:dryRun, message: dryRun ? 'ตรวจสอบก่อนลบเสร็จแล้ว ยังไม่มีการลบข้อมูลจริง' : (slipOnly ? 'ลบรูปสลิปที่เลือกเรียบร้อย' : 'ล้างรูปหลักฐานเก่าเรียบร้อย รูปสลิปไม่ถูกลบอัตโนมัติ'), results });
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
    await assertJobActionableForTechnician(pool, realId);

    await pool.query(
      `UPDATE public.jobs SET technician_note=$1, technician_note_at=NOW() WHERE job_id=$2`,
      [note || "", realId]
    );
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(Number(e.status || 500)).json({ error: e.message || "บันทึกหมายเหตุไม่สำเร็จ", code: e.code || undefined });
  }
});

// =======================================
// ✅ FINALIZE JOB (เสร็จสิ้น / ยกเลิก) + ลายเซ็นต์ช่าง
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

  const pre_cleaning_checklist = Array.isArray(req.body?.pre_cleaning_checklist) ? req.body.pre_cleaning_checklist : null;
  const post_cleaning_checklist = Array.isArray(req.body?.post_cleaning_checklist) ? req.body.post_cleaning_checklist : null;
  const photo_ack = (req.body && typeof req.body.photo_acknowledgement === 'object') ? req.body.photo_acknowledgement : null;
  const close_payment_method = String(req.body?.close_payment_method || '').trim();
  const close_payment_status = String(req.body?.close_payment_status || '').trim();
  const close_cash_amount = req.body?.close_cash_amount == null ? null : Number(req.body.close_cash_amount);
  const close_payment_note = String(req.body?.close_payment_note || '').trim();
  const close_cash_confirmed = !!req.body?.close_cash_confirmed;
  const close_signature_type = String(req.body?.close_signature_type || 'technician_signature').trim();

  if (!["เสร็จแล้ว", "ยกเลิก"].includes(status)) {
    return res.status(400).json({ error: "status ต้องเป็น 'เสร็จแล้ว' หรือ 'ยกเลิก'" });
  }
  if (!signature_data) {
    return res.status(400).json({ error: "ต้องมีลายเซ็นปิดงาน" });
  }
  if (status === 'เสร็จแล้ว') {
    if (!pre_cleaning_checklist || !pre_cleaning_checklist.length) return res.status(400).json({ error: 'กรุณาตรวจสภาพก่อนล้างให้ครบ' });
    if (!post_cleaning_checklist || !post_cleaning_checklist.length) return res.status(400).json({ error: 'กรุณาตรวจหลังล้างให้ครบ' });
    if (!close_payment_method) return res.status(400).json({ error: 'กรุณาเลือกวิธีชำระเงิน' });
    if (close_payment_method === 'cash_to_technician') {
      if (!Number.isFinite(close_cash_amount) || close_cash_amount <= 0) return res.status(400).json({ error: 'กรุณาระบุจำนวนเงินสดที่รับ' });
      if (!close_cash_confirmed) return res.status(400).json({ error: 'กรุณายืนยันการรับเงินสด' });
      if (close_signature_type !== 'technician_signature') return res.status(400).json({ error: 'กรุณาให้ช่างเซ็นรับรองปิดงาน' });
    }
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
    await assertJobActionableForTechnician(client, realId);
    const perUnitEvidenceRequested = req.body?.per_unit_evidence === true || String(req.body?.per_unit_evidence || '').trim().toLowerCase() === 'true' || String(req.body?.per_unit_evidence || '').trim() === '1';
    const perUnitFlagR = await client.query(`SELECT COALESCE(per_unit_evidence_enabled,FALSE) AS enabled FROM public.jobs WHERE job_id=$1 LIMIT 1`, [realId]);
    const perUnitEnabled = perUnitEvidenceRequested || !!perUnitFlagR.rows?.[0]?.enabled;
    if (status === "เสร็จแล้ว" && perUnitEnabled) {
      const unitMissing = await validatePerUnitCompletion(realId, client);
      if (unitMissing) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: unitMissing });
      }
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
    let reworkIncomeResult = null;

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
      const ackAccepted = !!(photo_ack && photo_ack.accepted);
      const missingPhotos = (photo_ack && Array.isArray(photo_ack.missing)) ? photo_ack.missing : [];
      const paymentStatusToSave = close_payment_method === 'admin_handles_payment' ? 'pending_admin_update' : (close_payment_status || 'pending_verification');
      const finalizeUpd = await client.query(
        `UPDATE public.jobs
         SET job_status='เสร็จแล้ว',
             finished_at = NOW(),
             final_signature_path = $1,
             final_signature_status = 'เสร็จแล้ว',
             final_signature_at = NOW(),
             warranty_kind = COALESCE($3, warranty_kind),
             warranty_months = COALESCE($4, warranty_months),
             warranty_start_at = COALESCE(warranty_start_at, NOW()),
             warranty_end_at = COALESCE($5, warranty_end_at),
             pre_cleaning_checklist = COALESCE($6::jsonb, pre_cleaning_checklist),
             post_cleaning_checklist = COALESCE($7::jsonb, post_cleaning_checklist),
             checklist_completed_at = NOW(),
             checklist_completed_by = $8,
             photo_acknowledgement_required = $9,
             photo_acknowledgement_accepted = $10,
             photo_acknowledgement_at = CASE WHEN $10 THEN NOW() ELSE photo_acknowledgement_at END,
             photo_acknowledgement_by = CASE WHEN $10 THEN $8 ELSE photo_acknowledgement_by END,
             missing_photo_categories = COALESCE($11::jsonb, missing_photo_categories),
             close_payment_method = $12,
             close_payment_status = $13,
             payment_status = CASE WHEN COALESCE(payment_status,'')='paid' THEN payment_status ELSE $13 END,
             close_cash_amount = $14,
             close_payment_note = NULLIF($15,''),
             close_cash_confirmed = $16,
             close_cash_confirmed_at = CASE WHEN $16 THEN NOW() ELSE close_cash_confirmed_at END,
             close_cash_confirmed_by = CASE WHEN $16 THEN $8 ELSE close_cash_confirmed_by END,
             close_signature_type = $17,
             close_signature_by = $8,
             close_signature_at = NOW()
         WHERE job_id=$2
         RETURNING finished_at`,
        [sigPath, realId, wKind, wMonths, wEndIso,
          pre_cleaning_checklist ? JSON.stringify(pre_cleaning_checklist) : null,
          post_cleaning_checklist ? JSON.stringify(post_cleaning_checklist) : null,
          technician_username,
          missingPhotos.length > 0,
          ackAccepted,
          missingPhotos.length ? JSON.stringify(missingPhotos) : null,
          close_payment_method || null,
          paymentStatusToSave,
          Number.isFinite(close_cash_amount) ? close_cash_amount : null,
          close_payment_note,
          close_cash_confirmed,
          close_signature_type || 'technician_signature']
      );
      const persistedFinishedAt = finalizeUpd.rows[0]?.finished_at || null;
      if (isRevisitFlow && revisitResult) {
        // Closing a revisit (rework) job through the same shared workflow as the
        // admin resolve endpoint: 'successful' releases the ORIGINAL technician's
        // paused income (keyed off the rework_case row's technician_username, not
        // whoever is currently assigned, in case the job was reassigned for the
        // revisit); 'unsuccessful' permanently voids the hold — no money moves.
        const rcq = await client.query(
          `SELECT * FROM public.technician_rework_cases
            WHERE job_id=$1 AND status IN ('open','in_progress')
            ORDER BY created_at DESC
            LIMIT 1
            FOR UPDATE`,
          [realId]
        );
        const reworkCase = rcq.rows[0] || null;
        if (reworkCase) {
          const resolution = revisitResult === 'successful' ? 'fixed' : 'failed';
          await client.query(
            `UPDATE public.technician_rework_cases
                SET status='resolved', resolution=$2, revisit_result=$3, revisit_note=$4,
                    resolved_by=$5, resolved_at=NOW(), updated_at=NOW()
              WHERE rework_case_id=$1`,
            [reworkCase.rework_case_id, resolution, revisitResult, revisitNote || null, technician_username]
          );
          reworkIncomeResult = await _closeReworkCaseWithIncomeRelease(client, {
            reworkCaseId: reworkCase.rework_case_id,
            successful: resolution === 'fixed',
            finishedAt: persistedFinishedAt,
            actor: technician_username,
          });
        }
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
              rework_case_id: reworkCase ? reworkCase.rework_case_id : null,
              income_release: reworkIncomeResult ? { released: !!reworkIncomeResult.released, amount: reworkIncomeResult.amount || 0, payout_id: reworkIncomeResult.payout_id || null } : null,
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
          close_payment_method: close_payment_method || null,
          close_payment_status: close_payment_method === 'admin_handles_payment' ? 'pending_admin_update' : (close_payment_status || 'pending_verification'),
          close_signature_type: close_signature_type || 'technician_signature',
          photo_acknowledgement_accepted: !!(photo_ack && photo_ack.accepted),
        }
      }, client);

      // ถ้าลูกค้าจ่ายเงินสดให้ช่างถือไว้ ให้บันทึก ledger แยก และหักออกจากยอดจ่ายช่างในงวดทันที
      if (String(close_payment_method || '').trim() === 'cash_to_technician') {
        try {
          const cashOffset = await technicianCashCollections.ensureOffsetForJob({
            client,
            job_id: realId,
            actor_username: technician_username,
            source: 'job_finalize',
          });
          await logJobUpdate(realId, {
            actor_username: technician_username,
            actor_role: 'tech',
            action: 'tech_cash_collection_offset',
            message: cashOffset.skipped ? `tech cash offset skipped: ${cashOffset.reason || ''}` : 'บันทึกเงินสดที่ช่างถือไว้และหักจากงวดจ่ายแล้ว',
            payload: cashOffset,
          }, client);
        } catch (cashErr) {
          await logJobUpdate(realId, {
            actor_username: technician_username,
            actor_role: 'tech',
            action: 'tech_cash_collection_offset_failed',
            message: String(cashErr?.code || cashErr?.message || 'TECH_CASH_OFFSET_FAILED'),
            payload: { error: String(cashErr?.message || cashErr), code: cashErr?.code || null },
          }, client);
          throw cashErr;
        }
      }
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
    const finalizedStatus = String(status || '').trim();
    const finalizedStatusLower = finalizedStatus.toLowerCase();
    if (finalizedStatus.includes('เสร็จ') || finalizedStatus.includes('ปิดงาน') || ['done','completed','closed'].includes(finalizedStatusLower)) {
      try {
        const team = await getTeamForJob(realId);
        await _refreshTechnicianIncomePreviewForJob(realId, team, { source: 'job_closed_preview' });
      } catch (e) {
        try { console.warn('[tech_income_preview] finalize refresh failed', { job_id: realId, error: e.message }); } catch {}
      }
    } else if (finalizedStatus.includes('ยกเลิก') || ['cancel','cancelled','canceled'].includes(finalizedStatusLower)) {
      try {
        const team = await getTeamForJob(realId);
        await _syncDisplayForJobState(
          { job_id: realId, job_status: 'cancelled', canceled_at: new Date(), cancel_reason: note || 'ยกเลิก' },
          team,
          { context: 'history' }
        );
      } catch (e) {
        try { console.warn('[tech_income_display] finalize cancel sync failed', { job_id: realId, error: e.message }); } catch {}
      }
    }
    res.json({ success: true, job_id: Number(realId), status, income_release: reworkIncomeResult });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(Number(e.status || 500)).json({ error: e.message || "ปิดงาน/ยกเลิกไม่สำเร็จ" });
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

    const ownsJob = await assertTechBelongsToJob(client, realId, technician_username);
    if (!ownsJob) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "ช่างคนนี้ไม่ได้อยู่ในทีมของงานนี้" });
    }
    await assertJobActionableForTechnician(client, realId);

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
    return res.status(Number(e.status || 500)).json({ error: e.message || "บันทึกสถานะงานไม่สำเร็จ", code: e.code || undefined });
  } finally {
    client.release();
  }
});


async function expireTechnicianAcceptStatuses(clientOrPool = pool, username = null) {
  const params = [];
  let userWhere = '';
  if (username) {
    params.push(String(username).trim());
    userWhere = ` AND username=$${params.length}`;
  }
  await clientOrPool.query(
    `WITH expired AS (
       UPDATE public.technician_profiles
       SET accept_status='paused', accept_status_updated_at=NOW(), accept_status_expires_at=NULL
       WHERE COALESCE(accept_status,'paused')='ready'
         AND (accept_status_expires_at IS NULL OR accept_status_expires_at <= NOW())
         ${userWhere}
       RETURNING username
     )
     UPDATE public.job_offers o
     SET status='expired', responded_at=COALESCE(o.responded_at,NOW())
     WHERE o.status='pending'
       AND o.technician_username IN (SELECT username FROM expired)`,
    params
  );
}

function buildAcceptStatusOpenSql(alias = 'p') {
  return `COALESCE(${alias}.accept_status,'paused')='ready' AND ${alias}.accept_status_expires_at IS NOT NULL AND ${alias}.accept_status_expires_at > NOW()`;
}

function getBangkokHourSql() {
  return `EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Asia/Bangkok'))::int`;
}

// =======================================
// 🟢/🔴 TECH: accept status (พร้อมเริ่มงาน / หยุดรับงาน)
// =======================================
app.get("/technicians/:username/accept-status", async (req, res) => {
  const { username } = req.params;
  try {
    await expireTechnicianAcceptStatuses(pool, username);
    const r = await pool.query(
      `SELECT CASE
                WHEN COALESCE(accept_status,'paused')='ready'
                 AND accept_status_expires_at IS NOT NULL
                 AND accept_status_expires_at > NOW()
                THEN 'ready' ELSE 'paused' END AS accept_status,
              accept_status_updated_at, accept_status_expires_at, last_daily_ready_at
       FROM public.technician_profiles
       WHERE username=$1
       LIMIT 1`,
      [username]
    );
    res.json(r.rows[0] || { accept_status: "paused", accept_status_updated_at: null, accept_status_expires_at: null, last_daily_ready_at: null });
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

  // Keep these outside the auth try-block because the DB transaction below also needs them.
  let actorIsAdmin = false;
  let actorUsername = '';

  try {
    const ctx = await getAuthContext(req, res);
    if (!ctx.ok) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const actorRole = String(ctx.actor?.role || '').trim().toLowerCase();
    actorIsAdmin = actorRole === 'admin' || actorRole === 'super_admin';
    actorUsername = String(ctx.actor?.username || ctx.effective?.username || '').trim();
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

    const expiryQ = await client.query(`SELECT ((date_trunc('day', NOW() AT TIME ZONE 'Asia/Bangkok') + INTERVAL '1 day') AT TIME ZONE 'Asia/Bangkok') AS next_midnight_bkk`);
    const expiresAt = status === 'ready' ? expiryQ.rows[0]?.next_midnight_bkk : null;

    await client.query(
      `INSERT INTO public.technician_profiles (username, accept_status, accept_status_updated_at, accept_status_expires_at)
       VALUES ($1,$2,NOW(),$3)
       ON CONFLICT (username) DO UPDATE SET
         accept_status = EXCLUDED.accept_status,
         accept_status_updated_at = EXCLUDED.accept_status_updated_at,
         accept_status_expires_at = EXCLUDED.accept_status_expires_at`,
      [username, status, expiresAt]
    );

    await client.query(
      `INSERT INTO public.technician_accept_status_log(technician_username, work_date, status, changed_at, expires_at, source, note)
       VALUES($1, (NOW() AT TIME ZONE 'Asia/Bangkok')::date, $2, NOW(), $3, $4, $5)`,
      [username, status, expiresAt, actorIsAdmin ? 'admin' : 'technician', status === 'ready' ? 'เปิดรับงานวันนี้ ระบบจะปิดอัตโนมัติหลังเที่ยงคืน' : 'ปิดรับงาน']
    );

    if (status === "paused") {
      await client.query(
        `UPDATE public.job_offers SET status='expired' WHERE technician_username=$1 AND status='pending'`,
        [username]
      );
    }

    await client.query("COMMIT");
    res.json({ success: true, accept_status: status, accept_status_expires_at: expiresAt });
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
// 🧭 CWF Technician Work Calendar & Daily Readiness v2
// - New source of truth for monthly availability, advance jobs, and morning readiness.
// - Legacy weekly_off_days/workdays-v2 routes remain for compatibility only.
// =======================================
function firstDayOfMonthIso(monthText){
  const m = String(monthText || '').trim();
  if (/^\d{4}-\d{2}$/.test(m)) return `${m}-01`;
  return toIsoDate(new Date());
}
function addDaysIso(iso, days){
  const d = new Date(String(iso).slice(0,10) + 'T00:00:00');
  d.setDate(d.getDate() + Number(days || 0));
  return toIsoDate(d);
}
function endDayOfMonthIso(monthText){
  const first = firstDayOfMonthIso(monthText).slice(0,7) + '-01';
  const d = new Date(first + 'T00:00:00');
  d.setMonth(d.getMonth()+1);
  d.setDate(d.getDate()-1);
  return toIsoDate(d);
}
function isStrictIsoDate(value){
  const s = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toIsoDate(s) === s;
}
function isStrictMonth(value){
  const s = String(value || '').trim();
  return /^\d{4}-\d{2}$/.test(s) && toIsoDate(`${s}-01`).startsWith(s);
}
async function getTechTodayJobs(username){
  const r = await pool.query(`
    SELECT j.job_id, j.booking_code, j.customer_name, j.job_type, j.appointment_datetime,
           COALESCE(j.duration_min,60) AS duration_min, j.job_status
    FROM public.jobs j
    LEFT JOIN public.job_assignments ja ON ja.job_id=j.job_id AND ja.technician_username=$1
    WHERE (j.technician_username=$1 OR ja.technician_username=$1)
      AND j.appointment_datetime IS NOT NULL
      AND (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date = (NOW() AT TIME ZONE 'Asia/Bangkok')::date
      AND COALESCE(j.job_status,'') NOT IN ('cancelled','canceled','done','finished')
    GROUP BY j.job_id
    ORDER BY j.appointment_datetime ASC
  `, [username]);
  return r.rows || [];
}
async function requireCalendarUsernameAccess(req, res, username){
  const ctx = await getAuthContext(req, res);
  if (!ctx.ok) {
    res.status(401).json({ error:'UNAUTHORIZED' });
    return null;
  }
  const actorRole = String(ctx.actor?.role || '').trim().toLowerCase();
  const actorIsAdmin = actorRole === 'admin' || actorRole === 'super_admin';
  const effectiveUser = String(ctx.effective?.username || '').trim();
  const effectiveIsTech = isTechnicianRole(ctx.effective?.role);
  if (!actorIsAdmin && (!effectiveIsTech || effectiveUser !== String(username || '').trim())) {
    res.status(403).json({ error:'FORBIDDEN' });
    return null;
  }
  req.actor = ctx.actor;
  req.effective = ctx.effective;
  req.auth = ctx.effective;
  req.impersonating = !!ctx.impersonating;
  req.session_token = ctx.session_token;
  return ctx;
}
function normalizeCalendarRow(row, iso, jobCount=0){
  const can = row ? (row.can_accept_advance_job === true || ['advance_only','available_advance','working'].includes(String(row.day_status || ''))) : false;
  const start = can ? (row?.start_time || '09:00') : null;
  const end = can ? (row?.end_time || '18:00') : null;
  const caps = resolveTechnicianCalendarCaps(row || {});
  const jobs = can ? caps.raw_max_jobs : null;
  const units = can ? caps.raw_max_units : null;
  const note = row?.note || null;
  const hasCustom = !!(
    (can && (start !== '09:00' || end !== '18:00' || caps.cap_mode === 'technician_custom')) ||
    String(note || '').trim()
  );
  return {
    date: iso,
    work_date: iso,
    can_accept_advance_job: can,
    start_time: start,
    end_time: end,
    max_jobs_per_day: jobs,
    max_units_per_day: units,
    raw_max_jobs_per_day: caps.raw_max_jobs,
    raw_max_units_per_day: caps.raw_max_units,
    cap_mode: can ? caps.cap_mode : 'system_default',
    effective_max_jobs_per_day: can ? caps.effective_max_jobs : null,
    effective_max_units_per_day: can ? caps.effective_max_units : null,
    is_legacy_system_default: can ? caps.is_legacy_system_default : false,
    note,
    has_assigned_job: Number(jobCount || 0) > 0,
    assigned_job_count: Number(jobCount || 0),
    is_locked: Number(jobCount || 0) > 0,
    has_custom_setting: hasCustom
  };
}
async function loadWorkCalendarV2Month(username, month){
  const fromIso = firstDayOfMonthIso(month);
  const toIso = endDayOfMonthIso(month);
  const [cal, jobs] = await Promise.all([
    pool.query(`SELECT work_date::date AS work_date, day_status, can_accept_advance_job, start_time, end_time, max_jobs_per_day, max_units_per_day, note, source, updated_at
                FROM public.technician_monthly_work_calendar
                WHERE technician_username=$1 AND work_date BETWEEN $2::date AND $3::date
                ORDER BY work_date ASC`, [username, fromIso, toIso]),
    pool.query(`SELECT (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date AS work_date, COUNT(DISTINCT j.job_id)::int AS job_count
                FROM public.jobs j
                LEFT JOIN public.job_assignments ja ON ja.job_id=j.job_id AND ja.technician_username=$1
                WHERE (j.technician_username=$1 OR ja.technician_username=$1)
                  AND j.appointment_datetime IS NOT NULL
                  AND (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date BETWEEN $2::date AND $3::date
                  AND COALESCE(j.job_status,'') NOT IN ('cancelled','canceled')
                GROUP BY 1`, [username, fromIso, toIso])
  ]);
  const calMap = new Map((cal.rows || []).map(x => [toIsoDate(x.work_date), x]));
  const jobMap = new Map((jobs.rows || []).map(x => [toIsoDate(x.work_date), Number(x.job_count || 0)]));
  const days = [];
  for (const iso of cwfDateRange(fromIso, toIso)) {
    days.push(normalizeCalendarRow(calMap.get(iso), iso, jobMap.get(iso) || 0));
  }
  return { fromIso, toIso, days };
}
function cwfDateRange(fromIso, toIso){
  const out = [];
  const d = new Date(`${fromIso}T00:00:00`);
  const end = new Date(`${toIso}T00:00:00`);
  while (d <= end) {
    out.push(toIsoDate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}
async function upsertCalendarDay(clientOrPool, username, workDate, input){
  const p = normWorkDayPayload(input || {});
  const source = sourceForWorkDayPayload(p);
  const r = await clientOrPool.query(`
    INSERT INTO public.technician_monthly_work_calendar
      (technician_username, work_date, day_status, can_accept_advance_job, can_accept_urgent_job, start_time, end_time, max_jobs_per_day, max_units_per_day, note, source, updated_by, updated_at)
    VALUES($1,$2::date,$3,$4,$5,$6,$7,$8,$9,$10,$11,$1,NOW())
    ON CONFLICT(technician_username, work_date) DO UPDATE SET
      day_status=EXCLUDED.day_status,
      can_accept_advance_job=EXCLUDED.can_accept_advance_job,
      can_accept_urgent_job=EXCLUDED.can_accept_urgent_job,
      start_time=EXCLUDED.start_time,
      end_time=EXCLUDED.end_time,
      max_jobs_per_day=EXCLUDED.max_jobs_per_day,
      max_units_per_day=EXCLUDED.max_units_per_day,
      note=EXCLUDED.note,
      source=EXCLUDED.source, updated_by=$1, updated_at=NOW()
    RETURNING *
  `, [username, workDate, p.day_status, p.can_accept_advance_job, p.can_accept_urgent_job, p.start_time, p.end_time, p.max_jobs_per_day, p.max_units_per_day, p.note, source]);
  return r.rows[0] || null;
}
async function ensureDailyReadinessRow(username){
  const jobs = await getTechTodayJobs(username);
  const nowQ = await pool.query(`SELECT (NOW() AT TIME ZONE 'Asia/Bangkok') AS now_bkk, ${getBangkokHourSql()} AS hour_bkk`);
  const hourBkk = Number(nowQ.rows?.[0]?.hour_bkk ?? 0);
  const nowBkk = nowQ.rows?.[0]?.now_bkk || null;
  if (!jobs.length) return { has_jobs:false, jobs:[], readiness:null, can_show:false, now_bkk:nowBkk, hour_bkk:hourBkk };
  const first = jobs[0]?.appointment_datetime || null;
  const rr = await pool.query(`
    INSERT INTO public.technician_daily_readiness(technician_username, work_date, status, first_job_at, deadline_at, updated_at)
    VALUES($1, (NOW() AT TIME ZONE 'Asia/Bangkok')::date, 'pending', $2, ($2::timestamptz - INTERVAL '1 hour'), NOW())
    ON CONFLICT(technician_username, work_date) DO UPDATE SET
      first_job_at=COALESCE(public.technician_daily_readiness.first_job_at, EXCLUDED.first_job_at),
      deadline_at=COALESCE(public.technician_daily_readiness.deadline_at, EXCLUDED.deadline_at),
      updated_at=NOW()
    RETURNING *
  `, [username, first]);
  const readiness = rr.rows[0] || null;
  const st = String(readiness?.status || 'pending').toLowerCase();
  const canShow = hourBkk >= 5 && st !== 'ready';
  return { has_jobs:true, jobs, readiness, can_show:canShow, now_bkk:nowBkk, hour_bkk:hourBkk };
}

app.get('/technicians/:username/work-calendar-v2', async (req, res) => {
  try {
    const username = String(req.params?.username || '').trim();
    const ctx = await requireCalendarUsernameAccess(req, res, username);
    if (!ctx) return;
    const month = String(req.query?.month || '').trim() || toIsoDate(new Date()).slice(0,7);
    if (!isStrictMonth(month)) return res.status(400).json({ error:'month ต้องเป็นรูปแบบ YYYY-MM' });
    const data = await loadWorkCalendarV2Month(username, month);
    res.json({ ok:true, username, month, from:data.fromIso, to:data.toIso, days:data.days, items:data.days });
  } catch (e) {
    console.error('GET /technicians/:username/work-calendar-v2 error:', e);
    res.status(500).json({ error:'โหลดปฏิทินรับงานล่วงหน้าไม่สำเร็จ' });
  }
});

app.put('/technicians/:username/work-calendar-v2/day', async (req, res) => {
  try {
    const username = String(req.params?.username || '').trim();
    const ctx = await requireCalendarUsernameAccess(req, res, username);
    if (!ctx) return;
    const workDate = String(req.body?.date || req.body?.work_date || '').trim();
    if (!isStrictIsoDate(workDate)) return res.status(400).json({ error:'date ต้องเป็นรูปแบบ YYYY-MM-DD' });
    const lockedJobs = await countLockedAdvanceJobsForDate(pool, username, workDate);
    if (lockedJobs > 0) {
      return res.status(409).json({
        error:'วันนี้มีงานที่ได้รับมอบหมายแล้ว ช่างไม่สามารถปิดรับงานหรือแก้ไขวันทำงานนี้ได้ หากมีความจำเป็น กรุณาติดต่อแอดมินเพื่อปรับงานหรือหาคนแทน',
        locked:true,
        job_count: lockedJobs
      });
    }
    const saved = await upsertCalendarDay(pool, username, workDate, { ...req.body, work_date:workDate });
    res.json({ ok:true, saved:1, skipped_locked:0, item:normalizeCalendarRow(saved, workDate, 0) });
  } catch (e) {
    console.error('PUT /technicians/:username/work-calendar-v2/day error:', e);
    res.status(500).json({ error:'บันทึกปฏิทินรับงานล่วงหน้าไม่สำเร็จ' });
  }
});

app.put('/technicians/:username/work-calendar-v2/batch', async (req, res) => {
  const client = await pool.connect();
  try {
    const username = String(req.params?.username || '').trim();
    const ctx = await requireCalendarUsernameAccess(req, res, username);
    if (!ctx) return;
    const dates = Array.isArray(req.body?.dates) ? req.body.dates : [];
    if (!dates.length) return res.status(400).json({ error:'ต้องมี dates อย่างน้อย 1 วัน' });
    if (dates.length > 62) return res.status(400).json({ error:'เลือกได้สูงสุด 62 วันต่อครั้ง' });
    await client.query('BEGIN');
    let saved = 0;
    let skippedLocked = 0;
    for (const rawDate of dates) {
      const workDate = String(rawDate || '').trim();
      if (!isStrictIsoDate(workDate)) continue;
      const lockedJobs = await countLockedAdvanceJobsForDate(client, username, workDate);
      if (lockedJobs > 0) {
        skippedLocked++;
        continue;
      }
      await upsertCalendarDay(client, username, workDate, { ...req.body, work_date:workDate });
      saved++;
    }
    await client.query('COMMIT');
    res.json({ ok:true, saved, skipped_locked:skippedLocked });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('PUT /technicians/:username/work-calendar-v2/batch error:', e);
    res.status(500).json({ error:'บันทึกวันที่เลือกไม่สำเร็จ' });
  } finally { client.release(); }
});

app.post('/technicians/:username/work-calendar-v2/copy-previous-month', async (req, res) => {
  const client = await pool.connect();
  try {
    const username = String(req.params?.username || '').trim();
    const ctx = await requireCalendarUsernameAccess(req, res, username);
    if (!ctx) return;
    const targetMonth = String(req.body?.target_month || '').trim();
    if (!isStrictMonth(targetMonth)) return res.status(400).json({ error:'target_month ต้องเป็นรูปแบบ YYYY-MM' });
    const [y,m] = targetMonth.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    const prevMonth = toIsoDate(prev).slice(0,7);
    const prevData = await loadWorkCalendarV2Month(username, prevMonth);
    const prevByDay = new Map(prevData.days.map(d => [String(d.date).slice(-2), d]));
    await client.query('BEGIN');
    let saved = 0;
    let skippedLocked = 0;
    for (const workDate of cwfDateRange(firstDayOfMonthIso(targetMonth), endDayOfMonthIso(targetMonth))) {
      const source = prevByDay.get(workDate.slice(-2));
      if (!source) continue;
      const lockedJobs = await countLockedAdvanceJobsForDate(client, username, workDate);
      if (lockedJobs > 0) {
        skippedLocked++;
        continue;
      }
      await upsertCalendarDay(client, username, workDate, {
        work_date: workDate,
        can_accept_advance_job: !!source.can_accept_advance_job,
        start_time: source.start_time,
        end_time: source.end_time,
        max_jobs_per_day: source.cap_mode === 'technician_custom' ? source.max_jobs_per_day : null,
        max_units_per_day: source.cap_mode === 'technician_custom' ? source.max_units_per_day : null,
        note: source.note
      });
      saved++;
    }
    await client.query('COMMIT');
    res.json({ ok:true, saved, skipped_locked:skippedLocked });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST /technicians/:username/work-calendar-v2/copy-previous-month error:', e);
    res.status(500).json({ error:'ตั้งค่าเหมือนเดือนก่อนไม่สำเร็จ' });
  } finally { client.release(); }
});

app.use(createTechnicianCalendarReadOnlyRoutes({
  pool,
  requireTechnicianSession,
  requireAdminSession,
  toIsoDate,
  firstDayOfMonthIso,
  endDayOfMonthIso,
  isStrictIsoDate,
}));

app.use(createTechnicianCalendarWriteRoutes({
  pool,
  requireTechnicianSession,
  toIsoDate,
  normWorkDayPayload,
  countLockedAdvanceJobsForDate,
  sourceForWorkDayPayload,
}));

// Defect 4/6: technician self-service copy uses the session identity (req.effective.username)
// so it can never write to a username supplied by the client. Mirrors the admin v2 copy logic.
app.post('/tech/work-calendar/copy-previous-month', requireTechnicianSession, async (req, res) => {
  const client = await pool.connect();
  try {
    const username = String(req.effective?.username || '').trim();
    const targetMonth = String(req.body?.target_month || '').trim();
    if (!isStrictMonth(targetMonth)) return res.status(400).json({ error:'target_month ต้องเป็นรูปแบบ YYYY-MM' });
    const [y,m] = targetMonth.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    const prevMonth = toIsoDate(prev).slice(0,7);
    const prevData = await loadWorkCalendarV2Month(username, prevMonth);
    const prevByDay = new Map(prevData.days.map(d => [String(d.date).slice(-2), d]));
    await client.query('BEGIN');
    let saved = 0;
    let skippedLocked = 0;
    for (const workDate of cwfDateRange(firstDayOfMonthIso(targetMonth), endDayOfMonthIso(targetMonth))) {
      const source = prevByDay.get(workDate.slice(-2));
      if (!source) continue;
      const lockedJobs = await countLockedAdvanceJobsForDate(client, username, workDate);
      if (lockedJobs > 0) {
        skippedLocked++;
        continue;
      }
      await upsertCalendarDay(client, username, workDate, {
        work_date: workDate,
        can_accept_advance_job: !!source.can_accept_advance_job,
        start_time: source.start_time,
        end_time: source.end_time,
        max_jobs_per_day: source.cap_mode === 'technician_custom' ? source.max_jobs_per_day : null,
        max_units_per_day: source.cap_mode === 'technician_custom' ? source.max_units_per_day : null,
        note: source.note
      });
      saved++;
    }
    await client.query('COMMIT');
    res.json({ ok:true, saved, skipped_locked:skippedLocked });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST /tech/work-calendar/copy-previous-month error:', e);
    res.status(500).json({ error:'ตั้งค่าเหมือนเดือนก่อนไม่สำเร็จ' });
  } finally { client.release(); }
});

app.get('/tech/daily-readiness/today', requireTechnicianSession, async (req, res) => {
  try {
    const username = String(req.effective?.username || '').trim();
    const data = await ensureDailyReadinessRow(username);
    res.json({ ok:true, username, ...data });
  } catch (e) {
    console.error('GET /tech/daily-readiness/today error:', e);
    res.status(500).json({ error:'โหลดความพร้อมวันนี้ไม่สำเร็จ' });
  }
});

app.post('/tech/daily-readiness', requireTechnicianSession, async (req, res) => {
  try {
    const username = String(req.effective?.username || '').trim();
    const status = String(req.body?.status || '').trim();
    if (!['ready','not_ready'].includes(status)) return res.status(400).json({ error:'status ต้องเป็น ready หรือ not_ready' });
    const reason = String(req.body?.reason || '').slice(0,500);
    const first = await ensureDailyReadinessRow(username);
    if (!first.has_jobs) return res.json({ ok:true, has_jobs:false, message:'วันนี้ไม่มีงานที่ต้องยืนยันความพร้อม' });
    const r = await pool.query(`
      INSERT INTO public.technician_daily_readiness(technician_username, work_date, status, ready_at, not_ready_reason, first_job_at, deadline_at, updated_at)
      VALUES($1, (NOW() AT TIME ZONE 'Asia/Bangkok')::date, $2, CASE WHEN $2='ready' THEN NOW() ELSE NULL END, $3, $4, ($4::timestamptz - INTERVAL '1 hour'), NOW())
      ON CONFLICT(technician_username, work_date) DO UPDATE SET
        status=EXCLUDED.status,
        ready_at=EXCLUDED.ready_at,
        not_ready_reason=EXCLUDED.not_ready_reason,
        first_job_at=COALESCE(public.technician_daily_readiness.first_job_at, EXCLUDED.first_job_at),
        deadline_at=COALESCE(public.technician_daily_readiness.deadline_at, EXCLUDED.deadline_at),
        updated_at=NOW()
      RETURNING *
    `, [username, status, reason, first.jobs[0]?.appointment_datetime]);
    if (status === 'ready') {
      await pool.query(`UPDATE public.technician_profiles SET last_daily_ready_at=NOW() WHERE username=$1`, [username]);
    }
    res.json({ ok:true, readiness:r.rows[0] });
  } catch (e) {
    console.error('POST /tech/daily-readiness error:', e);
    res.status(500).json({ error:'บันทึกความพร้อมวันนี้ไม่สำเร็จ' });
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
app.use(createServiceZoneRoutes({
  getServiceZones,
  SERVICE_ZONE_SEEDS,
  ENABLE_SERVICE_ZONE_FILTER
}));

app.post("/public/service-zones/detect", async (req, res) => {
  try {
    const body = req.body || {};
    const detected = await detectServiceZoneFromText({
      address_text: body.address_text,
      job_zone: body.job_zone,
      maps_url: body.maps_url,
      gps_latitude: body.gps_latitude,
      gps_longitude: body.gps_longitude,
    });
    res.json({
      ok: true,
      filter_enabled: ENABLE_SERVICE_ZONE_FILTER,
      detected: publicServiceZoneView(detected),
    });
  } catch (e) {
    console.error("POST /public/service-zones/detect", e);
    res.status(500).json({ error: "DETECT_SERVICE_ZONE_FAILED" });
  }
});

app.post("/service_zones/detect", requireAdminSession, async (req, res) => {
  try {
    const detected = await detectServiceZoneFromText(req.body || {}, { allowAdminOverride: true });
    res.json({ ok: true, detected, filter_enabled: ENABLE_SERVICE_ZONE_FILTER });
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
      `SELECT r.id, r.id AS request_id, r.username, r.full_name, r.photo_temp_path, r.requested_at,
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
    let technician_code = (req.body.technician_code || "").trim();

    // ✅ FIX: ถ้าแอดมินไม่ส่ง position มา = อย่าทับของเดิม
    const position = (req.body.position || "").trim() || null;

    if (!id) return res.status(400).json({ error: "id ไม่ถูกต้อง" });

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

    if (!technician_code) {
      const existingCode = await client.query(
        `SELECT technician_code FROM public.technician_profiles WHERE username=$1 LIMIT 1`,
        [reqRow.username]
      );
      technician_code = String(existingCode.rows[0]?.technician_code || reqRow.username || '').trim();
    }
    if (!technician_code) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "ไม่พบรหัสช่างเดิม กรุณาใส่รหัสช่าง" });
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

    const updTechProfile = await client.query(
      `UPDATE public.technician_profiles
          SET technician_code=$2,
              full_name=COALESCE($3, full_name),
              photo_path=COALESCE($4, photo_path),
              position=COALESCE($5, position),
              accept_status=COALESCE(accept_status,'ready'),
              updated_at=CURRENT_TIMESTAMP
        WHERE username=$1`,
      [reqRow.username, technician_code, reqRow.full_name || null, finalPhotoPath || null, position]
    );
    if (!updTechProfile.rowCount) {
      await client.query(
        `INSERT INTO public.technician_profiles (username, technician_code, full_name, photo_path, position, accept_status, updated_at)
         VALUES ($1,$2,$3,$4,$5,'ready',CURRENT_TIMESTAMP)`,
        [reqRow.username, technician_code, reqRow.full_name || null, finalPhotoPath || null, position]
      );
    }

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
              -- Defect 2: surface the TRUE persisted visibility (null stays null) so the admin UI
              -- reflects the same fail-closed state the customer eligibility query enforces.
              p.customer_slot_visible AS customer_slot_visible,
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
const {
  getTechnicianForStatus,
  getLatestBaseStatus,
} = createTechnicianBaseStatusDataHelpers({ pool });

app.get('/admin/team-status', requireAdminSession, (req, res) => res.sendFile(sendHtml('admin-team-status.html')));
app.get('/admin/team-status.html', requireAdminSession, (req, res) => res.redirect(302, '/admin/team-status'));
app.get('/admin-team-status.html', requireAdminSession, (req, res) => res.sendFile(sendHtml('admin-team-status.html')));
app.use(createTechnicianBaseStatusReadOnlyRoutes({
  pool,
  requireAdminSession,
  requireTechnicianSession,
  getTechnicianForStatus,
  getLatestBaseStatus,
}));

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

// Technician Self Assessment entrypoint (Phase 1.1)
// - ช่างทำแบบประเมินเองได้จากเมนูช่าง
// - บันทึกเป็น pending_review เพื่อให้ Admin/Super Admin ตรวจต่อ ไม่ใช่คะแนน official อัตโนมัติ
app.get('/tech/base-status', requireTechnicianSession, (req, res) => res.sendFile(sendHtml('tech-base-status.html')));
app.get('/tech/base-status.html', requireTechnicianSession, (req, res) => res.redirect(302, '/tech/base-status'));

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
    const persistedProfile = await upsertTechnicianProfile(pool, {
      username,
      technician_code,
      full_name,
      position,
      phone: phoneRaw,
      employment_type,
      work_start,
      work_end,
      customer_slot_visible: hasCustomerSlotVisible ? customer_slot_visible : null,
      compensation_mode,
      daily_wage_amount,
      monthly_salary_amount,
    });
    const profileUpsert = { rows: [persistedProfile] };

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

    // Defect 3: return the persisted record so the admin UI can verify the read-back
    // (customer_slot_visible/employment_type) matches what it submitted before reporting success.
    const persisted = profileUpsert.rows[0] || {};
    res.json({
      ok: true,
      technician: {
        username: persisted.username || username,
        employment_type: persisted.employment_type || null,
        customer_slot_visible: persisted.customer_slot_visible === true
          ? true
          : (persisted.customer_slot_visible === false ? false : null),
      },
    });
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

function _accountingThaiDate(v, opts = {}) {
  if (!v) return '-';
  try {
    return new Date(v).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', year: 'numeric', month: 'short', day: 'numeric', ...opts });
  } catch (_) { return String(v || '-'); }
}
function _accountingPayoutDueDate(period = {}) {
  const rawType = String(period.period_type || '').trim();
  const start = period.period_start ? new Date(period.period_start) : null;
  if (!start || Number.isNaN(start.getTime())) return null;
  // period_start ของงวด 10/25 คือช่วงงานก่อนวันจ่าย ใช้เดือน/ปีของ period_end เป็นวันที่จ่ายจริง
  const end = period.period_end ? new Date(period.period_end) : start;
  const base = new Date(end.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const y = base.getFullYear();
  const m = base.getMonth();
  const day = rawType === '25' ? 25 : 10;
  return new Date(Date.UTC(y, m, day, 0, 0, 0));
}
function _accountingPayoutCutoffLabel(period = {}) {
  return `ช่วงงาน ${_accountingThaiDate(period.period_start)} - ${_accountingThaiDate(period.period_end)}`;
}
async function _accountingNextDocumentNo(documentType) {
  const type = String(documentType || '').trim();
  const nowBkk = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const year = Number(nowBkk.getFullYear());
  const month = String(nowBkk.getMonth() + 1).padStart(2, '0');
  const prefix = ({ quotation: 'QT', invoice: 'INV', receipt: 'RC', tax_invoice: 'TAX', withholding_cert: 'WT' })[type];
  if (!prefix) {
    const e = new Error('INVALID_DOCUMENT_TYPE'); e.code = 'INVALID_DOCUMENT_TYPE'; throw e;
  }
  const q = await pool.query(
    `INSERT INTO public.accounting_document_sequences(document_type, year, last_number, updated_at)
     VALUES($1,$2,1,NOW())
     ON CONFLICT(document_type, year) DO UPDATE SET last_number=accounting_document_sequences.last_number + 1, updated_at=NOW()
     RETURNING last_number`,
    [type, year]
  );
  const seq = String(q.rows[0]?.last_number || 1).padStart(4, '0');
  if (type === 'withholding_cert') return `${prefix}${year}${month}${seq}`;
  return `${prefix}-${year}-${seq}`;
}
function _accountingWhtMonthKeyFromPeriod(period = {}) {
  const due = _accountingPayoutDueDate(period);
  if (!due || Number.isNaN(due.getTime())) return '';
  const bkk = new Date(due.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  return `${bkk.getFullYear()}-${String(bkk.getMonth() + 1).padStart(2, '0')}`;
}
function _accountingWhtMonthLabel(monthKey) {
  const m = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return '-';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return d.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', year: 'numeric', month: 'long' });
}

async function _ensureAccountingSettingsSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.accounting_settings (
      "key" TEXT,
      value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_by TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE IF EXISTS public.accounting_settings ADD COLUMN IF NOT EXISTS "key" TEXT`);
  await pool.query(`ALTER TABLE IF EXISTS public.accounting_settings ADD COLUMN IF NOT EXISTS value_json JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await pool.query(`ALTER TABLE IF EXISTS public.accounting_settings ADD COLUMN IF NOT EXISTS updated_by TEXT`);
  await pool.query(`ALTER TABLE IF EXISTS public.accounting_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
  // Some older builds created setting_key instead of key. Copy it forward if it exists.
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='accounting_settings' AND column_name='setting_key'
      ) THEN
        EXECUTE 'UPDATE public.accounting_settings SET "key" = setting_key WHERE "key" IS NULL AND setting_key IS NOT NULL';
      END IF;
    END $$;
  `);
}

async function _ensureTechnicianTaxProfileSchema(clientOrPool = pool) {
  const q = (sql, params) => clientOrPool.query(sql, params);
  await q(`ALTER TABLE IF EXISTS public.technician_profiles ADD COLUMN IF NOT EXISTS full_name TEXT`);
  await q(`ALTER TABLE IF EXISTS public.technician_profiles ADD COLUMN IF NOT EXISTS tax_id TEXT`);
  await q(`ALTER TABLE IF EXISTS public.technician_profiles ADD COLUMN IF NOT EXISTS tax_address TEXT`);
  await q(`ALTER TABLE IF EXISTS public.technician_profiles ADD COLUMN IF NOT EXISTS tax_branch TEXT`);
  await q(`ALTER TABLE IF EXISTS public.technician_profiles ADD COLUMN IF NOT EXISTS wht_income_type TEXT DEFAULT 'ค่าบริการ/ค่าจ้างทำของ ตามมาตรา 40(8)'`);
  await q(`ALTER TABLE IF EXISTS public.technician_profiles ADD COLUMN IF NOT EXISTS wht_default_rate NUMERIC(5,2) DEFAULT 3`);
  await q(`ALTER TABLE IF EXISTS public.technician_profiles ADD COLUMN IF NOT EXISTS tax_profile_status TEXT DEFAULT 'not_submitted'`);
  await q(`ALTER TABLE IF EXISTS public.technician_profiles ADD COLUMN IF NOT EXISTS tax_profile_reviewed_by TEXT`);
  await q(`ALTER TABLE IF EXISTS public.technician_profiles ADD COLUMN IF NOT EXISTS tax_profile_reviewed_at TIMESTAMPTZ`);
  await q(`ALTER TABLE IF EXISTS public.technician_profiles ADD COLUMN IF NOT EXISTS tax_profile_note TEXT`);
  await q(`ALTER TABLE IF EXISTS public.technician_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
  await q(`
    CREATE TABLE IF NOT EXISTS public.technician_tax_profile_requests (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      full_name TEXT,
      tax_id TEXT,
      tax_address TEXT,
      tax_branch TEXT,
      wht_income_type TEXT,
      wht_default_rate NUMERIC(5,2) DEFAULT 3,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_at TIMESTAMPTZ DEFAULT NOW(),
      reviewed_by TEXT,
      reviewed_at TIMESTAMPTZ,
      admin_note TEXT
    )
  `);
  await q(`ALTER TABLE IF EXISTS public.technician_tax_profile_requests ADD COLUMN IF NOT EXISTS username TEXT`);
  await q(`ALTER TABLE IF EXISTS public.technician_tax_profile_requests ADD COLUMN IF NOT EXISTS full_name TEXT`);
  await q(`ALTER TABLE IF EXISTS public.technician_tax_profile_requests ADD COLUMN IF NOT EXISTS tax_id TEXT`);
  await q(`ALTER TABLE IF EXISTS public.technician_tax_profile_requests ADD COLUMN IF NOT EXISTS tax_address TEXT`);
  await q(`ALTER TABLE IF EXISTS public.technician_tax_profile_requests ADD COLUMN IF NOT EXISTS tax_branch TEXT`);
  await q(`ALTER TABLE IF EXISTS public.technician_tax_profile_requests ADD COLUMN IF NOT EXISTS wht_income_type TEXT`);
  await q(`ALTER TABLE IF EXISTS public.technician_tax_profile_requests ADD COLUMN IF NOT EXISTS wht_default_rate NUMERIC(5,2) DEFAULT 3`);
  await q(`ALTER TABLE IF EXISTS public.technician_tax_profile_requests ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'`);
  await q(`ALTER TABLE IF EXISTS public.technician_tax_profile_requests ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ DEFAULT NOW()`);
  await q(`ALTER TABLE IF EXISTS public.technician_tax_profile_requests ADD COLUMN IF NOT EXISTS reviewed_by TEXT`);
  await q(`ALTER TABLE IF EXISTS public.technician_tax_profile_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`);
  await q(`ALTER TABLE IF EXISTS public.technician_tax_profile_requests ADD COLUMN IF NOT EXISTS admin_note TEXT`);
  await q(`CREATE INDEX IF NOT EXISTS idx_tech_tax_profile_requests_status_created ON public.technician_tax_profile_requests(status, requested_at DESC)`);
}


async function _ensureAccountingCompanySettingsSchema() {
  // Dedicated single-row JSON table for company document settings.
  // This avoids failures from older production accounting_settings schemas
  // that were created without a "key" column.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.accounting_company_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_by TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE IF EXISTS public.accounting_company_settings ADD COLUMN IF NOT EXISTS value_json JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await pool.query(`ALTER TABLE IF EXISTS public.accounting_company_settings ADD COLUMN IF NOT EXISTS updated_by TEXT`);
  await pool.query(`ALTER TABLE IF EXISTS public.accounting_company_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
}

function _accountingDefaultCompanySettings() {
  return {
    company_name: 'Coldwindflow Air Services',
    tax_id: '',
    branch: 'สำนักงานใหญ่',
    address: '23/61 ถ.พึ่งมี 50 แขวงบางจาก เขตพระโขนง กรุงเทพฯ 10260',
    phone: '098-877-7321',
    signer_name: 'นาย สุทธิพงษ์ ศรีวารินทร์',
    signer_position: 'ผู้มีอำนาจลงนาม',
    logo_url: '/logo.png',
    signature_url: '/assets/signatures/owner-signature-transparent.png',
    stamp_url: '',
    vat_rate: 7,
    wht_rate: 3,
    footer_note: '',
    bank_info: '',
  };
}

function _mergeAccountingCompanySettings(v = {}) {
  const d = _accountingDefaultCompanySettings();
  return {
    ...d,
    ...(v || {}),
    company_name: String(v.company_name || d.company_name).trim() || d.company_name,
    tax_id: String(v.tax_id || '').trim(),
    branch: String(v.branch || d.branch).trim() || d.branch,
    address: String(v.address || d.address).trim() || d.address,
    phone: String(v.phone || d.phone).trim() || d.phone,
    signer_name: String(v.signer_name || d.signer_name).trim() || d.signer_name,
    signer_position: String(v.signer_position || d.signer_position).trim() || d.signer_position,
    logo_url: String(v.logo_url || d.logo_url).trim() || d.logo_url,
    signature_url: String(v.signature_url || d.signature_url).trim() || d.signature_url,
    stamp_url: String(v.stamp_url || '').trim(),
    vat_rate: _money(v.vat_rate == null ? d.vat_rate : v.vat_rate),
    wht_rate: _money(v.wht_rate == null ? d.wht_rate : v.wht_rate),
    footer_note: String(v.footer_note || '').trim(),
    bank_info: String(v.bank_info || '').trim(),
  };
}

async function _getAccountingSettings() {
  const defaults = _accountingDefaultCompanySettings();
  try {
    await _ensureAccountingCompanySettingsSchema();
    const q = await pool.query(`SELECT value_json FROM public.accounting_company_settings WHERE id=1 LIMIT 1`);
    return _mergeAccountingCompanySettings(q.rows[0]?.value_json || defaults);
  } catch (e) {
    console.error('ACCOUNTING_COMPANY_SETTINGS_GET_FALLBACK', e?.message || e);
    return defaults;
  }
}

async function _accountingSaveUploadedAsset(file, folder = 'settings') {
  if (!file || !file.buffer) return '';
  const publicId = `cwf/accounting/${folder}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  try {
    const up = await cloudinaryUploadBuffer({ buffer: file.buffer, mimetype: file.mimetype || 'image/jpeg', folder: `cwf/accounting/${folder}`, publicId, transformation: 'c_limit,w_1400/q_auto/f_auto' });
    return up.secure_url || up.url || '';
  } catch (e) {
    const dir = path.join(__dirname, 'uploads', 'accounting', folder);
    fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(file.originalname || '') || '.jpg';
    const safeName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    fs.writeFileSync(path.join(dir, safeName), file.buffer);
    return `/uploads/accounting/${folder}/${safeName}`;
  }
}

function _accountingSettingsFromBody(body = {}, current = {}) {
  const pick = (k, def='') => String(body[k] ?? current[k] ?? def).trim();
  return {
    company_name: pick('company_name', 'Coldwindflow Air Services'),
    tax_id: pick('tax_id'),
    branch: pick('branch', 'สำนักงานใหญ่'),
    address: pick('address', '23/61 ถ.พึ่งมี 50 แขวงบางจาก เขตพระโขนง กรุงเทพฯ 10260'),
    phone: pick('phone', '098-877-7321'),
    signer_name: pick('signer_name', 'นาย สุทธิพงษ์ ศรีวารินทร์'),
    signer_position: pick('signer_position', 'ผู้มีอำนาจลงนาม'),
    vat_rate: _money(body.vat_rate ?? current.vat_rate ?? 7),
    wht_rate: _money(body.wht_rate ?? current.wht_rate ?? 3),
    footer_note: pick('footer_note'),
    bank_info: pick('bank_info'),
    // Keep existing uploaded assets when the form sends empty URL fields.
    // Users should not lose logo/signature/stamp by simply saving other settings.
    logo_url: String(body.logo_url ?? '').trim() || current.logo_url || '/logo.png',
    signature_url: String(body.signature_url ?? '').trim() || current.signature_url || '/assets/signatures/owner-signature-transparent.png',
    stamp_url: String(body.stamp_url ?? '').trim() || current.stamp_url || '',
  };
}

async function _accountingGetTechTaxProfile(username) {
  await _ensureTechnicianTaxProfileSchema();
  const tech = String(username || '').trim();
  if (!tech) return null;
  const q = await pool.query(
    `SELECT COALESCE(p.username, u.username, $1) AS username,
            COALESCE(NULLIF(p.full_name,''), NULLIF(u.full_name,''), p.username, u.username, $1) AS full_name,
            COALESCE(p.phone,'') AS phone,
            COALESCE(p.tax_id,'') AS tax_id,
            COALESCE(p.tax_address,'') AS tax_address,
            COALESCE(p.tax_branch,'') AS tax_branch,
            COALESCE(p.wht_income_type,'ค่าบริการ/ค่าจ้างทำของ ตามมาตรา 40(8)') AS wht_income_type,
            COALESCE(p.wht_default_rate,3)::numeric AS wht_default_rate,
            COALESCE(p.tax_profile_status,'not_submitted') AS tax_profile_status,
            p.tax_profile_reviewed_by,
            p.tax_profile_reviewed_at,
            p.tax_profile_note
       FROM (SELECT $1::text AS username) seed
       LEFT JOIN public.technician_profiles p ON LOWER(p.username)=LOWER(seed.username)
       LEFT JOIN public.users u ON LOWER(u.username)=LOWER(seed.username)
      LIMIT 1`,
    [tech]
  );
  const row = q.rows[0] || { username: tech, full_name: tech, tax_id: '', tax_address: '', tax_branch: '', wht_income_type: 'ค่าบริการ/ค่าจ้างทำของ ตามมาตรา 40(8)', wht_default_rate: 3, tax_profile_status: 'not_submitted' };
  const missing = [];
  if (!String(row.full_name || '').trim()) missing.push('ชื่อช่าง/ผู้รับเงิน');
  if (!String(row.tax_id || '').trim()) missing.push('เลขประจำตัวผู้เสียภาษี/บัตรประชาชน');
  if (!String(row.tax_address || '').trim()) missing.push('ที่อยู่ผู้รับเงิน');
  return { ...row, missing_fields: missing, is_complete: missing.length === 0 };
}
async function _accountingPayoutIdsForWhtMonth(period) {
  const monthKey = _accountingWhtMonthKeyFromPeriod(period);
  if (!monthKey) return [];
  const q = await pool.query(
    `SELECT payout_id, period_type, period_start, period_end, status
       FROM public.technician_payout_periods
      ORDER BY period_start DESC, payout_id DESC
      LIMIT 500`
  );
  return (q.rows || []).filter(p => _accountingWhtMonthKeyFromPeriod(p) === monthKey).map(p => p.payout_id);
}
async function _accountingMonthlyWhtBase({ payout_id, technician_username }) {
  const period = await _getPayoutPeriod(payout_id);
  if (!period) {
    const e = new Error('PAYOUT_NOT_FOUND'); e.code = 'PAYOUT_NOT_FOUND'; throw e;
  }
  const payoutIds = await _accountingPayoutIdsForWhtMonth(period);
  let incomePaid = 0, incomeAccrued = 0, jobCount = 0;
  const sourceRows = [];
  for (const pid of payoutIds) {
    const rows = await _accountingStoredPayoutTechRows(pid);
    const r = (rows || []).find(x => String(x.technician_username) === String(technician_username));
    if (!r) continue;
    const paid = _money(r.paid_amount || 0);
    const net = _money(r.net_amount || 0);
    incomePaid += paid;
    incomeAccrued += net;
    jobCount += Number(r.job_count || 0);
    sourceRows.push({ payout_id: pid, paid_amount: paid, net_amount: net, job_count: Number(r.job_count || 0), paid_status: r.paid_status || null });
  }
  return { period, month_key: _accountingWhtMonthKeyFromPeriod(period), month_label: _accountingWhtMonthLabel(_accountingWhtMonthKeyFromPeriod(period)), payout_ids: payoutIds, income_paid: _money(incomePaid), income_accrued: _money(incomeAccrued), job_count: jobCount, source_rows: sourceRows };
}
async function _accountingEnrichPayoutTechRows(payout_id, period, rows = []) {
  const monthKey = _accountingWhtMonthKeyFromPeriod(period);
  const out = [];
  for (const r of rows || []) {
    const tech = String(r.technician_username || '').trim();
    const profile = await _accountingGetTechTaxProfile(tech);
    let cashHeldAmount = 0;
    let cashHeldJobs = 0;
    try {
      const cashQ = await pool.query(
        `SELECT COALESCE(SUM(amount),0)::numeric AS amount, COUNT(*)::int AS jobs
           FROM public.technician_cash_collections
          WHERE payout_id=$1 AND technician_username=$2 AND status IN ('held','offset')`,
        [payout_id, tech]
      );
      cashHeldAmount = _money(cashQ.rows?.[0]?.amount || 0);
      cashHeldJobs = Number(cashQ.rows?.[0]?.jobs || 0);
    } catch (_) {}
    const rate = _money(profile?.wht_default_rate || 3);
    const paid = _money(r.paid_amount || 0);
    const base = paid > 0 ? paid : _money(r.net_amount || 0);
    let existing = null;
    try {
      const ex = await pool.query(
        `SELECT document_id, document_no, status
           FROM public.accounting_documents
          WHERE document_type='withholding_cert'
            AND COALESCE(status,'') <> 'voided'
            AND payload_json->>'technician_username'=$1
            AND payload_json->>'wht_month'=$2
          ORDER BY created_at DESC, document_id DESC
          LIMIT 1`,
        [tech, monthKey]
      );
      existing = ex.rows[0] || null;
    } catch (_) {}
    out.push({
      ...r,
      technician_full_name: profile?.full_name || tech,
      tax_profile: profile,
      wht_month: monthKey,
      wht_month_label: _accountingWhtMonthLabel(monthKey),
      wht_income_amount: _money(base),
      wht_rate: rate,
      wht_tax_amount: _money(base * rate / 100),
      withholding_document: existing,
      can_issue_withholding: !!(profile?.is_complete && paid > 0),
      cash_held_amount: cashHeldAmount,
      cash_held_jobs: cashHeldJobs,
    });
  }
  return out;
}
function _accountingDocumentHtmlEscape(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function _accountingWhtTaxIdDigits(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 13);
}
function _accountingWhtTaxIdBoxesHtml(value, escH) {
  const digits = _accountingWhtTaxIdDigits(value);
  return `<div class="tax-id-boxes">${Array.from({ length: 13 }).map((_, i) => `<span class="tax-box">${escH(digits[i] || '')}</span>`).join('')}</div>`;
}
function _accountingThaiBahtText(amount) {
  const num = Math.round((Number(amount || 0) + Number.EPSILON) * 100) / 100;
  const units = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const positions = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
  function convertInteger(n) {
    n = Math.floor(Number(n || 0));
    if (!n) return '';
    if (n >= 1000000) {
      const million = Math.floor(n / 1000000);
      const rest = n % 1000000;
      return `${convertInteger(million)}ล้าน${rest ? convertInteger(rest) : ''}`;
    }
    const s = String(n);
    let out = '';
    for (let i = 0; i < s.length; i += 1) {
      const digit = Number(s[i]);
      if (!digit) continue;
      const pos = s.length - i - 1;
      if (pos === 1) {
        if (digit === 1) out += 'สิบ';
        else if (digit === 2) out += 'ยี่สิบ';
        else out += `${units[digit]}สิบ`;
      } else if (pos === 0) {
        if (digit === 1 && s.length > 1) out += 'เอ็ด';
        else out += units[digit];
      } else {
        out += `${units[digit]}${positions[pos] || ''}`;
      }
    }
    return out;
  }
  const baht = Math.floor(num);
  const satang = Math.round((num - baht) * 100);
  return `${convertInteger(baht) || 'ศูนย์'}บาท${satang ? `${convertInteger(satang)}สตางค์` : 'ถ้วน'}`;
}
function _accountingWhtDisplayNo(docNo, issueDate) {
  const raw = String(docNo || '').trim();
  if (/^WT\d{10,12}$/.test(raw)) return raw;
  const issue = issueDate ? new Date(issueDate) : new Date();
  const bkk = new Date(issue.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const year = bkk.getFullYear();
  const month = String(bkk.getMonth() + 1).padStart(2, '0');
  const old = raw.match(/^WHT-(\d{4})-(\d+)$/i);
  if (old) return `WT${year}${month}${String(old[2] || '').padStart(4, '0')}`;
  return raw || `WT${year}${month}0001`;
}
function _accountingWhtDateFields(value) {
  const d = value ? new Date(value) : new Date();
  const bkk = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const day = String(bkk.getDate()).padStart(2, '0');
  const month = String(bkk.getMonth() + 1).padStart(2, '0');
  const year = String(bkk.getFullYear());
  return { day, month, year, slash: `${day}/${month}/${year}` };
}

const ACCOUNTING_WHT_LAYOUT = Object.freeze({
  // A4 pdf-lib coordinates, origin is bottom-left. Signature is intentionally
  // scaled inside the payer signer box so it cannot cover the date,
  // payer text, stamp placeholder, or certification wording.
  signatureBox: Object.freeze({ x: 300, y: 79, maxW: 190, maxH: 22 }),
  taxDigitSize: 10,
  // Template tax-id fields are grouped 1-4-5-2-1 with visible gaps.
  // Drawing with equal 13-cell spacing makes each digit drift off-center,
  // so these offsets target the visual center of each printed box.
  taxDigitCenterOffsets: Object.freeze([5.6, 23.5, 35.5, 47.8, 59.8, 79.0, 90.3, 101.8, 113.8, 126.3, 144.9, 157.0, 175.6]),
  checkboxSize: 9,
  headerTextSize: 10.5,
  tableTextSize: 9.8,
});

function _accountingWithholdingPrintHtml(doc, company) {
  const p = doc.payload_json || {};
  const escH = _accountingDocumentHtmlEscape;
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${escH(doc.document_no || '')}</title></head><body><p>ระบบจะเปิดเอกสารทวิ50เป็น PDF จาก template ต้นฉบับ หากเห็นหน้านี้แปลว่า browser/API ไม่รองรับ PDF output</p></body></html>`;
}

function _accountingSetPdfTextField(form, name, value) {
  try {
    const f = form.getTextField(name);
    f.setText(String(value ?? ''));
  } catch (_) {}
}
function _accountingCheckPdfBox(form, name, checked = true) {
  try {
    const f = form.getCheckBox(name);
    if (checked) f.check(); else f.uncheck();
  } catch (_) {}
}
function _accountingRemovePdfField(form, name) {
  try {
    const f = form.getField(name);
    form.removeField(f);
  } catch (_) {}
}
function _accountingLocalAssetPath(urlOrPath) {
  const v = String(urlOrPath || '').trim();
  if (!v || /^https?:\/\//i.test(v) || v.startsWith('data:')) return '';
  const rel = v.startsWith('/') ? v.slice(1) : v;
  const full = path.join(__dirname, rel);
  return fs.existsSync(full) ? full : '';
}
function resolveAccountingSignaturePath(company = {}) {
  const configured = String(company.signature_url || '').trim();
  const configuredIsDefaultOwner = !configured || /(^|\/)owner-signature\.png$/i.test(configured);
  const candidates = [
    configuredIsDefaultOwner ? '/assets/signatures/owner-signature-transparent.png' : configured,
    configuredIsDefaultOwner ? '' : '/assets/signatures/owner-signature-transparent.png',
    '/assets/signatures/owner-signature-transparent.png',
    '/assets/signatures/owner-signature.png',
    'assets/signatures/owner-signature.png',
    'assets/signatures/owner-signature-transparent.png',
    '/public/assets/signatures/owner-signature.png',
  ].map(v => String(v || '').trim()).filter(Boolean);
  for (const c of candidates) {
    const local = _accountingLocalAssetPath(c);
    if (local) return local;
  }
  return '';
}
function _accountingOwnerSignerName() { return 'นาย สุทธิพงษ์ ศรีวารินทร์'; }
function _accountingOwnerSignerPosition() { return 'ผู้มีอำนาจลงนาม'; }
function _accountingOwnerSignaturePublicUrl() {
  return resolveAccountingSignaturePath({ signature_url: '/assets/signatures/owner-signature-transparent.png' })
    ? '/assets/signatures/owner-signature-transparent.png'
    : '';
}
function _accountingSignaturePublicUrl(company = {}) {
  const raw = String(company.signature_url || '').trim();
  if (!raw || /(^|\/)owner-signature\.png$/i.test(raw)) {
    return resolveAccountingSignaturePath({ signature_url: raw }) ? '/assets/signatures/owner-signature-transparent.png' : '';
  }
  if (raw && (/^https?:\/\//i.test(raw) || raw.startsWith('/') || raw.startsWith('data:'))) return raw;
  return resolveAccountingSignaturePath(company) ? '/assets/signatures/owner-signature.png' : '';
}
async function _accountingLoadImageBytes(assetPathOrUrl) {
  const src = String(assetPathOrUrl || '').trim();
  if (!src) return null;
  if (src.startsWith('data:image/')) {
    const m = src.match(/^data:(image\/(?:png|jpe?g));base64,(.+)$/i);
    if (!m) return null;
    return { bytes: Buffer.from(m[2], 'base64'), mime: m[1].toLowerCase(), source: 'data-url' };
  }
  if (/^https?:\/\//i.test(src)) {
    const r = await fetch(src);
    if (!r.ok) throw new Error(`HTTP_${r.status}`);
    return { bytes: Buffer.from(await r.arrayBuffer()), mime: String(r.headers.get('content-type') || '').toLowerCase(), source: src };
  }
  const localPath = _accountingLocalAssetPath(src) || (fs.existsSync(src) ? src : '');
  if (!localPath) return null;
  const lower = localPath.toLowerCase();
  return { bytes: fs.readFileSync(localPath), mime: lower.endsWith('.jpg') || lower.endsWith('.jpeg') ? 'image/jpeg' : 'image/png', source: localPath };
}
async function loadAccountingSignatureImage(pdfDoc, company = {}) {
  const fallbackPath = resolveAccountingSignaturePath(company);
  const configured = String(company.signature_url || '').trim();
  const configuredIsDefaultOwner = !configured || /(^|\/)owner-signature\.png$/i.test(configured);
  const candidates = configuredIsDefaultOwner
    ? [fallbackPath, configured]
    : [configured, fallbackPath];
  const uniqueCandidates = [...new Set(candidates.map(v => String(v || '').trim()).filter(Boolean))];
  for (const src of uniqueCandidates) {
    try {
      const raw = await _accountingLoadImageBytes(src);
      if (!raw) continue;
      if (raw.mime.includes('jpeg') || raw.mime.includes('jpg')) return pdfDoc.embedJpg(raw.bytes);
      return pdfDoc.embedPng(raw.bytes);
    } catch (e) {
      console.warn('ACCOUNTING_SIGNATURE_LOAD_FAILED', src, e?.message || e);
    }
  }
  console.warn('ACCOUNTING_SIGNATURE_MISSING', company.signature_url || '/assets/signatures/owner-signature-transparent.png');
  return null;
}
async function drawAccountingSignature(pdfDoc, page, company = {}, box = {}) {
  try {
    const img = await loadAccountingSignatureImage(pdfDoc, company);
    if (!img) return;
    const x = Number(box.x ?? 384);
    const y = Number(box.y ?? 88);
    const maxW = Number(box.maxW ?? 132);
    const maxH = Number(box.maxH ?? 46);
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = img.width * scale;
    const h = img.height * scale;
    page.drawImage(img, {
      x: x + ((maxW - w) / 2),
      y: y + ((maxH - h) / 2),
      width: w,
      height: h,
      opacity: Number(box.opacity ?? 0.98),
    });
  } catch (e) {
    console.warn('ACCOUNTING_SIGNATURE_DRAW_FAILED', e?.message || e);
  }
}
async function _accountingWithholdingPdfBuffer(doc, company = {}) {
  const { PDFDocument } = require('pdf-lib');
  const fontkit = require('@pdf-lib/fontkit');
  const templatePath = path.join(__dirname, 'assets', 'pdf-templates', 'wht50', '50tawi_template.pdf');
  const regularFontPath = path.join(__dirname, 'assets', 'fonts', 'THSarabun.ttf');
  const boldFontPath = path.join(__dirname, 'assets', 'fonts', 'THSarabun-Bold.ttf');
  if (!fs.existsSync(templatePath)) {
    const e = new Error('WHT50_TEMPLATE_NOT_FOUND'); e.code = 'WHT50_TEMPLATE_NOT_FOUND'; throw e;
  }
  const pdfDoc = await PDFDocument.load(fs.readFileSync(templatePath));
  pdfDoc.registerFontkit(fontkit);
  const regularFont = fs.existsSync(regularFontPath) ? await pdfDoc.embedFont(fs.readFileSync(regularFontPath), { subset: true }) : undefined;
  const boldFont = fs.existsSync(boldFontPath) ? await pdfDoc.embedFont(fs.readFileSync(boldFontPath), { subset: true }) : regularFont;
  const form = pdfDoc.getForm();
  const p = doc.payload_json || {};
  const docNo = _accountingWhtDisplayNo(doc.document_no, doc.issue_date || new Date());
  const paidDate = _accountingWhtDateFields(p.payment_date || doc.issue_date || new Date());
  const issueDate = _accountingWhtDateFields(doc.issue_date || new Date());
  const payerTaxId = _accountingWhtTaxIdDigits(company.tax_id || '');
  const payeeTaxId = _accountingWhtTaxIdDigits(p.payee_tax_id || doc.customer_tax_id || '');
  const incomeAmount = Number(p.income_amount || doc.total_amount || 0);
  const withholdingAmount = Number(p.withholding_amount || doc.withholding_amount || 0);
  const incomeType = String(p.income_type || 'ค่าบริการ/ค่าจ้างทำของ ตามมาตรา 40(8)').trim();
  const pndForm = String(p.form_type || p.pnd_form || 'pnd3').trim().toLowerCase();
  const payerName = `${company.company_name || 'Coldwindflow Air Services'}${company.branch ? ` (${company.branch})` : ''}`;
  const payeeName = String(p.payee_name || doc.customer_name || '').trim();
  const page = pdfDoc.getPages()[0];
  const black = require('pdf-lib').rgb(0, 0, 0);
  const rectByName = {};
  for (const f of form.getFields()) {
    try {
      const widgets = f.acroField.getWidgets();
      const r = widgets[0]?.getRectangle();
      if (r) rectByName[f.getName()] = { x: r.x, y: r.y, width: r.width, height: r.height };
    } catch (_) {}
  }
  const fieldRect = (name) => rectByName[name] || null;
  const fit = (text, maxWidth, font, size, min = 7) => {
    let s = size;
    const t = String(text ?? '');
    while (font && s > min && font.widthOfTextAtSize(t, s) > maxWidth) s -= 0.5;
    return s;
  };
  const drawTextIn = (name, text, opt = {}) => {
    const r = fieldRect(name);
    if (!r) return;
    const font = opt.bold ? (boldFont || regularFont) : (regularFont || boldFont);
    const size = fit(text, r.width - 3, font, opt.size || 11, opt.min || 7);
    const y = r.y + Math.max(1.2, (r.height - size) / 2) + (opt.dy || 0);
    let x = r.x + (opt.dx || 1.5);
    if (opt.align === 'right' && font) x = r.x + r.width - font.widthOfTextAtSize(String(text ?? ''), size) - 4;
    if (opt.align === 'center' && font) x = r.x + (r.width - font.widthOfTextAtSize(String(text ?? ''), size)) / 2;
    page.drawText(String(text ?? ''), { x, y, size, font, color: black, maxWidth: r.width - 2 });
  };
  const drawTaxIdDigits = (name, value) => {
    const r = fieldRect(name);
    const font = boldFont || regularFont;
    if (!r || !font) return;
    const digits = _accountingWhtTaxIdDigits(value).padEnd(13, ' ');
    const offsets = ACCOUNTING_WHT_LAYOUT.taxDigitCenterOffsets || [];
    const size = ACCOUNTING_WHT_LAYOUT.taxDigitSize;
    const y = r.y + Math.max(1.6, (r.height - size) / 2) + 1.2;
    for (let i = 0; i < 13; i += 1) {
      const d = digits[i].trim();
      if (!d) continue;
      const visualCenter = offsets[i] ? r.x + offsets[i] : r.x + ((i + 0.5) * (r.width / 13));
      page.drawText(d, {
        x: visualCenter - (font.widthOfTextAtSize(d, size) / 2),
        y,
        size,
        font,
        color: black,
      });
    }
  };
  const drawCheck = (name) => {
    const r = fieldRect(name);
    const font = boldFont || regularFont;
    if (!r || !font) return;
    page.drawText('X', { x: r.x + 2.5, y: r.y + 2.2, size: ACCOUNTING_WHT_LAYOUT.checkboxSize, font, color: black });
  };
  const moneyText = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ลบปุ่ม Clear Data จาก template เดิม เพื่อไม่ให้ติดไปในเอกสารบริษัท
  _accountingRemovePdfField(form, 'clear data');

  // WHT coordinate map: keep template art untouched, flatten blank fields, then
  // draw values ourselves so Thai text/digits sit inside the government boxes.
  for (const f of form.getFields()) {
    try {
      if (f.constructor?.name === 'PDFTextField') f.setText('');
      if (f.constructor?.name === 'PDFCheckBox') f.uncheck();
    } catch (_) {}
  }
  try { form.updateFieldAppearances(regularFont || boldFont); } catch (_) {}
  try { form.flatten(); } catch (_) {}

  drawTextIn('run_no', docNo, { size: 7.6, align: 'center', min: 5.8 });
  drawTaxIdDigits('id1', payerTaxId);
  drawTextIn('name1', payerName, { size: ACCOUNTING_WHT_LAYOUT.headerTextSize, min: 8 });
  drawTextIn('tin1', '', { size: 10 });
  drawTextIn('add1', company.address || '', { size: 9.7, min: 7 });
  drawTaxIdDigits('id1_2', payeeTaxId);
  drawTextIn('name2', payeeName, { size: ACCOUNTING_WHT_LAYOUT.headerTextSize, min: 8 });
  drawTextIn('tin1_2', '', { size: 10 });
  drawTextIn('add2', p.payee_address || doc.customer_address || '', { size: 9.5, min: 7 });
  drawTextIn('item', p.item_no || '', { size: 10.5, align: 'center' });

  const pndMap = { pnd1k: 'chk1', pnd1k_special: 'chk2', pnd2: 'chk3', pnd3: 'chk4', pnd2k: 'chk5', pnd3k: 'chk6', pnd53: 'chk7' };
  drawCheck(pndMap[pndForm] || 'chk4');

  // Row 5: service income under Section 3 Tredecim / 40(8). The full template has many rows; row 5 fields are date14.0/pay1.13.0/tax1.13.0.
  drawTextIn('date14.0', paidDate.slash, { size: ACCOUNTING_WHT_LAYOUT.tableTextSize, align: 'center', dy: 1.4 });
  drawTextIn('pay1.13.0', moneyText(incomeAmount), { size: ACCOUNTING_WHT_LAYOUT.tableTextSize, align: 'center', min: 7, dy: 1.4 });
  drawTextIn('tax1.13.0', moneyText(withholdingAmount), { size: ACCOUNTING_WHT_LAYOUT.tableTextSize, align: 'center', min: 7, dy: 1.4 });
  drawTextIn('spec3', incomeType, { size: 9.4, min: 7, dy: 1.2 });

  // Totals and payment method
  drawTextIn('pay1.14', moneyText(incomeAmount), { size: ACCOUNTING_WHT_LAYOUT.tableTextSize, align: 'center', min: 7, dy: 1.4 });
  drawTextIn('tax1.14', moneyText(withholdingAmount), { size: ACCOUNTING_WHT_LAYOUT.tableTextSize, align: 'center', min: 7, dy: 1.4 });
  drawTextIn('total', `(${_accountingThaiBahtText(withholdingAmount)})`, { size: 10.2, align: 'center', min: 7, dy: 1 });
  drawCheck('chk8'); // หัก ณ ที่จ่าย
  drawTextIn('date_pay', issueDate.day, { size: 9.8, align: 'center', dy: 1.1 });
  drawTextIn('month_pay', issueDate.month, { size: 9.8, align: 'center', dy: 1.1 });
  drawTextIn('year_pay', issueDate.year, { size: 9.8, align: 'center', dy: 1.1 });

  await drawAccountingSignature(
    pdfDoc,
    page,
    { ...company, signature_url: '/assets/signatures/owner-signature-wht-transparent.png' },
    ACCOUNTING_WHT_LAYOUT.signatureBox
  );
  return Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
}

async function _accountingStoredPayoutTechRows(payout_id) {
  const q = await pool.query(
    `WITH line_sum AS (
       SELECT technician_username, COUNT(DISTINCT job_id)::int AS job_count, COALESCE(SUM(earn_amount),0)::numeric AS gross_amount
         FROM public.technician_payout_lines
        WHERE payout_id=$1
        GROUP BY technician_username
     ), pay AS (
       SELECT technician_username, COALESCE(paid_amount,0)::numeric AS paid_amount, paid_status, paid_at, paid_by, slip_url, note, payment_method, payment_reference
         FROM public.technician_payout_payments
        WHERE payout_id=$1
     ), techs AS (
       SELECT technician_username FROM line_sum UNION SELECT technician_username FROM pay
     ), adj AS (
       SELECT technician_username, COALESCE(SUM(adj_amount),0)::numeric AS adj_total
         FROM public.technician_payout_adjustments
        WHERE payout_id=$1
        GROUP BY technician_username
     ), dep AS (
       SELECT technician_username, COALESCE(SUM(amount),0)::numeric AS deposit_deduction_amount
         FROM public.technician_deposit_ledger
        WHERE payout_id=$1 AND transaction_type='collect'
        GROUP BY technician_username
     )
     SELECT t.technician_username,
            COALESCE(line_sum.job_count,0)::int AS job_count,
            COALESCE(line_sum.gross_amount,0)::numeric AS gross_amount,
            COALESCE(dep.deposit_deduction_amount,0)::numeric AS deposit_deduction_amount,
            COALESCE(adj.adj_total,0)::numeric AS adj_total,
            (COALESCE(line_sum.gross_amount,0) + COALESCE(adj.adj_total,0) - COALESCE(dep.deposit_deduction_amount,0))::numeric AS net_amount,
            COALESCE(pay.paid_amount,0)::numeric AS paid_amount,
            GREATEST(0, COALESCE(line_sum.gross_amount,0) + COALESCE(adj.adj_total,0) - COALESCE(dep.deposit_deduction_amount,0) - COALESCE(pay.paid_amount,0))::numeric AS remaining_amount,
            COALESCE(pay.paid_status, CASE WHEN COALESCE(pay.paid_amount,0) >= GREATEST(0, COALESCE(line_sum.gross_amount,0) + COALESCE(adj.adj_total,0) - COALESCE(dep.deposit_deduction_amount,0)) AND COALESCE(pay.paid_amount,0) > 0 THEN 'paid' WHEN COALESCE(pay.paid_amount,0) > 0 THEN 'partial' ELSE 'unpaid' END) AS paid_status,
            pay.paid_at, pay.paid_by, pay.slip_url, pay.note, pay.payment_method, pay.payment_reference
       FROM techs t
       LEFT JOIN line_sum ON line_sum.technician_username=t.technician_username
       LEFT JOIN pay ON pay.technician_username=t.technician_username
       LEFT JOIN adj ON adj.technician_username=t.technician_username
       LEFT JOIN dep ON dep.technician_username=t.technician_username
      ORDER BY net_amount DESC, t.technician_username ASC`,
    [payout_id]
  );
  return q.rows || [];
}

async function _accountingSafeQuery(soft_errors, label, sql, params = [], fallbackRows = []) {
  try {
    return await pool.query(sql, params);
  } catch (e) {
    soft_errors.push({ scope: label, message: String(e?.message || e) });
    return { rows: fallbackRows };
  }
}

app.get('/admin/accounting/settings', requireAdminSession, async (req, res) => {
  try {
    const settings = await _getAccountingSettings();
    return res.json({ ok: true, settings });
  } catch (e) {
    console.error('GET /admin/accounting/settings', e);
    return res.status(500).json({ ok:false, error:'ACCOUNTING_SETTINGS_GET_FAILED', message:e.message });
  }
});

app.post('/admin/accounting/settings', requireAdminSession, upload.fields([
  { name: 'logo_file', maxCount: 1 }, { name: 'signature_file', maxCount: 1 }, { name: 'stamp_file', maxCount: 1 }
]), async (req, res) => {
  try {
    const actor = _accountingActor(req);
    const before = await _getAccountingSettings();
    const next = _accountingSettingsFromBody(req.body || {}, before);
    const files = req.files || {};
    const logo = files.logo_file?.[0] ? await _accountingSaveUploadedAsset(files.logo_file[0], 'company') : '';
    const sig = files.signature_file?.[0] ? await _accountingSaveUploadedAsset(files.signature_file[0], 'signatures') : '';
    const stamp = files.stamp_file?.[0] ? await _accountingSaveUploadedAsset(files.stamp_file[0], 'stamps') : '';
    if (logo) next.logo_url = logo;
    if (sig) next.signature_url = sig;
    if (stamp) next.stamp_url = stamp;
    const finalSettings = _mergeAccountingCompanySettings(next);
    await _ensureAccountingCompanySettingsSchema();
    const payloadJson = JSON.stringify(finalSettings);
    const upd = await pool.query(
      `UPDATE public.accounting_company_settings
          SET value_json=$1::jsonb, updated_by=$2, updated_at=NOW()
        WHERE id=1`,
      [payloadJson, actor.username || null]
    );
    if (!upd.rowCount) {
      await pool.query(
        `INSERT INTO public.accounting_company_settings(id, value_json, updated_by, updated_at)
         VALUES(1,$1::jsonb,$2,NOW())`,
        [payloadJson, actor.username || null]
      );
    }
    await logAccountingAudit(req, { action:'UPDATE_ACCOUNTING_SETTINGS', entity_type:'accounting_company_settings', entity_id:'1', before_json:before, after_json:finalSettings, note:'แก้ไขตั้งค่าข้อมูลบริษัทสำหรับออกเอกสาร' });
    return res.json({ ok:true, settings: finalSettings });
  } catch (e) {
    console.error('POST /admin/accounting/settings', e);
    return res.status(500).json({ ok:false, error:'ACCOUNTING_SETTINGS_SAVE_FAILED', message:e.message });
  }
});

app.use(createAccountingReadOnlyRoutes({
  pool,
  requireAccountingPermission,
  accountingSafeQuery: _accountingSafeQuery,
  accountingCard: _accountingCard,
  accountingRevenueStatus: _accountingRevenueStatus,
  accountingStoredPayoutTechRows: _accountingStoredPayoutTechRows,
  accountingEnrichPayoutTechRows: _accountingEnrichPayoutTechRows,
  accountingPayoutDueDate: _accountingPayoutDueDate,
  accountingThaiDate: _accountingThaiDate,
  accountingPayoutCutoffLabel: _accountingPayoutCutoffLabel,
  accountingWhtMonthKeyFromPeriod: _accountingWhtMonthKeyFromPeriod,
  accountingWhtMonthLabel: _accountingWhtMonthLabel,
  buildPayoutTechSummaryRows: _buildPayoutTechSummaryRows,
  getPayoutPeriod: _getPayoutPeriod,
  maskPhone: _maskPhone,
  money: _money,
  paidStatus: _paidStatus,
  sqlDonePredicate: _sqlDonePredicate,
  ensureDuePayoutPeriodsBangkok: _ensureDuePayoutPeriodsBangkok,
}));

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

    let tech_cash_offset = null;
    try {
      tech_cash_offset = await technicianCashCollections.ensureOffsetForJob({
        job_id,
        actor_username: actor.username || null,
        source: 'accounting_mark_revenue_paid',
      });
    } catch (cashErr) {
      tech_cash_offset = { ok: false, error: String(cashErr?.code || cashErr?.message || 'TECH_CASH_OFFSET_FAILED') };
    }

    await logAccountingAudit(req, {
      action: 'MARK_REVENUE_PAID',
      entity_type: 'job',
      entity_id: job_id,
      before_json: before,
      after_json: { row: after, tech_cash_offset },
      note: payment_note || payment_reference || payment_method || null,
    });
    return res.json({ ok: true, job_id, payment_status: 'paid', row: after, tech_cash_offset });
  } catch (e) {
    console.error('POST /admin/accounting/revenue/:job_id/mark-paid', e);
    return res.status(500).json({ ok: false, error: 'MARK_REVENUE_PAID_FAILED' });
  }
});

app.post('/admin/accounting/revenue/:job_id/sync-tech-cash', requireAccountingPermission('accounting_manage_revenue'), async (req, res) => {
  try {
    const job_id = String(req.params.job_id || '').trim();
    if (!job_id || !/^\d+$/.test(job_id)) return res.status(400).json({ ok: false, error: 'INVALID_JOB_ID' });
    const beforeQ = await pool.query(
      `SELECT job_id, booking_code, close_payment_method, close_cash_amount, close_cash_confirmed, payment_status
         FROM public.jobs
        WHERE job_id=$1
        LIMIT 1`,
      [job_id]
    );
    const before = beforeQ.rows[0] || null;
    if (!before) return res.status(404).json({ ok: false, error: 'JOB_NOT_FOUND' });

    const result = await technicianCashCollections.ensureOffsetForJob({
      job_id,
      actor_username: _accountingActor(req).username || null,
      source: 'accounting_manual_sync_tech_cash',
    });

    await logAccountingAudit(req, {
      action: 'SYNC_TECH_CASH_COLLECTION',
      entity_type: 'job',
      entity_id: job_id,
      before_json: before,
      after_json: result,
      note: result.skipped ? `skip: ${result.reason || ''}` : `offset ${result.amount || 0} to ${result.payout_id || ''}`,
    });
    return res.json({ ok: true, job_id, result });
  } catch (e) {
    console.error('POST /admin/accounting/revenue/:job_id/sync-tech-cash', e);
    return res.status(500).json({ ok: false, error: e.code || 'SYNC_TECH_CASH_FAILED', message: e.message });
  }
});


app.post('/admin/accounting/expenses', requireAccountingPermission('accounting_manage_expense'), upload.single('proof'), async (req, res) => {
  try {
    const body = req.body || {};
    const amount = _money(body.amount);
    if (!body.expense_date) return res.status(400).json({ ok: false, error: 'EXPENSE_DATE_REQUIRED' });
    if (!String(body.category || '').trim()) return res.status(400).json({ ok: false, error: 'EXPENSE_CATEGORY_REQUIRED' });
    if (Number(amount || 0) <= 0) return res.status(400).json({ ok: false, error: 'INVALID_EXPENSE_AMOUNT' });
    const actor = _accountingActor(req);
    let proofUrl = String(body.proof_url || '').trim() || null;
    let originalName = null;
    let mimeType = null;
    let fileSize = null;
    if (req.file) {
      originalName = req.file.originalname || null;
      mimeType = req.file.mimetype || null;
      fileSize = req.file.size || null;
      if (CLOUDINARY_ENABLED) {
        const publicId = `expense_${Date.now()}_${crypto.randomUUID().slice(0,8)}`;
        const up = await cloudinaryUploadBuffer({ buffer: req.file.buffer, mimetype: req.file.mimetype || 'image/jpeg', folder: 'cwf/accounting/expenses', publicId, transformation: 'c_limit,w_1600/q_auto/f_auto' });
        proofUrl = up.secure_url;
      } else {
        proofUrl = saveUploadedFile(req.file, UPLOAD_DIR, 'accounting_expense');
      }
    }
    const ins = await pool.query(
      `INSERT INTO public.accounting_expenses(
         expense_date, category, vendor_name, description, amount, vat_amount, withholding_amount,
         payment_method, payment_reference, proof_url, job_id, status, created_by, updated_by
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'submitted',$12,$12)
       RETURNING *`,
      [
        body.expense_date,
        String(body.category || '').trim(),
        String(body.vendor_name || '').trim() || null,
        String(body.description || '').trim() || null,
        amount,
        _money(body.vat_amount || 0),
        _money(body.withholding_amount || 0),
        String(body.payment_method || '').trim() || null,
        String(body.payment_reference || '').trim() || null,
        proofUrl,
        body.job_id ? Number(body.job_id) : null,
        actor.username || null,
      ]
    );
    const row = ins.rows[0];
    if (proofUrl) {
      await pool.query(
        `INSERT INTO public.accounting_expense_attachments(expense_id, public_url, original_name, mime_type, file_size, uploaded_by)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [row.expense_id, proofUrl, originalName, mimeType, fileSize, actor.username || null]
      );
    }
    await logAccountingAudit(req, {
      action: 'CREATE_EXPENSE',
      entity_type: 'accounting_expense',
      entity_id: String(row.expense_id),
      after_json: row,
      note: row.description || row.category || null,
    });
    return res.json({ ok: true, row });
  } catch (e) {
    console.error('POST /admin/accounting/expenses', e);
    return res.status(500).json({ ok: false, error: 'CREATE_EXPENSE_FAILED', message: e.message });
  }
});


app.post('/admin/accounting/documents', requireAccountingPermission('accounting_manage_documents'), async (req, res) => {
  try {
    const body = req.body || {};
    const document_type = String(body.document_type || '').trim();
    if (!['quotation','invoice','receipt','tax_invoice'].includes(document_type)) return res.status(400).json({ ok: false, error: 'INVALID_DOCUMENT_TYPE' });
    const actor = _accountingActor(req);
    const issueDate = body.issue_date || new Date().toISOString().slice(0,10);
    const dueDate = body.due_date || body.expire_date || null;
    const issueNow = body.issue_now === true || String(body.issue_now || '').toLowerCase() === 'true' || document_type === 'tax_invoice';
    const status = issueNow ? 'issued' : 'draft';
    const job_id = Number(body.job_id || 0) || null;
    let customer_name = String(body.customer_name || '').trim() || null;
    let customer_phone = String(body.customer_phone || '').trim() || null;
    let customer_tax_id = String(body.customer_tax_id || '').trim() || null;
    let customer_address = String(body.customer_address || body.address_text || '').trim() || null;
    let sourcePayload = { source: job_id ? 'job' : 'manual_accounting', note: body.note || null };
    let subtotal = 0, vat_amount = 0, withholding_amount = 0, total_amount = 0;
    let lineItems = Array.isArray(body.line_items) ? body.line_items : [];

    if (job_id) {
      const job = await pool.query(
        `SELECT j.job_id, j.booking_code, j.customer_name, j.customer_phone, j.job_price, j.payment_status, j.paid_at,
                COALESCE(NULLIF(SUM(COALESCE(ji.line_total,0)),0), COALESCE(j.job_price,0), 0)::numeric AS subtotal
           FROM public.jobs j
           LEFT JOIN public.job_items ji ON CAST(ji.job_id AS TEXT)=CAST(j.job_id AS TEXT)
          WHERE j.job_id=$1
          GROUP BY j.job_id, j.booking_code, j.customer_name, j.customer_phone, j.job_price, j.payment_status, j.paid_at
          LIMIT 1`,
        [job_id]
      );
      if (!job.rows[0]) return res.status(404).json({ ok: false, error: 'JOB_NOT_FOUND' });
      const j = job.rows[0];
      customer_name = customer_name || j.customer_name || null;
      customer_phone = customer_phone || j.customer_phone || null;
      subtotal = _money(j.subtotal || 0);
      lineItems = lineItems.length ? lineItems : [{ description: `ค่าบริการงาน ${j.booking_code || j.job_id}`, quantity: 1, unit_price: subtotal, line_total: subtotal }];
      sourcePayload = { ...sourcePayload, booking_code: j.booking_code || null, raw_payment_status: j.payment_status || null, paid_at: j.paid_at || null };
    } else {
      if (!customer_name) return res.status(400).json({ ok: false, error: 'CUSTOMER_NAME_REQUIRED' });
      if (!lineItems.length) return res.status(400).json({ ok: false, error: 'LINE_ITEMS_REQUIRED' });
      lineItems = lineItems.map((it, i) => {
        const acType = String(it.ac_type || it.air_type || 'wall').trim();
        const washVariant = acType === 'wall' ? String(it.wash_variant || '').trim() : '';
        const qty = Math.max(1, Number(it.quantity || it.qty || 1));
        const unit = _money(it.unit_price || it.price || 0);
        const lineTotal = _money(qty * unit);
        return {
          no: i + 1,
          job_type: String(it.job_type || 'ล้างแอร์').trim(),
          ac_type: acType,
          wash_variant: washVariant,
          btu: String(it.btu || '').trim(),
          description: String(it.description || `${it.job_type || 'บริการ'} ${acType === 'wall' && washVariant ? washVariant : ''} ${it.btu || ''}`).trim(),
          quantity: qty,
          unit_price: unit,
          line_total: lineTotal,
        };
      });
      subtotal = _money(lineItems.reduce((sum, it) => sum + Number(it.line_total || 0), 0));
    }
    const discount_amount = _money(body.discount_amount || 0);
    const vatRate = _money(body.vat_rate == null ? (document_type === 'tax_invoice' ? 7 : 0) : body.vat_rate);
    vat_amount = _money(Math.max(0, subtotal - discount_amount) * vatRate / 100);
    withholding_amount = _money(body.withholding_amount || 0);
    total_amount = _money(Math.max(0, subtotal - discount_amount) + vat_amount - withholding_amount);

    const docNo = await _accountingNextDocumentNo(document_type);
    const payload = { ...sourcePayload, line_items: lineItems, vat_rate: vatRate, discount_amount, expire_date: dueDate, confirmed_quote_prefill: document_type === 'quotation' ? { customer_name, customer_phone, address_text: customer_address, line_items: lineItems } : null };
    const ins = await pool.query(
      `INSERT INTO public.accounting_documents(
         document_no, document_type, status, job_id, customer_name, customer_phone, customer_tax_id, customer_address,
         issue_date, due_date, subtotal, discount_amount, vat_amount, withholding_amount, total_amount, payload_json,
         created_by, updated_by, issued_by, issued_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$17,$18,$19)
       RETURNING *`,
      [docNo, document_type, status, job_id, customer_name, customer_phone, customer_tax_id, customer_address, issueDate, dueDate,
       subtotal, discount_amount, vat_amount, withholding_amount, total_amount, JSON.stringify(payload), actor.username || null,
       status === 'issued' ? (actor.username || null) : null, status === 'issued' ? new Date() : null]
    );
    await logAccountingAudit(req, { action: status === 'issued' ? 'ISSUE_DOCUMENT' : 'CREATE_DOCUMENT', entity_type: 'accounting_document', entity_id: String(ins.rows[0].document_id), after_json: ins.rows[0], note: `${docNo} ${document_type}` });
    return res.json({ ok: true, row: ins.rows[0], print_url: `/admin/accounting/documents/${ins.rows[0].document_id}/print` });
  } catch (e) {
    console.error('POST /admin/accounting/documents', e);
    return res.status(500).json({ ok: false, error: e.code || 'CREATE_DOCUMENT_FAILED', message: e.message });
  }
});


app.post('/admin/accounting/documents/:document_id/confirm', requireAccountingPermission('accounting_manage_documents'), async (req, res) => {
  try {
    const id = Number(req.params.document_id || 0);
    if (!id) return res.status(400).json({ ok:false, error:'INVALID_DOCUMENT_ID' });
    const q = await pool.query(`SELECT * FROM public.accounting_documents WHERE document_id=$1 LIMIT 1`, [id]);
    const doc = q.rows[0];
    if (!doc) return res.status(404).json({ ok:false, error:'DOCUMENT_NOT_FOUND' });
    if (String(doc.document_type) !== 'quotation') return res.status(400).json({ ok:false, error:'ONLY_QUOTATION_CAN_CONFIRM' });
    const actor = _accountingActor(req);
    const upd = await pool.query(`UPDATE public.accounting_documents SET status='issued', confirmed_by=$2, confirmed_at=NOW(), updated_by=$2, updated_at=NOW() WHERE document_id=$1 RETURNING *`, [id, actor.username || null]);
    await logAccountingAudit(req, { action:'CONFIRM_QUOTATION', entity_type:'accounting_document', entity_id:String(id), before_json:doc, after_json:upd.rows[0], note:'ลูกค้ายืนยันใบเสนอราคา เตรียมเพิ่มงาน' });
    return res.json({ ok:true, row:upd.rows[0], prefill: { document_id:id, document_no:doc.document_no, customer_name:doc.customer_name, customer_phone:doc.customer_phone, address_text:doc.customer_address, line_items:(doc.payload_json||{}).line_items || [] } });
  } catch(e) {
    console.error('POST /admin/accounting/documents/:document_id/confirm', e);
    return res.status(500).json({ ok:false, error:'CONFIRM_QUOTATION_FAILED', message:e.message });
  }
});

app.get('/admin/accounting/payouts', requireAccountingPermission('accounting.read.payouts'), async (req, res) => {
  const soft_errors = [];
  try {
    let auto_ensure = { created: [], checked_types: [] };
    try { auto_ensure = await _ensureDuePayoutPeriodsBangkok(_accountingActor(req).username || null); }
    catch (e) { soft_errors.push({ scope: 'auto_ensure_payouts', message: e.message }); }
    const q = await _accountingSafeQuery(soft_errors, 'payouts',
      `WITH line_sum AS (
         SELECT payout_id, COUNT(DISTINCT technician_username)::int AS technician_count, COUNT(*)::int AS line_count, COALESCE(SUM(earn_amount),0)::numeric AS gross_amount
           FROM public.technician_payout_lines GROUP BY payout_id
       ),
       adj AS (SELECT payout_id, COALESCE(SUM(adj_amount),0)::numeric AS adj_total FROM public.technician_payout_adjustments GROUP BY payout_id),
       dep AS (SELECT payout_id, COALESCE(SUM(amount),0)::numeric AS deposit_deduction_amount FROM public.technician_deposit_ledger WHERE transaction_type='collect' GROUP BY payout_id),
       pay AS (SELECT payout_id, COALESCE(SUM(paid_amount),0)::numeric AS paid_amount FROM public.technician_payout_payments GROUP BY payout_id)
       SELECT p.payout_id, p.period_type, p.period_start, p.period_end, p.status,
              COALESCE(line_sum.technician_count,0)::int AS technician_count,
              COALESCE(line_sum.line_count,0)::int AS line_count,
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
        ORDER BY CASE WHEN COALESCE(p.status,'draft') <> 'paid' THEN 0 ELSE 1 END, p.period_start DESC, p.payout_id DESC
        LIMIT 80`);
    const now = Date.now();
    const rows = (q.rows || []).map((r) => {
      const due = _accountingPayoutDueDate(r);
      const dueIso = due ? due.toISOString() : null;
      return {
        ...r,
        due_date: dueIso,
        due_label: _accountingThaiDate(dueIso),
        cutoff_label: _accountingPayoutCutoffLabel(r),
        is_due: due ? due.getTime() <= now : false,
        payment_rule_note: String(r.period_type) === '10'
          ? 'งวดวันที่ 10: รวมงานที่เสร็จตั้งแต่วันที่ 26 เดือนก่อน ถึงวันที่ 1 เดือนนี้'
          : 'งวดวันที่ 25: รวมงานที่เสร็จตั้งแต่วันที่ 11 ถึงวันที่ 16 เดือนนี้',
      };
    });
    return res.json({ ok: true, rows, auto_ensure, note: 'งวดจ่ายวันที่ 10 และ 25 จะขึ้นอัตโนมัติเมื่อถึงกำหนด ระบบไม่โอนเงินอัตโนมัติ กรุณาโอนเงินจริงก่อน แล้วจึงบันทึกจ่ายแล้ว', soft_errors });
  } catch (e) {
    console.error('GET /admin/accounting/payouts', e);
    return res.status(500).json({ ok: false, rows: [], note: '', soft_errors: [{ scope: 'payouts', message: e.message }] });
  }
});

app.get('/technicians/:username/tax-profile', async (req, res) => {
  try {
    await _ensureTechnicianTaxProfileSchema();
    const username = String(req.params.username || '').trim();
    const profile = await _accountingGetTechTaxProfile(username);
    if (!profile) return res.status(404).json({ ok:false, error:'TECHNICIAN_NOT_FOUND' });
    const pending = await pool.query(`SELECT id, status, requested_at, admin_note FROM public.technician_tax_profile_requests WHERE username=$1 ORDER BY requested_at DESC LIMIT 1`, [username]);
    return res.json({ ok:true, profile, latest_request: pending.rows[0] || null });
  } catch(e) { console.error('GET /technicians/:username/tax-profile', e); return res.status(500).json({ ok:false, error:'TECH_TAX_PROFILE_FAILED', message:e.message }); }
});

app.post('/technicians/:username/tax-profile/request', async (req, res) => {
  try {
    await _ensureTechnicianTaxProfileSchema();
    const username = String(req.params.username || req.body?.username || '').trim();
    if (!username) return res.status(400).json({ ok:false, error:'MISSING_USERNAME' });
    const body = req.body || {};
    const full_name = String(body.full_name || '').trim();
    const tax_id = String(body.tax_id || '').replace(/\s+/g,'').trim();
    const tax_address = String(body.tax_address || '').trim();
    const tax_branch = String(body.tax_branch || '').trim();
    const wht_income_type = String(body.wht_income_type || 'ค่าบริการ/ค่าจ้างทำของ ตามมาตรา 40(8)').trim();
    const wht_default_rate = _money(body.wht_default_rate == null ? 3 : body.wht_default_rate);
    if (!full_name) return res.status(400).json({ ok:false, error:'TECH_FULL_NAME_REQUIRED' });
    if (!tax_id) return res.status(400).json({ ok:false, error:'TECH_TAX_ID_REQUIRED' });
    if (!tax_address) return res.status(400).json({ ok:false, error:'TECH_TAX_ADDRESS_REQUIRED' });
    const ins = await pool.query(
      `INSERT INTO public.technician_tax_profile_requests(username, full_name, tax_id, tax_address, tax_branch, wht_income_type, wht_default_rate, status)
       VALUES($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING *`,
      [username, full_name, tax_id, tax_address, tax_branch || null, wht_income_type, wht_default_rate]
    );
    const upd = await pool.query(
      `UPDATE public.technician_profiles
          SET full_name=COALESCE(NULLIF($2,''), full_name),
              tax_id=COALESCE(NULLIF($3,''), tax_id),
              tax_address=COALESCE(NULLIF($4,''), tax_address),
              tax_branch=COALESCE(NULLIF($5,''), tax_branch),
              wht_income_type=COALESCE(NULLIF($6,''), wht_income_type),
              wht_default_rate=$7,
              tax_profile_status='pending_review',
              updated_at=NOW()
        WHERE LOWER(username)=LOWER($1)
        RETURNING username`,
      [username, full_name, tax_id, tax_address, tax_branch || null, wht_income_type, wht_default_rate]
    );
    if (!upd.rows.length) {
      await pool.query(
        `INSERT INTO public.technician_profiles(username, full_name, tax_id, tax_address, tax_branch, wht_income_type, wht_default_rate, tax_profile_status, updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,'pending_review',NOW())`,
        [username, full_name, tax_id, tax_address, tax_branch || null, wht_income_type, wht_default_rate]
      );
    }
    return res.json({ ok:true, request:ins.rows[0] });
  } catch(e) { console.error('POST /technicians/:username/tax-profile/request', e); return res.status(500).json({ ok:false, error:'TECH_TAX_PROFILE_REQUEST_FAILED', message:e.message }); }
});

app.get('/technicians/:username/withholding-certs', async (req, res) => {
  try {
    const username = String(req.params.username || '').trim();
    const year = Number(req.query.year || new Date().getFullYear());
    const start = `${year}-01-01`, end = `${year + 1}-01-01`;
    const q = await pool.query(
      `SELECT document_id, document_no, issue_date, total_amount, withholding_amount, payload_json, created_at
         FROM public.accounting_documents
        WHERE document_type='withholding_cert' AND COALESCE(status,'') <> 'voided'
          AND payload_json->>'technician_username'=$1
          AND COALESCE(issue_date, created_at::date) >= $2::date AND COALESCE(issue_date, created_at::date) < $3::date
        ORDER BY COALESCE(issue_date, created_at::date) DESC, document_id DESC`,
      [username, start, end]
    );
    return res.json({ ok:true, year, rows:q.rows.map(r => ({ ...r, print_url:`/technicians/${encodeURIComponent(username)}/withholding-certs/${r.document_id}/print` })) });
  } catch(e) { console.error('GET /technicians/:username/withholding-certs', e); return res.status(500).json({ ok:false, error:'TECH_WHT_LIST_FAILED', message:e.message }); }
});


app.get('/technicians/:username/withholding-certs/yearly.csv', async (req, res) => {
  try {
    const username = String(req.params.username || '').trim();
    const year = Number(req.query.year || new Date().getFullYear());
    const start = `${year}-01-01`, end = `${year + 1}-01-01`;
    const q = await pool.query(
      `SELECT document_no, issue_date, customer_name, total_amount, withholding_amount, payload_json, created_at
         FROM public.accounting_documents
        WHERE document_type='withholding_cert' AND COALESCE(status,'') <> 'voided'
          AND payload_json->>'technician_username'=$1
          AND COALESCE(issue_date, created_at::date) >= $2::date AND COALESCE(issue_date, created_at::date) < $3::date
        ORDER BY COALESCE(issue_date, created_at::date) ASC, document_id ASC`,
      [username, start, end]
    );
    const headers = ['เดือน','เลขเอกสาร','วันที่ออก','ผู้รับเงิน','เงินได้','ภาษีหัก ณ ที่จ่าย'];
    const rows = q.rows.map(r => {
      const p = r.payload_json || {};
      return [p.wht_month_label || '', r.document_no || '', r.issue_date || '', r.customer_name || username, r.total_amount || 0, r.withholding_amount || 0];
    });
    const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = '\ufeff' + [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="wht-${username}-${year}.csv"`);
    return res.send(csv);
  } catch(e) { console.error('GET technician withholding yearly csv', e); return res.status(500).send('Export failed'); }
});

app.get('/technicians/:username/withholding-certs/yearly/print', async (req, res) => {
  try {
    const username = String(req.params.username || '').trim();
    const year = Number(req.query.year || new Date().getFullYear());
    const start = `${year}-01-01`, end = `${year + 1}-01-01`;
    const q = await pool.query(
      `SELECT document_no, issue_date, customer_name, total_amount, withholding_amount, payload_json, created_at
         FROM public.accounting_documents
        WHERE document_type='withholding_cert' AND COALESCE(status,'') <> 'voided'
          AND payload_json->>'technician_username'=$1
          AND COALESCE(issue_date, created_at::date) >= $2::date AND COALESCE(issue_date, created_at::date) < $3::date
        ORDER BY COALESCE(issue_date, created_at::date) ASC, document_id ASC`,
      [username, start, end]
    );
    const totalIncome = q.rows.reduce((a,r)=>a+Number(r.total_amount||0),0);
    const totalWht = q.rows.reduce((a,r)=>a+Number(r.withholding_amount||0),0);
    const rowsHtml = q.rows.map(r => {
      const p = r.payload_json || {};
      return `<tr><td>${p.wht_month_label || ''}</td><td>${r.document_no || ''}</td><td>${r.issue_date || ''}</td><td class="num">${Number(r.total_amount||0).toLocaleString('th-TH')}</td><td class="num">${Number(r.withholding_amount||0).toLocaleString('th-TH')}</td></tr>`;
    }).join('') || '<tr><td colspan="5">ยังไม่มีเอกสารในปีนี้</td></tr>';
    return res.type('html').send(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>สรุปทวิ50 ${year}</title><style>body{font-family:Arial,'Noto Sans Thai',sans-serif;color:#0b2a5b;padding:28px}h1{margin:0 0 6px}.muted{color:#64748b}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left}th{background:#eff6ff}.num{text-align:right}.sum{margin-top:16px;font-size:18px;font-weight:800}@media print{button{display:none}}</style></head><body><button onclick="print()">พิมพ์ / Save PDF</button><h1>สรุปเอกสารทวิ50 ประจำปี ${year}</h1><div class="muted">ช่าง: ${username}</div><table><thead><tr><th>เดือน</th><th>เลขเอกสาร</th><th>วันที่ออก</th><th>เงินได้</th><th>ภาษีหัก ณ ที่จ่าย</th></tr></thead><tbody>${rowsHtml}</tbody></table><div class="sum">รวมเงินได้ ${totalIncome.toLocaleString('th-TH')} บาท • รวมภาษีหักไว้ ${totalWht.toLocaleString('th-TH')} บาท</div></body></html>`);
  } catch(e) { console.error('GET technician withholding yearly print', e); return res.status(500).send('Print failed'); }
});

app.get('/technicians/:username/withholding-certs/:document_id/print', async (req, res) => {
  try {
    const username = String(req.params.username || '').trim();
    const id = Number(req.params.document_id || 0);
    const q = await pool.query(`SELECT * FROM public.accounting_documents WHERE document_id=$1 AND document_type='withholding_cert' AND payload_json->>'technician_username'=$2 LIMIT 1`, [id, username]);
    const doc = q.rows[0];
    if (!doc) return res.status(404).send('Document not found');
    const company = await _getAccountingSettings();
    return res.type('application/pdf').set('Content-Disposition', `inline; filename="${doc.document_no || 'wht50'}.pdf"`).send(await _accountingWithholdingPdfBuffer(doc, company));
  } catch(e) { console.error('GET technician withholding print', e); return res.status(500).send('Print failed'); }
});

app.get('/admin/accounting/technician-tax-requests', requireAdminSession, async (req, res) => {
  try {
    await _ensureTechnicianTaxProfileSchema();
    const q = await pool.query(`SELECT * FROM public.technician_tax_profile_requests WHERE status='pending' ORDER BY requested_at ASC LIMIT 80`);
    return res.json({ ok:true, rows:q.rows });
  } catch(e) { return res.status(500).json({ ok:false, error:'TAX_REQUESTS_FAILED', message:e.message }); }
});

app.post('/admin/accounting/technician-tax-requests/:id/approve', requireAdminSession, async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id || 0); const actor = _accountingActor(req).username || null;
    await client.query('BEGIN');
    await _ensureTechnicianTaxProfileSchema(client);
    const rq = await client.query(`SELECT * FROM public.technician_tax_profile_requests WHERE id=$1 FOR UPDATE`, [id]);
    const row = rq.rows[0]; if (!row) { await client.query('ROLLBACK'); return res.status(404).json({ ok:false, error:'REQUEST_NOT_FOUND' }); }
    // Update first, then insert if missing. This avoids relying on an existing UNIQUE
    // constraint in older production schemas while still keeping the operation safe.
    const updProfile = await client.query(
      `UPDATE public.technician_profiles
          SET full_name=$2,
              tax_id=$3,
              tax_address=$4,
              tax_branch=$5,
              wht_income_type=$6,
              wht_default_rate=$7,
              tax_profile_status='approved',
              tax_profile_reviewed_by=$8,
              tax_profile_reviewed_at=NOW(),
              updated_at=NOW()
        WHERE LOWER(username)=LOWER($1)
        RETURNING username`,
      [row.username, row.full_name, row.tax_id, row.tax_address, row.tax_branch, row.wht_income_type, row.wht_default_rate, actor]
    );
    if (!updProfile.rows.length) {
      await client.query(
        `INSERT INTO public.technician_profiles
           (username, full_name, tax_id, tax_address, tax_branch, wht_income_type, wht_default_rate, tax_profile_status, tax_profile_reviewed_by, tax_profile_reviewed_at, updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,'approved',$8,NOW(),NOW())`,
        [row.username, row.full_name, row.tax_id, row.tax_address, row.tax_branch, row.wht_income_type, row.wht_default_rate, actor]
      );
    }
    const up = await client.query(`UPDATE public.technician_tax_profile_requests SET status='approved', reviewed_by=$2, reviewed_at=NOW(), admin_note=$3 WHERE id=$1 RETURNING *`, [id, actor, req.body?.admin_note || null]);
    await client.query('COMMIT');
    await logAccountingAudit(req, { action:'APPROVE_TECH_TAX_PROFILE', entity_type:'technician_tax_profile_request', entity_id:String(id), after_json:up.rows[0], note:'อนุมัติข้อมูลทวิ50ช่าง' });
    return res.json({ ok:true, row:up.rows[0] });
  } catch(e) { try{await client.query('ROLLBACK')}catch(_){}; console.error('APPROVE_TAX_REQUEST_FAILED', e); return res.status(500).json({ ok:false, error:'APPROVE_TAX_REQUEST_FAILED', message:e.message }); } finally { client.release(); }
});

app.post('/admin/accounting/technician-tax-requests/:id/reject', requireAdminSession, async (req, res) => {
  try {
    await _ensureTechnicianTaxProfileSchema();
    const id = Number(req.params.id || 0); const actor = _accountingActor(req).username || null;
    const q = await pool.query(`UPDATE public.technician_tax_profile_requests SET status='rejected', reviewed_by=$2, reviewed_at=NOW(), admin_note=$3 WHERE id=$1 RETURNING *`, [id, actor, req.body?.admin_note || null]);
    if (!q.rows[0]) return res.status(404).json({ ok:false, error:'REQUEST_NOT_FOUND' });
    await pool.query(`UPDATE public.technician_profiles SET tax_profile_status='rejected', tax_profile_note=$2 WHERE LOWER(username)=LOWER($1)`, [q.rows[0].username, req.body?.admin_note || null]);
    await logAccountingAudit(req, { action:'REJECT_TECH_TAX_PROFILE', entity_type:'technician_tax_profile_request', entity_id:String(id), after_json:q.rows[0], note:req.body?.admin_note || 'ปฏิเสธข้อมูลทวิ50ช่าง' });
    return res.json({ ok:true, row:q.rows[0] });
  } catch(e) { return res.status(500).json({ ok:false, error:'REJECT_TAX_REQUEST_FAILED', message:e.message }); }
});

app.get('/admin/accounting/technicians/:username/tax-profile', requireAccountingPermission('accounting.read.payouts'), async (req, res) => {
  try {
    const profile = await _accountingGetTechTaxProfile(req.params.username);
    if (!profile) return res.status(404).json({ ok: false, error: 'TECHNICIAN_NOT_FOUND' });
    return res.json({ ok: true, profile });
  } catch (e) {
    console.error('GET /admin/accounting/technicians/:username/tax-profile', e);
    return res.status(500).json({ ok: false, error: 'TECH_TAX_PROFILE_FAILED', message: e.message });
  }
});

app.post('/admin/accounting/technicians/:username/tax-profile', requireAccountingPermission('accounting_mark_payout_paid'), async (req, res) => {
  try {
    const username = String(req.params.username || '').trim();
    if (!username) return res.status(400).json({ ok: false, error: 'MISSING_TECHNICIAN_USERNAME' });
    const body = req.body || {};
    const before = await _accountingGetTechTaxProfile(username);
    const full_name = String(body.full_name || '').trim();
    const tax_id = String(body.tax_id || '').replace(/\s+/g, '').trim();
    const tax_address = String(body.tax_address || '').trim();
    const tax_branch = String(body.tax_branch || '').trim();
    const wht_income_type = String(body.wht_income_type || 'ค่าบริการ/ค่าจ้างทำของ ตามมาตรา 40(8)').trim();
    const wht_default_rate = _money(body.wht_default_rate == null ? 3 : body.wht_default_rate);
    if (!full_name) return res.status(400).json({ ok: false, error: 'TECH_FULL_NAME_REQUIRED' });
    if (!tax_id) return res.status(400).json({ ok: false, error: 'TECH_TAX_ID_REQUIRED' });
    if (!tax_address) return res.status(400).json({ ok: false, error: 'TECH_TAX_ADDRESS_REQUIRED' });
    await pool.query(
      `INSERT INTO public.technician_profiles(username, full_name, tax_id, tax_address, tax_branch, wht_income_type, wht_default_rate)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(username) DO UPDATE SET
         full_name=EXCLUDED.full_name,
         tax_id=EXCLUDED.tax_id,
         tax_address=EXCLUDED.tax_address,
         tax_branch=EXCLUDED.tax_branch,
         wht_income_type=EXCLUDED.wht_income_type,
         wht_default_rate=EXCLUDED.wht_default_rate,
         updated_at=CURRENT_TIMESTAMP`,
      [username, full_name, tax_id, tax_address, tax_branch || null, wht_income_type, wht_default_rate]
    );
    const after = await _accountingGetTechTaxProfile(username);
    await logAccountingAudit(req, { action: 'UPDATE_TECH_TAX_PROFILE', entity_type: 'technician_profile', entity_id: username, before_json: before, after_json: after, note: 'อัปเดตข้อมูลออกทวิ50ของช่าง' });
    return res.json({ ok: true, profile: after });
  } catch (e) {
    console.error('POST /admin/accounting/technicians/:username/tax-profile', e);
    return res.status(500).json({ ok: false, error: 'UPDATE_TECH_TAX_PROFILE_FAILED', message: e.message });
  }
});

app.post('/admin/accounting/payouts/:payout_id/tech/:username/withholding-cert', requireAccountingPermission('accounting_mark_payout_paid'), async (req, res) => {
  try {
    const payout_id = String(req.params.payout_id || '').trim();
    const technician_username = String(req.params.username || '').trim();
    if (!payout_id || !technician_username) return res.status(400).json({ ok: false, error: 'MISSING_PAYOUT_OR_TECH' });
    const profile = await _accountingGetTechTaxProfile(technician_username);
    if (!profile?.is_complete) return res.status(400).json({ ok: false, error: 'TECH_TAX_PROFILE_INCOMPLETE', missing_fields: profile?.missing_fields || [] });
    const base = await _accountingMonthlyWhtBase({ payout_id, technician_username });
    if (Number(base.income_paid || 0) <= 0) return res.status(400).json({ ok: false, error: 'PAYOUT_NOT_PAID_FOR_WHT' });
    const rate = _money(req.body?.withholding_rate == null ? profile.wht_default_rate || 3 : req.body.withholding_rate);
    const incomeAmount = _money(base.income_paid);
    const withholdingAmount = _money(incomeAmount * rate / 100);
    const exists = await pool.query(
      `SELECT document_id, document_no, status FROM public.accounting_documents
        WHERE document_type='withholding_cert' AND COALESCE(status,'') <> 'voided'
          AND payload_json->>'technician_username'=$1 AND payload_json->>'wht_month'=$2
        ORDER BY created_at DESC, document_id DESC LIMIT 1`,
      [technician_username, base.month_key]
    );
    if (exists.rows[0] && req.body?.force_new !== true) return res.status(409).json({ ok: false, error: 'WITHHOLDING_CERT_ALREADY_EXISTS', row: exists.rows[0] });
    const actor = _accountingActor(req);
    const docNo = await _accountingNextDocumentNo('withholding_cert');
    const company = await _getAccountingSettings();
    const payload = {
      source: 'payout_monthly_wht',
      technician_username,
      source_payout_id: payout_id,
      source_payout_ids: base.payout_ids,
      source_rows: base.source_rows,
      wht_month: base.month_key,
      wht_month_label: base.month_label,
      job_count: base.job_count,
      payee_name: profile.full_name,
      payee_tax_id: profile.tax_id,
      payee_address: profile.tax_address,
      payee_branch: profile.tax_branch || '',
      income_type: profile.wht_income_type || 'ค่าบริการ/ค่าจ้างทำของ ตามมาตรา 40(8)',
      income_amount: incomeAmount,
      withholding_rate: rate,
      withholding_amount: withholdingAmount,
      payer: company,
      note: 'ออกจากหน้างานบัญชี > จ่ายเงินช่าง ระบบคำนวณจากยอดที่บันทึกจ่ายจริงในเดือนนั้น',
    };
    const ins = await pool.query(
      `INSERT INTO public.accounting_documents(
         document_no, document_type, status, customer_name, customer_tax_id, customer_address,
         issue_date, subtotal, discount_amount, vat_amount, withholding_amount, total_amount, payload_json,
         created_by, updated_by, issued_by, issued_at
       ) VALUES($1,'withholding_cert','issued',$2,$3,$4,CURRENT_DATE,$5,0,0,$6,$5,$7::jsonb,$8,$8,$8,NOW()) RETURNING *`,
      [docNo, profile.full_name, profile.tax_id, profile.tax_address, incomeAmount, withholdingAmount, JSON.stringify(payload), actor.username || null]
    );
    await logAccountingAudit(req, { action: 'ISSUE_WITHHOLDING_CERT', entity_type: 'accounting_document', entity_id: String(ins.rows[0].document_id), after_json: ins.rows[0], note: `${docNo} ${technician_username} ${base.month_label}` });
    return res.json({ ok: true, row: ins.rows[0], print_url: `/admin/accounting/documents/${ins.rows[0].document_id}/print` });
  } catch (e) {
    console.error('POST /admin/accounting/payouts/:payout_id/tech/:username/withholding-cert', e);
    return res.status(500).json({ ok: false, error: e.code || 'ISSUE_WITHHOLDING_CERT_FAILED', message: e.message });
  }
});


function _accountingGenericDocumentPrintHtml(doc, company) {
  const escH = _accountingDocumentHtmlEscape;
  const fmt = (v) => Number(v || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const typeLabel = ({ quotation:'ใบเสนอราคา', invoice:'ใบแจ้งหนี้', receipt:'ใบเสร็จรับเงิน', tax_invoice:'ใบกำกับภาษี' })[doc.document_type] || doc.document_type;
  const p = doc.payload_json || {};
  const signatureUrl = _accountingOwnerSignaturePublicUrl() || _accountingSignaturePublicUrl(company);
  const signerName = _accountingOwnerSignerName();
  const signerPosition = _accountingOwnerSignerPosition();
  const rows = Array.isArray(p.line_items) ? p.line_items : [];
  const issueDate = doc.issue_date ? _accountingThaiDate(doc.issue_date) : _accountingThaiDate(new Date());
  const dueDate = doc.due_date ? _accountingThaiDate(doc.due_date) : '-';
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escH(typeLabel)} ${escH(doc.document_no||'')}</title><style>
  body{font-family:Arial,'Noto Sans Thai',sans-serif;margin:0;background:#f3f6fb;color:#102a5e}.page{max-width:900px;margin:24px auto;background:#fff;padding:34px;border:1px solid #d8e1f0}.top{display:flex;justify-content:space-between;gap:18px;border-bottom:3px solid #0b4bb3;padding-bottom:18px}.logo{max-height:68px}.muted{color:#637083}.box{border:1px solid #dbe3ef;border-radius:14px;padding:14px;margin:14px 0}.tbl{width:100%;border-collapse:collapse;margin-top:16px}.tbl th,.tbl td{border-bottom:1px solid #e5eaf3;padding:10px;text-align:left;vertical-align:top}.tbl th{background:#eef5ff;color:#0b2e6d}.right{text-align:right!important}.sign{display:flex;justify-content:flex-end;margin-top:42px}.signBox{text-align:center;min-width:260px}.asset{max-height:72px;max-width:180px}.printBtn{position:fixed;right:18px;top:18px;background:#ffd233;color:#071b49;border:0;border-radius:999px;padding:12px 18px;font-weight:900}@media print{body{background:#fff}.page{margin:0;border:0;max-width:none}.printBtn{display:none}}</style></head><body><button class="printBtn" onclick="window.print()">พิมพ์ / Save PDF</button><main class="page">
  <div class="top"><div>${company.logo_url?`<img class="logo" src="${escH(company.logo_url)}"><br>`:''}<h2>${escH(company.company_name)}</h2><div class="muted">เลขประจำตัวผู้เสียภาษี ${escH(company.tax_id||'-')} • ${escH(company.branch||'')}</div><div>${escH(company.address||'')}</div><div>โทร ${escH(company.phone||'-')}</div></div><div style="text-align:right"><h1>${escH(typeLabel)}</h1><b>เลขที่ ${escH(doc.document_no||'-')}</b><br><span class="muted">วันที่ออก ${escH(issueDate)}</span><br><span class="muted">หมดอายุ/ครบกำหนด ${escH(dueDate)}</span></div></div>
  <div class="box"><b>ลูกค้า</b><br>${escH(doc.customer_name||'-')}<br>${doc.customer_tax_id?`เลขภาษี: ${escH(doc.customer_tax_id)}<br>`:''}${escH(doc.customer_address||'')}${doc.customer_phone?`<br>โทร ${escH(doc.customer_phone)}`:''}</div>
  <table class="tbl"><thead><tr><th>#</th><th>รายการ</th><th class="right">จำนวน</th><th class="right">ราคา/หน่วย</th><th class="right">รวม</th></tr></thead><tbody>${rows.length?rows.map((r,i)=>`<tr><td>${i+1}</td><td>${escH(r.description||r.job_type||'-')}<div class="muted">${escH([r.ac_type, r.wash_variant, r.btu].filter(Boolean).join(' / '))}</div></td><td class="right">${fmt(r.quantity||1)}</td><td class="right">${fmt(r.unit_price||0)}</td><td class="right">${fmt(r.line_total||0)}</td></tr>`).join(''):`<tr><td>1</td><td>ยอดเอกสาร</td><td class="right">1</td><td class="right">${fmt(doc.subtotal)}</td><td class="right">${fmt(doc.subtotal)}</td></tr>`}</tbody><tfoot><tr><th colspan="4" class="right">Subtotal</th><th class="right">${fmt(doc.subtotal)}</th></tr><tr><th colspan="4" class="right">ส่วนลด</th><th class="right">${fmt(doc.discount_amount)}</th></tr><tr><th colspan="4" class="right">VAT</th><th class="right">${fmt(doc.vat_amount)}</th></tr><tr><th colspan="4" class="right">หัก ณ ที่จ่าย</th><th class="right">${fmt(doc.withholding_amount)}</th></tr><tr><th colspan="4" class="right">ยอดรวมสุทธิ</th><th class="right">${fmt(doc.total_amount)}</th></tr></tfoot></table>
  <div class="box"><b>หมายเหตุ</b><br>${escH(p.note || company.footer_text || 'เอกสารนี้ใช้ประกอบการตรวจสอบและทำรายการของ Coldwindflow Air Services')}</div>
  <div class="sign"><div class="signBox">${company.stamp_url?`<img class="asset" src="${escH(company.stamp_url)}"><br>`:''}${signatureUrl?`<img class="asset" src="${escH(signatureUrl)}" alt="authorized signature"><br>`:''}<div>ลงชื่อ _______________________</div><b>${escH(signerName)}</b><div class="muted">${escH(signerPosition)}</div></div></div>
</main></body></html>`;
}

app.get('/admin/accounting/documents/:document_id/print', requireAccountingPermission('accounting.read.documents'), async (req, res) => {
  try {
    const id = Number(req.params.document_id || 0);
    if (!id) return res.status(400).send('Invalid document id');
    const q = await pool.query(`SELECT * FROM public.accounting_documents WHERE document_id=$1 LIMIT 1`, [id]);
    const doc = q.rows[0];
    if (!doc) return res.status(404).send('Document not found');
    const company = await _getAccountingSettings();
    if (String(doc.document_type) === 'withholding_cert') return res.type('application/pdf').set('Content-Disposition', `inline; filename="${doc.document_no || 'wht50'}.pdf"`).send(await _accountingWithholdingPdfBuffer(doc, company));
    return res.type('html').send(_accountingGenericDocumentPrintHtml(doc, company));
  } catch (e) {
    console.error('GET /admin/accounting/documents/:document_id/print', e);
    return res.status(500).send('Print document failed');
  }
});

app.post('/admin/accounting/payouts/:payout_id/adjust', requireAccountingPermission('accounting_mark_payout_paid'), async (req, res) => {
  const client = await pool.connect();
  let began = false;
  try {
    const payout_id = String(req.params.payout_id || '').trim();
    await client.query('BEGIN');
    began = true;
    const result = await accountingPayoutAdjustments.applyAccountingPositivePayoutAdjustment({
      client,
      payout_id,
      body: req.body || {},
      actor: _accountingActor(req),
      req,
      regenerateDraftPayoutContractLines: _regenerateDraftPayoutContractLines,
    });
    await client.query('COMMIT');
    began = false;
    return res.json({
      ok: true,
      payout_id,
      technician_username: result.adjustment?.technician_username || req.body?.technician_username || null,
      adjustment: result.adjustment,
      payment: result.payment || null,
      totals: result.totals,
      paid_status: result.totals?.paid_status || null,
      period_status_before: result.period_status_before || null,
      period_status_after: result.period_status_after || null,
      regenerated: !!result.regenerated,
      replayed: !!result.replayed,
    });
  } catch (e) {
    if (began) { try { await client.query('ROLLBACK'); } catch {} }
    console.error('POST /admin/accounting/payouts/:payout_id/adjust', e);
    const code = Number(e.statusCode || 500);
    const error = String(e.code || e.message || 'PAYOUT_ADJUSTMENT_FAILED');
    if (error === 'PAYOUT_ADJUSTMENT_MIGRATION_REQUIRED') return res.status(503).json({ ok:false, error });
    if (error === 'IDEMPOTENCY_KEY_REUSED') return res.status(409).json({ ok:false, error });
    if (error === 'PAYOUT_PAID_RECONCILIATION_REQUIRED') return res.status(409).json({ ok:false, error });
    if (error === 'PAYOUT_PERIOD_NOT_CLOSED') return res.status(409).json({ ok:false, error, period_end: e.period_end || null });
    if (['PAYOUT_NOT_FOUND','JOB_NOT_FOUND'].includes(error)) return res.status(code === 500 ? 404 : code).json({ ok:false, error });
    if ([
      'MISSING_PAYOUT_ID',
      'MISSING_TECHNICIAN_USERNAME',
      'INVALID_ADJUSTMENT_AMOUNT',
      'INVALID_IDEMPOTENCY_KEY',
      'MISSING_REASON',
      'IDEMPOTENCY_KEY_REQUIRED',
      'CONFIRM_ADJUSTMENT_REQUIRED',
      'INVALID_JOB_ID',
    ].includes(error)) return res.status(400).json({ ok:false, error });
    return res.status(code >= 400 && code < 600 ? code : 500).json({ ok:false, error:'PAYOUT_ADJUSTMENT_FAILED' });
  } finally {
    client.release();
  }
});

app.post('/admin/accounting/payouts/:payout_id/pay', requireAccountingPermission('accounting_mark_payout_paid'), async (req, res) => {
  const client = await pool.connect();
  try {
    const payout_id = String(req.params.payout_id || '').trim();
    const body = req.body || {};
    const tech = String(body.technician_username || '').trim();
    const paidNow = _money(body.paid_amount);
    if (!payout_id) return res.status(400).json({ ok: false, error: 'MISSING_PAYOUT_ID' });
    if (!tech) return res.status(400).json({ ok: false, error: 'MISSING_TECHNICIAN_USERNAME' });
    if (body.confirm_paid !== true) return res.status(400).json({ ok: false, error: 'CONFIRM_PAID_REQUIRED' });
    if (Number(paidNow || 0) <= 0) return res.status(400).json({ ok: false, error: 'INVALID_PAID_AMOUNT' });

    await client.query('BEGIN');
    const prepared = await ensurePayoutPeriodAndSnapshotForPayment({
      pool,
      client,
      payout_id,
      actor_username: _accountingActor(req).username || null,
      getPayoutPeriod: (pid) => _getPayoutPeriod(pid, client, { forUpdate: true }),
      regenerateDraftPayoutContractLines: _regenerateDraftPayoutContractLines,
      req,
    });
    const beforeTotals = await _getTechGrossAdjNet(payout_id, tech, client, { period_status: prepared.period?.status || 'draft' });
    const beforePayQ = await client.query(
      `SELECT paid_amount, paid_status, paid_at, paid_by, slip_url, note, payment_method, payment_reference
         FROM public.technician_payout_payments
        WHERE payout_id=$1 AND technician_username=$2
        LIMIT 1
        FOR UPDATE`,
      [payout_id, tech]
    );
    const beforePayment = beforePayQ.rows[0] || null;
    const currentPaid = Number(beforePayment?.paid_amount || 0);
    const depositResult = await _ensureDepositCollectionForPayout({
      payout_id,
      username: tech,
      gross_amount: beforeTotals.gross_amount,
      adj_total: beforeTotals.adj_total,
      actor: _accountingActor(req).username || null,
      client,
    });
    const currentTotals = await _getTechGrossAdjNet(payout_id, tech, client, { period_status: prepared.period?.status || 'draft' });
    const remaining = Math.max(0, Number(currentTotals.net_amount || 0) - currentPaid);
    if (remaining <= 0.0001) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'PAYOUT_ALREADY_PAID' });
    }
    if (Number(paidNow) - remaining > 0.01) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        ok: false,
        error: 'PAYOUT_PAYABLE_CHANGED',
        current_payable_amount: _money(currentTotals.net_amount || 0),
        remaining_amount: _money(remaining),
        requested_paid_amount: _money(paidNow),
        deposit_deduction_amount: _money(currentTotals.deposit_deduction_amount || 0),
      });
    }

    const payment_method = String(body.payment_method || '').trim() || null;
    const payment_reference = String(body.payment_reference || '').trim() || null;
    const note = String(body.note || '').trim() || null;
    const slip_url = String(body.slip_url || '').trim() || null;
    const cumulativePaid = _money(currentPaid + Number(paidNow));
    const result = await _upsertPaymentAndMaybeMarkPaid(payout_id, tech, cumulativePaid, slip_url, note, _accountingActor(req).username || null, req, {
      client,
      preparedPeriod: prepared.period,
      depositAlreadyPrepared: true,
      depositCollections: { checked: 1, inserted: depositResult.inserted ? 1 : 0 },
    });

    await client.query(
      `UPDATE public.technician_payout_payments
          SET payment_method=COALESCE($3, payment_method),
              payment_reference=COALESCE($4, payment_reference)
        WHERE payout_id=$1 AND technician_username=$2`,
      [payout_id, tech, payment_method, payment_reference]
    );

    const afterPayQ = await client.query(
      `SELECT paid_amount, paid_status, paid_at, paid_by, slip_url, note, payment_method, payment_reference
         FROM public.technician_payout_payments
        WHERE payout_id=$1 AND technician_username=$2
        LIMIT 1`,
      [payout_id, tech]
    );
    const afterTotals = await _getTechGrossAdjNet(payout_id, tech, client, { period_status: prepared.period?.status || 'locked' });
    await logAccountingAudit(req, {
      action: 'MARK_PAYOUT_PAID',
      entity_type: 'technician_payout_payment',
      entity_id: `${payout_id}:${tech}`,
      before_json: { totals: beforeTotals, payment: beforePayment },
      after_json: { totals: afterTotals, payment: afterPayQ.rows[0] || null },
      note: note || payment_reference || payment_method || null,
    }, { client, strict: true });

    await client.query('COMMIT');

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
    try { await client.query('ROLLBACK'); } catch {}
    console.error('POST /admin/accounting/payouts/:payout_id/pay', e);
    if (String(e.code || '') === 'PAYOUT_NOT_FOUND') return res.status(404).json({ ok: false, error: 'PAYOUT_NOT_FOUND' });
    if (String(e.code || '') === 'PAYOUT_ALREADY_PAID') return res.status(409).json({ ok: false, error: 'PAYOUT_ALREADY_PAID' });
    if (String(e.code || '') === 'DEPOSIT_COLLECT_INDEX_REQUIRED') return res.status(503).json({ ok: false, error: 'DEPOSIT_COLLECT_INDEX_REQUIRED' });
    if (String(e.code || '') === 'PAYOUT_PAYABLE_CHANGED') return res.status(409).json({ ok: false, error: 'PAYOUT_PAYABLE_CHANGED', current_payable_amount: e.current_payable_amount, requested_paid_amount: e.requested_paid_amount });
    if (String(e.code || '') === 'PAYOUT_PERIOD_NOT_CLOSED') return res.status(409).json({ ok: false, error: 'PAYOUT_PERIOD_NOT_CLOSED', period_end: e.period_end || null });
    if (String(e.message || '').includes('CANNOT_REGENERATE')) return res.status(409).json({ ok: false, error: String(e.message || 'CANNOT_REGENERATE') });
    return res.status(500).json({ ok: false, error: 'MARK_PAYOUT_PAID_FAILED' });
  } finally {
    client.release();
  }
});

function _accountingCsvValue(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function _accountingCsv(rows = [], columns = []) {
  const escCsv = (v) => {
    const raw = _accountingCsvValue(v);
    const escaped = raw.replace(/"/g, '""');
    return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
  };
  const header = columns.map(c => escCsv(c.label || c.key)).join(',');
  const body = rows.map(row => columns.map(c => escCsv(row[c.key])).join(',')).join('\n');
  return '\ufeff' + header + (body ? '\n' + body : '\n');
}

function _accountingSendCsv(res, filename, rows, columns) {
  const safeName = String(filename || 'accounting-report.csv').replace(/[^a-zA-Z0-9._-]/g, '_');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  return res.send(_accountingCsv(rows, columns));
}

const ACCOUNTING_REPORTS = {
  revenue: {
    filename: 'cwf-accounting-revenue.csv',
    label: 'รายงานรายรับ',
    columns: [
      { key: 'booking_code', label: 'รหัสงาน' },
      { key: 'job_id', label: 'Job ID' },
      { key: 'finished_at', label: 'วันที่งานเสร็จ' },
      { key: 'customer_name', label: 'ลูกค้า' },
      { key: 'customer_phone_masked', label: 'เบอร์ลูกค้า' },
      { key: 'gross_sales_amount', label: 'ยอดขายเต็ม' },
      { key: 'payment_status_th', label: 'สถานะรับเงิน' },
      { key: 'raw_payment_status', label: 'สถานะเดิม' },
      { key: 'paid_at', label: 'รับเงินเมื่อ' },
      { key: 'paid_by', label: 'บันทึกโดย' },
      { key: 'payment_method', label: 'ช่องทางรับเงิน' },
      { key: 'payment_reference', label: 'เลขอ้างอิง' },
      { key: 'payment_proof_url', label: 'หลักฐานรับเงิน' },
    ],
    sql: () => `WITH gross AS (
        SELECT j.job_id, COALESCE(NULLIF(SUM(COALESCE(ji.line_total,0)),0), COALESCE(j.job_price,0), 0)::numeric AS gross_sales_amount
          FROM public.jobs j
          LEFT JOIN public.job_items ji ON CAST(ji.job_id AS TEXT)=CAST(j.job_id AS TEXT)
         WHERE ${_sqlDonePredicate('j')} AND j.finished_at IS NOT NULL
         GROUP BY j.job_id, j.job_price
      ), proof AS (
        SELECT DISTINCT ON (job_id) job_id, public_url
          FROM public.job_photos
         WHERE COALESCE(phase,'')='payment_slip' AND COALESCE(public_url,'') <> ''
         ORDER BY job_id, COALESCE(uploaded_at, created_at) DESC
      )
      SELECT j.booking_code, j.job_id, j.finished_at, COALESCE(j.customer_name,'') AS customer_name,
             ${"''"} AS customer_phone_masked,
             g.gross_sales_amount,
             CASE WHEN COALESCE(j.payment_status,'unpaid')='paid' OR j.paid_at IS NOT NULL THEN 'รับเงินแล้ว'
                  WHEN COALESCE(j.payment_status,'unpaid')='partial' THEN 'รับบางส่วน'
                  ELSE 'ยังไม่รับเงิน' END AS payment_status_th,
             COALESCE(j.payment_status,'unpaid') AS raw_payment_status,
             j.paid_at, j.paid_by, j.payment_method, j.payment_reference,
             proof.public_url AS payment_proof_url,
             j.customer_phone
        FROM gross g
        JOIN public.jobs j ON j.job_id=g.job_id
        LEFT JOIN proof ON proof.job_id=j.job_id
       ORDER BY j.finished_at DESC
       LIMIT 5000`,
    transform: rows => rows.map(r => ({ ...r, customer_phone_masked: _maskPhone(r.customer_phone) })),
  },
  expenses: {
    filename: 'cwf-accounting-expenses.csv',
    label: 'รายงานรายจ่าย',
    columns: [
      { key: 'expense_id', label: 'Expense ID' },
      { key: 'expense_date', label: 'วันที่' },
      { key: 'category', label: 'หมวดรายจ่าย' },
      { key: 'vendor_name', label: 'ร้านค้า/ผู้ขาย' },
      { key: 'description', label: 'รายละเอียด' },
      { key: 'amount', label: 'จำนวนเงิน' },
      { key: 'vat_amount', label: 'VAT' },
      { key: 'withholding_amount', label: 'หัก ณ ที่จ่าย' },
      { key: 'payment_method', label: 'ช่องทางชำระเงิน' },
      { key: 'job_id', label: 'Job ID' },
      { key: 'status', label: 'สถานะ' },
      { key: 'created_by', label: 'บันทึกโดย' },
      { key: 'created_at', label: 'บันทึกเมื่อ' },
    ],
    sql: () => `SELECT expense_id, expense_date, category, vendor_name, description, amount, vat_amount, withholding_amount,
                       payment_method, job_id, status, created_by, created_at
                  FROM public.accounting_expenses
                 WHERE COALESCE(status,'') <> 'voided'
                 ORDER BY expense_date DESC, created_at DESC
                 LIMIT 5000`,
  },
  payouts: {
    filename: 'cwf-accounting-payouts.csv',
    label: 'รายงานจ่ายช่าง',
    columns: [
      { key: 'payout_id', label: 'งวดจ่าย' },
      { key: 'period_type', label: 'รอบวันที่' },
      { key: 'period_start', label: 'เริ่มงวด' },
      { key: 'period_end', label: 'สิ้นสุดงวด' },
      { key: 'status_th', label: 'สถานะจ่ายช่าง' },
      { key: 'technician_count', label: 'จำนวนช่าง' },
      { key: 'gross_amount', label: 'รายได้ก่อนหัก' },
      { key: 'deposit_deduction_amount', label: 'หักเงินประกัน' },
      { key: 'adj_total', label: 'ปรับยอด' },
      { key: 'net_payable', label: 'ยอดสุทธิ' },
      { key: 'paid_amount', label: 'จ่ายแล้ว' },
      { key: 'remaining_amount', label: 'คงเหลือ' },
    ],
    sql: () => `WITH line_sum AS (
        SELECT payout_id, COUNT(DISTINCT technician_username)::int AS technician_count, COALESCE(SUM(earn_amount),0)::numeric AS gross_amount
          FROM public.technician_payout_lines GROUP BY payout_id
      ), adj AS (SELECT payout_id, COALESCE(SUM(adj_amount),0)::numeric AS adj_total FROM public.technician_payout_adjustments GROUP BY payout_id),
      dep AS (SELECT payout_id, COALESCE(SUM(amount),0)::numeric AS deposit_deduction_amount FROM public.technician_deposit_ledger WHERE transaction_type='collect' GROUP BY payout_id),
      pay AS (SELECT payout_id, COALESCE(SUM(paid_amount),0)::numeric AS paid_amount FROM public.technician_payout_payments GROUP BY payout_id)
      SELECT p.payout_id, p.period_type, p.period_start, p.period_end,
             CASE WHEN GREATEST(0, COALESCE(line_sum.gross_amount,0) + COALESCE(adj.adj_total,0) - COALESCE(dep.deposit_deduction_amount,0) - COALESCE(pay.paid_amount,0)) <= 0 THEN 'จ่ายช่างแล้ว'
                  WHEN COALESCE(pay.paid_amount,0) > 0 THEN 'จ่ายช่างบางส่วน'
                  ELSE 'ยังไม่จ่ายช่าง' END AS status_th,
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
       LIMIT 5000`,
  },
  deposits: {
    filename: 'cwf-accounting-deposits.csv',
    label: 'รายงานเงินประกัน',
    columns: [
      { key: 'technician_username', label: 'ช่าง' },
      { key: 'target_amount', label: 'เป้าหมายเงินประกัน' },
      { key: 'collected_total', label: 'สะสมแล้ว' },
      { key: 'remaining_amount', label: 'คงเหลือถึงเป้าหมาย' },
      { key: 'latest_at', label: 'อัปเดตล่าสุด' },
      { key: 'note', label: 'หมายเหตุ' },
    ],
    sql: () => `WITH ledger AS (
        SELECT technician_username,
               COALESCE(SUM(CASE WHEN transaction_type='collect' THEN amount WHEN transaction_type='manual_adjust' THEN amount WHEN transaction_type IN ('refund','claim_deduct') THEN -amount ELSE 0 END),0)::numeric AS collected_total,
               MAX(created_at) AS latest_at
          FROM public.technician_deposit_ledger
         GROUP BY technician_username
      )
      SELECT COALESCE(a.technician_username, ledger.technician_username) AS technician_username,
             COALESCE(a.target_amount,5000)::numeric AS target_amount,
             COALESCE(ledger.collected_total,0)::numeric AS collected_total,
             GREATEST(0, COALESCE(a.target_amount,5000) - COALESCE(ledger.collected_total,0))::numeric AS remaining_amount,
             ledger.latest_at,
             'เงินประกันไม่ใช่กำไรบริษัท' AS note
        FROM public.technician_deposit_accounts a
        FULL OUTER JOIN ledger ON ledger.technician_username=a.technician_username
       ORDER BY collected_total DESC, technician_username ASC
       LIMIT 5000`,
  },
  documents: {
    filename: 'cwf-accounting-documents.csv',
    label: 'รายงานเอกสารขาย',
    columns: [
      { key: 'document_no', label: 'เลขเอกสาร' },
      { key: 'document_type', label: 'ประเภทเอกสาร' },
      { key: 'status', label: 'สถานะ' },
      { key: 'job_id', label: 'Job ID' },
      { key: 'customer_name', label: 'ลูกค้า' },
      { key: 'issue_date', label: 'วันที่ออก' },
      { key: 'due_date', label: 'ครบกำหนด' },
      { key: 'subtotal', label: 'ยอดก่อนภาษี' },
      { key: 'discount_amount', label: 'ส่วนลด' },
      { key: 'vat_amount', label: 'VAT' },
      { key: 'withholding_amount', label: 'หัก ณ ที่จ่าย' },
      { key: 'total_amount', label: 'ยอดรวม' },
      { key: 'created_by', label: 'สร้างโดย' },
      { key: 'created_at', label: 'สร้างเมื่อ' },
    ],
    sql: () => `SELECT document_no, document_type, status, job_id, customer_name, issue_date, due_date,
                       subtotal, discount_amount, vat_amount, withholding_amount, total_amount, created_by, created_at
                  FROM public.accounting_documents
                 ORDER BY created_at DESC
                 LIMIT 5000`,
  },
  'gross-profit': {
    filename: 'cwf-accounting-gross-profit.csv',
    label: 'รายงานกำไรขั้นต้น',
    columns: [
      { key: 'revenue_total', label: 'ยอดขายงานเสร็จแล้ว' },
      { key: 'expense_total', label: 'รายจ่ายที่บันทึก' },
      { key: 'technician_payable_total', label: 'ยอดสุทธิจ่ายช่าง' },
      { key: 'estimated_gross_profit', label: 'กำไรขั้นต้นโดยประมาณ' },
      { key: 'note', label: 'หมายเหตุ' },
    ],
    sql: () => `WITH revenue AS (
        SELECT COALESCE(SUM(total_amount),0)::numeric AS revenue_total FROM (
          SELECT j.job_id, COALESCE(NULLIF(SUM(COALESCE(ji.line_total,0)),0), COALESCE(j.job_price,0), 0)::numeric AS total_amount
            FROM public.jobs j
            LEFT JOIN public.job_items ji ON CAST(ji.job_id AS TEXT)=CAST(j.job_id AS TEXT)
           WHERE ${_sqlDonePredicate('j')} AND j.finished_at IS NOT NULL
           GROUP BY j.job_id, j.job_price
        ) x
      ), expenses AS (
        SELECT COALESCE(SUM(amount),0)::numeric AS expense_total FROM public.accounting_expenses WHERE COALESCE(status,'') <> 'voided'
      ), payout AS (
        SELECT COALESCE(SUM(net_payable),0)::numeric AS technician_payable_total FROM (
          WITH line_sum AS (SELECT payout_id, COALESCE(SUM(earn_amount),0)::numeric AS gross_amount FROM public.technician_payout_lines GROUP BY payout_id),
          adj AS (SELECT payout_id, COALESCE(SUM(adj_amount),0)::numeric AS adj_total FROM public.technician_payout_adjustments GROUP BY payout_id),
          dep AS (SELECT payout_id, COALESCE(SUM(amount),0)::numeric AS deposit_deduction_amount FROM public.technician_deposit_ledger WHERE transaction_type='collect' GROUP BY payout_id)
          SELECT p.payout_id, (COALESCE(line_sum.gross_amount,0) + COALESCE(adj.adj_total,0) - COALESCE(dep.deposit_deduction_amount,0))::numeric AS net_payable
            FROM public.technician_payout_periods p
            LEFT JOIN line_sum ON line_sum.payout_id=p.payout_id
            LEFT JOIN adj ON adj.payout_id=p.payout_id
            LEFT JOIN dep ON dep.payout_id=p.payout_id
        ) y
      )
      SELECT revenue.revenue_total, expenses.expense_total, payout.technician_payable_total,
             (revenue.revenue_total - expenses.expense_total - payout.technician_payable_total)::numeric AS estimated_gross_profit,
             'รายงานนี้เป็นข้อมูลให้บัญชีตรวจ ไม่ใช่การยื่นภาษีอัตโนมัติ' AS note
        FROM revenue, expenses, payout`,
  },
  'vat-summary': {
    filename: 'cwf-accounting-vat-summary.csv',
    label: 'VAT summary',
    columns: [
      { key: 'source', label: 'ประเภท' },
      { key: 'item_count', label: 'จำนวนรายการ' },
      { key: 'vat_amount', label: 'VAT' },
      { key: 'note', label: 'หมายเหตุ' },
    ],
    sql: () => `SELECT 'เอกสารขาย' AS source, COUNT(*)::int AS item_count, COALESCE(SUM(vat_amount),0)::numeric AS vat_amount, 'VAT จาก accounting_documents' AS note FROM public.accounting_documents WHERE COALESCE(status,'') <> 'voided'
                UNION ALL
                SELECT 'รายจ่าย' AS source, COUNT(*)::int AS item_count, COALESCE(SUM(vat_amount),0)::numeric AS vat_amount, 'VAT จาก accounting_expenses' AS note FROM public.accounting_expenses WHERE COALESCE(status,'') <> 'voided'`,
  },
  'withholding-summary': {
    filename: 'cwf-accounting-withholding-summary.csv',
    label: 'Withholding tax summary',
    columns: [
      { key: 'source', label: 'ประเภท' },
      { key: 'category', label: 'หมวด' },
      { key: 'vendor_name', label: 'ร้านค้า/ผู้ขาย' },
      { key: 'item_count', label: 'จำนวนรายการ' },
      { key: 'withholding_amount', label: 'หัก ณ ที่จ่าย' },
    ],
    sql: () => `SELECT 'รายจ่าย' AS source, category, vendor_name, COUNT(*)::int AS item_count, COALESCE(SUM(withholding_amount),0)::numeric AS withholding_amount
                  FROM public.accounting_expenses
                 WHERE COALESCE(status,'') <> 'voided' AND COALESCE(withholding_amount,0) <> 0
                 GROUP BY category, vendor_name
                 ORDER BY withholding_amount DESC`,
  },
};

app.get('/admin/accounting/reports/:report_key.csv', requireAccountingPermission('accounting.read.reports'), async (req, res) => {
  const reportKey = String(req.params.report_key || '').replace(/\.csv$/i, '').trim();
  const report = ACCOUNTING_REPORTS[reportKey];
  if (!report) return res.status(404).json({ ok: false, error: 'ACCOUNTING_REPORT_NOT_FOUND' });
  try {
    const q = await pool.query(report.sql(), []);
    const rows = typeof report.transform === 'function' ? report.transform(q.rows || []) : (q.rows || []);
    await logAccountingAudit(req, {
      action: 'REPORT_EXPORT',
      entity_type: 'accounting_report',
      entity_id: reportKey,
      after_json: { report_key: reportKey, rows: rows.length },
      note: report.label,
    });
    return _accountingSendCsv(res, report.filename, rows, report.columns);
  } catch (e) {
    console.error('GET /admin/accounting/reports/:report_key.csv', reportKey, e);
    return res.status(500).json({ ok: false, error: 'ACCOUNTING_REPORT_EXPORT_FAILED', message: e.message });
  }
});

app.use(createDocumentRoutes({
  pool,
  // Job documents (receipt/e-slip) carry full customer PII. Access requires
  // the job's booking_token (?key=...) or an authenticated admin session —
  // a bare sequential job_id must never be enough.
  isAdminRequest: async (req) => {
    try {
      const ctx = await getAuthContext(req, null);
      return Boolean(ctx && ctx.ok && (ctx.actor.role === "admin" || ctx.actor.role === "super_admin"));
    } catch (_) {
      return false;
    }
  },
  docsRateLimiter: publicDocsRateLimiter,
  accountingOwnerSignaturePublicUrl: _accountingOwnerSignaturePublicUrl,
  accountingSignaturePublicUrl: _accountingSignaturePublicUrl,
  accountingOwnerSignerName: _accountingOwnerSignerName,
  accountingOwnerSignerPosition: _accountingOwnerSignerPosition,
}));


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
  return jobTiming.getBangkokNow();
}

function getNowBangkokMin() {
  const p = getNowBangkokParts();
  return p.hour * 60 + p.minute;
}
function computeDurationMin(payload = {}, opts = {}) {
  return pricingHelpers.computeDurationMin(payload, opts);
}

function computeStandardPrice(payload = {}) {
  return pricingHelpers.computeStandardPrice(payload);
}

function normalizeServicesFromPayload(payload = {}) {
  return pricingHelpers.normalizeServicesFromPayload(payload);
}

function computeDurationMinMulti(payload = {}, opts = {}) {
  return pricingHelpers.computeDurationMinMulti(payload, opts);
}

function computeStandardPriceMulti(payload = {}) {
  return pricingHelpers.computeStandardPriceMulti(payload);
}

function buildServiceLineItemsFromPayload(payload = {}) {
  return pricingHelpers.buildServiceLineItemsFromPayload(payload);
}



function effectiveBlockMin(durationMin) {
  return Math.max(0, Number(durationMin || 0)) + TRAVEL_BUFFER_MIN;
}

async function listTechniciansByType(tech_type, opts = {}) {
  const t = (tech_type || "company").toString().trim().toLowerCase();
  const include_paused = !!opts.include_paused;
  const allow_type_fallback = opts.allow_type_fallback === true;
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
           p.customer_slot_visible AS customer_slot_visible
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
  if ((r.rows || []).length === 0 && allow_type_fallback) {
    try {
      const r2 = await pool.query(
        `
        SELECT u.username,
               COALESCE(p.employment_type,'company') AS employment_type,
               COALESCE(p.work_start,'09:00') AS work_start,
               COALESCE(p.work_end,'18:00') AS work_end,
               COALESCE(p.accept_status,'ready') AS accept_status,
               COALESCE(p.weekly_off_days,'') AS weekly_off_days,
               p.customer_slot_visible AS customer_slot_visible
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

async function listAssignedJobsForTechOnDate(username, dateStr, ignoreJobId, poolOverride) {
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
  const r = await (poolOverride || pool).query(
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

async function listBusyBlocksForTechOnDate(username, dateStr, ignoreJobId, poolOverride){
  // Returns merged BUSY blocks (with conservative buffer) in Bangkok minutes:
  // [{job_id,startMin,busyEndMin,startIso,durationMin}]
  const jobs = await listAssignedJobsForTechOnDate(username, dateStr, ignoreJobId, poolOverride);
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
// 💲 Pricing + Duration Preview (public)
// =======================================
function publicCustomerAvailabilityDeps(db = pool) {
  return {
    pool: db,
    db,
    listTechniciansByType,
    buildOffMapForDate,
    isTechOffOnDate,
    buildTechWindowsMin,
    listBusyBlocksForTechOnDate,
    buildBusyIntervalsConservative,
    buildFreeIntervalsForWindow,
    buildStartIntervalsByCollision,
    isTechFree,
    toMin,
    minToHHMM,
    fmtHHMMFromMin,
    getNowBangkokParts,
    travelBufferMin: TRAVEL_BUFFER_MIN,
  };
}

app.post("/public/pricing_preview", async (req, res) => {
  try {
    const payload = req.body || {};
    // CWF Spec: pricing preview should match conservative schedule duration
    const timing = jobTiming.computeJobTiming(payload, { source: "pricing_preview", conservative: true });
    const duration_min = Number(timing.service_duration_min || 0);
    if (duration_min <= 0) return res.status(400).json({ error: "งานประเภทนี้ต้องให้แอดมินกำหนดเวลา (duration)" });
    const customerPrice = await customerPricingHelpers.resolveCustomerPricingMulti(payload, pool);
    const standard_price = Number(customerPrice.active_price ?? customerPrice.standard_price ?? 0);

    // customer promo auto-apply (preview)
    const promoPick = await findBestCustomerPromotion(payload, standard_price, pool);
    const promo = promoPick?.promo || null;
    const promo_discount = Number(promoPick?.discount || 0);
    const total_after_discount = Math.max(0, Number(standard_price || 0) - Math.min(Number(standard_price || 0), promo_discount));
    res.json({
      standard_price,
      normal_price: Number(customerPrice.normal_price ?? standard_price),
      active_price: Number(customerPrice.active_price ?? standard_price),
      customer_price_label: customerPrice.label || null,
      campaign_name: customerPrice.campaign_name || null,
      customer_price_source: customerPrice.source || "fallback_pricing_js",
      price_lines: customerPrice.lines || [],
      promo: promo ? {
        promo_id: promo.promo_id,
        promo_name: promo.promo_name,
        promo_type: promo.promo_type,
        promo_value: promo.promo_value,
        discount: promo_discount,
        total_after_discount,
      } : null,
      duration_min,
      service_duration_min: duration_min,
      travel_buffer_min: timing.turnaround_buffer_min,
      turnaround_buffer_min: timing.turnaround_buffer_min,
      effective_block_min: timing.occupied_duration_min,
      occupied_duration_min: timing.occupied_duration_min,
      timing_breakdown: timing.breakdown,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "คำนวณราคาไม่สำเร็จ" });
  }
});


// Availability route adapters own request parsing and response serialization;
// the shared engine owns every availability calculation path.
registerPublicCustomerAvailabilityRoutes(app, {
  getDependencies: publicCustomerAvailabilityDeps,
  isEnabled: () => ENABLE_AVAILABILITY_V2,
  getBangkokTodayYMD,
});
registerAdminAvailabilityRoutes(app, {
  getDependencies: publicCustomerAvailabilityDeps,
  isEnabled: () => ENABLE_AVAILABILITY_V2,
  requireAdminSession,
});

registerPublicCustomerBookingRoutes(app, {
  service: bookingJobService,
  quoteService: createCustomerCatalogQuoteService({
    pool,
    createServicePackageResolver: (db) => createServicePackageResolver({ db }),
    computeDurationMinMulti,
  }),
});
registerPublicServicePackageRoutes(app, {
  service: createPublicServicePackageService({ resolver: createServicePackageResolver({ db: pool }) }),
});




// 100% read-only status lookup for the Customer App Waiting Room. Must never
// mutate job_offers/jobs and must never leak job_id, technician identity,
// offer counts, or admin/zone internals -- the response shape below is the
// full contract.
app.get("/public/urgent-status", async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  // Budget fits the waiting room's 10s polling with headroom, while still
  // blocking bulk code guessing.
  const urgentRate = publicUrgentStatusRateLimiter.check(trackingPrivacy.clientIpKey(req));
  if (!urgentRate.allowed) {
    return res.status(429).json({
      error: "เรียกดูสถานะถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
      code: "RATE_LIMITED",
      retry_after_s: urgentRate.retry_after_s,
    });
  }
  const q = String(req.query.token || req.query.q || req.query.booking_code || "").trim();
  if (!q) return res.status(400).json({ error: "missing tracking code" });
  try {
    const r = await pool.query(
      `
      SELECT job_id, booking_code, booking_token, job_status, booking_mode,
             technician_username, technician_team,
             travel_started_at, checkin_at, started_at, finished_at, canceled_at,
             COALESCE(allow_time_proposal,FALSE) AS allow_time_proposal
      FROM public.jobs
      WHERE booking_token=$1 OR booking_code=$1
      LIMIT 1
      `,
      [q]
    );
    const job = r.rows[0];
    if (!job) return res.status(404).json({ error: "not found" });
    if (String(job.booking_mode || "").toLowerCase() !== "urgent") {
      return res.status(400).json({ error: "not urgent booking" });
    }
    const offerR = await pool.query(
      `
      SELECT MIN(expires_at) FILTER (WHERE status='pending' AND expires_at >= NOW()) AS next_offer_expires_at,
             BOOL_OR(status='pending' AND expires_at >= NOW()) AS has_pending_offer,
             BOOL_OR(status='accepted') AS has_accepted_offer
      FROM public.job_offers
      WHERE job_id=$1
      `,
      [job.job_id]
    );
    const offers = offerR.rows[0] || {};
    const hasAccepted = Boolean(job.technician_username || job.technician_team || offers.has_accepted_offer);
    const hasPending = Boolean(offers.has_pending_offer);
    const terminal = ["เสร็จแล้ว", "ยกเลิก"].includes(String(job.job_status || ""));
    const hasExactToken = Boolean(job.booking_token) && q === String(job.booking_token);
    const canCancel = hasExactToken
      && !terminal
      && !job.canceled_at
      && !job.travel_started_at
      && !job.checkin_at
      && !job.started_at
      && !job.finished_at;
    const phase = terminal
      ? "terminal"
      : hasAccepted
        ? "assigned"
        : hasPending
          ? "searching"
          : "fallback";
    return res.json({
      success: true,
      booking_code: job.booking_code || null,
      phase,
      confirmed: hasAccepted,
      terminal,
      can_cancel: canCancel,
      server_now: jobTiming.getBangkokNow().iso,
      allow_time_proposal: Boolean(job.allow_time_proposal),
    });
  } catch (e) {
    console.error("GET /public/urgent-status error:", e);
    return res.status(500).json({ error: "urgent status failed" });
  }
});

app.get("/public/track", publicTrackHandler);
app.post("/public/track/select", publicTrackHandler);

async function publicTrackHandler(req, res) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  // Anti-enumeration: booking codes are short; without a budget an attacker
  // could sweep the keyspace. Real customers do a handful of lookups a minute.
  const trackRate = publicTrackRateLimiter.check(trackingPrivacy.clientIpKey(req));
  if (!trackRate.allowed) {
    return res.status(429).json({
      error: "เรียกดูสถานะถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
      code: "RATE_LIMITED",
      retry_after_s: trackRate.retry_after_s,
    });
  }
  const selectionReference = String(req.body?.selection_ref || "").trim();
  const selection = selectionReference
    ? trackingPrivacy.verifyTrackingSelectionReference(selectionReference, getJwtSecret())
    : null;
  if (selectionReference && !selection) return res.status(404).json({ error: "ไม่พบงาน" });
  const rawQuery = (req.query.q || req.query.token || req.query.booking_code || "").toString().trim();
  // Booking codes are case-insensitive for customer input. Token casing is
  // private and significant, so only normalize a value with the exact code shape.
  const isBookingCodeQuery = /^CWF[A-Z0-9]{7}$/i.test(rawQuery);
  const q = isBookingCodeQuery ? rawQuery.toUpperCase() : rawQuery;
  if (!q && !selection) return res.status(400).json({ error: "ต้องระบุข้อมูลค้นหา" });

  try {
    const r = await pool.query(
      `
      SELECT
        j.job_id, j.booking_code, j.booking_token,
        j.customer_name, j.customer_phone, j.job_type,
        j.appointment_datetime, j.job_status, j.booking_mode, j.dispatch_mode,
        j.duration_min, j.job_price, j.payment_status, j.paid_at, j.created_at,
        j.address_text, j.gps_latitude, j.gps_longitude, j.maps_url, j.job_zone,
        j.technician_username, j.technician_team,
        j.travel_started_at, j.checkin_at, j.started_at, j.finished_at, j.canceled_at, j.cancel_reason,
        j.technician_note,
        j.customer_rating, j.customer_review, j.customer_complaint, j.reviewed_at,
        tp.full_name AS tech_name, tp.photo_path AS tech_photo, tp.rank_level AS tech_rank_level, tp.rank_key AS tech_rank_key, tp.rating, tp.grade, tp.phone AS tech_phone
      FROM public.jobs j
      LEFT JOIN public.technician_profiles tp ON tp.username = j.technician_username
      WHERE ${selection ? "j.job_id=$1" : isBookingCodeQuery ? "j.booking_code=$1" : "j.booking_token=$1"}
      LIMIT 2
      `,
      [selection ? selection.job_id : q]
    );

    if (r.rows.length === 0 || (isBookingCodeQuery && r.rows.length !== 1)) {
      return res.status(404).json({ error: "ไม่พบงาน" });
    }

    const row = r.rows[0];
    const origin = `${req.protocol}://${req.get("host")}`;

    let serviceItems = [];
    try {
      const itemR = await pool.query(
        `SELECT item_name, qty, unit_price, line_total
           FROM public.job_items
          WHERE job_id=$1
          ORDER BY job_item_id ASC`,
        [row.job_id]
      );
      serviceItems = itemR.rows || [];
    } catch (e) {
      console.warn("[public_track_items] load failed", { job_id: row.job_id, error: e.message });
    }

    // ✅ รูป/หมายเหตุ แสดงเฉพาะหลังปิดงาน
    const isDone = String(row.job_status || "").trim() === "เสร็จแล้ว";

    // ✅ กันลูกค้าสับสน: สถานะ "ตีกลับ" เป็นสถานะภายใน (ให้ลูกค้าเห็นเป็นรอดำเนินการ)
    const rawStatus = String(row.job_status || "").trim();
    const publicStatus = (rawStatus === "ตีกลับ" || rawStatus === "งานแก้ไข") ? "รอดำเนินการ" : rawStatus;
    const canShowPublicTechnician = !['รอตรวจสอบ', 'pending_review'].includes(rawStatus);

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

    // Separate, additional surface from the technician review block below
    // (jobs.customer_rating/customer_review + technician_reviews, untouched).
    // Rates the catalog item/service via public.catalog_item_reviews, using
    // the job's own tracking/booking token for authorization -- never
    // requires a Customer App login. See server/routes/catalog/reviews.js
    // (POST /public/catalog-reviews) for the actual submission route.
    let catalogReview = null;
    try {
      const trackingReviewReady = await createCatalogReviewRoutes.isTrackingReviewSchemaReady(pool);
      if (trackingReviewReady) {
        const existingR = await pool.query(
          `SELECT rating, comment, moderation_status, created_at
             FROM public.catalog_item_reviews WHERE completed_job_id = $1`,
          [row.job_id]
        );
        const existing = existingR.rows[0] || null;
        const eligible = createCatalogReviewRoutes.isJobReviewEligible({
          job_status: rawStatus,
          canceled_at: row.canceled_at,
        });
        catalogReview = {
          eligible: eligible && !existing,
          already_reviewed: Boolean(existing),
          review: existing
            ? {
                rating: Number(existing.rating),
                comment: existing.comment || "",
                moderation_status: existing.moderation_status,
                created_at: existing.created_at,
              }
            : null,
        };
      }
    } catch (e) {
      console.warn("[public_track_catalog_review] load failed", { job_id: row.job_id, error: e.message });
    }

    let publicUnits = [];
    if (!isDone) {
      try {
        const unitR = await pool.query(
          `SELECT unit_no, unit_code, item_name, ac_type, wash_type, btu, location_label
             FROM public.job_units
            WHERE job_id=$1
              AND LOWER(COALESCE(NULLIF(status,''),'pending')) NOT IN ('cancelled','removed','deleted','void','inactive')
            ORDER BY unit_no ASC, unit_id ASC`,
          [row.job_id]
        );
        publicUnits = (unitR.rows || []).map((unit) => ({
          unit_no: unit.unit_no,
          unit_code: unit.unit_code || null,
          label: [`เครื่องที่ ${unit.unit_no || "-"}`, unit.location_label].filter(Boolean).join(" / "),
          btu: unit.btu || null,
          ac_type: unit.ac_type || null,
          service_type: unit.wash_type || unit.item_name || null,
          checklist_summary: null,
          photos: [],
        }));
      } catch (e) {
        console.warn("[public_track_units] basic load failed", { job_id: row.job_id, error: e.message });
      }
    }
    if (isDone) {
      try {
        const unitsR = await pool.query(
          `SELECT unit_id, unit_no, unit_code, item_name, ac_type, wash_type, btu, location_label
             FROM public.job_units
            WHERE job_id=$1
              AND LOWER(COALESCE(NULLIF(status,''),'pending')) NOT IN ('cancelled','removed','deleted','void','inactive')
            ORDER BY unit_no ASC, unit_id ASC`,
          [row.job_id]
        );
        const unitRows = unitsR.rows || [];
        const unitIds = unitRows.map((u) => Number(u.unit_id)).filter(Number.isFinite);
        const photosByUnit = new Map();
        const checksByUnit = new Map();

        if (unitIds.length) {
          const unitPhotosR = await pool.query(
            `SELECT photo_id, unit_id, phase, photo_category, created_at, uploaded_at, public_url
               FROM public.job_photos
              WHERE job_id=$1
                AND unit_id = ANY($2::bigint[])
                AND deleted_at IS NULL
                AND COALESCE(public_url,'') <> ''
                AND NOT (
                  COALESCE(photo_category,'')='payment_slip'
                  OR COALESCE(phase,'') ILIKE '%slip%'
                  OR COALESCE(phase,'') ILIKE '%receipt%'
                  OR COALESCE(phase,'') ILIKE '%tax%'
                )
              ORDER BY photo_id ASC`,
            [row.job_id, unitIds]
          );
          for (const photo of unitPhotosR.rows || []) {
            const key = String(photo.unit_id || "");
            const arr = photosByUnit.get(key) || [];
            arr.push({
              photo_id: photo.photo_id,
              phase: photo.phase || null,
              photo_category: photo.photo_category || null,
              created_at: photo.created_at || null,
              uploaded_at: photo.uploaded_at || null,
              public_url: photo.public_url || null,
            });
            photosByUnit.set(key, arr);
          }

          const checklistR = await pool.query(
            `SELECT unit_id, checklist_type, completed_at, checklist_json
               FROM public.job_unit_checklists
              WHERE job_id=$1 AND unit_id = ANY($2::bigint[])`,
            [row.job_id, unitIds]
          );
          for (const check of checklistR.rows || []) {
            const key = String(check.unit_id || "");
            const cur = checksByUnit.get(key) || [];
            cur.push(check);
            checksByUnit.set(key, cur);
          }
        }

        publicUnits = unitRows.map((unit) => {
          const labelParts = [`เครื่องที่ ${unit.unit_no || "-"}`];
          if (unit.location_label) labelParts.push(unit.location_label);
          const checklist = trackingPrivacy.summarizeUnitChecklists(checksByUnit.get(String(unit.unit_id)) || []);
          return {
            unit_id: unit.unit_id,
            unit_no: unit.unit_no,
            unit_code: unit.unit_code || null,
            label: labelParts.join(" / "),
            btu: unit.btu || null,
            ac_type: unit.ac_type || null,
            service_type: unit.wash_type || unit.item_name || null,
            checklist_summary: checklist,
            photos: photosByUnit.get(String(unit.unit_id)) || [],
          };
        });
      } catch (e) {
        console.warn("[public_track_units] load failed", { job_id: row.job_id, error: e.message });
        publicUnits = [];
      }
    }



// =======================================
// 👥 TEAM (Public Tracking)
// - แสดงรายชื่อทีมช่างทั้งหมดในงาน (ถ้าเปิด flag)
// - Backward compatible: ยังส่ง field technician (ช่างหลัก) เหมือนเดิม
// =======================================
let technician_team = null;

if (FLAG_SHOW_TECH_TEAM_ON_TRACKING && canShowPublicTechnician) {
  try {
    // ดึงสมาชิกทีมจากตารางใหม่ (job_team_members)
    const tmR = await pool.query(
      `SELECT username FROM public.job_team_members WHERE job_id=$1 ORDER BY username ASC`,
      [row.job_id]
    );
    const fromJoin = (tmR.rows || []).map((x) => String(x.username || "").trim()).filter(Boolean);

    // ดึงช่างจาก job_assignments ด้วย (โปรดักชันบางงาน assign ผ่านตารางนี้เท่านั้น).
    // job_assignments มีสถานะ in_progress/done เท่านั้น — ทั้งสองถือว่าถูก assign จริง
    // (การปฏิเสธ/หมดอายุอยู่ที่ job_offers ซึ่งไม่ใช่แหล่ง assignment).
    let fromAssign = [];
    try {
      const jaR = await pool.query(
        `SELECT technician_username FROM public.job_assignments
          WHERE job_id=$1 AND COALESCE(status,'in_progress') IN ('in_progress','done')`,
        [row.job_id]
      );
      fromAssign = (jaR.rows || []).map((x) => String(x.technician_username || "").trim()).filter(Boolean);
    } catch (e) {
      // Do not fail tracking, but do NOT swallow silently — log a sanitized
      // warning (job_id + message only; never token/PII/address/coordinates).
      console.warn("[public/track] job_assignments aggregation failed", { job_id: row.job_id, message: e && e.message });
      fromAssign = [];
    }

    // รองรับ legacy fields — technician_team อาจเก็บหลาย username คั่นด้วย comma
    const legacy = [
      row.technician_username,
      ...String(row.technician_team || "").split(","),
    ]
      .map((x) => String(x || "").trim())
      .filter(Boolean);

    // Deduplicate by normalized (lower-cased) username while keeping the first
    // seen display casing; primary technician (technician_username) stays first.
    const seen = new Set();
    const uniq = [];
    for (const u of [...legacy, ...fromJoin, ...fromAssign]) {
      const norm = u.toLowerCase();
      if (seen.has(norm)) continue;
      seen.add(norm);
      uniq.push(u);
    }
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
    // Access level: the long random booking_token = full detail. The short
    // human-readable booking_code = masked PII only (it leaks too easily to
    // act as a full credential) — see server/services/public/trackingPrivacy.js.
    const fullAccess = !selection && trackingPrivacy.isFullAccessQuery(q, row);
    // A selection capability has one absolute 15-minute lifetime. Returning the
    // verified reference prevents select/refresh/post-review reload from rolling
    // that deadline forward. A fresh capability is issued only by a fresh lookup.
    const issuedSelectionReference = fullAccess
      ? ""
      : selection
        ? selectionReference
        : trackingPrivacy.createTrackingSelectionReference(row.job_id, getJwtSecret());
    // Minimal, non-sensitive eligibility signal so a LEGACY customer (a job with
    // no booking_token) can still see the review form on a booking_code lookup
    // and submit code + full phone. It reveals only that a review is possible —
    // no PII, no token. A tokened job is never legacy-eligible, so it can never
    // downgrade to the code+phone path.
    const legacyReviewEligible =
      !String(row.booking_token || "").trim() &&
      String(row.job_status || "").trim() === "เสร็จแล้ว" &&
      !row.customer_rating &&
      !!row.technician_username;
    const trackPayload = {
      access_level: fullAccess ? "token" : "code",
      capabilities: {
        can_view_full_tracking: true,
        can_use_token_actions: fullAccess,
        can_view_documents: fullAccess,
        can_submit_review: fullAccess,
        can_cancel_urgent: fullAccess
          && String(row.booking_mode || "").trim().toLowerCase() === "urgent"
          && !row.canceled_at
          && !row.travel_started_at
          && !row.checkin_at
          && !row.started_at
          && !row.finished_at
          && !URGENT_CANCEL_BLOCKED_STATUSES.has(String(row.job_status || "").trim().toLowerCase()),
      },
      can_view_full_tracking: true,
      can_use_token_actions: fullAccess,
      can_cancel: fullAccess
        && String(row.booking_mode || "").trim().toLowerCase() === "urgent"
        && !row.canceled_at
        && !row.travel_started_at
        && !row.checkin_at
        && !row.started_at
        && !row.finished_at
        && !URGENT_CANCEL_BLOCKED_STATUSES.has(String(row.job_status || "").trim().toLowerCase()),
      legacy_review_eligible: legacyReviewEligible,
      job_id: row.job_id,
      booking_code: row.booking_code || null,
      booking_token: row.booking_token || null,
      customer_name: row.customer_name,
      customer_phone: row.customer_phone || null,
      job_type: row.job_type,
      appointment_datetime: row.appointment_datetime,
      job_status: publicStatus,
      booking_mode: row.booking_mode || null,
      dispatch_mode: row.dispatch_mode || null,
      duration_min: row.duration_min == null ? null : Number(row.duration_min),
      job_price: row.job_price == null ? null : Number(row.job_price),
      payment_status: row.payment_status || null,
      paid_at: row.paid_at || null,
      created_at: row.created_at || null,
      service_items: serviceItems.map((item) => ({
        item_name: item.item_name || null,
        qty: item.qty == null ? null : Number(item.qty),
        unit_price: item.unit_price == null ? null : Number(item.unit_price),
        line_total: item.line_total == null ? null : Number(item.line_total),
      })),
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
      units: publicUnits,

      // The receipt document carries full PII, so its link now embeds the
      // booking_token as an access key (the /docs routes verify it).
      receipt_url: isDone && row.booking_token
        ? `${origin}/docs/receipt/${row.job_id}?key=${encodeURIComponent(row.booking_token)}`
        : null,

      review: {
        already_reviewed: !!row.customer_rating,
        rating: row.customer_rating || null,
        review_text: row.customer_review || null,
        complaint_text: row.customer_complaint || null,
        reviewed_at: row.reviewed_at || null,
      },

      // Separate from `review` above (technician rating). Rates the
      // catalog item/service via public.catalog_item_reviews instead.
      catalog_review: catalogReview,

      technician: row.technician_username && canShowPublicTechnician
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
    };
    res.json(fullAccess
      ? trackPayload
      : trackingPrivacy.selectionPublicTrackPayload(
          trackPayload,
          issuedSelectionReference,
          isDone && !row.canceled_at && !row.customer_rating && !!row.technician_username,
        ));
  } catch (e) {
    console.error("[public/track] failed", { code: String(e?.code || "TRACK_FAILED") });
    res.status(500).json({ error: "ติดตามงานไม่สำเร็จ" });
  }
}

app.post("/public/track/lookup", async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.set("Referrer-Policy", "no-referrer");
  const trackRate = publicTrackRateLimiter.check(trackingPrivacy.clientIpKey(req));
  if (!trackRate.allowed) {
    return res.status(429).json({ error: "ค้นหาบ่อยเกินไป กรุณารอสักครู่", code: "RATE_LIMITED", retry_after_s: trackRate.retry_after_s });
  }
  const identifier = String(req.body?.identifier || "").trim();
  const phone = trackingPrivacy.normalizeTrackingPhone(identifier);
  const bookingCode = /^CWF[A-Z0-9]{7}$/i.test(identifier) ? identifier.toUpperCase() : "";
  if (!phone && !bookingCode) return res.status(400).json({ error: "ไม่พบงาน" });
  const secret = getJwtSecret();
  if (!secret) return res.status(503).json({ error: "ระบบติดตามงานยังไม่พร้อมใช้งาน" });
  try {
    const result = phone
      ? await pool.query(
          `SELECT job_id, booking_code, appointment_datetime, job_type, job_status, job_zone, address_text
             FROM public.jobs
            WHERE regexp_replace(COALESCE(customer_phone, ''), '[^0-9]', '', 'g') = ANY($1::text[])
            ORDER BY COALESCE(appointment_datetime, created_at) DESC NULLS LAST, job_id DESC
            LIMIT 50`,
          [phone.match_digits],
        )
      : await pool.query(
          `SELECT job_id, booking_code, appointment_datetime, job_type, job_status, job_zone, address_text
             FROM public.jobs
            WHERE booking_code=$1
            ORDER BY job_id DESC
            LIMIT 2`,
          [bookingCode],
        );
    const rows = result.rows || [];
    if (!rows.length || (bookingCode && rows.length !== 1)) return res.status(404).json({ error: "ไม่พบงาน" });
    return res.json(trackingPrivacy.buildSafeTrackingLookupResponse(
      rows,
      phone ? "phone" : "booking_code",
      secret,
    ));
  } catch (error) {
    console.error("[public/track/lookup] failed", { code: String(error?.code || "LOOKUP_FAILED") });
    return res.status(500).json({ error: "ค้นหางานไม่สำเร็จ" });
  }
});



// =======================================
// ⭐ PUBLIC REVIEW (ลูกค้าให้คะแนน/รีวิว หลังปิดงาน)
// - ยืนยันด้วย booking_code หรือ token
// - จำกัด 1 รีวิวต่อ 1 job_id
// =======================================
app.post("/public/review", async (req, res) => {
  // A public WRITE authorised by a booking identifier. Policy:
  //   - A job that HAS a booking_token requires the EXACT token (the short,
  //     shareable booking_code alone is NOT a write credential — see the
  //     tracking privacy split). No downgrade to code+phone for tokened jobs.
  //   - A LEGACY job with no booking_token may be reviewed via booking_code +
  //     the customer's FULL phone (exact match after digit-normalisation),
  //     still requiring the job to be completed and not yet reviewed.
  // Every authorisation/eligibility failure returns the SAME generic error so
  // the endpoint never reveals whether the code, phone, or status was the
  // mismatch. Rate limited per client IP and per identifier. No PII/token in
  // any response.
  const GENERIC_REVIEW_ERROR = "ไม่สามารถส่งรีวิวได้ กรุณาตรวจสอบเลข/สถานะงานและข้อมูลยืนยันอีกครั้ง";
  const body = req.body || {};
  const token = String(body.token || body.booking_token || "").trim();
  const selectionReference = String(body.selection_ref || "").trim();
  const selection = selectionReference
    ? trackingPrivacy.verifyTrackingSelectionReference(selectionReference, getJwtSecret())
    : null;
  const code = String(body.booking_code || body.q || "").trim();
  const phoneDigits = String(body.customer_phone || "").replace(/\D/g, "");
  const star = Number(body.rating);
  const review_text = (body.review_text || "").toString().trim() || null;
  const complaint_text = (body.complaint_text || "").toString().trim() || null;

  if (!publicReviewIpRateLimiter.check(trackingPrivacy.clientIpKey(req)).allowed) {
    return res.status(429).json({ error: "ส่งรีวิวถี่เกินไป กรุณารอสักครู่", code: "RATE_LIMITED" });
  }
  if (!Number.isFinite(star) || star < 1 || star > 5) {
    return res.status(400).json({ error: "rating ต้องอยู่ระหว่าง 1-5" });
  }
  if ((selectionReference && !selection) || (!token && !selection && !code)) {
    return res.status(400).json({ error: GENERIC_REVIEW_ERROR });
  }
  // Per-identifier budget (defends one job's credential against many-IP
  // hammering). Selection ciphertext is randomized, so bind its bucket to the
  // already-verified job identity instead. Token/code behavior stays unchanged.
  const identifierKey = selection
    ? trackingPrivacy.selectionReviewLimiterKey(selection.job_id)
    : trackingPrivacy.publicReviewLimiterKey(token ? "token" : "code", token || code);
  if (!publicReviewKeyRateLimiter.check(identifierKey).allowed) {
    return res.status(429).json({ error: "ส่งรีวิวถี่เกินไป กรุณารอสักครู่", code: "RATE_LIMITED" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Look the job up by exactly one credential path — never `code OR token`,
    // which would let a code match a tokened job.
    let jr;
    if (token) {
      jr = await client.query(
        `SELECT job_id, job_status, technician_username, customer_rating, booking_token, customer_phone, canceled_at
           FROM public.jobs WHERE booking_token=$1 LIMIT 1 FOR UPDATE`,
        [token]
      );
    } else if (selection) {
      jr = await client.query(
        `SELECT job_id, job_status, technician_username, customer_rating, booking_token, customer_phone, canceled_at
           FROM public.jobs WHERE job_id=$1 LIMIT 1 FOR UPDATE`,
        [selection.job_id]
      );
    } else {
      jr = await client.query(
        `SELECT job_id, job_status, technician_username, customer_rating, booking_token, customer_phone, canceled_at
           FROM public.jobs WHERE booking_code=$1 LIMIT 1 FOR UPDATE`,
        [code]
      );
    }

    const job = jr.rows[0];
    // All authorisation failures collapse to one generic 400 (no oracle).
    const deny = () => { const e = new Error(GENERIC_REVIEW_ERROR); e.generic = true; throw e; };
    if (!job) deny();

    const jobHasToken = Boolean(String(job.booking_token || "").trim());
    if (token || selection) {
      // Exact-token and verified job-bound selection paths are already authorised.
    } else {
      // Legacy code path: only for jobs that genuinely have no token, and only
      // with the full phone matching exactly.
      if (jobHasToken) deny();
      const jobPhoneDigits = String(job.customer_phone || "").replace(/\D/g, "");
      if (!phoneDigits || phoneDigits.length < 9 || jobPhoneDigits !== phoneDigits) deny();
    }

    if (String(job.job_status || "").trim() !== "เสร็จแล้ว") deny();
    if (job.canceled_at) deny();
    if (job.customer_rating) deny();
    if (!job.technician_username) deny();

    await client.query(
      `INSERT INTO public.technician_reviews (job_id, technician_username, rating, review_text, complaint_text)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (job_id) DO NOTHING`,
      [job.job_id, job.technician_username, Math.round(star), review_text, complaint_text]
    );

    await client.query(
      `UPDATE public.jobs
       SET customer_rating=$1,
           customer_review=$2,
           customer_complaint=$3,
           reviewed_at=NOW()
       WHERE job_id=$4`,
      [Math.round(star), review_text, complaint_text, job.job_id]
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
    // No PII, token, or per-job confirmation data in the response.
    res.json({ success: true });
  } catch (e) {
    await client.query("ROLLBACK");
    // Generic authorisation/eligibility failures never reveal the mismatch;
    // only a genuine unexpected server error is a 500.
    if (e && e.generic) return res.status(400).json({ error: e.message });
    console.error("[public/review] failed", { code: String(e?.code || "REVIEW_FAILED") });
    return res.status(400).json({ error: "ไม่สามารถส่งรีวิวได้ กรุณาตรวจสอบเลข/สถานะงานและข้อมูลยืนยันอีกครั้ง" });
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

function setAiOfficeNoCache(res) {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "Surrogate-Control": "no-store",
  });
}

function aiOfficeNoCache(req, res, next) {
  setAiOfficeNoCache(res);
  next();
}

// Protected admin pages that also exist as root static files must be registered
// before express.static(ROOT_DIR), otherwise static serving can bypass auth.
app.get("/admin-partner-onboarding", requireAdminSession, (req, res) => res.sendFile(sendHtml("admin-partner-onboarding.html")));
app.get("/admin-partner-onboarding.html", requireAdminSession, (req, res) => res.sendFile(sendHtml("admin-partner-onboarding.html")));
app.get("/admin/homepage-cms", requireAdminSession, (req, res) => res.sendFile(sendHtml("admin-homepage-cms.html")));
app.get("/admin/homepage-cms.html", requireAdminSession, (req, res) => res.sendFile(sendHtml("admin-homepage-cms.html")));

// Legacy customer entry points must resolve before express.static so the old
// HTML applications can never render. Keep tracking credentials in the URL
// fragment of Customer App V2, never in its query string.
app.get(["/customer", "/customer.html"], (_req, res) => redirectLegacyCustomerPage(res, CUSTOMER_APP_BOOKING_URL));
app.get(["/register", "/register.html"], (_req, res) => redirectLegacyCustomerPage(res, CUSTOMER_APP_PROFILE_URL));
app.get(["/track", "/track.html"], (req, res) => redirectLegacyCustomerPage(res, legacyTrackingRedirectTarget(req)));

// Issue 314: versioned assets (?v=BUILD_ID) may be cached immutably; HTML,
// service workers and unversioned files must keep revalidating.
if (fs.existsSync(FRONTEND_DIR)) app.use(express.static(FRONTEND_DIR, staticOptions()));
app.use(express.static(ROOT_DIR, staticOptions()));

// ✅ รองรับ Refresh/Deep-link แบบ "ไม่ต้องมี .html" (กันรีเฟรชเด้งไปหน้าแรก)
// - ตัวอย่าง: /tech, /admin, /track, /customer
app.use(createPageRoutes({ sendHtml }));
// Admin landing: ใช้ V2 เป็นหลัก (หน้าเก่าเลิกใช้แล้ว)
app.get("/admin-add", (req, res) => res.sendFile(sendHtml("admin-add-v2.html")));
app.get("/admin-review", (req, res) => res.sendFile(sendHtml("admin-review-v2.html")));
app.get("/admin-queue", (req, res) => res.sendFile(sendHtml("admin-queue-v2.html")));
app.get("/admin-history", (req, res) => res.sendFile(sendHtml("admin-history-v2.html")));
// หน้า legacy เลิกใช้แล้ว ให้ redirect ไป V2
app.get("/edit-profile", (req, res) => res.sendFile(sendHtml("edit-profile.html")));
app.get("/tech", (req, res) => res.sendFile(sendHtml("tech.html")));
app.get("/partner-apply", (req, res) => res.sendFile(sendHtml("partner-apply.html")));
app.get("/partner-status", (req, res) => res.sendFile(sendHtml("partner-status.html")));
app.get("/partner-agreement", (req, res) => res.sendFile(sendHtml("partner-agreement.html")));
app.get("/partner-academy", (req, res) => res.sendFile(sendHtml("partner-academy.html")));
// ✅ หน้าใหม่: คำนวณราคาติดตั้งแอร์ (ลูกค้า)
app.get("/install-quote", (req, res) => res.sendFile(sendHtml("install-quote.html")));
// Canonical path: keep short URL, redirect direct-file access
app.get("/install-quote.html", (req, res) => res.redirect(302, "/install-quote"));
app.get("/home", (req, res) => res.sendFile(sendHtml("index.html")));

app.get("/admin-add-v2.html", (req, res) => res.sendFile(sendHtml("admin-add-v2.html")));
app.get("/admin-review-v2.html", (req, res) => res.sendFile(sendHtml("admin-review-v2.html")));
app.get("/admin-queue-v2.html", (req, res) => res.sendFile(sendHtml("admin-queue-v2.html")));
app.get("/admin-history-v2.html", (req, res) => res.sendFile(sendHtml("admin-history-v2.html")));
app.get("/edit-profile.html", (req, res) => res.sendFile(sendHtml("edit-profile.html")));
app.get("/tech.html", (req, res) => res.sendFile(sendHtml("tech.html")));
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

// Auto-apply the additive store buy-flow migrations on boot so no manual CLI
// step is needed — deploying/restarting the app is enough. Each migration is
// idempotent, advisory-locked, additive-only (no drop/delete/rewrite of
// existing data) and self-verified; any failure is logged and never blocks
// serving (the affected routes already return 503 until the schema exists) and
// is retried on the next boot.
function ensureStoreBuyMigrationsApplied() {
  try {
    const { runAll } = require("./scripts/run-store-buy-migrations");
    Promise.resolve(runAll())
      .then((code) => {
        if (code === 0) console.log("✅ store buy-flow migrations ensured");
        else console.error("⚠️ store buy-flow migrations not fully applied (will retry next boot)");
      })
      .catch((e) => console.error("⚠️ store buy-flow migration error:", e && e.message));
  } catch (e) {
    console.error("⚠️ store buy-flow migration bootstrap skipped:", e && e.message);
  }
}

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
        startUrgentFinalizerRunner();
        startArticleSyncRunner();
        ensureStoreBuyMigrationsApplied();
      });
      return;
    }
  } catch (e) {
    console.error("HTTPS init failed, fallback to HTTP:", e);
  }

  app.listen(PORT, HOST, () => {
    console.log(`🌐 HTTP CWF Server running at http://localhost:${PORT}`);
    startUrgentFinalizerRunner();
    startArticleSyncRunner();
    ensureStoreBuyMigrationsApplied();
  });
}

startServer();
