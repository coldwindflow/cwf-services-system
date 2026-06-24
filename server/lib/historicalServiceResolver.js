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
//
// Job-level consistency (must hold for ALL of a job's active units, not just
// some of them) before a job counts toward an item:
//   1. every active (non-cancelled) unit on the job was considered;
//   2. every one of those units unambiguously matched exactly one catalog item;
//   3. every one of those units agreed on the same item_id.
// A job with 2 units where only one matches an item, or where the two units
// match two different items, or match ambiguously, must never be counted.
async function bulkResolveHistoricalItemMatches(db, itemIds) {
  const byItem = new Map();
  if (!itemIds.length) return byItem;
  const excludedParams = EXCLUDED_BOOKING_JOB_STATUSES.map((_, i) => `$${i + 2}`).join(", ");
  const r = await db.query(
    `WITH active_units AS (
       SELECT ju.unit_id, ju.job_id, ju.ac_type, ju.btu, j.job_type
         FROM public.job_units ju
         JOIN public.jobs j ON j.job_id = ju.job_id
        WHERE j.catalog_item_id IS NULL
          AND COALESCE(j.job_status, '') NOT IN (${excludedParams})
          AND j.canceled_at IS NULL
          AND LOWER(COALESCE(NULLIF(ju.status, ''), 'pending')) NOT IN ('cancelled', 'removed', 'deleted', 'void', 'inactive')
     ),
     job_unit_totals AS (
       SELECT job_id, COUNT(*)::int AS total_units FROM active_units GROUP BY job_id
     ),
     unit_matches AS (
       SELECT au.unit_id, au.job_id, ci.item_id,
              COUNT(*) OVER (PARTITION BY au.unit_id) AS match_count
         FROM active_units au
         JOIN public.catalog_items ci
              ON ci.item_id = ANY($1::bigint[])
             AND ci.job_category = au.job_type
             AND ci.ac_type = au.ac_type
             AND (ci.btu_min IS NULL OR ci.btu_min <= au.btu)
             AND (ci.btu_max IS NULL OR ci.btu_max >= au.btu)
     ),
     job_item_matched_units AS (
       SELECT job_id, item_id, COUNT(DISTINCT unit_id)::int AS matched_units,
              COUNT(*) OVER (PARTITION BY job_id) AS distinct_items_for_job
         FROM unit_matches
        WHERE match_count = 1
        GROUP BY job_id, item_id
     ),
     job_item_candidates AS (
       SELECT jim.job_id, jim.item_id
         FROM job_item_matched_units jim
         JOIN job_unit_totals jut ON jut.job_id = jim.job_id
        WHERE jim.distinct_items_for_job = 1
          AND jim.matched_units = jut.total_units
     )
     SELECT item_id, COUNT(DISTINCT job_id)::int AS cnt
       FROM job_item_candidates
      GROUP BY item_id`,
    [itemIds, ...EXCLUDED_BOOKING_JOB_STATUSES]
  );
  r.rows.forEach((row) => byItem.set(Number(row.item_id), Number(row.cnt)));
  return byItem;
}

// Single-job path: for one job (already confirmed real/completed/not
// cancelled by the caller), deterministically resolves its review target.
//   - jobs.catalog_item_id already set -> "item" scope, that item.
//   - every one of the job's active units unambiguously matches the same
//     single catalog item -> "item" scope, that item.
//   - job_units are absent/inconclusive/ambiguous, or units don't all agree,
//     but job_type maps to one of the four broad buckets -> "service_type" scope.
//   - otherwise -> "overall" scope (still a valid, submittable review target).
// Never guesses a single item when any unit is unmatched, ambiguous, or
// disagrees with the others; never mutates the job row.
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

  const totalUnitsR = await db.query(
    `SELECT COUNT(*)::int AS cnt
       FROM public.job_units ju
      WHERE ju.job_id = $1
        AND LOWER(COALESCE(NULLIF(ju.status, ''), 'pending')) NOT IN ('cancelled', 'removed', 'deleted', 'void', 'inactive')`,
    [jobId]
  );
  const totalUnits = Number(totalUnitsR.rows?.[0]?.cnt || 0);

  let unambiguousItemId = null;
  if (totalUnits > 0) {
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
       SELECT item_id, COUNT(DISTINCT unit_id)::int AS matched_units
         FROM unit_matches
        WHERE match_count = 1
        GROUP BY item_id`,
      [jobId, job.job_type]
    );
    // Item scope requires every active unit to have unambiguously matched the
    // same single item: exactly one item group, covering all of totalUnits.
    if (unitR.rows.length === 1 && Number(unitR.rows[0].matched_units) === totalUnits) {
      unambiguousItemId = Number(unitR.rows[0].item_id);
    }
  }

  if (unambiguousItemId != null) {
    return { scope: "item", itemId: unambiguousItemId, serviceType: null };
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
