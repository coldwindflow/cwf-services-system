"use strict";

// AIR CARE prepaid lifecycle, exercised against a real PostgreSQL database using
// the exact migration that ships to Staging and Production
// (scripts/sql/20260906_prepaid_service_entitlements.sql).
//
// Every other prepaid test in this suite drives a fake pool, so it can only prove
// that a route hands the right payload to the next function. The defects this
// file guards against all live below that line, inside the database:
//
//   * the paid Order's service location must reach the Job row, or the technician
//     is dispatched without an address, a phone number or a map;
//   * a prepaid Job must settle at 0 so a paid customer is never charged twice;
//   * one right must create exactly one live Job, even under a retry;
//   * cancelling an unfinished Job must give the paid right back, while the
//     cancelled Job keeps its entitlement link as audit history;
//   * a finished Job must never hand the right back.
//
// Self-skips when no PostgreSQL is reachable, matching the convention used by the
// other integration suites. It never touches a shared or production database: it
// creates its own throwaway database and drops it again.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Client, Pool } = require("pg");
const { spawnSync } = require("node:child_process");
const { createPrepaidOrderService } = require("../server/services/prepaid/prepaidOrderServiceV2");
const { createAdminPrepaidRedemptionService } = require("../server/services/prepaid/adminPrepaidRedemptionService");
const { createServicePackageResolver } = require("../server/services/packages/servicePackageResolver");

const REPO_ROOT = path.resolve(__dirname, "..");
const MIGRATION_PATH = path.join(
  REPO_ROOT, "scripts", "sql", "20260906_prepaid_service_entitlements.sql"
);
const ADMIN = {
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
  database: process.env.PGDATABASE || "postgres",
};
const DB_NAME = `cwf_prepaid_lifecycle_${process.pid}`;

// The columns the booking INSERT and the lifecycle triggers actually touch.
// jobs.customer_sub and jobs.paid_at are assigned by guard_prepaid_job_redemption()
// but created by earlier migrations, so they are part of the contract under test.
const BASE_SCHEMA = `
CREATE TABLE public.customer_orders (
  order_id BIGSERIAL PRIMARY KEY,
  order_code TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  delivery_method TEXT NOT NULL DEFAULT 'pickup',
  install_option TEXT NOT NULL DEFAULT 'none',
  address TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  note TEXT,
  payment_status TEXT,
  payment_provider TEXT,
  payment_method TEXT,
  payment_charge_id TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.jobs (
  job_id BIGSERIAL PRIMARY KEY,
  booking_code TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_sub TEXT,
  address_text TEXT,
  maps_url TEXT,
  gps_latitude DOUBLE PRECISION,
  gps_longitude DOUBLE PRECISION,
  customer_note TEXT,
  job_type TEXT,
  job_status TEXT,
  appointment_datetime TIMESTAMPTZ,
  booking_token TEXT,
  booking_mode TEXT,
  job_source TEXT,
  total_price NUMERIC(12,2),
  payment_status TEXT,
  paid_at TIMESTAMPTZ,
  paid_by TEXT,
  canceled_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The rest of what the three technician projections in index.js select. They
  -- are listed so the real query can run here unmodified; a column the
  -- projection adds later will fail loudly rather than go untested.
  brand_key TEXT,
  dispatch_mode TEXT,
  job_price NUMERIC(12,2),
  job_zone TEXT,
  technician_team TEXT,
  technician_username TEXT,
  cancel_reason TEXT,
  return_reason TEXT,
  returned_at TIMESTAMPTZ,
  returned_by TEXT,
  travel_started_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  checkin_at TIMESTAMPTZ,
  checkin_latitude DOUBLE PRECISION,
  checkin_longitude DOUBLE PRECISION,
  technician_note TEXT,
  final_signature_path TEXT,
  final_signature_status TEXT,
  final_signature_at TIMESTAMPTZ,
  pre_cleaning_checklist JSONB,
  post_cleaning_checklist JSONB,
  photo_acknowledgement_required BOOLEAN,
  photo_acknowledgement_accepted BOOLEAN,
  missing_photo_categories TEXT[],
  close_payment_method TEXT,
  close_payment_status TEXT,
  close_cash_amount NUMERIC(12,2),
  close_payment_note TEXT,
  close_cash_confirmed BOOLEAN,
  close_signature_type TEXT,
  close_signature_by TEXT,
  close_signature_at TIMESTAMPTZ
);
CREATE TABLE public.catalog_items (
  item_id BIGSERIAL PRIMARY KEY, item_name TEXT NOT NULL,
  item_category TEXT DEFAULT 'service', base_price NUMERIC(12,2) DEFAULT 0,
  unit_label TEXT, job_category TEXT, ac_type TEXT,
  is_active BOOLEAN DEFAULT FALSE, is_customer_visible BOOLEAN DEFAULT FALSE,
  short_description TEXT, long_description TEXT, highlights JSONB DEFAULT '[]',
  service_conditions TEXT, booking_mode TEXT DEFAULT 'contact_admin',
  is_featured BOOLEAN DEFAULT FALSE, is_autoplay_enabled BOOLEAN DEFAULT TRUE
);
CREATE TABLE public.job_items (
  job_item_id BIGSERIAL PRIMARY KEY, job_id BIGINT, item_name TEXT,
  quantity INTEGER, unit_price NUMERIC(12,2)
);
`;

const ORDER_CODE = "CWF-AC-LIFECYCLE";
const CUSTOMER_SUB = "line|U-lifecycle-001";
const ADDRESS = "88/9 ซอยสุขุมวิท 42 แขวงพระโขนง เขตคลองเตย กรุงเทพฯ 10110 (ชั้น 7 ห้อง 7B)";
const MAPS_URL = "https://www.google.com/maps?q=13.7108,100.5901";
const LAT = 13.7108;
const LNG = 100.5901;
const NOTE = "โทรก่อนเข้าบ้าน 15 นาที มีสุนัข";

let admin = null;
let db = null;
let pool = null;
let unavailable = "";

async function connect(config) {
  const client = new Client(config);
  await client.connect();
  return client;
}

test.before(async () => {
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(ADMIN.host), "lifecycle tests require a disposable local PostgreSQL server");
  try {
    admin = await connect(ADMIN);
  } catch (error) {
    unavailable = `PostgreSQL integration database unavailable: ${error.message}`;
    return;
  }
  // Once PostgreSQL is reachable, broken schema setup is a failure, never a skip.
  await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME}`);
  await admin.query(`CREATE DATABASE ${DB_NAME}`);
  db = await connect({ ...ADMIN, database: DB_NAME });
  await db.query(BASE_SCHEMA);
  await db.query(fs.readFileSync(MIGRATION_PATH, "utf8"));
  for (const file of ["20260807_service_packages.sql", "20260809_store_service_package_bundles.sql",
    "20260820_service_package_minimum_total_quantity.sql", "20260905_promotion_engine_policy_fields.sql"]) {
    await db.query(fs.readFileSync(path.join(REPO_ROOT, "migrations", file), "utf8"));
  }
  pool = new Pool({ ...ADMIN, database: DB_NAME });
});

test.after(async () => {
  if (pool) await pool.end();
  try { if (db) await db.end(); } catch (_) {}
  try {
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
      await admin.end();
    }
  } catch (_) {}
});

// Buys an AIR CARE right with a complete service location, then has Admin verify
// a real payment. The paid-order trigger issues the entitlement.
async function seedPaidRight({ paid = true } = {}) {
  await db.query("UPDATE public.customer_service_entitlements SET redeemed_job_id=NULL");
  await db.query("DELETE FROM public.jobs");
  await db.query("DELETE FROM public.customer_service_entitlements");
  await db.query("DELETE FROM public.customer_orders");
  await db.query(
    `INSERT INTO public.customer_orders
       (order_code, customer_name, customer_phone, address, note, subtotal, status,
        order_kind, customer_sub, prepaid_maps_url, prepaid_gps_latitude,
        prepaid_gps_longitude, prepaid_entitlement_code, prepaid_redeem_until,
        prepaid_warranty_days, service_entitlement_snapshot)
     VALUES ($1,'คุณสมชาย ใจดี','0812345678',$2,$3,899,'pending_payment',
             'service_prepaid',$4,$5,$6,$7,'CWF-RIGHT-LIFECYCLE',
             now() + interval '90 days', 60, $8::jsonb)`,
    [ORDER_CODE, ADDRESS, NOTE, CUSTOMER_SUB, MAPS_URL, LAT, LNG, JSON.stringify({
      schema_version: 1,
      payment_mode: "prepaid_full",
      catalog_item_id: 501,
      fixed_total_price: 899,
      duration_min: 120,
      warranty_days: 60,
      service_package_groups: [
        { package_key: "coldwindflow-air-care-standard-small", btu: 12000, quantity: 2 },
      ],
      services: [{ name: "COLDWINDFLOW AIR CARE STANDARD" }],
      snapshots: [{ tier: "standard", btu_group: "le12k", quantity: 2 }],
    })]
  );
  if (paid) await db.query(
    `UPDATE public.customer_orders
        SET status='paid', payment_status='verified', paid_at=now(),
            manual_payment_reference='LINE-SLIP-7781', payment_verified_by='admin:owner'
      WHERE order_code=$1`,
    [ORDER_CODE]
  );
  const right = await db.query(
    "SELECT entitlement_id, status FROM public.customer_service_entitlements"
  );
  return right.rows[0];
}

// Mirrors what the Admin redemption service does before handing over to the
// canonical booking writer.
async function arm(entitlementId, token) {
  await db.query(
    `UPDATE public.customer_service_entitlements
        SET status='redeeming', redemption_request_key=$2,
            redemption_token_hash=$3, redemption_booking_token=$4,
            redemption_expires_at=now() + interval '15 minutes'
      WHERE entitlement_id=$1`,
    [entitlementId, `adminprepaid_${token}`, `hash_${token}`, token]
  );
}

// Books exactly the way the application does: the package resolver publishes the
// verified entitlement as transaction-local settings, then the booking INSERT runs
// in that same transaction so guard_prepaid_job_redemption() can bind the Job.
async function bookFromRight({ entitlementId, token, bookingCode, days = 3, client = db, owner = CUSTOMER_SUB, orderCode = ORDER_CODE, preparation }) {
  await client.query("BEGIN");
  try {
    if (preparation) {
      await createServicePackageResolver({ db: client }).resolvePrepaidRedemption({
        body: preparation, bookingMode: "scheduled",
        appointmentDatetime: new Date(Date.now() + days * 86400000).toISOString(),
      });
    } else await client.query(
      `SELECT set_config('cwf.prepaid_entitlement_id',$1,true),
              set_config('cwf.prepaid_customer_sub',$2,true),
              set_config('cwf.prepaid_booking_token',$3,true)`,
      [String(entitlementId), owner, token]
    );
    await client.query(
      `INSERT INTO public.jobs
         (booking_code, customer_name, customer_phone, address_text, maps_url,
          gps_latitude, gps_longitude, customer_note, job_type, job_status,
          appointment_datetime, booking_mode, job_source, total_price)
       SELECT $1, o.customer_name, o.customer_phone, o.address, o.prepaid_maps_url,
              o.prepaid_gps_latitude, o.prepaid_gps_longitude, o.note,
              'COLDWINDFLOW AIR CARE STANDARD', 'รอดำเนินการ',
              now() + ($2 || ' days')::interval, 'scheduled', 'admin', 899
         FROM public.customer_orders o
        WHERE o.order_code=$3`,
      [bookingCode, String(days), orderCode]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

test("verified payment issues exactly one active right for the paid order", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const right = await seedPaidRight();
  assert.equal(right.status, "active");
  const all = await db.query("SELECT count(*)::int AS n FROM public.customer_service_entitlements");
  assert.equal(all.rows[0].n, 1);
});

test("the paid Order's full location reaches the Job row the technician opens", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const right = await seedPaidRight();
  await arm(right.entitlement_id, "btok_location");
  await bookFromRight({
    entitlementId: right.entitlement_id, token: "btok_location", bookingCode: "CWF-JOB-LOC",
  });

  const { rows } = await db.query(
    `SELECT j.customer_name, j.customer_phone, j.address_text, j.maps_url,
            j.gps_latitude, j.gps_longitude, j.customer_note,
            o.customer_name AS o_name, o.customer_phone AS o_phone, o.address AS o_address,
            o.prepaid_maps_url AS o_maps, o.prepaid_gps_latitude AS o_lat,
            o.prepaid_gps_longitude AS o_lng, o.note AS o_note,
            o.order_code, e.entitlement_code
       FROM public.jobs j
       JOIN public.customer_service_entitlements e ON e.entitlement_id=j.prepaid_entitlement_id
       JOIN public.customer_orders o ON o.order_id=e.order_id
      WHERE j.booking_code='CWF-JOB-LOC'`
  );
  assert.equal(rows.length, 1, "the Job must stay joinable back to its Order and right");
  const job = rows[0];

  // Nothing may be dropped at the Order -> Job boundary.
  assert.equal(job.customer_name, job.o_name);
  assert.equal(job.customer_phone, job.o_phone);
  assert.equal(job.address_text, job.o_address);
  assert.equal(job.maps_url, job.o_maps);
  assert.equal(Number(job.gps_latitude), Number(job.o_lat));
  assert.equal(Number(job.gps_longitude), Number(job.o_lng));
  assert.equal(job.customer_note, job.o_note);

  // And the technician must actually be able to travel and work.
  assert.ok(job.address_text && job.address_text.includes("ห้อง 7B"), "unit detail must survive");
  assert.ok(job.maps_url.startsWith("https://"), "a usable map link is required");
  assert.ok(Number.isFinite(Number(job.gps_latitude)));
  assert.ok(Number.isFinite(Number(job.gps_longitude)));
  assert.ok(job.customer_phone);
  assert.equal(job.order_code, ORDER_CODE);
});

test("a prepaid Job settles at zero so the paid customer is never charged twice", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const right = await seedPaidRight();
  await arm(right.entitlement_id, "btok_settle");
  await bookFromRight({
    entitlementId: right.entitlement_id, token: "btok_settle", bookingCode: "CWF-JOB-SETTLE",
  });
  const { rows } = await db.query(
    `SELECT customer_due, payment_source, payment_status, paid_at, total_price
       FROM public.jobs WHERE booking_code='CWF-JOB-SETTLE'`
  );
  assert.equal(Number(rows[0].customer_due), 0);
  assert.equal(rows[0].payment_source, "prepaid_entitlement");
  assert.equal(rows[0].payment_status, "paid");
  assert.ok(rows[0].paid_at, "the Job carries the Order's real payment time");
  // Revenue is preserved even though the customer owes nothing.
  assert.equal(Number(rows[0].total_price), 899);
});

test("one right cannot create a second live Job", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const right = await seedPaidRight();
  await arm(right.entitlement_id, "btok_once");
  await bookFromRight({
    entitlementId: right.entitlement_id, token: "btok_once", bookingCode: "CWF-JOB-ONCE",
  });
  await assert.rejects(
    bookFromRight({
      entitlementId: right.entitlement_id, token: "btok_once", bookingCode: "CWF-JOB-ONCE-DUP",
    }),
    /PREPAID_REDEMPTION_NOT_ALLOWED/,
    "a replayed redemption must not produce a second Job"
  );
  const { rows } = await db.query("SELECT count(*)::int AS n FROM public.jobs");
  assert.equal(rows[0].n, 1);
});

test("cancelling an unfinished Job returns the paid right and keeps the audit link", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const right = await seedPaidRight();
  await arm(right.entitlement_id, "btok_cancel");
  await bookFromRight({
    entitlementId: right.entitlement_id, token: "btok_cancel", bookingCode: "CWF-JOB-CANCEL",
  });
  await db.query(
    "UPDATE public.jobs SET canceled_at=now(), job_status='ยกเลิก' WHERE booking_code='CWF-JOB-CANCEL'"
  );

  const ent = await db.query(
    "SELECT status, redeemed_job_id FROM public.customer_service_entitlements"
  );
  assert.equal(ent.rows[0].status, "active", "a paid right must survive an admin cancellation");
  assert.equal(ent.rows[0].redeemed_job_id, null);

  const job = await db.query(
    "SELECT prepaid_entitlement_id FROM public.jobs WHERE booking_code='CWF-JOB-CANCEL'"
  );
  assert.ok(job.rows[0].prepaid_entitlement_id, "the cancelled Job stays linked as history");

  // The customer must be able to book again rather than losing what they paid for.
  await arm(right.entitlement_id, "btok_rebook");
  await bookFromRight({
    entitlementId: right.entitlement_id, token: "btok_rebook",
    bookingCode: "CWF-JOB-REBOOK", days: 5,
  });
  const replacement = await db.query(
    `SELECT address_text, customer_due, payment_status
       FROM public.jobs WHERE booking_code='CWF-JOB-REBOOK'`
  );
  assert.equal(replacement.rows.length, 1);
  assert.equal(replacement.rows[0].address_text, ADDRESS, "the replacement keeps the paid location");
  assert.equal(Number(replacement.rows[0].customer_due), 0);
  assert.equal(replacement.rows[0].payment_status, "paid");
});

test("a finished Job never hands the right back", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const right = await seedPaidRight();
  await arm(right.entitlement_id, "btok_done");
  await bookFromRight({
    entitlementId: right.entitlement_id, token: "btok_done", bookingCode: "CWF-JOB-DONE",
  });
  await db.query(
    `UPDATE public.jobs SET finished_at=now(), job_status='เสร็จสิ้น'
      WHERE booking_code='CWF-JOB-DONE'`
  );
  await db.query(
    "UPDATE public.jobs SET canceled_at=now() WHERE booking_code='CWF-JOB-DONE'"
  );
  const ent = await db.query("SELECT status FROM public.customer_service_entitlements");
  assert.equal(ent.rows[0].status, "redeemed", "a completed service must stay consumed");
});

// The three technician projections in index.js are the only thing standing
// between a correctly written Job row and a technician who cannot find the
// customer. Rather than restate the column list here — which is how fixtures rot
// — pull the real SELECT out of index.js and run it against the real row.
function technicianProjections() {
  const source = fs.readFileSync(path.join(REPO_ROOT, "index.js"), "utf8");
  const region = source.slice(
    source.indexOf("async function _loadTechnicianVisibleJobsByIds"),
    source.indexOf("// =======================================\n// 🛠️ ADMIN: EDIT JOB")
  );
  const found = [...region.matchAll(/SELECT\s+(j\.job_id,[\s\S]*?)\s+FROM public\.jobs j/g)]
    // One branch computes `${historyWhere} AS is_history` from a JS variable.
    // Standing in a literal keeps the rest of the real column list executable.
    .map((m) => m[1].replace(/\$\{[^}]*\}/g, "TRUE"));
  assert.equal(found.length, 3, "expected the by-ids loader and both /jobs/tech branches");
  return found;
}

test("the technician's own query returns the full job packet from the paid Order", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const right = await seedPaidRight();
  await arm(right.entitlement_id, "btok_tech");
  await bookFromRight({
    entitlementId: right.entitlement_id, token: "btok_tech", bookingCode: "CWF-JOB-TECH",
  });
  const jobId = (await db.query(
    "SELECT job_id FROM public.jobs WHERE booking_code='CWF-JOB-TECH'"
  )).rows[0].job_id;

  for (const [index, columns] of technicianProjections().entries()) {
    const { rows } = await db.query(
      `SELECT ${columns} FROM public.jobs j WHERE j.job_id=$1`, [jobId]
    );
    assert.equal(rows.length, 1, `projection ${index} must return the job`);
    const job = rows[0];
    const where = `technician projection ${index}`;

    // Reach the customer.
    assert.equal(job.customer_name, "คุณสมชาย ใจดี", where);
    assert.equal(job.customer_phone, "0812345678", where);
    // Travel to them.
    assert.equal(job.address_text, ADDRESS, where);
    assert.ok(String(job.address_text).includes("ห้อง 7B"), `${where}: unit detail lost`);
    assert.equal(job.maps_url, MAPS_URL, where);
    assert.equal(Number(job.gps_latitude), LAT, where);
    assert.equal(Number(job.gps_longitude), LNG, where);
    // Know what to expect on arrival.
    assert.equal(job.customer_note, NOTE, where);
    assert.equal(job.job_type, "COLDWINDFLOW AIR CARE STANDARD", where);
    // And never ask a prepaid customer for money again.
    assert.equal(job.payment_status, "paid", where);
    assert.equal(Number(job.customer_due), 0, where);
    assert.equal(job.payment_source, "prepaid_entitlement", where);
    assert.ok(job.paid_at, `${where}: prepaid job must carry the real payment time`);
  }
});

test("the job packet survives a reconnect, as it must across a reload", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const right = await seedPaidRight();
  await arm(right.entitlement_id, "btok_reload");
  await bookFromRight({
    entitlementId: right.entitlement_id, token: "btok_reload", bookingCode: "CWF-JOB-RELOAD",
  });

  // A new connection sees only what was actually committed, which is what a
  // reopened app, a second device or the technician's next poll really gets.
  const fresh = await connect({ ...ADMIN, database: DB_NAME });
  try {
    const columns = technicianProjections()[0];
    const { rows } = await fresh.query(
      `SELECT ${columns} FROM public.jobs j WHERE j.booking_code='CWF-JOB-RELOAD'`
    );
    assert.equal(rows.length, 1, "the job must still be there after reconnecting");
    assert.equal(rows[0].address_text, ADDRESS);
    assert.equal(rows[0].maps_url, MAPS_URL);
    assert.equal(rows[0].customer_note, NOTE);
    assert.equal(rows[0].customer_phone, "0812345678");
    assert.equal(Number(rows[0].customer_due), 0);
    assert.equal(rows[0].payment_status, "paid");

    const ent = await fresh.query(
      `SELECT status, redeemed_job_id FROM public.customer_service_entitlements`
    );
    assert.equal(ent.rows[0].status, "redeemed", "the right stays consumed after a reload");
    assert.ok(ent.rows[0].redeemed_job_id, "and stays bound to its job");
  } finally {
    await fresh.end();
  }
});

test("an unpaid order issues no right, so nothing can be redeemed", async (t) => {
  if (unavailable) return t.skip(unavailable);
  await db.query("UPDATE public.customer_service_entitlements SET redeemed_job_id=NULL");
  await db.query("DELETE FROM public.jobs");
  await db.query("DELETE FROM public.customer_service_entitlements");
  await db.query("DELETE FROM public.customer_orders");
  await db.query(
    `INSERT INTO public.customer_orders
       (order_code, customer_name, customer_phone, address, subtotal, status,
        order_kind, customer_sub, prepaid_maps_url, prepaid_entitlement_code,
        prepaid_redeem_until, prepaid_warranty_days, service_entitlement_snapshot)
     VALUES ('CWF-AC-UNPAID','คุณสมชาย ใจดี','0812345678',$1,899,'pending_payment',
             'service_prepaid',$2,$3,'CWF-RIGHT-UNPAID',
             now() + interval '90 days', 60, '{}'::jsonb)`,
    [ADDRESS, CUSTOMER_SUB, MAPS_URL]
  );
  const { rows } = await db.query(
    "SELECT count(*)::int AS n FROM public.customer_service_entitlements"
  );
  assert.equal(rows[0].n, 0, "an unpaid AIR CARE order must not grant a service right");
});

async function seedCatalog() {
  await db.query(fs.readFileSync(path.join(REPO_ROOT, "data-seeds", "20260930_cwf_air_care.sql"), "utf8"));
  return (await db.query("SELECT item_id, service_bundle_key FROM public.catalog_items")).rows;
}

test("real AIR CARE seed quotes q1-q6 identically for Customer and Admin, with two BTU groups", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const rows = await seedCatalog();
  const at = new Date("2026-10-01T05:00:00Z");
  const service = createPrepaidOrderService({ pool, now: () => at,
    resolverFactory: ({ db }) => createServicePackageResolver({ db, now: () => at }) });
  const matrices = {
    "standard-small": [499, 899, 1299, 1699, 2198, 2598],
    "standard-large": [599, 1099, 1599, 2099, 2698, 3198],
    "premium-small": [699, 1399, 1899, 2489, 3188, 3798],
    "premium-large": [899, 1799, 2599, 3399, 4298, 5197],
  };
  for (const [variant, prices] of Object.entries(matrices)) {
    const catalog_item_id = rows.find((r) => r.service_bundle_key === `coldwindflow-air-care-${variant.split("-")[0]}`).item_id;
    for (const identity of ["customer", "admin"]) {
      for (let quantity = 1; quantity <= 6; quantity++) {
        const quote = await service.quoteOrder({ catalog_item_id, fixed_total_price: 1,
          service_package_groups: [{ package_key: `coldwindflow-air-care-${variant}`,
            btu: variant.endsWith("small") ? 12000 : 18000, quantity }] }, { identity });
        assert.equal(quote.fixed_total_price, prices[quantity - 1], `${identity} ${variant} q${quantity}`);
      }
      await assert.rejects(service.quoteOrder({ catalog_item_id,
        service_package_groups: [{ package_key: `coldwindflow-air-care-${variant}`, btu: 15000, quantity: 1 }] }, { identity }),
      { code: "PACKAGE_BTU_MISMATCH" });
    }
  }
  // This test pins a closed instant; it never changes the seed's sale window.
  const closed = createPrepaidOrderService({ pool, now: () => new Date("2026-10-07T00:00:00Z"),
    resolverFactory: ({ db }) => createServicePackageResolver({ db, now: () => new Date("2026-10-07T00:00:00Z") }) });
  for (const identity of ["customer", "admin"]) {
    await assert.rejects(closed.quoteOrder({ catalog_item_id: rows[0].item_id,
      service_package_groups: [{ package_key: `${rows[0].service_bundle_key}-small`, btu: 12000, quantity: 1 }] }, { identity }),
    { code: "SERVICE_PACKAGE_NOT_AVAILABLE" });
  }
});

test("the real seed probe passes the unchanged campaign and rejects a corrupted database tier", async (t) => {
  if (unavailable) return t.skip(unavailable);
  await seedCatalog();
  const run = () => spawnSync(process.execPath, ["--require", path.join(__dirname, "e2e", "local-postgres-preload.js"),
    "scripts/probe-air-care-quotes.js", "isolated-test"], {
    cwd: REPO_ROOT, encoding: "utf8", timeout: 30000,
    env: { ...process.env, NODE_OPTIONS: "", CWF_E2E_TEST_MODE: "1",
      DB_HOST: ADMIN.host, DB_PORT: String(ADMIN.port), DB_USER: ADMIN.user,
      DB_PASSWORD: ADMIN.password, DB_NAME, DB_SSL: "false",
      DATABASE_URL: "", USER_DB_URL: "", ADMIN_DB_URL: "", TECH_DB_URL: "" },
  });
  const valid = run();
  assert.equal(valid.status, 0, valid.stdout + valid.stderr);
  assert.match(valid.stdout, /status=passed matrices=5 quotes=25/);
  await db.query("UPDATE public.service_package_tiers SET fixed_total_price=1 WHERE tier_key='q2'");
  const invalid = run();
  assert.equal(invalid.status, 1, invalid.stdout + invalid.stderr);
  assert.match(invalid.stdout, /AIR_CARE_PRICE_MISMATCH/);
  await seedCatalog();
});

test("real payment service serializes duplicate confirmations and rejects the wrong amount", async (t) => {
  if (unavailable) return t.skip(unavailable);
  await seedPaidRight({ paid: false });
  const service = createPrepaidOrderService({ pool });
  await assert.rejects(service.confirmManualPayment(ORDER_CODE, { reference: "TEST", confirmed_amount: 1 }),
    { code: "PAYMENT_AMOUNT_MISMATCH" });
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.customer_service_entitlements")).rows[0].n, 0);
  const results = await Promise.all([1, 2].map(() => service.confirmManualPayment(ORDER_CODE,
    { reference: "TEST-MANUAL-PAYMENT", confirmed_amount: 899 }, { verifiedBy: "isolated-test-admin" })));
  assert.deepEqual(results.map((r) => r.replayed).sort(), [false, true]);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.customer_service_entitlements")).rows[0].n, 1);
  assert.equal((await service.listRights(CUSTOMER_SUB))[0].status, "active");
});

test("two concurrent database redemptions create exactly one live job", async (t) => {
  if (unavailable) return t.skip(unavailable);
  const right = await seedPaidRight();
  await arm(right.entitlement_id, "concurrent_token");
  const clients = await Promise.all([connect({ ...ADMIN, database: DB_NAME }), connect({ ...ADMIN, database: DB_NAME })]);
  try {
    const results = await Promise.allSettled(clients.map((client, i) => bookFromRight({
      entitlementId: right.entitlement_id, token: "concurrent_token", bookingCode: `CONCURRENT-${i}`, client,
    })));
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.match(results.find((r) => r.status === "rejected").reason.message, /PREPAID_REDEMPTION_NOT_ALLOWED/);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.jobs")).rows[0].n, 1);
  } finally { await Promise.all(clients.map((client) => client.end())); }
});

test("purchase, verify, Customer schedule, cancel, Admin reschedule and completion persist through real services", async (t) => {
  if (unavailable) return t.skip(unavailable);
  await seedPaidRight({ paid: false });
  const catalog = await seedCatalog();
  // A synthetic currently-selling fixture in this disposable database only.
  // The committed campaign seed and all deployed environments stay unchanged.
  await db.query(`UPDATE public.catalog_items SET service_package_sell_start_at=NOW()-INTERVAL '1 day',
    service_package_redeem_until=NOW()+INTERVAL '90 days', service_package_sell_end_at=NOW()+INTERVAL '1 day'`);
  const item = catalog.find((r) => r.service_bundle_key.endsWith("standard"));
  const service = createPrepaidOrderService({ pool });
  const body = { catalog_item_id: item.item_id, purchase_request_key: "isolated_purchase_request_453",
    customer_name: "Isolated QA", customer_phone: "0812345678", address_text: ADDRESS,
    maps_url: MAPS_URL, gps_latitude: LAT, gps_longitude: LNG, note: NOTE, fixed_total_price: 1,
    service_package_groups: [{ package_key: "coldwindflow-air-care-standard-small", btu: 12000, quantity: 2 }] };
  const purchases = await Promise.all([1, 2].map(() => service.createOrder(body, { customerSub: CUSTOMER_SUB })));
  assert.deepEqual(purchases.map((p) => p.replayed).sort(), [false, true]);
  const sale = purchases.find((p) => !p.replayed);
  assert.equal(Number(sale.order.subtotal), 899);
  assert.equal(sale.order.status, "pending_payment");
  assert.equal((await service.listRights(CUSTOMER_SUB)).length, 0);
  await assert.rejects(service.beginRedemption({ entitlementCode: sale.entitlement_code, customerSub: CUSTOMER_SUB }),
    { code: "ENTITLEMENT_NOT_FOUND" });
  await service.confirmManualPayment(sale.order.order_code, { reference: "ISOLATED-PAID", confirmed_amount: 899 });
  const saved = (await service.listOrders(CUSTOMER_SUB)).find((o) => o.order_code === sale.order.order_code);
  assert.equal(saved.address, ADDRESS);
  assert.equal(saved.note, NOTE);
  await assert.rejects(service.beginRedemption({ entitlementCode: sale.entitlement_code, customerSub: "other-customer" }),
    { code: "ENTITLEMENT_NOT_FOUND" });
  await assert.rejects(service.cancelOrder(sale.order.order_code, { customerSub: CUSTOMER_SUB }),
    { code: "ORDER_CANCELLATION_REQUIRES_ADMIN_REVIEW" });
  // Sold rights must survive catalog edits/deactivation and sale closure.
  await db.query("UPDATE public.service_package_tiers SET fixed_total_price=9999");
  await db.query("UPDATE public.catalog_items SET is_active=FALSE, service_package_sell_end_at=NOW()-INTERVAL '1 hour'");
  const preparation = await service.beginRedemption({ entitlementCode: sale.entitlement_code, customerSub: CUSTOMER_SUB });
  assert.equal(preparation.fixed_total_price, 899);
  await bookFromRight({ preparation, orderCode: sale.order.order_code, bookingCode: "REAL-CUSTOMER" });
  const job = (await db.query("SELECT * FROM public.jobs WHERE booking_code='REAL-CUSTOMER'")).rows[0];
  assert.equal(Number(job.customer_due), 0);
  assert.equal(job.address_text, ADDRESS);
  assert.equal(job.customer_note, NOTE);
  await assert.rejects(bookFromRight({ preparation, orderCode: sale.order.order_code, bookingCode: "REAL-DUP" }),
    { code: "PREPAID_REDEMPTION_NOT_ALLOWED" });
  await db.query("UPDATE public.jobs SET canceled_at=NOW() WHERE job_id=$1", [job.job_id]);
  assert.equal((await service.listRights(CUSTOMER_SUB))[0].status, "active");
  const adminService = createAdminPrepaidRedemptionService({ pool });
  const adminPreparation = await adminService.prepareForAdminBooking(sale.entitlement_code);
  assert.equal(adminPreparation.address_text, ADDRESS);
  await bookFromRight({ preparation: adminPreparation, orderCode: sale.order.order_code, bookingCode: "REAL-ADMIN", days: 5 });
  await db.query("UPDATE public.jobs SET finished_at=NOW() WHERE booking_code='REAL-ADMIN'");
  const rights = await service.listRights(CUSTOMER_SUB);
  assert.equal(rights[0].status, "redeemed");
  assert.equal(rights[0].warranty_active, true);
  assert.equal(new Date(rights[0].warranty_until) - new Date(rights[0].finished_at), 60 * 86400000);
  await assert.rejects(adminService.prepareForAdminBooking(sale.entitlement_code), { code: "ENTITLEMENT_ALREADY_REDEEMED" });
});
