const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const registry = require("../customer-app/modules/iconRegistry");
const {
  DEFAULT_CONFIG,
  resolveIconMedia,
  stripPublicConfig,
  validateConfig,
} = require("../server/routes/homepage");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

test("icon registry has stable defaults for five navigation items and every declared slot", () => {
  assert.deepEqual(Object.keys(registry.NAVIGATION), ["home", "store", "booking", "tracking", "profile"]);
  assert.equal(Object.keys(registry.defaultNavigation()).length, 5);
  assert.ok(registry.SLOT_DEFINITIONS.length >= 15);
  for (const slot of registry.SLOT_DEFINITIONS) {
    assert.ok(registry.isLibraryIcon(slot.defaultIcon), `${slot.key} must have an allowlisted fallback`);
    assert.deepEqual(registry.resolveSlot({}, slot.key), { type: "library", value: slot.defaultIcon });
  }
});

test("legacy homepage config receives safe icon defaults and nav labels are bounded", () => {
  const legacy = validateConfig({ sections: DEFAULT_CONFIG.sections });
  assert.equal(legacy.ok, true);
  assert.equal(legacy.config.navigation.home.icon.value, "home");
  assert.equal(legacy.config.icon_overrides["quick.1"].value, "sparkle");

  const normalized = registry.normalizeNavigation({
    home: { label: "\u0000   เมนูใหม่ที่ยาวเกินขอบเขตสำหรับมือถืออย่างแน่นอน   " },
  }, "stored");
  assert.ok(Array.from(normalized.home.label).length <= registry.MAX_NAV_LABEL_LENGTH);
  assert.doesNotMatch(normalized.home.label, /\u0000/);
});

test("server rejects non-allowlisted icon payloads instead of accepting active content or external URLs", () => {
  const attacks = [
    { type: "library", value: "<svg onload=alert(1)>" },
    { type: "library", value: "<script>alert(1)</script>" },
    { type: "image", value: "data:image/png;base64,AAAA" },
    { type: "image", value: "https://evil.example/icon.png" },
    { type: "image", value: "javascript:alert(1)" },
  ];
  for (const attack of attacks) {
    const result = validateConfig({
      sections: DEFAULT_CONFIG.sections,
      navigation: { home: { label: "Home", icon: attack } },
    });
    assert.equal(result.ok, false, JSON.stringify(attack));
    assert.ok(result.errors.some((error) => error.startsWith("navigation.home.icon")));
  }
  assert.equal(registry.isSafePublicImageUrl("https://evil.example/icon.png"), false);
  assert.equal(registry.isSafePublicImageUrl("data:image/png;base64,AAAA"), false);
});

test("validated media pipeline resolves a stored image and public config exposes only its safe CDN URL", async () => {
  const publicId = "cwf/homepage/homepage_icon_123";
  const url = "https://res.cloudinary.com/demo/image/upload/v1/cwf/homepage/homepage_icon_123.png";
  const validation = validateConfig({
    sections: DEFAULT_CONFIG.sections,
    icon_overrides: { "page.home.header": { type: "image", value: publicId } },
  });
  assert.equal(validation.ok, true);
  const pool = {
    async query(sql, params) {
      assert.match(String(sql), /homepage_cms_media/);
      assert.deepEqual(params, [[publicId]]);
      return { rows: [{ image_public_id: publicId, image_url: url }] };
    },
  };
  await resolveIconMedia(pool, validation);
  assert.equal(validation.ok, true);
  const published = stripPublicConfig(validation.config);
  assert.deepEqual(published.icon_overrides["page.home.header"], { type: "image", value: url });
  assert.doesNotMatch(JSON.stringify(published), /image_public_id|"value":"cwf\/homepage/);
});

test("missing or damaged image config always falls back to a library icon", async () => {
  const validation = validateConfig({
    sections: DEFAULT_CONFIG.sections,
    icon_overrides: { "action.call": { type: "image", value: "cwf/homepage/missing_icon" } },
  });
  await resolveIconMedia({ query: async () => ({ rows: [] }) }, validation);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes("icon image media not found"));
  assert.deepEqual(registry.resolveSlot({ icon_overrides: { "action.call": { type: "image", value: "https://evil.example/x.png" } } }, "action.call"), {
    type: "library",
    value: "phone",
  });
  assert.match(read("customer-app/modules/utils.js"), /data-icon-fallback/);
  assert.match(read("customer-app/modules/utils.js"), /document\.addEventListener\("error"/);
});

test("admin and customer runtime share the registry while route and page availability controls stay intact", () => {
  const adminHtml = read("admin-homepage-cms.html");
  const adminJs = read("admin-homepage-cms.js");
  const customerHtml = read("customer-app/index.html");
  const router = read("customer-app/modules/router.js");
  const css = read("customer-app/assets/customer-app.css");

  assert.match(adminHtml, /modules\/iconRegistry\.js/);
  assert.match(customerHtml, /modules\/iconRegistry\.js/);
  assert.match(adminJs, /\/admin\/homepage-cms\/draft/);
  assert.match(adminJs, /\/admin\/homepage-cms\/publish/);
  assert.match(adminJs, /data-icon-upload/);
  assert.match(adminJs, /icon-nav-preview/);
  for (const route of Object.keys(registry.NAVIGATION)) {
    assert.match(customerHtml, new RegExp(`data-route="${route}"`));
  }
  assert.match(router, /classList\.toggle\("is-active", active\)/);
  assert.match(router, /pa\.applyToDom/);
  assert.match(css, /min-height:\s*52px/);
  assert.match(css, /@media \(max-width: 390px\)/);
});
