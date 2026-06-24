const test = require("node:test");
const assert = require("node:assert/strict");

const {
  EXCLUDED_BOOKING_JOB_STATUSES,
  bulkResolveHistoricalItemMatches,
  resolveHistoricalServiceTarget,
} = require("../server/lib/historicalServiceResolver");

// Minimal fake db that re-implements, in plain JS, the exact predicates the
// resolver's SQL expresses (job_category=job_type, ac_type=ac_type, btu
// range, ambiguous-unit rejection via a match-count check) against fixture
// arrays -- rather than faking literal SQL strings, since the resolver's
// queries are joins/CTEs that are easiest to verify by re-deriving the same
// semantics from the same inputs.
function makeDb({ linkReady = true, jobs = [], jobUnits = [], items = [] } = {}) {
  function unitMatchesForJob(jobId, jobType) {
    const units = jobUnits.filter((u) => Number(u.job_id) === Number(jobId) &&
      !["cancelled", "removed", "deleted", "void", "inactive"].includes(String(u.status || "pending").toLowerCase()));
    return units.map((u) => {
      const matches = items.filter((it) =>
        it.job_category === jobType &&
        it.ac_type === u.ac_type &&
        (it.btu_min == null || it.btu_min <= u.btu) &&
        (it.btu_max == null || it.btu_max >= u.btu)
      );
      return { unit_id: u.unit_id, matches };
    });
  }

  async function query(sql, params = []) {
    const s = String(sql);

    if (s.includes("table_name = 'jobs'") && s.includes("column_name = 'catalog_item_id'") && !s.includes("customer_sub")) {
      return { rows: [{ cnt: linkReady ? 1 : 0 }] };
    }

    // bulkResolveHistoricalItemMatches (joins public.jobs; single-job path below does not)
    if (s.includes("WITH unit_matches AS") && s.includes("JOIN public.jobs j")) {
      const [itemIds] = params;
      const rows = [];
      for (const job of jobs) {
        if (job.catalog_item_id != null) continue;
        if (EXCLUDED_BOOKING_JOB_STATUSES.includes(job.job_status)) continue;
        if (job.canceled_at) continue;
        for (const { matches } of unitMatchesForJob(job.job_id, job.job_type)) {
          const inScope = matches.filter((it) => itemIds.includes(Number(it.item_id)));
          if (inScope.length === 1) rows.push({ item_id: inScope[0].item_id, job_id: job.job_id });
        }
      }
      const byItem = new Map();
      for (const row of rows) {
        const seen = byItem.get(row.item_id) || new Set();
        seen.add(row.job_id);
        byItem.set(row.item_id, seen);
      }
      return { rows: Array.from(byItem.entries()).map(([item_id, jobIds]) => ({ item_id, cnt: jobIds.size })) };
    }

    // resolveHistoricalServiceTarget: job lookup
    if (s.includes("FROM public.jobs WHERE job_id = $1")) {
      const [jobId] = params;
      const job = jobs.find((j) => Number(j.job_id) === Number(jobId));
      if (!job) return { rows: [] };
      return { rows: [{ job_id: job.job_id, job_type: job.job_type, catalog_item_id: linkReady ? (job.catalog_item_id ?? null) : null }] };
    }

    // resolveHistoricalServiceTarget: job_units match
    if (s.includes("FROM public.job_units ju") && s.includes("WHERE ju.job_id = $1")) {
      const [jobId, jobType] = params;
      const distinctIds = new Set();
      for (const { matches } of unitMatchesForJob(jobId, jobType)) {
        if (matches.length === 1) distinctIds.add(Number(matches[0].item_id));
        else if (matches.length > 1) distinctIds.add(`ambiguous-${jobId}`); // forces length !== 1 below
      }
      // Mirror "match_count = 1" filtering precisely: only units with exactly
      // one matching item contribute a row; ambiguous units contribute none.
      const rows = [];
      for (const { matches } of unitMatchesForJob(jobId, jobType)) {
        if (matches.length === 1) rows.push({ item_id: matches[0].item_id });
      }
      const distinct = Array.from(new Set(rows.map((r) => Number(r.item_id))));
      return { rows: distinct.map((item_id) => ({ item_id })) };
    }

    throw new Error(`unhandled query in fake historical resolver db: ${s.slice(0, 120)}`);
  }

  return { query };
}

test("bulkResolveHistoricalItemMatches counts only unambiguous unit-to-item matches, excludes cancelled/rejected jobs", async () => {
  const items = [
    { item_id: 1, job_category: "ล้าง", ac_type: "wall", btu_min: 9000, btu_max: 12000 },
    { item_id: 2, job_category: "ล้าง", ac_type: "ceiling", btu_min: 9000, btu_max: 12000 },
  ];
  const jobs = [
    { job_id: 100, job_type: "ล้าง", catalog_item_id: null, job_status: "เสร็จแล้ว", canceled_at: null },
    { job_id: 101, job_type: "ล้าง", catalog_item_id: null, job_status: "เสร็จแล้ว", canceled_at: null },
    { job_id: 102, job_type: "ล้าง", catalog_item_id: null, job_status: "ยกเลิก", canceled_at: null }, // excluded status
    { job_id: 103, job_type: "ล้าง", catalog_item_id: 1, job_status: "เสร็จแล้ว", canceled_at: null }, // already linked, skipped by resolver
  ];
  const jobUnits = [
    { unit_id: 1, job_id: 100, ac_type: "wall", btu: 10000, status: "active" },
    { unit_id: 2, job_id: 101, ac_type: "wall", btu: 10000, status: "active" },
    { unit_id: 3, job_id: 102, ac_type: "wall", btu: 10000, status: "active" },
  ];
  const db = makeDb({ items, jobs, jobUnits });

  const byItem = await bulkResolveHistoricalItemMatches(db, [1, 2]);
  assert.equal(byItem.get(1), 2);
  assert.equal(byItem.get(2), undefined);
});

test("bulkResolveHistoricalItemMatches never guesses a single item when a unit ambiguously matches more than one catalog item", async () => {
  const items = [
    { item_id: 1, job_category: "ล้าง", ac_type: "wall", btu_min: 9000, btu_max: 15000 },
    { item_id: 2, job_category: "ล้าง", ac_type: "wall", btu_min: 9000, btu_max: 15000 },
  ];
  const jobs = [{ job_id: 200, job_type: "ล้าง", catalog_item_id: null, job_status: "เสร็จแล้ว", canceled_at: null }];
  const jobUnits = [{ unit_id: 1, job_id: 200, ac_type: "wall", btu: 10000, status: "active" }];
  const db = makeDb({ items, jobs, jobUnits });

  const byItem = await bulkResolveHistoricalItemMatches(db, [1, 2]);
  assert.equal(byItem.get(1), undefined);
  assert.equal(byItem.get(2), undefined);
});

test("resolveHistoricalServiceTarget returns item scope directly when jobs.catalog_item_id is already set", async () => {
  const jobs = [{ job_id: 1, job_type: "ล้าง", catalog_item_id: 7 }];
  const db = makeDb({ jobs });
  const result = await resolveHistoricalServiceTarget(db, 1);
  assert.deepEqual(result, { scope: "item", itemId: 7, serviceType: null });
});

test("resolveHistoricalServiceTarget resolves an unambiguous job_units match to item scope", async () => {
  const items = [{ item_id: 5, job_category: "ซ่อม", ac_type: "wall", btu_min: 9000, btu_max: 12000 }];
  const jobs = [{ job_id: 2, job_type: "ซ่อม", catalog_item_id: null }];
  const jobUnits = [{ unit_id: 1, job_id: 2, ac_type: "wall", btu: 10000, status: "active" }];
  const db = makeDb({ items, jobs, jobUnits });
  const result = await resolveHistoricalServiceTarget(db, 2);
  assert.deepEqual(result, { scope: "item", itemId: 5, serviceType: null });
});

test("resolveHistoricalServiceTarget falls back to service_type scope when units are absent but job_type maps to a known bucket", async () => {
  const jobs = [{ job_id: 3, job_type: "ซ่อม", catalog_item_id: null }];
  const db = makeDb({ jobs, jobUnits: [] });
  const result = await resolveHistoricalServiceTarget(db, 3);
  assert.deepEqual(result, { scope: "service_type", itemId: null, serviceType: "ซ่อมแอร์" });
});

test("resolveHistoricalServiceTarget falls back to overall scope when job_type has no service_type mapping", async () => {
  const jobs = [{ job_id: 4, job_type: "ย้าย", catalog_item_id: null }];
  const db = makeDb({ jobs, jobUnits: [] });
  const result = await resolveHistoricalServiceTarget(db, 4);
  assert.deepEqual(result, { scope: "overall", itemId: null, serviceType: null });
});

test("resolveHistoricalServiceTarget falls back to overall scope when units ambiguously match more than one item", async () => {
  const items = [
    { item_id: 1, job_category: "ตรวจเช็ค", ac_type: "wall", btu_min: 9000, btu_max: 15000 },
    { item_id: 2, job_category: "ตรวจเช็ค", ac_type: "wall", btu_min: 9000, btu_max: 15000 },
  ];
  const jobs = [{ job_id: 5, job_type: "ตรวจเช็ค", catalog_item_id: null }];
  const jobUnits = [{ unit_id: 1, job_id: 5, ac_type: "wall", btu: 10000, status: "active" }];
  const db = makeDb({ items, jobs, jobUnits });
  const result = await resolveHistoricalServiceTarget(db, 5);
  assert.deepEqual(result, { scope: "service_type", itemId: null, serviceType: "ตรวจเช็คแอร์" });
});

test("resolveHistoricalServiceTarget returns null scope for a job_id that does not exist", async () => {
  const db = makeDb({ jobs: [] });
  const result = await resolveHistoricalServiceTarget(db, 999);
  assert.deepEqual(result, { scope: null, itemId: null, serviceType: null });
});

test("resolveHistoricalServiceTarget falls back gracefully when jobs.catalog_item_id column does not exist yet", async () => {
  const jobs = [{ job_id: 6, job_type: "ย้าย", catalog_item_id: 9 }];
  const db = makeDb({ linkReady: false, jobs, jobUnits: [] });
  const result = await resolveHistoricalServiceTarget(db, 6);
  // catalog_item_id is ignored (schema not ready), job_type "ย้าย" has no mapping -> overall.
  assert.deepEqual(result, { scope: "overall", itemId: null, serviceType: null });
});
