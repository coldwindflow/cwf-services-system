/**
 * CWF Backend (Express) - FIXED
 * - ‡∏£‡∏ß‡∏°‡∏ó‡∏∏‡∏Å route ‡πÉ‡∏´‡πâ‡∏ñ‡∏π‡∏Å‡∏ï‡πâ‡∏≠‡∏á (‡πÅ‡∏Å‡πâ syntax/‡∏ß‡∏á‡πÄ‡∏•‡πá‡∏ö‡∏´‡∏•‡∏∏‡∏î/‡πÇ‡∏Ñ‡πâ‡∏î‡πÅ‡∏ó‡∏£‡∏Å‡∏Å‡∏•‡∏≤‡∏á‡∏ö‡∏£‡∏£‡∏ó‡∏±‡∏î)
 * - ‡∏£‡∏≠‡∏á‡∏£‡∏±‡∏ö: booking_code CWF+7, public booking/track, forced/offer, accept_status, attendance,
 *          docs quote/receipt, profile requests, photos, checkin
 */

try {
  require("dotenv").config();
} catch (e) {
  console.warn("‚ö†Ô∏è dotenv not installed or failed to load:", e.message);
}

// =======================================
// üïí TIMEZONE (Fix: ‡πÄ‡∏ß‡∏•‡∏≤‡πÄ‡∏û‡∏µ‡πâ‡∏¢‡∏ô +7 ‡∏ä‡∏°.)
// - Server (‡πÄ‡∏ä‡πà‡∏ô Render) ‡∏°‡∏±‡∏Å‡πÉ‡∏ä‡πâ UTC
// - ‡πÅ‡∏ï‡πà‡∏£‡∏∞‡∏ö‡∏ö CWF ‡πÉ‡∏ä‡πâ‡πÄ‡∏ß‡∏•‡∏≤‡πÑ‡∏ó‡∏¢ (Asia/Bangkok)
// - ‡∏ï‡∏±‡πâ‡∏á‡∏Ñ‡πà‡∏≤ TZ ‡πÉ‡∏´‡πâ Node ‡πÄ‡∏û‡∏∑‡πà‡∏≠‡πÉ‡∏´‡πâ‡∏Å‡∏≤‡∏£ format ‡πÄ‡∏ß‡∏•‡∏≤‡πÉ‡∏ô‡∏ù‡∏±‡πà‡∏á server ‡∏ï‡∏£‡∏á
// =======================================
process.env.TZ = process.env.TZ || "Asia/Bangkok";

const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
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
const { createAdminPendingServiceEditor } = require("./server/services/booking/adminPendingServiceEditor");
const { registerPendingBookingServiceEditorRoutes } = require("./server/routes/admin/pendingBookingServiceEditor");
const { ensureBookingJobUnits } = require("./server/services/booking/bookingJobUnits");
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
// üîî Web Push Notifications (optional / fail-open)
// - ‡πÉ‡∏ä‡πâ‡πÅ‡∏à‡πâ‡∏á‡πÄ‡∏ï‡∏∑‡∏≠‡∏ô‡∏á‡∏≤‡∏ô‡πÄ‡∏Ç‡πâ‡∏≤‡πÉ‡∏´‡πâ‡∏ä‡πà‡∏≤‡∏á ‡πÅ‡∏°‡πâ‡∏õ‡∏¥‡∏î‡∏´‡∏ô‡πâ‡∏≤ PWA
// - ‡∏ñ‡πâ‡∏≤ package/ENV ‡πÑ‡∏°‡πà‡∏û‡∏£‡πâ‡∏≠‡∏° ‡∏£‡∏∞‡∏ö‡∏ö‡∏á‡∏≤‡∏ô‡πÄ‡∏î‡∏¥‡∏°‡∏ï‡πâ‡∏≠‡∏á‡πÑ‡∏°‡πà‡∏û‡∏±‡∏á
// =======================================
let webpush = null;
try {
  webpush = require("web-push");
} catch (e) {
  console.warn("‚ö†Ô∏è web-push not installed; push notifications disabled");
}

// =======================================
// üö© FEATURE FLAGS (safe / backward compatible)
// - ‡πÄ‡∏õ‡∏¥‡∏î/‡∏õ‡∏¥‡∏î‡∏Å‡∏≤‡∏£‡πÇ‡∏ä‡∏ß‡πå‡∏ó‡∏µ‡∏°‡∏ä‡πà‡∏≤‡∏á + ‡πÄ‡∏ö‡∏≠‡∏£‡πå‡πÇ‡∏ó‡∏£‡πÉ‡∏ô Tracking ‡πÅ‡∏ö‡∏ö‡πÑ‡∏°‡πà‡∏Å‡∏£‡∏∞‡∏ó‡∏ö‡∏Ç‡∏≠‡∏á‡πÄ‡∏î‡∏¥‡∏°
// - ‡∏Ñ‡πà‡∏≤‡πÄ‡∏£‡∏¥‡πà‡∏°‡∏ï‡πâ‡∏ô: ‡πÄ‡∏õ‡∏¥‡∏î (true) ‡∏ï‡∏≤‡∏° requirement ‡πÅ‡∏•‡∏∞‡∏¢‡∏±‡∏á‡∏ï‡πâ‡∏≠‡∏á‡∏ú‡πà‡∏≤‡∏ô‡∏•‡∏¥‡∏á‡∏Å‡πå tracking ‡∏ó‡∏µ‡πà‡∏ñ‡∏π‡∏Å‡∏ï‡πâ‡∏≠‡∏á‡πÄ‡∏ó‡πà‡∏≤‡∏ô‡∏±‡πâ‡∏ô
// =======================================
function envBool(name, defVal = false) {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  if (!v) return defVal;
  return ["1", "true", "yes", "on"].includes(v);
}

const FLAG_SHOW_TECH_TEAM_ON_TRACKING = envBool("SHOW_TECH_TEAM_ON_TRACKING", true);
const FLAG_SHOW_TECH_PHONE_ON_TRACKING = envBool("SHOW_TECH_PHONE_ON_TRACKING", true);

const ENABLE_AVAILABILITY_V2 = envBool("ENABLE_AVAILABILITY_V2", true);
// ‚úÖ Safe toggle: urgent offer flow (public booking + offers)
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
  catch (e) { console.warn("‚ö†Ô∏è web-push VAPID setup failed", e.message); }
}
const TRAVEL_BUFFER_MIN = jobTiming.TURNAROUND_BUFFER_MIN; // ‡∏ô‡∏≤‡∏ó‡∏µ/‡∏á‡∏≤‡∏ô (Travel Buffer)

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
// ‚òÅÔ∏è CLOUDINARY (optional / backward compatible)
// - ‡∏´‡∏≤‡∏Å‡∏ï‡∏±‡πâ‡∏á ENV ‡∏Ñ‡∏£‡∏ö ‡∏à‡∏∞‡∏≠‡∏±‡∏õ‡πÇ‡∏´‡∏•‡∏î‡∏£‡∏π‡∏õ‡∏Ç‡∏∂‡πâ‡∏ô Cloudinary ‡πÅ‡∏•‡πâ‡∏ß‡πÄ‡∏Å‡πá‡∏ö public_url ‡πÄ‡∏õ‡πá‡∏ô https://...
// - ‡∏ñ‡πâ‡∏≤‡πÑ‡∏°‡πà‡∏ï‡∏±‡πâ‡∏á ‡∏à‡∏∞ fallback ‡πÄ‡∏ã‡∏ü‡∏•‡∏á‡∏î‡∏¥‡∏™‡∏Å‡πå‡πÄ‡∏î‡∏¥‡∏° (/uploads)
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

  // ‡πÉ‡∏ä‡πâ data URI ‡πÄ‡∏û‡∏∑‡πà‡∏≠‡∏•‡∏î dependency (‡πÑ‡∏°‡πà‡∏ï‡πâ‡∏≠‡∏á‡πÉ‡∏ä‡πâ SDK/FormData)
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
// üß≠ GPS/Maps Resolver (safe)
// - ‡∏£‡∏≠‡∏á‡∏£‡∏±‡∏ö maps.app.goo.gl (short link)
// - ‡∏û‡∏¢‡∏≤‡∏¢‡∏≤‡∏°‡∏î‡∏∂‡∏á lat/lng ‡∏à‡∏≤‡∏Å URL ‡∏´‡∏£‡∏∑‡∏≠ HTML (best-effort)
// - ‡∏°‡∏µ allowlist + timeout + ‡∏à‡∏≥‡∏Å‡∏±‡∏î‡∏Ç‡∏ô‡∏≤‡∏î response ‡∏Å‡∏±‡∏ô SSRF/‡∏Ñ‡πâ‡∏≤‡∏á
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

  // 1) fetch ‡∏ï‡∏≤‡∏° redirect ‡πÄ‡∏û‡∏∑‡πà‡∏≠‡πÉ‡∏´‡πâ‡πÑ‡∏î‡πâ res.url (‡∏•‡∏¥‡∏á‡∏Å‡πå‡πÄ‡∏ï‡πá‡∏°)
  const res = await fetchWithTimeout(u.toString(), 6000, { method: "GET" });
  const finalUrl = res.url || u.toString();

  // 2) ‡∏û‡∏¢‡∏≤‡∏¢‡∏≤‡∏°‡∏î‡∏∂‡∏á‡∏à‡∏≤‡∏Å URL ‡∏Å‡πà‡∏≠‡∏ô
  const fromUrl = extractLatLngFromText(finalUrl);
  if (fromUrl) return { ...fromUrl, resolvedUrl: finalUrl };

  // 3) ‡∏ñ‡πâ‡∏≤‡∏¢‡∏±‡∏á‡πÑ‡∏°‡πà‡πÑ‡∏î‡πâ ‚Üí ‡∏≠‡πà‡∏≤‡∏ô HTML ‡πÅ‡∏•‡πâ‡∏ß‡∏´‡∏≤ pattern
  const ctype = String(res.headers.get("content-type") || "");
  let body = "";
  if (ctype.includes("text") || ctype.includes("html") || ctype.includes("json")) {
    // ‡∏à‡∏≥‡∏Å‡∏±‡∏î‡∏Ç‡∏ô‡∏≤‡∏î‡∏≠‡πà‡∏≤‡∏ô‡∏Å‡∏±‡∏ô‡∏Å‡∏¥‡∏ô‡πÅ‡∏£‡∏°
    const raw = await res.text();
    body = raw.slice(0, 200_000);
  }

  // 3.1) ‡∏´‡∏≤ @lat,lng ‡πÉ‡∏ô HTML
  const fromHtmlDirect = extractLatLngFromText(body);
  if (fromHtmlDirect) return { ...fromHtmlDirect, resolvedUrl: finalUrl };

  // 3.2) ‡∏´‡∏≤ canonical / maps URL ‡∏ó‡∏µ‡πà‡∏ù‡∏±‡∏á‡∏≠‡∏¢‡∏π‡πà
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
// üîê Public Login (LINE OAuth) - Production-ready (Minimal / No regression)
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

// üîê Customer JWT (LINE) helper (cookie: cwf_token)
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
// üîê App Login with LINE (Admin / Technician)
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
    if (!username || !password) return res.status(400).json({ error: '‡∏Å‡∏£‡∏∏‡∏ì‡∏≤‡∏Å‡∏£‡∏≠‡∏Å username ‡πÅ‡∏•‡∏∞ password ‡πÄ‡∏û‡∏∑‡πà‡∏≠‡∏ú‡∏π‡∏Å LINE' });
    const r = await pool.query(`SELECT username, role, password FROM public.users WHERE username=$1 LIMIT 1`, [username]);
    if (!(r.rows || []).length) return res.status(401).json({ error: '‡∏ä‡∏∑‡πà‡∏≠‡∏ú‡∏π‡πâ‡πÉ‡∏ä‡πâ‡∏´‡∏£‡∏∑‡∏≠‡∏£‡∏´‡∏±‡∏™‡∏ú‡πà‡∏≤‡∏ô‡∏ú‡∏¥‡∏î' });
    const passwordOk = await verifyPasswordAgainstStored(password, r.rows[0].password);
    if (!passwordOk) return res.status(401).json({ error: '‡∏ä‡∏∑‡πà‡∏≠‡∏ú‡∏π‡πâ‡πÉ‡∏ä‡πâ‡∏´‡∏£‡∏∑‡∏≠‡∏£‡∏´‡∏±‡∏™‡∏ú‡πà‡∏≤‡∏ô‡∏ú‡∏¥‡∏î' });
    await bindLineProfileToUser(r.rows[0].username, lineProfile, pool);
    clearCookie(res, 'cwf_line_bind');
    const login = await issueAppLoginForUser(res, r.rows[0].username);
    return res.json({ ok: true, username: login.username, role: login.role });
  } catch (e) {
    console.error('POST /auth/line/bind error:', e);
    return res.status(500).json({ error: '‡∏ú‡∏π‡∏Å LINE ‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  }
});

app.post('/auth/password-reset/request', async (req, res) => {
  try {
    const usernameOrPhone = String(req.body?.username || req.body?.phone || '').trim();
    const note = String(req.body?.note || '').trim().slice(0, 500);
    if (!usernameOrPhone) return res.status(400).json({ error: '‡∏Å‡∏£‡∏∏‡∏ì‡∏≤‡∏Å‡∏£‡∏≠‡∏Å‡πÄ‡∏ö‡∏≠‡∏£‡πå‡πÇ‡∏ó‡∏£‡∏´‡∏£‡∏∑‡∏≠ username' });
    await pool.query(
      `INSERT INTO public.password_reset_requests(username_or_phone, note, status, created_at)
       VALUES($1,$2,'requested',NOW())`,
      [usernameOrPhone, note || null]
    );
    return res.json({ ok: true, message: '‡∏™‡πà‡∏á‡∏Ñ‡∏≥‡∏Ç‡∏≠‡∏£‡∏µ‡πÄ‡∏ã‡πá‡∏ï‡∏£‡∏´‡∏±‡∏™‡∏ú‡πà‡∏≤‡∏ô‡πÅ‡∏•‡πâ‡∏ß ‡πÅ‡∏≠‡∏î‡∏°‡∏¥‡∏ô‡∏à‡∏∞‡∏ï‡∏£‡∏ß‡∏à‡∏™‡∏≠‡∏ö‡πÉ‡∏´‡πâ' });
  } catch (e) {
    console.error('POST /auth/password-reset/request error:', e);
    return res.status(500).json({ error: '‡∏™‡πà‡∏á‡∏Ñ‡∏≥‡∏Ç‡∏≠‡∏£‡∏µ‡πÄ‡∏ã‡πá‡∏ï‡∏£‡∏´‡∏±‡∏™‡∏ú‡πà‡∏≤‡∏ô‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
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

// ‚úÖ Public LINE config (debug only - no secrets)
// ‡πÉ‡∏ä‡πâ‡πÉ‡∏ô‡∏´‡∏ô‡πâ‡∏≤ customer debug panel ‡πÄ‡∏û‡∏∑‡πà‡∏≠‡πÄ‡∏ä‡πá‡∏Ñ‡∏ß‡πà‡∏≤ ENV/callback ‡∏ñ‡∏π‡∏Å‡∏ï‡πâ‡∏≠‡∏á‡∏´‡∏£‡∏∑‡∏≠‡πÑ‡∏°‡πà
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
// üìù Customer Register (minimal)
// - ‡∏ï‡πâ‡∏≠‡∏á login (LINE JWT)
// - ‡πÄ‡∏Å‡πá‡∏ö‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•‡∏û‡∏∑‡πâ‡∏ô‡∏ê‡∏≤‡∏ô‡πÑ‡∏ß‡πâ‡πÉ‡∏ä‡πâ‡∏Ñ‡∏£‡∏±‡πâ‡∏á‡∏´‡∏ô‡πâ‡∏≤
// =======================================
app.post('/public/register', requireCustomerJwt, async (req, res) => {
  try {
    const phone = String(req.body?.phone || '').trim();
    const address = String(req.body?.address || '').trim();
    const maps_url = String(req.body?.maps_url || '').trim();

    // ‚úÖ validate ‡πÄ‡∏ö‡∏≠‡∏£‡πå‡πÇ‡∏ó‡∏£‡∏Ç‡∏±‡πâ‡∏ô‡∏ï‡πà‡∏≥ (‡πÑ‡∏°‡πà strict ‡πÄ‡∏Å‡∏¥‡∏ô‡πÑ‡∏õ)
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
// üì∑ UPLOADS CONFIG (‡∏ï‡πâ‡∏≠‡∏á‡∏≠‡∏¢‡∏π‡πà‡∏Å‡πà‡∏≠‡∏ô route ‡∏ó‡∏µ‡πà‡πÉ‡∏ä‡πâ upload)
// - ‡πÅ‡∏Å‡πâ Deploy crash: "Cannot access 'upload' before initialization"
// =======================================
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }, // 12MB
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const PARTNER_APPLICATION_UPLOAD_DIR = path.join(UPLOAD_DIR, "partner_applications");
if (!fs.existsSync(PARTNER_APPLICATION_UPLOAD_DIR)) fs.mkdirSync(PARTNER_APPLICATION_UPLOAD_DIR, { recursive: true });

// =======================================
// üîê AUTH (session cookie) for Admin pages/APIs
// - cookie: cwf_auth (base64 JSON: {u,r,exp})
// - validate exp and verify role against DB
// - used for:
//   1) protect admin HTML (prevent back/cached access after logout)
//   2) protect /admin/* APIs
// =======================================


// =======================================
// üîê AUTH (minimal) for admin-only rank update
// - ‡∏£‡∏∞‡∏ö‡∏ö‡πÄ‡∏î‡∏¥‡∏°‡πÉ‡∏ä‡πâ localStorage/cookie (cwf_auth) ‡∏ù‡∏±‡πà‡∏á client
// - ‡∏™‡∏≥‡∏´‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô‡∏ô‡∏µ‡πâ: ‡∏Å‡∏±‡∏ô‡∏™‡∏¥‡∏ó‡∏ò‡∏¥‡πå "‡πÅ‡∏Å‡πâ‡πÅ‡∏£‡∏á‡∏Ñ‡πå" ‡∏ó‡∏µ‡πà‡∏ù‡∏±‡πà‡∏á server ‡∏î‡πâ‡∏ß‡∏¢‡∏Å‡∏≤‡∏£
//   1) ‡∏≠‡πà‡∏≤‡∏ô cookie cwf_auth (base64 JSON: {u,r,exp})
//   2) validate exp
//   3) ‡πÄ‡∏ä‡πá‡∏Ñ‡∏ã‡πâ‡∏≥‡∏Å‡∏±‡∏ö DB ‡∏ß‡πà‡∏≤ user ‡∏ô‡∏±‡πâ‡∏ô role=admin ‡∏à‡∏£‡∏¥‡∏á
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

    // cookie ‡∏≠‡∏≤‡∏à‡∏ñ‡∏π‡∏Å encode/quote ‡∏°‡∏≤‡πÑ‡∏î‡πâ (‡∏ö‡∏≤‡∏á browser/hosting)
    token = token.replace(/^"|"$/g, "");
    try { token = decodeURIComponent(token); } catch (_) {}

    // ‡∏£‡∏≠‡∏á‡∏£‡∏±‡∏ö‡∏ó‡∏±‡πâ‡∏á‡πÅ‡∏ö‡∏ö base64 JSON ‡πÅ‡∏•‡∏∞‡πÅ‡∏ö‡∏ö JSON ‡∏ï‡∏£‡∏á‡πÜ (‡∏Å‡∏±‡∏ô‡∏Ç‡∏≠‡∏á‡πÄ‡∏î‡∏¥‡∏°/‡∏Ç‡∏≠‡∏á‡∏´‡∏•‡∏∏‡∏î)
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
  if (["technician", "tech", "‡∏ä‡πà‡∏≤‡∏á"].includes(r)) return "technician";
  return r;
}

// =======================================
// üõ°Ô∏è Super Admin (Whitelist)
// - ‡∏ô‡∏¥‡∏¢‡∏≤‡∏° Super Admin ‡∏à‡∏≤‡∏Å ENV: SUPER_ADMIN_USERNAMES=USER1,USER2
// - ‡∏ñ‡πâ‡∏≤ ENV ‡∏ß‡πà‡∏≤‡∏á/‡πÑ‡∏°‡πà‡πÑ‡∏î‡πâ‡∏ï‡∏±‡πâ‡∏á: fallback ‡πÄ‡∏õ‡πá‡∏ô ['Super','S-arm'] ‡πÄ‡∏û‡∏∑‡πà‡∏≠‡πÑ‡∏°‡πà‡πÉ‡∏´‡πâ‡∏£‡∏∞‡∏ö‡∏ö‡∏ï‡∏±‡∏ô
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
const PAYOUT_DEDUCTION_WARNING = '‡πÄ‡∏°‡∏∑‡πà‡∏≠‡∏≠‡∏ô‡∏∏‡∏°‡∏±‡∏ï‡∏¥‡πÅ‡∏•‡πâ‡∏ß ‡∏£‡∏∞‡∏ö‡∏ö‡∏à‡∏∞‡∏´‡∏±‡∏Å‡∏à‡∏£‡∏¥‡∏á‡πÉ‡∏ô‡∏á‡∏ß‡∏î‡∏à‡πà‡∏≤‡∏¢‡∏ä‡πà‡∏≤‡∏á‡∏ú‡πà‡∏≤‡∏ô payout adjustment ‡πÅ‡∏ö‡∏ö audit ‡πÑ‡∏î‡πâ‡∏ó‡∏±‡∏ô‡∏ó‡∏µ';

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
    // IMPORTANT: ‡πÄ‡∏ä‡πá‡∏Ñ‡∏à‡∏≤‡∏Å actor (‡πÑ‡∏°‡πà‡πÉ‡∏ä‡πà effective) ‡πÄ‡∏û‡∏∑‡πà‡∏≠‡∏Å‡∏±‡∏ô‡∏¢‡∏Å‡∏£‡∏∞‡∏î‡∏±‡∏ö‡∏™‡∏¥‡∏ó‡∏ò‡∏¥‡πå‡∏ú‡πà‡∏≤‡∏ô impersonation
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
// üßë‚Äçüîß Technician Session Guard (for technician-only APIs)
// - allow admin actor when impersonating technician (effective role)
// =======================================
function isTechnicianRole(role) {
  const r = String(role || '').trim().toLowerCase();
  return ['technician', 'tech', '‡∏ä‡πà‡∏≤‡∏á', 'senior_technician', 'lead_technician'].includes(r);
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
// üîê Technician job ownership guard
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
    res.status(403).json({ error: '‡∏ä‡πà‡∏≤‡∏á‡∏Ñ‡∏ô‡∏ô‡∏µ‡πâ‡πÑ‡∏°‡πà‡πÑ‡∏î‡πâ‡∏≠‡∏¢‡∏π‡πà‡πÉ‡∏ô‡∏ó‡∏µ‡∏°‡∏Ç‡∏≠‡∏á‡∏á‡∏≤‡∏ô‡∏ô‡∏µ‡πâ', code: 'TECH_NOT_ASSIGNED' });
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
  clean_wall_normal: '‡∏•‡πâ‡∏≤‡∏á‡πÅ‡∏≠‡∏£‡πå‡∏ú‡∏ô‡∏±‡∏á‡∏õ‡∏Å‡∏ï‡∏¥',
  clean_wall_premium: '‡∏•‡πâ‡∏≤‡∏á‡πÅ‡∏≠‡∏£‡πå‡∏ú‡∏ô‡∏±‡∏á‡∏û‡∏£‡∏µ‡πÄ‡∏°‡∏µ‡∏¢‡∏°',
  clean_wall_hanging_coil: '‡∏•‡πâ‡∏≤‡∏á‡πÅ‡∏Ç‡∏ß‡∏ô‡∏Ñ‡∏≠‡∏¢‡∏•‡πå',
  clean_wall_overhaul: '‡∏ï‡∏±‡∏î‡∏•‡πâ‡∏≤‡∏á‡πÉ‡∏´‡∏ç‡πà',
  clean_ceiling_suspended: '‡∏•‡πâ‡∏≤‡∏á‡πÅ‡∏≠‡∏£‡πå‡πÅ‡∏Ç‡∏ß‡∏ô/‡πÄ‡∏õ‡∏•‡∏∑‡∏≠‡∏¢‡πÉ‡∏ï‡πâ‡∏ù‡πâ‡∏≤',
  clean_cassette_4way: '‡∏•‡πâ‡∏≤‡∏á‡πÅ‡∏≠‡∏£‡πå‡∏™‡∏µ‡πà‡∏ó‡∏¥‡∏®‡∏ó‡∏≤‡∏á',
  clean_duct_type: '‡∏•‡πâ‡∏≤‡∏á‡πÅ‡∏≠‡∏£‡πå‡∏ó‡πà‡∏≠‡∏•‡∏°',
  repair_diagnosis_basic: '‡∏ï‡∏£‡∏ß‡∏à‡πÄ‡∏ä‡πá‡∏Å‡∏≠‡∏≤‡∏Å‡∏≤‡∏£',
  repair_water_leak: '‡πÅ‡∏Å‡πâ‡∏ô‡πâ‡∏≥‡∏£‡∏±‡πà‡∏ß',
  repair_electrical_basic: '‡∏á‡∏≤‡∏ô‡πÑ‡∏ü‡∏ü‡πâ‡∏≤‡πÄ‡∏ö‡∏∑‡πâ‡∏≠‡∏á‡∏ï‡πâ‡∏ô',
  repair_refrigerant_basic: '‡πÄ‡∏ï‡∏¥‡∏°‡∏ô‡πâ‡∏≥‡∏¢‡∏≤/‡∏£‡∏∞‡∏ö‡∏ö‡∏ô‡πâ‡∏≥‡∏¢‡∏≤',
  repair_parts_replacement: '‡πÄ‡∏õ‡∏•‡∏µ‡πà‡∏¢‡∏ô‡∏≠‡∏∞‡πÑ‡∏´‡∏•‡πà',
  install_wall_standard: '‡∏ï‡∏¥‡∏î‡∏ï‡∏±‡πâ‡∏á‡πÅ‡∏≠‡∏£‡πå‡∏ú‡∏ô‡∏±‡∏á',
  install_condo: '‡∏ï‡∏¥‡∏î‡∏ï‡∏±‡πâ‡∏á‡∏Ñ‡∏≠‡∏ô‡πÇ‡∏î',
  install_relocation: '‡∏¢‡πâ‡∏≤‡∏¢‡πÅ‡∏≠‡∏£‡πå',
};

const PARTNER_EQUIPMENT_CHOICES = [
  '‡∏°‡∏µ‡∏Ñ‡∏£‡∏ö‡∏û‡∏£‡πâ‡∏≠‡∏°‡∏ó‡∏≥‡∏á‡∏≤‡∏ô',
  '‡∏õ‡∏±‡πä‡∏°‡∏ô‡πâ‡∏≥‡πÅ‡∏£‡∏á‡∏î‡∏±‡∏ô',
  '‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡∏â‡∏µ‡∏î‡∏ô‡πâ‡∏≥‡πÅ‡∏£‡∏á‡∏î‡∏±‡∏ô',
  '‡∏ú‡πâ‡∏≤‡πÉ‡∏ö‡∏£‡∏≠‡∏á‡∏ô‡πâ‡∏≥',
  '‡∏ñ‡∏±‡∏á‡∏£‡∏≠‡∏á‡∏ô‡πâ‡∏≥',
  '‡∏Å‡∏£‡∏∞‡∏ö‡∏≠‡∏Å‡∏â‡∏µ‡∏î‡∏ô‡πâ‡∏≥‡∏¢‡∏≤',
  '‡∏ô‡πâ‡∏≥‡∏¢‡∏≤‡∏•‡πâ‡∏≤‡∏á‡∏Ñ‡∏≠‡∏¢‡∏•‡πå',
  '‡πÅ‡∏õ‡∏£‡∏á‡∏•‡πâ‡∏≤‡∏á‡πÅ‡∏≠‡∏£‡πå',
  '‡∏ñ‡∏∏‡∏á‡∏•‡πâ‡∏≤‡∏á‡πÅ‡∏≠‡∏£‡πå',
  '‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡πÄ‡∏õ‡πà‡∏≤‡∏•‡∏°',
  '‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡∏î‡∏π‡∏î‡∏ù‡∏∏‡πà‡∏ô/‡∏î‡∏π‡∏î‡∏ô‡πâ‡∏≥',
  '‡∏ö‡∏±‡∏ô‡πÑ‡∏î',
  '‡∏™‡∏ß‡πà‡∏≤‡∏ô',
  '‡πÑ‡∏Ç‡∏Ñ‡∏ß‡∏á/‡∏ä‡∏∏‡∏î‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡∏°‡∏∑‡∏≠‡∏ä‡πà‡∏≤‡∏á',
  '‡∏õ‡∏£‡∏∞‡πÅ‡∏à/‡∏Ñ‡∏µ‡∏°/‡∏Ñ‡∏±‡∏ï‡πÄ‡∏ï‡∏≠‡∏£‡πå',
  '‡∏°‡∏±‡∏•‡∏ï‡∏¥‡∏°‡∏¥‡πÄ‡∏ï‡∏≠‡∏£‡πå',
  '‡πÅ‡∏Ñ‡∏•‡∏°‡∏õ‡πå‡∏°‡∏¥‡πÄ‡∏ï‡∏≠‡∏£‡πå',
  '‡πÄ‡∏Å‡∏à‡πå‡∏ß‡∏±‡∏î‡∏ô‡πâ‡∏≥‡∏¢‡∏≤‡πÅ‡∏≠‡∏£‡πå',
  '‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡∏ä‡∏±‡πà‡∏á‡∏ô‡πâ‡∏≥‡∏¢‡∏≤',
  '‡πÅ‡∏ß‡∏Ñ‡∏Ñ‡∏±‡πà‡∏°‡∏õ‡∏±‡πä‡∏°',
  '‡∏ñ‡∏±‡∏á‡∏ô‡πâ‡∏≥‡∏¢‡∏≤',
  '‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡πÄ‡∏ä‡∏∑‡πà‡∏≠‡∏°/‡∏ä‡∏∏‡∏î‡πÄ‡∏ä‡∏∑‡πà‡∏≠‡∏°‡∏ó‡πà‡∏≠‡∏ó‡∏≠‡∏á‡πÅ‡∏î‡∏á',
  '‡∏Ñ‡∏±‡∏ï‡πÄ‡∏ï‡∏≠‡∏£‡πå‡∏ï‡∏±‡∏î‡∏ó‡πà‡∏≠',
  '‡∏ö‡∏≤‡∏ô‡πÅ‡∏ü‡∏£‡πå',
  '‡∏ó‡∏≠‡∏£‡πå‡∏Ñ‡∏õ‡∏£‡∏∞‡πÅ‡∏à',
  '‡∏õ‡∏±‡πä‡∏°‡∏ô‡πâ‡∏≥‡∏ó‡∏¥‡πâ‡∏á',
  '‡∏≠‡∏∏‡∏õ‡∏Å‡∏£‡∏ì‡πå‡∏ï‡∏¥‡∏î‡∏ï‡∏±‡πâ‡∏á‡∏£‡∏≤‡∏á‡∏Ñ‡∏£‡∏≠‡∏ö‡∏ó‡πà‡∏≠',
  '‡∏ä‡∏∏‡∏î PPE / ‡∏ñ‡∏∏‡∏á‡∏°‡∏∑‡∏≠ / ‡πÅ‡∏ß‡πà‡∏ô‡∏ï‡∏≤',
  '‡∏¢‡∏π‡∏ô‡∏¥‡∏ü‡∏≠‡∏£‡πå‡∏°‡∏™‡∏∏‡∏†‡∏≤‡∏û‡∏û‡∏£‡πâ‡∏≠‡∏°‡πÄ‡∏Ç‡πâ‡∏≤‡∏´‡∏ô‡πâ‡∏≤‡∏á‡∏≤‡∏ô',
];

const BASIC_PARTNER_LESSONS = [
  '‡∏°‡∏≤‡∏ï‡∏£‡∏ê‡∏≤‡∏ô‡πÅ‡∏ö‡∏£‡∏ô‡∏î‡πå CWF',
  '‡∏Å‡∏≤‡∏£‡πÅ‡∏ï‡πà‡∏á‡∏Å‡∏≤‡∏¢‡πÅ‡∏•‡∏∞‡∏°‡∏≤‡∏£‡∏¢‡∏≤‡∏ó‡∏´‡∏ô‡πâ‡∏≤‡∏á‡∏≤‡∏ô',
  '‡∏Å‡∏≤‡∏£‡∏™‡∏∑‡πà‡∏≠‡∏™‡∏≤‡∏£‡∏Å‡∏±‡∏ö‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤',
  '‡∏Å‡∏≤‡∏£‡πÄ‡∏ä‡πá‡∏Å‡∏≠‡∏¥‡∏ô',
  '‡∏Å‡∏≤‡∏£‡∏ñ‡πà‡∏≤‡∏¢‡∏£‡∏π‡∏õ‡∏Å‡πà‡∏≠‡∏ô‡πÅ‡∏•‡∏∞‡∏´‡∏•‡∏±‡∏á‡∏á‡∏≤‡∏ô',
  '‡∏´‡πâ‡∏≤‡∏°‡πÄ‡∏õ‡∏•‡∏µ‡πà‡∏¢‡∏ô‡∏£‡∏≤‡∏Ñ‡∏≤‡πÄ‡∏≠‡∏á',
  '‡∏´‡πâ‡∏≤‡∏°‡∏£‡∏±‡∏ö‡πÄ‡∏á‡∏¥‡∏ô‡∏ô‡∏≠‡∏Å‡∏£‡∏∞‡∏ö‡∏ö',
  '‡∏ß‡∏¥‡∏ò‡∏µ‡∏õ‡∏¥‡∏î‡∏á‡∏≤‡∏ô',
  '‡∏Ñ‡∏ß‡∏≤‡∏°‡∏£‡∏±‡∏ö‡∏ú‡∏¥‡∏î‡∏ä‡∏≠‡∏ö‡∏á‡∏≤‡∏ô‡∏£‡∏±‡∏ö‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô',
  '‡∏Å‡∏ï‡∏¥‡∏Å‡∏≤‡∏á‡∏≤‡∏ô‡∏ó‡∏î‡∏•‡∏≠‡∏á',
];

const BASIC_PARTNER_LESSON_BODIES = [
  '‡∏£‡∏±‡∏Å‡∏©‡∏≤‡∏Ñ‡∏ß‡∏≤‡∏°‡∏ï‡∏£‡∏á‡πÄ‡∏ß‡∏•‡∏≤ ‡∏Ñ‡∏ß‡∏≤‡∏°‡∏™‡∏∏‡∏†‡∏≤‡∏û ‡∏Ñ‡∏ß‡∏≤‡∏°‡∏™‡∏∞‡∏≠‡∏≤‡∏î ‡πÅ‡∏•‡∏∞‡∏Ñ‡∏∏‡∏ì‡∏†‡∏≤‡∏û‡∏á‡∏≤‡∏ô‡∏ó‡∏∏‡∏Å‡∏Ñ‡∏£‡∏±‡πâ‡∏á ‡∏á‡∏≤‡∏ô‡∏Ç‡∏≠‡∏á‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏™‡∏∞‡∏ó‡πâ‡∏≠‡∏ô‡πÅ‡∏ö‡∏£‡∏ô‡∏î‡πå CWF ‡πÇ‡∏î‡∏¢‡∏ï‡∏£‡∏á ‡∏´‡∏≤‡∏Å‡πÄ‡∏à‡∏≠‡∏õ‡∏±‡∏ç‡∏´‡∏≤‡∏ï‡πâ‡∏≠‡∏á‡πÅ‡∏à‡πâ‡∏á‡πÅ‡∏≠‡∏î‡∏°‡∏¥‡∏ô‡∏Å‡πà‡∏≠‡∏ô‡∏ï‡∏±‡∏î‡∏™‡∏¥‡∏ô‡πÉ‡∏à‡πÅ‡∏ó‡∏ô‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó',
  '‡πÅ‡∏ï‡πà‡∏á‡∏Å‡∏≤‡∏¢‡∏™‡∏∏‡∏†‡∏≤‡∏û ‡πÉ‡∏™‡πà‡∏£‡∏≠‡∏á‡πÄ‡∏ó‡πâ‡∏≤‡∏ó‡∏µ‡πà‡πÄ‡∏´‡∏°‡∏≤‡∏∞‡∏Å‡∏±‡∏ö‡∏á‡∏≤‡∏ô ‡πÄ‡∏ï‡∏£‡∏µ‡∏¢‡∏°‡∏ú‡πâ‡∏≤‡∏õ‡∏π/‡∏≠‡∏∏‡∏õ‡∏Å‡∏£‡∏ì‡πå‡∏õ‡πâ‡∏≠‡∏á‡∏Å‡∏±‡∏ô‡∏û‡∏∑‡πâ‡∏ô‡∏ó‡∏µ‡πà‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤ ‡πÅ‡∏•‡∏∞‡∏´‡∏•‡∏µ‡∏Å‡πÄ‡∏•‡∏µ‡πà‡∏¢‡∏á‡∏Ñ‡∏≥‡∏û‡∏π‡∏î‡∏´‡∏£‡∏∑‡∏≠‡∏û‡∏§‡∏ï‡∏¥‡∏Å‡∏£‡∏£‡∏°‡∏ó‡∏µ‡πà‡∏ó‡∏≥‡πÉ‡∏´‡πâ‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡πÑ‡∏°‡πà‡∏™‡∏ö‡∏≤‡∏¢‡πÉ‡∏à',
  '‡∏≠‡∏ò‡∏¥‡∏ö‡∏≤‡∏¢‡∏Ç‡∏±‡πâ‡∏ô‡∏ï‡∏≠‡∏ô‡∏Å‡πà‡∏≠‡∏ô‡πÄ‡∏£‡∏¥‡πà‡∏°‡∏á‡∏≤‡∏ô ‡πÅ‡∏à‡πâ‡∏á‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏™‡∏µ‡πà‡∏¢‡∏á‡∏≠‡∏¢‡πà‡∏≤‡∏á‡∏ï‡∏£‡∏á‡πÑ‡∏õ‡∏ï‡∏£‡∏á‡∏°‡∏≤ ‡πÉ‡∏ä‡πâ‡∏†‡∏≤‡∏©‡∏≤‡∏™‡∏∏‡∏†‡∏≤‡∏û ‡πÅ‡∏•‡∏∞‡∏™‡πà‡∏á‡∏ï‡πà‡∏≠‡∏õ‡∏£‡∏∞‡πÄ‡∏î‡πá‡∏ô‡∏£‡∏≤‡∏Ñ‡∏≤/‡∏Ç‡πâ‡∏≠‡∏û‡∏¥‡∏û‡∏≤‡∏ó‡πÉ‡∏´‡πâ‡πÅ‡∏≠‡∏î‡∏°‡∏¥‡∏ô‡∏î‡∏π‡πÅ‡∏•',
  '‡πÄ‡∏°‡∏∑‡πà‡∏≠‡∏ñ‡∏∂‡∏á‡∏´‡∏ô‡πâ‡∏≤‡∏á‡∏≤‡∏ô‡πÉ‡∏´‡πâ‡πÄ‡∏ä‡πá‡∏Å‡∏≠‡∏¥‡∏ô‡πÉ‡∏ô‡∏£‡∏∞‡∏ö‡∏ö‡∏´‡∏£‡∏∑‡∏≠‡πÅ‡∏à‡πâ‡∏á‡πÅ‡∏≠‡∏î‡∏°‡∏¥‡∏ô‡∏ï‡∏≤‡∏°‡∏ä‡πà‡∏≠‡∏á‡∏ó‡∏≤‡∏á‡∏ó‡∏µ‡πà‡∏Å‡∏≥‡∏´‡∏ô‡∏î ‡πÄ‡∏û‡∏∑‡πà‡∏≠‡πÉ‡∏´‡πâ‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡πÅ‡∏•‡∏∞‡∏ó‡∏µ‡∏°‡∏ó‡∏£‡∏≤‡∏ö‡∏™‡∏ñ‡∏≤‡∏ô‡∏∞‡∏à‡∏£‡∏¥‡∏á',
  '‡∏ñ‡πà‡∏≤‡∏¢‡∏£‡∏π‡∏õ‡∏Å‡πà‡∏≠‡∏ô‡πÄ‡∏£‡∏¥‡πà‡∏°‡∏á‡∏≤‡∏ô ‡∏£‡∏∞‡∏´‡∏ß‡πà‡∏≤‡∏á‡∏á‡∏≤‡∏ô‡∏™‡∏≥‡∏Ñ‡∏±‡∏ç ‡πÅ‡∏•‡∏∞‡∏´‡∏•‡∏±‡∏á‡πÄ‡∏™‡∏£‡πá‡∏à‡∏á‡∏≤‡∏ô‡πÉ‡∏´‡πâ‡∏ä‡∏±‡∏î‡πÄ‡∏à‡∏ô ‡πÄ‡∏´‡πá‡∏ô‡∏ï‡∏±‡∏ß‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á ‡∏û‡∏∑‡πâ‡∏ô‡∏ó‡∏µ‡πà‡∏ó‡∏≥‡∏á‡∏≤‡∏ô ‡πÅ‡∏•‡∏∞‡∏´‡∏•‡∏±‡∏Å‡∏ê‡∏≤‡∏ô‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏£‡∏µ‡∏¢‡∏ö‡∏£‡πâ‡∏≠‡∏¢',
  '‡∏´‡πâ‡∏≤‡∏°‡πÄ‡∏õ‡∏•‡∏µ‡πà‡∏¢‡∏ô‡∏£‡∏≤‡∏Ñ‡∏≤‡πÄ‡∏≠‡∏á‡∏´‡∏£‡∏∑‡∏≠‡πÄ‡∏™‡∏ô‡∏≠‡∏£‡∏≤‡∏¢‡∏Å‡∏≤‡∏£‡πÄ‡∏û‡∏¥‡πà‡∏°‡πÄ‡∏≠‡∏á‡πÇ‡∏î‡∏¢‡πÑ‡∏°‡πà‡∏ú‡πà‡∏≤‡∏ô‡∏£‡∏∞‡∏ö‡∏ö CWF ‡∏£‡∏≤‡∏¢‡∏Å‡∏≤‡∏£‡πÄ‡∏û‡∏¥‡πà‡∏°‡∏ï‡πâ‡∏≠‡∏á‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö‡∏Å‡∏≤‡∏£‡∏¢‡∏∑‡∏ô‡∏¢‡∏±‡∏ô‡∏à‡∏≤‡∏Å‡πÅ‡∏≠‡∏î‡∏°‡∏¥‡∏ô‡∏Å‡πà‡∏≠‡∏ô',
  '‡∏´‡πâ‡∏≤‡∏°‡∏£‡∏±‡∏ö‡πÄ‡∏á‡∏¥‡∏ô‡∏™‡∏î/‡πÇ‡∏≠‡∏ô‡∏™‡πà‡∏ß‡∏ô‡∏ï‡∏±‡∏ß‡∏ô‡∏≠‡∏Å‡∏£‡∏∞‡∏ö‡∏ö CWF ‡πÄ‡∏ß‡πâ‡∏ô‡πÅ‡∏ï‡πà‡πÅ‡∏≠‡∏î‡∏°‡∏¥‡∏ô‡πÅ‡∏à‡πâ‡∏á‡πÄ‡∏õ‡πá‡∏ô‡∏•‡∏≤‡∏¢‡∏•‡∏±‡∏Å‡∏©‡∏ì‡πå‡∏≠‡∏±‡∏Å‡∏©‡∏£‡πÉ‡∏ô‡πÄ‡∏Ñ‡∏™‡∏ô‡∏±‡πâ‡∏ô ‡πÜ',
  '‡∏Å‡πà‡∏≠‡∏ô‡∏õ‡∏¥‡∏î‡∏á‡∏≤‡∏ô‡πÉ‡∏´‡πâ‡∏ï‡∏£‡∏ß‡∏à‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏£‡∏µ‡∏¢‡∏ö‡∏£‡πâ‡∏≠‡∏¢ ‡∏≠‡∏ò‡∏¥‡∏ö‡∏≤‡∏¢‡∏á‡∏≤‡∏ô‡∏ó‡∏µ‡πà‡∏ó‡∏≥ ‡∏ñ‡πà‡∏≤‡∏¢‡∏£‡∏π‡∏õ‡∏´‡∏•‡∏±‡∏á‡∏á‡∏≤‡∏ô ‡πÄ‡∏Å‡πá‡∏ö‡∏û‡∏∑‡πâ‡∏ô‡∏ó‡∏µ‡πà ‡πÅ‡∏•‡∏∞‡∏≠‡∏±‡∏õ‡πÄ‡∏î‡∏ï‡∏™‡∏ñ‡∏≤‡∏ô‡∏∞/‡∏´‡∏°‡∏≤‡∏¢‡πÄ‡∏´‡∏ï‡∏∏‡πÉ‡∏ô‡∏£‡∏∞‡∏ö‡∏ö‡πÉ‡∏´‡πâ‡∏Ñ‡∏£‡∏ö',
  '‡∏á‡∏≤‡∏ô‡∏ó‡∏µ‡πà‡∏°‡∏µ‡∏õ‡∏±‡∏ç‡∏´‡∏≤‡∏´‡∏•‡∏±‡∏á‡∏ö‡∏£‡∏¥‡∏Å‡∏≤‡∏£‡∏ï‡πâ‡∏≠‡∏á‡πÅ‡∏à‡πâ‡∏á CWF ‡πÅ‡∏•‡∏∞‡∏£‡πà‡∏ß‡∏°‡πÅ‡∏Å‡πâ‡πÑ‡∏Ç‡∏ï‡∏≤‡∏°‡∏ô‡πÇ‡∏¢‡∏ö‡∏≤‡∏¢‡∏£‡∏±‡∏ö‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô ‡∏´‡πâ‡∏≤‡∏°‡∏õ‡∏è‡∏¥‡πÄ‡∏™‡∏ò‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡πÄ‡∏≠‡∏á‡∏´‡∏£‡∏∑‡∏≠‡∏õ‡∏¥‡∏î‡∏Å‡∏≤‡∏£‡∏™‡∏∑‡πà‡∏≠‡∏™‡∏≤‡∏£',
  '‡∏á‡∏≤‡∏ô‡∏ó‡∏î‡∏•‡∏≠‡∏á‡πÉ‡∏ä‡πâ‡∏ß‡∏±‡∏î‡∏°‡∏≤‡∏ï‡∏£‡∏ê‡∏≤‡∏ô‡∏à‡∏£‡∏¥‡∏á ‡∏ó‡∏±‡πâ‡∏á‡πÄ‡∏ß‡∏•‡∏≤ ‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡πÅ‡∏ö‡∏ö ‡∏Å‡∏≤‡∏£‡∏™‡∏∑‡πà‡∏≠‡∏™‡∏≤‡∏£ ‡∏£‡∏π‡∏õ‡∏ñ‡πà‡∏≤‡∏¢ ‡∏Ñ‡∏∏‡∏ì‡∏†‡∏≤‡∏û‡∏á‡∏≤‡∏ô ‡πÅ‡∏•‡∏∞‡∏Ñ‡∏ß‡∏≤‡∏°‡∏£‡∏±‡∏ö‡∏ú‡∏¥‡∏î‡∏ä‡∏≠‡∏ö ‡∏ú‡πà‡∏≤‡∏ô‡∏á‡∏≤‡∏ô‡∏ó‡∏î‡∏•‡∏≠‡∏á‡πÅ‡∏•‡πâ‡∏ß‡πÅ‡∏≠‡∏î‡∏°‡∏¥‡∏ô‡∏¢‡∏±‡∏á‡∏ï‡πâ‡∏≠‡∏á‡∏≠‡∏ô‡∏∏‡∏°‡∏±‡∏ï‡∏¥ certification ‡∏£‡∏≤‡∏¢‡∏õ‡∏£‡∏∞‡πÄ‡∏†‡∏ó‡∏Å‡πà‡∏≠‡∏ô‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô‡∏à‡∏£‡∏¥‡∏á',
];


const CWF_PARTNER_CONTRACT_REAL_HTML = `
<section class="cwf-contract-template" data-contract="partner-v3-real-pdf-full">
  <div class="contract-hero">
    <h2>‡∏´‡∏ô‡∏±‡∏á‡∏™‡∏∑‡∏≠‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏ä‡πà‡∏≤‡∏á‡πÅ‡∏≠‡∏£‡πå Coldwindflow Air Services</h2>
    <p><strong>‡∏™‡∏≥‡∏´‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô‡∏•‡πâ‡∏≤‡∏á / ‡∏ã‡πà‡∏≠‡∏° / ‡∏ï‡∏¥‡∏î‡∏ï‡∏±‡πâ‡∏á‡πÅ‡∏≠‡∏£‡πå‡πÅ‡∏ö‡∏ö‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå - ‡∏â‡∏ö‡∏±‡∏ö‡πÉ‡∏ä‡πâ‡∏á‡∏≤‡∏ô‡∏à‡∏£‡∏¥‡∏á</strong></p>
    <p class="contract-alert">‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£‡∏ô‡∏µ‡πâ‡∏ô‡∏≥‡πÄ‡∏Ç‡πâ‡∏≤‡∏à‡∏≤‡∏Å‡πÑ‡∏ü‡∏•‡πå PDF ‡∏â‡∏ö‡∏±‡∏ö‡πÉ‡∏ä‡πâ‡∏á‡∏≤‡∏ô‡∏à‡∏£‡∏¥‡∏á‡∏Ç‡∏≠‡∏á CWF ‡πÅ‡∏•‡∏∞‡πÉ‡∏ä‡πâ‡πÄ‡∏õ‡πá‡∏ô‡∏Ç‡πâ‡∏≠‡∏Ñ‡∏ß‡∏≤‡∏°‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡∏ó‡∏µ‡πà‡∏ú‡∏π‡πâ‡∏™‡∏°‡∏±‡∏Ñ‡∏£‡∏≠‡πà‡∏≤‡∏ô‡∏Å‡πà‡∏≠‡∏ô‡∏•‡∏á‡∏ô‡∏≤‡∏°‡∏≠‡∏¥‡πÄ‡∏•‡πá‡∏Å‡∏ó‡∏£‡∏≠‡∏ô‡∏¥‡∏Å‡∏™‡πå</p>
  </div>

  <h3>‡∏ï‡∏≤‡∏£‡∏≤‡∏á‡πÄ‡∏£‡∏ó‡∏Ñ‡πà‡∏≤‡∏ï‡∏≠‡∏ö‡πÅ‡∏ó‡∏ô‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡πÅ‡∏ö‡∏ö‡∏Ç‡∏±‡πâ‡∏ô‡∏ö‡∏±‡∏ô‡πÑ‡∏î</h3>
  <table class="contract-rate-table"><thead><tr><th>‡∏õ‡∏£‡∏∞‡πÄ‡∏†‡∏ó‡∏á‡∏≤‡∏ô</th><th>‡∏Ç‡∏ô‡∏≤‡∏î BTU</th><th>‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡∏ó‡∏µ‡πà 1</th><th>‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡∏ó‡∏µ‡πà 2-3</th><th>‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡∏ó‡∏µ‡πà 4+</th></tr></thead><tbody>
    <tr><td>‡∏•‡πâ‡∏≤‡∏á‡∏õ‡∏Å‡∏ï‡∏¥</td><td>‡πÑ‡∏°‡πà‡πÄ‡∏Å‡∏¥‡∏ô 12,000</td><td>400</td><td>350</td><td>320</td></tr>
    <tr><td>‡∏•‡πâ‡∏≤‡∏á‡∏õ‡∏Å‡∏ï‡∏¥</td><td>18,000 ‡∏Ç‡∏∂‡πâ‡∏ô‡πÑ‡∏õ</td><td>450</td><td>400</td><td>350</td></tr>
    <tr><td>‡∏•‡πâ‡∏≤‡∏á‡∏û‡∏£‡∏µ‡πÄ‡∏°‡∏µ‡∏¢‡∏°</td><td>‡πÑ‡∏°‡πà‡πÄ‡∏Å‡∏¥‡∏ô 12,000</td><td>550</td><td>500</td><td>450</td></tr>
    <tr><td>‡∏•‡πâ‡∏≤‡∏á‡∏û‡∏£‡∏µ‡πÄ‡∏°‡∏µ‡∏¢‡∏°</td><td>18,000 ‡∏Ç‡∏∂‡πâ‡∏ô‡πÑ‡∏õ</td><td>700</td><td>650</td><td>600</td></tr>
    <tr><td>‡πÅ‡∏Ç‡∏ß‡∏ô‡∏Ñ‡∏≠‡∏¢‡∏•‡πå</td><td>‡πÑ‡∏°‡πà‡πÄ‡∏Å‡∏¥‡∏ô 12,000</td><td>850</td><td>800</td><td>750</td></tr>
    <tr><td>‡πÅ‡∏Ç‡∏ß‡∏ô‡∏Ñ‡∏≠‡∏¢‡∏•‡πå</td><td>18,000 ‡∏Ç‡∏∂‡πâ‡∏ô‡πÑ‡∏õ</td><td>1,050</td><td>1,000</td><td>950</td></tr>
    <tr><td>‡∏ï‡∏±‡∏î‡∏•‡πâ‡∏≤‡∏á‡πÉ‡∏´‡∏ç‡πà</td><td>‡πÑ‡∏°‡πà‡πÄ‡∏Å‡∏¥‡∏ô 12,000</td><td>1,200</td><td>1,100</td><td>1,000</td></tr>
    <tr><td>‡∏ï‡∏±‡∏î‡∏•‡πâ‡∏≤‡∏á‡πÉ‡∏´‡∏ç‡πà</td><td>18,000 ‡∏Ç‡∏∂‡πâ‡∏ô‡πÑ‡∏õ</td><td>1,450</td><td>1,350</td><td>1,250</td></tr>
  </tbody></table>

  <div class="contract-full-text">
<p class="contract-lead"><strong>‡∏´‡∏ô‡∏±‡∏á‡∏™‡∏∑‡∏≠‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏ä‡πà‡∏≤‡∏á‡πÅ‡∏≠‡∏£‡πå</strong></p>
<p class="contract-lead"><strong>Coldwindflow Air Services</strong></p>
<p class="contract-lead"><strong>‡∏™‡∏≥‡∏´‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô‡∏•‡πâ‡∏≤‡∏á / ‡∏ã‡πà‡∏≠‡∏° / ‡∏ï‡∏¥‡∏î‡∏ï‡∏±‡πâ‡∏á‡πÅ‡∏≠‡∏£‡πå‡πÅ‡∏ö‡∏ö‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå - ‡∏â‡∏ö‡∏±‡∏ö‡πÉ‡∏ä‡πâ‡∏á‡∏≤‡∏ô‡∏à‡∏£‡∏¥‡∏á</strong></p>
<p>‡πÄ‡∏•‡∏Ç‡∏ó‡∏µ‡πà‡∏™‡∏±‡∏ç‡∏ç‡∏≤: CWF-PARTNER-..............</p>
<p>‡∏ß‡∏±‡∏ô‡∏ó‡∏µ‡πà‡∏ó‡∏≥‡∏™‡∏±‡∏ç‡∏ç‡∏≤: ........ / ........ / ........</p>
<p>‡∏ß‡∏±‡∏ô‡∏ó‡∏µ‡πà‡πÄ‡∏£‡∏¥‡πà‡∏°‡∏°‡∏µ‡∏ú‡∏•: ........ / ........ / ........</p>
<p>‡∏™‡∏ñ‡∏≤‡∏ô‡∏ó‡∏µ‡πà‡∏ó‡∏≥‡∏™‡∏±‡∏ç‡∏ç‡∏≤: ................................................</p>
<p>‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£‡∏â‡∏ö‡∏±‡∏ö‡∏ô‡∏µ‡πâ‡πÄ‡∏õ‡πá‡∏ô‡∏´‡∏ô‡∏±‡∏á‡∏™‡∏∑‡∏≠‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡∏™‡∏≥‡∏´‡∏£‡∏±‡∏ö‡∏Å‡∏≤‡∏£‡∏£‡πà‡∏ß‡∏°‡∏á‡∏≤‡∏ô‡∏£‡∏∞‡∏´‡∏ß‡πà‡∏≤‡∏á Coldwindflow Air Services ‡πÅ‡∏•‡∏∞‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏ä‡πà‡∏≤‡∏á‡πÅ‡∏≠‡∏£‡πå</p>
<p>‡πÇ‡∏î‡∏¢‡∏°‡∏µ‡∏ú‡∏•‡πÄ‡∏°‡∏∑‡πà‡∏≠‡∏Ñ‡∏π‡πà‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡∏ó‡∏±‡πâ‡∏á‡∏™‡∏≠‡∏á‡∏ù‡πà‡∏≤‡∏¢‡∏•‡∏á‡∏ô‡∏≤‡∏°‡πÄ‡∏£‡∏µ‡∏¢‡∏ö‡∏£‡πâ‡∏≠‡∏¢‡πÅ‡∏•‡πâ‡∏ß ‡∏Ñ‡∏£‡∏≠‡∏ö‡∏Ñ‡∏•‡∏∏‡∏°‡∏Ç‡∏≠‡∏ö‡πÄ‡∏Ç‡∏ï‡∏á‡∏≤‡∏ô ‡∏°‡∏≤‡∏ï‡∏£‡∏ê‡∏≤‡∏ô‡∏á‡∏≤‡∏ô ‡πÄ‡∏£‡∏ó‡∏Ñ‡πà‡∏≤‡∏ï‡∏≠‡∏ö‡πÅ‡∏ó‡∏ô‡πÅ‡∏ö‡∏ö‡∏Ç‡∏±‡πâ‡∏ô‡∏ö‡∏±‡∏ô‡πÑ‡∏î‡πÄ‡∏£‡∏¥‡πà‡∏°‡∏ï‡πâ‡∏ô‡∏ó‡∏µ‡πà 400 ‡∏ö‡∏≤‡∏ó</p>
<p>‡πÄ‡∏á‡∏∑‡πà‡∏≠‡∏ô‡πÑ‡∏Ç‡∏†‡∏≤‡∏©‡∏µ‡∏´‡∏±‡∏Å ‡∏ì ‡∏ó‡∏µ‡πà‡∏à‡πà‡∏≤‡∏¢ ‡πÄ‡∏á‡∏¥‡∏ô‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢ 5,000 ‡∏ö‡∏≤‡∏ó ‡∏Å‡∏ï‡∏¥‡∏Å‡∏≤‡∏Å‡∏≤‡∏£‡∏¢‡∏Å‡πÄ‡∏•‡∏¥‡∏Å‡∏á‡∏≤‡∏ô / ‡∏ó‡∏¥‡πâ‡∏á‡∏á‡∏≤‡∏ô</p>
<p>‡πÅ‡∏•‡∏∞‡∏Ç‡πâ‡∏≠‡∏Å‡∏≥‡∏´‡∏ô‡∏î‡πÉ‡∏ô‡∏Å‡∏≤‡∏£‡πÉ‡∏ä‡πâ‡∏ó‡∏£‡∏±‡∏û‡∏¢‡πå‡∏™‡∏¥‡∏ô‡πÅ‡∏•‡∏∞‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•‡∏Ç‡∏≠‡∏á‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó</p>
<h3>1. ‡∏Ñ‡∏π‡πà‡∏™‡∏±‡∏ç‡∏ç‡∏≤</h3>
<p>‡∏ù‡πà‡∏≤‡∏¢‡∏ú‡∏π‡πâ‡∏ß‡πà‡∏≤‡∏à‡πâ‡∏≤‡∏á / ‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó</p>
<p class="contract-lead"><strong>Coldwindflow Air Services</strong></p>
<p>‡πÄ‡∏à‡πâ‡∏≤‡∏Ç‡∏≠‡∏á/‡∏ú‡∏π‡πâ‡∏°‡∏µ‡∏≠‡∏≥‡∏ô‡∏≤‡∏à: ‡∏ô‡∏≤‡∏¢ ‡∏™‡∏∏‡∏ó‡∏ò‡∏¥‡∏û‡∏á‡∏©‡πå ‡∏®‡∏£‡∏µ‡∏ß‡∏≤‡∏£‡∏¥‡∏ô‡∏ó‡∏£‡πå</p>
<p>‡∏ó‡∏µ‡πà‡∏≠‡∏¢‡∏π‡πà: 23/61 ‡∏ñ.‡∏û‡∏∂‡πà‡∏á‡∏°‡∏µ 50 ‡πÅ‡∏Ç‡∏ß‡∏á‡∏ö‡∏≤‡∏á‡∏à‡∏≤‡∏Å ‡πÄ‡∏Ç‡∏ï‡∏û‡∏£‡∏∞‡πÇ‡∏Ç‡∏ô‡∏á ‡∏Å‡∏£‡∏∏‡∏á‡πÄ‡∏ó‡∏û‡∏Ø</p>
<p>10260</p>
<p>‡πÇ‡∏ó‡∏£: 098-877-7321</p>
<p>‡∏ù‡πà‡∏≤‡∏¢‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏ä‡πà‡∏≤‡∏á</p>
<p>‡∏ä‡∏∑‡πà‡∏≠-‡∏ô‡∏≤‡∏°‡∏™‡∏Å‡∏∏‡∏•: ....................................................</p>
<p>‡πÄ‡∏•‡∏Ç‡∏ö‡∏±‡∏ï‡∏£‡∏õ‡∏£‡∏∞‡∏ä‡∏≤‡∏ä‡∏ô: ...........................................</p>
<p>‡∏ó‡∏µ‡πà‡∏≠‡∏¢‡∏π‡πà: ................................................................</p>
<p>‡πÇ‡∏ó‡∏£: ........................ LINE: ........................</p>
<p>‡∏ú‡∏π‡πâ‡∏ï‡∏¥‡∏î‡∏ï‡πà‡∏≠‡∏â‡∏∏‡∏Å‡πÄ‡∏â‡∏¥‡∏ô: ........................ ‡πÇ‡∏ó‡∏£: ........................</p>
<h3>2. ‡∏•‡∏±‡∏Å‡∏©‡∏ì‡∏∞‡∏Å‡∏≤‡∏£‡∏£‡πà‡∏ß‡∏°‡∏á‡∏≤‡∏ô</h3>
<ul>
<li>‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏ä‡πà‡∏≤‡∏á‡∏°‡∏µ‡∏™‡∏ñ‡∏≤‡∏ô‡∏∞‡πÄ‡∏õ‡πá‡∏ô‡∏ú‡∏π‡πâ‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô‡∏ö‡∏£‡∏¥‡∏Å‡∏≤‡∏£‡∏≠‡∏¥‡∏™‡∏£‡∏∞ ‡πÑ‡∏°‡πà‡πÉ‡∏ä‡πà‡∏û‡∏ô‡∏±‡∏Å‡∏á‡∏≤‡∏ô‡∏õ‡∏£‡∏∞‡∏à‡∏≥‡∏Ç‡∏≠‡∏á‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó ‡πÄ‡∏ß‡πâ‡∏ô‡πÅ‡∏ï‡πà‡∏°‡∏µ‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡∏≠‡∏∑‡πà‡∏ô‡∏£‡∏∞‡∏ö‡∏∏‡πÄ‡∏õ‡πá‡∏ô‡∏•‡∏≤‡∏¢‡∏•‡∏±‡∏Å‡∏©‡∏ì‡πå‡∏≠‡∏±‡∏Å‡∏©‡∏£</li>
<li>‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡πÄ‡∏õ‡πá‡∏ô‡∏ú‡∏π‡πâ‡∏à‡∏±‡∏î‡∏´‡∏≤‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤ ‡∏õ‡∏£‡∏∞‡∏™‡∏≤‡∏ô‡∏á‡∏≤‡∏ô ‡πÅ‡∏à‡πâ‡∏á‡∏£‡∏≤‡∏¢‡∏•‡∏∞‡πÄ‡∏≠‡∏µ‡∏¢‡∏î‡∏á‡∏≤‡∏ô ‡∏Å‡∏≥‡∏´‡∏ô‡∏î‡∏°‡∏≤‡∏ï‡∏£‡∏ê‡∏≤‡∏ô‡∏á‡∏≤‡∏ô ‡πÅ‡∏•‡∏∞‡∏ï‡∏£‡∏ß‡∏à‡∏™‡∏≠‡∏ö‡∏Ñ‡∏∏‡∏ì‡∏†‡∏≤‡∏û‡∏á‡∏≤‡∏ô‡∏Å‡πà‡∏≠‡∏ô‡∏à‡πà‡∏≤‡∏¢‡∏Ñ‡πà‡∏≤‡∏ï‡∏≠‡∏ö‡πÅ‡∏ó‡∏ô</li>
<li>‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏ä‡πà‡∏≤‡∏á‡∏°‡∏µ‡∏´‡∏ô‡πâ‡∏≤‡∏ó‡∏µ‡πà‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô‡∏ï‡∏≤‡∏°‡∏ó‡∏µ‡πà‡∏ï‡∏Å‡∏•‡∏á ‡∏õ‡∏è‡∏¥‡∏ö‡∏±‡∏ï‡∏¥‡∏á‡∏≤‡∏ô‡πÉ‡∏´‡πâ‡πÄ‡∏™‡∏£‡πá‡∏à‡∏ï‡∏≤‡∏°‡∏°‡∏≤‡∏ï‡∏£‡∏ê‡∏≤‡∏ô ‡πÅ‡∏•‡∏∞‡∏£‡∏±‡∏ö‡∏ú‡∏¥‡∏î‡∏ä‡∏≠‡∏ö‡∏ï‡πà‡∏≠‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏ó‡∏µ‡πà‡πÄ‡∏Å‡∏¥‡∏î‡∏à‡∏≤‡∏Å‡∏Ñ‡∏ß‡∏≤‡∏°‡∏õ‡∏£‡∏∞‡∏°‡∏≤‡∏ó ‡∏Å‡∏≤‡∏£‡∏•‡∏∞‡πÄ‡∏•‡∏¢‡∏´‡∏ô‡πâ‡∏≤‡∏ó‡∏µ‡πà</li>
</ul>
<p>‡∏´‡∏£‡∏∑‡∏≠‡∏Å‡∏≤‡∏£‡∏ú‡∏¥‡∏î‡πÄ‡∏á‡∏∑‡πà‡∏≠‡∏ô‡πÑ‡∏Ç‡∏Ç‡∏≠‡∏á‡∏ï‡∏ô</p>
<ul>
<li>‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏ï‡πâ‡∏≠‡∏á‡∏£‡∏±‡∏ö‡∏ú‡∏¥‡∏î‡∏ä‡∏≠‡∏ö‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡∏°‡∏∑‡∏≠ ‡∏Ñ‡πà‡∏≤‡πÄ‡∏î‡∏¥‡∏ô‡∏ó‡∏≤‡∏á ‡∏Ñ‡πà‡∏≤‡πÉ‡∏ä‡πâ‡∏à‡πà‡∏≤‡∏¢‡∏™‡πà‡∏ß‡∏ô‡∏ï‡∏±‡∏ß ‡∏†‡∏≤‡∏©‡∏µ ‡πÅ‡∏•‡∏∞‡∏Ñ‡πà‡∏≤‡πÉ‡∏ä‡πâ‡∏à‡πà‡∏≤‡∏¢‡∏≠‡∏∑‡πà‡∏ô‡∏Ç‡∏≠‡∏á‡∏ï‡∏ô‡πÄ‡∏≠‡∏á ‡πÄ‡∏ß‡πâ‡∏ô‡πÅ‡∏ï‡πà‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏ï‡∏Å‡∏•‡∏á‡∏£‡∏±‡∏ö‡∏ú‡∏¥‡∏î‡∏ä‡∏≠‡∏ö‡πÄ‡∏õ‡πá‡∏ô‡∏£‡∏≤‡∏¢‡∏á‡∏≤‡∏ô</li>
</ul>
<h3>3. ‡∏Ç‡∏≠‡∏ö‡πÄ‡∏Ç‡∏ï‡∏á‡∏≤‡∏ô‡∏ó‡∏µ‡πà‡∏£‡∏±‡∏ö</h3>
<ul>
<li>‡∏á‡∏≤‡∏ô‡∏•‡πâ‡∏≤‡∏á‡πÅ‡∏≠‡∏£‡πå‡∏õ‡∏Å‡∏ï‡∏¥ ‡∏•‡πâ‡∏≤‡∏á‡∏û‡∏£‡∏µ‡πÄ‡∏°‡∏µ‡∏¢‡∏° ‡∏•‡πâ‡∏≤‡∏á‡πÅ‡∏ö‡∏ö‡πÅ‡∏Ç‡∏ß‡∏ô‡∏Ñ‡∏≠‡∏¢‡∏•‡πå ‡∏ï‡∏±‡∏î‡∏•‡πâ‡∏≤‡∏á‡πÉ‡∏´‡∏ç‡πà ‡∏á‡∏≤‡∏ô‡∏ã‡πà‡∏≠‡∏° ‡∏á‡∏≤‡∏ô‡∏ï‡∏¥‡∏î‡∏ï‡∏±‡πâ‡∏á ‡∏´‡∏£‡∏∑‡∏≠‡∏ö‡∏£‡∏¥‡∏Å‡∏≤‡∏£‡∏≠‡∏∑‡πà‡∏ô‡∏ó‡∏µ‡πà‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏°‡∏≠‡∏ö‡∏´‡∏°‡∏≤‡∏¢‡πÄ‡∏õ‡πá‡∏ô‡∏£‡∏≤‡∏¢‡∏á‡∏≤‡∏ô</li>
<li>‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏ï‡πâ‡∏≠‡∏á‡∏ï‡∏£‡∏ß‡∏à‡∏™‡∏≠‡∏ö‡∏£‡∏≤‡∏¢‡∏•‡∏∞‡πÄ‡∏≠‡∏µ‡∏¢‡∏î‡∏á‡∏≤‡∏ô ‡πÄ‡∏ß‡∏•‡∏≤ ‡∏™‡∏ñ‡∏≤‡∏ô‡∏ó‡∏µ‡πà ‡∏à‡∏≥‡∏ô‡∏ß‡∏ô‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á ‡∏õ‡∏£‡∏∞‡πÄ‡∏†‡∏ó‡∏á‡∏≤‡∏ô ‡πÄ‡∏á‡∏∑‡πà‡∏≠‡∏ô‡πÑ‡∏Ç‡∏´‡∏ô‡πâ‡∏≤‡∏á‡∏≤‡∏ô ‡πÅ‡∏•‡∏∞‡∏Ñ‡πà‡∏≤‡∏ï‡∏≠‡∏ö‡πÅ‡∏ó‡∏ô‡∏Å‡πà‡∏≠‡∏ô‡∏Å‡∏î‡∏¢‡∏∑‡∏ô‡∏¢‡∏±‡∏ô‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô</li>
<li>‡πÄ‡∏°‡∏∑‡πà‡∏≠‡∏¢‡∏∑‡∏ô‡∏¢‡∏±‡∏ô‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô‡πÅ‡∏•‡πâ‡∏ß ‡∏ï‡πâ‡∏≠‡∏á‡πÄ‡∏Ç‡πâ‡∏≤‡∏´‡∏ô‡πâ‡∏≤‡∏á‡∏≤‡∏ô‡∏ï‡∏≤‡∏°‡∏ô‡∏±‡∏î‡∏´‡∏°‡∏≤‡∏¢ ‡∏´‡∏≤‡∏Å‡∏°‡∏µ‡πÄ‡∏´‡∏ï‡∏∏‡∏à‡∏≥‡πÄ‡∏õ‡πá‡∏ô‡∏ï‡πâ‡∏≠‡∏á‡∏£‡∏µ‡∏ö‡πÅ‡∏à‡πâ‡∏á‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏ó‡∏±‡∏ô‡∏ó‡∏µ ‡πÄ‡∏û‡∏∑‡πà‡∏≠‡πÉ‡∏´‡πâ‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏à‡∏±‡∏î‡∏Å‡∏≤‡∏£‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡πÅ‡∏•‡∏∞‡∏ó‡∏µ‡∏°‡∏ó‡∏î‡πÅ‡∏ó‡∏ô‡πÑ‡∏î‡πâ‡∏ó‡∏±‡∏ô‡πÄ‡∏ß‡∏•‡∏≤</li>
<li>‡∏´‡∏≤‡∏Å‡∏û‡∏ö‡∏ß‡πà‡∏≤‡∏£‡∏≤‡∏¢‡∏•‡∏∞‡πÄ‡∏≠‡∏µ‡∏¢‡∏î‡∏á‡∏≤‡∏ô‡∏à‡∏£‡∏¥‡∏á‡πÑ‡∏°‡πà‡∏ï‡∏£‡∏á‡∏Å‡∏±‡∏ö‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•‡∏ó‡∏µ‡πà‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö ‡∏ï‡πâ‡∏≠‡∏á‡πÅ‡∏à‡πâ‡∏á‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏Å‡πà‡∏≠‡∏ô‡πÄ‡∏£‡∏¥‡πà‡∏°‡∏á‡∏≤‡∏ô‡∏´‡∏£‡∏∑‡∏≠‡∏Å‡πà‡∏≠‡∏ô‡πÄ‡∏™‡∏ô‡∏≠‡∏Ñ‡πà‡∏≤‡πÉ‡∏ä‡πâ‡∏à‡πà‡∏≤‡∏¢‡πÄ‡∏û‡∏¥‡πà‡∏°‡∏Å‡∏±‡∏ö‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤</li>
</ul>
<h3>4. ‡πÄ‡∏£‡∏ó‡∏Ñ‡πà‡∏≤‡∏ï‡∏≠‡∏ö‡πÅ‡∏ó‡∏ô‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡πÅ‡∏ö‡∏ö‡∏Ç‡∏±‡πâ‡∏ô‡∏ö‡∏±‡∏ô‡πÑ‡∏î</h3>
<p>‡∏´‡∏•‡∏±‡∏Å‡∏Å‡∏≤‡∏£‡∏™‡∏≥‡∏Ñ‡∏±‡∏ç: ‡πÄ‡∏£‡∏ó‡∏ô‡∏µ‡πâ‡πÄ‡∏õ‡πá‡∏ô ‡πÄ‡∏£‡∏ó‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡πÄ‡∏ó‡πà‡∏≤‡∏ô‡∏±‡πâ‡∏ô ‡πÑ‡∏°‡πà‡πÉ‡∏ä‡πà‡πÄ‡∏£‡∏ó‡∏ó‡∏µ‡πà‡∏à‡∏∞‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó ‡πÄ‡∏£‡∏¥‡πà‡∏°‡∏ï‡πâ‡∏ô‡∏ó‡∏µ‡πà 400 ‡∏ö‡∏≤‡∏ó ‡∏™‡∏≥‡∏´‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô‡∏•‡πâ‡∏≤‡∏á‡∏õ‡∏Å‡∏ï‡∏¥ ‡πÑ‡∏°‡πà‡πÄ‡∏Å‡∏¥‡∏ô 12,000 BTU ‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡∏ó‡∏µ‡πà 1</p>
<p>‡πÅ‡∏•‡∏∞‡∏õ‡∏£‡∏±‡∏ö‡πÄ‡∏õ‡πá‡∏ô‡∏Ç‡∏±‡πâ‡∏ô‡∏ö‡∏±‡∏ô‡πÑ‡∏î‡∏ï‡∏≤‡∏°‡∏à‡∏≥‡∏ô‡∏ß‡∏ô‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡πÉ‡∏ô‡∏´‡∏ô‡πâ‡∏≤‡∏á‡∏≤‡∏ô‡πÄ‡∏î‡∏µ‡∏¢‡∏ß‡∏Å‡∏±‡∏ô ‡πÄ‡∏û‡∏∑‡πà‡∏≠‡πÉ‡∏´‡πâ‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡πÅ‡∏ö‡∏Å‡∏£‡∏±‡∏ö‡∏ï‡πâ‡∏ô‡∏ó‡∏∏‡∏ô‡πÑ‡∏î‡πâ ‡πÅ‡∏•‡∏∞‡∏ä‡πà‡∏≤‡∏á‡πÑ‡∏°‡πà‡∏£‡∏π‡πâ‡∏™‡∏∂‡∏Å‡∏ñ‡∏π‡∏Å‡πÄ‡∏≠‡∏≤‡πÄ‡∏õ‡∏£‡∏µ‡∏¢‡∏ö</p>
<p class="contract-table-line"><strong>‡∏õ‡∏£‡∏∞‡πÄ‡∏†‡∏ó‡∏á‡∏≤‡∏ô</strong></p>
<p class="contract-table-line"><strong>‡∏Ç‡∏ô‡∏≤‡∏î BTU</strong></p>
<p class="contract-table-line"><strong>‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡∏ó‡∏µ‡πà 1</strong></p>
<p class="contract-table-line"><strong>‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡∏ó‡∏µ‡πà 2-3</strong></p>
<p class="contract-table-line"><strong>‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡∏ó‡∏µ‡πà 4+</strong></p>
<p>‡∏•‡πâ‡∏≤‡∏á‡∏õ‡∏Å‡∏ï‡∏¥</p>
<p>‡πÑ‡∏°‡πà‡πÄ‡∏Å‡∏¥‡∏ô 12,000</p>
<p>400</p>
<p>350</p>
<p>320</p>
<p>‡∏•‡πâ‡∏≤‡∏á‡∏õ‡∏Å‡∏ï‡∏¥</p>
<p>18,000 ‡∏Ç‡∏∂‡πâ‡∏ô‡πÑ‡∏õ</p>
<p>450</p>
<p>400</p>
<p>350</p>
<p>‡∏•‡πâ‡∏≤‡∏á‡∏û‡∏£‡∏µ‡πÄ‡∏°‡∏µ‡∏¢‡∏°</p>
<p>‡πÑ‡∏°‡πà‡πÄ‡∏Å‡∏¥‡∏ô 12,000</p>
<p>550</p>
<p>500</p>
<p>450</p>
<p>‡∏•‡πâ‡∏≤‡∏á‡∏û‡∏£‡∏µ‡πÄ‡∏°‡∏µ‡∏¢‡∏°</p>
<p>18,000 ‡∏Ç‡∏∂‡πâ‡∏ô‡πÑ‡∏õ</p>
<p>700</p>
<p>650</p>
<p>600</p>
<p>‡πÅ‡∏Ç‡∏ß‡∏ô‡∏Ñ‡∏≠‡∏¢‡∏•‡πå</p>
<p>‡πÑ‡∏°‡πà‡πÄ‡∏Å‡∏¥‡∏ô 12,000</p>
<p>850</p>
<p>800</p>
<p>750</p>
<p>‡πÅ‡∏Ç‡∏ß‡∏ô‡∏Ñ‡∏≠‡∏¢‡∏•‡πå</p>
<p>18,000 ‡∏Ç‡∏∂‡πâ‡∏ô‡πÑ‡∏õ</p>
<p>1,050</p>
<p>1,000</p>
<p>950</p>
<p>‡∏ï‡∏±‡∏î‡∏•‡πâ‡∏≤‡∏á‡πÉ‡∏´‡∏ç‡πà</p>
<p>‡πÑ‡∏°‡πà‡πÄ‡∏Å‡∏¥‡∏ô 12,000</p>
<p>1,200</p>
<p>1,100</p>
<p>1,000</p>
<p>‡∏ï‡∏±‡∏î‡∏•‡πâ‡∏≤‡∏á‡πÉ‡∏´‡∏ç‡πà</p>
<p>18,000 ‡∏Ç‡∏∂‡πâ‡∏ô‡πÑ‡∏õ</p>
<p>1,450</p>
<p>1,350</p>
<p>1,250</p>
<p>‡∏´‡∏°‡∏≤‡∏¢‡πÄ‡∏´‡∏ï‡∏∏: ‡∏ï‡∏±‡∏ß‡πÄ‡∏•‡∏Ç‡∏ó‡∏±‡πâ‡∏á‡∏´‡∏°‡∏î‡πÄ‡∏õ‡πá‡∏ô‡πÄ‡∏á‡∏¥‡∏ô‡∏ö‡∏≤‡∏ó‡∏ï‡πà‡∏≠‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á ‡πÉ‡∏ä‡πâ‡∏Å‡∏±‡∏ö‡∏á‡∏≤‡∏ô‡∏ö‡πâ‡∏≤‡∏ô‡πÄ‡∏î‡∏µ‡∏¢‡∏ß / ‡∏Ñ‡∏≠‡∏ô‡πÇ‡∏î‡πÄ‡∏î‡∏µ‡∏¢‡∏ß / ‡∏£‡πâ‡∏≤‡∏ô‡πÄ‡∏î‡∏µ‡∏¢‡∏ß / ‡∏´‡∏ô‡πâ‡∏≤‡∏á‡∏≤‡∏ô‡πÄ‡∏î‡∏µ‡∏¢‡∏ß‡∏Å‡∏±‡∏ô ‡πÅ‡∏•‡∏∞‡∏ó‡∏≥‡πÉ‡∏ô‡∏ß‡∏±‡∏ô‡πÄ‡∏î‡∏µ‡∏¢‡∏ß‡∏Å‡∏±‡∏ô‡πÄ‡∏ó‡πà‡∏≤‡∏ô‡∏±‡πâ‡∏ô</p>
<h3>5. ‡∏ï‡∏±‡∏ß‡∏≠‡∏¢‡πà‡∏≤‡∏á‡∏Å‡∏≤‡∏£‡∏Ñ‡∏≥‡∏ô‡∏ß‡∏ì</h3>
<p class="contract-table-line"><strong>‡∏•‡∏≥‡∏î‡∏±‡∏ö</strong></p>
<p class="contract-table-line"><strong>‡∏ï‡∏±‡∏ß‡∏≠‡∏¢‡πà‡∏≤‡∏á‡∏á‡∏≤‡∏ô</strong></p>
<p class="contract-table-line"><strong>‡∏ß‡∏¥‡∏ò‡∏µ‡∏Ñ‡∏¥‡∏î</strong></p>
<p class="contract-table-line"><strong>‡∏£‡∏ß‡∏°‡∏à‡πà‡∏≤‡∏¢</strong></p>
<p>1</p>
<p>‡∏•‡πâ‡∏≤‡∏á‡∏õ‡∏Å‡∏ï‡∏¥ ‡πÑ‡∏°‡πà‡πÄ‡∏Å‡∏¥‡∏ô 12,000 ‡∏à‡∏≥‡∏ô‡∏ß‡∏ô 5 ‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á</p>
<p>400 + 350 + 350 + 320 + 320</p>
<p>1,740</p>
<p>2</p>
<p>‡∏•‡πâ‡∏≤‡∏á‡∏õ‡∏Å‡∏ï‡∏¥ 18,000 ‡∏Ç‡∏∂‡πâ‡∏ô‡πÑ‡∏õ ‡∏à‡∏≥‡∏ô‡∏ß‡∏ô 4 ‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á</p>
<p>450 + 400 + 400 + 350</p>
<p>1,600</p>
<p>3</p>
<p>‡∏•‡πâ‡∏≤‡∏á‡∏û‡∏£‡∏µ‡πÄ‡∏°‡∏µ‡∏¢‡∏° ‡πÑ‡∏°‡πà‡πÄ‡∏Å‡∏¥‡∏ô 12,000 ‡∏à‡∏≥‡∏ô‡∏ß‡∏ô 4 ‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á</p>
<p>550 + 500 + 500 + 450</p>
<p>2,000</p>
<p>4</p>
<p>‡πÅ‡∏Ç‡∏ß‡∏ô‡∏Ñ‡∏≠‡∏¢‡∏•‡πå ‡πÑ‡∏°‡πà‡πÄ‡∏Å‡∏¥‡∏ô 12,000 ‡∏à‡∏≥‡∏ô‡∏ß‡∏ô 3 ‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á</p>
<p>850 + 800 + 800</p>
<p>2,450</p>
<p>5</p>
<p>‡∏ï‡∏±‡∏î‡∏•‡πâ‡∏≤‡∏á‡πÉ‡∏´‡∏ç‡πà 18,000 ‡∏Ç‡∏∂‡πâ‡∏ô‡πÑ‡∏õ ‡∏à‡∏≥‡∏ô‡∏ß‡∏ô 2 ‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á</p>
<p>1,450 + 1,350</p>
<p>2,800</p>
<h3>6. ‡πÄ‡∏á‡∏∑‡πà‡∏≠‡∏ô‡πÑ‡∏Ç‡∏Å‡∏≤‡∏£‡πÉ‡∏ä‡πâ‡πÄ‡∏£‡∏ó‡∏Ç‡∏±‡πâ‡∏ô‡∏ö‡∏±‡∏ô‡πÑ‡∏î</h3>
<ul>
<li>‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡∏ó‡∏µ‡πà 1 ‡∏à‡πà‡∏≤‡∏¢‡πÄ‡∏ï‡πá‡∏° ‡πÄ‡∏û‡∏£‡∏≤‡∏∞‡∏°‡∏µ‡∏ï‡πâ‡∏ô‡∏ó‡∏∏‡∏ô‡πÄ‡∏õ‡∏¥‡∏î‡∏á‡∏≤‡∏ô ‡πÄ‡∏î‡∏¥‡∏ô‡∏ó‡∏≤‡∏á ‡∏¢‡∏Å‡∏Ç‡∏≠‡∏á ‡∏ï‡∏±‡πâ‡∏á‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡∏°‡∏∑‡∏≠ ‡∏ï‡∏£‡∏ß‡∏à‡∏´‡∏ô‡πâ‡∏≤‡∏á‡∏≤‡∏ô ‡πÅ‡∏•‡∏∞‡∏™‡∏∑‡πà‡∏≠‡∏™‡∏≤‡∏£‡∏Å‡∏±‡∏ö‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤</li>
<li>‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡∏ó‡∏µ‡πà 2-3 ‡πÄ‡∏õ‡πá‡∏ô‡πÄ‡∏£‡∏ó‡∏á‡∏≤‡∏ô‡∏ï‡πà‡∏≠‡πÄ‡∏ô‡∏∑‡πà‡∏≠‡∏á ‡πÄ‡∏û‡∏£‡∏≤‡∏∞‡∏≠‡∏¢‡∏π‡πà‡πÉ‡∏ô‡∏™‡∏ñ‡∏≤‡∏ô‡∏ó‡∏µ‡πà‡πÄ‡∏î‡∏µ‡∏¢‡∏ß‡∏Å‡∏±‡∏ô‡πÅ‡∏•‡∏∞‡∏õ‡∏£‡∏∞‡∏´‡∏¢‡∏±‡∏î‡πÄ‡∏ß‡∏•‡∏≤‡∏ö‡∏≤‡∏á‡∏™‡πà‡∏ß‡∏ô</li>
<li>‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡∏ó‡∏µ‡πà 4 ‡∏Ç‡∏∂‡πâ‡∏ô‡πÑ‡∏õ‡πÄ‡∏õ‡πá‡∏ô‡πÄ‡∏£‡∏ó‡πÄ‡∏´‡∏°‡∏≤‡∏´‡∏•‡∏≤‡∏¢‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á ‡πÄ‡∏û‡∏∑‡πà‡∏≠‡πÉ‡∏´‡πâ‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡πÅ‡∏•‡∏∞‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏™‡∏≤‡∏°‡∏≤‡∏£‡∏ñ‡∏ó‡∏≥‡∏á‡∏≤‡∏ô‡∏£‡πà‡∏ß‡∏°‡∏Å‡∏±‡∏ô‡πÑ‡∏î‡πâ‡∏£‡∏∞‡∏¢‡∏∞‡∏¢‡∏≤‡∏ß</li>
<li>‡∏´‡∏≤‡∏Å‡πÄ‡∏õ‡πá‡∏ô‡∏Ñ‡∏ô‡∏•‡∏∞‡∏ö‡πâ‡∏≤‡∏ô ‡∏Ñ‡∏ô‡∏•‡∏∞‡∏≠‡∏≤‡∏Ñ‡∏≤‡∏£ ‡∏Ñ‡∏ô‡∏•‡∏∞‡πÇ‡∏•‡πÄ‡∏Ñ‡∏ä‡∏±‡∏ô ‡∏´‡∏£‡∏∑‡∏≠‡∏Ñ‡∏ô‡∏•‡∏∞‡∏ô‡∏±‡∏î‡∏´‡∏°‡∏≤‡∏¢ ‡πÉ‡∏´‡πâ‡∏Ñ‡∏¥‡∏î‡πÄ‡∏õ‡πá‡∏ô‡∏á‡∏≤‡∏ô‡πÅ‡∏¢‡∏Å ‡πÑ‡∏°‡πà‡∏£‡∏ß‡∏°‡∏Ç‡∏±‡πâ‡∏ô‡∏ö‡∏±‡∏ô‡πÑ‡∏î</li>
<li>‡∏´‡∏≤‡∏Å‡∏´‡∏ô‡πâ‡∏≤‡∏á‡∏≤‡∏ô‡∏¢‡∏≤‡∏Å‡∏û‡∏¥‡πÄ‡∏®‡∏© ‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏™‡∏≤‡∏°‡∏≤‡∏£‡∏ñ‡∏û‡∏¥‡∏à‡∏≤‡∏£‡∏ì‡∏≤‡πÄ‡∏û‡∏¥‡πà‡∏°‡∏Ñ‡πà‡∏≤‡πÅ‡∏£‡∏á‡∏û‡∏¥‡πÄ‡∏®‡∏©‡πÄ‡∏õ‡πá‡∏ô‡∏£‡∏≤‡∏¢‡∏á‡∏≤‡∏ô ‡πÄ‡∏ä‡πà‡∏ô ‡∏à‡∏≠‡∏î‡∏£‡∏ñ‡∏¢‡∏≤‡∏Å ‡∏õ‡∏µ‡∏ô‡∏™‡∏π‡∏á ‡∏ñ‡∏≠‡∏î‡∏¢‡∏≤‡∏Å ‡∏™‡∏Å‡∏õ‡∏£‡∏Å‡∏°‡∏≤‡∏Å ‡∏´‡∏£‡∏∑‡∏≠‡πÉ‡∏ä‡πâ‡πÄ‡∏ß‡∏•‡∏≤‡∏°‡∏≤‡∏Å‡∏Å‡∏ß‡πà‡∏≤‡∏õ‡∏Å‡∏ï‡∏¥</li>
</ul>
<h3>7. ‡∏£‡∏≠‡∏ö‡∏à‡πà‡∏≤‡∏¢‡πÄ‡∏á‡∏¥‡∏ô ‡πÄ‡∏á‡∏∑‡πà‡∏≠‡∏ô‡πÑ‡∏Ç‡∏Å‡∏≤‡∏£‡∏à‡πà‡∏≤‡∏¢ ‡πÅ‡∏•‡∏∞‡∏†‡∏≤‡∏©‡∏µ‡∏´‡∏±‡∏Å ‡∏ì ‡∏ó‡∏µ‡πà‡∏à‡πà‡∏≤‡∏¢</h3>
<ul>
<li>‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏à‡∏∞‡∏à‡πà‡∏≤‡∏¢‡∏Ñ‡πà‡∏≤‡∏ï‡∏≠‡∏ö‡πÅ‡∏ó‡∏ô‡∏ï‡∏≤‡∏°‡∏£‡∏≠‡∏ö‡∏à‡πà‡∏≤‡∏¢‡∏ó‡∏µ‡πà‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏Å‡∏≥‡∏´‡∏ô‡∏î ‡πÄ‡∏ä‡πà‡∏ô ‡∏ß‡∏±‡∏ô‡∏ó‡∏µ‡πà 10 ‡πÅ‡∏•‡∏∞ 25 ‡∏Ç‡∏≠‡∏á‡πÄ‡∏î‡∏∑‡∏≠‡∏ô ‡∏´‡∏£‡∏∑‡∏≠‡∏£‡∏≠‡∏ö‡∏≠‡∏∑‡πà‡∏ô‡∏ó‡∏µ‡πà‡∏ï‡∏Å‡∏•‡∏á‡∏Å‡∏±‡∏ô‡πÄ‡∏õ‡πá‡∏ô‡∏•‡∏≤‡∏¢‡∏•‡∏±‡∏Å‡∏©‡∏ì‡πå‡∏≠‡∏±‡∏Å‡∏©‡∏£</li>
<li>‡∏Ñ‡πà‡∏≤‡∏ï‡∏≠‡∏ö‡πÅ‡∏ó‡∏ô‡∏à‡∏∞‡∏à‡πà‡∏≤‡∏¢‡πÄ‡∏â‡∏û‡∏≤‡∏∞‡∏á‡∏≤‡∏ô‡∏ó‡∏µ‡πà‡∏õ‡∏¥‡∏î‡∏™‡∏°‡∏ö‡∏π‡∏£‡∏ì‡πå‡πÉ‡∏ô‡∏£‡∏∞‡∏ö‡∏ö ‡∏°‡∏µ‡∏£‡∏π‡∏õ‡∏Ñ‡∏£‡∏ö ‡∏™‡∏ñ‡∏≤‡∏ô‡∏∞‡∏Ñ‡∏£‡∏ö ‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•‡∏Ñ‡∏£‡∏ö ‡πÅ‡∏•‡∏∞‡∏ú‡πà‡∏≤‡∏ô‡∏Å‡∏≤‡∏£‡∏ï‡∏£‡∏ß‡∏à‡∏™‡∏≠‡∏ö‡∏à‡∏≤‡∏Å‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡πÅ‡∏•‡πâ‡∏ß</li>
<li>‡∏Å‡∏£‡∏ì‡∏µ‡∏°‡∏µ‡∏Ç‡πâ‡∏≠‡∏£‡πâ‡∏≠‡∏á‡πÄ‡∏£‡∏µ‡∏¢‡∏ô ‡∏á‡∏≤‡∏ô‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢ ‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•‡πÑ‡∏°‡πà‡∏Ñ‡∏£‡∏ö ‡∏á‡∏≤‡∏ô‡∏£‡∏±‡∏ö‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô ‡∏´‡∏£‡∏∑‡∏≠‡∏°‡∏µ‡∏£‡∏≤‡∏¢‡∏Å‡∏≤‡∏£‡∏ï‡πâ‡∏≠‡∏á‡∏ï‡∏£‡∏ß‡∏à‡∏™‡∏≠‡∏ö</li>
</ul>
<p>‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏°‡∏µ‡∏™‡∏¥‡∏ó‡∏ò‡∏¥‡∏ä‡∏∞‡∏•‡∏≠‡∏Å‡∏≤‡∏£‡∏à‡πà‡∏≤‡∏¢‡πÄ‡∏â‡∏û‡∏≤‡∏∞‡∏á‡∏≤‡∏ô‡∏ô‡∏±‡πâ‡∏ô‡∏à‡∏ô‡∏Å‡∏ß‡πà‡∏≤‡∏à‡∏∞‡∏ï‡∏£‡∏ß‡∏à‡∏™‡∏≠‡∏ö‡πÅ‡∏•‡πâ‡∏ß‡πÄ‡∏™‡∏£‡πá‡∏à</p>
<ul>
<li>‡∏Ñ‡πà‡∏≤‡∏ï‡∏≠‡∏ö‡πÅ‡∏ó‡∏ô‡πÉ‡∏ô‡∏ï‡∏≤‡∏£‡∏≤‡∏á‡πÄ‡∏£‡∏ó‡∏ñ‡∏∑‡∏≠‡πÄ‡∏õ‡πá‡∏ô‡∏¢‡∏≠‡∏î ‡∏Å‡πà‡∏≠‡∏ô‡∏´‡∏±‡∏Å‡∏†‡∏≤‡∏©‡∏µ ‡∏ì ‡∏ó‡∏µ‡πà‡∏à‡πà‡∏≤‡∏¢ ‡πÄ‡∏ß‡πâ‡∏ô‡πÅ‡∏ï‡πà‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡πÅ‡∏à‡πâ‡∏á‡πÄ‡∏õ‡πá‡∏ô‡∏≠‡∏¢‡πà‡∏≤‡∏á‡∏≠‡∏∑‡πà‡∏ô‡πÄ‡∏õ‡πá‡∏ô‡∏•‡∏≤‡∏¢‡∏•‡∏±‡∏Å‡∏©‡∏ì‡πå‡∏≠‡∏±‡∏Å‡∏©‡∏£</li>
<li>‡∏Å‡∏£‡∏ì‡∏µ‡∏ó‡∏µ‡πà‡∏Å‡∏é‡∏´‡∏°‡∏≤‡∏¢‡∏Å‡∏≥‡∏´‡∏ô‡∏î‡πÉ‡∏´‡πâ‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏°‡∏µ‡∏´‡∏ô‡πâ‡∏≤‡∏ó‡∏µ‡πà‡∏´‡∏±‡∏Å‡∏†‡∏≤‡∏©‡∏µ ‡∏ì ‡∏ó‡∏µ‡πà‡∏à‡πà‡∏≤‡∏¢ ‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏°‡∏µ‡∏™‡∏¥‡∏ó‡∏ò‡∏¥‡∏´‡∏±‡∏Å‡∏†‡∏≤‡∏©‡∏µ ‡∏ì ‡∏ó‡∏µ‡πà‡∏à‡πà‡∏≤‡∏¢‡∏à‡∏≤‡∏Å‡∏Ñ‡πà‡∏≤‡∏ï‡∏≠‡∏ö‡πÅ‡∏ó‡∏ô‡∏Ç‡∏≠‡∏á‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡πÉ‡∏ô‡∏≠‡∏±‡∏ï‡∏£‡∏≤‡∏ó‡∏µ‡πà‡∏Å‡∏é‡∏´‡∏°‡∏≤‡∏¢‡∏Å‡∏≥‡∏´‡∏ô‡∏î</li>
</ul>
<p>‡πÄ‡∏ä‡πà‡∏ô 3% ‡∏™‡∏≥‡∏´‡∏£‡∏±‡∏ö‡∏Ñ‡πà‡∏≤‡∏ö‡∏£‡∏¥‡∏Å‡∏≤‡∏£‡∏´‡∏£‡∏∑‡∏≠‡∏Ñ‡πà‡∏≤‡∏à‡πâ‡∏≤‡∏á‡∏ó‡∏≥‡∏Ç‡∏≠‡∏á ‡πÅ‡∏•‡∏∞‡∏ô‡∏≥‡∏™‡πà‡∏á‡∏Å‡∏£‡∏°‡∏™‡∏£‡∏£‡∏û‡∏≤‡∏Å‡∏£‡πÉ‡∏ô‡∏ô‡∏≤‡∏°‡∏ú‡∏π‡πâ‡∏£‡∏±‡∏ö‡πÄ‡∏á‡∏¥‡∏ô</p>
<ul>
<li>‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏à‡∏∞‡∏≠‡∏≠‡∏Å‡∏´‡∏ô‡∏±‡∏á‡∏™‡∏∑‡∏≠‡∏£‡∏±‡∏ö‡∏£‡∏≠‡∏á‡∏Å‡∏≤‡∏£‡∏´‡∏±‡∏Å‡∏†‡∏≤‡∏©‡∏µ ‡∏ì ‡∏ó‡∏µ‡πà‡∏à‡πà‡∏≤‡∏¢‡πÉ‡∏´‡πâ‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå ‡πÄ‡∏û‡∏∑‡πà‡∏≠‡πÉ‡∏ä‡πâ‡πÄ‡∏õ‡πá‡∏ô‡∏´‡∏•‡∏±‡∏Å‡∏ê‡∏≤‡∏ô‡∏õ‡∏£‡∏∞‡∏Å‡∏≠‡∏ö‡∏Å‡∏≤‡∏£‡∏¢‡∏∑‡πà‡∏ô‡∏†‡∏≤‡∏©‡∏µ‡∏õ‡∏£‡∏∞‡∏à‡∏≥‡∏õ‡∏µ</li>
<li>‡∏´‡∏≤‡∏Å‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡πÄ‡∏õ‡πá‡∏ô‡∏ö‡∏∏‡∏Ñ‡∏Ñ‡∏•‡∏ò‡∏£‡∏£‡∏°‡∏î‡∏≤ ‡πÇ‡∏î‡∏¢‡∏ó‡∏±‡πà‡∏ß‡πÑ‡∏õ‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏à‡∏∞‡πÉ‡∏ä‡πâ‡πÅ‡∏ö‡∏ö ‡∏†.‡∏á.‡∏î.3 ‡∏ï‡∏≤‡∏°‡πÄ‡∏á‡∏∑‡πà‡∏≠‡∏ô‡πÑ‡∏Ç‡∏ó‡∏µ‡πà‡∏Å‡∏é‡∏´‡∏°‡∏≤‡∏¢‡∏Å‡∏≥‡∏´‡∏ô‡∏î ‡πÅ‡∏•‡∏∞‡∏´‡∏≤‡∏Å‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡πÄ‡∏õ‡πá‡∏ô‡∏ô‡∏¥‡∏ï‡∏¥‡∏ö‡∏∏‡∏Ñ‡∏Ñ‡∏•</li>
</ul>
<p>‡πÇ‡∏î‡∏¢‡∏ó‡∏±‡πà‡∏ß‡πÑ‡∏õ‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏à‡∏∞‡πÉ‡∏ä‡πâ‡πÅ‡∏ö‡∏ö ‡∏†.‡∏á.‡∏î.53</p>
<ul>
<li>‡∏´‡∏≤‡∏Å‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏à‡∏î‡∏ó‡∏∞‡πÄ‡∏ö‡∏µ‡∏¢‡∏ô‡∏†‡∏≤‡∏©‡∏µ‡∏°‡∏π‡∏•‡∏Ñ‡πà‡∏≤‡πÄ‡∏û‡∏¥‡πà‡∏° ‡∏ï‡πâ‡∏≠‡∏á‡πÅ‡∏à‡πâ‡∏á‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏•‡πà‡∏ß‡∏á‡∏´‡∏ô‡πâ‡∏≤‡πÅ‡∏•‡∏∞‡∏≠‡∏≠‡∏Å‡πÉ‡∏ö‡∏Å‡∏≥‡∏Å‡∏±‡∏ö‡∏†‡∏≤‡∏©‡∏µ/‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£‡∏ï‡∏≤‡∏°‡∏Å‡∏é‡∏´‡∏°‡∏≤‡∏¢‡πÉ‡∏´‡πâ‡∏ñ‡∏π‡∏Å‡∏ï‡πâ‡∏≠‡∏á‡∏Å‡πà‡∏≠‡∏ô‡∏£‡∏±‡∏ö‡πÄ‡∏á‡∏¥‡∏ô</li>
<li>‡∏ï‡∏±‡∏ß‡∏≠‡∏¢‡πà‡∏≤‡∏á: ‡∏Ñ‡πà‡∏≤‡∏ä‡πà‡∏≤‡∏á‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå 10,000 ‡∏ö‡∏≤‡∏ó ‡∏´‡∏±‡∏Å ‡∏ì ‡∏ó‡∏µ‡πà‡∏à‡πà‡∏≤‡∏¢ 3% = 300 ‡∏ö‡∏≤‡∏ó ‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡πÇ‡∏≠‡∏ô‡πÉ‡∏´‡πâ‡∏ä‡πà‡∏≤‡∏á 9,700 ‡∏ö‡∏≤‡∏ó ‡πÅ‡∏•‡∏∞‡∏ô‡∏≥‡∏™‡πà‡∏á‡∏Å‡∏£‡∏°‡∏™‡∏£‡∏£‡∏û‡∏≤‡∏Å‡∏£ 300 ‡∏ö‡∏≤‡∏ó</li>
</ul>
<p>‡∏ï‡πâ‡∏ô‡∏ó‡∏∏‡∏ô‡∏£‡∏ß‡∏°‡∏Ç‡∏≠‡∏á‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏ï‡∏≤‡∏°‡∏á‡∏≤‡∏ô‡∏ô‡∏µ‡πâ‡∏¢‡∏±‡∏á‡πÄ‡∏ó‡πà‡∏≤‡∏Å‡∏±‡∏ö 10,000 ‡∏ö‡∏≤‡∏ó ‡πÑ‡∏°‡πà‡πÉ‡∏ä‡πà 10,300 ‡∏ö‡∏≤‡∏ó</p>
<ul>
<li>‡∏Å‡∏£‡∏ì‡∏µ‡∏°‡∏µ‡πÄ‡∏á‡∏¥‡∏ô‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô‡∏£‡∏≤‡∏¢‡πÄ‡∏î‡∏∑‡∏≠‡∏ô: ‡πÉ‡∏´‡πâ‡∏Ñ‡∏≥‡∏ô‡∏ß‡∏ì‡∏†‡∏≤‡∏©‡∏µ‡∏´‡∏±‡∏Å ‡∏ì ‡∏ó‡∏µ‡πà‡∏à‡πà‡∏≤‡∏¢‡∏à‡∏≤‡∏Å‡∏Ñ‡πà‡∏≤‡∏ï‡∏≠‡∏ö‡πÅ‡∏ó‡∏ô‡∏Å‡πà‡∏≠‡∏ô ‡πÅ‡∏•‡πâ‡∏ß‡∏à‡∏∂‡∏á‡∏´‡∏±‡∏Å‡πÄ‡∏á‡∏¥‡∏ô‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô‡∏ï‡∏≤‡∏°‡∏¢‡∏≠‡∏î‡∏ó‡∏µ‡πà‡∏ï‡∏Å‡∏•‡∏á ‡πÄ‡∏ä‡πà‡∏ô ‡∏Ñ‡πà‡∏≤‡∏ï‡∏≠‡∏ö‡πÅ‡∏ó‡∏ô 10,000 ‡∏ö‡∏≤‡∏ó</li>
</ul>
<p>‡∏´‡∏±‡∏Å‡∏†‡∏≤‡∏©‡∏µ 300 ‡∏ö‡∏≤‡∏ó ‡∏´‡∏±‡∏Å‡πÄ‡∏á‡∏¥‡∏ô‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô 1,000 ‡∏ö‡∏≤‡∏ó ‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡πÇ‡∏≠‡∏ô‡∏™‡∏∏‡∏ó‡∏ò‡∏¥ 8,700 ‡∏ö‡∏≤‡∏ó ‡πÅ‡∏•‡∏∞‡πÄ‡∏á‡∏¥‡∏ô‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô 1,000 ‡∏ö‡∏≤‡∏ó‡∏¢‡∏±‡∏á‡πÄ‡∏õ‡πá‡∏ô‡πÄ‡∏á‡∏¥‡∏ô‡∏Ç‡∏≠‡∏á‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏ï‡∏≤‡∏°‡πÄ‡∏á‡∏∑‡πà‡∏≠‡∏ô‡πÑ‡∏Ç‡∏™‡∏±‡∏ç‡∏ç‡∏≤</p>
<h3>8. ‡πÄ‡∏á‡∏¥‡∏ô‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢ / ‡πÄ‡∏á‡∏¥‡∏ô‡∏°‡∏±‡∏î‡∏à‡∏≥‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢</h3>
<ul>
<li>‡∏à‡∏≥‡∏ô‡∏ß‡∏ô‡πÄ‡∏á‡∏¥‡∏ô‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô: 5,000 ‡∏ö‡∏≤‡∏ó</li>
<li>‡∏ß‡∏¥‡∏ò‡∏µ‡πÅ‡∏ö‡πà‡∏á‡∏à‡πà‡∏≤‡∏¢: ‡∏´‡∏±‡∏Å‡∏à‡∏≤‡∏Å‡∏Ñ‡πà‡∏≤‡∏ï‡∏≠‡∏ö‡πÅ‡∏ó‡∏ô‡∏£‡∏≤‡∏¢‡πÄ‡∏î‡∏∑‡∏≠‡∏ô ‡πÄ‡∏î‡∏∑‡∏≠‡∏ô‡∏•‡∏∞ 1,000 ‡∏ö‡∏≤‡∏ó ‡πÄ‡∏õ‡πá‡∏ô‡πÄ‡∏ß‡∏•‡∏≤ 5 ‡πÄ‡∏î‡∏∑‡∏≠‡∏ô ‡∏´‡∏£‡∏∑‡∏≠‡πÅ‡∏ö‡πà‡∏á‡∏à‡πà‡∏≤‡∏¢‡∏ï‡∏≤‡∏°‡∏¢‡∏≠‡∏î‡∏ó‡∏µ‡πà‡∏ï‡∏Å‡∏•‡∏á‡πÉ‡∏ô‡πÉ‡∏ö‡πÅ‡∏ô‡∏ö‡∏ó‡πâ‡∏≤‡∏¢ ‡∏à‡∏ô‡∏Ñ‡∏£‡∏ö 5,000 ‡∏ö‡∏≤‡∏ó</li>
<li>‡∏ß‡∏±‡∏ï‡∏ñ‡∏∏‡∏õ‡∏£‡∏∞‡∏™‡∏á‡∏Ñ‡πå: ‡πÉ‡∏ä‡πâ‡πÄ‡∏õ‡πá‡∏ô‡∏´‡∏•‡∏±‡∏Å‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô‡∏Å‡∏£‡∏ì‡∏µ‡πÄ‡∏Å‡∏¥‡∏î‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏à‡∏≤‡∏Å‡∏Å‡∏≤‡∏£‡∏ó‡∏¥‡πâ‡∏á‡∏á‡∏≤‡∏ô ‡∏á‡∏≤‡∏ô‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢ ‡∏ó‡∏£‡∏±‡∏û‡∏¢‡πå‡∏™‡∏¥‡∏ô‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢ ‡∏£‡∏±‡∏ö‡πÄ‡∏á‡∏¥‡∏ô‡∏ô‡∏≠‡∏Å‡∏£‡∏∞‡∏ö‡∏ö ‡∏´‡∏ô‡∏µ‡πâ‡∏Ñ‡πâ‡∏≤‡∏á ‡∏≠‡∏∏‡∏õ‡∏Å‡∏£‡∏ì‡πå‡∏Ñ‡πâ‡∏≤‡∏á</li>
</ul>
<p>‡∏´‡∏£‡∏∑‡∏≠‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏≠‡∏∑‡πà‡∏ô‡∏ó‡∏µ‡πà‡πÄ‡∏Å‡∏¥‡∏î‡∏à‡∏≤‡∏Å‡∏Å‡∏≤‡∏£‡∏Å‡∏£‡∏∞‡∏ó‡∏≥‡∏Ç‡∏≠‡∏á‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå</p>
<ul>
<li>‡πÄ‡∏á‡∏¥‡∏ô‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô‡∏ô‡∏µ‡πâ‡∏¢‡∏±‡∏á‡πÄ‡∏õ‡πá‡∏ô‡∏Å‡∏£‡∏£‡∏°‡∏™‡∏¥‡∏ó‡∏ò‡∏¥‡πå‡∏Ç‡∏≠‡∏á‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå ‡πÅ‡∏ï‡πà‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏°‡∏µ‡∏™‡∏¥‡∏ó‡∏ò‡∏¥‡∏¢‡∏∂‡∏î ‡∏´‡∏±‡∏Å ‡∏´‡∏£‡∏∑‡∏≠‡∏ä‡∏î‡πÄ‡∏ä‡∏¢‡πÑ‡∏î‡πâ‡πÄ‡∏â‡∏û‡∏≤‡∏∞‡∏Å‡∏£‡∏ì‡∏µ‡∏°‡∏µ‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏à‡∏£‡∏¥‡∏á‡∏´‡∏£‡∏∑‡∏≠‡∏°‡∏µ‡∏´‡∏ô‡∏µ‡πâ‡∏Ñ‡πâ‡∏≤‡∏á‡∏ï‡∏≤‡∏°‡∏™‡∏±‡∏ç‡∏ç‡∏≤</li>
<li>‡∏Å‡∏≤‡∏£‡∏Ñ‡∏∑‡∏ô‡πÄ‡∏á‡∏¥‡∏ô‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô: ‡∏´‡∏≤‡∏Å‡∏™‡∏¥‡πâ‡∏ô‡∏™‡∏∏‡∏î‡∏Å‡∏≤‡∏£‡∏£‡πà‡∏ß‡∏°‡∏á‡∏≤‡∏ô‡πÅ‡∏•‡∏∞‡πÑ‡∏°‡πà‡∏°‡∏µ‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢ ‡πÑ‡∏°‡πà‡∏°‡∏µ‡∏á‡∏≤‡∏ô‡∏Ñ‡πâ‡∏≤‡∏á ‡πÑ‡∏°‡πà‡∏°‡∏µ‡∏≠‡∏∏‡∏õ‡∏Å‡∏£‡∏ì‡πå‡∏Ñ‡πâ‡∏≤‡∏á ‡πÑ‡∏°‡πà‡∏°‡∏µ‡∏Ç‡πâ‡∏≠‡∏û‡∏¥‡∏û‡∏≤‡∏ó</li>
</ul>
<p>‡πÅ‡∏•‡∏∞‡∏û‡πâ‡∏ô‡∏ä‡πà‡∏ß‡∏á‡∏£‡∏±‡∏ö‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô‡∏á‡∏≤‡∏ô‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡∏ï‡∏≤‡∏°‡∏ó‡∏µ‡πà‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏Å‡∏≥‡∏´‡∏ô‡∏î‡πÅ‡∏•‡πâ‡∏ß ‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏à‡∏∞‡∏Ñ‡∏∑‡∏ô‡πÄ‡∏á‡∏¥‡∏ô‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô‡∏†‡∏≤‡∏¢‡πÉ‡∏ô‡∏£‡∏∞‡∏¢‡∏∞‡πÄ‡∏ß‡∏•‡∏≤ 60 - 90 ‡∏ß‡∏±‡∏ô</p>
<p>‡∏´‡∏•‡∏±‡∏á‡∏à‡∏≤‡∏Å‡∏ï‡∏£‡∏ß‡∏à‡∏™‡∏≠‡∏ö‡∏á‡∏≤‡∏ô‡∏Ñ‡πâ‡∏≤‡∏á‡πÅ‡∏•‡∏∞‡∏á‡∏≤‡∏ô‡∏£‡∏±‡∏ö‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô‡πÄ‡∏™‡∏£‡πá‡∏à‡∏™‡∏¥‡πâ‡∏ô</p>
<ul>
<li>‡πÄ‡∏´‡∏ï‡∏∏‡∏ú‡∏•‡∏Ç‡∏≠‡∏á‡∏£‡∏∞‡∏¢‡∏∞‡πÄ‡∏ß‡∏•‡∏≤ 60 - 90 ‡∏ß‡∏±‡∏ô: ‡∏á‡∏≤‡∏ô‡∏ö‡∏£‡∏¥‡∏Å‡∏≤‡∏£‡∏Ç‡∏≠‡∏á‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏°‡∏µ‡∏£‡∏∞‡∏¢‡∏∞‡∏£‡∏±‡∏ö‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô‡πÉ‡∏´‡πâ‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤ ‡πÇ‡∏î‡∏¢‡πÄ‡∏â‡∏û‡∏≤‡∏∞‡∏ä‡πà‡∏ß‡∏á 30 ‡∏ß‡∏±‡∏ô‡πÅ‡∏£‡∏Å‡∏¢‡∏±‡∏á‡∏≠‡∏¢‡∏π‡πà‡πÉ‡∏ô‡∏ä‡πà‡∏ß‡∏á‡∏£‡∏±‡∏ö‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô‡∏á‡∏≤‡∏ô</li>
</ul>
<p>‡∏´‡∏≤‡∏Å‡∏°‡∏µ‡πÄ‡∏Ñ‡∏•‡∏°‡∏´‡∏£‡∏∑‡∏≠‡∏Ç‡πâ‡∏≠‡∏£‡πâ‡∏≠‡∏á‡πÄ‡∏£‡∏µ‡∏¢‡∏ô‡∏à‡∏≤‡∏Å‡∏á‡∏≤‡∏ô‡∏ó‡∏µ‡πà‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏£‡∏±‡∏ö‡∏ú‡∏¥‡∏î‡∏ä‡∏≠‡∏ö ‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏°‡∏µ‡∏™‡∏¥‡∏ó‡∏ò‡∏¥‡∏ï‡∏£‡∏ß‡∏à‡∏™‡∏≠‡∏ö‡πÅ‡∏•‡∏∞‡∏´‡∏±‡∏Å‡∏ä‡∏î‡πÄ‡∏ä‡∏¢‡∏à‡∏≤‡∏Å‡πÄ‡∏á‡∏¥‡∏ô‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô‡∏ï‡∏≤‡∏°‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏à‡∏£‡∏¥‡∏á</p>
<ul>
<li>‡∏Å‡∏£‡∏ì‡∏µ‡∏°‡∏µ‡∏á‡∏≤‡∏ô‡πÄ‡∏Ñ‡∏•‡∏° ‡∏Ç‡πâ‡∏≠‡∏û‡∏¥‡∏û‡∏≤‡∏ó ‡∏´‡∏ô‡∏µ‡πâ‡∏Ñ‡πâ‡∏≤‡∏á ‡∏≠‡∏∏‡∏õ‡∏Å‡∏£‡∏ì‡πå‡∏Ñ‡πâ‡∏≤‡∏á ‡∏´‡∏£‡∏∑‡∏≠‡∏£‡∏≤‡∏¢‡∏Å‡∏≤‡∏£‡∏ï‡∏£‡∏ß‡∏à‡∏™‡∏≠‡∏ö‡∏¢‡∏±‡∏á‡πÑ‡∏°‡πà‡πÄ‡∏™‡∏£‡πá‡∏à</li>
</ul>
<p>‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏°‡∏µ‡∏™‡∏¥‡∏ó‡∏ò‡∏¥‡∏ä‡∏∞‡∏•‡∏≠‡∏Å‡∏≤‡∏£‡∏Ñ‡∏∑‡∏ô‡πÄ‡∏á‡∏¥‡∏ô‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô‡∏à‡∏ô‡∏Å‡∏ß‡πà‡∏≤‡∏£‡∏≤‡∏¢‡∏Å‡∏≤‡∏£‡∏î‡∏±‡∏á‡∏Å‡∏•‡πà‡∏≤‡∏ß‡∏à‡∏∞‡∏ï‡∏£‡∏ß‡∏à‡∏™‡∏≠‡∏ö‡πÅ‡∏•‡∏∞‡∏õ‡∏¥‡∏î‡∏à‡∏ö‡∏Ñ‡∏£‡∏ö‡∏ñ‡πâ‡∏ß‡∏ô</p>
<ul>
<li>‡∏´‡∏≤‡∏Å‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏™‡∏π‡∏á‡∏Å‡∏ß‡πà‡∏≤‡πÄ‡∏á‡∏¥‡∏ô‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô 5,000 ‡∏ö‡∏≤‡∏ó ‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏¢‡∏±‡∏á‡∏ï‡πâ‡∏≠‡∏á‡∏£‡∏±‡∏ö‡∏ú‡∏¥‡∏î‡∏ä‡∏≠‡∏ö‡∏™‡πà‡∏ß‡∏ô‡∏ó‡∏µ‡πà‡πÄ‡∏Å‡∏¥‡∏ô‡∏ï‡∏≤‡∏°‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏à‡∏£‡∏¥‡∏á</li>
<li>‡∏Å‡∏£‡∏ì‡∏µ‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏´‡∏¢‡∏∏‡∏î‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô‡πÄ‡∏≠‡∏á‡∏´‡∏£‡∏∑‡∏≠‡∏Ç‡∏≠‡∏¢‡∏∏‡∏ï‡∏¥‡∏Å‡∏≤‡∏£‡∏£‡πà‡∏ß‡∏°‡∏á‡∏≤‡∏ô ‡∏ï‡πâ‡∏≠‡∏á‡πÅ‡∏à‡πâ‡∏á‡∏•‡πà‡∏ß‡∏á‡∏´‡∏ô‡πâ‡∏≤‡∏≠‡∏¢‡πà‡∏≤‡∏á‡∏ô‡πâ‡∏≠‡∏¢ 15 ‡∏ß‡∏±‡∏ô ‡πÅ‡∏•‡∏∞‡∏ï‡πâ‡∏≠‡∏á‡πÄ‡∏Ñ‡∏•‡∏µ‡∏¢‡∏£‡πå‡∏á‡∏≤‡∏ô‡∏Ñ‡πâ‡∏≤‡∏á‡∏ó‡∏±‡πâ‡∏á‡∏´‡∏°‡∏î‡∏Å‡πà‡∏≠‡∏ô‡∏Ç‡∏≠‡∏Ñ‡∏∑‡∏ô‡πÄ‡∏á‡∏¥‡∏ô‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô</li>
</ul>
<h3>9. ‡∏°‡∏≤‡∏ï‡∏£‡∏ê‡∏≤‡∏ô‡∏á‡∏≤‡∏ô ‡∏´‡∏•‡∏±‡∏Å‡∏ê‡∏≤‡∏ô ‡πÅ‡∏•‡∏∞‡∏Ñ‡∏ß‡∏≤‡∏°‡∏õ‡∏•‡∏≠‡∏î‡∏†‡∏±‡∏¢‡∏´‡∏ô‡πâ‡∏≤‡∏á‡∏≤‡∏ô</h3>
<ul>
<li>‡∏ñ‡πà‡∏≤‡∏¢‡∏£‡∏π‡∏õ‡∏Å‡πà‡∏≠‡∏ô‡∏á‡∏≤‡∏ô ‡∏£‡∏∞‡∏´‡∏ß‡πà‡∏≤‡∏á‡∏á‡∏≤‡∏ô ‡∏´‡∏•‡∏±‡∏á‡∏á‡∏≤‡∏ô ‡πÉ‡∏´‡πâ‡∏Ñ‡∏£‡∏ö‡∏ï‡∏≤‡∏°‡∏ó‡∏µ‡πà‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏Å‡∏≥‡∏´‡∏ô‡∏î</li>
<li>‡∏≠‡∏±‡∏õ‡πÄ‡∏î‡∏ï‡∏™‡∏ñ‡∏≤‡∏ô‡∏∞‡πÉ‡∏ô‡∏£‡∏∞‡∏ö‡∏ö ‡πÄ‡∏ä‡πà‡∏ô ‡πÄ‡∏î‡∏¥‡∏ô‡∏ó‡∏≤‡∏á‡∏ñ‡∏∂‡∏á ‡πÄ‡∏£‡∏¥‡πà‡∏°‡∏á‡∏≤‡∏ô ‡∏õ‡∏¥‡∏î‡∏á‡∏≤‡∏ô ‡πÅ‡∏•‡∏∞‡πÅ‡∏ô‡∏ö‡∏£‡∏≤‡∏¢‡∏•‡∏∞‡πÄ‡∏≠‡∏µ‡∏¢‡∏î‡∏ó‡∏µ‡πà‡∏à‡∏≥‡πÄ‡∏õ‡πá‡∏ô</li>
<li>‡∏£‡∏±‡∏Å‡∏©‡∏≤‡∏Ñ‡∏ß‡∏≤‡∏°‡∏™‡∏∞‡∏≠‡∏≤‡∏î‡∏´‡∏ô‡πâ‡∏≤‡∏á‡∏≤‡∏ô ‡πÑ‡∏°‡πà‡∏ó‡∏¥‡πâ‡∏á‡∏Ñ‡∏£‡∏≤‡∏ö‡∏ô‡πâ‡∏≥ ‡πÑ‡∏°‡πà‡∏ó‡∏¥‡πâ‡∏á‡∏Ç‡∏¢‡∏∞ ‡πÅ‡∏•‡∏∞‡πÄ‡∏Å‡πá‡∏ö‡∏≠‡∏∏‡∏õ‡∏Å‡∏£‡∏ì‡πå‡πÉ‡∏´‡πâ‡πÄ‡∏£‡∏µ‡∏¢‡∏ö‡∏£‡πâ‡∏≠‡∏¢</li>
<li>‡∏™‡∏∑‡πà‡∏≠‡∏™‡∏≤‡∏£‡∏Å‡∏±‡∏ö‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡∏î‡πâ‡∏ß‡∏¢‡∏Ñ‡∏ß‡∏≤‡∏°‡∏™‡∏∏‡∏†‡∏≤‡∏û ‡πÑ‡∏°‡πà‡∏û‡∏π‡∏î‡∏à‡∏≤‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏ï‡πà‡∏≠‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó ‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤ ‡∏´‡∏£‡∏∑‡∏≠‡∏ó‡∏µ‡∏°‡∏á‡∏≤‡∏ô</li>
<li>‡∏´‡∏≤‡∏Å‡∏û‡∏ö‡∏õ‡∏±‡∏ç‡∏´‡∏≤‡∏´‡∏ô‡πâ‡∏≤‡∏á‡∏≤‡∏ô ‡∏ï‡πâ‡∏≠‡∏á‡πÅ‡∏à‡πâ‡∏á‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏Å‡πà‡∏≠‡∏ô‡∏ï‡∏±‡∏î‡∏™‡∏¥‡∏ô‡πÉ‡∏à‡πÄ‡∏û‡∏¥‡πà‡∏°‡∏á‡∏≤‡∏ô ‡πÄ‡∏õ‡∏•‡∏µ‡πà‡∏¢‡∏ô‡∏£‡∏≤‡∏Ñ‡∏≤ ‡∏´‡∏£‡∏∑‡∏≠‡πÄ‡∏õ‡∏•‡∏µ‡πà‡∏¢‡∏ô‡πÄ‡∏á‡∏∑‡πà‡∏≠‡∏ô‡πÑ‡∏Ç‡∏Å‡∏±‡∏ö‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤</li>
<li>‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏ï‡πâ‡∏≠‡∏á‡∏õ‡∏è‡∏¥‡∏ö‡∏±‡∏ï‡∏¥‡∏á‡∏≤‡∏ô‡∏î‡πâ‡∏ß‡∏¢‡∏Ñ‡∏ß‡∏≤‡∏°‡∏õ‡∏•‡∏≠‡∏î‡∏†‡∏±‡∏¢ ‡πÉ‡∏ä‡πâ‡∏≠‡∏∏‡∏õ‡∏Å‡∏£‡∏ì‡πå‡πÉ‡∏´‡πâ‡πÄ‡∏´‡∏°‡∏≤‡∏∞‡∏™‡∏°‡∏Å‡∏±‡∏ö‡∏•‡∏±‡∏Å‡∏©‡∏ì‡∏∞‡∏á‡∏≤‡∏ô ‡πÑ‡∏°‡πà‡∏ó‡∏≥‡∏á‡∏≤‡∏ô‡πÉ‡∏ô‡∏™‡∏†‡∏≤‡∏û‡∏ó‡∏µ‡πà‡πÄ‡∏™‡∏µ‡πà‡∏¢‡∏á‡∏≠‡∏±‡∏ô‡∏ï‡∏£‡∏≤‡∏¢‡πÄ‡∏Å‡∏¥‡∏ô‡∏™‡∏°‡∏Ñ‡∏ß‡∏£</li>
<li>‡∏´‡∏≤‡∏Å‡∏û‡∏ö‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏™‡∏µ‡πà‡∏¢‡∏á ‡πÄ‡∏ä‡πà‡∏ô ‡πÑ‡∏ü‡∏ü‡πâ‡∏≤‡∏£‡∏±‡πà‡∏ß ‡∏ô‡πâ‡∏≥‡∏£‡∏±‡πà‡∏ß ‡∏à‡∏∏‡∏î‡∏õ‡∏µ‡∏ô‡∏™‡∏π‡∏á ‡∏à‡∏∏‡∏î‡∏¢‡∏∂‡∏î‡πÑ‡∏°‡πà‡∏õ‡∏•‡∏≠‡∏î‡∏†‡∏±‡∏¢ ‡∏ù‡πâ‡∏≤‡πÄ‡∏õ‡∏£‡∏≤‡∏∞ ‡∏ó‡πà‡∏≠‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢ ‡∏´‡∏£‡∏∑‡∏≠‡∏û‡∏∑‡πâ‡∏ô‡∏ó‡∏µ‡πà‡πÄ‡∏™‡∏µ‡πà‡∏¢‡∏á‡∏ó‡∏≥‡πÉ‡∏´‡πâ‡∏ó‡∏£‡∏±‡∏û‡∏¢‡πå‡∏™‡∏¥‡∏ô‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢</li>
</ul>
<p>‡∏ï‡πâ‡∏≠‡∏á‡πÅ‡∏à‡πâ‡∏á‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡πÅ‡∏•‡∏∞‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡∏Å‡πà‡∏≠‡∏ô‡∏î‡∏≥‡πÄ‡∏ô‡∏¥‡∏ô‡∏Å‡∏≤‡∏£</p>
<ul>
<li>‡∏´‡∏≤‡∏Å‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏ù‡πà‡∏≤‡∏ù‡∏∑‡∏ô‡∏Ç‡πâ‡∏≠‡∏Ñ‡∏ß‡∏£‡∏£‡∏∞‡∏ß‡∏±‡∏á‡∏î‡πâ‡∏≤‡∏ô‡∏Ñ‡∏ß‡∏≤‡∏°‡∏õ‡∏•‡∏≠‡∏î‡∏†‡∏±‡∏¢‡∏´‡∏£‡∏∑‡∏≠‡∏ó‡∏≥‡∏á‡∏≤‡∏ô‡πÇ‡∏î‡∏¢‡∏õ‡∏£‡∏∞‡∏°‡∏≤‡∏ó‡∏à‡∏ô‡πÄ‡∏Å‡∏¥‡∏î‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢ ‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏ï‡πâ‡∏≠‡∏á‡∏£‡∏±‡∏ö‡∏ú‡∏¥‡∏î‡∏ä‡∏≠‡∏ö‡∏ï‡∏≤‡∏°‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏à‡∏£‡∏¥‡∏á</li>
</ul>
<h3>10. ‡∏Å‡∏ï‡∏¥‡∏Å‡∏≤‡∏Å‡∏≤‡∏£‡∏¢‡∏Å‡πÄ‡∏•‡∏¥‡∏Å‡∏á‡∏≤‡∏ô ‡πÄ‡∏•‡∏∑‡πà‡∏≠‡∏ô‡∏á‡∏≤‡∏ô ‡πÅ‡∏•‡∏∞‡∏Å‡∏≤‡∏£‡πÑ‡∏°‡πà‡πÅ‡∏à‡πâ‡∏á‡∏•‡πà‡∏ß‡∏á‡∏´‡∏ô‡πâ‡∏≤</h3>
<p>‡∏´‡∏•‡∏±‡∏Å‡∏™‡∏≥‡∏Ñ‡∏±‡∏ç: ‡πÄ‡∏°‡∏∑‡πà‡∏≠‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏Å‡∏î‡∏¢‡∏∑‡∏ô‡∏¢‡∏±‡∏ô‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô‡πÅ‡∏•‡πâ‡∏ß ‡πÉ‡∏´‡πâ‡∏ñ‡∏∑‡∏≠‡∏ß‡πà‡∏≤‡πÄ‡∏õ‡πá‡∏ô‡∏Å‡∏≤‡∏£‡∏£‡∏±‡∏ö‡∏ú‡∏¥‡∏î‡∏ä‡∏≠‡∏ö‡∏á‡∏≤‡∏ô‡∏ô‡∏±‡πâ‡∏ô‡πÇ‡∏î‡∏¢‡∏™‡∏°‡∏ö‡∏π‡∏£‡∏ì‡πå ‡∏´‡∏≤‡∏Å‡∏ï‡πâ‡∏≠‡∏á‡∏¢‡∏Å‡πÄ‡∏•‡∏¥‡∏Å‡∏´‡∏£‡∏∑‡∏≠‡πÄ‡∏•‡∏∑‡πà‡∏≠‡∏ô‡∏á‡∏≤‡∏ô</p>
<p>‡∏ï‡πâ‡∏≠‡∏á‡πÅ‡∏à‡πâ‡∏á‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏•‡πà‡∏ß‡∏á‡∏´‡∏ô‡πâ‡∏≤‡πÉ‡∏´‡πâ‡πÄ‡∏£‡πá‡∏ß‡∏ó‡∏µ‡πà‡∏™‡∏∏‡∏î ‡πÇ‡∏î‡∏¢‡∏°‡∏≤‡∏ï‡∏£‡∏ê‡∏≤‡∏ô‡∏ó‡∏µ‡πà‡∏Ñ‡∏ß‡∏£‡πÅ‡∏à‡πâ‡∏á‡∏Ñ‡∏∑‡∏≠ ‡∏≠‡∏¢‡πà‡∏≤‡∏á‡∏ô‡πâ‡∏≠‡∏¢ 72 ‡∏ä‡∏±‡πà‡∏ß‡πÇ‡∏°‡∏á‡∏Å‡πà‡∏≠‡∏ô‡πÄ‡∏ß‡∏•‡∏≤‡∏ô‡∏±‡∏î</p>
<p>‡πÄ‡∏û‡∏∑‡πà‡∏≠‡πÉ‡∏´‡πâ‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏à‡∏±‡∏î‡∏ó‡∏µ‡∏°‡∏ó‡∏î‡πÅ‡∏ó‡∏ô‡πÅ‡∏•‡∏∞‡∏î‡∏π‡πÅ‡∏•‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡πÑ‡∏î‡πâ‡∏ó‡∏±‡∏ô‡πÄ‡∏ß‡∏•‡∏≤</p>
<p class="contract-table-line"><strong>‡∏ä‡πà‡∏ß‡∏á‡πÄ‡∏ß‡∏•‡∏≤‡∏ó‡∏µ‡πà‡πÅ‡∏à‡πâ‡∏á‡∏Å‡πà‡∏≠‡∏ô‡πÄ‡∏ß‡∏•‡∏≤‡∏ô‡∏±‡∏î</strong></p>
<p class="contract-table-line"><strong>‡πÅ‡∏ô‡∏ß‡∏ó‡∏≤‡∏á‡∏û‡∏¥‡∏à‡∏≤‡∏£‡∏ì‡∏≤</strong></p>
<p class="contract-table-line"><strong>‡∏Å‡∏£‡∏≠‡∏ö‡∏´‡∏±‡∏Å / ‡∏Ñ‡πà‡∏≤‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢</strong></p>
<p>‡∏°‡∏≤‡∏Å‡∏Å‡∏ß‡πà‡∏≤ 72 ‡∏ä‡∏±‡πà‡∏ß‡πÇ‡∏°‡∏á</p>
<p>‡πÅ‡∏à‡πâ‡∏á‡∏•‡πà‡∏ß‡∏á‡∏´‡∏ô‡πâ‡∏≤‡πÄ‡∏û‡∏µ‡∏¢‡∏á‡∏û‡∏≠ ‡∏´‡∏≤‡∏Å‡πÑ‡∏°‡πà‡πÑ‡∏î‡πâ‡πÄ‡∏Å‡∏¥‡∏î‡∏ã‡πâ‡∏≥‡∏ö‡πà‡∏≠‡∏¢</p>
<p>‡πÑ‡∏°‡πà‡∏´‡∏±‡∏Å ‡πÅ‡∏ï‡πà‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏ö‡∏±‡∏ô‡∏ó‡∏∂‡∏Å‡∏õ‡∏£‡∏∞‡∏ß‡∏±‡∏ï‡∏¥</p>
<p>48 - 72 ‡∏ä‡∏±‡πà‡∏ß‡πÇ‡∏°‡∏á</p>
<p>‡∏¢‡∏±‡∏á‡∏û‡∏≠‡∏à‡∏±‡∏î‡∏ó‡∏µ‡∏°‡∏ó‡∏î‡πÅ‡∏ó‡∏ô‡πÑ‡∏î‡πâ ‡πÅ‡∏ï‡πà‡∏´‡∏≤‡∏Å‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö‡∏ú‡∏•‡∏Å‡∏£‡∏∞‡∏ó‡∏ö</p>
<p>‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏≠‡∏≤‡∏à‡∏û‡∏¥‡∏à‡∏≤‡∏£‡∏ì‡∏≤</p>
<p>0 - 300 ‡∏ö‡∏≤‡∏ó/‡∏á‡∏≤‡∏ô</p>
<p>24 - 48 ‡∏ä‡∏±‡πà‡∏ß‡πÇ‡∏°‡∏á</p>
<p>‡∏Å‡∏£‡∏∞‡∏ó‡∏ö‡∏Å‡∏≤‡∏£‡∏à‡∏±‡∏î‡∏ó‡∏µ‡∏°‡πÅ‡∏•‡∏∞‡∏Å‡∏≤‡∏£‡∏ô‡∏±‡∏î‡∏´‡∏°‡∏≤‡∏¢‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡∏≠‡∏¢‡πà‡∏≤‡∏á‡∏°‡∏µ‡∏ô‡∏±‡∏¢‡∏™‡∏≥‡∏Ñ‡∏±‡∏ç</p>
<p>300 - 500 ‡∏ö‡∏≤‡∏ó/‡∏á‡∏≤‡∏ô</p>
<p>6 - 24 ‡∏ä‡∏±‡πà‡∏ß‡πÇ‡∏°‡∏á</p>
<p>‡∏ñ‡∏∑‡∏≠‡∏ß‡πà‡∏≤‡∏¢‡∏Å‡πÄ‡∏•‡∏¥‡∏Å‡∏Å‡∏∞‡∏ó‡∏±‡∏ô‡∏´‡∏±‡∏ô ‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏ï‡πâ‡∏≠‡∏á‡πÄ‡∏£‡πà‡∏á‡∏´‡∏≤‡∏ó‡∏µ‡∏°‡πÅ‡∏ó‡∏ô</p>
<p>500 - 1,000 ‡∏ö‡∏≤‡∏ó/‡∏á‡∏≤‡∏ô ‡∏´‡∏£‡∏∑‡∏≠‡∏Ñ‡πà‡∏≤‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏à‡∏£‡∏¥‡∏á</p>
<p>‡∏ß‡∏±‡∏ô‡∏á‡∏≤‡∏ô / ‡∏ô‡πâ‡∏≠‡∏¢‡∏Å‡∏ß‡πà‡∏≤ 6 ‡∏ä‡∏±‡πà‡∏ß‡πÇ‡∏°‡∏á</p>
<p>‡∏Å‡∏£‡∏∞‡∏ó‡∏ö‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡πÇ‡∏î‡∏¢‡∏ï‡∏£‡∏á</p>
<p>‡∏°‡∏µ‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏™‡∏µ‡πà‡∏¢‡∏á‡πÄ‡∏™‡∏µ‡∏¢‡∏ä‡∏∑‡πà‡∏≠‡πÄ‡∏™‡∏µ‡∏¢‡∏á‡πÅ‡∏•‡∏∞‡πÄ‡∏™‡∏µ‡∏¢‡∏Ñ‡πà‡∏≤‡∏à‡∏±‡∏î‡∏ó‡∏µ‡∏°‡∏â‡∏∏‡∏Å‡πÄ‡∏â‡∏¥‡∏ô</p>
<p>1,000 - 1,500 ‡∏ö‡∏≤‡∏ó/‡∏á‡∏≤‡∏ô ‡∏´‡∏£‡∏∑‡∏≠‡∏Ñ‡πà‡∏≤‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏à‡∏£‡∏¥‡∏á</p>
<p>‡πÑ‡∏°‡πà‡πÑ‡∏õ‡∏´‡∏ô‡πâ‡∏≤‡∏á‡∏≤‡∏ô / ‡∏ï‡∏¥‡∏î‡∏ï‡πà‡∏≠‡πÑ‡∏°‡πà‡πÑ‡∏î‡πâ /</p>
<p>‡∏ó‡∏¥‡πâ‡∏á‡∏á‡∏≤‡∏ô</p>
<p>‡∏ú‡∏¥‡∏î‡πÄ‡∏á‡∏∑‡πà‡∏≠‡∏ô‡πÑ‡∏Ç‡∏£‡πâ‡∏≤‡∏¢‡πÅ‡∏£‡∏á</p>
<p>1,500 - 3,000 ‡∏ö‡∏≤‡∏ó/‡∏á‡∏≤‡∏ô + ‡∏Ñ‡πà‡∏≤‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏à‡∏£‡∏¥‡∏á +</p>
<p>‡∏≠‡∏≤‡∏à‡∏á‡∏î‡∏à‡πà‡∏≤‡∏¢‡∏á‡∏≤‡∏ô‡∏ô‡∏±‡πâ‡∏ô</p>
<ul>
<li>‡∏Å‡∏£‡∏≠‡∏ö‡∏´‡∏±‡∏Å‡∏Ç‡πâ‡∏≤‡∏á‡∏ï‡πâ‡∏ô‡πÄ‡∏õ‡πá‡∏ô‡∏Ñ‡πà‡∏≤‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡πÄ‡∏ö‡∏∑‡πâ‡∏≠‡∏á‡∏ï‡πâ‡∏ô ‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏°‡∏µ‡∏™‡∏¥‡∏ó‡∏ò‡∏¥‡∏´‡∏±‡∏Å‡∏ï‡∏≤‡∏°‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏à‡∏£‡∏¥‡∏á ‡∏´‡∏≤‡∏Å‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏™‡∏π‡∏á‡∏Å‡∏ß‡πà‡∏≤‡∏Å‡∏£‡∏≠‡∏ö‡∏î‡∏±‡∏á‡∏Å‡∏•‡πà‡∏≤‡∏ß ‡πÄ‡∏ä‡πà‡∏ô ‡∏Ñ‡πà‡∏≤‡∏ä‡∏î‡πÄ‡∏ä‡∏¢‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤</li>
</ul>
<p>‡∏Ñ‡πà‡∏≤‡πÄ‡∏î‡∏¥‡∏ô‡∏ó‡∏≤‡∏á‡∏ó‡∏µ‡∏°‡∏ó‡∏î‡πÅ‡∏ó‡∏ô ‡∏Ñ‡πà‡∏≤‡∏Ñ‡∏≠‡∏°‡πÄ‡∏û‡∏•‡∏ô ‡∏´‡∏£‡∏∑‡∏≠‡∏Ñ‡πà‡∏≤‡πÉ‡∏ä‡πâ‡∏à‡πà‡∏≤‡∏¢‡∏≠‡∏∑‡πà‡∏ô‡∏ó‡∏µ‡πà‡∏û‡∏¥‡∏™‡∏π‡∏à‡∏ô‡πå‡πÑ‡∏î‡πâ</p>
<ul>
<li>‡∏´‡∏≤‡∏Å‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏°‡∏µ‡πÄ‡∏´‡∏ï‡∏∏‡∏â‡∏∏‡∏Å‡πÄ‡∏â‡∏¥‡∏ô‡∏à‡∏£‡∏¥‡∏á ‡πÄ‡∏ä‡πà‡∏ô ‡∏≠‡∏∏‡∏ö‡∏±‡∏ï‡∏¥‡πÄ‡∏´‡∏ï‡∏∏ ‡πÄ‡∏à‡πá‡∏ö‡∏õ‡πà‡∏ß‡∏¢‡∏Å‡∏∞‡∏ó‡∏±‡∏ô‡∏´‡∏±‡∏ô ‡∏´‡∏£‡∏∑‡∏≠‡πÄ‡∏´‡∏ï‡∏∏‡∏™‡∏∏‡∏î‡∏ß‡∏¥‡∏™‡∏±‡∏¢ ‡∏ï‡πâ‡∏≠‡∏á‡πÅ‡∏à‡πâ‡∏á‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏ó‡∏±‡∏ô‡∏ó‡∏µ‡πÅ‡∏•‡∏∞‡∏™‡πà‡∏á‡∏´‡∏•‡∏±‡∏Å‡∏ê‡∏≤‡∏ô‡∏ï‡∏≤‡∏°‡∏™‡∏°‡∏Ñ‡∏ß‡∏£</li>
</ul>
<p>‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏≠‡∏≤‡∏à‡∏¢‡∏Å‡πÄ‡∏ß‡πâ‡∏ô‡∏´‡∏£‡∏∑‡∏≠‡∏•‡∏î‡∏Å‡∏≤‡∏£‡∏´‡∏±‡∏Å‡∏ï‡∏≤‡∏°‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏´‡∏°‡∏≤‡∏∞‡∏™‡∏°</p>
<ul>
<li>‡∏´‡∏≤‡∏Å‡∏¢‡∏Å‡πÄ‡∏•‡∏¥‡∏Å‡∏´‡∏£‡∏∑‡∏≠‡πÄ‡∏•‡∏∑‡πà‡∏≠‡∏ô‡∏á‡∏≤‡∏ô‡∏ö‡πà‡∏≠‡∏¢‡πÄ‡∏Å‡∏¥‡∏ô‡∏™‡∏°‡∏Ñ‡∏ß‡∏£ ‡πÄ‡∏ä‡πà‡∏ô 3 ‡∏Ñ‡∏£‡∏±‡πâ‡∏á‡∏†‡∏≤‡∏¢‡πÉ‡∏ô 60 ‡∏ß‡∏±‡∏ô ‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏°‡∏µ‡∏™‡∏¥‡∏ó‡∏ò‡∏¥‡∏£‡∏∞‡∏á‡∏±‡∏ö‡∏Å‡∏≤‡∏£‡∏™‡πà‡∏á‡∏á‡∏≤‡∏ô‡πÉ‡∏´‡∏°‡πà ‡∏•‡∏î‡∏•‡∏≥‡∏î‡∏±‡∏ö‡∏Å‡∏≤‡∏£‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô ‡∏´‡∏£‡∏∑‡∏≠‡∏¢‡∏∏‡∏ï‡∏¥‡∏™‡∏±‡∏ç‡∏ç‡∏≤</li>
<li>‡∏´‡∏≤‡∏Å‡πÄ‡∏õ‡πá‡∏ô‡∏á‡∏≤‡∏ô‡∏î‡πà‡∏ß‡∏ô ‡∏á‡∏≤‡∏ô‡∏•‡πá‡∏≠‡∏Å‡∏Ñ‡∏¥‡∏ß ‡∏´‡∏£‡∏∑‡∏≠‡∏°‡∏µ‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡∏Ñ‡∏≠‡∏ô‡πÄ‡∏ü‡∏¥‡∏£‡πå‡∏°‡πÄ‡∏Ç‡πâ‡∏≤‡∏û‡∏∑‡πâ‡∏ô‡∏ó‡∏µ‡πà‡πÅ‡∏•‡πâ‡∏ß ‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏Ñ‡∏ß‡∏£‡πÅ‡∏à‡πâ‡∏á‡∏•‡πà‡∏ß‡∏á‡∏´‡∏ô‡πâ‡∏≤‡∏≠‡∏¢‡πà‡∏≤‡∏á‡∏ô‡πâ‡∏≠‡∏¢ 72 ‡∏ä‡∏±‡πà‡∏ß‡πÇ‡∏°‡∏á ‡πÄ‡∏ß‡πâ‡∏ô‡πÅ‡∏ï‡πà‡πÄ‡∏õ‡πá‡∏ô‡πÄ‡∏´‡∏ï‡∏∏‡∏â‡∏∏‡∏Å‡πÄ‡∏â‡∏¥‡∏ô‡∏à‡∏£‡∏¥‡∏á</li>
<li>‡∏Å‡∏≤‡∏£‡∏¢‡∏∏‡∏ï‡∏¥‡∏Å‡∏≤‡∏£‡∏£‡πà‡∏ß‡∏°‡∏á‡∏≤‡∏ô‡∏ó‡∏±‡πâ‡∏á‡∏£‡∏∞‡∏ö‡∏ö ‡πÑ‡∏°‡πà‡πÉ‡∏ä‡πà‡∏Å‡∏≤‡∏£‡∏¢‡∏Å‡πÄ‡∏•‡∏¥‡∏Å‡∏á‡∏≤‡∏ô‡∏£‡∏≤‡∏¢‡∏ß‡∏±‡∏ô ‡∏ï‡πâ‡∏≠‡∏á‡πÅ‡∏à‡πâ‡∏á‡∏•‡πà‡∏ß‡∏á‡∏´‡∏ô‡πâ‡∏≤‡∏≠‡∏¢‡πà‡∏≤‡∏á‡∏ô‡πâ‡∏≠‡∏¢ 15 ‡∏ß‡∏±‡∏ô ‡πÅ‡∏•‡∏∞‡∏ï‡πâ‡∏≠‡∏á‡πÄ‡∏Ñ‡∏•‡∏µ‡∏¢‡∏£‡πå‡∏á‡∏≤‡∏ô‡∏Ñ‡πâ‡∏≤‡∏á ‡∏á‡∏≤‡∏ô‡∏£‡∏±‡∏ö‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô</li>
</ul>
<p>‡πÅ‡∏•‡∏∞‡∏≠‡∏∏‡∏õ‡∏Å‡∏£‡∏ì‡πå‡πÉ‡∏´‡πâ‡∏Ñ‡∏£‡∏ö</p>
<h3>11. ‡∏Å‡∏≤‡∏£‡∏õ‡πâ‡∏≠‡∏á‡∏Å‡∏±‡∏ô‡∏õ‡∏±‡∏ç‡∏´‡∏≤‡∏ó‡∏¥‡πâ‡∏á‡∏á‡∏≤‡∏ô</h3>
<p>‡∏ñ‡∏∑‡∏≠‡∏ß‡πà‡∏≤‡πÄ‡∏õ‡πá‡∏ô‡∏Å‡∏≤‡∏£‡∏ó‡∏¥‡πâ‡∏á‡∏á‡∏≤‡∏ô‡∏´‡∏£‡∏∑‡∏≠‡∏ú‡∏¥‡∏î‡πÄ‡∏á‡∏∑‡πà‡∏≠‡∏ô‡πÑ‡∏Ç‡∏£‡πâ‡∏≤‡∏¢‡πÅ‡∏£‡∏á ‡∏´‡∏≤‡∏Å‡πÄ‡∏Å‡∏¥‡∏î‡∏Å‡∏£‡∏ì‡∏µ‡πÉ‡∏î‡∏Å‡∏£‡∏ì‡∏µ‡∏´‡∏ô‡∏∂‡πà‡∏á‡∏ï‡πà‡∏≠‡πÑ‡∏õ‡∏ô‡∏µ‡πâ</p>
<ul>
<li>‡∏Å‡∏î‡∏¢‡∏∑‡∏ô‡∏¢‡∏±‡∏ô‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô‡πÅ‡∏•‡πâ‡∏ß‡πÑ‡∏°‡πà‡πÑ‡∏õ‡∏´‡∏ô‡πâ‡∏≤‡∏á‡∏≤‡∏ô ‡∏´‡∏£‡∏∑‡∏≠‡πÑ‡∏°‡πà‡∏™‡∏≤‡∏°‡∏≤‡∏£‡∏ñ‡∏ï‡∏¥‡∏î‡∏ï‡πà‡∏≠‡πÑ‡∏î‡πâ‡πÉ‡∏ô‡πÄ‡∏ß‡∏•‡∏≤‡∏ó‡∏µ‡πà‡∏Ñ‡∏ß‡∏£‡∏õ‡∏è‡∏¥‡∏ö‡∏±‡∏ï‡∏¥‡∏á‡∏≤‡∏ô</li>
<li>‡πÄ‡∏Ç‡πâ‡∏≤‡∏´‡∏ô‡πâ‡∏≤‡∏á‡∏≤‡∏ô‡πÅ‡∏•‡πâ‡∏ß‡∏≠‡∏≠‡∏Å‡∏à‡∏≤‡∏Å‡∏´‡∏ô‡πâ‡∏≤‡∏á‡∏≤‡∏ô‡∏Å‡πà‡∏≠‡∏ô‡∏á‡∏≤‡∏ô‡πÄ‡∏™‡∏£‡πá‡∏à ‡πÇ‡∏î‡∏¢‡πÑ‡∏°‡πà‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö‡∏≠‡∏ô‡∏∏‡∏ç‡∏≤‡∏ï‡∏à‡∏≤‡∏Å‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó</li>
<li>‡∏¢‡∏Å‡πÄ‡∏•‡∏¥‡∏Å‡∏á‡∏≤‡∏ô‡∏Å‡∏∞‡∏ó‡∏±‡∏ô‡∏´‡∏±‡∏ô‡πÇ‡∏î‡∏¢‡πÑ‡∏°‡πà‡∏°‡∏µ‡πÄ‡∏´‡∏ï‡∏∏‡∏à‡∏≥‡πÄ‡∏õ‡πá‡∏ô‡∏™‡∏°‡∏Ñ‡∏ß‡∏£ ‡∏ó‡∏≥‡πÉ‡∏´‡πâ‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏´‡∏£‡∏∑‡∏≠‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏ï‡πâ‡∏≠‡∏á‡∏à‡∏±‡∏î‡∏ó‡∏µ‡∏°‡∏ó‡∏î‡πÅ‡∏ó‡∏ô‡πÄ‡∏£‡πà‡∏á‡∏î‡πà‡∏ß‡∏ô</li>
<li>‡∏õ‡∏è‡∏¥‡πÄ‡∏™‡∏ò‡∏Å‡∏≤‡∏£‡∏Å‡∏•‡∏±‡∏ö‡πÑ‡∏õ‡πÅ‡∏Å‡πâ‡∏á‡∏≤‡∏ô‡∏ó‡∏µ‡πà‡πÄ‡∏Å‡∏¥‡∏î‡∏à‡∏≤‡∏Å‡∏Ñ‡∏ß‡∏≤‡∏°‡∏ú‡∏¥‡∏î‡∏û‡∏•‡∏≤‡∏î‡∏Ç‡∏≠‡∏á‡∏ï‡∏ô‡πÄ‡∏≠‡∏á</li>
<li>‡∏£‡∏±‡∏ö‡πÄ‡∏á‡∏¥‡∏ô‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡πÄ‡∏≠‡∏á‡∏´‡∏£‡∏∑‡∏≠‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô‡∏ï‡πà‡∏≠‡πÄ‡∏≠‡∏á ‡πÅ‡∏•‡πâ‡∏ß‡∏ó‡∏≥‡πÉ‡∏´‡πâ‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡πÑ‡∏°‡πà‡∏™‡∏≤‡∏°‡∏≤‡∏£‡∏ñ‡∏Ñ‡∏ß‡∏ö‡∏Ñ‡∏∏‡∏°‡∏Ñ‡∏∏‡∏ì‡∏†‡∏≤‡∏û‡πÅ‡∏•‡∏∞‡∏Å‡∏≤‡∏£‡∏£‡∏±‡∏ö‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô‡∏á‡∏≤‡∏ô‡πÑ‡∏î‡πâ</li>
</ul>
<p>‡∏ú‡∏•‡∏Ç‡∏≠‡∏á‡∏Å‡∏≤‡∏£‡∏ó‡∏¥‡πâ‡∏á‡∏á‡∏≤‡∏ô</p>
<ul>
<li>‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏°‡∏µ‡∏™‡∏¥‡∏ó‡∏ò‡∏¥‡∏á‡∏î‡∏à‡πà‡∏≤‡∏¢‡∏Ñ‡πà‡∏≤‡∏ï‡∏≠‡∏ö‡πÅ‡∏ó‡∏ô‡∏Ç‡∏≠‡∏á‡∏á‡∏≤‡∏ô‡∏ô‡∏±‡πâ‡∏ô‡∏ó‡∏±‡πâ‡∏á‡∏´‡∏°‡∏î‡∏´‡∏£‡∏∑‡∏≠‡∏ö‡∏≤‡∏á‡∏™‡πà‡∏ß‡∏ô</li>
<li>‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏°‡∏µ‡∏™‡∏¥‡∏ó‡∏ò‡∏¥‡∏´‡∏±‡∏Å‡∏Ñ‡πà‡∏≤‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏à‡∏£‡∏¥‡∏á‡∏à‡∏≤‡∏Å‡∏Ñ‡πà‡∏≤‡∏ï‡∏≠‡∏ö‡πÅ‡∏ó‡∏ô‡∏Ñ‡πâ‡∏≤‡∏á‡∏à‡πà‡∏≤‡∏¢‡∏´‡∏£‡∏∑‡∏≠‡πÄ‡∏á‡∏¥‡∏ô‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢</li>
<li>‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏°‡∏µ‡∏™‡∏¥‡∏ó‡∏ò‡∏¥‡∏£‡∏∞‡∏á‡∏±‡∏ö‡∏Å‡∏≤‡∏£‡∏™‡πà‡∏á‡∏á‡∏≤‡∏ô‡πÉ‡∏´‡∏°‡πà ‡∏¢‡∏Å‡πÄ‡∏•‡∏¥‡∏Å‡∏™‡∏ñ‡∏≤‡∏ô‡∏∞‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå ‡∏´‡∏£‡∏∑‡∏≠‡∏¢‡∏∏‡∏ï‡∏¥‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡∏ó‡∏±‡∏ô‡∏ó‡∏µ</li>
</ul>
<h3>12. ‡∏Ç‡πâ‡∏≠‡∏´‡πâ‡∏≤‡∏°‡πÄ‡∏£‡∏∑‡πà‡∏≠‡∏á‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤ ‡πÄ‡∏á‡∏¥‡∏ô‡∏™‡∏î ‡∏á‡∏≤‡∏ô‡∏ô‡∏≠‡∏Å‡∏£‡∏∞‡∏ö‡∏ö ‡πÅ‡∏•‡∏∞‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•‡∏†‡∏≤‡∏¢‡πÉ‡∏ô</h3>
<ul>
<li>‡∏´‡πâ‡∏≤‡∏°‡∏£‡∏±‡∏ö‡πÄ‡∏á‡∏¥‡∏ô‡∏à‡∏≤‡∏Å‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡πÄ‡∏≠‡∏á ‡πÄ‡∏ß‡πâ‡∏ô‡πÅ‡∏ï‡πà‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏≠‡∏ô‡∏∏‡∏ç‡∏≤‡∏ï‡πÄ‡∏õ‡πá‡∏ô‡∏£‡∏≤‡∏¢‡∏á‡∏≤‡∏ô‡πÅ‡∏•‡∏∞‡∏ï‡πâ‡∏≠‡∏á‡∏™‡πà‡∏á‡∏´‡∏•‡∏±‡∏Å‡∏ê‡∏≤‡∏ô‡πÉ‡∏´‡πâ‡∏Ñ‡∏£‡∏ö</li>
<li>‡∏´‡πâ‡∏≤‡∏°‡πÄ‡∏™‡∏ô‡∏≠‡∏£‡∏≤‡∏Ñ‡∏≤‡πÉ‡∏´‡∏°‡πà ‡∏´‡πâ‡∏≤‡∏°‡πÄ‡∏û‡∏¥‡πà‡∏°‡∏á‡∏≤‡∏ô ‡∏´‡πâ‡∏≤‡∏°‡∏•‡∏î‡∏£‡∏≤‡∏Ñ‡∏≤ ‡∏´‡∏£‡∏∑‡∏≠‡πÄ‡∏õ‡∏•‡∏µ‡πà‡∏¢‡∏ô‡πÄ‡∏á‡∏∑‡πà‡∏≠‡∏ô‡πÑ‡∏Ç‡∏Å‡∏±‡∏ö‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡πÄ‡∏≠‡∏á‡πÇ‡∏î‡∏¢‡πÑ‡∏°‡πà‡∏ú‡πà‡∏≤‡∏ô‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó</li>
<li>‡∏´‡πâ‡∏≤‡∏°‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô‡∏ï‡πà‡∏≠‡πÇ‡∏î‡∏¢‡∏ï‡∏£‡∏á‡∏à‡∏≤‡∏Å‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡∏ó‡∏µ‡πà‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏à‡∏±‡∏î‡∏´‡∏≤‡πÉ‡∏´‡πâ ‡∏ó‡∏±‡πâ‡∏á‡∏£‡∏∞‡∏´‡∏ß‡πà‡∏≤‡∏á‡∏£‡πà‡∏ß‡∏°‡∏á‡∏≤‡∏ô‡πÅ‡∏•‡∏∞‡∏†‡∏≤‡∏¢‡πÉ‡∏ô 12 ‡πÄ‡∏î‡∏∑‡∏≠‡∏ô‡∏´‡∏•‡∏±‡∏á‡∏™‡∏¥‡πâ‡∏ô‡∏™‡∏∏‡∏î‡∏Å‡∏≤‡∏£‡∏£‡πà‡∏ß‡∏°‡∏á‡∏≤‡∏ô</li>
</ul>
<p>‡πÄ‡∏ß‡πâ‡∏ô‡πÅ‡∏ï‡πà‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö‡∏≠‡∏ô‡∏∏‡∏ç‡∏≤‡∏ï‡πÄ‡∏õ‡πá‡∏ô‡∏•‡∏≤‡∏¢‡∏•‡∏±‡∏Å‡∏©‡∏ì‡πå‡∏≠‡∏±‡∏Å‡∏©‡∏£</p>
<ul>
<li>‡∏´‡πâ‡∏≤‡∏°‡∏ô‡∏≥‡πÄ‡∏ö‡∏≠‡∏£‡πå‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤ ‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤ ‡∏£‡∏≤‡∏Ñ‡∏≤ ‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£ ‡∏£‡∏π‡∏õ‡∏†‡∏≤‡∏û ‡∏´‡∏£‡∏∑‡∏≠‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•‡πÉ‡∏ô‡∏£‡∏∞‡∏ö‡∏ö‡∏Ç‡∏≠‡∏á‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡πÑ‡∏õ‡πÉ‡∏ä‡πâ‡∏™‡πà‡∏ß‡∏ô‡∏ï‡∏±‡∏ß‡∏´‡∏£‡∏∑‡∏≠‡∏™‡πà‡∏á‡∏ï‡πà‡∏≠‡πÉ‡∏´‡πâ‡∏ö‡∏∏‡∏Ñ‡∏Ñ‡∏•‡∏≠‡∏∑‡πà‡∏ô</li>
<li>‡∏´‡∏≤‡∏Å‡∏°‡∏µ‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡∏ï‡∏¥‡∏î‡∏ï‡πà‡∏≠‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡πÇ‡∏î‡∏¢‡∏ï‡∏£‡∏á‡∏à‡∏≤‡∏Å‡∏á‡∏≤‡∏ô‡∏Ç‡∏≠‡∏á‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó ‡∏ï‡πâ‡∏≠‡∏á‡πÅ‡∏à‡πâ‡∏á‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡πÅ‡∏•‡∏∞‡πÉ‡∏´‡πâ‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡∏à‡∏≠‡∏á‡∏ú‡πà‡∏≤‡∏ô‡∏ä‡πà‡∏≠‡∏á‡∏ó‡∏≤‡∏á‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡πÄ‡∏ó‡πà‡∏≤‡∏ô‡∏±‡πâ‡∏ô</li>
<li>‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏ï‡πâ‡∏≠‡∏á‡∏£‡∏±‡∏Å‡∏©‡∏≤‡∏Ñ‡∏ß‡∏≤‡∏°‡∏•‡∏±‡∏ö‡∏ó‡∏≤‡∏á‡∏Å‡∏≤‡∏£‡∏Ñ‡πâ‡∏≤ ‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤ ‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•‡∏£‡∏≤‡∏Ñ‡∏≤ ‡∏£‡∏≤‡∏¢‡∏•‡∏∞‡πÄ‡∏≠‡∏µ‡∏¢‡∏î‡∏á‡∏≤‡∏ô ‡∏£‡∏π‡∏õ‡∏†‡∏≤‡∏û‡∏´‡∏ô‡πâ‡∏≤‡∏á‡∏≤‡∏ô ‡πÅ‡∏•‡∏∞‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•‡πÉ‡∏ô‡∏£‡∏∞‡∏ö‡∏ö‡∏Ç‡∏≠‡∏á‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó</li>
</ul>
<p>‡∏ó‡∏±‡πâ‡∏á‡∏£‡∏∞‡∏´‡∏ß‡πà‡∏≤‡∏á‡∏£‡πà‡∏ß‡∏°‡∏á‡∏≤‡∏ô‡πÅ‡∏•‡∏∞‡∏´‡∏•‡∏±‡∏á‡∏™‡∏¥‡πâ‡∏ô‡∏™‡∏∏‡∏î‡∏Å‡∏≤‡∏£‡∏£‡πà‡∏ß‡∏°‡∏á‡∏≤‡∏ô</p>
<ul>
<li>‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏ï‡πâ‡∏≠‡∏á‡πÉ‡∏ä‡πâ‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•‡∏™‡πà‡∏ß‡∏ô‡∏ö‡∏∏‡∏Ñ‡∏Ñ‡∏•‡∏Ç‡∏≠‡∏á‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡πÄ‡∏ó‡πà‡∏≤‡∏ó‡∏µ‡πà‡∏à‡∏≥‡πÄ‡∏õ‡πá‡∏ô‡∏ï‡πà‡∏≠‡∏Å‡∏≤‡∏£‡∏õ‡∏è‡∏¥‡∏ö‡∏±‡∏ï‡∏¥‡∏á‡∏≤‡∏ô‡∏ó‡∏µ‡πà‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏°‡∏≠‡∏ö‡∏´‡∏°‡∏≤‡∏¢‡πÄ‡∏ó‡πà‡∏≤‡∏ô‡∏±‡πâ‡∏ô</li>
</ul>
<p>‡∏´‡πâ‡∏≤‡∏°‡∏ô‡∏≥‡πÑ‡∏õ‡πÉ‡∏ä‡πâ‡πÄ‡∏û‡∏∑‡πà‡∏≠‡∏ß‡∏±‡∏ï‡∏ñ‡∏∏‡∏õ‡∏£‡∏∞‡∏™‡∏á‡∏Ñ‡πå‡∏≠‡∏∑‡πà‡∏ô‡πÇ‡∏î‡∏¢‡πÑ‡∏°‡πà‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö‡∏≠‡∏ô‡∏∏‡∏ç‡∏≤‡∏ï</p>
<h3>13. ‡∏ó‡∏£‡∏±‡∏û‡∏¢‡πå‡∏™‡∏¥‡∏ô‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó ‡∏¢‡∏π‡∏ô‡∏¥‡∏ü‡∏≠‡∏£‡πå‡∏° ‡∏ö‡∏±‡∏ï‡∏£‡∏ä‡πà‡∏≤‡∏á ‡πÅ‡∏•‡∏∞‡∏Å‡∏≤‡∏£‡πÉ‡∏ä‡πâ‡∏ä‡∏∑‡πà‡∏≠‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó</h3>
<ul>
<li>‡∏ó‡∏£‡∏±‡∏û‡∏¢‡πå‡∏™‡∏¥‡∏ô ‡∏≠‡∏∏‡∏õ‡∏Å‡∏£‡∏ì‡πå ‡πÄ‡∏™‡∏∑‡πâ‡∏≠‡∏¢‡∏π‡∏ô‡∏¥‡∏ü‡∏≠‡∏£‡πå‡∏° ‡∏ö‡∏±‡∏ï‡∏£‡∏õ‡∏£‡∏∞‡∏à‡∏≥‡∏ï‡∏±‡∏ß ‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£ ‡∏´‡∏£‡∏∑‡∏≠‡∏™‡∏¥‡πà‡∏á‡∏Ç‡∏≠‡∏á‡∏ó‡∏µ‡πà‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏°‡∏≠‡∏ö‡πÉ‡∏´‡πâ‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡πÄ‡∏û‡∏∑‡πà‡∏≠‡πÉ‡∏ä‡πâ‡πÉ‡∏ô‡∏Å‡∏≤‡∏£‡∏ó‡∏≥‡∏á‡∏≤‡∏ô ‡∏¢‡∏±‡∏á‡πÄ‡∏õ‡πá‡∏ô‡∏Å‡∏£‡∏£‡∏°‡∏™‡∏¥‡∏ó‡∏ò‡∏¥‡πå‡∏Ç‡∏≠‡∏á‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó</li>
<li>‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏ï‡πâ‡∏≠‡∏á‡∏î‡∏π‡πÅ‡∏•‡∏£‡∏±‡∏Å‡∏©‡∏≤‡∏ó‡∏£‡∏±‡∏û‡∏¢‡πå‡∏™‡∏¥‡∏ô‡∏Ç‡∏≠‡∏á‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡πÅ‡∏•‡∏∞‡∏Ñ‡∏∑‡∏ô‡πÉ‡∏´‡πâ‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡πÄ‡∏°‡∏∑‡πà‡∏≠‡∏™‡∏¥‡πâ‡∏ô‡∏™‡∏∏‡∏î‡∏Å‡∏≤‡∏£‡∏£‡πà‡∏ß‡∏°‡∏á‡∏≤‡∏ô ‡∏´‡∏≤‡∏Å‡∏™‡∏π‡∏ç‡∏´‡∏≤‡∏¢‡∏´‡∏£‡∏∑‡∏≠‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏à‡∏≤‡∏Å‡∏Ñ‡∏ß‡∏≤‡∏°‡∏õ‡∏£‡∏∞‡∏°‡∏≤‡∏ó</li>
</ul>
<p>‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏°‡∏µ‡∏™‡∏¥‡∏ó‡∏ò‡∏¥‡∏´‡∏±‡∏Å‡∏Ñ‡πà‡∏≤‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏ï‡∏≤‡∏°‡∏à‡∏£‡∏¥‡∏á‡∏à‡∏≤‡∏Å‡∏Ñ‡πà‡∏≤‡∏ï‡∏≠‡∏ö‡πÅ‡∏ó‡∏ô‡∏´‡∏£‡∏∑‡∏≠‡πÄ‡∏á‡∏¥‡∏ô‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô</p>
<ul>
<li>‡∏´‡∏•‡∏±‡∏á‡∏™‡∏¥‡πâ‡∏ô‡∏™‡∏∏‡∏î‡∏Å‡∏≤‡∏£‡∏£‡πà‡∏ß‡∏°‡∏á‡∏≤‡∏ô ‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡πÑ‡∏°‡πà‡∏°‡∏µ‡∏™‡∏¥‡∏ó‡∏ò‡∏¥‡πÉ‡∏ä‡πâ‡∏ä‡∏∑‡πà‡∏≠ ‡πÇ‡∏•‡πÇ‡∏Å‡πâ ‡∏£‡∏π‡∏õ‡∏†‡∏≤‡∏û ‡∏¢‡∏π‡∏ô‡∏¥‡∏ü‡∏≠‡∏£‡πå‡∏° ‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£ ‡∏ä‡πà‡∏≠‡∏á‡∏ó‡∏≤‡∏á‡∏ï‡∏¥‡∏î‡∏ï‡πà‡∏≠ ‡∏´‡∏£‡∏∑‡∏≠‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•‡∏Ç‡∏≠‡∏á Coldwindflow Air Services</li>
</ul>
<p>‡πÄ‡∏û‡∏∑‡πà‡∏≠‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô‡∏™‡πà‡∏ß‡∏ô‡∏ï‡∏±‡∏ß ‡∏´‡∏£‡∏∑‡∏≠‡∏ó‡∏≥‡πÉ‡∏´‡πâ‡∏ö‡∏∏‡∏Ñ‡∏Ñ‡∏•‡∏†‡∏≤‡∏¢‡∏ô‡∏≠‡∏Å‡πÄ‡∏Ç‡πâ‡∏≤‡πÉ‡∏à‡∏ß‡πà‡∏≤‡∏¢‡∏±‡∏á‡πÄ‡∏õ‡πá‡∏ô‡∏ï‡∏±‡∏ß‡πÅ‡∏ó‡∏ô‡∏Ç‡∏≠‡∏á‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó ‡πÄ‡∏ß‡πâ‡∏ô‡πÅ‡∏ï‡πà‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö‡∏≠‡∏ô‡∏∏‡∏ç‡∏≤‡∏ï‡πÄ‡∏õ‡πá‡∏ô‡∏•‡∏≤‡∏¢‡∏•‡∏±‡∏Å‡∏©‡∏ì‡πå‡∏≠‡∏±‡∏Å‡∏©‡∏£</p>
<h3>14. ‡∏Å‡∏≤‡∏£‡∏£‡∏±‡∏ö‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô‡∏á‡∏≤‡∏ô‡πÅ‡∏•‡∏∞‡∏Å‡∏≤‡∏£‡∏Å‡∏•‡∏±‡∏ö‡πÑ‡∏õ‡πÅ‡∏Å‡πâ‡∏á‡∏≤‡∏ô</h3>
<ul>
<li>‡∏´‡∏≤‡∏Å‡πÄ‡∏Å‡∏¥‡∏î‡∏õ‡∏±‡∏ç‡∏´‡∏≤‡∏à‡∏≤‡∏Å‡∏Ñ‡∏ß‡∏≤‡∏°‡∏ú‡∏¥‡∏î‡∏û‡∏•‡∏≤‡∏î‡πÉ‡∏ô‡∏Å‡∏≤‡∏£‡∏ó‡∏≥‡∏á‡∏≤‡∏ô‡∏Ç‡∏≠‡∏á‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå ‡πÄ‡∏ä‡πà‡∏ô ‡∏õ‡∏£‡∏∞‡∏Å‡∏≠‡∏ö‡πÑ‡∏°‡πà‡∏Ñ‡∏£‡∏ö ‡∏ô‡πâ‡∏≥‡∏£‡∏±‡πà‡∏ß‡∏à‡∏≤‡∏Å‡∏Å‡∏≤‡∏£‡∏•‡πâ‡∏≤‡∏á ‡∏ó‡∏≥‡∏Ñ‡∏ß‡∏≤‡∏°‡∏™‡∏∞‡∏≠‡∏≤‡∏î‡πÑ‡∏°‡πà‡∏Ñ‡∏£‡∏ö</li>
</ul>
<p>‡∏´‡∏£‡∏∑‡∏≠‡πÄ‡∏Å‡∏¥‡∏î‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏à‡∏≤‡∏Å‡∏Ñ‡∏ß‡∏≤‡∏°‡∏õ‡∏£‡∏∞‡∏°‡∏≤‡∏ó ‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏ï‡πâ‡∏≠‡∏á‡πÉ‡∏´‡πâ‡∏Ñ‡∏ß‡∏≤‡∏°‡∏£‡πà‡∏ß‡∏°‡∏°‡∏∑‡∏≠‡πÉ‡∏ô‡∏Å‡∏≤‡∏£‡∏ï‡∏£‡∏ß‡∏à‡∏™‡∏≠‡∏ö‡πÅ‡∏•‡∏∞‡πÅ‡∏Å‡πâ‡πÑ‡∏Ç</p>
<ul>
<li>‡∏Å‡∏£‡∏ì‡∏µ‡∏ï‡πâ‡∏≠‡∏á‡∏Å‡∏•‡∏±‡∏ö‡πÑ‡∏õ‡πÅ‡∏Å‡πâ‡∏á‡∏≤‡∏ô‡∏à‡∏≤‡∏Å‡∏Ñ‡∏ß‡∏≤‡∏°‡∏ú‡∏¥‡∏î‡∏Ç‡∏≠‡∏á‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå ‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏≠‡∏≤‡∏à‡πÉ‡∏´‡πâ‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏Å‡∏•‡∏±‡∏ö‡πÑ‡∏õ‡πÅ‡∏Å‡πâ‡πÇ‡∏î‡∏¢‡πÑ‡∏°‡πà‡∏°‡∏µ‡∏Ñ‡πà‡∏≤‡∏ï‡∏≠‡∏ö‡πÅ‡∏ó‡∏ô‡πÄ‡∏û‡∏¥‡πà‡∏°</li>
</ul>
<p>‡∏´‡∏£‡∏∑‡∏≠‡∏´‡∏±‡∏Å‡∏Ñ‡πà‡∏≤‡πÄ‡∏î‡∏¥‡∏ô‡∏ó‡∏≤‡∏á/‡∏Ñ‡πà‡∏≤‡πÅ‡∏£‡∏á‡∏Ç‡∏≠‡∏á‡∏ó‡∏µ‡∏°‡∏ó‡∏µ‡πà‡πÄ‡∏Ç‡πâ‡∏≤‡πÑ‡∏õ‡πÅ‡∏Å‡πâ‡πÅ‡∏ó‡∏ô‡∏ï‡∏≤‡∏°‡∏à‡∏£‡∏¥‡∏á</p>
<ul>
<li>‡∏´‡∏≤‡∏Å‡∏á‡∏≤‡∏ô‡πÄ‡∏Ñ‡∏•‡∏°‡πÄ‡∏Å‡∏¥‡∏î‡∏à‡∏≤‡∏Å‡∏™‡∏†‡∏≤‡∏û‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡πÄ‡∏î‡∏¥‡∏° ‡∏≠‡∏≤‡∏¢‡∏∏‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á ‡∏´‡∏£‡∏∑‡∏≠‡∏õ‡∏±‡∏à‡∏à‡∏±‡∏¢‡∏ô‡∏≠‡∏Å‡πÄ‡∏´‡∏ô‡∏∑‡∏≠‡∏Å‡∏≤‡∏£‡∏Ñ‡∏ß‡∏ö‡∏Ñ‡∏∏‡∏° ‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏à‡∏∞‡∏û‡∏¥‡∏à‡∏≤‡∏£‡∏ì‡∏≤‡∏ï‡∏≤‡∏°‡∏´‡∏•‡∏±‡∏Å‡∏ê‡∏≤‡∏ô‡∏à‡∏£‡∏¥‡∏á‡πÅ‡∏•‡∏∞‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏õ‡πá‡∏ô‡∏ò‡∏£‡∏£‡∏°</li>
<li>‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏ï‡πâ‡∏≠‡∏á‡πÑ‡∏°‡πà‡∏õ‡∏è‡∏¥‡πÄ‡∏™‡∏ò‡∏Å‡∏≤‡∏£‡∏ï‡∏£‡∏ß‡∏à‡∏™‡∏≠‡∏ö‡∏á‡∏≤‡∏ô ‡∏´‡∏≤‡∏Å‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏°‡∏µ‡∏´‡∏•‡∏±‡∏Å‡∏ê‡∏≤‡∏ô‡∏ß‡πà‡∏≤‡∏õ‡∏±‡∏ç‡∏´‡∏≤‡πÄ‡∏Å‡∏µ‡πà‡∏¢‡∏ß‡∏Ç‡πâ‡∏≠‡∏á‡∏Å‡∏±‡∏ö‡∏á‡∏≤‡∏ô‡∏ó‡∏µ‡πà‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏ó‡∏≥</li>
</ul>
<h3>15. ‡∏£‡∏≤‡∏¢‡∏Å‡∏≤‡∏£‡∏´‡∏±‡∏Å / ‡∏Å‡∏£‡∏ì‡∏µ‡∏õ‡∏£‡∏±‡∏ö‡∏•‡∏î‡∏Ñ‡πà‡∏≤‡∏ï‡∏≠‡∏ö‡πÅ‡∏ó‡∏ô</h3>
<p class="contract-table-line"><strong>‡∏•‡∏≥‡∏î‡∏±‡∏ö</strong></p>
<p>‡∏Å‡∏£‡∏ì‡∏µ</p>
<p>‡πÅ‡∏ô‡∏ß‡∏ó‡∏≤‡∏á‡∏´‡∏±‡∏Å / ‡πÅ‡∏ô‡∏ß‡∏ó‡∏≤‡∏á‡∏û‡∏¥‡∏à‡∏≤‡∏£‡∏ì‡∏≤</p>
<p>1</p>
<p>‡πÑ‡∏°‡πà‡∏ñ‡πà‡∏≤‡∏¢‡∏£‡∏π‡∏õ‡∏á‡∏≤‡∏ô‡πÉ‡∏´‡πâ‡∏Ñ‡∏£‡∏ö‡∏ï‡∏≤‡∏°‡∏ó‡∏µ‡πà‡∏Å‡∏≥‡∏´‡∏ô‡∏î</p>
<p>‡∏´‡∏±‡∏Å 50 - 100 ‡∏ö‡∏≤‡∏ó/‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á ‡∏´‡∏£‡∏∑‡∏≠‡∏û‡∏¥‡∏à‡∏≤‡∏£‡∏ì‡∏≤‡∏ï‡∏≤‡∏°‡∏´‡∏•‡∏±‡∏Å‡∏ê‡∏≤‡∏ô‡∏à‡∏£‡∏¥‡∏á</p>
<p>2</p>
<p>‡πÑ‡∏°‡πà‡∏≠‡∏±‡∏õ‡πÄ‡∏î‡∏ï‡∏™‡∏ñ‡∏≤‡∏ô‡∏∞‡∏á‡∏≤‡∏ô‡πÉ‡∏ô‡∏£‡∏∞‡∏ö‡∏ö‡πÉ‡∏´‡πâ‡∏Ñ‡∏£‡∏ö</p>
<p>‡∏´‡∏±‡∏Å 50 ‡∏ö‡∏≤‡∏ó/‡∏Ñ‡∏£‡∏±‡πâ‡∏á ‡∏´‡∏£‡∏∑‡∏≠‡∏ä‡∏∞‡∏•‡∏≠‡∏à‡πà‡∏≤‡∏¢‡∏à‡∏ô‡∏Å‡∏ß‡πà‡∏≤‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•‡∏Ñ‡∏£‡∏ö</p>
<p>3</p>
<p>‡πÄ‡∏Ç‡πâ‡∏≤‡∏á‡∏≤‡∏ô‡∏™‡∏≤‡∏¢‡πÇ‡∏î‡∏¢‡πÑ‡∏°‡πà‡πÅ‡∏à‡πâ‡∏á‡∏•‡πà‡∏ß‡∏á‡∏´‡∏ô‡πâ‡∏≤</p>
<p>‡∏´‡∏±‡∏Å 100 - 300 ‡∏ö‡∏≤‡∏ó/‡∏Ñ‡∏£‡∏±‡πâ‡∏á ‡∏ï‡∏≤‡∏°‡∏ú‡∏•‡∏Å‡∏£‡∏∞‡∏ó‡∏ö‡∏ï‡πà‡∏≠‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤</p>
<p>4</p>
<p>‡∏¢‡∏Å‡πÄ‡∏•‡∏¥‡∏Å‡∏á‡∏≤‡∏ô‡∏´‡∏•‡∏±‡∏á‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô‡πÅ‡∏•‡πâ‡∏ß</p>
<p>‡πÉ‡∏ä‡πâ‡∏ï‡∏≤‡∏£‡∏≤‡∏á‡∏Ç‡πâ‡∏≠ 10 ‡πÄ‡∏õ‡πá‡∏ô‡∏´‡∏•‡∏±‡∏Å ‡∏´‡∏£‡∏∑‡∏≠‡∏´‡∏±‡∏Å‡∏Ñ‡πà‡∏≤‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏à‡∏£‡∏¥‡∏á‡∏´‡∏≤‡∏Å‡∏™‡∏π‡∏á‡∏Å‡∏ß‡πà‡∏≤</p>
<p>5</p>
<p>‡∏ó‡∏¥‡πâ‡∏á‡∏á‡∏≤‡∏ô / ‡πÑ‡∏°‡πà‡πÄ‡∏Ç‡πâ‡∏≤‡∏´‡∏ô‡πâ‡∏≤‡∏á‡∏≤‡∏ô / ‡∏ï‡∏¥‡∏î‡∏ï‡πà‡∏≠‡πÑ‡∏°‡πà‡πÑ‡∏î‡πâ</p>
<p>‡∏´‡∏±‡∏Å 1,500 - 3,000 ‡∏ö‡∏≤‡∏ó/‡∏á‡∏≤‡∏ô + ‡∏Ñ‡πà‡∏≤‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏à‡∏£‡∏¥‡∏á + ‡∏≠‡∏≤‡∏à‡∏á‡∏î‡∏à‡πà‡∏≤‡∏¢‡∏á‡∏≤‡∏ô‡∏ô‡∏±‡πâ‡∏ô</p>
<p>6</p>
<p>‡∏≠‡∏≠‡∏Å‡∏à‡∏≤‡∏Å‡∏´‡∏ô‡πâ‡∏≤‡∏á‡∏≤‡∏ô‡∏Å‡πà‡∏≠‡∏ô‡πÄ‡∏™‡∏£‡πá‡∏à‡πÇ‡∏î‡∏¢‡πÑ‡∏°‡πà‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö‡∏≠‡∏ô‡∏∏‡∏ç‡∏≤‡∏ï</p>
<p>‡∏≠‡∏≤‡∏à‡∏á‡∏î‡∏à‡πà‡∏≤‡∏¢‡∏á‡∏≤‡∏ô‡∏ô‡∏±‡πâ‡∏ô ‡πÅ‡∏•‡∏∞‡∏´‡∏±‡∏Å‡∏Ñ‡πà‡∏≤‡∏ó‡∏µ‡∏°‡∏ó‡∏î‡πÅ‡∏ó‡∏ô‡∏´‡∏£‡∏∑‡∏≠‡∏Ñ‡πà‡∏≤‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏à‡∏£‡∏¥‡∏á</p>
<p>7</p>
<p>‡∏á‡∏≤‡∏ô‡∏ï‡πâ‡∏≠‡∏á‡∏Å‡∏•‡∏±‡∏ö‡πÑ‡∏õ‡πÅ‡∏Å‡πâ‡∏à‡∏≤‡∏Å‡∏Ñ‡∏ß‡∏≤‡∏°‡∏ú‡∏¥‡∏î‡∏Ç‡∏≠‡∏á‡∏ä‡πà‡∏≤‡∏á</p>
<p>‡∏´‡∏±‡∏Å‡∏Ñ‡πà‡∏≤‡πÄ‡∏î‡∏¥‡∏ô‡∏ó‡∏≤‡∏á/‡∏Ñ‡πà‡∏≤‡πÅ‡∏£‡∏á‡πÅ‡∏Å‡πâ‡∏á‡∏≤‡∏ô ‡∏´‡∏£‡∏∑‡∏≠‡πÉ‡∏´‡πâ‡∏Å‡∏•‡∏±‡∏ö‡πÑ‡∏õ‡πÅ‡∏Å‡πâ‡πÇ‡∏î‡∏¢‡πÑ‡∏°‡πà‡∏°‡∏µ‡∏Ñ‡πà‡∏≤‡∏ï‡∏≠‡∏ö‡πÅ‡∏ó‡∏ô‡πÄ‡∏û‡∏¥‡πà‡∏°</p>
<p>8</p>
<p>‡∏ó‡∏≥‡∏ó‡∏£‡∏±‡∏û‡∏¢‡πå‡∏™‡∏¥‡∏ô‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏à‡∏≤‡∏Å‡∏Ñ‡∏ß‡∏≤‡∏°‡∏õ‡∏£‡∏∞‡∏°‡∏≤‡∏ó</p>
<p>‡∏£‡∏±‡∏ö‡∏ú‡∏¥‡∏î‡∏ä‡∏≠‡∏ö‡∏ï‡∏≤‡∏°‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏à‡∏£‡∏¥‡∏á ‡πÇ‡∏î‡∏¢‡∏´‡∏±‡∏Å‡∏à‡∏≤‡∏Å‡∏Ñ‡πà‡∏≤‡∏ï‡∏≠‡∏ö‡πÅ‡∏ó‡∏ô‡∏´‡∏£‡∏∑‡∏≠‡πÄ‡∏á‡∏¥‡∏ô‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô</p>
<p>9</p>
<p>‡∏£‡∏±‡∏ö‡πÄ‡∏á‡∏¥‡∏ô‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡πÄ‡∏≠‡∏á /</p>
<p>‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô‡∏ï‡πà‡∏≠‡∏ô‡∏≠‡∏Å‡∏£‡∏∞‡∏ö‡∏ö‡∏à‡∏≤‡∏Å‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡∏Ç‡∏≠‡∏á‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó</p>
<p>‡∏á‡∏î‡∏à‡πà‡∏≤‡∏¢‡∏á‡∏≤‡∏ô‡∏ô‡∏±‡πâ‡∏ô ‡πÄ‡∏£‡∏µ‡∏¢‡∏Å‡∏Ñ‡πà‡∏≤‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢ ‡πÅ‡∏•‡∏∞‡∏≠‡∏≤‡∏à‡∏¢‡∏∏‡∏ï‡∏¥‡∏Å‡∏≤‡∏£‡∏£‡πà‡∏ß‡∏°‡∏á‡∏≤‡∏ô‡∏ó‡∏±‡∏ô‡∏ó‡∏µ</p>
<p>10</p>
<p>‡πÄ‡∏õ‡∏¥‡∏î‡πÄ‡∏ú‡∏¢‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤ ‡∏£‡∏≤‡∏Ñ‡∏≤ ‡∏´‡∏£‡∏∑‡∏≠‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•‡∏†‡∏≤‡∏¢‡πÉ‡∏ô‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó</p>
<p>‡∏´‡∏±‡∏Å‡∏ï‡∏≤‡∏°‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏à‡∏£‡∏¥‡∏á ‡∏£‡∏∞‡∏á‡∏±‡∏ö‡∏á‡∏≤‡∏ô ‡πÅ‡∏•‡∏∞‡∏≠‡∏≤‡∏à‡∏¢‡∏∏‡∏ï‡∏¥‡∏™‡∏±‡∏ç‡∏ç‡∏≤</p>
<p>‡∏´‡∏°‡∏≤‡∏¢‡πÄ‡∏´‡∏ï‡∏∏: ‡∏£‡∏≤‡∏¢‡∏Å‡∏≤‡∏£‡∏´‡∏±‡∏Å‡πÄ‡∏õ‡πá‡∏ô‡∏Å‡∏£‡∏≠‡∏ö‡πÄ‡∏ö‡∏∑‡πâ‡∏≠‡∏á‡∏ï‡πâ‡∏ô ‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏à‡∏∞‡∏û‡∏¥‡∏à‡∏≤‡∏£‡∏ì‡∏≤‡∏à‡∏≤‡∏Å‡∏´‡∏•‡∏±‡∏Å‡∏ê‡∏≤‡∏ô‡∏à‡∏£‡∏¥‡∏á‡πÉ‡∏ô‡∏£‡∏∞‡∏ö‡∏ö ‡∏™‡∏†‡∏≤‡∏û‡∏´‡∏ô‡πâ‡∏≤‡∏á‡∏≤‡∏ô ‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢ ‡∏ú‡∏•‡∏Å‡∏£‡∏∞‡∏ó‡∏ö‡∏ï‡πà‡∏≠‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤ ‡πÅ‡∏•‡∏∞‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏´‡∏°‡∏≤‡∏∞‡∏™‡∏°‡πÄ‡∏õ‡πá‡∏ô‡∏£‡∏≤‡∏¢‡∏Å‡∏£‡∏ì‡∏µ</p>
<h3>16. ‡∏£‡∏∞‡∏¢‡∏∞‡πÄ‡∏ß‡∏•‡∏≤‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡πÅ‡∏•‡∏∞‡∏Å‡∏≤‡∏£‡∏¢‡∏∏‡∏ï‡∏¥‡∏Å‡∏≤‡∏£‡∏£‡πà‡∏ß‡∏°‡∏á‡∏≤‡∏ô</h3>
<ul>
<li>‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡∏ô‡∏µ‡πâ‡πÄ‡∏£‡∏¥‡πà‡∏°‡∏°‡∏µ‡∏ú‡∏•‡∏ï‡∏±‡πâ‡∏á‡πÅ‡∏ï‡πà‡∏ß‡∏±‡∏ô‡∏ó‡∏µ‡πà‡∏•‡∏á‡∏ô‡∏≤‡∏° ‡πÅ‡∏•‡∏∞‡∏°‡∏µ‡∏ú‡∏•‡∏ï‡πà‡∏≠‡πÄ‡∏ô‡∏∑‡πà‡∏≠‡∏á‡∏à‡∏ô‡∏Å‡∏ß‡πà‡∏≤‡∏ù‡πà‡∏≤‡∏¢‡πÉ‡∏î‡∏ù‡πà‡∏≤‡∏¢‡∏´‡∏ô‡∏∂‡πà‡∏á‡∏à‡∏∞‡πÅ‡∏à‡πâ‡∏á‡∏¢‡∏∏‡∏ï‡∏¥‡πÄ‡∏õ‡πá‡∏ô‡∏•‡∏≤‡∏¢‡∏•‡∏±‡∏Å‡∏©‡∏ì‡πå‡∏≠‡∏±‡∏Å‡∏©‡∏£</li>
<li>‡∏´‡∏≤‡∏Å‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏ï‡πâ‡∏≠‡∏á‡∏Å‡∏≤‡∏£‡∏¢‡∏∏‡∏ï‡∏¥‡∏Å‡∏≤‡∏£‡∏£‡πà‡∏ß‡∏°‡∏á‡∏≤‡∏ô ‡∏Ñ‡∏ß‡∏£‡πÅ‡∏à‡πâ‡∏á‡∏•‡πà‡∏ß‡∏á‡∏´‡∏ô‡πâ‡∏≤‡∏≠‡∏¢‡πà‡∏≤‡∏á‡∏ô‡πâ‡∏≠‡∏¢ 15 ‡∏ß‡∏±‡∏ô ‡πÅ‡∏•‡∏∞‡∏ï‡πâ‡∏≠‡∏á‡πÄ‡∏Ñ‡∏•‡∏µ‡∏¢‡∏£‡πå‡∏á‡∏≤‡∏ô‡∏Ñ‡πâ‡∏≤‡∏á ‡∏á‡∏≤‡∏ô‡∏£‡∏±‡∏ö‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô ‡∏≠‡∏∏‡∏õ‡∏Å‡∏£‡∏ì‡πå</li>
</ul>
<p>‡∏´‡∏£‡∏∑‡∏≠‡∏¢‡∏≠‡∏î‡πÄ‡∏á‡∏¥‡∏ô‡∏Ñ‡πâ‡∏≤‡∏á‡∏ó‡∏±‡πâ‡∏á‡∏´‡∏°‡∏î‡∏Å‡πà‡∏≠‡∏ô</p>
<ul>
<li>‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏°‡∏µ‡∏™‡∏¥‡∏ó‡∏ò‡∏¥‡∏¢‡∏∏‡∏ï‡∏¥‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡∏ó‡∏±‡∏ô‡∏ó‡∏µ ‡∏´‡∏≤‡∏Å‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏ó‡∏¥‡πâ‡∏á‡∏á‡∏≤‡∏ô ‡∏£‡∏±‡∏ö‡πÄ‡∏á‡∏¥‡∏ô‡∏ô‡∏≠‡∏Å‡∏£‡∏∞‡∏ö‡∏ö ‡∏ó‡∏≥‡πÉ‡∏´‡πâ‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡∏´‡∏£‡∏∑‡∏≠‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏£‡πâ‡∏≤‡∏¢‡πÅ‡∏£‡∏á ‡πÄ‡∏õ‡∏¥‡∏î‡πÄ‡∏ú‡∏¢‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•‡∏†‡∏≤‡∏¢‡πÉ‡∏ô ‡πÅ‡∏≠‡∏ö‡∏≠‡πâ‡∏≤‡∏á‡∏ä‡∏∑‡πà‡∏≠‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó</li>
</ul>
<p>‡∏´‡∏£‡∏∑‡∏≠‡∏ú‡∏¥‡∏î‡πÄ‡∏á‡∏∑‡πà‡∏≠‡∏ô‡πÑ‡∏Ç‡∏™‡∏≥‡∏Ñ‡∏±‡∏ç‡∏Ç‡∏≠‡∏á‡∏™‡∏±‡∏ç‡∏ç‡∏≤</p>
<ul>
<li>‡∏´‡∏•‡∏±‡∏á‡∏¢‡∏∏‡∏ï‡∏¥‡∏™‡∏±‡∏ç‡∏ç‡∏≤ ‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏¢‡∏±‡∏á‡∏ï‡πâ‡∏≠‡∏á‡∏£‡∏±‡∏ö‡∏ú‡∏¥‡∏î‡∏ä‡∏≠‡∏ö‡∏á‡∏≤‡∏ô‡∏ó‡∏µ‡πà‡∏ó‡∏≥‡πÑ‡∏ß‡πâ‡∏Å‡πà‡∏≠‡∏ô‡∏´‡∏ô‡πâ‡∏≤ ‡∏Ç‡πâ‡∏≠‡∏£‡πâ‡∏≠‡∏á‡πÄ‡∏£‡∏µ‡∏¢‡∏ô ‡∏á‡∏≤‡∏ô‡∏£‡∏±‡∏ö‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô ‡πÅ‡∏•‡∏∞‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢‡∏ó‡∏µ‡πà‡πÄ‡∏Å‡∏¥‡∏î‡∏à‡∏≤‡∏Å‡∏Å‡∏≤‡∏£‡∏Å‡∏£‡∏∞‡∏ó‡∏≥‡∏Ç‡∏≠‡∏á‡∏ï‡∏ô</li>
</ul>
<h3>17. ‡∏Å‡∏≤‡∏£‡πÅ‡∏Å‡πâ‡πÑ‡∏Ç‡∏™‡∏±‡∏ç‡∏ç‡∏≤ ‡πÄ‡∏£‡∏ó‡∏Ñ‡πà‡∏≤‡∏ï‡∏≠‡∏ö‡πÅ‡∏ó‡∏ô ‡πÅ‡∏•‡∏∞‡∏Ç‡πâ‡∏≠‡∏Å‡∏é‡∏´‡∏°‡∏≤‡∏¢</h3>
<ul>
<li>‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏™‡∏≤‡∏°‡∏≤‡∏£‡∏ñ‡∏õ‡∏£‡∏±‡∏ö‡∏õ‡∏£‡∏∏‡∏á‡πÄ‡∏£‡∏ó‡∏Ñ‡πà‡∏≤‡∏ï‡∏≠‡∏ö‡πÅ‡∏ó‡∏ô ‡πÄ‡∏á‡∏∑‡πà‡∏≠‡∏ô‡πÑ‡∏Ç‡∏Å‡∏≤‡∏£‡∏à‡πà‡∏≤‡∏¢ ‡∏£‡∏≠‡∏ö‡∏à‡πà‡∏≤‡∏¢ ‡∏´‡∏£‡∏∑‡∏≠‡∏°‡∏≤‡∏ï‡∏£‡∏ê‡∏≤‡∏ô‡∏á‡∏≤‡∏ô‡πÑ‡∏î‡πâ‡∏ï‡∏≤‡∏°‡∏ï‡πâ‡∏ô‡∏ó‡∏∏‡∏ô ‡πÇ‡∏õ‡∏£‡πÇ‡∏°‡∏ä‡∏±‡∏ô ‡∏™‡∏†‡∏≤‡∏û‡∏ï‡∏•‡∏≤‡∏î</li>
</ul>
<p>‡πÅ‡∏•‡∏∞‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏´‡∏°‡∏≤‡∏∞‡∏™‡∏°‡πÉ‡∏ô‡∏Å‡∏≤‡∏£‡∏ö‡∏£‡∏¥‡∏´‡∏≤‡∏£‡∏á‡∏≤‡∏ô</p>
<ul>
<li>‡∏´‡∏≤‡∏Å‡∏°‡∏µ‡∏Å‡∏≤‡∏£‡πÄ‡∏õ‡∏•‡∏µ‡πà‡∏¢‡∏ô‡πÅ‡∏õ‡∏•‡∏á‡∏™‡∏≥‡∏Ñ‡∏±‡∏ç ‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏à‡∏∞‡πÅ‡∏à‡πâ‡∏á‡πÉ‡∏´‡πâ‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏ó‡∏£‡∏≤‡∏ö‡∏Å‡πà‡∏≠‡∏ô‡∏ô‡∏≥‡πÑ‡∏õ‡πÉ‡∏ä‡πâ‡∏Å‡∏±‡∏ö‡∏á‡∏≤‡∏ô‡πÉ‡∏´‡∏°‡πà</li>
<li>‡∏á‡∏≤‡∏ô‡∏ó‡∏µ‡πà‡∏£‡∏±‡∏ö‡πÑ‡∏ß‡πâ‡∏Å‡πà‡∏≠‡∏ô‡∏°‡∏µ‡∏Å‡∏≤‡∏£‡πÄ‡∏õ‡∏•‡∏µ‡πà‡∏¢‡∏ô‡πÅ‡∏õ‡∏•‡∏á ‡πÉ‡∏´‡πâ‡∏¢‡∏∂‡∏î‡∏ï‡∏≤‡∏°‡πÄ‡∏á‡∏∑‡πà‡∏≠‡∏ô‡πÑ‡∏Ç‡∏ó‡∏µ‡πà‡∏ï‡∏Å‡∏•‡∏á‡πÑ‡∏ß‡πâ‡πÉ‡∏ô‡∏á‡∏≤‡∏ô‡∏ô‡∏±‡πâ‡∏ô ‡πÄ‡∏ß‡πâ‡∏ô‡πÅ‡∏ï‡πà‡∏ó‡∏±‡πâ‡∏á‡∏™‡∏≠‡∏á‡∏ù‡πà‡∏≤‡∏¢‡∏ï‡∏Å‡∏•‡∏á‡πÉ‡∏´‡∏°‡πà</li>
<li>‡∏´‡∏≤‡∏Å‡∏°‡∏µ‡∏Å‡∏≤‡∏£‡πÄ‡∏õ‡∏•‡∏µ‡πà‡∏¢‡∏ô‡πÅ‡∏õ‡∏•‡∏á‡∏Å‡∏é‡∏´‡∏°‡∏≤‡∏¢‡∏†‡∏≤‡∏©‡∏µ‡∏´‡∏£‡∏∑‡∏≠‡∏Ç‡πâ‡∏≠‡∏Å‡∏≥‡∏´‡∏ô‡∏î‡∏£‡∏≤‡∏ä‡∏Å‡∏≤‡∏£ ‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏™‡∏≤‡∏°‡∏≤‡∏£‡∏ñ‡∏õ‡∏£‡∏±‡∏ö‡∏ß‡∏¥‡∏ò‡∏µ‡∏à‡πà‡∏≤‡∏¢‡πÄ‡∏á‡∏¥‡∏ô ‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£ ‡∏´‡∏£‡∏∑‡∏≠‡∏Å‡∏≤‡∏£‡∏´‡∏±‡∏Å‡∏†‡∏≤‡∏©‡∏µ‡πÉ‡∏´‡πâ‡∏™‡∏≠‡∏î‡∏Ñ‡∏•‡πâ‡∏≠‡∏á‡∏Å‡∏±‡∏ö‡∏Å‡∏é‡∏´‡∏°‡∏≤‡∏¢‡πÑ‡∏î‡πâ‡∏ó‡∏±‡∏ô‡∏ó‡∏µ</li>
<li>‡∏´‡∏≤‡∏Å‡∏Ç‡πâ‡∏≠‡∏Ñ‡∏ß‡∏≤‡∏°‡∏™‡πà‡∏ß‡∏ô‡πÉ‡∏î‡∏Ç‡∏≠‡∏á‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡∏ô‡∏µ‡πâ‡πÑ‡∏°‡πà‡∏™‡∏≤‡∏°‡∏≤‡∏£‡∏ñ‡πÉ‡∏ä‡πâ‡∏ö‡∏±‡∏á‡∏Ñ‡∏±‡∏ö‡πÑ‡∏î‡πâ‡∏ï‡∏≤‡∏°‡∏Å‡∏é‡∏´‡∏°‡∏≤‡∏¢ ‡πÉ‡∏´‡πâ‡∏Ç‡πâ‡∏≠‡∏Ñ‡∏ß‡∏≤‡∏°‡∏™‡πà‡∏ß‡∏ô‡∏ô‡∏±‡πâ‡∏ô‡∏ñ‡∏π‡∏Å‡∏õ‡∏£‡∏±‡∏ö‡πÉ‡∏ä‡πâ‡πÄ‡∏ó‡πà‡∏≤‡∏ó‡∏µ‡πà‡∏Å‡∏é‡∏´‡∏°‡∏≤‡∏¢‡∏≠‡∏ô‡∏∏‡∏ç‡∏≤‡∏ï</li>
</ul>
<p>‡πÇ‡∏î‡∏¢‡πÑ‡∏°‡πà‡∏Å‡∏£‡∏∞‡∏ó‡∏ö‡∏ï‡πà‡∏≠‡∏Ç‡πâ‡∏≠‡∏Ñ‡∏ß‡∏≤‡∏°‡∏™‡πà‡∏ß‡∏ô‡∏≠‡∏∑‡πà‡∏ô‡∏Ç‡∏≠‡∏á‡∏™‡∏±‡∏ç‡∏ç‡∏≤</p>
<h3>18. ‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£‡πÅ‡∏ô‡∏ö‡∏ó‡πâ‡∏≤‡∏¢‡πÅ‡∏•‡∏∞‡∏£‡∏≤‡∏¢‡∏Å‡∏≤‡∏£‡∏ï‡∏£‡∏ß‡∏à‡∏£‡∏±‡∏ö‡∏Å‡πà‡∏≠‡∏ô‡πÄ‡∏£‡∏¥‡πà‡∏°‡∏á‡∏≤‡∏ô</h3>
<p class="contract-table-line"><strong>‡∏£‡∏≤‡∏¢‡∏Å‡∏≤‡∏£‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£/‡∏ó‡∏£‡∏±‡∏û‡∏¢‡πå‡∏™‡∏¥‡∏ô/‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•</strong></p>
<p class="contract-table-line"><strong>‡∏™‡∏ñ‡∏≤‡∏ô‡∏∞‡∏ï‡∏£‡∏ß‡∏à‡∏£‡∏±‡∏ö</strong></p>
<p>‡∏™‡∏≥‡πÄ‡∏ô‡∏≤‡∏ö‡∏±‡∏ï‡∏£‡∏õ‡∏£‡∏∞‡∏ä‡∏≤‡∏ä‡∏ô‡∏Ç‡∏≠‡∏á‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå</p>
<p>‚ñ° ‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö‡πÅ‡∏•‡πâ‡∏ß ‚ñ° ‡∏¢‡∏±‡∏á‡πÑ‡∏°‡πà‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö</p>
<p>‡∏™‡∏≥‡πÄ‡∏ô‡∏≤‡∏´‡∏ô‡πâ‡∏≤‡∏ö‡∏±‡∏ç‡∏ä‡∏µ‡∏ò‡∏ô‡∏≤‡∏Ñ‡∏≤‡∏£‡∏™‡∏≥‡∏´‡∏£‡∏±‡∏ö‡∏£‡∏±‡∏ö‡πÄ‡∏á‡∏¥‡∏ô</p>
<p>‚ñ° ‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö‡πÅ‡∏•‡πâ‡∏ß ‚ñ° ‡∏¢‡∏±‡∏á‡πÑ‡∏°‡πà‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö</p>
<p>‡πÄ‡∏ö‡∏≠‡∏£‡πå‡πÇ‡∏ó‡∏£ / LINE / ‡∏ó‡∏µ‡πà‡∏≠‡∏¢‡∏π‡πà‡∏õ‡∏±‡∏à‡∏à‡∏∏‡∏ö‡∏±‡∏ô</p>
<p>‚ñ° ‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö‡πÅ‡∏•‡πâ‡∏ß ‚ñ° ‡∏¢‡∏±‡∏á‡πÑ‡∏°‡πà‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö</p>
<p>‡∏£‡∏π‡∏õ‡∏ñ‡πà‡∏≤‡∏¢‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå / ‡∏£‡∏π‡∏õ‡πÇ‡∏õ‡∏£‡πÑ‡∏ü‡∏•‡πå‡∏™‡∏≥‡∏´‡∏£‡∏±‡∏ö‡∏£‡∏∞‡∏ö‡∏ö</p>
<p>‚ñ° ‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö‡πÅ‡∏•‡πâ‡∏ß ‚ñ° ‡∏¢‡∏±‡∏á‡πÑ‡∏°‡πà‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö</p>
<p>‡∏ó‡∏∞‡πÄ‡∏ö‡∏µ‡∏¢‡∏ô‡∏£‡∏ñ / ‡∏õ‡πâ‡∏≤‡∏¢‡∏ó‡∏∞‡πÄ‡∏ö‡∏µ‡∏¢‡∏ô / ‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•‡∏û‡∏≤‡∏´‡∏ô‡∏∞‡∏ó‡∏µ‡πà‡πÉ‡∏ä‡πâ‡∏ó‡∏≥‡∏á‡∏≤‡∏ô (‡∏ñ‡πâ‡∏≤‡∏°‡∏µ)</p>
<p>‚ñ° ‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö‡πÅ‡∏•‡πâ‡∏ß ‚ñ° ‡∏¢‡∏±‡∏á‡πÑ‡∏°‡πà‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö</p>
<p>‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•‡∏ú‡∏π‡πâ‡∏ï‡∏¥‡∏î‡∏ï‡πà‡∏≠‡∏â‡∏∏‡∏Å‡πÄ‡∏â‡∏¥‡∏ô</p>
<p>‚ñ° ‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö‡πÅ‡∏•‡πâ‡∏ß ‚ñ° ‡∏¢‡∏±‡∏á‡πÑ‡∏°‡πà‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö</p>
<p>‡∏´‡∏•‡∏±‡∏Å‡∏ê‡∏≤‡∏ô‡∏õ‡∏£‡∏∞‡∏™‡∏ö‡∏Å‡∏≤‡∏£‡∏ì‡πå ‡πÉ‡∏ö‡∏£‡∏±‡∏ö‡∏£‡∏≠‡∏á ‡∏´‡∏£‡∏∑‡∏≠‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•‡∏Ñ‡∏ß‡∏≤‡∏°‡∏ä‡∏≥‡∏ô‡∏≤‡∏ç (‡∏ñ‡πâ‡∏≤‡∏°‡∏µ)</p>
<p>‚ñ° ‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö‡πÅ‡∏•‡πâ‡∏ß ‚ñ° ‡∏¢‡∏±‡∏á‡πÑ‡∏°‡πà‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö</p>
<p>‡∏£‡∏≤‡∏¢‡∏Å‡∏≤‡∏£‡∏≠‡∏∏‡∏õ‡∏Å‡∏£‡∏ì‡πå ‡πÄ‡∏™‡∏∑‡πâ‡∏≠‡∏¢‡∏π‡∏ô‡∏¥‡∏ü‡∏≠‡∏£‡πå‡∏° ‡∏ö‡∏±‡∏ï‡∏£‡∏ä‡πà‡∏≤‡∏á ‡∏´‡∏£‡∏∑‡∏≠‡∏ó‡∏£‡∏±‡∏û‡∏¢‡πå‡∏™‡∏¥‡∏ô‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏ó‡∏µ‡πà‡∏£‡∏±‡∏ö‡πÑ‡∏õ (‡∏ñ‡πâ‡∏≤‡∏°‡∏µ)</p>
<p>‚ñ° ‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö‡πÅ‡∏•‡πâ‡∏ß ‚ñ° ‡πÑ‡∏°‡πà‡∏°‡∏µ‡∏£‡∏≤‡∏¢‡∏Å‡∏≤‡∏£</p>
<p class="contract-table-line"><strong>‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£‡πÅ‡∏ô‡∏ö‡∏ó‡πâ‡∏≤‡∏¢</strong></p>
<p class="contract-table-line"><strong>‡∏™‡∏ñ‡∏≤‡∏ô‡∏∞</strong></p>
<p>‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£‡πÅ‡∏ô‡∏ö‡∏ó‡πâ‡∏≤‡∏¢ ‡∏Å. ‡∏ï‡∏≤‡∏£‡∏≤‡∏á‡πÄ‡∏£‡∏ó‡∏Ñ‡πà‡∏≤‡∏ï‡∏≠‡∏ö‡πÅ‡∏ó‡∏ô‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡πÅ‡∏ö‡∏ö‡∏Ç‡∏±‡πâ‡∏ô‡∏ö‡∏±‡∏ô‡πÑ‡∏î</p>
<p>‡∏ñ‡∏∑‡∏≠‡πÄ‡∏õ‡πá‡∏ô‡∏™‡πà‡∏ß‡∏ô‡∏´‡∏ô‡∏∂‡πà‡∏á‡∏Ç‡∏≠‡∏á‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡∏ô‡∏µ‡πâ</p>
<p>‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£‡πÅ‡∏ô‡∏ö‡∏ó‡πâ‡∏≤‡∏¢ ‡∏Ç. ‡∏´‡∏•‡∏±‡∏Å‡∏ê‡∏≤‡∏ô‡∏ö‡∏±‡∏ï‡∏£‡∏õ‡∏£‡∏∞‡∏ä‡∏≤‡∏ä‡∏ô / ‡∏´‡∏ô‡πâ‡∏≤‡∏ö‡∏±‡∏ç‡∏ä‡∏µ / ‡∏ä‡πà‡∏≠‡∏á‡∏ó‡∏≤‡∏á‡∏ï‡∏¥‡∏î‡∏ï‡πà‡∏≠</p>
<p>‡πÉ‡∏ä‡πâ‡∏¢‡∏∑‡∏ô‡∏¢‡∏±‡∏ô‡∏ï‡∏±‡∏ß‡∏ï‡∏ô‡πÅ‡∏•‡∏∞‡∏à‡πà‡∏≤‡∏¢‡πÄ‡∏á‡∏¥‡∏ô</p>
<p>‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£‡πÅ‡∏ô‡∏ö‡∏ó‡πâ‡∏≤‡∏¢ ‡∏Ñ. ‡∏Ç‡πâ‡∏≠‡∏ï‡∏Å‡∏•‡∏á‡πÄ‡∏á‡∏¥‡∏ô‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏™‡∏µ‡∏¢‡∏´‡∏≤‡∏¢ 5,000 ‡∏ö‡∏≤‡∏ó</p>
<p>‡∏´‡∏±‡∏Å‡∏£‡∏≤‡∏¢‡πÄ‡∏î‡∏∑‡∏≠‡∏ô‡∏ï‡∏≤‡∏°‡∏ó‡∏µ‡πà‡∏ï‡∏Å‡∏•‡∏á</p>
<p>‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£‡πÅ‡∏ô‡∏ö‡∏ó‡πâ‡∏≤‡∏¢ ‡∏á. ‡∏´‡∏ô‡∏±‡∏á‡∏™‡∏∑‡∏≠‡∏£‡∏±‡∏ö‡∏£‡∏≠‡∏á‡∏†‡∏≤‡∏©‡∏µ‡∏´‡∏±‡∏Å ‡∏ì ‡∏ó‡∏µ‡πà‡∏à‡πà‡∏≤‡∏¢ / ‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£‡∏†‡∏≤‡∏©‡∏µ‡∏ó‡∏µ‡πà‡πÄ‡∏Å‡∏µ‡πà‡∏¢‡∏ß‡∏Ç‡πâ‡∏≠‡∏á</p>
<p>‡πÉ‡∏ä‡πâ‡∏ï‡∏≤‡∏°‡∏Å‡∏£‡∏ì‡∏µ‡∏ó‡∏µ‡πà‡∏Å‡∏é‡∏´‡∏°‡∏≤‡∏¢‡∏Å‡∏≥‡∏´‡∏ô‡∏î</p>
<p>‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£‡πÅ‡∏ô‡∏ö‡∏ó‡πâ‡∏≤‡∏¢ ‡∏à. ‡∏£‡∏≤‡∏¢‡∏Å‡∏≤‡∏£‡∏ó‡∏£‡∏±‡∏û‡∏¢‡πå‡∏™‡∏¥‡∏ô‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡∏ó‡∏µ‡πà‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏£‡∏±‡∏ö‡πÑ‡∏õ (‡∏ñ‡πâ‡∏≤‡∏°‡∏µ)</p>
<p>‡∏ï‡πâ‡∏≠‡∏á‡∏Ñ‡∏∑‡∏ô‡πÄ‡∏°‡∏∑‡πà‡∏≠‡∏™‡∏¥‡πâ‡∏ô‡∏™‡∏∏‡∏î‡∏Å‡∏≤‡∏£‡∏£‡πà‡∏ß‡∏°‡∏á‡∏≤‡∏ô</p>
<h3>19. ‡∏•‡∏á‡∏ô‡∏≤‡∏°‡∏£‡∏±‡∏ö‡∏ó‡∏£‡∏≤‡∏ö‡πÅ‡∏•‡∏∞‡∏ï‡∏Å‡∏•‡∏á</h3>
<p>‡∏Ñ‡∏π‡πà‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡∏ó‡∏±‡πâ‡∏á‡∏™‡∏≠‡∏á‡∏ù‡πà‡∏≤‡∏¢‡πÑ‡∏î‡πâ‡∏≠‡πà‡∏≤‡∏ô ‡πÄ‡∏Ç‡πâ‡∏≤‡πÉ‡∏à ‡πÅ‡∏•‡∏∞‡∏ï‡∏Å‡∏•‡∏á‡∏¢‡∏≠‡∏°‡∏£‡∏±‡∏ö‡πÄ‡∏á‡∏∑‡πà‡∏≠‡∏ô‡πÑ‡∏Ç‡∏ó‡∏±‡πâ‡∏á‡∏´‡∏°‡∏î‡πÉ‡∏ô‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡∏â‡∏ö‡∏±‡∏ö‡∏ô‡∏µ‡πâ‡πÅ‡∏•‡πâ‡∏ß ‡∏à‡∏∂‡∏á‡∏•‡∏á‡∏ô‡∏≤‡∏°‡πÑ‡∏ß‡πâ‡πÄ‡∏õ‡πá‡∏ô‡∏´‡∏•‡∏±‡∏Å‡∏ê‡∏≤‡∏ô</p>
<p>‡πÇ‡∏î‡∏¢‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡∏ô‡∏µ‡πâ‡∏°‡∏µ‡∏ú‡∏•‡πÉ‡∏ä‡πâ‡∏ö‡∏±‡∏á‡∏Ñ‡∏±‡∏ö‡∏ï‡∏±‡πâ‡∏á‡πÅ‡∏ï‡πà‡∏ß‡∏±‡∏ô‡∏ó‡∏µ‡πà‡∏Ñ‡∏π‡πà‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡∏ó‡∏±‡πâ‡∏á‡∏™‡∏≠‡∏á‡∏ù‡πà‡∏≤‡∏¢‡∏•‡∏á‡∏ô‡∏≤‡∏° ‡πÄ‡∏ß‡πâ‡∏ô‡πÅ‡∏ï‡πà‡∏£‡∏∞‡∏ö‡∏∏‡∏ß‡∏±‡∏ô‡∏ó‡∏µ‡πà‡πÄ‡∏£‡∏¥‡πà‡∏°‡∏°‡∏µ‡∏ú‡∏•‡πÑ‡∏ß‡πâ‡πÄ‡∏õ‡πá‡∏ô‡∏≠‡∏¢‡πà‡∏≤‡∏á‡∏≠‡∏∑‡πà‡∏ô‡πÉ‡∏ô‡∏´‡∏ô‡πâ‡∏≤‡πÅ‡∏£‡∏Å‡∏Ç‡∏≠‡∏á‡∏™‡∏±‡∏ç‡∏ç‡∏≤</p>
<p>‡∏ù‡πà‡∏≤‡∏¢‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó / ‡∏ú‡∏π‡πâ‡∏ß‡πà‡∏≤‡∏à‡πâ‡∏≤‡∏á</p>
<p>‡∏ù‡πà‡∏≤‡∏¢‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏ä‡πà‡∏≤‡∏á</p>
<p>............................................................</p>
<p>(‡∏ô‡∏≤‡∏¢ ‡∏™‡∏∏‡∏ó‡∏ò‡∏¥‡∏û‡∏á‡∏©‡πå ‡∏®‡∏£‡∏µ‡∏ß‡∏≤‡∏£‡∏¥‡∏ô‡∏ó‡∏£‡πå)</p>
<p>‡∏ß‡∏±‡∏ô‡∏ó‡∏µ‡πà ........ / ........ / ........</p>
<p>............................................................</p>
<p>(....................................................)</p>
<p>‡∏ß‡∏±‡∏ô‡∏ó‡∏µ‡πà ........ / ........ / ........</p>
<p>‡∏û‡∏¢‡∏≤‡∏ô‡∏ù‡πà‡∏≤‡∏¢‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó</p>
<p>‡∏û‡∏¢‡∏≤‡∏ô‡∏ù‡πà‡∏≤‡∏¢‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå</p>
<p>............................................................</p>
<p>(....................................................)</p>
<p>‡∏ß‡∏±‡∏ô‡∏ó‡∏µ‡πà ........ / ........ / ........</p>
<p>............................................................</p>
<p>(....................................................)</p>
<p>‡∏ß‡∏±‡∏ô‡∏ó‡∏µ‡πà ........ / ........ / ........</p>
  </div>
</section>
`;

const BASIC_PARTNER_EXAM_QUESTIONS = [
  { q: '‡πÄ‡∏°‡∏∑‡πà‡∏≠‡∏ñ‡∏∂‡∏á‡∏´‡∏ô‡πâ‡∏≤‡∏á‡∏≤‡∏ô‡∏Ñ‡∏ß‡∏£‡∏ó‡∏≥‡∏≠‡∏∞‡πÑ‡∏£‡πÄ‡∏õ‡πá‡∏ô‡∏≠‡∏±‡∏ô‡∏î‡∏±‡∏ö‡πÅ‡∏£‡∏Å', choices: ['‡πÄ‡∏ä‡πá‡∏Å‡∏≠‡∏¥‡∏ô‡πÅ‡∏•‡∏∞‡∏ó‡∏±‡∏Å‡∏ó‡∏≤‡∏¢‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤', '‡πÄ‡∏£‡∏¥‡πà‡∏°‡∏á‡∏≤‡∏ô‡∏ó‡∏±‡∏ô‡∏ó‡∏µ‡πÇ‡∏î‡∏¢‡πÑ‡∏°‡πà‡πÅ‡∏à‡πâ‡∏á', '‡∏Ç‡∏≠‡πÄ‡∏á‡∏¥‡∏ô‡∏Å‡πà‡∏≠‡∏ô‡πÄ‡∏£‡∏¥‡πà‡∏°‡∏á‡∏≤‡∏ô'], answer: 0 },
  { q: '‡∏´‡∏≤‡∏Å‡∏ï‡πâ‡∏≠‡∏á‡πÄ‡∏õ‡∏•‡∏µ‡πà‡∏¢‡∏ô‡∏£‡∏≤‡∏Ñ‡∏≤ ‡∏Ñ‡∏ß‡∏£‡∏ó‡∏≥‡∏≠‡∏¢‡πà‡∏≤‡∏á‡πÑ‡∏£', choices: ['‡πÅ‡∏à‡πâ‡∏á‡πÅ‡∏≠‡∏î‡∏°‡∏¥‡∏ô‡πÄ‡∏û‡∏∑‡πà‡∏≠‡∏≠‡∏ô‡∏∏‡∏°‡∏±‡∏ï‡∏¥‡∏Å‡πà‡∏≠‡∏ô', '‡∏ï‡∏Å‡∏•‡∏á‡∏Å‡∏±‡∏ö‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡πÄ‡∏≠‡∏á', '‡πÄ‡∏Å‡πá‡∏ö‡πÄ‡∏á‡∏¥‡∏ô‡∏™‡∏î‡πÄ‡∏û‡∏¥‡πà‡∏°‡∏ó‡∏±‡∏ô‡∏ó‡∏µ'], answer: 0 },
  { q: '‡∏£‡∏π‡∏õ‡∏Å‡πà‡∏≠‡∏ô‡πÅ‡∏•‡∏∞‡∏´‡∏•‡∏±‡∏á‡∏á‡∏≤‡∏ô‡∏°‡∏µ‡πÑ‡∏ß‡πâ‡πÄ‡∏û‡∏∑‡πà‡∏≠‡∏≠‡∏∞‡πÑ‡∏£', choices: ['‡πÄ‡∏õ‡πá‡∏ô‡∏´‡∏•‡∏±‡∏Å‡∏ê‡∏≤‡∏ô‡∏Ñ‡∏∏‡∏ì‡∏†‡∏≤‡∏û‡∏á‡∏≤‡∏ô', '‡πÉ‡∏ä‡πâ‡πÅ‡∏ó‡∏ô‡∏Å‡∏≤‡∏£‡∏õ‡∏¥‡∏î‡∏á‡∏≤‡∏ô‡πÑ‡∏î‡πâ‡∏ó‡∏±‡πâ‡∏á‡∏´‡∏°‡∏î', '‡πÑ‡∏°‡πà‡∏à‡∏≥‡πÄ‡∏õ‡πá‡∏ô‡∏ï‡πâ‡∏≠‡∏á‡∏ñ‡πà‡∏≤‡∏¢'], answer: 0 },
  { q: '‡∏Å‡∏≤‡∏£‡∏£‡∏±‡∏ö‡πÄ‡∏á‡∏¥‡∏ô‡∏ô‡∏≠‡∏Å‡∏£‡∏∞‡∏ö‡∏ö CWF ‡∏ó‡∏≥‡πÑ‡∏î‡πâ‡∏´‡∏£‡∏∑‡∏≠‡πÑ‡∏°‡πà', choices: ['‡πÑ‡∏°‡πà‡πÑ‡∏î‡πâ', '‡πÑ‡∏î‡πâ‡∏ñ‡πâ‡∏≤‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤‡∏™‡∏∞‡∏î‡∏ß‡∏Å', '‡πÑ‡∏î‡πâ‡πÄ‡∏â‡∏û‡∏≤‡∏∞‡∏á‡∏≤‡∏ô‡∏î‡πà‡∏ß‡∏ô'], answer: 0 },
  { q: '‡∏á‡∏≤‡∏ô‡∏ó‡∏î‡∏•‡∏≠‡∏á‡∏ú‡πà‡∏≤‡∏ô‡πÅ‡∏•‡πâ‡∏ß‡∏à‡∏∞‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô‡∏à‡∏£‡∏¥‡∏á‡πÑ‡∏î‡πâ‡∏ó‡∏±‡∏ô‡∏ó‡∏µ‡∏´‡∏£‡∏∑‡∏≠‡πÑ‡∏°‡πà', choices: ['‡∏ï‡πâ‡∏≠‡∏á‡∏£‡∏≠‡πÅ‡∏≠‡∏î‡∏°‡∏¥‡∏ô‡∏≠‡∏ô‡∏∏‡∏°‡∏±‡∏ï‡∏¥‡∏™‡∏¥‡∏ó‡∏ò‡∏¥‡πå', '‡πÑ‡∏î‡πâ‡∏ó‡∏±‡∏ô‡∏ó‡∏µ‡∏ó‡∏∏‡∏Å‡∏õ‡∏£‡∏∞‡πÄ‡∏†‡∏ó', '‡πÑ‡∏î‡πâ‡πÄ‡∏â‡∏û‡∏≤‡∏∞‡∏ñ‡πâ‡∏≤‡πÑ‡∏°‡πà‡∏°‡∏µ‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£'], answer: 0 },
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
    'üîî ‡∏°‡∏µ‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå CWF ‡πÉ‡∏´‡∏°‡πà',
    `‡∏ä‡∏∑‡πà‡∏≠: ${appRow.full_name || '-'}`,
    `‡πÄ‡∏ö‡∏≠‡∏£‡πå: ${appRow.phone || '-'}`,
    `‡∏û‡∏∑‡πâ‡∏ô‡∏ó‡∏µ‡πà: ${[appRow.province, appRow.district].filter(Boolean).join(' / ') || '-'}`,
    `‡∏£‡∏´‡∏±‡∏™: ${appRow.application_code || '-'}`,
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
  if (!file) return '‡πÑ‡∏°‡πà‡∏û‡∏ö‡πÑ‡∏ü‡∏•‡πå‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£';
  const mimetype = String(file.mimetype || '').toLowerCase().trim();
  if (!PARTNER_ALLOWED_DOCUMENT_MIME_TYPES.has(mimetype)) {
    return '‡∏£‡∏≠‡∏á‡∏£‡∏±‡∏ö‡πÄ‡∏â‡∏û‡∏≤‡∏∞‡πÑ‡∏ü‡∏•‡πå JPG, PNG, WEBP ‡∏´‡∏£‡∏∑‡∏≠ PDF ‡πÄ‡∏ó‡πà‡∏≤‡∏ô‡∏±‡πâ‡∏ô';
  }
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ext || !PARTNER_ALLOWED_DOCUMENT_EXTENSIONS.has(ext)) {
    return '‡∏ô‡∏≤‡∏°‡∏™‡∏Å‡∏∏‡∏•‡πÑ‡∏ü‡∏•‡πå‡∏ï‡πâ‡∏≠‡∏á‡πÄ‡∏õ‡πá‡∏ô .jpg, .jpeg, .png, .webp ‡∏´‡∏£‡∏∑‡∏≠ .pdf ‡πÄ‡∏ó‡πà‡∏≤‡∏ô‡∏±‡πâ‡∏ô';
  }
  return null;
}

async function uploadPartnerDocumentFile(file, applicationCode, documentType) {
  if (!file) throw new Error('‡πÑ‡∏°‡πà‡∏û‡∏ö‡πÑ‡∏ü‡∏•‡πå‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£');
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

  if (jobType === '‡∏•‡πâ‡∏≤‡∏á') {
    if (acType.includes('‡∏™‡∏µ‡πà‡∏ó‡∏¥‡∏®')) out.add('clean_cassette_4way');
    else if (acType.includes('‡∏ó‡πà‡∏≠‡∏•‡∏°')) out.add('clean_duct_type');
    else if (acType.includes('‡πÅ‡∏Ç‡∏ß‡∏ô') || acType.includes('‡πÉ‡∏ï‡πâ‡∏ù‡πâ‡∏≤') || acType.includes('‡πÄ‡∏õ‡∏•‡∏∑‡∏≠‡∏¢')) out.add('clean_ceiling_suspended');
    else if (washVariant.includes('‡∏û‡∏£‡∏µ‡πÄ‡∏°‡∏µ‡∏¢‡∏°')) out.add('clean_wall_premium');
    else if (washVariant.includes('‡πÅ‡∏Ç‡∏ß‡∏ô‡∏Ñ‡∏≠‡∏¢')) out.add('clean_wall_hanging_coil');
    else if (washVariant.includes('‡∏ï‡∏±‡∏î‡∏•‡πâ‡∏≤‡∏á') || washVariant.includes('‡πÉ‡∏´‡∏ç‡πà')) out.add('clean_wall_overhaul');
    else out.add('clean_wall_normal');
  }
  if (jobType === '‡∏ã‡πà‡∏≠‡∏°') {
    if (repairVariant.includes('‡∏ô‡πâ‡∏≥‡∏£‡∏±‡πà‡∏ß')) out.add('repair_water_leak');
    else if (repairVariant.includes('‡πÑ‡∏ü')) out.add('repair_electrical_basic');
    else if (repairVariant.includes('‡∏ô‡πâ‡∏≥‡∏¢‡∏≤')) out.add('repair_refrigerant_basic');
    else if (repairVariant.includes('‡∏≠‡∏∞‡πÑ‡∏´‡∏•‡πà')) out.add('repair_parts_replacement');
    else out.add('repair_diagnosis_basic');
  }
  if (jobType === '‡∏ï‡∏¥‡∏î‡∏ï‡∏±‡πâ‡∏á') {
    out.add('install_wall_standard');
    if (installVariant.includes('‡∏Ñ‡∏≠‡∏ô‡πÇ‡∏î') || acType.includes('‡∏Ñ‡∏≠‡∏ô‡πÇ‡∏î')) out.add('install_condo');
  }
  if (jobType === '‡∏¢‡πâ‡∏≤‡∏¢') out.add('install_relocation');
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
// ü§ù Partner Onboarding Phase 1A
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

  if (!full_name) return res.status(400).json({ error: '‡∏Å‡∏£‡∏∏‡∏ì‡∏≤‡∏Å‡∏£‡∏≠‡∏Å‡∏ä‡∏∑‡πà‡∏≠-‡∏ô‡∏≤‡∏°‡∏™‡∏Å‡∏∏‡∏•' });
  if (!phone) return res.status(400).json({ error: '‡∏Å‡∏£‡∏∏‡∏ì‡∏≤‡∏Å‡∏£‡∏≠‡∏Å‡πÄ‡∏ö‡∏≠‡∏£‡πå‡πÇ‡∏ó‡∏£' });
  if (!password || password.length < 6) return res.status(400).json({ error: '‡∏Å‡∏£‡∏∏‡∏ì‡∏≤‡∏ï‡∏±‡πâ‡∏á‡∏£‡∏´‡∏±‡∏™‡∏ú‡πà‡∏≤‡∏ô‡∏≠‡∏¢‡πà‡∏≤‡∏á‡∏ô‡πâ‡∏≠‡∏¢ 6 ‡∏ï‡∏±‡∏ß‡∏≠‡∏±‡∏Å‡∏©‡∏£' });
  if (password !== confirm_password) return res.status(400).json({ error: '‡∏¢‡∏∑‡∏ô‡∏¢‡∏±‡∏ô‡∏£‡∏´‡∏±‡∏™‡∏ú‡πà‡∏≤‡∏ô‡πÑ‡∏°‡πà‡∏ï‡∏£‡∏á‡∏Å‡∏±‡∏ô' });
  if (!consent_pdpa || !consent_terms || !consent_contract_rate || !consent_deposit) return res.status(400).json({ error: '‡∏Å‡∏£‡∏∏‡∏ì‡∏≤‡∏¢‡∏≠‡∏°‡∏£‡∏±‡∏ö PDPA ‡πÄ‡∏á‡∏∑‡πà‡∏≠‡∏ô‡πÑ‡∏Ç‡∏Å‡∏≤‡∏£‡∏™‡∏°‡∏±‡∏Ñ‡∏£ ‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡πÄ‡∏£‡∏ó‡πÄ‡∏î‡∏µ‡∏¢‡∏ß ‡πÅ‡∏•‡∏∞‡πÄ‡∏á‡∏¥‡∏ô‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô‡∏Å‡πà‡∏≠‡∏ô‡∏™‡πà‡∏á‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£' });

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
    return res.status(500).json({ error: '‡∏™‡πà‡∏á‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  } finally {
    client.release();
  }
});

app.get('/partner/application/:application_code', async (req, res) => {
  try {
    const application_code = sanitizePartnerApplicationCode(req.params.application_code);
    if (!application_code) return res.status(400).json({ error: '‡∏ï‡πâ‡∏≠‡∏á‡∏°‡∏µ application_code' });
    const appR = await pool.query(`SELECT * FROM public.partner_applications WHERE application_code=$1 LIMIT 1`, [application_code]);
    if (!appR.rows.length) return res.status(404).json({ error: '‡πÑ‡∏°‡πà‡∏û‡∏ö‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£' });
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
    return res.status(500).json({ error: '‡πÇ‡∏´‡∏•‡∏î‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  }
});

app.post('/partner/application/:application_code/documents', upload.single('document'), async (req, res) => {
  const application_code = sanitizePartnerApplicationCode(req.params.application_code);
  const document_type = String(req.body?.document_type || '').trim();
  if (!application_code) return res.status(400).json({ error: '‡∏ï‡πâ‡∏≠‡∏á‡∏°‡∏µ application_code' });
  if (!PARTNER_DOCUMENT_TYPES.has(document_type)) return res.status(400).json({ error: 'document_type ‡πÑ‡∏°‡πà‡∏ñ‡∏π‡∏Å‡∏ï‡πâ‡∏≠‡∏á' });
  if (!req.file) return res.status(400).json({ error: '‡∏Å‡∏£‡∏∏‡∏ì‡∏≤‡πÅ‡∏ô‡∏ö‡πÑ‡∏ü‡∏•‡πå‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£' });
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
      return res.status(404).json({ error: '‡πÑ‡∏°‡πà‡∏û‡∏ö‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£' });
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
      'üìé ‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏≠‡∏±‡∏õ‡πÇ‡∏´‡∏•‡∏î‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£‡πÉ‡∏´‡∏°‡πà',
      `‡∏£‡∏´‡∏±‡∏™: ${appRow.application_code}`,
      `‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£: ${document_type}`,
      partnerAppUrl('/admin-partner-onboarding.html')
    ].join('\n'), appRow.id).catch(()=>{});
    return res.json({ ok: true, document: docR.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST partner document error:', e);
    const msg = e && e.code === 'LIMIT_FILE_SIZE'
      ? '‡πÑ‡∏ü‡∏•‡πå‡πÉ‡∏´‡∏ç‡πà‡πÄ‡∏Å‡∏¥‡∏ô 8MB'
      : e && e.message === 'PARTNER_DOCUMENTS_REQUIRE_CLOUDINARY'
        ? '‡∏£‡∏∞‡∏ö‡∏ö‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏ï‡πâ‡∏≠‡∏á‡πÉ‡∏ä‡πâ Cloudinary ‡πÉ‡∏ô production ‡∏Å‡∏£‡∏∏‡∏ì‡∏≤‡∏ï‡∏±‡πâ‡∏á‡∏Ñ‡πà‡∏≤ Cloudinary ‡∏Å‡πà‡∏≠‡∏ô‡∏£‡∏±‡∏ö‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£'
        : '‡∏≠‡∏±‡∏õ‡πÇ‡∏´‡∏•‡∏î‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à';
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
    if (!applicationCode || !phone) return res.status(400).json({ error: '‡∏ï‡πâ‡∏≠‡∏á‡∏°‡∏µ‡∏£‡∏´‡∏±‡∏™‡∏≠‡πâ‡∏≤‡∏á‡∏≠‡∏¥‡∏á‡πÅ‡∏•‡∏∞‡πÄ‡∏ö‡∏≠‡∏£‡πå‡πÇ‡∏ó‡∏£' });
    const r = await pool.query(`SELECT * FROM public.partner_applications WHERE application_code=$1 AND phone=$2 LIMIT 1`, [applicationCode, phone]);
    if (!r.rows.length) return res.status(404).json({ error: '‡πÑ‡∏°‡πà‡∏û‡∏ö‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£' });
    return res.json({ ok: true, ...(await buildPartnerStatusForApplication(r.rows[0])) });
  } catch (e) {
    console.error('GET partner status error:', e);
    return res.status(500).json({ error: '‡πÇ‡∏´‡∏•‡∏î‡∏™‡∏ñ‡∏≤‡∏ô‡∏∞‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
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
    return res.status(500).json({ error: '‡πÇ‡∏´‡∏•‡∏î‡∏™‡∏ñ‡∏≤‡∏ô‡∏∞‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
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
    return res.status(500).json({ error: '‡πÇ‡∏´‡∏•‡∏î‡∏õ‡∏£‡∏∞‡πÄ‡∏†‡∏ó‡∏á‡∏≤‡∏ô‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  }
});

app.put('/tech/partner/preferences/:certification_code', requireTechnicianSession, async (req, res) => {
  const username = req.auth?.username;
  const code = String(req.params.certification_code || '').trim();
  const enabled = normalizePartnerBool(req.body?.enabled);
  if (!PARTNER_CERTIFICATION_CODES.includes(code)) return res.status(400).json({ error: 'certification_code ‡πÑ‡∏°‡πà‡∏ñ‡∏π‡∏Å‡∏ï‡πâ‡∏≠‡∏á' });
  try {
    const cert = await pool.query(`SELECT status FROM public.technician_certifications WHERE technician_username=$1 AND certification_code=$2 LIMIT 1`, [username, code]);
    const status = cert.rows[0]?.status || 'not_started';
    if (enabled && status !== 'approved') return res.status(403).json({ error: '‡∏¢‡∏±‡∏á‡πÄ‡∏õ‡∏¥‡∏î‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô‡∏õ‡∏£‡∏∞‡πÄ‡∏†‡∏ó‡∏ô‡∏µ‡πâ‡πÑ‡∏°‡πà‡πÑ‡∏î‡πâ‡∏à‡∏ô‡∏Å‡∏ß‡πà‡∏≤‡πÅ‡∏≠‡∏î‡∏°‡∏¥‡∏ô‡∏≠‡∏ô‡∏∏‡∏°‡∏±‡∏ï‡∏¥ certification' });
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
    return res.status(500).json({ error: '‡∏ö‡∏±‡∏ô‡∏ó‡∏∂‡∏Å‡∏õ‡∏£‡∏∞‡πÄ‡∏†‡∏ó‡∏á‡∏≤‡∏ô‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  }
});

app.get('/tech/partner/availability', requireTechnicianSession, async (req, res) => {
  try {
    const username = req.auth?.username;
    const r = await pool.query(`SELECT * FROM public.partner_availability_preferences WHERE technician_username=$1 LIMIT 1`, [username]);
    return res.json({ ok: true, availability: r.rows[0] || null });
  } catch (e) {
    console.error('GET tech partner availability error:', e);
    return res.status(500).json({ error: '‡πÇ‡∏´‡∏•‡∏î‡πÄ‡∏ß‡∏•‡∏≤‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
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
    return res.status(500).json({ error: '‡∏ö‡∏±‡∏ô‡∏ó‡∏∂‡∏Å‡πÄ‡∏ß‡∏•‡∏≤‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  }
});

app.get('/admin/partners/applications', requireAdminSession, async (req, res) => {
  try {
    const status = String(req.query.status || '').trim();
    const q = String(req.query.q || '').trim();
    if (status && !PARTNER_APPLICATION_STATUSES.has(status)) return res.status(400).json({ error: 'status ‡πÑ‡∏°‡πà‡∏ñ‡∏π‡∏Å‡∏ï‡πâ‡∏≠‡∏á' });
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
    return res.status(500).json({ error: '‡πÇ‡∏´‡∏•‡∏î‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  }
});

app.get('/admin/partners/applications/:id', requireAdminSession, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'id ‡πÑ‡∏°‡πà‡∏ñ‡∏π‡∏Å‡∏ï‡πâ‡∏≠‡∏á' });
    const appR = await pool.query(`SELECT * FROM public.partner_applications WHERE id=$1 LIMIT 1`, [id]);
    if (!appR.rows.length) return res.status(404).json({ error: '‡πÑ‡∏°‡πà‡∏û‡∏ö‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£' });
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
    return res.status(500).json({ error: '‡πÇ‡∏´‡∏•‡∏î‡∏£‡∏≤‡∏¢‡∏•‡∏∞‡πÄ‡∏≠‡∏µ‡∏¢‡∏î‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  }
});

app.put('/admin/partners/applications/:id/status', requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || '').trim();
  const admin_note = req.body?.admin_note == null ? null : String(req.body.admin_note || '').trim();
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'id ‡πÑ‡∏°‡πà‡∏ñ‡∏π‡∏Å‡∏ï‡πâ‡∏≠‡∏á' });
  if (!PARTNER_APPLICATION_STATUSES.has(status)) return res.status(400).json({ error: 'status ‡πÑ‡∏°‡πà‡∏ñ‡∏π‡∏Å‡∏ï‡πâ‡∏≠‡∏á' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(`SELECT id, application_code, status FROM public.partner_applications WHERE id=$1 FOR UPDATE`, [id]);
    if (!cur.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '‡πÑ‡∏°‡πà‡∏û‡∏ö‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£' });
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
    return res.status(500).json({ error: '‡∏≠‡∏±‡∏õ‡πÄ‡∏î‡∏ï‡∏™‡∏ñ‡∏≤‡∏ô‡∏∞‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
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
    return res.status(400).json({ error: 'id ‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£‡πÑ‡∏°‡πà‡∏ñ‡∏π‡∏Å‡∏ï‡πâ‡∏≠‡∏á' });
  }
  if (!PARTNER_DOCUMENT_STATUSES.has(status)) return res.status(400).json({ error: 'document status ‡πÑ‡∏°‡πà‡∏ñ‡∏π‡∏Å‡∏ï‡πâ‡∏≠‡∏á' });

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
      return res.status(404).json({ error: '‡πÑ‡∏°‡πà‡∏û‡∏ö‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£' });
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
      status === 'approved' ? '‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£‡∏Ç‡∏≠‡∏á‡∏Ñ‡∏∏‡∏ì‡∏ú‡πà‡∏≤‡∏ô‡∏Å‡∏≤‡∏£‡∏ï‡∏£‡∏ß‡∏à‡πÅ‡∏•‡πâ‡∏ß' : '‡∏°‡∏µ‡∏Å‡∏≤‡∏£‡∏≠‡∏±‡∏õ‡πÄ‡∏î‡∏ï‡∏™‡∏ñ‡∏≤‡∏ô‡∏∞‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£',
      [
        `‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£: ${row.document_type}`,
        `‡∏™‡∏ñ‡∏≤‡∏ô‡∏∞: ${status}`,
        admin_note ? `‡∏´‡∏°‡∏≤‡∏¢‡πÄ‡∏´‡∏ï‡∏∏: ${admin_note}` : '',
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
    return res.status(500).json({ error: '‡∏≠‡∏±‡∏õ‡πÄ‡∏î‡∏ï‡∏™‡∏ñ‡∏≤‡∏ô‡∏∞‡πÄ‡∏≠‡∏Å‡∏™‡∏≤‡∏£‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
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
  if (/placeholder/i.test(content) || content.includes('‡∏ï‡πâ‡∏≠‡∏á‡∏ô‡∏≥‡πÄ‡∏ô‡∏∑‡πâ‡∏≠‡∏´‡∏≤') || content.includes('‡πÇ‡∏õ‡∏£‡∏î‡∏ô‡∏≥‡πÄ‡∏ô‡∏∑‡πâ‡∏≠‡∏´‡∏≤')) return false;
  return true;
}

function partnerAgreementReadinessMessage(template) {
  if (isPartnerAgreementTemplateReady(template)) return '';
  return '‡∏¢‡∏±‡∏á‡πÑ‡∏°‡πà‡∏™‡∏≤‡∏°‡∏≤‡∏£‡∏ñ‡πÄ‡∏ã‡πá‡∏ô‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡πÑ‡∏î‡πâ ‡πÄ‡∏û‡∏£‡∏≤‡∏∞‡∏¢‡∏±‡∏á‡πÑ‡∏°‡πà‡πÑ‡∏î‡πâ‡∏ô‡∏≥‡πÄ‡∏Ç‡πâ‡∏≤‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡∏â‡∏ö‡∏±‡∏ö‡∏à‡∏£‡∏¥‡∏á';
}

// =======================================
// Partner Agreement / Academy / Exam / Certification / Trial
// Enforcement helpers are available above, but job-blocking remains OFF by default.
// =======================================
app.get('/partner/agreement/:application_code', async (req, res) => {
  try {
    const appRow = await getPartnerApplicationByCode(req.params.application_code);
    if (!appRow) return res.status(404).json({ error: '‡πÑ‡∏°‡πà‡∏û‡∏ö‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£' });
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
    return res.status(500).json({ error: '‡πÇ‡∏´‡∏•‡∏î‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  }
});

app.post('/partner/agreement/:application_code/sign', async (req, res) => {
  const applicationCode = sanitizePartnerApplicationCode(req.params.application_code);
  const signer = String(req.body?.signer_full_name || '').trim();
  const consent = req.body?.consent === true || req.body?.consent === 'true' || req.body?.consent === 1 || req.body?.consent === '1';
  const signatureDataUrl = String(req.body?.signature_data_url || '').trim();
  if (!signer) return res.status(400).json({ error: '‡∏Å‡∏£‡∏∏‡∏ì‡∏≤‡∏û‡∏¥‡∏°‡∏û‡πå‡∏ä‡∏∑‡πà‡∏≠-‡∏ô‡∏≤‡∏°‡∏™‡∏Å‡∏∏‡∏•‡πÄ‡∏û‡∏∑‡πà‡∏≠‡πÄ‡∏ã‡πá‡∏ô‡∏™‡∏±‡∏ç‡∏ç‡∏≤' });
  if (!consent) return res.status(400).json({ error: '‡∏Å‡∏£‡∏∏‡∏ì‡∏≤‡∏¢‡∏∑‡∏ô‡∏¢‡∏±‡∏ô‡∏Å‡∏≤‡∏£‡∏¢‡∏≠‡∏°‡∏£‡∏±‡∏ö‡∏™‡∏±‡∏ç‡∏ç‡∏≤' });
  if (!signatureDataUrl || !signatureDataUrl.startsWith('data:image/png;base64,') || signatureDataUrl.length < 800) {
    return res.status(400).json({ error: '‡∏Å‡∏£‡∏∏‡∏ì‡∏≤‡πÄ‡∏ã‡πá‡∏ô‡∏•‡∏≤‡∏¢‡πÄ‡∏ã‡πá‡∏ô‡∏ö‡∏ô‡∏´‡∏ô‡πâ‡∏≤‡∏à‡∏≠‡∏Å‡πà‡∏≠‡∏ô‡∏¢‡∏∑‡∏ô‡∏¢‡∏±‡∏ô‡∏™‡∏±‡∏ç‡∏ç‡∏≤' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const appR = await client.query(`SELECT * FROM public.partner_applications WHERE application_code=$1 FOR UPDATE`, [applicationCode]);
    if (!appR.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '‡πÑ‡∏°‡πà‡∏û‡∏ö‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£' });
    }
    const tplR = await client.query(
      `SELECT * FROM public.agreement_templates WHERE template_code='partner_standard' AND is_active=TRUE ORDER BY version DESC LIMIT 1`
    );
    if (!tplR.rows.length) throw new Error('‡πÑ‡∏°‡πà‡∏û‡∏ö template ‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡∏ó‡∏µ‡πà‡πÄ‡∏õ‡∏¥‡∏î‡πÉ‡∏ä‡πâ‡∏á‡∏≤‡∏ô');
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
      'üìù ‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡πÄ‡∏ã‡πá‡∏ô‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡πÅ‡∏•‡πâ‡∏ß',
      `‡∏ä‡∏∑‡πà‡∏≠: ${appR.rows[0].full_name || '-'}`,
      `‡∏£‡∏´‡∏±‡∏™: ${appR.rows[0].application_code || '-'}`,
      partnerAppUrl('/admin-partner-onboarding.html')
    ].join('\n'), appR.rows[0].id).catch(()=>{});
    notifyPartnerApplicant(appR.rows[0].id, 'partner_agreement_signed', partnerNotifyTextApplicant(
      '‡πÄ‡∏ã‡πá‡∏ô‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡πÄ‡∏£‡∏µ‡∏¢‡∏ö‡∏£‡πâ‡∏≠‡∏¢‡πÅ‡∏•‡πâ‡∏ß',
      ['‡∏Ç‡∏±‡πâ‡∏ô‡∏ï‡∏≠‡∏ô‡∏ï‡πà‡∏≠‡πÑ‡∏õ: ‡πÄ‡∏Ç‡πâ‡∏≤ Academy ‡πÄ‡∏û‡∏∑‡πà‡∏≠‡∏≠‡∏ö‡∏£‡∏°‡πÅ‡∏•‡∏∞‡∏ó‡∏≥‡∏Ç‡πâ‡∏≠‡∏™‡∏≠‡∏ö', partnerAppUrl('/partner-dashboard.html')]
    ), client).catch(()=>{});
    return res.json({ ok: true, signature: sig.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST partner agreement sign error:', e);
    return res.status(500).json({ error: e.message || '‡πÄ‡∏ã‡πá‡∏ô‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  } finally {
    client.release();
  }
});

app.get('/partner/academy/:application_code', async (req, res) => {
  try {
    const appRow = await getPartnerApplicationByCode(req.params.application_code);
    if (!appRow) return res.status(404).json({ error: '‡πÑ‡∏°‡πà‡∏û‡∏ö‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£' });
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
    return res.status(500).json({ error: '‡πÇ‡∏´‡∏•‡∏î Academy ‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  }
});

app.post('/partner/academy/:application_code/lessons/:lesson_id/complete', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const appRow = await getPartnerApplicationByCode(req.params.application_code, client);
    if (!appRow) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '‡πÑ‡∏°‡πà‡∏û‡∏ö‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£' });
    }
    const lessonId = Number(req.params.lesson_id);
    if (!Number.isFinite(lessonId) || lessonId <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'lesson_id ‡πÑ‡∏°‡πà‡∏ñ‡∏π‡∏Å‡∏ï‡πâ‡∏≠‡∏á' });
    }
    const lessonR = await client.query(`SELECT id, course_id, lesson_title, COALESCE(min_watch_seconds,60)::int AS min_watch_seconds FROM public.academy_lessons WHERE id=$1 AND is_active=TRUE LIMIT 1`, [lessonId]);
    if (!lessonR.rows.length) throw new Error('‡πÑ‡∏°‡πà‡∏û‡∏ö‡∏ö‡∏ó‡πÄ‡∏£‡∏µ‡∏¢‡∏ô');
    const watchedSeconds = Math.max(0, Math.round(Number(req.body?.watched_seconds || 0)));
    if (watchedSeconds < Number(lessonR.rows[0].min_watch_seconds || 60)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `‡∏ï‡πâ‡∏≠‡∏á‡∏î‡∏π‡∏ö‡∏ó‡πÄ‡∏£‡∏µ‡∏¢‡∏ô‡∏≠‡∏¢‡πà‡∏≤‡∏á‡∏ô‡πâ‡∏≠‡∏¢ ${lessonR.rows[0].min_watch_seconds} ‡∏ß‡∏¥‡∏ô‡∏≤‡∏ó‡∏µ‡∏Å‡πà‡∏≠‡∏ô‡∏¢‡∏∑‡∏ô‡∏¢‡∏±‡∏ô`, min_watch_seconds: lessonR.rows[0].min_watch_seconds });
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
    return res.status(500).json({ error: e.message || '‡∏ö‡∏±‡∏ô‡∏ó‡∏∂‡∏Å‡∏ö‡∏ó‡πÄ‡∏£‡∏µ‡∏¢‡∏ô‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  } finally {
    client.release();
  }
});

app.get('/partner/academy/:application_code/exam', async (req, res) => {
  try {
    const appRow = await getPartnerApplicationByCode(req.params.application_code);
    if (!appRow) return res.status(404).json({ error: '‡πÑ‡∏°‡πà‡∏û‡∏ö‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£' });
    const completeR = await pool.query(`
      SELECT COUNT(l.id)::int AS total, COUNT(p.id) FILTER (WHERE COALESCE(p.completed,FALSE))::int AS completed
      FROM public.academy_courses c
      JOIN public.academy_lessons l ON l.course_id=c.id AND l.is_active=TRUE
      LEFT JOIN public.academy_progress p ON p.lesson_id=l.id AND p.application_id=$1
      WHERE c.course_code='cwf_basic_partner'`, [appRow.id]);
    const totalLessons = Number(completeR.rows[0]?.total || 0);
    const completedLessons = Number(completeR.rows[0]?.completed || 0);
    if (totalLessons > 0 && completedLessons < totalLessons) {
      return res.status(403).json({ error: '‡∏ï‡πâ‡∏≠‡∏á‡∏î‡∏π‡∏ö‡∏ó‡πÄ‡∏£‡∏µ‡∏¢‡∏ô‡πÉ‡∏´‡πâ‡∏Ñ‡∏£‡∏ö‡∏Å‡πà‡∏≠‡∏ô‡∏ó‡∏≥‡∏Ç‡πâ‡∏≠‡∏™‡∏≠‡∏ö', total_lessons: totalLessons, completed_lessons: completedLessons });
    }
    const examR = await pool.query(
      `SELECT e.* FROM public.academy_exams e JOIN public.academy_courses c ON c.id=e.course_id WHERE c.course_code='cwf_basic_partner' AND e.is_active=TRUE ORDER BY e.id DESC LIMIT 1`
    );
    if (!examR.rows.length) return res.status(404).json({ error: '‡πÑ‡∏°‡πà‡∏û‡∏ö‡∏Ç‡πâ‡∏≠‡∏™‡∏≠‡∏ö' });
    const qR = await pool.query(
      `SELECT id, question_text, choices_json, sort_order FROM public.academy_exam_questions WHERE exam_id=$1 ORDER BY sort_order ASC, id ASC`,
      [examR.rows[0].id]
    );
    return res.json({ ok: true, exam: examR.rows[0], questions: qR.rows.map(q => ({ id: q.id, question_text: q.question_text, choices_json: q.choices_json, sort_order: q.sort_order })) });
  } catch (e) {
    console.error('GET partner exam error:', e);
    return res.status(500).json({ error: '‡πÇ‡∏´‡∏•‡∏î‡∏Ç‡πâ‡∏≠‡∏™‡∏≠‡∏ö‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
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
      return res.status(404).json({ error: '‡πÑ‡∏°‡πà‡∏û‡∏ö‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£' });
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
      return res.status(403).json({ error: '‡∏ï‡πâ‡∏≠‡∏á‡∏î‡∏π‡∏ö‡∏ó‡πÄ‡∏£‡∏µ‡∏¢‡∏ô‡πÉ‡∏´‡πâ‡∏Ñ‡∏£‡∏ö‡∏Å‡πà‡∏≠‡∏ô‡∏™‡πà‡∏á‡∏Ç‡πâ‡∏≠‡∏™‡∏≠‡∏ö', total_lessons: totalLessons, completed_lessons: completedLessons });
    }
    const examR = await client.query(
      `SELECT e.* FROM public.academy_exams e JOIN public.academy_courses c ON c.id=e.course_id WHERE c.course_code='cwf_basic_partner' AND e.is_active=TRUE ORDER BY e.id DESC LIMIT 1`
    );
    if (!examR.rows.length) throw new Error('‡πÑ‡∏°‡πà‡∏û‡∏ö‡∏Ç‡πâ‡∏≠‡∏™‡∏≠‡∏ö');
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
      passed ? '‡∏™‡∏≠‡∏ö‡∏ú‡πà‡∏≤‡∏ô Basic Partner ‡πÅ‡∏•‡πâ‡∏ß' : '‡∏™‡∏≠‡∏ö‡∏¢‡∏±‡∏á‡πÑ‡∏°‡πà‡∏ú‡πà‡∏≤‡∏ô',
      [`‡∏Ñ‡∏∞‡πÅ‡∏ô‡∏ô: ${score}%`, passed ? '‡∏£‡∏≠‡πÅ‡∏≠‡∏î‡∏°‡∏¥‡∏ô‡∏ï‡∏£‡∏ß‡∏à‡πÅ‡∏•‡∏∞‡∏≠‡∏ô‡∏∏‡∏°‡∏±‡∏ï‡∏¥‡∏Ç‡∏±‡πâ‡∏ô‡∏ñ‡∏±‡∏î‡πÑ‡∏õ' : '‡∏™‡∏≤‡∏°‡∏≤‡∏£‡∏ñ‡∏ó‡∏ö‡∏ó‡∏ß‡∏ô‡∏ö‡∏ó‡πÄ‡∏£‡∏µ‡∏¢‡∏ô‡πÅ‡∏•‡∏∞‡∏™‡∏≠‡∏ö‡πÉ‡∏´‡∏°‡πà‡∏ï‡∏≤‡∏°‡πÄ‡∏á‡∏∑‡πà‡∏≠‡∏ô‡πÑ‡∏Ç', partnerAppUrl('/partner-dashboard.html')]
    ), client).catch(()=>{});
    if (passed) {
      notifyPartnerAdmins('partner_exam_passed', [
        'üéì ‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏™‡∏≠‡∏ö‡∏ú‡πà‡∏≤‡∏ô Basic Partner',
        `‡∏ä‡∏∑‡πà‡∏≠: ${appRow.full_name || '-'}`,
        `‡∏Ñ‡∏∞‡πÅ‡∏ô‡∏ô: ${score}%`,
        `‡∏£‡∏´‡∏±‡∏™: ${appRow.application_code || '-'}`,
        partnerAppUrl('/admin-partner-onboarding.html')
      ].join('\n'), appRow.id).catch(()=>{});
    }
    return res.json({ ok: true, attempt: saved.rows[0], passed });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST exam submit error:', e);
    return res.status(500).json({ error: e.message || '‡∏™‡πà‡∏á‡∏Ç‡πâ‡∏≠‡∏™‡∏≠‡∏ö‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  } finally {
    client.release();
  }
});

app.get('/admin/partners/applications/:id/agreement', requireAdminSession, async (req, res) => {
  try {
    const appRow = await getPartnerApplicationById(req.params.id);
    if (!appRow) return res.status(404).json({ error: '‡πÑ‡∏°‡πà‡∏û‡∏ö‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£' });
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
    return res.status(500).json({ error: '‡πÇ‡∏´‡∏•‡∏î‡∏™‡∏ñ‡∏≤‡∏ô‡∏∞‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  }
});

app.get('/admin/partners/applications/:id/academy', requireAdminSession, async (req, res) => {
  try {
    const appRow = await getPartnerApplicationById(req.params.id);
    if (!appRow) return res.status(404).json({ error: '‡πÑ‡∏°‡πà‡∏û‡∏ö‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£' });
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
    return res.status(500).json({ error: '‡πÇ‡∏´‡∏•‡∏î Academy ‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  }
});

app.get('/admin/partners/applications/:id/exams', requireAdminSession, async (req, res) => {
  try {
    const appRow = await getPartnerApplicationById(req.params.id);
    if (!appRow) return res.status(404).json({ error: '‡πÑ‡∏°‡πà‡∏û‡∏ö‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£' });
    const r = await pool.query(
      `SELECT a.*, e.exam_code, e.title FROM public.academy_exam_attempts a JOIN public.academy_exams e ON e.id=a.exam_id WHERE a.application_id=$1 ORDER BY a.submitted_at DESC`,
      [appRow.id]
    );
    return res.json({ ok: true, attempts: r.rows });
  } catch (e) {
    console.error('GET admin exams error:', e);
    return res.status(500).json({ error: '‡πÇ‡∏´‡∏•‡∏î‡∏ú‡∏•‡∏™‡∏≠‡∏ö‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  }
});

app.get('/admin/partners/applications/:id/certifications', requireAdminSession, async (req, res) => {
  try {
    const appRow = await getPartnerApplicationById(req.params.id);
    if (!appRow) return res.status(404).json({ error: '‡πÑ‡∏°‡πà‡∏û‡∏ö‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£' });
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
    return res.status(500).json({ error: '‡πÇ‡∏´‡∏•‡∏î Certification ‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  }
});

app.put('/admin/partners/applications/:id/certifications/:certification_code/status', requireAdminSession, async (req, res) => {
  const appId = Number(req.params.id);
  const code = String(req.params.certification_code || '').trim();
  const status = String(req.body?.status || '').trim();
  const admin_note = req.body?.admin_note == null ? null : String(req.body.admin_note || '').trim();
  if (!PARTNER_CERTIFICATION_CODES.includes(code)) return res.status(400).json({ error: 'certification_code ‡πÑ‡∏°‡πà‡∏ñ‡∏π‡∏Å‡∏ï‡πâ‡∏≠‡∏á' });
  if (!PARTNER_CERTIFICATION_STATUSES.has(status)) return res.status(400).json({ error: 'status ‡πÑ‡∏°‡πà‡∏ñ‡∏π‡∏Å‡∏ï‡πâ‡∏≠‡∏á' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const appRow = await getPartnerApplicationById(appId, client);
    if (!appRow) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '‡πÑ‡∏°‡πà‡∏û‡∏ö‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£' });
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
      status === 'approved' ? '‡∏Ñ‡∏∏‡∏ì‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö‡∏≠‡∏ô‡∏∏‡∏°‡∏±‡∏ï‡∏¥‡∏™‡∏¥‡∏ó‡∏ò‡∏¥‡πå‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô‡πÅ‡∏•‡πâ‡∏ß' : '‡∏°‡∏µ‡∏Å‡∏≤‡∏£‡∏≠‡∏±‡∏õ‡πÄ‡∏î‡∏ï‡∏™‡∏ñ‡∏≤‡∏ô‡∏∞ certification',
      [
        `‡∏õ‡∏£‡∏∞‡πÄ‡∏†‡∏ó: ${code}`,
        `‡∏™‡∏ñ‡∏≤‡∏ô‡∏∞: ${status}`,
        admin_note ? `‡∏´‡∏°‡∏≤‡∏¢‡πÄ‡∏´‡∏ï‡∏∏: ${admin_note}` : '',
        partnerAppUrl('/partner-dashboard.html')
      ].filter(Boolean)
    ), client).catch(()=>{});
    await auditLog(req, { action: 'PARTNER_CERTIFICATION_STATUS_UPDATE', target_username: appRow.application_code, target_role: 'partner_application', meta: { certification_code: code, status, admin_note } });
    return res.json({ ok: true, certification: saved.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('PUT certification status error:', e);
    return res.status(500).json({ error: '‡∏≠‡∏±‡∏õ‡πÄ‡∏î‡∏ï Certification ‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
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
    return res.status(500).json({ error: '‡∏ï‡∏£‡∏ß‡∏à certification dry-run ‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
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
    return res.status(500).json({ error: '‡∏ï‡∏£‡∏ß‡∏à‡∏£‡∏≤‡∏¢‡∏ä‡∏∑‡πà‡∏≠‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏ó‡∏µ‡πà‡πÄ‡∏´‡∏°‡∏≤‡∏∞‡∏™‡∏°‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  }
});


app.get('/admin/partners/applications/:id/interview', requireAdminSession, async (req, res) => {
  try {
    const appRow = await getPartnerApplicationById(req.params.id);
    if (!appRow) return res.status(404).json({ error: '‡πÑ‡∏°‡πà‡∏û‡∏ö‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£' });
    const r = await pool.query(
      `SELECT * FROM public.partner_interviews WHERE application_id=$1 ORDER BY interviewed_at DESC, id DESC LIMIT 1`,
      [appRow.id]
    );
    return res.json({ ok: true, interview: r.rows[0] || null });
  } catch (e) {
    console.error('GET partner interview error:', e);
    return res.status(500).json({ error: '‡πÇ‡∏´‡∏•‡∏î‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•‡∏™‡∏±‡∏°‡∏†‡∏≤‡∏©‡∏ì‡πå‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  }
});

app.put('/admin/partners/applications/:id/interview', requireAdminSession, async (req, res) => {
  const appId = Number(req.params.id);
  if (!Number.isFinite(appId) || appId <= 0) return res.status(400).json({ error: 'id ‡πÑ‡∏°‡πà‡∏ñ‡∏π‡∏Å‡∏ï‡πâ‡∏≠‡∏á' });
  const call_status = String(req.body?.call_status || 'contacted').trim();
  const result = String(req.body?.result || 'follow_up').trim();
  const allowedCall = new Set(['not_called','no_answer','contacted','follow_up','passed','failed']);
  const allowedResult = new Set(['passed','failed','follow_up']);
  if (!allowedCall.has(call_status)) return res.status(400).json({ error: 'call_status ‡πÑ‡∏°‡πà‡∏ñ‡∏π‡∏Å‡∏ï‡πâ‡∏≠‡∏á' });
  if (!allowedResult.has(result)) return res.status(400).json({ error: 'result ‡πÑ‡∏°‡πà‡∏ñ‡∏π‡∏Å‡∏ï‡πâ‡∏≠‡∏á' });
  const score = (v) => Math.max(0, Math.min(5, Number(v || 0)));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const appRow = await getPartnerApplicationById(appId, client);
    if (!appRow) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '‡πÑ‡∏°‡πà‡∏û‡∏ö‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£' });
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
      result === 'passed' ? '‡∏™‡∏±‡∏°‡∏†‡∏≤‡∏©‡∏ì‡πå‡∏ú‡πà‡∏≤‡∏ô‡πÅ‡∏•‡πâ‡∏ß' : result === 'failed' ? '‡∏ú‡∏•‡∏™‡∏±‡∏°‡∏†‡∏≤‡∏©‡∏ì‡πå‡∏¢‡∏±‡∏á‡πÑ‡∏°‡πà‡∏ú‡πà‡∏≤‡∏ô' : '‡∏°‡∏µ‡∏Å‡∏≤‡∏£‡∏ö‡∏±‡∏ô‡∏ó‡∏∂‡∏Å‡∏ú‡∏•‡∏™‡∏±‡∏°‡∏†‡∏≤‡∏©‡∏ì‡πå',
      [
        `‡∏™‡∏ñ‡∏≤‡∏ô‡∏∞: ${call_status}`,
        `‡∏ú‡∏•: ${result}`,
        admin_note ? `‡∏´‡∏°‡∏≤‡∏¢‡πÄ‡∏´‡∏ï‡∏∏: ${admin_note}` : '',
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
    return res.status(500).json({ error: '‡∏ö‡∏±‡∏ô‡∏ó‡∏∂‡∏Å‡∏™‡∏±‡∏°‡∏†‡∏≤‡∏©‡∏ì‡πå‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  } finally {
    client.release();
  }
});


app.post('/admin/partners/applications/:id/trial-jobs', requireAdminSession, async (req, res) => {
  const appId = Number(req.params.id);
  const certification_code = String(req.body?.certification_code || '').trim();
  const job_id = req.body?.job_id == null || String(req.body.job_id).trim() === '' ? null : Number(req.body.job_id);
  if (!PARTNER_CERTIFICATION_CODES.includes(certification_code)) return res.status(400).json({ error: 'certification_code ‡πÑ‡∏°‡πà‡∏ñ‡∏π‡∏Å‡∏ï‡πâ‡∏≠‡∏á' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const appRow = await getPartnerApplicationById(appId, client);
    if (!appRow) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '‡πÑ‡∏°‡πà‡∏û‡∏ö‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£' });
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
      '‡πÅ‡∏≠‡∏î‡∏°‡∏¥‡∏ô‡∏õ‡∏•‡∏î‡∏•‡πá‡∏≠‡∏Å‡∏á‡∏≤‡∏ô‡∏ó‡∏î‡∏•‡∏≠‡∏á‡πÉ‡∏´‡πâ‡πÅ‡∏•‡πâ‡∏ß',
      [`‡∏õ‡∏£‡∏∞‡πÄ‡∏†‡∏ó: ${certification_code}`, req.body?.admin_note ? `‡∏´‡∏°‡∏≤‡∏¢‡πÄ‡∏´‡∏ï‡∏∏: ${req.body.admin_note}` : '', partnerAppUrl('/partner-dashboard.html')].filter(Boolean)
    ), client).catch(()=>{});
    await auditLog(req, { action: 'PARTNER_TRIAL_UNLOCKED', target_username: appRow.application_code, target_role: 'partner_application', meta: { certification_code, trial_job_id: saved.rows[0].id } });
    return res.json({ ok: true, trial_job: saved.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST trial job error:', e);
    return res.status(500).json({ error: '‡∏õ‡∏•‡∏î‡∏•‡πá‡∏≠‡∏Å Trial ‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  } finally {
    client.release();
  }
});

app.get('/admin/partners/applications/:id/trial-jobs', requireAdminSession, async (req, res) => {
  try {
    const appRow = await getPartnerApplicationById(req.params.id);
    if (!appRow) return res.status(404).json({ error: '‡πÑ‡∏°‡πà‡∏û‡∏ö‡πÉ‡∏ö‡∏™‡∏°‡∏±‡∏Ñ‡∏£' });
    const trials = await pool.query(`SELECT * FROM public.partner_trial_jobs WHERE application_id=$1 ORDER BY created_at DESC`, [appRow.id]);
    const evals = await pool.query(`SELECT * FROM public.partner_evaluations WHERE application_id=$1 ORDER BY evaluated_at DESC`, [appRow.id]);
    return res.json({ ok: true, trial_jobs: trials.rows, evaluations: evals.rows });
  } catch (e) {
    console.error('GET trial jobs error:', e);
    return res.status(500).json({ error: '‡πÇ‡∏´‡∏•‡∏î Trial ‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  }
});

app.post('/admin/partners/trial-jobs/:trial_job_id/evaluate', requireAdminSession, async (req, res) => {
  const trialId = Number(req.params.trial_job_id);
  const result = String(req.body?.result || '').trim();
  if (!Number.isFinite(trialId) || trialId <= 0) return res.status(400).json({ error: 'trial_job_id ‡πÑ‡∏°‡πà‡∏ñ‡∏π‡∏Å‡∏ï‡πâ‡∏≠‡∏á' });
  if (!PARTNER_TRIAL_RESULTS.has(result)) return res.status(400).json({ error: 'result ‡πÑ‡∏°‡πà‡∏ñ‡∏π‡∏Å‡∏ï‡πâ‡∏≠‡∏á' });
  const score = (v) => Math.max(0, Math.min(5, Number(v || 0)));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const trialR = await client.query(`SELECT * FROM public.partner_trial_jobs WHERE id=$1 FOR UPDATE`, [trialId]);
    if (!trialR.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '‡πÑ‡∏°‡πà‡∏û‡∏ö Trial job' });
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
        [trial.application_id, trial.technician_username, trial.certification_code, req.body?.admin_note || '‡∏ú‡πà‡∏≤‡∏ô Trial Evaluation ‡πÅ‡∏•‡∏∞‡∏≠‡∏ô‡∏∏‡∏°‡∏±‡∏ï‡∏¥‡∏™‡∏¥‡∏ó‡∏ò‡∏¥‡πå‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô', actor]
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
      result === 'passed' ? '‡∏á‡∏≤‡∏ô‡∏ó‡∏î‡∏•‡∏≠‡∏á‡∏ú‡πà‡∏≤‡∏ô‡πÅ‡∏•‡πâ‡∏ß' : result === 'needs_more_trial' ? '‡∏ï‡πâ‡∏≠‡∏á‡∏ó‡∏î‡∏•‡∏≠‡∏á‡∏á‡∏≤‡∏ô‡πÄ‡∏û‡∏¥‡πà‡∏°‡πÄ‡∏ï‡∏¥‡∏°' : '‡∏á‡∏≤‡∏ô‡∏ó‡∏î‡∏•‡∏≠‡∏á‡πÑ‡∏°‡πà‡∏ú‡πà‡∏≤‡∏ô',
      [
        `‡∏õ‡∏£‡∏∞‡πÄ‡∏†‡∏ó: ${trial.certification_code}`,
        `‡∏ú‡∏•: ${result}`,
        approveCertification ? '‡πÄ‡∏õ‡∏¥‡∏î‡∏™‡∏¥‡∏ó‡∏ò‡∏¥‡πå‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô‡∏õ‡∏£‡∏∞‡πÄ‡∏†‡∏ó‡∏ô‡∏µ‡πâ‡πÅ‡∏•‡πâ‡∏ß' : '',
        req.body?.admin_note ? `‡∏´‡∏°‡∏≤‡∏¢‡πÄ‡∏´‡∏ï‡∏∏: ${req.body.admin_note}` : '',
        partnerAppUrl('/partner-dashboard.html')
      ].filter(Boolean)
    ), client).catch(()=>{});
    await auditLog(req, { action: 'PARTNER_TRIAL_EVALUATED', target_role: 'partner_application', meta: { trial_job_id: trial.id, result } });
    return res.json({ ok: true, evaluation: saved.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST trial evaluate error:', e);
    return res.status(500).json({ error: '‡∏ö‡∏±‡∏ô‡∏ó‡∏∂‡∏Å‡∏õ‡∏£‡∏∞‡πÄ‡∏°‡∏¥‡∏ô Trial ‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
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
// üìä ADMIN DASHBOARD V2 (Phase 3)
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
             AND COALESCE(j.job_status,'') NOT IN ('‡∏¢‡∏Å‡πÄ‡∏•‡∏¥‡∏Å','cancelled','canceled')
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
             AND COALESCE(j.job_status,'') NOT IN ('‡∏¢‡∏Å‡πÄ‡∏•‡∏¥‡∏Å','cancelled','canceled')
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
           AND COALESCE(job_status,'') NOT IN ('‡∏¢‡∏Å‡πÄ‡∏•‡∏¥‡∏Å','cancelled','canceled')
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
         WHERE COALESCE(job_status,'') IN ('‡∏£‡∏≠‡∏ï‡∏£‡∏ß‡∏à‡∏™‡∏≠‡∏ö','pending_review')
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
         WHERE COALESCE(job_status,'') IN ('‡∏£‡∏≠‡∏î‡∏≥‡πÄ‡∏ô‡∏¥‡∏ô‡∏Å‡∏≤‡∏£','‡∏Å‡∏≥‡∏•‡∏±‡∏á‡∏ó‡∏≥','‡∏ï‡∏µ‡∏Å‡∏•‡∏±‡∏ö','‡∏£‡∏≠‡∏ä‡πà‡∏≤‡∏á‡∏¢‡∏∑‡∏ô‡∏¢‡∏±‡∏ô','‡∏á‡∏≤‡∏ô‡πÅ‡∏Å‡πâ‡πÑ‡∏Ç')
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
           CASE WHEN LOWER(COALESCE(p.employment_type,'company')) IN ('partner','‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå') THEN 'partner' ELSE 'company' END AS tech_type,
           CASE WHEN LOWER(COALESCE(p.accept_status,'paused')) IN ('ready','open','available','‡∏£‡∏±‡∏ö‡∏á‡∏≤‡∏ô') AND p.accept_status_expires_at IS NOT NULL AND p.accept_status_expires_at > NOW() THEN 'open' ELSE 'closed' END AS bucket,
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
         AND COALESCE(job_status,'') NOT IN ('‡∏¢‡∏Å‡πÄ‡∏•‡∏¥‡∏Å','cancelled','canceled')
       GROUP BY 1`,
      [d_from, d_to]
      );
    } catch (e) {
      debug.partial = true;
      debug.notes.push('donut status query failed');
    }

    const STATUS_BUCKETS = {
      pending: new Set(['‡∏£‡∏≠‡∏ï‡∏£‡∏ß‡∏à‡∏™‡∏≠‡∏ö','pending_review']),
      active: new Set(['‡∏£‡∏≠‡∏î‡∏≥‡πÄ‡∏ô‡∏¥‡∏ô‡∏Å‡∏≤‡∏£','‡∏Å‡∏≥‡∏•‡∏±‡∏á‡∏ó‡∏≥','‡∏ï‡∏µ‡∏Å‡∏•‡∏±‡∏ö','‡∏£‡∏≠‡∏ä‡πà‡∏≤‡∏á‡∏¢‡∏∑‡∏ô‡∏¢‡∏±‡∏ô','‡∏á‡∏≤‡∏ô‡πÅ‡∏Å‡πâ‡πÑ‡∏Ç']),
      // NOTE: backend ‡∏à‡∏£‡∏¥‡∏á‡πÉ‡∏ä‡πâ‡∏´‡∏•‡∏≤‡∏¢‡∏Ñ‡∏≥ (‡∏Å‡∏±‡∏ô "‡∏á‡∏≤‡∏ô‡∏´‡∏≤‡∏¢")
      done: new Set(['‡πÄ‡∏™‡∏£‡πá‡∏à‡πÅ‡∏•‡πâ‡∏ß','‡πÄ‡∏™‡∏£‡πá‡∏à‡∏™‡∏¥‡πâ‡∏ô','‡∏õ‡∏¥‡∏î‡∏á‡∏≤‡∏ô','completed','done']),
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
           AND COALESCE(j.job_status,'') NOT IN ('‡∏¢‡∏Å‡πÄ‡∏•‡∏¥‡∏Å','cancelled','canceled')
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
             AND COALESCE(j.job_status,'') NOT IN ('‡∏¢‡∏Å‡πÄ‡∏•‡∏¥‡∏Å','cancelled','canceled')
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
    return res.status(500).json({ error: '‡πÇ‡∏´‡∏•‡∏î Dashboard ‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  }
});

// =======================================
// üë§ ADMIN PROFILE V2 (Phase 3)
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
    return res.status(500).json({ error: '‡πÇ‡∏´‡∏•‡∏î‡πÇ‡∏õ‡∏£‡πÑ‡∏ü‡∏•‡πå‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
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
    return res.status(500).json({ error: '‡∏ö‡∏±‡∏ô‡∏ó‡∏∂‡∏Å‡∏ä‡∏∑‡πà‡∏≠‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  }
});

app.post("/admin/profile_v2/me/photo", requireAdminSession, upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "‡πÑ‡∏°‡πà‡∏û‡∏ö‡πÑ‡∏ü‡∏•‡πå‡∏£‡∏π‡∏õ" });
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
    return res.status(500).json({ error: '‡∏≠‡∏±‡∏õ‡πÇ‡∏´‡∏•‡∏î‡∏£‡∏π‡∏õ‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  }
});



// =======================================
// üõ°Ô∏è ADMIN SUPER V2 (Phase 5)
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
    return res.status(500).json({ error: '‡πÇ‡∏´‡∏•‡∏î‡∏£‡∏≤‡∏¢‡∏ä‡∏∑‡πà‡∏≠‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  }
});

// Create Admin (admin or super_admin)
app.post('/admin/super/admins', requireSuperAdmin, async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '').trim();
    const role = 'admin'; // locked: no super_admin role in DB
    const full_name = String(req.body?.full_name || '').trim();
    if (!username || !password) return res.status(400).json({ error: '‡∏ï‡πâ‡∏≠‡∏á‡∏°‡∏µ username ‡πÅ‡∏•‡∏∞ password' });

    await pool.query(
      `INSERT INTO public.users(username, password, role, full_name) VALUES($1,$2,$3,$4)`,
      [username, password, role, full_name]
    );

    await auditLog(req, { action: 'ADMIN_CREATE', target_username: username, target_role: role, meta: { full_name } });
    return res.json({ ok: true });
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes('duplicate') || msg.includes('unique')) return res.status(409).json({ error: 'username ‡∏ã‡πâ‡∏≥' });
    console.error('POST /admin/super/admins', e);
    return res.status(500).json({ error: '‡∏™‡∏£‡πâ‡∏≤‡∏á‡πÅ‡∏≠‡∏î‡∏°‡∏¥‡∏ô‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
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
    return res.status(500).json({ error: '‡∏≠‡∏±‡∏õ‡πÄ‡∏î‡∏ï‡πÅ‡∏≠‡∏î‡∏°‡∏¥‡∏ô‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  }
});

// Impersonate
app.post('/admin/super/impersonate', requireSuperAdmin, async (req, res) => {
  try {
    const target = String(req.body?.target_username || '').trim();
    if (!target) return res.status(400).json({ error: '‡∏ï‡πâ‡∏≠‡∏á‡∏°‡∏µ target_username' });

    const q = await pool.query(`SELECT username, role FROM public.users WHERE username=$1 LIMIT 1`, [target]);
    if ((q.rows || []).length === 0) return res.status(404).json({ error: '‡πÑ‡∏°‡πà‡∏û‡∏ö‡∏ú‡∏π‡πâ‡πÉ‡∏ä‡πâ' });
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
    return res.status(500).json({ error: '‡∏™‡∏ß‡∏°‡∏™‡∏¥‡∏ó‡∏ò‡∏¥‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
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
    return res.status(500).json({ error: '‡∏´‡∏¢‡∏∏‡∏î‡∏™‡∏ß‡∏°‡∏™‡∏¥‡∏ó‡∏ò‡∏¥‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
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
    return res.status(500).json({ error: '‡πÇ‡∏´‡∏•‡∏î audit log ‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
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
    return res.status(500).json({ error: '‡πÇ‡∏´‡∏•‡∏î duration ‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  }
});

app.post('/admin/super/durations', requireSuperAdmin, async (req, res) => {
  try {
    const service_key = String(req.body?.service_key || '').trim();
    const duration_min = Number(req.body?.duration_min);
    if (!service_key || !Number.isFinite(duration_min) || duration_min <= 0) {
      return res.status(400).json({ error: '‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•‡πÑ‡∏°‡πà‡∏Ñ‡∏£‡∏ö' });
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
    return res.status(500).json({ error: '‡∏ö‡∏±‡∏ô‡∏ó‡∏∂‡∏Å duration ‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  }
});

app.delete('/admin/super/durations/:service_key', requireSuperAdmin, async (req, res) => {
  try {
    const key = String(req.params.service_key || '').trim();
    if (!key) return res.status(400).json({ error: '‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•‡πÑ‡∏°‡πà‡∏Ñ‡∏£‡∏ö' });
    await pool.query('DELETE FROM public.service_duration_rules WHERE service_key=$1', [key]);
    await auditLog(req, { action: 'DURATION_DELETE', meta: { service_key: key } });
    return res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /admin/super/durations', e);
    return res.status(500).json({ error: '‡∏•‡∏ö duration ‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
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
    return res.status(500).json({ error: '‡πÇ‡∏´‡∏•‡∏î‡∏Ç‡πâ‡∏≠‡∏Ñ‡∏ß‡∏≤‡∏°‡∏¢‡∏∑‡∏ô‡∏¢‡∏±‡∏ô‡∏ô‡∏±‡∏î‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
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
      return res.status(400).json({ error: '‡∏Ç‡πâ‡∏≠‡∏Ñ‡∏ß‡∏≤‡∏°‡∏™‡∏±‡πâ‡∏ô‡πÄ‡∏Å‡∏¥‡∏ô‡πÑ‡∏õ‡∏´‡∏£‡∏∑‡∏≠‡πÑ‡∏°‡πà‡∏Ñ‡∏£‡∏ö' });
    }
    const missing = missingCustomerConfirmationPlaceholders(template_text, lang);
    if (missing.length) {
      return res.status(400).json({ error: `‡∏¢‡∏±‡∏á‡∏ö‡∏±‡∏ô‡∏ó‡∏∂‡∏Å‡πÑ‡∏°‡πà‡πÑ‡∏î‡πâ ‡∏Ç‡∏≤‡∏î‡∏ï‡∏±‡∏ß‡πÅ‡∏õ‡∏£‡∏à‡∏≥‡πÄ‡∏õ‡πá‡∏ô: ${missing.map(k => `{{${k}}}`).join(', ')}`, missing_placeholders: missing });
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
    return res.status(500).json({ error: '‡∏ö‡∏±‡∏ô‡∏ó‡∏∂‡∏Å‡∏Ç‡πâ‡∏≠‡∏Ñ‡∏ß‡∏≤‡∏°‡∏¢‡∏∑‡∏ô‡∏¢‡∏±‡∏ô‡∏ô‡∏±‡∏î‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
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
      customer_name: 'Test ‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤',
      customer_phone: '0987654321',
      appointment_datetime: new Date(),
      address_text: '‡∏≠‡πà‡∏≠‡∏ô‡∏ô‡∏∏‡∏ä ‡∏ñ‡∏ô‡∏ô‡∏™‡∏∏‡∏Ç‡∏∏‡∏°‡∏ß‡∏¥‡∏ó ‡∏Å‡∏£‡∏∏‡∏á‡πÄ‡∏ó‡∏û‡∏Ø',
      job_type: '‡∏•‡πâ‡∏≤‡∏á',
      job_price: 1600,
    };
    const dt = new Date(sampleJob.appointment_datetime);
    const vars = buildCustomerConfirmationVars({
      job: sampleJob,
      items: [{ item_name:'‡∏•‡πâ‡∏≤‡∏á‡πÅ‡∏≠‡∏£‡πå‡∏ú‡∏ô‡∏±‡∏á ‡πÑ‡∏°‡πà‡πÄ‡∏Å‡∏¥‡∏ô 12,000 BTU', qty:2, unit_price:800, line_total:1600 }],
      origin,
      ddTH: dt.toLocaleDateString('th-TH', { timeZone:'Asia/Bangkok' }),
      ttTH: dt.toLocaleTimeString('th-TH', { timeZone:'Asia/Bangkok', hour:'2-digit', minute:'2-digit' }),
      ddEN: dt.toLocaleDateString('en-GB', { timeZone:'Asia/Bangkok' }),
      ttEN: dt.toLocaleTimeString('en-GB', { timeZone:'Asia/Bangkok', hour:'2-digit', minute:'2-digit' }),
    });
    return res.json({ ok:true, text: renderCustomerConfirmationTemplate(template, vars) });
  } catch (e) {
    console.error('POST /admin/super/customer_confirmation_template/preview', e);
    return res.status(500).json({ error: 'preview ‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  }
});

// =======================================
// üí≤ Technician Income Settings (ISSUE-2/3)
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
    return res.status(500).json({ error: '‡πÇ‡∏´‡∏•‡∏î defaults ‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
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
    return res.status(500).json({ error: '‡∏ö‡∏±‡∏ô‡∏ó‡∏∂‡∏Å defaults ‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
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
    return res.status(500).json({ error: '‡πÇ‡∏´‡∏•‡∏î overrides ‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
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
    return res.status(500).json({ error: '‡∏ö‡∏±‡∏ô‡∏ó‡∏∂‡∏Å override ‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
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
    return res.status(500).json({ error: '‡∏•‡πâ‡∏≤‡∏á override ‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
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
      warning: activeFull ? '' : '‡∏¢‡∏±‡∏á‡πÑ‡∏°‡πà‡∏°‡∏µ active rate set ‡πÉ‡∏ô‡∏ê‡∏≤‡∏ô‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏• ‡∏£‡∏∞‡∏ö‡∏ö‡∏à‡∏∞‡πÉ‡∏ä‡πâ fallback v4 ‡∏ä‡∏±‡πà‡∏ß‡∏Ñ‡∏£‡∏≤‡∏ß'
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
    if (/\d+\s*‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á/.test(name)) return true;
    if (n.includes('‡∏•‡πâ‡∏≤‡∏á‡πÅ‡∏≠‡∏£‡πå') || n.includes('‡∏ã‡πà‡∏≠‡∏°‡πÅ‡∏≠‡∏£‡πå') || n.includes('‡∏ï‡∏¥‡∏î‡∏ï‡∏±‡πâ‡∏á‡πÅ‡∏≠‡∏£‡πå')) return true;
    if (name.includes('‡∏•‡πâ‡∏≤‡∏á') && (name.includes('‡∏ú‡∏ô‡∏±‡∏á') || name.includes('‡∏™‡∏µ‡πà‡∏ó‡∏¥‡∏®') || name.includes('‡πÅ‡∏Ç‡∏ß‡∏ô') || name.includes('‡πÄ‡∏õ‡∏•‡∏∑‡∏≠‡∏¢') || name.includes('‡∏Ñ‡∏≠‡∏¢'))) return true;
    if (/(‡∏ò‡∏£‡∏£‡∏°‡∏î‡∏≤|‡∏õ‡∏Å‡∏ï‡∏¥|normal|‡∏û‡∏£‡∏µ‡πÄ‡∏°‡∏µ‡∏¢‡∏°|premium|‡πÅ‡∏Ç‡∏ß‡∏ô‡∏Ñ‡∏≠‡∏¢|‡πÅ‡∏Ç‡∏ß‡∏ô‡∏Ñ‡∏≠‡∏¢‡∏ô‡πå|‡πÅ‡∏Ç‡∏ß‡∏ô‡∏Ñ‡∏≠‡∏¢‡∏•‡πå|‡∏ï‡∏±‡∏î‡∏•‡πâ‡∏≤‡∏á|‡∏•‡πâ‡∏≤‡∏á‡πÉ‡∏´‡∏ç‡πà|overhaul|‡∏™‡∏µ‡πà‡∏ó‡∏¥‡∏®‡∏ó‡∏≤‡∏á|‡πÄ‡∏õ‡∏•‡∏∑‡∏≠‡∏¢‡πÉ‡∏ï‡πâ‡∏ù‡πâ‡∏≤)/i.test(name)) return true;
    if (/‚Ä¢\s*\d{3,}/.test(name) && /(‡∏ò‡∏£‡∏£‡∏°‡∏î‡∏≤|‡∏õ‡∏Å‡∏ï‡∏¥|‡∏û‡∏£‡∏µ‡πÄ‡∏°‡∏µ‡∏¢‡∏°|‡πÅ‡∏Ç‡∏ß‡∏ô|‡∏Ñ‡∏≠‡∏¢|‡∏ï‡∏±‡∏î‡∏•‡πâ‡∏≤‡∏á|‡∏•‡πâ‡∏≤‡∏á‡πÉ‡∏´‡∏ç‡πà|‡∏™‡∏µ‡πà‡∏ó‡∏¥‡∏®|‡πÄ‡∏õ‡∏•‡∏∑‡∏≠‡∏¢)/.test(name)) return true;
    if (qty > 0 && /(‡∏•‡πâ‡∏≤‡∏á|‡∏ã‡πà‡∏≠‡∏°|‡∏ï‡∏¥‡∏î‡∏ï‡∏±‡πâ‡∏á|‡πÅ‡∏≠‡∏£‡πå|‡∏Ñ‡∏≠‡∏¢‡∏•‡πå|‡∏Ñ‡∏≠‡∏¢‡∏ô‡πå)/.test(name)) return true;
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
    note: 'contract_only: ‡πÉ‡∏ä‡πâ‡πÄ‡∏£‡∏ó‡∏ö‡∏≤‡∏ó/‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡∏ï‡∏≤‡∏°‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡πÄ‡∏ó‡πà‡∏≤‡∏ô‡∏±‡πâ‡∏ô ‡πÑ‡∏°‡πà‡πÉ‡∏ä‡πâ‡πÄ‡∏õ‡∏≠‡∏£‡πå‡πÄ‡∏ã‡πá‡∏ô‡∏ï‡πå/‡∏£‡∏≤‡∏Ñ‡∏≤‡∏Ç‡∏≤‡∏¢‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤',
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
// üßæ Technician Payout Periods (Phase 1)
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
// ‚úÖ Done-status predicate (Bangkok production)
// - ‡∏´‡∏•‡∏≤‡∏¢‡∏´‡∏ô‡πâ‡∏≤‡∏ù‡∏±‡πà‡∏á PWA ‡πÉ‡∏ä‡πâ‡∏´‡∏•‡∏≤‡∏¢‡∏Ñ‡∏≥ ‡πÄ‡∏ä‡πà‡∏ô "‡πÄ‡∏™‡∏£‡πá‡∏à‡πÅ‡∏•‡πâ‡∏ß/‡πÄ‡∏™‡∏£‡πá‡∏à‡∏™‡∏¥‡πâ‡∏ô/‡∏õ‡∏¥‡∏î‡∏á‡∏≤‡∏ô/done/completed"
// - ‡∏ñ‡πâ‡∏≤ backend filter ‡πÅ‡∏Ñ‡πà "‡πÄ‡∏™‡∏£‡πá‡∏à‡πÅ‡∏•‡πâ‡∏ß" ‡∏à‡∏∞‡∏ó‡∏≥‡πÉ‡∏´‡πâ "‡∏á‡∏≤‡∏ô‡∏´‡∏≤‡∏¢" ‡πÅ‡∏•‡∏∞‡∏¢‡∏≠‡∏î‡πÑ‡∏°‡πà‡∏ï‡∏£‡∏á
// - ‡πÉ‡∏ä‡πâ predicate ‡πÄ‡∏î‡∏µ‡∏¢‡∏ß‡∏Å‡∏±‡∏ô‡∏ó‡∏∏‡∏Å‡∏ó‡∏µ‡πà‡∏ó‡∏µ‡πà‡∏ï‡πâ‡∏≠‡∏á‡∏î‡∏∂‡∏á‡∏á‡∏≤‡∏ô‡∏ó‡∏µ‡πà‡∏õ‡∏¥‡∏î‡πÅ‡∏•‡πâ‡∏ß
// =======================================
function _sqlDonePredicate(alias = 'j') {
  // NOTE: ‡πÉ‡∏ä‡πâ ILIKE '%‡πÄ‡∏™‡∏£‡πá‡∏à%' ‡πÄ‡∏û‡∏∑‡πà‡∏≠‡∏Ñ‡∏£‡∏≠‡∏ö‡∏Ñ‡∏•‡∏∏‡∏° "‡πÄ‡∏™‡∏£‡πá‡∏à‡∏™‡∏¥‡πâ‡∏ô" "‡πÄ‡∏™‡∏£‡πá‡∏à‡πÅ‡∏•‡πâ‡∏ß" ‡πÅ‡∏•‡∏∞‡∏Ñ‡∏≥‡∏ó‡∏µ‡πà‡∏°‡∏µ‡πÄ‡∏™‡∏£‡πá‡∏à‡∏≠‡∏¢‡∏π‡πà
  // ‡∏û‡∏£‡πâ‡∏≠‡∏° fallback ‡∏™‡∏≥‡∏´‡∏£‡∏±‡∏ö‡∏Ñ‡∏µ‡∏¢‡πå‡∏≠‡∏±‡∏á‡∏Å‡∏§‡∏©
  const a = String(alias || 'j');
  return `(COALESCE(${a}.job_status,'') ILIKE '%‡πÄ‡∏™‡∏£‡πá‡∏à%' OR COALESCE(${a}.job_status,'') IN ('‡∏õ‡∏¥‡∏î‡∏á‡∏≤‡∏ô','done','completed'))`;
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
// ‡∏™‡∏£‡πâ‡∏≤‡∏á "‡∏á‡∏ß‡∏î‡πÄ‡∏™‡∏°‡∏∑‡∏≠‡∏ô" ‡πÑ‡∏î‡πâ‡πÅ‡∏°‡πâ‡∏¢‡∏±‡∏á‡πÑ‡∏°‡πà‡∏Å‡∏î generate (‡πÉ‡∏´‡πâ‡∏ä‡πà‡∏≤‡∏á‡πÄ‡∏´‡πá‡∏ô‡πÑ‡∏î‡πâ‡πÄ‡∏•‡∏¢)
// ‡πÅ‡∏•‡∏∞‡πÉ‡∏ä‡πâ payout_lines ‡∏ñ‡πâ‡∏≤‡∏°‡∏µ‡πÄ‡∏û‡∏∑‡πà‡∏≠‡∏Ñ‡∏ß‡∏≤‡∏°‡πÄ‡∏£‡πá‡∏ß (fallback ‡∏Ñ‡∏≥‡∏ô‡∏ß‡∏ì‡∏™‡∏î‡πÄ‡∏â‡∏û‡∏≤‡∏∞‡∏ä‡πà‡∏ß‡∏á‡∏ô‡∏±‡πâ‡∏ô)
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
  // countPairs = ‡∏à‡∏≥‡∏ô‡∏ß‡∏ô "‡πÄ‡∏î‡∏∑‡∏≠‡∏ô" ‡∏¢‡πâ‡∏≠‡∏ô‡∏´‡∏•‡∏±‡∏á‡∏ó‡∏µ‡πà‡πÄ‡∏≠‡∏≤‡∏°‡∏≤ (‡πÅ‡∏ï‡πà‡∏•‡∏∞‡πÄ‡∏î‡∏∑‡∏≠‡∏ô‡∏°‡∏µ 2 ‡∏á‡∏ß‡∏î)
  const n = nowBkk || _bkkNow();
  const { y, m } = _bkkYmd(n);

  const out = [];
  for (let i = 0; i < countPairs; i++) {
    let yy = y;
    let mm = m - i;
    while (mm <= 0) { mm += 12; yy -= 1; }
    // ‡πÄ‡∏î‡∏∑‡∏≠‡∏ô‡∏ô‡∏µ‡πâ: ‡∏á‡∏ß‡∏î 25 (1-15) ‡πÅ‡∏•‡∏∞‡∏á‡∏ß‡∏î 10 (16 ‡πÄ‡∏î‡∏∑‡∏≠‡∏ô‡∏Å‡πà‡∏≠‡∏ô - 1 ‡πÄ‡∏î‡∏∑‡∏≠‡∏ô‡∏ô‡∏µ‡πâ)
    const b25 = _periodBoundsForYm('25', yy, mm);
    const b10 = _periodBoundsForYm('10', yy, mm);
    out.push({ ...b25, payout_id: `payout_${b25.label_ym}_25` });
    out.push({ ...b10, payout_id: `payout_${b10.label_ym}_10` });
  }

  // sort ‡∏•‡πà‡∏≤‡∏™‡∏∏‡∏î‡∏Å‡πà‡∏≠‡∏ô
  out.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
  return out;
}

// =======================================
// ‚úÖ Technician compensation helpers
// - commission: per job (‡πÄ‡∏î‡∏¥‡∏°)
// - daily: daily_wage_amount * workdays
// - salary: monthly_salary_amount/2 ‡∏ï‡πà‡∏≠ 1 ‡∏á‡∏ß‡∏î (10/25)
// =======================================
function _normCompMode(mode) {
  const m = String(mode || '').toLowerCase().trim();
  if (m === 'daily' || m === 'daily_wage' || m === 'day') return 'daily';
  if (m === 'salary' || m === 'monthly') return 'salary';
  return 'commission';
}

async function _getTechProfile(username, db = pool) {
  if (!username) return null;
  try {
    const q = await db.query(
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
  // ‡∏™‡∏£‡πâ‡∏≤‡∏á‡∏ö‡∏£‡∏£‡∏ó‡∏±‡∏î‡πÉ‡∏´‡πâ‡∏ä‡πà‡∏≤‡∏á‡∏ó‡∏µ‡πà‡πÄ‡∏õ‡πá‡∏ô daily/salary (‡∏ú‡∏π‡πâ‡∏ä‡πà‡∏ß‡∏¢) ‡πÅ‡∏•‡∏∞‡πÑ‡∏°‡πà‡∏Ñ‡∏¥‡∏î‡∏£‡∏≤‡∏¢‡πÑ‡∏î‡πâ‡∏ï‡πà‡∏≠ job
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
            label: `‡∏Ñ‡πà‡∏≤‡πÅ‡∏£‡∏á‡∏£‡∏≤‡∏¢‡∏ß‡∏±‡∏ô (${ymd})`,
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
      const lbl = `‡πÄ‡∏á‡∏¥‡∏ô‡πÄ‡∏î‡∏∑‡∏≠‡∏ô (${label_ym}) ${period_type === '25' ? '‡∏á‡∏ß‡∏î 25' : '‡∏á‡∏ß‡∏î 10'}`;
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
  // ‡∏Ñ‡∏≥‡∏ô‡∏ß‡∏ì‡∏™‡∏î‡πÄ‡∏â‡∏û‡∏≤‡∏∞‡∏ä‡πà‡∏ß‡∏á‡∏ô‡∏±‡πâ‡∏ô (‡∏Å‡∏±‡∏ô‡∏ä‡πâ‡∏≤)
  // - commission: ‡∏î‡∏∂‡∏á‡πÄ‡∏â‡∏û‡∏≤‡∏∞‡∏á‡∏≤‡∏ô‡∏ó‡∏µ‡πà tech ‡πÄ‡∏Å‡∏µ‡πà‡∏¢‡∏ß‡∏Ç‡πâ‡∏≠‡∏á ‡πÅ‡∏•‡πâ‡∏ß‡πÉ‡∏ä‡πâ _buildPayoutLinesForJob
  // - daily/salary (‡∏ú‡∏π‡πâ‡∏ä‡πà‡∏ß‡∏¢): ‡∏™‡∏£‡πâ‡∏≤‡∏á‡∏ö‡∏£‡∏£‡∏ó‡∏±‡∏î‡πÅ‡∏ö‡∏ö non-commission
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
              label: `‡∏Ñ‡πà‡∏≤‡πÅ‡∏£‡∏á‡∏£‡∏≤‡∏¢‡∏ß‡∏±‡∏ô (${ymd})`,
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
            label: `‡πÄ‡∏á‡∏¥‡∏ô‡πÄ‡∏î‡∏∑‡∏≠‡∏ô (${opts.label_ym}) ${String(opts.period_type) === '25' ? '‡∏á‡∏ß‡∏î 25' : '‡∏á‡∏ß‡∏î 10'}`,
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

  // Adjustment-only technicians must still appear in payout screens.
  // Example: a deduction/rework case is approved before the technician has gross income
  // in that period. Without this union the adjustment exists in DB but Admin cannot see
  // that it is really deducted from the technician account.
  const rowMap = new Map();
  for (const r of (baseRows || [])) {
    const tech = String(r.technician_username || '').trim();
    if (!tech) continue;
    rowMap.set(tech, {
      technician_username: tech,
      gross_amount: Number(r.gross_amount || 0),
      jobs_count: Number(r.jobs_count || 0),
    });
  }
  const adjTechsQ = await pool.query(
    `SELECT technician_username,
            COALESCE(SUM(adj_amount),0)::numeric AS adj_total
       FROM public.technician_payout_adjustments
      WHERE payout_id=$1
      GROUP BY technician_username`,
    [payout_id]
  );
  for (const r of (adjTechsQ.rows || [])) {
    const tech = String(r.technician_username || '').trim();
    if (!tech || rowMap.has(tech)) continue;
    rowMap.set(tech, { technician_username: tech, gross_amount: 0, jobs_count: 0, adjustment_only: true });
  }
  const payTechsQ = await pool.query(
    `SELECT technician_username
       FROM public.technician_payout_payments
      WHERE payout_id=$1`,
    [payout_id]
  );
  for (const r of (payTechsQ.rows || [])) {
    const tech = String(r.technician_username || '').trim();
    if (!tech || rowMap.has(tech)) continue;
    rowMap.set(tech, { technician_username: tech, gross_amount: 0, jobs_count: 0, payment_only: true });
  }
  const depTechsQ = await pool.query(
    `SELECT technician_username
       FROM public.technician_deposit_ledger
      WHERE payout_id=$1 AND transaction_type='collect'
      GROUP BY technician_username`,
    [payout_id]
  );
  for (const r of (depTechsQ.rows || [])) {
    const tech = String(r.technician_username || '').trim();
    if (!tech || rowMap.has(tech)) continue;
    rowMap.set(tech, { technician_username: tech, gross_amount: 0, jobs_count: 0, deposit_only: true });
  }
  baseRows = Array.from(rowMap.values());

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
    const deposit = await technicianDepositCollections.getProjectedDepositDeductionForPayout(pool, {
      payout_id,
      technician_username: tech,
      gross_amount,
      adj_total,
      period_status: status,
    });
    const deposit_deduction_amount = _money(deposit.deposit_deduction_amount || 0);
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
      adjustment_only: !!r.adjustment_only,
      payment_only: !!r.payment_only,
      deposit_only: !!r.deposit_only,
      source,
    });
  }
  out.sort((a,b)=> Number(b.net_amount||0)-Number(a.net_amount||0) || String(a.technician_username).localeCompare(String(b.technician_username)));
  return { period, source, techs: out };
}

function _normJobKey(s) {
  return technicianIncomeHelpers._normJobKey(s);
}
function _normAcKey(s) {
  return technicianIncomeHelpers._normAcKey(s);
}
function _normWashKey(s) {
  return technicianIncomeHelpers._normWashKey(s);
}

function _thaiLabelJob(k){
  if (k==='wash') return '‡∏•‡πâ‡∏≤‡∏á';
  if (k==='repair') return '‡∏ã‡πà‡∏≠‡∏°';
  if (k==='install') return '‡∏ï‡∏¥‡∏î‡∏ï‡∏±‡πâ‡∏á';
  return '';
}
function _thaiLabelAc(k){
  if (k==='wall') return '‡∏ú‡∏ô‡∏±‡∏á';
  if (k==='fourway') return '‡∏™‡∏µ‡πà‡∏ó‡∏¥‡∏®‡∏ó‡∏≤‡∏á';
  if (k==='hanging') return '‡πÅ‡∏Ç‡∏ß‡∏ô/‡∏ï‡∏±‡πâ‡∏á‡∏û‡∏∑‡πâ‡∏ô';
  if (k==='ceiling') return '‡πÄ‡∏õ‡∏•‡∏∑‡∏≠‡∏¢';
  return '';
}
function _thaiLabelWash(k){
  return technicianIncomeHelpers._thaiLabelWash(k);
}


// =======================================
// üí≤ CWF Contract Payroll Engine (2026)
// - Uses partner single-rate per unit based on total quantity of the same item group in a job.
// - Company technician rates remain backward-compatible; partner rates are NOT percentage/cumulative ladder.
// =======================================
const CWF_CONTRACT_PAYROLL_VERSION = 'cwf_partner_single_rate_2026_05_v1';
const CWF_TECHNICIAN_INCOME_RATE_SET_VERSION = 'partner_v4_2026_05';
const CWF_TECHNICIAN_INCOME_RATE_SET_NAME = 'CWF Partner Technician Income Rates v4';
const CWF_TECHNICIAN_INCOME_DEFAULT_ITEMS = Object.freeze([
  { ac_type_key:'wall', wash_type_key:'normal', btu_tier:'small', step_from:1, step_to:1, amount:400, sort_order:10 },
  { ac_type_key:'wall', wash_type_key:'normal', btu_tier:'small', step_from:2, step_to:3, amount:350, sort_order:11 },
  { ac_type_key:'wall', wash_type_key:'normal', btu_tier:'small', step_from:4, step_to:null, amount:320, sort_order:12 },
  { ac_type_key:'wall', wash_type_key:'normal', btu_tier:'large', step_from:1, step_to:1, amount:450, sort_order:13 },
  { ac_type_key:'wall', wash_type_key:'normal', btu_tier:'large', step_from:2, step_to:3, amount:400, sort_order:14 },
  { ac_type_key:'wall', wash_type_key:'normal', btu_tier:'large', step_from:4, step_to:null, amount:350, sort_order:15 },
  { ac_type_key:'wall', wash_type_key:'premium', btu_tier:'small', step_from:1, step_to:1, amount:650, sort_order:20 },
  { ac_type_key:'wall', wash_type_key:'premium', btu_tier:'small', step_from:2, step_to:3, amount:600, sort_order:21 },
  { ac_type_key:'wall', wash_type_key:'premium', btu_tier:'small', step_from:4, step_to:null, amount:550, sort_order:22 },
  { ac_type_key:'wall', wash_type_key:'premium', btu_tier:'large', step_from:1, step_to:1, amount:800, sort_order:23 },
  { ac_type_key:'wall', wash_type_key:'premium', btu_tier:'large', step_from:2, step_to:3, amount:750, sort_order:24 },
  { ac_type_key:'wall', wash_type_key:'premium', btu_tier:'large', step_from:4, step_to:null, amount:700, sort_order:25 },
  { ac_type_key:'wall', wash_type_key:'coil', btu_tier:'small', step_from:1, step_to:1, amount:900, sort_order:30 },
  { ac_type_key:'wall', wash_type_key:'coil', btu_tier:'small', step_from:2, step_to:3, amount:850, sort_order:31 },
  { ac_type_key:'wall', wash_type_key:'coil', btu_tier:'small', step_from:4, step_to:null, amount:800, sort_order:32 },
  { ac_type_key:'wall', wash_type_key:'coil', btu_tier:'large', step_from:1, step_to:1, amount:1100, sort_order:33 },
  { ac_type_key:'wall', wash_type_key:'coil', btu_tier:'large', step_from:2, step_to:3, amount:1050, sort_order:34 },
  { ac_type_key:'wall', wash_type_key:'coil', btu_tier:'large', step_from:4, step_to:null, amount:1000, sort_order:35 },
  { ac_type_key:'wall', wash_type_key:'overhaul', btu_tier:'small', step_from:1, step_to:1, amount:1200, sort_order:40 },
  { ac_type_key:'wall', wash_type_key:'overhaul', btu_tier:'small', step_from:2, step_to:3, amount:1100, sort_order:41 },
  { ac_type_key:'wall', wash_type_key:'overhaul', btu_tier:'small', step_from:4, step_to:null, amount:1000, sort_order:42 },
  { ac_type_key:'wall', wash_type_key:'overhaul', btu_tier:'large', step_from:1, step_to:1, amount:1450, sort_order:43 },
  { ac_type_key:'wall', wash_type_key:'overhaul', btu_tier:'large', step_from:2, step_to:3, amount:1350, sort_order:44 },
  { ac_type_key:'wall', wash_type_key:'overhaul', btu_tier:'large', step_from:4, step_to:null, amount:1250, sort_order:45 },
  { ac_type_key:'fourway', wash_type_key:'none', btu_tier:'all', step_from:1, step_to:null, amount:1100, sort_order:50 },
  { ac_type_key:'hanging', wash_type_key:'none', btu_tier:'all', step_from:1, step_to:null, amount:800, sort_order:60 },
  { ac_type_key:'ceiling', wash_type_key:'none', btu_tier:'all', step_from:1, step_to:null, amount:800, sort_order:70 },
]);
const CWF_CONTRACT_PAYROLL_RATES = Object.freeze({
  company: Object.freeze({
    normal:   Object.freeze({ small: [80, 70, 70, 60],    large: [100, 85, 85, 70] }),
    premium:  Object.freeze({ small: [130, 110, 110, 90],  large: [160, 140, 140, 120] }),
    coil:     Object.freeze({ small: [220, 190, 190, 160],  large: [280, 240, 240, 210] }),
    overhaul: Object.freeze({ small: [320, 280, 280, 240],  large: [400, 350, 350, 300] }),
  }),
  partner: Object.freeze({
    normal:   Object.freeze({ small: [400, 350, 350, 320],     large: [450, 400, 400, 350] }),
    premium:  Object.freeze({ small: [650, 600, 600, 550],     large: [800, 750, 750, 700] }),
    coil:     Object.freeze({ small: [900, 850, 850, 800],     large: [1100, 1050, 1050, 1000] }),
    overhaul: Object.freeze({ small: [1200, 1100, 1100, 1000], large: [1450, 1350, 1350, 1250] }),
    fixed:    Object.freeze({ fourway: 1100, hanging: 800, ceiling: 800 }),
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
  return technicianIncomeHelpers._contractBtuTierFromText(text);
}
function _contractRateAt(techType, washKey, btuTier, machineIndex){
  const t = techType === 'partner' ? 'partner' : 'company';
  const w = ['normal','premium','coil','overhaul'].includes(washKey) ? washKey : 'normal';
  const tier = btuTier === 'large' ? 'large' : 'small';
  const arr = CWF_CONTRACT_PAYROLL_RATES[t]?.[w]?.[tier] || [];
  const idx = Math.max(1, Number(machineIndex || 1));
  return Number(arr[idx >= 4 ? 3 : idx - 1] || 0);
}
function _validTechRateItemShape(it){
  const ac = String(it?.ac_type_key || '').trim();
  const wash = String(it?.wash_type_key || '').trim();
  const tier = String(it?.btu_tier || '').trim();
  const from = Number(it?.step_from || 0);
  const toRaw = it?.step_to;
  const to = toRaw == null || toRaw === '' ? null : Number(toRaw);
  const amount = Number(it?.amount);
  if (!['wall','fourway','hanging','ceiling'].includes(ac)) return false;
  if (!['normal','premium','coil','overhaul','none'].includes(wash)) return false;
  if (!['small','large','all'].includes(tier)) return false;
  if (!Number.isInteger(from) || from < 1) return false;
  if (to != null && (!Number.isInteger(to) || to < from)) return false;
  if (!Number.isFinite(amount) || amount < 0) return false;
  if (ac === 'wall') return wash !== 'none' && tier !== 'all';
  return wash === 'none' && tier === 'all' && from === 1 && to == null;
}
function _partnerRateItemsMatchContract(items = []) {
  const rows = Array.isArray(items) ? items : [];
  for (const it of rows) {
    if (!_validTechRateItemShape(it)) return false;
  }
  for (const expected of CWF_TECHNICIAN_INCOME_DEFAULT_ITEMS) {
    const hit = rows.find((r) => {
      const toRaw = r.step_to;
      const to = toRaw == null || toRaw === '' ? null : Number(toRaw);
      const expectedTo = expected.step_to == null ? null : Number(expected.step_to);
      return String(r.ac_type_key) === expected.ac_type_key
        && String(r.wash_type_key) === expected.wash_type_key
        && String(r.btu_tier) === expected.btu_tier
        && Number(r.step_from) === Number(expected.step_from)
        && to === expectedTo
        && Number(r.amount) === Number(expected.amount);
    });
    if (!hit) return false;
  }
  return true;
}
function _rateSetRowsToContext(rateSet, items){
  return {
    rate_set_id: rateSet?.id || null,
    rate_set_version: rateSet?.version || null,
    rate_source: rateSet?.id ? 'database' : 'fallback',
    items: Array.isArray(items) ? items : [],
  };
}
async function _loadActiveTechnicianIncomeRateSet(contractType = 'partner'){
  try {
    const rs = await pool.query(
      `SELECT *
         FROM public.technician_income_rate_sets
        WHERE contract_type=$1
          AND status='active'
          AND (effective_from IS NULL OR effective_from <= NOW())
          AND (effective_to IS NULL OR effective_to >= NOW())
        ORDER BY activated_at DESC NULLS LAST, id DESC
        LIMIT 1`,
      [contractType]
    );
    const rateSet = rs.rows?.[0] || null;
    if (!rateSet) {
      console.warn('[tech_income_rates] missing active DB rate set, using fallback rates');
      return _rateSetRowsToContext(null, []);
    }
    const items = await pool.query(
      `SELECT id, rate_set_id, ac_type_key, wash_type_key, btu_tier,
              step_from, step_to, amount, unit, sort_order
         FROM public.technician_income_rate_items
        WHERE rate_set_id=$1
        ORDER BY sort_order ASC, id ASC`,
      [rateSet.id]
    );
    if (!items.rows?.length) {
      console.warn('[tech_income_rates] active DB rate set has no items, using fallback rates', rateSet.id);
      return _rateSetRowsToContext(null, []);
    }
    if (contractType === 'partner' && !_partnerRateItemsMatchContract(items.rows)) {
      console.warn('[tech_income_rates] active DB partner rate set differs from contract, using fallback rates', rateSet.id);
      return _rateSetRowsToContext(null, []);
    }
    return _rateSetRowsToContext(rateSet, items.rows);
  } catch (e) {
    console.warn('[tech_income_rates] load failed, using fallback rates:', e.message);
    return _rateSetRowsToContext(null, []);
  }
}
function _contractDbRateAt(rateContext, spec, machineIndex){
  if (!rateContext || rateContext.rate_source !== 'database') return null;
  const idx = Math.max(1, Number(machineIndex || 1));
  const rows = Array.isArray(rateContext.items) ? rateContext.items : [];
  const ac = spec.ac_key === 'wall' ? 'wall' : spec.ac_key;
  const wash = ac === 'wall' ? spec.wash_key : 'none';
  const tier = ac === 'wall' ? spec.btu_tier : 'all';
  const hit = rows.find(r => {
    const from = Number(r.step_from || 1);
    const to = r.step_to == null ? null : Number(r.step_to);
    return String(r.ac_type_key) === ac
      && String(r.wash_type_key) === wash
      && String(r.btu_tier) === tier
      && idx >= from
      && (to == null || idx <= to);
  });
  if (!hit) return null;
  const amount = Number(hit.amount || 0);
  return Number.isFinite(amount) ? amount : null;
}
function _contractRateAtFromContext(rateContext, techType, spec, machineIndex){
  const ac = spec?.ac_key || 'wall';
  const dbRate = techType === 'partner' ? _contractDbRateAt(rateContext, spec, machineIndex) : null;
  if (dbRate != null) return { rate: dbRate, rate_source: 'database' };
  if (techType === 'partner' && ac !== 'wall') {
    const fallback = Number(CWF_CONTRACT_PAYROLL_RATES.partner.fixed?.[ac] || 0);
    return { rate: fallback, rate_source: 'fallback' };
  }
  return {
    rate: _contractRateAt(techType, spec?.wash_key, spec?.btu_tier, machineIndex),
    rate_source: techType === 'partner' ? 'fallback' : 'contract',
  };
}
function _buildPartnerAgreementV4RateHtml(items = CWF_TECHNICIAN_INCOME_DEFAULT_ITEMS){
  const rows = Array.isArray(items) && items.length ? items : CWF_TECHNICIAN_INCOME_DEFAULT_ITEMS;
  const amountOf = (ac, wash, tier, from) => {
    const r = rows.find(x => x.ac_type_key === ac && x.wash_type_key === wash && x.btu_tier === tier && Number(x.step_from) === from);
    return Number(r?.amount || 0).toLocaleString('th-TH');
  };
  const wall = [
    ['‡∏•‡πâ‡∏≤‡∏á‡∏õ‡∏Å‡∏ï‡∏¥', 'normal', 'small', '‡πÑ‡∏°‡πà‡πÄ‡∏Å‡∏¥‡∏ô 12,000 BTU'],
    ['‡∏•‡πâ‡∏≤‡∏á‡∏õ‡∏Å‡∏ï‡∏¥', 'normal', 'large', '18,000 BTU ‡∏Ç‡∏∂‡πâ‡∏ô‡πÑ‡∏õ'],
    ['‡∏•‡πâ‡∏≤‡∏á‡∏û‡∏£‡∏µ‡πÄ‡∏°‡∏µ‡∏¢‡∏°', 'premium', 'small', '‡πÑ‡∏°‡πà‡πÄ‡∏Å‡∏¥‡∏ô 12,000 BTU'],
    ['‡∏•‡πâ‡∏≤‡∏á‡∏û‡∏£‡∏µ‡πÄ‡∏°‡∏µ‡∏¢‡∏°', 'premium', 'large', '18,000 BTU ‡∏Ç‡∏∂‡πâ‡∏ô‡πÑ‡∏õ'],
    ['‡∏•‡πâ‡∏≤‡∏á‡πÅ‡∏ö‡∏ö‡πÅ‡∏Ç‡∏ß‡∏ô‡∏Ñ‡∏≠‡∏¢‡∏•‡πå', 'coil', 'small', '‡πÑ‡∏°‡πà‡πÄ‡∏Å‡∏¥‡∏ô 12,000 BTU'],
    ['‡∏•‡πâ‡∏≤‡∏á‡πÅ‡∏ö‡∏ö‡πÅ‡∏Ç‡∏ß‡∏ô‡∏Ñ‡∏≠‡∏¢‡∏•‡πå', 'coil', 'large', '18,000 BTU ‡∏Ç‡∏∂‡πâ‡∏ô‡πÑ‡∏õ'],
    ['‡∏ï‡∏±‡∏î‡∏•‡πâ‡∏≤‡∏á‡πÉ‡∏´‡∏ç‡πà', 'overhaul', 'small', '‡πÑ‡∏°‡πà‡πÄ‡∏Å‡∏¥‡∏ô 12,000 BTU'],
    ['‡∏ï‡∏±‡∏î‡∏•‡πâ‡∏≤‡∏á‡πÉ‡∏´‡∏ç‡πà', 'overhaul', 'large', '18,000 BTU ‡∏Ç‡∏∂‡πâ‡∏ô‡πÑ‡∏õ'],
  ].map(([label,wash,tier,btu]) => `<tr><td>${label}</td><td>${btu}</td><td>${amountOf('wall',wash,tier,1)}</td><td>${amountOf('wall',wash,tier,2)}</td><td>${amountOf('wall',wash,tier,4)}</td></tr>`).join('');
  const fixed = [
    ['‡πÅ‡∏≠‡∏£‡πå‡∏™‡∏µ‡πà‡∏ó‡∏¥‡∏®‡∏ó‡∏≤‡∏á', 'fourway'],
    ['‡πÅ‡∏≠‡∏£‡πå‡πÅ‡∏Ç‡∏ß‡∏ô/‡∏ï‡∏±‡πâ‡∏á‡∏û‡∏∑‡πâ‡∏ô', 'hanging'],
    ['‡πÅ‡∏≠‡∏£‡πå‡πÄ‡∏õ‡∏•‡∏∑‡∏≠‡∏¢/‡πÉ‡∏ï‡πâ‡∏ù‡πâ‡∏≤', 'ceiling'],
  ].map(([label, ac]) => {
    const r = rows.find(x => x.ac_type_key === ac);
    return `<tr><td>${label}</td><td>‡∏ó‡∏∏‡∏Å BTU</td><td>${Number(r?.amount || 0).toLocaleString('th-TH')}</td></tr>`;
  }).join('');
  return `
    <section class="cwf-contract">
      <h2>CWF ‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡∏ä‡πà‡∏≤‡∏á‡πÅ‡∏≠‡∏£‡πå ‡∏â‡∏ö‡∏±‡∏ö‡πÉ‡∏ä‡πâ‡∏á‡∏≤‡∏ô‡∏à‡∏£‡∏¥‡∏á v4 ‡πÄ‡∏£‡∏ó‡πÉ‡∏´‡∏°‡πà</h2>
      <p><b>‡∏´‡∏°‡∏≤‡∏¢‡πÄ‡∏´‡∏ï‡∏∏:</b> ‡∏£‡∏∞‡∏ö‡∏ö‡∏Ñ‡∏¥‡∏î‡∏£‡∏≤‡∏¢‡πÑ‡∏î‡πâ‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡πÅ‡∏ö‡∏ö‡πÄ‡∏£‡∏ó‡πÄ‡∏î‡∏µ‡∏¢‡∏ß‡∏ï‡∏≤‡∏°‡∏à‡∏≥‡∏ô‡∏ß‡∏ô‡∏£‡∏ß‡∏°‡∏Ç‡∏≠‡∏á‡∏£‡∏≤‡∏¢‡∏Å‡∏≤‡∏£‡∏õ‡∏£‡∏∞‡πÄ‡∏†‡∏ó‡πÄ‡∏î‡∏µ‡∏¢‡∏ß‡∏Å‡∏±‡∏ô‡πÉ‡∏ô‡πÉ‡∏ö‡∏á‡∏≤‡∏ô ‡πÑ‡∏°‡πà‡πÉ‡∏ä‡πà‡πÄ‡∏õ‡∏≠‡∏£‡πå‡πÄ‡∏ã‡πá‡∏ô‡∏ï‡πå‡πÅ‡∏•‡∏∞‡πÑ‡∏°‡πà‡πÉ‡∏ä‡πà‡∏Ç‡∏±‡πâ‡∏ô‡∏ö‡∏±‡∏ô‡πÑ‡∏î‡∏™‡∏∞‡∏™‡∏°</p>
      <h3>‡πÄ‡∏£‡∏ó‡∏£‡∏≤‡∏¢‡πÑ‡∏î‡πâ‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå - ‡πÅ‡∏≠‡∏£‡πå‡∏ú‡∏ô‡∏±‡∏á</h3>
      <div style="overflow:auto">
        <table style="width:100%;border-collapse:collapse;min-width:680px">
          <thead><tr><th>‡∏õ‡∏£‡∏∞‡πÄ‡∏†‡∏ó‡∏Å‡∏≤‡∏£‡∏•‡πâ‡∏≤‡∏á</th><th>BTU</th><th>‡∏à‡∏≥‡∏ô‡∏ß‡∏ô‡∏£‡∏ß‡∏° 1 ‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á</th><th>‡∏à‡∏≥‡∏ô‡∏ß‡∏ô‡∏£‡∏ß‡∏° 2-3 ‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á</th><th>‡∏à‡∏≥‡∏ô‡∏ß‡∏ô‡∏£‡∏ß‡∏° 4 ‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡∏Ç‡∏∂‡πâ‡∏ô‡πÑ‡∏õ</th></tr></thead>
          <tbody>${wall}</tbody>
        </table>
      </div>
      <h3>‡πÄ‡∏£‡∏ó‡∏£‡∏≤‡∏¢‡πÑ‡∏î‡πâ‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå - ‡πÅ‡∏≠‡∏£‡πå‡∏õ‡∏£‡∏∞‡πÄ‡∏†‡∏ó‡∏≠‡∏∑‡πà‡∏ô</h3>
      <div style="overflow:auto">
        <table style="width:100%;border-collapse:collapse;min-width:420px">
          <thead><tr><th>‡∏õ‡∏£‡∏∞‡πÄ‡∏†‡∏ó‡πÅ‡∏≠‡∏£‡πå</th><th>BTU</th><th>‡πÄ‡∏£‡∏ó‡∏ï‡πà‡∏≠‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á</th></tr></thead>
          <tbody>${fixed}</tbody>
        </table>
      </div>
      <style>
        .cwf-contract table th,.cwf-contract table td{border:1px solid #d7deea;padding:8px;text-align:left}
        .cwf-contract table th{background:#eef4ff;color:#0b2e6d}
        .cwf-contract h2,.cwf-contract h3{color:#0b2e6d}
      </style>
    </section>`;
}
function _contractServiceKeyFromItem(it){
  return technicianIncomeHelpers._contractServiceKeyFromItem(it);
}

function _contractIsVagueServiceItem(it){
  const name = String(it?.item_name || '').trim();
  if (!name) return true;
  const n = name.toLowerCase();
  const hasSpecific = /(‡∏•‡πâ‡∏≤‡∏á‡∏ò‡∏£‡∏£‡∏°‡∏î‡∏≤|‡∏•‡πâ‡∏≤‡∏á‡∏õ‡∏Å‡∏ï‡∏¥|‡∏û‡∏£‡∏µ‡πÄ‡∏°‡∏µ‡∏¢‡∏°|premium|‡πÅ‡∏Ç‡∏ß‡∏ô‡∏Ñ‡∏≠‡∏¢|‡πÅ‡∏Ç‡∏ß‡∏ô‡∏Ñ‡∏≠‡∏¢‡∏ô‡πå|‡πÅ‡∏Ç‡∏ß‡∏ô‡∏Ñ‡∏≠‡∏¢‡∏•‡πå|‡∏ï‡∏±‡∏î‡∏•‡πâ‡∏≤‡∏á|‡∏•‡πâ‡∏≤‡∏á‡πÉ‡∏´‡∏ç‡πà|overhaul|BTU|‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á|‡∏™‡∏µ‡πà‡∏ó‡∏¥‡∏®|‡πÄ‡∏õ‡∏•‡∏∑‡∏≠‡∏¢|‡∏ú‡∏ô‡∏±‡∏á)/i.test(name);
  if (hasSpecific) return false;
  return /(‡∏Ñ‡πà‡∏≤‡∏ö‡∏£‡∏¥‡∏Å‡∏≤‡∏£|‡∏°‡∏≤‡∏ï‡∏£‡∏ê‡∏≤‡∏ô|override|‡∏£‡∏≤‡∏Ñ‡∏≤‡πÄ‡∏´‡∏°‡∏≤|‡πÄ‡∏´‡∏°‡∏≤‡∏£‡∏ß‡∏°|service)/i.test(n);
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
  // If old job_items are vague (‡∏Ñ‡πà‡∏≤‡∏ö‡∏£‡∏¥‡∏Å‡∏≤‡∏£/‡∏£‡∏≤‡∏Ñ‡∏≤‡πÄ‡∏´‡∏°‡∏≤/override), the engine will infer
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
  // For admin urgent/forced jobs, payload can be only job_type="‡∏•‡πâ‡∏≤‡∏á" without a detailed wash variant.
  // Use a safe default (wall normal) so technician income never becomes 0 just because the job name is generic.
  const wash_key = _normWashKey(text) || (jobKey === 'wash' ? 'normal' : null);
  if (!wash_key) return null;
  const btu = Number(meta?.btu || 0) || (_contractBtuTierFromText(text).btu || 12000);
  const btu_tier = btu >= 18000 ? 'large' : 'small';
  const qty = Math.max(1, Math.round(Number(meta?.machine_count || 1)));
  return {
    job_item_id: null,
    item_name: `‡∏•‡πâ‡∏≤‡∏á‡πÅ‡∏≠‡∏£‡πå‡∏ú‡∏ô‡∏±‡∏á ‚Ä¢ ${_thaiLabelWash(wash_key)} ‚Ä¢ ${btu_tier === 'large' ? 18000 : 12000} BTU ‚Ä¢ ${qty} ‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á`,
    qty,
    unit_price: 0,
    line_total: 0,
    assigned_technician_username: '',
    is_service: true,
    _contract_inferred_from_job_meta: true,
  };
}

async function _classifyRevisitWarrantyReworkJob(meta) {
  const jobId = Number(meta?.job_id || 0);
  const status = String(meta?.job_status || '').trim();
  const jobType = String(meta?.job_type || '').trim();
  const returnReason = String(meta?.return_reason || '').trim();
  const lower = [status, jobType, returnReason].join(' ').toLowerCase();
  const reasons = [];
  if (status === '‡∏á‡∏≤‡∏ô‡πÅ‡∏Å‡πâ‡πÑ‡∏Ç' || status.includes('‡πÅ‡∏Å‡πâ‡πÑ‡∏Ç')) reasons.push('job_status');
  if (jobType.includes('‡∏á‡∏≤‡∏ô‡πÅ‡∏Å‡πâ‡πÑ‡∏Ç') || jobType.includes('‡∏á‡∏≤‡∏ô‡∏Å‡∏•‡∏±‡∏ö‡πÑ‡∏õ‡πÅ‡∏Å‡πâ') || jobType.includes('‡∏á‡∏≤‡∏ô‡πÉ‡∏ô‡∏õ‡∏£‡∏∞‡∏Å‡∏±‡∏ô') || jobType.includes('‡πÄ‡∏Ñ‡∏•‡∏°')) reasons.push('job_type');
  if (returnReason) reasons.push('return_reason');
  if (meta?.returned_at) reasons.push('returned_at');
  if (meta?.returned_by) reasons.push('returned_by');
  if (lower.includes('revisit') || lower.includes('rework') || lower.includes('warranty') || lower.includes('claim')) reasons.push('text_marker');
  try {
    if (jobId > 0) {
      const q = await pool.query(
        `SELECT rework_case_id, reason_type, status, resolution
           FROM public.technician_rework_cases
          WHERE job_id=$1
          ORDER BY created_at DESC NULLS LAST, rework_case_id DESC
          LIMIT 1`,
        [jobId]
      );
      if (q.rows?.[0]) reasons.push('technician_rework_cases');
    }
  } catch (_) {}
  return {
    is_excluded: reasons.length > 0,
    exclusion_reason: reasons.length ? 'revisit/warranty/rework job excluded from normal income' : '',
    detection_fields: [...new Set(reasons)],
  };
}

async function _loadApprovedReworkCompensationLines(job_id, team, meta, exclusion) {
  const jid = Number(job_id);
  const usernames = [...new Set((Array.isArray(team) ? team : []).map(x => String(x || '').trim()).filter(Boolean))];
  if (!Number.isInteger(jid) || jid <= 0 || !usernames.length) return [];
  try {
    const q = await pool.query(
      `SELECT technician_username, COALESCE(SUM(adj_amount),0)::numeric AS amount
         FROM public.technician_payout_adjustments
        WHERE job_id::text=$1::text
          AND technician_username = ANY($2::text[])
          AND adj_amount > 0
          AND reason NOT LIKE '[REWORK_RELEASE]%'
        GROUP BY technician_username`,
      [String(jid), usernames]
    );
    return (q.rows || []).map((r) => {
      const amount = _money(r.amount || 0);
      return {
        technician_username: String(r.technician_username || '').trim(),
        job_id: String(jid),
        finished_at: meta.finished_at || meta.closed_at || meta.completed_at || null,
        earn_amount: amount,
        base_amount: amount,
        percent_final: null,
        machine_count_for_tech: 0,
        step_rule_key: 'approved_rework_compensation',
        detail_json: {
          payroll_version: CWF_CONTRACT_PAYROLL_VERSION,
          contract_only: true,
          excluded_from_normal_income: true,
          exclusion_reason: exclusion.exclusion_reason,
          exclusion_fields: exclusion.detection_fields,
          approved_rework_compensation: true,
          source: 'technician_payout_adjustments',
          total_income: amount,
          contract_rate_rows: [],
          related_items: [],
          items: [],
        },
        setting_snapshot: { approved_rework_compensation: true, computed_at: new Date().toISOString() },
      };
    }).filter(x => x.technician_username && Number(x.earn_amount || 0) > 0);
  } catch (e) {
    try { console.warn('[tech_income] approved rework compensation lookup failed', { job_id: jid, error: e.message }); } catch {}
    return [];
  }
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
function _contractMachineRates(spec, startIndex, qty, techType, rateContext){
  const out = [];
  const n = Math.max(0, Math.round(Number(qty || 0)));
  for (let i = 0; i < n; i++) {
    const machine_index = Number(startIndex || 1) + i;
    const picked = _contractRateAtFromContext(rateContext, techType, spec, machine_index);
    out.push({ machine_index, rate: picked.rate, rate_source: picked.rate_source });
  }
  return out;
}

function _contractSingleRateBracketIndex(groupQty){
  return technicianIncomeHelpers._contractSingleRateBracketIndex(groupQty);
}
function _contractSingleRateForGroup(spec, groupQty, techType, rateContext){
  // New partner contract: one rate per unit for the whole same-service group in the job.
  // Example: wall normal small qty 5 => every unit uses the 4+ rate (320), not 400+350+350+320+320.
  const bracketIndex = _contractSingleRateBracketIndex(groupQty);
  const picked = _contractRateAtFromContext(rateContext, techType, spec, bracketIndex);
  return { rate: Number(picked.rate || 0), rate_source: picked.rate_source, bracket_index: bracketIndex };
}
function _contractHeightExtraFromText(text){
  const raw = String(text || '').toLowerCase();
  if (!raw) return { amount:0, key:null, manual:false, label:'' };
  if (/(over_?10m|‡∏™‡∏π‡∏á‡πÄ‡∏Å‡∏¥‡∏ô\s*10|‡πÄ‡∏Å‡∏¥‡∏ô\s*10\s*‡πÄ‡∏°‡∏ï‡∏£|10\s*‡πÄ‡∏°‡∏ï‡∏£\s*‡∏Ç‡∏∂‡πâ‡∏ô‡πÑ‡∏õ)/i.test(raw)) {
    return { amount:0, key:'over_10m', manual:true, label:'‡∏™‡∏π‡∏á‡πÄ‡∏Å‡∏¥‡∏ô 10 ‡πÄ‡∏°‡∏ï‡∏£: ‡∏ï‡πâ‡∏≠‡∏á‡∏õ‡∏£‡∏∞‡πÄ‡∏°‡∏¥‡∏ô/‡∏≠‡∏ô‡∏∏‡∏°‡∏±‡∏ï‡∏¥‡πÄ‡∏≠‡∏á' };
  }
  if (/(over_?7m|7m|‡∏™‡∏π‡∏á‡πÄ‡∏Å‡∏¥‡∏ô\s*7|‡πÄ‡∏Å‡∏¥‡∏ô\s*7\s*‡πÄ‡∏°‡∏ï‡∏£|7\s*-\s*10\s*‡πÄ‡∏°‡∏ï‡∏£)/i.test(raw)) {
    return { amount:500, key:'over_7m_to_10m', manual:false, label:'‡∏Ñ‡πà‡∏≤‡πÄ‡∏™‡∏µ‡πà‡∏¢‡∏á‡∏†‡∏±‡∏¢‡∏™‡∏π‡∏á‡πÄ‡∏Å‡∏¥‡∏ô 7-10 ‡πÄ‡∏°‡∏ï‡∏£' };
  }
  if (/(over_?5m|5m|‡∏™‡∏π‡∏á‡πÄ‡∏Å‡∏¥‡∏ô\s*5|‡πÄ‡∏Å‡∏¥‡∏ô\s*5\s*‡πÄ‡∏°‡∏ï‡∏£|5\s*‡πÄ‡∏°‡∏ï‡∏£)/i.test(raw)) {
    return { amount:300, key:'over_5m', manual:false, label:'‡∏Ñ‡πà‡∏≤‡πÄ‡∏™‡∏µ‡πà‡∏¢‡∏á‡∏†‡∏±‡∏¢‡∏™‡∏π‡∏á‡πÄ‡∏Å‡∏¥‡∏ô 5 ‡πÄ‡∏°‡∏ï‡∏£' };
  }
  return { amount:0, key:null, manual:false, label:'' };
}
function _sumContractMachineRates(washKey, btuTier, startIndex, qty, techType){
  const spec = { ac_key:'wall', wash_key: washKey, btu_tier: btuTier };
  return _contractMachineRates(spec, startIndex, qty, techType, null).reduce((a,x)=>a+Number(x.rate||0),0);
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
  const rateContext = await _loadActiveTechnicianIncomeRateSet('partner');
  const { serviceItems: svcItems, ignoredLegacyItems } = _contractNormalizeServiceItems(meta, items);

  const team = await getTeamForJob(job_id);
  const assumedTech = String(opts?.assumeTechnician || '').trim();
  if (assumedTech && !team.includes(assumedTech)) team.push(assumedTech);
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

  const exclusion = await _classifyRevisitWarrantyReworkJob(meta);
  if (exclusion.is_excluded) {
    const approved = await _loadApprovedReworkCompensationLines(job_id, team, meta, exclusion);
    if (approved.length) return approved;
    return team.map((tech) => ({
      technician_username: tech,
      job_id: String(job_id),
      finished_at: meta.finished_at || meta.closed_at || meta.completed_at || null,
      earn_amount: 0,
      base_amount: 0,
      percent_final: null,
      machine_count_for_tech: 0,
      step_rule_key: 'excluded_revisit_warranty_rework',
      detail_json: {
        payroll_version: CWF_CONTRACT_PAYROLL_VERSION,
        contract_only: true,
        excluded_from_normal_income: true,
        exclusion_reason: exclusion.exclusion_reason,
        exclusion_fields: exclusion.detection_fields,
        job_type: String(meta.job_type || '').trim(),
        job_status: String(meta.job_status || '').trim(),
        return_reason: String(meta.return_reason || '').trim() || null,
        returned_at: meta.returned_at || null,
        returned_by: meta.returned_by || null,
        contract_rate_rows: [],
        related_items: [],
        items: [],
        total_income: 0,
      },
      setting_snapshot: { excluded_from_normal_income: true, computed_at: new Date().toISOString() },
    }));
  }

  const assignedSvc = svcItems.filter(it => String(it.assigned_technician_username || '').trim());
  const unassignedSvc = svcItems.filter(it => !String(it.assigned_technician_username || '').trim());
  const hasAssigned = assignedSvc.length > 0;
  const mode = (!hasAssigned && team.length > 1) ? 'coop_equal' : (hasAssigned && unassignedSvc.length ? 'mixed' : 'assigned');

  const relatedByTech = new Map(team.map(u => [u, []]));
  const contractRowsByTech = new Map(team.map(u => [u, []]));
  const extrasByTech = new Map(team.map(u => [u, []]));
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
  const addExtra = (tech, extra) => {
    if (!extra || (!Number(extra.amount || 0) && !extra.manual)) return;
    if (!extrasByTech.has(tech)) extrasByTech.set(tech, []);
    extrasByTech.get(tech).push(extra);
  };
  const techTypeOf = (tech) => {
    const prof = profileMap.get(String(tech)) || {};
    return _contractTechType(prof.employment_type, prof.compensation_mode);
  };

  // Count total quantity per same-service group for the whole job first.
  // This is the source of truth for partner single-rate selection.
  const groupQtyMap = new Map();
  const itemSpecMap = new Map();
  for (const it of svcItems) {
    const spec = _contractServiceKeyFromItem(it);
    itemSpecMap.set(it, spec);
    const qty = Math.max(0, Math.round(Number(it.qty || 0)));
    groupQtyMap.set(spec.group_key, Number(groupQtyMap.get(spec.group_key) || 0) + qty);
  }

  // Company technicians keep the existing per-machine contract engine. Partner technicians use the new single-rate engine.
  const companyCursor = new Map();
  const nextCompanyStartIndex = (tech, groupKey, qty) => {
    const key = `${tech}|${groupKey}`;
    const start = Number(companyCursor.get(key) || 0) + 1;
    companyCursor.set(key, Number(companyCursor.get(key) || 0) + Math.max(0, Math.round(Number(qty || 0))));
    return start;
  };

  function applyItemToTech(it, tech, qtyForTech, share, reason){
    const qty = Number(qtyForTech || 0);
    if (!qty || !tech) return;
    const spec = itemSpecMap.get(it) || _contractServiceKeyFromItem(it);
    const groupQty = Number(groupQtyMap.get(spec.group_key) || qty || 0);
    const techType = techTypeOf(tech);
    if (techType === 'special_only') return;

    if (techType === 'partner') {
      const picked = _contractSingleRateForGroup(spec, groupQty, techType, rateContext);
      const baseAmount = Number(picked.rate || 0) * qty;
      addAmount(tech, baseAmount);
      addMachine(tech, qty);
      addRelated(tech, {
        job_item_id: it.job_item_id,
        item_name: it.item_name,
        qty,
        original_qty: Number(it.qty || 0),
        group_qty: groupQty,
        line_total: Number(it.line_total || 0),
        assigned_technician_username: String(it.assigned_technician_username || '').trim() || null,
        contract_reason: reason,
      });
      addRateRows(tech, [{
        item_name: it.item_name,
        ac_type_key: spec.ac_key,
        wash_key: spec.wash_key,
        wash_label: _thaiLabelWash(spec.wash_key) || spec.wash_key,
        btu_tier: spec.btu_tier,
        btu: spec.btu || null,
        rate_set_id: rateContext.rate_set_id || null,
        rate_set_version: rateContext.rate_set_version || null,
        rate_source: picked.rate_source || rateContext.rate_source || 'fallback',
        tech_type: techType,
        contract_version: CWF_CONTRACT_PAYROLL_VERSION,
        rule_id: `${spec.group_key}|qty:${groupQty}|bracket:${picked.bracket_index}`,
        group_key: spec.group_key,
        group_qty: groupQty,
        bracket_index: picked.bracket_index,
        qty,
        rate_per_unit: Number(picked.rate || 0),
        rate: Number(picked.rate || 0),
        share: Number(share || 1),
        paid_rate: Number(picked.rate || 0),
        total: baseAmount,
        base_amount: baseAmount,
        reason,
        single_rate_contract: true,
      }]);

      const heightExtra = _contractHeightExtraFromText([it.item_name, meta.customer_note, meta.note, meta.admin_note].filter(Boolean).join(' '));
      if (heightExtra.key) {
        const amount = Number(heightExtra.amount || 0) * qty;
        if (amount) addAmount(tech, amount);
        addExtra(tech, {
          extra_type: 'height_risk',
          condition_key: heightExtra.key,
          label: heightExtra.label,
          qty,
          amount_per_unit: Number(heightExtra.amount || 0),
          amount,
          manual_approval_required: Boolean(heightExtra.manual),
          source_item_name: it.item_name || null,
        });
      }
      return;
    }

    // Backward-compatible company technician calculation.
    const wholeQty = Math.max(0, Math.round(Number(qty || 0)));
    if (!wholeQty) return;
    const startIdx = nextCompanyStartIndex(tech, spec.group_key, wholeQty);
    const rates = _contractMachineRates(spec, startIdx, wholeQty, techType, rateContext);
    const amount = rates.reduce((a, x) => a + Number(x.rate || 0), 0) * Number(share || 1);
    addAmount(tech, amount);
    addMachine(tech, qty);
    addRelated(tech, {
      job_item_id: it.job_item_id,
      item_name: it.item_name,
      qty,
      original_qty: Number(it.qty || 0),
      line_total: Number(it.line_total || 0),
      assigned_technician_username: String(it.assigned_technician_username || '').trim() || null,
      contract_reason: reason,
    });
    addRateRows(tech, rates.map(x => ({
      item_name: it.item_name,
      ac_type_key: spec.ac_key,
      wash_key: spec.wash_key,
      wash_label: _thaiLabelWash(spec.wash_key) || spec.wash_key,
      btu_tier: spec.btu_tier,
      btu: spec.btu || null,
      rate_set_id: null,
      rate_set_version: null,
      rate_source: 'contract',
      tech_type: techType,
      machine_index: x.machine_index,
      qty: Number(share || 1),
      rate: Number(x.rate || 0),
      rate_per_unit: Number(x.rate || 0),
      share: Number(share || 1),
      paid_rate: Number(x.rate || 0) * Number(share || 1),
      total: Number(x.rate || 0) * Number(share || 1),
      reason,
    })));
  }

  for (const it of assignedSvc) {
    const tech = String(it.assigned_technician_username || '').trim();
    if (!team.includes(tech)) team.push(tech);
    const qty = Math.max(0, Math.round(Number(it.qty || 0)));
    applyItemToTech(it, tech, qty, 1, 'assigned_item');
  }
  for (const it of unassignedSvc) {
    const qty = Math.max(0, Math.round(Number(it.qty || 0)));
    if (!qty) continue;
    if (team.length === 1) {
      applyItemToTech(it, team[0], qty, 1, 'single_or_unassigned_item');
    } else {
      const splitQty = qty / team.length;
      for (const tech of team) applyItemToTech(it, tech, splitQty, 1 / team.length, hasAssigned ? 'mixed_unassigned_shared' : 'coop_equal_shared');
    }
  }

  const totalMachine = svcItems.reduce((a, it) => a + Math.max(0, Number(it.qty || 0)), 0);
  const lines = [];
  for (const tech of team) {
    const prof = profileMap.get(String(tech)) || {};
    const cm = _normCompMode(prof.compensation_mode);
    if (cm !== 'commission') continue;

    const techType = techTypeOf(tech);
    if (techType === 'special_only') continue;

    const base_amount = Number(serviceAmountByTech.get(tech) || 0);
    const special_income = 0;
    const special_bonus = 0;
    const earn_amount = base_amount + special_income + special_bonus;
    const machine_count_for_tech = Number(machineCountByTech.get(tech) || 0);
    const rateRows = contractRowsByTech.get(tech) || [];
    const related_items = relatedByTech.get(tech) || [];
    const extras = extrasByTech.get(tech) || [];
    const extras_total = extras.reduce((a, x) => a + Number(x.amount || 0), 0);
    const detailRateSource = techType === 'partner'
      ? (rateRows.some(r => r.rate_source === 'fallback') ? 'fallback' : rateContext.rate_source)
      : 'contract';

    if (Math.abs(earn_amount) < 0.0001 && !rateRows.length) continue;

    const detail_json = {
      payroll_version: CWF_CONTRACT_PAYROLL_VERSION,
      contract_version: techType === 'partner' ? 'partner_single_rate_2026_05' : CWF_CONTRACT_PAYROLL_VERSION,
      partner_single_rate_contract: techType === 'partner',
      contract_only: true,
      job_type: _thaiLabelJob(_normJobKey(meta.job_type)) || String(meta.job_type || '').trim(),
      job_type_key: _normJobKey(meta.job_type),
      ac_type: '',
      ac_type_key: rateRows.length ? Array.from(new Set(rateRows.map(r => r.ac_type_key).filter(Boolean))).join('+') : null,
      wash_variant: rateRows.length ? Array.from(new Set(rateRows.map(r => r.wash_label).filter(Boolean))).join(' + ') : '',
      wash_variant_key: rateRows.length ? Array.from(new Set(rateRows.map(r => r.wash_key).filter(Boolean))).join('+') : null,
      btu_tier: rateRows.length ? Array.from(new Set(rateRows.map(r => r.btu_tier).filter(Boolean))).join('+') : null,
      rate_set_id: techType === 'partner' ? rateContext.rate_set_id : null,
      rate_set_version: techType === 'partner' ? rateContext.rate_set_version : null,
      machine_count_total: totalMachine,
      machine_count_for_tech,
      mode,
      split_mode: mode,
      technician_type: techType,
      how_machine_count_for_tech: mode === 'assigned'
        ? '‡∏Ñ‡∏¥‡∏î‡πÄ‡∏â‡∏û‡∏≤‡∏∞‡∏£‡∏≤‡∏¢‡∏Å‡∏≤‡∏£‡∏ó‡∏µ‡πà assign ‡πÉ‡∏´‡πâ‡∏ä‡πà‡∏≤‡∏á ‡∏´‡∏£‡∏∑‡∏≠‡∏£‡∏≤‡∏¢‡∏Å‡∏≤‡∏£‡∏ó‡∏µ‡πà‡πÑ‡∏°‡πà‡∏°‡∏µ assign ‡πÉ‡∏ô‡∏á‡∏≤‡∏ô‡∏ä‡πà‡∏≤‡∏á‡πÄ‡∏î‡∏µ‡πà‡∏¢‡∏ß'
        : '‡∏£‡∏≤‡∏¢‡∏Å‡∏≤‡∏£‡∏ó‡∏µ‡πà‡πÑ‡∏°‡πà assign ‡πÉ‡∏ô‡∏á‡∏≤‡∏ô‡∏ó‡∏µ‡∏°‡∏ñ‡∏π‡∏Å‡∏´‡∏≤‡∏£‡πÄ‡∏ó‡πà‡∏≤‡∏Å‡∏±‡∏ô‡∏ï‡∏≤‡∏°‡∏à‡∏≥‡∏ô‡∏ß‡∏ô‡∏ä‡πà‡∏≤‡∏á‡πÉ‡∏ô‡∏ó‡∏µ‡∏°',
      how_percent_selected: techType === 'partner'
        ? '‡πÑ‡∏°‡πà‡πÉ‡∏ä‡πâ‡πÄ‡∏õ‡∏≠‡∏£‡πå‡πÄ‡∏ã‡πá‡∏ô‡∏ï‡πå‡πÅ‡∏•‡∏∞‡πÑ‡∏°‡πà‡πÉ‡∏ä‡πâ‡∏Ç‡∏±‡πâ‡∏ô‡∏ö‡∏±‡∏ô‡πÑ‡∏î‡∏™‡∏∞‡∏™‡∏°: ‡πÉ‡∏ä‡πâ‡πÄ‡∏£‡∏ó‡πÄ‡∏î‡∏µ‡∏¢‡∏ß‡∏ï‡πà‡∏≠‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡∏ï‡∏≤‡∏°‡∏à‡∏≥‡∏ô‡∏ß‡∏ô‡∏£‡∏ß‡∏°‡∏Ç‡∏≠‡∏á‡∏£‡∏≤‡∏¢‡∏Å‡∏≤‡∏£‡∏õ‡∏£‡∏∞‡πÄ‡∏†‡∏ó‡πÄ‡∏î‡∏µ‡∏¢‡∏ß‡∏Å‡∏±‡∏ô‡πÉ‡∏ô‡πÉ‡∏ö‡∏á‡∏≤‡∏ô'
        : '‡∏ä‡πà‡∏≤‡∏á‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡πÉ‡∏ä‡πâ‡πÄ‡∏£‡∏ó‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡πÄ‡∏î‡∏¥‡∏°‡πÅ‡∏ö‡∏ö backward-compatible',
      how_split_applied: mode === 'mixed'
        ? '‡∏£‡∏≤‡∏¢‡∏Å‡∏≤‡∏£‡∏ó‡∏µ‡πà assign ‡∏Ñ‡∏¥‡∏î‡πÄ‡∏ï‡πá‡∏°‡πÉ‡∏´‡πâ‡πÄ‡∏à‡πâ‡∏≤‡∏Ç‡∏≠‡∏á‡∏£‡∏≤‡∏¢‡∏Å‡∏≤‡∏£ + ‡∏£‡∏≤‡∏¢‡∏Å‡∏≤‡∏£‡πÑ‡∏°‡πà assign ‡∏´‡∏≤‡∏£‡πÄ‡∏ó‡πà‡∏≤‡∏Å‡∏±‡∏ô'
        : (mode === 'coop_equal' ? '‡πÑ‡∏°‡πà‡∏°‡∏µ assign ‡∏£‡∏≤‡∏¢‡∏Å‡∏≤‡∏£: ‡∏´‡∏≤‡∏£‡πÄ‡∏£‡∏ó‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡πÄ‡∏ó‡πà‡∏≤‡∏Å‡∏±‡∏ô‡∏ï‡∏≤‡∏°‡∏ó‡∏µ‡∏°' : '‡∏Ñ‡∏¥‡∏î‡∏ï‡∏≤‡∏°‡∏£‡∏≤‡∏¢‡∏Å‡∏≤‡∏£‡∏ó‡∏µ‡πà‡∏ä‡πà‡∏≤‡∏á‡∏£‡∏±‡∏ö‡∏ú‡∏¥‡∏î‡∏ä‡∏≠‡∏ö'),
      group_quantity_rule: '‡πÄ‡∏•‡∏∑‡∏≠‡∏Å‡πÄ‡∏£‡∏ó‡∏à‡∏≤‡∏Å‡∏à‡∏≥‡∏ô‡∏ß‡∏ô‡∏£‡∏ß‡∏°‡∏Ç‡∏≠‡∏á ac_type + wash_variant + btu_bucket ‡πÉ‡∏ô‡πÉ‡∏ö‡∏á‡∏≤‡∏ô‡πÄ‡∏î‡∏µ‡∏¢‡∏ß‡∏Å‡∏±‡∏ô ‡πÅ‡∏•‡πâ‡∏ß‡πÉ‡∏ä‡πâ‡πÄ‡∏£‡∏ó‡∏ô‡∏±‡πâ‡∏ô‡∏Å‡∏±‡∏ö‡∏ó‡∏∏‡∏Å‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡πÉ‡∏ô‡∏Å‡∏•‡∏∏‡πà‡∏°',
      contract_rate_rows: rateRows,
      extras,
      extras_total,
      related_items,
      ignored_legacy_items: ignoredLegacyItems || [],
      ignored_legacy_fields: ['line_total','unit_price','total_price','paid_amount','final_price','special_bonus_amount','percentage','company_cut_percent','commission_percent'],
      rate_source: detailRateSource,
      audit_note: rateRows.length ? '‡∏Ñ‡∏≥‡∏ô‡∏ß‡∏ì‡∏à‡∏≤‡∏Å‡πÄ‡∏£‡∏ó‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡πÄ‡∏ó‡πà‡∏≤‡∏ô‡∏±‡πâ‡∏ô' : '‡∏ï‡πâ‡∏≠‡∏á‡∏ï‡∏£‡∏ß‡∏à‡∏™‡∏≠‡∏ö: ‡πÑ‡∏°‡πà‡∏û‡∏ö service line ‡∏ó‡∏µ‡πà infer ‡πÑ‡∏î‡πâ‡∏à‡∏≤‡∏Å‡∏Ç‡πâ‡∏≠‡∏°‡∏π‡∏•‡πÉ‡∏ö‡∏á‡∏≤‡∏ô‡πÇ‡∏î‡∏¢‡πÑ‡∏°‡πà‡πÉ‡∏ä‡πâ‡∏£‡∏≤‡∏Ñ‡∏≤‡∏Ç‡∏≤‡∏¢‡∏•‡∏π‡∏Å‡∏Ñ‡πâ‡∏≤',
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
      contract_version: detail_json.contract_version,
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
      step_rule_key: `contract:${techType}${techType === 'partner' ? ':single_rate' : ''}`,
      detail_json,
      setting_snapshot,
    });
  }

  return lines;
}

async function computePartnerSingleRatePayout(job_id, opts = {}) {
  // Explicit helper for the new partner agreement. It reuses the production payout line engine
  // so Super Admin preview, technician income, and payout generation share one source of truth.
  const lines = await _buildPayoutLinesForJob(job_id, opts);
  return (lines || []).filter(ln => String(ln?.detail_json?.technician_type || ln?.setting_snapshot?.technician_type || '').toLowerCase() === 'partner');
}

// =======================================
// üîí Phase 5 Guard: prevent retroactive payout changes
// - If a job's finished_at falls inside a locked/paid payout period,
//   disallow edits that would change income. Use adjustment instead.
// =======================================
async function _getCustomerCollectAmountForTechJob(job_id, fallbackAmount) {
  try {
    const realId = await resolveJobIdAny(pool, job_id);
    if (!realId) return _money(fallbackAmount || 0);
    const itemsR = await pool.query(
      `SELECT qty, unit_price, line_total FROM public.job_items WHERE job_id=$1 ORDER BY job_item_id ASC`,
      [realId]
    );
    const subtotal = (itemsR.rows || []).reduce((sum, it) => {
      const qty = Number(it.qty || 0);
      const unit = Number(it.unit_price || 0);
      const line = Number((it.line_total ?? (qty * unit)) || 0);
      return sum + (Number.isFinite(line) ? line : 0);
    }, 0);
    if (!(subtotal > 0)) return _money(fallbackAmount || 0);
    const promoR = await pool.query(
      `SELECT p.promo_type, p.promo_value, jp.applied_discount
         FROM public.job_promotions jp
         JOIN public.promotions p ON p.promo_id = jp.promo_id
        WHERE jp.job_id=$1
        LIMIT 1`,
      [realId]
    );
    const promo = promoR.rows?.[0] || null;
    let discount = 0;
    if (promo) {
      if (promo.applied_discount != null) discount = Number(promo.applied_discount || 0);
      else if (promo.promo_type === 'percent') discount = subtotal * (Number(promo.promo_value || 0) / 100);
      else if (promo.promo_type === 'amount') discount = Number(promo.promo_value || 0);
    }
    return _money(Math.max(0, subtotal - discount));
  } catch (e) {
    try { console.warn('[tech_money] customer collect fallback', { job_id, error: e.message }); } catch {}
    return _money(fallbackAmount || 0);
  }
}

async function _loadFinalizedTechPayoutLineForJob(job_id, username) {
  const tech = String(username || '').trim();
  if (!tech) return null;
  const aliases = await _getTechnicianVisibilityAliases(tech).catch(() => [tech]);
  const r = await pool.query(
    `SELECT l.payout_id, l.technician_username, l.job_id, l.earn_amount, l.detail_json,
            p.status AS payout_status, p.period_start, p.period_end
       FROM public.technician_payout_lines l
       JOIN public.technician_payout_periods p ON p.payout_id = l.payout_id
      WHERE l.job_id::text = $1::text
        AND l.technician_username = ANY($2::text[])
        AND COALESCE(p.status,'draft') IN ('locked','paid')
      ORDER BY CASE WHEN l.technician_username=$3 THEN 0 ELSE 1 END,
               CASE WHEN p.status='paid' THEN 0 ELSE 1 END, p.period_end DESC, l.line_id DESC
      LIMIT 1`,
    [String(job_id), aliases, tech]
  );
  return r.rows?.[0] || null;
}

const {
  _techIncomeBreakdownFromLine,
  _mapTechIncomeSourceFromLine,
  _techIncomeDisplayContextFromSource,
  _moneySummaryFromDisplayRow,
  _moneySummaryFromPreview,
  _upsertDisplayRowForPreview,
  _syncDisplayForJobState,
  _buildTechnicianJobMoneySummary,
  _buildTechnicianJobMoneySummaryBatch,
} = createTechnicianJobMoneyHelpers({
  pool,
  money: _money,
  technicianJobIncomeDisplayHelpers,
  technicianReworkHelpers,
  technicianReworkIncome,
  getCustomerCollectAmountForTechJob: _getCustomerCollectAmountForTechJob,
  loadTechnicianIncomePreview: _loadTechnicianIncomePreview,
  loadFinalizedTechPayoutLineForJob: _loadFinalizedTechPayoutLineForJob,
  getTechnicianVisibilityAliases: _getTechnicianVisibilityAliases,
  techJobContextFromRow: _techJobContextFromRow,
});

async function _loadTechnicianIncomePreview(job_id, username) {
  const tech = String(username || '').trim();
  const jid = Number(job_id);
  if (!Number.isInteger(jid) || jid <= 0 || !tech) return null;
  try {
    const r = await pool.query(
      `SELECT job_id, technician_username, income_amount, income_source, rate_set_id, rate_set_version,
              breakdown_json, is_stale, calculated_at, updated_at
         FROM public.job_technician_income_preview
        WHERE job_id=$1 AND technician_username=$2
        LIMIT 1`,
      [jid, tech]
    );
    const row = r.rows?.[0] || null;
    if (!row || row.is_stale) return null;
    return row;
  } catch (e) {
    try { console.warn('[tech_income_preview] load failed', { job_id: jid, username: tech, error: e.message }); } catch {}
    return null;
  }
}

async function _upsertTechnicianIncomePreview(job_id, username, line, source = 'preview') {
  const tech = String(username || '').trim();
  const jid = Number(job_id);
  if (!Number.isInteger(jid) || jid <= 0 || !tech || !line) return null;
  const breakdown = _techIncomeBreakdownFromLine(line, source);
  const detail = {
    source,
    technician_income_amount: _money(line.earn_amount || 0),
    technician_income_source: source,
    technician_income_breakdown: breakdown,
    rate_set_id: line.detail_json?.rate_set_id || breakdown.rate_set_id || null,
    rate_set_version: line.detail_json?.rate_set_version || breakdown.rate_set_version || null,
    detail_json: line.detail_json || null,
    calculated_at: new Date().toISOString(),
  };
  await pool.query(
    `INSERT INTO public.job_technician_income_preview
      (job_id, technician_username, income_amount, income_source, rate_set_id, rate_set_version, breakdown_json, is_stale, calculated_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,FALSE,NOW(),NOW())
     ON CONFLICT (job_id, technician_username) DO UPDATE SET
       income_amount=EXCLUDED.income_amount,
       income_source=EXCLUDED.income_source,
       rate_set_id=EXCLUDED.rate_set_id,
       rate_set_version=EXCLUDED.rate_set_version,
       breakdown_json=EXCLUDED.breakdown_json,
       is_stale=FALSE,
       calculated_at=NOW(),
     updated_at=NOW()`,
    [jid, tech, _money(line.earn_amount || 0), source, detail.rate_set_id, detail.rate_set_version, JSON.stringify(detail)]
  );
  try {
    await _upsertDisplayRowForPreview(jid, tech, {
      job_id: jid,
      technician_username: tech,
      income_amount: detail.technician_income_amount,
      income_source: source,
      rate_set_id: detail.rate_set_id,
      rate_set_version: detail.rate_set_version,
    }, source);
  } catch (e) {
    try { console.warn('[tech_income_display] preview sync failed', { job_id: jid, username: tech, source, error: e.message }); } catch {}
  }
  return { job_id: jid, technician_username: tech, ...detail };
}

async function _calculateAndStoreTechnicianIncomePreview(job_id, username, opts = {}) {
  const tech = String(username || '').trim();
  const jid = Number(job_id);
  if (!Number.isInteger(jid) || jid <= 0 || !tech) return null;
  try {
    const lines = await _buildPayoutLinesForJob(jid, { includeUnfinished: true, assumeTechnician: tech });
    const aliases = await _getTechnicianVisibilityAliases(tech).catch(() => [tech]);
    const aliasSet = new Set((aliases || [tech]).map(x => String(x || '').trim()).filter(Boolean));
    let line = (lines || []).find((ln) => String(ln.technician_username || '').trim() === tech) || null;
    if (!line && aliasSet.size) {
      line = (lines || []).find((ln) => aliasSet.has(String(ln.technician_username || '').trim())) || null;
    }
    if (!line) {
      // Keep a non-stale row with null/0? No: do not store false 0 for jobs we cannot infer.
      // Delete stale preview so UI shows fallback instead of a wrong zero.
      try { await pool.query(`DELETE FROM public.job_technician_income_preview WHERE job_id=$1 AND technician_username=$2`, [jid, tech]); } catch (_) {}
      return null;
    }
    const src = opts.source || 'job_preview';
    return await _upsertTechnicianIncomePreview(jid, tech, line, src);
  } catch (e) {
    try { console.warn('[tech_income_preview] calculate failed', { job_id: jid, username: tech, error: e.message, code: e.code }); } catch {}
    return null;
  }
}

async function _getOrCalculateTechnicianIncomePreview(job_id, username, context = 'current') {
  try {
    const meta = await _loadJobMeta(job_id);
    const exclusion = await _classifyRevisitWarrantyReworkJob(meta);
    if (exclusion.is_excluded) {
      await _markTechnicianIncomePreviewStale(job_id);
    }
  } catch (_) {}
  const cached = await _loadTechnicianIncomePreview(job_id, username);
  if (cached) return _moneySummaryFromPreview(cached, context);
  const made = await _calculateAndStoreTechnicianIncomePreview(job_id, username, { source: context === 'offered' ? 'offer_preview' : 'job_preview' });
  if (!made) return null;
  return {
    technician_income_amount: made.technician_income_amount,
    technician_income_source: made.technician_income_source,
    technician_income_rate_set_id: made.rate_set_id || null,
    technician_income_rate_set_version: made.rate_set_version || null,
    technician_income_breakdown: made.technician_income_breakdown || { source: made.technician_income_source, rows: [], related_items: [] },
    technician_income_label: context === 'offered' ? '‡∏ó‡∏µ‡πà‡∏ä‡πà‡∏≤‡∏á‡∏à‡∏∞‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö' : (context === 'history' ? '‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö' : '‡∏ó‡∏µ‡πà‡∏ä‡πà‡∏≤‡∏á‡∏à‡∏∞‡πÑ‡∏î‡πâ‡∏£‡∏±‡∏ö'),
  };
}

async function _markTechnicianIncomePreviewStale(job_id) {
  const jid = Number(job_id);
  if (!Number.isInteger(jid) || jid <= 0) return;
  try {
    await pool.query(`UPDATE public.job_technician_income_preview SET is_stale=TRUE, updated_at=NOW() WHERE job_id=$1`, [jid]);
    await pool.query(`UPDATE public.technician_job_income_display SET is_stale=TRUE, updated_at=NOW() WHERE job_id=$1`, [jid]);
  } catch (e) {
    try { console.warn('[tech_income_preview] mark stale failed', { job_id: jid, error: e.message }); } catch {}
  }
}

async function _refreshTechnicianIncomePreviewForJob(job_id, usernames, opts = {}) {
  const list = [...new Set((Array.isArray(usernames) ? usernames : [usernames]).map(x => String(x || '').trim()).filter(Boolean))].slice(0, 60);
  const incomeByUsername = {};
  if (!list.length) return incomeByUsername;
  await _markTechnicianIncomePreviewStale(job_id);
  for (const u of list) {
    const made = await _calculateAndStoreTechnicianIncomePreview(job_id, u, { source: opts.source || 'job_preview' });
    if (made && made.technician_income_amount != null) incomeByUsername[u] = Number(made.technician_income_amount || 0);
  }
  return incomeByUsername;
}

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
  const msg = `‡∏á‡∏≤‡∏ô #${job_id} ‡∏≠‡∏¢‡∏π‡πà‡πÉ‡∏ô‡∏á‡∏ß‡∏î‡∏ó‡∏µ‡πà‡∏•‡πá‡∏≠‡∏Å/‡∏à‡πà‡∏≤‡∏¢‡πÅ‡∏•‡πâ‡∏ß (${period.payout_id}) ‡πÅ‡∏Å‡πâ‡∏¢‡πâ‡∏≠‡∏ô‡∏´‡∏•‡∏±‡∏á‡πÑ‡∏°‡πà‡πÑ‡∏î‡πâ ‡πÉ‡∏´‡πâ‡πÉ‡∏ä‡πâ Adjustment ‡πÉ‡∏ô‡∏á‡∏ß‡∏î‡πÅ‡∏ó‡∏ô`;
  const err = new Error(msg);
  err.statusCode = 409;
  err.payout_id = period.payout_id;
  try { console.warn('[payout_freeze] blocked', { job_id, payout_id: period.payout_id, status: period.status, ctx }); } catch {}
  throw err;
}

// =======================================
// üîí Rework income hold/release ‚Äî shared workflow
// Used by /admin/jobs/:job_id/rework_case, /admin/jobs/:job_id/return_for_fix_v2,
// /jobs/:job_id/finalize (technician revisit close) and /admin/rework_cases/:id/resolve
// so every entry point that opens or closes a rework case pauses/restores the
// original technician's income through the exact same path (invariant: single
// shared workflow, no per-route divergence).
// =======================================

async function _openReworkCaseWithIncomeHold(client, opts = {}) {
  const jobId = Number(opts.jobId);
  if (!jobId) throw createHttpError(400, 'job_id ‡πÑ‡∏°‡πà‡∏ñ‡∏π‡∏Å‡∏ï‡πâ‡∏≠‡∏á');
  const reasonType = REWORK_REASON_TYPES.has(opts.reasonType) ? opts.reasonType : 'other';
  const reasonNote = opts.reasonNote || null;
  const actor = opts.actor || null;

  const jr = await client.query(
    `SELECT job_id, booking_code, technician_username, warranty_end_at, job_status, finished_at
       FROM public.jobs WHERE job_id=$1 FOR UPDATE`,
    [jobId]
  );
  if (!jr.rows.length) throw createHttpError(404, '‡πÑ‡∏°‡πà‡∏û‡∏ö‡∏á‡∏≤‡∏ô');
  const job = jr.rows[0];
  const technicianUsername = String(opts.technicianUsername || job.technician_username || '').trim() || null;

  const activeCase = await technicianReworkIncome.findActiveReworkCase(client, jobId);
  if (activeCase) {
    throw createHttpError(409, '‡∏á‡∏≤‡∏ô‡∏ô‡∏µ‡πâ‡∏°‡∏µ rework case ‡∏ó‡∏µ‡πà‡πÄ‡∏õ‡∏¥‡∏î‡∏≠‡∏¢‡∏π‡πà‡πÅ‡∏•‡πâ‡∏ß', { reworkCase: activeCase });
  }

  // Original-earner set: every technician who could have earned income on
  // this job (primary + team + assignments), not just whoever ends up
  // recorded as the single rework_case.technician_username ‚Äî team jobs must
  // hold/release income per person, never lump it onto one username.
  const team = await getTeamForJob(jobId);
  if (technicianUsername && !team.includes(technicianUsername)) team.push(technicianUsername);
  const preferredTech = technicianUsername || team[0] || null;

  // Capture originalIncomeRows BEFORE inserting the new rework_case row.
  // _buildPayoutLinesForJob queries through the shared pool (a different
  // connection than this transaction's `client`), so correctness must not
  // depend on whether that connection can see this transaction's uncommitted
  // INSERT ‚Äî computing it before the row exists removes that ambiguity
  // entirely, on every connection, committed or not.
  const lines = job.finished_at ? await _buildPayoutLinesForJob(jobId) : [];
  const originalIncomeRows = (lines || [])
    .filter((ln) => ln && String(ln.technician_username || '').trim())
    .map((ln) => ({
      technician_username: String(ln.technician_username).trim(),
      amount: Number(ln.earn_amount || 0),
      job_id: jobId,
    }));
  const earnAmount = originalIncomeRows
    .filter((row) => row.technician_username === preferredTech)
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const ins = await client.query(
    `INSERT INTO public.technician_rework_cases
     (case_code, job_id, technician_username, reason_type, reason_note, warranty_checked, warranty_end_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [await generateReworkCaseCode(client), jobId, technicianUsername, reasonType, reasonNote, !!opts.warrantyChecked, job.warranty_end_at || null, actor]
  );
  const reworkCase = ins.rows[0];

  // technicianReworkIncome.holdOriginalIncomeForReworkCase derives every
  // earner on the job (previous released hold ledger first, then these
  // originalIncomeRows, then technician_payout_lines), so a single call
  // already holds the whole team ‚Äî technicianUsername here is only a
  // fallback used if that technician has no authoritative row at all.
  const holdResults = [];
  if (preferredTech) {
    const holdResult = await technicianReworkIncome.holdOriginalIncomeForReworkCase(client, {
      reworkCaseId: reworkCase.rework_case_id,
      jobId,
      technicianUsername: preferredTech,
      originalFinishedAt: job.finished_at,
      actor,
      originalEarnAmount: earnAmount,
      originalIncomeRows,
    });
    holdResults.push(...((holdResult && holdResult.rows) || []));
  }

  await client.query(
    `UPDATE public.jobs
        SET job_status='‡∏á‡∏≤‡∏ô‡πÅ‡∏Å‡πâ‡πÑ‡∏Ç',
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
    [reasonNote || reasonType, actor, jobId]
  );
  await client.query(`UPDATE public.job_assignments SET status='in_progress', done_at=NULL WHERE job_id=$1`, [jobId]);

  return { job, reworkCase, holdResults, technicianUsername, team };
}

// successful=true releases every team member's held amount into the correct
// future payout period (rolling forward past any already-paid period);
// successful=false permanently voids every hold (no money moves ‚Äî the rework
// failed, so the original income stays paused/already-removed). Both paths
// are idempotent and safe to call repeatedly. Operates on every hold row for
// the case (team jobs hold/release per technician), not a single username.
async function _closeReworkCaseWithIncomeRelease(client, opts = {}) {
  const reworkCaseId = Number(opts.reworkCaseId);
  if (!reworkCaseId) return null;
  const successful = !!opts.successful;
  const actor = opts.actor || null;

  const holds = await technicianReworkIncome.getHoldsForReworkCase(client, reworkCaseId);
  if (!holds.length) return { released: false, reason: 'NO_HOLD', results: [] };

  // voidHeldIncomeForReworkCase / releaseHeldIncomeForReworkCase each act on
  // every held row for the rework case in one call (not just the passed
  // technicianUsername), so a single call already covers the whole team.
  if (!successful) {
    const r = await technicianReworkIncome.voidHeldIncomeForReworkCase(client, {
      reworkCaseId,
      technicianUsername: holds[0].technician_username,
    });
    const results = (r.rows || []).map((row) => ({ technician_username: row.technician_username, ...row }));
    return { released: false, voided: true, results };
  }

  // The release period is anchored on the rework job's own persisted
  // finished_at (e.g. read back via UPDATE ... RETURNING) ‚Äî never a
  // freshly-constructed `new Date()`, which could disagree with what was
  // actually written right at a payout-period boundary.
  if (!opts.finishedAt) {
    throw createHttpError(409, '‡∏á‡∏≤‡∏ô‡∏¢‡∏±‡∏á‡πÑ‡∏°‡πà‡∏°‡∏µ finished_at ‡∏à‡∏∂‡∏á‡∏Ñ‡∏∑‡∏ô‡∏£‡∏≤‡∏¢‡πÑ‡∏î‡πâ‡∏ó‡∏µ‡πà‡∏û‡∏±‡∏Å‡πÑ‡∏ß‡πâ‡πÑ‡∏°‡πà‡πÑ‡∏î‡πâ');
  }
  const r = await technicianReworkIncome.releaseHeldIncomeForReworkCase(client, {
    reworkCaseId,
    technicianUsername: holds[0].technician_username,
    finishedAt: opts.finishedAt,
    actor,
  });
  const results = (r.rows || []).map((row) => ({ technician_username: row.technician_username, ...row }));
  return { released: !!r.released, amount: Number(r.amount || 0), results };
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
      note: '‡∏û‡∏≤‡∏£‡πå‡∏ó‡πÄ‡∏ô‡∏≠‡∏£‡πå‡πÉ‡∏ä‡πâ‡πÄ‡∏£‡∏ó‡πÄ‡∏î‡∏µ‡∏¢‡∏ß‡∏ï‡πà‡∏≠‡πÄ‡∏Ñ‡∏£‡∏∑‡πà‡∏≠‡∏á‡∏ï‡∏≤‡∏°‡∏à‡∏≥‡∏ô‡∏ß‡∏ô‡∏£‡∏ß‡∏°‡∏Ç‡∏≠‡∏á‡∏£‡∏≤‡∏¢‡∏Å‡∏≤‡∏£‡∏õ‡∏£‡∏∞‡πÄ‡∏†‡∏ó‡πÄ‡∏î‡∏µ‡∏¢‡∏ß‡∏Å‡∏±‡∏ô‡πÉ‡∏ô‡πÉ‡∏ö‡∏á‡∏≤‡∏ô; ‡∏ä‡πà‡∏≤‡∏á‡∏ö‡∏£‡∏¥‡∏©‡∏±‡∏ó‡πÉ‡∏ä‡πâ‡πÄ‡∏£‡∏ó‡∏™‡∏±‡∏ç‡∏ç‡∏≤‡πÄ‡∏î‡∏¥‡∏° (‡πÑ‡∏°‡πà‡πÉ‡∏ä‡πâ‡πÄ‡∏õ‡∏≠‡∏£‡πå‡πÄ‡∏ã‡πá‡∏ô‡∏ï‡πå‡∏£‡∏≤‡∏¢‡πÑ‡∏î‡πâ‡πÄ‡∏î‡∏¥‡∏°)',
      gross_amount,
      lines,
    });
  } catch (e) {
    console.error('GET /admin/super/tech_income/calc/job/:job_id', e);
    if (String(e.code || '') === 'EMPTY_TEAM') return res.status(409).json({ error: 'EMPTY_TEAM' });
    return res.status(500).json({ error: '‡∏Ñ‡∏≥‡∏ô‡∏ß‡∏ì‡πÑ‡∏°‡πà‡∏™‡∏≥‡πÄ‡∏£‡πá‡∏à' });
  }
});

// =======================================
// ü™ú Step Ladder Rules (Super Admin) - Phase 1
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
    const ac_type = _normAcKey(b.ac_type) || (String(b.ac_type||'').trim() || null);ÁÕ˝ÛFÚµÎ(ö+my”∞†¢∆WBFó66˜VÁB“∞¢ñbá&ˆ÷Úí∞¢ñbá&ˆ÷ÚÊ∆ñVEˆFó66˜VÁB“ÁV∆¬íFó66˜VÁB“ÁV÷&W"á&ˆ÷ÚÊ∆ñVEˆFó66˜VÁB«¬ì∞¢V«6Rñbá&ˆ÷ÚÁ&ˆ÷ı˜GóR””“'W&6VÁB"íFó66˜VÁB“7V'F˜F¬¢ÑÁV÷&W"á&ˆ÷ÚÁ&ˆ÷ı˜f«VR«¬íÚì∞¢V«6Rñbá&ˆ÷ÚÁ&ˆ÷ı˜GóR””“&÷˜VÁB"íFó66˜VÁB“ÁV÷&W"á&ˆ÷ÚÁ&ˆ÷ı˜f«VR«¬ì∞¢–†¢6ˆÁ7BF˜F¬“÷FÇÊ÷ÇÉ¬7V'F˜F¬“Fó66˜VÁBì∞†¢&W2Êß6ˆ‚á∞¢óFV◊2¿¢&ˆ÷Û¢&ˆ÷¢Ú∞¢&ˆ÷ıˆñC¢&ˆ÷ÚÁ&ˆ÷ıˆñB¿¢&ˆ÷ıˆÊ÷S¢&ˆ÷ÚÁ&ˆ÷ıˆÊ÷R¿¢&ˆ÷ı˜GóS¢&ˆ÷ÚÁ&ˆ÷ı˜GóR¿¢&ˆ÷ı˜f«VS¢ÁV÷&W"á&ˆ÷ÚÁ&ˆ÷ı˜f«VRí¿¢–¢¢ÁV∆¬¿¢7V'F˜F√¢ÁV÷&W"á7V'F˜F¬ÁFÙfóÜVBÉ"íí¿¢Fó66˜VÁC¢ÁV÷&W"ÜFó66˜VÁBÁFÙfóÜVBÉ"íí¿¢F˜F√¢ÁV÷&W"áF˜F¬ÁFÙfóÜVBÉ"íí¿¢“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.ò.äæä^âNäÆä>ãéâæä>ã.àNã.òNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞††¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	˘+2î‘TÂB‰ıDî4RéàÆòéã.à~òâûâÆäÆä^ãNâæòä^òûärÚä>äﬁâ^ä>ä~àéäÆäﬁâ¢ê¢ÚÚ“òNäòÇ÷&≤ñBâ~ãâûâ~ãRòâÓã~òéäﬁò>äæòûòäﬁâNäãNâûâ^ä>ä~àéäÆäﬁâÆàòéäﬁâê¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶Á˜7BÇ"ˆ¶ˆ'2Û¶¶ˆ%ˆñB˜í"¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B¶ˆ%ˆñB“vóB&W6ˆ«fT¶ˆ$ñDÁíáˆˆ¬¬&WÁ&◊2Ê¶ˆ%ˆñBì∞¢6ˆÁ7B≤W6W&Ê÷R““&WÊ&ˆGí«¬∑”∞¢6ˆÁ7BñEˆ'í“áW6W&Ê÷R«¬""íÁFı7G&ñÊrÇíÁG&ñ“Çí«¬ÁV∆√∞†¢ñbÇ¶ˆ%ˆñBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢&¶ˆ%ˆñBòNäòéânãûàâ^òûäﬁàr"“ì∞†¢G'í∞¢vóBˆˆ¬ÁVW'íÄ¢UDDRV&∆ñ2Ê¶ˆ'0¢4UBñEˆ'í“4ÙƒU44RáñEˆ'í¬Cí¿¢ñ÷VÁE˜7FGW2“44RtÑT‚4ÙƒU44Ráñ÷VÁE˜7FGW2¬rrì“wñBrDÑT‚ñ÷VÁE˜7FGW2T≈4RwVÊFñÊu˜fW&ñfñ6Fñˆ‚rT‰B¿¢6∆˜6U˜ñ÷VÁE˜7FGW2“4ÙƒU44RÜ6∆˜6U˜ñ÷VÁE˜7FGW2¬wVÊFñÊu˜fW&ñfñ6Fñˆ‚rê¢tÑU$R¶ˆ%ˆñC“C&¿¢∑ñEˆ'í¬¶ˆ%ˆñE–¢ì∞¢&W2Êß6ˆ‚á≤7V66W73¢G'VR“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.âÆãâûâ~ãnààã.ä>àéòéã.ä.òà~ãNâûòNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞††¢ÚÚ)»RD‘î„¢6ˆÊfó&“7W7Fˆ÷W"ñ÷VÁBgFW"FV6ÜÊñ6ñ‚6∆˜6Rf∆˜p¶Á˜7BÇrˆF÷ñ‚ˆ¶ˆ'2Û¶¶ˆ%ˆñBˆ6ˆÊfó&“◊ñ÷VÁB◊c"r¬&WVó&TF÷ñÂ6ˆgB¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B¶ˆ%ˆñB“vóB&W6ˆ«fT¶ˆ$ñDÁíáˆˆ¬¬&WÁ&◊2Ê¶ˆ%ˆñBì∞¢6ˆÁ7BF÷ñ‚“7G&ñÊrá&WÊ&ˆGìÚÊF÷ñÂ˜W6W&Ê÷R«¬&WÊ&ˆGìÚÁW6W&Ê÷R«¬ˆWFÖW6W&Ê÷Rá&Wí«¬vF÷ñ‚ríÁG&ñ“Çí«¬vF÷ñ‚s∞¢ñbÇ¶ˆ%ˆñBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢v¶ˆ%ˆñBòNäòéânãûàâ^òûäﬁàrr“ì∞¢G'í∞¢vóBˆˆ¬ÁVW'íÄ¢UDDRV&∆ñ2Ê¶ˆ'0¢4UBñ÷VÁE˜7FGW3“wñBr¿¢ñEˆC‘4ÙƒU44RáñEˆB¬‰ırÇíí¿¢ñEˆ'ì‘4ÙƒU44RáñEˆ'í¬C"í¿¢6∆˜6U˜ñ÷VÁE˜7FGW3“wñBp¢tÑU$R¶ˆ%ˆñC“C¿¢∂¶ˆ%ˆñB¬F÷ñÂ–¢ì∞¢G'í≤vóB∆ˆt¶ˆ%WFFRÜ¶ˆ%ˆñB¬≤7F˜%˜W6W&Ê÷S¢F÷ñ‚¬7F˜%˜&ˆ∆S¢vF÷ñ‚r¬7Fñˆ„¢wñ÷VÁEˆ6ˆÊfó&÷VBr¬÷W76vS¢~òäﬁâNäãNâûä.ã~âûä.ãâûàã.ä>àÆã>ä>ãòà~ãNâûòä^òûärr“ì≤“6F6ÇÖÚí∑–¢&W2Êß6ˆ‚á≤7V66W73¢G'VR¬¶ˆ%ˆñC¢ÁV÷&W"Ü¶ˆ%ˆñBí¬ñ÷VÁE˜7FGW3¢wñBr“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Çv6ˆÊfó&“◊ñ÷VÁB◊c"r¬Rì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢~ä.ã~âûä.ãâûàã.ä>àÆã>ä>ãòà~ãNâûòNäòéäÆã>òä>ò~àÇr“ì∞¢–ß“ì∞††¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	˘+Ç$î4î‰r4Ñ‰tR$UTU5BéàÆòéã.à~òäÆâûäﬁòàòûòNà.ä>ã.àNã"˛ä>ã.ä.àã.ä2ê¢ÚÚ“àÆòéã.à~äÆòéàs¢ı5Bˆ¶ˆ'2Û¶¶ˆ%ˆñB˜&ñ6ñÊr◊&WVW7B≤W6W&Ê÷R¬óFV◊2¬Ê˜FR–¢ÚÚ“òäﬁâNäãNâûâNãûàNãNäs¢tUBˆF÷ñ‚˜&ñ6ñÊr◊&WVW7G0¢ÚÚ“òäﬁâNäãNâûäﬁâûãéäãâ^ãC¢ı5BˆF÷ñ‚˜&ñ6ñÊr◊&WVW7G2Û¶ñBˆ&˜fR≤FV6ñFVEˆ'í–¢ÚÚ“òäﬁâNäãNâûâæà˛ãNòäÆâÉ¢ı5BˆF÷ñ‚˜&ñ6ñÊr◊&WVW7G2Û¶ñBˆFV6∆ñÊR≤FV6ñFVEˆ'í¬F÷ñÂˆÊ˜FR–¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶Á˜7BÇ"ˆ¶ˆ'2Û¶¶ˆ%ˆñB˜&ñ6ñÊr◊&WVW7B"¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B¶ˆ%ˆñB“ÁV÷&W"á&WÁ&◊2Ê¶ˆ%ˆñBì∞¢6ˆÁ7B≤W6W&Ê÷R¬óFV◊2¬Ê˜FR““&WÊ&ˆGí«¬∑”∞¢6ˆÁ7B&WVW7FVEˆ'í“áW6W&Ê÷R«¬""íÁFı7G&ñÊrÇíÁG&ñ“Çì∞†¢ñbÇ¶ˆ%ˆñBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢&¶ˆ%ˆñBòNäòéânãûàâ^òûäﬁàr"“ì∞¢ñbÇ&WVW7FVEˆ'íí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.â^òûäﬁà~äÆòéàrW6W&Ê÷R"“ì∞†¢6ˆÁ7B6fTóFV◊2“'&íÊó4'&íÜóFV◊2íÚóFV◊2¢µ”∞¢6ˆÁ7B6∆VÊVB“6fTóFV◊0¢Ê÷ÇáÇí”‚á∞¢óFV’ˆÊ÷S¢áÇÊóFV’ˆÊ÷R«¬""íÁFı7G&ñÊrÇíÁG&ñ“Çí¿¢Gì¢ÁV÷&W"áÇÁGí«¬í¿¢VÊóE˜&ñ6S¢ÁV÷&W"áÇÁVÊóE˜&ñ6R«¬í¿¢“íê¢Êfñ«FW"ÇáÇí”‚ÇÊóFV’ˆÊ÷RbbÁV÷&W"Êó4fñÊóFRáÇÁGííbbÇÁGí‚bbÁV÷&W"Êó4fñÊóFRáÇÁVÊóE˜&ñ6RíbbÇÁVÊóE˜&ñ6R„“ì∞†¢ñbÇ6∆VÊVBÊ∆VÊwFÇí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.â^òûäﬁà~äã^ä>ã.ä.àã.ä>äﬁä.òéã.à~âûòûäﬁä"ä>ã.ä.àã.ä2"“ì∞†¢6ˆÁ7Bñ∆ˆB“∞¢&WVW7FVEˆ'í¿¢Ê˜FS¢ÜÊ˜FR«¬""íÁFı7G&ñÊrÇíÁG&ñ“Çí«¬ÁV∆¬¿¢óFV◊3¢6∆VÊVBÊ÷ÇáÇí”‚á∞¢‚‚ÁÇ¿¢∆ñÊU˜F˜F√¢ÁV÷&W"ÇáÇÁGí¢ÇÁVÊóE˜&ñ6RíÁFÙfóÜVBÉ"íí¿¢“íí¿¢”∞†¢ñ∆ˆBÁ&ñ6ñÊr“6∆5&ñ6ñÊráñ∆ˆBÊóFV◊2¬ÁV∆¬ì∞†¢G'í∞¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2Ê¶ˆ%˜&ñ6ñÊu˜&WVW7G2Ü¶ˆ%ˆñB¬&WVW7FVEˆ'í¬ñ∆ˆEˆß6ˆ‚ê¢d≈TU2ÇC¬C"¬C3£¶ß6ˆÊ"ê¢$UEU$‰î‰r&WVW7EˆñF¿¢∂¶ˆ%ˆñB¬&WVW7FVEˆ'í¬•4Ù‚Á7G&ñÊvñgíáñ∆ˆBï–¢ì∞¢&W2Êß6ˆ‚á≤7V66W73¢G'VR¬&WVW7EˆñC¢"Á&˜w5≥“Á&WVW7EˆñB“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.äÆòéà~àNã>à.äﬁòàòûòNà.ä>ã.àNã.òNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞†¶ÊvWBÇ"ˆF÷ñ‚˜&ñ6ñÊr◊&WVW7G2"¬&WVó&TF÷ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5B"Á&WVW7EˆñB¬"Ê¶ˆ%ˆñB¬"Á&WVW7FVEˆ'í¬"Áñ∆ˆEˆß6ˆ‚¬"Á7FGW2¬"Ê7&VFVEˆB¿¢¢Ê&ˆˆ∂ñÊuˆ6ˆFR¬¢Ê7W7Fˆ÷W%ˆÊ÷R¬¢Ê¶ˆ%˜GóR¬¢ÊˆñÁF÷VÁEˆFFWFñ÷P¢e$Ù“V&∆ñ2Ê¶ˆ%˜&ñ6ñÊu˜&WVW7G2 ¢ƒTeB§Ùî‚V&∆ñ2Ê¶ˆ'2¢Ù‚¢Ê¶ˆ%ˆñB“"Ê¶ˆ%ˆñ@¢tÑU$R"Á7FGW3“wVÊFñÊrp¢ı$DU"%í"Ê7&VFVEˆB46 ¢ì∞¢&W2Êß6ˆ‚á"Á&˜w2«¬µ“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.ò.äæä^âNàNã>à.äﬁòàòûòNà.ä>ã.àNã.òNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞†¶Á˜7BÇ"ˆF÷ñ‚˜&ñ6ñÊr◊&WVW7G2Û¶ñBˆ&˜fR"¬&WVó&TF÷ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B&WVW7EˆñB“ÁV÷&W"á&WÁ&◊2ÊñBì∞¢6ˆÁ7BFV6ñFVEˆ'í“á&WÊ&ˆGíÊFV6ñFVEˆ'í«¬&F÷ñ‚"íÁFı7G&ñÊrÇíÁG&ñ“Çì∞†¢6ˆÁ7B6∆ñVÁB“vóBˆˆ¬Ê6ˆÊÊV7BÇì∞¢G'í∞¢vóB6∆ñVÁBÁVW'íÇ$$Ttî‚"ì∞†¢6ˆÁ7B'"“vóB6∆ñVÁBÁVW'íÄ¢4TƒT5B&WVW7EˆñB¬¶ˆ%ˆñB¬ñ∆ˆEˆß6ˆ‚¬7FGW0¢e$Ù“V&∆ñ2Ê¶ˆ%˜&ñ6ñÊu˜&WVW7G0¢tÑU$R&WVW7EˆñC“C¢dı"UDDV¿¢∑&WVW7EˆñE–¢ì∞¢ñbÇ'"Á&˜w2Ê∆VÊwFÇíFá&˜rÊWrW'&˜"Ç.òNäòéâÓâÆàNã>à.ä“"ì∞¢6ˆÁ7B&W&˜r“'"Á&˜w5≥”∞¢ñbá&W&˜rÁ7FGW2”“'VÊFñÊr"íFá&˜rÊWrW'&˜"Ç.àNã>à.äﬁâûã^òûânãûàâ^ãâNäÆãNâûòNâæòä^òûär"ì∞†¢ÚÚ	˘I"Ü6RS¢&∆ˆ6≤&WG&ˆ7FófRñÊ6ˆ÷R6ÜÊvRf˜"∆ˆ6∂VB˜ñBW&ñˆG0¢vóBˆ76W'D¶ˆ$◊WF&∆Tf˜%ñ˜WBÜ6∆ñVÁB¬&W&˜rÊ¶ˆ%ˆñB¬w&ñ6ñÊr◊&WVW7B÷&˜fRrì∞†¢6ˆÁ7Bñ∆ˆB“&W&˜rÁñ∆ˆEˆß6ˆ‚«¬∑”∞¢6ˆÁ7BóFV◊2“'&íÊó4'&íáñ∆ˆBÊóFV◊2íÚñ∆ˆBÊóFV◊2¢µ”∞†¢ÚÚä^òûã.à~ä>ã.ä.àã.ä>òâNãNäòä^òûä~ò>äÆòéò>äæäòÄ¢vóB6∆ñVÁBÁVW'íÜDTƒUDRe$Ù“V&∆ñ2Ê¶ˆ%ˆóFV◊2tÑU$R¶ˆ%ˆñC“C¬∑&W&˜rÊ¶ˆ%ˆñE“ì∞†¢f˜"Ü6ˆÁ7BóBˆbóFV◊2í∞¢6ˆÁ7BÊ÷R“ÜóBÊóFV’ˆÊ÷R«¬""íÁFı7G&ñÊrÇíÁG&ñ“Çì∞¢6ˆÁ7BGí“ÁV÷&W"ÜóBÁGí«¬ì∞¢6ˆÁ7BVÊóE˜&ñ6R“ÁV÷&W"ÜóBÁVÊóE˜&ñ6R«¬ì∞¢ñbÇÊ÷R«¬ÁV÷&W"Êó4fñÊóFRáGíí«¬Gí√“«¬ÁV÷&W"Êó4fñÊóFRáVÊóE˜&ñ6Rí«¬VÊóE˜&ñ6R¬í6ˆÁFñÁVS∞†¢6ˆÁ7B∆ñÊU˜F˜F¬“ÁV÷&W"ÇáGí¢VÊóE˜&ñ6RíÁFÙfóÜVBÉ"íì∞¢vóB6∆ñVÁBÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2Ê¶ˆ%ˆóFV◊2Ü¶ˆ%ˆñB¬óFV’ˆÊ÷R¬Gí¬VÊóE˜&ñ6R¬∆ñÊU˜F˜F¬ê¢d≈TU2ÇC¬C"¬C2¬CB¬CRñ¿¢∑&W&˜rÊ¶ˆ%ˆñB¬Ê÷R¬Gí¬VÊóE˜&ñ6R¬∆ñÊU˜F˜F≈–¢ì∞¢–†¢6ˆÁ7BF˜F¬“ÁV÷&W"áñ∆ˆBÁ&ñ6ñÊsÚÁF˜F¬«¬ì∞¢vóB6∆ñVÁBÁVW'íÜUDDRV&∆ñ2Ê¶ˆ'24UB¶ˆ%˜&ñ6S“CtÑU$R¶ˆ%ˆñC“C&¬∑F˜F¬¬&W&˜rÊ¶ˆ%ˆñE“ì∞†¢vóB6∆ñVÁBÁVW'íÄ¢UDDRV&∆ñ2Ê¶ˆ%˜&ñ6ñÊu˜&WVW7G0¢4UB7FGW3“v&˜fVBr¬FV6ñFVEˆC‘‰ırÇí¬FV6ñFVEˆ'ì“C¢tÑU$R&WVW7EˆñC“C&¿¢∂FV6ñFVEˆ'í¬&WVW7EˆñE–¢ì∞†¢vóB6∆ñVÁBÁVW'íÇ$4Ù‘‘ïB"ì∞¢&W2Êß6ˆ‚á≤7V66W73¢G'VR¬¶ˆ%ˆñC¢&W&˜rÊ¶ˆ%ˆñB¬F˜F¬“ì∞¢“6F6ÇÜRí∞¢vóB6∆ñVÁBÁVW'íÇ%$Ùƒƒ$4≤"ì∞¢&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢RÊ÷W76vR«¬.äﬁâûãéäãâ^ãNòNäòéäÆã>òä>ò~àÇ"“ì∞¢“fñÊ∆«í∞¢6∆ñVÁBÁ&V∆V6RÇì∞¢–ß“ì∞†¶Á˜7BÇ"ˆF÷ñ‚˜&ñ6ñÊr◊&WVW7G2Û¶ñBˆFV6∆ñÊR"¬&WVó&TF÷ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B&WVW7EˆñB“ÁV÷&W"á&WÁ&◊2ÊñBì∞¢6ˆÁ7BFV6ñFVEˆ'í“á&WÊ&ˆGíÊFV6ñFVEˆ'í«¬&F÷ñ‚"íÁFı7G&ñÊrÇíÁG&ñ“Çì∞¢6ˆÁ7BF÷ñÂˆÊ˜FR“á&WÊ&ˆGíÊF÷ñÂˆÊ˜FR«¬""íÁFı7G&ñÊrÇíÁG&ñ“Çí«¬ÁV∆√∞†¢G'í∞¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢UDDRV&∆ñ2Ê¶ˆ%˜&ñ6ñÊu˜&WVW7G0¢4UB7FGW3“vFV6∆ñÊVBr¬FV6ñFVEˆC‘‰ırÇí¬FV6ñFVEˆ'ì“C¬F÷ñÂˆÊ˜FS“C ¢tÑU$R&WVW7EˆñC“C2‰B7FGW3“wVÊFñÊrp¢$UEU$‰î‰r&WVW7EˆñF¿¢∂FV6ñFVEˆ'í¬F÷ñÂˆÊ˜FR¬&WVW7EˆñE–¢ì∞†¢ñbÇ"Á&˜w2Ê∆VÊwFÇí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.òNäòéâÓâÆàNã>à.ä“äæä>ã~äﬁàNã>à.äﬁânãûàâ^ãâNäÆãNâûòNâæòä^òûär"“ì∞¢&W2Êß6ˆ‚á≤7V66W73¢G'VR“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.âæà˛ãNòäÆâéàNã>à.äﬁòNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞††¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	˙{‚D‘î„¢TDïB§Ù"ïDT’2Ú$Ù‘ıDîÙ‚éòàòûä>ã.ä.àã.ä2ﬁä>ã.àNã"ﬁò.âæä2ê¢ÚÚ“òäﬁâNäãNâûòàòûòNâNòûòä^ä"òNäòéâ^òûäﬁà~âŒòéã.âív˜&∂f∆˜réò>àÆòûàãâÆà~ã.âûä^à~âŒãNâB˛òàòûäæâûòûã.à~ã.âíê¢ÚÚ“òNäòéàä>ãâ~âÆà.äﬁà~òâNãNä¢òâæò~âíVÊGˆñÁBòâÓãNòéäòâ^ãNä¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶ÁWBÇ"ˆ¶ˆ'2Û¶¶ˆ%ˆñBˆóFV◊2÷F÷ñ‚"¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B¶ˆ%ˆñB“ÁV÷&W"á&WÁ&◊2Ê¶ˆ%ˆñBì∞¢6ˆÁ7BóFV◊2“'&íÊó4'&íá&WÊ&ˆGìÚÊóFV◊2íÚ&WÊ&ˆGíÊóFV◊2¢µ”∞¢6ˆÁ7BÜ5&ˆ÷˜Fñˆ‰ñB“ˆ&¶V7BÁ&˜F˜GóRÊÜ4˜vÂ&˜W'GíÊ6∆¬á&WÊ&ˆGí«¬∑“¬w&ˆ÷˜FñˆÂˆñBrì∞¢6ˆÁ7B&ˆ÷˜FñˆÂˆñB“Ü5&ˆ÷˜Fñˆ‰ñBbb&WÊ&ˆGìÚÁ&ˆ÷˜FñˆÂˆñBÚÁV÷&W"á&WÊ&ˆGíÁ&ˆ÷˜FñˆÂˆñBí¢ÁV∆√∞¢6ˆÁ7B&6UˆóFV◊5˜6Ê6Ü˜B“&WÊ&ˆGìÚÊ&6UˆóFV◊5˜6Ê6Ü˜C∞†¢ñbÇ¶ˆ%ˆñBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢&¶ˆ%ˆñBòNäòéânãûàâ^òûäﬁàr"“ì∞†¢6ˆÁ7B6∆ñVÁB“vóBˆˆ¬Ê6ˆÊÊV7BÇì∞¢G'í∞¢vóB6∆ñVÁBÁVW'íÇ$$Ttî‚"ì∞†¢ÚÚ	˘I"Ü6RS¢&∆ˆ6≤&WG&ˆ7FófRñÊ6ˆ÷R6ÜÊvRf˜"∆ˆ6∂VB˜ñBW&ñˆG0¢vóBˆ76W'D¶ˆ$◊WF&∆Tf˜%ñ˜WBÜ6∆ñVÁB¬¶ˆ%ˆñB¬vóFV◊2÷F÷ñ‚rì∞¢6ˆÁ7B&W7V«B“vóB6fT¶ˆ$óFV◊4F÷ñÂvóFÑ6∆ñVÁBÜ6∆ñVÁB¬¶ˆ%ˆñB¬óFV◊2¬∞¢Ü5&ˆ÷˜Fñˆ‰ñB¿¢&ˆ÷˜FñˆÂˆñB¿¢&6TóFV◊56Ê6Ü˜C¢&6UˆóFV◊5˜6Ê6Ü˜B¿¢“ì∞†¢vóB6∆ñVÁBÁVW'íÇ$4Ù‘‘ïB"ì∞¢G'í∞¢6ˆÁ7B&WfñWuF&vWG2“vóBvWEFV‘f˜$¶ˆ"Ü¶ˆ%ˆñBì∞¢vóB˜&Vg&W6ÖFV6ÜÊñ6ñ‰ñÊ6ˆ÷U&WfñWtf˜$¶ˆ"Ü¶ˆ%ˆñB¬&WfñWuF&vWG2¬≤6˜W&6S¢vóFV◊5ˆF÷ñÂ˜&WfñWrr“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÁv&‚Çu∂ñÊ6ˆ÷U˜&WfñWu“óFV◊2÷F÷ñ‚&Vg&W6Çfñ∆VBr¬RÊ÷W76vRì∞¢–¢&W2Êß6ˆ‚á≤7V66W73¢G'VR¬&ñ6ñÊs¢&W7V«BÁ&ñ6ñÊr“ì∞¢“6F6ÇÜRí∞¢vóB6∆ñVÁBÁVW'íÇ%$Ùƒƒ$4≤"ì∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢ñbÜSÚÁ7FGW2””“Cíí∞¢&WGW&‚&W2Á7FGW2ÉCííÊß6ˆ‚á≤W'&˜#¢RÊ÷W76vR¬‚‚‚ÜRÊWáG&«¬∑“í“ì∞¢–¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢RÊ÷W76vR«¬.òàòûä>ã.ä.àã.ä>òNäòéäÆã>òä>ò~àÇ"“ì∞¢“fñÊ∆«í∞¢6∆ñVÁBÁ&V∆V6RÇì∞¢–ß“ì∞††¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	˘RDT”¢òâÓãNòéä˛òàòûäÆäã.àÆãNàâ~ã^äàÆòéã.à~à.äﬁà~à~ã.âíÜF÷ñ‚ê¢ÚÚ“ò>àÆòûàä>â>ã^à~ã.âûâ^òûäﬁà~òà.òûã.âÓä>òûäﬁäàãâûäæä^ã.ä.àNâíòä^ãàÆòéä~ä.àãâûä^à~ä>ãûâæòNâNòê¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶ÊvWBÇ"ˆ¶ˆ'2Û¶¶ˆ%ˆñB˜FV“"¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B¶ˆ%ˆñB“ÁV÷&W"á&WÁ&◊2Ê¶ˆ%ˆñBì∞¢ñbÇ¶ˆ%ˆñBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢&¶ˆ%ˆñBòNäòéânãûàâ^òûäﬁàr"“ì∞†¢6ˆÁ7BvÁDFWFñ«2“7G&ñÊrá&WÁVW'íÊFWFñ«2«¬""íÁG&ñ“Çí””“##∞†¢G'í∞¢ñbávÁDFWFñ«2í∞¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢ ¢4TƒT5BF“ÁW6W&Ê÷R¿¢GÊgV∆≈ˆÊ÷R¿¢GÁÜ˜Fı˜FÇ¿¢GÁÜˆÊP¢e$Ù“V&∆ñ2Ê¶ˆ%˜FV’ˆ÷V÷&W'2F–¢ƒTeB§Ùî‚V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2GÙ‚GÁW6W&Ê÷R“F“ÁW6W&Ê÷P¢tÑU$RF“Ê¶ˆ%ˆñC“C¢ı$DU"%íF“ÁW6W&Ê÷R40¢¿¢∂¶ˆ%ˆñE–¢ì∞†¢&WGW&‚&W2Êß6ˆ‚á∞¢÷V÷&W'3¢á"Á&˜w2«¬µ“íÊ÷ÇáÇí”‚á∞¢W6W&Ê÷S¢ÇÁW6W&Ê÷R¿¢gV∆≈ˆÊ÷S¢ÇÊgV∆≈ˆÊ÷R«¬ÁV∆¬¿¢Ü˜FÛ¢ÇÁÜ˜Fı˜FÇ«¬ÁV∆¬¿¢ÜˆÊS¢ÇÁÜˆÊR«¬ÁV∆¬¿¢“íí¿¢“ì∞¢–†¢ÚÚ∆Vv7íéòâNãNäì¢äÆòéà~òàNòÇW6W&Ê÷Uµ–¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BW6W&Ê÷Re$Ù“V&∆ñ2Ê¶ˆ%˜FV’ˆ÷V÷&W'2tÑU$R¶ˆ%ˆñC“Cı$DU"%íW6W&Ê÷R46¿¢∂¶ˆ%ˆñE–¢ì∞¢&W2Êß6ˆ‚á≤÷V÷&W'3¢"Á&˜w2Ê÷ÇáÇí”‚ÇÁW6W&Ê÷Rí“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.ò.äæä^âNâ~ã^äòNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞††¶ÁWBÇ"ˆ¶ˆ'2Û¶¶ˆ%ˆñB˜FV“"¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B¶ˆ%ˆñB“ÁV÷&W"á&WÁ&◊2Ê¶ˆ%ˆñBì∞¢6ˆÁ7B÷V÷&W'2“'&íÊó4'&íá&WÊ&ˆGìÚÊ÷V÷&W'2íÚ&WÊ&ˆGíÊ÷V÷&W'2¢µ”∞¢ÚÚ˜FñˆÊ√¢∆∆˜rg&ˆÁFVÊBFÚWá∆ñ6óF«íñ6≤&ñ÷'íˆ∆VFW ¢6ˆÁ7B&ñ÷'îg&ˆ‘&ˆGí“á&WÊ&ˆGìÚÁ&ñ÷'ï˜W6W&Ê÷R«¬&WÊ&ˆGìÚÁ&ñ÷'í«¬""íÁFı7G&ñÊrÇíÁG&ñ“Çì∞¢6ˆÁ7B&6U˜FV’˜6Ê6Ü˜B“&WÊ&ˆGìÚÊ&6U˜FV’˜6Ê6Ü˜C∞¢ñbÇ¶ˆ%ˆñBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢&¶ˆ%ˆñBòNäòéânãûàâ^òûäﬁàr"“ì∞†¢6ˆÁ7B6∆ñVÁB“vóBˆˆ¬Ê6ˆÊÊV7BÇì∞¢G'í∞¢vóB6∆ñVÁBÁVW'íÇ$$Ttî‚"ì∞¢6ˆÁ7B&W7V«B“vóB6fT¶ˆ%FV’vóFÑ6∆ñVÁBÜ6∆ñVÁB¬¶ˆ%ˆñB¬÷V÷&W'2¬&ñ÷'îg&ˆ‘&ˆGí¬∞¢&6UFV’6Ê6Ü˜C¢&6U˜FV’˜6Ê6Ü˜B¿¢“ì∞†¢vóB6∆ñVÁBÁVW'íÇ$4Ù‘‘ïB"ì∞¢&W2Êß6ˆ‚á≤7V66W73¢G'VR¬÷V÷&W'3¢&W7V«BÊ÷V÷&W'2¬&ñ÷'ï˜W6W&Ê÷S¢&W7V«BÁ&ñ÷'í«¬ÁV∆¬“ì∞¢“6F6ÇÜRí∞¢vóB6∆ñVÁBÁVW'íÇ%$Ùƒƒ$4≤"ì∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢ñbÜSÚÁ7FGW2””“Cíí∞¢&WGW&‚&W2Á7FGW2ÉCííÊß6ˆ‚á≤W'&˜#¢RÊ÷W76vR¬‚‚‚ÜRÊWáG&«¬∑“í“ì∞¢–¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.äﬁãâæòâNâ^â~ã^äòNäòéäÆã>òä>ò~àÇ"“ì∞¢“fñÊ∆«í∞¢6∆ñVÁBÁ&V∆V6RÇì∞¢–ß“ì∞††¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ(jû˚àÚ$UEU$‚§Ù"áFV6ÜÊñ6ñ‚í“â^ã^àä^ãâÆà~ã.âûò>äæòûòäﬁâNäãNâê¢ÚÚ“ò>àÆòûàä>â>ã^ä>ãâÆà~ã.âûòä^òûä~òâ^òéòNäòéäÆãâNä~à˛â^ãNâNòäæâ^ãéàûãéàòàûãNâê¢ÚÚ“òäﬁâNäãNâûàéãòäæò~âûà~ã.âûòâæò~âûäÆânã.âûã.â^ã^àä^ãâ¢"òä^ãäÆòéà~â^òéäﬁò>äæòûàÆòéã.à~àNâûäﬁã~òéâûòNâNòê¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶Á˜7BÇ"ˆ¶ˆ'2Û¶¶ˆ%ˆñB˜&WGW&‚"¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B¶ˆ%ˆñB“ÁV÷&W"á&WÁ&◊2Ê¶ˆ%ˆñBì∞¢6ˆÁ7BW6W&Ê÷R“á&WÊ&ˆGìÚÁW6W&Ê÷R«¬""íÁFı7G&ñÊrÇíÁG&ñ“Çì∞¢6ˆÁ7B&V6ˆ‚“á&WÊ&ˆGìÚÁ&V6ˆ‚«¬""íÁFı7G&ñÊrÇíÁG&ñ“Çì∞†¢ñbÇ¶ˆ%ˆñBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢&¶ˆ%ˆñBòNäòéânãûàâ^òûäﬁàr"“ì∞¢ñbÇW6W&Ê÷Rí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.â^òûäﬁà~äÆòéàrW6W&Ê÷R"“ì∞†¢G'í∞¢ÚÚ)»RâNãnà~àNâûâ~ã^òéânãûàääﬁâÆäæäã.ä.ä^òéã.äÆãéâBòâÓã~òéäﬁàãâûàNã~âûà~ã.âûàNâûä^ã¶ˆ ¢6ˆÁ7B¢“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬FV6ÜÊñ6ñÂ˜FV“¬¶ˆ%˜7FGW2e$Ù“V&∆ñ2Ê¶ˆ'2tÑU$R¶ˆ%ˆñC“C¿¢∂¶ˆ%ˆñE–¢ì∞¢ñbÇ¢Á&˜w2Ê∆VÊwFÇí&WGW&‚&W2Á7FGW2ÉCBíÊß6ˆ‚á≤W'&˜#¢.òNäòéâÓâÆà~ã.âí"“ì∞†¢6ˆÁ7B7W'&VÁB“¢Á&˜w5≥”∞¢6ˆÁ7B7B“7G&ñÊrÜ7W'&VÁBÊ¶ˆ%˜7FGW2«¬""íÁG&ñ“Çì∞¢ñbÖ≤.òäÆä>ò~àéòä^òûär"¬.ä.àòä^ãNà%“ÊñÊ6«VFW2á7Bíí∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.à~ã.âûâûã^òûâæãNâNòNâæòä^òûäròNäòéäÆã.äã.ä>ânâ^ã^àä^ãâÆòNâNòí"“ì∞¢–†¢ÚÚ)»RäﬁãâæòâNâ^äÆânã.âûã≤ä^òûã.à~àNâûääﬁâÆäæäã.ä"òâÓã~òéäﬁò>äæòûòäﬁâNäãNâûäÆòéà~â^òéäﬁòNâNòê¢vóBˆˆ¬ÁVW'íÄ¢UDDRV&∆ñ2Ê¶ˆ'0¢4UB¶ˆ%˜7FGW3“~â^ã^àä^ãâ¢r¿¢&WGW&ÊVEˆC‘‰ırÇí¿¢&WGW&Â˜&V6ˆ„“C¿¢&WGW&ÊVEˆ'ì“C"¿¢FV6ÜÊñ6ñÂ˜W6W&Ê÷S‘ÂTƒ¬¿¢FV6ÜÊñ6ñÂ˜FV”‘ÂTƒ¬¿¢Fó7F6Öˆ÷ˆFS“vˆffW"p¢tÑU$R¶ˆ%ˆñC“C6¿¢∑&V6ˆ‚«¬ÁV∆¬¬W6W&Ê÷R¬¶ˆ%ˆñE–¢ì∞†¢ÚÚä^òûã.à~â~ã^äéòNäòéò>äæòûä.ãà~òäæò~âûà~ã.âûò>âûäæâûòûã.àÆòéã.àrê¢vóBˆˆ¬ÁVW'íÜDTƒUDRe$Ù“V&∆ñ2Ê¶ˆ%˜FV’ˆ÷V÷&W'2tÑU$R¶ˆ%ˆñC“C¬∂¶ˆ%ˆñE“ì∞†¢&W2Êß6ˆ‚á≤7V66W73¢G'VR“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.â^ã^àä^ãâÆà~ã.âûòNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞††¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	˘:í§Ù"5T‘‘%íDUÖ@¢ÚÚ””””””””””””””””””””””””””””””””””””””–†¶gVÊ7Fñˆ‚G&Á6∆FT¶ˆ%GóTT‚áBó∞¢6ˆÁ7B2“áG«¬rríÁFı7G&ñÊrÇíÁG&ñ“Çì∞¢ÚÚ&RFˆ∆W&ÁC¢6ˆ÷WFñ÷W27F˜&VBvóFÇWáG&v˜&G2˜76W0¢ñbÇ˛ä^òûã.àrÚÁFW7Bá2íí&WGW&‚t6∆VÊñÊrs∞¢ñbÇ˛àæòéäﬁäÚÁFW7Bá2íí&WGW&‚u&Wó"s∞¢ñbÇ˛â^ãNâNâ^ãòûàrÚÁFW7Bá2íí&WGW&‚tñÁ7F∆∆Fñˆ‚s∞¢&WGW&‚2«¬r“s∞ß–†††¶gVÊ7Fñˆ‚G&Á6∆FU6W'fñ6TóFV‘Ê÷TT‚ÜÊ÷Ró∞¢∆WBB“ÜÊ÷W«¬rríÁFı7G&ñÊrÇì∞¢ÚÚÊ˜&÷∆ó¶R6W&F˜'0¢B“BÁ&W∆6RÇı«2Æ(
%«2¢ˆr¬r(
"rì∞†¢ÚÚ6ˆ÷÷ˆ‚FÜí”‰T‚÷ñÊw2f˜VÊBñ‚5tbóFV“∆&V«0¢6ˆÁ7B÷“∞¢≤˛ä^òûã.à~òäﬁä>ò¬ˆví¬t26∆VÊñÊru“¿¢≤˛àæòéäﬁäòäﬁä>ò¬ˆví¬t2&Wó"u“¿¢≤˛â^ãNâNâ^ãòûà~òäﬁä>ò¬ˆví¬t2ñÁ7F∆∆Fñˆ‚u“¿†¢≤˛âŒâûãàrˆr¬uv∆¬÷÷˜VÁFVBu“¿¢≤˛äÆã^òéâ~ãNäéâ~ã.àrˆr¬sB◊ví676WGFRu“¿¢≤˛òâæä^ã~äﬁä.ò>â^òûâﬁòûã"ˆr¬t6ˆÊ6V∆VB6Vñ∆ñÊru“¿¢≤˛òà.ä~âíˆr¬t6Vñ∆ñÊr7W7VÊFVBu“¿†¢≤˛ä^òûã.à~âéä>ä>äâNã"ˆr¬u7FÊF&Bv6Çu“¿¢≤˛ä^òûã.à~âÓä>ã^òäã^ä.äˆr¬u&V÷óV“v6Çu“¿¢≤˛ä^òûã.à~òà.ä~âûàNäﬁä.ä^ò¬ˆr¬t6ˆñ¬ÜÊvñÊrv6Çu“¿¢≤˛ä^òûã.à~òà.ä~âûàNäﬁä.âûò¬ˆr¬t6ˆñ¬ÜÊvñÊrv6Çu“¿¢≤˛ä^òûã.à~òâÆâÆâ^ãâNä^òûã.à~ò>äæàﬁòÇˆr¬tFVW6∆V‚Ñ÷¶˜"íu“¿¢≤˛â^ãâNä^òûã.à~ò>äæàﬁòÇˆr¬tFVW6∆V‚Ñ÷¶˜"íu“¿¢≤˛ä^òûã.à~òâÆâÆâ^ãâNä^òûã.àrˆr¬tFVW6∆V‚ÑFó676V÷&∆Ríu“¿¢≤˛â^ãâNä^òûã.àrˆr¬tFVW6∆V‚ÑFó676V÷&∆Ríu“¿†¢≤˛àÆòéã.àu«2¢ˆr¬uFV6Çu“¿¢”∞¢f˜"Ü6ˆÁ7B∑&R¬&W“ˆb÷íB“BÁ&W∆6Rá&R¬&Wì∞†¢ÚÚVÊóG2Ú6˜VÁFW'0¢ÚÚ#2òàNä>ã~òéäﬁàr"”‚#2VÊóG2 ¢B“BÁ&W∆6RÇÚÖ∆B≤ï«2ÆòàNä>ã~òéäﬁàrˆví¬Ü“∆‚ì”ÊG∂Á“VÊóG6ì∞¢B“BÁ&W∆6RÇ˛òàNä>ã~òéäﬁàrˆví¬wVÊóBrì∞†¢ÚÚñb∆&V¬«&VGí6ˆÁFñÁ2‚WáG&'Ñ‚"˜"FÜí&V÷ÊÁG2¬6∆V‚FÜV“6fV«ê¢B“BÁ&W∆6RÇı«2º9u«2¢ˆr¬rÇrì∞†¢ÚÚñb7Fñ∆¬6ˆÁFñÁ2FÜí∆WGFW'2¬7G&óFÜV“'WB∂VWÁV÷&W'2˜7ñ÷&ˆ«2ˆ∆Fñ‚‡¢ñbÇıæàﬁõı“ÚÁFW7BáBíí∞¢B“BÁ&W∆6RÇıæàﬁõı“≤ˆr¬rríÁ&W∆6RÇı«7≥"«“ˆr¬rríÁG&ñ“Çì∞¢–†¢&WGW&‚BÁG&ñ“Çì∞ß–†††¢ÚÚ””””“7W7Fˆ÷W"6ˆÊfó&÷Fñˆ‚÷W76vRFV◊∆FW2Ö7WW"F÷ñ‚6ˆÊfñwW&&∆Rí””””–¶6ˆÁ7B5U5DÙ‘U%Ù4Ù‰dï$‘DîÙÂıDT’ƒDUÙ¥Uí“v7W7Fˆ÷W%ˆˆñÁF÷VÁEˆ6ˆÊfó&÷Fñˆ‚s∞¶6ˆÁ7BDTdT≈EÙ5U5DÙ‘U%Ù4Ù‰dï$‘DîÙÂıDT’ƒDU2“∞¢FÉ¢ä.ã~âûä.ãâûâûãâNäæäã.ä.âÆä>ãNàã.ä>òäﬁä>ò¿†§6ˆ∆GvñÊFf∆˜ró"6W'fñ6W0ÆòäﬁâNäãNâûà.äﬁäﬁâûãéàﬁã.â^ä.ã~âûä.ãâûä>ã.ä.ä^ãòäﬁã^ä.âNâûãâNäæäã.ä.âNãà~âûã^òûàNòéã †Ø	˘H‚òä^à.à~ã.âì¢∑∂&ˆˆ∂ñÊuˆ6ˆFW◊–Ø	˘Irâ^ãNâNâ^ã.ääÆânã.âûãà~ã.âì¢∑∑G&6∂ñÊu˜W&«◊–Ø	˘BàÆã~òéäﬁä^ãûààNòûã#¢∑∂7W7Fˆ÷W%ˆÊ÷W◊–Ø	˘9‚òâÆäﬁä>òŒò.â~ä3¢∑∂7W7Fˆ÷W%˜ÜˆÊW◊–Ø	˘8Rä~ãâûòä^ãòä~ä^ã.âûãâC¢∑∂ˆñÁF÷VÁE˜Fá◊–Ø	˙{‚âæä>ãòäâ~à~ã.âì¢∑∂¶ˆ%˜GóW◊–Ø	¯˙äÆânã.âûâ~ã^òéâÆä>ãNàã.ä3¢∑∂FG&W75˜FWáG◊–†Ø	˙{‚ä>ã.ä.àã.ä>âÆä>ãNàã.ä3†ß∑∂óFV◊5˜FWáG◊–†Ø	˘+"ä.äﬁâNàÆã>ä>ãäÆãéâ~âéãC¢∑∂¶ˆ%˜&ñ6U˜Fá◊“âÆã.âp†Æäæäã.ä.òäæâ^ãÉ¢àòéäﬁâûàÆòéã.à~òà.òûã.äæâûòûã.à~ã.âíàéãäã^àÆòéã.à~â^ãNâNâ^òéäﬁò.â~ä>ä.ã~âûä.ãâûâûãâNäæäã.ä.äﬁã^ààNä>ãòûàrä>âÆàä~âûä^ãûààNòûã.ä>ãâÆäÆã.ä.â^ã.äòâÆäﬁä>òŒâ~ã^òéòàéòûà~òNä~òíòâÓã~òéäﬁò>äæòûâ~ã^äà~ã.âûòà.òûã.âÆä>ãNàã.ä>òNâNòûâ^ä>à~òä~ä^ã.òä^ãòNäòéâ^àäæä^òéâûâûãàNã †Æà.äﬁâÆàNãéâ>àNòéã §6ˆ∆GvñÊFf∆˜ró"6W'fñ6W0§ƒî‰RÙ¢7vfó Æò.â~ä3¢ìÇ”Ésr”s3#¿¢V„¢6W'fñ6RˆñÁF÷VÁB6ˆÊfó&÷Fñˆ‡†§6ˆ∆GvñÊFf∆˜ró"6W'fñ6W0§˜W"F÷ñ‚FV“v˜V∆B∆ñ∂RFÚ6ˆÊfó&“ñ˜W"ˆñÁF÷VÁBFWFñ«3††Ø	˘H‚¶ˆ"ÊÚ„¢∑∂&ˆˆ∂ñÊuˆ6ˆFW◊–Ø	˘IrG&6≥¢∑∑G&6∂ñÊu˜W&«◊–Ø	˘8“7W7Fˆ÷W#¢∑∂7W7Fˆ÷W%ˆÊ÷W◊–Ø	˘9‚ÜˆÊS¢∑∂7W7Fˆ÷W%˜ÜˆÊW◊–Ø	˘8RˆñÁF÷VÁC¢∑∂ˆñÁF÷VÁEˆVÁ◊–Ø	˙{‚¶ˆ"GóS¢∑∂¶ˆ%˜GóUˆVÁ◊–Ø	¯˙FG&W73¢∑∂FG&W75˜FWáG◊–†Ø	˙{‚óFV◊3†ß∑∂óFV◊5˜FWáEˆVÁ◊–†Ø	˘+"ÊWBF˜F√¢∑∂¶ˆ%˜&ñ6UˆVÁ◊“DÑ †§Ê˜FS¢&Vf˜&R'&ófñÊrBFÜR¶ˆ"6óFR¬˜W"FV6ÜÊñ6ñ‚vñ∆¬6∆¬FÚ&V6ˆÊfó&“FÜRˆñÁF÷VÁB‚∆V6R∂ñÊF«íÁ7vW"FÜR6∆¬6Ú˜W"FV“6‚&˜fñFR6W'fñ6Rˆ‚Fñ÷R‡†•FÜÊ≤ñ˜R‡§6ˆ∆GvñÊFf∆˜ró"6W'fñ6W0§ƒî‰RÙ¢7vfó §6∆√¢ìÇ”Ésr”s3# ß”∞¶6ˆÁ7B5U5DÙ‘U%Ù4Ù‰dï$‘DîÙÂıƒ4TÑÙƒDU%2“∞¢v&ˆˆ∂ñÊuˆ6ˆFRr¬wG&6∂ñÊu˜W&¬r¬v7W7Fˆ÷W%ˆÊ÷Rr¬v7W7Fˆ÷W%˜ÜˆÊRr¬vˆñÁF÷VÁE˜FÇr¬vˆñÁF÷VÁEˆV‚r¬v¶ˆ%˜GóRr¬v¶ˆ%˜GóUˆV‚r¬vFG&W75˜FWáBr¬vóFV◊5˜FWáBr¬vóFV◊5˜FWáEˆV‚r¬v¶ˆ%˜&ñ6U˜FÇr¬v¶ˆ%˜&ñ6UˆV‚p•”∞¶6ˆÁ7B5U5DÙ‘U%Ù4Ù‰dï$‘DîÙÂı$UTï$TEıƒ4TÑÙƒDU%2“∞¢FÉ¢≤v&ˆˆ∂ñÊuˆ6ˆFRr¬wG&6∂ñÊu˜W&¬r¬v7W7Fˆ÷W%ˆÊ÷Rr¬v7W7Fˆ÷W%˜ÜˆÊRr¬vˆñÁF÷VÁE˜FÇr¬v¶ˆ%˜GóRr¬vFG&W75˜FWáBr¬vóFV◊5˜FWáBr¬v¶ˆ%˜&ñ6U˜FÇu“¿¢V„¢≤v&ˆˆ∂ñÊuˆ6ˆFRr¬wG&6∂ñÊu˜W&¬r¬v7W7Fˆ÷W%ˆÊ÷Rr¬v7W7Fˆ÷W%˜ÜˆÊRr¬vˆñÁF÷VÁEˆV‚r¬v¶ˆ%˜GóUˆV‚r¬vFG&W75˜FWáBr¬vóFV◊5˜FWáEˆV‚r¬v¶ˆ%˜&ñ6UˆV‚u“¿ß”∞¶gVÊ7Fñˆ‚÷ó76ñÊt7W7Fˆ÷W$6ˆÊfó&÷FñˆÂ∆6VÜˆ∆FW'2áFV◊∆FUFWáB¬∆Ês“wFÇrí∞¢6ˆÁ7B∆Êr“7G&ñÊrÜ∆Êr«¬wFÇríÁFÙ∆˜vW$66RÇí””“vV‚rÚvV‚r¢wFÇs∞¢6ˆÁ7BGáB“7G&ñÊráFV◊∆FUFWáB«¬rrì∞¢&WGW&‚Ñ5U5DÙ‘U%Ù4Ù‰dï$‘DîÙÂı$UTï$TEıƒ4TÑÙƒDU%5∂∆Êu“«¬5U5DÙ‘U%Ù4Ù‰dï$‘DîÙÂı$UTï$TEıƒ4TÑÙƒDU%2ÁFÇê¢Êfñ«FW"ÇÜ≤í”‚GáBÊñÊ6«VFW2Ü∑≤G∂∑◊◊÷íì∞ß–¶7ñÊ2gVÊ7Fñˆ‚VÁ7W&T7W7Fˆ÷W$÷W76vUFV◊∆FW5F&∆RÇí∞¢vóBˆˆ¬ÁVW'íÜ ¢5$TDRD$ƒRîb‰ıBUÑï5E2V&∆ñ2Ê7W7Fˆ÷W%ˆ÷W76vU˜FV◊∆FW2Ä¢FV◊∆FUˆ∂WíDUÖB‰ıBÂTƒ¬¿¢∆ÊrDUÖB‰ıBÂTƒ¬DTdT≈BwFÇr¿¢FV◊∆FU˜FWáBDUÖB‰ıBÂTƒ¬¿¢VÊ&∆VB$ÙÙƒT‚‰ıBÂTƒ¬DTdT≈BE%TR¿¢WFFVEˆ'íDUÖB¿¢WFFVEˆBDî‘U5D’E¢‰ıBÂTƒ¬DTdT≈B‰ırÇí¿¢$î‘%í¥UíáFV◊∆FUˆ∂Wí¬∆Êrê¢ê¢ì∞¢vóBˆˆ¬ÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2Ê7W7Fˆ÷W%ˆ÷W76vU˜FV◊∆FW2áFV◊∆FUˆ∂Wí¬∆Êr¬FV◊∆FU˜FWáB¬VÊ&∆VB¬WFFVEˆBê¢d≈TU2ÇC¬wFÇr¬C"≈E%TRƒ‰ırÇíí¬ÇC¬vV‚r¬C2≈E%TRƒ‰ırÇíê¢Ù‚4Ù‰dƒî5BáFV◊∆FUˆ∂Wí¬∆ÊríDÚ‰ıDÑî‰v¿¢¥5U5DÙ‘U%Ù4Ù‰dï$‘DîÙÂıDT’ƒDUÙ¥Uí¬DTdT≈EÙ5U5DÙ‘U%Ù4Ù‰dï$‘DîÙÂıDT’ƒDU2ÁFÇ¬DTdT≈EÙ5U5DÙ‘U%Ù4Ù‰dï$‘DîÙÂıDT’ƒDU2ÊVÂ–¢ì∞ß–¶gVÊ7Fñˆ‚˜6fT◊6uFWáBáb¬f∆∆&6≥“r“rí∞¢6ˆÁ7BB“7G&ñÊrábÛÚrríÁG&ñ“Çì∞¢&WGW&‚B«¬f∆∆&6≥∞ß–¶gVÊ7Fñˆ‚ˆf˜&÷D÷ˆÊWì"Ü‚í∞¢6ˆÁ7BÇ“ÁV÷&W"Ü‚«¬ì∞¢&WGW&‚ÁV÷&W"Êó4fñÊóFRáÇíÚÇÁFÙfóÜVBÉ"í¢s„s∞ß–¶gVÊ7Fñˆ‚ˆf˜&÷D÷ˆÊWî◊6rÜ‚í∞¢6ˆÁ7BÇ“ÁV÷&W"Ü‚«¬ì∞¢ñbÇÁV÷&W"Êó4fñÊóFRáÇíí&WGW&‚ss∞¢&WGW&‚ÁV÷&W"Êó4ñÁFVvW"áÇíÚ7G&ñÊráÇí¢ÇÁFÙfóÜVBÉ"ì∞ß–¶7ñÊ2gVÊ7Fñˆ‚vWD7W7Fˆ÷W$6ˆÊfó&÷FñˆÂFV◊∆FRÜ∆Ês“wFÇrí∞¢6ˆÁ7B∂Wí“5U5DÙ‘U%Ù4Ù‰dï$‘DîÙÂıDT’ƒDUÙ¥Uì∞¢6ˆÁ7B∆Êr“7G&ñÊrÜ∆Êr«¬wFÇríÁFÙ∆˜vW$66RÇí””“vV‚rÚvV‚r¢wFÇs∞¢G'í∞¢vóBVÁ7W&T7W7Fˆ÷W$÷W76vUFV◊∆FW5F&∆RÇì∞¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BFV◊∆FU˜FWáBe$Ù“V&∆ñ2Ê7W7Fˆ÷W%ˆ÷W76vU˜FV◊∆FW2tÑU$RFV◊∆FUˆ∂Wì“C‰B∆Ês“C"‰BVÊ&∆VC’E%TRƒî‘ïB¿¢∂∂Wí¬∆Êu–¢ì∞¢6ˆÁ7BG¬“7G&ñÊrá"Á&˜w3ÚÂ≥”ÚÁFV◊∆FU˜FWáB«¬rríÁG&ñ“Çì∞¢ñbáG¬í&WGW&‚G√∞¢“6F6ÇÜRí∞¢G'í≤6ˆÁ6ˆ∆RÁv&‚Çu∂7W7Fˆ÷W%˜FV◊∆FU“∆ˆBf∆∆&6≥¢r¬RÊ÷W76vRì≤“6F6Ç∑–¢–¢&WGW&‚DTdT≈EÙ5U5DÙ‘U%Ù4Ù‰dï$‘DîÙÂıDT’ƒDU5∂∆Êu“«¬DTdT≈EÙ5U5DÙ‘U%Ù4Ù‰dï$‘DîÙÂıDT’ƒDU2ÁFÉ∞ß–¶gVÊ7Fñˆ‚&VÊFW$7W7Fˆ÷W$6ˆÊfó&÷FñˆÂFV◊∆FRáFV◊∆FR¬f'2í∞¢∆WB˜WB“7G&ñÊráFV◊∆FR«¬rrì∞¢6ˆÁ7BW66U&VtWá“áf«VRí”‚7G&ñÊráf«VR«¬rríÁ&W∆6RÇı≤‚¢≥ı‚G∑“Çó≈µ≈’≈≈“ˆr¬u≈¬Bbrì∞¢f˜"Ü6ˆÁ7B∂≤¬e“ˆbˆ&¶V7BÊVÁG&ñW2áf'2«¬∑“íí∞¢6ˆÁ7B&R“ÊWr&VtWáÜ∑µ≈«2¢G∂W66U&VtWáÜ≤ó’≈«2ß◊÷¬vrrì∞¢˜WB“˜WBÁ&W∆6Rá&R¬7G&ñÊrábÛÚrríì∞¢–¢ÚÚ∂VWVÊ∂Ê˜v‚∆6VÜˆ∆FW'2fó6ñ&∆Rf˜"7WW"F÷ñ‚FV'VvvñÊr¬'WB&V÷˜fR66ñFVÁF¬VÊFVfñÊVBˆÁV∆¬FWáB‡¢&WGW&‚˜WBÁ&W∆6RÇ˜VÊFVfñÊVG∆ÁV∆¬ˆr¬r“ríÁG&ñ“Çì∞ß–¶gVÊ7Fñˆ‚'Vñ∆D7W7Fˆ÷W$6ˆÊfó&÷FñˆÂf'2á≤¶ˆ"¬óFV◊2¬˜&ñvñ‚¬FEDÇ¬GEDÇ¬FDT‚¬GDT‚“í∞¢6ˆÁ7B&ˆˆ∂ñÊr“˜6fT◊6uFWáBÜ¶ˆ"Ê&ˆˆ∂ñÊuˆ6ˆFR«¬Ü¶ˆ"Ê¶ˆ%ˆñBÚ2G∂¶ˆ"Ê¶ˆ%ˆñG÷¢r“ríì∞¢6ˆÁ7B&ˆ÷Ù∆ñÊW5DÇ“ÜóBí”‚∞¢6ˆÁ7BVÊóB“ÁV÷&W"ÜóBÁVÊóE˜&ñ6R«¬ì∞¢6ˆÁ7BÊ˜&÷¬“ÁV÷&W"ÜóBÊÊ˜&÷≈˜VÊóE˜&ñ6R«¬ì∞¢6ˆÁ7B6˜W&6R“7G&ñÊrÜóBÊ7W7Fˆ÷W%˜&ñ6U˜6˜W&6R«¬óBÁ&ñ6ñÊu˜6˜W&6R«¬rríÁG&ñ“Çì∞¢6ˆÁ7Bó4˜fW'&ñFR“6˜W&6R””“v÷ÁV≈ˆ˜fW'&ñFRr«¬ˆ˜fW'&ñFRˆíÁFW7BÖ7G&ñÊrÜóBÊóFV’ˆÊ÷R«¬rríì∞¢ñbÜó4˜fW'&ñFRí&WGW&‚≤rä>ã.àNã.âÓãNòäéäûòàûâÓã.ãà~ã.âûâûã^òíu”∞¢6ˆÁ7B6◊ñv‚“7G&ñÊrÜóBÊ7W7Fˆ÷W%ˆ6◊ñvÂˆÊ÷R«¬óBÊ6◊ñvÂˆÊ÷R«¬óBÊ7W7Fˆ÷W%˜&ñ6Uˆ∆&V¬«¬óBÊFó7∆ïˆ∆&V¬«¬rríÁG&ñ“Çì∞¢ñbÇá6˜W&6R””“v7W7Fˆ÷W%˜6W'fñ6U˜&ñ6U˜'V∆W2rbb6◊ñv‚bbÊ˜&÷¬‚VÊóBbbVÊóB‚íí&WGW&‚µ”∞¢&WGW&‚∞¢	¯˚~˚àÚä>ã.àNã.ò.âæä3¢Gµ˜6fT◊6uFWáBÜ6◊ñv‚ó÷¿¢ä>ã.àNã.âæàâ^ãBGµˆf˜&÷D÷ˆÊWî◊6rÜÊ˜&÷¬ó“âÆã.âr(i"ä>ã.àNã.ò.âæä2Gµˆf˜&÷D÷ˆÊWî◊6ráVÊóBó“âÆã.âv¿¢”∞¢”∞¢6ˆÁ7B&ˆ÷Ù∆ñÊW4T‚“ÜóBí”‚∞¢6ˆÁ7BVÊóB“ÁV÷&W"ÜóBÁVÊóE˜&ñ6R«¬ì∞¢6ˆÁ7BÊ˜&÷¬“ÁV÷&W"ÜóBÊÊ˜&÷≈˜VÊóE˜&ñ6R«¬ì∞¢6ˆÁ7B6˜W&6R“7G&ñÊrÜóBÊ7W7Fˆ÷W%˜&ñ6U˜6˜W&6R«¬óBÁ&ñ6ñÊu˜6˜W&6R«¬rríÁG&ñ“Çì∞¢6ˆÁ7Bó4˜fW'&ñFR“6˜W&6R””“v÷ÁV≈ˆ˜fW'&ñFRr«¬ˆ˜fW'&ñFRˆíÁFW7BÖ7G&ñÊrÜóBÊóFV’ˆÊ÷R«¬rríì∞¢ñbÜó4˜fW'&ñFRí&WGW&‚≤r7V6ñ¬&ñ6Rf˜"FÜó2¶ˆ"ˆÊ«íu”∞¢6ˆÁ7B6◊ñv‚“7G&ñÊrÜóBÊ7W7Fˆ÷W%ˆ6◊ñvÂˆÊ÷R«¬óBÊ6◊ñvÂˆÊ÷R«¬óBÊ7W7Fˆ÷W%˜&ñ6Uˆ∆&V¬«¬óBÊFó7∆ïˆ∆&V¬«¬rríÁG&ñ“Çì∞¢ñbÇá6˜W&6R””“v7W7Fˆ÷W%˜6W'fñ6U˜&ñ6U˜'V∆W2rbb6◊ñv‚bbÊ˜&÷¬‚VÊóBbbVÊóB‚íí&WGW&‚µ”∞¢&WGW&‚∞¢&ˆ÷Ú&ñ6S¢Gµ˜6fT◊6uFWáBÜ6◊ñv‚ó÷¿¢Ê˜&÷¬Gµˆf˜&÷D÷ˆÊWî◊6rÜÊ˜&÷¬ó“DÑ"(i"&ˆ÷ÚGµˆf˜&÷D÷ˆÊWî◊6ráVÊóBó“DÑ&¿¢”∞¢”∞¢6ˆÁ7BóFV’&˜w2“ÜóFV◊2«¬µ“íÊ÷ÇÜóBí”‚∞¢6ˆÁ7BGí“ÁV÷&W"ÜóBÁGí«¬ì∞¢6ˆÁ7BW“ÁV÷&W"ÜóBÁVÊóE˜&ñ6R«¬ì∞¢6ˆÁ7B«B“ÁV÷&W"ÜóBÊ∆ñÊU˜F˜F¬«¬ì∞¢&WGW&‚∞¢“Gµ˜6fT◊6uFWáBÜóBÊóFV’ˆÊ÷Ró“ÇG∑Gó“Gµˆf˜&÷D÷ˆÊWî◊6ráWó“âÆã.âr“Gµˆf˜&÷D÷ˆÊWî◊6rÜ«Bó“âÆã.âv¿¢‚‚Á&ˆ÷Ù∆ñÊW5DÇÜóBí¿¢“Ê¶ˆñ‚Çu∆‚rì∞¢“ì∞¢6ˆÁ7BóFV’&˜w4T‚“ÜóFV◊2«¬µ“íÊ÷ÇÜóBí”‚∞¢6ˆÁ7BGí“ÁV÷&W"ÜóBÁGí«¬ì∞¢6ˆÁ7BW“ÁV÷&W"ÜóBÁVÊóE˜&ñ6R«¬ì∞¢6ˆÁ7B«B“ÁV÷&W"ÜóBÊ∆ñÊU˜F˜F¬«¬ì∞¢&WGW&‚∞¢“G∑G&Á6∆FU6W'fñ6TóFV‘Ê÷TT‚ÜóBÊóFV’ˆÊ÷Ró“ÇG∑Gó“Gµˆf˜&÷D÷ˆÊWî◊6ráWó“DÑ"“Gµˆf˜&÷D÷ˆÊWî◊6rÜ«Bó“DÑ&¿¢‚‚Á&ˆ÷Ù∆ñÊW4T‚ÜóBí¿¢“Ê¶ˆñ‚Çu∆‚rì∞¢“ì∞¢ÚÚFÜRˆffñ6ñ¬G&6∂ñÊr∆ñÊ≤◊W7B6''íFÜR∆ˆÊr&ÊFˆ“&ˆˆ∂ñÊu˜Fˆ∂V‚vÜV‚FÜP¢ÚÚ¶ˆ"Ü2ˆÊR¬6ÚFÜR7W7Fˆ÷W"˜VÊñÊróBg&ˆ“FÜR6ˆÊfó&÷Fñˆ‚÷W76vRvWG0¢ÚÚeTƒ¬áFˆ∂V‚í66W72‚FÜR6Ü˜'B&ˆˆ∂ñÊuˆ6ˆFRˆÊ«íññV∆G2∆ñ÷óFVB˜&VF7FV@¢ÚÚFFgFW"FÜRG&6∂ñÊr◊&óf7í6ÜÊvR‚FÜRfó6ñ&∆R¶ˆ"ÁV÷&W"&V∆˜r7Fó0¢ÚÚ&ˆˆ∂ñÊuˆ6ˆFS≤FÜRFˆ∂V‚ó2W6VB6ˆ∆V«í2FÜRU$¬7&VFVÁFñ¬ÊBó2ÊWfW ¢ÚÚ&VÊFW&VB2fó6ñ&∆RFWáB˜"∆ˆvvVB‡¢6ˆÁ7BG&6∂ñÊt7&VFVÁFñ¬“7G&ñÊrÜ¶ˆ"Ê&ˆˆ∂ñÊu˜Fˆ∂V‚«¬rríÁG&ñ“Çí«¬7G&ñÊrÜ¶ˆ"Ê&ˆˆ∂ñÊuˆ6ˆFR«¬rrí«¬7G&ñÊrÜ¶ˆ"Ê¶ˆ%ˆñB«¬rrì∞¢&WGW&‚∞¢&ˆˆ∂ñÊuˆ6ˆFS¢&ˆˆ∂ñÊr¿¢ÚÚˆffñ6ñ¬6ˆÊfó&÷Fñˆ‚∆ñÊ≤˜VÁ2FÜR7W7Fˆ÷W"c"G&6∂ñÊr67&VV‚vóFÄ¢ÚÚFÜR7&VFVÁFñ¬ñ‚FÜRU$¬e$t‘TÂBÜgFW"2í¬vÜñ6Ç'&˜w6W'2ÊWfW"6VÊBF¢ÚÚFÜR6W'fW"ÜÊÚ66W72∆ˆw2¬ÊÚ&VfW&W"∆V≤í‚FÜR&ˆ˜B&VG2óBg&ˆ–¢ÚÚ∆ˆ6Fñˆ‚ÊÜ6Ç¬FÜV‚67'V'2FÜRU$¬FÚ6∆V‚7G&6∂ñÊr‚∆Vv7ê¢ÚÚ˜“‚‚‚7G&6∂ñÊr∆ñÊ∑27Fñ∆¬v˜&≤ÊB&R«6Ú67'V&&VBˆ‚&ˆ˜B‡¢ÚÚFÜR7&VFVÁFñ¬6V∆V7Fñˆ‚&˜fRó2VÊ6ÜÊvVC¢&ˆˆ∂ñÊu˜Fˆ∂V‚vÜV‚&W6VÁ@¢ÚÚÜgV∆¬66W72í¬ÊWfW"&VÊFW&VB2fó6ñ&∆RFWáB˜"∆ˆvvVB‚∆Vv7íG&6≤ÊáF÷¿¢ÚÚó2ñÁFVÁFñˆÊ∆«í∆VgBñ‚∆6Rf˜"&ˆ∆∆&6≤‡¢G&6∂ñÊu˜W&√¢G∂˜&ñvñÁ“ˆ7W7Fˆ÷W"÷ˆñÊFWÇÊáF÷¬7G&6∂ñÊs˜“G∂VÊ6ˆFUU$î6ˆ◊ˆÊVÁBáG&6∂ñÊt7&VFVÁFñ¬ó÷¿¢7W7Fˆ÷W%ˆÊ÷S¢˜6fT◊6uFWáBÜ¶ˆ"Ê7W7Fˆ÷W%ˆÊ÷Rí¿¢7W7Fˆ÷W%˜ÜˆÊS¢˜6fT◊6uFWáBÜ¶ˆ"Ê7W7Fˆ÷W%˜ÜˆÊRí¿¢ˆñÁF÷VÁE˜FÉ¢G∂FEDá“òä~ä^ã"G∑GEDá“âíÊ¿¢ˆñÁF÷VÁEˆV„¢G∂FDTÁ“G∑GDTÁ÷¿¢¶ˆ%˜GóS¢˜6fT◊6uFWáBÜ¶ˆ"Ê¶ˆ%˜GóRí¿¢¶ˆ%˜GóUˆV„¢G&Á6∆FT¶ˆ%GóTT‚Ü¶ˆ"Ê¶ˆ%˜GóRí¿¢FG&W75˜FWáC¢˜6fT◊6uFWáBÜ¶ˆ"ÊFG&W75˜FWáBí¿¢óFV◊5˜FWáC¢óFV’&˜w2Ê∆VÊwFÇÚóFV’&˜w2Ê¶ˆñ‚Çu∆‚rí¢r“éòNäòéäã^ä>ã.ä.àã.ä2ír¿¢óFV◊5˜FWáEˆV„¢óFV’&˜w4T‚Ê∆VÊwFÇÚóFV’&˜w4T‚Ê¶ˆñ‚Çu∆‚rí¢r“ÜÊÚóFV◊2ír¿¢¶ˆ%˜&ñ6U˜FÉ¢ˆf˜&÷D÷ˆÊWì"Ü¶ˆ"Ê¶ˆ%˜&ñ6Rí¿¢¶ˆ%˜&ñ6UˆV„¢ˆf˜&÷D÷ˆÊWì"Ü¶ˆ"Ê¶ˆ%˜&ñ6Rí¿¢”∞ß–†¶ÊvWBÇ"ˆ¶ˆ'2Û¶¶ˆ%ˆñB˜7V÷÷'í"¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B≤¶ˆ%ˆñB““&WÁ&◊3∞¢6ˆÁ7B∆Êr“7G&ñÊrá&WÁVW'íÊ∆Êr«¬wFÇríÁFÙ∆˜vW$66RÇì∞†¢G'í∞¢6ˆÁ7B¶ˆ%"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5B¶ˆ%ˆñB¬&ˆˆ∂ñÊuˆ6ˆFR¬&ˆˆ∂ñÊu˜Fˆ∂V‚¬7W7Fˆ÷W%ˆÊ÷R¬7W7Fˆ÷W%˜ÜˆÊR¬ˆñÁF÷VÁEˆFFWFñ÷R¬FG&W75˜FWáB¬¶ˆ%˜GóR¬¶ˆ%˜&ñ6P¢e$Ù“V&∆ñ2Ê¶ˆ'2tÑU$R¶ˆ%ˆñC“C¿¢∂¶ˆ%ˆñE–¢ì∞¢ñbÜ¶ˆ%"Á&˜w2Ê∆VÊwFÇ””“í&WGW&‚&W2Á7FGW2ÉCBíÊß6ˆ‚á≤W'&˜#¢.òNäòéâÓâÆà~ã.âí"“ì∞†¢6ˆÁ7B¶ˆ"“¶ˆ%"Á&˜w5≥”∞†¢ÚÚ)»Rò>àÆòûâ~ã>ä^ãNà~àò¬G&6∂ñÊrò>äæòûä^ãûààNòûã"éò>àÆòí&ˆˆ∂ñÊu˜Fˆ∂V‚òâæò~âí7&VFVÁFñ¬òäã~òéäﬁäãRê¢6ˆÁ7B˜&ñvñ‚“G∑&WÁ&˜Fˆ6ˆ«”¢ÚÚG∑&WÊvWBÇ&Ü˜7B"ó÷∞†¢∆WBóFV◊5#∞¢G'í∞¢óFV◊5"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BóFV’ˆÊ÷R¬Gí¬VÊóE˜&ñ6R¬∆ñÊU˜F˜F¬¿¢Ê˜&÷≈˜VÊóE˜&ñ6R¬7W7Fˆ÷W%˜&ñ6Uˆ∆&V¬¬7W7Fˆ÷W%ˆ6◊ñvÂˆÊ÷R¬7W7Fˆ÷W%˜&ñ6U˜6˜W&6P¢e$Ù“V&∆ñ2Ê¶ˆ%ˆóFV◊2tÑU$R¶ˆ%ˆñC“Cı$DU"%í¶ˆ%ˆóFV’ˆñB46¿¢∂¶ˆ%ˆñE–¢ì∞¢“6F6ÇÜRí∞¢ñbÖ7G&ñÊrÜRÊ6ˆFR«¬rrí”“sC#s2ríFá&˜rS∞¢óFV◊5"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BóFV’ˆÊ÷R¬Gí¬VÊóE˜&ñ6R¬∆ñÊU˜F˜F¬e$Ù“V&∆ñ2Ê¶ˆ%ˆóFV◊2tÑU$R¶ˆ%ˆñC“Cı$DU"%í¶ˆ%ˆóFV’ˆñB46¿¢∂¶ˆ%ˆñE–¢ì∞¢–†¢6ˆÁ7BGB“ÊWrFFRÜ¶ˆ"ÊˆñÁF÷VÁEˆFFWFñ÷Rì∞¢6ˆÁ7BFEDÇ“GBÁFÙ∆ˆ6∆TFFU7G&ñÊrÇ'FÇ’DÇ"¬≤Fñ÷U¶ˆÊS¢$6ñÙ&Êv∂ˆ≤"“ì∞¢6ˆÁ7BGEDÇ“GBÁFÙ∆ˆ6∆UFñ÷U7G&ñÊrÇ'FÇ’DÇ"¬≤Fñ÷U¶ˆÊS¢$6ñÙ&Êv∂ˆ≤"¬Ü˜W#¢#"÷FñvóB"¬÷ñÁWFS¢#"÷FñvóB"“ì∞¢6ˆÁ7BFDT‚“GBÁFÙ∆ˆ6∆TFFU7G&ñÊrÇ&V‚‘t""¬≤Fñ÷U¶ˆÊS¢$6ñÙ&Êv∂ˆ≤"“ì∞¢6ˆÁ7BGDT‚“GBÁFÙ∆ˆ6∆UFñ÷U7G&ñÊrÇ&V‚‘t""¬≤Fñ÷U¶ˆÊS¢$6ñÙ&Êv∂ˆ≤"¬Ü˜W#¢#"÷FñvóB"¬÷ñÁWFS¢#"÷FñvóB"“ì∞†¢6ˆÁ7Bf'2“'Vñ∆D7W7Fˆ÷W$6ˆÊfó&÷FñˆÂf'2á∞¢¶ˆ"¿¢óFV◊3¢óFV◊5"Á&˜w2¿¢˜&ñvñ‚¿¢FEDÇ¿¢GEDÇ¿¢FDT‚¿¢GDT‚¿¢“ì∞†¢6ˆÁ7BFV◊∆FR“vóBvWD7W7Fˆ÷W$6ˆÊfó&÷FñˆÂFV◊∆FRÜ∆Êrì∞¢6ˆÁ7BFWáB“&VÊFW$7W7Fˆ÷W$6ˆÊfó&÷FñˆÂFV◊∆FRáFV◊∆FR¬f'2ì∞††¢&W2Êß6ˆ‚á≤FWáB“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.äÆä>òûã.à~à.òûäﬁàNä~ã.ääÆä>ãéâæòNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞†¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ)»RÙddU%0¢ÚÚ””””””””””””””””””””””””””””””””””””””–††¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	˘IBFV6ÜÊñ6ñ‚vV"W6ÇÜV«W'2Ü&W7B÷Vff˜'Bê¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶gVÊ7Fñˆ‚˜W6Ö&VGíÇí∞¢&WGW&‚&ˆˆ∆V‚ÖtT%ıU4Öı$TEíbbvV'W6Çì∞ß–†¶gVÊ7Fñˆ‚˜6fUW6ÖW&¬áW&¬í∞¢6ˆÁ7B&r“7G&ñÊráW&¬«¬rríÁG&ñ“Çì∞¢ñbÇ&rí&WGW&‚r˜FV6ÇÊáF÷¬s∞¢ÚÚ∂VWÊ˜Fñfñ6FñˆÁ2ˆ‚FÜó2˜&ñvñ‚ˆÊ«í‡¢ñbá&rÁ7F'G5vóFÇÇrÚríí&WGW&‚&s∞¢G'í∞¢6ˆÁ7BR“ÊWrU$¬á&rì∞¢&WGW&‚RÊ˜&ñvñ‚””“áGG3¢ÚÚG∑RÊÜ˜7G÷bbRÁFÜÊ÷RÚG∑RÁFÜÊ÷W“G∑RÁ6V&6Ç«¬rw÷¢r˜FV6ÇÊáF÷¬s∞¢“6F6Ç∞¢&WGW&‚r˜FV6ÇÊáF÷¬s∞¢–ß–†¶gVÊ7Fñˆ‚˜6Ü˜'D¶ˆ%FWáBÜ¶ˆ"í∞¢6ˆÁ7BßB“7G&ñÊrÜ¶ˆ#ÚÊ¶ˆ%˜GóR«¬~à~ã.âûò>äæäòÇríÁG&ñ“Çì∞¢6ˆÁ7B¶ˆÊR“7G&ñÊrÜ¶ˆ#ÚÊ¶ˆ%˜¶ˆÊR«¬rríÁG&ñ“Çì∞¢6ˆÁ7BvÜV‚“¶ˆ#ÚÊˆñÁF÷VÁEˆFFWFñ÷RÚÇÇí”‚∞¢G'í≤&WGW&‚ÊWrFFRÜ¶ˆ"ÊˆñÁF÷VÁEˆFFWFñ÷RíÁFÙ∆ˆ6∆U7G&ñÊrÇwFÇ’DÇr¬≤Fñ÷U¶ˆÊS¢t6ñÙ&Êv∂ˆ≤r¬Fì¢s"÷FñvóBr¬÷ˆÁFÉ¢w6Ü˜'Br¬Ü˜W#¢s"÷FñvóBr¬÷ñÁWFS¢s"÷FñvóBr“ì≤“6F6Ç≤&WGW&‚rs≤–¢“íÇí¢rs∞¢&WGW&‚∂ßB¬vÜV‚¬¶ˆÊU“Êfñ«FW"Ñ&ˆˆ∆V‚íÊ¶ˆñ‚Çr(
"rì∞ß–†¶7ñÊ2gVÊ7Fñˆ‚˜6VÊEW6ÖFıFV6ÜÊñ6ñ‚áW6W&Ê÷R¬ñ∆ˆB“∑“í∞¢6ˆÁ7BFV6Ç“7G&ñÊráW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢ñbÇFV6Ç«¬˜W6Ö&VGíÇíí&WGW&‚≤GFV◊FVC¢¬6VÁC¢¬Fó6&∆VC¢G'VR”∞†¢6ˆÁ7B“vóBˆˆ¬ÁVW'íÄ¢4TƒT5B7V'67&óFñˆÂˆñB¬VÊGˆñÁB¬#SfFÇ¬WFÄ¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜W6Ö˜7V'67&óFñˆÁ0¢tÑU$RFV6ÜÊñ6ñÂ˜W6W&Ê÷S“C‰Bó5ˆ7FófS’E%TP¢ı$DU"%íWFFVEˆBDU40¢ƒî‘ïB¿¢∑FV6Ö–¢ì∞¢6ˆÁ7B&˜w2“Á&˜w2«¬µ”∞¢∆WB6VÁB“∞¢f˜"Ü6ˆÁ7B"ˆb&˜w2í∞¢6ˆÁ7B7V"“∞¢VÊGˆñÁC¢"ÊVÊGˆñÁB¿¢∂Wó3¢≤#SfFÉ¢"Á#SfFÇ¬WFÉ¢"ÊWFÇ–¢”∞¢G'í∞¢vóBvV'W6ÇÁ6VÊDÊ˜Fñfñ6Fñˆ‚á7V"¬•4Ù‚Á7G&ñÊvñgíá∞¢FóF∆S¢ñ∆ˆBÁFóF∆R«¬t5tbäã^à~ã.âûò>äæäòÇr¿¢&ˆGì¢ñ∆ˆBÊ&ˆGí«¬~äã^à~ã.âûò>äæäòéòà.òûã.äã"àä>ãéâ>ã.òâæãNâNòäﬁâÓòâÓã~òéäﬁâ^ä>ä~àéäÆäﬁâ¢r¿¢W&√¢˜6fUW6ÖW&¬áñ∆ˆBÁW&¬«¬r˜FV6ÇÊáF÷¬rí¿¢Fs¢ñ∆ˆBÁFr«¬7vb÷¶ˆ"“G∑ñ∆ˆBÊ¶ˆ%ˆñB«¬FFRÊÊ˜rÇó÷¿¢¶ˆ%ˆñC¢ñ∆ˆBÊ¶ˆ%ˆñB«¬ÁV∆¬¿¢∂ñÊC¢ñ∆ˆBÊ∂ñÊB«¬v¶ˆ"p¢“íì∞¢6VÁB≥“∞¢“6F6ÇÜRí∞¢6ˆÁ7B6ˆFR“ÁV÷&W"ÜSÚÁ7FGW46ˆFR«¬SÚÁ7FGW2«¬ì∞¢6ˆÁ6ˆ∆RÁv&‚Çu∑vV'W6Ö“6VÊBfñ∆VBr¬≤FV6Ç¬7V'67&óFñˆÂˆñC¢"Á7V'67&óFñˆÂˆñB¬6ˆFR¬÷W76vS¢SÚÊ÷W76vR“ì∞¢ñbÜ6ˆFR””“CB«¬6ˆFR””“Cí∞¢G'í∞¢vóBˆˆ¬ÁVW'íÜUDDRV&∆ñ2ÁFV6ÜÊñ6ñÂ˜W6Ö˜7V'67&óFñˆÁ24UBó5ˆ7FófS‘d≈4R¬WFFVEˆC‘‰ırÇítÑU$R7V'67&óFñˆÂˆñC“C¬∑"Á7V'67&óFñˆÂˆñE“ì∞¢“6F6ÇÖÚí∑–¢–¢–¢–¢&WGW&‚≤GFV◊FVC¢&˜w2Ê∆VÊwFÇ¬6VÁB”∞ß–†¶gVÊ7Fñˆ‚ˆf˜&÷DÊ˜FñgîñÊ6ˆ÷T÷˜VÁBáf«VRí∞¢6ˆÁ7B‚“ÁV÷&W"áf«VRì∞¢ñbÇÁV÷&W"Êó4fñÊóFRÜ‚í«¬‚√“í&WGW&‚rs∞¢G'í≤&WGW&‚‚ÁFÙ∆ˆ6∆U7G&ñÊrÇwFÇ’DÇr¬≤÷Üñ◊V‘g&7Fñˆ‰FñvóG3¢“í≤râÆã.ârs≤–¢6F6Ç≤&WGW&‚÷FÇÁ&˜VÊBÜ‚íÁFı7G&ñÊrÇí≤râÆã.ârs≤–ß–†¶gVÊ7Fñˆ‚ˆñÊ6ˆ÷T÷˜VÁDg&ˆ‘Ê˜Fñgî÷Ü÷¬W6W&Ê÷Rí∞¢ñbÇ÷«¬GóVˆb÷”“vˆ&¶V7Brí&WGW&‚rs∞¢6ˆÁ7B&r“÷µ7G&ñÊráW6W&Ê÷R«¬rríÁG&ñ“Çï”∞¢&WGW&‚ˆf˜&÷DÊ˜FñgîñÊ6ˆ÷T÷˜VÁBá&rì∞ß–†¶7ñÊ2gVÊ7Fñˆ‚˜6VÊEW6ÖFıFV6ÜÊñ6ñÁ2áW6W&Ê÷W2“µ“¬ñ∆ˆB“∑“í∞¢6ˆÁ7BF&vWG2“'&íÊg&ˆ“ÜÊWr6WBÇÑ'&íÊó4'&íáW6W&Ê÷W2íÚW6W&Ê÷W2¢∑W6W&Ê÷W5“íÊ÷áÇ”‚7G&ñÊráÇ«¬rríÁG&ñ“ÇííÊfñ«FW"Ñ&ˆˆ∆V‚ííì∞¢∆WBGFV◊FVB“∞¢∆WB6VÁB“∞¢f˜"Ü6ˆÁ7BRˆbF&vWG2í∞¢G'í∞¢6ˆÁ7BñÊ6ˆ÷UFWáB“ˆñÊ6ˆ÷T÷˜VÁDg&ˆ‘Ê˜Fñgî÷áñ∆ˆBÊñÊ6ˆ÷Uˆ'ï˜W6W&Ê÷R¬Rì∞¢6ˆÁ7BW%FV6Öñ∆ˆB“≤‚‚Áñ∆ˆB”∞¢ñbÜñÊ6ˆ÷UFWáBí∞¢W%FV6Öñ∆ˆBÊ&ˆGí“G∑ñ∆ˆBÊ&ˆGí«¬~äã^à~ã.âûò>äæäòéòà.òûã.äã"w’∆Ô	˘+"â~ã^òéàÆòéã.à~àéãòNâNòûä>ãâ£¢G∂ñÊ6ˆ÷UFWáG÷∞¢W%FV6Öñ∆ˆBÊñÊ6ˆ÷Uˆ÷˜VÁE˜FWáB“ñÊ6ˆ÷UFWáC∞¢–¢6ˆÁ7B"“vóB˜6VÊEW6ÖFıFV6ÜÊñ6ñ‚áR¬W%FV6Öñ∆ˆBì∞¢GFV◊FVB≥“ÁV÷&W"á"ÊGFV◊FVB«¬ì∞¢6VÁB≥“ÁV÷&W"á"Á6VÁB«¬ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÁv&‚Çu∑vV'W6Ö“F&vWBfñ∆VBr¬≤FV6É¢R¬÷W76vS¢SÚÊ÷W76vR“ì∞¢–¢–¢&WGW&‚≤F&vWG3¢F&vWG2Ê∆VÊwFÇ¬GFV◊FVB¬6VÁB”∞ß–†¶7ñÊ2gVÊ7Fñˆ‚ˆÊ˜FñgîFó&V7D¶ˆ$76ñvÊVBá≤W6W&Ê÷W2¬¶ˆ%ˆñB¬&ˆˆ∂ñÊuˆ6ˆFR¬¶ˆ%˜GóR¬ˆñÁF÷VÁEˆFFWFñ÷R¬¶ˆ%˜¶ˆÊR¬ñÊ6ˆ÷Uˆ'ï˜W6W&Ê÷R“í∞¢G'í∞¢6ˆÁ7BFóF∆R“t5tbäã^à~ã.âûò>äæäòÇs∞¢6ˆÁ7B&ˆGí“˜6Ü˜'D¶ˆ%FWáBá≤¶ˆ%˜GóR¬ˆñÁF÷VÁEˆFFWFñ÷R¬¶ˆ%˜¶ˆÊR“í«¬à~ã.âûò>äæäòÇG∂&ˆˆ∂ñÊuˆ6ˆFR«¬rw÷∞¢&WGW&‚vóB˜6VÊEW6ÖFıFV6ÜÊñ6ñÁ2áW6W&Ê÷W2¬∞¢FóF∆R¿¢&ˆGí¿¢ñÊ6ˆ÷Uˆ'ï˜W6W&Ê÷R¿¢¶ˆ%ˆñB¿¢∂ñÊC¢vFó&V7Eˆ¶ˆ"r¿¢Fs¢7vb÷Fó&V7B“G∂¶ˆ%ˆñG÷¿¢W&√¢˜FV6ÇÊáF÷√˜F#÷7FófRf¶ˆ%ˆñC“G∂VÊ6ˆFUU$î6ˆ◊ˆÊVÁBÖ7G&ñÊrÜ¶ˆ%ˆñB«¬rríó÷ ¢“ì∞¢“6F6ÇÜRí≤6ˆÁ6ˆ∆RÁv&‚Çu∑vV'W6Ö“Fó&V7B¶ˆ"Ê˜Fñgífñ∆VBr¬SÚÊ÷W76vRì≤&WGW&‚ÁV∆√≤–ß–†¶7ñÊ2gVÊ7Fñˆ‚ˆÊ˜FñgïW&vVÁDˆffW"á≤W6W&Ê÷W2¬¶ˆ%ˆñB¬&ˆˆ∂ñÊuˆ6ˆFR¬¶ˆ%˜GóR¬ˆñÁF÷VÁEˆFFWFñ÷R¬¶ˆ%˜¶ˆÊR¬ñÊ6ˆ÷Uˆ'ï˜W6W&Ê÷R“í∞¢G'í∞¢6ˆÁ7BFóF∆R“t5tbäã^à~ã.âûò>äæòûä>ãâ¢s∞¢6ˆÁ7B&ˆGí“˜6Ü˜'D¶ˆ%FWáBá≤¶ˆ%˜GóR¬ˆñÁF÷VÁEˆFFWFñ÷R¬¶ˆ%˜¶ˆÊR“í«¬äã^à~ã.âûò>äæòûä>ãâ¢G∂&ˆˆ∂ñÊuˆ6ˆFR«¬rw÷∞¢&WGW&‚vóB˜6VÊEW6ÖFıFV6ÜÊñ6ñÁ2áW6W&Ê÷W2¬∞¢FóF∆R¿¢&ˆGí¿¢ñÊ6ˆ÷Uˆ'ï˜W6W&Ê÷R¿¢¶ˆ%ˆñB¿¢∂ñÊC¢wW&vVÁEˆˆffW"r¿¢Fs¢7vb÷ˆffW"“G∂¶ˆ%ˆñG÷¿¢W&√¢˜FV6ÇÊáF÷√˜F#÷ÊWrf¶ˆ%ˆñC“G∂VÊ6ˆFUU$î6ˆ◊ˆÊVÁBÖ7G&ñÊrÜ¶ˆ%ˆñB«¬rríó÷ ¢“ì∞¢“6F6ÇÜRí≤6ˆÁ6ˆ∆RÁv&‚Çu∑vV'W6Ö“W&vVÁBˆffW"Ê˜Fñgífñ∆VBr¬SÚÊ÷W76vRì≤&WGW&‚ÁV∆√≤–ß–†¢ÚÚFV6ÜÊñ6ñ‚W6Ç7V'67&óFñˆ‚ó0¶ÊvWBÇr˜FV6Ç˜W6Ö˜V&∆ñ5ˆ∂Wír¬&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢&WGW&‚&W2Êß6ˆ‚á≤7V66W73¢G'VR¬VÊ&∆VC¢˜W6Ö&VGíÇí¬V&∆ñ4∂Wì¢tT%ıU4ÖıT$ƒî5Ù¥Uí«¬rr“ì∞ß“ì∞†¶Á˜7BÇr˜FV6Ç˜W6Ö˜7V'67&ñ&Rr¬&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢ñbÇ˜W6Ö&VGíÇíí&WGW&‚&W2Á7FGW2ÉS2íÊß6ˆ‚á≤W'&˜#¢uU4ÖÙ‰ıEÙ4Ù‰dîuU$TBr“ì∞¢6ˆÁ7BFV6Ç“ˆWFÖW6W&Ê÷Rá&Wì∞¢6ˆÁ7B7V"“&WÊ&ˆGìÚÁ7V'67&óFñˆ‚«¬&WÊ&ˆGí«¬∑”∞¢6ˆÁ7BVÊGˆñÁB“7G&ñÊrá7V"ÊVÊGˆñÁB«¬rríÁG&ñ“Çì∞¢6ˆÁ7B#SfFÇ“7G&ñÊrá7V"Ê∂Wó3ÚÁ#SfFÇ«¬&WÊ&ˆGìÚÁ#SfFÇ«¬rríÁG&ñ“Çì∞¢6ˆÁ7BWFÇ“7G&ñÊrá7V"Ê∂Wó3ÚÊWFÇ«¬&WÊ&ˆGìÚÊWFÇ«¬rríÁG&ñ“Çì∞¢ñbÇFV6Ç«¬VÊGˆñÁB«¬#SfFÇ«¬WFÇí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢~à.òûäﬁäãûä^òàéòûà~òâ^ã~äﬁâûòNäòéàNä>â¢r“ì∞¢vóBˆˆ¬ÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2ÁFV6ÜÊñ6ñÂ˜W6Ö˜7V'67&óFñˆÁ0¢áFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬VÊGˆñÁB¬#SfFÇ¬WFÇ¬W6W%ˆvVÁB¬FWfñ6Uˆ∆&V¬¬ó5ˆ7FófR¬WFFVEˆB¬∆7E˜6VVÂˆBê¢d≈TU2ÇC¬C"¬C2¬CB¬CR¬Cb≈E%TRƒ‰ırÇíƒ‰ırÇíê¢Ù‚4Ù‰dƒî5BÜVÊGˆñÁBíDÚUDDR4U@¢FV6ÜÊñ6ñÂ˜W6W&Ê÷S‘UÑ4≈TDTBÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R¿¢#SfFÉ‘UÑ4≈TDTBÁ#SfFÇ¿¢WFÉ‘UÑ4≈TDTBÊWFÇ¿¢W6W%ˆvVÁC‘UÑ4≈TDTBÁW6W%ˆvVÁB¿¢FWfñ6Uˆ∆&V√‘UÑ4≈TDTBÊFWfñ6Uˆ∆&V¬¿¢ó5ˆ7FófS’E%TR¿¢WFFVEˆC‘‰ırÇí¿¢∆7E˜6VVÂˆC‘‰ırÇñ¿¢∑FV6Ç¬VÊGˆñÁB¬#SfFÇ¬WFÇ¬7G&ñÊrá&WÊÜVFW'5≤wW6W"÷vVÁBu“«¬rríÁ6∆ñ6RÉ¬Sí¬7G&ñÊrá&WÊ&ˆGìÚÊFWfñ6Uˆ∆&V¬«¬rríÁ6∆ñ6RÉ¬#ï–¢ì∞¢&WGW&‚&W2Êß6ˆ‚á≤7V66W73¢G'VR“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Çuı5B˜FV6Ç˜W6Ö˜7V'67&ñ&Rr¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢~òâæãNâNòàéòûà~òâ^ã~äﬁâûòNäòéäÆã>òä>ò~àÇr“ì∞¢–ß“ì∞†¶Á˜7BÇr˜FV6Ç˜W6Ö˜VÁ7V'67&ñ&Rr¬&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BFV6Ç“ˆWFÖW6W&Ê÷Rá&Wì∞¢6ˆÁ7BVÊGˆñÁB“7G&ñÊrá&WÊ&ˆGìÚÊVÊGˆñÁB«¬&WÊ&ˆGìÚÁ7V'67&óFñˆ„ÚÊVÊGˆñÁB«¬rríÁG&ñ“Çì∞¢ñbÜVÊGˆñÁBí∞¢vóBˆˆ¬ÁVW'íÜUDDRV&∆ñ2ÁFV6ÜÊñ6ñÂ˜W6Ö˜7V'67&óFñˆÁ24UBó5ˆ7FófS‘d≈4R¬WFFVEˆC‘‰ırÇítÑU$RFV6ÜÊñ6ñÂ˜W6W&Ê÷S“C‰BVÊGˆñÁC“C&¬∑FV6Ç¬VÊGˆñÁE“ì∞¢–¢&WGW&‚&W2Êß6ˆ‚á≤7V66W73¢G'VR“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Çuı5B˜FV6Ç˜W6Ö˜VÁ7V'67&ñ&Rr¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢~âæãNâNòàéòûà~òâ^ã~äﬁâûòNäòéäÆã>òä>ò~àÇr“ì∞¢–ß“ì∞†¶Á˜7BÇr˜FV6Ç˜W6Ö˜FW7Br¬&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BFV6Ç“ˆWFÖW6W&Ê÷Rá&Wì∞¢6ˆÁ7B&W7V«B“vóB˜6VÊEW6ÖFıFV6ÜÊñ6ñ‚áFV6Ç¬∞¢FóF∆S¢t5tbâ~âNäÆäﬁâÆòàéòûà~òâ^ã~äﬁâír¿¢&ˆGì¢~ä>ãâÆâÆòàéòûà~òâ^ã~äﬁâûà~ã.âûòà.òûã.âÓä>òûäﬁäò>àÆòûà~ã.âûòä^òûärr¿¢∂ñÊC¢wFW7Br¿¢Fs¢7vb◊FW7B“G∑FV6á÷¿¢W&√¢r˜FV6ÇÊáF÷¬p¢“ì∞¢&WGW&‚&W2Êß6ˆ‚á≤7V66W73¢G'VR¬&W7V«B“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Çuı5B˜FV6Ç˜W6Ö˜FW7Br¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢~äÆòéà~â~âNäÆäﬁâÆòNäòéäÆã>òä>ò~àÇr“ì∞¢–ß“ì∞†¢ÚÚ6ÊˆÊñ6¬W&vVÁBˆffW"fñÊ∆ó¶W"‚6fRFÚ6∆¬g&ˆ“WÜó7FñÊrFV6ÇˆF÷ñ‡¢ÚÚ◊WFFñˆ‚Fá3≤7F'GW'VÊÊW"&V∆˜r÷∂W2Wáó'íWFˆÊˆ÷˜W2‡¶7ñÊ2gVÊ7Fñˆ‚WFÙfñÊ∆ó¶UW&vVÁD¶ˆ'2Çí∞¢G'í∞¢&WGW&‚vóBW&vVÁDfñÊ∆ó¶W"ÊWFÙfñÊ∆ó¶UW&vVÁD¶ˆ'2áˆˆ¬ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÁv&‚Çu∂WFÙfñÊ∆ó¶UW&vVÁD¶ˆ'5“6∂ór¬RÊ÷W76vRì∞¢&WGW&‚≤7V66W73¢f«6R¬W'&˜#¢RÊ÷W76vR”∞¢–ß–†¶∆WBW&vVÁDfñÊ∆ó¶W%'VÊÊW$ñ‰f∆ñváB“f«6S∞¶∆WBW&vVÁDfñÊ∆ó¶W%'VÊÊW%Fñ÷W"“ÁV∆√∞†¶gVÊ7Fñˆ‚'VÂW&vVÁDfñÊ∆ó¶W$ˆÊ6Rá6˜W&6R“v÷ÁV¬rí∞¢ñbáW&vVÁDfñÊ∆ó¶W%'VÊÊW$ñ‰f∆ñváBí&WGW&‚&ˆ÷ó6RÁ&W6ˆ«fRá≤6∂óVC¢G'VR¬&V6ˆ„¢vñÂˆf∆ñváBr“ì∞¢W&vVÁDfñÊ∆ó¶W%'VÊÊW$ñ‰f∆ñváB“G'VS∞¢&WGW&‚W&vVÁDfñÊ∆ó¶W"ÊWFÙfñÊ∆ó¶UW&vVÁD¶ˆ'2áˆˆ¬ê¢Ê6F6ÇÇÜRí”‚∞¢6ˆÁ6ˆ∆RÁv&‚Çu∑W&vVÁEˆfñÊ∆ó¶W%˜'VÊÊW%“6∂ór¬≤6˜W&6R¬W'&˜#¢RÊ÷W76vR“ì∞¢&WGW&‚≤7V66W73¢f«6R¬W'&˜#¢RÊ÷W76vR”∞¢“ê¢ÊfñÊ∆«íÇÇí”‚∞¢W&vVÁDfñÊ∆ó¶W%'VÊÊW$ñ‰f∆ñváB“f«6S∞¢“ì∞ß–†¶gVÊ7Fñˆ‚7F'EW&vVÁDfñÊ∆ó¶W%'VÊÊW"Çí∞¢ñbáW&vVÁDfñÊ∆ó¶W%'VÊÊW%Fñ÷W"í&WGW&‚W&vVÁDfñÊ∆ó¶W%'VÊÊW%Fñ÷W#∞¢'VÂW&vVÁDfñÊ∆ó¶W$ˆÊ6RÇw7F'GWríÊ6F6ÇÇÇí”‚∑“ì∞¢W&vVÁDfñÊ∆ó¶W%'VÊÊW%Fñ÷W"“6WDñÁFW'f¬ÇÇí”‚∞¢'VÂW&vVÁDfñÊ∆ó¶W$ˆÊ6RÇvñÁFW'f¬ríÊ6F6ÇÇÇí”‚∑“ì∞¢“¬CSì∞¢ñbáGóVˆbW&vVÁDfñÊ∆ó¶W%'VÊÊW%Fñ÷W"ÁVÁ&Vb””“vgVÊ7Fñˆ‚ríW&vVÁDfñÊ∆ó¶W%'VÊÊW%Fñ÷W"ÁVÁ&VbÇì∞¢&WGW&‚W&vVÁDfñÊ∆ó¶W%'VÊÊW%Fñ÷W#∞ß–†¢ÚÚÜˆ÷WvR4’2&'Fñ6∆W2"6V7Fñˆ‚WFÚ◊7ñÊ2ÜRÊr‚V∆∆ñÊr˜7G2g&ˆ–¢ÚÚwwrÊ7vb÷ó"Ê6ˆ“í‚6˜W&6RU$¬Ú6VVBU$«2&RvÜFWfW"FÜRF÷ñ‚6ˆÊfñwW&V@¢ÚÚñ‚FÜR4’2G&gBw2V&∆ó6ÜVB6ˆÊfñr(	BÊÚ6W'fW"VÁb6ˆÊfñrÊVVFVB¬FÜP¢ÚÚF÷ñ‚6ˆÁG&ˆ«2óBVÁFó&V«íg&ˆ“FÜRÜˆ÷WvR4’2VFóF˜"‡¶6ˆÁ7B%Dî4ƒUı5î‰5ÙîÂDU%d≈Ù’2“÷FÇÊ÷ÇÉ¬ÁV÷&W"á&ˆ6W72ÊVÁb‰%Dî4ƒUı5î‰5ÙîÂDU%d≈ÙÑıU%2í«¬bí¢c¢c¢∞¶∆WB'Fñ6∆U7ñÊ5'VÊÊW$ñ‰f∆ñváB“f«6S∞¶∆WB'Fñ6∆U7ñÊ5'VÊÊW%Fñ÷W"“ÁV∆√∞†¶7ñÊ2gVÊ7Fñˆ‚'V‰'Fñ6∆U7ñÊ4ˆÊ6Rá6˜W&6R“v÷ÁV¬rí∞¢ñbÜ'Fñ6∆U7ñÊ5'VÊÊW$ñ‰f∆ñváBí&WGW&‚≤6∂óVC¢G'VR¬&V6ˆ„¢vñÂˆf∆ñváBr”∞¢'Fñ6∆U7ñÊ5'VÊÊW$ñ‰f∆ñváB“G'VS∞¢G'í∞¢6ˆÁ7B6ˆÊfñu&˜r“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BV&∆ó6ÜVEˆ6ˆÊfñre$Ù“V&∆ñ2ÊÜˆ÷WvUˆ6◊5ˆ6ˆÊfñw2tÑU$R6ˆÊfñuˆ∂Wì“C¿¢¥ÑÙ‘UtUÙ4Ù‰dîuÙ¥Uï–¢ì∞¢6ˆÁ7B6ˆÊfñr“6ˆÊfñu&˜rÁ&˜w3ÚÂ≥”ÚÁV&∆ó6ÜVEˆ6ˆÊfñs∞¢6ˆÁ7B6V7FñˆÁ2“'&íÊó4'&íÜ6ˆÊfñsÚÁ6V7FñˆÁ2íÚ6ˆÊfñrÁ6V7FñˆÁ2¢µ”∞¢6ˆÁ7B&W7V«G2“µ”∞¢f˜"Ü6ˆÁ7B6V7Fñˆ‚ˆb6V7FñˆÁ2í∞¢ñbá6V7Fñˆ„ÚÁGóR”“v'Fñ6∆W2r«¬6V7Fñˆ‚ÊWFı˜7ñÊ2«¬6V7Fñˆ‚Á6˜W&6U˜W&¬í6ˆÁFñÁVS∞¢G'í∞¢6ˆÁ7B&W7V«B“vóB'Fñ6∆U7ñÊ2Á7ñÊ4'Fñ6∆W2áˆˆ¬¬6V7Fñˆ‚Á6˜W&6U˜W&¬¬≤6VVEW&«3¢6V7Fñˆ‚Á6VVE˜W&«2«¬µ“¬∆ñ÷óC¢"“ì∞¢&W7V«G2ÁW6Çá≤6˜W&6U˜W&√¢6V7Fñˆ‚Á6˜W&6U˜W&¬¬‚‚Á&W7V«B“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÁv&‚Çu∂'Fñ6∆U˜7ñÊ5˜'VÊÊW%“6V7Fñˆ‚7ñÊ2fñ∆VBr¬≤6˜W&6R¬6˜W&6U˜W&√¢6V7Fñˆ‚Á6˜W&6U˜W&¬¬W'&˜#¢RÊ÷W76vR“ì∞¢–¢–¢&WGW&‚≤ˆ≥¢G'VR¬&W7V«G2”∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÁv&‚Çu∂'Fñ6∆U˜7ñÊ5˜'VÊÊW%“6∂ór¬≤6˜W&6R¬W'&˜#¢RÊ÷W76vR“ì∞¢&WGW&‚≤ˆ≥¢f«6R¬W'&˜#¢RÊ÷W76vR”∞¢“fñÊ∆«í∞¢'Fñ6∆U7ñÊ5'VÊÊW$ñ‰f∆ñváB“f«6S∞¢–ß–†¶gVÊ7Fñˆ‚7F'D'Fñ6∆U7ñÊ5'VÊÊW"Çí∞¢ñbÜ'Fñ6∆U7ñÊ5'VÊÊW%Fñ÷W"í&WGW&‚'Fñ6∆U7ñÊ5'VÊÊW%Fñ÷W#∞¢ñbÇVÁd&ˆˆ¬Çt%Dî4ƒUı5î‰5ÙT‰$ƒTBr¬G'VRíí&WGW&‚ÁV∆√∞¢6WEFñ÷V˜WBÇÇí”‚≤'V‰'Fñ6∆U7ñÊ4ˆÊ6RÇw7F'GWríÊ6F6ÇÇÇí”‚∑“ì≤“¬SíÁVÁ&VcÚ‚Çì∞¢'Fñ6∆U7ñÊ5'VÊÊW%Fñ÷W"“6WDñÁFW'f¬ÇÇí”‚∞¢'V‰'Fñ6∆U7ñÊ4ˆÊ6RÇvñÁFW'f¬ríÊ6F6ÇÇÇí”‚∑“ì∞¢“¬%Dî4ƒUı5î‰5ÙîÂDU%d≈Ù’2ì∞¢ñbáGóVˆb'Fñ6∆U7ñÊ5'VÊÊW%Fñ÷W"ÁVÁ&Vb””“vgVÊ7Fñˆ‚rí'Fñ6∆U7ñÊ5'VÊÊW%Fñ÷W"ÁVÁ&VbÇì∞¢&WGW&‚'Fñ6∆U7ñÊ5'VÊÊW%Fñ÷W#∞ß–†¶Á˜7BÇ"˜FV6ÇˆñÊ6ˆ÷R◊7V÷÷'í÷&F6Ç"¬&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B&WVW7FVEW6W&Ê÷R“7G&ñÊrá&WÊ&ˆGìÚÁW6W&Ê÷R«¬&WÁVW'ìÚÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7BW6W&Ê÷R“ˆWFÖW6W&Ê÷Rá&Wì∞¢6ˆÁ7B¶ˆ$ñG2“˜6ÊóFó¶UFV6Ñ¶ˆ$ñG2á&WÊ&ˆGìÚÊ¶ˆ%ˆñG2«¬&WÊ&ˆGìÚÊ¶ˆ$ñG2«¬µ“ì∞¢ñbÇW6W&Ê÷Rí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢%T‰UDÑı$ï§TB"“ì∞¢ñbá&WVW7FVEW6W&Ê÷Rbb&WVW7FVEW6W&Ê÷R”“W6W&Ê÷Rí∞¢G'í≤6ˆÁ6ˆ∆RÁv&‚Ç%∑FV6ÖˆñÊ6ˆ÷Uˆ&F6ÖˆñFVÁFóGï“ñvÊ˜&VB&WVW7FVBW6W&Ê÷R÷ó6÷F6Ç"¬≤&WVW7FVEW6W&Ê÷R¬6W76ñˆÂW6W&Ê÷S¢W6W&Ê÷R“ì≤“6F6Ç∑–¢–¢ñbÇ¶ˆ$ñG2Ê∆VÊwFÇí&WGW&‚&W2Êß6ˆ‚á≤ˆ≥¢G'VR¬óFV◊3¢∑““ì∞†¢G'í∞¢6ˆÁ7Bfó6ñ&∆U&˜w2“vóBˆ∆ˆEFV6ÜÊñ6ñÂfó6ñ&∆T¶ˆ'4'îñG2áW6W&Ê÷R¬¶ˆ$ñG2ì∞¢6ˆÁ7B÷ˆÊWî÷“vóBˆ'Vñ∆EFV6ÜÊñ6ñ‰¶ˆ$÷ˆÊWï7V÷÷'î&F6Çáfó6ñ&∆U&˜w2¬W6W&Ê÷R¬∞¢6ˆÁFWáDf˜$¶ˆ#¢á&˜rí”‚˜FV6Ñ¶ˆ$6ˆÁFWáDg&ˆ’&˜rá&˜r¬v7W'&VÁBrí¿¢“ì∞¢6ˆÁ7BóFV◊2“∑”∞¢f˜"Ü6ˆÁ7B&˜rˆbfó6ñ&∆U&˜w2í∞¢6ˆÁ7B6ˆÁFWáB“˜FV6Ñ¶ˆ$6ˆÁFWáDg&ˆ’&˜rá&˜r¬v7W'&VÁBrì∞¢6ˆÁ7B÷ˆÊWí“÷ˆÊWî÷ÊvWBÖ7G&ñÊrá&˜rÊ¶ˆ%ˆñBíí«¬ÁV∆√∞¢óFV◊5µ7G&ñÊrá&˜rÊ¶ˆ%ˆñBï““∞¢¶ˆ%ˆñC¢&˜rÊ¶ˆ%ˆñB¿¢6ˆÁFWáB¿¢7FGW3¢÷ˆÊWìÚÁFV6ÜÊñ6ñÂˆñÊ6ˆ÷Uˆ÷˜VÁB”“ÁV∆¬ÚwVÊfñ∆&∆Rr¢w&VGír¿¢FV6ÜÊñ6ñÂˆñÊ6ˆ÷Uˆ÷˜VÁC¢÷ˆÊWìÚÁFV6ÜÊñ6ñÂˆñÊ6ˆ÷Uˆ÷˜VÁBÛÚÁV∆¬¿¢FV6ÜÊñ6ñÂˆñÊ6ˆ÷Uˆ∆&V√¢÷ˆÊWìÚÁFV6ÜÊñ6ñÂˆñÊ6ˆ÷Uˆ∆&V¬«¬ÁV∆¬¿¢FV6ÜÊñ6ñÂˆñÊ6ˆ÷U˜6˜W&6S¢÷ˆÊWìÚÁFV6ÜÊñ6ñÂˆñÊ6ˆ÷U˜6˜W&6R«¬wVÊfñ∆&∆Rr¿¢FV6ÜÊñ6ñÂˆñÊ6ˆ÷UˆFó7∆ï˜7FFS¢÷ˆÊWìÚÁFV6ÜÊñ6ñÂˆñÊ6ˆ÷UˆFó7∆ï˜7FFR«¬ÁV∆¬¿¢FV6ÜÊñ6ñÂˆñÊ6ˆ÷UˆFó7∆ïˆÊ˜FS¢÷ˆÊWìÚÁFV6ÜÊñ6ñÂˆñÊ6ˆ÷UˆFó7∆ïˆÊ˜FR«¬ÁV∆¬¿¢FV6ÜÊñ6ñÂˆñÊ6ˆ÷Uˆó5ˆfñÊ√¢&ˆˆ∆V‚Ü÷ˆÊWìÚÁFV6ÜÊñ6ñÂˆñÊ6ˆ÷Uˆó5ˆfñÊ¬í¿¢FV6ÜÊñ6ñÂˆñÊ6ˆ÷Uˆó5˜7F∆S¢&ˆˆ∆V‚Ü÷ˆÊWìÚÁFV6ÜÊñ6ñÂˆñÊ6ˆ÷Uˆó5˜7F∆Rí¿¢FV6ÜÊñ6ñÂˆñÊ6ˆ÷U˜&FU˜6WEˆñC¢÷ˆÊWìÚÁFV6ÜÊñ6ñÂˆñÊ6ˆ÷U˜&FU˜6WEˆñB«¬ÁV∆¬¿¢FV6ÜÊñ6ñÂˆñÊ6ˆ÷U˜&FU˜6WE˜fW'6ñˆ„¢÷ˆÊWìÚÁFV6ÜÊñ6ñÂˆñÊ6ˆ÷U˜&FU˜6WE˜fW'6ñˆ‚«¬ÁV∆¬¿¢”∞¢–¢&WGW&‚&W2Êß6ˆ‚á≤ˆ≥¢G'VR¬óFV◊2“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Çuı5B˜FV6ÇˆñÊ6ˆ÷R◊7V÷÷'í÷&F6ÇW'&˜#¢r¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢.ò.äæä^âNâ~ã^òéàÆòéã.à~àéãòNâNòûä>ãâÆòNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞†¶ÊvWBÇ"˜FV6Çˆ¶ˆ'2Û¶¶ˆ%ˆñBˆñÊ6ˆ÷R÷FWFñ¬"¬&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B¶ˆ$ñB“ÁV÷&W"á&WÁ&◊2Ê¶ˆ%ˆñBì∞¢6ˆÁ7B&WVW7FVEW6W&Ê÷R“7G&ñÊrá&WÁVW'ìÚÁW6W&Ê÷R«¬&WÊ&ˆGìÚÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7BW6W&Ê÷R“ˆWFÖW6W&Ê÷Rá&Wì∞¢ñbÇÁV÷&W"Êó4ñÁFVvW"Ü¶ˆ$ñBí«¬¶ˆ$ñB√“í&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢&ñÁf∆ñEˆ¶ˆ%ˆñB"“ì∞¢ñbÇW6W&Ê÷Rí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢%T‰UDÑı$ï§TB"“ì∞¢ñbá&WVW7FVEW6W&Ê÷Rbb&WVW7FVEW6W&Ê÷R”“W6W&Ê÷Rí∞¢G'í≤6ˆÁ6ˆ∆RÁv&‚Ç%∑FV6ÖˆñÊ6ˆ÷UˆFWFñ≈ˆñFVÁFóGï“ñvÊ˜&VB&WVW7FVBW6W&Ê÷R÷ó6÷F6Ç"¬≤&WVW7FVEW6W&Ê÷R¬6W76ñˆÂW6W&Ê÷S¢W6W&Ê÷R¬¶ˆ$ñB“ì≤“6F6Ç∑–¢–†¢G'í∞¢6ˆÁ7Bfó6ñ&∆U&˜w2“vóBˆ∆ˆEFV6ÜÊñ6ñÂfó6ñ&∆T¶ˆ'4'îñG2áW6W&Ê÷R¬∂¶ˆ$ñE“ì∞¢6ˆÁ7B&˜r“fó6ñ&∆U&˜w5≥”∞¢ñbÇ&˜rí&WGW&‚&W2Á7FGW2ÉCBíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢&¶ˆ%ˆÊ˜Eˆf˜VÊB"“ì∞¢6ˆÁ7B6ˆÁFWáB“˜FV6Ñ¶ˆ$6ˆÁFWáDg&ˆ’&˜rá&˜r¬v7W'&VÁBrì∞¢6ˆÁ7B÷ˆÊWí“vóBˆ'Vñ∆EFV6ÜÊñ6ñ‰¶ˆ$÷ˆÊWï7V÷÷'íá&˜r¬W6W&Ê÷R¬≤6ˆÁFWáB“ì∞¢&WGW&‚&W2Êß6ˆ‚á≤ˆ≥¢G'VR¬¶ˆ%ˆñC¢¶ˆ$ñB¬6ˆÁFWáB¬‚‚Ê÷ˆÊWí“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÇttUB˜FV6Çˆ¶ˆ'2Û¶¶ˆ%ˆñBˆñÊ6ˆ÷R÷FWFñ¬W'&˜#¢r¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢.ò.äæä^âNä>ã.ä.ä^ãòäﬁã^ä.âNâ~ã^òéàÆòéã.à~àéãòNâNòûä>ãâÆòNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞††¶Á˜7BÇ"ˆí˜7WW"˜FV6ÜÊñ6ñ‚÷ñÊ6ˆ÷R◊&WfñWrˆ&6∂fñ∆¬"¬&WVó&U7WW$F÷ñ‚¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B"“&WÊ&ˆGí«¬∑”∞¢6ˆÁ7B∆ñ÷óB“÷FÇÊ÷ÇÉ¬÷FÇÊ÷ñ‚É#¬ÁV÷&W"Ü"Ê∆ñ÷óB«¬í«¬íì∞¢6ˆÁ7BFó4&6≤“÷FÇÊ÷ÇÉ¬÷FÇÊ÷ñ‚És3¬ÁV÷&W"Ü"ÊFó5ˆ&6≤«¬Éí«¬Éíì∞¢6ˆÁ7BFó4f˜'v&B“÷FÇÊ÷ÇÉ¬÷FÇÊ÷ñ‚ÉÉ¬ÁV÷&W"Ü"ÊFó5ˆf˜'v&B«¬cí«¬cíì∞¢6ˆÁ7BW6W&Ê÷Tfñ«FW"“7G&ñÊrÜ"ÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢G'í∞¢6ˆÁ7B&˜w5“vóBˆˆ¬ÁVW'íÄ¢ ¢tïDÇ66˜VEˆ¶ˆ'22Ä¢4TƒT5B¢Ê¶ˆ%ˆñB¬¢ÊˆñÁF÷VÁEˆFFWFñ÷R¬¢ÊfñÊó6ÜVEˆB¬¢ÁñEˆB¬¢Ê7&VFVEˆ@¢e$Ù“V&∆ñ2Ê¶ˆ'2†¢tÑU$R4ÙƒU44RÜ¢Ê6Ê6V∆VEˆB¬ÂTƒ¬íï2ÂTƒ¿¢‰B4ÙƒU44RÜ¢ÊˆñÁF÷VÁEˆFFWFñ÷R¬¢ÊfñÊó6ÜVEˆB¬¢ÁñEˆB¬¢Ê7&VFVEˆB¬‰ırÇíí„“Ñ‰ırÇí“ÇC#£¶ñÁB¢îÂDU%d¬sFíríê¢‰B4ÙƒU44RÜ¢ÊˆñÁF÷VÁEˆFFWFñ÷R¬¢ÊfñÊó6ÜVEˆB¬¢ÁñEˆB¬¢Ê7&VFVEˆB¬‰ırÇíí¬Ñ‰ırÇí≤ÇC3£¶ñÁB¢îÂDU%d¬sFíríê¢ı$DU"%í4ÙƒU44RÜ¢Ê7&VFVEˆB¬¢ÊˆñÁF÷VÁEˆFFWFñ÷R¬¢ÊfñÊó6ÜVEˆB¬¢ÁñEˆB¬‰ırÇííDU42ÂTƒ≈2ƒ5B¬¢Ê¶ˆ%ˆñBDU40¢ƒî‘ïB ¢í¬ó'22Ä¢4TƒT5B6¢Ê¶ˆ%ˆñB¬ÂTƒƒîbÖE$î“Ü¢ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷Rí¬rrí2FV6Ä¢e$Ù“66˜VEˆ¶ˆ'26¢§Ùî‚V&∆ñ2Ê¶ˆ'2¢Ù‚¢Ê¶ˆ%ˆñC◊6¢Ê¶ˆ%ˆñ@¢T‰îÙ‡¢4TƒT5B6¢Ê¶ˆ%ˆñB¬ÂTƒƒîbÖE$î“áÇÁFV6Çí¬rrí2FV6Ä¢e$Ù“66˜VEˆ¶ˆ'26¢§Ùî‚V&∆ñ2Ê¶ˆ'2¢Ù‚¢Ê¶ˆ%ˆñC◊6¢Ê¶ˆ%ˆñ@¢5$ı52§Ùî‚ƒDU$¬&VvWá˜7∆óE˜Fı˜F&∆RÑ4ÙƒU44RÜ¢ÁFV6ÜÊñ6ñÂ˜FV“¬rrí¬u«2¢≈«2¢rí2ÇáFV6Çê¢T‰îÙ‡¢4TƒT5B6¢Ê¶ˆ%ˆñB¬ÂTƒƒîbÖE$î“áF“ÁW6W&Ê÷Rí¬rrí2FV6Ä¢e$Ù“66˜VEˆ¶ˆ'26¢§Ùî‚V&∆ñ2Ê¶ˆ%˜FV’ˆ÷V÷&W'2F“Ù‚F“Ê¶ˆ%ˆñC◊6¢Ê¶ˆ%ˆñ@¢T‰îÙ‡¢4TƒT5B6¢Ê¶ˆ%ˆñB¬ÂTƒƒîbÖE$î“Ü¶ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷Rí¬rrí2FV6Ä¢e$Ù“66˜VEˆ¶ˆ'26¢§Ùî‚V&∆ñ2Ê¶ˆ%ˆ76ñvÊ÷VÁG2¶Ù‚¶Ê¶ˆ%ˆñC◊6¢Ê¶ˆ%ˆñ@¢T‰îÙ‡¢4TƒT5B6¢Ê¶ˆ%ˆñB¬ÂTƒƒîbÖE$î“ÜÚÁFV6ÜÊñ6ñÂ˜W6W&Ê÷Rí¬rrí2FV6Ä¢e$Ù“66˜VEˆ¶ˆ'26¢§Ùî‚V&∆ñ2Ê¶ˆ%ˆˆffW'2ÚÙ‚ÚÊ¶ˆ%ˆñC◊6¢Ê¶ˆ%ˆñB‰BÚÁ7FGW2î‚ÇwVÊFñÊrr¬v66WFVBrê¢ê¢4TƒT5BDï5Dî‰5BÊ¶ˆ%ˆñB¬ÁFV6Ç2FV6ÜÊñ6ñÂ˜W6W&Ê÷P¢e$Ù“ó'2 ¢ƒTeB§Ùî‚V&∆ñ2Ê¶ˆ%˜FV6ÜÊñ6ñÂˆñÊ6ˆ÷U˜&WfñWr&W`¢Ù‚&WbÊ¶ˆ%ˆñC◊Ê¶ˆ%ˆñB‰B&WbÁFV6ÜÊñ6ñÂ˜W6W&Ê÷S◊ÁFV6Ç‰B4ÙƒU44Rá&WbÊó5˜7F∆Rƒd≈4Rì‘d≈4P¢tÑU$RÁFV6Çï2‰ıBÂTƒ¬‰BÁFV6Ç√‚rp¢‰BÇCC£ßFWáB“rrı"ÁFV6Ç“CC£ßFWáBê¢‰B&WbÊñBï2ÂTƒ¿¢ı$DU"%íÊ¶ˆ%ˆñBDU40¢ƒî‘ïBC¢¿¢∂∆ñ÷óB¬Fó4&6≤¬Fó4f˜'v&B¬W6W&Ê÷Tfñ«FW%–¢ì∞¢∆WBñÁ6W'FVB“¬fñ∆VB“¬6∂óVB“∞¢6ˆÁ7Bfñ«W&W2“µ”∞¢f˜"Ü6ˆÁ7B&˜rˆb&˜w5Á&˜w2«¬µ“í∞¢G'í∞¢6ˆÁ7B÷FR“vóBˆ6∆7V∆FTÊE7F˜&UFV6ÜÊñ6ñ‰ñÊ6ˆ÷U&WfñWrá&˜rÊ¶ˆ%ˆñB¬&˜rÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬≤6˜W&6S¢v&6∂fñ∆≈˜&WfñWrr“ì∞¢ñbÜ÷FRíñÁ6W'FVB≥“∞¢V«6R6∂óVB≥“∞¢“6F6ÇÜRí∞¢fñ∆VB≥“∞¢ñbÜfñ«W&W2Ê∆VÊwFÇ¬ífñ«W&W2ÁW6Çá≤¶ˆ%ˆñC¢&˜rÊ¶ˆ%ˆñB¬FV6ÜÊñ6ñÂ˜W6W&Ê÷S¢&˜rÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬W'&˜#¢RÊ÷W76vR“ì∞¢–¢–¢&WGW&‚&W2Êß6ˆ‚á≤ˆ≥¢G'VR¬66ÊÊVC¢&˜w5Á&˜t6˜VÁB«¬¬ñÁ6W'FVB¬WFFVC¢¬6∂óVB¬fñ∆VB¬fñ«W&W2¬Ü5ˆ÷˜&UˆÜñÁC¢á&˜w5Á&˜t6˜VÁB«¬í„“∆ñ÷óB“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Çrˆí˜7WW"˜FV6ÜÊñ6ñ‚÷ñÊ6ˆ÷R◊&WfñWrˆ&6∂fñ∆¬W'&˜#¢r¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢v&6∂fñ∆≈ˆfñ∆VBr¬÷W76vS¢RÊ÷W76vR“ì∞¢–ß“ì∞†¶7ñÊ2gVÊ7Fñˆ‚∆ˆEVÊFñÊtˆffW'4f˜%6W76ñˆÂFV6ÜÊñ6ñ‚áW6W&Ê÷Rí∞¢6ˆÁ7B∆ñ6W2“vóBˆvWEFV6ÜÊñ6ñÂfó6ñ&ñ∆óGî∆ñ6W2áW6W&Ê÷Rì∞¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢ ¢4TƒT5@¢ÚÊˆffW%ˆñB¬ÚÊ¶ˆ%ˆñB¬ÚÁ7FGW2¬ÚÊˆffW&VEˆB¬ÚÊWáó&W5ˆB¿¢¢Ê¶ˆ%˜GóR¬¢ÊˆñÁF÷VÁEˆFFWFñ÷R¿¢¢ÊFG&W75˜FWáB¬¢Ê÷5˜W&¬¬¢Êw5ˆ∆FóGVFR¬¢Êw5ˆ∆ˆÊvóGVFR¿¢¢Ê¶ˆ%˜&ñ6R¬¢Ê¶ˆ%˜7FGW2¬¢Ê&ˆˆ∂ñÊuˆ6ˆFR¬¢Ê7W7Fˆ÷W%ˆÊ˜FR¿¢4ÙƒU44RÜ¢Ê∆∆˜u˜Fñ÷U˜&˜˜6¬ƒd≈4Rí2∆∆˜u˜Fñ÷U˜&˜˜6¬¿¢4ÙƒU44RÜ¢Ê¶ˆ%˜¶ˆÊR¬rrí2¶ˆ%˜¶ˆÊR¿¢4ÙƒU44Rá7¢Á¶ˆÊUˆ∆&V¬¬rrí2¶ˆ%˜¶ˆÊUˆ∆&V¬¿¢4ÙƒU44RÇÄ¢4TƒT5B7G&ñÊuˆvrÑ4ÙƒU44RÜ¶íÊóFV’ˆÊ÷R¬rrí¬r¬rı$DU"%í¶íÊ¶ˆ%ˆóFV’ˆñBê¢e$Ù“V&∆ñ2Ê¶ˆ%ˆóFV◊2¶ê¢tÑU$R¶íÊ¶ˆ%ˆñB“¢Ê¶ˆ%ˆñ@¢í¬rrí26W'fñ6UˆóFV◊5˜FWá@¢e$Ù“V&∆ñ2Ê¶ˆ%ˆˆffW'2¢§Ùî‚V&∆ñ2Ê¶ˆ'2¢Ù‚¢Ê¶ˆ%ˆñB“ÚÊ¶ˆ%ˆñ@¢ƒTeB§Ùî‚V&∆ñ2Á6W'fñ6U˜¶ˆÊW27¢Ù‚7¢Á¶ˆÊUˆ6ˆFR“¢Á6W'fñ6U˜¶ˆÊUˆ6ˆFP¢tÑU$RÚÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R“ÂíÇC£ßFWáEµ“ê¢‰BÚÁ7FGW3“wVÊFñÊrp¢‰BÚÊWáó&W5ˆB„“‰ırÇê¢‰B¢Ê6Ê6V∆VEˆBï2ÂTƒ¿¢‰B4ÙƒU44RÜ¢Ê¶ˆ%˜7FGW2¬rrí√‚~ä.àòä^ãNàp¢ı$DU"%íÚÊWáó&W5ˆB40¢¿¢∂∆ñ6W5–¢ì∞†¢6ˆÁ7B&˜w2“µ”∞¢f˜"Ü6ˆÁ7B&˜rˆbá"Á&˜w2«¬µ“íí∞¢6ˆÁ7B&6R“≤‚‚Á&˜r¬‚‚Â˜FV6Ñ¶ˆ$÷ˆÊWîf∆∆&6≤á&˜r¬W6W&Ê÷R¬vˆffW&VBrí”∞¢G'í∞¢6ˆÁ7B÷ˆÊWí“vóBˆ'Vñ∆EFV6ÜÊñ6ñ‰¶ˆ$÷ˆÊWï7V÷÷'íá&˜r¬W6W&Ê÷R¬≤6ˆÁFWáC¢vˆffW&VBr“ì∞¢ñbÜ÷ˆÊWííˆ&¶V7BÊ76ñv‚Ü&6R¬÷ˆÊWíì∞¢“6F6ÇÜRí∞¢G'í≤6ˆÁ6ˆ∆RÁv&‚Çu∂ˆffW'5ˆñÊ6ˆ÷U˜&WfñWu“6∂ór¬≤W6W&Ê÷R¬¶ˆ%ˆñC¢&˜rÊ¶ˆ%ˆñB¬W'&˜#¢RÊ÷W76vR“ì≤“6F6Ç∑–¢–¢&˜w2ÁW6ÇÜ&6Rì∞¢–¢G'í≤6ˆÁ6ˆ∆RÊ∆ˆrÇu¥5teıDT4ÖÙ§Ù%5ÙDT%Tu“íˆffW'2vóFÇ&WfñWrr¬≤W6W&Ê÷R¬6˜VÁC¢&˜w2Ê∆VÊwFÇ“ì≤“6F6Ç∑–¢&WGW&‚&˜w3∞ß–†¶7ñÊ2gVÊ7Fñˆ‚76W'E&WVW7FVEFV6ÜÊñ6ñ‰÷F6ÜW56W76ñˆ‚á&WVW7FVEW6W&Ê÷R¬6W76ñˆÂW6W&Ê÷Rí∞¢6ˆÁ7B&WVW7FVB“7G&ñÊrá&WVW7FVEW6W&Ê÷R«¬""íÁG&ñ“Çì∞¢6ˆÁ7B6W76ñˆ‚“7G&ñÊrá6W76ñˆÂW6W&Ê÷R«¬""íÁG&ñ“Çì∞¢ñbÇ6W76ñˆ‚í∞¢6ˆÁ7BW'"“ÊWrW'&˜"Ç%T‰UDÑı$ï§TB"ì∞¢W'"Á7FGW46ˆFR“C∞¢Fá&˜rW'#∞¢–¢ñbÇ&WVW7FVB«¬&WVW7FVB””“&÷R"í&WGW&‚G'VS∞¢6ˆÁ7B∆ñ6W2“vóBˆvWEFV6ÜÊñ6ñÂfó6ñ&ñ∆óGî∆ñ6W2á6W76ñˆ‚ì∞¢6ˆÁ7B∆ñ56WB“ÊWr6WBÇÜ∆ñ6W2«¬µ“íÊ÷ÇáÇí”‚7G&ñÊráÇ«¬""íÁG&ñ“ÇíÁFÙ∆˜vW$66RÇííÊfñ«FW"Ñ&ˆˆ∆V‚íì∞¢ñbÇ∆ñ56WBÊÜ2á&WVW7FVBÁFÙ∆˜vW$66RÇííí∞¢6ˆÁ7BW'"“ÊWrW'&˜"Ç$dı$$îDDT‚"ì∞¢W'"Á7FGW46ˆFR“C3∞¢Fá&˜rW'#∞¢–¢&WGW&‚G'VS∞ß–†¶7ñÊ2gVÊ7Fñˆ‚76W'DˆffW$˜vÊVD'ï6W76ñˆÂFV6ÜÊñ6ñ‚á6W76ñˆÂW6W&Ê÷R¬ˆffW%FV6ÜÊñ6ñÂW6W&Ê÷Rí∞¢6ˆÁ7B6W76ñˆ‚“7G&ñÊrá6W76ñˆÂW6W&Ê÷R«¬""íÁG&ñ“Çì∞¢ñbÇ6W76ñˆ‚í∞¢6ˆÁ7BW'"“ÊWrW'&˜"Ç%T‰UDÑı$ï§TB"ì∞¢W'"Á7FGW46ˆFR“C∞¢Fá&˜rW'#∞¢–¢6ˆÁ7B∆ñ6W2“vóBˆvWEFV6ÜÊñ6ñÂfó6ñ&ñ∆óGî∆ñ6W2á6W76ñˆ‚ì∞¢6ˆÁ7B∆ñ56WB“ÊWr6WBÇÜ∆ñ6W2«¬µ“íÊ÷ÇáÇí”‚7G&ñÊráÇ«¬""íÁG&ñ“ÇíÁFÙ∆˜vW$66RÇííÊfñ«FW"Ñ&ˆˆ∆V‚íì∞¢6ˆÁ7B˜vÊW"“7G&ñÊrÜˆffW%FV6ÜÊñ6ñÂW6W&Ê÷R«¬""íÁG&ñ“ÇíÁFÙ∆˜vW$66RÇì∞¢ñbÇ˜vÊW"«¬∆ñ56WBÊÜ2Ü˜vÊW"íí∞¢6ˆÁ7BW'"“ÊWrW'&˜"Ç$dı$$îDDT‚"ì∞¢W'"Á7FGW46ˆFR“C3∞¢Fá&˜rW'#∞¢–ß–†¶ÊvWBÇ"ˆˆffW'2˜FV6Çˆ÷R"¬&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7BW6W&Ê÷R“ˆWFÖW6W&Ê÷Rá&Wì∞¢ñbÇW6W&Ê÷Rí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢%T‰UDÑı$ï§TB"“ì∞¢G'í∞¢6ˆÁ7B&˜w2“vóB∆ˆEVÊFñÊtˆffW'4f˜%6W76ñˆÂFV6ÜÊñ6ñ‚áW6W&Ê÷Rì∞¢&WGW&‚&W2Êß6ˆ‚á&˜w2ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Ç$tUBˆˆffW'2˜FV6Çˆ÷RW'&˜#¢"¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.ò.äæä^âNà.òûäﬁòäÆâûäﬁà~ã.âûòNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞†¶ÊvWBÇ"ˆˆffW'2˜FV6ÇÛßW6W&Ê÷R"¬&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7BW6W&Ê÷R“ˆWFÖW6W&Ê÷Rá&Wì∞¢G'í∞¢vóB76W'E&WVW7FVEFV6ÜÊñ6ñ‰÷F6ÜW56W76ñˆ‚á&WÁ&◊3ÚÁW6W&Ê÷R¬W6W&Ê÷Rì∞¢6ˆÁ7B&˜w2“vóB∆ˆEVÊFñÊtˆffW'4f˜%6W76ñˆÂFV6ÜÊñ6ñ‚áW6W&Ê÷Rì∞¢&WGW&‚&W2Êß6ˆ‚á&˜w2ì∞¢“6F6ÇÜRí∞¢6ˆÁ7B7FGW46ˆFR“ÁV÷&W"ÜSÚÁ7FGW46ˆFR«¬SÚÁ7FGW2«¬Sì∞¢ñbá7FGW46ˆFR””“C«¬7FGW46ˆFR””“C2í&WGW&‚&W2Á7FGW2á7FGW46ˆFRíÊß6ˆ‚á≤W'&˜#¢RÊ÷W76vR“ì∞¢6ˆÁ6ˆ∆RÊW'&˜"Ç$tUBˆˆffW'2˜FV6ÇÛßW6W&Ê÷RW'&˜#¢"¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.ò.äæä^âNà.òûäﬁòäÆâûäﬁà~ã.âûòNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞†¶Á˜7BÇ"ˆˆffW'2Û¶ˆffW%ˆñBˆ66WB"¬&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B≤ˆffW%ˆñB““&WÁ&◊3∞¢6ˆÁ7BW6W&Ê÷R“ˆWFÖW6W&Ê÷Rá&Wì∞†¢6ˆÁ7B6∆ñVÁB“vóBˆˆ¬Ê6ˆÊÊV7BÇì∞¢G'í∞¢vóB6∆ñVÁBÁVW'íÇ$$Ttî‚"ì∞¢vóBWáó&UFV6ÜÊñ6ñ‰66WE7FGW6W2Ü6∆ñVÁB¬W6W&Ê÷Rì∞†¢ÚÚ&W6ˆ«fRFÜR&VÁBfó'7B¬FÜV‚∆ˆ6≤¶ˆ"”‚ˆffW"‚6Ê6V∆∆Fñˆ‚W6W2FÜP¢ÚÚ6÷R∆ˆ6≤˜&FW"¬&WfVÁFñÊr6Ê6V¬ˆ66WBFVF∆ˆ6≤ÊB÷∂ñÊrFÜRfñÊ¿¢ÚÚ7FFRFWFW&÷ñÊó7Fñ2VÊFW"6ˆÊ7W'&VÁB&WVW7G2‡¢6ˆÁ7BˆffW%&Ve"“vóB6∆ñVÁBÁVW'íÄ¢4TƒT5B¶ˆ%ˆñBe$Ù“V&∆ñ2Ê¶ˆ%ˆˆffW'2tÑU$RˆffW%ˆñC“C¿¢∂ˆffW%ˆñE–¢ì∞¢ñbÜˆffW%&Ve"Á&˜w2Ê∆VÊwFÇ””“íFá&˜rÊWrW'&˜"Ç.òNäòéâÓâÆà.òûäﬁòäÆâûäﬁà~ã.âí"ì∞†¢6ˆÁ7B¶ˆ%"“vóB6∆ñVÁBÁVW'íÄ¢4TƒT5B¶ˆ%ˆñB¬FV6ÜÊñ6ñÂ˜FV“¬FV6ÜÊñ6ñÂ˜W6W&Ê÷R¬¶ˆ%˜GóR¬&ˆˆ∂ñÊuˆ6ˆFR¿¢ˆñÁF÷VÁEˆFFWFñ÷R¬¶ˆ%˜¶ˆÊR¬¶ˆ%˜7FGW2¬6Ê6V∆VEˆB¿¢G&fV≈˜7F'FVEˆB¬6ÜV6∂ñÂˆB¬7F'FVEˆB¬fñÊó6ÜVEˆ@¢e$Ù“V&∆ñ2Ê¶ˆ'2tÑU$R¶ˆ%ˆñC“Cdı"UDDV¿¢∂ˆffW%&Ve"Á&˜w5≥“Ê¶ˆ%ˆñE–¢ì∞¢ñbÜ¶ˆ%"Á&˜w2Ê∆VÊwFÇ””“íFá&˜rÊWrW'&˜"Ç.òNäòéâÓâÆà~ã.âí"ì∞¢6ˆÁ7B∆ˆ6∂VD¶ˆ"“¶ˆ%"Á&˜w5≥”∞¢6ˆÁ7B∆ˆ6∂VE7FGW2“7G&ñÊrÜ∆ˆ6∂VD¶ˆ"Ê¶ˆ%˜7FGW2«¬""íÁG&ñ“ÇíÁFÙ∆˜vW$66RÇì∞¢ñbÜ∆ˆ6∂VD¶ˆ"Ê6Ê6V∆VEˆB«¬∆ˆ6∂VE7FGW2””“.ä.àòä^ãNà ¢«¬U$tTÂEÙ4‰4T≈Ù$ƒÙ4¥TEı5DEU4U2ÊÜ2Ü∆ˆ6∂VE7FGW2íí∞¢Fá&˜rW&vVÁD6Ê6VƒW'&˜"Ç%U$tTÂEÙ§Ù%Ù‰ıEÙ44UD$ƒR"¬.à~ã.âûâûã^òûòNäòéäÆã.äã.ä>ânä>ãâÆòNâNòûòä^òûär"¬Cíì∞¢–¢ñbÜ∆ˆ6∂VD¶ˆ"ÁFV6ÜÊñ6ñÂ˜FV“«¬∆ˆ6∂VD¶ˆ"ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷Rí∞¢Fá&˜rW&vVÁD6Ê6VƒW'&˜"Ç%U$tTÂEÙ§Ù%Ù≈$TEïÙ54ît‰TB"¬.à~ã.âûâûã^òûânãûààÆòéã.à~àNâûäﬁã~òéâûä>ãâÆòNâæòä^òûär"¬Cíì∞¢–†¢6ˆÁ7BˆffW%"“vóB6∆ñVÁBÁVW'íÄ¢4TƒT5BˆffW%ˆñB¬¶ˆ%ˆñB¬FV6ÜÊñ6ñÂ˜W6W&Ê÷R¬7FGW2¬Wáó&W5ˆ@¢e$Ù“V&∆ñ2Ê¶ˆ%ˆˆffW'0¢tÑU$RˆffW%ˆñC“C‰B¶ˆ%ˆñC“C ¢dı"UDDV¿¢∂ˆffW%ˆñB¬∆ˆ6∂VD¶ˆ"Ê¶ˆ%ˆñE–¢ì∞¢ñbÜˆffW%"Á&˜w2Ê∆VÊwFÇ””“íFá&˜rÊWrW'&˜"Ç.òNäòéâÓâÆà.òûäﬁòäÆâûäﬁà~ã.âí"ì∞¢6ˆÁ7BˆffW"“ˆffW%"Á&˜w5≥”∞¢ñbÜˆffW"Á7FGW2”“'VÊFñÊr"íFá&˜rÊWrW'&˜"Ç.à.òûäﬁòäÆâûäﬁà~ã.âûâûã^òûânãûàâ^äﬁâÆòNâæòä^òûär"ì∞¢ñbÜÊWrFFRÜˆffW"ÊWáó&W5ˆBí¬ÊWrFFRÇííFá&˜rÊWrW'&˜"Ç.äæäâNòä~ä^ã.ä>ãâÆà~ã.âûòä^òûär"ì∞¢vóB76W'DˆffW$˜vÊVD'ï6W76ñˆÂFV6ÜÊñ6ñ‚áW6W&Ê÷R¬ˆffW"ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷Rì∞¢ÚÚ4Ùƒƒï4îÙÂÙ4ÑT4µıc ¢6ˆÁ7B¶ˆ$ñÊfı"“vóB6∆ñVÁBÁVW'íÄ¢4TƒT5BˆñÁF÷VÁEˆFFWFñ÷R¬4ÙƒU44RÜGW&FñˆÂˆ÷ñ‚√cí2GW&FñˆÂˆ÷ñ‚e$Ù“V&∆ñ2Ê¶ˆ'2tÑU$R¶ˆ%ˆñC“C¿¢∂ˆffW"Ê¶ˆ%ˆñE–¢ì∞¢6ˆÁ7B¶ˆ$ñÊfÚ“¶ˆ$ñÊfı"Á&˜w5≥”∞¢6ˆÁ7Bˆ≤“vóBó5FV6Ñg&VRÜˆffW"ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬¶ˆ$ñÊfÚÊˆñÁF÷VÁEˆFFWFñ÷R¬¶ˆ$ñÊfÚÊGW&FñˆÂˆ÷ñ‚¬ˆffW"Ê¶ˆ%ˆñBì∞¢ñbÇˆ≤í∞¢6ˆÁ6ˆ∆RÊ∆ˆrÇ%∑W&vVÁEˆ66WE“6ˆ∆∆ó6ñˆ‚"¬≤ˆffW%ˆñB¬¶ˆ%ˆñC¢ˆffW"Ê¶ˆ%ˆñB¬FV6É¢ˆffW"ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R“ì∞¢Fá&˜rÊWrW'&˜"Ç.òä~ä^ã.àÆâûàãâÆà~ã.âûäﬁã~òéâûà.äﬁà~àÆòéã.àréä>ä~äòä~ä^ã.òâNãNâûâ~ã.àr3âûã.â~ãRí"ì∞¢–¢6ˆÁ6ˆ∆RÊ∆ˆrÇ%∑W&vVÁEˆ66WE“ˆ≤"¬≤ˆffW%ˆñB¬¶ˆ%ˆñC¢ˆffW"Ê¶ˆ%ˆñB¬FV6É¢ˆffW"ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R“ì∞††¢vóB6∆ñVÁBÁVW'íÜUDDRV&∆ñ2Ê¶ˆ%ˆˆffW'24UB7FGW3“v66WFVBr¬&W7ˆÊFVEˆC‘‰ırÇítÑU$RˆffW%ˆñC“C¬∂ˆffW%ˆñE“ì∞¢vóB6∆ñVÁBÁVW'íÄ¢UDDRV&∆ñ2Ê¶ˆ%ˆˆffW'24UB7FGW3“vWáó&VBrtÑU$R¶ˆ%ˆñC“C‰B7FGW3“wVÊFñÊrr‰BˆffW%ˆñC√‚C&¿¢∂ˆffW"Ê¶ˆ%ˆñB¬ˆffW%ˆñE–¢ì∞¢vóB6∆ñVÁBÁVW'íÄ¢UDDRV&∆ñ2Ê¶ˆ%ˆˆffW%˜Fñ÷U˜&˜˜6«0¢4UB7FGW3“w7WW'6VFVBr¬FV6ñFVEˆC‘‰ırÇê¢tÑU$R¶ˆ%ˆñC“C‰B7FGW3“wVÊFñÊrv¿¢∂ˆffW"Ê¶ˆ%ˆñE–¢ì∞†¢ÚÚ)»RdïÇäÆã>àNãà”¢â^òûäﬁàr6WBFV6ÜÊñ6ñÂ˜FV“ânãnà~àéãòNâæäﬁä.ãûòÇ(	Œà~ã.âûâæãàéàéãéâÆãâû(	–¢ÚÚ)»R6WBâ~ãòûàrFV6ÜÊñ6ñÂ˜W6W&Ê÷R≤FV6ÜÊñ6ñÂ˜FV“òâÓã~òéäﬁò>äæòûâ~ãéàäæâûòûã.ääﬁà~òäæò~âûâ^ä>à~àãâê¢vóB6∆ñVÁBÁVW'íÄ¢UDDRV&∆ñ2Ê¶ˆ'0¢4UBFV6ÜÊñ6ñÂ˜W6W&Ê÷S“C¿¢FV6ÜÊñ6ñÂ˜FV”“C¿¢¶ˆ%˜7FGW3‘44P¢tÑT‚¶ˆ%˜7FGW2ï2ÂTƒ¬ı"E$î“Ü¶ˆ%˜7FGW2ì“rrDÑT‚~ä>äﬁâNã>òâûãNâûàã.ä2p¢tÑT‚¶ˆ%˜7FGW2î‚Ç~ä>äﬁàÆòéã.à~ä.ã~âûä.ãâír¬wVÊFñÊuˆ66WBr¬v66WFVBr¬v76ñvÊVBr¬~òNäòéâÓâÆàÆòéã.à~ä>ãâÆà~ã.âíríDÑT‚~ä>äﬁâNã>òâûãNâûàã.ä2p¢T≈4R¶ˆ%˜7FGW0¢T‰@¢tÑU$R¶ˆ%ˆñC“C&¿¢∂ˆffW"ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬ˆffW"Ê¶ˆ%ˆñE–¢ì∞†¢ÚÚ)»RòâŒã~òéäﬁàä>â>ã^à~ã.âûâûã^òûäã^â~ã^äéò>äæòûàNâûä>ãâÆòâæò~âûäÆäã.àÆãNàâ~ã^äâNòûä~ä"ê¢vóB6∆ñVÁBÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2Ê¶ˆ%˜FV’ˆ÷V÷&W'2Ü¶ˆ%ˆñB¬W6W&Ê÷Rê¢d≈TU2ÇC¬C"ê¢Ù‚4Ù‰dƒî5BÜ¶ˆ%ˆñB¬W6W&Ê÷RíDÚ‰ıDÑî‰v¿¢∂ˆffW"Ê¶ˆ%ˆñB¬ˆffW"ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷U–¢ì∞¢vóB6∆ñVÁBÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2Ê¶ˆ%ˆ76ñvÊ÷VÁG2Ü¶ˆ%ˆñB¬FV6ÜÊñ6ñÂ˜W6W&Ê÷R¬7FGW2ê¢d≈TU2ÇC¬C"¬vñÂ˜&ˆw&W72rê¢Ù‚4Ù‰dƒî5BÜ¶ˆ%ˆñB¬FV6ÜÊñ6ñÂ˜W6W&Ê÷Rê¢DÚUDDR4UB7FGW3“vñÂ˜&ˆw&W72r¬FˆÊUˆC‘ÂTƒ∆¿¢∂ˆffW"Ê¶ˆ%ˆñB¬ˆffW"ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷U–¢ì∞†¢vóB6∆ñVÁBÁVW'íÇ$4Ù‘‘ïB"ì∞†¢G'í∞¢vóBˆÊ˜FñgîFó&V7D¶ˆ$76ñvÊVBá∞¢W6W&Ê÷W3¢∂ˆffW"ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷U“¿¢¶ˆ%ˆñC¢ˆffW"Ê¶ˆ%ˆñB¿¢&ˆˆ∂ñÊuˆ6ˆFS¢¶ˆ%"Á&˜w5≥“Ê&ˆˆ∂ñÊuˆ6ˆFR¿¢¶ˆ%˜GóS¢¶ˆ%"Á&˜w5≥“Ê¶ˆ%˜GóR¿¢ˆñÁF÷VÁEˆFFWFñ÷S¢¶ˆ%"Á&˜w5≥“ÊˆñÁF÷VÁEˆFFWFñ÷R¿¢¶ˆ%˜¶ˆÊS¢¶ˆ%"Á&˜w5≥“Ê¶ˆ%˜¶ˆÊR¿¢“ì∞¢“6F6ÇÜÊ˜FñgîW'&˜"í∞¢6ˆÁ6ˆ∆RÁv&‚Ç%∑W&vVÁEˆ66WE“˜7B÷6ˆ÷÷óBÊ˜Fñfñ6Fñˆ‚fñ∆VB"¬∞¢¶ˆ%ˆñC¢ˆffW"Ê¶ˆ%ˆñB¿¢÷W76vS¢Ê˜FñgîW'&˜"bbÊ˜FñgîW'&˜"Ê÷W76vR¿¢“ì∞¢–†¢ÚÚ&W7BVff˜'C¢ânòûã.òâæò~âíW&vVÁBòä^ãòNäòéäãRˆffW"àNòûã.à~òä^òûärò>äæòûäÆä>ãéâæäÆânã.âûã ¢vóBWFÙfñÊ∆ó¶UW&vVÁD¶ˆ'2Çì∞¢&W2Êß6ˆ‚á≤7V66W73¢G'VR¬¶ˆ%ˆñC¢ˆffW"Ê¶ˆ%ˆñB“ì∞¢“6F6ÇÜRí∞¢vóB6∆ñVÁBÁVW'íÇ%$Ùƒƒ$4≤"ì∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢6ˆÁ7B7FGW46ˆFR“ÁV÷&W"ÜSÚÁ7FGW46ˆFR«¬SÚÁ7FGW2«¬Cì∞¢&W2Á7FGW2á7FGW46ˆFR„“Cbb7FGW46ˆFR¬cÚ7FGW46ˆFR¢CíÊß6ˆ‚á≤W'&˜#¢RÊ÷W76vR«¬.ä>ãâÆà~ã.âûòNäòéäÆã>òä>ò~àÇ"“ì∞¢“fñÊ∆«í∞¢6∆ñVÁBÁ&V∆V6RÇì∞¢–ß“ì∞†¶Á˜7BÇ"ˆˆffW'2Û¶ˆffW%ˆñB˜Fñ÷R◊&˜˜6¬"¬&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7BˆffW$ñB“ÁV÷&W"á&WÁ&◊2ÊˆffW%ˆñBì∞¢6ˆÁ7BW6W&Ê÷R“ˆWFÖW6W&Ê÷Rá&Wì∞¢6ˆÁ7B&˜˜6VE&r“&WÊ&ˆGìÚÁ&˜˜6VEˆFFWFñ÷R«¬&WÊ&ˆGìÚÁ&˜˜6VDFFWFñ÷R«¬"#∞¢6ˆÁ7BÊ˜FR“7G&ñÊrá&WÊ&ˆGìÚÊÊ˜FR«¬""íÁG&ñ“ÇíÁ6∆ñ6RÉ¬ì∞¢6ˆÁ7B&˜˜6VDó6Ú“Ê˜&÷∆ó¶TˆñÁF÷VÁDFFWFñ÷Rá&˜˜6VE&rì∞¢6ˆÁ7B&˜˜6VDFFR“ÊWrFFRá&˜˜6VDó6Úì∞†¢ñbÇÁV÷&W"Êó4ñÁFVvW"ÜˆffW$ñBí«¬ˆffW$ñB√“í&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.à.òûäﬁòäÆâûäﬁà~ã.âûòNäòéânãûàâ^òûäﬁàr"“ì∞¢ñbÇ&˜˜6VE&r«¬ÁV÷&W"Êó4Ê‚á&˜˜6VDFFRÊvWEFñ÷RÇííí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.àä>ãéâ>ã.òä^ã~äﬁàòä~ä^ã.ò>äæäòéò>äæòûânãûàâ^òûäﬁàr"“ì∞¢ñbá&˜˜6VDFFRÊvWEFñ÷RÇí√“FFRÊÊ˜rÇíí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.òä~ä^ã.ò>äæäòéâ^òûäﬁà~òâæò~âûòä~ä^ã.ò>âûäﬁâûã.àNâR"“ì∞†¢6ˆÁ7B6∆ñVÁB“vóBˆˆ¬Ê6ˆÊÊV7BÇì∞¢G'í∞¢vóB6∆ñVÁBÁVW'íÇ$$Ttî‚"ì∞¢vóBWáó&UFV6ÜÊñ6ñ‰66WE7FGW6W2Ü6∆ñVÁB¬W6W&Ê÷Rì∞†¢6ˆÁ7BˆffW%"“vóB6∆ñVÁBÁVW'íÄ¢4TƒT5BˆffW%ˆñB¬¶ˆ%ˆñB¬FV6ÜÊñ6ñÂ˜W6W&Ê÷R¬7FGW2¬Wáó&W5ˆ@¢e$Ù“V&∆ñ2Ê¶ˆ%ˆˆffW'0¢tÑU$RˆffW%ˆñC“C¢dı"UDDV¿¢∂ˆffW$ñE–¢ì∞¢6ˆÁ7BˆffW"“ˆffW%"Á&˜w5≥”∞¢ñbÇˆffW"íFá&˜rÊWrW'&˜"Ç.òNäòéâÓâÆà.òûäﬁòäÆâûäﬁà~ã.âûâûã^òí"ì∞¢ñbÜˆffW"Á7FGW2”“'VÊFñÊr"íFá&˜rÊWrW'&˜"Ç.à.òûäﬁòäÆâûäﬁà~ã.âûâûã^òûânãûàâ^äﬁâÆòNâæòä^òûär"ì∞¢ñbÜÊWrFFRÜˆffW"ÊWáó&W5ˆBíÊvWEFñ÷RÇí¬FFRÊÊ˜rÇííFá&˜rÊWrW'&˜"Ç.äæäâNòä~ä^ã.ä>ãâÆà~ã.âûòä^òûär"ì∞¢vóB76W'DˆffW$˜vÊVD'ï6W76ñˆÂFV6ÜÊñ6ñ‚áW6W&Ê÷R¬ˆffW"ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷Rì∞†¢6ˆÁ7B¶ˆ%"“vóB6∆ñVÁBÁVW'íÄ¢4TƒT5B¶ˆ%ˆñB¬ˆñÁF÷VÁEˆFFWFñ÷R¬4ÙƒU44RÜGW&FñˆÂˆ÷ñ‚√cí2GW&FñˆÂˆ÷ñ‚¿¢4ÙƒU44RÜ∆∆˜u˜Fñ÷U˜&˜˜6¬ƒd≈4Rí2∆∆˜u˜Fñ÷U˜&˜˜6¬¿¢FV6ÜÊñ6ñÂ˜W6W&Ê÷R¬FV6ÜÊñ6ñÂ˜FV–¢e$Ù“V&∆ñ2Ê¶ˆ'0¢tÑU$R¶ˆ%ˆñC“C¢dı"UDDV¿¢∂ˆffW"Ê¶ˆ%ˆñE–¢ì∞¢6ˆÁ7B¶ˆ"“¶ˆ%"Á&˜w5≥”∞¢ñbÇ¶ˆ"íFá&˜rÊWrW'&˜"Ç.òNäòéâÓâÆà~ã.âûâûã^òí"ì∞¢ñbÇ¶ˆ"Ê∆∆˜u˜Fñ÷U˜&˜˜6¬íFá&˜rÊWrW'&˜"Ç.à~ã.âûâûã^òûä.ãà~òNäòéòâæãNâNò>äæòûòäÆâûäﬁòä~ä^ã.ò>äæäòÇ"ì∞¢ñbÜ¶ˆ"ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R«¬¶ˆ"ÁFV6ÜÊñ6ñÂ˜FV“íFá&˜rÊWrW'&˜"Ç.à~ã.âûâûã^òûäã^àÆòéã.à~ä>ãâÆòNâæòä^òûär"ì∞¢ñbÜÊWrFFRÜ¶ˆ"ÊˆñÁF÷VÁEˆFFWFñ÷RíÊvWEFñ÷RÇí””“&˜˜6VDFFRÊvWEFñ÷RÇííFá&˜rÊWrW'&˜"Ç.àä>ãéâ>ã.òä^ã~äﬁàòä~ä^ã.â~ã^òéâ^òéã.à~àéã.àòä~ä^ã.âûãâNòâNãNä"ì∞†¢6ˆÁ7Bg&VR“vóBó5FV6Ñg&VRÜˆffW"ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬&˜˜6VDó6Ú¬¶ˆ"ÊGW&FñˆÂˆ÷ñ‚¬ˆffW"Ê¶ˆ%ˆñBì∞¢ñbÇg&VRíFá&˜rÊWrW'&˜"Ç.òä~ä^ã.â~ã^òéòäÆâûäﬁàÆâûàãâÆàNãNä~äﬁã~òéâûà.äﬁà~àÆòéã.àràä>ãéâ>ã.òä^ã~äﬁàòä~ä^ã.äﬁã~òéâí"ì∞†¢6ˆÁ7BñÁ2“vóB6∆ñVÁBÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2Ê¶ˆ%ˆˆffW%˜Fñ÷U˜&˜˜6«0¢ÜˆffW%ˆñB¬¶ˆ%ˆñB¬FV6ÜÊñ6ñÂ˜W6W&Ê÷R¬&˜˜6VEˆFFWFñ÷R¬Ê˜FR¬7FGW2ê¢d≈TU2ÇC¬C"¬C2¬CB¬CR¬wVÊFñÊrrê¢$UEU$‰î‰r&˜˜6≈ˆñF¿¢∂ˆffW"ÊˆffW%ˆñB¬ˆffW"Ê¶ˆ%ˆñB¬ˆffW"ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬&˜˜6VDó6Ú¬Ê˜FR«¬ÁV∆≈–¢ì∞†¢ÚÚòäã~òéäﬁàÆòéã.à~òäÆâûäﬁòä~ä^ã.ò>äæäòÇò>äæòûàã.ä>òŒâNäæã.ä.àéã.ààÆòéã.à~àNâûâûãòûâûòä^ãäÆòéà~à~ã.âûàä^ãâÆòNâæò>äæòûòäﬁâNäãNâûâÓãNàéã.ä>â>ã.â~ãâûâ~ãP¢vóB6∆ñVÁBÁVW'íÜUDDRV&∆ñ2Ê¶ˆ%ˆˆffW'24UB7FGW3“vWáó&VBr¬&W7ˆÊFVEˆC‘‰ırÇítÑU$RˆffW%ˆñC“C¬∂ˆffW"ÊˆffW%ˆñE“ì∞¢vóB6∆ñVÁBÁVW'íÜUDDRV&∆ñ2Ê¶ˆ'24UB¶ˆ%˜7FGW3“~ä>äﬁâÓãNàéã.ä>â>ã.òä~ä^ã.ò>äæäòÇr¬FV6ÜÊñ6ñÂ˜W6W&Ê÷S‘ÂTƒ¬¬FV6ÜÊñ6ñÂ˜FV”‘ÂTƒ¬¬Fó7F6Öˆ÷ˆFS“vˆffW"rtÑU$R¶ˆ%ˆñC“C‰BFV6ÜÊñ6ñÂ˜FV“ï2ÂTƒ∆¬∂ˆffW"Ê¶ˆ%ˆñE“ì∞†¢vóB6∆ñVÁBÁVW'íÇ$4Ù‘‘ïB"ì∞¢&WGW&‚&W2Êß6ˆ‚á∞¢7V66W73¢G'VR¿¢&˜˜6≈ˆñC¢ñÁ2Á&˜w5≥”ÚÁ&˜˜6≈ˆñB¿¢÷W76vS¢.äÆòéà~òä~ä^ã.ò>äæäòéò>äæòûòäﬁâNäãNâûâÓãNàéã.ä>â>ã.òä^òûärà~ã.âûä.ãà~òNäòéânãûàääﬁâÆäæäã.ä.àéâûàä~òéã.òäﬁâNäãNâûòä^ãä^ãûààNòûã.àéãä.ã~âûä.ãâí"¿¢“ì∞¢“6F6ÇÜRí∞¢vóB6∆ñVÁBÁVW'íÇ%$Ùƒƒ$4≤"ì∞¢6ˆÁ6ˆ∆RÊW'&˜"Ç%ı5BˆˆffW'2Û¶ˆffW%ˆñB˜Fñ÷R◊&˜˜6¬W'&˜#¢"¬Rì∞¢6ˆÁ7B7FGW46ˆFR“ÁV÷&W"ÜSÚÁ7FGW46ˆFR«¬SÚÁ7FGW2«¬Cì∞¢&WGW&‚&W2Á7FGW2á7FGW46ˆFR„“Cbb7FGW46ˆFR¬cÚ7FGW46ˆFR¢CíÊß6ˆ‚á≤W'&˜#¢RÊ÷W76vR«¬.äÆòéà~òä~ä^ã.ò>äæäòéòNäòéäÆã>òä>ò~àÇ"“ì∞¢“fñÊ∆«í∞¢6∆ñVÁBÁ&V∆V6RÇì∞¢–ß“ì∞†¶Á˜7BÇ"ˆˆffW'2Û¶ˆffW%ˆñBˆFV6∆ñÊR"¬&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B≤ˆffW%ˆñB““&WÁ&◊3∞¢6ˆÁ7BW6W&Ê÷R“ˆWFÖW6W&Ê÷Rá&Wì∞†¢6ˆÁ7B6∆ñVÁB“vóBˆˆ¬Ê6ˆÊÊV7BÇì∞¢G'í∞¢vóB6∆ñVÁBÁVW'íÇ$$Ttî‚"ì∞¢vóBWáó&UFV6ÜÊñ6ñ‰66WE7FGW6W2Ü6∆ñVÁB¬W6W&Ê÷Rì∞†¢6ˆÁ7BˆffW%"“vóB6∆ñVÁBÁVW'íÄ¢4TƒT5BˆffW%ˆñB¬¶ˆ%ˆñB¬FV6ÜÊñ6ñÂ˜W6W&Ê÷R¬7FGW2¬Wáó&W5ˆ@¢e$Ù“V&∆ñ2Ê¶ˆ%ˆˆffW'0¢tÑU$RˆffW%ˆñC“C¢dı"UDDV¿¢∂ˆffW%ˆñE–¢ì∞¢ñbÜˆffW%"Á&˜w2Ê∆VÊwFÇ””“íFá&˜rÊWrW'&˜"Ç.òNäòéâÓâ¢ˆffW""ì∞†¢6ˆÁ7BˆffW"“ˆffW%"Á&˜w5≥”∞¢ñbÜˆffW"Á7FGW2”“'VÊFñÊr"íFá&˜rÊWrW'&˜"Ç&ˆffW"âûã^òûânãûàâ^äﬁâÆòNâæòä^òûär"ì∞¢vóB76W'DˆffW$˜vÊVD'ï6W76ñˆÂFV6ÜÊñ6ñ‚áW6W&Ê÷R¬ˆffW"ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷Rì∞†¢ñbÜÊWrFFRÜˆffW"ÊWáó&W5ˆBí¬ÊWrFFRÇíí∞¢vóB6∆ñVÁBÁVW'íÜUDDRV&∆ñ2Ê¶ˆ%ˆˆffW'24UB7FGW3“vWáó&VBr¬&W7ˆÊFVEˆC‘‰ırÇítÑU$RˆffW%ˆñC“C¬∂ˆffW%ˆñE“ì∞†¢ÚÚ)»RàNã~âûà~ã.âûàä^ãâÆäæâûòûã.òäﬁâNäãNâíéânòûã.òâæò~âíˆffW"òä^ãä.ãà~òNäòéòNâNòûä>ãâÆàéä>ãNàrê¢vóB6∆ñVÁBÁVW'íÄ¢UDDRV&∆ñ2Ê¶ˆ'0¢4UBFV6ÜÊñ6ñÂ˜W6W&Ê÷S‘ÂTƒ¬¿¢FV6ÜÊñ6ñÂ˜FV”‘ÂTƒ¬¿¢Fó7F6Öˆ÷ˆFS“vˆffW"p¢tÑU$R¶ˆ%ˆñC“C¢‰B4ÙƒU44RÜFó7F6Öˆ÷ˆFR¬rrì“vˆffW"p¢‰BFV6ÜÊñ6ñÂ˜FV“ï2ÂTƒ¿¢‰BFV6ÜÊñ6ñÂ˜W6W&Ê÷S“C&¿¢∂ˆffW"Ê¶ˆ%ˆñB¬ˆffW"ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷U–¢ì∞†¢vóB6∆ñVÁBÁVW'íÇ$4Ù‘‘ïB"ì∞†¢vóBWFÙfñÊ∆ó¶UW&vVÁD¶ˆ'2Çì∞¢&WGW&‚&W2Êß6ˆ‚á≤7V66W73¢G'VR¬7FGW3¢&Wáó&VB"“ì∞¢–†¢vóB6∆ñVÁBÁVW'íÜUDDRV&∆ñ2Ê¶ˆ%ˆˆffW'24UB7FGW3“vFV6∆ñÊVBr¬&W7ˆÊFVEˆC‘‰ırÇítÑU$RˆffW%ˆñC“C¬∂ˆffW%ˆñE“ì∞¢6ˆÁ6ˆ∆RÊ∆ˆrÇ%∑W&vVÁEˆFV6∆ñÊU“"¬≤ˆffW%ˆñB¬¶ˆ%ˆñC¢ˆffW"Ê¶ˆ%ˆñB¬FV6É¢ˆffW"ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R“ì∞†¢ÚÚ)»RàNã~âûà~ã.âûàä^ãâÆäæâûòûã.òäﬁâNäãNâíéânòûã.òâæò~âíˆffW"òä^ãä.ãà~òNäòéòNâNòûä>ãâÆàéä>ãNàrê¢vóB6∆ñVÁBÁVW'íÄ¢UDDRV&∆ñ2Ê¶ˆ'0¢4UBFV6ÜÊñ6ñÂ˜W6W&Ê÷S‘ÂTƒ¬¿¢FV6ÜÊñ6ñÂ˜FV”‘ÂTƒ¬¿¢Fó7F6Öˆ÷ˆFS“vˆffW"p¢tÑU$R¶ˆ%ˆñC“C¢‰B4ÙƒU44RÜFó7F6Öˆ÷ˆFR¬rrì“vˆffW"p¢‰BFV6ÜÊñ6ñÂ˜FV“ï2ÂTƒ¿¢‰BFV6ÜÊñ6ñÂ˜W6W&Ê÷S“C&¿¢∂ˆffW"Ê¶ˆ%ˆñB¬ˆffW"ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷U–¢ì∞†¢vóB6∆ñVÁBÁVW'íÇ$4Ù‘‘ïB"ì∞¢vóBWFÙfñÊ∆ó¶UW&vVÁD¶ˆ'2Çì∞¢&W2Êß6ˆ‚á≤7V66W73¢G'VR¬7FGW3¢&FV6∆ñÊVB"¬¶ˆ%ˆñC¢ˆffW"Ê¶ˆ%ˆñB“ì∞¢“6F6ÇÜRí∞¢vóB6∆ñVÁBÁVW'íÇ%$Ùƒƒ$4≤"ì∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢6ˆÁ7B7FGW46ˆFR“ÁV÷&W"ÜSÚÁ7FGW46ˆFR«¬SÚÁ7FGW2«¬Cì∞¢&W2Á7FGW2á7FGW46ˆFR„“Cbb7FGW46ˆFR¬cÚ7FGW46ˆFR¢CíÊß6ˆ‚á≤W'&˜#¢RÊ÷W76vR«¬.òNäòéä>ãâÆà~ã.âûòNäòéäÆã>òä>ò~àÇ"“ì∞¢“fñÊ∆«í∞¢6∆ñVÁBÁ&V∆V6RÇì∞¢–ß“ì∞†¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	˘©rE$dT¬5D%Béòä>ãNòéäòâNãNâûâ~ã.àrê¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶7ñÊ2gVÊ7Fñˆ‚76W'D¶ˆ$7FñˆÊ&∆Tf˜%FV6ÜÊñ6ñ‚ÜF"¬¶ˆ%ˆñBí∞¢6ˆÁ7B"“vóBF"ÁVW'íÄ¢4TƒT5B¶ˆ%˜7FGW2e$Ù“V&∆ñ2Ê¶ˆ'2tÑU$R¶ˆ%ˆñC“Cƒî‘ïB¿¢∂¶ˆ%ˆñE–¢ì∞¢6ˆÁ7B7FGW2“7G&ñÊrá"Á&˜w3ÚÂ≥”ÚÊ¶ˆ%˜7FGW2«¬rríÁG&ñ“Çì∞¢ñbÖ≤~ä>äﬁâ^ä>ä~àéäÆäﬁâ¢r¬wVÊFñÊu˜&WfñWru“ÊñÊ6«VFW2á7FGW2íí∞¢6ˆÁ7BW'"“ÊWrW'&˜"Ç~ä>òéã.à~à~ã.âí(	Bä>äﬁòäﬁâNäãNâûäﬁâûãéäãâ^ãBrì∞¢W'"Á7FGW2“Cì∞¢W'"Ê6ˆFR“uDT4Ñ‰î4îÂÙE$eEÙ§Ù%ÙƒÙ4¥TBs∞¢Fá&˜rW'#∞¢–ß–†¶Á˜7BÇ"ˆ¶ˆ'2Û¶¶ˆ%ˆñB˜G&fV¬◊7F'B"¬&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B≤¶ˆ%ˆñB““&WÁ&◊3∞¢G'í∞¢6ˆÁ7B&VƒñB“vóB&W6ˆ«fT¶ˆ$ñDÁíáˆˆ¬¬¶ˆ%ˆñBì∞¢ñbÇ&VƒñBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢&¶ˆ%ˆñBòNäòéânãûàâ^òûäﬁàr"“ì∞¢6ˆÁ7BFV6ÜÊñ6ñÂ˜W6W&Ê÷R“vóB&WVó&UFV6Ñ˜vÁ5&W6ˆ«fVD¶ˆ"á&W¬&W2¬&VƒñB¬ˆˆ¬ì∞¢ñbÇFV6ÜÊñ6ñÂ˜W6W&Ê÷Rí&WGW&„∞¢vóB76W'D¶ˆ$7FñˆÊ&∆Tf˜%FV6ÜÊñ6ñ‚áˆˆ¬¬&VƒñBì∞†¢vóBˆˆ¬ÁVW'íÄ¢UDDRV&∆ñ2Ê¶ˆ'0¢4UBG&fV≈˜7F'FVEˆB“4ÙƒU44RáG&fV≈˜7F'FVEˆB¬‰ırÇíê¢tÑU$R¶ˆ%ˆñC“C¿¢∑&VƒñE–¢ì∞¢&W2Êß6ˆ‚á≤7V66W73¢G'VR“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÑÁV÷&W"ÜRÁ7FGW2«¬SííÊß6ˆ‚á≤W'&˜#¢RÊ÷W76vR«¬.âÆãâûâ~ãnàòä>ãNòéäòâNãNâûâ~ã.à~òNäòéäÆã>òä>ò~àÇ"¬6ˆFS¢RÊ6ˆFR«¬VÊFVfñÊVB“ì∞¢–ß“ì∞†¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	˘8“4ÑT4≤‘î‡¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚu2fóÇ6ˆ'6W"FÜ‚FÜó2Ü÷WG&W2í6ÊÊ˜B&RG'W7FVBf˜"S“&˜VÊF'ê¢ÚÚFV6ó6ñˆ‚(	B&V¶V7B2&WG'ñ&∆R&FÜW"FÜ‚72Êˆ÷ñÊ¬÷'WB◊VÁW6&∆RˆñÁB‡¶6ˆÁ7B‘ÖÙ4ÑT4¥îÂÙ45U$5ïÙ““#∞†¢ÚÚ5E$î5BÁV÷W&ñ2'6S¢66WBˆÊ«í&V¬•2ÁV÷&W"˜"ÁV÷W&ñ27G&ñÊr‡¢ÚÚÁV∆¬˜VÊFVfñÊVBÚ""˜vÜóFW76Rˆ&ˆˆ∆VÁ2ˆ'&ó2ˆˆ&¶V7G2∆¬&V6ˆ÷RÊ‚ÊB&P¢ÚÚ&V¶V7FVB(	BÁV÷&W"ÜÁV∆¬ì”””ÚÁV÷&W"Öµ“ì”””◊W7BÊWfW"6∆óFá&˜VvÇ2É√í‡¢ÚÚvVÁVñÊR&V¬¶W&ÚÉ˜"#"íó2&W6W'fVB2f∆ñB6ˆ˜&FñÊFRf«VR‡¶gVÊ7Fñˆ‚7G&ñ7DÁV÷W&ñ4˜$Ê‚ábí∞¢ñbáGóVˆbb””“&ÁV÷&W""í&WGW&‚ÁV÷&W"Êó4fñÊóFRábíÚb¢Ê„∞¢ñbáGóVˆbb””“'7G&ñÊr"í∞¢6ˆÁ7B2“bÁG&ñ“Çì∞¢ñbÇıÂ≤≤’”ÚÉÛ•∆Bµ¬„ı∆Bß≈¬Â∆B≤íÉÛ•∂TU’≤≤’”ı∆B≤ìÚBÚÁFW7Bá2íí&WGW&‚Ê„∞¢6ˆÁ7B‚“ÁV÷&W"á2ì∞¢&WGW&‚ÁV÷&W"Êó4fñÊóFRÜ‚íÚ‚¢Ê„∞¢–¢&WGW&‚Ê„∞ß–†¢ÚÚ5E$î5B6ˆ˜&FñÊFR’ï"f∆ñFFñˆ‚f˜"F÷ñ‚◊7W∆ñVBw2fñV∆G2‚&WGW&Á0¢ÚÚ∂∆B∆∆Êw“ˆÊ«ívÜV‚$ıDÇ&R&V¬fñÊóFRÁV÷&W'2ñ‚f∆ñB&ÊvRÊBÊ˜BFÜP¢ÚÚÉ√íÁV∆¬÷ó6∆ÊBó#≤˜FÜW'vó6RÁV∆¬‚ÁV∆¬Ú""ÚvÜóFW76RÚ&ˆˆ∆V‚¢ÚÚ'&íÚˆ&¶V7BÊWfW"&V6ˆ÷R(	BÁV÷&W"ÜÁV∆¬ì”””◊W7BÊWfW"W'6ó7B2É√í‡¶gVÊ7Fñˆ‚7G&ñ7D∆D∆Êuó$˜$ÁV∆¬Ü∆E&r¬∆Êu&rí∞¢6ˆÁ7B∆B“7G&ñ7DÁV÷W&ñ4˜$Ê‚Ü∆E&rì∞¢6ˆÁ7B∆Êr“7G&ñ7DÁV÷W&ñ4˜$Ê‚Ü∆Êu&rì∞¢ñbÇÁV÷&W"Êó4fñÊóFRÜ∆Bí«¬ÁV÷&W"Êó4fñÊóFRÜ∆Êríí&WGW&‚ÁV∆√∞¢ñbÑ÷FÇÊ'2Ü∆Bí‚ì«¬÷FÇÊ'2Ü∆Êrí‚Éí&WGW&‚ÁV∆√∞¢ñbÜ∆B””“bb∆Êr””“í&WGW&‚ÁV∆√∞¢&WGW&‚≤∆B¬∆Êr”∞ß–†¢ÚÚ6ˆ˜&FñÊFRfñV∆B6˜VÁG22'&˜fñFVB"ˆÊ«ívÜV‚óBó2Êˆ‚÷&∆Ê≤f«VR‡¢ÚÚVÊFVfñÊVBÚÁV∆¬Ú""ÚvÜóFW76R“Ê˜B&˜fñFVB‡¶gVÊ7Fñˆ‚6ˆ˜&DfñV∆E&˜fñFVBábí∞¢&WGW&‚b”“VÊFVfñÊVBbbb”“ÁV∆¬bb7G&ñÊrábíÁG&ñ“Çí”“rs∞ß–¢ÚÚ6Ü&VB7FñˆÊ&∆RFÜí÷W76vRf˜"‚ñÁf∆ñB¶ˆ"◊6óFR6ˆ˜&FñÊFRó"‡¶6ˆÁ7BîÂdƒîEÙ§Ù%ı4ïDUÙ4Ùı$Dî‰DU5Ù’4r“~âÓãNàãâNäæâûòûã.à~ã.âûòNäòéânãûàâ^òûäﬁàràä>ãéâ>ã.ä>ãâÆãÇ∆Bòä^ã∆Êrò>äæòûàNä>âÆâ~ãòûà~àNãûòéòä^ãäﬁä.ãûòéò>âûàÆòéä~à~â~ã^òéânãûàâ^òûäﬁàréòNäòéò>àÆòÇ√íäæä>ã~äﬁòä~òûâûä~òéã.à~â~ãòûà~àNãûòÇs∞†¶Á˜7BÇ"ˆ¶ˆ'2Û¶¶ˆ%ˆñBˆ6ÜV6∂ñ‚"¬&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B≤¶ˆ%ˆñB““&WÁ&◊3∞¢6ˆÁ7B&ˆGí“&WÊ&ˆGí«¬∑”∞¢6ˆÁ7B∆B“7G&ñ7DÁV÷W&ñ4˜$Ê‚Ü&ˆGíÊ∆Bì∞¢6ˆÁ7B∆Êr“7G&ñ7DÁV÷W&ñ4˜$Ê‚Ü&ˆGíÊ∆Êrì∞¢ÚÚ67W&7íÜ÷WG&W2íó2˜FñˆÊ¬'WB¬vÜV‚&W6VÁB¬◊W7B&Rf∆ñBÊˆ‚÷ÊVvFófP¢ÚÚÁV÷&W"6ÚvR6‚&V6ˆ‚&˜WBu26ˆÊfñFVÊ6RÊV"FÜRS“&˜VÊF'í‡¢6ˆÁ7BÜ467W&7í“&ˆGíÊ67W&7í”“VÊFVfñÊVBbb&ˆGíÊ67W&7í”“ÁV∆¬bb&ˆGíÊ67W&7í”“"#∞¢6ˆÁ7B67W&7í“Ü467W&7íÚ7G&ñ7DÁV÷W&ñ4˜$Ê‚Ü&ˆGíÊ67W&7íí¢ÁV∆√∞¢ÚÚ6GW&VEˆBó2Gfó6˜'íˆÊ«ì≤f∆ñFFR∆ˆ˜6V«íÊBñvÊ˜&RvÜV‚VÁ'6V&∆R‡¢6ˆÁ7B6GW&VDB“ÇÇí”‚∞¢6ˆÁ7Bb“&ˆGíÊ6GW&VEˆC∞¢ñbáb””“VÊFVfñÊVB«¬b””“ÁV∆¬«¬b””“""í&WGW&‚ÁV∆√∞¢6ˆÁ7BB“ÊWrFFRábì∞¢&WGW&‚ÁV÷&W"Êó4fñÊóFRÜBÊvWEFñ÷RÇííÚBÁFÙï4ı7G&ñÊrÇí¢ÁV∆√∞¢“íÇì∞†¢ÚÚ)»R7G&ñ7B6∆ñVÁB÷6ˆ˜&FñÊFRf∆ñFFñˆ‚‚&V¶V7G2÷ó76ñÊrˆÁV∆¬ˆV◊Gí¢ÚÚvÜóFW76Rˆ&ˆˆ∆V‚ˆ'&íˆˆ&¶V7BˆÊˆ‚÷ÁV÷W&ñ2$Tdı$RÁíFó7FÊ6R÷FÉ≤&V¿¢ÚÚ¶W&Ú6ˆ˜&FñÊFRó27Fñ∆¬66WFVBÉó2f∆ñB∆FóGVFRˆ∆ˆÊvóGVFRf«VRí‡¢ñbÇÁV÷&W"Êó4fñÊóFRÜ∆Bí«¬ÁV÷&W"Êó4fñÊóFRÜ∆Êrí«¬∆B¬”ì«¬∆B‚ì«¬∆Êr¬”É«¬∆Êr‚Éí∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.âÓãNàãâBu2òNäòéânãûàâ^òûäﬁàràä>ãéâ>ã.àâNä^äﬁà~ò>äæäòÇ"¬6ˆFS¢$îÂdƒîEÙ4Ùı$Dî‰DU2"“ì∞¢–¢ñbÜÜ467W&7íbbÇÁV÷&W"Êó4fñÊóFRÜ67W&7íí«¬67W&7í¬íí∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.âÓãNàãâBu2òNäòéânãûàâ^òûäﬁàràä>ãéâ>ã.àâNä^äﬁà~ò>äæäòÇ"¬6ˆFS¢$îÂdƒîEÙ4Ùı$Dî‰DU2"“ì∞¢–†¢ÚÚ6ÊóFó¶VBFñvÊ˜7Fñ72ˆÊ«í(	BÊWfW"∆ˆr&r6ˆ˜&FñÊFW2¬Fˆ∂V‚¬ÜˆÊR¬Ê÷R¿¢ÚÚ˜"FG&W72‚&˜VÊFVB67W&7íó26fRÊBW6VgV¬f˜"G&ñvR‡¢6ˆÁ7BFñr“≤Ü5ˆ67W&7ì¢Ü467W&7í¬67W&7ïˆ”¢Ü467W&7íÚ÷FÇÁ&˜VÊBÜ67W&7íí¢ÁV∆¬”∞†¢G'í∞¢6ˆÁ7B&VƒñB“vóB&W6ˆ«fT¶ˆ$ñDÁíáˆˆ¬¬¶ˆ%ˆñBì∞¢ñbÇ&VƒñBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢&¶ˆ%ˆñBòNäòéânãûàâ^òûäﬁàr"¬6ˆFS¢$îÂdƒîEÙ§Ù%ı$TdU$T‰4R"“ì∞¢6ˆÁ7BFV6ÜÊñ6ñÂ˜W6W&Ê÷R“vóB&WVó&UFV6Ñ˜vÁ5&W6ˆ«fVD¶ˆ"á&W¬&W2¬&VƒñB¬ˆˆ¬ì∞¢ñbÇFV6ÜÊñ6ñÂ˜W6W&Ê÷Rí&WGW&„∞¢vóB76W'D¶ˆ$7FñˆÊ&∆Tf˜%FV6ÜÊñ6ñ‚áˆˆ¬¬&VƒñBì∞†¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5Bw5ˆ∆FóGVFR¬w5ˆ∆ˆÊvóGVFR¬÷5˜W&¬e$Ù“V&∆ñ2Ê¶ˆ'2tÑU$R¶ˆ%ˆñC“C¿¢∑&VƒñE–¢ì∞¢ñbá"Á&˜w2Ê∆VÊwFÇ””“í&WGW&‚&W2Á7FGW2ÉCBíÊß6ˆ‚á≤W'&˜#¢.òNäòéâÓâÆà~ã.âí"“ì∞†¢6ˆÁ7B÷5W&¬“7G&ñÊrá"Á&˜w5≥“Ê÷5˜W&¬«¬""íÁG&ñ“Çì∞†¢ÚÚ)™˚àÚî’ı%DÂC†¢ÚÚÁV÷&W"ÜÁV∆¬í””“vÜñ6Çv˜V∆BñÊ6˜'&V7F«íf˜&6R6ÜV6≤÷ñ‚vñÁ7BÉ√í‡¢ÚÚW6R6fR6ˆÁfW'FW"6ÚÂTƒ¬ˆV◊Gí7Fó2Ê‚‡¢6ˆÁ7BFÙfñÊóFT˜$Ê‚“ábí”‚∞¢ñbáb””“ÁV∆¬«¬b””“VÊFVfñÊVBí&WGW&‚Ê„∞¢6ˆÁ7B2“GóVˆbb””“w7G&ñÊrrÚbÁG&ñ“Çí¢c∞¢ñbá2””“rrí&WGW&‚Ê„∞¢6ˆÁ7B‚“ÁV÷&W"á2ì∞¢&WGW&‚ÁV÷&W"Êó4fñÊóFRÜ‚íÚ‚¢Ê„∞¢”∞†¢∆WB6óFT∆B“FÙfñÊóFT˜$Ê‚á"Á&˜w5≥“Êw5ˆ∆FóGVFRì∞¢∆WB6óFT∆Êr“FÙfñÊóFT˜$Ê‚á"Á&˜w5≥“Êw5ˆ∆ˆÊvóGVFRì∞†¢ÚÚG&VBÉ√íÊB˜WB÷ˆb÷&˜VÊG22ñÁf∆ñB6VÁFñÊV¬‡¢ÚÚ6ˆ÷Rˆ∆FW"&V6˜&G266ñFVÁF∆«í7F˜&VBÛvÜV‚'6ñÊrfñ∆VB‡¢6ˆÁ7Bó5f∆ñE6óFT∆D∆Êr“Ü∆¬∆Úí”‚∞¢ñbÇÁV÷&W"Êó4fñÊóFRÜ∆í«¬ÁV÷&W"Êó4fñÊóFRÜ∆Úíí&WGW&‚f«6S∞¢ñbÜ∆¬”ì«¬∆‚ì«¬∆Ú¬”É«¬∆Ú‚Éí&WGW&‚f«6S∞¢ÚÚÉ√íó2∆÷˜7B«vó2&Bf«VRf˜"FÜñ∆ÊB¶ˆ'0¢ñbÑ÷FÇÊ'2Ü∆í¬R”íbb÷FÇÊ'2Ü∆Úí¬R”íí&WGW&‚f«6S∞¢&WGW&‚G'VS∞¢”∞†¢ÚÚf˜"vˆˆv∆R÷2U$«2¬Ê˜B∆¬WáG&7FVB6ˆ˜&FñÊFW2&RWV∆«íG'W7Gv˜'Fáí‡¢ÚÚ“#6CFB"ÊB'"W7V∆«í&W&W6VÁBFÜRñÊÊVB∆6RÚWá∆ñ6óB∆B∆∆ÊrÜÜñvÇ6ˆÊfñFVÊ6Rê¢ÚÚ“$"ÊB&6VÁFW""&RfñWw˜'B6ˆ˜&FñÊFW2ÜˆgFV‚‰ıBFÜR∆6Rñ‚í”‚◊W7B‰ıBVÊf˜&6RS–¢6ˆÁ7Bó4VÊf˜&6V÷VÁEV∆óGïfñ“áfñí”‚∞¢6ˆÁ7Bb“7G&ñÊráfñ«¬""íÁFÙ∆˜vW$66RÇì∞¢&WGW&‚b””“#6CFB"«¬b””“'"«¬b””“&ß6ˆ‚#∞¢”∞†¢ÚÚ)»Rï55TR”éâ^ã.ä&WVó&V÷VÁBä^òéã.äÆãéâBì†¢ÚÚ“ânòûã"&÷5˜W&¬"òâæä^à~âÓãNàãâNòNâNòûàéä>ãNàr”‚âÆãà~àNãâ¢S“éò>àÆòûâÓãNàãâNâ~ã^òéòâæä^à~àéã.àU$¬òâæò~âûäæä^ãàê¢ÚÚ“ânòûã"&÷5˜W&¬"òâæä^à~âÓãNàãâNòNäòéòNâNòí”‚òNäòéâÆãà~àNãâ¢S“òä^ãòàÆò~àNäﬁãNâûòNâNòûâæàâ^ã@¢ÚÚ“ânòûã.òNäòéäãR÷5˜W&¬òä^ä"”‚f∆∆&6≤ò>àÆòíw5ˆ∆FóGVFRˆw5ˆ∆ˆÊvóGVFRâ~ã^òéòàò~âÆòNä~òíÜ&6∑v&B÷6ˆ◊Fñ&∆Rê¢∆WBÜ56óFT∆D∆Êr“f«6S∞†¢ÚÚG'íFÚFW&ófRg&ˆ“÷5˜W&¬fó'7BÜWFÜ˜&óFFófRf˜"VÊf˜&6V÷VÁBê¢∆WBFW&ófVDg&ˆ’W&¬“ÁV∆√∞¢ñbÜ÷5W&¬í∞¢FW&ófVDg&ˆ’W&¬“'6T∆D∆Êtg&ˆ’FWáBÜ÷5W&¬ì∞¢ñbÇFW&ófVDg&ˆ’W&¬bbˆ÷5¬Ê¬Êvˆı¬Êv«∆vˆı¬Êv¬ˆíÁFW7BÜ÷5W&¬íí∞¢G'í∞¢6ˆÁ7B'"“vóB&W6ˆ«fT÷5W&≈FÙ∆D∆ÊrÜ÷5W&¬ì∞¢ñbá'"bbÁV÷&W"Êó4fñÊóFRá'"Ê∆BíbbÁV÷&W"Êó4fñÊóFRá'"Ê∆Êríí∞¢ÚÚ&W6W'fR'"Áfñ6ÚvR6‚FV6ñFRvÜWFÜW"FÚVÊf˜&6R&6VBˆ‚V∆óGí‡¢FW&ófVDg&ˆ’W&¬“≤∆C¢'"Ê∆B¬∆Ês¢'"Ê∆Êr¬fñ¢'"Áfñ«¬'&W6ˆ«fW""”∞¢–¢“6F6ÇÖÚí∞¢ÚÚfñ¬÷˜V‡¢–¢–†¢ñbÄ¢FW&ófVDg&ˆ’W&¬b`¢ó5f∆ñE6óFT∆D∆ÊrÑÁV÷&W"ÜFW&ófVDg&ˆ’W&¬Ê∆Bí¬ÁV÷&W"ÜFW&ófVDg&ˆ’W&¬Ê∆Êrííb`¢ó4VÊf˜&6V÷VÁEV∆óGïfñÜFW&ófVDg&ˆ’W&¬Áfñê¢í∞¢ÚÚ)»RVÊf˜&6RˆÊ«ívÜV‚vRÜfRÜñvÇ÷6ˆÊfñFVÊ6R6óFR6ˆ˜&FñÊFW2‡¢6óFT∆B“ÁV÷&W"ÜFW&ófVDg&ˆ’W&¬Ê∆Bì∞¢6óFT∆Êr“ÁV÷&W"ÜFW&ófVDg&ˆ’W&¬Ê∆Êrì∞¢Ü56óFT∆D∆Êr“G'VS∞†¢ÚÚ66ÜRÜ&W7B÷Vff˜'BíˆÊ«íf˜"ÜñvÇ÷6ˆÊfñFVÊ6R6ˆ˜&FñÊFW0¢G'í∞¢vóBˆˆ¬ÁVW'íÄ¢UDDRV&∆ñ2Ê¶ˆ'24UBw5ˆ∆FóGVFS“C¬w5ˆ∆ˆÊvóGVFS“C"tÑU$R¶ˆ%ˆñC“C2‰BÜw5ˆ∆FóGVFRï2ÂTƒ¬ı"w5ˆ∆ˆÊvóGVFRï2ÂTƒ¬ı"Üw5ˆ∆FóGVFS”‰Bw5ˆ∆ˆÊvóGVFS”íñ¿¢∑6óFT∆B¬6óFT∆Êr¬&VƒñE–¢ì∞¢“6F6ÇÖÚí∑–¢“V«6R∞¢ÚÚ÷5˜W&¬WÜó7G2'WC†¢ÚÚ“6ÊÊ˜B&R'6VB¬ı ¢ÚÚ“ˆÊ«ífñWw˜'Bˆ6VÁFW"6ˆ˜&G2Ü∆˜r6ˆÊfñFVÊ6Rê¢ÚÚ”‚∆∆˜r6ÜV6≤÷ñ‚ÜÊÚS“VÊf˜&6V÷VÁBê¢Ü56óFT∆D∆Êr“f«6S∞¢–¢“V«6R∞¢ÚÚÊÚ÷5˜W&¬”‚f∆∆&6≤FÚ7F˜&VB6ˆ˜&G2f˜"∆Vv7í¶ˆ'0¢Ü56óFT∆D∆Êr“ó5f∆ñE6óFT∆D∆Êrá6óFT∆B¬6óFT∆Êrì∞¢–†¢∆WBFó7FÊ6R“ÁV∆√∞¢ñbÜÜ56óFT∆D∆Êrí∞¢6ˆÁ7BFı&B“ábí”‚áb¢÷FÇÂííÚÉ∞¢6ˆÁ7B"“c3s∞¢6ˆÁ7BD∆B“Fı&BÑÁV÷&W"Ü∆Bí“6óFT∆Bì∞¢6ˆÁ7BD∆Êr“Fı&BÑÁV÷&W"Ü∆Êrí“6óFT∆Êrì∞†¢6ˆÁ7B–¢÷FÇÁ6ñ‚ÜD∆BÚ"í¢¢"∞¢÷FÇÊ6˜2áFı&Bá6óFT∆Bíí¢÷FÇÊ6˜2áFı&BÑÁV÷&W"Ü∆Bííí¢÷FÇÁ6ñ‚ÜD∆ÊrÚ"í¢¢#∞†¢6ˆÁ7B2“"¢÷FÇÊF„"Ñ÷FÇÁ7'BÜí¬÷FÇÁ7'BÉ“íì∞¢Fó7FÊ6R“"¢3∞†¢ÚÚ'6ˆ«WFR67W&7ívFS¢vÜV‚FÜR6óFRó2VÊf˜&6VB¬fóÇ6ˆ'6W"FÜ‚FÜP¢ÚÚW6&∆RFá&W6Üˆ∆B6ÊÊ˜B6ˆÊfó&“FÜRFV6Çó2BFÜR6óFR(	BWfV‚Êˆ÷ñÊ¿¢ÚÚˆñÁBîÂ4îDRS“◊W7B&R&WG&ñVB&FÜW"FÜ‚66WFVB‡¢ñbÜÜ467W&7íbbÁV÷&W"Êó4fñÊóFRÜ67W&7ííbb67W&7í‚‘ÖÙ4ÑT4¥îÂÙ45U$5ïÙ“í∞¢6ˆÁ6ˆ∆RÊ∆ˆrÇ%∂6ÜV6∂ñÂ“"¬≤¶ˆ%ˆñC¢&VƒñB¬FV6É¢FV6ÜÊñ6ñÂ˜W6W&Ê÷R¬6óFU˜&WVó&VC¢G'VR¬Fó7FÊ6Uˆ”¢÷FÇÁ&˜VÊBÜFó7FÊ6Rí¬‚‚ÊFñr¬&W7V«C¢&67W&7ï˜Fˆıˆ∆˜uˆ'2"“ì∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á∞¢W'&˜#¢.äÆãàﬁàﬁã.â2u2ä.ãà~òNäòéòäòéâûâÓäﬁâ~ã^òéàéãä.ã~âûä.ãâûâ^ã>òäæâûòéàràä>ãéâ>ã.äﬁäﬁàòNâæâ~ã^òéò.ä^òéà~òä^òûä~àâNä^äﬁà~ò>äæäòÇ"¿¢6ˆFS¢$ƒÙ4DîÙÂÙ45U$5ïıDÙıÙƒır"¿¢67W&7ì¢÷FÇÁ&˜VÊBÜ67W&7íí¿¢“ì∞¢–†¢ñbÜFó7FÊ6R‚Sí∞¢ÚÚ)»R&V6ó6ñˆ‚&V6˜fW'ì¢ñb7F˜&VB6ˆ˜&G2&Rw&ˆÊr'WB÷5˜W&¬ó26˜'&V7B¿¢ÚÚ&R÷FW&ófR6ˆ˜&G2g&ˆ“÷5˜W&¬ÊB&R÷6ÜV6≤ˆÊ6RÜfñ¬÷˜V‚WÜ6WBf˜"G'VR÷˜WG6ñFRê¢ñbÜ÷5W&¬í∞¢G'í∞¢∆WBFW&ófVB“'6T∆D∆Êtg&ˆ’FWáBÜ÷5W&¬ì∞¢ñbÇFW&ófVBbbˆ÷5¬Ê¬Êvˆı¬Êv«∆vˆı¬Êv¬ˆíÁFW7BÜ÷5W&¬íí∞¢6ˆÁ7B'"“vóB&W6ˆ«fT÷5W&≈FÙ∆D∆ÊrÜ÷5W&¬ì∞¢ñbá'"bbÁV÷&W"Êó4fñÊóFRá'"Ê∆BíbbÁV÷&W"Êó4fñÊóFRá'"Ê∆ÊrííFW&ófVB“≤∆C¢'"Ê∆B¬∆Ês¢'"Ê∆Êr¬fñ¢'"Áfñ«¬'&W6ˆ«fW""”∞¢–¢ÚÚ&R÷6ÜV6≤ˆÊ«ívÜV‚FW&ófVB6ˆ˜&G2&RÜñvÇ÷6ˆÊfñFVÊ6S≤fñWw˜'B6ˆ˜&G2◊W7BÊ˜B&∆ˆ6≤6ÜV6≤÷ñ‚‡¢ñbÜFW&ófVBbbó5f∆ñE6óFT∆D∆ÊrÑÁV÷&W"ÜFW&ófVBÊ∆Bí¬ÁV÷&W"ÜFW&ófVBÊ∆Êrííbbó4VÊf˜&6V÷VÁEV∆óGïfñÜFW&ófVBÁfñíí∞¢6ˆÁ7BD∆C"“Fı&BÑÁV÷&W"Ü∆Bí“ÁV÷&W"ÜFW&ófVBÊ∆Bíì∞¢6ˆÁ7BD∆Ês"“Fı&BÑÁV÷&W"Ü∆Êrí“ÁV÷&W"ÜFW&ófVBÊ∆Êríì∞¢6ˆÁ7B"–¢÷FÇÁ6ñ‚ÜD∆C"Ú"í¢¢"∞¢÷FÇÊ6˜2áFı&BÑÁV÷&W"ÜFW&ófVBÊ∆Bííí¢÷FÇÊ6˜2áFı&BÑÁV÷&W"Ü∆Bííí¢÷FÇÁ6ñ‚ÜD∆Ês"Ú"í¢¢#∞¢6ˆÁ7B3"“"¢÷FÇÊF„"Ñ÷FÇÁ7'BÜ"í¬÷FÇÁ7'BÉ“"íì∞¢6ˆÁ7BFó7C"“"¢3#∞†¢ñbÜFó7C"√“Sí∞¢ÚÚ66ÜR6˜'&V7FVB6ˆ˜&G2Ü&W7B÷Vff˜'Bê¢G'í∞¢vóBˆˆ¬ÁVW'íÜUDDRV&∆ñ2Ê¶ˆ'24UBw5ˆ∆FóGVFS“C¬w5ˆ∆ˆÊvóGVFS“C"tÑU$R¶ˆ%ˆñC“C6¬¥ÁV÷&W"ÜFW&ófVBÊ∆Bí¬ÁV÷&W"ÜFW&ófVBÊ∆Êrí¬&VƒñE“ì∞¢“6F6ÇÖÚí∑–¢Fó7FÊ6R“Fó7C#∞¢–¢–¢“6F6ÇÖÚí∞¢ÚÚñvÊ˜&RÊB∂VW˜&ñvñÊ¬Fó7FÊ6P¢–¢–†¢ñbÜFó7FÊ6R‚Sí∞¢ÚÚ)»R&WVó&V÷VÁC¢ñbvR6ÊÊ˜B6ˆÊfñFVÁF«íˆ'Fñ‚f∆ñB6óFR6ˆ˜&FñÊFRÖU$¬Ê˜B'6V&∆Rê¢ÚÚFÜV‚FÚÊ˜B&∆ˆ6≤6ÜV6≤÷ñ‚‡¢ÚÚÜW&R¬ñbFÜRˆÊ«í6ˆ˜&FñÊFW2vW&RñÁf∆ñB˜6VÁFñÊV¬ÊBvR6˜V∆F‚wBFW&ófRf∆ñBˆÊR¿¢ÚÚÜ56óFT∆D∆Êvv˜V∆B&Rf«6RÊBvRv˜V∆F‚wB&RñÁ6ñFRFÜó2&∆ˆ6≤‡¢Ú¢ÚÚˆ˜"÷67W&7íwV&C¢ˆÊ«í&V¶V7B2&˜WG6ñFR"vÜV‚vR&R6ˆÊfñFVÁB(	@¢ÚÚíÊR‚FÜRFV6Çó2&WñˆÊBS“WfV‚gFW"∆∆˜vñÊrf˜"FÜRu2W'&˜ ¢ÚÚ&FóW2‚ñbFÜR&˜VÊF'í6óG2vóFÜñ‚FÜR67W&7íW'&˜"¬6≤f˜"¢ÚÚ&WG'íñÁ7FVBˆbf«6R&V¶V7Fñˆ‚Ü‚76ñvÊVBFV6ÇBFÜR6óFRvóFÄ¢ÚÚvV≤fóÇ◊W7BÊ˜B&R&∆ˆ6∂VBí‡¢ñbÜÜ467W&7íbbÁV÷&W"Êó4fñÊóFRÜ67W&7ííbbÜFó7FÊ6R“67W&7íí√“Sí∞¢6ˆÁ6ˆ∆RÊ∆ˆrÇ%∂6ÜV6∂ñÂ“"¬≤¶ˆ%ˆñC¢&VƒñB¬FV6É¢FV6ÜÊñ6ñÂ˜W6W&Ê÷R¬6óFU˜&WVó&VC¢G'VR¬Fó7FÊ6Uˆ”¢÷FÇÁ&˜VÊBÜFó7FÊ6Rí¬‚‚ÊFñr¬&W7V«C¢&67W&7ï˜Fˆıˆ∆˜r"“ì∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á∞¢W'&˜#¢.äÆãàﬁàﬁã.â2u2ä.ãà~òNäòéòäòéâûâÓäﬁâ~ã^òéàéãä.ã~âûä.ãâûâ^ã>òäæâûòéàràä>ãéâ>ã.äﬁäﬁàòNâæâ~ã^òéò.ä^òéà~òä^òûä~àâNä^äﬁà~ò>äæäòÇ"¿¢6ˆFS¢$ƒÙ4DîÙÂÙ45U$5ïıDÙıÙƒır"¿¢67W&7ì¢÷FÇÁ&˜VÊBÜ67W&7íí¿¢“ì∞¢–¢6ˆÁ6ˆ∆RÊ∆ˆrÇ%∂6ÜV6∂ñÂ“"¬≤¶ˆ%ˆñC¢&VƒñB¬FV6É¢FV6ÜÊñ6ñÂ˜W6W&Ê÷R¬6óFU˜&WVó&VC¢G'VR¬Fó7FÊ6Uˆ”¢÷FÇÁ&˜VÊBÜFó7FÊ6Rí¬‚‚ÊFñr¬&W7V«C¢&˜WG6ñFU˜&FóW2"“ì∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.äﬁä.ãûòéâûäﬁàâÓã~òûâûâ~ã^òéäæâûòûã.à~ã.âí"¬6ˆFS¢$ıUE4îDUÙ4ÑT4¥îÂı$DïU2"¬Fó7FÊ6S¢÷FÇÁ&˜VÊBÜFó7FÊ6Rí“ì∞¢–¢–¢–†¢ÚÚñFV◊˜FVÁC¢&W6W'fRFÜRdï%5B6ÜV6≤÷ñ‚Fñ÷W7F◊6Ú&R◊FñÊrFˆW2Ê˜@¢ÚÚ&W6WBóB˜"÷˜fRVÁ&V∆FVB¶ˆ"Fñ÷ñÊs≤7Fñ∆¬&V6˜&BFÜR∆FW7B6ˆ˜&FñÊFW2‡¢vóBˆˆ¬ÁVW'íÄ¢UDDRV&∆ñ2Ê¶ˆ'0¢4UB6ÜV6∂ñÂˆ∆FóGVFS“C¬6ÜV6∂ñÂˆ∆ˆÊvóGVFS“C"¬6ÜV6∂ñÂˆC‘4ÙƒU44RÜ6ÜV6∂ñÂˆB¬‰ırÇíê¢tÑU$R¶ˆ%ˆñC“C6¿¢∂∆B¬∆Êr¬&VƒñE–¢ì∞†¢6ˆÁ6ˆ∆RÊ∆ˆrÇ%∂6ÜV6∂ñÂ“"¬≤¶ˆ%ˆñC¢&VƒñB¬FV6É¢FV6ÜÊñ6ñÂ˜W6W&Ê÷R¬6óFU˜&WVó&VC¢Ü56óFT∆D∆Êr¬Fó7FÊ6Uˆ”¢Fó7FÊ6R”“ÁV∆¬ÚÁV∆¬¢÷FÇÁ&˜VÊBÜFó7FÊ6Rí¬‚‚ÊFñr¬&W7V«C¢&ˆ≤"“ì∞¢&W2Êß6ˆ‚á≤7V66W73¢G'VR¬Fó7FÊ6S¢Fó7FÊ6R”“ÁV∆¬ÚÁV∆¬¢÷FÇÁ&˜VÊBÜFó7FÊ6Rí¬6óFU˜&WVó&VC¢Ü56óFT∆D∆Êr¬6GW&VEˆC¢6GW&VDB“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Ç%∂6ÜV6∂ñÂ“W'&˜""¬≤¶ˆ%ˆñC¢7G&ñÊrÜ¶ˆ%ˆñBí¬÷W76vS¢RbbRÊ÷W76vR“ì∞¢&W2Á7FGW2ÑÁV÷&W"ÜRÁ7FGW2«¬SííÊß6ˆ‚á≤W'&˜#¢RÊ÷W76vR«¬.òàÆò~àNäﬁãNâûòNäòéäÆã>òä>ò~àÇ"¬6ˆFS¢RÊ6ˆFR«¬$4ÑT4¥îÂÙdîƒTB"“ì∞¢–ß“ì∞†¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	˘;rÑıDı0¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶Á˜7BÇ"ˆ¶ˆ'2Û¶¶ˆ%ˆñB˜Ü˜F˜2ˆ÷WF"¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B≤¶ˆ%ˆñB““&WÁ&◊3∞¢6ˆÁ7B≤Ü6R¬÷ñ÷U˜GóR¬˜&ñvñÊ≈ˆÊ÷R¬fñ∆U˜6ó¶R¬W∆ˆFVEˆ'í““&WÊ&ˆGí«¬∑”∞¢6ˆÁ7BÜ˜FÙÊ˜FR“7G&ñÊrá&WÊ&ˆGìÚÁÜ˜FıˆÊ˜FR«¬&WÊ&ˆGìÚÊÊ˜FR«¬rríÁG&ñ“ÇíÁ6∆ñ6RÉ¬Sì∞¢6ˆÁ7B&ˆGïVÊóDñB“ÁV÷&W"á&WÊ&ˆGìÚÁVÊóEˆñB«¬ì∞¢6ˆÁ7B&ˆGïVÊóD6ˆFR“7G&ñÊrá&WÊ&ˆGìÚÁVÊóEˆ6ˆFR«¬rríÁG&ñ“Çì∞¢6ˆÁ7B&ˆGïVÊóDÊÚ“ÁV÷&W"á&WÊ&ˆGìÚÁVÊóEˆÊÚ«¬ì∞¢6ˆÁ7BÜ˜FÙ6FVv˜'í“Ê˜&÷∆ó¶UÜ˜FÙ6FVv˜'íáÜ6R¬&WÊ&ˆGìÚÁÜ˜Fıˆ6FVv˜'íì∞†¢6ˆÁ7B∆∆˜vVEÜ6W2“∞¢&Ê÷W∆FR"¿¢&&Vf˜&R"¿¢&gFW""¿¢'&W77W&R"¿¢&7W'&VÁB"¿¢'FV◊"¿¢&FVfV7B"¿¢'ñ÷VÁE˜6∆ó"¿¢&66Ö˜G&Á6fW%˜6∆ó"¿¢'&Wfó6óEˆ&Vf˜&R"¿¢'&Wfó6óEˆgFW""¿¢'&Wfó6óEˆFVfV7B"¿¢”∞¢ñbÇ∆∆˜vVEÜ6W2ÊñÊ6«VFW2Ö7G&ñÊráÜ6Rííí∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢Ü6RòNäòéânãûàâ^òûäﬁàréâ^òûäﬁà~òâæò~âíG∂∆∆˜vVEÜ6W2Ê¶ˆñ‚Ç"¬"ó“ñ“ì∞¢–¢ñbÇ÷ñ÷U˜GóRí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢&÷ñ÷U˜GóRäæòûã.ää~òéã.àr"“ì∞†¢G'í∞¢6ˆÁ7B&VƒñB“vóB&W6ˆ«fT¶ˆ$ñDÁíáˆˆ¬¬¶ˆ%ˆñBì∞¢ñbÇ&VƒñBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢&¶ˆ%ˆñBòNäòéânãûàâ^òûäﬁàr"“ì∞¢vóB76W'D¶ˆ$7FñˆÊ&∆Tf˜%FV6ÜÊñ6ñ‚áˆˆ¬¬&VƒñBì∞¢∆WBVÊóD÷WF“≤VÊóEˆñC¢ÁV∆¬¬VÊóEˆ6ˆFS¢ÁV∆¬¬VÊóEˆÊÛ¢ÁV∆¬”∞¢ñbÑÁV÷&W"Êó4fñÊóFRÜ&ˆGïVÊóDñBíbb&ˆGïVÊóDñB‚í∞¢6ˆÁ7BVÊóE"“vóBˆˆ¬ÁVW'íÜ4TƒT5BVÊóEˆñB¬VÊóEˆ6ˆFR¬VÊóEˆÊÚe$Ù“V&∆ñ2Ê¶ˆ%˜VÊóG2tÑU$R¶ˆ%ˆñC“C‰BVÊóEˆñC“C"‰BG∂7FófT¶ˆ%VÊóEvÜW&RÇó“ƒî‘ïB¬∑&VƒñB¬&ˆGïVÊóDñE“ì∞¢ñbÇVÊóE"Á&˜w2Ê∆VÊwFÇí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.àä>ãéâ>ã.òä^ã~äﬁàòàNä>ã~òéäﬁà~â~ã^òéäﬁä.ãûòéò>âûà~ã.âûâûã^òûàòéäﬁâûäﬁãâæò.äæä^âNä>ãûâ≤"“ì∞¢VÊóD÷WF“VÊóE"Á&˜w5≥”∞¢–†¢ÚÚW∆ˆFVEˆ'ì¢â^òûäﬁà~òâæò~âûàÆòéã.à~â~ã^òéäﬁä.ãûòéò>âûâ~ã^äà.äﬁà~à~ã.âíéäæä>ã~äﬁàÆòéã.à~äæä^ãàíòâÓã~òéäﬁâŒãûàäæä^ãàâã.âûò>äæòûânãûààNâê¢ñbáW∆ˆFVEˆ'íí∞¢G'í∞¢6ˆÁ7BR“7G&ñÊráW∆ˆFVEˆ'í«¬rríÁG&ñ“Çì∞¢ñbáRí∞¢6ˆÁ7Bˆµ"“vóBˆˆ¬ÁVW'íÄ¢ ¢4TƒT5B¢e$Ù“V&∆ñ2Ê¶ˆ'2†¢ƒTeB§Ùî‚V&∆ñ2Ê¶ˆ%˜FV’ˆ÷V÷&W'2F“Ù‚F“Ê¶ˆ%ˆñC÷¢Ê¶ˆ%ˆñB‰BF“ÁW6W&Ê÷S“C ¢ƒTeB§Ùî‚V&∆ñ2Ê¶ˆ%ˆ76ñvÊ÷VÁG2¶Ù‚¶Ê¶ˆ%ˆñC÷¢Ê¶ˆ%ˆñB‰B¶ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷S“C ¢tÑU$R¢Ê¶ˆ%ˆñC“C‰BÜ¢ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷S“C"ı"¢ÁFV6ÜÊñ6ñÂ˜FV”“C"ı"F“ÁW6W&Ê÷Rï2‰ıBÂTƒ¬ı"¶ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷Rï2‰ıBÂTƒ¬ê¢ƒî‘ïB¢¿¢∑&VƒñB¬U–¢ì∞¢ñbÇˆµ"Á&˜w2Ê∆VÊwFÇí∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢'W∆ˆFVEˆ'íòNäòéânãûàâ^òûäﬁàréòNäòéòNâNòûäﬁä.ãûòéò>âûâ~ã^äà.äﬁà~à~ã.âíí"“ì∞¢–¢–¢“6F6ÇÜRí∞¢ÚÚfñ¬÷˜V„¢ânòûã.òàÆò~àNòNäòéäÆã>òä>ò~àÇòNäòéâÆä^ò~äﬁàNàã.ä>äﬁãâæò.äæä^âBòâ^òéàéãòàò~â¢ÁV∆¿¢6ˆÁ6ˆ∆RÁv&‚Çu∑Ü˜F˜2ˆ÷WF“W∆ˆFVEˆ'íf∆ñFFRfñ∆VBr¬RÊ÷W76vRì∞¢–¢–¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢ ¢îÂ4U%BîÂDÚV&∆ñ2Ê¶ˆ%˜Ü˜F˜0¢Ü¶ˆ%ˆñB¬Ü6R¬÷ñ÷U˜GóR¬˜&ñvñÊ≈ˆÊ÷R¬fñ∆U˜6ó¶R¬fñ∆U˜6ó¶Uˆ'óFW2¬Ü˜Fı˜GóR¬W∆ˆFVEˆ'í¬VÊóEˆñB¬VÊóEˆ6ˆFR¬VÊóEˆÊÚ¬Ü˜Fıˆ6FVv˜'í¬Ü˜FıˆÊ˜FRê¢d≈TU2ÇC¬C"¬C2¬CB¬CS£¶ñÁFVvW"¬C#£¶&ñvñÁBƒÂTƒ¬¬Cb¬Cr¬CÇ¬Cí¬C¬Cê¢$UEU$‰î‰rÜ˜Fıˆñ@¢¿¢∞¢&VƒñB¿¢Ü6R¿¢÷ñ÷U˜GóR¿¢˜&ñvñÊ≈ˆÊ÷R«¬ÁV∆¬¿¢ÁV÷&W"Êó4fñÊóFRÑÁV÷&W"Üfñ∆U˜6ó¶RííÚ÷FÇÊ÷ñ‚ÑÁV÷&W"Üfñ∆U˜6ó¶Rí¬#CsCÉ3cCrí¢ÁV∆¬¿¢W∆ˆFVEˆ'í«¬ÁV∆¬¿¢VÊóD÷WFÁVÊóEˆñB«¬ÁV∆¬¿¢VÊóD÷WFÁVÊóEˆ6ˆFR«¬&ˆGïVÊóD6ˆFR«¬ÁV∆¬¿¢VÊóD÷WFÁVÊóEˆÊÚ«¬ÑÁV÷&W"Êó4fñÊóFRÜ&ˆGïVÊóDÊÚíbb&ˆGïVÊóDÊÚ‚Ú&ˆGïVÊóDÊÚ¢ÁV∆¬í¿¢Ü˜FÙ6FVv˜'í¿¢Ü˜FÙÊ˜FR«¬ÁV∆¬¿¢ÁV÷&W"Êó4fñÊóFRÑÁV÷&W"Üfñ∆U˜6ó¶RííÚÁV÷&W"Üfñ∆U˜6ó¶Rí¢ÁV∆¬¿¢–¢ì∞¢&W2Êß6ˆ‚á≤7V66W73¢G'VR¬Ü˜FıˆñC¢"Á&˜w5≥“ÁÜ˜FıˆñB“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÑÁV÷&W"ÜRÁ7FGW2«¬SííÊß6ˆ‚á≤W'&˜#¢RÊ÷W76vR«¬.äÆä>òûã.àr÷WFFFä>ãûâæòNäòéäÆã>òä>ò~àÇ"¬6ˆFS¢RÊ6ˆFR«¬VÊFVfñÊVB“ì∞¢–ß“ì∞†¶gVÊ7Fñˆ‚6fTfñ∆VÊ÷RÜÊ÷Rí∞¢&WGW&‚7G&ñÊrÜÊ÷R«¬""íÁ&W∆6RÇıµÊ◊§’£”íÂÚ’“ˆr¬%Ú"íÁ6∆ñ6RÉ¬#ì∞ß–†¢ÚÚ)»RâÆãâûâ~ãnàFFU$¬Üñ÷vR˜Ês∂&6ScB¬‚‚‚íòâæò~âûòNâ˛ä^ò¿¶gVÊ7Fñˆ‚6fTFFW&≈ÊrÜFFW&¬¬fˆ∆FW"¬&VfóÇí∞¢ñbÇFFW&¬í&WGW&‚ÁV∆√∞¢6ˆÁ7B““7G&ñÊrÜFFW&¬íÊ÷F6ÇÇıÊFF¶ñ÷vU¬˜Ês∂&6ScB¬Ç‚≤íBÚì∞¢ñbÇ“íFá&˜rÊWrW'&˜"Ç'6ñvÊGW&UˆFFâ^òûäﬁà~òâæò~âûä>ãûâæòâÆâ¢FF¶ñ÷vR˜Ês∂&6ScB¬‚‚‚"ì∞†¢6ˆÁ7B#cB“’≥”∞¢6ˆÁ7B'Vb“'VffW"Êg&ˆ“Ü#cB¬&&6ScB"ì∞†¢6ˆÁ7B7F◊“ÊWrFFRÇíÁFÙï4ı7G&ñÊrÇíÁ&W∆6RÇı≥¢Â“ˆr¬"“"ì∞¢6ˆÁ7BfÊ÷R“6fTfñ∆VÊ÷RÜG∑&Vfóá’ÚG∑7F◊“ÁÊvì∞¢6ˆÁ7B'5FÇ“FÇÊ¶ˆñ‚Üfˆ∆FW"¬fÊ÷Rì∞¢g2Áw&óFTfñ∆U7ñÊ2Ü'5FÇ¬'Vbì∞†¢6ˆÁ7B&V¬“'5FÇÁ&W∆6RÖUƒÙEÙDï"¬""íÁ&W∆6RÇı≈¬ˆr¬"Ú"ì∞¢&WGW&‚˜W∆ˆG2G∑&V¬Á7F'G5vóFÇÇ"Ú"íÚ""¢"Ú'“G∑&V«÷∞ß–†¶Á˜7BÇ"ˆ¶ˆ'2Û¶¶ˆ%ˆñB˜Ü˜F˜2ÛßÜ˜FıˆñB˜W∆ˆB"¬W∆ˆBÁ6ñÊv∆RÇ'Ü˜FÚ"í¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B≤¶ˆ%ˆñB¬Ü˜FıˆñB““&WÁ&◊3∞¢ñbÇ&WÊfñ∆Rí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.òNäòéâÓâÆòNâ˛ä^ò¬Ü˜FÚ"“ì∞†¢G'í∞¢6ˆÁ7B&VƒñB“vóB&W6ˆ«fT¶ˆ$ñDÁíáˆˆ¬¬¶ˆ%ˆñBì∞¢ñbÇ&VƒñBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢&¶ˆ%ˆñBòNäòéânãûàâ^òûäﬁàr"“ì∞¢vóB76W'D¶ˆ$7FñˆÊ&∆Tf˜%FV6ÜÊñ6ñ‚áˆˆ¬¬&VƒñBì∞†¢6ˆÁ7B÷WF“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BÜ˜FıˆñB¬Ü6R¬÷ñ÷U˜GóRe$Ù“V&∆ñ2Ê¶ˆ%˜Ü˜F˜2tÑU$RÜ˜FıˆñC“C‰B¶ˆ%ˆñC“C&¿¢∑Ü˜FıˆñB¬&VƒñE–¢ì∞¢ñbÜ÷WFÁ&˜w2Ê∆VÊwFÇ””“í&WGW&‚&W2Á7FGW2ÉCBíÊß6ˆ‚á≤W'&˜#¢.òNäòéâÓâ¢÷WFFFä>ãûâ≤"“ì∞†¢6ˆÁ7BÜ6R“7G&ñÊrÜ÷WFÁ&˜w5≥“ÁÜ6R«¬v¶ˆ"rì∞†¢∆WBWáB“&ßr#∞¢6ˆÁ7B◊B“7G&ñÊrá&WÊfñ∆RÊ÷ñ÷WGóR«¬""íÁFÙ∆˜vW$66RÇì∞¢ñbÜ◊BÊñÊ6«VFW2Ç'Êr"ííWáB“'Êr#∞¢ñbÜ◊BÊñÊ6«VFW2Ç'vV'"ííWáB“'vV'#∞¢ñbÜ◊BÊñÊ6«VFW2Ç&ßVr"í«¬◊BÊñÊ6«VFW2Ç&ßr"ííWáB“&ßr#∞†¢ÚÚ)»R¶ˆ"Ü˜F˜2’U5BvÚFÚ6∆˜VFñÊ'íˆÊ«í‡¢ÚÚäæòûã.äf∆∆&6≤ä^àr˜W∆ˆG2âÆâí&VÊFW"òâÓä>ã.ãòNâ˛ä^òŒäæã.ä.òNâNòíòä^ãòNäòéâ^ä>àr&WVó&V÷VÁBäæâûòûã.à~ã.âûàéä>ãNàp¢ñbÇ4ƒıTDî‰%ïÙT‰$ƒTBí∞¢6ˆÁ6ˆ∆RÊW'&˜"Çu∑Ü˜F˜2˜W∆ˆE“6∆˜VFñÊ'íó2Ê˜B6ˆÊfñwW&VBf˜"¶ˆ"Ü˜F˜2r¬∞¢¶ˆ%ˆñC¢&VƒñB¿¢Ü˜FıˆñB¿¢Ü5ˆ6∆˜VEˆÊ÷S¢&ˆˆ∆V‚Ñ4ƒıTDî‰%ïÙ4ƒıTEÙ‰‘Rí¿¢Ü5ˆïˆ∂Wì¢&ˆˆ∆V‚Ñ4ƒıTDî‰%ïÙïÙ¥Uíí¿¢Ü5ˆï˜6V7&WC¢&ˆˆ∆V‚Ñ4ƒıTDî‰%ïÙïı4T5$UBí¿¢“ì∞¢&WGW&‚&W2Á7FGW2ÉS2íÊß6ˆ‚á∞¢7V66W73¢f«6R¿¢W'&˜#¢~ä>ãâÆâÆä>ãûâæâ^òûäﬁà~äﬁãâæò.äæä^âNòNâ≤6∆˜VFñÊ'íòâ^òéä.ãà~òNäòéòNâNòûâ^ãòûà~àNòéã"6∆˜VFñÊ'íTÂbâÆâí&VÊFW"ò>äæòûàNä>â¢r¿¢6ˆFS¢t4ƒıTDî‰%ïÙ‰ıEÙ4Ù‰dîuU$TBr¿¢&WVó&VEˆVÁc¢≤t4ƒıTDî‰%ïÙ4ƒıTEÙ‰‘Rr¬t4ƒıTDî‰%ïÙïÙ¥Uír¬t4ƒıTDî‰%ïÙïı4T5$UBu“¿¢“ì∞¢–†¢6ˆÁ7BV&∆ñ4ñB“G∑&VƒñG’ÚG∑Ü˜FıˆñG’ÚG¥FFRÊÊ˜rÇó’ÚG∂7'óFÚÁ&ÊFˆ’UTîBÇíÁ6∆ñ6RÉ¬Çó÷∞¢6ˆÁ7Bfˆ∆FW"“7vbˆ¶ˆ'2ÚG∑&VƒñG“ÚG∑Ü6W÷∞¢ÚÚ6∆˜VFñÊ'íG&Á6f˜&÷Fñˆ‚7G&ñÊp¢ÚÚ“∆ñ÷óBvñGFÇFÚc ¢ÚÚ“WFÚV∆óGíbf˜&÷@¢6ˆÁ7BG&Á6f˜&÷Fñˆ‚“v5ˆ∆ñ÷óB«uÛc˜ˆWFÚˆeˆWFÚs∞†¢6ˆÁ7BW“vóB6∆˜VFñÊ'ïW∆ˆD'VffW"á∞¢'VffW#¢&WÊfñ∆RÊ'VffW"¿¢÷ñ÷WGóS¢&WÊfñ∆RÊ÷ñ÷WGóR«¬÷WFÁ&˜w5≥“Ê÷ñ÷U˜GóR«¬vñ÷vRˆßVrr¿¢fˆ∆FW"¿¢V&∆ñ4ñB¿¢G&Á6f˜&÷Fñˆ‚¿¢“ì∞†¢vóBˆˆ¬ÁVW'íÄ¢UDDRV&∆ñ2Ê¶ˆ%˜Ü˜F˜0¢4UBW∆ˆFVEˆC‘‰ırÇí¿¢7F˜&vU˜FÉ“C¿¢V&∆ñ5˜W&√“C"¿¢6∆˜VE˜V&∆ñ5ˆñC“C2¿¢fñ∆U˜6ó¶Uˆ'óFW3‘4ÙƒU44RÇCC£¶&ñvñÁB¬fñ∆U˜6ó¶Uˆ'óFW2ê¢tÑU$RÜ˜FıˆñC“CS£¶&ñvñÁB‰B¶ˆ%ˆñC“Cc£¶&ñvñÁF¿¢∞¢WÁV&∆ñ5ˆñB«¬V&∆ñ4ñB¿¢WÁ6V7W&U˜W&¬¿¢WÁV&∆ñ5ˆñB«¬V&∆ñ4ñB¿¢ÁV÷&W"Êó4fñÊóFRÑÁV÷&W"áWÊ'óFW2ííÚÁV÷&W"áWÊ'óFW2í¢ÁV∆¬¿¢Ü˜FıˆñB¿¢&VƒñB¿¢–¢ì∞†¢6ˆÁ6ˆ∆RÊ∆ˆrÇu∑Ü˜F˜2˜W∆ˆE“W∆ˆFVBFÚ6∆˜VFñÊ'ír¬∞¢¶ˆ%ˆñC¢&VƒñB¿¢Ü˜FıˆñB¿¢Ü6R¿¢V&∆ñ5ˆñC¢WÁV&∆ñ5ˆñB«¬V&∆ñ4ñB¿¢'óFW3¢WÊ'óFW2«¬&WÊfñ∆RÁ6ó¶R«¬ÁV∆¬¿¢“ì∞†¢&WGW&‚&W2Êß6ˆ‚á∞¢7V66W73¢G'VR¿¢7F˜&vS¢v6∆˜VFñÊ'ír¿¢W&√¢WÁ6V7W&U˜W&¬¿¢V&∆ñ5ˆñC¢WÁV&∆ñ5ˆñB«¬V&∆ñ4ñB¿¢'óFW3¢WÊ'óFW2«¬&WÊfñ∆RÁ6ó¶R«¬ÁV∆¬¿¢“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÑÁV÷&W"ÜRÁ7FGW2«¬SííÊß6ˆ‚á≤W'&˜#¢RÊ÷W76vR«¬.äﬁãâæò.äæä^âNä>ãûâæòNäòéäÆã>òä>ò~àÇ"¬6ˆFS¢RÊ6ˆFR«¬VÊFVfñÊVB“ì∞¢–ß“ì∞†¶ÊvWBÇ"ˆ¶ˆ'2Û¶¶ˆ%ˆñB˜Ü˜F˜2"¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B≤¶ˆ%ˆñB““&WÁ&◊3∞¢G'í∞¢6ˆÁ7B&VƒñB“vóB&W6ˆ«fT¶ˆ$ñDÁíáˆˆ¬¬¶ˆ%ˆñBì∞¢ñbÇ&VƒñBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢&¶ˆ%ˆñBòNäòéânãûàâ^òûäﬁàr"“ì∞†¢6ˆÁ7BVÊóDñB“ÁV÷&W"á&WÁVW'ìÚÁVÊóEˆñB«¬ì∞¢6ˆÁ7B&◊2“∑&VƒñE”∞¢∆WBVÊóEvÜW&R“rs∞¢ñbÑÁV÷&W"Êó4fñÊóFRáVÊóDñBíbbVÊóDñB‚í≤&◊2ÁW6ÇáVÊóDñBì≤VÊóEvÜW&R“r‰BVÊóEˆñC“C"s≤–¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BÜ˜FıˆñB¬Ü6R¬7&VFVEˆB¬W∆ˆFVEˆB¬V&∆ñ5˜W&¬¬W∆ˆFVEˆ'í¬VÊóEˆñB¬VÊóEˆ6ˆFR¬VÊóEˆÊÚ¬Ü˜Fıˆ6FVv˜'í¬Ü˜FıˆÊ˜FP¢e$Ù“V&∆ñ2Ê¶ˆ%˜Ü˜F˜2tÑU$R¶ˆ%ˆñC“CG∑VÊóEvÜW&W“‰BFV∆WFVEˆBï2ÂTƒ¬ı$DU"%íVÊóEˆÊÚÂTƒ≈2ƒ5B¬Ü˜FıˆñB46¿¢&◊0¢ì∞¢&W2Êß6ˆ‚á"Á&˜w2ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.ò.äæä^âNä>ã.ä.àã.ä>ä>ãûâæòNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞†¶ÊvWBÇ"ˆ¶ˆ'2Û¶¶ˆ%ˆñB˜VÊóG2"¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7B&VƒñB“vóB&W6ˆ«fT¶ˆ$ñDÁíáˆˆ¬¬&WÁ&◊2Ê¶ˆ%ˆñBì∞¢ñbÇ&VƒñBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.òNäòéâÓâÆà~ã.âûâûã^òí"“ì∞¢vóB76W'D¶ˆ$7FñˆÊ&∆Tf˜%FV6ÜÊñ6ñ‚áˆˆ¬¬&VƒñBì∞¢ÚÚòâæãNâNä>ãâÆâÆòä.àòàNä>ã~òéäﬁà~òâÆâÆâæä^äﬁâNäãä.òäã~òéäﬁàÆòéã.àr˛òäﬁâNäãNâûòà.òûã.äæâûòûã.âûã^òê¢ÚÚòâÓã~òéäﬁò>äæòûà~ã.âûòàòéã.äæä>ã~äﬁà~ã.âûâ~ã^òéäÆä>òûã.à~àòéäﬁâí÷ñw&Fñˆ‚òäæò~âûàã.ä>òŒâNòàNä>ã~òéäﬁà~â~ãâûâ~ãRòNäòéàä^ãâÆòNâæä^à~ä>ãûâæä>ä~ä¢6ˆÁ7BVÊóG2“vóBvWEVÊóG5vóFÑWfñFVÊ6Rá&VƒñB¬ˆˆ¬ì∞¢ñbáVÊóG2Ê∆VÊwFÇí∞¢vóBˆˆ¬ÁVW'íÜUDDRV&∆ñ2Ê¶ˆ'24UBW%˜VÊóEˆWfñFVÊ6UˆVÊ&∆VC’E%TRtÑU$R¶ˆ%ˆñC“C‰B4ÙƒU44RáW%˜VÊóEˆWfñFVÊ6UˆVÊ&∆VBƒd≈4Rì‘d≈4V¬∑&VƒñE“íÊ6F6ÇÇÇì”Á∑“ì∞¢–¢&WGW&‚&W2Êß6ˆ‚á≤7V66W73¢G'VR¬W%˜VÊóEˆWfñFVÊ6UˆVÊ&∆VC¢VÊóG2Ê∆VÊwFÇ‚¬VÊóG2“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÇttUBˆ¶ˆ'2Û¶¶ˆ%ˆñB˜VÊóG2r¬Rì∞¢&WGW&‚&W2Á7FGW2ÑÁV÷&W"ÜRÁ7FGW2«¬SííÊß6ˆ‚á≤W'&˜#¢RÊ÷W76vR«¬.ò.äæä^âNà.òûäﬁäãûä^òàNä>ã~òéäﬁà~òNäòéäÆã>òä>ò~àÇ"¬6ˆFS¢RÊ6ˆFR«¬VÊFVfñÊVB“ì∞¢–ß“ì∞†¶ÁWBÇ"ˆ¶ˆ'2Û¶¶ˆ%ˆñB˜VÊóG2ÛßVÊóEˆñBˆ6ÜV6∂∆ó7B"¬&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7B&VƒñB“vóB&W6ˆ«fT¶ˆ$ñDÁíáˆˆ¬¬&WÁ&◊2Ê¶ˆ%ˆñBì∞¢ñbÇ&VƒñBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.òNäòéâÓâÆà~ã.âûâûã^òí"“ì∞¢6ˆÁ7BFV6ÜÊñ6ñ‚“vóB&WVó&UFV6Ñ˜vÁ5&W6ˆ«fVD¶ˆ"á&W¬&W2¬&VƒñB¬ˆˆ¬ì∞¢ñbÇFV6ÜÊñ6ñ‚í&WGW&„∞¢vóB76W'D¶ˆ$7FñˆÊ&∆Tf˜%FV6ÜÊñ6ñ‚áˆˆ¬¬&VƒñBì∞¢6ˆÁ7BVÊóDñB“ÁV÷&W"á&WÁ&◊2ÁVÊóEˆñB«¬ì∞¢6ˆÁ7BGóR“7G&ñÊrá&WÊ&ˆGìÚÊ6ÜV6∂∆ó7E˜GóR«¬rríÁG&ñ“Çì∞¢ñbÇ≤w&Rr¬w˜7Bu“ÊñÊ6«VFW2áGóRíí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.âæä>ãòäâ~òàÆò~àNä^ãNäÆòNäòéânãûàâ^òûäﬁàr"“ì∞¢6ˆÁ7B∆ó7B“'&íÊó4'&íá&WÊ&ˆGìÚÊ6ÜV6∂∆ó7Eˆß6ˆ‚íÚ&WÊ&ˆGíÊ6ÜV6∂∆ó7Eˆß6ˆ‚¢µ”∞¢6ˆÁ7BVÊóE"“vóBˆˆ¬ÁVW'íÜ4TƒT5BVÊóEˆñBe$Ù“V&∆ñ2Ê¶ˆ%˜VÊóG2tÑU$R¶ˆ%ˆñC“C‰BVÊóEˆñC“C"‰BG∂7FófT¶ˆ%VÊóEvÜW&RÇó“ƒî‘ïB¬∑&VƒñB¬VÊóDñE“ì∞¢ñbÇVÊóE"Á&˜w2Ê∆VÊwFÇí&WGW&‚&W2Á7FGW2ÉCBíÊß6ˆ‚á≤W'&˜#¢.òNäòéâÓâÆòàNä>ã~òéäﬁà~âûã^òûò>âûà~ã.âí"“ì∞¢vóBˆˆ¬ÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2Ê¶ˆ%˜VÊóEˆ6ÜV6∂∆ó7G2Ü¶ˆ%ˆñB¬VÊóEˆñB¬FV6ÜÊñ6ñÂ˜W6W&Ê÷R¬6ÜV6∂∆ó7E˜GóR¬6ÜV6∂∆ó7Eˆß6ˆ‚¬6ˆ◊∆WFVEˆB¬WFFVEˆBê¢d≈TU2ÇC¬C"¬C2¬CB¬CS£¶ß6ˆÊ"ƒ‰ırÇíƒ‰ırÇíê¢Ù‚4Ù‰dƒî5BáVÊóEˆñB¬6ÜV6∂∆ó7E˜GóRê¢DÚUDDR4UBFV6ÜÊñ6ñÂ˜W6W&Ê÷S‘UÑ4≈TDTBÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬6ÜV6∂∆ó7Eˆß6ˆ„‘UÑ4≈TDTBÊ6ÜV6∂∆ó7Eˆß6ˆ‚¬6ˆ◊∆WFVEˆC‘‰ırÇí¬WFFVEˆC‘‰ırÇñ¿¢∑&VƒñB¬VÊóDñB¬FV6ÜÊñ6ñ‚«¬ˆWFÖW6W&Ê÷Rá&Wí«¬ÁV∆¬¬GóR¬•4Ù‚Á7G&ñÊvñgíÜ∆ó7Bï–¢ì∞¢&WGW&‚&W2Êß6ˆ‚á≤7V66W73¢G'VR¬÷W76vS¢.âÆãâûâ~ãnàòàÆò~àNä^ãNäÆòàNä>ã~òéäﬁà~âûã^òûòä^òûär"“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÇuUBˆ¶ˆ'2Û¶¶ˆ%ˆñB˜VÊóG2ÛßVÊóEˆñBˆ6ÜV6∂∆ó7Br¬Rì∞¢&WGW&‚&W2Á7FGW2ÑÁV÷&W"ÜRÁ7FGW2«¬SííÊß6ˆ‚á≤W'&˜#¢RÊ÷W76vR«¬.âÆãâûâ~ãnàòàÆò~àNä^ãNäÆòàNä>ã~òéäﬁà~âûã^òûòNäòéäÆã>òä>ò~àÇ"¬6ˆFS¢RÊ6ˆFR«¬VÊFVfñÊVB“ì∞¢–ß“ì∞†¶7ñÊ2gVÊ7Fñˆ‚÷VFñ&WFVÁFñˆÂ&˜w2Çí∞¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5B¢Ê¶ˆ%ˆñB¬¢Ê&ˆˆ∂ñÊuˆ6ˆFR¬¢Ê7W7Fˆ÷W%ˆÊ÷R¬¢Ê7W7Fˆ÷W%˜ÜˆÊR¬¢Ê¶ˆ%˜GóR¬¢Ê¶ˆ%˜7FGW2¿¢¢ÊfñÊó6ÜVEˆB¬¢Ê6ˆ◊∆WFVEˆB¬¢Ê6∆˜6VEˆB¬¢Ê÷VFñ˜&WFVÁFñˆÂˆ∆ˆ6∂VB¬¢Ê÷VFñ˜&WFVÁFñˆÂ˜W&vVEˆB¿¢4ıTÂBÑDï5Dî‰5B44RtÑT‚ÊFV∆WFVEˆBï2ÂTƒ¬‰B‰ıBÑ4ÙƒU44RáÁÜ˜Fıˆ6FVv˜'í¬rrì“wñ÷VÁE˜6∆órı"4ÙƒU44RáÁÜ6R¬rríîƒî¥RrW6∆óRríDÑT‚ÁÜ˜FıˆñBT‰Bì£¶ñÁB2Ü˜Fıˆ6˜VÁB¿¢4ıTÂBÑDï5Dî‰5B44RtÑT‚ÊFV∆WFVEˆBï2ÂTƒ¬‰BÑ4ÙƒU44RáÁÜ˜Fıˆ6FVv˜'í¬rrì“wñ÷VÁE˜6∆órı"4ÙƒU44RáÁÜ6R¬rríîƒî¥RrW6∆óRrı"4ÙƒU44RáÁÜ6R¬rrì“wñ÷VÁE˜6∆óríDÑT‚ÁÜ˜FıˆñBT‰Bì£¶ñÁB26∆óˆ6˜VÁB¿¢4ıTÂBÑDï5Dî‰5B2Ê6ÜV6∂∆ó7EˆñBì£¶ñÁB26ÜV6∂∆ó7Eˆ6˜VÁB¿¢4ıTÂBÑDï5Dî‰5BRÁVÊóEˆñBì£¶ñÁB2VÊóEˆ6˜VÁB¿¢4ÙƒU44RÖ5T“Ñ44RtÑT‚ÊFV∆WFVEˆBï2ÂTƒ¬‰B‰ıBÑ4ÙƒU44RáÁÜ˜Fıˆ6FVv˜'í¬rrì“wñ÷VÁE˜6∆órı"4ÙƒU44RáÁÜ6R¬rríîƒî¥RrW6∆óRríDÑT‚4ÙƒU44RáÊfñ∆U˜6ó¶Uˆ'óFW2√íT≈4RT‰Bí√ì£¶&ñvñÁB2'óFW5ˆW7Fñ÷FVB¿¢4ÙƒU44RÖ5T“Ñ44RtÑT‚ÊFV∆WFVEˆBï2ÂTƒ¬‰BÑ4ÙƒU44RáÁÜ˜Fıˆ6FVv˜'í¬rrì“wñ÷VÁE˜6∆órı"4ÙƒU44RáÁÜ6R¬rríîƒî¥RrW6∆óRríDÑT‚4ÙƒU44RáÊfñ∆U˜6ó¶Uˆ'óFW2√íT≈4RT‰Bí√ì£¶&ñvñÁB26∆óˆ'óFW5ˆW7Fñ÷FVB¿¢Ö4TƒT5B7G&ñÊuˆvrÑ4ÙƒU44RÜ¶íÊóFV’ˆÊ÷R¬rrí¬rríe$Ù“V&∆ñ2Ê¶ˆ%ˆóFV◊2¶ítÑU$R¶íÊ¶ˆ%ˆñC÷¢Ê¶ˆ%ˆñBí26W'fñ6UˆóFV◊5˜FWá@¢e$Ù“V&∆ñ2Ê¶ˆ'2†¢ƒTeB§Ùî‚V&∆ñ2Ê¶ˆ%˜Ü˜F˜2Ù‚Ê¶ˆ%ˆñC÷¢Ê¶ˆ%ˆñB‰BÊFV∆WFVEˆBï2ÂTƒ¿¢ƒTeB§Ùî‚V&∆ñ2Ê¶ˆ%˜VÊóEˆ6ÜV6∂∆ó7G22Ù‚2Ê¶ˆ%ˆñC÷¢Ê¶ˆ%ˆñ@¢ƒTeB§Ùî‚V&∆ñ2Ê¶ˆ%˜VÊóG2RÙ‚RÊ¶ˆ%ˆñC÷¢Ê¶ˆ%ˆñ@¢tÑU$R¢ÊfñÊó6ÜVEˆBï2‰ıBÂTƒ¬ı"4ÙƒU44RÜ¢Ê¶ˆ%˜7FGW2¬rríîƒî¥Rr^òäÆä>ò~àÇRrı"4ÙƒU44RÜ¢Ê¶ˆ%˜7FGW2¬rríî‚ÇvFˆÊRr¬v6ˆ◊∆WFVBr¬~âæãNâNà~ã.âírê¢u$ıU%í¢Ê¶ˆ%ˆñ@¢Ñdî‰r4ıTÂBÑDï5Dî‰5B44RtÑT‚ÊFV∆WFVEˆBï2ÂTƒ¬DÑT‚ÁÜ˜FıˆñBT‰Bí‚ ¢ı$DU"%í4ÙƒU44RÜ¢ÊfñÊó6ÜVEˆB¬¢Ê6ˆ◊∆WFVEˆB¬¢Ê6∆˜6VEˆBí42ÂTƒ≈2ƒ5B¬¢Ê¶ˆ%ˆñB40¢ƒî‘ïBS ¢ì∞¢&WGW&‚á"Á&˜w2«¬µ“íÊ÷Ü¢”‚∞¢6ˆÁ7BV¬“÷VFñW&vTV∆ñvñ&ñ∆óGíÜ¢ì∞¢6ˆÁ7B6ˆ◊∆WFñˆ‚“vWD¶ˆ$6ˆ◊∆WFñˆ‰FFRÜ¢ì∞¢6ˆÁ7Bv'&ÁGîVÊB“6ˆ◊∆WFñˆ‚ÚÊWrFFRÜÊWrFFRÜ6ˆ◊∆WFñˆ‚íÊvWEFñ÷RÇí≤ÜvWE&WFVÁFñˆ‰Fó4f˜$¶ˆ"Ü¢í“Rí¢ÉcCí¢ÁV∆√∞¢&WGW&‚≤‚‚Ê¢¬6ˆ◊∆WFñˆÂˆFFS¢6ˆ◊∆WFñˆ‚¬v'&ÁGïˆVÊEˆFFS¢v'&ÁGîVÊBÚv'&ÁGîVÊBÁFÙï4ı7G&ñÊrÇí¢ÁV∆¬¬W&vUˆV∆ñvñ&∆UˆFFS¢V¬ÊV∆ñvñ&∆UˆB«¬ÁV∆¬¬V∆ñvñ&ñ∆óGì¢V¬”∞¢“ì∞ß–†¶ÊvWBÇrˆF÷ñ‚ˆ÷VFñ◊&WFVÁFñˆ‚˜7V÷÷'ír¬&WVó&TF÷ñÂ6W76ñˆ‚¬7ñÊ2Ö˜&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7B¶ˆ'2“vóB÷VFñ&WFVÁFñˆÂ&˜w2Çì∞¢6ˆÁ7BÜ˜F˜5"“vóBˆˆ¬ÁVW'íÜ4TƒT5B4ıTÂBÇ¢ì£¶ñÁB2F˜F¬¬5T“Ñ44RtÑT‚4ÙƒU44RáÜ˜Fıˆ6FVv˜'í¬rrì“wñ÷VÁE˜6∆órı"4ÙƒU44RáÜ6R¬rríîƒî¥RrW6∆óRrı"4ÙƒU44RáÜ6R¬rrì“wñ÷VÁE˜6∆órDÑT‚T≈4RT‰Bì£¶ñÁB26∆ó2¬4ÙƒU44RÖ5T“Ñ4ÙƒU44RÜfñ∆U˜6ó¶Uˆ'óFW2√íí√ì£¶&ñvñÁB2'óFW2e$Ù“V&∆ñ2Ê¶ˆ%˜Ü˜F˜2tÑU$RFV∆WFVEˆBï2ÂTƒ∆ì∞¢6ˆÁ7BV∆ñvñ&∆R“¶ˆ'2Êfñ«FW"Ü£”Ê¢ÊV∆ñvñ&ñ∆óGìÚÊV∆ñvñ&∆Rì∞¢&WGW&‚&W2Êß6ˆ‚á≤7V66W73ßG'VR¿¢F˜F≈˜Ü˜F˜3§ÁV÷&W"áÜ˜F˜5"Á&˜w3ÚÂ≥”ÚÁF˜F««√í¿¢V∆ñvñ&∆U˜Ü˜F˜3¶V∆ñvñ&∆RÁ&VGV6RÇá7V“∆¢ì”Á7V“¥ÁV÷&W"Ü¢ÁÜ˜Fıˆ6˜VÁG«√í√í¿¢V∆ñvñ&∆Uˆ¶ˆ'3¶V∆ñvñ&∆RÊ∆VÊwFÇ¿¢6∆ó˜Ü˜F˜3§ÁV÷&W"áÜ˜F˜5"Á&˜w3ÚÂ≥”ÚÁ6∆ó7«√í¿¢'óFW5ˆW7Fñ÷FVC¶V∆ñvñ&∆RÁ&VGV6RÇá7V“∆¢ì”Á7V“¥ÁV÷&W"Ü¢Ê'óFW5ˆW7Fñ÷FVG«√í√í¿¢F˜F≈ˆ'óFW5ˆW7Fñ÷FVC§ÁV÷&W"áÜ˜F˜5"Á&˜w3ÚÂ≥”ÚÊ'óFW7«√í¿¢6∆óˆ'óFW5ˆW7Fñ÷FVC¶¶ˆ'2Á&VGV6RÇá7V“∆¢ì”Á7V“¥ÁV÷&W"Ü¢Á6∆óˆ'óFW5ˆW7Fñ÷FVG«√í√í¿¢7F˜&vUˆg&VUˆÊ˜FS¢~âÓã~òûâûâ~ã^òéä~òéã.à~àéä>ãNà~â^òûäﬁà~âNãûàéã.à&VÊFW"Ù6∆˜VFñÊ'ì≤ä>ãâÆâÆâûã^òûàNã>âûä~â>âÓã~òûâûâ~ã^òéâ~ã^òéä^òûã.à~òNâNòûàéã.àà.âûã.âNòNâ˛ä^òŒâ~ã^òéâÆãâûâ~ãnàòNä~òír¿¢Ê˜FS¢~ä>ãûâæäÆä^ãNâæòNäòéânãûàä^âÆäﬁãâ^ò.âûäãâ^ãBâ^òûäﬁà~òä^ã~äﬁàä^âÆäÆä^ãNâæòäﬁà~òâ~òéã.âûãòûâír“ì∞¢“6F6ÇÜRí≤&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢~ò.äæä^âNäÆä>ãéâæâÓã~òûâûâ~ã^òéàéãâNòàò~âÆòNäòéäÆã>òä>ò~àÇr“ì≤–ß“ì∞†¶ÊvWBÇrˆF÷ñ‚ˆ÷VFñ◊&WFVÁFñˆ‚ˆ¶ˆ'2r¬&WVó&TF÷ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7B“7G&ñÊrá&WÁVW'íÁ«¬rríÁG&ñ“ÇíÁFÙ∆˜vW$66RÇì∞¢6ˆÁ7BGóR“7G&ñÊrá&WÁVW'íÊ¶ˆ%˜GóR«¬v∆¬ríÁG&ñ“Çì∞¢∆WB¶ˆ'2“vóB÷VFñ&WFVÁFñˆÂ&˜w2Çì∞¢ñbáGóRbbGóR”“v∆¬rí¶ˆ'2“¶ˆ'2Êfñ«FW"Ü¢”‚7G&ñÊrÜ¢Ê¶ˆ%˜GóR«¬rríÊñÊ6«VFW2áGóRíì∞¢ñbáí¶ˆ'2“¶ˆ'2Êfñ«FW"Ü¢”‚G∂¢Ê7W7Fˆ÷W%ˆÊ÷W«¬rw“G∂¢Ê7W7Fˆ÷W%˜ÜˆÊW«¬rw“G∂¢Ê&ˆˆ∂ñÊuˆ6ˆFW«¬rw÷ÁFÙ∆˜vW$66RÇíÊñÊ6«VFW2áíì∞¢&WGW&‚&W2Êß6ˆ‚á≤7V66W73ßG'VR¬¶ˆ'2“ì∞¢“6F6ÇÜRí≤&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢~ò.äæä^âNä>ã.ä.àã.ä>à~ã.âûäÆã>äæä>ãâÆä^òûã.à~à.òûäﬁäãûä^òNäòéäÆã>òä>ò~àÇr“ì≤–ß“ì∞†¶Á˜7BÇrˆF÷ñ‚ˆ÷VFñ◊&WFVÁFñˆ‚˜W&vRr¬&WVó&TF÷ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7BG'ï'V‚“&WÊ&ˆGìÚÊG'ï˜'V‚”“f«6S∞¢6ˆÁ7B6∆óˆÊ«í“&WÊ&ˆGìÚÁ6∆óˆˆÊ«í””“G'VR«¬7G&ñÊrá&WÊ&ˆGìÚÁW&vU˜GóR«¬rríÁG&ñ“Çí””“w6∆ó2s∞¢6ˆÁ7BñG2“'&íÊó4'&íá&WÊ&ˆGìÚÊ¶ˆ%ˆñG2íÚ&WÊ&ˆGíÊ¶ˆ%ˆñG2Ê÷ÑÁV÷&W"íÊfñ«FW"Ü‚”‚ÁV÷&W"Êó4fñÊóFRÜ‚íbb‚‚íÁ6∆ñ6RÉ√#í¢µ”∞¢6ˆÁ7B7F˜"“ˆWFÖW6W&Ê÷Rá&Wí«¬&WÊ7F˜#ÚÁW6W&Ê÷R«¬vF÷ñ‚s∞¢ñbÇñG2Ê∆VÊwFÇí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢~àä>ãéâ>ã.òä^ã~äﬁàà~ã.âûâ~ã^òéâ^òûäﬁà~àã.ä>â^ä>ä~àéäÆäﬁâ¢r“ì∞¢ñbÇG'ï'V‚í∞¢6ˆÁ7BÊVVB“6∆óˆÊ«íÚ~ä.ã~âûä.ãâûä^âÆäÆä^ãNâ≤r¢~ä.ã~âûä.ãâûä^â¢s∞¢ñbÖ7G&ñÊrá&WÊ&ˆGìÚÊ6ˆÊfó&’˜FWáB«¬rríÁG&ñ“Çí”“ÊVVBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¶àä>ãéâ>ã.âÓãNäâÓòŒàNã>ä~òéã"G∂ÊVVG“òâÓã~òéäﬁä.ã~âûä.ãâûàã.ä>ä^â¶“ì∞¢–¢6ˆÁ7B'V‰ñB“7'óFÚÁ&ÊFˆ’UTîBÇì∞¢6ˆÁ7B&W7V«G2“µ”∞¢f˜"Ü6ˆÁ7BñBˆbñG2í∞¢6ˆÁ7B¶ˆ%"“vóBˆˆ¬ÁVW'íÜ4TƒT5B¢‚¢¬Ö4TƒT5B7G&ñÊuˆvrÑ4ÙƒU44RÜ¶íÊóFV’ˆÊ÷R¬rrí¬rríe$Ù“V&∆ñ2Ê¶ˆ%ˆóFV◊2¶ítÑU$R¶íÊ¶ˆ%ˆñC÷¢Ê¶ˆ%ˆñBí26W'fñ6UˆóFV◊5˜FWáBe$Ù“V&∆ñ2Ê¶ˆ'2¢tÑU$R¢Ê¶ˆ%ˆñC“C¬∂ñE“ì∞¢6ˆÁ7BV¬“÷VFñW&vTV∆ñvñ&ñ∆óGíÜ¶ˆ%"Á&˜w5≥“ì∞¢6ˆÁ7BÜ˜F˜5"“vóBˆˆ¬ÁVW'íÜ4TƒT5BÜ˜FıˆñB¬Ü6R¬Ü˜Fıˆ6FVv˜'í¬6∆˜VE˜V&∆ñ5ˆñB¬7F˜&vU˜FÇ¬V&∆ñ5˜W&¬¬4ÙƒU44RÜfñ∆U˜6ó¶Uˆ'óFW2√ì£¶&ñvñÁB2'óFW2e$Ù“V&∆ñ2Ê¶ˆ%˜Ü˜F˜2tÑU$R¶ˆ%ˆñC“C‰BFV∆WFVEˆBï2ÂTƒ∆¬∂ñE“ì∞¢6ˆÁ7BWfñFVÊ6R“áÜ˜F˜5"Á&˜w2«¬µ“íÊfñ«FW"Üó4WfñFVÊ6UÜ˜Fı&˜rì∞¢6ˆÁ7B6∆ó2“áÜ˜F˜5"Á&˜w2«¬µ“íÊfñ«FW"á”‚Ê˜&÷∆ó¶UÜ˜FÙ6FVv˜'íáÁÜ6R¬ÁÜ˜Fıˆ6FVv˜'íí””“wñ÷VÁE˜6∆ór«¬7G&ñÊráÁÜ6W«¬rríÁFÙ∆˜vW$66RÇíÊñÊ6«VFW2Çw6∆óríì∞¢6ˆÁ7BF&vWEÜ˜F˜2“6∆óˆÊ«íÚ6∆ó2¢WfñFVÊ6S∞¢6ˆÁ7B7V÷÷'í“≤V∆ñvñ&∆S¢6∆óˆÊ«íÚ6∆ó2Ê∆VÊwFÇ‚¢V¬ÊV∆ñvñ&∆R¬&V6ˆ„¢6∆óˆÊ«íÚ~òä^ã~äﬁàä^âÆòàûâÓã.ãä>ãûâæäÆä^ãNâæò.âNä.òäﬁâNäãNâír¢V¬Á&V6ˆ‚¬Ü˜F˜5ˆ6˜VÁC¶WfñFVÊ6RÊ∆VÊwFÇ¬6ÜV6∂∆ó7Eˆ6˜VÁC£¬VÊóG5ˆ6˜VÁC£¬6∆ó5ˆ6˜VÁCß6∆ó2Ê∆VÊwFÇ¬'óFW5ˆW7Fñ÷FVCßF&vWEÜ˜F˜2Á&VGV6RÇá2«ì”Á2¥ÁV÷&W"áÊ'óFW7«√í√í¬W&vU˜GóS¢6∆óˆÊ«íÚw6∆ó2r¢v¶ˆ%ˆWfñFVÊ6Rr¬6∆˜VFñÊ'ïˆFV∆WFVEˆ6˜VÁC£¬6∆˜VFñÊ'ïˆFV∆WFUˆfñ∆VEˆ6˜VÁC£”∞¢ñbá7V÷÷'íÊV∆ñvñ&∆RbbG'ï'V‚bbF&vWEÜ˜F˜2Ê∆VÊwFÇí∞¢6ˆÁ7B6∆˜VEV&∆ñ4ñG2“≤‚‚ÊÊWr6WBáF&vWEÜ˜F˜2Ê÷á”‚7G&ñÊráÊ6∆˜VE˜V&∆ñ5ˆñB«¬Á7F˜&vU˜FÇ«¬rríÁG&ñ“ÇííÊfñ«FW"áb”‚bbbıÊáGG3Û•¬ı¬ÚˆíÁFW7Bábííï”∞¢∆WBFW7G&˜ï&˜w2“µ”∞¢ñbÜ6∆˜VEV&∆ñ4ñG2Ê∆VÊwFÇí∞¢ñbÇ4ƒıTDî‰%ïÙT‰$ƒTBí∞¢7V÷÷'íÊ6∆˜VFñÊ'ïˆFV∆WFUˆfñ∆VEˆ6˜VÁB“6∆˜VEV&∆ñ4ñG2Ê∆VÊwFÉ∞¢7V÷÷'íÁ&V6ˆ‚“~ä.ãà~òNäòéòNâNòûâ^ãòûà~àNòéã"6∆˜VFñÊ'íTÂbàéãnà~ä.ãà~ä^âÆòNâ˛ä^òŒàéä>ãNà~âÆâí6∆˜VFñÊ'íòNäòéòNâNòís∞¢&W7V«G2ÁW6Çá≤¶ˆ%ˆñC¶ñB¬‚‚Á7V÷÷'í“ì∞¢vóBˆˆ¬ÁVW'íÜîÂ4U%BîÂDÚV&∆ñ2Ê÷VFñ˜&WFVÁFñˆÂˆ∆ˆw2á'VÂˆñB¬¶ˆ%ˆñB¬G'ï˜'V‚¬7Fñˆ‚¬Ü˜F˜5ˆ6˜VÁB¬6ÜV6∂∆ó7Eˆ6˜VÁB¬VÊóG5ˆ6˜VÁB¬6∆ó5ˆ6˜VÁB¬'óFW5ˆW7Fñ÷FVB¬&W7V«B¬7&VFVEˆ'ííd≈TU2ÇC¬C"¬C2¬CB¬CR¬Cb¬Cr¬CÇ¬Cí¬C¬Cñ¬∑'V‰ñB¬ñB¬G'ï'V‚¬G'ï'V„ÚvG'ï˜'V‚s¢wW&vUˆ6∆˜VFñÊ'ïˆÊ˜Eˆ6ˆÊfñwW&VBr¬7V÷÷'íÁÜ˜F˜5ˆ6˜VÁB¬7V÷÷'íÊ6ÜV6∂∆ó7Eˆ6˜VÁB¬7V÷÷'íÁVÊóG5ˆ6˜VÁB¬7V÷÷'íÁ6∆ó5ˆ6˜VÁB¬7V÷÷'íÊ'óFW5ˆW7Fñ÷FVB¬7V÷÷'íÁ&V6ˆ‚¬7F˜%“íÊ6F6ÇÇÇì”ÊÁV∆¬ì∞¢6ˆÁFñÁVS∞¢–¢FW7G&˜ï&˜w2“vóB6∆˜VFñÊ'îFW7G&˜î÷ÁíÜ6∆˜VEV&∆ñ4ñG2ì∞¢7V÷÷'íÊ6∆˜VFñÊ'ïˆFV∆WFVEˆ6˜VÁB“FW7G&˜ï&˜w2Êfñ«FW"á"”‚"Êˆ≤íÊ∆VÊwFÉ∞¢7V÷÷'íÊ6∆˜VFñÊ'ïˆFV∆WFUˆfñ∆VEˆ6˜VÁB“FW7G&˜ï&˜w2Êfñ«FW"á"”‚"Êˆ≤íÊ∆VÊwFÉ∞¢ñbá7V÷÷'íÊ6∆˜VFñÊ'ïˆFV∆WFUˆfñ∆VEˆ6˜VÁBí∞¢7V÷÷'íÊ6∆˜VFñÊ'ïˆFV∆WFUˆfñ«W&W2“FW7G&˜ï&˜w2Êfñ«FW"á"”‚"Êˆ≤íÁ6∆ñ6RÉ¬Rì∞¢7V÷÷'íÁ&V6ˆ‚“ä^âÆâÆã.à~ä>ãûâæâÆâí6∆˜VFñÊ'íòNäòéäÆã>òä>ò~àÇG∑7V÷÷'íÊ6∆˜VFñÊ'ïˆFV∆WFUˆfñ∆VEˆ6˜VÁG“ä>ãûâ≤ä>ãâÆâÆàéãòNäòéâ^ãâNä>ãûâæâ~ã^òéä^âÆòNäòéäÆã>òä>ò~àéäﬁäﬁààéã.àâã.âûà.òûäﬁäãûä^òâÓã~òéäﬁò>äæòûàâNä^âÆàæòûã>òNâNòñ∞¢–¢–¢6ˆÁ7Bˆ¥6∆˜VDñG2“ÊWr6WBÜFW7G&˜ï&˜w2Êfñ«FW"á"”‚"Êˆ≤íÊ÷á"”‚"ÁV&∆ñ5ˆñBíì∞¢6ˆÁ7BÜ˜FÙñG2“F&vWEÜ˜F˜0¢Êfñ«FW"á”‚∞¢6ˆÁ7BñB“7G&ñÊráÊ6∆˜VE˜V&∆ñ5ˆñB«¬Á7F˜&vU˜FÇ«¬rríÁG&ñ“Çì∞¢&WGW&‚ñB«¬ıÊáGG3Û•¬ı¬ÚˆíÁFW7BáñBí«¬ˆ¥6∆˜VDñG2ÊÜ2áñBì∞¢“ê¢Ê÷á”‚ÁV÷&W"áÁÜ˜FıˆñBííÊfñ«FW"Ñ&ˆˆ∆V‚ì∞¢ñbáÜ˜FÙñG2Ê∆VÊwFÇí∞¢vóBˆˆ¬ÁVW'íÜUDDRV&∆ñ2Ê¶ˆ%˜Ü˜F˜24UBFV∆WFVEˆC‘‰ırÇí¬FV∆WFVEˆ'ì“C"¬V&∆ñ5˜W&√‘ÂTƒ¬¬7F˜&vU˜FÉ‘ÂTƒ¬¬6∆˜VE˜V&∆ñ5ˆñC‘ÂTƒ¬tÑU$R¶ˆ%ˆñC“C‰BÜ˜FıˆñC‘ÂíÇC3£¶&ñvñÁEµ“ñ¬∂ñB¬7F˜"¬Ü˜FÙñG5“ì∞¢–¢ñbÇ6∆óˆÊ«íbbÜ˜FÙñG2Ê∆VÊwFÇbb7V÷÷'íÊ6∆˜VFñÊ'ïˆFV∆WFUˆfñ∆VEˆ6˜VÁB””“í∞¢vóBˆˆ¬ÁVW'íÜUDDRV&∆ñ2Ê¶ˆ%˜VÊóEˆ6ÜV6∂∆ó7G24UB6ÜV6∂∆ó7Eˆß6ˆ„“uµ“s£¶ß6ˆÊ"¬WFFVEˆC‘‰ırÇítÑU$R¶ˆ%ˆñC“C¬∂ñE“ì∞¢vóBˆˆ¬ÁVW'íÜUDDRV&∆ñ2Ê¶ˆ%˜VÊóG24UB5˜GóS‘ÂTƒ¬¬v6Ö˜GóS‘ÂTƒ¬¬'GS‘ÂTƒ¬¬∆ˆ6FñˆÂˆ∆&V√‘ÂTƒ¬¬WFFVEˆC‘‰ırÇítÑU$R¶ˆ%ˆñC“C¬∂ñE“ì∞¢vóBˆˆ¬ÁVW'íÜUDDRV&∆ñ2Ê¶ˆ'24UB÷VFñ˜&WFVÁFñˆÂ˜W&vVEˆC‘‰ırÇí¬÷VFñ˜&WFVÁFñˆÂ˜W&vVEˆ'ì“C"¬÷VFñ˜&WFVÁFñˆÂ˜7V÷÷'ì“C3£¶ß6ˆÊ"tÑU$R¶ˆ%ˆñC“C¬∂ñB¬7F˜"¬•4Ù‚Á7G&ñÊvñgíá7V÷÷'íï“ì∞¢–¢–¢vóBˆˆ¬ÁVW'íÜîÂ4U%BîÂDÚV&∆ñ2Ê÷VFñ˜&WFVÁFñˆÂˆ∆ˆw2á'VÂˆñB¬¶ˆ%ˆñB¬G'ï˜'V‚¬7Fñˆ‚¬Ü˜F˜5ˆ6˜VÁB¬6ÜV6∂∆ó7Eˆ6˜VÁB¬VÊóG5ˆ6˜VÁB¬6∆ó5ˆ6˜VÁB¬'óFW5ˆW7Fñ÷FVB¬&W7V«B¬7&VFVEˆ'ííd≈TU2ÇC¬C"¬C2¬CB¬CR¬Cb¬Cr¬CÇ¬Cí¬C¬Cñ¬∑'V‰ñB¬ñB¬G'ï'V‚¬G'ï'V„ÚvG'ï˜'V‚s¢wW&vRr¬7V÷÷'íÁÜ˜F˜5ˆ6˜VÁB¬7V÷÷'íÊ6ÜV6∂∆ó7Eˆ6˜VÁB¬7V÷÷'íÁVÊóG5ˆ6˜VÁB¬7V÷÷'íÁ6∆ó5ˆ6˜VÁB¬7V÷÷'íÊ'óFW5ˆW7Fñ÷FVB¬7V÷÷'íÁ&V6ˆ‚¬7F˜%“íÊ6F6ÇÇÇì”ÊÁV∆¬ì∞¢&W7V«G2ÁW6Çá≤¶ˆ%ˆñC¶ñB¬‚‚Á7V÷÷'í“ì∞¢–¢&WGW&‚&W2Êß6ˆ‚á≤7V66W73ßG'VR¬'VÂˆñCß'V‰ñB¬G'ï˜'V„¶G'ï'V‚¬÷W76vS¢G'ï'V‚Ú~â^ä>ä~àéäÆäﬁâÆàòéäﬁâûä^âÆòäÆä>ò~àéòä^òûärä.ãà~òNäòéäã^àã.ä>ä^âÆà.òûäﬁäãûä^àéä>ãNàrr¢á6∆óˆÊ«íÚ~ä^âÆä>ãûâæäÆä^ãNâæâ~ã^òéòä^ã~äﬁàòä>ã^ä.âÆä>òûäﬁä"r¢~ä^òûã.à~ä>ãûâæäæä^ãàâã.âûòàòéã.òä>ã^ä.âÆä>òûäﬁä"ä>ãûâæäÆä^ãNâæòNäòéânãûàä^âÆäﬁãâ^ò.âûäãâ^ãBrí¬&W7V«G2“ì∞ß“ì∞†¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	˘9“DT4Ç‰ıDP¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶ÁWBÇ"ˆ¶ˆ'2Û¶¶ˆ%ˆñBˆÊ˜FR"¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B≤¶ˆ%ˆñB““&WÁ&◊3∞¢6ˆÁ7B≤Ê˜FR““&WÊ&ˆGí«¬∑”∞†¢G'í∞¢6ˆÁ7B&VƒñB“vóB&W6ˆ«fT¶ˆ$ñDÁíáˆˆ¬¬¶ˆ%ˆñBì∞¢ñbÇ&VƒñBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢&¶ˆ%ˆñBòNäòéânãûàâ^òûäﬁàr"“ì∞¢vóB76W'D¶ˆ$7FñˆÊ&∆Tf˜%FV6ÜÊñ6ñ‚áˆˆ¬¬&VƒñBì∞†¢vóBˆˆ¬ÁVW'íÄ¢UDDRV&∆ñ2Ê¶ˆ'24UBFV6ÜÊñ6ñÂˆÊ˜FS“C¬FV6ÜÊñ6ñÂˆÊ˜FUˆC‘‰ırÇítÑU$R¶ˆ%ˆñC“C&¿¢∂Ê˜FR«¬""¬&VƒñE–¢ì∞¢&W2Êß6ˆ‚á≤7V66W73¢G'VR“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÑÁV÷&W"ÜRÁ7FGW2«¬SííÊß6ˆ‚á≤W'&˜#¢RÊ÷W76vR«¬.âÆãâûâ~ãnàäæäã.ä.òäæâ^ãéòNäòéäÆã>òä>ò~àÇ"¬6ˆFS¢RÊ6ˆFR«¬VÊFVfñÊVB“ì∞¢–ß“ì∞†¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ)»Rdî‰ƒï§R§Ù"éòäÆä>ò~àéäÆãNòûâíÚä.àòä^ãNàí≤ä^ã.ä.òàæò~âûâ^òŒàÆòéã.àp¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶Á˜7BÇ"ˆ¶ˆ'2Û¶¶ˆ%ˆñBˆfñÊ∆ó¶R"¬&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B≤¶ˆ%ˆñB““&WÁ&◊3∞¢ÚÚDT%Trá&ˆGV7Fñˆ‚◊6fRì¢àÆòéä~ä.ä.ã~âûä.ãâûä~òéã"&WVW7Bä~ãNòéà~ânãnàr6W'fW"àéä>ãNàp¢ÚÚéàä>â>ã^àÆòéã.à~àâNâæãNâNà~ã.âûòä^òûä~òà~ã^ä.â¢òNäòéäãR∆ˆrí(	B∆ˆròàNòÇñB∑7FGW2òNäòÇ∆ˆrà.òûäﬁäãûä^ä^ãûààNòûã ¢G'í≤6ˆÁ6ˆ∆RÊ∆ˆrÇu∂fñÊ∆ó¶U“ÜóBr¬≤¶ˆ%ˆñC¢7G&ñÊrÜ¶ˆ%ˆñBí¬FV6É¢ˆWFÖW6W&Ê÷Rá&Wí¬7FGW3¢7G&ñÊrá&WÊ&ˆGìÚÁ7FGW2«¬rríÁG&ñ“Çí“ì≤“6F6Ç∑–¢6ˆÁ7B7FGW2“7G&ñÊrá&WÊ&ˆGìÚÁ7FGW2«¬""íÁG&ñ“Çì∞¢6ˆÁ7B6ñvÊGW&UˆFF“&WÊ&ˆGìÚÁ6ñvÊGW&UˆFF∞¢6ˆÁ7BÊ˜FR“7G&ñÊrá&WÊ&ˆGìÚÊÊ˜FR«¬""íÁG&ñ“Çì∞¢6ˆÁ7B&Wfó6óE˜&W7V«B“7G&ñÊrá&WÊ&ˆGìÚÁ&Wfó6óE˜&W7V«B«¬""íÁG&ñ“ÇíÁFÙ∆˜vW$66RÇì∞¢6ˆÁ7B&Wfó6óEˆÊ˜FR“7G&ñÊrá&WÊ&ˆGìÚÁ&Wfó6óEˆÊ˜FR«¬""íÁG&ñ“Çì∞¢6ˆÁ7Bv'&ÁGïˆ∂ñÊB“7G&ñÊrá&WÊ&ˆGìÚÁv'&ÁGïˆ∂ñÊB«¬""íÁG&ñ“Çì∞¢6ˆÁ7Bv'&ÁGïˆ÷ˆÁFá2“&WÊ&ˆGìÚÁv'&ÁGïˆ÷ˆÁFá3∞†¢6ˆÁ7B&Uˆ6∆VÊñÊuˆ6ÜV6∂∆ó7B“'&íÊó4'&íá&WÊ&ˆGìÚÁ&Uˆ6∆VÊñÊuˆ6ÜV6∂∆ó7BíÚ&WÊ&ˆGíÁ&Uˆ6∆VÊñÊuˆ6ÜV6∂∆ó7B¢ÁV∆√∞¢6ˆÁ7B˜7Eˆ6∆VÊñÊuˆ6ÜV6∂∆ó7B“'&íÊó4'&íá&WÊ&ˆGìÚÁ˜7Eˆ6∆VÊñÊuˆ6ÜV6∂∆ó7BíÚ&WÊ&ˆGíÁ˜7Eˆ6∆VÊñÊuˆ6ÜV6∂∆ó7B¢ÁV∆√∞¢6ˆÁ7BÜ˜Fıˆ6≤“á&WÊ&ˆGíbbGóVˆb&WÊ&ˆGíÁÜ˜Fıˆ6∂Ê˜v∆VFvV÷VÁB””“vˆ&¶V7BríÚ&WÊ&ˆGíÁÜ˜Fıˆ6∂Ê˜v∆VFvV÷VÁB¢ÁV∆√∞¢6ˆÁ7B6∆˜6U˜ñ÷VÁEˆ÷WFÜˆB“7G&ñÊrá&WÊ&ˆGìÚÊ6∆˜6U˜ñ÷VÁEˆ÷WFÜˆB«¬rríÁG&ñ“Çì∞¢6ˆÁ7B6∆˜6U˜ñ÷VÁE˜7FGW2“7G&ñÊrá&WÊ&ˆGìÚÊ6∆˜6U˜ñ÷VÁE˜7FGW2«¬rríÁG&ñ“Çì∞¢6ˆÁ7B6∆˜6Uˆ66Öˆ÷˜VÁB“&WÊ&ˆGìÚÊ6∆˜6Uˆ66Öˆ÷˜VÁB”“ÁV∆¬ÚÁV∆¬¢ÁV÷&W"á&WÊ&ˆGíÊ6∆˜6Uˆ66Öˆ÷˜VÁBì∞¢6ˆÁ7B6∆˜6U˜ñ÷VÁEˆÊ˜FR“7G&ñÊrá&WÊ&ˆGìÚÊ6∆˜6U˜ñ÷VÁEˆÊ˜FR«¬rríÁG&ñ“Çì∞¢6ˆÁ7B6∆˜6Uˆ66Öˆ6ˆÊfó&÷VB“&WÊ&ˆGìÚÊ6∆˜6Uˆ66Öˆ6ˆÊfó&÷VC∞¢6ˆÁ7B6∆˜6U˜6ñvÊGW&U˜GóR“7G&ñÊrá&WÊ&ˆGìÚÊ6∆˜6U˜6ñvÊGW&U˜GóR«¬wFV6ÜÊñ6ñÂ˜6ñvÊGW&RríÁG&ñ“Çì∞†¢ñbÇ≤.òäÆä>ò~àéòä^òûär"¬.ä.àòä^ãNà%“ÊñÊ6«VFW2á7FGW2íí∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢'7FGW2â^òûäﬁà~òâæò~âí~òäÆä>ò~àéòä^òûärräæä>ã~ä“~ä.àòä^ãNàr"“ì∞¢–¢ñbÇ6ñvÊGW&UˆFFí∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.â^òûäﬁà~äã^ä^ã.ä.òàæò~âûâæãNâNà~ã.âí"“ì∞¢–¢ñbá7FGW2””“~òäÆä>ò~àéòä^òûärrí∞¢ñbÇ&Uˆ6∆VÊñÊuˆ6ÜV6∂∆ó7B«¬&Uˆ6∆VÊñÊuˆ6ÜV6∂∆ó7BÊ∆VÊwFÇí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢~àä>ãéâ>ã.â^ä>ä~àéäÆäã.âÓàòéäﬁâûä^òûã.à~ò>äæòûàNä>â¢r“ì∞¢ñbÇ˜7Eˆ6∆VÊñÊuˆ6ÜV6∂∆ó7B«¬˜7Eˆ6∆VÊñÊuˆ6ÜV6∂∆ó7BÊ∆VÊwFÇí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢~àä>ãéâ>ã.â^ä>ä~àéäæä^ãà~ä^òûã.à~ò>äæòûàNä>â¢r“ì∞¢ñbÇ6∆˜6U˜ñ÷VÁEˆ÷WFÜˆBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢~àä>ãéâ>ã.òä^ã~äﬁàä~ãNâéã^àÆã>ä>ãòà~ãNâír“ì∞¢ñbÜ6∆˜6U˜ñ÷VÁEˆ÷WFÜˆB””“v66Ö˜Fı˜FV6ÜÊñ6ñ‚rí∞¢ñbÇÁV÷&W"Êó4fñÊóFRÜ6∆˜6Uˆ66Öˆ÷˜VÁBí«¬6∆˜6Uˆ66Öˆ÷˜VÁB√“í&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢~àä>ãéâ>ã.ä>ãâÆãéàéã>âûä~âûòà~ãNâûäÆâNâ~ã^òéä>ãâ¢r“ì∞¢ñbÇ6∆˜6Uˆ66Öˆ6ˆÊfó&÷VBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢~àä>ãéâ>ã.ä.ã~âûä.ãâûàã.ä>ä>ãâÆòà~ãNâûäÆâBr“ì∞¢ñbÜ6∆˜6U˜6ñvÊGW&U˜GóR”“wFV6ÜÊñ6ñÂ˜6ñvÊGW&Rrí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢~àä>ãéâ>ã.ò>äæòûàÆòéã.à~òàæò~âûä>ãâÆä>äﬁà~âæãNâNà~ã.âír“ì∞¢–¢–†¢6ˆÁ7B6∆ñVÁB“vóBˆˆ¬Ê6ˆÊÊV7BÇì∞¢G'í∞¢vóB6∆ñVÁBÁVW'íÇ$$Ttî‚"ì∞†¢6ˆÁ7B&VƒñB“vóB&W6ˆ«fT¶ˆ$ñDÁíÜ6∆ñVÁB¬¶ˆ%ˆñBì∞¢ñbÇ&VƒñBí∞¢vóB6∆ñVÁBÁVW'íÇ%$Ùƒƒ$4≤"ì∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢&¶ˆ%ˆñBòNäòéânãûàâ^òûäﬁàr"“ì∞¢–¢6ˆÁ7BFV6ÜÊñ6ñÂ˜W6W&Ê÷R“vóB&WVó&UFV6Ñ˜vÁ5&W6ˆ«fVD¶ˆ"á&W¬&W2¬&VƒñB¬6∆ñVÁBì∞¢ñbÇFV6ÜÊñ6ñÂ˜W6W&Ê÷Rí∞¢vóB6∆ñVÁBÁVW'íÇ%$Ùƒƒ$4≤"ì∞¢&WGW&„∞¢–¢vóB76W'D¶ˆ$7FñˆÊ&∆Tf˜%FV6ÜÊñ6ñ‚Ü6∆ñVÁB¬&VƒñBì∞¢6ˆÁ7BW%VÊóDWfñFVÊ6U&WVW7FVB“&WÊ&ˆGìÚÁW%˜VÊóEˆWfñFVÊ6R””“G'VR«¬7G&ñÊrá&WÊ&ˆGìÚÁW%˜VÊóEˆWfñFVÊ6R«¬rríÁG&ñ“ÇíÁFÙ∆˜vW$66RÇí””“wG'VRr«¬7G&ñÊrá&WÊ&ˆGìÚÁW%˜VÊóEˆWfñFVÊ6R«¬rríÁG&ñ“Çí””“ss∞¢6ˆÁ7BW%VÊóDf∆u"“vóB6∆ñVÁBÁVW'íÜ4TƒT5B4ÙƒU44RáW%˜VÊóEˆWfñFVÊ6UˆVÊ&∆VBƒd≈4Rí2VÊ&∆VBe$Ù“V&∆ñ2Ê¶ˆ'2tÑU$R¶ˆ%ˆñC“Cƒî‘ïB¬∑&VƒñE“ì∞¢6ˆÁ7BW%VÊóDVÊ&∆VB“W%VÊóDWfñFVÊ6U&WVW7FVB«¬W%VÊóDf∆u"Á&˜w3ÚÂ≥”ÚÊVÊ&∆VC∞¢ñbá7FGW2””“.òäÆä>ò~àéòä^òûär"bbW%VÊóDVÊ&∆VBí∞¢6ˆÁ7BVÊóD÷ó76ñÊr“vóBf∆ñFFUW%VÊóD6ˆ◊∆WFñˆ‚á&VƒñB¬6∆ñVÁBì∞¢ñbáVÊóD÷ó76ñÊrí∞¢vóB6∆ñVÁBÁVW'íÇ%$Ùƒƒ$4≤"ì∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢VÊóD÷ó76ñÊr“ì∞¢–¢–¢ÚÚ)»Rà~ã.âûâ~ã^ä¢àãâífñÊ∆ó¶Ràòéäﬁâûâ~ã^òéâ~ãéààNâûàâNòäÆä>ò~àéà.äﬁà~â^ãä~òäﬁàp¶ñbá7FGW2””“.òäÆä>ò~àéòä^òûär"í∞¢G'í∞¢6ˆÁ7B“vóB6∆ñVÁBÁVW'íÄ¢4TƒT5B4ıTÂBÇ¢ì£¶ñÁB2F˜F¬¿¢5T“Ñ44RtÑT‚7FGW3“vFˆÊRrDÑT‚T≈4RT‰Bì£¶ñÁB2FˆÊP¢e$Ù“V&∆ñ2Ê¶ˆ%ˆ76ñvÊ÷VÁG0¢tÑU$R¶ˆ%ˆñC“C¿¢∑&VƒñE–¢ì∞¢6ˆÁ7BF˜F¬“ÁV÷&W"ÜÁ&˜w3ÚÂ≥”ÚÁF˜F¬«¬ì∞¢6ˆÁ7BFˆÊR“ÁV÷&W"ÜÁ&˜w3ÚÂ≥”ÚÊFˆÊR«¬ì∞¢ñbáF˜F¬‚bbFˆÊR¬F˜F¬í∞¢vóB6∆ñVÁBÁVW'íÇ%$Ùƒƒ$4≤"ì∞¢&WGW&‚&W2Á7FGW2ÉCííÊß6ˆ‚á≤W'&˜#¢.ä.ãà~äã^àÆòéã.à~ò>âûâ~ã^äâ~ã^òéä.ãà~òNäòéàâNòäÆä>ò~àÇ"¬76ñvÊ÷VÁG3¢≤F˜F¬¬FˆÊR““ì∞¢–¢“6F6ÇÜRí∞¢ÚÚfñ¬÷˜V„¢ânòûã.â^ã.ä>ã.à~ä.ãà~òNäòéäãR˛òàÆò~àNòNäòéòNâNòíäﬁä.òéã.âÆä^ò~äﬁàNàã.ä>âæãNâNà~ã.âíÜ&6∑v&B6ˆ◊Fñ&∆Rê¢6ˆÁ6ˆ∆RÁv&‚Ç%∂fñÊ∆ó¶U“76ñvÊ÷VÁBwV&B6ÜV6≤fñ∆VB"¬RÊ÷W76vRì∞¢–ß–†¢6ˆÁ7B÷WF"“vóB6∆ñVÁBÁVW'íÄ¢4TƒT5B¶ˆ%˜7FGW2¬¶ˆ%˜GóR¬v'&ÁGïˆVÊEˆB¬&WGW&Â˜&V6ˆ‚¬&WGW&ÊVEˆ@¢e$Ù“V&∆ñ2Ê¶ˆ'0¢tÑU$R¶ˆ%ˆñC“C¢dı"UDDV¿¢∑&VƒñE–¢ì∞¢6ˆÁ7B÷WF“÷WF"Á&˜w5≥“«¬∑”∞¢6ˆÁ7Bó5&Wfó6óDf∆˜r“7G&ñÊrÜ÷WFÊ¶ˆ%˜7FGW2«¬""íÁG&ñ“Çí””“.à~ã.âûòàòûòNà""«¬÷WFÁ&WGW&ÊVEˆB«¬÷WFÁ&WGW&Â˜&V6ˆ„∞¢6ˆÁ7B&Wfó6óE&W7V«B“≤'7V66W76gV¬"¬'VÁ7V66W76gV¬%“ÊñÊ6«VFW2á&Wfó6óE˜&W7V«BíÚ&Wfó6óE˜&W7V«B¢"#∞¢6ˆÁ7B&Wfó6óDÊ˜FR“&Wfó6óEˆÊ˜FR«¬Ê˜FS∞¢∆WB&Wv˜&¥ñÊ6ˆ÷U&W7V«B“ÁV∆√∞†¢ñbÜó5&Wfó6óDf∆˜rbb7FGW2””“.òäÆä>ò~àéòä^òûär"í∞¢ñbÇ&Wfó6óE&W7V«Bí∞¢vóB6∆ñVÁBÁVW'íÇ%$Ùƒƒ$4≤"ì∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.à~ã.âûòàòûòNà.â^òûäﬁà~ä>ãâÆãÇ&Wfó6óE˜&W7V«Bòâæò~âí7V66W76gV¬äæä>ã~ä“VÁ7V66W76gV¬"“ì∞¢–¢ñbÇ&Wfó6óDÊ˜FRí∞¢vóB6∆ñVÁBÁVW'íÇ%$Ùƒƒ$4≤"ì∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.à~ã.âûòàòûòNà.â^òûäﬁà~ä>ãâÆãÇ&Wfó6óEˆÊ˜FRäæä>ã~ä“Ê˜FR"“ì∞¢–¢–†¢ÚÚâÆãâûâ~ãnàä^ã.ä.òàæò~âûâ^òŒòâæò~âûòNâ˛ä^ò¿¢6ˆÁ7B6ñuFÇ“6fTFFW&≈Êrá6ñvÊGW&UˆFF¬4ît‰EU$UÙDï"¬¶ˆ%ÚG∑&VƒñG’ÚG∑7FGW7÷ì∞†¢ÚÚ∂VWFV6ÜÊñ6ñÂˆÊ˜FRWFFVBvóFÇFÜR∆FW7B7V÷÷'í‡¢ÚÚf˜"&Wfó6óB¶ˆ'2vR&VfW"FÜR7G'V7GW&VB&Wfó6óEˆÊ˜FRvÜV‚&˜fñFVB‡¢ñbá&Wfó6óDÊ˜FRí∞¢vóB6∆ñVÁBÁVW'íÄ¢UDDRV&∆ñ2Ê¶ˆ'24UBFV6ÜÊñ6ñÂˆÊ˜FS“C¬FV6ÜÊñ6ñÂˆÊ˜FUˆC‘‰ırÇítÑU$R¶ˆ%ˆñC“C&¿¢∑&Wfó6óDÊ˜FR¬&VƒñE–¢ì∞¢–†¢ñbá7FGW2””“.òäÆä>ò~àéòä^òûär"í∞¢ÚÚ)»Rv'&ÁGíVÊf˜&6V÷VÁBÜfVGW&Rf∆rê¢ÚÚ“∆∆˜rñb«&VGí6WBÜ&6∑v&B6ˆ◊Fñ&ñ∆óGíê¢ÚÚ“î’ı%DÂBá&ˆGV7Fñˆ‚fóÇì¢à~ã.âûä^òûã.àr˛â^ãNâNâ^ãòûàrâ^òûäﬁàrWFÚ÷∆ˆ6≤v'&ÁGíòNâNòûòäòí6∆ñVÁBòNäòéäÆòéà~àNòéã ¢ÚÚòâÓã~òéäﬁòàòûòàNä¢.à~ã.âûàéã.àä>ãâÆâÆòâNãNä"â~ã^òÇTíòNäòéäÆòéàrv'&ÁGïˆ∂ñÊBòä^òûä~â~ã>ò>äæòûâæãNâNà~ã.âûòNäòéòNâNòê¢6ˆÁ7B7W%r“vóB6∆ñVÁBÁVW'íÜ4TƒT5B¶ˆ%˜GóR¬v'&ÁGïˆVÊEˆBe$Ù“V&∆ñ2Ê¶ˆ'2tÑU$R¶ˆ%ˆñC“Cdı"UDDV¬∑&VƒñE“ì∞¢6ˆÁ7B7W"“7W%rÁ&˜w5≥“«¬∑”∞¢6ˆÁ7BÜ5v'&ÁGí“7W"Áv'&ÁGïˆVÊEˆC∞†¢6ˆÁ7BßB“7G&ñÊrÜ7W"Ê¶ˆ%˜GóR«¬rríÁG&ñ“Çì∞¢6ˆÁ7Bó46∆V‚“ßBÊñÊ6«VFW2Ç~ä^òûã.àrrì∞¢6ˆÁ7Bó4ñÁ7F∆¬“ßBÊñÊ6«VFW2Ç~â^ãNâNâ^ãòûàrrì∞†¢ÚÚñb6∆ñVÁBFñF‚wB6VÊBv'&ÁGïˆ∂ñÊBˆ÷ˆÁFá2¬'WB¶ˆ%˜GóRñÊFñ6FW26∆V‚ˆñÁ7F∆¬¬WFÚ÷FW&ófR‡¢6ˆÁ7B6∆ñVÁEt∂ñÊB“7G&ñÊráv'&ÁGïˆ∂ñÊB«¬rríÁG&ñ“Çì∞¢6ˆÁ7B6∆ñVÁDÜ4Áïv'&ÁGîñÁWB“6∆ñVÁEt∂ñÊB«¬v'&ÁGïˆ÷ˆÁFá2“ÁV∆√∞¢6ˆÁ7B6‰WFıv'&ÁGí“Üó46∆V‚«¬ó4ñÁ7F∆¬ì∞††íÚÚî’ı%DÂBá&ˆGV7Fñˆ‚Ü˜FfóÇì††íÚÚäæòûã.äò>äæòûâæä>ãàãâûäã.òâæò~âûòà~ã~òéäﬁâûòNà.â~ã^òéâ~ã>ò>äæòûàÆòéã.à~âæãNâNà~ã.âûòNäòéòNâNòê†íÚÚ“ä^òûã.àr˛â^ãNâNâ^ãòûàs¢WFÚ÷FW&ófRòNâNòê†íÚÚ“àæòéäﬁä¢ânòûã.òNäòéäÆòéà~äã"ò>äæòûàNà~àNòéã.òâNãNä˛ä~òéã.à~òNä~òûòNâNòíÜF÷ñ‚àNòéäﬁä.òàòûäã.ä.äæä^ãàrê†¢∆WBtVÊDó6Ú“ÁV∆√∞¢∆WBt∂ñÊB“ÁV∆√∞¢∆WBt÷ˆÁFá2“ÁV∆√∞††íñbÇÜ5v'&ÁGíí∞†íÚÚW6R6∆ñVÁBñÁWBvÜV‚&W6VÁB‚˜FÜW'vó6RWFÚ&6VBˆ‚¶ˆ%˜GóRf˜"6∆V‚ˆñÁ7F∆¬‡†íÚÚf˜"&Wó"vóFÇÊÚñÁWC¢∆∆˜rV◊GíÜFÚ‰ıBFá&˜ríFÚfˆñB&∆ˆ6∂ñÊrfñÊ∆ó¶R‡†í6ˆÁ7BñÊfW'&VD∂ñÊB“Ü6∆ñVÁEt∂ñÊB«¬Üó46∆V‚Úv6∆V‚r¢Üó4ñÁ7F∆¬ÚvñÁ7F∆¬r¢rrííì∞†í6ˆÁ7B6Ü˜V∆D6ˆ◊WFR“ñÊfW'&VD∂ñÊBbbÜñÊfW'&VD∂ñÊB”“w&Wó"r«¬≥2√b√%“ÊñÊ6«VFW2ÑÁV÷&W"áv'&ÁGïˆ÷ˆÁFá2ííì∞†íñbá6Ü˜V∆D6ˆ◊WFRí∞†í6ˆÁ7Br“6ˆ◊WFUv'&ÁGîVÊBá∞†í¶ˆ%˜GóS¢ßB¿†ív'&ÁGïˆ∂ñÊC¢ñÊfW'&VD∂ñÊB¿†ív'&ÁGïˆ÷ˆÁFá2¿†í7F'C¢ÊWrFFRÇí¿†í“ì∞†ítVÊDó6Ú“rÊVÊBÁFÙï4ı7G&ñÊrÇì∞†ít∂ñÊB“rÊ∂ñÊC∞†ít÷ˆÁFá2“rÊ÷ˆÁFá3∞†í–†í–¢6ˆÁ7B6¥66WFVB“áÜ˜Fıˆ6≤bbÜ˜Fıˆ6≤Ê66WFVBì∞¢6ˆÁ7B÷ó76ñÊuÜ˜F˜2“áÜ˜Fıˆ6≤bb'&íÊó4'&íáÜ˜Fıˆ6≤Ê÷ó76ñÊrííÚÜ˜Fıˆ6≤Ê÷ó76ñÊr¢µ”∞¢6ˆÁ7Bñ÷VÁE7FGW5Fı6fR“6∆˜6U˜ñ÷VÁEˆ÷WFÜˆB””“vF÷ñÂˆÜÊF∆W5˜ñ÷VÁBrÚwVÊFñÊuˆF÷ñÂ˜WFFRr¢Ü6∆˜6U˜ñ÷VÁE˜7FGW2«¬wVÊFñÊu˜fW&ñfñ6Fñˆ‚rì∞¢6ˆÁ7BfñÊ∆ó¶UWB“vóB6∆ñVÁBÁVW'íÄ¢UDDRV&∆ñ2Ê¶ˆ'0¢4UB¶ˆ%˜7FGW3“~òäÆä>ò~àéòä^òûärr¿¢fñÊó6ÜVEˆB“‰ırÇí¿¢fñÊ≈˜6ñvÊGW&U˜FÇ“C¿¢fñÊ≈˜6ñvÊGW&U˜7FGW2“~òäÆä>ò~àéòä^òûärr¿¢fñÊ≈˜6ñvÊGW&UˆB“‰ırÇí¿¢v'&ÁGïˆ∂ñÊB“4ÙƒU44RÇC2¬v'&ÁGïˆ∂ñÊBí¿¢v'&ÁGïˆ÷ˆÁFá2“4ÙƒU44RÇCB¬v'&ÁGïˆ÷ˆÁFá2í¿¢v'&ÁGï˜7F'EˆB“4ÙƒU44Ráv'&ÁGï˜7F'EˆB¬‰ırÇíí¿¢v'&ÁGïˆVÊEˆB“4ÙƒU44RÇCR¬v'&ÁGïˆVÊEˆBí¿¢&Uˆ6∆VÊñÊuˆ6ÜV6∂∆ó7B“4ÙƒU44RÇCc£¶ß6ˆÊ"¬&Uˆ6∆VÊñÊuˆ6ÜV6∂∆ó7Bí¿¢˜7Eˆ6∆VÊñÊuˆ6ÜV6∂∆ó7B“4ÙƒU44RÇCs£¶ß6ˆÊ"¬˜7Eˆ6∆VÊñÊuˆ6ÜV6∂∆ó7Bí¿¢6ÜV6∂∆ó7Eˆ6ˆ◊∆WFVEˆB“‰ırÇí¿¢6ÜV6∂∆ó7Eˆ6ˆ◊∆WFVEˆ'í“CÇ¿¢Ü˜Fıˆ6∂Ê˜v∆VFvV÷VÁE˜&WVó&VB“Cí¿¢Ü˜Fıˆ6∂Ê˜v∆VFvV÷VÁEˆ66WFVB“C¿¢Ü˜Fıˆ6∂Ê˜v∆VFvV÷VÁEˆB“44RtÑT‚CDÑT‚‰ırÇíT≈4RÜ˜Fıˆ6∂Ê˜v∆VFvV÷VÁEˆBT‰B¿¢Ü˜Fıˆ6∂Ê˜v∆VFvV÷VÁEˆ'í“44RtÑT‚CDÑT‚CÇT≈4RÜ˜Fıˆ6∂Ê˜v∆VFvV÷VÁEˆ'íT‰B¿¢÷ó76ñÊu˜Ü˜Fıˆ6FVv˜&ñW2“4ÙƒU44RÇC£¶ß6ˆÊ"¬÷ó76ñÊu˜Ü˜Fıˆ6FVv˜&ñW2í¿¢6∆˜6U˜ñ÷VÁEˆ÷WFÜˆB“C"¿¢6∆˜6U˜ñ÷VÁE˜7FGW2“C2¿¢ñ÷VÁE˜7FGW2“44RtÑT‚4ÙƒU44Ráñ÷VÁE˜7FGW2¬rrì“wñBrDÑT‚ñ÷VÁE˜7FGW2T≈4RC2T‰B¿¢6∆˜6Uˆ66Öˆ÷˜VÁB“CB¿¢6∆˜6U˜ñ÷VÁEˆÊ˜FR“ÂTƒƒîbÇCR¬rrí¿¢6∆˜6Uˆ66Öˆ6ˆÊfó&÷VB“Cb¿¢6∆˜6Uˆ66Öˆ6ˆÊfó&÷VEˆB“44RtÑT‚CbDÑT‚‰ırÇíT≈4R6∆˜6Uˆ66Öˆ6ˆÊfó&÷VEˆBT‰B¿¢6∆˜6Uˆ66Öˆ6ˆÊfó&÷VEˆ'í“44RtÑT‚CbDÑT‚CÇT≈4R6∆˜6Uˆ66Öˆ6ˆÊfó&÷VEˆ'íT‰B¿¢6∆˜6U˜6ñvÊGW&U˜GóR“Cr¿¢6∆˜6U˜6ñvÊGW&Uˆ'í“CÇ¿¢6∆˜6U˜6ñvÊGW&UˆB“‰ırÇê¢tÑU$R¶ˆ%ˆñC“C ¢$UEU$‰î‰rfñÊó6ÜVEˆF¿¢∑6ñuFÇ¬&VƒñB¬t∂ñÊB¬t÷ˆÁFá2¬tVÊDó6Ú¿¢&Uˆ6∆VÊñÊuˆ6ÜV6∂∆ó7BÚ•4Ù‚Á7G&ñÊvñgíá&Uˆ6∆VÊñÊuˆ6ÜV6∂∆ó7Bí¢ÁV∆¬¿¢˜7Eˆ6∆VÊñÊuˆ6ÜV6∂∆ó7BÚ•4Ù‚Á7G&ñÊvñgíá˜7Eˆ6∆VÊñÊuˆ6ÜV6∂∆ó7Bí¢ÁV∆¬¿¢FV6ÜÊñ6ñÂ˜W6W&Ê÷R¿¢÷ó76ñÊuÜ˜F˜2Ê∆VÊwFÇ‚¿¢6¥66WFVB¿¢÷ó76ñÊuÜ˜F˜2Ê∆VÊwFÇÚ•4Ù‚Á7G&ñÊvñgíÜ÷ó76ñÊuÜ˜F˜2í¢ÁV∆¬¿¢6∆˜6U˜ñ÷VÁEˆ÷WFÜˆB«¬ÁV∆¬¿¢ñ÷VÁE7FGW5Fı6fR¿¢ÁV÷&W"Êó4fñÊóFRÜ6∆˜6Uˆ66Öˆ÷˜VÁBíÚ6∆˜6Uˆ66Öˆ÷˜VÁB¢ÁV∆¬¿¢6∆˜6U˜ñ÷VÁEˆÊ˜FR¿¢6∆˜6Uˆ66Öˆ6ˆÊfó&÷VB¿¢6∆˜6U˜6ñvÊGW&U˜GóR«¬wFV6ÜÊñ6ñÂ˜6ñvÊGW&Ru–¢ì∞¢6ˆÁ7BW'6ó7FVDfñÊó6ÜVDB“fñÊ∆ó¶UWBÁ&˜w5≥”ÚÊfñÊó6ÜVEˆB«¬ÁV∆√∞¢ñbÜó5&Wfó6óDf∆˜rbb&Wfó6óE&W7V«Bí∞¢ÚÚ6∆˜6ñÊr&Wfó6óBá&Wv˜&≤í¶ˆ"Fá&˜VvÇFÜR6÷R6Ü&VBv˜&∂f∆˜r2FÜP¢ÚÚF÷ñ‚&W6ˆ«fRVÊGˆñÁC¢w7V66W76gV¬r&V∆V6W2FÜRı$îtî‰¬FV6ÜÊñ6ñ‚w0¢ÚÚW6VBñÊ6ˆ÷RÜ∂WñVBˆfbFÜR&Wv˜&µˆ66R&˜rw2FV6ÜÊñ6ñÂ˜W6W&Ê÷R¬Ê˜@¢ÚÚvÜˆWfW"ó27W'&VÁF«í76ñvÊVB¬ñ‚66RFÜR¶ˆ"v2&V76ñvÊVBf˜"FÜP¢ÚÚ&Wfó6óBì≤wVÁ7V66W76gV¬rW&÷ÊVÁF«ífˆñG2FÜRÜˆ∆B(	BÊÚ÷ˆÊWí÷˜fW2‡¢6ˆÁ7B&7“vóB6∆ñVÁBÁVW'íÄ¢4TƒT5B¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&Wv˜&µˆ66W0¢tÑU$R¶ˆ%ˆñC“C‰B7FGW2î‚Çv˜V‚r¬vñÂ˜&ˆw&W72rê¢ı$DU"%í7&VFVEˆBDU40¢ƒî‘ïB¢dı"UDDV¿¢∑&VƒñE–¢ì∞¢6ˆÁ7B&Wv˜&¥66R“&7Á&˜w5≥“«¬ÁV∆√∞¢ñbá&Wv˜&¥66Rí∞¢6ˆÁ7B&W6ˆ«WFñˆ‚“&Wfó6óE&W7V«B””“w7V66W76gV¬rÚvfóÜVBr¢vfñ∆VBs∞¢vóB6∆ñVÁBÁVW'íÄ¢UDDRV&∆ñ2ÁFV6ÜÊñ6ñÂ˜&Wv˜&µˆ66W0¢4UB7FGW3“w&W6ˆ«fVBr¬&W6ˆ«WFñˆ„“C"¬&Wfó6óE˜&W7V«C“C2¬&Wfó6óEˆÊ˜FS“CB¿¢&W6ˆ«fVEˆ'ì“CR¬&W6ˆ«fVEˆC‘‰ırÇí¬WFFVEˆC‘‰ırÇê¢tÑU$R&Wv˜&µˆ66UˆñC“C¿¢∑&Wv˜&¥66RÁ&Wv˜&µˆ66UˆñB¬&W6ˆ«WFñˆ‚¬&Wfó6óE&W7V«B¬&Wfó6óDÊ˜FR«¬ÁV∆¬¬FV6ÜÊñ6ñÂ˜W6W&Ê÷U–¢ì∞¢&Wv˜&¥ñÊ6ˆ÷U&W7V«B“vóBˆ6∆˜6U&Wv˜&¥66UvóFÑñÊ6ˆ÷U&V∆V6RÜ6∆ñVÁB¬∞¢&Wv˜&¥66TñC¢&Wv˜&¥66RÁ&Wv˜&µˆ66UˆñB¿¢7V66W76gV√¢&W6ˆ«WFñˆ‚””“vfóÜVBr¿¢fñÊó6ÜVDC¢W'6ó7FVDfñÊó6ÜVDB¿¢7F˜#¢FV6ÜÊñ6ñÂ˜W6W&Ê÷R¿¢“ì∞¢–¢vóB∆ˆt¶ˆ%WFFRÄ¢&VƒñB¿¢∞¢7F˜%˜W6W&Ê÷S¢FV6ÜÊñ6ñÂ˜W6W&Ê÷R¿¢7F˜%˜&ˆ∆S¢'FV6Ç"¿¢7Fñˆ„¢'&Wfó6óE˜&W7V«B"¿¢÷W76vS¢&Wfó6óE&W7V«B””“'7V66W76gV¬"Ú'7V66W76gV¬"¢'VÁ7V66W76gV¬"¿¢ñ∆ˆC¢∞¢&Wfó6óE˜&W7V«C¢&Wfó6óE&W7V«B¿¢&Wfó6óEˆÊ˜FS¢&Wfó6óDÊ˜FR«¬ÁV∆¬¿¢WfñFVÊ6U˜Ü6W3¢≤'&Wfó6óEˆ&Vf˜&R"¬'&Wfó6óEˆgFW""¬'&Wfó6óEˆFVfV7B%“¿¢&Wv˜&µˆ66UˆñC¢&Wv˜&¥66RÚ&Wv˜&¥66RÁ&Wv˜&µˆ66UˆñB¢ÁV∆¬¿¢ñÊ6ˆ÷U˜&V∆V6S¢&Wv˜&¥ñÊ6ˆ÷U&W7V«BÚ≤&V∆V6VC¢&Wv˜&¥ñÊ6ˆ÷U&W7V«BÁ&V∆V6VB¬÷˜VÁC¢&Wv˜&¥ñÊ6ˆ÷U&W7V«BÊ÷˜VÁB«¬¬ñ˜WEˆñC¢&Wv˜&¥ñÊ6ˆ÷U&W7V«BÁñ˜WEˆñB«¬ÁV∆¬“¢ÁV∆¬¿¢“¿¢“¿¢6∆ñVÁ@¢ì∞¢–¢vóB∆ˆt¶ˆ%WFFRá&VƒñB¬∞¢7F˜%˜W6W&Ê÷S¢FV6ÜÊñ6ñÂ˜W6W&Ê÷R¿¢7F˜%˜&ˆ∆S¢wFV6Çr¿¢7Fñˆ„¢vfñÊ∆ó¶UˆFˆÊRr¿¢÷W76vS¢~òäÆä>ò~àéòä^òûärr¿¢ñ∆ˆC¢∞¢v'&ÁGïˆ∂ñÊC¢t∂ñÊB«¬ÁV∆¬¿¢v'&ÁGïˆ÷ˆÁFá3¢t÷ˆÁFá2«¬ÁV∆¬¿¢v'&ÁGïˆVÊEˆC¢tVÊDó6Ú«¬ÁV∆¬¿¢&Wfó6óE˜&W7V«C¢&Wfó6óE&W7V«B«¬ÁV∆¬¿¢&Wfó6óEˆÊ˜FS¢&Wfó6óDÊ˜FR«¬ÁV∆¬¿¢6∆˜6U˜ñ÷VÁEˆ÷WFÜˆC¢6∆˜6U˜ñ÷VÁEˆ÷WFÜˆB«¬ÁV∆¬¿¢6∆˜6U˜ñ÷VÁE˜7FGW3¢6∆˜6U˜ñ÷VÁEˆ÷WFÜˆB””“vF÷ñÂˆÜÊF∆W5˜ñ÷VÁBrÚwVÊFñÊuˆF÷ñÂ˜WFFRr¢Ü6∆˜6U˜ñ÷VÁE˜7FGW2«¬wVÊFñÊu˜fW&ñfñ6Fñˆ‚rí¿¢6∆˜6U˜6ñvÊGW&U˜GóS¢6∆˜6U˜6ñvÊGW&U˜GóR«¬wFV6ÜÊñ6ñÂ˜6ñvÊGW&Rr¿¢Ü˜Fıˆ6∂Ê˜v∆VFvV÷VÁEˆ66WFVC¢áÜ˜Fıˆ6≤bbÜ˜Fıˆ6≤Ê66WFVBí¿¢–¢“¬6∆ñVÁBì∞†¢ÚÚânòûã.ä^ãûààNòûã.àéòéã.ä.òà~ãNâûäÆâNò>äæòûàÆòéã.à~ânã~äﬁòNä~òíò>äæòûâÆãâûâ~ãnà∆VFvW"òä.àòä^ãäæãàäﬁäﬁààéã.àä.äﬁâNàéòéã.ä.àÆòéã.à~ò>âûà~ä~âNâ~ãâûâ~ãP¢ñbÖ7G&ñÊrÜ6∆˜6U˜ñ÷VÁEˆ÷WFÜˆB«¬rríÁG&ñ“Çí””“v66Ö˜Fı˜FV6ÜÊñ6ñ‚rí∞¢G'í∞¢6ˆÁ7B66Ñˆfg6WB“vóBFV6ÜÊñ6ñ‰66Ñ6ˆ∆∆V7FñˆÁ2ÊVÁ7W&Tˆfg6WDf˜$¶ˆ"á∞¢6∆ñVÁB¿¢¶ˆ%ˆñC¢&VƒñB¿¢7F˜%˜W6W&Ê÷S¢FV6ÜÊñ6ñÂ˜W6W&Ê÷R¿¢6˜W&6S¢v¶ˆ%ˆfñÊ∆ó¶Rr¿¢“ì∞¢vóB∆ˆt¶ˆ%WFFRá&VƒñB¬∞¢7F˜%˜W6W&Ê÷S¢FV6ÜÊñ6ñÂ˜W6W&Ê÷R¿¢7F˜%˜&ˆ∆S¢wFV6Çr¿¢7Fñˆ„¢wFV6Öˆ66Öˆ6ˆ∆∆V7FñˆÂˆˆfg6WBr¿¢÷W76vS¢66Ñˆfg6WBÁ6∂óVBÚFV6Ç66Çˆfg6WB6∂óVC¢G∂66Ñˆfg6WBÁ&V6ˆ‚«¬rw÷¢~âÆãâûâ~ãnàòà~ãNâûäÆâNâ~ã^òéàÆòéã.à~ânã~äﬁòNä~òûòä^ãäæãààéã.àà~ä~âNàéòéã.ä.òä^òûärr¿¢ñ∆ˆC¢66Ñˆfg6WB¿¢“¬6∆ñVÁBì∞¢“6F6ÇÜ66ÑW'"í∞¢vóB∆ˆt¶ˆ%WFFRá&VƒñB¬∞¢7F˜%˜W6W&Ê÷S¢FV6ÜÊñ6ñÂ˜W6W&Ê÷R¿¢7F˜%˜&ˆ∆S¢wFV6Çr¿¢7Fñˆ„¢wFV6Öˆ66Öˆ6ˆ∆∆V7FñˆÂˆˆfg6WEˆfñ∆VBr¿¢÷W76vS¢7G&ñÊrÜ66ÑW'#ÚÊ6ˆFR«¬66ÑW'#ÚÊ÷W76vR«¬uDT4ÖÙ44ÖÙÙde4UEÙdîƒTBrí¿¢ñ∆ˆC¢≤W'&˜#¢7G&ñÊrÜ66ÑW'#ÚÊ÷W76vR«¬66ÑW'"í¬6ˆFS¢66ÑW'#ÚÊ6ˆFR«¬ÁV∆¬“¿¢“¬6∆ñVÁBì∞¢Fá&˜r66ÑW'#∞¢–¢–¢“V«6R∞¢vóB6∆ñVÁBÁVW'íÄ¢UDDRV&∆ñ2Ê¶ˆ'0¢4UB¶ˆ%˜7FGW3“~ä.àòä^ãNàr¿¢6Ê6V∆VEˆB“‰ırÇí¿¢6Ê6V≈˜&V6ˆ‚“4ÙƒU44RÑÂTƒƒîbÇC¬rrí¬6Ê6V≈˜&V6ˆ‚í¿¢fñÊ≈˜6ñvÊGW&U˜FÇ“C"¿¢fñÊ≈˜6ñvÊGW&U˜7FGW2“~ä.àòä^ãNàr¿¢fñÊ≈˜6ñvÊGW&UˆB“‰ırÇê¢tÑU$R¶ˆ%ˆñC“C6¿¢∂Ê˜FR¬6ñuFÇ¬&VƒñE–¢ì∞¢vóB∆ˆt¶ˆ%WFFRá&VƒñB¬≤7F˜%˜W6W&Ê÷S¢FV6ÜÊñ6ñÂ˜W6W&Ê÷R¬7F˜%˜&ˆ∆S¢wFV6Çr¬7Fñˆ„¢vfñÊ∆ó¶Uˆ6Ê6V¬r¬÷W76vS¢Ê˜FR«¬~ä.àòä^ãNàr“¬6∆ñVÁBì∞¢–†¢vóB6∆ñVÁBÁVW'íÇ$4Ù‘‘ïB"ì∞¢6ˆÁ7BfñÊ∆ó¶VE7FGW2“7G&ñÊrá7FGW2«¬rríÁG&ñ“Çì∞¢6ˆÁ7BfñÊ∆ó¶VE7FGW4∆˜vW"“fñÊ∆ó¶VE7FGW2ÁFÙ∆˜vW$66RÇì∞¢ñbÜfñÊ∆ó¶VE7FGW2ÊñÊ6«VFW2Ç~òäÆä>ò~àÇrí«¬fñÊ∆ó¶VE7FGW2ÊñÊ6«VFW2Ç~âæãNâNà~ã.âírí«¬≤vFˆÊRr¬v6ˆ◊∆WFVBr¬v6∆˜6VBu“ÊñÊ6«VFW2ÜfñÊ∆ó¶VE7FGW4∆˜vW"íí∞¢G'í∞¢6ˆÁ7BFV““vóBvWEFV‘f˜$¶ˆ"á&VƒñBì∞¢vóB˜&Vg&W6ÖFV6ÜÊñ6ñ‰ñÊ6ˆ÷U&WfñWtf˜$¶ˆ"á&VƒñB¬FV“¬≤6˜W&6S¢v¶ˆ%ˆ6∆˜6VE˜&WfñWrr“ì∞¢“6F6ÇÜRí∞¢G'í≤6ˆÁ6ˆ∆RÁv&‚Çu∑FV6ÖˆñÊ6ˆ÷U˜&WfñWu“fñÊ∆ó¶R&Vg&W6Çfñ∆VBr¬≤¶ˆ%ˆñC¢&VƒñB¬W'&˜#¢RÊ÷W76vR“ì≤“6F6Ç∑–¢–¢“V«6RñbÜfñÊ∆ó¶VE7FGW2ÊñÊ6«VFW2Ç~ä.àòä^ãNàrí«¬≤v6Ê6V¬r¬v6Ê6V∆∆VBr¬v6Ê6V∆VBu“ÊñÊ6«VFW2ÜfñÊ∆ó¶VE7FGW4∆˜vW"íí∞¢G'í∞¢6ˆÁ7BFV““vóBvWEFV‘f˜$¶ˆ"á&VƒñBì∞¢vóB˜7ñÊ4Fó7∆îf˜$¶ˆ%7FFRÄ¢≤¶ˆ%ˆñC¢&VƒñB¬¶ˆ%˜7FGW3¢v6Ê6V∆∆VBr¬6Ê6V∆VEˆC¢ÊWrFFRÇí¬6Ê6V≈˜&V6ˆ„¢Ê˜FR«¬~ä.àòä^ãNàr“¿¢FV“¿¢≤6ˆÁFWáC¢vÜó7F˜'ír–¢ì∞¢“6F6ÇÜRí∞¢G'í≤6ˆÁ6ˆ∆RÁv&‚Çu∑FV6ÖˆñÊ6ˆ÷UˆFó7∆ï“fñÊ∆ó¶R6Ê6V¬7ñÊ2fñ∆VBr¬≤¶ˆ%ˆñC¢&VƒñB¬W'&˜#¢RÊ÷W76vR“ì≤“6F6Ç∑–¢–¢–¢&W2Êß6ˆ‚á≤7V66W73¢G'VR¬¶ˆ%ˆñC¢ÁV÷&W"á&VƒñBí¬7FGW2¬ñÊ6ˆ÷U˜&V∆V6S¢&Wv˜&¥ñÊ6ˆ÷U&W7V«B“ì∞¢“6F6ÇÜRí∞¢vóB6∆ñVÁBÁVW'íÇ%$Ùƒƒ$4≤"ì∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÑÁV÷&W"ÜRÁ7FGW2«¬SííÊß6ˆ‚á≤W'&˜#¢RÊ÷W76vR«¬.âæãNâNà~ã.âí˛ä.àòä^ãNàòNäòéäÆã>òä>ò~àÇ"“ì∞¢“fñÊ∆«í∞¢6∆ñVÁBÁ&V∆V6RÇì∞¢–ß“ì∞†¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ)»RDT“54ît‰‘TÂC¢÷&≤FˆÊRW"FV6ÜÊñ6ñ‡¢ÚÚ“ı5Bˆ¶ˆ'2Û¶¶ˆ%ˆñBˆ76ñvÊ÷VÁB÷FˆÊR≤FV6ÜÊñ6ñÂ˜W6W&Ê÷R–¢ÚÚ“&WGW&Á2≤7V66W72¬∆≈ˆFˆÊR¬76ñvÊ÷VÁG3ß∑F˜F¬∆FˆÊW“–¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶Á˜7BÇ"ˆ¶ˆ'2Û¶¶ˆ%ˆñBˆ76ñvÊ÷VÁB÷FˆÊR"¬&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B¶ˆ%ˆñB“ÁV÷&W"á&WÁ&◊2Ê¶ˆ%ˆñBì∞¢6ˆÁ7BFV6ÜÊñ6ñÂ˜W6W&Ê÷R“ˆWFÖW6W&Ê÷Rá&Wì∞¢ñbÇ¶ˆ%ˆñBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢&¶ˆ%ˆñBòNäòéânãûàâ^òûäﬁàr"“ì∞¢ñbÇFV6ÜÊñ6ñÂ˜W6W&Ê÷Rí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢%T‰UDÑı$ï§TB"“ì∞†¢6ˆÁ7B6∆ñVÁB“vóBˆˆ¬Ê6ˆÊÊV7BÇì∞¢G'í∞¢vóB6∆ñVÁBÁVW'íÇ$$Ttî‚"ì∞¢6ˆÁ7B&VƒñB“vóB&W6ˆ«fT¶ˆ$ñDÁíÜ6∆ñVÁB¬¶ˆ%ˆñBì∞¢ñbÇ&VƒñBí∞¢vóB6∆ñVÁBÁVW'íÇ%$Ùƒƒ$4≤"ì∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢&¶ˆ%ˆñBòNäòéânãûàâ^òûäﬁàr"“ì∞¢–†¢6ˆÁ7B˜vÁ4¶ˆ"“vóB76W'EFV6Ñ&V∆ˆÊw5FÙ¶ˆ"Ü6∆ñVÁB¬&VƒñB¬FV6ÜÊñ6ñÂ˜W6W&Ê÷Rì∞¢ñbÇ˜vÁ4¶ˆ"í∞¢vóB6∆ñVÁBÁVW'íÇ%$Ùƒƒ$4≤"ì∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.àÆòéã.à~àNâûâûã^òûòNäòéòNâNòûäﬁä.ãûòéò>âûâ~ã^äà.äﬁà~à~ã.âûâûã^òí"“ì∞¢–¢vóB76W'D¶ˆ$7FñˆÊ&∆Tf˜%FV6ÜÊñ6ñ‚Ü6∆ñVÁB¬&VƒñBì∞†¢ÚÚW6W'BFÚFˆÊRÜñFV◊˜FVÁBê¢vóB6∆ñVÁBÁVW'íÄ¢ ¢îÂ4U%BîÂDÚV&∆ñ2Ê¶ˆ%ˆ76ñvÊ÷VÁG2Ü¶ˆ%ˆñB¬FV6ÜÊñ6ñÂ˜W6W&Ê÷R¬7FGW2¬FˆÊUˆBê¢d≈TU2ÇC¬C"¬vFˆÊRrƒ‰ırÇíê¢Ù‚4Ù‰dƒî5BÜ¶ˆ%ˆñB¬FV6ÜÊñ6ñÂ˜W6W&Ê÷Rê¢DÚUDDR4UB7FGW3“vFˆÊRr¬FˆÊUˆC‘‰ırÇê¢¿¢∑&VƒñB¬FV6ÜÊñ6ñÂ˜W6W&Ê÷U–¢ì∞†¢6ˆÁ7B“vóB6∆ñVÁBÁVW'íÄ¢4TƒT5B4ıTÂBÇ¢ì£¶ñÁB2F˜F¬¿¢5T“Ñ44RtÑT‚7FGW3“vFˆÊRrDÑT‚T≈4RT‰Bì£¶ñÁB2FˆÊP¢e$Ù“V&∆ñ2Ê¶ˆ%ˆ76ñvÊ÷VÁG0¢tÑU$R¶ˆ%ˆñC“C¿¢∑&VƒñE–¢ì∞¢6ˆÁ7BF˜F¬“ÁV÷&W"ÜÁ&˜w3ÚÂ≥”ÚÁF˜F¬«¬ì∞¢6ˆÁ7BFˆÊR“ÁV÷&W"ÜÁ&˜w3ÚÂ≥”ÚÊFˆÊR«¬ì∞¢6ˆÁ7B∆≈ˆFˆÊR“F˜F¬‚ÚFˆÊR„“F˜F¬¢G'VS∞†¢vóB6∆ñVÁBÁVW'íÇ$4Ù‘‘ïB"ì∞¢&WGW&‚&W2Êß6ˆ‚á≤7V66W73¢G'VR¬¶ˆ%ˆñC¢ÁV÷&W"á&VƒñBí¬∆≈ˆFˆÊR¬76ñvÊ÷VÁG3¢≤F˜F¬¬FˆÊR““ì∞¢“6F6ÇÜRí∞¢vóB6∆ñVÁBÁVW'íÇ%$Ùƒƒ$4≤"ì∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&WGW&‚&W2Á7FGW2ÑÁV÷&W"ÜRÁ7FGW2«¬SííÊß6ˆ‚á≤W'&˜#¢RÊ÷W76vR«¬.âÆãâûâ~ãnàäÆânã.âûãà~ã.âûòNäòéäÆã>òä>ò~àÇ"¬6ˆFS¢RÊ6ˆFR«¬VÊFVfñÊVB“ì∞¢“fñÊ∆«í∞¢6∆ñVÁBÁ&V∆V6RÇì∞¢–ß“ì∞††¶7ñÊ2gVÊ7Fñˆ‚Wáó&UFV6ÜÊñ6ñ‰66WE7FGW6W2Ü6∆ñVÁD˜%ˆˆ¬“ˆˆ¬¬W6W&Ê÷R“ÁV∆¬í∞¢6ˆÁ7B&◊2“µ”∞¢∆WBW6W%vÜW&R“rs∞¢ñbáW6W&Ê÷Rí∞¢&◊2ÁW6ÇÖ7G&ñÊráW6W&Ê÷RíÁG&ñ“Çíì∞¢W6W%vÜW&R“‰BW6W&Ê÷S“BG∑&◊2Ê∆VÊwFá÷∞¢–¢vóB6∆ñVÁD˜%ˆˆ¬ÁVW'íÄ¢tïDÇWáó&VB2Ä¢UDDRV&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W0¢4UB66WE˜7FGW3“wW6VBr¬66WE˜7FGW5˜WFFVEˆC‘‰ırÇí¬66WE˜7FGW5ˆWáó&W5ˆC‘ÂTƒ¿¢tÑU$R4ÙƒU44RÜ66WE˜7FGW2¬wW6VBrì“w&VGíp¢‰BÜ66WE˜7FGW5ˆWáó&W5ˆBï2ÂTƒ¬ı"66WE˜7FGW5ˆWáó&W5ˆB√“‰ırÇíê¢G∑W6W%vÜW&W–¢$UEU$‰î‰rW6W&Ê÷P¢ê¢UDDRV&∆ñ2Ê¶ˆ%ˆˆffW'2¢4UB7FGW3“vWáó&VBr¬&W7ˆÊFVEˆC‘4ÙƒU44RÜÚÁ&W7ˆÊFVEˆBƒ‰ırÇíê¢tÑU$RÚÁ7FGW3“wVÊFñÊrp¢‰BÚÁFV6ÜÊñ6ñÂ˜W6W&Ê÷Rî‚Ö4TƒT5BW6W&Ê÷Re$Ù“Wáó&VBñ¿¢&◊0¢ì∞ß–†¶gVÊ7Fñˆ‚'Vñ∆D66WE7FGW4˜VÂ7¬Ü∆ñ2“wrí∞¢&WGW&‚4ÙƒU44RÇG∂∆ñ7“Ê66WE˜7FGW2¬wW6VBrì“w&VGír‰BG∂∆ñ7“Ê66WE˜7FGW5ˆWáó&W5ˆBï2‰ıBÂTƒ¬‰BG∂∆ñ7“Ê66WE˜7FGW5ˆWáó&W5ˆB‚‰ırÇñ∞ß–†¶gVÊ7Fñˆ‚vWD&Êv∂ˆ¥Ü˜W%7¬Çí∞¢&WGW&‚UÖE$5BÑÑıU"e$Ù“Ñ‰ırÇíBDî‘R§Ù‰Rt6ñÙ&Êv∂ˆ≤ríì£¶ñÁF∞ß–†¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	˘˙"ˇ	˘KBDT4É¢66WB7FGW2éâÓä>òûäﬁäòä>ãNòéäà~ã.âíÚäæä.ãéâNä>ãâÆà~ã.âíê¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶ÊvWBÇ"˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷Rˆ66WB◊7FGW2"¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B≤W6W&Ê÷R““&WÁ&◊3∞¢G'í∞¢vóBWáó&UFV6ÜÊñ6ñ‰66WE7FGW6W2áˆˆ¬¬W6W&Ê÷Rì∞¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5B44P¢tÑT‚4ÙƒU44RÜ66WE˜7FGW2¬wW6VBrì“w&VGíp¢‰B66WE˜7FGW5ˆWáó&W5ˆBï2‰ıBÂTƒ¿¢‰B66WE˜7FGW5ˆWáó&W5ˆB‚‰ırÇê¢DÑT‚w&VGírT≈4RwW6VBrT‰B266WE˜7FGW2¿¢66WE˜7FGW5˜WFFVEˆB¬66WE˜7FGW5ˆWáó&W5ˆB¬∆7EˆFñ«ï˜&VGïˆ@¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W0¢tÑU$RW6W&Ê÷S“C¢ƒî‘ïB¿¢∑W6W&Ê÷U–¢ì∞¢&W2Êß6ˆ‚á"Á&˜w5≥“«¬≤66WE˜7FGW3¢'W6VB"¬66WE˜7FGW5˜WFFVEˆC¢ÁV∆¬¬66WE˜7FGW5ˆWáó&W5ˆC¢ÁV∆¬¬∆7EˆFñ«ï˜&VGïˆC¢ÁV∆¬“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.ò.äæä^âNäÆânã.âûãä>ãâÆà~ã.âûòNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞†¶ÁWBÇ"˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷Rˆ66WB◊7FGW2"¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B≤W6W&Ê÷R““&WÁ&◊3∞¢6ˆÁ7B7FGW2“á&WÊ&ˆGìÚÁ7FGW2«¬""íÁFı7G&ñÊrÇíÁFÙ∆˜vW$66RÇíÁG&ñ“Çì∞†¢ñbÇ≤'&VGí"¬'W6VB%“ÊñÊ6«VFW2á7FGW2íí∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢'7FGW2â^òûäﬁà~òâæò~âí&VGíäæä>ã~ä“W6VB"“ì∞¢–†¢ÚÚ∂VWFÜW6R˜WG6ñFRFÜRWFÇG'í÷&∆ˆ6≤&V6W6RFÜRD"G&Á67Fñˆ‚&V∆˜r«6ÚÊVVG2FÜV“‡¢∆WB7F˜$ó4F÷ñ‚“f«6S∞¢∆WB7F˜%W6W&Ê÷R“rs∞†¢G'í∞¢6ˆÁ7B7GÇ“vóBvWDWFÑ6ˆÁFWáBá&W¬&W2ì∞¢ñbÇ7GÇÊˆ≤í&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢uT‰UDÑı$ï§TBr“ì∞¢6ˆÁ7B7F˜%&ˆ∆R“7G&ñÊrÜ7GÇÊ7F˜#ÚÁ&ˆ∆R«¬rríÁG&ñ“ÇíÁFÙ∆˜vW$66RÇì∞¢7F˜$ó4F÷ñ‚“7F˜%&ˆ∆R””“vF÷ñ‚r«¬7F˜%&ˆ∆R””“w7WW%ˆF÷ñ‚s∞¢7F˜%W6W&Ê÷R“7G&ñÊrÜ7GÇÊ7F˜#ÚÁW6W&Ê÷R«¬7GÇÊVffV7FófSÚÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7BVffV7FófUW6W"“7G&ñÊrÜ7GÇÊVffV7FófSÚÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7BVffV7FófTó5FV6Ç“ó5FV6ÜÊñ6ñÂ&ˆ∆RÜ7GÇÊVffV7FófSÚÁ&ˆ∆Rì∞¢ñbÇ7F˜$ó4F÷ñ‚bbÇVffV7FófTó5FV6Ç«¬VffV7FófUW6W"”“7G&ñÊráW6W&Ê÷R«¬rríÁG&ñ“Çííí∞¢&WGW&‚&W2Á7FGW2ÉC2íÊß6ˆ‚á≤W'&˜#¢tdı$$îDDT‚r“ì∞¢–¢&WÊ7F˜"“7GÇÊ7F˜#∞¢&WÊVffV7FófR“7GÇÊVffV7FófS∞¢&WÊWFÇ“7GÇÊVffV7FófS∞¢&WÊñ◊W'6ˆÊFñÊr“7GÇÊñ◊W'6ˆÊFñÊs∞¢&WÁ6W76ñˆÂ˜Fˆ∂V‚“7GÇÁ6W76ñˆÂ˜Fˆ∂V„∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Çv66WB◊7FGW2WFÇW'&˜#¢r¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢tUDÖÙdîƒTBr“ì∞¢–†¢6ˆÁ7B6∆ñVÁB“vóBˆˆ¬Ê6ˆÊÊV7BÇì∞¢G'í∞¢vóB6∆ñVÁBÁVW'íÇ$$Ttî‚"ì∞†¢6ˆÁ7BWáó'ï“vóB6∆ñVÁBÁVW'íÜ4TƒT5BÇÜFFU˜G'VÊ2ÇvFír¬‰ırÇíBDî‘R§Ù‰Rt6ñÙ&Êv∂ˆ≤rí≤îÂDU%d¬sFíríBDî‘R§Ù‰Rt6ñÙ&Êv∂ˆ≤rí2ÊWáEˆ÷ñFÊñváEˆ&∂∂ì∞¢6ˆÁ7BWáó&W4B“7FGW2””“w&VGírÚWáó'ïÁ&˜w5≥”ÚÊÊWáEˆ÷ñFÊñváEˆ&∂≤¢ÁV∆√∞†¢vóB6∆ñVÁBÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2áW6W&Ê÷R¬66WE˜7FGW2¬66WE˜7FGW5˜WFFVEˆB¬66WE˜7FGW5ˆWáó&W5ˆBê¢d≈TU2ÇC¬C"ƒ‰ırÇí¬C2ê¢Ù‚4Ù‰dƒî5BáW6W&Ê÷RíDÚUDDR4U@¢66WE˜7FGW2“UÑ4≈TDTBÊ66WE˜7FGW2¿¢66WE˜7FGW5˜WFFVEˆB“UÑ4≈TDTBÊ66WE˜7FGW5˜WFFVEˆB¿¢66WE˜7FGW5ˆWáó&W5ˆB“UÑ4≈TDTBÊ66WE˜7FGW5ˆWáó&W5ˆF¿¢∑W6W&Ê÷R¬7FGW2¬Wáó&W4E–¢ì∞†¢vóB6∆ñVÁBÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2ÁFV6ÜÊñ6ñÂˆ66WE˜7FGW5ˆ∆ˆráFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬v˜&µˆFFR¬7FGW2¬6ÜÊvVEˆB¬Wáó&W5ˆB¬6˜W&6R¬Ê˜FRê¢d≈TU2ÇC¬Ñ‰ırÇíBDî‘R§Ù‰Rt6ñÙ&Êv∂ˆ≤rì£¶FFR¬C"¬‰ırÇí¬C2¬CB¬CRñ¿¢∑W6W&Ê÷R¬7FGW2¬Wáó&W4B¬7F˜$ó4F÷ñ‚ÚvF÷ñ‚r¢wFV6ÜÊñ6ñ‚r¬7FGW2””“w&VGírÚ~òâæãNâNä>ãâÆà~ã.âûä~ãâûâûã^òíä>ãâÆâÆàéãâæãNâNäﬁãâ^ò.âûäãâ^ãNäæä^ãà~òâ~ã^òéä.à~àNã~âír¢~âæãNâNä>ãâÆà~ã.âíu–¢ì∞†¢ñbá7FGW2””“'W6VB"í∞¢vóB6∆ñVÁBÁVW'íÄ¢UDDRV&∆ñ2Ê¶ˆ%ˆˆffW'24UB7FGW3“vWáó&VBrtÑU$RFV6ÜÊñ6ñÂ˜W6W&Ê÷S“C‰B7FGW3“wVÊFñÊrv¿¢∑W6W&Ê÷U–¢ì∞¢–†¢vóB6∆ñVÁBÁVW'íÇ$4Ù‘‘ïB"ì∞¢&W2Êß6ˆ‚á≤7V66W73¢G'VR¬66WE˜7FGW3¢7FGW2¬66WE˜7FGW5ˆWáó&W5ˆC¢Wáó&W4B“ì∞¢“6F6ÇÜRí∞¢vóB6∆ñVÁBÁVW'íÇ%$Ùƒƒ$4≤"ì∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.äﬁãâæòâNâ^äÆânã.âûãä>ãâÆà~ã.âûòNäòéäÆã>òä>ò~àÇ"“ì∞¢“fñÊ∆«í∞¢6∆ñVÁBÁ&V∆V6RÇì∞¢–ß“ì∞†¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	˘y>˚àÚDT4É¢vVV∂«íˆfb÷Fó2≤v˜&∂Fí˜fW'&ñFW2ác"ê¢ÚÚ“vVV∂«ïˆˆfeˆFó3¢s√brÖ7V‚≈6Bê¢ÚÚ“˜fW'&ñFW3¢FV6ÜÊñ6ñÂ˜v˜&∂Fó5˜c"áv˜&µˆFFR¬ó5ˆˆfbê¢ÚÚ6fWGì¢∆ñ÷óBVFóBvñÊF˜rÜFVfV«BBFó2ÜVBê¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶6ˆÁ7BT‰$ƒUıDT4Öıtı$¥Dï5ıc"“á&ˆ6W72ÊVÁb‰T‰$ƒUıDT4Öıtı$¥Dï5ıc"«¬#"í””“##∞¶6ˆÁ7BDT4Öıtı$¥Dï5Ù‘ÖÙÑTEÙDï2“ÁV÷&W"á&ˆ6W72ÊVÁbÂDT4Öıtı$¥Dï5Ù‘ÖÙÑTEÙDï2«¬Bì∞†¶ÊvWBÇr˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜vVV∂«í÷ˆfb÷Fó2r¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B≤W6W&Ê÷R““&WÁ&◊3∞¢G'í∞¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÜ4TƒT5B4ÙƒU44RávVV∂«ïˆˆfeˆFó2¬rrí2vVV∂«ïˆˆfeˆFó2e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2tÑU$RW6W&Ê÷S“Cƒî‘ïB¬∑W6W&Ê÷U“ì∞¢6ˆÁ7B&r“"Á&˜w5≥”ÚÁvVV∂«ïˆˆfeˆFó2«¬rs∞¢6ˆÁ7BFó2“&rÁ7∆óBÇr¬ríÊ÷áÉ”‰ÁV÷&W"Ö7G&ñÊráÇíÁG&ñ“ÇíííÊfñ«FW"Ü„”‰ÁV÷&W"Êó4fñÊóFRÜ‚íbb„„”bb„√”bì∞¢&W2Êß6ˆ‚á≤7V66W73ßG'VR¬vVV∂«ïˆˆfeˆFó3¢&r¬Fó2“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢~ò.äæä^âNä~ãâûäæä.ãéâNâæä>ãàéã>äÆãâæâNã.äæòŒòNäòéäÆã>òä>ò~àÇr“ì∞¢–ß“ì∞†¶ÁWBÇr˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜vVV∂«í÷ˆfb÷Fó2r¬7ñÊ2á&W¬&W2í”‚∞¢ñbÇT‰$ƒUıDT4Öıtı$¥Dï5ıc"í&WGW&‚&W2Á7FGW2ÉC2íÊß6ˆ‚á≤W'&˜#¢tfVGW&RFó6&∆VBr“ì∞¢6ˆÁ7B≤W6W&Ê÷R““&WÁ&◊3∞¢6ˆÁ7BFó2“'&íÊó4'&íá&WÊ&ˆGìÚÊFó2íÚ&WÊ&ˆGíÊFó2¢µ”∞¢6ˆÁ7BÊ˜&““'&íÊg&ˆ“Ä¢ÊWr6WBÜFó2Ê÷ÜC”‰ÁV÷&W"ÜBííÊfñ«FW"Ü„”‰ÁV÷&W"Êó4fñÊóFRÜ‚íbb„„”bb„√”bíê¢íÁ6˜'BÇÜ∆"ì”Ê÷"ì∞¢6ˆÁ7B&r“Ê˜&“Ê¶ˆñ‚Çr¬rì∞¢G'í∞¢vóBˆˆ¬ÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2áW6W&Ê÷R¬vVV∂«ïˆˆfeˆFó2ê¢d≈TU2ÇC¬C"ê¢Ù‚4Ù‰dƒî5BáW6W&Ê÷RíDÚUDDR4UBvVV∂«ïˆˆfeˆFó3‘UÑ4≈TDTBÁvVV∂«ïˆˆfeˆFó6¿¢∑W6W&Ê÷R¬&u–¢ì∞¢&W2Êß6ˆ‚á≤7V66W73ßG'VR¬vVV∂«ïˆˆfeˆFó3¢&r¬Fó3¢Ê˜&““ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢~âÆãâûâ~ãnàä~ãâûäæä.ãéâNâæä>ãàéã>äÆãâæâNã.äæòŒòNäòéäÆã>òä>ò~àÇr“ì∞¢–ß“ì∞†¶ÊvWBÇr˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜v˜&∂Fó2◊c"r¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B≤W6W&Ê÷R““&WÁ&◊3∞¢6ˆÁ7Bg&ˆ““7G&ñÊrá&WÁVW'ìÚÊg&ˆ“«¬rríÁG&ñ“Çì∞¢6ˆÁ7BFÚ“7G&ñÊrá&WÁVW'ìÚÁFÚ«¬rríÁG&ñ“Çì∞¢6ˆÁ7Bg&ˆ‘ó6Ú“g&ˆ“«¬FÙó6ÙFFRÜÊWrFFRÇíì∞¢6ˆÁ7BFÙó6Ú“FÚ«¬FÙó6ÙFFRÜÊWrFFRÑFFRÊÊ˜rÇí≤B£ÉcCíì∞¢G'í∞¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5Bv˜&µˆFFS£¶FFR2v˜&µˆFFR¬ó5ˆˆfb¬WFFVEˆ@¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜v˜&∂Fó5˜c ¢tÑU$RFV6ÜÊñ6ñÂ˜W6W&Ê÷S“C‰Bv˜&µˆFFS£¶FFR$UEtTT‚C#£¶FFR‰BC3£¶FFP¢ı$DU"%ív˜&µˆFFR46¿¢∑W6W&Ê÷R¬g&ˆ‘ó6Ú¬FÙó6ı–¢ì∞¢&W2Êß6ˆ‚á≤7V66W73ßG'VR¬óFV◊3¢"Á&˜w2Ê÷áÉ”‚á≤v˜&µˆFFS¢FÙó6ÙFFRáÇÁv˜&µˆFFRí¬ó5ˆˆfc¢ÇÊó5ˆˆfb¬WFFVEˆC¢ÇÁWFFVEˆB“íí“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢~ò.äæä^âNä~ãâûäæä.ãéâNä^òéä~à~äæâûòûã.òNäòéäÆã>òä>ò~àÇr“ì∞¢–ß“ì∞†¶ÁWBÇr˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜v˜&∂Fó2◊c"r¬7ñÊ2á&W¬&W2í”‚∞¢ñbÇT‰$ƒUıDT4Öıtı$¥Dï5ıc"í&WGW&‚&W2Á7FGW2ÉC2íÊß6ˆ‚á≤W'&˜#¢tfVGW&RFó6&∆VBr“ì∞¢6ˆÁ7B≤W6W&Ê÷R““&WÁ&◊3∞¢6ˆÁ7Bv˜&µˆFFR“7G&ñÊrá&WÊ&ˆGìÚÁv˜&µˆFFR«¬rríÁG&ñ“Çì∞¢6ˆÁ7Bó5ˆˆfb“&WÊ&ˆGìÚÊó5ˆˆfc∞¢ñbÇv˜&µˆFFRí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢~â^òûäﬁà~äãRv˜&µˆFFRÖïïïí‘‘“‘DBír“ì∞¢6ˆÁ7Bó6Ú“FÙó6ÙFFRáv˜&µˆFFRì∞¢ñbÇó6Úí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢~ä>ãûâæòâÆâ¢v˜&µˆFFRòNäòéânãûàâ^òûäﬁàrr“ì∞†¢ÚÚ∆ñ÷óBVFóBvñÊF˜p¢6ˆÁ7BFˆFí“ÊWrFFRÇì∞¢FˆFíÁ6WDÜ˜W'2É√√√ì∞¢6ˆÁ7B÷Ç“ÊWrFFRáFˆFíÊvWEFñ÷RÇí≤Ñ÷FÇÊ÷ÇÉ¬DT4Öıtı$¥Dï5Ù‘ÖÙÑTEÙDï2í¢ÉcCíì∞¢6ˆÁ7BB“ÊWrFFRÜó6Ú≤uC££rì∞¢ñbÜB¬FˆFí«¬B‚÷Çí∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢â^ãòûà~àNòéã.òNâNòûòàûâÓã.ãä~ãâûâûã^òûânãnàrG∑FÙó6ÙFFRÜ÷Çó“òâ~òéã.âûãòûâñ“ì∞¢–†¢G'í∞¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2ÁFV6ÜÊñ6ñÂ˜v˜&∂Fó5˜c"áFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬v˜&µˆFFR¬ó5ˆˆfb¬WFFVEˆBê¢d≈TU2ÇC¬C#£¶FFR¬C2ƒ‰ırÇíê¢Ù‚4Ù‰dƒî5BáFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬v˜&µˆFFRê¢DÚUDDR4UBó5ˆˆfc‘UÑ4≈TDTBÊó5ˆˆfb¬WFFVEˆC‘UÑ4≈TDTBÁWFFVEˆ@¢$UEU$‰î‰rv˜&µˆFFS£¶FFR2v˜&µˆFFR¬ó5ˆˆfb¬WFFVEˆF¿¢∑W6W&Ê÷R¬ó6Ú¬ó5ˆˆfe–¢ì∞¢6ˆÁ7B&˜r“"Á&˜w5≥”∞¢&W2Êß6ˆ‚á≤7V66W73ßG'VR¬óFV”¢≤v˜&µˆFFS¢FÙó6ÙFFRá&˜rÁv˜&µˆFFRí¬ó5ˆˆfc¢&˜rÊó5ˆˆfb¬WFFVEˆC¢&˜rÁWFFVEˆB““ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢~âÆãâûâ~ãnàä~ãâûäæä.ãéâNä^òéä~à~äæâûòûã.òNäòéäÆã>òä>ò~àÇr“ì∞¢–ß“ì∞††¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	˙z“5tbFV6ÜÊñ6ñ‚v˜&≤6∆VÊF"bFñ«í&VFñÊW72c ¢ÚÚ“ÊWr6˜W&6RˆbG'WFÇf˜"÷ˆÁFÜ«ífñ∆&ñ∆óGí¬GfÊ6R¶ˆ'2¬ÊB÷˜&ÊñÊr&VFñÊW72‡¢ÚÚ“∆Vv7ívVV∂«ïˆˆfeˆFó2˜v˜&∂Fó2◊c"&˜WFW2&V÷ñ‚f˜"6ˆ◊Fñ&ñ∆óGíˆÊ«í‡¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶gVÊ7Fñˆ‚fó'7DFîˆd÷ˆÁFÑó6ÚÜ÷ˆÁFÖFWáBó∞¢6ˆÁ7B““7G&ñÊrÜ÷ˆÁFÖFWáB«¬rríÁG&ñ“Çì∞¢ñbÇıÂ∆G≥G“’∆G≥'“BÚÁFW7BÜ“íí&WGW&‚G∂◊“”∞¢&WGW&‚FÙó6ÙFFRÜÊWrFFRÇíì∞ß–¶gVÊ7Fñˆ‚FDFó4ó6ÚÜó6Ú¬Fó2ó∞¢6ˆÁ7BB“ÊWrFFRÖ7G&ñÊrÜó6ÚíÁ6∆ñ6RÉ√í≤uC££rì∞¢BÁ6WDFFRÜBÊvWDFFRÇí≤ÁV÷&W"ÜFó2«¬íì∞¢&WGW&‚FÙó6ÙFFRÜBì∞ß–¶gVÊ7Fñˆ‚VÊDFîˆd÷ˆÁFÑó6ÚÜ÷ˆÁFÖFWáBó∞¢6ˆÁ7Bfó'7B“fó'7DFîˆd÷ˆÁFÑó6ÚÜ÷ˆÁFÖFWáBíÁ6∆ñ6RÉ√rí≤r”s∞¢6ˆÁ7BB“ÊWrFFRÜfó'7B≤uC££rì∞¢BÁ6WD÷ˆÁFÇÜBÊvWD÷ˆÁFÇÇí≥ì∞¢BÁ6WDFFRÜBÊvWDFFRÇí”ì∞¢&WGW&‚FÙó6ÙFFRÜBì∞ß–¶gVÊ7Fñˆ‚ó57G&ñ7Dó6ÙFFRáf«VRó∞¢6ˆÁ7B2“7G&ñÊráf«VR«¬rríÁG&ñ“Çì∞¢ñbÇıÂ∆G≥G“’∆G≥'“’∆G≥'“BÚÁFW7Bá2íí&WGW&‚f«6S∞¢&WGW&‚FÙó6ÙFFRá2í””“3∞ß–¶gVÊ7Fñˆ‚ó57G&ñ7D÷ˆÁFÇáf«VRó∞¢6ˆÁ7B2“7G&ñÊráf«VR«¬rríÁG&ñ“Çì∞¢&WGW&‚ıÂ∆G≥G“’∆G≥'“BÚÁFW7Bá2íbbFÙó6ÙFFRÜG∑7“”íÁ7F'G5vóFÇá2ì∞ß–¶7ñÊ2gVÊ7Fñˆ‚vWEFV6ÖFˆFî¶ˆ'2áW6W&Ê÷Ró∞¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÜ ¢4TƒT5B¢Ê¶ˆ%ˆñB¬¢Ê&ˆˆ∂ñÊuˆ6ˆFR¬¢Ê7W7Fˆ÷W%ˆÊ÷R¬¢Ê¶ˆ%˜GóR¬¢ÊˆñÁF÷VÁEˆFFWFñ÷R¿¢4ÙƒU44RÜ¢ÊGW&FñˆÂˆ÷ñ‚√cí2GW&FñˆÂˆ÷ñ‚¬¢Ê¶ˆ%˜7FGW0¢e$Ù“V&∆ñ2Ê¶ˆ'2†¢ƒTeB§Ùî‚V&∆ñ2Ê¶ˆ%ˆ76ñvÊ÷VÁG2¶Ù‚¶Ê¶ˆ%ˆñC÷¢Ê¶ˆ%ˆñB‰B¶ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷S“C¢tÑU$RÜ¢ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷S“Cı"¶ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷S“Cê¢‰B¢ÊˆñÁF÷VÁEˆFFWFñ÷Rï2‰ıBÂTƒ¿¢‰BÜ¢ÊˆñÁF÷VÁEˆFFWFñ÷RBDî‘R§Ù‰Rt6ñÙ&Êv∂ˆ≤rì£¶FFR“Ñ‰ırÇíBDî‘R§Ù‰Rt6ñÙ&Êv∂ˆ≤rì£¶FFP¢‰B4ÙƒU44RÜ¢Ê¶ˆ%˜7FGW2¬rrí‰ıBî‚Çv6Ê6V∆∆VBr¬v6Ê6V∆VBr¬vFˆÊRr¬vfñÊó6ÜVBrê¢u$ıU%í¢Ê¶ˆ%ˆñ@¢ı$DU"%í¢ÊˆñÁF÷VÁEˆFFWFñ÷R40¢¬∑W6W&Ê÷U“ì∞¢&WGW&‚"Á&˜w2«¬µ”∞ß–¶7ñÊ2gVÊ7Fñˆ‚&WVó&T6∆VÊF%W6W&Ê÷T66W72á&W¬&W2¬W6W&Ê÷Ró∞¢6ˆÁ7B7GÇ“vóBvWDWFÑ6ˆÁFWáBá&W¬&W2ì∞¢ñbÇ7GÇÊˆ≤í∞¢&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢uT‰UDÑı$ï§TBr“ì∞¢&WGW&‚ÁV∆√∞¢–¢6ˆÁ7B7F˜%&ˆ∆R“7G&ñÊrÜ7GÇÊ7F˜#ÚÁ&ˆ∆R«¬rríÁG&ñ“ÇíÁFÙ∆˜vW$66RÇì∞¢6ˆÁ7B7F˜$ó4F÷ñ‚“7F˜%&ˆ∆R””“vF÷ñ‚r«¬7F˜%&ˆ∆R””“w7WW%ˆF÷ñ‚s∞¢6ˆÁ7BVffV7FófUW6W"“7G&ñÊrÜ7GÇÊVffV7FófSÚÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7BVffV7FófTó5FV6Ç“ó5FV6ÜÊñ6ñÂ&ˆ∆RÜ7GÇÊVffV7FófSÚÁ&ˆ∆Rì∞¢ñbÇ7F˜$ó4F÷ñ‚bbÇVffV7FófTó5FV6Ç«¬VffV7FófUW6W"”“7G&ñÊráW6W&Ê÷R«¬rríÁG&ñ“Çííí∞¢&W2Á7FGW2ÉC2íÊß6ˆ‚á≤W'&˜#¢tdı$$îDDT‚r“ì∞¢&WGW&‚ÁV∆√∞¢–¢&WÊ7F˜"“7GÇÊ7F˜#∞¢&WÊVffV7FófR“7GÇÊVffV7FófS∞¢&WÊWFÇ“7GÇÊVffV7FófS∞¢&WÊñ◊W'6ˆÊFñÊr“7GÇÊñ◊W'6ˆÊFñÊs∞¢&WÁ6W76ñˆÂ˜Fˆ∂V‚“7GÇÁ6W76ñˆÂ˜Fˆ∂V„∞¢&WGW&‚7GÉ∞ß–¶gVÊ7Fñˆ‚Ê˜&÷∆ó¶T6∆VÊF%&˜rá&˜r¬ó6Ú¬¶ˆ$6˜VÁC”ó∞¢6ˆÁ7B6‚“&˜rÚá&˜rÊ6Âˆ66WEˆGfÊ6Uˆ¶ˆ"””“G'VR«¬≤vGfÊ6UˆˆÊ«ír¬vfñ∆&∆UˆGfÊ6Rr¬wv˜&∂ñÊru“ÊñÊ6«VFW2Ö7G&ñÊrá&˜rÊFï˜7FGW2«¬rrííí¢f«6S∞¢6ˆÁ7B7F'B“6‚Úá&˜sÚÁ7F'E˜Fñ÷R«¬sì£rí¢ÁV∆√∞¢6ˆÁ7BVÊB“6‚Úá&˜sÚÊVÊE˜Fñ÷R«¬sÉ£rí¢ÁV∆√∞¢6ˆÁ7B62“&W6ˆ«fUFV6ÜÊñ6ñ‰6∆VÊF$62á&˜r«¬∑“ì∞¢6ˆÁ7B¶ˆ'2“6‚Ú62Á&uˆ÷Öˆ¶ˆ'2¢ÁV∆√∞¢6ˆÁ7BVÊóG2“6‚Ú62Á&uˆ÷Ö˜VÊóG2¢ÁV∆√∞¢6ˆÁ7BÊ˜FR“&˜sÚÊÊ˜FR«¬ÁV∆√∞¢6ˆÁ7BÜ47W7Fˆ““Ä¢Ü6‚bbá7F'B”“sì£r«¬VÊB”“sÉ£r«¬62Ê6ˆ÷ˆFR””“wFV6ÜÊñ6ñÂˆ7W7Fˆ“ríí«¿¢7G&ñÊrÜÊ˜FR«¬rríÁG&ñ“Çê¢ì∞¢&WGW&‚∞¢FFS¢ó6Ú¿¢v˜&µˆFFS¢ó6Ú¿¢6Âˆ66WEˆGfÊ6Uˆ¶ˆ#¢6‚¿¢7F'E˜Fñ÷S¢7F'B¿¢VÊE˜Fñ÷S¢VÊB¿¢÷Öˆ¶ˆ'5˜W%ˆFì¢¶ˆ'2¿¢÷Ö˜VÊóG5˜W%ˆFì¢VÊóG2¿¢&uˆ÷Öˆ¶ˆ'5˜W%ˆFì¢62Á&uˆ÷Öˆ¶ˆ'2¿¢&uˆ÷Ö˜VÊóG5˜W%ˆFì¢62Á&uˆ÷Ö˜VÊóG2¿¢6ˆ÷ˆFS¢6‚Ú62Ê6ˆ÷ˆFR¢w7ó7FV’ˆFVfV«Br¿¢VffV7FófUˆ÷Öˆ¶ˆ'5˜W%ˆFì¢6‚Ú62ÊVffV7FófUˆ÷Öˆ¶ˆ'2¢ÁV∆¬¿¢VffV7FófUˆ÷Ö˜VÊóG5˜W%ˆFì¢6‚Ú62ÊVffV7FófUˆ÷Ö˜VÊóG2¢ÁV∆¬¿¢ó5ˆ∆Vv7ï˜7ó7FV’ˆFVfV«C¢6‚Ú62Êó5ˆ∆Vv7ï˜7ó7FV’ˆFVfV«B¢f«6R¿¢Ê˜FR¿¢Ü5ˆ76ñvÊVEˆ¶ˆ#¢ÁV÷&W"Ü¶ˆ$6˜VÁB«¬í‚¿¢76ñvÊVEˆ¶ˆ%ˆ6˜VÁC¢ÁV÷&W"Ü¶ˆ$6˜VÁB«¬í¿¢ó5ˆ∆ˆ6∂VC¢ÁV÷&W"Ü¶ˆ$6˜VÁB«¬í‚¿¢Ü5ˆ7W7Fˆ’˜6WGFñÊs¢Ü47W7Fˆ–¢”∞ß–¶7ñÊ2gVÊ7Fñˆ‚∆ˆEv˜&¥6∆VÊF%c$÷ˆÁFÇáW6W&Ê÷R¬÷ˆÁFÇó∞¢6ˆÁ7Bg&ˆ‘ó6Ú“fó'7DFîˆd÷ˆÁFÑó6ÚÜ÷ˆÁFÇì∞¢6ˆÁ7BFÙó6Ú“VÊDFîˆd÷ˆÁFÑó6ÚÜ÷ˆÁFÇì∞¢6ˆÁ7B∂6¬¬¶ˆ'5““vóB&ˆ÷ó6RÊ∆¬Ö∞¢ˆˆ¬ÁVW'íÜ4TƒT5Bv˜&µˆFFS£¶FFR2v˜&µˆFFR¬Fï˜7FGW2¬6Âˆ66WEˆGfÊ6Uˆ¶ˆ"¬7F'E˜Fñ÷R¬VÊE˜Fñ÷R¬÷Öˆ¶ˆ'5˜W%ˆFí¬÷Ö˜VÊóG5˜W%ˆFí¬Ê˜FR¬6˜W&6R¬WFFVEˆ@¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂˆ÷ˆÁFÜ«ï˜v˜&µˆ6∆VÊF ¢tÑU$RFV6ÜÊñ6ñÂ˜W6W&Ê÷S“C‰Bv˜&µˆFFR$UEtTT‚C#£¶FFR‰BC3£¶FFP¢ı$DU"%ív˜&µˆFFR46¬∑W6W&Ê÷R¬g&ˆ‘ó6Ú¬FÙó6ı“í¿¢ˆˆ¬ÁVW'íÜ4TƒT5BÜ¢ÊˆñÁF÷VÁEˆFFWFñ÷RBDî‘R§Ù‰Rt6ñÙ&Êv∂ˆ≤rì£¶FFR2v˜&µˆFFR¬4ıTÂBÑDï5Dî‰5B¢Ê¶ˆ%ˆñBì£¶ñÁB2¶ˆ%ˆ6˜VÁ@¢e$Ù“V&∆ñ2Ê¶ˆ'2†¢ƒTeB§Ùî‚V&∆ñ2Ê¶ˆ%ˆ76ñvÊ÷VÁG2¶Ù‚¶Ê¶ˆ%ˆñC÷¢Ê¶ˆ%ˆñB‰B¶ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷S“C¢tÑU$RÜ¢ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷S“Cı"¶ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷S“Cê¢‰B¢ÊˆñÁF÷VÁEˆFFWFñ÷Rï2‰ıBÂTƒ¿¢‰BÜ¢ÊˆñÁF÷VÁEˆFFWFñ÷RBDî‘R§Ù‰Rt6ñÙ&Êv∂ˆ≤rì£¶FFR$UEtTT‚C#£¶FFR‰BC3£¶FFP¢‰B4ÙƒU44RÜ¢Ê¶ˆ%˜7FGW2¬rrí‰ıBî‚Çv6Ê6V∆∆VBr¬v6Ê6V∆VBrê¢u$ıU%í¬∑W6W&Ê÷R¬g&ˆ‘ó6Ú¬FÙó6ı“ê¢“ì∞¢6ˆÁ7B6ƒ÷“ÊWr÷ÇÜ6¬Á&˜w2«¬µ“íÊ÷áÇ”‚∑FÙó6ÙFFRáÇÁv˜&µˆFFRí¬Ö“íì∞¢6ˆÁ7B¶ˆ$÷“ÊWr÷ÇÜ¶ˆ'2Á&˜w2«¬µ“íÊ÷áÇ”‚∑FÙó6ÙFFRáÇÁv˜&µˆFFRí¬ÁV÷&W"áÇÊ¶ˆ%ˆ6˜VÁB«¬ï“íì∞¢6ˆÁ7BFó2“µ”∞¢f˜"Ü6ˆÁ7Bó6Úˆb7vdFFU&ÊvRÜg&ˆ‘ó6Ú¬FÙó6Úíí∞¢Fó2ÁW6ÇÜÊ˜&÷∆ó¶T6∆VÊF%&˜rÜ6ƒ÷ÊvWBÜó6Úí¬ó6Ú¬¶ˆ$÷ÊvWBÜó6Úí«¬íì∞¢–¢&WGW&‚≤g&ˆ‘ó6Ú¬FÙó6Ú¬Fó2”∞ß–¶gVÊ7Fñˆ‚7vdFFU&ÊvRÜg&ˆ‘ó6Ú¬FÙó6Úó∞¢6ˆÁ7B˜WB“µ”∞¢6ˆÁ7BB“ÊWrFFRÜG∂g&ˆ‘ó6˜’C££ì∞¢6ˆÁ7BVÊB“ÊWrFFRÜG∑FÙó6˜’C££ì∞¢vÜñ∆RÜB√“VÊBí∞¢˜WBÁW6ÇáFÙó6ÙFFRÜBíì∞¢BÁ6WDFFRÜBÊvWDFFRÇí≤ì∞¢–¢&WGW&‚˜WC∞ß–¶7ñÊ2gVÊ7Fñˆ‚W6W'D6∆VÊF$FíÜ6∆ñVÁD˜%ˆˆ¬¬W6W&Ê÷R¬v˜&¥FFR¬ñÁWBó∞¢6ˆÁ7B“Ê˜&’v˜&¥Fïñ∆ˆBÜñÁWB«¬∑“ì∞¢6ˆÁ7B6˜W&6R“6˜W&6Tf˜%v˜&¥Fïñ∆ˆBáì∞¢6ˆÁ7B"“vóB6∆ñVÁD˜%ˆˆ¬ÁVW'íÜ ¢îÂ4U%BîÂDÚV&∆ñ2ÁFV6ÜÊñ6ñÂˆ÷ˆÁFÜ«ï˜v˜&µˆ6∆VÊF ¢áFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬v˜&µˆFFR¬Fï˜7FGW2¬6Âˆ66WEˆGfÊ6Uˆ¶ˆ"¬6Âˆ66WE˜W&vVÁEˆ¶ˆ"¬7F'E˜Fñ÷R¬VÊE˜Fñ÷R¬÷Öˆ¶ˆ'5˜W%ˆFí¬÷Ö˜VÊóG5˜W%ˆFí¬Ê˜FR¬6˜W&6R¬WFFVEˆ'í¬WFFVEˆBê¢d≈TU2ÇC¬C#£¶FFR¬C2¬CB¬CR¬Cb¬Cr¬CÇ¬Cí¬C¬C¬Cƒ‰ırÇíê¢Ù‚4Ù‰dƒî5BáFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬v˜&µˆFFRíDÚUDDR4U@¢Fï˜7FGW3‘UÑ4≈TDTBÊFï˜7FGW2¿¢6Âˆ66WEˆGfÊ6Uˆ¶ˆ#‘UÑ4≈TDTBÊ6Âˆ66WEˆGfÊ6Uˆ¶ˆ"¿¢6Âˆ66WE˜W&vVÁEˆ¶ˆ#‘UÑ4≈TDTBÊ6Âˆ66WE˜W&vVÁEˆ¶ˆ"¿¢7F'E˜Fñ÷S‘UÑ4≈TDTBÁ7F'E˜Fñ÷R¿¢VÊE˜Fñ÷S‘UÑ4≈TDTBÊVÊE˜Fñ÷R¿¢÷Öˆ¶ˆ'5˜W%ˆFì‘UÑ4≈TDTBÊ÷Öˆ¶ˆ'5˜W%ˆFí¿¢÷Ö˜VÊóG5˜W%ˆFì‘UÑ4≈TDTBÊ÷Ö˜VÊóG5˜W%ˆFí¿¢Ê˜FS‘UÑ4≈TDTBÊÊ˜FR¿¢6˜W&6S‘UÑ4≈TDTBÁ6˜W&6R¬WFFVEˆ'ì“C¬WFFVEˆC‘‰ırÇê¢$UEU$‰î‰r†¢¬∑W6W&Ê÷R¬v˜&¥FFR¬ÊFï˜7FGW2¬Ê6Âˆ66WEˆGfÊ6Uˆ¶ˆ"¬Ê6Âˆ66WE˜W&vVÁEˆ¶ˆ"¬Á7F'E˜Fñ÷R¬ÊVÊE˜Fñ÷R¬Ê÷Öˆ¶ˆ'5˜W%ˆFí¬Ê÷Ö˜VÊóG5˜W%ˆFí¬ÊÊ˜FR¬6˜W&6U“ì∞¢&WGW&‚"Á&˜w5≥“«¬ÁV∆√∞ß–¶7ñÊ2gVÊ7Fñˆ‚VÁ7W&TFñ«ï&VFñÊW75&˜ráW6W&Ê÷Ró∞¢6ˆÁ7B¶ˆ'2“vóBvWEFV6ÖFˆFî¶ˆ'2áW6W&Ê÷Rì∞¢6ˆÁ7BÊ˜u“vóBˆˆ¬ÁVW'íÜ4TƒT5BÑ‰ırÇíBDî‘R§Ù‰Rt6ñÙ&Êv∂ˆ≤rí2Ê˜uˆ&∂≤¬G∂vWD&Êv∂ˆ¥Ü˜W%7¬Çó“2Ü˜W%ˆ&∂∂ì∞¢6ˆÁ7BÜ˜W$&∂≤“ÁV÷&W"ÜÊ˜uÁ&˜w3ÚÂ≥”ÚÊÜ˜W%ˆ&∂≤ÛÚì∞¢6ˆÁ7BÊ˜t&∂≤“Ê˜uÁ&˜w3ÚÂ≥”ÚÊÊ˜uˆ&∂≤«¬ÁV∆√∞¢ñbÇ¶ˆ'2Ê∆VÊwFÇí&WGW&‚≤Ü5ˆ¶ˆ'3¶f«6R¬¶ˆ'3•µ“¬&VFñÊW73¶ÁV∆¬¬6Â˜6Ü˜s¶f«6R¬Ê˜uˆ&∂≥¶Ê˜t&∂≤¬Ü˜W%ˆ&∂≥¶Ü˜W$&∂≤”∞¢6ˆÁ7Bfó'7B“¶ˆ'5≥”ÚÊˆñÁF÷VÁEˆFFWFñ÷R«¬ÁV∆√∞¢6ˆÁ7B'"“vóBˆˆ¬ÁVW'íÜ ¢îÂ4U%BîÂDÚV&∆ñ2ÁFV6ÜÊñ6ñÂˆFñ«ï˜&VFñÊW72áFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬v˜&µˆFFR¬7FGW2¬fó'7Eˆ¶ˆ%ˆB¬FVF∆ñÊUˆB¬WFFVEˆBê¢d≈TU2ÇC¬Ñ‰ırÇíBDî‘R§Ù‰Rt6ñÙ&Êv∂ˆ≤rì£¶FFR¬wVÊFñÊrr¬C"¬ÇC#£ßFñ÷W7F◊G¢“îÂDU%d¬sÜ˜W"rí¬‰ırÇíê¢Ù‚4Ù‰dƒî5BáFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬v˜&µˆFFRíDÚUDDR4U@¢fó'7Eˆ¶ˆ%ˆC‘4ÙƒU44RáV&∆ñ2ÁFV6ÜÊñ6ñÂˆFñ«ï˜&VFñÊW72Êfó'7Eˆ¶ˆ%ˆB¬UÑ4≈TDTBÊfó'7Eˆ¶ˆ%ˆBí¿¢FVF∆ñÊUˆC‘4ÙƒU44RáV&∆ñ2ÁFV6ÜÊñ6ñÂˆFñ«ï˜&VFñÊW72ÊFVF∆ñÊUˆB¬UÑ4≈TDTBÊFVF∆ñÊUˆBí¿¢WFFVEˆC‘‰ırÇê¢$UEU$‰î‰r†¢¬∑W6W&Ê÷R¬fó'7E“ì∞¢6ˆÁ7B&VFñÊW72“'"Á&˜w5≥“«¬ÁV∆√∞¢6ˆÁ7B7B“7G&ñÊrá&VFñÊW73ÚÁ7FGW2«¬wVÊFñÊrríÁFÙ∆˜vW$66RÇì∞¢6ˆÁ7B6Â6Ü˜r“Ü˜W$&∂≤„“Rbb7B”“w&VGís∞¢&WGW&‚≤Ü5ˆ¶ˆ'3ßG'VR¬¶ˆ'2¬&VFñÊW72¬6Â˜6Ü˜s¶6Â6Ü˜r¬Ê˜uˆ&∂≥¶Ê˜t&∂≤¬Ü˜W%ˆ&∂≥¶Ü˜W$&∂≤”∞ß–†¶ÊvWBÇr˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜v˜&≤÷6∆VÊF"◊c"r¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“7G&ñÊrá&WÁ&◊3ÚÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7B7GÇ“vóB&WVó&T6∆VÊF%W6W&Ê÷T66W72á&W¬&W2¬W6W&Ê÷Rì∞¢ñbÇ7GÇí&WGW&„∞¢6ˆÁ7B÷ˆÁFÇ“7G&ñÊrá&WÁVW'ìÚÊ÷ˆÁFÇ«¬rríÁG&ñ“Çí«¬FÙó6ÙFFRÜÊWrFFRÇííÁ6∆ñ6RÉ√rì∞¢ñbÇó57G&ñ7D÷ˆÁFÇÜ÷ˆÁFÇíí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢v÷ˆÁFÇâ^òûäﬁà~òâæò~âûä>ãûâæòâÆâ¢ïïïí‘‘“r“ì∞¢6ˆÁ7BFF“vóB∆ˆEv˜&¥6∆VÊF%c$÷ˆÁFÇáW6W&Ê÷R¬÷ˆÁFÇì∞¢&W2Êß6ˆ‚á≤ˆ≥ßG'VR¬W6W&Ê÷R¬÷ˆÁFÇ¬g&ˆ”¶FFÊg&ˆ‘ó6Ú¬FÛ¶FFÁFÙó6Ú¬Fó3¶FFÊFó2¬óFV◊3¶FFÊFó2“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÇttUB˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜v˜&≤÷6∆VÊF"◊c"W'&˜#¢r¬Rì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢~ò.äæä^âNâæà˛ãNâ~ãNâûä>ãâÆà~ã.âûä^òéä~à~äæâûòûã.òNäòéäÆã>òä>ò~àÇr“ì∞¢–ß“ì∞†¶ÁWBÇr˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜v˜&≤÷6∆VÊF"◊c"ˆFír¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“7G&ñÊrá&WÁ&◊3ÚÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7B7GÇ“vóB&WVó&T6∆VÊF%W6W&Ê÷T66W72á&W¬&W2¬W6W&Ê÷Rì∞¢ñbÇ7GÇí&WGW&„∞¢6ˆÁ7Bv˜&¥FFR“7G&ñÊrá&WÊ&ˆGìÚÊFFR«¬&WÊ&ˆGìÚÁv˜&µˆFFR«¬rríÁG&ñ“Çì∞¢ñbÇó57G&ñ7Dó6ÙFFRáv˜&¥FFRíí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢vFFRâ^òûäﬁà~òâæò~âûä>ãûâæòâÆâ¢ïïïí‘‘“‘DBr“ì∞¢6ˆÁ7B∆ˆ6∂VD¶ˆ'2“vóB6˜VÁD∆ˆ6∂VDGfÊ6T¶ˆ'4f˜$FFRáˆˆ¬¬W6W&Ê÷R¬v˜&¥FFRì∞¢ñbÜ∆ˆ6∂VD¶ˆ'2‚í∞¢&WGW&‚&W2Á7FGW2ÉCííÊß6ˆ‚á∞¢W'&˜#¢~ä~ãâûâûã^òûäã^à~ã.âûâ~ã^òéòNâNòûä>ãâÆääﬁâÆäæäã.ä.òä^òûäràÆòéã.à~òNäòéäÆã.äã.ä>ânâæãNâNä>ãâÆà~ã.âûäæä>ã~äﬁòàòûòNà.ä~ãâûâ~ã>à~ã.âûâûã^òûòNâNòíäæã.àäã^àNä~ã.äàéã>òâæò~âíàä>ãéâ>ã.â^ãNâNâ^òéäﬁòäﬁâNäãNâûòâÓã~òéäﬁâæä>ãâÆà~ã.âûäæä>ã~äﬁäæã.àNâûòâ~âír¿¢∆ˆ6∂VCßG'VR¿¢¶ˆ%ˆ6˜VÁC¢∆ˆ6∂VD¶ˆ'0¢“ì∞¢–¢6ˆÁ7B6fVB“vóBW6W'D6∆VÊF$Fíáˆˆ¬¬W6W&Ê÷R¬v˜&¥FFR¬≤‚‚Á&WÊ&ˆGí¬v˜&µˆFFSßv˜&¥FFR“ì∞¢&W2Êß6ˆ‚á≤ˆ≥ßG'VR¬6fVC£¬6∂óVEˆ∆ˆ6∂VC£¬óFV”¶Ê˜&÷∆ó¶T6∆VÊF%&˜rá6fVB¬v˜&¥FFR¬í“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÇuUB˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜v˜&≤÷6∆VÊF"◊c"ˆFíW'&˜#¢r¬Rì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢~âÆãâûâ~ãnàâæà˛ãNâ~ãNâûä>ãâÆà~ã.âûä^òéä~à~äæâûòûã.òNäòéäÆã>òä>ò~àÇr“ì∞¢–ß“ì∞†¶ÁWBÇr˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜v˜&≤÷6∆VÊF"◊c"ˆ&F6Çr¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B6∆ñVÁB“vóBˆˆ¬Ê6ˆÊÊV7BÇì∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“7G&ñÊrá&WÁ&◊3ÚÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7B7GÇ“vóB&WVó&T6∆VÊF%W6W&Ê÷T66W72á&W¬&W2¬W6W&Ê÷Rì∞¢ñbÇ7GÇí&WGW&„∞¢6ˆÁ7BFFW2“'&íÊó4'&íá&WÊ&ˆGìÚÊFFW2íÚ&WÊ&ˆGíÊFFW2¢µ”∞¢ñbÇFFW2Ê∆VÊwFÇí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢~â^òûäﬁà~äãRFFW2äﬁä.òéã.à~âûòûäﬁä"ä~ãâír“ì∞¢ñbÜFFW2Ê∆VÊwFÇ‚c"í&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢~òä^ã~äﬁàòNâNòûäÆãûà~äÆãéâBc"ä~ãâûâ^òéäﬁàNä>ãòûàrr“ì∞¢vóB6∆ñVÁBÁVW'íÇt$Ttî‚rì∞¢∆WB6fVB“∞¢∆WB6∂óVD∆ˆ6∂VB“∞¢f˜"Ü6ˆÁ7B&tFFRˆbFFW2í∞¢6ˆÁ7Bv˜&¥FFR“7G&ñÊrá&tFFR«¬rríÁG&ñ“Çì∞¢ñbÇó57G&ñ7Dó6ÙFFRáv˜&¥FFRíí6ˆÁFñÁVS∞¢6ˆÁ7B∆ˆ6∂VD¶ˆ'2“vóB6˜VÁD∆ˆ6∂VDGfÊ6T¶ˆ'4f˜$FFRÜ6∆ñVÁB¬W6W&Ê÷R¬v˜&¥FFRì∞¢ñbÜ∆ˆ6∂VD¶ˆ'2‚í∞¢6∂óVD∆ˆ6∂VB≤≥∞¢6ˆÁFñÁVS∞¢–¢vóBW6W'D6∆VÊF$FíÜ6∆ñVÁB¬W6W&Ê÷R¬v˜&¥FFR¬≤‚‚Á&WÊ&ˆGí¬v˜&µˆFFSßv˜&¥FFR“ì∞¢6fVB≤≥∞¢–¢vóB6∆ñVÁBÁVW'íÇt4Ù‘‘ïBrì∞¢&W2Êß6ˆ‚á≤ˆ≥ßG'VR¬6fVB¬6∂óVEˆ∆ˆ6∂VCß6∂óVD∆ˆ6∂VB“ì∞¢“6F6ÇÜRí∞¢vóB6∆ñVÁBÁVW'íÇu$Ùƒƒ$4≤rì∞¢6ˆÁ6ˆ∆RÊW'&˜"ÇuUB˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜v˜&≤÷6∆VÊF"◊c"ˆ&F6ÇW'&˜#¢r¬Rì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢~âÆãâûâ~ãnàä~ãâûâ~ã^òéòä^ã~äﬁàòNäòéäÆã>òä>ò~àÇr“ì∞¢“fñÊ∆«í≤6∆ñVÁBÁ&V∆V6RÇì≤–ß“ì∞†¶Á˜7BÇr˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜v˜&≤÷6∆VÊF"◊c"ˆ6˜í◊&Wfñ˜W2÷÷ˆÁFÇr¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B6∆ñVÁB“vóBˆˆ¬Ê6ˆÊÊV7BÇì∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“7G&ñÊrá&WÁ&◊3ÚÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7B7GÇ“vóB&WVó&T6∆VÊF%W6W&Ê÷T66W72á&W¬&W2¬W6W&Ê÷Rì∞¢ñbÇ7GÇí&WGW&„∞¢6ˆÁ7BF&vWD÷ˆÁFÇ“7G&ñÊrá&WÊ&ˆGìÚÁF&vWEˆ÷ˆÁFÇ«¬rríÁG&ñ“Çì∞¢ñbÇó57G&ñ7D÷ˆÁFÇáF&vWD÷ˆÁFÇíí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢wF&vWEˆ÷ˆÁFÇâ^òûäﬁà~òâæò~âûä>ãûâæòâÆâ¢ïïïí‘‘“r“ì∞¢6ˆÁ7B∑í∆’““F&vWD÷ˆÁFÇÁ7∆óBÇr“ríÊ÷ÑÁV÷&W"ì∞¢6ˆÁ7B&Wb“ÊWrFFRáí¬““"¬ì∞¢6ˆÁ7B&Wd÷ˆÁFÇ“FÙó6ÙFFRá&WbíÁ6∆ñ6RÉ√rì∞¢6ˆÁ7B&WdFF“vóB∆ˆEv˜&¥6∆VÊF%c$÷ˆÁFÇáW6W&Ê÷R¬&Wd÷ˆÁFÇì∞¢6ˆÁ7B&Wd'îFí“ÊWr÷á&WdFFÊFó2Ê÷ÜB”‚µ7G&ñÊrÜBÊFFRíÁ6∆ñ6RÇ”"í¬E“íì∞¢vóB6∆ñVÁBÁVW'íÇt$Ttî‚rì∞¢∆WB6fVB“∞¢∆WB6∂óVD∆ˆ6∂VB“∞¢f˜"Ü6ˆÁ7Bv˜&¥FFRˆb7vdFFU&ÊvRÜfó'7DFîˆd÷ˆÁFÑó6ÚáF&vWD÷ˆÁFÇí¬VÊDFîˆd÷ˆÁFÑó6ÚáF&vWD÷ˆÁFÇííí∞¢6ˆÁ7B6˜W&6R“&Wd'îFíÊvWBáv˜&¥FFRÁ6∆ñ6RÇ”"íì∞¢ñbÇ6˜W&6Rí6ˆÁFñÁVS∞¢6ˆÁ7B∆ˆ6∂VD¶ˆ'2“vóB6˜VÁD∆ˆ6∂VDGfÊ6T¶ˆ'4f˜$FFRÜ6∆ñVÁB¬W6W&Ê÷R¬v˜&¥FFRì∞¢ñbÜ∆ˆ6∂VD¶ˆ'2‚í∞¢6∂óVD∆ˆ6∂VB≤≥∞¢6ˆÁFñÁVS∞¢–¢vóBW6W'D6∆VÊF$FíÜ6∆ñVÁB¬W6W&Ê÷R¬v˜&¥FFR¬∞¢v˜&µˆFFS¢v˜&¥FFR¿¢6Âˆ66WEˆGfÊ6Uˆ¶ˆ#¢6˜W&6RÊ6Âˆ66WEˆGfÊ6Uˆ¶ˆ"¿¢7F'E˜Fñ÷S¢6˜W&6RÁ7F'E˜Fñ÷R¿¢VÊE˜Fñ÷S¢6˜W&6RÊVÊE˜Fñ÷R¿¢÷Öˆ¶ˆ'5˜W%ˆFì¢6˜W&6RÊ6ˆ÷ˆFR””“wFV6ÜÊñ6ñÂˆ7W7Fˆ“rÚ6˜W&6RÊ÷Öˆ¶ˆ'5˜W%ˆFí¢ÁV∆¬¿¢÷Ö˜VÊóG5˜W%ˆFì¢6˜W&6RÊ6ˆ÷ˆFR””“wFV6ÜÊñ6ñÂˆ7W7Fˆ“rÚ6˜W&6RÊ÷Ö˜VÊóG5˜W%ˆFí¢ÁV∆¬¿¢Ê˜FS¢6˜W&6RÊÊ˜FP¢“ì∞¢6fVB≤≥∞¢–¢vóB6∆ñVÁBÁVW'íÇt4Ù‘‘ïBrì∞¢&W2Êß6ˆ‚á≤ˆ≥ßG'VR¬6fVB¬6∂óVEˆ∆ˆ6∂VCß6∂óVD∆ˆ6∂VB“ì∞¢“6F6ÇÜRí∞¢vóB6∆ñVÁBÁVW'íÇu$Ùƒƒ$4≤rì∞¢6ˆÁ6ˆ∆RÊW'&˜"Çuı5B˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜v˜&≤÷6∆VÊF"◊c"ˆ6˜í◊&Wfñ˜W2÷÷ˆÁFÇW'&˜#¢r¬Rì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢~â^ãòûà~àNòéã.òäæäã~äﬁâûòâNã~äﬁâûàòéäﬁâûòNäòéäÆã>òä>ò~àÇr“ì∞¢“fñÊ∆«í≤6∆ñVÁBÁ&V∆V6RÇì≤–ß“ì∞†¶ÁW6RÜ7&VFUFV6ÜÊñ6ñ‰6∆VÊF%&VDˆÊ«ï&˜WFW2á∞¢ˆˆ¬¿¢&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¿¢&WVó&TF÷ñÂ6W76ñˆ‚¿¢FÙó6ÙFFR¿¢fó'7DFîˆd÷ˆÁFÑó6Ú¿¢VÊDFîˆd÷ˆÁFÑó6Ú¿¢ó57G&ñ7Dó6ÙFFR¿ß“íì∞†¶ÁW6RÜ7&VFUFV6ÜÊñ6ñ‰6∆VÊF%w&óFU&˜WFW2á∞¢ˆˆ¬¿¢&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¿¢FÙó6ÙFFR¿¢Ê˜&’v˜&¥Fïñ∆ˆB¿¢6˜VÁD∆ˆ6∂VDGfÊ6T¶ˆ'4f˜$FFR¿¢6˜W&6Tf˜%v˜&¥Fïñ∆ˆB¿ß“íì∞†¢ÚÚFVfV7BBÛc¢FV6ÜÊñ6ñ‚6V∆b◊6W'fñ6R6˜íW6W2FÜR6W76ñˆ‚ñFVÁFóGíá&WÊVffV7FófRÁW6W&Ê÷Rê¢ÚÚ6ÚóB6‚ÊWfW"w&óFRFÚW6W&Ê÷R7W∆ñVB'íFÜR6∆ñVÁB‚÷ó'&˜'2FÜRF÷ñ‚c"6˜í∆ˆvñ2‡¶Á˜7BÇr˜FV6Ç˜v˜&≤÷6∆VÊF"ˆ6˜í◊&Wfñ˜W2÷÷ˆÁFÇr¬&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B6∆ñVÁB“vóBˆˆ¬Ê6ˆÊÊV7BÇì∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“7G&ñÊrá&WÊVffV7FófSÚÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7BF&vWD÷ˆÁFÇ“7G&ñÊrá&WÊ&ˆGìÚÁF&vWEˆ÷ˆÁFÇ«¬rríÁG&ñ“Çì∞¢ñbÇó57G&ñ7D÷ˆÁFÇáF&vWD÷ˆÁFÇíí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢wF&vWEˆ÷ˆÁFÇâ^òûäﬁà~òâæò~âûä>ãûâæòâÆâ¢ïïïí‘‘“r“ì∞¢6ˆÁ7B∑í∆’““F&vWD÷ˆÁFÇÁ7∆óBÇr“ríÊ÷ÑÁV÷&W"ì∞¢6ˆÁ7B&Wb“ÊWrFFRáí¬““"¬ì∞¢6ˆÁ7B&Wd÷ˆÁFÇ“FÙó6ÙFFRá&WbíÁ6∆ñ6RÉ√rì∞¢6ˆÁ7B&WdFF“vóB∆ˆEv˜&¥6∆VÊF%c$÷ˆÁFÇáW6W&Ê÷R¬&Wd÷ˆÁFÇì∞¢6ˆÁ7B&Wd'îFí“ÊWr÷á&WdFFÊFó2Ê÷ÜB”‚µ7G&ñÊrÜBÊFFRíÁ6∆ñ6RÇ”"í¬E“íì∞¢vóB6∆ñVÁBÁVW'íÇt$Ttî‚rì∞¢∆WB6fVB“∞¢∆WB6∂óVD∆ˆ6∂VB“∞¢f˜"Ü6ˆÁ7Bv˜&¥FFRˆb7vdFFU&ÊvRÜfó'7DFîˆd÷ˆÁFÑó6ÚáF&vWD÷ˆÁFÇí¬VÊDFîˆd÷ˆÁFÑó6ÚáF&vWD÷ˆÁFÇííí∞¢6ˆÁ7B6˜W&6R“&Wd'îFíÊvWBáv˜&¥FFRÁ6∆ñ6RÇ”"íì∞¢ñbÇ6˜W&6Rí6ˆÁFñÁVS∞¢6ˆÁ7B∆ˆ6∂VD¶ˆ'2“vóB6˜VÁD∆ˆ6∂VDGfÊ6T¶ˆ'4f˜$FFRÜ6∆ñVÁB¬W6W&Ê÷R¬v˜&¥FFRì∞¢ñbÜ∆ˆ6∂VD¶ˆ'2‚í∞¢6∂óVD∆ˆ6∂VB≤≥∞¢6ˆÁFñÁVS∞¢–¢vóBW6W'D6∆VÊF$FíÜ6∆ñVÁB¬W6W&Ê÷R¬v˜&¥FFR¬∞¢v˜&µˆFFS¢v˜&¥FFR¿¢6Âˆ66WEˆGfÊ6Uˆ¶ˆ#¢6˜W&6RÊ6Âˆ66WEˆGfÊ6Uˆ¶ˆ"¿¢7F'E˜Fñ÷S¢6˜W&6RÁ7F'E˜Fñ÷R¿¢VÊE˜Fñ÷S¢6˜W&6RÊVÊE˜Fñ÷R¿¢÷Öˆ¶ˆ'5˜W%ˆFì¢6˜W&6RÊ6ˆ÷ˆFR””“wFV6ÜÊñ6ñÂˆ7W7Fˆ“rÚ6˜W&6RÊ÷Öˆ¶ˆ'5˜W%ˆFí¢ÁV∆¬¿¢÷Ö˜VÊóG5˜W%ˆFì¢6˜W&6RÊ6ˆ÷ˆFR””“wFV6ÜÊñ6ñÂˆ7W7Fˆ“rÚ6˜W&6RÊ÷Ö˜VÊóG5˜W%ˆFí¢ÁV∆¬¿¢Ê˜FS¢6˜W&6RÊÊ˜FP¢“ì∞¢6fVB≤≥∞¢–¢vóB6∆ñVÁBÁVW'íÇt4Ù‘‘ïBrì∞¢&W2Êß6ˆ‚á≤ˆ≥ßG'VR¬6fVB¬6∂óVEˆ∆ˆ6∂VCß6∂óVD∆ˆ6∂VB“ì∞¢“6F6ÇÜRí∞¢vóB6∆ñVÁBÁVW'íÇu$Ùƒƒ$4≤rì∞¢6ˆÁ6ˆ∆RÊW'&˜"Çuı5B˜FV6Ç˜v˜&≤÷6∆VÊF"ˆ6˜í◊&Wfñ˜W2÷÷ˆÁFÇW'&˜#¢r¬Rì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢~â^ãòûà~àNòéã.òäæäã~äﬁâûòâNã~äﬁâûàòéäﬁâûòNäòéäÆã>òä>ò~àÇr“ì∞¢“fñÊ∆«í≤6∆ñVÁBÁ&V∆V6RÇì≤–ß“ì∞†¶ÊvWBÇr˜FV6ÇˆFñ«í◊&VFñÊW72˜FˆFír¬&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“7G&ñÊrá&WÊVffV7FófSÚÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7BFF“vóBVÁ7W&TFñ«ï&VFñÊW75&˜ráW6W&Ê÷Rì∞¢&W2Êß6ˆ‚á≤ˆ≥ßG'VR¬W6W&Ê÷R¬‚‚ÊFF“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÇttUB˜FV6ÇˆFñ«í◊&VFñÊW72˜FˆFíW'&˜#¢r¬Rì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢~ò.äæä^âNàNä~ã.äâÓä>òûäﬁää~ãâûâûã^òûòNäòéäÆã>òä>ò~àÇr“ì∞¢–ß“ì∞†¶Á˜7BÇr˜FV6ÇˆFñ«í◊&VFñÊW72r¬&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“7G&ñÊrá&WÊVffV7FófSÚÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7B7FGW2“7G&ñÊrá&WÊ&ˆGìÚÁ7FGW2«¬rríÁG&ñ“Çì∞¢ñbÇ≤w&VGír¬vÊ˜E˜&VGíu“ÊñÊ6«VFW2á7FGW2íí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢w7FGW2â^òûäﬁà~òâæò~âí&VGíäæä>ã~ä“Ê˜E˜&VGír“ì∞¢6ˆÁ7B&V6ˆ‚“7G&ñÊrá&WÊ&ˆGìÚÁ&V6ˆ‚«¬rríÁ6∆ñ6RÉ√Sì∞¢6ˆÁ7Bfó'7B“vóBVÁ7W&TFñ«ï&VFñÊW75&˜ráW6W&Ê÷Rì∞¢ñbÇfó'7BÊÜ5ˆ¶ˆ'2í&WGW&‚&W2Êß6ˆ‚á≤ˆ≥ßG'VR¬Ü5ˆ¶ˆ'3¶f«6R¬÷W76vS¢~ä~ãâûâûã^òûòNäòéäã^à~ã.âûâ~ã^òéâ^òûäﬁà~ä.ã~âûä.ãâûàNä~ã.äâÓä>òûäﬁär“ì∞¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÜ ¢îÂ4U%BîÂDÚV&∆ñ2ÁFV6ÜÊñ6ñÂˆFñ«ï˜&VFñÊW72áFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬v˜&µˆFFR¬7FGW2¬&VGïˆB¬Ê˜E˜&VGï˜&V6ˆ‚¬fó'7Eˆ¶ˆ%ˆB¬FVF∆ñÊUˆB¬WFFVEˆBê¢d≈TU2ÇC¬Ñ‰ırÇíBDî‘R§Ù‰Rt6ñÙ&Êv∂ˆ≤rì£¶FFR¬C"¬44RtÑT‚C#“w&VGírDÑT‚‰ırÇíT≈4RÂTƒ¬T‰B¬C2¬CB¬ÇCC£ßFñ÷W7F◊G¢“îÂDU%d¬sÜ˜W"rí¬‰ırÇíê¢Ù‚4Ù‰dƒî5BáFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬v˜&µˆFFRíDÚUDDR4U@¢7FGW3‘UÑ4≈TDTBÁ7FGW2¿¢&VGïˆC‘UÑ4≈TDTBÁ&VGïˆB¿¢Ê˜E˜&VGï˜&V6ˆ„‘UÑ4≈TDTBÊÊ˜E˜&VGï˜&V6ˆ‚¿¢fó'7Eˆ¶ˆ%ˆC‘4ÙƒU44RáV&∆ñ2ÁFV6ÜÊñ6ñÂˆFñ«ï˜&VFñÊW72Êfó'7Eˆ¶ˆ%ˆB¬UÑ4≈TDTBÊfó'7Eˆ¶ˆ%ˆBí¿¢FVF∆ñÊUˆC‘4ÙƒU44RáV&∆ñ2ÁFV6ÜÊñ6ñÂˆFñ«ï˜&VFñÊW72ÊFVF∆ñÊUˆB¬UÑ4≈TDTBÊFVF∆ñÊUˆBí¿¢WFFVEˆC‘‰ırÇê¢$UEU$‰î‰r†¢¬∑W6W&Ê÷R¬7FGW2¬&V6ˆ‚¬fó'7BÊ¶ˆ'5≥”ÚÊˆñÁF÷VÁEˆFFWFñ÷U“ì∞¢ñbá7FGW2””“w&VGírí∞¢vóBˆˆ¬ÁVW'íÜUDDRV&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W24UB∆7EˆFñ«ï˜&VGïˆC‘‰ırÇítÑU$RW6W&Ê÷S“C¬∑W6W&Ê÷U“ì∞¢–¢&W2Êß6ˆ‚á≤ˆ≥ßG'VR¬&VFñÊW73ß"Á&˜w5≥““ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Çuı5B˜FV6ÇˆFñ«í◊&VFñÊW72W'&˜#¢r¬Rì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢~âÆãâûâ~ãnààNä~ã.äâÓä>òûäﬁää~ãâûâûã^òûòNäòéäÆã>òä>ò~àÇr“ì∞¢–ß“ì∞†¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	˘{Æ˚àÚDT4É¢&VfW'&VB¶ˆÊRéò.àæâûä>ãâÆà~ã.âíê¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶ÁWBÇ"˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜¶ˆÊR"¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B≤W6W&Ê÷R““&WÁ&◊3∞¢6ˆÁ7B¶ˆÊR“á&WÊ&ˆGìÚÁ¶ˆÊR«¬""íÁFı7G&ñÊrÇíÁG&ñ“Çì∞†¢G'í∞¢vóBˆˆ¬ÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2áW6W&Ê÷R¬&VfW'&VE˜¶ˆÊRê¢d≈TU2ÇC¬C"ê¢Ù‚4Ù‰dƒî5BáW6W&Ê÷RíDÚUDDR4UB&VfW'&VE˜¶ˆÊR“UÑ4≈TDTBÁ&VfW'&VE˜¶ˆÊV¿¢∑W6W&Ê÷R¬¶ˆÊU–¢ì∞¢&W2Êß6ˆ‚á≤7V66W73¢G'VR¬&VfW'&VE˜¶ˆÊS¢¶ˆÊR“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.âÆãâûâ~ãnàò.àæâûòNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞†¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	˘BDT4Ñ‰î4î‚$ÙdîƒRácBê¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶ÁW6RÜ7&VFU6W'fñ6U¶ˆÊU&˜WFW2á∞¢vWE6W'fñ6U¶ˆÊW2¿¢4U%dî4Uı§Ù‰Uı4TTE2¿¢T‰$ƒUı4U%dî4Uı§Ù‰UÙdî≈DU ß“íì∞†¶Á˜7BÇ"˜V&∆ñ2˜6W'fñ6R◊¶ˆÊW2ˆFWFV7B"¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7B&ˆGí“&WÊ&ˆGí«¬∑”∞¢6ˆÁ7BFWFV7FVB“vóBFWFV7E6W'fñ6U¶ˆÊTg&ˆ’FWáBá∞¢FG&W75˜FWáC¢&ˆGíÊFG&W75˜FWáB¿¢¶ˆ%˜¶ˆÊS¢&ˆGíÊ¶ˆ%˜¶ˆÊR¿¢÷5˜W&√¢&ˆGíÊ÷5˜W&¬¿¢w5ˆ∆FóGVFS¢&ˆGíÊw5ˆ∆FóGVFR¿¢w5ˆ∆ˆÊvóGVFS¢&ˆGíÊw5ˆ∆ˆÊvóGVFR¿¢“ì∞¢&W2Êß6ˆ‚á∞¢ˆ≥¢G'VR¿¢fñ«FW%ˆVÊ&∆VC¢T‰$ƒUı4U%dî4Uı§Ù‰UÙdî≈DU"¿¢FWFV7FVC¢V&∆ñ56W'fñ6U¶ˆÊUfñWrÜFWFV7FVBí¿¢“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Ç%ı5B˜V&∆ñ2˜6W'fñ6R◊¶ˆÊW2ˆFWFV7B"¬Rì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢$DUDT5Eı4U%dî4Uı§Ù‰UÙdîƒTB"“ì∞¢–ß“ì∞†¶Á˜7BÇ"˜6W'fñ6U˜¶ˆÊW2ˆFWFV7B"¬&WVó&TF÷ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BFWFV7FVB“vóBFWFV7E6W'fñ6U¶ˆÊTg&ˆ’FWáBá&WÊ&ˆGí«¬∑“¬≤∆∆˜tF÷ñ‰˜fW'&ñFS¢G'VR“ì∞¢&W2Êß6ˆ‚á≤ˆ≥¢G'VR¬FWFV7FVB¬fñ«FW%ˆVÊ&∆VC¢T‰$ƒUı4U%dî4Uı§Ù‰UÙdî≈DU"“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Ç%ı5B˜6W'fñ6U˜¶ˆÊW2ˆFWFV7B"¬Rì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢$DUDT5Eı4U%dî4Uı§Ù‰UÙdîƒTB"“ì∞¢–ß“ì∞†¶ÁWBÇ"˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜6W'fñ6R◊¶ˆÊR"¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“7G&ñÊrá&WÁ&◊2ÁW6W&Ê÷R«¬""íÁG&ñ“Çì∞¢6ˆÁ7BÜˆ÷U˜&˜fñÊ6R“7G&ñÊrá&WÊ&ˆGìÚÊÜˆ÷U˜&˜fñÊ6R«¬""íÁG&ñ“Çì∞¢6ˆÁ7BÜˆ÷UˆFó7G&ñ7B“7G&ñÊrá&WÊ&ˆGìÚÊÜˆ÷UˆFó7G&ñ7B«¬""íÁG&ñ“Çì∞¢6ˆÁ7B6V6ˆÊF'ï˜6W'fñ6U˜¶ˆÊUˆ6ˆFR“7G&ñÊrá&WÊ&ˆGìÚÁ6V6ˆÊF'ï˜6W'fñ6U˜¶ˆÊUˆ6ˆFR«¬""íÁG&ñ“ÇíÁFıWW$66RÇì∞¢6ˆÁ7B∆∆˜uˆ˜WEˆˆe˜¶ˆÊR“&WÊ&ˆGìÚÊ∆∆˜uˆ˜WEˆˆe˜¶ˆÊR””“G'VR«¬7G&ñÊrá&WÊ&ˆGìÚÊ∆∆˜uˆ˜WEˆˆe˜¶ˆÊR«¬""íÁFÙ∆˜vW$66RÇí””“'G'VR#∞¢6ˆÁ7B6W'fñ6U˜&FóW5ˆ∂““&WÊ&ˆGìÚÁ6W'fñ6U˜&FóW5ˆ∂“ÛÚÁV∆√∞¢6ˆÁ7B6fVB“vóBWFFUFV6ÜÊñ6ñ‰Üˆ÷U¶ˆÊRáW6W&Ê÷R¬Üˆ÷U˜&˜fñÊ6R¬Üˆ÷UˆFó7G&ñ7B¬∆∆˜uˆ˜WEˆˆe˜¶ˆÊR¬6V6ˆÊF'ï˜6W'fñ6U˜¶ˆÊUˆ6ˆFR¬6W'fñ6U˜&FóW5ˆ∂“ì∞¢&W2Êß6ˆ‚á≤ˆ≥¢G'VR¬‚‚Á6fVB“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Ç%UB˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜6W'fñ6R◊¶ˆÊR"¬Rì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢%4dUıDT4Öı4U%dî4Uı§Ù‰UÙdîƒTB"“ì∞¢–ß“ì∞¶6ˆÁ7B$ÙdîƒUı$UÙDï"“FÇÊ¶ˆñ‚ÖUƒÙEÙDï"¬'&ˆfñ∆U˜&WVW7G2"ì∞¶6ˆÁ7BDT4Öı$ÙdîƒUÙDï"“FÇÊ¶ˆñ‚ÖUƒÙEÙDï"¬'FV6Ö˜&ˆfñ∆W2"ì∞¶6ˆÁ7B4ît‰EU$UÙDï"“FÇÊ¶ˆñ‚ÖUƒÙEÙDï"¬'6ñvÊGW&W2"ì∞¶g2Ê÷∂Fó%7ñÊ2Ö$ÙdîƒUı$UÙDï"¬≤&V7W'6ófS¢G'VR“ì∞¶g2Ê÷∂Fó%7ñÊ2ÖDT4Öı$ÙdîƒUÙDï"¬≤&V7W'6ófS¢G'VR“ì∞¶g2Ê÷∂Fó%7ñÊ2Ö4ît‰EU$UÙDï"¬≤&V7W'6ófS¢G'VR“ì∞†¶gVÊ7Fñˆ‚6fUW∆ˆFVDfñ∆RÜfñ∆R¬fˆ∆FW"¬&VfóÇí∞¢ñbÇfñ∆Rí&WGW&‚ÁV∆√∞¢6ˆÁ7BWáB“FÇÊWáFÊ÷RÜfñ∆RÊ˜&ñvñÊ∆Ê÷R«¬""íÁFÙ∆˜vW$66RÇí«¬"Êßr#∞¢6ˆÁ7B7F◊“FFRÊÊ˜rÇì∞¢6ˆÁ7BfÊ÷R“6fTfñ∆VÊ÷RÜG∑&Vfóá’ÚG∑7F◊“G∂WáG÷ì∞¢6ˆÁ7B'5FÇ“FÇÊ¶ˆñ‚Üfˆ∆FW"¬fÊ÷Rì∞¢g2Áw&óFTfñ∆U7ñÊ2Ü'5FÇ¬fñ∆RÊ'VffW"ì∞¢6ˆÁ7B&V¬“'5FÇÁ&W∆6RÖUƒÙEÙDï"¬""íÁ&W∆6RÇı≈¬ˆr¬"Ú"ì∞¢&WGW&‚˜W∆ˆG2G∑&V¬Á7F'G5vóFÇÇ"Ú"íÚ""¢"Ú'“G∑&V«÷∞ß–†¢ÚÚ)»R6∆˜VFñÊ'íÜV«W"Üf˜"FV6ÜÊñ6ñ‚&ˆfñ∆RÜ˜F˜2ê¢ÚÚ“&WGW&Á2≤W&¬¬V&∆ñ5ˆñB–¶7ñÊ2gVÊ7Fñˆ‚W∆ˆEFV6Ö&ˆfñ∆UFÙ6∆˜VFñÊ'íÜfñ∆R¬≤W6W&Ê÷R¬fˆ∆FW%7VffóÇ“í∞¢ñbÇfñ∆Rí&WGW&‚ÁV∆√∞¢ñbÇ4ƒıTDî‰%ïÙT‰$ƒTBí&WGW&‚ÁV∆√∞¢6ˆÁ7B6fUW6W"“6fTfñ∆VÊ÷RÖ7G&ñÊráW6W&Ê÷R«¬wVÊ∂Ê˜v‚ríì∞¢6ˆÁ7B7F◊“FFRÊÊ˜rÇì∞¢6ˆÁ7BV&∆ñ4ñB“G∑6fUW6W'’ÚG∑7F◊÷∞¢6ˆÁ7Bfˆ∆FW"“7vb˜FV6Ö˜&ˆfñ∆W2G∂fˆ∆FW%7VffóÇÚÚG∂fˆ∆FW%7Vffóá÷¢rw÷∞¢6ˆÁ7BG&Á6f˜&÷Fñˆ‚“v5ˆ∆ñ÷óB«uÛÉ«ˆWFÚ∆eˆWFÚs∞¢6ˆÁ7B"“vóB6∆˜VFñÊ'ïW∆ˆD'VffW"á∞¢'VffW#¢fñ∆RÊ'VffW"¿¢÷ñ÷WGóS¢fñ∆RÊ÷ñ÷WGóR¿¢fˆ∆FW"¿¢V&∆ñ4ñB¿¢G&Á6f˜&÷Fñˆ‚¿¢“ì∞¢&WGW&‚≤W&√¢"Á6V7W&U˜W&¬¬V&∆ñ5ˆñC¢"ÁV&∆ñ5ˆñB”∞ß–†¶ÊvWBÇ"˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜&ˆfñ∆R"¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“&WÁ&◊2ÁW6W&Ê÷S∞†¢6ˆÁ7B“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BW6W&Ê÷R¬FV6ÜÊñ6ñÂˆ6ˆFR¬gV∆≈ˆÊ÷R¬Ü˜Fı˜FÇ¬˜6óFñˆ‚¬&Êµˆ∆WfV¬¬&Êµˆ∂Wí¬&FñÊr¬w&FR¬FˆÊUˆ6˜VÁB¿¢4ÙƒU44RÜ66WE˜7FGW2¬w&VGírí266WE˜7FGW2¬66WE˜7FGW5˜WFFVEˆB¿¢4ÙƒU44Rá&VfW'&VE˜¶ˆÊR¬rrí2&VfW'&VE˜¶ˆÊR¿¢4ÙƒU44RáÜˆÊR¬rrí2ÜˆÊR¿¢4ÙƒU44RÜÜˆ÷U˜&˜fñÊ6R¬rrí2Üˆ÷U˜&˜fñÊ6R¿¢4ÙƒU44RÜÜˆ÷UˆFó7G&ñ7B¬rrí2Üˆ÷UˆFó7G&ñ7B¿¢4ÙƒU44RÜÜˆ÷U˜6W'fñ6U˜¶ˆÊUˆ6ˆFR¬rrí2Üˆ÷U˜6W'fñ6U˜¶ˆÊUˆ6ˆFR¿¢4ÙƒU44Rá6V6ˆÊF'ï˜6W'fñ6U˜¶ˆÊUˆ6ˆFR¬rrí26V6ˆÊF'ï˜6W'fñ6U˜¶ˆÊUˆ6ˆFR¿¢6W'fñ6U˜&FóW5ˆ∂“¿¢4ÙƒU44RÜ∆∆˜uˆ˜WEˆˆe˜¶ˆÊRƒd≈4Rí2∆∆˜uˆ˜WEˆˆe˜¶ˆÊR¿¢¢Á¶ˆÊUˆ∆&V¬2Üˆ÷U˜6W'fñ6U˜¶ˆÊUˆ∆&V¬¿¢£"Á¶ˆÊUˆ∆&V¬26V6ˆÊF'ï˜6W'fñ6U˜¶ˆÊUˆ∆&V¿¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2 ¢ƒTeB§Ùî‚V&∆ñ2Á6W'fñ6U˜¶ˆÊW2¢Ù‚¢Á¶ˆÊUˆ6ˆFS◊ÊÜˆ÷U˜6W'fñ6U˜¶ˆÊUˆ6ˆFP¢ƒTeB§Ùî‚V&∆ñ2Á6W'fñ6U˜¶ˆÊW2£"Ù‚£"Á¶ˆÊUˆ6ˆFS◊Á6V6ˆÊF'ï˜6W'fñ6U˜¶ˆÊUˆ6ˆFP¢tÑU$RÁW6W&Ê÷S“C¿¢∑W6W&Ê÷U–¢ì∞†¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5B7FGW0¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆U˜&WVW7G0¢tÑU$RW6W&Ê÷S“C¢ı$DU"%í&WVW7FVEˆBDU40¢ƒî‘ïB¿¢∑W6W&Ê÷U–¢ì∞†¢6ˆÁ7B&ˆfñ∆R“Á&˜w5≥“«¬≤W6W&Ê÷R”∞¢&ˆfñ∆RÁ&WVW7E˜7FGW2“"Á&˜w5≥”ÚÁ7FGW2«¬&ÊˆÊR#∞¢&W2Êß6ˆ‚á&ˆfñ∆Rì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Ç$tUB&ˆfñ∆RW'&˜#¢"¬Rì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.ò.äæä^âNò.âæä>òNâ˛ä^òŒòNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞†¢ÚÚ	˘9‚FV6ÜÊñ6ñ„¢WFFR˜v‚ÜˆÊRá6Ü˜v‚ˆ‚G&6∂ñÊrê¢ÚÚ“∆∆˜rV◊Gí“6∆V ¢ÚÚ“&6ñ2f∆ñFFñˆ‚FÚfˆñB'&ˆ∂V‚f«VW0¶ÁWBÇ"˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜ÜˆÊR"¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“&WÁ&◊2ÁW6W&Ê÷S∞¢6ˆÁ7BÜˆÊU&r“á&WÊ&ˆGìÚÁÜˆÊRÛÚ""íÁFı7G&ñÊrÇíÁG&ñ“Çì∞†¢ñbáÜˆÊU&rbbıÂ≥”íµ¬“Çï«5◊≥b√#“BÚÁFW7BáÜˆÊU&ríí∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.ä>ãûâæòâÆâÆòâÆäﬁä>òŒò.â~ä>òNäòéânãûàâ^òûäﬁàr"“ì∞¢–†¢vóBˆˆ¬ÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2áW6W&Ê÷R¬ÜˆÊRê¢d≈TU2ÇC¬C"ê¢Ù‚4Ù‰dƒî5BáW6W&Ê÷RíDÚUDDR4U@¢ÜˆÊR“UÑ4≈TDTBÁÜˆÊR¿¢WFFVEˆB“5U%$TÂEıDî‘U5D’¿¢∑W6W&Ê÷R¬ÜˆÊU&r«¬ÁV∆≈–¢ì∞†¢&W2Êß6ˆ‚á≤ˆ≥¢G'VR¬ÜˆÊS¢ÜˆÊU&r«¬""“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Ç%UBFV6ÜÊñ6ñ‚ÜˆÊRW'&˜#¢"¬Rì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.âÆãâûâ~ãnàòâÆäﬁä>òŒò.â~ä>òNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞†¢ÚÚàÆòéã.à~äÆòéà~àNã>à.äﬁòàòûòNà"éàÆã~òéä“≤ä>ãûâ≤ê¶Á˜7BÇ"˜&ˆfñ∆R˜&WVW7B"¬W∆ˆBÁ6ñÊv∆RÇ'Ü˜FÚ"í¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“á&WÊ&ˆGíÁW6W&Ê÷R«¬""íÁG&ñ“Çì∞¢6ˆÁ7BgV∆≈ˆÊ÷R“á&WÊ&ˆGíÊgV∆≈ˆÊ÷R«¬""íÁG&ñ“Çì∞¢ñbÇW6W&Ê÷Rí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢'W6W&Ê÷Räæã.ä""“ì∞†¢ÚÚ)»Rî’ı%DÂC¢&ˆfñ∆R&WVW7BÜ˜F˜2◊W7B‰ıB&R7F˜&VBˆ‚∆ˆ6¬Fó6≤Ö&VÊFW"WÜV÷W&¬ê¢ÚÚ&VfW"6∆˜VFñÊ'í‚ñb6∆˜VFñÊ'íÊ˜B6ˆÊfñwW&VB¬f∆∆&6≤FÚ∆ˆ6¬Fó6≤FÚ∂VW&6∑v&B6ˆ◊Fñ&ñ∆óGí‡¢∆WBÜ˜Fı˜FV◊˜FÇ“ÁV∆√∞¢ñbá&WÊfñ∆Rbb4ƒıTDî‰%ïÙT‰$ƒTBí∞¢6ˆÁ7BW“vóBW∆ˆEFV6Ö&ˆfñ∆UFÙ6∆˜VFñÊ'íá&WÊfñ∆R¬≤W6W&Ê÷R¬fˆ∆FW%7VffóÉ¢w&WVW7G2r“ì∞¢Ü˜Fı˜FV◊˜FÇ“WÚÁW&¬«¬ÁV∆√∞¢“V«6R∞¢Ü˜Fı˜FV◊˜FÇ“6fUW∆ˆFVDfñ∆Rá&WÊfñ∆R¬$ÙdîƒUı$UÙDï"¬W6W&Ê÷Rì∞¢–†¢ñbÇgV∆≈ˆÊ÷RbbÜ˜Fı˜FV◊˜FÇí∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.â^òûäﬁà~äÆòéà~àÆã~òéäﬁò>äæäòÇäæä>ã~äﬁä>ãûâ≤äﬁä.òéã.à~âûòûäﬁä"äﬁä.òéã.àr"“ì∞¢–†¢vóBˆˆ¬ÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆U˜&WVW7G2áW6W&Ê÷R¬gV∆≈ˆÊ÷R¬Ü˜Fı˜FV◊˜FÇ¬7FGW2ê¢d≈TU2ÇC¬C"¬C2¬wVÊFñÊrrñ¿¢∑W6W&Ê÷R¬gV∆≈ˆÊ÷R«¬ÁV∆¬¬Ü˜Fı˜FV◊˜FÇ«¬ÁV∆≈–¢ì∞†¢&W2Êß6ˆ‚á≤ˆ≥¢G'VR“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Ç%ı5B&ˆfñ∆R&WVW7BW'&˜#¢"¬Rì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.äÆòéà~àNã>à.äﬁòNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞†¢ÚÚF÷ñ‚∆ó7BVÊFñÊr&WVW7G0¶ÊvWBÇ"ˆF÷ñ‚˜&ˆfñ∆R˜&WVW7G2"¬&WVó&TF÷ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7B“vóBˆˆ¬ÁVW'íÄ¢4TƒT5B"ÊñB¬"ÊñB2&WVW7EˆñB¬"ÁW6W&Ê÷R¬"ÊgV∆≈ˆÊ÷R¬"ÁÜ˜Fı˜FV◊˜FÇ¬"Á&WVW7FVEˆB¿¢ÁFV6ÜÊñ6ñÂˆ6ˆFR¬Á˜6óFñˆ‡¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆U˜&WVW7G2 ¢ƒTeB§Ùî‚V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2Ù‚ÁW6W&Ê÷R“"ÁW6W&Ê÷P¢tÑU$R"Á7FGW3“wVÊFñÊrp¢ı$DU"%í"Á&WVW7FVEˆB46 ¢ì∞¢&W2Êß6ˆ‚áÁ&˜w2ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Ç$tUBF÷ñ‚&WVW7G2W'&˜#¢"¬Rì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢ò.äæä^âNàNã>à.äﬁòNäòéäÆã>òä>ò~àÉ¢G∂SÚÊ÷W76vR«¬'VÊ∂Ê˜v‚'÷“ì∞¢–ß“ì∞†¶Á˜7BÇ"ˆF÷ñ‚˜&ˆfñ∆R˜&WVW7G2Û¶ñBˆ&˜fR"¬&WVó&TF÷ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B6∆ñVÁB“vóBˆˆ¬Ê6ˆÊÊV7BÇì∞¢G'í∞¢6ˆÁ7BñB“ÁV÷&W"á&WÁ&◊2ÊñBì∞¢∆WBFV6ÜÊñ6ñÂˆ6ˆFR“á&WÊ&ˆGíÁFV6ÜÊñ6ñÂˆ6ˆFR«¬""íÁG&ñ“Çì∞†¢ÚÚ)»RdïÉ¢ânòûã.òäﬁâNäãNâûòNäòéäÆòéàr˜6óFñˆ‚äã"“äﬁä.òéã.â~ãâÆà.äﬁà~òâNãNä¢6ˆÁ7B˜6óFñˆ‚“á&WÊ&ˆGíÁ˜6óFñˆ‚«¬""íÁG&ñ“Çí«¬ÁV∆√∞†¢ñbÇñBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢&ñBòNäòéânãûàâ^òûäﬁàr"“ì∞†¢vóB6∆ñVÁBÁVW'íÇ$$Ttî‚"ì∞†¢6ˆÁ7B'“vóB6∆ñVÁBÁVW'íÄ¢4TƒT5B¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆U˜&WVW7G2tÑU$RñC“Cdı"UDDV¿¢∂ñE–¢ì∞¢ñbá'Á&˜w2Ê∆VÊwFÇ””“í∞¢vóB6∆ñVÁBÁVW'íÇ%$Ùƒƒ$4≤"ì∞¢&WGW&‚&W2Á7FGW2ÉCBíÊß6ˆ‚á≤W'&˜#¢.òNäòéâÓâÆàNã>à.ä“"“ì∞¢–¢6ˆÁ7B&W&˜r“'Á&˜w5≥”∞¢ñbá&W&˜rÁ7FGW2”“'VÊFñÊr"í∞¢vóB6∆ñVÁBÁVW'íÇ%$Ùƒƒ$4≤"ì∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.àNã>à.äﬁâûã^òûòNäòéäﬁä.ãûòéò>âûäÆânã.âûãVÊFñÊr"“ì∞¢–†¢ñbÇFV6ÜÊñ6ñÂˆ6ˆFRí∞¢6ˆÁ7BWÜó7FñÊt6ˆFR“vóB6∆ñVÁBÁVW'íÄ¢4TƒT5BFV6ÜÊñ6ñÂˆ6ˆFRe$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2tÑU$RW6W&Ê÷S“Cƒî‘ïB¿¢∑&W&˜rÁW6W&Ê÷U–¢ì∞¢FV6ÜÊñ6ñÂˆ6ˆFR“7G&ñÊrÜWÜó7FñÊt6ˆFRÁ&˜w5≥”ÚÁFV6ÜÊñ6ñÂˆ6ˆFR«¬&W&˜rÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢–¢ñbÇFV6ÜÊñ6ñÂˆ6ˆFRí∞¢vóB6∆ñVÁBÁVW'íÇ%$Ùƒƒ$4≤"ì∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.òNäòéâÓâÆä>äæãäÆàÆòéã.à~òâNãNäàä>ãéâ>ã.ò>äÆòéä>äæãäÆàÆòéã.àr"“ì∞¢–†¢∆WBfñÊ≈Ü˜FıFÇ“ÁV∆√∞¢ñbá&W&˜rÁÜ˜Fı˜FV◊˜FÇí∞¢6ˆÁ7B“7G&ñÊrá&W&˜rÁÜ˜Fı˜FV◊˜FÇì∞¢ÚÚ)»Rñb&WVW7BÜ˜FÚ«&VGí7F˜&VBˆ‚6∆˜VFñÊ'í¬∂VWóB2÷ó0¢ñbÇıÊáGG3Û•¬ı¬ÚˆíÁFW7BáíbbÊñÊ6«VFW2Çw&W2Ê6∆˜VFñÊ'íÊ6ˆ“ríí∞¢fñÊ≈Ü˜FıFÇ“∞¢“V«6R∞¢ÚÚ&6∑v&B6ˆ◊Fñ&∆S¢∆ˆ6¬FV◊fñ∆R”‚÷˜fRFÚFV6Ö˜&ˆfñ∆W0¢6ˆÁ7BFV◊'2“FÇÊ¶ˆñ‚ÖıˆFó&Ê÷R¬Á&W∆6RÇ"˜W∆ˆG2Ú"¬'W∆ˆG2Ú"íì∞¢ñbÜg2ÊWÜó7G57ñÊ2áFV◊'2íí∞¢6ˆÁ7BWáB“FÇÊWáFÊ÷RáFV◊'2í«¬"Êßr#∞¢6ˆÁ7BfñÊƒÊ÷R“6fTfñ∆VÊ÷RÜG∑&W&˜rÁW6W&Ê÷W’ÚG¥FFRÊÊ˜rÇó“G∂WáG÷ì∞¢6ˆÁ7BfñÊƒ'2“FÇÊ¶ˆñ‚ÖDT4Öı$ÙdîƒUÙDï"¬fñÊƒÊ÷Rì∞¢g2Á&VÊ÷U7ñÊ2áFV◊'2¬fñÊƒ'2ì∞†¢6ˆÁ7B&V¬“fñÊƒ'2Á&W∆6RÖUƒÙEÙDï"¬""íÁ&W∆6RÇı≈¬ˆr¬"Ú"ì∞¢fñÊ≈Ü˜FıFÇ“˜W∆ˆG2G∑&V¬Á7F'G5vóFÇÇ"Ú"íÚ""¢"Ú'“G∑&V«÷∞¢–¢–¢–†¢6ˆÁ7BWEFV6Ö&ˆfñ∆R“vóB6∆ñVÁBÁVW'íÄ¢UDDRV&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W0¢4UBFV6ÜÊñ6ñÂˆ6ˆFS“C"¿¢gV∆≈ˆÊ÷S‘4ÙƒU44RÇC2¬gV∆≈ˆÊ÷Rí¿¢Ü˜Fı˜FÉ‘4ÙƒU44RÇCB¬Ü˜Fı˜FÇí¿¢˜6óFñˆ„‘4ÙƒU44RÇCR¬˜6óFñˆ‚í¿¢66WE˜7FGW3‘4ÙƒU44RÜ66WE˜7FGW2¬w&VGírí¿¢WFFVEˆC‘5U%$TÂEıDî‘U5D’ ¢tÑU$RW6W&Ê÷S“C¿¢∑&W&˜rÁW6W&Ê÷R¬FV6ÜÊñ6ñÂˆ6ˆFR¬&W&˜rÊgV∆≈ˆÊ÷R«¬ÁV∆¬¬fñÊ≈Ü˜FıFÇ«¬ÁV∆¬¬˜6óFñˆÂ–¢ì∞¢ñbÇWEFV6Ö&ˆfñ∆RÁ&˜t6˜VÁBí∞¢vóB6∆ñVÁBÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2áW6W&Ê÷R¬FV6ÜÊñ6ñÂˆ6ˆFR¬gV∆≈ˆÊ÷R¬Ü˜Fı˜FÇ¬˜6óFñˆ‚¬66WE˜7FGW2¬WFFVEˆBê¢d≈TU2ÇC¬C"¬C2¬CB¬CR¬w&VGírƒ5U%$TÂEıDî‘U5D’ñ¿¢∑&W&˜rÁW6W&Ê÷R¬FV6ÜÊñ6ñÂˆ6ˆFR¬&W&˜rÊgV∆≈ˆÊ÷R«¬ÁV∆¬¬fñÊ≈Ü˜FıFÇ«¬ÁV∆¬¬˜6óFñˆÂ–¢ì∞¢–†¢vóB6∆ñVÁBÁVW'íÄ¢UDDRV&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆U˜&WVW7G0¢4UB7FGW3“v&˜fVBr¬&WfñWvVEˆC‘5U%$TÂEıDî‘U5D’ ¢tÑU$RñC“C¿¢∂ñE–¢ì∞†¢vóB6∆ñVÁBÁVW'íÇ$4Ù‘‘ïB"ì∞¢&W2Êß6ˆ‚á≤ˆ≥¢G'VR“ì∞¢“6F6ÇÜRí∞¢vóB6∆ñVÁBÁVW'íÇ%$Ùƒƒ$4≤"ì∞¢6ˆÁ6ˆ∆RÊW'&˜"Ç$$ıdR&WVW7BW'&˜#¢"¬Rì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.äﬁâûãéäãâ^ãNòNäòéäÆã>òä>ò~àÇ"“ì∞¢“fñÊ∆«í∞¢6∆ñVÁBÁ&V∆V6RÇì∞¢–ß“ì∞†¶Á˜7BÇ"ˆF÷ñ‚˜&ˆfñ∆R˜&WVW7G2Û¶ñB˜&V¶V7B"¬&WVó&TF÷ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BñB“ÁV÷&W"á&WÁ&◊2ÊñBì∞¢ñbÇñBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢&ñBòNäòéânãûàâ^òûäﬁàr"“ì∞†¢vóBˆˆ¬ÁVW'íÄ¢UDDRV&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆U˜&WVW7G0¢4UB7FGW3“w&V¶V7FVBr¬&WfñWvVEˆC‘5U%$TÂEıDî‘U5D’ ¢tÑU$RñC“C‰B7FGW3“wVÊFñÊrv¿¢∂ñE–¢ì∞†¢&W2Êß6ˆ‚á≤ˆ≥¢G'VR“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Ç%$T§T5B&WVW7BW'&˜#¢"¬Rì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.âæà˛ãNòäÆâéòNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞†¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	˙y(ﬂ	˘JrD‘î„¢7&VFRFV6ÜÊñ6ñ‚W6W ¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶Á˜7BÇ"ˆF÷ñ‚˜FV6ÜÊñ6ñÁ2ˆ7&VFR"¬&WVó&TF÷ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B≤W6W&Ê÷R¬77v˜&B¬gV∆≈ˆÊ÷R¬FV6ÜÊñ6ñÂˆ6ˆFR¬˜6óFñˆ‚¬ÜˆÊR¬V◊∆˜ñ÷VÁE˜GóR““&WÊ&ˆGí«¬∑”∞¢6ˆÁ7BR“áW6W&Ê÷R«¬""íÁFı7G&ñÊrÇíÁG&ñ“Çì∞¢6ˆÁ7B“á77v˜&B«¬""íÁFı7G&ñÊrÇíÁG&ñ“Çì∞¢ñbÇR«¬í&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.â^òûäﬁà~äãRW6W&Ê÷Ròä^ã77v˜&B"“ì∞†¢6ˆÁ7B6ˆFR“áFV6ÜÊñ6ñÂˆ6ˆFR«¬""íÁFı7G&ñÊrÇíÁG&ñ“Çí«¬ÁV∆√∞¢6ˆÁ7B˜2“á˜6óFñˆ‚«¬&ßVÊñ˜""íÁFı7G&ñÊrÇíÁG&ñ“Çì∞†¢6ˆÁ7B6∆ñVÁB“vóBˆˆ¬Ê6ˆÊÊV7BÇì∞¢G'í∞¢vóB6∆ñVÁBÁVW'íÇ$$Ttî‚"ì∞†¢vóB6∆ñVÁBÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2ÁW6W'2áW6W&Ê÷R¬77v˜&B¬&ˆ∆Ríd≈TU2ÇC¬C"¬wFV6ÜÊñ6ñ‚rñ¿¢∑R¬–¢ì∞†¢vóB6∆ñVÁBÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2áW6W&Ê÷R¬gV∆≈ˆÊ÷R¬FV6ÜÊñ6ñÂˆ6ˆFR¬˜6óFñˆ‚¬ÜˆÊR¬V◊∆˜ñ÷VÁE˜GóR¬&FñÊr¬w&FR¬FˆÊUˆ6˜VÁBê¢d≈TU2ÇC¬C"¬C2¬CB¬CR¬Cb¬R¬tr¬ê¢Ù‚4Ù‰dƒî5BáW6W&Ê÷RíDÚ‰ıDÑî‰v¿¢∞¢R¿¢ÜgV∆≈ˆÊ÷R«¬RíÁFı7G&ñÊrÇíÁG&ñ“Çí¿¢6ˆFR¿¢˜2¿¢áÜˆÊR«¬rríÁFı7G&ñÊrÇíÁG&ñ“Çí«¬ÁV∆¬¿¢ÜV◊∆˜ñ÷VÁE˜GóR«¬rríÁFı7G&ñÊrÇíÁG&ñ“Çí«¬ÁV∆¬¿¢–¢ì∞†¢vóB6∆ñVÁBÁVW'íÇ$4Ù‘‘ïB"ì∞¢&W2Êß6ˆ‚á≤7V66W73¢G'VR¬W6W&Ê÷S¢R“ì∞¢“6F6ÇÜRí∞¢vóB6∆ñVÁBÁVW'íÇ%$Ùƒƒ$4≤"ì∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢RÊ÷W76vR«¬.äÆä>òûã.à~àÆòéã.à~òNäòéäÆã>òä>ò~àÇ"“ì∞¢“fñÊ∆«í∞¢6∆ñVÁBÁ&V∆V6RÇì∞¢–ß“ì∞†¶ÊvWBÇ"ˆF÷ñ‚˜FV6ÜÊñ6ñÁ2"¬&WVó&TF÷ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7B“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BRÁW6W&Ê÷R¿¢ÊgV∆≈ˆÊ÷R¬ÁFV6ÜÊñ6ñÂˆ6ˆFR¬Á˜6óFñˆ‚¬Á&Êµˆ∆WfV¬¬Á&Êµˆ∂Wí¬ÁÜ˜Fı˜FÇ¬ÁÜˆÊR¿¢4ÙƒU44RáÊV◊∆˜ñ÷VÁE˜GóR¬v6ˆ◊Áírí2V◊∆˜ñ÷VÁE˜GóR¿¢4ÙƒU44RáÊ6ˆ◊VÁ6FñˆÂˆ÷ˆFR¬v6ˆ÷÷ó76ñˆ‚rí26ˆ◊VÁ6FñˆÂˆ÷ˆFR¿¢4ÙƒU44RáÊFñ«ï˜vvUˆ÷˜VÁB√ì£¶ÁV÷W&ñ22Fñ«ï˜vvUˆ÷˜VÁB¿¢4ÙƒU44RáÊ÷ˆÁFÜ«ï˜6∆'ïˆ÷˜VÁB√ì£¶ÁV÷W&ñ22÷ˆÁFÜ«ï˜6∆'ïˆ÷˜VÁB¿¢4ÙƒU44RáÁv˜&µ˜7F'B¬sì£rí2v˜&µ˜7F'B¿¢4ÙƒU44RáÁv˜&µˆVÊB¬sÉ£rí2v˜&µˆVÊB¿¢““FVfV7B#¢7W&f6RFÜRE%TRW'6ó7FVBfó6ñ&ñ∆óGíÜÁV∆¬7Fó2ÁV∆¬í6ÚFÜRF÷ñ‚Tê¢““&Vf∆V7G2FÜR6÷Rfñ¬÷6∆˜6VB7FFRFÜR7W7Fˆ÷W"V∆ñvñ&ñ∆óGíVW'íVÊf˜&6W2‡¢Ê7W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆R27W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆R¿¢Á&FñÊr¬Êw&FR¬ÊFˆÊUˆ6˜VÁB¿¢4ÙƒU44RáÊ66WE˜7FGW2¬w&VGírí266WE˜7FGW2¬Ê66WE˜7FGW5˜WFFVEˆ@¢e$Ù“V&∆ñ2ÁW6W'2P¢ƒTeB§Ùî‚V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2Ù‚ÁW6W&Ê÷S◊RÁW6W&Ê÷P¢tÑU$RRÁ&ˆ∆S“wFV6ÜÊñ6ñ‚p¢ı$DU"%íRÁW6W&Ê÷R46 ¢ì∞¢&W2Êß6ˆ‚áÁ&˜w2ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Ç$tUBF÷ñ‚FV6ÜÊñ6ñÁ2W'&˜#¢"¬Rì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢ò.äæä^âNä>ã.ä.àÆã~òéäﬁàÆòéã.à~òNäòéäÆã>òä>ò~àÉ¢G∂SÚÊ÷W76vR«¬'VÊ∂Ê˜v‚'÷“ì∞¢–ß“ì∞††¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	˙y(ﬂ	˘JrD‘î„¢FV6ÜÊñ6ñ‚&6R7FGW2ÖV˜∆R7FGW2ÚFV“7FGW2f˜&vRê¢ÚÚÜ6R¢&6V∆ñÊR76W76÷VÁBˆÊ«ì≤ÊÚíˆñ÷vRì≤ó6ˆ∆FVBÊB&VB÷ˆÊ«íF˜v&BWÜó7FñÊr7ó7FV◊2‡¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶6ˆÁ7B∞¢vWEFV6ÜÊñ6ñ‰f˜%7FGW2¿¢vWD∆FW7D&6U7FGW2¿ß““7&VFUFV6ÜÊñ6ñ‰&6U7FGW4FFÜV«W'2á≤ˆˆ¬“ì∞†¶ÊvWBÇrˆF÷ñ‚˜FV“◊7FGW2r¬&WVó&TF÷ñÂ6W76ñˆ‚¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬ÇvF÷ñ‚◊FV“◊7FGW2ÊáF÷¬rííì∞¶ÊvWBÇrˆF÷ñ‚˜FV“◊7FGW2ÊáF÷¬r¬&WVó&TF÷ñÂ6W76ñˆ‚¬á&W¬&W2í”‚&W2Á&VFó&V7BÉ3"¬rˆF÷ñ‚˜FV“◊7FGW2ríì∞¶ÊvWBÇrˆF÷ñ‚◊FV“◊7FGW2ÊáF÷¬r¬&WVó&TF÷ñÂ6W76ñˆ‚¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬ÇvF÷ñ‚◊FV“◊7FGW2ÊáF÷¬rííì∞¶ÁW6RÜ7&VFUFV6ÜÊñ6ñ‰&6U7FGW5&VDˆÊ«ï&˜WFW2á∞¢ˆˆ¬¿¢&WVó&TF÷ñÂ6W76ñˆ‚¿¢&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¿¢vWEFV6ÜÊñ6ñ‰f˜%7FGW2¿¢vWD∆FW7D&6U7FGW2¿ß“íì∞†¶Á˜7BÇrˆF÷ñ‚ˆí˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷Rˆ&6R◊7FGW2r¬&WVó&TF÷ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“7G&ñÊrá&WÁ&◊2ÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7BFV6ÜÊñ6ñ‚“vóBvWEFV6ÜÊñ6ñ‰f˜%7FGW2áW6W&Ê÷Rì∞¢ñbÇFV6ÜÊñ6ñ‚í&WGW&‚&W2Á7FGW2ÉCBíÊß6ˆ‚á≤W'&˜#¢~òNäòéâÓâÆàÆòéã.àrr“ì∞¢6ˆÁ7BÁ7vW'2“á&WÊ&ˆGíbbGóVˆb&WÊ&ˆGíÊÁ7vW'2””“vˆ&¶V7Brbb'&íÊó4'&íá&WÊ&ˆGíÊÁ7vW'2ííÚ&WÊ&ˆGíÊÁ7vW'2¢∑”∞¢6ˆÁ7B&W7V«B“6∆7V∆FUFV6ÜÊñ6ñ‰&6U7FGW2ÜÁ7vW'2¬FV6ÜÊñ6ñ‚ì∞¢6ˆÁ7B76W76VD'í“7G&ñÊrá&WÊ7F˜#ÚÁW6W&Ê÷R«¬&WÊWFÉÚÁW6W&Ê÷R«¬vF÷ñ‚rì∞¢6ˆÁ7B6fVB“vóBˆˆ¬ÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2ÁFV6ÜÊñ6ñÂˆ&6U˜7FGW5ˆ76W76÷VÁG0¢áFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬76W76VEˆ'í¬76W76÷VÁE˜6˜W&6R¬&WfñWu˜7FGW2¬&WfñWvVEˆ'í¬&WfñWvVEˆB¬Á7vW'5ˆß6ˆ‚¬7FG5ˆß6ˆ‚¬∆WfV¬¬&Ê≤¿¢7VóF&∆Uˆ¶ˆ'5ˆß6ˆ‚¬&W7G&ñ7FVEˆ¶ˆ'5ˆß6ˆ‚¬7G&VÊwFá5ˆß6ˆ‚¬&ó6µ˜ˆñÁG5ˆß6ˆ‚¬FWfV∆˜÷VÁE˜∆Âˆß6ˆ‚¬vVÊW&FVE˜&ˆ◊B¬WFFVEˆBê¢d≈TU2ÇC¬C"¬vF÷ñ‚r¬wfW&ñfñVBr¬C"ƒ‰ırÇí¬C3£¶ß6ˆÊ"¬CC£¶ß6ˆÊ"¬CR¬Cb¬Cs£¶ß6ˆÊ"¬CÉ£¶ß6ˆÊ"¬Cì£¶ß6ˆÊ"¬C£¶ß6ˆÊ"¬C£¶ß6ˆÊ"¬C"ƒ‰ırÇíê¢$UEU$‰î‰r¶¿¢∞¢W6W&Ê÷R¿¢76W76VD'í¿¢•4Ù‚Á7G&ñÊvñgíÜÁ7vW'2í¿¢•4Ù‚Á7G&ñÊvñgíá&W7V«BÁ7FG2í¿¢&W7V«BÊ∆WfV¬¿¢&W7V«BÁ&Ê≤¿¢•4Ù‚Á7G&ñÊvñgíá&W7V«BÁ7VóF&∆Uˆ¶ˆ'2í¿¢•4Ù‚Á7G&ñÊvñgíá&W7V«BÁ&W7G&ñ7FVEˆ¶ˆ'2í¿¢•4Ù‚Á7G&ñÊvñgíá&W7V«BÁ7G&VÊwFá2í¿¢•4Ù‚Á7G&ñÊvñgíá&W7V«BÁ&ó6µ˜ˆñÁG2í¿¢•4Ù‚Á7G&ñÊvñgíá&W7V«BÊFWfV∆˜÷VÁE˜∆‚í¿¢&W7V«BÊvVÊW&FVE˜&ˆ◊B¿¢–¢ì∞¢&WGW&‚&W2Êß6ˆ‚á≤ˆ≥¢G'VR¬FV6ÜÊñ6ñ‚¬76W76÷VÁC¢6fVBÁ&˜w5≥““ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Çuı5B&6R◊7FGW2W'&˜#¢r¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢~âÆãâûâ~ãnà&6R7FGW2òNäòéäÆã>òä>ò~àÇr“ì∞¢–ß“ì∞†¢ÚÚFV6ÜÊñ6ñ‚6V∆b76W76÷VÁBVÁG'óˆñÁBÖÜ6R„ê¢ÚÚ“àÆòéã.à~â~ã>òâÆâÆâæä>ãòäãNâûòäﬁà~òNâNòûàéã.àòäâûãûàÆòéã.àp¢ÚÚ“âÆãâûâ~ãnàòâæò~âíVÊFñÊu˜&WfñWròâÓã~òéäﬁò>äæòíF÷ñ‚ı7WW"F÷ñ‚â^ä>ä~àéâ^òéä“òNäòéò>àÆòéàNãòâûâíˆffñ6ñ¬äﬁãâ^ò.âûäãâ^ã@¶ÊvWBÇr˜FV6Çˆ&6R◊7FGW2r¬&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬ÇwFV6Ç÷&6R◊7FGW2ÊáF÷¬rííì∞¶ÊvWBÇr˜FV6Çˆ&6R◊7FGW2ÊáF÷¬r¬&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¬á&W¬&W2í”‚&W2Á&VFó&V7BÉ3"¬r˜FV6Çˆ&6R◊7FGW2ríì∞†¶Á˜7BÇr˜FV6Çˆíˆ&6R◊7FGW2r¬&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“7G&ñÊrá&WÊWFÉÚÁW6W&Ê÷R«¬&WÊVffV7FófSÚÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7BFV6ÜÊñ6ñ‚“vóBvWEFV6ÜÊñ6ñ‰f˜%7FGW2áW6W&Ê÷Rì∞¢ñbÇFV6ÜÊñ6ñ‚í&WGW&‚&W2Á7FGW2ÉCBíÊß6ˆ‚á≤W'&˜#¢~òNäòéâÓâÆà.òûäﬁäãûä^àÆòéã.à~à.äﬁà~àNãéâ2r“ì∞¢6ˆÁ7BÁ7vW'2“á&WÊ&ˆGíbbGóVˆb&WÊ&ˆGíÊÁ7vW'2””“vˆ&¶V7Brbb'&íÊó4'&íá&WÊ&ˆGíÊÁ7vW'2ííÚ&WÊ&ˆGíÊÁ7vW'2¢∑”∞¢Á7vW'2Âı˜6V∆eˆ76W76÷VÁB“G'VS∞¢Á7vW'2Âı˜7V&÷óGFVEˆ'í“W6W&Ê÷S∞¢Á7vW'2Âı˜7V&÷óGFVEˆB“ÊWrFFRÇíÁFÙï4ı7G&ñÊrÇì∞¢6ˆÁ7B&W7V«B“6∆7V∆FUFV6ÜÊñ6ñ‰&6U7FGW2ÜÁ7vW'2¬FV6ÜÊñ6ñ‚ì∞¢6ˆÁ7B6fVB“vóBˆˆ¬ÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2ÁFV6ÜÊñ6ñÂˆ&6U˜7FGW5ˆ76W76÷VÁG0¢áFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬76W76VEˆ'í¬76W76÷VÁE˜6˜W&6R¬&WfñWu˜7FGW2¬Á7vW'5ˆß6ˆ‚¬7FG5ˆß6ˆ‚¬∆WfV¬¬&Ê≤¿¢7VóF&∆Uˆ¶ˆ'5ˆß6ˆ‚¬&W7G&ñ7FVEˆ¶ˆ'5ˆß6ˆ‚¬7G&VÊwFá5ˆß6ˆ‚¬&ó6µ˜ˆñÁG5ˆß6ˆ‚¬FWfV∆˜÷VÁE˜∆Âˆß6ˆ‚¬vVÊW&FVE˜&ˆ◊B¬WFFVEˆBê¢d≈TU2ÇC¬C"¬w6V∆br¬wVÊFñÊu˜&WfñWrr¬C3£¶ß6ˆÊ"¬CC£¶ß6ˆÊ"¬CR¬Cb¬Cs£¶ß6ˆÊ"¬CÉ£¶ß6ˆÊ"¬Cì£¶ß6ˆÊ"¬C£¶ß6ˆÊ"¬C£¶ß6ˆÊ"¬C"ƒ‰ırÇíê¢$UEU$‰î‰r¶¿¢∞¢W6W&Ê÷R¿¢W6W&Ê÷R¿¢•4Ù‚Á7G&ñÊvñgíÜÁ7vW'2í¿¢•4Ù‚Á7G&ñÊvñgíá&W7V«BÁ7FG2í¿¢&W7V«BÊ∆WfV¬¿¢&W7V«BÁ&Ê≤¿¢•4Ù‚Á7G&ñÊvñgíá&W7V«BÁ7VóF&∆Uˆ¶ˆ'2í¿¢•4Ù‚Á7G&ñÊvñgíá&W7V«BÁ&W7G&ñ7FVEˆ¶ˆ'2í¿¢•4Ù‚Á7G&ñÊvñgíá&W7V«BÁ7G&VÊwFá2í¿¢•4Ù‚Á7G&ñÊvñgíá&W7V«BÁ&ó6µ˜ˆñÁG2í¿¢•4Ù‚Á7G&ñÊvñgíá&W7V«BÊFWfV∆˜÷VÁE˜∆‚í¿¢&W7V«BÊvVÊW&FVE˜&ˆ◊B¿¢–¢ì∞¢&WGW&‚&W2Êß6ˆ‚á≤ˆ≥¢G'VR¬FV6ÜÊñ6ñ‚¬76W76÷VÁC¢6fVBÁ&˜w5≥“¬VÊFñÊu˜&WfñWs¢G'VR“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Çuı5BFV6Ç6V∆b&6R◊7FGW2W'&˜#¢r¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢~äÆòéà~òâÆâÆâæä>ãòäãNâûòNäòéäÆã>òä>ò~àÇr“ì∞¢–ß“ì∞¶ÁWBÇ"ˆF÷ñ‚˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R"¬&WVó&TF÷ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“&WÁ&◊2ÁW6W&Ê÷S∞¢6ˆÁ7BFV6ÜÊñ6ñÂˆ6ˆFR“á&WÊ&ˆGíÁFV6ÜÊñ6ñÂˆ6ˆFR«¬""íÁG&ñ“Çì∞¢6ˆÁ7BgV∆≈ˆÊ÷R“á&WÊ&ˆGíÊgV∆≈ˆÊ÷R«¬""íÁG&ñ“Çì∞¢6ˆÁ7B˜6óFñˆ‚“á&WÊ&ˆGíÁ˜6óFñˆ‚«¬""íÁG&ñ“Çí«¬ÁV∆√≤ÚÚ)»RòNäòéäÆòéàr“òNäòéâ~ãâ†¢6ˆÁ7BÜˆÊU&r“á&WÊ&ˆGíÁÜˆÊRÛÚ""íÁFı7G&ñÊrÇíÁG&ñ“Çì∞¢6ˆÁ7BV◊∆˜ñ÷VÁE˜GóR“á&WÊ&ˆGíÊV◊∆˜ñ÷VÁE˜GóRÛÚ""íÁFı7G&ñÊrÇíÁG&ñ“Çí«¬ÁV∆√∞¢6ˆÁ7B6ˆ◊VÁ6FñˆÂˆ÷ˆFUˆñ‚“á&WÊ&ˆGíÊ6ˆ◊VÁ6FñˆÂˆ÷ˆFRÛÚ""íÁFı7G&ñÊrÇíÁG&ñ“Çí«¬ÁV∆√∞¢6ˆÁ7BFñ«ï˜vvUˆ÷˜VÁEˆñ‚“&WÊ&ˆGíÊFñ«ï˜vvUˆ÷˜VÁC∞¢6ˆÁ7B÷ˆÁFÜ«ï˜6∆'ïˆ÷˜VÁEˆñ‚“&WÊ&ˆGíÊ÷ˆÁFÜ«ï˜6∆'ïˆ÷˜VÁC∞¢6ˆÁ7Bv˜&µ˜7F'B“á&WÊ&ˆGíÁv˜&µ˜7F'BÛÚ""íÁFı7G&ñÊrÇíÁG&ñ“Çí«¬ÁV∆√∞¢6ˆÁ7Bv˜&µˆVÊB“á&WÊ&ˆGíÁv˜&µˆVÊBÛÚ""íÁFı7G&ñÊrÇíÁG&ñ“Çí«¬ÁV∆√∞¢ÚÚ7W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆S¢˜FñˆÊ¿¢6ˆÁ7B7W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆Uˆñ‚“á&WÊ&ˆGíÊ7W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆Rì∞¢6ˆÁ7BÜ47W7Fˆ÷W%6∆˜Efó6ñ&∆R“Ü7W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆Uˆñ‚””“G'VR«¬7W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆Uˆñ‚””“f«6R«¬7W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆Uˆñ‚””“wG'VRr«¬7W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆Uˆñ‚””“vf«6Rr«¬7W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆Uˆñ‚””“«¬7W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆Uˆñ‚””“«¬7W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆Uˆñ‚””“sr«¬7W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆Uˆñ‚””“srì∞¢6ˆÁ7B7W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆R“Ü47W7Fˆ÷W%6∆˜Efó6ñ&∆RÚÖ7G&ñÊrÜ7W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆Uˆñ‚íÁG&ñ“Çí””“sr«¬7G&ñÊrÜ7W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆Uˆñ‚íÁG&ñ“ÇíÁFÙ∆˜vW$66RÇí””“wG'VRrí¢ÁV∆√∞¢6ˆÁ7BÊWu77v˜&B“á&WÊ&ˆGíÊÊWu˜77v˜&BÛÚ""íÁFı7G&ñÊrÇì∞¢6ˆÁ7B6ˆÊfó&’77v˜&B“á&WÊ&ˆGíÊ6ˆÊfó&’˜77v˜&BÛÚ""íÁFı7G&ñÊrÇì∞†¢ñbÇFV6ÜÊñ6ñÂˆ6ˆFRí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.â^òûäﬁà~ò>äÆòéä>äæãäÆàÆòéã.àr"“ì∞†¢ñbáÜˆÊU&rbbıÂ≥”íµ¬“Çï«5◊≥b√#“BÚÁFW7BáÜˆÊU&ríí∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.ä>ãûâæòâÆâÆòâÆäﬁä>òŒò.â~ä>òNäòéânãûàâ^òûäﬁàr"“ì∞¢–†¢ñbÜV◊∆˜ñ÷VÁE˜GóRbb≤v6ˆ◊Áír¬w'FÊW"r¬v7W7Fˆ“r¬w7V6ñ≈ˆˆÊ«íu“ÊñÊ6«VFW2Ö7G&ñÊrÜV◊∆˜ñ÷VÁE˜GóRíÁFÙ∆˜vW$66RÇííí∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢&V◊∆˜ñ÷VÁE˜GóRâ^òûäﬁà~òâæò~âí6ˆ◊ÁíÚ'FÊW"Ú7W7Fˆ“Ú7V6ñ≈ˆˆÊ«í"“ì∞¢–†¢6ˆÁ7B6ˆ◊VÁ6FñˆÂˆ÷ˆFR“6ˆ◊VÁ6FñˆÂˆ÷ˆFUˆñ‚ÚˆÊ˜&‘6ˆ◊÷ˆFRÜ6ˆ◊VÁ6FñˆÂˆ÷ˆFUˆñ‚í¢ÁV∆√∞¢6ˆÁ7BFñ«ï˜vvUˆ÷˜VÁB“ÜFñ«ï˜vvUˆ÷˜VÁEˆñ„”÷ÁV∆¬«¬7G&ñÊrÜFñ«ï˜vvUˆ÷˜VÁEˆñ‚íÁG&ñ“Çì””“rríÚÁV∆¬¢ˆ÷ˆÊWíÜFñ«ï˜vvUˆ÷˜VÁEˆñ‚ì∞¢6ˆÁ7B÷ˆÁFÜ«ï˜6∆'ïˆ÷˜VÁB“Ü÷ˆÁFÜ«ï˜6∆'ïˆ÷˜VÁEˆñ„”÷ÁV∆¬«¬7G&ñÊrÜ÷ˆÁFÜ«ï˜6∆'ïˆ÷˜VÁEˆñ‚íÁG&ñ“Çì””“rríÚÁV∆¬¢ˆ÷ˆÊWíÜ÷ˆÁFÜ«ï˜6∆'ïˆ÷˜VÁEˆñ‚ì∞¢6ˆÁ7Bó4ÑÑ‘““á2í”‚ı‚Ö≥’∆G√%≥”5“ì•≥”U’∆BBÚÁFW7BÖ7G&ñÊrá7«¬rríì∞¢ñbáv˜&µ˜7F'Bbbó4ÑÑ‘“áv˜&µ˜7F'Bíí∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢'v˜&µ˜7F'Bâ^òûäﬁà~òâæò~âûä>ãûâæòâÆâ¢ÑÉ§‘“òàÆòéâíì£"“ì∞¢–¢ñbáv˜&µˆVÊBbbó4ÑÑ‘“áv˜&µˆVÊBíí∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢'v˜&µˆVÊBâ^òûäﬁà~òâæò~âûä>ãûâæòâÆâ¢ÑÉ§‘“òàÆòéâíÉ£"“ì∞¢–†¢ÚÚ&ˆfñ∆P¢6ˆÁ7BW'6ó7FVE&ˆfñ∆R“vóBW6W'EFV6ÜÊñ6ñÂ&ˆfñ∆Ráˆˆ¬¬∞¢W6W&Ê÷R¿¢FV6ÜÊñ6ñÂˆ6ˆFR¿¢gV∆≈ˆÊ÷R¿¢˜6óFñˆ‚¿¢ÜˆÊS¢ÜˆÊU&r¿¢V◊∆˜ñ÷VÁE˜GóR¿¢v˜&µ˜7F'B¿¢v˜&µˆVÊB¿¢7W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆S¢Ü47W7Fˆ÷W%6∆˜Efó6ñ&∆RÚ7W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆R¢ÁV∆¬¿¢6ˆ◊VÁ6FñˆÂˆ÷ˆFR¿¢Fñ«ï˜vvUˆ÷˜VÁB¿¢÷ˆÁFÜ«ï˜6∆'ïˆ÷˜VÁB¿¢“ì∞¢6ˆÁ7B&ˆfñ∆UW6W'B“≤&˜w3¢∑W'6ó7FVE&ˆfñ∆U“”∞†¢ÚÚ77v˜&BÜ˜FñˆÊ¬ê¢ñbÜÊWu77v˜&Bí∞¢ñbÜÊWu77v˜&B”“6ˆÊfó&’77v˜&Bí∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.ä.ã~âûä.ãâûä>äæãäÆò>äæäòéòNäòéâ^ä>à~àãâí"“ì∞¢–¢ñbÜÊWu77v˜&BÊ∆VÊwFÇ¬Bí∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.ä>äæãäÆò>äæäòéâ^òûäﬁà~ä.ã.ä~äﬁä.òéã.à~âûòûäﬁä"Bâ^ãä~äﬁãàäûä2"“ì∞¢–¢vóBˆˆ¬ÁVW'íÜUDDRV&∆ñ2ÁW6W'24UB77v˜&C“C"tÑU$RW6W&Ê÷S“C¬∑W6W&Ê÷R¬ÊWu77v˜&E“ì∞¢–†¢ÚÚFVfV7B3¢&WGW&‚FÜRW'6ó7FVB&V6˜&B6ÚFÜRF÷ñ‚Tí6‚fW&ñgíFÜR&VB÷&6∞¢ÚÚÜ7W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆RˆV◊∆˜ñ÷VÁE˜GóRí÷F6ÜW2vÜBóB7V&÷óGFVB&Vf˜&R&W˜'FñÊr7V66W72‡¢6ˆÁ7BW'6ó7FVB“&ˆfñ∆UW6W'BÁ&˜w5≥“«¬∑”∞¢&W2Êß6ˆ‚á∞¢ˆ≥¢G'VR¿¢FV6ÜÊñ6ñ„¢∞¢W6W&Ê÷S¢W'6ó7FVBÁW6W&Ê÷R«¬W6W&Ê÷R¿¢V◊∆˜ñ÷VÁE˜GóS¢W'6ó7FVBÊV◊∆˜ñ÷VÁE˜GóR«¬ÁV∆¬¿¢7W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆S¢W'6ó7FVBÊ7W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆R””“G'VP¢ÚG'VP¢¢áW'6ó7FVBÊ7W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆R””“f«6RÚf«6R¢ÁV∆¬í¿¢“¿¢“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Ç%UBF÷ñ‚FV6ÜÊñ6ñ‚W'&˜#¢"¬Rì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.âÆãâûâ~ãnàòNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞†¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	˙zíD‘î„¢FV6ÜÊñ6ñ‚6W'fñ6R÷G&óÇÑ˜Fñˆ‚"ê¢ÚÚ“àã>äæâûâNä~òéã"àÆòéã.à~àNâûòNäæâûä>ãâÆà~ã.âûâæä>ãòäâ~òNäæâí˛òäﬁä>òŒâæä>ãòäâ~òNäæâí˛ä~ãNâéã^ä^òûã.à~äﬁãòNä>òNâNòûâÆòûã.àp¢ÚÚ“FVfV«BÜÊÚ&V6˜&Bì¢∆∆˜r∆¬Ü&6∑v&B6ˆ◊Fñ&∆Rê¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶ÊvWBÇ"ˆF÷ñ‚˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜6W'fñ6R÷÷G&óÇ"¬&WVó&TF÷ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“7G&ñÊrá&WÁ&◊2ÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BW6W&Ê÷R¬÷G&óÖˆß6ˆ‚¬WFFVEˆ'í¬WFFVEˆ@¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜6W'fñ6Uˆ÷G&óÄ¢tÑU$RW6W&Ê÷S“C¿¢∑W6W&Ê÷U–¢ì∞¢ñbÇ"Á&˜w2«¬"Á&˜w2Ê∆VÊwFÇí∞¢&WGW&‚&W2Êß6ˆ‚á≤W6W&Ê÷R¬÷G&óÖˆß6ˆ„¢∑“¬WFFVEˆ'ì¢ÁV∆¬¬WFFVEˆC¢ÁV∆¬“ì∞¢–¢&WGW&‚&W2Êß6ˆ‚á"Á&˜w5≥“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÇttUB6W'fñ6R÷÷G&óÇW'&˜#¢r¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢~ò.äæä^âNäÆãNâ~âéãNòŒà~ã.âûà.äﬁà~àÆòéã.à~òNäòéäÆã>òä>ò~àÇr“ì∞¢–ß“ì∞†¶ÁWBÇ"ˆF÷ñ‚˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜6W'fñ6R÷÷G&óÇ"¬&WVó&TF÷ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“7G&ñÊrá&WÁ&◊2ÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7B÷G&óÖˆß6ˆ‚“&WÊ&ˆGìÚÊ÷G&óÖˆß6ˆ‚ÛÚ&WÊ&ˆGìÚÊ÷G&óÇÛÚ∑”∞¢ÚÚ÷ñÊñ÷¬f∆ñFFñˆ‚Üfñ¬÷˜V‚ì¢66WBˆ&¶V7BˆÊ«ê¢ñbÜ÷G&óÖˆß6ˆ‚”“ÁV∆¬«¬GóVˆb÷G&óÖˆß6ˆ‚”“vˆ&¶V7Br«¬'&íÊó4'&íÜ÷G&óÖˆß6ˆ‚íí∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢v÷G&óÖˆß6ˆ‚â^òûäﬁà~òâæò~âíˆ&¶V7Br“ì∞¢–¢6ˆÁ7BWFFVEˆ'í“7G&ñÊrá&WÚÊ7F˜#ÚÁW6W&Ê÷R«¬&WÚÊWFÉÚÁW6W&Ê÷R«¬vF÷ñ‚ríÁG&ñ“Çì∞¢vóBˆˆ¬ÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2ÁFV6ÜÊñ6ñÂ˜6W'fñ6Uˆ÷G&óÇáW6W&Ê÷R¬÷G&óÖˆß6ˆ‚¬WFFVEˆ'í¬WFFVEˆBê¢d≈TU2ÇC¬C#£¶ß6ˆÊ"¬C2¬‰ırÇíê¢Ù‚4Ù‰dƒî5BáW6W&Ê÷RíDÚUDDR4U@¢÷G&óÖˆß6ˆ‚“UÑ4≈TDTBÊ÷G&óÖˆß6ˆ‚¿¢WFFVEˆ'í“UÑ4≈TDTBÁWFFVEˆ'í¿¢WFFVEˆB“‰ırÇñ¿¢∑W6W&Ê÷R¬•4Ù‚Á7G&ñÊvñgíÜ÷G&óÖˆß6ˆ‚í¬WFFVEˆ'ï–¢ì∞¢&WGW&‚&W2Êß6ˆ‚á≤ˆ≥¢G'VR“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÇuUB6W'fñ6R÷÷G&óÇW'&˜#¢r¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢~âÆãâûâ~ãnàäÆãNâ~âéãNòŒà~ã.âûà.äﬁà~àÆòéã.à~òNäòéäÆã>òä>ò~àÇr“ì∞¢–ß“ì∞†¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	˙y(ﬂ	˘JrDT4É¢6W'fñ6R÷G&óÇÖ6V∆b‘6ˆÊfñrê¢ÚÚ“àÆòéã.à~äÆã.äã.ä>ânòä^ã~äﬁàòäﬁà~òNâNòûä~òéã"ä>ãâÆà~ã.âûäﬁãòNä2˛òäﬁä>òŒâæä>ãòäâ~òNäæâí˛ä~ãNâéã^ä^òûã.à~äﬁãòNä2éò>àÆòûàNãâNàä>äﬁà~äÆä^äﬁâ^äæâûòûã.ä^ãûààNòûã"ê¢ÚÚ“ânòûã.òNäòéâ^ãNòÆàäﬁãòNä>òä^ä"”‚òNäòéòäÆâNà~äÆä^äﬁâ^äæâûòûã.ä^ãûààNòûã"éâ^ã.ääÆòâæàê¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶ÊvWBÇr˜FV6Ç˜6W'fñ6R÷÷G&óÇr¬&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“&WÊVffV7FófSÚÁW6W&Ê÷S∞¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5B÷G&óÖˆß6ˆ‚e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜6W'fñ6Uˆ÷G&óÇtÑU$RW6W&Ê÷S“Cƒî‘ïB¿¢∑W6W&Ê÷U–¢ì∞¢6ˆÁ7B&˜r“á"Á&˜w2«¬µ“ï≥“«¬ÁV∆√∞¢&WGW&‚&W2Êß6ˆ‚á≤ˆ≥¢G'VR¬W6W&Ê÷R¬÷G&óÖˆß6ˆ„¢&˜sÚÊ÷G&óÖˆß6ˆ‚«¬∑““ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÇttUBFV6Ç6W'fñ6R÷÷G&óÇW'&˜#¢r¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢~ò.äæä^âNòNäòéäÆã>òä>ò~àÇr“ì∞¢–ß“ì∞†¶ÁWBÇr˜FV6Ç˜6W'fñ6R÷÷G&óÇr¬&WVó&UFV6ÜÊñ6ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“&WÊVffV7FófSÚÁW6W&Ê÷S∞¢6ˆÁ7B÷G&óÖˆß6ˆ‚“á&WÊ&ˆGíbb&WÊ&ˆGíÊ÷G&óÖˆß6ˆ‚íÚ&WÊ&ˆGíÊ÷G&óÖˆß6ˆ‚¢∑”∞¢ÚÚ÷ñÊñ÷¬f∆ñFFñˆ‚á6ÜRê¢6ˆÁ7Bó4ˆ&¢“ábí”‚bbbGóVˆbb””“vˆ&¶V7Brbb'&íÊó4'&íábì∞¢ñbÇó4ˆ&¢Ü÷G&óÖˆß6ˆ‚íí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢v÷G&óÖˆß6ˆ‚â^òûäﬁà~òâæò~âíˆ&¶V7Br“ì∞†¢vóBˆˆ¬ÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2ÁFV6ÜÊñ6ñÂ˜6W'fñ6Uˆ÷G&óÇáW6W&Ê÷R¬÷G&óÖˆß6ˆ‚¬WFFVEˆ'íê¢d≈TU2ÇC¬C"¬C2ê¢Ù‚4Ù‰dƒî5BáW6W&Ê÷RíDÚUDDR4U@¢÷G&óÖˆß6ˆ‚“UÑ4≈TDTBÊ÷G&óÖˆß6ˆ‚¿¢WFFVEˆ'í“UÑ4≈TDTBÁWFFVEˆ'í¿¢WFFVEˆB“5U%$TÂEıDî‘U5D’¿¢∑W6W&Ê÷R¬÷G&óÖˆß6ˆ‚¬W6W&Ê÷U–¢ì∞¢&WGW&‚&W2Êß6ˆ‚á≤ˆ≥¢G'VR“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÇuUBFV6Ç6W'fñ6R÷÷G&óÇW'&˜#¢r¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢~âÆãâûâ~ãnàòNäòéäÆã>òä>ò~àÇr“ì∞¢–ß“ì∞†¢ÚÚF÷ñ„¢FBˆ∆ó7B7V6ñ¬fñ∆&ñ∆óGí6∆˜G2W"FV6ÜÊñ6ñ‚ác"ê¶ÊvWBÇ"ˆF÷ñ‚˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜7V6ñ≈˜6∆˜G5˜c""¬&WVó&TF÷ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“á&WÁ&◊2ÁW6W&Ê÷R«¬""íÁFı7G&ñÊrÇì∞¢6ˆÁ7BFFR“á&WÁVW'íÊFFR«¬ÊWrFFRÇíÁFÙï4ı7G&ñÊrÇíÁ6∆ñ6RÉ√ííÁFı7G&ñÊrÇì∞¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5B6∆˜EˆñB¬6∆˜EˆFFR¬7F'E˜Fñ÷R¬VÊE˜Fñ÷R¬7&VFVEˆ@¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜7V6ñ≈˜6∆˜G5˜c ¢tÑU$RFV6ÜÊñ6ñÂ˜W6W&Ê÷S“C‰B6∆˜EˆFFS“C#£¶FFP¢ı$DU"%í7F'E˜Fñ÷R46¿¢∑W6W&Ê÷R¬FFU–¢ì∞¢&W2Êß6ˆ‚á≤W6W&Ê÷R¬FFR¬6∆˜G3¢"Á&˜w2“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.ò.äæä^âNäÆä^äﬁâ^âÓãNòäéäûòNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞†¶Á˜7BÇ"ˆF÷ñ‚˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜7V6ñ≈˜6∆˜G5˜c""¬&WVó&TF÷ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“á&WÁ&◊2ÁW6W&Ê÷R«¬""íÁFı7G&ñÊrÇì∞¢6ˆÁ7B6∆˜EˆFFR“á&WÊ&ˆGíÊFFR«¬&WÊ&ˆGíÁ6∆˜EˆFFR«¬ÊWrFFRÇíÁFÙï4ı7G&ñÊrÇíÁ6∆ñ6RÉ√ííÁFı7G&ñÊrÇì∞¢6ˆÁ7B7F'E˜Fñ÷U˜&r“á&WÊ&ˆGíÁ7F'E˜Fñ÷R«¬""íÁFı7G&ñÊrÇì∞¢6ˆÁ7BVÊE˜Fñ÷U˜&r“á&WÊ&ˆGíÊVÊE˜Fñ÷R«¬""íÁFı7G&ñÊrÇì∞¢ñbÇıÂ∆G≥√'”•∆G≥'“BÚÁFW7Bá7F'E˜Fñ÷U˜&rí«¬ıÂ∆G≥√'”•∆G≥'“BÚÁFW7BÜVÊE˜Fñ÷U˜&ríí∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.òä~ä^ã.òNäòéânãûàâ^òûäﬁàrÑÑÉ§‘“í"“ì∞¢–¢ÚÚÊ˜&÷∆ó¶RÑÉ§‘“ÜVÊE˜Fñ÷Ró26∆◊VBB#C£FÚfˆñBñÁf∆ñB•2FFR'6ñÊrê¢6ˆÁ7BÊ˜&““ÜÜÜ÷“¬∆∆˜s#Bí”‚∞¢6ˆÁ7B““7G&ñÊrÜÜÜ÷“íÊ÷F6ÇÇı‚Ö≥”ï◊≥√'“ì¢Ö≥”ï◊≥'“íBÚì∞¢ñbÇ“í&WGW&‚ÁV∆√∞¢∆WBÇ“ÁV÷&W"Ü’≥“ì∞¢∆WB÷““ÁV÷&W"Ü’≥%“ì∞¢ñbÇÁV÷&W"Êó4fñÊóFRÜÇí«¬ÁV÷&W"Êó4fñÊóFRÜ÷“íí&WGW&‚ÁV∆√∞¢ñbÜ÷“¬«¬÷“‚Síí&WGW&‚ÁV∆√∞¢ñbÜ∆∆˜s#Bí∞¢ñbÜÇ‚#Bí≤Ç“#C≤÷““≤–¢ñbÜÇ””“#Bbb÷“‚í≤÷““≤–¢“V«6R∞¢ñbÜÇ¬«¬Ç‚#2í&WGW&‚ÁV∆√∞¢–¢6ˆÁ7BB“Ü‚ì”Â7G&ñÊrÜ‚íÁE7F'BÉ"¬srì∞¢&WGW&‚G∑BÜÇó”¢G∑BÜ÷“ó÷∞¢”∞¢6ˆÁ7B7F'E˜Fñ÷R“Ê˜&“á7F'E˜Fñ÷U˜&r¬f«6Rì∞¢6ˆÁ7BVÊE˜Fñ÷R“Ê˜&“ÜVÊE˜Fñ÷U˜&r¬G'VRì∞¢ñbÇ7F'E˜Fñ÷R«¬VÊE˜Fñ÷Rí∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.òä~ä^ã.òNäòéânãûàâ^òûäﬁàrÑÑÉ§‘“í"“ì∞¢–¢ñbáFÙ÷ñ‚ÜVÊE˜Fñ÷Rí√“FÙ÷ñ‚á7F'E˜Fñ÷Ríí∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.òä~ä^ã.äÆãNòûâûäÆãéâNâ^òûäﬁà~äã.ààä~òéã.òä~ä^ã.òä>ãNòéä"“ì∞¢–¢vóBˆˆ¬ÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2ÁFV6ÜÊñ6ñÂ˜7V6ñ≈˜6∆˜G5˜c"áFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬6∆˜EˆFFR¬7F'E˜Fñ÷R¬VÊE˜Fñ÷Rê¢d≈TU2ÇC¬C#£¶FFR¬C2¬CBñ¿¢∑W6W&Ê÷R¬6∆˜EˆFFR¬7F'E˜Fñ÷R¬VÊE˜Fñ÷U–¢ì∞¢6ˆÁ6ˆ∆RÊ∆ˆrÇ%∂F÷ñÂ˜7V6ñ≈˜6∆˜E˜c%“"¬≤W6W&Ê÷R¬6∆˜EˆFFR¬7F'E˜Fñ÷R¬VÊE˜Fñ÷R“ì∞¢&W2Êß6ˆ‚á≤ˆ≥¢G'VR“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.òâÓãNòéääÆä^äﬁâ^âÓãNòäéäûòNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞†¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	¯¯RD‘î„¢WFFRFV6ÜÊñ6ñ‚&Ê≤Ö&V÷óV“&Ê≤6WBê¢ÚÚ“î’ı%DÂC¢6W'fW"◊6ñFRwV&BÜF÷ñ‚÷ˆÊ«íê¢ÚÚ“òNäòéàä>ãâ~â¢˜6óFñˆ‚òâNãNäÚòNäòéòâæä^ã^òéä.âí÷VÊñÊrà.äﬁàr&ˆ∆RòâNãNä¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶6ˆÁ7B$T‘ïT’ı$‰µ2“∞¢¢≤∂Wì¢&&VÁFñ6R"¬∆&V√¢$&VÁFñ6R"“¿¢#¢≤∂Wì¢'FV6ÜÊñ6ñ‚"¬∆&V√¢%FV6ÜÊñ6ñ‚"“¿¢3¢≤∂Wì¢'6VÊñ˜%˜FV6ÜÊñ6ñ‚"¬∆&V√¢%6VÊñ˜"FV6ÜÊñ6ñ‚"“¿¢C¢≤∂Wì¢'FV’ˆ∆VB"¬∆&V√¢%FV“∆VB"“¿¢S¢≤∂Wì¢&ÜVE˜7WW'fó6˜""¬∆&V√¢$ÜVB7WW'fó6˜""“¿ß”∞†¶ÁWBÇ"ˆF÷ñ‚˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜&Ê≤"¬&WVó&TF÷ñ‰f˜%&Ê≤¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“7G&ñÊrá&WÁ&◊2ÁW6W&Ê÷R«¬""íÁG&ñ“Çì∞¢6ˆÁ7B∆WfV¬“ÁV÷&W"á&WÊ&ˆGìÚÁ&Êµˆ∆WfV¬ì∞†¢ñbÇW6W&Ê÷Rí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢'W6W&Ê÷Räæã.ä""“ì∞¢ñbÇÁV÷&W"Êó4fñÊóFRÜ∆WfV¬í«¬∆WfV¬¬«¬∆WfV¬‚Rí∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢'&Êµˆ∆WfV¬â^òûäﬁà~äﬁä.ãûòéä>ãäæä~òéã.àr”R"“ì∞¢–†¢6ˆÁ7B&Ê≤“$T‘ïT’ı$‰µ5∂∆WfV≈”∞†¢vóBˆˆ¬ÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2áW6W&Ê÷R¬&Êµˆ∆WfV¬¬&Êµˆ∂Wíê¢d≈TU2ÇC¬C"¬C2ê¢Ù‚4Ù‰dƒî5BáW6W&Ê÷RíDÚUDDR4U@¢&Êµˆ∆WfV¬“UÑ4≈TDTBÁ&Êµˆ∆WfV¬¿¢&Êµˆ∂Wí“UÑ4≈TDTBÁ&Êµˆ∂Wí¿¢WFFVEˆB“5U%$TÂEıDî‘U5D’¿¢∑W6W&Ê÷R¬∆WfV¬¬&Ê≤Ê∂Wï–¢ì∞†¢&W2Êß6ˆ‚á≤ˆ≥¢G'VR¬W6W&Ê÷R¬&Êµˆ∆WfV√¢∆WfV¬¬&Êµˆ∂Wì¢&Ê≤Ê∂Wí¬&Êµˆ∆&V√¢&Ê≤Ê∆&V¬“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Ç%UBF÷ñ‚&Ê≤W'&˜#¢"¬Rì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.äﬁãâæòâNâ^òä>à~àNòŒòNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞††¶Á˜7BÇ"ˆF÷ñ‚˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜Ü˜FÚ"¬&WVó&TF÷ñÂ6W76ñˆ‚¬W∆ˆBÁ6ñÊv∆RÇ'Ü˜FÚ"í¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“&WÁ&◊2ÁW6W&Ê÷S∞¢ñbÇ&WÊfñ∆Rí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.òNäòéäã^òNâ˛ä^òŒä>ãûâ≤"“ì∞†¢ÚÚ)»R7F˜&RFV6ÜÊñ6ñ‚&ˆfñ∆RÜ˜FÚˆ‚6∆˜VFñÊ'íFÚ&WfVÁB∆˜72gFW"FW∆˜ê¢∆WBÜ˜Fı˜FÇ“ÁV∆√∞¢ñbÑ4ƒıTDî‰%ïÙT‰$ƒTBí∞¢6ˆÁ7BW“vóBW∆ˆEFV6Ö&ˆfñ∆UFÙ6∆˜VFñÊ'íá&WÊfñ∆R¬≤W6W&Ê÷R¬fˆ∆FW%7VffóÉ¢w&ˆfñ∆W2r“ì∞¢Ü˜Fı˜FÇ“WÚÁW&¬«¬ÁV∆√∞¢“V«6R∞¢Ü˜Fı˜FÇ“6fUW∆ˆFVDfñ∆Rá&WÊfñ∆R¬DT4Öı$ÙdîƒUÙDï"¬W6W&Ê÷Rì∞¢–¢vóBˆˆ¬ÁVW'íÄ¢UDDRV&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W24UBÜ˜Fı˜FÉ“C"¬WFFVEˆC‘5U%$TÂEıDî‘U5D’tÑU$RW6W&Ê÷S“C¿¢∑W6W&Ê÷R¬Ü˜Fı˜FÖ–¢ì∞†¢&W2Êß6ˆ‚á≤ˆ≥¢G'VR¬Ü˜Fı˜FÇ“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Ç%ı5BF÷ñ‚FV6ÇÜ˜FÚW'&˜#¢"¬Rì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.äﬁãâæò.äæä^âNä>ãûâæòNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞†¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	˘9ÇD‘î‚44ıTÂDî‰rÖÜ6R&VB÷ˆÊ«íê¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶gVÊ7Fñˆ‚ˆ÷6µÜˆÊRáÜˆÊRí∞¢6ˆÁ7B2“7G&ñÊráÜˆÊR«¬rríÁ&W∆6RÇıƒBˆr¬rrì∞¢ñbá2Ê∆VÊwFÇ¬rí&WGW&‚ÜˆÊRÚwááÇr¢rs∞¢&WGW&‚G∑2Á6∆ñ6RÉ¬2ó◊ááÇG∑2Á6∆ñ6RÇ”Bó÷∞ß–†¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊt6&BÜ∂Wí¬∆&V¬¬6˜VÁB“¬F˜F≈ˆ÷˜VÁB“ÁV∆¬¬FˆÊR“v&«VRr¬F&vWE˜F"“v˜fW'fñWrrí∞¢&WGW&‚≤∂Wí¬∆&V¬¬6˜VÁC¢ÁV÷&W"Ü6˜VÁB«¬í¬F˜F≈ˆ÷˜VÁC¢F˜F≈ˆ÷˜VÁB”“ÁV∆¬ÚÁV∆¬¢ˆ÷ˆÊWíáF˜F≈ˆ÷˜VÁBí¬7FGW5ˆ∂Wì¢FˆÊR¬F&vWE˜F"”∞ß–†¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊu&WfVÁVU7FGW2á&˜r“∑“í∞¢6ˆÁ7B&r“7G&ñÊrá&˜rÁñ÷VÁE˜7FGW2«¬&˜rÁ&u˜ñ÷VÁE˜7FGW2«¬rríÁG&ñ“ÇíÁFÙ∆˜vW$66RÇì∞¢ñbá&r””“wñBr«¬&˜rÁñEˆBí&WGW&‚wñBs∞¢ñbá&r””“w'Fñ¬rí&WGW&‚w'Fñ¬s∞¢&WGW&‚wVÁñBs∞ß–†¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊuFÜîFFRáb¬˜G2“∑“í∞¢ñbÇbí&WGW&‚r“s∞¢G'í∞¢&WGW&‚ÊWrFFRábíÁFÙ∆ˆ6∆TFFU7G&ñÊrÇwFÇ’DÇr¬≤Fñ÷U¶ˆÊS¢t6ñÙ&Êv∂ˆ≤r¬ñV#¢vÁV÷W&ñ2r¬÷ˆÁFÉ¢w6Ü˜'Br¬Fì¢vÁV÷W&ñ2r¬‚‚Ê˜G2“ì∞¢“6F6ÇÖÚí≤&WGW&‚7G&ñÊráb«¬r“rì≤–ß–¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊuñ˜WDGVTFFRáW&ñˆB“∑“í∞¢6ˆÁ7B&uGóR“7G&ñÊráW&ñˆBÁW&ñˆE˜GóR«¬rríÁG&ñ“Çì∞¢6ˆÁ7B7F'B“W&ñˆBÁW&ñˆE˜7F'BÚÊWrFFRáW&ñˆBÁW&ñˆE˜7F'Bí¢ÁV∆√∞¢ñbÇ7F'B«¬ÁV÷&W"Êó4Ê‚á7F'BÊvWEFñ÷RÇííí&WGW&‚ÁV∆√∞¢ÚÚW&ñˆE˜7F'Bà.äﬁà~à~ä~âBÛ#RàNã~äﬁàÆòéä~à~à~ã.âûàòéäﬁâûä~ãâûàéòéã.ä"ò>àÆòûòâNã~äﬁâí˛âæã^à.äﬁàrW&ñˆEˆVÊBòâæò~âûä~ãâûâ~ã^òéàéòéã.ä.àéä>ãNàp¢6ˆÁ7BVÊB“W&ñˆBÁW&ñˆEˆVÊBÚÊWrFFRáW&ñˆBÁW&ñˆEˆVÊBí¢7F'C∞¢6ˆÁ7B&6R“ÊWrFFRÜVÊBÁFÙ∆ˆ6∆U7G&ñÊrÇvV‚’U2r¬≤Fñ÷U¶ˆÊS¢t6ñÙ&Êv∂ˆ≤r“íì∞¢6ˆÁ7Bí“&6RÊvWDgV∆≈ñV"Çì∞¢6ˆÁ7B““&6RÊvWD÷ˆÁFÇÇì∞¢6ˆÁ7BFí“&uGóR””“s#RrÚ#R¢∞¢&WGW&‚ÊWrFFRÑFFRÂUD2áí¬“¬Fí¬¬¬íì∞ß–¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊuñ˜WD7WFˆfd∆&V¬áW&ñˆB“∑“í∞¢&WGW&‚àÆòéä~à~à~ã.âíGµˆ66˜VÁFñÊuFÜîFFRáW&ñˆBÁW&ñˆE˜7F'Bó““Gµˆ66˜VÁFñÊuFÜîFFRáW&ñˆBÁW&ñˆEˆVÊBó÷∞ß–¶7ñÊ2gVÊ7Fñˆ‚ˆ66˜VÁFñÊtÊWáDFˆ7V÷VÁDÊÚÜFˆ7V÷VÁEGóRí∞¢6ˆÁ7BGóR“7G&ñÊrÜFˆ7V÷VÁEGóR«¬rríÁG&ñ“Çì∞¢6ˆÁ7BÊ˜t&∂≤“ÊWrFFRÜÊWrFFRÇíÁFÙ∆ˆ6∆U7G&ñÊrÇvV‚’U2r¬≤Fñ÷U¶ˆÊS¢t6ñÙ&Êv∂ˆ≤r“íì∞¢6ˆÁ7BñV"“ÁV÷&W"ÜÊ˜t&∂≤ÊvWDgV∆≈ñV"Çíì∞¢6ˆÁ7B÷ˆÁFÇ“7G&ñÊrÜÊ˜t&∂≤ÊvWD÷ˆÁFÇÇí≤íÁE7F'BÉ"¬srì∞¢6ˆÁ7B&VfóÇ“á≤V˜FFñˆ„¢uBr¬ñÁfˆñ6S¢tîÂbr¬&V6VóC¢u$2r¬FÖˆñÁfˆñ6S¢uDÇr¬vóFÜÜˆ∆FñÊuˆ6W'C¢uuBr“ï∑GóU”∞¢ñbÇ&VfóÇí∞¢6ˆÁ7BR“ÊWrW'&˜"ÇtîÂdƒîEÙDÙ5T‘TÂEıEïRrì≤RÊ6ˆFR“tîÂdƒîEÙDÙ5T‘TÂEıEïRs≤Fá&˜rS∞¢–¢6ˆÁ7B“vóBˆˆ¬ÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2Ê66˜VÁFñÊuˆFˆ7V÷VÁE˜6WVVÊ6W2ÜFˆ7V÷VÁE˜GóR¬ñV"¬∆7EˆÁV÷&W"¬WFFVEˆBê¢d≈TU2ÇC¬C"√ƒ‰ırÇíê¢Ù‚4Ù‰dƒî5BÜFˆ7V÷VÁE˜GóR¬ñV"íDÚUDDR4UB∆7EˆÁV÷&W#÷66˜VÁFñÊuˆFˆ7V÷VÁE˜6WVVÊ6W2Ê∆7EˆÁV÷&W"≤¬WFFVEˆC‘‰ırÇê¢$UEU$‰î‰r∆7EˆÁV÷&W&¿¢∑GóR¬ñV%–¢ì∞¢6ˆÁ7B6W“7G&ñÊráÁ&˜w5≥”ÚÊ∆7EˆÁV÷&W"«¬íÁE7F'BÉB¬srì∞¢ñbáGóR””“wvóFÜÜˆ∆FñÊuˆ6W'Brí&WGW&‚G∑&Vfóá“G∑ñV'“G∂÷ˆÁFá“G∑6W÷∞¢&WGW&‚G∑&Vfóá““G∑ñV'““G∑6W÷∞ß–¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊuváD÷ˆÁFÑ∂Wîg&ˆ’W&ñˆBáW&ñˆB“∑“í∞¢6ˆÁ7BGVR“ˆ66˜VÁFñÊuñ˜WDGVTFFRáW&ñˆBì∞¢ñbÇGVR«¬ÁV÷&W"Êó4Ê‚ÜGVRÊvWEFñ÷RÇííí&WGW&‚rs∞¢6ˆÁ7B&∂≤“ÊWrFFRÜGVRÁFÙ∆ˆ6∆U7G&ñÊrÇvV‚’U2r¬≤Fñ÷U¶ˆÊS¢t6ñÙ&Êv∂ˆ≤r“íì∞¢&WGW&‚G∂&∂≤ÊvWDgV∆≈ñV"Çó““Gµ7G&ñÊrÜ&∂≤ÊvWD÷ˆÁFÇÇí≤íÁE7F'BÉ"¬sró÷∞ß–¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊuváD÷ˆÁFÑ∆&V¬Ü÷ˆÁFÑ∂Wíí∞¢6ˆÁ7B““7G&ñÊrÜ÷ˆÁFÑ∂Wí«¬rríÊ÷F6ÇÇı‚Ö∆G≥G“í“Ö∆G≥'“íBÚì∞¢ñbÇ“í&WGW&‚r“s∞¢6ˆÁ7BB“ÊWrFFRÑFFRÂUD2ÑÁV÷&W"Ü’≥“í¬ÁV÷&W"Ü’≥%“í“¬íì∞¢&WGW&‚BÁFÙ∆ˆ6∆TFFU7G&ñÊrÇwFÇ’DÇr¬≤Fñ÷U¶ˆÊS¢t6ñÙ&Êv∂ˆ≤r¬ñV#¢vÁV÷W&ñ2r¬÷ˆÁFÉ¢v∆ˆÊrr“ì∞ß–†¶7ñÊ2gVÊ7Fñˆ‚ˆVÁ7W&T66˜VÁFñÊu6WGFñÊw566ÜV÷Çí∞¢vóBˆˆ¬ÁVW'íÜ ¢5$TDRD$ƒRîb‰ıBUÑï5E2V&∆ñ2Ê66˜VÁFñÊu˜6WGFñÊw2Ä¢&∂Wí"DUÖB¿¢f«VUˆß6ˆ‚•4Ù‰"‰ıBÂTƒ¬DTdT≈Bw∑“s£¶ß6ˆÊ"¿¢WFFVEˆ'íDUÖB¿¢WFFVEˆBDî‘U5D’E¢DTdT≈B‰ırÇê¢ê¢ì∞¢vóBˆˆ¬ÁVW'íÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2Ê66˜VÁFñÊu˜6WGFñÊw2DB4Ù≈T‘‚îb‰ıBUÑï5E2&∂Wí"DUÖFì∞¢vóBˆˆ¬ÁVW'íÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2Ê66˜VÁFñÊu˜6WGFñÊw2DB4Ù≈T‘‚îb‰ıBUÑï5E2f«VUˆß6ˆ‚•4Ù‰"‰ıBÂTƒ¬DTdT≈Bw∑“s£¶ß6ˆÊ&ì∞¢vóBˆˆ¬ÁVW'íÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2Ê66˜VÁFñÊu˜6WGFñÊw2DB4Ù≈T‘‚îb‰ıBUÑï5E2WFFVEˆ'íDUÖFì∞¢vóBˆˆ¬ÁVW'íÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2Ê66˜VÁFñÊu˜6WGFñÊw2DB4Ù≈T‘‚îb‰ıBUÑï5E2WFFVEˆBDî‘U5D’E¢DTdT≈B‰ırÇñì∞¢ÚÚ6ˆ÷Rˆ∆FW"'Vñ∆G27&VFVB6WGFñÊuˆ∂WíñÁ7FVBˆb∂Wí‚6˜íóBf˜'v&BñbóBWÜó7G2‡¢vóBˆˆ¬ÁVW'íÜ ¢DÚB@¢$Ttî‡¢îbUÑï5E2Ä¢4TƒT5Be$Ù“ñÊf˜&÷FñˆÂ˜66ÜV÷Ê6ˆ«V÷Á0¢tÑU$RF&∆U˜66ÜV÷“wV&∆ñ2r‰BF&∆UˆÊ÷S“v66˜VÁFñÊu˜6WGFñÊw2r‰B6ˆ«V÷ÂˆÊ÷S“w6WGFñÊuˆ∂Wíp¢íDÑT‡¢UÑT5UDRuUDDRV&∆ñ2Ê66˜VÁFñÊu˜6WGFñÊw24UB&∂Wí"“6WGFñÊuˆ∂WítÑU$R&∂Wí"ï2ÂTƒ¬‰B6WGFñÊuˆ∂Wíï2‰ıBÂTƒ¬s∞¢T‰Bîc∞¢T‰BBC∞¢ì∞ß–†¶7ñÊ2gVÊ7Fñˆ‚ˆVÁ7W&UFV6ÜÊñ6ñÂFÖ&ˆfñ∆U66ÜV÷Ü6∆ñVÁD˜%ˆˆ¬“ˆˆ¬í∞¢6ˆÁ7B“á7¬¬&◊2í”‚6∆ñVÁD˜%ˆˆ¬ÁVW'íá7¬¬&◊2ì∞¢vóBÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2DB4Ù≈T‘‚îb‰ıBUÑï5E2gV∆≈ˆÊ÷RDUÖFì∞¢vóBÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2DB4Ù≈T‘‚îb‰ıBUÑï5E2FÖˆñBDUÖFì∞¢vóBÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2DB4Ù≈T‘‚îb‰ıBUÑï5E2FÖˆFG&W72DUÖFì∞¢vóBÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2DB4Ù≈T‘‚îb‰ıBUÑï5E2FÖˆ'&Ê6ÇDUÖFì∞¢vóBÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2DB4Ù≈T‘‚îb‰ıBUÑï5E2váEˆñÊ6ˆ÷U˜GóRDUÖBDTdT≈B~àNòéã.âÆä>ãNàã.ä2˛àNòéã.àéòûã.à~â~ã>à.äﬁàrâ^ã.ääã.â^ä>ã"CÉÇívì∞¢vóBÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2DB4Ù≈T‘‚îb‰ıBUÑï5E2váEˆFVfV«E˜&FRÂT‘U$î2ÉR√"íDTdT≈B6ì∞¢vóBÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2DB4Ù≈T‘‚îb‰ıBUÑï5E2FÖ˜&ˆfñ∆U˜7FGW2DUÖBDTdT≈BvÊ˜E˜7V&÷óGFVBvì∞¢vóBÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2DB4Ù≈T‘‚îb‰ıBUÑï5E2FÖ˜&ˆfñ∆U˜&WfñWvVEˆ'íDUÖFì∞¢vóBÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2DB4Ù≈T‘‚îb‰ıBUÑï5E2FÖ˜&ˆfñ∆U˜&WfñWvVEˆBDî‘U5D’E¶ì∞¢vóBÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2DB4Ù≈T‘‚îb‰ıBUÑï5E2FÖ˜&ˆfñ∆UˆÊ˜FRDUÖFì∞¢vóBÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2DB4Ù≈T‘‚îb‰ıBUÑï5E2WFFVEˆBDî‘U5D’E¢DTdT≈B‰ırÇñì∞¢vóBÜ ¢5$TDRD$ƒRîb‰ıBUÑï5E2V&∆ñ2ÁFV6ÜÊñ6ñÂ˜FÖ˜&ˆfñ∆U˜&WVW7G2Ä¢ñB$îu4U$î¬$î‘%í¥Uí¿¢W6W&Ê÷RDUÖB‰ıBÂTƒ¬¿¢gV∆≈ˆÊ÷RDUÖB¿¢FÖˆñBDUÖB¿¢FÖˆFG&W72DUÖB¿¢FÖˆ'&Ê6ÇDUÖB¿¢váEˆñÊ6ˆ÷U˜GóRDUÖB¿¢váEˆFVfV«E˜&FRÂT‘U$î2ÉR√"íDTdT≈B2¿¢7FGW2DUÖB‰ıBÂTƒ¬DTdT≈BwVÊFñÊrr¿¢&WVW7FVEˆBDî‘U5D’E¢DTdT≈B‰ırÇí¿¢&WfñWvVEˆ'íDUÖB¿¢&WfñWvVEˆBDî‘U5D’E¢¿¢F÷ñÂˆÊ˜FRDUÖ@¢ê¢ì∞¢vóBÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2ÁFV6ÜÊñ6ñÂ˜FÖ˜&ˆfñ∆U˜&WVW7G2DB4Ù≈T‘‚îb‰ıBUÑï5E2W6W&Ê÷RDUÖFì∞¢vóBÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2ÁFV6ÜÊñ6ñÂ˜FÖ˜&ˆfñ∆U˜&WVW7G2DB4Ù≈T‘‚îb‰ıBUÑï5E2gV∆≈ˆÊ÷RDUÖFì∞¢vóBÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2ÁFV6ÜÊñ6ñÂ˜FÖ˜&ˆfñ∆U˜&WVW7G2DB4Ù≈T‘‚îb‰ıBUÑï5E2FÖˆñBDUÖFì∞¢vóBÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2ÁFV6ÜÊñ6ñÂ˜FÖ˜&ˆfñ∆U˜&WVW7G2DB4Ù≈T‘‚îb‰ıBUÑï5E2FÖˆFG&W72DUÖFì∞¢vóBÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2ÁFV6ÜÊñ6ñÂ˜FÖ˜&ˆfñ∆U˜&WVW7G2DB4Ù≈T‘‚îb‰ıBUÑï5E2FÖˆ'&Ê6ÇDUÖFì∞¢vóBÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2ÁFV6ÜÊñ6ñÂ˜FÖ˜&ˆfñ∆U˜&WVW7G2DB4Ù≈T‘‚îb‰ıBUÑï5E2váEˆñÊ6ˆ÷U˜GóRDUÖFì∞¢vóBÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2ÁFV6ÜÊñ6ñÂ˜FÖ˜&ˆfñ∆U˜&WVW7G2DB4Ù≈T‘‚îb‰ıBUÑï5E2váEˆFVfV«E˜&FRÂT‘U$î2ÉR√"íDTdT≈B6ì∞¢vóBÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2ÁFV6ÜÊñ6ñÂ˜FÖ˜&ˆfñ∆U˜&WVW7G2DB4Ù≈T‘‚îb‰ıBUÑï5E27FGW2DUÖBDTdT≈BwVÊFñÊrvì∞¢vóBÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2ÁFV6ÜÊñ6ñÂ˜FÖ˜&ˆfñ∆U˜&WVW7G2DB4Ù≈T‘‚îb‰ıBUÑï5E2&WVW7FVEˆBDî‘U5D’E¢DTdT≈B‰ırÇñì∞¢vóBÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2ÁFV6ÜÊñ6ñÂ˜FÖ˜&ˆfñ∆U˜&WVW7G2DB4Ù≈T‘‚îb‰ıBUÑï5E2&WfñWvVEˆ'íDUÖFì∞¢vóBÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2ÁFV6ÜÊñ6ñÂ˜FÖ˜&ˆfñ∆U˜&WVW7G2DB4Ù≈T‘‚îb‰ıBUÑï5E2&WfñWvVEˆBDî‘U5D’E¶ì∞¢vóBÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2ÁFV6ÜÊñ6ñÂ˜FÖ˜&ˆfñ∆U˜&WVW7G2DB4Ù≈T‘‚îb‰ıBUÑï5E2F÷ñÂˆÊ˜FRDUÖFì∞¢vóBÜ5$TDRî‰DUÇîb‰ıBUÑï5E2ñGÖ˜FV6Ö˜FÖ˜&ˆfñ∆U˜&WVW7G5˜7FGW5ˆ7&VFVBÙ‚V&∆ñ2ÁFV6ÜÊñ6ñÂ˜FÖ˜&ˆfñ∆U˜&WVW7G2á7FGW2¬&WVW7FVEˆBDU42ñì∞ß–††¶7ñÊ2gVÊ7Fñˆ‚ˆVÁ7W&T66˜VÁFñÊt6ˆ◊Áï6WGFñÊw566ÜV÷Çí∞¢ÚÚFVFñ6FVB6ñÊv∆R◊&˜r•4Ù‚F&∆Rf˜"6ˆ◊ÁíFˆ7V÷VÁB6WGFñÊw2‡¢ÚÚFÜó2fˆñG2fñ«W&W2g&ˆ“ˆ∆FW"&ˆGV7Fñˆ‚66˜VÁFñÊu˜6WGFñÊw266ÜV÷0¢ÚÚFÜBvW&R7&VFVBvóFÜ˜WB&∂Wí"6ˆ«V÷‚‡¢vóBˆˆ¬ÁVW'íÜ ¢5$TDRD$ƒRîb‰ıBUÑï5E2V&∆ñ2Ê66˜VÁFñÊuˆ6ˆ◊Áï˜6WGFñÊw2Ä¢ñBîÂDTtU"$î‘%í¥UíDTdT≈B¿¢f«VUˆß6ˆ‚•4Ù‰"‰ıBÂTƒ¬DTdT≈Bw∑“s£¶ß6ˆÊ"¿¢WFFVEˆ'íDUÖB¿¢WFFVEˆBDî‘U5D’E¢DTdT≈B‰ırÇê¢ê¢ì∞¢vóBˆˆ¬ÁVW'íÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2Ê66˜VÁFñÊuˆ6ˆ◊Áï˜6WGFñÊw2DB4Ù≈T‘‚îb‰ıBUÑï5E2f«VUˆß6ˆ‚•4Ù‰"‰ıBÂTƒ¬DTdT≈Bw∑“s£¶ß6ˆÊ&ì∞¢vóBˆˆ¬ÁVW'íÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2Ê66˜VÁFñÊuˆ6ˆ◊Áï˜6WGFñÊw2DB4Ù≈T‘‚îb‰ıBUÑï5E2WFFVEˆ'íDUÖFì∞¢vóBˆˆ¬ÁVW'íÜ≈DU"D$ƒRîbUÑï5E2V&∆ñ2Ê66˜VÁFñÊuˆ6ˆ◊Áï˜6WGFñÊw2DB4Ù≈T‘‚îb‰ıBUÑï5E2WFFVEˆBDî‘U5D’E¢DTdT≈B‰ırÇñì∞ß–†¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊtFVfV«D6ˆ◊Áï6WGFñÊw2Çí∞¢&WGW&‚∞¢6ˆ◊ÁïˆÊ÷S¢t6ˆ∆GvñÊFf∆˜ró"6W'fñ6W2r¿¢FÖˆñC¢rr¿¢'&Ê6É¢~äÆã>âûãàà~ã.âûò>äæàﬁòÇr¿¢FG&W73¢s#2ÛcâbÓâÓãnòéà~äãRSòà.ä~à~âÆã.à~àéã.àòà.â^âÓä>ãò.à.âûàràä>ãéà~òâ~âÓäÚ#cr¿¢ÜˆÊS¢sìÇ”Ésr”s3#r¿¢6ñvÊW%ˆÊ÷S¢~âûã.ä"äÆãéâ~âéãNâÓà~äûò¬äéä>ã^ä~ã.ä>ãNâûâ~ä>ò¬r¿¢6ñvÊW%˜˜6óFñˆ„¢~âŒãûòûäã^äﬁã>âûã.àéä^à~âûã.är¿¢∆ˆvı˜W&√¢rˆ∆ˆvÚÁÊrr¿¢6ñvÊGW&U˜W&√¢rˆ76WG2˜6ñvÊGW&W2ˆ˜vÊW"◊6ñvÊGW&R◊G&Á7&VÁBÁÊrr¿¢7F◊˜W&√¢rr¿¢fE˜&FS¢r¿¢váE˜&FS¢2¿¢fˆ˜FW%ˆÊ˜FS¢rr¿¢&ÊµˆñÊfÛ¢rr¿¢”∞ß–†¶gVÊ7Fñˆ‚ˆ÷W&vT66˜VÁFñÊt6ˆ◊Áï6WGFñÊw2áb“∑“í∞¢6ˆÁ7BB“ˆ66˜VÁFñÊtFVfV«D6ˆ◊Áï6WGFñÊw2Çì∞¢&WGW&‚∞¢‚‚ÊB¿¢‚‚‚áb«¬∑“í¿¢6ˆ◊ÁïˆÊ÷S¢7G&ñÊrábÊ6ˆ◊ÁïˆÊ÷R«¬BÊ6ˆ◊ÁïˆÊ÷RíÁG&ñ“Çí«¬BÊ6ˆ◊ÁïˆÊ÷R¿¢FÖˆñC¢7G&ñÊrábÁFÖˆñB«¬rríÁG&ñ“Çí¿¢'&Ê6É¢7G&ñÊrábÊ'&Ê6Ç«¬BÊ'&Ê6ÇíÁG&ñ“Çí«¬BÊ'&Ê6Ç¿¢FG&W73¢7G&ñÊrábÊFG&W72«¬BÊFG&W72íÁG&ñ“Çí«¬BÊFG&W72¿¢ÜˆÊS¢7G&ñÊrábÁÜˆÊR«¬BÁÜˆÊRíÁG&ñ“Çí«¬BÁÜˆÊR¿¢6ñvÊW%ˆÊ÷S¢7G&ñÊrábÁ6ñvÊW%ˆÊ÷R«¬BÁ6ñvÊW%ˆÊ÷RíÁG&ñ“Çí«¬BÁ6ñvÊW%ˆÊ÷R¿¢6ñvÊW%˜˜6óFñˆ„¢7G&ñÊrábÁ6ñvÊW%˜˜6óFñˆ‚«¬BÁ6ñvÊW%˜˜6óFñˆ‚íÁG&ñ“Çí«¬BÁ6ñvÊW%˜˜6óFñˆ‚¿¢∆ˆvı˜W&√¢7G&ñÊrábÊ∆ˆvı˜W&¬«¬BÊ∆ˆvı˜W&¬íÁG&ñ“Çí«¬BÊ∆ˆvı˜W&¬¿¢6ñvÊGW&U˜W&√¢7G&ñÊrábÁ6ñvÊGW&U˜W&¬«¬BÁ6ñvÊGW&U˜W&¬íÁG&ñ“Çí«¬BÁ6ñvÊGW&U˜W&¬¿¢7F◊˜W&√¢7G&ñÊrábÁ7F◊˜W&¬«¬rríÁG&ñ“Çí¿¢fE˜&FS¢ˆ÷ˆÊWíábÁfE˜&FR”“ÁV∆¬ÚBÁfE˜&FR¢bÁfE˜&FRí¿¢váE˜&FS¢ˆ÷ˆÊWíábÁváE˜&FR”“ÁV∆¬ÚBÁváE˜&FR¢bÁváE˜&FRí¿¢fˆ˜FW%ˆÊ˜FS¢7G&ñÊrábÊfˆ˜FW%ˆÊ˜FR«¬rríÁG&ñ“Çí¿¢&ÊµˆñÊfÛ¢7G&ñÊrábÊ&ÊµˆñÊfÚ«¬rríÁG&ñ“Çí¿¢”∞ß–†¶7ñÊ2gVÊ7Fñˆ‚ˆvWD66˜VÁFñÊu6WGFñÊw2Çí∞¢6ˆÁ7BFVfV«G2“ˆ66˜VÁFñÊtFVfV«D6ˆ◊Áï6WGFñÊw2Çì∞¢G'í∞¢vóBˆVÁ7W&T66˜VÁFñÊt6ˆ◊Áï6WGFñÊw566ÜV÷Çì∞¢6ˆÁ7B“vóBˆˆ¬ÁVW'íÜ4TƒT5Bf«VUˆß6ˆ‚e$Ù“V&∆ñ2Ê66˜VÁFñÊuˆ6ˆ◊Áï˜6WGFñÊw2tÑU$RñC”ƒî‘ïBì∞¢&WGW&‚ˆ÷W&vT66˜VÁFñÊt6ˆ◊Áï6WGFñÊw2áÁ&˜w5≥”ÚÁf«VUˆß6ˆ‚«¬FVfV«G2ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Çt44ıTÂDî‰uÙ4Ù’Âïı4UEDî‰u5ÙtUEÙdƒƒ$4≤r¬SÚÊ÷W76vR«¬Rì∞¢&WGW&‚FVfV«G3∞¢–ß–†¶7ñÊ2gVÊ7Fñˆ‚ˆ66˜VÁFñÊu6fUW∆ˆFVD76WBÜfñ∆R¬fˆ∆FW"“w6WGFñÊw2rí∞¢ñbÇfñ∆R«¬fñ∆RÊ'VffW"í&WGW&‚rs∞¢6ˆÁ7BV&∆ñ4ñB“7vbˆ66˜VÁFñÊrÚG∂fˆ∆FW'“ÚG¥FFRÊÊ˜rÇó““G∂7'óFÚÁ&ÊFˆ‘'óFW2ÉBíÁFı7G&ñÊrÇvÜWÇró÷∞¢G'í∞¢6ˆÁ7BW“vóB6∆˜VFñÊ'ïW∆ˆD'VffW"á≤'VffW#¢fñ∆RÊ'VffW"¬÷ñ÷WGóS¢fñ∆RÊ÷ñ÷WGóR«¬vñ÷vRˆßVrr¬fˆ∆FW#¢7vbˆ66˜VÁFñÊrÚG∂fˆ∆FW'÷¬V&∆ñ4ñB¬G&Á6f˜&÷Fñˆ„¢v5ˆ∆ñ÷óB«uÛC˜ˆWFÚˆeˆWFÚr“ì∞¢&WGW&‚WÁ6V7W&U˜W&¬«¬WÁW&¬«¬rs∞¢“6F6ÇÜRí∞¢6ˆÁ7BFó"“FÇÊ¶ˆñ‚ÖıˆFó&Ê÷R¬wW∆ˆG2r¬v66˜VÁFñÊrr¬fˆ∆FW"ì∞¢g2Ê÷∂Fó%7ñÊ2ÜFó"¬≤&V7W'6ófS¢G'VR“ì∞¢6ˆÁ7BWáB“FÇÊWáFÊ÷RÜfñ∆RÊ˜&ñvñÊ∆Ê÷R«¬rrí«¬rÊßrs∞¢6ˆÁ7B6fTÊ÷R“G¥FFRÊÊ˜rÇó““G∂7'óFÚÁ&ÊFˆ‘'óFW2ÉBíÁFı7G&ñÊrÇvÜWÇró“G∂WáG÷∞¢g2Áw&óFTfñ∆U7ñÊ2áFÇÊ¶ˆñ‚ÜFó"¬6fTÊ÷Rí¬fñ∆RÊ'VffW"ì∞¢&WGW&‚˜W∆ˆG2ˆ66˜VÁFñÊrÚG∂fˆ∆FW'“ÚG∑6fTÊ÷W÷∞¢–ß–†¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊu6WGFñÊw4g&ˆ‘&ˆGíÜ&ˆGí“∑“¬7W'&VÁB“∑“í∞¢6ˆÁ7Bñ6≤“Ü≤¬FVc“rrí”‚7G&ñÊrÜ&ˆGï∂µ“ÛÚ7W'&VÁE∂µ“ÛÚFVbíÁG&ñ“Çì∞¢&WGW&‚∞¢6ˆ◊ÁïˆÊ÷S¢ñ6≤Çv6ˆ◊ÁïˆÊ÷Rr¬t6ˆ∆GvñÊFf∆˜ró"6W'fñ6W2rí¿¢FÖˆñC¢ñ6≤ÇwFÖˆñBrí¿¢'&Ê6É¢ñ6≤Çv'&Ê6Çr¬~äÆã>âûãàà~ã.âûò>äæàﬁòÇrí¿¢FG&W73¢ñ6≤ÇvFG&W72r¬s#2ÛcâbÓâÓãnòéà~äãRSòà.ä~à~âÆã.à~àéã.àòà.â^âÓä>ãò.à.âûàràä>ãéà~òâ~âÓäÚ#crí¿¢ÜˆÊS¢ñ6≤ÇwÜˆÊRr¬sìÇ”Ésr”s3#rí¿¢6ñvÊW%ˆÊ÷S¢ñ6≤Çw6ñvÊW%ˆÊ÷Rr¬~âûã.ä"äÆãéâ~âéãNâÓà~äûò¬äéä>ã^ä~ã.ä>ãNâûâ~ä>ò¬rí¿¢6ñvÊW%˜˜6óFñˆ„¢ñ6≤Çw6ñvÊW%˜˜6óFñˆ‚r¬~âŒãûòûäã^äﬁã>âûã.àéä^à~âûã.ärí¿¢fE˜&FS¢ˆ÷ˆÊWíÜ&ˆGíÁfE˜&FRÛÚ7W'&VÁBÁfE˜&FRÛÚrí¿¢váE˜&FS¢ˆ÷ˆÊWíÜ&ˆGíÁváE˜&FRÛÚ7W'&VÁBÁváE˜&FRÛÚ2í¿¢fˆ˜FW%ˆÊ˜FS¢ñ6≤Çvfˆ˜FW%ˆÊ˜FRrí¿¢&ÊµˆñÊfÛ¢ñ6≤Çv&ÊµˆñÊfÚrí¿¢ÚÚ∂VWWÜó7FñÊrW∆ˆFVB76WG2vÜV‚FÜRf˜&“6VÊG2V◊GíU$¬fñV∆G2‡¢ÚÚW6W'26Ü˜V∆BÊ˜B∆˜6R∆ˆvÚ˜6ñvÊGW&R˜7F◊'í6ñ◊«í6fñÊr˜FÜW"6WGFñÊw2‡¢∆ˆvı˜W&√¢7G&ñÊrÜ&ˆGíÊ∆ˆvı˜W&¬ÛÚrríÁG&ñ“Çí«¬7W'&VÁBÊ∆ˆvı˜W&¬«¬rˆ∆ˆvÚÁÊrr¿¢6ñvÊGW&U˜W&√¢7G&ñÊrÜ&ˆGíÁ6ñvÊGW&U˜W&¬ÛÚrríÁG&ñ“Çí«¬7W'&VÁBÁ6ñvÊGW&U˜W&¬«¬rˆ76WG2˜6ñvÊGW&W2ˆ˜vÊW"◊6ñvÊGW&R◊G&Á7&VÁBÁÊrr¿¢7F◊˜W&√¢7G&ñÊrÜ&ˆGíÁ7F◊˜W&¬ÛÚrríÁG&ñ“Çí«¬7W'&VÁBÁ7F◊˜W&¬«¬rr¿¢”∞ß–†¶7ñÊ2gVÊ7Fñˆ‚ˆ66˜VÁFñÊtvWEFV6ÖFÖ&ˆfñ∆RáW6W&Ê÷Rí∞¢vóBˆVÁ7W&UFV6ÜÊñ6ñÂFÖ&ˆfñ∆U66ÜV÷Çì∞¢6ˆÁ7BFV6Ç“7G&ñÊráW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢ñbÇFV6Çí&WGW&‚ÁV∆√∞¢6ˆÁ7B“vóBˆˆ¬ÁVW'íÄ¢4TƒT5B4ÙƒU44RáÁW6W&Ê÷R¬RÁW6W&Ê÷R¬Cí2W6W&Ê÷R¿¢4ÙƒU44RÑÂTƒƒîbáÊgV∆≈ˆÊ÷R¬rrí¬ÂTƒƒîbáRÊgV∆≈ˆÊ÷R¬rrí¬ÁW6W&Ê÷R¬RÁW6W&Ê÷R¬Cí2gV∆≈ˆÊ÷R¿¢4ÙƒU44RáÁÜˆÊR¬rrí2ÜˆÊR¿¢4ÙƒU44RáÁFÖˆñB¬rrí2FÖˆñB¿¢4ÙƒU44RáÁFÖˆFG&W72¬rrí2FÖˆFG&W72¿¢4ÙƒU44RáÁFÖˆ'&Ê6Ç¬rrí2FÖˆ'&Ê6Ç¿¢4ÙƒU44RáÁváEˆñÊ6ˆ÷U˜GóR¬~àNòéã.âÆä>ãNàã.ä2˛àNòéã.àéòûã.à~â~ã>à.äﬁàrâ^ã.ääã.â^ä>ã"CÉÇírí2váEˆñÊ6ˆ÷U˜GóR¿¢4ÙƒU44RáÁváEˆFVfV«E˜&FR√2ì£¶ÁV÷W&ñ22váEˆFVfV«E˜&FR¿¢4ÙƒU44RáÁFÖ˜&ˆfñ∆U˜7FGW2¬vÊ˜E˜7V&÷óGFVBrí2FÖ˜&ˆfñ∆U˜7FGW2¿¢ÁFÖ˜&ˆfñ∆U˜&WfñWvVEˆ'í¿¢ÁFÖ˜&ˆfñ∆U˜&WfñWvVEˆB¿¢ÁFÖ˜&ˆfñ∆UˆÊ˜FP¢e$Ù“Ö4TƒT5BC£ßFWáB2W6W&Ê÷Rí6VV@¢ƒTeB§Ùî‚V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2Ù‚ƒıtU"áÁW6W&Ê÷Rì‘ƒıtU"á6VVBÁW6W&Ê÷Rê¢ƒTeB§Ùî‚V&∆ñ2ÁW6W'2RÙ‚ƒıtU"áRÁW6W&Ê÷Rì‘ƒıtU"á6VVBÁW6W&Ê÷Rê¢ƒî‘ïB¿¢∑FV6Ö–¢ì∞¢6ˆÁ7B&˜r“Á&˜w5≥“«¬≤W6W&Ê÷S¢FV6Ç¬gV∆≈ˆÊ÷S¢FV6Ç¬FÖˆñC¢rr¬FÖˆFG&W73¢rr¬FÖˆ'&Ê6É¢rr¬váEˆñÊ6ˆ÷U˜GóS¢~àNòéã.âÆä>ãNàã.ä2˛àNòéã.àéòûã.à~â~ã>à.äﬁàrâ^ã.ääã.â^ä>ã"CÉÇír¬váEˆFVfV«E˜&FS¢2¬FÖ˜&ˆfñ∆U˜7FGW3¢vÊ˜E˜7V&÷óGFVBr”∞¢6ˆÁ7B÷ó76ñÊr“µ”∞¢ñbÇ7G&ñÊrá&˜rÊgV∆≈ˆÊ÷R«¬rríÁG&ñ“Çíí÷ó76ñÊrÁW6ÇÇ~àÆã~òéäﬁàÆòéã.àr˛âŒãûòûä>ãâÆòà~ãNâírì∞¢ñbÇ7G&ñÊrá&˜rÁFÖˆñB«¬rríÁG&ñ“Çíí÷ó76ñÊrÁW6ÇÇ~òä^à.âæä>ãàéã>â^ãä~âŒãûòûòäÆã^ä.äã.äûãR˛âÆãâ^ä>âæä>ãàÆã.àÆâírì∞¢ñbÇ7G&ñÊrá&˜rÁFÖˆFG&W72«¬rríÁG&ñ“Çíí÷ó76ñÊrÁW6ÇÇ~â~ã^òéäﬁä.ãûòéâŒãûòûä>ãâÆòà~ãNâírì∞¢&WGW&‚≤‚‚Á&˜r¬÷ó76ñÊuˆfñV∆G3¢÷ó76ñÊr¬ó5ˆ6ˆ◊∆WFS¢÷ó76ñÊrÊ∆VÊwFÇ””“”∞ß–¶7ñÊ2gVÊ7Fñˆ‚ˆ66˜VÁFñÊuñ˜WDñG4f˜%váD÷ˆÁFÇáW&ñˆBí∞¢6ˆÁ7B÷ˆÁFÑ∂Wí“ˆ66˜VÁFñÊuváD÷ˆÁFÑ∂Wîg&ˆ’W&ñˆBáW&ñˆBì∞¢ñbÇ÷ˆÁFÑ∂Wíí&WGW&‚µ”∞¢6ˆÁ7B“vóBˆˆ¬ÁVW'íÄ¢4TƒT5Bñ˜WEˆñB¬W&ñˆE˜GóR¬W&ñˆE˜7F'B¬W&ñˆEˆVÊB¬7FGW0¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜ñ˜WE˜W&ñˆG0¢ı$DU"%íW&ñˆE˜7F'BDU42¬ñ˜WEˆñBDU40¢ƒî‘ïBS ¢ì∞¢&WGW&‚áÁ&˜w2«¬µ“íÊfñ«FW"á”‚ˆ66˜VÁFñÊuváD÷ˆÁFÑ∂Wîg&ˆ’W&ñˆBáí””“÷ˆÁFÑ∂WííÊ÷á”‚Áñ˜WEˆñBì∞ß–¶7ñÊ2gVÊ7Fñˆ‚ˆ66˜VÁFñÊt÷ˆÁFÜ«ïváD&6Rá≤ñ˜WEˆñB¬FV6ÜÊñ6ñÂ˜W6W&Ê÷R“í∞¢6ˆÁ7BW&ñˆB“vóBˆvWEñ˜WEW&ñˆBáñ˜WEˆñBì∞¢ñbÇW&ñˆBí∞¢6ˆÁ7BR“ÊWrW'&˜"ÇuîıUEÙ‰ıEÙdıT‰Brì≤RÊ6ˆFR“uîıUEÙ‰ıEÙdıT‰Bs≤Fá&˜rS∞¢–¢6ˆÁ7Bñ˜WDñG2“vóBˆ66˜VÁFñÊuñ˜WDñG4f˜%váD÷ˆÁFÇáW&ñˆBì∞¢∆WBñÊ6ˆ÷UñB“¬ñÊ6ˆ÷T67'VVB“¬¶ˆ$6˜VÁB“∞¢6ˆÁ7B6˜W&6U&˜w2“µ”∞¢f˜"Ü6ˆÁ7BñBˆbñ˜WDñG2í∞¢6ˆÁ7B&˜w2“vóBˆ66˜VÁFñÊu7F˜&VEñ˜WEFV6Ö&˜w2áñBì∞¢6ˆÁ7B"“á&˜w2«¬µ“íÊfñÊBáÇ”‚7G&ñÊráÇÁFV6ÜÊñ6ñÂ˜W6W&Ê÷Rí””“7G&ñÊráFV6ÜÊñ6ñÂ˜W6W&Ê÷Ríì∞¢ñbÇ"í6ˆÁFñÁVS∞¢6ˆÁ7BñB“ˆ÷ˆÊWíá"ÁñEˆ÷˜VÁB«¬ì∞¢6ˆÁ7BÊWB“ˆ÷ˆÊWíá"ÊÊWEˆ÷˜VÁB«¬ì∞¢ñÊ6ˆ÷UñB≥“ñC∞¢ñÊ6ˆ÷T67'VVB≥“ÊWC∞¢¶ˆ$6˜VÁB≥“ÁV÷&W"á"Ê¶ˆ%ˆ6˜VÁB«¬ì∞¢6˜W&6U&˜w2ÁW6Çá≤ñ˜WEˆñC¢ñB¬ñEˆ÷˜VÁC¢ñB¬ÊWEˆ÷˜VÁC¢ÊWB¬¶ˆ%ˆ6˜VÁC¢ÁV÷&W"á"Ê¶ˆ%ˆ6˜VÁB«¬í¬ñE˜7FGW3¢"ÁñE˜7FGW2«¬ÁV∆¬“ì∞¢–¢&WGW&‚≤W&ñˆB¬÷ˆÁFÖˆ∂Wì¢ˆ66˜VÁFñÊuváD÷ˆÁFÑ∂Wîg&ˆ’W&ñˆBáW&ñˆBí¬÷ˆÁFÖˆ∆&V√¢ˆ66˜VÁFñÊuváD÷ˆÁFÑ∆&V¬Öˆ66˜VÁFñÊuváD÷ˆÁFÑ∂Wîg&ˆ’W&ñˆBáW&ñˆBíí¬ñ˜WEˆñG3¢ñ˜WDñG2¬ñÊ6ˆ÷U˜ñC¢ˆ÷ˆÊWíÜñÊ6ˆ÷UñBí¬ñÊ6ˆ÷Uˆ67'VVC¢ˆ÷ˆÊWíÜñÊ6ˆ÷T67'VVBí¬¶ˆ%ˆ6˜VÁC¢¶ˆ$6˜VÁB¬6˜W&6U˜&˜w3¢6˜W&6U&˜w2”∞ß–¶7ñÊ2gVÊ7Fñˆ‚ˆ66˜VÁFñÊtVÁ&ñ6Öñ˜WEFV6Ö&˜w2áñ˜WEˆñB¬W&ñˆB¬&˜w2“µ“í∞¢6ˆÁ7B÷ˆÁFÑ∂Wí“ˆ66˜VÁFñÊuváD÷ˆÁFÑ∂Wîg&ˆ’W&ñˆBáW&ñˆBì∞¢6ˆÁ7B˜WB“µ”∞¢f˜"Ü6ˆÁ7B"ˆb&˜w2«¬µ“í∞¢6ˆÁ7BFV6Ç“7G&ñÊrá"ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7B&ˆfñ∆R“vóBˆ66˜VÁFñÊtvWEFV6ÖFÖ&ˆfñ∆RáFV6Çì∞¢∆WB66ÑÜV∆D÷˜VÁB“∞¢∆WB66ÑÜV∆D¶ˆ'2“∞¢G'í∞¢6ˆÁ7B66Ö“vóBˆˆ¬ÁVW'íÄ¢4TƒT5B4ÙƒU44RÖ5T“Ü÷˜VÁBí√ì£¶ÁV÷W&ñ22÷˜VÁB¬4ıTÂBÇ¢ì£¶ñÁB2¶ˆ'0¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂˆ66Öˆ6ˆ∆∆V7FñˆÁ0¢tÑU$Rñ˜WEˆñC“C‰BFV6ÜÊñ6ñÂ˜W6W&Ê÷S“C"‰B7FGW2î‚ÇvÜV∆Br¬vˆfg6WBrñ¿¢∑ñ˜WEˆñB¬FV6Ö–¢ì∞¢66ÑÜV∆D÷˜VÁB“ˆ÷ˆÊWíÜ66ÖÁ&˜w3ÚÂ≥”ÚÊ÷˜VÁB«¬ì∞¢66ÑÜV∆D¶ˆ'2“ÁV÷&W"Ü66ÖÁ&˜w3ÚÂ≥”ÚÊ¶ˆ'2«¬ì∞¢“6F6ÇÖÚí∑–¢6ˆÁ7B&FR“ˆ÷ˆÊWíá&ˆfñ∆SÚÁváEˆFVfV«E˜&FR«¬2ì∞¢6ˆÁ7BñB“ˆ÷ˆÊWíá"ÁñEˆ÷˜VÁB«¬ì∞¢6ˆÁ7B&6R“ñB‚ÚñB¢ˆ÷ˆÊWíá"ÊÊWEˆ÷˜VÁB«¬ì∞¢∆WBWÜó7FñÊr“ÁV∆√∞¢G'í∞¢6ˆÁ7BWÇ“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BFˆ7V÷VÁEˆñB¬Fˆ7V÷VÁEˆÊÚ¬7FGW0¢e$Ù“V&∆ñ2Ê66˜VÁFñÊuˆFˆ7V÷VÁG0¢tÑU$RFˆ7V÷VÁE˜GóS“wvóFÜÜˆ∆FñÊuˆ6W'Bp¢‰B4ÙƒU44Rá7FGW2¬rrí√‚wfˆñFVBp¢‰Bñ∆ˆEˆß6ˆ‚”„‚wFV6ÜÊñ6ñÂ˜W6W&Ê÷Rs“C¢‰Bñ∆ˆEˆß6ˆ‚”„‚wváEˆ÷ˆÁFÇs“C ¢ı$DU"%í7&VFVEˆBDU42¬Fˆ7V÷VÁEˆñBDU40¢ƒî‘ïB¿¢∑FV6Ç¬÷ˆÁFÑ∂Wï–¢ì∞¢WÜó7FñÊr“WÇÁ&˜w5≥“«¬ÁV∆√∞¢“6F6ÇÖÚí∑–¢˜WBÁW6Çá∞¢‚‚Á"¿¢FV6ÜÊñ6ñÂˆgV∆≈ˆÊ÷S¢&ˆfñ∆SÚÊgV∆≈ˆÊ÷R«¬FV6Ç¿¢FÖ˜&ˆfñ∆S¢&ˆfñ∆R¿¢váEˆ÷ˆÁFÉ¢÷ˆÁFÑ∂Wí¿¢váEˆ÷ˆÁFÖˆ∆&V√¢ˆ66˜VÁFñÊuváD÷ˆÁFÑ∆&V¬Ü÷ˆÁFÑ∂Wíí¿¢váEˆñÊ6ˆ÷Uˆ÷˜VÁC¢ˆ÷ˆÊWíÜ&6Rí¿¢váE˜&FS¢&FR¿¢váE˜FÖˆ÷˜VÁC¢ˆ÷ˆÊWíÜ&6R¢&FRÚí¿¢vóFÜÜˆ∆FñÊuˆFˆ7V÷VÁC¢WÜó7FñÊr¿¢6Âˆó77VU˜vóFÜÜˆ∆FñÊs¢á&ˆfñ∆SÚÊó5ˆ6ˆ◊∆WFRbbñB‚í¿¢66ÖˆÜV∆Eˆ÷˜VÁC¢66ÑÜV∆D÷˜VÁB¿¢66ÖˆÜV∆Eˆ¶ˆ'3¢66ÑÜV∆D¶ˆ'2¿¢“ì∞¢–¢&WGW&‚˜WC∞ß–¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊtFˆ7V÷VÁDáF÷ƒW66Rábí∞¢&WGW&‚7G&ñÊrábÛÚrríÁ&W∆6RÇı≤c√‚"u“ˆr¬2”‚á≤rbs¢rf◊≤r¬s¬s¢rf«C≤r¬s‚s¢rfwC≤r¬r"s¢rgV˜C≤r¬"r#¢rb33ì≤w’∂5“íì∞ß–¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊuváEFÑñDFñvóG2áf«VRí∞¢&WGW&‚7G&ñÊráf«VR«¬rríÁ&W∆6RÇıƒBˆr¬rríÁ6∆ñ6RÉ¬2ì∞ß–¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊuváEFÑñD&˜ÜW4áF÷¬áf«VR¬W64Çí∞¢6ˆÁ7BFñvóG2“ˆ66˜VÁFñÊuváEFÑñDFñvóG2áf«VRì∞¢&WGW&‚∆Fób6∆73“'FÇ÷ñB÷&˜ÜW2#‚G¥'&íÊg&ˆ“á≤∆VÊwFÉ¢2“íÊ÷ÇÖÚ¬íí”‚«7‚6∆73“'FÇ÷&˜Ç#‚G∂W64ÇÜFñvóG5∂ï“«¬rró”¬˜7„ÊíÊ¶ˆñ‚Çrró”¬ˆFócÊ∞ß–¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊuFÜî&áEFWáBÜ÷˜VÁBí∞¢6ˆÁ7BÁV““÷FÇÁ&˜VÊBÇÑÁV÷&W"Ü÷˜VÁB«¬í≤ÁV÷&W"‰U4îƒÙ‚í¢íÚ∞¢6ˆÁ7BVÊóG2“≤rr¬~äæâûãnòéàrr¬~äÆäﬁàrr¬~äÆã.är¬~äÆã^òÇr¬~äæòûã"r¬~äæàr¬~òàéò~âBr¬~òâæâBr¬~òàòûã"u”∞¢6ˆÁ7B˜6óFñˆÁ2“≤rr¬~äÆãNâ¢r¬~ä>òûäﬁä"r¬~âÓãâír¬~äæäã~òéâír¬~òäÆâíu”∞¢gVÊ7Fñˆ‚6ˆÁfW'DñÁFVvW"Ü‚í∞¢‚“÷FÇÊf∆ˆ˜"ÑÁV÷&W"Ü‚«¬íì∞¢ñbÇ‚í&WGW&‚rs∞¢ñbÜ‚„“í∞¢6ˆÁ7B÷ñ∆∆ñˆ‚“÷FÇÊf∆ˆ˜"Ü‚Úì∞¢6ˆÁ7B&W7B“‚R∞¢&WGW&‚G∂6ˆÁfW'DñÁFVvW"Ü÷ñ∆∆ñˆ‚óﬁä^òûã.âíG∑&W7BÚ6ˆÁfW'DñÁFVvW"á&W7Bí¢rw÷∞¢–¢6ˆÁ7B2“7G&ñÊrÜ‚ì∞¢∆WB˜WB“rs∞¢f˜"Ü∆WBí“≤í¬2Ê∆VÊwFÉ≤í≥“í∞¢6ˆÁ7BFñvóB“ÁV÷&W"á5∂ï“ì∞¢ñbÇFñvóBí6ˆÁFñÁVS∞¢6ˆÁ7B˜2“2Ê∆VÊwFÇ“í“∞¢ñbá˜2””“í∞¢ñbÜFñvóB””“í˜WB≥“~äÆãNâ¢s∞¢V«6RñbÜFñvóB””“"í˜WB≥“~ä.ã^òéäÆãNâ¢s∞¢V«6R˜WB≥“G∑VÊóG5∂FñvóE◊ﬁäÆãNâ¶∞¢“V«6Rñbá˜2””“í∞¢ñbÜFñvóB””“bb2Ê∆VÊwFÇ‚í˜WB≥“~òäﬁò~âBs∞¢V«6R˜WB≥“VÊóG5∂FñvóE”∞¢“V«6R∞¢˜WB≥“G∑VÊóG5∂FñvóE◊“G∑˜6óFñˆÁ5∑˜5“«¬rw÷∞¢–¢–¢&WGW&‚˜WC∞¢–¢6ˆÁ7B&áB“÷FÇÊf∆ˆ˜"ÜÁV“ì∞¢6ˆÁ7B6FÊr“÷FÇÁ&˜VÊBÇÜÁV““&áBí¢ì∞¢&WGW&‚G∂6ˆÁfW'DñÁFVvW"Ü&áBí«¬~äéãûâûä.ò¬wﬁâÆã.ârG∑6FÊrÚG∂6ˆÁfW'DñÁFVvW"á6FÊróﬁäÆâ^ã.à~àNò∆¢~ânòûä~âíw÷∞ß–¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊuváDFó7∆îÊÚÜFˆ4ÊÚ¬ó77VTFFRí∞¢6ˆÁ7B&r“7G&ñÊrÜFˆ4ÊÚ«¬rríÁG&ñ“Çì∞¢ñbÇıÂuE∆G≥√'“BÚÁFW7Bá&ríí&WGW&‚&s∞¢6ˆÁ7Bó77VR“ó77VTFFRÚÊWrFFRÜó77VTFFRí¢ÊWrFFRÇì∞¢6ˆÁ7B&∂≤“ÊWrFFRÜó77VRÁFÙ∆ˆ6∆U7G&ñÊrÇvV‚’U2r¬≤Fñ÷U¶ˆÊS¢t6ñÙ&Êv∂ˆ≤r“íì∞¢6ˆÁ7BñV"“&∂≤ÊvWDgV∆≈ñV"Çì∞¢6ˆÁ7B÷ˆÁFÇ“7G&ñÊrÜ&∂≤ÊvWD÷ˆÁFÇÇí≤íÁE7F'BÉ"¬srì∞¢6ˆÁ7Bˆ∆B“&rÊ÷F6ÇÇıÂtÖB“Ö∆G≥G“í“Ö∆B≤íBˆíì∞¢ñbÜˆ∆Bí&WGW&‚uBG∑ñV'“G∂÷ˆÁFá“Gµ7G&ñÊrÜˆ∆E≥%“«¬rríÁE7F'BÉB¬sró÷∞¢&WGW&‚&r«¬uBG∑ñV'“G∂÷ˆÁFá”∞ß–¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊuváDFFTfñV∆G2áf«VRí∞¢6ˆÁ7BB“f«VRÚÊWrFFRáf«VRí¢ÊWrFFRÇì∞¢6ˆÁ7B&∂≤“ÊWrFFRÜBÁFÙ∆ˆ6∆U7G&ñÊrÇvV‚’U2r¬≤Fñ÷U¶ˆÊS¢t6ñÙ&Êv∂ˆ≤r“íì∞¢6ˆÁ7BFí“7G&ñÊrÜ&∂≤ÊvWDFFRÇííÁE7F'BÉ"¬srì∞¢6ˆÁ7B÷ˆÁFÇ“7G&ñÊrÜ&∂≤ÊvWD÷ˆÁFÇÇí≤íÁE7F'BÉ"¬srì∞¢6ˆÁ7BñV"“7G&ñÊrÜ&∂≤ÊvWDgV∆≈ñV"Çíì∞¢&WGW&‚≤Fí¬÷ˆÁFÇ¬ñV"¬6∆6É¢G∂Fó“ÚG∂÷ˆÁFá“ÚG∑ñV'÷”∞ß–†¶6ˆÁ7B44ıTÂDî‰uıtÖEÙƒîıUB“ˆ&¶V7BÊg&VW¶Rá∞¢ÚÚBFb÷∆ñ"6ˆ˜&FñÊFW2¬˜&ñvñ‚ó2&˜GFˆ“÷∆VgB‚6ñvÊGW&Ró2ñÁFVÁFñˆÊ∆«ê¢ÚÚ66∆VBñÁ6ñFRFÜRñW"6ñvÊW"&˜Ç6ÚóB6ÊÊ˜B6˜fW"FÜRFFR¿¢ÚÚñW"FWáB¬7F◊∆6VÜˆ∆FW"¬˜"6W'Fñfñ6Fñˆ‚v˜&FñÊr‡¢6ñvÊGW&T&˜É¢ˆ&¶V7BÊg&VW¶Rá≤É¢3¬ì¢sí¬÷Ös¢ì¬÷ÑÉ¢#"“í¿¢FÑFñvóE6ó¶S¢¿¢ÚÚFV◊∆FRFÇ÷ñBfñV∆G2&Rw&˜WVB”B”R”"”vóFÇfó6ñ&∆Rv2‡¢ÚÚG&vñÊrvóFÇWV¬2÷6V∆¬76ñÊr÷∂W2V6ÇFñvóBG&ñgBˆfb÷6VÁFW"¿¢ÚÚ6ÚFÜW6Rˆfg6WG2F&vWBFÜRfó7V¬6VÁFW"ˆbV6Ç&ñÁFVB&˜Ç‡¢FÑFñvóD6VÁFW$ˆfg6WG3¢ˆ&¶V7BÊg&VW¶RÖ≥R„b¬#2„R¬3R„R¬Cr„Ç¬Sí„Ç¬sí„¬ì„2¬„Ç¬2„Ç¬#b„2¬CB„í¬Sr„¬sR„e“í¿¢6ÜV6∂&˜Ö6ó¶S¢í¿¢ÜVFW%FWáE6ó¶S¢„R¿¢F&∆UFWáE6ó¶S¢í„Ç¿ß“ì∞†¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊuvóFÜÜˆ∆FñÊu&ñÁDáF÷¬ÜFˆ2¬6ˆ◊Áíí∞¢6ˆÁ7B“Fˆ2Áñ∆ˆEˆß6ˆ‚«¬∑”∞¢6ˆÁ7BW64Ç“ˆ66˜VÁFñÊtFˆ7V÷VÁDáF÷ƒW66S∞¢&WGW&‚¬Fˆ7GóRáF÷√„∆áF÷¬∆Ês“'FÇ#„∆ÜVC„∆÷WF6Ü'6WC“'WFb”Ç#„«FóF∆S‚G∂W64ÇÜFˆ2ÊFˆ7V÷VÁEˆÊÚ«¬rró”¬˜FóF∆S„¬ˆÜVC„∆&ˆGì„«Óä>ãâÆâÆàéãòâæãNâNòäﬁàäÆã.ä>â~ä~ãCSòâæò~âíDbàéã.àFV◊∆FRâ^òûâûàûâÆãâ¢äæã.àòäæò~âûäæâûòûã.âûã^òûòâæä^ä~òéã"'&˜w6W"ÙíòNäòéä>äﬁà~ä>ãâ¢Db˜WGWC¬˜„¬ˆ&ˆGì„¬ˆáF÷√Ê∞ß–†¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊu6WEFeFWáDfñV∆BÜf˜&“¬Ê÷R¬f«VRí∞¢G'í∞¢6ˆÁ7Bb“f˜&“ÊvWEFWáDfñV∆BÜÊ÷Rì∞¢bÁ6WEFWáBÖ7G&ñÊráf«VRÛÚrríì∞¢“6F6ÇÖÚí∑–ß–¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊt6ÜV6µFd&˜ÇÜf˜&“¬Ê÷R¬6ÜV6∂VB“G'VRí∞¢G'í∞¢6ˆÁ7Bb“f˜&“ÊvWD6ÜV6¥&˜ÇÜÊ÷Rì∞¢ñbÜ6ÜV6∂VBíbÊ6ÜV6≤Çì≤V«6RbÁVÊ6ÜV6≤Çì∞¢“6F6ÇÖÚí∑–ß–¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊu&V÷˜fUFdfñV∆BÜf˜&“¬Ê÷Rí∞¢G'í∞¢6ˆÁ7Bb“f˜&“ÊvWDfñV∆BÜÊ÷Rì∞¢f˜&“Á&V÷˜fTfñV∆BÜbì∞¢“6F6ÇÖÚí∑–ß–¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊt∆ˆ6ƒ76WEFÇáW&ƒ˜%FÇí∞¢6ˆÁ7Bb“7G&ñÊráW&ƒ˜%FÇ«¬rríÁG&ñ“Çì∞¢ñbÇb«¬ıÊáGG3Û•¬ı¬ÚˆíÁFW7Bábí«¬bÁ7F'G5vóFÇÇvFF¢ríí&WGW&‚rs∞¢6ˆÁ7B&V¬“bÁ7F'G5vóFÇÇrÚríÚbÁ6∆ñ6RÉí¢c∞¢6ˆÁ7BgV∆¬“FÇÊ¶ˆñ‚ÖıˆFó&Ê÷R¬&V¬ì∞¢&WGW&‚g2ÊWÜó7G57ñÊ2ÜgV∆¬íÚgV∆¬¢rs∞ß–¶gVÊ7Fñˆ‚&W6ˆ«fT66˜VÁFñÊu6ñvÊGW&UFÇÜ6ˆ◊Áí“∑“í∞¢6ˆÁ7B6ˆÊfñwW&VB“7G&ñÊrÜ6ˆ◊ÁíÁ6ñvÊGW&U˜W&¬«¬rríÁG&ñ“Çì∞¢6ˆÁ7B6ˆÊfñwW&VDó4FVfV«D˜vÊW"“6ˆÊfñwW&VB«¬ÚÖÁ≈¬Úñ˜vÊW"◊6ñvÊGW&U¬ÁÊrBˆíÁFW7BÜ6ˆÊfñwW&VBì∞¢6ˆÁ7B6ÊFñFFW2“∞¢6ˆÊfñwW&VDó4FVfV«D˜vÊW"Úrˆ76WG2˜6ñvÊGW&W2ˆ˜vÊW"◊6ñvÊGW&R◊G&Á7&VÁBÁÊrr¢6ˆÊfñwW&VB¿¢6ˆÊfñwW&VDó4FVfV«D˜vÊW"Úrr¢rˆ76WG2˜6ñvÊGW&W2ˆ˜vÊW"◊6ñvÊGW&R◊G&Á7&VÁBÁÊrr¿¢rˆ76WG2˜6ñvÊGW&W2ˆ˜vÊW"◊6ñvÊGW&R◊G&Á7&VÁBÁÊrr¿¢rˆ76WG2˜6ñvÊGW&W2ˆ˜vÊW"◊6ñvÊGW&RÁÊrr¿¢v76WG2˜6ñvÊGW&W2ˆ˜vÊW"◊6ñvÊGW&RÁÊrr¿¢v76WG2˜6ñvÊGW&W2ˆ˜vÊW"◊6ñvÊGW&R◊G&Á7&VÁBÁÊrr¿¢r˜V&∆ñ2ˆ76WG2˜6ñvÊGW&W2ˆ˜vÊW"◊6ñvÊGW&RÁÊrr¿¢“Ê÷áb”‚7G&ñÊráb«¬rríÁG&ñ“ÇííÊfñ«FW"Ñ&ˆˆ∆V‚ì∞¢f˜"Ü6ˆÁ7B2ˆb6ÊFñFFW2í∞¢6ˆÁ7B∆ˆ6¬“ˆ66˜VÁFñÊt∆ˆ6ƒ76WEFÇÜ2ì∞¢ñbÜ∆ˆ6¬í&WGW&‚∆ˆ6√∞¢–¢&WGW&‚rs∞ß–¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊt˜vÊW%6ñvÊW$Ê÷RÇí≤&WGW&‚~âûã.ä"äÆãéâ~âéãNâÓà~äûò¬äéä>ã^ä~ã.ä>ãNâûâ~ä>ò¬s≤–¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊt˜vÊW%6ñvÊW%˜6óFñˆ‚Çí≤&WGW&‚~âŒãûòûäã^äﬁã>âûã.àéä^à~âûã.äs≤–¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊt˜vÊW%6ñvÊGW&UV&∆ñ5W&¬Çí∞¢&WGW&‚&W6ˆ«fT66˜VÁFñÊu6ñvÊGW&UFÇá≤6ñvÊGW&U˜W&√¢rˆ76WG2˜6ñvÊGW&W2ˆ˜vÊW"◊6ñvÊGW&R◊G&Á7&VÁBÁÊrr“ê¢Úrˆ76WG2˜6ñvÊGW&W2ˆ˜vÊW"◊6ñvÊGW&R◊G&Á7&VÁBÁÊrp¢¢rs∞ß–¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊu6ñvÊGW&UV&∆ñ5W&¬Ü6ˆ◊Áí“∑“í∞¢6ˆÁ7B&r“7G&ñÊrÜ6ˆ◊ÁíÁ6ñvÊGW&U˜W&¬«¬rríÁG&ñ“Çì∞¢ñbÇ&r«¬ÚÖÁ≈¬Úñ˜vÊW"◊6ñvÊGW&U¬ÁÊrBˆíÁFW7Bá&ríí∞¢&WGW&‚&W6ˆ«fT66˜VÁFñÊu6ñvÊGW&UFÇá≤6ñvÊGW&U˜W&√¢&r“íÚrˆ76WG2˜6ñvÊGW&W2ˆ˜vÊW"◊6ñvÊGW&R◊G&Á7&VÁBÁÊrr¢rs∞¢–¢ñbá&rbbÇıÊáGG3Û•¬ı¬ÚˆíÁFW7Bá&rí«¬&rÁ7F'G5vóFÇÇrÚrí«¬&rÁ7F'G5vóFÇÇvFF¢rííí&WGW&‚&s∞¢&WGW&‚&W6ˆ«fT66˜VÁFñÊu6ñvÊGW&UFÇÜ6ˆ◊ÁííÚrˆ76WG2˜6ñvÊGW&W2ˆ˜vÊW"◊6ñvÊGW&RÁÊrr¢rs∞ß–¶7ñÊ2gVÊ7Fñˆ‚ˆ66˜VÁFñÊt∆ˆDñ÷vT'óFW2Ü76WEFÑ˜%W&¬í∞¢6ˆÁ7B7&2“7G&ñÊrÜ76WEFÑ˜%W&¬«¬rríÁG&ñ“Çì∞¢ñbÇ7&2í&WGW&‚ÁV∆√∞¢ñbá7&2Á7F'G5vóFÇÇvFF¶ñ÷vRÚríí∞¢6ˆÁ7B““7&2Ê÷F6ÇÇıÊFF¢Üñ÷vU¬ÚÉÛßÊw∆ßSˆríì∂&6ScB¬Ç‚≤íBˆíì∞¢ñbÇ“í&WGW&‚ÁV∆√∞¢&WGW&‚≤'óFW3¢'VffW"Êg&ˆ“Ü’≥%“¬v&6ScBrí¬÷ñ÷S¢’≥“ÁFÙ∆˜vW$66RÇí¬6˜W&6S¢vFF◊W&¬r”∞¢–¢ñbÇıÊáGG3Û•¬ı¬ÚˆíÁFW7Bá7&2íí∞¢6ˆÁ7B"“vóBfWF6Çá7&2ì∞¢ñbÇ"Êˆ≤íFá&˜rÊWrW'&˜"ÜÖEEÚG∑"Á7FGW7÷ì∞¢&WGW&‚≤'óFW3¢'VffW"Êg&ˆ“ÜvóB"Ê'&î'VffW"Çíí¬÷ñ÷S¢7G&ñÊrá"ÊÜVFW'2ÊvWBÇv6ˆÁFVÁB◊GóRrí«¬rríÁFÙ∆˜vW$66RÇí¬6˜W&6S¢7&2”∞¢–¢6ˆÁ7B∆ˆ6≈FÇ“ˆ66˜VÁFñÊt∆ˆ6ƒ76WEFÇá7&2í«¬Üg2ÊWÜó7G57ñÊ2á7&2íÚ7&2¢rrì∞¢ñbÇ∆ˆ6≈FÇí&WGW&‚ÁV∆√∞¢6ˆÁ7B∆˜vW"“∆ˆ6≈FÇÁFÙ∆˜vW$66RÇì∞¢&WGW&‚≤'óFW3¢g2Á&VDfñ∆U7ñÊ2Ü∆ˆ6≈FÇí¬÷ñ÷S¢∆˜vW"ÊVÊG5vóFÇÇrÊßrrí«¬∆˜vW"ÊVÊG5vóFÇÇrÊßVrríÚvñ÷vRˆßVrr¢vñ÷vR˜Êrr¬6˜W&6S¢∆ˆ6≈FÇ”∞ß–¶7ñÊ2gVÊ7Fñˆ‚∆ˆD66˜VÁFñÊu6ñvÊGW&Tñ÷vRáFdFˆ2¬6ˆ◊Áí“∑“í∞¢6ˆÁ7Bf∆∆&6µFÇ“&W6ˆ«fT66˜VÁFñÊu6ñvÊGW&UFÇÜ6ˆ◊Áíì∞¢6ˆÁ7B6ˆÊfñwW&VB“7G&ñÊrÜ6ˆ◊ÁíÁ6ñvÊGW&U˜W&¬«¬rríÁG&ñ“Çì∞¢6ˆÁ7B6ˆÊfñwW&VDó4FVfV«D˜vÊW"“6ˆÊfñwW&VB«¬ÚÖÁ≈¬Úñ˜vÊW"◊6ñvÊGW&U¬ÁÊrBˆíÁFW7BÜ6ˆÊfñwW&VBì∞¢6ˆÁ7B6ÊFñFFW2“6ˆÊfñwW&VDó4FVfV«D˜vÊW ¢Ú∂f∆∆&6µFÇ¬6ˆÊfñwW&VE–¢¢∂6ˆÊfñwW&VB¬f∆∆&6µFÖ”∞¢6ˆÁ7BVÊóVT6ÊFñFFW2“≤‚‚ÊÊWr6WBÜ6ÊFñFFW2Ê÷áb”‚7G&ñÊráb«¬rríÁG&ñ“ÇííÊfñ«FW"Ñ&ˆˆ∆V‚íï”∞¢f˜"Ü6ˆÁ7B7&2ˆbVÊóVT6ÊFñFFW2í∞¢G'í∞¢6ˆÁ7B&r“vóBˆ66˜VÁFñÊt∆ˆDñ÷vT'óFW2á7&2ì∞¢ñbÇ&rí6ˆÁFñÁVS∞¢ñbá&rÊ÷ñ÷RÊñÊ6«VFW2ÇvßVrrí«¬&rÊ÷ñ÷RÊñÊ6«VFW2Çvßrríí&WGW&‚FdFˆ2ÊV÷&VDßrá&rÊ'óFW2ì∞¢&WGW&‚FdFˆ2ÊV÷&VEÊrá&rÊ'óFW2ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÁv&‚Çt44ıTÂDî‰uı4ît‰EU$UÙƒÙEÙdîƒTBr¬7&2¬SÚÊ÷W76vR«¬Rì∞¢–¢–¢6ˆÁ6ˆ∆RÁv&‚Çt44ıTÂDî‰uı4ît‰EU$UÙ‘ï54î‰rr¬6ˆ◊ÁíÁ6ñvÊGW&U˜W&¬«¬rˆ76WG2˜6ñvÊGW&W2ˆ˜vÊW"◊6ñvÊGW&R◊G&Á7&VÁBÁÊrrì∞¢&WGW&‚ÁV∆√∞ß–¶7ñÊ2gVÊ7Fñˆ‚G&t66˜VÁFñÊu6ñvÊGW&RáFdFˆ2¬vR¬6ˆ◊Áí“∑“¬&˜Ç“∑“í∞¢G'í∞¢6ˆÁ7Bñ÷r“vóB∆ˆD66˜VÁFñÊu6ñvÊGW&Tñ÷vRáFdFˆ2¬6ˆ◊Áíì∞¢ñbÇñ÷rí&WGW&„∞¢6ˆÁ7BÇ“ÁV÷&W"Ü&˜ÇÁÇÛÚ3ÉBì∞¢6ˆÁ7Bí“ÁV÷&W"Ü&˜ÇÁíÛÚÉÇì∞¢6ˆÁ7B÷Ör“ÁV÷&W"Ü&˜ÇÊ÷ÖrÛÚ3"ì∞¢6ˆÁ7B÷ÑÇ“ÁV÷&W"Ü&˜ÇÊ÷ÑÇÛÚCbì∞¢6ˆÁ7B66∆R“÷FÇÊ÷ñ‚Ü÷ÖrÚñ÷rÁvñGFÇ¬÷ÑÇÚñ÷rÊÜVñváB¬ì∞¢6ˆÁ7Br“ñ÷rÁvñGFÇ¢66∆S∞¢6ˆÁ7BÇ“ñ÷rÊÜVñváB¢66∆S∞¢vRÊG&tñ÷vRÜñ÷r¬∞¢É¢Ç≤ÇÜ÷Ör“ríÚ"í¿¢ì¢í≤ÇÜ÷ÑÇ“ÇíÚ"í¿¢vñGFÉ¢r¿¢ÜVñváC¢Ç¿¢˜6óGì¢ÁV÷&W"Ü&˜ÇÊ˜6óGíÛÚ„ìÇí¿¢“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÁv&‚Çt44ıTÂDî‰uı4ît‰EU$UÙE$uÙdîƒTBr¬SÚÊ÷W76vR«¬Rì∞¢–ß–¶7ñÊ2gVÊ7Fñˆ‚ˆ66˜VÁFñÊuvóFÜÜˆ∆FñÊuFd'VffW"ÜFˆ2¬6ˆ◊Áí“∑“í∞¢6ˆÁ7B≤DdFˆ7V÷VÁB““&WVó&RÇwFb÷∆ñ"rì∞¢6ˆÁ7BfˆÁF∂óB“&WVó&RÇtFb÷∆ñ"ˆfˆÁF∂óBrì∞¢6ˆÁ7BFV◊∆FUFÇ“FÇÊ¶ˆñ‚ÖıˆFó&Ê÷R¬v76WG2r¬wFb◊FV◊∆FW2r¬wváCSr¬sSFvï˜FV◊∆FRÁFbrì∞¢6ˆÁ7B&VwV∆$fˆÁEFÇ“FÇÊ¶ˆñ‚ÖıˆFó&Ê÷R¬v76WG2r¬vfˆÁG2r¬uDÖ6&'V‚ÁGFbrì∞¢6ˆÁ7B&ˆ∆DfˆÁEFÇ“FÇÊ¶ˆñ‚ÖıˆFó&Ê÷R¬v76WG2r¬vfˆÁG2r¬uDÖ6&'V‚‘&ˆ∆BÁGFbrì∞¢ñbÇg2ÊWÜó7G57ñÊ2áFV◊∆FUFÇíí∞¢6ˆÁ7BR“ÊWrW'&˜"ÇutÖCSıDT’ƒDUÙ‰ıEÙdıT‰Brì≤RÊ6ˆFR“utÖCSıDT’ƒDUÙ‰ıEÙdıT‰Bs≤Fá&˜rS∞¢–¢6ˆÁ7BFdFˆ2“vóBDdFˆ7V÷VÁBÊ∆ˆBÜg2Á&VDfñ∆U7ñÊ2áFV◊∆FUFÇíì∞¢FdFˆ2Á&Vvó7FW$fˆÁF∂óBÜfˆÁF∂óBì∞¢6ˆÁ7B&VwV∆$fˆÁB“g2ÊWÜó7G57ñÊ2á&VwV∆$fˆÁEFÇíÚvóBFdFˆ2ÊV÷&VDfˆÁBÜg2Á&VDfñ∆U7ñÊ2á&VwV∆$fˆÁEFÇí¬≤7V'6WC¢G'VR“í¢VÊFVfñÊVC∞¢6ˆÁ7B&ˆ∆DfˆÁB“g2ÊWÜó7G57ñÊ2Ü&ˆ∆DfˆÁEFÇíÚvóBFdFˆ2ÊV÷&VDfˆÁBÜg2Á&VDfñ∆U7ñÊ2Ü&ˆ∆DfˆÁEFÇí¬≤7V'6WC¢G'VR“í¢&VwV∆$fˆÁC∞¢6ˆÁ7Bf˜&““FdFˆ2ÊvWDf˜&“Çì∞¢6ˆÁ7B“Fˆ2Áñ∆ˆEˆß6ˆ‚«¬∑”∞¢6ˆÁ7BFˆ4ÊÚ“ˆ66˜VÁFñÊuváDFó7∆îÊÚÜFˆ2ÊFˆ7V÷VÁEˆÊÚ¬Fˆ2Êó77VUˆFFR«¬ÊWrFFRÇíì∞¢6ˆÁ7BñDFFR“ˆ66˜VÁFñÊuváDFFTfñV∆G2áÁñ÷VÁEˆFFR«¬Fˆ2Êó77VUˆFFR«¬ÊWrFFRÇíì∞¢6ˆÁ7Bó77VTFFR“ˆ66˜VÁFñÊuváDFFTfñV∆G2ÜFˆ2Êó77VUˆFFR«¬ÊWrFFRÇíì∞¢6ˆÁ7BñW%FÑñB“ˆ66˜VÁFñÊuváEFÑñDFñvóG2Ü6ˆ◊ÁíÁFÖˆñB«¬rrì∞¢6ˆÁ7BñVUFÑñB“ˆ66˜VÁFñÊuváEFÑñDFñvóG2áÁñVU˜FÖˆñB«¬Fˆ2Ê7W7Fˆ÷W%˜FÖˆñB«¬rrì∞¢6ˆÁ7BñÊ6ˆ÷T÷˜VÁB“ÁV÷&W"áÊñÊ6ˆ÷Uˆ÷˜VÁB«¬Fˆ2ÁF˜F≈ˆ÷˜VÁB«¬ì∞¢6ˆÁ7BvóFÜÜˆ∆FñÊt÷˜VÁB“ÁV÷&W"áÁvóFÜÜˆ∆FñÊuˆ÷˜VÁB«¬Fˆ2ÁvóFÜÜˆ∆FñÊuˆ÷˜VÁB«¬ì∞¢6ˆÁ7BñÊ6ˆ÷UGóR“7G&ñÊráÊñÊ6ˆ÷U˜GóR«¬~àNòéã.âÆä>ãNàã.ä2˛àNòéã.àéòûã.à~â~ã>à.äﬁàrâ^ã.ääã.â^ä>ã"CÉÇíríÁG&ñ“Çì∞¢6ˆÁ7BÊDf˜&““7G&ñÊráÊf˜&’˜GóR«¬ÁÊEˆf˜&“«¬wÊC2ríÁG&ñ“ÇíÁFÙ∆˜vW$66RÇì∞¢6ˆÁ7BñW$Ê÷R“G∂6ˆ◊ÁíÊ6ˆ◊ÁïˆÊ÷R«¬t6ˆ∆GvñÊFf∆˜ró"6W'fñ6W2w“G∂6ˆ◊ÁíÊ'&Ê6ÇÚÇG∂6ˆ◊ÁíÊ'&Ê6á“ñ¢rw÷∞¢6ˆÁ7BñVTÊ÷R“7G&ñÊráÁñVUˆÊ÷R«¬Fˆ2Ê7W7Fˆ÷W%ˆÊ÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7BvR“FdFˆ2ÊvWEvW2Çï≥”∞¢6ˆÁ7B&∆6≤“&WVó&RÇwFb÷∆ñ"ríÁ&v"É¬¬ì∞¢6ˆÁ7B&V7D'îÊ÷R“∑”∞¢f˜"Ü6ˆÁ7Bbˆbf˜&“ÊvWDfñV∆G2Çíí∞¢G'í∞¢6ˆÁ7BvñFvWG2“bÊ7&ÙfñV∆BÊvWEvñFvWG2Çì∞¢6ˆÁ7B"“vñFvWG5≥”ÚÊvWE&V7FÊv∆RÇì∞¢ñbá"í&V7D'îÊ÷U∂bÊvWDÊ÷RÇï““≤É¢"ÁÇ¬ì¢"Áí¬vñGFÉ¢"ÁvñGFÇ¬ÜVñváC¢"ÊÜVñváB”∞¢“6F6ÇÖÚí∑–¢–¢6ˆÁ7BfñV∆E&V7B“ÜÊ÷Rí”‚&V7D'îÊ÷U∂Ê÷U“«¬ÁV∆√∞¢6ˆÁ7BfóB“áFWáB¬÷ÖvñGFÇ¬fˆÁB¬6ó¶R¬÷ñ‚“rí”‚∞¢∆WB2“6ó¶S∞¢6ˆÁ7BB“7G&ñÊráFWáBÛÚrrì∞¢vÜñ∆RÜfˆÁBbb2‚÷ñ‚bbfˆÁBÁvñGFÑˆeFWáDE6ó¶RáB¬2í‚÷ÖvñGFÇí2”“„S∞¢&WGW&‚3∞¢”∞¢6ˆÁ7BG&uFWáDñ‚“ÜÊ÷R¬FWáB¬˜B“∑“í”‚∞¢6ˆÁ7B"“fñV∆E&V7BÜÊ÷Rì∞¢ñbÇ"í&WGW&„∞¢6ˆÁ7BfˆÁB“˜BÊ&ˆ∆BÚÜ&ˆ∆DfˆÁB«¬&VwV∆$fˆÁBí¢á&VwV∆$fˆÁB«¬&ˆ∆DfˆÁBì∞¢6ˆÁ7B6ó¶R“fóBáFWáB¬"ÁvñGFÇ“2¬fˆÁB¬˜BÁ6ó¶R«¬¬˜BÊ÷ñ‚«¬rì∞¢6ˆÁ7Bí“"Áí≤÷FÇÊ÷ÇÉ„"¬á"ÊÜVñváB“6ó¶RíÚ"í≤Ü˜BÊGí«¬ì∞¢∆WBÇ“"ÁÇ≤Ü˜BÊGÇ«¬„Rì∞¢ñbÜ˜BÊ∆ñv‚””“w&ñváBrbbfˆÁBíÇ“"ÁÇ≤"ÁvñGFÇ“fˆÁBÁvñGFÑˆeFWáDE6ó¶RÖ7G&ñÊráFWáBÛÚrrí¬6ó¶Rí“C∞¢ñbÜ˜BÊ∆ñv‚””“v6VÁFW"rbbfˆÁBíÇ“"ÁÇ≤á"ÁvñGFÇ“fˆÁBÁvñGFÑˆeFWáDE6ó¶RÖ7G&ñÊráFWáBÛÚrrí¬6ó¶RííÚ#∞¢vRÊG&uFWáBÖ7G&ñÊráFWáBÛÚrrí¬≤Ç¬í¬6ó¶R¬fˆÁB¬6ˆ∆˜#¢&∆6≤¬÷ÖvñGFÉ¢"ÁvñGFÇ“"“ì∞¢”∞¢6ˆÁ7BG&uFÑñDFñvóG2“ÜÊ÷R¬f«VRí”‚∞¢6ˆÁ7B"“fñV∆E&V7BÜÊ÷Rì∞¢6ˆÁ7BfˆÁB“&ˆ∆DfˆÁB«¬&VwV∆$fˆÁC∞¢ñbÇ"«¬fˆÁBí&WGW&„∞¢6ˆÁ7BFñvóG2“ˆ66˜VÁFñÊuváEFÑñDFñvóG2áf«VRíÁDVÊBÉ2¬rrì∞¢6ˆÁ7Bˆfg6WG2“44ıTÂDî‰uıtÖEÙƒîıUBÁFÑFñvóD6VÁFW$ˆfg6WG2«¬µ”∞¢6ˆÁ7B6ó¶R“44ıTÂDî‰uıtÖEÙƒîıUBÁFÑFñvóE6ó¶S∞¢6ˆÁ7Bí“"Áí≤÷FÇÊ÷ÇÉ„b¬á"ÊÜVñváB“6ó¶RíÚ"í≤„#∞¢f˜"Ü∆WBí“≤í¬3≤í≥“í∞¢6ˆÁ7BB“FñvóG5∂ï“ÁG&ñ“Çì∞¢ñbÇBí6ˆÁFñÁVS∞¢6ˆÁ7Bfó7Vƒ6VÁFW"“ˆfg6WG5∂ï“Ú"ÁÇ≤ˆfg6WG5∂ï“¢"ÁÇ≤ÇÜí≤„Rí¢á"ÁvñGFÇÚ2íì∞¢vRÊG&uFWáBÜB¬∞¢É¢fó7Vƒ6VÁFW"“ÜfˆÁBÁvñGFÑˆeFWáDE6ó¶RÜB¬6ó¶RíÚ"í¿¢í¿¢6ó¶R¿¢fˆÁB¿¢6ˆ∆˜#¢&∆6≤¿¢“ì∞¢–¢”∞¢6ˆÁ7BG&t6ÜV6≤“ÜÊ÷Rí”‚∞¢6ˆÁ7B"“fñV∆E&V7BÜÊ÷Rì∞¢6ˆÁ7BfˆÁB“&ˆ∆DfˆÁB«¬&VwV∆$fˆÁC∞¢ñbÇ"«¬fˆÁBí&WGW&„∞¢vRÊG&uFWáBÇuÇr¬≤É¢"ÁÇ≤"„R¬ì¢"Áí≤"„"¬6ó¶S¢44ıTÂDî‰uıtÖEÙƒîıUBÊ6ÜV6∂&˜Ö6ó¶R¬fˆÁB¬6ˆ∆˜#¢&∆6≤“ì∞¢”∞¢6ˆÁ7B÷ˆÊWïFWáB“Ü‚í”‚ÁV÷&W"Ü‚«¬íÁFÙ∆ˆ6∆U7G&ñÊrÇvV‚’U2r¬≤÷ñÊñ◊V‘g&7Fñˆ‰FñvóG3¢"¬÷Üñ◊V‘g&7Fñˆ‰FñvóG3¢"“ì∞†¢ÚÚä^âÆâæãéòéä6∆V"FFàéã.àFV◊∆FRòâNãNäòâÓã~òéäﬁòNäòéò>äæòûâ^ãNâNòNâæò>âûòäﬁàäÆã.ä>âÆä>ãNäûãâp¢ˆ66˜VÁFñÊu&V÷˜fUFdfñV∆BÜf˜&“¬v6∆V"FFrì∞†¢ÚÚtÖB6ˆ˜&FñÊFR÷¢∂VWFV◊∆FR'BVÁF˜V6ÜVB¬f∆GFV‚&∆Ê≤fñV∆G2¬FÜV‡¢ÚÚG&rf«VW2˜W'6V«fW26ÚFÜíFWáBˆFñvóG26óBñÁ6ñFRFÜRv˜fW&Ê÷VÁB&˜ÜW2‡¢f˜"Ü6ˆÁ7Bbˆbf˜&“ÊvWDfñV∆G2Çíí∞¢G'í∞¢ñbÜbÊ6ˆÁ7G'V7F˜#ÚÊÊ÷R””“uDeFWáDfñV∆BríbÁ6WEFWáBÇrrì∞¢ñbÜbÊ6ˆÁ7G'V7F˜#ÚÊÊ÷R””“uDd6ÜV6¥&˜ÇríbÁVÊ6ÜV6≤Çì∞¢“6F6ÇÖÚí∑–¢–¢G'í≤f˜&“ÁWFFTfñV∆DV&Ê6W2á&VwV∆$fˆÁB«¬&ˆ∆DfˆÁBì≤“6F6ÇÖÚí∑–¢G'í≤f˜&“Êf∆GFV‚Çì≤“6F6ÇÖÚí∑–†¢G&uFWáDñ‚Çw'VÂˆÊÚr¬Fˆ4ÊÚ¬≤6ó¶S¢r„b¬∆ñv„¢v6VÁFW"r¬÷ñ„¢R„Ç“ì∞¢G&uFÑñDFñvóG2ÇvñCr¬ñW%FÑñBì∞¢G&uFWáDñ‚ÇvÊ÷Sr¬ñW$Ê÷R¬≤6ó¶S¢44ıTÂDî‰uıtÖEÙƒîıUBÊÜVFW%FWáE6ó¶R¬÷ñ„¢Ç“ì∞¢G&uFWáDñ‚ÇwFñ„r¬rr¬≤6ó¶S¢“ì∞¢G&uFWáDñ‚ÇvFCr¬6ˆ◊ÁíÊFG&W72«¬rr¬≤6ó¶S¢í„r¬÷ñ„¢r“ì∞¢G&uFÑñDFñvóG2ÇvñCÛ"r¬ñVUFÑñBì∞¢G&uFWáDñ‚ÇvÊ÷S"r¬ñVTÊ÷R¬≤6ó¶S¢44ıTÂDî‰uıtÖEÙƒîıUBÊÜVFW%FWáE6ó¶R¬÷ñ„¢Ç“ì∞¢G&uFWáDñ‚ÇwFñ„Û"r¬rr¬≤6ó¶S¢“ì∞¢G&uFWáDñ‚ÇvFC"r¬ÁñVUˆFG&W72«¬Fˆ2Ê7W7Fˆ÷W%ˆFG&W72«¬rr¬≤6ó¶S¢í„R¬÷ñ„¢r“ì∞¢G&uFWáDñ‚ÇvóFV“r¬ÊóFV’ˆÊÚ«¬rr¬≤6ó¶S¢„R¬∆ñv„¢v6VÁFW"r“ì∞†¢6ˆÁ7BÊD÷“≤ÊC≥¢v6Ü≥r¬ÊCµ˜7V6ñ√¢v6Ü≥"r¬ÊC#¢v6Ü≥2r¬ÊC3¢v6Ü≥Br¬ÊC&≥¢v6Ü≥Rr¬ÊC6≥¢v6Ü≥br¬ÊCS3¢v6Ü≥rr”∞¢G&t6ÜV6≤áÊD÷∑ÊDf˜&’“«¬v6Ü≥Brì∞†¢ÚÚ&˜rS¢6W'fñ6RñÊ6ˆ÷RVÊFW"6V7Fñˆ‚2G&VFV6ñ“ÚCÉÇí‚FÜRgV∆¬FV◊∆FRÜ2÷Áí&˜w3≤&˜rRfñV∆G2&RFFSB„˜ì„2„˜FÉ„2„‡¢G&uFWáDñ‚ÇvFFSB„r¬ñDFFRÁ6∆6Ç¬≤6ó¶S¢44ıTÂDî‰uıtÖEÙƒîıUBÁF&∆UFWáE6ó¶R¬∆ñv„¢v6VÁFW"r¬Gì¢„B“ì∞¢G&uFWáDñ‚Çwì„2„r¬÷ˆÊWïFWáBÜñÊ6ˆ÷T÷˜VÁBí¬≤6ó¶S¢44ıTÂDî‰uıtÖEÙƒîıUBÁF&∆UFWáE6ó¶R¬∆ñv„¢v6VÁFW"r¬÷ñ„¢r¬Gì¢„B“ì∞¢G&uFWáDñ‚ÇwFÉ„2„r¬÷ˆÊWïFWáBávóFÜÜˆ∆FñÊt÷˜VÁBí¬≤6ó¶S¢44ıTÂDî‰uıtÖEÙƒîıUBÁF&∆UFWáE6ó¶R¬∆ñv„¢v6VÁFW"r¬÷ñ„¢r¬Gì¢„B“ì∞¢G&uFWáDñ‚Çw7V32r¬ñÊ6ˆ÷UGóR¬≤6ó¶S¢í„B¬÷ñ„¢r¬Gì¢„"“ì∞†¢ÚÚF˜F«2ÊBñ÷VÁB÷WFÜˆ@¢G&uFWáDñ‚Çwì„Br¬÷ˆÊWïFWáBÜñÊ6ˆ÷T÷˜VÁBí¬≤6ó¶S¢44ıTÂDî‰uıtÖEÙƒîıUBÁF&∆UFWáE6ó¶R¬∆ñv„¢v6VÁFW"r¬÷ñ„¢r¬Gì¢„B“ì∞¢G&uFWáDñ‚ÇwFÉ„Br¬÷ˆÊWïFWáBávóFÜÜˆ∆FñÊt÷˜VÁBí¬≤6ó¶S¢44ıTÂDî‰uıtÖEÙƒîıUBÁF&∆UFWáE6ó¶R¬∆ñv„¢v6VÁFW"r¬÷ñ„¢r¬Gì¢„B“ì∞¢G&uFWáDñ‚ÇwF˜F¬r¬ÇGµˆ66˜VÁFñÊuFÜî&áEFWáBávóFÜÜˆ∆FñÊt÷˜VÁBó“ñ¬≤6ó¶S¢„"¬∆ñv„¢v6VÁFW"r¬÷ñ„¢r¬Gì¢“ì∞¢G&t6ÜV6≤Çv6Ü≥Çrì≤ÚÚäæãàâ2â~ã^òéàéòéã.ä ¢G&uFWáDñ‚ÇvFFU˜ír¬ó77VTFFRÊFí¬≤6ó¶S¢í„Ç¬∆ñv„¢v6VÁFW"r¬Gì¢„“ì∞¢G&uFWáDñ‚Çv÷ˆÁFÖ˜ír¬ó77VTFFRÊ÷ˆÁFÇ¬≤6ó¶S¢í„Ç¬∆ñv„¢v6VÁFW"r¬Gì¢„“ì∞¢G&uFWáDñ‚ÇwñV%˜ír¬ó77VTFFRÁñV"¬≤6ó¶S¢í„Ç¬∆ñv„¢v6VÁFW"r¬Gì¢„“ì∞†¢vóBG&t66˜VÁFñÊu6ñvÊGW&RÄ¢FdFˆ2¿¢vR¿¢≤‚‚Ê6ˆ◊Áí¬6ñvÊGW&U˜W&√¢rˆ76WG2˜6ñvÊGW&W2ˆ˜vÊW"◊6ñvÊGW&R◊váB◊G&Á7&VÁBÁÊrr“¿¢44ıTÂDî‰uıtÖEÙƒîıUBÁ6ñvÊGW&T&˜Ä¢ì∞¢&WGW&‚'VffW"Êg&ˆ“ÜvóBFdFˆ2Á6fRá≤W6Tˆ&¶V7E7G&V◊3¢f«6R“íì∞ß–†¶7ñÊ2gVÊ7Fñˆ‚ˆ66˜VÁFñÊu7F˜&VEñ˜WEFV6Ö&˜w2áñ˜WEˆñBí∞¢6ˆÁ7B“vóBˆˆ¬ÁVW'íÄ¢tïDÇ∆ñÊU˜7V“2Ä¢4TƒT5BFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬4ıTÂBÑDï5Dî‰5B¶ˆ%ˆñBì£¶ñÁB2¶ˆ%ˆ6˜VÁB¬4ÙƒU44RÖ5T“ÜV&Âˆ÷˜VÁBí√ì£¶ÁV÷W&ñ22w&˜75ˆ÷˜VÁ@¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜ñ˜WEˆ∆ñÊW0¢tÑU$Rñ˜WEˆñC“C¢u$ıU%íFV6ÜÊñ6ñÂ˜W6W&Ê÷P¢í¬í2Ä¢4TƒT5BFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬4ÙƒU44RáñEˆ÷˜VÁB√ì£¶ÁV÷W&ñ22ñEˆ÷˜VÁB¬ñE˜7FGW2¬ñEˆB¬ñEˆ'í¬6∆ó˜W&¬¬Ê˜FR¬ñ÷VÁEˆ÷WFÜˆB¬ñ÷VÁE˜&VfW&VÊ6P¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜ñ˜WE˜ñ÷VÁG0¢tÑU$Rñ˜WEˆñC“C¢í¬FV6á22Ä¢4TƒT5BFV6ÜÊñ6ñÂ˜W6W&Ê÷Re$Ù“∆ñÊU˜7V“T‰îÙ‚4TƒT5BFV6ÜÊñ6ñÂ˜W6W&Ê÷Re$Ù“ê¢í¬F¢2Ä¢4TƒT5BFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬4ÙƒU44RÖ5T“ÜF•ˆ÷˜VÁBí√ì£¶ÁV÷W&ñ22F•˜F˜F¿¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜ñ˜WEˆFßW7F÷VÁG0¢tÑU$Rñ˜WEˆñC“C¢u$ıU%íFV6ÜÊñ6ñÂ˜W6W&Ê÷P¢í¬FW2Ä¢4TƒT5BFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬4ÙƒU44RÖ5T“Ü÷˜VÁBí√ì£¶ÁV÷W&ñ22FW˜6óEˆFVGV7FñˆÂˆ÷˜VÁ@¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂˆFW˜6óEˆ∆VFvW ¢tÑU$Rñ˜WEˆñC“C‰BG&Á67FñˆÂ˜GóS“v6ˆ∆∆V7Bp¢u$ıU%íFV6ÜÊñ6ñÂ˜W6W&Ê÷P¢ê¢4TƒT5BBÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R¿¢4ÙƒU44RÜ∆ñÊU˜7V“Ê¶ˆ%ˆ6˜VÁB√ì£¶ñÁB2¶ˆ%ˆ6˜VÁB¿¢4ÙƒU44RÜ∆ñÊU˜7V“Êw&˜75ˆ÷˜VÁB√ì£¶ÁV÷W&ñ22w&˜75ˆ÷˜VÁB¿¢4ÙƒU44RÜFWÊFW˜6óEˆFVGV7FñˆÂˆ÷˜VÁB√ì£¶ÁV÷W&ñ22FW˜6óEˆFVGV7FñˆÂˆ÷˜VÁB¿¢4ÙƒU44RÜF¢ÊF•˜F˜F¬√ì£¶ÁV÷W&ñ22F•˜F˜F¬¿¢Ñ4ÙƒU44RÜ∆ñÊU˜7V“Êw&˜75ˆ÷˜VÁB√í≤4ÙƒU44RÜF¢ÊF•˜F˜F¬√í“4ÙƒU44RÜFWÊFW˜6óEˆFVGV7FñˆÂˆ÷˜VÁB√íì£¶ÁV÷W&ñ22ÊWEˆ÷˜VÁB¿¢4ÙƒU44RáíÁñEˆ÷˜VÁB√ì£¶ÁV÷W&ñ22ñEˆ÷˜VÁB¿¢u$TDU5BÉ¬4ÙƒU44RÜ∆ñÊU˜7V“Êw&˜75ˆ÷˜VÁB√í≤4ÙƒU44RÜF¢ÊF•˜F˜F¬√í“4ÙƒU44RÜFWÊFW˜6óEˆFVGV7FñˆÂˆ÷˜VÁB√í“4ÙƒU44RáíÁñEˆ÷˜VÁB√íì£¶ÁV÷W&ñ22&V÷ñÊñÊuˆ÷˜VÁB¿¢4ÙƒU44RáíÁñE˜7FGW2¬44RtÑT‚4ÙƒU44RáíÁñEˆ÷˜VÁB√í„“u$TDU5BÉ¬4ÙƒU44RÜ∆ñÊU˜7V“Êw&˜75ˆ÷˜VÁB√í≤4ÙƒU44RÜF¢ÊF•˜F˜F¬√í“4ÙƒU44RÜFWÊFW˜6óEˆFVGV7FñˆÂˆ÷˜VÁB√íí‰B4ÙƒU44RáíÁñEˆ÷˜VÁB√í‚DÑT‚wñBrtÑT‚4ÙƒU44RáíÁñEˆ÷˜VÁB√í‚DÑT‚w'Fñ¬rT≈4RwVÁñBrT‰Bí2ñE˜7FGW2¿¢íÁñEˆB¬íÁñEˆ'í¬íÁ6∆ó˜W&¬¬íÊÊ˜FR¬íÁñ÷VÁEˆ÷WFÜˆB¬íÁñ÷VÁE˜&VfW&VÊ6P¢e$Ù“FV6á2@¢ƒTeB§Ùî‚∆ñÊU˜7V“Ù‚∆ñÊU˜7V“ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷S◊BÁFV6ÜÊñ6ñÂ˜W6W&Ê÷P¢ƒTeB§Ùî‚íÙ‚íÁFV6ÜÊñ6ñÂ˜W6W&Ê÷S◊BÁFV6ÜÊñ6ñÂ˜W6W&Ê÷P¢ƒTeB§Ùî‚F¢Ù‚F¢ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷S◊BÁFV6ÜÊñ6ñÂ˜W6W&Ê÷P¢ƒTeB§Ùî‚FWÙ‚FWÁFV6ÜÊñ6ñÂ˜W6W&Ê÷S◊BÁFV6ÜÊñ6ñÂ˜W6W&Ê÷P¢ı$DU"%íÊWEˆ÷˜VÁBDU42¬BÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R46¿¢∑ñ˜WEˆñE–¢ì∞¢&WGW&‚Á&˜w2«¬µ”∞ß–†¶7ñÊ2gVÊ7Fñˆ‚ˆ66˜VÁFñÊu6fUVW'íá6ˆgEˆW'&˜'2¬∆&V¬¬7¬¬&◊2“µ“¬f∆∆&6µ&˜w2“µ“í∞¢G'í∞¢&WGW&‚vóBˆˆ¬ÁVW'íá7¬¬&◊2ì∞¢“6F6ÇÜRí∞¢6ˆgEˆW'&˜'2ÁW6Çá≤66˜S¢∆&V¬¬÷W76vS¢7G&ñÊrÜSÚÊ÷W76vR«¬Rí“ì∞¢&WGW&‚≤&˜w3¢f∆∆&6µ&˜w2”∞¢–ß–†¶ÊvWBÇrˆF÷ñ‚ˆ66˜VÁFñÊr˜6WGFñÊw2r¬&WVó&TF÷ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7B6WGFñÊw2“vóBˆvWD66˜VÁFñÊu6WGFñÊw2Çì∞¢&WGW&‚&W2Êß6ˆ‚á≤ˆ≥¢G'VR¬6WGFñÊw2“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÇttUBˆF÷ñ‚ˆ66˜VÁFñÊr˜6WGFñÊw2r¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜#¢t44ıTÂDî‰uı4UEDî‰u5ÙtUEÙdîƒTBr¬÷W76vS¶RÊ÷W76vR“ì∞¢–ß“ì∞†¶Á˜7BÇrˆF÷ñ‚ˆ66˜VÁFñÊr˜6WGFñÊw2r¬&WVó&TF÷ñÂ6W76ñˆ‚¬W∆ˆBÊfñV∆G2Ö∞¢≤Ê÷S¢v∆ˆvıˆfñ∆Rr¬÷Ñ6˜VÁC¢“¬≤Ê÷S¢w6ñvÊGW&Uˆfñ∆Rr¬÷Ñ6˜VÁC¢“¬≤Ê÷S¢w7F◊ˆfñ∆Rr¬÷Ñ6˜VÁC¢–•“í¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7B7F˜"“ˆ66˜VÁFñÊt7F˜"á&Wì∞¢6ˆÁ7B&Vf˜&R“vóBˆvWD66˜VÁFñÊu6WGFñÊw2Çì∞¢6ˆÁ7BÊWáB“ˆ66˜VÁFñÊu6WGFñÊw4g&ˆ‘&ˆGíá&WÊ&ˆGí«¬∑“¬&Vf˜&Rì∞¢6ˆÁ7Bfñ∆W2“&WÊfñ∆W2«¬∑”∞¢6ˆÁ7B∆ˆvÚ“fñ∆W2Ê∆ˆvıˆfñ∆SÚÂ≥“ÚvóBˆ66˜VÁFñÊu6fUW∆ˆFVD76WBÜfñ∆W2Ê∆ˆvıˆfñ∆U≥“¬v6ˆ◊Áírí¢rs∞¢6ˆÁ7B6ñr“fñ∆W2Á6ñvÊGW&Uˆfñ∆SÚÂ≥“ÚvóBˆ66˜VÁFñÊu6fUW∆ˆFVD76WBÜfñ∆W2Á6ñvÊGW&Uˆfñ∆U≥“¬w6ñvÊGW&W2rí¢rs∞¢6ˆÁ7B7F◊“fñ∆W2Á7F◊ˆfñ∆SÚÂ≥“ÚvóBˆ66˜VÁFñÊu6fUW∆ˆFVD76WBÜfñ∆W2Á7F◊ˆfñ∆U≥“¬w7F◊2rí¢rs∞¢ñbÜ∆ˆvÚíÊWáBÊ∆ˆvı˜W&¬“∆ˆvÛ∞¢ñbá6ñríÊWáBÁ6ñvÊGW&U˜W&¬“6ñs∞¢ñbá7F◊íÊWáBÁ7F◊˜W&¬“7F◊∞¢6ˆÁ7BfñÊ≈6WGFñÊw2“ˆ÷W&vT66˜VÁFñÊt6ˆ◊Áï6WGFñÊw2ÜÊWáBì∞¢vóBˆVÁ7W&T66˜VÁFñÊt6ˆ◊Áï6WGFñÊw566ÜV÷Çì∞¢6ˆÁ7Bñ∆ˆDß6ˆ‚“•4Ù‚Á7G&ñÊvñgíÜfñÊ≈6WGFñÊw2ì∞¢6ˆÁ7BWB“vóBˆˆ¬ÁVW'íÄ¢UDDRV&∆ñ2Ê66˜VÁFñÊuˆ6ˆ◊Áï˜6WGFñÊw0¢4UBf«VUˆß6ˆ„“C£¶ß6ˆÊ"¬WFFVEˆ'ì“C"¬WFFVEˆC‘‰ırÇê¢tÑU$RñC”¿¢∑ñ∆ˆDß6ˆ‚¬7F˜"ÁW6W&Ê÷R«¬ÁV∆≈–¢ì∞¢ñbÇWBÁ&˜t6˜VÁBí∞¢vóBˆˆ¬ÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2Ê66˜VÁFñÊuˆ6ˆ◊Áï˜6WGFñÊw2ÜñB¬f«VUˆß6ˆ‚¬WFFVEˆ'í¬WFFVEˆBê¢d≈TU2É¬C£¶ß6ˆÊ"¬C"ƒ‰ırÇíñ¿¢∑ñ∆ˆDß6ˆ‚¬7F˜"ÁW6W&Ê÷R«¬ÁV∆≈–¢ì∞¢–¢vóB∆ˆt66˜VÁFñÊtVFóBá&W¬≤7Fñˆ„¢uUDDUÙ44ıTÂDî‰uı4UEDî‰u2r¬VÁFóGï˜GóS¢v66˜VÁFñÊuˆ6ˆ◊Áï˜6WGFñÊw2r¬VÁFóGïˆñC¢sr¬&Vf˜&Uˆß6ˆ„¶&Vf˜&R¬gFW%ˆß6ˆ„¶fñÊ≈6WGFñÊw2¬Ê˜FS¢~òàòûòNà.â^ãòûà~àNòéã.à.òûäﬁäãûä^âÆä>ãNäûãâ~äÆã>äæä>ãâÆäﬁäﬁàòäﬁàäÆã.ä2r“ì∞¢&WGW&‚&W2Êß6ˆ‚á≤ˆ≥ßG'VR¬6WGFñÊw3¢fñÊ≈6WGFñÊw2“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Çuı5BˆF÷ñ‚ˆ66˜VÁFñÊr˜6WGFñÊw2r¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜#¢t44ıTÂDî‰uı4UEDî‰u5ı4dUÙdîƒTBr¬÷W76vS¶RÊ÷W76vR“ì∞¢–ß“ì∞†¶ÁW6RÜ7&VFT66˜VÁFñÊu&VDˆÊ«ï&˜WFW2á∞¢ˆˆ¬¿¢&WVó&T66˜VÁFñÊuW&÷ó76ñˆ‚¿¢66˜VÁFñÊu6fUVW'ì¢ˆ66˜VÁFñÊu6fUVW'í¿¢66˜VÁFñÊt6&C¢ˆ66˜VÁFñÊt6&B¿¢66˜VÁFñÊu&WfVÁVU7FGW3¢ˆ66˜VÁFñÊu&WfVÁVU7FGW2¿¢66˜VÁFñÊu7F˜&VEñ˜WEFV6Ö&˜w3¢ˆ66˜VÁFñÊu7F˜&VEñ˜WEFV6Ö&˜w2¿¢66˜VÁFñÊtVÁ&ñ6Öñ˜WEFV6Ö&˜w3¢ˆ66˜VÁFñÊtVÁ&ñ6Öñ˜WEFV6Ö&˜w2¿¢66˜VÁFñÊuñ˜WDGVTFFS¢ˆ66˜VÁFñÊuñ˜WDGVTFFR¿¢66˜VÁFñÊuFÜîFFS¢ˆ66˜VÁFñÊuFÜîFFR¿¢66˜VÁFñÊuñ˜WD7WFˆfd∆&V√¢ˆ66˜VÁFñÊuñ˜WD7WFˆfd∆&V¬¿¢66˜VÁFñÊuváD÷ˆÁFÑ∂Wîg&ˆ’W&ñˆC¢ˆ66˜VÁFñÊuváD÷ˆÁFÑ∂Wîg&ˆ’W&ñˆB¿¢66˜VÁFñÊuváD÷ˆÁFÑ∆&V√¢ˆ66˜VÁFñÊuváD÷ˆÁFÑ∆&V¬¿¢'Vñ∆Eñ˜WEFV6Ö7V÷÷'ï&˜w3¢ˆ'Vñ∆Eñ˜WEFV6Ö7V÷÷'ï&˜w2¿¢vWEñ˜WEW&ñˆC¢ˆvWEñ˜WEW&ñˆB¿¢÷6µÜˆÊS¢ˆ÷6µÜˆÊR¿¢÷ˆÊWì¢ˆ÷ˆÊWí¿¢ñE7FGW3¢˜ñE7FGW2¿¢7ƒFˆÊU&VFñ6FS¢˜7ƒFˆÊU&VFñ6FR¿¢VÁ7W&TGVUñ˜WEW&ñˆG4&Êv∂ˆ≥¢ˆVÁ7W&TGVUñ˜WEW&ñˆG4&Êv∂ˆ≤¿ß“íì∞†¶Á˜7BÇrˆF÷ñ‚ˆ66˜VÁFñÊr˜&WfVÁVRÛ¶¶ˆ%ˆñBˆ÷&≤◊ñBr¬&WVó&T66˜VÁFñÊuW&÷ó76ñˆ‚Çv66˜VÁFñÊuˆ÷ÊvU˜&WfVÁVRrí¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7B¶ˆ%ˆñB“7G&ñÊrá&WÁ&◊2Ê¶ˆ%ˆñB«¬rríÁG&ñ“Çì∞¢6ˆÁ7B&ˆGí“&WÊ&ˆGí«¬∑”∞¢ñbÇ¶ˆ%ˆñBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢t‘ï54î‰uÙ§Ù%ÙîBr“ì∞¢ñbÇıÂ∆B≤BÚÁFW7BÜ¶ˆ%ˆñBíí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢tîÂdƒîEÙ§Ù%ÙîBr“ì∞¢ñbÜ&ˆGíÊ6ˆÊfó&’˜&V6VófVB”“G'VRí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢t4Ù‰dï$’ı$T4TïdTEı$UTï$TBr“ì∞†¢6ˆÁ7B&Vf˜&U“vóBˆˆ¬ÁVW'íÄ¢4TƒT5B¶ˆ%ˆñB¬&ˆˆ∂ñÊuˆ6ˆFR¬¶ˆ%˜7FGW2¬fñÊó6ÜVEˆB¬6Ê6V∆VEˆB¬ñ÷VÁE˜7FGW2¬ñEˆB¬ñEˆ'í¿¢ñ÷VÁEˆ÷WFÜˆB¬ñ÷VÁE˜&VfW&VÊ6R¬ñ÷VÁEˆÊ˜FR¿¢ÇGµ˜7ƒFˆÊU&VFñ6FRÇv¢ró“í2ó5ˆ6ˆ◊∆WFV@¢e$Ù“V&∆ñ2Ê¶ˆ'2†¢tÑU$R¢Ê¶ˆ%ˆñC“C¢ƒî‘ïB¿¢∂¶ˆ%ˆñE–¢ì∞¢6ˆÁ7B&Vf˜&R“&Vf˜&UÁ&˜w5≥”∞¢ñbÇ&Vf˜&Rí&WGW&‚&W2Á7FGW2ÉCBíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢t§Ù%Ù‰ıEÙdıT‰Br“ì∞¢6ˆÁ7B7B“7G&ñÊrÜ&Vf˜&RÊ¶ˆ%˜7FGW2«¬rríÁG&ñ“ÇíÁFÙ∆˜vW$66RÇì∞¢ñbÜ&Vf˜&RÊ6Ê6V∆VEˆB«¬≤~ä.àòä^ãNàr¬v6Ê6V∆∆VBr¬v6Ê6V∆VBu“ÊñÊ6«VFW2á7Bíí∞¢&WGW&‚&W2Á7FGW2ÉCííÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢t4‰‰ıEÙ‘$µÙ4‰4TƒTEÙ§Ù%ıîBr“ì∞¢–¢6ˆÁ7B7F˜"“ˆ66˜VÁFñÊt7F˜"á&Wì∞¢ñbÇ&Vf˜&RÊó5ˆ6ˆ◊∆WFVBbb7F˜"Á&ˆ∆R”“w7WW%ˆF÷ñ‚rí∞¢&WGW&‚&W2Á7FGW2ÉCííÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢t§Ù%Ù‰ıEÙ4Ù’ƒUDTBr“ì∞¢–¢ñbÇ&Vf˜&RÊó5ˆ6ˆ◊∆WFVBbb&ˆGíÊ6ˆÊfó&’ˆÊˆÂˆ6ˆ◊∆WFVB”“G'VRí∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢t4Ù‰dï$’Ù‰ÙÂÙ4Ù’ƒUDTEı$UTï$TBr“ì∞¢–†¢6ˆÁ7Bñ÷VÁEˆ÷WFÜˆB“7G&ñÊrÜ&ˆGíÁñ÷VÁEˆ÷WFÜˆB«¬rríÁG&ñ“Çí«¬ÁV∆√∞¢6ˆÁ7Bñ÷VÁE˜&VfW&VÊ6R“7G&ñÊrÜ&ˆGíÁñ÷VÁE˜&VfW&VÊ6R«¬rríÁG&ñ“Çí«¬ÁV∆√∞¢6ˆÁ7Bñ÷VÁEˆÊ˜FR“7G&ñÊrÜ&ˆGíÊÊ˜FR«¬rríÁG&ñ“Çí«¬ÁV∆√∞†¢vóBˆˆ¬ÁVW'íÄ¢UDDRV&∆ñ2Ê¶ˆ'0¢4UBñ÷VÁE˜7FGW3“wñBr¿¢ñEˆC‘4ÙƒU44RáñEˆB¬‰ırÇíí¿¢ñEˆ'ì“C"¿¢ñ÷VÁEˆ÷WFÜˆC‘4ÙƒU44RÇC2¬ñ÷VÁEˆ÷WFÜˆBí¿¢ñ÷VÁE˜&VfW&VÊ6S‘4ÙƒU44RÇCB¬ñ÷VÁE˜&VfW&VÊ6Rí¿¢ñ÷VÁEˆÊ˜FS‘4ÙƒU44RÇCR¬ñ÷VÁEˆÊ˜FRê¢tÑU$R¶ˆ%ˆñC“C¿¢∂¶ˆ%ˆñB¬7F˜"ÁW6W&Ê÷R«¬ÁV∆¬¬ñ÷VÁEˆ÷WFÜˆB¬ñ÷VÁE˜&VfW&VÊ6R¬ñ÷VÁEˆÊ˜FU–¢ì∞†¢6ˆÁ7BgFW%“vóBˆˆ¬ÁVW'íÄ¢4TƒT5B¶ˆ%ˆñB¬&ˆˆ∂ñÊuˆ6ˆFR¬¶ˆ%˜7FGW2¬fñÊó6ÜVEˆB¬ñ÷VÁE˜7FGW2¬ñEˆB¬ñEˆ'í¿¢ñ÷VÁEˆ÷WFÜˆB¬ñ÷VÁE˜&VfW&VÊ6R¬ñ÷VÁEˆÊ˜FP¢e$Ù“V&∆ñ2Ê¶ˆ'0¢tÑU$R¶ˆ%ˆñC“C¢ƒî‘ïB¿¢∂¶ˆ%ˆñE–¢ì∞¢6ˆÁ7BgFW"“gFW%Á&˜w5≥“«¬ÁV∆√∞†¢∆WBFV6Öˆ66Öˆˆfg6WB“ÁV∆√∞¢G'í∞¢FV6Öˆ66Öˆˆfg6WB“vóBFV6ÜÊñ6ñ‰66Ñ6ˆ∆∆V7FñˆÁ2ÊVÁ7W&Tˆfg6WDf˜$¶ˆ"á∞¢¶ˆ%ˆñB¿¢7F˜%˜W6W&Ê÷S¢7F˜"ÁW6W&Ê÷R«¬ÁV∆¬¿¢6˜W&6S¢v66˜VÁFñÊuˆ÷&µ˜&WfVÁVU˜ñBr¿¢“ì∞¢“6F6ÇÜ66ÑW'"í∞¢FV6Öˆ66Öˆˆfg6WB“≤ˆ≥¢f«6R¬W'&˜#¢7G&ñÊrÜ66ÑW'#ÚÊ6ˆFR«¬66ÑW'#ÚÊ÷W76vR«¬uDT4ÖÙ44ÖÙÙde4UEÙdîƒTBrí”∞¢–†¢vóB∆ˆt66˜VÁFñÊtVFóBá&W¬∞¢7Fñˆ„¢t‘$µı$UdTÂTUıîBr¿¢VÁFóGï˜GóS¢v¶ˆ"r¿¢VÁFóGïˆñC¢¶ˆ%ˆñB¿¢&Vf˜&Uˆß6ˆ„¢&Vf˜&R¿¢gFW%ˆß6ˆ„¢≤&˜s¢gFW"¬FV6Öˆ66Öˆˆfg6WB“¿¢Ê˜FS¢ñ÷VÁEˆÊ˜FR«¬ñ÷VÁE˜&VfW&VÊ6R«¬ñ÷VÁEˆ÷WFÜˆB«¬ÁV∆¬¿¢“ì∞¢&WGW&‚&W2Êß6ˆ‚á≤ˆ≥¢G'VR¬¶ˆ%ˆñB¬ñ÷VÁE˜7FGW3¢wñBr¬&˜s¢gFW"¬FV6Öˆ66Öˆˆfg6WB“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Çuı5BˆF÷ñ‚ˆ66˜VÁFñÊr˜&WfVÁVRÛ¶¶ˆ%ˆñBˆ÷&≤◊ñBr¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢t‘$µı$UdTÂTUıîEÙdîƒTBr“ì∞¢–ß“ì∞†¶Á˜7BÇrˆF÷ñ‚ˆ66˜VÁFñÊr˜&WfVÁVRÛ¶¶ˆ%ˆñB˜7ñÊ2◊FV6Ç÷66Çr¬&WVó&T66˜VÁFñÊuW&÷ó76ñˆ‚Çv66˜VÁFñÊuˆ÷ÊvU˜&WfVÁVRrí¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7B¶ˆ%ˆñB“7G&ñÊrá&WÁ&◊2Ê¶ˆ%ˆñB«¬rríÁG&ñ“Çì∞¢ñbÇ¶ˆ%ˆñB«¬ıÂ∆B≤BÚÁFW7BÜ¶ˆ%ˆñBíí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢tîÂdƒîEÙ§Ù%ÙîBr“ì∞¢6ˆÁ7B&Vf˜&U“vóBˆˆ¬ÁVW'íÄ¢4TƒT5B¶ˆ%ˆñB¬&ˆˆ∂ñÊuˆ6ˆFR¬6∆˜6U˜ñ÷VÁEˆ÷WFÜˆB¬6∆˜6Uˆ66Öˆ÷˜VÁB¬6∆˜6Uˆ66Öˆ6ˆÊfó&÷VB¬ñ÷VÁE˜7FGW0¢e$Ù“V&∆ñ2Ê¶ˆ'0¢tÑU$R¶ˆ%ˆñC“C¢ƒî‘ïB¿¢∂¶ˆ%ˆñE–¢ì∞¢6ˆÁ7B&Vf˜&R“&Vf˜&UÁ&˜w5≥“«¬ÁV∆√∞¢ñbÇ&Vf˜&Rí&WGW&‚&W2Á7FGW2ÉCBíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢t§Ù%Ù‰ıEÙdıT‰Br“ì∞†¢6ˆÁ7B&W7V«B“vóBFV6ÜÊñ6ñ‰66Ñ6ˆ∆∆V7FñˆÁ2ÊVÁ7W&Tˆfg6WDf˜$¶ˆ"á∞¢¶ˆ%ˆñB¿¢7F˜%˜W6W&Ê÷S¢ˆ66˜VÁFñÊt7F˜"á&WíÁW6W&Ê÷R«¬ÁV∆¬¿¢6˜W&6S¢v66˜VÁFñÊuˆ÷ÁV≈˜7ñÊ5˜FV6Öˆ66Çr¿¢“ì∞†¢vóB∆ˆt66˜VÁFñÊtVFóBá&W¬∞¢7Fñˆ„¢u5î‰5ıDT4ÖÙ44ÖÙ4ÙƒƒT5DîÙ‚r¿¢VÁFóGï˜GóS¢v¶ˆ"r¿¢VÁFóGïˆñC¢¶ˆ%ˆñB¿¢&Vf˜&Uˆß6ˆ„¢&Vf˜&R¿¢gFW%ˆß6ˆ„¢&W7V«B¿¢Ê˜FS¢&W7V«BÁ6∂óVBÚ6∂ó¢G∑&W7V«BÁ&V6ˆ‚«¬rw÷¢ˆfg6WBG∑&W7V«BÊ÷˜VÁB«¬“FÚG∑&W7V«BÁñ˜WEˆñB«¬rw÷¿¢“ì∞¢&WGW&‚&W2Êß6ˆ‚á≤ˆ≥¢G'VR¬¶ˆ%ˆñB¬&W7V«B“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Çuı5BˆF÷ñ‚ˆ66˜VÁFñÊr˜&WfVÁVRÛ¶¶ˆ%ˆñB˜7ñÊ2◊FV6Ç÷66Çr¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢RÊ6ˆFR«¬u5î‰5ıDT4ÖÙ44ÖÙdîƒTBr¬÷W76vS¢RÊ÷W76vR“ì∞¢–ß“ì∞††¶Á˜7BÇrˆF÷ñ‚ˆ66˜VÁFñÊrˆWáVÁ6W2r¬&WVó&T66˜VÁFñÊuW&÷ó76ñˆ‚Çv66˜VÁFñÊuˆ÷ÊvUˆWáVÁ6Rrí¬W∆ˆBÁ6ñÊv∆RÇw&ˆˆbrí¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7B&ˆGí“&WÊ&ˆGí«¬∑”∞¢6ˆÁ7B÷˜VÁB“ˆ÷ˆÊWíÜ&ˆGíÊ÷˜VÁBì∞¢ñbÇ&ˆGíÊWáVÁ6UˆFFRí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢tUÖTÂ4UÙDDUı$UTï$TBr“ì∞¢ñbÇ7G&ñÊrÜ&ˆGíÊ6FVv˜'í«¬rríÁG&ñ“Çíí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢tUÖTÂ4UÙ4DTtı%ïı$UTï$TBr“ì∞¢ñbÑÁV÷&W"Ü÷˜VÁB«¬í√“í&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢tîÂdƒîEÙUÖTÂ4UÙ‘ıTÂBr“ì∞¢6ˆÁ7B7F˜"“ˆ66˜VÁFñÊt7F˜"á&Wì∞¢∆WB&ˆˆeW&¬“7G&ñÊrÜ&ˆGíÁ&ˆˆe˜W&¬«¬rríÁG&ñ“Çí«¬ÁV∆√∞¢∆WB˜&ñvñÊƒÊ÷R“ÁV∆√∞¢∆WB÷ñ÷UGóR“ÁV∆√∞¢∆WBfñ∆U6ó¶R“ÁV∆√∞¢ñbá&WÊfñ∆Rí∞¢˜&ñvñÊƒÊ÷R“&WÊfñ∆RÊ˜&ñvñÊ∆Ê÷R«¬ÁV∆√∞¢÷ñ÷UGóR“&WÊfñ∆RÊ÷ñ÷WGóR«¬ÁV∆√∞¢fñ∆U6ó¶R“&WÊfñ∆RÁ6ó¶R«¬ÁV∆√∞¢ñbÑ4ƒıTDî‰%ïÙT‰$ƒTBí∞¢6ˆÁ7BV&∆ñ4ñB“WáVÁ6UÚG¥FFRÊÊ˜rÇó’ÚG∂7'óFÚÁ&ÊFˆ’UTîBÇíÁ6∆ñ6RÉ√Çó÷∞¢6ˆÁ7BW“vóB6∆˜VFñÊ'ïW∆ˆD'VffW"á≤'VffW#¢&WÊfñ∆RÊ'VffW"¬÷ñ÷WGóS¢&WÊfñ∆RÊ÷ñ÷WGóR«¬vñ÷vRˆßVrr¬fˆ∆FW#¢v7vbˆ66˜VÁFñÊrˆWáVÁ6W2r¬V&∆ñ4ñB¬G&Á6f˜&÷Fñˆ„¢v5ˆ∆ñ÷óB«uÛc˜ˆWFÚˆeˆWFÚr“ì∞¢&ˆˆeW&¬“WÁ6V7W&U˜W&√∞¢“V«6R∞¢&ˆˆeW&¬“6fUW∆ˆFVDfñ∆Rá&WÊfñ∆R¬UƒÙEÙDï"¬v66˜VÁFñÊuˆWáVÁ6Rrì∞¢–¢–¢6ˆÁ7BñÁ2“vóBˆˆ¬ÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2Ê66˜VÁFñÊuˆWáVÁ6W2Ä¢WáVÁ6UˆFFR¬6FVv˜'í¬fVÊF˜%ˆÊ÷R¬FW67&óFñˆ‚¬÷˜VÁB¬fEˆ÷˜VÁB¬vóFÜÜˆ∆FñÊuˆ÷˜VÁB¿¢ñ÷VÁEˆ÷WFÜˆB¬ñ÷VÁE˜&VfW&VÊ6R¬&ˆˆe˜W&¬¬¶ˆ%ˆñB¬7FGW2¬7&VFVEˆ'í¬WFFVEˆ'ê¢íd≈TU2ÇC¬C"¬C2¬CB¬CR¬Cb¬Cr¬CÇ¬Cí¬C¬C¬w7V&÷óGFVBr¬C"¬C"ê¢$UEU$‰î‰r¶¿¢∞¢&ˆGíÊWáVÁ6UˆFFR¿¢7G&ñÊrÜ&ˆGíÊ6FVv˜'í«¬rríÁG&ñ“Çí¿¢7G&ñÊrÜ&ˆGíÁfVÊF˜%ˆÊ÷R«¬rríÁG&ñ“Çí«¬ÁV∆¬¿¢7G&ñÊrÜ&ˆGíÊFW67&óFñˆ‚«¬rríÁG&ñ“Çí«¬ÁV∆¬¿¢÷˜VÁB¿¢ˆ÷ˆÊWíÜ&ˆGíÁfEˆ÷˜VÁB«¬í¿¢ˆ÷ˆÊWíÜ&ˆGíÁvóFÜÜˆ∆FñÊuˆ÷˜VÁB«¬í¿¢7G&ñÊrÜ&ˆGíÁñ÷VÁEˆ÷WFÜˆB«¬rríÁG&ñ“Çí«¬ÁV∆¬¿¢7G&ñÊrÜ&ˆGíÁñ÷VÁE˜&VfW&VÊ6R«¬rríÁG&ñ“Çí«¬ÁV∆¬¿¢&ˆˆeW&¬¿¢&ˆGíÊ¶ˆ%ˆñBÚÁV÷&W"Ü&ˆGíÊ¶ˆ%ˆñBí¢ÁV∆¬¿¢7F˜"ÁW6W&Ê÷R«¬ÁV∆¬¿¢–¢ì∞¢6ˆÁ7B&˜r“ñÁ2Á&˜w5≥”∞¢ñbá&ˆˆeW&¬í∞¢vóBˆˆ¬ÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2Ê66˜VÁFñÊuˆWáVÁ6UˆGF6Ü÷VÁG2ÜWáVÁ6UˆñB¬V&∆ñ5˜W&¬¬˜&ñvñÊ≈ˆÊ÷R¬÷ñ÷U˜GóR¬fñ∆U˜6ó¶R¬W∆ˆFVEˆ'íê¢d≈TU2ÇC¬C"¬C2¬CB¬CR¬Cbñ¿¢∑&˜rÊWáVÁ6UˆñB¬&ˆˆeW&¬¬˜&ñvñÊƒÊ÷R¬÷ñ÷UGóR¬fñ∆U6ó¶R¬7F˜"ÁW6W&Ê÷R«¬ÁV∆≈–¢ì∞¢–¢vóB∆ˆt66˜VÁFñÊtVFóBá&W¬∞¢7Fñˆ„¢t5$TDUÙUÖTÂ4Rr¿¢VÁFóGï˜GóS¢v66˜VÁFñÊuˆWáVÁ6Rr¿¢VÁFóGïˆñC¢7G&ñÊrá&˜rÊWáVÁ6UˆñBí¿¢gFW%ˆß6ˆ„¢&˜r¿¢Ê˜FS¢&˜rÊFW67&óFñˆ‚«¬&˜rÊ6FVv˜'í«¬ÁV∆¬¿¢“ì∞¢&WGW&‚&W2Êß6ˆ‚á≤ˆ≥¢G'VR¬&˜r“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Çuı5BˆF÷ñ‚ˆ66˜VÁFñÊrˆWáVÁ6W2r¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢t5$TDUÙUÖTÂ4UÙdîƒTBr¬÷W76vS¢RÊ÷W76vR“ì∞¢–ß“ì∞††¶Á˜7BÇrˆF÷ñ‚ˆ66˜VÁFñÊrˆFˆ7V÷VÁG2r¬&WVó&T66˜VÁFñÊuW&÷ó76ñˆ‚Çv66˜VÁFñÊuˆ÷ÊvUˆFˆ7V÷VÁG2rí¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7B&ˆGí“&WÊ&ˆGí«¬∑”∞¢6ˆÁ7BFˆ7V÷VÁE˜GóR“7G&ñÊrÜ&ˆGíÊFˆ7V÷VÁE˜GóR«¬rríÁG&ñ“Çì∞¢ñbÇ≤wV˜FFñˆ‚r¬vñÁfˆñ6Rr¬w&V6VóBr¬wFÖˆñÁfˆñ6Ru“ÊñÊ6«VFW2ÜFˆ7V÷VÁE˜GóRíí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢tîÂdƒîEÙDÙ5T‘TÂEıEïRr“ì∞¢6ˆÁ7B7F˜"“ˆ66˜VÁFñÊt7F˜"á&Wì∞¢6ˆÁ7Bó77VTFFR“&ˆGíÊó77VUˆFFR«¬ÊWrFFRÇíÁFÙï4ı7G&ñÊrÇíÁ6∆ñ6RÉ√ì∞¢6ˆÁ7BGVTFFR“&ˆGíÊGVUˆFFR«¬&ˆGíÊWáó&UˆFFR«¬ÁV∆√∞¢6ˆÁ7Bó77VTÊ˜r“&ˆGíÊó77VUˆÊ˜r””“G'VR«¬7G&ñÊrÜ&ˆGíÊó77VUˆÊ˜r«¬rríÁFÙ∆˜vW$66RÇí””“wG'VRr«¬Fˆ7V÷VÁE˜GóR””“wFÖˆñÁfˆñ6Rs∞¢6ˆÁ7B7FGW2“ó77VTÊ˜rÚvó77VVBr¢vG&gBs∞¢6ˆÁ7B¶ˆ%ˆñB“ÁV÷&W"Ü&ˆGíÊ¶ˆ%ˆñB«¬í«¬ÁV∆√∞¢∆WB7W7Fˆ÷W%ˆÊ÷R“7G&ñÊrÜ&ˆGíÊ7W7Fˆ÷W%ˆÊ÷R«¬rríÁG&ñ“Çí«¬ÁV∆√∞¢∆WB7W7Fˆ÷W%˜ÜˆÊR“7G&ñÊrÜ&ˆGíÊ7W7Fˆ÷W%˜ÜˆÊR«¬rríÁG&ñ“Çí«¬ÁV∆√∞¢∆WB7W7Fˆ÷W%˜FÖˆñB“7G&ñÊrÜ&ˆGíÊ7W7Fˆ÷W%˜FÖˆñB«¬rríÁG&ñ“Çí«¬ÁV∆√∞¢∆WB7W7Fˆ÷W%ˆFG&W72“7G&ñÊrÜ&ˆGíÊ7W7Fˆ÷W%ˆFG&W72«¬&ˆGíÊFG&W75˜FWáB«¬rríÁG&ñ“Çí«¬ÁV∆√∞¢∆WB6˜W&6Uñ∆ˆB“≤6˜W&6S¢¶ˆ%ˆñBÚv¶ˆ"r¢v÷ÁV≈ˆ66˜VÁFñÊrr¬Ê˜FS¢&ˆGíÊÊ˜FR«¬ÁV∆¬”∞¢∆WB7V'F˜F¬“¬fEˆ÷˜VÁB“¬vóFÜÜˆ∆FñÊuˆ÷˜VÁB“¬F˜F≈ˆ÷˜VÁB“∞¢∆WB∆ñÊTóFV◊2“'&íÊó4'&íÜ&ˆGíÊ∆ñÊUˆóFV◊2íÚ&ˆGíÊ∆ñÊUˆóFV◊2¢µ”∞†¢ñbÜ¶ˆ%ˆñBí∞¢6ˆÁ7B¶ˆ"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5B¢Ê¶ˆ%ˆñB¬¢Ê&ˆˆ∂ñÊuˆ6ˆFR¬¢Ê7W7Fˆ÷W%ˆÊ÷R¬¢Ê7W7Fˆ÷W%˜ÜˆÊR¬¢Ê¶ˆ%˜&ñ6R¬¢Áñ÷VÁE˜7FGW2¬¢ÁñEˆB¿¢4ÙƒU44RÑÂTƒƒîbÖ5T“Ñ4ÙƒU44RÜ¶íÊ∆ñÊU˜F˜F¬√íí√í¬4ÙƒU44RÜ¢Ê¶ˆ%˜&ñ6R√í¬ì£¶ÁV÷W&ñ227V'F˜F¿¢e$Ù“V&∆ñ2Ê¶ˆ'2†¢ƒTeB§Ùî‚V&∆ñ2Ê¶ˆ%ˆóFV◊2¶íÙ‚45BÜ¶íÊ¶ˆ%ˆñB2DUÖBì‘45BÜ¢Ê¶ˆ%ˆñB2DUÖBê¢tÑU$R¢Ê¶ˆ%ˆñC“C¢u$ıU%í¢Ê¶ˆ%ˆñB¬¢Ê&ˆˆ∂ñÊuˆ6ˆFR¬¢Ê7W7Fˆ÷W%ˆÊ÷R¬¢Ê7W7Fˆ÷W%˜ÜˆÊR¬¢Ê¶ˆ%˜&ñ6R¬¢Áñ÷VÁE˜7FGW2¬¢ÁñEˆ@¢ƒî‘ïB¿¢∂¶ˆ%ˆñE–¢ì∞¢ñbÇ¶ˆ"Á&˜w5≥“í&WGW&‚&W2Á7FGW2ÉCBíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢t§Ù%Ù‰ıEÙdıT‰Br“ì∞¢6ˆÁ7B¢“¶ˆ"Á&˜w5≥”∞¢7W7Fˆ÷W%ˆÊ÷R“7W7Fˆ÷W%ˆÊ÷R«¬¢Ê7W7Fˆ÷W%ˆÊ÷R«¬ÁV∆√∞¢7W7Fˆ÷W%˜ÜˆÊR“7W7Fˆ÷W%˜ÜˆÊR«¬¢Ê7W7Fˆ÷W%˜ÜˆÊR«¬ÁV∆√∞¢7V'F˜F¬“ˆ÷ˆÊWíÜ¢Á7V'F˜F¬«¬ì∞¢∆ñÊTóFV◊2“∆ñÊTóFV◊2Ê∆VÊwFÇÚ∆ñÊTóFV◊2¢∑≤FW67&óFñˆ„¢àNòéã.âÆä>ãNàã.ä>à~ã.âíG∂¢Ê&ˆˆ∂ñÊuˆ6ˆFR«¬¢Ê¶ˆ%ˆñG÷¬VÁFóGì¢¬VÊóE˜&ñ6S¢7V'F˜F¬¬∆ñÊU˜F˜F√¢7V'F˜F¬’”∞¢6˜W&6Uñ∆ˆB“≤‚‚Á6˜W&6Uñ∆ˆB¬&ˆˆ∂ñÊuˆ6ˆFS¢¢Ê&ˆˆ∂ñÊuˆ6ˆFR«¬ÁV∆¬¬&u˜ñ÷VÁE˜7FGW3¢¢Áñ÷VÁE˜7FGW2«¬ÁV∆¬¬ñEˆC¢¢ÁñEˆB«¬ÁV∆¬”∞¢“V«6R∞¢ñbÇ7W7Fˆ÷W%ˆÊ÷Rí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢t5U5DÙ‘U%Ù‰‘Uı$UTï$TBr“ì∞¢ñbÇ∆ñÊTóFV◊2Ê∆VÊwFÇí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢tƒî‰UÙïDT’5ı$UTï$TBr“ì∞¢∆ñÊTóFV◊2“∆ñÊTóFV◊2Ê÷ÇÜóB¬íí”‚∞¢6ˆÁ7B5GóR“7G&ñÊrÜóBÊ5˜GóR«¬óBÊó%˜GóR«¬wv∆¬ríÁG&ñ“Çì∞¢6ˆÁ7Bv6Öf&ñÁB“5GóR””“wv∆¬rÚ7G&ñÊrÜóBÁv6Ö˜f&ñÁB«¬rríÁG&ñ“Çí¢rs∞¢6ˆÁ7BGí“÷FÇÊ÷ÇÉ¬ÁV÷&W"ÜóBÁVÁFóGí«¬óBÁGí«¬íì∞¢6ˆÁ7BVÊóB“ˆ÷ˆÊWíÜóBÁVÊóE˜&ñ6R«¬óBÁ&ñ6R«¬ì∞¢6ˆÁ7B∆ñÊUF˜F¬“ˆ÷ˆÊWíáGí¢VÊóBì∞¢&WGW&‚∞¢ÊÛ¢í≤¿¢¶ˆ%˜GóS¢7G&ñÊrÜóBÊ¶ˆ%˜GóR«¬~ä^òûã.à~òäﬁä>ò¬ríÁG&ñ“Çí¿¢5˜GóS¢5GóR¿¢v6Ö˜f&ñÁC¢v6Öf&ñÁB¿¢'GS¢7G&ñÊrÜóBÊ'GR«¬rríÁG&ñ“Çí¿¢FW67&óFñˆ„¢7G&ñÊrÜóBÊFW67&óFñˆ‚«¬G∂óBÊ¶ˆ%˜GóR«¬~âÆä>ãNàã.ä2w“G∂5GóR””“wv∆¬rbbv6Öf&ñÁBÚv6Öf&ñÁB¢rw“G∂óBÊ'GR«¬rw÷íÁG&ñ“Çí¿¢VÁFóGì¢Gí¿¢VÊóE˜&ñ6S¢VÊóB¿¢∆ñÊU˜F˜F√¢∆ñÊUF˜F¬¿¢”∞¢“ì∞¢7V'F˜F¬“ˆ÷ˆÊWíÜ∆ñÊTóFV◊2Á&VGV6RÇá7V“¬óBí”‚7V“≤ÁV÷&W"ÜóBÊ∆ñÊU˜F˜F¬«¬í¬íì∞¢–¢6ˆÁ7BFó66˜VÁEˆ÷˜VÁB“ˆ÷ˆÊWíÜ&ˆGíÊFó66˜VÁEˆ÷˜VÁB«¬ì∞¢6ˆÁ7BfE&FR“ˆ÷ˆÊWíÜ&ˆGíÁfE˜&FR”“ÁV∆¬ÚÜFˆ7V÷VÁE˜GóR””“wFÖˆñÁfˆñ6RrÚr¢í¢&ˆGíÁfE˜&FRì∞¢fEˆ÷˜VÁB“ˆ÷ˆÊWíÑ÷FÇÊ÷ÇÉ¬7V'F˜F¬“Fó66˜VÁEˆ÷˜VÁBí¢fE&FRÚì∞¢vóFÜÜˆ∆FñÊuˆ÷˜VÁB“ˆ÷ˆÊWíÜ&ˆGíÁvóFÜÜˆ∆FñÊuˆ÷˜VÁB«¬ì∞¢F˜F≈ˆ÷˜VÁB“ˆ÷ˆÊWíÑ÷FÇÊ÷ÇÉ¬7V'F˜F¬“Fó66˜VÁEˆ÷˜VÁBí≤fEˆ÷˜VÁB“vóFÜÜˆ∆FñÊuˆ÷˜VÁBì∞†¢6ˆÁ7BFˆ4ÊÚ“vóBˆ66˜VÁFñÊtÊWáDFˆ7V÷VÁDÊÚÜFˆ7V÷VÁE˜GóRì∞¢6ˆÁ7Bñ∆ˆB“≤‚‚Á6˜W&6Uñ∆ˆB¬∆ñÊUˆóFV◊3¢∆ñÊTóFV◊2¬fE˜&FS¢fE&FR¬Fó66˜VÁEˆ÷˜VÁB¬Wáó&UˆFFS¢GVTFFR¬6ˆÊfó&÷VE˜V˜FU˜&Vfñ∆√¢Fˆ7V÷VÁE˜GóR””“wV˜FFñˆ‚rÚ≤7W7Fˆ÷W%ˆÊ÷R¬7W7Fˆ÷W%˜ÜˆÊR¬FG&W75˜FWáC¢7W7Fˆ÷W%ˆFG&W72¬∆ñÊUˆóFV◊3¢∆ñÊTóFV◊2“¢ÁV∆¬”∞¢6ˆÁ7BñÁ2“vóBˆˆ¬ÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2Ê66˜VÁFñÊuˆFˆ7V÷VÁG2Ä¢Fˆ7V÷VÁEˆÊÚ¬Fˆ7V÷VÁE˜GóR¬7FGW2¬¶ˆ%ˆñB¬7W7Fˆ÷W%ˆÊ÷R¬7W7Fˆ÷W%˜ÜˆÊR¬7W7Fˆ÷W%˜FÖˆñB¬7W7Fˆ÷W%ˆFG&W72¿¢ó77VUˆFFR¬GVUˆFFR¬7V'F˜F¬¬Fó66˜VÁEˆ÷˜VÁB¬fEˆ÷˜VÁB¬vóFÜÜˆ∆FñÊuˆ÷˜VÁB¬F˜F≈ˆ÷˜VÁB¬ñ∆ˆEˆß6ˆ‚¿¢7&VFVEˆ'í¬WFFVEˆ'í¬ó77VVEˆ'í¬ó77VVEˆ@¢íd≈TU2ÇC¬C"¬C2¬CB¬CR¬Cb¬Cr¬CÇ¬Cí¬C¬C¬C"¬C2¬CB¬CR¬Cc£¶ß6ˆÊ"¬Cr¬Cr¬CÇ¬Cíê¢$UEU$‰î‰r¶¿¢∂Fˆ4ÊÚ¬Fˆ7V÷VÁE˜GóR¬7FGW2¬¶ˆ%ˆñB¬7W7Fˆ÷W%ˆÊ÷R¬7W7Fˆ÷W%˜ÜˆÊR¬7W7Fˆ÷W%˜FÖˆñB¬7W7Fˆ÷W%ˆFG&W72¬ó77VTFFR¬GVTFFR¿¢7V'F˜F¬¬Fó66˜VÁEˆ÷˜VÁB¬fEˆ÷˜VÁB¬vóFÜÜˆ∆FñÊuˆ÷˜VÁB¬F˜F≈ˆ÷˜VÁB¬•4Ù‚Á7G&ñÊvñgíáñ∆ˆBí¬7F˜"ÁW6W&Ê÷R«¬ÁV∆¬¿¢7FGW2””“vó77VVBrÚÜ7F˜"ÁW6W&Ê÷R«¬ÁV∆¬í¢ÁV∆¬¬7FGW2””“vó77VVBrÚÊWrFFRÇí¢ÁV∆≈–¢ì∞¢vóB∆ˆt66˜VÁFñÊtVFóBá&W¬≤7Fñˆ„¢7FGW2””“vó77VVBrÚtï55TUÙDÙ5T‘TÂBr¢t5$TDUÙDÙ5T‘TÂBr¬VÁFóGï˜GóS¢v66˜VÁFñÊuˆFˆ7V÷VÁBr¬VÁFóGïˆñC¢7G&ñÊrÜñÁ2Á&˜w5≥“ÊFˆ7V÷VÁEˆñBí¬gFW%ˆß6ˆ„¢ñÁ2Á&˜w5≥“¬Ê˜FS¢G∂Fˆ4Ê˜“G∂Fˆ7V÷VÁE˜GóW÷“ì∞¢&WGW&‚&W2Êß6ˆ‚á≤ˆ≥¢G'VR¬&˜s¢ñÁ2Á&˜w5≥“¬&ñÁE˜W&√¢ˆF÷ñ‚ˆ66˜VÁFñÊrˆFˆ7V÷VÁG2ÚG∂ñÁ2Á&˜w5≥“ÊFˆ7V÷VÁEˆñG“˜&ñÁF“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Çuı5BˆF÷ñ‚ˆ66˜VÁFñÊrˆFˆ7V÷VÁG2r¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢RÊ6ˆFR«¬t5$TDUÙDÙ5T‘TÂEÙdîƒTBr¬÷W76vS¢RÊ÷W76vR“ì∞¢–ß“ì∞††¶Á˜7BÇrˆF÷ñ‚ˆ66˜VÁFñÊrˆFˆ7V÷VÁG2Û¶Fˆ7V÷VÁEˆñBˆ6ˆÊfó&“r¬&WVó&T66˜VÁFñÊuW&÷ó76ñˆ‚Çv66˜VÁFñÊuˆ÷ÊvUˆFˆ7V÷VÁG2rí¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BñB“ÁV÷&W"á&WÁ&◊2ÊFˆ7V÷VÁEˆñB«¬ì∞¢ñbÇñBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜#¢tîÂdƒîEÙDÙ5T‘TÂEÙîBr“ì∞¢6ˆÁ7B“vóBˆˆ¬ÁVW'íÜ4TƒT5B¢e$Ù“V&∆ñ2Ê66˜VÁFñÊuˆFˆ7V÷VÁG2tÑU$RFˆ7V÷VÁEˆñC“Cƒî‘ïB¬∂ñE“ì∞¢6ˆÁ7BFˆ2“Á&˜w5≥”∞¢ñbÇFˆ2í&WGW&‚&W2Á7FGW2ÉCBíÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜#¢tDÙ5T‘TÂEÙ‰ıEÙdıT‰Br“ì∞¢ñbÖ7G&ñÊrÜFˆ2ÊFˆ7V÷VÁE˜GóRí”“wV˜FFñˆ‚rí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜#¢tÙ‰≈ïıTıDDîÙÂÙ4ÂÙ4Ù‰dï$“r“ì∞¢6ˆÁ7B7F˜"“ˆ66˜VÁFñÊt7F˜"á&Wì∞¢6ˆÁ7BWB“vóBˆˆ¬ÁVW'íÜUDDRV&∆ñ2Ê66˜VÁFñÊuˆFˆ7V÷VÁG24UB7FGW3“vó77VVBr¬6ˆÊfó&÷VEˆ'ì“C"¬6ˆÊfó&÷VEˆC‘‰ırÇí¬WFFVEˆ'ì“C"¬WFFVEˆC‘‰ırÇítÑU$RFˆ7V÷VÁEˆñC“C$UEU$‰î‰r¶¬∂ñB¬7F˜"ÁW6W&Ê÷R«¬ÁV∆≈“ì∞¢vóB∆ˆt66˜VÁFñÊtVFóBá&W¬≤7Fñˆ„¢t4Ù‰dï$’ıTıDDîÙ‚r¬VÁFóGï˜GóS¢v66˜VÁFñÊuˆFˆ7V÷VÁBr¬VÁFóGïˆñC•7G&ñÊrÜñBí¬&Vf˜&Uˆß6ˆ„¶Fˆ2¬gFW%ˆß6ˆ„ßWBÁ&˜w5≥“¬Ê˜FS¢~ä^ãûààNòûã.ä.ã~âûä.ãâûò>âÆòäÆâûäﬁä>ã.àNã"òâ^ä>ã^ä.äòâÓãNòéäà~ã.âír“ì∞¢&WGW&‚&W2Êß6ˆ‚á≤ˆ≥ßG'VR¬&˜sßWBÁ&˜w5≥“¬&Vfñ∆√¢≤Fˆ7V÷VÁEˆñC¶ñB¬Fˆ7V÷VÁEˆÊÛ¶Fˆ2ÊFˆ7V÷VÁEˆÊÚ¬7W7Fˆ÷W%ˆÊ÷S¶Fˆ2Ê7W7Fˆ÷W%ˆÊ÷R¬7W7Fˆ÷W%˜ÜˆÊS¶Fˆ2Ê7W7Fˆ÷W%˜ÜˆÊR¬FG&W75˜FWáC¶Fˆ2Ê7W7Fˆ÷W%ˆFG&W72¬∆ñÊUˆóFV◊3¢ÜFˆ2Áñ∆ˆEˆß6ˆÁ««∑“íÊ∆ñÊUˆóFV◊2«¬µ“““ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Çuı5BˆF÷ñ‚ˆ66˜VÁFñÊrˆFˆ7V÷VÁG2Û¶Fˆ7V÷VÁEˆñBˆ6ˆÊfó&“r¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜#¢t4Ù‰dï$’ıTıDDîÙÂÙdîƒTBr¬÷W76vS¶RÊ÷W76vR“ì∞¢–ß“ì∞†¶ÊvWBÇrˆF÷ñ‚ˆ66˜VÁFñÊr˜ñ˜WG2r¬&WVó&T66˜VÁFñÊuW&÷ó76ñˆ‚Çv66˜VÁFñÊrÁ&VBÁñ˜WG2rí¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B6ˆgEˆW'&˜'2“µ”∞¢G'í∞¢∆WBWFıˆVÁ7W&R“≤7&VFVC¢µ“¬6ÜV6∂VE˜GóW3¢µ“”∞¢G'í≤WFıˆVÁ7W&R“vóBˆVÁ7W&TGVUñ˜WEW&ñˆG4&Êv∂ˆ≤Öˆ66˜VÁFñÊt7F˜"á&WíÁW6W&Ê÷R«¬ÁV∆¬ì≤–¢6F6ÇÜRí≤6ˆgEˆW'&˜'2ÁW6Çá≤66˜S¢vWFıˆVÁ7W&U˜ñ˜WG2r¬÷W76vS¢RÊ÷W76vR“ì≤–¢6ˆÁ7B“vóBˆ66˜VÁFñÊu6fUVW'íá6ˆgEˆW'&˜'2¬wñ˜WG2r¿¢tïDÇ∆ñÊU˜7V“2Ä¢4TƒT5Bñ˜WEˆñB¬4ıTÂBÑDï5Dî‰5BFV6ÜÊñ6ñÂ˜W6W&Ê÷Rì£¶ñÁB2FV6ÜÊñ6ñÂˆ6˜VÁB¬4ıTÂBÇ¢ì£¶ñÁB2∆ñÊUˆ6˜VÁB¬4ÙƒU44RÖ5T“ÜV&Âˆ÷˜VÁBí√ì£¶ÁV÷W&ñ22w&˜75ˆ÷˜VÁ@¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜ñ˜WEˆ∆ñÊW2u$ıU%íñ˜WEˆñ@¢í¿¢F¢2Ö4TƒT5Bñ˜WEˆñB¬4ÙƒU44RÖ5T“ÜF•ˆ÷˜VÁBí√ì£¶ÁV÷W&ñ22F•˜F˜F¬e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜ñ˜WEˆFßW7F÷VÁG2u$ıU%íñ˜WEˆñBí¿¢FW2Ö4TƒT5Bñ˜WEˆñB¬4ÙƒU44RÖ5T“Ü÷˜VÁBí√ì£¶ÁV÷W&ñ22FW˜6óEˆFVGV7FñˆÂˆ÷˜VÁBe$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂˆFW˜6óEˆ∆VFvW"tÑU$RG&Á67FñˆÂ˜GóS“v6ˆ∆∆V7Bru$ıU%íñ˜WEˆñBí¿¢í2Ö4TƒT5Bñ˜WEˆñB¬4ÙƒU44RÖ5T“áñEˆ÷˜VÁBí√ì£¶ÁV÷W&ñ22ñEˆ÷˜VÁBe$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜ñ˜WE˜ñ÷VÁG2u$ıU%íñ˜WEˆñBê¢4TƒT5BÁñ˜WEˆñB¬ÁW&ñˆE˜GóR¬ÁW&ñˆE˜7F'B¬ÁW&ñˆEˆVÊB¬Á7FGW2¿¢4ÙƒU44RÜ∆ñÊU˜7V“ÁFV6ÜÊñ6ñÂˆ6˜VÁB√ì£¶ñÁB2FV6ÜÊñ6ñÂˆ6˜VÁB¿¢4ÙƒU44RÜ∆ñÊU˜7V“Ê∆ñÊUˆ6˜VÁB√ì£¶ñÁB2∆ñÊUˆ6˜VÁB¿¢4ÙƒU44RÜ∆ñÊU˜7V“Êw&˜75ˆ÷˜VÁB√ì£¶ÁV÷W&ñ22w&˜75ˆ÷˜VÁB¿¢4ÙƒU44RÜFWÊFW˜6óEˆFVGV7FñˆÂˆ÷˜VÁB√ì£¶ÁV÷W&ñ22FW˜6óEˆFVGV7FñˆÂˆ÷˜VÁB¿¢4ÙƒU44RÜF¢ÊF•˜F˜F¬√ì£¶ÁV÷W&ñ22F•˜F˜F¬¿¢Ñ4ÙƒU44RÜ∆ñÊU˜7V“Êw&˜75ˆ÷˜VÁB√í≤4ÙƒU44RÜF¢ÊF•˜F˜F¬√í“4ÙƒU44RÜFWÊFW˜6óEˆFVGV7FñˆÂˆ÷˜VÁB√íì£¶ÁV÷W&ñ22ÊWE˜ñ&∆R¿¢4ÙƒU44RáíÁñEˆ÷˜VÁB√ì£¶ÁV÷W&ñ22ñEˆ÷˜VÁB¿¢u$TDU5BÉ¬4ÙƒU44RÜ∆ñÊU˜7V“Êw&˜75ˆ÷˜VÁB√í≤4ÙƒU44RÜF¢ÊF•˜F˜F¬√í“4ÙƒU44RÜFWÊFW˜6óEˆFVGV7FñˆÂˆ÷˜VÁB√í“4ÙƒU44RáíÁñEˆ÷˜VÁB√íì£¶ÁV÷W&ñ22&V÷ñÊñÊuˆ÷˜VÁ@¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜ñ˜WE˜W&ñˆG2 ¢ƒTeB§Ùî‚∆ñÊU˜7V“Ù‚∆ñÊU˜7V“Áñ˜WEˆñC◊Áñ˜WEˆñ@¢ƒTeB§Ùî‚F¢Ù‚F¢Áñ˜WEˆñC◊Áñ˜WEˆñ@¢ƒTeB§Ùî‚FWÙ‚FWÁñ˜WEˆñC◊Áñ˜WEˆñ@¢ƒTeB§Ùî‚íÙ‚íÁñ˜WEˆñC◊Áñ˜WEˆñ@¢ı$DU"%í44RtÑT‚4ÙƒU44RáÁ7FGW2¬vG&gBrí√‚wñBrDÑT‚T≈4RT‰B¬ÁW&ñˆE˜7F'BDU42¬Áñ˜WEˆñBDU40¢ƒî‘ïBÉì∞¢6ˆÁ7BÊ˜r“FFRÊÊ˜rÇì∞¢6ˆÁ7B&˜w2“áÁ&˜w2«¬µ“íÊ÷Çá"í”‚∞¢6ˆÁ7BGVR“ˆ66˜VÁFñÊuñ˜WDGVTFFRá"ì∞¢6ˆÁ7BGVTó6Ú“GVRÚGVRÁFÙï4ı7G&ñÊrÇí¢ÁV∆√∞¢&WGW&‚∞¢‚‚Á"¿¢GVUˆFFS¢GVTó6Ú¿¢GVUˆ∆&V√¢ˆ66˜VÁFñÊuFÜîFFRÜGVTó6Úí¿¢7WFˆfeˆ∆&V√¢ˆ66˜VÁFñÊuñ˜WD7WFˆfd∆&V¬á"í¿¢ó5ˆGVS¢GVRÚGVRÊvWEFñ÷RÇí√“Ê˜r¢f«6R¿¢ñ÷VÁE˜'V∆UˆÊ˜FS¢7G&ñÊrá"ÁW&ñˆE˜GóRí””“sp¢Ú~à~ä~âNä~ãâûâ~ã^òÇ¢ä>ä~äà~ã.âûâ~ã^òéòäÆä>ò~àéâ^ãòûà~òâ^òéä~ãâûâ~ã^òÇ#bòâNã~äﬁâûàòéäﬁâíânãnà~ä~ãâûâ~ã^òÇòâNã~äﬁâûâûã^òíp¢¢~à~ä~âNä~ãâûâ~ã^òÇ#S¢ä>ä~äà~ã.âûâ~ã^òéòäÆä>ò~àéâ^ãòûà~òâ^òéä~ãâûâ~ã^òÇânãnà~ä~ãâûâ~ã^òÇbòâNã~äﬁâûâûã^òír¿¢”∞¢“ì∞¢&WGW&‚&W2Êß6ˆ‚á≤ˆ≥¢G'VR¬&˜w2¬WFıˆVÁ7W&R¬Ê˜FS¢~à~ä~âNàéòéã.ä.ä~ãâûâ~ã^òÇòä^ã#Ràéãà.ãnòûâûäﬁãâ^ò.âûäãâ^ãNòäã~òéäﬁânãnà~àã>äæâûâBä>ãâÆâÆòNäòéò.äﬁâûòà~ãNâûäﬁãâ^ò.âûäãâ^ãBàä>ãéâ>ã.ò.äﬁâûòà~ãNâûàéä>ãNà~àòéäﬁâíòä^òûä~àéãnà~âÆãâûâ~ãnààéòéã.ä.òä^òûärr¬6ˆgEˆW'&˜'2“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÇttUBˆF÷ñ‚ˆ66˜VÁFñÊr˜ñ˜WG2r¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤ˆ≥¢f«6R¬&˜w3¢µ“¬Ê˜FS¢rr¬6ˆgEˆW'&˜'3¢∑≤66˜S¢wñ˜WG2r¬÷W76vS¢RÊ÷W76vR’““ì∞¢–ß“ì∞†¶ÊvWBÇr˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜FÇ◊&ˆfñ∆Rr¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢vóBˆVÁ7W&UFV6ÜÊñ6ñÂFÖ&ˆfñ∆U66ÜV÷Çì∞¢6ˆÁ7BW6W&Ê÷R“7G&ñÊrá&WÁ&◊2ÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7B&ˆfñ∆R“vóBˆ66˜VÁFñÊtvWEFV6ÖFÖ&ˆfñ∆RáW6W&Ê÷Rì∞¢ñbÇ&ˆfñ∆Rí&WGW&‚&W2Á7FGW2ÉCBíÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜#¢uDT4Ñ‰î4îÂÙ‰ıEÙdıT‰Br“ì∞¢6ˆÁ7BVÊFñÊr“vóBˆˆ¬ÁVW'íÜ4TƒT5BñB¬7FGW2¬&WVW7FVEˆB¬F÷ñÂˆÊ˜FRe$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜FÖ˜&ˆfñ∆U˜&WVW7G2tÑU$RW6W&Ê÷S“Cı$DU"%í&WVW7FVEˆBDU42ƒî‘ïB¬∑W6W&Ê÷U“ì∞¢&WGW&‚&W2Êß6ˆ‚á≤ˆ≥ßG'VR¬&ˆfñ∆R¬∆FW7E˜&WVW7C¢VÊFñÊrÁ&˜w5≥“«¬ÁV∆¬“ì∞¢“6F6ÇÜRí≤6ˆÁ6ˆ∆RÊW'&˜"ÇttUB˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜FÇ◊&ˆfñ∆Rr¬Rì≤&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜#¢uDT4ÖıDÖı$ÙdîƒUÙdîƒTBr¬÷W76vS¶RÊ÷W76vR“ì≤–ß“ì∞†¶Á˜7BÇr˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜FÇ◊&ˆfñ∆R˜&WVW7Br¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢vóBˆVÁ7W&UFV6ÜÊñ6ñÂFÖ&ˆfñ∆U66ÜV÷Çì∞¢6ˆÁ7BW6W&Ê÷R“7G&ñÊrá&WÁ&◊2ÁW6W&Ê÷R«¬&WÊ&ˆGìÚÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢ñbÇW6W&Ê÷Rí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜#¢t‘ï54î‰uıU4U$‰‘Rr“ì∞¢6ˆÁ7B&ˆGí“&WÊ&ˆGí«¬∑”∞¢6ˆÁ7BgV∆≈ˆÊ÷R“7G&ñÊrÜ&ˆGíÊgV∆≈ˆÊ÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7BFÖˆñB“7G&ñÊrÜ&ˆGíÁFÖˆñB«¬rríÁ&W∆6RÇı«2≤ˆr¬rríÁG&ñ“Çì∞¢6ˆÁ7BFÖˆFG&W72“7G&ñÊrÜ&ˆGíÁFÖˆFG&W72«¬rríÁG&ñ“Çì∞¢6ˆÁ7BFÖˆ'&Ê6Ç“7G&ñÊrÜ&ˆGíÁFÖˆ'&Ê6Ç«¬rríÁG&ñ“Çì∞¢6ˆÁ7BváEˆñÊ6ˆ÷U˜GóR“7G&ñÊrÜ&ˆGíÁváEˆñÊ6ˆ÷U˜GóR«¬~àNòéã.âÆä>ãNàã.ä2˛àNòéã.àéòûã.à~â~ã>à.äﬁàrâ^ã.ääã.â^ä>ã"CÉÇíríÁG&ñ“Çì∞¢6ˆÁ7BváEˆFVfV«E˜&FR“ˆ÷ˆÊWíÜ&ˆGíÁváEˆFVfV«E˜&FR”“ÁV∆¬Ú2¢&ˆGíÁváEˆFVfV«E˜&FRì∞¢ñbÇgV∆≈ˆÊ÷Rí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜#¢uDT4ÖÙeTƒ≈Ù‰‘Uı$UTï$TBr“ì∞¢ñbÇFÖˆñBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜#¢uDT4ÖıDÖÙîEı$UTï$TBr“ì∞¢ñbÇFÖˆFG&W72í&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜#¢uDT4ÖıDÖÙDE$U55ı$UTï$TBr“ì∞¢6ˆÁ7BñÁ2“vóBˆˆ¬ÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2ÁFV6ÜÊñ6ñÂ˜FÖ˜&ˆfñ∆U˜&WVW7G2áW6W&Ê÷R¬gV∆≈ˆÊ÷R¬FÖˆñB¬FÖˆFG&W72¬FÖˆ'&Ê6Ç¬váEˆñÊ6ˆ÷U˜GóR¬váEˆFVfV«E˜&FR¬7FGW2ê¢d≈TU2ÇC¬C"¬C2¬CB¬CR¬Cb¬Cr¬wVÊFñÊrrí$UEU$‰î‰r¶¿¢∑W6W&Ê÷R¬gV∆≈ˆÊ÷R¬FÖˆñB¬FÖˆFG&W72¬FÖˆ'&Ê6Ç«¬ÁV∆¬¬váEˆñÊ6ˆ÷U˜GóR¬váEˆFVfV«E˜&FU–¢ì∞¢6ˆÁ7BWB“vóBˆˆ¬ÁVW'íÄ¢UDDRV&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W0¢4UBgV∆≈ˆÊ÷S‘4ÙƒU44RÑÂTƒƒîbÇC"¬rrí¬gV∆≈ˆÊ÷Rí¿¢FÖˆñC‘4ÙƒU44RÑÂTƒƒîbÇC2¬rrí¬FÖˆñBí¿¢FÖˆFG&W73‘4ÙƒU44RÑÂTƒƒîbÇCB¬rrí¬FÖˆFG&W72í¿¢FÖˆ'&Ê6É‘4ÙƒU44RÑÂTƒƒîbÇCR¬rrí¬FÖˆ'&Ê6Çí¿¢váEˆñÊ6ˆ÷U˜GóS‘4ÙƒU44RÑÂTƒƒîbÇCb¬rrí¬váEˆñÊ6ˆ÷U˜GóRí¿¢váEˆFVfV«E˜&FS“Cr¿¢FÖ˜&ˆfñ∆U˜7FGW3“wVÊFñÊu˜&WfñWrr¿¢WFFVEˆC‘‰ırÇê¢tÑU$RƒıtU"áW6W&Ê÷Rì‘ƒıtU"ÇCê¢$UEU$‰î‰rW6W&Ê÷V¿¢∑W6W&Ê÷R¬gV∆≈ˆÊ÷R¬FÖˆñB¬FÖˆFG&W72¬FÖˆ'&Ê6Ç«¬ÁV∆¬¬váEˆñÊ6ˆ÷U˜GóR¬váEˆFVfV«E˜&FU–¢ì∞¢ñbÇWBÁ&˜w2Ê∆VÊwFÇí∞¢vóBˆˆ¬ÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2áW6W&Ê÷R¬gV∆≈ˆÊ÷R¬FÖˆñB¬FÖˆFG&W72¬FÖˆ'&Ê6Ç¬váEˆñÊ6ˆ÷U˜GóR¬váEˆFVfV«E˜&FR¬FÖ˜&ˆfñ∆U˜7FGW2¬WFFVEˆBê¢d≈TU2ÇC¬C"¬C2¬CB¬CR¬Cb¬Cr¬wVÊFñÊu˜&WfñWrrƒ‰ırÇíñ¿¢∑W6W&Ê÷R¬gV∆≈ˆÊ÷R¬FÖˆñB¬FÖˆFG&W72¬FÖˆ'&Ê6Ç«¬ÁV∆¬¬váEˆñÊ6ˆ÷U˜GóR¬váEˆFVfV«E˜&FU–¢ì∞¢–¢&WGW&‚&W2Êß6ˆ‚á≤ˆ≥ßG'VR¬&WVW7C¶ñÁ2Á&˜w5≥““ì∞¢“6F6ÇÜRí≤6ˆÁ6ˆ∆RÊW'&˜"Çuı5B˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜FÇ◊&ˆfñ∆R˜&WVW7Br¬Rì≤&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜#¢uDT4ÖıDÖı$ÙdîƒUı$UTU5EÙdîƒTBr¬÷W76vS¶RÊ÷W76vR“ì≤–ß“ì∞†¶ÊvWBÇr˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜vóFÜÜˆ∆FñÊr÷6W'G2r¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“7G&ñÊrá&WÁ&◊2ÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7BñV"“ÁV÷&W"á&WÁVW'íÁñV"«¬ÊWrFFRÇíÊvWDgV∆≈ñV"Çíì∞¢6ˆÁ7B7F'B“G∑ñV'“””¬VÊB“G∑ñV"≤“””∞¢6ˆÁ7B“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BFˆ7V÷VÁEˆñB¬Fˆ7V÷VÁEˆÊÚ¬ó77VUˆFFR¬F˜F≈ˆ÷˜VÁB¬vóFÜÜˆ∆FñÊuˆ÷˜VÁB¬ñ∆ˆEˆß6ˆ‚¬7&VFVEˆ@¢e$Ù“V&∆ñ2Ê66˜VÁFñÊuˆFˆ7V÷VÁG0¢tÑU$RFˆ7V÷VÁE˜GóS“wvóFÜÜˆ∆FñÊuˆ6W'Br‰B4ÙƒU44Rá7FGW2¬rrí√‚wfˆñFVBp¢‰Bñ∆ˆEˆß6ˆ‚”„‚wFV6ÜÊñ6ñÂ˜W6W&Ê÷Rs“C¢‰B4ÙƒU44RÜó77VUˆFFR¬7&VFVEˆC£¶FFRí„“C#£¶FFR‰B4ÙƒU44RÜó77VUˆFFR¬7&VFVEˆC£¶FFRí¬C3£¶FFP¢ı$DU"%í4ÙƒU44RÜó77VUˆFFR¬7&VFVEˆC£¶FFRíDU42¬Fˆ7V÷VÁEˆñBDU46¿¢∑W6W&Ê÷R¬7F'B¬VÊE–¢ì∞¢&WGW&‚&W2Êß6ˆ‚á≤ˆ≥ßG'VR¬ñV"¬&˜w3ßÁ&˜w2Ê÷á"”‚á≤‚‚Á"¬&ñÁE˜W&√¶˜FV6ÜÊñ6ñÁ2ÚG∂VÊ6ˆFUU$î6ˆ◊ˆÊVÁBáW6W&Ê÷Ró“˜vóFÜÜˆ∆FñÊr÷6W'G2ÚG∑"ÊFˆ7V÷VÁEˆñG“˜&ñÁF“íí“ì∞¢“6F6ÇÜRí≤6ˆÁ6ˆ∆RÊW'&˜"ÇttUB˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜vóFÜÜˆ∆FñÊr÷6W'G2r¬Rì≤&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜#¢uDT4ÖıtÖEÙƒï5EÙdîƒTBr¬÷W76vS¶RÊ÷W76vR“ì≤–ß“ì∞††¶ÊvWBÇr˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜vóFÜÜˆ∆FñÊr÷6W'G2˜ñV&«íÊ77br¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“7G&ñÊrá&WÁ&◊2ÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7BñV"“ÁV÷&W"á&WÁVW'íÁñV"«¬ÊWrFFRÇíÊvWDgV∆≈ñV"Çíì∞¢6ˆÁ7B7F'B“G∑ñV'“””¬VÊB“G∑ñV"≤“””∞¢6ˆÁ7B“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BFˆ7V÷VÁEˆÊÚ¬ó77VUˆFFR¬7W7Fˆ÷W%ˆÊ÷R¬F˜F≈ˆ÷˜VÁB¬vóFÜÜˆ∆FñÊuˆ÷˜VÁB¬ñ∆ˆEˆß6ˆ‚¬7&VFVEˆ@¢e$Ù“V&∆ñ2Ê66˜VÁFñÊuˆFˆ7V÷VÁG0¢tÑU$RFˆ7V÷VÁE˜GóS“wvóFÜÜˆ∆FñÊuˆ6W'Br‰B4ÙƒU44Rá7FGW2¬rrí√‚wfˆñFVBp¢‰Bñ∆ˆEˆß6ˆ‚”„‚wFV6ÜÊñ6ñÂ˜W6W&Ê÷Rs“C¢‰B4ÙƒU44RÜó77VUˆFFR¬7&VFVEˆC£¶FFRí„“C#£¶FFR‰B4ÙƒU44RÜó77VUˆFFR¬7&VFVEˆC£¶FFRí¬C3£¶FFP¢ı$DU"%í4ÙƒU44RÜó77VUˆFFR¬7&VFVEˆC£¶FFRí42¬Fˆ7V÷VÁEˆñB46¿¢∑W6W&Ê÷R¬7F'B¬VÊE–¢ì∞¢6ˆÁ7BÜVFW'2“≤~òâNã~äﬁâír¬~òä^à.òäﬁàäÆã.ä2r¬~ä~ãâûâ~ã^òéäﬁäﬁàr¬~âŒãûòûä>ãâÆòà~ãNâír¬~òà~ãNâûòNâNòír¬~äã.äûã^äæãàâ2â~ã^òéàéòéã.ä"u”∞¢6ˆÁ7B&˜w2“Á&˜w2Ê÷á"”‚∞¢6ˆÁ7B“"Áñ∆ˆEˆß6ˆ‚«¬∑”∞¢&WGW&‚∑ÁváEˆ÷ˆÁFÖˆ∆&V¬«¬rr¬"ÊFˆ7V÷VÁEˆÊÚ«¬rr¬"Êó77VUˆFFR«¬rr¬"Ê7W7Fˆ÷W%ˆÊ÷R«¬W6W&Ê÷R¬"ÁF˜F≈ˆ÷˜VÁB«¬¬"ÁvóFÜÜˆ∆FñÊuˆ÷˜VÁB«¬”∞¢“ì∞¢6ˆÁ7B77dW66R“ábí”‚"Gµ7G&ñÊrábÛÚrríÁ&W∆6RÇÚ"ˆr¬r""ró“&∞¢6ˆÁ7B77b“u«VfVfbr≤∂ÜVFW'2¬‚‚Á&˜w5“Ê÷á&˜r”‚&˜rÊ÷Ü77dW66RíÊ¶ˆñ‚Çr¬rííÊ¶ˆñ‚Çu∆‚rì∞¢&W2Á6WDÜVFW"Çt6ˆÁFVÁB’GóRr¬wFWáBˆ77c≤6Ü'6WC◊WFb”Çrì∞¢&W2Á6WDÜVFW"Çt6ˆÁFVÁB‘Fó7˜6óFñˆ‚r¬GF6Ü÷VÁC≤fñ∆VÊ÷S“'váB“G∑W6W&Ê÷W““G∑ñV'“Ê77b&ì∞¢&WGW&‚&W2Á6VÊBÜ77bì∞¢“6F6ÇÜRí≤6ˆÁ6ˆ∆RÊW'&˜"ÇttUBFV6ÜÊñ6ñ‚vóFÜÜˆ∆FñÊrñV&«í77br¬Rì≤&WGW&‚&W2Á7FGW2ÉSíÁ6VÊBÇtWá˜'Bfñ∆VBrì≤–ß“ì∞†¶ÊvWBÇr˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜vóFÜÜˆ∆FñÊr÷6W'G2˜ñV&«í˜&ñÁBr¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“7G&ñÊrá&WÁ&◊2ÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7BñV"“ÁV÷&W"á&WÁVW'íÁñV"«¬ÊWrFFRÇíÊvWDgV∆≈ñV"Çíì∞¢6ˆÁ7B7F'B“G∑ñV'“””¬VÊB“G∑ñV"≤“””∞¢6ˆÁ7B“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BFˆ7V÷VÁEˆÊÚ¬ó77VUˆFFR¬7W7Fˆ÷W%ˆÊ÷R¬F˜F≈ˆ÷˜VÁB¬vóFÜÜˆ∆FñÊuˆ÷˜VÁB¬ñ∆ˆEˆß6ˆ‚¬7&VFVEˆ@¢e$Ù“V&∆ñ2Ê66˜VÁFñÊuˆFˆ7V÷VÁG0¢tÑU$RFˆ7V÷VÁE˜GóS“wvóFÜÜˆ∆FñÊuˆ6W'Br‰B4ÙƒU44Rá7FGW2¬rrí√‚wfˆñFVBp¢‰Bñ∆ˆEˆß6ˆ‚”„‚wFV6ÜÊñ6ñÂ˜W6W&Ê÷Rs“C¢‰B4ÙƒU44RÜó77VUˆFFR¬7&VFVEˆC£¶FFRí„“C#£¶FFR‰B4ÙƒU44RÜó77VUˆFFR¬7&VFVEˆC£¶FFRí¬C3£¶FFP¢ı$DU"%í4ÙƒU44RÜó77VUˆFFR¬7&VFVEˆC£¶FFRí42¬Fˆ7V÷VÁEˆñB46¿¢∑W6W&Ê÷R¬7F'B¬VÊE–¢ì∞¢6ˆÁ7BF˜FƒñÊ6ˆ÷R“Á&˜w2Á&VGV6RÇÜ«"ì”Ê¥ÁV÷&W"á"ÁF˜F≈ˆ÷˜VÁG«√í√ì∞¢6ˆÁ7BF˜F≈váB“Á&˜w2Á&VGV6RÇÜ«"ì”Ê¥ÁV÷&W"á"ÁvóFÜÜˆ∆FñÊuˆ÷˜VÁG«√í√ì∞¢6ˆÁ7B&˜w4áF÷¬“Á&˜w2Ê÷á"”‚∞¢6ˆÁ7B“"Áñ∆ˆEˆß6ˆ‚«¬∑”∞¢&WGW&‚«G#„«FC‚G∑ÁváEˆ÷ˆÁFÖˆ∆&V¬«¬rw”¬˜FC„«FC‚G∑"ÊFˆ7V÷VÁEˆÊÚ«¬rw”¬˜FC„«FC‚G∑"Êó77VUˆFFR«¬rw”¬˜FC„«FB6∆73“&ÁV“#‚G¥ÁV÷&W"á"ÁF˜F≈ˆ÷˜VÁG«√íÁFÙ∆ˆ6∆U7G&ñÊrÇwFÇ’DÇró”¬˜FC„«FB6∆73“&ÁV“#‚G¥ÁV÷&W"á"ÁvóFÜÜˆ∆FñÊuˆ÷˜VÁG«√íÁFÙ∆ˆ6∆U7G&ñÊrÇwFÇ’DÇró”¬˜FC„¬˜G#Ê∞¢“íÊ¶ˆñ‚Çrrí«¬s«G#„«FB6ˆ«7„“#R#Óä.ãà~òNäòéäã^òäﬁàäÆã.ä>ò>âûâæã^âûã^òì¬˜FC„¬˜G#‚s∞¢&WGW&‚&W2ÁGóRÇváF÷¬ríÁ6VÊBÜ¬Fˆ7GóRáF÷√„∆áF÷¬∆Ês“'FÇ#„∆ÜVC„∆÷WF6Ü'6WC“'WFb”Ç#„«FóF∆SÓäÆä>ãéâæâ~ä~ãCSG∑ñV'”¬˜FóF∆S„«7Gñ∆SÊ&ˆGó∂fˆÁB÷f÷ñ«ì§&ñ¬¬tÊ˜FÚ6Á2FÜír«6Á2◊6W&ñc∂6ˆ∆˜#¢3#&V#∑FFñÊs£#áá÷É∂÷&vñ„£gá“Ê◊WFVG∂6ˆ∆˜#¢3cCsCÜ'◊F&∆W∑vñGFÉ£S∂&˜&FW"÷6ˆ∆∆6S¶6ˆ∆∆6S∂÷&vñ‚◊F˜£áá◊FÇ«FG∂&˜&FW#£Ç6ˆ∆ñB66&CVS∑FFñÊs£áÉ∑FWáB÷∆ñv„¶∆VgG◊Fá∂&6∂w&˜VÊC¢6Vfcffg“ÊÁV◊∑FWáB÷∆ñv„ß&ñváG“Á7V◊∂÷&vñ‚◊F˜£gÉ∂fˆÁB◊6ó¶S£áÉ∂fˆÁB◊vVñváC£É‘÷VFñ&ñÁG∂'WGFˆÁ∂Fó7∆ì¶ÊˆÊW◊”¬˜7Gñ∆S„¬ˆÜVC„∆&ˆGì„∆'WGFˆ‚ˆÊ6∆ñ6≥“'&ñÁBÇí#ÓâÓãNäâÓò¬Ú6fRDc¬ˆ'WGFˆ„„∆ÉÓäÆä>ãéâæòäﬁàäÆã.ä>â~ä~ãCSâæä>ãàéã>âæãRG∑ñV'”¬ˆÉ„∆Fób6∆73“&◊WFVB#ÓàÆòéã.às¢G∑W6W&Ê÷W”¬ˆFóc„«F&∆S„«FÜVC„«G#„«FÉÓòâNã~äﬁâì¬˜FÉ„«FÉÓòä^à.òäﬁàäÆã.ä3¬˜FÉ„«FÉÓä~ãâûâ~ã^òéäﬁäﬁà¬˜FÉ„«FÉÓòà~ãNâûòNâNòì¬˜FÉ„«FÉÓäã.äûã^äæãàâ2â~ã^òéàéòéã.ä#¬˜FÉ„¬˜G#„¬˜FÜVC„«F&ˆGì‚G∑&˜w4áF÷«”¬˜F&ˆGì„¬˜F&∆S„∆Fób6∆73“'7V“#Óä>ä~äòà~ãNâûòNâNòíG∑F˜FƒñÊ6ˆ÷RÁFÙ∆ˆ6∆U7G&ñÊrÇwFÇ’DÇró“âÆã.âr(
"ä>ä~ääã.äûã^äæãàòNä~òíG∑F˜F≈váBÁFÙ∆ˆ6∆U7G&ñÊrÇwFÇ’DÇró“âÆã.âs¬ˆFóc„¬ˆ&ˆGì„¬ˆáF÷√Êì∞¢“6F6ÇÜRí≤6ˆÁ6ˆ∆RÊW'&˜"ÇttUBFV6ÜÊñ6ñ‚vóFÜÜˆ∆FñÊrñV&«í&ñÁBr¬Rì≤&WGW&‚&W2Á7FGW2ÉSíÁ6VÊBÇu&ñÁBfñ∆VBrì≤–ß“ì∞†¶ÊvWBÇr˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜vóFÜÜˆ∆FñÊr÷6W'G2Û¶Fˆ7V÷VÁEˆñB˜&ñÁBr¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“7G&ñÊrá&WÁ&◊2ÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7BñB“ÁV÷&W"á&WÁ&◊2ÊFˆ7V÷VÁEˆñB«¬ì∞¢6ˆÁ7B“vóBˆˆ¬ÁVW'íÜ4TƒT5B¢e$Ù“V&∆ñ2Ê66˜VÁFñÊuˆFˆ7V÷VÁG2tÑU$RFˆ7V÷VÁEˆñC“C‰BFˆ7V÷VÁE˜GóS“wvóFÜÜˆ∆FñÊuˆ6W'Br‰Bñ∆ˆEˆß6ˆ‚”„‚wFV6ÜÊñ6ñÂ˜W6W&Ê÷Rs“C"ƒî‘ïB¬∂ñB¬W6W&Ê÷U“ì∞¢6ˆÁ7BFˆ2“Á&˜w5≥”∞¢ñbÇFˆ2í&WGW&‚&W2Á7FGW2ÉCBíÁ6VÊBÇtFˆ7V÷VÁBÊ˜Bf˜VÊBrì∞¢6ˆÁ7B6ˆ◊Áí“vóBˆvWD66˜VÁFñÊu6WGFñÊw2Çì∞¢&WGW&‚&W2ÁGóRÇv∆ñ6Fñˆ‚˜FbríÁ6WBÇt6ˆÁFVÁB‘Fó7˜6óFñˆ‚r¬ñÊ∆ñÊS≤fñ∆VÊ÷S“"G∂Fˆ2ÊFˆ7V÷VÁEˆÊÚ«¬wváCSw“ÁFb&íÁ6VÊBÜvóBˆ66˜VÁFñÊuvóFÜÜˆ∆FñÊuFd'VffW"ÜFˆ2¬6ˆ◊Áííì∞¢“6F6ÇÜRí≤6ˆÁ6ˆ∆RÊW'&˜"ÇttUBFV6ÜÊñ6ñ‚vóFÜÜˆ∆FñÊr&ñÁBr¬Rì≤&WGW&‚&W2Á7FGW2ÉSíÁ6VÊBÇu&ñÁBfñ∆VBrì≤–ß“ì∞†¶ÊvWBÇrˆF÷ñ‚ˆ66˜VÁFñÊr˜FV6ÜÊñ6ñ‚◊FÇ◊&WVW7G2r¬&WVó&TF÷ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢vóBˆVÁ7W&UFV6ÜÊñ6ñÂFÖ&ˆfñ∆U66ÜV÷Çì∞¢6ˆÁ7B“vóBˆˆ¬ÁVW'íÜ4TƒT5B¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜FÖ˜&ˆfñ∆U˜&WVW7G2tÑU$R7FGW3“wVÊFñÊrrı$DU"%í&WVW7FVEˆB42ƒî‘ïBÉì∞¢&WGW&‚&W2Êß6ˆ‚á≤ˆ≥ßG'VR¬&˜w3ßÁ&˜w2“ì∞¢“6F6ÇÜRí≤&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜#¢uDÖı$UTU5E5ÙdîƒTBr¬÷W76vS¶RÊ÷W76vR“ì≤–ß“ì∞†¶Á˜7BÇrˆF÷ñ‚ˆ66˜VÁFñÊr˜FV6ÜÊñ6ñ‚◊FÇ◊&WVW7G2Û¶ñBˆ&˜fRr¬&WVó&TF÷ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B6∆ñVÁB“vóBˆˆ¬Ê6ˆÊÊV7BÇì∞¢G'í∞¢6ˆÁ7BñB“ÁV÷&W"á&WÁ&◊2ÊñB«¬ì≤6ˆÁ7B7F˜"“ˆ66˜VÁFñÊt7F˜"á&WíÁW6W&Ê÷R«¬ÁV∆√∞¢vóB6∆ñVÁBÁVW'íÇt$Ttî‚rì∞¢vóBˆVÁ7W&UFV6ÜÊñ6ñÂFÖ&ˆfñ∆U66ÜV÷Ü6∆ñVÁBì∞¢6ˆÁ7B'“vóB6∆ñVÁBÁVW'íÜ4TƒT5B¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜FÖ˜&ˆfñ∆U˜&WVW7G2tÑU$RñC“Cdı"UDDV¬∂ñE“ì∞¢6ˆÁ7B&˜r“'Á&˜w5≥”≤ñbÇ&˜rí≤vóB6∆ñVÁBÁVW'íÇu$Ùƒƒ$4≤rì≤&WGW&‚&W2Á7FGW2ÉCBíÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜#¢u$UTU5EÙ‰ıEÙdıT‰Br“ì≤–¢ÚÚWFFRfó'7B¬FÜV‚ñÁ6W'Bñb÷ó76ñÊr‚FÜó2fˆñG2&V«ññÊrˆ‚‚WÜó7FñÊrT‰ïTP¢ÚÚ6ˆÁ7G&ñÁBñ‚ˆ∆FW"&ˆGV7Fñˆ‚66ÜV÷2vÜñ∆R7Fñ∆¬∂VWñÊrFÜR˜W&Fñˆ‚6fR‡¢6ˆÁ7BWE&ˆfñ∆R“vóB6∆ñVÁBÁVW'íÄ¢UDDRV&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W0¢4UBgV∆≈ˆÊ÷S“C"¿¢FÖˆñC“C2¿¢FÖˆFG&W73“CB¿¢FÖˆ'&Ê6É“CR¿¢váEˆñÊ6ˆ÷U˜GóS“Cb¿¢váEˆFVfV«E˜&FS“Cr¿¢FÖ˜&ˆfñ∆U˜7FGW3“v&˜fVBr¿¢FÖ˜&ˆfñ∆U˜&WfñWvVEˆ'ì“CÇ¿¢FÖ˜&ˆfñ∆U˜&WfñWvVEˆC‘‰ırÇí¿¢WFFVEˆC‘‰ırÇê¢tÑU$RƒıtU"áW6W&Ê÷Rì‘ƒıtU"ÇCê¢$UEU$‰î‰rW6W&Ê÷V¿¢∑&˜rÁW6W&Ê÷R¬&˜rÊgV∆≈ˆÊ÷R¬&˜rÁFÖˆñB¬&˜rÁFÖˆFG&W72¬&˜rÁFÖˆ'&Ê6Ç¬&˜rÁváEˆñÊ6ˆ÷U˜GóR¬&˜rÁváEˆFVfV«E˜&FR¬7F˜%–¢ì∞¢ñbÇWE&ˆfñ∆RÁ&˜w2Ê∆VÊwFÇí∞¢vóB6∆ñVÁBÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W0¢áW6W&Ê÷R¬gV∆≈ˆÊ÷R¬FÖˆñB¬FÖˆFG&W72¬FÖˆ'&Ê6Ç¬váEˆñÊ6ˆ÷U˜GóR¬váEˆFVfV«E˜&FR¬FÖ˜&ˆfñ∆U˜7FGW2¬FÖ˜&ˆfñ∆U˜&WfñWvVEˆ'í¬FÖ˜&ˆfñ∆U˜&WfñWvVEˆB¬WFFVEˆBê¢d≈TU2ÇC¬C"¬C2¬CB¬CR¬Cb¬Cr¬v&˜fVBr¬CÇƒ‰ırÇíƒ‰ırÇíñ¿¢∑&˜rÁW6W&Ê÷R¬&˜rÊgV∆≈ˆÊ÷R¬&˜rÁFÖˆñB¬&˜rÁFÖˆFG&W72¬&˜rÁFÖˆ'&Ê6Ç¬&˜rÁváEˆñÊ6ˆ÷U˜GóR¬&˜rÁváEˆFVfV«E˜&FR¬7F˜%–¢ì∞¢–¢6ˆÁ7BW“vóB6∆ñVÁBÁVW'íÜUDDRV&∆ñ2ÁFV6ÜÊñ6ñÂ˜FÖ˜&ˆfñ∆U˜&WVW7G24UB7FGW3“v&˜fVBr¬&WfñWvVEˆ'ì“C"¬&WfñWvVEˆC‘‰ırÇí¬F÷ñÂˆÊ˜FS“C2tÑU$RñC“C$UEU$‰î‰r¶¬∂ñB¬7F˜"¬&WÊ&ˆGìÚÊF÷ñÂˆÊ˜FR«¬ÁV∆≈“ì∞¢vóB6∆ñVÁBÁVW'íÇt4Ù‘‘ïBrì∞¢vóB∆ˆt66˜VÁFñÊtVFóBá&W¬≤7Fñˆ„¢t$ıdUıDT4ÖıDÖı$ÙdîƒRr¬VÁFóGï˜GóS¢wFV6ÜÊñ6ñÂ˜FÖ˜&ˆfñ∆U˜&WVW7Br¬VÁFóGïˆñC•7G&ñÊrÜñBí¬gFW%ˆß6ˆ„ßWÁ&˜w5≥“¬Ê˜FS¢~äﬁâûãéäãâ^ãNà.òûäﬁäãûä^â~ä~ãCSàÆòéã.àrr“ì∞¢&WGW&‚&W2Êß6ˆ‚á≤ˆ≥ßG'VR¬&˜sßWÁ&˜w5≥““ì∞¢“6F6ÇÜRí≤G'ó∂vóB6∆ñVÁBÁVW'íÇu$Ùƒƒ$4≤ró÷6F6ÇÖÚó∑”≤6ˆÁ6ˆ∆RÊW'&˜"Çt$ıdUıDÖı$UTU5EÙdîƒTBr¬Rì≤&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜#¢t$ıdUıDÖı$UTU5EÙdîƒTBr¬÷W76vS¶RÊ÷W76vR“ì≤“fñÊ∆«í≤6∆ñVÁBÁ&V∆V6RÇì≤–ß“ì∞†¶Á˜7BÇrˆF÷ñ‚ˆ66˜VÁFñÊr˜FV6ÜÊñ6ñ‚◊FÇ◊&WVW7G2Û¶ñB˜&V¶V7Br¬&WVó&TF÷ñÂ6W76ñˆ‚¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢vóBˆVÁ7W&UFV6ÜÊñ6ñÂFÖ&ˆfñ∆U66ÜV÷Çì∞¢6ˆÁ7BñB“ÁV÷&W"á&WÁ&◊2ÊñB«¬ì≤6ˆÁ7B7F˜"“ˆ66˜VÁFñÊt7F˜"á&WíÁW6W&Ê÷R«¬ÁV∆√∞¢6ˆÁ7B“vóBˆˆ¬ÁVW'íÜUDDRV&∆ñ2ÁFV6ÜÊñ6ñÂ˜FÖ˜&ˆfñ∆U˜&WVW7G24UB7FGW3“w&V¶V7FVBr¬&WfñWvVEˆ'ì“C"¬&WfñWvVEˆC‘‰ırÇí¬F÷ñÂˆÊ˜FS“C2tÑU$RñC“C$UEU$‰î‰r¶¬∂ñB¬7F˜"¬&WÊ&ˆGìÚÊF÷ñÂˆÊ˜FR«¬ÁV∆≈“ì∞¢ñbÇÁ&˜w5≥“í&WGW&‚&W2Á7FGW2ÉCBíÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜#¢u$UTU5EÙ‰ıEÙdıT‰Br“ì∞¢vóBˆˆ¬ÁVW'íÜUDDRV&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W24UBFÖ˜&ˆfñ∆U˜7FGW3“w&V¶V7FVBr¬FÖ˜&ˆfñ∆UˆÊ˜FS“C"tÑU$RƒıtU"áW6W&Ê÷Rì‘ƒıtU"ÇCñ¬∑Á&˜w5≥“ÁW6W&Ê÷R¬&WÊ&ˆGìÚÊF÷ñÂˆÊ˜FR«¬ÁV∆≈“ì∞¢vóB∆ˆt66˜VÁFñÊtVFóBá&W¬≤7Fñˆ„¢u$T§T5EıDT4ÖıDÖı$ÙdîƒRr¬VÁFóGï˜GóS¢wFV6ÜÊñ6ñÂ˜FÖ˜&ˆfñ∆U˜&WVW7Br¬VÁFóGïˆñC•7G&ñÊrÜñBí¬gFW%ˆß6ˆ„ßÁ&˜w5≥“¬Ê˜FSß&WÊ&ˆGìÚÊF÷ñÂˆÊ˜FR«¬~âæà˛ãNòäÆâéà.òûäﬁäãûä^â~ä~ãCSàÆòéã.àrr“ì∞¢&WGW&‚&W2Êß6ˆ‚á≤ˆ≥ßG'VR¬&˜sßÁ&˜w5≥““ì∞¢“6F6ÇÜRí≤&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜#¢u$T§T5EıDÖı$UTU5EÙdîƒTBr¬÷W76vS¶RÊ÷W76vR“ì≤–ß“ì∞†¶ÊvWBÇrˆF÷ñ‚ˆ66˜VÁFñÊr˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜FÇ◊&ˆfñ∆Rr¬&WVó&T66˜VÁFñÊuW&÷ó76ñˆ‚Çv66˜VÁFñÊrÁ&VBÁñ˜WG2rí¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7B&ˆfñ∆R“vóBˆ66˜VÁFñÊtvWEFV6ÖFÖ&ˆfñ∆Rá&WÁ&◊2ÁW6W&Ê÷Rì∞¢ñbÇ&ˆfñ∆Rí&WGW&‚&W2Á7FGW2ÉCBíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢uDT4Ñ‰î4îÂÙ‰ıEÙdıT‰Br“ì∞¢&WGW&‚&W2Êß6ˆ‚á≤ˆ≥¢G'VR¬&ˆfñ∆R“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÇttUBˆF÷ñ‚ˆ66˜VÁFñÊr˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜FÇ◊&ˆfñ∆Rr¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢uDT4ÖıDÖı$ÙdîƒUÙdîƒTBr¬÷W76vS¢RÊ÷W76vR“ì∞¢–ß“ì∞†¶Á˜7BÇrˆF÷ñ‚ˆ66˜VÁFñÊr˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜FÇ◊&ˆfñ∆Rr¬&WVó&T66˜VÁFñÊuW&÷ó76ñˆ‚Çv66˜VÁFñÊuˆ÷&µ˜ñ˜WE˜ñBrí¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BW6W&Ê÷R“7G&ñÊrá&WÁ&◊2ÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢ñbÇW6W&Ê÷Rí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢t‘ï54î‰uıDT4Ñ‰î4îÂıU4U$‰‘Rr“ì∞¢6ˆÁ7B&ˆGí“&WÊ&ˆGí«¬∑”∞¢6ˆÁ7B&Vf˜&R“vóBˆ66˜VÁFñÊtvWEFV6ÖFÖ&ˆfñ∆RáW6W&Ê÷Rì∞¢6ˆÁ7BgV∆≈ˆÊ÷R“7G&ñÊrÜ&ˆGíÊgV∆≈ˆÊ÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7BFÖˆñB“7G&ñÊrÜ&ˆGíÁFÖˆñB«¬rríÁ&W∆6RÇı«2≤ˆr¬rríÁG&ñ“Çì∞¢6ˆÁ7BFÖˆFG&W72“7G&ñÊrÜ&ˆGíÁFÖˆFG&W72«¬rríÁG&ñ“Çì∞¢6ˆÁ7BFÖˆ'&Ê6Ç“7G&ñÊrÜ&ˆGíÁFÖˆ'&Ê6Ç«¬rríÁG&ñ“Çì∞¢6ˆÁ7BváEˆñÊ6ˆ÷U˜GóR“7G&ñÊrÜ&ˆGíÁváEˆñÊ6ˆ÷U˜GóR«¬~àNòéã.âÆä>ãNàã.ä2˛àNòéã.àéòûã.à~â~ã>à.äﬁàrâ^ã.ääã.â^ä>ã"CÉÇíríÁG&ñ“Çì∞¢6ˆÁ7BváEˆFVfV«E˜&FR“ˆ÷ˆÊWíÜ&ˆGíÁváEˆFVfV«E˜&FR”“ÁV∆¬Ú2¢&ˆGíÁváEˆFVfV«E˜&FRì∞¢ñbÇgV∆≈ˆÊ÷Rí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢uDT4ÖÙeTƒ≈Ù‰‘Uı$UTï$TBr“ì∞¢ñbÇFÖˆñBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢uDT4ÖıDÖÙîEı$UTï$TBr“ì∞¢ñbÇFÖˆFG&W72í&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢uDT4ÖıDÖÙDE$U55ı$UTï$TBr“ì∞¢vóBˆˆ¬ÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2áW6W&Ê÷R¬gV∆≈ˆÊ÷R¬FÖˆñB¬FÖˆFG&W72¬FÖˆ'&Ê6Ç¬váEˆñÊ6ˆ÷U˜GóR¬váEˆFVfV«E˜&FRê¢d≈TU2ÇC¬C"¬C2¬CB¬CR¬Cb¬Crê¢Ù‚4Ù‰dƒî5BáW6W&Ê÷RíDÚUDDR4U@¢gV∆≈ˆÊ÷S‘UÑ4≈TDTBÊgV∆≈ˆÊ÷R¿¢FÖˆñC‘UÑ4≈TDTBÁFÖˆñB¿¢FÖˆFG&W73‘UÑ4≈TDTBÁFÖˆFG&W72¿¢FÖˆ'&Ê6É‘UÑ4≈TDTBÁFÖˆ'&Ê6Ç¿¢váEˆñÊ6ˆ÷U˜GóS‘UÑ4≈TDTBÁváEˆñÊ6ˆ÷U˜GóR¿¢váEˆFVfV«E˜&FS‘UÑ4≈TDTBÁváEˆFVfV«E˜&FR¿¢WFFVEˆC‘5U%$TÂEıDî‘U5D’¿¢∑W6W&Ê÷R¬gV∆≈ˆÊ÷R¬FÖˆñB¬FÖˆFG&W72¬FÖˆ'&Ê6Ç«¬ÁV∆¬¬váEˆñÊ6ˆ÷U˜GóR¬váEˆFVfV«E˜&FU–¢ì∞¢6ˆÁ7BgFW"“vóBˆ66˜VÁFñÊtvWEFV6ÖFÖ&ˆfñ∆RáW6W&Ê÷Rì∞¢vóB∆ˆt66˜VÁFñÊtVFóBá&W¬≤7Fñˆ„¢uUDDUıDT4ÖıDÖı$ÙdîƒRr¬VÁFóGï˜GóS¢wFV6ÜÊñ6ñÂ˜&ˆfñ∆Rr¬VÁFóGïˆñC¢W6W&Ê÷R¬&Vf˜&Uˆß6ˆ„¢&Vf˜&R¬gFW%ˆß6ˆ„¢gFW"¬Ê˜FS¢~äﬁãâæòâNâ^à.òûäﬁäãûä^äﬁäﬁàâ~ä~ãCSà.äﬁà~àÆòéã.àrr“ì∞¢&WGW&‚&W2Êß6ˆ‚á≤ˆ≥¢G'VR¬&ˆfñ∆S¢gFW"“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Çuı5BˆF÷ñ‚ˆ66˜VÁFñÊr˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜FÇ◊&ˆfñ∆Rr¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢uUDDUıDT4ÖıDÖı$ÙdîƒUÙdîƒTBr¬÷W76vS¢RÊ÷W76vR“ì∞¢–ß“ì∞†¶Á˜7BÇrˆF÷ñ‚ˆ66˜VÁFñÊr˜ñ˜WG2Ûßñ˜WEˆñB˜FV6ÇÛßW6W&Ê÷R˜vóFÜÜˆ∆FñÊr÷6W'Br¬&WVó&T66˜VÁFñÊuW&÷ó76ñˆ‚Çv66˜VÁFñÊuˆ÷&µ˜ñ˜WE˜ñBrí¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7Bñ˜WEˆñB“7G&ñÊrá&WÁ&◊2Áñ˜WEˆñB«¬rríÁG&ñ“Çì∞¢6ˆÁ7BFV6ÜÊñ6ñÂ˜W6W&Ê÷R“7G&ñÊrá&WÁ&◊2ÁW6W&Ê÷R«¬rríÁG&ñ“Çì∞¢ñbÇñ˜WEˆñB«¬FV6ÜÊñ6ñÂ˜W6W&Ê÷Rí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢t‘ï54î‰uıîıUEÙı%ıDT4Çr“ì∞¢6ˆÁ7B&ˆfñ∆R“vóBˆ66˜VÁFñÊtvWEFV6ÖFÖ&ˆfñ∆RáFV6ÜÊñ6ñÂ˜W6W&Ê÷Rì∞¢ñbÇ&ˆfñ∆SÚÊó5ˆ6ˆ◊∆WFRí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢uDT4ÖıDÖı$ÙdîƒUÙî‰4Ù’ƒUDRr¬÷ó76ñÊuˆfñV∆G3¢&ˆfñ∆SÚÊ÷ó76ñÊuˆfñV∆G2«¬µ““ì∞¢6ˆÁ7B&6R“vóBˆ66˜VÁFñÊt÷ˆÁFÜ«ïváD&6Rá≤ñ˜WEˆñB¬FV6ÜÊñ6ñÂ˜W6W&Ê÷R“ì∞¢ñbÑÁV÷&W"Ü&6RÊñÊ6ˆ÷U˜ñB«¬í√“í&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢uîıUEÙ‰ıEıîEÙdı%ıtÖBr“ì∞¢6ˆÁ7B&FR“ˆ÷ˆÊWíá&WÊ&ˆGìÚÁvóFÜÜˆ∆FñÊu˜&FR”“ÁV∆¬Ú&ˆfñ∆RÁváEˆFVfV«E˜&FR«¬2¢&WÊ&ˆGíÁvóFÜÜˆ∆FñÊu˜&FRì∞¢6ˆÁ7BñÊ6ˆ÷T÷˜VÁB“ˆ÷ˆÊWíÜ&6RÊñÊ6ˆ÷U˜ñBì∞¢6ˆÁ7BvóFÜÜˆ∆FñÊt÷˜VÁB“ˆ÷ˆÊWíÜñÊ6ˆ÷T÷˜VÁB¢&FRÚì∞¢6ˆÁ7BWÜó7G2“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BFˆ7V÷VÁEˆñB¬Fˆ7V÷VÁEˆÊÚ¬7FGW2e$Ù“V&∆ñ2Ê66˜VÁFñÊuˆFˆ7V÷VÁG0¢tÑU$RFˆ7V÷VÁE˜GóS“wvóFÜÜˆ∆FñÊuˆ6W'Br‰B4ÙƒU44Rá7FGW2¬rrí√‚wfˆñFVBp¢‰Bñ∆ˆEˆß6ˆ‚”„‚wFV6ÜÊñ6ñÂ˜W6W&Ê÷Rs“C‰Bñ∆ˆEˆß6ˆ‚”„‚wváEˆ÷ˆÁFÇs“C ¢ı$DU"%í7&VFVEˆBDU42¬Fˆ7V÷VÁEˆñBDU42ƒî‘ïB¿¢∑FV6ÜÊñ6ñÂ˜W6W&Ê÷R¬&6RÊ÷ˆÁFÖˆ∂Wï–¢ì∞¢ñbÜWÜó7G2Á&˜w5≥“bb&WÊ&ˆGìÚÊf˜&6UˆÊWr”“G'VRí&WGW&‚&W2Á7FGW2ÉCííÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢utïDÑÑÙƒDî‰uÙ4U%EÙ≈$TEïÙUÑï5E2r¬&˜s¢WÜó7G2Á&˜w5≥““ì∞¢6ˆÁ7B7F˜"“ˆ66˜VÁFñÊt7F˜"á&Wì∞¢6ˆÁ7BFˆ4ÊÚ“vóBˆ66˜VÁFñÊtÊWáDFˆ7V÷VÁDÊÚÇwvóFÜÜˆ∆FñÊuˆ6W'Brì∞¢6ˆÁ7B6ˆ◊Áí“vóBˆvWD66˜VÁFñÊu6WGFñÊw2Çì∞¢6ˆÁ7Bñ∆ˆB“∞¢6˜W&6S¢wñ˜WEˆ÷ˆÁFÜ«ï˜váBr¿¢FV6ÜÊñ6ñÂ˜W6W&Ê÷R¿¢6˜W&6U˜ñ˜WEˆñC¢ñ˜WEˆñB¿¢6˜W&6U˜ñ˜WEˆñG3¢&6RÁñ˜WEˆñG2¿¢6˜W&6U˜&˜w3¢&6RÁ6˜W&6U˜&˜w2¿¢váEˆ÷ˆÁFÉ¢&6RÊ÷ˆÁFÖˆ∂Wí¿¢váEˆ÷ˆÁFÖˆ∆&V√¢&6RÊ÷ˆÁFÖˆ∆&V¬¿¢¶ˆ%ˆ6˜VÁC¢&6RÊ¶ˆ%ˆ6˜VÁB¿¢ñVUˆÊ÷S¢&ˆfñ∆RÊgV∆≈ˆÊ÷R¿¢ñVU˜FÖˆñC¢&ˆfñ∆RÁFÖˆñB¿¢ñVUˆFG&W73¢&ˆfñ∆RÁFÖˆFG&W72¿¢ñVUˆ'&Ê6É¢&ˆfñ∆RÁFÖˆ'&Ê6Ç«¬rr¿¢ñÊ6ˆ÷U˜GóS¢&ˆfñ∆RÁváEˆñÊ6ˆ÷U˜GóR«¬~àNòéã.âÆä>ãNàã.ä2˛àNòéã.àéòûã.à~â~ã>à.äﬁàrâ^ã.ääã.â^ä>ã"CÉÇír¿¢ñÊ6ˆ÷Uˆ÷˜VÁC¢ñÊ6ˆ÷T÷˜VÁB¿¢vóFÜÜˆ∆FñÊu˜&FS¢&FR¿¢vóFÜÜˆ∆FñÊuˆ÷˜VÁC¢vóFÜÜˆ∆FñÊt÷˜VÁB¿¢ñW#¢6ˆ◊Áí¿¢Ê˜FS¢~äﬁäﬁààéã.àäæâûòûã.à~ã.âûâÆãàﬁàÆãR‚àéòéã.ä.òà~ãNâûàÆòéã.àrä>ãâÆâÆàNã>âûä~â>àéã.àä.äﬁâNâ~ã^òéâÆãâûâ~ãnààéòéã.ä.àéä>ãNà~ò>âûòâNã~äﬁâûâûãòûâír¿¢”∞¢6ˆÁ7BñÁ2“vóBˆˆ¬ÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2Ê66˜VÁFñÊuˆFˆ7V÷VÁG2Ä¢Fˆ7V÷VÁEˆÊÚ¬Fˆ7V÷VÁE˜GóR¬7FGW2¬7W7Fˆ÷W%ˆÊ÷R¬7W7Fˆ÷W%˜FÖˆñB¬7W7Fˆ÷W%ˆFG&W72¿¢ó77VUˆFFR¬7V'F˜F¬¬Fó66˜VÁEˆ÷˜VÁB¬fEˆ÷˜VÁB¬vóFÜÜˆ∆FñÊuˆ÷˜VÁB¬F˜F≈ˆ÷˜VÁB¬ñ∆ˆEˆß6ˆ‚¿¢7&VFVEˆ'í¬WFFVEˆ'í¬ó77VVEˆ'í¬ó77VVEˆ@¢íd≈TU2ÇC¬wvóFÜÜˆ∆FñÊuˆ6W'Br¬vó77VVBr¬C"¬C2¬CBƒ5U%$TÂEÙDDR¬CR√√¬Cb¬CR¬Cs£¶ß6ˆÊ"¬CÇ¬CÇ¬CÇƒ‰ırÇíí$UEU$‰î‰r¶¿¢∂Fˆ4ÊÚ¬&ˆfñ∆RÊgV∆≈ˆÊ÷R¬&ˆfñ∆RÁFÖˆñB¬&ˆfñ∆RÁFÖˆFG&W72¬ñÊ6ˆ÷T÷˜VÁB¬vóFÜÜˆ∆FñÊt÷˜VÁB¬•4Ù‚Á7G&ñÊvñgíáñ∆ˆBí¬7F˜"ÁW6W&Ê÷R«¬ÁV∆≈–¢ì∞¢vóB∆ˆt66˜VÁFñÊtVFóBá&W¬≤7Fñˆ„¢tï55TUıtïDÑÑÙƒDî‰uÙ4U%Br¬VÁFóGï˜GóS¢v66˜VÁFñÊuˆFˆ7V÷VÁBr¬VÁFóGïˆñC¢7G&ñÊrÜñÁ2Á&˜w5≥“ÊFˆ7V÷VÁEˆñBí¬gFW%ˆß6ˆ„¢ñÁ2Á&˜w5≥“¬Ê˜FS¢G∂Fˆ4Ê˜“G∑FV6ÜÊñ6ñÂ˜W6W&Ê÷W“G∂&6RÊ÷ˆÁFÖˆ∆&V«÷“ì∞¢&WGW&‚&W2Êß6ˆ‚á≤ˆ≥¢G'VR¬&˜s¢ñÁ2Á&˜w5≥“¬&ñÁE˜W&√¢ˆF÷ñ‚ˆ66˜VÁFñÊrˆFˆ7V÷VÁG2ÚG∂ñÁ2Á&˜w5≥“ÊFˆ7V÷VÁEˆñG“˜&ñÁF“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Çuı5BˆF÷ñ‚ˆ66˜VÁFñÊr˜ñ˜WG2Ûßñ˜WEˆñB˜FV6ÇÛßW6W&Ê÷R˜vóFÜÜˆ∆FñÊr÷6W'Br¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢RÊ6ˆFR«¬tï55TUıtïDÑÑÙƒDî‰uÙ4U%EÙdîƒTBr¬÷W76vS¢RÊ÷W76vR“ì∞¢–ß“ì∞††¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊtvVÊW&ñ4Fˆ7V÷VÁE&ñÁDáF÷¬ÜFˆ2¬6ˆ◊Áíí∞¢6ˆÁ7BW64Ç“ˆ66˜VÁFñÊtFˆ7V÷VÁDáF÷ƒW66S∞¢6ˆÁ7Bf◊B“ábí”‚ÁV÷&W"áb«¬íÁFÙ∆ˆ6∆U7G&ñÊrÇwFÇ’DÇr¬≤÷ñÊñ◊V‘g&7Fñˆ‰FñvóG3¢"¬÷Üñ◊V‘g&7Fñˆ‰FñvóG3¢"“ì∞¢6ˆÁ7BGóT∆&V¬“á≤V˜FFñˆ„¢~ò>âÆòäÆâûäﬁä>ã.àNã"r¬ñÁfˆñ6S¢~ò>âÆòàéòûà~äæâûã^òír¬&V6VóC¢~ò>âÆòäÆä>ò~àéä>ãâÆòà~ãNâír¬FÖˆñÁfˆñ6S¢~ò>âÆàã>àãâÆäã.äûãRr“ï∂Fˆ2ÊFˆ7V÷VÁE˜GóU“«¬Fˆ2ÊFˆ7V÷VÁE˜GóS∞¢6ˆÁ7B“Fˆ2Áñ∆ˆEˆß6ˆ‚«¬∑”∞¢6ˆÁ7B6ñvÊGW&UW&¬“ˆ66˜VÁFñÊt˜vÊW%6ñvÊGW&UV&∆ñ5W&¬Çí«¬ˆ66˜VÁFñÊu6ñvÊGW&UV&∆ñ5W&¬Ü6ˆ◊Áíì∞¢6ˆÁ7B6ñvÊW$Ê÷R“ˆ66˜VÁFñÊt˜vÊW%6ñvÊW$Ê÷RÇì∞¢6ˆÁ7B6ñvÊW%˜6óFñˆ‚“ˆ66˜VÁFñÊt˜vÊW%6ñvÊW%˜6óFñˆ‚Çì∞¢6ˆÁ7B&˜w2“'&íÊó4'&íáÊ∆ñÊUˆóFV◊2íÚÊ∆ñÊUˆóFV◊2¢µ”∞¢6ˆÁ7Bó77VTFFR“Fˆ2Êó77VUˆFFRÚˆ66˜VÁFñÊuFÜîFFRÜFˆ2Êó77VUˆFFRí¢ˆ66˜VÁFñÊuFÜîFFRÜÊWrFFRÇíì∞¢6ˆÁ7BGVTFFR“Fˆ2ÊGVUˆFFRÚˆ66˜VÁFñÊuFÜîFFRÜFˆ2ÊGVUˆFFRí¢r“s∞¢&WGW&‚¬Fˆ7GóRáF÷√„∆áF÷¬∆Ês“'FÇ#„∆ÜVC„∆÷WF6Ü'6WC“'WFb”Ç#„∆÷WFÊ÷S“'fñWw˜'B"6ˆÁFVÁC“'vñGFÉ÷FWfñ6R◊vñGFÇ∆ñÊóFñ¬◊66∆S”#„«FóF∆S‚G∂W64ÇáGóT∆&V¬ó“G∂W64ÇÜFˆ2ÊFˆ7V÷VÁEˆÊ˜«¬rró”¬˜FóF∆S„«7Gñ∆S‡¢&ˆGó∂fˆÁB÷f÷ñ«ì§&ñ¬¬tÊ˜FÚ6Á2FÜír«6Á2◊6W&ñc∂÷&vñ„£∂&6∂w&˜VÊC¢6c6cff#∂6ˆ∆˜#¢3&VW“ÁvW∂÷Ç◊vñGFÉ£ìÉ∂÷&vñ„£#GÇWFÛ∂&6∂w&˜VÊC¢6ffc∑FFñÊs£3GÉ∂&˜&FW#£Ç6ˆ∆ñB6CÜSc“ÁF˜∂Fó7∆ì¶f∆WÉ∂ßW7Fñgí÷6ˆÁFVÁCß76R÷&WGvVV„∂v£áÉ∂&˜&FW"÷&˜GFˆ”£7Ç6ˆ∆ñB3#F&#3∑FFñÊr÷&˜GFˆ”£áá“Ê∆ˆv˜∂÷Ç÷ÜVñváC£cáá“Ê◊WFVG∂6ˆ∆˜#¢3c3sÉ7“Ê&˜á∂&˜&FW#£Ç6ˆ∆ñB6F&S6Vc∂&˜&FW"◊&FóW3£GÉ∑FFñÊs£GÉ∂÷&vñ„£GÇ“ÁF&«∑vñGFÉ£S∂&˜&FW"÷6ˆ∆∆6S¶6ˆ∆∆6S∂÷&vñ‚◊F˜£gá“ÁF&¬FÇ¬ÁF&¬FG∂&˜&FW"÷&˜GFˆ”£Ç6ˆ∆ñB6SVVc3∑FFñÊs£É∑FWáB÷∆ñv„¶∆VgC∑fW'Fñ6¬÷∆ñv„ßF˜“ÁF&¬Fá∂&6∂w&˜VÊC¢6VVcVfc∂6ˆ∆˜#¢3#&SfG“Á&ñváG∑FWáB÷∆ñv„ß&ñváBñ◊˜'FÁG“Á6ñvÁ∂Fó7∆ì¶f∆WÉ∂ßW7Fñgí÷6ˆÁFVÁC¶f∆WÇ÷VÊC∂÷&vñ‚◊F˜£C'á“Á6ñv‰&˜á∑FWáB÷∆ñv„¶6VÁFW#∂÷ñ‚◊vñGFÉ£#cá“Ê76WG∂÷Ç÷ÜVñváC£s'É∂÷Ç◊vñGFÉ£Éá“Á&ñÁD'FÁ∑˜6óFñˆ„¶fóÜVC∑&ñváC£áÉ∑F˜£áÉ∂&6∂w&˜VÊC¢6ffC#33∂6ˆ∆˜#¢3s#Cì∂&˜&FW#£∂&˜&FW"◊&FóW3£ììóÉ∑FFñÊs£'ÇáÉ∂fˆÁB◊vVñváC£ì‘÷VFñ&ñÁG∂&ˆGó∂&6∂w&˜VÊC¢6ffg“ÁvW∂÷&vñ„£∂&˜&FW#£∂÷Ç◊vñGFÉ¶ÊˆÊW“Á&ñÁD'FÁ∂Fó7∆ì¶ÊˆÊW◊”¬˜7Gñ∆S„¬ˆÜVC„∆&ˆGì„∆'WGFˆ‚6∆73“'&ñÁD'F‚"ˆÊ6∆ñ6≥“'vñÊF˜rÁ&ñÁBÇí#ÓâÓãNäâÓò¬Ú6fRDc¬ˆ'WGFˆ„„∆÷ñ‚6∆73“'vR#‡¢∆Fób6∆73“'F˜#„∆Fóc‚G∂6ˆ◊ÁíÊ∆ˆvı˜W&√ˆ∆ñ÷r6∆73“&∆ˆvÚ"7&3“"G∂W64ÇÜ6ˆ◊ÁíÊ∆ˆvı˜W&¬ó“#„∆'#Ê¢rw”∆É#‚G∂W64ÇÜ6ˆ◊ÁíÊ6ˆ◊ÁïˆÊ÷Ró”¬ˆÉ#„∆Fób6∆73“&◊WFVB#Óòä^à.âæä>ãàéã>â^ãä~âŒãûòûòäÆã^ä.äã.äûãRG∂W64ÇÜ6ˆ◊ÁíÁFÖˆñG«¬r“ró“(
"G∂W64ÇÜ6ˆ◊ÁíÊ'&Ê6á«¬rró”¬ˆFóc„∆Fóc‚G∂W64ÇÜ6ˆ◊ÁíÊFG&W77«¬rró”¬ˆFóc„∆FócÓò.â~ä2G∂W64ÇÜ6ˆ◊ÁíÁÜˆÊW«¬r“ró”¬ˆFóc„¬ˆFóc„∆Fób7Gñ∆S“'FWáB÷∆ñv„ß&ñváB#„∆É‚G∂W64ÇáGóT∆&V¬ó”¬ˆÉ„∆#Óòä^à.â~ã^òÇG∂W64ÇÜFˆ2ÊFˆ7V÷VÁEˆÊ˜«¬r“ró”¬ˆ#„∆'#„«7‚6∆73“&◊WFVB#Óä~ãâûâ~ã^òéäﬁäﬁàG∂W64ÇÜó77VTFFRó”¬˜7„„∆'#„«7‚6∆73“&◊WFVB#ÓäæäâNäﬁã.ä.ãÇ˛àNä>âÆàã>äæâûâBG∂W64ÇÜGVTFFRó”¬˜7„„¬ˆFóc„¬ˆFóc‡¢∆Fób6∆73“&&˜Ç#„∆#Óä^ãûààNòûã#¬ˆ#„∆'#‚G∂W64ÇÜFˆ2Ê7W7Fˆ÷W%ˆÊ÷W«¬r“ró”∆'#‚G∂Fˆ2Ê7W7Fˆ÷W%˜FÖˆñCˆòä^à.äã.äûãS¢G∂W64ÇÜFˆ2Ê7W7Fˆ÷W%˜FÖˆñBó”∆'#Ê¢rw“G∂W64ÇÜFˆ2Ê7W7Fˆ÷W%ˆFG&W77«¬rró“G∂Fˆ2Ê7W7Fˆ÷W%˜ÜˆÊSˆ∆'#Óò.â~ä2G∂W64ÇÜFˆ2Ê7W7Fˆ÷W%˜ÜˆÊRó÷¢rw”¬ˆFóc‡¢«F&∆R6∆73“'F&¬#„«FÜVC„«G#„«FÉ‚3¬˜FÉ„«FÉÓä>ã.ä.àã.ä3¬˜FÉ„«FÇ6∆73“'&ñváB#Óàéã>âûä~âì¬˜FÉ„«FÇ6∆73“'&ñváB#Óä>ã.àNã"˛äæâûòéä~ä#¬˜FÉ„«FÇ6∆73“'&ñváB#Óä>ä~ä¬˜FÉ„¬˜G#„¬˜FÜVC„«F&ˆGì‚G∑&˜w2Ê∆VÊwFÉ˜&˜w2Ê÷Çá"∆íì”Ê«G#„«FC‚G∂í≥”¬˜FC„«FC‚G∂W64Çá"ÊFW67&óFñˆÁ««"Ê¶ˆ%˜GóW«¬r“ró”∆Fób6∆73“&◊WFVB#‚G∂W64ÇÖ∑"Ê5˜GóR¬"Áv6Ö˜f&ñÁB¬"Ê'GU“Êfñ«FW"Ñ&ˆˆ∆V‚íÊ¶ˆñ‚ÇrÚríó”¬ˆFóc„¬˜FC„«FB6∆73“'&ñváB#‚G∂f◊Bá"ÁVÁFóGó«√ó”¬˜FC„«FB6∆73“'&ñváB#‚G∂f◊Bá"ÁVÊóE˜&ñ6W«√ó”¬˜FC„«FB6∆73“'&ñváB#‚G∂f◊Bá"Ê∆ñÊU˜F˜F««√ó”¬˜FC„¬˜G#ÊíÊ¶ˆñ‚Çrrì¶«G#„«FC„¬˜FC„«FCÓä.äﬁâNòäﬁàäÆã.ä3¬˜FC„«FB6∆73“'&ñváB#„¬˜FC„«FB6∆73“'&ñváB#‚G∂f◊BÜFˆ2Á7V'F˜F¬ó”¬˜FC„«FB6∆73“'&ñváB#‚G∂f◊BÜFˆ2Á7V'F˜F¬ó”¬˜FC„¬˜G#Ê”¬˜F&ˆGì„«Ffˆ˜C„«G#„«FÇ6ˆ«7„“#B"6∆73“'&ñváB#Â7V'F˜F√¬˜FÉ„«FÇ6∆73“'&ñváB#‚G∂f◊BÜFˆ2Á7V'F˜F¬ó”¬˜FÉ„¬˜G#„«G#„«FÇ6ˆ«7„“#B"6∆73“'&ñváB#ÓäÆòéä~âûä^âC¬˜FÉ„«FÇ6∆73“'&ñváB#‚G∂f◊BÜFˆ2ÊFó66˜VÁEˆ÷˜VÁBó”¬˜FÉ„¬˜G#„«G#„«FÇ6ˆ«7„“#B"6∆73“'&ñváB#ÂdC¬˜FÉ„«FÇ6∆73“'&ñváB#‚G∂f◊BÜFˆ2ÁfEˆ÷˜VÁBó”¬˜FÉ„¬˜G#„«G#„«FÇ6ˆ«7„“#B"6∆73“'&ñváB#Óäæãàâ2â~ã^òéàéòéã.ä#¬˜FÉ„«FÇ6∆73“'&ñváB#‚G∂f◊BÜFˆ2ÁvóFÜÜˆ∆FñÊuˆ÷˜VÁBó”¬˜FÉ„¬˜G#„«G#„«FÇ6ˆ«7„“#B"6∆73“'&ñváB#Óä.äﬁâNä>ä~ääÆãéâ~âéãC¬˜FÉ„«FÇ6∆73“'&ñváB#‚G∂f◊BÜFˆ2ÁF˜F≈ˆ÷˜VÁBó”¬˜FÉ„¬˜G#„¬˜Ffˆ˜C„¬˜F&∆S‡¢∆Fób6∆73“&&˜Ç#„∆#Óäæäã.ä.òäæâ^ãÉ¬ˆ#„∆'#‚G∂W64ÇáÊÊ˜FR«¬6ˆ◊ÁíÊfˆ˜FW%˜FWáB«¬~òäﬁàäÆã.ä>âûã^òûò>àÆòûâæä>ãàäﬁâÆàã.ä>â^ä>ä~àéäÆäﬁâÆòä^ãâ~ã>ä>ã.ä.àã.ä>à.äﬁàr6ˆ∆GvñÊFf∆˜ró"6W'fñ6W2ró”¬ˆFóc‡¢∆Fób6∆73“'6ñv‚#„∆Fób6∆73“'6ñv‰&˜Ç#‚G∂6ˆ◊ÁíÁ7F◊˜W&√ˆ∆ñ÷r6∆73“&76WB"7&3“"G∂W64ÇÜ6ˆ◊ÁíÁ7F◊˜W&¬ó“#„∆'#Ê¢rw“G∑6ñvÊGW&UW&√ˆ∆ñ÷r6∆73“&76WB"7&3“"G∂W64Çá6ñvÊGW&UW&¬ó“"«C“&WFÜ˜&ó¶VB6ñvÊGW&R#„∆'#Ê¢rw”∆FócÓä^à~àÆã~òéä“ııııııııııııııııııııııÛ¬ˆFóc„∆#‚G∂W64Çá6ñvÊW$Ê÷Ró”¬ˆ#„∆Fób6∆73“&◊WFVB#‚G∂W64Çá6ñvÊW%˜6óFñˆ‚ó”¬ˆFóc„¬ˆFóc„¬ˆFóc‡£¬ˆ÷ñ„„¬ˆ&ˆGì„¬ˆáF÷√Ê∞ß–†¶ÊvWBÇrˆF÷ñ‚ˆ66˜VÁFñÊrˆFˆ7V÷VÁG2Û¶Fˆ7V÷VÁEˆñB˜&ñÁBr¬&WVó&T66˜VÁFñÊuW&÷ó76ñˆ‚Çv66˜VÁFñÊrÁ&VBÊFˆ7V÷VÁG2rí¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BñB“ÁV÷&W"á&WÁ&◊2ÊFˆ7V÷VÁEˆñB«¬ì∞¢ñbÇñBí&WGW&‚&W2Á7FGW2ÉCíÁ6VÊBÇtñÁf∆ñBFˆ7V÷VÁBñBrì∞¢6ˆÁ7B“vóBˆˆ¬ÁVW'íÜ4TƒT5B¢e$Ù“V&∆ñ2Ê66˜VÁFñÊuˆFˆ7V÷VÁG2tÑU$RFˆ7V÷VÁEˆñC“Cƒî‘ïB¬∂ñE“ì∞¢6ˆÁ7BFˆ2“Á&˜w5≥”∞¢ñbÇFˆ2í&WGW&‚&W2Á7FGW2ÉCBíÁ6VÊBÇtFˆ7V÷VÁBÊ˜Bf˜VÊBrì∞¢6ˆÁ7B6ˆ◊Áí“vóBˆvWD66˜VÁFñÊu6WGFñÊw2Çì∞¢ñbÖ7G&ñÊrÜFˆ2ÊFˆ7V÷VÁE˜GóRí””“wvóFÜÜˆ∆FñÊuˆ6W'Brí&WGW&‚&W2ÁGóRÇv∆ñ6Fñˆ‚˜FbríÁ6WBÇt6ˆÁFVÁB‘Fó7˜6óFñˆ‚r¬ñÊ∆ñÊS≤fñ∆VÊ÷S“"G∂Fˆ2ÊFˆ7V÷VÁEˆÊÚ«¬wváCSw“ÁFb&íÁ6VÊBÜvóBˆ66˜VÁFñÊuvóFÜÜˆ∆FñÊuFd'VffW"ÜFˆ2¬6ˆ◊Áííì∞¢&WGW&‚&W2ÁGóRÇváF÷¬ríÁ6VÊBÖˆ66˜VÁFñÊtvVÊW&ñ4Fˆ7V÷VÁE&ñÁDáF÷¬ÜFˆ2¬6ˆ◊Áííì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÇttUBˆF÷ñ‚ˆ66˜VÁFñÊrˆFˆ7V÷VÁG2Û¶Fˆ7V÷VÁEˆñB˜&ñÁBr¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÁ6VÊBÇu&ñÁBFˆ7V÷VÁBfñ∆VBrì∞¢–ß“ì∞†¶Á˜7BÇrˆF÷ñ‚ˆ66˜VÁFñÊr˜ñ˜WG2Ûßñ˜WEˆñBˆFßW7Br¬&WVó&T66˜VÁFñÊuW&÷ó76ñˆ‚Çv66˜VÁFñÊuˆ÷&µ˜ñ˜WE˜ñBrí¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B6∆ñVÁB“vóBˆˆ¬Ê6ˆÊÊV7BÇì∞¢∆WB&Vv‚“f«6S∞¢G'í∞¢6ˆÁ7Bñ˜WEˆñB“7G&ñÊrá&WÁ&◊2Áñ˜WEˆñB«¬rríÁG&ñ“Çì∞¢vóB6∆ñVÁBÁVW'íÇt$Ttî‚rì∞¢&Vv‚“G'VS∞¢6ˆÁ7B&W7V«B“vóB66˜VÁFñÊuñ˜WDFßW7F÷VÁG2Ê«î66˜VÁFñÊu˜6óFófUñ˜WDFßW7F÷VÁBá∞¢6∆ñVÁB¿¢ñ˜WEˆñB¿¢&ˆGì¢&WÊ&ˆGí«¬∑“¿¢7F˜#¢ˆ66˜VÁFñÊt7F˜"á&Wí¿¢&W¿¢&VvVÊW&FTG&gEñ˜WD6ˆÁG&7D∆ñÊW3¢˜&VvVÊW&FTG&gEñ˜WD6ˆÁG&7D∆ñÊW2¿¢“ì∞¢vóB6∆ñVÁBÁVW'íÇt4Ù‘‘ïBrì∞¢&Vv‚“f«6S∞¢&WGW&‚&W2Êß6ˆ‚á∞¢ˆ≥¢G'VR¿¢ñ˜WEˆñB¿¢FV6ÜÊñ6ñÂ˜W6W&Ê÷S¢&W7V«BÊFßW7F÷VÁCÚÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R«¬&WÊ&ˆGìÚÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R«¬ÁV∆¬¿¢FßW7F÷VÁC¢&W7V«BÊFßW7F÷VÁB¿¢ñ÷VÁC¢&W7V«BÁñ÷VÁB«¬ÁV∆¬¿¢F˜F«3¢&W7V«BÁF˜F«2¿¢ñE˜7FGW3¢&W7V«BÁF˜F«3ÚÁñE˜7FGW2«¬ÁV∆¬¿¢W&ñˆE˜7FGW5ˆ&Vf˜&S¢&W7V«BÁW&ñˆE˜7FGW5ˆ&Vf˜&R«¬ÁV∆¬¿¢W&ñˆE˜7FGW5ˆgFW#¢&W7V«BÁW&ñˆE˜7FGW5ˆgFW"«¬ÁV∆¬¿¢&VvVÊW&FVC¢&W7V«BÁ&VvVÊW&FVB¿¢&W∆ñVC¢&W7V«BÁ&W∆ñVB¿¢“ì∞¢“6F6ÇÜRí∞¢ñbÜ&Vv‚í≤G'í≤vóB6∆ñVÁBÁVW'íÇu$Ùƒƒ$4≤rì≤“6F6Ç∑“–¢6ˆÁ6ˆ∆RÊW'&˜"Çuı5BˆF÷ñ‚ˆ66˜VÁFñÊr˜ñ˜WG2Ûßñ˜WEˆñBˆFßW7Br¬Rì∞¢6ˆÁ7B6ˆFR“ÁV÷&W"ÜRÁ7FGW46ˆFR«¬Sì∞¢6ˆÁ7BW'&˜"“7G&ñÊrÜRÊ6ˆFR«¬RÊ÷W76vR«¬uîıUEÙD•U5D‘TÂEÙdîƒTBrì∞¢ñbÜW'&˜"””“uîıUEÙD•U5D‘TÂEÙ‘îu$DîÙÂı$UTï$TBrí&WGW&‚&W2Á7FGW2ÉS2íÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜"“ì∞¢ñbÜW'&˜"””“tîDT’ıDT‰5ïÙ¥Uïı$UU4TBrí&WGW&‚&W2Á7FGW2ÉCííÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜"“ì∞¢ñbÜW'&˜"””“uîıUEıîEı$T4Ù‰4îƒîDîÙÂı$UTï$TBrí&WGW&‚&W2Á7FGW2ÉCííÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜"“ì∞¢ñbÜW'&˜"””“uîıUEıU$îÙEÙ‰ıEÙ4ƒı4TBrí&WGW&‚&W2Á7FGW2ÉCííÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜"¬W&ñˆEˆVÊC¢RÁW&ñˆEˆVÊB«¬ÁV∆¬“ì∞¢ñbÖ≤uîıUEÙ‰ıEÙdıT‰Br¬t§Ù%Ù‰ıEÙdıT‰Bu“ÊñÊ6«VFW2ÜW'&˜"íí&WGW&‚&W2Á7FGW2Ü6ˆFR””“SÚCB¢6ˆFRíÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜"“ì∞¢ñbÖ∞¢t‘ï54î‰uıîıUEÙîBr¿¢t‘ï54î‰uıDT4Ñ‰î4îÂıU4U$‰‘Rr¿¢tîÂdƒîEÙD•U5D‘TÂEÙ‘ıTÂBr¿¢tîÂdƒîEÙîDT’ıDT‰5ïÙ¥Uír¿¢t‘ï54î‰uı$T4Ù‚r¿¢tîDT’ıDT‰5ïÙ¥Uïı$UTï$TBr¿¢t4Ù‰dï$’ÙD•U5D‘TÂEı$UTï$TBr¿¢tîÂdƒîEÙ§Ù%ÙîBr¿¢“ÊñÊ6«VFW2ÜW'&˜"íí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜"“ì∞¢&WGW&‚&W2Á7FGW2Ü6ˆFR„“Cbb6ˆFR¬cÚ6ˆFR¢SíÊß6ˆ‚á≤ˆ≥¶f«6R¬W'&˜#¢uîıUEÙD•U5D‘TÂEÙdîƒTBr“ì∞¢“fñÊ∆«í∞¢6∆ñVÁBÁ&V∆V6RÇì∞¢–ß“ì∞†¶Á˜7BÇrˆF÷ñ‚ˆ66˜VÁFñÊr˜ñ˜WG2Ûßñ˜WEˆñB˜ír¬&WVó&T66˜VÁFñÊuW&÷ó76ñˆ‚Çv66˜VÁFñÊuˆ÷&µ˜ñ˜WE˜ñBrí¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B6∆ñVÁB“vóBˆˆ¬Ê6ˆÊÊV7BÇì∞¢G'í∞¢6ˆÁ7Bñ˜WEˆñB“7G&ñÊrá&WÁ&◊2Áñ˜WEˆñB«¬rríÁG&ñ“Çì∞¢6ˆÁ7B&ˆGí“&WÊ&ˆGí«¬∑”∞¢6ˆÁ7BFV6Ç“7G&ñÊrÜ&ˆGíÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7BñDÊ˜r“ˆ÷ˆÊWíÜ&ˆGíÁñEˆ÷˜VÁBì∞¢ñbÇñ˜WEˆñBí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢t‘ï54î‰uıîıUEÙîBr“ì∞¢ñbÇFV6Çí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢t‘ï54î‰uıDT4Ñ‰î4îÂıU4U$‰‘Rr“ì∞¢ñbÜ&ˆGíÊ6ˆÊfó&’˜ñB”“G'VRí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢t4Ù‰dï$’ıîEı$UTï$TBr“ì∞¢ñbÑÁV÷&W"áñDÊ˜r«¬í√“í&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢tîÂdƒîEıîEÙ‘ıTÂBr“ì∞†¢vóB6∆ñVÁBÁVW'íÇt$Ttî‚rì∞¢6ˆÁ7B&W&VB“vóBVÁ7W&Uñ˜WEW&ñˆDÊE6Ê6Ü˜Df˜%ñ÷VÁBá∞¢ˆˆ¬¿¢6∆ñVÁB¿¢ñ˜WEˆñB¿¢7F˜%˜W6W&Ê÷S¢ˆ66˜VÁFñÊt7F˜"á&WíÁW6W&Ê÷R«¬ÁV∆¬¿¢vWEñ˜WEW&ñˆC¢áñBí”‚ˆvWEñ˜WEW&ñˆBáñB¬6∆ñVÁB¬≤f˜%WFFS¢G'VR“í¿¢&VvVÊW&FTG&gEñ˜WD6ˆÁG&7D∆ñÊW3¢˜&VvVÊW&FTG&gEñ˜WD6ˆÁG&7D∆ñÊW2¿¢&W¿¢“ì∞¢6ˆÁ7B&Vf˜&UF˜F«2“vóBˆvWEFV6Ñw&˜74F§ÊWBáñ˜WEˆñB¬FV6Ç¬6∆ñVÁB¬≤W&ñˆE˜7FGW3¢&W&VBÁW&ñˆCÚÁ7FGW2«¬vG&gBr“ì∞¢6ˆÁ7B&Vf˜&Uï“vóB6∆ñVÁBÁVW'íÄ¢4TƒT5BñEˆ÷˜VÁB¬ñE˜7FGW2¬ñEˆB¬ñEˆ'í¬6∆ó˜W&¬¬Ê˜FR¬ñ÷VÁEˆ÷WFÜˆB¬ñ÷VÁE˜&VfW&VÊ6P¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜ñ˜WE˜ñ÷VÁG0¢tÑU$Rñ˜WEˆñC“C‰BFV6ÜÊñ6ñÂ˜W6W&Ê÷S“C ¢ƒî‘ïB¢dı"UDDV¿¢∑ñ˜WEˆñB¬FV6Ö–¢ì∞¢6ˆÁ7B&Vf˜&Uñ÷VÁB“&Vf˜&UïÁ&˜w5≥“«¬ÁV∆√∞¢6ˆÁ7B7W'&VÁEñB“ÁV÷&W"Ü&Vf˜&Uñ÷VÁCÚÁñEˆ÷˜VÁB«¬ì∞¢6ˆÁ7BFW˜6óE&W7V«B“vóBˆVÁ7W&TFW˜6óD6ˆ∆∆V7Fñˆ‰f˜%ñ˜WBá∞¢ñ˜WEˆñB¿¢W6W&Ê÷S¢FV6Ç¿¢w&˜75ˆ÷˜VÁC¢&Vf˜&UF˜F«2Êw&˜75ˆ÷˜VÁB¿¢F•˜F˜F√¢&Vf˜&UF˜F«2ÊF•˜F˜F¬¿¢7F˜#¢ˆ66˜VÁFñÊt7F˜"á&WíÁW6W&Ê÷R«¬ÁV∆¬¿¢6∆ñVÁB¿¢“ì∞¢6ˆÁ7B7W'&VÁEF˜F«2“vóBˆvWEFV6Ñw&˜74F§ÊWBáñ˜WEˆñB¬FV6Ç¬6∆ñVÁB¬≤W&ñˆE˜7FGW3¢&W&VBÁW&ñˆCÚÁ7FGW2«¬vG&gBr“ì∞¢6ˆÁ7B&V÷ñÊñÊr“÷FÇÊ÷ÇÉ¬ÁV÷&W"Ü7W'&VÁEF˜F«2ÊÊWEˆ÷˜VÁB«¬í“7W'&VÁEñBì∞¢ñbá&V÷ñÊñÊr√“„í∞¢vóB6∆ñVÁBÁVW'íÇu$Ùƒƒ$4≤rì∞¢&WGW&‚&W2Á7FGW2ÉCííÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢uîıUEÙ≈$TEïıîBr“ì∞¢–¢ñbÑÁV÷&W"áñDÊ˜rí“&V÷ñÊñÊr‚„í∞¢vóB6∆ñVÁBÁVW'íÇu$Ùƒƒ$4≤rì∞¢&WGW&‚&W2Á7FGW2ÉCííÊß6ˆ‚á∞¢ˆ≥¢f«6R¿¢W'&˜#¢uîıUEıî$ƒUÙ4Ñ‰tTBr¿¢7W'&VÁE˜ñ&∆Uˆ÷˜VÁC¢ˆ÷ˆÊWíÜ7W'&VÁEF˜F«2ÊÊWEˆ÷˜VÁB«¬í¿¢&V÷ñÊñÊuˆ÷˜VÁC¢ˆ÷ˆÊWíá&V÷ñÊñÊrí¿¢&WVW7FVE˜ñEˆ÷˜VÁC¢ˆ÷ˆÊWíáñDÊ˜rí¿¢FW˜6óEˆFVGV7FñˆÂˆ÷˜VÁC¢ˆ÷ˆÊWíÜ7W'&VÁEF˜F«2ÊFW˜6óEˆFVGV7FñˆÂˆ÷˜VÁB«¬í¿¢“ì∞¢–†¢6ˆÁ7Bñ÷VÁEˆ÷WFÜˆB“7G&ñÊrÜ&ˆGíÁñ÷VÁEˆ÷WFÜˆB«¬rríÁG&ñ“Çí«¬ÁV∆√∞¢6ˆÁ7Bñ÷VÁE˜&VfW&VÊ6R“7G&ñÊrÜ&ˆGíÁñ÷VÁE˜&VfW&VÊ6R«¬rríÁG&ñ“Çí«¬ÁV∆√∞¢6ˆÁ7BÊ˜FR“7G&ñÊrÜ&ˆGíÊÊ˜FR«¬rríÁG&ñ“Çí«¬ÁV∆√∞¢6ˆÁ7B6∆ó˜W&¬“7G&ñÊrÜ&ˆGíÁ6∆ó˜W&¬«¬rríÁG&ñ“Çí«¬ÁV∆√∞¢6ˆÁ7B7V◊V∆FófUñB“ˆ÷ˆÊWíÜ7W'&VÁEñB≤ÁV÷&W"áñDÊ˜ríì∞¢6ˆÁ7B&W7V«B“vóB˜W6W'Eñ÷VÁDÊD÷ñ&T÷&µñBáñ˜WEˆñB¬FV6Ç¬7V◊V∆FófUñB¬6∆ó˜W&¬¬Ê˜FR¬ˆ66˜VÁFñÊt7F˜"á&WíÁW6W&Ê÷R«¬ÁV∆¬¬&W¬∞¢6∆ñVÁB¿¢&W&VEW&ñˆC¢&W&VBÁW&ñˆB¿¢FW˜6óD«&VGï&W&VC¢G'VR¿¢FW˜6óD6ˆ∆∆V7FñˆÁ3¢≤6ÜV6∂VC¢¬ñÁ6W'FVC¢FW˜6óE&W7V«BÊñÁ6W'FVBÚ¢“¿¢“ì∞†¢vóB6∆ñVÁBÁVW'íÄ¢UDDRV&∆ñ2ÁFV6ÜÊñ6ñÂ˜ñ˜WE˜ñ÷VÁG0¢4UBñ÷VÁEˆ÷WFÜˆC‘4ÙƒU44RÇC2¬ñ÷VÁEˆ÷WFÜˆBí¿¢ñ÷VÁE˜&VfW&VÊ6S‘4ÙƒU44RÇCB¬ñ÷VÁE˜&VfW&VÊ6Rê¢tÑU$Rñ˜WEˆñC“C‰BFV6ÜÊñ6ñÂ˜W6W&Ê÷S“C&¿¢∑ñ˜WEˆñB¬FV6Ç¬ñ÷VÁEˆ÷WFÜˆB¬ñ÷VÁE˜&VfW&VÊ6U–¢ì∞†¢6ˆÁ7BgFW%ï“vóB6∆ñVÁBÁVW'íÄ¢4TƒT5BñEˆ÷˜VÁB¬ñE˜7FGW2¬ñEˆB¬ñEˆ'í¬6∆ó˜W&¬¬Ê˜FR¬ñ÷VÁEˆ÷WFÜˆB¬ñ÷VÁE˜&VfW&VÊ6P¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜ñ˜WE˜ñ÷VÁG0¢tÑU$Rñ˜WEˆñC“C‰BFV6ÜÊñ6ñÂ˜W6W&Ê÷S“C ¢ƒî‘ïB¿¢∑ñ˜WEˆñB¬FV6Ö–¢ì∞¢6ˆÁ7BgFW%F˜F«2“vóBˆvWEFV6Ñw&˜74F§ÊWBáñ˜WEˆñB¬FV6Ç¬6∆ñVÁB¬≤W&ñˆE˜7FGW3¢&W&VBÁW&ñˆCÚÁ7FGW2«¬v∆ˆ6∂VBr“ì∞¢vóB∆ˆt66˜VÁFñÊtVFóBá&W¬∞¢7Fñˆ„¢t‘$µıîıUEıîBr¿¢VÁFóGï˜GóS¢wFV6ÜÊñ6ñÂ˜ñ˜WE˜ñ÷VÁBr¿¢VÁFóGïˆñC¢G∑ñ˜WEˆñG”¢G∑FV6á÷¿¢&Vf˜&Uˆß6ˆ„¢≤F˜F«3¢&Vf˜&UF˜F«2¬ñ÷VÁC¢&Vf˜&Uñ÷VÁB“¿¢gFW%ˆß6ˆ„¢≤F˜F«3¢gFW%F˜F«2¬ñ÷VÁC¢gFW%ïÁ&˜w5≥“«¬ÁV∆¬“¿¢Ê˜FS¢Ê˜FR«¬ñ÷VÁE˜&VfW&VÊ6R«¬ñ÷VÁEˆ÷WFÜˆB«¬ÁV∆¬¿¢“¬≤6∆ñVÁB¬7G&ñ7C¢G'VR“ì∞†¢vóB6∆ñVÁBÁVW'íÇt4Ù‘‘ïBrì∞†¢&WGW&‚&W2Êß6ˆ‚á∞¢ˆ≥¢G'VR¿¢ñ˜WEˆñB¿¢FV6ÜÊñ6ñÂ˜W6W&Ê÷S¢FV6Ç¿¢ñEˆ÷˜VÁC¢7V◊V∆FófUñB¿¢ñE˜7FGW3¢&W7V«BÁñE˜7FGW2¿¢ÊWEˆ÷˜VÁC¢&W7V«BÊÊWEˆ÷˜VÁB¿¢ñ÷VÁC¢gFW%ïÁ&˜w5≥“«¬ÁV∆¬¿¢“ì∞¢“6F6ÇÜRí∞¢G'í≤vóB6∆ñVÁBÁVW'íÇu$Ùƒƒ$4≤rì≤“6F6Ç∑–¢6ˆÁ6ˆ∆RÊW'&˜"Çuı5BˆF÷ñ‚ˆ66˜VÁFñÊr˜ñ˜WG2Ûßñ˜WEˆñB˜ír¬Rì∞¢ñbÖ7G&ñÊrÜRÊ6ˆFR«¬rrí””“uîıUEÙ‰ıEÙdıT‰Brí&WGW&‚&W2Á7FGW2ÉCBíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢uîıUEÙ‰ıEÙdıT‰Br“ì∞¢ñbÖ7G&ñÊrÜRÊ6ˆFR«¬rrí””“uîıUEÙ≈$TEïıîBrí&WGW&‚&W2Á7FGW2ÉCííÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢uîıUEÙ≈$TEïıîBr“ì∞¢ñbÖ7G&ñÊrÜRÊ6ˆFR«¬rrí””“tDUı4ïEÙ4ÙƒƒT5EÙî‰DUÖı$UTï$TBrí&WGW&‚&W2Á7FGW2ÉS2íÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢tDUı4ïEÙ4ÙƒƒT5EÙî‰DUÖı$UTï$TBr“ì∞¢ñbÖ7G&ñÊrÜRÊ6ˆFR«¬rrí””“uîıUEıî$ƒUÙ4Ñ‰tTBrí&WGW&‚&W2Á7FGW2ÉCííÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢uîıUEıî$ƒUÙ4Ñ‰tTBr¬7W'&VÁE˜ñ&∆Uˆ÷˜VÁC¢RÊ7W'&VÁE˜ñ&∆Uˆ÷˜VÁB¬&WVW7FVE˜ñEˆ÷˜VÁC¢RÁ&WVW7FVE˜ñEˆ÷˜VÁB“ì∞¢ñbÖ7G&ñÊrÜRÊ6ˆFR«¬rrí””“uîıUEıU$îÙEÙ‰ıEÙ4ƒı4TBrí&WGW&‚&W2Á7FGW2ÉCííÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢uîıUEıU$îÙEÙ‰ıEÙ4ƒı4TBr¬W&ñˆEˆVÊC¢RÁW&ñˆEˆVÊB«¬ÁV∆¬“ì∞¢ñbÖ7G&ñÊrÜRÊ÷W76vR«¬rríÊñÊ6«VFW2Çt4‰‰ıEı$TtT‰U$DRríí&WGW&‚&W2Á7FGW2ÉCííÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢7G&ñÊrÜRÊ÷W76vR«¬t4‰‰ıEı$TtT‰U$DRrí“ì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢t‘$µıîıUEıîEÙdîƒTBr“ì∞¢“fñÊ∆«í∞¢6∆ñVÁBÁ&V∆V6RÇì∞¢–ß“ì∞†¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊt77ef«VRábí∞¢ñbáb”“ÁV∆¬í&WGW&‚rs∞¢ñbábñÁ7FÊ6VˆbFFRí&WGW&‚bÁFÙï4ı7G&ñÊrÇì∞¢ñbáGóVˆbb””“vˆ&¶V7Brí&WGW&‚•4Ù‚Á7G&ñÊvñgíábì∞¢&WGW&‚7G&ñÊrábì∞ß–†¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊt77bá&˜w2“µ“¬6ˆ«V÷Á2“µ“í∞¢6ˆÁ7BW6477b“ábí”‚∞¢6ˆÁ7B&r“ˆ66˜VÁFñÊt77ef«VRábì∞¢6ˆÁ7BW66VB“&rÁ&W∆6RÇÚ"ˆr¬r""rì∞¢&WGW&‚ı≤"≈∆Â«%“ÚÁFW7BÜW66VBíÚ"G∂W66VG“&¢W66VC∞¢”∞¢6ˆÁ7BÜVFW"“6ˆ«V÷Á2Ê÷Ü2”‚W6477bÜ2Ê∆&V¬«¬2Ê∂WíííÊ¶ˆñ‚Çr¬rì∞¢6ˆÁ7B&ˆGí“&˜w2Ê÷á&˜r”‚6ˆ«V÷Á2Ê÷Ü2”‚W6477bá&˜u∂2Ê∂Wï“ííÊ¶ˆñ‚Çr¬rííÊ¶ˆñ‚Çu∆‚rì∞¢&WGW&‚u«VfVfbr≤ÜVFW"≤Ü&ˆGíÚu∆‚r≤&ˆGí¢u∆‚rì∞ß–†¶gVÊ7Fñˆ‚ˆ66˜VÁFñÊu6VÊD77bá&W2¬fñ∆VÊ÷R¬&˜w2¬6ˆ«V÷Á2í∞¢6ˆÁ7B6fTÊ÷R“7G&ñÊrÜfñ∆VÊ÷R«¬v66˜VÁFñÊr◊&W˜'BÊ77bríÁ&W∆6RÇıµÊ◊§’£”íÂÚ’“ˆr¬uÚrì∞¢&W2Á6WDÜVFW"Çt6ˆÁFVÁB’GóRr¬wFWáBˆ77c≤6Ü'6WC◊WFb”Çrì∞¢&W2Á6WDÜVFW"Çt6ˆÁFVÁB‘Fó7˜6óFñˆ‚r¬GF6Ü÷VÁC≤fñ∆VÊ÷S“"G∑6fTÊ÷W“&ì∞¢&WGW&‚&W2Á6VÊBÖˆ66˜VÁFñÊt77bá&˜w2¬6ˆ«V÷Á2íì∞ß–†¶6ˆÁ7B44ıTÂDî‰uı$Uı%E2“∞¢&WfVÁVS¢∞¢fñ∆VÊ÷S¢v7vb÷66˜VÁFñÊr◊&WfVÁVRÊ77br¿¢∆&V√¢~ä>ã.ä.à~ã.âûä>ã.ä.ä>ãâ¢r¿¢6ˆ«V÷Á3¢∞¢≤∂Wì¢v&ˆˆ∂ñÊuˆ6ˆFRr¬∆&V√¢~ä>äæãäÆà~ã.âír“¿¢≤∂Wì¢v¶ˆ%ˆñBr¬∆&V√¢t¶ˆ"îBr“¿¢≤∂Wì¢vfñÊó6ÜVEˆBr¬∆&V√¢~ä~ãâûâ~ã^òéà~ã.âûòäÆä>ò~àÇr“¿¢≤∂Wì¢v7W7Fˆ÷W%ˆÊ÷Rr¬∆&V√¢~ä^ãûààNòûã"r“¿¢≤∂Wì¢v7W7Fˆ÷W%˜ÜˆÊUˆ÷6∂VBr¬∆&V√¢~òâÆäﬁä>òŒä^ãûààNòûã"r“¿¢≤∂Wì¢vw&˜75˜6∆W5ˆ÷˜VÁBr¬∆&V√¢~ä.äﬁâNà.ã.ä.òâ^ò~är“¿¢≤∂Wì¢wñ÷VÁE˜7FGW5˜FÇr¬∆&V√¢~äÆânã.âûãä>ãâÆòà~ãNâír“¿¢≤∂Wì¢w&u˜ñ÷VÁE˜7FGW2r¬∆&V√¢~äÆânã.âûãòâNãNär“¿¢≤∂Wì¢wñEˆBr¬∆&V√¢~ä>ãâÆòà~ãNâûòäã~òéä“r“¿¢≤∂Wì¢wñEˆ'ír¬∆&V√¢~âÆãâûâ~ãnàò.âNä"r“¿¢≤∂Wì¢wñ÷VÁEˆ÷WFÜˆBr¬∆&V√¢~àÆòéäﬁà~â~ã.à~ä>ãâÆòà~ãNâír“¿¢≤∂Wì¢wñ÷VÁE˜&VfW&VÊ6Rr¬∆&V√¢~òä^à.äﬁòûã.à~äﬁãNàrr“¿¢≤∂Wì¢wñ÷VÁE˜&ˆˆe˜W&¬r¬∆&V√¢~äæä^ãàâã.âûä>ãâÆòà~ãNâír“¿¢“¿¢7√¢Çí”‚tïDÇw&˜722Ä¢4TƒT5B¢Ê¶ˆ%ˆñB¬4ÙƒU44RÑÂTƒƒîbÖ5T“Ñ4ÙƒU44RÜ¶íÊ∆ñÊU˜F˜F¬√íí√í¬4ÙƒU44RÜ¢Ê¶ˆ%˜&ñ6R√í¬ì£¶ÁV÷W&ñ22w&˜75˜6∆W5ˆ÷˜VÁ@¢e$Ù“V&∆ñ2Ê¶ˆ'2†¢ƒTeB§Ùî‚V&∆ñ2Ê¶ˆ%ˆóFV◊2¶íÙ‚45BÜ¶íÊ¶ˆ%ˆñB2DUÖBì‘45BÜ¢Ê¶ˆ%ˆñB2DUÖBê¢tÑU$RGµ˜7ƒFˆÊU&VFñ6FRÇv¢ró“‰B¢ÊfñÊó6ÜVEˆBï2‰ıBÂTƒ¿¢u$ıU%í¢Ê¶ˆ%ˆñB¬¢Ê¶ˆ%˜&ñ6P¢í¬&ˆˆb2Ä¢4TƒT5BDï5Dî‰5BÙ‚Ü¶ˆ%ˆñBí¶ˆ%ˆñB¬V&∆ñ5˜W&¿¢e$Ù“V&∆ñ2Ê¶ˆ%˜Ü˜F˜0¢tÑU$R4ÙƒU44RáÜ6R¬rrì“wñ÷VÁE˜6∆ór‰B4ÙƒU44RáV&∆ñ5˜W&¬¬rrí√‚rp¢ı$DU"%í¶ˆ%ˆñB¬4ÙƒU44RáW∆ˆFVEˆB¬7&VFVEˆBíDU40¢ê¢4TƒT5B¢Ê&ˆˆ∂ñÊuˆ6ˆFR¬¢Ê¶ˆ%ˆñB¬¢ÊfñÊó6ÜVEˆB¬4ÙƒU44RÜ¢Ê7W7Fˆ÷W%ˆÊ÷R¬rrí27W7Fˆ÷W%ˆÊ÷R¿¢G≤"rr'“27W7Fˆ÷W%˜ÜˆÊUˆ÷6∂VB¿¢rÊw&˜75˜6∆W5ˆ÷˜VÁB¿¢44RtÑT‚4ÙƒU44RÜ¢Áñ÷VÁE˜7FGW2¬wVÁñBrì“wñBrı"¢ÁñEˆBï2‰ıBÂTƒ¬DÑT‚~ä>ãâÆòà~ãNâûòä^òûärp¢tÑT‚4ÙƒU44RÜ¢Áñ÷VÁE˜7FGW2¬wVÁñBrì“w'Fñ¬rDÑT‚~ä>ãâÆâÆã.à~äÆòéä~âíp¢T≈4R~ä.ãà~òNäòéä>ãâÆòà~ãNâírT‰B2ñ÷VÁE˜7FGW5˜FÇ¿¢4ÙƒU44RÜ¢Áñ÷VÁE˜7FGW2¬wVÁñBrí2&u˜ñ÷VÁE˜7FGW2¿¢¢ÁñEˆB¬¢ÁñEˆ'í¬¢Áñ÷VÁEˆ÷WFÜˆB¬¢Áñ÷VÁE˜&VfW&VÊ6R¿¢&ˆˆbÁV&∆ñ5˜W&¬2ñ÷VÁE˜&ˆˆe˜W&¬¿¢¢Ê7W7Fˆ÷W%˜ÜˆÊP¢e$Ù“w&˜72p¢§Ùî‚V&∆ñ2Ê¶ˆ'2¢Ù‚¢Ê¶ˆ%ˆñC÷rÊ¶ˆ%ˆñ@¢ƒTeB§Ùî‚&ˆˆbÙ‚&ˆˆbÊ¶ˆ%ˆñC÷¢Ê¶ˆ%ˆñ@¢ı$DU"%í¢ÊfñÊó6ÜVEˆBDU40¢ƒî‘ïBS¿¢G&Á6f˜&”¢&˜w2”‚&˜w2Ê÷á"”‚á≤‚‚Á"¬7W7Fˆ÷W%˜ÜˆÊUˆ÷6∂VC¢ˆ÷6µÜˆÊRá"Ê7W7Fˆ÷W%˜ÜˆÊRí“íí¿¢“¿¢WáVÁ6W3¢∞¢fñ∆VÊ÷S¢v7vb÷66˜VÁFñÊr÷WáVÁ6W2Ê77br¿¢∆&V√¢~ä>ã.ä.à~ã.âûä>ã.ä.àéòéã.ä"r¿¢6ˆ«V÷Á3¢∞¢≤∂Wì¢vWáVÁ6UˆñBr¬∆&V√¢tWáVÁ6RîBr“¿¢≤∂Wì¢vWáVÁ6UˆFFRr¬∆&V√¢~ä~ãâûâ~ã^òÇr“¿¢≤∂Wì¢v6FVv˜'ír¬∆&V√¢~äæää~âNä>ã.ä.àéòéã.ä"r“¿¢≤∂Wì¢wfVÊF˜%ˆÊ÷Rr¬∆&V√¢~ä>òûã.âûàNòûã"˛âŒãûòûà.ã.ä"r“¿¢≤∂Wì¢vFW67&óFñˆ‚r¬∆&V√¢~ä>ã.ä.ä^ãòäﬁã^ä.âBr“¿¢≤∂Wì¢v÷˜VÁBr¬∆&V√¢~àéã>âûä~âûòà~ãNâír“¿¢≤∂Wì¢wfEˆ÷˜VÁBr¬∆&V√¢udBr“¿¢≤∂Wì¢wvóFÜÜˆ∆FñÊuˆ÷˜VÁBr¬∆&V√¢~äæãàâ2â~ã^òéàéòéã.ä"r“¿¢≤∂Wì¢wñ÷VÁEˆ÷WFÜˆBr¬∆&V√¢~àÆòéäﬁà~â~ã.à~àÆã>ä>ãòà~ãNâír“¿¢≤∂Wì¢v¶ˆ%ˆñBr¬∆&V√¢t¶ˆ"îBr“¿¢≤∂Wì¢w7FGW2r¬∆&V√¢~äÆânã.âûãr“¿¢≤∂Wì¢v7&VFVEˆ'ír¬∆&V√¢~âÆãâûâ~ãnàò.âNä"r“¿¢≤∂Wì¢v7&VFVEˆBr¬∆&V√¢~âÆãâûâ~ãnàòäã~òéä“r“¿¢“¿¢7√¢Çí”‚4TƒT5BWáVÁ6UˆñB¬WáVÁ6UˆFFR¬6FVv˜'í¬fVÊF˜%ˆÊ÷R¬FW67&óFñˆ‚¬÷˜VÁB¬fEˆ÷˜VÁB¬vóFÜÜˆ∆FñÊuˆ÷˜VÁB¿¢ñ÷VÁEˆ÷WFÜˆB¬¶ˆ%ˆñB¬7FGW2¬7&VFVEˆ'í¬7&VFVEˆ@¢e$Ù“V&∆ñ2Ê66˜VÁFñÊuˆWáVÁ6W0¢tÑU$R4ÙƒU44Rá7FGW2¬rrí√‚wfˆñFVBp¢ı$DU"%íWáVÁ6UˆFFRDU42¬7&VFVEˆBDU40¢ƒî‘ïBS¿¢“¿¢ñ˜WG3¢∞¢fñ∆VÊ÷S¢v7vb÷66˜VÁFñÊr◊ñ˜WG2Ê77br¿¢∆&V√¢~ä>ã.ä.à~ã.âûàéòéã.ä.àÆòéã.àrr¿¢6ˆ«V÷Á3¢∞¢≤∂Wì¢wñ˜WEˆñBr¬∆&V√¢~à~ä~âNàéòéã.ä"r“¿¢≤∂Wì¢wW&ñˆE˜GóRr¬∆&V√¢~ä>äﬁâÆä~ãâûâ~ã^òÇr“¿¢≤∂Wì¢wW&ñˆE˜7F'Br¬∆&V√¢~òä>ãNòéäà~ä~âBr“¿¢≤∂Wì¢wW&ñˆEˆVÊBr¬∆&V√¢~äÆãNòûâûäÆãéâNà~ä~âBr“¿¢≤∂Wì¢w7FGW5˜FÇr¬∆&V√¢~äÆânã.âûãàéòéã.ä.àÆòéã.àrr“¿¢≤∂Wì¢wFV6ÜÊñ6ñÂˆ6˜VÁBr¬∆&V√¢~àéã>âûä~âûàÆòéã.àrr“¿¢≤∂Wì¢vw&˜75ˆ÷˜VÁBr¬∆&V√¢~ä>ã.ä.òNâNòûàòéäﬁâûäæãàr“¿¢≤∂Wì¢vFW˜6óEˆFVGV7FñˆÂˆ÷˜VÁBr¬∆&V√¢~äæãàòà~ãNâûâæä>ãàãâír“¿¢≤∂Wì¢vF•˜F˜F¬r¬∆&V√¢~âæä>ãâÆä.äﬁâBr“¿¢≤∂Wì¢vÊWE˜ñ&∆Rr¬∆&V√¢~ä.äﬁâNäÆãéâ~âéãBr“¿¢≤∂Wì¢wñEˆ÷˜VÁBr¬∆&V√¢~àéòéã.ä.òä^òûärr“¿¢≤∂Wì¢w&V÷ñÊñÊuˆ÷˜VÁBr¬∆&V√¢~àNà~òäæä^ã~ä“r“¿¢“¿¢7√¢Çí”‚tïDÇ∆ñÊU˜7V“2Ä¢4TƒT5Bñ˜WEˆñB¬4ıTÂBÑDï5Dî‰5BFV6ÜÊñ6ñÂ˜W6W&Ê÷Rì£¶ñÁB2FV6ÜÊñ6ñÂˆ6˜VÁB¬4ÙƒU44RÖ5T“ÜV&Âˆ÷˜VÁBí√ì£¶ÁV÷W&ñ22w&˜75ˆ÷˜VÁ@¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜ñ˜WEˆ∆ñÊW2u$ıU%íñ˜WEˆñ@¢í¬F¢2Ö4TƒT5Bñ˜WEˆñB¬4ÙƒU44RÖ5T“ÜF•ˆ÷˜VÁBí√ì£¶ÁV÷W&ñ22F•˜F˜F¬e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜ñ˜WEˆFßW7F÷VÁG2u$ıU%íñ˜WEˆñBí¿¢FW2Ö4TƒT5Bñ˜WEˆñB¬4ÙƒU44RÖ5T“Ü÷˜VÁBí√ì£¶ÁV÷W&ñ22FW˜6óEˆFVGV7FñˆÂˆ÷˜VÁBe$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂˆFW˜6óEˆ∆VFvW"tÑU$RG&Á67FñˆÂ˜GóS“v6ˆ∆∆V7Bru$ıU%íñ˜WEˆñBí¿¢í2Ö4TƒT5Bñ˜WEˆñB¬4ÙƒU44RÖ5T“áñEˆ÷˜VÁBí√ì£¶ÁV÷W&ñ22ñEˆ÷˜VÁBe$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜ñ˜WE˜ñ÷VÁG2u$ıU%íñ˜WEˆñBê¢4TƒT5BÁñ˜WEˆñB¬ÁW&ñˆE˜GóR¬ÁW&ñˆE˜7F'B¬ÁW&ñˆEˆVÊB¿¢44RtÑT‚u$TDU5BÉ¬4ÙƒU44RÜ∆ñÊU˜7V“Êw&˜75ˆ÷˜VÁB√í≤4ÙƒU44RÜF¢ÊF•˜F˜F¬√í“4ÙƒU44RÜFWÊFW˜6óEˆFVGV7FñˆÂˆ÷˜VÁB√í“4ÙƒU44RáíÁñEˆ÷˜VÁB√íí√“DÑT‚~àéòéã.ä.àÆòéã.à~òä^òûärp¢tÑT‚4ÙƒU44RáíÁñEˆ÷˜VÁB√í‚DÑT‚~àéòéã.ä.àÆòéã.à~âÆã.à~äÆòéä~âíp¢T≈4R~ä.ãà~òNäòéàéòéã.ä.àÆòéã.àrrT‰B27FGW5˜FÇ¿¢4ÙƒU44RÜ∆ñÊU˜7V“ÁFV6ÜÊñ6ñÂˆ6˜VÁB√ì£¶ñÁB2FV6ÜÊñ6ñÂˆ6˜VÁB¿¢4ÙƒU44RÜ∆ñÊU˜7V“Êw&˜75ˆ÷˜VÁB√ì£¶ÁV÷W&ñ22w&˜75ˆ÷˜VÁB¿¢4ÙƒU44RÜFWÊFW˜6óEˆFVGV7FñˆÂˆ÷˜VÁB√ì£¶ÁV÷W&ñ22FW˜6óEˆFVGV7FñˆÂˆ÷˜VÁB¿¢4ÙƒU44RÜF¢ÊF•˜F˜F¬√ì£¶ÁV÷W&ñ22F•˜F˜F¬¿¢Ñ4ÙƒU44RÜ∆ñÊU˜7V“Êw&˜75ˆ÷˜VÁB√í≤4ÙƒU44RÜF¢ÊF•˜F˜F¬√í“4ÙƒU44RÜFWÊFW˜6óEˆFVGV7FñˆÂˆ÷˜VÁB√íì£¶ÁV÷W&ñ22ÊWE˜ñ&∆R¿¢4ÙƒU44RáíÁñEˆ÷˜VÁB√ì£¶ÁV÷W&ñ22ñEˆ÷˜VÁB¿¢u$TDU5BÉ¬4ÙƒU44RÜ∆ñÊU˜7V“Êw&˜75ˆ÷˜VÁB√í≤4ÙƒU44RÜF¢ÊF•˜F˜F¬√í“4ÙƒU44RÜFWÊFW˜6óEˆFVGV7FñˆÂˆ÷˜VÁB√í“4ÙƒU44RáíÁñEˆ÷˜VÁB√íì£¶ÁV÷W&ñ22&V÷ñÊñÊuˆ÷˜VÁ@¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜ñ˜WE˜W&ñˆG2 ¢ƒTeB§Ùî‚∆ñÊU˜7V“Ù‚∆ñÊU˜7V“Áñ˜WEˆñC◊Áñ˜WEˆñ@¢ƒTeB§Ùî‚F¢Ù‚F¢Áñ˜WEˆñC◊Áñ˜WEˆñ@¢ƒTeB§Ùî‚FWÙ‚FWÁñ˜WEˆñC◊Áñ˜WEˆñ@¢ƒTeB§Ùî‚íÙ‚íÁñ˜WEˆñC◊Áñ˜WEˆñ@¢ı$DU"%íÁW&ñˆE˜7F'BDU42¬Áñ˜WEˆñBDU40¢ƒî‘ïBS¿¢“¿¢FW˜6óG3¢∞¢fñ∆VÊ÷S¢v7vb÷66˜VÁFñÊr÷FW˜6óG2Ê77br¿¢∆&V√¢~ä>ã.ä.à~ã.âûòà~ãNâûâæä>ãàãâír¿¢6ˆ«V÷Á3¢∞¢≤∂Wì¢wFV6ÜÊñ6ñÂ˜W6W&Ê÷Rr¬∆&V√¢~àÆòéã.àrr“¿¢≤∂Wì¢wF&vWEˆ÷˜VÁBr¬∆&V√¢~òâæòûã.äæäã.ä.òà~ãNâûâæä>ãàãâír“¿¢≤∂Wì¢v6ˆ∆∆V7FVE˜F˜F¬r¬∆&V√¢~äÆãäÆäòä^òûärr“¿¢≤∂Wì¢w&V÷ñÊñÊuˆ÷˜VÁBr¬∆&V√¢~àNà~òäæä^ã~äﬁânãnà~òâæòûã.äæäã.ä"r“¿¢≤∂Wì¢v∆FW7EˆBr¬∆&V√¢~äﬁãâæòâNâ^ä^òéã.äÆãéâBr“¿¢≤∂Wì¢vÊ˜FRr¬∆&V√¢~äæäã.ä.òäæâ^ãÇr“¿¢“¿¢7√¢Çí”‚tïDÇ∆VFvW"2Ä¢4TƒT5BFV6ÜÊñ6ñÂ˜W6W&Ê÷R¿¢4ÙƒU44RÖ5T“Ñ44RtÑT‚G&Á67FñˆÂ˜GóS“v6ˆ∆∆V7BrDÑT‚÷˜VÁBtÑT‚G&Á67FñˆÂ˜GóS“v÷ÁV≈ˆFßW7BrDÑT‚÷˜VÁBtÑT‚G&Á67FñˆÂ˜GóRî‚Çw&VgVÊBr¬v6∆ñ’ˆFVGV7BríDÑT‚÷÷˜VÁBT≈4RT‰Bí√ì£¶ÁV÷W&ñ226ˆ∆∆V7FVE˜F˜F¬¿¢‘ÇÜ7&VFVEˆBí2∆FW7Eˆ@¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂˆFW˜6óEˆ∆VFvW ¢u$ıU%íFV6ÜÊñ6ñÂ˜W6W&Ê÷P¢ê¢4TƒT5B4ÙƒU44RÜÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬∆VFvW"ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷Rí2FV6ÜÊñ6ñÂ˜W6W&Ê÷R¿¢4ÙƒU44RÜÁF&vWEˆ÷˜VÁB√Sì£¶ÁV÷W&ñ22F&vWEˆ÷˜VÁB¿¢4ÙƒU44RÜ∆VFvW"Ê6ˆ∆∆V7FVE˜F˜F¬√ì£¶ÁV÷W&ñ226ˆ∆∆V7FVE˜F˜F¬¿¢u$TDU5BÉ¬4ÙƒU44RÜÁF&vWEˆ÷˜VÁB√Sí“4ÙƒU44RÜ∆VFvW"Ê6ˆ∆∆V7FVE˜F˜F¬√íì£¶ÁV÷W&ñ22&V÷ñÊñÊuˆ÷˜VÁB¿¢∆VFvW"Ê∆FW7EˆB¿¢~òà~ãNâûâæä>ãàãâûòNäòéò>àÆòéàã>òNä>âÆä>ãNäûãârr2Ê˜FP¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂˆFW˜6óEˆ66˜VÁG2¢eTƒ¬ıUDU"§Ùî‚∆VFvW"Ù‚∆VFvW"ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷S÷ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷P¢ı$DU"%í6ˆ∆∆V7FVE˜F˜F¬DU42¬FV6ÜÊñ6ñÂ˜W6W&Ê÷R40¢ƒî‘ïBS¿¢“¿¢Fˆ7V÷VÁG3¢∞¢fñ∆VÊ÷S¢v7vb÷66˜VÁFñÊr÷Fˆ7V÷VÁG2Ê77br¿¢∆&V√¢~ä>ã.ä.à~ã.âûòäﬁàäÆã.ä>à.ã.ä"r¿¢6ˆ«V÷Á3¢∞¢≤∂Wì¢vFˆ7V÷VÁEˆÊÚr¬∆&V√¢~òä^à.òäﬁàäÆã.ä2r“¿¢≤∂Wì¢vFˆ7V÷VÁE˜GóRr¬∆&V√¢~âæä>ãòäâ~òäﬁàäÆã.ä2r“¿¢≤∂Wì¢w7FGW2r¬∆&V√¢~äÆânã.âûãr“¿¢≤∂Wì¢v¶ˆ%ˆñBr¬∆&V√¢t¶ˆ"îBr“¿¢≤∂Wì¢v7W7Fˆ÷W%ˆÊ÷Rr¬∆&V√¢~ä^ãûààNòûã"r“¿¢≤∂Wì¢vó77VUˆFFRr¬∆&V√¢~ä~ãâûâ~ã^òéäﬁäﬁàr“¿¢≤∂Wì¢vGVUˆFFRr¬∆&V√¢~àNä>âÆàã>äæâûâBr“¿¢≤∂Wì¢w7V'F˜F¬r¬∆&V√¢~ä.äﬁâNàòéäﬁâûäã.äûãRr“¿¢≤∂Wì¢vFó66˜VÁEˆ÷˜VÁBr¬∆&V√¢~äÆòéä~âûä^âBr“¿¢≤∂Wì¢wfEˆ÷˜VÁBr¬∆&V√¢udBr“¿¢≤∂Wì¢wvóFÜÜˆ∆FñÊuˆ÷˜VÁBr¬∆&V√¢~äæãàâ2â~ã^òéàéòéã.ä"r“¿¢≤∂Wì¢wF˜F≈ˆ÷˜VÁBr¬∆&V√¢~ä.äﬁâNä>ä~är“¿¢≤∂Wì¢v7&VFVEˆ'ír¬∆&V√¢~äÆä>òûã.à~ò.âNä"r“¿¢≤∂Wì¢v7&VFVEˆBr¬∆&V√¢~äÆä>òûã.à~òäã~òéä“r“¿¢“¿¢7√¢Çí”‚4TƒT5BFˆ7V÷VÁEˆÊÚ¬Fˆ7V÷VÁE˜GóR¬7FGW2¬¶ˆ%ˆñB¬7W7Fˆ÷W%ˆÊ÷R¬ó77VUˆFFR¬GVUˆFFR¿¢7V'F˜F¬¬Fó66˜VÁEˆ÷˜VÁB¬fEˆ÷˜VÁB¬vóFÜÜˆ∆FñÊuˆ÷˜VÁB¬F˜F≈ˆ÷˜VÁB¬7&VFVEˆ'í¬7&VFVEˆ@¢e$Ù“V&∆ñ2Ê66˜VÁFñÊuˆFˆ7V÷VÁG0¢ı$DU"%í7&VFVEˆBDU40¢ƒî‘ïBS¿¢“¿¢vw&˜72◊&ˆfóBs¢∞¢fñ∆VÊ÷S¢v7vb÷66˜VÁFñÊr÷w&˜72◊&ˆfóBÊ77br¿¢∆&V√¢~ä>ã.ä.à~ã.âûàã>òNä>à.ãòûâûâ^òûâír¿¢6ˆ«V÷Á3¢∞¢≤∂Wì¢w&WfVÁVU˜F˜F¬r¬∆&V√¢~ä.äﬁâNà.ã.ä.à~ã.âûòäÆä>ò~àéòä^òûärr“¿¢≤∂Wì¢vWáVÁ6U˜F˜F¬r¬∆&V√¢~ä>ã.ä.àéòéã.ä.â~ã^òéâÆãâûâ~ãnàr“¿¢≤∂Wì¢wFV6ÜÊñ6ñÂ˜ñ&∆U˜F˜F¬r¬∆&V√¢~ä.äﬁâNäÆãéâ~âéãNàéòéã.ä.àÆòéã.àrr“¿¢≤∂Wì¢vW7Fñ÷FVEˆw&˜75˜&ˆfóBr¬∆&V√¢~àã>òNä>à.ãòûâûâ^òûâûò.âNä.âæä>ãäã.â2r“¿¢≤∂Wì¢vÊ˜FRr¬∆&V√¢~äæäã.ä.òäæâ^ãÇr“¿¢“¿¢7√¢Çí”‚tïDÇ&WfVÁVR2Ä¢4TƒT5B4ÙƒU44RÖ5T“áF˜F≈ˆ÷˜VÁBí√ì£¶ÁV÷W&ñ22&WfVÁVU˜F˜F¬e$Ù“Ä¢4TƒT5B¢Ê¶ˆ%ˆñB¬4ÙƒU44RÑÂTƒƒîbÖ5T“Ñ4ÙƒU44RÜ¶íÊ∆ñÊU˜F˜F¬√íí√í¬4ÙƒU44RÜ¢Ê¶ˆ%˜&ñ6R√í¬ì£¶ÁV÷W&ñ22F˜F≈ˆ÷˜VÁ@¢e$Ù“V&∆ñ2Ê¶ˆ'2†¢ƒTeB§Ùî‚V&∆ñ2Ê¶ˆ%ˆóFV◊2¶íÙ‚45BÜ¶íÊ¶ˆ%ˆñB2DUÖBì‘45BÜ¢Ê¶ˆ%ˆñB2DUÖBê¢tÑU$RGµ˜7ƒFˆÊU&VFñ6FRÇv¢ró“‰B¢ÊfñÊó6ÜVEˆBï2‰ıBÂTƒ¿¢u$ıU%í¢Ê¶ˆ%ˆñB¬¢Ê¶ˆ%˜&ñ6P¢íÄ¢í¬WáVÁ6W22Ä¢4TƒT5B4ÙƒU44RÖ5T“Ü÷˜VÁBí√ì£¶ÁV÷W&ñ22WáVÁ6U˜F˜F¬e$Ù“V&∆ñ2Ê66˜VÁFñÊuˆWáVÁ6W2tÑU$R4ÙƒU44Rá7FGW2¬rrí√‚wfˆñFVBp¢í¬ñ˜WB2Ä¢4TƒT5B4ÙƒU44RÖ5T“ÜÊWE˜ñ&∆Rí√ì£¶ÁV÷W&ñ22FV6ÜÊñ6ñÂ˜ñ&∆U˜F˜F¬e$Ù“Ä¢tïDÇ∆ñÊU˜7V“2Ö4TƒT5Bñ˜WEˆñB¬4ÙƒU44RÖ5T“ÜV&Âˆ÷˜VÁBí√ì£¶ÁV÷W&ñ22w&˜75ˆ÷˜VÁBe$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜ñ˜WEˆ∆ñÊW2u$ıU%íñ˜WEˆñBí¿¢F¢2Ö4TƒT5Bñ˜WEˆñB¬4ÙƒU44RÖ5T“ÜF•ˆ÷˜VÁBí√ì£¶ÁV÷W&ñ22F•˜F˜F¬e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜ñ˜WEˆFßW7F÷VÁG2u$ıU%íñ˜WEˆñBí¿¢FW2Ö4TƒT5Bñ˜WEˆñB¬4ÙƒU44RÖ5T“Ü÷˜VÁBí√ì£¶ÁV÷W&ñ22FW˜6óEˆFVGV7FñˆÂˆ÷˜VÁBe$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂˆFW˜6óEˆ∆VFvW"tÑU$RG&Á67FñˆÂ˜GóS“v6ˆ∆∆V7Bru$ıU%íñ˜WEˆñBê¢4TƒT5BÁñ˜WEˆñB¬Ñ4ÙƒU44RÜ∆ñÊU˜7V“Êw&˜75ˆ÷˜VÁB√í≤4ÙƒU44RÜF¢ÊF•˜F˜F¬√í“4ÙƒU44RÜFWÊFW˜6óEˆFVGV7FñˆÂˆ÷˜VÁB√íì£¶ÁV÷W&ñ22ÊWE˜ñ&∆P¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜ñ˜WE˜W&ñˆG2 ¢ƒTeB§Ùî‚∆ñÊU˜7V“Ù‚∆ñÊU˜7V“Áñ˜WEˆñC◊Áñ˜WEˆñ@¢ƒTeB§Ùî‚F¢Ù‚F¢Áñ˜WEˆñC◊Áñ˜WEˆñ@¢ƒTeB§Ùî‚FWÙ‚FWÁñ˜WEˆñC◊Áñ˜WEˆñ@¢íê¢ê¢4TƒT5B&WfVÁVRÁ&WfVÁVU˜F˜F¬¬WáVÁ6W2ÊWáVÁ6U˜F˜F¬¬ñ˜WBÁFV6ÜÊñ6ñÂ˜ñ&∆U˜F˜F¬¿¢á&WfVÁVRÁ&WfVÁVU˜F˜F¬“WáVÁ6W2ÊWáVÁ6U˜F˜F¬“ñ˜WBÁFV6ÜÊñ6ñÂ˜ñ&∆U˜F˜F¬ì£¶ÁV÷W&ñ22W7Fñ÷FVEˆw&˜75˜&ˆfóB¿¢~ä>ã.ä.à~ã.âûâûã^òûòâæò~âûà.òûäﬁäãûä^ò>äæòûâÆãàﬁàÆã^â^ä>ä~àÇòNäòéò>àÆòéàã.ä>ä.ã~òéâûäã.äûã^äﬁãâ^ò.âûäãâ^ãBr2Ê˜FP¢e$Ù“&WfVÁVR¬WáVÁ6W2¬ñ˜WF¿¢“¿¢wfB◊7V÷÷'ís¢∞¢fñ∆VÊ÷S¢v7vb÷66˜VÁFñÊr◊fB◊7V÷÷'íÊ77br¿¢∆&V√¢udB7V÷÷'ír¿¢6ˆ«V÷Á3¢∞¢≤∂Wì¢w6˜W&6Rr¬∆&V√¢~âæä>ãòäârr“¿¢≤∂Wì¢vóFV’ˆ6˜VÁBr¬∆&V√¢~àéã>âûä~âûä>ã.ä.àã.ä2r“¿¢≤∂Wì¢wfEˆ÷˜VÁBr¬∆&V√¢udBr“¿¢≤∂Wì¢vÊ˜FRr¬∆&V√¢~äæäã.ä.òäæâ^ãÇr“¿¢“¿¢7√¢Çí”‚4TƒT5B~òäﬁàäÆã.ä>à.ã.ä"r26˜W&6R¬4ıTÂBÇ¢ì£¶ñÁB2óFV’ˆ6˜VÁB¬4ÙƒU44RÖ5T“áfEˆ÷˜VÁBí√ì£¶ÁV÷W&ñ22fEˆ÷˜VÁB¬udBàéã.à66˜VÁFñÊuˆFˆ7V÷VÁG2r2Ê˜FRe$Ù“V&∆ñ2Ê66˜VÁFñÊuˆFˆ7V÷VÁG2tÑU$R4ÙƒU44Rá7FGW2¬rrí√‚wfˆñFVBp¢T‰îÙ‚ƒ¿¢4TƒT5B~ä>ã.ä.àéòéã.ä"r26˜W&6R¬4ıTÂBÇ¢ì£¶ñÁB2óFV’ˆ6˜VÁB¬4ÙƒU44RÖ5T“áfEˆ÷˜VÁBí√ì£¶ÁV÷W&ñ22fEˆ÷˜VÁB¬udBàéã.à66˜VÁFñÊuˆWáVÁ6W2r2Ê˜FRe$Ù“V&∆ñ2Ê66˜VÁFñÊuˆWáVÁ6W2tÑU$R4ÙƒU44Rá7FGW2¬rrí√‚wfˆñFVBv¿¢“¿¢wvóFÜÜˆ∆FñÊr◊7V÷÷'ís¢∞¢fñ∆VÊ÷S¢v7vb÷66˜VÁFñÊr◊vóFÜÜˆ∆FñÊr◊7V÷÷'íÊ77br¿¢∆&V√¢uvóFÜÜˆ∆FñÊrFÇ7V÷÷'ír¿¢6ˆ«V÷Á3¢∞¢≤∂Wì¢w6˜W&6Rr¬∆&V√¢~âæä>ãòäârr“¿¢≤∂Wì¢v6FVv˜'ír¬∆&V√¢~äæää~âBr“¿¢≤∂Wì¢wfVÊF˜%ˆÊ÷Rr¬∆&V√¢~ä>òûã.âûàNòûã"˛âŒãûòûà.ã.ä"r“¿¢≤∂Wì¢vóFV’ˆ6˜VÁBr¬∆&V√¢~àéã>âûä~âûä>ã.ä.àã.ä2r“¿¢≤∂Wì¢wvóFÜÜˆ∆FñÊuˆ÷˜VÁBr¬∆&V√¢~äæãàâ2â~ã^òéàéòéã.ä"r“¿¢“¿¢7√¢Çí”‚4TƒT5B~ä>ã.ä.àéòéã.ä"r26˜W&6R¬6FVv˜'í¬fVÊF˜%ˆÊ÷R¬4ıTÂBÇ¢ì£¶ñÁB2óFV’ˆ6˜VÁB¬4ÙƒU44RÖ5T“ávóFÜÜˆ∆FñÊuˆ÷˜VÁBí√ì£¶ÁV÷W&ñ22vóFÜÜˆ∆FñÊuˆ÷˜VÁ@¢e$Ù“V&∆ñ2Ê66˜VÁFñÊuˆWáVÁ6W0¢tÑU$R4ÙƒU44Rá7FGW2¬rrí√‚wfˆñFVBr‰B4ÙƒU44RávóFÜÜˆ∆FñÊuˆ÷˜VÁB√í√‚ ¢u$ıU%í6FVv˜'í¬fVÊF˜%ˆÊ÷P¢ı$DU"%ívóFÜÜˆ∆FñÊuˆ÷˜VÁBDU46¿¢“¿ß”∞†¶ÊvWBÇrˆF÷ñ‚ˆ66˜VÁFñÊr˜&W˜'G2Ûß&W˜'Eˆ∂WíÊ77br¬&WVó&T66˜VÁFñÊuW&÷ó76ñˆ‚Çv66˜VÁFñÊrÁ&VBÁ&W˜'G2rí¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B&W˜'D∂Wí“7G&ñÊrá&WÁ&◊2Á&W˜'Eˆ∂Wí«¬rríÁ&W∆6RÇı¬Ê77bBˆí¬rríÁG&ñ“Çì∞¢6ˆÁ7B&W˜'B“44ıTÂDî‰uı$Uı%E5∑&W˜'D∂Wï”∞¢ñbÇ&W˜'Bí&WGW&‚&W2Á7FGW2ÉCBíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢t44ıTÂDî‰uı$Uı%EÙ‰ıEÙdıT‰Br“ì∞¢G'í∞¢6ˆÁ7B“vóBˆˆ¬ÁVW'íá&W˜'BÁ7¬Çí¬µ“ì∞¢6ˆÁ7B&˜w2“GóVˆb&W˜'BÁG&Á6f˜&“””“vgVÊ7Fñˆ‚rÚ&W˜'BÁG&Á6f˜&“áÁ&˜w2«¬µ“í¢áÁ&˜w2«¬µ“ì∞¢vóB∆ˆt66˜VÁFñÊtVFóBá&W¬∞¢7Fñˆ„¢u$Uı%EÙUÖı%Br¿¢VÁFóGï˜GóS¢v66˜VÁFñÊu˜&W˜'Br¿¢VÁFóGïˆñC¢&W˜'D∂Wí¿¢gFW%ˆß6ˆ„¢≤&W˜'Eˆ∂Wì¢&W˜'D∂Wí¬&˜w3¢&˜w2Ê∆VÊwFÇ“¿¢Ê˜FS¢&W˜'BÊ∆&V¬¿¢“ì∞¢&WGW&‚ˆ66˜VÁFñÊu6VÊD77bá&W2¬&W˜'BÊfñ∆VÊ÷R¬&˜w2¬&W˜'BÊ6ˆ«V÷Á2ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÇttUBˆF÷ñ‚ˆ66˜VÁFñÊr˜&W˜'G2Ûß&W˜'Eˆ∂WíÊ77br¬&W˜'D∂Wí¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤ˆ≥¢f«6R¬W'&˜#¢t44ıTÂDî‰uı$Uı%EÙUÖı%EÙdîƒTBr¬÷W76vS¢RÊ÷W76vR“ì∞¢–ß“ì∞†¶ÁW6RÜ7&VFTFˆ7V÷VÁE&˜WFW2á∞¢ˆˆ¬¿¢ÚÚ¶ˆ"Fˆ7V÷VÁG2á&V6VóBˆR◊6∆óí6''ígV∆¬7W7Fˆ÷W"îí‚66W72&WVó&W0¢ÚÚFÜR¶ˆ"w2&ˆˆ∂ñÊu˜Fˆ∂V‚Éˆ∂Wì“‚‚‚í˜"‚WFÜVÁFñ6FVBF÷ñ‚6W76ñˆ‚(	@¢ÚÚ&&R6WVVÁFñ¬¶ˆ%ˆñB◊W7BÊWfW"&RVÊ˜VvÇ‡¢ó4F÷ñÂ&WVW7C¢7ñÊ2á&Wí”‚∞¢G'í∞¢6ˆÁ7B7GÇ“vóBvWDWFÑ6ˆÁFWáBá&W¬ÁV∆¬ì∞¢&WGW&‚&ˆˆ∆V‚Ü7GÇbb7GÇÊˆ≤bbÜ7GÇÊ7F˜"Á&ˆ∆R””“&F÷ñ‚"«¬7GÇÊ7F˜"Á&ˆ∆R””“'7WW%ˆF÷ñ‚"íì∞¢“6F6ÇÖÚí∞¢&WGW&‚f«6S∞¢–¢“¿¢Fˆ75&FT∆ñ÷óFW#¢V&∆ñ4Fˆ75&FT∆ñ÷óFW"¿¢66˜VÁFñÊt˜vÊW%6ñvÊGW&UV&∆ñ5W&√¢ˆ66˜VÁFñÊt˜vÊW%6ñvÊGW&UV&∆ñ5W&¬¿¢66˜VÁFñÊu6ñvÊGW&UV&∆ñ5W&√¢ˆ66˜VÁFñÊu6ñvÊGW&UV&∆ñ5W&¬¿¢66˜VÁFñÊt˜vÊW%6ñvÊW$Ê÷S¢ˆ66˜VÁFñÊt˜vÊW%6ñvÊW$Ê÷R¿¢66˜VÁFñÊt˜vÊW%6ñvÊW%˜6óFñˆ„¢ˆ66˜VÁFñÊt˜vÊW%6ñvÊW%˜6óFñˆ‚¿ß“íì∞††¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	¯»“T$ƒî2éä^ãûààNòûã.àéäﬁà~òäﬁàr˛â^ãNâNâ^ã.äà~ã.âíê¢ÚÚ””””””””””””””””””””””””””””””””””””””–†¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ(˚˚àÚGW&Fñˆ‚≤&ñ6ñÊrVÊvñÊRác"í≤G&fV¬'VffW ¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶gVÊ7Fñˆ‚FÙ÷ñ‚ÜÜÜ÷“í∞¢6ˆÁ7B∂Ç¬’““7G&ñÊrÜÜÜ÷“«¬#£"íÁ7∆óBÇ#¢"íÊ÷ÇáÇí”‚ÁV÷&W"áÇ«¬íì∞¢&WGW&‚Ç¢c≤”∞ß–¶gVÊ7Fñˆ‚÷ñÂFÙÑÑ‘“Ü÷ñ‚í∞¢6ˆÁ7BÇ“÷FÇÊf∆ˆ˜"Ü÷ñ‚Úcì∞¢6ˆÁ7B““÷ñ‚Rc∞¢&WGW&‚Gµ7G&ñÊrÜÇíÁE7F'BÉ"¬#"ó”¢Gµ7G&ñÊrÜ“íÁE7F'BÉ"¬#"ó÷∞ß–†¶gVÊ7Fñˆ‚vWDÊ˜t&Êv∂ˆµ'G2Çí∞¢&WGW&‚¶ˆ%Fñ÷ñÊrÊvWD&Êv∂ˆ¥Ê˜rÇì∞ß–†¶gVÊ7Fñˆ‚vWDÊ˜t&Êv∂ˆ¥÷ñ‚Çí∞¢6ˆÁ7B“vWDÊ˜t&Êv∂ˆµ'G2Çì∞¢&WGW&‚ÊÜ˜W"¢c≤Ê÷ñÁWFS∞ß–¶gVÊ7Fñˆ‚6ˆ◊WFTGW&Fñˆ‰÷ñ‚áñ∆ˆB“∑“¬˜G2“∑“í∞¢&WGW&‚&ñ6ñÊtÜV«W'2Ê6ˆ◊WFTGW&Fñˆ‰÷ñ‚áñ∆ˆB¬˜G2ì∞ß–†¶gVÊ7Fñˆ‚6ˆ◊WFU7FÊF&E&ñ6Ráñ∆ˆB“∑“í∞¢&WGW&‚&ñ6ñÊtÜV«W'2Ê6ˆ◊WFU7FÊF&E&ñ6Ráñ∆ˆBì∞ß–†¶gVÊ7Fñˆ‚Ê˜&÷∆ó¶U6W'fñ6W4g&ˆ’ñ∆ˆBáñ∆ˆB“∑“í∞¢&WGW&‚&ñ6ñÊtÜV«W'2ÊÊ˜&÷∆ó¶U6W'fñ6W4g&ˆ’ñ∆ˆBáñ∆ˆBì∞ß–†¶gVÊ7Fñˆ‚6ˆ◊WFTGW&Fñˆ‰÷ñ‰◊V«Fíáñ∆ˆB“∑“¬˜G2“∑“í∞¢&WGW&‚&ñ6ñÊtÜV«W'2Ê6ˆ◊WFTGW&Fñˆ‰÷ñ‰◊V«Fíáñ∆ˆB¬˜G2ì∞ß–†¶gVÊ7Fñˆ‚6ˆ◊WFU7FÊF&E&ñ6T◊V«Fíáñ∆ˆB“∑“í∞¢&WGW&‚&ñ6ñÊtÜV«W'2Ê6ˆ◊WFU7FÊF&E&ñ6T◊V«Fíáñ∆ˆBì∞ß–†¶gVÊ7Fñˆ‚'Vñ∆E6W'fñ6T∆ñÊTóFV◊4g&ˆ’ñ∆ˆBáñ∆ˆB“∑“í∞¢&WGW&‚&ñ6ñÊtÜV«W'2Ê'Vñ∆E6W'fñ6T∆ñÊTóFV◊4g&ˆ’ñ∆ˆBáñ∆ˆBì∞ß–†††¶gVÊ7Fñˆ‚VffV7FófT&∆ˆ6¥÷ñ‚ÜGW&Fñˆ‰÷ñ‚í∞¢&WGW&‚÷FÇÊ÷ÇÉ¬ÁV÷&W"ÜGW&Fñˆ‰÷ñ‚«¬íí≤E$dT≈Ù%TddU%Ù‘î„∞ß–†¶7ñÊ2gVÊ7Fñˆ‚∆ó7EFV6ÜÊñ6ñÁ4'ïGóRáFV6Ö˜GóR¬˜G2“∑“í∞¢6ˆÁ7BB“áFV6Ö˜GóR«¬&6ˆ◊Áí"íÁFı7G&ñÊrÇíÁG&ñ“ÇíÁFÙ∆˜vW$66RÇì∞¢6ˆÁ7BñÊ6«VFU˜W6VB“˜G2ÊñÊ6«VFU˜W6VC∞¢6ˆÁ7B∆∆˜u˜GóUˆf∆∆&6≤“˜G2Ê∆∆˜u˜GóUˆf∆∆&6≤””“G'VS∞¢ÚÚ7W˜'BFV6Ö˜GóS÷∆¬Ü6ˆ◊Áí∑'FÊW"ê¢6ˆÁ7Bó4∆¬“B””“v∆¬s∞¢ÚÚ‰ıDS†¢ÚÚ“FVfV«B&VÜfñ˜"ÜñÊ6«VFU˜W6VC÷f«6Rì¢WÜ6«VFRW6VBFV6ÜÊñ6ñÁ2‡¢ÚÚ“f˜&6VB∆ˆ6≤&VÜfñ˜"ÜñÊ6«VFU˜W6VC◊G'VRì¢ñÊ6«VFRW6VBFV6ÜÊñ6ñÁ2¿¢ÚÚ'WBF˜vÁ7G&V“∆ˆvñ2ÜˆffW"f∆˜rí6Ü˜V∆B7Fñ∆¬&W7V7B66WE˜7FGW2‡¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢ ¢4TƒT5BRÁW6W&Ê÷R¿¢4ÙƒU44RáÊV◊∆˜ñ÷VÁE˜GóR¬v6ˆ◊Áírí2V◊∆˜ñ÷VÁE˜GóR¿¢4ÙƒU44RáÁv˜&µ˜7F'B¬sì£rí2v˜&µ˜7F'B¿¢4ÙƒU44RáÁv˜&µˆVÊB¬sÉ£rí2v˜&µˆVÊB¿¢4ÙƒU44RáÊ66WE˜7FGW2¬w&VGírí266WE˜7FGW2¿¢4ÙƒU44RáÁvVV∂«ïˆˆfeˆFó2¬rrí2vVV∂«ïˆˆfeˆFó2¿¢Ê7W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆R27W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆P¢e$Ù“V&∆ñ2ÁW6W'2P¢ƒTeB§Ùî‚V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2Ù‚ÁW6W&Ê÷S◊RÁW6W&Ê÷P¢tÑU$RRÁ&ˆ∆S“wFV6ÜÊñ6ñ‚p¢‰BÇC#£¶&ˆˆ∆V‚ï2E%TRı"4ÙƒU44RáÊ66WE˜7FGW2¬w&VGírí√‚wW6VBrê¢‰BÇC3£¶&ˆˆ∆V‚ï2E%TRı"Ä¢ÇC“v6ˆ◊Áír‰B4ÙƒU44RáÊV◊∆˜ñ÷VÁE˜GóR¬v6ˆ◊Áíríî‚Çv6ˆ◊Áír¬v7W7Fˆ“r¬w7V6ñ≈ˆˆÊ«íríê¢ı"ÇC√‚v6ˆ◊Áír‰B4ÙƒU44RáÊV◊∆˜ñ÷VÁE˜GóR¬v6ˆ◊Áírí“Cê¢íê¢ı$DU"%íRÁW6W&Ê÷P¢¿¢∑B¬ñÊ6«VFU˜W6VB¬ó4∆≈–¢ì∞¢ÚÚf∆∆&6≤Üfñ¬÷˜V‚ì¢ñbfñ«FW&ñÊr'íV◊∆˜ñ÷VÁE˜GóRññV∆G2FV6ÜÊñ6ñÁ2¿¢ÚÚ&WGW&‚∆¬FV6ÜÊñ6ñÁ2FÜB&RÊ˜BW6VB‚FÜó2&WfVÁG2FÜRTíg&ˆ“6Ü˜vñÊp¢ÚÚ∆¬6∆˜G2.òâ^ò~ä"vÜV‚&ˆfñ∆W2ÜfV‚wB&VV‚&6∂fñ∆∆VBñWB‡¢ñbÇá"Á&˜w2«¬µ“íÊ∆VÊwFÇ””“bb∆∆˜u˜GóUˆf∆∆&6≤í∞¢G'í∞¢6ˆÁ7B#"“vóBˆˆ¬ÁVW'íÄ¢ ¢4TƒT5BRÁW6W&Ê÷R¿¢4ÙƒU44RáÊV◊∆˜ñ÷VÁE˜GóR¬v6ˆ◊Áírí2V◊∆˜ñ÷VÁE˜GóR¿¢4ÙƒU44RáÁv˜&µ˜7F'B¬sì£rí2v˜&µ˜7F'B¿¢4ÙƒU44RáÁv˜&µˆVÊB¬sÉ£rí2v˜&µˆVÊB¿¢4ÙƒU44RáÊ66WE˜7FGW2¬w&VGírí266WE˜7FGW2¿¢4ÙƒU44RáÁvVV∂«ïˆˆfeˆFó2¬rrí2vVV∂«ïˆˆfeˆFó2¿¢Ê7W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆R27W7Fˆ÷W%˜6∆˜E˜fó6ñ&∆P¢e$Ù“V&∆ñ2ÁW6W'2P¢ƒTeB§Ùî‚V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2Ù‚ÁW6W&Ê÷S◊RÁW6W&Ê÷P¢tÑU$RRÁ&ˆ∆S“wFV6ÜÊñ6ñ‚p¢‰BÇC£¶&ˆˆ∆V‚ï2E%TRı"4ÙƒU44RáÊ66WE˜7FGW2¬w&VGírí√‚wW6VBrê¢ı$DU"%íRÁW6W&Ê÷P¢ ¢¬∂ñÊ6«VFU˜W6VE“ì∞¢6ˆÁ6ˆ∆RÁv&‚Çu∂fñ∆&ñ∆óGï˜c%“ÊÚFV6ÜÊñ6ñÁ2÷F6ÜVBFV6Ö˜GóS“W2ÜñÊ6«VFU˜W6VC“W2í”‚f∆∆&6≤FÚ∆¬ÇW2ír¬B¬ñÊ6«VFU˜W6VB¬á#"Á&˜w7«≈µ“íÊ∆VÊwFÇì∞¢&WGW&‚#"Á&˜w2«¬µ”∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÁv&‚Çu∂fñ∆&ñ∆óGï˜c%“f∆∆&6≤FV6ÜÊñ6ñÁ2VW'ífñ∆VBr¬RÊ÷W76vRì∞¢–¢–¢&WGW&‚"Á&˜w2«¬µ”∞ß–†¶gVÊ7Fñˆ‚'6UvVV∂«îˆfdFó2á2í∞¢6ˆÁ7B&r“á2«¬rríÁFı7G&ñÊrÇíÁG&ñ“Çì∞¢ñbÇ&rí&WGW&‚ÊWr6WBÇì∞¢6ˆÁ7B'G2“&rÁ7∆óBÇr¬ríÊ÷áÇ”‚ÇÁG&ñ“ÇííÊfñ«FW"Ñ&ˆˆ∆V‚ì∞¢6ˆÁ7B˜WB“ÊWr6WBÇì∞¢f˜"Ü6ˆÁ7Bˆb'G2í∞¢6ˆÁ7B‚“ÁV÷&W"áì∞¢ñbÑÁV÷&W"Êó4ñÁFVvW"Ü‚íbb‚„“bb‚√“bí˜WBÊFBÜ‚ì∞¢–¢&WGW&‚˜WC∞ß–†¶7ñÊ2gVÊ7Fñˆ‚'Vñ∆Dˆfd÷f˜$FFRÜFFU7G"¬W6W&Ê÷W2í∞¢ÚÚ&WGW&Á2÷áFV6ÜÊñ6ñÂ˜W6W&Ê÷R”‚∂ó5ˆˆfc¶&ˆˆ∆VÁ“ê¢6ˆÁ7B˜WB“ÊWr÷Çì∞¢G'í∞¢ñbÇ'&íÊó4'&íáW6W&Ê÷W2í«¬W6W&Ê÷W2Ê∆VÊwFÇ””“í&WGW&‚˜WC∞¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢ ¢4TƒT5BFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬ó5ˆˆf`¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜v˜&∂Fó5˜c ¢tÑU$Rv˜&µˆFFR“C£¶FFP¢‰BFV6ÜÊñ6ñÂ˜W6W&Ê÷R“ÂíÇC#£ßFWáEµ“ê¢¿¢∂FFU7G"¬W6W&Ê÷W5–¢ì∞¢f˜"Ü6ˆÁ7B&˜rˆbá"Á&˜w2«¬µ“íí∞¢˜WBÁ6WBá&˜rÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬≤ó5ˆˆfc¢&˜rÊó5ˆˆfb“ì∞¢–¢“6F6ÇÜRí∞¢ÚÚfñ¬÷˜V‡¢6ˆÁ6ˆ∆RÁv&‚Çu∑v˜&∂Fó5˜c%“˜fW'&ñFW2VW'ífñ∆VBr¬RÊ÷W76vRì∞¢–¢&WGW&‚˜WC∞ß–†¶gVÊ7Fñˆ‚ó5FV6Ñˆfdˆ‰FFRáFV6Ö&˜r¬FFU7G"¬ˆfd÷¬˜G2“∑“í∞¢ÚÚ&ñ˜&óGì¢˜fW'&ñFRF&∆R‚vVV∂«ïˆˆfeˆFó0¢6ˆÁ7BR“FV6Ö&˜sÚÁW6W&Ê÷S∞¢ñbÇRí&WGW&‚f«6S∞¢6ˆÁ7BÚ“ˆfd÷ÚÊvWBáRì∞¢ñbÜÚbbGóVˆbÚÊó5ˆˆfb””“v&ˆˆ∆V‚rí&WGW&‚ÚÊó5ˆˆfc∞¢ÚÚ4dUEíá&ˆGV7Fñˆ‚ì¢vVV∂«ïˆˆfeˆFó2âÆã.à~ä>ãâÆâÆäﬁã.àéânãûà&6∂fñ∆¬âŒãNâNâÓä^ã.â@¢ÚÚâ~ã>ò>äæòûòäﬁâNäãNâûòäæò~âí.òNäòéäã^àÆòéã.à~ä~òéã.àr"â~ãòûà~òâNã~äﬁâí‚ò>âûò.äæäâBf˜&6VBÜF÷ñ‚fñWrê¢ÚÚò>äæòûòàÆã~òéä“˜fW'&ñFRF&∆Ròâæò~âûäæä^ãàòä^ãà.òûã.ävVV∂«ïˆˆfeˆFó2òâÓã~òéä“fñ¬÷˜V‚‡¢ñbÜ˜G2bb˜G2ÊñvÊ˜&UvVV∂«í””“G'VRí&WGW&‚f«6S∞†¢6ˆÁ7BvVV∂«í“'6UvVV∂«îˆfdFó2áFV6Ö&˜sÚÁvVV∂«ïˆˆfeˆFó2ì∞¢ñbÇvVV∂«í«¬vVV∂«íÁ6ó¶R””“í&WGW&‚f«6S∞¢6ˆÁ7BB“ÊWrFFRÜGµ7G&ñÊrÜFFU7G"íÁ6∆ñ6RÉ√ó’C££≥s£ì∞¢6ˆÁ7BF˜r“BÊvWDFíÇì≤ÚÚ‚„`¢&WGW&‚vVV∂«íÊÜ2ÜF˜rì∞ß–†¶7ñÊ2gVÊ7Fñˆ‚∆ó7D76ñvÊVD¶ˆ'4f˜%FV6Ñˆ‰FFRáW6W&Ê÷R¬FFU7G"¬ñvÊ˜&T¶ˆ$ñB¬ˆˆƒ˜fW'&ñFRí∞¢ÚÚ)»RFñ÷W¶ˆÊR◊&ˆ'W7Bfñ«FW"á6˜W&6RˆbG'WFÉ¢6ñÙ&Êv∂ˆ≤ê¢ÚÚàä>äﬁà~âNòûä~ä.àÆòéä~à~òä~ä^ã"∂Fï7F'B¬FîVÊBíòâÆâ¢&Êv∂ˆ≤ˆfg6WBòä^òûär67Bòâæò~âíFñ÷W7F◊G¢òäÆää–¢ÚÚò.âNä.òä>ã.òNâNòûâÆãà~àNãâ¢Fñ÷W¶ˆÊRà.äﬁàr6W76ñˆ‚â~ã^òÇF"Êß2òä^òûärÜ˜FñˆÁ3¢÷2Fñ÷W¶ˆÊS‘6ñÙ&Êv∂ˆ≤ê¢6ˆÁ7BFí“7G&ñÊrÜFFU7G"«¬""íÁ6∆ñ6RÉ¬ì∞¢6ˆÁ7BFDFó2“áñ÷B¬‚í”‚∞¢6ˆÁ7B∑í¬“¬E““ñ÷BÁ7∆óBÇr“ríÊ÷ÑÁV÷&W"ì∞¢6ˆÁ7BGB“ÊWrFFRÑFFRÂUD2áí¬Ü“«¬í“¬B«¬íì∞¢GBÁ6WEUD4FFRÜGBÊvWEUD4FFRÇí≤ÁV÷&W"Ü‚«¬íì∞¢6ˆÁ7Bóí“7G&ñÊrÜGBÊvWEUD4gV∆≈ñV"ÇííÁE7F'BÉB¬srì∞¢6ˆÁ7B÷““7G&ñÊrÜGBÊvWEUD4÷ˆÁFÇÇí≤íÁE7F'BÉ"¬srì∞¢6ˆÁ7BFB“7G&ñÊrÜGBÊvWEUD4FFRÇííÁE7F'BÉ"¬srì∞¢&WGW&‚G∑óó““G∂÷◊““G∂FG÷∞¢”∞¢6ˆÁ7BFï7F'B“G∂Fó’C££≥s£∞¢6ˆÁ7BFîVÊB“G∂FDFó2ÜFí¬ó’C££≥s£∞†¢6ˆÁ7B&◊2“∑W6W&Ê÷R¬Fï7F'B¬FîVÊE”∞¢∆WBWáG&“"#∞¢ñbÜñvÊ˜&T¶ˆ$ñBí≤&◊2ÁW6ÇÜñvÊ˜&T¶ˆ$ñBì≤WáG&“‰B¢Ê¶ˆ%ˆñB√‚CF≤–†¢ÚÚî’ı%DÂBÑï55TRì¢àÆòéã.à~â~ã^òéòäÆä>ò~àéàòéäﬁâíâ^òûäﬁà~ä>ãâÆà~ã.âûò>äæäòéòNâNòê¢ÚÚ“à~ã.âûòâNã^ä.ä~àãâûäﬁã.àéòâÆòéà~ä>ã.ä.àã.ä>ò>äæòûäæä^ã.ä.àÆòéã.àrÜ¶ˆ%ˆóFV◊2Ê76ñvÊVE˜FV6ÜÊñ6ñÂ˜W6W&Ê÷Rê¢ÚÚ“GW&FñˆÂˆ÷ñ‚à.äﬁàr¶ˆ'2òâæò~âí(	Œä>ä~äò>âÆà~ã.âí˛äæãä~äæâûòûã.â~ã^ä(	“àéãnà~äæòûã.äòäﬁã.òNâæä^ò~äﬁààNãNä~â~ãéààNâê¢ÚÚâ~ã.à~òàòì¢àNã~âí76ñvÊVEˆóFV◊2òàûâÓã.ãà.äﬁà~àÆòéã.à~àNâûâûãòûâíòä^òûä~àNã>âûä~â2GW&Fñˆ‚â^òéäﬁàNâíáW"◊FV6Çíâ^äﬁâûâ~ã2fñ∆&ñ∆óGíˆ6ˆ∆∆ó6ñˆ‡¢6ˆÁ7B"“vóBáˆˆƒ˜fW'&ñFR«¬ˆˆ¬íÁVW'íÄ¢ ¢4TƒT5@¢¢Ê¶ˆ%ˆñB¿¢¢ÊˆñÁF÷VÁEˆFFWFñ÷R¿¢4ÙƒU44RÜ¢ÊGW&FñˆÂˆ÷ñ‚√cí2GW&FñˆÂˆ÷ñ‚¿¢4ÙƒU44RÜ¢Ê¶ˆ%˜GóR¬rrí2¶ˆ%˜GóR¿¢4ÙƒU44RÄ¢ß6ˆÂˆvrÑDï5Dî‰5Bß6ˆÊ%ˆ'Vñ∆Eˆˆ&¶V7BÇvóFV’ˆÊ÷Rr¬óBÊóFV’ˆÊ÷R¬wGír¬óBÁGííê¢dî≈DU"ÖtÑU$RóBÊ¶ˆ%ˆñBï2‰ıBÂTƒ¬í¿¢uµ“s£¶ß6ˆ‡¢í276ñvÊVEˆóFV◊0¢e$Ù“V&∆ñ2Ê¶ˆ'2†¢ƒTeB§Ùî‚V&∆ñ2Ê¶ˆ%ˆóFV◊2ó@¢Ù‚óBÊ¶ˆ%ˆñB“¢Ê¶ˆ%ˆñ@¢‰BóBÊ76ñvÊVE˜FV6ÜÊñ6ñÂ˜W6W&Ê÷R“C¢‰B4ÙƒU44RÜóBÊó5˜6W'fñ6R¬G'VRí“G'VP¢tÑU$RÜ¢ÊˆñÁF÷VÁEˆFFWFñ÷S£ßFñ÷W7F◊G¢í„“C ¢‰BÜ¢ÊˆñÁF÷VÁEˆFFWFñ÷S£ßFñ÷W7F◊G¢í¬C0¢‰B4ÙƒU44RÜ¢Ê¶ˆ%˜7FGW2¬rrí√‚~ä.àòä^ãNàp¢G∂WáG&–¢‰BÄ¢¢ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷S“C¢ı"¢ÁFV6ÜÊñ6ñÂ˜FV”“C¢ı"UÑï5E2Ö4TƒT5Be$Ù“V&∆ñ2Ê¶ˆ%˜FV’ˆ÷V÷&W'2“tÑU$R“Ê¶ˆ%ˆñC÷¢Ê¶ˆ%ˆñB‰B“ÁW6W&Ê÷S“Cê¢ı"UÑï5E2Ö4TƒT5Be$Ù“V&∆ñ2Ê¶ˆ%ˆ76ñvÊ÷VÁG2tÑU$RÊ¶ˆ%ˆñC÷¢Ê¶ˆ%ˆñB‰BÁFV6ÜÊñ6ñÂ˜W6W&Ê÷S“Cê¢ı"UÑï5E2Ö4TƒT5Be$Ù“V&∆ñ2Ê¶ˆ%ˆóFV◊2óC"tÑU$RóC"Ê¶ˆ%ˆñC÷¢Ê¶ˆ%ˆñB‰BóC"Ê76ñvÊVE˜FV6ÜÊñ6ñÂ˜W6W&Ê÷S“Cê¢ê¢u$ıU%í¢Ê¶ˆ%ˆñB¬¢ÊˆñÁF÷VÁEˆFFWFñ÷R¬¢ÊGW&FñˆÂˆ÷ñ‚¬¢Ê¶ˆ%˜GóP¢¿¢&◊0¢ì∞¢&WGW&‚"Á&˜w2«¬µ”∞ß–†¶7ñÊ2gVÊ7Fñˆ‚vWEW%FV6ÑGW&Fñˆ‰f˜$¶ˆ%vóFÑ6∆ñVÁBÜ6∆ñVÁB¬¶ˆ$ñB¬FV6ÖW6W&Ê÷R¬f∆∆&6¥GW&Fñˆ‚¬¶ˆ%GóTf∆∆&6≤í∞¢6ˆÁ7BGW$f∆∆&6≤“÷FÇÊ÷ÇÉ¬ÁV÷&W"Üf∆∆&6¥GW&Fñˆ‚«¬cíì∞¢6ˆÁ7BFV6Ç“7G&ñÊráFV6ÖW6W&Ê÷R«¬""íÁG&ñ“Çì∞¢ñbÇ¶ˆ$ñB«¬FV6Çí&WGW&‚GW$f∆∆&6≥∞†¢G'í∞¢6ˆÁ7B"“vóB6∆ñVÁBÁVW'íÄ¢4TƒT5BóFV’ˆÊ÷R¬Gê¢e$Ù“V&∆ñ2Ê¶ˆ%ˆóFV◊0¢tÑU$R¶ˆ%ˆñC“C¢‰B76ñvÊVE˜FV6ÜÊñ6ñÂ˜W6W&Ê÷S“C ¢‰B4ÙƒU44RÜó5˜6W'fñ6R¬G'VRí“G'VP¢ı$DU"%í¶ˆ%ˆóFV’ˆñB46¿¢∂¶ˆ$ñB¬FV6Ö–¢ì∞¢6ˆÁ7BóFV◊2“"Á&˜w2«¬µ”∞¢ñbÇóFV◊2Ê∆VÊwFÇí&WGW&‚GW$f∆∆&6≥∞¢6ˆÁ7BB“6ˆ◊WFUW%FV6ÑGW&Fñˆ‰g&ˆ‘76ñvÊVDóFV◊2Ü¶ˆ%GóTf∆∆&6≤¬óFV◊2ì∞¢&WGW&‚B‚ÚB¢GW$f∆∆&6≥∞¢“6F6ÇÖÚí∞¢&WGW&‚GW$f∆∆&6≥∞¢–ß–†¢ÚÚ”””””””””””””””””””””””””””””””–¢ÚÚ	˘JrW"◊FV6ÇGW&Fñˆ‚ÜV«W'0¢ÚÚ“ò>àÆòûäÆã>äæä>ãâ¢fñ∆&ñ∆óGíÙ6ˆ∆∆ó6ñˆ‚òâ~òéã.âûãòûâê¢ÚÚ“fñ¬÷˜V„¢ânòûã"'6RòNäòéòNâNòíò>äæòíf∆∆&6≤òâæò~âí¶ˆ'2ÊGW&FñˆÂˆ÷ñ‚òâNãNäéàãâí&Vw&W76ñˆ‚ê¢ÚÚ”””””””””””””””””””””””””””””””–¶gVÊ7Fñˆ‚'6U6W'fñ6Tg&ˆ‘¶ˆ$óFV’&˜rÜóFV‘Ê÷R¬Gí¬¶ˆ%GóTf∆∆&6≤ó∞¢6ˆÁ7BÊ÷R“7G&ñÊrÜóFV‘Ê÷R«¬rríÁG&ñ“Çì∞¢6ˆÁ7B‚“ÁV÷&W"áGí«¬ì∞¢ñbÇÊ÷Rí&WGW&‚ÁV∆√∞†¢ÚÚ7∆óB'í'V∆∆WG2Ü∆Vv7í∆&V¬f˜&÷Bê¢6ˆÁ7B'G2“Ê÷RÁ7∆óBÇ~(
"ríÊ÷á2”‚7G&ñÊrá2«¬rríÁG&ñ“ÇííÊfñ«FW"Ñ&ˆˆ∆V‚ì∞†¢ÚÚFWFV7B¶ˆ"GóRávRˆÊ«í'6R.ä^òûã.àr"&V∆ñ&«íÜW&S≤˜FÜW'2f∆∆&6≤ê¢∆WB¶ˆ%˜GóR“7G&ñÊrÜ¶ˆ%GóTf∆∆&6≤«¬rríÁG&ñ“Çì∞¢ñbÇ¶ˆ%˜GóRí∞¢ñbÜÊ÷RÊñÊ6«VFW2Ç~ä^òûã.à~òäﬁä>ò¬ríí¶ˆ%˜GóR“~ä^òûã.àrs∞¢V«6RñbÜÊ÷RÊñÊ6«VFW2Ç~àæòéäﬁäríí¶ˆ%˜GóR“~àæòéäﬁäs∞¢V«6RñbÜÊ÷RÊñÊ6«VFW2Ç~â^ãNâNâ^ãòûàrríí¶ˆ%˜GóR“~â^ãNâNâ^ãòûàrs∞¢–¢ñbÜ¶ˆ%˜GóR”“~ä^òûã.àrrí&WGW&‚ÁV∆√∞†¢ÚÚ5˜GóRg&ˆ“fó'7BFˆ∂V‚∆ñ∂R.ä^òûã.à~òäﬁä>òŒâŒâûãàr ¢∆WB5˜GóR“ÁV∆√∞¢ñbá'G2Ê∆VÊwFÇí∞¢6ˆÁ7B“'G5≥”∞¢ñbáÁ7F'G5vóFÇÇ~ä^òûã.à~òäﬁä>ò¬ríí∞¢5˜GóR“Á&W∆6RÇ~ä^òûã.à~òäﬁä>ò¬r¬rríÁG&ñ“Çí«¬ÁV∆√∞¢–¢–†¢ÚÚv6Ö˜f&ñÁ@¢∆WBv6Ö˜f&ñÁB“ÁV∆√∞¢f˜"Ü6ˆÁ7Bˆb'G2í∞¢ñbáÊñÊ6«VFW2Ç~ä^òûã.àrríbbÊñÊ6«VFW2Ç~ä^òûã.à~òäﬁä>ò¬ríbbÊñÊ6«VFW2Çt%ERríbbÊñÊ6«VFW2Ç~òàNä>ã~òéäﬁàrríí∞¢v6Ö˜f&ñÁB“ÁG&ñ“Çì∞¢'&V≥∞¢–¢–†¢ÚÚ'GP¢∆WB'GR“∞¢f˜"Ü6ˆÁ7Bˆb'G2í∞¢ñbáÁFıWW$66RÇíÊñÊ6«VFW2Çt%ERríí∞¢6ˆÁ7B‚“ÁV÷&W"Ö7G&ñÊráíÁ&W∆6RÇıµ„”ï“ˆr¬rríì∞¢ñbÑÁV÷&W"Êó4fñÊóFRÜ‚íbb‚‚í≤'GR“÷FÇÊf∆ˆ˜"Ü‚ì≤'&V≥≤–¢–¢–†¢ÚÚ÷6ÜñÊUˆ6˜VÁC¢&VfW"Gíg&ˆ“&˜r¬V«6RG'í'6R"‚‚‚òàNä>ã~òéäﬁàr ¢∆WB÷6ÜñÊUˆ6˜VÁB“∞¢ñbÑÁV÷&W"Êó4fñÊóFRá‚íbb‚‚í÷6ÜñÊUˆ6˜VÁB“„∞¢ñbÇÜ÷6ÜñÊUˆ6˜VÁB‚íí∞¢f˜"Ü6ˆÁ7Bˆb'G2í∞¢ñbáÊñÊ6«VFW2Ç~òàNä>ã~òéäﬁàrríí∞¢6ˆÁ7B‚“ÁV÷&W"Ö7G&ñÊráíÁ&W∆6RÇıµ„”ï“ˆr¬rríì∞¢ñbÑÁV÷&W"Êó4fñÊóFRÜ‚íbb‚‚í≤÷6ÜñÊUˆ6˜VÁB“÷FÇÊf∆ˆ˜"Ü‚ì≤'&V≥≤–¢–¢–¢–¢ñbÇÜ÷6ÜñÊUˆ6˜VÁB‚íí÷6ÜñÊUˆ6˜VÁB“∞†¢&WGW&‚∞¢¶ˆ%˜GóS¢~ä^òûã.àrr¿¢5˜GóS¢5˜GóR«¬~âŒâûãàrr¿¢v6Ö˜f&ñÁC¢v6Ö˜f&ñÁB«¬~ä^òûã.à~âéä>ä>äâNã"r¿¢'GS¢'GR«¬#¿¢÷6ÜñÊUˆ6˜VÁB¿¢76ñvÊVE˜FV6ÜÊñ6ñÂ˜W6W&Ê÷S¢ÁV∆¬¿¢”∞ß–†¶gVÊ7Fñˆ‚6ˆ◊WFUW%FV6ÑGW&Fñˆ‰g&ˆ‘76ñvÊVDóFV◊2Ü¶ˆ%GóR¬76ñvÊVDóFV◊2ó∞¢G'í∞¢6ˆÁ7B'"“'&íÊó4'&íÜ76ñvÊVDóFV◊2íÚ76ñvÊVDóFV◊2¢µ”∞¢ñbÇ'"Ê∆VÊwFÇí&WGW&‚∞¢6ˆÁ7B6W'fñ6W2“µ”∞¢f˜"Ü6ˆÁ7BóBˆb'"í∞¢6ˆÁ7B2“'6U6W'fñ6Tg&ˆ‘¶ˆ$óFV’&˜rÜóCÚÊóFV’ˆÊ÷R¬óCÚÁGí¬¶ˆ%GóRì∞¢ñbá2í6W'fñ6W2ÁW6Çá2ì∞¢–¢ñbÇ6W'fñ6W2Ê∆VÊwFÇí&WGW&‚∞¢ÚÚ6ˆÁ6W'fFófS◊G'VRßW7B÷∂W27W&RvRFˆ‚wB«íÁí&∆∆V¬6Ü˜'FVÊñÊp¢6ˆÁ7Bñ∆ˆB“≤¶ˆ%˜GóS¢7G&ñÊrÜ¶ˆ%GóR«¬~ä^òûã.àrríÁG&ñ“Çí«¬~ä^òûã.àrr¬6W'fñ6W2”∞¢6ˆÁ7BB“6ˆ◊WFTGW&Fñˆ‰÷ñ‰◊V«Fíáñ∆ˆB¬≤6˜W&6S¢wW%˜FV6ÖˆóFV◊2r¬6ˆÁ6W'fFófS¢G'VR“ì∞¢&WGW&‚÷FÇÊ÷ÇÉ¬ÁV÷&W"ÜB«¬íì∞¢“6F6ÇÜRí∞¢&WGW&‚∞¢–ß–†¶gVÊ7Fñˆ‚˜fW&∆2Ü7F'B¬VÊB¬%7F'B¬$VÊBí∞¢&WGW&‚7F'B¬$VÊBbb%7F'B¬VÊC∞ß–†¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	˘Y"fñ∆&ñ∆óGíÜV«W'2áW"◊FV6Ç¬&Êv∂ˆ≤◊6fRê¢ÚÚ“G&fV¬'VffW"'V∆RÑƒÙ4¥TB5T2ê¢ÚÚ)»R'VffW"≥3âûã.â~ãR.â^òéä“ò>âÆà~ã.âí"òâÆâ¢6ˆÁ6W'fFófRéä>ä~äà~ã.âûäÆãéâNâ~òûã.ä.à.äﬁà~ä~ãâíê¢ÚÚ)»R'W7íñÁFW'f¬â^òéäﬁò>âÆà~ã.âí“∑7F'B¬7F'B∂GW&Fñˆ‚≥3íÜÜ∆b÷˜V‚ê¢ÚÚ“˜fW&∆6ÜV6≤ÑÜ&Bf∆ñFFñˆ‚ì†¢ÚÚñbÊWu˜7F'B¬ˆ∆Eˆ'W7ïˆVÊBbbˆ∆E˜7F'B¬ÊWuˆ'W7ïˆVÊB”‚àÆâûàNãNäp¢ÚÚ””””””””””””””””””””””””””””””””””””””–†¶6ˆÁ7BT‰$ƒUÙdîƒ$îƒïEïÙDT%Tr“7G&ñÊrá&ˆ6W72ÊVÁb‰T‰$ƒUÙdîƒ$îƒïEïÙDT%Tr«¬rríÁG&ñ“Çí””“ss∞¢ÚÚ'VÁFñ÷RFˆvv∆Rf˜"F÷ñ‚FV'Vr∆ˆvvñÊrÜÊÚFW∆˜íÊVVFVBí‚FVfV«BÙdb‡¢ÚÚFÜó2ó2ñÁFVÁFñˆÊ∆«íñ‚÷÷V÷˜'íFÚfˆñBD"÷ñw&FñˆÁ2ÊBÁí&ˆGV7Fñˆ‚&ó6≤‡¶∆WB%TÂDî‘UÙdîƒ$îƒïEïÙDT%Tr“f«6S∞¶gVÊ7Fñˆ‚f∆ˆráFr¬ˆ&¢ó∞¢ñbÇÑT‰$ƒUÙdîƒ$îƒïEïÙDT%Tr«¬%TÂDî‘UÙdîƒ$îƒïEïÙDT%Tríí&WGW&„∞¢G'ó≤6ˆÁ6ˆ∆RÊ∆ˆráFr¬ˆ&¢ì≤÷6F6á∑–ß–†¢ÚÚF÷ñ‚FV'Vr6ˆÁG&ˆ«2Üfñ∆&ñ∆óGí∆ˆvvñÊrê¢ÚÚ“tUBˆF÷ñ‚ˆFV'Vr˜7FGW0¢ÚÚ“ı5BˆF÷ñ‚ˆFV'Vr˜Fˆvv∆R≤VÊ&∆VC¢G'VW∆f«6R–¢ÚÚ&6∑v&B6ˆ◊Fñ&∆R≤6fS¢ˆÊ«íffV7G26ˆÁ6ˆ∆R∆ˆvvñÊrvÜV‚VÊ&∆VB‡¶ÊvWBÇrˆF÷ñ‚ˆFV'Vr˜7FGW2r¬&WVó&TF÷ñÂ6ˆgB¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢&WGW&‚&W2Êß6ˆ‚á∞¢7V66W73¢G'VR¿¢fñ∆&ñ∆óGïˆFV'VuˆVÁc¢T‰$ƒUÙdîƒ$îƒïEïÙDT%Tr¿¢fñ∆&ñ∆óGïˆFV'Vu˜'VÁFñ÷S¢%TÂDî‘UÙdîƒ$îƒïEïÙDT%Tr¿¢G£¢&ˆ6W72ÊVÁbÂE¢«¬ÁV∆¬¿¢“ì∞¢“6F6ÇÜRí∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢vFV'Vr7FGW2fñ∆VBr“ì∞¢–ß“ì∞†¶Á˜7BÇrˆF÷ñ‚ˆFV'Vr˜Fˆvv∆Rr¬&WVó&TF÷ñÂ6ˆgB¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7BVÊ&∆VB“7G&ñÊrá&WÊ&ˆGìÚÊVÊ&∆VBÛÚrríÁG&ñ“Çì∞¢ñbÜVÊ&∆VB””“sr«¬VÊ&∆VB””“wG'VRrí∞¢%TÂDî‘UÙdîƒ$îƒïEïÙDT%Tr“G'VS∞¢“V«6RñbÜVÊ&∆VB””“sr«¬VÊ&∆VB””“vf«6Rrí∞¢%TÂDî‘UÙdîƒ$îƒïEïÙDT%Tr“f«6S∞¢“V«6R∞¢ÚÚFˆvv∆RñbñÁf∆ñBˆV◊Gê¢%TÂDî‘UÙdîƒ$îƒïEïÙDT%Tr“%TÂDî‘UÙdîƒ$îƒïEïÙDT%Ts∞¢–¢&WGW&‚&W2Êß6ˆ‚á≤7V66W73¢G'VR¬fñ∆&ñ∆óGïˆFV'Vu˜'VÁFñ÷S¢%TÂDî‘UÙdîƒ$îƒïEïÙDT%Tr“ì∞¢“6F6ÇÜRí∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢vFV'VrFˆvv∆Rfñ∆VBr“ì∞¢–ß“ì∞†¶gVÊ7Fñˆ‚f◊DÑÑ‘‘g&ˆ‘÷ñ‚Ü“ó∞¢&WGW&‚÷ñÂFÙÑÑ‘“Ñ÷FÇÊ÷ÇÉ¬÷FÇÊ÷ñ‚É#B£c¬÷FÇÁ&˜VÊBÜ“íííì∞ß–†¶gVÊ7Fñˆ‚&Êv∂ˆ¥Ñ’FÙ÷ñ‰g&ˆ‘FFRÜFFRó∞¢ÚÚWáG&7BÜ˜W"ˆ÷ñÁWFRñ‚6ñÙ&Êv∂ˆ≤¬FÜV‚6ˆÁfW'BFÚ÷ñÁWFW2g&ˆ“÷ñFÊñváB‡¢6ˆÁ7B'G2“ÊWrñÁF¬‰FFUFñ÷Tf˜&÷BÇvV‚‘t"r¬∞¢Fñ÷U¶ˆÊS¢t6ñÙ&Êv∂ˆ≤r¿¢Ü˜W#¢s"÷FñvóBr¿¢÷ñÁWFS¢s"÷FñvóBr¿¢Ü˜W##¢f«6R¿¢“íÊf˜&÷EFı'G2ÜFFRì∞¢6ˆÁ7BÜÇ“ÁV÷&W"á'G2ÊfñÊBá”ÁÁGóS””“vÜ˜W"rìÚÁf«VR«¬ì∞¢6ˆÁ7B÷““ÁV÷&W"á'G2ÊfñÊBá”ÁÁGóS””“v÷ñÁWFRrìÚÁf«VR«¬ì∞¢&WGW&‚ÜÇ¢c≤÷”∞ß–†¶gVÊ7Fñˆ‚÷W&vT÷ñ‰ñÁFW'f«2ÜñÁFW'f«2ó∞¢ÚÚñÁFW'f«3¢∑∑7F'D÷ñ‚∆VÊD÷ñÁ’“vóFÇ7F'D÷ñ„√÷VÊD÷ñ‡¢6ˆÁ7B'"“Ñ'&íÊó4'&íÜñÁFW'f«2íÚñÁFW'f«2¢µ“ê¢Ê÷áÉ”‚á≤7F'D÷ñ„¢ÁV÷&W"áÇÁ7F'D÷ñ‚í¬VÊD÷ñ„¢ÁV÷&W"áÇÊVÊD÷ñ‚í“íê¢Êfñ«FW"áÉ”‰ÁV÷&W"Êó4fñÊóFRáÇÁ7F'D÷ñ‚íbbÁV÷&W"Êó4fñÊóFRáÇÊVÊD÷ñ‚íbbÇÊVÊD÷ñ‚‚ÇÁ7F'D÷ñ‚ê¢Á6˜'BÇÜ∆"ì”ÊÁ7F'D÷ñ‚÷"Á7F'D÷ñ‚«¬ÊVÊD÷ñ‚÷"ÊVÊD÷ñ‚ì∞¢6ˆÁ7B˜WB“µ”∞¢f˜"Ü6ˆÁ7BóBˆb'"ó∞¢ñbÇ˜WBÊ∆VÊwFÇó≤˜WBÁW6Çá≤‚‚ÊóB“ì≤6ˆÁFñÁVS≤–¢6ˆÁ7B∆7B“˜WE∂˜WBÊ∆VÊwFÇ””∞¢ñbÜóBÁ7F'D÷ñ‚√“∆7BÊVÊD÷ñ‚ó∞¢∆7BÊVÊD÷ñ‚“÷FÇÊ÷ÇÜ∆7BÊVÊD÷ñ‚¬óBÊVÊD÷ñ‚ì∞¢“V«6R∞¢˜WBÁW6Çá≤‚‚ÊóB“ì∞¢–¢–¢&WGW&‚˜WC∞ß–†¶7ñÊ2gVÊ7Fñˆ‚∆ó7D¶ˆ$&∆ˆ6∑4f˜%FV6Ñˆ‰FFRáW6W&Ê÷R¬FFU7G"¬ñvÊ˜&T¶ˆ$ñBó∞¢ÚÚ&WGW&Á2÷W&vVB$r¶ˆ"&∆ˆ6∑2ÜÊÚ'VffW"íñ‚&Êv∂ˆ≤÷ñÁWFW3¢∑∂¶ˆ%ˆñB«7F'D÷ñ‚∆VÊD÷ñ‚«7F'Dó6Ú∆GW&Fñˆ‰÷ñÁ’–¢6ˆÁ7B¶ˆ'2“vóB∆ó7D76ñvÊVD¶ˆ'4f˜%FV6Ñˆ‰FFRáW6W&Ê÷R¬FFU7G"¬ñvÊ˜&T¶ˆ$ñBì∞¢6ˆÁ7B&r“µ”∞¢f˜"Ü6ˆÁ7B¢ˆbÜ¶ˆ'7«≈µ“íó∞¢6ˆÁ7B7F'DFFR“ÊWrFFRÜ¢ÊˆñÁF÷VÁEˆFFWFñ÷Rì∞¢6ˆÁ7B7F'D÷ñ‚“&Êv∂ˆ¥Ñ’FÙ÷ñ‰g&ˆ‘FFRá7F'DFFRì∞¢6ˆÁ7BW%FV6ÑGW"“6ˆ◊WFUW%FV6ÑGW&Fñˆ‰g&ˆ‘76ñvÊVDóFV◊2Ü¢Ê¶ˆ%˜GóR¬¢Ê76ñvÊVEˆóFV◊2ì∞¢6ˆÁ7BGW"“W%FV6ÑGW"‚ÚW%FV6ÑGW"¢÷FÇÊ÷ÇÉ¬ÁV÷&W"Ü¢ÊGW&FñˆÂˆ÷ñ‚«¬cíì∞¢6ˆÁ7BVÊD÷ñ‚“7F'D÷ñ‚≤GW#∞¢&rÁW6Çá∞¢¶ˆ%ˆñC¢¢Ê¶ˆ%ˆñB¿¢7F'D÷ñ‚¿¢VÊD÷ñ‚¿¢7F'Dó6Û¢¢ÊˆñÁF÷VÁEˆFFWFñ÷R¿¢GW&Fñˆ‰÷ñ„¢GW"¿¢“ì∞¢–¢&WGW&‚÷W&vT÷ñ‰ñÁFW'f«2á&rì∞ß–†¶7ñÊ2gVÊ7Fñˆ‚∆ó7D'W7î&∆ˆ6∑4f˜%FV6Ñˆ‰FFRáW6W&Ê÷R¬FFU7G"¬ñvÊ˜&T¶ˆ$ñB¬ˆˆƒ˜fW'&ñFRó∞¢ÚÚ&WGW&Á2÷W&vVB%U5í&∆ˆ6∑2ávóFÇ6ˆÁ6W'fFófR'VffW"íñ‚&Êv∂ˆ≤÷ñÁWFW3†¢ÚÚ∑∂¶ˆ%ˆñB«7F'D÷ñ‚∆'W7îVÊD÷ñ‚«7F'Dó6Ú∆GW&Fñˆ‰÷ñÁ’–¢6ˆÁ7B¶ˆ'2“vóB∆ó7D76ñvÊVD¶ˆ'4f˜%FV6Ñˆ‰FFRáW6W&Ê÷R¬FFU7G"¬ñvÊ˜&T¶ˆ$ñB¬ˆˆƒ˜fW'&ñFRì∞¢6ˆÁ7B&r“µ”∞¢f˜"Ü6ˆÁ7B¢ˆbÜ¶ˆ'7«≈µ“íó∞¢6ˆÁ7B7F'DFFR“ÊWrFFRÜ¢ÊˆñÁF÷VÁEˆFFWFñ÷Rì∞¢6ˆÁ7B7F'D÷ñ‚“&Êv∂ˆ¥Ñ’FÙ÷ñ‰g&ˆ‘FFRá7F'DFFRì∞¢6ˆÁ7BW%FV6ÑGW"“6ˆ◊WFUW%FV6ÑGW&Fñˆ‰g&ˆ‘76ñvÊVDóFV◊2Ü¢Ê¶ˆ%˜GóR¬¢Ê76ñvÊVEˆóFV◊2ì∞¢6ˆÁ7BGW"“W%FV6ÑGW"‚ÚW%FV6ÑGW"¢÷FÇÊ÷ÇÉ¬ÁV÷&W"Ü¢ÊGW&FñˆÂˆ÷ñ‚«¬cíì∞¢6ˆÁ7B'W7îVÊD÷ñ‚“7F'D÷ñ‚≤GW"≤E$dT≈Ù%TddU%Ù‘î„∞¢&rÁW6Çá∞¢¶ˆ%ˆñC¢¢Ê¶ˆ%ˆñB¿¢7F'D÷ñ‚¿¢VÊD÷ñ„¢7F'D÷ñ‚≤GW"¬ÚÚ&rVÊBÜÊÚ'VffW"ê¢'W7îVÊD÷ñ‚¿¢7F'Dó6Û¢¢ÊˆñÁF÷VÁEˆFFWFñ÷R¿¢GW&Fñˆ‰÷ñ„¢GW"¿¢“ì∞¢–¢ÚÚ÷W&vRW6ñÊr'W7îVÊD÷ñ‡¢6ˆÁ7B÷W&vVB“µ”∞¢6ˆÁ7B6˜'FVB“&p¢Êfñ«FW"áÉ”‰ÁV÷&W"Êó4fñÊóFRáÇÁ7F'D÷ñ‚íbbÁV÷&W"Êó4fñÊóFRáÇÊ'W7îVÊD÷ñ‚íbbÇÊ'W7îVÊD÷ñ‚‚ÇÁ7F'D÷ñ‚ê¢Á6˜'BÇÜ∆"ì”ÊÁ7F'D÷ñ‚÷"Á7F'D÷ñ‚«¬Ê'W7îVÊD÷ñ‚÷"Ê'W7îVÊD÷ñ‚ì∞†¢f˜"Ü6ˆÁ7BóBˆb6˜'FVBó∞¢ñbÇ÷W&vVBÊ∆VÊwFÇó≤÷W&vVBÁW6Çá≤‚‚ÊóB“ì≤6ˆÁFñÁVS≤–¢6ˆÁ7B∆7B“÷W&vVE∂÷W&vVBÊ∆VÊwFÇ””∞¢ñbÜóBÁ7F'D÷ñ‚¬∆7BÊ'W7îVÊD÷ñ‚ó∞¢ÚÚ˜fW&∆”‚WáFVÊ@¢∆7BÊ'W7îVÊD÷ñ‚“÷FÇÊ÷ÇÜ∆7BÊ'W7îVÊD÷ñ‚¬óBÊ'W7îVÊD÷ñ‚ì∞¢∆7BÊVÊD÷ñ‚“÷FÇÊ÷ÇÜ∆7BÊVÊD÷ñ‚¬óBÊVÊD÷ñ‚ì∞¢ÚÚ∂VWV&∆ñW7B¶ˆ%ˆñB˜7F'Dó6Úf˜"FV'Vp¢“V«6R∞¢÷W&vVBÁW6Çá≤‚‚ÊóB“ì∞¢–¢–¢&WGW&‚÷W&vVC∞ß–†¶gVÊ7Fñˆ‚'Vñ∆EFV6ÖvñÊF˜w4÷ñ‚áFV6Ö&˜r¬FFU7G"¬7V6ñƒ÷¬Vï7F'D÷ñ‚¬VîVÊD÷ñ‚ó∞¢ÚÚVÊñˆ‚ˆbW"◊FV6Çv˜&≤Ü˜W'2≤7V6ñ¬6∆˜G2¬ñÁFW'6V7FVBvóFÇTívñÊF˜r‡¢6ˆÁ7BvñÁ2“µ”∞¢6ˆÁ7BG2“FÙ÷ñ‚áFV6Ö&˜sÚÁv˜&µ˜7F'B«¬sì£rì∞¢6ˆÁ7BFR“FÙ÷ñ‚áFV6Ö&˜sÚÁv˜&µˆVÊB«¬sÉ£rì∞¢ñbÑÁV÷&W"Êó4fñÊóFRáG2íbbÁV÷&W"Êó4fñÊóFRáFRíbbFR‚G2ó∞¢6ˆÁ7B“÷FÇÊ÷ÇáVï7F'D÷ñ‚¬G2ì∞¢6ˆÁ7B"“÷FÇÊ÷ñ‚áVîVÊD÷ñ‚¬FRì∞¢ñbÜ"‚ívñÁ2ÁW6Çá≤7F'D÷ñ„¢¬VÊD÷ñ„¢"“ì∞¢–¢6ˆÁ7B7“7V6ñƒ÷ÚÊvWBáFV6Ö&˜sÚÁW6W&Ê÷Rí«¬µ”∞¢f˜"Ü6ˆÁ7Brˆb7ó∞¢6ˆÁ7Bw2“FÙ÷ñ‚árÁ7F'Bì∞¢6ˆÁ7BvR“FÙ÷ñ‚árÊVÊBì∞¢ñbÇÁV÷&W"Êó4fñÊóFRáw2í«¬ÁV÷&W"Êó4fñÊóFRávRí«¬vR√“w2í6ˆÁFñÁVS∞¢6ˆÁ7B“÷FÇÊ÷ÇáVï7F'D÷ñ‚¬w2ì∞¢6ˆÁ7B"“÷FÇÊ÷ñ‚áVîVÊD÷ñ‚¬vRì∞¢ñbÜ"‚ívñÁ2ÁW6Çá≤7F'D÷ñ„¢¬VÊD÷ñ„¢"“ì∞¢–¢&WGW&‚÷W&vT÷ñ‰ñÁFW'f«2ávñÁ2ì∞ß–†¶gVÊ7Fñˆ‚'Vñ∆D'W7îñÁFW'f«46ˆÁ6W'fFófRÜ'W7î&∆ˆ6∑2ó∞¢ÚÚ6ˆÁfW'B'W7î&∆ˆ6∑2”‚∑∑7F'D÷ñ‚∆VÊD÷ñÁ’“W6ñÊr'W7îVÊD÷ñ‚‡¢6ˆÁ7B&∆ˆ6∑2“'&íÊó4'&íÜ'W7î&∆ˆ6∑2íÚ'W7î&∆ˆ6∑2¢µ”∞¢&WGW&‚÷W&vT÷ñ‰ñÁFW'f«2Ü&∆ˆ6∑2Ê÷Ü"”‚á≤7F'D÷ñ„¢"Á7F'D÷ñ‚¬VÊD÷ñ„¢"Ê'W7îVÊD÷ñ‚“ííì∞ß–†¶gVÊ7Fñˆ‚'Vñ∆Dg&VTñÁFW'f«4f˜%vñÊF˜rÜ'W7îñÁFW'f«2¬vñÊF˜u7F'D÷ñ‚¬vñÊF˜tVÊD÷ñ‚ó∞¢ÚÚ&WGW&Á2g&VRv2ñ‚∑vñÊF˜u7F'D÷ñ‚¬vñÊF˜tVÊD÷ñ‚ívófV‚'W7íñÁFW'f«2Ü÷ñÁWFW2ê¢6ˆÁ7B'W7í“÷W&vT÷ñ‰ñÁFW'f«2ÇÑ'&íÊó4'&íÜ'W7îñÁFW'f«2íÚ'W7îñÁFW'f«2¢µ“ê¢Ê÷áÇ”‚á≤7F'D÷ñ„¢ÁV÷&W"áÇÁ7F'D÷ñ‚í¬VÊD÷ñ„¢ÁV÷&W"áÇÊVÊD÷ñ‚í“íê¢Êfñ«FW"áÇ”‚ÁV÷&W"Êó4fñÊóFRáÇÁ7F'D÷ñ‚íbbÁV÷&W"Êó4fñÊóFRáÇÊVÊD÷ñ‚íbbÇÊVÊD÷ñ‚‚ÇÁ7F'D÷ñ‚íì∞†¢6ˆÁ7B˜WB“µ”∞¢∆WB7W'6˜"“vñÊF˜u7F'D÷ñ„∞¢f˜"Ü6ˆÁ7B"ˆb'W7íí∞¢6ˆÁ7B2“÷FÇÊ÷ÇávñÊF˜u7F'D÷ñ‚¬"Á7F'D÷ñ‚ì∞¢6ˆÁ7BR“÷FÇÊ÷ñ‚ávñÊF˜tVÊD÷ñ‚¬"ÊVÊD÷ñ‚ì∞¢ñbÜR√“vñÊF˜u7F'D÷ñ‚«¬2„“vñÊF˜tVÊD÷ñ‚í6ˆÁFñÁVS∞¢ñbá2‚7W'6˜"í˜WBÁW6Çá≤7F'D÷ñ„¢7W'6˜"¬VÊD÷ñ„¢2“ì∞¢7W'6˜"“÷FÇÊ÷ÇÜ7W'6˜"¬Rì∞¢–¢ñbÜ7W'6˜"¬vñÊF˜tVÊD÷ñ‚í˜WBÁW6Çá≤7F'D÷ñ„¢7W'6˜"¬VÊD÷ñ„¢vñÊF˜tVÊD÷ñ‚“ì∞¢&WGW&‚˜WC∞ß–†¶gVÊ7Fñˆ‚'Vñ∆E7F'DñÁFW'f«4f˜%vñÊF˜rÜ'W7î&∆ˆ6∑2¬vñÊF˜u7F'D÷ñ‚¬vñÊF˜tVÊD÷ñ‚¬GW&Fñˆ‰÷ñ‚ó∞¢ÚÚ&WGW&Á2ñÁFW'f«2ˆb5D%BFñ÷W2Ü÷ñÁWFW2ívÜW&R¶ˆ"6‚7F'B¬W6ñÊr6ˆÁ6W'fFófR'W7í&∆ˆ6∑2‡¢6ˆÁ7BB“÷FÇÊ÷ÇÉ¬ÁV÷&W"ÜGW&Fñˆ‰÷ñÁ«√íì∞¢ñbávñÊF˜tVÊD÷ñ‚√“vñÊF˜u7F'D÷ñ‚í&WGW&‚µ”∞†¢6ˆÁ7B'W7í“'Vñ∆D'W7îñÁFW'f«46ˆÁ6W'fFófRÜ'W7î&∆ˆ6∑2ì∞¢6ˆÁ7Bg&VR“'Vñ∆Dg&VTñÁFW'f«4f˜%vñÊF˜rÜ'W7í¬vñÊF˜u7F'D÷ñ‚¬vñÊF˜tVÊD÷ñ‚ì∞†¢6ˆÁ7B˜WB“µ”∞¢f˜"Ü6ˆÁ7Bbˆbg&VRó∞¢6ˆÁ7B∆FW7B“bÊVÊD÷ñ‚“C∞¢ñbÜ∆FW7B„“bÁ7F'D÷ñ‚ó∞¢˜WBÁW6Çá≤7F'D÷ñ„¢bÁ7F'D÷ñ‚¬VÊD÷ñ„¢∆FW7B“ì∞¢–¢–¢&WGW&‚˜WC∞ß–†¢ÚÚ)»R7V3¢∆∆˜r7F'FñÊrvóFÜñ‚TívñÊF˜rÉì£(	3É£íWfV‚ñbFÜR¶ˆ"VÊG2gFW"É£‡¢ÚÚ6ˆ◊WFR7F'F&∆R&ÊvW2'í6ÜV6∂ñÊr6ˆ∆∆ó6ñˆ‚vñÁ7B6ˆÁ6W'fFófR'W7íñÁFW'f«2ÜñÊ6«VFñÊr'VffW"ê¢ÚÚ7&˜72FÜRvÜˆ∆RFí¬Ê˜BßW7BvóFÜñ‚FÜRTívñÊF˜r‡¶gVÊ7Fñˆ‚'Vñ∆E7F'DñÁFW'f«4'î6ˆ∆∆ó6ñˆ‚Ü'W7î&∆ˆ6∑2¬Vï7F'D÷ñ‚¬VîVÊD÷ñ‚¬GW&Fñˆ‰÷ñ‚í∞¢6ˆÁ7BB“÷FÇÊ÷ÇÉ¬ÁV÷&W"ÜGW&Fñˆ‰÷ñ‚«¬íì∞¢ñbáVîVÊD÷ñ‚√“Vï7F'D÷ñ‚í&WGW&‚µ”∞¢6ˆÁ7B&∆ˆ6¥∆V‚“B≤E$dT≈Ù%TddU%Ù‘î„∞†¢ÚÚ6ˆÁfW'BFÚ6ˆÁ6W'fFófR'W7íñÁFW'f«2∑7F'B¬'W7îVÊBê¢6ˆÁ7B'W7í“'Vñ∆D'W7îñÁFW'f«46ˆÁ6W'fFófRÜ'W7î&∆ˆ6∑2ì∞†¢ÚÚf˜&&ñFFV‚7F'B&ÊvW2FW&ófVBg&ˆ“˜fW&∆6ˆÊFóFñˆ„†¢ÚÚÊWu7F'B¬ˆ∆DVÊBbbˆ∆E7F'B¬ÊWtVÊBvÜW&RÊWtVÊB“ÊWu7F'B≤&∆ˆ6¥∆V‡¢ÚÚ”‚ÊWu7F'Bñ‚Üˆ∆E7F'B“&∆ˆ6¥∆V‚¬ˆ∆DVÊBê¢6ˆÁ7Bf˜&&ñFFV‚“µ”∞¢f˜"Ü6ˆÁ7B"ˆb'W7íí∞¢6ˆÁ7B2“÷FÇÊf∆ˆ˜"Ü"Á7F'D÷ñ‚“&∆ˆ6¥∆V‚ì∞¢6ˆÁ7BR“÷FÇÊ6Vñ¬Ü"ÊVÊD÷ñ‚ì∞¢f˜&&ñFFV‚ÁW6Çá≤7F'D÷ñ„¢2¬VÊD÷ñ„¢R“ì∞¢–¢6ˆÁ7Bf˜&"“÷W&vT÷ñ‰ñÁFW'f«2Üf˜&&ñFFV‚ì∞†¢ÚÚ∆∆˜vVB“∑Vï7F'D÷ñ‚¬VîVÊD÷ñ‚í¬f˜&&ñFFV‡¢6ˆÁ7B∆∆˜vVB“µ”∞¢∆WB7W'6˜"“Vï7F'D÷ñ„∞¢f˜"Ü6ˆÁ7Bbˆbf˜&"í∞¢6ˆÁ7B2“÷FÇÊ÷ÇáVï7F'D÷ñ‚¬bÁ7F'D÷ñ‚ì∞¢6ˆÁ7BR“÷FÇÊ÷ñ‚áVîVÊD÷ñ‚¬bÊVÊD÷ñ‚ì∞¢ñbÜR√“Vï7F'D÷ñ‚«¬2„“VîVÊD÷ñ‚í6ˆÁFñÁVS∞¢ñbá2‚7W'6˜"í∆∆˜vVBÁW6Çá≤7F'D÷ñ„¢7W'6˜"¬VÊD÷ñ„¢2“ì∞¢7W'6˜"“÷FÇÊ÷ÇÜ7W'6˜"¬Rì∞¢–¢ñbÜ7W'6˜"¬VîVÊD÷ñ‚í∆∆˜vVBÁW6Çá≤7F'D÷ñ„¢7W'6˜"¬VÊD÷ñ„¢VîVÊD÷ñ‚“ì∞†¢ÚÚ6ˆÁfW'B∆∆˜vVBÜ∆b÷˜V‚ñÁFW'f«2FÚñÊ6«W6ófR˜WGWB&∆ˆ6∑2∆ñ∂RFÜRWÜó7FñÊr7vVWWáV7G2‡¢ÚÚvRv∆¬˜WGWB∑7F'B¬VÊE“ñÊ6«W6ófR÷ñÁWFW2f˜"w7F'Br÷ˆFR‡¢&WGW&‚∆∆˜vV@¢Ê÷Ü”‚á≤7F'D÷ñ„¢Á7F'D÷ñ‚¬VÊD÷ñ„¢÷FÇÊ÷ÇÜÁ7F'D÷ñ‚¬ÊVÊD÷ñ‚“í“íê¢Êfñ«FW"Ü”‚ÊVÊD÷ñ‚„“Á7F'D÷ñ‚ì∞ß–†¶gVÊ7Fñˆ‚Ê˜&÷∆ó¶T&Êv∂ˆ¥ó6ÚÜó6Úó∞¢6ˆÁ7BB“Ê˜&÷∆ó¶TˆñÁF÷VÁDFFWFñ÷RÜó6Úì∞¢ñbÇBí&WGW&‚rs∞¢ÚÚñbÊÚFñ÷W¶ˆÊR7VffóÇ¬77V÷R6ñÙ&Êv∂ˆ≤Ç≥s£íFÚfˆñBUD26ÜñgFñÊr'Vw2‡¢ÚÚ˜FñˆÊ¬6fWGíFˆvv∆S¢G&VBG&ñ∆ñÊru¢rÚr≥£r2&Êv∂ˆ≤v∆¬÷6∆ˆ6≤‡¢6ˆÁ7BE$TEı•Ù5Ù$¥µÙƒÙ4¬“VÁd&ˆˆ¬Ç$EıE$TEı•Ù5Ù$¥µÙƒÙ4¬"¬f«6Rì∞¢ñbÇÚÖß«ß≈≤≤’’∆E∆C•∆E∆BíBÚÁFW7BáBíí∞¢ñbÖE$TEı•Ù5Ù$¥µÙƒÙ4¬í∞¢ñbÇı∑••“BÚÁFW7BáBíí&WGW&‚BÁ&W∆6RÇı∑••“BÚ¬"≥s£"ì∞¢ñbÇı¬≥£BÚÁFW7BáBíí&WGW&‚BÁ&W∆6RÇı¬≥£BÚ¬"≥s£"ì∞¢–¢&WGW&‚C∞¢–¢&WGW&‚Gµ7G&ñÊráBíÁ&W∆6RÇı¬‚Ö∆G≥√7“íBÚ¬""ó“≥s£∞ß–†¶7ñÊ2gVÊ7Fñˆ‚6ÜV6µFV6Ñ6ˆ∆∆ó6ñˆ‚áW6W&Ê÷R¬7F'Dó6Ú¬GW&Fñˆ‰÷ñ‚¬ñvÊ˜&T¶ˆ$ñBí∞¢ÚÚ&WGW&Á2ÁV∆¬ñbg&VR¬V«6R&WGW&Á26ˆÊf∆ñ7BFWFñ¿¢6ˆÁ7Bó6Ú“Ê˜&÷∆ó¶T&Êv∂ˆ¥ó6Úá7F'Dó6Úì∞¢6ˆÁ7BFFU7G"“7G&ñÊrÜó6ÚíÁ6∆ñ6RÉ¬ì∞¢6ˆÁ7B7F'DFFR“ÊWrFFRÜó6Úì∞¢ñbÑÁV÷&W"Êó4Ê‚á7F'DFFRÊvWEFñ÷RÇííí&WGW&‚≤W'&˜#¢vñÁf∆ñEˆFFWFñ÷Rr”∞†¢6ˆÁ7B7F'D÷ñ‚“&Êv∂ˆ¥Ñ’FÙ÷ñ‰g&ˆ‘FFRá7F'DFFRì∞¢6ˆÁ7BB“÷FÇÊ÷ÇÉ¬ÁV÷&W"ÜGW&Fñˆ‰÷ñ‚«¬íì∞¢6ˆÁ7B'W7îVÊD÷ñ‚“7F'D÷ñ‚≤B≤E$dT≈Ù%TddU%Ù‘î„∞†¢ÚÚî’ı%DÂBÑï55TRì¢6ˆ∆∆ó6ñˆ‚â^òûäﬁà~ä.ãnâBGW&Fñˆ‚â^òéäﬁàNâíáW"◊FV6Çíàéã.à¶ˆ%ˆóFV◊2â~ã^òÇ76ñv‚ò>äæòûàÆòéã.à~àNâûâûãòûâê¢ÚÚòä^ä.â^òûäﬁà~ò>àÆòí∆ó7D'W7î&∆ˆ6∑4f˜%FV6Ñˆ‰FFRÇíàæãnòéà~àNã>âûä~â2W"◊FV6ÇGW&Fñˆ‚òâÆâ¢fñ¬÷˜V‚òä^òûäp¢6ˆÁ7B&∆ˆ6∑2“vóB∆ó7D'W7î&∆ˆ6∑4f˜%FV6Ñˆ‰FFRáW6W&Ê÷R¬FFU7G"¬ñvÊ˜&T¶ˆ$ñBì∞†¢f˜"Ü6ˆÁ7B"ˆb&∆ˆ6∑2í∞¢6ˆÁ7Bˆ∆E7F'B“"Á7F'D÷ñ„∞¢6ˆÁ7Bˆ∆D'W7îVÊB“"Ê'W7îVÊD÷ñ„∞¢ñbá7F'D÷ñ‚¬ˆ∆D'W7îVÊBbbˆ∆E7F'B¬'W7îVÊD÷ñ‚í∞¢6ˆÁ7BFWFñ¬“∞¢6ˆÊf∆ñ7Eˆ¶ˆ%ˆñC¢"Ê¶ˆ%ˆñB¿¢W6W&Ê÷R¿¢FFS¢FFU7G"¿¢ÊWu˜&ÊvS¢≤7F'C¢f◊DÑÑ‘‘g&ˆ‘÷ñ‚á7F'D÷ñ‚í¬'W7ïˆVÊC¢f◊DÑÑ‘‘g&ˆ‘÷ñ‚Ü'W7îVÊD÷ñ‚í“¿¢ˆ∆E˜&ÊvS¢≤7F'C¢f◊DÑÑ‘‘g&ˆ‘÷ñ‚Üˆ∆E7F'Bí¬'W7ïˆVÊC¢f◊DÑÑ‘‘g&ˆ‘÷ñ‚Üˆ∆D'W7îVÊBí“¿¢”∞¢f∆ˆrÇu∂6ˆ∆∆ó6ñˆÂ“r¬FWFñ¬ì∞¢&WGW&‚FWFñ√∞¢–¢–¢&WGW&‚ÁV∆√∞ß–†¶7ñÊ2gVÊ7Fñˆ‚ó5FV6Ñg&VRáW6W&Ê÷R¬7F'Dó6Ú¬GW&Fñˆ‰÷ñ‚¬ñvÊ˜&T¶ˆ$ñBí∞¢6ˆÁ7B6ˆÊf∆ñ7B“vóB6ÜV6µFV6Ñ6ˆ∆∆ó6ñˆ‚áW6W&Ê÷R¬7F'Dó6Ú¬GW&Fñˆ‰÷ñ‚¬ñvÊ˜&T¶ˆ$ñBì∞¢&WGW&‚6ˆÊf∆ñ7C∞ß–†¶gVÊ7Fñˆ‚áGGCî6ˆÊf∆ñ7Bá&W2¬6ˆÊf∆ñ7Bó∞¢&WGW&‚&W2Á7FGW2ÉCííÊß6ˆ‚á∞¢W'&˜#¢.àÆòéã.à~òNäòéä~òéã.à~àÆòéä~à~òä~ä^ã.âûã^òí"¿¢6ˆÊf∆ñ7C¢6ˆÊf∆ñ7B«¬ÁV∆¬¿¢“ì∞ß–†¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	˘+"&ñ6ñÊr≤GW&Fñˆ‚&WfñWráV&∆ñ2ê¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶gVÊ7Fñˆ‚V&∆ñ47W7Fˆ÷W$fñ∆&ñ∆óGîFW2ÜF"“ˆˆ¬í∞¢&WGW&‚∞¢ˆˆ√¢F"¿¢F"¿¢∆ó7EFV6ÜÊñ6ñÁ4'ïGóR¿¢'Vñ∆Dˆfd÷f˜$FFR¿¢ó5FV6Ñˆfdˆ‰FFR¿¢'Vñ∆EFV6ÖvñÊF˜w4÷ñ‚¿¢∆ó7D'W7î&∆ˆ6∑4f˜%FV6Ñˆ‰FFR¿¢'Vñ∆D'W7îñÁFW'f«46ˆÁ6W'fFófR¿¢'Vñ∆Dg&VTñÁFW'f«4f˜%vñÊF˜r¿¢'Vñ∆E7F'DñÁFW'f«4'î6ˆ∆∆ó6ñˆ‚¿¢ó5FV6Ñg&VR¿¢FÙ÷ñ‚¿¢÷ñÂFÙÑÑ‘“¿¢f◊DÑÑ‘‘g&ˆ‘÷ñ‚¿¢vWDÊ˜t&Êv∂ˆµ'G2¿¢G&fVƒ'VffW$÷ñ„¢E$dT≈Ù%TddU%Ù‘î‚¿¢”∞ß–†¶Á˜7BÇ"˜V&∆ñ2˜&ñ6ñÊu˜&WfñWr"¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7Bñ∆ˆB“&WÊ&ˆGí«¬∑”∞¢ÚÚ5tb7V3¢&ñ6ñÊr&WfñWr6Ü˜V∆B÷F6Ç6ˆÁ6W'fFófR66ÜVGV∆RGW&Fñˆ‡¢6ˆÁ7BFñ÷ñÊr“¶ˆ%Fñ÷ñÊrÊ6ˆ◊WFT¶ˆ%Fñ÷ñÊráñ∆ˆB¬≤6˜W&6S¢'&ñ6ñÊu˜&WfñWr"¬6ˆÁ6W'fFófS¢G'VR“ì∞¢6ˆÁ7BGW&FñˆÂˆ÷ñ‚“ÁV÷&W"áFñ÷ñÊrÁ6W'fñ6UˆGW&FñˆÂˆ÷ñ‚«¬ì∞¢ñbÜGW&FñˆÂˆ÷ñ‚√“í&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.à~ã.âûâæä>ãòäâ~âûã^òûâ^òûäﬁà~ò>äæòûòäﬁâNäãNâûàã>äæâûâNòä~ä^ã"ÜGW&Fñˆ‚í"“ì∞¢6ˆÁ7B7W7Fˆ÷W%&ñ6R“vóB7W7Fˆ÷W%&ñ6ñÊtÜV«W'2Á&W6ˆ«fT7W7Fˆ÷W%&ñ6ñÊt◊V«Fíáñ∆ˆB¬ˆˆ¬ì∞¢6ˆÁ7B7FÊF&E˜&ñ6R“ÁV÷&W"Ü7W7Fˆ÷W%&ñ6RÊ7FófU˜&ñ6RÛÚ7W7Fˆ÷W%&ñ6RÁ7FÊF&E˜&ñ6RÛÚì∞†¢ÚÚ7W7Fˆ÷W"&ˆ÷ÚWFÚ÷«íá&WfñWrê¢6ˆÁ7B&ˆ÷ıñ6≤“vóBfñÊD&W7D7W7Fˆ÷W%&ˆ÷˜Fñˆ‚áñ∆ˆB¬7FÊF&E˜&ñ6R¬ˆˆ¬ì∞¢6ˆÁ7B&ˆ÷Ú“&ˆ÷ıñ6≥ÚÁ&ˆ÷Ú«¬ÁV∆√∞¢6ˆÁ7B&ˆ÷ıˆFó66˜VÁB“ÁV÷&W"á&ˆ÷ıñ6≥ÚÊFó66˜VÁB«¬ì∞¢6ˆÁ7BF˜F≈ˆgFW%ˆFó66˜VÁB“÷FÇÊ÷ÇÉ¬ÁV÷&W"á7FÊF&E˜&ñ6R«¬í“÷FÇÊ÷ñ‚ÑÁV÷&W"á7FÊF&E˜&ñ6R«¬í¬&ˆ÷ıˆFó66˜VÁBíì∞¢&W2Êß6ˆ‚á∞¢7FÊF&E˜&ñ6R¿¢Ê˜&÷≈˜&ñ6S¢ÁV÷&W"Ü7W7Fˆ÷W%&ñ6RÊÊ˜&÷≈˜&ñ6RÛÚ7FÊF&E˜&ñ6Rí¿¢7FófU˜&ñ6S¢ÁV÷&W"Ü7W7Fˆ÷W%&ñ6RÊ7FófU˜&ñ6RÛÚ7FÊF&E˜&ñ6Rí¿¢7W7Fˆ÷W%˜&ñ6Uˆ∆&V√¢7W7Fˆ÷W%&ñ6RÊ∆&V¬«¬ÁV∆¬¿¢6◊ñvÂˆÊ÷S¢7W7Fˆ÷W%&ñ6RÊ6◊ñvÂˆÊ÷R«¬ÁV∆¬¿¢7W7Fˆ÷W%˜&ñ6U˜6˜W&6S¢7W7Fˆ÷W%&ñ6RÁ6˜W&6R«¬&f∆∆&6µ˜&ñ6ñÊuˆß2"¿¢&ñ6Uˆ∆ñÊW3¢7W7Fˆ÷W%&ñ6RÊ∆ñÊW2«¬µ“¿¢&ˆ÷Û¢&ˆ÷ÚÚ∞¢&ˆ÷ıˆñC¢&ˆ÷ÚÁ&ˆ÷ıˆñB¿¢&ˆ÷ıˆÊ÷S¢&ˆ÷ÚÁ&ˆ÷ıˆÊ÷R¿¢&ˆ÷ı˜GóS¢&ˆ÷ÚÁ&ˆ÷ı˜GóR¿¢&ˆ÷ı˜f«VS¢&ˆ÷ÚÁ&ˆ÷ı˜f«VR¿¢Fó66˜VÁC¢&ˆ÷ıˆFó66˜VÁB¿¢F˜F≈ˆgFW%ˆFó66˜VÁB¿¢“¢ÁV∆¬¿¢GW&FñˆÂˆ÷ñ‚¿¢6W'fñ6UˆGW&FñˆÂˆ÷ñ„¢GW&FñˆÂˆ÷ñ‚¿¢G&fV≈ˆ'VffW%ˆ÷ñ„¢Fñ÷ñÊrÁGW&Ê&˜VÊEˆ'VffW%ˆ÷ñ‚¿¢GW&Ê&˜VÊEˆ'VffW%ˆ÷ñ„¢Fñ÷ñÊrÁGW&Ê&˜VÊEˆ'VffW%ˆ÷ñ‚¿¢VffV7FófUˆ&∆ˆ6µˆ÷ñ„¢Fñ÷ñÊrÊˆ67WñVEˆGW&FñˆÂˆ÷ñ‚¿¢ˆ67WñVEˆGW&FñˆÂˆ÷ñ„¢Fñ÷ñÊrÊˆ67WñVEˆGW&FñˆÂˆ÷ñ‚¿¢Fñ÷ñÊuˆ'&V∂F˜v„¢Fñ÷ñÊrÊ'&V∂F˜v‚¿¢“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.àNã>âûä~â>ä>ã.àNã.òNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞††¢ÚÚfñ∆&ñ∆óGí&˜WFRFFW'2˜v‚&WVW7B'6ñÊrÊB&W7ˆÁ6R6W&ñ∆ó¶Fñˆ„∞¢ÚÚFÜR6Ü&VBVÊvñÊR˜vÁ2WfW'ífñ∆&ñ∆óGí6∆7V∆Fñˆ‚FÇ‡ß&Vvó7FW%V&∆ñ47W7Fˆ÷W$fñ∆&ñ∆óGï&˜WFW2Ü¬∞¢vWDFWVÊFVÊ6ñW3¢V&∆ñ47W7Fˆ÷W$fñ∆&ñ∆óGîFW2¿¢ó4VÊ&∆VC¢Çí”‚T‰$ƒUÙdîƒ$îƒïEïıc"¿¢vWD&Êv∂ˆµFˆFïî‘B¿ß“ì∞ß&Vvó7FW$F÷ñ‰fñ∆&ñ∆óGï&˜WFW2Ü¬∞¢vWDFWVÊFVÊ6ñW3¢V&∆ñ47W7Fˆ÷W$fñ∆&ñ∆óGîFW2¿¢ó4VÊ&∆VC¢Çí”‚T‰$ƒUÙdîƒ$îƒïEïıc"¿¢&WVó&TF÷ñÂ6W76ñˆ‚¿ß“ì∞†ß&Vvó7FW%V&∆ñ47W7Fˆ÷W$&ˆˆ∂ñÊu&˜WFW2Ü¬∞¢6W'fñ6S¢&ˆˆ∂ñÊt¶ˆ%6W'fñ6R¿¢V˜FU6W'fñ6S¢7&VFT7W7Fˆ÷W$6F∆ˆuV˜FU6W'fñ6Rá∞¢ˆˆ¬¿¢7&VFU6W'fñ6U6∂vU&W6ˆ«fW#¢ÜF"í”‚7&VFU6W'fñ6U6∂vU&W6ˆ«fW"á≤F"“í¿¢6ˆ◊WFTGW&Fñˆ‰÷ñ‰◊V«Fí¿¢“í¿ß“ì∞ß&Vvó7FW%V&∆ñ56W'fñ6U6∂vU&˜WFW2Ü¬∞¢6W'fñ6S¢7&VFUV&∆ñ56W'fñ6U6∂vU6W'fñ6Rá≤&W6ˆ«fW#¢7&VFU6W'fñ6U6∂vU&W6ˆ«fW"á≤F#¢ˆˆ¬“í“í¿ß“ì∞††††¢ÚÚR&VB÷ˆÊ«í7FGW2∆ˆˆ∑Wf˜"FÜR7W7Fˆ÷W"vóFñÊr&ˆˆ“‚◊W7BÊWfW ¢ÚÚ◊WFFR¶ˆ%ˆˆffW'2ˆ¶ˆ'2ÊB◊W7BÊWfW"∆V≤¶ˆ%ˆñB¬FV6ÜÊñ6ñ‚ñFVÁFóGí¿¢ÚÚˆffW"6˜VÁG2¬˜"F÷ñ‚˜¶ˆÊRñÁFW&Ê«2““FÜR&W7ˆÁ6R6ÜR&V∆˜ró2FÜP¢ÚÚgV∆¬6ˆÁG&7B‡¶ÊvWBÇ"˜V&∆ñ2˜W&vVÁB◊7FGW2"¬7ñÊ2á&W¬&W2í”‚∞¢&W2Á6WBÇ$66ÜR‘6ˆÁG&ˆ¬"¬&ÊÚ◊7F˜&R¬ÊÚ÷66ÜR¬◊W7B◊&Wf∆ñFFR¬÷Ç÷vS”"ì∞¢&W2Á6WBÇ%&v÷"¬&ÊÚ÷66ÜR"ì∞¢&W2Á6WBÇ$Wáó&W2"¬#"ì∞¢ÚÚ'VFvWBfóG2FÜRvóFñÊr&ˆˆ“w22ˆ∆∆ñÊrvóFÇÜVG&ˆˆ“¬vÜñ∆R7Fñ∆¿¢ÚÚ&∆ˆ6∂ñÊr'V∆≤6ˆFRwVW76ñÊr‡¢6ˆÁ7BW&vVÁE&FR“V&∆ñ5W&vVÁE7FGW5&FT∆ñ÷óFW"Ê6ÜV6≤áG&6∂ñÊu&óf7íÊ6∆ñVÁDó∂Wíá&Wíì∞¢ñbÇW&vVÁE&FRÊ∆∆˜vVBí∞¢&WGW&‚&W2Á7FGW2ÉC#ííÊß6ˆ‚á∞¢W'&˜#¢.òä>ã^ä.àâNãûäÆânã.âûãânã^òéòàãNâûòNâ≤àä>ãéâ>ã.ä>äﬁäÆãààNä>ãûòéòä^òûä~ä^äﬁà~ò>äæäòÇ"¿¢6ˆFS¢%$DUÙƒî‘ïDTB"¿¢&WG'ïˆgFW%˜3¢W&vVÁE&FRÁ&WG'ïˆgFW%˜2¿¢“ì∞¢–¢6ˆÁ7B“7G&ñÊrá&WÁVW'íÁFˆ∂V‚«¬&WÁVW'íÁ«¬&WÁVW'íÊ&ˆˆ∂ñÊuˆ6ˆFR«¬""íÁG&ñ“Çì∞¢ñbÇí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢&÷ó76ñÊrG&6∂ñÊr6ˆFR"“ì∞¢G'í∞¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢ ¢4TƒT5B¶ˆ%ˆñB¬&ˆˆ∂ñÊuˆ6ˆFR¬&ˆˆ∂ñÊu˜Fˆ∂V‚¬¶ˆ%˜7FGW2¬&ˆˆ∂ñÊuˆ÷ˆFR¿¢FV6ÜÊñ6ñÂ˜W6W&Ê÷R¬FV6ÜÊñ6ñÂ˜FV“¿¢G&fV≈˜7F'FVEˆB¬6ÜV6∂ñÂˆB¬7F'FVEˆB¬fñÊó6ÜVEˆB¬6Ê6V∆VEˆB¿¢4ÙƒU44RÜ∆∆˜u˜Fñ÷U˜&˜˜6¬ƒd≈4Rí2∆∆˜u˜Fñ÷U˜&˜˜6¿¢e$Ù“V&∆ñ2Ê¶ˆ'0¢tÑU$R&ˆˆ∂ñÊu˜Fˆ∂V„“Cı"&ˆˆ∂ñÊuˆ6ˆFS“C¢ƒî‘ïB¢¿¢∑–¢ì∞¢6ˆÁ7B¶ˆ"“"Á&˜w5≥”∞¢ñbÇ¶ˆ"í&WGW&‚&W2Á7FGW2ÉCBíÊß6ˆ‚á≤W'&˜#¢&Ê˜Bf˜VÊB"“ì∞¢ñbÖ7G&ñÊrÜ¶ˆ"Ê&ˆˆ∂ñÊuˆ÷ˆFR«¬""íÁFÙ∆˜vW$66RÇí”“'W&vVÁB"í∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢&Ê˜BW&vVÁB&ˆˆ∂ñÊr"“ì∞¢–¢6ˆÁ7BˆffW%"“vóBˆˆ¬ÁVW'íÄ¢ ¢4TƒT5B‘î‚ÜWáó&W5ˆBídî≈DU"ÖtÑU$R7FGW3“wVÊFñÊrr‰BWáó&W5ˆB„“‰ırÇíí2ÊWáEˆˆffW%ˆWáó&W5ˆB¿¢$ÙÙ≈Ùı"á7FGW3“wVÊFñÊrr‰BWáó&W5ˆB„“‰ırÇíí2Ü5˜VÊFñÊuˆˆffW"¿¢$ÙÙ≈Ùı"á7FGW3“v66WFVBrí2Ü5ˆ66WFVEˆˆffW ¢e$Ù“V&∆ñ2Ê¶ˆ%ˆˆffW'0¢tÑU$R¶ˆ%ˆñC“C¢¿¢∂¶ˆ"Ê¶ˆ%ˆñE–¢ì∞¢6ˆÁ7BˆffW'2“ˆffW%"Á&˜w5≥“«¬∑”∞¢6ˆÁ7BÜ466WFVB“&ˆˆ∆V‚Ü¶ˆ"ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R«¬¶ˆ"ÁFV6ÜÊñ6ñÂ˜FV“«¬ˆffW'2ÊÜ5ˆ66WFVEˆˆffW"ì∞¢6ˆÁ7BÜ5VÊFñÊr“&ˆˆ∆V‚ÜˆffW'2ÊÜ5˜VÊFñÊuˆˆffW"ì∞¢6ˆÁ7BFW&÷ñÊ¬“≤.òäÆä>ò~àéòä^òûär"¬.ä.àòä^ãNà%“ÊñÊ6«VFW2Ö7G&ñÊrÜ¶ˆ"Ê¶ˆ%˜7FGW2«¬""íì∞¢6ˆÁ7BÜ4WÜ7EFˆ∂V‚“&ˆˆ∆V‚Ü¶ˆ"Ê&ˆˆ∂ñÊu˜Fˆ∂V‚íbb””“7G&ñÊrÜ¶ˆ"Ê&ˆˆ∂ñÊu˜Fˆ∂V‚ì∞¢6ˆÁ7B6‰6Ê6V¬“Ü4WÜ7EFˆ∂V‡¢bbFW&÷ñÊ¿¢bb¶ˆ"Ê6Ê6V∆VEˆ@¢bb¶ˆ"ÁG&fV≈˜7F'FVEˆ@¢bb¶ˆ"Ê6ÜV6∂ñÂˆ@¢bb¶ˆ"Á7F'FVEˆ@¢bb¶ˆ"ÊfñÊó6ÜVEˆC∞¢6ˆÁ7BÜ6R“FW&÷ñÊ¿¢Ú'FW&÷ñÊ¬ ¢¢Ü466WFV@¢Ú&76ñvÊVB ¢¢Ü5VÊFñÊp¢Ú'6V&6ÜñÊr ¢¢&f∆∆&6≤#∞¢&WGW&‚&W2Êß6ˆ‚á∞¢7V66W73¢G'VR¿¢&ˆˆ∂ñÊuˆ6ˆFS¢¶ˆ"Ê&ˆˆ∂ñÊuˆ6ˆFR«¬ÁV∆¬¿¢Ü6R¿¢6ˆÊfó&÷VC¢Ü466WFVB¿¢FW&÷ñÊ¬¿¢6Âˆ6Ê6V√¢6‰6Ê6V¬¿¢6W'fW%ˆÊ˜s¢¶ˆ%Fñ÷ñÊrÊvWD&Êv∂ˆ¥Ê˜rÇíÊó6Ú¿¢∆∆˜u˜Fñ÷U˜&˜˜6√¢&ˆˆ∆V‚Ü¶ˆ"Ê∆∆˜u˜Fñ÷U˜&˜˜6¬í¿¢“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Ç$tUB˜V&∆ñ2˜W&vVÁB◊7FGW2W'&˜#¢"¬Rì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢'W&vVÁB7FGW2fñ∆VB"“ì∞¢–ß“ì∞†¶ÊvWBÇ"˜V&∆ñ2˜G&6≤"¬V&∆ñ5G&6¥ÜÊF∆W"ì∞¶Á˜7BÇ"˜V&∆ñ2˜G&6≤˜6V∆V7B"¬V&∆ñ5G&6¥ÜÊF∆W"ì∞†¶7ñÊ2gVÊ7Fñˆ‚V&∆ñ5G&6¥ÜÊF∆W"á&W¬&W2í∞¢&W2Á6WBÇ$66ÜR‘6ˆÁG&ˆ¬"¬&ÊÚ◊7F˜&R¬ÊÚ÷66ÜR¬◊W7B◊&Wf∆ñFFR¬÷Ç÷vS”"ì∞¢&W2Á6WBÇ%&v÷"¬&ÊÚ÷66ÜR"ì∞¢&W2Á6WBÇ$Wáó&W2"¬#"ì∞¢ÚÚÁFí÷VÁV÷W&Fñˆ„¢&ˆˆ∂ñÊr6ˆFW2&R6Ü˜'C≤vóFÜ˜WB'VFvWB‚GF6∂W ¢ÚÚ6˜V∆B7vVWFÜR∂Wó76R‚&V¬7W7Fˆ÷W'2FÚÜÊFgV¬ˆb∆ˆˆ∑W2÷ñÁWFR‡¢6ˆÁ7BG&6µ&FR“V&∆ñ5G&6µ&FT∆ñ÷óFW"Ê6ÜV6≤áG&6∂ñÊu&óf7íÊ6∆ñVÁDó∂Wíá&Wíì∞¢ñbÇG&6µ&FRÊ∆∆˜vVBí∞¢&WGW&‚&W2Á7FGW2ÉC#ííÊß6ˆ‚á∞¢W'&˜#¢.òä>ã^ä.àâNãûäÆânã.âûãânã^òéòàãNâûòNâ≤àä>ãéâ>ã.ä>äﬁäÆãààNä>ãûòéòä^òûä~ä^äﬁà~ò>äæäòÇ"¿¢6ˆFS¢%$DUÙƒî‘ïDTB"¿¢&WG'ïˆgFW%˜3¢G&6µ&FRÁ&WG'ïˆgFW%˜2¿¢“ì∞¢–¢6ˆÁ7B6V∆V7FñˆÂ&VfW&VÊ6R“7G&ñÊrá&WÊ&ˆGìÚÁ6V∆V7FñˆÂ˜&Vb«¬""íÁG&ñ“Çì∞¢6ˆÁ7B6V∆V7Fñˆ‚“6V∆V7FñˆÂ&VfW&VÊ6P¢ÚG&6∂ñÊu&óf7íÁfW&ñgïG&6∂ñÊu6V∆V7FñˆÂ&VfW&VÊ6Rá6V∆V7FñˆÂ&VfW&VÊ6R¬vWDßwE6V7&WBÇíê¢¢ÁV∆√∞¢ñbá6V∆V7FñˆÂ&VfW&VÊ6Rbb6V∆V7Fñˆ‚í&WGW&‚&W2Á7FGW2ÉCBíÊß6ˆ‚á≤W'&˜#¢.òNäòéâÓâÆà~ã.âí"“ì∞¢6ˆÁ7B&uVW'í“á&WÁVW'íÁ«¬&WÁVW'íÁFˆ∂V‚«¬&WÁVW'íÊ&ˆˆ∂ñÊuˆ6ˆFR«¬""íÁFı7G&ñÊrÇíÁG&ñ“Çì∞¢ÚÚ&ˆˆ∂ñÊr6ˆFW2&R66R÷ñÁ6VÁ6óFófRf˜"7W7Fˆ÷W"ñÁWB‚Fˆ∂V‚66ñÊró0¢ÚÚ&ófFRÊB6ñvÊñfñ6ÁB¬6ÚˆÊ«íÊ˜&÷∆ó¶Rf«VRvóFÇFÜRWÜ7B6ˆFR6ÜR‡¢6ˆÁ7Bó4&ˆˆ∂ñÊt6ˆFUVW'í“ı‰5te¥’£”ï◊≥w“BˆíÁFW7Bá&uVW'íì∞¢6ˆÁ7B“ó4&ˆˆ∂ñÊt6ˆFUVW'íÚ&uVW'íÁFıWW$66RÇí¢&uVW'ì∞¢ñbÇbb6V∆V7Fñˆ‚í&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.â^òûäﬁà~ä>ãâÆãéà.òûäﬁäãûä^àNòûâûäæã""“ì∞†¢G'í∞¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢ ¢4TƒT5@¢¢Ê¶ˆ%ˆñB¬¢Ê&ˆˆ∂ñÊuˆ6ˆFR¬¢Ê&ˆˆ∂ñÊu˜Fˆ∂V‚¿¢¢Ê7W7Fˆ÷W%ˆÊ÷R¬¢Ê7W7Fˆ÷W%˜ÜˆÊR¬¢Ê¶ˆ%˜GóR¿¢¢ÊˆñÁF÷VÁEˆFFWFñ÷R¬¢Ê¶ˆ%˜7FGW2¬¢Ê&ˆˆ∂ñÊuˆ÷ˆFR¬¢ÊFó7F6Öˆ÷ˆFR¿¢¢ÊGW&FñˆÂˆ÷ñ‚¬¢Ê¶ˆ%˜&ñ6R¬¢Áñ÷VÁE˜7FGW2¬¢ÁñEˆB¬¢Ê7&VFVEˆB¿¢¢ÊFG&W75˜FWáB¬¢Êw5ˆ∆FóGVFR¬¢Êw5ˆ∆ˆÊvóGVFR¬¢Ê÷5˜W&¬¬¢Ê¶ˆ%˜¶ˆÊR¿¢¢ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬¢ÁFV6ÜÊñ6ñÂ˜FV“¿¢¢ÁG&fV≈˜7F'FVEˆB¬¢Ê6ÜV6∂ñÂˆB¬¢Á7F'FVEˆB¬¢ÊfñÊó6ÜVEˆB¬¢Ê6Ê6V∆VEˆB¬¢Ê6Ê6V≈˜&V6ˆ‚¿¢¢ÁFV6ÜÊñ6ñÂˆÊ˜FR¿¢¢Ê7W7Fˆ÷W%˜&FñÊr¬¢Ê7W7Fˆ÷W%˜&WfñWr¬¢Ê7W7Fˆ÷W%ˆ6ˆ◊∆ñÁB¬¢Á&WfñWvVEˆB¿¢GÊgV∆≈ˆÊ÷R2FV6ÖˆÊ÷R¬GÁÜ˜Fı˜FÇ2FV6Ö˜Ü˜FÚ¬GÁ&Êµˆ∆WfV¬2FV6Ö˜&Êµˆ∆WfV¬¬GÁ&Êµˆ∂Wí2FV6Ö˜&Êµˆ∂Wí¬GÁ&FñÊr¬GÊw&FR¬GÁÜˆÊR2FV6Ö˜ÜˆÊP¢e$Ù“V&∆ñ2Ê¶ˆ'2†¢ƒTeB§Ùî‚V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W2GÙ‚GÁW6W&Ê÷R“¢ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷P¢tÑU$RG∑6V∆V7Fñˆ‚Ú&¢Ê¶ˆ%ˆñC“C"¢ó4&ˆˆ∂ñÊt6ˆFUVW'íÚ&¢Ê&ˆˆ∂ñÊuˆ6ˆFS“C"¢&¢Ê&ˆˆ∂ñÊu˜Fˆ∂V„“C'–¢ƒî‘ïB ¢¿¢∑6V∆V7Fñˆ‚Ú6V∆V7Fñˆ‚Ê¶ˆ%ˆñB¢–¢ì∞†¢ñbá"Á&˜w2Ê∆VÊwFÇ””“«¬Üó4&ˆˆ∂ñÊt6ˆFUVW'íbb"Á&˜w2Ê∆VÊwFÇ”“íí∞¢&WGW&‚&W2Á7FGW2ÉCBíÊß6ˆ‚á≤W'&˜#¢.òNäòéâÓâÆà~ã.âí"“ì∞¢–†¢6ˆÁ7B&˜r“"Á&˜w5≥”∞¢6ˆÁ7B˜&ñvñ‚“G∑&WÁ&˜Fˆ6ˆ«”¢ÚÚG∑&WÊvWBÇ&Ü˜7B"ó÷∞†¢∆WB6W'fñ6TóFV◊2“µ”∞¢G'í∞¢6ˆÁ7BóFV’"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BóFV’ˆÊ÷R¬Gí¬VÊóE˜&ñ6R¬∆ñÊU˜F˜F¿¢e$Ù“V&∆ñ2Ê¶ˆ%ˆóFV◊0¢tÑU$R¶ˆ%ˆñC“C¢ı$DU"%í¶ˆ%ˆóFV’ˆñB46¿¢∑&˜rÊ¶ˆ%ˆñE–¢ì∞¢6W'fñ6TóFV◊2“óFV’"Á&˜w2«¬µ”∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÁv&‚Ç%∑V&∆ñ5˜G&6µˆóFV◊5“∆ˆBfñ∆VB"¬≤¶ˆ%ˆñC¢&˜rÊ¶ˆ%ˆñB¬W'&˜#¢RÊ÷W76vR“ì∞¢–†¢ÚÚ)»Rä>ãûâ≤˛äæäã.ä.òäæâ^ãÇòäÆâNà~òàûâÓã.ãäæä^ãà~âæãNâNà~ã.âê¢6ˆÁ7Bó4FˆÊR“7G&ñÊrá&˜rÊ¶ˆ%˜7FGW2«¬""íÁG&ñ“Çí””“.òäÆä>ò~àéòä^òûär#∞†¢ÚÚ)»Ràãâûä^ãûààNòûã.äÆãâÆäÆâì¢äÆânã.âûã.â^ã^àä^ãâ¢"òâæò~âûäÆânã.âûãäã.ä.ò>âíéò>äæòûä^ãûààNòûã.òäæò~âûòâæò~âûä>äﬁâNã>òâûãNâûàã.ä2ê¢6ˆÁ7B&u7FGW2“7G&ñÊrá&˜rÊ¶ˆ%˜7FGW2«¬""íÁG&ñ“Çì∞¢6ˆÁ7BV&∆ñ57FGW2“á&u7FGW2””“.â^ã^àä^ãâ¢"«¬&u7FGW2””“.à~ã.âûòàòûòNà""íÚ.ä>äﬁâNã>òâûãNâûàã.ä2"¢&u7FGW3∞¢6ˆÁ7B6Â6Ü˜uV&∆ñ5FV6ÜÊñ6ñ‚“≤~ä>äﬁâ^ä>ä~àéäÆäﬁâ¢r¬wVÊFñÊu˜&WfñWru“ÊñÊ6«VFW2á&u7FGW2ì∞†¢∆WBÜ˜F˜2“µ”∞¢ñbÜó4FˆÊRí∞¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BÜ˜FıˆñB¬Ü6R¬7&VFVEˆB¬W∆ˆFVEˆB¬V&∆ñ5˜W&¿¢e$Ù“V&∆ñ2Ê¶ˆ%˜Ü˜F˜0¢tÑU$R¶ˆ%ˆñC“C‰BV&∆ñ5˜W&¬ï2‰ıBÂTƒ¿¢ı$DU"%íÜ˜FıˆñB46¿¢∑&˜rÊ¶ˆ%ˆñE–¢ì∞¢Ü˜F˜2“"Á&˜w2«¬µ”∞¢–†¢ÚÚ6W&FR¬FFóFñˆÊ¬7W&f6Rg&ˆ“FÜRFV6ÜÊñ6ñ‚&WfñWr&∆ˆ6≤&V∆˜p¢ÚÚÜ¶ˆ'2Ê7W7Fˆ÷W%˜&FñÊrˆ7W7Fˆ÷W%˜&WfñWr≤FV6ÜÊñ6ñÂ˜&WfñWw2¬VÁF˜V6ÜVBí‡¢ÚÚ&FW2FÜR6F∆ˆróFV“˜6W'fñ6RfñV&∆ñ2Ê6F∆ˆuˆóFV’˜&WfñWw2¬W6ñÊp¢ÚÚFÜR¶ˆ"w2˜v‚G&6∂ñÊrˆ&ˆˆ∂ñÊrFˆ∂V‚f˜"WFÜ˜&ó¶Fñˆ‚““ÊWfW ¢ÚÚ&WVó&W27W7Fˆ÷W"∆ˆvñ‚‚6VR6W'fW"˜&˜WFW2ˆ6F∆ˆr˜&WfñWw2Êß0¢ÚÚÖı5B˜V&∆ñ2ˆ6F∆ˆr◊&WfñWw2íf˜"FÜR7GV¬7V&÷ó76ñˆ‚&˜WFR‡¢∆WB6F∆ˆu&WfñWr“ÁV∆√∞¢G'í∞¢6ˆÁ7BG&6∂ñÊu&WfñWu&VGí“vóB7&VFT6F∆ˆu&WfñWu&˜WFW2Êó5G&6∂ñÊu&WfñWu66ÜV÷&VGíáˆˆ¬ì∞¢ñbáG&6∂ñÊu&WfñWu&VGíí∞¢6ˆÁ7BWÜó7FñÊu"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5B&FñÊr¬6ˆ÷÷VÁB¬÷ˆFW&FñˆÂ˜7FGW2¬7&VFVEˆ@¢e$Ù“V&∆ñ2Ê6F∆ˆuˆóFV’˜&WfñWw2tÑU$R6ˆ◊∆WFVEˆ¶ˆ%ˆñB“C¿¢∑&˜rÊ¶ˆ%ˆñE–¢ì∞¢6ˆÁ7BWÜó7FñÊr“WÜó7FñÊu"Á&˜w5≥“«¬ÁV∆√∞¢6ˆÁ7BV∆ñvñ&∆R“7&VFT6F∆ˆu&WfñWu&˜WFW2Êó4¶ˆ%&WfñWtV∆ñvñ&∆Rá∞¢¶ˆ%˜7FGW3¢&u7FGW2¿¢6Ê6V∆VEˆC¢&˜rÊ6Ê6V∆VEˆB¿¢“ì∞¢6F∆ˆu&WfñWr“∞¢V∆ñvñ&∆S¢V∆ñvñ&∆RbbWÜó7FñÊr¿¢«&VGï˜&WfñWvVC¢&ˆˆ∆V‚ÜWÜó7FñÊrí¿¢&WfñWs¢WÜó7FñÊp¢Ú∞¢&FñÊs¢ÁV÷&W"ÜWÜó7FñÊrÁ&FñÊrí¿¢6ˆ÷÷VÁC¢WÜó7FñÊrÊ6ˆ÷÷VÁB«¬""¿¢÷ˆFW&FñˆÂ˜7FGW3¢WÜó7FñÊrÊ÷ˆFW&FñˆÂ˜7FGW2¿¢7&VFVEˆC¢WÜó7FñÊrÊ7&VFVEˆB¿¢–¢¢ÁV∆¬¿¢”∞¢–¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÁv&‚Ç%∑V&∆ñ5˜G&6µˆ6F∆ˆu˜&WfñWu“∆ˆBfñ∆VB"¬≤¶ˆ%ˆñC¢&˜rÊ¶ˆ%ˆñB¬W'&˜#¢RÊ÷W76vR“ì∞¢–†¢∆WBV&∆ñ5VÊóG2“µ”∞¢ñbÇó4FˆÊRí∞¢G'í∞¢6ˆÁ7BVÊóE"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BVÊóEˆÊÚ¬VÊóEˆ6ˆFR¬óFV’ˆÊ÷R¬5˜GóR¬v6Ö˜GóR¬'GR¬∆ˆ6FñˆÂˆ∆&V¿¢e$Ù“V&∆ñ2Ê¶ˆ%˜VÊóG0¢tÑU$R¶ˆ%ˆñC“C¢‰BƒıtU"Ñ4ÙƒU44RÑÂTƒƒîbá7FGW2¬rrí¬wVÊFñÊrríí‰ıBî‚Çv6Ê6V∆∆VBr¬w&V÷˜fVBr¬vFV∆WFVBr¬wfˆñBr¬vñÊ7FófRrê¢ı$DU"%íVÊóEˆÊÚ42¬VÊóEˆñB46¿¢∑&˜rÊ¶ˆ%ˆñE–¢ì∞¢V&∆ñ5VÊóG2“áVÊóE"Á&˜w2«¬µ“íÊ÷ÇáVÊóBí”‚á∞¢VÊóEˆÊÛ¢VÊóBÁVÊóEˆÊÚ¿¢VÊóEˆ6ˆFS¢VÊóBÁVÊóEˆ6ˆFR«¬ÁV∆¬¿¢∆&V√¢∂òàNä>ã~òéäﬁà~â~ã^òÇG∑VÊóBÁVÊóEˆÊÚ«¬"“'÷¬VÊóBÊ∆ˆ6FñˆÂˆ∆&V≈“Êfñ«FW"Ñ&ˆˆ∆V‚íÊ¶ˆñ‚Ç"Ú"í¿¢'GS¢VÊóBÊ'GR«¬ÁV∆¬¿¢5˜GóS¢VÊóBÊ5˜GóR«¬ÁV∆¬¿¢6W'fñ6U˜GóS¢VÊóBÁv6Ö˜GóR«¬VÊóBÊóFV’ˆÊ÷R«¬ÁV∆¬¿¢6ÜV6∂∆ó7E˜7V÷÷'ì¢ÁV∆¬¿¢Ü˜F˜3¢µ“¿¢“íì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÁv&‚Ç%∑V&∆ñ5˜G&6µ˜VÊóG5“&6ñ2∆ˆBfñ∆VB"¬≤¶ˆ%ˆñC¢&˜rÊ¶ˆ%ˆñB¬W'&˜#¢RÊ÷W76vR“ì∞¢–¢–¢ñbÜó4FˆÊRí∞¢G'í∞¢6ˆÁ7BVÊóG5"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BVÊóEˆñB¬VÊóEˆÊÚ¬VÊóEˆ6ˆFR¬óFV’ˆÊ÷R¬5˜GóR¬v6Ö˜GóR¬'GR¬∆ˆ6FñˆÂˆ∆&V¿¢e$Ù“V&∆ñ2Ê¶ˆ%˜VÊóG0¢tÑU$R¶ˆ%ˆñC“C¢‰BƒıtU"Ñ4ÙƒU44RÑÂTƒƒîbá7FGW2¬rrí¬wVÊFñÊrríí‰ıBî‚Çv6Ê6V∆∆VBr¬w&V÷˜fVBr¬vFV∆WFVBr¬wfˆñBr¬vñÊ7FófRrê¢ı$DU"%íVÊóEˆÊÚ42¬VÊóEˆñB46¿¢∑&˜rÊ¶ˆ%ˆñE–¢ì∞¢6ˆÁ7BVÊóE&˜w2“VÊóG5"Á&˜w2«¬µ”∞¢6ˆÁ7BVÊóDñG2“VÊóE&˜w2Ê÷ÇáRí”‚ÁV÷&W"áRÁVÊóEˆñBííÊfñ«FW"ÑÁV÷&W"Êó4fñÊóFRì∞¢6ˆÁ7BÜ˜F˜4'ïVÊóB“ÊWr÷Çì∞¢6ˆÁ7B6ÜV6∑4'ïVÊóB“ÊWr÷Çì∞†¢ñbáVÊóDñG2Ê∆VÊwFÇí∞¢6ˆÁ7BVÊóEÜ˜F˜5"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BÜ˜FıˆñB¬VÊóEˆñB¬Ü6R¬Ü˜Fıˆ6FVv˜'í¬7&VFVEˆB¬W∆ˆFVEˆB¬V&∆ñ5˜W&¿¢e$Ù“V&∆ñ2Ê¶ˆ%˜Ü˜F˜0¢tÑU$R¶ˆ%ˆñC“C¢‰BVÊóEˆñB“ÂíÇC#£¶&ñvñÁEµ“ê¢‰BFV∆WFVEˆBï2ÂTƒ¿¢‰B4ÙƒU44RáV&∆ñ5˜W&¬¬rrí√‚rp¢‰B‰ıBÄ¢4ÙƒU44RáÜ˜Fıˆ6FVv˜'í¬rrì“wñ÷VÁE˜6∆óp¢ı"4ÙƒU44RáÜ6R¬rríîƒî¥RrW6∆óRp¢ı"4ÙƒU44RáÜ6R¬rríîƒî¥RrW&V6VóBRp¢ı"4ÙƒU44RáÜ6R¬rríîƒî¥RrWFÇRp¢ê¢ı$DU"%íÜ˜FıˆñB46¿¢∑&˜rÊ¶ˆ%ˆñB¬VÊóDñG5–¢ì∞¢f˜"Ü6ˆÁ7BÜ˜FÚˆbVÊóEÜ˜F˜5"Á&˜w2«¬µ“í∞¢6ˆÁ7B∂Wí“7G&ñÊráÜ˜FÚÁVÊóEˆñB«¬""ì∞¢6ˆÁ7B'"“Ü˜F˜4'ïVÊóBÊvWBÜ∂Wíí«¬µ”∞¢'"ÁW6Çá∞¢Ü˜FıˆñC¢Ü˜FÚÁÜ˜FıˆñB¿¢Ü6S¢Ü˜FÚÁÜ6R«¬ÁV∆¬¿¢Ü˜Fıˆ6FVv˜'ì¢Ü˜FÚÁÜ˜Fıˆ6FVv˜'í«¬ÁV∆¬¿¢7&VFVEˆC¢Ü˜FÚÊ7&VFVEˆB«¬ÁV∆¬¿¢W∆ˆFVEˆC¢Ü˜FÚÁW∆ˆFVEˆB«¬ÁV∆¬¿¢V&∆ñ5˜W&√¢Ü˜FÚÁV&∆ñ5˜W&¬«¬ÁV∆¬¿¢“ì∞¢Ü˜F˜4'ïVÊóBÁ6WBÜ∂Wí¬'"ì∞¢–†¢6ˆÁ7B6ÜV6∂∆ó7E"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BVÊóEˆñB¬6ÜV6∂∆ó7E˜GóR¬6ˆ◊∆WFVEˆB¬6ÜV6∂∆ó7Eˆß6ˆ‡¢e$Ù“V&∆ñ2Ê¶ˆ%˜VÊóEˆ6ÜV6∂∆ó7G0¢tÑU$R¶ˆ%ˆñC“C‰BVÊóEˆñB“ÂíÇC#£¶&ñvñÁEµ“ñ¿¢∑&˜rÊ¶ˆ%ˆñB¬VÊóDñG5–¢ì∞¢f˜"Ü6ˆÁ7B6ÜV6≤ˆb6ÜV6∂∆ó7E"Á&˜w2«¬µ“í∞¢6ˆÁ7B∂Wí“7G&ñÊrÜ6ÜV6≤ÁVÊóEˆñB«¬""ì∞¢6ˆÁ7B7W"“6ÜV6∑4'ïVÊóBÊvWBÜ∂Wíí«¬µ”∞¢7W"ÁW6ÇÜ6ÜV6≤ì∞¢6ÜV6∑4'ïVÊóBÁ6WBÜ∂Wí¬7W"ì∞¢–¢–†¢V&∆ñ5VÊóG2“VÊóE&˜w2Ê÷ÇáVÊóBí”‚∞¢6ˆÁ7B∆&V≈'G2“∂òàNä>ã~òéäﬁà~â~ã^òÇG∑VÊóBÁVÊóEˆÊÚ«¬"“'÷”∞¢ñbáVÊóBÊ∆ˆ6FñˆÂˆ∆&V¬í∆&V≈'G2ÁW6ÇáVÊóBÊ∆ˆ6FñˆÂˆ∆&V¬ì∞¢6ˆÁ7B6ÜV6∂∆ó7B“G&6∂ñÊu&óf7íÁ7V÷÷&ó¶UVÊóD6ÜV6∂∆ó7G2Ü6ÜV6∑4'ïVÊóBÊvWBÖ7G&ñÊráVÊóBÁVÊóEˆñBíí«¬µ“ì∞¢&WGW&‚∞¢VÊóEˆñC¢VÊóBÁVÊóEˆñB¿¢VÊóEˆÊÛ¢VÊóBÁVÊóEˆÊÚ¿¢VÊóEˆ6ˆFS¢VÊóBÁVÊóEˆ6ˆFR«¬ÁV∆¬¿¢∆&V√¢∆&V≈'G2Ê¶ˆñ‚Ç"Ú"í¿¢'GS¢VÊóBÊ'GR«¬ÁV∆¬¿¢5˜GóS¢VÊóBÊ5˜GóR«¬ÁV∆¬¿¢6W'fñ6U˜GóS¢VÊóBÁv6Ö˜GóR«¬VÊóBÊóFV’ˆÊ÷R«¬ÁV∆¬¿¢6ÜV6∂∆ó7E˜7V÷÷'ì¢6ÜV6∂∆ó7B¿¢Ü˜F˜3¢Ü˜F˜4'ïVÊóBÊvWBÖ7G&ñÊráVÊóBÁVÊóEˆñBíí«¬µ“¿¢”∞¢“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÁv&‚Ç%∑V&∆ñ5˜G&6µ˜VÊóG5“∆ˆBfñ∆VB"¬≤¶ˆ%ˆñC¢&˜rÊ¶ˆ%ˆñB¬W'&˜#¢RÊ÷W76vR“ì∞¢V&∆ñ5VÊóG2“µ”∞¢–¢–†††¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	˘RDT“ÖV&∆ñ2G&6∂ñÊrê¢ÚÚ“òäÆâNà~ä>ã.ä.àÆã~òéäﬁâ~ã^äàÆòéã.à~â~ãòûà~äæäâNò>âûà~ã.âíéânòûã.òâæãNâBf∆rê¢ÚÚ“&6∑v&B6ˆ◊Fñ&∆S¢ä.ãà~äÆòéàrfñV∆BFV6ÜÊñ6ñ‚éàÆòéã.à~äæä^ãàíòäæäã~äﬁâûòâNãNä¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶∆WBFV6ÜÊñ6ñÂ˜FV““ÁV∆√∞†¶ñbÑdƒuı4ÑıuıDT4ÖıDT’ÙÙÂıE$4¥î‰rbb6Â6Ü˜uV&∆ñ5FV6ÜÊñ6ñ‚í∞¢G'í∞¢ÚÚâNãnà~äÆäã.àÆãNàâ~ã^äàéã.àâ^ã.ä>ã.à~ò>äæäòÇÜ¶ˆ%˜FV’ˆ÷V÷&W'2ê¢6ˆÁ7BF’"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BW6W&Ê÷Re$Ù“V&∆ñ2Ê¶ˆ%˜FV’ˆ÷V÷&W'2tÑU$R¶ˆ%ˆñC“Cı$DU"%íW6W&Ê÷R46¿¢∑&˜rÊ¶ˆ%ˆñE–¢ì∞¢6ˆÁ7Bg&ˆ‘¶ˆñ‚“áF’"Á&˜w2«¬µ“íÊ÷ÇáÇí”‚7G&ñÊráÇÁW6W&Ê÷R«¬""íÁG&ñ“ÇííÊfñ«FW"Ñ&ˆˆ∆V‚ì∞†¢ÚÚâNãnà~àÆòéã.à~àéã.à¶ˆ%ˆ76ñvÊ÷VÁG2âNòûä~ä"éò.âæä>âNãààÆãâûâÆã.à~à~ã.âí76ñv‚âŒòéã.âûâ^ã.ä>ã.à~âûã^òûòâ~òéã.âûãòûâíí‡¢ÚÚ¶ˆ%ˆ76ñvÊ÷VÁG2äã^äÆânã.âûãñÂ˜&ˆw&W72ˆFˆÊRòâ~òéã.âûãòûâí(	Bâ~ãòûà~äÆäﬁà~ânã~äﬁä~òéã.ânãûà76ñv‚àéä>ãNàp¢ÚÚéàã.ä>âæà˛ãNòäÆâÇ˛äæäâNäﬁã.ä.ãéäﬁä.ãûòéâ~ã^òÇ¶ˆ%ˆˆffW'2àæãnòéà~òNäòéò>àÆòéòäæä^òéàr76ñvÊ÷VÁBí‡¢∆WBg&ˆ‘76ñv‚“µ”∞¢G'í∞¢6ˆÁ7B¶"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BFV6ÜÊñ6ñÂ˜W6W&Ê÷Re$Ù“V&∆ñ2Ê¶ˆ%ˆ76ñvÊ÷VÁG0¢tÑU$R¶ˆ%ˆñC“C‰B4ÙƒU44Rá7FGW2¬vñÂ˜&ˆw&W72ríî‚ÇvñÂ˜&ˆw&W72r¬vFˆÊRrñ¿¢∑&˜rÊ¶ˆ%ˆñE–¢ì∞¢g&ˆ‘76ñv‚“Ü¶"Á&˜w2«¬µ“íÊ÷ÇáÇí”‚7G&ñÊráÇÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R«¬""íÁG&ñ“ÇííÊfñ«FW"Ñ&ˆˆ∆V‚ì∞¢“6F6ÇÜRí∞¢ÚÚFÚÊ˜Bfñ¬G&6∂ñÊr¬'WBFÚ‰ıB7v∆∆˜r6ñ∆VÁF«í(	B∆ˆr6ÊóFó¶V@¢ÚÚv&ÊñÊrÜ¶ˆ%ˆñB≤÷W76vRˆÊ«ì≤ÊWfW"Fˆ∂V‚ıîíˆFG&W72ˆ6ˆ˜&FñÊFW2í‡¢6ˆÁ6ˆ∆RÁv&‚Ç%∑V&∆ñ2˜G&6µ“¶ˆ%ˆ76ñvÊ÷VÁG2vw&VvFñˆ‚fñ∆VB"¬≤¶ˆ%ˆñC¢&˜rÊ¶ˆ%ˆñB¬÷W76vS¢RbbRÊ÷W76vR“ì∞¢g&ˆ‘76ñv‚“µ”∞¢–†¢ÚÚä>äﬁà~ä>ãâ¢∆Vv7ífñV∆G2(	BFV6ÜÊñ6ñÂ˜FV“äﬁã.àéòàò~âÆäæä^ã.ä"W6W&Ê÷RàNãòéâûâNòûä~ä"6ˆ÷÷¢6ˆÁ7B∆Vv7í“∞¢&˜rÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R¿¢‚‚Â7G&ñÊrá&˜rÁFV6ÜÊñ6ñÂ˜FV“«¬""íÁ7∆óBÇ"¬"í¿¢–¢Ê÷ÇáÇí”‚7G&ñÊráÇ«¬""íÁG&ñ“Çíê¢Êfñ«FW"Ñ&ˆˆ∆V‚ì∞†¢ÚÚFVGW∆ñ6FR'íÊ˜&÷∆ó¶VBÜ∆˜vW"÷66VBíW6W&Ê÷RvÜñ∆R∂VWñÊrFÜRfó'7@¢ÚÚ6VV‚Fó7∆í66ñÊs≤&ñ÷'íFV6ÜÊñ6ñ‚áFV6ÜÊñ6ñÂ˜W6W&Ê÷Rí7Fó2fó'7B‡¢6ˆÁ7B6VV‚“ÊWr6WBÇì∞¢6ˆÁ7BVÊó“µ”∞¢f˜"Ü6ˆÁ7BRˆb≤‚‚Ê∆Vv7í¬‚‚Êg&ˆ‘¶ˆñ‚¬‚‚Êg&ˆ‘76ñvÂ“í∞¢6ˆÁ7BÊ˜&““RÁFÙ∆˜vW$66RÇì∞¢ñbá6VV‚ÊÜ2ÜÊ˜&“íí6ˆÁFñÁVS∞¢6VV‚ÊFBÜÊ˜&“ì∞¢VÊóÁW6ÇáRì∞¢–¢ñbáVÊóÊ∆VÊwFÇí∞¢6ˆÁ7BFWE"“vóBˆˆ¬ÁVW'íÄ¢ ¢4TƒT5BW6W&Ê÷R¬gV∆≈ˆÊ÷R¬Ü˜Fı˜FÇ¬&Êµˆ∆WfV¬¬&Êµˆ∂Wí¬&FñÊr¬w&FR¬ÜˆÊP¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W0¢tÑU$RW6W&Ê÷R“ÂíÇC£ßFWáEµ“ê¢¿¢∑VÊó–¢ì∞¢6ˆÁ7B'ïR“ÊWr÷ÇÜFWE"Á&˜w2«¬µ“íÊ÷ÇáÇí”‚µ7G&ñÊráÇÁW6W&Ê÷R«¬""íÁG&ñ“Çí¬Ö“íì∞†¢6ˆÁ7B∆∆˜uÜˆÊR“dƒuı4ÑıuıDT4ÖıÑÙ‰UÙÙÂıE$4¥î‰s∞¢6ˆÁ7B6Ü˜uÜˆÊR“∆∆˜uÜˆÊRÚG'VR¢&˜rÁG&fV≈˜7F'FVEˆC∞†¢FV6ÜÊñ6ñÂ˜FV““VÊóÊ÷ÇáRí”‚∞¢6ˆÁ7BB“'ïRÊvWBáRí«¬∑”∞¢&WGW&‚∞¢W6W&Ê÷S¢R¿¢gV∆≈ˆÊ÷S¢BÊgV∆≈ˆÊ÷R«¬ÁV∆¬¿¢Ü˜FÛ¢BÁÜ˜Fı˜FÇ«¬ÁV∆¬¿¢&Êµˆ∆WfV√¢BÁ&Êµˆ∆WfV¬ÛÚÁV∆¬¿¢&Êµˆ∂Wì¢BÁ&Êµˆ∂Wí«¬ÁV∆¬¿¢&FñÊs¢BÁ&FñÊrÛÚÁV∆¬¿¢w&FS¢BÊw&FR«¬ÁV∆¬¿¢ÜˆÊS¢6Ü˜uÜˆÊRÚÜBÁÜˆÊR«¬ÁV∆¬í¢ÁV∆¬¿¢”∞¢“ì∞¢“V«6R∞¢FV6ÜÊñ6ñÂ˜FV““µ”∞¢–¢“6F6ÇÜRí∞¢ÚÚòNäòéò>äæòíG&6∂ñÊrä^òéäÜfñ¬÷˜V‚òâÆâÆòNäòéâÓãà~äæâûòûã"ê¢FV6ÜÊñ6ñÂ˜FV““µ”∞¢–ß–¢ÚÚ66W72∆WfV√¢FÜR∆ˆÊr&ÊFˆ“&ˆˆ∂ñÊu˜Fˆ∂V‚“gV∆¬FWFñ¬‚FÜR6Ü˜'@¢ÚÚáV÷‚◊&VF&∆R&ˆˆ∂ñÊuˆ6ˆFR“÷6∂VBîíˆÊ«íÜóB∆V∑2FˆÚV6ñ«íF¢ÚÚ7B2gV∆¬7&VFVÁFñ¬í(	B6VR6W'fW"˜6W'fñ6W2˜V&∆ñ2˜G&6∂ñÊu&óf7íÊß2‡¢6ˆÁ7BgV∆ƒ66W72“6V∆V7Fñˆ‚bbG&6∂ñÊu&óf7íÊó4gV∆ƒ66W75VW'íá¬&˜rì∞¢ÚÚ6V∆V7Fñˆ‚6&ñ∆óGíÜ2ˆÊR'6ˆ«WFRR÷÷ñÁWFR∆ñfWFñ÷R‚&WGW&ÊñÊrFÜP¢ÚÚfW&ñfñVB&VfW&VÊ6R&WfVÁG26V∆V7B˜&Vg&W6Ç˜˜7B◊&WfñWr&V∆ˆBg&ˆ“&ˆ∆∆ñÊp¢ÚÚFÜBFVF∆ñÊRf˜'v&B‚g&W6Ç6&ñ∆óGíó2ó77VVBˆÊ«í'íg&W6Ç∆ˆˆ∑W‡¢6ˆÁ7Bó77VVE6V∆V7FñˆÂ&VfW&VÊ6R“gV∆ƒ66W70¢Ú" ¢¢6V∆V7Fñˆ‡¢Ú6V∆V7FñˆÂ&VfW&VÊ6P¢¢G&6∂ñÊu&óf7íÊ7&VFUG&6∂ñÊu6V∆V7FñˆÂ&VfW&VÊ6Rá&˜rÊ¶ˆ%ˆñB¬vWDßwE6V7&WBÇíì∞¢ÚÚ÷ñÊñ÷¬¬Êˆ‚◊6VÁ6óFófRV∆ñvñ&ñ∆óGí6ñvÊ¬6ÚƒTt5í7W7Fˆ÷W"Ü¶ˆ"vóFÄ¢ÚÚÊÚ&ˆˆ∂ñÊu˜Fˆ∂V‚í6‚7Fñ∆¬6VRFÜR&WfñWrf˜&“ˆ‚&ˆˆ∂ñÊuˆ6ˆFR∆ˆˆ∑W ¢ÚÚÊB7V&÷óB6ˆFR≤gV∆¬ÜˆÊR‚óB&WfV«2ˆÊ«íFÜB&WfñWró2˜76ñ&∆R(	@¢ÚÚÊÚîí¬ÊÚFˆ∂V‚‚Fˆ∂VÊVB¶ˆ"ó2ÊWfW"∆Vv7í÷V∆ñvñ&∆R¬6ÚóB6‚ÊWfW ¢ÚÚF˜vÊw&FRFÚFÜR6ˆFR∑ÜˆÊRFÇ‡¢6ˆÁ7B∆Vv7ï&WfñWtV∆ñvñ&∆R–¢7G&ñÊrá&˜rÊ&ˆˆ∂ñÊu˜Fˆ∂V‚«¬""íÁG&ñ“Çíb`¢7G&ñÊrá&˜rÊ¶ˆ%˜7FGW2«¬""íÁG&ñ“Çí””“.òäÆä>ò~àéòä^òûär"b`¢&˜rÊ7W7Fˆ÷W%˜&FñÊrb`¢&˜rÁFV6ÜÊñ6ñÂ˜W6W&Ê÷S∞¢6ˆÁ7BG&6µñ∆ˆB“∞¢66W75ˆ∆WfV√¢gV∆ƒ66W72Ú'Fˆ∂V‚"¢&6ˆFR"¿¢6&ñ∆óFñW3¢∞¢6Â˜fñWuˆgV∆≈˜G&6∂ñÊs¢G'VR¿¢6Â˜W6U˜Fˆ∂VÂˆ7FñˆÁ3¢gV∆ƒ66W72¿¢6Â˜fñWuˆFˆ7V÷VÁG3¢gV∆ƒ66W72¿¢6Â˜7V&÷óE˜&WfñWs¢gV∆ƒ66W72¿¢6Âˆ6Ê6V≈˜W&vVÁC¢gV∆ƒ66W70¢bb7G&ñÊrá&˜rÊ&ˆˆ∂ñÊuˆ÷ˆFR«¬""íÁG&ñ“ÇíÁFÙ∆˜vW$66RÇí””“'W&vVÁB ¢bb&˜rÊ6Ê6V∆VEˆ@¢bb&˜rÁG&fV≈˜7F'FVEˆ@¢bb&˜rÊ6ÜV6∂ñÂˆ@¢bb&˜rÁ7F'FVEˆ@¢bb&˜rÊfñÊó6ÜVEˆ@¢bbU$tTÂEÙ4‰4T≈Ù$ƒÙ4¥TEı5DEU4U2ÊÜ2Ö7G&ñÊrá&˜rÊ¶ˆ%˜7FGW2«¬""íÁG&ñ“ÇíÁFÙ∆˜vW$66RÇíí¿¢“¿¢6Â˜fñWuˆgV∆≈˜G&6∂ñÊs¢G'VR¿¢6Â˜W6U˜Fˆ∂VÂˆ7FñˆÁ3¢gV∆ƒ66W72¿¢6Âˆ6Ê6V√¢gV∆ƒ66W70¢bb7G&ñÊrá&˜rÊ&ˆˆ∂ñÊuˆ÷ˆFR«¬""íÁG&ñ“ÇíÁFÙ∆˜vW$66RÇí””“'W&vVÁB ¢bb&˜rÊ6Ê6V∆VEˆ@¢bb&˜rÁG&fV≈˜7F'FVEˆ@¢bb&˜rÊ6ÜV6∂ñÂˆ@¢bb&˜rÁ7F'FVEˆ@¢bb&˜rÊfñÊó6ÜVEˆ@¢bbU$tTÂEÙ4‰4T≈Ù$ƒÙ4¥TEı5DEU4U2ÊÜ2Ö7G&ñÊrá&˜rÊ¶ˆ%˜7FGW2«¬""íÁG&ñ“ÇíÁFÙ∆˜vW$66RÇíí¿¢∆Vv7ï˜&WfñWuˆV∆ñvñ&∆S¢∆Vv7ï&WfñWtV∆ñvñ&∆R¿¢¶ˆ%ˆñC¢&˜rÊ¶ˆ%ˆñB¿¢&ˆˆ∂ñÊuˆ6ˆFS¢&˜rÊ&ˆˆ∂ñÊuˆ6ˆFR«¬ÁV∆¬¿¢&ˆˆ∂ñÊu˜Fˆ∂V„¢&˜rÊ&ˆˆ∂ñÊu˜Fˆ∂V‚«¬ÁV∆¬¿¢7W7Fˆ÷W%ˆÊ÷S¢&˜rÊ7W7Fˆ÷W%ˆÊ÷R¿¢7W7Fˆ÷W%˜ÜˆÊS¢&˜rÊ7W7Fˆ÷W%˜ÜˆÊR«¬ÁV∆¬¿¢¶ˆ%˜GóS¢&˜rÊ¶ˆ%˜GóR¿¢ˆñÁF÷VÁEˆFFWFñ÷S¢&˜rÊˆñÁF÷VÁEˆFFWFñ÷R¿¢¶ˆ%˜7FGW3¢V&∆ñ57FGW2¿¢&ˆˆ∂ñÊuˆ÷ˆFS¢&˜rÊ&ˆˆ∂ñÊuˆ÷ˆFR«¬ÁV∆¬¿¢Fó7F6Öˆ÷ˆFS¢&˜rÊFó7F6Öˆ÷ˆFR«¬ÁV∆¬¿¢GW&FñˆÂˆ÷ñ„¢&˜rÊGW&FñˆÂˆ÷ñ‚”“ÁV∆¬ÚÁV∆¬¢ÁV÷&W"á&˜rÊGW&FñˆÂˆ÷ñ‚í¿¢¶ˆ%˜&ñ6S¢&˜rÊ¶ˆ%˜&ñ6R”“ÁV∆¬ÚÁV∆¬¢ÁV÷&W"á&˜rÊ¶ˆ%˜&ñ6Rí¿¢ñ÷VÁE˜7FGW3¢&˜rÁñ÷VÁE˜7FGW2«¬ÁV∆¬¿¢ñEˆC¢&˜rÁñEˆB«¬ÁV∆¬¿¢7&VFVEˆC¢&˜rÊ7&VFVEˆB«¬ÁV∆¬¿¢6W'fñ6UˆóFV◊3¢6W'fñ6TóFV◊2Ê÷ÇÜóFV“í”‚á∞¢óFV’ˆÊ÷S¢óFV“ÊóFV’ˆÊ÷R«¬ÁV∆¬¿¢Gì¢óFV“ÁGí”“ÁV∆¬ÚÁV∆¬¢ÁV÷&W"ÜóFV“ÁGíí¿¢VÊóE˜&ñ6S¢óFV“ÁVÊóE˜&ñ6R”“ÁV∆¬ÚÁV∆¬¢ÁV÷&W"ÜóFV“ÁVÊóE˜&ñ6Rí¿¢∆ñÊU˜F˜F√¢óFV“Ê∆ñÊU˜F˜F¬”“ÁV∆¬ÚÁV∆¬¢ÁV÷&W"ÜóFV“Ê∆ñÊU˜F˜F¬í¿¢“íí¿¢FG&W75˜FWáC¢&˜rÊFG&W75˜FWáB¿¢÷5˜W&√¢&˜rÊ÷5˜W&¬«¬ÁV∆¬¿¢¶ˆ%˜¶ˆÊS¢&˜rÊ¶ˆ%˜¶ˆÊR«¬ÁV∆¬¿¢w5ˆ∆FóGVFS¢&˜rÊw5ˆ∆FóGVFR¿¢w5ˆ∆ˆÊvóGVFS¢&˜rÊw5ˆ∆ˆÊvóGVFR¿†¢G&fV≈˜7F'FVEˆC¢&˜rÁG&fV≈˜7F'FVEˆB¿¢6ÜV6∂ñÂˆC¢&˜rÊ6ÜV6∂ñÂˆB¿¢7F'FVEˆC¢&˜rÁ7F'FVEˆB¿¢fñÊó6ÜVEˆC¢&˜rÊfñÊó6ÜVEˆB¿¢6Ê6V∆VEˆC¢&˜rÊ6Ê6V∆VEˆB¿¢6Ê6V≈˜&V6ˆ„¢&˜rÊ6Ê6V≈˜&V6ˆ‚«¬ÁV∆¬¿†¢ÚÚ)»RÊ˜FW2˜Ü˜F˜2ˆÊ«ígFW"FˆÊP¢FV6ÜÊñ6ñÂˆÊ˜FS¢ó4FˆÊRÚá&˜rÁFV6ÜÊñ6ñÂˆÊ˜FR«¬""í¢ÁV∆¬¿¢Ü˜F˜2¿¢VÊóG3¢V&∆ñ5VÊóG2¿†¢ÚÚFÜR&V6VóBFˆ7V÷VÁB6'&ñW2gV∆¬îí¬6ÚóG2∆ñÊ≤Ê˜rV÷&VG2FÜP¢ÚÚ&ˆˆ∂ñÊu˜Fˆ∂V‚2‚66W72∂WíáFÜRˆFˆ72&˜WFW2fW&ñgíóBí‡¢&V6VóE˜W&√¢ó4FˆÊRbb&˜rÊ&ˆˆ∂ñÊu˜Fˆ∂V‡¢ÚG∂˜&ñvñÁ“ˆFˆ72˜&V6VóBÚG∑&˜rÊ¶ˆ%ˆñG”ˆ∂Wì“G∂VÊ6ˆFUU$î6ˆ◊ˆÊVÁBá&˜rÊ&ˆˆ∂ñÊu˜Fˆ∂V‚ó÷ ¢¢ÁV∆¬¿†¢&WfñWs¢∞¢«&VGï˜&WfñWvVC¢&˜rÊ7W7Fˆ÷W%˜&FñÊr¿¢&FñÊs¢&˜rÊ7W7Fˆ÷W%˜&FñÊr«¬ÁV∆¬¿¢&WfñWu˜FWáC¢&˜rÊ7W7Fˆ÷W%˜&WfñWr«¬ÁV∆¬¿¢6ˆ◊∆ñÁE˜FWáC¢&˜rÊ7W7Fˆ÷W%ˆ6ˆ◊∆ñÁB«¬ÁV∆¬¿¢&WfñWvVEˆC¢&˜rÁ&WfñWvVEˆB«¬ÁV∆¬¿¢“¿†¢ÚÚ6W&FRg&ˆ“&WfñWv&˜fRáFV6ÜÊñ6ñ‚&FñÊrí‚&FW2FÜP¢ÚÚ6F∆ˆróFV“˜6W'fñ6RfñV&∆ñ2Ê6F∆ˆuˆóFV’˜&WfñWw2ñÁ7FVB‡¢6F∆ˆu˜&WfñWs¢6F∆ˆu&WfñWr¿†¢FV6ÜÊñ6ñ„¢&˜rÁFV6ÜÊñ6ñÂ˜W6W&Ê÷Rbb6Â6Ü˜uV&∆ñ5FV6ÜÊñ6ñ‡¢Ú∞¢W6W&Ê÷S¢&˜rÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R¿¢gV∆≈ˆÊ÷S¢&˜rÁFV6ÖˆÊ÷R¿¢Ü˜FÛ¢&˜rÁFV6Ö˜Ü˜FÚ¿¢&Êµˆ∆WfV√¢&˜rÁFV6Ö˜&Êµˆ∆WfV¬ÛÚÁV∆¬¿¢&Êµˆ∂Wì¢&˜rÁFV6Ö˜&Êµˆ∂Wí«¬ÁV∆¬¿¢&FñÊs¢&˜rÁ&FñÊr¿¢w&FS¢&˜rÊw&FR¿¢ÚÚ)»RòâÆäﬁä>òŒò.â~ä>àÆòéã.à~äÆã>äæä>ãâ¢G&6∂ñÊréâ^òûäﬁà~âŒòéã.âíFˆ∂V‚ˆ&ˆˆ∂ñÊuˆ6ˆFRâ~ã^òéânãûàâ^òûäﬁà~òâ~òéã.âûãòûâíê¢ÚÚ“ânòûã.òâæãNâBf∆s¢òäÆâNà~òNâNòûòä^ä ¢ÚÚ“ânòûã.òNäòéòâæãNâC¢àNà~âÓäNâ^ãNàä>ä>äòâNãNäéòäÆâNà~äæä^ãà~òä>ãNòéäòâNãNâûâ~ã.àrê¢ÜˆÊS¢dƒuı4ÑıuıDT4ÖıÑÙ‰UÙÙÂıE$4¥î‰rÚá&˜rÁFV6Ö˜ÜˆÊR«¬ÁV∆¬í¢á&˜rÁG&fV≈˜7F'FVEˆBÚá&˜rÁFV6Ö˜ÜˆÊR«¬ÁV∆¬í¢ÁV∆¬í¿¢–¢¢ÁV∆¬¿†¢ÚÚ)»Rä>ã.ä.àÆã~òéäﬁâ~ã^äàÆòéã.à~â~ãòûà~äæäâBéânòûã.òâæãNâBf∆rí(	Bò>àÆòûò>âûäæâûòûã"G&6∂ñÊp¢FV6ÜÊñ6ñÂ˜FV“¿¢”∞¢&W2Êß6ˆ‚ÜgV∆ƒ66W70¢ÚG&6µñ∆ˆ@¢¢G&6∂ñÊu&óf7íÁ6V∆V7FñˆÂV&∆ñ5G&6µñ∆ˆBÄ¢G&6µñ∆ˆB¿¢ó77VVE6V∆V7FñˆÂ&VfW&VÊ6R¿¢ó4FˆÊRbb&˜rÊ6Ê6V∆VEˆBbb&˜rÊ7W7Fˆ÷W%˜&FñÊrbb&˜rÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R¿¢íì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Ç%∑V&∆ñ2˜G&6µ“fñ∆VB"¬≤6ˆFS¢7G&ñÊrÜSÚÊ6ˆFR«¬%E$4µÙdîƒTB"í“ì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.â^ãNâNâ^ã.äà~ã.âûòNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß–†¶Á˜7BÇ"˜V&∆ñ2˜G&6≤ˆ∆ˆˆ∑W"¬7ñÊ2á&W¬&W2í”‚∞¢&W2Á6WBÇ$66ÜR‘6ˆÁG&ˆ¬"¬&ÊÚ◊7F˜&R¬ÊÚ÷66ÜR¬◊W7B◊&Wf∆ñFFR¬÷Ç÷vS”"ì∞¢&W2Á6WBÇ%&VfW'&W"’ˆ∆ñ7í"¬&ÊÚ◊&VfW'&W""ì∞¢6ˆÁ7BG&6µ&FR“V&∆ñ5G&6µ&FT∆ñ÷óFW"Ê6ÜV6≤áG&6∂ñÊu&óf7íÊ6∆ñVÁDó∂Wíá&Wíì∞¢ñbÇG&6µ&FRÊ∆∆˜vVBí∞¢&WGW&‚&W2Á7FGW2ÉC#ííÊß6ˆ‚á≤W'&˜#¢.àNòûâûäæã.âÆòéäﬁä.òàãNâûòNâ≤àä>ãéâ>ã.ä>äﬁäÆãààNä>ãûòÇ"¬6ˆFS¢%$DUÙƒî‘ïDTB"¬&WG'ïˆgFW%˜3¢G&6µ&FRÁ&WG'ïˆgFW%˜2“ì∞¢–¢6ˆÁ7BñFVÁFñfñW"“7G&ñÊrá&WÊ&ˆGìÚÊñFVÁFñfñW"«¬""íÁG&ñ“Çì∞¢6ˆÁ7BÜˆÊR“G&6∂ñÊu&óf7íÊÊ˜&÷∆ó¶UG&6∂ñÊuÜˆÊRÜñFVÁFñfñW"ì∞¢6ˆÁ7B&ˆˆ∂ñÊt6ˆFR“ı‰5te¥’£”ï◊≥w“BˆíÁFW7BÜñFVÁFñfñW"íÚñFVÁFñfñW"ÁFıWW$66RÇí¢"#∞¢ñbÇÜˆÊRbb&ˆˆ∂ñÊt6ˆFRí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.òNäòéâÓâÆà~ã.âí"“ì∞¢6ˆÁ7B6V7&WB“vWDßwE6V7&WBÇì∞¢ñbÇ6V7&WBí&WGW&‚&W2Á7FGW2ÉS2íÊß6ˆ‚á≤W'&˜#¢.ä>ãâÆâÆâ^ãNâNâ^ã.äà~ã.âûä.ãà~òNäòéâÓä>òûäﬁäò>àÆòûà~ã.âí"“ì∞¢G'í∞¢6ˆÁ7B&W7V«B“ÜˆÊP¢ÚvóBˆˆ¬ÁVW'íÄ¢4TƒT5B¶ˆ%ˆñB¬&ˆˆ∂ñÊuˆ6ˆFR¬ˆñÁF÷VÁEˆFFWFñ÷R¬¶ˆ%˜GóR¬¶ˆ%˜7FGW2¬¶ˆ%˜¶ˆÊR¬FG&W75˜FWá@¢e$Ù“V&∆ñ2Ê¶ˆ'0¢tÑU$R&VvWá˜&W∆6RÑ4ÙƒU44RÜ7W7Fˆ÷W%˜ÜˆÊR¬rrí¬uµ„”ï“r¬rr¬vrrí“ÂíÇC£ßFWáEµ“ê¢ı$DU"%í4ÙƒU44RÜˆñÁF÷VÁEˆFFWFñ÷R¬7&VFVEˆBíDU42ÂTƒ≈2ƒ5B¬¶ˆ%ˆñBDU40¢ƒî‘ïBS¿¢∑ÜˆÊRÊ÷F6ÖˆFñvóG5“¿¢ê¢¢vóBˆˆ¬ÁVW'íÄ¢4TƒT5B¶ˆ%ˆñB¬&ˆˆ∂ñÊuˆ6ˆFR¬ˆñÁF÷VÁEˆFFWFñ÷R¬¶ˆ%˜GóR¬¶ˆ%˜7FGW2¬¶ˆ%˜¶ˆÊR¬FG&W75˜FWá@¢e$Ù“V&∆ñ2Ê¶ˆ'0¢tÑU$R&ˆˆ∂ñÊuˆ6ˆFS“C¢ı$DU"%í¶ˆ%ˆñBDU40¢ƒî‘ïB&¿¢∂&ˆˆ∂ñÊt6ˆFU“¿¢ì∞¢6ˆÁ7B&˜w2“&W7V«BÁ&˜w2«¬µ”∞¢ñbÇ&˜w2Ê∆VÊwFÇ«¬Ü&ˆˆ∂ñÊt6ˆFRbb&˜w2Ê∆VÊwFÇ”“íí&WGW&‚&W2Á7FGW2ÉCBíÊß6ˆ‚á≤W'&˜#¢.òNäòéâÓâÆà~ã.âí"“ì∞¢&WGW&‚&W2Êß6ˆ‚áG&6∂ñÊu&óf7íÊ'Vñ∆E6fUG&6∂ñÊt∆ˆˆ∑W&W7ˆÁ6RÄ¢&˜w2¿¢ÜˆÊRÚ'ÜˆÊR"¢&&ˆˆ∂ñÊuˆ6ˆFR"¿¢6V7&WB¿¢íì∞¢“6F6ÇÜW'&˜"í∞¢6ˆÁ6ˆ∆RÊW'&˜"Ç%∑V&∆ñ2˜G&6≤ˆ∆ˆˆ∑W“fñ∆VB"¬≤6ˆFS¢7G&ñÊrÜW'&˜#ÚÊ6ˆFR«¬$ƒÙÙµUÙdîƒTB"í“ì∞¢&WGW&‚&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.àNòûâûäæã.à~ã.âûòNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞†††¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ*ŸT$ƒî2$UdîUréä^ãûààNòûã.ò>äæòûàNãòâûâí˛ä>ã^ä~ãNäräæä^ãà~âæãNâNà~ã.âíê¢ÚÚ“ä.ã~âûä.ãâûâNòûä~ä"&ˆˆ∂ñÊuˆ6ˆFRäæä>ã~ä“Fˆ∂V‡¢ÚÚ“àéã>àãâBä>ã^ä~ãNä~â^òéä“¶ˆ%ˆñ@¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶Á˜7BÇ"˜V&∆ñ2˜&WfñWr"¬7ñÊ2á&W¬&W2í”‚∞¢ÚÚV&∆ñ2u$ïDRWFÜ˜&ó6VB'í&ˆˆ∂ñÊrñFVÁFñfñW"‚ˆ∆ñ7ì†¢ÚÚ“¶ˆ"FÜBÑ2&ˆˆ∂ñÊu˜Fˆ∂V‚&WVó&W2FÜRUÑ5BFˆ∂V‚áFÜR6Ü˜'B¿¢ÚÚ6Ü&V&∆R&ˆˆ∂ñÊuˆ6ˆFR∆ˆÊRó2‰ıBw&óFR7&VFVÁFñ¬(	B6VRFÜP¢ÚÚG&6∂ñÊr&óf7í7∆óBí‚ÊÚF˜vÊw&FRFÚ6ˆFR∑ÜˆÊRf˜"Fˆ∂VÊVB¶ˆ'2‡¢ÚÚ“ƒTt5í¶ˆ"vóFÇÊÚ&ˆˆ∂ñÊu˜Fˆ∂V‚÷í&R&WfñWvVBfñ&ˆˆ∂ñÊuˆ6ˆFR∞¢ÚÚFÜR7W7Fˆ÷W"w2eTƒ¬ÜˆÊRÜWÜ7B÷F6ÇgFW"FñvóB÷Ê˜&÷∆ó6Fñˆ‚í¿¢ÚÚ7Fñ∆¬&WVó&ñÊrFÜR¶ˆ"FÚ&R6ˆ◊∆WFVBÊBÊ˜BñWB&WfñWvVB‡¢ÚÚWfW'íWFÜ˜&ó6Fñˆ‚ˆV∆ñvñ&ñ∆óGífñ«W&R&WGW&Á2FÜR4‘RvVÊW&ñ2W'&˜"6¢ÚÚFÜRVÊGˆñÁBÊWfW"&WfV«2vÜWFÜW"FÜR6ˆFR¬ÜˆÊR¬˜"7FGW2v2FÜP¢ÚÚ÷ó6÷F6Ç‚&FR∆ñ÷óFVBW"6∆ñVÁBïÊBW"ñFVÁFñfñW"‚ÊÚîí˜Fˆ∂V‚ñ‡¢ÚÚÁí&W7ˆÁ6R‡¢6ˆÁ7BtT‰U$î5ı$UdîUuÙU%$ı"“.òNäòéäÆã.äã.ä>ânäÆòéà~ä>ã^ä~ãNä~òNâNòíàä>ãéâ>ã.â^ä>ä~àéäÆäﬁâÆòä^à"˛äÆânã.âûãà~ã.âûòä^ãà.òûäﬁäãûä^ä.ã~âûä.ãâûäﬁã^ààNä>ãòûàr#∞¢6ˆÁ7B&ˆGí“&WÊ&ˆGí«¬∑”∞¢6ˆÁ7BFˆ∂V‚“7G&ñÊrÜ&ˆGíÁFˆ∂V‚«¬&ˆGíÊ&ˆˆ∂ñÊu˜Fˆ∂V‚«¬""íÁG&ñ“Çì∞¢6ˆÁ7B6V∆V7FñˆÂ&VfW&VÊ6R“7G&ñÊrÜ&ˆGíÁ6V∆V7FñˆÂ˜&Vb«¬""íÁG&ñ“Çì∞¢6ˆÁ7B6V∆V7Fñˆ‚“6V∆V7FñˆÂ&VfW&VÊ6P¢ÚG&6∂ñÊu&óf7íÁfW&ñgïG&6∂ñÊu6V∆V7FñˆÂ&VfW&VÊ6Rá6V∆V7FñˆÂ&VfW&VÊ6R¬vWDßwE6V7&WBÇíê¢¢ÁV∆√∞¢6ˆÁ7B6ˆFR“7G&ñÊrÜ&ˆGíÊ&ˆˆ∂ñÊuˆ6ˆFR«¬&ˆGíÁ«¬""íÁG&ñ“Çì∞¢6ˆÁ7BÜˆÊTFñvóG2“7G&ñÊrÜ&ˆGíÊ7W7Fˆ÷W%˜ÜˆÊR«¬""íÁ&W∆6RÇıƒBˆr¬""ì∞¢6ˆÁ7B7F"“ÁV÷&W"Ü&ˆGíÁ&FñÊrì∞¢6ˆÁ7B&WfñWu˜FWáB“Ü&ˆGíÁ&WfñWu˜FWáB«¬""íÁFı7G&ñÊrÇíÁG&ñ“Çí«¬ÁV∆√∞¢6ˆÁ7B6ˆ◊∆ñÁE˜FWáB“Ü&ˆGíÊ6ˆ◊∆ñÁE˜FWáB«¬""íÁFı7G&ñÊrÇíÁG&ñ“Çí«¬ÁV∆√∞†¢ñbÇV&∆ñ5&WfñWtó&FT∆ñ÷óFW"Ê6ÜV6≤áG&6∂ñÊu&óf7íÊ6∆ñVÁDó∂Wíá&WííÊ∆∆˜vVBí∞¢&WGW&‚&W2Á7FGW2ÉC#ííÊß6ˆ‚á≤W'&˜#¢.äÆòéà~ä>ã^ä~ãNä~ânã^òéòàãNâûòNâ≤àä>ãéâ>ã.ä>äﬁäÆãààNä>ãûòÇ"¬6ˆFS¢%$DUÙƒî‘ïDTB"“ì∞¢–¢ñbÇÁV÷&W"Êó4fñÊóFRá7F"í«¬7F"¬«¬7F"‚Rí∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢'&FñÊrâ^òûäﬁà~äﬁä.ãûòéä>ãäæä~òéã.àr”R"“ì∞¢–¢ñbÇá6V∆V7FñˆÂ&VfW&VÊ6Rbb6V∆V7Fñˆ‚í«¬ÇFˆ∂V‚bb6V∆V7Fñˆ‚bb6ˆFRíí∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢tT‰U$î5ı$UdîUuÙU%$ı"“ì∞¢–¢ÚÚW"÷ñFVÁFñfñW"'VFvWBÜFVfVÊG2ˆÊR¶ˆ"w27&VFVÁFñ¬vñÁ7B÷Áí‘ï ¢ÚÚÜ÷÷W&ñÊrí‚6V∆V7Fñˆ‚6óÜW'FWáBó2&ÊFˆ÷ó¶VB¬6Ú&ñÊBóG2'V6∂WBFÚFÜP¢ÚÚ«&VGí◊fW&ñfñVB¶ˆ"ñFVÁFóGíñÁ7FVB‚Fˆ∂V‚ˆ6ˆFR&VÜfñ˜"7Fó2VÊ6ÜÊvVB‡¢6ˆÁ7BñFVÁFñfñW$∂Wí“6V∆V7Fñˆ‡¢ÚG&6∂ñÊu&óf7íÁ6V∆V7FñˆÂ&WfñWt∆ñ÷óFW$∂Wíá6V∆V7Fñˆ‚Ê¶ˆ%ˆñBê¢¢G&6∂ñÊu&óf7íÁV&∆ñ5&WfñWt∆ñ÷óFW$∂WíáFˆ∂V‚Ú'Fˆ∂V‚"¢&6ˆFR"¬Fˆ∂V‚«¬6ˆFRì∞¢ñbÇV&∆ñ5&WfñWt∂Wï&FT∆ñ÷óFW"Ê6ÜV6≤ÜñFVÁFñfñW$∂WííÊ∆∆˜vVBí∞¢&WGW&‚&W2Á7FGW2ÉC#ííÊß6ˆ‚á≤W'&˜#¢.äÆòéà~ä>ã^ä~ãNä~ânã^òéòàãNâûòNâ≤àä>ãéâ>ã.ä>äﬁäÆãààNä>ãûòÇ"¬6ˆFS¢%$DUÙƒî‘ïDTB"“ì∞¢–†¢6ˆÁ7B6∆ñVÁB“vóBˆˆ¬Ê6ˆÊÊV7BÇì∞¢G'í∞¢vóB6∆ñVÁBÁVW'íÇ$$Ttî‚"ì∞†¢ÚÚ∆ˆˆ≤FÜR¶ˆ"W'íWÜ7F«íˆÊR7&VFVÁFñ¬FÇ(	BÊWfW"6ˆFRı"Fˆ∂VÊ¿¢ÚÚvÜñ6Çv˜V∆B∆WB6ˆFR÷F6ÇFˆ∂VÊVB¶ˆ"‡¢∆WBß#∞¢ñbáFˆ∂V‚í∞¢ß"“vóB6∆ñVÁBÁVW'íÄ¢4TƒT5B¶ˆ%ˆñB¬¶ˆ%˜7FGW2¬FV6ÜÊñ6ñÂ˜W6W&Ê÷R¬7W7Fˆ÷W%˜&FñÊr¬&ˆˆ∂ñÊu˜Fˆ∂V‚¬7W7Fˆ÷W%˜ÜˆÊR¬6Ê6V∆VEˆ@¢e$Ù“V&∆ñ2Ê¶ˆ'2tÑU$R&ˆˆ∂ñÊu˜Fˆ∂V„“Cƒî‘ïBdı"UDDV¿¢∑Fˆ∂VÂ–¢ì∞¢“V«6Rñbá6V∆V7Fñˆ‚í∞¢ß"“vóB6∆ñVÁBÁVW'íÄ¢4TƒT5B¶ˆ%ˆñB¬¶ˆ%˜7FGW2¬FV6ÜÊñ6ñÂ˜W6W&Ê÷R¬7W7Fˆ÷W%˜&FñÊr¬&ˆˆ∂ñÊu˜Fˆ∂V‚¬7W7Fˆ÷W%˜ÜˆÊR¬6Ê6V∆VEˆ@¢e$Ù“V&∆ñ2Ê¶ˆ'2tÑU$R¶ˆ%ˆñC“Cƒî‘ïBdı"UDDV¿¢∑6V∆V7Fñˆ‚Ê¶ˆ%ˆñE–¢ì∞¢“V«6R∞¢ß"“vóB6∆ñVÁBÁVW'íÄ¢4TƒT5B¶ˆ%ˆñB¬¶ˆ%˜7FGW2¬FV6ÜÊñ6ñÂ˜W6W&Ê÷R¬7W7Fˆ÷W%˜&FñÊr¬&ˆˆ∂ñÊu˜Fˆ∂V‚¬7W7Fˆ÷W%˜ÜˆÊR¬6Ê6V∆VEˆ@¢e$Ù“V&∆ñ2Ê¶ˆ'2tÑU$R&ˆˆ∂ñÊuˆ6ˆFS“Cƒî‘ïBdı"UDDV¿¢∂6ˆFU–¢ì∞¢–†¢6ˆÁ7B¶ˆ"“ß"Á&˜w5≥”∞¢ÚÚ∆¬WFÜ˜&ó6Fñˆ‚fñ«W&W26ˆ∆∆6RFÚˆÊRvVÊW&ñ2CÜÊÚ˜&6∆Rí‡¢6ˆÁ7BFVÁí“Çí”‚≤6ˆÁ7BR“ÊWrW'&˜"ÑtT‰U$î5ı$UdîUuÙU%$ı"ì≤RÊvVÊW&ñ2“G'VS≤Fá&˜rS≤”∞¢ñbÇ¶ˆ"íFVÁíÇì∞†¢6ˆÁ7B¶ˆ$Ü5Fˆ∂V‚“&ˆˆ∆V‚Ö7G&ñÊrÜ¶ˆ"Ê&ˆˆ∂ñÊu˜Fˆ∂V‚«¬""íÁG&ñ“Çíì∞¢ñbáFˆ∂V‚«¬6V∆V7Fñˆ‚í∞¢ÚÚWÜ7B◊Fˆ∂V‚ÊBfW&ñfñVB¶ˆ"÷&˜VÊB6V∆V7Fñˆ‚Fá2&R«&VGíWFÜ˜&ó6VB‡¢“V«6R∞¢ÚÚ∆Vv7í6ˆFRFÉ¢ˆÊ«íf˜"¶ˆ'2FÜBvVÁVñÊV«íÜfRÊÚFˆ∂V‚¬ÊBˆÊ«ê¢ÚÚvóFÇFÜRgV∆¬ÜˆÊR÷F6ÜñÊrWÜ7F«í‡¢ñbÜ¶ˆ$Ü5Fˆ∂V‚íFVÁíÇì∞¢6ˆÁ7B¶ˆ%ÜˆÊTFñvóG2“7G&ñÊrÜ¶ˆ"Ê7W7Fˆ÷W%˜ÜˆÊR«¬""íÁ&W∆6RÇıƒBˆr¬""ì∞¢ñbÇÜˆÊTFñvóG2«¬ÜˆÊTFñvóG2Ê∆VÊwFÇ¬í«¬¶ˆ%ÜˆÊTFñvóG2”“ÜˆÊTFñvóG2íFVÁíÇì∞¢–†¢ñbÖ7G&ñÊrÜ¶ˆ"Ê¶ˆ%˜7FGW2«¬""íÁG&ñ“Çí”“.òäÆä>ò~àéòä^òûär"íFVÁíÇì∞¢ñbÜ¶ˆ"Ê6Ê6V∆VEˆBíFVÁíÇì∞¢ñbÜ¶ˆ"Ê7W7Fˆ÷W%˜&FñÊríFVÁíÇì∞¢ñbÇ¶ˆ"ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷RíFVÁíÇì∞†¢vóB6∆ñVÁBÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2ÁFV6ÜÊñ6ñÂ˜&WfñWw2Ü¶ˆ%ˆñB¬FV6ÜÊñ6ñÂ˜W6W&Ê÷R¬&FñÊr¬&WfñWu˜FWáB¬6ˆ◊∆ñÁE˜FWáBê¢d≈TU2ÇC¬C"¬C2¬CB¬CRê¢Ù‚4Ù‰dƒî5BÜ¶ˆ%ˆñBíDÚ‰ıDÑî‰v¿¢∂¶ˆ"Ê¶ˆ%ˆñB¬¶ˆ"ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷R¬÷FÇÁ&˜VÊBá7F"í¬&WfñWu˜FWáB¬6ˆ◊∆ñÁE˜FWáE–¢ì∞†¢vóB6∆ñVÁBÁVW'íÄ¢UDDRV&∆ñ2Ê¶ˆ'0¢4UB7W7Fˆ÷W%˜&FñÊs“C¿¢7W7Fˆ÷W%˜&WfñWs“C"¿¢7W7Fˆ÷W%ˆ6ˆ◊∆ñÁC“C2¿¢&WfñWvVEˆC‘‰ırÇê¢tÑU$R¶ˆ%ˆñC“CF¿¢¥÷FÇÁ&˜VÊBá7F"í¬&WfñWu˜FWáB¬6ˆ◊∆ñÁE˜FWáB¬¶ˆ"Ê¶ˆ%ˆñE–¢ì∞†¢ÚÚ)»RäﬁãâæòâNâ^àNãòâûâûòàûä^ã^òéä.ä^à~ò.âæä>òNâ˛ä^ò¬éòàò~âÆò>âûàNäﬁä^ãäâûò¬&FñÊrê¢6ˆÁ7B"“vóB6∆ñVÁBÁVW'íÄ¢4TƒT5Bdrá&FñÊrì£¶ÁV÷W&ñ2É√"í2fu˜&FñÊp¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&WfñWw0¢tÑU$RFV6ÜÊñ6ñÂ˜W6W&Ê÷S“C¿¢∂¶ˆ"ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷U–¢ì∞¢6ˆÁ7Bfr“ÁV÷&W"Ü"Á&˜w5≥”ÚÊfu˜&FñÊr«¬ì∞†¢vóB6∆ñVÁBÁVW'íÄ¢UDDRV&∆ñ2ÁFV6ÜÊñ6ñÂ˜&ˆfñ∆W0¢4UB&FñÊs“C¢tÑU$RW6W&Ê÷S“C&¿¢∂fr¬¶ˆ"ÁFV6ÜÊñ6ñÂ˜W6W&Ê÷U–¢ì∞†¢vóB6∆ñVÁBÁVW'íÇ$4Ù‘‘ïB"ì∞¢ÚÚÊÚîí¬Fˆ∂V‚¬˜"W"÷¶ˆ"6ˆÊfó&÷Fñˆ‚FFñ‚FÜR&W7ˆÁ6R‡¢&W2Êß6ˆ‚á≤7V66W73¢G'VR“ì∞¢“6F6ÇÜRí∞¢vóB6∆ñVÁBÁVW'íÇ%$Ùƒƒ$4≤"ì∞¢ÚÚvVÊW&ñ2WFÜ˜&ó6Fñˆ‚ˆV∆ñvñ&ñ∆óGífñ«W&W2ÊWfW"&WfV¬FÜR÷ó6÷F6É∞¢ÚÚˆÊ«ívVÁVñÊRVÊWáV7FVB6W'fW"W'&˜"ó2S‡¢ñbÜRbbRÊvVÊW&ñ2í&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢RÊ÷W76vR“ì∞¢6ˆÁ6ˆ∆RÊW'&˜"Ç%∑V&∆ñ2˜&WfñWu“fñ∆VB"¬≤6ˆFS¢7G&ñÊrÜSÚÊ6ˆFR«¬%$UdîUuÙdîƒTB"í“ì∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.òNäòéäÆã.äã.ä>ânäÆòéà~ä>ã^ä~ãNä~òNâNòíàä>ãéâ>ã.â^ä>ä~àéäÆäﬁâÆòä^à"˛äÆânã.âûãà~ã.âûòä^ãà.òûäﬁäãûä^ä.ã~âûä.ãâûäﬁã^ààNä>ãòûàr"“ì∞¢“fñÊ∆«í∞¢6∆ñVÁBÁ&V∆V6RÇì∞¢–ß“ì∞†¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ*ŸDT4Ç$UdîUu2éàÆòéã.à~âNãûà.òûäﬁàNä~ã.ää>ã^ä~ãNärê¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶ÊvWBÇ"˜FV6ÜÊñ6ñÁ2ÛßW6W&Ê÷R˜&WfñWw2"¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7BW6W&Ê÷R“á&WÁ&◊2ÁW6W&Ê÷R«¬""íÁFı7G&ñÊrÇíÁG&ñ“Çì∞¢ñbÇW6W&Ê÷Rí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢'W6W&Ê÷Räæã.ä""“ì∞†¢G'í∞¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5B&WfñWuˆñB¬¶ˆ%ˆñB¬&FñÊr¬&WfñWu˜FWáB¬6ˆ◊∆ñÁE˜FWáB¬7&VFVEˆ@¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂ˜&WfñWw0¢tÑU$RFV6ÜÊñ6ñÂ˜W6W&Ê÷S“C¢ı$DU"%í7&VFVEˆBDU40¢ƒî‘ïBS¿¢∑W6W&Ê÷U–¢ì∞¢&W2Êß6ˆ‚á"Á&˜w2«¬µ“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.ò.äæä^âNä>ã^ä~ãNä~òNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞†¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	˘YÇEDT‰D‰4P¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶ÊvWBÇ"ˆGFVÊFÊ6R˜7FGW2ÛßW6W&Ê÷R"¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B≤W6W&Ê÷R““&WÁ&◊3∞¢G'í∞¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BGFVÊFÊ6UˆñB¬6∆ˆ6µˆñÂˆB¬6∆ˆ6µˆ˜WEˆ@¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂˆGFVÊFÊ6P¢tÑU$RW6W&Ê÷S“C¢ı$DU"%í7&VFVEˆBDU40¢ƒî‘ïB¿¢∑W6W&Ê÷U–¢ì∞¢&W2Êß6ˆ‚á"Á&˜w5≥“«¬≤6∆ˆ6µˆñÂˆC¢ÁV∆¬¬6∆ˆ6µˆ˜WEˆC¢ÁV∆¬“ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.ò.äæä^âNäÆânã.âûãâ^äﬁàâÆãâ^ä>òNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞†¶Á˜7BÇ"ˆGFVÊFÊ6Rˆ6∆ˆ6∂ñ‚"¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B≤W6W&Ê÷R““&WÊ&ˆGí«¬∑”∞¢ñbÇW6W&Ê÷Rí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.â^òûäﬁà~äÆòéàrW6W&Ê÷R"“ì∞¢G'í∞¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢îÂ4U%BîÂDÚV&∆ñ2ÁFV6ÜÊñ6ñÂˆGFVÊFÊ6RáW6W&Ê÷R¬6∆ˆ6µˆñÂˆBíd≈TU2ÇC¬‰ırÇíê¢$UEU$‰î‰rGFVÊFÊ6UˆñB¬6∆ˆ6µˆñÂˆF¿¢∑W6W&Ê÷U–¢ì∞¢&W2Êß6ˆ‚á≤7V66W73¢G'VR¬‚‚Á"Á&˜w5≥““ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.â^äﬁàâÆãâ^ä>òà.òûã.òNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞†¶Á˜7BÇ"ˆGFVÊFÊ6Rˆ6∆ˆ6∂˜WB"¬7ñÊ2á&W¬&W2í”‚∞¢6ˆÁ7B≤W6W&Ê÷R““&WÊ&ˆGí«¬∑”∞¢ñbÇW6W&Ê÷Rí&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.â^òûäﬁà~äÆòéàrW6W&Ê÷R"“ì∞†¢6ˆÁ7B6∆ñVÁB“vóBˆˆ¬Ê6ˆÊÊV7BÇì∞¢G'í∞¢vóB6∆ñVÁBÁVW'íÇ$$Ttî‚"ì∞†¢6ˆÁ7B"“vóB6∆ñVÁBÁVW'íÄ¢4TƒT5BGFVÊFÊ6Uˆñ@¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂˆGFVÊFÊ6P¢tÑU$RW6W&Ê÷S“C‰B6∆ˆ6µˆ˜WEˆBï2ÂTƒ¿¢ı$DU"%í7&VFVEˆBDU40¢ƒî‘ïB¿¢∑W6W&Ê÷U–¢ì∞¢ñbá"Á&˜w2Ê∆VÊwFÇ””“í∞¢vóB6∆ñVÁBÁVW'íÇ%$Ùƒƒ$4≤"ì∞¢&WGW&‚&W2Á7FGW2ÉCíÊß6ˆ‚á≤W'&˜#¢.ä.ãà~òNäòéòNâNòûâ^äﬁàâÆãâ^ä>òà.òûã""“ì∞¢–†¢6ˆÁ7BGFVÊFÊ6UˆñB“"Á&˜w5≥“ÊGFVÊFÊ6UˆñC∞†¢6ˆÁ7BR“vóB6∆ñVÁBÁVW'íÄ¢UDDRV&∆ñ2ÁFV6ÜÊñ6ñÂˆGFVÊFÊ6P¢4UB6∆ˆ6µˆ˜WEˆB“‰ırÇê¢tÑU$RGFVÊFÊ6UˆñC“C¢$UEU$‰î‰rGFVÊFÊ6UˆñB¬6∆ˆ6µˆñÂˆB¬6∆ˆ6µˆ˜WEˆF¿¢∂GFVÊFÊ6UˆñE–¢ì∞†¢vóB6∆ñVÁBÁVW'íÇ$4Ù‘‘ïB"ì∞¢&W2Êß6ˆ‚á≤7V66W73¢G'VR¬‚‚ÁRÁ&˜w5≥““ì∞¢“6F6ÇÜRí∞¢vóB6∆ñVÁBÁVW'íÇ%$Ùƒƒ$4≤"ì∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.â^äﬁàâÆãâ^ä>äﬁäﬁàòNäòéäÆã>òä>ò~àÇ"“ì∞¢“fñÊ∆«í∞¢6∆ñVÁBÁ&V∆V6RÇì∞¢–ß“ì∞†¶ÊvWBÇ"ˆF÷ñ‚ˆGFVÊFÊ6R˜FˆFí"¬7ñÊ2á&W¬&W2í”‚∞¢G'í∞¢6ˆÁ7B"“vóBˆˆ¬ÁVW'íÄ¢4TƒT5BW6W&Ê÷R¿¢‘ÇÜ6∆ˆ6µˆñÂˆBí2∆7Eˆ6∆ˆ6µˆñ‚¿¢‘ÇÜ6∆ˆ6µˆ˜WEˆBí2∆7Eˆ6∆ˆ6µˆ˜W@¢e$Ù“V&∆ñ2ÁFV6ÜÊñ6ñÂˆGFVÊFÊ6P¢tÑU$R7&VFVEˆC£¶FFR“‰ırÇì£¶FFP¢u$ıU%íW6W&Ê÷P¢ı$DU"%íW6W&Ê÷V ¢ì∞¢&W2Êß6ˆ‚á"Á&˜w2ì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"ÜRì∞¢&W2Á7FGW2ÉSíÊß6ˆ‚á≤W'&˜#¢.ò.äæä^âNâ^äﬁàâÆãâ^ä>ä~ãâûâûã^òûòNäòéäÆã>òä>ò~àÇ"“ì∞¢–ß“ì∞†¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ	¯…4U%dRe$ÙÂDT‰@¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶6ˆÁ7Be$ÙÂDT‰EÙDï"“FÇÊ¶ˆñ‚ÖıˆFó&Ê÷R¬&g&ˆÁFVÊB"ì∞¶6ˆÁ7B$ÙıEÙDï"“ıˆFó&Ê÷S∞†¶gVÊ7Fñˆ‚6VÊDáF÷¬Üfñ∆Rí∞¢6ˆÁ7B“FÇÊ¶ˆñ‚Ñe$ÙÂDT‰EÙDï"¬fñ∆Rì∞¢6ˆÁ7B"“FÇÊ¶ˆñ‚Ö$ÙıEÙDï"¬fñ∆Rì∞¢&WGW&‚g2ÊWÜó7G57ñÊ2áíÚ¢#∞ß–†¶gVÊ7Fñˆ‚6WDîˆffñ6TÊÙ66ÜRá&W2í∞¢&W2Á6WBá∞¢$66ÜR‘6ˆÁG&ˆ¬#¢&ÊÚ◊7F˜&R¬ÊÚ÷66ÜR¬◊W7B◊&Wf∆ñFFR¬&˜áí◊&Wf∆ñFFR"¿¢%&v÷#¢&ÊÚ÷66ÜR"¿¢$Wáó&W2#¢#"¿¢%7W'&ˆvFR‘6ˆÁG&ˆ¬#¢&ÊÚ◊7F˜&R"¿¢“ì∞ß–†¶gVÊ7Fñˆ‚îˆffñ6TÊÙ66ÜRá&W¬&W2¬ÊWáBí∞¢6WDîˆffñ6TÊÙ66ÜRá&W2ì∞¢ÊWáBÇì∞ß–†¢ÚÚ&˜FV7FVBF÷ñ‚vW2FÜB«6ÚWÜó7B2&ˆ˜B7FFñ2fñ∆W2◊W7B&R&Vvó7FW&V@¢ÚÚ&Vf˜&RWá&W72Á7FFñ2Ö$ÙıEÙDï"í¬˜FÜW'vó6R7FFñ26W'fñÊr6‚'ó72WFÇ‡¶ÊvWBÇ"ˆF÷ñ‚◊'FÊW"÷ˆÊ&ˆ&FñÊr"¬&WVó&TF÷ñÂ6W76ñˆ‚¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç&F÷ñ‚◊'FÊW"÷ˆÊ&ˆ&FñÊrÊáF÷¬"ííì∞¶ÊvWBÇ"ˆF÷ñ‚◊'FÊW"÷ˆÊ&ˆ&FñÊrÊáF÷¬"¬&WVó&TF÷ñÂ6W76ñˆ‚¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç&F÷ñ‚◊'FÊW"÷ˆÊ&ˆ&FñÊrÊáF÷¬"ííì∞¶ÊvWBÇ"ˆF÷ñ‚ˆÜˆ÷WvR÷6◊2"¬&WVó&TF÷ñÂ6W76ñˆ‚¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç&F÷ñ‚÷Üˆ÷WvR÷6◊2ÊáF÷¬"ííì∞¶ÊvWBÇ"ˆF÷ñ‚ˆÜˆ÷WvR÷6◊2ÊáF÷¬"¬&WVó&TF÷ñÂ6W76ñˆ‚¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç&F÷ñ‚÷Üˆ÷WvR÷6◊2ÊáF÷¬"ííì∞†¢ÚÚ∆Vv7í7W7Fˆ÷W"VÁG'íˆñÁG2◊W7B&W6ˆ«fR&Vf˜&RWá&W72Á7FFñ26ÚFÜRˆ∆@¢ÚÚÖD‘¬∆ñ6FñˆÁ26‚ÊWfW"&VÊFW"‚∂VWG&6∂ñÊr7&VFVÁFñ«2ñ‚FÜRU$¿¢ÚÚg&v÷VÁBˆb7W7Fˆ÷W"c"¬ÊWfW"ñ‚óG2VW'í7G&ñÊr‡¶ÊvWBÖ≤"ˆ7W7Fˆ÷W""¬"ˆ7W7Fˆ÷W"ÊáF÷¬%“¬Ö˜&W¬&W2í”‚&VFó&V7D∆Vv7î7W7Fˆ÷W%vRá&W2¬5U5DÙ‘U%ÙÙ$ÙÙ¥î‰uıU$¬íì∞¶ÊvWBÖ≤"˜&Vvó7FW""¬"˜&Vvó7FW"ÊáF÷¬%“¬Ö˜&W¬&W2í”‚&VFó&V7D∆Vv7î7W7Fˆ÷W%vRá&W2¬5U5DÙ‘U%Ùı$ÙdîƒUıU$¬íì∞¶ÊvWBÖ≤"˜G&6≤"¬"˜G&6≤ÊáF÷¬%“¬á&W¬&W2í”‚&VFó&V7D∆Vv7î7W7Fˆ÷W%vRá&W2¬∆Vv7ïG&6∂ñÊu&VFó&V7EF&vWBá&Wííì∞†¶ñbÜg2ÊWÜó7G57ñÊ2Ñe$ÙÂDT‰EÙDï"ííÁW6RÜWá&W72Á7FFñ2Ñe$ÙÂDT‰EÙDï"íì∞¶ÁW6RÜWá&W72Á7FFñ2Ö$ÙıEÙDï"íì∞†¢ÚÚ)»Rä>äﬁà~ä>ãâ¢&Vg&W6ÇÙFVW÷∆ñÊ≤òâÆâ¢.òNäòéâ^òûäﬁà~äãRÊáF÷¬"éàãâûä>ã^òâ˛ä>àÆòâNòûà~òNâæäæâûòûã.òä>àê¢ÚÚ“â^ãä~äﬁä.òéã.às¢˜FV6Ç¬ˆF÷ñ‚¬˜G&6≤¬ˆ7W7Fˆ÷W ¶ÁW6RÜ7&VFUvU&˜WFW2á≤6VÊDáF÷¬“íì∞¢ÚÚF÷ñ‚∆ÊFñÊs¢ò>àÆòíc"òâæò~âûäæä^ãàéäæâûòûã.òàòéã.òä^ãNàò>àÆòûòä^òûärê¶ÊvWBÇ"ˆF÷ñ‚÷FB"¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç&F÷ñ‚÷FB◊c"ÊáF÷¬"ííì∞¶ÊvWBÇ"ˆF÷ñ‚◊&WfñWr"¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç&F÷ñ‚◊&WfñWr◊c"ÊáF÷¬"ííì∞¶ÊvWBÇ"ˆF÷ñ‚◊VWVR"¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç&F÷ñ‚◊VWVR◊c"ÊáF÷¬"ííì∞¶ÊvWBÇ"ˆF÷ñ‚÷Üó7F˜'í"¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç&F÷ñ‚÷Üó7F˜'í◊c"ÊáF÷¬"ííì∞¢ÚÚäæâûòûã"∆Vv7íòä^ãNàò>àÆòûòä^òûärò>äæòí&VFó&V7BòNâ≤c ¶ÊvWBÇ"ˆVFóB◊&ˆfñ∆R"¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç&VFóB◊&ˆfñ∆RÊáF÷¬"ííì∞¶ÊvWBÇ"˜FV6Ç"¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç'FV6ÇÊáF÷¬"ííì∞¶ÊvWBÇ"˜'FÊW"÷«í"¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç''FÊW"÷«íÊáF÷¬"ííì∞¶ÊvWBÇ"˜'FÊW"◊7FGW2"¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç''FÊW"◊7FGW2ÊáF÷¬"ííì∞¶ÊvWBÇ"˜'FÊW"÷w&VV÷VÁB"¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç''FÊW"÷w&VV÷VÁBÊáF÷¬"ííì∞¶ÊvWBÇ"˜'FÊW"÷6FV◊í"¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç''FÊW"÷6FV◊íÊáF÷¬"ííì∞¢ÚÚ)»Räæâûòûã.ò>äæäòÉ¢àNã>âûä~â>ä>ã.àNã.â^ãNâNâ^ãòûà~òäﬁä>ò¬éä^ãûààNòûã"ê¶ÊvWBÇ"ˆñÁ7F∆¬◊V˜FR"¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç&ñÁ7F∆¬◊V˜FRÊáF÷¬"ííì∞¢ÚÚ6ÊˆÊñ6¬FÉ¢∂VW6Ü˜'BU$¬¬&VFó&V7BFó&V7B÷fñ∆R66W70¶ÊvWBÇ"ˆñÁ7F∆¬◊V˜FRÊáF÷¬"¬á&W¬&W2í”‚&W2Á&VFó&V7BÉ3"¬"ˆñÁ7F∆¬◊V˜FR"íì∞¶ÊvWBÇ"ˆÜˆ÷R"¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç&ñÊFWÇÊáF÷¬"ííì∞†¶ÊvWBÇ"ˆF÷ñ‚÷FB◊c"ÊáF÷¬"¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç&F÷ñ‚÷FB◊c"ÊáF÷¬"ííì∞¶ÊvWBÇ"ˆF÷ñ‚◊&WfñWr◊c"ÊáF÷¬"¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç&F÷ñ‚◊&WfñWr◊c"ÊáF÷¬"ííì∞¶ÊvWBÇ"ˆF÷ñ‚◊VWVR◊c"ÊáF÷¬"¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç&F÷ñ‚◊VWVR◊c"ÊáF÷¬"ííì∞¶ÊvWBÇ"ˆF÷ñ‚÷Üó7F˜'í◊c"ÊáF÷¬"¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç&F÷ñ‚÷Üó7F˜'í◊c"ÊáF÷¬"ííì∞¶ÊvWBÇ"ˆVFóB◊&ˆfñ∆RÊáF÷¬"¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç&VFóB◊&ˆfñ∆RÊáF÷¬"ííì∞¶ÊvWBÇ"˜FV6ÇÊáF÷¬"¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç'FV6ÇÊáF÷¬"ííì∞¶ÊvWBÇ"˜'FÊW"÷«íÊáF÷¬"¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç''FÊW"÷«íÊáF÷¬"ííì∞¶ÊvWBÇ"˜'FÊW"◊7FGW2ÊáF÷¬"¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç''FÊW"◊7FGW2ÊáF÷¬"ííì∞¶ÊvWBÇ"˜'FÊW"÷w&VV÷VÁBÊáF÷¬"¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç''FÊW"÷w&VV÷VÁBÊáF÷¬"ííì∞¶ÊvWBÇ"˜'FÊW"÷6FV◊íÊáF÷¬"¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç''FÊW"÷6FV◊íÊáF÷¬"ííì∞¶ÊvWBÇ"ˆñÊFWÇÊáF÷¬"¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç&ñÊFWÇÊáF÷¬"ííì∞¶ÊvWBÇ"Ú"¬á&W¬&W2í”‚&W2Á6VÊDfñ∆Rá6VÊDáF÷¬Ç&∆ˆvñ‚ÊáF÷¬"ííì∞†¢ÚÚ””””””””””””””””””””””””””””””””””””””–¢ÚÚ)»R5D%B4U%dU"ÑÖEE2fó'7B¬f∆∆&6≤ÖEEê¢ÚÚ””””””””””””””””””””””””””””””””””””””–¶6ˆÁ7Bı%B“&ˆ6W72ÊVÁbÂı%B«¬3∞¶6ˆÁ7BÑı5B“#„„„#∞†¶6ˆÁ7B4U%EÙ¥UïıDÇ“&ˆ6W72ÊVÁb‰ÖEE5Ù¥UïıDÇ«¬"‚ˆ6W'BÛì"„cÇ„„R≥"÷∂WíÁV“#∞¶6ˆÁ7B4U%EÙ5%EıDÇ“&ˆ6W72ÊVÁb‰ÖEE5Ù4U%EıDÇ«¬"‚ˆ6W'BÛì"„cÇ„„R≥"ÁV“#∞†¢ÚÚWFÚ÷«íFÜRFFóFófR7F˜&R'Wí÷f∆˜r÷ñw&FñˆÁ2ˆ‚&ˆ˜B6ÚÊÚ÷ÁV¬4ƒê¢ÚÚ7FWó2ÊVVFVB(	BFW∆˜ññÊr˜&W7F'FñÊrFÜRó2VÊ˜VvÇ‚V6Ç÷ñw&Fñˆ‚ó0¢ÚÚñFV◊˜FVÁB¬Gfó6˜'í÷∆ˆ6∂VB¬FFóFófR÷ˆÊ«íÜÊÚG&˜ˆFV∆WFR˜&Ww&óFRˆ`¢ÚÚWÜó7FñÊrFFíÊB6V∆b◊fW&ñfñVC≤Áífñ«W&Ró2∆ˆvvVBÊBÊWfW"&∆ˆ6∑0¢ÚÚ6W'fñÊráFÜRffV7FVB&˜WFW2«&VGí&WGW&‚S2VÁFñ¬FÜR66ÜV÷WÜó7G2íÊ@¢ÚÚó2&WG&ñVBˆ‚FÜRÊWáB&ˆ˜B‡¶gVÊ7Fñˆ‚VÁ7W&U7F˜&T'Wî÷ñw&FñˆÁ4∆ñVBÇí∞¢G'í∞¢6ˆÁ7B≤'V‰∆¬““&WVó&RÇ"‚˜67&óG2˜'V‚◊7F˜&R÷'Wí÷÷ñw&FñˆÁ2"ì∞¢&ˆ÷ó6RÁ&W6ˆ«fRá'V‰∆¬Çíê¢ÁFÜV‚ÇÜ6ˆFRí”‚∞¢ñbÜ6ˆFR””“í6ˆÁ6ˆ∆RÊ∆ˆrÇ.)»R7F˜&R'Wí÷f∆˜r÷ñw&FñˆÁ2VÁ7W&VB"ì∞¢V«6R6ˆÁ6ˆ∆RÊW'&˜"Ç.)™˚àÚ7F˜&R'Wí÷f∆˜r÷ñw&FñˆÁ2Ê˜BgV∆«í∆ñVBávñ∆¬&WG'íÊWáB&ˆ˜Bí"ì∞¢“ê¢Ê6F6ÇÇÜRí”‚6ˆÁ6ˆ∆RÊW'&˜"Ç.)™˚àÚ7F˜&R'Wí÷f∆˜r÷ñw&Fñˆ‚W'&˜#¢"¬RbbRÊ÷W76vRíì∞¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Ç.)™˚àÚ7F˜&R'Wí÷f∆˜r÷ñw&Fñˆ‚&ˆ˜G7G&6∂óVC¢"¬RbbRÊ÷W76vRì∞¢–ß–†¶gVÊ7Fñˆ‚7F'E6W'fW"Çí∞¢G'í∞¢ñbÜg2ÊWÜó7G57ñÊ2Ñ4U%EÙ¥UïıDÇíbbg2ÊWÜó7G57ñÊ2Ñ4U%EÙ5%EıDÇíí∞¢6ˆÁ7B˜FñˆÁ2“∞¢∂Wì¢g2Á&VDfñ∆U7ñÊ2Ñ4U%EÙ¥UïıDÇí¿¢6W'C¢g2Á&VDfñ∆U7ñÊ2Ñ4U%EÙ5%EıDÇí¿¢”∞†¢áGG2Ê7&VFU6W'fW"Ü˜FñˆÁ2¬íÊ∆ó7FV‚Öı%B¬Ñı5B¬Çí”‚∞¢6ˆÁ6ˆ∆RÊ∆ˆrÜ	˘I"ÖEE25tb6W'fW"'VÊÊñÊvì∞¢6ˆÁ6ˆ∆RÊ∆ˆrÜ	˘I"∆ˆ6√¢áGG3¢Úˆ∆ˆ6∆Ü˜7C¢Gµı%G÷ì∞¢7F'EW&vVÁDfñÊ∆ó¶W%'VÊÊW"Çì∞¢7F'D'Fñ6∆U7ñÊ5'VÊÊW"Çì∞¢VÁ7W&U7F˜&T'Wî÷ñw&FñˆÁ4∆ñVBÇì∞¢“ì∞¢&WGW&„∞¢–¢“6F6ÇÜRí∞¢6ˆÁ6ˆ∆RÊW'&˜"Ç$ÖEE2ñÊóBfñ∆VB¬f∆∆&6≤FÚÖEE¢"¬Rì∞¢–†¢Ê∆ó7FV‚Öı%B¬Ñı5B¬Çí”‚∞¢6ˆÁ6ˆ∆RÊ∆ˆrÜ	¯…ÖEE5tb6W'fW"'VÊÊñÊrBáGG¢Úˆ∆ˆ6∆Ü˜7C¢Gµı%G÷ì∞¢7F'EW&vVÁDfñÊ∆ó¶W%'VÊÊW"Çì∞¢7F'D'Fñ6∆U7ñÊ5'VÊÊW"Çì∞¢VÁ7W&U7F˜&T'Wî÷ñw&FñˆÁ4∆ñVBÇì∞¢“ì∞ß–†ß7F'E6W'fW"Çì∞