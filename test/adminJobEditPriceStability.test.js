"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const jsPath = path.join(root, "admin-job-view-v2.js");
const htmlPath = path.join(root, "admin-job-view-v2.html");
const source = fs.readFileSync(jsPath, "utf8");
const html = fs.readFileSync(htmlPath, "utf8");
const priceState = require("../admin-job-edit-price-state");
const { normalizeAdminJobItemsForSave } = require("../server/adminJobItems");

function savePayloadFromRow(row) {
  return {
    item_id: row.item_id ? Number(row.item_id) : null,
    item_name: String(row.is_saved_row ? (row.item_name || "") : (row.item_name || "")).trim(),
    qty: Number(row.qty || 0),
    unit_price: Number(row.unit_price || 0),
    line_total: Number(row.qty || 0) * Number(row.unit_price || 0),
    assigned_technician_username: String(row.assigned_technician_username || "").trim() || null,
    is_service: true,
    price_overridden: !!row.price_overridden || !!row.is_saved_row,
  };
}

test("saved legacy row initializes with exact DB qty and unit_price", () => {
  const row = priceState.makeSavedRow({
    item_id: 7,
    item_name: "ล้างแอร์ผนัง • ล้างธรรมดา • 12000 BTU • 5 เครื่อง",
    qty: 1,
    unit_price: 2500,
  }, "row-1");
  assert.equal(row.is_saved_row, true);
  assert.equal(row.qty, 1);
  assert.equal(row.unit_price, 2500);
  assert.equal(row.item_name, "ล้างแอร์ผนัง • ล้างธรรมดา • 12000 BTU • 5 เครื่อง");
});

test("immediate save payload preserves exact saved legacy qty and price", () => {
  const row = priceState.makeSavedRow({
    item_name: "ล้างแอร์ผนัง • ล้างธรรมดา • 12000 BTU • 5 เครื่อง",
    qty: 1,
    unit_price: 2500,
  }, "row-1");
  const payload = savePayloadFromRow(row);
  assert.equal(payload.qty, 1);
  assert.equal(payload.unit_price, 2500);
  assert.equal(payload.line_total, 2500);
  assert.equal(payload.price_overridden, true);
});

test("explicit legacy normalize action may convert qty=1 total price into per-machine price", () => {
  const row = priceState.makeSavedRow({
    item_name: "ล้างแอร์ผนัง • ล้างธรรมดา • 12000 BTU • 5 เครื่อง",
    qty: 1,
    unit_price: 2500,
  }, "row-1");
  const normalized = priceState.normalizeLegacyServiceRow(row);
  assert.equal(normalized.qty, 5);
  assert.equal(normalized.unit_price, 500);
  assert.equal(row.qty, 1, "normalizer returns a clone and does not mutate until explicit action applies it");
});

test("opening and reloading without explicit normalize never converts saved legacy rows", () => {
  assert.match(source, /r\.items\.map\(x=>Object\.assign\(\{\}, x\)\)/);
  assert.doesNotMatch(source, /\)\)\.map\(normalizeLegacyServiceRow\)\.map\(row =>/);
});

test("manual price input invalidates pending standard-price requests", () => {
  const row = { client_row_id: "row-1", pricing_generation: 0, unit_price: 550, latest_pricing_request_id: null };
  const token = priceState.beginPricingRequest(row, 1, "payload-a");
  priceState.markManualPrice(row, 777);
  assert.equal(row.unit_price, 777);
  assert.equal(row.price_overridden, true);
  assert.equal(row.used_standard_price, false);
  assert.equal(priceState.canApplyPricingResponse(row, token, "payload-a"), false);
});

test("old standard-price response cannot overwrite a newer manual value or save payload", () => {
  const row = { client_row_id: "row-1", pricing_generation: 0, qty: 2, unit_price: 550, latest_pricing_request_id: null };
  const token = priceState.beginPricingRequest(row, 1, "payload-a");
  priceState.markManualPrice(row, 1234);
  if (priceState.canApplyPricingResponse(row, token, "payload-a")) row.unit_price = 500;
  assert.equal(row.unit_price, 1234);
  assert.equal(savePayloadFromRow(row).unit_price, 1234);
});

test("row deletion makes pending pricing response a no-op", () => {
  const row = { client_row_id: "row-1", pricing_generation: 0, latest_pricing_request_id: null };
  const token = priceState.beginPricingRequest(row, 1, "payload-a");
  const rows = [];
  const current = rows.find((it) => it.client_row_id === token.rowId);
  assert.equal(priceState.canApplyPricingResponse(current, token, "payload-a"), false);
});

test("row reorder still applies only to the matching client row id", () => {
  const rowA = { client_row_id: "row-a", pricing_generation: 0, latest_pricing_request_id: null };
  const rowB = { client_row_id: "row-b", pricing_generation: 0, latest_pricing_request_id: null };
  const token = priceState.beginPricingRequest(rowA, 1, "payload-a");
  const rows = [rowB, rowA];
  const current = rows.find((it) => it.client_row_id === token.rowId);
  assert.equal(current, rowA);
  assert.equal(priceState.canApplyPricingResponse(current, token, "payload-a"), true);
  assert.equal(priceState.canApplyPricingResponse(rowB, token, "payload-a"), false);
});

test("stale pricing response is rejected when selection payload changes", () => {
  const row = { client_row_id: "row-1", pricing_generation: 0, latest_pricing_request_id: null };
  const token = priceState.beginPricingRequest(row, 1, "payload-old");
  assert.equal(priceState.canApplyPricingResponse(row, token, "payload-new"), false);
});

test("a newer request supersedes an older request on the same row", () => {
  const row = { client_row_id: "row-1", pricing_generation: 0, latest_pricing_request_id: null };
  const oldToken = priceState.beginPricingRequest(row, 1, "payload-a");
  const newToken = priceState.beginPricingRequest(row, 2, "payload-a");
  assert.equal(priceState.canApplyPricingResponse(row, oldToken, "payload-a"), false);
  assert.equal(priceState.canApplyPricingResponse(row, newToken, "payload-a"), true);
});

test("current pricing failure clears only request metadata", () => {
  const row = {
    client_row_id: "row-1",
    is_saved_row: true,
    item_name: "ซ่อมแอร์ผนัง • ซ่อมเปลี่ยนอะไหล่ • เปลี่ยนแคป • 12000 BTU • 1 เครื่อง",
    job_type_key: "repair",
    job_type: "ซ่อม",
    ac_type_key: "wall",
    wash_type_key: "normal",
    repair_type_key: "parts",
    repair_detail: "เปลี่ยนแคป",
    btu_tier: "small",
    qty: 1,
    unit_price: 1800,
    price_overridden: true,
    used_standard_price: false,
    duration_min: 0,
    pricing_payload: { before: true },
    auto_unit_price: 0,
    auto_line_total: 0,
    pricing_generation: 0,
    latest_pricing_request_id: null,
  };
  const token = priceState.beginPricingRequest(row, 1, "payload-standard");
  const expected = priceState.snapshotRow(row);
  expected.latest_pricing_request_id = null;
  assert.equal(priceState.finishPricingRequestFailure(row, token), true);
  assert.deepEqual(priceState.snapshotRow(row), expected);
});

test("failed stale pricing request after manual price edit does not restore old price", () => {
  const row = { client_row_id: "row-1", pricing_generation: 0, unit_price: 550, latest_pricing_request_id: null };
  const token = priceState.beginPricingRequest(row, 1, "payload-a");
  priceState.markManualPrice(row, 777);
  assert.equal(priceState.finishPricingRequestFailure(row, token), false);
  assert.equal(row.unit_price, 777);
  assert.equal(row.price_overridden, true);
});

test("failed older pricing request cannot overwrite newer successful pricing result", () => {
  const row = { client_row_id: "row-1", pricing_generation: 0, unit_price: 550, latest_pricing_request_id: null };
  const tokenA = priceState.beginPricingRequest(row, 1, "payload-a");
  const tokenB = priceState.beginPricingRequest(row, 2, "payload-b");
  if (priceState.canApplyPricingResponse(row, tokenB, "payload-b")) {
    row.unit_price = 900;
    row.used_standard_price = true;
    row.price_overridden = false;
  }
  assert.equal(priceState.finishPricingRequestFailure(row, tokenA), false);
  assert.equal(row.unit_price, 900);
  assert.equal(row.used_standard_price, true);
  assert.equal(row.price_overridden, false);
});

test("global job type mutation invalidates pending pricing responses before old result returns", () => {
  const row = {
    client_row_id: "row-1",
    pricing_generation: 0,
    latest_pricing_request_id: null,
    job_type_key: "wash",
    item_name: "wash old",
    unit_price: 550,
  };
  const token = priceState.beginPricingRequest(row, 1, "payload-wash");
  priceState.invalidatePricingRequests(row);
  row.job_type_key = "repair";
  row.item_name = "repair new";
  if (priceState.canApplyPricingResponse(row, token, "payload-wash")) row.item_name = "stale old";
  assert.equal(priceState.finishPricingRequestFailure(row, token), false);
  assert.equal(row.job_type_key, "repair");
  assert.equal(row.item_name, "repair new");
});

test("converting a row invalidates pending pricing responses before old result returns", () => {
  const row = {
    client_row_id: "row-1",
    pricing_generation: 0,
    latest_pricing_request_id: null,
    is_standard: false,
    item_name: "custom legacy",
    unit_price: 500,
  };
  const token = priceState.beginPricingRequest(row, 1, "payload-custom");
  priceState.invalidatePricingRequests(row);
  Object.assign(row, { is_standard: true, job_type_key: "wash", item_name: "converted standard" });
  if (priceState.canApplyPricingResponse(row, token, "payload-custom")) row.item_name = "stale custom";
  assert.equal(priceState.finishPricingRequestFailure(row, token), false);
  assert.equal(row.is_standard, true);
  assert.equal(row.job_type_key, "wash");
  assert.equal(row.item_name, "converted standard");
});

test("custom item name edit invalidates pending pricing responses before old result returns", () => {
  const row = {
    client_row_id: "row-1",
    pricing_generation: 0,
    latest_pricing_request_id: null,
    is_standard: false,
    item_name: "old custom",
    unit_price: 500,
  };
  const token = priceState.beginPricingRequest(row, 1, "payload-custom");
  priceState.invalidatePricingRequests(row);
  row.item_name = "new custom";
  if (priceState.canApplyPricingResponse(row, token, "payload-custom")) row.item_name = "stale custom";
  assert.equal(priceState.finishPricingRequestFailure(row, token), false);
  assert.equal(row.item_name, "new custom");
});

test("legacy restore helper remains available for explicit snapshots", () => {
  const row = { client_row_id: "row-1", unit_price: 1 };
  const before = priceState.snapshotRow(row);
  const candidate = priceState.snapshotRow(row);
  candidate.repair_type_key = "standard";
  candidate.repair_detail = "";
  candidate.item_name = "ซ่อมแอร์ผนัง • ตรวจเช็ค/ซ่อมทั่วไป • 12000 BTU • 1 เครื่อง";
  priceState.beginPricingRequest(row, 1, "payload-standard");
  priceState.restoreRow(row, before);
  assert.deepEqual(priceState.snapshotRow(row), before);
});

test("successful explicit standard pricing can apply candidate state after token validation", () => {
  const row = { client_row_id: "row-1", pricing_generation: 0, latest_pricing_request_id: null, qty: 2, unit_price: 550, price_overridden: true };
  const candidate = priceState.snapshotRow(row);
  const token = priceState.beginPricingRequest(row, 1, "payload-standard");
  assert.equal(priceState.canApplyPricingResponse(row, token, "payload-standard"), true);
  candidate.unit_price = 600;
  candidate.price_overridden = false;
  candidate.used_standard_price = true;
  candidate.latest_pricing_request_id = row.latest_pricing_request_id;
  candidate.pricing_generation = row.pricing_generation;
  Object.assign(row, candidate);
  assert.equal(row.unit_price, 600);
  assert.equal(row.used_standard_price, true);
});

test("new row automatic pricing remains possible with request token validation", () => {
  const row = { client_row_id: "new-1", is_saved_row: false, pricing_generation: 0, latest_pricing_request_id: null };
  const token = priceState.beginPricingRequest(row, 1, "new-payload");
  assert.equal(priceState.canApplyPricingResponse(row, token, "new-payload"), true);
});

test("saved row non-price edits keep price because save-time repricing excludes saved rows", () => {
  assert.match(source, /editorItems\[i\]\?\.is_standard && !editorItems\[i\]\?\.is_saved_row && !editorItems\[i\]\?\.price_overridden/);
});

test("qty changes keep saved unit price and update line totals through existing row state", () => {
  const row = priceState.makeSavedRow({ item_name: "ล้างแอร์ผนัง", qty: 2, unit_price: 550 }, "row-1");
  row.qty = 3;
  assert.equal(savePayloadFromRow(row).line_total, 1650);
  assert.equal(row.unit_price, 550);
});

test("manual price edits use the shared helper in production code", () => {
  assert.match(source, /priceState\.markManualPrice\(editorItems\[idx\], unit\.value\)/);
});

test("explicit standard pricing uses candidate state and no fallback", () => {
  assert.match(source, /const candidate = priceState\.snapshotRow\(row\)/);
  assert.match(source, /getEditPricingPreview\(candidate, \{ allowFallback:false \}\)/);
  assert.match(source, /Object\.assign\(currentRow, candidate\)/);
});

test("pricing preview failure only finishes the current request metadata", () => {
  assert.doesNotMatch(source, /const before = priceState\.snapshotRow\(row\)/);
  assert.doesNotMatch(source, /priceState\.restoreRow\(row, before\)/);
  assert.match(source, /priceState\.finishPricingRequestFailure\(currentRow, pricingToken\)/);
});

test("pricing-relevant UI mutations invalidate pending pricing requests before applying live changes", () => {
  assert.match(source, /if \(convert\) convert\.onclick = \(\) => \{[\s\S]*?priceState\.invalidatePricingRequests\(row\);[\s\S]*?Object\.assign\(row, parsed\);/);
  assert.match(source, /if \(name\) name\.oninput = \(\)=>\{[\s\S]*?priceState\.invalidatePricingRequests\(row\);[\s\S]*?row\.item_name = name\.value;/);
  assert.match(source, /editJobTypeEl\.onchange = \(\) => \{[\s\S]*?if \(row\?\.is_standard\) \{[\s\S]*?priceState\.invalidatePricingRequests\(row\);[\s\S]*?row\.job_type_key = normalizeEditJobTypeKey/);
});

test("post-save verification detects unit_price, qty, line_total, and assignee mismatches", () => {
  assert.doesNotMatch(source, /!it\.price_overridden && Math\.abs\(Number\(saved\.unit_price/);
  assert.match(source, /field:\s*'unit_price'/);
  assert.match(source, /field:\s*'qty'/);
  assert.match(source, /field:\s*'line_total'/);
  assert.match(source, /field:\s*'assigned_technician_username'/);
});

test("HTML loads the shared helper and references the new JS cache version", () => {
  assert.match(html, /admin-job-edit-price-state\.js\?v=20260707_price_state_v2/);
  assert.match(html, /admin-job-view-v2\.js\?v=20260707_saved_price_stability_review_fix2/);
});

test("backend helper preserves submitted saved prices when frontend marks the row overridden", () => {
  const [row] = normalizeAdminJobItemsForSave([
    {
      item_name: "ล้างแอร์ผนัง • ล้างธรรมดา • 12000 BTU • 1 เครื่อง",
      qty: 1,
      unit_price: 550,
      is_service: true,
      price_overridden: true,
    },
  ]);
  assert.equal(row.unit_price, 550);
});

test("backend helper preserves saved zero price when frontend marks the row overridden", () => {
  const [row] = normalizeAdminJobItemsForSave([
    {
      item_name: "ล้างแอร์ผนัง • ล้างธรรมดา • 12000 BTU • 1 เครื่อง",
      qty: 1,
      unit_price: 0,
      is_service: true,
      price_overridden: true,
    },
  ]);
  assert.equal(row.unit_price, 0);
});
