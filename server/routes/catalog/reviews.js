// Verified customer reviews for Store catalog items
// (migrations/20260623_catalog_store_hot_sale_reviews.sql).
//
// Eligibility to submit a review is never trusted from the client: every
// request re-derives "did this customer really complete this job for this
// catalog item, and have they not already reviewed it" from the database
// itself (jobs + catalog_item_reviews), using the same job-status vocabulary
// the rest of the app already treats as "completed" (mirrors index.js's
// STATUS_BUCKETS.done — kept here as a local copy since index.js does not
// export it; if that set changes there, update this one too).
const DONE_JOB_STATUSES = new Set(["เสร็จแล้ว", "เสร็จสิ้น", "ปิดงาน", "completed", "done"]);

const MAX_COMMENT_LENGTH = 500;
const REVIEW_PUBLIC_PAGE_SIZE = 10;
const REVIEW_PUBLIC_PAGE_SIZE_MAX = 50;

// Minimal in-memory fixed-window limiter (mirrors the in-memory Map +
// sweep-expired pattern already used by server/customerAuth.js's OAuth
// state store). Scoped to this module only — not a new auth system, just a
// per-process request throttle so review submission can't be hammered.
function createFixedWindowLimiter({ windowMs, maxRequests, now = () => Date.now() }) {
  const hits = new Map();
  function sweepExpired(currentNow) {
    for (const [key, entry] of hits.entries()) {
      if (currentNow - entry.windowStart >= windowMs) hits.delete(key);
    }
  }
  return {
    consume(key) {
      const currentNow = now();
      sweepExpired(currentNow);
      let entry = hits.get(key);
      if (!entry || currentNow - entry.windowStart >= windowMs) {
        entry = { count: 0, windowStart: currentNow };
      }
      entry.count += 1;
      hits.set(key, entry);
      return entry.count <= maxRequests;
    },
    _hits: hits,
  };
}

function maskCustomerDisplayName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "คุณลูกค้า";
  const first = trimmed[0];
  return `คุณ ${first}${"*".repeat(Math.max(1, Math.min(trimmed.length - 1, 4)))}`;
}

function validateRatingAndComment(body) {
  const rating = Number(body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "กรุณาให้คะแนน 1-5 ดาว" };
  }
  let comment = body?.comment;
  if (comment === undefined || comment === null) {
    comment = null;
  } else {
    comment = String(comment).trim();
    if (comment.length > MAX_COMMENT_LENGTH) {
      return { ok: false, error: `ความเห็นต้องไม่เกิน ${MAX_COMMENT_LENGTH} ตัวอักษร` };
    }
    if (!comment) comment = null;
  }
  return { ok: true, value: { rating, comment } };
}

module.exports = function createCatalogReviewRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();
  const pool = deps.pool || require("../../db/pool");
  const requireCustomerJwt = deps.requireCustomerJwt;
  if (typeof requireCustomerJwt !== "function") {
    throw new Error("createCatalogReviewRoutes requires a requireCustomerJwt middleware function");
  }
  const requireAdminSession = deps.requireAdminSession;
  if (typeof requireAdminSession !== "function") {
    throw new Error("createCatalogReviewRoutes requires a requireAdminSession middleware function");
  }

  // Two independent buckets: per-customer (the genuine identity) and per-IP
  // (defense-in-depth against one account hammering from many IPs is not the
  // concern here — this guards against scripted abuse hitting the endpoint
  // regardless of how many accounts it cycles through). Only the POST
  // submission route consumes these; GET /reviews stays unrestricted.
  const reviewSubmitCustomerLimiter = deps.reviewSubmitCustomerLimiter || createFixedWindowLimiter({
    windowMs: deps.reviewSubmitCustomerLimitWindowMs || 10 * 60 * 1000,
    maxRequests: deps.reviewSubmitCustomerLimitMax || 5,
  });
  const reviewSubmitIpLimiter = deps.reviewSubmitIpLimiter || createFixedWindowLimiter({
    windowMs: deps.reviewSubmitIpLimitWindowMs || 10 * 60 * 1000,
    maxRequests: deps.reviewSubmitIpLimitMax || 20,
  });

  let reviewsSchemaReadyCache = false;
  async function isReviewsSchemaReady(db) {
    if (reviewsSchemaReadyCache) return true;
    const r = await db.query(`SELECT to_regclass('public.catalog_item_reviews') AS reg`);
    const ready = Boolean(r.rows?.[0]?.reg);
    if (ready) reviewsSchemaReadyCache = true;
    return ready;
  }

  let jobsCatalogLinkSchemaReadyCache = false;
  async function isJobsCatalogLinkSchemaReady(db) {
    if (jobsCatalogLinkSchemaReadyCache) return true;
    const r = await db.query(`
      SELECT COUNT(*)::int AS cnt FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'jobs'
         AND column_name IN ('catalog_item_id', 'customer_sub')
    `);
    const ready = Number(r.rows?.[0]?.cnt || 0) === 2;
    if (ready) jobsCatalogLinkSchemaReadyCache = true;
    return ready;
  }

  // Returns the customer's completed, catalog-linked, not-yet-reviewed jobs
  // for this item — the source of truth for both "is eligible at all" and
  // "which job should this review be attached to". Never trusts client input
  // for ownership: the job row itself must carry this customer's sub.
  //
  // `db` is either the module pool (read-only eligibility check, no lock
  // needed) or a transaction client (submission path, where forUpdate=true
  // locks the matching job rows for the duration of the transaction so two
  // concurrent submissions for the same job can't both see it as eligible).
  async function findEligibleJobsForReview(db, customerSub, itemId, { forUpdate = false } = {}) {
    const r = await db.query(
      `SELECT j.job_id, j.appointment_datetime
         FROM public.jobs j
        WHERE j.customer_sub = $1
          AND j.catalog_item_id = $2
          AND j.job_status = ANY($3::text[])
          AND NOT EXISTS (
            SELECT 1 FROM public.catalog_item_reviews r WHERE r.completed_job_id = j.job_id
          )
        ORDER BY j.appointment_datetime DESC${forUpdate ? "\n        FOR UPDATE OF j" : ""}`,
      [customerSub, itemId, Array.from(DONE_JOB_STATUSES)]
    );
    return r.rows;
  }

  // GET /catalog/items/:itemId/reviews — public, paginated, approved-only.
  router.get("/catalog/items/:itemId/reviews", async (req, res) => {
    try {
      const itemId = Number(req.params.itemId);
      if (!Number.isFinite(itemId) || itemId <= 0) {
        return res.status(400).json({ error: "item_id ไม่ถูกต้อง" });
      }
      const reviewsReady = await isReviewsSchemaReady(pool);
      if (!reviewsReady) return res.json({ reviews: [], total: 0, rating_average: null, review_count: 0 });

      const pageSize = Math.min(REVIEW_PUBLIC_PAGE_SIZE_MAX, Math.max(1, Number(req.query.limit) || REVIEW_PUBLIC_PAGE_SIZE));
      const offset = Math.max(0, Number(req.query.offset) || 0);

      const aggR = await pool.query(
        `SELECT AVG(rating)::numeric AS rating_average, COUNT(*)::int AS review_count
           FROM public.catalog_item_reviews WHERE item_id = $1 AND moderation_status = 'approved'`,
        [itemId]
      );
      const ratingAverage = aggR.rows?.[0]?.rating_average == null ? null : Number(aggR.rows[0].rating_average);
      const reviewCount = Number(aggR.rows?.[0]?.review_count || 0);

      const listR = await pool.query(
        `SELECT review_id, rating, comment, created_at, customer_identity
           FROM public.catalog_item_reviews
          WHERE item_id = $1 AND moderation_status = 'approved'
          ORDER BY created_at DESC
          LIMIT $2 OFFSET $3`,
        [itemId, pageSize, offset]
      );

      // Public payload never exposes phone/email/internal customer ID/job ID/booking code/moderation data.
      const reviews = listR.rows.map((row) => ({
        review_id: Number(row.review_id),
        rating: Number(row.rating),
        comment: row.comment || "",
        display_name: maskCustomerDisplayName(row.customer_identity),
        created_at: row.created_at,
      }));

      res.json({ reviews, total: reviewCount, rating_average: ratingAverage, review_count: reviewCount });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "โหลดรีวิวไม่สำเร็จ" });
    }
  });

  // GET /catalog/items/:itemId/reviews/eligibility — requires customer session.
  // Tells the UI honestly whether a "เขียนรีวิว" button/form may be shown.
  router.get("/catalog/items/:itemId/reviews/eligibility", requireCustomerJwt, async (req, res) => {
    try {
      const itemId = Number(req.params.itemId);
      if (!Number.isFinite(itemId) || itemId <= 0) {
        return res.status(400).json({ error: "item_id ไม่ถูกต้อง" });
      }
      const linkReady = await isJobsCatalogLinkSchemaReady(pool);
      const reviewsReady = await isReviewsSchemaReady(pool);
      if (!linkReady || !reviewsReady) {
        return res.json({ eligible: false, eligible_jobs: [] });
      }
      const customerSub = String(req.customer?.sub || "");
      if (!customerSub) return res.json({ eligible: false, eligible_jobs: [] });

      const itemR = await pool.query(`SELECT item_id FROM public.catalog_items WHERE item_id = $1`, [itemId]);
      if (!itemR.rows.length) return res.json({ eligible: false, eligible_jobs: [] });

      const jobs = await findEligibleJobsForReview(pool, customerSub, itemId);
      res.json({
        eligible: jobs.length > 0,
        eligible_jobs: jobs.map((j) => ({ job_id: Number(j.job_id), appointment_datetime: j.appointment_datetime })),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "ตรวจสอบสิทธิ์รีวิวไม่สำเร็จ" });
    }
  });

  // POST /catalog/items/:itemId/reviews — requires customer session. Re-verifies
  // every eligibility condition server-side; never trusts a client-supplied job_id
  // beyond confirming it's one of *this* customer's own genuinely eligible jobs.
  router.post("/catalog/items/:itemId/reviews", requireCustomerJwt, async (req, res) => {
    const client = await pool.connect();
    try {
      const itemId = Number(req.params.itemId);
      if (!Number.isFinite(itemId) || itemId <= 0) {
        return res.status(400).json({ error: "item_id ไม่ถูกต้อง" });
      }
      const linkReady = await isJobsCatalogLinkSchemaReady(pool);
      const reviewsReady = await isReviewsSchemaReady(pool);
      if (!linkReady || !reviewsReady) {
        return res.status(503).json({ error: "ระบบรีวิวยังไม่พร้อมใช้งาน (ยังไม่ได้รัน migration)" });
      }

      const customerSub = String(req.customer?.sub || "");
      if (!customerSub) return res.status(401).json({ error: "กรุณาเข้าสู่ระบบ" });

      // Rate-limit before doing any DB work. Both buckets are always
      // consumed (even on a non-eligible request) so the limit can't be
      // bypassed by retrying with a different job_id.
      const ip = String(req.ip || req.connection?.remoteAddress || "unknown");
      const withinCustomerLimit = reviewSubmitCustomerLimiter.consume(`cust:${customerSub}`);
      const withinIpLimit = reviewSubmitIpLimiter.consume(`ip:${ip}`);
      if (!withinCustomerLimit || !withinIpLimit) {
        return res.status(429).json({ error: "คุณส่งรีวิวบ่อยเกินไป กรุณาลองใหม่ในอีกสักครู่" });
      }

      const validated = validateRatingAndComment(req.body || {});
      if (!validated.ok) return res.status(400).json({ error: validated.error });

      const requestedJobId = Number(req.body?.job_id);

      await client.query("BEGIN");
      let insertResult;
      let matchedJob;
      try {
        // Re-verify everything inside the transaction, with the candidate
        // job rows locked (FOR UPDATE) so a concurrent submission for the
        // same job can't also see it as eligible before either commits:
        // ownership (customer_sub), catalog linkage (catalog_item_id),
        // genuine completion (job_status), and not-already-reviewed
        // (NOT EXISTS against catalog_item_reviews) are all re-checked here,
        // not trusted from any earlier read or from client input.
        const eligibleJobs = await findEligibleJobsForReview(client, customerSub, itemId, { forUpdate: true });
        matchedJob = Number.isFinite(requestedJobId)
          ? eligibleJobs.find((j) => Number(j.job_id) === requestedJobId)
          : eligibleJobs[0];

        if (!matchedJob) {
          await client.query("ROLLBACK");
          return res.status(403).json({ error: "คุณยังไม่มีงานที่เสร็จสมบูรณ์สำหรับสินค้า/บริการนี้ หรือเคยรีวิวงานนี้ไปแล้ว" });
        }

        // customer_identity stores only the customer's own display name as it
        // appeared at submission time (used solely to derive the public masked
        // label, e.g. "คุณ ส***") — never the LINE sub, phone, or email.
        const customerIdentity = String(req.customer?.name || "").trim() || "ลูกค้า";
        insertResult = await client.query(
          `INSERT INTO public.catalog_item_reviews
             (item_id, completed_job_id, customer_identity, rating, comment, moderation_status)
           VALUES ($1, $2, $3, $4, $5, 'pending')
           RETURNING review_id, created_at`,
          [itemId, matchedJob.job_id, customerIdentity, validated.value.rating, validated.value.comment]
        );
      } catch (insertError) {
        await client.query("ROLLBACK");
        if (insertError && insertError.code === "23505") {
          return res.status(409).json({ error: "งานนี้ถูกใช้รีวิวไปแล้ว" });
        }
        throw insertError;
      }
      await client.query("COMMIT");

      console.log("[catalog_review_submit]", { item_id: itemId, job_id: matchedJob.job_id, review_id: insertResult.rows[0].review_id });
      res.status(201).json({
        review_id: Number(insertResult.rows[0].review_id),
        moderation_status: "pending",
        created_at: insertResult.rows[0].created_at,
      });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch (_) {}
      console.error(e);
      res.status(500).json({ error: "ส่งรีวิวไม่สำเร็จ" });
    } finally {
      client.release();
    }
  });

  // ---- Admin moderation ----

  router.get("/admin/catalog/reviews", requireAdminSession, async (req, res) => {
    try {
      const reviewsReady = await isReviewsSchemaReady(pool);
      if (!reviewsReady) return res.json([]);

      const status = String(req.query.status || "").trim();
      const itemId = Number(req.query.item_id);
      const where = [];
      const params = [];
      let p = 1;
      if (status) { params.push(status); where.push(`r.moderation_status = $${p++}`); }
      if (Number.isFinite(itemId) && itemId > 0) { params.push(itemId); where.push(`r.item_id = $${p++}`); }

      const r = await pool.query(
        `SELECT r.review_id, r.item_id, ci.item_name, r.completed_job_id, r.customer_identity,
                r.rating, r.comment, r.moderation_status, r.created_at, r.updated_at,
                r.moderated_at, r.moderated_by
           FROM public.catalog_item_reviews r
           JOIN public.catalog_items ci ON ci.item_id = r.item_id
           ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
          ORDER BY r.created_at DESC
          LIMIT 200`,
        params
      );
      res.json(r.rows.map((row) => ({
        review_id: Number(row.review_id),
        item_id: Number(row.item_id),
        item_name: row.item_name,
        completed_job_id: Number(row.completed_job_id),
        customer_identity: row.customer_identity,
        rating: Number(row.rating),
        comment: row.comment || "",
        moderation_status: row.moderation_status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        moderated_at: row.moderated_at,
        moderated_by: row.moderated_by,
      })));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "โหลดรายการรีวิวไม่สำเร็จ" });
    }
  });

  router.patch("/admin/catalog/reviews/:reviewId", requireAdminSession, async (req, res) => {
    try {
      const reviewsReady = await isReviewsSchemaReady(pool);
      if (!reviewsReady) return res.status(503).json({ error: "ระบบรีวิวยังไม่พร้อมใช้งาน" });

      const reviewId = Number(req.params.reviewId);
      if (!Number.isFinite(reviewId) || reviewId <= 0) {
        return res.status(400).json({ error: "review_id ไม่ถูกต้อง" });
      }
      const nextStatus = String(req.body?.moderation_status || "").trim();
      const allowed = new Set(["pending", "approved", "rejected", "hidden"]);
      if (!allowed.has(nextStatus)) {
        return res.status(400).json({ error: "สถานะไม่ถูกต้อง" });
      }
      const moderatedBy = String(req.actor?.username || req.auth?.username || "admin");

      const r = await pool.query(
        `UPDATE public.catalog_item_reviews
            SET moderation_status = $1, moderated_at = NOW(), moderated_by = $2, updated_at = NOW()
          WHERE review_id = $3
          RETURNING review_id, moderation_status, moderated_at, moderated_by`,
        [nextStatus, moderatedBy, reviewId]
      );
      if (!r.rows.length) return res.status(404).json({ error: "ไม่พบรีวิว" });
      res.json(r.rows[0]);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "อัปเดตสถานะรีวิวไม่สำเร็จ" });
    }
  });

  return router;
};

module.exports.MAX_COMMENT_LENGTH = MAX_COMMENT_LENGTH;
module.exports.maskCustomerDisplayName = maskCustomerDisplayName;
module.exports.validateRatingAndComment = validateRatingAndComment;
module.exports.DONE_JOB_STATUSES = DONE_JOB_STATUSES;
module.exports.createFixedWindowLimiter = createFixedWindowLimiter;
