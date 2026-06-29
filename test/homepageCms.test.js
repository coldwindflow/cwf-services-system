const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");

const { DEFAULT_CONFIG, createHomepageRoutes, validateConfig } = require("../server/routes/homepage");

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
    },
    queries: [],
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
      throw new Error(`Unhandled query: ${normalized}`);
    },
  };
}

async function withServer(pool, requireAdminSession) {
  const app = express();
  app.use(express.json({ limit: "200kb" }));
  app.use(createHomepageRoutes({
    pool,
    requireAdminSession,
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
  const build = "20260629_customer_homepage_cms_rebased";

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
  assert.match(css, /margin:\s*-28px 0 0/);
  assert.match(css, /width:\s*54px/);
  assert.match(css, /height:\s*54px/);
  assert.match(css, /background:\s*linear-gradient\(145deg,#ffd43b,#ffbd17\)/);
  assert.match(css, /background:\s*#2b2500/);
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
    "announcements",
    "featured_services",
    "updates",
    "articles",
    "trust",
  ]);
  assert.deepEqual(DEFAULT_CONFIG.sections.map((section) => section.sort_order), [10, 20, 30, 40, 50, 60, 70]);
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
      items: [],
    }],
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.config.sections[0].image_url, "https://res.cloudinary.com/demo/hero.jpg");
  assert.equal(valid.config.sections[0].image_public_id, "cwf/homepage/hero");

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
  for (const type of ["hero", "quick", "announcements", "featured_services", "updates", "articles", "trust"]) {
    assert.match(admin, new RegExp(`type:\\s*"${type}"`));
    assert.match(customer, new RegExp(`type:\\s*"${type}"`));
  }
  assert.doesNotMatch(migration, /ALTER TABLE\s+public\.catalog_items/i);
  assert.doesNotMatch(migration, /idx_catalog_items_customer_featured/i);
});

test("bottom navigation border and padding match the fixed-nav reference", () => {
  const css = read("customer-app/assets/customer-app.css");
  assert.match(css, /border-top:\s*1px solid var\(--line\)/);
  assert.match(css, /padding:\s*9px 6px calc\(8px \+ var\(--safe-b\)\)/);
});
