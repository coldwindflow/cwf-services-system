"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  validate,
  createStoreServicePackageCatalogService,
} = require("../server/services/packages/storeServicePackageCatalogService");

function variant(overrides = {}) {
  return {
    display_name: "Small", service_key: "wash-wall-premium", service_name: "Premium wash",
    job_type: "wash", ac_type: "wall", wash_variant: "premium", btu_min: null, btu_max: 12000,
    service_unit_duration_minutes: 45, is_active: true, is_customer_visible: true,
    tiers: [{ display_name: "1 unit", service_quantity: 1, fixed_total_price: "699.00", sort_order: 0, is_active: true }],
    ...overrides,
  };
}
function bundle(overrides = {}) {
  return { item_name: "Premium Day", is_active: true, is_customer_visible: true,
    sell_start_at: "2026-08-08T00:00:00+07:00", sell_end_at: "2026-08-10T23:59:59+07:00",
    redeem_until: "2027-01-31T23:59:59+07:00", variants: [variant()], ...overrides };
}

test("bundle validation keeps parent windows authoritative and price text exact", () => {
  const result = validate(bundle());
  assert.equal(result.variants[0].fixed_total_price, undefined);
  assert.equal(result.variants[0].tiers[0].fixed_total_price, "699.00");
  assert.equal(result.variants[0].sell_start_at, null);
  assert.equal(result.sell_start_at, "2026-08-07T17:00:00.000Z");
});

test("active same-taxonomy BTU ranges may not overlap", () => {
  assert.throws(() => validate(bundle({ variants: [variant(), variant({ display_name: "Overlap", btu_min: 12000, btu_max: 18000 })] })),
    { code: "OVERLAPPING_VARIANT_RANGE" });
});

test("BTU gap and a non-Premium configuration are accepted", () => {
  const result = validate(bundle({ item_name: "Maintenance Club", variants: [
    variant({ display_name: "Compact", wash_variant: "normal" }),
    variant({ display_name: "Large", wash_variant: "normal", btu_min: 18000, btu_max: null,
      tiers: [{ display_name: "3 visits", service_quantity: 3, fixed_total_price: "2500.00", is_active: true }] }),
  ] }));
  assert.equal(result.item_name, "Maintenance Club");
  assert.equal(result.variants[1].tiers[0].fixed_total_price, "2500.00");
});

test("canonical Admin taxonomy accepts a non-wall package and derives service identity", () => {
  const result = validate(bundle({ item_name: "Cassette Club", variants: [variant({
    display_name: "Cassette seven", job_type: "wash", ac_type: "cassette", wash_variant: null,
    btu_min: 15000, btu_max: 60000, service_unit_duration_minutes: 70,
    tiers: [{ display_name: "7 units", service_quantity: 7, fixed_total_price: "8750.00", sort_order: 0, is_active: true }],
  })] }));
  assert.equal(result.variants[0].job_type, "ล้าง");
  assert.equal(result.variants[0].ac_type, "สี่ทิศทาง");
  assert.equal(result.variants[0].wash_variant, null);
  assert.equal(result.variants[0].service_key, "wash-cassette");
  assert.equal(result.variants[0].tiers[0].service_quantity, 7);
});

test("unknown free-text taxonomy is rejected before persistence", () => {
  assert.throws(() => validate(bundle({ variants: [variant({ ac_type: "invented-ac-type" })] })),
    { code: "INVALID_SERVICE_CONSTRAINTS" });
});

test("updating a bundle does not require a catalog_items.updated_at column", async () => {
  const parent = {
    item_id: "1", service_bundle_key: "bundle-existing", item_name: "Premium Day updated",
    is_active: true, is_customer_visible: true, highlights: [],
  };
  const tierRow = {
    service_package_tier_id: "21", tier_key: "tier-existing", display_name: "1 unit",
    service_quantity: 1, fixed_total_price: "699.00", sort_order: 0, is_active: true,
  };
  const packageRow = {
    service_package_id: "11", catalog_item_id: "1", package_key: "pkg-existing",
    display_name: "Small", service_key: "wash-wall-premium", service_name: "Premium wash",
    job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างพรีเมียม", btu_min: null, btu_max: 12000,
    service_unit_duration_minutes: 45, sort_order: 0, is_active: true, is_customer_visible: true,
    tiers: [tierRow],
  };
  const catalogUpdates = [];
  const client = {
    async query(statement) {
      const sql = String(statement);
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
      if (/WHERE service_bundle_key=\$1 FOR UPDATE/.test(sql)) return { rows: [parent] };
      if (/UPDATE public\.catalog_items/.test(sql)) {
        catalogUpdates.push(sql);
        if (/\bupdated_at\b/.test(sql)) {
          const error = new Error('column "updated_at" of relation "catalog_items" does not exist');
          error.code = "42703";
          throw error;
        }
        return { rows: [parent] };
      }
      if (/SELECT \* FROM public\.service_packages WHERE catalog_item_id=\$1 FOR UPDATE/.test(sql)) {
        return { rows: [packageRow] };
      }
      if (/UPDATE public\.service_packages SET is_active=FALSE/.test(sql)) return { rows: [] };
      if (/SELECT \* FROM public\.catalog_items WHERE service_bundle_key IS NOT NULL/.test(sql)) return { rows: [parent] };
      if (/FROM public\.service_packages p[\s\S]*JOIN public\.catalog_items ci/.test(sql)) return { rows: [packageRow] };
      throw new Error(`Unexpected SQL in bundle-update regression: ${sql}`);
    },
    release() {},
  };
  const packageRepository = {
    listTiersForUpdate: async () => [tierRow],
    updatePackage: async () => packageRow,
    updateTier: async () => tierRow,
    deactivateTiers: async () => {},
    listLinkedPackagesForCatalogItems: async () => [packageRow],
  };
  const service = createStoreServicePackageCatalogService({
    pool: { connect: async () => client },
    packageRepository,
  });
  const updated = await service.update("bundle-existing", bundle({
    item_name: "Premium Day updated",
    variants: [variant({
      package_key: "pkg-existing",
      tiers: [{ ...tierRow }],
    })],
  }));

  assert.equal(updated.item_name, "Premium Day updated");
  assert.equal(catalogUpdates.length, 1);
  assert.doesNotMatch(catalogUpdates[0], /\bupdated_at\b/);
});

test("bundle taxonomy reuses the canonical price-book contract without campaign defaults", () => {
  const source = fs.readFileSync(path.join(__dirname, "../server/services/packages/servicePackageTaxonomy.js"), "utf8");
  assert.match(source, /supportedServiceTaxonomy/);
  assert.doesNotMatch(source, /Premium Day|["']wall["']|["']premium["']|12000|18000|699\.00/);
});
