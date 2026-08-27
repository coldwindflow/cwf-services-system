"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");

function loadBooking() {
  const window = {
    CWFCustomerAppV2: {},
    location: { protocol: "https:", origin: "https://example.test", search: "", hash: "" },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    addEventListener() {},
  };
  const context = vm.createContext({ window, document: { addEventListener() {} }, URL, URLSearchParams, Intl, Date, console, setTimeout, clearTimeout, requestAnimationFrame(fn) { fn(); } });
  context.globalThis = context;
  for (const name of ["state.js", "utils.js", "customerCopy.js", "services.js", "availability.js", "bookingScheduled.js"]) {
    vm.runInContext(read(`customer-app/modules/${name}`), context, { filename: name });
  }
  return window.CWFCustomerAppV2;
}

function preview(overrides = {}) {
  return {
    package_key: "arbitrary-package", package_name: "Arbitrary Server Package", description: "From DTO",
    tier_key: "server-tier", tier_name: "Server Tier", fixed_total_price: "1399.50", quantity: 2,
    unit_duration_minutes: 45, redeem_until: "2027-01-31T16:59:59.000Z",
    service: { service_key: "server-service", service_name: "Server Service", constraints: { job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างพรีเมียม", btu_min: null, btu_max: 12000 } },
    ...overrides,
  };
}

function selectInMemory(root, data = preview(), btu = 12000) {
  root.state.updateDraft("scheduled", { service_package_key: data.package_key, service_package_tier_key: data.tier_key, service_package_btu: String(btu), services: [] });
  root.state.setScheduledPreview("package", { status: "success", data, error: "", verified: true });
  root.state.setScheduledPreview("pricing", { status: "success", data: { duration_min: data.quantity * data.unit_duration_minutes, fixed_total_price: data.fixed_total_price }, error: "" });
}

function container() {
  return { innerHTML: "", querySelector() { return null; }, querySelectorAll() { return []; }, scrollIntoView() {} };
}

test("discovery renders arbitrary DTO data and preserves exact fixed-total text", () => {
  const root = loadBooking();
  root.state.setScheduledPreview("packages", { status: "success", items: [{ ...preview(), tiers: [{ tier_key: "server-tier", tier_name: "Any Tier", quantity: 2, fixed_total_price: "1399.50" }] }], error: "" });
  const html = root.bookingScheduled._test.renderPackagePicker();
  assert.match(html, /Arbitrary Server Package/);
  assert.match(html, /Any Tier/);
  assert.match(html, /1399\.50/);
  assert.doesNotMatch(read("customer-app/modules/bookingScheduled.js"), /premium-day|Premium Day/);
});

test("package BTU choices enforce both maximum and minimum constraints", () => {
  const root = loadBooking();
  assert.deepEqual(Array.from(root.bookingScheduled._test.packageBtuOptions(preview())).map((x) => x.btu), [9000, 12000]);
  const high = preview({ service: { service_key: "large", service_name: "Large", constraints: { job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างพรีเมียม", btu_min: 18000, btu_max: null } } });
  assert.deepEqual(Array.from(root.bookingScheduled._test.packageBtuOptions(high)).map((x) => x.btu), [18000, 24000, 30000]);
});

test("fresh package selection requires an explicit allowed BTU choice", async () => {
  const root = loadBooking();
  root.api = { previewServicePackage: async () => preview() };
  await root.bookingScheduled._test.selectServicePackage("arbitrary-package", "server-tier", container());
  assert.deepEqual(Array.from(root.bookingScheduled._test.packageBtuOptions()).map((x) => x.btu), [9000, 12000]);
  assert.equal(root.state.draft.scheduled.service_package_btu, "");
  assert.notEqual(root.bookingScheduled._test.validateServiceStep(), "");
  const source = read("customer-app/modules/bookingScheduled.js");
  assert.match(source, /async function goNext[\s\S]*const error = validateServiceStep\(\)/);
  assert.match(source, /async function submit[\s\S]*const serviceError = validateServiceStep\(\)[\s\S]*if \(contactError \|\| serviceError/);

  const high = preview({ service: { service_key: "large", service_name: "Large", constraints: { job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างพรีเมียม", btu_min: 18000, btu_max: null } } });
  root.api.previewServicePackage = async () => high;
  await root.bookingScheduled._test.selectServicePackage("arbitrary-package", "server-tier", container());
  assert.deepEqual(Array.from(root.bookingScheduled._test.packageBtuOptions()).map((x) => x.btu), [18000, 24000, 30000]);
  assert.equal(root.state.draft.scheduled.service_package_btu, "");
  assert.notEqual(root.bookingScheduled._test.validateServiceStep(), "");
});

test("package restore keeps only a still-valid explicit BTU", async () => {
  const root = loadBooking();
  root.api = { previewServicePackage: async () => preview() };
  await root.bookingScheduled._test.selectServicePackage("arbitrary-package", "server-tier", container(), { restoredBtu: 12000, restore: true });
  assert.equal(root.state.draft.scheduled.service_package_btu, "12000");
  assert.equal(root.bookingScheduled._test.validateServiceStep(), "");

  await root.bookingScheduled._test.selectServicePackage("arbitrary-package", "server-tier", container(), { restoredBtu: 18000, restore: true });
  assert.equal(root.state.draft.scheduled.service_package_btu, "");
  assert.notEqual(root.bookingScheduled._test.validateServiceStep(), "");
});

test("package payload contains only keys and actual BTU while availability is server-derived", () => {
  const root = loadBooking();
  const data = preview();
  selectInMemory(root, data);
  root.state.updateDraft("scheduled", { customer_name: "A", customer_phone: "0812345678", address_text: "Bangkok", selectedSlot: { date: root.state.draft.scheduled.date, start: "09:00" } });
  const payload = root.bookingScheduled._test.buildSubmitPayload();
  assert.equal(payload.service_package_key, "arbitrary-package");
  assert.equal(payload.service_package_tier_key, "server-tier");
  assert.equal(payload.btu, 12000);
  for (const forbidden of ["services", "price", "fixed_total_price", "duration_min", "machine_count", "service_package_id", "snapshot", "job_type", "ac_type", "wash_variant"]) assert.equal(forbidden in payload, false, forbidden);
  const query = root.bookingScheduled._test.currentAvailabilityQuery();
  assert.equal(query.machine_count, 2);
  assert.equal(query.duration_min, 90);
  assert.equal(query.job_type, "ล้าง");
  assert.equal("services" in query, false);
});

test("composite Store selection submits only stable package keys, BTU, quantity, and keeps duplicate-submit key", () => {
  const root = loadBooking();
  const previewData = { package_name: "Bundle", fixed_total_price: "3198.00", duration_min: 180,
    redeem_until: "2027-01-31T16:59:59.000Z", groups: [], payload: { services: [
      { job_type: "wash", ac_type: "wall", btu: 12000, machine_count: 2, wash_variant: "premium", repair_variant: "" },
      { job_type: "wash", ac_type: "wall", btu: 18000, machine_count: 2, wash_variant: "premium", repair_variant: "" },
    ] } };
  root.state.updateDraft("scheduled", { customer_name: "TEST", customer_phone: "0812345678", address_text: "TEST",
    selectedSlot: { date: root.state.draft.scheduled.date, start: "09:00" },
    catalog_item_id: 51,
    service_package_groups: [{ package_key: "small", btu: 12000, quantity: 2 }, { package_key: "large", btu: 18000, quantity: 2 }],
    service_package_bundle_preview: previewData, services: [] });
  root.state.setScheduledPreview("package", { status: "success", data: previewData, error: "", verified: true });
  const payload = root.bookingScheduled._test.buildSubmitPayload();
  assert.equal(payload.service_package_groups.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(payload.service_package_groups)), [
    { package_key: "small", btu: 12000, quantity: 2 }, { package_key: "large", btu: 18000, quantity: 2 },
  ]);
  assert.match(payload.scheduled_request_key, /^[A-Za-z0-9_-]{16,128}$/);
  assert.equal(payload.catalog_item_id, 51);
  for (const forbidden of ["fixed_total_price", "duration_min", "snapshot", "service_package_id"]) assert.equal(forbidden in payload, false);
  assert.equal(root.bookingScheduled._test.validateServiceStep(), "");
});

test("ordinary payload remains ordinary and package horizon is isolated", () => {
  const root = loadBooking();
  const ordinaryMax = root.bookingScheduled._test.maxBookingDate();
  const today = root.availability.bangkokTodayYmd();
  const expected = new Date(`${today}T12:00:00`); expected.setDate(expected.getDate() + 90);
  assert.equal(ordinaryMax, `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, "0")}-${String(expected.getDate()).padStart(2, "0")}`);
  const ordinary = root.bookingScheduled._test.buildSubmitPayload();
  assert.ok(Array.isArray(ordinary.services));
  assert.equal("service_package_key" in ordinary, false);
  selectInMemory(root);
  assert.equal(root.bookingScheduled._test.maxBookingDate(), "2027-01-31");
});

test("review is customer-safe and package quantity comes from preview", () => {
  const root = loadBooking();
  selectInMemory(root, preview({ quantity: 2 }));
  const html = root.bookingScheduled._test.renderReviewRows();
  assert.match(html, /Arbitrary Server Package/);
  assert.match(html, /2 เครื่อง/);
  assert.match(html, /1399\.50/);
  assert.doesNotMatch(html, /\/public\/|service_package_id|snapshot|SQL|stack/i);
});

test("selecting and clearing a package invalidates mixed services, price, calendar, and slot", async () => {
  const root = loadBooking();
  root.api = { previewServicePackage: async () => preview(), loadServicePackages: async () => ({ service_packages: [] }) };
  root.state.setScheduledPreview("pricing", { status: "success", data: { duration_min: 999 }, error: "" });
  root.state.setScheduledPreview("calendar", { status: "success", data: {}, query_key: "old" });
  root.state.setScheduledPreview("availability", { status: "success", data: {}, query_key: "old" });
  root.state.updateDraft("scheduled", { selectedSlot: { key: "old" }, scheduled_request_key: "old-request" });
  await root.bookingScheduled._test.selectServicePackage("arbitrary-package", "server-tier", container());
  assert.equal(root.state.draft.scheduled.services.length, 0);
  assert.equal(root.state.draft.scheduled.selectedSlot, null);
  assert.equal(root.state.draft.scheduled.scheduled_request_key, "");
  assert.equal(root.state.scheduledPreview.calendar.status, "idle");
  assert.equal(root.state.scheduledPreview.availability.status, "idle");
  root.bookingScheduled._test.clearPackageSelection();
  assert.equal(root.state.draft.scheduled.service_package_key, "");
  assert.equal(root.state.draft.scheduled.service_package_tier_key, "");
});

test("failed package re-preview remains package mode and cannot become an ordinary submit", async () => {
  const root = loadBooking();
  root.api = { previewServicePackage: async () => { const error = new Error("internal"); error.status = 404; throw error; } };
  await root.bookingScheduled._test.selectServicePackage("expired-package", "expired-tier", container(), { restoredBtu: 12000, restore: true });
  assert.equal(root.state.scheduledWizard.step, 1);
  assert.equal(root.state.scheduledPreview.package.verified, false);
  const payload = root.bookingScheduled._test.buildSubmitPayload();
  assert.equal(payload.service_package_key, "expired-package");
  assert.equal("services" in payload, false);
  assert.match(root.state.scheduledWizard.error, /แพ็กเกจ/);
});

test("build id is coordinated and service worker privacy/network behavior remains", () => {
  const index = read("customer-app/index.html");
  const sw = read("customer-app/sw.js");
  const app = read("customer-app/assets/customer-app.js");
  const manifest = read("customer-app/manifest.webmanifest");
  const build = sw.match(/BUILD_ID = "([^"]+)"/)[1];
  assert.equal(build, "20260827_minimum_price_upload_cache_v1");
  assert.match(index, new RegExp(build));
  assert.match(app, new RegExp(`BUILD_ID = "${build}"`));
  assert.match(manifest, new RegExp(`index\\.html\\?v=${build}#home`));
  assert.match(sw, /url\.pathname\.startsWith\("\/public\/"\)[\s\S]*event\.respondWith\(fetch\(request\)\)/);
  assert.match(sw, /hasTrackingCredential[\s\S]*fetch\(request, \{ cache: "no-store" \}\)/);
});
