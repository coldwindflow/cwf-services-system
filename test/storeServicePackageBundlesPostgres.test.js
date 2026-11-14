"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const { createStoreServicePackageCatalogService } = require("../server/services/packages/storeServicePackageCatalogService");
const { createServicePackageResolver } = require("../server/services/packages/servicePackageResolver");
const catalogRoutes = require("../server/routes/catalog/items");

const url = process.env.CWF_ISSUE267_TEST_DATABASE_URL;
const integration = url ? test : test.skip;

// Against a BARE throwaway database, add CWF_ISSUE267_TEST_BOOTSTRAP=1 and this
// suite provisions the minimum schema it touches, the same way
// servicePackageMinimumQuantityPostgres.test.js does. Opt-in and additive, so
// pointing at an already-provisioned database is unaffected.
const BOOTSTRAP = process.env.CWF_ISSUE267_TEST_BOOTSTRAP === "1";
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..");
const migration = (file) => fs.readFileSync(path.join(ROOT, "migrations", file), "utf8");

// Only the catalog_items columns this flow reads or writes.
const CATALOG_ITEMS_BASE = `
CREATE TABLE IF NOT EXISTS public.catalog_items (
  item_id BIGSERIAL PRIMARY KEY,
  item_name TEXT NOT NULL,
  item_category TEXT NOT NULL DEFAULT 'service',
  base_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_label TEXT,
  job_category TEXT,
  ac_type TEXT,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  is_customer_visible BOOLEAN NOT NULL DEFAULT FALSE,
  short_description TEXT,
  long_description TEXT,
  highlights JSONB NOT NULL DEFAULT '[]'::jsonb,
  service_conditions TEXT,
  booking_mode TEXT NOT NULL DEFAULT 'contact_admin',
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  is_autoplay_enabled BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS public.jobs (job_id BIGSERIAL PRIMARY KEY);
CREATE TABLE IF NOT EXISTS public.job_items (
  job_item_id BIGSERIAL PRIMARY KEY,
  job_id BIGINT,
  item_name TEXT,
  quantity INT,
  unit_price NUMERIC(12,2)
);`;

async function ensureSchema(pool) {
  if (!BOOTSTRAP) return;
  await pool.query(CATALOG_ITEMS_BASE);
  await pool.query(migration("20260807_service_packages.sql"));
  // 20260809 uses bare ADD CONSTRAINT, so tolerate a second run on a warm database.
  for (const statement of [
    migration("20260809_store_service_package_bundles.sql"),
    migration("20260905_promotion_engine_policy_fields.sql"),
    migration("20260820_service_package_minimum_total_quantity.sql"),
  ]) {
    try { await pool.query(statement); }
    catch (error) { if (error.code !== "42710" && error.code !== "42P07") throw error; }
  }
}

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
    await ensureSchema(pool);
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
      (SELECT COUNT(*)::int FROM catalog_items WHERE service_bundle_key IS NOT NULL) AS parents,
      (SELECT COUNT(*)::int FROM service_packages WHERE catalog_item_id IS NOT NULL) AS variants,
      (SELECT COUNT(*)::int FROM service_package_tiers) AS tiers`);
    assert.deepEqual(counts.rows[0], { parents: 1, variants: 2, tiers: 8 });
    const publicRowResult = await pool.query("SELECT * FROM catalog_items WHERE service_bundle_key=$1", [created.service_bundle_key]);
    assert.equal(publicRowResult.rows[0].booking_mode, "contact_admin");
    await catalogRoutes.attachCatalogServicePackages(pool, publicRowResult.rows, {
      // Pin the sell window to a day inside this bundle's fixed 2026-08-08..10
      // range, matching the resolver clock pinned below, so the case does not
      // expire once that window passes in real time.
      customer: true, at: new Date("2026-08-09T00:00:00Z"),
    });
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

    // Generic configurability proof: a second campaign uses another supported
    // AC type, no wall-wash variant, and non-1..4 tier quantities. It goes
    // through the same Admin service and needs no seed SQL or product constant.
    const generic = await service.create({
      item_name: "TEST Cassette Care", short_description: "Configured entirely through Admin contract",
      long_description: "Reusable Store package", highlights: ["Gallery-ready parent"], service_conditions: "TEST only",
      sell_start_at: "2026-08-01T00:00:00+07:00", sell_end_at: "2026-08-31T23:59:59+07:00",
      redeem_until: "2026-09-30T23:59:59+07:00", is_active: true, is_customer_visible: true,
      is_featured: false, is_autoplay_enabled: false,
      variants: [{
        display_name: "Cassette maintenance", description: "Four-way cassette",
        job_type: "wash", ac_type: "cassette", wash_variant: null, btu_min: 15000, btu_max: 60000,
        service_unit_duration_minutes: 70, sort_order: 0, is_active: true, is_customer_visible: true,
        tiers: [
          { display_name: "2 units", service_quantity: 2, fixed_total_price: "2800.00", sort_order: 0, is_active: true },
          { display_name: "5 units", service_quantity: 5, fixed_total_price: "6500.00", sort_order: 1, is_active: true },
          { display_name: "7 units", service_quantity: 7, fixed_total_price: "8750.00", sort_order: 2, is_active: true },
        ],
      }],
    });
    assert.notEqual(generic.service_bundle_key, created.service_bundle_key);
    assert.equal(generic.variants[0].ac_type, "สี่ทิศทาง");
    assert.equal(generic.variants[0].wash_variant, null);
    assert.deepEqual(generic.variants[0].tiers.map((tier) => tier.service_quantity), [2, 5, 7]);
    assert.ok(generic.variants[0].tiers.every((tier) => typeof tier.fixed_total_price === "string"));
    const genericRow = (await pool.query("SELECT * FROM catalog_items WHERE service_bundle_key=$1", [generic.service_bundle_key])).rows[0];
    genericRow.images = [{ image_id: "TEST-image", image_url: "https://example.invalid/test-cassette.webp", is_primary: true }];
    // Same pinned instant: this campaign's window is 2026-08-01..2026-08-31.
    await catalogRoutes.attachCatalogServicePackages(pool, [genericRow], {
      customer: true, at: new Date("2026-08-09T00:00:00Z"),
    });
    const genericDto = catalogRoutes.serializeCatalogDetailRow(genericRow);
    assert.equal(genericDto.service_package_variants[0].service.ac_type, "สี่ทิศทาง");
    assert.equal(genericDto.images.length, 1);
    assert.equal(genericDto.images[0].image_url, genericRow.images[0].image_url);
    assert.equal(genericDto.images[0].is_primary, true);
  } finally { await pool.end(); }
});
