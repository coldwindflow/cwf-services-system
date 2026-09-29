"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const seed = fs.readFileSync("data-seeds/20260930_cwf_air_care.sql", "utf8");
const service = fs.readFileSync("server/services/prepaid/prepaidOrderServiceV2.js", "utf8");
const ui = fs.readFileSync("customer-app/modules/prepaid.js", "utf8");

test("COLDWINDFLOW AIR CARE STANDARD exact matrix", () => {
  const expected = [
    ["standard-small","q1","499.00"],["standard-small","q2","899.00"],["standard-small","q3","1299.00"],["standard-small","q4","1699.00"],
    ["standard-large","q1","499.00"],["standard-large","q2","899.00"],["standard-large","q3","1299.00"],["standard-large","q4","1699.00"],
  ];
  expected.forEach(([variant,tier,price]) => {
    assert.match(seed, new RegExp("coldwindflow-air-care-"+variant+"'[^\\n]*'"+tier+"'[^\\n]*"+price.replace(".","\\.")));
  });
  assert.match(seed, /coldwindflow-air-care-standard-large[^\n]*100\.00/);
});

test("COLDWINDFLOW AIR CARE PREMIUM exact matrices", () => {
  const expected = [
    ["premium-small","q1","699.00"],["premium-small","q2","1399.00"],["premium-small","q3","1899.00"],["premium-small","q4","2489.00"],
    ["premium-large","q1","899.00"],["premium-large","q2","1799.00"],["premium-large","q3","2599.00"],["premium-large","q4","3399.00"],
  ];
  expected.forEach(([variant,tier,price]) => {
    assert.match(seed, new RegExp("coldwindflow-air-care-"+variant+"'[^\\n]*'"+tier+"'[^\\n]*"+price.replace(".","\\.")));
  });
});

test("both AIR CARE bundles receive 60-day purchase validity and full customer branding", () => {
  assert.match(service, /startsWith\("coldwindflow-air-care-"\)/);
  assert.match(service, /60 \* 24 \* 60 \* 60 \* 1000/);
  assert.doesNotMatch(ui, />CWF PREPAID</);
  assert.doesNotMatch(ui, /โปรโมชั่น CWF/);
  assert.doesNotMatch(ui, /สิทธิ์บริการ CWF/);
  assert.doesNotMatch(ui, /จองสิทธิ์ CWF/);
});


test("AIR CARE prepaid UI exposes exactly two BTU pricing groups per campaign item", () => {
  assert.doesNotMatch(ui, /bookableBtuOptions/);
  assert.match(ui, /ไม่เกิน 12,000 BTU/);
  assert.match(ui, /18,000 BTU ขึ้นไป/);
  assert.match(ui, /isSmall \? 12000 : isLarge \? 18000/);
});


test("AIR CARE is uncapped and extends the q4 marginal rate for quantity 5+", () => {
  assert.match(seed, /service_package_maximum_total_quantity=NULL/);
  assert.match(service, /60 \* 24 \* 60 \* 60 \* 1000/);
});
