"use strict";

const { normalizeGroups, parseMoney, formatMoney, allocateUnitMoney } = require("../packages/compositeServicePackage");

const PACKAGE_ERROR_STATUS = Object.freeze({
  PACKAGE_IDENTITY_REQUIRED: 400,
  TIER_IDENTITY_REQUIRED: 400,
  PACKAGE_NOT_FOUND: 404,
  PACKAGE_INACTIVE: 409,
  PACKAGE_NOT_CUSTOMER_VISIBLE: 409,
  PACKAGE_NOT_ON_SALE: 409,
  TIER_PACKAGE_MISMATCH: 409,
  TIER_INACTIVE: 409,
  INVALID_SERVICE_CONSTRAINTS: 409,
  INVALID_PACKAGE_PRICE: 409,
});

function packageError(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = status;
  return error;
}

function packageRequest(body = {}) {
  if (Object.prototype.hasOwnProperty.call(body, "service_package_groups")) return { composite: true };
  const hasPackageKey = Object.prototype.hasOwnProperty.call(body, "service_package_key");
  const hasTierKey = Object.prototype.hasOwnProperty.call(body, "service_package_tier_key");
  const packageKey = String(body.service_package_key || "").trim();
  const tierKey = String(body.service_package_tier_key || "").trim();
  const hasNumericIdentity = body.service_package_id != null || body.service_package_tier_id != null;
  if (hasNumericIdentity) throw packageError("PACKAGE_IDENTITY_MALFORMED");
  if (!hasPackageKey && !hasTierKey) return null;
  if (!packageKey || !tierKey) throw packageError("PACKAGE_IDENTITY_MALFORMED");
  if (packageKey.length > 128 || tierKey.length > 128) throw packageError("PACKAGE_IDENTITY_MALFORMED");
  return { packageKey, tierKey };
}

function serviceItemName(line, btu) {
  const constraints = line.service_constraints;
  const parts = [];
  if (constraints.job_type === "ล้าง") {
    parts.push(`ล้างแอร์${constraints.ac_type || ""}`.trim());
    if (constraints.ac_type === "ผนัง") parts.push(constraints.wash_variant);
  } else if (constraints.job_type === "ซ่อม") {
    parts.push(`ซ่อมแอร์${constraints.ac_type || ""}`.trim());
  } else if (constraints.job_type === "ติดตั้ง") {
    parts.push(`ติดตั้งแอร์${constraints.ac_type || ""}`.trim());
  } else {
    parts.push(constraints.job_type);
  }
  parts.push(`${btu} BTU`);
  parts.push(`${line.quantity} เครื่อง`);
  return parts.join(" • ");
}

function allocateUnitPrice(fixedTotal, quantity) {
  const match = /^(\d+)\.(\d{2})$/.exec(String(fixedTotal));
  if (!match || !Number.isSafeInteger(quantity) || quantity <= 0) {
    throw packageError("INVALID_PACKAGE_PRICE", 409);
  }
  const totalMinor = (BigInt(match[1]) * 100n) + BigInt(match[2]);
  if (totalMinor <= 0n) throw packageError("INVALID_PACKAGE_PRICE", 409);
  const divisor = BigInt(quantity);
  const quotient = totalMinor / divisor;
  const remainder = totalMinor % divisor;
  const roundedMinor = quotient + (remainder * 2n >= divisor ? 1n : 0n);
  const major = roundedMinor / 100n;
  const minor = String(roundedMinor % 100n).padStart(2, "0");
  return `${major}.${minor}`;
}

function canonicalizeSelection(selection, body, appointmentDatetime) {
  const line = selection?.service_lines?.[0];
  const constraints = line?.service_constraints;
  if (!line || !constraints) throw packageError("PACKAGE_SERVICE_MISMATCH", 409);
  if ((Array.isArray(body.services) && body.services.length) || (Array.isArray(body.items) && body.items.length)) {
    throw packageError("PACKAGE_MIXING_UNSUPPORTED", 400);
  }
  const btu = Number(body.btu);
  if (!Number.isInteger(btu) || btu <= 0) throw packageError("PACKAGE_BTU_MISMATCH", 400);
  if ((constraints.btu_min != null && btu < constraints.btu_min)
      || (constraints.btu_max != null && btu > constraints.btu_max)) {
    throw packageError("PACKAGE_BTU_MISMATCH", 400);
  }
  const appointment = new Date(appointmentDatetime);
  if (!Number.isFinite(appointment.getTime())) throw packageError("PACKAGE_APPOINTMENT_INVALID", 400);
  if (selection.redeem_until && appointment > new Date(selection.redeem_until)) {
    throw packageError("PACKAGE_REDEEM_WINDOW_EXCEEDED", 409);
  }
  const quantity = Number(line.quantity);
  const unitDuration = Number(line.unit_duration_minutes);
  const fixedTotal = String(selection.fixed_total_price);
  const unitPrice = allocateUnitPrice(fixedTotal, quantity);
  const item = {
    item_id: null,
    item_name: serviceItemName(line, btu),
    qty: quantity,
    unit_price: unitPrice,
    line_total: fixedTotal,
    is_service: true,
    customer_price_source: "service_package",
  };
  return {
    packageId: String(selection.package.id),
    tierId: String(selection.tier.id),
    snapshot: selection.snapshot,
    fixedTotal,
    durationMin: quantity * unitDuration,
    payload: {
      job_type: constraints.job_type,
      ac_type: constraints.ac_type,
      btu,
      machine_count: quantity,
      wash_variant: constraints.wash_variant || "",
      repair_variant: "",
      admin_override_duration_min: 0,
    },
    item,
    items: [{ ...item, packageId: String(selection.package.id), tierId: String(selection.tier.id), snapshot: selection.snapshot }],
  };
}

async function resolvePackageBooking({ body, bookingMode, appointmentDatetime, resolver, identity = "customer" }) {
  const request = packageRequest(body);
  if (!request) return null;
  if (bookingMode !== "scheduled") throw packageError("PACKAGE_URGENT_UNSUPPORTED", 400);
  try {
    if (request.composite) {
      if (!resolver || typeof resolver.resolveComposite !== "function") throw packageError("PACKAGE_UNAVAILABLE", 409);
      return await resolver.resolveComposite({ body, bookingMode, appointmentDatetime, identity });
    }
    const selection = await resolver.resolveSelection(request, { identity });
    return canonicalizeSelection(selection, body, appointmentDatetime);
  } catch (error) {
    if (error?.statusCode) throw error;
    const code = Object.hasOwn(PACKAGE_ERROR_STATUS, error?.code) ? error.code : "PACKAGE_UNAVAILABLE";
    throw packageError(code, PACKAGE_ERROR_STATUS[code] || 409);
  }
}

function packageBookingFromSnapshot({ body, appointmentDatetime, snapshot, packageId, tierId }) {
  let request;
  try { request = packageRequest(body); } catch (_) { return null; }
  if (!request) return null;
  let selection = snapshot;
  if (typeof selection === "string") {
    try { selection = JSON.parse(selection); } catch (_) { return null; }
  }
  if (!selection || typeof selection !== "object") return null;
  if (String(selection.package?.key || "") !== request.packageKey
      || String(selection.tier?.key || "") !== request.tierKey
      || String(selection.package?.id || "") !== String(packageId || "")
      || String(selection.tier?.id || "") !== String(tierId || "")) {
    return null;
  }
  try {
    return canonicalizeSelection(selection, body, appointmentDatetime);
  } catch (_) {
    return null;
  }
}

function compositeBookingFromSnapshots({ body, snapshots }) {
  let groups;
  try { groups = normalizeGroups(body); } catch (_) { return null; }
  if (!groups || !Array.isArray(snapshots) || !snapshots.length) return null;
  const items = [];
  const storedGroups = new Map();
  let total = 0n;
  let durationMin = 0;
  let bundleKey = null;
  let bundleId = null;
  for (const row of snapshots) {
    let snapshot = row.service_package_snapshot;
    if (typeof snapshot === "string") { try { snapshot = JSON.parse(snapshot); } catch (_) { return null; } }
    if (!snapshot || snapshot.schema_version !== 2) return null;
    if (String(snapshot.package?.id) !== String(row.service_package_id)
        || String(snapshot.tier?.id) !== String(row.service_package_tier_id)) return null;
    if (bundleKey && bundleKey !== snapshot.catalog_item?.key) return null;
    bundleKey = snapshot.catalog_item?.key; bundleId = String(snapshot.catalog_item?.id || "");
    const btu = Number(snapshot.taxonomy?.selected_btu); const quantity = Number(snapshot.quantity);
    if (!bundleKey || !bundleId || !snapshot.package?.key || !Number.isInteger(btu) || !Number.isInteger(quantity) || quantity <= 0) return null;
    let price;
    try { price = parseMoney(snapshot.fixed_total_price); } catch (_) { return null; }
    total += price;
    durationMin += quantity * Number(snapshot.unit_duration_minutes || 0);
    const groupKey = `${snapshot.package.key}:${btu}`;
    storedGroups.set(groupKey, (storedGroups.get(groupKey) || 0) + quantity);
    items.push({
      item_id: bundleId, item_name: `${snapshot.package.name} • ${btu} BTU • ${quantity} เครื่อง`, qty: quantity,
      unit_price: allocateUnitMoney(price, quantity), line_total: snapshot.fixed_total_price,
      is_service: true, customer_price_source: "service_package",
      packageId: String(row.service_package_id), tierId: String(row.service_package_tier_id), snapshot,
    });
  }
  const requestedGroups = new Map();
  groups.forEach((group) => {
    const key = `${group.packageKey}:${group.btu}`;
    requestedGroups.set(key, (requestedGroups.get(key) || 0) + group.quantity);
  });
  if (storedGroups.size !== requestedGroups.size
      || [...storedGroups].some(([key, quantity]) => requestedGroups.get(key) !== quantity)) return null;
  const first = items[0].snapshot;
  return {
    bundleId, bundleKey, fixedTotal: formatMoney(total), durationMin, items,
    payload: {
      job_type: first.taxonomy.job_type, ac_type: first.taxonomy.ac_type,
      btu: groups[0].btu, machine_count: groups.reduce((sum, group) => sum + group.quantity, 0),
      wash_variant: first.taxonomy.wash_variant || "", repair_variant: "", admin_override_duration_min: 0,
      service_package_groups: groups.map((group) => ({ package_key: group.packageKey, btu: group.btu, quantity: group.quantity })),
    },
  };
}

module.exports = { packageRequest, canonicalizeSelection, resolvePackageBooking, packageBookingFromSnapshot, compositeBookingFromSnapshots };
