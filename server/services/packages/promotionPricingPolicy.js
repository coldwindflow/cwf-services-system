"use strict";

const PRICING_STRATEGIES = Object.freeze({
  PER_VARIANT_TIER: "per_variant_tier",
  TOTAL_QUANTITY_PLUS_MODIFIERS: "total_quantity_tier_plus_unit_modifiers",
});
const SELECTION_MODES = Object.freeze({
  MULTI_VARIANT: "multi_variant",
  EXCLUSIVE_LEVEL: "exclusive_level",
});
const PAYMENT_MODES = Object.freeze({
  BOOK_NOW: "book_now",
  PREPAID_FULL: "prepaid_full",
});

function strategy(bundle) {
  return String(bundle?.service_package_pricing_strategy || PRICING_STRATEGIES.PER_VARIANT_TIER);
}

function selectionMode(bundle) {
  return String(bundle?.service_package_selection_mode || SELECTION_MODES.MULTI_VARIANT);
}

function paymentMode(bundle) {
  return String(bundle?.service_package_payment_mode || PAYMENT_MODES.BOOK_NOW);
}

function maximumTotalQuantity(bundle, publicMaximum = 99) {
  if (bundle?.service_package_maximum_total_quantity == null || bundle.service_package_maximum_total_quantity === "") {
    return publicMaximum;
  }
  const value = Number(bundle.service_package_maximum_total_quantity);
  if (!Number.isSafeInteger(value) || value < 1 || value > publicMaximum) return publicMaximum;
  return value;
}

function warrantyDays(bundle) {
  if (bundle?.service_package_warranty_days == null || bundle.service_package_warranty_days === "") return null;
  const value = Number(bundle.service_package_warranty_days);
  return Number.isSafeInteger(value) && value >= 1 && value <= 3650 ? value : null;
}

function activeExactTier(variant, quantity, parseMoney) {
  const tiers = (Array.isArray(variant?.tiers) ? variant.tiers : [])
    .filter((tier) => tier.is_active !== false && Number(tier.service_quantity) === quantity)
    .map((tier) => ({ tier, price: parseMoney(tier.fixed_total_price) }))
    .sort((a, b) => a.price === b.price
      ? Number(a.tier.sort_order || 0) - Number(b.tier.sort_order || 0)
      : (a.price < b.price ? -1 : 1));
  return tiers[0] || null;
}

function allocateBaseAcrossGroups(baseMinor, groups) {
  const totalQuantity = groups.reduce((sum, group) => sum + group.quantity, 0);
  const divisor = BigInt(totalQuantity);
  const unit = baseMinor / divisor;
  let remainder = baseMinor % divisor;
  return groups.map((group) => {
    const quantityMinor = BigInt(group.quantity);
    const extra = remainder > quantityMinor ? quantityMinor : remainder;
    remainder -= extra;
    return (unit * quantityMinor) + extra;
  });
}

function resolveTotalQuantityTierPlusModifiers({ bundle, groups, byKey, parseMoney, formatMoney, fail }) {
  if (strategy(bundle) !== PRICING_STRATEGIES.TOTAL_QUANTITY_PLUS_MODIFIERS) return null;
  const totalQuantity = groups.reduce((sum, group) => sum + group.quantity, 0);
  const max = maximumTotalQuantity(bundle);
  if (totalQuantity > max) fail("SERVICE_PACKAGE_MAXIMUM_QUANTITY_EXCEEDED", 400);

  const selected = groups.map((group) => ({ group, variant: byKey.get(group.packageKey) }));
  if (selected.some(({ variant }) => !variant)) fail("SERVICE_PACKAGE_NOT_AVAILABLE", 404);

  let levelKey = null;
  if (selectionMode(bundle) === SELECTION_MODES.EXCLUSIVE_LEVEL) {
    const levels = new Set(selected.map(({ variant }) => String(variant.service_level_key || "").trim()));
    if (levels.size !== 1 || levels.has("")) fail("SERVICE_PACKAGE_LEVEL_SELECTION_REQUIRED", 400);
    levelKey = [...levels][0];
  }

  const exactTiers = selected.map(({ variant }) => activeExactTier(variant, totalQuantity, parseMoney));
  if (exactTiers.some((entry) => !entry)) fail("SERVICE_PACKAGE_TOTAL_TIER_REQUIRED", 409);
  const basePrices = new Set(exactTiers.map((entry) => entry.price.toString()));
  if (basePrices.size !== 1) fail("SERVICE_PACKAGE_LEVEL_TIER_MISMATCH", 409);
  const baseMinor = exactTiers[0].price;
  const baseShares = allocateBaseAcrossGroups(baseMinor, groups);

  let modifierTotal = 0n;
  const pricedGroups = selected.map(({ group, variant }, index) => {
    let modifierMinor;
    try { modifierMinor = parseMoney(String(variant.unit_price_modifier ?? "0.00")); }
    catch (_) { fail("INVALID_PACKAGE_MODIFIER", 409); }
    const modifierLine = modifierMinor * BigInt(group.quantity);
    modifierTotal += modifierLine;
    const lineTotalMinor = baseShares[index] + modifierLine;
    return {
      group,
      variant,
      tier: exactTiers[index].tier,
      baseShareMinor: baseShares[index],
      modifierMinor,
      modifierLineMinor: modifierLine,
      lineTotalMinor,
      lineTotal: formatMoney(lineTotalMinor),
    };
  });

  return {
    pricingStrategy: PRICING_STRATEGIES.TOTAL_QUANTITY_PLUS_MODIFIERS,
    selectionMode: selectionMode(bundle),
    serviceLevelKey: levelKey,
    serviceLevelLabel: selected[0]?.variant?.service_level_label || null,
    totalQuantity,
    maximumTotalQuantity: max,
    baseTotalMinor: baseMinor,
    modifierTotalMinor: modifierTotal,
    fixedTotalMinor: baseMinor + modifierTotal,
    fixedTotal: formatMoney(baseMinor + modifierTotal),
    pricedGroups,
  };
}

module.exports = {
  PRICING_STRATEGIES,
  SELECTION_MODES,
  PAYMENT_MODES,
  strategy,
  selectionMode,
  paymentMode,
  maximumTotalQuantity,
  warrantyDays,
  activeExactTier,
  allocateBaseAcrossGroups,
  resolveTotalQuantityTierPlusModifiers,
};
