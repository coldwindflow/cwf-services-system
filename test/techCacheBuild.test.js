const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const BUILD = "20260622_legacy_cap_policy_tech_cache_v1";

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

test("Tech App shell and cache files use the same production build id", () => {
  const tech = read("tech.html");
  const app = read("app.js");
  const pwa = read("cwf-pwa.js");
  const sw = read("sw.js");

  assert.match(tech, new RegExp(`app\\.js\\?v=${BUILD}`));
  assert.match(tech, new RegExp(`cwf-pwa\\.js\\?v=${BUILD}`));
  assert.match(tech, new RegExp(`name="cwf-tech-build" content="${BUILD}"`));
  assert.match(app, new RegExp(`__CWF_TECH_APP_VERSION__ = "${BUILD}"`));
  assert.match(app, new RegExp(`/sw\\.js\\?v=${BUILD}`));
  assert.match(pwa, new RegExp(`VERSION = '${BUILD}'`));
  assert.match(sw, new RegExp(`CWF_TECH_BUILD_ID = "${BUILD}"`));
});

test("root service worker activates new cache and replaces stale Tech App caches", () => {
  const sw = read("sw.js");
  assert.match(sw, /self\.skipWaiting\(\)/);
  assert.match(sw, /self\.clients\.claim\(\)/);
  assert.match(sw, /CACHE_PREFIX = "cwf-root-tech-app-"/);
  assert.match(sw, /key\.startsWith\(CACHE_PREFIX\) && key !== CACHE_NAME/);
  assert.match(sw, /fetch\(request\)/);
});
