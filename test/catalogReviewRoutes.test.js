const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

const createCatalogReviewRoutes = require("../server/routes/catalog/reviews");

const DONE_STATUS = "เสร็จแล้ว";

function makePool({ schemaReady = true, items = [], jobs = [], reviews = [] } = {}) {
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

    if (/^\s*BEGIN\s*$/i.test(s.trim())) return { rows: [] };
    if (/^\s*COMMIT\s*$/i.test(s.trim())) return { rows: [] };
    if (/^\s*ROLLBACK\s*$/i.test(s.trim())) return { rows: [] };

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
      };
      state.reviews.push(row);
      return { rows: [{ review_id: row.review_id, created_at: row.created_at }] };
    }

    if (s.includes("SELECT AVG(rating)::numeric AS rating_average")) {
      const [itemId] = params;
      const approved = state.reviews.filter((r) => Number(r.item_id) === Number(itemId) && r.moderation_status === "approved");
      const avg = approved.length ? approved.reduce((sum, r) => sum + Number(r.rating), 0) / approved.length : null;
      return { rows: [{ rating_average: avg, review_count: approved.length }] };
    }

    if (s.includes("SELECT review_id, rating, comment, created_at, customer_identity")) {
      const [itemId, limit, offset] = params;
      const approved = state.reviews
        .filter((r) => Number(r.item_id) === Number(itemId) && r.moderation_status === "approved")
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(offset, offset + limit);
      return { rows: approved };
    }

    if (s.includes("FROM public.catalog_item_reviews r") && s.includes("JOIN public.catalog_items ci")) {
      let rows = state.reviews.map((r) => ({
        ...r,
        item_name: (state.items.find((it) => Number(it.item_id) === Number(r.item_id)) || {}).item_name || "?",
      }));
      let idx = 0;
      if (s.includes("r.moderation_status = $")) {
        idx += 1;
        rows = rows.filter((r) => r.moderation_status === params[idx - 1]);
      }
      if (s.includes("r.item_id = $")) {
        idx += 1;
        rows = rows.filter((r) => Number(r.item_id) === Number(params[idx - 1]));
      }
      return { rows };
    }

    if (s.includes("UPDATE public.catalog_item_reviews")) {
      const [nextStatus, moderatedBy, reviewId] = params;
      const row = state.reviews.find((r) => Number(r.review_id) === Number(reviewId));
      if (!row) return { rows: [] };
      row.moderation_status = nextStatus;
      row.moderated_by = moderatedBy;
      row.moderated_at = new Date().toISOString();
      return { rows: [{ review_id: row.review_id, moderation_status: row.moderation_status, moderated_at: row.moderated_at, moderated_by: row.moderated_by }] };
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
