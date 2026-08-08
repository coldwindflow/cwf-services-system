const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const BUILD = "20260809_issue267_merchandising_v3";

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
  assert.equal(copy.bookingError({ status: 503, data: {} }), "ระบบขัดข้องชั่วคราว กรุณาลองใหม่หรือติดต่อแอดมิน");
  assert.equal(copy.bookingError({ status: 409, data: { code: "IDEMPOTENCY_KEY_REUSED" } }), "ระบบขัดข้องชั่วคราว กรุณาลองใหม่หรือติดต่อแอดมิน");
  assert.equal(copy.bookingError(Object.assign(new Error("timeout"), { name: "AbortError" })), "เชื่อมต่อระบบไม่สำเร็จ กรุณาลองอีกครั้ง");
  assert.equal(copy.bookingError({ status: 503, data: { code: "SCHEDULED_BOOKING_DISABLED" } }), "ขณะนี้ยังไม่เปิดรับจองออนไลน์ กรุณาติดต่อแอดมิน");
  assert.equal(copy.bookingError(new TypeError("Failed to fetch https://secret.example")), "เชื่อมต่อระบบไม่สำเร็จ กรุณาลองอีกครั้ง");

  const hostile = Object.assign(new Error("relation jobs does not exist"), {
    status: 500,
    data: { code: "INTERNAL_SQL_500", error: "POST /public/book SELECT * FROM jobs" },
  });
  const output = copy.bookingError(hostile);
  assert.equal(output, "ระบบขัดข้องชั่วคราว กรุณาลองใหม่หรือติดต่อแอดมิน");
  assert.doesNotMatch(output, /SQL|jobs|\/public\/book|INTERNAL|relation/i);
});

test("urgent submit classifies disabled only from an explicit stable code", () => {
  const { root } = loadBookingModules();
  const isDisabled = root.bookingUrgent._test.isUrgentDisabledError;
  assert.equal(isDisabled({ status: 503, data: { code: "URGENT_BOOKING_DISABLED" } }), true);
  assert.equal(isDisabled({ status: 503, data: {} }), false);
  assert.equal(isDisabled({ status: 503, data: { code: "DATABASE_UNAVAILABLE" } }), false);
});

test("central urgent submitted view model classifies pending, actionable, and terminal states", () => {
  const { root } = loadFrontend(["customer-app/modules/customerCopy.js"]);
  const viewFor = root.customerCopy.urgentSubmittedView;

  assert.equal(viewFor(null).state, "pending");
  assert.equal(viewFor({ phase: "admin_review", confirmed: false, terminal: false }).state, "pending");
  assert.equal(viewFor({ phase: "approved", confirmed: true, terminal: false }).state, "pending");
  for (const phase of ["assigned", "accepted", "in_progress"]) {
    assert.equal(viewFor({ phase, confirmed: false, terminal: false }).state, "actionable");
  }
  assert.equal(viewFor({ phase: "waiting", confirmed: true, terminal: false }).state, "pending");
  assert.equal(viewFor({ phase: "fallback", confirmed: false, terminal: false }).state, "fallback");
  for (const phase of ["terminal", "rejected", "cancelled", "canceled", "closed"]) {
    assert.equal(viewFor({ phase, confirmed: false, terminal: false }).state, "terminal");
  }
  assert.equal(viewFor({ phase: "accepted", confirmed: true, terminal: true }).state, "terminal");
});

test("central booking approval view maps deployed pending, actionable, and terminal contracts without raw status copy", () => {
  const { root } = loadFrontend(["customer-app/modules/customerCopy.js"]);
  const viewFor = root.customerCopy.bookingApprovalView;

  const scheduledPending = viewFor({ booking_mode: "scheduled", job_status: "รอตรวจสอบ" });
  assert.equal(scheduledPending.state, "pending");
  assert.equal(scheduledPending.statusLabel, "รอแอดมินยืนยัน");

  const urgentPending = viewFor({ booking_mode: "urgent", phase: "searching", job_status: "รอช่างยืนยัน", confirmed: false, terminal: false });
  assert.equal(urgentPending.state, "pending");
  assert.equal(urgentPending.statusLabel, "กำลังค้นหาช่าง");

  const ambiguousWaiting = viewFor({ booking_mode: "urgent", phase: "waiting", confirmed: false, terminal: false });
  assert.equal(ambiguousWaiting.state, "pending");
  assert.equal(ambiguousWaiting.statusLabel, "กำลังค้นหาช่าง");

  const urgentApproved = viewFor({ booking_mode: "urgent", phase: "assigned", confirmed: true, terminal: false });
  assert.equal(urgentApproved.state, "actionable");
  assert.equal(urgentApproved.statusLabel, "พร้อมติดตามงาน");

  const cancelled = viewFor({ booking_mode: "scheduled", job_status: "cancelled" });
  assert.equal(cancelled.state, "terminal");
  assert.equal(cancelled.statusLabel, "สิ้นสุดแล้ว");

  for (const view of [scheduledPending, urgentPending, ambiguousWaiting, urgentApproved, cancelled]) {
    assert.doesNotMatch(JSON.stringify(view), /admin_review|pending_review|job_status|cancelled/i);
  }
});

test("customer lifecycle view preserves actual job progress before approval presentation", () => {
  const { root } = loadFrontend(["customer-app/modules/customerCopy.js"]);
  const viewFor = root.customerCopy.customerLifecycleView;
  const cases = [
    {
      name: "cancelled",
      source: {
        job_status: "ยกเลิก",
        finished_at: "2026-07-20T12:00:00+07:00",
        started_at: "2026-07-20T11:00:00+07:00",
      },
      state: "cancelled",
      label: "สิ้นสุดแล้ว",
    },
    {
      name: "completed",
      source: {
        finished_at: "2026-07-20T12:00:00+07:00",
        started_at: "2026-07-20T11:00:00+07:00",
      },
      state: "completed",
      label: "งานเสร็จแล้ว",
    },
    {
      name: "started",
      source: {
        started_at: "2026-07-20T11:00:00+07:00",
        checkin_at: "2026-07-20T10:45:00+07:00",
        travel_started_at: "2026-07-20T10:00:00+07:00",
        assigned_at: "2026-07-20T09:00:00+07:00",
      },
      state: "started",
      label: "กำลังให้บริการ",
    },
    {
      name: "checked-in",
      source: {
        checkin_at: "2026-07-20T10:45:00+07:00",
        travel_started_at: "2026-07-20T10:00:00+07:00",
        assigned_at: "2026-07-20T09:00:00+07:00",
      },
      state: "checked_in",
      label: "ช่างถึงหน้างานแล้ว",
    },
    {
      name: "traveling",
      source: {
        travel_started_at: "2026-07-20T10:00:00+07:00",
        assigned_at: "2026-07-20T09:00:00+07:00",
      },
      state: "traveling",
      label: "ช่างกำลังเดินทาง",
    },
    {
      name: "assigned",
      source: { assigned_at: "2026-07-20T09:00:00+07:00", job_status: "รอดำเนินการ" },
      state: "assigned",
      label: "ยืนยันคิวแล้ว",
    },
    {
      name: "approval pending",
      source: { booking_mode: "urgent", job_status: "รอช่างยืนยัน" },
      state: "pending",
      label: "กำลังค้นหาช่าง",
    },
    {
      name: "urgent assigned",
      source: { booking_mode: "urgent", phase: "assigned", job_status: "assigned" },
      state: "assigned",
      label: "ช่างรับงานแล้ว",
    },
  ];

  for (const entry of cases) {
    const view = viewFor(entry.source);
    assert.equal(view.state, entry.state, entry.name);
    assert.equal(view.statusLabel, entry.label, entry.name);
    assert.doesNotMatch(JSON.stringify(view), /admin_review|job_status|approved/i, entry.name);
  }
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

  const html = root.bookingUrgent._test.renderServicesStep();
  assert.match(html, /บริการและราคา|ชนิดแอร์|วิธีล้าง|BTU|จำนวนเครื่อง/);
  assert.doesNotMatch(html, /ซ่อม|ติดตั้ง|ย้ายแอร์|ตรวจอาการ|service_kind/);

  const payload = root.bookingUrgent._test.buildSubmitPayload();
  assert.equal(payload.job_type, "ล้าง");
  assert.equal(payload.services.length, 1);
  assert.equal(payload.services[0].job_type, "ล้าง");
  assert.equal(payload.repair_variant, "");
  assert.equal(payload.services[0].repair_variant, "");
  assert.equal(Object.hasOwn(payload, "dispatch_mode"), false);
  assert.equal(payload.allow_time_proposal, false);
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
  assert.equal(body.allow_time_proposal, true);

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

test("Scheduled keeps pending-admin copy while Urgent uses technician-first searching copy", () => {
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
  root.state.setUrgentFlow({
    result: { booking_code: "CWF456", token: "private-cancel-token", technician_username: "urgent-tech-secret" },
    liveStatus: { phase: "searching", can_cancel: true },
    liveStatusError: "",
  });
  const urgent = root.bookingUrgent._test.renderSubmitted();
  assert.match(urgent, /ส่งคำขอแล้ว/);
  assert.match(urgent, /กำลังค้นหาช่างที่พร้อมรับงาน/);
  assert.match(urgent, /กำลังค้นหาช่าง/);
  assert.match(urgent, /รหัสการจอง/);
  assert.match(urgent, /data-urgent-search-animation/);
  assert.match(urgent, /ยกเลิกคำขอ/);
  assert.doesNotMatch(urgent, /private-cancel-token|Booking Code|urgent-tech-secret|technician_username|Partner-first|Waiting Room|Live status|offer|รอแอดมิน|แอดมินกำลังตรวจสอบ/);

  root.state.setUrgentFlow({ liveStatus: { phase: "fallback", can_cancel: true } });
  const fallback = root.bookingUrgent._test.renderSubmitted();
  assert.doesNotMatch(fallback, /data-urgent-search-animation/);
  assert.match(fallback, /ยกเลิกคำขอ/);

  root.state.setUrgentFlow({ liveStatus: { phase: "terminal", terminal: true, can_cancel: false } });
  const terminal = root.bookingUrgent._test.renderSubmitted();
  assert.doesNotMatch(terminal, /data-urgent-search-animation|ยกเลิกคำขอ/);
});

test("urgent submitted cancellation uses the in-memory private token and becomes terminal", async () => {
  const { context, root } = loadBookingModules();
  const calls = [];
  context.window.confirm = () => true;
  root.api = {
    async cancelUrgentRequest(token) {
      calls.push(token);
      return { success: true, cancelled: true };
    },
  };
  root.state.currentRoute = "urgent";
  root.state.setUrgentFlow({
    step: "submitted",
    status: "success",
    result: { booking_code: "CWF456", token: "private-cancel-token" },
    liveStatus: { phase: "searching", can_cancel: true },
    liveStatusError: "",
  });
  const container = {
    innerHTML: "",
    querySelectorAll() { return []; },
    querySelector() { return null; },
  };
  assert.equal(await root.bookingUrgent._test.cancelUrgent(container), true);
  assert.deepEqual(calls, ["private-cancel-token"]);
  assert.equal(root.state.urgentFlow.liveStatus.phase, "terminal");
  assert.equal(root.state.urgentFlow.liveStatus.can_cancel, false);
  assert.doesNotMatch(container.innerHTML, /private-cancel-token/);
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

test("homepage active booking card maps internal status to customer-safe approval copy", () => {
  const { root } = loadFrontend([
    "customer-app/modules/state.js",
    "customer-app/modules/utils.js",
    "customer-app/modules/customerCopy.js",
    "customer-app/modules/services.js",
    "customer-app/modules/ui.js",
  ]);
  root.state.setHomepage({
    status: "success",
    config: {
      sections: [{ id: "active_job", type: "active_job", enabled: true, sort_order: 1, title: "งานของฉัน" }],
    },
  });
  root.state.setCollection("homeActiveJob", {
    status: "success",
    data: { booking_mode: "urgent", job_status: "รอช่างยืนยัน", job_type: "ล้าง", booking_code: "CWFSAFE1" },
  });

  const html = root.ui._test.renderHomepageSectionsWithAdvisor();
  assert.match(html, /กำลังค้นหาช่าง/);
  assert.doesNotMatch(html, /รอแอดมิน|admin_review|job_status/);
});

test("homepage active booking card preserves every customer lifecycle state in priority order", () => {
  const { root } = loadFrontend([
    "customer-app/modules/state.js",
    "customer-app/modules/utils.js",
    "customer-app/modules/customerCopy.js",
    "customer-app/modules/services.js",
    "customer-app/modules/ui.js",
  ]);
  root.state.setHomepage({
    status: "success",
    config: {
      sections: [{ id: "active_job", type: "active_job", enabled: true, sort_order: 1, title: "งานของฉัน" }],
    },
  });
  const cases = [
    [{ job_status: "ยกเลิก", finished_at: "done", started_at: "started" }, "สิ้นสุดแล้ว"],
    [{ finished_at: "done", started_at: "started" }, "งานเสร็จแล้ว"],
    [{ started_at: "started", checkin_at: "checkin", travel_started_at: "travel" }, "กำลังให้บริการ"],
    [{ checkin_at: "checkin", travel_started_at: "travel" }, "ช่างถึงหน้างานแล้ว"],
    [{ travel_started_at: "travel", assigned_at: "assigned" }, "ช่างกำลังเดินทาง"],
    [{ assigned_at: "assigned", job_status: "รอดำเนินการ" }, "ยืนยันคิวแล้ว"],
    [{ booking_mode: "urgent", job_status: "รอช่างยืนยัน" }, "กำลังค้นหาช่าง"],
    [{ booking_mode: "urgent", phase: "assigned", job_status: "assigned" }, "ช่างรับงานแล้ว"],
  ];

  for (const [source, label] of cases) {
    root.state.setCollection("homeActiveJob", {
      status: "success",
      data: { ...source, job_type: "ล้าง", booking_code: "CWFSAFE1" },
    });
    const html = root.ui._test.renderHomepageSectionsWithAdvisor();
    assert.match(html, new RegExp(label), label);
    assert.doesNotMatch(html, /admin_review|job_status|approved/i, label);
  }
});

test("booking presentation sources do not render raw errors or retired pre-approval terminology", () => {
  const scheduled = read("customer-app/modules/bookingScheduled.js");
  const urgent = read("customer-app/modules/bookingUrgent.js");
  const presentation = `${scheduled}\n${urgent}`;
  assert.doesNotMatch(presentation, /error\.message|data\.error/);
  assert.doesNotMatch(urgent, /Partner-first|Urgent request|Waiting Room|Final check|Live status|Next best action|offer countdown|รอพาร์ทเนอร์|กดรับหรือปฏิเสธ/);
  assert.doesNotMatch(presentation, /console\.info/);
  assert.doesNotMatch(presentation, /Booking Code/);
});

test("tracking presentation has no startup debug log or raw booking status/error rendering contract", () => {
  const tracking = read("customer-app/modules/tracking.js");
  assert.doesNotMatch(tracking, /console\.info\(/);
  assert.doesNotMatch(tracking, /esc\(job\.job_status|esc\(data\.job_status/);
  assert.doesNotMatch(tracking, /status\.textContent\s*=\s*\(?error(?:\s*&&|\.)/);
});

test("Customer App build and cache IDs include the central copy module consistently", () => {
  const index = read("customer-app/index.html");
  const sw = read("customer-app/sw.js");
  const app = read("customer-app/assets/customer-app.js");
  assert.match(index, new RegExp(`customerCopy\\.js\\?v=${BUILD}`));
  assert.match(index, new RegExp(`bookingUrgent\\.js\\?v=${BUILD}`));
  assert.match(sw, new RegExp(`BUILD_ID = "${BUILD}"`));
  assert.match(sw, /modules\/customerCopy\.js\?v=\$\{BUILD_ID\}/);
  assert.match(app, new RegExp(`BUILD_ID = "${BUILD}"`));
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
