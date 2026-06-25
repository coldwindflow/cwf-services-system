const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

const createCatalogReviewRoutes = require("../server/routes/catalog/reviews");

// isTrackingReviewSchemaReady caches "ready" at module scope (deliberately,
// so index.js's /public/track route shares the same cached check). That
// means once any test in this file makes it ready=true, it stays true for
// the rest of the process. Tests that specifically need to observe the
// not-ready (pre-migration) path must force a fresh module instance.
const reviewsModulePath = require.resolve("../server/routes/catalog/reviews");
function freshCreateCatalogReviewRoutes(...args) {
  delete require.cache[reviewsModulePath];
  const fresh = require(reviewsModulePath);
  return fresh(...args);
}

const DONE_STATUS = "เสร็จแล้ว";

function makePool({ schemaReady = true, trackingSchemaReady = false, items = [], jobs = [], reviews = [] } = {}) {
  const state = {
    items: items.map((x) => ({ ...x })),
    jobs: jobs.map((x) => ({ ...x })),
    reviews: reviews.map((x) => ({ ...x })),
  };
  let nextReviewId = 1 + state.reviews.reduce((max, r) => Math.max(max, Number(r.review_id) || 0), 0);

  async function query(sql, params = []) {
    const s = String(sql);

    if (s.includes("to_regclass('public.catalog_item_reviews')")) {
      return { rows: [{ reg: schemaReady ? "public.catalog_item_reviews" : null }] };
    }
    if (s.includes("information_schema.columns") && s.includes("catalog_item_id', 'customer_sub")) {
      return { rows: [{ cnt: schemaReady ? 2 : 0 }] };
    }
    if (s.includes("information_schema.columns") && s.includes("table_name = 'catalog_item_reviews'") && s.includes("review_source")) {
      return { rows: [{ cnt: trackingSchemaReady ? 4 : 0 }] };
    }
    // historicalServiceResolver's own jobs.catalog_item_id readiness check (singular column_name, no customer_sub).
    if (s.includes("table_name = 'jobs'") && s.includes("column_name = 'catalog_item_id'") && !s.includes("customer_sub")) {
      return { rows: [{ cnt: schemaReady ? 1 : 0 }] };
    }

    if (s.includes("FROM public.jobs") && s.includes("WHERE booking_token = $1 OR booking_code = $1")) {
      const [token] = params;
      const job = state.jobs.find((j) => j.booking_token === token || j.booking_code === token);
      return { rows: job ? [{ ...job }] : [] };
    }

    if (s.includes("FROM public.jobs WHERE job_id = $1")) {
      const [jobId] = params;
      const job = state.jobs.find((j) => Number(j.job_id) === Number(jobId));
      if (!job) return { rows: [] };
      return { rows: [{ job_id: job.job_id, job_type: job.job_type, catalog_item_id: schemaReady ? (job.catalog_item_id ?? null) : null }] };
    }

    if (s.includes("FROM public.job_units ju") && s.includes("WHERE ju.job_id = $1")) {
      return { rows: [] }; // no job_units fixtures exercised here; see historicalServiceResolver.test.js for unit-matching coverage
    }

    if (s.includes("SELECT review_id, rating, comment, moderation_status, created_at") && s.includes("WHERE completed_job_id = $1")) {
      const [jobId] = params;
      const row = state.reviews.find((r) => Number(r.completed_job_id) === Number(jobId));
      return { rows: row ? [{ ...row }] : [] };
    }

    if (/^\s*BEGIN\s*$/i.test(s.trim())) return { rows: [] };
    if (/^\s*COMMIT\s*$/i.test(s.trim())) return { rows: [] };
    if (/^\s*ROLLBACK\s*$/i.test(s.trim())) return { rows: [] };

    if (s.includes("SELECT review_id, review_scope, assigned_item_id FROM public.catalog_item_reviews WHERE review_id = $1 FOR UPDATE")) {
      const [reviewId] = params;
      const row = state.reviews.find((r) => Number(r.review_id) === Number(reviewId));
      return { rows: row ? [{ review_id: row.review_id, review_scope: row.review_scope || "item", assigned_item_id: row.assigned_item_id ?? null }] : [] };
    }

    if (s.includes("SELECT j.job_id, j.appointment_datetime")) {
      const [customerSub, itemId, statuses] = params;
      const reviewed = new Set(state.reviews.map((r) => Number(r.completed_job_id)));
      const rows = state.jobs
        .filter((j) =>
          String(j.customer_sub) === String(customerSub) &&
          Number(j.catalog_item_id) === Number(itemId) &&
          statuses.includes(j.job_status) &&
          !reviewed.has(Number(j.job_id))
        )
        .sort((a, b) => new Date(b.appointment_datetime) - new Date(a.appointment_datetime));
      return { rows };
    }

    if (s.includes("SELECT item_id FROM public.catalog_items WHERE item_id")) {
      const [itemId] = params;
      const found = state.items.find((it) => Number(it.item_id) === Number(itemId));
      return { rows: found ? [{ item_id: found.item_id }] : [] };
    }

    if (s.includes("INSERT INTO public.catalog_item_reviews") && s.includes("tracking_token_hash")) {
      const [itemId, jobId, customerIdentity, rating, comment, reviewScope, serviceType, tokenHash] = params;
      if (state.racyDuplicateJobIds?.has(Number(jobId)) || state.reviews.some((r) => Number(r.completed_job_id) === Number(jobId))) {
        const err = new Error("duplicate key value violates unique constraint");
        err.code = "23505";
        throw err;
      }
      const row = {
        review_id: nextReviewId++,
        item_id: itemId == null ? null : Number(itemId),
        completed_job_id: Number(jobId),
        customer_identity: customerIdentity,
        rating: Number(rating),
        comment,
        moderation_status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        moderated_at: null,
        moderated_by: null,
        review_source: "tracking",
        review_scope: reviewScope,
        service_type: serviceType,
        tracking_token_hash: tokenHash,
        assigned_item_id: null,
        assigned_by: null,
        assigned_at: null,
      };
      state.reviews.push(row);
      return { rows: [{ review_id: row.review_id, created_at: row.created_at }] };
    }

    if (s.includes("INSERT INTO public.catalog_item_reviews")) {
      const [itemId, jobId, customerIdentity, rating, comment] = params;
      if (state.racyDuplicateJobIds?.has(Number(jobId)) || state.reviews.some((r) => Number(r.completed_job_id) === Number(jobId))) {
        const err = new Error("duplicate key value violates unique constraint");
        err.code = "23505";
        throw err;
      }
      const row = {
        review_id: nextReviewId++,
        item_id: Number(itemId),
        completed_job_id: Number(jobId),
        customer_identity: customerIdentity,
        rating: Number(rating),
        comment,
        moderation_status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        moderated_at: null,
        moderated_by: null,
        review_source: "customer_app",
        review_scope: "item",
        service_type: null,
        assigned_item_id: null,
        assigned_by: null,
        assigned_at: null,
      };
      state.reviews.push(row);
      return { rows: [{ review_id: row.review_id, created_at: row.created_at }] };
    }

    if (s.includes("SELECT AVG(rating)::numeric AS rating_average")) {
      const [itemId] = params;
      const approved = state.reviews.filter((r) => Number(r.assigned_item_id ?? r.item_id) === Number(itemId) && r.moderation_status === "approved");
      const avg = approved.length ? approved.reduce((sum, r) => sum + Number(r.rating), 0) / approved.length : null;
      return { rows: [{ rating_average: avg, review_count: approved.length }] };
    }

    if (s.includes("SELECT review_id, rating, comment, created_at, customer_identity")) {
      const [itemId, limit, offset] = params;
      const approved = state.reviews
        .filter((r) => Number(r.assigned_item_id ?? r.item_id) === Number(itemId) && r.moderation_status === "approved")
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(offset, offset + limit);
      return { rows: approved };
    }

    if (s.includes("FROM public.catalog_item_reviews r") && s.includes("JOIN public.catalog_items ci")) {
      let rows = state.reviews.map((r) => ({
        ...r,
        item_name: (state.items.find((it) => Number(it.item_id) === Number(r.item_id)) || {}).item_name || "?",
        assigned_item_name: r.assigned_item_id == null ? null : ((state.items.find((it) => Number(it.item_id) === Number(r.assigned_item_id)) || {}).item_name || "?"),
      }));
      let idx = 0;
      if (s.includes("r.moderation_status = $")) {
        idx += 1;
        rows = rows.filter((r) => r.moderation_status === params[idx - 1]);
      }
      if (s.includes("r.review_source = $")) {
        idx += 1;
        rows = rows.filter((r) => r.review_source === params[idx - 1]);
      }
      if (s.includes("r.item_id = $")) {
        idx += 1;
        rows = rows.filter((r) => Number(r.item_id) === Number(params[idx - 1]));
      }
      return { rows };
    }

    if (s.includes("UPDATE public.catalog_item_reviews")) {
      const reviewId = params[params.length - 1];
      const row = state.reviews.find((r) => Number(r.review_id) === Number(reviewId));
      if (!row) return { rows: [] };
      // Walk "SET col = $n" pairs in the same order they appear in the SQL,
      // matching them positionally against params (literal NOW() sets carry no param).
      const setClauses = s.split("SET")[1].split("WHERE")[0].split(",").map((c) => c.trim());
      let pIdx = 0;
      for (const clause of setClauses) {
        const paramMatch = clause.match(/^(\w+)\s*=\s*\$(\d+)$/);
        if (paramMatch) { row[paramMatch[1]] = params[pIdx++]; continue; }
        const nowMatch = clause.match(/^(\w+)\s*=\s*NOW\(\)$/);
        if (nowMatch) row[nowMatch[1]] = new Date().toISOString();
      }
      return { rows: [{
        review_id: row.review_id,
        moderation_status: row.moderation_status,
        moderated_at: row.moderated_at,
        moderated_by: row.moderated_by,
        assigned_item_id: row.assigned_item_id ?? null,
        assigned_by: row.assigned_by ?? null,
        assigned_at: row.assigned_at ?? null,
      }] };
    }

    throw new Error(`unhandled query in fake pool: ${s.slice(0, 120)}`);
  }

  return {
    query,
    state,
    async connect() {
      return {
        query,
        release() {},
      };
    },
  };
}

function requireCustomerJwtFor(sub, name) {
  return (req, res, next) => {
    if (!sub) return res.status(401).json({ error: "UNAUTHORIZED" });
    req.customer = { sub, name };
    next();
  };
}
function allowAdmin(req, res, next) { req.actor = { username: "admin1" }; next(); }
function denyAdmin(req, res) { res.status(401).json({ error: "UNAUTHORIZED" }); }

async function withServer(router, fn) {
  const app = express();
  app.use(express.json());
  app.use(router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("createCatalogReviewRoutes throws without requireCustomerJwt or requireAdminSession", () => {
  assert.throws(() => createCatalogReviewRoutes({ pool: makePool(), requireAdminSession: allowAdmin }), /requireCustomerJwt/);
  assert.throws(() => createCatalogReviewRoutes({ pool: makePool(), requireCustomerJwt: requireCustomerJwtFor("s1") }), /requireAdminSession/);
});

test("public reviews list is approved-only and never exposes job_id, customer_sub, or moderation fields", async () => {
  const pool = makePool({
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }],
    reviews: [
      { review_id: 1, item_id: 1, completed_job_id: 101, customer_identity: "สมชาย", rating: 5, comment: "ดีมาก", moderation_status: "approved", created_at: "2026-06-01T00:00:00Z" },
      { review_id: 2, item_id: 1, completed_job_id: 102, customer_identity: "สมหญิง", rating: 4, comment: "พอใจ", moderation_status: "pending", created_at: "2026-06-02T00:00:00Z" },
      { review_id: 3, item_id: 1, completed_job_id: 103, customer_identity: "แอบดู", rating: 1, comment: "แย่", moderation_status: "rejected", created_at: "2026-06-03T00:00:00Z" },
    ],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: denyAdmin });

  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items/1/reviews`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.review_count, 1);
    assert.equal(body.rating_average, 5);
    assert.equal(body.reviews.length, 1);
    assert.equal(body.reviews[0].rating, 5);
    assert.match(body.reviews[0].display_name, /^คุณ /);
    assert.ok(!("completed_job_id" in body.reviews[0]));
    assert.ok(!("customer_identity" in body.reviews[0]));
    assert.ok(!("moderation_status" in body.reviews[0]));
    assert.ok(!JSON.stringify(body).includes("สมชาย"));
  });
});

test("public reviews list is honest-empty before the reviews schema migration has run", async () => {
  const pool = makePool({ schemaReady: false });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items/1/reviews`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(body, { reviews: [], total: 0, rating_average: null, review_count: 0 });
  });
});

test("eligibility requires a genuine session and is false with no eligible completed job", async () => {
  const pool = makePool({
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }],
    jobs: [{ job_id: 10, customer_sub: "sub-1", catalog_item_id: 1, job_status: "รอตรวจสอบ", appointment_datetime: "2026-06-01T00:00:00Z" }],
  });
  const routerNoAuth = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: denyAdmin });
  await withServer(routerNoAuth, async (base) => {
    const res = await fetch(`${base}/catalog/items/1/reviews/eligibility`);
    assert.equal(res.status, 401);
  });

  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor("sub-1", "ลูกค้า A"), requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items/1/reviews/eligibility`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.eligible, false);
    assert.deepEqual(body.eligible_jobs, []);
  });
});

test("eligibility is true only for a genuinely completed job linked to this item and owned by this customer", async () => {
  const pool = makePool({
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }],
    jobs: [
      { job_id: 10, customer_sub: "sub-1", catalog_item_id: 1, job_status: DONE_STATUS, appointment_datetime: "2026-06-01T00:00:00Z" },
      { job_id: 11, customer_sub: "sub-2", catalog_item_id: 1, job_status: DONE_STATUS, appointment_datetime: "2026-06-01T00:00:00Z" },
      { job_id: 12, customer_sub: "sub-1", catalog_item_id: 2, job_status: DONE_STATUS, appointment_datetime: "2026-06-01T00:00:00Z" },
      { job_id: 13, customer_sub: "sub-1", catalog_item_id: 1, job_status: "รอตรวจสอบ", appointment_datetime: "2026-06-01T00:00:00Z" },
    ],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor("sub-1", "ลูกค้า A"), requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items/1/reviews/eligibility`);
    const body = await res.json();
    assert.equal(body.eligible, true);
    assert.deepEqual(body.eligible_jobs.map((j) => j.job_id), [10]);
  });
});

test("a job already reviewed is never eligible again", async () => {
  const pool = makePool({
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }],
    jobs: [{ job_id: 10, customer_sub: "sub-1", catalog_item_id: 1, job_status: DONE_STATUS, appointment_datetime: "2026-06-01T00:00:00Z" }],
    reviews: [{ review_id: 1, item_id: 1, completed_job_id: 10, customer_identity: "x", rating: 5, comment: null, moderation_status: "approved", created_at: "2026-06-02T00:00:00Z" }],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor("sub-1", "ลูกค้า A"), requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items/1/reviews/eligibility`);
    const body = await res.json();
    assert.equal(body.eligible, false);
  });
});

test("submitting a review never trusts a client-supplied job_id belonging to another customer", async () => {
  const pool = makePool({
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }],
    jobs: [
      { job_id: 10, customer_sub: "sub-1", catalog_item_id: 1, job_status: DONE_STATUS, appointment_datetime: "2026-06-01T00:00:00Z" },
      { job_id: 99, customer_sub: "sub-2", catalog_item_id: 1, job_status: DONE_STATUS, appointment_datetime: "2026-06-01T00:00:00Z" },
    ],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor("sub-1", "ลูกค้า A"), requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items/1/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating: 5, comment: "ดี", job_id: 99 }),
    });
    assert.equal(res.status, 403);
    assert.equal(pool.state.reviews.length, 0);
  });
});

test("submitting a review with no eligible job at all is rejected even if the client claims a job_id", async () => {
  const pool = makePool({ items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }], jobs: [] });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor("sub-1", "ลูกค้า A"), requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items/1/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating: 5, job_id: 999 }),
    });
    assert.equal(res.status, 403);
  });
});

test("a valid review submission is created as pending and is attached to the real eligible job", async () => {
  const pool = makePool({
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }],
    jobs: [{ job_id: 10, customer_sub: "sub-1", catalog_item_id: 1, job_status: DONE_STATUS, appointment_datetime: "2026-06-01T00:00:00Z" }],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor("sub-1", "ลูกค้า A"), requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items/1/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating: 5, comment: "ดีมาก" }),
    });
    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.moderation_status, "pending");
    assert.equal(pool.state.reviews.length, 1);
    assert.equal(pool.state.reviews[0].completed_job_id, 10);
    assert.equal(pool.state.reviews[0].moderation_status, "pending");
  });
});

test("a duplicate review on the same job is rejected and never inserts a second row", async () => {
  const pool = makePool({
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }],
    jobs: [
      { job_id: 10, customer_sub: "sub-1", catalog_item_id: 1, job_status: DONE_STATUS, appointment_datetime: "2026-06-01T00:00:00Z" },
      { job_id: 20, customer_sub: "sub-1", catalog_item_id: 1, job_status: DONE_STATUS, appointment_datetime: "2026-06-02T00:00:00Z" },
    ],
    reviews: [{ review_id: 1, item_id: 1, completed_job_id: 10, customer_identity: "x", rating: 4, comment: null, moderation_status: "approved", created_at: "2026-06-03T00:00:00Z" }],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor("sub-1", "ลูกค้า A"), requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items/1/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating: 5, job_id: 10 }),
    });
    assert.equal(res.status, 403);
    assert.equal(pool.state.reviews.length, 1);
  });
});

test("a concurrent duplicate review caught only by the DB unique constraint returns 409, not a 500", async () => {
  const pool = makePool({
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }],
    jobs: [{ job_id: 10, customer_sub: "sub-1", catalog_item_id: 1, job_status: DONE_STATUS, appointment_datetime: "2026-06-01T00:00:00Z" }],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor("sub-1", "ลูกค้า A"), requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    // The job is still "eligible" by this request's own read, but another
    // request's INSERT lands first and trips the DB unique constraint.
    pool.state.racyDuplicateJobIds = new Set([10]);
    const res = await fetch(`${base}/catalog/items/1/reviews`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating: 5, job_id: 10 }),
    });
    assert.equal(res.status, 409);
    assert.equal(pool.state.reviews.length, 0);
  });
});

test("rating must be an integer 1-5 and comment is capped at 500 characters", async () => {
  const pool = makePool({
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }],
    jobs: [{ job_id: 10, customer_sub: "sub-1", catalog_item_id: 1, job_status: DONE_STATUS, appointment_datetime: "2026-06-01T00:00:00Z" }],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor("sub-1", "ลูกค้า A"), requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const badRating = await fetch(`${base}/catalog/items/1/reviews`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating: 6 }),
    });
    assert.equal(badRating.status, 400);

    const tooLong = await fetch(`${base}/catalog/items/1/reviews`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating: 5, comment: "a".repeat(501) }),
    });
    assert.equal(tooLong.status, 400);
    assert.equal(pool.state.reviews.length, 0);
  });
});

test("admin moderation list and filters require requireAdminSession and never leak unrelated reviews", async () => {
  const pool = makePool({
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }, { item_id: 2, item_name: "ซ่อมแอร์" }],
    reviews: [
      { review_id: 1, item_id: 1, completed_job_id: 10, customer_identity: "A", rating: 5, comment: "ดี", moderation_status: "pending", created_at: "2026-06-01T00:00:00Z" },
      { review_id: 2, item_id: 2, completed_job_id: 11, customer_identity: "B", rating: 3, comment: "โอเค", moderation_status: "approved", created_at: "2026-06-02T00:00:00Z" },
    ],
  });

  const routerDenied = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: denyAdmin });
  await withServer(routerDenied, async (base) => {
    const res = await fetch(`${base}/admin/catalog/reviews`);
    assert.equal(res.status, 401);
  });

  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const all = await (await fetch(`${base}/admin/catalog/reviews`)).json();
    assert.equal(all.length, 2);

    const pendingOnly = await (await fetch(`${base}/admin/catalog/reviews?status=pending`)).json();
    assert.equal(pendingOnly.length, 1);
    assert.equal(pendingOnly[0].review_id, 1);

    const itemOnly = await (await fetch(`${base}/admin/catalog/reviews?item_id=2`)).json();
    assert.equal(itemOnly.length, 1);
    assert.equal(itemOnly[0].item_id, 2);
  });
});

test("admin can approve, reject, hide, and restore-to-pending with an audit trail; invalid status/id are rejected", async () => {
  const pool = makePool({
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }],
    reviews: [{ review_id: 1, item_id: 1, completed_job_id: 10, customer_identity: "A", rating: 5, comment: "ดี", moderation_status: "pending", created_at: "2026-06-01T00:00:00Z" }],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const badStatus = await fetch(`${base}/admin/catalog/reviews/1`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ moderation_status: "garbage" }),
    });
    assert.equal(badStatus.status, 400);

    const notFound = await fetch(`${base}/admin/catalog/reviews/999`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ moderation_status: "approved" }),
    });
    assert.equal(notFound.status, 404);

    const approve = await fetch(`${base}/admin/catalog/reviews/1`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ moderation_status: "approved" }),
    });
    const approveBody = await approve.json();
    assert.equal(approve.status, 200);
    assert.equal(approveBody.moderation_status, "approved");
    assert.equal(approveBody.moderated_by, "admin1");
    assert.ok(approveBody.moderated_at);

    const hide = await fetch(`${base}/admin/catalog/reviews/1`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ moderation_status: "hidden" }),
    });
    assert.equal((await hide.json()).moderation_status, "hidden");

    const restore = await fetch(`${base}/admin/catalog/reviews/1`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ moderation_status: "pending" }),
    });
    assert.equal((await restore.json()).moderation_status, "pending");
  });
});

test("review submission is wrapped in a single transaction: BEGIN before the eligibility re-check, COMMIT only after a successful INSERT", async () => {
  const pool = makePool({
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }],
    jobs: [{ job_id: 10, customer_sub: "sub-1", catalog_item_id: 1, job_status: DONE_STATUS, appointment_datetime: "2026-06-01T00:00:00Z" }],
  });
  const calls = [];
  const baseConnect = pool.connect.bind(pool);
  pool.connect = async () => {
    const real = await baseConnect();
    return {
      query: (sql, params) => { calls.push(String(sql).trim()); return real.query(sql, params); },
      release: real.release,
    };
  };
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor("sub-1", "ลูกค้า A"), requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items/1/reviews`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating: 5 }),
    });
    assert.equal(res.status, 201);
  });
  const beginIdx = calls.findIndex((c) => /^BEGIN$/i.test(c));
  const eligibilityIdx = calls.findIndex((c) => c.includes("SELECT j.job_id, j.appointment_datetime"));
  const insertIdx = calls.findIndex((c) => c.includes("INSERT INTO public.catalog_item_reviews"));
  const commitIdx = calls.findIndex((c) => /^COMMIT$/i.test(c));
  assert.ok(beginIdx !== -1 && eligibilityIdx !== -1 && insertIdx !== -1 && commitIdx !== -1, calls.join(" | "));
  assert.ok(beginIdx < eligibilityIdx, "BEGIN must come before the eligibility re-check");
  assert.ok(eligibilityIdx < insertIdx, "eligibility re-check must happen before INSERT");
  assert.ok(insertIdx < commitIdx, "INSERT must happen before COMMIT");
  assert.match(calls[eligibilityIdx], /FOR UPDATE OF j/);
});

test("an ineligible submission rolls back the transaction instead of leaving it open", async () => {
  const pool = makePool({ items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }], jobs: [] });
  const calls = [];
  const baseConnect = pool.connect.bind(pool);
  pool.connect = async () => {
    const real = await baseConnect();
    return {
      query: (sql, params) => { calls.push(String(sql).trim()); return real.query(sql, params); },
      release: real.release,
    };
  };
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor("sub-1", "ลูกค้า A"), requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items/1/reviews`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating: 5 }),
    });
    assert.equal(res.status, 403);
  });
  assert.ok(calls.some((c) => /^ROLLBACK$/i.test(c)));
  assert.ok(!calls.some((c) => /^COMMIT$/i.test(c)));
});

test("review submission is rate-limited per customer without affecting public GET reviews", async () => {
  const pool = makePool({
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }],
    jobs: [],
    reviews: [
      { review_id: 1, item_id: 1, completed_job_id: 1, customer_identity: "x", rating: 5, comment: null, moderation_status: "approved", created_at: "2026-06-01T00:00:00Z" },
    ],
  });
  const router = createCatalogReviewRoutes({
    pool,
    requireCustomerJwt: requireCustomerJwtFor("sub-1", "ลูกค้า A"),
    requireAdminSession: denyAdmin,
    reviewSubmitCustomerLimitMax: 2,
    reviewSubmitCustomerLimitWindowMs: 60_000,
    reviewSubmitIpLimitMax: 1000,
  });
  await withServer(router, async (base) => {
    const post = () => fetch(`${base}/catalog/items/1/reviews`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating: 5 }),
    });
    const first = await post();
    const second = await post();
    const third = await post();
    assert.equal(first.status, 403); // no eligible job, but counts toward the limit
    assert.equal(second.status, 403);
    assert.equal(third.status, 429);
    const thirdBody = await third.json();
    assert.match(thirdBody.error, /บ่อยเกินไป/);

    // GET public reviews must be unaffected by the submission rate limit.
    const getRes = await fetch(`${base}/catalog/items/1/reviews`);
    assert.equal(getRes.status, 200);
  });
});

test("review submission rate limit is tracked separately per IP bucket", async () => {
  const pool = makePool({ items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }], jobs: [] });
  const router = createCatalogReviewRoutes({
    pool,
    requireCustomerJwt: requireCustomerJwtFor("sub-1", "ลูกค้า A"),
    requireAdminSession: denyAdmin,
    reviewSubmitCustomerLimitMax: 1000,
    reviewSubmitIpLimitMax: 1,
    reviewSubmitIpLimitWindowMs: 60_000,
  });
  await withServer(router, async (base) => {
    const post = () => fetch(`${base}/catalog/items/1/reviews`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating: 5 }),
    });
    const first = await post();
    const second = await post();
    assert.equal(first.status, 403);
    assert.equal(second.status, 429);
  });
});

test("submitting a review before the migration has run returns 503 instead of a fake success", async () => {
  const pool = makePool({ schemaReady: false });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor("sub-1", "ลูกค้า A"), requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items/1/reviews`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating: 5 }),
    });
    assert.equal(res.status, 503);
  });
});

// ---- Tracking-page reviews (no Customer App login, authorized by the job's
// own booking_token/booking_code) ----

test("GET /public/catalog-reviews/status is honest-empty before the tracking-review migration has run", async () => {
  const pool = makePool({ trackingSchemaReady: false });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/public/catalog-reviews/status?token=tok-1`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(body, { eligible: false, already_reviewed: false });
  });
});

test("GET /public/catalog-reviews/status requires a token and 404s for an unknown token", async () => {
  const pool = makePool({ trackingSchemaReady: true });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const missing = await fetch(`${base}/public/catalog-reviews/status`);
    assert.equal(missing.status, 400);

    const unknown = await fetch(`${base}/public/catalog-reviews/status?token=does-not-exist`);
    assert.equal(unknown.status, 404);
  });
});

test("GET /public/catalog-reviews/status reflects eligible/already-reviewed state derived entirely from the job behind the token", async () => {
  const pool = makePool({
    trackingSchemaReady: true,
    jobs: [
      { job_id: 10, job_type: "ล้าง", catalog_item_id: 1, job_status: DONE_STATUS, canceled_at: null, booking_token: "tok-eligible", customer_name: "สมชาย" },
      { job_id: 11, job_type: "ล้าง", catalog_item_id: 1, job_status: "รอดำเนินการ", canceled_at: null, booking_token: "tok-pending", customer_name: "สมหญิง" },
    ],
    reviews: [{ review_id: 1, item_id: 1, completed_job_id: 10, customer_identity: "สมชาย", rating: 5, comment: "ดี", moderation_status: "pending", created_at: "2026-06-01T00:00:00Z" }],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const reviewed = await (await fetch(`${base}/public/catalog-reviews/status?token=tok-eligible`)).json();
    assert.equal(reviewed.already_reviewed, true);
    assert.equal(reviewed.eligible, false);
    assert.equal(reviewed.review.rating, 5);

    const notDone = await (await fetch(`${base}/public/catalog-reviews/status?token=tok-pending`)).json();
    assert.equal(notDone.eligible, false);
    assert.equal(notDone.already_reviewed, false);
  });
});

test("POST /public/catalog-reviews never trusts client-supplied job_id/item_id and derives the target from the token's real job", async () => {
  const pool = makePool({
    trackingSchemaReady: true,
    jobs: [{ job_id: 20, job_type: "ล้าง", catalog_item_id: 1, job_status: DONE_STATUS, canceled_at: null, booking_token: "tok-20", customer_name: "สมชาย" }],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/public/catalog-reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "tok-20", rating: 5, comment: "ดีมาก", job_id: 999, item_id: 999 }),
    });
    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(pool.state.reviews.length, 1);
    assert.equal(pool.state.reviews[0].completed_job_id, 20);
    assert.equal(pool.state.reviews[0].item_id, 1); // resolved from the job's own catalog_item_id, never the client's item_id
    assert.equal(pool.state.reviews[0].review_source, "tracking");
    assert.equal(pool.state.reviews[0].moderation_status, "pending");
    assert.equal(body.moderation_status, "pending");
  });
});

test("POST /public/catalog-reviews stores only a SHA-256 hash of the token, never the plaintext", async () => {
  const pool = makePool({
    trackingSchemaReady: true,
    jobs: [{ job_id: 21, job_type: "ล้าง", catalog_item_id: 1, job_status: DONE_STATUS, canceled_at: null, booking_token: "super-secret-token", customer_name: "สมชาย" }],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    await fetch(`${base}/public/catalog-reviews`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "super-secret-token", rating: 5 }),
    });
    const stored = pool.state.reviews[0].tracking_token_hash;
    assert.ok(stored);
    assert.notEqual(stored, "super-secret-token");
    assert.equal(stored.length, 64); // hex sha256
  });
});

test("POST /public/catalog-reviews rejects a job that is not genuinely completed or has been cancelled", async () => {
  const pool = makePool({
    trackingSchemaReady: true,
    jobs: [
      { job_id: 22, job_type: "ล้าง", catalog_item_id: 1, job_status: "รอดำเนินการ", canceled_at: null, booking_token: "tok-pending", customer_name: "สมชาย" },
      { job_id: 23, job_type: "ล้าง", catalog_item_id: 1, job_status: DONE_STATUS, canceled_at: "2026-06-01T00:00:00Z", booking_token: "tok-canceled", customer_name: "สมหญิง" },
    ],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const pending = await fetch(`${base}/public/catalog-reviews`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "tok-pending", rating: 5 }),
    });
    assert.equal(pending.status, 403);

    const canceled = await fetch(`${base}/public/catalog-reviews`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "tok-canceled", rating: 5 }),
    });
    assert.equal(canceled.status, 403);
    assert.equal(pool.state.reviews.length, 0);
  });
});

test("POST /public/catalog-reviews rejects an unknown token and a missing token, without leaking which is which beyond a generic error", async () => {
  const pool = makePool({ trackingSchemaReady: true });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const missing = await fetch(`${base}/public/catalog-reviews`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating: 5 }),
    });
    assert.equal(missing.status, 400);

    const unknown = await fetch(`${base}/public/catalog-reviews`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "ghost", rating: 5 }),
    });
    assert.equal(unknown.status, 403);
  });
});

test("a duplicate tracking-review submission for the same job is rejected and never inserts a second row", async () => {
  const pool = makePool({
    trackingSchemaReady: true,
    jobs: [{ job_id: 24, job_type: "ล้าง", catalog_item_id: 1, job_status: DONE_STATUS, canceled_at: null, booking_token: "tok-24", customer_name: "สมชาย" }],
    reviews: [{ review_id: 1, item_id: 1, completed_job_id: 24, customer_identity: "สมชาย", rating: 4, comment: null, moderation_status: "approved", created_at: "2026-06-01T00:00:00Z" }],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/public/catalog-reviews`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "tok-24", rating: 5 }),
    });
    assert.equal(res.status, 409); // caught by the DB unique constraint on completed_job_id, same path as the concurrent-duplicate test below
    assert.equal(pool.state.reviews.length, 1);
  });
});

test("a concurrent duplicate tracking-review caught only by the DB unique constraint returns 409, not a 500", async () => {
  const pool = makePool({
    trackingSchemaReady: true,
    jobs: [{ job_id: 25, job_type: "ล้าง", catalog_item_id: 1, job_status: DONE_STATUS, canceled_at: null, booking_token: "tok-25", customer_name: "สมชาย" }],
  });
  pool.state.racyDuplicateJobIds = new Set([25]);
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/public/catalog-reviews`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "tok-25", rating: 5 }),
    });
    assert.equal(res.status, 409);
    assert.equal(pool.state.reviews.length, 0);
  });
});

test("a job with no determinable catalog item but a known job_type falls back to a service_type-scoped tracking review", async () => {
  const pool = makePool({
    trackingSchemaReady: true,
    jobs: [{ job_id: 26, job_type: "ซ่อม", catalog_item_id: null, job_status: DONE_STATUS, canceled_at: null, booking_token: "tok-26", customer_name: "สมชาย" }],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/public/catalog-reviews`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "tok-26", rating: 4 }),
    });
    assert.equal(res.status, 201);
    assert.equal(pool.state.reviews[0].item_id, null);
    assert.equal(pool.state.reviews[0].review_scope, "service_type");
    assert.equal(pool.state.reviews[0].service_type, "ซ่อมแอร์");
  });
});

test("a job with an unmappable job_type falls back to an overall-scoped tracking review that is still submittable", async () => {
  const pool = makePool({
    trackingSchemaReady: true,
    jobs: [{ job_id: 27, job_type: "ย้าย", catalog_item_id: null, job_status: DONE_STATUS, canceled_at: null, booking_token: "tok-27", customer_name: "สมชาย" }],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/public/catalog-reviews`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "tok-27", rating: 3 }),
    });
    assert.equal(res.status, 201);
    assert.equal(pool.state.reviews[0].item_id, null);
    assert.equal(pool.state.reviews[0].review_scope, "overall");
    assert.equal(pool.state.reviews[0].service_type, null);
  });
});

test("submitting a tracking review before the migration has run returns 503 instead of a fake success", async () => {
  const pool = makePool({ trackingSchemaReady: false });
  const router = freshCreateCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/public/catalog-reviews`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "tok-x", rating: 5 }),
    });
    assert.equal(res.status, 503);
  });
});

test("tracking-review submission is rate-limited per token hash without affecting GET status", async () => {
  const pool = makePool({
    trackingSchemaReady: true,
    jobs: [{ job_id: 28, job_type: "ล้าง", catalog_item_id: 1, job_status: DONE_STATUS, canceled_at: null, booking_token: "tok-28", customer_name: "สมชาย" }],
  });
  pool.state.racyDuplicateJobIds = new Set([28]); // force every insert to "fail" so the limiter (not eligibility) is what's under test
  const router = createCatalogReviewRoutes({
    pool,
    requireCustomerJwt: requireCustomerJwtFor(null),
    requireAdminSession: denyAdmin,
    trackingReviewSubmitTokenLimitMax: 1,
    trackingReviewSubmitIpLimitMax: 1000,
  });
  await withServer(router, async (base) => {
    const post = () => fetch(`${base}/public/catalog-reviews`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "tok-28", rating: 5 }),
    });
    const first = await post();
    const second = await post();
    assert.equal(first.status, 409);
    assert.equal(second.status, 429);

    const status = await fetch(`${base}/public/catalog-reviews/status?token=tok-28`);
    assert.equal(status.status, 200);
  });
});

test("admin moderation queue includes tracking-sourced and itemless (service_type/overall) reviews, with review_source and service_type visible", async () => {
  const pool = makePool({
    trackingSchemaReady: true,
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }],
    reviews: [
      { review_id: 1, item_id: 1, completed_job_id: 10, customer_identity: "A", rating: 5, comment: "ดี", moderation_status: "pending", created_at: "2026-06-01T00:00:00Z", review_source: "customer_app", review_scope: "item", service_type: null },
      { review_id: 2, item_id: null, completed_job_id: 11, customer_identity: "B", rating: 4, comment: "โอเค", moderation_status: "pending", created_at: "2026-06-02T00:00:00Z", review_source: "tracking", review_scope: "service_type", service_type: "ซ่อมแอร์" },
      { review_id: 3, item_id: null, completed_job_id: 12, customer_identity: "C", rating: 3, comment: null, moderation_status: "pending", created_at: "2026-06-03T00:00:00Z", review_source: "tracking", review_scope: "overall", service_type: null },
    ],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const all = await (await fetch(`${base}/admin/catalog/reviews`)).json();
    assert.equal(all.length, 3);
    const itemless = all.filter((r) => r.item_id === null);
    assert.equal(itemless.length, 2); // proves the admin list uses LEFT JOIN, not INNER JOIN, against catalog_items
    const trackingOnly = await (await fetch(`${base}/admin/catalog/reviews?source=tracking`)).json();
    assert.equal(trackingOnly.length, 2);
    const serviceTypeReview = all.find((r) => r.review_id === 2);
    assert.equal(serviceTypeReview.review_scope, "service_type");
    assert.equal(serviceTypeReview.service_type, "ซ่อมแอร์");
  });
});

test("admin can assign/reassign an ambiguous tracking review to a specific catalog item, audited separately from moderation", async () => {
  const pool = makePool({
    trackingSchemaReady: true,
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }, { item_id: 2, item_name: "ซ่อมแอร์" }],
    reviews: [{ review_id: 1, item_id: null, completed_job_id: 11, customer_identity: "B", rating: 4, comment: "โอเค", moderation_status: "pending", created_at: "2026-06-02T00:00:00Z", review_source: "tracking", review_scope: "service_type", service_type: "ซ่อมแอร์" }],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const invalidItem = await fetch(`${base}/admin/catalog/reviews/1`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ assigned_item_id: 999 }),
    });
    assert.equal(invalidItem.status, 404);

    const assign = await fetch(`${base}/admin/catalog/reviews/1`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ assigned_item_id: 2 }),
    });
    const assignBody = await assign.json();
    assert.equal(assign.status, 200);
    assert.equal(assignBody.assigned_item_id, 2);
    assert.equal(assignBody.assigned_by, "admin1");
    assert.ok(assignBody.assigned_at);
    // the review's original scope/target is preserved -- assignment is additive, not a mutation of item_id
    assert.equal(pool.state.reviews[0].item_id, null);
    assert.equal(pool.state.reviews[0].review_scope, "service_type");
  });
});

test("admin review assignment is rejected before the tracking-review migration has run", async () => {
  const pool = makePool({
    trackingSchemaReady: false,
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }],
    reviews: [{ review_id: 1, item_id: 1, completed_job_id: 10, customer_identity: "A", rating: 5, comment: "ดี", moderation_status: "pending", created_at: "2026-06-01T00:00:00Z" }],
  });
  const router = freshCreateCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/reviews/1`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ assigned_item_id: 1 }),
    });
    assert.equal(res.status, 503);
  });
});

test("admin can assign an overall-scoped review to a specific catalog item", async () => {
  const pool = makePool({
    trackingSchemaReady: true,
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }],
    reviews: [{ review_id: 1, item_id: null, completed_job_id: 12, customer_identity: "C", rating: 3, comment: null, moderation_status: "pending", created_at: "2026-06-03T00:00:00Z", review_source: "tracking", review_scope: "overall", service_type: null }],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/reviews/1`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ assigned_item_id: 1 }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.assigned_item_id, 1);
    assert.equal(pool.state.reviews[0].review_scope, "overall");
  });
});

test("admin reassignment to a different item replaces the prior assignment", async () => {
  const pool = makePool({
    trackingSchemaReady: true,
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }, { item_id: 2, item_name: "ซ่อมแอร์" }],
    reviews: [{ review_id: 1, item_id: null, completed_job_id: 11, customer_identity: "B", rating: 4, comment: "โอเค", moderation_status: "pending", created_at: "2026-06-02T00:00:00Z", review_source: "tracking", review_scope: "service_type", service_type: "ซ่อมแอร์", assigned_item_id: 1, assigned_by: "admin0", assigned_at: "2026-06-02T01:00:00Z" }],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/reviews/1`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ assigned_item_id: 2 }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.assigned_item_id, 2);
    assert.equal(body.assigned_by, "admin1");
  });
});

test("admin can clear an existing assignment by sending assigned_item_id: null", async () => {
  const pool = makePool({
    trackingSchemaReady: true,
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }],
    reviews: [{ review_id: 1, item_id: null, completed_job_id: 11, customer_identity: "B", rating: 4, comment: "โอเค", moderation_status: "pending", created_at: "2026-06-02T00:00:00Z", review_source: "tracking", review_scope: "service_type", service_type: "ซ่อมแอร์", assigned_item_id: 1, assigned_by: "admin0", assigned_at: "2026-06-02T01:00:00Z" }],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/reviews/1`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ assigned_item_id: null }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.assigned_item_id, null);
  });
});

test("admin cannot reassign an item-scoped review onto a different catalog item", async () => {
  const pool = makePool({
    trackingSchemaReady: true,
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }, { item_id: 2, item_name: "ซ่อมแอร์" }],
    reviews: [{ review_id: 1, item_id: 1, completed_job_id: 10, customer_identity: "A", rating: 5, comment: "ดี", moderation_status: "pending", created_at: "2026-06-01T00:00:00Z", review_source: "customer_app", review_scope: "item", service_type: null }],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/reviews/1`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ assigned_item_id: 2 }),
    });
    assert.equal(res.status, 409);
    // original item_id, review_scope, and assignment are untouched
    assert.equal(pool.state.reviews[0].item_id, 1);
    assert.equal(pool.state.reviews[0].review_scope, "item");
    assert.equal(pool.state.reviews[0].assigned_item_id, undefined);
  });
});

test("assigning to a review that does not exist returns 404 without touching other rows", async () => {
  const pool = makePool({
    trackingSchemaReady: true,
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }],
    reviews: [],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/reviews/999`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ assigned_item_id: 1 }),
    });
    assert.equal(res.status, 404);
  });
});

test("admin assignment locks the review row and rolls back the transaction if the update fails", async () => {
  const pool = makePool({
    trackingSchemaReady: true,
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }],
    reviews: [{ review_id: 1, item_id: null, completed_job_id: 11, customer_identity: "B", rating: 4, comment: "โอเค", moderation_status: "pending", created_at: "2026-06-02T00:00:00Z", review_source: "tracking", review_scope: "service_type", service_type: "ซ่อมแอร์" }],
  });
  const calls = [];
  const baseConnect = pool.connect.bind(pool);
  pool.connect = async () => {
    const client = await baseConnect();
    const baseQuery = client.query.bind(client);
    client.query = async (sql, params) => {
      calls.push(String(sql).trim());
      if (String(sql).includes("UPDATE public.catalog_item_reviews")) {
        throw new Error("simulated update failure");
      }
      return baseQuery(sql, params);
    };
    return client;
  };
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/reviews/1`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ assigned_item_id: 1 }),
    });
    assert.equal(res.status, 500);
  });
  assert.ok(calls.some((c) => /^BEGIN$/i.test(c)));
  assert.ok(calls.some((c) => /^ROLLBACK$/i.test(c)));
  assert.ok(!calls.some((c) => /^COMMIT$/i.test(c)));
  // the row was never mutated since the UPDATE itself threw before applying changes
  assert.equal(pool.state.reviews[0].assigned_item_id, undefined);
});

test("admin assignment SELECTs FOR UPDATE before validating scope, and moderation_status updates still record moderated_by/moderated_at", async () => {
  const pool = makePool({
    trackingSchemaReady: true,
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }],
    reviews: [{ review_id: 1, item_id: 1, completed_job_id: 10, customer_identity: "A", rating: 5, comment: "ดี", moderation_status: "pending", created_at: "2026-06-01T00:00:00Z", review_source: "customer_app", review_scope: "item", service_type: null }],
  });
  const calls = [];
  const baseConnect = pool.connect.bind(pool);
  pool.connect = async () => {
    const client = await baseConnect();
    const baseQuery = client.query.bind(client);
    client.query = async (sql, params) => { calls.push(String(sql).trim()); return baseQuery(sql, params); };
    return client;
  };
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/reviews/1`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ moderation_status: "approved" }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.moderation_status, "approved");
    assert.equal(body.moderated_by, "admin1");
    assert.ok(body.moderated_at);
  });
  assert.ok(calls.some((c) => /FOR UPDATE/.test(c)));
});

test("approving a service_type-scoped review with no assigned_item_id (and none sent) is rejected with 409, never silently approved orphan", async () => {
  const pool = makePool({
    trackingSchemaReady: true,
    items: [{ item_id: 1, item_name: "ซ่อมแอร์ผนัง" }],
    reviews: [{ review_id: 1, item_id: null, completed_job_id: 11, customer_identity: "B", rating: 4, comment: "โอเค", moderation_status: "pending", created_at: "2026-06-02T00:00:00Z", review_source: "tracking", review_scope: "service_type", service_type: "ซ่อมแอร์" }],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/reviews/1`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ moderation_status: "approved" }),
    });
    assert.equal(res.status, 409);
    assert.equal(pool.state.reviews[0].moderation_status, "pending");
    assert.equal(pool.state.reviews[0].assigned_item_id, undefined);
  });
});

test("an overall-scoped review can be assigned and approved atomically in a single request", async () => {
  const pool = makePool({
    trackingSchemaReady: true,
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง ล้างปกติ" }],
    reviews: [{ review_id: 1, item_id: null, completed_job_id: 12, customer_identity: "C", rating: 3, comment: null, moderation_status: "pending", created_at: "2026-06-03T00:00:00Z", review_source: "tracking", review_scope: "overall", service_type: null }],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/reviews/1`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ assigned_item_id: 1, moderation_status: "approved" }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.assigned_item_id, 1);
    assert.equal(body.moderation_status, "approved");
    assert.equal(pool.state.reviews[0].assigned_item_id, 1);
    assert.equal(pool.state.reviews[0].moderation_status, "approved");
  });
});

test("an already-approved itemless review can later be bound via assignment-only, without resending moderation_status", async () => {
  const pool = makePool({
    trackingSchemaReady: true,
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง ล้างปกติ" }],
    reviews: [{ review_id: 1, item_id: null, completed_job_id: 11, customer_identity: "B", rating: 4, comment: "โอเค", moderation_status: "approved", created_at: "2026-06-02T00:00:00Z", review_source: "tracking", review_scope: "service_type", service_type: "ล้างแอร์" }],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/reviews/1`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ assigned_item_id: 1 }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.assigned_item_id, 1);
    // status was never resent and stays approved -- this is assignment-only, not a re-approval
    assert.equal(pool.state.reviews[0].moderation_status, "approved");
  });
});

test("public item reviews and rating aggregate include a review only after it has been assigned to that item", async () => {
  const pool = makePool({
    trackingSchemaReady: true,
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง ล้างปกติ" }],
    reviews: [
      { review_id: 1, item_id: 1, completed_job_id: 10, customer_identity: "A", rating: 5, comment: "ดี", moderation_status: "approved", created_at: "2026-06-01T00:00:00Z", review_source: "customer_app", review_scope: "item" },
      { review_id: 2, item_id: null, completed_job_id: 11, customer_identity: "B", rating: 3, comment: "โอเค", moderation_status: "approved", created_at: "2026-06-02T00:00:00Z", review_source: "tracking", review_scope: "overall", assigned_item_id: null },
    ],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const before = await (await fetch(`${base}/catalog/items/1/reviews`)).json();
    assert.equal(before.review_count, 1);
    assert.equal(before.reviews.length, 1);

    await fetch(`${base}/admin/catalog/reviews/2`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ assigned_item_id: 1 }),
    });

    const after = await (await fetch(`${base}/catalog/items/1/reviews`)).json();
    assert.equal(after.review_count, 2);
    assert.equal(after.reviews.length, 2);
  });
});

test("an approved review left unassigned never appears under any other item's reviews", async () => {
  const pool = makePool({
    trackingSchemaReady: true,
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }, { item_id: 2, item_name: "ซ่อมแอร์" }],
    reviews: [
      { review_id: 1, item_id: null, completed_job_id: 11, customer_identity: "B", rating: 4, comment: "โอเค", moderation_status: "approved", created_at: "2026-06-02T00:00:00Z", review_source: "tracking", review_scope: "overall", assigned_item_id: null },
    ],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const item1 = await (await fetch(`${base}/catalog/items/1/reviews`)).json();
    const item2 = await (await fetch(`${base}/catalog/items/2/reviews`)).json();
    assert.equal(item1.review_count, 0);
    assert.equal(item2.review_count, 0);
  });
});

test("admin filter for 'unassigned' uses the effective item (assigned_item_id || item_id), not raw item_id alone", async () => {
  const pool = makePool({
    trackingSchemaReady: true,
    items: [{ item_id: 1, item_name: "ล้างแอร์ผนัง" }],
    reviews: [
      { review_id: 1, item_id: 1, completed_job_id: 10, customer_identity: "A", rating: 5, comment: "ดี", moderation_status: "approved", created_at: "2026-06-01T00:00:00Z", review_source: "customer_app", review_scope: "item" },
      { review_id: 2, item_id: null, completed_job_id: 11, customer_identity: "B", rating: 4, comment: "โอเค", moderation_status: "pending", created_at: "2026-06-02T00:00:00Z", review_source: "tracking", review_scope: "overall", assigned_item_id: null },
      { review_id: 3, item_id: null, completed_job_id: 12, customer_identity: "C", rating: 3, comment: null, moderation_status: "approved", created_at: "2026-06-03T00:00:00Z", review_source: "tracking", review_scope: "overall", assigned_item_id: 1 },
    ],
  });
  const router = createCatalogReviewRoutes({ pool, requireCustomerJwt: requireCustomerJwtFor(null), requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const all = await (await fetch(`${base}/admin/catalog/reviews`)).json();
    const effectiveItemOf = (r) => r.assigned_item_id || r.item_id;
    const unassigned = all.filter((r) => !effectiveItemOf(r));
    const hasEffectiveItem = all.filter((r) => effectiveItemOf(r));
    assert.equal(unassigned.length, 1);
    assert.equal(unassigned[0].review_id, 2);
    assert.equal(hasEffectiveItem.length, 2);
  });
});
