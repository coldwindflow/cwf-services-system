"use strict";

// Privacy layer for the PUBLIC tracking surfaces (/public/track,
// /public/urgent-status, /docs/receipt, /docs/eslip).
//
// Threat model: booking_code is a short, human-readable code (CWF + 7 chars)
// that customers write down and read aloud to staff. It grants a deliberately
// allowlisted, read-only visit view, but never unlocks credentials or actions:
//   - documents and writes require the long random booking_token
//   - booking_code responses omit internal IDs, booking_token and URLs carrying it
//   - every public lookup endpoint is rate-limited per client IP so neither
//     codes nor tokens can be brute-forced
//
// This module is dependency-free and fully unit-tested — see
// test/customerTrackingPrivacy.test.js. index.js wires it into the routes.

const crypto = require("crypto");

// Constant-time string comparison (length leak is fine — both sides are
// non-secret formats; we only care about content comparison).
function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a == null ? "" : a));
  const bufB = Buffer.from(String(b == null ? "" : b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Privileged/token action access only when the query equals booking_token.
function isFullAccessQuery(q, row) {
  const token = row && row.booking_token;
  if (!token) return false;
  return timingSafeEqualStr(String(q == null ? "" : q).trim(), String(token));
}

// "0812345678" -> "•••• 5678" (keeps just enough for the customer to
// recognise their own number; useless for a stranger).
function maskPhone(phone) {
  const digits = String(phone == null ? "" : phone).replace(/\D/g, "");
  if (!digits) return null;
  return `•••• ${digits.slice(-4)}`;
}

// Keep only the leading part of the address — enough for the customer to
// recognise the job, not enough to locate the house.
function shortenAddress(text, keepChars = 24) {
  const value = String(text == null ? "" : text).trim();
  if (!value) return value;
  if (value.length <= keepChars) return value;
  return `${value.slice(0, keepChars)}…`;
}

// Nested public projections intentionally omit database IDs and upstream fields
// that are not part of the customer-facing tracking contract.
function publicPhoto(photo) {
  if (!photo || typeof photo !== "object") return null;
  return {
    phase: photo.phase || null,
    photo_category: photo.photo_category || null,
    created_at: photo.created_at || null,
    uploaded_at: photo.uploaded_at || null,
    public_url: photo.public_url || null,
  };
}

function publicTechnician(technician) {
  if (!technician || typeof technician !== "object") return null;
  return {
    full_name: technician.full_name || null,
    photo: technician.photo || null,
    rank_level: technician.rank_level == null ? null : technician.rank_level,
    rank_key: technician.rank_key || null,
    rating: technician.rating == null ? null : technician.rating,
    grade: technician.grade || null,
    phone: technician.phone || null,
  };
}

function publicUnit(unit) {
  if (!unit || typeof unit !== "object") return null;
  return {
    unit_no: unit.unit_no == null ? null : unit.unit_no,
    unit_code: unit.unit_code || null,
    label: unit.label || null,
    btu: unit.btu == null ? null : unit.btu,
    ac_type: unit.ac_type || null,
    service_type: unit.service_type || null,
    checklist_summary: unit.checklist_summary && typeof unit.checklist_summary === "object"
      ? {
          pre_completed: unit.checklist_summary.pre_completed === true,
          post_completed: unit.checklist_summary.post_completed === true,
          issue_count: Number(unit.checklist_summary.issue_count || 0),
        }
      : null,
    photos: Array.isArray(unit.photos) ? unit.photos.map(publicPhoto).filter(Boolean) : [],
  };
}

function publicReview(review) {
  const source = review && typeof review === "object" ? review : {};
  return {
    already_reviewed: source.already_reviewed === true,
    rating: source.rating == null ? null : source.rating,
    review_text: source.review_text || null,
    complaint_text: source.complaint_text || null,
    reviewed_at: source.reviewed_at || null,
  };
}

function publicCatalogReview(review) {
  if (!review || typeof review !== "object") return null;
  const existing = review.review && typeof review.review === "object" ? review.review : null;
  return {
    eligible: false,
    already_reviewed: review.already_reviewed === true,
    review: existing
      ? {
          rating: existing.rating == null ? null : existing.rating,
          comment: existing.comment || "",
          created_at: existing.created_at || null,
        }
      : null,
  };
}

// Booking-code lookups receive the ordinary customer-facing read model, but
// no private credential, internal identifier, document URL, or write ability.
// This remains an allowlist so future upstream fields stay denied by default.
function redactPublicTrackPayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  return {
    access_level: "code",
    capabilities: {
      can_view_full_tracking: true,
      can_use_token_actions: false,
      can_view_documents: false,
      can_submit_review: false,
    },
    can_view_full_tracking: true,
    can_use_token_actions: false,
    legacy_review_eligible: false,
    booking_code: source.booking_code || null,
    customer_name: source.customer_name || null,
    customer_phone: source.customer_phone || null,
    job_type: source.job_type || null,
    job_status: source.job_status || null,
    booking_mode: source.booking_mode || null,
    dispatch_mode: source.dispatch_mode || null,
    appointment_datetime: source.appointment_datetime || null,
    duration_min: source.duration_min == null ? null : source.duration_min,
    job_price: source.job_price == null ? null : source.job_price,
    payment_status: source.payment_status || null,
    paid_at: source.paid_at || null,
    address_text: source.address_text || null,
    maps_url: source.maps_url || null,
    job_zone: source.job_zone || null,
    gps_latitude: source.gps_latitude == null ? null : source.gps_latitude,
    gps_longitude: source.gps_longitude == null ? null : source.gps_longitude,
    created_at: source.created_at || null,
    travel_started_at: source.travel_started_at || null,
    checkin_at: source.checkin_at || null,
    started_at: source.started_at || null,
    finished_at: source.finished_at || null,
    canceled_at: source.canceled_at || null,
    cancel_reason: source.cancel_reason || null,
    technician_note: source.technician_note || null,
    service_items: Array.isArray(source.service_items)
      ? source.service_items.map((item) => ({
          item_name: item && item.item_name ? item.item_name : null,
          qty: item && item.qty != null ? item.qty : null,
          unit_price: item && item.unit_price != null ? item.unit_price : null,
          line_total: item && item.line_total != null ? item.line_total : null,
        }))
      : [],
    photos: Array.isArray(source.photos) ? source.photos.map(publicPhoto).filter(Boolean) : [],
    units: Array.isArray(source.units) ? source.units.map(publicUnit).filter(Boolean) : [],
    technician: publicTechnician(source.technician),
    technician_team: Array.isArray(source.technician_team)
      ? source.technician_team.map(publicTechnician).filter(Boolean)
      : [],
    review: publicReview(source.review),
    catalog_review: publicCatalogReview(source.catalog_review),
  };
}

// Fixed-window in-memory rate limiter with an LRU cap so the map can never
// grow without bound. One instance per endpoint (budgets differ).
function createPublicLookupRateLimiter(options = {}) {
  const windowMs = Math.max(1000, Number(options.windowMs || 60000));
  const max = Math.max(1, Number(options.max || 30));
  const maxKeys = Math.max(100, Number(options.maxKeys || 5000));
  const now = typeof options.now === "function" ? options.now : Date.now;
  const hits = new Map();

  function check(rawKey) {
    const key = String(rawKey || "unknown");
    const t = now();
    let entry = hits.get(key);
    if (!entry || t - entry.start >= windowMs) entry = { start: t, count: 0 };
    entry.count += 1;
    // Refresh recency so eviction removes the least recently seen key.
    hits.delete(key);
    hits.set(key, entry);
    if (hits.size > maxKeys) {
      const oldest = hits.keys().next().value;
      hits.delete(oldest);
    }
    if (entry.count > max) {
      return {
        allowed: false,
        retry_after_s: Math.max(1, Math.ceil((entry.start + windowMs - t) / 1000)),
      };
    }
    return { allowed: true };
  }

  return { check, _size: () => hits.size };
}

// Per-client key. IMPORTANT: never read the raw X-Forwarded-For header — the
// leftmost hop is fully attacker-controlled, so trusting it lets a caller mint
// a fresh identity (and a fresh rate-limit budget) on every request. Instead we
// use Express's req.ip, which is derived under the app's explicit
// `trust proxy` setting (1 = a single front proxy, e.g. Render). With that
// config an attacker can only prepend XFF entries to the left of the proxy's
// appended client IP, so req.ip stays the real client address. Fall back to the
// socket peer only when Express did not resolve an ip.
//
// NOTE: this limiter is PER PROCESS (in-memory). Behind multiple app instances
// the effective budget is per-instance; it is a brute-force speed bump, not a
// distributed quota. A shared store (e.g. Redis) would be needed for a global
// guarantee across instances.
function clientIpKey(req) {
  const ip = req && typeof req.ip === "string" ? req.ip.trim() : "";
  if (ip) return ip;
  const socketIp = req && req.socket && req.socket.remoteAddress;
  return String(socketIp || "unknown");
}

module.exports = {
  clientIpKey,
  createPublicLookupRateLimiter,
  isFullAccessQuery,
  maskPhone,
  redactPublicTrackPayload,
  shortenAddress,
  timingSafeEqualStr,
};
