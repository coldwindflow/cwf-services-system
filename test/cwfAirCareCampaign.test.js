"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const seed = fs.readFileSync("data-seeds/20260930_cwf_air_care.sql", "utf8");
const operator = fs.readFileSync("scripts/apply-cwf-air-care-seed.sh", "utf8");
const probe = fs.readFileSync("scripts/probe-air-care-quotes.js", "utf8");
test("AIR CARE contract", () => {
  ["COLDWINDFLOW AIR CARE","COLDWINDFLOW AIR SERVICES","499.00","899.00","1299.00","1699.00","699.00","1399.00","1899.00","2489.00","1799.00","2599.00","3399.00"].forEach((value) => assert.ok(seed.includes(value), value));
  assert.ok(seed.includes("2026-09-29T00:00:00+07:00"));
  assert.ok(seed.includes("2026-10-06T23:59:59.999+07:00"));
  assert.ok(seed.match(/service_package_redeem_until='2026-12-05T23:59:59\.999\+07:00'/));
  assert.ok(operator.includes("service_package_redeem_until='2026-12-05T23:59:59.999+07:00'"));
  assert.ok(operator.includes("parents=2 variants=4 tiers=16"));
});

test("AIR CARE seed repairs pre-existing Production rows and verifies server quotes", () => {
  assert.match(seed, /ON CONFLICT \(service_package_id,tier_key\) DO UPDATE/);
  assert.match(seed, /service_package_pricing_strategy=d\.pricing_strategy/);
  assert.match(seed, /service_package_selection_mode=d\.selection_mode/);
  assert.match(seed, /service_key=d\.bundle_key/);
  assert.match(seed, /service_level_key=d\.level_key/);
  assert.match(seed, /unit_price_modifier=d\.modifier/);
  assert.match(operator, /quote_probe preseed/);
  assert.match(operator, /quote_probe postseed/);
  assert.match(operator, /quotes=17 quantities=q1,q4,q5,q6,premium-mixed/);
  assert.match(probe, /createPrepaidOrderService/);
  assert.match(probe, /for \(const quantity of \[1, 4, 5, 6\]\)/);
  assert.match(probe, /AIR_CARE_QUOTE_EVIDENCE/);
});
