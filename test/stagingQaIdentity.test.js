"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  QA,
  assertStagingOnly,
  deriveAdminSessionToken,
  provisionQaIdentity,
  deleteQaOrders,
} = require("../scripts/stagingQaIdentity");

const SECRET = "test-only-secret-value-with-at-least-32-characters";
const CONTEXT = { environment: "staging", containerName: "cwf-staging-app", secret: SECRET };

class MemoryPool {
  constructor() {
    this.customer = null;
    this.identity = null;
    this.users = new Map();
    this.sessions = new Map();
    this.orders = [
      { id: 1, sub: QA.customerSub, kind: "service_prepaid" },
      { id: 2, sub: "real-customer", kind: "service_prepaid" },
    ];
    this.entitlements = [
      { id: 11, orderId: 1 },
      { id: 22, orderId: 2 },
    ];
    this.jobs = [];
  }

  async connect() { return { query: this.query.bind(this), release() {} }; }

  async query(sql, params = []) {
    const text = String(sql).replace(/\s+/g, " ").trim();
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text) || /pg_advisory_xact_lock/.test(text)) return { rows: [], rowCount: 0 };
    if (/SELECT provider, display_name FROM public.customer_profiles/.test(text)) {
      return { rows: this.customer ? [{ provider: this.customer.provider, display_name: this.customer.name }] : [] };
    }
    if (/SELECT customer_sub FROM public.customer_identities/.test(text)) {
      return { rows: this.identity ? [{ customer_sub: this.identity.sub }] : [] };
    }
    if (/SELECT username, role, full_name FROM public.users/.test(text)) {
      return { rows: [...this.users.entries()].map(([username, value]) => ({ username, ...value })) };
    }
    if (/INSERT INTO public.customer_profiles/.test(text)) {
      this.customer = { sub: params[0], provider: params[1], name: params[2] };
      return { rows: [], rowCount: 1 };
    }
    if (/INSERT INTO public.customer_identities/.test(text)) {
      this.identity = { sub: params[0], provider: params[1], subject: params[2] };
      return { rows: [], rowCount: 1 };
    }
    if (/INSERT INTO public.users/.test(text)) {
      const admin = text.includes("'admin'");
      this.users.set(params[0], { role: admin ? "admin" : "technician", full_name: params[1] });
      return { rows: [], rowCount: 1 };
    }
    if (/DELETE FROM public.auth_sessions/.test(text)) {
      this.sessions.delete(params[0]);
      return { rows: [], rowCount: 1 };
    }
    if (/INSERT INTO public.auth_sessions/.test(text)) {
      this.sessions.set(params[1], { token: params[0], role: "admin" });
      return { rows: [], rowCount: 1 };
    }
    if (/AS customer_count/.test(text)) {
      return { rows: [{
        customer_count: this.customer?.sub === QA.customerSub ? 1 : 0,
        identity_count: this.identity?.sub === QA.customerSub ? 1 : 0,
        admin_count: this.users.get(QA.adminUsername)?.role === "admin" ? 1 : 0,
        session_count: this.sessions.has(QA.adminUsername) ? 1 : 0,
        technician_count: this.users.get(QA.technicianUsername)?.role === "technician" ? 1 : 0,
      }] };
    }
    if (/SELECT COUNT\(\*\)::int AS count FROM public.jobs/.test(text)) {
      return { rows: [{ count: this.jobs.length }] };
    }
    if (/DELETE FROM public.customer_service_entitlements/.test(text)) {
      const qaOrderIds = new Set(this.orders.filter((order) => order.sub === params[0] && order.kind === "service_prepaid").map((order) => order.id));
      const deleted = this.entitlements.filter((entitlement) => qaOrderIds.has(entitlement.orderId));
      this.entitlements = this.entitlements.filter((entitlement) => !qaOrderIds.has(entitlement.orderId));
      return { rows: deleted, rowCount: deleted.length };
    }
    if (/DELETE FROM public.customer_orders/.test(text)) {
      const deleted = this.orders.filter((order) => order.sub === params[0] && order.kind === "service_prepaid");
      this.orders = this.orders.filter((order) => !(order.sub === params[0] && order.kind === "service_prepaid"));
      return { rows: deleted, rowCount: deleted.length };
    }
    return { rows: [], rowCount: 1 };
  }
}

test("staging-only guard accepts the designated staging container and secret", () => {
  assert.equal(assertStagingOnly(CONTEXT), true);
  assert.match(deriveAdminSessionToken(SECRET), /^[A-Za-z0-9_-]+$/);
});

test("production and unknown environments reject provisioning and cleanup", async () => {
  const pool = new MemoryPool();
  for (const environment of ["production", "test", "", undefined]) {
    assert.throws(() => assertStagingOnly({ ...CONTEXT, environment }), /STAGING_QA_ENVIRONMENT_REJECTED/);
    await assert.rejects(provisionQaIdentity({ pool, ...CONTEXT, environment }), /STAGING_QA_ENVIRONMENT_REJECTED/);
    await assert.rejects(deleteQaOrders({ pool, ...CONTEXT, environment }), /STAGING_QA_ENVIRONMENT_REJECTED/);
  }
  assert.throws(() => assertStagingOnly({ ...CONTEXT, containerName: "cwf-production-app" }), /STAGING_QA_CONTAINER_REJECTED/);
});

test("provisioning is idempotent and creates existing-model QA roles", async () => {
  const pool = new MemoryPool();
  const first = await provisionQaIdentity({ pool, ...CONTEXT });
  const second = await provisionQaIdentity({ pool, ...CONTEXT });
  assert.equal(first.adminSession, second.adminSession);
  assert.equal(pool.customer.sub, QA.customerSub);
  assert.equal(pool.identity.provider, "qa_staging");
  assert.deepEqual(pool.users.get(QA.adminUsername), { role: "admin", full_name: QA.adminName });
  assert.deepEqual(pool.users.get(QA.technicianUsername), { role: "technician", full_name: QA.technicianName });
  assert.equal(pool.sessions.size, 1);
});

test("cleanup removes only designated QA transactional rows", async () => {
  const pool = new MemoryPool();
  const result = await deleteQaOrders({ pool, ...CONTEXT });
  assert.deepEqual(result, { entitlements: 1, orders: 1 });
  assert.deepEqual(pool.orders, [{ id: 2, sub: "real-customer", kind: "service_prepaid" }]);
  assert.deepEqual(pool.entitlements, [{ id: 22, orderId: 2 }]);
});

test("repository contains only the secret contract, never an assigned QA credential", () => {
  const files = [
    "scripts/run-staging-air-care-qa.sh",
    "scripts/run-staging-air-care-qa.js",
    ".github/workflows/cwf-air-care-staging-qa.yml",
    ".github/workflows/cwf-air-reset-seed-gate.yml",
  ];
  const source = files.filter((file) => fs.existsSync(file)).map((file) => fs.readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(source, /CWF_STAGING_QA_SECRET\s*[:=]\s*["'][^$\n]{8,}/);
  assert.doesNotMatch(source, /cwf_staging_qa_secret_[A-Za-z0-9_-]+/i);
  assert.match(
    fs.readFileSync(".github/workflows/cwf-air-care-staging-qa.yml", "utf8"),
    /GIT_CONFIG_NOSYSTEM:\s*["']1["']/,
  );
  const operator = fs.readFileSync("scripts/run-staging-air-care-qa.sh", "utf8");
  const acceptance = fs.readFileSync("scripts/run-staging-air-care-qa.js", "utf8");
  assert.match(operator, /export CWF_JWT_SECRET="\$CWF_STAGING_QA_SECRET"/);
  assert.match(operator, /127\.0\.0\.1:3901/);
  assert.match(operator, /trap .*kill "\$qa_app_pid"/);
  assert.doesNotMatch(operator, /-p\s|--publish/);
  assert.match(acceptance, /dispatch_mode:\s*"forced"/);
  assert.doesNotMatch(acceptance, /dispatch_mode:\s*"normal"/);
});
