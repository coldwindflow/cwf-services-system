"use strict";

function requireDb(db) {
  if (!db || typeof db.query !== "function") throw new TypeError("A database query interface is required");
  return db;
}

async function queryUnlinkedPackages(db, sql, params) {
  try { return await requireDb(db).query(sql, params); }
  catch (error) {
    if (error?.code !== "42703") throw error;
    return requireDb(db).query(sql
      .replace(/\s+AND p\.catalog_item_id IS NULL/, "")
      .replace(/\s+WHERE p\.catalog_item_id IS NULL/, ""), params);
  }
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
  const result = await queryUnlinkedPackages(db,
    `SELECT p.*, COALESCE(jsonb_agg(
       to_jsonb(t) || jsonb_build_object('fixed_total_price', t.fixed_total_price::text)
       ORDER BY t.sort_order, t.service_package_tier_id
     ) FILTER (WHERE t.service_package_tier_id IS NOT NULL), '[]'::jsonb) AS tiers
     FROM public.service_packages p
     LEFT JOIN public.service_package_tiers t
       ON t.service_package_id=p.service_package_id AND t.is_active=TRUE
     WHERE p.is_active=TRUE AND p.is_customer_visible=TRUE
       AND p.catalog_item_id IS NULL
       AND (p.sell_start_at IS NULL OR p.sell_start_at <= $1)
       AND (p.sell_end_at IS NULL OR p.sell_end_at >= $1)
     GROUP BY p.service_package_id
     ORDER BY p.service_package_id`,
    [at]
  );
  return result.rows;
}

// Issue 310: this read is authoritative for the booking minimum, so it must NOT
// degrade to "no minimum" when the column is missing - that would silently admit
// under-quantity bookings. Instead it fails closed with a code an operator can
// act on (apply the 20260820 migration) rather than a raw 42703 in the logs.
// The public storefront read path is separately guarded and degrades safely.
const MINIMUM_COLUMN = "service_package_minimum_total_quantity";

function schemaNotReadyError(cause) {
  const error = new Error("SERVICE_PACKAGE_SCHEMA_NOT_READY");
  error.code = "SERVICE_PACKAGE_SCHEMA_NOT_READY";
  error.statusCode = 503;
  error.detail = `public.catalog_items.${MINIMUM_COLUMN} is missing; apply migrations/20260820_service_package_minimum_total_quantity.sql before this release`;
  error.cause = cause;
  return error;
}

async function findLinkedPackagesByKeys(db, packageKeys) {
  if (!Array.isArray(packageKeys) || !packageKeys.length) return [];
  const result = await runLinkedPackagesQuery(requireDb(db), packageKeys);
  return result.rows;
}

async function runLinkedPackagesQuery(db, packageKeys) {
  try { return await queryLinkedPackages(db, packageKeys); }
  catch (error) {
    if (error?.code === "42703" && String(error?.message || "").includes(MINIMUM_COLUMN)) {
      throw schemaNotReadyError(error);
    }
    throw error;
  }
}

async function queryLinkedPackages(db, packageKeys) {
  return db.query(
    `SELECT p.*, ci.item_id, ci.item_name, ci.service_bundle_key,
            CASE WHEN ci.service_bundle_key IS NOT NULL THEN 'service_package' ELSE ci.booking_mode END AS booking_mode,
            ci.is_active AS catalog_is_active,
            ci.is_customer_visible AS catalog_is_customer_visible,
            ci.service_package_sell_start_at, ci.service_package_sell_end_at,
            ci.service_package_redeem_until, ci.booking_flow_policy,
            ci.service_package_minimum_total_quantity,
            COALESCE(jsonb_agg(
              to_jsonb(t) || jsonb_build_object('fixed_total_price', t.fixed_total_price::text)
              ORDER BY t.sort_order, t.service_package_tier_id
            ) FILTER (WHERE t.service_package_tier_id IS NOT NULL), '[]'::jsonb) AS tiers
       FROM public.service_packages p
       JOIN public.catalog_items ci ON ci.item_id=p.catalog_item_id
       LEFT JOIN public.service_package_tiers t ON t.service_package_id=p.service_package_id
      WHERE p.package_key = ANY($1::text[])
      GROUP BY p.service_package_id, ci.item_id`,
    [packageKeys]
  );
}

async function listLinkedPackagesForCatalogItems(db, itemIds, { customer = false, at = new Date() } = {}) {
  if (!Array.isArray(itemIds) || !itemIds.length) return [];
  const params = [itemIds];
  let customerSql = "";
  if (customer) {
    params.push(at);
    customerSql = `AND p.is_active=TRUE AND p.is_customer_visible=TRUE
      AND ci.is_active=TRUE AND ci.is_customer_visible=TRUE
      AND (ci.service_package_sell_start_at IS NULL OR ci.service_package_sell_start_at <= $2)
      AND (ci.service_package_sell_end_at IS NULL OR ci.service_package_sell_end_at >= $2)`;
  }
  const result = await requireDb(db).query(
    `SELECT p.*, COALESCE(jsonb_agg(
       to_jsonb(t) || jsonb_build_object('fixed_total_price', t.fixed_total_price::text)
       ORDER BY t.sort_order, t.service_package_tier_id
     ) FILTER (WHERE t.service_package_tier_id IS NOT NULL), '[]'::jsonb) AS tiers
       FROM public.service_packages p
       JOIN public.catalog_items ci ON ci.item_id=p.catalog_item_id
       LEFT JOIN public.service_package_tiers t ON t.service_package_id=p.service_package_id
        ${customer ? "AND t.is_active=TRUE" : ""}
      WHERE p.catalog_item_id = ANY($1::bigint[]) ${customerSql}
      GROUP BY p.service_package_id
      ORDER BY p.catalog_item_id, p.sort_order, p.service_package_id`,
    params
  );
  return result.rows;
}

async function listCatalogPackages(db) {
  const result = await queryUnlinkedPackages(db,
    `SELECT p.*, COALESCE(jsonb_agg(
       to_jsonb(t) || jsonb_build_object('fixed_total_price', t.fixed_total_price::text)
       ORDER BY t.sort_order, t.service_package_tier_id
     ) FILTER (WHERE t.service_package_tier_id IS NOT NULL), '[]'::jsonb) AS tiers
     FROM public.service_packages p
     LEFT JOIN public.service_package_tiers t ON t.service_package_id=p.service_package_id
     WHERE p.catalog_item_id IS NULL
     GROUP BY p.service_package_id
     ORDER BY p.created_at DESC, p.service_package_id DESC`
  );
  return result.rows;
}

async function findPackageByKeyForUpdate(db, packageKey) {
  const result = await requireDb(db).query(
    "SELECT * FROM public.service_packages WHERE package_key=$1 FOR UPDATE",
    [packageKey]
  );
  return result.rows[0] || null;
}

async function listTiersForUpdate(db, packageId) {
  const result = await requireDb(db).query(
    `SELECT * FROM public.service_package_tiers WHERE service_package_id=$1
     ORDER BY sort_order, service_package_tier_id FOR UPDATE`,
    [packageId]
  );
  return result.rows;
}

async function insertPackage(db, value) {
  const result = await requireDb(db).query(
    `INSERT INTO public.service_packages
       (package_key, display_name, description, service_key, service_name, job_type, ac_type,
        wash_variant, btu_min, btu_max, service_unit_duration_minutes, sell_start_at, sell_end_at,
        redeem_until, is_active, is_customer_visible, catalog_item_id, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
    [value.package_key, value.display_name, value.description, value.service_key, value.service_name,
      value.job_type, value.ac_type, value.wash_variant, value.btu_min, value.btu_max,
      value.service_unit_duration_minutes, value.sell_start_at, value.sell_end_at, value.redeem_until,
      value.is_active, value.is_customer_visible, value.catalog_item_id || null, Number(value.sort_order || 0)]
  );
  return result.rows[0];
}

async function updatePackage(db, packageId, value) {
  const result = await requireDb(db).query(
    `UPDATE public.service_packages SET display_name=$2, description=$3, service_key=$4,
       service_name=$5, job_type=$6, ac_type=$7, wash_variant=$8, btu_min=$9, btu_max=$10,
       service_unit_duration_minutes=$11, sell_start_at=$12, sell_end_at=$13, redeem_until=$14,
       is_active=$15, is_customer_visible=$16, catalog_item_id=COALESCE($17,catalog_item_id),
       sort_order=$18, updated_at=NOW()
     WHERE service_package_id=$1 RETURNING *`,
    [packageId, value.display_name, value.description, value.service_key, value.service_name,
      value.job_type, value.ac_type, value.wash_variant, value.btu_min, value.btu_max,
      value.service_unit_duration_minutes, value.sell_start_at, value.sell_end_at, value.redeem_until,
      value.is_active, value.is_customer_visible, value.catalog_item_id || null, Number(value.sort_order || 0)]
  );
  return result.rows[0];
}

async function insertTier(db, packageId, value) {
  const result = await requireDb(db).query(
    `INSERT INTO public.service_package_tiers
       (service_package_id, tier_key, display_name, service_quantity, fixed_total_price, sort_order, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [packageId, value.tier_key, value.display_name, value.service_quantity,
      value.fixed_total_price, value.sort_order, value.is_active]
  );
  return result.rows[0];
}

async function updateTier(db, tierId, value) {
  const result = await requireDb(db).query(
    `UPDATE public.service_package_tiers SET display_name=$2, service_quantity=$3,
       fixed_total_price=$4, sort_order=$5, is_active=$6, updated_at=NOW()
     WHERE service_package_tier_id=$1 RETURNING *`,
    [tierId, value.display_name, value.service_quantity, value.fixed_total_price, value.sort_order, value.is_active]
  );
  return result.rows[0];
}

async function deactivateTiers(db, packageId, keepTierIds) {
  await requireDb(db).query(
    `UPDATE public.service_package_tiers SET is_active=FALSE, updated_at=NOW()
     WHERE service_package_id=$1 AND NOT (service_package_tier_id = ANY($2::bigint[]))`,
    [packageId, keepTierIds]
  );
}

module.exports = {
  findPackageById, findPackageByKey, findTier, listCustomerVisiblePackages, listCatalogPackages,
  findPackageByKeyForUpdate, listTiersForUpdate, insertPackage, updatePackage, insertTier,
  updateTier, deactivateTiers, findLinkedPackagesByKeys, listLinkedPackagesForCatalogItems,
};
