"use strict";

// Static asset delivery policy (Issue 314).
//
// Two independent concerns, both measured against the app's real middleware
// before this module existed:
//
//   1. Nothing was compressed. A cold Customer App load shipped 901 KB of raw
//      JS/CSS/HTML; gzip takes the same bytes to ~204 KB. customer-app/sw.js
//      fetches every /customer-app/ asset network-first with cache:"no-store",
//      so that full payload was re-downloaded on EVERY app open, not just the
//      first one.
//
//   2. express.static(ROOT_DIR) ran with no options, so every asset came back
//      as `Cache-Control: public, max-age=0` and had to be revalidated on every
//      navigation - even though every asset URL in this repo already carries a
//      ?v=BUILD_ID cache buster and is therefore safe to cache immutably.
//
// The rule below is safe by construction: an asset is only allowed to be cached
// long-lived when its URL carries a version marker, because that marker is what
// changes on the next deploy. Anything unversioned, any HTML, and every service
// worker must keep revalidating or clients would be stranded on old builds.

const compression = require("compression");

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;
const UPLOAD_CACHE_CONTROL = "private, no-store";

// Service workers control which build every client runs. A stale one is not a
// slow page, it is a client permanently pinned to an old release, so these can
// never be served from a long-lived cache regardless of any version marker.
const NEVER_CACHE_FILENAMES = new Set(["sw.js", "service-worker.js"]);

// Documents carry the ?v= references that bust everything else. Cache the
// document and the whole cache-busting scheme stops working.
const REVALIDATE_EXTENSIONS = new Set([".html", ".htm", ".webmanifest", ".json"]);

function fileName(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  const last = normalized.slice(normalized.lastIndexOf("/") + 1);
  return last.toLowerCase();
}

function extension(filePath) {
  const name = fileName(filePath);
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot);
}

// A request is "versioned" when it carries the repo's cache-busting marker.
// index.js references every asset as `<file>?v=<BUILD_ID>`, so the presence of a
// non-empty ?v= is exactly the signal that this URL changes on the next deploy.
function isVersionedRequest(req) {
  if (!req) return false;
  const raw = req.query && req.query.v;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === "string" && value.trim() !== "") return true;
  // Fall back to the raw URL for callers mounted before the query parser.
  const url = String(req.originalUrl || req.url || "");
  const match = /[?&]v=([^&]+)/.exec(url);
  return Boolean(match && decodeURIComponent(match[1]).trim() !== "");
}

/**
 * Cache-Control value for one static response.
 * Exported for tests: this is the whole policy, in one pure function.
 */
function cacheControlFor(filePath, req) {
  if (NEVER_CACHE_FILENAMES.has(fileName(filePath))) return "no-cache";
  if (REVALIDATE_EXTENSIONS.has(extension(filePath))) return "no-cache";
  if (isVersionedRequest(req)) return `public, max-age=${ONE_YEAR_SECONDS}, immutable`;
  // Unversioned asset: a long cache here would strand clients on an old file
  // with no way to bust it. Let the browser reuse it briefly, then revalidate.
  return "public, max-age=300, must-revalidate";
}

/** express.static options that apply the policy above. */
function staticOptions(extra = {}) {
  return {
    ...extra,
    setHeaders(res, filePath) {
      res.setHeader("Cache-Control", cacheControlFor(filePath, res.req));
    },
  };
}

/**
 * Uploaded job/customer/partner files are mutable, user-generated content.
 * A caller-controlled ?v= must never turn them into public immutable assets.
 */
function uploadStaticOptions(extra = {}) {
  return {
    ...extra,
    setHeaders(res) {
      res.setHeader("Cache-Control", UPLOAD_CACHE_CONTROL);
    },
  };
}

/**
 * gzip/deflate for text responses. Mounted once, ahead of every route, so API
 * JSON benefits too - not just static files.
 */
function createCompressionMiddleware(options = {}) {
  return compression({
    // Below ~1 KB the compressed frame plus CPU is not worth it.
    threshold: 1024,
    ...options,
    filter(req, res) {
      // Explicit opt-out for any future streaming/SSE route, which compression
      // would otherwise buffer and stall.
      if (req.headers["x-no-compression"]) return false;
      if (String(res.getHeader("Content-Type") || "").includes("text/event-stream")) return false;
      return compression.filter(req, res);
    },
  });
}

module.exports = {
  ONE_YEAR_SECONDS,
  UPLOAD_CACHE_CONTROL,
  cacheControlFor,
  isVersionedRequest,
  staticOptions,
  uploadStaticOptions,
  createCompressionMiddleware,
};
