"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const TRACKING_SOURCE = fs.readFileSync(path.join(ROOT, "customer-app/modules/tracking.js"), "utf8");
const CSS_SOURCE = fs.readFileSync(path.join(ROOT, "customer-app/assets/customer-app.css"), "utf8");

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function loadTrackingRuntime() {
  const app = {
    state: {
      tracking: { status: "idle", data: null, error: "" },
      draft: { tracking: { trackingCode: "" } },
      setTracking(patch) { this.tracking = { ...this.tracking, ...patch }; },
      updateDraft() {},
    },
    utils: {
      escapeHtml,
      formatDateTime: (value) => value ? `DATE:${value}` : "-",
      formatBaht: (value) => `${Number(value) || 0} บาท`,
      stateBox: (status, message) => `<div class="${escapeHtml(status)}">${escapeHtml(message)}</div>`,
      timeline: (items) => items.map((item) => `<div>${escapeHtml(item.title)}:${escapeHtml(item.copy)}</div>`).join(""),
    },
    api: { getApiBase: () => "https://example.test" },
  };
  const sandbox = {
    window: {
      CWFCustomerAppV2: app,
      location: { origin: "https://example.test", href: "https://example.test/customer-app/#tracking" },
      open() {},
    },
    navigator: { clipboard: { writeText: async () => {} } },
    URL,
    console: { info() {}, warn() {}, error() {} },
    FormData,
    fetch: async () => { throw new Error("unexpected fetch"); },
    setTimeout,
    clearTimeout,
    Date,
  };
  vm.runInNewContext(TRACKING_SOURCE, sandbox, { filename: "tracking.js" });
  return app;
}

function codeReadPayload() {
  return {
    access_level: "code",
    can_view_full_tracking: true,
    can_use_token_actions: false,
    capabilities: {
      can_view_full_tracking: true,
      can_use_token_actions: false,
      can_view_documents: false,
      can_submit_review: false,
    },
    booking_code: "CWFABC1234",
    customer_name: "คุณลูกค้า",
    customer_phone: "0812345678",
    address_text: "99/1 ถนนสุขุมวิท กรุงเทพฯ",
    maps_url: "https://maps.google.com/?q=13.7,100.6",
    job_type: "ล้างแอร์",
    job_status: "รอดำเนินการ",
    booking_mode: "scheduled",
    appointment_datetime: "2026-07-15T09:00:00+07:00",
    duration_min: 90,
    job_price: 1200,
    payment_status: "unpaid",
    service_items: [{ item_name: "ล้างแอร์เปลือยใต้ฝ้า", qty: 1, unit_price: 1200, line_total: 1200 }],
    technician: { full_name: "ช่างสมชาย", phone: "0899999999", grade: "A" },
    technician_team: [],
    photos: [],
    units: [],
    review: { already_reviewed: false },
    catalog_review: { eligible: false, already_reviewed: false, review: null },
  };
}

function completedHealthPayload(overrides = {}) {
  return {
    ...codeReadPayload(),
    job_status: "เสร็จแล้ว",
    finished_at: "2026-07-15T11:00:00+07:00",
    units: [{
      unit_no: 1,
      unit_code: "AC-01",
      label: "เครื่องที่ 1 / ห้องนอน",
      ac_type: "ผนัง",
      btu: 18000,
      service_type: "ล้างปกติ",
      checklist_summary: {
        pre_completed: true,
        post_completed: true,
        issue_count: 0,
        post_issue_count: 0,
        metric_statuses: {
          refrigerant: "normal",
          cooling: "normal",
          airflow: "normal",
          drain: "normal",
        },
      },
      photos: [
        { url: "https://example.test/pressure.jpg", phase: "pressure" },
        { url: "https://example.test/temp.jpg", phase: "temp" },
      ],
    }],
    ...overrides,
  };
}

const FORBIDDEN_HEALTH_COPY = [
  "รอข้อมูลประเมิน",
  "ไม่มีค่าวัด",
  "ยังไม่มีข้อมูลวัดจริง",
  "ยังไม่มีค่าที่วัดจริง",
  "ค่า PSI จะแสดงเมื่อช่างบันทึก",
  "จะแสดงค่าตัวเลขเมื่อ",
  "ยังไม่มี delta T",
  "ไม่ใช่ค่าที่วัดด้วยเกจ",
  "ไม่ใช่ค่า Delta T",
  "ไม่ใช่ค่าที่วัดด้วยเครื่องมือ",
  "ประเมินจากเช็คลิสต์ ยังไม่มีค่าที่ช่างวัดเป็นตัวเลข",
  "ไม่รวมค่าน้ำยาและอุณหภูมิ เพราะยังไม่มีค่าที่วัดจริง",
  "REFRIGERANT / PSI",
  "TEMPERATURE",
];

test("completed normal checklist renders one compact green inspection grid without empty measurements", () => {
  const app = loadTrackingRuntime();
  const html = app.tracking._test.renderPassport(completedHealthPayload());
  assert.equal((html.match(/unit-inspection-item is-good/g) || []).length, 4);
  assert.match(html, /ระบบน้ำยา/);
  assert.match(html, /ความเย็น/);
  assert.match(html, /แรงลม/);
  assert.match(html, /ระบบน้ำทิ้ง/);
  assert.equal((html.match(/ผลตรวจหลังบริการ/g) || []).length, 1);
  assert.doesNotMatch(html, /data-unit-measurements/);
  assert.doesNotMatch(html, /passport-muted-card/);
  for (const copy of FORBIDDEN_HEALTH_COPY) assert.doesNotMatch(html, new RegExp(copy));
  assert.ok(html.indexOf("passport-units-card") < html.indexOf("passport-warranty-card"));
});

test("wall next-service guidance follows deterministic elapsed-day bands", () => {
  const app = loadTrackingRuntime();
  const data = completedHealthPayload();
  const profile = app.tracking._test.serviceProfile(data);
  const cases = [
    [60, /ยังไม่ถึงรอบล้าง/, /ล้างธรรมดา.*4–5 เดือน/],
    [150, /ล้างธรรมดา/, /4–5 เดือน/],
    [210, /ล้างพรีเมียม/, /6–8 เดือน/],
    [300, /ประเมินล้างแขวนคอยล์/, /9–12 เดือน/],
    [390, /ประเมินล้างแขวนคอยล์หรือตัดล้าง/, /ไม่ฟันธงจากเวลา/],
  ];
  for (const [elapsedDays, label, reason] of cases) {
    const guidance = app.tracking._test.nextServiceGuidance(data, data.units[0], profile, { elapsedDays });
    assert.match(guidance.label, label, `${elapsedDays} days`);
    assert.match(guidance.reason, reason, `${elapsedDays} days`);
  }
  const html = app.tracking._test.renderNextServiceGuidance(
    app.tracking._test.nextServiceGuidance(data, data.units[0], profile, { elapsedDays: 150 }),
  );
  assert.match(html, /คำแนะนำเบื้องต้น ควรพิจารณาอาการจริงร่วมด้วย/);
});

test("non-wall and missing-date next-service guidance fail closed", () => {
  const app = loadTrackingRuntime();
  const data = completedHealthPayload();
  const profile = app.tracking._test.serviceProfile(data);
  for (const acType of ["สี่ทิศทาง", "แขวน", "เปลือยใต้ฝ้า", "ไม่ทราบ"] ) {
    const unit = { ...data.units[0], ac_type: acType };
    const guidance = app.tracking._test.nextServiceGuidance(data, unit, profile, { elapsedDays: 300 });
    assert.match(guidance.reason, /ล้างให้ตรงชนิดเครื่องและให้ทีมประเมินรูปแบบหน้างาน/);
    assert.doesNotMatch(`${guidance.label} ${guidance.reason}`, /ล้างพรีเมียม|แขวนคอยล์|ตัดล้าง/);
  }
  const missing = app.tracking._test.nextServiceGuidance(data, data.units[0], profile, { elapsedDays: null });
  assert.equal(missing.tone, "neutral");
  assert.match(missing.reason, /ยังไม่มีวันที่จบงานนี้สำหรับประเมินรอบบริการครั้งถัดไป/);
});

test("cooling and refrigerant issues recommend repair-first without using raw notes", () => {
  const app = loadTrackingRuntime();
  for (const key of ["cooling", "refrigerant"]) {
    const data = completedHealthPayload();
    data.technician_note = "ข้อความภายในที่ต้องไม่ใช้วินิจฉัย";
    data.units[0].checklist_summary.post_issue_count = 1;
    data.units[0].checklist_summary.metric_statuses = { refrigerant: null, cooling: null, airflow: null, drain: null, [key]: "issue" };
    const profile = app.tracking._test.serviceProfile(data);
    const guidance = app.tracking._test.nextServiceGuidance(data, data.units[0], profile, { elapsedDays: 150 });
    assert.equal(guidance.tone, "repair");
    assert.match(guidance.label, /ตรวจเช็คระบบก่อน/);
    assert.doesNotMatch(guidance.label, /ล้างธรรมดา/);
    assert.doesNotMatch(JSON.stringify(guidance), /ข้อความภายใน/);
  }
});

test("drain airflow and unclassified issues use cautious customer-safe guidance", () => {
  const app = loadTrackingRuntime();
  const cases = [
    ["drain", /ระบบน้ำทิ้ง/],
    ["airflow", /ตรวจสภาพก่อนเลือกล้าง/],
  ];
  for (const [key, expected] of cases) {
    const data = completedHealthPayload();
    data.units[0].checklist_summary.post_issue_count = 1;
    data.units[0].checklist_summary.metric_statuses = { refrigerant: null, cooling: null, airflow: null, drain: null, [key]: "issue" };
    const guidance = app.tracking._test.nextServiceGuidance(data, data.units[0], app.tracking._test.serviceProfile(data), { elapsedDays: 300 });
    assert.equal(guidance.tone, "watch");
    assert.match(`${guidance.label} ${guidance.reason}`, expected);
    if (key === "drain") assert.doesNotMatch(guidance.label, /แขวนคอยล์/);
  }
  const unknown = completedHealthPayload();
  unknown.units[0].checklist_summary.post_issue_count = 1;
  unknown.units[0].checklist_summary.metric_statuses = { refrigerant: null, cooling: null, airflow: null, drain: null };
  const guidance = app.tracking._test.nextServiceGuidance(unknown, unknown.units[0], app.tracking._test.serviceProfile(unknown), null);
  assert.equal(guidance.tone, "neutral");
  assert.match(guidance.label, /ให้ทีมประเมินอาการ/);
});

test("Health Passport renders finite motion hooks while warranty and capability gates remain intact", () => {
  const app = loadTrackingRuntime();
  const html = app.tracking._test.renderPassport(completedHealthPayload());
  assert.match(html, /passport-shell has-health-motion/);
  assert.match(html, /data-health-motion/);
  assert.match(html, /data-health-reveal/);
  assert.match(html, /data-next-service-guidance/);
  assert.match(html, /passport-warranty-card/);
  assert.match(CSS_SOURCE, /@keyframes health-ring-sweep/);
  assert.match(CSS_SOURCE, /@keyframes health-item-in/);
  assert.match(CSS_SOURCE, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(TRACKING_SOURCE, /setInterval\s*\(/);
});

test("cleanliness recommendation is deterministic from last-cleaned date and score", () => {
  const app = loadTrackingRuntime();
  const now = Date.parse("2026-07-31T00:00:00Z");
  const cleanProfile = app.tracking._test.serviceProfile({ job_type: "ล้าง", service_summary: "ล้างปกติ" });
  const recent = app.tracking._test.cleanlinessRecommendation("2026-07-01T00:00:00Z", 95, cleanProfile, now);
  assert.equal(recent.elapsedDays, 30);
  assert.equal(recent.tone, "excellent");
  assert.equal(recent.status, "สะอาดมาก");
  assert.match(recent.recommendation, /พร้อมใช้งาน/);
  assert.doesNotMatch(recent.recommendation, /ควรล้าง/);
  assert.match(recent.nextText, /4-6 เดือน/);

  const approaching = app.tracking._test.cleanlinessRecommendation("2026-03-25T00:00:00Z", 72, cleanProfile, now);
  assert.equal(approaching.tone, "watch");
  assert.equal(approaching.status, "ใกล้ถึงรอบล้าง");

  const overdueDespiteHighScore = app.tracking._test.cleanlinessRecommendation("2026-02-21T00:00:00Z", 99, cleanProfile, now);
  assert.equal(overdueDespiteHighScore.tone, "due");
  assert.equal(overdueDespiteHighScore.status, "ควรล้าง");
  assert.match(overdueDespiteHighScore.recommendation, /แนะนำล้าง/);
});

test("missing last-clean date is honest and a low score never recommends immediate recleaning", () => {
  const app = loadTrackingRuntime();
  const now = Date.parse("2026-07-31T00:00:00Z");
  const cleanProfile = app.tracking._test.serviceProfile({ job_type: "ล้าง", service_summary: "ล้างปกติ" });
  const missing = app.tracking._test.cleanlinessRecommendation(null, 99, cleanProfile, now);
  assert.equal(missing.tone, "unknown");
  assert.equal(missing.score, null);
  assert.match(missing.recommendation, /ยังไม่มีวันที่จบงานนี้/);
  assert.doesNotMatch(missing.recommendation, /สะอาดมาก|ควรล้าง/);

  const justCleanedLowScore = app.tracking._test.cleanlinessRecommendation("2026-07-30T00:00:00Z", 30, cleanProfile, now);
  assert.equal(justCleanedLowScore.tone, "watch");
  assert.equal(justCleanedLowScore.status, "ควรติดตามสภาพ");
  assert.doesNotMatch(justCleanedLowScore.recommendation, /ควรล้าง/);

  const olderLowScore = app.tracking._test.cleanlinessRecommendation("2026-05-12T00:00:00Z", 30, cleanProfile, now);
  assert.equal(olderLowScore.tone, "watch");
  assert.notEqual(olderLowScore.status, "ควรล้าง");
});

test("cleanliness cycles follow normal premium deep and heavy service profiles", () => {
  const app = loadTrackingRuntime();
  const now = Date.parse("2026-07-31T00:00:00Z");
  const atDays = (days) => new Date(now - (days * 86400000)).toISOString();
  const profiles = {
    clean: app.tracking._test.serviceProfile({ job_type: "ล้าง", service_summary: "ล้างปกติ" }),
    premium: app.tracking._test.serviceProfile({ job_type: "ล้าง", service_summary: "ล้างพรีเมียม" }),
    deep: app.tracking._test.serviceProfile({ job_type: "ล้าง", service_summary: "ล้างลึก แขวนคอยล์" }),
    heavy: app.tracking._test.serviceProfile({ job_type: "ล้าง", service_summary: "ตัดล้างใหญ่" }),
  };

  const at160 = Object.fromEntries(Object.entries(profiles).map(([key, profile]) => [
    key,
    app.tracking._test.cleanlinessRecommendation(atDays(160), 99, profile, now),
  ]));
  assert.equal(at160.clean.tone, "due");
  assert.equal(at160.premium.tone, "watch");
  assert.equal(at160.deep.tone, "watch");
  assert.equal(at160.heavy.tone, "good");
  assert.deepEqual(
    [at160.clean.cycleDays, at160.premium.cycleDays, at160.deep.cycleDays, at160.heavy.cycleDays],
    [152, 183, 213, 304],
  );
  assert.match(at160.clean.nextText, /4-6 เดือน/);
  assert.match(at160.premium.nextText, /5-6 เดือน/);
  assert.match(at160.deep.nextText, /6-8 เดือน/);
  assert.match(at160.heavy.nextText, /8-12 เดือน/);

  const heavyAtCycle = app.tracking._test.cleanlinessRecommendation(atDays(304), 99, profiles.heavy, now);
  const heavyAfterCycle = app.tracking._test.cleanlinessRecommendation(atDays(305), 99, profiles.heavy, now);
  assert.notEqual(heavyAtCycle.tone, "due");
  assert.equal(heavyAfterCycle.tone, "due");
  assert.equal(app.tracking._test.cleanlinessRecommendation(atDays(184), 99, profiles.premium, now).tone, "due");
  assert.notEqual(app.tracking._test.cleanlinessRecommendation(atDays(184), 99, profiles.deep, now).tone, "due");
});

test("cleanliness profile boundaries are deterministic at 30, 60 and 100 percent", () => {
  const app = loadTrackingRuntime();
  const now = Date.parse("2026-07-31T00:00:00Z");
  const atDays = (days) => new Date(now - (days * 86400000)).toISOString();
  const profile = app.tracking._test.serviceProfile({ job_type: "ล้าง", service_summary: "ล้างปกติ" });
  const reference = app.tracking._test.cleanlinessRecommendation(atDays(0), 100, profile, now);
  assert.deepEqual(
    [reference.excellentMaxDays, reference.goodMaxDays, reference.cycleDays],
    [45, 91, 152],
  );
  const cases = [
    [45, "excellent"],
    [46, "good"],
    [91, "good"],
    [92, "watch"],
    [152, "watch"],
    [153, "due"],
  ];
  for (const [days, tone] of cases) {
    assert.equal(app.tracking._test.cleanlinessRecommendation(atDays(days), 100, profile, now).tone, tone, `${days} days`);
  }
  assert.equal(app.tracking._test.cleanlinessRecommendation(atDays(153), 100, profile, now).tone, "due");
});

test("completed cleaning renders one prominent donut with date elapsed time and recommendation", () => {
  const app = loadTrackingRuntime();
  const html = app.tracking._test.renderPassport(completedHealthPayload());
  assert.equal((html.match(/data-unit-cleanliness/g) || []).length, 1);
  assert.match(html, /class="cleanliness-ring"/);
  assert.match(html, />100%<|>99%</);
  assert.match(html, /ประมาณการความสะอาดจากงานนี้/);
  assert.match(html, /วันที่ล้างของงานนี้/);
  assert.match(html, /ผ่านมาแล้ว/);
  assert.match(html, /ยังอยู่ในสภาพพร้อมใช้งาน/);
  assert.match(html, /อ้างอิงจากวันที่จบงานนี้และประเภทบริการ/);
  assert.match(html, /4-6 เดือน/);
  assert.doesNotMatch(html, /ล้างล่าสุด|วันที่ล้างล่าสุด|สภาพความสะอาดปัจจุบัน/);
  assert.doesNotMatch(html, /unit-condition-summary/);
  assert.doesNotMatch(html, /passport-recommend-card/);
  assert.ok(html.indexOf("unit-inspection-grid") < html.indexOf("data-unit-cleanliness"));
  assert.ok(html.indexOf("data-unit-cleanliness") < html.indexOf("data-unit-evidence"));
  assert.ok(html.indexOf("passport-units-card") < html.indexOf("passport-warranty-card"));
});

test("completed cleaning without finished_at renders a neutral donut fallback without a fake score", () => {
  const app = loadTrackingRuntime();
  const data = completedHealthPayload({ finished_at: null, job_status: "เสร็จแล้ว" });
  const html = app.tracking._test.renderPassport(data);
  assert.match(html, /data-unit-cleanliness/);
  assert.match(html, /ยังประเมินรอบล้างไม่ได้/);
  assert.match(html, /ยังไม่มีวันที่จบงานนี้/);
  assert.doesNotMatch(html, /ล้างล่าสุด|วันที่ล้างล่าสุด|สภาพความสะอาดปัจจุบัน/);
  assert.doesNotMatch(html, /อ้างอิงจากวันที่จบงานนี้และประเภทบริการ/);
  assert.match(html, />--</);
  assert.doesNotMatch(html, />99%|>100%/);
});

test("pressure and temperature photos remain secondary evidence and never override normal status", () => {
  const app = loadTrackingRuntime();
  const html = app.tracking._test.renderPassport(completedHealthPayload());
  assert.equal((html.match(/unit-inspection-item is-good/g) || []).length, 4);
  assert.match(html, /รูปตรวจเพิ่มเติม 2/);
  assert.doesNotMatch(html, /data-unit-measurements/);
});

test("a classified issue warns only its metric while unconfirmed metrics remain neutral", () => {
  const app = loadTrackingRuntime();
  const data = completedHealthPayload();
  data.units[0].checklist_summary = {
    pre_completed: true,
    post_completed: true,
    issue_count: 1,
    post_issue_count: 1,
    metric_statuses: { refrigerant: null, cooling: "issue", airflow: null, drain: null },
  };
  const html = app.tracking._test.renderPassport(data);
  assert.equal((html.match(/unit-inspection-item is-issue/g) || []).length, 1);
  assert.equal((html.match(/unit-inspection-item/g) || []).length, 1);
  assert.match(html, /data-metric="cooling"[\s\S]*?ควรตรวจเพิ่มเติม/);
  assert.doesNotMatch(html, /data-metric="(?:refrigerant|airflow|drain)"/);
  assert.doesNotMatch(html, /ไม่มีข้อมูลแสดง/);
});

test("known cooling issue plus normal drain renders only those two metrics", () => {
  const app = loadTrackingRuntime();
  const data = completedHealthPayload();
  data.units[0].checklist_summary = {
    pre_completed: true,
    post_completed: true,
    issue_count: 1,
    post_issue_count: 1,
    metric_statuses: { refrigerant: null, cooling: "issue", airflow: null, drain: "normal" },
  };
  const html = app.tracking._test.renderPassport(data);
  assert.equal((html.match(/unit-inspection-item/g) || []).length, 2);
  assert.match(html, /data-metric="cooling"/);
  assert.match(html, /data-metric="drain"/);
  assert.doesNotMatch(html, /data-metric="(?:refrigerant|airflow)"/);
});

test("three known metrics render three cards without a placeholder fourth card", () => {
  const app = loadTrackingRuntime();
  const data = completedHealthPayload();
  data.units[0].checklist_summary = {
    pre_completed: true,
    post_completed: true,
    issue_count: 1,
    post_issue_count: 1,
    metric_statuses: { refrigerant: "normal", cooling: "issue", airflow: null, drain: "normal" },
  };
  const html = app.tracking._test.renderPassport(data);
  assert.equal((html.match(/unit-inspection-item/g) || []).length, 3);
  assert.doesNotMatch(html, /data-metric="airflow"/);
  assert.doesNotMatch(html, /ไม่มีข้อมูลแสดง/);
});

test("unknown completed issue uses one neutral summary instead of four no-data cards", () => {
  const app = loadTrackingRuntime();
  const data = completedHealthPayload();
  data.units[0].checklist_summary = {
    pre_completed: true,
    post_completed: true,
    issue_count: 1,
    post_issue_count: 1,
    metric_statuses: { refrigerant: null, cooling: null, airflow: null, drain: null },
  };
  const html = app.tracking._test.renderPassport(data);
  assert.doesNotMatch(html, /unit-inspection-item/);
  assert.equal((html.match(/ไม่มีข้อมูลแสดงในรายงานส่วนนี้/g) || []).length, 1);
});

test("pre-service issue cannot warn a completed clean after-service report or evidence", () => {
  const app = loadTrackingRuntime();
  const data = completedHealthPayload();
  data.units[0].checklist_summary = {
    pre_completed: true,
    post_completed: true,
    issue_count: 1,
    post_issue_count: 0,
    metric_statuses: { refrigerant: "normal", cooling: "normal", airflow: "normal", drain: "normal" },
  };
  const html = app.tracking._test.renderPassport(data);
  assert.match(html, /unit-overall-pill is-good">ปกติ/);
  assert.match(html, /ตรวจครบแล้ว · ไม่พบรายการผิดปกติ/);
  assert.doesNotMatch(html, /พบ 1 รายการที่ควรติดตาม/);
});

test("structured numeric measurements render only when finite values actually exist", () => {
  const app = loadTrackingRuntime();
  assert.deepEqual(
    JSON.parse(JSON.stringify(app.tracking._test.structuredMeasurements({ measurements: {} }))),
    [],
  );
  const values = app.tracking._test.structuredMeasurements({
    measurements: { refrigerant_psi: 135, supply_air_c: 12, return_air_c: 27, delta_t_c: 15 },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(values.map((item) => [item.key, item.value]))), [
    ["refrigerant_psi", 135],
    ["supply_air_c", 12],
    ["return_air_c", 27],
    ["delta_t_c", 15],
  ]);
});

test("in-progress checklist without post completion stays neutral", () => {
  const app = loadTrackingRuntime();
  const data = completedHealthPayload({ job_status: "กำลังดำเนินการ", finished_at: null });
  data.units[0].checklist_summary = {
    pre_completed: true,
    post_completed: false,
    issue_count: 1,
    post_issue_count: 0,
    metric_statuses: { refrigerant: null, cooling: null, airflow: null, drain: null },
  };
  const html = app.tracking._test.renderPassport(data);
  assert.match(html, /กำลังตรวจสอบ/);
  assert.doesNotMatch(html, /unit-inspection-item is-good/);
});

test("code-only result renders full read details but no document or write controls", () => {
  const app = loadTrackingRuntime();
  app.state.tracking = { status: "success", data: codeReadPayload(), error: "" };
  const html = app.tracking._test.renderTrackingResult();
  assert.match(html, /CWFABC1234/);
  assert.match(html, /คุณลูกค้า/);
  assert.match(html, /0812345678/);
  assert.match(html, /99\/1 ถนนสุขุมวิท/);
  assert.match(html, /ล้างแอร์เปลือยใต้ฝ้า/);
  assert.match(html, /ช่างสมชาย/);
  assert.doesNotMatch(html, /open-eslip|data-review-form|data-catalog-review-form/);
  assert.doesNotMatch(html, /booking_token|\/docs\/receipt|\/docs\/quote|\/docs\/eslip/);
  assert.doesNotMatch(html, />undefined<|>null</);
  assert.equal(app.tracking._test.receiptUrl(codeReadPayload()), "");
});

test("exact-token capability retains document and review behavior", () => {
  const app = loadTrackingRuntime();
  const data = {
    ...codeReadPayload(),
    access_level: "token",
    can_use_token_actions: true,
    capabilities: { can_view_full_tracking: true, can_use_token_actions: true },
    booking_token: "private-token",
    job_id: 88,
    job_status: "เสร็จแล้ว",
    finished_at: "2026-07-15T11:00:00+07:00",
    receipt_url: "/docs/receipt/88?key=private-token",
    catalog_review: null,
  };
  assert.match(app.tracking._test.receiptUrl(data), /\/docs\/receipt\/88\?key=private-token/);
  assert.match(app.tracking._test.renderReview(data), /data-review-token/);
});

test("canceled jobs render a terminal canceled hero and timeline", () => {
  const app = loadTrackingRuntime();
  const data = {
    ...codeReadPayload(),
    canceled_at: "2026-07-14T08:30:00+07:00",
    cancel_reason: "ลูกค้าแจ้งยกเลิกนัด",
  };
  app.state.tracking = { status: "success", data, error: "" };
  const html = app.tracking._test.renderTrackingResult();
  const timeline = app.tracking._test.renderTimeline();
  assert.match(html, /งานนี้ถูกยกเลิกแล้ว/);
  assert.match(html, /ลูกค้าแจ้งยกเลิกนัด/);
  assert.match(timeline, /งานถูกยกเลิก/);
  assert.match(timeline, /ลูกค้าแจ้งยกเลิกนัด/);
  assert.doesNotMatch(timeline, /ช่างกำลังเดินทาง|ถึงหน้างาน|เริ่มให้บริการ|งานเสร็จแล้ว/);
  assert.equal(app.tracking._test.jobPhase(data, "scheduled"), "canceled");
});

test("a canceled status is terminal even when canceled_at is absent", () => {
  const app = loadTrackingRuntime();
  const data = { ...codeReadPayload(), job_status: "ยกเลิก", canceled_at: null };
  app.state.tracking = { status: "success", data, error: "" };
  assert.equal(app.tracking._test.isCanceled(data), true);
  assert.match(app.tracking._test.renderTimeline(), /งานถูกยกเลิก/);
  assert.doesNotMatch(app.tracking._test.renderTimeline(), /รอทีมช่าง|ช่างกำลังเดินทาง/);
});

test("booking-code full read shows real technician assignment in timeline", () => {
  const app = loadTrackingRuntime();
  const data = codeReadPayload();
  app.state.tracking = { status: "success", data, error: "" };
  const timeline = app.tracking._test.renderTimeline();
  assert.match(timeline, /ยืนยันคิวและมอบหมายทีม/);
  assert.match(timeline, /มีทีมดูแลงานนี้แล้ว/);
  assert.equal(app.tracking._test.canViewDetails(data), true);
  assert.equal(app.tracking._test.canUseTokenActions(data), false);
});

test("completed copy follows read versus privileged-action capability", () => {
  const app = loadTrackingRuntime();
  const codeData = {
    ...codeReadPayload(),
    job_status: "เสร็จแล้ว",
    finished_at: "2026-07-15T11:00:00+07:00",
    photos: [{ url: "https://example.test/after.jpg", phase: "after" }],
  };
  app.state.tracking = { status: "success", data: codeData, error: "" };
  const codeHtml = app.tracking._test.renderTrackingResult();
  assert.match(codeHtml, /ดูรูปงาน สรุปงาน และรายละเอียด/);
  assert.doesNotMatch(codeHtml, />เอกสาร<|รีวิว\/ประกัน|ดูรูปงาน เอกสาร|ดูเอกสาร/);

  const tokenData = {
    ...codeData,
    access_level: "token",
    can_use_token_actions: true,
    capabilities: { can_view_full_tracking: true, can_use_token_actions: true },
    booking_token: "private-token",
    job_id: 88,
    receipt_url: "/docs/receipt/88?key=private-token",
  };
  app.state.tracking = { status: "success", data: tokenData, error: "" };
  const tokenHtml = app.tracking._test.renderTrackingResult();
  assert.match(tokenHtml, />หลังบริการ</);
  assert.match(tokenHtml, /เอกสารและรีวิว/);
});

function assertNoPrivilegedAftercare(html) {
  assert.doesNotMatch(html, /booking_token|\/docs\/receipt|\/docs\/quote|\/docs\/eslip/);
  assert.doesNotMatch(html, /data-review-form|data-catalog-review-form|open-eslip/);
  assert.doesNotMatch(html, /ให้คะแนนงานนี้|ส่งรีวิว/);
}

test("code-only completed shows existing technician review and warranty read-only", () => {
  const app = loadTrackingRuntime();
  const data = {
    ...codeReadPayload(),
    job_status: "เสร็จแล้ว",
    finished_at: "2026-07-15T11:00:00+07:00",
    review: {
      already_reviewed: true,
      rating: 4,
      review_text: "ช่างตรงเวลาและทำงานเรียบร้อย",
      complaint_text: "ขอให้โทรก่อนเข้าหน้างาน",
      reviewed_at: "2026-07-15T12:00:00+07:00",
    },
  };
  app.state.tracking = { status: "success", data, error: "" };
  const html = app.tracking._test.renderTrackingResult();
  assert.match(html, />หลังบริการ</);
  assert.match(html, /รีวิวทีมช่าง/);
  assert.match(html, /4 \/ 5/);
  assert.match(html, /ช่างตรงเวลาและทำงานเรียบร้อย/);
  assert.match(html, /ขอให้โทรก่อนเข้าหน้างาน/);
  assert.match(html, /DATE:2026-07-15T12:00:00\+07:00/);
  assert.match(html, /เงื่อนไขรับประกัน/);
  assertNoPrivilegedAftercare(html);
});

test("code-only completed shows existing catalog review and warranty read-only", () => {
  const app = loadTrackingRuntime();
  const data = {
    ...codeReadPayload(),
    job_status: "เสร็จแล้ว",
    finished_at: "2026-07-15T11:00:00+07:00",
    catalog_review: {
      eligible: false,
      already_reviewed: true,
      review: {
        rating: 5,
        comment: "บริการล้างละเอียดมาก",
        moderation_status: "approved",
        created_at: "2026-07-15T12:30:00+07:00",
      },
    },
  };
  app.state.tracking = { status: "success", data, error: "" };
  const html = app.tracking._test.renderTrackingResult();
  assert.match(html, /รีวิวบริการนี้/);
  assert.match(html, /5 \/ 5/);
  assert.match(html, /บริการล้างละเอียดมาก/);
  assert.match(html, /เผยแพร่แล้ว/);
  assert.match(html, /DATE:2026-07-15T12:30:00\+07:00/);
  assert.match(html, /เงื่อนไขรับประกัน/);
  assertNoPrivilegedAftercare(html);
});

test("code-only completed preserves both existing review summaries", () => {
  const app = loadTrackingRuntime();
  const data = {
    ...codeReadPayload(),
    job_status: "เสร็จแล้ว",
    finished_at: "2026-07-15T11:00:00+07:00",
    review: { already_reviewed: true, rating: 4, review_text: "รีวิวทีมช่าง" },
    catalog_review: {
      eligible: false,
      already_reviewed: true,
      review: { rating: 5, comment: "รีวิวตัวบริการ", moderation_status: "pending" },
    },
  };
  app.state.tracking = { status: "success", data, error: "" };
  const html = app.tracking._test.renderTrackingResult();
  assert.match(html, /รีวิวทีมช่าง/);
  assert.match(html, /รีวิวตัวบริการ/);
  assert.match(html, /รอตรวจสอบ/);
  assertNoPrivilegedAftercare(html);
});

test("code-only completed with no review still shows warranty without review invitation", () => {
  const app = loadTrackingRuntime();
  const data = {
    ...codeReadPayload(),
    job_status: "เสร็จแล้ว",
    finished_at: "2026-07-15T11:00:00+07:00",
  };
  app.state.tracking = { status: "success", data, error: "" };
  const html = app.tracking._test.renderTrackingResult();
  assert.match(html, />หลังบริการ</);
  assert.match(html, /เงื่อนไขรับประกัน/);
  assertNoPrivilegedAftercare(html);
});

test("token completed retains documents and one eligible write-review flow", () => {
  const app = loadTrackingRuntime();
  const data = {
    ...codeReadPayload(),
    access_level: "token",
    can_use_token_actions: true,
    capabilities: { can_view_full_tracking: true, can_use_token_actions: true },
    booking_token: "private-token",
    job_id: 88,
    job_status: "เสร็จแล้ว",
    finished_at: "2026-07-15T11:00:00+07:00",
    receipt_url: "/docs/receipt/88?key=private-token",
    catalog_review: { eligible: true, already_reviewed: false, review: null },
  };
  app.state.tracking = { status: "success", data, error: "" };
  const html = app.tracking._test.renderTrackingResult();
  assert.match(html, /data-action="open-eslip"/);
  assert.match(html, /data-catalog-review-form/);
  assert.doesNotMatch(html, /data-review-form/);
  assert.match(html, /เงื่อนไขรับประกัน/);
});

test("token completed with existing reviews shows both summaries and no duplicate form", () => {
  const app = loadTrackingRuntime();
  const data = {
    ...codeReadPayload(),
    access_level: "token",
    can_use_token_actions: true,
    capabilities: { can_view_full_tracking: true, can_use_token_actions: true },
    booking_token: "private-token",
    job_id: 88,
    job_status: "เสร็จแล้ว",
    finished_at: "2026-07-15T11:00:00+07:00",
    receipt_url: "/docs/receipt/88?key=private-token",
    review: { already_reviewed: true, rating: 4, review_text: "ทีมช่างดี" },
    catalog_review: {
      eligible: false,
      already_reviewed: true,
      review: { rating: 5, comment: "บริการดี", moderation_status: "approved" },
    },
  };
  app.state.tracking = { status: "success", data, error: "" };
  const html = app.tracking._test.renderTrackingResult();
  assert.match(html, /ทีมช่างดี/);
  assert.match(html, /บริการดี/);
  assert.match(html, /data-action="open-eslip"/);
  assert.doesNotMatch(html, /data-review-form|data-catalog-review-form/);
});

test("payment statuses are customer-facing Thai and unknown values are hidden", () => {
  const app = loadTrackingRuntime();
  assert.equal(app.tracking._test.paymentStatusLabel("unpaid"), "ยังไม่ชำระ");
  assert.equal(app.tracking._test.paymentStatusLabel("paid"), "ชำระแล้ว");
  assert.equal(app.tracking._test.paymentStatusLabel("partial"), "ชำระบางส่วน");
  assert.equal(app.tracking._test.paymentStatusLabel("pending"), "รอตรวจสอบการชำระ");
  assert.equal(app.tracking._test.paymentStatusLabel("provider_internal_state"), "กรุณาติดต่อ CWF เพื่อตรวจสอบการชำระ");
});

test("tracking UI exposes loading, not-found, rate-limit and offline states", () => {
  const app = loadTrackingRuntime();
  app.state.tracking = { status: "loading", data: null, error: "" };
  assert.match(app.tracking._test.renderTrackingResult(), /tracking-skeleton/);

  app.state.tracking = { status: "error", errorKind: "not-found", error: "not found" };
  assert.match(app.tracking._test.renderTrackingResult(), /ไม่พบงานนี้/);

  app.state.tracking = { status: "error", errorKind: "rate", retryAfter: 42 };
  assert.match(app.tracking._test.renderTrackingResult(), /42 วินาที/);

  app.state.tracking = { status: "error", errorKind: "network" };
  assert.match(app.tracking._test.renderTrackingResult(), /เชื่อมต่อระบบไม่ได้/);
  assert.match(app.tracking._test.renderTrackingResult(), /data-action="track-retry"/);
});

test("tracking assets share the full-read cache build id", () => {
  const build = "20260714_smart_advisor_compact_sheet_v1";
  for (const file of [
    "customer-app/index.html",
    "customer-app/sw.js",
    "customer-app/assets/customer-app.js",
    "customer-app/manifest.webmanifest",
  ]) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    assert.match(source, new RegExp(build), `${file} missing build id`);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, "customer-app/index.html"), "utf8"), /20260712_page_controls_tracking_link_v4/);
});

test("tracking API lookup is explicitly no-store", () => {
  const api = fs.readFileSync(path.join(ROOT, "customer-app/modules/api.js"), "utf8");
  assert.match(api, /requestJson\("\/public\/track", \{ query: \{ q \}, cache: "no-store" \}\)/);
});

test("tracking mobile CSS provides 360/390-safe wrapping and touch targets", () => {
  const css = fs.readFileSync(path.join(ROOT, "customer-app/assets/customer-app.css"), "utf8");
  assert.match(css, /@media \(max-width: 420px\)/);
  assert.match(css, /\.tracking-code-wrap \{[\s\S]*?min-width: 0/);
  assert.match(css, /\.tracking-copy-btn \{[\s\S]*?min-height: 44px/);
  assert.match(css, /\.tracking-code-pill \{[\s\S]*?overflow-wrap: anywhere/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.unit-inspection-grid \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.unit-inspection-item:last-child:nth-child\(odd\) \{[\s\S]*?grid-column: 1 \/ -1/);
  assert.match(css, /\.unit-inspection-item \{[\s\S]*?min-width: 0/);
  assert.match(css, /\.unit-evidence summary \{[\s\S]*?min-height: 44px/);
  assert.match(css, /\.passport-shell \{[\s\S]*?overflow: hidden/);
  assert.match(css, /\.unit-cleanliness-card \{[\s\S]*?min-width: 0[\s\S]*?overflow: hidden/);
  assert.match(css, /\.unit-cleanliness-main \{[\s\S]*?grid-template-columns: 104px minmax\(0, 1fr\)/);
  assert.match(css, /\.cleanliness-ring \{[\s\S]*?aspect-ratio: 1[\s\S]*?conic-gradient/);
  assert.match(css, /@media \(max-width: 380px\) \{[\s\S]*?\.unit-cleanliness-main \{[\s\S]*?92px minmax\(0, 1fr\)/);
});
