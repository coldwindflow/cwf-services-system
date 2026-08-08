"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const repository = require("../server/services/packages/servicePackageRepository");
const { buildSnapshot, createServicePackageResolver } = require("../server/services/packages/servicePackageResolver");
const { createPublicServicePackageService } = require("../server/services/public/servicePackages");

const packageRow = {
  service_package_id: 10,
  package_key: "premium-wall",
  display_name: "Premium Wall",
  description: "Fixed package",
  service_key: "wall-premium",
  service_name: "Premium cleaning",
  service_unit_duration_minutes: 45,
  job_type: "wash",
  ac_type: "wall",
  wash_variant: "premium",
  btu_min: null,
  btu_max: 12000,
  sell_start_at: null,
  sell_end_at: null,
  redeem_until: null,
  is_active: true,
  is_customer_visible: true,
};

const tierRow = {
  service_package_tier_id: 21,
  service_package_id: 10,
  tier_key: "one",
  display_name: "One unit",
  service_quantity: 1,
  sort_order: 0,
  is_active: true,
};

async function captureListingQueries() {
  const sql = [];
  const db = {
    async query(text) {
      sql.push(text);
      return { rows: [] };
    },
  };
  await repository.listCustomerVisiblePackages(db, { at: new Date("2026-08-08T00:00:00Z") });
  await repository.listCatalogPackages(db);
  return sql;
}

test("package listing JSON aggregates fixed_total_price as exact text", async () => {
  const queries = await captureListingQueries();
  assert.equal(queries.length, 2);
  for (const sql of queries) {
    assert.match(sql, /jsonb_agg\(/);
    assert.match(sql, /to_jsonb\(t\) \|\| jsonb_build_object\('fixed_total_price', t\.fixed_total_price::text\)/);
    assert.match(sql, /'\[\]'::jsonb/);
    assert.doesNotMatch(sql, /json_agg\(t/);
  }
});

test("resolver rejects numeric JSON money but accepts repository exact decimal text", () => {
  assert.throws(
    () => buildSnapshot(packageRow, { ...tierRow, fixed_total_price: 699 }),
    { code: "INVALID_PACKAGE_PRICE" }
  );
  assert.equal(
    buildSnapshot(packageRow, { ...tierRow, fixed_total_price: "699.00" }).fixed_total_price,
    "699.00"
  );
  assert.equal(
    buildSnapshot(packageRow, { ...tierRow, fixed_total_price: "1399.50" }).fixed_total_price,
    "1399.50"
  );
  assert.equal(
    buildSnapshot(packageRow, { ...tierRow, fixed_total_price: "9999999999.99" }).fixed_total_price,
    "9999999999.99"
  );
});

test("public package list succeeds when repository aggregate returns exact price text", async () => {
  const db = {
    async query(sql) {
      assert.match(sql, /fixed_total_price', t\.fixed_total_price::text/);
      return {
        rows: [{
          ...packageRow,
          tiers: [
            { ...tierRow, tier_key: "one", fixed_total_price: "699.00" },
            { ...tierRow, service_package_tier_id: 22, tier_key: "two", service_quantity: 2, fixed_total_price: "1399.50" },
          ],
        }],
      };
    },
  };
  const resolver = createServicePackageResolver({ db, now: () => new Date("2026-08-08T00:00:00Z") });
  const result = await createPublicServicePackageService({ resolver }).list();
  assert.deepEqual(
    result.service_packages[0].tiers.map((tier) => tier.fixed_total_price),
    ["699.00", "1399.50"]
  );
});
