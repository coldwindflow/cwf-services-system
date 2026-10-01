#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const pool = require("../db");
const { baseProviderConfig, jwtSign } = require("../server/customerAuth");
const {
  QA,
  assertStagingOnly,
  makeCustomerPayload,
  provisionQaIdentity,
  findQaTransactionalRows,
  deleteQaOrders,
} = require("./stagingQaIdentity");

const ACTION = String(process.argv[2] || "accept");
const CONTEXT = Object.freeze({
  environment: process.env.CWF_ENVIRONMENT,
  containerName: process.env.CWF_STAGING_QA_CONTAINER,
  secret: process.env.CWF_STAGING_QA_SECRET,
});
const BASE_URL = `http://127.0.0.1:${Number(process.env.PORT || 3000)}`;
const PURCHASE_KEY = "cwfqa_air_care_standard_small_q5_20261001";
const PAYMENT_REFERENCE = "CWF-QA-STAGING-AIR-CARE-382";
const ADMIN_REQUEST_KEY = "cwfqa_air_care_admin_booking_20261001";

function evidence(name, fields = {}) {
  const safe = Object.entries(fields).map(([key, value]) => `${key}=${String(value)}`).join(" ");
  console.log(`[QA_EVIDENCE] ${name}${safe ? ` ${safe}` : ""}`);
}

function plusDays(days) {
  const nowBangkok = new Date(Date.now() + (7 * 60 * 60 * 1000));
  nowBangkok.setUTCDate(nowBangkok.getUTCDate() + days);
  return nowBangkok.toISOString().slice(0, 10);
}

function customerToken(offsetSeconds = 0) {
  const secret = baseProviderConfig(process.env).jwtSecret;
  if (!secret) throw Object.assign(new Error("customer JWT secret is not configured"), { code: "STAGING_QA_APP_JWT_SECRET_REQUIRED" });
  return jwtSign(makeCustomerPayload(Math.floor(Date.now() / 1000) + offsetSeconds), secret);
}

function adminCookie(session) {
  return `cwf_session=${encodeURIComponent(session)}`;
}

function customerCookie(token) {
  return `cwf_token=${encodeURIComponent(token)}`;
}

async function request(path, { method = "GET", cookie = "", body, expected = [200] } = {}) {
  const headers = { accept: "application/json" };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  let data = null;
  try { data = await response.json(); } catch (_) {}
  if (!expected.includes(response.status)) {
    const code = String(data?.code || data?.error || "UNEXPECTED_RESPONSE").slice(0, 160);
    const error = new Error(`${method} ${path} returned ${response.status}/${code}`);
    error.code = code;
    error.statusCode = response.status;
    throw error;
  }
  return { status: response.status, data };
}

async function removeQaJobs(adminSession) {
  let rows = await findQaTransactionalRows(pool);
  const jobs = [...new Map(rows.filter((row) => row.job_id).map((row) => [String(row.job_id), row])).values()];
  for (const job of jobs) {
    if (!job.canceled_at) {
      await request(`/jobs/${job.job_id}/admin-cancel`, {
        method: "POST",
        cookie: adminCookie(adminSession),
        body: { reason: QA.marker },
        expected: [200],
      });
    }
    await request(`/jobs/${job.job_id}/admin-delete`, {
      method: "DELETE",
      cookie: adminCookie(adminSession),
      body: { confirm_code: job.booking_code || "DELETE" },
      expected: [200],
    });
  }
  rows = await findQaTransactionalRows(pool);
  assert.equal(rows.some((row) => row.job_id), false, "QA jobs remain after targeted cleanup");
  return jobs.length;
}

async function cleanup(adminSession) {
  const jobs = await removeQaJobs(adminSession);
  const deleted = await deleteQaOrders({ pool, ...CONTEXT });
  const remaining = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM public.customer_orders WHERE customer_sub=$1) AS orders,
       (SELECT COUNT(*)::int FROM public.customer_service_entitlements WHERE customer_sub=$1) AS entitlements,
       (SELECT COUNT(*)::int FROM public.jobs WHERE customer_sub=$1) AS jobs`,
    [QA.customerSub]
  );
  assert.deepEqual(remaining.rows[0], { orders: 0, entitlements: 0, jobs: 0 });
  evidence("cleanup", { jobs, orders: deleted.orders, entitlements: deleted.entitlements, remaining: 0 });
  return { jobs, ...deleted };
}

async function provision() {
  const first = await provisionQaIdentity({ pool, ...CONTEXT });
  const second = await provisionQaIdentity({ pool, ...CONTEXT });
  assert.equal(first.adminSession, second.adminSession, "provisioning is not deterministic");
  evidence("provision", {
    customer: first.customer_count,
    identity: first.identity_count,
    admin: first.admin_count,
    technician: first.technician_count,
    idempotent: true,
    credentials: "redacted",
  });
  return second;
}

async function catalogEvidence() {
  const response = await request("/catalog/items?customer=1");
  const items = Array.isArray(response.data) ? response.data : (response.data?.items || []);
  const airCare = items.filter((item) => [
    "coldwindflow-air-care-standard",
    "coldwindflow-air-care-premium",
  ].includes(String(item.service_bundle_key || "")));
  assert.equal(airCare.length, 2, "customer catalog must expose two AIR CARE parents");
  for (const item of airCare) {
    assert.equal(item.is_active, true);
    assert.equal(item.is_customer_visible, true);
    assert.equal(Array.isArray(item.service_package_variants), true);
    assert.equal(item.service_package_variants.length, 2);
  }
  evidence("store", { parents: 2, variants: 4 });
}

async function loadCatalogIds() {
  const result = await pool.query(
    `SELECT item_id, service_bundle_key FROM public.catalog_items
      WHERE service_bundle_key=ANY($1::text[]) AND is_active=TRUE AND is_customer_visible=TRUE`,
    [["coldwindflow-air-care-standard", "coldwindflow-air-care-premium"]]
  );
  return new Map(result.rows.map((row) => [String(row.service_bundle_key), Number(row.item_id)]));
}

async function pricingEvidence(cookie) {
  const catalog = await loadCatalogIds();
  const matrices = [
    { label: "standard-small", bundle: "coldwindflow-air-care-standard", packageKey: "coldwindflow-air-care-standard-small", btu: 12000, expected: [499, 899, 1299, 1699, 2198, 2598] },
    { label: "standard-large", bundle: "coldwindflow-air-care-standard", packageKey: "coldwindflow-air-care-standard-large", btu: 18000, expected: [599, 1099, 1599, 2099, 2698, 3198] },
    { label: "premium-small", bundle: "coldwindflow-air-care-premium", packageKey: "coldwindflow-air-care-premium-small", btu: 12000, expected: [699, 1399, 1899, 2489, 3188, 3798] },
    { label: "premium-large", bundle: "coldwindflow-air-care-premium", packageKey: "coldwindflow-air-care-premium-large", btu: 18000, expected: [899, 1799, 2599, 3399, 4298, 5197] },
  ];
  for (const matrix of matrices) {
    const actual = [];
    for (let quantity = 1; quantity <= 6; quantity += 1) {
      const quoted = await request("/public/prepaid-orders/quote", {
        method: "POST",
        cookie,
        body: {
          catalog_item_id: catalog.get(matrix.bundle),
          service_package_groups: [{ package_key: matrix.packageKey, btu: matrix.btu, quantity }],
        },
      });
      actual.push(Number(quoted.data?.quote?.fixed_total_price));
    }
    assert.deepEqual(actual, matrix.expected, `${matrix.label} server prices differ`);
    evidence("server_quote", { matrix: matrix.label, q1_q6: actual.join(",") });
  }
  return catalog;
}

async function runAcceptance(adminSession) {
  await cleanup(adminSession);
  await catalogEvidence();

  const firstToken = customerToken(0);
  const firstCookie = customerCookie(firstToken);
  const me = await request("/public/me", { cookie: firstCookie });
  assert.equal(me.data?.logged_in, true);
  assert.equal(me.data?.user?.name, QA.customerName);
  assert.equal(me.data?.profile?.phone, QA.customerPhone);
  evidence("customer_auth", { model: "customer_profiles+customer_identities+signed_cwf_token", secret: "redacted" });

  const catalog = await pricingEvidence(firstCookie);
  const purchaseBody = {
    catalog_item_id: catalog.get("coldwindflow-air-care-standard"),
    service_package_groups: [{ package_key: "coldwindflow-air-care-standard-small", btu: 12000, quantity: 5 }],
    customer_name: QA.customerName,
    customer_phone: QA.customerPhone,
    note: QA.marker,
    purchase_request_key: PURCHASE_KEY,
  };
  const created = await request("/public/prepaid-orders", {
    method: "POST", cookie: firstCookie, body: purchaseBody, expected: [201],
  });
  const orderCode = String(created.data?.order?.order_code || "");
  const entitlementCode = String(created.data?.entitlement_code || "");
  assert.match(orderCode, /^CWF/);
  assert.equal(Number(created.data?.order?.subtotal), 2198);
  assert.equal(created.data?.order?.status, "pending_payment");
  evidence("order_created", { order: orderCode, status: "pending_payment", price: 2198 });

  const prePayment = await pool.query(
    `SELECT o.status, o.payment_status,
            COUNT(e.entitlement_id)::int AS entitlement_count,
            COUNT(e.entitlement_id) FILTER (WHERE e.status='active')::int AS active_count
       FROM public.customer_orders o
       LEFT JOIN public.customer_service_entitlements e ON e.order_id=o.order_id
      WHERE o.order_code=$1 GROUP BY o.order_id`, [orderCode]
  );
  assert.equal(prePayment.rows[0].status, "pending_payment");
  assert.equal(Number(prePayment.rows[0].entitlement_count), 0);
  assert.equal(Number(prePayment.rows[0].active_count), 0);
  evidence("pre_payment", { order: orderCode, status: "pending_payment", active_entitlements: 0 });

  const reloadCookie = customerCookie(customerToken(1));
  const persistedOrders = await request("/public/prepaid-orders", { cookie: reloadCookie });
  assert.ok((persistedOrders.data?.items || []).some((row) => row.order_code === orderCode));
  evidence("customer_reload", { order: orderCode, persisted: true, reauthenticated: true });

  const adminOrders = await request("/admin/prepaid-orders", { cookie: adminCookie(adminSession) });
  const visible = (adminOrders.data?.orders || []).find((row) => row.order_code === orderCode);
  assert.ok(visible, "QA order is not visible to Admin");
  assert.equal(visible.customer_name, QA.customerName);
  assert.equal(visible.customer_phone, QA.customerPhone);
  assert.equal(Number(visible.subtotal), 2198);
  assert.equal(visible.payment_order_status, "pending_payment");
  const immutable = await pool.query(
    `SELECT service_entitlement_snapshot FROM public.customer_orders WHERE order_code=$1`, [orderCode]
  );
  const snapshot = immutable.rows[0].service_entitlement_snapshot;
  assert.deepEqual(snapshot.service_package_groups, [
    { package_key: "coldwindflow-air-care-standard-small", btu: 12000, quantity: 5 },
  ]);
  evidence("admin_visibility", { order: orderCode, customer: "redacted-QA", package: "standard", btu: 12000, quantity: 5, price: 2198, payment: "pending" });

  const confirmed = await request(`/admin/prepaid-orders/${encodeURIComponent(orderCode)}/confirm-payment`, {
    method: "POST", cookie: adminCookie(adminSession),
    body: { reference: PAYMENT_REFERENCE, confirmed_amount: 2198 },
  });
  assert.equal(confirmed.data?.replayed, false);
  assert.equal(confirmed.data?.entitlement?.status, "active");
  const confirmedAgain = await request(`/admin/prepaid-orders/${encodeURIComponent(orderCode)}/confirm-payment`, {
    method: "POST", cookie: adminCookie(adminSession),
    body: { reference: PAYMENT_REFERENCE, confirmed_amount: 2198 },
  });
  assert.equal(confirmedAgain.data?.replayed, true);
  const paid = await pool.query(
    `SELECT o.status, o.payment_status, o.payment_provider, o.payment_method,
            COUNT(e.entitlement_id)::int AS entitlement_count,
            MIN(e.status) AS entitlement_status
       FROM public.customer_orders o
       JOIN public.customer_service_entitlements e ON e.order_id=o.order_id
      WHERE o.order_code=$1 GROUP BY o.order_id`, [orderCode]
  );
  assert.equal(paid.rows[0].status, "paid");
  assert.equal(paid.rows[0].payment_status, "verified");
  assert.equal(paid.rows[0].payment_provider, "manual_admin");
  assert.equal(Number(paid.rows[0].entitlement_count), 1);
  assert.equal(paid.rows[0].entitlement_status, "active");
  evidence("manual_payment", { order: orderCode, payment: "verified", order_status: "paid", entitlement: "active", retry_replayed: true, entitlement_count: 1 });

  const begin = await request(`/public/service-rights/${encodeURIComponent(entitlementCode)}/begin-redemption`, {
    method: "POST", cookie: reloadCookie, body: {},
  });
  assert.equal(begin.data?.redemption?.entitlement_code, entitlementCode);
  // The customer scheduling bridge is proven through its authenticated begin
  // step. The existing Admin-assisted service then safely replaces that
  // short-lived preparation while scheduling the same paid right.
  evidence("customer_scheduling_path", { entitlement: entitlementCode, begin_redemption: true, calendar_contract: "available" });

  const appointmentDate = plusDays(10);
  const rescheduleDate = plusDays(11);
  const availability = await request(`/admin/availability_by_tech_v2?date=${appointmentDate}&tech_type=company&duration_min=${Number(snapshot.duration_min)}&include_paused=1`, {
    cookie: adminCookie(adminSession),
  });
  assert.match(JSON.stringify(availability.data), new RegExp(QA.technicianUsername));
  evidence("queue_selection", { date: appointmentDate, technician: QA.technicianUsername, isolated_qa_team: true });

  const bookingBody = {
    customer_name: QA.customerName,
    customer_phone: QA.customerPhone,
    appointment_datetime: `${appointmentDate}T09:00:00+07:00`,
    address_text: QA.customerAddress,
    customer_note: QA.marker,
    booking_mode: "scheduled",
    // A named technician is the existing Admin forced-assignment contract.
    // The jobs schema deliberately permits scheduled assignments as `forced`
    // (and urgent broadcasts as `offer`), never `normal`.
    dispatch_mode: "forced",
    tech_type: "company",
    assign_mode: "single",
    technician_username: QA.technicianUsername,
    allow_time_proposal: false,
    admin_request_key: ADMIN_REQUEST_KEY,
  };
  const booked = await request(`/admin/prepaid-entitlements/${encodeURIComponent(entitlementCode)}/book`, {
    method: "POST", cookie: adminCookie(adminSession), body: bookingBody,
  });
  const jobId = Number(booked.data?.job_id);
  const bookingCode = String(booked.data?.booking_code || "");
  assert.ok(jobId > 0);
  const job = await pool.query(
    `SELECT j.job_id, j.booking_code, j.prepaid_entitlement_id, j.payment_source,
            j.customer_due, j.payment_status, j.paid_at, j.job_price,
            e.entitlement_code, e.order_id, e.status AS entitlement_status,
            o.order_code, o.status AS order_status
       FROM public.jobs j
       JOIN public.customer_service_entitlements e ON e.entitlement_id=j.prepaid_entitlement_id
       JOIN public.customer_orders o ON o.order_id=e.order_id
      WHERE j.job_id=$1`, [jobId]
  );
  const linked = job.rows[0];
  assert.equal(linked.order_code, orderCode);
  assert.equal(linked.entitlement_code, entitlementCode);
  assert.equal(linked.payment_source, "prepaid_entitlement");
  assert.equal(Number(linked.customer_due), 0);
  assert.equal(linked.payment_status, "paid");
  assert.equal(linked.entitlement_status, "redeemed");
  evidence("job_created", { job: jobId, booking: bookingCode, order: orderCode, entitlement: entitlementCode, payment_source: "prepaid_entitlement", customer_due: 0 });

  const duplicate = await request(`/admin/prepaid-entitlements/${encodeURIComponent(entitlementCode)}/book`, {
    method: "POST", cookie: adminCookie(adminSession),
    body: { ...bookingBody, admin_request_key: `${ADMIN_REQUEST_KEY}_duplicate` },
    expected: [409],
  });
  assert.equal(duplicate.data?.code, "ENTITLEMENT_ALREADY_REDEEMED");
  const counts = await pool.query(
    `SELECT COUNT(*)::int AS jobs FROM public.jobs WHERE prepaid_entitlement_id=$1`, [linked.prepaid_entitlement_id]
  );
  assert.equal(Number(counts.rows[0].jobs), 1);
  evidence("duplicate_redemption", { response: 409, code: duplicate.data.code, jobs: 1 });

  await request(`/jobs/${jobId}/admin-edit`, {
    method: "PUT", cookie: adminCookie(adminSession),
    body: { appointment_datetime: `${rescheduleDate}T10:00:00+07:00` },
  });
  const rescheduled = await pool.query(
    `SELECT (appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date::text AS date,
            prepaid_entitlement_id, payment_source, customer_due
       FROM public.jobs WHERE job_id=$1`, [jobId]
  );
  assert.equal(rescheduled.rows[0].date, rescheduleDate);
  assert.equal(String(rescheduled.rows[0].prepaid_entitlement_id), String(linked.prepaid_entitlement_id));
  assert.equal(rescheduled.rows[0].payment_source, "prepaid_entitlement");
  assert.equal(Number(rescheduled.rows[0].customer_due), 0);
  evidence("reschedule", { job: jobId, date: rescheduleDate, entitlement_link: "preserved", customer_due: 0 });

  await request(`/jobs/${jobId}/admin-cancel`, {
    method: "POST", cookie: adminCookie(adminSession), body: { reason: QA.marker },
  });
  const cancelled = await pool.query(
    `SELECT j.canceled_at, j.prepaid_entitlement_id, e.status, e.redeemed_job_id,
            o.status AS order_status, o.payment_status
       FROM public.jobs j
       JOIN public.customer_service_entitlements e ON e.entitlement_id=j.prepaid_entitlement_id
       JOIN public.customer_orders o ON o.order_id=e.order_id
      WHERE j.job_id=$1`, [jobId]
  );
  assert.ok(cancelled.rows[0].canceled_at);
  assert.equal(cancelled.rows[0].status, "active");
  assert.equal(cancelled.rows[0].redeemed_job_id, null);
  assert.equal(cancelled.rows[0].order_status, "paid");
  assert.equal(cancelled.rows[0].payment_status, "verified");
  evidence("cancel_lifecycle", { job: jobId, job_cancelled: true, order: "paid", payment: "verified", entitlement: "active" });

  const persistedRights = await request("/public/service-rights", { cookie: customerCookie(customerToken(2)) });
  const right = (persistedRights.data?.items || []).find((row) => row.entitlement_code === entitlementCode);
  assert.equal(right?.status, "active");
  const persistedAdmin = await request("/admin/prepaid-orders", { cookie: adminCookie(adminSession) });
  const persistedOrder = (persistedAdmin.data?.orders || []).find((row) => row.order_code === orderCode);
  assert.equal(persistedOrder?.payment_order_status, "paid");
  assert.equal(persistedOrder?.payment_status, "verified");
  evidence("persistence", { order: orderCode, payment: "verified", entitlement: "active", job: jobId, reauthenticated: true });

  return { orderCode, entitlementCode, jobId, bookingCode };
}

async function main() {
  assertStagingOnly(CONTEXT);
  if (!new Set(["provision", "accept", "cleanup"]).has(ACTION)) throw new Error("unknown action");
  const provisioned = await provision();
  if (ACTION === "provision") return;
  if (ACTION === "cleanup") {
    await cleanup(provisioned.adminSession);
    return;
  }
  let passed = false;
  try {
    const result = await runAcceptance(provisioned.adminSession);
    evidence("acceptance_complete", { order: result.orderCode, entitlement: result.entitlementCode, job: result.jobId, result: "PASS" });
    passed = true;
  } finally {
    try { await cleanup(provisioned.adminSession); }
    catch (error) {
      console.error(`[QA_CLEANUP_FAILED] ${String(error.code || error.message || "unknown")}`);
      if (passed) throw error;
    }
  }
}

main()
  .then(async () => { await pool.end(); })
  .catch(async (error) => {
    console.error(`[QA_FAILED] ${String(error.code || error.message || "unknown")}`);
    try { await pool.end(); } catch (_) {}
    process.exitCode = 1;
  });
