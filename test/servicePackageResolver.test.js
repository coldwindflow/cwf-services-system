"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createServicePackageResolver, readSnapshot } = require("../server/services/packages/servicePackageResolver");
const repository = require("../server/services/packages/servicePackageRepository");

const packageRow = {
  service_package_id: 10, package_key: "generic-care", display_name: "Generic Care",
  service_key: "canonical-service", service_name: "Canonical Service", service_unit_duration_minutes: 45,
  sell_start_at: "2026-08-01T00:00:00.000Z", sell_end_at: "2026-08-31T23:59:59.000Z",
  redeem_until: "2026-12-31T23:59:59.000Z", is_active: true, is_customer_visible: true,
};
const tierRow = {
  service_package_tier_id: 21, service_package_id: 10, tier_key: "two", display_name: "Two visits",
  service_quantity: 2, fixed_total_price: "1399.00", is_active: true,
};

function resolver(overrides = {}, clock = "2026-08-07T00:00:00.000Z") {
  const repo = {
    findPackageById: async () => ({ ...packageRow, ...overrides.package }),
    findPackageByKey: async () => ({ ...packageRow, ...overrides.package }),
    findTier: async (_db, identity) => identity.packageId === 10 ? ({ ...tierRow, ...overrides.tier }) : null,
    listCustomerVisiblePackages: async () => overrides.list || [],
  };
  return createServicePackageResolver({ db: {}, packageRepository: repo, now: () => new Date(clock) });
}

test("active package and matching tier resolve server fixed total and independent redeem limit", async () => {
  const result = await resolver().resolveSelection({
    packageKey: "generic-care", tierKey: "two", fixed_total_price: 1, duration_minutes: 1,
  });
  assert.equal(result.fixed_total_price, 1399);
  assert.equal(result.service_lines[0].unit_duration_minutes, 45);
  assert.equal(result.service_lines[0].quantity, 2);
  assert.equal(result.redeem_until, "2026-12-31T23:59:59.000Z");
  assert.deepEqual(result.snapshot, readSnapshot(JSON.stringify(result.snapshot)));
});

test("tier/package mismatch is rejected", async () => {
  const r = resolver();
  r.resolveSelection = createServicePackageResolver({
    db: {}, now: () => new Date("2026-08-07T00:00:00Z"),
    packageRepository: { findPackageByKey: async () => packageRow, findTier: async () => null },
  }).resolveSelection;
  await assert.rejects(() => r.resolveSelection({ packageKey: "generic-care", tierKey: "wrong" }), { code: "TIER_PACKAGE_MISMATCH" });
});

test("new selection is rejected before sell start and after sell end", async () => {
  await assert.rejects(() => resolver({}, "2026-07-31T23:59:59Z").resolveSelection({ packageKey: "generic-care", tierKey: "two" }), { code: "PACKAGE_NOT_ON_SALE" });
  await assert.rejects(() => resolver({}, "2026-09-01T00:00:00Z").resolveSelection({ packageKey: "generic-care", tierKey: "two" }), { code: "PACKAGE_NOT_ON_SALE" });
});

test("inactive package is rejected and repository listing filters hidden/inactive rows", async () => {
  await assert.rejects(() => resolver({ package: { is_active: false } }).resolveSelection({ packageKey: "generic-care", tierKey: "two" }), { code: "PACKAGE_INACTIVE" });
  const calls = [];
  const db = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
  assert.deepEqual(await repository.listCustomerVisiblePackages(db), []);
  assert.match(calls[0].sql, /p\.is_active=TRUE AND p\.is_customer_visible=TRUE/);
  assert.match(calls[0].sql, /sell_start_at IS NULL/);
  assert.match(calls[0].sql, /sell_end_at IS NULL/);
});

test("representative fixed totals are data, not package-name constants", async () => {
  for (const total of [699, 1399, 1899, 2489]) {
    const result = await resolver({ tier: { fixed_total_price: String(total) } }).resolveSelection({ packageId: 10, tierId: 21, price: 0 });
    assert.equal(result.fixed_total_price, total);
  }
});

test("historical reads retain the snapshot without repository re-resolution", () => {
  const snapshot = {
    schema_version: 1, package: { id: "10", key: "old", name: "Old" }, tier: { id: "21", key: "old", name: "Old" },
    service_lines: [{ service_key: "old", service_name: "Old", quantity: 1, unit_duration_minutes: 30 }],
    fixed_total_price: 699, redeem_until: null,
  };
  const historical = readSnapshot(snapshot);
  snapshot.fixed_total_price = 1;
  assert.equal(historical.fixed_total_price, 699);
});
