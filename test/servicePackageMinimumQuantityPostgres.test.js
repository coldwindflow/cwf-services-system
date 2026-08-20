"use strict";

// Issue 310 - isolated PostgreSQL contract for the minimum-total-quantity column.
//
// Self-skips unless an isolated throwaway database is provided, exactly like
// test/storeServicePackageBundlesPostgres.test.js. NEVER point this at
// Production: it TRUNCATEs the catalog tables and applies/rolls back schema.
//
//   CWF_ISSUE310_TEST_DATABASE_URL=postgres://user:pass@127.0.0.1:5432/cwf_test \
//     node --test test/servicePackageMinimumQuantityPostgres.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const { createStoreServicePackageCatalogService } = require("../server/services/packages/storeServicePackageCatalogService");
const { createServicePackageResolver } = require("../server/services/packages/servicePackageResolver");
const { resolveCompositeBooking } = require("../server/services/packages/compositeServicePackage");

const url = process.env.CWF_ISSUE310_TEST_DATABASE_URL || process.env.CWF_ISSUE267_TEST_DATABASE_URL;
const integration = url ? test : test.skip;

const ROOT = path.join(__dirname, "..");
const FORWARD = fs.readFileSync(path.join(ROOT, "migrations/20260820_service_package_minimum_total_quantity.sql"), "utf8");
const ROLLBACK = fs.readFileSync(path.join(ROOT, "migrations/rollback/20260820_service_package_minimum_total_quantity.sql"), "utf8");

function variant(name, min, max, prices) {
  return {
    display_name: name, service_key: "wash-wall-premium", service_name: "Premium wash",
    job_type: "wash", ac_type: "wall", wash_variant: "premium", btu_min: min, btu_max: max,
    service_unit_duration_minutes: 45, is_active: true, is_customer_visible: true,
    tiers: prices.map((price, index) => ({
      display_name: `${index + 1} units`, service_quantity: index + 1,
      fixed_total_price: price, sort_order: index, is_active: true,
    })),
  };
}

function bundleInput(extra = {}) {
  return {
    item_name: "TEST minimum parent", short_description: "TEST issue 310",
    sell_start_at: "2026-08-08T00:00:00+07:00", sell_end_at: "2026-12-31T23:59:59+07:00",
    redeem_until: "2027-01-31T23:59:59+07:00", is_active: true, is_customer_visible: true,
    variants: [
      variant("TEST up to 12000", null, 12000, ["699.00", "1399.00"]),
      variant("TEST 18000 plus", 18000, null, ["899.00", "1799.00"]),
    ],
    ...extra,
  };
}

integration("isolated PostgreSQL: the column is nullable for existing rows and CHECK-bounded to 2..99", async () => {
  const pool = new Pool({ connectionString: url, ssl: false });
  try {
    await pool.query("TRUNCATE service_package_tiers, service_packages, catalog_items RESTART IDENTITY CASCADE");

    // An ordinary catalog row created before this migration keeps NULL.
    const legacy = await pool.query(
      `INSERT INTO public.catalog_items (item_name,item_category,base_price,unit_label,is_active,is_customer_visible)
       VALUES ('TEST legacy row','service',0,'unit',TRUE,TRUE) RETURNING item_id,service_package_minimum_total_quantity`
    );
    assert.equal(legacy.rows[0].service_package_minimum_total_quantity, null, "existing rows must default to NULL, never to 2");

    const column = await pool.query(`
      SELECT data_type, is_nullable, column_default FROM information_schema.columns
       WHERE table_schema='public' AND table_name='catalog_items'
         AND column_name='service_package_minimum_total_quantity'`);
    assert.equal(column.rows.length, 1);
    assert.equal(column.rows[0].is_nullable, "YES");
    assert.equal(column.rows[0].data_type, "integer");
    assert.equal(column.rows[0].column_default, null, "no default: absent must mean unrestricted");

    const id = legacy.rows[0].item_id;
    // Boundaries accepted.
    for (const value of [2, 50, 99]) {
      await pool.query("UPDATE public.catalog_items SET service_package_minimum_total_quantity=$2 WHERE item_id=$1", [id, value]);
      const row = await pool.query("SELECT service_package_minimum_total_quantity AS v FROM public.catalog_items WHERE item_id=$1", [id]);
      assert.equal(Number(row.rows[0].v), value);
    }
    // NULL round-trips back to unrestricted.
    await pool.query("UPDATE public.catalog_items SET service_package_minimum_total_quantity=NULL WHERE item_id=$1", [id]);
    const cleared = await pool.query("SELECT service_package_minimum_total_quantity AS v FROM public.catalog_items WHERE item_id=$1", [id]);
    assert.equal(cleared.rows[0].v, null);

    // The database itself is the last line of defence, not just the service layer.
    for (const bad of [1, 0, -1, 100, 1000]) {
      await assert.rejects(
        pool.query("UPDATE public.catalog_items SET service_package_minimum_total_quantity=$2 WHERE item_id=$1", [id, bad]),
        (error) => error.code === "23514" && /minimum_total_quantity/.test(error.constraint || ""),
        `CHECK constraint must reject ${bad}`
      );
    }
  } finally { await pool.end(); }
});

integration("isolated PostgreSQL: the minimum round-trips through create, update and the booking resolver", async () => {
  const pool = new Pool({ connectionString: url, ssl: false });
  try {
    await pool.query("TRUNCATE service_package_tiers, service_packages, catalog_items RESTART IDENTITY CASCADE");
    const service = createStoreServicePackageCatalogService({ pool });

    // create without a minimum -> unrestricted
    const created = await service.create(bundleInput());
    assert.equal(created.minimum_total_quantity, null);

    // set a minimum
    const withMinimum = await service.update(created.service_bundle_key, bundleInput({
      minimum_total_quantity: 2,
      variants: created.variants.map((entry) => ({
        ...entry, package_key: entry.package_key,
        service_key: "wash-wall-premium", service_name: "Premium wash",
        job_type: "wash", ac_type: "wall", wash_variant: "premium",
        tiers: entry.tiers.map((tier) => ({ ...tier, tier_key: tier.tier_key })),
      })),
    }));
    assert.equal(withMinimum.minimum_total_quantity, 2);

    // editing an unrelated field preserves it
    const renamed = await service.update(created.service_bundle_key, bundleInput({
      item_name: "TEST minimum parent renamed",
      minimum_total_quantity: withMinimum.minimum_total_quantity,
      variants: withMinimum.variants.map((entry) => ({
        ...entry, package_key: entry.package_key,
        service_key: "wash-wall-premium", service_name: "Premium wash",
        job_type: "wash", ac_type: "wall", wash_variant: "premium",
        tiers: entry.tiers.map((tier) => ({ ...tier, tier_key: tier.tier_key })),
      })),
    }));
    assert.equal(renamed.item_name, "TEST minimum parent renamed");
    assert.equal(renamed.minimum_total_quantity, 2);

    // the resolver reads the stored value and enforces it
    const keys = renamed.variants.map((entry) => entry.package_key);
    const resolver = createServicePackageResolver({ db: pool });
    const under = { service_package_groups: [{ package_key: keys[0], btu: 12000, quantity: 1 }] };
    await assert.rejects(
      resolver.resolveComposite({ body: under, bookingMode: "scheduled", appointmentDatetime: "2026-09-01T03:00:00.000Z", identity: "customer" }),
      (error) => error.code === "SERVICE_PACKAGE_MINIMUM_QUANTITY_NOT_MET"
    );
    const mixed = { service_package_groups: [
      { package_key: keys[0], btu: 12000, quantity: 1 },
      { package_key: keys[1], btu: 18000, quantity: 1 },
    ] };
    const ok = await resolveCompositeBooking({
      body: mixed, bookingMode: "scheduled", appointmentDatetime: "2026-09-01T03:00:00.000Z",
      repository: require("../server/services/packages/servicePackageRepository"), db: pool, identity: "customer",
    });
    assert.equal(ok.payload.machine_count, 2);
    assert.equal(ok.minimumTotalQuantity, 2);
    assert.equal(ok.items[0].snapshot.minimum_total_quantity, 2);

    // clearing it back to blank removes the restriction
    const cleared = await service.update(created.service_bundle_key, bundleInput({
      minimum_total_quantity: null,
      variants: renamed.variants.map((entry) => ({
        ...entry, package_key: entry.package_key,
        service_key: "wash-wall-premium", service_name: "Premium wash",
        job_type: "wash", ac_type: "wall", wash_variant: "premium",
        tiers: entry.tiers.map((tier) => ({ ...tier, tier_key: tier.tier_key })),
      })),
    }));
    assert.equal(cleared.minimum_total_quantity, null);
    const single = await resolveCompositeBooking({
      body: under, bookingMode: "scheduled", appointmentDatetime: "2026-09-01T03:00:00.000Z",
      repository: require("../server/services/packages/servicePackageRepository"), db: pool, identity: "customer",
    });
    assert.equal(single.payload.machine_count, 1);
  } finally { await pool.end(); }
});

integration("isolated PostgreSQL: rollback removes the column and forward re-applies cleanly", async () => {
  const pool = new Pool({ connectionString: url, ssl: false });
  try {
    await pool.query("TRUNCATE service_package_tiers, service_packages, catalog_items RESTART IDENTITY CASCADE");
    const exists = async () => {
      const r = await pool.query(`
        SELECT COUNT(*)::int AS cnt FROM information_schema.columns
         WHERE table_schema='public' AND table_name='catalog_items'
           AND column_name='service_package_minimum_total_quantity'`);
      return Number(r.rows[0].cnt) === 1;
    };
    assert.equal(await exists(), true, "the forward migration must already be applied on the test database");

    await pool.query(ROLLBACK);
    assert.equal(await exists(), false, "rollback must drop the column");
    const constraints = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM pg_constraint WHERE conname='catalog_items_service_package_minimum_total_quantity_check'"
    );
    assert.equal(Number(constraints.rows[0].cnt), 0, "rollback must drop the CHECK constraint");

    // The Issue 267 bundle schema must survive the Issue 310 rollback untouched.
    const bundleColumns = await pool.query(`
      SELECT COUNT(*)::int AS cnt FROM information_schema.columns
       WHERE table_schema='public' AND table_name='catalog_items'
         AND column_name IN ('service_bundle_key','booking_flow_policy','service_package_redeem_until')`);
    assert.equal(Number(bundleColumns.rows[0].cnt), 3);

    await pool.query(FORWARD);
    assert.equal(await exists(), true, "forward must re-apply after a rollback");
  } finally { await pool.end(); }
});
