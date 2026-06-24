const test = require("node:test");
const assert = require("node:assert/strict");

const {
  EXCLUDED_BOOKING_JOB_STATUSES,
  bulkResolveHistoricalItemMatches,
  resolveHistoricalServiceTarget,
} = require("../server/lib/historicalServiceResolver");

// Minimal fake db that re-implements, in plain JS, the exact predicates the
// resolver's SQL expresses (job_category=job_type, ac_type=ac_type, btu
// range, per-unit ambiguity rejection via a match-count check, and job-level
// consistency requiring every active unit on a job to agree on the same
// single item before that job counts toward it) against fixture arrays --
// rather than faking literal SQL strings, since the resolver's queries are
// joins/CTEs that are easiest to verify by re-deriving the same semantics
// from the same inputs.
function makeDb({ linkReady = true, jobs = [], jobUnits = [], items = [] } = {}) {
  function activeUnitsForJob(jobId) {
    return jobUnits.filter((u) => Number(u.job_id) === Number(jobId) &&
      !["cancelled", "removed", "deleted", "void", "inactive"].includes(String(u.status || "pending").toLowerCase()));
  }

  // Mirrors btuValueSql: only a plain (optionally comma-grouped) decimal
  // string normalizes to a number; anything else (NULL, "", "ไม่ระบุ", ...)
  // becomes null, same as the SQL CASE expression evaluating to SQL NULL.
  function normalizeBtu(btu) {
    const text = String(btu == null ? "" : btu).trim().replace(/,/g, "");
    return /^[0-9]+(\.[0-9]+)?$/.test(text) ? Number(text) : null;
  }

  function unitMatchesForJob(jobId, jobType, candidateItemIds = null) {
    const units = activeUnitsForJob(jobId);
    return units.map((u) => {
      const btuValue = normalizeBtu(u.btu);
      const matches = btuValue == null ? [] : items.filter((it) =>
        (candidateItemIds == null || candidateItemIds.includes(Number(it.item_id))) &&
        it.job_category === jobType &&
        it.ac_type === u.ac_type &&
        (it.btu_min == null || it.btu_min <= btuValue) &&
        (it.btu_max == null || it.btu_max >= btuValue)
      );
      return { unit_id: u.unit_id, matches };
    });
  }

  async function query(sql, params = []) {
    const s = String(sql);

    if (s.includes("table_name = 'jobs'") && s.includes("column_name = 'catalog_item_id'") && !s.includes("customer_sub")) {
      return { rows: [{ cnt: linkReady ? 1 : 0 }] };
    }

    // bulkResolveHistoricalItemMatches (distinct bulk CTE chain: active_units -> job_unit_totals -> unit_matches -> job_item_matched_units -> job_item_candidates).
    if (s.includes("WITH active_units AS") && s.includes("job_unit_totals")) {
      const [itemIds] = params;
      const candidates = itemIds.map(Number);
      const byItem = new Map();
      for (const job of jobs) {
        if (job.catalog_item_id != null) continue;
        if (EXCLUDED_BOOKING_JOB_STATUSES.includes(job.job_status)) continue;
        if (job.canceled_at) continue;
        const totalUnits = activeUnitsForJob(job.job_id).length;
        if (totalUnits === 0) continue;
        const matchedUnitsByItem = new Map();
        for (const { matches } of unitMatchesForJob(job.job_id, job.job_type, candidates)) {
          if (matches.length === 1) {
            const itemId = Number(matches[0].item_id);
            matchedUnitsByItem.set(itemId, (matchedUnitsByItem.get(itemId) || 0) + 1);
          }
        }
        if (matchedUnitsByItem.size !== 1) continue; // units disagree, or some matched none
        const [onlyItemId, matchedUnits] = [...matchedUnitsByItem.entries()][0];
        if (matchedUnits !== totalUnits) continue; // not every active unit matched
        byItem.set(onlyItemId, (byItem.get(onlyItemId) || new Set()).add(job.job_id));
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

    // resolveHistoricalServiceTarget: total active-unit count for the job.
    if (s.includes("SELECT COUNT(*)::int AS cnt") && s.includes("FROM public.job_units ju") && s.includes("WHERE ju.job_id = $1")) {
      const [jobId] = params;
      return { rows: [{ cnt: activeUnitsForJob(jobId).length }] };
    }

    // resolveHistoricalServiceTarget: per-item matched-unit grouping.
    if (s.includes("WITH active_units AS") && s.includes("WHERE ju.job_id = $1")) {
      const [jobId, jobType] = params;
      const matchedUnitsByItem = new Map();
      for (const { matches } of unitMatchesForJob(jobId, jobType)) {
        if (matches.length === 1) {
          const itemId = Number(matches[0].item_id);
          matchedUnitsByItem.set(itemId, (matchedUnitsByItem.get(itemId) || 0) + 1);
        }
      }
      return { rows: Array.from(matchedUnitsByItem.entries()).map(([item_id, matched_units]) => ({ item_id, matched_units })) };
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

test("bulkResolveHistoricalItemMatches counts a multi-unit job exactly once when every unit unambiguously matches the same item", async () => {
  const items = [{ item_id: 1, job_category: "ล้าง", ac_type: "wall", btu_min: 9000, btu_max: 12000 }];
  const jobs = [{ job_id: 300, job_type: "ล้าง", catalog_item_id: null, job_status: "เสร็จแล้ว", canceled_at: null }];
  const jobUnits = [
    { unit_id: 1, job_id: 300, ac_type: "wall", btu: 10000, status: "active" },
    { unit_id: 2, job_id: 300, ac_type: "wall", btu: 11000, status: "active" },
  ];
  const db = makeDb({ items, jobs, jobUnits });

  const byItem = await bulkResolveHistoricalItemMatches(db, [1]);
  assert.equal(byItem.get(1), 1);
});

test("bulkResolveHistoricalItemMatches never counts a job when only some of its units match an item (a second unit unmatched)", async () => {
  const items = [{ item_id: 1, job_category: "ล้าง", ac_type: "wall", btu_min: 9000, btu_max: 12000 }];
  const jobs = [{ job_id: 301, job_type: "ล้าง", catalog_item_id: null, job_status: "เสร็จแล้ว", canceled_at: null }];
  const jobUnits = [
    { unit_id: 1, job_id: 301, ac_type: "wall", btu: 10000, status: "active" }, // matches item 1
    { unit_id: 2, job_id: 301, ac_type: "ceiling", btu: 10000, status: "active" }, // matches nothing
  ];
  const db = makeDb({ items, jobs, jobUnits });

  const byItem = await bulkResolveHistoricalItemMatches(db, [1]);
  assert.equal(byItem.get(1), undefined);
});

test("bulkResolveHistoricalItemMatches never counts a job whose units agree but one of them is itself ambiguous", async () => {
  const items = [
    { item_id: 1, job_category: "ล้าง", ac_type: "wall", btu_min: 9000, btu_max: 15000 },
    { item_id: 2, job_category: "ล้าง", ac_type: "wall", btu_min: 9000, btu_max: 15000 },
  ];
  const jobs = [{ job_id: 302, job_type: "ล้าง", catalog_item_id: null, job_status: "เสร็จแล้ว", canceled_at: null }];
  const jobUnits = [
    { unit_id: 1, job_id: 302, ac_type: "wall", btu: 10000, status: "active" }, // ambiguous: matches both 1 and 2
    { unit_id: 2, job_id: 302, ac_type: "wall", btu: 10000, status: "active" }, // also ambiguous
  ];
  const db = makeDb({ items, jobs, jobUnits });

  const byItem = await bulkResolveHistoricalItemMatches(db, [1, 2]);
  assert.equal(byItem.get(1), undefined);
  assert.equal(byItem.get(2), undefined);
});

test("bulkResolveHistoricalItemMatches never counts a job whose two units unambiguously match two different items", async () => {
  const items = [
    { item_id: 1, job_category: "ล้าง", ac_type: "wall", btu_min: 9000, btu_max: 12000 },
    { item_id: 2, job_category: "ล้าง", ac_type: "ceiling", btu_min: 9000, btu_max: 12000 },
  ];
  const jobs = [{ job_id: 303, job_type: "ล้าง", catalog_item_id: null, job_status: "เสร็จแล้ว", canceled_at: null }];
  const jobUnits = [
    { unit_id: 1, job_id: 303, ac_type: "wall", btu: 10000, status: "active" }, // matches item 1
    { unit_id: 2, job_id: 303, ac_type: "ceiling", btu: 10000, status: "active" }, // matches item 2
  ];
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

test("resolveHistoricalServiceTarget falls back to service_type scope when units ambiguously match more than one item", async () => {
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

test("resolveHistoricalServiceTarget resolves item scope only when ALL units agree on the same item (2 units, both match item 5)", async () => {
  const items = [{ item_id: 5, job_category: "ซ่อม", ac_type: "wall", btu_min: 9000, btu_max: 15000 }];
  const jobs = [{ job_id: 10, job_type: "ซ่อม", catalog_item_id: null }];
  const jobUnits = [
    { unit_id: 1, job_id: 10, ac_type: "wall", btu: 10000, status: "active" },
    { unit_id: 2, job_id: 10, ac_type: "wall", btu: 11000, status: "active" },
  ];
  const db = makeDb({ items, jobs, jobUnits });
  const result = await resolveHistoricalServiceTarget(db, 10);
  assert.deepEqual(result, { scope: "item", itemId: 5, serviceType: null });
});

test("resolveHistoricalServiceTarget never resolves item scope when a second unit does not match anything", async () => {
  const items = [{ item_id: 5, job_category: "ซ่อม", ac_type: "wall", btu_min: 9000, btu_max: 15000 }];
  const jobs = [{ job_id: 11, job_type: "ซ่อม", catalog_item_id: null }];
  const jobUnits = [
    { unit_id: 1, job_id: 11, ac_type: "wall", btu: 10000, status: "active" }, // matches item 5
    { unit_id: 2, job_id: 11, ac_type: "ceiling", btu: 10000, status: "active" }, // matches nothing
  ];
  const db = makeDb({ items, jobs, jobUnits });
  const result = await resolveHistoricalServiceTarget(db, 11);
  assert.deepEqual(result, { scope: "service_type", itemId: null, serviceType: "ซ่อมแอร์" });
});

test("resolveHistoricalServiceTarget never resolves item scope when a second unit matches ambiguously", async () => {
  const items = [
    { item_id: 5, job_category: "ซ่อม", ac_type: "wall", btu_min: 9000, btu_max: 15000 },
    { item_id: 6, job_category: "ซ่อม", ac_type: "ceiling", btu_min: 9000, btu_max: 15000 },
    { item_id: 7, job_category: "ซ่อม", ac_type: "ceiling", btu_min: 9000, btu_max: 15000 },
  ];
  const jobs = [{ job_id: 12, job_type: "ซ่อม", catalog_item_id: null }];
  const jobUnits = [
    { unit_id: 1, job_id: 12, ac_type: "wall", btu: 10000, status: "active" }, // unambiguous: item 5
    { unit_id: 2, job_id: 12, ac_type: "ceiling", btu: 10000, status: "active" }, // ambiguous: items 6 and 7
  ];
  const db = makeDb({ items, jobs, jobUnits });
  const result = await resolveHistoricalServiceTarget(db, 12);
  assert.deepEqual(result, { scope: "service_type", itemId: null, serviceType: "ซ่อมแอร์" });
});

test("resolveHistoricalServiceTarget never resolves item scope when two units unambiguously match two different items", async () => {
  const items = [
    { item_id: 5, job_category: "ซ่อม", ac_type: "wall", btu_min: 9000, btu_max: 12000 },
    { item_id: 6, job_category: "ซ่อม", ac_type: "ceiling", btu_min: 9000, btu_max: 12000 },
  ];
  const jobs = [{ job_id: 13, job_type: "ซ่อม", catalog_item_id: null }];
  const jobUnits = [
    { unit_id: 1, job_id: 13, ac_type: "wall", btu: 10000, status: "active" }, // item 5
    { unit_id: 2, job_id: 13, ac_type: "ceiling", btu: 10000, status: "active" }, // item 6
  ];
  const db = makeDb({ items, jobs, jobUnits });
  const result = await resolveHistoricalServiceTarget(db, 13);
  assert.deepEqual(result, { scope: "service_type", itemId: null, serviceType: "ซ่อมแอร์" });
});

// --- BTU text-format safety (production fix: job_units.btu is TEXT on some
// deployments; a bare comparison against catalog_items' INTEGER btu_min/
// btu_max throws 42883 "operator does not exist: integer <= text"). ---

test("resolveHistoricalServiceTarget matches a comma-grouped BTU string (\"12,000\")", async () => {
  const items = [{ item_id: 5, job_category: "ซ่อม", ac_type: "wall", btu_min: 9000, btu_max: 15000 }];
  const jobs = [{ job_id: 20, job_type: "ซ่อม", catalog_item_id: null }];
  const jobUnits = [{ unit_id: 1, job_id: 20, ac_type: "wall", btu: "12,000", status: "active" }];
  const db = makeDb({ items, jobs, jobUnits });
  const result = await resolveHistoricalServiceTarget(db, 20);
  assert.deepEqual(result, { scope: "item", itemId: 5, serviceType: null });
});

test("resolveHistoricalServiceTarget matches a plain BTU string (\"12000\")", async () => {
  const items = [{ item_id: 5, job_category: "ซ่อม", ac_type: "wall", btu_min: 9000, btu_max: 15000 }];
  const jobs = [{ job_id: 21, job_type: "ซ่อม", catalog_item_id: null }];
  const jobUnits = [{ unit_id: 1, job_id: 21, ac_type: "wall", btu: "12000", status: "active" }];
  const db = makeDb({ items, jobs, jobUnits });
  const result = await resolveHistoricalServiceTarget(db, 21);
  assert.deepEqual(result, { scope: "item", itemId: 5, serviceType: null });
});

test("resolveHistoricalServiceTarget matches a decimal BTU string (\"12000.0\")", async () => {
  const items = [{ item_id: 5, job_category: "ซ่อม", ac_type: "wall", btu_min: 9000, btu_max: 15000 }];
  const jobs = [{ job_id: 22, job_type: "ซ่อม", catalog_item_id: null }];
  const jobUnits = [{ unit_id: 1, job_id: 22, ac_type: "wall", btu: "12000.0", status: "active" }];
  const db = makeDb({ items, jobs, jobUnits });
  const result = await resolveHistoricalServiceTarget(db, 22);
  assert.deepEqual(result, { scope: "item", itemId: 5, serviceType: null });
});

test("resolveHistoricalServiceTarget never throws and never matches an item for an empty BTU string", async () => {
  const items = [{ item_id: 5, job_category: "ซ่อม", ac_type: "wall", btu_min: 9000, btu_max: 15000 }];
  const jobs = [{ job_id: 23, job_type: "ซ่อม", catalog_item_id: null }];
  const jobUnits = [{ unit_id: 1, job_id: 23, ac_type: "wall", btu: "", status: "active" }];
  const db = makeDb({ items, jobs, jobUnits });
  const result = await resolveHistoricalServiceTarget(db, 23);
  assert.deepEqual(result, { scope: "service_type", itemId: null, serviceType: "ซ่อมแอร์" });
});

test("resolveHistoricalServiceTarget never throws and never matches an item for a non-numeric BTU value (\"ไม่ระบุ\")", async () => {
  const items = [{ item_id: 5, job_category: "ซ่อม", ac_type: "wall", btu_min: 9000, btu_max: 15000 }];
  const jobs = [{ job_id: 24, job_type: "ซ่อม", catalog_item_id: null }];
  const jobUnits = [{ unit_id: 1, job_id: 24, ac_type: "wall", btu: "ไม่ระบุ", status: "active" }];
  const db = makeDb({ items, jobs, jobUnits });
  const result = await resolveHistoricalServiceTarget(db, 24);
  assert.deepEqual(result, { scope: "service_type", itemId: null, serviceType: "ซ่อมแอร์" });
});

test("resolveHistoricalServiceTarget falls back to service_type when one of two units has an unparseable BTU (job-level consistency still enforced)", async () => {
  const items = [{ item_id: 5, job_category: "ซ่อม", ac_type: "wall", btu_min: 9000, btu_max: 15000 }];
  const jobs = [{ job_id: 25, job_type: "ซ่อม", catalog_item_id: null }];
  const jobUnits = [
    { unit_id: 1, job_id: 25, ac_type: "wall", btu: "12000", status: "active" }, // matches item 5
    { unit_id: 2, job_id: 25, ac_type: "wall", btu: "N/A", status: "active" }, // unparseable, still an active unit, matches nothing
  ];
  const db = makeDb({ items, jobs, jobUnits });
  const result = await resolveHistoricalServiceTarget(db, 25);
  assert.deepEqual(result, { scope: "service_type", itemId: null, serviceType: "ซ่อมแอร์" });
});

test("bulkResolveHistoricalItemMatches never throws and never counts a job when its unit has a text-format/unparseable BTU value", async () => {
  const items = [{ item_id: 1, job_category: "ล้าง", ac_type: "wall", btu_min: 9000, btu_max: 12000 }];
  const jobs = [{ job_id: 400, job_type: "ล้าง", catalog_item_id: null, job_status: "เสร็จแล้ว", canceled_at: null }];
  const jobUnits = [{ unit_id: 1, job_id: 400, ac_type: "wall", btu: "ไม่ระบุ", status: "active" }];
  const db = makeDb({ items, jobs, jobUnits });

  const byItem = await bulkResolveHistoricalItemMatches(db, [1]);
  assert.equal(byItem.get(1), undefined);
});
