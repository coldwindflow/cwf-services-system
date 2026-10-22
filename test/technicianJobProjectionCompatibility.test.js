"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");

test("technician Job projections tolerate legacy schemas without optional air and note columns", () => {
  const technicianQueries = source.slice(
    source.indexOf("async function _loadTechnicianVisibleJobsByIds"),
    source.indexOf("// =======================================\n// 🛠️ ADMIN: EDIT JOB")
  );
  assert.ok(technicianQueries.includes("app.get(\"/jobs/tech/:username\""));
  for (const field of ["air_type", "air_quantity", "technician_note_at"]) {
    assert.doesNotMatch(technicianQueries, new RegExp(`\\bj\\.${field}\\b`));
    assert.match(technicianQueries, new RegExp(`to_jsonb\\(j\\)->>'${field}'`));
  }
  for (const field of ["address_text", "maps_url", "gps_latitude", "gps_longitude", "customer_name", "customer_phone"]) {
    assert.match(technicianQueries, new RegExp(`\\bj\\.${field}\\b`));
  }
});

test("technician Job projections carry the on-site note and the prepaid settlement", () => {
  const technicianQueries = source.slice(
    source.indexOf("async function _loadTechnicianVisibleJobsByIds"),
    source.indexOf("// =======================================\n// 🛠️ ADMIN: EDIT JOB")
  );
  // There are three technician projections: the by-ids loader and the two
  // branches of GET /jobs/tech/:username. A field added to only one of them
  // would appear and then vanish depending on how the app asked for the job.
  const branches = technicianQueries.match(/NULLIF\(to_jsonb\(j\)->>'air_quantity'/g) || [];
  assert.equal(branches.length, 3, "every technician projection must stay in step");

  // The customer's on-site note reaches the Job row from the paid Order, and is
  // what tells the technician to call ahead or watch for a dog. jobs.customer_note
  // is ensured at boot, so it can be selected directly.
  assert.equal((technicianQueries.match(/\bj\.customer_note\b/g) || []).length, 3);

  // customer_due and payment_source exist only after the prepaid entitlements
  // migration. Selecting them directly would make the whole technician Job list
  // fail on a database that has not had it applied yet, so they stay optional.
  for (const field of ["customer_due", "payment_source"]) {
    assert.doesNotMatch(technicianQueries, new RegExp(`\\bj\\.${field}\\b`));
    assert.equal((technicianQueries.match(new RegExp(`to_jsonb\\(j\\)->>'${field}'`, "g")) || []).length, 3);
  }
});
