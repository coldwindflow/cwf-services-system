"use strict";

const PRICING_STRATEGIES = new Set(["per_variant_tier", "total_quantity_tier_plus_unit_modifiers"]);
const SELECTION_MODES = new Set(["multi_variant", "exclusive_level"]);
const PAYMENT_MODES = new Set(["book_now", "prepaid_full"]);

class PromotionPolicyAdminError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = "PromotionPolicyAdminError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, status = 400) { throw new PromotionPolicyAdminError(code, status); }
function clean(value, max = 160) { return String(value == null ? "" : value).trim().slice(0, max); }
function requiredEnum(value, allowed, code) {
  const text = clean(value, 80);
  if (!allowed.has(text)) fail(code);
  return text;
}
function nullableInteger(value, min, max, code) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) fail(code);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) fail(code);
  return parsed;
}
function nonnegativeMoney(value) {
  const raw = value == null || value === "" ? "0.00" : String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) fail("INVALID_UNIT_PRICE_MODIFIER");
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 9999999999.99) fail("INVALID_UNIT_PRICE_MODIFIER");
  return n.toFixed(2);
}

function validatePromotionPolicy(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("INVALID_PROMOTION_POLICY");
  const pricingStrategy = requiredEnum(input.pricing_strategy, PRICING_STRATEGIES, "INVALID_PRICING_STRATEGY");
  const selectionMode = requiredEnum(input.selection_mode, SELECTION_MODES, "INVALID_SELECTION_MODE");
  const paymentMode = requiredEnum(input.payment_mode, PAYMENT_MODES, "INVALID_PAYMENT_MODE");
  const maximumTotalQuantity = nullableInteger(input.maximum_total_quantity, 1, 99, "INVALID_MAXIMUM_TOTAL_QUANTITY");
  const warrantyDays = nullableInteger(input.warranty_days, 1, 3650, "INVALID_WARRANTY_DAYS");
  const variants = Array.isArray(input.variants) ? input.variants.map((raw) => {
    const packageKey = clean(raw?.package_key, 128);
    if (!packageKey) fail("PACKAGE_KEY_REQUIRED");
    const serviceLevelKey = clean(raw?.service_level_key, 80) || null;
    const serviceLevelLabel = clean(raw?.service_level_label, 120) || serviceLevelKey;
    return {
      package_key: packageKey,
      service_level_key: serviceLevelKey,
      service_level_label: serviceLevelLabel,
      unit_price_modifier: nonnegativeMoney(raw?.unit_price_modifier),
    };
  }) : [];
  if (selectionMode === "exclusive_level") {
    if (!variants.length || variants.some((variant) => !variant.service_level_key)) fail("SERVICE_LEVEL_REQUIRED");
  }
  if (pricingStrategy === "total_quantity_tier_plus_unit_modifiers" && !variants.length) fail("PROMOTION_VARIANTS_REQUIRED");
  if (new Set(variants.map((variant) => variant.package_key)).size !== variants.length) fail("DUPLICATE_PACKAGE_KEY");
  return {
    pricing_strategy: pricingStrategy,
    selection_mode: selectionMode,
    maximum_total_quantity: maximumTotalQuantity,
    payment_mode: paymentMode,
    warranty_days: warrantyDays,
    variants,
  };
}

async function updatePromotionPolicy(db, bundleKey, input) {
  const key = clean(bundleKey, 128);
  if (!key) fail("BUNDLE_KEY_REQUIRED");
  const value = validatePromotionPolicy(input);
  const client = typeof db.connect === "function" ? await db.connect() : db;
  const release = client !== db && typeof client.release === "function";
  try {
    await client.query("BEGIN");
    const parentQ = await client.query(
      `SELECT item_id, service_bundle_key FROM public.catalog_items WHERE service_bundle_key=$1 FOR UPDATE`,
      [key]
    );
    const parent = parentQ.rows[0];
    if (!parent) fail("BUNDLE_NOT_FOUND", 404);
    await client.query(
      `UPDATE public.catalog_items
          SET service_package_pricing_strategy=$2,
              service_package_selection_mode=$3,
              service_package_maximum_total_quantity=$4,
              service_package_payment_mode=$5,
              service_package_warranty_days=$6
        WHERE item_id=$1`,
      [parent.item_id, value.pricing_strategy, value.selection_mode, value.maximum_total_quantity,
        value.payment_mode, value.warranty_days]
    );

    const packageRows = await client.query(
      `SELECT service_package_id, package_key FROM public.service_packages WHERE catalog_item_id=$1 FOR UPDATE`,
      [parent.item_id]
    );
    const byKey = new Map(packageRows.rows.map((row) => [row.package_key, row]));
    for (const variant of value.variants) {
      const row = byKey.get(variant.package_key);
      if (!row) fail("PACKAGE_NOT_IN_BUNDLE", 409);
      await client.query(
        `UPDATE public.service_packages
            SET service_level_key=$2, service_level_label=$3, unit_price_modifier=$4, updated_at=NOW()
          WHERE service_package_id=$1`,
        [row.service_package_id, variant.service_level_key, variant.service_level_label, variant.unit_price_modifier]
      );
    }
    if (value.selection_mode === "exclusive_level") {
      const selected = new Set(value.variants.map((variant) => variant.package_key));
      const activeMissing = packageRows.rows.filter((row) => !selected.has(row.package_key));
      if (activeMissing.length) {
        const activeQ = await client.query(
          `SELECT package_key FROM public.service_packages
            WHERE catalog_item_id=$1 AND is_active=TRUE AND NOT (package_key = ANY($2::text[])) LIMIT 1`,
          [parent.item_id, [...selected]]
        );
        if (activeQ.rows.length) fail("ACTIVE_VARIANT_POLICY_MISSING", 409);
      }
    }
    await client.query("COMMIT");
    return value;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw error;
  } finally {
    if (release) client.release();
  }
}

module.exports = {
  PromotionPolicyAdminError,
  validatePromotionPolicy,
  updatePromotionPolicy,
};
