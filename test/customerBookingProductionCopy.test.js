const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const BUILD = "20260720_customer_booking_pr4_v2";

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function makeContext() {
  const window = {
    CWFCustomerAppV2: {},
    location: { protocol: "https:", origin: "https://app.example.test", hostname: "app.example.test", pathname: "/customer-app/", search: "", hash: "" },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    addEventListener() {},
  };
  const context = {
    window,
    document: {
      visibilityState: "visible",
      body: { classList: { add() {}, remove() {} } },
      addEventListener() {},
      createElement() { return { setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } }; },
    },
    navigator: {},
    history: { replaceState() {} },
    URL,
    URLSearchParams,
    Intl,
    Date,
    console,
    setTimeout,
    clearTimeout,
    setInterval() { return 1; },
    clearInterval() {},
    requestAnimationFrame(callback) { callback(); },
  };
  context.globalThis = context;
  return vm.createContext(context);
}

function loadFrontend(modulePaths) {
  const context = makeContext();
  for (const modulePath of modulePaths) {
    vm.runInContext(read(modulePath), context, { filename: modulePath });
  }
  return { context, root: context.window.CWFCustomerAppV2 };
}

function loadBookingModules() {
  return loadFrontend([
    "customer-app/modules/state.js",
    "customer-app/modules/utils.js",
    "customer-app/modules/customerCopy.js",
    "customer-app/modules/services.js",
    "customer-app/modules/availability.js",
    "customer-app/modules/bookingScheduled.js",
    "customer-app/modules/bookingUrgent.js",
  ]);
}

test("central customer copy maps booking failures without exposing raw backend diagnostics", () => {
  const { root } = loadFrontend(["customer-app/modules/customerCopy.js"]);
  const copy = root.customerCopy;
  assert.equal(copy.bookingError({ status: 409, data: { code: "SLOT_UNAVAILABLE" } }), "ช่วงเวลานี้เพิ่งมีผู้จอง กรุณาเลือกเวลาใหม่");
  assert.equal(copy.bookingError({ data: { code: "NO_OPEN_SLOTS" } }), "ยังไม่มีคิวว่างในวันที่เลือก กรุณาเลือกวันอื่น");
  assert.equal(copy.bookingError({ status: 503, data: { code: "URGENT_BOOKING_DISABLED" } }), "ขณะนี้ยังไม่เปิดรับจองออนไลน์ กรุณาติดต่อแอดมิน");
  assert.equal(copy.bookingError(new TypeError("Failed to fetch https://secret.example")), "เชื่อมต่อระบบไม่สำเร็จ กรุณาลองอีกครั้ง");

  const hostile = Object.assign(new Error("relation jobs does not exist"), {
    status: 500,
    data: { code: "INTERNAL_SQL_500", error: "POST /public/book SELECT * FROM jobs" },
  });
  const output = copy.bookingError(hostile);
  assert.equal(output, "ระบบขัดข้องชั่วคราว กรุณาลองใหม่หรือติดต่อแอดมิน");
  assert.doesNotMatch(output, /SQL|jobs|\/public\/book|INTERNAL|relation/i);
});

test("central urgent submitted view model classifies pending, actionable, and terminal states", () => {
  const { root } = loadFrontend(["customer-app/modules/customerCopy.js"]);
  const viewFor = root.customerCopy.urgentSubmittedView;

  assert.equal(viewFor(null).state, "pending");
  assert.equal(viewFor({ phase: "admin_review", confirmed: false, terminal: false }).state, "pending");
  for (const phase of ["approved", "assigned", "accepted", "in_progress"]) {
    assert.equal(viewFor({ phase, confirmed: false, terminal: false }).state, "actionable");
  }
  assert.equal(viewFor({ phase: "waiting", confirmed: true, terminal: false }).state, "actionable");
  for (const phase of ["terminal", "rejected", "cancelled", "canceled", "closed"]) {
    assert.equal(viewFor({ phase, confirmed: false, terminal: false }).state, "terminal");
  }
  assert.equal(viewFor({ phase: "accepted", confirmed: true, terminal: true }).state, "terminal");
});

test("urgent UI is cleaning-only and a stale repair draft cannot alter its payload", () => {
  const { root } = loadBookingModules();
  root.state.updateDraft("urgent", {
    customer_name: "สมชาย",
    customer_phone: "0812345678",
    address_text: "กรุงเทพ",
    symptom: "ต้องการล้างด่วน",
    service_kind: "repair",
    job_type: "ซ่อม",
    repair_variant: "ซ่อมทั่วไป",
    ac_type: "__unknown_ac__",
    btu: "__unknown_btu__",
    services: [{ job_type: "ซ่อม", ac_type: "ผนัง", btu: 12000, machine_count: 3 }],
  });

  const html = root.bookingUrgent._test.renderForm();
  assert.match(html, /จองล้างแอร์|งานล้างแอร์เท่านั้น|ชนิดแอร์|รูปแบบการล้างสำหรับแอร์ผนัง|BTU|จำนวนเครื่อง/);
  assert.doesNotMatch(html, /ซ่อม|ติดตั้ง|ย้ายแอร์|ตรวจอาการ|service_kind/);

  const payload = root.bookingUrgent._test.buildSubmitPayload();
  assert.equal(payload.job_type, "ล้าง");
  assert.equal(payload.services.length, 1);
  assert.equal(payload.services[0].job_type, "ล้าง");
  assert.equal(payload.repair_variant, "");
  assert.equal(payload.services[0].repair_variant, "");
  assert.equal(Object.hasOwn(payload, "dispatch_mode"), false);
  assert.equal(Object.hasOwn(payload, "allow_time_proposal"), false);
});

test("urgent API boundary forces cleaning on every line and preserves structured safe error metadata", async () => {
  const context = makeContext();
  const calls = [];
  context.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, async text() { return JSON.stringify({ success: true }); } };
  };
  vm.runInContext(read("customer-app/modules/api.js"), context, { filename: "customer-app/modules/api.js" });
  const api = context.window.CWFCustomerAppV2.api;
  await api.submitUrgentRequest({
    job_type: "ซ่อม",
    repair_variant: "ซ่อมทั่วไป",
    dispatch_mode: "offer",
    allow_time_proposal: true,
    services: [{ job_type: "ติดตั้ง", repair_variant: "ตรวจอาการ" }],
  });
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.job_type, "ล้าง");
  assert.equal(body.services[0].job_type, "ล้าง");
  assert.equal(body.repair_variant, "");
  assert.equal(body.services[0].repair_variant, "");
  assert.equal(Object.hasOwn(body, "dispatch_mode"), false);
  assert.equal(Object.hasOwn(body, "allow_time_proposal"), false);

  context.fetch = async () => ({
    ok: false,
    status: 503,
    async text() { return JSON.stringify({ code: "URGENT_BOOKING_DISABLED", error: "internal route detail" }); },
  });
  await assert.rejects(api.submitUrgentRequest({ services: [] }), (error) => {
    assert.equal(error.status, 503);
    assert.equal(error.data.code, "URGENT_BOOKING_DISABLED");
    return true;
  });
});

test("Scheduled and Urgent success screens use pending-admin copy and hide reserved technician identity", () => {
  const { root } = loadBookingModules();
  root.state.updateDraft("scheduled", { selectedSlot: { date: "2026-07-20", start: "09:00", end: "10:00" } });
  root.state.setScheduledSubmit({ result: {
    booking_code: "CWF123",
    token: "private-token",
    base_total: 700,
    duration_min: 60,
    technician_username: "reserved-tech-secret",
  } });
  const scheduled = root.bookingScheduled._test.renderSuccess();
  assert.match(scheduled, /ส่งคำขอจองแล้ว/);
  assert.match(scheduled, /ระบบกันช่วงเวลานี้ไว้ให้ชั่วคราว/);
  assert.match(scheduled, /แอดมินจะตรวจสอบรายละเอียดและยืนยันคิวให้คุณ/);
  assert.match(scheduled, /รอแอดมินยืนยัน/);
  assert.match(scheduled, /รหัสการจอง/);
  assert.doesNotMatch(scheduled, /Booking Code|จองสำเร็จ|ยืนยันคิวแล้ว|ได้ช่างแล้ว|reserved-tech-secret|technician_username/);

  root.state.updateDraft("urgent", { customer_name: "สมชาย", job_zone: "บางนา" });
  root.state.setUrgentFlow({ result: { booking_code: "CWF456", technician_username: "urgent-tech-secret" }, liveStatus: null, liveStatusError: "" });
  const urgent = root.bookingUrgent._test.renderSubmitted();
  assert.match(urgent, /ส่งคำขอแล้ว/);
  assert.match(urgent, /แอดมินกำลังตรวจสอบรายละเอียดก่อนส่งต่อให้ช่างที่ว่าง/);
  assert.match(urgent, /รอแอดมินตรวจสอบ/);
  assert.match(urgent, /รหัสการจอง/);
  assert.doesNotMatch(urgent, /Booking Code|urgent-tech-secret|technician_username|Partner-first|Waiting Room|Live status|offer|radar/);
});

test("repair, install, move, and inspection gateway stays contact-only and never creates booking payloads", () => {
  const { root } = loadFrontend([
    "customer-app/modules/state.js",
    "customer-app/modules/utils.js",
    "customer-app/modules/customerCopy.js",
    "customer-app/modules/services.js",
    "customer-app/modules/ui.js",
  ]);
  const otherIds = ["repair", "install", "move", "inspect"];
  for (const id of otherIds) {
    const item = root.services.commerceItem(id);
    assert.equal(item.action, "contact");
    assert.equal(root.services.applyCommerceDraft("scheduled", item), false);
  }
  const container = { innerHTML: "", querySelectorAll() { return []; }, querySelector() { return null; } };
  root.ui.renderBookingMode(container);
  assert.match(container.innerHTML, new RegExp(root.customerCopy.messages.otherServices));
  const otherServices = container.innerHTML.slice(container.innerHTML.indexOf("งานซ่อม ติดตั้ง ย้ายแอร์ หรือตรวจอาการ"));
  assert.doesNotMatch(otherServices, /data-route=|\/public\/book/);
  assert.match(otherServices, /https:\/\/lin\.ee\/fG1Oq7y|tel:0988777321/);
});

test("booking presentation sources do not render raw errors or retired pre-approval terminology", () => {
  const scheduled = read("customer-app/modules/bookingScheduled.js");
  const urgent = read("customer-app/modules/bookingUrgent.js");
  const presentation = `${scheduled}\n${urgent}`;
  assert.doesNotMatch(presentation, /error\.message|data\.error/);
  assert.doesNotMatch(urgent, /Partner-first|Urgent request|Waiting Room|Final check|Live status|Next best action|offer countdown|radar|รอพาร์ทเนอร์|กดรับหรือปฏิเสธ/);
  assert.doesNotMatch(presentation, /console\.info/);
  assert.doesNotMatch(presentation, /Booking Code/);
});

test("Customer App build and cache IDs include the central copy module consistently", () => {
  const index = read("customer-app/index.html");
  const sw = read("customer-app/sw.js");
  const app = read("customer-app/assets/customer-app.js");
  const manifest = JSON.parse(read("customer-app/manifest.webmanifest"));
  assert.match(index, new RegExp(`customerCopy\\.js\\?v=${BUILD}`));
  assert.match(index, new RegExp(`bookingUrgent\\.js\\?v=${BUILD}`));
  assert.match(sw, new RegExp(`BUILD_ID = "${BUILD}"`));
  assert.match(sw, /modules\/customerCopy\.js\?v=\$\{BUILD_ID\}/);
  assert.match(app, new RegExp(`BUILD_ID = "${BUILD}"`));
  assert.match(manifest.start_url, new RegExp(`v=${BUILD}`));
});

test("Scheduled and Urgent mobile contracts remain usable at 360px and 390px", () => {
  const css = read("customer-app/assets/customer-app.css");
  assert.match(css, /\*\s*\{\s*box-sizing:\s*border-box;\s*\}/);
  assert.match(css, /\*,\s*\*::before,\s*\*::after\s*\{\s*min-width:\s*0;\s*\}/);
  assert.match(css, /\.app-shell\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*480px;/s);
  assert.match(css, /\.form-grid\s*\{\s*display:\s*flex;\s*flex-direction:\s*column;/);
  assert.match(css, /@media\s*\(max-width:\s*430px\)\s*\{[\s\S]*?\.choice-grid,[\s\S]*?grid-template-columns:\s*1fr;/);
  assert.match(css, /\.choice-card\s*\{[\s\S]*?min-height:\s*74px;[\s\S]*?max-width:\s*100%;/);
  assert.match(css, /\.primary-btn\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-height:\s*54px;/);
  assert.match(css, /\.secondary-btn\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-height:\s*50px;/);
  assert.match(css, /@media\s*\(max-width:\s*390px\)\s*\{[\s\S]*?\.bottom-nav\s*\{\s*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(css, /padding-bottom:\s*calc\(var\(--nav-h\)\s*\+\s*env\(safe-area-inset-bottom,\s*0px\)\s*\+\s*24px\);/);
});
