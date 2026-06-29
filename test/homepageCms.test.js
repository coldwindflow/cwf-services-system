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
    activeJob: null,
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
      if (normalized.includes("FROM public.jobs") && normalized.includes("customer_sub=$1")) {
        return { rows: state.activeJob && params[0] === "customer-1" ? [state.activeJob] : [] };
      }
      throw new Error(`Unhandled query: ${normalized}`);
    },
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
  const build = "20260629_customer_homepage_mobile_hotfix";

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
  assert.match(css, /width:\s*44px/);
  assert.match(css, /height:\s*44px/);
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
    "active_job",
    "announcements",
    "featured_services",
    "updates",
    "articles",
    "trust",
  ]);
  assert.deepEqual(DEFAULT_CONFIG.sections.map((section) => section.sort_order), [10, 20, 30, 40, 50, 60, 70, 80]);
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
  for (const type of ["hero", "quick", "active_job", "announcements", "featured_services", "updates", "articles", "trust"]) {
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
  assert.match(css, /\.bottom-nav \.nav-item-primary::after\s*\{[\s\S]*width:\s*44px[\s\S]*height:\s*44px/);
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
  assert.match(previewSource, /const slides = Array\.isArray\(section\.items\) && section\.items\.length \? section\.items : \[section\]/);
});
