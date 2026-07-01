const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");

const { DEFAULT_CONFIG, createHomepageRoutes, validateConfig, activeNow, stripPublicConfig } = require("../server/routes/homepage");

const REPO_ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function createPool() {
  const state = {
    row: {
      config_key: "customer_homepage_v1",
      draft_config: DEFAULT_CONFIG,
      published_config: null,
      version: 1,
    updated_by: null,
    updated_at: null,
    published_at: null,
    activeJob: null,
    },
    queries: [],
    syncedArticles: [],
  };
  return {
    state,
    async query(sql, params = []) {
      state.queries.push({ sql, params });
      const normalized = String(sql).replace(/\s+/g, " ");
      if (normalized.includes("SELECT config_key") && normalized.includes("FROM public.homepage_cms_configs")) {
        return { rows: state.row ? [state.row] : [] };
      }
      if (normalized.includes("SELECT published_config")) {
        return { rows: state.row ? [state.row] : [] };
      }
      if (normalized.includes("INSERT INTO public.homepage_cms_configs") && normalized.includes("RETURNING")) {
        if (!state.row) state.row = { config_key: params[0], version: 1 };
        if (params[1]) state.row.draft_config = JSON.parse(params[1]);
        state.row.updated_by = params[2] || state.row.updated_by || null;
        state.row.version = Number(state.row.version || 1) + (normalized.includes("ON CONFLICT") ? 1 : 0);
        return { rows: [state.row] };
      }
      if (normalized.includes("UPDATE public.homepage_cms_configs") && normalized.includes("published_config")) {
        const config = JSON.parse(params[1]);
        state.row.draft_config = config;
        state.row.published_config = config;
        state.row.version += 1;
        state.row.updated_by = params[2];
        state.row.published_at = new Date().toISOString();
        return { rows: [state.row] };
      }
      if (normalized.includes("INSERT INTO public.homepage_cms_media")) return { rows: [] };
      if (normalized.includes("UPDATE public.homepage_cms_media")) return { rows: [] };
      if (normalized.includes("FROM public.jobs") && normalized.includes("customer_sub=$1")) {
        return { rows: state.activeJob && params[0] === "customer-1" ? [state.activeJob] : [] };
      }
      if (normalized.includes("INSERT INTO public.homepage_synced_articles")) {
        const [source_url, external_id, title, summary, image_url, link, published_at] = params;
        const idx = state.syncedArticles.findIndex((row) => row.source_url === source_url && row.external_id === external_id);
        const row = { source_url, external_id, title, summary, image_url, link, published_at, synced_at: new Date().toISOString() };
        if (idx >= 0) state.syncedArticles[idx] = row; else state.syncedArticles.push(row);
        return { rows: [] };
      }
      if (normalized.includes("FROM public.homepage_synced_articles")) {
        const [sourceUrl, limit] = params;
        const rows = state.syncedArticles
          .filter((row) => row.source_url === sourceUrl)
          .sort((a, b) => {
            const ad = a.published_at ? new Date(a.published_at).getTime() : -Infinity;
            const bd = b.published_at ? new Date(b.published_at).getTime() : -Infinity;
            if (bd !== ad) return bd - ad;
            return new Date(b.synced_at).getTime() - new Date(a.synced_at).getTime();
          })
          .slice(0, limit);
        return { rows };
      }
      throw new Error(`Unhandled query: ${normalized}`);
    },
  };
}

async function withMockFetch(handler, fn) {
  const original = global.fetch;
  global.fetch = (url, options) => {
    if (String(url).includes("127.0.0.1")) return original(url, options);
    return handler(url, options);
  };
  try {
    return await fn();
  } finally {
    global.fetch = original;
  }
}

function jsonFetchResponse(body, init = {}) {
  return {
    ok: init.status == null || (init.status >= 200 && init.status < 300),
    status: init.status || 200,
    headers: { get: (name) => (String(name).toLowerCase() === "content-type" ? (init.contentType || "application/json") : "") },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

async function withServer(pool, requireAdminSession, requireCustomerJwt) {
  const app = express();
  app.use(express.json({ limit: "200kb" }));
  app.use(createHomepageRoutes({
    pool,
    requireAdminSession,
    requireCustomerJwt,
    upload: { single: () => (_req, _res, next) => next() },
  }));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function jpegFile(buffer = Buffer.from([0xff, 0xd8, 0xff, 0xdb])) {
  return {
    buffer,
    size: buffer.length,
    mimetype: "image/jpeg",
    originalname: "hero.jpg",
  };
}

test("homepage validation rejects invalid section, URL, date, and oversized payload", () => {
  const invalid = validateConfig({
    sections: [
      { id: "bad", type: "not_allowed", enabled: true, sort_order: 1, title: "x", items: [{ title: "x", url: "javascript:alert(1)", active_from: "2026-12-31", active_to: "2026-01-01" }] },
    ],
  });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((error) => error.includes("type invalid")));
  assert.ok(invalid.errors.some((error) => error.includes("url invalid") || error.includes("http/https")));
  assert.ok(invalid.errors.some((error) => error.includes("range invalid")));

  const oversized = validateConfig({ sections: [{ id: "hero", type: "hero", title: "x".repeat(130 * 1024), items: [] }] });
  assert.equal(oversized.ok, false);
  assert.ok(oversized.errors.includes("payload too large"));
});

test("featured_services normalizes auto-mode defaults and validates manual selection", () => {
  const auto = validateConfig({
    sections: [{ id: "featured_services", type: "featured_services", title: "บริการแนะนำ", items: [] }],
  });
  assert.equal(auto.ok, true);
  const fs1 = auto.config.sections[0];
  assert.equal(fs1.featured_mode, "auto");
  assert.equal(fs1.featured_limit, 8);
  assert.equal(fs1.show_price, true);
  assert.equal(fs1.show_badge, true);
  assert.deepEqual(fs1.item_ids, []);

  const manualNoIds = validateConfig({
    sections: [{ id: "featured_services", type: "featured_services", title: "x", featured_mode: "manual", item_ids: [], items: [] }],
  });
  assert.equal(manualNoIds.ok, false);
  assert.ok(manualNoIds.errors.some((error) => error.includes("item_ids required")));

  const manual = validateConfig({
    sections: [{
      id: "featured_services", type: "featured_services", title: "x", featured_mode: "manual",
      featured_limit: 99, show_price: false, show_badge: false, item_ids: ["a", "b", "a"], items: [],
    }],
  });
  assert.equal(manual.ok, true);
  const fs2 = manual.config.sections[0];
  assert.equal(fs2.featured_mode, "manual");
  assert.equal(fs2.featured_limit, 12);
  assert.equal(fs2.show_price, false);
  assert.equal(fs2.show_badge, false);
  assert.deepEqual(fs2.item_ids, ["a", "b"]);
});

test("legacy published config without featured_services fields gets safe defaults without losing existing content", () => {
  const legacy = validateConfig({
    sections: [{
      id: "featured_services", type: "featured_services", enabled: true, sort_order: 5,
      title: "บริการเก่าของแอดมิน", body: "คำอธิบายเดิม", items: [],
    }],
  });
  assert.equal(legacy.ok, true);
  const section = legacy.config.sections[0];
  assert.equal(section.title, "บริการเก่าของแอดมิน");
  assert.equal(section.body, "คำอธิบายเดิม");
  assert.equal(section.featured_mode, "auto");
  assert.equal(section.featured_limit, 8);
  assert.equal(section.show_price, true);
  assert.equal(section.show_badge, true);
});

test("public homepage returns published config only and strips admin image metadata", async () => {
  const pool = createPool();
  pool.state.row.draft_config = { version: 1, sections: [{ id: "hero", type: "hero", enabled: true, sort_order: 1, title: "Draft title", items: [] }] };
  pool.state.row.published_config = { version: 1, sections: [{ id: "updates", type: "updates", enabled: true, sort_order: 1, title: "Published", items: [{ title: "Post", url: "https://example.com", image_public_id: "secret_public_id", updated_by: "admin" }] }] };
  const server = await withServer(pool, (_req, _res, next) => next());
  try {
    const res = await fetch(`${server.base}/public/homepage`);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.match(JSON.stringify(data), /Published/);
    assert.doesNotMatch(JSON.stringify(data), /Draft title|secret_public_id|updated_by/);
    assert.deepEqual(data.featured_services, []);
  } finally {
    await server.close();
  }
});

test("admin homepage endpoints require admin session and draft does not publish until publish call", async () => {
  const pool = createPool();
  const deny = await withServer(pool, (_req, res) => res.status(401).json({ error: "UNAUTHORIZED" }));
  try {
    const denied = await fetch(`${deny.base}/admin/homepage-cms/config`);
    assert.equal(denied.status, 401);
  } finally {
    await deny.close();
  }

  const allow = await withServer(pool, (req, _res, next) => { req.actor = { username: "admin", role: "admin" }; next(); });
  try {
    const draftConfig = { version: 1, sections: [{ id: "hero", type: "hero", enabled: true, sort_order: 1, title: "Draft only", items: [] }] };
    const saved = await fetch(`${allow.base}/admin/homepage-cms/draft`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: draftConfig }),
    });
    assert.equal(saved.status, 200);
    let publicRes = await fetch(`${allow.base}/public/homepage`);
    let publicData = await publicRes.json();
    assert.doesNotMatch(JSON.stringify(publicData), /Draft only/);

    const published = await fetch(`${allow.base}/admin/homepage-cms/publish`, { method: "POST" });
    assert.equal(published.status, 200);
    publicRes = await fetch(`${allow.base}/public/homepage`);
    publicData = await publicRes.json();
    assert.match(JSON.stringify(publicData), /Draft only/);
  } finally {
    await allow.close();
  }
});

test("schema-not-ready public homepage is fail-safe", async () => {
  const pool = {
    async query() {
      const error = new Error("missing table");
      error.code = "42P01";
      throw error;
    },
  };
  const server = await withServer(pool, (_req, _res, next) => next());
  try {
    const res = await fetch(`${server.base}/public/homepage`);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.schema_ready, false);
    assert.equal(data.fallback, true);
    assert.ok(Array.isArray(data.config.sections));
  } finally {
    await server.close();
  }
});

test("customer homepage has no admin control, bottom nav is fixed five-tab, and build ids match", () => {
  const index = read("customer-app/index.html");
  const ui = read("customer-app/modules/ui.js");
  const css = read("customer-app/assets/customer-app.css");
  const sw = read("customer-app/sw.js");
  const app = read("customer-app/assets/customer-app.js");
  const manifest = read("customer-app/manifest.webmanifest");
  const build = "20260701_page_headers_v1";

  assert.doesNotMatch(index + ui, /โหมดแอดมิน|openCms|localStorage\.getItem\('cwfHomeCmsDemo'/);
  assert.match(index, /data-route="store"[\s\S]*ร้านค้า/);
  assert.match(app, /store: App\.store\.render/);
  assert.match(app, /storeItem: App\.store\.renderDetail/);
  assert.match(index, /modules\/analytics\.js/);
  assert.match(index, /modules\/store\.js/);
  assert.match(css, /\.bottom-nav\s*\{[\s\S]*position: fixed/);
  assert.match(css, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /background:\s*rgba\(255,255,255,\.97\)/);
  assert.match(css, /box-shadow:\s*0 -10px 30px rgba\(7,27,56,\.10\)/);
  assert.doesNotMatch(css, /margin:\s*-28px 0 0/);
  const primaryNavBlock = css.slice(css.lastIndexOf(".nav-item-primary {"), css.lastIndexOf(".nav-item-primary {") + 220);
  assert.doesNotMatch(primaryNavBlock, /translateY\(-/);
  // Booking item's icon tile lives entirely on .nav-item-primary::before's own background —
  // never a ::after overlay, which is the explicitly forbidden pattern (it can drift from
  // or cover the "จอง" label since it isn't part of the same flex flow as the icon).
  assert.doesNotMatch(css, /\.nav-item-primary::after/);
  assert.match(css, /width:\s*36px;\s*height:\s*36px/);
  assert.match(css, /background:\s*var\(--ico-book\) center \/ 19px 19px no-repeat, linear-gradient\(145deg, #ffd43b, #ffbd17\)/);
  assert.match(index, new RegExp(`customer-app\\.css\\?v=${build}`));
  assert.match(sw, new RegExp(`BUILD_ID = "${build}"`));
  assert.match(app, new RegExp(`BUILD_ID = "${build}"`));
  assert.match(manifest, new RegExp(`index\\.html\\?v=${build}#home`));
  assert.match(read("customer-app/modules/api.js"), /loadHomepage\(\)/);
});

test("homepage image upload validates byte signature and uses Cloudinary homepage folder", async () => {
  const pool = createPool();
  let uploadedArgs = null;
  const app = express();
  app.use(express.json({ limit: "200kb" }));
  app.use(createHomepageRoutes({
    pool,
    requireAdminSession: (req, _res, next) => { req.actor = { username: "admin" }; next(); },
    upload: {
      single: () => (req, _res, next) => {
        req.file = req.headers["x-bad-image"] ? jpegFile(Buffer.from("not really an image")) : jpegFile();
        next();
      },
    },
    cloudinaryUploadBuffer: async (args) => {
      uploadedArgs = args;
      return { secure_url: "https://res.cloudinary.com/demo/home.jpg", public_id: "cwf/homepage/home" };
    },
  }));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const bad = await fetch(`${base}/admin/homepage-cms/images`, { method: "POST", headers: { "x-bad-image": "1" } });
    assert.equal(bad.status, 400);
    assert.equal(uploadedArgs, null);

    const good = await fetch(`${base}/admin/homepage-cms/images`, { method: "POST" });
    const data = await good.json();
    assert.equal(good.status, 200);
    assert.equal(data.image_url, "https://res.cloudinary.com/demo/home.jpg");
    assert.equal(uploadedArgs.folder, "cwf/homepage");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("forbidden booking pricing and tracking endpoints are not edited by homepage work", () => {
  const diffTargets = [
    "/public/book",
    "/public/availability_v2",
    "/public/pricing_preview",
    "/public/track",
  ];
  const homepageRoute = read("server/routes/homepage.js");
  for (const target of diffTargets) {
    assert.doesNotMatch(homepageRoute, new RegExp(target.replace(/\//g, "\\/")));
  }
});

test("backend defaults contain exactly the standard homepage section types in order", () => {
  assert.deepEqual(DEFAULT_CONFIG.sections.map((section) => section.type), [
    "hero",
    "quick",
    "promo_banner",
    "active_job",
    "announcements",
    "featured_services",
    "updates",
    "articles",
    "social",
    "trust",
  ]);
  assert.deepEqual(DEFAULT_CONFIG.sections.map((section) => section.sort_order), [10, 20, 25, 30, 40, 50, 60, 70, 75, 80]);
});

test("homepage validation preserves hero image metadata and rejects quick sections over four items", () => {
  const valid = validateConfig({
    sections: [{
      id: "hero",
      type: "hero",
      enabled: true,
      sort_order: 10,
      title: "Hero",
      image_url: "https://res.cloudinary.com/demo/hero.jpg",
      image_public_id: "cwf/homepage/hero",
      items: [{
        title: "Slide",
        image_url: "https://res.cloudinary.com/demo/slide.jpg",
        cta_primary: { label: "Book", route: "scheduled" },
        cta_secondary: { label: "Line", url: "https://example.com/line" },
      }],
    }],
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.config.sections[0].image_url, "https://res.cloudinary.com/demo/hero.jpg");
  assert.equal(valid.config.sections[0].image_public_id, "cwf/homepage/hero");
  assert.equal(valid.config.sections[0].items[0].cta_primary.route, "scheduled");
  assert.equal(valid.config.sections[0].items[0].cta_secondary.url, "https://example.com/line");

  const invalid = validateConfig({
    sections: [{
      id: "quick",
      type: "quick",
      enabled: true,
      sort_order: 20,
      title: "Quick",
      items: [{ title: "1" }, { title: "2" }, { title: "3" }, { title: "4" }, { title: "5" }],
    }],
  });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.includes("quick.items too many"));

  const tooManySlides = validateConfig({
    sections: [{
      id: "hero",
      type: "hero",
      enabled: true,
      sort_order: 10,
      title: "Hero",
      items: [1, 2, 3, 4, 5, 6].map((i) => ({ title: `Slide ${i}` })),
    }],
  });
  assert.equal(tooManySlides.ok, false);
  assert.ok(tooManySlides.errors.includes("hero.items too many"));

  const ctaConflict = validateConfig({
    sections: [{
      id: "hero",
      type: "hero",
      enabled: true,
      sort_order: 10,
      title: "Hero",
      items: [{ title: "Slide", cta_primary: { label: "Go", route: "store", url: "https://example.com" } }],
    }],
  });
  assert.equal(ctaConflict.ok, false);
  assert.ok(ctaConflict.errors.some((error) => error.includes("cta_primary.target conflict")));
});

test("public homepage strips section and item image_public_id while keeping image_url", async () => {
  const pool = createPool();
  pool.state.row.published_config = {
    version: 1,
    sections: [{
      id: "hero",
      type: "hero",
      enabled: true,
      sort_order: 10,
      title: "Published",
      image_url: "https://res.cloudinary.com/demo/hero.jpg",
      image_public_id: "cwf/homepage/hero",
      items: [{ title: "Post", url: "https://example.com", image_public_id: "secret_item_id" }],
    }],
  };
  const server = await withServer(pool, (_req, _res, next) => next());
  try {
    const res = await fetch(`${server.base}/public/homepage`);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.config.sections[0].image_url, "https://res.cloudinary.com/demo/hero.jpg");
    assert.doesNotMatch(JSON.stringify(data), /image_public_id|cwf\/homepage\/hero|secret_item_id/);
  } finally {
    await server.close();
  }
});

test("public active job endpoint is session scoped and returns safe fields only", async () => {
  const pool = createPool();
  pool.state.activeJob = {
    booking_code: "CWF-102",
    job_type: "ล้างแอร์",
    job_status: "นัดหมายแล้ว",
    appointment_datetime: "2026-06-30T03:00:00.000Z",
    job_id: 99,
    customer_name: "Private",
    customer_phone: "0999999999",
  };
  const customerSession = (req, res, next) => {
    if (String(req.headers.cookie || "").includes("cwf_token=customer-1")) {
      req.customer = { sub: "customer-1" };
      return next();
    }
    return res.status(401).json({ error: "NOT_LOGGED_IN" });
  };
  const noSession = await withServer(pool, (_req, _res, next) => next(), customerSession);
  try {
    const res = await fetch(`${noSession.base}/public/homepage/active-job`);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.active_job, null);
  } finally {
    await noSession.close();
  }

  const session = await withServer(pool, (_req, _res, next) => next(), customerSession);
  try {
    const noJob = await fetch(`${session.base}/public/homepage/active-job`, { headers: { cookie: "cwf_token=customer-2" } });
    assert.equal((await noJob.json()).active_job, null);

    const res = await fetch(`${session.base}/public/homepage/active-job`, { headers: { cookie: "cwf_token=customer-1" } });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.active_job.booking_code, "CWF-102");
    assert.equal(data.active_job.job_type, "ล้างแอร์");
    assert.equal(data.active_job.job_status, "นัดหมายแล้ว");
    assert.deepEqual(Object.keys(data.active_job).sort(), ["appointment_datetime", "booking_code", "job_status", "job_type"]);
    assert.doesNotMatch(JSON.stringify(data), /job_id|customer_name|customer_phone|0999999999|Private/);
    assert.equal(pool.state.queries.some((query) => query.params[0] === "customer-1"), true);
  } finally {
    await session.close();
  }
});

test("production homepage mount passes the customer JWT middleware and active job does not accept client identity", () => {
  const index = read("index.js");
  const homepage = read("server/routes/homepage.js");
  assert.match(index, /createHomepageRoutes\(\{[^}]*requireCustomerJwt[^}]*\}\)/s);
  assert.match(homepage, /router\.get\("\/public\/homepage\/active-job", optionalCustomerSession/);
  assert.match(homepage, /loadActiveJobForCustomer\(pool, req\.customer\?\.sub \|\| ""\)/);
  assert.doesNotMatch(homepage, /req\.(query|body)\?\.(customer_sub|customerSub|customer_id|booking_code|phone)/);
});

test("admin save and publish preserve hero image fields", async () => {
  const pool = createPool();
  const allow = await withServer(pool, (req, _res, next) => { req.actor = { username: "admin", role: "admin" }; next(); });
  try {
    const config = {
      version: 1,
      sections: [{
        id: "hero",
        type: "hero",
        enabled: true,
        sort_order: 10,
        title: "Hero image",
        image_url: "https://res.cloudinary.com/demo/hero.jpg",
        image_public_id: "cwf/homepage/hero",
        items: [],
      }],
    };
    const saved = await fetch(`${allow.base}/admin/homepage-cms/draft`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    assert.equal(saved.status, 200);
    assert.equal(pool.state.row.draft_config.sections[0].image_url, "https://res.cloudinary.com/demo/hero.jpg");
    const published = await fetch(`${allow.base}/admin/homepage-cms/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    assert.equal(published.status, 200);
    assert.equal(pool.state.row.published_config.sections[0].image_url, "https://res.cloudinary.com/demo/hero.jpg");
  } finally {
    await allow.close();
  }
});

test("backend admin customer defaults and homepage migration stay in allowed scope", () => {
  const admin = read("admin-homepage-cms.js");
  const customer = read("customer-app/modules/ui.js");
  const migration = read("migrations/20260629_homepage_cms.sql");
  for (const type of ["hero", "quick", "promo_banner", "active_job", "announcements", "featured_services", "updates", "articles", "social", "trust"]) {
    assert.match(admin, new RegExp(`type:\\s*"${type}"`));
    assert.match(customer, new RegExp(`type:\\s*"${type}"`));
  }
  assert.doesNotMatch(migration, /ALTER TABLE\s+public\.catalog_items/i);
  assert.doesNotMatch(migration, /idx_catalog_items_customer_featured/i);
  assert.match(customer, /items:\s*\[\{ title: "ติดต่อทีม CWF", action: "contact"/);
  assert.match(admin, /items:\s*\[\{ title: "ติดต่อทีม CWF", action: "contact"/);
  assert.doesNotMatch(customer, /เชื่อมต่อไปยัง Facebook|อ่านต่อบน cwf-air\.com/);
  assert.doesNotMatch(admin, /เชื่อมต่อไปยัง Facebook|อ่านต่อบน cwf-air\.com/);
});

test("bottom navigation border and padding match the fixed-nav reference", () => {
  const css = read("customer-app/assets/customer-app.css");
  assert.match(css, /border-top:\s*1px solid var\(--line\)/);
  assert.match(css, /padding:\s*7px 6px calc\(7px \+ var\(--safe-b\)\)/);
  // Booking tile is .nav-item-primary::before's own background, in the same flex flow as
  // the label — not a ::after overlay, which could float free of the icon/label baseline.
  assert.doesNotMatch(css, /\.nav-item-primary::after/);
  assert.match(css, /\.nav-item-primary::before\s*\{[\s\S]*width:\s*36px[\s\S]*height:\s*36px/);
});

test("homepage service carousel constrains card and image geometry on mobile", () => {
  const css = read("customer-app/assets/customer-app.css");
  const serviceBlock = css.slice(css.lastIndexOf(".homepage-service-card {"), css.lastIndexOf(".homepage-service-card {") + 320);
  assert.match(serviceBlock, /flex:\s*0 0 calc\(\(100% - 10px\) \/ 2\)/);
  assert.match(serviceBlock, /max-width:\s*calc\(\(100% - 10px\) \/ 2\)/);
  const imageBlock = css.slice(css.lastIndexOf(".homepage-card-image {"), css.lastIndexOf(".homepage-card-image {") + 180);
  assert.match(imageBlock, /overflow:\s*hidden/);
  const imageImgBlock = css.slice(css.lastIndexOf(".homepage-card-image img"), css.lastIndexOf(".homepage-card-image img") + 180);
  assert.match(imageImgBlock, /display:\s*block/);
  assert.match(imageImgBlock, /width:\s*100%/);
  assert.match(imageImgBlock, /height:\s*100%/);
  assert.match(imageImgBlock, /object-fit:\s*cover/);
});

test("customer homepage renderer supports hero slider, active job placeholder, and real empty states", () => {
  const ui = read("customer-app/modules/ui.js");
  assert.match(ui, /const slides = Array\.isArray\(section\.items\) && section\.items\.length \? section\.items : \[section\]/);
  assert.match(ui, /homepage-hero-slider/);
  assert.match(ui, /homepage-hero-dots/);
  assert.match(ui, /data-home-hero-dot/);
  assert.match(ui, /addEventListener\("scroll", onScroll, \{ passive: true \}\)/);
  assert.match(ui, /requestAnimationFrame/);
  assert.match(ui, /slider\.scrollTo/);
  assert.match(ui, /aria-selected/);
  assert.match(ui, /slide\.cta_primary \|\| section\.cta_primary/);
  assert.match(ui, /function renderHomepageActiveJob\(section\)/);
  assert.match(ui, /data-home-active-job/);
  assert.match(ui, /loadHomeActiveJobData/);
  assert.match(ui, /if \(!items\.length\) return "";/);
  assert.doesNotMatch(ui, /ยังไม่มีรายการเผยแพร่/);
});

test("homepage target validation stores exactly one quick or announcement target", () => {
  const valid = validateConfig({
    version: 1,
    sections: [
      {
        id: "quick",
        type: "quick",
        enabled: true,
        sort_order: 10,
        items: [
          { title: "External quick", url: "https://example.com/quick", icon: "chat" },
          { title: "Contact quick", action: "contact", icon: "wrench" },
        ],
      },
      {
        id: "announcements",
        type: "announcements",
        enabled: true,
        sort_order: 20,
        title: "Announcements",
        items: [{ title: "External announcement", url: "https://example.com/news" }],
      },
    ],
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.config.sections[0].items[0].url, "https://example.com/quick");
  assert.equal(valid.config.sections[0].items[1].action, "contact");
  assert.equal(valid.config.sections[0].items[1].route, undefined);
  assert.equal(valid.config.sections[0].items[1].url, undefined);
  assert.equal(valid.config.sections[1].items[0].url, "https://example.com/news");

  const conflict = validateConfig({
    version: 1,
    sections: [{
      id: "quick",
      type: "quick",
      enabled: true,
      sort_order: 10,
      items: [{ title: "Bad target", route: "store", url: "https://example.com" }],
    }],
  });
  assert.equal(conflict.ok, false);
  assert.ok(conflict.errors.some((error) => error.includes("target conflict")));
});

test("homepage image URLs allow http/https and reject unsafe protocols", () => {
  const valid = validateConfig({
    version: 1,
    sections: [{
      id: "hero",
      type: "hero",
      enabled: true,
      sort_order: 10,
      title: "Hero",
      image_url: "https://res.cloudinary.com/demo/image/upload/cwf/homepage/hero.webp",
      items: [{ title: "Card", image_url: "http://res.cloudinary.com/demo/card.png", route: "store" }],
    }],
  });
  assert.equal(valid.ok, true);

  for (const image_url of ["javascript:alert(1)", "data:image/png;base64,AAAA", "file:///tmp/image.png", "not a url"]) {
    const invalid = validateConfig({
      version: 1,
      sections: [{
        id: "hero",
        type: "hero",
        enabled: true,
        sort_order: 10,
        title: "Hero",
        image_url,
        items: [],
      }],
    });
    assert.equal(invalid.ok, false, image_url);
  }
});

test("admin target editor renders mode-specific fields and no stale target field", () => {
  const admin = read("admin-homepage-cms.js");
  assert.match(admin, /data-item-target/);
  assert.match(admin, /data-prop="url"/);
  assert.match(admin, /data-prop="route"/);
  assert.match(admin, /delete item\.route;\s*delete item\.url;\s*delete item\.action;/);
  assert.match(admin, /if \(targetMode === "contact"\) return "";/);
  const renderPreviewSource = admin.slice(
    admin.indexOf("function renderPreview()"),
    admin.indexOf("function render()"),
  );
  assert.equal((renderPreviewSource.match(/\$\("preview"\)\.innerHTML/g) || []).length, 1);
});

test("admin hero slide editor supports add edit remove reorder upload and CTA targets", () => {
  const admin = read("admin-homepage-cms.js");
  assert.match(admin, /id="addHeroSlide"/);
  assert.match(admin, /function heroSlideEditor/);
  assert.match(admin, /data-move-item/);
  assert.match(admin, /data-upload="\$\{index\}"/);
  assert.match(admin, /data-hero-cta/);
  assert.match(admin, /data-hero-cta-target/);
  assert.match(admin, /if \(current\(\)\.items\.length >= 5\)/);
  assert.match(admin, /delete item\[ctaName\]\.route;\s*delete item\[ctaName\]\.url;\s*delete item\[ctaName\]\.action;/);
  const previewSource = admin.slice(admin.indexOf("function renderPreview()"), admin.indexOf("function render()"));
  assert.match(previewSource, /const slides = enabledSlides\.length \? enabledSlides : \[section\]/);
});

test("admin catalog loader accepts the real direct-array /admin/catalog/items response shape", () => {
  const admin = read("admin-homepage-cms.js");
  assert.match(admin, /catalogItems = Array\.isArray\(data\) \? data : Array\.isArray\(data\?\.items\) \? data\.items : \[\];/);
});

test("per-item enabled toggle is normalized, persisted, and stripped from public config when disabled", () => {
  const disabled = validateConfig({
    sections: [{
      id: "trust", type: "trust", enabled: true, sort_order: 80, title: "Trust",
      items: [{ title: "Visible", enabled: true }, { title: "Hidden", enabled: false }],
    }],
  });
  assert.equal(disabled.ok, true);
  assert.equal(disabled.config.sections[0].items[0].enabled, true);
  assert.equal(disabled.config.sections[0].items[1].enabled, false);

  const legacyNoFlag = validateConfig({
    sections: [{ id: "trust", type: "trust", enabled: true, sort_order: 80, title: "Trust", items: [{ title: "Legacy item" }] }],
  });
  assert.equal(legacyNoFlag.config.sections[0].items[0].enabled, true);
});

test("public homepage hides disabled items but keeps enabled ones", async () => {
  const pool = createPool();
  pool.state.row.published_config = {
    version: 1,
    sections: [{
      id: "trust", type: "trust", enabled: true, sort_order: 80, title: "Trust",
      items: [{ title: "Visible item", enabled: true }, { title: "Disabled item", enabled: false }],
    }],
  };
  const server = await withServer(pool, (_req, _res, next) => next());
  try {
    const res = await fetch(`${server.base}/public/homepage`);
    const data = await res.json();
    const items = data.config.sections[0].items;
    assert.deepEqual(items.map((item) => item.title), ["Visible item"]);
  } finally {
    await server.close();
  }
});

test("admin per-item enable/disable toggle is wired to editor, change handler, and live preview filtering", () => {
  const admin = read("admin-homepage-cms.js");
  assert.match(admin, /data-item-enabled="\$\{index\}"/);
  assert.match(admin, /target\.matches\("\[data-item-enabled\]"\)/);
  assert.match(admin, /item\.enabled = target\.checked;/);
  const previewSource = admin.slice(admin.indexOf("function renderPreview()"), admin.indexOf("function render()"));
  assert.match(previewSource, /filter\(\(slide\) => slide\.enabled !== false\)/);
  assert.match(previewSource, /filter\(\(i\) => i\.enabled !== false\)/);
});

test("promo_banner validation requires image_url, normalizes alt_text and aspect_mode, and allows a blank title", () => {
  const missingImage = validateConfig({
    sections: [{ id: "promo_banner", type: "promo_banner", enabled: true, sort_order: 25, items: [{ alt_text: "No image" }] }],
  });
  assert.equal(missingImage.ok, false);
  assert.ok(missingImage.errors.some((error) => error.includes("image_url required")));

  const valid = validateConfig({
    sections: [{
      id: "promo_banner",
      type: "promo_banner",
      enabled: true,
      sort_order: 25,
      items: [{
        image_url: "https://res.cloudinary.com/demo/image/upload/cwf/homepage/daikin.png",
        image_public_id: "cwf/homepage/daikin",
        alt_text: "CWF x DAIKIN training banner",
      }],
    }],
  });
  assert.equal(valid.ok, true);
  const item = valid.config.sections[0].items[0];
  assert.equal(item.title, "");
  assert.equal(item.alt_text, "CWF x DAIKIN training banner");
  assert.equal(item.aspect_mode, "contain");
  assert.equal(item.image_url, "https://res.cloudinary.com/demo/image/upload/cwf/homepage/daikin.png");

  const cover = validateConfig({
    sections: [{
      id: "promo_banner",
      type: "promo_banner",
      enabled: true,
      sort_order: 25,
      items: [{ image_url: "https://res.cloudinary.com/demo/banner.png", aspect_mode: "cover" }],
    }],
  });
  assert.equal(cover.ok, true);
  assert.equal(cover.config.sections[0].items[0].aspect_mode, "cover");

  const badAspect = validateConfig({
    sections: [{
      id: "promo_banner",
      type: "promo_banner",
      enabled: true,
      sort_order: 25,
      items: [{ image_url: "https://res.cloudinary.com/demo/banner.png", aspect_mode: "stretch" }],
    }],
  });
  assert.equal(badAspect.ok, true);
  assert.equal(badAspect.config.sections[0].items[0].aspect_mode, "contain");

  const tooMany = validateConfig({
    sections: [{
      id: "promo_banner",
      type: "promo_banner",
      enabled: true,
      sort_order: 25,
      items: Array.from({ length: 9 }, (_, i) => ({ image_url: `https://res.cloudinary.com/demo/b${i}.png` })),
    }],
  });
  assert.equal(tooMany.ok, false);
  assert.ok(tooMany.errors.includes("promo_banner.items too many"));
});

test("social validation defaults platform, requires a matching-host url, and enforces an 8-item cap", () => {
  const missingUrl = validateConfig({
    sections: [{ id: "social", type: "social", enabled: true, sort_order: 75, items: [{ title: "No link" }] }],
  });
  assert.equal(missingUrl.ok, false);
  assert.ok(missingUrl.errors.some((error) => error.includes("social.items.0.url required")));

  const validYoutube = validateConfig({
    sections: [{
      id: "social",
      type: "social",
      enabled: true,
      sort_order: 75,
      items: [{ title: "New install demo", url: "https://youtu.be/dQw4w9WgXcQ" }],
    }],
  });
  assert.equal(validYoutube.ok, true);
  const ytItem = validYoutube.config.sections[0].items[0];
  assert.equal(ytItem.platform, "youtube");
  assert.equal(ytItem.url, "https://youtu.be/dQw4w9WgXcQ");

  const validFacebook = validateConfig({
    sections: [{
      id: "social",
      type: "social",
      enabled: true,
      sort_order: 75,
      items: [{ title: "Fan page post", url: "https://www.facebook.com/share/14daV9SNRXg/", platform: "facebook" }],
    }],
  });
  assert.equal(validFacebook.ok, true);
  assert.equal(validFacebook.config.sections[0].items[0].platform, "facebook");

  const mismatchedHost = validateConfig({
    sections: [{
      id: "social",
      type: "social",
      enabled: true,
      sort_order: 75,
      items: [{ title: "Wrong host", url: "https://www.facebook.com/share/14daV9SNRXg/", platform: "youtube" }],
    }],
  });
  assert.equal(mismatchedHost.ok, false);
  assert.ok(mismatchedHost.errors.includes("social.items.0.url must be a youtube link"));

  const badPlatform = validateConfig({
    sections: [{
      id: "social",
      type: "social",
      enabled: true,
      sort_order: 75,
      items: [{ title: "Unknown platform falls back", url: "https://youtu.be/dQw4w9WgXcQ", platform: "tiktok" }],
    }],
  });
  assert.equal(badPlatform.ok, true);
  assert.equal(badPlatform.config.sections[0].items[0].platform, "youtube");

  const tooMany = validateConfig({
    sections: [{
      id: "social",
      type: "social",
      enabled: true,
      sort_order: 75,
      items: Array.from({ length: 9 }, (_, i) => ({ title: `Video ${i}`, url: `https://youtu.be/abc${i}defghij` })),
    }],
  });
  assert.equal(tooMany.ok, false);
  assert.ok(tooMany.errors.includes("social.items too many"));
});

test("per-page headers (store/booking/tracking) normalize as hero-like banners and are stripped/filtered for the public config", () => {
  const result = validateConfig({
    sections: [{ id: "hero", type: "hero", enabled: true, sort_order: 10, title: "Hero", items: [] }],
    page_headers: {
      store: {
        enabled: true, kicker: "ร้านค้า", title: "โปรร้านค้า", body: "ลดราคา", focal_position: "bottom",
        items: [
          { title: "สไลด์ 1", image_url: "https://res.cloudinary.com/demo/a.jpg", image_public_id: "cwf/a", route: "store", enabled: true },
          { title: "สไลด์ 2", image_url: "https://res.cloudinary.com/demo/b.jpg", enabled: false },
        ],
      },
      tracking: { enabled: false, title: "ปิดอยู่", items: [{ title: "x", image_url: "https://res.cloudinary.com/demo/t.jpg" }] },
      bogus: { enabled: true, items: [] },
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const ph = result.config.page_headers;
  // Only the three known page keys are kept; unknown keys are dropped.
  assert.deepEqual(Object.keys(ph).sort(), ["store", "tracking"].sort());
  assert.equal(ph.store.focal_position, "bottom");
  assert.equal(ph.store.items.length, 2);
  assert.equal(ph.store.items[0].image_public_id, "cwf/a");

  // Public config: admin image_public_id stripped, disabled slide and disabled
  // header dropped, so tracking (enabled:false) disappears entirely.
  const pub = stripPublicConfig(result.config);
  assert.ok(pub.page_headers, "public config must carry page_headers");
  assert.deepEqual(Object.keys(pub.page_headers), ["store"]);
  assert.equal(pub.page_headers.store.items.length, 1);
  assert.equal(pub.page_headers.store.items[0].image_public_id, undefined);
  assert.equal(pub.page_headers.store.items[0].route, "store");
});

test("updates items are savable with only an image/caption (no URL required); articles still require a URL", () => {
  // Activity-photo post: image + caption, no link. Must validate OK so admins
  // can publish work photos without inventing a URL.
  const updatesPhotoOnly = validateConfig({
    sections: [{
      id: "updates",
      type: "updates",
      enabled: true,
      sort_order: 60,
      title: "ภาพกิจกรรมและโพสต์",
      items: [{ title: "ล้างแอร์คอนโด 3 เครื่อง", body: "งานเสร็จไว", image_url: "https://res.cloudinary.com/demo/work.jpg" }],
    }],
  });
  assert.equal(updatesPhotoOnly.ok, true, JSON.stringify(updatesPhotoOnly.errors));
  assert.equal(updatesPhotoOnly.config.sections[0].items[0].url, undefined);

  // Articles inherently link out — an item without a URL must still be rejected.
  const articleNoUrl = validateConfig({
    sections: [{
      id: "articles",
      type: "articles",
      enabled: true,
      sort_order: 65,
      title: "บทความแนะนำ",
      items: [{ title: "วิธีดูแลแอร์" }],
    }],
  });
  assert.equal(articleNoUrl.ok, false);
  assert.ok(articleNoUrl.errors.some((error) => error.includes("articles.items.0.url required")));
});

test("hero focal_position normalizes per-slide and per-section, defaulting to center for invalid values", () => {
  const valid = validateConfig({
    sections: [{
      id: "hero",
      type: "hero",
      enabled: true,
      sort_order: 10,
      title: "Hero",
      focal_position: "top",
      items: [{ title: "Slide", focal_position: "bottom" }],
    }],
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.config.sections[0].focal_position, "top");
  assert.equal(valid.config.sections[0].items[0].focal_position, "bottom");

  const invalid = validateConfig({
    sections: [{
      id: "hero",
      type: "hero",
      enabled: true,
      sort_order: 10,
      title: "Hero",
      focal_position: "diagonal",
      items: [{ title: "Slide", focal_position: "sideways" }],
    }],
  });
  assert.equal(invalid.ok, true);
  assert.equal(invalid.config.sections[0].focal_position, "center");
  assert.equal(invalid.config.sections[0].items[0].focal_position, "center");
});

test("public homepage strips promo_banner image_public_id while keeping image_url and alt_text", async () => {
  const pool = createPool();
  pool.state.row.published_config = {
    version: 1,
    sections: [{
      id: "promo_banner",
      type: "promo_banner",
      enabled: true,
      sort_order: 25,
      items: [{
        image_url: "https://res.cloudinary.com/demo/daikin.png",
        image_public_id: "cwf/homepage/daikin_secret",
        alt_text: "CWF x DAIKIN",
        aspect_mode: "contain",
        enabled: true,
      }],
    }],
  };
  const server = await withServer(pool, (_req, _res, next) => next());
  try {
    const res = await fetch(`${server.base}/public/homepage`);
    const data = await res.json();
    const banner = data.config.sections.find((section) => section.type === "promo_banner");
    assert.ok(banner);
    assert.equal(banner.items[0].image_url, "https://res.cloudinary.com/demo/daikin.png");
    assert.equal(banner.items[0].alt_text, "CWF x DAIKIN");
    assert.doesNotMatch(JSON.stringify(data), /daikin_secret/);
  } finally {
    await server.close();
  }
});

test("promo_banner draft save, reload, and publish round-trip preserves banner order and fields", async () => {
  const pool = createPool();
  const allow = await withServer(pool, (req, _res, next) => { req.actor = { username: "admin", role: "admin" }; next(); });
  try {
    const config = {
      version: 1,
      sections: [{
        id: "promo_banner",
        type: "promo_banner",
        enabled: true,
        sort_order: 25,
        items: [
          { image_url: "https://res.cloudinary.com/demo/second.png", alt_text: "Second", sort_order: 2 },
          { image_url: "https://res.cloudinary.com/demo/first.png", alt_text: "First", sort_order: 1 },
        ],
      }],
    };
    const saved = await fetch(`${allow.base}/admin/homepage-cms/draft`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    assert.equal(saved.status, 200);
    const draftBanner = pool.state.row.draft_config.sections.find((section) => section.type === "promo_banner");
    assert.equal(draftBanner.items[0].alt_text, "Second");
    assert.equal(draftBanner.items[1].alt_text, "First");

    const publicBefore = await fetch(`${allow.base}/public/homepage`);
    const publicBeforeData = await publicBefore.json();
    assert.doesNotMatch(JSON.stringify(publicBeforeData), /First|Second/);

    const published = await fetch(`${allow.base}/admin/homepage-cms/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    assert.equal(published.status, 200);

    const publicAfter = await fetch(`${allow.base}/public/homepage`);
    const publicAfterData = await publicAfter.json();
    const publishedBanner = publicAfterData.config.sections.find((section) => section.type === "promo_banner");
    assert.equal(publishedBanner.items[0].alt_text, "First");
    assert.equal(publishedBanner.items[1].alt_text, "Second");
  } finally {
    await allow.close();
  }
});

test("promo_banner items respect active_from/active_to date gating on the public endpoint", async () => {
  const pool = createPool();
  pool.state.row.published_config = {
    version: 1,
    sections: [{
      id: "promo_banner",
      type: "promo_banner",
      enabled: true,
      sort_order: 25,
      items: [
        { image_url: "https://res.cloudinary.com/demo/past.png", alt_text: "Expired", active_to: "2000-01-01" },
        { image_url: "https://res.cloudinary.com/demo/future.png", alt_text: "Not yet", active_from: "2099-01-01" },
        { image_url: "https://res.cloudinary.com/demo/now.png", alt_text: "Live now" },
      ],
    }],
  };
  const server = await withServer(pool, (_req, _res, next) => next());
  try {
    const res = await fetch(`${server.base}/public/homepage`);
    const data = await res.json();
    const banner = data.config.sections.find((section) => section.type === "promo_banner");
    assert.deepEqual(banner.items.map((item) => item.alt_text), ["Live now"]);
  } finally {
    await server.close();
  }
});

test("customer ui.js renders promo_banner section with image-only markup, hides when empty, and supports slider for multiple banners", () => {
  const ui = read("customer-app/modules/ui.js");
  assert.match(ui, /function renderHomepagePromoBanner\(section\)/);
  assert.match(ui, /homepage-promo-banner/);
  assert.match(ui, /if \(!banners\.length\) return "";/);
  assert.match(ui, /homepage-promo-banner-dots/);
  assert.match(ui, /data-home-promo-dot/);
  assert.match(ui, /is-contain|is-cover/);
});

test("admin draft GET hydrates a legacy row missing promo_banner without touching existing content or published config", async () => {
  const pool = createPool();
  const legacySections = [
    { id: "hero", type: "hero", enabled: true, sort_order: 10, title: "Legacy hero title", body: "Legacy body", focal_position: "center", items: [] },
    { id: "quick", type: "quick", enabled: true, sort_order: 20, title: "เมนูด่วน", body: "", items: [{ title: "จองล้างแอร์", route: "scheduled", icon: "sparkle" }] },
    { id: "trust", type: "trust", enabled: false, sort_order: 80, title: "มาตรฐานที่ลูกค้าวางใจ", body: "", items: [{ title: "แจ้งราคาก่อนทำ", body: "ระบบคำนวณจากข้อมูลบริการจริง" }] },
  ];
  pool.state.row.draft_config = { version: 1, sections: legacySections };
  pool.state.row.published_config = { version: 1, sections: legacySections };
  const server = await withServer(pool, (_req, _res, next) => next());
  try {
    const res = await fetch(`${server.base}/admin/homepage-cms/config`);
    const data = await res.json();
    assert.equal(res.status, 200);

    const banner = data.draft_config.sections.find((section) => section.type === "promo_banner");
    assert.ok(banner, "hydrated draft should include an empty promo_banner section");
    assert.deepEqual(banner.items, []);

    const hero = data.draft_config.sections.find((section) => section.type === "hero");
    assert.equal(hero.title, "Legacy hero title");
    assert.equal(hero.body, "Legacy body");
    const quick = data.draft_config.sections.find((section) => section.type === "quick");
    assert.equal(quick.items.length, 1);
    const trust = data.draft_config.sections.find((section) => section.type === "trust");
    assert.equal(trust.enabled, false);
    assert.equal(trust.items[0].title, "แจ้งราคาก่อนทำ");

    assert.deepEqual(data.published_config.sections.map((section) => section.type), ["hero", "quick", "trust"]);

    const pubRes = await fetch(`${server.base}/public/homepage`);
    const pubData = await pubRes.json();
    assert.ok(!pubData.config.sections.some((section) => section.type === "promo_banner"), "publishing the hydrated section must not happen implicitly");
  } finally {
    await server.close();
  }
});

test("hero renders a compact no-image variant instead of a tall blue panel when no slide has an image", () => {
  const ui = read("customer-app/modules/ui.js");
  assert.match(ui, /const hasImage = slides\.some\(\(slide\) => slide\.image_url\);/);
  assert.match(ui, /class="homepage-hero\$\{hasImage \? "" : " is-no-image"\}"/);

  const css = read("customer-app/assets/customer-app.css");
  const noImageBlock = css.match(/\.homepage-hero\.is-no-image\s*\{[^}]*\}/)[0];
  assert.match(noImageBlock, /height:\s*auto/);
  assert.doesNotMatch(noImageBlock, /linear-gradient/);
});

test("activeNow: date-only active_from is not yet active before the start of that day in Asia/Bangkok", () => {
  // active_from "2026-06-30" should not begin until 2026-06-30T00:00:00+07:00,
  // i.e. 2026-06-29T17:00:00.000Z. One second before that boundary must be inactive.
  const justBeforeStart = new Date("2026-06-29T16:59:59.000Z");
  assert.equal(activeNow({ active_from: "2026-06-30" }, justBeforeStart), false);

  const exactStart = new Date("2026-06-29T17:00:00.000Z");
  assert.equal(activeNow({ active_from: "2026-06-30" }, exactStart), true);
});

test("activeNow: date-only active_to stays active through the entire end date in Asia/Bangkok", () => {
  // active_to "2026-06-30" should remain active through 2026-06-30T23:59:59.999+07:00,
  // i.e. 2026-06-30T16:59:59.999Z. Mid-afternoon Bangkok time on the end date must
  // still be active even though it is past 00:00 UTC of that calendar date — this is
  // exactly the case the old UTC-midnight comparison got wrong.
  const middayBangkokOnEndDate = new Date("2026-06-30T08:00:00.000Z"); // 15:00 Bangkok
  assert.equal(activeNow({ active_to: "2026-06-30" }, middayBangkokOnEndDate), true);

  const lastInstantOfEndDate = new Date("2026-06-30T16:59:59.999Z");
  assert.equal(activeNow({ active_to: "2026-06-30" }, lastInstantOfEndDate), true);
});

test("activeNow: date-only active_to expires immediately after the end of that day in Asia/Bangkok", () => {
  const oneSecondAfterEndDate = new Date("2026-06-30T17:00:00.000Z"); // 2026-07-01T00:00:00+07:00
  assert.equal(activeNow({ active_to: "2026-06-30" }, oneSecondAfterEndDate), false);
});

test("activeNow: explicit date-time active_from/active_to keep their own offset semantics instead of Bangkok day boundaries", () => {
  // An explicit UTC timestamp must NOT be reinterpreted as a Bangkok day boundary.
  const item = { active_from: "2026-06-30T10:00:00Z", active_to: "2026-06-30T12:00:00Z" };
  assert.equal(activeNow(item, new Date("2026-06-30T09:59:59Z")), false);
  assert.equal(activeNow(item, new Date("2026-06-30T11:00:00Z")), true);
  assert.equal(activeNow(item, new Date("2026-06-30T12:00:01Z")), false);
});

test("activeNow: an invalid date boundary fails closed (excludes the item) rather than showing it indefinitely", () => {
  assert.equal(activeNow({ active_from: "not-a-date" }, new Date("2026-06-30T08:00:00.000Z")), false);
  assert.equal(activeNow({ active_to: "not-a-date" }, new Date("2026-06-30T08:00:00.000Z")), false);
});

test("articles section validates auto_sync, source_url, and seed_urls and requires source_url when auto_sync is on", () => {
  const valid = validateConfig({
    sections: [{
      id: "articles", type: "articles", title: "บทความแนะนำ",
      auto_sync: true, source_url: "https://www.cwf-air.com",
      seed_urls: ["https://www.cwf-air.com/air-conditioner-not-cooling/", "https://www.cwf-air.com/air-conditioner-water-leaking/"],
      items: [],
    }],
  });
  assert.equal(valid.ok, true);
  const section = valid.config.sections[0];
  assert.equal(section.auto_sync, true);
  assert.equal(section.source_url, "https://www.cwf-air.com");
  assert.deepEqual(section.seed_urls, ["https://www.cwf-air.com/air-conditioner-not-cooling/", "https://www.cwf-air.com/air-conditioner-water-leaking/"]);

  const badSourceUrl = validateConfig({
    sections: [{ id: "articles", type: "articles", title: "x", source_url: "javascript:alert(1)", items: [] }],
  });
  assert.equal(badSourceUrl.ok, false);
  assert.ok(badSourceUrl.errors.some((error) => error.includes("source_url must be http/https")));

  const badSeedUrl = validateConfig({
    sections: [{ id: "articles", type: "articles", title: "x", seed_urls: ["not-a-url"], items: [] }],
  });
  assert.equal(badSeedUrl.ok, false);
  assert.ok(badSeedUrl.errors.some((error) => error.includes("seed_urls.0 invalid")));

  const autoSyncWithoutSource = validateConfig({
    sections: [{ id: "articles", type: "articles", title: "x", auto_sync: true, items: [] }],
  });
  assert.equal(autoSyncWithoutSource.ok, false);
  assert.ok(autoSyncWithoutSource.errors.some((error) => error.includes("source_url required when auto_sync is enabled")));

  const tooManySeedUrls = validateConfig({
    sections: [{ id: "articles", type: "articles", title: "x", seed_urls: Array.from({ length: 12 }, (_, i) => `https://www.cwf-air.com/post-${i}/`), items: [] }],
  });
  assert.equal(tooManySeedUrls.ok, true);
  assert.equal(tooManySeedUrls.config.sections[0].seed_urls.length, 8);
});

test("POST /admin/homepage-cms/sync-articles requires admin auth and a source_url, then upserts and returns synced articles", async () => {
  const pool = createPool();
  const deny = await withServer(pool, (_req, res) => res.status(401).json({ error: "UNAUTHORIZED" }));
  try {
    const denied = await fetch(`${deny.base}/admin/homepage-cms/sync-articles`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_url: "https://www.cwf-air.com" }) });
    assert.equal(denied.status, 401);
  } finally {
    await deny.close();
  }

  const allow = await withServer(pool, (req, _res, next) => { req.actor = { username: "admin", role: "admin" }; next(); });
  try {
    const missingUrl = await fetch(`${allow.base}/admin/homepage-cms/sync-articles`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    assert.equal(missingUrl.status, 400);

    await withMockFetch(async () => jsonFetchResponse([
      { id: 1, slug: "air-conditioner-not-cooling", link: "https://www.cwf-air.com/air-conditioner-not-cooling/", title: { rendered: "แอร์ไม่เย็น" }, excerpt: { rendered: "สาเหตุและวิธีแก้" }, date_gmt: "2026-05-20T08:00:00", _embedded: { "wp:featuredmedia": [{ source_url: "https://www.cwf-air.com/img.jpg" }] } },
    ]), async () => {
      const res = await fetch(`${allow.base}/admin/homepage-cms/sync-articles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_url: "https://www.cwf-air.com" }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.ok, true);
      assert.equal(data.synced_count, 1);
      assert.equal(data.articles.length, 1);
      assert.equal(data.articles[0].title, "แอร์ไม่เย็น");
      assert.ok(data.last_synced_at);
    });

    const statusRes = await fetch(`${allow.base}/admin/homepage-cms/synced-articles?source_url=${encodeURIComponent("https://www.cwf-air.com")}`);
    const statusData = await statusRes.json();
    assert.equal(statusData.ok, true);
    assert.equal(statusData.articles.length, 1);
    assert.ok(statusData.last_synced_at);
  } finally {
    await allow.close();
  }
});

test("GET /admin/homepage-cms/synced-articles returns an empty result without a source_url and requires admin auth", async () => {
  const pool = createPool();
  const deny = await withServer(pool, (_req, res) => res.status(401).json({ error: "UNAUTHORIZED" }));
  try {
    const denied = await fetch(`${deny.base}/admin/homepage-cms/synced-articles?source_url=https://www.cwf-air.com`);
    assert.equal(denied.status, 401);
  } finally {
    await deny.close();
  }

  const allow = await withServer(pool, (req, _res, next) => { req.actor = { username: "admin", role: "admin" }; next(); });
  try {
    const res = await fetch(`${allow.base}/admin/homepage-cms/synced-articles`);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.deepEqual(data.articles, []);
    assert.equal(data.last_synced_at, null);
  } finally {
    await allow.close();
  }
});

test("public homepage hydrates an auto_sync articles section from the synced-articles cache, replacing manually-curated items", async () => {
  const pool = createPool();
  pool.state.syncedArticles = [
    { source_url: "https://www.cwf-air.com", external_id: "a", title: "แอร์ไม่เย็น", summary: "สาเหตุและวิธีแก้", image_url: "https://www.cwf-air.com/a.jpg", link: "https://www.cwf-air.com/a/", published_at: "2026-05-20T08:00:00Z", synced_at: new Date().toISOString() },
  ];
  pool.state.row.published_config = {
    version: 1,
    sections: [{
      id: "articles", type: "articles", enabled: true, sort_order: 70, title: "บทความแนะนำ",
      auto_sync: true, source_url: "https://www.cwf-air.com", seed_urls: [],
      items: [{ title: "บทความเดิมที่กรอกด้วยมือ", url: "https://example.com/manual" }],
    }],
  };
  const server = await withServer(pool, (_req, _res, next) => next());
  try {
    const res = await fetch(`${server.base}/public/homepage`);
    const data = await res.json();
    const section = data.config.sections.find((s) => s.type === "articles");
    assert.ok(section);
    assert.equal(section.items.length, 1);
    assert.equal(section.items[0].title, "แอร์ไม่เย็น");
    assert.equal(section.items[0].url, "https://www.cwf-air.com/a/");
    assert.ok(!JSON.stringify(section.items).includes("บทความเดิมที่กรอกด้วยมือ"));
  } finally {
    await server.close();
  }
});

test("public homepage leaves manually-curated articles items untouched when auto_sync is off", async () => {
  const pool = createPool();
  pool.state.row.published_config = {
    version: 1,
    sections: [{
      id: "articles", type: "articles", enabled: true, sort_order: 70, title: "บทความแนะนำ",
      auto_sync: false, source_url: "", seed_urls: [],
      items: [{ title: "บทความที่กรอกด้วยมือ", url: "https://example.com/manual" }],
    }],
  };
  const server = await withServer(pool, (_req, _res, next) => next());
  try {
    const res = await fetch(`${server.base}/public/homepage`);
    const data = await res.json();
    const section = data.config.sections.find((s) => s.type === "articles");
    assert.equal(section.items[0].title, "บทความที่กรอกด้วยมือ");
  } finally {
    await server.close();
  }
});

test("admin-homepage-cms.js wires the articles auto-sync editor: toggle, source_url, seed_urls, sync-now, and hiding manual items when enabled", () => {
  const admin = read("admin-homepage-cms.js");
  assert.match(admin, /data-auto-sync/);
  assert.match(admin, /\.auto_sync = target\.checked/);
  assert.match(admin, /data-seed-urls/);
  assert.match(admin, /id="syncArticlesNow"/);
  assert.match(admin, /\/admin\/homepage-cms\/sync-articles/);
  assert.match(admin, /\/admin\/homepage-cms\/synced-articles/);
  assert.match(admin, /itemTypes\.includes\(section\.type\) && !\(section\.type === "articles" && section\.auto_sync\)/);
});
