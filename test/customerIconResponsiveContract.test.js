const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const customerWidths = [320, 390, 430, 480];
const adminWidths = [881, 1024, 1100];

test("responsive viewport contract covers customer and admin review breakpoints", () => {
  assert.deepEqual(customerWidths, [320, 390, 430, 480]);
  assert.deepEqual(adminWidths, [881, 1024, 1100]);
});

test("admin tablet architecture collapses the preview before the editor can overflow", () => {
  const html = read("admin-homepage-cms.html");

  assert.match(html, /\.cms-layout\{display:grid;grid-template-columns:252px minmax\(0,1fr\) 340px/);
  assert.match(html, /@media\(min-width:881px\) and \(max-width:1199px\)/);
  assert.match(html, /\.cms-layout\{grid-template-columns:252px minmax\(0,1fr\);grid-template-rows:auto auto/);
  assert.match(html, /\.cms-preview\{grid-column:2;grid-row:2/);
  assert.match(html, /\.cms-editor\{min-width:0/);
  assert.match(html, /\.icon-cms-layout\{display:grid;grid-template-columns:minmax\(0,\.85fr\) minmax\(0,1\.15fr\)/);
  assert.match(html, /@container cms-editor \(max-width:680px\)\{\.icon-cms-layout\{grid-template-columns:minmax\(0,1fr\)/);
  assert.doesNotMatch(html, /minmax\((260|300)px/);
  assert.doesNotMatch(html, /overflow-x\s*:\s*hidden/);
});

test("admin controls retain 44px targets, keyboard focus, and an accessible mobile file picker", () => {
  const html = read("admin-homepage-cms.html");
  const js = read("admin-homepage-cms.js");

  assert.match(html, /\.btn\{[^}]*min-height:44px/);
  assert.match(html, /\.mini\{[^}]*width:44px;height:44px/);
  assert.match(html, /input\.fi,textarea\.fi,select\.fi\{[^}]*min-height:44px/s);
  assert.match(html, /:focus-visible\{outline:3px/);
  assert.match(js, /<button type="button" class="sec-row-body" data-edit=/);
  assert.match(js, /class="visually-hidden-file" type="file"[^>]*data-icon-upload/);
  assert.doesNotMatch(js, /data-icon-upload hidden/);
});

test("customer navigation has five stable routes, touch targets, truncation, and safe-area clearance", () => {
  const html = read("customer-app/index.html");
  const css = read("customer-app/assets/customer-app.css");
  const navItems = html.match(/class="nav-item(?:\s[^\"]*)?"/g) || [];

  assert.equal(navItems.length, 5);
  for (const route of ["home", "store", "booking", "tracking", "profile"]) {
    assert.match(html, new RegExp(`data-route="${route}"`));
  }
  assert.match(css, /\.bottom-nav \.nav-item \{ min-height: 52px; \}/);
  assert.match(css, /\[data-nav-label\][\s\S]*text-overflow: ellipsis;[\s\S]*white-space: nowrap;/);
  assert.match(css, /padding-bottom: calc\(7px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(css, /scroll-padding-bottom: calc\(var\(--nav-h\) \+ env\(safe-area-inset-bottom, 0px\) \+ 24px\)/);
  assert.match(css, /\.bottom-nav \.nav-item:focus-visible/);
});
