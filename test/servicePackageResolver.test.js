"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createServicePackageResolver, readSnapshot } = require("../server/services/packages/servicePackageResolver");
const repository = require("../server/services/packages/servicePackageRepository");

const packageRow = {
  service_package_id: 10, package_key: "premium-wall", display_name: "Premium Wall Cleaning",
  service_key: "canonical-service", service_name: "Canonical Service", service_unit_duration_minutes: 45,
  job_type: "wash", ac_type: "wall", wash_variant: "premium", btu_min: null, btu_max: 12000,
  sell_start_at: "2026-08-01T00:00:00.000Z", sell_end_at: "2026-08-31T23:59:59.000Z",
  redeem_until: "2026-12-31T23:59:59.000Z", is_active: true, is_customer_visible: true,
};
const tierRow = {
  service_package_tier_id: 21, service_package_id: 10, tier_key: "two", display_name: "Two units",
  service_quantity: 2, fixed_total_price: "1399.50", is_active: true,
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

test("wall premium package returns BTU maximum, quantity separately, and exact decimal snapshot", async () => {
  const result = await resolver().resolveSelection({
    packageKey: "premium-wall", tierKey: "two", price: 1, fixed_total_price: 1,
    duration_minutes: 1, service_name: "fake", btu: 99999,
  });
  assert.equal(result.fixed_total_price, "1399.50");
  assert.equal(result.service_lines[0].service_key, "canonical-service");
  assert.equal(result.service_lines[0].service_name, "Canonical Service");
  assert.equal(result.service_lines[0].unit_duration_minutes, 45);
  assert.equal(result.service_lines[0].quantity, 2);
  assert.deepEqual(result.service_lines[0].service_constraints, {
    job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างพรีเมียม", btu_min: null, btu_max: 12000,
  });
  assert.equal(result.snapshot.fixed_total_price, "1399.50");
  assert.deepEqual(result.snapshot, readSnapshot(JSON.stringify(result.snapshot)));
});

test("future package may set BTU minimum without inventing an exact BTU", async () => {
  const result = await resolver({ package: { btu_min: 18000, btu_max: null } }).resolveSelection({ packageId: 10, tierId: 21 });
  assert.deepEqual(result.service_lines[0].service_constraints, {
    job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างพรีเมียม", btu_min: 18000, btu_max: null,
  });
  assert.equal("btu" in result.service_lines[0].service_constraints, false);
});

test("invalid BTU bounds and reversed ranges are rejected", async () => {
  for (const packageOverride of [{ btu_min: 0 }, { btu_max: -1 }, { btu_min: 18000, btu_max: 12000 }]) {
    await assert.rejects(() => resolver({ package: packageOverride }).resolveSelection({ packageId: 10, tierId: 21 }), { code: "INVALID_SERVICE_CONSTRAINTS" });
  }
});

test("customer cannot resolve hidden package; admin can but cannot bypass sell end", async () => {
  const hidden = resolver({ package: { is_customer_visible: false } });
  await assert.rejects(() => hidden.resolveSelection({ packageId: 10, tierId: 21 }), { code: "PACKAGE_NOT_CUSTOMER_VISIBLE" });
  assert.equal((await hidden.resolveSelection({ packageId: 10, tierId: 21 }, { identity: "admin" })).package.id, "10");
  await assert.rejects(
    () => resolver({ package: { is_customer_visible: false } }, "2026-09-01T00:00:00Z").resolveSelection({ packageId: 10, tierId: 21 }, { identity: "admin" }),
    { code: "PACKAGE_NOT_ON_SALE" }
  );
});

test("inactive packages, tier mismatch, and sale window violations are rejected", async () => {
  await assert.rejects(() => resolver({ package: { is_active: false } }).resolveSelection({ packageId: 10, tierId: 21 }), { code: "PACKAGE_INACTIVE" });
  await assert.rejects(() => resolver({ package: { service_package_id: 11 } }).resolveSelection({ packageId: 11, tierId: 21 }), { code: "TIER_PACKAGE_MISMATCH" });
  await assert.rejects(() => resolver({}, "2026-07-31T23:59:59Z").resolveSelection({ packageId: 10, tierId: 21 }), { code: "PACKAGE_NOT_ON_SALE" });
  await assert.rejects(() => resolver({}, "2026-09-01T00:00:00Z").resolveSelection({ packageId: 10, tierId: 21 }), { code: "PACKAGE_NOT_ON_SALE" });
});

test("repository customer listing retains active, visible, and sell-window filters", async () => {
  const calls = [];
  const db = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
  assert.deepEqual(await repository.listCustomerVisiblePackages(db), []);
  assert.match(calls[0].sql, /p\.is_active=TRUE AND p\.is_customer_visible=TRUE/);
  assert.match(calls[0].sql, /sell_start_at IS NULL/);
  assert.match(calls[0].sql, /sell_end_at IS NULL/);
});

test("historical snapshot reads do not re-resolve current package data", () => {
  const snapshot = {
    schema_version: 1, package: { id: "10", key: "old", name: "Old" }, tier: { id: "21", key: "old", name: "Old" },
    service_lines: [{ service_key: "old", service_name: "Old", quantity: 1, unit_duration_minutes: 30,
      service_constraints: { job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างพรีเมียม", btu_min: null, btu_max: 12000 } }],
    fixed_total_price: "1399.50", redeem_until: null,
  };
  const historical = readSnapshot(snapshot);
  snapshot.fixed_total_price = "1.00";
  snapshot.service_lines[0].service_constraints.btu_max = 99999;
  assert.equal(historical.fixed_total_price, "1399.50");
  assert.equal(historical.service_lines[0].service_constraints.btu_max, 12000);
});

test("historical snapshot reads reject corrupted version-1 package semantics", () => {
  const valid = {
    schema_version: 1, package: { id: "10", key: "old", name: "Old" }, tier: { id: "21", key: "old", name: "Old" },
    service_lines: [{ service_key: "old", service_name: "Old", quantity: 1, unit_duration_minutes: 30,
      service_constraints: { job_type: "wash", ac_type: "wall", wash_variant: "premium", btu_min: null, btu_max: 12000 } }],
    fixed_total_price: "1399.50", redeem_until: null,
  };
  const corruptions = [
    (snapshot) => { delete snapshot.package.id; },
    (snapshot) => { snapshot.package.id = ""; },
    (snapshot) => { snapshot.package.id = "0"; },
    (snapshot) => { snapshot.package.id = 10; },
    (snapshot) => { delete snapshot.package.key; },
    (snapshot) => { snapshot.package.key = ""; },
    (snapshot) => { delete snapshot.package.name; },
    (snapshot) => { snapshot.package.name = ""; },
    (snapshot) => { delete snapshot.tier.id; },
    (snapshot) => { snapshot.tier.id = ""; },
    (snapshot) => { snapshot.tier.id = "1.5"; },
    (snapshot) => { snapshot.tier.id = 21; },
    (snapshot) => { delete snapshot.tier.key; },
    (snapshot) => { snapshot.tier.key = ""; },
    (snapshot) => { delete snapshot.tier.name; },
    (snapshot) => { snapshot.tier.name = ""; },
    (snapshot) => { delete snapshot.service_lines[0].service_key; },
    (snapshot) => { snapshot.service_lines[0].service_key = ""; },
    (snapshot) => { delete snapshot.service_lines[0].service_name; },
    (snapshot) => { snapshot.service_lines[0].service_name = ""; },
    (snapshot) => { snapshot.fixed_total_price = "0.00"; },
    (snapshot) => { snapshot.service_lines[0].quantity = 0; },
    (snapshot) => { snapshot.service_lines[0].quantity = -1; },
    (snapshot) => { snapshot.service_lines[0].quantity = 1.5; },
    (snapshot) => { snapshot.service_lines[0].unit_duration_minutes = 0; },
    (snapshot) => { snapshot.service_lines[0].unit_duration_minutes = -30; },
    (snapshot) => { snapshot.service_lines[0].unit_duration_minutes = 1.5; },
    (snapshot) => { snapshot.service_lines[0].service_constraints.btu_min = 0; },
    (snapshot) => { snapshot.service_lines[0].service_constraints.btu_min = 18000; },
    (snapshot) => { snapshot.service_lines[0].service_constraints.job_type = "unsupported"; },
    (snapshot) => { snapshot.service_lines[0].service_constraints.ac_type = "unsupported"; },
    (snapshot) => { snapshot.service_lines[0].service_constraints.wash_variant = "unsupported"; },
  ];
  for (const corrupt of corruptions) {
    const snapshot = structuredClone(valid);
    corrupt(snapshot);
    assert.throws(() => readSnapshot(snapshot), { code: "INVALID_PACKAGE_SNAPSHOT" });
  }
});
