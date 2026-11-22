"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function registration(controlled) {
  const source = fs.readFileSync("customer-app/assets/customer-app.js", "utf8");
  const start = source.indexOf("  function registerServiceWorker() {");
  const end = source.indexOf("\n  async function init()", start);
  assert.ok(start > 0 && end > start);
  const storage = new Map();
  let listener, reloads = 0;
  const serviceWorker = {
    controller: controlled ? {} : null,
    addEventListener(name, callback) { assert.equal(name, "controllerchange"); listener = callback; },
    register(url, options) { assert.equal(options.updateViaCache, "none"); return Promise.resolve(); },
  };
  vm.runInNewContext(`const BUILD_ID = "qa-build";\n${source.slice(start, end)}\nregisterServiceWorker();`, {
    navigator: { serviceWorker },
    window: { location: { reload() { reloads++; } }, sessionStorage: {
      getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value),
    } },
  });
  return { change() { serviceWorker.controller = {}; listener(); }, reloads: () => reloads };
}

test("first PWA claim preserves current input; the subsequent update reloads once", () => {
  const page = registration(false);
  page.change();
  assert.equal(page.reloads(), 0);
  page.change(); page.change();
  assert.equal(page.reloads(), 1);
});

test("an already controlled page reloads once when its service worker updates", () => {
  const page = registration(true);
  page.change(); page.change();
  assert.equal(page.reloads(), 1);
});
