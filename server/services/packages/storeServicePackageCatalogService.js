"use strict";

const crypto = require("node:crypto");
const repository = require("./servicePackageRepository");
const { validate: validatePackage } = require("./servicePackageCatalogService");

class StoreServicePackageCatalogError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "StoreServicePackageCatalogError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, message, status) { throw new StoreServicePackageCatalogError(code, message, status); }
function requiredText(value, field, max = 300) {
  const text = String(value == null ? "" : value).trim();
  if (!text || text.length > max) fail("INVALID_BUNDLE", `${field} is required and must not exceed ${max} characters`);
  return text;
}
function optionalText(value, max) {
  if (value == null || String(value).trim() === "") return null;
  const text = String(value).trim();
  if (text.length > max) fail("INVALID_BUNDLE", `Text must not exceed ${max} characters`);
  return text;
}
function boolean(value, field) {
  if (typeof value !== "boolean") fail("INVALID_BUNDLE", `${field} must be boolean`);
  return value;
}
function instant(value, field) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail("INVALID_BUNDLE", `${field} must be an ISO date-time`);
  return new Date(value).toISOString();
}
function generatedKey(prefix) { return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`; }

function validate(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("INVALID_BUNDLE", "Bundle payload is required");
  if (Object.prototype.hasOwnProperty.call(input, "service_bundle_key")) fail("IMMUTABLE_KEY", "service_bundle_key is server-controlled");
  const sellStart = instant(input.sell_start_at, "sell_start_at");
  const sellEnd = instant(input.sell_end_at, "sell_end_at");
  const redeemUntil = instant(input.redeem_until, "redeem_until");
  if (sellStart && sellEnd && sellEnd < sellStart) fail("INVALID_SELL_WINDOW", "sell_end_at must not precede sell_start_at");
  if (redeemUntil && sellEnd && redeemUntil < sellEnd) fail("INVALID_REDEEM_WINDOW", "redeem_until must not precede sell_end_at");
  if (!Array.isArray(input.variants) || !input.variants.length) fail("INVALID_VARIANTS", "At least one variant is required");
  const variants = input.variants.map((raw, index) => {
    const packageKey = raw?.package_key == null ? null : requiredText(raw.package_key, "package_key", 128);
    const packageInput = { ...raw };
    delete packageInput.package_key;
    delete packageInput.packageKey;
    const value = validatePackage({
      ...packageInput,
      sell_start_at: null,
      sell_end_at: null,
      redeem_until: null,
    });
    return { ...value, package_key: packageKey, sort_order: Number.isInteger(Number(raw.sort_order)) ? Number(raw.sort_order) : index };
  });
  const keys = variants.map((variant) => variant.package_key).filter(Boolean);
  if (keys.length !== new Set(keys).size) fail("INVALID_VARIANTS", "Duplicate package_key values are not allowed");
  for (let i = 0; i < variants.length; i += 1) {
    for (let j = i + 1; j < variants.length; j += 1) {
      const a = variants[i]; const b = variants[j];
      if (!a.is_active || !b.is_active || a.job_type !== b.job_type || a.ac_type !== b.ac_type || a.wash_variant !== b.wash_variant) continue;
      const aMin = a.btu_min == null ? -Infinity : a.btu_min; const aMax = a.btu_max == null ? Infinity : a.btu_max;
      const bMin = b.btu_min == null ? -Infinity : b.btu_min; const bMax = b.btu_max == null ? Infinity : b.btu_max;
      if (Math.max(aMin, bMin) <= Math.min(aMax, bMax)) fail("OVERLAPPING_VARIANT_RANGE", "Active variants with the same taxonomy must not overlap BTU ranges");
    }
  }
  return {
    item_name: requiredText(input.item_name, "item_name"),
    short_description: optionalText(input.short_description, 300),
    long_description: optionalText(input.long_description, 5000),
    highlights: Array.isArray(input.highlights) ? input.highlights.map((x) => String(x).trim()).filter(Boolean).slice(0, 20) : [],
    service_conditions: optionalText(input.service_conditions, 3000),
    is_active: boolean(input.is_active, "is_active"),
    is_customer_visible: boolean(input.is_customer_visible, "is_customer_visible"),
    is_featured: input.is_featured == null ? false : boolean(input.is_featured, "is_featured"),
    is_autoplay_enabled: input.is_autoplay_enabled == null ? true : boolean(input.is_autoplay_enabled, "is_autoplay_enabled"),
    sell_start_at: sellStart, sell_end_at: sellEnd, redeem_until: redeemUntil, variants,
  };
}

function variantDto(row) {
  return {
    package_key: row.package_key, display_name: row.display_name, description: row.description,
    service_key: row.service_key, service_name: row.service_name, job_type: row.job_type,
    ac_type: row.ac_type, wash_variant: row.wash_variant, btu_min: row.btu_min, btu_max: row.btu_max,
    service_unit_duration_minutes: Number(row.service_unit_duration_minutes), sort_order: Number(row.sort_order || 0),
    is_active: Boolean(row.is_active), is_customer_visible: Boolean(row.is_customer_visible),
    tiers: (row.tiers || []).map((tier) => ({
      tier_key: tier.tier_key, display_name: tier.display_name, service_quantity: Number(tier.service_quantity),
      fixed_total_price: String(tier.fixed_total_price), sort_order: Number(tier.sort_order), is_active: Boolean(tier.is_active),
    })),
  };
}

async function loadBundle(db, bundleKey, { lock = false } = {}) {
  const result = await db.query(
    `SELECT * FROM public.catalog_items WHERE service_bundle_key=$1${lock ? " FOR UPDATE" : ""}`,
    [bundleKey]
  );
  return result.rows[0] || null;
}

async function listBundles(db) {
  const result = await db.query("SELECT * FROM public.catalog_items WHERE booking_mode='service_package' ORDER BY item_id DESC");
  const rows = result.rows;
  const variants = await repository.listLinkedPackagesForCatalogItems(db, rows.map((row) => row.item_id));
  const byItem = new Map();
  variants.forEach((variant) => {
    const key = String(variant.catalog_item_id);
    if (!byItem.has(key)) byItem.set(key, []);
    byItem.get(key).push(variantDto(variant));
  });
  return rows.map((row) => ({
    service_bundle_key: row.service_bundle_key, item_id: String(row.item_id), item_name: row.item_name,
    short_description: row.short_description, long_description: row.long_description,
    highlights: Array.isArray(row.highlights) ? row.highlights : [], service_conditions: row.service_conditions,
    booking_mode: row.booking_mode, sell_start_at: row.service_package_sell_start_at,
    sell_end_at: row.service_package_sell_end_at, redeem_until: row.service_package_redeem_until,
    is_active: Boolean(row.is_active), is_customer_visible: Boolean(row.is_customer_visible),
    is_featured: Boolean(row.is_featured), is_autoplay_enabled: Boolean(row.is_autoplay_enabled),
    variants: byItem.get(String(row.item_id)) || [],
  }));
}

function createStoreServicePackageCatalogService({ pool, packageRepository = repository }) {
  async function save(input, bundleKey = null) {
    const value = validate(input);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      let parent = bundleKey ? await loadBundle(client, bundleKey, { lock: true }) : null;
      if (bundleKey && !parent) fail("BUNDLE_NOT_FOUND", "Store service-package bundle was not found", 404);
      if (!parent) {
        const inserted = await client.query(
          `INSERT INTO public.catalog_items
            (item_name,item_category,base_price,unit_label,job_category,ac_type,is_active,is_customer_visible,
             short_description,long_description,highlights,service_conditions,booking_mode,is_featured,is_autoplay_enabled,
             service_bundle_key,service_package_sell_start_at,service_package_sell_end_at,service_package_redeem_until)
           VALUES ($1,'service',0,'package',$2,$3,$4,$5,$6,$7,$8,$9,'service_package',$10,$11,$12,$13,$14,$15)
           RETURNING *`,
          [value.item_name, value.variants[0].job_type, value.variants[0].ac_type, value.is_active, value.is_customer_visible,
            value.short_description, value.long_description, JSON.stringify(value.highlights), value.service_conditions,
            value.is_featured, value.is_autoplay_enabled, generatedKey("bundle"), value.sell_start_at, value.sell_end_at, value.redeem_until]
        );
        parent = inserted.rows[0];
      } else {
        const updated = await client.query(
          `UPDATE public.catalog_items SET item_name=$2,job_category=$3,ac_type=$4,is_active=$5,is_customer_visible=$6,
             short_description=$7,long_description=$8,highlights=$9,service_conditions=$10,is_featured=$11,
             is_autoplay_enabled=$12,service_package_sell_start_at=$13,service_package_sell_end_at=$14,
             service_package_redeem_until=$15,updated_at=NOW() WHERE item_id=$1 RETURNING *`,
          [parent.item_id, value.item_name, value.variants[0].job_type, value.variants[0].ac_type, value.is_active,
            value.is_customer_visible, value.short_description, value.long_description, JSON.stringify(value.highlights),
            value.service_conditions, value.is_featured, value.is_autoplay_enabled, value.sell_start_at, value.sell_end_at, value.redeem_until]
        );
        parent = updated.rows[0];
      }

      const existingResult = await client.query("SELECT * FROM public.service_packages WHERE catalog_item_id=$1 FOR UPDATE", [parent.item_id]);
      const existingByKey = new Map(existingResult.rows.map((row) => [row.package_key, row]));
      const keptPackageIds = [];
      for (const variant of value.variants) {
        let packageRow;
        let existingTiers = [];
        if (variant.package_key) {
          const existing = existingByKey.get(variant.package_key);
          if (!existing) fail("INVALID_PACKAGE_KEY", "package_key does not belong to this bundle");
          existingTiers = await packageRepository.listTiersForUpdate(client, existing.service_package_id);
          packageRow = await packageRepository.updatePackage(client, existing.service_package_id, {
            ...variant, catalog_item_id: parent.item_id, sort_order: variant.sort_order,
          });
        } else {
          packageRow = await packageRepository.insertPackage(client, {
            ...variant, package_key: generatedKey("pkg"), catalog_item_id: parent.item_id,
            sort_order: variant.sort_order, sell_start_at: null, sell_end_at: null, redeem_until: null,
          });
        }
        keptPackageIds.push(packageRow.service_package_id);
        const existingTiersByKey = new Map(existingTiers.map((tier) => [tier.tier_key, tier]));
        const keptTierIds = [];
        for (const tier of variant.tiers) {
          let saved;
          if (tier.tier_key) {
            const existing = existingTiersByKey.get(tier.tier_key);
            if (!existing) fail("INVALID_TIER_KEY", "tier_key does not belong to this variant");
            saved = await packageRepository.updateTier(client, existing.service_package_tier_id, tier);
          } else {
            saved = await packageRepository.insertTier(client, packageRow.service_package_id, { ...tier, tier_key: generatedKey("tier") });
          }
          keptTierIds.push(saved.service_package_tier_id);
        }
        if (variant.package_key) await packageRepository.deactivateTiers(client, packageRow.service_package_id, keptTierIds);
      }
      await client.query(
        `UPDATE public.service_packages SET is_active=FALSE,is_customer_visible=FALSE,updated_at=NOW()
          WHERE catalog_item_id=$1 AND NOT (service_package_id = ANY($2::bigint[]))`,
        [parent.item_id, keptPackageIds]
      );
      await client.query("COMMIT");
      return (await listBundles(client)).find((row) => row.service_bundle_key === parent.service_bundle_key);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }
  return { list: () => listBundles(pool), create: (input) => save(input), update: (key, input) => save(input, requiredText(key, "service_bundle_key", 128)) };
}

module.exports = { StoreServicePackageCatalogError, validate, createStoreServicePackageCatalogService };
