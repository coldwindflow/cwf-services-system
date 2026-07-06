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
const { normalizeAdminJobItemsForSave } = require("../server/adminJobItems");

test("existing saved item retains unit_price on initial load", () => {
  assert.match(source, /is_saved_row:\s*true/);
  assert.match(source, /unit_price:\s*Number\(it\.unit_price\|\|0\)\s*\|\|\s*0/);
  assert.match(source, /ใช้ราคาที่บันทึกไว้/);
});

test("open edit page and save immediately retains exact saved price", () => {
  assert.match(source, /!editorItems\[i\]\?\.is_saved_row/);
  assert.match(source, /item_name:\s*String\(it\.is_saved_row\s*\?\s*\(it\.item_name\|\|''\)/);
  assert.match(source, /price_overridden:\s*!!it\.price_overridden\s*\|\|\s*!!it\.is_saved_row/);
});

test("edit customer name retains price because saved rows are skipped during save-time repricing", () => {
  assert.match(source, /if \(editorItems\[i\]\?\.is_standard && !editorItems\[i\]\?\.is_saved_row && !editorItems\[i\]\?\.price_overridden\)/);
});

test("edit phone address appointment and zone retain price", () => {
  assert.doesNotMatch(source, /edit_customer_phone[\s\S]{0,300}updateEditItemPriceFromSelection/);
  assert.doesNotMatch(source, /edit_address[\s\S]{0,300}updateEditItemPriceFromSelection/);
  assert.doesNotMatch(source, /edit_appt[\s\S]{0,300}updateEditItemPriceFromSelection/);
  assert.doesNotMatch(source, /edit_zone[\s\S]{0,300}updateEditItemPriceFromSelection/);
});

test("edit team and primary technician retain price", () => {
  assert.match(source, /primarySel\.onchange = \(\)=>\{ renderTeamEditor\(getPrimaryTechFromUI\(primaryU\), curTeamUsers\); renderEditor\(\); \}/);
  assert.doesNotMatch(source, /primarySel\.onchange[\s\S]{0,160}updateEditItemPriceFromSelection/);
});

test("edit item technician assignment retains price", () => {
  assert.match(source, /assignee\.onchange = \(\)=>\{ editorItems\[idx\]\.assigned_technician_username/);
  assert.doesNotMatch(source, /assignee\.onchange[\s\S]{0,180}updateEditItemPriceFromSelection/);
});

test("change job type retains saved unit_price", () => {
  assert.match(source, /if \(!row\.is_saved_row\) \{\s*row\.price_overridden = false;\s*updateEditItemPriceFromSelection/);
  assert.match(source, /else \{\s*updatePriceStatusForRow\(idx\);\s*\}/);
});

test("change AC type retains saved unit_price", () => {
  assert.match(source, /if \(!row\.is_saved_row && !isPartsRepairRow\(row\)\)/);
});

test("change wash type retains saved unit_price", () => {
  assert.match(source, /if \(!row\.is_saved_row && !isPartsRepairRow\(row\)\)/);
});

test("change BTU retains saved unit_price", () => {
  assert.match(source, /if \(btuSel\) btuSel\.onchange = syncStandard/);
  assert.match(source, /if \(!row\.is_saved_row && !isPartsRepairRow\(row\)\)/);
});

test("change qty retains unit_price and recalculates line total", () => {
  assert.match(source, /if \(!row\.is_saved_row && !row\.price_overridden\) updateEditItemPriceFromSelection/);
  assert.match(source, /else updatePriceStatusForRow\(idx\)/);
  assert.match(source, /const line = Math\.max\(0, Number\(row\?\.qty \|\| 0\)\) \* Math\.max\(0, Number\(row\?\.unit_price \|\| 0\)\)/);
});

test("manually edit price, save, reload, price remains", () => {
  assert.match(source, /editorItems\[idx\]\.unit_price = Number\(unit\.value\|\|0\)/);
  assert.match(source, /editorItems\[idx\]\.price_overridden = true/);
});

test("saved price different from current Price Book remains unchanged", () => {
  assert.match(source, /if \(row\.is_saved_row && !opts\.explicitStandard\)/);
  assert.match(source, /return null/);
});

test("pricing preview failure does not overwrite saved price", () => {
  assert.match(source, /allowFallback:false/);
  assert.match(source, /Object\.assign\(row, before\)/);
  assert.match(source, /ราคาปัจจุบันยังไม่ถูกเปลี่ยน/);
});

test("clicking use standard price explicitly changes price", () => {
  assert.match(source, /explicitStandard:true/);
  assert.match(source, /used_standard_price = !!opts\.explicitStandard/);
  assert.match(source, /ใช้ราคามาตรฐาน/);
});

test("new item still receives automatic standard pricing", () => {
  assert.match(source, /is_saved_row:\s*false/);
  assert.match(source, /setTimeout\(\(\)=>updateEditItemPriceFromSelection\(idx, \{ force:true, rowId \}\), 0\)/);
});

test("delete row while pricing request is pending does not update another row", () => {
  assert.match(source, /const currentIdx = editorItems\.findIndex\(\(it\)=>it && it\.client_row_id === rowId\)/);
  assert.match(source, /if \(currentIdx < 0\) return null/);
  assert.match(source, /latest_pricing_request_id !== requestId/);
});

test("stale pricing response does not overwrite latest selection", () => {
  assert.match(source, /const requestPayloadKey = JSON\.stringify\(getEditStandardPayload\(row\)\)/);
  assert.match(source, /JSON\.stringify\(getEditStandardPayload\(currentRow\)\) !== requestPayloadKey/);
});

test("post-save verification detects unit_price mismatch", () => {
  assert.doesNotMatch(source, /!it\.price_overridden && Math\.abs\(Number\(saved\.unit_price/);
  assert.match(source, /field:\s*'unit_price'/);
  assert.match(source, /field:\s*'qty'/);
  assert.match(source, /field:\s*'line_total'/);
  assert.match(source, /field:\s*'assigned_technician_username'/);
});

test("HTML references the new JS cache version", () => {
  assert.match(html, /admin-job-view-v2\.js\?v=20260706_saved_price_stability/);
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
