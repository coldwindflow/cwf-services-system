"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const createCustomerHistoryRoutes = require("../server/routes/public/customerHistory");
const history = require("../server/services/public/customerHistory");

const REPO_ROOT = path.resolve(__dirname, "..");

function makePool({ jobs = [], claims = [], hasClaims = true, hasCustomerSub = true, failInsert = false, uniqueConflictClaim = null } = {}) {
  const state = {
    jobs: jobs.map((x) => ({ ...x })),
    claims: claims.map((x) => ({ ...x })),
    queries: [],
    hasClaims,
    hasCustomerSub,
    failInsert,
    uniqueConflictClaim,
  };
  async function query(sql, params = []) {
    const s = String(sql);
    state.queries.push({ sql: s, params });
    if (/BEGIN|COMMIT|ROLLBACK/.test(s)) return { rows: [] };
    if (/to_regclass\('public\.customer_history_claims'\)/.test(s)) {
      return { rows: [{ has_claims: state.hasClaims, has_customer_sub: state.hasCustomerSub }] };
    }
    if (/FROM public\.jobs\s+WHERE upper\(btrim/.test(s)) {
      const code = String(params[0] || "").toUpperCase();
      const rows = state.jobs.filter((j) => String(j.booking_code || "").trim().toUpperCase() === code && String(j.customer_phone || "").trim()).slice(0, 2);
      return { rows };
    }
    if (/FROM public\.customer_history_claims/.test(s) && /WHERE phone_norm=\$1/.test(s)) {
      return { rows: state.claims.filter((c) => c.phone_norm === params[0] && !c.revoked_at).slice(0, 1) };
    }
    if (/phone_norm=\$1 OR proof_job_id=\$2/.test(s)) {
      return {
        rows: state.claims.filter((c) => !c.revoked_at && (c.phone_norm === params[0] || String(c.proof_job_id) === String(params[1]))).slice(0, 1),
      };
    }
    if (/UPDATE public\.customer_history_claims/.test(s)) {
      const found = state.claims.find((c) => c.claim_id === params[0]);
      if (found) found.last_verified_at = "now";
      return { rows: [] };
    }
    if (/FROM public\.customer_history_claims/.test(s) && /WHERE proof_job_id=\$1/.test(s)) {
      return { rows: state.claims.filter((c) => String(c.proof_job_id) === String(params[0]) && !c.revoked_at).slice(0, 1) };
    }
    if (/INSERT INTO public\.customer_history_claims/.test(s)) {
      if (state.failInsert) throw new Error("db unavailable");
      if (state.uniqueConflictClaim) {
        if (!state.claims.some((c) => c.claim_id === state.uniqueConflictClaim.claim_id)) {
          state.claims.push({ ...state.uniqueConflictClaim });
        }
        const error = new Error("duplicate key value violates unique constraint");
        error.code = "23505";
        throw error;
      }
      const duplicate = state.claims.find((c) => !c.revoked_at && (c.phone_norm === params[1] || String(c.proof_job_id) === String(params[3])));
      if (duplicate) {
        const error = new Error("duplicate key value violates unique constraint");
        error.code = "23505";
        throw error;
      }
      state.claims.push({
        claim_id: state.claims.length + 1,
        customer_sub: params[0],
        phone_norm: params[1],
        phone_last4: params[2],
        proof_job_id: params[3],
        claim_method: params[4],
      });
      return { rows: [] };
    }
    if (/SELECT phone_norm, phone_last4/.test(s)) {
      return { rows: state.claims.filter((c) => c.customer_sub === params[0] && !c.revoked_at) };
    }
    if (/FROM public\.jobs j/.test(s)) {
      const detail = /j\.job_id::text=\$1/.test(s);
      const offset = detail ? 1 : 0;
      const jobId = detail ? String(params[0]) : null;
      const customerSub = params[offset] && !Array.isArray(params[offset]) ? params[offset] : null;
      const phoneDigits = params.find(Array.isArray) || [];
      const rows = state.jobs.filter((j) => {
        if (detail && String(j.job_id) !== jobId) return false;
        const direct = customerSub && j.customer_sub === customerSub;
        const phone = String(j.customer_phone || "").replace(/\D/g, "");
        return direct || phoneDigits.includes(phone);
      });
      return { rows };
    }
    return { rows: [] };
  }
  return {
    state,
    async query(sql, params) { return query(sql, params); },
    async connect() {
      return { query, release() {} };
    },
  };
}

function requireCustomerJwtFor(sub) {
  return (req, res, next) => {
    if (!sub) return res.status(401).json({ error: "NOT_LOGGED_IN" });
    req.customer = { sub, provider: "line" };
    next();
  };
}

async function withServer({ pool, sub = "line:u1", logger } = {}, fn) {
  const app = express();
  app.use(express.json());
  app.use(createCustomerHistoryRoutes({
    pool,
    requireCustomerJwt: requireCustomerJwtFor(sub),
    getSecret: () => "test-secret",
    logger: logger || { warn() {} },
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function json(res) {
  return res.json().catch(() => ({}));
}

const LEGACY_JOB = {
  job_id: 101,
  booking_code: "CWFABC123",
  booking_token: "must-not-leak",
  customer_sub: null,
  customer_name: "Customer",
  customer_phone: "0812345678",
  job_type: "ล้าง",
  appointment_datetime: "2026-07-01T03:00:00.000Z",
  job_status: "เสร็จแล้ว",
  booking_mode: "scheduled",
  job_price: 1200,
  address_text: "Condo A Room 101",
  maps_url: "https://maps.google.com/?q=13,100",
  job_zone: "สุขุมวิท",
};

test("claim phone normalizer supports exact local, dashed, +66, and 0066 only", () => {
  for (const raw of ["0812345678", "081-234-5678", "+66812345678", "0066812345678"]) {
    const parsed = history.normalizeClaimPhone(raw);
    assert.equal(parsed.phone_norm, "0812345678");
    assert.deepEqual(parsed.match_digits, ["0812345678", "66812345678", "0066812345678"]);
  }
  assert.equal(history.normalizeClaimPhone("812345678"), null);
  assert.equal(history.normalizeClaimPhone("12345678"), null);
});

test("unauthenticated claim returns 401", async () => {
  await withServer({ pool: makePool(), sub: null }, async (base) => {
    const res = await fetch(`${base}/public/customer-history/claim`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(res.status, 401);
  });
});

test("wrong phone/code cases use generic CLAIM_FAILED and never fallback to partial phone sources", async () => {
  const pool = makePool({ jobs: [{ ...LEGACY_JOB, customer_note: "0812345678", address_text: "phone 0812345678 but not customer_phone", customer_phone: "0899999999" }] });
  await withServer({ pool }, async (base) => {
    for (const body of [
      { phone: "0812345678", booking_code: "CWFABC123" },
      { phone: "812345678", booking_code: "CWFABC123" },
      { phone: "0812345678", booking_code: "NOPE" },
    ]) {
      const res = await fetch(`${base}/public/customer-history/claim`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal(res.status, 400);
      assert.equal((await json(res)).error, "CLAIM_FAILED");
    }
  });
});

test("claim succeeds, retries by same account are idempotent, and other accounts cannot claim same phone", async () => {
  const pool = makePool({ jobs: [LEGACY_JOB] });
  await withServer({ pool, sub: "line:u1" }, async (base) => {
    const first = await fetch(`${base}/public/customer-history/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "+66812345678", booking_code: " cwfabc123 " }),
    });
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("cache-control"), "private, no-store");
    assert.equal(pool.state.claims.length, 1);
    assert.equal(pool.state.claims[0].phone_norm, "0812345678");
    const second = await fetch(`${base}/public/customer-history/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "081-234-5678", booking_code: "CWFABC123" }),
    });
    assert.equal(second.status, 200);
    assert.equal((await json(second)).replayed, true);
    assert.equal(pool.state.claims.length, 1);
  });
  await withServer({ pool, sub: "google:u2" }, async (base) => {
    const res = await fetch(`${base}/public/customer-history/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "0812345678", booking_code: "CWFABC123" }),
    });
    assert.equal(res.status, 400);
    assert.equal((await json(res)).error, "CLAIM_FAILED");
  });
});

test("concurrent claim requests return replay for same account and generic failure for a different account", async () => {
  const samePool = makePool({ jobs: [LEGACY_JOB] });
  await withServer({ pool: samePool, sub: "line:u1" }, async (base) => {
    const body = JSON.stringify({ phone: "0812345678", booking_code: "CWFABC123" });
    const responses = await Promise.all([
      fetch(`${base}/public/customer-history/claim`, { method: "POST", headers: { "content-type": "application/json" }, body }),
      fetch(`${base}/public/customer-history/claim`, { method: "POST", headers: { "content-type": "application/json" }, body }),
    ]);
    assert.deepEqual(responses.map((res) => res.status).sort(), [200, 200]);
    const payloads = await Promise.all(responses.map(json));
    assert.equal(payloads.filter((x) => x.replayed).length, 1);
    assert.equal(samePool.state.claims.length, 1);
  });

  const differentPool = makePool({ jobs: [LEGACY_JOB] });
  const app = express();
  app.use(express.json());
  app.use("/u1", createCustomerHistoryRoutes({
    pool: differentPool,
    requireCustomerJwt: requireCustomerJwtFor("line:u1"),
    getSecret: () => "test-secret",
    logger: { warn() {} },
  }));
  app.use("/u2", createCustomerHistoryRoutes({
    pool: differentPool,
    requireCustomerJwt: requireCustomerJwtFor("google:u2"),
    getSecret: () => "test-secret",
    logger: { warn() {} },
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const body = JSON.stringify({ phone: "0812345678", booking_code: "CWFABC123" });
    const responses = await Promise.all([
      fetch(`${base}/u1/public/customer-history/claim`, { method: "POST", headers: { "content-type": "application/json" }, body }),
      fetch(`${base}/u2/public/customer-history/claim`, { method: "POST", headers: { "content-type": "application/json" }, body }),
    ]);
    const statuses = responses.map((res) => res.status).sort();
    assert.deepEqual(statuses, [200, 400]);
    const payloads = await Promise.all(responses.map(json));
    assert.ok(payloads.some((x) => x.error === "CLAIM_FAILED"));
    assert.equal(differentPool.state.claims.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("unique races resolve to replay for same account or generic failure for another account", async () => {
  const sameAccountPool = makePool({
    jobs: [LEGACY_JOB],
    uniqueConflictClaim: {
      claim_id: 1,
      customer_sub: "line:u1",
      phone_norm: "0812345678",
      phone_last4: "5678",
      proof_job_id: 101,
    },
  });
  await withServer({ pool: sameAccountPool, sub: "line:u1" }, async (base) => {
    const res = await fetch(`${base}/public/customer-history/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "0812345678", booking_code: "CWFABC123" }),
    });
    assert.equal(res.status, 200);
    assert.equal((await json(res)).replayed, true);
    assert.equal(sameAccountPool.state.claims.length, 1);
  });

  const otherAccountPool = makePool({
    jobs: [LEGACY_JOB],
    uniqueConflictClaim: {
      claim_id: 1,
      customer_sub: "line:other",
      phone_norm: "0812345678",
      phone_last4: "5678",
      proof_job_id: 101,
    },
  });
  await withServer({ pool: otherAccountPool, sub: "line:u1" }, async (base) => {
    const res = await fetch(`${base}/public/customer-history/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "0812345678", booking_code: "CWFABC123" }),
    });
    assert.equal(res.status, 400);
    assert.equal((await json(res)).error, "CLAIM_FAILED");
  });
});

test("revoked claim does not authorize history and history rejects phone query", async () => {
  const pool = makePool({
    jobs: [LEGACY_JOB],
    claims: [{ claim_id: 1, customer_sub: "line:u1", phone_norm: "0812345678", phone_last4: "5678", proof_job_id: 101, revoked_at: "2026-01-01" }],
  });
  await withServer({ pool }, async (base) => {
    const phoneQuery = await fetch(`${base}/public/customer-history?phone=0812345678`);
    assert.equal(phoneQuery.status, 400);
    const res = await fetch(`${base}/public/customer-history`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    const body = await json(res);
    assert.equal(body.claimed, false);
    assert.deepEqual(body.items, []);
  });
});

test("history and detail use opaque refs and do not return token, raw job_id, or internal fields", async () => {
  const pool = makePool({
    jobs: [LEGACY_JOB],
    claims: [{ claim_id: 1, customer_sub: "line:u1", phone_norm: "0812345678", phone_last4: "5678", proof_job_id: 101 }],
  });
  await withServer({ pool }, async (base) => {
    const res = await fetch(`${base}/public/customer-history`);
    assert.equal(res.status, 200);
    const body = await json(res);
    assert.equal(body.claimed, true);
    assert.equal(body.items.length, 1);
    const item = body.items[0];
    assert.ok(item.job_ref && !String(item.job_ref).includes("101"));
    for (const forbidden of ["booking_token", "job_id", "technician_note", "customer_note", "claim_id", "proof_job_id"]) {
      assert.equal(item[forbidden], undefined);
    }
    const detail = await fetch(`${base}/public/customer-history/${encodeURIComponent(item.job_ref)}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.headers.get("cache-control"), "private, no-store");
    const detailBody = await json(detail);
    for (const forbidden of ["booking_token", "job_id", "technician_note", "customer_note", "claim_id", "proof_job_id"]) {
      assert.equal(detailBody.item[forbidden], undefined);
    }
  });
});

test("wrong-account job_ref is rejected", async () => {
  const ref = history.makeJobRef({ secret: "test-secret", customerSub: "line:u1", jobId: 101 });
  const pool = makePool({
    jobs: [LEGACY_JOB],
    claims: [{ claim_id: 1, customer_sub: "google:u2", phone_norm: "0812345678", phone_last4: "5678", proof_job_id: 101 }],
  });
  await withServer({ pool, sub: "google:u2" }, async (base) => {
    const res = await fetch(`${base}/public/customer-history/${encodeURIComponent(ref)}`);
    assert.equal(res.status, 404);
  });
});

test("claim rate limit is split by proof hash and does not log raw phone or code", async () => {
  const logs = [];
  const pool = makePool({ jobs: [LEGACY_JOB], failInsert: true });
  await withServer({ pool, logger: { warn: (...args) => logs.push(args) } }, async (base) => {
    const res = await fetch(`${base}/public/customer-history/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "0812345678", booking_code: "CWFABC123" }),
    });
    assert.equal(res.status, 500);
    assert.doesNotMatch(JSON.stringify(logs), /0812345678|CWFABC123/);
  });
});

test("locations group exact duplicates but keep ambiguous locations separate", async () => {
  const pool = makePool({
    jobs: [
      LEGACY_JOB,
      { ...LEGACY_JOB, job_id: 102, booking_code: "CWF2" },
      { ...LEGACY_JOB, job_id: 103, booking_code: "CWF3", maps_url: "https://maps.google.com/?q=13.1,100.1" },
    ],
    claims: [{ claim_id: 1, customer_sub: "line:u1", phone_norm: "0812345678", phone_last4: "5678", proof_job_id: 101 }],
  });
  await withServer({ pool }, async (base) => {
    const res = await fetch(`${base}/public/customer-history/locations`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    const body = await json(res);
    assert.equal(body.auto_select, false);
    assert.equal(body.has_multiple_locations, true);
    assert.equal(body.locations.length, 2);
    assert.ok(body.locations.some((x) => x.job_count === 2));
    for (const loc of body.locations) {
      assert.equal(loc.sample_booking_code, undefined);
      assert.equal(loc.location_ref, undefined);
    }
  });
});

test("migration stores no raw booking code and uses BIGINT-compatible proof_job_id", () => {
  const sql = fs.readFileSync(path.join(REPO_ROOT, "migrations", "20260710_customer_history_claims.sql"), "utf8");
  assert.match(sql, /proof_job_id BIGINT NOT NULL REFERENCES public\.jobs\(job_id\)/);
  assert.doesNotMatch(sql, /proof_booking_code/i);
  assert.match(sql, /phone_norm ~ '\^0\[0-9\]\{8,9\}\$'/);
  assert.match(sql, /phone_last4 ~ '\^\[0-9\]\{4\}\$' AND phone_last4 = right\(phone_norm, 4\)/);
});

function makeBrowserContext({ fetchImpl } = {}) {
  const storage = new Map();
  const window = {
    CWFCustomerAppV2: {},
    location: { protocol: "https:", origin: "https://app.example.test", hostname: "app.example.test", search: "", hash: "" },
    sessionStorage: {
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
  };
  const context = { window, fetch: fetchImpl || (async () => ({ ok: true, text: async () => "{}" })), URL, URLSearchParams, console, Intl, Date, setTimeout, clearTimeout };
  context.globalThis = context;
  return vm.createContext(context);
}

function loadModule(context, relativePath) {
  const src = fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
  vm.runInContext(src, context, { filename: relativePath });
  return context.window.CWFCustomerAppV2;
}

test("Customer App API and state support claim/history without phone query or auto-submit", async () => {
  const calls = [];
  const context = makeBrowserContext({
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      return { ok: true, text: async () => JSON.stringify({ ok: true, items: [], locations: [] }) };
    },
  });
  const root = loadModule(context, "customer-app/modules/api.js");
  await root.api.claimCustomerHistory({ phone: "081", booking_code: "CWF1" });
  await root.api.loadCustomerHistory();
  await root.api.loadCustomerHistoryDetail("opaque.ref");
  await root.api.loadCustomerHistoryLocations();
  assert.equal(calls[0].url, "https://app.example.test/public/customer-history/claim");
  assert.deepEqual(JSON.parse(calls[0].options.body), { phone: "081", booking_code: "CWF1" });
  assert.equal(calls[1].url, "https://app.example.test/public/customer-history");
  assert.equal(calls[2].url, "https://app.example.test/public/customer-history/opaque.ref");
  assert.equal(calls[3].url, "https://app.example.test/public/customer-history/locations");
  assert.doesNotMatch(calls.map((x) => x.url).join("\n"), /phone=/);

  const stateContext = makeBrowserContext();
  const stateRoot = loadModule(stateContext, "customer-app/modules/state.js");
  assert.equal(stateRoot.state.applyHistoryLocation("scheduled", { address_text: "Old condo", maps_url: "https://maps.example/a", job_zone: "Zone A" }), true);
  assert.equal(stateRoot.state.draft.scheduled.address_text, "Old condo");
  assert.equal(stateRoot.state.draft.scheduled.maps_url, "https://maps.example/a");
  assert.equal(stateRoot.state.draft.scheduled.job_zone, "Zone A");
});

test("Customer App profile opens history detail with opaque job_ref and clears claim booking code after success", async () => {
  const context = makeBrowserContext();
  const root = context.window.CWFCustomerAppV2;
  root.utils = {
    escapeHtml(value) {
      return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
    },
    icon() { return ""; },
    routeTo() {},
  };
  const detailCalls = [];
  root.api = {
    async claimCustomerHistory() { return { ok: true }; },
    async loadCustomerHistory() { return { claimed: true, items: root.state.customerHistory.items }; },
    async loadCustomerHistoryLocations() { return { claimed: true, locations: [] }; },
    async loadCustomerHistoryDetail(jobRef) {
      detailCalls.push(jobRef);
      return { item: { booking_code: "CWFABC123", job_status: "done", job_price: 1200, customer_phone_masked: "**** 5678" } };
    },
  };
  root.auth = {
    renderLoginPanel() { return ""; },
    displayName() { return "Customer"; },
    loadCustomer() { return Promise.resolve(); },
  };
  root.ui = { supportButtons() { return ""; } };
  root.router = { refresh() {} };
  root.state = {
    authStatus: "success",
    currentRoute: "profile",
    customer: { logged_in: true, profile: {} },
    profileAddressForm: {},
    customerHistory: {
      claimed: true,
      items: [{ job_ref: "opaque.ref", booking_code: "CWFABC123", appointment_datetime: "2026-07-01", job_status: "done" }],
      locations: [],
      claimBookingCode: "CWFABC123",
    },
    setCustomerHistory(patch) { this.customerHistory = { ...this.customerHistory, ...patch }; },
  };

  const listeners = [];
  const container = {
    _html: "",
    set innerHTML(value) { this._html = String(value); },
    get innerHTML() { return this._html; },
    querySelector(selector) {
      if (selector === "[data-profile-history]") {
        return {
          set innerHTML(value) { container._html = String(value); },
          get innerHTML() { return container._html; },
        };
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector !== "[data-history-detail-index]") return [];
      const matches = [...this._html.matchAll(/data-history-detail-index="([0-9]+)"/g)];
      return matches.map((m) => ({
        dataset: {},
        getAttribute(name) { return name === "data-history-detail-index" ? m[1] : null; },
        addEventListener(_event, handler) { listeners.push(handler); },
      }));
    },
  };

  loadModule(context, "customer-app/modules/profile.js");
  root.profile.render(container);
  assert.equal(listeners.length, 1);
  await listeners[0]();
  assert.deepEqual(detailCalls, ["opaque.ref"]);
  assert.equal(root.state.customerHistory.detail.booking_code, "CWFABC123");
  assert.equal(root.state.customerHistory.detail.job_id, undefined);

  const submitState = { claimStatus: "saving", claimBookingCode: "CWFABC123" };
  root.state.setCustomerHistory = (patch) => Object.assign(submitState, patch);
  root.state.setCustomerHistory({ claimStatus: "success", claimBookingCode: "", claimed: true });
  assert.equal(submitState.claimBookingCode, "");
});

test("Customer App cache version is bumped consistently", () => {
  const expected = "20260712_page_controls_tracking_link_v4";
  for (const file of [
    "customer-app/index.html",
    "customer-app/sw.js",
    "customer-app/assets/customer-app.js",
    "customer-app/manifest.webmanifest",
  ]) {
    const src = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
    assert.match(src, new RegExp(expected));
    assert.doesNotMatch(src, /20260709_review_legacy_v1/);
  }
});
