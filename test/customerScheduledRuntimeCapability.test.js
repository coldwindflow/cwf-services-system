"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveScheduledCapability } = require("../server/services/booking/scheduledCapability");
const { createBookingJobService } = require("../server/services/booking/createBookingJob");

test("published page_availability.scheduled is read on every request without ENV or restart", async () => {
  let scheduled = false;
  let reads = 0;
  const pool = {
    async query() {
      reads += 1;
      return { rows: [{ published_config: { page_availability: { scheduled } } }] };
    },
  };

  assert.equal((await resolveScheduledCapability(pool)).enabled, false);
  scheduled = true;
  assert.equal((await resolveScheduledCapability(pool)).enabled, true);
  scheduled = false;
  assert.equal((await resolveScheduledCapability(pool)).enabled, false);
  assert.equal(reads, 3);
});

test("scheduled capability opens only for an explicitly published boolean true", async () => {
  const cases = [
    { label: "true", rows: [{ published_config: { page_availability: { scheduled: true } } }], enabled: true },
    { label: "false", rows: [{ published_config: { page_availability: { scheduled: false } } }], enabled: false },
    { label: "no row", rows: [], enabled: false },
    { label: "missing published", rows: [{ published_config: null }], enabled: false },
    { label: "missing page availability", rows: [{ published_config: {} }], enabled: false },
    { label: "missing scheduled", rows: [{ published_config: { page_availability: { home: true } } }], enabled: false },
    { label: "null", rows: [{ published_config: { page_availability: { scheduled: null } } }], enabled: false },
    { label: "string", rows: [{ published_config: { page_availability: { scheduled: "true" } } }], enabled: false },
    { label: "number", rows: [{ published_config: { page_availability: { scheduled: 1 } } }], enabled: false },
    { label: "array", rows: [{ published_config: { page_availability: [] } }], enabled: false },
  ];

  for (const scenario of cases) {
    const result = await resolveScheduledCapability({ query: async () => ({ rows: scenario.rows }) });
    assert.equal(result.enabled, scenario.enabled, scenario.label);
  }
  assert.equal((await resolveScheduledCapability(null)).enabled, false);
  assert.equal((await resolveScheduledCapability({ query: async () => { throw new Error("db down"); } })).enabled, false);
});

test("closed scheduled runtime switch rejects before booking mutation and reopens immediately", async () => {
  let enabled = false;
  let connects = 0;
  const service = createBookingJobService({
    pool: { async connect() { connects += 1; throw new Error("must not connect"); } },
    isServiceZoneFilterEnabled: () => false,
    resolveCustomerScheduledCapability: async () => ({ enabled }),
    resolveCustomerUrgentCapability: async () => ({ enabled: false }),
    lineContactUrl: "https://lin.ee/test",
  });
  const invoke = async () => {
    const reply = { statusCode: 200, body: null };
    const res = {
      status(code) { reply.statusCode = code; return this; },
      json(value) { reply.body = value; return value; },
    };
    await service.handlePublicBook({ body: { booking_mode: "scheduled" } }, res);
    return reply;
  };

  const closed = await invoke();
  assert.equal(closed.statusCode, 503);
  assert.equal(closed.body.code, "SCHEDULED_BOOKING_DISABLED");
  assert.equal(connects, 0);

  enabled = true;
  const opened = await invoke();
  assert.equal(opened.statusCode, 400);
  assert.notEqual(opened.body.code, "SCHEDULED_BOOKING_DISABLED");
  assert.equal(connects, 0);
});
