"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPrepaidOrderService } = require("../server/services/prepaid/prepaidOrderServiceV2");

function fixture() {
  let stored = null;
  let quotes = 0;
  let inserts = 0;
  const db = {
    async query(sql, params = []) {
      if (sql.includes("to_regclass('public.customer_service_entitlements')")) {
        return { rows: [{ has_entitlements: true, has_orders: true, has_order_columns: true, has_job_columns: true }] };
      }
      if (sql.includes("prepaid_purchase_request_key=$1") && sql.includes("FOR UPDATE")) return { rows: stored ? [stored] : [] };
      if (sql.includes("INSERT INTO public.customer_orders")) {
        inserts += 1;
        stored = {
          order_id: 101, order_code: "CWF-TEST-101", customer_name: params[1], customer_phone: params[2],
          address: params[3], prepaid_maps_url: params[4], prepaid_gps_latitude: params[5],
          prepaid_gps_longitude: params[6], items: JSON.parse(params[7]), subtotal: params[8],
          status: "pending_payment", note: params[9], service_entitlement_snapshot: JSON.parse(params[11]),
          prepaid_entitlement_code: params[12], prepaid_redeem_until: params[14],
          prepaid_warranty_days: params[15], prepaid_purchase_fingerprint: params[17],
        };
        return { rows: [stored] };
      }
      if (sql.includes("SELECT order_id, order_kind, status FROM public.customer_orders")) {
        return { rows: stored ? [{ order_id: stored.order_id, order_kind: "service_prepaid", status: stored.status }] : [] };
      }
      if (sql.includes("UPDATE public.customer_orders SET customer_name=$2")) {
        Object.assign(stored, { customer_name: params[1], customer_phone: params[2], address: params[3],
          note: params[4], prepaid_maps_url: params[5], prepaid_gps_latitude: params[6], prepaid_gps_longitude: params[7] });
        return { rows: [stored] };
      }
      return { rows: [] };
    },
    async connect() { return { query: this.query.bind(this), release() {} }; },
  };
  const quote = {
    paymentMode: "prepaid_full", redeemUntil: "2027-01-01T00:00:00.000Z", warrantyDays: 60,
    fixedTotal: "2498.00", durationMin: 240, bundleId: "911", bundleKey: "coldwindflow-air-care-premium",
    payload: {
      service_package_groups: [
        { package_key: "premium-small", btu: 12000, quantity: 1 },
        { package_key: "premium-large", btu: 18000, quantity: 2 },
      ],
      services: [
        { job_type: "ล้าง", ac_type: "ผนัง", btu: 12000, machine_count: 1 },
        { job_type: "ล้าง", ac_type: "ผนัง", btu: 18000, machine_count: 2 },
      ],
    },
    items: [{ packageId: "1", tierId: "11", snapshot: { schema_version: 2 },
      qty: 1, unit_price: "699.00", line_total: "699.00" },
    { packageId: "2", tierId: "22", snapshot: { schema_version: 2 },
      qty: 2, unit_price: "899.50", line_total: "1799.00" }],
  };
  let resolverAvailable = true;
  const service = createPrepaidOrderService({ pool: db, resolverFactory: () => ({
    async resolveComposite() { quotes += 1; if (!resolverAvailable) throw Object.assign(new Error("expired"), { code: "SERVICE_PACKAGE_NOT_AVAILABLE", statusCode: 404 }); return quote; },
  }) });
  return { service, get stored() { return stored; }, get quotes() { return quotes; },
    get inserts() { return inserts; }, expire() { resolverAvailable = false; }, paid() { stored.status = "paid"; } };
}

const body = {
  catalog_item_id: 911,
  service_package_groups: [
    { package_key: "premium-small", btu: 12000, quantity: 1 },
    { package_key: "premium-large", btu: 18000, quantity: 2 },
  ],
  customer_name: "Customer", customer_phone: "0812345678",
  address_text: "123 Bangkok", maps_url: "https://www.google.com/maps?q=13.7563,100.5018",
  gps_latitude: 13.7563, gps_longitude: 100.5018,
  purchase_request_key: "premium_reservation_test_123456",
};

test("mixed Premium creates one pending order with address and pin, then replays without a new quote", async () => {
  const flow = fixture();
  const first = await flow.service.createOrder(body, { customerSub: "customer-test" });
  assert.equal(first.replayed, false);
  assert.equal(first.order.status, "pending_payment");
  assert.equal(first.order.subtotal, 2498);
  assert.equal(first.order.address, body.address_text);
  assert.equal(first.order.prepaid_maps_url, body.maps_url);
  assert.equal(first.order.prepaid_gps_latitude, body.gps_latitude);
  flow.expire();
  const replay = await flow.service.createOrder(body, { customerSub: "customer-test" });
  assert.equal(replay.replayed, true);
  assert.equal(replay.order.order_code, first.order.order_code);
  assert.equal(flow.inserts, 1);
  assert.equal(flow.quotes, 1);
  await assert.rejects(flow.service.createOrder({ ...body, address_text: "Changed" }, { customerSub: "customer-test" }),
    { code: "PURCHASE_REQUEST_KEY_REUSED" });
});

test("Admin edits only pending reservation context; paid order stays locked", async () => {
  const flow = fixture();
  await flow.service.createOrder(body, { customerSub: "customer-test" });
  const updated = await flow.service.updateReservation("CWF-TEST-101", { ...body, address_text: "Corrected Bangkok" });
  assert.equal(updated.address, "Corrected Bangkok");
  assert.equal(updated.subtotal, 2498);
  flow.paid();
  await assert.rejects(flow.service.updateReservation("CWF-TEST-101", body),
    { code: "PREPAID_RESERVATION_LOCKED" });
});
