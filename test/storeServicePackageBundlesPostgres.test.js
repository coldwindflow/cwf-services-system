"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const { createStoreServicePackageCatalogService } = require("../server/services/packages/storeServicePackageCatalogService");
const { createServicePackageResolver } = require("../server/services/packages/servicePackageResolver");
const catalogRoutes = require("../server/routes/catalog/items");

const url = process.env.CWF_ISSUE267_TEST_DATABASE_URL;
const integration = url ? test : test.skip;

function variant(name, min, max, prices) {
  return {
    display_name: name, service_key: "wash-wall-premium", service_name: "Premium wash",
    job_type: "wash", ac_type: "wall", wash_variant: "premium", btu_min: min, btu_max: max,
    service_unit_duration_minutes: 45, is_active: true, is_customer_visible: true,
    tiers: prices.map((price, index) => ({ display_name: `${index + 1} units`, service_quantity: index + 1,
      fixed_total_price: price, sort_order: index, is_active: true })),
  };
}

integration("isolated PostgreSQL atomically persists one parent, two variants, eight exact tiers, and composite snapshots", async () => {
  const pool = new Pool({ connectionString: url, ssl: false });
  try {
    await pool.query("TRUNCATE service_package_tiers, service_packages, catalog_items RESTART IDENTITY CASCADE");
    const service = createStoreServicePackageCatalogService({ pool });
    const created = await service.create({
      item_name: "TEST Premium Day", short_description: "TEST composite bundle",
      sell_start_at: "2026-08-08T00:00:00+07:00", sell_end_at: "2026-08-10T23:59:59+07:00",
      redeem_until: "2027-01-31T23:59:59+07:00", is_active: true, is_customer_visible: true,
      variants: [
        variant("TEST up to 12000", null, 12000, ["699.00", "1399.00", "1899.00", "2489.00"]),
        variant("TEST 18000 plus", 18000, null, ["899.00", "1799.00", "2599.00", "3399.00"]),
      ],
    });
    assert.equal(created.variants.length, 2);
    assert.equal(created.variants.flatMap((entry) => entry.tiers).length, 8);
    assert.ok(created.variants.flatMap((entry) => entry.tiers).every((tier) => typeof tier.fixed_total_price === "string" && /^\d+\.\d{2}$/.test(tier.fixed_total_price)));
    const identitiesBefore = await pool.query("SELECT package_key,service_package_id::text AS id FROM service_packages ORDER BY package_key");
    const updated = await service.update(created.service_bundle_key, {
      item_name: "TEST Premium Day updated", short_description: "TEST composite bundle",
      sell_start_at: "2026-08-08T00:00:00+07:00", sell_end_at: "2026-08-10T23:59:59+07:00",
      redeem_until: "2027-01-31T23:59:59+07:00", is_active: true, is_customer_visible: true,
      variants: created.variants.map((entry) => ({ ...entry, tiers: entry.tiers })),
    });
    const identitiesAfter = await pool.query("SELECT package_key,service_package_id::text AS id FROM service_packages ORDER BY package_key");
    assert.deepEqual(identitiesAfter.rows, identitiesBefore.rows);
    assert.equal(updated.item_name, "TEST Premium Day updated");
    const counts = await pool.query(`SELECT
      (SELECT COUNT(*)::int FROM catalog_items WHERE booking_mode='service_package') AS parents,
      (SELECT COUNT(*)::int FROM service_packages WHERE catalog_item_id IS NOT NULL) AS variants,
      (SELECT COUNT(*)::int FROM service_package_tiers) AS tiers`);
    assert.deepEqual(counts.rows[0], { parents: 1, variants: 2, tiers: 8 });
    const publicRowResult = await pool.query("SELECT * FROM catalog_items WHERE service_bundle_key=$1", [created.service_bundle_key]);
    await catalogRoutes.attachCatalogServicePackages(pool, publicRowResult.rows, { customer: true });
    const publicDto = catalogRoutes.serializeCatalogDetailRow(publicRowResult.rows[0]);
    assert.equal(publicDto.booking_mode, "service_package");
    assert.equal(publicDto.service_package_variants.length, 2);
    assert.equal(publicDto.service_package_variants.flatMap((entry) => entry.tiers).length, 8);
    assert.ok(publicDto.service_package_variants.flatMap((entry) => entry.tiers).every((tier) => typeof tier.fixed_total_price === "string"));
    const groups = updated.variants.map((entry, index) => ({ package_key: entry.package_key, btu: index ? 18000 : 12000, quantity: 2 }));
    const resolved = await createServicePackageResolver({ db: pool, now: () => new Date("2026-08-09T00:00:00Z") }).resolveComposite({
      body: { service_package_groups: groups }, bookingMode: "scheduled", appointmentDatetime: "2026-08-20T03:00:00Z", identity: "customer",
    });
    assert.equal(resolved.fixedTotal, "3198.00");
    assert.equal(resolved.items.length, 2);
    assert.ok(resolved.items.every((item) => item.snapshot.schema_version === 2 && item.snapshot.catalog_item.key === created.service_bundle_key));
  } finally { await pool.end(); }
});
