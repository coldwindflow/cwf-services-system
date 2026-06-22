const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const express = require("express");

const createCatalogItemRoutes = require("../server/routes/catalog/items");

function makePool(initialItems = []) {
  const state = { items: initialItems.map((x) => ({ ...x })), queries: [] };
  let nextId = 1 + state.items.reduce((max, x) => Math.max(max, Number(x.item_id) || 0), 0);
  return {
    state,
    async query(sql, params = []) {
      state.queries.push({ sql, params });

      if (/INSERT INTO public\.catalog_items/.test(sql)) {
        const [item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible] = params;
        const row = { item_id: nextId++, item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible };
        state.items.push(row);
        return { rows: [row] };
      }

      if (/UPDATE public\.catalog_items/.test(sql)) {
        const [item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible, item_id] = params;
        const row = state.items.find((x) => String(x.item_id) === String(item_id));
        if (!row) return { rows: [] };
        Object.assign(row, { item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible });
        return { rows: [row] };
      }

      if (/FROM public\.catalog_items\s*WHERE item_id = \$1/.test(sql)) {
        const row = state.items.find((x) => String(x.item_id) === String(params[0]));
        return { rows: row ? [row] : [] };
      }

      if (/FROM public\.catalog_items\s*ORDER BY item_category, item_name\s*$/.test(sql)) {
        return { rows: state.items.slice() };
      }

      if (/FROM public\.catalog_items\s*WHERE/.test(sql)) {
        let rows = state.items.filter((x) => x.is_active === true);
        if (/is_customer_visible = TRUE/.test(sql)) rows = rows.filter((x) => x.is_customer_visible === true);
        return { rows };
      }

      return { rows: [] };
    },
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
    assert.equal(pool.state.queries.some((q) => /DELETE/i.test(q.sql)), false);
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
    assert.equal(pool.state.items.some((x) => x.item_id === 3), true);
  });
});

test("index.js passes the real requireAdminSession middleware into createCatalogItemRoutes", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  assert.match(source, /app\.use\(createCatalogItemRoutes\(\{\s*pool,\s*requireAdminSession\s*\}\)\)/);
});
