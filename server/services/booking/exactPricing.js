"use strict";

function decimalMinor(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value == null ? "" : value).trim());
  if (!match) return null;
  return (BigInt(match[1]) * 100n) + BigInt(String(match[2] || "").padEnd(2, "0"));
}

function minorText(value) {
  const minor = BigInt(value);
  return `${minor / 100n}.${String(minor % 100n).padStart(2, "0")}`;
}

function decimalRatio(value) {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value == null ? "" : value).trim());
  if (!match) return null;
  const fraction = String(match[2] || "");
  return {
    numerator: BigInt(`${match[1]}${fraction}`),
    denominator: 10n ** BigInt(fraction.length),
  };
}

function divideRounded(numerator, denominator) {
  if (denominator <= 0n) return 0n;
  return (numerator + (denominator / 2n)) / denominator;
}

function calcBookingPricing(items, promo) {
  const subtotalMinor = (Array.isArray(items) ? items : []).reduce((sum, item) => {
    const authoritative = decimalMinor(item.line_total);
    if (authoritative != null) return sum + authoritative;
    const quantity = Math.max(0, Number(item.qty || 0));
    const unitMinor = decimalMinor(item.unit_price);
    if (Number.isSafeInteger(quantity) && unitMinor != null) return sum + (BigInt(quantity) * unitMinor);
    const unitPrice = Math.max(0, Number(item.unit_price || 0));
    return sum + BigInt(Math.round(quantity * unitPrice * 100));
  }, 0n);
  let discountMinor = 0n;
  if (promo) {
    if (promo.promo_type === "percent") {
      const ratio = decimalRatio(promo.promo_value);
      if (ratio) discountMinor = divideRounded(subtotalMinor * ratio.numerator, 100n * ratio.denominator);
    }
    if (promo.promo_type === "amount") discountMinor = decimalMinor(promo.promo_value) || 0n;
  }
  const totalMinor = subtotalMinor > discountMinor ? subtotalMinor - discountMinor : 0n;
  const subtotalExact = minorText(subtotalMinor);
  const discountExact = minorText(discountMinor);
  const totalExact = minorText(totalMinor);
  return {
    subtotal_exact: subtotalExact,
    discount_exact: discountExact,
    total_exact: totalExact,
    // Legacy numeric fields remain for old callers only. Exact *_exact fields
    // are the authoritative booking/HTTP/persistence contract.
    subtotal: Number(subtotalExact),
    discount: Number(discountExact),
    total: Number(totalExact),
  };
}

module.exports = { decimalMinor, minorText, calcBookingPricing };
