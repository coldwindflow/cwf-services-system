"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const store = fs.readFileSync("customer-app/modules/store.js", "utf8");
const ui = fs.readFileSync("customer-app/modules/ui.js", "utf8");
const css = fs.readFileSync("customer-app/assets/customer-app.css", "utf8");
const admin = fs.readFileSync("admin-store-catalog.js", "utf8");
const adminCss = fs.readFileSync("admin-store-catalog.css", "utf8");

test("promotion presentation is bounded, server-time-derived and progressive", () => {
  assert.match(store, /campaignTheme/);
  assert.match(store, /campaignEffect/);
  assert.match(store, /service_package_sell_end_at/);
  assert.match(store, /remaining <= 0/);
  assert.match(store, /clearCampaignCountdowns/);
  assert.doesNotMatch(store, /innerHTML\s*=\s*item\.promotion/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(admin, /promotion_theme_preset/);
  assert.match(admin, /promotion_effect_preset/);
  assert.match(admin, /asc-mobile-preview/);
  assert.match(admin, /bm_images/);
});

test("existing Homepage Featured Services reuses the parent campaign presentation without a second rotator", () => {
  assert.match(ui, /featuredCampaignPresentation/);
  assert.match(ui, /homepage-service-card campaign-theme-\$\{campaign\.theme\} campaign-effect-\$\{campaign\.effect\}/);
  assert.match(ui, /root\.store\?\.campaignPresentation\?\.bind\?\.\(container\)/);
  assert.match(ui, /root\.store\?\.campaignPresentation\?\.clear\?\.\(\)/);
  assert.match(ui, /item\.booking_mode === "service_package"[\s\S]*routeTo\(`storeItem-\$\{id\}`\)/);
  assert.doesNotMatch(ui, /service-package-(banner|carousel|rotator)/i);
});

test("countdown lifecycle pauses while hidden and disposes disconnected nodes", () => {
  const listeners = new Map();
  const timers = new Map();
  let timerId = 0;
  const document = {
    hidden: false,
    addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(handler); },
    removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
  };
  const context = vm.createContext({
    window: { CWFCustomerAppV2: {} }, document, console,
    Date, Intl, URL, URLSearchParams, BigInt,
    setTimeout(handler) { const id = ++timerId; timers.set(id, handler); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(handler) { return handler(); },
  });
  vm.runInContext(store, context, { filename: "customer-app/modules/store.js" });
  const node = {
    isConnected: true,
    textContent: "",
    getAttribute() { return new Date(Date.now() + 120000).toISOString(); },
    closest() { return { querySelectorAll() { return []; } }; },
  };
  context.window.CWFCustomerAppV2.store._test.bindCampaignCountdowns({ querySelectorAll() { return [node]; } });
  assert.equal(listeners.get("visibilitychange")?.size, 1);
  assert.equal(timers.size, 1);
  document.hidden = true;
  for (const handler of listeners.get("visibilitychange")) handler();
  assert.equal(timers.size, 0);
  document.hidden = false;
  for (const handler of listeners.get("visibilitychange")) handler();
  assert.equal(timers.size, 1);
  node.isConnected = false;
  const scheduled = Array.from(timers.values())[0];
  scheduled();
  assert.equal(listeners.get("visibilitychange")?.size, 0);
  assert.equal(timers.size, 0);
});

test("Admin live preview and customer presentation cover reduced motion and 360/390 widths", () => {
  assert.match(admin, /bindAdminCampaignPreview\("cm"\)/);
  assert.match(admin, /bindAdminCampaignPreview\("bm"\)/);
  assert.match(admin, /cm_campaign_preview/);
  assert.match(admin, /bm_campaign_preview/);
  assert.match(adminCss, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@media \(max-width: 390px\)[\s\S]*store-campaign-presentation/);
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*store-campaign-presentation/);
  assert.match(css, /homepage-service-action,[\s\S]*min-height:\s*44px/);
});
