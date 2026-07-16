"use strict";

const express = require("express");
const trackingPrivacy = require("../../services/public/trackingPrivacy");
const history = require("../../services/public/customerHistory");

function createCustomerHistoryRoutes(deps = {}) {
  const pool = deps.pool;
  const requireCustomerJwt = deps.requireCustomerJwt;
  const getSecret = deps.getSecret;
  const logger = deps.logger || console;
  if (!pool || typeof pool.query !== "function") throw new Error("createCustomerHistoryRoutes requires pool");
  if (typeof requireCustomerJwt !== "function") throw new Error("createCustomerHistoryRoutes requires requireCustomerJwt");
  if (typeof getSecret !== "function") throw new Error("createCustomerHistoryRoutes requires getSecret");

  const router = express.Router();
  const ipLimiter = trackingPrivacy.createPublicLookupRateLimiter({ windowMs: 10 * 60 * 1000, max: 20, maxKeys: 5000 });
  const subLimiter = trackingPrivacy.createPublicLookupRateLimiter({ windowMs: 10 * 60 * 1000, max: 12, maxKeys: 5000 });
  const proofLimiter = trackingPrivacy.createPublicLookupRateLimiter({ windowMs: 10 * 60 * 1000, max: 6, maxKeys: 5000 });

  router.use("/public/customer-history", (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });

  function secret() {
    return String(getSecret() || "").trim();
  }

  function rateLimitClaim(req, phoneNorm, bookingCode) {
    const jwtSecret = secret();
    const sub = history.clean(req.customer?.sub);
    const ipOk = ipLimiter.check(trackingPrivacy.clientIpKey(req));
    const subOk = subLimiter.check(sub ? history.hmacHex(jwtSecret, "customer-history-sub-limit", sub) : "missing-sub");
    const proofKey = history.hmacHex(jwtSecret, "customer-history-proof-limit", `${phoneNorm}\0${bookingCode}`);
    const proofOk = proofLimiter.check(proofKey);
    return ipOk.allowed && subOk.allowed && proofOk.allowed;
  }

  function genericClaimFailure(res) {
    return res.status(400).json({
      ok: false,
      error: history.GENERIC_CLAIM_ERROR,
      message: "ไม่สามารถยืนยันประวัติงานได้ กรุณาตรวจสอบข้อมูลอีกครั้ง",
    });
  }

  function logUnavailable(route, ready, error) {
    const dbCode = /^[A-Z0-9_]{2,16}$/.test(String(error?.code || "")) ? String(error.code) : undefined;
    logger.warn?.("[customer_history] unavailable", {
      diagnostic_code: "CUSTOMER_HISTORY_SCHEMA_NOT_READY",
      schema_state: ready?.diagnostic_code || "CHECK_FAILED",
      route,
      ...(dbCode ? { db_code: dbCode } : {}),
    });
  }

  async function resolveClaimUniqueRace(customerSub, phone, proofJobId) {
    const r = await pool.query(
      `SELECT claim_id, customer_sub, phone_norm, phone_last4, proof_job_id
         FROM public.customer_history_claims
        WHERE revoked_at IS NULL
          AND (phone_norm=$1 OR proof_job_id=$2)
        ORDER BY claimed_at ASC
        LIMIT 1`,
      [phone.phone_norm, proofJobId]
    );
    const row = r.rows?.[0] || null;
    if (!row) return { replayed: false, failed: true };
    if (String(row.customer_sub) !== customerSub) return { replayed: false, failed: true };
    return { replayed: true, failed: false, phone_last4: row.phone_last4 || phone.phone_last4 };
  }

  async function authorizedContext(db, customerSub, route) {
    let ready;
    try {
      ready = await history.schemaReady(db);
    } catch (error) {
      logUnavailable(route, null, error);
      const unavailable = new Error("CUSTOMER_HISTORY_SCHEMA_NOT_READY");
      unavailable.status = 503;
      throw unavailable;
    }
    if (!ready.has_claims) {
      logUnavailable(route, ready);
      const err = new Error("CUSTOMER_HISTORY_SCHEMA_NOT_READY");
      err.status = 503;
      throw err;
    }
    const claims = await history.activeClaims(db, customerSub);
    const phoneDigits = history.phoneMatchDigitsForClaims(claims);
    return { ready, claims, phoneDigits };
  }

  router.post("/public/customer-history/claim", requireCustomerJwt, async (req, res) => {
    const customerSub = history.clean(req.customer?.sub);
    if (!customerSub) return res.status(401).json({ error: "NOT_LOGGED_IN" });

    const phone = history.normalizeClaimPhone(req.body?.phone);
    const bookingCode = history.normalizeBookingCode(req.body?.booking_code);
    if (!phone || !bookingCode) return genericClaimFailure(res);
    if (!rateLimitClaim(req, phone.phone_norm, bookingCode)) {
      return res.status(429).json({ error: "RATE_LIMITED", message: "ลองใหม่อีกครั้งภายหลัง" });
    }

    const client = await pool.connect();
    let proofJobId = null;
    try {
      await client.query("BEGIN");
      let ready;
      try {
        ready = await history.schemaReady(client);
      } catch (error) {
        logUnavailable("claim", null, error);
        try { await client.query("ROLLBACK"); } catch (_) {}
        return res.status(503).json({ error: "CUSTOMER_HISTORY_SCHEMA_NOT_READY" });
      }
      if (!ready.has_claims) {
        logUnavailable("claim", ready);
        await client.query("ROLLBACK");
        return res.status(503).json({ error: "CUSTOMER_HISTORY_SCHEMA_NOT_READY" });
      }

      const jobR = await client.query(
        `SELECT job_id, booking_code, customer_phone
           FROM public.jobs
          WHERE upper(btrim(COALESCE(booking_code,''))) = $1
            AND COALESCE(NULLIF(btrim(booking_code), ''), '') <> ''
            AND COALESCE(NULLIF(btrim(customer_phone), ''), '') <> ''
          LIMIT 2
          FOR UPDATE`,
        [bookingCode]
      );
      const job = jobR.rows && jobR.rows.length === 1 ? jobR.rows[0] : null;
      const jobPhoneNorm = history.normalizeJobPhoneDigits(job?.customer_phone);
      if (!job || jobPhoneNorm !== phone.phone_norm) {
        await client.query("ROLLBACK");
        return genericClaimFailure(res);
      }
      proofJobId = job.job_id;

      const existingPhone = await client.query(
        `SELECT claim_id, customer_sub
           FROM public.customer_history_claims
          WHERE phone_norm=$1 AND revoked_at IS NULL
          LIMIT 1
          FOR UPDATE`,
        [phone.phone_norm]
      );
      const activePhone = existingPhone.rows?.[0] || null;
      if (activePhone && String(activePhone.customer_sub) !== customerSub) {
        await client.query("ROLLBACK");
        return genericClaimFailure(res);
      }
      if (activePhone && String(activePhone.customer_sub) === customerSub) {
        await client.query(
          `UPDATE public.customer_history_claims
              SET last_verified_at=NOW()
            WHERE claim_id=$1`,
          [activePhone.claim_id]
        );
        await client.query("COMMIT");
        return res.json({ ok: true, claimed: true, replayed: true, phone_last4: phone.phone_last4 });
      }

      const existingJob = await client.query(
        `SELECT claim_id, customer_sub
           FROM public.customer_history_claims
          WHERE proof_job_id=$1 AND revoked_at IS NULL
          LIMIT 1
          FOR UPDATE`,
        [job.job_id]
      );
      const activeJob = existingJob.rows?.[0] || null;
      if (activeJob && String(activeJob.customer_sub) !== customerSub) {
        await client.query("ROLLBACK");
        return genericClaimFailure(res);
      }

      await client.query(
        `INSERT INTO public.customer_history_claims
           (customer_sub, phone_norm, phone_last4, proof_job_id, claim_method, claimed_at, last_verified_at)
         VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`,
        [customerSub, phone.phone_norm, phone.phone_last4, job.job_id, history.CLAIM_METHOD]
      );
      await client.query("COMMIT");
      return res.json({ ok: true, claimed: true, phone_last4: phone.phone_last4 });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch (_) {}
      if (error && error.code === "23505") {
        try {
          const resolved = await resolveClaimUniqueRace(customerSub, phone, proofJobId);
          if (resolved.replayed) {
            return res.json({ ok: true, claimed: true, replayed: true, phone_last4: resolved.phone_last4 });
          }
        } catch (_) {}
        return genericClaimFailure(res);
      }
      if (error?.status === 503) logUnavailable("claim", null, error);
      else logger.warn?.("[customer_history_claim] failed", {
        diagnostic_code: "CUSTOMER_HISTORY_CLAIM_FAILED",
        db_code: /^[A-Z0-9_]{2,16}$/.test(String(error?.code || "")) ? String(error.code) : undefined,
      });
      return res.status(error.status || 500).json({ error: error.status === 503 ? "CUSTOMER_HISTORY_SCHEMA_NOT_READY" : "CLAIM_FAILED" });
    } finally {
      client.release();
    }
  });

  router.get("/public/customer-history", requireCustomerJwt, async (req, res) => {
    const customerSub = history.clean(req.customer?.sub);
    if (!customerSub) return res.status(401).json({ error: "NOT_LOGGED_IN" });
    if (req.query && Object.prototype.hasOwnProperty.call(req.query, "phone")) {
      return res.status(400).json({ error: "PHONE_QUERY_NOT_ALLOWED" });
    }
    try {
      const ctx = await authorizedContext(pool, customerSub, "history");
      const auth = history.buildAuthorizedWhere({
        customerSub,
        hasCustomerSub: ctx.ready.has_customer_sub,
        phoneDigits: ctx.phoneDigits,
      });
      const r = await pool.query(
        `SELECT j.job_id, j.booking_code, j.appointment_datetime, j.job_status, j.booking_mode,
                j.job_type, j.job_price, j.address_text, j.maps_url, j.job_zone
           FROM public.jobs j
          WHERE ${auth.where}
            AND COALESCE(NULLIF(btrim(j.booking_code), ''), '') <> ''
          ORDER BY COALESCE(j.finished_at, j.appointment_datetime, j.created_at) DESC NULLS LAST, j.job_id DESC
          LIMIT 100`,
        auth.params
      );
      return res.json({
        ok: true,
        claimed: ctx.claims.length > 0,
        items: (r.rows || []).map((row) => history.historyRow(row, { secret: secret(), customerSub })),
      });
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.status === 503 ? "CUSTOMER_HISTORY_SCHEMA_NOT_READY" : "CUSTOMER_HISTORY_FAILED" });
    }
  });

  router.get("/public/customer-history/locations", requireCustomerJwt, async (req, res) => {
    const customerSub = history.clean(req.customer?.sub);
    if (!customerSub) return res.status(401).json({ error: "NOT_LOGGED_IN" });
    if (req.query && Object.prototype.hasOwnProperty.call(req.query, "phone")) {
      return res.status(400).json({ error: "PHONE_QUERY_NOT_ALLOWED" });
    }
    try {
      const ctx = await authorizedContext(pool, customerSub, "locations");
      const auth = history.buildAuthorizedWhere({
        customerSub,
        hasCustomerSub: ctx.ready.has_customer_sub,
        phoneDigits: ctx.phoneDigits,
      });
      const r = await pool.query(
        `SELECT j.booking_code, j.appointment_datetime, j.finished_at,
                j.address_text, j.maps_url, j.job_zone, j.gps_latitude, j.gps_longitude
           FROM public.jobs j
          WHERE ${auth.where}
            AND COALESCE(NULLIF(btrim(j.address_text), ''), '') <> ''
          ORDER BY COALESCE(j.finished_at, j.appointment_datetime, j.created_at) DESC NULLS LAST, j.job_id DESC
          LIMIT 200`,
        auth.params
      );
      const locations = history.groupLocations(r.rows || []);
      return res.json({
        ok: true,
        claimed: ctx.claims.length > 0,
        auto_select: false,
        has_multiple_locations: locations.length > 1,
        locations,
      });
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.status === 503 ? "CUSTOMER_HISTORY_SCHEMA_NOT_READY" : "CUSTOMER_HISTORY_LOCATIONS_FAILED" });
    }
  });

  router.get("/public/customer-history/:job_ref", requireCustomerJwt, async (req, res) => {
    const customerSub = history.clean(req.customer?.sub);
    if (!customerSub) return res.status(401).json({ error: "NOT_LOGGED_IN" });
    const parsed = history.parseJobRef({ secret: secret(), customerSub, jobRef: req.params.job_ref });
    if (!parsed) return res.status(404).json({ error: "NOT_FOUND" });
    try {
      const ctx = await authorizedContext(pool, customerSub, "detail");
      const auth = history.buildAuthorizedWhere({
        customerSub,
        hasCustomerSub: ctx.ready.has_customer_sub,
        phoneDigits: ctx.phoneDigits,
        startParam: 2,
      });
      const r = await pool.query(
        `SELECT j.job_id, j.booking_code, j.appointment_datetime, j.job_status, j.booking_mode,
                j.job_type, j.job_price, j.address_text, j.maps_url, j.job_zone,
                j.duration_min, j.finished_at, j.canceled_at, j.customer_phone
           FROM public.jobs j
          WHERE j.job_id::text=$1
            AND ${auth.where}
          LIMIT 1`,
        [parsed.job_id, ...auth.params]
      );
      const row = r.rows?.[0] || null;
      if (!row) return res.status(404).json({ error: "NOT_FOUND" });
      return res.json({ ok: true, item: history.detailRow(row, { secret: secret(), customerSub }) });
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.status === 503 ? "CUSTOMER_HISTORY_SCHEMA_NOT_READY" : "CUSTOMER_HISTORY_DETAIL_FAILED" });
    }
  });

  return router;
}

module.exports = createCustomerHistoryRoutes;
