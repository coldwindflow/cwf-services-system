"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const index = read("index.js");
const bookingService = read("server/services/booking/createBookingJob.js");
const adminReview = read("admin-review-v2.js");
const adminReviewHtml = read("admin-review-v2.html");
const scheduled = read("customer-app/modules/bookingScheduled.js");
const state = read("customer-app/modules/state.js");
const customerIndex = read("customer-app/index.html");
const customerSw = read("customer-app/sw.js");
const customerManifest = read("customer-app/manifest.webmanifest");

const WAITING_URGENT_STATUS = "\u0e23\u0e2d\u0e0a\u0e48\u0e32\u0e07\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19";
const REVIEW_STATUSES = ["\u0e23\u0e2d\u0e15\u0e23\u0e27\u0e08\u0e2a\u0e2d\u0e1a", "pending_review", "\u0e15\u0e35\u0e01\u0e25\u0e31\u0e1a", "\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e0a\u0e48\u0e32\u0e07\u0e23\u0e31\u0e1a\u0e07\u0e32\u0e19", "\u0e23\u0e2d\u0e1e\u0e34\u0e08\u0e32\u0e23\u0e13\u0e32\u0e40\u0e27\u0e25\u0e32\u0e43\u0e2b\u0e21\u0e48"];

function simulateReviewQueueRows(rows, status = "all") {
  const wanted = String(status || "\u0e23\u0e2d\u0e15\u0e23\u0e27\u0e08\u0e2a\u0e2d\u0e1a").trim();
  const wantAll = wanted.toLowerCase() === "all";
  return rows
    .filter((row) => row.canceled_at == null)
    .filter((row) => ["scheduled", "", "urgent"].includes(String(row.booking_mode ?? "scheduled")))
    .filter((row) => {
      const isCustomerUrgentWaiting = row.job_status === WAITING_URGENT_STATUS
        && String(row.booking_mode || "") === "urgent"
        && String(row.job_source || "") === "customer";
      if (wantAll) return REVIEW_STATUSES.includes(row.job_status) || isCustomerUrgentWaiting;
      if (wanted === WAITING_URGENT_STATUS) return isCustomerUrgentWaiting;
      return REVIEW_STATUSES.includes(wanted) && row.job_status === wanted;
    })
    .map((row) => ({
      ...row,
      admin_action_required: !(String(row.booking_mode || "") === "urgent" && row.job_status === WAITING_URGENT_STATUS),
    }));
}

function deriveTestScheduledToken(requestKey) {
  return crypto.createHash("sha256").update(`scheduled_v1:${String(requestKey || "").trim()}`).digest("hex").slice(0, 24);
}

function validScheduledRequestKey(value) {
  return /^[A-Za-z0-9_-]{16,128}$/.test(String(value || "").trim());
}

async function simulateScheduledCustomerBook(store, body) {
  const bm = String(body.booking_mode || "scheduled").trim().toLowerCase();
  const clientApp = String(body.client_app || "").trim().toLowerCase();
  const requestKey = bm === "scheduled" && clientApp === "customer_app_v2"
    ? String(body.scheduled_request_key || "").trim()
    : "";
  if (bm === "scheduled" && clientApp === "customer_app_v2" && !validScheduledRequestKey(requestKey)) {
    return { status: 400, body: { code: "MISSING_REQUEST_KEY" } };
  }
  const token = requestKey ? deriveTestScheduledToken(requestKey) : `random-${store.nextId}`;
  store.ops.push("BEGIN");
  await store.lock(requestKey);
  store.ops.push("lock");
  const existing = store.jobsByToken.get(token);
  store.ops.push("lookup");
  if (existing) {
    store.unlock(requestKey);
    store.ops.push("COMMIT");
    return { status: 200, body: { ...existing, replayed: true } };
  }
  store.ops.push("reserve");
  store.reserveCount += 1;
  const job = {
    job_id: store.nextId++,
    booking_code: `CWF${store.nextId}`,
    token,
  };
  store.jobsByToken.set(token, job);
  store.unlock(requestKey);
  store.ops.push("COMMIT");
  return { status: 200, body: { ...job, replayed: false } };
}

function createScheduledStore() {
  const queues = new Map();
  const store = {
    nextId: 1,
    jobsByToken: new Map(),
    reserveCount: 0,
    ops: [],
    async lock(key) {
      const prior = queues.get(key) || Promise.resolve();
      let release;
      queues.set(key, new Promise((resolve) => { release = resolve; }));
      await prior;
      store.currentRelease = release;
    },
    unlock() {
      const release = store.currentRelease;
      store.currentRelease = null;
      if (release) release();
    },
  };
  return store;
}

function createElement(id = "") {
  const classes = new Set();
  return {
    id,
    value: "",
    textContent: "",
    innerHTML: "",
    disabled: false,
    style: {},
    parentNode: null,
    removedClass: "",
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); this.removedClass = name; },
      toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
    addEventListener() {},
    setAttribute() {},
    getAttribute() { return ""; },
    closest() { return null; },
  };
}

function createAdminReviewSandbox(options = {}) {
  const elements = new Map();
  const card = createElement("card-2");
  card.classList.add("review-card-new");
  const getElement = (id) => {
    if (!elements.has(id)) elements.set(id, createElement(id));
    return elements.get(id);
  };
  [
    "approvalAlert", "overlay", "list", "pillCount", "filterStatus", "slotBox",
    "mCustomerName", "mCustomerPhone", "mJobType", "mBookingCode", "mAppt",
    "mAddress", "mMaps", "mZone", "mLat", "mLng", "mNote", "mTitle", "mSub",
    "mTechType", "mPrimaryTech", "mDispatchMode", "mTeamSearch", "mTeamSuggest",
    "mTeamSelected", "mPricing", "mReadOnlyNotice", "btnLoadSlots", "btnSave",
    "btnDispatch", "btnRebroadcast", "btnCancel", "btnLoadPricing", "btnReload",
  ].forEach(getElement);
  getElement("filterStatus").value = "all";
  const storage = new Map();
  let now = 10_000;
  let soundCount = 0;
  class FakeDate extends Date {
    static now() { return now; }
  }
  class FakeAudioContext {
    createOscillator() {
      return { type: "", frequency: { value: 0 }, connect() {}, start() { soundCount += 1; }, stop() {} };
    }
    createGain() { return { gain: { value: 0 }, connect() {} }; }
    close() {}
  }
  const document = {
    title: "Admin Review Queue - CWF",
    hidden: false,
    readyState: "complete",
    head: { appendChild() {} },
    getElementById: getElement,
    createElement(id) {
      const el = createElement(id);
      el.parentNode = { insertBefore() {} };
      return el;
    },
    querySelector(selector) {
      if (selector === '[data-review-job-id="2"]') return card;
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  getElement("list").parentNode = { insertBefore() {} };
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    URL,
    Intl,
    Number,
    String,
    Array,
    Map,
    Set,
    JSON,
    Math,
    Date: FakeDate,
    document,
    location: { href: "", replace(value) { this.href = value; } },
    sessionStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
    },
    AudioContext: FakeAudioContext,
    webkitAudioContext: FakeAudioContext,
    confirm() { return true; },
    prompt() { return ""; },
    alert() {},
    showToast() {},
    apiFetch: options.apiFetch || (async (url, requestOptions = {}) => {
      if (requestOptions.method) throw new Error(`unexpected mutation ${requestOptions.method} ${url}`);
      if (/\/team/.test(url)) return { members: [] };
      if (/\/pricing/.test(url)) return { total: 0, discount: 0 };
      return {};
    }),
    window: null,
    __advance(ms) { now += ms; },
    __soundCount() { return soundCount; },
    __card: card,
    __elements: elements,
  };
  sandbox.window = sandbox;
  sandbox.window.__CWF_ADMIN_REVIEW_DISABLE_AUTO_INIT__ = true;
  vm.createContext(sandbox);
  vm.runInContext(adminReview, sandbox, { filename: "admin-review-v2.js" });
  return sandbox;
}

function loadAiIntakeIntoSandbox(sandbox) {
  sandbox.window.__CWF_AI_INTAKE_DISABLE_AUTO_INIT__ = true;
  vm.runInContext(read("admin-review-ai-intake.js"), sandbox, { filename: "admin-review-ai-intake.js" });
  return sandbox.window.__CWF_AI_INTAKE_TEST__;
}

test("scheduled customer booking has durable request-key idempotency before reservation", () => {
  assert.match(bookingService, /function deriveCustomerScheduledBookingToken\(requestKey\)/);
  assert.match(bookingService, /scheduled_request_key/);
  assert.match(bookingService, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
  assert.match(bookingService, /WHERE booking_token=\$1[\s\S]*job_source='customer'[\s\S]*booking_mode=\$2/);
  assert.match(bookingService, /replayed:\s*true/);
  assert.match(bookingService, /validScheduledRequestKey/);
  assert.match(bookingService, /\^\[A-Za-z0-9_-\]\{16,128\}\$/);
  assert.ok(bookingService.indexOf("SELECT pg_advisory_xact_lock(hashtext($1))") < bookingService.indexOf("reservePublicCustomerTechnician"));
});

test("scheduled customer app sends one request key and clears it on new booking reset", () => {
  assert.match(state, /scheduled_request_key:\s*""/);
  assert.match(scheduled, /function ensureScheduledRequestKey\(\)/);
  assert.match(scheduled, /root\.utils\.randomKey\(\)/);
  assert.match(scheduled, /scheduled_request_key:\s*ensureScheduledRequestKey\(\)/);
  assert.match(scheduled, /root\.state\.resetScheduledDraft\(\)/);
});

test("admin review queue includes urgent waiting rows as read-only without offer join duplication", () => {
  assert.match(index, /WAITING_URGENT_STATUS/);
  assert.doesNotMatch(index, /allow\.push\(WAITING_URGENT_STATUS\)/);
  assert.match(index, /COALESCE\(booking_mode,''\)='urgent' AND COALESCE\(job_source,''\)='customer'/);
  assert.match(index, /pending_offer_count/);
  assert.match(index, /json_agg\(json_build_object/);
  assert.match(index, /AS items/);
  assert.match(index, /AS service_units/);
  assert.match(index, /AS admin_action_required/);
  assert.doesNotMatch(index, /FROM public\.jobs\s+j\s+JOIN public\.job_offers/);
});

test("admin review UI separates waiting urgent jobs and disables duplicate dispatch actions", () => {
  assert.match(adminReviewHtml, /<option value="waiting">กำลังรอช่างรับ<\/option>/);
  assert.doesNotMatch(adminReviewHtml, /\?{6,}/);
  assert.doesNotMatch(adminReviewHtml, /\uFFFD/);
  assert.match(adminReview, /waiting:\s*REVIEW_WAITING_STATUS/);
  assert.match(adminReview, /function queueBucket\(row\)/);
  assert.match(adminReview, /waiting_technician/);
  assert.match(adminReview, /function isAdminActionAllowed\(row\)/);
  assert.match(adminReview, /function applyReadOnlyMode\(readOnly\)/);
  assert.match(adminReview, /งานนี้กำลังรอช่างรับ ระบบเปิดให้ดูรายละเอียดเท่านั้น/);
  assert.match(adminReview, /function blockReadOnlyMutation\(\)/);
  assert.match(adminReview, /\$\{actionAllowed \? "" : "disabled"\} onclick="rebroadcastOfferQuick/);
});

test("admin review polling is visible-only, single-flight, and auth-aware", () => {
  assert.match(adminReview, /const REVIEW_POLL_MS = 12000/);
  assert.match(adminReview, /REVIEW_QUEUE_LOAD_GUARD\.inFlight/);
  assert.match(adminReview, /function scheduleReviewQueuePolling\(\)/);
  assert.match(adminReview, /document\.hidden/);
  assert.match(adminReview, /visibilitychange/);
  assert.match(adminReview, /window\.addEventListener\("focus"/);
  assert.match(adminReview, /window\.addEventListener\("pageshow"/);
  assert.match(adminReview, /window\.addEventListener\("pagehide"/);
  assert.match(adminReview, /beforeunload/);
  assert.match(adminReview, /Number\(e\.status\) === 401 \|\| Number\(e\.status\) === 403/);
  assert.match(adminReview, /stopPollingForAuth\(\)/);
});

test("admin review new-job notification uses first-load baseline and one sound per job id", () => {
  assert.match(adminReview, /baselineReady/);
  assert.match(adminReview, /knownIds/);
  assert.match(adminReview, /notifiedIds/);
  assert.match(adminReview, /sessionStorage\.getItem\(REVIEW_NOTIFY_STORAGE_KEY\)/);
  assert.match(adminReview, /sessionStorage\.setItem\(REVIEW_NOTIFY_STORAGE_KEY/);
  assert.match(adminReview, /reason === "filter_change" \|\| reason === "manual_reload"/);
  assert.match(adminReview, /AudioContext \|\| window\.webkitAudioContext/);
  assert.match(adminReview, /__CWF_ADMIN_ALERT_GATE__/);
  assert.match(adminReview, /function acknowledgeNewJob\(jobId\)/);
  assert.match(adminReview, /function pruneNewJobIds\(rows\)/);
  assert.match(adminReview, /function filterRowsForDisplay\(rows, selectedFilter\)/);
  assert.match(adminReview, /review-card-new/);
  assert.match(adminReview, /document\.title = count > 0/);
});

test("admin/customer frontend cache versions are bumped for booking notification changes", () => {
  assert.match(adminReviewHtml, /admin-review-v2\.js\?v=20260719_customer_booking_pr3_v1/);
  assert.doesNotMatch(adminReviewHtml, /admin-review-v2\.js\?v=20260707_customer_booking_notify_v2/);
  assert.match(adminReviewHtml, /admin-review-ai-intake\.js\?v=ai-booking-intake-customer-cards-v11-admin-alert-gate/);
  assert.doesNotMatch(adminReviewHtml, /admin-review-ai-intake\.js\?v=ai-booking-intake-customer-cards-v10/);
  assert.match(customerIndex, /bookingScheduled\.js\?v=20260718_remove_route_header_icons_v1/);
  assert.match(customerIndex, /state\.js\?v=20260718_remove_route_header_icons_v1/);
  assert.match(customerSw, /const BUILD_ID = "20260718_remove_route_header_icons_v1"/);
  assert.match(customerManifest, /20260718_remove_route_header_icons_v1/);
});

test("behavior: review queue only includes customer urgent waiting rows while preserving review statuses", () => {
  const rows = [
    { job_id: 1, job_status: WAITING_URGENT_STATUS, booking_mode: "urgent", job_source: "customer", canceled_at: null },
    { job_id: 2, job_status: WAITING_URGENT_STATUS, booking_mode: "urgent", job_source: "admin", canceled_at: null },
    { job_id: 3, job_status: WAITING_URGENT_STATUS, booking_mode: "scheduled", job_source: "customer", canceled_at: null },
    { job_id: 4, job_status: "\u0e23\u0e2d\u0e15\u0e23\u0e27\u0e08\u0e2a\u0e2d\u0e1a", booking_mode: "scheduled", job_source: "customer", canceled_at: null },
    { job_id: 5, job_status: "pending_review", booking_mode: "scheduled", job_source: "customer", canceled_at: null },
    { job_id: 6, job_status: "\u0e15\u0e35\u0e01\u0e25\u0e31\u0e1a", booking_mode: "urgent", job_source: "customer", canceled_at: null },
    { job_id: 7, job_status: "\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e0a\u0e48\u0e32\u0e07\u0e23\u0e31\u0e1a\u0e07\u0e32\u0e19", booking_mode: "urgent", job_source: "customer", canceled_at: null },
    { job_id: 8, job_status: "\u0e23\u0e2d\u0e1e\u0e34\u0e08\u0e32\u0e23\u0e13\u0e32\u0e40\u0e27\u0e25\u0e32\u0e43\u0e2b\u0e21\u0e48", booking_mode: "urgent", job_source: "customer", canceled_at: null },
  ];
  const all = simulateReviewQueueRows(rows, "all");
  assert.deepEqual(all.map((row) => row.job_id), [1, 4, 5, 6, 7, 8]);
  assert.equal(all.find((row) => row.job_id === 1).admin_action_required, false);
  assert.equal(all.some((row) => row.job_id === 2), false);
  assert.equal(all.some((row) => row.job_id === 3), false);

  const waitingOnly = simulateReviewQueueRows(rows, WAITING_URGENT_STATUS);
  assert.deepEqual(waitingOnly.map((row) => row.job_id), [1]);
  assert.equal(waitingOnly[0].admin_action_required, false);
});

test("security: admin review queue escapes untrusted customer, item, proposal, technician, and error HTML", async () => {
  const imgPayload = '<img src=x onerror="window.__xss=1">';
  const scriptPayload = '</div><script>window.__xss=1</script>';
  const attrPayload = '" autofocus onfocus="window.__xss=1';
  const row = {
    job_id: 101,
    booking_code: `CWF-${attrPayload}`,
    booking_mode: "scheduled",
    job_status: REVIEW_STATUSES[4],
    customer_name: imgPayload,
    customer_phone: attrPayload,
    address_text: scriptPayload,
    job_zone: attrPayload,
    job_type: imgPayload,
    technician_username: attrPayload,
    maps_url: `javascript:${attrPayload}`,
    items: [{ item_name: imgPayload, qty: 2 }],
    admin_action_required: true,
  };
  const sandbox = createAdminReviewSandbox({
    apiFetch: async (url, requestOptions = {}) => {
      if (requestOptions.method) throw new Error(`unexpected mutation ${requestOptions.method} ${url}`);
      if (/review_queue_v2/.test(url)) return { rows: [row] };
      if (/time-proposals/.test(url)) {
        return {
          rows: [{
            proposal_id: 5,
            status: "pending",
            technician_name: imgPayload,
            technician_username: attrPayload,
            note: scriptPayload,
            proposed_datetime: "2026-07-10T10:00:00+07:00",
          }],
        };
      }
      return { members: [], total: 0, discount: 0 };
    },
  });
  const hooks = sandbox.window.__CWF_ADMIN_REVIEW_TEST__;
  await hooks.loadQueue({ force: true, reason: "security" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const rendered = [
    sandbox.__elements.get("list").innerHTML,
    sandbox.__elements.get("proposal-panel-101").innerHTML,
  ].join("\n");
  assert.doesNotMatch(rendered, /<img/i);
  assert.doesNotMatch(rendered, /<script/i);
  assert.doesNotMatch(rendered, /onerror=/i);
  assert.doesNotMatch(rendered, /onfocus=/i);
  assert.match(rendered, /&lt;img src&#61;x onerror&#61;&quot;window\.__xss&#61;1&quot;&gt;/);
  assert.match(rendered, /&lt;\/div&gt;&lt;script&gt;window\.__xss&#61;1&lt;\/script&gt;/);

  const errorSandbox = createAdminReviewSandbox({
    apiFetch: async (url) => {
      if (/review_queue_v2/.test(url)) throw new Error(imgPayload);
      return {};
    },
  });
  await errorSandbox.window.__CWF_ADMIN_REVIEW_TEST__.loadQueue({ force: true, reason: "security_error" });
  const errorHtml = errorSandbox.__elements.get("list").innerHTML;
  assert.doesNotMatch(errorHtml, /<img/i);
  assert.doesNotMatch(errorHtml, /onerror=/i);
  assert.match(errorHtml, /&lt;img src&#61;x onerror&#61;&quot;window\.__xss&#61;1&quot;&gt;/);
});

test("security: admin review queue blocks unsafe Maps URLs and preserves valid external HTTP links", async () => {
  const unsafeUrls = [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "/maps",
    "//evil.example",
    "not a url",
    '" autofocus onfocus="window.__xss=1',
  ];
  for (const maps_url of unsafeUrls) {
    const sandbox = createAdminReviewSandbox({
      apiFetch: async (url) => {
        if (/review_queue_v2/.test(url)) {
          return { rows: [{ job_id: 201, job_status: REVIEW_STATUSES[0], booking_mode: "scheduled", maps_url, admin_action_required: true }] };
        }
        return {};
      },
    });
    await sandbox.window.__CWF_ADMIN_REVIEW_TEST__.loadQueue({ force: true, reason: "security_url" });
    const rendered = sandbox.__elements.get("list").innerHTML;
    assert.doesNotMatch(rendered, /<a href=/i, maps_url);
    assert.doesNotMatch(rendered, /javascript:/i, maps_url);
    assert.doesNotMatch(rendered, /data:/i, maps_url);
    assert.doesNotMatch(rendered, /onfocus=/i, maps_url);
  }

  for (const maps_url of [
    "https://maps.google.com/?q=13.7000,100.6000",
    "https://www.google.com/maps/place/test",
    "http://maps.example.com/location",
  ]) {
    const sandbox = createAdminReviewSandbox({
      apiFetch: async (url) => {
        if (/review_queue_v2/.test(url)) {
          return { rows: [{ job_id: 202, job_status: REVIEW_STATUSES[0], booking_mode: "scheduled", maps_url, admin_action_required: true }] };
        }
        return {};
      },
    });
    await sandbox.window.__CWF_ADMIN_REVIEW_TEST__.loadQueue({ force: true, reason: "security_url_valid" });
    const rendered = sandbox.__elements.get("list").innerHTML;
    assert.match(rendered, /<a href="https?:\/\//i);
    assert.match(rendered, /target="_blank"/);
    assert.match(rendered, /rel="noopener noreferrer"/);
  }
});

test("behavior: concurrent scheduled requests with the same key create one job and one reservation", async () => {
  const store = createScheduledStore();
  const body = {
    booking_mode: "scheduled",
    client_app: "customer_app_v2",
    scheduled_request_key: "same-request-key-123",
  };
  const [a, b] = await Promise.all([
    simulateScheduledCustomerBook(store, body),
    simulateScheduledCustomerBook(store, body),
  ]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(a.body.job_id, b.body.job_id);
  assert.equal(a.body.booking_code, b.body.booking_code);
  assert.equal(a.body.token, b.body.token);
  assert.equal(store.jobsByToken.size, 1);
  assert.equal(store.reserveCount, 1);
  assert.ok([a.body.replayed, b.body.replayed].includes(true));
  assert.deepEqual(store.ops.slice(0, 4), ["BEGIN", "BEGIN", "lock", "lookup"]);
  assert.ok(store.ops.indexOf("reserve") > store.ops.indexOf("lookup"));
});

test("behavior: missing scheduled request key for Customer App V2 is rejected", async () => {
  const store = createScheduledStore();
  const res = await simulateScheduledCustomerBook(store, {
    booking_mode: "scheduled",
    client_app: "customer_app_v2",
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "MISSING_REQUEST_KEY");
  assert.equal(store.reserveCount, 0);
  assert.equal(store.jobsByToken.size, 0);
});

test("behavior: urgent waiting modal is viewable but all mutation paths are read-only", async () => {
  const sandbox = createAdminReviewSandbox();
  const hooks = sandbox.window.__CWF_ADMIN_REVIEW_TEST__;
  hooks.setRowMap([{
    job_id: 7,
    booking_code: "URG-7",
    booking_mode: "urgent",
    job_status: "รอช่างยืนยัน",
    admin_action_required: false,
    duration_min: 60,
  }]);
  await hooks.openJob(7);
  assert.equal(hooks.getCurrent().job_id, 7);
  for (const id of ["btnSave", "btnDispatch", "btnRebroadcast", "btnCancel", "btnLoadSlots", "mCustomerName", "mAppt", "mTechType", "mPrimaryTech", "mDispatchMode"]) {
    assert.equal(sandbox.__elements.get(id).disabled, true, `${id} should be disabled`);
  }
  assert.equal(sandbox.__elements.get("mReadOnlyNotice").style.display, "block");
  await hooks.saveJob();
  await hooks.dispatchJob();
  await hooks.rebroadcastOffer();
  await hooks.rebroadcastOfferQuick(7);
  await hooks.cancelJob();
});

test("behavior: notification checks all queue rows even when selected display filter hides the new job", () => {
  const sandbox = createAdminReviewSandbox();
  const hooks = sandbox.window.__CWF_ADMIN_REVIEW_TEST__;
  hooks.REVIEW_QUEUE_NOTIFY.audioUnlocked = true;
  const waiting = { job_id: 1, booking_mode: "urgent", job_status: "รอช่างยืนยัน", admin_action_required: false };
  const scheduledPending = { job_id: 2, booking_mode: "scheduled", job_status: "รอตรวจสอบ", admin_action_required: true };
  hooks.processQueueNotifications([waiting], { reason: "init" });
  assert.deepEqual(hooks.filterRowsForDisplay([waiting, scheduledPending], "waiting").map((r) => r.job_id), [1]);
  hooks.processQueueNotifications([waiting, scheduledPending], { reason: "poll" });
  assert.equal(hooks.REVIEW_QUEUE_NOTIFY.newIds.has(2), true);
  assert.equal(sandbox.document.title, "(1) Admin Review Queue - CWF");
  assert.equal(sandbox.__soundCount(), 1);
});

test("behavior: unread jobs acknowledge on open, prune when gone, and do not sound twice", () => {
  const sandbox = createAdminReviewSandbox();
  const hooks = sandbox.window.__CWF_ADMIN_REVIEW_TEST__;
  hooks.REVIEW_QUEUE_NOTIFY.audioUnlocked = true;
  const one = { job_id: 1, job_status: "รอตรวจสอบ", admin_action_required: true };
  const two = { job_id: 2, job_status: "รอตรวจสอบ", admin_action_required: true };
  const three = { job_id: 3, job_status: "รอตรวจสอบ", admin_action_required: true };
  hooks.processQueueNotifications([one], { reason: "init" });
  hooks.processQueueNotifications([one, two], { reason: "poll" });
  assert.equal(hooks.REVIEW_QUEUE_NOTIFY.newIds.has(2), true);
  hooks.setRowMap([one, two]);
  hooks.acknowledgeNewJob(2);
  assert.equal(hooks.REVIEW_QUEUE_NOTIFY.newIds.size, 0);
  assert.equal(hooks.REVIEW_QUEUE_NOTIFY.notifiedIds.has(2), true);
  assert.equal(sandbox.document.title, "Admin Review Queue - CWF");
  assert.equal(sandbox.__card.classList.contains("review-card-new"), false);
  const soundAfterAck = sandbox.__soundCount();
  hooks.processQueueNotifications([one, two], { reason: "poll" });
  assert.equal(sandbox.__soundCount(), soundAfterAck);
  sandbox.__advance(2000);
  hooks.processQueueNotifications([one, two, three], { reason: "poll" });
  assert.equal(hooks.REVIEW_QUEUE_NOTIFY.newIds.has(3), true);
  hooks.processQueueNotifications([one, two], { reason: "poll" });
  assert.equal(hooks.REVIEW_QUEUE_NOTIFY.newIds.has(3), false);
  assert.equal(sandbox.document.title, "Admin Review Queue - CWF");
});

test("behavior: Customer Booking and LINE AI Intake share one sound throttle gate", () => {
  const sandbox = createAdminReviewSandbox();
  const admin = sandbox.window.__CWF_ADMIN_REVIEW_TEST__;
  const ai = loadAiIntakeIntoSandbox(sandbox);
  admin.REVIEW_QUEUE_NOTIFY.audioUnlocked = true;
  admin.playNewJobSound();
  assert.equal(sandbox.__soundCount(), 1);
  ai.playSoftAlert();
  assert.equal(sandbox.__soundCount(), 1);
  sandbox.__advance(1600);
  ai.playSoftAlert();
  assert.equal(sandbox.__soundCount(), 2);
  ai.render([{ id: 9, status: "READY_TO_CREATE_JOB", updated_at: "t2", line_display_name: "LINE Customer" }], "");
  assert.equal(sandbox.__elements.get("aiIntakePanel").style.display, "flex");
});
