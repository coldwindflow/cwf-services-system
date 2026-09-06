"use strict";

const PRICING_STRATEGIES = new Set(["per_variant_tier", "total_quantity_tier_plus_unit_modifiers"]);
const SELECTION_MODES = new Set(["multi_variant", "exclusive_level"]);
const PAYMENT_MODES = new Set(["book_now", "prepaid_full"]);

class PromotionPolicyAdminError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "PromotionPolicyAdminError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function fail(code, message, statusCode) {
  throw new PromotionPolicyAdminError(code, message, statusCode);
}

function clean(value, max = 160) {
  const text = String(value == null ? "" : value).trim();
  if (text.length > max) fail("INVALID_PROMOTION_POLICY", `text exceeds ${max} characters`);
  return text;
}

function enumValue(value, allowed, field) {
  const text = clean(value, 80);
  if (!allowed.has(text)) fail("INVALID_PROMOTION_POLICY", `${field} is invalid`);
  return text;
}

function nullableInt(value, field, min, max) {
  if (value == null || String(value).trim() === "") return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) fail("INVALID_PROMOTION_POLICY", `${field} must be a whole number`);
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    fail("INVALID_PROMOTION_POLICY", `${field} must be between ${min} and ${max}`);
  }
  return number;
}

function money(value, field = "unit_price_modifier") {
  const text = String(value == null || value === "" ? "0" : value).trim();
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(text)) {
    fail("INVALID_PROMOTION_POLICY", `${field} must be a non-negative amount with at most two decimals`);
  }
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0 || number > 9999999999.99) {
    fail("INVALID_PROMOTION_POLICY", `${field} is out of range`);
  }
  return number.toFixed(2);
}

function bool(value, field) {
  if (typeof value !== "boolean") fail("INVALID_PROMOTION_POLICY", `${field} must be boolean`);
  return value;
}

function normalizeVariant(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("INVALID_PROMOTION_POLICY", "variant policy must be an object");
  const packageKey = clean(raw.package_key, 128);
  if (!packageKey) fail("INVALID_PROMOTION_POLICY", "package_key is required");
  return {
    package_key: packageKey,
    service_level_key: clean(raw.service_level_key, 80) || null,
    service_level_label: clean(raw.service_level_label, 120) || null,
    unit_price_modifier: money(raw.unit_price_modifier),
  };
}

function normalizePolicy(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("INVALID_PROMOTION_POLICY", "promotion policy payload is required");
  if (!Array.isArray(input.variants)) fail("INVALID_PROMOTION_POLICY", "variants must be an array");
  const variants = input.variants.map(normalizeVariant);
  if (variants.length > 99) fail("INVALID_PROMOTION_POLICY", "too many variants");
  const keys = variants.map((variant) => variant.package_key);
  if (new Set(keys).size !== keys.length) fail("INVALID_PROMOTION_POLICY", "duplicate package_key");
  return {
    pricing_strategy: enumValue(input.pricing_strategy || "per_variant_tier", PRICING_STRATEGIES, "pricing_strategy"),
    selection_mode: enumValue(input.selection_mode || "multi_variant", SELECTION_MODES, "selection_mode"),
    maximum_total_quantity: nullableInt(input.maximum_total_quantity, "maximum_total_quantity", 1, 99),
    payment_mode: enumValue(input.payment_mode || "book_now", PAYMENT_MODES, "payment_mode"),
    warranty_days: nullableInt(input.warranty_days, "warranty_days", 1, 3650),
    is_active: bool(input.is_active, "is_active"),
    is_customer_visible: bool(input.is_customer_visible, "is_customer_visible"),
    variants,
  };
}

function dto(parent, variants) {
  return {
    service_bundle_key: parent.service_bundle_key,
    item_id: String(parent.item_id),
    pricing_strategy: parent.service_package_pricing_strategy || "per_variant_tier",
    selection_mode: parent.service_package_selection_mode || "multi_variant",
    maximum_total_quantity: parent.service_package_maximum_total_quantity == null ? null : Number(parent.service_package_maximum_total_quantity),
    payment_mode: parent.service_package_payment_mode || "book_now",
    warranty_days: parent.service_package_warranty_days == null ? null : Number(parent.service_package_warranty_days),
    is_active: Boolean(parent.is_active),
    is_customer_visible: Boolean(parent.is_customer_visible),
    variants: variants.map((row) => ({
      package_key: row.package_key,
      service_level_key: row.service_level_key || null,
      service_level_label: row.service_level_label || null,
      unit_price_modifier: String(row.unit_price_modifier == null ? "0.00" : row.unit_price_modifier),
    })),
  };
}

async function loadParent(db, bundleKey, { lock = false } = {}) {
  const result = await db.query(
    `SELECT item_id, service_bundle_key, is_active, is_customer_visible,
            service_package_redeem_until, service_package_pricing_strategy,
            service_package_selection_mode, service_package_maximum_total_quantity,
            service_package_payment_mode, service_package_warranty_days
       FROM public.catalog_items
      WHERE service_bundle_key=$1${lock ? " FOR UPDATE" : ""}`,
    [bundleKey]
  );
  return result.rows[0] || null;
}

async function loadVariants(db, itemId, { lock = false } = {}) {
  const result = await db.query(
    `SELECT service_package_id, package_key, is_active, is_customer_visible,
            service_level_key, service_level_label, unit_price_modifier
       FROM public.service_packages
      WHERE catalog_item_id=$1
      ORDER BY sort_order, service_package_id${lock ? " FOR UPDATE" : ""}`,
    [itemId]
  );
  return result.rows || [];
}

function assertExactVariantSet(current, supplied) {
  const currentKeys = current.map((row) => String(row.package_key)).sort();
  const suppliedKeys = supplied.map((row) => String(row.package_key)).sort();
  if (currentKeys.length !== suppliedKeys.length || currentKeys.some((key, index) => key !== suppliedKeys[index])) {
    fail("PROMOTION_POLICY_VARIANT_SET_CHANGED", "variant set changed; reload the promotion and retry", 409);
  }
}

function assertLevelPolicy(current, policy) {
  if (policy.selection_mode !== "exclusive_level") return;
  const byKey = new Map(policy.variants.map((variant) => [variant.package_key, variant]));
  for (const row of current) {
    if (!row.is_active && !row.is_customer_visible) continue;
    const supplied = byKey.get(String(row.package_key));
    if (!supplied?.service_level_key) {
      fail("SERVICE_PACKAGE_LEVEL_REQUIRED", "active variants require service_level_key in exclusive_level mode");
    }
  }
}

function assertPrepaidPolicy(parent, policy) {
  if (policy.payment_mode !== "prepaid_full") return;
  if (!parent.service_package_redeem_until) {
    fail("PREPAID_REDEEM_DEADLINE_REQUIRED", "prepaid promotions require redeem_until");
  }
  if (!policy.warranty_days) {
    fail("PREPAID_WARRANTY_REQUIRED", "prepaid promotions require warranty_days");
  }
}

function createPromotionPolicyAdminService({ pool }) {
  if (!pool || typeof pool.query !== "function" || typeof pool.connect !== "function") {
    throw new TypeError("PostgreSQL pool is required");
  }

  async function get(bundleKey) {
    const key = clean(bundleKey, 128);
    if (!key) fail("BUNDLE_NOT_FOUND", "bundle key is required", 404);
    const parent = await loadParent(pool, key);
    if (!parent) fail("BUNDLE_NOT_FOUND", "promotion bundle was not found", 404);
    return dto(parent, await loadVariants(pool, parent.item_id));
  }

  async function update(bundleKey, input) {
    const key = clean(bundleKey, 128);
    if (!key) fail("BUNDLE_NOT_FOUND", "bundle key is required", 404);
    const policy = normalizePolicy(input);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const parent = await loadParent(client, key, { lock: true });
      if (!parent) fail("BUNDLE_NOT_FOUND", "promotion bundle was not found", 404);
      const variants = await loadVariants(client, parent.item_id, { lock: true });
      assertExactVariantSet(variants, policy.variants);
      assertLevelPolicy(variants, policy);
      assertPrepaidPolicy(parent, policy);

      await client.query(
        `UPDATE public.catalog_items
            SET service_package_pricing_strategy=$2,
                service_package_selection_mode=$3,
                service_package_maximum_total_quantity=$4,
                service_package_payment_mode=$5,
                service_package_warranty_days=$6,
                is_active=$7,
                is_customer_visible=$8,
                updated_at=NOW()
          WHERE item_id=$1`,
        [parent.item_id, policy.pricing_strategy, policy.selection_mode, policy.maximum_total_quantity,
          policy.payment_mode, policy.warranty_days, policy.is_active, policy.is_customer_visible]
      );

      const byKey = new Map(policy.variants.map((variant) => [variant.package_key, variant]));
      for (const row of variants) {
        const variant = byKey.get(String(row.package_key));
        await client.query(
          `UPDATE public.service_packages
              SET service_level_key=$2, service_level_label=$3, unit_price_modifier=$4, updated_at=NOW()
            WHERE service_package_id=$1`,
          [row.service_package_id, variant.service_level_key, variant.service_level_label, variant.unit_price_modifier]
        );
      }

      await client.query("COMMIT");
      return get(key);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch (_) {}
      throw error;
    } finally {
      client.release();
    }
  }

  return { get, update };
}

module.exports = {
  PromotionPolicyAdminError,
  normalizePolicy,
  createPromotionPolicyAdminService,
};
