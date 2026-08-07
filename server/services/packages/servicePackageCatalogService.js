"use strict";

const crypto = require("node:crypto");
const repository = require("./servicePackageRepository");
const { normalizeServiceType, normalizeAcType, normalizeWashVariantLabel, normalizeWashKey } = require("../../normalizers");

const JOB_TYPES = new Set(["wash", "repair", "install"].map(normalizeServiceType));
const AC_TYPES = new Set(["wall", "cassette", "floor", "ceiling"].map(normalizeAcType));

class ServicePackageCatalogError extends Error {
  constructor(code, message, status = 400) { super(message); this.name = "ServicePackageCatalogError"; this.code = code; this.status = status; }
}

function fail(code, message, status) { throw new ServicePackageCatalogError(code, message, status); }
function text(value, field, max = 200) {
  const result = String(value == null ? "" : value).trim();
  if (!result || result.length > max) fail("INVALID_PACKAGE", `${field} is required and must not exceed ${max} characters`);
  return result;
}
function optionalText(value, max = 2000) {
  if (value == null || String(value).trim() === "") return null;
  const result = String(value).trim();
  if (result.length > max) fail("INVALID_PACKAGE", `Text must not exceed ${max} characters`);
  return result;
}
function bool(value, field) {
  if (typeof value !== "boolean") fail("INVALID_PACKAGE", `${field} must be boolean`);
  return value;
}
function positiveInt(value, field, optional = false) {
  if (optional && (value == null || value === "")) return null;
  const result = Number(value);
  if (!Number.isInteger(result) || result <= 0) fail("INVALID_PACKAGE", `${field} must be a positive integer`);
  return result;
}
function date(value, field) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail("INVALID_PACKAGE", `${field} must be a valid date-time`);
  return new Date(value).toISOString();
}
function money(value) {
  const result = String(value == null ? "" : value).trim();
  if (!/^\d+\.\d{2}$/.test(result)) {
    fail("INVALID_TIER", "fixed_total_price must be positive decimal text with exactly two fractional digits");
  }
  if (Number(result) <= 0) fail("INVALID_TIER", "fixed_total_price must be positive");
  return Number(result).toFixed(2);
}
function key(prefix) { return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`; }

function validate(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("INVALID_PACKAGE", "Package payload is required");
  if (Object.prototype.hasOwnProperty.call(input, "package_key") || Object.prototype.hasOwnProperty.call(input, "packageKey")) {
    fail("IMMUTABLE_KEY", "package_key is server-controlled");
  }
  const jobType = normalizeServiceType(text(input.job_type, "job_type", 80));
  const acType = normalizeAcType(text(input.ac_type, "ac_type", 80));
  if (!JOB_TYPES.has(jobType) || !AC_TYPES.has(acType)) fail("INVALID_SERVICE_CONSTRAINTS", "Unsupported job_type or ac_type");
  let washVariant = optionalText(input.wash_variant, 100);
  if (washVariant) washVariant = normalizeWashVariantLabel(washVariant);
  if (jobType === normalizeServiceType("wash") && acType === normalizeAcType("wall") && !normalizeWashKey(washVariant)) {
    fail("INVALID_SERVICE_CONSTRAINTS", "Wall cleaning packages require a supported wash_variant");
  }
  const btuMin = positiveInt(input.btu_min, "btu_min", true);
  const btuMax = positiveInt(input.btu_max, "btu_max", true);
  if (btuMin && btuMax && btuMin > btuMax) fail("INVALID_SERVICE_CONSTRAINTS", "btu_min must not exceed btu_max");
  const sellStart = date(input.sell_start_at, "sell_start_at");
  const sellEnd = date(input.sell_end_at, "sell_end_at");
  const redeemUntil = date(input.redeem_until, "redeem_until");
  if (sellStart && sellEnd && sellEnd < sellStart) fail("INVALID_SELL_WINDOW", "sell_end_at must not precede sell_start_at");
  if (redeemUntil && ((sellEnd && redeemUntil < sellEnd) || (sellStart && redeemUntil < sellStart))) {
    fail("INVALID_REDEEM_WINDOW", "redeem_until must not precede the sale window");
  }
  if (!Array.isArray(input.tiers)) fail("INVALID_TIER", "tiers must be an array");
  const tiers = input.tiers.map((tier, index) => {
    if (!tier || typeof tier !== "object" || Array.isArray(tier)) fail("INVALID_TIER", "Each tier must be an object");
    const tierKey = tier.tier_key == null ? null : text(tier.tier_key, "tier_key", 200);
    return { tier_key: tierKey, display_name: text(tier.display_name, "tier display_name"),
      service_quantity: positiveInt(tier.service_quantity, "service_quantity"),
      fixed_total_price: money(tier.fixed_total_price), sort_order: Number.isInteger(Number(tier.sort_order)) ? Number(tier.sort_order) : index,
      is_active: bool(tier.is_active, "tier is_active") };
  });
  const suppliedKeys = tiers.map((tier) => tier.tier_key).filter(Boolean);
  if (new Set(suppliedKeys).size !== suppliedKeys.length) fail("INVALID_TIER_KEY", "Duplicate tier_key values are not allowed");
  const isActive = bool(input.is_active, "is_active");
  const isVisible = bool(input.is_customer_visible, "is_customer_visible");
  if ((isActive || isVisible) && !tiers.some((tier) => tier.is_active)) fail("INVALID_TIER", "An active or visible package requires an active tier");
  return { display_name: text(input.display_name, "display_name"), description: optionalText(input.description),
    service_key: text(input.service_key, "service_key"), service_name: text(input.service_name, "service_name"),
    job_type: jobType, ac_type: acType, wash_variant: washVariant, btu_min: btuMin, btu_max: btuMax,
    service_unit_duration_minutes: positiveInt(input.service_unit_duration_minutes, "service_unit_duration_minutes"),
    sell_start_at: sellStart, sell_end_at: sellEnd, redeem_until: redeemUntil,
    is_active: isActive, is_customer_visible: isVisible, tiers };
}

function lifecycle(row, at = new Date()) {
  if (!row.is_active && !row.is_customer_visible) return "draft";
  if (!row.is_active) return "disabled";
  if (!row.is_customer_visible) return "hidden";
  if (row.redeem_until && at > new Date(row.redeem_until)) return "redeem-ended";
  if (row.sell_end_at && at > new Date(row.sell_end_at)) return "sale-ended";
  if (row.sell_start_at && at < new Date(row.sell_start_at)) return "upcoming";
  return "on-sale";
}
function dto(row, at) {
  return { package_key: row.package_key, display_name: row.display_name, description: row.description,
    service_key: row.service_key, service_name: row.service_name, job_type: row.job_type, ac_type: row.ac_type,
    wash_variant: row.wash_variant, btu_min: row.btu_min, btu_max: row.btu_max,
    service_unit_duration_minutes: row.service_unit_duration_minutes,
    sell_start_at: row.sell_start_at, sell_end_at: row.sell_end_at, redeem_until: row.redeem_until,
    is_active: row.is_active, is_customer_visible: row.is_customer_visible, lifecycle_status: lifecycle(row, at),
    tiers: (row.tiers || []).map((tier) => ({ tier_key: tier.tier_key, display_name: tier.display_name,
      service_quantity: Number(tier.service_quantity), fixed_total_price: Number(tier.fixed_total_price).toFixed(2),
      sort_order: Number(tier.sort_order), is_active: tier.is_active })) };
}

function createServicePackageCatalogService({ pool, packageRepository = repository, now = () => new Date() }) {
  if (!pool || typeof pool.query !== "function" || typeof pool.connect !== "function") throw new TypeError("PostgreSQL pool is required");
  async function list() { return (await packageRepository.listCatalogPackages(pool)).map((row) => dto(row, now())); }
  async function save(input, packageKey) {
    const value = validate(input);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      let packageRow;
      let existingTiers = [];
      if (packageKey) {
        packageRow = await packageRepository.findPackageByKeyForUpdate(client, packageKey);
        if (!packageRow) fail("PACKAGE_NOT_FOUND", "Service package was not found", 404);
        existingTiers = await packageRepository.listTiersForUpdate(client, packageRow.service_package_id);
        packageRow = await packageRepository.updatePackage(client, packageRow.service_package_id, value);
      } else {
        packageRow = await packageRepository.insertPackage(client, { ...value, package_key: key("pkg") });
      }
      const existingByKey = new Map(existingTiers.map((tier) => [tier.tier_key, tier]));
      const keptIds = [];
      const savedTiers = [];
      for (const tier of value.tiers) {
        if (tier.tier_key) {
          const existing = existingByKey.get(tier.tier_key);
          if (!existing) fail("INVALID_TIER_KEY", "tier_key does not belong to this package");
          const saved = await packageRepository.updateTier(client, existing.service_package_tier_id, tier);
          keptIds.push(existing.service_package_tier_id); savedTiers.push(saved);
        } else {
          const saved = await packageRepository.insertTier(client, packageRow.service_package_id, { ...tier, tier_key: key("tier") });
          keptIds.push(saved.service_package_tier_id); savedTiers.push(saved);
        }
      }
      if (packageKey) await packageRepository.deactivateTiers(client, packageRow.service_package_id, keptIds);
      await client.query("COMMIT");
      return dto({ ...packageRow, tiers: savedTiers }, now());
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch (_) { /* preserve original error */ }
      if (error?.code === "23505") fail("PACKAGE_KEY_CONFLICT", "A generated package or tier key conflicted; please retry", 409);
      throw error;
    } finally { client.release(); }
  }
  return { list, create: (input) => save(input, null), update: (packageKey, input) => save(input, text(packageKey, "package_key")) };
}

module.exports = { ServicePackageCatalogError, createServicePackageCatalogService, validate, lifecycle };
