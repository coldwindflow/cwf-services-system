const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const REPO_ROOT = path.resolve(__dirname, "..");

function file(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function makeContainer() {
  return {
    html: "",
    dataset: {},
    set innerHTML(value) { this.html = String(value || ""); },
    get innerHTML() { return this.html; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    scrollIntoView() {},
  };
}

function makeContext() {
  const window = {
    CWFCustomerAppV2: {},
    dataLayer: [],
    location: { protocol: "https:", origin: "https://app.example.test", pathname: "/customer-app/", search: "", hash: "" },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  };
  const context = {
    window,
    document: {
      body: { classList: { add() {}, remove() {} } },
      addEventListener() {},
      createElement(tagName) {
        return { tagName: String(tagName || "").toUpperCase(), className: "", dataset: {}, textContent: "" };
      },
      querySelector() { return null; },
      querySelectorAll() { return []; },
    },
    navigator: {},
    history: { replaceState() {} },
    Element: function Element() {},
    URL,
    URLSearchParams,
    Intl,
    Date,
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(fn) { return setTimeout(fn, 0); },
  };
  context.globalThis = context;
  return vm.createContext(context);
}

function load(modules) {
  const context = makeContext();
  for (const modulePath of modules) {
    vm.runInContext(file(modulePath), context, { filename: modulePath });
  }
  return { context, root: context.window.CWFCustomerAppV2 };
}

function loadStore() {
  const { root } = load([
    "customer-app/modules/state.js",
    "customer-app/modules/utils.js",
    "customer-app/modules/analytics.js",
    "customer-app/modules/services.js",
    "customer-app/modules/store.js",
  ]);
  root.router = {
    routeParam(route) {
      const m = /^storeItem-(\S+)$/.exec(String(route || ""));
      return m ? m[1] : "";
    },
  };
  root.utils.routeTo = (route) => { root.state.currentRoute = route; };
  root.ui = { openContactSheet() {} };
  return root;
}

function wallWashItem(overrides) {
  return Object.assign({
    item_id: 101,
    item_name: "ล้างแอร์ผนัง 12000 BTU",
    item_category: "clean",
    booking_mode: "bookable",
    booking_ac_type: "ผนัง",
    booking_btu: 12000,
    booking_wash_variant: "ล้างธรรมดา",
    short_description: "สรุปบริการ A",
    long_description: "รายละเอียดบริการ A",
    service_conditions: "เงื่อนไข A",
    ac_type: "ผนัง",
    highlights: ["จุดเด่น A"],
    images: ["a1.jpg"],
    active_price: 500,
    normal_price: 500,
    unit_label: "เครื่อง",
    rating_average: 4.5,
    review_count: 3,
    booking_count: 10,
  }, overrides || {});
}

async function renderDetailFor(root, allItems, routeItemId) {
  root.state.setCollection("catalog", { status: "success", items: allItems, error: "" });
  root.state.currentRoute = `storeItem-${routeItemId}`;
  const itemsById = new Map(allItems.map((it) => [String(it.item_id), it]));
  const reviewsByItemId = (id) => {
    const it = itemsById.get(String(id));
    const hasReviews = Number.isFinite(it?.rating_average) && it.rating_average >= 1 && it.review_count > 0;
    return hasReviews
      ? { reviews: [], total: it.review_count, rating_average: it.rating_average, review_count: it.review_count }
      : { reviews: [], total: 0, rating_average: null, review_count: 0 };
  };
  root.api = {
    loadCatalogItems: async () => ({ items: allItems }),
    loadCatalogItem: async (id) => itemsById.get(String(id)),
    loadCatalogItemReviews: async (id) => reviewsByItemId(id),
    loadReviewEligibility: async () => ({ eligible: false, eligible_jobs: [] }),
  };
  const container = makeContainer();
  root.store.renderDetail(container);
  await root.store._test.loadDetail(container, String(routeItemId));
  await root.store._test.loadReviewsList(container, itemsById.get(String(routeItemId)));
  // The fake DOM's querySelector always returns null (no real layout
  // engine), so the patchDetailBody/patchReviewsSection in-place DOM mutation
  // is a no-op here -- but root.state.storeDetail.data and reviewsState are
  // real, so render the body straight from that state, exactly as
  // patchDetailBody would have, to assert on actual rendered output.
  return root.store._test.renderDetailBody();
}

test("product detail page reloads every section (name, image, price, descriptions, highlights, ac type, conditions) from the routed item, not a partial display overlay", async () => {
  const root = loadStore();
  const itemA = wallWashItem({ item_id: 101, item_name: "ล้างแอร์ผนัง 9000 BTU", booking_btu: 9000, active_price: 400, normal_price: 400, long_description: "รายละเอียด A", service_conditions: "เงื่อนไข A", highlights: ["จุดเด่น A"], images: ["a.jpg"] });
  const itemB = wallWashItem({ item_id: 102, item_name: "ล้างแอร์ผนัง 18000 BTU", booking_btu: 18000, active_price: 700, normal_price: 700, long_description: "รายละเอียด B", service_conditions: "เงื่อนไข B", highlights: ["จุดเด่น B"], images: ["b.jpg"] });

  const htmlA = await renderDetailFor(root, [itemA, itemB], itemA.item_id);
  assert.match(htmlA, /ล้างแอร์ผนัง 9000 BTU/);
  assert.match(htmlA, /รายละเอียด A/);
  assert.match(htmlA, /เงื่อนไข A/);
  assert.match(htmlA, /จุดเด่น A/);
  assert.doesNotMatch(htmlA, /รายละเอียด B/);

  // Simulate clicking the sibling BTU variant option: this must route to the
  // sibling's own URL and reload the *entire* page from that fetch, not swap
  // a price-only overlay on top of itemA.
  const htmlB = await renderDetailFor(root, [itemA, itemB], itemB.item_id);
  assert.match(htmlB, /ล้างแอร์ผนัง 18000 BTU/);
  assert.match(htmlB, /รายละเอียด B/);
  assert.match(htmlB, /เงื่อนไข B/);
  assert.match(htmlB, /จุดเด่น B/);
  assert.doesNotMatch(htmlB, /รายละเอียด A/);
});

test("the variant-option click handler routes via root.utils.routeTo to the sibling's own storeItem URL", () => {
  const storeSource = file("customer-app/modules/store.js");
  const handlerBlock = storeSource.match(/\[data-store-variant-option\]"\)\.forEach[\s\S]*?\n\s*\}\);\s*\n\s*\}\);/)[0];
  assert.match(handlerBlock, /root\.utils\.routeTo\(`storeItem-\$\{id\}`\)/);
  assert.doesNotMatch(storeSource, /selectedVariantItemId/, "must not maintain a separate selected-variant overlay state");
});

test("the detail book button resolves the booking draft from the currently routed item, matching the displayed price/BTU", async () => {
  const root = loadStore();
  const itemA = wallWashItem({ item_id: 201, booking_btu: 9000 });
  const itemB = wallWashItem({ item_id: 202, booking_btu: 24000 });
  await renderDetailFor(root, [itemA, itemB], itemB.item_id);

  const item = root.state.storeDetail.data;
  assert.equal(Number(item.item_id), 202);
  const draftItem = root.services.catalogItemToCommerceDraft(item);
  assert.ok(draftItem, "bookable wall+wash item with a real btu/wash_variant must produce a draft");
  assert.equal(draftItem.draft.btu, 24000);
});

test("services.js exposes a single catalogItemToCommerceDraft adapter; store.js never hand-builds a booking draft", () => {
  const storeSource = file("customer-app/modules/store.js");
  const servicesSource = file("customer-app/modules/services.js");
  const adapterDefMatches = servicesSource.match(/function catalogItemToCommerceDraft\(/g) || [];
  assert.equal(adapterDefMatches.length, 1, "catalogItemToCommerceDraft must be the single legacy-bookable adapter");
  const storeCallSites = storeSource.match(/root\.services\.catalogItemToCommerceDraft\(/g) || [];
  assert.ok(storeCallSites.length >= 1, "the detail book button must route through the shared adapter");
  assert.ok(!/draft:\s*\{[^}]*booking_ac_type/.test(storeSource), "store.js must not hand-construct a booking draft from booking_ac_type");
  assert.ok(!storeSource.includes("createServiceLine("), "store.js must not call createServiceLine() directly -- only the shared adapter does");
});

test("catalogItemToCommerceDraft deterministically infers a missing wash_variant from unambiguous item-name keywords, never overriding a real value", () => {
  const { root } = load(["customer-app/modules/services.js"]);

  const premiumNoVariant = wallWashItem({ item_id: 1, item_name: "ล้างแอร์ผนังพรีเมียม", booking_wash_variant: null });
  const draft1 = root.services.catalogItemToCommerceDraft(premiumNoVariant);
  assert.ok(draft1, "must infer ล้างพรีเมียม from the name keyword instead of refusing");
  assert.equal(draft1.draft.wash_variant, "ล้างพรีเมียม");

  const overhaulNoVariant = wallWashItem({ item_id: 2, item_name: "ตัดล้างใหญ่แอร์ผนัง", booking_wash_variant: "" });
  const draft2 = root.services.catalogItemToCommerceDraft(overhaulNoVariant);
  assert.ok(draft2);
  assert.equal(draft2.draft.wash_variant, "ล้างแบบตัดล้าง");

  const explicitWins = wallWashItem({ item_id: 3, item_name: "ล้างแอร์ผนังพรีเมียม", booking_wash_variant: "ล้างธรรมดา" });
  const draft3 = root.services.catalogItemToCommerceDraft(explicitWins);
  assert.equal(draft3.draft.wash_variant, "ล้างธรรมดา", "a real booking_wash_variant must never be overridden by name-keyword inference");

  const ambiguousNoVariant = wallWashItem({ item_id: 4, item_name: "ล้างแอร์ผนังทั่วไป (ไม่ระบุวิธี)", booking_wash_variant: null });
  assert.equal(root.services.catalogItemToCommerceDraft(ambiguousNoVariant), null, "must still refuse, not guess, when no fixed keyword matches");
});

test("catalogItemToCommerceDraft still refuses to fabricate a draft for unsupported ac_type/btu", () => {
  const { root } = load(["customer-app/modules/services.js"]);
  const badAcType = wallWashItem({ item_id: 5, booking_ac_type: "ไม่รองรับ" });
  assert.equal(root.services.catalogItemToCommerceDraft(badAcType), null);
  const badBtu = wallWashItem({ item_id: 6, booking_btu: 99999 });
  assert.equal(root.services.catalogItemToCommerceDraft(badBtu), null);
  const notBookable = wallWashItem({ item_id: 7, booking_mode: "contact" });
  assert.equal(root.services.catalogItemToCommerceDraft(notBookable), null);
});

test("product detail review summary shows an honest empty state with no stars and no (0) count when there are no real reviews yet", async () => {
  const root = loadStore();
  const item = wallWashItem({ item_id: 301, rating_average: null, review_count: 0 });
  const html = await renderDetailFor(root, [item], item.item_id);
  const reviewsSectionHtml = html.match(/<div class="store-detail-section store-reviews-section"[\s\S]*?<\/div>\s*<div class="store-detail-cta-bar">/)[0];
  assert.match(reviewsSectionHtml, /ยังไม่มีรีวิวจากลูกค้าสำหรับบริการนี้/);
  assert.doesNotMatch(reviewsSectionHtml, /<span class="store-rating-count">\(0\)<\/span>/);
  assert.doesNotMatch(reviewsSectionHtml, /store-rating-stars/, "the reviews summary empty state must show text only, not an empty/outline star row");
});

test("product detail shows real stars and count once reviews exist", async () => {
  const root = loadStore();
  const item = wallWashItem({ item_id: 302, rating_average: 4.6, review_count: 8 });
  const html = await renderDetailFor(root, [item], item.item_id);
  assert.match(html, /store-rating-stars/);
  assert.match(html, /<span class="store-rating-count">\(8\)<\/span>/);
});
