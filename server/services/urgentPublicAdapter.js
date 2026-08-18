"use strict";

const crypto = require("crypto");
const jobTiming = require("./jobTiming");
const { normalizeServiceType } = require("../normalizers");

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
  const servicePackageGroups = Array.isArray(src.service_package_groups) && src.service_package_groups.length
    ? src.service_package_groups.slice(0, 50).map((group) => ({
      package_key: String(group?.package_key || "").trim(),
      btu: coerceNumber(group?.btu, 0),
      quantity: coerceNumber(group?.quantity, 0),
    })) : undefined;
  return {
    customer_name: String(src.customer_name || "").trim(),
    customer_phone: String(src.customer_phone || "").trim(),
    address_text: String(src.address_text || "").trim(),
    maps_url: String(src.maps_url || "").trim(),
    appointment_datetime: String(src.appointment_datetime || "").trim(),
    allow_time_proposal: src.allow_time_proposal,
    gps_latitude: src.gps_latitude,
    gps_longitude: src.gps_longitude,
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
    ...(Number.isSafeInteger(Number(src.catalog_item_id)) && Number(src.catalog_item_id) > 0
      ? { catalog_item_id: Number(src.catalog_item_id) } : {}),
    ...(servicePackageGroups ? { service_package_groups: servicePackageGroups } : {}),
  };
}

function normalizeCustomerUrgentAppointment(value) {
  const match = String(value || "").trim().match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\+07:00)?$/
  );
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "00"] = match;
  const numbers = [year, month, day, hour, minute, second].map(Number);
  if (numbers.some((part) => !Number.isInteger(part))) return null;
  if (numbers[1] < 1 || numbers[1] > 12 || numbers[3] > 23 || numbers[4] > 59 || numbers[5] > 59) return null;
  const check = new Date(Date.UTC(numbers[0], numbers[1] - 1, numbers[2]));
  if (
    check.getUTCFullYear() !== numbers[0]
    || check.getUTCMonth() !== numbers[1] - 1
    || check.getUTCDate() !== numbers[2]
  ) return null;
  return `${year}-${month}-${day}T${hour}:${minute}:00+07:00`;
}

function isCustomerUrgentAppointmentPast(appointmentIso, now = jobTiming.getBangkokNow()) {
  const normalized = normalizeCustomerUrgentAppointment(appointmentIso);
  if (!normalized) return true;
  const nowYmd = String(now?.ymd || "");
  const nowHour = String(Number(now?.hour || 0)).padStart(2, "0");
  const nowMinute = String(Number(now?.minute || 0)).padStart(2, "0");
  const nowKey = `${nowYmd}T${nowHour}:${nowMinute}`;
  return normalized.slice(0, 16) <= nowKey;
}

function gpsFieldProvided(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function validateCustomerUrgentGps(latitude, longitude) {
  const latProvided = gpsFieldProvided(latitude);
  const lngProvided = gpsFieldProvided(longitude);
  if (!latProvided && !lngProvided) return { ok: true, latitude: null, longitude: null };
  if (!(latProvided && lngProvided)) return { ok: false, latitude: null, longitude: null };
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, latitude: null, longitude: null };
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { ok: false, latitude: null, longitude: null };
  if (lat === 0 && lng === 0) return { ok: false, latitude: null, longitude: null };
  return { ok: true, latitude: lat, longitude: lng };
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
  sanitizeCustomerServiceLine,
  sanitizeCustomerUrgentBody,
  canonicalUrgentCleaningJobType,
  isStrictUrgentCleaningPayload,
  normalizeCustomerUrgentAppointment,
  isCustomerUrgentAppointmentPast,
  validateCustomerUrgentGps,
  deriveUrgentBookingToken,
};
