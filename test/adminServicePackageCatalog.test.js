"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createServicePackageCatalogService, validate, lifecycle } = require("../server/services/packages/servicePackageCatalogService");
const { createServicePackageResolver } = require("../server/services/packages/servicePackageResolver");

function valid(overrides = {}) {
  return { display_name: "Season package", description: "A managed package", service_key: "wash_wall",
    service_name: "Wall wash", job_type: "wash", ac_type: "wall", wash_variant: "premium",
    btu_min: 9000, btu_max: 18000, service_unit_duration_minutes: 45,
    sell_start_at: "2026-08-01T00:00:00.000Z", sell_end_at: "2026-08-31T00:00:00.000Z",
    redeem_until: "2026-09-30T00:00:00.000Z", is_active: false, is_customer_visible: false,
    tiers: [{ display_name: "Two units", service_quantity: 2, fixed_total_price: "1399.50", sort_order: 0, is_active: true },
      { display_name: "Four units", service_quantity: 4, fixed_total_price: "2499.00", sort_order: 1, is_active: true }], ...overrides };
}

function row(value, id = 41) {
  return { service_package_id: id, package_key: "pkg-server", ...value, tiers: [] };
}

test("validation accepts exact package fields and rejects dates, BTU, duration, price, quantity and service constraints before connecting", async () => {
  assert.equal(validate(valid()).tiers[0].fixed_total_price, "1399.50");
  const invalid = [
    { sell_end_at: "2026-07-01T00:00:00Z" }, { redeem_until: "2026-07-01T00:00:00Z" },
    { btu_min: 18000, btu_max: 9000 }, { service_unit_duration_minutes: 0 },
    { tiers: [{ display_name: "x", service_quantity: 1, fixed_total_price: "12.5", sort_order: 0, is_active: true }] },
    { tiers: [{ display_name: "x", service_quantity: 0, fixed_total_price: "12.50", sort_order: 0, is_active: true }] },
    { job_type: "unknown" }, { wash_variant: "unknown" },
  ];
  for (const change of invalid) assert.throws(() => validate(valid(change)));
  let connects = 0;
  const service = createServicePackageCatalogService({ pool: { query() {}, async connect() { connects += 1; } } });
  await assert.rejects(service.create(valid({ service_unit_duration_minutes: 0 })));
  assert.equal(connects, 0);
});

test("schema-range numeric failures are rejected exactly before connecting", async () => {
  const invalid = [
    { btu_min: 2147483648 },
    { btu_max: 2147483648 },
    { service_unit_duration_minutes: 2147483648 },
    { tiers: [{ display_name: "x", service_quantity: 2147483648, fixed_total_price: "12.50", sort_order: 0, is_active: true }] },
    { tiers: [{ display_name: "x", service_quantity: 1, fixed_total_price: "10000000000.00", sort_order: 0, is_active: true }] },
    { tiers: [{ display_name: "x", service_quantity: 1, fixed_total_price: "9999999999.999", sort_order: 0, is_active: true }] },
    { tiers: [{ display_name: "x", service_quantity: 1, fixed_total_price: "12.50", sort_order: 2147483648, is_active: true }] },
    { tiers: [{ display_name: "x", service_quantity: 1, fixed_total_price: "12.50", sort_order: -2147483649, is_active: true }] },
  ];
  assert.equal(validate(valid({ tiers: [{ display_name: "max", service_quantity: 2147483647,
    fixed_total_price: "9999999999.99", sort_order: -2147483648, is_active: true }] })).tiers[0].fixed_total_price, "9999999999.99");
  let connects = 0;
  const service = createServicePackageCatalogService({ pool: { query() {}, async connect() { connects += 1; } } });
  for (const change of invalid) await assert.rejects(service.create(valid(change)), { status: 400 });
  assert.equal(connects, 0);
});

test("managed package state feeds the existing customer discovery seam and excludes unavailable packages", async () => {
  const packages = [];
  let nextId = 1;
  const repo = {
    async insertPackage(_db, value) {
      const saved = row(value, nextId++);
      packages.push(saved);
      return saved;
    },
    async insertTier(_db, packageId, tier) {
      const saved = { service_package_tier_id: packageId * 10, service_package_id: packageId, ...tier };
      packages.find((item) => item.service_package_id === packageId).tiers.push(saved);
      return saved;
    },
    async listCustomerVisiblePackages(_db, { at } = {}) {
      const clock = at || new Date();
      return packages.filter((item) => item.is_active && item.is_customer_visible
        && (!item.sell_start_at || clock >= new Date(item.sell_start_at))
        && (!item.sell_end_at || clock <= new Date(item.sell_end_at)));
    },
  };
  const client = { async query() {}, release() {} };
  const pool = { async query() {}, async connect() { return client; } };
  const management = createServicePackageCatalogService({ pool, packageRepository: repo });
  const states = [
    ["available", { is_active: true, is_customer_visible: true }],
    ["future", { is_active: true, is_customer_visible: true, sell_start_at: "2026-09-01T00:00:00Z",
      sell_end_at: "2026-09-30T00:00:00Z", redeem_until: "2026-10-31T00:00:00Z" }],
    ["expired", { is_active: true, is_customer_visible: true, sell_end_at: "2026-08-01T00:00:00Z" }],
    ["hidden", { is_active: true, is_customer_visible: false }],
    ["inactive", { is_active: false, is_customer_visible: true }],
  ];
  for (const [name, overrides] of states) await management.create(valid({ display_name: name, ...overrides }));
  const discovery = createServicePackageResolver({ db: pool, packageRepository: repo });
  const visible = await discovery.listCustomerVisible({ at: new Date("2026-08-08T00:00:00Z") });
  assert.deepEqual(visible.map((item) => item.display_name), ["available"]);
});

test("create is one transaction, returns safe keys/round-trip values and rolls back a tier failure", async () => {
  const queries = [];
  const client = { async query(sql) { queries.push(sql); }, release() { queries.push("RELEASE"); } };
  const repo = {
    async insertPackage(_db, value) { return row(value); },
    async insertTier(_db, _id, tier) { return { service_package_tier_id: 70 + queries.length, ...tier }; },
  };
  const pool = { async query() {}, async connect() { return client; } };
  const service = createServicePackageCatalogService({ pool, packageRepository: repo, now: () => new Date("2026-08-08T00:00:00Z") });
  const result = await service.create(valid());
  assert.match(result.package_key, /^pkg-/);
  assert.equal(result.tiers[0].fixed_total_price, "1399.50");
  assert.equal("service_package_id" in result, false);
  assert.equal("service_package_tier_id" in result.tiers[0], false);
  assert.deepEqual(queries, ["BEGIN", "COMMIT", "RELEASE"]);

  queries.length = 0;
  repo.insertTier = async () => { throw new Error("simulated write failure"); };
  await assert.rejects(service.create(valid()), /simulated write failure/);
  assert.deepEqual(queries, ["BEGIN", "ROLLBACK", "RELEASE"]);
});

test("patch locks by immutable package key, keeps existing tier key and deactivates omitted tiers", async () => {
  const queries = [];
  const client = { async query(sql) { queries.push(sql); }, release() {} };
  const existing = { service_package_tier_id: 71, tier_key: "tier-stable" };
  let deactivated;
  const repo = {
    async findPackageByKeyForUpdate(_db, key) { assert.equal(key, "pkg-stable"); return row(valid(), 41); },
    async listTiersForUpdate() { return [existing, { service_package_tier_id: 72, tier_key: "tier-omitted" }]; },
    async updatePackage(_db, id, value) { assert.equal(id, 41); return row(value, 41); },
    async updateTier(_db, id, tier) { assert.equal(id, 71); return { ...existing, ...tier }; },
    async insertTier() { throw new Error("unexpected insert"); },
    async deactivateTiers(_db, id, kept) { deactivated = { id, kept }; },
  };
  const service = createServicePackageCatalogService({ pool: { async query() {}, async connect() { return client; } }, packageRepository: repo });
  const result = await service.update("pkg-stable", valid({ tiers: [{ tier_key: "tier-stable", display_name: "Updated", service_quantity: 3, fixed_total_price: "1500.00", sort_order: 2, is_active: true }] }));
  assert.equal(result.package_key, "pkg-server");
  assert.equal(result.tiers[0].tier_key, "tier-stable");
  assert.deepEqual(deactivated, { id: 41, kept: [71] });
  assert.deepEqual(queries, ["BEGIN", "COMMIT"]);
  await assert.rejects(service.update("pkg-stable", valid({ package_key: "changed" })), { code: "IMMUTABLE_KEY" });
});

test("management list includes every lifecycle and emits no numeric authority", async () => {
  const base = row({ ...valid(), is_active: true, is_customer_visible: true });
  const variants = [
    { ...base, package_key: "up", sell_start_at: "2026-09-01T00:00:00Z" },
    { ...base, package_key: "sale", sell_start_at: null, sell_end_at: null },
    { ...base, package_key: "ended", sell_end_at: "2026-08-01T00:00:00Z", redeem_until: "2026-09-01T00:00:00Z" },
    { ...base, package_key: "redeemed", sell_end_at: "2026-07-01T00:00:00Z", redeem_until: "2026-08-01T00:00:00Z" },
    { ...base, package_key: "hidden", is_customer_visible: false },
    { ...base, package_key: "off", is_active: false },
    { ...base, package_key: "draft", is_active: false, is_customer_visible: false },
  ];
  const service = createServicePackageCatalogService({ pool: { async query() {}, async connect() {} },
    packageRepository: { async listCatalogPackages() { return variants; } }, now: () => new Date("2026-08-08T00:00:00Z") });
  assert.deepEqual((await service.list()).map((item) => item.lifecycle_status), ["upcoming", "on-sale", "sale-ended", "redeem-ended", "hidden", "disabled", "draft"]);
  assert.deepEqual(variants.map((item) => lifecycle(item, new Date("2026-08-08T00:00:00Z"))), ["upcoming", "on-sale", "sale-ended", "redeem-ended", "hidden", "disabled", "draft"]);
});

test("management routes retain existing Admin auth and booking-selection routes remain unchanged", () => {
  const route = fs.readFileSync(path.join(__dirname, "../server/routes/admin/servicePackageCatalog.js"), "utf8");
  const booking = fs.readFileSync(path.join(__dirname, "../server/routes/admin/adminBookings.js"), "utf8");
  for (const method of ["get", "post", "patch"]) assert.match(route, new RegExp(`router\\.${method}\\([^\\n]+requireAdminSession`));
  assert.match(booking, /app\.get\("\/admin\/service-packages", requireAdminSession, service\.handleAdminServicePackageList\)/);
  assert.match(booking, /app\.post\("\/admin\/service-packages\/preview", requireAdminSession, service\.handleAdminServicePackagePreview\)/);
  assert.doesNotMatch(route, /service_package_id|service_package_tier_id|stack|sql/i);
});

test("management source never touches job snapshots or physically deletes package history", () => {
  const files = ["../server/services/packages/servicePackageCatalogService.js", "../server/services/packages/servicePackageRepository.js"];
  const source = files.map((file) => fs.readFileSync(path.join(__dirname, file), "utf8")).join("\n");
  assert.doesNotMatch(source, /job_items|service_package_snapshot/);
  assert.doesNotMatch(source, /DELETE\s+FROM\s+public\.service_package/i);
  assert.match(source, /SET is_active=FALSE/);
});
