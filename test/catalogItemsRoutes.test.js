const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const express = require("express");

const createCatalogItemRoutes = require("../server/routes/catalog/items");

function makePool(initialItems = [], initialRules = [], { schemaReady = true } = {}) {
  const state = {
    items: initialItems.map((x) => ({ image_url: null, image_public_id: null, price_rule_id: null, ...x })),
    rules: initialRules.map((x) => ({ ...x })),
    queries: [],
    connectCount: 0,
    releaseCount: 0,
  };
  let nextItemId = 1 + state.items.reduce((max, x) => Math.max(max, Number(x.item_id) || 0), 0);
  let nextRuleId = 1 + state.rules.reduce((max, x) => Math.max(max, Number(x.rule_id) || 0), 0);

  function joinedRow(item) {
    const rule = item.price_rule_id ? state.rules.find((r) => String(r.rule_id) === String(item.price_rule_id)) : null;
    return {
      ...item,
      rule_normal_price: rule ? rule.normal_price : null,
      rule_active_price: rule ? rule.active_price : null,
      rule_campaign_name: rule ? rule.campaign_name : null,
      rule_is_active: rule ? rule.is_active : null,
      rule_effective_from: rule ? rule.effective_from : null,
      rule_effective_to: rule ? rule.effective_to : null,
      rule_wash_variant: rule ? rule.wash_variant : null,
      rule_label: rule ? rule.label : null,
      rule_priority: rule ? rule.priority : null,
    };
  }

  async function query(sql, params = []) {
    state.queries.push({ sql, params });
    const s = String(sql);

    if (s.includes("information_schema.columns") && s.includes("catalog_items")) {
      return { rows: [{ cnt: schemaReady ? 3 : 0 }] };
    }

    if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;?\s*$/i.test(s)) return { rows: [] };
    if (s.includes("ALTER TABLE") || s.includes("CREATE INDEX") || s.includes("ADD CONSTRAINT") || s.includes("DO $$")) return { rows: [] };

    if (s.includes("INSERT INTO public.catalog_items")) {
      const [item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible] = params;
      const row = {
        item_id: nextItemId++, item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max,
        is_active, is_customer_visible, image_url: null, image_public_id: null, price_rule_id: null,
      };
      state.items.push(row);
      return { rows: [{ item_id: row.item_id }] };
    }

    if (s.includes("INSERT INTO public.customer_service_price_rules")) {
      const [job_type, ac_type, btu_min, btu_max, normal_price, active_price, campaign_name, effective_from, effective_to, is_active, updated_by, wash_variant, label, priority] = params;
      const rule = { rule_id: nextRuleId++, job_type, ac_type, btu_min, btu_max, normal_price, active_price, campaign_name, effective_from, effective_to, is_active, updated_by, wash_variant, label, priority };
      state.rules.push(rule);
      return { rows: [{ rule_id: rule.rule_id }] };
    }

    if (s.includes("UPDATE public.customer_service_price_rules")) {
      const [rule_id, job_type, ac_type, btu_min, btu_max, normal_price, active_price, campaign_name, effective_from, effective_to, is_active, updated_by, wash_variant, label, priority] = params;
      const rule = state.rules.find((r) => String(r.rule_id) === String(rule_id));
      if (rule) Object.assign(rule, { job_type, ac_type, btu_min, btu_max, normal_price, active_price, campaign_name, effective_from, effective_to, is_active, updated_by, wash_variant, label, priority });
      return { rows: [] };
    }

    if (s.includes("SET price_rule_id=$1 WHERE item_id=$2")) {
      const [price_rule_id, item_id] = params;
      const row = state.items.find((x) => String(x.item_id) === String(item_id));
      if (row) row.price_rule_id = price_rule_id;
      return { rows: [] };
    }

    if (s.includes("SET price_rule_id=NULL WHERE item_id=$1")) {
      const [item_id] = params;
      const row = state.items.find((x) => String(x.item_id) === String(item_id));
      if (row) row.price_rule_id = null;
      return { rows: [] };
    }

    if (s.includes("SET image_url=$1, image_public_id=$2 WHERE item_id=$3")) {
      const [image_url, image_public_id, item_id] = params;
      const row = state.items.find((x) => String(x.item_id) === String(item_id));
      if (row) Object.assign(row, { image_url, image_public_id });
      return { rows: [] };
    }

    if (s.includes("SET image_url=NULL, image_public_id=NULL WHERE item_id=$1")) {
      const [item_id] = params;
      const row = state.items.find((x) => String(x.item_id) === String(item_id));
      if (row) Object.assign(row, { image_url: null, image_public_id: null });
      return { rows: [] };
    }

    if (s.includes("SET item_name=$1")) {
      const [item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible, item_id] = params;
      const row = state.items.find((x) => String(x.item_id) === String(item_id));
      if (row) Object.assign(row, { item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible });
      return { rows: [] };
    }

    if (s.includes("SELECT item_id, image_public_id FROM public.catalog_items")) {
      const row = state.items.find((x) => String(x.item_id) === String(params[0]));
      return { rows: row ? [{ item_id: row.item_id, image_public_id: row.image_public_id ?? null }] : [] };
    }

    if (s.includes("FROM public.catalog_items ci")) {
      if (s.includes("WHERE ci.item_id = $1")) {
        const row = state.items.find((x) => String(x.item_id) === String(params[0]));
        return { rows: row ? [joinedRow(row)] : [] };
      }
      if (!s.includes("WHERE")) {
        return { rows: state.items.map(joinedRow) };
      }
      let rows = state.items.filter((x) => x.is_active === true);
      if (s.includes("ci.is_customer_visible = TRUE")) rows = rows.filter((x) => x.is_customer_visible === true);
      return { rows: rows.map(joinedRow) };
    }

    return { rows: [] };
  }

  return {
    state,
    query,
    async connect() {
      state.connectCount += 1;
      return {
        query,
        release() {
          state.releaseCount += 1;
        },
      };
    },
  };
}

// Wraps a fake pool so it behaves like a pool with exactly one available connection:
// any pool.query() issued while a client is still checked out (between connect() and
// release()) throws instead of hanging forever, the way a real single-connection pool
// would. This is what catches the production hang: code that runs `pool.query(...)`
// for a post-COMMIT read instead of `client.query(...)` deadlocks against the same
// connection it is still holding — here that regresses to a thrown error (and
// therefore an HTTP 500) instead of an actual infinite hang, so the test fails fast.
function wrapAsSingleConnectionPool(pool) {
  let checkedOut = false;
  const poolQueryCallsWhileCheckedOut = [];
  const clientQueryCalls = [];
  let connectCalls = 0;
  let releaseCalls = 0;
  const originalQuery = pool.query;
  const originalConnect = pool.connect;

  pool.query = async (sql, params) => {
    if (checkedOut) {
      poolQueryCallsWhileCheckedOut.push(sql);
      throw new Error("SIMULATED_POOL_EXHAUSTED: pool.query() called while the only connection is checked out");
    }
    return originalQuery(sql, params);
  };

  pool.connect = async () => {
    if (checkedOut) throw new Error("SIMULATED_POOL_EXHAUSTED: no available connections");
    checkedOut = true;
    connectCalls += 1;
    const client = await originalConnect();
    return {
      query: async (sql, params) => {
        clientQueryCalls.push(sql);
        return client.query(sql, params);
      },
      release() {
        checkedOut = false;
        releaseCalls += 1;
        client.release();
      },
    };
  };

  return {
    poolQueryCallsWhileCheckedOut,
    clientQueryCalls,
    get connectCalls() { return connectCalls; },
    get releaseCalls() { return releaseCalls; },
  };
}

function allowAdmin(req, res, next) { next(); }
function denyAdmin(req, res) { res.status(401).json({ error: "UNAUTHORIZED" }); }

async function withServer(router, fn) {
  const app = express();
  app.use(express.json());
  app.use(router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function sampleItems() {
  return [
    { item_id: 1, item_name: "ล้างแอร์ผนัง", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", job_category: "ล้าง", ac_type: "ผนัง", btu_min: 9000, btu_max: 12000, is_active: true, is_customer_visible: true },
    { item_id: 2, item_name: "ซ่อมแอร์ไม่เย็น", item_category: "ซ่อมแอร์", base_price: 0, unit_label: "งาน", job_category: "ซ่อม", ac_type: null, btu_min: null, btu_max: null, is_active: true, is_customer_visible: false },
    { item_id: 3, item_name: "ล้างแอร์สี่ทิศทาง (ปิดใช้งาน)", item_category: "ล้างแอร์", base_price: 900, unit_label: "เครื่อง", job_category: "ล้าง", ac_type: "สี่ทิศทาง", btu_min: 18000, btu_max: null, is_active: false, is_customer_visible: true },
  ];
}

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0x00, 0x01, 0x02, 0x03]);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

function multipartImageForm(buffer, { filename = "photo.jpg", mimetype = "image/jpeg", fieldName = "image" } = {}) {
  const fd = new FormData();
  fd.append(fieldName, new Blob([buffer], { type: mimetype }), filename);
  return fd;
}

test("createCatalogItemRoutes throws without a requireAdminSession dependency", () => {
  assert.throws(() => createCatalogItemRoutes({ pool: makePool() }), /requireAdminSession/);
});

test("public GET /catalog/items still filters is_active=true", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(body.every((x) => x.is_active === true));
    assert.equal(body.some((x) => x.item_id === 3), false);
  });
});

test("public GET /catalog/items?customer=1 still filters is_customer_visible=true", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(body.every((x) => x.is_customer_visible === true));
    assert.equal(body.some((x) => x.item_id === 2), false);
    assert.equal(body.some((x) => x.item_id === 3), false);
  });
});

test("public API does not expose hidden or inactive items", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    const names = body.map((x) => x.item_name);
    assert.equal(names.includes("ซ่อมแอร์ไม่เย็น"), false);
    assert.equal(names.includes("ล้างแอร์สี่ทิศทาง (ปิดใช้งาน)"), false);
  });
});

test("admin GET is rejected when unauthorized", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`);
    assert.equal(res.status, 401);
    assert.equal(pool.state.queries.length, 0);
  });
});

test("admin GET, when authorized, returns both active and inactive items", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.length, 3);
    assert.ok(body.some((x) => x.is_active === false));
    assert.ok(body.some((x) => x.is_active === true));
  });
});

test("admin POST create validation rejects an empty name", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "   ", base_price: 100 }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /ชื่อ/);
  });
});

test("admin POST create validation rejects a negative price", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ", base_price: -1 }),
    });
    assert.equal(res.status, 400);
  });
});

test("admin POST create rejects btu_min > btu_max", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ BTU", btu_min: 24000, btu_max: 9000 }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /btu_min/);
  });
});

test("admin POST create succeeds with valid payload and defaults is_customer_visible to false", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ติดตั้งแอร์ใหม่", item_category: "ติดตั้ง", base_price: 1500, unit_label: "เครื่อง" }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.item_name, "ติดตั้งแอร์ใหม่");
    assert.equal(body.is_active, true);
    assert.equal(body.is_customer_visible, false);
  });
});

test("admin PATCH update validation rejects an unknown item_id", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/9999`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ไม่มีจริง" }),
    });
    assert.equal(res.status, 404);
  });
});

test("admin PATCH update rejects btu_min > btu_max against the merged record", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ btu_min: 99999 }),
    });
    assert.equal(res.status, 400);
  });
});

test("admin PATCH update only changes fields explicitly sent by the client", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_customer_visible: false }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.is_customer_visible, false);
    assert.equal(body.item_name, "ล้างแอร์ผนัง");
    assert.equal(Number(body.base_price), 700);
    assert.equal(body.is_active, true);
  });
});

test("deactivate uses UPDATE (is_active=false), never DELETE", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.is_active, false);
    assert.equal(pool.state.items.find((x) => x.item_id === 1).is_active, false);
    assert.equal(pool.state.items.length, 3);
    assert.equal(pool.state.queries.some((q) => /DELETE\s+FROM/i.test(q.sql)), false);
  });
});

test("SQL injection attempts cannot change query structure", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  const malicious = "Robert'); DROP TABLE public.catalog_items;--";
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: malicious, base_price: 10 }),
    });
    assert.equal(res.status, 201);
    const insertQuery = pool.state.queries.find((q) => /INSERT INTO public\.catalog_items/.test(q.sql));
    assert.ok(insertQuery);
    assert.equal(insertQuery.sql.includes(malicious), false);
    assert.ok(insertQuery.params.includes(malicious));
    assert.equal(pool.state.items.some((x) => x.item_id === 4 && x.item_name === malicious), true);
  });
});

test("index.js passes the real requireAdminSession middleware into createCatalogItemRoutes", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  assert.match(source, /app\.use\(createCatalogItemRoutes\(\{\s*pool,\s*requireAdminSession\s*\}\)\)/);
});

test("admin POST rejects an invalid is_active value and never writes to the DB", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ", is_active: "มั่ว" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /is_active/);
    assert.equal(pool.state.queries.some((q) => /INSERT INTO public\.catalog_items/.test(q.sql)), false);
  });
});

test("admin POST rejects an invalid is_customer_visible value (out-of-range number) and never writes to the DB", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ", is_customer_visible: 2 }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /is_customer_visible/);
    assert.equal(pool.state.queries.some((q) => /INSERT INTO public\.catalog_items/.test(q.sql)), false);
  });
});

test("admin PATCH rejects an invalid boolean and never writes to the DB", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: "มั่ว" }),
    });
    assert.equal(res.status, 400);
    assert.equal(pool.state.queries.some((q) => q.sql.includes("SET item_name=$1")), false);
    assert.equal(pool.state.items.find((x) => x.item_id === 1).is_active, true);
  });
});

test("admin POST accepts real booleans for is_active/is_customer_visible", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ", is_active: true, is_customer_visible: true }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.is_active, true);
    assert.equal(body.is_customer_visible, true);
  });
});

test("admin POST accepts the supported \"1\"/\"0\" string forms for booleans", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ", is_active: "0", is_customer_visible: "1" }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.is_active, false);
    assert.equal(body.is_customer_visible, true);
  });
});

test("admin POST accepts the backward-compatible \"yes\"/\"no\"/\"on\"/\"off\" string forms for booleans", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ", is_active: "off", is_customer_visible: "yes" }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.is_active, false);
    assert.equal(body.is_customer_visible, true);
  });
});

test("admin PATCH that does not send boolean fields preserves their existing values", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ล้างแอร์ผนัง (แก้ชื่อ)" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.is_active, true);
    assert.equal(body.is_customer_visible, true);
  });
});

test("legacy POST /catalog/items in index.js requires requireAdminSession", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  assert.match(source, /app\.post\("\/catalog\/items",\s*requireAdminSession,\s*async/);
});

test("no unauthenticated catalog write route declaration remains in index.js", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  assert.doesNotMatch(source, /app\.post\("\/catalog\/items",\s*async/);
});

test("public GET /catalog/items in index.js is not wrapped in requireAdminSession", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  assert.doesNotMatch(source, /app\.use\(createCatalogItemRoutes\(\{\s*pool,\s*requireAdminSession\s*\}\)\),\s*requireAdminSession/);
});

// ---------- Phase 2A.2: pricing (customer_service_price_rules link) ----------

test("an item without a price rule falls back to base_price for display_price and reports no promo", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    const item = body.find((x) => x.item_id === 1);
    assert.equal(item.normal_price, null);
    assert.equal(item.sale_price, null);
    assert.equal(Number(item.display_price), 700);
    assert.equal(item.has_promo, false);
  });
});

test("an active, currently-effective rule drives normal_price/sale_price and display_price", async () => {
  const items = sampleItems();
  items[0].price_rule_id = 50;
  const rules = [{ rule_id: 50, normal_price: 700, active_price: 550, campaign_name: "โปรหน้าฝน", is_active: true, effective_from: null, effective_to: null }];
  const pool = makePool(items, rules);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    const item = body.find((x) => x.item_id === 1);
    assert.equal(Number(item.normal_price), 700);
    assert.equal(Number(item.sale_price), 550);
    assert.equal(Number(item.display_price), 550);
    assert.equal(item.has_promo, true);
    assert.equal(item.campaign_name, "โปรหน้าฝน");
  });
});

test("an inactive rule is not used; falls back to base_price", async () => {
  const items = sampleItems();
  items[0].price_rule_id = 51;
  const rules = [{ rule_id: 51, normal_price: 700, active_price: 550, is_active: false, effective_from: null, effective_to: null }];
  const pool = makePool(items, rules);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    const item = body.find((x) => x.item_id === 1);
    assert.equal(item.normal_price, null);
    assert.equal(Number(item.display_price), 700);
    assert.equal(item.has_promo, false);
  });
});

test("an expired rule is not used; falls back to base_price", async () => {
  const items = sampleItems();
  items[0].price_rule_id = 52;
  const rules = [{ rule_id: 52, normal_price: 700, active_price: 550, is_active: true, effective_from: "2000-01-01T00:00:00Z", effective_to: "2000-02-01T00:00:00Z" }];
  const pool = makePool(items, rules);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    const item = body.find((x) => x.item_id === 1);
    assert.equal(item.normal_price, null);
    assert.equal(Number(item.display_price), 700);
  });
});

test("a future rule is not used; falls back to base_price", async () => {
  const items = sampleItems();
  items[0].price_rule_id = 53;
  const rules = [{ rule_id: 53, normal_price: 700, active_price: 550, is_active: true, effective_from: "2999-01-01T00:00:00Z", effective_to: null }];
  const pool = makePool(items, rules);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    const item = body.find((x) => x.item_id === 1);
    assert.equal(item.normal_price, null);
    assert.equal(Number(item.display_price), 700);
  });
});

test("admin GET of an inactive rule returns full raw pricing_* fields, but public GET falls back to base_price", async () => {
  const items = sampleItems();
  items[0].price_rule_id = 61;
  const rules = [{
    rule_id: 61, normal_price: 700, active_price: 550, campaign_name: "โปรหน้าฝน", is_active: false,
    effective_from: "2020-01-01T00:00:00Z", effective_to: "2099-01-01T00:00:00Z",
    wash_variant: "ล้างน้ำ", label: "โปรโมชันหน้าฝน", priority: 2,
  }];
  const pool = makePool(items, rules);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const adminRes = await fetch(`${base}/admin/catalog/items`);
    const adminBody = await adminRes.json();
    const adminItem = adminBody.find((x) => x.item_id === 1);
    assert.equal(Number(adminItem.pricing_normal_price), 700);
    assert.equal(Number(adminItem.pricing_active_price), 550);
    assert.equal(adminItem.pricing_campaign_name, "โปรหน้าฝน");
    assert.equal(adminItem.pricing_is_active, false);
    assert.equal(adminItem.pricing_wash_variant, "ล้างน้ำ");
    assert.equal(adminItem.pricing_label, "โปรโมชันหน้าฝน");
    assert.equal(adminItem.pricing_priority, 2);
    // Effective/public fields must NOT use the inactive rule's data.
    assert.equal(adminItem.normal_price, null);
    assert.equal(adminItem.has_active_promotion, false);

    const publicRes = await fetch(`${base}/catalog/items?customer=1`);
    const publicBody = await publicRes.json();
    const publicItem = publicBody.find((x) => x.item_id === 1);
    assert.equal(publicItem.normal_price, null);
    assert.equal(Number(publicItem.display_price), 700);
    assert.equal(publicItem.has_active_promotion, false);
    assert.equal(publicItem.pricing_normal_price, undefined);
  });
});

test("admin GET of a future rule returns full raw prices/dates/campaign, but public GET does not yet use the rule", async () => {
  const items = sampleItems();
  items[0].price_rule_id = 62;
  const rules = [{
    rule_id: 62, normal_price: 800, active_price: 600, campaign_name: "โปรซัมเมอร์", is_active: true,
    effective_from: "2999-01-01T00:00:00Z", effective_to: null,
    wash_variant: "ล้างน้ำยา", label: "ลดราคาล่วงหน้า", priority: 5,
  }];
  const pool = makePool(items, rules);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const adminRes = await fetch(`${base}/admin/catalog/items`);
    const adminBody = await adminRes.json();
    const adminItem = adminBody.find((x) => x.item_id === 1);
    assert.equal(Number(adminItem.pricing_normal_price), 800);
    assert.equal(Number(adminItem.pricing_active_price), 600);
    assert.equal(adminItem.pricing_campaign_name, "โปรซัมเมอร์");
    assert.equal(adminItem.pricing_effective_from, "2999-01-01T00:00:00Z");
    assert.equal(adminItem.pricing_wash_variant, "ล้างน้ำยา");
    assert.equal(adminItem.pricing_label, "ลดราคาล่วงหน้า");
    assert.equal(adminItem.pricing_priority, 5);

    const publicRes = await fetch(`${base}/catalog/items?customer=1`);
    const publicBody = await publicRes.json();
    const publicItem = publicBody.find((x) => x.item_id === 1);
    assert.equal(publicItem.normal_price, null);
    assert.equal(Number(publicItem.display_price), 700);
    assert.equal(publicItem.has_active_promotion, false);
    assert.equal(publicItem.campaign_name, null);
    assert.equal(publicItem.effective_from, null);
  });
});

test("admin GET of an expired rule returns full raw prices", async () => {
  const items = sampleItems();
  items[0].price_rule_id = 63;
  const rules = [{
    rule_id: 63, normal_price: 900, active_price: 650, campaign_name: "โปรเก่า", is_active: true,
    effective_from: "2000-01-01T00:00:00Z", effective_to: "2000-02-01T00:00:00Z",
    wash_variant: "ล้างน้ำ", label: "หมดอายุแล้ว", priority: 1,
  }];
  const pool = makePool(items, rules);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const adminRes = await fetch(`${base}/admin/catalog/items`);
    const adminBody = await adminRes.json();
    const adminItem = adminBody.find((x) => x.item_id === 1);
    assert.equal(Number(adminItem.pricing_normal_price), 900);
    assert.equal(Number(adminItem.pricing_active_price), 650);
    assert.equal(adminItem.pricing_campaign_name, "โปรเก่า");
    assert.equal(adminItem.pricing_effective_to, "2000-02-01T00:00:00Z");
    assert.equal(adminItem.pricing_is_active, true);

    const publicRes = await fetch(`${base}/catalog/items?customer=1`);
    const publicBody = await publicRes.json();
    const publicItem = publicBody.find((x) => x.item_id === 1);
    assert.equal(publicItem.normal_price, null);
    assert.equal(Number(publicItem.display_price), 700);
  });
});

test("the public contract fields are unchanged by the admin raw-pricing DTO addition", async () => {
  const items = sampleItems();
  items[0].price_rule_id = 64;
  const rules = [{
    rule_id: 64, normal_price: 700, active_price: 550, campaign_name: "โปรหน้าฝน", is_active: true,
    effective_from: null, effective_to: null, wash_variant: "ล้างน้ำ", label: "โปร", priority: 1,
  }];
  const pool = makePool(items, rules);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    const item = body.find((x) => x.item_id === 1);
    assert.equal(Number(item.normal_price), 700);
    assert.equal(Number(item.active_price), 550);
    assert.equal(item.has_active_promotion, true);
    assert.equal(Number(item.sale_price), 550);
    assert.equal(item.has_promo, true);
    assert.equal(item.campaign_name, "โปรหน้าฝน");
    assert.equal(item.price_label, "โปร");
    assert.equal(item.wash_variant, "ล้างน้ำ");
    assert.equal(item.priority, 1);
    // No raw admin-only fields ever leak into the public response.
    assert.equal(item.pricing_normal_price, undefined);
    assert.equal(item.pricing_is_active, undefined);
  });
});

test("admin POST with a pricing object creates the catalog item and the linked price rule transactionally", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_name: "ล้างแอร์โปร", base_price: 700,
        pricing: { normal_price: 700, active_price: 500, campaign_name: "โปรทดสอบ", pricing_is_active: true },
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.price_rule_id);
    assert.equal(Number(body.normal_price), 700);
    assert.equal(Number(body.sale_price), 500);
    assert.equal(pool.state.rules.length, 1);
    assert.equal(pool.state.rules[0].rule_id, body.price_rule_id);
  });
});

test("admin POST with invalid pricing rejects the whole request and writes nothing", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_name: "ล้างแอร์โปร", base_price: 700,
        pricing: { normal_price: -1, active_price: 500 },
      }),
    });
    assert.equal(res.status, 400);
    assert.equal(pool.state.items.length, 3);
    assert.equal(pool.state.rules.length, 0);
    assert.equal(pool.state.queries.some((q) => q.sql.includes("INSERT INTO public.catalog_items")), false);
  });
});

test("admin PATCH that omits pricing entirely preserves the existing linked price rule", async () => {
  const items = sampleItems();
  items[0].price_rule_id = 60;
  const rules = [{ rule_id: 60, normal_price: 700, active_price: 550, campaign_name: "เดิม", is_active: true, effective_from: null, effective_to: null }];
  const pool = makePool(items, rules);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ล้างแอร์ผนัง (อัปเดตชื่อ)" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.price_rule_id, 60);
    assert.equal(Number(body.normal_price), 700);
    assert.equal(pool.state.rules[0].campaign_name, "เดิม");
  });
});

test("admin PATCH with a pricing object updates the existing linked price rule in place", async () => {
  const items = sampleItems();
  items[0].price_rule_id = 61;
  const rules = [{ rule_id: 61, normal_price: 700, active_price: 550, campaign_name: "เดิม", is_active: true, effective_from: null, effective_to: null }];
  const pool = makePool(items, rules);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pricing: { normal_price: 800, active_price: 600, campaign_name: "ใหม่", pricing_is_active: true } }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.price_rule_id, 61);
    assert.equal(Number(body.normal_price), 800);
    assert.equal(Number(body.sale_price), 600);
    assert.equal(pool.state.rules.length, 1);
    assert.equal(pool.state.rules[0].campaign_name, "ใหม่");
  });
});

test("admin PATCH with invalid pricing rejects the whole request and changes nothing", async () => {
  const items = sampleItems();
  items[0].price_rule_id = 62;
  const rules = [{ rule_id: 62, normal_price: 700, active_price: 550, campaign_name: "เดิม", is_active: true, effective_from: null, effective_to: null }];
  const pool = makePool(items, rules);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "พังตรงนี้", pricing: { normal_price: "ไม่ใช่ตัวเลข", active_price: 600 } }),
    });
    assert.equal(res.status, 400);
    assert.equal(pool.state.items.find((x) => x.item_id === 1).item_name, "ล้างแอร์ผนัง");
    assert.equal(pool.state.rules[0].campaign_name, "เดิม");
  });
});

test("admin requests are rejected when unauthorized for pricing-bearing writes too", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "x", pricing: { normal_price: 1, active_price: 1 } }),
    });
    assert.equal(res.status, 401);
    assert.equal(pool.state.items.length, 3);
  });
});

// ---------- Phase 2A.2: image upload/delete (Cloudinary via DI) ----------

test("image upload is rejected when unauthorized", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/image`, {
      method: "POST",
      body: multipartImageForm(JPEG_BYTES),
    });
    assert.equal(res.status, 401);
  });
});

test("image upload rejects an invalid item id", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/abc/image`, {
      method: "POST",
      body: multipartImageForm(JPEG_BYTES),
    });
    assert.equal(res.status, 400);
  });
});

test("image upload rejects a missing file", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const fd = new FormData();
    fd.append("note", "no image field here");
    const res = await fetch(`${base}/admin/catalog/items/1/image`, { method: "POST", body: fd });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /ไฟล์/);
  });
});

test("image upload rejects a file larger than 5MB", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const big = Buffer.concat([JPEG_BYTES, Buffer.alloc(6 * 1024 * 1024)]);
    const res = await fetch(`${base}/admin/catalog/items/1/image`, {
      method: "POST",
      body: multipartImageForm(big),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /5MB/);
  });
});

test("image upload rejects an unsupported MIME type", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/image`, {
      method: "POST",
      body: multipartImageForm(Buffer.from("GIF89a"), { mimetype: "image/gif", filename: "x.gif" }),
    });
    assert.equal(res.status, 400);
  });
});

test("image upload rejects a file whose bytes do not match its declared MIME type", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/image`, {
      method: "POST",
      body: multipartImageForm(Buffer.from("not really a jpeg"), { mimetype: "image/jpeg" }),
    });
    assert.equal(res.status, 400);
  });
});

test("image upload succeeds via the injected uploader and stores url/public_id without calling real Cloudinary", async () => {
  const pool = makePool(sampleItems());
  let calledWith = null;
  const uploadCatalogImage = async (args) => {
    calledWith = args;
    return { url: "https://res.cloudinary.com/demo/image/upload/v1/cwf/catalog-items/item-1.jpg", public_id: "cwf/catalog-items/item-1" };
  };
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, uploadCatalogImage });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/image`, {
      method: "POST",
      body: multipartImageForm(JPEG_BYTES),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.image_url, "https://res.cloudinary.com/demo/image/upload/v1/cwf/catalog-items/item-1.jpg");
    assert.equal(pool.state.items.find((x) => x.item_id === 1).image_public_id, "cwf/catalog-items/item-1");
    assert.ok(calledWith.buffer);
    assert.equal(calledWith.itemId, "1");
  });
});

test("a Cloudinary upload failure does not touch the database", async () => {
  const pool = makePool(sampleItems());
  const uploadCatalogImage = async () => { throw new Error("cloudinary down"); };
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, uploadCatalogImage });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/image`, {
      method: "POST",
      body: multipartImageForm(JPEG_BYTES),
    });
    assert.equal(res.status, 500);
    assert.equal(pool.state.items.find((x) => x.item_id === 1).image_url, null);
    assert.equal(pool.state.queries.some((q) => q.sql.includes("SET image_url=$1")), false);
  });
});

test("replacing an image updates url/public_id and best-effort deletes the previous Cloudinary asset", async () => {
  const pool = makePool(sampleItems());
  const deletedIds = [];
  let uploadCount = 0;
  const uploadCatalogImage = async () => {
    uploadCount += 1;
    return { url: `https://res.cloudinary.com/demo/v${uploadCount}.jpg`, public_id: `cwf/catalog-items/item-1-v${uploadCount}` };
  };
  const deleteCatalogImage = async (publicId) => { deletedIds.push(publicId); return { ok: true }; };
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, uploadCatalogImage, deleteCatalogImage });
  await withServer(router, async (base) => {
    const first = await fetch(`${base}/admin/catalog/items/1/image`, { method: "POST", body: multipartImageForm(JPEG_BYTES) });
    assert.equal(first.status, 200);
    const second = await fetch(`${base}/admin/catalog/items/1/image`, { method: "POST", body: multipartImageForm(PNG_BYTES, { mimetype: "image/png", filename: "x.png" }) });
    assert.equal(second.status, 200);
    const secondBody = await second.json();
    assert.equal(secondBody.image_url, "https://res.cloudinary.com/demo/v2.jpg");
    assert.equal(pool.state.items.find((x) => x.item_id === 1).image_public_id, "cwf/catalog-items/item-1-v2");
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(deletedIds, ["cwf/catalog-items/item-1-v1"]);
  });
});

test("deleting an image clears image_url/image_public_id in the database", async () => {
  const items = sampleItems();
  items[0].image_url = "https://res.cloudinary.com/demo/old.jpg";
  items[0].image_public_id = "cwf/catalog-items/item-1-old";
  const pool = makePool(items);
  let deletedId = null;
  const deleteCatalogImage = async (publicId) => { deletedId = publicId; return { ok: true }; };
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, deleteCatalogImage });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/image`, { method: "DELETE" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.image_url, null);
    assert.equal(deletedId, "cwf/catalog-items/item-1-old");
    assert.equal(pool.state.items.find((x) => x.item_id === 1).image_url, null);
    assert.equal(pool.state.items.find((x) => x.item_id === 1).image_public_id, null);
  });
});

test("a Cloudinary delete failure still clears the database (DB-first, Cloudinary best-effort)", async () => {
  const items = sampleItems();
  items[0].image_url = "https://res.cloudinary.com/demo/old.jpg";
  items[0].image_public_id = "cwf/catalog-items/item-1-old";
  const pool = makePool(items);
  const deleteCatalogImage = async () => { throw new Error("cloudinary delete down"); };
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, deleteCatalogImage });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/image`, { method: "DELETE" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.image_url, null);
    assert.equal(pool.state.items.find((x) => x.item_id === 1).image_url, null);
    assert.equal(pool.state.items.find((x) => x.item_id === 1).image_public_id, null);
  });
});

// ---------- Phase 2A.2 production-blocker regression tests ----------

test("no route ever issues DDL during a request", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    await fetch(`${base}/catalog/items`);
    await fetch(`${base}/admin/catalog/items`);
    await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ DDL", base_price: 10 }),
    });
    const ddl = pool.state.queries.some((q) => /ALTER TABLE|CREATE INDEX|ADD CONSTRAINT/i.test(q.sql));
    assert.equal(ddl, false);
  });
});

test("when the media/pricing schema is not ready, GET falls back to the legacy select with no DDL", async () => {
  const pool = makePool(sampleItems(), [], { schemaReady: false });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.length > 0);
    const ddl = pool.state.queries.some((q) => /ALTER TABLE|CREATE INDEX|ADD CONSTRAINT/i.test(q.sql));
    assert.equal(ddl, false);
  });
});

test("admin PATCH with pricing explicitly set to null preserves the existing linked price rule", async () => {
  const items = sampleItems();
  items[0].price_rule_id = 70;
  const rules = [{ rule_id: 70, normal_price: 700, active_price: 550, campaign_name: "เดิม", is_active: true, effective_from: null, effective_to: null }];
  const pool = makePool(items, rules);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pricing: null }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.price_rule_id, 70);
    assert.equal(Number(body.normal_price), 700);
    assert.equal(pool.state.items.find((x) => x.item_id === 1).price_rule_id, 70);
    assert.equal(pool.state.rules[0].campaign_name, "เดิม");
  });
});

test("admin POST rejects pricing.active_price greater than pricing.normal_price", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ", pricing: { normal_price: 500, active_price: 600 } }),
    });
    assert.equal(res.status, 400);
    assert.equal(pool.state.rules.length, 0);
  });
});

test("admin POST rejects an empty-string normal_price instead of coercing it to 0", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ", pricing: { normal_price: "", active_price: 500 } }),
    });
    assert.equal(res.status, 400);
    assert.equal(pool.state.rules.length, 0);
  });
});

test("admin POST rejects an effective_from after effective_to", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_name: "ทดสอบ",
        pricing: { normal_price: 500, active_price: 400, effective_from: "2026-12-31", effective_to: "2026-01-01" },
      }),
    });
    assert.equal(res.status, 400);
    assert.equal(pool.state.rules.length, 0);
  });
});

test("admin POST rejects an invalid effective_from date string", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_name: "ทดสอบ",
        pricing: { normal_price: 500, active_price: 400, effective_from: "not-a-date" },
      }),
    });
    assert.equal(res.status, 400);
    assert.equal(pool.state.rules.length, 0);
  });
});

test("a validation failure never calls pool.connect()", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "" }),
    });
    assert.equal(res.status, 400);
    assert.equal(pool.state.connectCount, 0);
  });
});

test("a successful admin POST connects exactly once and releases exactly once", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ connect" }),
    });
    assert.equal(res.status, 201);
    assert.equal(pool.state.connectCount, 1);
    assert.equal(pool.state.releaseCount, 1);
  });
});

test("a successful admin PATCH connects exactly once and releases exactly once", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ patch connect" }),
    });
    assert.equal(res.status, 200);
    assert.equal(pool.state.connectCount, 1);
    assert.equal(pool.state.releaseCount, 1);
  });
});

test("an admin PATCH on an unknown item never calls pool.connect()", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/9999`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ไม่มีจริง" }),
    });
    assert.equal(res.status, 404);
    assert.equal(pool.state.connectCount, 0);
  });
});

test("admin POST responds successfully (no hang/deadlock) against a single-connection pool", async () => {
  const pool = makePool(sampleItems());
  const tracker = wrapAsSingleConnectionPool(pool);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ single-connection pool" }),
    });
    assert.equal(res.status, 201);
    assert.deepEqual(tracker.poolQueryCallsWhileCheckedOut, []);
    assert.equal(tracker.connectCalls, 1);
    assert.equal(tracker.releaseCalls, 1);
    // The post-COMMIT final SELECT must go through the held client, not the pool.
    assert.ok(tracker.clientQueryCalls.some((sql) => String(sql).includes("WHERE ci.item_id = $1")));
  });
});

test("admin PATCH responds successfully (no hang/deadlock) against a single-connection pool", async () => {
  const pool = makePool(sampleItems());
  const tracker = wrapAsSingleConnectionPool(pool);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ patch single-connection pool" }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(tracker.poolQueryCallsWhileCheckedOut, []);
    assert.equal(tracker.connectCalls, 1);
    assert.equal(tracker.releaseCalls, 1);
    assert.ok(tracker.clientQueryCalls.some((sql) => String(sql).includes("WHERE ci.item_id = $1")));
  });
});

test("admin POST with a pricing rule still responds successfully against a single-connection pool", async () => {
  const pool = makePool(sampleItems());
  const tracker = wrapAsSingleConnectionPool(pool);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_name: "ทดสอบราคา",
        pricing: { normal_price: 700, active_price: 550, pricing_is_active: true },
      }),
    });
    assert.equal(res.status, 201);
    assert.deepEqual(tracker.poolQueryCallsWhileCheckedOut, []);
    assert.equal(tracker.releaseCalls, 1);
  });
});

test("a failed admin PATCH against a single-connection pool still rolls back and releases without hanging", async () => {
  const items = sampleItems();
  const pool = makePool(items);
  const originalConnect = pool.connect;
  pool.connect = async () => {
    const client = await originalConnect();
    return {
      query: async (sql, params) => {
        if (String(sql).includes("UPDATE public.catalog_items") && String(sql).includes("SET item_name=$1")) {
          throw new Error("simulated write failure");
        }
        return client.query(sql, params);
      },
      release: client.release ? client.release.bind(client) : () => {},
    };
  };
  const tracker = wrapAsSingleConnectionPool(pool);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ rollback" }),
    });
    assert.equal(res.status, 500);
    assert.equal(tracker.connectCalls, 1);
    assert.equal(tracker.releaseCalls, 1);
  });
});

test("image upload SQL is parameterized: a hostile filename/public_id never appears as raw SQL text", async () => {
  const pool = makePool(sampleItems());
  const hostilePublicId = "x'); DROP TABLE public.catalog_items;--";
  const uploadCatalogImage = async () => ({ url: "https://res.cloudinary.com/demo/x.jpg", public_id: hostilePublicId });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, uploadCatalogImage });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/image`, { method: "POST", body: multipartImageForm(JPEG_BYTES) });
    assert.equal(res.status, 200);
    const updateQuery = pool.state.queries.find((q) => q.sql.includes("SET image_url=$1, image_public_id=$2"));
    assert.ok(updateQuery);
    assert.equal(updateQuery.sql.includes(hostilePublicId), false);
    assert.ok(updateQuery.params.includes(hostilePublicId));
  });
});
