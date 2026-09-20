"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { quoteAxsCleaning, buildAxsServiceLineItems, assertAxsBookingPricingInputs } = require("../server/services/booking/brandPricingPolicy");
const { confirmationTemplateForJob } = require("../server/services/booking/brandConfirmationPolicy");

function payload(wash_variant, machine_count, btu=12000) {
  return { job_type:"ล้าง", ac_type:"ผนัง", wash_variant, machine_count, btu };
}

test("AXS STANDARD package prices are exact for 1-4 machines", () => {
  [499,899,1299,1699].forEach((expected, i) => assert.equal(quoteAxsCleaning(payload("ล้างธรรมดา", i+1)).total, expected));
});

test("AXS PREMIUM package prices are exact for 1-4 machines", () => {
  [799,1499,2199,2799].forEach((expected, i) => assert.equal(quoteAxsCleaning(payload("ล้างพรีเมียม", i+1)).total, expected));
});

test("AXS high-BTU surcharge is per high-BTU machine", () => {
  assert.equal(quoteAxsCleaning(payload("ล้างธรรมดา", 3, 18000)).total, 1599);
  assert.equal(quoteAxsCleaning(payload("ล้างพรีเมียม", 3, 24000)).total, 2649);
  assert.equal(quoteAxsCleaning({ services:[
    payload("ล้างธรรมดา", 2, 12000),
    payload("ล้างธรรมดา", 1, 18000),
  ]}).total, 1299 + 100);
});

test("AXS rejects undefined promo quantities, BTU gaps and mixed variants instead of falling back to CWF", () => {
  assert.throws(() => quoteAxsCleaning(payload("ล้างธรรมดา", 5)), /1-4/);
  assert.throws(() => quoteAxsCleaning(payload("ล้างธรรมดา", 1, 15000)), /BTU/);
  assert.throws(() => quoteAxsCleaning({services:[payload("ล้างธรรมดา",1),payload("ล้างพรีเมียม",1)]}), /AXS_MIXED/);
});

test("AXS booking cannot accidentally consume global CWF promotion/catalog/package/override inputs", () => {
  for (const bad of [
    {promotion_id:1}, {catalog_item_id:2}, {service_package_key:"cwf"}, {override_price:499}, {items:[{item_id:1,qty:1}]}
  ]) assert.throws(() => assertAxsBookingPricingInputs(bad), /AXS_/);
  assert.doesNotThrow(() => assertAxsBookingPricingInputs({}));
});

test("AXS service item persists exact brand-policy total", () => {
  const item = buildAxsServiceLineItems(payload("ล้างพรีเมียม", 4, 18000))[0];
  assert.equal(item.line_total, 2799 + 4*150);
  assert.equal(item.customer_price_source, "axs_brand_policy");
  assert.match(item.item_name, /AXS PREMIUM/);
});

test("confirmation is brand-aware and CWF template remains untouched", () => {
  const cwf = "Coldwindflow Air Services {{booking_code}}";
  const axs = confirmationTemplateForJob({brand_key:"axs"}, "th", cwf);
  assert.match(axs, /AXS Air Service/);
  assert.match(axs, /60 วัน/);
  assert.doesNotMatch(axs, /Coldwindflow Air Services|@cwfair|098-877-7321/);
  assert.equal(confirmationTemplateForJob({brand_key:"cwf"}, "th", cwf), cwf);
});

test("booking and summary routes are wired to persisted brand policy", () => {
  const booking = fs.readFileSync("server/services/booking/createBookingJob.js","utf8");
  const index = fs.readFileSync("index.js","utf8");
  assert.match(booking, /jobBrand\.key === "axs"[\s\S]*buildAxsServiceLineItems/);
  assert.match(booking, /assertAxsBookingPricingInputs\(body\)/);
  assert.match(index, /job_price, brand_key/);
  assert.match(index, /confirmationTemplateForJob\(job, lang, cwfTemplate\)/);
});
