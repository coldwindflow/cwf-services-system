"use strict";

function decimalMinor(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value == null ? "" : value).trim());
  if (!match) return null;
  return (BigInt(match[1]) * 100n) + BigInt(String(match[2] || "").padEnd(2, "0"));
}

function minorNumber(value) { return Number(value) / 100; }

function calcBookingPricing(items, promo) {
  const subtotalMinor = (Array.isArray(items) ? items : []).reduce((sum, item) => {
    const authoritative = decimalMinor(item.line_total);
    if (authoritative != null) return sum + authoritative;
    const quantity = Math.max(0, Number(item.qty || 0));
    const unitPrice = Math.max(0, Number(item.unit_price || 0));
    return sum + BigInt(Math.round(quantity * unitPrice * 100));
  }, 0n);
  const subtotal = minorNumber(subtotalMinor);
  let discount = 0;
  if (promo) {
    const value = Number(promo.promo_value || 0);
    if (promo.promo_type === "percent") discount = subtotal * (Math.max(0, value) / 100);
    if (promo.promo_type === "amount") discount = Math.max(0, value);
  }
  const roundedDiscount = Number(discount.toFixed(2));
  return { subtotal, discount: roundedDiscount, total: Number(Math.max(0, subtotal - roundedDiscount).toFixed(2)) };
}

module.exports = { decimalMinor, calcBookingPricing };
