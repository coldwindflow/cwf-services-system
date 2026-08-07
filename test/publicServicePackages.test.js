"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPublicServicePackageService } = require("../server/services/public/servicePackages");
const { createServicePackageResolver } = require("../server/services/packages/servicePackageResolver");
const { registerPublicServicePackageRoutes } = require("../server/routes/public/servicePackages");

const packageRow = {
  service_package_id: 10, package_key: "premium-wall", display_name: "Premium Wall", description: "Fixed package",
  service_key: "wall-premium", service_name: "Premium cleaning", service_unit_duration_minutes: 45,
  job_type: "wash", ac_type: "wall", wash_variant: "premium", btu_min: null, btu_max: 12000,
  sell_start_at: "2026-08-01T00:00:00.000Z", sell_end_at: "2026-08-31T23:59:59.000Z",
  redeem_until: "2026-12-31T23:59:59.000Z", is_active: true, is_customer_visible: true,
};
const tierRow = {
  service_package_tier_id: 21, service_package_id: 10, tier_key: "two", display_name: "Two units",
  service_quantity: 2, fixed_total_price: "1399.50", is_active: true,
};

function harness(overrides = {}) {
  const queries = [];
  const repo = {
    listCustomerVisiblePackages: async () => overrides.list || [{ ...packageRow, tiers: [{ ...tierRow }, { ...tierRow, service_package_tier_id: 22, tier_key: "off", is_active: false }] }],
    findPackageByKey: async (_db, key) => key === packageRow.package_key ? { ...packageRow, ...(overrides.package || {}) } : null,
    findTier: async (_db, identity) => identity.packageId === 10 && identity.tierKey === tierRow.tier_key
      ? { ...tierRow, ...(overrides.tier || {}) }
      : null,
  };
  const db = { query: async (...args) => { queries.push(args); throw new Error("unexpected database query"); } };
  const resolver = createServicePackageResolver({ db, packageRepository: repo, now: () => new Date("2026-08-07T00:00:00Z") });
  return { service: createPublicServicePackageService({ resolver }), queries };
}

function responseHarness() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("discovery exposes only safe stable keys and active tiers", async () => {
  const { service, queries } = harness();
  const result = await service.list();
  assert.equal(result.service_packages.length, 1);
  assert.equal(result.service_packages[0].package_key, "premium-wall");
  assert.deepEqual(result.service_packages[0].tiers.map((tier) => tier.tier_key), ["two"]);
  assert.equal(result.service_packages[0].tiers[0].fixed_total_price, "1399.50");
  assert.equal(JSON.stringify(result).includes("service_package_id"), false);
  assert.equal(JSON.stringify(result).includes("snapshot"), false);
  assert.deepEqual(queries, []);
});

test("discovery trusts resolver filtering and fails malformed rows safely", async () => {
  assert.deepEqual(await harness({ list: [] }).service.list(), { service_packages: [] });
  await assert.rejects(
    () => harness({ list: [{ ...packageRow, service_unit_duration_minutes: 0, tiers: [tierRow] }] }).service.list(),
    { status: 503, code: "SERVICE_PACKAGES_UNAVAILABLE" }
  );
});

test("preview is server-authoritative and never exposes IDs or snapshots", async () => {
  const { service, queries } = harness();
  const result = await service.preview({
    package_key: "premium-wall", tier_key: "two", fixed_total_price: "1.00", quantity: 99,
    duration: 1, service: { service_key: "fake", constraints: { btu_max: 99999 } },
  });
  assert.equal(result.fixed_total_price, "1399.50");
  assert.equal(result.quantity, 2);
  assert.equal(result.unit_duration_minutes, 45);
  assert.equal(result.service.service_key, "wall-premium");
  assert.equal(result.service.constraints.btu_max, 12000);
  assert.equal(result.sell_start_at, "2026-08-01T00:00:00.000Z");
  assert.equal(result.sell_end_at, "2026-08-31T23:59:59.000Z");
  assert.equal(result.redeem_until, "2026-12-31T23:59:59.000Z");
  assert.equal(JSON.stringify(result).includes("service_package_id"), false);
  assert.equal(JSON.stringify(result).includes("snapshot"), false);
  assert.deepEqual(queries, []);
});

test("unavailable packages and mismatched tiers return safe public errors", async () => {
  for (const packageOverride of [
    { is_customer_visible: false }, { is_active: false },
    { sell_start_at: "2026-08-08T00:00:00Z" }, { sell_end_at: "2026-08-06T00:00:00Z" },
  ]) {
    await assert.rejects(() => harness({ package: packageOverride }).service.preview({ package_key: "premium-wall", tier_key: "two" }),
      { status: 404, code: "SERVICE_PACKAGE_NOT_AVAILABLE" });
  }
  await assert.rejects(() => harness().service.preview({ package_key: "premium-wall", tier_key: "wrong" }),
    { status: 404, code: "SERVICE_PACKAGE_TIER_NOT_AVAILABLE" });
  await assert.rejects(() => harness({ tier: { is_active: false } }).service.preview({ package_key: "premium-wall", tier_key: "two" }),
    { status: 404, code: "SERVICE_PACKAGE_TIER_NOT_AVAILABLE" });
  await assert.rejects(() => harness().service.preview({ package_key: "premium-wall" }),
    { status: 400, code: "INVALID_PACKAGE_SELECTION" });
});

test("routes register both endpoints and hide internal error details", async () => {
  const registrations = [];
  const app = {
    get(path, handler) { registrations.push({ method: "GET", path, handler }); },
    post(path, handler) { registrations.push({ method: "POST", path, handler }); },
  };
  registerPublicServicePackageRoutes(app, { service: {
    list: async () => { const error = new Error("SELECT secret FROM table"); error.code = "42P01"; error.stack = "raw SQL stack"; throw error; },
    preview: async () => ({ ok: true }),
  } });
  assert.deepEqual(registrations.map(({ method, path }) => `${method} ${path}`), [
    "GET /public/service-packages", "POST /public/service-packages/preview",
  ]);
  const res = responseHarness();
  await registrations[0].handler({}, res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { error: "SERVICE_PACKAGES_UNAVAILABLE", code: "SERVICE_PACKAGES_UNAVAILABLE" });
  assert.doesNotMatch(JSON.stringify(res.body), /SELECT|stack|secret/i);
});
