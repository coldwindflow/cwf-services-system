"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  DEFAULT_JOB_BRAND_KEY,
  getJobBrand,
  resolveBookingJobBrand,
  serializeJobBrand,
} = require("../server/domain/jobBrands");
const { createBookingJobService } = require("../server/services/booking/createBookingJob");

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

function responseHarness() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = Number(code); return this; },
    json(payload) { this.body = payload; return payload; },
  };
}

test("job brand registry defaults legacy/stale input to CWF and supports extensible keys", () => {
  assert.equal(DEFAULT_JOB_BRAND_KEY, "cwf");
  assert.deepEqual(getJobBrand(), { key: "cwf", label: "CWF", name: "Cold Wind Flow" });
  assert.deepEqual(resolveBookingJobBrand(" CWF "), { key: "cwf", label: "CWF", name: "Cold Wind Flow" });
  assert.deepEqual(resolveBookingJobBrand("axs", { allowNonDefault: true }), { key: "axs", label: "AXS", name: "AXS Air Service" });
  assert.deepEqual(serializeJobBrand({ job_id: 7, brand_key: null }), {
    job_id: 7,
    brand_key: "cwf",
    brand: { key: "cwf", label: "CWF", name: "Cold Wind Flow" },
  });
  assert.throws(() => resolveBookingJobBrand("future-brand", { allowNonDefault: true }), (error) => error.code === "UNKNOWN_JOB_BRAND" && error.statusCode === 400);
  assert.throws(() => resolveBookingJobBrand("axs"), (error) => error.code === "JOB_BRAND_NOT_ALLOWED" && error.statusCode === 403);
});

test("public and non-admin callers cannot spoof AXS before any database work", async () => {
  const service = createBookingJobService({ isServiceZoneFilterEnabled: () => false });
  const publicResponse = responseHarness();
  await service.handlePublicBook({ body: { brand: "axs" } }, publicResponse);
  assert.equal(publicResponse.statusCode, 403);
  assert.equal(publicResponse.body.code, "JOB_BRAND_NOT_ALLOWED");

  const adminResponse = responseHarness();
  await service.handleAdminBookV2({ body: { brand: "axs" } }, adminResponse);
  assert.equal(adminResponse.statusCode, 403);
  assert.equal(adminResponse.body.code, "JOB_BRAND_NOT_ALLOWED");
});

test("brand migration is one additive, idempotent default-CWF schema change with an approved checksum", () => {
  const relativePath = "migrations/20260920_job_brand_foundation.sql";
  const sql = read(relativePath);
  const executable = sql.replace(/--.*$/gm, "");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS brand_key TEXT NOT NULL DEFAULT 'cwf'/i);
  assert.doesNotMatch(executable, /\b(?:DELETE|TRUNCATE|DROP\s+TABLE|DROP\s+COLUMN)\b/i);
  assert.doesNotMatch(sql, /is_axs/i);
  assert.doesNotMatch(sql, /CHECK\s*\([^)]*(?:cwf|axs)/i);

  const hash = crypto.createHash("sha256").update(read(relativePath).replace(/\r\n/g, "\n")).digest("hex");
  assert.match(read("migrations/.deploy-approved.tsv"), new RegExp(`^${hash}\\t20260920_job_brand_foundation\\.sql\\texpand$`, "m"));
});

test("admin/technician DTOs and UIs expose brand while assignment and collision stay shared", () => {
  const index = read("index.js");
  const booking = read("server/services/booking/createBookingJob.js");
  const adminAdd = read("admin-add-v2.js");
  const adminAddHtml = read("admin-add-v2.html");
  const adminQueue = read("admin-queue-v2.js");
  const adminHistory = read("admin-history-v2.js");
  const tech = read("app.js");

  assert.match(booking, /admin_request_fingerprint, brand_key/);
  assert.match(index, /serializeJobBrands\(r\.rows\)/);
  assert.match(index, /j\.brand_key/);
  assert.match(index, /brand_key: jobR\.rows\[0\]\.brand_key/);
  assert.match(adminAddHtml, /<select id="brand">[\s\S]*value="cwf"[\s\S]*value="axs"/);
  assert.match(adminAdd, /brand:\s*\(el\("brand"\)/);
  assert.match(adminQueue, /brandBadgeHtml\(x\.job\)/);
  assert.match(adminHistory, /brandBadgeHtml\(j\)/);
  assert.match(tech, /renderJobBrandBadge\(o\)/);
  assert.match(tech, /renderJobBrandBadge\(job\)/);

  const assignedStart = index.indexOf("async function listAssignedJobsForTechOnDate");
  const collisionEnd = index.indexOf("// 💲 Pricing + Duration Preview", assignedStart);
  assert.ok(assignedStart >= 0 && collisionEnd > assignedStart);
  const sharedCapacitySource = index.slice(assignedStart, collisionEnd);
  assert.doesNotMatch(sharedCapacitySource, /brand_key|JOB_BRANDS|\bbrand\b/);

  for (const source of [booking, index, adminAdd, adminQueue, adminHistory, tech]) {
    assert.doesNotMatch(source, /\bis_axs\b/i);
  }
});

test("technician cache/version markers match every changed shell reference", () => {
  const build = "20260920_issue366_axs_pricing_v1";
  assert.match(read("app.js"), new RegExp(build));
  assert.match(read("sw.js"), new RegExp(build));
  assert.match(read("cwf-pwa.js"), new RegExp(build));
  assert.equal((read("tech.html").match(new RegExp(build, "g")) || []).length, 3);
  assert.match(read("admin-add-v2.html"), /20260921_issue374_single_tech_v1/);
  assert.match(read("admin-queue-v2.html"), new RegExp(build));
  assert.match(read("admin-history-v2.html"), new RegExp(build));
});
