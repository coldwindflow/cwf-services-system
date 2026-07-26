const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");

const {
  DEFAULT_CONFIG,
  createHomepageRoutes,
  validateConfig,
  activeNow,
  stripPublicConfig,
  PAGE_AVAILABILITY_KEYS,
  DEFAULT_PAGE_AVAILABILITY,
  DEGRADED_PAGE_AVAILABILITY,
  hydrateDraftConfig,
  normalizePageAvailability,
  readPageAvailability,
} = require("../server/routes/homepage");

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
    sections: [{ id: "featured_services", type: "featured_services", title: "à¸šà¸£à¸´à¸à¸²à¸£à¹à¸™à¸°à¸™à¸³", items: [] }],
  });
  assert.equal(auto.ok, true);
  const fs1 = auto.config.sections[0];
  assert.equal(fs1.featured_mode, "auto");
  assert.equal(fs1.featured_limit, 6);
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
  assert.equal(fs2.featured_limit, 6);
  assert.equal(fs2.show_price, false);
  assert.equal(fs2.show_badge, false);
  assert.deepEqual(fs2.item_ids, ["a", "b"]);
  const adminSource = read("admin-homepage-cms.js");
  const adminHtml = read("admin-homepage-cms.html");
  assert.match(adminSource, /à¸ˆà¸³à¸™à¸§à¸™à¸à¸²à¸£à¹Œà¸”à¸•à¹ˆà¸­à¸Šà¸¸à¸” \(à¸ªà¸¹à¸‡à¸ªà¸¸à¸” 6\)/);
  assert.match(adminSource, /à¸”à¸¶à¸‡à¸ˆà¸²à¸ Catalog à¸­à¸±à¸•à¹‚à¸™à¸¡à¸±à¸•à¸´ \(Featured à¸à¹ˆà¸­à¸™\)/);
  assert.match(adminSource, /max="6"[^>]*data-featured-limit/);
  assert.match(adminHtml, /admin-homepage-cms\.js\?v=20260717_customer_icon_cms_v1/);
});

test("legacy published config without featured_services fields gets safe defaults without losing existing content", () => {
  const legacy = validateConfig({
    sections: [{
      id: "featured_services", type: "featured_services", enabled: true, sort_order: 5,
      title: "à¸šà¸£à¸´à¸à¸²à¸£à¹€à¸à¹ˆà¸²à¸‚à¸­à¸‡à¹à¸­à¸”à¸¡à¸´à¸™", body: "à¸„à¸³à¸­à¸˜à¸´à¸šà¸²à¸¢à¹€à¸”à¸´à¸¡", items: [],
    }],
  });
  assert.equal(legacy.ok, true);
  const section = legacy.config.sections[0];
  assert.equal(section.title, "à¸šà¸£à¸´à¸à¸²à¸£à¹€à¸à¹ˆà¸²à¸‚à¸­à¸‡à¹à¸­à¸”à¸¡à¸´à¸™");
  assert.equal(section.body, "à¸„à¸³à¸­à¸˜à¸´à¸šà¸²à¸¢à¹€à¸”à¸´à¸¡");
  assert.equal(section.featured_mode, "auto");
  assert.equal(section.featured_limit, 6);
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
    const draftConfig = {
      version: 1,
      navigation: { store: { label: "à¸šà¸£à¸´à¸à¸²à¸£à¸‚à¸­à¸‡à¹€à¸£à¸²", icon: { type: "library", value: "sparkle" } } },
      icon_overrides: { "page.store.header": { type: "library", value: "star" } },
      sections: [{ id: "hero", type: "hero", enabled: true, sort_order: 1, title: "Draft only", items: [] }],
    };
    const saved = await fetch(`${allow.base}/admin/homepage-cms/draft`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: draftConfig }),
    });
    assert.equal(saved.status, 200);
    let publicRes = await fetch(`${allow.base}/public/homepage`);
    let publicData = await publicRes.json();
    assert.doesNotMatch(JSON.stringify(publicData), /Draft only/);
    assert.notEqual(publicData.config.navigation.store.label, "à¸šà¸£à¸´à¸à¸²à¸£à¸‚à¸­à¸‡à¹€à¸£à¸²");

    const published = await fetch(`${allow.base}/admin/homepage-cms/publish`, { method: "POST" });
    assert.equal(published.status, 200);
    publicRes = await fetch(`${allow.base}/public/homepage`);
    publicData = await publicRes.json();
    assert.match(JSON.stringify(publicData), /Draft only/);
    assert.equal(publicData.config.navigation.store.label, "à¸šà¸£à¸´à¸à¸²à¸£à¸‚à¸­à¸‡à¹€à¸£à¸²");
    assert.equal(publicData.config.navigation.store.icon.value, "sparkle");
    assert.equal(publicData.config.icon_overrides["page.store.header"].value, "star");
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
  const build = "20260726_urgent_direct_auto_offer_v1";

  assert.doesNotMatch(index + ui, /à¹‚à¸«à¸¡à¸”à¹à¸­à¸”à¸¡à¸´à¸™|openCms|localStorage\.getItem\('cwfHomeCmsDemo'/);
  assert.match(index, /data-route="store"[\s\S]*à¸£à¹‰à¸²à¸™à¸„à¹‰à¸²/);
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
  // Booking item's icon tile lives entirely on .nav-item-primary::before's own background â€”
  // never a ::after overlay, which is the explicitly forbidden pattern (it can drift from
  // or cover the "à¸ˆà¸­à¸‡" label since it isn't part of the same flex flow as the icon).
  assert.doesNotMatch(css, /\.nav-item-primary::after/);
  assert.match(css, /width:\s*52px;\s*height:\s*52px/);
  assert.match(css, /background:\s*var\(--ico-book\) center \/ 24px 24px no-repeat, linear-gradient\(145deg, #ffd43b, #ffbd17\)/);
  assert.match(index, new RegExp(`customer-app\\.css\\?v=${build}`));
  assert.match(sw, new RegExp(`BUILD_ID = "${build}"`));
  assert.match(app, new ×½uòÚ$z{-®éÜj×ÃÖ‡GG3¢ò÷wwræ7vbÖ—"æ6öÖ“°Ð¢76W'BæWVÂ†FVæ–VBç7FGW2ÂC“°Ð¢Òf–æÆÇ’°Ð¢v—BFVç’æ6Æ÷6R‚“°Ð¢ÐÐ Ð¢6öç7BÆÆ÷rÒv—Bv—F…6W'fW"‡ööÂÂ‡&WÂ÷&W2ÂæW‡B’Óâ²&Wæ7F÷"Ò²W6W&æÖS¢&FÖ–â"Â&öÆS¢&FÖ–â"Ó²æW‡B‚“²Ò“°Ð¢G'’°Ð¢6öç7B&W2Òv—BfWF6‚†G¶ÆÆ÷ræ&6WÒöFÖ–âö†öÖWvRÖ6×2÷7–æ6VBÖ'F–6ÆW6“°Ð¢6öç7BFFÒv—B&W2æ§6öâ‚“°Ð¢76W'BæWVÂ†FFæö²ÂG'VR“°Ð¢76W'BæFVWWVÂ†FFæ'F–6ÆW2ÂµÒ“°Ð¢76W'BæWVÂ†FFæÆ7E÷7–æ6VEöBÂçVÆÂ“°Ð¢Òf–æÆÇ’°Ð¢v—BÆÆ÷ræ6Æ÷6R‚“°Ð¢ÐÐ§Ò“°Ð Ð§FW7B‚'V&Æ–2†öÖWvR‡–G&FW2âWFõ÷7–æ2'F–6ÆW26V7F–öâg&öÒF†R7–æ6VBÖ'F–6ÆW266†RÂ&WÆ6–ærÖçVÆÇ’Ö7W&FVB—FV×2"Â7–æ2‚’Óâ°Ð¢6öç7BööÂÒ7&VFUööÂ‚“°Ð¢ööÂç7FFRç7–æ6VD'F–6ÆW2Ò°Ð¢²6÷W&6U÷W&Ã¢&‡GG3¢ò÷wwræ7vbÖ—"æ6öÒ"ÂW‡FW&æÅö–C¢&"ÂF—FÆS¢.˜ŠÞŠ>˜Î˜NŠ˜Ž˜Š.˜~‰’"Â7VÖÖ'“¢.Š®‹.˜Š¾‰^‹Ž˜Š^‹Š~‹N‰Ž‹^˜ˆ˜’"Â–ÖvU÷W&Ã¢&‡GG3¢ò÷wwræ7vbÖ—"æ6öÒöæ§r"ÂÆ–æ³¢&‡GG3¢ò÷wwræ7vbÖ—"æ6öÒöò"ÂV&Æ—6†VEöC¢###bÓRÓ#Cƒ££¢"Â7–æ6VEöC¢æWrFFR‚’çFô•4õ7G&–ær‚’ÒÀÐ¢Ó°Ð¢ööÂç7FFRç&÷rçV&Æ—6†VEö6öæf–rÒ°Ð¢fW'6–öã¢ÀÐ¢6V7F–öç3¢·°Ð¢–C¢&'F–6ÆW2"ÂG—S¢&'F–6ÆW2"ÂVæ&ÆVC¢G'VRÂ6÷'Eö÷&FW#¢sÂF—FÆS¢.‰®‰~ˆNŠ~‹.Š˜‰ž‹‰ž‹2"ÀÐ¢WFõ÷7–æ3¢G'VRÂ6÷W&6U÷W&Ã¢&‡GG3¢ò÷wwræ7vbÖ—"æ6öÒ"Â6VVE÷W&Ç3¢µÒÀÐ¢—FV×3¢·²F—FÆS¢.‰®‰~ˆNŠ~‹.Š˜‰N‹NŠ‰~‹^˜ŽˆŠ>ŠÞˆ‰N˜žŠ~Š.Š‹~ŠÒ"ÂW&Ã¢&‡GG3¢òöW†×ÆRæ6öÒöÖçVÂ"ÕÒÀÐ¢ÕÒÀÐ¢Ó°Ð¢6öç7B6W'fW"Òv—Bv—F…6W'fW"‡ööÂÂ…÷&WÂ÷&W2ÂæW‡B’ÓâæW‡B‚’“°Ð¢G'’°Ð¢6öç7B&W2Òv—BfWF6‚†G·6W'fW"æ&6WÒ÷V&Æ–2ö†öÖWvV“°Ð¢6öç7BFFÒv—B&W2æ§6öâ‚“°Ð¢6öç7B6V7F–öâÒFFæ6öæf–rç6V7F–öç2æf–æB‚‡2’Óâ2çG—RÓÓÒ&'F–6ÆW2"“°Ð¢76W'Bæö²‡6V7F–öâ“°Ð¢76W'BæWVÂ‡6V7F–öâæ—FV×2æÆVæwF‚Â“°Ð¢76W'BæWVÂ‡6V7F–öâæ—FV×5³ÒçF—FÆRÂ.˜ŠÞŠ>˜Î˜NŠ˜Ž˜Š.˜~‰’"“°Ð¢76W'BæWVÂ‡6V7F–öâæ—FV×5³ÒçW&ÂÂ&‡GG3¢ò÷wwræ7vbÖ—"æ6öÒöò"“°Ð¢76W'Bæö²‚¥4ôâç7G&–æv–g’‡6V7F–öâæ—FV×2’æ–æ6ÇVFW2‚.‰®‰~ˆNŠ~‹.Š˜‰N‹NŠ‰~‹^˜ŽˆŠ>ŠÞˆ‰N˜žŠ~Š.Š‹~ŠÒ"’“°Ð¢Òf–æÆÇ’°Ð¢v—B6W'fW"æ6Æ÷6R‚“°Ð¢ÐÐ§Ò“°Ð Ð§FW7B‚'V&Æ–2†öÖWvRÆVfW2ÖçVÆÇ’Ö7W&FVB'F–6ÆW2—FV×2VçF÷V6†VBv†VâWFõ÷7–æ2—2öfb"Â7–æ2‚’Óâ°Ð¢6öç7BööÂÒ7&VFUööÂ‚“°Ð¢ööÂç7FFRç&÷rçV&Æ—6†VEö6öæf–rÒ°Ð¢fW'6–öã¢ÀÐ¢6V7F–öç3¢·°Ð¢–C¢&'F–6ÆW2"ÂG—S¢&'F–6ÆW2"ÂVæ&ÆVC¢G'VRÂ6÷'Eö÷&FW#¢sÂF—FÆS¢.‰®‰~ˆNŠ~‹.Š˜‰ž‹‰ž‹2"ÀÐ¢WFõ÷7–æ3¢fÇ6RÂ6÷W&6U÷W&Ã¢""Â6VVE÷W&Ç3¢µÒÀÐ¢—FV×3¢·²F—FÆS¢.‰®‰~ˆNŠ~‹.Š‰~‹^˜ŽˆŠ>ŠÞˆ‰N˜žŠ~Š.Š‹~ŠÒ"ÂW&Ã¢&‡GG3¢òöW†×ÆRæ6öÒöÖçVÂ"ÕÒÀÐ¢ÕÒÀÐ¢Ó°Ð¢6öç7B6W'fW"Òv—Bv—F…6W'fW"‡ööÂÂ…÷&WÂ÷&W2ÂæW‡B’ÓâæW‡B‚’“°Ð¢G'’°Ð¢6öç7B&W2Òv—BfWF6‚†G·6W'fW"æ&6WÒ÷V&Æ–2ö†öÖWvV“°Ð¢6öç7BFFÒv—B&W2æ§6öâ‚“°Ð¢6öç7B6V7F–öâÒFFæ6öæf–rç6V7F–öç2æf–æB‚‡2’Óâ2çG—RÓÓÒ&'F–6ÆW2"“°Ð¢76W'BæWVÂ‡6V7F–öâæ—FV×5³ÒçF—FÆRÂ.‰®‰~ˆNŠ~‹.Š‰~‹^˜ŽˆŠ>ŠÞˆ‰N˜žŠ~Š.Š‹~ŠÒ"“°Ð¢Òf–æÆÇ’°Ð¢v—B6W'fW"æ6Æ÷6R‚“°Ð¢ÐÐ§Ò“°Ð Ð§FW7B‚&FÖ–âÖ†öÖWvRÖ6×2æ§2v—&W2F†R'F–6ÆW2WFò×7–æ2VF—F÷#¢FövvÆRÂ6÷W&6U÷W&ÂÂ6VVE÷W&Ç2Â7–æ2Öæ÷rÂæB†–F–ærÖçVÂ—FV×2v†VâVæ&ÆVB"Â‚’Óâ°Ð¢6öç7BFÖ–âÒ&VB‚&FÖ–âÖ†öÖWvRÖ6×2æ§2"“°Ð¢76W'BæÖF6‚†FÖ–âÂöFFÖWFò×7–æ2ò“°Ð¢76W'BæÖF6‚†FÖ–âÂõÂæWFõ÷7–æ2ÒF&vWEÂæ6†V6¶VBò“°Ð¢76W'BæÖF6‚†FÖ–âÂöFF×6VVB×W&Ç2ò“°Ð¢76W'BæÖF6‚†FÖ–âÂö–CÒ'7–æ4'F–6ÆW4æ÷r"ò“°Ð¢76W'BæÖF6‚†FÖ–âÂõÂöFÖ–åÂö†öÖWvRÖ6×5Â÷7–æ2Ö'F–6ÆW2ò“°Ð¢76W'BæÖF6‚†FÖ–âÂõÂöFÖ–åÂö†öÖWvRÖ6×5Â÷7–æ6VBÖ'F–6ÆW2ò“°Ð¢76W'BæÖF6‚†FÖ–âÂö—FVÕG—W5Âæ–æ6ÇVFW5Â‡6V7F–öåÂçG—UÂ’bbÂ‡6V7F–öåÂçG—RÓÓÒ&'F–6ÆW2"bb6V7F–öåÂæWFõ÷7–æ5Â’ò“°Ð§Ò“°Ð Ð¢ò¢ÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÐÐ¢vRf–Æ&–Æ—G’„7W7FöÖW"c"&öÆÆ÷WB6öçG&öÂÂ7F÷&VB–âF†R4ÔPÐ¢†öÖWvR4Õ2V&Æ—6†VEö6öæf–r(	BæòæWrF&ÆR’âÆö6¶VBFVfVÇG3¢ÆVv7’ðÐ¢Ö—76–ær(i"ÆÂVæ&ÆVC²FVw&FVBf–Â×6fRÒ†öÖR²G&6¶–æröæÇ’àÐ¢ÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÒ¢ðÐ Ð§FW7B‚'vUöf–Æ&–Æ—G“¢W‡÷'G2†fRF†RÆö6¶VBr¶W—2æBFVfVÇB6†W2"Â‚’Óâ°Ð¢76W'BæFVWWVÂ…tUôd”Ä$”Ä•E•ô´U•2Â²&†öÖR"Â'7F÷&R"Â&&öö¶–ær"Â'66†VGVÆVB"Â'W&vVçB"Â'G&6¶–ær"Â'&öf–ÆR%Ò“°Ð¢76W'BæFVWWVÂ‡²ââäDTdTÅEõtUôd”Ä$”Ä•E’ÒÂ²†öÖS¢G'VRÂ7F÷&S¢G'VRÂ&öö¶–æs¢G'VRÂ66†VGVÆVC¢G'VRÂW&vVçC¢G'VRÂG&6¶–æs¢G'VRÂ&öf–ÆS¢G'VRÒ“°Ð¢òòFVw&FVBf–Â×6fR¶VW2öæÇ’F†RÆæF–ærvRæBG&6¶–ær&V6†&ÆRàÐ¢76W'BæFVWWVÂ‡²ââäDTu$DTEõtUôd”Ä$”Ä•E’ÒÂ²†öÖS¢G'VRÂ7F÷&S¢fÇ6RÂ&öö¶–æs¢fÇ6RÂ66†VGVÆVC¢fÇ6RÂW&vVçC¢fÇ6RÂG&6¶–æs¢G'VRÂ&öf–ÆS¢fÇ6RÒ“°Ð§Ò“°Ð Ð§FW7B‚'vUöf–Æ&–Æ—G“¢DTdTÅEô4ôäd”r6†—2ÆÂÖVæ&ÆVB"Â‚’Óâ°Ð¢76W'BæFVWWVÂ„DTdTÅEô4ôäd”rçvUöf–Æ&–Æ—G’Â²†öÖS¢G'VRÂ7F÷&S¢G'VRÂ&öö¶–æs¢G'VRÂ66†VGVÆVC¢G'VRÂW&vVçC¢G'VRÂG&6¶–æs¢G'VRÂ&öf–ÆS¢G'VRÒ“°Ð§Ò“°Ð Ð§FW7B‚'vUöf–Æ&–Æ—G“¢'6VçB&Æö6²fÆ–FFW2FòÆÂÖVæ&ÆVB†ÆVv7’6fR’Âæ÷BâW'&÷""Â‚’Óâ°Ð¢6öç7B÷WBÒfÆ–FFT6öæf–r‡²6V7F–öç3¢·²–C¢&†W&ò"ÂG—S¢&†W&ò"ÂVæ&ÆVC¢G'VRÂ6÷'Eö÷&FW#¢ÂF—FÆS¢'‚"Â—FV×3¢µÒÕÒÒ“°Ð¢76W'BæWVÂ†÷WBæö²ÂG'VR“°Ð¢76W'BæFVWWVÂ†÷WBæ6öæf–rçvUöf–Æ&–Æ—G’Â²†öÖS¢G'VRÂ7F÷&S¢G'VRÂ&öö¶–æs¢G'VRÂ66†VGVÆVC¢G'VRÂW&vVçC¢G'VRÂG&6¶–æs¢G'VRÂ&öf–ÆS¢G'VRÒ“°Ð§Ò“°Ð Ð§FW7B‚'vUöf–Æ&–Æ—G“¢fÆ–BW‡Æ–6—B&Æö6²—2&W6W'fVB2&ööÆVç2"Â‚’Óâ°Ð¢6öç7BÒ²†öÖS¢G'VRÂ7F÷&S¢fÇ6RÂ&öö¶–æs¢G'VRÂ66†VGVÆVC¢fÇ6RÂW&vVçC¢G'VRÂG&6¶–æs¢G'VRÂ&öf–ÆS¢fÇ6RÓ°Ð¢6öç7B÷WBÒfÆ–FFT6öæf–r‡²vUöf–Æ&–Æ—G“¢Â6V7F–öç3¢·²–C¢&†W&ò"ÂG—S¢&†W&ò"ÂVæ&ÆVC¢G'VRÂ6÷'Eö÷&FW#¢ÂF—FÆS¢'‚"Â—FV×3¢µÒÕÒÒ“°Ð¢76W'BæWVÂ†÷WBæö²ÂG'VR“°Ð¢76W'BæFVWWVÂ†÷WBæ6öæf–rçvUöf–Æ&–Æ—G’Â“°Ð§Ò“°Ð Ð§FW7B‚'vUöf–Æ&–Æ—G“¢&V¦V7G2Ö—76–ær¶W’ÂVæ¶æ÷vâ¶W’ÂæöâÖ&ööÆVâfÇVRÂæBÆÂÖF—6&ÆVB"Â‚’Óâ°Ð¢6öç7B&6RÒ·²–C¢&†W&ò"ÂG—S¢&†W&ò"ÂVæ&ÆVC¢G'VRÂ6÷'Eö÷&FW#¢ÂF—FÆS¢'‚"Â—FV×3¢µÒÕÓ°Ð¢6öç7BÖ—76–æt¶W’ÒfÆ–FFT6öæf–r‡²vUöf–Æ&–Æ—G“¢²†öÖS¢G'VRÂ7F÷&S¢G'VRÂ&öö¶–æs¢G'VRÂ66†VGVÆVC¢G'VRÂW&vVçC¢G'VRÂG&6¶–æs¢G'VRÒÂ6V7F–öç3¢&6RÒ“°Ð¢76W'BæWVÂ†Ö—76–æt¶W’æö²ÂfÇ6R“°Ð Ð¢6öç7BVæ¶æ÷vä¶W’ÒfÆ–FFT6öæf–r‡²vUöf–Æ&–Æ—G“¢²†öÖS¢G'VRÂ7F÷&S¢G'VRÂ&öö¶–æs¢G'VRÂ66†VGVÆVC¢G'VRÂW&vVçC¢G'VRÂG&6¶–æs¢G'VRÂ&öf–ÆS¢G'VRÂW‡G&¢G'VRÒÂ6V7F–öç3¢&6RÒ“°Ð¢76W'BæWVÂ‡Væ¶æ÷vä¶W’æö²ÂfÇ6R“°Ð Ð¢6öç7Bæöä&ööÂÒfÆ–FFT6öæf–r‡²vUöf–Æ&–Æ—G“¢²†öÖS¢'–W2"Â7F÷&S¢G'VRÂ&öö¶–æs¢G'VRÂ66†VGVÆVC¢G'VRÂW&vVçC¢G'VRÂG&6¶–æs¢G'VRÂ&öf–ÆS¢G'VRÒÂ6V7F–öç3¢&6RÒ“°Ð¢76W'BæWVÂ†æöä&ööÂæö²ÂfÇ6R“°Ð Ð¢6öç7BÆÄF—6&ÆVBÒfÆ–FFT6öæf–r‡²vUöf–Æ&–Æ—G“¢²†öÖS¢fÇ6RÂ7F÷&S¢fÇ6RÂ&öö¶–æs¢fÇ6RÂ66†VGVÆVC¢fÇ6RÂW&vVçC¢fÇ6RÂG&6¶–æs¢fÇ6RÂ&öf–ÆS¢fÇ6RÒÂ6V7F–öç3¢&6RÒ“°Ð¢76W'BæWVÂ†ÆÄF—6&ÆVBæö²ÂfÇ6R“°Ð§Ò“°Ð Ð§FW7B‚'vUöf–Æ&–Æ—G“¢&VEvTf–Æ&–Æ—G’æWfW"&WGW&ç2ÆÂÖF—6&ÆVBæBÆVv7’(i"ÆÂÖVæ&ÆVB"Â‚’Óâ°Ð¢76W'BæFVWWVÂ‡&VEvTf–Æ&–Æ—G’‡·Ò’Â²ââäDTdTÅEõtUôd”Ä$”Ä•E’Ò“°Ð¢76W'BæFVWWVÂ‡&VEvTf–Æ&–Æ—G’‡²vUöf–Æ&–Æ—G“¢çVÆÂÒ’Â²ââäDTdTÅEõtUôd”Ä$”Ä•E’Ò“°Ð¢òò6÷''WBÆÂÖF—6&ÆVBÖ—26öW&6VB&6²FòF†RÆÂÖVæ&ÆVB6fRFVfVÇBàÐ¢76W'BæFVWWVÂ€Ð¢&VEvTf–Æ&–Æ—G’‡²vUöf–Æ&–Æ—G“¢²†öÖS¢fÇ6RÂ7F÷&S¢fÇ6RÂ&öö¶–æs¢fÇ6RÂ66†VGVÆVC¢fÇ6RÂW&vVçC¢fÇ6RÂG&6¶–æs¢fÇ6RÂ&öf–ÆS¢fÇ6RÒÒ’ÀÐ¢²ââäDTdTÅEõtUôd”Ä$”Ä•E’ÒÀÐ¢“°Ð¢òòfÆ–B'F–ÂÖöfbÖ—2†öæ÷W&VBàÐ¢6öç7B'F–ÂÒ²†öÖS¢G'VRÂ7F÷&S¢fÇ6RÂ&öö¶–æs¢fÇ6RÂ66†VGVÆVC¢fÇ6RÂW&vVçC¢fÇ6RÂG&6¶–æs¢G'VRÂ&öf–ÆS¢fÇ6RÓ°Ð¢76W'BæFVWWVÂ‡&VEvTf–Æ&–Æ—G’‡²vUöf–Æ&–Æ—G“¢'F–ÂÒ’Â'F–Â“°Ð§Ò“°Ð Ð§FW7B‚'vUöf–Æ&–Æ—G“¢7G&—V&Æ–46öæf–r–æ6ÇVFW2æ÷&ÖÆ—¦VBfÆw2æBæWfW"FÖ–âÖöæÇ’f–VÆG2"Â‚’Óâ°Ð¢6öç7BV"Ò7G&—V&Æ–46öæf–r‡°Ð¢fW'6–öã¢ÀÐ¢6V7F–öç3¢·²–C¢&†W&ò"ÂG—S¢&†W&ò"ÂVæ&ÆVC¢G'VRÂ6÷'Eö÷&FW#¢ÂF—FÆS¢'‚"Â—FV×3¢µÒÂ–ÖvU÷V&Æ–5ö–C¢'6V7&WB"ÕÒÀÐ¢vUöf–Æ&–Æ—G“¢²†öÖS¢G'VRÂ7F÷&S¢fÇ6RÂ&öö¶–æs¢G'VRÂ66†VGVÆVC¢G'VRÂW&vVçC¢G'VRÂG&6¶–æs¢G'VRÂ&öf–ÆS¢G'VRÒÀÐ¢Ò“°Ð¢76W'BæFVWWVÂ‡V"çvUöf–Æ&–Æ—G’Â²†öÖS¢G'VRÂ7F÷&S¢fÇ6RÂ&öö¶–æs¢G'VRÂ66†VGVÆVC¢G'VRÂW&vVçC¢G'VRÂG&6¶–æs¢G'VRÂ&öf–ÆS¢G'VRÒ“°Ð¢76W'BæFöW4æ÷DÖF6‚„¥4ôâç7G&–æv–g’‡V"’Â÷6V7&WGÇWFFVEö'’ò“°Ð§Ò“°Ð Ð§FW7B‚'vUöf–Æ&–Æ—G“¢‡–G&FTG&gD6öæf–r&W6W'fW26V7F–öç2÷F†VÖR÷vUö†VFW'2æB&6¶f–ÆÇ2fÆw2"Â‚’Óâ°Ð¢6öç7B‡–G&FVBÒ‡–G&FTG&gD6öæf–r‡°Ð¢fW'6–öã¢2ÀÐ¢6V7F–öç3¢·²–C¢&†W&ò"ÂG—S¢&†W&ò"ÂVæ&ÆVC¢G'VRÂ6÷'Eö÷&FW#¢ÂF—FÆS¢&¶VWÖR"Â—FV×3¢µÒÕÒÀÐ¢F†VÖS¢²&–Ö'“¢"3#3CSb"ÒÀÐ¢vUö†VFW'3¢²G&6¶–æs¢²Væ&ÆVC¢G'VRÂF—FÆS¢%B"ÒÒÀÐ¢òòæòvUöf–Æ&–Æ—G’(i"ÆVv7’Â×W7B&6¶f–ÆÂÆÂÖVæ&ÆV@Ð¢Ò“°Ð¢76W'BæÖF6‚„¥4ôâç7G&–æv–g’†‡–G&FVBç6V7F–öç2’Âö¶VWÖRò“°Ð¢76W'BæFVWWVÂ†‡–G&FVBçF†VÖRÂ²&–Ö'“¢"3#3CSb"Ò“°Ð¢76W'BæWVÂ†‡–G&FVBçvUö†VFW'2çG&6¶–ærçF—FÆRÂ%B"“°Ð¢76W'BæFVWWVÂ†‡–G&FVBçvUöf–Æ&–Æ—G’Â²ââäDTdTÅEõtUôd”Ä$”Ä•E’Ò“°Ð§Ò“°Ð Ð§FW7B‚$tUB÷V&Æ–2ö7W7FöÖW"ÖÖ6öæf–s¢æòV&Æ—6†VB6öæf–r(i"ÆÂÖVæ&ÆVBfÆÆ&6²ÂæòFÖ–âÆV²"Â7–æ2‚’Óâ°Ð¢6öç7BööÂÒ7&VFUööÂ‚“°Ð¢ööÂç7FFRç&÷rçV&Æ—6†VEö6öæf–rÒçVÆÃ°Ð¢6öç7B6W'fW"Òv—Bv—F…6W'fW"‡ööÂÂ…÷&WÂ÷&W2ÂæW‡B’ÓâæW‡B‚’“°Ð¢G'’°Ð¢6öç7B&W2Òv—BfWF6‚†G·6W'fW"æ&6WÒ÷V&Æ–2ö7W7FöÖW"ÖÖ6öæf–v“°Ð¢6öç7BFFÒv—B&W2æ§6öâ‚“°Ð¢76W'BæWVÂ‡&W2ç7FGW2Â#“°Ð¢76W'BæWVÂ‡&W2æ†VFW'2ævWB‚&66†RÖ6öçG&öÂ"’Â&æò×7F÷&R"“°Ð¢76W'BæWVÂ†FFæö²ÂG'VR“°Ð¢76W'BæWVÂ†FFæfÆÆ&6²ÂG'VR“°Ð¢76W'BæWVÂ†FFæFVw&FVBÂfÇ6R“°Ð¢76W'BæFVWWVÂ†FFçvUöf–Æ&–Æ—G’Â²ââäDTdTÅEõtUôd”Ä$”Ä•E’Ò“°Ð¢76W'BæFöW4æ÷DÖF6‚„¥4ôâç7G&–æv–g’†FF’ÂöG&gEö6öæf–wÇWFFVEö'—Ç6V7F–öç2ò“°Ð¢Òf–æÆÇ’°Ð¢v—B6W'fW"æ6Æ÷6R‚“°Ð¢ÐÐ§Ò“°Ð Ð§FW7B‚$tUB÷V&Æ–2ö7W7FöÖW"ÖÖ6öæf–s¢ÆVv7’V&Æ—6†VB†æòfÆw2’(i"ÆÂÖVæ&ÆVBÂæ÷BfÆÆ&6²"Â7–æ2‚’Óâ°Ð¢6öç7BööÂÒ7&VFUööÂ‚“°Ð¢ööÂç7FFRç&÷rçV&Æ—6†VEö6öæf–rÒ²fW'6–öã¢"Â6V7F–öç3¢·²–C¢&†W&ò"ÂG—S¢&†W&ò"ÂVæ&ÆVC¢G'VRÂ6÷'Eö÷&FW#¢ÂF—FÆS¢'‚"Â—FV×3¢µÒÕÒÓ°Ð¢ööÂç7FFRç&÷rçfW'6–öâÒ#°Ð¢6öç7B6W'fW"Òv—Bv—F…6W'fW"‡ööÂÂ…÷&WÂ÷&W2ÂæW‡B’ÓâæW‡B‚’“°Ð¢G'’°Ð¢6öç7B&W2Òv—BfWF6‚†G·6W'fW"æ&6WÒ÷V&Æ–2ö7W7FöÖW"ÖÖ6öæf–v“°Ð¢6öç7BFFÒv—B&W2æ§6öâ‚“°Ð¢76W'BæWVÂ‡&W2ç7FGW2Â#“°Ð¢76W'BæWVÂ†FFæfÆÆ&6²ÂfÇ6R“°Ð¢76W'BæWVÂ†FFæFVw&FVBÂfÇ6R“°Ð¢76W'BæFVWWVÂ†FFçvUöf–Æ&–Æ—G’Â²ââäDTdTÅEõtUôd”Ä$”Ä•E’Ò“°Ð¢Òf–æÆÇ’°Ð¢v—B6W'fW"æ6Æ÷6R‚“°Ð¢ÐÐ§Ò“°Ð Ð§FW7B‚$tUB÷V&Æ–2ö7W7FöÖW"ÖÖ6öæf–s¢V&Æ—6†VBfÆw2&R&WGW&æVBfW&&F–Ò"Â7–æ2‚’Óâ°Ð¢6öç7BööÂÒ7&VFUööÂ‚“°Ð¢6öç7BÒ²†öÖS¢G'VRÂ7F÷&S¢fÇ6RÂ&öö¶–æs¢fÇ6RÂ66†VGVÆVC¢fÇ6RÂW&vVçC¢fÇ6RÂG&6¶–æs¢G'VRÂ&öf–ÆS¢fÇ6RÓ°Ð¢ööÂç7FFRç&÷rçV&Æ—6†VEö6öæf–rÒ²fW'6–öã¢RÂvUöf–Æ&–Æ—G“¢Â6V7F–öç3¢·²–C¢&†W&ò"ÂG—S¢&†W&ò"ÂVæ&ÆVC¢G'VRÂ6÷'Eö÷&FW#¢ÂF—FÆS¢'‚"Â—FV×3¢µÒÕÒÓ°Ð¢ööÂç7FFRç&÷rçfW'6–öâÒS°Ð¢6öç7B6W'fW"Òv—Bv—F…6W'fW"‡ööÂÂ…÷&WÂ÷&W2ÂæW‡B’ÓâæW‡B‚’“°Ð¢G'’°Ð¢6öç7B&W2Òv—BfWF6‚†G·6W'fW"æ&6WÒ÷V&Æ–2ö7W7FöÖW"ÖÖ6öæf–v“°Ð¢6öç7BFFÒv—B&W2æ§6öâ‚“°Ð¢76W'BæWVÂ‡&W2ç7FGW2Â#“°Ð¢76W'BæWVÂ†FFæfÆÆ&6²ÂfÇ6R“°Ð¢76W'BæFVWWVÂ†FFçvUöf–Æ&–Æ—G’Â“°Ð¢Òf–æÆÇ’°Ð¢v—B6W'fW"æ6Æ÷6R‚“°Ð¢ÐÐ§Ò“°Ð Ð§FW7B‚$tUB÷V&Æ–2ö7W7FöÖW"ÖÖ6öæf–s¢D"f–ÇW&R(i"FVw&FVBf–Â×6fRv—F‚…EE#†æWfW"S’"Â7–æ2‚’Óâ°Ð¢6öç7BööÂÒ°Ð¢7–æ2VW'’‚’°Ð¢6öç7BW'&÷"ÒæWrW'&÷"‚&Ö—76–ærF&ÆR"“°Ð¢W'&÷"æ6öFRÒ#C%#°Ð¢F‡&÷rW'&÷#°Ð¢ÒÀÐ¢Ó°Ð¢6öç7B6W'fW"Òv—Bv—F…6W'fW"‡ööÂÂ…÷&WÂ÷&W2ÂæW‡B’ÓâæW‡B‚’“°Ð¢G'’°Ð¢6öç7B&W2Òv—BfWF6‚†G·6W'fW"æ&6WÒ÷V&Æ–2ö7W7FöÖW"ÖÖ6öæf–v“°Ð¢6öç7BFFÒv—B&W2æ§6öâ‚“°Ð¢76W'BæWVÂ‡&W2ç7FGW2Â#“°Ð¢76W'BæWVÂ†FFæFVw&FVBÂG'VR“°Ð¢76W'BæWVÂ†FFæfÆÆ&6²ÂG'VR“°Ð¢76W'BæFVWWVÂ†FFçvUöf–Æ&–Æ—G’Â²ââäDTu$DTEõtUôd”Ä$”Ä•E’Ò“°Ð¢Òf–æÆÇ’°Ð¢v—B6W'fW"æ6Æ÷6R‚“°Ð¢ÐÐ§Ò“°Ð Ð§FW7B‚'vUöf–Æ&–Æ—G“¢G&gB6fRFöW2æ÷BV&Æ—6‚fÆw2VçF–ÂV&Æ—6‚—26ÆÆVB"Â7–æ2‚’Óâ°Ð¢6öç7BööÂÒ7&VFUööÂ‚“°Ð¢6öç7BÆÆ÷rÒv—Bv—F…6W'fW"‡ööÂÂ‡&WÂ÷&W2ÂæW‡B’Óâ²&Wæ7F÷"Ò²W6W&æÖS¢&FÖ–â"Â&öÆS¢&FÖ–â"Ó²æW‡B‚“²Ò“°Ð¢G'’°Ð¢6öç7BG&gD6öæf–rÒ°Ð¢fW'6–öã¢ÀÐ¢vUöf–Æ&–Æ—G“¢²†öÖS¢G'VRÂ7F÷&S¢fÇ6RÂ&öö¶–æs¢fÇ6RÂ66†VGVÆVC¢fÇ6RÂW&vVçC¢fÇ6RÂG&6¶–æs¢G'VRÂ&öf–ÆS¢fÇ6RÒÀÐ¢6V7F–öç3¢·²–C¢&†W&ò"ÂG—S¢&†W&ò"ÂVæ&ÆVC¢G'VRÂ6÷'Eö÷&FW#¢ÂF—FÆS¢'‚"Â—FV×3¢µÒÕÒÀÐ¢Ó°Ð¢v—BfWF6‚†G¶ÆÆ÷ræ&6WÒöFÖ–âö†öÖWvRÖ6×2öG&gFÂ°Ð¢ÖWF†öC¢%UB"Â†VFW'3¢²$6öçFVçBÕG—R#¢&Æ–6F–öâö§6öâ"ÒÂ&öG“¢¥4ôâç7G&–æv–g’‡²6öæf–s¢G&gD6öæf–rÒ’ÀÐ¢Ò“°Ð¢òòV&Æ–26öæf–r7F–ÆÂÆÂÖVæ&ÆVB(	BG&gB—2æ÷BV&Æ—6†VBàÐ¢ÆWB&W2Òv—BfWF6‚†G¶ÆÆ÷ræ&6WÒ÷V&Æ–2ö7W7FöÖW"ÖÖ6öæf–v“°Ð¢ÆWBFFÒv—B&W2æ§6öâ‚“°Ð¢76W'BæFVWWVÂ†FFçvUöf–Æ&–Æ—G’Â²ââäDTdTÅEõtUôd”Ä$”Ä•E’Ò“°Ð Ð¢v—BfWF6‚†G¶ÆÆ÷ræ&6WÒöFÖ–âö†öÖWvRÖ6×2÷V&Æ—6†Â°Ð¢ÖWF†öC¢%õ5B"Â†VFW'3¢²$6öçFVçBÕG—R#¢&Æ–6F–öâö§6öâ"ÒÂ&öG“¢¥4ôâç7G&–æv–g’‡²6öæf–s¢G&gD6öæf–rÒ’ÀÐ¢Ò“°Ð¢&W2Òv—BfWF6‚†G¶ÆÆ÷ræ&6WÒ÷V&Æ–2ö7W7FöÖW"ÖÖ6öæf–v“°Ð¢FFÒv—B&W2æ§6öâ‚“°Ð¢76W'BæFVWWVÂ†FFçvUöf–Æ&–Æ—G’Â²†öÖS¢G'VRÂ7F÷&S¢fÇ6RÂ&öö¶–æs¢fÇ6RÂ66†VGVÆVC¢fÇ6RÂW&vVçC¢fÇ6RÂG&6¶–æs¢G'VRÂ&öf–ÆS¢fÇ6RÒ“°Ð¢Òf–æÆÇ’°Ð¢v—BÆÆ÷ræ6Æ÷6R‚“°Ð¢ÐÐ§Ò“°Ð Ð§FW7B‚&FÖ–â4Õ2v—&W2F†RvRÖf–Æ&–Æ—G’VF—F÷"‡FövvÆW2ÂV&Æ—6‚wV&BÂG&6¶–ærÖöfb6öæf—&Ò’"Â‚’Óâ°Ð¢6öç7BFÖ–ä§2Ò&VB‚&FÖ–âÖ†öÖWvRÖ6×2æ§2"“°Ð¢6öç7BFÖ–ä‡FÖÂÒ&VB‚&FÖ–âÖ†öÖWvRÖ6×2æ‡FÖÂ"“°Ð¢òòVF—F÷"²æbVçG'’àÐ¢76W'BæÖF6‚†FÖ–ä§2ÂöFFÖVF—CÒ'vRÖf–Æ&–Æ—G’"ò“°Ð¢76W'BæÖF6‚†FÖ–ä§2Â÷&VæFW%vTf–Æ&–Æ—G”VF—F÷"ò“°Ð¢76W'BæÖF6‚†FÖ–ä§2ÂöFF×vRÖf–Æ&–Æ—G“Ò"ò“°Ð¢òòæWfW"WFò×FövvÆS¢öæÇ’F†RFövvÆVB¶W’6†ævW2àÐ¢76W'BæÖF6‚†FÖ–ä§2Âö6öæf–uÂçvUöf–Æ&–Æ—G•Å¶¶W•ÅÒÒF&vWEÂæ6†V6¶VBò“°Ð¢òò6ææ÷BF—6&ÆRF†RÆ7BVæ&ÆVBvR…T’wV&B’ÂæBV&Æ—6‚wV&G2&VÖ–âàÐ¢76W'BæÖF6‚†FÖ–ä§2ÂögVæ7F–öâvTf–Æ&–Æ—G•FövvÆTÆÆ÷vVEÂ‚ò“°Ð¢76W'BæÖF6‚†FÖ–ä§2Âö–bÂ‚vTf–Æ&–Æ—G•FövvÆTÆÆ÷vVEÂ†6öæf–uÂçvUöf–Æ&–Æ—G’Â¶W’ÂF&vWEÂæ6†V6¶VEÂ•Â’ò“°Ð¢òòV&Æ—6‚wV&G3¢ÆÂÖF—6&ÆVB&Æö6¶VBÂG&6¶–ærÖöfb6öæf—&ÒàÐ¢76W'BæÖF6‚†FÖ–ä§2Âþ‰^˜žŠÞˆ~˜‰¾‹N‰NŠÞŠ.˜Ž‹.ˆ~‰ž˜žŠÞŠ"Š¾‰ž˜ž‹"ò“°Ð¢76W'BæÖF6‚†FÖ–ä§2Â÷ÂçG&6¶–ærÓÓÒfÇ6Rbbv–æF÷uÂæ6öæf—&Òò“°Ð¢òò552&W6VçBf÷"F†RVF—F÷"àÐ¢76W'BæÖF6‚†FÖ–ä‡FÖÂÂõÂç×&÷rò“°Ð§Ò“°Ð