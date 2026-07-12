"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const TRACKING_SOURCE = fs.readFileSync(path.join(ROOT, "customer-app/modules/tracking.js"), "utf8");

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
  const build = "20260712_tracking_full_read_v1";
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
});
