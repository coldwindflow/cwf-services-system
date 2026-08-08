"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Client } = require("pg");
const repository = require("../server/services/packages/servicePackageRepository");
const { buildSnapshot, createServicePackageResolver } = require("../server/services/packages/servicePackageResolver");
const { createPublicServicePackageService } = require("../server/services/public/servicePackages");

const LOCAL_POSTGRES_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

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

test("real PostgreSQL preserves exact package price text through repository and public service", async (t) => {
  const pgConfig = {
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "postgres",
  };
  if (!LOCAL_POSTGRES_HOSTS.has(pgConfig.host)) {
    assert.fail(`Refusing to run isolated PostgreSQL test against non-local host: ${pgConfig.host}`);
  }

  const databaseName = `cwf_sp_money_${process.pid}_${Date.now()}`.toLowerCase();
  assert.match(databaseName, /^[a-z0-9_]+$/);
  const quotedDatabaseName = `"${databaseName}"`;
  const admin = new Client({
    ...pgConfig,
    database: process.env.PGMAINTENANCEDATABASE || "postgres",
    connectionTimeoutMillis: 2000,
  });
  let db;
  let databaseCreated = false;

  try {
    try {
      await admin.connect();
      await admin.query(`CREATE DATABASE ${quotedDatabaseName} ENCODING 'UTF8'`);
      databaseCreated = true;
    } catch (error) {
      t.skip(`Disposable local PostgreSQL unavailable: ${error.message}`);
      return;
    }

    db = new Client({ ...pgConfig, database: databaseName });
    await db.connect();
    await db.query(`
      CREATE TABLE public.service_packages (
        service_package_id BIGSERIAL PRIMARY KEY,
        package_key TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        description TEXT,
        service_key TEXT NOT NULL,
        service_name TEXT NOT NULL,
        job_type TEXT NOT NULL,
        ac_type TEXT NOT NULL,
        wash_variant TEXT,
        btu_min INTEGER,
        btu_max INTEGER,
        service_unit_duration_minutes INTEGER NOT NULL,
        sell_start_at TIMESTAMPTZ,
        sell_end_at TIMESTAMPTZ,
        redeem_until TIMESTAMPTZ,
        is_active BOOLEAN NOT NULL,
        is_customer_visible BOOLEAN NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE public.service_package_tiers (
        service_package_tier_id BIGSERIAL PRIMARY KEY,
        service_package_id BIGINT NOT NULL REFERENCES public.service_packages(service_package_id),
        tier_key TEXT NOT NULL,
        display_name TEXT NOT NULL,
        service_quantity INTEGER NOT NULL,
        fixed_total_price NUMERIC(12,2) NOT NULL,
        sort_order INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    async function insertPackage(packageKey, overrides = {}) {
      const values = {
        displayName: packageKey,
        sellStartAt: null,
        sellEndAt: null,
        isActive: true,
        isCustomerVisible: true,
        createdAt: "2026-08-08T00:00:00.000Z",
        ...overrides,
      };
      const result = await db.query(
        `INSERT INTO public.service_packages
           (package_key, display_name, description, service_key, service_name, job_type, ac_type,
            wash_variant, btu_min, btu_max, service_unit_duration_minutes, sell_start_at, sell_end_at,
            redeem_until, is_active, is_customer_visible, created_at, updated_at)
         VALUES ($1,$2,'Fixed package','wall-premium','Premium cleaning','wash','wall',
                 'premium',NULL,12000,45,$3,$4,NULL,$5,$6,$7,$7)
         RETURNING service_package_id`,
        [packageKey, values.displayName, values.sellStartAt, values.sellEndAt,
          values.isActive, values.isCustomerVisible, values.createdAt]
      );
      return result.rows[0].service_package_id;
    }

    async function insertTier(packageId, tierKey, price, sortOrder, isActive = true) {
      await db.query(
        `INSERT INTO public.service_package_tiers
           (service_package_id, tier_key, display_name, service_quantity, fixed_total_price, sort_order, is_active)
         VALUES ($1,$2,$3,1,$4,$5,$6)`,
        [packageId, tierKey, tierKey, price, sortOrder, isActive]
      );
    }

    const eligibleId = await insertPackage("eligible", { displayName: "Eligible package" });
    await insertTier(eligibleId, "price-699", "699.00", 2);
    await insertTier(eligibleId, "price-1399", "1399.50", 1);
    await insertTier(eligibleId, "price-max", "9999999999.99", 1);
    await insertTier(eligibleId, "inactive-tier", "2499.00", 0, false);

    await insertPackage("eligible-empty", { displayName: "Eligible empty package" });
    await insertPackage("hidden", { isCustomerVisible: false });
    await insertPackage("inactive", { isActive: false });
    await insertPackage("future", { sellStartAt: "9999-01-01T00:00:00.000Z" });
    await insertPackage("expired", { sellEndAt: "2000-01-01T00:00:00.000Z" });

    const at = new Date("2026-08-08T00:00:00.000Z");
    const customerRows = await repository.listCustomerVisiblePackages(db, { at });
    assert.deepEqual(customerRows.map((row) => row.package_key), ["eligible", "eligible-empty"]);
    assert.deepEqual(customerRows[1].tiers, []);

    const eligibleTiers = customerRows[0].tiers;
    assert.deepEqual(eligibleTiers.map((tier) => tier.tier_key), ["price-1399", "price-max", "price-699"]);
    assert.deepEqual(eligibleTiers.map((tier) => tier.fixed_total_price), ["1399.50", "9999999999.99", "699.00"]);
    for (const tier of eligibleTiers) assert.equal(typeof tier.fixed_total_price, "string");
    assert.equal(eligibleTiers.some((tier) => tier.tier_key === "inactive-tier"), false);

    const resolver = createServicePackageResolver({ db, now: () => at });
    const publicResult = await createPublicServicePackageService({ resolver }).list();
    assert.deepEqual(publicResult.service_packages.map((item) => item.package_key), ["eligible"]);
    assert.deepEqual(
      publicResult.service_packages[0].tiers.map((tier) => tier.fixed_total_price),
      ["1399.50", "9999999999.99", "699.00"]
    );

    const catalogRows = await repository.listCatalogPackages(db);
    assert.deepEqual(catalogRows.map((row) => row.package_key),
      ["expired", "future", "inactive", "hidden", "eligible-empty", "eligible"]);
    const catalogEligible = catalogRows.find((row) => row.package_key === "eligible");
    assert.deepEqual(catalogEligible.tiers.map((tier) => tier.tier_key),
      ["inactive-tier", "price-1399", "price-max", "price-699"]);
    assert.deepEqual(catalogEligible.tiers.slice(1).map((tier) => tier.fixed_total_price),
      ["1399.50", "9999999999.99", "699.00"]);
    for (const tier of catalogEligible.tiers) assert.equal(typeof tier.fixed_total_price, "string");
    assert.deepEqual(catalogRows.find((row) => row.package_key === "eligible-empty").tiers, []);
  } finally {
    if (db) await db.end().catch(() => {});
    try {
      if (databaseCreated) {
        await admin.query(`DROP DATABASE IF EXISTS ${quotedDatabaseName} WITH (FORCE)`);
      }
    } finally {
      await admin.end().catch(() => {});
    }
  }
});
