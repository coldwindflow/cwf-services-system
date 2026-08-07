"use strict";

function requireDb(db) {
  if (!db || typeof db.query !== "function") throw new TypeError("A database query interface is required");
  return db;
}

async function findPackageById(db, packageId) {
  const result = await requireDb(db).query(
    "SELECT * FROM public.service_packages WHERE service_package_id=$1",
    [packageId]
  );
  return result.rows[0] || null;
}

async function findPackageByKey(db, packageKey) {
  const result = await requireDb(db).query(
    "SELECT * FROM public.service_packages WHERE package_key=$1",
    [packageKey]
  );
  return result.rows[0] || null;
}

async function findTier(db, { packageId, tierId, tierKey }) {
  if (tierId == null && !String(tierKey || "").trim()) throw new TypeError("Tier ID or key is required");
  const identitySql = tierId != null ? "service_package_tier_id=$2" : "tier_key=$2";
  const identity = tierId != null ? tierId : tierKey;
  const result = await requireDb(db).query(
    `SELECT * FROM public.service_package_tiers WHERE service_package_id=$1 AND ${identitySql}`,
    [packageId, identity]
  );
  return result.rows[0] || null;
}

async function listCustomerVisiblePackages(db, { at = new Date() } = {}) {
  const result = await requireDb(db).query(
    `SELECT p.*, COALESCE(json_agg(t ORDER BY t.sort_order, t.service_package_tier_id)
       FILTER (WHERE t.service_package_tier_id IS NOT NULL), '[]'::json) AS tiers
     FROM public.service_packages p
     LEFT JOIN public.service_package_tiers t
       ON t.service_package_id=p.service_package_id AND t.is_active=TRUE
     WHERE p.is_active=TRUE AND p.is_customer_visible=TRUE
       AND (p.sell_start_at IS NULL OR p.sell_start_at <= $1)
       AND (p.sell_end_at IS NULL OR p.sell_end_at >= $1)
     GROUP BY p.service_package_id
     ORDER BY p.service_package_id`,
    [at]
  );
  return result.rows;
}

module.exports = { findPackageById, findPackageByKey, findTier, listCustomerVisiblePackages };
