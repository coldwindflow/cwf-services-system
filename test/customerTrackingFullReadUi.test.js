"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const CUSTOMER_COPY_SOURCE = fs.readFileSync(path.join(ROOT, "customer-app/modules/customerCopy.js"), "utf8");
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

function loadTrackingRuntime(options = {}) {
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
      formatBaht: (value) => `${Number(value) || 0} à¸šà¸²à¸—`,
      stateBox: (status, message) => `<div class="${escapeHtml(status)}">${escapeHtml(message)}</div>`,
      timeline: (items) => items.map((item) => `<div>${escapeHtml(item.title)}:${escapeHtml(item.copy)}</div>`).join(""),
    },
    api: {
      getApiBase: () => "https://example.test",
      ...(options.api || {}),
    },
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
    FormData: options.FormData || FormData,
    fetch: options.fetch || (async () => { throw new Error("unexpected fetch"); }),
    setTimeout,
    clearTimeout,
    Date,
  };
  vm.runInNewContext(CUSTOMER_COPY_SOURCE, sandbox, { filename: "customerCopy.js" });
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
    customer_name: "à¸„à¸¸à¸“à¸¥à¸¹à¸à¸„à¹‰à¸²",
    customer_phone: "0812345678",
    address_text: "99/1 à¸–à¸™à¸™à¸ªà¸¸à¸‚à¸¸à¸¡à¸§à¸´à¸— à¸à¸£à¸¸à¸‡à¹€à¸—à¸à¸¯",
    maps_url: "https://maps.google.com/?q=13.7,100.6",
    job_type: "à¸¥à¹‰à¸²à¸‡à¹à¸­à¸£à¹Œ",
    job_status: "à¸£à¸­à¸”à¸³à¹€à¸™à¸´à¸™à¸à¸²à¸£",
    booking_mode: "scheduled",
    appointment_datetime: "2026-07-15T09:00:00+07:00",
    duration_min: 90,
    job_price: 1200,
    payment_status: "unpaid",
    service_items: [{ item_name: "à¸¥à¹‰à¸²à¸‡à¹à¸­à¸£à¹Œà¹€à¸›à¸¥à¸·à¸­à¸¢à¹ƒà¸•à¹‰à¸à¹‰à¸²", qty: 1, unit_price: 1200, line_total: 1200 }],
    technician: { full_name: "à¸Šà¹ˆà¸²à¸‡à¸ªà¸¡à¸Šà¸²à¸¢", phone: "0899999999", grade: "A" },
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
    job_status: "à¹€à¸ªà¸£à¹‡à¸ˆà¹à¸¥à¹‰à¸§",
    finished_at: "2026-07-15T11:00:00+07:00",
    units: [{
      unit_no: 1,
      unit_code: "AC-01",
      label: "à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¸—à¸µà¹ˆ 1 / à¸«à¹‰à¸­à¸‡à¸™à¸­à¸™",
      ac_type: "à¸œà¸™à¸±à¸‡",
      btu: 18000,
      service_type: "à¸¥à¹‰à¸²à¸‡à¸›à¸à¸•à¸´",
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
  "à¸£à¸­à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸›à¸£à¸°à¹€à¸¡à¸´à¸™",
  "à¹„à¸¡à¹ˆà¸¡à¸µà¸„à¹ˆà¸²à¸§à¸±à¸”",
  "à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸§à¸±à¸”à¸ˆà¸£à¸´à¸‡",
  "à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸„à¹ˆà¸²à¸—à¸µà¹ˆà¸§à¸±à¸”à¸ˆà¸£à¸´à¸‡",
  "à¸„à¹ˆà¸² PSI à¸ˆà¸°à¹à¸ªà¸”à¸‡à¹€à¸¡à¸·à¹ˆà¸­à¸Šà¹ˆà¸²à¸‡à¸šà¸±à¸™à¸—à¸¶à¸",
  "à¸ˆà¸°à¹à¸ªà¸”à¸‡à¸„à¹ˆà¸²à¸•à¸±à¸§à¹€à¸¥à¸‚à¹€à¸¡à¸·à¹ˆà¸­",
  "à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µ delta T",
  "à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆà¸„à¹ˆà¸²à¸—à¸µà¹ˆà¸§à¸±à¸”à¸”à¹‰à¸§à¸¢à¹€à¸à¸ˆ",
  "à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆà¸„à¹ˆà¸² Delta T",
  "à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆà¸„à¹ˆà¸²à¸—à¸µà¹ˆà¸§à¸±à¸”à¸”à¹‰à¸§à¸¢à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¸¡à¸·à¸­",
  "à¸›à¸£à¸°à¹€à¸¡à¸´à¸™à¸ˆà¸²à¸à¹€à¸Šà¹‡à¸„à¸¥à¸´à¸ªà¸•à¹Œ à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸„à¹ˆà¸²à¸—à¸µà¹ˆà¸Šà¹ˆà¸²à¸‡à¸§à¸±à¸”à¹€à¸›à¹‡à¸™à¸•à¸±à¸§à¹€à¸¥à¸‚",
  "à¹„à¸¡à¹ˆà¸£à¸§à¸¡à¸„à¹ˆà¸²à¸™à¹‰à¸³à¸¢à¸²à¹à¸¥à¸°à¸­à¸¸à¸“à¸«à¸ à¸¹à¸¡à¸´ à¹€à¸à¸£à¸²à¸°à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸„à¹ˆà¸²à¸—à¸µà¹ˆà¸§à¸±à¸”à¸ˆà¸£à¸´à¸‡",
  "REFRIGERANT / PSI",
  "TEMPERATURE",
];

test("completed normal checklist renders one compact green inspection grid without empty measurements", () => {
  const app = loadTrackingRuntime();
  const html = app.tracking._test.renderPassport(completedHealthPayload());
  assert.equal((html.match(/unit-inspection-item is-good/g) || []).length, 4);
  assert.match(html, /à¸£à¸°à¸šà¸šà¸™à¹‰à¸³à¸¢à¸²/);
  assert.match(html, /à¸„à¸§à¸²à¸¡à¹€à¸¢à¹‡à¸™/);
  assert.match(html, /à¹à¸£à¸‡à¸¥à¸¡/);
  assert.match(html, /à¸£à¸°à¸šà¸šà¸™à¹‰à¸³à¸—à¸´à¹‰à¸‡/);
  assert.equal((html.match(/à¸œà¸¥à¸•à¸£à¸§à¸ˆà¸«à¸¥à¸±à¸‡à¸šà¸£à¸´à¸à¸²à¸£/g) || []).length, 1);
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
    [60, /à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸–à¸¶à¸‡à¸£à¸­à¸šà¸¥à¹‰à¸²à¸‡/, /à¸¥à¹‰à¸²à¸‡à¸˜à¸£à¸£à¸¡à¸”à¸².*4â€“5 à¹€à¸”à¸·à¸­à¸™/],
    [150, /à¸¥à¹‰à¸²à¸‡à¸˜à¸£à¸£à¸¡à¸”à¸²/, /4â€“5 à¹€à¸”à¸·à¸­à¸™/],
    [210, /à¸¥à¹‰à¸²à¸‡à¸à¸£à¸µà¹€à¸¡à¸µà¸¢à¸¡/, /6â€“8 à¹€à¸”à¸·à¸­à¸™/],
    [300, /à¸›à¸£à¸°à¹€à¸¡à¸´à¸™à¸¥à¹‰à¸²à¸‡à¹à¸‚à¸§à¸™à¸„à¸­à¸¢à¸¥à¹Œ/, /9â€“12 à¹€à¸”à¸·à¸­à¸™/],
    [390, /à¸›à¸£à¸°à¹€à¸¡à¸´à¸™à¸¥à¹‰à¸²à¸‡à¹à¸‚à¸§à¸™à¸„à¸­à¸¢à¸¥à¹Œà¸«à¸£à¸·à¸­à¸•à¸±à¸”à¸¥à¹‰à¸²à¸‡/, /à¹„à¸¡à¹ˆà¸Ÿà¸±à¸™à¸˜à¸‡à¸ˆà¸²à¸à¹€à¸§à¸¥à¸²/],
  ];
  for (const [elapsedDays, label, reason] of cases) {
    const guidance = app.tracking._test.nextServiceGuidance(data, data.units[0], profile, { elapsedDays });
    assert.match(guidance.label, label, `${elapsedDays} days`);
    assert.match(guidance.reason, reason, `${elapsedDays} days`);
  }
  const html = app.tracking._test.renderNextServiceGuidance(
    app.tracking._test.nextServiceGuidance(data, data.units[0], profile, { elapsedDays: 150 }),
  );
  assert.match(html, /à¸„à¸³à¹à¸™à¸°à¸™à¸³à¹€à¸šà¸·à¹‰à¸­à¸‡à¸•à¹‰à¸™ à¸„à¸§à¸£à¸à¸´à¸ˆà¸²à¸£à¸“à¸²à¸­à¸²à¸à¸²à¸£à¸ˆà¸£à¸´à¸‡à¸£à¹ˆà¸§à¸¡à¸”à¹‰à¸§à¸¢/);
});

test("non-wall and missing-date next-service guidance fail closed", () => {
  const app = loadTrackingRuntime();
  const data = completedHealthPayload();
  const profile = app.tracking._test.serviceProfile(data);
  for (const acType of ["à¸ªà¸µà¹ˆà¸—à¸´à¸¨à¸—à¸²à¸‡", "à¹à¸‚à¸§à¸™", "à¹€à¸›à¸¥à¸·à¸­à¸¢à¹ƒà¸•à¹‰à¸à¹‰à¸²", "à¹„à¸¡à¹ˆà¸—à¸£à¸²à¸š"] ) {
    const unit = { ...data.units[0], ac_type: acType };
    const guidance = app.tracking._test.nextServiceGuidance(data, unit, profile, { elapsedDays: 300 });
    assert.match(guidance.reason, /à¸¥à¹‰à¸²à¸‡à¹ƒà¸«à¹‰à¸•à¸£à¸‡à¸Šà¸™à¸´à¸”à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¹à¸¥à¸°à¹ƒà¸«à¹‰à¸—à¸µà¸¡à¸›à¸£à¸°à¹€à¸¡à¸´à¸™à¸£à¸¹à¸›à¹à¸šà¸šà¸«à¸™à¹‰à¸²à¸‡à¸²à¸™/);
    assert.doesNotMatch(`${guidance.label} ${guidance.reason}`, /à¸¥à¹‰à¸²à¸‡à¸à¸£à¸µà¹€à¸¡à¸µà¸¢à¸¡|à¹à¸‚à¸§à¸™à¸„à¸­à¸¢à¸¥à¹Œ|à¸•à¸±à¸”à¸¥à¹‰à¸²à¸‡/);
  }
  const missing = app.tracking._test.nextServiceGuidance(data, data.units[0], profile, { elapsedDays: null });
  assert.equal(missing.tone, "neutral");
  assert.match(missing.reason, /à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸§à¸±à¸™à¸—à¸µà¹ˆà¸ˆà¸šà¸‡à¸²à¸™à¸™à¸µà¹‰à¸ªà¸³à¸«à¸£à¸±à¸šà¸›à¸£à¸°à¹€à¸¡à¸´à¸™à¸£à¸­à¸šà¸šà¸£à¸´à¸à¸²à¸£à¸„à¸£à¸±à¹‰à¸‡à¸–à¸±à¸”à¹„à¸›/);
});

test("cooling and refrigerant issues recommend repair-first without using raw notes", () => {
  const app = loadTrackingRuntime();
  for (const key of ["cooling", "refrigerant"]) {
    const data = completedHealthPayload();
    data.technician_note = "à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¸ à¸²à¸¢à¹ƒà¸™à¸—à¸µà¹ˆà¸•à¹‰à¸­à¸‡à¹„à¸¡à¹ˆà¹ƒà¸Šà¹‰à¸§à¸´à¸™à¸´à¸ˆà¸‰à¸±à¸¢";
    data.units[0].checklist_summary.post_issue_count = 1;
    data.units[0].checklist_summary.metric_statuses = { refrigerant: null, cooling: null, airflow: null, drain: null, [key]: "issue" };
    const profile = app.tracking._test.serviceProfile(data);
    const guidance = app.tracking._test.nextServiceGuidance(data, data.units[0], profile, { elapsedDays: 150 });
    assert.equal(guidance.tone, "repair");
    assert.match(guidance.label, /à¸•à¸£à¸§à¸ˆà¹€à¸Šà¹‡à¸„à¸£à¸°à¸šà¸šà¸à¹ˆà¸­à¸™/);
    assert.doesNotMatch(guidance.label, /à¸¥à¹‰à¸²à¸‡à¸˜à¸£à¸£à¸¡à¸”à¸²/);
    assert.doesNotMatch(JSON.stringify(guidance), /à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¸ à¸²à¸¢à¹ƒà¸™/);
  }
});

test("drain airflow and unclassified issues use cautious customer-safe guidance", () => {
  const app = loadTrackingRuntime();
  const cases = [
    ["drain", /à¸£à¸°à¸šà¸šà¸™à¹‰à¸³à¸—à¸´à¹‰à¸‡/],
    ["airflow", /à¸•à¸£à¸§à¸ˆà¸ªà¸ à¸²à¸à¸à¹ˆà¸­à¸™à¹€à¸¥à¸·à¸­à¸à¸¥à¹‰à¸²à¸‡/],
  ];
  for (const [key, expected] of cases) {
    const data = completedHealthPayload();
    data.units[0].checklist_summary.post_issue_count = 1;
    data.units[0].checklist_summary.metric_statuses = { refrigerant: null, cooling: null, airflow: null, drain: null, [key]: "issue" };
    const guidance = app.tracking._test.nextServiceGuidance(data, data.units[0], app.tracking._test.serviceProfile(data), { elapsedDays: 300 });
    assert.equal(guidance.tone, "watch");
    assert.match(`${guidance.label} ${guidance.reason}`, expected);
    if (key === "drain") assert.doesNotMatch(guidance.label, /à¹à¸‚à¸§à¸™à¸„à¸­à¸¢à¸¥à¹Œ/);
  }
  const unknown = completedHealthPayload();
  unknown.units[0].checklist_summary.post_issue_count = 1;
  unknown.units[0].checklist_summary.metric_statuses = { refrigerant: null, cooling: null, airflow: null, drain: null };
  const guidance = app.tracking._test.nextServiceGuidance(unknown, unknown.units[0], app.tracking._test.serviceProfile(unknown), null);
  assert.equal(guidance.tone, "neutral");
  assert.match(guidance.label, /à¹ƒà¸«à¹‰à¸—à¸µà¸¡à¸›à¸£à¸°à¹€à¸¡à¸´à¸™à¸­à¸²à¸à¸²à¸£/);
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
  const cleanProfile = app.tracking._test.serviceProfile({ job_type: "à¸¥à¹‰à¸²à¸‡", service_summary: "à¸¥à¹‰à¸²à¸‡à¸›à¸à¸•à¸´" });
  const recent = app.tracking._test.cleanlinessRecommendation("2026-07-01T00:00:00Z", 95, cleanProfile, now);
  assert.equal(recent.elapsedDays, 30);
  assert.equal(recent.tone, "excellent");
  assert.equal(recent.status, "à¸ªà¸°à¸­à¸²à¸”à¸¡à¸²à¸");
  assert.match(recent.recommendation, /à¸à¸£à¹‰à¸­à¸¡à¹ƒà¸Šà¹‰à¸‡à¸²à¸™/);
  assert.doesNotMatch(recent.recommendation, /à¸„à¸§à¸£à¸¥à¹‰à¸²à¸‡/);
  assert.match(recent.nextText, /4-6 à¹€à¸”à¸·à¸­à¸™/);

  const approaching = app.tracking._test.cleanlinessRecommendation("2026-03-25T00:00:00Z", 72, cleanProfile, now);
  assert.equal(approaching.tone, "watch");
  assert.equal(approaching.status, "à¹ƒà¸à¸¥à¹‰à¸–à¸¶à¸‡à¸£à¸­à¸šà¸¥à¹‰à¸²à¸‡");

  const overdueDespiteHighScore = app.tracking._test.cleanlinessRecommendation("2026-02-21T00:00:00Z", 99, cleanProfile, now);
  assert.equal(overdueDespiteHighScore.tone, "due");
  assert.equal(overdueDespiteHighScore.status, "à¸„à¸§à¸£à¸¥à¹‰à¸²à¸‡");
  assert.match(overdueDespiteHighScore.recommendation, /à¹à¸™à¸°à¸™à¸³à¸¥à¹‰à¸²à¸‡/);
});

test("missing last-clean date is honest and a low score never recommends immediate recleaning", () => {
  const app = loadTrackingRuntime();
  const now = Date.parse("2026-07-31T00:00:00Z");
  const cleanProfile = app.tracking._test.serviceProfile({ job_type: "à¸¥à¹‰à¸²à¸‡", service_summary: "à¸¥à¹‰à¸²à¸‡à¸›à¸à¸•à¸´" });
  const missing = app.tracking._test.cleanlinessRecommendation(null, 99, cleanProfile, now);
  assert.equal(missing.tone, "unknown");
  assert.equal(missing.score, null);
  assert.match(missing.recommendation, /à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸§à¸±à¸™à¸—à¸µà¹ˆà¸ˆà¸šà¸‡à¸²à¸™à¸™à¸µà¹‰/);
  assert.doesNotMatch(missing.recommendation, /à¸ªà¸°à¸­à¸²à¸”à¸¡à¸²à¸|à¸„à¸§à¸£à¸¥à¹‰à¸²à¸‡/);

  const justCleanedLowScore = app.tracking._test.cleanlinessRecommendation("2026-07-30T00:00:00Z", 30, cleanProfile, now);
  assert.equal(justCleanedLowScore.tone, "watch");
  assert.equal(justCleanedLowScore.status, "à¸„à¸§à¸£à¸•à¸´à¸”à¸•à¸²à¸¡à¸ªà¸ à¸²à¸");
  assert.doesNotMatch(justCleanedLowScore.recommendation, /à¸„à¸§à¸£à¸¥à¹‰à¸²à¸‡/);

  const olderLowScore = app.tracking._test.cleanlinessRecommendation("2026-05-12T00:00:00Z", 30, cleanProfile, now);
  assert.equal(olderLowScore.tone, "watch");
  assert.notEqual(olderLowScore.status, "à¸„à¸§à¸£à¸¥à¹‰à¸²à¸‡");
});

test("cleanliness cycles follow normal pre×N9ŞÚ$z{-®éÜj×·²7F'FVEöC¢'7F'FVB"Â6†V6¶–åöC¢&6†V6¶–â"ÂG&fVÅ÷7F'FVEöC¢'G&fVÂ"ÒÂ.ˆ‹>Š^‹ˆ~˜>Š¾˜‰®Š>‹Nˆ‹.Š2%ÒÀĞ¢·²6†V6¶–åöC¢&6†V6¶–â"ÂG&fVÅ÷7F'FVEöC¢'G&fVÂ"ÒÂ.ˆ®˜‹.ˆ~‰n‹nˆ~Š¾‰˜‹.ˆ~‹.‰˜Š^˜Šr%ÒÀĞ¢·²G&fVÅ÷7F'FVEöC¢'G&fVÂ"Â76–væVEöC¢&76–væVB"ÒÂ.ˆ®˜‹.ˆ~ˆ‹>Š^‹ˆ~˜‰N‹N‰‰~‹.ˆr%ÒÀĞ¢·²76–væVEöC¢&76–væVB"Â¦ö%÷7FGW3¢.Š>ŠŞ‰N‹>˜‰‹N‰ˆ‹.Š2"ÒÂ.Š.‹~‰Š.‹‰ˆN‹NŠ~˜Š^˜Šr%ÒÀĞ¢·²&öö¶–æuöÖöFS¢'W&vVçB"Â¦ö%÷7FGW3¢&FÖ–å÷&Wf–Wr"ÒÂ.ˆ‹>Š^‹ˆ~ˆN˜‰Š¾‹.ˆ®˜‹.ˆr%ÒÀ¢·²&öö¶–æuöÖöFS¢'W&vVçB"Â¦ö%÷7FGW3¢&&÷fVB"ÒÂ.ˆ‹>Š^‹ˆ~ˆN˜‰Š¾‹.ˆ®˜‹.ˆr%ÒÀ¢·²&öö¶–æuöÖöFS¢'W&vVçB"Â¦ö%÷7FGW3¢&76–væVB"Â†6S¢&76–væVB"ÒÂ.ˆ®˜‹.ˆ~Š>‹‰®ˆ~‹.‰˜Š^˜Šr%ÒÀ¢Ó°Ğ¢f÷"†6öç7B·6÷W&6RÂÆ&VÅÒöb66W2’°Ğ¢6öç7B‡FÖÂÒçG&6¶–ærå÷FW7Bç&VæFW%77÷'B‡°Ğ¢ââæ6öFU&VE–ÆöB‚’ÀĞ¢FV6†æ–6–ã¢çVÆÂÀĞ¢FV6†æ–6–å÷FVÓ¢µÒÀĞ¢f–æ—6†VEöC¢çVÆÂÀĞ¢7F'FVEöC¢çVÆÂÀĞ¢6†V6¶–åöC¢çVÆÂÀĞ¢G&fVÅ÷7F'FVEöC¢çVÆÂÀĞ¢76–væVEöC¢çVÆÂÀĞ¢ââç6÷W&6RÀĞ¢Ò“°Ğ¢76W'BæÖF6‚†‡FÖÂÂæWr&VtW‡†Æ&VÂ’ÂÆ&VÂ“°Ğ¢76W'BæFöW4æ÷DÖF6‚†‡FÖÂÂöFÖ–å÷&Wf–WwÆ¦ö%÷7FGW7Æ&÷fVBö’ÂÆ&VÂ“°Ğ¢ĞĞ§Ò“°Ğ Ğ§FW7B‚'G&6¶–ær7W7FöÖW"f–Ww2W6RF†’†VF–æw2v—F†÷WBW‡÷6VBVævÆ—6‚T’Æ&VÇ2"Â‚’Óâ°Ğ¢6öç7BÒÆöEG&6¶–æu'VçF–ÖR‚“°Ğ¢ç7FFRçG&6¶–ærÒ°Ğ¢7FGW3¢'7V66W72"ÀĞ¢FF¢°Ğ¢ââæ6ö×ÆWFVD†VÇF…–ÆöB‚’ÀĞ¢66W75öÆWfVÃ¢'Fö¶Vâ"ÀĞ¢6å÷W6U÷Fö¶Våö7F–öç3¢G'VRÀĞ¢6&–Æ—F–W3¢²6å÷f–WuögVÆÅ÷G&6¶–æs¢G'VRÂ6å÷W6U÷Fö¶Våö7F–öç3¢G'VRÒÀĞ¢&öö¶–æu÷Fö¶Vã¢'&—fFR×Fö¶Vâ"ÀĞ¢†÷F÷3¢·²W&Ã¢&‡GG3¢òöW†×ÆRçFW7BögFW"æ§r"Â†6S¢&gFW""ÕÒÀĞ¢FV6†æ–6–åöæ÷FS¢.Š^˜‹.ˆ~˜Š>‹^Š.‰®Š>˜ŠŞŠ""ÀĞ¢&Wf–Ws¢²Ç&VG•÷&Wf–WvVC¢G'VRÂ&F–æs¢RÂ&Wf–Wu÷FW‡C¢.‰N‹^Š‹.ˆ"ÒÀĞ¢6FÆöu÷&Wf–Ws¢°Ğ¢VÆ–v–&ÆS¢fÇ6RÀĞ¢Ç&VG•÷&Wf–WvVC¢G'VRÀĞ¢&Wf–Ws¢²&F–æs¢RÂ6öÖÖVçC¢.‰®Š>‹Nˆ‹.Š>‰N‹R"ÂÖöFW&F–öå÷7FGW3¢&&÷fVB"ÒÀĞ¢ÒÀĞ¢ÒÀĞ¢W'&÷#¢""ÀĞ¢Ó°Ğ¢6öç7B‡FÖÂÒçG&6¶–ærå÷FW7Bç&VæFW%G&6¶–æu&W7VÇB‚“°Ğ¢76W'BæÖF6‚†‡FÖÂÂş‰^‹N‰N‰^‹.Šˆ~‹.‰—ÎŠ>‹‰¾ˆ~‹.‰—ÎŠ¾Š‹.Š.˜Š¾‰^‹‡ÎŠ>‹^Š~‹NŠ~‰~‹^Šˆ®˜‹.ˆwÎŠ>‹^Š~‹NŠ~‰®Š>‹Nˆ‹.Š2ò“°Ğ¢76W'BæFöW4æ÷DÖF6‚†‡FÖÂÂóåÇ2¢ƒó¥G&6¶–æwÅ†÷F÷7Äæ÷FWÅFV6†æ–6–â&Wf–WwÅ6W'f–6R&Wf–WwÅ&Wf–Wr•Ç2£Âò“°Ğ¢76W'BæFöW4æ÷DÖF6‚†‡FÖÂÂö&–ÖÆ&VÃÒ%G&6¶–ærf–Ww2'Ä5tbG&6¶–ærò“°Ğ§Ò“°Ğ Ğ§FW7B‚'G&6¶–ær77÷'B&VæFW'27W7FöÖW"×6fR6ö×ÆWFVBÆ&VÂ–ç7FVBöb&r¦ö"7FGW2"Â‚’Óâ°Ğ¢6öç7BÒÆöEG&6¶–æu'VçF–ÖR‚“°Ğ¢6öç7B‡FÖÂÒçG&6¶–ærå÷FW7Bç&VæFW%77÷'B†6ö×ÆWFVD†VÇF…–ÆöB‡²¦ö%÷7FGW3¢$”åDU$äÅôDôäUõ5DDR"Ò’“°Ğ¢76W'BæÖF6‚†‡FÖÂÂşˆ~‹.‰˜Š®Š>˜~ˆ˜Š^˜Šrò“°Ğ¢76W'BæFöW4æ÷DÖF6‚†‡FÖÂÂô”åDU$äÅôDôäUõ5DDRò“°Ğ§Ò“°Ğ Ğ§FW7B‚'G&6¶–ærT’W6W2öæR†öæRÖ÷"Ö6öFRf–VÆBæB&VÖ÷fW2F†RöÆB†öæR×&ööbfÆ÷r"Â‚’Óâ°Ğ¢6öç7B6÷W&6RÒg2ç&VDf–ÆU7–æ2‡F‚æ¦ö–â…$ôõBÂ&7W7FöÖW"Ö"Â&ÖöGVÆW2"Â'G&6¶–æræ§2"’Â'WFc‚"“°Ğ¢76W'BæÖF6‚‡6÷W&6RÂş˜‰®ŠŞŠ>˜Î˜.‰~Š2Š¾Š>‹~ŠŞŠ>Š¾‹Š®ˆ‹.Š>ˆŠŞˆrò“°Ğ¢76W'BæÖF6‚‡6÷W&6RÂ÷Æ6V†öÆFW#Ò.ˆŠ>ŠŞˆ˜‰®ŠŞŠ>˜Î˜.‰~Š>Š¾Š>‹~ŠŞŠ>Š¾‹Š®ˆ‹.Š>ˆŠŞˆr"ò“°Ğ¢76W'BæÖF6‚‡6÷W&6RÂöÆöö·WG&6¶–æuÂ‡Â’ò“°Ğ¢76W'BæÖF6‚‡6÷W&6RÂ÷6VÆV7EG&6¶–æuÂ‡&VfW&Væ6UÂ’ò“°Ğ¢76W'BæÖF6‚‡6÷W&6RÂö–bÂ†¦ö'5ÂæÆVæwF‚ÓÓÒÂ’&WGW&â÷Vå6VÆV7F–öâò“°Ğ¢76W'BæÖF6‚‡6÷W&6RÂ÷7FGW3¢&6†ö–6W2"ò“°Ğ¢76W'BæFöW4æ÷DÖF6‚‡6÷W&6RÂöæÖSÒ&7W7FöÖW%÷†öæR'Î˜‰®ŠŞŠ>˜Î˜.‰~Š>‰~‹^˜˜>ˆ®˜ˆŠŞˆrÂŠ.‹~‰Š.‹‰‰^‹Š~‰^‰•Â—ÎˆŠ>ŠŞˆ˜‰®ŠŞŠ>˜Î˜.‰~Š>‰~‹^˜˜>ˆ®˜ˆŠŞˆ~ˆ~‹.‰‰‹^˜˜‰î‹~˜ŠŞŠ.‹~‰Š.‹‰‰^‹Š~‰^‰ˆ˜ŠŞ‰Š>‹^Š~‹NŠrò“°Ğ§Ò“°Ğ Ğ§FW7B‚&6ö×ÆWFVB¦ö"v—F†÷WBw&—FR6&–Æ—G’†2vVæW&–2Væf–Æ&ÆRW‡ÆæF–öâ"Â‚’Óâ°Ğ¢6öç7BÒÆöEG&6¶–æu'VçF–ÖR‚“°Ğ¢6öç7BFFÒ6ö×ÆWFVD†VÇF…–ÆöB‡²ÆVv7•÷&Wf–WuöVÆ–v–&ÆS¢fÇ6RÒ“°Ğ¢6öç7B‡FÖÂÒçG&6¶–ærå÷FW7Bç&VæFW$gFW&6&R†FF“°Ğ¢76W'BæÖF6‚†‡FÖÂÂşˆ~‹.‰‰‹^˜Š.‹ˆ~˜NŠ˜ŠŞŠ.‹˜˜>‰Š®‰n‹.‰‹‰~‹^˜Š®˜ˆ~Š>‹^Š~‹NŠ~˜N‰N˜’ò“°Ğ¢76W'BæFöW4æ÷DÖF6‚†‡FÖÂÂô&öö¶–ær6öFRâ®‰®‹‰‰~‹nˆˆN‹˜‰‰˜NŠ˜˜N‰N˜’ò“°Ğ¢76W'BæFöW4æ÷DÖF6‚†‡FÖÂÂöFF×&Wf–WrÖf÷&×ÆFFÖ6FÆör×&Wf–WrÖf÷&Òò“°Ğ§Ò“°Ğ Ğ§FW7B‚'G&6¶–ær&Wf–Wrf÷&×2W6Rf—fR66W76–&ÆRCG‚7F"6†ö–6W2æBæWfW"&VæFW"F†RFö¶Vâ"Â‚’Óâ°Ğ¢6öç7BÒÆöEG&6¶–æu'VçF–ÖR‚“°Ğ¢6öç7BFFÒ°Ğ¢ââæ6ö×ÆWFVD†VÇF…–ÆöB‚’ÀĞ¢66W75öÆWfVÃ¢'Fö¶Vâ"ÀĞ¢6å÷W6U÷Fö¶Våö7F–öç3¢G'VRÀĞ¢6&–Æ—F–W3¢²6å÷f–WuögVÆÅ÷G&6¶–æs¢G'VRÂ6å÷W6U÷Fö¶Våö7F–öç3¢G'VRÒÀĞ¢&öö¶–æu÷Fö¶Vã¢'&—fFR×Fö¶Vâ"ÀĞ¢6FÆöu÷&Wf–Ws¢²VÆ–v–&ÆS¢G'VRÂÇ&VG•÷&Wf–WvVC¢fÇ6RÂ&Wf–Ws¢çVÆÂÒÀĞ¢Ó°Ğ¢6öç7B6FÆöt‡FÖÂÒçG&6¶–ærå÷FW7Bç&VæFW$gFW&6&R†FF“°Ğ¢76W'BæWVÂ‚†6FÆöt‡FÖÂæÖF6‚‚ö6Æ73Ò'&Wf–Wr×7F"×&F–ò"ör’ÇÂµÒ’æÆVæwF‚ÂR“°Ğ¢76W'BæWVÂ‚†6FÆöt‡FÖÂæÖF6‚‚ö6Æ73Ò'&Wf–Wr×7F"Ö6†ö–6R"ör’ÇÂµÒ’æÆVæwF‚ÂR“°Ğ¢76W'BæÖF6‚†6FÆöt‡FÖÂÂö&–ÖÆ&VÃÒ#‰N‹.Šr"ò“°Ğ¢76W'BæÖF6‚†6FÆöt‡FÖÂÂö&–ÖÆ&VÃÒ#R‰N‹.Šr"ò“°Ğ¢76W'BæÖF6‚†6FÆöt‡FÖÂÂ÷&öÆSÒ'7FGW2"&–ÖÆ—fSÒ'öÆ—FR"ò“°Ğ¢76W'BæFöW4æ÷DÖF6‚†6FÆöt‡FÖÂÂóÇ6VÆV7GÇ&—fFR×Fö¶VçÆ&öö¶–æu÷Fö¶Vâò“°Ğ¢76W'BæÖF6‚„555õ4õU$4RÂõÂç&Wf–Wr×7F"Ö6†ö–6UÇ2¥ÇµµÇ5Å5Ò£öÖ–â×v–GFƒ¥Ç2£CGƒµµÇ5Å5Ò£öÖ–âÖ†V–v‡C¥Ç2£CGƒ²ò“°Ğ¢76W'BæÖF6‚„555õ4õU$4RÂöw&–B×FV×ÆFRÖ6öÇVÖç3¥Ç2§&WVEÂƒRÅÇ2¦Ö–æÖ…ÂƒCG‚ÅÇ2£g%Â•Â’ò“°Ğ¢76W'BæÖF6‚„555õ4õU$4RÂõÂç&Wf–Wr×7F"×&F–ó¦fö7W2×f—6–&ÆRÂ²Âç&Wf–Wr×7F"Ö6†ö–6Rò“°Ğ§Ò“°Ğ Ğ§FW7B‚&f–ÆVBFV6†æ–6–â&Wf–Wr&WVW7B&RÖVæ&ÆW27V&Ö—Bv—F†÷WBW‡÷6–ær&6¶VæBW'&÷"FW‡B"Â7–æ2‚’Óâ°Ğ¢ÆWB7V&Ö—D†æFÆW#°Ğ¢ÆWB&WVW7D&öG“°Ğ¢6öç7B7FGW2Ò²FW‡D6öçFVçC¢""Ó°Ğ¢6öç7B7V&Ö—BÒ²F—6&ÆVC¢fÇ6RÓ°Ğ¢6öç7B'W7’ÒæWr6WB‚“°Ğ¢6öç7Bf÷&ÒÒ°Ğ¢FDWfVçDÆ—7FVæW"‡G—RÂ†æFÆW"’²–b‡G—RÓÓÒ'7V&Ö—B"’7V&Ö—D†æFÆW"Ò†æFÆW#²ÒÀĞ¢VW'•6VÆV7F÷"‡6VÆV7F÷"’°Ğ¢–b‡6VÆV7F÷"ÓÓÒ%¶FF×&Wf–Wr×7FGW5Ò"’&WGW&â7FGW3°Ğ¢–b‡6VÆV7F÷"ÓÓÒ&'WGFöå·G—SÒw7V&Ö—BuÒ"’&WGW&â7V&Ö—C°Ğ¢&WGW&âçVÆÃ°Ğ¢ÒÀĞ¢†4GG&–'WFR†æÖR’²&WGW&âæÖRÓÓÒ&FF×&Wf–Wr×Fö¶Vâ#²ÒÀĞ¢6WDGG&–'WFR†æÖR’²'W7’æFB†æÖR“²ÒÀĞ¢&VÖ÷fTGG&–'WFR†æÖR’²'W7’æFVÆWFR†æÖR“²ÒÀĞ¢Ó°Ğ¢6Æ72&Wf–Wtf÷&ÔFF°Ğ¢VçG&–W2‚’²&WGW&âµ²'&F–ær"Â#B%ÒÂ²'&Wf–Wu÷FW‡B"Â.‰~‰NŠ®ŠŞ‰¢%ÕÕµ7–Ö&öÂæ—FW&F÷%Ò‚“²ĞĞ¢ĞĞ¢6öç7BÒÆöEG&6¶–æu'VçF–ÖR‡°Ğ¢f÷&ÔFF¢&Wf–Wtf÷&ÔFFÀĞ¢fWF6ƒ¢7–æ2…÷W&ÂÂ÷F–öç2’Óâ°Ğ¢&WVW7D&öG’Ò¥4ôâç'6R†÷F–öç2æ&öG’“°Ğ¢&WGW&â²ö³¢fÇ6RÂ7FGW3¢SÂ§6öã¢7–æ2‚’Óâ‡²W'&÷#¢%õ5B÷V&Æ–2÷&Wf–Wr5Â&VÆF–öâ¦ö'27F6²"Ò’Ó°Ğ¢ÒÀĞ¢Ò“°Ğ¢ç7FFRçG&6¶–æræFFÒ°Ğ¢6VÆV7F–öå÷&Vc¢&÷VR×6VÆV7F–öâ×&VfW&Væ6R"ÀĞ¢6&–Æ—F–W3¢²6å÷7V&Ö—E÷&Wf–Ws¢G'VRÒÀĞ¢Ó°Ğ¢6öç7B6öçF–æW"Ò°Ğ¢VW'•6VÆV7F÷"‡6VÆV7F÷"’²&WGW&â6VÆV7F÷"ÓÓÒ%¶FF×&Wf–WrÖf÷&ÕÒ"òf÷&Ò¢çVÆÃ²ÒÀĞ¢Ó°Ğ¢çG&6¶–ærå÷FW7Bæ&–æE&W7VÇD7F–öç2†6öçF–æW"“°Ğ¢v—B7V&Ö—D†æFÆW"‡²&WfVçDFVfVÇB‚’·ÒÒ“°Ğ¢76W'BæWVÂ‡7V&Ö—BæF—6&ÆVBÂfÇ6R“°Ğ¢76W'BæWVÂ‡7FGW2çFW‡D6öçFVçBÂ.Š>‹‰®‰®ˆ.‹‰Nˆ.˜ŠŞˆ~ˆ®‹˜Š~ˆNŠ>‹.ŠrˆŠ>‹‰>‹.Š^ŠŞˆ~˜>Š¾Š˜Š¾Š>‹~ŠŞ‰^‹N‰N‰^˜ŠŞ˜ŠŞ‰NŠ‹N‰’"“°Ğ¢76W'BæFöW4æ÷DÖF6‚‡7FGW2çFW‡D6öçFVçBÂõ5ÇÇ&VÆF–öçÅÂ÷V&Æ–5Â÷&Wf–WwÇ7F6²ö’“°Ğ¢76W'BæWVÂ†'W7’æ†2‚&&–Ö'W7’"’ÂfÇ6R“°Ğ¢76W'BæWVÂ‡&WVW7D&öG’ç6VÆV7F–öå÷&VbÂ&÷VR×6VÆV7F–öâ×&VfW&Væ6R"“°Ğ¢76W'BæWVÂ‡&WVW7D&öG’æ7W7FöÖW%÷†öæRÂVæFVf–æVB“°Ğ¢76W'BæWVÂ‡&WVW7D&öG’æ&öö¶–æuö6öFRÂVæFVf–æVB“°Ğ§Ò“°Ğ Ğ§FW7B‚'G&6¶–ær6†ö–6RæB&Wf–Wr6öçG&öÇ2&VÖ–âv–GF‚×6fRB3c‚æB3“‚"Â‚’Óâ°Ğ¢76W'BæÖF6‚„555õ4õU$4RÂõÂçG&6¶–ærÖ6†ö–6R×6†VÆÂÅµÇ5Å5Ò£õÂçG&6¶–ærÖ6†ö–6UÇ2¥ÇµÇ2¦Ö–â×v–GFƒ¥Ç2£²ò“°Ğ¢76W'BæÖF6‚„555õ4õU$4RÂõÂçG&6¶–ærÖ6†ö–6UÇ2¥ÇµµÇ5Å5Ò£÷v–GFƒ¥Ç2£SµµÇ5Å5Ò£öÖ–âÖ†V–v‡C¥Ç2£cGƒ²ò“°Ğ¢76W'BæÖF6‚„555õ4õU$4RÂõÂçG&6¶–ærÖ6†ö–6UÇ2¥ÇµµÇ5Å5Ò£ö÷fW&fÆ÷r×w&¥Ç2¦ç—v†W&S²ò“°Ğ¢76W'BæÖF6‚„555õ4õU$4RÂöw&–B×FV×ÆFRÖ6öÇVÖç3¥Ç2§&WVEÂƒRÅÇ2¦Ö–æÖ…ÂƒCG‚ÅÇ2£g%Â•Â’ò“°Ğ§Ò“°Ğ Ğ§FW7B‚&f–ÆVB6FÆör&Wf–Wr&WVW7B&RÖVæ&ÆW27V&Ö—Bv—F‚7W7FöÖW"×6fRæWGv÷&²6÷’"Â7–æ2‚’Óâ°Ğ¢ÆWB7V&Ö—D†æFÆW#°Ğ¢6öç7B7FGW2Ò²FW‡D6öçFVçC¢""Ó°Ğ¢6öç7B7V&Ö—BÒ²F—6&ÆVC¢fÇ6RÓ°Ğ¢6öç7B'W7’ÒæWr6WB‚“°Ğ¢6öç7Bf÷&ÒÒ°Ğ¢FDWfVçDÆ—7FVæW"‡G—RÂ†æFÆW"’²–b‡G—RÓÓÒ'7V&Ö—B"’7V&Ö—D†æFÆW"Ò†æFÆW#²ÒÀĞ¢VW'•6VÆV7F÷"‡6VÆV7F÷"’°Ğ¢–b‡6VÆV7F÷"ÓÓÒ%¶FFÖ6FÆör×&Wf–Wr×7FGW5Ò"’&WGW&â7FGW3°Ğ¢–b‡6VÆV7F÷"ÓÓÒ&'WGFöå·G—SÒw7V&Ö—BuÒ"’&WGW&â7V&Ö—C°Ğ¢&WGW&âçVÆÃ°Ğ¢ÒÀĞ¢6WDGG&–'WFR†æÖR’²'W7’æFB†æÖR“²ÒÀĞ¢&VÖ÷fTGG&–'WFR†æÖR’²'W7’æFVÆWFR†æÖR“²ÒÀĞ¢Ó°Ğ¢6Æ72&Wf–Wtf÷&ÔFF°Ğ¢VçG&–W2‚’²&WGW&âµ²'&F–ær"Â#2%ÒÂ²&6öÖÖVçB"Â.‰~‰NŠ®ŠŞ‰¢%ÕÕµ7–Ö&öÂæ—FW&F÷%Ò‚“²ĞĞ¢ĞĞ¢6öç7BÒÆöEG&6¶–æu'VçF–ÖR‡°Ğ¢f÷&ÔFF¢&Wf–Wtf÷&ÔFFÀĞ¢“¢²7V&Ö—EG&6¶–æu&Wf–Ws¢7–æ2‚’Óâ²F‡&÷ræWrG—TW'&÷"‚$f–ÆVBFòfWF6‚‡GG3¢òö–çFW&æÂæW†×ÆR÷&÷WFR"“²ÒÒÀĞ¢Ò“°Ğ¢ç7FFRçG&6¶–æræFFÒ°Ğ¢66W75öÆWfVÃ¢'Fö¶Vâ"ÀĞ¢6å÷W6U÷Fö¶Våö7F–öç3¢G'VRÀĞ¢&öö¶–æu÷Fö¶Vã¢'&—fFR×Fö¶Vâ"ÀĞ¢Ó°Ğ¢6öç7B6öçF–æW"Ò°Ğ¢VW'•6VÆV7F÷"‡6VÆV7F÷"’²&WGW&â6VÆV7F÷"ÓÓÒ%¶FFÖ6FÆör×&Wf–WrÖf÷&ÕÒ"òf÷&Ò¢çVÆÃ²ÒÀĞ¢Ó°Ğ¢çG&6¶–ærå÷FW7Bæ&–æE&W7VÇD7F–öç2†6öçF–æW"“°Ğ¢v—B7V&Ö—D†æFÆW"‡²&WfVçDFVfVÇB‚’·ÒÒ“°Ğ¢76W'BæWVÂ‡7V&Ö—BæF—6&ÆVBÂfÇ6R“°Ğ¢76W'BæWVÂ‡7FGW2çFW‡D6öçFVçBÂ.˜ˆ®‹~˜ŠŞŠ‰^˜ŠŞŠ>‹‰®‰®˜NŠ˜Š®‹>˜Š>˜~ˆ‚ˆŠ>‹‰>‹.Š^ŠŞˆ~ŠŞ‹^ˆˆNŠ>‹˜ˆr"“°Ğ¢76W'BæFöW4æ÷DÖF6‚‡7FGW2çFW‡D6öçFVçBÂö–çFW&æÇÇ&÷WFWÄf–ÆVBFòfWF6‚ö’“°Ğ¢76W'BæWVÂ†'W7’æ†2‚&&–Ö'W7’"’ÂfÇ6R“°Ğ§Ò“°Ğ Ğ§FW7B‚'Fö¶Vâ6ö×ÆWFVBv—F‚W†—7F–ær&Wf–Ww26†÷w2&÷F‚7VÖÖ&–W2æBæòGWÆ–6FRf÷&Ò"Â‚’Óâ°Ğ¢6öç7BÒÆöEG&6¶–æu'VçF–ÖR‚“°Ğ¢6öç7BFFÒ°Ğ¢ââæ6öFU&VE–ÆöB‚’ÀĞ¢66W75öÆWfVÃ¢'Fö¶Vâ"ÀĞ¢6å÷W6U÷Fö¶Våö7F–öç3¢G'VRÀĞ¢6&–Æ—F–W3¢²6å÷f–WuögVÆÅ÷G&6¶–æs¢G'VRÂ6å÷W6U÷Fö¶Våö7F–öç3¢G'VRÒÀĞ¢&öö¶–æu÷Fö¶Vã¢'&—fFR×Fö¶Vâ"ÀĞ¢¦ö%ö–C¢ƒ‚ÀĞ¢¦ö%÷7FGW3¢.˜Š®Š>˜~ˆ˜Š^˜Šr"ÀĞ¢f–æ—6†VEöC¢###bÓrÓUC££³s£"ÀĞ¢&V6V—E÷W&Ã¢"öFö72÷&V6V—Bóƒƒö¶W“×&—fFR×Fö¶Vâ"ÀĞ¢&Wf–Ws¢²Ç&VG•÷&Wf–WvVC¢G'VRÂ&F–æs¢BÂ&Wf–Wu÷FW‡C¢.‰~‹^Šˆ®˜‹.ˆ~‰N‹R"ÒÀĞ¢6FÆöu÷&Wf–Ws¢°Ğ¢VÆ–v–&ÆS¢fÇ6RÀĞ¢Ç&VG•÷&Wf–WvVC¢G'VRÀĞ¢&Wf–Ws¢²&F–æs¢RÂ6öÖÖVçC¢.‰®Š>‹Nˆ‹.Š>‰N‹R"ÂÖöFW&F–öå÷7FGW3¢&&÷fVB"ÒÀĞ¢ÒÀĞ¢Ó°Ğ¢ç7FFRçG&6¶–ærÒ²7FGW3¢'7V66W72"ÂFFÂW'&÷#¢""Ó°Ğ¢6öç7B‡FÖÂÒçG&6¶–ærå÷FW7Bç&VæFW%G&6¶–æu&W7VÇB‚“°Ğ¢76W'BæÖF6‚†‡FÖÂÂş‰~‹^Šˆ®˜‹.ˆ~‰N‹Rò“°Ğ¢76W'BæÖF6‚†‡FÖÂÂş‰®Š>‹Nˆ‹.Š>‰N‹Rò“°Ğ¢76W'BæÖF6‚†‡FÖÂÂöFFÖ7F–öãÒ&÷VâÖW6Æ—"ò“°Ğ¢76W'BæFöW4æ÷DÖF6‚†‡FÖÂÂöFF×&Wf–WrÖf÷&×ÆFFÖ6FÆör×&Wf–WrÖf÷&Òò“°Ğ§Ò“°Ğ Ğ§FW7B‚'–ÖVçB7FGW6W2&R7W7FöÖW"Öf6–ærF†’æBVæ¶æ÷vâfÇVW2&R†–FFVâ"Â‚’Óâ°Ğ¢6öç7BÒÆöEG&6¶–æu'VçF–ÖR‚“°Ğ¢76W'BæWVÂ†çG&6¶–ærå÷FW7Bç–ÖVçE7FGW4Æ&VÂ‚'Vç–B"’Â.Š.‹ˆ~˜NŠ˜ˆ®‹>Š>‹"“°Ğ¢76W'BæWVÂ†çG&6¶–ærå÷FW7Bç–ÖVçE7FGW4Æ&VÂ‚'–B"’Â.ˆ®‹>Š>‹˜Š^˜Šr"“°Ğ¢76W'BæWVÂ†çG&6¶–ærå÷FW7Bç–ÖVçE7FGW4Æ&VÂ‚''F–Â"’Â.ˆ®‹>Š>‹‰®‹.ˆ~Š®˜Š~‰’"“°Ğ¢76W'BæWVÂ†çG&6¶–ærå÷FW7Bç–ÖVçE7FGW4Æ&VÂ‚'VæF–ær"’Â.Š>ŠŞ‰^Š>Š~ˆŠ®ŠŞ‰®ˆ‹.Š>ˆ®‹>Š>‹"“°Ğ¢76W'BæWVÂ†çG&6¶–ærå÷FW7Bç–ÖVçE7FGW4Æ&VÂ‚'&÷f–FW%ö–çFW&æÅ÷7FFR"’Â.ˆŠ>‹‰>‹.‰^‹N‰N‰^˜ŠÒ5tb˜‰î‹~˜ŠŞ‰^Š>Š~ˆŠ®ŠŞ‰®ˆ‹.Š>ˆ®‹>Š>‹"“°Ğ§Ò“°Ğ Ğ§FW7B‚'G&6¶–ærT’W‡÷6W2ÆöF–ærÂæ÷BÖf÷VæBÂ&FRÖÆ–Ö—BæBöffÆ–æR7FFW2"Â‚’Óâ°Ğ¢6öç7BÒÆöEG&6¶–æu'VçF–ÖR‚“°Ğ¢ç7FFRçG&6¶–ærÒ²7FGW3¢&ÆöF–ær"ÂFF¢çVÆÂÂW'&÷#¢""Ó°Ğ¢76W'BæÖF6‚†çG&6¶–ærå÷FW7Bç&VæFW%G&6¶–æu&W7VÇB‚’Â÷G&6¶–ær×6¶VÆWFöâò“°Ğ Ğ¢ç7FFRçG&6¶–ærÒ²7FGW3¢&W'&÷""ÂW'&÷$¶–æC¢&æ÷BÖf÷VæB"ÂW'&÷#¢&æ÷Bf÷VæB"Ó°Ğ¢76W'BæÖF6‚†çG&6¶–ærå÷FW7Bç&VæFW%G&6¶–æu&W7VÇB‚’Âş˜NŠ˜‰î‰®ˆ~‹.‰‰‹^˜’ò“°Ğ Ğ¢ç7FFRçG&6¶–ærÒ²7FGW3¢&W'&÷""ÂW'&÷$¶–æC¢'&FR"Â&WG'”gFW#¢C"Ó°Ğ¢76W'BæÖF6‚†çG&6¶–ærå÷FW7Bç&VæFW%G&6¶–æu&W7VÇB‚’ÂóC"Š~‹N‰‹.‰~‹Rò“°Ğ Ğ¢ç7FFRçG&6¶–ærÒ²7FGW3¢&W'&÷""ÂW'&÷$¶–æC¢&æWGv÷&²"Ó°Ğ¢76W'BæÖF6‚†çG&6¶–ærå÷FW7Bç&VæFW%G&6¶–æu&W7VÇB‚’Âş˜ˆ®‹~˜ŠŞŠ‰^˜ŠŞŠ>‹‰®‰®˜NŠ˜˜N‰N˜’ò“°Ğ¢76W'BæÖF6‚†çG&6¶–ærå÷FW7Bç&VæFW%G&6¶–æu&W7VÇB‚’ÂöFFÖ7F–öãÒ'G&6²×&WG'’"ò“°Ğ§Ò“°Ğ Ğ§FW7B‚'G&6¶–ær76WG26†&RF†RgVÆÂ×&VB66†R'V–ÆB–B"Â‚’Óâ°Ğ¢6öç7B'V–ÆBÒ###cs#e÷W&vVçEöF—&V7EöWFõööffW%÷c#°¢f÷"†6öç7Bf–ÆRöb°Ğ¢&7W7FöÖW"Öö–æFW‚æ‡FÖÂ"ÀĞ¢&7W7FöÖW"Ö÷7ræ§2"ÀĞ¢&7W7FöÖW"Öö76WG2ö7W7FöÖW"Öæ§2"ÀĞ¢&7W7FöÖW"ÖöÖæ–fW7BçvV&Öæ–fW7B"ÀĞ¢Ò’°Ğ¢6öç7B6÷W&6RÒg2ç&VDf–ÆU7–æ2‡F‚æ¦ö–â…$ôõBÂf–ÆR’Â'WFc‚"“°Ğ¢76W'BæÖF6‚‡6÷W&6RÂæWr&VtW‡†'V–ÆB’ÂG¶f–ÆWÒÖ—76–ær'V–ÆB–F“°Ğ¢ĞĞ¢76W'BæFöW4æ÷DÖF6‚†g2ç&VDf–ÆU7–æ2‡F‚æ¦ö–â…$ôõBÂ&7W7FöÖW"Öö–æFW‚æ‡FÖÂ"’Â'WFc‚"’Âó##cs%÷vUö6öçG&öÇ5÷G&6¶–æuöÆ–æµ÷cBò“°Ğ§Ò“°Ğ Ğ§FW7B‚'G&6¶–ær’Æöö·W—2W‡Æ–6—FÇ’æò×7F÷&R"Â‚’Óâ°Ğ¢6öç7B’Òg2ç&VDf–ÆU7–æ2‡F‚æ¦ö–â…$ôõBÂ&7W7FöÖW"ÖöÖöGVÆW2ö’æ§2"’Â'WFc‚"“°Ğ¢76W'BæÖF6‚†’Â÷&WVW7D§6öåÂ‚%Â÷V&Æ–5Â÷G&6²"ÂÇ²VW'“¢Ç²ÇÒÂ66†S¢&æò×7F÷&R"ÇÕÂ’ò“°Ğ§Ò“°Ğ Ğ§FW7B‚'G&6¶–ærÖö&–ÆR552&÷f–FW23có3“×6fRw&–æræBF÷V6‚F&vWG2"Â‚’Óâ°Ğ¢6öç7B772Òg2ç&VDf–ÆU7–æ2‡F‚æ¦ö–â…$ôõBÂ&7W7FöÖW"Öö76WG2ö7W7FöÖW"Öæ772"’Â'WFc‚"“°Ğ¢76W'BæÖF6‚†772ÂôÖVF–Â†Ö‚×v–GFƒ¢C#…Â’ò“°Ğ¢76W'BæÖF6‚†772ÂõÂçG&6¶–ærÖ6öFR×w&ÇµµÇ5Å5Ò£öÖ–â×v–GFƒ¢ò“°Ğ¢76W'BæÖF6‚†772ÂõÂçG&6¶–ærÖ6÷’Ö'FâÇµµÇ5Å5Ò£öÖ–âÖ†V–v‡C¢CG‚ò“°Ğ¢76W'BæÖF6‚†772ÂõÂçG&6¶–ærÖ6öFR×–ÆÂÇµµÇ5Å5Ò£ö÷fW&fÆ÷r×w&¢ç—v†W&Rò“°Ğ¢76W'BæÖF6‚†772ÂôÖVF–Â‡&VfW'2×&VGV6VBÖÖ÷F–öã¢&VGV6UÂ’ò“°Ğ¢76W'BæÖF6‚†772ÂõÂçVæ—BÖ–ç7V7F–öâÖw&–BÇµµÇ5Å5Ò£öw&–B×FV×ÆFRÖ6öÇVÖç3¢&WVEÂƒ"ÂÖ–æÖ…ÂƒÂg%Â•Â’ò“°Ğ¢76W'BæÖF6‚†772ÂõÂçVæ—BÖ–ç7V7F–öâÖ—FVÓ¦Æ7BÖ6†–ÆC¦çF‚Ö6†–ÆEÂ†öFEÂ’ÇµµÇ5Å5Ò£öw&–BÖ6öÇVÖã¢ÂòÓò“°Ğ¢76W'BæÖF6‚†772ÂõÂçVæ—BÖ–ç7V7F–öâÖ—FVÒÇµµÇ5Å5Ò£öÖ–â×v–GFƒ¢ò“°Ğ¢76W'BæÖF6‚†772ÂõÂçVæ—BÖWf–FVæ6R7VÖÖ'’ÇµµÇ5Å5Ò£öÖ–âÖ†V–v‡C¢CG‚ò“°Ğ¢76W'BæÖF6‚†772ÂõÂç77÷'B×6†VÆÂÇµµÇ5Å5Ò£ö÷fW&fÆ÷s¢†–FFVâò“°Ğ¢76W'BæÖF6‚†772ÂõÂçVæ—BÖ6ÆVæÆ–æW72Ö6&BÇµµÇ5Å5Ò£öÖ–â×v–GFƒ¢µÇ5Å5Ò£ö÷fW&fÆ÷s¢†–FFVâò“°Ğ¢76W'BæÖF6‚†772ÂõÂçVæ—BÖ6ÆVæÆ–æW72ÖÖ–âÇµµÇ5Å5Ò£öw&–B×FV×ÆFRÖ6öÇVÖç3¢G‚Ö–æÖ…ÂƒÂg%Â’ò“°Ğ¢76W'BæÖF6‚†772ÂõÂæ6ÆVæÆ–æW72×&–ærÇµµÇ5Å5Ò£ö7V7B×&F–ó¢µÇ5Å5Ò£ö6öæ–2Öw&F–VçBò“°Ğ¢76W'BæÖF6‚†772ÂôÖVF–Â†Ö‚×v–GFƒ¢3ƒ…Â’ÇµµÇ5Å5Ò£õÂçVæ—BÖ6ÆVæÆ–æW72ÖÖ–âÇµµÇ5Å5Ò£ó“'‚Ö–æÖ…ÂƒÂg%Â’ò“°Ğ§Ò“°Ğ 