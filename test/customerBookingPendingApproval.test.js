"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  JOB_STATUS,
  isPendingCustomerScheduledReservation,
  pendingCustomerScheduledReservationSql,
} = require("../server/services/booking/bookingStatuses");
const { registerPublicCustomerAvailabilityRoutes } = require("../server/routes/public/customerAvailability");
const { registerAdminAvailabilityRoutes } = require("../server/routes/admin/adminAvailability");
const { registerBookingApprovalRoutes } = require("../server/routes/admin/bookingApprovals");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

function responseHarness() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return body; },
  };
}

test("pending reservation predicate is exact and does not hide approved/admin jobs", () => {
  assert.equal(isPendingCustomerScheduledReservation({
    job_source: "customer",
    booking_mode: "scheduled",
    job_status: JOB_STATUS.CUSTOMER_SCHEDULED_REVIEW,
  }), true);
  for (const row of [
    { job_source: "admin", booking_mode: "scheduled", job_status: JOB_STATUS.CUSTOMER_SCHEDULED_REVIEW },
    { job_source: "customer", booking_mode: "urgent", job_status: JOB_STATUS.CUSTOMER_SCHEDULED_REVIEW },
    { job_source: "customer", booking_mode: "scheduled", job_status: JOB_STATUS.ADMIN_SCHEDULED_PENDING },
  ]) assert.equal(isPendingCustomerScheduledReservation(row), false);
  assert.equal(
    pendingCustomerScheduledReservationSql("j"),
    `(j.job_source='customer' AND j.booking_mode='scheduled' AND j.job_status='${JOB_STATUS.CUSTOMER_SCHEDULED_REVIEW}')`
  );
});

test("public forced availability is rejected before availability calculation", async () => {
  const registrations = [];
  const app = { get(route, ...handlers) { registrations.push({ route, handlers }); } };
  let engineCalls = 0;
  registerPublicCustomerAvailabilityRoutes(app, {
    engine: {
      computeForcedAvailability: async () => { engineCalls += 1; return {}; },
      computePublicCustomerSlots: async () => { engineCalls += 1; return {}; },
    },
    getDependencies: () => ({}),
    getBangkokTodayYMD: () => "2026-07-19",
  });
  const route = registrations.find((entry) => entry.route === "/public/availability_v2");
  const res = responseHarness();
  await route.handlers.at(-1)({ query: { forced: "1" } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "FORCED_AVAILABILITY_ADMIN_ONLY");
  assert.equal(engineCalls, 0);
});

test("admin availability is session protected and aggregate keeps forced parity", async () => {
  const registrations = [];
  const app = { get(route, ...handlers) { registrations.push({ route, handlers }); } };
  const requireAdminSession = function requireAdminSession() {};
  const calls = [];
  registerAdminAvailabilityRoutes(app, {
    requireAdminSession,
    getDependencies: () => ({ marker: true }),
    engine: {
      computeForcedAvailability: async (_deps, options) => { calls.push(["forced", options]); return { slots: [] }; },
      computeAdminAvailabilityByTech: async (_deps, options) => { calls.push(["by-tech", options]); return { technicians: [] }; },
    },
  });
  const route = registrations.find((entry) => entry.route === "/admin/availability_by_tech_v2");
  assert.equal(route.handlers[0], requireAdminSession);
  const res = responseHarness();
  await route.handlers.at(-1)({ query: { aggregate: "1", forced: "1", date: "2026-08-01" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls[0][0], "forced");
  assert.equal(calls[0][1].include_paused, true);
});

test("approval routes use existing admin middleware", () => {
  const registrations = [];
  const app = { post(route, ...handlers) { registrations.push({ route, handlers }); } };
  const requireAdminSession = function requireAdminSession() {};
  const service = { approve() {}, reject() {} };
  registerBookingApprovalRoutes(app, { service, requireAdminSession });
  assert.deepEqual(registrations.map((entry) => entry.route), [
    "/admin/customer-bookings/:job_id/approve",
    "/admin/customer-bookings/:job_id/reject",
  ]);
  assert.ok(registrations.every((entry) => entry.handlers[0] === requireAdminSession));
});

test("technician visibility, ownership, and all audited mutation paths enforce pending isolation", () => {
  const index = read("index.js");
  assert.match(index, /j\.technician_username = \$2 AND NOT \$\{pendingCustomerScheduledReservationSql\("j"\)\}/);
  assert.match(index, /j\.technician_username = ANY\(\$\{aliasParam\}::text\[\]\) AND NOT \$\{pendingCustomerScheduledReservationSql\("j"\)\}/);

  const guardedRoutes = ["travel-start", "checkin", "units/:unit_id/checklist", "finalize", "assignment-done"];
  for (const route of guardedRoutes) assert.match(index, new RegExp(route.replace(/[/:]/g, "\\$&")));
  const checklist = index.slice(index.indexOf('app.put("/jobs/:job_id/units/:unit_id/checklist"'), index.indexOf("async function mediaRetentionRows"));
  assert.ok(checklist.indexOf("assertJobActionableForTechnician") < checklist.indexOf("INSERT INTO public.job_unit_checklists"));
  const assignmentDone = index.slice(index.indexOf('app.post("/jobs/:job_id/assignment-done"'), index.indexOf("async function expireTechnicianAcceptStatuses"));
  assert.ok(assignmentDone.indexOf("assertJobActionableForTechnician") < assignmentDone.indexOf("INSERT INTO public.job_assignments"));

  for (const route of ["photos/meta", "photos/:photo_id/upload"]) {
    const start = index.indexOf(route);
    const section = index.slice(start, start + 5000);
    assert.match(section, /assertJobActionableForTechnician/);
  }
});

test("Admin Add and Queue no longer call public forced availability", () => {
  for (const file of ["admin-add-v2.js", "admin-queue-v2.js"]) {
    const source = read(file);
    assert.doesNotMatch(source, /public\/availability_v2[^\n]*forced=1/);
    assert.match(source, /admin\/availability_by_tech_v2/);
  }
});

test("changed Admin booking scripts have one shared cache-bust build", () => {
  const build = "20260719_customer_booking_pr3_v1";
  for (const page of ["admin-add-v2", "admin-queue-v2", "admin-review-v2"]) {
    assert.match(read(`${page}.html`), new RegExp(`${page}\\.js\\?v=${build}`));
  }
});
