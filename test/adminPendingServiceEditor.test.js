"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createAdminPendingServiceEditor,
  normalizeServiceInput,
  canonicalItemName,
  revisionForRows,
} = require("../server/services/booking/adminPendingServiceEditor");
const { registerPendingBookingServiceEditorRoutes } = require("../server/routes/admin/pendingBookingServiceEditor");
const { parseCanonicalServiceItem } = require("../server/services/booking/bookingJobUnits");
const ui = require("../admin-review-service-editor");

function responseHarness() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return body; },
  };
}

test("structured service input produces the canonical technician item label", () => {
  const service = normalizeServiceInput({
    job_item_id: 42,
    job_type: "ล้าง",
    ac_type: "ผนัง",
    wash_variant: "premium",
    btu: 12000,
    machine_count: 2,
    unit_price: 699.125,
  });
  assert.equal(service.wash_variant, "ล้างพรีเมียม");
  assert.equal(service.unit_price, 699.13);
  const itemName = canonicalItemName(service);
  assert.equal(itemName, "ล้างแอร์ผนัง • ล้างพรีเมียม • 12,000 BTU • 2 เครื่อง");
  assert.deepEqual(parseCanonicalServiceItem({ item_name: itemName, qty: 2 }), {
    job_type: "ล้าง",
    ac_type: "ผนัง",
    wash_variant: "ล้างพรีเมียม",
    repair_variant: "",
    btu: 12000,
    machine_count: 2,
  });
  assert.throws(() => normalizeServiceInput({ ...service, machine_count: 0 }), /จำนวนเครื่อง/);
});

test("editor summary reacts immediately to quantity and price", () => {
  const totals = ui.summarize([
    ui.normalizeItem({ machine_count: 2, unit_price: 550 }),
    ui.normalizeItem({ machine_count: 1, unit_price: 900 }),
  ], { other_subtotal: 100, discount: 200 });
  assert.deepEqual(totals, {
    rows: 2,
    machines: 3,
    service_subtotal: 2000,
    other_subtotal: 100,
    subtotal: 2100,
    discount: 200,
    total: 1900,
  });
  assert.equal(ui.escapeHtml('<img src=x onerror="alert(1)">'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
});

test("service editor routes are protected by the existing admin session middleware", () => {
  const registrations = [];
  const app = {
    get(route, ...handlers) { registrations.push({ method: "GET", route, handlers }); },
    put(route, ...handlers) { registrations.push({ method: "PUT", route, handlers }); },
  };
  const requireAdminSession = function requireAdminSession() {};
  registerPendingBookingServiceEditorRoutes(app, {
    service: { get() {}, update() {} },
    requireAdminSession,
  });
  assert.deepEqual(registrations.map((row) => [row.method, row.route]), [
    ["GET", "/admin/customer-bookings/:job_id/services"],
    ["PUT", "/admin/customer-bookings/:job_id/services"],
  ]);
  assert.ok(registrations.every((row) => row.handlers[0] === requireAdminSession));
});

test("updating a package service row keeps package identity and snapshot in place", async () => {
  const packageSnapshot = { package: { id: "7", name: "Premium Day" }, tier: { id: "8", name: "1 เครื่อง" } };
  const job = {
    job_id: 615,
    booking_code: "CWFJZQCZTE",
    job_source: "customer",
    booking_mode: "scheduled",
    job_status: "รอตรวจสอบ",
    job_type: "ล้าง",
    duration_min: 80,
    job_price: 699,
  };
  const item = {
    job_item_id: 51,
    item_id: 100,
    item_name: "ล้างแอร์ผนัง • ล้างพรีเมียม • 9,000 BTU • 1 เครื่อง",
    qty: 1,
    unit_price: 699,
    line_total: 699,
    assigned_technician_username: null,
    is_service: true,
    service_package_id: 7,
    service_package_tier_id: 8,
    service_package_snapshot: packageSnapshot,
  };
  const queries = [];
  const client = {
    async query(sql, params = []) {
      const text = String(sql);
      queries.push(text);
      if (/^BEGIN|^COMMIT|^ROLLBACK/.test(text.trim())) return { rows: [] };
      if (/FROM public\.jobs/.test(text) && /WHERE job_id=\$1/.test(text)) return { rows: [{ ...job }] };
      if (/SELECT job_item_id/.test(text) && /FROM public\.job_items/.test(text)) return { rows: [{ ...item }] };
      if (/UPDATE public\.job_items/.test(text)) {
        item.item_name = params[2];
        item.qty = params[3];
        item.unit_price = params[4];
        item.line_total = params[5];
        return { rows: [] };
      }
      if (/SUM\(line_total\)/.test(text)) {
        return { rows: [{ subtotal: item.line_total, service_subtotal: item.line_total, other_subtotal: 0, discount: 0 }] };
      }
      if (/UPDATE public\.jobs/.test(text)) {
        job.job_type = params[1];
        job.duration_min = params[2];
        job.job_price = params[3];
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${text}`);
    },
    release() {},
  };
  let synced = 0;
  let ensured = 0;
  let audited = 0;
  const service = createAdminPendingServiceEditor({
    pool: { async connect() { return client; } },
    syncJobUnitsFromJobItems: async () => { synced += 1; },
    ensureBookingJobUnits: async () => { ensured += 1; },
    jobTiming: { computeServiceDurationMinMulti: () => 130 },
    logJobUpdate: async () => { audited += 1; },
  });
  const req = {
    params: { job_id: "615" },
    auth: { username: "owner" },
    body: {
      revision: revisionForRows([item]),
      items: [{
        job_item_id: 51,
        job_type: "ล้าง",
        ac_type: "ผนัง",
        wash_variant: "ล้างพรีเมียม",
        btu: 18000,
        machine_count: 2,
        unit_price: 699,
      }],
    },
  };
  const res = responseHarness();
  await service.update(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(item.item_name, "ล้างแอร์ผนัง • ล้างพรีเมียม • 18,000 BTU • 2 เครื่อง");
  assert.equal(item.line_total, 1398);
  assert.equal(item.service_package_id, 7);
  assert.deepEqual(item.service_package_snapshot, packageSnapshot);
  assert.equal(job.duration_min, 130);
  assert.equal(synced, 1);
  assert.equal(ensured, 1);
  assert.equal(audited, 1);
  assert.equal(queries.some((sql) => /DELETE FROM public\.job_items/.test(sql)), false);
});
