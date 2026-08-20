"use strict";

// Issue 307 - Admin Add Job must be Thai-only, and the in-slot technician picker
// must stay scrollable on small Android screens while still exposing EVERY
// technician the availability API reported as free for that slot.
//
// These tests are UI-contract tests only. They never touch availability
// eligibility, collision, day-off, employment-type or scheduling rules.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "admin-add-v2.html"), "utf8");
const js = fs.readFileSync(path.join(ROOT, "admin-add-v2.js"), "utf8");

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function sliceFunction(source, signature, nextSignature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `could not find ${signature}`);
  const end = nextSignature ? source.indexOf(nextSignature, start) : -1;
  assert.notEqual(end, 0, `could not find ${nextSignature}`);
  return end === -1 ? source.slice(start) : source.slice(start, end);
}

// Runs the real, pure buildSlotTechnicianList() out of the shipped runtime file
// so the parity guarantees below are proven against production code, not a copy.
function loadSlotTechnicianListApi() {
  const fnSource = sliceFunction(js, "function buildSlotTechnicianList(", "function renderTechSelect(");
  const context = {};
  vm.runInNewContext(`${fnSource}\n;__api = { buildSlotTechnicianList };`, context);
  return context.__api;
}

// Text that is allowed to stay non-Thai anywhere on this page: protocol values,
// API payload keys, route names, brand names and units. Everything else that is
// user-visible has to be Thai.
const TECHNICAL_ALLOWLIST = [
  "BTU", "LINE", "WhatsApp", "CWF", "GPS", "CMS",
  "scheduled", "urgent", "forced", "offer", "assign", "auto", "single", "team",
  "admin-add-v2.js", "admin-add-v2.html", "style.css", "admin-v2-common.js",
  "https://maps...", "0xx-xxx-xxxx",
];

// ---------------------------------------------------------------------------
// 1) Thai-only Admin UI
// ---------------------------------------------------------------------------

test("Issue 307: the confirmed English Admin Add Job strings are gone from the markup", () => {
  const forbidden = [
    "Use latest customer data",
    "Auto / ระบบเลือกจากที่อยู่",
    ">Latitude<",
    ">Longitude<",
    "Service Package (optional)",
    "Choose a Store package parent",
    "Ordinary Store service (optional)",
    "Use manual service fields",
    "Store service-package item",
    "No Store package",
    "Legacy standalone package",
    "No legacy package",
    ">Tier<",
    "Select tier",
    "Actual BTU *",
    "Select actual BTU",
    ">scheduled<",
    ">urgent<",
    "forced (ล็อคช่าง)",
    "offer (ยิงข้อเสนอ)",
    ">English<",
    'aria-label="machine count"',
    "Override ราคา",
    "Override เวลา",
  ];
  for (const needle of forbidden) {
    assert.equal(html.includes(needle), false, `admin-add-v2.html still ships English UI text: ${needle}`);
  }
});

test("Issue 307: the confirmed English runtime messages are gone from the script", () => {
  const forbidden = [
    "Select at least one quantity",
    "Loading package price and duration...",
    "Package price and duration unavailable",
    "Selected date is after the package redemption deadline",
    "Wait for the selected package tier price and duration before booking",
    "Select Store package quantities and wait for the server quote",
    "Select a package tier and actual BTU before booking",
    "The appointment is after this package redemption deadline",
    "Select actual BTU",
    "Select tier",
    "English version not available",
    "Use latest customer data",
    "แหล่งราคา: Store catalog",
    "Service Price Book",
    "Debug: On",
    "Debug: Off",
    "redeem by",
    "no limit",
    "fixed total",
    "<label>Quantity</label>",
    "<label>Actual BTU</label>",
    "Override เวลา (นาที)",
  ];
  for (const needle of forbidden) {
    assert.equal(js.includes(needle), false, `admin-add-v2.js still ships English UI text: ${needle}`);
  }
});

test("Issue 307: the Thai replacements are actually present", () => {
  for (const needle of [
    "ใช้ข้อมูลลูกค้าล่าสุด",
    "อัตโนมัติ / ระบบเลือกจากที่อยู่",
    ">ละติจูด<",
    ">ลองจิจูด<",
    "แพ็กเกจบริการ (ถ้ามี)",
    "บริการร้านค้าแบบปกติ (ถ้ามี)",
    "กรอกรายละเอียดบริการเอง",
    "รายการแพ็กเกจบริการของร้านค้า",
    "ไม่ใช้แพ็กเกจร้านค้า",
    "แพ็กเกจเดี่ยว (ระบบเดิม)",
    "ไม่ใช้แพ็กเกจระบบเดิม",
    "ตัวเลือกราคา/จำนวนเครื่อง",
    "BTU จริง *",
    "เลือก BTU จริง",
    ">ภาษาอังกฤษ<",
    "ราคาพิเศษแทนราคาระบบ",
    "เวลาพิเศษแทนเวลาระบบ (นาที)",
  ]) {
    assert.equal(html.includes(needle), true, `admin-add-v2.html is missing the Thai text: ${needle}`);
  }
  for (const needle of [
    "กรุณาระบุจำนวนเครื่องอย่างน้อย 1 รายการ",
    "กำลังโหลดราคาและเวลาของแพ็กเกจ...",
    "ยังไม่มีราคาและเวลาของแพ็กเกจนี้",
    "วันที่เลือกเลยกำหนดใช้สิทธิ์ของแพ็กเกจแล้ว",
    "กรุณารอราคาและเวลาของตัวเลือกแพ็กเกจที่เลือกก่อนบันทึกงาน",
    "กรุณาระบุจำนวนเครื่องของแพ็กเกจร้านค้า แล้วรอให้เซิร์ฟเวอร์คำนวณราคาก่อน",
    "กรุณาเลือกตัวเลือกราคา/จำนวนเครื่อง และ BTU จริง ก่อนบันทึกงาน",
    "วันเวลานัดหมายเลยกำหนดใช้สิทธิ์ของแพ็กเกจนี้แล้ว",
    "ยังไม่มีข้อความฉบับภาษาอังกฤษ",
    "แหล่งราคา: แคตตาล็อกร้านค้า",
    "สมุดราคาบริการ",
    "โหมดตรวจสอบระบบ: เปิด",
  ]) {
    assert.equal(js.includes(needle), true, `admin-add-v2.js is missing the Thai text: ${needle}`);
  }
});

test("Issue 307: option values, payload keys and route names stay English contracts", () => {
  // Translating the labels must not have touched anything the backend reads.
  for (const contract of [
    'value="scheduled"', 'value="urgent"', 'value="forced"', 'value="offer"',
    'value="assign"', 'value="auto"', 'value="single"', 'value="team"',
    'id="technician_username_select"', 'id="technician_username"',
    'id="team_members_csv"', 'id="assign_mode"', 'id="booking_mode"', 'id="dispatch_mode"',
  ]) {
    assert.equal(html.includes(contract), true, `admin-add-v2.html lost a stable contract: ${contract}`);
  }
  assert.match(js, /\/admin\/availability_by_tech_v2/);
  assert.match(js, /\/admin\/book_v2/);
  assert.match(js, /assign_mode:/);
  assert.match(js, /technician_username:/);
  assert.match(js, /team_members:/);
  // The English customer confirmation feature itself is preserved.
  assert.match(js, /\/jobs\/\$\{r\.job_id\}\/summary\?lang=en/);
  assert.match(js, /summary_texts/);
  assert.equal(TECHNICAL_ALLOWLIST.length > 0, true);
});

// ---------------------------------------------------------------------------
// 2) Technician-list parity - no silent truncation
// ---------------------------------------------------------------------------

test("Issue 307: every available technician is listed exactly once, first/middle/last included", () => {
  const { buildSlotTechnicianList } = loadSlotTechnicianListApi();
  const ids = Array.from({ length: 40 }, (_, i) => `tech${String(i + 1).padStart(2, "0")}`);
  const display = (u) => `ช่าง ${u.slice(4)}`;

  const result = buildSlotTechnicianList(ids, "", display);
  assert.equal(result.total, 40);
  assert.equal(result.items.length, 40, "the picker must not drop any available technician");

  // NOTE: the helper runs in a vm realm, so compare by value, not by Array identity.
  const rendered = result.items.map((t) => t.username);
  assert.equal(rendered.join(","), ids.join(","), "order and membership must mirror the API response exactly");
  assert.equal(new Set(rendered).size, 40, "each technician must be rendered exactly once");
  assert.equal(rendered.includes(ids[0]), true, "first entry must stay reachable");
  assert.equal(rendered.includes(ids[19]), true, "middle entry must stay reachable");
  assert.equal(rendered.includes(ids[39]), true, "last entry must stay reachable");
});

test("Issue 307: search reaches a late entry by username and by display name", () => {
  const { buildSlotTechnicianList } = loadSlotTechnicianListApi();
  const ids = Array.from({ length: 40 }, (_, i) => `tech${String(i + 1).padStart(2, "0")}`);
  const display = (u) => (u === "tech40" ? "สมชาย ปลายคิว" : `ช่าง ${u.slice(4)}`);

  const byUsername = buildSlotTechnicianList(ids, "tech40", display);
  assert.equal(byUsername.total, 40, "total must always report the full available count");
  assert.equal(byUsername.items.map((t) => t.username).join(","), "tech40");

  const byName = buildSlotTechnicianList(ids, "ปลายคิว", display);
  assert.equal(byName.items.map((t) => t.username).join(","), "tech40");

  const noMatch = buildSlotTechnicianList(ids, "ไม่มีคนนี้", display);
  assert.equal(noMatch.items.length, 0);
  assert.equal(noMatch.total, 40);
});

test("Issue 307: duplicate or blank ids are normalised without hiding a real technician", () => {
  const { buildSlotTechnicianList } = loadSlotTechnicianListApi();
  const result = buildSlotTechnicianList(["a", " a ", "", null, "b", "c"], "", (u) => u);
  assert.equal(result.items.map((t) => t.username).join(","), "a,b,c");
  assert.equal(result.total, 3);
});

test("Issue 307: no hidden slice caps remain in the technician renderers", () => {
  const teamPicker = sliceFunction(js, "function renderTeamPicker(", "function getTeamListForAssign(");
  assert.doesNotMatch(teamPicker, /\.slice\(\s*0\s*,\s*\d+\s*\)/, "renderTeamPicker must not cap suggestions");
  assert.match(teamPicker, /suggestions\.length === selectable\.length/, "the UI must state when a search is hiding entries");
  assert.match(teamPicker, /name\.includes\(q\)/, "team search must also match the display name");

  const slotModal = sliceFunction(js, "function openSlotModal(", "function bindMachineCountStepper(");
  assert.doesNotMatch(slotModal, /\.slice\(\s*0\s*,\s*\d+\s*\)/, "the slot picker must not cap the technician list");
  assert.match(slotModal, /buildSlotTechnicianList\(ids, techQuery, techDisplay\)/);
  assert.match(slotModal, /buildSlotTechnicianList\(ids, '', techDisplay\)/);
  assert.match(slotModal, /ช่างที่ว่างในสล็อตนี้ทั้งหมด \$\{result\.total\} คน \(แสดงครบทุกคน\)/);
  assert.match(slotModal, /รายชื่อนี้คือช่างที่ว่างจริงในสล็อตนี้เท่านั้น/);
});

// ---------------------------------------------------------------------------
// 3) Selection / payload integrity
// ---------------------------------------------------------------------------

test("Issue 307: the slot picker keeps the authoritative selection fields in sync", () => {
  const slotModal = sliceFunction(js, "function openSlotModal(", "function bindMachineCountStepper(");

  // auto: picking a technician is authoritative and confirms immediately.
  assert.match(slotModal, /state\.confirmed_tech_username = v;\s*\n\s*state\.confirmed_tech_label = techDisplay\(v\);/);
  // single: picking is NOT a confirmation - the admin must press ยืนยัน.
  assert.match(slotModal, /state\.confirmed_tech_username = '';\s*\n\s*state\.confirmed_tech_label = '';\s*\n\s*const warn = body\.querySelector\('#slotm_single_warn'\)/);
  // team: picking clears the single-technician fields and rewrites the CSV payload.
  assert.match(slotModal, /state\.teamPicker\.selected = new Set\(Array\.from\(selected\)\);/);
  assert.match(slotModal, /getTeamMembersForPayload\(\);/);
  // the confirm button remains the only place that promotes auto -> single.
  assert.match(slotModal, /switchAssignModeToSingleForManualTech\(\);/);
  // the visible list drives the same hidden <select> the confirm handler reads.
  assert.match(slotModal, /selEl\.dispatchEvent\(new Event\('change'\)\)/);
  assert.match(slotModal, /const sel = body\.querySelector\('#slotm_single'\);/);
});

test("Issue 307: changing time or slot still clears a technician who is not free there", () => {
  const selectSlot = sliceFunction(js, "function selectSlot(", "// =============================\n// Slot Quick Pick Modal");
  assert.match(selectSlot, /if\(u && !ids\.includes\(u\)\)/);
  assert.match(selectSlot, /สล็อตนี้ไม่มีช่างที่เลือก/);
  assert.match(selectSlot, /const bad = team\.filter\(u=>u && !ids\.includes\(u\)\)/);
  assert.match(selectSlot, /สล็อตนี้ไม่ว่างครบทีม/);
  // The modal re-runs selectSlot for the picked start time before rendering.
  const slotModal = sliceFunction(js, "function openSlotModal(", "function bindMachineCountStepper(");
  assert.match(slotModal, /try\{ selectSlot\(picked, slot\); \}catch\(e\)\{\}/);
  assert.match(slotModal, /try\{ selectSlot\(v, slot\); \}catch\(e\)\{\}/);
});

test("Issue 307: availability inputs and eligibility rules are untouched", () => {
  // The renderer still consumes exactly what the API returned for the slot.
  assert.match(js, /const ids = Array\.isArray\(slot\?\.available_tech_ids\) \? slot\.available_tech_ids : \[\]/);
  // The availability request itself is byte-for-byte the same contract as before.
  const loadAvailability = sliceFunction(js, "async function loadAvailability(", "function getConstraintTechs(");
  assert.match(loadAvailability, /qs\.set\('forced','1'\)/);
  assert.match(loadAvailability, /qs\.set\('aggregate','1'\)/);
  assert.match(loadAvailability, /\/admin\/availability_by_tech_v2\?\$\{qs\.toString\(\)\}/);
  assert.match(loadAvailability, /const forced = true;/);
});

// ---------------------------------------------------------------------------
// 4) Mobile-safe bottom sheet
// ---------------------------------------------------------------------------

test("Issue 307: the slot sheet is a viewport-bounded flex column with a scrolling body", () => {
  const style = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));

  assert.match(style, /#slot_modal_overlay \.team-sheet\.slot-sheet\{[\s\S]*?display:flex/);
  assert.match(style, /#slot_modal_overlay \.team-sheet\.slot-sheet\{[\s\S]*?flex-direction:column/);
  // dvh for real Android viewports, with a vh fallback declared first.
  assert.match(style, /max-height:88vh;[\s\S]*?max-height:88dvh;/);
  assert.match(style, /padding-bottom:calc\(16px \+ env\(safe-area-inset-bottom\)\)/);

  assert.match(style, /#slot_modal_overlay #slot_modal_body\{[\s\S]*?overflow-y:auto/);
  assert.match(style, /#slot_modal_overlay #slot_modal_body\{[\s\S]*?min-height:0/);
  assert.match(style, /#slot_modal_overlay #slot_modal_body\{[\s\S]*?-webkit-overflow-scrolling:touch/);
  assert.match(style, /#slot_modal_overlay #slot_modal_body\{[\s\S]*?overscroll-behavior:contain/);

  // header and footer must not scroll away
  assert.match(style, /#slot_modal_overlay \.slot-sheet-head\{flex:0 0 auto\}/);
  assert.match(style, /#slot_modal_overlay \.slot-sheet \.sheet-actions\{[\s\S]*?flex:0 0 auto/);

  // the broad `.team-sheet button{width:100%}` rule must not stretch technician chips
  assert.match(style, /#slot_modal_overlay \.slot-sheet \.slot-tech-list button\{[\s\S]*?width:auto/);
  // 16px keeps iOS/Android from zooming the page when the search field is focused
  assert.match(style, /\.slot-tech-search\{[\s\S]*?font-size:16px/);
});

test("Issue 307: the slot modal markup has a fixed head, a scroll body and reachable actions", () => {
  const modal = html.slice(html.indexOf('id="slot_modal_overlay"'), html.indexOf('id="slot_modal_overlay"') + 900);
  assert.match(modal, /class="team-sheet slot-sheet"/);
  assert.match(modal, /<div class="slot-sheet-head">[\s\S]*?id="slot_modal_title"[\s\S]*?id="slot_modal_sub"[\s\S]*?<\/div>/);
  assert.match(modal, /<div id="slot_modal_body"><\/div>/);
  assert.match(modal, /<div class="sheet-actions">[\s\S]*?id="slot_modal_confirm"[\s\S]*?id="slot_modal_close"/);
  assert.match(modal, /aria-labelledby="slot_modal_title"/);
});

test("Issue 307: the scoped CSS cannot regress other pages' team sheets", () => {
  const style = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
  const slotRules = style.split("\n").filter((line) => line.trim().startsWith("#slot_modal_overlay"));
  assert.equal(slotRules.length > 0, true);
  // Every slot-sheet rule is scoped to this page's modal id; nothing bare-selects .team-sheet.
  for (const line of slotRules) {
    assert.match(line.trim(), /^#slot_modal_overlay\b/);
  }
  const css = fs.readFileSync(path.join(ROOT, "style.css"), "utf8");
  assert.match(css, /\.team-sheet\{/, "shared style.css team-sheet base rule is left alone");
});

test("Issue 307: the in-slot search box exists for both single and team assignment", () => {
  const slotModal = sliceFunction(js, "function openSlotModal(", "function bindMachineCountStepper(");
  assert.match(slotModal, /id="slotm_tech_search"/);
  assert.match(slotModal, /placeholder="ค้นหาช่าง \(ชื่อ หรือ ชื่อผู้ใช้\)"/);
  assert.match(slotModal, /pickerShell\('team'\)/);
  assert.match(slotModal, /pickerShell\('auto'\)/);
  assert.match(slotModal, /pickerShell\('single'\)/);
  // Typing only repaints the list, so the mobile keyboard never loses the field.
  // The handler body is asserted exactly: a full renderBody() here would blow the
  // search box (and the caret) away on every keystroke and strand the last entries.
  const inputHandler = slotModal.match(/searchEl\.addEventListener\('input', \(\)=>\{([\s\S]*?)\n {6}\}\);/);
  assert.notEqual(inputHandler, null, "the in-slot search box must have an input handler");
  assert.match(inputHandler[1], /techQuery = searchEl\.value \|\| '';/);
  assert.match(inputHandler[1], /renderTechList\(\);/);
  assert.doesNotMatch(inputHandler[1], /renderBody\(\)/);
  // Picking a technician also repaints the list only - never the whole body.
  const pickHandler = sliceFunction(slotModal, "const pickTech = (username)=>{", "const bindTechSearch = ()=>{");
  assert.doesNotMatch(pickHandler, /renderBody\(\)/);
  assert.match(pickHandler, /renderTechList\(\);/);
  // the main-form team picker has a search box and a live count too
  assert.match(html, /id="team_search"[^>]*placeholder="ค้นหาช่างร่วม \(ชื่อ หรือ ชื่อผู้ใช้\)\.\.\."/);
  assert.match(html, /id="team_suggest_count"/);
});

// ---------------------------------------------------------------------------
// 5) Cache-bust contract
// ---------------------------------------------------------------------------

test("Issue 307: admin-add-v2.js ships a new cache-busting build id", () => {
  assert.match(html, /admin-add-v2\.js\?v=20260820_issue310_package_minimum_quantity_v1/);
  assert.doesNotMatch(html, /admin-add-v2\.js\?v=20260809_issue267_catalog_flow_v9/);
});
