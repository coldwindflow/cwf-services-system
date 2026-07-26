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

function makePool({ jobs = [], claims = [], hasClaims = true, hasCustomerSub = true, schemaDrift = false, phoneLast4Check = true, methodDefinition = "CHECK ((claim_method = ANY (ARRAY['phone'::text, 'booking_code'::text, 'booking_code_phone'::text])))", methodCheckCount = 1, schemaReadyError = null, failInsert = false, uniqueConflictClaim = null } = {}) {
  const state = {
    jobs: jobs.map((x) => ({ ...x })),
    claims: claims.map((x) => ({ ...x })),
    queries: [],
    hasClaims,
    hasCustomerSub,
    schemaDrift,
    phoneLast4Check,
    methodDefinition,
    methodCheckCount,
    schemaReadyError,
    failInsert,
    uniqueConflictClaim,
  };
  async function query(sql, params = []) {
    const s = String(sql);
    state.queries.push({ sql: s, params });
    if (/BEGIN|COMMIT|ROLLBACK/.test(s)) return { rows: [] };
    if (/to_regclass\('public\.customer_history_claims'\)/.test(s)) {
      if (state.schemaReadyError) throw state.schemaReadyError;
      return { rows: [{ has_claims: state.hasClaims, has_customer_sub: state.hasCustomerSub }] };
    }
    if (/information_schema\.columns/.test(s) && /table_name='customer_history_claims'/.test(s)) {
      const rows = [
        ["claim_id", "bigint", "NO"], ["customer_sub", "text", "NO"],
        ["phone_norm", "text", "NO"], ["phone_last4", "text", "NO"],
        ["proof_job_id", "bigint", "NO"], ["claim_method", "text", "NO"],
        ["claimed_at", "timestamp with time zone", "NO"],
        ["last_verified_at", "timestamp with time zone", "NO"],
        ["revoked_at", "timestamp with time zone", "YES"], ["revoke_reason", "text", "YES"],
      ].map(([column_name, data_type, is_nullable]) => ({ column_name, data_type, is_nullable }));
      return { rows: state.schemaDrift ? rows.filter((row) => row.column_name !== "phone_norm") : rows };
    }
    if (/AS has_customer_fk/.test(s)) {
      return { rows: [{
        has_customer_fk: true,
        has_job_fk: true,
        method_check_definition: state.methodDefinition,
        method_check_count: state.methodCheckCount,
        has_phone_norm_check: true,
        has_phone_last4_check: state.phoneLast4Check,
        has_active_phone_index: true,
        has_active_proof_index: true,
        has_active_sub_index: true,
      }] };
    }
    if (/FROM public\.jobs j\s+WHERE upper\(btrim/.test(s)) {
      const code = String(params[0] || "").toUpperCase();
      const rows = state.jobs.filter((j) => String(j.booking_code || "").trim().toUpperCase() === code).slice(0, 2);
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
  job_type: "à¸¥à¹‰à¸²à¸‡",
  appointment_datetime: "2026-07-01T03:00:00.000Z",
  job_status: "à¹€à¸ªà¸£à¹‡à¸ˆà¹à¸¥à¹‰à¸§",
  booking_mode: "scheduled",
  job_price: 1200,
  address_text: "Condo A Room 101",
  maps_url: "https://maps.google.com/?q=13,100",
  job_zone: "à¸ªà¸¸à¸‚à¸¸à¸¡à¸§à¸´à¸—",
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

test("schema readiness accepts quoted and unquoted right() deparse while phone_last4 drift fails closed", async () => {
  const legacyDefinition = "CHECK ((claim_method = 'booking_code_phone'::text))";
  const pool = makePool({ methodDefinition: legacyDefinition });
  const status = await history.schemaReady(pool);
  assert.equal(status.has_claims, true);
  assert.equal(status.claim_method_capability, "legacy");
  assert.equal(status.supports_simple_claim, false);

  const shapeQuery = pool.state.queries.find(({ sql }) => /AS has_phone_last4_check/.test(sql));
  assert.ok(shapeQuery, "schema readiness must query the phone_last4 constraint shape");
  const patternMatch = shapeQuery.sql.match(/pg_get_constraintdef\(con\.oid\) ~\* '([^']+)'/);
  assert.ok(patternMatch, "phone_last4 readiness must use a constraint-definition matcher");
  const matcher = new RegExp(patternMatch[1].replaceAll("[[:space:]]", "\\s"), "i");

  assert.match(
    `CHECK (((phone_last4 ~ '^[0-9]{4}$'::text) AND (phone_last4 = "right"(phone_norm, 4))))`,
    matcher
  );
  assert.match(
    `CHECK (((phone_last4 ~ '^[0-9]{4}$'::text) AND (phone_last4 = right(phone_norm, 4))))`,
    matcher
  );
  for (const drifted of [
    "CHECK (phone_last4 = left(phone_norm, 4))",
    `CHECK ("right"(phone_norm, 4) = '1234')`,
    `CHECK (phone_last4 <> "right"(phone_norm, 4))`,
    `CHECK (phone_last4 = "right"(other_phone, 4))`,
  ]) {
    assert.doesNotMatch(drifted, matcher);
  }

  const driftedStatus = await history.schemaReady(makePool({ phoneLast4Check: false, methodDefinition: legacyDefinition }));
  assert.equal(driftedStatus.has_claims, false);
  assert.equal(driftedStatus.diagnostic_code, "SCHEMA_DRIFT");
});

test("schema readiness reports widened claim methods without changing legacy claim behavior", async () => {
  const widened = "CHECK ((claim_method = ANY (ARRAY['phone'::text, 'booking_code'::text, 'booking_code_phone'::text])))";
  const status = await history.schemaReady(makePool({ methodDefinition: widened }));
  assert.equal(status.has_claims, true);
  assert.equal(status.claim_method_capability, "widened");
  assert.equal(status.supports_simple_claim, true);
  assert.equal(history.CLAIM_METHOD, "booking_code_phone");

  for (const methodDefinition of [
    "CHECK ((claim_method = ANY (ARRAY['phone'::text, 'booking_code_phone'::text])))",
    "CHECK ((claim_method = ANY (ARRAY['phone'::text, 'booking_code'::text, 'booking_code_phone'::text, 'email'::text])))",
  ]) {
    const drifted = await history.schemaReady(makePool({ methodDefinition }));
    assert.equal(drifted.has_claims, false);
    assert.equal(drifted.diagnostic_code, "SCHEMA_DRIFT");
  }
  const duplicate = await history.schemaReady(makePool({ methodDefinition: widened, methodCheckCount: 2 }));
  assert.equal(duplicate.has_claims, false);
});

test("unauthenticated claim returns 401", async () => {
  await withServer({ pool: makePool(), sub: null }, async (base) => {
    const res = await fetch(`${base}/public/customer-history/claim`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(res.status, 401);
  });
});

test("phone and Booking Code search return safe history previews", async () => {
  const secondJob = { ...LEGACY_JOB, job_id: 102, booking_code: "CWFSECOND", job_type: "à¸¥à¹‰à¸²à¸‡à¹à¸­à¸£à¹Œ", job_status: "à¸à¸³à¸¥à¸±à¸‡à¸”à¸³à¹€à¸™à¸´à¸™à¸à¸²à¸£", job_zone: "", address_text: "Private room details" };
  const pool = makePool({ jobs: [LEGACY_JOB, secondJob] });
  await withServer({ pool }, async (base) => {
    for (const [identifier, method] of [["081-234-5678", "phone"], ["cwfabc123", "booking_code"]]) {
      const res = await fetch(`${base}/public/customer-history/search`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("cache-control"), "private, no-store");
      const body = await json(res);
      assert.equal(body.method, method);
      assert.equal(body.items.length, 2);
      assert.equal(body.items[0].location_summary, LEGACY_JOB.job_zone);
      assert.equal(body.items[1].location_summary, "à¸ªà¸–à¸²à¸™à¸—à¸µà¹ˆà¸ˆà¸²à¸à¸‡à¸²à¸™à¹€à¸”à¸´à¸¡");
      assert.doesNotMatch(JSON.stringify(body.items), /Private room details/);
      for (const item of body.items) {
        for (const forbidden of ["job_id", "customer_phone", "booking_token", "maps_url", "address_text"]) {
          assert.equal(item[forbidden], undefined);
        }
      }
    }
  });
});

test("invalid, unknown, ambiguous, and phone-less searches fail generically", async () => {
  const cases = [
    { jobs: [LEGACY_JOB], identifier: "!!" },
    { jobs: [LEGACY_JOB], identifier: "0899999999" },
    { jobs: [LEGACY_JOB], identifier: "UNKNOWN" },
    { jobs: [LEGACY_JOB, { ...LEGACY_JOB, job_id: 102 }], identifier: "CWFABC123" },
    { jobs: [{ ...LEGACY_JOB, customer_phone: "" }], identifier: "CWFABC123" },
  ];
  for (const testCase of cases) {
    await withServer({ pool: makePool({ jobs: testCase.jobs }) }, async (base) => {
      const res = await fetch(`${base}/public/customer-history/search`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: testCase.identifier }),
      });
      assert.equal(res.status, 400);
      assert.equal((await json(res)).error, "CLAIM_FAILED");
    });
  }
});

test("missing, drifted, or legacy claim schema returns 503 with safe diagnostics and no proof PII", async () => {
  for (const options of [
    { hasClaims: false },
    { hasClaims: true, schemaDrift: true },
    { methodDefinition: "CHECK ((claim_method = 'booking_code_phone'::text))" },
  ]) {
    const logs = [];
    const pool = makePool({ jobs: [LEGACY_JOB], ...options });
    await withServer({ pool, logger: { warn: (...args) => logs.push(args) } }, async (base) => {
      const res = await fetch(`${base}/public/customer-history/claim`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: "0812345678" }),
      });
      assert.equal(res.status, 503);
      assert.equal((await json(res)).error, "CUSTOMER_HISTORY_SCHEMA_NOT_READY");
    });
    const output = JSON.stringify(logs);
    assert.match(output, /CUSTOMER_HISTORY_SCHEMA_NOT_READY/);
    assert.doesNotMatch(output, /0812345678|CWFABC123/);
  }
});

test("claim schema readiness query exceptions roll back and return safe 503 without proof PII", async () => {
  const phone = "0812345678";
  const bookingCode = "CWFABC123";
  const logs = [];
  const schemaReadyError = Object.assign(new Error(`catalog failed for ${phone} ${bookingCode}`), { code: "42501" });
  const pooßŽ´¶‰žËkºwµçl4(€…Ý…¥ÐÝ¥Ñ¡M•ÉÙ•È¡ìÁ½½°ô°…Íå¹Œ€¡‰…Í”¤€ôøì4(€€€½¹ÍÐÁ¡½¹•EÕ•Éä€ô…Ý…¥Ð™•Ñ ¡€‘í‰…Í•ô½ÁÕ‰±¥Œ½ÕÍÑ½µ•Èµ¡¥ÍÑ½ÉäýÁ¡½¹”ôÀàÄÈÌÐÔØÜá€¤ì4(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡Á¡½¹•EÕ•Éä¹ÍÑ…ÑÕÌ°€ÐÀÀ¤ì4(€€€½¹ÍÐÉ•Ì€ô…Ý…¥Ð™•Ñ ¡€‘í‰…Í•ô½ÁÕ‰±¥Œ½ÕÍÑ½µ•Èµ¡¥ÍÑ½Éå€¤ì4(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•Ì¹ÍÑ…ÑÕÌ°€ÈÀÀ¤ì4(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•Ì¹¡•…‘•ÉÌ¹•Ð ‰…¡”µ½¹ÑÉ½°ˆ¤°€‰ÁÉ¥Ù…Ñ”°¹¼µÍÑ½É”ˆ¤ì4(€€€½¹ÍÐ‰½‘ä€ô…Ý…¥Ð©Í½¸¡É•Ì¤ì4(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡‰½‘ä¹±…¥µ•°™…±Í”¤ì4(€€€…ÍÍ•ÉÐ¹‘••ÁÅÕ…°¡‰½‘ä¹¥Ñ•µÌ°mt¤ì4(€ô¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰¡¥ÍÑ½Éä…¹‘•Ñ…¥°ÕÍ”½Á…ÅÕ”É•™Ì…¹‘¼¹½ÐÉ•ÑÕÉ¸Ñ½­•¸°É…Ü©½‰}¥°½È¥¹Ñ•É¹…°™¥•±‘Ìˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐÁ½½°€ôµ…­•A½½°¡ì4(€€€©½‰Ìèm1e})=	t°4(€€€±…¥µÌèmì±…¥µ}¥è€Ä°ÕÍÑ½µ•É}ÍÕˆè€‰±¥¹”éÔÄˆ°Á¡½¹•}¹½É´è€ˆÀàÄÈÌÐÔØÜàˆ°Á¡½¹•}±…ÍÐÐè€ˆÔØÜàˆ°ÁÉ½½™}©½‰}¥è€ÄÀÄõt°4(€ô¤ì4(€…Ý…¥ÐÝ¥Ñ¡M•ÉÙ•È¡ìÁ½½°ô°…Íå¹Œ€¡‰…Í”¤€ôøì4(€€€½¹ÍÐÉ•Ì€ô…Ý…¥Ð™•Ñ ¡€‘í‰…Í•ô½ÁÕ‰±¥Œ½ÕÍÑ½µ•Èµ¡¥ÍÑ½Éå€¤ì4(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•Ì¹ÍÑ…ÑÕÌ°€ÈÀÀ¤ì4(€€€½¹ÍÐ‰½‘ä€ô…Ý…¥Ð©Í½¸¡É•Ì¤ì4(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡‰½‘ä¹±…¥µ•°ÑÉÕ”¤ì4(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡‰½‘ä¹¥Ñ•µÌ¹±•¹Ñ °€Ä¤ì4(€€€½¹ÍÐ¥Ñ•´€ô‰½‘ä¹¥Ñ•µÍlÁtì4(€€€…ÍÍ•ÉÐ¹½¬¡¥Ñ•´¹©½‰}É•˜€˜˜€…MÑÉ¥¹œ¡¥Ñ•´¹©½‰}É•˜¤¹¥¹±Õ‘•Ì ˆÄÀÄˆ¤¤ì4(€€€™½È€¡½¹ÍÐ™½É‰¥‘‘•¸½˜l‰‰½½­¥¹}Ñ½­•¸ˆ°€‰©½‰}¥ˆ°€‰Ñ•¡¹¥¥…¹}¹½Ñ”ˆ°€‰ÕÍÑ½µ•É}¹½Ñ”ˆ°€‰±…¥µ}¥ˆ°€‰ÁÉ½½™}©½‰}¥‰t¤ì4(€€€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡¥Ñ•µm™½É‰¥‘‘•¹t°Õ¹‘•™¥¹•¤ì4(€€€ô4(€€€½¹ÍÐ‘•Ñ…¥°€ô…Ý…¥Ð™•Ñ ¡€‘í‰…Í•ô½ÁÕ‰±¥Œ½ÕÍÑ½µ•Èµ¡¥ÍÑ½Éä¼‘í•¹½‘•UI%½µÁ½¹•¹Ð¡¥Ñ•´¹©½‰}É•˜¥õ€¤ì4(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡‘•Ñ…¥°¹ÍÑ…ÑÕÌ°€ÈÀÀ¤ì4(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡‘•Ñ…¥°¹¡•…‘•ÉÌ¹•Ð ‰…¡”µ½¹ÑÉ½°ˆ¤°€‰ÁÉ¥Ù…Ñ”°¹¼µÍÑ½É”ˆ¤ì4(€€€½¹ÍÐ‘•Ñ…¥±	½‘ä€ô…Ý…¥Ð©Í½¸¡‘•Ñ…¥°¤ì4(€€€™½È€¡½¹ÍÐ™½É‰¥‘‘•¸½˜l‰‰½½­¥¹}Ñ½­•¸ˆ°€‰©½‰}¥ˆ°€‰Ñ•¡¹¥¥…¹}¹½Ñ”ˆ°€‰ÕÍÑ½µ•É}¹½Ñ”ˆ°€‰±…¥µ}¥ˆ°€‰ÁÉ½½™}©½‰}¥‰t¤ì4(€€€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡‘•Ñ…¥±	½‘ä¹¥Ñ•µm™½É‰¥‘‘•¹t°Õ¹‘•™¥¹•¤ì4(€€€ô4(€ô¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰ÝÉ½¹œµ…½Õ¹Ð©½‰}É•˜¥ÌÉ•©•Ñ•ˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐÉ•˜€ô¡¥ÍÑ½Éä¹µ…­•)½‰I•˜¡ìÍ•É•Ðè€‰Ñ•ÍÐµÍ•É•Ðˆ°ÕÍÑ½µ•ÉMÕˆè€‰±¥¹”éÔÄˆ°©½‰%è€ÄÀÄô¤ì4(€½¹ÍÐÁ½½°€ôµ…­•A½½°¡ì4(€€€©½‰Ìèm1e})=	t°4(€€€±…¥µÌèmì±…¥µ}¥è€Ä°ÕÍÑ½µ•É}ÍÕˆè€‰½½±”éÔÈˆ°Á¡½¹•}¹½É´è€ˆÀàÄÈÌÐÔØÜàˆ°Á¡½¹•}±…ÍÐÐè€ˆÔØÜàˆ°ÁÉ½½™}©½‰}¥è€ÄÀÄõt°4(€ô¤ì4(€…Ý…¥ÐÝ¥Ñ¡M•ÉÙ•È¡ìÁ½½°°ÍÕˆè€‰½½±”éÔÈˆô°…Íå¹Œ€¡‰…Í”¤€ôøì4(€€€½¹ÍÐÉ•Ì€ô…Ý…¥Ð™•Ñ ¡€‘í‰…Í•ô½ÁÕ‰±¥Œ½ÕÍÑ½µ•Èµ¡¥ÍÑ½Éä¼‘í•¹½‘•UI%½µÁ½¹•¹Ð¡É•˜¥õ€¤ì4(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•Ì¹ÍÑ…ÑÕÌ°€ÐÀÐ¤ì4(€ô¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰±…¥´É…Ñ”±¥µ¥Ð¥ÌÍÁ±¥Ð‰äÁÉ½½˜¡…Í …¹‘½•Ì¹½Ð±½œÉ…ÜÁ¡½¹”½È½‘”ˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐ±½Ì€ômtì4(€½¹ÍÐÁ½½°€ôµ…­•A½½°¡ì©½‰Ìèm1e})=	t°™…¥±%¹Í•ÉÐèÑÉÕ”ô¤ì4(€…Ý…¥ÐÝ¥Ñ¡M•ÉÙ•È¡ìÁ½½°°±½•ÈèìÝ…É¸è€ ¸¸¹…ÉÌ¤€ôø±½Ì¹ÁÕÍ ¡…ÉÌ¤ôô°…Íå¹Œ€¡‰…Í”¤€ôøì4(€€€½¹ÍÐÉ•Ì€ô…Ý…¥Ð™•Ñ ¡€‘í‰…Í•ô½ÁÕ‰±¥Œ½ÕÍÑ½µ•Èµ¡¥ÍÑ½Éä½±…¥µ€°ì4(€€€€€µ•Ñ¡½è€‰A=MPˆ°4(€€€€€¡•…‘•ÉÌèì€‰½¹Ñ•¹ÐµÑåÁ”ˆè€‰…ÁÁ±¥…Ñ¥½¸½©Í½¸ˆô°4(€€€€€‰½‘äè)M=8¹ÍÑÉ¥¹¥™ä¡ì¥‘•¹Ñ¥™¥•Èè€ˆÀàÄÈÌÐÔØÜàˆô¤°4(€€€ô¤ì4(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•Ì¹ÍÑ…ÑÕÌ°€ÔÀÀ¤ì4(€€€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡)M=8¹ÍÑÉ¥¹¥™ä¡±½Ì¤°€¼ÀàÄÈÌÐÔØÜáñ]	ÄÈÌ¼¤ì4(€ô¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰±½…Ñ¥½¹ÌÉ½ÕÀ•á…Ð‘ÕÁ±¥…Ñ•Ì‰ÕÐ­••À…µ‰¥Õ½ÕÌ±½…Ñ¥½¹ÌÍ•Á…É…Ñ”ˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐÁ½½°€ôµ…­•A½½°¡ì4(€€€©½‰Ìèl4(€€€€€1e})=°4(€€€€€ì€¸¸¹1e})=°©½‰}¥è€ÄÀÈ°‰½½­¥¹}½‘”è€‰]Èˆô°4(€€€€€ì€¸¸¹1e})=°©½‰}¥è€ÄÀÌ°‰½½­¥¹}½‘”è€‰]Ìˆ°µ…ÁÍ}ÕÉ°è€‰¡ÑÑÁÌè¼½µ…ÁÌ¹½½±”¹½´¼ýÄôÄÌ¸Ä°ÄÀÀ¸Äˆô°4(€€€t°4(€€€±…¥µÌèmì±…¥µ}¥è€Ä°ÕÍÑ½µ•É}ÍÕˆè€‰±¥¹”éÔÄˆ°Á¡½¹•}¹½É´è€ˆÀàÄÈÌÐÔØÜàˆ°Á¡½¹•}±…ÍÐÐè€ˆÔØÜàˆ°ÁÉ½½™}©½‰}¥è€ÄÀÄõt°4(€ô¤ì4(€…Ý…¥ÐÝ¥Ñ¡M•ÉÙ•È¡ìÁ½½°ô°…Íå¹Œ€¡‰…Í”¤€ôøì4(€€€½¹ÍÐÉ•Ì€ô…Ý…¥Ð™•Ñ ¡€‘í‰…Í•ô½ÁÕ‰±¥Œ½ÕÍÑ½µ•Èµ¡¥ÍÑ½Éä½±½…Ñ¥½¹Í€¤ì4(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•Ì¹ÍÑ…ÑÕÌ°€ÈÀÀ¤ì4(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•Ì¹¡•…‘•ÉÌ¹•Ð ‰…¡”µ½¹ÑÉ½°ˆ¤°€‰ÁÉ¥Ù…Ñ”°¹¼µÍÑ½É”ˆ¤ì4(€€€½¹ÍÐ‰½‘ä€ô…Ý…¥Ð©Í½¸¡É•Ì¤ì4(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡‰½‘ä¹…ÕÑ½}Í•±•Ð°™…±Í”¤ì4(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡‰½‘ä¹¡…Í}µÕ±Ñ¥Á±•}±½…Ñ¥½¹Ì°ÑÉÕ”¤ì4(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡‰½‘ä¹±½…Ñ¥½¹Ì¹±•¹Ñ °€È¤ì4(€€€…ÍÍ•ÉÐ¹½¬¡‰½‘ä¹±½…Ñ¥½¹Ì¹Í½µ” ¡à¤€ôøà¹©½‰}½Õ¹Ð€ôôô€È¤¤ì4(€€€™½È€¡½¹ÍÐ±½Œ½˜‰½‘ä¹±½…Ñ¥½¹Ì¤ì4(€€€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡±½Œ¹Í…µÁ±•}‰½½­¥¹}½‘”°Õ¹‘•™¥¹•¤ì4(€€€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡±½Œ¹±½…Ñ¥½¹}É•˜°Õ¹‘•™¥¹•¤ì4(€€€ô4(€ô¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰µ¥É…Ñ¥½¸ÍÑ½É•Ì¹¼É…Ü‰½½­¥¹œ½‘”…¹ÕÍ•Ì	%%9Pµ½µÁ…Ñ¥‰±”ÁÉ½½™}©½‰}¥ˆ°€ ¤€ôøì4(€½¹ÍÐÍÅ°€ô™Ì¹É•…‘¥±•Må¹Œ¡Á…Ñ ¹©½¥¸¡IA=}I==P°€‰µ¥É…Ñ¥½¹Ìˆ°€ˆÈÀÈØÀÜÄÁ}ÕÍÑ½µ•É}¡¥ÍÑ½Éå}±…¥µÌ¹ÍÅ°ˆ¤°€‰ÕÑ˜àˆ¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÅ°°€½ÁÉ½½™}©½‰}¥	%%9P9=P9U10II9LÁÕ‰±¥p¹©½‰Íp¡©½‰}¥‘p¤¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡ÍÅ°°€½ÁÉ½½™}‰½½­¥¹}½‘”½¤¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÅ°°€½Á¡½¹•}¹½É´ø€qxÁqlÀ´åquqìà°åqõpœ¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÅ°°€½Á¡½¹•}±…ÍÐÐø€qyqlÀ´åquqìÑqõpœ9Á¡½¹•}±…ÍÐÐ€ôÉ¥¡Ñp¡Á¡½¹•}¹½É´°€Ñp¤¼¤ì4)ô¤ì4(4)™Õ¹Ñ¥½¸µ…­•	É½ÝÍ•É½¹Ñ•áÐ¡ì™•Ñ¡%µÁ°ô€ôíô¤ì4(€½¹ÍÐÍÑ½É…”€ô¹•Ü5…À ¤ì4(€½¹ÍÐÝ¥¹‘½Ü€ôì4(€€€]ÕÍÑ½µ•ÉÁÁXÈèíô°4(€€€±½…Ñ¥½¸èìÁÉ½Ñ½½°è€‰¡ÑÑÁÌèˆ°½É¥¥¸è€‰¡ÑÑÁÌè¼½…ÁÀ¹•á…µÁ±”¹Ñ•ÍÐˆ°¡½ÍÑ¹…µ”è€‰…ÁÀ¹•á…µÁ±”¹Ñ•ÍÐˆ°Í•…É è€ˆˆ°¡…Í è€ˆˆô°4(€€€Í•ÍÍ¥½¹MÑ½É…”èì4(€€€€€•Ñ%Ñ•´¡­•ä¤ìÉ•ÑÕÉ¸ÍÑ½É…”¹•Ð¡­•ä¤ñð¹Õ±°ìô°4(€€€€€Í•Ñ%Ñ•´¡­•ä°Ù…±Õ”¤ìÍÑ½É…”¹Í•Ð¡­•ä°MÑÉ¥¹œ¡Ù…±Õ”¤¤ìô°4(€€€€€É•µ½Ù•%Ñ•´¡­•ä¤ìÍÑ½É…”¹‘•±•Ñ”¡­•ä¤ìô°4(€€€ô°4(€ôì4(€½¹ÍÐ½¹Ñ•áÐ€ôìÝ¥¹‘½Ü°™•Ñ è™•Ñ¡%µÁ°ñð€¡…Íå¹Œ€ ¤€ôø€¡ì½¬èÑÉÕ”°Ñ•áÐè…Íå¹Œ€ ¤€ôø€‰íôˆô¤¤°UI0°UI1M•…É¡A…É…µÌ°½¹Í½±”°%¹Ñ°°…Ñ”°Í•ÑQ¥µ•½ÕÐ°±•…ÉQ¥µ•½ÕÐôì4(€½¹Ñ•áÐ¹±½‰…±Q¡¥Ì€ô½¹Ñ•áÐì4(€É•ÑÕÉ¸Ù´¹É•…Ñ•½¹Ñ•áÐ¡½¹Ñ•áÐ¤ì4)ô4(4)™Õ¹Ñ¥½¸±½…‘5½‘Õ±”¡½¹Ñ•áÐ°É•±…Ñ¥Ù•A…Ñ ¤ì4(€½¹ÍÐÍÉŒ€ô™Ì¹É•…‘¥±•Må¹Œ¡Á…Ñ ¹©½¥¸¡IA=}I==P°É•±…Ñ¥Ù•A…Ñ ¤°€‰ÕÑ˜àˆ¤ì4(€Ù´¹ÉÕ¹%¹½¹Ñ•áÐ¡ÍÉŒ°½¹Ñ•áÐ°ì™¥±•¹…µ”èÉ•±…Ñ¥Ù•A…Ñ ô¤ì4(€É•ÑÕÉ¸½¹Ñ•áÐ¹Ý¥¹‘½Ü¹]ÕÍÑ½µ•ÉÁÁXÈì4)ô4(4)Ñ•ÍÐ ‰ÕÍÑ½µ•ÈÁÀA$…¹ÍÑ…Ñ”ÍÕÁÁ½ÉÐ½¹”µ¥‘•¹Ñ¥™¥•ÈÍ•…É ½±¥¹¬Ý¥Ñ¡½ÕÐUI0±•…­…”ˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐ…±±Ì€ômtì4(€½¹ÍÐ½¹Ñ•áÐ€ôµ…­•	É½ÝÍ•É½¹Ñ•áÐ¡ì4(€€€™•Ñ¡%µÁ°è…Íå¹Œ€¡ÕÉ°°½ÁÑ¥½¹Ì€ôíô¤€ôøì4(€€€€€…±±Ì¹ÁÕÍ ¡ìÕÉ°°½ÁÑ¥½¹Ìô¤ì4(€€€€€É•ÑÕÉ¸ì½¬èÑÉÕ”°Ñ•áÐè…Íå¹Œ€ ¤€ôø)M=8¹ÍÑÉ¥¹¥™ä¡ì½¬èÑÉÕ”°¥Ñ•µÌèmt°±½…Ñ¥½¹Ìèmtô¤ôì4(€€€ô°4(€ô¤ì4(€½¹ÍÐÉ½½Ð€ô±½…‘5½‘Õ±”¡½¹Ñ•áÐ°€‰ÕÍÑ½µ•Èµ…ÁÀ½µ½‘Õ±•Ì½…Á¤¹©Ìˆ¤ì4(€…Ý…¥ÐÉ½½Ð¹…Á¤¹Í•…É¡ÕÍÑ½µ•É!¥ÍÑ½Éä ˆÀàÄˆ¤ì4(€…Ý…¥ÐÉ½½Ð¹…Á¤¹±…¥µÕÍÑ½µ•É!¥ÍÑ½Éä ˆÀàÄˆ¤ì4(€…Ý…¥ÐÉ½½Ð¹…Á¤¹±½…‘ÕÍÑ½µ•É!¥ÍÑ½Éä ¤ì4(€…Ý…¥ÐÉ½½Ð¹…Á¤¹±½…‘ÕÍÑ½µ•É!¥ÍÑ½Éå•Ñ…¥° ‰½Á…ÅÕ”¹É•˜ˆ¤ì4(€…Ý…¥ÐÉ½½Ð¹…Á¤¹±½…‘ÕÍÑ½µ•É!¥ÍÑ½Éå1½…Ñ¥½¹Ì ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡…±±ÍlÁt¹ÕÉ°°€‰¡ÑÑÁÌè¼½…ÁÀ¹•á…µÁ±”¹Ñ•ÍÐ½ÁÕ‰±¥Œ½ÕÍÑ½µ•Èµ¡¥ÍÑ½Éä½Í•…É ˆ¤ì4(€…ÍÍ•ÉÐ¹‘••ÁÅÕ…°¡)M=8¹Á…ÉÍ”¡…±±ÍlÁt¹½ÁÑ¥½¹Ì¹‰½‘ä¤°ì¥‘•¹Ñ¥™¥•Èè€ˆÀàÄˆô¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡…±±ÍlÅt¹ÕÉ°°€‰¡ÑÑÁÌè¼½…ÁÀ¹•á…µÁ±”¹Ñ•ÍÐ½ÁÕ‰±¥Œ½ÕÍÑ½µ•Èµ¡¥ÍÑ½Éä½±…¥´ˆ¤ì4(€…ÍÍ•ÉÐ¹‘••ÁÅÕ…°¡)M=8¹Á…ÉÍ”¡…±±ÍlÅt¹½ÁÑ¥½¹Ì¹‰½‘ä¤°ì¥‘•¹Ñ¥™¥•Èè€ˆÀàÄˆô¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡…±±ÍlÉt¹ÕÉ°°€‰¡ÑÑÁÌè¼½…ÁÀ¹•á…µÁ±”¹Ñ•ÍÐ½ÁÕ‰±¥Œ½ÕÍÑ½µ•Èµ¡¥ÍÑ½Éäˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡…±±ÍlÍt¹ÕÉ°°€‰¡ÑÑÁÌè¼½…ÁÀ¹•á…µÁ±”¹Ñ•ÍÐ½ÁÕ‰±¥Œ½ÕÍÑ½µ•Èµ¡¥ÍÑ½Éä½½Á…ÅÕ”¹É•˜ˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡…±±ÍlÑt¹ÕÉ°°€‰¡ÑÑÁÌè¼½…ÁÀ¹•á…µÁ±”¹Ñ•ÍÐ½ÁÕ‰±¥Œ½ÕÍÑ½µ•Èµ¡¥ÍÑ½Éä½±½…Ñ¥½¹Ìˆ¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡…±±Ì¹µ…À ¡à¤€ôøà¹ÕÉ°¤¹©½¥¸ ‰q¸ˆ¤°€½Á¡½¹”ô¼¤ì4(4(€½¹ÍÐÍÑ…Ñ•½¹Ñ•áÐ€ôµ…­•	É½ÝÍ•É½¹Ñ•áÐ ¤ì4(€½¹ÍÐÍÑ…Ñ•I½½Ð€ô±½…‘5½‘Õ±”¡ÍÑ…Ñ•½¹Ñ•áÐ°€‰ÕÍÑ½µ•Èµ…ÁÀ½µ½‘Õ±•Ì½ÍÑ…Ñ”¹©Ìˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ÍÑ…Ñ•I½½Ð¹ÍÑ…Ñ”¹…ÁÁ±å!¥ÍÑ½Éå1½…Ñ¥½¸ ‰Í¡•‘Õ±•ˆ°ì…‘‘É•ÍÍ}Ñ•áÐè€‰=±½¹‘¼ˆ°µ…ÁÍ}ÕÉ°è€‰¡ÑÑÁÌè¼½µ…ÁÌ¹•á…µÁ±”½„ˆ°©½‰}é½¹”è€‰i½¹”ˆô¤°ÑÉÕ”¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ÍÑ…Ñ•I½½Ð¹ÍÑ…Ñ”¹‘É…™Ð¹Í¡•‘Õ±•¹…‘‘É•ÍÍ}Ñ•áÐ°€‰=±½¹‘¼ˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ÍÑ…Ñ•I½½Ð¹ÍÑ…Ñ”¹‘É…™Ð¹Í¡•‘Õ±•¹µ…ÁÍ}ÕÉ°°€‰¡ÑÑÁÌè¼½µ…ÁÌ¹•á…µÁ±”½„ˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ÍÑ…Ñ•I½½Ð¹ÍÑ…Ñ”¹‘É…™Ð¹Í¡•‘Õ±•¹©½‰}é½¹”°€‰i½¹”ˆ¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰ÕÍÑ½µ•ÈÁÀÁÉ½™¥±”½Á•¹Ì¡¥ÍÑ½Éä‘•Ñ…¥°Ý¥Ñ ½Á…ÅÕ”©½‰}É•˜…¹±•…ÉÌÍ•…É ÍÑ…Ñ”…™Ñ•È±¥¹¬ˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐ½¹Ñ•áÐ€ôµ…­•	É½ÝÍ•É½¹Ñ•áÐ ¤ì4(€½¹ÍÐÉ½½Ð€ô½¹Ñ•áÐ¹Ý¥¹‘½Ü¹]ÕÍÑ½µ•ÉÁÁXÈì4(€É½½Ð¹ÕÑ¥±Ì€ôì4(€€€•Í…Á•!Ñµ°¡Ù…±Õ”¤ì4(€€€€€É•ÑÕÉ¸MÑÉ¥¹œ¡Ù…±Õ”€ôô¹Õ±°€ü€ˆˆ€èÙ…±Õ”¤¹É•Á±…” ½l˜ðøˆt½œ°€¡ ¤€ôø€¡ì€ˆ˜ˆè€ˆ™…µÀìˆ°€ˆðˆè€ˆ™±Ðìˆ°€ˆøˆè€ˆ™Ðìˆ°€œˆœè€ˆ™ÅÕ½Ðìˆ°€ˆœˆè€ˆ˜ŒÌäìˆô¥m¡t¤ì4(€€€ô°4(€€€¥½¸ ¤ìÉ•ÑÕÉ¸€ˆˆìô°4(€€€É½ÕÑ•Q¼ ¤íô°4(€ôì4(€½¹ÍÐ‘•Ñ…¥±…±±Ì€ômtì4(€É½½Ð¹…Á¤€ôì4(€€€…Íå¹Œ±…¥µÕÍÑ½µ•É!¥ÍÑ½Éä ¤ìÉ•ÑÕÉ¸ì½¬èÑÉÕ”ôìô°4(€€€…Íå¹Œ±½…‘ÕÍÑ½µ•É!¥ÍÑ½Éä ¤ìÉ•ÑÕÉ¸ì±…¥µ•èÑÉÕ”°¥Ñ•µÌèÉ½½Ð¹ÍÑ…Ñ”¹ÕÍÑ½µ•É!¥ÍÑ½Éä¹¥Ñ•µÌôìô°4(€€€…Íå¹Œ±½…‘ÕÍÑ½µ•É!¥ÍÑ½Éå1½…Ñ¥½¹Ì ¤ìÉ•ÑÕÉ¸ì±…¥µ•èÑÉÕ”°±½…Ñ¥½¹Ìèmtôìô°4(€€€…Íå¹Œ±½…‘ÕÍÑ½µ•É!¥ÍÑ½Éå•Ñ…¥°¡©½‰I•˜¤ì4(€€€€€‘•Ñ…¥±…±±Ì¹ÁÕÍ ¡©½‰I•˜¤ì4(€€€€€É•ÑÕÉ¸ì¥Ñ•´èì‰½½­¥¹}½‘”è€‰]	ÄÈÌˆ°©½‰}ÍÑ…ÑÕÌè€‰‘½¹”ˆ°©½‰}ÁÉ¥”è€ÄÈÀÀ°ÕÍÑ½µ•É}Á¡½¹•}µ…Í­•è€ˆ¨¨¨¨€ÔØÜàˆôôì4(€€€ô°4(€ôì4(€É½½Ð¹…ÕÑ €ôì4(€€€É•¹‘•É1½¥¹A…¹•° ¤ìÉ•ÑÕÉ¸€ˆˆìô°4(€€€‘¥ÍÁ±…å9…µ” ¤ìÉ•ÑÕÉ¸€‰ÕÍÑ½µ•Èˆìô°4(€€€±½…‘ÕÍÑ½µ•È ¤ìÉ•ÑÕÉ¸AÉ½µ¥Í”¹É•Í½±Ù” ¤ìô°4(€ôì4(€É½½Ð¹Õ¤€ôìÍÕÁÁ½ÉÑ	ÕÑÑ½¹Ì ¤ìÉ•ÑÕÉ¸€ˆˆìôôì4(€É½½Ð¹É½ÕÑ•È€ôìÉ•™É•Í  ¤íôôì4(€É½½Ð¹ÍÑ…Ñ”€ôì4(€€€…ÕÑ¡MÑ…ÑÕÌè€‰ÍÕ•ÍÌˆ°4(€€€ÕÉÉ•¹ÑI½ÕÑ”è€‰ÁÉ½™¥±”ˆ°4(€€€ÕÍÑ½µ•Èèì±½•‘}¥¸èÑÉÕ”°ÁÉ½™¥±”èíôô°4(€€€ÁÉ½™¥±•‘‘É•ÍÍ½É´èíô°4(€€€ÕÍÑ½µ•É!¥ÍÑ½Éäèì4(€€€€€±…¥µ•èÑÉÕ”°4(€€€€€¥Ñ•µÌèmì©½‰}É•˜è€‰½Á…ÅÕ”¹É•˜ˆ°‰½½­¥¹}½‘”è€‰]	ÄÈÌˆ°…ÁÁ½¥¹Ñµ•¹Ñ}‘…Ñ•Ñ¥µ”è€ˆÈÀÈØ´ÀÜ´ÀÄˆ°©½‰}ÍÑ…ÑÕÌè€‰‘½¹”ˆõt°4(€€€€€±½…Ñ¥½¹Ìèmt°4(€€€€€Í•…É¡%‘•¹Ñ¥™¥•Èè€‰]	ÄÈÌˆ°4(€€€€€ÁÉ•Ù¥•Ý%Ñ•µÌèmì‰½½­¥¹}½‘”è€‰]	ÄÈÌˆõt°4(€€€ô°4(€€€Í•ÑÕÍÑ½µ•É!¥ÍÑ½Éä¡Á…Ñ ¤ìÑ¡¥Ì¹ÕÍÑ½µ•É!¥ÍÑ½Éä€ôì€¸¸¹Ñ¡¥Ì¹ÕÍÑ½µ•É!¥ÍÑ½Éä°€¸¸¹Á…Ñ ôìô°4(€ôì4(4(€½¹ÍÐ±¥ÍÑ•¹•ÉÌ€ômtì4(€½¹ÍÐ½¹Ñ…¥¹•È€ôì4(€€€}¡Ñµ°è€ˆˆ°4(€€€Í•Ð¥¹¹•É!Q50¡Ù…±Õ”¤ìÑ¡¥Ì¹}¡Ñµ°€ôMÑÉ¥¹œ¡Ù…±Õ”¤ìô°4(€€€•Ð¥¹¹•É!Q50 ¤ìÉ•ÑÕÉ¸Ñ¡¥Ì¹}¡Ñµ°ìô°4(€€€ÅÕ•ÉåM•±•Ñ½È¡Í•±•Ñ½È¤ì4(€€€€€¥˜€¡Í•±•Ñ½È€ôôô€‰m‘…Ñ„µÁÉ½™¥±”µ¡¥ÍÑ½Éåtˆ¤ì4(€€€€€€€É•ÑÕÉ¸ì4(€€€€€€€€€Í•Ð¥¹¹•É!Q50¡Ù…±Õ”¤ì½¹Ñ…¥¹•È¹}¡Ñµ°€ôMÑÉ¥¹œ¡Ù…±Õ”¤ìô°4(€€€€€€€€€•Ð¥¹¹•É!Q50 ¤ìÉ•ÑÕÉ¸½¹Ñ…¥¹•È¹}¡Ñµ°ìô°4(€€€€€€€ôì4(€€€€€ô4(€€€€€É•ÑÕÉ¸¹Õ±°ì4(€€€ô°4(€€€ÅÕ•ÉåM•±•Ñ½É±°¡Í•±•Ñ½È¤ì4(€€€€€¥˜€¡Í•±•Ñ½È€„ôô€‰m‘…Ñ„µ¡¥ÍÑ½Éäµ‘•Ñ…¥°µ¥¹‘•átˆ¤É•ÑÕÉ¸mtì4(€€€€€½¹ÍÐµ…Ñ¡•Ì€ôl¸¸¹Ñ¡¥Ì¹}¡Ñµ°¹µ…Ñ¡±° ½‘…Ñ„µ¡¥ÍÑ½Éäµ‘•Ñ…¥°µ¥¹‘•àôˆ¡lÀ´åt¬¤ˆ½œ¥tì4(€€€€€É•ÑÕÉ¸µ…Ñ¡•Ì¹µ…À ¡´¤€ôø€¡ì4(€€€€€€€‘…Ñ…Í•Ðèíô°4(€€€€€€€•ÑÑÑÉ¥‰ÕÑ”¡¹…µ”¤ìÉ•ÑÕÉ¸¹…µ”€ôôô€‰‘…Ñ„µ¡¥ÍÑ½Éäµ‘•Ñ…¥°µ¥¹‘•àˆ€üµlÅt€è¹Õ±°ìô°4(€€€€€€€…‘‘Ù•¹Ñ1¥ÍÑ•¹•È¡}•Ù•¹Ð°¡…¹‘±•È¤ì±¥ÍÑ•¹•ÉÌ¹ÁÕÍ ¡¡…¹‘±•È¤ìô°4(€€€€€ô¤¤ì4(€€€ô°4(€ôì4(4(€±½…‘5½‘Õ±”¡½¹Ñ•áÐ°€‰ÕÍÑ½µ•Èµ…ÁÀ½µ½‘Õ±•Ì½ÁÉ½™¥±”¹©Ìˆ¤ì4(€É½½Ð¹ÁÉ½™¥±”¹É•¹‘•È¡½¹Ñ…¥¹•È¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡±¥ÍÑ•¹•ÉÌ¹±•¹Ñ °€Ä¤ì4(€…Ý…¥Ð±¥ÍÑ•¹•ÉÍlÁt ¤ì4(€…ÍÍ•ÉÐ¹‘••ÁÅÕ…°¡‘•Ñ…¥±…±±Ì°l‰½Á…ÅÕ”¹É•˜‰t¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡É½½Ð¹ÍÑ…Ñ”¹ÕÍÑ½µ•É!¥ÍÑ½Éä¹‘•Ñ…¥°¹‰½½­¥¹}½‘”°€‰]	ÄÈÌˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡É½½Ð¹ÍÑ…Ñ”¹ÕÍÑ½µ•É!¥ÍÑ½Éä¹‘•Ñ…¥°¹©½‰}¥°Õ¹‘•™¥¹•¤ì4(4(€½¹ÍÐÍÕ‰µ¥ÑMÑ…Ñ”€ôì±…¥µMÑ…ÑÕÌè€‰Í…Ù¥¹œˆ°Í•…É¡%‘•¹Ñ¥™¥•Èè€‰]	ÄÈÌˆ°ÁÉ•Ù¥•Ý%Ñ•µÌèmíõtôì4(€É½½Ð¹ÍÑ…Ñ”¹Í•ÑÕÍÑ½µ•É!¥ÍÑ½Éä€ô€¡Á…Ñ ¤€ôø=‰©•Ð¹…ÍÍ¥¸¡ÍÕ‰µ¥ÑMÑ…Ñ”°Á…Ñ ¤ì4(€É½½Ð¹ÍÑ…Ñ”¹Í•ÑÕÍÑ½µ•É!¥ÍÑ½Éä¡ì±…¥µMÑ…ÑÕÌè€‰ÍÕ•ÍÌˆ°Í•…É¡%‘•¹Ñ¥™¥•Èè€ˆˆ°ÁÉ•Ù¥•Ý%Ñ•µÌèmt°±…¥µ•èÑÉÕ”ô¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ÍÕ‰µ¥ÑMÑ…Ñ”¹Í•…É¡%‘•¹Ñ¥™¥•È°€ˆˆ¤ì4(€…ÍÍ•ÉÐ¹‘••ÁÅÕ…°¡ÍÕ‰µ¥ÑMÑ…Ñ”¹ÁÉ•Ù¥•Ý%Ñ•µÌ°mt¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰ÕÍÑ½µ•ÈÁÀÍ¡•µ„µ¹½ÐµÉ•…‘äÍÑ…Ñ”½™™•ÉÌÉ•ÑÉä…¹…‘µ¥¸½¹Ñ…ÐÝ¥Ñ¡½ÕÐÝ•…­•¹¥¹œ•¹•É¥ŒÁÉ½½˜™…¥±ÕÉ”ˆ°€ ¤€ôøì4(€½¹ÍÐÍÉŒ€ô™Ì¹É•…‘¥±•Må¹Œ¡Á…Ñ ¹©½¥¸¡IA=}I==P°€‰ÕÍÑ½µ•Èµ…ÁÀ½µ½‘Õ±•Ì½ÁÉ½™¥±”¹©Ìˆ¤°€‰ÕÑ˜àˆ¤ì4(€½¹ÍÐÍÌ€ô™Ì¹É•…‘¥±•Må¹Œ¡Á…Ñ ¹©½¥¸¡IA=}I==P°€‰ÕÍÑ½µ•Èµ…ÁÀ½…ÍÍ•ÑÌ½ÕÍÑ½µ•Èµ…ÁÀ¹ÍÌˆ¤°€‰ÕÑ˜àˆ¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÉŒ°€½‘…Ñ„µ¡¥ÍÑ½ÉäµÉ•™É•Í¡mqÍqMt¨üû‚â—‚â·‚â‚æ‚â¯‚â‡‚æ ñp½‰ÕÑÑ½¸ø¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÉŒ°€¼ñ„±…ÍÌô‰Í•½¹‘…Éäµ‰Ñ¸ˆ¡É•˜ô‰¡ÑÑÁÌép½p½±¥¹p¹••p½àÁÑ½ÕadˆÑ…É•Ðô‰}‰±…¹¬ˆÉ•°ô‰¹½½Á•¹•È¹½É•™•ÉÉ•Èˆû‚âW‚âÓ‚âS‚âW‚æ#‚â·‚æ‚â·‚âS‚â‡‚âÓ‚âdñp½„ø¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡ÍÉŒ°€½¡ÑÑÁÌép½p½±¥¹p¹••p½™Å=ÄÝä¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÌ°€½p¹‰ÕÑÑ½¸µÉ½Üqì‘¥ÍÁ±…äè™±•àì™±•àµ‘¥É•Ñ¥½¸è½±Õµ¸ì…Àè€ÄÁÁàì¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÌ°€½p¹Í•½¹‘…Éäµ‰Ñ¸qímqÍqMt¨ýµ¥¸µ¡•¥¡Ðè€ÔÁÁàì¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÉŒ°€½•ÉÉ½Épýp¹ÍÑ…ÑÕÌ€ôôô€ÔÀÌ¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÉŒ°€¿‚æ‚â‡‚æ#‚â{‚âk‚âo‚â‚âÃ‚âŸ‚âÇ‚âW‚âÓ‚â‚âË‚âdƒ‚â‚â‚âã‚âO‚âË‚âW‚â‚âŸ‚â#‚â«‚â·‚âk‚â‚æ'‚â·‚â‡‚âç‚â—‚â·‚â×‚â‚â‚â‚âÇ‚æ'‚â¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡ÍÉŒ°€¿‚æ‚âk‚â·‚â‚æ3‚æ‚â_‚â‚æ‚â‡‚æ#‚â[‚âç‚âñ	½½­¥¹œ½‘”ƒ‚æ‚â‡‚æ#‚â[‚âç‚â¼¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰ÕÍÑ½µ•ÈÁÀÉ•¹‘•ÉÌ½¹”É•ÍÁ½¹Í¥Ù”Í•…É ¥¹ÁÕÐ°ÁÉ•Ù¥•Ü°…¹•áÁ±¥¥Ð±¥¹¬…Ñ¥½¸ˆ°€ ¤€ôøì4(€½¹ÍÐÍÉŒ€ô™Ì¹É•…‘¥±•Må¹Œ¡Á…Ñ ¹©½¥¸¡IA=}I==P°€‰ÕÍÑ½µ•Èµ…ÁÀ½µ½‘Õ±•Ì½ÁÉ½™¥±”¹©Ìˆ¤°€‰ÕÑ˜àˆ¤ì4(€½¹ÍÐÍÌ€ô™Ì¹É•…‘¥±•Må¹Œ¡Á…Ñ ¹©½¥¸¡IA=}I==P°€‰ÕÍÑ½µ•Èµ…ÁÀ½…ÍÍ•ÑÌ½ÕÍÑ½µ•Èµ…ÁÀ¹ÍÌˆ¤°€‰ÕÑ˜àˆ¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÉŒ°€¼ñ±…‰•°™½Èô‰¡¥ÍÑ½Éäµ¥‘•¹Ñ¥™¥•Èˆû‚æ‚âk‚â·‚â‚æ3‚æ‚â_‚âŒƒ‚â¯‚â‚âß‚â·‚â‚â¯‚âÇ‚â«‚â‚âË‚â‚â#‚â·‚âñp½±…‰•°ø¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÉŒ°€½¹…µ”ô‰¥‘•¹Ñ¥™¥•È‰mqÍqMt¨ýÁ±…•¡½±‘•Èô‹‚â‚â‚â·‚â‚æ‚âk‚â·‚â‚æ3‚æ‚â_‚â‚â¯‚â‚âß‚â·‚â‚â¯‚âÇ‚â«‚â‚âË‚â‚â#‚â·‚âˆ¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÉŒ°€¼‹‚â‚æ'‚âg‚â¯‚âË‚â‚âË‚âdˆ¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÉŒ°€¼‹‚âs‚âç‚â‚âo‚â‚âÃ‚âŸ‚âÇ‚âW‚âÓ‚â‚âÇ‚âk‚âk‚âÇ‚â7‚â+‚â×‚âg‚â×‚æ$ˆ¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÉŒ°€½ÁÉ½™¥±”µ¡¥ÍÑ½ÉäµÁÉ•Ù¥•Üµ…É¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÉŒ°€½…Ý…¥ÐÉ½½Ñp¹…Á¥p¹±…¥µÕÍÑ½µ•É!¥ÍÑ½Éåp¡¥‘•¹Ñ¥™¥•Ép¤ímqÍqMt¨ý…Ý…¥Ð±½…‘!¥ÍÑ½Éå…Ñ…p¡½¹Ñ…¥¹•Ép¤ì¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÉŒ°€½™Õ¹Ñ¥½¸É•¹‘•É1½•‘%¹p¡½¹Ñ…¥¹•Ép¥mqÍqMt¨ý±½…‘!¥ÍÑ½Éå…Ñ…p¡½¹Ñ…¥¹•Ép¤ì¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡ÍÉŒ°€½¹…µ”ô‰Á¡½¹”‰ñ¹…µ”ô‰‰½½­¥¹}½‘”‰ñ¥ô‰¡¥ÍÑ½ÉäµÁ¡½¹”‰ñ¥ô‰¡¥ÍÑ½Éäµ‰½½­¥¹œµ½‘”ˆ¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡ÍÉŒ°€¿‚â‚âÃ‚âk‚âk‚æ‚â+‚æ'‚æ‚âk‚â·‚â‚æ3‚æ‚â_‚â‚æ‚âW‚æ‚â‡‚æ‚â—‚âÀ	½½­¥¹œ½‘•ó‚âW‚æ'‚â·‚â‚æ‚â+‚æ'‚æ‚âk‚â·‚â‚æ0¸©	½½­¥¹œ½‘•ó‚æ‚â¯‚â—‚âS‚âo‚â‚âÃ‚âŸ‚âÇ‚âW‚âÐñp½‰ÕÑÑ½¸ø¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡ÍÉŒ°€½ÑåÁ”ô‰¡¥‘‘•¸‰ñ±½…±MÑ½É…”¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÌ°€½p¹ÁÉ½™¥±”µ¡¥ÍÑ½Éäµ…É±mqÍqMt¨ýp¹ÁÉ½™¥±”µ¡¥ÍÑ½ÉäµÁÉ•Ù¥•Üµ…Éqìµ¥¸µÝ¥‘Ñ è€Àìqô¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÌ°€½É¥µÑ•µÁ±…Ñ”µ½±Õµ¹Ìèµ¥¹µ…áp À°€Å™Ép¤¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÌ°€½½Ù•É™±½ÜµÝÉ…Àè…¹åÝ¡•É”¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÌ°€½p¹ÁÉ¥µ…Éäµ‰Ñ¸qímqÍqMt¨ýµ¥¸µ¡•¥¡Ðè€ÔÑÁà¼¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰ÕÍÑ½µ•È!¥ÍÑ½ÉäÍ•…É …¹ÁÉ•Ù¥•Ü­••À€ÌØÁÁà…¹€ÌäÁÁàÝ¥‘Ñ ½¹ÑÉ…ÑÌˆ°€ ¤€ôøì4(€½¹ÍÐÍÌ€ô™Ì¹É•…‘¥±•Må¹Œ¡Á…Ñ ¹©½¥¸¡IA=}I==P°€‰ÕÍÑ½µ•Èµ…ÁÀ½…ÍÍ•ÑÌ½ÕÍÑ½µ•Èµ…ÁÀ¹ÍÌˆ¤°€‰ÕÑ˜àˆ¤ì4(€½¹ÍÐÍÑ…ÉÐ€ôÍÌ¹¥¹‘•á=˜ ˆ¹ÁÉ½™¥±”µ¡¥ÍÑ½Éäµ…É°ˆ¤ì4(€½¹ÍÐ•¹€ôÍÌ¹¥¹‘•á=˜ ˆ¼¨€ôôôôôôôôôôôôôôôôôôôôô	ÕÑÑ½¹Ìˆ°ÍÑ…ÉÐ¤ì4(€½¹ÍÐ¡¥ÍÑ½ÉåÍÌ€ôÍÌ¹Í±¥”¡ÍÑ…ÉÐ°•¹¤ì4(€…ÍÍ•ÉÐ¹½¬¡ÍÑ…ÉÐ€øô€À€˜˜•¹€øÍÑ…ÉÐ¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÌ°€½p¨qì‰½àµÍ¥é¥¹œè‰½É‘•Èµ‰½àìqô¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÌ°€½p¹…ÉqímqÍqMt¨ýÝ¥‘Ñ è€ÄÀÀ”ì¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÌ°€½p¹¥¹ÁÕÐ°p¹Í•±•Ð°p¹Ñ•áÑ…É•„qímqÍqMt¨ýÝ¥‘Ñ è€ÄÀÀ”ì¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡¡¥ÍÑ½ÉåÍÌ°€½µ¥¸µÝ¥‘Ñ è€À¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡¡¥ÍÑ½ÉåÍÌ°€½É¥µÑ•µÁ±…Ñ”µ½±Õµ¹Ìèµ¥¹µ…áp À°€Å™Ép¤¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡¡¥ÍÑ½ÉåÍÌ°€¼ üéµ¥¸´¤ýÝ¥‘Ñ éqÌ¨ üélÐ´åuq‘ìÉõñlÄ´åuq‘ìÌ±ô¥Áà¼¤ì4(€™½È€¡½¹ÍÐÙ¥•ÝÁ½ÉÐ½˜lÌØÀ°€ÌäÁt¤…ÍÍ•ÉÐ¹½¬¡Ù¥•ÝÁ½ÉÐ€ø€ Äà€¨€È¤€¬€ÐÐ¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰ÕÍÑ½µ•ÈÁÀ…¡”Ù•ÉÍ¥½¸¥Ì‰ÕµÁ•½¹Í¥ÍÑ•¹Ñ±äˆ°€ ¤€ôøì4(€½¹ÍÐ•áÁ•Ñ•€ô€ˆÈÀÈØÀÜÈÙ}ÕÉ•¹Ñ}‘¥É•Ñ}…ÕÑ½}½™™•É}ØÄˆì(€™½È€¡½¹ÍÐ™¥±”½˜l4(€€€€‰ÕÍÑ½µ•Èµ…ÁÀ½¥¹‘•à¹¡Ñµ°ˆ°4(€€€€‰ÕÍÑ½µ•Èµ…ÁÀ½ÍÜ¹©Ìˆ°4(€€€€‰ÕÍÑ½µ•Èµ…ÁÀ½…ÍÍ•ÑÌ½ÕÍÑ½µ•Èµ…ÁÀ¹©Ìˆ°4(€€€€‰ÕÍÑ½µ•Èµ…ÁÀ½µ…¹¥™•ÍÐ¹Ý•‰µ…¹¥™•ÍÐˆ°4(€t¤ì4(€€€½¹ÍÐÍÉŒ€ô™Ì¹É•…‘¥±•Må¹Œ¡Á…Ñ ¹©½¥¸¡IA=}I==P°™¥±”¤°€‰ÕÑ˜àˆ¤ì4(€€€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÉŒ°¹•ÜI•áÀ¡•áÁ•Ñ•¤¤ì4(€€€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡ÍÉŒ°€¼ÈÀÈØÀÜÀå}É•Ù¥•Ý}±•…å}ØÄ¼¤ì4(€ô4)ô¤ì4(