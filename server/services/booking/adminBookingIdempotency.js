"use strict";

const crypto = require("node:crypto");

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.keys(value).sort().reduce((out, key) => {
    if (key !== "admin_request_key") out[key] = stable(value[key]);
    return out;
  }, {});
  return value;
}

function validateAdminRequestKey(value) {
  const key = String(value || "").trim();
  return /^[A-Za-z0-9_-]{16,128}$/.test(key) ? key : null;
}
function requestFingerprint(body) { return crypto.createHash("sha256").update(JSON.stringify(stable(body || {}))).digest("hex"); }
function bookingToken(key) { return `admin_${crypto.createHash("sha256").update(key).digest("hex").slice(0, 32)}`; }

module.exports = { stable, validateAdminRequestKey, requestFingerprint, bookingToken };
