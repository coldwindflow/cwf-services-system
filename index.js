/**
 * CWF Backend (Express) - FIXED
 * - à¸£à¸§à¸¡à¸—à¸¸à¸ route à¹ƒà¸«à¹‰à¸–à¸¹à¸à¸•à¹‰à¸­à¸‡ (à¹à¸à¹‰ syntax/à¸§à¸‡à¹€à¸¥à¹‡à¸šà¸«à¸¥à¸¸à¸”/à¹‚à¸„à¹‰à¸”à¹à¸—à¸£à¸à¸à¸¥à¸²à¸‡à¸šà¸£à¸£à¸—à¸±à¸”)
 * - à¸£à¸­à¸‡à¸£à¸±à¸š: booking_code CWF+7, public booking/track, forced/offer, accept_status, attendance,
 *          docs quote/receipt, profile requests, photos, checkin
 */

try {
  require("dotenv").config();
} catch (e) {
  console.warn("âš ï¸ dotenv not installed or failed to load:", e.message);
}

// =======================================
// ğŸ•’ TIMEZONE (Fix: à¹€à¸§à¸¥à¸²à¹€à¸à¸µà¹‰à¸¢à¸™ +7 à¸Šà¸¡.)
// - Server (à¹€à¸Šà¹ˆà¸™ Render) à¸¡à¸±à¸à¹ƒà¸Šà¹‰ UTC
// - à¹à¸•à¹ˆà¸£à¸°à¸šà¸š CWF à¹ƒà¸Šà¹‰à¹€à¸§à¸¥à¸²à¹„à¸—à¸¢ (Asia/Bangkok)
// - à¸•à¸±à¹‰à¸‡à¸„à¹ˆà¸² TZ à¹ƒà¸«à¹‰ Node à¹€à¸à¸·à¹ˆà¸­à¹ƒà¸«à¹‰à¸à¸²à¸£ format à¹€à¸§à¸¥à¸²à¹ƒà¸™à¸à¸±à¹ˆà¸‡ server à¸•à¸£à¸‡
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
const { createUrgentDispatchService } = require("./server/services/urgent/dispatch");
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
const { pendingCustomerScheduledReservationSql } = require("./server/services/booking/bookingStatuses");
const { createBookingApprovalService } = require("./server/services/booking/bookingApprovalService");
const { registerBookingApprovalRoutes } = require("./server/routes/admin/bookingApprovals");
const { registerPublicCustomerBookingRoutes } = require("./server/routes/public/customerBookings");
const { registerAdminBookingRoutes } = require("./server/routes/admin/adminBookings");
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
// ğŸ”” Web Push Notifications (optional / fail-open)
// - à¹ƒà¸Šà¹‰à¹à¸ˆà¹‰à¸‡à¹€à¸•à¸·à¸­à¸™à¸‡à¸²à¸™à¹€à¸‚à¹‰à¸²à¹ƒà¸«à¹‰à¸Šà¹ˆà¸²à¸‡ à¹à¸¡à¹‰à¸›à¸´à¸”à¸«à¸™à¹‰à¸² PWA
// - à¸–à¹‰à¸² package/ENV à¹„à¸¡à¹ˆà¸à¸£à¹‰à¸­à¸¡ à¸£à¸°à¸šà¸šà¸‡à¸²à¸™à¹€à¸”à¸´à¸¡à¸•à¹‰à¸­à¸‡à¹„à¸¡à¹ˆà¸à¸±à¸‡
// =======================================
let webpush = null;
try {
  webpush = require("web-push");
} catch (e) {
  console.warn("âš ï¸ web-push not installed; push notifications disabled");
}

// =======================================
// ğŸš© FEATURE FLAGS (safe / backward compatible)
// - à¹€à¸›à¸´à¸”/à¸›à¸´à¸”à¸à¸²à¸£à¹‚à¸Šà¸§à¹Œà¸—à¸µà¸¡à¸Šà¹ˆà¸²à¸‡ + à¹€à¸šà¸­à¸£à¹Œà¹‚à¸—à¸£à¹ƒà¸™ Tracking à¹à¸šà¸šà¹„à¸¡à¹ˆà¸à¸£à¸°à¸—à¸šà¸‚à¸­à¸‡à¹€à¸”à¸´à¸¡
// - à¸„à¹ˆà¸²à¹€à¸£à¸´à¹ˆà¸¡à¸•à¹‰à¸™: à¹€à¸›à¸´à¸” (true) à¸•à¸²à¸¡ requirement à¹à¸¥à¸°à¸¢à¸±à¸‡à¸•à¹‰à¸­à¸‡à¸œà¹ˆà¸²à¸™à¸¥à¸´à¸‡à¸à¹Œ tracking à¸—à¸µà¹ˆà¸–à¸¹à¸à¸•à¹‰à¸­à¸‡à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™
// =======================================
function envBool(name, defVal = false) {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  if (!v) return defVal;
  return ["1", "true", "yes", "on"].includes(v);
}

const FLAG_SHOW_TECH_TEAM_ON_TRACKING = envBool("SHOW_TECH_TEAM_ON_TRACKING", true);
const FLAG_SHOW_TECH_PHONE_ON_TRACKING = envBool("SHOW_TECH_PHONE_ON_TRACKING", true);

const ENABLE_AVAILABILITY_V2 = envBool("ENABLE_AVAILABILITY_V2", true);
// âœ… Safe toggle: urgent offer flow (public booking + offers)
const ENABLE_URGENT_FLOW = envBool("ENABLE_URGENT_FLOW", true);
// ğŸ”’ Customer App booking kill switches â€” FAIL CLOSED by design: customer
// self-booking stays OFF until the operator explicitly enables each lane in
// the environment. When off, /public/book answers 503 with a machine-readable
// code + LINE contact URL so the app can hand the customer to a human without
// ever creating a job (no job = no duplicate risk). Admin booking flows are
// NOT affected by these flags.
const ENABLE_CUSTOMER_SCHEDULED_BOOKING = envBool("ENABLE_CUSTOMER_SCHEDULED_BOOKING", false);
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
  catch (e) { console.warn("âš ï¸ web-push VAPID setup failed", e.message); }
}
const TRAVEL_BUFFER_MIN = jobTiming.TURNAROUND_BUFFER_MIN; // à¸™à¸²à¸—à¸µ/à¸‡à¸²à¸™ (Travel Buffer)

const SERVICE_ZONE_SEEDS = [
  { code: "A", name: "bangkok_east_core", label: "à¸à¸£à¸¸à¸‡à¹€à¸—à¸à¸•à¸°à¸§à¸±à¸™à¸­à¸­à¸à¹à¸à¸™à¸«à¸¥à¸±à¸", group: "bangkok", color: "#0B4BB3", order: 10, districts: ["à¸à¸£à¸°à¹‚à¸‚à¸™à¸‡", "à¸šà¸²à¸‡à¸™à¸²", "à¸ªà¸§à¸™à¸«à¸¥à¸§à¸‡", "à¸›à¸£à¸°à¹€à¸§à¸¨", "à¸šà¸²à¸‡à¸à¸°à¸›à¸´", "à¸ªà¸°à¸à¸²à¸™à¸ªà¸¹à¸‡", "à¸¥à¸²à¸”à¸à¸£à¸°à¸šà¸±à¸‡"] },
  { code: "B", name: "bangkok_north_east", label: "à¸à¸£à¸¸à¸‡à¹€à¸—à¸à¹€à¸«à¸™à¸·à¸­-à¸•à¸°à¸§à¸±à¸™à¸­à¸­à¸", group: "bangkok", color: "#2563EB", order: 20, districts: ["à¸”à¸­à¸™à¹€à¸¡à¸·à¸­à¸‡", "à¸ªà¸²à¸¢à¹„à¸«à¸¡", "à¸šà¸²à¸‡à¹€à¸‚à¸™", "à¸«à¸¥à¸±à¸à¸ªà¸µà¹ˆ", "à¸ˆà¸•à¸¸à¸ˆà¸±à¸à¸£", "à¸šà¸²à¸‡à¸‹à¸·à¹ˆà¸­", "à¸¥à¸²à¸”à¸à¸£à¹‰à¸²à¸§", "à¸§à¸±à¸‡à¸—à¸­à¸‡à¸«à¸¥à¸²à¸‡", "à¸šà¸¶à¸‡à¸à¸¸à¹ˆà¸¡", "à¸„à¸±à¸™à¸™à¸²à¸¢à¸²à¸§", "à¸„à¸¥à¸­à¸‡à¸ªà¸²à¸¡à¸§à¸²", "à¸¡à¸µà¸™à¸šà¸¸à¸£à¸µ", "à¸«à¸™à¸­à¸‡à¸ˆà¸­à¸"] },
  { code: "C", name: "bangkok_inner", label: "à¸à¸£à¸¸à¸‡à¹€à¸—à¸à¸Šà¸±à¹‰à¸™à¹ƒà¸™", group: "bangkok", color: "#06B6D4", order: 30, districts: ["à¸›à¸—à¸¸à¸¡à¸§à¸±à¸™", "à¸£à¸²à¸Šà¹€à¸—à¸§à¸µ", "à¸à¸à¸²à¹„à¸—", "à¸”à¸¸à¸ªà¸´à¸•", "à¸à¸£à¸°à¸™à¸„à¸£", "à¸›à¹‰à¸­à¸¡à¸›à¸£à¸²à¸šà¸¨à¸±à¸•à¸£à¸¹à¸à¹ˆà¸²à¸¢", "à¸ªà¸±à¸¡à¸à¸±à¸™à¸˜à¸§à¸‡à¸¨à¹Œ", "à¸šà¸²à¸‡à¸£à¸±à¸", "à¸ªà¸²à¸—à¸£", "à¸¢à¸²à¸™à¸™à¸²à¸§à¸²", "à¸«à¹‰à¸§à¸¢à¸‚à¸§à¸²à¸‡", "à¸”à¸´à¸™à¹à¸”à¸‡", "à¸§à¸±à¸’à¸™à¸²", "à¸„à¸¥à¸­à¸‡à¹€à¸•à¸¢", "à¸šà¸²à¸‡à¸„à¸­à¹à¸«à¸¥à¸¡"] },
  { code: "D", name: "thonburi_inner", label: "à¸˜à¸™à¸šà¸¸à¸£à¸µà¸•à¸­à¸™à¹ƒà¸™", group: "bangkok_west", color: "#10B981", order: 40, districts: ["à¸„à¸¥à¸­à¸‡à¸ªà¸²à¸™", "à¸˜à¸™à¸šà¸¸à¸£à¸µ", "à¸šà¸²à¸‡à¸à¸­à¸à¹ƒà¸«à¸à¹ˆ", "à¸šà¸²à¸‡à¸à¸­à¸à¸™à¹‰à¸­à¸¢", "à¸šà¸²à¸‡à¸à¸¥à¸±à¸”", "à¸•à¸¥à¸´à¹ˆà¸‡à¸Šà¸±à¸™"] },
  { code: "E", name: "west_southwest_river_side", label: "à¸à¸±à¹ˆà¸‡à¸•à¸°à¸§à¸±à¸™à¸•à¸à¸•à¸­à¸™à¸¥à¹ˆà¸²à¸‡ / à¸‚à¹‰à¸²à¸¡à¸à¸±à¹ˆà¸‡à¹à¸¡à¹ˆà¸™à¹‰à¸³", group: "bangkok_west", color: "#F59E0B", order: 50, districts: ["à¸ à¸²à¸©à¸µà¹€à¸ˆà¸£à¸´à¸", "à¸šà¸²à¸‡à¹à¸„", "à¸«à¸™à¸­à¸‡à¹à¸‚à¸¡", "à¸—à¸§à¸µà¸§à¸±à¸’à¸™à¸²", "à¸ˆà¸­à¸¡à¸—à¸­à¸‡", "à¸£à¸²à¸©à¸à¸£à¹Œà¸šà¸¹à¸£à¸“à¸°", "à¸—à¸¸à¹ˆà¸‡à¸„à¸£à¸¸", "à¸šà¸²à¸‡à¸‚à¸¸à¸™à¹€à¸—à¸µà¸¢à¸™", "à¸šà¸²à¸‡à¸šà¸­à¸™", "à¸à¸£à¸°à¸›à¸£à¸°à¹à¸”à¸‡", "à¸à¸£à¸°à¸ªà¸¡à¸¸à¸—à¸£à¹€à¸ˆà¸”à¸µà¸¢à¹Œ"] },
  { code: "F", name: "samut_prakan_east", label: "à¸ªà¸¡à¸¸à¸—à¸£à¸›à¸£à¸²à¸à¸²à¸£à¸à¸±à¹ˆà¸‡à¸•à¸°à¸§à¸±à¸™à¸­à¸­à¸", group: "samut_prakan", color: "#EF4444", order: 60, districts: ["à¹€à¸¡à¸·à¸­à¸‡à¸ªà¸¡à¸¸à¸—à¸£à¸›à¸£à¸²à¸à¸²à¸£", "à¸šà¸²à¸‡à¸à¸¥à¸µ", "à¸šà¸²à¸‡à¹€à¸ªà¸²à¸˜à¸‡", "à¸šà¸²à¸‡à¸šà¹ˆà¸­"] },
  { code: "G", name: "nonthaburi", label: "à¸™à¸™à¸—à¸šà¸¸à¸£à¸µ", group: "nonthaburi", color: "#8B5CF6", order: 70, districts: ["à¹€à¸¡à¸·à¸­à¸‡à¸™à¸™à¸—à¸šà¸¸à¸£à¸µ", "à¸›à¸²à¸à¹€à¸à¸£à¹‡à¸”", "à¸šà¸²à¸‡à¸à¸£à¸§à¸¢", "à¸šà¸²à¸‡à¹ƒà¸«à¸à¹ˆ", "à¸šà¸²à¸‡à¸šà¸±à¸§à¸—à¸­à¸‡", "à¹„à¸—à¸£à¸™à¹‰à¸­à¸¢"] },
  { code: "H", name: "pathum_thani", label: "à¸›à¸—à¸¸à¸¡à¸˜à¸²à¸™à¸µ", group: "pathum_thani", color: "#EC4899", order: 80, districts: ["à¹€à¸¡à¸·à¸­à¸‡à¸›à¸—à¸¸à¸¡à¸˜à¸²à¸™à¸µ", "à¸„à¸¥à¸­à¸‡à¸«à¸¥à¸§à¸‡", "à¸˜à¸±à¸à¸šà¸¸à¸£à¸µ", "à¸¥à¸³à¸¥à¸¹à¸à¸à¸²", "à¸«à¸™à¸­à¸‡à¹€à¸ªà¸·à¸­", "à¸¥à¸²à¸”à¸«à¸¥à¸¸à¸¡à¹à¸à¹‰à¸§", "à¸ªà¸²à¸¡à¹‚à¸„à¸"] },
];
const SERVICE_ZONE_BY_CODE = new Map(SERVICE_ZONE_SEEDS.map(z => [z.code, z]));

function normalizeThaiAreaText(v) {
  return String(v || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .replace(/^(à¹€à¸‚à¸Ûµã‹h‘éì¶»§q«^uÑ…°€ô9Õµ‰•È¡¥Ğ¹ÅÑä¤€¨9Õµ‰•È¡¥Ğ¹Õ¹¥Ñ}ÁÉ¥”¤ì4(€€€ÑÉäì4(€€€€€…İ…¥Ğ±¥•¹Ğ¹ÅÕ•Éä 4(€€€€€€€%9MIP%9Q<ÁÕ‰±¥Œ¹©½‰}¥Ñ•µÌ€¡©½‰}¥°¥Ñ•µ}¥°¥Ñ•µ}¹…µ”°ÅÑä°Õ¹¥Ñ}ÁÉ¥”°±¥¹•}Ñ½Ñ…°°…ÍÍ¥¹•‘}Ñ•¡¹¥¥…¹}ÕÍ•É¹…µ”°¥Í}Í•ÉÙ¥”¤4(€€€€€€€€Y1UL€ Ä°È°Ì°Ğ°Ô°Ø°Ü°à¥€°4(€€€€€€€m©½‰}¥°¥Ğ¹¥Ñ•µ}¥°¥Ğ¹¥Ñ•µ}¹…µ”°¥Ğ¹ÅÑä°¥Ğ¹Õ¹¥Ñ}ÁÉ¥”°±¥¹•}Ñ½Ñ…°°¥Ğ¹…ÍÍ¥¹•‘}Ñ•¡¹¥¥…¹}ÕÍ•É¹…µ”ñğ¹Õ±°°€„…¥Ğ¹¥Í}Í•ÉÙ¥•t4(€€€€€€¤ì4(€€€ô…Ñ €¡”¤ì4(€€€€€¥˜€¡MÑÉ¥¹œ¡”ü¹µ•ÍÍ…”ñğ€ˆˆ¤¹¥¹±Õ‘•Ì ‰…ÍÍ¥¹•‘}Ñ•¡¹¥¥…¹}ÕÍ•É¹…µ”ˆ¤¤ì4(€€€€€€€…İ…¥Ğ±¥•¹Ğ¹ÅÕ•Éä 4(€€€€€€€€€%9MIP%9Q<ÁÕ‰±¥Œ¹©½‰}¥Ñ•µÌ€¡©½‰}¥°¥Ñ•µ}¥°¥Ñ•µ}¹…µ”°ÅÑä°Õ¹¥Ñ}ÁÉ¥”°±¥¹•}Ñ½Ñ…°°¥Í}Í•ÉÙ¥”¤4(€€€€€€€€€€Y1UL€ Ä°È°Ì°Ğ°Ô°Ø°Ü¥€°4(€€€€€€€€€m©½‰}¥°¥Ğ¹¥Ñ•µ}¥°¥Ğ¹¥Ñ•µ}¹…µ”°¥Ğ¹ÅÑä°¥Ğ¹Õ¹¥Ñ}ÁÉ¥”°±¥¹•}Ñ½Ñ…°°€„…¥Ğ¹¥Í}Í•ÉÙ¥•t4(€€€€€€€€¤ì4(€€€€€ô•±Í”ì4(€€€€€€€Ñ¡É½Ü”ì4(€€€€€ô4(€€€ô4(€ô4(4(€¥˜€¡ÁÉ½µ¼€˜˜Í…™•%Ñ•µÌ¹±•¹Ñ ¤ì4(€€€…İ…¥Ğ±¥•¹Ğ¹ÅÕ•Éä 4(€€€€€%9MIP%9Q<ÁÕ‰±¥Œ¹©½‰}ÁÉ½µ½Ñ¥½¹Ì€¡©½‰}¥°ÁÉ½µ½}¥°…ÁÁ±¥•‘}‘¥Í½Õ¹Ğ¤4(€€€€€€Y1UL€ Ä°È°Ì¥€°4(€€€€€m©½‰}¥°ÁÉ½µ¼¹ÁÉ½µ½}¥°ÁÉ¥¥¹œ¹‘¥Í½Õ¹Ñt4(€€€€¤ì4(€ô4(4(€…İ…¥Ğ±¥•¹Ğ¹ÅÕ•Éä¡UAQÁÕ‰±¥Œ¹©½‰ÌMP©½‰}ÁÉ¥”ôÄ]!I©½‰}¥ôÉ€°mÁÉ¥¥¹œ¹Ñ½Ñ…°°©½‰}¥‘t¤ì4(4(€€¼¼-••ÀÁ•ÈµÕ¹¥Ğ•Ù¥‘•¹”É•ÅÕ¥É•µ•¹ÑÌ¥¸Íå¹Œİ¥Ñ Ñ¡”±…Ñ•ÍĞ…‘µ¥¸µ•‘¥Ñ•©½‰}¥Ñ•µÌ¸4(€€¼¼]¡•¸…‘µ¥¸É•‘Õ•Ì€Èµ…¡¥¹•ÌÑ¼€Ä½¸µÍ¥Ñ”°Ñ¡”•áÑÉ„©½‰}Õ¹¥Ğ¥Ìµ…É­•…¹•±±•4(€€¼¼Í¼Ñ•¡¹¥¥…¸±½Í”Ù…±¥‘…Ñ¥½¸¹¼±½¹•ÈÉ•ÅÕ¥É•ÌÁ¡½Ñ½Ì½¡•­±¥ÍÑÌ™½È¥Ğ¸4(€…İ…¥ĞÍå¹)½‰U¹¥ÑÍÉ½µ)½‰%Ñ•µÌ¡©½‰}¥°±¥•¹Ğ¤ì4(4(€É•ÑÕÉ¸ìÁÉ¥¥¹œ°Í…™•%Ñ•µÌ°ÁÉ½µ½Ñ¥½¸èÁÉ½µ¼ôì4)ô4(4)…Íå¹Œ™Õ¹Ñ¥½¸Í…Ù•)½‰Q•…µ]¥Ñ¡±¥•¹Ğ¡±¥•¹Ğ°©½‰}¥°µ•µ‰•ÉÌ°ÁÉ¥µ…ÉåÉ½µ	½‘ä°½ÁÑ¥½¹Ì€ôíô¤ì4(€½¹ÍĞ¹½Éµ…±¥é•€ô¹½Éµ…±¥é•‘µ¥¹‘¥ÑQ•…µM¹…ÁÍ¡½Ğ¡ìµ•µ‰•ÉÌ°ÁÉ¥µ…Éå}ÕÍ•É¹…µ”èÁÉ¥µ…ÉåÉ½µ	½‘äô¤ì4(€½¹ÍĞÍ…™”€ô¹½Éµ…±¥é•¹µ•µ‰•ÉÌì4(€½¹ÍĞ•áÁ±¥¥ÑAÉ¥µ…Éä€ô¹½Éµ…±¥é•¹ÁÉ¥µ…Éå}ÕÍ•É¹…µ”ì4(€½¹ÍĞÍ­¥Á½±±¥Í¥½¹¡•¬€ô€„…½ÁÑ¥½¹Ì¹Í­¥Á½±±¥Í¥½¹¡•¬ì4(€½¹ÍĞ‰…Í•Q•…µM¹…ÁÍ¡½Ğ€ô½ÁÑ¥½¹Ì¹‰…Í•Q•…µM¹…ÁÍ¡½Ğì4(4(€½¹ÍĞ©½‰I½Ü€ô…İ…¥Ğ±¥•¹Ğ¹ÅÕ•Éä 4(€€€M1PÑ•¡¹¥¥…¹}ÕÍ•É¹…µ”°Ñ•¡¹¥¥…¹}Ñ•…´4(€€€€I=4ÁÕ‰±¥Œ¹©½‰Ì4(€€€€]!I©½‰}¥ôÄ4(€€€€=HUAQ€°4(€€€m©½‰}¥‘t4(€€¤ì4(€½¹ÍĞÕÉ)½ˆ€ô©½‰I½Ü¹É½İÌü¹lÁtñğíôì4(4(€½¹ÍĞÕÉÉ•¹ÑQ•…µM¹…ÁÍ¡½Ğ€ô…İ…¥Ğ±½…‘)½‰Q•…µM¹…ÁÍ¡½Ñ½É‘µ¥¹‘¥Ğ¡±¥•¹Ğ°©½‰}¥¤ì4(€¥˜€¡‰…Í•Q•…µM¹…ÁÍ¡½Ğ€„ôôÕ¹‘•™¥¹•¤ì4(€€€€¼¼M…µ”ÁÉ½Ñ•Ñ¥½¸™½ÈÑ•…´•‘¥ÑÌè‘¼¹½Ğ½Ù•ÉİÉ¥Ñ”„¹•İ•ÈÑ•…´½±•…‘•È¡…¹”Í¥±•¹Ñ±ä¸4(€€€•¹ÍÕÉ•‘µ¥¹‘¥ÑM¹…ÁÍ¡½Ñ5…Ñ¡•Ì 4(€€€€€¹½Éµ…±¥é•‘µ¥¹‘¥ÑQ•…µM¹…ÁÍ¡½Ğ¡‰…Í•Q•…µM¹…ÁÍ¡½Ğ¤°4(€€€€€ÕÉÉ•¹ÑQ•…µM¹…ÁÍ¡½Ğ°4(€€€€€€Ÿ‚â‡‚â×‚â‚âË‚â‚æ‚â‚æ'‚æ‚â‚â_‚â×‚â‡‚â+‚æ#‚âË‚â‚â#‚âË‚â‚â¯‚âg‚æ'‚âË‚â#‚â·‚â·‚âß‚æ#‚âg‚â‚æ#‚â·‚âg‚â¯‚âg‚æ'‚âË‚âg‚â×‚æ$ƒ‚â‚âÃ‚âk‚âk‚â‹‚âÇ‚â‚æ‚â‡‚æ#‚âk‚âÇ‚âg‚â_‚âÛ‚â‚â_‚âÇ‚âk‚â‚æ'‚â·‚â‡‚âç‚â—‚â‚â·‚âk‚âg‚â×‚æ$ƒ‚â‚â‚âã‚âO‚âË‚â‚â×‚æ‚â¯‚â—‚âS‚æ‚âk‚â‚âË‚âg‚æ‚â—‚æ'‚âŸ‚âW‚â‚âŸ‚â#‚â«‚â·‚âk‚â‚æ#‚â·‚âg‚âk‚âÇ‚âg‚â_‚âÛ‚â‚æ‚â¯‚â‡‚æ œ°4(€€€€€ì½‘”è€MQ1}Q4œô4(€€€€¤ì4(€ô4(4(€½¹ÍĞÁ¥­AÉ¥µ…Éä€ô€ ¤€ôøì4(€€€¥˜€¡•áÁ±¥¥ÑAÉ¥µ…Éä€˜˜Í…™”¹¥¹±Õ‘•Ì¡•áÁ±¥¥ÑAÉ¥µ…Éä¤¤É•ÑÕÉ¸•áÁ±¥¥ÑAÉ¥µ…Éäì4(€€€½¹ÍĞÕÉAÉ¥µ…Éä€ôMÑÉ¥¹œ¡ÕÉ)½ˆ¹Ñ•¡¹¥¥…¹}ÕÍ•É¹…µ”ñğ€œœ¤¹ÑÉ¥´ ¤ì4(€€€¥˜€¡ÕÉAÉ¥µ…Éä€˜˜Í…™”¹¥¹±Õ‘•Ì¡ÕÉAÉ¥µ…Éä¤¤É•ÑÕÉ¸ÕÉAÉ¥µ…Éäì4(€€€É•ÑÕÉ¸Í…™•lÁtñğ¹Õ±°ì4(€ôì4(€½¹ÍĞÁÉ¥µ…Éä€ôÁ¥­AÉ¥µ…Éä ¤ì4(4(€¥˜€ …Í­¥Á½±±¥Í¥½¹¡•¬¤ì4(€€€½¹ÍĞ©È€ô…İ…¥Ğ±¥•¹Ğ¹ÅÕ•Éä 4(€€€€€M1P…ÁÁ½¥¹Ñµ•¹Ñ}‘…Ñ•Ñ¥µ”°=1M¡‘ÕÉ…Ñ¥½¹}µ¥¸°ØÀ¤L‘ÕÉ…Ñ¥½¹}µ¥¸°=1M¡©½‰}ÑåÁ”°œœ¤L©½‰}ÑåÁ”4(€€€€€€I=4ÁÕ‰±¥Œ¹©½‰Ì]!I©½‰}¥ôÄ=HUAQ€°4(€€€€€m©½‰}¥‘t4(€€€€¤ì4(€€€¥˜€¡©È¹É½İÌ¹±•¹Ñ ¤ì4(€€€€€½¹ÍĞ…ÁÁĞ€ô©È¹É½İÍlÁt¹…ÁÁ½¥¹Ñµ•¹Ñ}‘…Ñ•Ñ¥µ”ì4(€€€€€½¹ÍĞ‘ÕÈ€ô9Õµ‰•È¡©È¹É½İÍlÁt¹‘ÕÉ…Ñ¥½¹}µ¥¸ñğ€ØÀ¤ì4(€€€€€½¹ÍĞ©½‰QåÁ”€ôMÑÉ¥¹œ¡©È¹É½İÍlÁt¹©½‰}ÑåÁ”ñğ€œœ¤¹ÑÉ¥´ ¤ì4(€€€€€¥˜€¡…ÁÁĞ¤ì4(€€€€€€€™½È€¡½¹ÍĞÔ½˜Í…™”¤ì4(€€€€€€€€€½¹ÍĞÁ•ÉÕÈ€ô…İ…¥Ğ•ÑA•ÉQ•¡ÕÉ…Ñ¥½¹½É)½‰]¥Ñ¡±¥•¹Ğ¡±¥•¹Ğ°©½‰}¥°Ô°‘ÕÈ°©½‰QåÁ”¤ì4(€€€€€€€€€½¹ÍĞ½¹™±¥Ğ€ô…İ…¥Ğ¡•­Q•¡½±±¥Í¥½¸¡Ô°…ÁÁĞ°Á•ÉÕÈ°©½‰}¥¤ì4(€€€€€€€€€¥˜€¡½¹™±¥Ğ¤Ñ¡É½ÜÉ•…Ñ•!ÑÑÁÉÉ½È ĞÀä°½¹™±¥Ğ¹•ÉÉ½Èñğ€Ÿ‚æ‚âŸ‚â—‚âË‚â+‚æ#‚âË‚â‚â+‚âg‚â‚âÇ‚âk‚â‚âË‚âg‚â·‚âß‚æ#‚âdœ°½¹™±¥Ğ¤ì4(€€€€€€€ô4(€€€€€ô4(€€€ô4(€ô4(4(€…İ…¥Ğ±¥•¹Ğ¹ÅÕ•Éä¡1QI=4ÁÕ‰±¥Œ¹©½‰}Ñ•…µ}µ•µ‰•ÉÌ]!I©½‰}¥ôÅ€°m©½‰}¥‘t¤ì4(€™½È€¡½¹ÍĞÔ½˜Í…™”¤ì4(€€€…İ…¥Ğ±¥•¹Ğ¹ÅÕ•Éä 4(€€€€€%9MIP%9Q<ÁÕ‰±¥Œ¹©½‰}Ñ•…µ}µ•µ‰•ÉÌ€¡©½‰}¥°ÕÍ•É¹…µ”¤4(€€€€€€Y1UL€ Ä°È¤=8=91%P€¡©½‰}¥°ÕÍ•É¹…µ”¤<9=Q!%9€°4(€€€€€m©½‰}¥°Õt4(€€€€¤ì4(€ô4(4(€ÑÉäì4(€€€¥˜€¡ÁÉ¥µ…Éä¤ì4(€€€€€…İ…¥Ğ±¥•¹Ğ¹ÅÕ•Éä 4(€€€€€€€UAQÁÕ‰±¥Œ¹©½‰}Ñ•…µ}µ•µ‰•ÉÌ4(€€€€€€€€MP¥Í}ÁÉ¥µ…Éä€ô€¡ÕÍ•É¹…µ”€ô€È¤4(€€€€€€€€]!I©½‰}¥€ô€Å€°4(€€€€€€€m©½‰}¥°ÁÉ¥µ…Éåt4(€€€€€€¤ì4(€€€ô4(€ô…Ñ €¡”¤ì4(€€€½¹Í½±”¹İ…É¸ mÑ•…µtÍ•Ğ¥Í}ÁÉ¥µ…Éä™…¥±•€¡™…¥°µ½Á•¸¤œ°”¹µ•ÍÍ…”¤ì4(€ô4(4(€ÑÉäì4(€€€¥˜€¡ÁÉ¥µ…Éä¤ì4(€€€€€…İ…¥Ğ±¥•¹Ğ¹ÅÕ•Éä 4(€€€€€€€UAQÁÕ‰±¥Œ¹©½‰Ì4(€€€€€€€€MPÑ•¡¹¥¥…¹}ÕÍ•É¹…µ”€ô=1M¡9U11% È°œœ¤°Ñ•¡¹¥¥…¹}ÕÍ•É¹…µ”¤°4(€€€€€€€€€€€€Ñ•¡¹¥¥…¹}Ñ•…´€ô=1M¡9U11% È°œœ¤°Ñ•¡¹¥¥…¹}Ñ•…´¤4(€€€€€€€€]!I©½‰}¥ôÅ€°4(€€€€€€€m©½‰}¥°ÁÉ¥µ…Éåt4(€€€€€€¤ì4(€€€ô4(€ô…Ñ €¡”¤ì4(€€€½¹Í½±”¹İ…É¸ mÑ•…µtÍå¹Œ©½‰Ì¹Ñ• ™¥•±‘Ì™…¥±•€¡™…¥°µ½Á•¸¤œ°”¹µ•ÍÍ…”¤ì4(€ô4(4(€ÑÉäì4(€€€¥˜€¡Í…™”¹±•¹Ñ ¤ì4(€€€€€…İ…¥Ğ±¥•¹Ğ¹ÅÕ•Éä 4(€€€€€€€1QI=4ÁÕ‰±¥Œ¹©½‰}…ÍÍ¥¹µ•¹ÑÌ4(€€€€€€€€]!I©½‰}¥ôÄ4(€€€€€€€€€€9Ñ•¡¹¥¥…¹}ÕÍ•É¹…µ”€ğø10 ÈèéÑ•áÑmt¥€°4(€€€€€€€m©½‰}¥°Í…™•t4(€€€€€€¤ì4(€€€ô4(4(€€€™½È€¡½¹ÍĞÔ½˜Í…™”¤ì4(€€€€€…İ…¥Ğ±¥•¹Ğ¹ÅÕ•Éä 4(€€€€€€€€4(€€€€€€€%9MIP%9Q<ÁÕ‰±¥Œ¹©½‰}…ÍÍ¥¹µ•¹ÑÌ€¡©½‰}¥°Ñ•¡¹¥¥…¹}ÕÍ•É¹…µ”°ÍÑ…ÑÕÌ¤4(€€€€€€€Y1UL€ Ä°È°¥¹}ÁÉ½É•ÍÌœ¤4(€€€€€€€=8=91%P€¡©½‰}¥°Ñ•¡¹¥¥…¹}ÕÍ•É¹…µ”¤<UAQMPÍÑ…ÑÕÌõa1U¹ÍÑ…ÑÕÌ4(€€€€€€€€°4(€€€€€€€m©½‰}¥°Õt4(€€€€€€¤ì4(€€€ô4(€ô…Ñ €¡”¤ì4(€€€½¹Í½±”¹İ…É¸ ‰mÑ•…µtÍå¹Œ©½‰}…ÍÍ¥¹µ•¹ÑÌ™…¥±•€¡™…¥°µ½Á•¸¤ˆ°”¹µ•ÍÍ…”¤ì4(€ô4(4(€É•ÑÕÉ¸ìµ•µ‰•ÉÌèÍ…™”°ÁÉ¥µ…Éäôì4)ô4(4(¼¼€ôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôô4(¼¼ƒÂ~n‡¾â<]II9Qd€¼IQUI8=H%`€¼1=9€¡‘µ¥¸ØÈ¤4(¼¼€´	…­İ…É½µÁ…Ñ¥‰±”è¹•Ü•¹‘Á½¥¹ÑÌ½¹±ä4(¼¼€ôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôô4)½¹ÍĞ9	1}]II9Qe}9=I€ô€¡ÁÉ½•ÍÌ¹•¹Ø¹9	1}]II9Qe}9=Iñğ€ˆÄˆ¤€ôôô€ˆÄˆì4(¼¼ƒŠr‘µ¥¸™½É”™¥¹¥Í €¡Í…™•ÑäÑ½±”¤4)½¹ÍĞ9	1}5%9}=I}%9%M €ô€¡ÁÉ½•ÍÌ¹•¹Ø¹9	1}5%9}=I}%9%M ñğ€ˆÄˆ¤€ôôô€ˆÄˆì4(4)™Õ¹Ñ¥½¸½µÁÕÑ•]…ÉÉ…¹Ñå¹¡ì©½‰}ÑåÁ”°İ…ÉÉ…¹Ñå}­¥¹°İ…ÉÉ…¹Ñå}µ½¹Ñ¡Ì°ÍÑ…ÉĞô¤ì4(€½¹ÍĞ©Ğ€ôMÑÉ¥¹œ¡©½‰}ÑåÁ•ñğœœ¤¹ÑÉ¥´ ¤ì4(€½¹ÍĞ­¥¹€ôMÑÉ¥¹œ¡İ…ÉÉ…¹Ñå}­¥¹‘ñğœœ¤¹ÑÉ¥´ ¤ì4(€½¹ÍĞÌ€ôÍÑ…ÉĞ¥¹ÍÑ…¹•½˜…Ñ”€üÍÑ…ÉĞ€è¹•Ü…Ñ”¡ÍÑ…ÉĞ¤ì4(€½¹ÍĞ•¹€ô¹•Ü…Ñ”¡Ì¹•ÑQ¥µ” ¤¤ì4(€€¼¼IÕ±•Ìè4(€€¼¼€´ƒ‚â—‚æ'‚âË‚âè€ÌÀƒ‚âŸ‚âÇ‚âd4(€€¼¼€´ƒ‚â/‚æ#‚â·‚â„è€Ì¼Ø¼ÄÈƒ‚æ‚âS‚âß‚â·‚âd4(€€¼¼€´ƒ‚âW‚âÓ‚âS‚âW‚âÇ‚æ'‚âè€Ìƒ‚âo‚âÔ4(€¥˜€¡­¥¹€ôôô€±•…¸œñğ©Ğ¹¥¹±Õ‘•Ì Ÿ‚â—‚æ'‚âË‚âœ¤¤ì4(€€€•¹¹Í•Ñ…Ñ”¡•¹¹•Ñ…Ñ” ¤¬ÌÀ¤ì4(€€€É•ÑÕÉ¸ì­¥¹è€±•…¸œ°µ½¹Ñ¡Ìè¹Õ±°°•¹ôì4(€ô4(€¥˜€¡­¥¹€ôôô€¥¹ÍÑ…±°œñğ©Ğ¹¥¹±Õ‘•Ì Ÿ‚âW‚âÓ‚âS‚âW‚âÇ‚æ'‚âœ¤¤ì4(€€€•¹¹Í•ÑÕ±±e•…È¡•¹¹•ÑÕ±±e•…È ¤¬Ì¤ì4(€€€É•ÑÕÉ¸ì­¥¹è€¥¹ÍÑ…±°œ°µ½¹Ñ¡Ìè¹Õ±°°•¹ôì4(€ô4(€€¼¼É•Á…¥È4(€½¹ÍĞ´€ô9Õµ‰•È¡İ…ÉÉ…¹Ñå}µ½¹Ñ¡Ì¤ì4(€¥˜€ …lÌ°Ø°ÄÉt¹¥¹±Õ‘•Ì¡´¤¤ì4(€€€Ñ¡É½Ü¹•ÜÉÉ½È Ÿ‚â‚âË‚âg‚â/‚æ#‚â·‚â‡‚âW‚æ'‚â·‚â‚æ‚â—‚âß‚â·‚â‚âo‚â‚âÃ‚â‚âÇ‚âd€Ì¼Ø¼ÄÈƒ‚æ‚âS‚âß‚â·‚âdœ¤ì4(€ô4(€•¹¹Í•Ñ5½¹Ñ ¡•¹¹•Ñ5½¹Ñ  ¤­´¤ì4(€É•ÑÕÉ¸ì­¥¹è€É•Á…¥Èœ°µ½¹Ñ¡Ìè´°•¹ôì4)ô4(4)…ÁÀ¹Á½ÍĞ œ½…‘µ¥¸½©½‰Ì¼é©½‰}¥½•áÑ•¹‘}İ…ÉÉ…¹Ñå}ØÈœ°É•ÅÕ¥É•‘µ¥¹M½™Ğ°…Íå¹Œ€¡É•Ä°É•Ì¤€ôøì4(€½¹ÍĞ©½‰}¥€ô9Õµ‰•È¡É•Ä¹Á…É…µÌ¹©½‰}¥¤ì4(€½¹ÍĞ‘…åÌ€ô9Õµ‰•È¡É•Ä¹‰½‘äü¹‘…åÌñğ€À¤ì4(€½¹ÍĞ…Ñ½É}ÕÍ•É¹…µ”€ôMÑÉ¥¹œ¡É•Ä¹‰½‘äü¹…Ñ½É}ÕÍ•É¹…µ”ñğ€œœ¤¹ÑÉ¥´ ¤ñğ¹Õ±°ì4(€¥˜€ …©½‰}¥¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ĞÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè€©½‰}¥ƒ‚æ‚â‡‚æ#‚â[‚âç‚â‚âW‚æ'‚â·‚âœô¤ì4(€¥˜€ …9Õµ‰•È¹¥Í¥¹¥Ñ”¡‘…åÌ¤ñğ‘…åÌ€ğô€Àñğ‘…åÌ€ø€ÌØÔÀ¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ĞÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè€Ÿ‚â#‚âÏ‚âg‚âŸ‚âg‚âŸ‚âÇ‚âg‚âW‚æ'‚â·‚â‚æ‚âo‚æ‚âg‚âW‚âÇ‚âŸ‚æ‚â—‚â€ø€Àœô¤ì4(€ÑÉäì4(€€€½¹ÍĞ©È€ô…İ…¥ĞÁ½½°¹ÅÕ•Éä¡M1Pİ…ÉÉ…¹Ñå}•¹‘}…Ğ°İ…ÉÉ…¹Ñå}•áÑ•¹‘•‘}‘…åÌI=4ÁÕ‰±¥Œ¹©½‰Ì]!I©½‰}¥ôÅ€°m©½‰}¥‘t¤ì4(€€€¥˜€ …©È¹É½İÌ¹±•¹Ñ ¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ĞÀĞ¤¹©Í½¸¡ì•ÉÉ½Èè€Ÿ‚æ‚â‡‚æ#‚â{‚âk‚â‚âË‚âdœô¤ì4(€€€½¹ÍĞÕÉÉ•¹Ğ€ô©È¹É½İÍlÁt¹İ…ÉÉ…¹Ñå}•¹‘}…Ğ€ü¹•Ü…Ñ”¡©È¹É½İÍlÁt¹İ…ÉÉ…¹Ñå}•¹‘}…Ğ¤€è¹Õ±°ì4(€€€¥˜€ …ÕÉÉ•¹Ğ¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ĞÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè€Ÿ‚â‚âË‚âg‚âg‚â×‚æ'‚â‹‚âÇ‚â‚æ‚â‡‚æ#‚â‡‚â×‚âŸ‚âÇ‚âg‚â¯‚â‡‚âS‚âo‚â‚âÃ‚â‚âÇ‚âdœô¤ì4(€€€½¹ÍĞ¹•İ¹€ô¹•Ü…Ñ”¡ÕÉÉ•¹Ğ¹•ÑQ¥µ” ¤¤ì4(€€€¹•İ¹¹Í•Ñ…Ñ”¡¹•İ¹¹•Ñ…Ñ” ¤€¬‘…åÌ¤ì4(€€€…İ…¥ĞÁ½½°¹ÅÕ•Éä 4(€€€€€UAQÁÕ‰±¥Œ¹©½‰Ì4(€€€€€€MPİ…ÉÉ…¹Ñå}•¹‘}…ĞôÄ°4(€€€€€€€€€€İ…ÉÉ…¹Ñå}•áÑ•¹‘•‘}‘…åÌ€ô=1M¡İ…ÉÉ…¹Ñå}•áÑ•¹‘•‘}‘…åÌ°À¤€¬€È4(€€€€€€]!I©½‰}¥ôÍ€°4(€€€€€m¹•İ¹¹Ñ½%M=MÑÉ¥¹œ ¤°‘…åÌ°©½‰}¥‘t4(€€€€¤ì4(€€€…İ…¥Ğ±½)½‰UÁ‘…Ñ”¡©½‰}¥°ì…Ñ½É}ÕÍ•É¹…µ”°…Ñ½É}É½±”è€…‘µ¥¸œ°…Ñ¥½¸è€•áÑ•¹‘}İ…ÉÉ…¹Ñäœ°µ•ÍÍ…”è•áÑ•¹€¬‘í‘…åÍô‘…åÍ€°Á…å±½…èì‘…åÌ°¹•İ}•¹è¹•İ¹¹Ñ½%M=MÑÉ¥¹œ ¤ôô¤ì4(€€€É•ÑÕÉ¸É•Ì¹©Í½¸¡ìÍÕ•ÍÌèÑÉÕ”°İ…ÉÉ…¹Ñå}•¹‘}…Ğè¹•İ¹¹Ñ½%M=MÑÉ¥¹œ ¤ô¤ì4(€ô…Ñ €¡”¤ì4(€€€½¹Í½±”¹•ÉÉ½È •áÑ•¹‘}İ…ÉÉ…¹Ñå}ØÈ•ÉÉ½Èœ°”¤ì4(€€€É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ÔÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè”¹µ•ÍÍ…”ñğ€•áÑ•¹İ…ÉÉ…¹Ñäƒ‚æ‚â‡‚æ#‚â«‚âÏ‚æ‚â‚æ‚â œô¤ì4(€ô4)ô¤ì4(4(¼¼€ôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôô4(¼¼ƒÂ~¼5%8è=I%9%M €¡™…±±‰…¬İ¡•¸Ñ• …¹¹½Ğ™¥¹…±¥é”¤4(¼¼€´	…­İ…É½µÁ…Ñ¥‰±”è¹•Ü•¹‘Á½¥¹Ğ½¹±ä4(¼¼€´9¼Í¥¹…ÑÕÉ”É•ÅÕ¥É•€¡…‘µ¥¸½Ù•ÉÉ¥‘”¤°±½ÌÑ¼ÕÁ‘…Ñ•Ì4(¼¼€ôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôô4)…ÁÀ¹Á½ÍĞ œ½…‘µ¥¸½©½‰Ì¼é©½‰}¥½™½É•}™¥¹¥Í¡}ØÈœ°É•ÅÕ¥É•‘µ¥¹M½™Ğ°…Íå¹Œ€¡É•Ä°É•Ì¤€ôøì4(€€¼¼‘µ¥¸½Ù•ÉÉ¥‘”èµÕÍĞ‰”…‰±”Ñ¼±½Í”Ñ¡”©½ˆ¥¸•µ•É•¹ä…Í•Ì•Ù•¸¥˜Ñ¡”4(€€¼¼Ñ•¡¹¥¥…¸™±½Ü¥ÌÍÑÕ¬¸-••ÀÑ¡¥ÌÁ…Ñ µ¥¹¥µ…°…¹É•Í¥±¥•¹Ğ¸4(€¥˜€ …9	1}5%9}=I}%9%M ¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ĞÀÌ¤¹©Í½¸¡ì•ÉÉ½Èè€•…ÑÕÉ”‘¥Í…‰±•œô¤ì4(4(€½¹ÍĞÉ…Ü€ôMÑÉ¥¹œ¡É•Ä¹Á…É…µÌ¹©½‰}¥ñğ€œœ¤¹ÑÉ¥´ ¤ì4(€½¹ÍĞ©½‰}¥€ô€ ½yq¬¼¹Ñ•ÍĞ¡É…Ü¤€ü9Õµ‰•È¡É…Ü¤€è€À¤ì4(€½¹ÍĞ…Ñ½É}ÕÍ•É¹…µ”€ôMÑÉ¥¹œ¡É•Ä¹‰½‘äü¹…Ñ½É}ÕÍ•É¹…µ”ñğ€œœ¤¹ÑÉ¥´ ¤ñğ¹Õ±°ì4(€½¹ÍĞÉ•…Í½¸€ôMÑÉ¥¹œ¡É•Ä¹‰½‘äü¹É•…Í½¸ñğ€œœ¤¹ÑÉ¥´ ¤ñğ€…‘µ¥¸™½É”™¥¹¥Í œì4(4(€±•ĞÉ•…±%€ô©½‰}¥ì4(€¥˜€ …É•…±%¤ì4(€€€ÑÉäìÉ•…±%€ô…İ…¥ĞÉ•Í½±Ù•)½‰%‘¹ä¡Á½½°°É…Ü¤ìô…Ñ ìÉ•…±%€ô€Àìô4(€ô4(€¥˜€ …É•…±%¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ĞÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè€©½‰}¥ƒ‚æ‚â‡‚æ#‚â[‚âç‚â‚âW‚æ'‚â·‚âœô¤ì4(€ÑÉäì½¹Í½±”¹±½œ m…‘µ¥¹}™½É•}™¥¹¥Í¡}ØÉt¡¥Ğœ°ìÉ…Ü°©½‰}¥è9Õµ‰•È¡É•…±%¤°…Ñ½É}ÕÍ•É¹…µ”°É•…Í½¸ô¤ìô…Ñ íô4(4(€½¹ÍĞ±¥•¹Ğ€ô…İ…¥ĞÁ½½°¹½¹¹•Ğ ¤ì4(€ÑÉäì4(€€€…İ…¥Ğ±¥•¹Ğ¹ÅÕ•Éä 	%8œ¤ì4(4(€€€½¹ÍĞ©È€ô…İ…¥Ğ±¥•¹Ğ¹ÅÕ•Éä 4(€€€€€M1P©½‰}¥°©½‰}ÑåÁ”°İ…ÉÉ…¹Ñå}•¹‘}…Ğ°©½‰}ÍÑ…ÑÕÌ4(€€€€€€€€I=4ÁÕ‰±¥Œ¹©½‰Ì4(€€€€€€€]!I©½‰}¥ôÄ4(€€€€€€€=HUAQ€°4(€€€€€mÉ•…±%‘t4(€€€€¤ì4(€€€¥˜€ …©È¹É½İÌ¹±•¹Ñ ¤ì4(€€€€€…İ…¥Ğ±¥•¹Ğ¹ÅÕ•Éä I=11	,œ¤ì4(€€€€€É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ĞÀĞ¤¹©Í½¸¡ì•ÉÉ½Èè€Ÿ‚æ‚â‡‚æ#‚â{‚âk‚â‚âË‚âdœô¤ì4(€€€ô4(4(€€€½¹ÍĞÕÈ€ô©È¹É½İÍlÁtñğíôì4(€€€½¹ÍĞ©Ğ€ôMÑÉ¥¹œ¡ÕÈ¹©½‰}ÑåÁ”ñğ€œœ¤¹ÑÉ¥´ ¤ì4(4(€€€€¼¼‘µ¥¸½Ù•ÉÉ¥‘”Í¡½Õ±…±İ…åÌ‰”…‰±”Ñ¼™¥¹¥Í Ñ¡”©½ˆ¸¼¹½Ğ‰±½¬½¸4(€€€€¼¼Á…å½ÕĞµ™É••é”¡•­Ì¡•É”ìÑ¡¥ÌÉ½ÕÑ”¥ÌÑ¡”É•½Ù•ÉäÁ…Ñ ™½ÈÍÑÕ¬©½‰Ì¸4(€€€±•Ğİ¹‘%Í¼€ô¹Õ±°°İ-¥¹€ô¹Õ±°°İ5½¹Ñ¡Ì€ô¹Õ±°ì4(€€€¥˜€ …ÕÈ¹İ…ÉÉ…¹Ñå}•¹‘}…Ğ¤ì4(€€€€€½¹ÍĞ¥Í±•…¸€ô©Ğ¹¥¹±Õ‘•Ì Ÿ‚â—‚æ'‚âË‚âœ¤ì4(€€€€€½¹ÍĞ¥Í%¹ÍÑ…±°€ô©Ğ¹¥¹±Õ‘•Ì Ÿ‚âW‚âÓ‚âS‚âW‚âÇ‚æ'‚âœ¤ì4(€€€€€½¹ÍĞ­¥¹€ô¥Í±•…¸€ü€±•…¸œ€è€¡¥Í%¹ÍÑ…±°€ü€¥¹ÍÑ…±°œ€è€œœ¤ì4(€€€€€¥˜€¡­¥¹¤ì4(€€€€€€€½¹ÍĞÜ€ô½µÁÕÑ•]…ÉÉ…¹Ñå¹¡ì©½‰}ÑåÁ”è©Ğ°İ…ÉÉ…¹Ñå}­¥¹è­¥¹°İ…ÉÉ…¹Ñå}µ½¹Ñ¡Ìè¹Õ±°°ÍÑ…ÉĞè¹•Ü…Ñ” ¤ô¤ì4(€€€€€€€İ¹‘%Í¼€ôÜ¹•¹¹Ñ½%M=MÑÉ¥¹œ ¤ì4(€€€€€€€İ-¥¹€ôÜ¹­¥¹ì4(€€€€€€€İ5½¹Ñ¡Ì€ôÜ¹µ½¹Ñ¡Ìì4(€€€€€ô4(€€€ô4(4(€€€…İ…¥Ğ±¥•¹Ğ¹ÅÕ•Éä 4(€€€€€UAQÁÕ‰±¥Œ¹©½‰Ì4(€€€€€€€€€MP©½‰}ÍÑ…ÑÕÌôŸ‚æ‚â«‚â‚æ‚â#‚æ‚â—‚æ'‚âœœ°4(€€€€€€€€€€€€€™¥¹¥Í¡•‘}…Ğõ=1M¡™¥¹¥Í¡•‘}…Ğ°9=\ ¤¤°4(€€€€€€€€€€€€€…¹•±•‘}…Ğõ9U10°4(€€€€€€€€€€€€€…¹•±}É•…Í½¸õ9U10°4(€€€€€€€€€€€€€É•ÑÕÉ¹•‘}…Ğõ9U10°4(€€€€€€€€€€€€€É•ÑÕÉ¹}É•…Í½¸õ9U10°4(€€€€€€€€€€€€€É•ÑÕÉ¹•‘}‰äõ9U10°4(€€€€€€€€€€€€€İ…ÉÉ…¹Ñå}­¥¹€ô=1M È°İ…ÉÉ…¹Ñå}­¥¹¤°4(€€€€€€€€€€€€€İ…ÉÉ…¹Ñå}µ½¹Ñ¡Ì€ô=1M Ì°İ…ÉÉ…¹Ñå}µ½¹Ñ¡Ì¤°4(€€€€€€€€€€€€€İ…ÉÉ…¹Ñå}ÍÑ…ÉÑ}…Ğ€ô=1M¡İ…ÉÉ…¹Ñå}ÍÑ…ÉÑ}…Ğ°9=\ ¤¤°4(€€€€€€€€€€€€€İ…ÉÉ…¹Ñå}•¹‘}…Ğ€ô=1M Ğ°İ…ÉÉ…¹Ñå}•¹‘}…Ğ¤4(€€€€€€€]!I©½‰}¥ôÅ€°4(€€€€€mÉ•…±%°İ-¥¹°İ5½¹Ñ¡Ì°İ¹‘%Í½t4(€€€€¤ì4(4(€€€€¼¼5…É¬•Ù•Éä…ÍÍ¥¹µ•¹Ğ¥¸Ñ¡¥Ì©½ˆ…Ì‘½¹”Í¼Ñ•¡¹¥¥…¸½…‘µ¥¸Ù¥•İÌÍÑ…ä½¹Í¥ÍÑ•¹Ğ¸4(€€€ÑÉäì4(€€€€€…İ…¥Ğ±¥•¹Ğ¹ÅÕ•Éä 4(€€€€€€€UAQÁÕ‰±¥Œ¹©½‰}…ÍÍ¥¹µ•¹ÑÌ4(€€€€€€€€€€€MPÍÑ…ÑÕÌô‘½¹”œ°4(€€€€€€€€€€€€€€€‘½¹•}…Ğõ=1M¡‘½¹•}…Ğ°9=\ ¤¤4(€€€€€€€€€]!I©½‰}¥ôÅ€°4(€€€€€€€mÉ•…±%‘t4(€€€€€€¤ì4(€€€ô…Ñ €¡”¤ì4(€€€€€ÑÉäì½¹Í½±”¹İ…É¸ m…‘µ¥¹}™½É•}™¥¹¥Í¡}ØÉt©½‰}…ÍÍ¥¹µ•¹ÑÌÍå¹Œ™…¥±•œ°”¹µ•ÍÍ…”¤ìô…Ñ íô4(€€€ô4(4(€€€…İ…¥Ğ±½)½‰UÁ‘…Ñ”¡É•…±%°ì4(€€€€€…Ñ½É}ÕÍ•É¹…µ”°4(€€€€€…Ñ½É}É½±”è€…‘µ¥¸œ°4(€€€€€…Ñ¥½¸è€…‘µ¥¹}™½É•}™¥¹¥Í¡}ØÈœ°4(€€€€€µ•ÍÍ…”èƒ‚æ‚â·‚âS‚â‡‚âÓ‚âg‚âo‚âÓ‚âS‚â‚âË‚âg‚æ‚â_‚âg‚â+‚æ#‚âË‚âè€‘íÉ•…Í½¹õ€°4(€€€€€Á…å±½…èì4(€€€€€€€™½É•}±½Í•‘}™É½µ}ÍÑ…ÑÕÌèMÑÉ¥¹œ¡ÕÈ¹©½‰}ÍÑ…ÑÕÌñğ€œœ¤°4(€€€€€€€İ…ÉÉ…¹Ñå}­¥¹èİ-¥¹ñğ¹Õ±°°4(€€€€€€€İ…ÉÉ…¹Ñå}•¹‘}…Ğèİ¹‘%Í¼ñğ¹Õ±°°4(€€€€€ô4(€€€ô°±¥•¹Ğ¤ì4(4(€€€…İ…¥Ğ±¥•¹Ğ¹ÅÕ•Éä =55%Pœ¤ì4(€€€ÑÉäì4(€€€€€½¹ÍĞÑ•…´€ô…İ…¥Ğ•ÑQ•…µ½É)½ˆ¡É•…±%¤ì4(€€€€€…İ…¥Ğ}É•™É•Í¡Q•¡¹¥¥…¹%¹½µ•AÉ•Ù¥•İ½É)½ˆ¡É•…±%°Ñ•…´°ìÍ½ÕÉ”è€©½‰}±½Í•‘}ÁÉ•Ù¥•Üœô¤ì4(€€€ô…Ñ €¡”¤ì4(€€€€€ÑÉäì½¹Í½±”¹İ…É¸ mÑ•¡}¥¹½µ•}ÁÉ•Ù¥•İt…‘µ¥¸™½É”™¥¹¥Í É•™É•Í ™…¥±•œ°ì©½‰}¥èÉ•…±%°•ÉÉ½Èè”¹µ•ÍÍ…”ô¤ìô…Ñ íô4(€€€ô4(€€€É•ÑÕÉ¸É•Ì¹©Í½¸¡ìÍÕ•ÍÌèÑÉÕ”°©½‰}¥è9Õµ‰•È¡É•…±%¤°ÍÑ…ÑÕÌè€Ÿ‚æ‚â«‚â‚æ‚â#‚æ‚â—‚æ'‚âœœô¤ì4(€ô…Ñ €¡”¤ì4(€€€ÑÉäì…İ…¥Ğ±¥•¹Ğ¹ÅÕ•Éä I=11	,œ¤ìô…Ñ íô4(€€€½¹Í½±”¹•ÉÉ½È m…‘µ¥¹}™½É•}™¥¹¥Í¡}ØÉt•ÉÉ½Èœ°”¤ì4(€€€É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ¡9Õµ‰•È¡”¹ÍÑ…ÑÕÍ½‘”ñğ€ÔÀÀ¤¤¹©Í½¸¡ì•ÉÉ½Èè”¹µ•ÍÍ…”ñğ€™½É”™¥¹¥Í ƒ‚æ‚â‡‚æ#‚â«‚âÏ‚æ‚â‚æ‚â œô¤ì4(€ô™¥¹…±±äì4(€€€±¥•¹Ğ¹É•±•…Í” ¤ì4(€ô4)ô¤ì4(4(4(¼¼ƒŠr‘µ¥¸µ½¹±äè•±•Ñ”©½ˆÁ•Éµ…¹•¹Ñ±ä€¡‚â#‚â‚âÓ‚â¤€¬±•…¹ÕÀÉ•±…Ñ•Ñ…‰±•Ì4)…ÁÀ¹‘•±•Ñ” œ½…‘µ¥¸½©½‰Ì¼é©½‰}¥œ°É•ÅÕ¥É•‘µ¥¹M½™Ğ°…Íå¹Œ€¡É•Ä°É•Ì¤€ôøì4(€½¹ÍĞ©½‰}¥€ô9Õµ‰•È¡É•Ä¹Á…É…µÌ¹©½‰}¥¤ì4(€¥˜€ …9Õµ‰•È¹¥Í¥¹¥Ñ”¡©½‰}¥¤ñğ©½‰}¥€ğô€À¤ì4(€€€É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ĞÀÀ¤¹©Í½¸¡ì½¬é™…±Í”°•ÉÉ½Èè¥¹Ù…±¥©½‰}¥œô¤ì4(€ô4(€½¹ÍĞ±¥•¹Ğ€ô…İ…¥ĞÁ½½°¹½¹¹•Ğ ¤ì4(€ÑÉäì4(€€€…İ…¥Ğ±¥•¹Ğ¹ÅÕ•Éä 	%8œ¤ì4(4(€€€½¹ÍĞ¡¬€ô…İ…¥Ğ±¥•¹Ğ¹ÅÕ•Éä 4(€€€€€M1P©½‰}¥°‰½½­¥¹}½‘”°Ñ•¡¹¥¥…¹}ÕÍ•É¹…µ”°…ÁÁ½¥¹Ñµ•¹Ñ}‘…Ñ•Ñ¥µ”4(€€€€€€€€I=4ÁÕ‰±¥Œ¹©½‰Ì]!I©½‰}¥ôÄ4(€€€€€€€€=HUAQ€°4(€€€€€m©½‰}¥‘t4(€€€€¤ì4(€€€¥˜€ …¡¬¹É½İÌñğ€…¡¬¹É½İÌ¹±•¹Ñ ¤ì4(€€€€€…İ…¥Ğ±¥•¹Ğ¹ÅÕ•Éä I=11	,œ¤ì4(€€€€€É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ĞÀĞ¤¹©Í½¸¡ì½¬é™…±Í”°•ÉÉ½Èè©½ˆ¹½Ğ™½Õ¹œô¤ì4(€€€ô4(4(€€€½¹ÍĞ‘•±•Ñ•I•±…Ñ•‘I½İÌ€ô…Íå¹Œ€¡}‘ˆ°¡…É‘•±•Ñ•)½‰%¤€ôøì4(€€€€€€¼¼¡¥±Ñ…‰±•Ì€¡™…¥°µÍ…™”èÍ½µ”µ¥¡Ğµ¥ÍÌÑ…‰±•Ì¥¸½±‘•È‘•Á±½åÌ¤4(€€€€€½¹ÍĞÍ…™••°€ô…Íå¹Œ€¡ÍÅ°°Á…É…µÌ¤€ôøì4(€€€€€€€ÑÉäì…İ…¥Ğ±¥•¹Ğ¹ÅÕ•Éä¡ÍÅ°°Á…É…µÌ¤ìô…Ñ ¡”¥ì½¹Í½±”¹İ…É¸ m…‘µ¥¹}‘•±•Ñ•}©½‰t¥¹½É”œ°”¹µ•ÍÍ…”¤ìô4(€€€€€ôì4(4(€€€€€…İ…¥ĞÍ…™••°¡1QI=4ÁÕ‰±¥Œ¹©½‰}Á¡½Ñ½Ì]!I©½‰}¥ôÅ€°m¡…É‘•±•Ñ•)½‰%‘t¤ì4(€€€€€…İ