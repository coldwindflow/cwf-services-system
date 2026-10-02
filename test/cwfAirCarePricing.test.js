"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const seed = fs.readFileSync("data-seeds/20260930_cwf_air_care.sql", "utf8");
const service = fs.readFileSync("server/services/prepaid/prepaidOrderServiceV2.js", "utf8");
const ui = fs.readFileSync("customer-app/modules/prepaid.js", "utf8");

function loadPrepaidUi(btuOptions = []) {
  const root = {
    api: {},
    services: { bookableBtuOptions: btuOptions },
    state: { customer: { logged_in: false } },
  };
  const document = {
    head: { appendChild() {} },
    body: { appendChild() {} },
    getElementById() { return null; },
    createElement() { return { addEventListener() {}, dataset: {} }; },
    addEventListener() {},
    querySelector() { return null; },
  };
  const context = {
    window: { CWFCustomerAppV2: root, addEventListener() {} },
    document,
    Element: function Element() {},
    fetch: async () => { throw new Error("not used"); },
    encodeURIComponent,
    URL,
    setTimeout,
    clearTimeout,
    Intl,
  };
  vm.runInNewContext(ui, context, { filename: "prepaid.js" });
  return root;
}

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


test("AIR CARE prepaid UI scopes two BTU groups without changing generic prepaid BTU choices", () => {
  assert.match(ui, /coldwindflow-air-care-standard/);
  assert.match(ui, /coldwindflow-air-care-premium/);
  assert.match(ui, /ไม่เกิน 12,000 BTU/);
  assert.match(ui, /18,000 BTU ขึ้นไป/);
  assert.match(ui, /bookableBtuOptions/);
});

test("Production-shaped AIR CARE catalog DTO opens exactly the two purchasable BTU options", () => {
  const root = loadPrepaidUi();
  const rows = root.prepaid._test.packageRows({
    service_bundle_key: "coldwindflow-air-care-premium",
    service_package_variants: [
      {
        package_key: "coldwindflow-air-care-premium-small",
        package_name: "PREMIUM • ≤12,000 BTU",
        service: { btu_min: null, btu_max: 12000 },
        tiers: [699, 1399, 1899, 2489].map((fixed_total_price, index) => ({
          tier_key: `q${index + 1}`, quantity: index + 1, fixed_total_price: String(fixed_total_price),
        })),
      },
      {
        package_key: "coldwindflow-air-care-premium-large",
        package_name: "PREMIUM • ≥18,000 BTU",
        service: { btu_min: 18000, btu_max: null },
        tiers: [899, 1799, 2599, 3399].map((fixed_total_price, index) => ({
          tier_key: `q${index + 1}`, quantity: index + 1, fixed_total_price: String(fixed_total_price),
        })),
      },
    ],
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(rows)),
    [
      { package_key: "coldwindflow-air-care-premium-small", label: "ไม่เกิน 12,000 BTU", btu: 12000, quantity: 1 },
      { package_key: "coldwindflow-air-care-premium-large", label: "18,000 BTU ขึ้นไป", btu: 18000, quantity: 0 },
    ]
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(root.prepaid._test.selectedGroups(rows))),
    [{ package_key: "coldwindflow-air-care-premium-small", btu: 12000, quantity: 1 }]
  );
});

test("AIR CARE is uncapped for server-side tier composition beyond q4", () => {
  assert.match(seed, /service_package_maximum_total_quantity=NULL/);
  assert.match(service, /60 \* 24 \* 60 \* 60 \* 1000/);
});

test("test-only second prepaid campaign renders from generic server variant metadata", () => {
  const root = loadPrepaidUi([{ btu: 9000 }, { btu: 18000 }]);
  const rows = root.prepaid._test.packageRows({
    service_bundle_key: "qa-future-prepaid-campaign",
    item_name: "FUTURE QA PROMOTION",
    service_package_variants: [
      { package_key: "future-small", display_name: "SMALL", service: { btu_min: 1, btu_max: 12000 } },
      { package_key: "future-large", display_name: "LARGE", service: { btu_min: 18000, btu_max: 24000 } },
    ],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(rows.map((row) => [row.package_key, row.btu]))),
    [["future-small", 9000], ["future-large", 18000]]);
  assert.doesNotMatch(fs.readFileSync("admin-prepaid-assist.js", "utf8"), /coldwindflow-air-care-/);
});

test("prepaid UI accepts only a server price and hides internal quote codes from customer copy", () => {
  const root = loadPrepaidUi();
  assert.equal(root.prepaid._test.requireQuote({ quote: { fixed_total_price: "699.00" } }).fixed_total_price, "699.00");
  assert.throws(() => root.prepaid._test.requireQuote({ ok: true }), /INVALID_PREPAID_QUOTE_RESPONSE/);
  assert.equal(
    root.prepaid._test.quoteErrorMessage({ code: "SERVICE_PACKAGE_LEVEL_SELECTION_REQUIRED" }),
    "ไม่สามารถคำนวณราคาได้ กรุณาลองใหม่ หรือติดต่อ LINE @cwfair"
  );
  assert.match(ui, /ราคาที่ระบบยืนยัน/);
});

test("returning customer locations merge matching addresses without losing the saved map pin", () => {
  const root = loadPrepaidUi();
  const locations = root.prepaid._test.locationChoices(
    { address: "123 ถนนตัวอย่าง", maps_url: "" },
    [{ address: "123  ถนนตัวอย่าง", prepaid_maps_url: "https://maps.app.goo.gl/saved", prepaid_gps_latitude: 13.7, prepaid_gps_longitude: 100.5 }],
    [{ address_text: "คอนโดอีกแห่ง", maps_url: "https://www.google.com/maps?q=13.8,100.6" }]
  );
  assert.equal(locations.length, 2);
  assert.equal(locations[0].maps_url, "https://maps.app.goo.gl/saved");
  assert.equal(locations[0].gps_latitude, 13.7);
  assert.equal(locations[1].address_text, "คอนโดอีกแห่ง");
});

test("customer map validation matches the server allowlist and excludes arbitrary HTTPS links", () => {
  const root = loadPrepaidUi();
  assert.equal(root.prepaid._test.validMapUrl("https://maps.app.goo.gl/saved"), true);
  assert.equal(root.prepaid._test.validMapUrl("https://www.google.com/maps?q=13.7,100.5"), true);
  assert.equal(root.prepaid._test.validMapUrl("https://example.com/location"), false);
  assert.equal(root.prepaid._test.validMapUrl("javascript:alert(1)"), false);
});
