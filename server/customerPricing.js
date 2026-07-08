"use strict";

const express = require("express");
const pricingHelpers = require("./pricing");
const {
  normalizeServiceType,
  normalizeAcType,
  normalizeWashVariantLabel,
  normalizeWashKey,
} = require("./normalizers");

const CAMPAIGN_NAME = "โปรดูแลแอร์รับหน้าฝน";
const CAMPAIGN_LABEL = "Rainy Season AC Cleaning";

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function intOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function boolish(value, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  const s = String(value || "").trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return fallback;
}

const SUPPORTED_JOB_TYPES = new Set([
  normalizeServiceType("clean"),
  normalizeServiceType("repair"),
  normalizeServiceType("install"),
]);
const SUPPORTED_AC_TYPES = new Set([
  normalizeAcType("wall"),
  normalizeAcType("cassette"),
  normalizeAcType("hanging"),
  normalizeAcType("concealed"),
]);
const SUPPORTED_WASH_KEYS = new Set(["normal", "premium", "coil", "overhaul"]);
const MAX_RULE_PRIORITY = 1000;
const MIN_RULE_PRIORITY = -1000;

function normalizeLine(raw = {}, fallback = {}) {
  const job_type = normalizeServiceType(raw.job_type || raw.jobType || fallback.job_type || "");
  const ac_type = normalizeAcType(raw.ac_type || raw.acType || fallback.ac_type || "");
  const wash_variant = normalizeWashVariantLabel(raw.wash_variant || raw.washVariant || fallback.wash_variant || "");
  const btu = Number(raw.btu || fallback.btu || 0);
  const machine_count = Math.max(1, Math.round(Number(raw.machine_count || raw.machineCount || fallback.machine_count || 1) || 1));
  return {
    job_type,
    ac_type,
    wash_variant,
    wash_key: normalizeWashKey(wash_variant),
    btu: Number.isFinite(btu) ? btu : 0,
    machine_count,
    repair_variant: String(raw.repair_variant || raw.repairVariant || fallback.repair_variant || "").trim(),
    assigned_to: raw.assigned_to || raw.assigned_technician_username || fallback.assigned_to || fallback.assigned_technician_username || null,
    assigned_technician_username: raw.assigned_technician_username || raw.assigned_to || fallback.assigned_technician_username || fallback.assigned_to || null,
    allocations: raw.allocations || raw.allocation || null,
  };
}

function rulePrice(value) {
  const n = Number(value);
  return Number.isFinite(n) ? money(n) : NaN;
}

function nonNegativeIntOrNullValue(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n);
}

function positiveIntOrNullValue(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return NaN;
  return Math.round(n);
}

function dateTimeOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const ts = Date.parse(String(value));
  return Number.isFinite(ts) ? ts : NaN;
}

function representativeBtuFromRange(btuMin, btuMax) {
  const hasMin = btuMin !== null && !Number.isNaN(btuMin);
  const hasMax = btuMax !== null && !Number.isNaN(btuMax);
  if (hasMin && hasMax) return btuMin > 0 ? btuMin : btuMax;
  if (hasMin) return btuMin > 0 ? btuMin : 12000;
  if (hasMax) return btuMax;
  return 24000;
}

function canonicalFallbackUnitForRule(row = {}) {
  const btu_min = nonNegativeIntOrNullValue(row.btu_min);
  const btu_max = positiveIntOrNullValue(row.btu_max);
  const line = {
    job_type: normalizeServiceType(row.job_type || ""),
    ac_type: normalizeAcType(row.ac_type || ""),
    wash_variant: normalizeWashVariantLabel(row.wash_variant || ""),
    btu: representativeBtuFromRange(btu_min, btu_max),
    machine_count: 1,
    repair_variant: row.repair_variant || row.repairVariant || "",
  };
  return money(pricingHelpers.computeStandardPrice(line));
}

function emptyCatalogLinkage(status = "verified") {
  return {
    linked_catalog_item_count: 0,
    linked_catalog_item_ids: [],
    linked_catalog_has_product: false,
    linked_catalog_has_service: false,
    linked_catalog_service_scopes: [],
    catalog_linkage_status: status,
  };
}

function catalogLinkFromRule(row = {}) {
  if (row.linked_catalog_item_count != null || row.catalog_linkage_status) {
    return {
      linked_catalog_item_count: Number(row.linked_catalog_item_count || 0),
      linked_catalog_item_ids: Array.isArray(row.linked_catalog_item_ids) ? row.linked_catalog_item_ids : [],
      linked_catalog_has_product: Boolean(row.linked_catalog_has_product),
      linked_catalog_has_service: Boolean(row.linked_catalog_has_service),
      linked_catalog_service_scopes: Array.isArray(row.linked_catalog_service_scopes) ? row.linked_catalog_service_scopes : [],
      catalog_linkage_status: row.catalog_linkage_status || "verified",
    };
  }
  const itemId = row.linked_catalog_item_id ?? row.catalog_item_id ?? row.item_id ?? null;
  if (itemId == null) return emptyCatalogLinkage();
  return {
    linked_catalog_item_count: 1,
    linked_catalog_item_ids: [itemId],
    linked_catalog_has_product: String(row.linked_catalog_item_category ?? row.catalog_item_category ?? row.item_category ?? "").trim().toLowerCase() === "product",
    linked_catalog_has_service: String(row.linked_catalog_item_category ?? row.catalog_item_category ?? row.item_category ?? "").trim().toLowerCase() === "service",
    linked_catalog_service_scopes: [{
      item_id: itemId,
      item_category: row.linked_catalog_item_category ?? row.catalog_item_category ?? row.item_category ?? null,
      job_category: row.linked_catalog_job_category ?? row.catalog_job_category ?? row.job_category ?? null,
      ac_type: row.linked_catalog_ac_type ?? row.catalog_ac_type ?? row.catalog_item_ac_type ?? null,
    }],
    catalog_linkage_status: "verified",
  };
}

function serviceRuleSafety(row = {}, options = {}) {
  const risk = new Set();
  const rawJob = String(row.job_type || "").trim();
  const rawAc = String(row.ac_type || "").trim();
  const job_type = normalizeServiceType(rawJob);
  const ac_type = normalizeAcType(rawAc);
  const wash_variant = normalizeWashVariantLabel(row.wash_variant || "");
  const wash_key = normalizeWashKey(wash_variant);
  const normal_price = rulePrice(row.normal_price);
  const active_price = rulePrice(row.active_price);
  const btu_min = nonNegativeIntOrNullValue(row.btu_min);
  const btu_max = positiveIntOrNullValue(row.btu_max);
  const machine_min = positiveIntOrNullValue(row.machine_min);
  const machine_max = positiveIntOrNullValue(row.machine_max);
  const fromTs = dateTimeOrNull(row.effective_from);
  const toTs = dateTimeOrNull(row.effective_to);
  const priority = Number(row.priority ?? 0);
  const linked = options.linkedCatalogItem || catalogLinkFromRule(row);
  const fallbackUnit = options.fallbackUnit != null ? Number(options.fallbackUnit) : canonicalFallbackUnitForRule(row);

  if (!rawJob) risk.add("MISSING_JOB_TYPE");
  else if (!SUPPORTED_JOB_TYPES.has(job_type)) risk.add("UNSUPPORTED_JOB_TYPE");
  if (!rawAc) risk.add("MISSING_AC_TYPE");
  else if (!SUPPORTED_AC_TYPES.has(ac_type)) risk.add("UNSUPPORTED_AC_TYPE");
  if (!Number.isFinite(normal_price) || normal_price <= 0 || !Number.isFinite(active_price) || active_price <= 0) {
    risk.add("INVALID_PRICE");
  } else if (active_price > normal_price) {
    risk.add("ACTIVE_PRICE_ABOVE_NORMAL");
  }
  if (!Number.isNaN(btu_min) && !Number.isNaN(btu_max) && btu_min !== null && btu_max !== null && btu_min > btu_max) risk.add("INVALID_BTU_RANGE");
  if (Number.isNaN(btu_min) || Number.isNaN(btu_max)) risk.add("INVALID_BTU_RANGE");
  if (!Number.isNaN(machine_min) && !Number.isNaN(machine_max) && machine_min !== null && machine_max !== null && machine_min > machine_max) risk.add("INVALID_MACHINE_RANGE");
  if (Number.isNaN(machine_min) || Number.isNaN(machine_max)) risk.add("INVALID_MACHINE_RANGE");
  if (Number.isNaN(fromTs) || Number.isNaN(toTs) || (fromTs !== null && toTs !== null && fromTs > toTs)) risk.add("INVALID_DATE_RANGE");
  if (!Number.isInteger(priority) || priority < MIN_RULE_PRIORITY || priority > MAX_RULE_PRIORITY) risk.add("INVALID_PRIORITY");
  if (wash_variant && !SUPPORTED_WASH_KEYS.has(wash_key)) risk.add("UNSUPPORTED_WASH_VARIANT");

  if (job_type && ac_type && fallbackUnit <= 0) risk.add("AUTO_PRICING_UNSUPPORTED");

  if (linked) {
    if (linked.catalog_linkage_status === "unverified") risk.add("CATALOG_LINKAGE_UNVERIFIED");
    if (linked.linked_catalog_has_product) risk.add("PRODUCT_RULE_LEAK");
    for (const scope of linked.linked_catalog_service_scopes || []) {
      const category = String(scope.item_category || "").trim().toLowerCase();
      if (category !== "service") continue;
      const linkedJob = normalizeServiceType(scope.job_category || "");
      const linkedAc = normalizeAcType(scope.ac_type || "");
      if (!linkedJob || !linkedAc || (job_type && linkedJob !== job_type) || (ac_type && linkedAc !== ac_type)) {
        risk.add("CATALOG_SCOPE_MISMATCH");
      }
    }
  }

  if (fallbackUnit > 0 && Number.isFinite(normal_price) && Number.isFinite(active_price)) {
    const maxSafeUnit = Math.max(fallbackUnit * 10, 10000);
    if (normal_price >= maxSafeUnit || active_price >= maxSafeUnit) risk.add("PRICE_OUTLIER");
  }

  const risk_codes = Array.from(risk);
  return {
    ok: risk_codes.length === 0,
    is_safe_for_service_pricing: risk_codes.length === 0,
    risk_codes,
    normalized: {
      job_type,
      ac_type,
      wash_variant: wash_variant || null,
      wash_key,
      normal_price,
      active_price,
      btu_min,
      btu_max,
      machine_min,
      machine_max,
      priority,
    },
    effective_scope: {
      job_type: job_type || null,
      ac_type: ac_type || null,
      wash_variant: wash_variant || null,
      btu_min: Number.isNaN(btu_min) ? null : btu_min,
      btu_max: Number.isNaN(btu_max) ? null : btu_max,
      machine_min: Number.isNaN(machine_min) ? null : machine_min,
      machine_max: Number.isNaN(machine_max) ? null : machine_max,
    },
    canonical_fallback_unit: fallbackUnit,
    linked_catalog_item_id: linked?.linked_catalog_item_ids?.[0] || null,
    linked_catalog_item_category: linked?.linked_catalog_has_product ? "product" : (linked?.linked_catalog_has_service ? "service" : null),
    linked_catalog_item_count: linked?.linked_catalog_item_count || 0,
    linked_catalog_item_ids: linked?.linked_catalog_item_ids || [],
    linked_catalog_has_product: Boolean(linked?.linked_catalog_has_product),
    linked_catalog_has_service: Boolean(linked?.linked_catalog_has_service),
    catalog_linkage_status: linked?.catalog_linkage_status || "verified",
  };
}

function rejectRuleLog(row, safety, line) {
  try {
    console.warn("[customer_pricing] rejected unsafe service price rule", {
      rule_id: row?.rule_id || null,
      risk_codes: safety?.risk_codes || [],
      job_type: line?.job_type || null,
      ac_type: line?.ac_type || null,
      wash_key: line?.wash_key || null,
    });
  } catch (_) {}
}

function servicesFromPayload(payload = {}) {
  const services = Array.isArray(payload.services) ? payload.services : null;
  if (services && services.length) {
    return services.map((s) => normalizeLine(s, payload)).filter((s) => s.job_type && s.ac_type);
  }
  const line = normalizeLine(payload, payload);
  return line.job_type ? [line] : [];
}

function specificity(row) {
  let score = 0;
  if (row.job_type) score += 8;
  if (row.ac_type) score += 8;
  if (row.wash_variant) score += 8;
  if (row.btu_min != null || row.btu_max != null) score += 4;
  if (row.machine_min != null || row.machine_max != null) score += 2;
  return score;
}

function rowMatches(row, line) {
  const rowJob = normalizeServiceType(row.job_type || "");
  const rowAc = normalizeAcType(row.ac_type || "");
  const rowWash = normalizeWashVariantLabel(row.wash_variant || "");
  if (rowJob && rowJob !== line.job_type) return false;
  if (rowAc && rowAc !== line.ac_type) return false;
  if (rowWash && normalizeWashKey(rowWash) !== line.wash_key) return false;
  if (row.btu_min != null && Number(line.btu || 0) < Number(row.btu_min)) return false;
  if (row.btu_max != null && Number(line.btu || 0) > Number(row.btu_max)) return false;
  if (row.machine_min != null && Number(line.machine_count || 1) < Number(row.machine_min)) return false;
  if (row.machine_max != null && Number(line.machine_count || 1) > Number(row.machine_max)) return false;
  return true;
}

function serviceItemName(line) {
  const parts = [];
  if (line.job_type === "ล้าง") {
    parts.push(`ล้างแอร์${line.ac_type || ""}`.trim());
    if (line.ac_type === "ผนัง") parts.push(line.wash_variant || "ล้างธรรมดา");
  } else if (line.job_type === "ซ่อม") {
    parts.push(`ซ่อมแอร์${line.ac_type || ""}`.trim());
    if (line.repair_variant) parts.push(line.repair_variant);
  } else if (line.job_type === "ติดตั้ง") {
    parts.push(`ติดตั้งแอร์${line.ac_type || ""}`.trim());
  } else {
    parts.push(line.job_type || "ค่าบริการ");
  }
  if (line.btu) parts.push(`${Number(line.btu || 0)} BTU`);
  parts.push(`${Math.max(1, Number(line.machine_count || 1))} เครื่อง`);
  return parts.join(" • ");
}

async function ensureCustomerPriceBookSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.customer_service_price_rules (
      rule_id BIGSERIAL PRIMARY KEY,
      job_type TEXT,
      ac_type TEXT,
      wash_variant TEXT,
      btu_min INT,
      btu_max INT,
      machine_min INT,
      machine_max INT,
      normal_price NUMERIC(12,2) DEFAULT 0,
      active_price NUMERIC(12,2) DEFAULT 0,
      label TEXT,
      campaign_name TEXT,
      campaign_copy TEXT,
      seed_key TEXT,
      effective_from TIMESTAMPTZ,
      effective_to TIMESTAMPTZ,
      is_active BOOLEAN DEFAULT TRUE,
      priority INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      updated_by TEXT
    )
  `);
  await db.query(`ALTER TABLE public.customer_service_price_rules ADD COLUMN IF NOT EXISTS campaign_copy TEXT`);
  await db.query(`ALTER TABLE public.customer_service_price_rules ADD COLUMN IF NOT EXISTS seed_key TEXT`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_customer_price_rules_lookup ON public.customer_service_price_rules(is_active, job_type, ac_type, wash_variant, priority)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_customer_price_rules_dates ON public.customer_service_price_rules(effective_from, effective_to)`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_price_rules_seed_key ON public.customer_service_price_rules(seed_key) WHERE seed_key IS NOT NULL`);
  await db.query(`ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS customer_price_rule_id BIGINT`);
  await db.query(`ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS normal_unit_price NUMERIC(12,2)`);
  await db.query(`ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS customer_price_label TEXT`);
  await db.query(`ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS customer_campaign_name TEXT`);
  await db.query(`ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS customer_price_source TEXT`);
}

async function loadRuleRows(db, options = {}) {
  const where = options.activeOnly
    ? `WHERE COALESCE(is_active, TRUE)=TRUE
         AND (effective_from IS NULL OR effective_from <= NOW())
         AND (effective_to IS NULL OR effective_to >= NOW())`
    : "";
  const r = await db.query(`
    SELECT rule_id, job_type, ac_type, wash_variant, btu_min, btu_max, machine_min, machine_max,
           normal_price, active_price, label, campaign_name, campaign_copy, seed_key, effective_from, effective_to,
           is_active, priority, created_at, updated_at, updated_by
      FROM public.customer_service_price_rules
      ${where}
     ORDER BY is_active DESC, priority DESC, job_type, ac_type, wash_variant, btu_min NULLS FIRST, rule_id DESC
  `);
  return r.rows || [];
}

function aggregateCatalogLinks(rows = [], fallbackStatus = "verified") {
  const map = new Map();
  for (const row of rows || []) {
    const id = Number(row.price_rule_id);
    if (!Number.isFinite(id)) continue;
    const current = map.get(id) || emptyCatalogLinkage("verified");
    current.linked_catalog_item_count += 1;
    current.linked_catalog_item_ids.push(row.item_id);
    const category = String(row.item_category || "").trim().toLowerCase();
    if (category === "product") current.linked_catalog_has_product = true;
    if (category === "service") current.linked_catalog_has_service = true;
    if (category === "service") {
      current.linked_catalog_service_scopes.push({
        item_id: row.item_id,
        item_category: row.item_category,
        job_category: row.job_category,
        ac_type: row.ac_type,
      });
    }
    map.set(id, current);
  }
  map.fallbackStatus = fallbackStatus;
  return map;
}

async function loadCatalogLinkageMap(db, ruleIds = []) {
  const ids = [...new Set((ruleIds || []).map((id) => Number(id)).filter(Number.isFinite))];
  if (!ids.length) return aggregateCatalogLinks([]);
  try {
    const minimal = await db.query(
      `SELECT item_id, price_rule_id
         FROM public.catalog_items
        WHERE price_rule_id = ANY($1::bigint[])`,
      [ids]
    );
    const minimalRows = minimal.rows || [];
    if (!minimalRows.length) return aggregateCatalogLinks([]);
    try {
      const full = await db.query(
        `SELECT item_id, price_rule_id, item_category, job_category, ac_type
           FROM public.catalog_items
          WHERE price_rule_id = ANY($1::bigint[])`,
        [ids]
      );
      return aggregateCatalogLinks(full.rows || []);
    } catch (e) {
      if (!["42703"].includes(String((e && e.code) || ""))) throw e;
      const map = new Map();
      for (const row of minimalRows) {
        const id = Number(row.price_rule_id);
        const current = map.get(id) || emptyCatalogLinkage("unverified");
        current.catalog_linkage_status = "unverified";
        current.linked_catalog_item_count += 1;
        current.linked_catalog_item_ids.push(row.item_id);
        map.set(id, current);
      }
      map.fallbackStatus = "verified";
      return map;
    }
  } catch (e) {
    const code = String((e && e.code) || "");
    if (["42P01", "42703"].includes(code)) {
      return aggregateCatalogLinks([], "absent");
    }
    try {
      console.warn("[customer_pricing] catalog linkage lookup failed, marking rules unverified", { code });
    } catch (_) {}
    const map = new Map();
    for (const id of ids) map.set(id, { ...emptyCatalogLinkage("unverified") });
    map.fallbackStatus = "unverified";
    return map;
  }
}

function mergeCatalogLinkage(rows = [], linkMap) {
  const status = linkMap?.fallbackStatus || "verified";
  return (rows || []).map((row) => {
    const id = Number(row.rule_id);
    const linkage = linkMap?.get?.(id) || emptyCatalogLinkage(status);
    return { ...row, ...linkage };
  });
}

async function loadCandidateRules(db) {
  const rows = await loadRuleRows(db, { activeOnly: true });
  const linkMap = await loadCatalogLinkageMap(db, rows.map((row) => row.rule_id));
  return mergeCatalogLinkage(rows, linkMap);
}

async function loadAdminRuleRows(db) {
  const rows = await loadRuleRows(db, { activeOnly: false });
  const linkMap = await loadCatalogLinkageMap(db, rows.map((row) => row.rule_id));
  return mergeCatalogLinkage(rows, linkMap);
}

async function resolveLinePrice(line, db) {
  const fallbackTotal = money(pricingHelpers.computeStandardPrice(line));
  const qty = Math.max(1, Number(line.machine_count || 1));
  const fallbackUnit = qty > 0 ? money(fallbackTotal / qty) : fallbackTotal;
  const rejected = [];
  try {
    const rows = await loadCandidateRules(db);
    const matches = rows
      .filter((row) => rowMatches(row, line))
      .map((row) => {
        const safety = serviceRuleSafety(row, { fallbackUnit });
        if (!safety.ok) {
          rejected.push({ row, safety });
          rejectRuleLog(row, safety, line);
        }
        return { row, safety };
      })
      .filter((x) => x.safety.ok)
      .sort((a, b) => (Number(b.row.priority || 0) - Number(a.row.priority || 0)) || (specificity(b.row) - specificity(a.row)) || (Number(b.row.rule_id || 0) - Number(a.row.rule_id || 0)));
    const match = matches[0]?.row || null;
    if (match) {
      const normalUnit = money(match.normal_price || match.active_price || 0);
      const activeUnit = money(match.active_price || match.normal_price || 0);
      const overlap = matches.length > 1
        && Number(matches[1].row.priority || 0) === Number(match.priority || 0)
        && specificity(matches[1].row) === specificity(match);
      return {
        normal_unit_price: normalUnit,
        active_unit_price: activeUnit,
        normal_price: money(normalUnit * qty),
        active_price: money(activeUnit * qty),
        label: match.label || null,
        campaign_name: match.campaign_name || null,
        campaign_copy: match.campaign_copy || null,
        rule_id: match.rule_id,
        source: "customer_service_price_rules",
        pricing_warning: overlap ? "OVERLAPPING_ACTIVE_RULE" : null,
        rejected_rule_id: rejected[0]?.row?.rule_id || null,
        rejected_rule_codes: rejected[0]?.safety?.risk_codes || [],
      };
    }
  } catch (e) {
    try { console.warn("[customer_pricing] DB lookup failed, using fallback:", e.message); } catch (_) {}
  }
  return {
    normal_unit_price: fallbackUnit,
    active_unit_price: fallbackUnit,
    normal_price: fallbackTotal,
    active_price: fallbackTotal,
    label: null,
    campaign_name: null,
    campaign_copy: null,
    rule_id: null,
    source: rejected.length ? "fallback_pricing_js_invalid_rule" : "fallback_pricing_js",
    pricing_warning: rejected.length ? "INVALID_SERVICE_PRICE_RULE" : null,
    rejected_rule_id: rejected[0]?.row?.rule_id || null,
    rejected_rule_codes: rejected[0]?.safety?.risk_codes || [],
  };
}

async function resolveCustomerPricingMulti(payload = {}, db) {
  const lines = servicesFromPayload(payload);
  if (!lines.length) {
    const fallback = money(pricingHelpers.computeStandardPriceMulti(payload));
    return { normal_price: fallback, active_price: fallback, standard_price: fallback, lines: [], source: "fallback_pricing_js" };
  }
  const resolved = [];
  for (const line of lines) {
    resolved.push({ line, pricing: await resolveLinePrice(line, db) });
  }
  const normalTotal = money(resolved.reduce((s, x) => s + Number(x.pricing.normal_price || 0), 0));
  const activeTotal = money(resolved.reduce((s, x) => s + Number(x.pricing.active_price || 0), 0));
  const applied = resolved.find((x) => x.pricing.source === "customer_service_price_rules" && (x.pricing.label || x.pricing.campaign_name))?.pricing || null;
  return {
    normal_price: normalTotal,
    active_price: activeTotal,
    standard_price: activeTotal,
    label: applied?.label || null,
    campaign_name: applied?.campaign_name || null,
    campaign_copy: applied?.campaign_copy || null,
    source: resolved.some((x) => x.pricing.source === "customer_service_price_rules")
      ? "customer_service_price_rules"
      : (resolved.some((x) => x.pricing.source === "fallback_pricing_js_invalid_rule") ? "fallback_pricing_js_invalid_rule" : "fallback_pricing_js"),
    pricing_warning: resolved.find((x) => x.pricing.pricing_warning)?.pricing.pricing_warning || null,
    rejected_rule_id: resolved.find((x) => x.pricing.rejected_rule_id)?.pricing.rejected_rule_id || null,
    rejected_rule_codes: resolved.find((x) => x.pricing.rejected_rule_codes?.length)?.pricing.rejected_rule_codes || [],
    lines: resolved.map((x) => ({ ...x.line, ...x.pricing })),
  };
}

async function buildCustomerServiceLineItemsFromPayload(payload = {}, db) {
  const preview = await resolveCustomerPricingMulti(payload, db);
  const items = [];
  for (const row of preview.lines || []) {
    const qty = Math.max(1, Number(row.machine_count || 1));
    const item_name = serviceItemName(row);
    const allocations = row.allocations && typeof row.allocations === "object" ? row.allocations : null;
    if (allocations) {
      for (const [tech, rawQty] of Object.entries(allocations)) {
        const q = Math.max(0, Number(rawQty || 0));
        if (!tech || q <= 0) continue;
        items.push({
          item_id: null,
          item_name,
          qty: q,
          unit_price: row.active_unit_price,
          line_total: money(row.active_unit_price * q),
          is_service: true,
          assigned_technician_username: tech,
          customer_price_rule_id: row.rule_id || null,
          normal_unit_price: row.normal_unit_price,
          customer_price_label: row.label || null,
          customer_campaign_name: row.campaign_name || null,
          customer_price_source: row.source || null,
        });
      }
    } else {
      items.push({
        item_id: null,
        item_name,
        qty,
        unit_price: row.active_unit_price,
        line_total: money(row.active_unit_price * qty),
        is_service: true,
        assigned_technician_username: row.assigned_to || row.assigned_technician_username || null,
        customer_price_rule_id: row.rule_id || null,
        normal_unit_price: row.normal_unit_price,
        customer_price_label: row.label || null,
        customer_campaign_name: row.campaign_name || null,
        customer_price_source: row.source || null,
      });
    }
  }
  return items;
}

function rainySeasonRows(updatedBy) {
  const base = {
    job_type: "ล้าง",
    ac_type: "ผนัง",
    label: "โปรดูแลแอร์รับหน้าฝน",
    campaign_name: CAMPAIGN_NAME,
    campaign_copy: "แอร์เริ่มมีกลิ่นอับ น้ำหยด ลมไม่เย็น หรือไม่ได้ล้างมานาน? Coldwindflow เปิดโปรพิเศษสำหรับลูกค้าในพื้นที่ใกล้พระโขนงและย่านใกล้เคียง",
    is_active: true,
    priority: 100,
    updated_by: updatedBy || "system",
  };
  return [
    { ...base, seed_key: "rainy_2026_wall_small_normal", wash_variant: "ล้างธรรมดา", btu_min: 0, btu_max: 12000, normal_price: 600, active_price: 550 },
    { ...base, seed_key: "rainy_2026_wall_small_premium", wash_variant: "ล้างพรีเมียม", btu_min: 0, btu_max: 12000, normal_price: 900, active_price: 790 },
    { ...base, seed_key: "rainy_2026_wall_small_coil", wash_variant: "ล้างแขวนคอยล์", btu_min: 0, btu_max: 12000, normal_price: 1400, active_price: 1290 },
    { ...base, seed_key: "rainy_2026_wall_small_overhaul", wash_variant: "ล้างแบบตัดล้าง", btu_min: 0, btu_max: 12000, normal_price: 2000, active_price: 1850 },
    { ...base, seed_key: "rainy_2026_wall_large_normal", wash_variant: "ล้างธรรมดา", btu_min: 18000, btu_max: null, normal_price: 750, active_price: 690 },
    { ...base, seed_key: "rainy_2026_wall_large_premium", wash_variant: "ล้างพรีเมียม", btu_min: 18000, btu_max: null, normal_price: 1100, active_price: 990 },
    { ...base, seed_key: "rainy_2026_wall_large_coil", wash_variant: "ล้างแขวนคอยล์", btu_min: 18000, btu_max: null, normal_price: 1700, active_price: 1550 },
    { ...base, seed_key: "rainy_2026_wall_large_overhaul", wash_variant: "ล้างแบบตัดล้าง", btu_min: 18000, btu_max: null, normal_price: 2300, active_price: 2150 },
  ];
}

function sameBtuRange(a, b) {
  const amin = a.btu_min == null ? null : Number(a.btu_min);
  const amax = a.btu_max == null ? null : Number(a.btu_max);
  const bmin = b.btu_min == null ? null : Number(b.btu_min);
  const bmax = b.btu_max == null ? null : Number(b.btu_max);
  return (amin ?? null) === (bmin ?? null) && (amax ?? null) === (bmax ?? null);
}

function sameRainySeedSlot(existing, seed) {
  if (!existing) return false;
  if (existing.seed_key && existing.seed_key === seed.seed_key) return true;
  const campaign = String(existing.campaign_name || "");
  const label = String(existing.label || "");
  const rainyLike = campaign === CAMPAIGN_NAME || label === seed.label || /rainy/i.test(campaign) || /rainy/i.test(label);
  if (!rainyLike) return false;
  return normalizeServiceType(existing.job_type || "") === seed.job_type
    && normalizeAcType(existing.ac_type || "") === seed.ac_type
    && normalizeWashKey(existing.wash_variant || "") === normalizeWashKey(seed.wash_variant || "")
    && sameBtuRange(existing, seed);
}

async function seedRainySeasonPromo(db, updatedBy, options = {}) {
  const forceUpdate = options.forceUpdate === true;
  await ensureCustomerPriceBookSchema(db);
  const rows = rainySeasonRows(updatedBy);
  const existingRows = (await db.query(
    `SELECT rule_id, job_type, ac_type, wash_variant, btu_min, btu_max, label, campaign_name, seed_key
       FROM public.customer_service_price_rules`
  )).rows || [];
  for (const row of rows) {
    const matchingLegacy = existingRows.filter((existing) => sameRainySeedSlot(existing, row));
    const existingRuleId = matchingLegacy[0]?.rule_id || null;
    if (existingRuleId) {
      if (forceUpdate) {
        await db.query(
          `UPDATE public.customer_service_price_rules
              SET normal_price=$2, active_price=$3, label=$4, campaign_name=$5, campaign_copy=$6,
                  seed_key=$7, is_active=TRUE, priority=$8, updated_by=$9, updated_at=NOW()
            WHERE rule_id=$1`,
          [existingRuleId, row.normal_price, row.active_price, row.label, row.campaign_name, row.campaign_copy, row.seed_key, row.priority, row.updated_by]
        );
      } else {
        await db.query(
          `UPDATE public.customer_service_price_rules
              SET seed_key=COALESCE(seed_key, $2), campaign_name=COALESCE(campaign_name, $3),
                  label=COALESCE(label, $4), is_active=TRUE, updated_by=$5, updated_at=NOW()
            WHERE rule_id=$1`,
          [existingRuleId, row.seed_key, row.campaign_name, row.label, row.updated_by]
        );
      }
      for (const dup of matchingLegacy.slice(1)) {
        await db.query(
          `UPDATE public.customer_service_price_rules
              SET is_active=FALSE, updated_by=$2, updated_at=NOW()
            WHERE rule_id=$1 AND seed_key IS NULL`,
          [dup.rule_id, row.updated_by]
        );
      }
      continue;
    }
    await db.query(
      `INSERT INTO public.customer_service_price_rules
        (job_type, ac_type, wash_variant, btu_min, btu_max, machine_min, machine_max,
         normal_price, active_price, label, campaign_name, campaign_copy, seed_key, is_active, priority, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,NULL,NULL,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
       ON CONFLICT (seed_key) WHERE seed_key IS NOT NULL
       DO UPDATE SET normal_price=EXCLUDED.normal_price, active_price=EXCLUDED.active_price,
         label=EXCLUDED.label, campaign_name=EXCLUDED.campaign_name, campaign_copy=EXCLUDED.campaign_copy,
         is_active=TRUE, priority=EXCLUDED.priority, updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
      [
        row.job_type, row.ac_type, row.wash_variant, row.btu_min, row.btu_max,
        row.normal_price, row.active_price, row.label, row.campaign_name,
        row.campaign_copy, row.seed_key, row.is_active, row.priority, row.updated_by,
      ]
    );
  }
  const existing = await db.query(
    `SELECT COUNT(*)::int AS count FROM public.customer_service_price_rules
      WHERE campaign_name=$1 AND ac_type=$2 AND job_type=$3`,
    [CAMPAIGN_NAME, "ผนัง", "ล้าง"]
  );
  return { inserted_or_existing: Number(existing.rows?.[0]?.count || 0) };
}

function cleanRuleBody(b = {}) {
  return {
    job_type: String(b.job_type || "").trim() || null,
    ac_type: String(b.ac_type || "").trim() || null,
    wash_variant: String(b.wash_variant || "").trim() || null,
    btu_min: intOrNull(b.btu_min),
    btu_max: intOrNull(b.btu_max),
    machine_min: intOrNull(b.machine_min),
    machine_max: intOrNull(b.machine_max),
    normal_price: money(b.normal_price),
    active_price: money(b.active_price),
    label: String(b.label || "").trim() || null,
    campaign_name: String(b.campaign_name || "").trim() || null,
    campaign_copy: String(b.campaign_copy || "").trim() || null,
    effective_from: String(b.effective_from || "").trim() || null,
    effective_to: String(b.effective_to || "").trim() || null,
    is_active: boolish(b.is_active, true),
    priority: intOrNull(b.priority) || 0,
  };
}

function rangesOverlap(aMin, aMax, bMin, bMax) {
  const amin = aMin == null ? -Infinity : Number(aMin);
  const amax = aMax == null ? Infinity : Number(aMax);
  const bmin = bMin == null ? -Infinity : Number(bMin);
  const bmax = bMax == null ? Infinity : Number(bMax);
  return amin <= bmax && bmin <= amax;
}

function annotateRuleRisks(rows = []) {
  const annotated = rows.map((row) => {
    const safety = serviceRuleSafety(row);
    return {
      ...row,
      risk_codes: [...safety.risk_codes],
      is_safe_for_service_pricing: safety.is_safe_for_service_pricing,
      effective_scope: safety.effective_scope,
      linked_catalog_item_category: safety.linked_catalog_item_category,
      linked_catalog_item_id: safety.linked_catalog_item_id,
      linked_catalog_item_count: safety.linked_catalog_item_count,
      linked_catalog_item_ids: safety.linked_catalog_item_ids,
      linked_catalog_has_product: safety.linked_catalog_has_product,
      linked_catalog_has_service: safety.linked_catalog_has_service,
      catalog_linkage_status: safety.catalog_linkage_status,
      canonical_fallback_unit: safety.canonical_fallback_unit,
      overlaps_with_rule_ids: [],
    };
  });
  for (let i = 0; i < annotated.length; i += 1) {
    for (let j = i + 1; j < annotated.length; j += 1) {
      const a = annotated[i];
      const b = annotated[j];
      if (Number(a.rule_id) === Number(b.rule_id)) continue;
      if (!a.is_active || !b.is_active) continue;
      if (Number(a.priority || 0) !== Number(b.priority || 0)) continue;
      if (!a.is_safe_for_service_pricing || !b.is_safe_for_service_pricing) continue;
      if (normalizeServiceType(a.job_type || "") !== normalizeServiceType(b.job_type || "")) continue;
      if (normalizeAcType(a.ac_type || "") !== normalizeAcType(b.ac_type || "")) continue;
      if (normalizeWashKey(a.wash_variant || "") !== normalizeWashKey(b.wash_variant || "")) continue;
      if (!rangesOverlap(a.btu_min, a.btu_max, b.btu_min, b.btu_max)) continue;
      if (!rangesOverlap(a.machine_min, a.machine_max, b.machine_min, b.machine_max)) continue;
      a.overlaps_with_rule_ids.push(b.rule_id);
      b.overlaps_with_rule_ids.push(a.rule_id);
    }
  }
  for (const row of annotated) {
    if (row.overlaps_with_rule_ids.length && !row.risk_codes.includes("OVERLAPPING_ACTIVE_RULE")) {
      row.risk_codes.push("OVERLAPPING_ACTIVE_RULE");
      row.is_safe_for_service_pricing = false;
    }
  }
  return annotated;
}

function validateServicePriceRuleForWrite(body) {
  const fallbackUnit = canonicalFallbackUnitForRule(body);
  const safety = serviceRuleSafety(body, { fallbackUnit });
  return {
    ok: safety.is_safe_for_service_pricing,
    error: safety.risk_codes.join(", "),
    risk_codes: safety.risk_codes,
    normalized: safety.normalized,
  };
}

function createCustomerPricingRoutes({ pool, requireAdminSoft }) {
  const router = express.Router();
  const guard = requireAdminSoft || ((req, res, next) => next());

  router.get("/admin/customer-pricing/rules", guard, async (req, res) => {
    try {
      await ensureCustomerPriceBookSchema(pool);
      const rows = await loadAdminRuleRows(pool);
      res.json({ success: true, rules: annotateRuleRisks(rows) });
    } catch (e) {
      console.error("GET /admin/customer-pricing/rules", e);
      res.status(500).json({ error: "โหลดราคาบริการไม่สำเร็จ" });
    }
  });

  router.post("/admin/customer-pricing/rules", guard, async (req, res) => {
    try {
      await ensureCustomerPriceBookSchema(pool);
      const b = cleanRuleBody(req.body || {});
      const validation = validateServicePriceRuleForWrite(b);
      if (!validation.ok) return res.status(400).json({ error: "UNSAFE_SERVICE_PRICE_RULE", code: "UNSAFE_SERVICE_PRICE_RULE", risk_codes: validation.risk_codes });
      b.job_type = validation.normalized.job_type;
      b.ac_type = validation.normalized.ac_type;
      b.wash_variant = validation.normalized.wash_variant;
      if (!b.job_type || !b.ac_type || !b.normal_price || !b.active_price) return res.status(400).json({ error: "กรอกประเภทงาน ประเภทแอร์ ราคาปกติ และราคาที่ใช้จริง" });
      const r = await pool.query(
        `INSERT INTO public.customer_service_price_rules
          (job_type, ac_type, wash_variant, btu_min, btu_max, machine_min, machine_max,
           normal_price, active_price, label, campaign_name, campaign_copy, effective_from, effective_to,
           is_active, priority, updated_by, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
         RETURNING rule_id`,
        [b.job_type, b.ac_type, b.wash_variant, b.btu_min, b.btu_max, b.machine_min, b.machine_max, b.normal_price, b.active_price, b.label, b.campaign_name, b.campaign_copy, b.effective_from, b.effective_to, b.is_active, b.priority, req.actor?.username || req.headers["x-admin-username"] || "admin"]
      );
      res.json({ success: true, rule_id: r.rows?.[0]?.rule_id });
    } catch (e) {
      console.error("POST /admin/customer-pricing/rules", e);
      res.status(500).json({ error: "บันทึกราคาบริการไม่สำเร็จ" });
    }
  });

  router.put("/admin/customer-pricing/rules/:id", guard, async (req, res) => {
    try {
      await ensureCustomerPriceBookSchema(pool);
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: "rule_id ไม่ถูกต้อง" });
      const b = cleanRuleBody(req.body || {});
      const validation = validateServicePriceRuleForWrite(b);
      if (!validation.ok) return res.status(400).json({ error: "UNSAFE_SERVICE_PRICE_RULE", code: "UNSAFE_SERVICE_PRICE_RULE", risk_codes: validation.risk_codes });
      b.job_type = validation.normalized.job_type;
      b.ac_type = validation.normalized.ac_type;
      b.wash_variant = validation.normalized.wash_variant;
      await pool.query(
        `UPDATE public.customer_service_price_rules
            SET job_type=$2, ac_type=$3, wash_variant=$4, btu_min=$5, btu_max=$6, machine_min=$7, machine_max=$8,
                normal_price=$9, active_price=$10, label=$11, campaign_name=$12, campaign_copy=$13,
                effective_from=$14, effective_to=$15, is_active=$16, priority=$17, updated_by=$18, updated_at=NOW()
          WHERE rule_id=$1`,
        [id, b.job_type, b.ac_type, b.wash_variant, b.btu_min, b.btu_max, b.machine_min, b.machine_max, b.normal_price, b.active_price, b.label, b.campaign_name, b.campaign_copy, b.effective_from, b.effective_to, b.is_active, b.priority, req.actor?.username || req.headers["x-admin-username"] || "admin"]
      );
      res.json({ success: true });
    } catch (e) {
      console.error("PUT /admin/customer-pricing/rules/:id", e);
      res.status(500).json({ error: "แก้ไขราคาบริการไม่สำเร็จ" });
    }
  });

  router.patch("/admin/customer-pricing/rules/:id/toggle", guard, async (req, res) => {
    try {
      await ensureCustomerPriceBookSchema(pool);
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: "rule_id ไม่ถูกต้อง" });
      const active = boolish(req.body?.is_active, true);
      if (active) {
        const existing = await pool.query(`SELECT * FROM public.customer_service_price_rules WHERE rule_id=$1`, [id]);
        const validation = validateServicePriceRuleForWrite(existing.rows?.[0] || {});
        if (!validation.ok) return res.status(400).json({ error: "UNSAFE_SERVICE_PRICE_RULE", code: "UNSAFE_SERVICE_PRICE_RULE", risk_codes: validation.risk_codes });
      }
      await pool.query(`UPDATE public.customer_service_price_rules SET is_active=$2, updated_at=NOW() WHERE rule_id=$1`, [id, active]);
      res.json({ success: true });
    } catch (e) {
      console.error("PATCH /admin/customer-pricing/rules/:id/toggle", e);
      res.status(500).json({ error: "เปลี่ยนสถานะราคาไม่สำเร็จ" });
    }
  });

  router.post("/admin/customer-pricing/seed-rainy-season-promo", guard, async (req, res) => {
    try {
      const result = await seedRainySeasonPromo(pool, req.actor?.username || req.headers["x-admin-username"] || "admin", { forceUpdate: true });
      res.json({ success: true, ...result });
    } catch (e) {
      console.error("POST /admin/customer-pricing/seed-rainy-season-promo", e);
      res.status(500).json({ error: "เพิ่มราคาโปรหน้าฝนไม่สำเร็จ" });
    }
  });

  return router;
}

module.exports = {
  ensureCustomerPriceBookSchema,
  resolveCustomerPricingMulti,
  buildCustomerServiceLineItemsFromPayload,
  seedRainySeasonPromo,
  createCustomerPricingRoutes,
  money,
  intOrNull,
  boolish,
  cleanRuleBody,
  serviceRuleSafety,
  canonicalFallbackUnitForRule,
  validateServicePriceRuleForWrite,
  annotateRuleRisks,
};
