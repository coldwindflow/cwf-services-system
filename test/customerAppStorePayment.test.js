"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(REPO_ROOT, p), "utf8");

const storeSrc = read("customer-app/modules/store.js");
const apiSrc = read("customer-app/modules/api.js");
const cssSrc = read("customer-app/assets/customer-app.css");

test("api module exposes getPaymentConfig and payOrder against the public endpoints", () => {
  assert.match(apiSrc, /getPaymentConfig\(\)\s*\{[\s\S]*?\/public\/payment-config/);
  assert.match(apiSrc, /payOrder\(code, payload\)\s*\{[\s\S]*?\/public\/orders\/\$\{encodeURIComponent\(code\)\}\/pay/);
});

test("store renders a payment step offering PromptPay and card after the order is created", () => {
  assert.match(storeSrc, /paymentStepHtml/);
  assert.match(storeSrc, /data-pay-method="promptpay"/);
  assert.match(storeSrc, /data-pay-method="card"/);
  assert.match(storeSrc, /config\.methods/);
  // The order is created first, then the payment step is shown.
  assert.match(storeSrc, /renderPaymentStep\(\{ order/);
});

test("store loads Omise.js lazily and tokenizes the card in the browser (card data never posted to us)", () => {
  assert.match(storeSrc, /cdn\.omise\.co\/omise\.js/);
  assert.match(storeSrc, /Omise\.createToken\("card"/);
  // We only ever send the one-time token to our own endpoint, never raw PAN.
  assert.match(storeSrc, /payOrder\(o\.order\.order_code, \{ method: "card", token \}\)/);
  assert.doesNotMatch(storeSrc, /createOrder\([^)]*number/);
});

test("store shows the PromptPay QR and polls the order status until it resolves", () => {
  assert.match(storeSrc, /payOrder\(o\.order\.order_code, \{ method: "promptpay" \}\)/);
  assert.match(storeSrc, /pay-qr-img/);
  assert.match(storeSrc, /startPolling\(o\.order\.order_code/);
  assert.match(storeSrc, /processingPaymentHtml/);
  // Polling stops on a terminal status.
  assert.match(storeSrc, /status === "paid" \|\| status === "payment_failed"/);
});

test("store sends only item_id and qty for order items and guards duplicate payment clicks", () => {
  assert.match(storeSrc, /items: \[\{ item_id: item\.item_id, qty \}\]/);
  assert.doesNotMatch(storeSrc, /items: \[\{ item_id: item\.item_id, name:/);
  assert.doesNotMatch(storeSrc, /unit_price: unitPrice/);
  assert.match(storeSrc, /paymentInFlight/);
});

test("store falls back to the LINE hand-off when payment is unconfigured or the order did not save", () => {
  assert.match(storeSrc, /config && config\.enabled/);
  assert.match(storeSrc, /purchaseConfirmHtml\(item, \{ qty, delivery, install, name, phone, orderCode/);
});

test("payment step styles exist and the Customer App payment build id is bumped", () => {
  assert.match(cssSrc, /\.pay-method-btn/);
  assert.match(cssSrc, /\.pay-qr-img/);
  assert.match(read("customer-app/index.html"), /modules\/store\.js\?v=20260716_customer_history_production_ready_v1/);
  assert.match(read("customer-app/sw.js"), /BUILD_ID = "20260716_customer_history_production_ready_v1"/);
  assert.match(storeSrc, /payment-security 20260705 loaded/);
});
