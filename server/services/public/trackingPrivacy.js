"use strict";

// Privacy layer for the PUBLIC tracking surfaces (/public/track,
// /public/urgent-status, /docs/receipt, /docs/eslip).
//
// Threat model: booking_code is a short, human-readable code (CWF + 7 chars)
// that customers write down and read aloud to staff — it WILL leak. It must
// therefore never unlock full personal data by itself:
//   - full access (raw phone, address, GPS, maps link, receipt) requires the
//     long random booking_token the app received at booking time
//   - a booking_code lookup still works, but PII comes back masked/omitted
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

// Full access only when the query string equals the job's booking_token.
// A booking_code match (or anything else) is treated as limited access.
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

// Build the response for a booking_code lookup with an explicit ALLOWLIST
// (not a blacklist). A booking code is a short, shareable identifier, so a code
// lookup returns only the minimum needed to answer "what state is my job in?"
// plus a masked confirmation value. Anything not named here — customer_name,
// exact/partial address, GPS, maps link, sequential job_id, technician notes,
// job/unit photos, unit location/checklist data, cancel reason, review/complaint
// text, receipt link, the booking_token, technician identity, and ANY field
// added in future — is dropped by construction. Full detail requires the token.
function redactPublicTrackPayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const out = {
    access_level: "code",
    // The customer typed this in, so echoing it back is not a disclosure.
    booking_code: source.booking_code || null,
    // Status lane — enough to render progress, no PII.
    job_status: source.job_status || null,
    booking_mode: source.booking_mode || null,
    dispatch_mode: source.dispatch_mode || null,
    appointment_datetime: source.appointment_datetime || null,
    duration_min: source.duration_min == null ? null : source.duration_min,
    // Progress signals (timestamps only — no free-text reasons).
    travel_started_at: source.travel_started_at || null,
    checkin_at: source.checkin_at || null,
    started_at: source.started_at || null,
    finished_at: source.finished_at || null,
    canceled_at: source.canceled_at || null,
    // A masked confirmation aid so the customer recognises their own booking.
    customer_phone: maskPhone(source.customer_phone),
  };
  return out;
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
