"use strict";

const repository = require("./servicePackageRepository");

class ServicePackageResolutionError extends Error {
  constructor(code, message) { super(message); this.name = "ServicePackageResolutionError"; this.code = code; }
}

function fail(code, message) { throw new ServicePackageResolutionError(code, message); }
function instant(value) { return value == null ? null : new Date(value).toISOString(); }

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
    }],
    fixed_total_price: Number(tierRow.fixed_total_price),
    redeem_until: instant(packageRow.redeem_until),
  };
}

function readSnapshot(snapshot) {
  const value = typeof snapshot === "string" ? JSON.parse(snapshot) : snapshot;
  if (!value || value.schema_version !== 1 || !value.package || !value.tier
      || !Array.isArray(value.service_lines) || value.service_lines.length !== 1
      || !Number.isFinite(Number(value.fixed_total_price))) {
    fail("INVALID_PACKAGE_SNAPSHOT", "Package snapshot is invalid or unsupported");
  }
  return structuredClone(value);
}

function createServicePackageResolver({ db, packageRepository = repository, now = () => new Date() }) {
  return {
    async resolveSelection(input = {}) {
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
