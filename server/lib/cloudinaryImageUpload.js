"use strict";

const crypto = require("crypto");

// Accepts cloudinary://<api_key>:<api_secret>@<cloud_name> — never logged, only parsed.
function parseCloudinaryUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "cloudinary:") return null;
    const cloudName = String(u.hostname || "").trim();
    const apiKey = String(decodeURIComponent(u.username || "")).trim();
    const apiSecret = String(decodeURIComponent(u.password || "")).trim();
    if (!cloudName || !apiKey || !apiSecret) return null;
    return { cloudName, apiKey, apiSecret };
  } catch {
    return null;
  }
}

function parseCloudinaryEnv(env = process.env) {
  const cloudinaryUrl = String(env.CLOUDINARY_URL || "").trim();
  if (cloudinaryUrl) {
    const parsed = parseCloudinaryUrl(cloudinaryUrl);
    if (parsed) return parsed;
  }
  return {
    cloudName: String(env.CLOUDINARY_CLOUD_NAME || "").trim(),
    apiKey: String(env.CLOUDINARY_API_KEY || "").trim(),
    apiSecret: String(env.CLOUDINARY_API_SECRET || "").trim(),
  };
}

function cloudinaryEnabled(env = process.env) {
  const { cloudName, apiKey, apiSecret } = parseCloudinaryEnv(env);
  return Boolean(cloudName && apiKey && apiSecret);
}

// Folder ids must stay numeric-only so a hostile itemId can never inject path segments.
function sanitizeCatalogItemIdForFolder(itemId) {
  const n = Number(String(itemId == null ? "" : itemId).trim());
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("itemId ต้องเป็นจำนวนเต็มบวกสำหรับสร้างโฟลเดอร์รูปภาพ");
  }
  return String(n);
}

function signParams(params, apiSecret) {
  const pairs = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && String(params[k]).length)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHash("sha1").update(pairs + apiSecret).digest("hex");
}

async function uploadCatalogImage({ buffer, mimetype, itemId, env = process.env, fetchImpl = fetch } = {}) {
  const { cloudName, apiKey, apiSecret } = parseCloudinaryEnv(env);
  if (!cloudName || !apiKey || !apiSecret) {
    const err = new Error("CLOUDINARY_NOT_CONFIGURED");
    err.code = "CLOUDINARY_NOT_CONFIGURED";
    throw err;
  }
  if (!buffer || !buffer.length) throw new Error("ไม่พบไฟล์รูปภาพ");

  const ts = Math.floor(Date.now() / 1000);
  const safeItemId = sanitizeCatalogItemIdForFolder(itemId);
  const folder = `cwf/catalog/services/${safeItemId}`;
  const publicId = `img-${ts}-${crypto.randomBytes(4).toString("hex")}`;
  const params = { timestamp: ts, folder, public_id: publicId };
  const signature = signParams(params, apiSecret);

  const dataUri = `data:${mimetype || "image/jpeg"};base64,${Buffer.from(buffer).toString("base64")}`;
  const body = new URLSearchParams({
    timestamp: String(ts),
    folder,
    public_id: publicId,
    api_key: apiKey,
    signature,
    file: dataUri,
  });

  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`;
  const resp = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json || !json.secure_url) {
    const msg = json?.error?.message || `Cloudinary upload failed (${resp.status})`;
    const err = new Error(msg);
    err._cloudinary = json;
    throw err;
  }
  return { url: json.secure_url, public_id: json.public_id };
}

async function deleteCatalogImage(publicId, { env = process.env, fetchImpl = fetch } = {}) {
  const { cloudName, apiKey, apiSecret } = parseCloudinaryEnv(env);
  if (!cloudName || !apiKey || !apiSecret) {
    const err = new Error("CLOUDINARY_NOT_CONFIGURED");
    err.code = "CLOUDINARY_NOT_CONFIGURED";
    throw err;
  }
  const pid = String(publicId || "").trim();
  if (!pid) return { ok: true, skipped: true };

  const ts = Math.floor(Date.now() / 1000);
  const params = { public_id: pid, timestamp: ts };
  const signature = signParams(params, apiSecret);
  const body = new URLSearchParams({
    public_id: pid,
    timestamp: String(ts),
    api_key: apiKey,
    signature,
  });

  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/destroy`;
  const resp = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await resp.json().catch(() => ({}));
  const result = String(json?.result || "").toLowerCase();
  const ok = resp.ok && (result === "ok" || result === "not found");
  if (!ok) {
    const msg = json?.error?.message || `Cloudinary delete failed (${resp.status})`;
    throw new Error(msg);
  }
  return { ok: true, result };
}

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function detectImageSignature(buffer) {
  if (!buffer || buffer.length < 4) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function validateCatalogImageFile(file) {
  if (!file || !file.buffer || !file.buffer.length) return { ok: false, error: "ไม่พบไฟล์รูปภาพ" };
  if (file.size > MAX_IMAGE_BYTES || file.buffer.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: "ไฟล์รูปภาพใหญ่เกิน 5MB" };
  }
  const declaredMime = String(file.mimetype || "").toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(declaredMime)) {
    return { ok: false, error: "รองรับเฉพาะไฟล์ JPEG, PNG หรือ WEBP" };
  }
  const actualMime = detectImageSignature(file.buffer);
  if (!actualMime || actualMime !== declaredMime) {
    return { ok: false, error: "ไฟล์รูปภาพไม่ถูกต้องหรือเสียหาย" };
  }
  return { ok: true };
}

module.exports = {
  ALLOWED_MIME_TYPES,
  MAX_IMAGE_BYTES,
  cloudinaryEnabled,
  parseCloudinaryEnv,
  parseCloudinaryUrl,
  sanitizeCatalogItemIdForFolder,
  uploadCatalogImage,
  deleteCatalogImage,
  detectImageSignature,
  validateCatalogImageFile,
};
