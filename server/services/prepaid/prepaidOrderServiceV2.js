"use strict";

const crypto = require("crypto");
const { generateOrderCode } = require("../../routes/customerOrders");
const { createServicePackageResolver } = require("../packages/servicePackageResolver");

const CLAIM_TTL_MINUTES = 15;
const MAX_TEXT = 500;
const REQUEST_KEY_RE = /^[A-Za-z0-9_-]{16,128}$/;

class PrepaidServiceError extends Error {
  constructor(code, statusCode = 400, message = code) {
    super(message);
    this.name = "PrepaidServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function clean(value, max = MAX_TEXT) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(2));
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function generateEntitlementCode() {
  return `CWF-RIGHT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function generateRequestKey(prefix = "prepaid") {
  return `${prefix}_${randomToken(24)}`;
}

function bookingTokenFromScheduledRequestKey(key) {
  return crypto.createHash("sha256").update(`scheduled_v1:${String(key)}`).digest("hex").slice(0, 24);
}

function isSchemaError(error) {
  return error && (error.code === "42P01" || error.code === "42703");
}

async function schemaReady(db) {
  try {
    const result = await db.query(`
      SELECT
        to_regclass('public.customer_service_entitlements') IS NOT NULL AS has_entitlements,
        to_regclass('public.customer_orders') IS NOT NULL AS has_orders,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='customer_orders'
            AND column_name IN (
              'order_kind','customer_sub','service_entitlement_snapshot','prepaid_entitlement_code',
              'prepaid_redeem_until','prepaid_warranty_days','prepaid_purchase_request_key',
              'prepaid_purchase_fingerprint'
            )
          GROUP BY table_name HAVING COUNT(*)=8
        ) AS has_order_columns,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='jobs'
            AND column_name IN ('customer_due','payment_source','prepaid_entitlement_id')
          GROUP BY table_name HAVING COUNT(*)=3
        ) AS has_job_columns
    `);
    const row = result.rows?.[0] || {};
    return Boolean(row.has_entitlements && row.has_orders && row.has_order_columns && row.has_job_columns);
  } catch (_) {
    return false;
  }
}

async function requireSchema(db) {
  if (!(await schemaReady(db))) throw new PrepaidServiceError("PREPAID_SCHEMA_NOT_READY", 503);
}

function normalizeGroups(body = {}) {
  if (!Array.isArray(body.service_package_groups) || !body.service_package_groups.length) {
    throw new PrepaidServiceError("SERVICE_PACKAGE_GROUPS_REQUIRED", 400);
  }
  const groups = body.service_package_groups.map((raw) => {
    const packageKey = clean(raw?.package_key, 128);
    const btu = Number(raw?.btu);
    const quantity = Number(raw?.quantity);
    if (!packageKey || !Number.isSafeInteger(btu) || btu <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 99) {
      throw new PrepaidServiceError("INVALID_SERVICE_PACKAGE_GROUP", 400);
    }
    return { package_key: packageKey, btu, quantity };
  });
  const total = groups.reduce((sum, group) => sum + group.quantity, 0);
  if (total < 1 || total > 99) throw new PrepaidServiceError("INVALID_TOTAL_QUANTITY", 400);
  return groups;
}

function normalizeQuoteInput(body = {}) {
  const catalogItemId = Number(body.catalog_item_id);
  if (!Number.isSafeInteger(catalogItemId) || catalogItemId <= 0) {
    throw new PrepaidServiceError("CATALOG_ITEM_REQUIRED", 400);
  }
  return { catalog_item_id: catalogItemId, service_package_groups: normalizeGroups(body) };
}

function normalizePurchase(body = {}, identity = "customer") {
  const quote = normalizeQuoteInput(body);
  const customerName = clean(body.customer_name, 120);
  const customerPhone = clean(body.customer_phone, 40);
  if (!customerName) throw new PrepaidServiceError("CUSTOMER_NAME_REQUIRED", 400);
  if (!customerPhone) throw new PrepaidServiceError("CUSTOMER_PHONE_REQUIRED", 400);
  let requestKey = clean(body.purchase_request_key, 128);
  if (identity === "customer") {
    if (!REQUEST_KEY_RE.test(requestKey)) throw new PrepaidServiceError("INVALID_PURCHASE_REQUEST_KEY", 400);
  } else if (!REQUEST_KEY_RE.test(requestKey)) {
    requestKey = generateRequestKey("adminprepaid");
  }
  return {
    ...quote,
    customer_name: customerName,
    customer_phone: customerPhone,
    note: clean(body.note, 500),
    purchase_request_key: requestKey,
  };
}

function entitlementSnapshot(quote) {
  if (!quote || quote.paymentMode !== "prepaid_full") {
    throw new PrepaidServiceError("PACKAGE_PREPAID_PURCHASE_NOT_ALLOWED", 409);
  }
  const redeemUntil = quote.redeemUntil ? new Date(quote.redeemUntil) : null;
  if (!redeemUntil || !Number.isFinite(redeemUntil.getTime()) || redeemUntil <= new Date()) {
    throw new PrepaidServiceError("PACKAGE_REDEEM_WINDOW_EXCEEDED", 409);
  }
  const warrantyDays = Number(quote.warrantyDays);
  if (!Number.isInteger(warrantyDays) || warrantyDays < 1 || warrantyDays > 3650) {
    throw new PrepaidServiceError("PACKAGE_WARRANTY_INVALID", 409);
  }
  const total = money(quote.fixedTotal);
  if (!(total > 0)) throw new PrepaidServiceError("INVALID_PACKAGE_PRICE", 409);
  const groups = (quote.payload?.service_package_groups || []).map((group) => ({
    package_key: String(group.package_key),
    btu: Number(group.btu),
    quantity: Number(group.quantity),
  }));
  const services = (quote.payload?.services || []).map((line) => ({
    job_type: line.job_type,
    ac_type: line.ac_type,
    btu: Number(line.btu),
    machine_count: Number(line.machine_count),
    wash_variant: line.wash_variant || "",
    repair_variant: line.repair_variant || "",
  }));
  const snapshots = (quote.items || []).map((item) => ({
    service_package_id: String(item.packageId),
    service_package_tier_id: String(item.tierId),
    service_package_snapshot: item.snapshot,
  }));
  if (!groups.length || !snapshots.length || !services.length) {
    throw new PrepaidServiceError("PACKAGE_SNAPSHOT_INVALID", 409);
  }
  return {
    schema_version: 1,
    catalog_item_id: String(quote.bundleId),
    bundle_key: String(quote.bundleKey || ""),
    fixed_total_price: total.toFixed(2),
    duration_min: Number(quote.durationMin || 0),
    service_package_groups: groups,
    services,
    snapshots,
    payment_mode: "prepaid_full",
    warranty_days: warrantyDays,
    redeem_until: redeemUntil.toISOString(),
    minimum_total_quantity: quote.minimumTotalQuantity == null ? null : Number(quote.minimumTotalQuantity),
    maximum_total_quantity: quote.maximumTotalQuantity == null ? null : Number(quote.maximumTotalQuantity),
    pricing_strategy: quote.pricingStrategy || null,
    selection_mode: quote.selectionMode || null,
  };
}

function orderItemsFromQuote(quote) {
  return (quote.items || []).map((item) => ({
    item_id: String(item.item_id || quote.bundleId || ""),
    name: String(item.item_name || "สิทธิ์บริการ CWF"),
    item_name: String(item.item_name || "สิทธิ์บริการ CWF"),
    qty: Number(item.qty || 1),
    unit_price: Number(item.unit_price || 0),
    line_total: Number(item.line_total || 0),
  }));
}

function publicQuote(snapshot) {
  return {
    catalog_item_id: Number(snapshot.catalog_item_id),
    fixed_total_price: Number(snapshot.fixed_total_price),
    duration_min: Number(snapshot.duration_min),
    service_package_groups: snapshot.service_package_groups,
    services: snapshot.services,
    payment_mode: snapshot.payment_mode,
    warranty_days: snapshot.warranty_days,
    redeem_until: snapshot.redeem_until,
    minimum_total_quantity: snapshot.minimum_total_quantity,
    maximum_total_quantity: snapshot.maximum_total_quantity,
  };
}

async function withTransaction(pool, fn) {
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

function createPrepaidOrderService({ pool }) {
  if (!pool || typeof pool.query !== "function") throw new TypeError("prepaid order service requires pool");

  async function quotePurchase(db, body, identity = "customer") {
    const normalized = normalizeQuoteInput(body);
    const resolver = createServicePackageResolver({ db });
    let quote;
    try {
      quote = await resolver.resolveComposite({
        body: normalized,
        bookingMode: "scheduled",
        appointmentDatetime: null,
        identity,
        purchaseOnly: true,
      });
    } catch (error) {
      if (error?.statusCode) throw error;
      throw new PrepaidServiceError(error?.code || "PACKAGE_PREPAID_PURCHASE_NOT_ALLOWED", 409);
    }
    const snapshot = entitlementSnapshot(quote);
    return { normalized, quote, snapshot };
  }

  async function quoteOrder(body, { identity = "customer" } = {}) {
    await requireSchema(pool);
    const { snapshot } = await quotePurchase(pool, body, identity);
    return publicQuote(snapshot);
  }

  async function createOrder(body, { customerSub = null, identity = "customer" } = {}) {
    const sub = clean(customerSub, 256) || null;
    if (identity === "customer" && !sub) throw new PrepaidServiceError("NOT_LOGGED_IN", 401);
    const normalized = normalizePurchase(body, identity);
    return withTransaction(pool, async (client) => {
      await requireSchema(client);
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [normalized.purchase_request_key]);
      const { quote, snapshot } = await quotePurchase(client, normalized, identity);
      const total = money(quote.fixedTotal);
      const fingerprint = sha256(canonicalJson({
        customer_sub: sub,
        customer_name: normalized.customer_name,
        customer_phone: normalized.customer_phone,
        catalog_item_id: normalized.catalog_item_id,
        groups: normalized.service_package_groups,
        fixed_total_price: snapshot.fixed_total_price,
      }));
      const existing = await client.query(
        `SELECT order_id, order_code, customer_name, customer_phone, items, subtotal, status,
                created_at, prepaid_entitlement_code, prepaid_redeem_until,
                prepaid_warranty_days, prepaid_purchase_fingerprint
           FROM public.customer_orders
          WHERE order_kind='service_prepaid' AND prepaid_purchase_request_key=$1
          FOR UPDATE`,
        [normalized.purchase_request_key]
      );
      if (existing.rows?.[0]) {
        if (String(existing.rows[0].prepaid_purchase_fingerprint || "") !== fingerprint) {
          throw new PrepaidServiceError("PURCHASE_REQUEST_KEY_REUSED", 409);
        }
        return {
          replayed: true,
          order: existing.rows[0],
          claim_token: null,
          entitlement_code: existing.rows[0].prepaid_entitlement_code,
          service: snapshot,
        };
      }

      const entitlementCode = generateEntitlementCode();
      const claimToken = sub ? null : randomToken(32);
      const claimHash = claimToken ? sha256(claimToken) : null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const orderCode = generateOrderCode();
        try {
          const inserted = await client.query(
            `INSERT INTO public.customer_orders
              (order_code, customer_name, customer_phone, delivery_method, install_option,
               address, items, subtotal, status, note, order_kind, customer_sub,
               service_entitlement_snapshot, prepaid_entitlement_code, prepaid_claim_token_hash,
               prepaid_redeem_until, prepaid_warranty_days, prepaid_purchase_request_key,
               prepaid_purchase_fingerprint)
             VALUES ($1,$2,$3,'pickup','none',NULL,$4::jsonb,$5,'pending_payment',$6,
                     'service_prepaid',$7,$8::jsonb,$9,$10,$11,$12,$13,$14)
             RETURNING order_id, order_code, customer_name, customer_phone, items, subtotal,
                       status, created_at, prepaid_entitlement_code, prepaid_redeem_until,
                       prepaid_warranty_days`,
            [
              orderCode, normalized.customer_name, normalized.customer_phone,
              JSON.stringify(orderItemsFromQuote(quote)), total, normalized.note || null,
              sub, JSON.stringify(snapshot), entitlementCode, claimHash,
              snapshot.redeem_until, snapshot.warranty_days,
              normalized.purchase_request_key, fingerprint,
            ]
          );
          return {
            replayed: false,
            order: inserted.rows[0],
            claim_token: claimToken,
            entitlement_code: entitlementCode,
            service: snapshot,
          };
        } catch (error) {
          if (error?.code === "23505" && attempt < 4) continue;
          throw error;
        }
      }
      throw new PrepaidServiceError("ORDER_CODE_GENERATION_FAILED", 500);
    }).catch((error) => {
      if (isSchemaError(error)) throw new PrepaidServiceError("PREPAID_SCHEMA_NOT_READY", 503);
      throw error;
    });
  }

  async function confirmManualPayment(orderCode, body = {}, { verifiedBy = "admin" } = {}) {
    const code = clean(orderCode, 40);
    const reference = clean(body.reference || body.payment_reference, 200);
    const confirmedAmount = money(body.confirmed_amount);
    if (!code) throw new PrepaidServiceError("ORDER_CODE_REQUIRED", 400);
    if (!reference) throw new PrepaidServiceError("PAYMENT_REFERENCE_REQUIRED", 400);
    if (!(confirmedAmount > 0)) throw new PrepaidServiceError("CONFIRMED_AMOUNT_REQUIRED", 400);
    return withTransaction(pool, async (client) => {
      await requireSchema(client);
      const found = await client.query(
        `SELECT order_id, order_code, order_kind, subtotal, status, payment_provider,
                payment_method, payment_charge_id, payment_status, paid_at
           FROM public.customer_orders WHERE order_code=$1 FOR UPDATE`,
        [code]
      );
      const order = found.rows?.[0];
      if (!order) throw new PrepaidServiceError("ORDER_NOT_FOUND", 404);
      if (order.order_kind !== "service_prepaid") throw new PrepaidServiceError("NOT_PREPAID_ORDER", 409);
      if (money(order.subtotal) !== confirmedAmount) throw new PrepaidServiceError("PAYMENT_AMOUNT_MISMATCH", 409);
      if (order.status === "paid") {
        const right = await client.query(
          `SELECT entitlement_code, status, customer_sub, redeem_until, warranty_days
             FROM public.customer_service_entitlements WHERE order_id=$1 LIMIT 1`, [order.order_id]
        );
        return { replayed: true, order_code: code, entitlement: right.rows?.[0] || null };
      }
      if (order.status === "payment_processing" || String(order.payment_status || "").startsWith("processing:")) {
        throw new PrepaidServiceError("ONLINE_PAYMENT_PROCESSING", 409);
      }
      if (order.payment_charge_id) throw new PrepaidServiceError("ONLINE_PAYMENT_ALREADY_LINKED", 409);
      if (!new Set(["pending_payment", "payment_failed"]).has(order.status)) {
        throw new PrepaidServiceError("ORDER_NOT_PAYABLE", 409);
      }
      await client.query(
        `UPDATE public.customer_orders
            SET payment_provider='manual_admin', payment_method='promptpay', payment_status='verified',
                status='paid', paid_at=COALESCE(paid_at,NOW()), manual_payment_reference=$2,
                payment_verified_by=$3, updated_at=NOW()
          WHERE order_id=$1`,
        [order.order_id, reference, clean(verifiedBy, 120) || "admin"]
      );
      const right = await client.query(
        `SELECT entitlement_code, status, customer_sub, redeem_until, warranty_days
           FROM public.customer_service_entitlements WHERE order_id=$1 LIMIT 1`, [order.order_id]
      );
      if (!right.rows?.[0]) throw new PrepaidServiceError("ENTITLEMENT_ISSUE_FAILED", 500);
      return { replayed: false, order_code: code, entitlement: right.rows[0] };
    });
  }

  async function listRights(customerSub) {
    const sub = clean(customerSub, 256);
    if (!sub) throw new PrepaidServiceError("NOT_LOGGED_IN", 401);
    await requireSchema(pool);
    await pool.query(
      `UPDATE public.customer_service_entitlements
          SET status='expired', updated_at=NOW(), redemption_token_hash=NULL,
              redemption_request_key=NULL, redemption_booking_token=NULL, redemption_expires_at=NULL
        WHERE customer_sub=$1 AND status IN ('active','redeeming') AND redeem_until < NOW()`, [sub]
    );
    const result = await pool.query(
      `SELECT e.entitlement_code, e.status, e.customer_name, e.customer_phone,
              e.service_snapshot, e.purchased_amount, e.redeem_until, e.warranty_days,
              e.redeemed_job_id, e.redeemed_at, e.created_at,
              j.booking_code, j.appointment_datetime, j.finished_at, j.canceled_at,
              CASE WHEN j.finished_at IS NULL THEN NULL
                   ELSE j.finished_at + (e.warranty_days * INTERVAL '1 day') END AS warranty_until,
              CASE WHEN j.finished_at IS NULL THEN FALSE
                   ELSE NOW() <= j.finished_at + (e.warranty_days * INTERVAL '1 day') END AS warranty_active
         FROM public.customer_service_entitlements e
         LEFT JOIN public.jobs j ON j.job_id=e.redeemed_job_id
        WHERE e.customer_sub=$1
        ORDER BY e.created_at DESC, e.entitlement_id DESC LIMIT 200`, [sub]
    );
    return result.rows || [];
  }

  async function claimRight({ entitlementCode, claimToken, customerSub }) {
    const code = clean(entitlementCode, 100);
    const token = clean(claimToken, 500);
    const sub = clean(customerSub, 256);
    if (!code || !token || !sub) throw new PrepaidServiceError("CLAIM_DATA_REQUIRED", 400);
    return withTransaction(pool, async (client) => {
      await requireSchema(client);
      const found = await client.query(
        `SELECT entitlement_id, status, customer_sub, claim_token_hash, redeem_until
           FROM public.customer_service_entitlements WHERE entitlement_code=$1 FOR UPDATE`, [code]
      );
      const right = found.rows?.[0];
      if (!right || !right.claim_token_hash) throw new PrepaidServiceError("CLAIM_FAILED", 400);
      const actual = Buffer.from(sha256(token), "hex");
      const expected = Buffer.from(String(right.claim_token_hash), "hex");
      if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
        throw new PrepaidServiceError("CLAIM_FAILED", 400);
      }
      if (right.status === "expired" || new Date(right.redeem_until) < new Date()) {
        await client.query(`UPDATE public.customer_service_entitlements SET status='expired', updated_at=NOW() WHERE entitlement_id=$1`, [right.entitlement_id]);
        throw new PrepaidServiceError("ENTITLEMENT_EXPIRED", 409);
      }
      if (right.customer_sub && right.customer_sub !== sub) throw new PrepaidServiceError("CLAIM_FAILED", 400);
      if (right.status !== "unclaimed" && !(right.status === "active" && right.customer_sub === sub)) {
        throw new PrepaidServiceError("CLAIM_FAILED", 400);
      }
      await client.query(
        `UPDATE public.customer_service_entitlements
            SET customer_sub=$2, status='active', claim_token_hash=NULL, updated_at=NOW()
          WHERE entitlement_id=$1`, [right.entitlement_id, sub]
      );
      await client.query(
        `UPDATE public.customer_orders SET customer_sub=$2, prepaid_claim_token_hash=NULL, updated_at=NOW()
          WHERE prepaid_entitlement_code=$1`, [code, sub]
      );
      return { entitlement_code: code, status: "active" };
    });
  }

  async function beginRedemption({ entitlementCode, customerSub }) {
    const code = clean(entitlementCode, 100);
    const sub = clean(customerSub, 256);
    if (!code || !sub) throw new PrepaidServiceError("REDEMPTION_DATA_REQUIRED", 400);
    return withTransaction(pool, async (client) => {
      await requireSchema(client);
      const found = await client.query(
        `SELECT entitlement_id, status, customer_sub, service_snapshot, redeem_until,
                warranty_days, redeemed_job_id
           FROM public.customer_service_entitlements
          WHERE entitlement_code=$1 AND customer_sub=$2 FOR UPDATE`, [code, sub]
      );
      const right = found.rows?.[0];
      if (!right) throw new PrepaidServiceError("ENTITLEMENT_NOT_FOUND", 404);
      if (right.redeemed_job_id || right.status === "redeemed") throw new PrepaidServiceError("ENTITLEMENT_ALREADY_REDEEMED", 409);
      if (right.status === "cancelled") throw new PrepaidServiceError("ENTITLEMENT_CANCELLED", 409);
      if (new Date(right.redeem_until) < new Date()) {
        await client.query(
          `UPDATE public.customer_service_entitlements
              SET status='expired', redemption_token_hash=NULL, redemption_request_key=NULL,
                  redemption_booking_token=NULL, redemption_expires_at=NULL, updated_at=NOW()
            WHERE entitlement_id=$1`, [right.entitlement_id]
        );
        throw new PrepaidServiceError("ENTITLEMENT_EXPIRED", 409);
      }
      if (!new Set(["active", "redeeming"]).has(right.status)) {
        throw new PrepaidServiceError("ENTITLEMENT_NOT_REDEEMABLE", 409);
      }
      const snapshot = typeof right.service_snapshot === "string" ? JSON.parse(right.service_snapshot) : right.service_snapshot;
      if (!snapshot || snapshot.schema_version !== 1 || !Array.isArray(snapshot.service_package_groups)
          || !snapshot.service_package_groups.length || !Array.isArray(snapshot.services) || !snapshot.services.length) {
        throw new PrepaidServiceError("PACKAGE_SNAPSHOT_INVALID", 409);
      }
      const requestKey = generateRequestKey("prepaid");
      const redemptionToken = randomToken(32);
      const bookingToken = bookingTokenFromScheduledRequestKey(requestKey);
      const expires = new Date(Date.now() + CLAIM_TTL_MINUTES * 60 * 1000);
      await client.query(
        `UPDATE public.customer_service_entitlements
            SET status='redeeming', redemption_request_key=$2, redemption_token_hash=$3,
                redemption_booking_token=$4, redemption_expires_at=$5, updated_at=NOW()
          WHERE entitlement_id=$1`,
        [right.entitlement_id, requestKey, sha256(redemptionToken), bookingToken, expires]
      );
      return {
        entitlement_code: code,
        scheduled_request_key: requestKey,
        prepaid_redemption_token: redemptionToken,
        redemption_expires_at: expires.toISOString(),
        catalog_item_id: Number(snapshot.catalog_item_id),
        service_package_groups: snapshot.service_package_groups,
        services: snapshot.services,
        duration_min: Number(snapshot.duration_min),
        fixed_total_price: Number(snapshot.fixed_total_price),
        redeem_until: snapshot.redeem_until,
        warranty_days: snapshot.warranty_days,
      };
    });
  }

  return {
    schemaReady: () => schemaReady(pool),
    quoteOrder,
    createOrder,
    confirmManualPayment,
    listRights,
    claimRight,
    beginRedemption,
  };
}

module.exports = {
  CLAIM_TTL_MINUTES,
  PrepaidServiceError,
  REQUEST_KEY_RE,
  bookingTokenFromScheduledRequestKey,
  createPrepaidOrderService,
  entitlementSnapshot,
  generateEntitlementCode,
  sha256,
};
