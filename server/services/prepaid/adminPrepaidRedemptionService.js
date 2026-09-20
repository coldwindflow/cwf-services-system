"use strict";

const crypto = require("crypto");
const {
  bookingTokenFromScheduledRequestKey,
  sha256,
} = require("./prepaidOrderServiceV2");

const REDEMPTION_TTL_MINUTES = 15;

class AdminPrepaidRedemptionError extends Error {
  constructor(code, statusCode = 400, message = code) {
    super(message);
    this.name = "AdminPrepaidRedemptionError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function clean(value, max = 256) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function requestKey() {
  return `adminprepaid_${randomToken(18)}`;
}

function parseSnapshot(value) {
  let snapshot = value;
  if (typeof snapshot === "string") {
    try { snapshot = JSON.parse(snapshot); } catch (_) { snapshot = null; }
  }
  if (!snapshot || snapshot.schema_version !== 1
      || !Array.isArray(snapshot.service_package_groups) || !snapshot.service_package_groups.length
      || !Array.isArray(snapshot.services) || !snapshot.services.length
      || !Array.isArray(snapshot.snapshots) || !snapshot.snapshots.length
      || snapshot.payment_mode !== "prepaid_full") {
    throw new AdminPrepaidRedemptionError("PREPAID_SNAPSHOT_INVALID", 409);
  }
  return snapshot;
}

function createAdminPrepaidRedemptionService({ pool, now = () => new Date() }) {
  if (!pool || typeof pool.connect !== "function") {
    throw new TypeError("admin prepaid redemption service requires pool");
  }

  async function withTransaction(fn) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const value = await fn(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch (_) {}
      throw error;
    } finally {
      client.release();
    }
  }

  async function findLocked(client, code) {
    const normalized = clean(code, 120);
    if (!normalized) throw new AdminPrepaidRedemptionError("ENTITLEMENT_CODE_REQUIRED", 400);
    const result = await client.query(
      `SELECT e.entitlement_id, e.entitlement_code, e.status, e.customer_sub,
              e.customer_name, e.customer_phone, e.service_snapshot, e.redeem_until,
              e.warranty_days, e.redeemed_job_id, e.redemption_expires_at,
              o.order_id, o.order_code, o.status AS order_status, o.paid_at
         FROM public.customer_service_entitlements e
         JOIN public.customer_orders o ON o.order_id=e.order_id
        WHERE e.entitlement_code=$1 OR o.order_code=$1
        ORDER BY e.entitlement_id DESC
        LIMIT 1
        FOR UPDATE OF e, o`,
      [normalized]
    );
    const row = result.rows?.[0];
    if (!row) throw new AdminPrepaidRedemptionError("ENTITLEMENT_NOT_FOUND", 404);
    return row;
  }

  async function getForAdmin(code) {
    return withTransaction(async (client) => {
      const row = await findLocked(client, code);
      const snapshot = parseSnapshot(row.service_snapshot);
      return {
        entitlement_code: row.entitlement_code,
        order_code: row.order_code,
        order_status: row.order_status,
        entitlement_status: row.status,
        customer_name: row.customer_name,
        customer_phone: row.customer_phone,
        fixed_total_price: Number(snapshot.fixed_total_price),
        service_package_groups: snapshot.service_package_groups,
        services: snapshot.services,
        redeem_until: row.redeem_until,
        warranty_days: Number(row.warranty_days || snapshot.warranty_days || 0),
        redeemed_job_id: row.redeemed_job_id || null,
      };
    });
  }

  async function prepareForAdminBooking(code) {
    return withTransaction(async (client) => {
      const row = await findLocked(client, code);
      if (row.order_status !== "paid" || !row.paid_at) {
        throw new AdminPrepaidRedemptionError("PREPAID_ORDER_PAYMENT_NOT_VERIFIED", 409);
      }
      if (row.redeemed_job_id || row.status === "redeemed") {
        throw new AdminPrepaidRedemptionError("ENTITLEMENT_ALREADY_REDEEMED", 409);
      }
      if (row.status === "cancelled") {
        throw new AdminPrepaidRedemptionError("ENTITLEMENT_CANCELLED", 409);
      }

      const current = now();
      const redeemUntil = new Date(row.redeem_until);
      if (!Number.isFinite(redeemUntil.getTime()) || current > redeemUntil) {
        await client.query(
          `UPDATE public.customer_service_entitlements
              SET status='expired', redemption_request_key=NULL, redemption_token_hash=NULL,
                  redemption_booking_token=NULL, redemption_expires_at=NULL, updated_at=NOW()
            WHERE entitlement_id=$1`,
          [row.entitlement_id]
        );
        throw new AdminPrepaidRedemptionError("ENTITLEMENT_EXPIRED", 409);
      }
      if (!["unclaimed", "active", "redeeming"].includes(String(row.status))) {
        throw new AdminPrepaidRedemptionError("ENTITLEMENT_NOT_REDEEMABLE", 409);
      }

      const snapshot = parseSnapshot(row.service_snapshot);
      const previousCustomerSub = clean(row.customer_sub, 256) || null;
      const previousStatus = String(row.status) === "unclaimed" ? "unclaimed" : "active";
      const temporaryOwner = previousCustomerSub == null;
      // The existing customer redemption guard deliberately requires ownership.
      // For an unclaimed right, use a short-lived internal principal only while
      // Admin attempts the booking. The original claim token is intentionally
      // preserved; if booking fails releaseAdminPreparation restores unclaimed.
      const ownerSub = previousCustomerSub || `admin-prepaid:${row.entitlement_id}`;
      const key = requestKey();
      const redemptionToken = randomToken(32);
      const bookingToken = bookingTokenFromScheduledRequestKey(key);
      const expiresAt = new Date(current.getTime() + REDEMPTION_TTL_MINUTES * 60 * 1000);

      await client.query(
        `UPDATE public.customer_service_entitlements
            SET customer_sub=$2,
                status='redeeming',
                redemption_request_key=$3,
                redemption_token_hash=$4,
                redemption_booking_token=$5,
                redemption_expires_at=$6,
                updated_at=NOW()
          WHERE entitlement_id=$1`,
        [row.entitlement_id, ownerSub, key, sha256(redemptionToken), bookingToken, expiresAt]
      );

      return {
        entitlement_id: String(row.entitlement_id),
        entitlement_code: row.entitlement_code,
        order_code: row.order_code,
        customer_name: row.customer_name,
        customer_phone: row.customer_phone,
        scheduled_request_key: key,
        prepaid_redemption_token: redemptionToken,
        redemption_expires_at: expiresAt.toISOString(),
        service_package_groups: snapshot.service_package_groups,
        fixed_total_price: Number(snapshot.fixed_total_price),
        duration_min: Number(snapshot.duration_min || 0),
        redeem_until: redeemUntil.toISOString(),
        warranty_days: Number(row.warranty_days || snapshot.warranty_days || 0),
        previous_customer_sub: previousCustomerSub,
        previous_status: previousStatus,
        temporary_owner: temporaryOwner,
      };
    });
  }

  async function releaseAdminPreparation(preparation) {
    if (!preparation?.entitlement_id || !preparation?.scheduled_request_key) return false;
    return withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE public.customer_service_entitlements
            SET customer_sub=$3,
                status=$4,
                redemption_request_key=NULL,
                redemption_token_hash=NULL,
                redemption_booking_token=NULL,
                redemption_expires_at=NULL,
                updated_at=NOW()
          WHERE entitlement_id=$1
            AND redemption_request_key=$2
            AND redeemed_job_id IS NULL
            AND status='redeeming'
          RETURNING entitlement_id`,
        [
          preparation.entitlement_id,
          preparation.scheduled_request_key,
          preparation.previous_customer_sub || null,
          preparation.previous_status === "unclaimed" ? "unclaimed" : "active",
        ]
      );
      return Boolean(result.rows?.[0]);
    });
  }

  return { getForAdmin, prepareForAdminBooking, releaseAdminPreparation };
}

module.exports = {
  AdminPrepaidRedemptionError,
  REDEMPTION_TTL_MINUTES,
  createAdminPrepaidRedemptionService,
};
