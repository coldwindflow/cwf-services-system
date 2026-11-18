"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { promisify } = require("node:util");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const { Client } = require("pg");
const { assertFixtureTarget, prepareFixture } = require("../scripts/stagingAirCareFixture");
const { assertStagingOnly } = require("../scripts/stagingQaIdentity");
const { createPrepaidOrderService } = require("../server/services/prepaid/prepaidOrderServiceV2");
const env = { CWF_ENVIRONMENT: "staging", CWF_STAGING_QA_FIXTURE: "1",
  CWF_STAGING_QA_CONTAINER: "cwf-staging-aircare-qa-app", DB_HOST: "127.0.0.1", DB_NAME: "cwf_aircare_qa" };

test("fixture refuses production, shared databases, alternate hosts and inherited connection URLs before I/O", async () => {
  assert.doesNotThrow(() => assertFixtureTarget(env));
  for (const override of [{CWF_ENVIRONMENT:"production"},{CWF_STAGING_QA_FIXTURE:""},
    {DB_HOST:"db"},{DB_NAME:"cwf_staging"},{DB_NAME:"cwf_production"},
    {CWF_STAGING_QA_CONTAINER:"cwf-staging-app"}, ...["DATABASE_URL","USER_DB_URL","ADMIN_DB_URL","TECH_DB_URL"].map(k=>({[k]:"forbidden"}))]) {
    await assert.rejects(prepareFixture({query(){throw new Error("must not reach database");}}, {...env,...override}),
      e=>!e.message.includes("must not reach database"));
  }
  assert.throws(()=>assertStagingOnly({environment:"staging",containerName:env.CWF_STAGING_QA_CONTAINER,
    database:"cwf_staging",fixture:true,secret:"x".repeat(40)}),/CONTAINER_REJECTED/);
});

test("fixture rejects a mismatched connected database and nonempty schema without mutations", async () => {
  await assert.rejects(prepareFixture({query:async()=>({rows:[{name:"cwf_staging"}]})},env),/connected database differs/);
  const calls=[];
  await assert.rejects(prepareFixture({query:async sql=>{calls.push(sql);return {rows:sql.includes("current_database")?[{name:env.DB_NAME}]:[{n:1}]};}},env),/must start empty/);
  assert.ok(calls.every(sql=>sql.startsWith("SELECT")));
});

test("fixture operator uses only isolated images/network and does not publish ports or copy data", () => {
  const shell=fs.readFileSync("scripts/run-staging-air-care-fixture.sh","utf8");
  assert.match(shell,/network create --internal/);
  assert.match(shell,/EXPECTED_RELEASE_SHA.*\[0-9a-f\]/);
  assert.match(shell,/git rev-parse HEAD/);
  assert.match(shell,/docker_cmd inspect -f '\{\{\.Image\}\}' cwf-staging-app/);
  assert.doesNotMatch(shell,/--env-file|--publish|--mount|pg_dump|pg_restore|--network (cwf_staging|host)|-p [0-9]/);
  assert.match(shell,/created_app.*== 1.*docker_cmd rm/);
  assert.match(shell,/staging-before-fixture/);
  assert.match(shell,/staging-after-fixture/);
});

test("real disposable fixture preserves expired seed rejection, enables synthetic quotes and refuses reuse", {timeout:60000}, async t => {
  const config={host:process.env.PGHOST||"127.0.0.1",port:Number(process.env.PGPORT||5432),
    user:process.env.PGUSER||"postgres",password:process.env.PGPASSWORD||"postgres",database:"postgres",ssl:false};
  assert.ok(["127.0.0.1","localhost","::1"].includes(config.host));
  const admin=new Client(config);
  try { await admin.connect(); } catch { await admin.end().catch(()=>{}); return t.skip("disposable local PostgreSQL unavailable"); }
  const name=`cwf_aircare_qa_${process.pid}`;
  let db, created=false;
  try {
    await admin.query(`CREATE DATABASE ${name}`); created=true;
    const fixtureEnv={...env,DB_NAME:name,DB_PORT:String(config.port),DB_USER:config.user,DB_PASSWORD:config.password,DB_SSL:"false",
      SystemRoot:process.env.SystemRoot,PATH:process.env.PATH};
    await promisify(execFile)(process.execPath,["scripts/bootstrap-staging-database.js"],{env:fixtureEnv,timeout:40000,maxBuffer:4*1024*1024,windowsHide:true});
    db=new Client({...config,database:name}); await db.connect();
    const evidence=await prepareFixture(db,fixtureEnv);
    assert.equal(evidence.original_closed_rejections,8);
    const rows=(await db.query("SELECT item_id,service_bundle_key FROM catalog_items")).rows;
    const prices={"standard-small":[499,899,1299,1699,2198,2598],"standard-large":[599,1099,1599,2099,2698,3198],
      "premium-small":[699,1399,1899,2489,3188,3798],"premium-large":[899,1799,2599,3399,4298,5197]};
    const service=createPrepaidOrderService({pool:db});
    for(const [variant,expected] of Object.entries(prices)) for(const identity of ["customer","admin"]) for(let quantity=1;quantity<=6;quantity++) {
      const item=rows.find(r=>r.service_bundle_key===`coldwindflow-air-care-${variant.split("-")[0]}`);
      const quote=await service.quoteOrder({catalog_item_id:item.item_id,service_package_groups:[{
        package_key:`coldwindflow-air-care-${variant}`,btu:variant.endsWith("small")?12000:18000,quantity}]},{identity});
      assert.equal(quote.fixed_total_price,expected[quantity-1]);
    }
    await assert.rejects(prepareFixture(db,fixtureEnv),/must start empty: catalog_items/);
  } finally {
    if(db) await db.end();
    if(created) await admin.query(`DROP DATABASE ${name}`);
    await admin.end();
  }
});
