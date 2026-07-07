const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const express = require("express");

const customerPricing = require("../server/customerPricing");
const createCatalogItemRoutes = require("../server/routes/catalog/items");

function dbWithRules(rows = []) {
  return {
    queries: [],
    async query(sql, params = []) {
      this.queries.push({ sql: String(sql), params });
      return { rows: rows.map((r) => ({ ...r })) };
    },
  };
}

function concealedPayload(overrides = {}) {
  return { job_type: "clean", ac_type: "concealed", btu: 24000, machine_count: 1, ...overrides };
}

function wallPayload(overrides = {}) {
  return { job_type: "clean", ac_type: "wall", btu: 9000, machine_count: 1, wash_variant: "normal", ...overrides };
}

function rule(overrides = {}) {
  return {
    rule_id: 1,
    job_type: "clean",
    ac_type: "concealed",
    wash_variant: null,
    btu_min: null,
    btu_max: null,
    machine_min: null,
    machine_max: null,
    normal_price: 1200,
    active_price: 1200,
    is_active: true,
    priority: 10,
    ...overrides,
  };
}

test("resolver uses concealed fallback 1200 when no service rule is safe", async () => {
  const result = await customerPricing.resolveCustomerPricingMulti(concealedPayload(), dbWithRules([]));
  assert.equal(result.active_price, 1200);
  assert.equal(result.source, "fallback_pricing_js");
});

test("resolver rejects specific concealed 99999/88888 outlier and returns safe fallback", async () => {
  const result = await customerPricing.resolveCustomerPricingMulti(concealedPayload(), dbWithRules([
    rule({ rule_id: 9, normal_price: 99999, active_price: 88888, btu_min: 24000, btu_max: 24000 }),
  ]));
  assert.equal(result.active_price, 1200);
  assert.equal(result.source, "fallback_pricing_js_invalid_rule");
  assert.equal(result.rejected_rule_id, 9);
  assert.ok(result.rejected_rule_codes.includes("PRICE_OUTLIER"));
});

test("resolver rejects wildcard, product-linked, blank service, and catalog-mismatch rules", async () => {
  const badRules = [
    rule({ rule_id: 11, job_type: null, ac_type: null, normal_price: 99999, active_price: 88888 }),
    rule({ rule_id: 12, linked_catalog_item_id: 5, linked_catalog_item_category: "product" }),
    rule({ rule_id: 13, job_type: "", ac_type: "" }),
    rule({ rule_id: 14, linked_catalog_item_id: 6, linked_catalog_item_category: "service", linked_catalog_job_category: "repair", linked_catalog_ac_type: "wall" }),
  ];
  const result = await customerPricing.resolveCustomerPricingMulti(concealedPayload(), dbWithRules(badRules));
  assert.equal(result.active_price, 1200);
  assert.equal(result.source, "fallback_pricing_js_invalid_rule");
  assert.ok(result.lines[0].rejected_rule_codes.length);
});

test("resolver applies legitimate concealed, rainy wall, and repair rules", async () => {
  const concealed = await customerPricing.resolveCustomerPricingMulti(concealedPayload(), dbWithRules([
    rule({ rule_id: 21, normal_price: 1200, active_price: 1200 }),
  ]));
  assert.equal(concealed.active_price, 1200);
  assert.equal(concealed.source, "customer_service_price_rules");

  const wall = await customerPricing.resolveCustomerPricingMulti(wallPayload(), dbWithRules([
    rule({ rule_id: 22, job_type: "clean", ac_type: "wall", wash_variant: "normal", normal_price: 600, active_price: 550 }),
  ]));
  assert.equal(wall.active_price, 550);
  assert.equal(wall.normal_price, 600);

  const repair = await customerPricing.resolveCustomerPricingMulti({ job_type: "repair", ac_type: "wall", btu: 12000, machine_count: 1 }, dbWithRules([
    rule({ rule_id: 23, job_type: "repair", ac_type: "wall", normal_price: 3500, active_price: 3500 }),
  ]));
  assert.equal(repair.active_price, 3500);
});

test("validator rejects active above normal and invalid ranges", () => {
  assert.deepEqual(customerPricing.validateServicePriceRuleForWrite(rule({ normal_price: 1200, active_price: 1300 })).risk_codes, ["ACTIVE_PRICE_ABOVE_NORMAL"]);
  assert.ok(customerPricing.validateServicePriceRuleForWrite(rule({ btu_min: 30000, btu_max: 9000 })).risk_codes.includes("INVALID_BTU_RANGE"));
  assert.ok(customerPricing.validateServicePriceRuleForWrite(rule({ machine_min: 5, machine_max: 1 })).risk_codes.includes("INVALID_MACHINE_RANGE"));
});

test("overlapping safe rules choose deterministic winner and return warning", async () => {
  const result = await customerPricing.resolveCustomerPricingMulti(concealedPayload(), dbWithRules([
    rule({ rule_id: 31, normal_price: 1300, active_price: 1300, priority: 5 }),
    rule({ rule_id: 32, normal_price: 1250, active_price: 1250, priority: 5 }),
  ]));
  assert.equal(result.active_price, 1250);
  assert.equal(result.lines[0].rule_id, 32);
  assert.equal(result.lines[0].pricing_warning, "OVERLAPPING_ACTIVE_RULE");
});

function withServer(router, fn) {
  const app = express();
  app.use(express.json());
  app.use(router);
  const server = http.createServer(app);
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", async () => {
      const { port } = server.address();
      try {
        await fn(`http://127.0.0.1:${port}`);
        server.close(resolve);
      } catch (e) {
        server.close(() => reject(e));
      }
    });
  });
}

function routePool({ existingRule } = {}) {
  const state = { inserted: [], updated: [], existingRule: existingRule || rule({ rule_id: 1 }) };
  const pool = {
    state,
    async query(sql, params = []) {
      const s = String(sql);
      if (/CREATE TABLE|ALTER TABLE|CREATE INDEX/i.test(s)) return { rows: [] };
      if (s.includes("SELECT * FROM public.customer_service_price_rules")) return { rows: [state.existingRule] };
      if (s.includes("INSERT INTO public.customer_service_price_rules")) {
        state.inserted.push(params);
        return { rows: [{ rule_id: 99 }] };
      }
      if (s.includes("UPDATE public.customer_service_price_rules")) {
        state.updated.push(params);
        return { rows: [] };
      }
      if (s.includes("FROM public.customer_service_price_rules")) return { rows: [state.existingRule] };
      return { rows: [] };
    },
  };
  return pool;
}

test("POST and PUT customer price rules use the same safety validation", async () => {
  const pool = routePool();
  const router = customerPricing.createCustomerPricingRoutes({ pool, requireAdminSoft: (_req, _res, next) => next() });
  await withServer(router, async (base) => {
    const unsafe = { job_type: "clean", ac_type: "concealed", btu_min: 24000, btu_max: 24000, normal_price: 99999, active_price: 88888 };
    const post = await fetch(`${base}/admin/customer-pricing/rules`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(unsafe) });
    const put = await fetch(`${base}/admin/customer-pricing/rules/1`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(unsafe) });
    assert.equal(post.status, 400);
    assert.equal(put.status, 400);
    assert.equal((await post.json()).code, "UNSAFE_SERVICE_PRICE_RULE");
    assert.equal((await put.json()).code, "UNSAFE_SERVICE_PRICE_RULE");
  });
});

test("direct price book rejects blank scope and active price above normal", async () => {
  const pool = routePool();
  const router = customerPricing.createCustomerPricingRoutes({ pool, requireAdminSoft: (_req, _res, next) => next() });
  await withServer(router, async (base) => {
    const blank = await fetch(`${base}/admin/customer-pricing/rules`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ normal_price: 1200, active_price: 1200 }) });
    const inverted = await fetch(`${base}/admin/customer-pricing/rules`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job_type: "clean", ac_type: "wall", normal_price: 600, active_price: 700 }) });
    assert.equal(blank.status, 400);
    assert.ok((await blank.json()).risk_codes.includes("MISSING_JOB_TYPE"));
    assert.equal(inverted.status, 400);
    assert.ok((await inverted.json()).risk_codes.includes("ACTIVE_PRICE_ABOVE_NORMAL"));
  });
});

function catalogPool() {
  const state = { items: [], rules: [], queries: [] };
  let nextItemId = 1;
  let nextRuleId = 10;
  const pool = {
    state,
    connect: async () => ({ query: pool.query, release() {} }),
    async query(sql, params = []) {
      const s = String(sql);
      state.queries.push({ sql: s, params });
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(s)) return { rows: [] };
      if (s.includes("information_schema.columns") && s.includes("price_rule_id")) return { rows: [{ cnt: 3 }] };
      if (s.includes("information_schema.columns") && s.includes("short_description")) return { rows: [{ cnt: 0 }] };
      if (s.includes("information_schema.columns") && s.includes("is_autoplay_enabled")) return { rows: [{ cnt: 0 }] };
      if (s.includes("information_schema.columns")) return { rows: [{ cnt: 0 }] };
      if (s.includes("to_regclass")) return { rows: [{ reg: null }] };
      if (s.includes("INSERT INTO public.catalog_items")) {
        const [item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible] = params;
        const row = { item_id: nextItemId++, item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible, price_rule_id: null, image_url: null };
        state.items.push(row);
        return { rows: [{ item_id: row.item_id }] };
      }
      if (s.includes("INSERT INTO public.customer_service_price_rules")) {
        const [job_type, ac_type, btu_min, btu_max, normal_price, active_price] = params;
        const row = { rule_id: nextRuleId++, job_type, ac_type, btu_min, btu_max, normal_price, active_price, is_active: true };
        state.rules.push(row);
        return { rows: [{ rule_id: row.rule_id }] };
      }
      if (s.includes("SET price_rule_id=$1 WHERE item_id=$2")) {
        const item = state.items.find((x) => Number(x.item_id) === Number(params[1]));
        if (item) item.price_rule_id = params[0];
        return { rows: [] };
      }
      if (s.includes("FROM public.catalog_items")) {
        return { rows: state.items.map((item) => {
          const linked = state.rules.find((r) => Number(r.rule_id) === Number(item.price_rule_id));
          return {
            ...item,
            rule_job_type: linked?.job_type || null,
            rule_ac_type: linked?.ac_type || null,
            rule_normal_price: linked?.normal_price || null,
            rule_active_price: linked?.active_price || null,
            rule_is_active: linked?.is_active ?? null,
          };
        }) };
      }
      return { rows: [] };
    },
  };
  return pool;
}

test("catalog product pricing can save but remains catalog-only, while service pricing requires job/ac scope", async () => {
  const pool = catalogPool();
  const router = createCatalogItemRoutes({ pool, requireAdminSession: (_req, _res, next) => next() });
  await withServer(router, async (base) => {
    const product = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ item_name: "AC Product", item_category: "product", unit_label: "unit", base_price: 99999, is_active: true, is_customer_visible: true, pricing: { normal_price: 99999, active_price: 88888 } }),
    });
    assert.equal(product.status, 201);
    const productBody = await product.json();
    assert.equal(productBody.pricing_catalog_only, true);
    assert.ok(productBody.pricing_risk_codes.includes("PRODUCT_RULE_LEAK"));

    const service = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ item_name: "Unsafe service", item_category: "service", unit_label: "unit", base_price: 0, is_active: true, is_customer_visible: true, pricing: { normal_price: 1200, active_price: 1200 } }),
    });
    assert.equal(service.status, 400);
    assert.ok((await service.json()).risk_codes.includes("MISSING_JOB_TYPE"));
  });
});

test("admin UI source exposes safety warnings and cache-busted assets", () => {
  const promoJs = fs.readFileSync(path.join(__dirname, "..", "admin-promotions-v2.js"), "utf8");
  const promoHtml = fs.readFileSync(path.join(__dirname, "..", "admin-promotions-v2.html"), "utf8");
  const catalogJs = fs.readFileSync(path.join(__dirname, "..", "admin-store-catalog.js"), "utf8");
  const catalogHtml = fs.readFileSync(path.join(__dirname, "..", "admin-store-catalog.html"), "utf8");
  assert.match(promoJs, /Risky service price rules/);
  assert.match(promoJs, /ACTIVE_PRICE_ABOVE_NORMAL/);
  assert.match(catalogJs, /ราคาสินค้าเท่านั้น ไม่ใช้คำนวณค่าบริการ/);
  assert.match(catalogJs, /modalPricingRisk/);
  assert.match(promoHtml, /admin-promotions-v2\.js\?v=20260707_price_rule_safety_v1/);
  assert.match(catalogHtml, /admin-store-catalog\.js\?v=20260707_price_rule_safety_v1/);
});
