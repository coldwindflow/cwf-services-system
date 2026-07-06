(function initAdminJobEditPriceState(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CWFAdminJobEditPriceState = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function buildAdminJobEditPriceState() {
  "use strict";

  const SNAPSHOT_FIELDS = [
    "client_row_id",
    "is_saved_row",
    "item_id",
    "item_name",
    "job_type_key",
    "job_type",
    "ac_type_key",
    "wash_type_key",
    "repair_type_key",
    "repair_detail",
    "btu_tier",
    "qty",
    "unit_price",
    "price_overridden",
    "used_standard_price",
    "duration_min",
    "pricing_payload",
    "auto_unit_price",
    "auto_line_total",
    "pricing_generation",
    "latest_pricing_request_id",
    "assigned_technician_username",
    "is_standard",
  ];

  function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (value && typeof value === "object") return { ...value };
    return value;
  }

  function snapshotRow(row) {
    const out = {};
    for (const key of SNAPSHOT_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(row || {}, key)) out[key] = cloneValue(row[key]);
    }
    return out;
  }

  function restoreRow(row, snapshot) {
    if (!row || !snapshot) return row;
    for (const key of Object.keys(row)) {
      if (SNAPSHOT_FIELDS.includes(key) && !Object.prototype.hasOwnProperty.call(snapshot, key)) {
        delete row[key];
      }
    }
    for (const key of Object.keys(snapshot)) row[key] = cloneValue(snapshot[key]);
    return row;
  }

  function parseMachineCountFromName(name) {
    const match = String(name || "").match(/(\d+)\s*เครื่อง/);
    const count = match ? Number(match[1]) : 0;
    return Number.isFinite(count) && count > 1 ? count : 0;
  }

  function normalizeLegacyServiceRow(row) {
    const next = { ...(row || {}) };
    const machineCount = parseMachineCountFromName(next.item_name);
    const qty = Number(next.qty || 0);
    const unit = Number(next.unit_price || 0);
    const total = (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(unit) ? unit : 0);
    if (machineCount >= 2 && qty === 1 && total > 0) {
      next.qty = machineCount;
      next.unit_price = Number((total / machineCount).toFixed(2));
    }
    return next;
  }

  function invalidatePricingRequests(row) {
    if (!row) return 0;
    row.pricing_generation = Number(row.pricing_generation || 0) + 1;
    row.latest_pricing_request_id = null;
    return row.pricing_generation;
  }

  function markManualPrice(row, unitPrice) {
    if (!row) return row;
    invalidatePricingRequests(row);
    row.unit_price = Number(unitPrice || 0);
    row.price_overridden = true;
    row.used_standard_price = false;
    return row;
  }

  function beginPricingRequest(row, requestId, payloadKey) {
    if (!row) return null;
    const generation = Number(row.pricing_generation || 0);
    row.latest_pricing_request_id = requestId;
    return {
      rowId: row.client_row_id || null,
      requestId,
      generation,
      payloadKey: String(payloadKey || ""),
    };
  }

  function canApplyPricingResponse(row, token, currentPayloadKey) {
    if (!row || !token) return false;
    if (token.rowId && row.client_row_id !== token.rowId) return false;
    if (Number(row.pricing_generation || 0) !== Number(token.generation || 0)) return false;
    if (row.latest_pricing_request_id !== token.requestId) return false;
    if (String(currentPayloadKey || "") !== String(token.payloadKey || "")) return false;
    return true;
  }

  function finishPricingRequestFailure(row, token) {
    if (!row || !token) return false;
    if (!token.rowId || row.client_row_id !== token.rowId) return false;
    if (Number(row.pricing_generation || 0) !== Number(token.generation || 0)) return false;
    if (row.latest_pricing_request_id !== token.requestId) return false;
    row.latest_pricing_request_id = null;
    return true;
  }

  function makeSavedRow(input, clientRowId, inferAssignee) {
    const row = input && typeof input === "object" ? input : {};
    return {
      client_row_id: clientRowId,
      is_saved_row: true,
      item_id: Number(row.item_id || 0) || null,
      item_name: String(row.item_name || ""),
      qty: Number(row.qty || 1) || 1,
      unit_price: Number(row.unit_price || 0) || 0,
      pricing_generation: 0,
      assigned_technician_username: (
        String(row.assigned_technician_username || "").trim() ||
        (typeof inferAssignee === "function" ? inferAssignee(row.item_name) : "") ||
        null
      ),
    };
  }

  return {
    SNAPSHOT_FIELDS,
    snapshotRow,
    restoreRow,
    parseMachineCountFromName,
    normalizeLegacyServiceRow,
    invalidatePricingRequests,
    markManualPrice,
    beginPricingRequest,
    canApplyPricingResponse,
    finishPricingRequestFailure,
    makeSavedRow,
  };
});
