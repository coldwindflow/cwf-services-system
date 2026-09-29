"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const seed = fs.readFileSync("data-seeds/20260930_cwf_air_care.sql", "utf8");
const operator = fs.readFileSync("scripts/apply-cwf-air-care-seed.sh", "utf8");
const prepaidUi = fs.readFileSync("customer-app/modules/prepaid.js", "utf8");
const publicRoutes = fs.readFileSync("server/routes/public/customerPrepaid.js", "utf8");
const service = fs.readFileSync("server/services/prepaid/prepaidOrderServiceV2.js", "utf8");

test("CWF AIR CARE campaign has exact sale prices and manual-payment policy", () => {
  assert.match(seed, /cwf-air-care/);
  assert.match(seed, /2026-09-30T00:00:00\+07:00/);
  assert.match(seed, /2026-10-06T23:59:59\.999\+07:00/);
  assert.match(seed, /499\.00/);
  assert.match(seed, /899\.00/);
  assert.match(seed, /1299\.00/);
  assert.match(seed, /1699\.00/);
  assert.match(seed, /100\.00/);
  assert.match(seed, /'prepaid_full',60/);
  assert.match(seed, /'contact_admin'/);
  assert.doesNotMatch(seed, /booking_mode[^\n]*service_package/);
});

test("customer reservation does not enter in-app payment after order creation", () => {
  assert.match(prepaidUi, /renderReservation\(created\.order/);
  assert.match(prepaidUi, /ติดต่อ LINE @cwfair เพื่อชำระ/);
  assert.match(prepaidUi, /\/public\/prepaid-orders/);
  assert.doesNotMatch(prepaidUi, /renderPayment\(created\.order/);
});

test("customer can recover pending reservations and paid rights after reopening", () => {
  assert.match(publicRoutes, /router\.get\("\/public\/prepaid-orders"/);
  assert.match(service, /async function listOrders\(customerSub\)/);
  assert.match(prepaidUi, /Promise\.all\(\[/);
  assert.match(prepaidUi, /รอยืนยันการชำระ/);
  assert.match(prepaidUi, /ชำระแล้ว · รอเลือกวัน/);
});

test("AIR CARE entitlement expires 60 days from reservation creation", () => {
  assert.match(service, /bundleKey \|\| ""\) === "cwf-air-care"/);
  assert.match(service, /60 \* 24 \* 60 \* 60 \* 1000/);
});

test("public prepaid policy follows virtual service-package bundle architecture", () => {
  assert.match(publicRoutes, /service_bundle_key/);
  assert.match(publicRoutes, /Boolean\(clean\(row\.service_bundle_key\)\)/);
  assert.doesNotMatch(publicRoutes, /row\.booking_mode === "service_package"/);
});

test("guarded operator verifies campaign shape without changing schema", () => {
  assert.match(operator, /EXPECTED_RELEASE_SHA/);
  assert.match(operator, /cwf-deployctl/);
  assert.match(operator, /parents=1 variants=2 tiers=8/);
  assert.match(operator, /manual_payment=admin_verified/);
});
