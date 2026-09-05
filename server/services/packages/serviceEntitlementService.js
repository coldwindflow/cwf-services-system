"use strict";

const crypto = require("node:crypto");
const repository = require("./servicePackageRepository");
const { resolveCompositeBooking } = require("./compositeServicePackage");

const MANUAL_PAYMENT_METHODS = new Set(["cash", "bank_transfer", "qr", "promptpay", "other"]);
const PAYABLE_STATUSES = new Set(["pending_payment", "payment_failed"]);
const MAX_ORDER_CODE_ATTEMPTS = 5;

class ServiceEntitlementError extends Error {
  constructor(code, status = 409, detail = null) {
    super(code);
    this.name = "ServiceEntitlementError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function fail(code, status = 409, detail = null) {
  throw new ServiceEntitlementError(code, status, detail);
}

function clean(value, max = 500) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function exactMoney(value) {
  const raw = String(value == null ? "" : value).trim();
  if (!/^\d+\.\d{2}$/.test(raw)) fail("INVALID_SERVICE_PURCHASE_AMOUNT", 409);
  return raw;
}

function moneyMinor(value) {
  const raw = exactMoney(value);
  const [major, minor] = raw.split(".");
  return BigInt(major) * 100n + BigInt(minor);
}

function generateOrderCode() {
  const t = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `CWF-${t}${rand}`;
}

function entitlementCodeForOrder(orderCode) {
  const suffix = clean(orderCode, 80).replace(/^CWF-/i, "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (!suffix) fail("INVALID_ORDER_CODE", 409);
  return `CWF-R-${suffix}`;
}

function normalizedMethod(value) {
  const method = clean(value, 40).toLowerCase();
  if (!MANUAL_PAYMENT_METHODS.has(method)) fail("INVALID_PAYMENT_METHOD", 400);
  return method;
}

function validatePurchaseSnapshot(snapshot, subtotal) {
  const value = typeof snapshot === "string" ? (() => { try { return JSON.parse(snapshot); } catch (_) { return null; } })() : snapshot;
  if (!value || value.schema_version !== 1 || value.payment_mode !== "prepaid_full") fail("INVALID_SERVICE_PURCHASE_SNAPSHOT", 409);
  if (!Array.isArray(value.items) || !value.items.length || !Array.isArray(value.service_package_groups) || !value.service_package_groups.length) {
    fail("INVALID_SERVICE_PURCHASE_SNAPSHOT", 409);
  }
  if (moneyMinor(value.fixed_total_price) !== moneyMinor(subtotal)) fail("SERVICE_PURCHASE_AMOUNT_MISMATCH", 409);
  const expiry = new Date(value.redeem_until || "");
  if (!Number.isFinite(expiry.getTime())) fail("INVALID_SERVICE_PURCHASE_EXPIRY", 409);
  return value;
}

function purchaseSnapshotFromQuote(quote, createdAt = new Date()) {
  const purchasedAt = new Date(createdAt);
  return {
    schema_version: 1,
    catalog_item_id: String(quote.bundleId),
    service_bundle_key: quote.bundleKey || null,
    fixed_total_price: exactMoney(quote.fixedTotal),
    currency: "THB",
    payment_mode: quote.paymentMode,
    pricing_strategy: quote.pricingStrategy,
    selection_mode: quote.selectionMode,
    warranty_days: quote.warrantyDays == null ? null : Number(quote.warrantyDays),
    redeem_until: quote.redeemUntil || null,
    quoted_at: Number.isFinite(purchasedAt.getTime()) ? purchasedAt.toISOString() : new Date().toISOString(),
    machine_count: Number(quote.payload?.machine_count || 0),
    service_package_groups: (quote.payload?.service_package_groups || []).map((group) => ({
      package_key: String(group.package_key), btu: Number(group.btu), quantity: Number(group.quantity),
    })),
    services: (quote.payload?.services || []).map((service) => ({
      job_type: service.job_type, ac_type: service.ac_type, btu: Number(service.btu),
      machine_count: Number(service.machine_count), wash_variant: service.wash_variant || "", repair_variant: service.repair_variant || "",
    })),
    items: (quote.items || []).map((item) => ({
      item_id: String(item.item_id), item_name: String(item.item_name), qty: Number(item.qty),
      unit_price: exactMoney(item.unit_price), line_total: exactMoney(item.line_total),
      is_service: item.is_service === true, customer_price_source: item.customer_price_source || "service_package",
      service_package_id: String(item.packageId), service_package_tier_id: String(item.tierId),
      service_package_snapshot: item.snapshot,
    })),
  };
}

function publicPendingOrder(row) {
  const snapshot = row?.service_purchase_snapshot || null;
  return {
    order_code: row.order_code,
    status: row.status,
    payment_status: row.payment_status || "",
    subtotal: Number(row.subtotal || 0),
    customer_name: row.customer_name || "",
    customer_phone: row.customer_phone || "",
    catalog_item_id: row.catalog_item_id == null ? null : String(row.catalog_item_id),
    service: snapshot ? {
      bundle_key: snapshot.service_bundle_key || null,
      machine_count: Number(snapshot.machine_count || 0),
      service_level: snapshot.items?.[0]?.service_package_snapshot?.service_level || null,
      redeem_until: snapshot.redeem_until || null,
      warranty_days: snapshot.warranty_days == null ? null : Number(snapshot.warranty_days),
      groups: snapshot.service_package_groups || [],
    } : null,
    created_at: row.created_at,
    paid_at: row.paid_at || null,
  };
}

function effectiveEntitlementStatus(row, now = new Date()) {
  const stored = clean(row.status, 40);
  if ((stored === "active" || stored === "booked") && row.expires_at && new Date(row.expires_at) < now && !row.related_job_id) return "expired";
  if (row.finished_at && stored === "booked") return "redeemed";
  return stored;
}

function publicEntitlement(row, now = new Date()) {
  const snapshot = row.service_snapshot || {};
  const finishedAt = row.finished_at || null;
  const warrantyDays = row.warranty_days == null ? null : Number(row.warranty_days);
  let warrantyEnd = row.warranty_end_at || null;
  if (!warrantyEnd && finishedAt && warrantyDays) {
    warrantyEnd = new Date(new Date(finishedAt).getTime() + warrantyDays * 86400000).toISOString();
  }
  return {
    entitlement_code: row.entitlement_code,
    status: effectiveEntitlementStatus(row, now),
    payment_status: row.payment_status,
    amount_paid: Number(row.amount_paid || 0),
    currency: row.currency || "THB",
    purchased_at: row.purchased_at,
    activated_at: row.activated_at,
    expires_at: row.expires_at,
    booked_at: row.booked_at || null,
    redeemed_at: row.redeemed_at || finishedAt || null,
    service: {
      bundle_key: snapshot.service_bundle_key || null,
      machine_count: Number(snapshot.machine_count || 0),
      service_level: snapshot.items?.[0]?.service_package_snapshot?.service_level || null,
      groups: snapshot.service_package_groups || [],
      warranty_days: warrantyDays,
    },
    booking: row.related_job_id ? {
      booking_code: row.booking_code || null,
      appointment_datetime: row.appointment_datetime || null,
      job_status: row.job_status || null,
    } : null,
    warranty: warrantyDays ? {
      days: warrantyDays,
      start_at: finishedAt,
      end_at: warrantyEnd,
    } : null,
  };
}

async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

function createServiceEntitlementService({ pool, packageRepository = repository, now = () => new Date() } = {}) {
  if (!pool || typeof pool.query !== "function") throw new TypeError("service entitlement service requires a database pool");

  async function quotePurchase(input = {}, db = pool) {
    const quote = await resolveCompositeBooking({
      body: {
        catalog_item_id: input.catalog_item_id,
        service_package_groups: input.service_package_groups,
      },
      bookingMode: "scheduled",
      appointmentDatetime: null,
      repository: packageRepository,
      db,
      identity: "customer",
      now,
      purchaseOnly: true,
    });
    if (!quote || quote.paymentMode !== "prepaid_full") fail("PACKAGE_PREPAID_PURCHASE_NOT_ALLOWED", 409);
    return quote;
  }

  async function createPendingOrder({ customerSub, customerName, customerPhone, input }) {
    const sub = clean(customerSub, 200);
    const name = clean(customerName, 120);
    const phone = clean(customerPhone, 40);
    if (!sub) fail("CUSTOMER_LOGIN_REQUIRED", 401);
    if (!name || !phone) fail("CUSTOMER_CONTACT_REQUIRED", 400);

    for (let attempt = 0; attempt < MAX_ORDER_CODE_ATTEMPTS; attempt += 1) {
      const orderCode = generateOrderCode();
      try {
        return await withTransaction(pool, async (client) => {
          const quote = await quotePurchase(input, client);
          const snapshot = purchaseSnapshotFromQuote(quote, now());
          const inserted = await client.query(
            `INSERT INTO public.customer_orders
               (order_code, customer_name, customer_phone, delivery_method, install_option, address,
                items, subtotal, status, note, customer_sub, order_kind, catalog_item_id, service_purchase_snapshot)
             VALUES ($1,$2,$3,'pickup','none',NULL,$4::jsonb,$5,'pending_payment',NULL,$6,'service_entitlement',$7,$8::jsonb)
             RETURNING order_id, order_code, customer_name, customer_phone, subtotal, status, payment_status,
                       customer_sub, catalog_item_id, service_purchase_snapshot, created_at, paid_at`,
            [orderCode, name, phone, JSON.stringify(snapshot.items), snapshot.fixed_total_price, sub,
              Number(snapshot.catalog_item_id), JSON.stringify(snapshot)]
          );
          return publicPendingOrder(inserted.rows[0]);
        });
      } catch (error) {
        if (error?.code === "23505") continue;
        throw error;
      }
    }
    fail("ORDER_CODE_GENERATION_FAILED", 500);
  }

  async function getPendingOrder(customerSub, orderCode) {
    const result = await pool.query(
      `SELECT order_code, customer_name, customer_phone, subtotal, status, payment_status, customer_sub,
              catalog_item_id, service_purchase_snapshot, created_at, paid_at
         FROM public.customer_orders
        WHERE order_code=$1 AND order_kind='service_entitlement' AND customer_sub=$2
        LIMIT 1`,
      [clean(orderCode, 80), clean(customerSub, 200)]
    );
    if (!result.rows[0]) fail("SERVICE_ORDER_NOT_FOUND", 404);
    return publicPendingOrder(result.rows[0]);
  }

  async function listRights(customerSub) {
    const sub = clean(customerSub, 200);
    if (!sub) fail("CUSTOMER_LOGIN_REQUIRED", 401);
    const result = await pool.query(
      `SELECT e.entitlement_code, e.service_snapshot, e.amount_paid, e.currency, e.payment_status, e.status,
              e.purchased_at, e.activated_at, e.expires_at, e.booked_at, e.redeemed_at,
              e.related_job_id, e.warranty_days,
              j.booking_code, j.appointment_datetime, j.job_status, j.finished_at, j.warranty_end_at
         FROM public.service_entitlements e
         LEFT JOIN public.jobs j ON j.job_id=e.related_job_id
        WHERE e.customer_sub=$1
        ORDER BY e.activated_at DESC, e.entitlement_id DESC`,
      [sub]
    );
    const at = now();
    return result.rows.map((row) => publicEntitlement(row, at));
  }

  async function listOrdersForAdmin(status = "") {
    const desired = clean(status, 40);
    const params = [];
    let where = "WHERE order_kind='service_entitlement'";
    if (desired) {
      params.push(desired);
      where += ` AND status=$${params.length}`;
    }
    const result = await pool.query(
      `SELECT order_code, customer_name, customer_phone, subtotal, status, payment_status, payment_method,
              payment_reference, payment_confirmed_by, payment_provider, customer_sub, catalog_item_id,
              service_purchase_snapshot, created_at, paid_at
         FROM public.customer_orders ${where}
        ORDER BY created_at DESC LIMIT 200`,
      params
    );
    return result.rows.map((row) => ({
      ...publicPendingOrder(row),
      payment_provider: row.payment_provider || "",
      payment_method: row.payment_method || "",
      payment_reference: row.payment_reference || "",
      payment_confirmed_by: row.payment_confirmed_by || "",
    }));
  }

  async function confirmManualPayment({ orderCode, method, reference, actor, amount }) {
    const code = clean(orderCode, 80);
    const paymentMethod = normalizedMethod(method);
    const paymentReference = clean(reference, 160);
    const confirmedBy = clean(actor, 120) || "admin";
    if (!code) fail("ORDER_CODE_REQUIRED", 400);

    return withTransaction(pool, async (client) => {
      const found = await client.query(
        `SELECT order_id, order_code, customer_name, customer_phone, subtotal, status, payment_status,
                payment_provider, payment_method, payment_reference, payment_confirmed_by, paid_at,
                customer_sub, order_kind, catalog_item_id, service_purchase_snapshot, created_at
           FROM public.customer_orders WHERE order_code=$1 FOR UPDATE`,
        [code]
      );
      const order = found.rows[0];
      if (!order || order.order_kind !== "service_entitlement") fail("SERVICE_ORDER_NOT_FOUND", 404);
      const snapshot = validatePurchaseSnapshot(order.service_purchase_snapshot, exactMoney(order.subtotal));
      const exactSubtotal = exactMoney(order.subtotal);
      if (amount != null && String(amount).trim() !== "" && moneyMinor(String(Number(amount).toFixed(2))) !== moneyMinor(exactSubtotal)) {
        fail("PAYMENT_AMOUNT_MISMATCH", 409);
      }
      const expiry = new Date(snapshot.redeem_until);
      if (expiry < now()) fail("UNPAID_SERVICE_ORDER_EXPIRED", 409);

      const existing = await client.query(
        `SELECT e.*, j.booking_code, j.appointment_datetime, j.job_status, j.finished_at, j.warranty_end_at
           FROM public.service_entitlements e
           LEFT JOIN public.jobs j ON j.job_id=e.related_job_id
          WHERE e.source_order_id=$1 LIMIT 1`,
        [order.order_id]
      );
      if (order.status === "paid") {
        if (!existing.rows[0]) fail("PAID_ORDER_ENTITLEMENT_MISSING", 409);
        return { replayed: true, order: publicPendingOrder(order), entitlement: publicEntitlement(existing.rows[0], now()) };
      }
      if (!PAYABLE_STATUSES.has(order.status)) fail("SERVICE_ORDER_NOT_PAYABLE", 409);

      const paid = await client.query(
        `UPDATE public.customer_orders
            SET payment_provider='manual', payment_method=$2, payment_reference=$3,
                payment_confirmed_by=$4, payment_status='paid', status='paid',
                paid_at=COALESCE(paid_at,NOW()), updated_at=NOW()
          WHERE order_id=$1
          RETURNING order_id, order_code, customer_name, customer_phone, subtotal, status, payment_status,
                    customer_sub, catalog_item_id, service_purchase_snapshot, created_at, paid_at`,
        [order.order_id, paymentMethod, paymentReference || null, confirmedBy]
      );
      const paidOrder = paid.rows[0];
      const entitlementCode = entitlementCodeForOrder(order.order_code);
      await client.query(
        `INSERT INTO public.service_entitlements
           (entitlement_code, customer_sub, source_order_id, catalog_item_id, service_snapshot, amount_paid,
            currency, payment_status, status, purchased_at, activated_at, expires_at, warranty_days)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,'THB','paid','active',$7,$8,$9,$10)
         ON CONFLICT (source_order_id) DO NOTHING`,
        [entitlementCode, order.customer_sub, order.order_id, order.catalog_item_id, JSON.stringify(snapshot),
          exactSubtotal, order.created_at, paidOrder.paid_at, snapshot.redeem_until, snapshot.warranty_days]
      );
      const entitlement = await client.query(
        `SELECT e.*, NULL::text AS booking_code, NULL::timestamptz AS appointment_datetime,
                NULL::text AS job_status, NULL::timestamptz AS finished_at, NULL::timestamptz AS warranty_end_at
           FROM public.service_entitlements e WHERE e.source_order_id=$1 LIMIT 1`,
        [order.order_id]
      );
      if (!entitlement.rows[0]) fail("ENTITLEMENT_ACTIVATION_FAILED", 500);
      return { replayed: false, order: publicPendingOrder(paidOrder), entitlement: publicEntitlement(entitlement.rows[0], now()) };
    });
  }

  return {
    quotePurchase,
    createPendingOrder,
    getPendingOrder,
    listRights,
    listOrdersForAdmin,
    confirmManualPayment,
  };
}

module.exports = {
  ServiceEntitlementError,
  createServiceEntitlementService,
  purchaseSnapshotFromQuote,
  validatePurchaseSnapshot,
  entitlementCodeForOrder,
  publicEntitlement,
  publicPendingOrder,
};
