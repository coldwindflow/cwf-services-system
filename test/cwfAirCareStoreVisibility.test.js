"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const catalogRoutes = require("../server/routes/catalog/items");

const ROOT = path.resolve(__dirname, "..");
const AIR_CARE_KEYS = ["coldwindflow-air-care-standard", "coldwindflow-air-care-premium"];

function tiers(prices) {
  return prices.map((fixed_total_price, index) => ({
    tier_key: `q${index + 1}`,
    display_name: `${index + 1} เครื่อง`,
    service_quantity: index + 1,
    fixed_total_price,
    sort_order: index,
    is_active: true,
  }));
}

function variant(catalogItemId, bundleKey, kind, btuMin, btuMax, prices, sortOrder) {
  const premium = bundleKey.endsWith("premium");
  return {
    service_package_id: `${catalogItemId}${sortOrder + 1}`,
    catalog_item_id: catalogItemId,
    package_key: `${bundleKey}-${kind}`,
    display_name: `${premium ? "PREMIUM" : "STANDARD"} • ${kind === "small" ? "≤12,000" : "≥18,000"} BTU`,
    description: "AIR CARE customer-visible variant",
    service_key: bundleKey,
    service_name: premium ? "ล้างพรีเมียม" : "ล้างธรรมดา",
    job_type: "ล้าง",
    ac_type: "ผนัง",
    wash_variant: premium ? "ล้างพรีเมียม" : "ล้างธรรมดา",
    btu_min: btuMin,
    btu_max: btuMax,
    service_unit_duration_minutes: premium ? 80 : 60,
    sort_order: sortOrder,
    is_active: true,
    is_customer_visible: true,
    tiers: tiers(prices),
  };
}

function seededParents() {
  return AIR_CARE_KEYS.map((service_bundle_key, index) => ({
    item_id: String(36 + index),
    item_name: `COLDWINDFLOW AIR CARE — ${service_bundle_key.endsWith("premium") ? "PREMIUM" : "STANDARD"}`,
    item_category: "service",
    base_price: 0,
    unit_label: "package",
    job_category: "ล้าง",
    ac_type: "ผนัง",
    btu_min: null,
    btu_max: null,
    booking_mode: "contact_admin",
    service_bundle_key,
    service_package_sell_start_at: "2026-09-28T17:00:00.000Z",
    service_package_sell_end_at: "2026-10-06T16:59:59.999Z",
    service_package_redeem_until: "2026-12-05T16:59:59.999Z",
    service_package_minimum_total_quantity: null,
    is_active: true,
    is_customer_visible: true,
    is_featured: true,
    highlights: [],
    images: [],
  }));
}

function loadStore(publicItems) {
  const root = {
    state: {
      catalog: { status: "success", items: [{ item_id: "old", item_name: "รายการก่อน seed" }], error: "" },
      storeScrollY: 0,
      setCollection(name, value) { this[name] = value; },
    },
    api: { async loadCatalogItems() { return publicItems; } },
    analytics: { track() {} },
    pageAvailability: { isEnabled() { return false; } },
    services: {},
    ui: {},
    utils: {
      escapeHtml(value) { return String(value ?? ""); },
      formatBaht(value) { return `${Number(value).toLocaleString("en-US")} บาท`; },
      catalogStartingPrice(item) {
        const values = (item.service_package_variants || []).flatMap((entry) => entry.tiers || [])
          .map((tier) => Number(tier.fixed_total_price)).filter(Number.isFinite);
        return values.length ? { amount: Math.min(...values) } : null;
      },
      catalogPriceIsAsk(item) { return !this.catalogStartingPrice(item); },
      catalogPriceLabel(item) {
        const price = this.catalogStartingPrice(item);
        return price ? `เริ่ม ${Number(price.amount).toLocaleString("en-US")} บาท` : "สอบถามราคา";
      },
      catalogPriceUnitLabel() { return ""; },
      normalizeList(value, key) { return Array.isArray(value) ? value : (value?.[key] || []); },
      stateBox(_kind, message) { return `<p>${message}</p>`; },
    },
  };
  const window = { CWFCustomerAppV2: root, location: { hash: "#store" }, scrollY: 0, pageYOffset: 0,
    matchMedia() { return { matches: true }; }, scrollTo() {} };
  const document = { body: { classList: { add() {}, remove() {} } }, createElement() { return {}; } };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "customer-app/modules/store.js"), "utf8"), {
    window, document, console, URL, Intl, Date, Math, BigInt, Set, WeakMap,
    requestAnimationFrame(fn) { fn(); }, setTimeout, clearTimeout, setInterval, clearInterval,
  }, { filename: "customer-app/modules/store.js" });
  return root;
}

test("seeded customer catalog attaches AIR CARE variants and a stale Store session renders both parents after refresh", async () => {
  const parents = seededParents();
  const packages = [
    variant("36", AIR_CARE_KEYS[0], "small", null, 12000, ["499.00", "899.00", "1299.00", "1699.00"], 0),
    variant("36", AIR_CARE_KEYS[0], "large", 18000, null, ["499.00", "899.00", "1299.00", "1699.00"], 1),
    variant("37", AIR_CARE_KEYS[1], "small", null, 12000, ["699.00", "1399.00", "1899.00", "2489.00"], 0),
    variant("37", AIR_CARE_KEYS[1], "large", 18000, null, ["899.00", "1799.00", "2599.00", "3399.00"], 1),
  ];
  const sqlSeen = [];
  const pool = { async query(sql) {
    sqlSeen.push(String(sql));
    if (String(sql).includes("information_schema.columns") && String(sql).includes("service_bundle_key")) return { rows: [{ cnt: 5 }] };
    if (String(sql).includes("information_schema.columns") && String(sql).includes("service_package_minimum_total_quantity")) return { rows: [{ cnt: 1 }] };
    if (String(sql).includes("FROM public.catalog_items WHERE item_id=ANY")) return { rows: parents.map((row) => ({ ...row })) };
    if (String(sql).includes("FROM public.service_packages p")) return { rows: packages.map((row) => ({ ...row })) };
    throw new Error(`Unexpected catalog query: ${sql}`);
  } };

  await catalogRoutes.attachCatalogServicePackages(pool, parents, { customer: true });
  const publicItems = parents.map(catalogRoutes.serializeCatalogRow);

  assert.deepEqual(publicItems.map((item) => item.service_bundle_key), AIR_CARE_KEYS);
  assert.ok(publicItems.every((item) => item.booking_mode === "service_package" && item.is_active && item.is_customer_visible));
  assert.ok(publicItems.every((item) => item.service_package_variants.length === 2));
  assert.ok(publicItems.every((item) => item.service_package_variants.flatMap((entry) => entry.tiers).length === 8));
  assert.ok(sqlSeen.some((sql) => /p\.is_active=TRUE AND p\.is_customer_visible=TRUE[\s\S]*ci\.is_active=TRUE AND ci\.is_customer_visible=TRUE/.test(sql)));

  const root = loadStore(publicItems);
  let refreshCalls = 0;
  root.api.loadCatalogItems = async () => { refreshCalls += 1; return publicItems; };
  await root.store._test.ensureLoaded({ querySelector() { return null; } });

  assert.equal(refreshCalls, 1, "a successful but stale in-memory catalog must be revalidated");
  assert.deepEqual(root.state.catalog.items.map((item) => item.service_bundle_key), AIR_CARE_KEYS);
  const rendered = root.state.catalog.items.map(root.store._test.renderCard).join("\n");
  assert.match(rendered, /COLDWINDFLOW AIR CARE — STANDARD/);
  assert.match(rendered, /COLDWINDFLOW AIR CARE — PREMIUM/);
  assert.equal((rendered.match(/เลือกแพ็กเกจ/g) || []).length, 2);
});
