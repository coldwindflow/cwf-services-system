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

// Redact a fully-built /public/track response payload for booking_code-based
// lookups. Never mutates the input. Field LIST stays identical so existing
// clients keep rendering — values are masked or nulled.
function redactPublicTrackPayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const redacted = { ...source };

  // The token is the full-access credential — echoing it back to a
  // booking_code caller would be privilege escalation.
  redacted.booking_token = null;
  redacted.customer_phone = maskPhone(source.customer_phone);
  redacted.address_text = shortenAddress(source.address_text);
  redacted.maps_url = null;
  redacted.gps_latitude = null;
  redacted.gps_longitude = null;
  // Receipt documents carry full PII — token holders only.
  redacted.receipt_url = null;

  if (source.technician && typeof source.technician === "object") {
    redacted.technician = { ...source.technician, phone: null };
  }
  if (Array.isArray(source.technician_team)) {
    redacted.technician_team = source.technician_team.map((member) =>
      member && typeof member === "object" ? { ...member, phone: null } : member
    );
  }

  redacted.access_level = "code";
  return redacted;
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

// Per-client key: first hop of X-Forwarded-For when present (we sit behind a
// proxy in production), otherwise the socket address.
function clientIpKey(req) {
  const fwd = String((req && req.headers && req.headers["x-forwarded-for"]) || "").split(",")[0].trim();
  if (fwd) return fwd;
  return String((req && (req.ip || (req.socket && req.socket.remoteAddress))) || "unknown");
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
