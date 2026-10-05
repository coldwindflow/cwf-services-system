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
