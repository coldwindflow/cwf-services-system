"use strict";

const { normalizeServiceType, normalizeAcType, normalizeWashKey, normalizeWashVariantLabel } = require("../../normalizers");

const AXS_PACKAGE_PRICES = Object.freeze({
  normal: Object.freeze({ 1: 499, 2: 899, 3: 1299, 4: 1699 }),
  premium: Object.freeze({ 1: 799, 2: 1499, 3: 2199, 4: 2799 }),
});
const AXS_HIGH_BTU_SURCHARGE = Object.freeze({ normal: 100, premium: 150 });

class AxsPricingError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "AxsPricingError";
    this.code = code;
    this.statusCode = 400;
  }
}

function normalizedLines(payload = {}) {
  const source = Array.isArray(payload.services) && payload.services.length ? payload.services : [payload];
  return source.map((raw) => ({
    job_type: normalizeServiceType(raw.job_type || payload.job_type || ""),
    ac_type: normalizeAcType(raw.ac_type || payload.ac_type || ""),
    wash_variant: normalizeWashVariantLabel(raw.wash_variant || payload.wash_variant || ""),
    wash_key: normalizeWashKey(normalizeWashVariantLabel(raw.wash_variant || payload.wash_variant || "")),
    btu: Number(raw.btu || payload.btu || 0),
    machine_count: Math.max(1, Math.round(Number(raw.machine_count || payload.machine_count || 1) || 1)),
  }));
}

function quoteAxsCleaning(payload = {}) {
  const lines = normalizedLines(payload);
  if (!lines.length) throw new AxsPricingError("AXS_SERVICE_REQUIRED");
  const washJob = normalizeServiceType("clean");
  const wall = normalizeAcType("wall");
  for (const line of lines) {
    if (line.job_type !== washJob || line.ac_type !== wall || !["normal", "premium"].includes(line.wash_key)) {
      throw new AxsPricingError("AXS_SERVICE_NOT_PRICED", "AXS pricing currently supports wall AC STANDARD/PREMIUM cleaning only");
    }
    if (!(line.btu > 0 && (line.btu <= 12000 || line.btu >= 18000))) {
      throw new AxsPricingError("AXS_BTU_NOT_PRICED", "AXS pricing requires BTU <=12,000 or >=18,000");
    }
  }
  const variants = new Set(lines.map((line) => line.wash_key));
  if (variants.size !== 1) throw new AxsPricingError("AXS_MIXED_WASH_VARIANT_NOT_PRICED");
  const washKey = lines[0].wash_key;
  const quantity = lines.reduce((sum, line) => sum + line.machine_count, 0);
  if (!AXS_PACKAGE_PRICES[washKey][quantity]) {
    throw new AxsPricingError("AXS_PROMO_QUANTITY_UNSUPPORTED", "AXS promotion is defined for 1-4 machines per booking");
  }
  const highBtuCount = lines.reduce((sum, line) => sum + (line.btu >= 18000 ? line.machine_count : 0), 0);
  const base = AXS_PACKAGE_PRICES[washKey][quantity];
  const surcharge = AXS_HIGH_BTU_SURCHARGE[washKey] * highBtuCount;
  const total = base + surcharge;
  return { wash_key: washKey, quantity, high_btu_count: highBtuCount, base_price: base, surcharge, total };
}

function buildAxsServiceLineItems(payload = {}) {
  const quote = quoteAxsCleaning(payload);
  const lines = normalizedLines(payload);
  let allocated = 0;
  return lines.map((line, index) => {
    const label = quote.wash_key === "premium" ? "ล้างพรีเมียม" : "ล้างธรรมดา";
    const isLast = index === lines.length - 1;
    const proportionalBase = isLast
      ? quote.base_price - allocated
      : Math.round((quote.base_price * line.machine_count / quote.quantity) * 100) / 100;
    allocated += proportionalBase;
    const lineSurcharge = (line.btu >= 18000 ? AXS_HIGH_BTU_SURCHARGE[quote.wash_key] : 0) * line.machine_count;
    const lineTotal = proportionalBase + lineSurcharge;
    return {
      item_id: null,
      // Keep the persisted service item in the same canonical contract consumed by bookingJobUnits.
      // Brand identity/pricing remains in dedicated fields instead of overloading item_name.
      item_name: `ล้างแอร์ผนัง • ${label} • ${line.btu} BTU • ${line.machine_count} เครื่อง`,
      qty: line.machine_count,
      unit_price: lineTotal / line.machine_count,
      line_total: lineTotal,
      normal_unit_price: lineTotal / line.machine_count,
      customer_price_label: "โปรโมชั่นเปิดร้าน AXS Air Service",
      customer_campaign_name: "AXS Air Service Opening Promotion",
      customer_price_source: "axs_brand_policy",
      is_service: true,
    };
  });
}

function assertAxsBookingPricingInputs(body = {}) {
  if (body.promotion_id) throw new AxsPricingError("AXS_GLOBAL_PROMOTION_NOT_ALLOWED");
  if (body.catalog_item_id) throw new AxsPricingError("AXS_GLOBAL_CATALOG_NOT_ALLOWED");
  if (body.service_package_key || body.service_package_tier_key || body.service_package_groups || body.service_package_id || body.service_package_tier_id) {
    throw new AxsPricingError("AXS_GLOBAL_PACKAGE_NOT_ALLOWED");
  }
  if (Number(body.override_price || 0) > 0) throw new AxsPricingError("AXS_PRICE_OVERRIDE_NOT_ALLOWED");
  if (Array.isArray(body.items) && body.items.length) throw new AxsPricingError("AXS_GLOBAL_EXTRA_ITEMS_NOT_ALLOWED");
}

module.exports = { AXS_PACKAGE_PRICES, AXS_HIGH_BTU_SURCHARGE, AxsPricingError, quoteAxsCleaning, buildAxsServiceLineItems, assertAxsBookingPricingInputs };
