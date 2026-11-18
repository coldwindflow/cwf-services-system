"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const prices = {
  "standard-small": [499, 899, 1299, 1699, 2198, 2598],
  "standard-large": [599, 1099, 1599, 2099, 2698, 3198],
  "premium-small": [699, 1399, 1899, 2489, 3188, 3798],
  "premium-large": [899, 1799, 2599, 3399, 4298, 5197],
};

async function runProbe({ liveError = () => "SERVICE_PACKAGE_NOT_AVAILABLE", corruptQuantity, premiumOpen = false } = {}) {
  const calls = [];
  const lines = [];
  const process = { argv: ["node", "probe", "test"], exitCode: 0 };
  let finish;
  const completed = new Promise((resolve) => { finish = resolve; });
  const pool = {
    query: async () => ({ rows: ["standard", "premium"].map((level, i) => ({
      item_id: i + 1, service_bundle_key: `coldwindflow-air-care-${level}`,
      sell_start: "2026-09-29T00:00:00+07:00",
      sell_end: premiumOpen && level === "premium" ? "2026-12-01T00:00:00Z" : "2026-10-06T23:59:59+07:00",
    })) }),
    end: async () => { finish(); },
  };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : ["2026-11-14T00:00:00Z"])); }
    static now() { return new Clock().getTime(); }
  }
  const createPrepaidOrderService = (options) => ({
    async quoteOrder(body, { identity }) {
      const historical = Boolean(options.resolverFactory);
      calls.push({ historical, body, identity });
      if (!historical) {
        const code = liveError(body, identity);
        if (code) throw Object.assign(new Error(code), { code, statusCode: code === "SERVICE_PACKAGE_NOT_AVAILABLE" ? 404 : 503 });
      }
      const groups = body.service_package_groups;
      let total = groups.length > 1 ? 2498 : prices[groups[0].package_key.replace("coldwindflow-air-care-", "")][groups[0].quantity - 1];
      if (historical && groups[0].quantity === corruptQuantity) total -= 1;
      return { fixed_total_price: total };
    },
  });
  vm.runInNewContext(fs.readFileSync("scripts/probe-air-care-quotes.js", "utf8"), {
    process, Date: Clock, console: { log: (line) => lines.push(line) },
    require(name) {
      if (name === "../db") return pool;
      if (name.endsWith("prepaidOrderServiceV2")) return { createPrepaidOrderService };
      if (name.endsWith("servicePackageResolver")) return { createServicePackageResolver() {} };
      throw new Error(`unexpected import: ${name}`);
    },
  }, { filename: "probe-air-care-quotes.js" });
  await completed;
  return { calls, lines, exitCode: process.exitCode };
}

test("seed probe checks q1-q6 and both customer/Admin eligibility for every AIR CARE variant", async () => {
  const result = await runProbe();
  assert.equal(result.exitCode, 0);
  for (const variant of Object.keys(prices)) {
    for (const quantity of [1, 2, 3, 4, 5, 6]) {
      assert.ok(result.calls.some((c) => c.historical && c.body.service_package_groups[0].package_key.endsWith(variant)
        && c.body.service_package_groups[0].quantity === quantity), `${variant} q${quantity}`);
    }
    for (const identity of ["customer", "admin"]) {
      assert.ok(result.calls.some((c) => !c.historical && c.identity === identity
        && c.body.service_package_groups[0].package_key.endsWith(variant)), `${identity} ${variant}`);
    }
  }
});

test("a schema failure cannot masquerade as correct closed-window enforcement", async () => {
  const result = await runProbe({ liveError: () => "PREPAID_SCHEMA_NOT_READY" });
  assert.equal(result.exitCode, 1);
  assert.ok(result.lines.some((line) => line.includes("PREPAID_SCHEMA_NOT_READY")));
});

test("a Premium-only eligibility bypass fails even while Standard correctly rejects", async () => {
  const result = await runProbe({ liveError: (body) => body.catalog_item_id === 2 ? null : "SERVICE_PACKAGE_NOT_AVAILABLE" });
  assert.equal(result.exitCode, 1);
});

test("Admin-only eligibility bypass fails the seed gate", async () => {
  const result = await runProbe({ liveError: (_body, identity) => identity === "admin" ? null : "SERVICE_PACKAGE_NOT_AVAILABLE" });
  assert.equal(result.exitCode, 1);
});

test("each bundle is judged against its own window", async () => {
  const result = await runProbe({ premiumOpen: true,
    liveError: (body) => body.catalog_item_id === 2 ? null : "SERVICE_PACKAGE_NOT_AVAILABLE" });
  assert.equal(result.exitCode, 0);
  assert.ok(result.lines.some((line) => line.includes("window=open")));
  assert.ok(result.lines.some((line) => line.includes("window=closed")));
});

test("a corrupted q2 price fails verification", async () => {
  assert.equal((await runProbe({ corruptQuantity: 2 })).exitCode, 1);
});

test("historical seed verification uses one clock for snapshot expiry without relaxing live purchases", async () => {
  const { createPrepaidOrderService } = require("../server/services/prepaid/prepaidOrderServiceV2");
  const pool = { query: async () => ({ rows: [{
    has_entitlements: true, has_orders: true, has_order_columns: true, has_job_columns: true,
  }] }) };
  const resolverFactory = () => ({ resolveComposite: async () => ({
    paymentMode: "prepaid_full", redeemUntil: "2020-12-01T00:00:00Z", warrantyDays: 60,
    fixedTotal: "499.00", bundleId: "1", bundleKey: "coldwindflow-air-care-standard", durationMin: 60,
    payload: { service_package_groups: [{ package_key: "standard", btu: 12000, quantity: 1 }],
      services: [{ job_type: "wash", ac_type: "wall", btu: 12000, machine_count: 1 }] },
    items: [{ packageId: "1", tierId: "1", snapshot: { schema_version: 2 } }],
  }) });
  const body = { catalog_item_id: 1, service_package_groups: [{ package_key: "standard", btu: 12000, quantity: 1 }] };
  const historical = createPrepaidOrderService({ pool, resolverFactory, now: () => new Date("2020-10-01T00:00:00Z") });
  assert.equal((await historical.quoteOrder(body)).redeem_until, "2020-11-30T00:00:00.000Z");
  await assert.rejects(createPrepaidOrderService({ pool, resolverFactory }).quoteOrder(body),
    { code: "PACKAGE_REDEEM_WINDOW_EXCEEDED" });
});
