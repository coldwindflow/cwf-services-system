"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

test("paid service right opens scheduled step 2 with a valid calendar month", () => {
  const source = fs.readFileSync("customer-app/modules/prepaidBookingBridge.js", "utf8");
  const draftPatches = [];
  const previewPatches = [];
  const wizardPatches = [];
  const submitPatches = [];
  const root = {
    api: { getApiBase: () => "" },
    availability: { bangkokTodayYmd: () => "2026-09-08" },
    state: {
      updateDraft: (name, patch) => draftPatches.push({ name, patch }),
      setScheduledPreview: (name, patch) => previewPatches.push({ name, patch }),
      setScheduledWizard: (patch) => wizardPatches.push(patch),
      setScheduledSubmit: (patch) => submitPatches.push(patch),
    },
    utils: { routeTo: () => {} },
  };
  const document = {
    addEventListener: () => {},
    querySelector: () => null,
  };
  const context = {
    window: { CWFCustomerAppV2: root },
    document,
    Element: function Element() {},
    fetch: async () => { throw new Error("not used"); },
    encodeURIComponent,
    String,
    Number,
    Array,
    Error,
  };
  vm.runInNewContext(source, context, { filename: "prepaidBookingBridge.js" });

  root.prepaidBookingBridge._test.prepareScheduledDraft({
    catalog_item_id: 901,
    service_package_groups: [{ package_key: "air-reset-60-standard-small", btu: 12000, quantity: 2 }],
    services: [{ ac_type: "wall", btu: 12000, machine_count: 2, wash_variant: "standard" }],
    fixed_total_price: 959,
    duration_min: 120,
    redeem_until: "2027-01-31T16:59:59.999Z",
    prepaid_redemption_token: "paid_right_token_123456789",
    scheduled_request_key: "scheduled_request_123456789",
  });

  assert.equal(draftPatches.length, 1);
  assert.equal(draftPatches[0].name, "scheduled");
  assert.equal(draftPatches[0].patch.date, "2026-09-08");
  assert.equal(draftPatches[0].patch.calendar_month, "2026-09");
  assert.equal(draftPatches[0].patch.selectedSlot, null);
  assert.equal(draftPatches[0].patch.prepaid_redemption_token, "paid_right_token_123456789");
  assert.equal(draftPatches[0].patch.service_package_groups.length, 1);
  assert.deepEqual(wizardPatches.at(-1), { step: 2, error: "" });
  assert.equal(previewPatches.find((item) => item.name === "package")?.patch?.verified, true);
  assert.equal(previewPatches.find((item) => item.name === "pricing")?.patch?.data?.duration_min, 120);
  assert.equal(previewPatches.find((item) => item.name === "calendar")?.patch?.status, "idle");
  assert.equal(previewPatches.find((item) => item.name === "availability")?.patch?.status, "idle");
  assert.equal(submitPatches.at(-1)?.status, "idle");
});

test("customer app loads and precaches prepaid booking bridge after prepaid module", () => {
  const index = fs.readFileSync("customer-app/index.html", "utf8");
  const sw = fs.readFileSync("customer-app/sw.js", "utf8");
  const prepaid = index.indexOf("modules/prepaid.js");
  const bridge = index.indexOf("modules/prepaidBookingBridge.js");
  const router = index.indexOf("modules/router.js");
  assert.ok(prepaid >= 0 && bridge > prepaid && router > bridge);
  assert.match(sw, /prepaidBookingBridge\.js\?v=20260908_prepaid_slot_hotfix_v1/);
});