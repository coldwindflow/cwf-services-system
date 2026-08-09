"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  packageRequest,
  canonicalizeSelection,
  resolvePackageBooking,
  packageBookingFromSnapshot,
} = require("../server/services/booking/servicePackageBooking");
const { createBookingJobService } = require("../server/services/booking/createBookingJob");
const adminIdempotency = require("../server/services/booking/adminBookingIdempotency");

function responseHarness() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = Number(code); return this; },
    json(payload) { this.body = payload; return payload; },
  };
}

async function invoke(handler, requestBody) {
  const res = responseHarness();
  await handler({ body: requestBody }, res);
  return res;
}

function bookingService(overrides = {}) {
  const emptyClient = {
    async query() { return { rows: [] }; },
    release() {},
  };
  return createBookingJobService({
    pool: { async connect() { return emptyClient; } },
    isServiceZoneFilterEnabled: () => false,
    isCustomerScheduledBookingEnabled: () => true,
    genToken: () => "test-booking-token",
    createServicePackageResolver: () => ({
      async resolveSelection() {
        const error = new Error("resolver reached");
        error.code = "PACKAGE_NOT_ON_SALE";
        throw error;
      },
    }),
    ...overrides,
  });
}

function scheduledRequest(overrides = {}) {
  return {
    customer_name: "Package customer",
    appointment_datetime: "2026-12-01T09:00:00+07:00",
    address_text: "Bangkok",
    booking_mode: "scheduled",
    scheduled_request_key: "package-gate-test-0001",
    ...overrides,
  };
}

function selection(overrides = {}) {
  const base = {
    package: { id: "41", key: "premium-day", name: "Premium Day" },
    tier: { id: "73", key: "two-units", name: "2 units" },
    service_lines: [{
      service_key: "wall-premium-small",
      service_name: "Premium wall wash",
      quantity: 2,
      unit_duration_minutes: 45,
      service_constraints: {
        job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างพรีเมียม", btu_min: null, btu_max: 12000,
      },
    }],
    fixed_total_price: "1399.50",
    redeem_until: "2026-12-31T16:59:59.000Z",
  };
  const value = { ...base, ...overrides };
  value.snapshot = structuredClone(value);
  return value;
}

function body(overrides = {}) {
  return {
    service_package_key: "premium-day",
    service_package_tier_key: "two-units",
    btu: 12000,
    price: 1,
    standard_price: 2,
    machine_count: 99,
    duration_min: 1,
    job_type: "ซ่อม",
    ac_type: "แขวน",
    wash_variant: "ล้างธรรมดา",
    ...overrides,
  };
}

test("no package keys preserves the ordinary booking branch", () => {
  assert.equal(packageRequest({}), null);
});

test("Admin ordinary validation remains callable while package requests use the shared resolver", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../server/services/booking/createBookingJob.js"), "utf8");
  const adminStart = source.indexOf("async function handleAdminBookV2");
  const adminEnd = source.indexOf("\n  async function ", adminStart + 1);
  const adminSource = source.slice(adminStart, adminEnd);
  assert.match(adminSource, /hasPackageRequest/);
  assert.match(adminSource, /identity: Array\.isArray\(body\.service_package_groups\) \? "customer" : "admin"/);

  const result = await invoke(bookingService().handleAdminBookV2, scheduledRequest());
  assert.equal(result.statusCode, 400);
  assert.ok(result.body?.error);
});

test("public scheduled package without client job_type reaches package resolution", async () => {
  const result = await invoke(bookingService().handlePublicBook, scheduledRequest({
    service_package_key: "premium-day",
    service_package_tier_key: "two-units",
    btu: 12000,
  }));
  assert.equal(result.statusCode, 409);
  assert.deepEqual(result.body, { error: "PACKAGE_NOT_ON_SALE", code: "PACKAGE_NOT_ON_SALE" });
});

test("ordinary scheduled booking without job_type keeps existing required-field rejection", async () => {
  const result = await invoke(bookingService().handlePublicBook, scheduledRequest());
  assert.equal(result.statusCode, 400);
  assert.ok(result.body?.error);
});

test("partial package identity with no job_type fails safely before mutation", async () => {
  let poolCalls = 0;
  const result = await invoke(bookingService({
    pool: { query() { poolCalls += 1; throw new Error("unexpected mutation"); } },
  }).handlePublicBook, scheduledRequest({ service_package_key: "premium-day" }));
  assert.equal(result.statusCode, 400);
  assert.deepEqual(result.body, { error: "PACKAGE_IDENTITY_MALFORMED", code: "PACKAGE_IDENTITY_MALFORMED" });
  assert.equal(poolCalls, 0);
});

test("package keys are paired and public numeric identities are rejected", () => {
  for (const value of [
    { service_package_key: "premium-day" },
    { service_package_tier_key: "two-units" },
    { service_package_key: "", service_package_tier_key: "" },
    { service_package_id: 41 },
    { service_package_key: "premium-day", service_package_tier_key: "two-units", service_package_tier_id: 73 },
  ]) {
    assert.throws(() => packageRequest(value), { code: "PACKAGE_IDENTITY_MALFORMED", statusCode: 400 });
  }
});

test("resolver authority replaces fake service, quantity, duration, and exact fixed total", () => {
  const result = canonicalizeSelection(selection(), body(), "2026-12-01T09:00:00+07:00");
  assert.deepEqual(result.payload, {
    job_type: "ล้าง", ac_type: "ผนัง", btu: 12000, machine_count: 2,
    wash_variant: "ล้างพรีเมียม", repair_variant: "", admin_override_duration_min: 0,
  });
  assert.equal(result.durationMin, 90);
  assert.equal(result.fixedTotal, "1399.50");
  assert.equal(result.item.qty, 2);
  assert.equal(result.item.unit_price, "699.75");
  assert.equal(result.item.line_total, "1399.50");
  const allocatedMinor = BigInt(result.item.unit_price.replace(".", "")) * BigInt(result.item.qty);
  assert.equal(allocatedMinor, BigInt(result.item.line_total.replace(".", "")));
  assert.equal(result.item.customer_price_source, "service_package");
  assert.match(result.item.item_name, /ล้างพรีเมียม/);
  assert.deepEqual(result.snapshot, selection().snapshot);
});

test("awkward package division uses deterministic DB-scale allocation and preserves exact total", () => {
  const awkward = selection();
  awkward.service_lines[0].quantity = 4;
  awkward.snapshot = structuredClone(awkward);

  const result = canonicalizeSelection(awkward, body(), "2026-12-01T09:00:00+07:00");

  assert.equal(result.item.qty, 4);
  assert.equal(result.item.unit_price, "349.88");
  assert.equal(result.item.line_total, "1399.50");
  assert.equal(result.fixedTotal, "1399.50");
  assert.equal(
    canonicalizeSelection(awkward, body(), "2026-12-01T09:00:00+07:00").item.unit_price,
    "349.88"
  );
  assert.equal(BigInt(result.item.line_total.replace(".", "")), 139950n);
});

test("server BTU maximum and minimum constraints accept only their actual ranges", () => {
  assert.doesNotThrow(() => canonicalizeSelection(selection(), body({ btu: 12000 }), "2026-12-01T09:00:00+07:00"));
  assert.throws(() => canonicalizeSelection(selection(), body({ btu: 18000 }), "2026-12-01T09:00:00+07:00"), { code: "PACKAGE_BTU_MISMATCH" });
  const large = selection();
  large.service_lines[0].service_constraints.btu_min = 18000;
  large.service_lines[0].service_constraints.btu_max = null;
  assert.doesNotThrow(() => canonicalizeSelection(large, body({ btu: 18000 }), "2026-12-01T09:00:00+07:00"));
  assert.throws(() => canonicalizeSelection(large, body({ btu: 12000 }), "2026-12-01T09:00:00+07:00"), { code: "PACKAGE_BTU_MISMATCH" });
});

test("sell resolution and redeem eligibility remain distinct", async () => {
  const resolver = { async resolveSelection() { return selection(); } };
  await assert.rejects(
    resolvePackageBooking({ body: body(), bookingMode: "scheduled", appointmentDatetime: "2027-01-01T09:00:00+07:00", resolver }),
    { code: "PACKAGE_REDEEM_WINDOW_EXCEEDED", statusCode: 409 }
  );
  const errorResolver = { async resolveSelection() { const e = new Error("hidden detail"); e.code = "PACKAGE_NOT_ON_SALE"; throw e; } };
  await assert.rejects(
    resolvePackageBooking({ body: body(), bookingMode: "scheduled", appointmentDatetime: "2026-12-01T09:00:00+07:00", resolver: errorResolver }),
    { code: "PACKAGE_NOT_ON_SALE", message: "PACKAGE_NOT_ON_SALE" }
  );
});

test("committed package replay rebuilds from immutable snapshot without current resolver state", () => {
  const historical = selection();
  const replay = packageBookingFromSnapshot({
    body: body(),
    appointmentDatetime: "2026-12-01T09:00:00+07:00",
    snapshot: historical.snapshot,
    packageId: "41",
    tierId: "73",
  });

  assert.equal(replay.packageId, "41");
  assert.equal(replay.tierId, "73");
  assert.equal(replay.fixedTotal, "1399.50");
  assert.equal(replay.item.qty, 2);
  assert.equal(replay.item.unit_price, "699.75");
  assert.equal(replay.item.line_total, "1399.50");
});

test("historical package replay rejects changed package, tier, and BTU material", () => {
  const historical = selection();
  const args = {
    appointmentDatetime: "2026-12-01T09:00:00+07:00",
    snapshot: historical.snapshot,
    packageId: "41",
    tierId: "73",
  };
  assert.equal(packageBookingFromSnapshot({ ...args, body: body({ service_package_key: "other" }) }), null);
  assert.equal(packageBookingFromSnapshot({ ...args, body: body({ service_package_tier_key: "other" }) }), null);
  assert.equal(packageBookingFromSnapshot({ ...args, body: body({ btu: 18000 }) }), null);
});

test("advisory-locked committed package replay bypasses unavailable current resolver and creates nothing", async () => {
  const historical = selection();
  const canonical = canonicalizeSelection(historical.snapshot, body(), "2026-12-01T09:00:00+07:00");
  const request = scheduledRequest({ ...body(), customer_phone: "0812345678" });
  const prior = {
    job_id: "501", booking_code: "CWF501", booking_token: "stored-token",
    dispatch_mode: "normal", duration_min: 90, job_price: "1399.50",
    appointment_datetime: request.appointment_datetime, customer_phone: request.customer_phone,
    customer_name: request.customer_name, address_text: request.address_text,
    maps_url: null, job_zone: null, job_type: canonical.payload.job_type,
    customer_note: null, allow_time_proposal: false, gps_latitude: null, gps_longitude: null,
  };
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (/FROM public\.jobs/.test(sql)) return { rows: [prior] };
      return { rows: [] };
    },
    release() {},
  };
  const replayPool = {
    async connect() { return client; },
    async query(sql) {
      calls.push(sql);
      if (/FROM public\.jobs(?: j)? WHERE (?:j\.)?job_id=\$1/.test(sql)) return { rows: [prior] };
      if (/service_package_snapshot/.test(sql)) return { rows: [{
        service_package_id: "41", service_package_tier_id: "73",
        service_package_snapshot: historical.snapshot,
      }] };
      if (/SELECT 1 FROM public\.job_items/.test(sql)) return { rows: [{ "?column?": 1 }] };
      if (/SELECT item_name, qty, is_service/.test(sql)) return { rows: [{ ...canonical.item, is_service: true }] };
      if (/SELECT item_name, qty, line_total/.test(sql)) return { rows: [canonical.item] };
      throw new Error(`unexpected query: ${sql}`);
    },
  };
  let resolverCalls = 0;
  const service = bookingService({
    pool: replayPool,
    normalizeAppointmentDatetime: (value) => value,
    effectiveBlockMin: (value) => value,
    createServicePackageResolver: () => ({
      async resolveSelection() { resolverCalls += 1; throw Object.assign(new Error("expired"), { code: "PACKAGE_NOT_ON_SALE" }); },
    }),
  });

  const result = await invoke(service.handlePublicBook, request);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.replayed, true);
  assert.equal(result.body.job_id, "501");
  assert.equal(result.body.base_total, 1399.5);
  assert.equal(result.body.base_total_exact, "1399.50");
  assert.equal(result.body.net_total, "1399.50");
  assert.equal(result.body.booking_ticket.booking_code, "CWF501");
  assert.equal(result.body.booking_ticket.exact_total, "1399.50");
  assert.equal(result.body.booking_ticket.total_machine_count, 2);
  assert.doesNotMatch(JSON.stringify(result.body.booking_ticket), /job_id|booking_token|package_id|tier_id|snapshot|address|maps/i);
  assert.equal(resolverCalls, 0);
  assert.ok(calls.some((sql) => /pg_advisory_xact_lock/.test(sql)));
  assert.equal(calls.some((sql) => /\bINSERT\b|\bUPDATE\b|\bDELETE\b/.test(sql)), false);

  const changed = await invoke(service.handlePublicBook, {
    ...request,
    appointment_datetime: "2026-12-02T09:00:00+07:00",
  });
  assert.equal(changed.statusCode, 409);
  assert.equal(changed.body.code, "IDEMPOTENCY_KEY_REUSED");
  assert.equal(resolverCalls, 0);
  assert.equal(calls.some((sql) => /\bINSERT\b|\bUPDATE\b|\bDELETE\b/.test(sql)), false);
});

test("ordinary Store replay uses its persisted fingerprint before a disabled catalog or promotion is resolved", async () => {
  const request = scheduledRequest({ customer_phone: "0812345678", job_type: "wash", ac_type: "wall", btu: 12000,
    wash_variant: "normal", machine_count: 1, catalog_item_id: 77 });
  const prior = { job_id: "777", booking_code: "CWF777", booking_token: "stored", booking_mode: "scheduled",
    dispatch_mode: "normal", duration_min: 45, job_price: "699.00",
    booking_request_fingerprint: adminIdempotency.requestFingerprint(request) };
  const calls = [];
  const client = { async query(sql) { calls.push(sql); return /FROM public\.jobs/.test(sql) ? { rows: [prior] } : { rows: [] }; }, release() {} };
  const pool = {
    async connect() { return client; },
    async query(sql) {
      calls.push(sql);
      if (/FROM public\.jobs j/.test(sql)) return { rows: [{ ...prior, customer_name: "Package customer",
        customer_phone: "0812345678", appointment_datetime: request.appointment_datetime,
        applied_discount: "0.00", job_status: "customer_scheduled_review" }] };
      if (/FROM public\.job_items/.test(sql)) return { rows: [{ item_name: "TEST Store service", qty: 1, is_service: true }] };
      throw new Error(`unexpected query: ${sql}`);
    },
  };
  const service = bookingService({ pool, effectiveBlockMin: (value) => value });
  const replay = await invoke(service.handlePublicBook, request);
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.booking_ticket.exact_total, "699.00");
  assert.equal(replay.body.net_total, "699.00");
  assert.equal(calls.some((sql) => /catalog_items|customer_service_price_rules|promotions_v2/.test(sql)), false);
  assert.equal(calls.some((sql) => /\bINSERT\b|\bUPDATE\b|\bDELETE\b/.test(sql)), false);

  const changed = await invoke(service.handlePublicBook, { ...request, machine_count: 2 });
  assert.equal(changed.statusCode, 409);
  assert.equal(changed.body.code, "IDEMPOTENCY_KEY_REUSED");
});

test("mixed ordinary lines and urgent package booking are rejected", async () => {
  assert.throws(
    () => canonicalizeSelection(selection(), body({ services: [{ job_type: "ล้าง" }] }), "2026-12-01T09:00:00+07:00"),
    { code: "PACKAGE_MIXING_UNSUPPORTED" }
  );
  assert.throws(
    () => canonicalizeSelection(selection(), body({ items: [{ item_id: 1, qty: 1 }] }), "2026-12-01T09:00:00+07:00"),
    { code: "PACKAGE_MIXING_UNSUPPORTED" }
  );
  await assert.rejects(
    resolvePackageBooking({ body: body(), bookingMode: "urgent", appointmentDatetime: "2026-12-01T09:00:00+07:00", resolver: {} }),
    { code: "PACKAGE_URGENT_UNSUPPORTED" }
  );
});

test("booking mutation keeps package linkage, snapshot, price, promotion bypass, and revalidation inside its transaction", () => {
  const source = fs.readFileSync(path.join(__dirname, "../server/services/booking/createBookingJob.js"), "utf8");
  const begin = source.indexOf('await client.query("BEGIN")');
  const revalidate = source.indexOf("resolver: createServicePackageResolver(client)", begin);
  const itemInsert = source.indexOf("service_package_snapshot", revalidate);
  const units = source.indexOf("ensureCanonicalBookingJobUnits(job_id, client)", itemInsert);
  const commit = source.indexOf('await client.query("COMMIT")', units);
  assert.ok(begin >= 0 && revalidate > begin && itemInsert > revalidate && units > itemInsert && commit > units);
  assert.match(source, /const promoPick = packageBooking \|\| catalogBooking \? null : await findBestCustomerPromotion/);
  assert.match(source, /packageBooking \? packageBooking\.fixedTotal : Number\(total \|\| 0\)/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /packageBooking \? packageBooking\.items[\s\S]*?catalogBooking \? \[buildCatalogBookingItem\(catalogBooking\)\]/);
});

test("package replay ordering uses persisted history before current resolution and locked revalidation", () => {
  const source = fs.readFileSync(path.join(__dirname, "../server/services/booking/createBookingJob.js"), "utf8");
  const handler = source.indexOf("async function handlePublicBook");
  const historicalReplay = source.indexOf("historicalPackageBookingForReplay(", handler);
  const currentResolve = source.indexOf("packageBooking = await resolvePackageBooking", handler);
  assert.ok(historicalReplay > handler && historicalReplay < currentResolve);

  const begin = source.indexOf('await client.query("BEGIN")', currentResolve);
  const lockedLookup = source.indexOf('await client.query("SELECT pg_advisory_xact_lock', begin);
  const revalidate = source.indexOf("const revalidatedPackageBooking", begin);
  assert.ok(begin > currentResolve && lockedLookup > begin && revalidate > lockedLookup);
});
