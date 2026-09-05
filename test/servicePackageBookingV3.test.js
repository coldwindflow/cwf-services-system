"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { compositeBookingFromSnapshots } = require("../server/services/booking/servicePackageBooking");

function snapshot({ packageId, packageKey, tierId, btu, fixedTotal, baseShare, modifierLine, modifier, level = "standard" }) {
  return {
    schema_version: 3,
    catalog_item: { id: "900", key: "air-reset-60", name: "CWF AIR RESET 60" },
    package: { id: packageId, key: packageKey, name: packageKey },
    tier: { id: tierId, key: "q2", name: "2 เครื่อง" },
    taxonomy: {
      service_key: "wash-wall-standard", service_name: "Standard wash", job_type: "wash",
      ac_type: "wall", wash_variant: "normal", selected_btu: btu,
    },
    service_level: { key: level, label: level.toUpperCase() },
    quantity: 1,
    unit_duration_minutes: 45,
    fixed_total_price: fixedTotal,
    pricing: {
      strategy: "total_quantity_tier_plus_unit_modifiers",
      selection_mode: "exclusive_level",
      service_level_key: level,
      total_quantity: 2,
      base_total_price: "959.00",
      group_base_share: baseShare,
      unit_modifier: modifier,
      modifier_line_total: modifierLine,
      final_line_total: fixedTotal,
    },
    warranty_days: 60,
    payment_mode: "prepaid_full",
    maximum_total_quantity: 4,
    redeem_until: "2027-01-31T16:59:59.999Z",
  };
}

function rows() {
  return [
    {
      service_package_id: "101",
      service_package_tier_id: "112",
      service_package_snapshot: snapshot({
        packageId: "101", packageKey: "standard-small", tierId: "112", btu: 12000,
        fixedTotal: "479.50", baseShare: "479.50", modifierLine: "0.00", modifier: "0.00",
      }),
    },
    {
      service_package_id: "102",
      service_package_tier_id: "312",
      service_package_snapshot: snapshot({
        packageId: "102", packageKey: "standard-large", tierId: "312", btu: 18000,
        fixedTotal: "579.50", baseShare: "479.50", modifierLine: "100.00", modifier: "100.00",
      }),
    },
  ];
}

const body = {
  catalog_item_id: 900,
  service_package_groups: [
    { package_key: "standard-small", btu: 12000, quantity: 1 },
    { package_key: "standard-large", btu: 18000, quantity: 1 },
  ],
};

test("schema v3 promotion snapshots replay the frozen mixed-BTU amount", () => {
  const replay = compositeBookingFromSnapshots({ body, snapshots: rows() });
  assert.ok(replay);
  assert.equal(replay.fixedTotal, "1059.00");
  assert.equal(replay.durationMin, 90);
  assert.equal(replay.items.length, 2);
});

test("schema v3 replay rejects changed selection or tampered frozen pricing", () => {
  const changed = {
    ...body,
    service_package_groups: [{ package_key: "standard-small", btu: 12000, quantity: 2 }],
  };
  assert.equal(compositeBookingFromSnapshots({ body: changed, snapshots: rows() }), null);

  const tampered = rows();
  tampered[1].service_package_snapshot.pricing.final_line_total = "479.50";
  assert.equal(compositeBookingFromSnapshots({ body, snapshots: tampered }), null);
});

test("schema v3 exclusive-level replay rejects mixed service levels", () => {
  const mixed = rows();
  mixed[1].service_package_snapshot.service_level = { key: "premium", label: "PREMIUM" };
  mixed[1].service_package_snapshot.pricing.service_level_key = "premium";
  assert.equal(compositeBookingFromSnapshots({ body, snapshots: mixed }), null);
});
