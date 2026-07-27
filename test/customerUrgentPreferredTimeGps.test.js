const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createBookingJobService } = require("../server/services/booking/createBookingJob");
const urgentPublicAdapter = require("../server/services/urgentPublicAdapter");

const ROOT = path.resolve(__dirname, "..");

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
    removeEventListener() {},
  };
  const context = {
    window,
    document: {
      visibilityState: "visible",
      body: { classList: { add() {}, remove() {} } },
      addEventListener() {},
      removeEventListener() {},
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

function loadUrgent() {
  const context = makeContext();
  for (const modulePath of [
    "customer-app/modules/state.js",
    "customer-app/modules/utils.js",
    "customer-app/modules/customerCopy.js",
    "customer-app/modules/services.js",
    "customer-app/modules/bookingUrgent.js",
  ]) {
    vm.runInContext(read(modulePath), context, { filename: modulePath });
  }
  return { context, root: context.window.CWFCustomerAppV2 };
}

function futureDraft(root) {
  const services = [
    root.services.createServiceLine({ line_id: "a", ac_type: "ผนัง", btu: 12000, machine_count: 2, wash_variant: "ล้างธรรมดา" }),
    root.services.createServiceLine({ line_id: "b", ac_type: "สี่ทิศทาง", btu: 24000, machine_count: 1 }),
  ];
  root.state.updateDraft("urgent", {
    services,
    customer_name: "สมชาย",
    customer_phone: "0812345678",
    address_text: "กรุงเทพฯ",
    date: "2099-08-01",
    time: "13:45",
    allow_time_proposal: false,
    maps_url: "https://www.google.com/maps?q=13.7563,100.5018",
    gps_latitude: 13.7563,
    gps_longitude: 100.5018,
    symptom: "",
  });
}

function futureNoGpsDraft(root) {
  root.state.updateDraft("urgent", {
    services: [
      root.services.createServiceLine({
        line_id: "no-gps",
        ac_type: "ผนัง",
        btu: 12000,
        machine_count: 1,
        wash_variant: "ล้างธรรมดา",
      }),
    ],
    customer_name: "ลูกค้าไม่ใช้ GPS",
    customer_phone: "0812345678",
    address_text: "กรุงเทพฯ",
    date: "2099-08-01",
    time: "13:45",
    allow_time_proposal: false,
    maps_url: "",
    symptom: "",
  });
}

test("default no-GPS urgent draft omits coordinates, hides the GPS review row, and is accepted by backend GPS validation", () => {
  const { root } = loadUrgent();
  futureNoGpsDraft(root);

  const payload = root.bookingUrgent._test.buildSubmitPayload();
  const reviewHtml = root.bookingUrgent._test.renderReview();
  const backendGps = urgentPublicAdapter.validateCustomerUrgentGps(
    payload.gps_latitude,
    payload.gps_longitude
  );

  assert.equal(Object.hasOwn(payload, "gps_latitude"), false);
  assert.equal(Object.hasOwn(payload, "gps_longitude"), false);
  assert.doesNotMatch(reviewHtml, /<strong>GPS<\/strong>|GPS\s*0\s*,\s*0/);
  assert.deepEqual(backendGps, { ok: true, latitude: null, longitude: null });
});

test("urgent flow has three customer steps, native date/time, multiple cleaning lines, and shared pricing", () => {
  const { root } = loadUrgent();
  futureDraft(root);
  root.state.setUrgentFlow({
    pricing: {
      status: "success",
      data: {
        active_price: 1800,
        duration_min: 150,
        price_lines: [{ line_total: 1000 }, { line_total: 800 }],
      },
      error: "",
    },
  });

  const serviceHtml = root.bookingUrgent._test.renderServicesStep();
  const detailsHtml = root.bookingUrgent._test.renderDetailsStep();
  const reviewHtml = root.bookingUrgent._test.renderReview();
  assert.match(serviceHtml, /ขั้นตอน 1 จาก 3|เพิ่มเครื่อง \/ เพิ่มรายการ|ราคารวมประมาณการ|1,800/);
  assert.match(detailsHtml, /ขั้นตอน 2 จาก 3|type="date"|type="time"|ใช้ตำแหน่งปัจจุบัน/);
  assert.match(reviewHtml, /ขั้นตอน 3 จาก 3|รายการที่ 1|รายการที่ 2|13:45|ต้องการตามเวลานี้|1,800/);
  assert.doesNotMatch(`${serviceHtml}\n${detailsHtml}\n${reviewHtml}`, /availability_v2|availability_calendar|เลือกคิวว่าง|ตัวตนช่าง/i);
});

test("urgent submit payload persists preferred time, preference, GPS, optional note, and all cleaning lines", () => {
  const { root } = loadUrgent();
  futureDraft(root);
  const payload = root.bookingUrgent._test.buildSubmitPayload();
  assert.equal(payload.appointment_datetime, "2099-08-01T13:45:00+07:00");
  assert.equal(payload.allow_time_proposal, false);
  assert.equal(payload.gps_latitude, 13.7563);
  assert.equal(payload.gps_longitude, 100.5018);
  assert.equal(payload.maps_url, "https://www.google.com/maps?q=13.7563,100.5018");
  assert.equal(payload.customer_note, "");
  assert.equal(payload.services.length, 2);
  assert.ok(payload.services.every((line) => line.job_type === "ล้าง" && !line.repair_variant));
});

test("urgent validation requires contact/date/time but allows an empty note and rejects a past time", () => {
  const { root } = loadUrgent();
  futureDraft(root);
  assert.equal(root.bookingUrgent._test.validateDetails(), "");
  root.state.updateDraft("urgent", { date: "" });
  assert.match(root.bookingUrgent._test.validateDetails(), /วันที่/);
  root.state.updateDraft("urgent", { date: "2000-01-01", time: "09:00" });
  assert.match(root.bookingUrgent._test.validateDetails(), /ย้อนหลัง/);
});

test("geolocation is user-triggered and handles success, denied, timeout, and unsupported browser in Thai", async () => {
  const { context, root } = loadUrgent();
  context.navigator.geolocation = {
    getCurrentPosition(success) {
      success({ coords: { latitude: 13.7563, longitude: 100.5018 } });
    },
  };
  assert.equal(await root.bookingUrgent._test.requestCurrentLocation(), true);
  assert.equal(root.state.draft.urgent.maps_url, "https://www.google.com/maps?q=13.7563,100.5018");
  assert.match(root.state.urgentFlow.locationMessage, /สำเร็จ/);

  for (const [code, expected] of [[1, /ปฏิเสธสิทธิ์/], [3, /หมดเวลา/]]) {
    context.navigator.geolocation = { getCurrentPosition(_success, failure) { failure({ code }); } };
    assert.equal(await root.bookingUrgent._test.requestCurrentLocation(), false);
    assert.match(root.state.urgentFlow.locationMessage, expected);
  }
  delete context.navigator.geolocation;
  assert.equal(await root.bookingUrgent._test.requestCurrentLocation(), false);
  assert.match(root.state.urgentFlow.locationMessage, /ไม่รองรับ/);
});

test("urgent runtime never calls availability/calendar APIs and API boundary preserves safe urgent fields", async () => {
  const urgentSource = read("customer-app/modules/bookingUrgent.js");
  assert.doesNotMatch(urgentSource, /loadAvailability|loadAvailabilityCalendar|availability_v2|availability_calendar/);

  const context = makeContext();
  const calls = [];
  context.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, async text() { return JSON.stringify({ success: true }); } };
  };
  vm.runInContext(read("customer-app/modules/api.js"), context, { filename: "customer-app/modules/api.js" });
  await context.window.CWFCustomerAppV2.api.submitUrgentRequest({
    appointment_datetime: "2099-08-01T13:45:00+07:00",
    allow_time_proposal: true,
    gps_latitude: 13.7563,
    gps_longitude: 100.5018,
    services: [{ job_type: "ซ่อม", repair_variant: "ตรวจอาการ" }],
  });
  assert.equal(calls.length, 1);
  assert.match(String(calls[0].url), /\/public\/book$/);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.allow_time_proposal, true);
  assert.equal(body.gps_latitude, 13.7563);
  assert.equal(body.gps_longitude, 100.5018);
  assert.equal(body.services[0].job_type, "ล้าง");
  assert.equal(body.services[0].repair_variant, "");
  assert.equal(Object.hasOwn(body, "dispatch_mode"), false);
});

test("Existing Admin Review/Edit displays urgent preferred time, preference, address, map, GPS, and note", () => {
  const runtime = read("admin-review-v2.js");
  const template = read("admin-review-v2.html");
  for (const field of ["appointment_datetime", "allow_time_proposal", "address_text", "maps_url", "gps_latitude", "gps_longitude", "customer_note"]) {
    assert.match(runtime, new RegExp(field));
  }
  assert.match(runtime, /ต้องการตามเวลานี้|เสนอเวลาใหม่ได้/);
  assert.match(template, /mTimePreference/);
});

function backendValidationService() {
  let databaseTouched = false;
  const service = createBookingJobService({
    pool: {
      async connect() { databaseTouched = true; throw new Error("database must not be touched"); },
      async query() { databaseTouched = true; throw new Error("database must not be touched"); },
    },
    urgentPublicAdapter,
    isServiceZoneFilterEnabled: () => false,
    isCustomerScheduledBookingEnabled: () => true,
    resolveCustomerUrgentCapability: async () => ({ enabled: true, degraded: false }),
  });
  return { service, touched: () => databaseTouched };
}

async function invokeInvalidUrgent(body) {
  const { service, touched } = backendValidationService();
  const req = { body: {
    customer_name: "ลูกค้าทดสอบ",
    customer_phone: "0812345678",
    address_text: "กรุงเทพฯ",
    job_type: "ล้าง",
    booking_mode: "urgent",
    urgent_request_key: "urgent-validation-key-0001",
    appointment_datetime: "2099-08-01T13:45:00+07:00",
    allow_time_proposal: false,
    services: [{ job_type: "ล้าง", ac_type: "ผนัง", btu: 12000, machine_count: 1 }],
    ...body,
  } };
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return payload; },
  };
  await service.handlePublicBook(req, res);
  return { res, touched: touched() };
}

test("backend rejects past appointment and partial/invalid/out-of-range/zero GPS before DB mutation", async () => {
  const past = await invokeInvalidUrgent({ appointment_datetime: "2000-01-01T09:00:00+07:00" });
  assert.equal(past.res.statusCode, 409);
  assert.equal(past.res.body.code, "APPOINTMENT_IN_PAST");
  assert.equal(past.touched, false);

  for (const patch of [
    { gps_latitude: 13.7 },
    { gps_longitude: 100.5 },
    { gps_latitude: "abc", gps_longitude: 100.5 },
    { gps_latitude: "NaN", gps_longitude: 100.5 },
    { gps_latitude: 91, gps_longitude: 100.5 },
    { gps_latitude: 13.7, gps_longitude: 181 },
    { gps_latitude: 0, gps_longitude: 0 },
  ]) {
    const result = await invokeInvalidUrgent(patch);
    assert.equal(result.res.statusCode, 400, JSON.stringify(patch));
    assert.equal(result.res.body.code, "INVALID_GPS", JSON.stringify(patch));
    assert.equal(result.touched, false, JSON.stringify(patch));
  }
});
