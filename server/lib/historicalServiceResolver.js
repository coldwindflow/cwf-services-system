"use strict";

// Single shared "historical-service resolver" used by both:
//   - booking-count aggregation (server/routes/catalog/items.js, bulk path)
//   - tracking-review target derivation (server/routes/catalog/reviews.js, single-job path)
// for jobs that predate jobs.catalog_item_id (no direct link). Matching is
// deterministic only: public.job_units rows (ac_type/btu, persisted per unit)
// joined against catalog_items' own legacy job_category/ac_type/btu_min/btu_max
// fields. Never fuzzy name-matching, never mutates the job or job_units rows.

const EXCLUDED_BOOKING_JOB_STATUSES = ["ยกเลิก", "cancelled", "canceled", "ไม่พบช่างรับงาน"];

// job_type (jobs.job_type / catalog_items.job_category) short forms mapped to
// the four broad service_type buckets allowed by
// catalog_item_reviews_service_type_check. Any job_type not in this map
// (e.g. "ย้าย") cannot be bucketed and falls through to "overall".
const JOB_TYPE_TO_SERVICE_TYPE = {
  "ล้าง": "ล้างแอร์",
  "ซ่อม": "ซ่อมแอร์",
  "ติดตั้ง": "ติดตั้งแอร์",
  "ตรวจเช็ค": "ตรวจเช็คแอร์",
};

function jobTypeToServiceType(jobType) {
  return JOB_TYPE_TO_SERVICE_TYPE[String(jobType || "").trim()] || null;
}

// jobs.catalog_item_id (and customer_sub) ship in the same earlier migration
// this resolver builds on; guard against querying a column that doesn't
// exist yet on a deployment where that migration hasn't run.
let jobsCatalogLinkSchemaReadyCache = false;
async function isJobsCatalogLinkSchemaReady(db) {
  if (jobsCatalogLinkSchemaReadyCache) return true;
  const r = await db.query(`
    SELECT COUNT(*)::int AS cnt FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'catalog_item_id'
  `);
  const ready = Number(r.rows?.[0]?.cnt || 0) === 1;
  if (ready) jobsCatalogLinkSchemaReadyCache = true;
  return ready;
}

// Bulk path: for a list of catalog item_ids, returns a Map(item_id -> count
// of distinct historical job_ids unambiguously matched to that item). Exactly
// one grouped query — used by attachBookingCounts() so a Store list/detail
// request never issues one query per item.
async function bulkResolveHistoricalItemMatches(db, itemIds) {
  const byItem = new Map();
  if (!itemIds.length) return byItem;
  const excludedParams = EXCLUDED_BOOKING_JOB_STATUSES.map((_, i) => `$${i + 2}`).join(", ");
  const r = await db.query(
    `WITH unit_matches AS (
       SELECT ju.unit_id, ju.job_id, ci.item_id,
              COUNT(*) OVER (PARTITION BY ju.unit_id) AS match_count
         FROM public.job_units ju
         JOIN public.jobs j ON j.job_id = ju.job_id
         JOIN public.catalog_items ci
              ON ci.item_id = ANY($1::bigint[])
             AND ci.job_category = j.job_type
             AND ci.ac_type = ju.ac_type
             AND (ci.btu_min IS NULL OR ci.btu_min <= ju.btu)
             AND (ci.btu_max IS NULL OR ci.btu_max >= ju.btu)
        WHERE j.catalog_item_id IS NULL
          AND COALESCE(j.job_status, '') NOT IN (${excludedParams})
          AND j.canceled_at IS NULL
          AND LOWER(COALESCE(NULLIF(ju.status, ''), 'pending')) NOT IN ('cancelled', 'removed', 'deleted', 'void', 'inactive')
     )
     SELECT item_id, COUNT(DISTINCT job_id)::int AS cnt
       FROM unit_matches
      WHERE match_count = 1
      GROUP BY item_id`,
    [itemIds, ...EXCLUDED_BOOKING_JOB_STATUSES]
  );
  r.rows.forEach((row) => byItem.set(Number(row.item_id), Number(row.cnt)));
  return byItem;
}

// Single-job path: for one job (already confirmed real/completed/not
// cancelled by the caller), deterministically resolves its review target.
//   - jobs.catalog_item_id already set -> "item" scope, that item.
//   - all of the job's job_units rows agree on exactly one catalog item ->
//     "item" scope, that item.
//   - job_units are absent/inconclusive/ambiguous but job_type maps to one
//     of the four broad buckets -> "service_type" scope.
//   - otherwise -> "overall" scope (still a valid, submittable review target).
// Never guesses a single item when units disagree; never mutates the job row.
async function resolveHistoricalServiceTarget(db, jobId) {
  const linkReady = await isJobsCatalogLinkSchemaReady(db);
  const jobR = await db.query(
    linkReady
      ? `SELECT job_id, job_type, catalog_item_id FROM public.jobs WHERE job_id = $1`
      : `SELECT job_id, job_type, NULL::bigint AS catalog_item_id FROM public.jobs WHERE job_id = $1`,
    [jobId]
  );
  const job = jobR.rows[0];
  if (!job) return { scope: null, itemId: null, serviceType: null };

  if (job.catalog_item_id != null) {
    return { scope: "item", itemId: Number(job.catalog_item_id), serviceType: null };
  }

  const unitR = await db.query(
    `WITH unit_matches AS (
       SELECT ju.unit_id, ci.item_id,
              COUNT(*) OVER (PARTITION BY ju.unit_id) AS match_count
         FROM public.job_units ju
         JOIN public.catalog_items ci
              ON ci.job_category = $2
             AND ci.ac_type = ju.ac_type
             AND (ci.btu_min IS NULL OR ci.btu_min <= ju.btu)
             AND (ci.btu_max IS NULL OR ci.btu_max >= ju.btu)
        WHERE ju.job_id = $1
          AND LOWER(COALESCE(NULLIF(ju.status, ''), 'pending')) NOT IN ('cancelled', 'removed', 'deleted', 'void', 'inactive')
     )
     SELECT DISTINCT item_id FROM unit_matches WHERE match_count = 1`,
    [jobId, job.job_type]
  );

  const distinctItemIds = unitR.rows.map((row) => Number(row.item_id));
  if (distinctItemIds.length === 1) {
    return { scope: "item", itemId: distinctItemIds[0], serviceType: null };
  }

  const serviceType = jobTypeToServiceType(job.job_type);
  if (serviceType) {
    return { scope: "service_type", itemId: null, serviceType };
  }

  return { scope: "overall", itemId: null, serviceType: null };
}

module.exports = {
  EXCLUDED_BOOKING_JOB_STATUSES,
  JOB_TYPE_TO_SERVICE_TYPE,
  jobTypeToServiceType,
  bulkResolveHistoricalItemMatches,
  resolveHistoricalServiceTarget,
};
