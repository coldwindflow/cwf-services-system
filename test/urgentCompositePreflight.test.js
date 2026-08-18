"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { resolveUrgentCompositePreflight } = require("../server/services/booking/urgentCompositePreflight");
const { resolveCompositeBooking } = require("../server/services/packages/compositeServicePackage");

const row = {
  catalog_item_id: "51", item_id: "51", item_name: "TEST reusable bundle", service_bundle_key: "test-bundle",
  booking_mode: "service_package", booking_flow_policy: "scheduled_and_urgent",
  catalog_is_active: true, catalog_is_customer_visible: true,
  service_package_sell_start_at: "2026-08-01T00:00:00.000Z",
  service_package_sell_end_at: "2026-08-31T23:59:59.000Z",
  service_package_redeem_until: "2027-01-31T16:59:59.000Z",
  job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างพรีเมียม",
  service_key: "test-wash", service_name: "TEST Wash", service_unit_duration_minutes: 45,
  is_active: true, is_customer_visible: true, service_package_id: "11", package_key: "test-variant",
  display_name: "TEST variant", btu_max: 12000,
  tiers: [1, 2, 3, 4].map((quantity) => ({
    service_package_tier_id: String(quantity), tier_key: `q${quantity}`, display_name: `${quantity} units`,
    service_quantity: quantity, fixed_total_price: `${quantity * 700}.00`, sort_order: quantity, is_active: true,
  })),
};

function resolver() {
  return {
    resolveComposite(input) {
      return resolveCompositeBooking({
        ...input,
        repository: { findLinkedPackagesByKeys: async () => [row] },
        db: {},
        now: () => new Date("2026-08-09T00:00:00.000Z"),
      });
    },
  };
}

async function preflight(quantity) {
  return resolveUrgentCompositePreflight({
    input: { catalog_item_id: 51, service_package_groups: [{ package_key: "test-variant", btu: 12000, quantity }] },
    appointmentDatetime: "2026-08-20T03:00:00.000Z",
    resolver: resolver(),
  });
}

test("urgent composite preflight uses the final package resolver for 20 and 99 machines", async () => {
  for (const quantity of [20, 99]) {
    const result = await preflight(quantity);
    assert.equal(result.machineCount, quantity);
    assert.equal(result.durationMin, quantity * 45);
    assert.equal(result.payload.machine_count, quantity);
    assert.equal(result.payload.services[0].machine_count, quantity);
    assert.equal(result.payload.service_package_groups[0].quantity, quantity);
  }
});

test("urgent composite preflight safely rejects quantities above the shared 99-machine domain", async () => {
  await assert.rejects(preflight(100), { code: "INVALID_PACKAGE_SELECTION" });
});

test("urgent UI review, preflight fingerprint and submit retain the authoritative groups and duration", () => {
  const source = fs.readFileSync("customer-app/modules/bookingUrgent.js", "utf8");
  assert.match(source, /payloadFromCompositeServiceLines\(services\(\)\)/);
  assert.match(source, /service_package_groups: Array\.isArray\(draft\(\)\.service_package_groups\)/);
  assert.match(source, /Number\(result\?\.duration_min\) !== Number\(bundlePreview\(\)\?\.duration_min\)/);
  assert.match(source, /preview\.groups \|\| \[\]/);
});
