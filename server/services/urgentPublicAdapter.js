"use strict";

const crypto = require("crypto");
const jobTiming = require("./jobTiming");
const { normalizeServiceType } = require("../normalizers");

const URGENT_LEAD_TIME_MIN = 30;
const UI_START_MIN = 9 * 60; // 09:00, matches the Admin Add locked business window
const UI_END_MIN = 18 * 60; // 18:00
const STRICT_CLEANING_JOB_TYPES = new Set([
  "ล้าง",
  "ล้างแอร์",
  "งานล้าง",
  "งานล้างแอร์",
  "บริการล้างแอร์",
  "wash",
  "clean",
  "cleaning",
  "ac wash",
  "ac clean",
  "ac cleaning",
  "aircon wash",
  "aircon clean",
  "aircon cleaning",
  "air conditioner wash",
  "air conditioner clean",
  "air conditioner cleaning",
]);

function coerceNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeCustomerServiceLine(raw) {
  const item = raw && typeof raw === "object" ? raw : {};
  return {
    job_type: String(item.job_type || "").trim(),
    ac_type: String(item.ac_type || "").trim(),
    btu: coerceNumber(item.btu, 0),
    machine_count: Math.max(1, coerceNumber(item.machine_count, 1)),
    wash_variant: String(item.wash_variant || "").trim(),
    repair_variant: String(item.repair_variant || "").trim(),
  };
}

function canonicalUrgentCleaningJobType(value) {
  const raw = String(value || "").trim();
  const normalizedText = raw.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!STRICT_CLEANING_JOB_TYPES.has(normalizedText)) return null;
  return normalizeServiceType(raw) === "ล้าง" ? "ล้าง" : null;
}

function isStrictUrgentCleaningPayload(payload = {}) {
  if (canonicalUrgentCleaningJobType(payload.job_type) !== "ล้าง") return false;
  const services = Array.isArray(payload.services) ? payload.services : [];
  return services.every((service) => canonicalUrgentCleaningJobType(service?.job_type) === "ล้าง");
}

// Strict allowlist: only customer-safe fields are allowed to cross into the
// existing admin urgent offer engine (handleAdminBookV2). Anything not listed
// here -- override_price, override_duration_min, promotion_id,
// service_zone_code, technician_username, team_members, etc. -- is dropped,
// so a customer-sourced request can never reach admin-only behavior or force
// a zone override. Zone is always re-derived from address_text/job_zone/maps_url
// by the existing detectServiceZoneFromText logic inside handleAdminBookV2.
function sanitizeCustomerUrgentBody(body) {
  const src = body && typeof body === "object" ? body : {};
  const services = Array.isArray(src.services) && src.services.length
    ? src.services.slice(0, 10).map(sanitizeCustomerServiceLine)
    : null;
  return {
    customer_name: String(src.customer_name || "").trim(),
    customer_phone: String(src.customer_phone || "").trim(),
    address_text: String(src.address_text || "").trim(),
    maps_url: String(src.maps_url || "").trim(),
    job_zone: String(src.job_zone || "").trim(),
    customer_note: String(src.customer_note || "").trim(),
    job_type: String(src.job_type || "").trim(),
    ac_type: String(src.ac_type || "").trim(),
    btu: coerceNumber(src.btu, 0),
    machine_count: Math.max(1, coerceNumber(src.machine_count, 1)),
    wash_variant: String(src.wash_variant || "").trim(),
    repair_variant: String(src.repair_variant || "").trim(),
    services,
    client_app: "customer_app_v2",
    urgent_request_key: String(src.urgent_request_key || "").trim(),
  };
}

function addDaysToYmd(ymd, days) {
  const d = new Date(`${String(ymd)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

// Server-side, Asia/Bangkok, business-hours-aware urgent appointment
// timestamp: now + lead time, rounded UP to the nearest slot step, clamped
// to the 09:00-18:00 window (rolling to next day's open if past close).
// Reuses jobTiming's canonical Bangkok-now/step-rounding helpers instead of
// duplicating that formula; only the "roll to next business day" extension
// (specific to this urgent lead-time use case) lives here.
function computeCustomerUrgentAppointmentIso(now = jobTiming.getBangkokNow()) {
  const nowMin = (Number(now.hour || 0) * 60) + Number(now.minute || 0);
  const rounded = jobTiming.ceilMinuteToStep(nowMin + URGENT_LEAD_TIME_MIN, jobTiming.SLOT_STEP_MIN);
  let targetDate = now.ymd;
  let targetMin;
  if (rounded <= UI_END_MIN) {
    targetMin = Math.max(UI_START_MIN, rounded);
  } else {
    targetDate = addDaysToYmd(now.ymd, 1);
    targetMin = UI_START_MIN;
  }
  const hh = String(Math.floor(targetMin / 60)).padStart(2, "0");
  const mm = String(targetMin % 60).padStart(2, "0");
  return `${targetDate}T${hh}:${mm}:00+07:00`;
}

// ---------------------------------------------------------------------------
// Durable, DB-backed idempotency for retried/duplicate urgent requests that
// share the same client-generated urgent_request_key.
//
// Rather than an in-memory cache (which does not survive a process restart
// and does not protect against two server instances racing on the same
// key), the request key is hashed into a deterministic booking_token. The
// caller (handleAdminBookV2) takes a Postgres advisory lock keyed on the
// raw request key inside its existing per-request transaction, then looks
// up an existing public.jobs row by this deterministic token before
// inserting a new one. Because the lock is transaction-scoped
// (pg_advisory_xact_lock) it auto-releases on COMMIT/ROLLBACK -- including
// on a crashed connection -- and is visible to every connection on the same
// Postgres instance, so restarts, multiple app-server instances, and
// concurrent requests all converge on a single committed job/offer set
// without requiring a new table or a separate migration: booking_token
// already exists on public.jobs.
// ---------------------------------------------------------------------------
function deriveUrgentBookingToken(requestKey) {
  const key = String(requestKey || "").trim();
  if (!key) return null;
  return crypto.createHash("sha256").update(`urgent_v1:${key}`).digest("hex").slice(0, 24);
}

module.exports = {
  URGENT_LEAD_TIME_MIN,
  UI_START_MIN,
  UI_END_MIN,
  sanitizeCustomerServiceLine,
  sanitizeCustomerUrgentBody,
  canonicalUrgentCleaningJobType,
  isStrictUrgentCleaningPayload,
  computeCustomerUrgentAppointmentIso,
  deriveUrgentBookingToken,
};
