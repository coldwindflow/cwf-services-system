"use strict";

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
    item: {
      item_id: null,
      item_name: serviceItemName(line, btu),
      qty: quantity,
      unit_price: fixedTotal,
      line_total: fixedTotal,
      is_service: true,
      customer_price_source: "service_package",
    },
  };
}

async function resolvePackageBooking({ body, bookingMode, appointmentDatetime, resolver }) {
  const request = packageRequest(body);
  if (!request) return null;
  if (bookingMode !== "scheduled") throw packageError("PACKAGE_URGENT_UNSUPPORTED", 400);
  try {
    const selection = await resolver.resolveSelection(request, { identity: "customer" });
    return canonicalizeSelection(selection, body, appointmentDatetime);
  } catch (error) {
    if (error?.statusCode) throw error;
    const code = Object.hasOwn(PACKAGE_ERROR_STATUS, error?.code) ? error.code : "PACKAGE_UNAVAILABLE";
    throw packageError(code, PACKAGE_ERROR_STATUS[code] || 409);
  }
}

module.exports = { packageRequest, canonicalizeSelection, resolvePackageBooking };
