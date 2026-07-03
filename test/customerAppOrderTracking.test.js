"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(REPO_ROOT, p), "utf8");

const trackingSrc = read("customer-app/modules/tracking.js");
const storeSrc = read("customer-app/modules/store.js");
const cssSrc = read("customer-app/assets/customer-app.css");

test("tracking routes CWF- order codes to an order lookup instead of the job tracker", () => {
  assert.match(trackingSrc, /\/\^CWF-\/i\.test\(q\)/);
  assert.match(trackingSrc, /function lookupOrder/);
  assert.match(trackingSrc, /root\.api\.getOrder\(code\)/);
});

test("the order result shows payment status, a fulfilment timeline and the admin note", () => {
  assert.match(trackingSrc, /ORDER_PAYMENT_COPY/);
  assert.match(trackingSrc, /ORDER_FULFILMENT_STEPS/);
  assert.match(trackingSrc, /order\.admin_note/);
  assert.match(trackingSrc, /function renderOrderResult/);
});

test("the tracking input invites an order code and its styles exist", () => {
  assert.match(trackingSrc, /เลขคำสั่งซื้อ/);
  assert.match(cssSrc, /\.order-steps/);
  assert.match(cssSrc, /\.order-admin-note/);
});

test("the purchase confirmation prefills tracking and offers a track-order action", () => {
  assert.match(storeSrc, /updateDraft\?\.\("tracking", \{ trackingCode: orderCode \}\)/);
  assert.match(storeSrc, /data-route="tracking"/);
  assert.match(storeSrc, /ติดตามคำสั่งซื้อ/);
});
