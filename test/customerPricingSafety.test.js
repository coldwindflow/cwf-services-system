const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const express = require("express");

const customerPricing = require("../server/customerPricing");
const createCatalogItemRoutes = require("../server/routes/catalog/items");

function dbWithRules(rows = [], options = {}) {
  const links = options.links || [];
  const failCatalogLinks = options.failCatalogLinks || null;
  const fullLinkError = options.fullLinkError || null;
  return {
    queries: [],
    async query(sql, params = []) {
      const s = String(sql);
      this.queries.push({ sql: s, params });
      if (s.includes("FROM public.catalog_items")) {
        if (fullLinkError && s.includes("item_category")) throw fullLinkError;
        if (failCatalogLinks) throw failCatalogLinks;
        return { rows: links.map((r) => ({ ...r })) };
      }
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
    rule({ rule_id: 12 }),
    rule({ rule_id: 13, job_type: "", ac_type: "" }),
    rule({ rule_id: 14 }),
  ];
  const result = await customerPricing.resolveCustomerPricingMulti(concealedPayload(), dbWithRules(badRules, {
    links: [
      { price_rule_id: 12, item_id: 5, item_category: "product", job_category: null, ac_type: null },
      { price_rule_id: 14, item_id: 6, item_category: "service", job_category: "repair", ac_type: "wall" },
    ],
  }));
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

test("BTU range validation preserves rainy-season btu_min zero rules", async () => {
  assert.equal(customerPricing.validateServicePriceRuleForWrite(rule({ job_type: "clean", ac_type: "wall", wash_variant: "normal", btu_min: 0, btu_max: 12000, normal_price: 600, active_price: 550 })).ok, true);
  assert.ok(customerPricing.validateServicePriceRuleForWrite(rule({ btu_min: -1, btu_max: 12000 })).risk_codes.includes("INVALID_BTU_RANGE"));
  assert.ok(customerPricing.validateServicePriceRuleForWrite(rule({ btu_min: 0, btu_max: 0 })).risk_codes.includes("INVALID_BTU_RANGE"));
  assert.ok(customerPricing.validateServicePriceRuleForWrite(rule({ btu_min: 18000, btu_max: 12000 })).risk_codes.includes("INVALID_BTU_RANGE"));

  const rainyRules = [
    rule({ rule_id: 41, job_type: "clean", ac_type: "wall", wash_variant: "normal", btu_min: 0, btu_max: 12000, normal_price: 600, active_price: 550 }),
    rule({ rule_id: 42, job_type: "clean", ac_type: "wall", wash_variant: "premium", btu_min: 0, btu_max: 12000, normal_price: 900, active_price: 790 }),
    rule({ rule_id: 43, job_type: "clean", ac_type: "wall", wash_variant: "coil", btu_min: 0, btu_max: 12000, normal_price: 1400, active_price: 1290 }),
    rule({ rule_id: 44, job_type: "clean", ac_type: "wall", wash_variant: "overhaul", btu_min: 0, btu_max: 12000, normal_price: 2000, active_price: 1850 }),
    rule({ rule_id: 45, job_type: "clean", ac_type: "wall", wash_variant: "normal", btu_min: 18000, btu_max: null, normal_price: 750, active_price: 690 }),
  ];
  for (const [wash_variant, btu, expected] of [["normal", 9000, 550], ["premium", 9000, 790], ["coil", 9000, 1290], ["overhaul", 9000, 1850], ["normal", 18000, 690]]) {
    const result = await customerPricing.resolveCustomerPricingMulti(wallPayload({ wash_variant, btu }), dbWithRules(rainyRules));
    assert.equal(result.active_price, expected);
    assert.equal(result.source, "customer_service_price_rules");
  }
});

test("install service price rules are unsupported and never auto-price manual quote work", async () => {
  const high = rule({ rule_id: 51, job_type: "install", ac_type: "wall", normal_price: 99999, active_price: 88888 });
  const normalLooking = rule({ rule_id: 52, job_type: "install", ac_type: "wall", normal_price: 3000, active_price: 3000 });
  assert.ok(customerPricing.validateServicePriceRuleForWrite(high).risk_codes.includes("AUTO_PRICING_UNSUPPORTED"));
  assert.ok(customerPricing.validateServicePriceRuleForWrite(normalLooking).risk_codes.includes("AUTO_PRICING_UNSUPPORTED"));
  const result = await customerPricing.resolveCustomerPricingMulti({ job_type: "install", ac_type: "wall", btu: 12000, machine_count: 1 }, dbWithRules([normalLooking]));
  assert.equal(result.active_price, 0);
  assert.equal(result.source, "fallback_pricing_js_invalid_rule");
  assert.ok(result.rejected_rule_codes.includes("AUTO_PRICING_UNSUPPORTED"));
});

test("admin audit flags outliers and exact threshold boundary with the same backend safety decision", () => {
  const unsafe = rule({ rule_id: 61, normal_price: 99999, active_price: 88888, btu_min: 24000, btu_max: 24000 });
  const boundary = rule({ rule_id: 62, normal_price: 12000, active_price: 12000, btu_min: 24000, btu_max: 24000 });
  const safe = rule({ rule_id: 63, normal_price: 1200, active_price: 1200, btu_min: 24000, btu_max: 24000 });
  assert.equal(customerPricing.canonicalFallbackUnitForRule(unsafe), 1200);
  const rows = customerPricing.annotateRuleRisks([unsafe, boundary, safe]);
  assert.ok(rows.find((r) => r.rule_id === 61).risk_codes.includes("PRICE_OUTLIER"));
  assert.ok(rows.find((r) => r.rule_id === 62).risk_codes.includes("PRICE_OUTLIER"));
  assert.equal(rows.find((r) => r.rule_id === 63).is_safe_for_service_pricing, true);
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

function adminRulesPool(rows = [], links = [], options = {}) {
  const state = { updated: [] };
  let catalogReads = 0;
  return {
    state,
    async query(sql, params = []) {
      const s = String(sql);
      if (/CREATE TABLE|ALTER TABLE|CREATE INDEX/i.test(s)) return { rows: [] };
      if (s.includes("UPDATE public.customer_service_price_rules")) {
        state.updated.push(params);
        return { rows: [] };
      }
      if (s.includes("SELECT * FROM public.customer_service_price_rules")) {
        return { rows: rows.filter((row) => Number(row.rule_id) === Number(params[0])).map((row) => ({ ...row })) };
      }
      if (s.includes("FROM public.customer_service_price_rules")) return { rows: rows.map((row) => ({ ...row })) };
      if (s.includes("FROM public.catalog_items")) {
        catalogReads += 1;
        if (options.catalogError) throw options.catalogError;
        if (options.fullLinkError && s.includes("item_category")) throw options.fullLinkError;
        return { rows: links.map((link) => ({ ...link })) };
      }
      return { rows: [] };
    },
    get catalogReads() { return catalogReads; },
  };
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

test("POST, PUT, and toggle reject install auto-pricing rules", async () => {
  const installRule = rule({ rule_id: 71, job_type: "install", ac_type: "wall", normal_price: 3000, active_price: 3000 });
  const pool = adminRulesPool([installRule]);
  const router = customerPricing.createCustomerPricingRoutes({ pool, requireAdminSoft: (_req, _res, next) => next() });
  await withServer(router, async (base) => {
    const post = await fetch(`${base}/admin/customer-pricing/rules`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(installRule) });
    const put = await fetch(`${base}/admin/customer-pricing/rules/71`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(installRule) });
    const toggle = await fetch(`${base}/admin/customer-pricing/rules/71/toggle`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ is_active: true }) });
    assert.equal(post.status, 400);
    assert.equal(put.status, 400);
    assert.equal(toggle.status, 400);
    assert.ok((await post.json()).risk_codes.includes("AUTO_PRICING_UNSUPPORTED"));
    assert.ok((await put.json()).risk_codes.includes("AUTO_PRICING_UNSUPPORTED"));
    assert.ok((await toggle.json()).risk_codes.includes("AUTO_PRICING_UNSUPPORTED"));
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

test("GET admin rules returns one row per rule with outlier and install audit risks", async () => {
  const pool = adminRulesPool([
    rule({ rule_id: 81, normal_price: 99999, active_price: 88888, btu_min: 24000, btu_max: 24000 }),
    rule({ rule_id: 82, job_type: "install", ac_type: "wall", normal_price: 3000, active_price: 3000 }),
  ]);
  const router = customerPricing.createCustomerPricingRoutes({ pool, requireAdminSoft: (_req, _res, next) => next() });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/customer-pricing/rules`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.rules.length, 2);
    assert.ok(body.rules.find((r) => r.rule_id === 81).risk_codes.includes("PRICE_OUTLIER"));
    assert.ok(body.rules.find((r) => r.rule_id === 82).risk_codes.includes("AUTO_PRICING_UNSUPPORTED"));
  });
});

test("catalog linkage aggregation evaluates each rule once and avoids self-overlap", async () => {
  const sharedRule = rule({ rule_id: 91, job_type: "clean", ac_type: "wall", wash_variant: "normal", normal_price: 600, active_price: 550 });
  const links = [
    { price_rule_id: 91, item_id: 1, item_category: "service", job_category: "clean", ac_type: "wall" },
    { price_rule_id: 91, item_id: 2, item_category: "service", job_category: "clean", ac_type: "wall" },
  ];
  const result = await customerPricing.resolveCustomerPricingMulti(wallPayload(), dbWithRules([sharedRule], { links }));
  assert.equal(result.active_price, 550);
  assert.equal(result.lines[0].pricing_warning, null);

  const pool = adminRulesPool([sharedRule], links);
  const router = customerPricing.createCustomerPricingRoutes({ pool, requireAdminSoft: (_req, _res, next) => next() });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/customer-pricing/rules`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.rules.length, 1);
    assert.equal(body.rules[0].linked_catalog_item_count, 2);
    assert.deepEqual(body.rules[0].overlaps_with_rule_ids, []);
  });
});

test("catalog linkage risks reject product, mismatched, incomplete, and unverified links", async () => {
  const rules = [
    rule({ rule_id: 101 }),
    rule({ rule_id: 102 }),
    rule({ rule_id: 103 }),
  ];
  const links = [
    { price_rule_id: 101, item_id: 1, item_category: "product", job_category: null, ac_type: null },
    { price_rule_id: 102, item_id: 2, item_category: "service", job_category: "repair", ac_type: "wall" },
    { price_rule_id: 103, item_id: 3, item_category: "service", job_category: "clean", ac_type: null },
  ];
  const result = await customerPricing.resolveCustomerPricingMulti(concealedPayload(), dbWithRules(rules, { links }));
  assert.equal(result.active_price, 1200);
  assert.equal(result.source, "fallback_pricing_js_invalid_rule");

  const unverified = await customerPricing.resolveCustomerPricingMulti(concealedPayload(), dbWithRules([rule({ rule_id: 104 })], {
    links: [{ price_rule_id: 104, item_id: 4 }],
    fullLinkError: Object.assign(new Error("metadata unavailable"), { code: "42703" }),
  }));
  assert.equal(unverified.active_price, 1200);
  assert.equal(unverified.source, "fallback_pricing_js_invalid_rule");
  assert.ok(unverified.rejected_rule_codes.includes("CATALOG_LINKAGE_UNVERIFIED"));
});

test("catalog linkage failure modes fail closed only when needed", async () => {
  const safeDirect = rule({ rule_id: 111, normal_price: 1200, active_price: 1200 });
  const absentCatalog = await customerPricing.resolveCustomerPricingMulti(concealedPayload(), dbWithRules([safeDirect], {
    failCatalogLinks: Object.assign(new Error("catalog absent"), { code: "42P01" }),
  }));
  assert.equal(absentCatalog.active_price, 1200);
  assert.equal(absentCatalog.source, "customer_service_price_rules");

  const unexpected = await customerPricing.resolveCustomerPricingMulti(concealedPayload(), dbWithRules([safeDirect], {
    failCatalogLinks: Object.assign(new Error("connection dropped"), { code: "57P01" }),
  }));
  assert.equal(unexpected.active_price, 1200);
  assert.equal(unexpected.source, "fallback_pricing_js_invalid_rule");
  assert.ok(unexpected.rejected_rule_codes.includes("CATALOG_LINKAGE_UNVERIFIED"));

  const pool = adminRulesPool([safeDirect], [{ price_rule_id: 111, item_id: 1 }], { fullLinkError: Object.assign(new Error("missing metadata"), { code: "42703" }) });
  const router = customerPricing.createCustomerPricingRoutes({ pool, requireAdminSoft: (_req, _res, next) => next() });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/customer-pricing/rules`);
    const body = await res.json();
    assert.equal(body.rules.length, 1);
    assert.ok(body.rules[0].risk_codes.includes("CATALOG_LINKAGE_UNVERIFIED"));
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
  assert.match(promoJs, /AUTO_PRICING_UNSUPPORTED/);
  assert.match(promoJs, /Linked catalog/);
  assert.doesNotMatch(promoJs, /normal_price\) >= 10000/);
  assert.doesNotMatch(catalogJs, /normal >= 10000/);
  assert.match(catalogJs, /ราคาสินค้าเท่านั้น ไม่ใช้คำนวณค่าบริการ/);
  assert.match(catalogJs, /modalPricingRisk/);
  assert.match(promoHtml, /admin-promotions-v2\.js\?v=20260708_price_rule_safety_v2/);
  assert.match(catalogHtml, /admin-store-catalog\.js\?v=20260708_price_rule_safety_v2/);
});
