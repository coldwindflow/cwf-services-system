"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (file) => fs.readFileSync(file, "utf8");

test("normal booking page contains the prepaid operations inbox and direct payment action", () => {
  const page = read("admin-review-v2.html");
  const code = read("admin-prepaid-queue.js");
  assert.match(page, /id="prepaidPendingCount"/);
  assert.match(page, /id="prepaidReadyCount"/);
  assert.match(page, /id="prepaidTodayJobsCount"/);
  assert.match(page, /id="prepaidQueueSearch"/);
  for (const filter of ["all", "pending", "paid", "jobs"]) {
    assert.match(page, new RegExp(`data-prepaid-filter="${filter}"`));
  }
  assert.match(code, /\/admin\/prepaid-orders/);
  assert.match(code, /\/admin\/jobs_v2/);
  assert.match(code, /data-prepaid-confirm/);
  assert.match(code, /data-prepaid-cancel/);
  assert.match(code, /\/confirm-payment/);
  assert.match(code, /ลงงานจากสิทธิ์/);
  assert.match(code, /data-prepaid-ops-form/);
  assert.doesNotMatch(code, /window\.(prompt|confirm)\(/);
});

test("prepaid detail uses a payment dialog rather than native browser prompts", () => {
  const page = read("admin-prepaid-v2.html");
  const code = read("admin-prepaid-v2.js");
  assert.match(page, /id="paymentConfirmDialog"/);
  assert.match(page, /id="paymentConfirmReference"/);
  assert.match(page, /id="cancelOrderDialog"/);
  assert.match(page, /id="showCancelledOrders"/);
  assert.match(code, /submitPaymentConfirmation/);
  assert.match(code, /submitCancelOrder/);
  assert.doesNotMatch(code, /window\.(prompt|confirm)\(/);
});

test("admin-assisted promotion uses server quote, two metadata-derived BTU groups, and returns to booking operations", () => {
  const page = read("admin-add-v2.html");
  const code = read("admin-prepaid-assist.js");
  assert.match(page, /id="promotionAssistPanel"/);
  assert.match(code, /groupedBtu/);
  assert.match(code, /data-promo-btu type="hidden"/);
  assert.match(code, /\/admin\/prepaid-orders\/quote/);
  assert.match(code, /\/admin-review-v2\.html\?order=/);
  assert.doesNotMatch(code, /window\.(prompt|confirm)\(/);
});

test("customer prepaid flow has one manual payment path and a persistent service hub", () => {
  const page = read("customer-app/index.html");
  const prepaid = read("customer-app/modules/prepaid.js");
  const tracking = read("customer-app/modules/tracking.js");
  assert.match(page, /data-route="tracking"[\s\S]*?data-nav-label>บริการของฉัน/);
  assert.match(tracking, /renderServiceHub/);
  assert.match(prepaid, /\/public\/prepaid-orders/);
  assert.match(prepaid, /\/public\/service-rights/);
  assert.match(prepaid, /\/public\/register/);
  assert.match(prepaid, /\/public\/prepaid-orders\/\$\{encodeURIComponent\(orderCode\)\}\/cancel/);
  assert.match(prepaid, /ยังไม่มีการตัดเงินในขั้นตอนนี้/);
  assert.doesNotMatch(prepaid, /payOrder\(|cdn\.omise\.co|data-card-submit|method: "promptpay"/);
  assert.doesNotMatch(prepaid, /data-cwf-rights-pill[^\n]*appendChild/);
});
