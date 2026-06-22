"use strict";

const jobTiming = require("./jobTiming");

const URGENT_LEAD_TIME_MIN = 30;
const UI_START_MIN = 9 * 60; // 09:00, matches the Admin Add locked business window
const UI_END_MIN = 18 * 60; // 18:00
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

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
// Best-effort, single-process idempotency for retried/duplicate urgent
// requests that share the same client-generated urgent_request_key.
//
// SCOPE MISMATCH (reported, not silently worked around): a durable,
// cross-instance/cross-restart guarantee needs a unique column to lock on
// (e.g. on public.jobs or public.job_offers), which is a schema change. Per
// the explicit instruction not to create a migration in this round, this
// layer is in-memory only: it dedups retries / double-taps / multi-tab
// submits landing on the same Node process, but does NOT survive a process
// restart and does NOT protect against two different server instances
// racing on the same key. That guarantee needs an owner-approved migration.
// ---------------------------------------------------------------------------
class UrgentIdempotencyStore {
  constructor(ttlMs = IDEMPOTENCY_TTL_MS) {
    this.ttlMs = ttlMs;
    this.cache = new Map();
    this.inFlight = new Map();
  }

  prune() {
    const cutoff = Date.now() - this.ttlMs;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.ts < cutoff) this.cache.delete(key);
    }
  }

  getCached(key) {
    this.prune();
    return key ? this.cache.get(key) || null : null;
  }

  getInFlight(key) {
    return key ? this.inFlight.get(key) || null : null;
  }

  beginInFlight(key) {
    let resolveFn;
    let rejectFn;
    const promise = new Promise((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });
    promise.catch(() => {}); // avoid an unhandled rejection when a solo (non-duplicate) request fails
    this.inFlight.set(key, promise);
    return {
      resolve: (result) => {
        this.inFlight.delete(key);
        this.cache.set(key, { ...result, ts: Date.now() });
        resolveFn(result);
      },
      reject: (err) => {
        this.inFlight.delete(key);
        rejectFn(err);
      },
    };
  }
}

module.exports = {
  URGENT_LEAD_TIME_MIN,
  UI_START_MIN,
  UI_END_MIN,
  sanitizeCustomerServiceLine,
  sanitizeCustomerUrgentBody,
  computeCustomerUrgentAppointmentIso,
  UrgentIdempotencyStore,
};
