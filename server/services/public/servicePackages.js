"use strict";

const {
  ServicePackageResolutionError,
  buildSnapshot,
} = require("../packages/servicePackageResolver");

class PublicServicePackageError extends Error {
  constructor(status, code) {
    super(code);
    this.name = "PublicServicePackageError";
    this.status = status;
    this.code = code;
  }
}

function isoInstant(value) {
  if (value == null) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("invalid package date");
  return date.toISOString();
}

function publicPreview(snapshot, metadata = {}) {
  const line = snapshot.service_lines[0];
  return {
    package_key: snapshot.package.key,
    package_name: snapshot.package.name,
    description: metadata.description == null ? null : String(metadata.description),
    tier_key: snapshot.tier.key,
    tier_name: snapshot.tier.name,
    fixed_total_price: snapshot.fixed_total_price,
    quantity: line.quantity,
    unit_duration_minutes: line.unit_duration_minutes,
    service: {
      service_key: line.service_key,
      service_name: line.service_name,
      constraints: { ...line.service_constraints },
    },
    sell_start_at: isoInstant(metadata.sell_start_at),
    sell_end_at: isoInstant(metadata.sell_end_at),
    redeem_until: snapshot.redeem_until,
  };
}

function mapResolutionError(error) {
  if (!(error instanceof ServicePackageResolutionError)) return error;
  if (["PACKAGE_IDENTITY_REQUIRED", "TIER_IDENTITY_REQUIRED"].includes(error.code)) {
    return new PublicServicePackageError(400, "INVALID_PACKAGE_SELECTION");
  }
  if (["TIER_PACKAGE_MISMATCH", "TIER_INACTIVE"].includes(error.code)) {
    return new PublicServicePackageError(404, "SERVICE_PACKAGE_TIER_NOT_AVAILABLE");
  }
  if (["PACKAGE_NOT_FOUND", "PACKAGE_INACTIVE", "PACKAGE_NOT_CUSTOMER_VISIBLE", "PACKAGE_NOT_ON_SALE"].includes(error.code)) {
    return new PublicServicePackageError(404, "SERVICE_PACKAGE_NOT_AVAILABLE");
  }
  return new PublicServicePackageError(503, "SERVICE_PACKAGES_UNAVAILABLE");
}

function requireKey(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function createPublicServicePackageService({ resolver }) {
  if (!resolver || typeof resolver.listCustomerVisible !== "function" || typeof resolver.resolveSelection !== "function") {
    throw new TypeError("service package resolver is required");
  }

  return {
    async list() {
      try {
        const rows = await resolver.listCustomerVisible();
        return {
          service_packages: rows.map((packageRow) => {
            const tiers = Array.isArray(packageRow.tiers) ? packageRow.tiers : [];
            const previews = tiers.filter((tier) => tier.is_active !== false)
              .map((tier) => publicPreview(buildSnapshot(packageRow, tier), packageRow));
            const safeTiers = previews.map((preview) => ({
              tier_key: preview.tier_key,
              tier_name: preview.tier_name,
              fixed_total_price: preview.fixed_total_price,
              quantity: preview.quantity,
            }));
            const first = previews[0];
            return first ? {
              package_key: first.package_key,
              package_name: first.package_name,
              description: first.description,
              service: first.service,
              unit_duration_minutes: first.unit_duration_minutes,
              sell_start_at: first.sell_start_at,
              sell_end_at: first.sell_end_at,
              redeem_until: first.redeem_until,
              tiers: safeTiers,
            } : null;
          }).filter(Boolean),
        };
      } catch (error) {
        const publicError = mapResolutionError(error);
        throw publicError instanceof PublicServicePackageError
          ? publicError
          : new PublicServicePackageError(503, "SERVICE_PACKAGES_UNAVAILABLE");
      }
    },

    async preview(input = {}) {
      const packageKey = requireKey(input.package_key);
      const tierKey = requireKey(input.tier_key);
      if (!packageKey || !tierKey) throw new PublicServicePackageError(400, "INVALID_PACKAGE_SELECTION");
      try {
        const resolved = await resolver.resolveSelection(
          { packageKey, tierKey },
          { identity: "customer" }
        );
        const rows = await resolver.listCustomerVisible();
        const metadata = rows.find((row) => row.package_key === resolved.package.key);
        if (!metadata) throw new PublicServicePackageError(404, "SERVICE_PACKAGE_NOT_AVAILABLE");
        return publicPreview(resolved, metadata);
      } catch (error) {
        const publicError = mapResolutionError(error);
        throw publicError instanceof PublicServicePackageError
          ? publicError
          : new PublicServicePackageError(503, "SERVICE_PACKAGES_UNAVAILABLE");
      }
    },
  };
}

module.exports = { PublicServicePackageError, createPublicServicePackageService };
