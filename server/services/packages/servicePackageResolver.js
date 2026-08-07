"use strict";

const repository = require("./servicePackageRepository");
const { normalizeServiceType, normalizeAcType, normalizeWashVariantLabel, normalizeWashKey } = require("../../normalizers");

class ServicePackageResolutionError extends Error {
  constructor(code, message) { super(message); this.name = "ServicePackageResolutionError"; this.code = code; }
}

function fail(code, message) { throw new ServicePackageResolutionError(code, message); }
function instant(value) { return value == null ? null : new Date(value).toISOString(); }
function decimalText(value) {
  const text = String(value == null ? "" : value).trim();
  const match = /^(\d+)\.(\d{2})$/.exec(text);
  if (!match || (BigInt(match[1]) === 0n && match[2] === "00")) {
    fail("INVALID_PACKAGE_PRICE", "Package fixed total must be positive decimal text with two fractional digits");
  }
  return text;
}

function positiveIntegerOrNull(value, field) {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) fail("INVALID_SERVICE_CONSTRAINTS", `${field} must be a positive integer`);
  return number;
}

function serviceConstraints(packageRow) {
  const jobType = normalizeServiceType(packageRow.job_type);
  const acType = normalizeAcType(packageRow.ac_type);
  const washVariant = packageRow.wash_variant == null ? null : normalizeWashVariantLabel(packageRow.wash_variant);
  const btuMin = positiveIntegerOrNull(packageRow.btu_min, "btu_min");
  const btuMax = positiveIntegerOrNull(packageRow.btu_max, "btu_max");
  if (!jobType || !acType || (btuMin != null && btuMax != null && btuMax < btuMin)) {
    fail("INVALID_SERVICE_CONSTRAINTS", "Package service constraints are invalid");
  }
  if (normalizeServiceType("wash") === jobType && normalizeAcType("wall") === acType && (!washVariant || !normalizeWashKey(washVariant))) {
    fail("INVALID_SERVICE_CONSTRAINTS", "Wall cleaning packages require a valid wash_variant");
  }
  return { job_type: jobType, ac_type: acType, wash_variant: washVariant, btu_min: btuMin, btu_max: btuMax };
}

function buildSnapshot(packageRow, tierRow) {
  return {
    schema_version: 1,
    package: { id: String(packageRow.service_package_id), key: packageRow.package_key, name: packageRow.display_name },
    tier: { id: String(tierRow.service_package_tier_id), key: tierRow.tier_key, name: tierRow.display_name },
    service_lines: [{
      service_key: packageRow.service_key,
      service_name: packageRow.service_name,
      quantity: Number(tierRow.service_quantity),
      unit_duration_minutes: Number(packageRow.service_unit_duration_minutes),
      service_constraints: serviceConstraints(packageRow),
    }],
    fixed_total_price: decimalText(tierRow.fixed_total_price),
    redeem_until: instant(packageRow.redeem_until),
  };
}

function readSnapshot(snapshot) {
  const value = typeof snapshot === "string" ? JSON.parse(snapshot) : snapshot;
  if (!value || value.schema_version !== 1 || !value.package || !value.tier
      || !Array.isArray(value.service_lines) || value.service_lines.length !== 1
      || !/^\d+\.\d{2}$/.test(String(value.fixed_total_price))) {
    fail("INVALID_PACKAGE_SNAPSHOT", "Package snapshot is invalid or unsupported");
  }
  return structuredClone(value);
}

function createServicePackageResolver({ db, packageRepository = repository, now = () => new Date() }) {
  return {
    async resolveSelection(input = {}, { identity = "customer" } = {}) {
      if (identity !== "customer" && identity !== "admin") fail("INVALID_RESOLUTION_IDENTITY", "Resolution identity must be customer or admin");
      if (input.packageId == null && !String(input.packageKey || "").trim()) {
        fail("PACKAGE_IDENTITY_REQUIRED", "Package ID or key is required");
      }
      if (input.tierId == null && !String(input.tierKey || "").trim()) {
        fail("TIER_IDENTITY_REQUIRED", "Tier ID or key is required");
      }
      const packageRow = input.packageId != null
        ? await packageRepository.findPackageById(db, input.packageId)
        : await packageRepository.findPackageByKey(db, input.packageKey);
      if (!packageRow) fail("PACKAGE_NOT_FOUND", "Service package was not found");
      if (!packageRow.is_active) fail("PACKAGE_INACTIVE", "Service package is inactive");
      if (identity === "customer" && !packageRow.is_customer_visible) fail("PACKAGE_NOT_CUSTOMER_VISIBLE", "Service package is not customer visible");
      const at = now();
      if (packageRow.sell_start_at && at < new Date(packageRow.sell_start_at)) fail("PACKAGE_NOT_ON_SALE", "Service package sale has not started");
      if (packageRow.sell_end_at && at > new Date(packageRow.sell_end_at)) fail("PACKAGE_NOT_ON_SALE", "Service package sale has ended");
      const tierRow = await packageRepository.findTier(db, {
        packageId: packageRow.service_package_id, tierId: input.tierId, tierKey: input.tierKey,
      });
      if (!tierRow) fail("TIER_PACKAGE_MISMATCH", "Tier does not belong to the selected package");
      if (!tierRow.is_active) fail("TIER_INACTIVE", "Service package tier is inactive");
      const snapshot = buildSnapshot(packageRow, tierRow);
      return { ...snapshot, snapshot };
    },
    readSnapshot,
    listCustomerVisible(options) { return packageRepository.listCustomerVisiblePackages(db, options); },
  };
}

module.exports = { ServicePackageResolutionError, buildSnapshot, readSnapshot, createServicePackageResolver };
