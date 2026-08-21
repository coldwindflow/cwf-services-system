"use strict";

// Issue 310 - optional minimum total machine quantity per Store service-package
// parent, enforced on the shared composite resolution path so customer
// scheduled/urgent, Admin booking-on-behalf, idempotent replay and any stale or
// direct client are all held to the same rule.
//
// These tests never touch tier pricing/composition, availability, technician
// queues or the Thai Admin Add Job UI shipped in PR #308 - they only prove the
// new minimum is additive and cannot be bypassed.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  resolveCompositeBooking,
  bundleMinimumTotalQuantity,
  totalGroupQuantity,
  MIN_COMPOSITE_PACKAGE_MINIMUM,
  MAX_COMPOSITE_PACKAGE_QUANTITY,
} = require("../server/services/packages/compositeServicePackage");
const { compositeBookingFromSnapshots } = require("../server/services/booking/servicePackageBooking");
const { validate } = require("../server/services/packages/storeServicePackageCatalogService");
const { createCustomerCatalogQuoteService } = require("../server/services/booking/customerCatalogQuote");
const { createServicePackageResolver } = require("../server/services/packages/servicePackageResolver");
const catalogRoutes = require("../server/routes/catalog/items");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const MIGRATION_NAME = "20260820_service_package_minimum_total_quantity.sql";
const MIGRATION_PATH = `migrations/${MIGRATION_NAME}`;
const ROLLBACK_PATH = `migrations/rollback/${MIGRATION_NAME}`;

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

function tiers(prices) {
  return Object.entries(prices).map(([quantity, price], index) => ({
    service_package_tier_id: String(index + 1), tier_key: `q${quantity}`,
    display_name: `${quantity} units`, service_quantity: Number(quantity),
    fixed_total_price: price, sort_order: index, is_active: true,
  }));
}

const small = tiers({ 1: "699.00", 2: "1399.00", 3: "1899.00", 4: "2489.00" });
const large = tiers({ 1: "899.00", 2: "1799.00", 3: "2599.00", 4: "3399.00" });

function bundleRows(minimum) {
  const base = {
    catalog_item_id: "51", item_id: "51", item_name: "TEST parent", service_bundle_key: "test-parent",
    booking_mode: "service_package", catalog_is_active: true, catalog_is_customer_visible: true,
    service_package_sell_start_at: "2026-08-08T00:00:00.000Z",
    service_package_sell_end_at: "2026-08-31T00:00:00.000Z",
    service_package_redeem_until: "2027-01-31T16:59:59.000Z",
    booking_flow_policy: "scheduled_and_urgent",
    service_package_minimum_total_quantity: minimum,
    job_type: "wash", ac_type: "wall", wash_variant: "premium", service_key: "wash-wall-premium",
    service_name: "Premium wash", service_unit_duration_minutes: 45,
    is_active: true, is_customer_visible: true,
  };
  return [
    { ...base, service_package_id: "11", package_key: "small", display_name: "up to 12000", btu_min: null, btu_max: 12000, tiers: small },
    { ...base, service_package_id: "12", package_key: "large", display_name: "18000 plus", btu_min: 18000, btu_max: null, tiers: large },
  ];
}

function repositoryFor(minimum) {
  const rows = bundleRows(minimum);
  return { findLinkedPackagesByKeys: async (_db, keys) => rows.filter((row) => keys.includes(row.package_key)) };
}

function resolve(minimum, groups, { bookingMode = "scheduled", identity = "customer" } = {}) {
  return resolveCompositeBooking({
    body: { service_package_groups: groups },
    bookingMode,
    appointmentDatetime: "2026-08-25T03:00:00.000Z",
    repository: repositoryFor(minimum),
    db: {},
    identity,
    now: () => new Date("2026-08-20T00:00:00.000Z"),
  });
}

// ---------------------------------------------------------------------------
// 1) Migration + rollback contract
// ---------------------------------------------------------------------------

test("Issue 310: the forward migration is additive and expand-only", () => {
  const sql = read(MIGRATION_PATH);
  const executable = sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");

  assert.match(sql, /ADD COLUMN IF NOT EXISTS service_package_minimum_total_quantity INTEGER/);
  assert.match(sql, /catalog_items_service_package_minimum_total_quantity_check/);
  assert.match(sql, /service_package_minimum_total_quantity IS NULL/);
  assert.match(sql, /service_package_minimum_total_quantity >= 2/);
  assert.match(sql, /service_package_minimum_total_quantity <= 99/);
  // The new column must be re-runnable; the constraint follows 20260809's shape.
  assert.match(sql, /ADD COLUMN IF NOT EXISTS/);
  assert.doesNotMatch(sql, /DO \$\$/, "no PL/pgSQL block: a BEGIN token here can trip the expand-only scanner");

  // Expand-only lane: nothing destructive, no transaction control, no data writes.
  assert.doesNotMatch(executable, /\b(?:DELETE FROM|TRUNCATE|DROP TABLE|DROP COLUMN|DROP CONSTRAINT|UPDATE |INSERT INTO)\b/i);
  assert.doesNotMatch(executable.replace(/\n/g, " "), /(^|[;\s])(BEGIN|COMMIT|ROLLBACK)([\s;]|$)/i);
  // The already-applied Issue 267 migration must not be edited.
  assert.equal(
    crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, "migrations/20260809_store_service_package_bundles.sql"))).digest("hex"),
    "bf6512c628bfd5cf473c8af33cda31a01cdd6615dfe929755fe7f6b34ada432b"
  );
});

test("Issue 310: the rollback drops only the new constraint and column, pre-data only", () => {
  const rollback = read(ROLLBACK_PATH);
  assert.match(rollback, /PRE-DATA ROLLBACK ONLY/);
  assert.match(rollback, /DROP CONSTRAINT IF EXISTS catalog_items_service_package_minimum_total_quantity_check/);
  assert.match(rollback, /DROP COLUMN IF EXISTS service_package_minimum_total_quantity/);
  // It must not undo any Issue 267 bundle schema.
  for (const column of ["service_bundle_key", "booking_flow_policy", "catalog_item_id", "admin_request_key"]) {
    assert.doesNotMatch(rollback, new RegExp(`DROP COLUMN IF EXISTS ${column}\\b`));
  }
});

// ---------------------------------------------------------------------------
// 2) Catalog validation
// ---------------------------------------------------------------------------

function catalogInput(extra = {}) {
  return {
    item_name: "TEST parent", is_active: true, is_customer_visible: true,
    variants: [{
      display_name: "TEST variant", service_key: "wash-wall-premium", service_name: "Premium wash",
      job_type: "wash", ac_type: "wall", wash_variant: "premium", btu_min: null, btu_max: 12000,
      service_unit_duration_minutes: 45, is_active: true, is_customer_visible: true,
      tiers: [{ display_name: "1 unit", service_quantity: 1, fixed_total_price: "699.00", sort_order: 0, is_active: true }],
    }],
    ...extra,
  };
}

test("Issue 310: blank/null minimum round-trips as unrestricted", () => {
  assert.equal(validate(catalogInput()).minimum_total_quantity, null);
  assert.equal(validate(catalogInput({ minimum_total_quantity: null })).minimum_total_quantity, null);
  assert.equal(validate(catalogInput({ minimum_total_quantity: "" })).minimum_total_quantity, null);
  assert.equal(validate(catalogInput({ minimum_total_quantity: "   " })).minimum_total_quantity, null);
});

test("Issue 310: 2 and 99 are accepted at both ends of the range", () => {
  assert.equal(validate(catalogInput({ minimum_total_quantity: 2 })).minimum_total_quantity, 2);
  assert.equal(validate(catalogInput({ minimum_total_quantity: "2" })).minimum_total_quantity, 2);
  assert.equal(validate(catalogInput({ minimum_total_quantity: 99 })).minimum_total_quantity, 99);
  assert.equal(validate(catalogInput({ minimum_total_quantity: 7 })).minimum_total_quantity, 7);
  assert.equal(MIN_COMPOSITE_PACKAGE_MINIMUM, 2);
  assert.equal(MAX_COMPOSITE_PACKAGE_QUANTITY, 99);
});

test("Issue 310: 1, 0, negative, decimal, text and >99 are rejected", () => {
  for (const bad of [1, 0, -1, -5, 1.5, "2.5", 100, 999, "abc", "2x", "  1 ", true, {}, []]) {
    assert.throws(
      () => validate(catalogInput({ minimum_total_quantity: bad })),
      (error) => error.code === "INVALID_MINIMUM_TOTAL_QUANTITY",
      `minimum_total_quantity=${JSON.stringify(bad)} must be rejected`
    );
  }
});

test("Issue 310: editing an unrelated field preserves the stored minimum", () => {
  const before = validate(catalogInput({ minimum_total_quantity: 3, short_description: "before" }));
  const after = validate(catalogInput({ minimum_total_quantity: before.minimum_total_quantity, short_description: "after" }));
  assert.equal(after.minimum_total_quantity, 3);
  assert.equal(after.short_description, "after");
  // and an unrelated edit on a bundle that never had a minimum keeps it null
  assert.equal(validate(catalogInput({ short_description: "after" })).minimum_total_quantity, null);
});

test("Issue 310: the catalog service persists and re-reads the column under one external name", () => {
  const source = read("server/services/packages/storeServicePackageCatalogService.js");
  assert.match(source, /service_package_minimum_total_quantity\)\s*\n\s*VALUES/);
  assert.match(source, /service_package_minimum_total_quantity=\$22/);
  assert.match(source, /minimum_total_quantity: row\.service_package_minimum_total_quantity == null/);
  assert.match(source, /minimum_total_quantity: booking\.minimumTotalQuantity \?\? null/);
  // the authoritative read carries the column into the resolver
  assert.match(read("server/services/packages/servicePackageRepository.js"), /ci\.service_package_minimum_total_quantity/);
});

// ---------------------------------------------------------------------------
// 3) Authoritative resolver behaviour
// ---------------------------------------------------------------------------

test("Issue 310: with no configured minimum, a single machine still books exactly as before", async () => {
  const result = await resolve(null, [{ package_key: "small", btu: 12000, quantity: 1 }]);
  assert.equal(result.fixedTotal, "699.00");
  assert.equal(result.payload.machine_count, 1);
  assert.equal(result.minimumTotalQuantity, null);
  assert.equal(result.items[0].snapshot.minimum_total_quantity, null);
});

test("Issue 310: minimum 2 rejects a total of 1 before any booking mutation", async () => {
  await assert.rejects(
    resolve(2, [{ package_key: "small", btu: 12000, quantity: 1 }]),
    (error) => error.code === "SERVICE_PACKAGE_MINIMUM_QUANTITY_NOT_MET" && error.statusCode === 400
  );
});

test("Issue 310: minimum 2 allows one group of 2", async () => {
  const result = await resolve(2, [{ package_key: "small", btu: 12000, quantity: 2 }]);
  assert.equal(result.fixedTotal, "1399.00");
  assert.equal(result.payload.machine_count, 2);
  assert.equal(result.minimumTotalQuantity, 2);
});

test("Issue 310: minimum 2 allows a mixed 1+1 across different BTU variants and still prices each group by its own tiers", async () => {
  const result = await resolve(2, [
    { package_key: "small", btu: 12000, quantity: 1 },
    { package_key: "large", btu: 18000, quantity: 1 },
  ]);
  // 699.00 (small tier q1) + 899.00 (large tier q1) - tier composition is untouched.
  assert.equal(result.fixedTotal, "1598.00");
  assert.equal(result.payload.machine_count, 2);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].snapshot.tier.key, "q1");
  assert.equal(result.items[1].snapshot.tier.key, "q1");
});

test("Issue 310: the minimum is parent-level, never per group", async () => {
  // Three groups of 1 satisfy minimum 3 even though no single group reaches it.
  const result = await resolve(3, [
    { package_key: "small", btu: 9000, quantity: 1 },
    { package_key: "small", btu: 12000, quantity: 1 },
    { package_key: "large", btu: 18000, quantity: 1 },
  ]);
  assert.equal(result.payload.machine_count, 3);
  // ...and a per-group reading would have wrongly accepted this one.
  await assert.rejects(
    resolve(3, [
      { package_key: "small", btu: 12000, quantity: 1 },
      { package_key: "large", btu: 18000, quantity: 1 },
    ]),
    (error) => error.code === "SERVICE_PACKAGE_MINIMUM_QUANTITY_NOT_MET"
  );
  assert.equal(totalGroupQuantity([{ quantity: 1 }, { quantity: 2 }, { quantity: 4 }]), 7);
  assert.equal(totalGroupQuantity(null), 0);
});

test("Issue 310: a client-sent minimum can never relax or invent the rule", async () => {
  const repository = repositoryFor(4);
  // A stale/direct client claiming minimum_total_quantity: 1 is still rejected.
  await assert.rejects(
    resolveCompositeBooking({
      body: {
        service_package_groups: [{ package_key: "small", btu: 12000, quantity: 2 }],
        minimum_total_quantity: 1,
        service_package_minimum_total_quantity: 1,
      },
      bookingMode: "scheduled", appointmentDatetime: "2026-08-25T03:00:00.000Z",
      repository, db: {}, now: () => new Date("2026-08-20T00:00:00.000Z"),
    }),
    (error) => error.code === "SERVICE_PACKAGE_MINIMUM_QUANTITY_NOT_MET"
  );
  // A client claiming a minimum on a parent that has none cannot block a booking.
  const unrestricted = await resolveCompositeBooking({
    body: {
      service_package_groups: [{ package_key: "small", btu: 12000, quantity: 1 }],
      minimum_total_quantity: 9,
    },
    bookingMode: "scheduled", appointmentDatetime: "2026-08-25T03:00:00.000Z",
    repository: repositoryFor(null), db: {}, now: () => new Date("2026-08-20T00:00:00.000Z"),
  });
  assert.equal(unrestricted.minimumTotalQuantity, null);
});

test("Issue 310: a malformed stored minimum is treated as no minimum, never as a number", () => {
  assert.equal(bundleMinimumTotalQuantity({ service_package_minimum_total_quantity: null }), null);
  assert.equal(bundleMinimumTotalQuantity({ service_package_minimum_total_quantity: "" }), null);
  assert.equal(bundleMinimumTotalQuantity({ service_package_minimum_total_quantity: "abc" }), null);
  assert.equal(bundleMinimumTotalQuantity({ service_package_minimum_total_quantity: 1 }), null);
  assert.equal(bundleMinimumTotalQuantity({ service_package_minimum_total_quantity: 0 }), null);
  assert.equal(bundleMinimumTotalQuantity({ service_package_minimum_total_quantity: 100 }), null);
  assert.equal(bundleMinimumTotalQuantity({ service_package_minimum_total_quantity: 2.5 }), null);
  assert.equal(bundleMinimumTotalQuantity({}), null);
  assert.equal(bundleMinimumTotalQuantity(null), null);
  // real values survive as numbers, including string-typed BIGINT/NUMERIC reads
  assert.equal(bundleMinimumTotalQuantity({ service_package_minimum_total_quantity: 2 }), 2);
  assert.equal(bundleMinimumTotalQuantity({ service_package_minimum_total_quantity: "3" }), 3);
  assert.equal(bundleMinimumTotalQuantity({ service_package_minimum_total_quantity: 99 }), 99);
});

test("Issue 310: the existing maximum of 99 and every other package rule are unchanged", async () => {
  // over-max is still rejected by the pre-existing selection guard, not the new rule
  await assert.rejects(
    resolve(2, [{ package_key: "small", btu: 12000, quantity: 100 }]),
    (error) => error.code === "INVALID_PACKAGE_SELECTION"
  );
  await assert.rejects(
    resolve(2, [
      { package_key: "small", btu: 12000, quantity: 50 },
      { package_key: "large", btu: 18000, quantity: 50 },
    ]),
    (error) => error.code === "INVALID_PACKAGE_SELECTION"
  );
  // BTU constraints still win over the minimum
  await assert.rejects(
    resolve(2, [{ package_key: "small", btu: 24000, quantity: 4 }]),
    (error) => error.code === "PACKAGE_BTU_MISMATCH"
  );
});

// ---------------------------------------------------------------------------
// 4) Customer scheduled + urgent, Admin on behalf, replay
// ---------------------------------------------------------------------------

test("Issue 310: the same rule applies to scheduled and urgent, for customer and Admin identity", async () => {
  for (const bookingMode of ["scheduled", "urgent"]) {
    for (const identity of ["customer", "admin"]) {
      await assert.rejects(
        resolve(2, [{ package_key: "small", btu: 12000, quantity: 1 }], { bookingMode, identity }),
        (error) => error.code === "SERVICE_PACKAGE_MINIMUM_QUANTITY_NOT_MET" && error.statusCode === 400,
        `${bookingMode}/${identity} must enforce the minimum`
      );
      const ok = await resolve(2, [{ package_key: "small", btu: 12000, quantity: 2 }], { bookingMode, identity });
      assert.equal(ok.payload.machine_count, 2);
    }
  }
});

test("Issue 310: the customer quote endpoint returns a sanitized 400 and never leaks internals", async () => {
  const service = createCustomerCatalogQuoteService({
    pool: { query: async () => ({ rows: [] }) },
    createServicePackageResolver: () => createServicePackageResolver({
      db: { query: async () => ({ rows: [] }) },
      packageRepository: repositoryFor(2),
      now: () => new Date("2026-08-20T00:00:00.000Z"),
    }),
    computeDurationMinMulti: () => 45,
  });
  const captured = {};
  const res = {
    set() { return res; },
    status(code) { captured.status = code; return res; },
    json(body) { captured.body = body; return res; },
  };
  await service.handle({ body: {
    catalog_item_id: 51, booking_mode: "scheduled",
    service_package_groups: [{ package_key: "small", btu: 12000, quantity: 1 }],
  } }, res);
  assert.equal(captured.status, 400);
  assert.deepEqual(captured.body, {
    error: "SERVICE_PACKAGE_MINIMUM_QUANTITY_NOT_MET",
    code: "SERVICE_PACKAGE_MINIMUM_QUANTITY_NOT_MET",
  });
  assert.equal(Object.keys(captured.body).length, 2, "the error DTO must stay code-only");
});

test("Issue 310: a satisfying customer quote reports the authoritative minimum", async () => {
  const service = createCustomerCatalogQuoteService({
    pool: { query: async () => ({ rows: [] }) },
    createServicePackageResolver: () => createServicePackageResolver({
      db: { query: async () => ({ rows: [] }) },
      packageRepository: repositoryFor(2),
      now: () => new Date("2026-08-20T00:00:00.000Z"),
    }),
    computeDurationMinMulti: () => 45,
  });
  const quote = await service.quote({
    catalog_item_id: 51, booking_mode: "scheduled",
    appointment_datetime: "2026-08-25T03:00:00.000Z",
    service_package_groups: [
      { package_key: "small", btu: 12000, quantity: 1 },
      { package_key: "large", btu: 18000, quantity: 1 },
    ],
  });
  assert.equal(quote.minimum_total_quantity, 2);
  assert.equal(quote.machine_count, 2);
  assert.equal(quote.fixed_total_price, "1598.00");
});

test("Issue 310: idempotent replay cannot become a bypass, and pre-Issue-310 snapshots stay replayable", () => {
  const snapshotFor = (packageId, tierId, btu, quantity, price, minimum) => ({
    service_package_id: packageId, service_package_tier_id: tierId,
    service_package_snapshot: {
      schema_version: 2, catalog_item: { id: "51", key: "parent", name: "Parent" },
      package: { id: packageId, key: btu === 12000 ? "small" : "large", name: "P" },
      tier: { id: tierId, key: `q${quantity}`, name: `${quantity} units` },
      taxonomy: { service_key: "wash", service_name: "Wash", job_type: "wash", ac_type: "wall", wash_variant: "premium", selected_btu: btu },
      quantity, unit_duration_minutes: 45, fixed_total_price: price,
      ...(minimum === undefined ? {} : { minimum_total_quantity: minimum }),
    },
  });

  // replaying the exact booking that satisfied minimum 2 still works
  const compliant = [snapshotFor("11", "2", 12000, 2, "1399.00", 2)];
  const body = { service_package_groups: [{ package_key: "small", btu: 12000, quantity: 2 }] };
  assert.equal(compositeBookingFromSnapshots({ body, snapshots: compliant }).fixedTotal, "1399.00");

  // a snapshot set whose total falls below its own recorded minimum is refused
  const underMinimum = [snapshotFor("11", "1", 12000, 1, "699.00", 2)];
  assert.equal(compositeBookingFromSnapshots({
    body: { service_package_groups: [{ package_key: "small", btu: 12000, quantity: 1 }] },
    snapshots: underMinimum,
  }), null);

  // snapshots written before Issue 310 carry no minimum and replay unchanged
  const legacy = [snapshotFor("11", "1", 12000, 1, "699.00", undefined)];
  const legacyReplay = compositeBookingFromSnapshots({
    body: { service_package_groups: [{ package_key: "small", btu: 12000, quantity: 1 }] },
    snapshots: legacy,
  });
  assert.equal(legacyReplay.fixedTotal, "699.00");
});

test("Issue 310: the booked minimum is recorded in the component snapshot without a schema bump", async () => {
  const result = await resolve(2, [{ package_key: "small", btu: 12000, quantity: 2 }]);
  assert.equal(result.items[0].snapshot.schema_version, 2, "old readers must keep accepting these snapshots");
  assert.equal(result.items[0].snapshot.minimum_total_quantity, 2);
});

// ---------------------------------------------------------------------------
// 5) Public DTO
// ---------------------------------------------------------------------------

test("Issue 310: the public catalog DTO exposes the minimum only for bundles that have one", () => {
  const bundle = (extra) => catalogRoutes.serializeCatalogRow({
    item_id: 1, item_name: "TEST bundle", item_category: "service", booking_mode: "contact_admin",
    service_bundle_key: "test-bundle", service_package_variants: [], is_active: true,
    is_customer_visible: true, highlights: [], images: [], ...extra,
  });
  assert.equal(bundle({ service_package_minimum_total_quantity: 2 }).minimum_total_quantity, 2);
  assert.equal(bundle({ service_package_minimum_total_quantity: "3" }).minimum_total_quantity, 3);
  assert.equal(bundle({}).minimum_total_quantity, null);
  assert.equal(bundle({ service_package_minimum_total_quantity: null }).minimum_total_quantity, null);
  // a non-bundle catalog item never carries a minimum
  const ordinary = catalogRoutes.serializeCatalogRow({
    item_id: 2, item_name: "TEST ordinary", item_category: "service", booking_mode: "bookable",
    service_package_minimum_total_quantity: 5, is_active: true, is_customer_visible: true,
    highlights: [], images: [],
  });
  assert.equal(ordinary.minimum_total_quantity, null);
});

test("Issue 310: the public storefront read degrades safely before the migration is applied", () => {
  const source = read("server/routes/catalog/items.js");
  assert.match(source, /column_name='service_package_minimum_total_quantity'/);
  assert.match(source, /const minimumColumn = Number\(minimumReady\.rows\?\.\[0\]\?\.cnt \|\| 0\) === 1/);
  assert.match(source, /\$\{minimumColumn\}/);
});

test("Issue 310: the authoritative booking read fails closed, never silently unrestricted", async () => {
  const repository = require("../server/services/packages/servicePackageRepository");

  // happy path still selects the column and returns rows
  const rows = await repository.findLinkedPackagesByKeys(
    { query: async (sql) => ({ rows: [{ selectsMinimum: sql.includes("ci.service_package_minimum_total_quantity") }] }) },
    ["k"]
  );
  assert.equal(rows[0].selectsMinimum, true);

  // a missing column must NOT degrade to "no minimum" - it must fail closed with
  // a code that names the migration to apply
  const missing = Object.assign(new Error("column ci.service_package_minimum_total_quantity does not exist"), { code: "42703" });
  await assert.rejects(
    repository.findLinkedPackagesByKeys({ query: async () => { throw missing; } }, ["k"]),
    (error) => error.code === "SERVICE_PACKAGE_SCHEMA_NOT_READY"
      && error.statusCode === 503
      && /20260820_service_package_minimum_total_quantity\.sql/.test(error.detail)
      && error.cause === missing
  );

  // unrelated failures are rethrown untouched, so this guard cannot mask them
  const otherColumn = Object.assign(new Error("column ci.some_other_column does not exist"), { code: "42703" });
  await assert.rejects(repository.findLinkedPackagesByKeys({ query: async () => { throw otherColumn; } }, ["k"]), (e) => e === otherColumn);
  const connection = Object.assign(new Error("connection reset"), { code: "ECONNRESET" });
  await assert.rejects(repository.findLinkedPackagesByKeys({ query: async () => { throw connection; } }, ["k"]), (e) => e === connection);
});

test("Issue 310: a 503 schema failure stays generic to the customer while staying specific in logs", async () => {
  // customerCatalogQuote maps any non-4xx to CATALOG_QUOTE_UNAVAILABLE, so the
  // operator-facing code never reaches the storefront.
  const source = read("server/services/booking/customerCatalogQuote.js");
  assert.match(source, /const safeStatus = status >= 400 && status < 500 \? status : 503/);
  assert.match(source, /safeStatus === 503 \? "CATALOG_QUOTE_UNAVAILABLE"/);
});

test("Issue 310: the new migration is registered for the deploy gate by exact SHA", () => {
  const name = "20260820_service_package_minimum_total_quantity.sql";
  const sha = crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, `migrations/${name}`))).digest("hex");
  const entries = read("migrations/.deploy-approved.tsv").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  assert.ok(entries.includes(`${sha}\t${name}\texpand`), "the forward migration must be approved in the expand lane by its exact content hash");
  // approving it must not drop or alter the Issue 267 approval
  assert.ok(entries.some((line) => line.endsWith("20260809_store_service_package_bundles.sql\texpand")));
  assert.equal(entries.length, 2);
});

// ---------------------------------------------------------------------------
// 6) UI contracts - Admin Store, Customer app, Admin Add Job (all Thai)
// ---------------------------------------------------------------------------

test("Issue 310: the Admin Store editor field is Thai, optional, and 2-99", () => {
  const js = read("admin-store-catalog.js");
  assert.match(js, /จำนวนเครื่องขั้นต่ำต่อการจอง/);
  assert.match(js, /id="bm_minimum_total_quantity"[^>]*type="number"[^>]*min="2"[^>]*max="99"[^>]*step="1"/);
  assert.match(js, /placeholder="ไม่กำหนดขั้นต่ำ"/);
  assert.match(js, /รวมทุกขนาด BTU ในการจองเดียวกัน/);
  // load: NULL must render blank, never 2
  assert.match(js, /bundle\?\.minimum_total_quantity == null \? "" : String\(bundle\.minimum_total_quantity\)/);
  // save: blank -> null, otherwise a validated 2-99
  assert.match(js, /minimum_total_quantity: bundleMinimumTotalQuantityValue\(\)/);
  assert.match(js, /if \(!raw\) return null;/);
  assert.match(js, /จำนวนเครื่องขั้นต่ำต้องเป็นเลขจำนวนเต็ม 2 ถึง 99/);
  assert.match(js, /จำนวนเครื่องขั้นต่ำต้องอยู่ระหว่าง 2 ถึง 99/);
  // typed text in a number input reads back as "", so badInput is the only way
  // to tell "garbage" from "cleared on purpose" and must raise its own Thai error
  assert.match(js, /field\.validity && field\.validity\.badInput/);
  assert.match(js, /จำนวนเครื่องขั้นต่ำต้องเป็นตัวเลขเท่านั้น/);
});

test("Issue 310: the customer bundle sheet shows Thai minimum and live progress, and blocks below it", () => {
  const js = read("customer-app/modules/store.js");
  assert.match(js, /โปรนี้จองขั้นต่ำ \$\{minimum\} เครื่อง/);
  assert.match(js, /นับรวมทุกขนาด BTU ในการจองเดียวกัน/);
  assert.match(js, /เลือกแล้ว \$\{machineCount\} จากขั้นต่ำ \$\{minimumTotalQuantity\} เครื่อง/);
  assert.match(js, /ครบขั้นต่ำ \$\{minimumTotalQuantity\} เครื่องแล้ว/);
  // blocking: no quote and a disabled confirm below the minimum
  assert.match(js, /if \(minimumTotalQuantity && machineCount < minimumTotalQuantity\) \{/);
  assert.match(js, /กรุณาเพิ่มจำนวนให้ครบขั้นต่ำ/);
  assert.match(js, /if \(confirm\) confirm\.disabled = true;\s*\n\s*return;/);
  // confirm re-checks the total, so a stale enabled button cannot slip through
  assert.match(js, /const confirmedTotal = result\.groups\.reduce/);
  assert.match(js, /if \(minimumTotalQuantity && confirmedTotal < minimumTotalQuantity\) \{ refreshQuote\(\); return; \}/);
  // null minimum renders no notice, no progress row and no restriction
  assert.match(js, /const minimumNotice = minimum\s*\n\s*\? `<p class="store-bundle-minimum"/);
  assert.match(js, /: "";/);
  assert.match(js, /\$\{minimum \? `<div data-bundle-minimum-row>/);
  // plus/minus and typed input behaviour is untouched
  assert.match(js, /data-bundle-dec/);
  assert.match(js, /data-bundle-inc/);
  assert.match(js, /clampBundleQuantity\(input\.value, button\.hasAttribute\("data-bundle-inc"\) \? 1 : -1\)/);
  assert.match(js, /function parseBundleQuantity/);
  assert.match(read("customer-app/assets/customer-app.css"), /\.store-bundle-minimum \{/);
});

test("Issue 310: the customer minimum helper only trusts a usable 2-99 integer", () => {
  const js = read("customer-app/modules/store.js");
  const helper = js.slice(js.indexOf("function bundleMinimumTotalQuantity(item)"), js.indexOf("function renderBundleConfigurator"));
  assert.match(helper, /if \(raw == null \|\| raw === ""\) return null;/);
  assert.match(helper, /if \(!Number\.isSafeInteger\(value\) \|\| value < 2 \|\| value > 99\) return null;/);
  // exposed on the module's existing _test surface so mobile QA can drive the
  // real sheet instead of a copy of it
  assert.match(js, /bundleMinimumTotalQuantity, openBundleConfigurator,/);
});

test("Issue 310: Admin Add Job stays Thai and blocks a below-minimum Store bundle", () => {
  const js = read("admin-add-v2.js");
  assert.match(js, /function selectedBundleMinimumTotalQuantity\(\)/);
  assert.match(js, /function selectedBundleTotalQuantity\(\)/);
  assert.match(js, /function renderServiceBundleMinimum\(\)/);
  assert.match(js, /โปรนี้จองขั้นต่ำ \$\{minimum\} เครื่อง • เลือกแล้ว \$\{total\} จากขั้นต่ำ \$\{minimum\} เครื่อง \(นับรวมทุกขนาด BTU ในการจองเดียวกัน\)/);
  assert.match(js, /ครบขั้นต่ำแล้ว/);
  assert.match(js, /ยังจองไม่ได้ • โปรนี้จองขั้นต่ำ \$\{minimumTotalQuantity\} เครื่อง/);
  assert.match(js, /โปรนี้จองขั้นต่ำ \$\{minimumTotalQuantity\} เครื่อง กรุณาเพิ่มจำนวนเครื่องรวมทุกขนาด BTU ให้ครบก่อนบันทึกงาน/);
  assert.match(js, /id="store_service_bundle_minimum"/);
  // live update on typing, not only on change
  assert.match(js, /addEventListener\("input", renderServiceBundleMinimum\)/);
  // the save button stays locked while below the minimum
  assert.match(js, /const blocked = el\("btnSubmit"\); if \(blocked\) blocked\.disabled = true;/);
  // no English UI regression from PR #308
  for (const english of ["Select at least one quantity", "Loading package price and duration...", "Select tier", "Select actual BTU"]) {
    assert.equal(js.includes(english), false, `PR #308 Thai UI regressed: ${english}`);
  }
});

test("Issue 310: manual Admin Add flows and the PR #308 technician picker are untouched", () => {
  const js = read("admin-add-v2.js");
  // manual/ordinary/legacy package paths still exist
  assert.match(js, /function previewServicePackage\(\)|async function previewServicePackage\(\)/);
  assert.match(js, /store_bookable_item_id/);
  assert.match(js, /service_package_key/);
  // PR #308 slot picker contract
  assert.match(js, /function buildSlotTechnicianList\(ids, query, displayFn\)/);
  assert.match(js, /id="slotm_tech_search"/);
  assert.doesNotMatch(js.slice(js.indexOf("function renderTeamPicker("), js.indexOf("function getTeamListForAssign(")), /\.slice\(\s*0\s*,\s*\d+\s*\)/);
  // idempotency + assignment contract
  assert.match(js, /admin_request_key/);
  assert.match(js, /assign_mode:/);
  assert.match(js, /team_members:/);
});

// ---------------------------------------------------------------------------
// 7) Cache/build contract
// ---------------------------------------------------------------------------

test("Issue 310: exactly the changed runtime assets get the new build id", () => {
  const BUILD = "20260820_issue310_package_minimum_quantity_v1";
  // Admin runtimes changed in Issue 310 and have not changed since, so their ids
  // stay pinned to that exact release.
  assert.match(read("admin-add-v2.html"), new RegExp(`admin-add-v2\\.js\\?v=${BUILD}`));
  assert.match(read("admin-store-catalog.html"), new RegExp(`admin-store-catalog\\.js\\?v=${BUILD}`));

  // The Customer App ships ONE shared build id across sw.js, index.html, the
  // bootstrap and the manifest. Pinning the literal here would go stale on the
  // next customer release and leave this guard permanently red (exactly the
  // failure mode Issue 314 had to repair), so assert the invariant instead:
  // every customer asset reference moves together, and never lags Issue 310.
  const swBuild = /BUILD_ID = "([^"]+)"/.exec(read("customer-app/sw.js"))?.[1];
  assert.ok(swBuild, "customer-app/sw.js must declare a BUILD_ID");
  assert.equal(/BUILD_ID = "([^"]+)"/.exec(read("customer-app/assets/customer-app.js"))?.[1], swBuild);
  assert.match(read("customer-app/index.html"), new RegExp(`modules/store\\.js\\?v=${swBuild}`));
  assert.match(read("customer-app/index.html"), new RegExp(`assets/customer-app\\.css\\?v=${swBuild}`));
  assert.match(read("customer-app/manifest.webmanifest"), new RegExp(swBuild));
  const stale = [...read("customer-app/index.html").matchAll(/\?v=([^"']+)/g)].map((m) => m[1]).filter((id) => id !== swBuild);
  assert.deepEqual(stale, [], `every customer asset must carry the same build id, found stragglers: ${stale.join(", ")}`);
  assert.ok(swBuild >= BUILD, `the customer build must not regress behind Issue 310: ${swBuild}`);
  // admin-store-catalog.css did not change in this issue, so its id must not move
  assert.match(read("admin-store-catalog.html"), /admin-store-catalog\.css\?v=20260809_issue267_merchandising_v3/);
  // no debug markers were shipped with the bump
  assert.doesNotMatch(read("admin-add-v2.html"), /issue310[_-]debug/i);
});
