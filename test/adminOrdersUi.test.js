"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(REPO_ROOT, p), "utf8");

const htmlSrc = read("admin-orders.html");
const jsSrc = read("admin-orders.js");
const cssSrc = read("admin-orders.css");
const commonSrc = read("admin-v2-common.js");

test("the shared admin menu links to the orders dashboard exactly once", () => {
  const matches = commonSrc.match(/data-href="\/admin-orders\.html"/g) || [];
  assert.equal(matches.length, 1);
  assert.match(commonSrc, /data-href="\/admin-orders\.html">[^<]*คำสั่งซื้อ/);
});

test("admin-orders.html loads the shared menu, its own script and stylesheet with a consistent cache-bust", () => {
  assert.match(htmlSrc, /<script src="\/admin-v2-common\.js\?v=[^"]+"><\/script>/);
  assert.match(htmlSrc, /admin-orders\.js\?v=20260703_lifecycle_v1/);
  assert.match(htmlSrc, /admin-orders\.css\?v=20260703_lifecycle_v1/);
});

test("the page has a summary strip, search, status + method filters and a list container", () => {
  assert.match(htmlSrc, /data-sum-total/);
  assert.match(htmlSrc, /data-sum-paid/);
  assert.match(htmlSrc, /data-sum-revenue/);
  assert.match(htmlSrc, /id="orders_search"/);
  assert.match(htmlSrc, /id="orders_filter_status"/);
  assert.match(htmlSrc, /id="orders_filter_method"/);
  assert.match(htmlSrc, /id="orders_list"/);
});

test("the dashboard reads the real /admin/orders endpoint and only mutates via the status endpoint", () => {
  assert.match(jsSrc, /apiFetch\("\/admin\/orders"\)/);
  // The only write is the fulfilment status update — no other mutating calls.
  const posts = jsSrc.match(/\/admin\/orders\/[^`"]*/g) || [];
  assert.ok(posts.some((p) => p.includes("/status")));
  assert.doesNotMatch(jsSrc, /method:\s*"(PATCH|DELETE|PUT)"/);
});

test("orders are rendered with a status badge and payment method, and money/dates are formatted", () => {
  assert.match(jsSrc, /STATUS_META/);
  assert.match(jsSrc, /ao-badge-paid/);
  assert.match(jsSrc, /ao-badge-processing/);
  assert.match(jsSrc, /ao-badge-failed/);
  assert.match(jsSrc, /payment_method/);
  assert.match(jsSrc, /toLocaleString\("th-TH"/);
});

test("client-side search + status + method filters are wired to re-render the list", () => {
  assert.match(jsSrc, /orders_search[\s\S]*?filterState\.search/);
  assert.match(jsSrc, /orders_filter_status[\s\S]*?filterState\.status/);
  assert.match(jsSrc, /orders_filter_method[\s\S]*?filterState\.method/);
  assert.match(jsSrc, /function applyFilters/);
});

test("the dashboard shows a friendly message when the orders schema is not ready", () => {
  assert.match(jsSrc, /schema_ready === false/);
  assert.match(jsSrc, /ordersSchemaReady/);
});

test("badge and summary styles exist in the stylesheet", () => {
  assert.match(cssSrc, /\.ao-badge-paid/);
  assert.match(cssSrc, /\.ao-summary/);
  assert.match(cssSrc, /\.ao-card/);
});

test("admin can advance an order's fulfilment status and save a customer note", () => {
  assert.match(jsSrc, /FULFILLMENT_OPTIONS/);
  // Offers the lifecycle stages that mirror the backend allow-list.
  for (const s of ["confirmed", "preparing", "shipped", "installing", "completed", "cancelled"]) {
    assert.match(jsSrc, new RegExp(`value: "${s}"`));
  }
  assert.match(jsSrc, /data-fulfil-save/);
  assert.match(jsSrc, /data-fulfil-note/);
  // Posts to the real status endpoint.
  assert.match(jsSrc, /\/admin\/orders\/\$\{encodeURIComponent\(code\)\}\/status/);
  assert.match(jsSrc, /method:\s*"POST"/);
  assert.match(cssSrc, /\.ao-fulfil/);
});
