const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const commonJsSource = fs.readFileSync(path.join(__dirname, "..", "admin-v2-common.js"), "utf8");
const catalogHtmlSource = fs.readFileSync(path.join(__dirname, "..", "admin-store-catalog.html"), "utf8");

test("shared admin menu includes a link to /admin-store-catalog.html", () => {
  assert.match(commonJsSource, /data-href="\/admin-store-catalog\.html"/);
});

test("shared admin menu catalog link has the expected Thai label", () => {
  assert.match(commonJsSource, /data-href="\/admin-store-catalog\.html">[^<]*รายการบริการในร้านค้า/);
});

test("the /admin-store-catalog.html menu link appears exactly once", () => {
  const matches = commonJsSource.match(/data-href="\/admin-store-catalog\.html"/g) || [];
  assert.equal(matches.length, 1);
});

test("admin-store-catalog.html still loads the shared admin-v2-common.js script", () => {
  assert.match(catalogHtmlSource, /<script src="\/admin-v2-common\.js\?v=[^"]+"><\/script>/);
});

test("admin-store-catalog.html loads its own admin-store-catalog.js script", () => {
  assert.match(catalogHtmlSource, /<script src="\/admin-store-catalog\.js\?v=[^"]+"><\/script>/);
});
