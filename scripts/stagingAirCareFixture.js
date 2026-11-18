"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createPrepaidOrderService } = require("../server/services/prepaid/prepaidOrderServiceV2");

const FIXTURE_DATABASE = "cwf_aircare_qa";
const FIXTURE_APP = "cwf-staging-aircare-qa-app";
const FIXTURE_DB = "cwf-staging-aircare-qa-db";

function assertFixtureTarget(env) {
  assert.equal(env.CWF_ENVIRONMENT, "staging", "fixture requires staging");
  assert.equal(env.CWF_STAGING_QA_FIXTURE, "1", "explicit fixture mode required");
  assert.equal(env.CWF_STAGING_QA_CONTAINER, FIXTURE_APP, "fixture container required");
  assert.match(String(env.DB_NAME || ""), /^cwf_aircare_qa(?:_[a-z0-9]+)?$/, "disposable fixture database required");
  assert.ok([FIXTURE_DB, "127.0.0.1", "::1"].includes(env.DB_HOST), "isolated fixture host required");
  for (const name of ["DATABASE_URL", "USER_DB_URL", "ADMIN_DB_URL", "TECH_DB_URL"]) {
    assert.ok(!env[name], `fixture rejects ${name}`);
  }
}

async function prepareFixture(pool, env = process.env) {
  assertFixtureTarget(env);
  const target = await pool.query("SELECT current_database() AS name");
  assert.equal(target.rows[0].name, env.DB_NAME, "connected database differs from fixture target");
  // Fresh schema only: never import or transform an existing customer database.
  for (const table of ["users", "customer_profiles", "customer_orders", "jobs", "catalog_items"]) {
    const count = await pool.query(`SELECT count(*)::int AS n FROM public.${table}`);
    assert.equal(count.rows[0].n, 0, `fixture must start empty: ${table}`);
  }
  const root = path.resolve(__dirname, "..");
  await pool.query(fs.readFileSync(path.join(root, "scripts/sql/20260906_prepaid_service_entitlements.sql"), "utf8"));
  await pool.query(fs.readFileSync(path.join(root, "data-seeds/20260930_cwf_air_care.sql"), "utf8"));
  const rows = (await pool.query(`SELECT item_id, service_bundle_key, service_package_sell_end_at
    FROM public.catalog_items WHERE service_bundle_key IN ('coldwindflow-air-care-standard','coldwindflow-air-care-premium')`)).rows;
  assert.equal(rows.length, 2);
  const service = createPrepaidOrderService({ pool });
  let rejected = 0;
  for (const row of rows) {
    assert.ok(new Date(row.service_package_sell_end_at) < new Date(), "fixture expects the original expired campaign");
    for (const identity of ["customer", "admin"]) {
      for (const [size, btu] of [["small", 12000], ["large", 18000]]) {
        await assert.rejects(service.quoteOrder({ catalog_item_id: row.item_id,
          service_package_groups: [{ package_key: `${row.service_bundle_key}-${size}`, btu, quantity: 1 }],
        }, { identity }), { code: "SERVICE_PACKAGE_NOT_AVAILABLE" });
        rejected += 1;
      }
    }
  }
  // Only this new, network-isolated fixture is synthetic. Real seed bytes and
  // the deployed staging catalog keep their original closed sale window.
  const changed = await pool.query(`UPDATE public.catalog_items
    SET service_package_sell_start_at=NOW()-INTERVAL '1 day',
        service_package_sell_end_at=NOW()+INTERVAL '1 day',
        service_package_redeem_until=NOW()+INTERVAL '90 days'
    WHERE item_id=ANY($1::bigint[])`, [rows.map((row) => row.item_id)]);
  assert.equal(changed.rowCount, 2);
  return { database: env.DB_NAME, original_closed_rejections: rejected, synthetic_parents: 2 };
}

if (require.main === module) {
  // Validate before importing db.js (which constructs a connection pool).
  try { assertFixtureTarget(process.env); }
  catch (error) { console.error(error.message); process.exit(1); }
  const pool = require("../db");
  prepareFixture(pool).then((result) => {
    console.log(`[QA_EVIDENCE] isolated_fixture database=${result.database} original_closed_rejections=${result.original_closed_rejections} synthetic_parents=2`);
  }).catch((error) => { console.error(`[QA_FIXTURE_FAILED] ${error.code || error.message}`); process.exitCode = 1; })
    .finally(() => pool.end());
}

module.exports = { FIXTURE_DATABASE, FIXTURE_APP, FIXTURE_DB, assertFixtureTarget, prepareFixture };
