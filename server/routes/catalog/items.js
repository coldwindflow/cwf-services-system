const { money, intOrNull, boolish } = require("../../customerPricing");
const cloudinaryImageUpload = require("../../lib/cloudinaryImageUpload");

function normalizeBoolean(value, fieldLabel) {
  if (typeof value === "boolean") return { ok: true, value };
  if (typeof value === "number") {
    if (value === 1) return { ok: true, value: true };
    if (value === 0) return { ok: true, value: false };
    return { ok: false, error: `${fieldLabel} ไม่ถูกต้อง` };
  }
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes" || s === "on") return { ok: true, value: true };
    if (s === "false" || s === "0" || s === "no" || s === "off") return { ok: true, value: false };
    return { ok: false, error: `${fieldLabel} ไม่ถูกต้อง` };
  }
  return { ok: false, error: `${fieldLabel} ไม่ถูกต้อง` };
}

function parseOptionalPositiveNumber(value, fieldLabel) {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: `${fieldLabel} ต้องเป็นค่าว่างหรือจำนวนบวก` };
  return { ok: true, value: n };
}

function parseRequiredPositivePrice(value, fieldLabel) {
  if (value === undefined || value === null) {
    return { ok: false, error: `${fieldLabel} ต้องระบุและมากกว่า 0` };
  }
  const trimmed = typeof value === "string" ? value.trim() : value;
  if (trimmed === "") return { ok: false, error: `${fieldLabel} ต้องระบุและมากกว่า 0` };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: `${fieldLabel} ต้องเป็นตัวเลขมากกว่า 0` };
  return { ok: true, value: n };
}

function parseOptionalDate(value, fieldLabel) {
  if (value === undefined || value === null) return { ok: true, value: null };
  const trimmed = String(value).trim();
  if (trimmed === "") return { ok: true, value: null };
  const ts = Date.parse(trimmed);
  if (!Number.isFinite(ts)) return { ok: false, error: `${fieldLabel} ไม่ถูกต้อง` };
  return { ok: true, value: trimmed };
}

const CATALOG_ITEM_FIELDS = [
  "item_name", "item_category", "base_price", "unit_label",
  "job_category", "ac_type", "btu_min", "btu_max",
  "is_active", "is_customer_visible",
];

// Marketplace v2 fields (migrations/20260623_catalog_store_marketplace_v2.sql).
// Kept as a separate whitelist so the legacy field list above stays stable and
// readable for reviewers; mergeCatalogItemPayload() merges both lists together.
const CATALOG_MARKETPLACE_FIELDS = [
  "short_description", "long_description", "highlights", "service_conditions",
  "booking_mode", "booking_service_key", "booking_ac_type", "booking_btu",
  "booking_wash_variant", "is_featured",
];

const BOOKING_MODES = new Set(["bookable", "contact_admin"]);

function mergeCatalogItemPayload(existing, body) {
  const merged = {};
  CATALOG_ITEM_FIELDS.forEach((key) => {
    merged[key] = Object.prototype.hasOwnProperty.call(body, key) ? body[key] : existing[key];
  });
  CATALOG_MARKETPLACE_FIELDS.forEach((key) => {
    merged[key] = Object.prototype.hasOwnProperty.call(body, key) ? body[key] : existing[key];
  });
  return merged;
}

function parseOptionalText(value, fieldLabel, maxLen) {
  if (value === undefined || value === null) return { ok: true, value: null };
  const trimmed = String(value).trim();
  if (!trimmed) return { ok: true, value: null };
  if (maxLen && trimmed.length > maxLen) {
    return { ok: false, error: `${fieldLabel} ต้องไม่เกิน ${maxLen} ตัวอักษร` };
  }
  return { ok: true, value: trimmed };
}

function parseOptionalHighlights(value) {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  let arr = value;
  if (typeof value === "string") {
    try {
      arr = JSON.parse(value);
    } catch (_) {
      return { ok: false, error: "highlights ต้องเป็นรายการข้อความ (JSON array)" };
    }
  }
  if (!Array.isArray(arr)) return { ok: false, error: "highlights ต้องเป็นรายการข้อความ (JSON array)" };
  const cleaned = arr.map((item) => String(item == null ? "" : item).trim()).filter(Boolean);
  if (cleaned.length > 20) return { ok: false, error: "highlights ต้องมีไม่เกิน 20 ข้อ" };
  return { ok: true, value: cleaned };
}

function validateMarketplaceFields(merged) {
  const errors = [];

  const bookingMode = String(merged.booking_mode || "contact_admin").trim() || "contact_admin";
  if (!BOOKING_MODES.has(bookingMode)) {
    errors.push("booking_mode ต้องเป็น 'bookable' หรือ 'contact_admin' เท่านั้น");
  }

  const shortDescResult = parseOptionalText(merged.short_description, "คำอธิบายสั้น", 300);
  if (!shortDescResult.ok) errors.push(shortDescResult.error);

  const longDescResult = parseOptionalText(merged.long_description, "คำอธิบายแบบละเอียด", 5000);
  if (!longDescResult.ok) errors.push(longDescResult.error);

  const conditionsResult = parseOptionalText(merged.service_conditions, "เงื่อนไขบริการ", 3000);
  if (!conditionsResult.ok) errors.push(conditionsResult.error);

  const highlightsResult = parseOptionalHighlights(merged.highlights);
  if (!highlightsResult.ok) errors.push(highlightsResult.error);

  const bookingServiceKeyResult = parseOptionalText(merged.booking_service_key, "booking_service_key", 120);
  if (!bookingServiceKeyResult.ok) errors.push(bookingServiceKeyResult.error);

  const bookingAcTypeResult = parseOptionalText(merged.booking_ac_type, "booking_ac_type", 60);
  if (!bookingAcTypeResult.ok) errors.push(bookingAcTypeResult.error);

  const bookingWashVariantResult = parseOptionalText(merged.booking_wash_variant, "booking_wash_variant", 60);
  if (!bookingWashVariantResult.ok) errors.push(bookingWashVariantResult.error);

  const bookingBtuResult = parseOptionalPositiveNumber(merged.booking_btu, "booking_btu");
  if (!bookingBtuResult.ok) errors.push(bookingBtuResult.error);

  const isFeaturedResult = normalizeBoolean(
    Object.prototype.hasOwnProperty.call(merged, "is_featured") && merged.is_featured !== undefined && merged.is_featured !== null && merged.is_featured !== ""
      ? merged.is_featured
      : false,
    "is_featured"
  );
  if (!isFeaturedResult.ok) errors.push(isFeaturedResult.error);

  if (bookingMode === "bookable" && !bookingServiceKeyResult.value && !bookingAcTypeResult.value) {
    errors.push("รายการที่เป็น bookable ต้องระบุ booking_service_key หรือ booking_ac_type อย่างน้อยหนึ่งอย่าง เพื่อให้จองได้จริง");
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      booking_mode: bookingMode,
      short_description: shortDescResult.value,
      long_description: longDescResult.value,
      service_conditions: conditionsResult.value,
      highlights: highlightsResult.value,
      booking_service_key: bookingServiceKeyResult.value,
      booking_ac_type: bookingAcTypeResult.value,
      booking_wash_variant: bookingWashVariantResult.value,
      booking_btu: bookingBtuResult.value !== null ? Math.round(bookingBtuResult.value) : null,
      is_featured: isFeaturedResult.value,
    },
  };
}

function validateMergedCatalogItem(merged) {
  const errors = [];

  const item_name = String(merged.item_name || "").trim();
  if (!item_name) errors.push("กรุณากรอกชื่อรายการ");

  const item_category = String(merged.item_category || "").trim();
  const unit_label = String(merged.unit_label || "").trim();
  const job_category = String(merged.job_category || "").trim();
  const ac_type = String(merged.ac_type || "").trim();

  let base_price = 0;
  if (merged.base_price === null || merged.base_price === undefined || merged.base_price === "") {
    base_price = 0;
  } else {
    const n = Number(merged.base_price);
    if (!Number.isFinite(n) || n < 0) errors.push("ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป");
    else base_price = n;
  }

  const btuMinResult = parseOptionalPositiveNumber(merged.btu_min, "btu_min");
  if (!btuMinResult.ok) errors.push(btuMinResult.error);
  const btuMaxResult = parseOptionalPositiveNumber(merged.btu_max, "btu_max");
  if (!btuMaxResult.ok) errors.push(btuMaxResult.error);

  const btu_min = btuMinResult.ok ? btuMinResult.value : null;
  const btu_max = btuMaxResult.ok ? btuMaxResult.value : null;
  if (btu_min !== null && btu_max !== null && btu_min > btu_max) {
    errors.push("btu_min ต้องไม่มากกว่า btu_max");
  }

  const isActiveResult = normalizeBoolean(merged.is_active, "is_active");
  if (!isActiveResult.ok) errors.push(isActiveResult.error);
  const isVisibleResult = normalizeBoolean(merged.is_customer_visible, "is_customer_visible");
  if (!isVisibleResult.ok) errors.push(isVisibleResult.error);

  const is_active = isActiveResult.ok ? isActiveResult.value : null;
  const is_customer_visible = isVisibleResult.ok ? isVisibleResult.value : null;

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: { item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible },
  };
}

// pricing === undefined  -> field omitted from request, caller must leave existing pricing untouched
// pricing === null       -> caller explicitly sent no pricing changes; existing linked price rule (if any)
//                           is preserved as-is and is never unlinked or orphaned by this call
// pricing === {...}      -> caller asked to create/update the linked price rule
function validatePricingInput(pricing) {
  if (pricing === undefined) return { ok: true, value: undefined };
  if (pricing === null) return { ok: true, value: null };
  if (typeof pricing !== "object" || Array.isArray(pricing)) {
    return { ok: false, errors: ["pricing ไม่ถูกต้อง"] };
  }

  const errors = [];

  const normalResult = parseRequiredPositivePrice(pricing.normal_price, "ราคาปกติ");
  if (!normalResult.ok) errors.push(normalResult.error);

  const activeResult = parseRequiredPositivePrice(pricing.active_price, "ราคาโปรโมชัน");
  if (!activeResult.ok) errors.push(activeResult.error);

  if (normalResult.ok && activeResult.ok && activeResult.value > normalResult.value) {
    errors.push("ราคาโปรโมชันต้องไม่มากกว่าราคาปกติ");
  }

  const fromResult = parseOptionalDate(pricing.effective_from, "วันที่เริ่มโปรโมชัน");
  if (!fromResult.ok) errors.push(fromResult.error);
  const toResult = parseOptionalDate(pricing.effective_to, "วันที่สิ้นสุดโปรโมชัน");
  if (!toResult.ok) errors.push(toResult.error);

  if (fromResult.ok && toResult.ok && fromResult.value && toResult.value && Date.parse(fromResult.value) > Date.parse(toResult.value)) {
    errors.push("วันที่เริ่มโปรโมชันต้องไม่มากกว่าวันที่สิ้นสุดโปรโมชัน");
  }

  const isActiveResult = normalizeBoolean(
    Object.prototype.hasOwnProperty.call(pricing, "pricing_is_active") ? pricing.pricing_is_active : true,
    "pricing.pricing_is_active"
  );
  if (!isActiveResult.ok) errors.push(isActiveResult.error);

  const priorityResult = parseOptionalPositiveNumber(pricing.priority, "priority");
  if (!priorityResult.ok) errors.push(priorityResult.error);

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      normal_price: money(normalResult.value),
      active_price: money(activeResult.value),
      campaign_name: String(pricing.campaign_name || "").trim() || null,
      effective_from: fromResult.value,
      effective_to: toResult.value,
      is_active: isActiveResult.value,
      wash_variant: String(pricing.wash_variant || "").trim() || null,
      label: String(pricing.label || "").trim() || null,
      priority: priorityResult.value !== null ? Math.round(priorityResult.value) : null,
    },
  };
}

const CATALOG_SELECT_WITH_PRICING = `
  SELECT ci.item_id, ci.item_name, ci.item_category, ci.base_price, ci.unit_label, ci.is_active,
         ci.job_category, ci.ac_type, ci.btu_min, ci.btu_max, ci.is_customer_visible,
         ci.image_url, ci.image_public_id, ci.price_rule_id,
         pr.normal_price AS rule_normal_price, pr.active_price AS rule_active_price,
         pr.campaign_name AS rule_campaign_name, pr.is_active AS rule_is_active,
         pr.effective_from AS rule_effective_from, pr.effective_to AS rule_effective_to,
         pr.wash_variant AS rule_wash_variant, pr.label AS rule_label, pr.priority AS rule_priority
  FROM public.catalog_items ci
  LEFT JOIN public.customer_service_price_rules pr ON pr.rule_id = ci.price_rule_id
`;

// Used until the additive migration (migrations/20260622_catalog_store_media_pricing.sql)
// has actually been run: catalog_items.image_url/image_public_id/price_rule_id may not exist
// yet, so this SELECT only ever references columns guaranteed to exist on day one.
const CATALOG_SELECT_LEGACY = `
  SELECT ci.item_id, ci.item_name, ci.item_category, ci.base_price, ci.unit_label, ci.is_active,
         ci.job_category, ci.ac_type, ci.btu_min, ci.btu_max, ci.is_customer_visible
  FROM public.catalog_items ci
`;

// Adds marketplace v2 columns (migrations/20260623_catalog_store_marketplace_v2.sql) on
// top of CATALOG_SELECT_WITH_PRICING. Multi-image rows live in catalog_item_images and are
// fetched with a separate, grouped query (see attachCatalogImages) rather than joined here,
// so a single catalog_items row never gets fanned out across N image rows.
const CATALOG_SELECT_MARKETPLACE = `
  SELECT ci.item_id, ci.item_name, ci.item_category, ci.base_price, ci.unit_label, ci.is_active,
         ci.job_category, ci.ac_type, ci.btu_min, ci.btu_max, ci.is_customer_visible,
         ci.image_url, ci.image_public_id, ci.price_rule_id,
         ci.short_description, ci.long_description, ci.highlights, ci.service_conditions,
         ci.booking_mode, ci.booking_service_key, ci.booking_ac_type, ci.booking_btu,
         ci.booking_wash_variant, ci.is_featured,
         pr.normal_price AS rule_normal_price, pr.active_price AS rule_active_price,
         pr.campaign_name AS rule_campaign_name, pr.is_active AS rule_is_active,
         pr.effective_from AS rule_effective_from, pr.effective_to AS rule_effective_to,
         pr.wash_variant AS rule_wash_variant, pr.label AS rule_label, pr.priority AS rule_priority
  FROM public.catalog_items ci
  LEFT JOIN public.customer_service_price_rules pr ON pr.rule_id = ci.price_rule_id
`;

// Three-tier capability-driven SELECT: legacy (day one) -> +media/pricing -> +marketplace v2.
// Building from flags (rather than three independently-hand-written constants) keeps the
// marketplace tier from drifting out of sync with the pricing tier as both evolve.
function buildCatalogSelect({ pricingReady, marketplaceReady }) {
  if (marketplaceReady) return CATALOG_SELECT_MARKETPLACE;
  if (pricingReady) return CATALOG_SELECT_WITH_PRICING;
  return CATALOG_SELECT_LEGACY;
}

async function attachCatalogImages(pool, rows, marketplaceReady) {
  if (!marketplaceReady || !rows.length) {
    rows.forEach((row) => { row.images = []; });
    return rows;
  }
  const ids = rows.map((row) => row.item_id);
  const r = await pool.query(
    `SELECT image_id, item_id, image_url, image_public_id, alt_text, sort_order, is_primary
       FROM public.catalog_item_images
      WHERE item_id = ANY($1::bigint[])
      ORDER BY item_id, sort_order, image_id`,
    [ids]
  );
  const byItem = new Map();
  r.rows.forEach((imgRow) => {
    if (!byItem.has(imgRow.item_id)) byItem.set(imgRow.item_id, []);
    byItem.get(imgRow.item_id).push(imgRow);
  });
  rows.forEach((row) => { row.images = byItem.get(row.item_id) || []; });
  return rows;
}

function serializeCatalogImage(imgRow) {
  return {
    image_id: imgRow.image_id,
    image_url: imgRow.image_url,
    alt_text: imgRow.alt_text || null,
    sort_order: imgRow.sort_order,
    is_primary: Boolean(imgRow.is_primary),
  };
}

function computeEffectivePricing(row) {
  const base_price = Number(row.base_price || 0);
  let ruleIsCurrentlyActive = false;
  if (row.price_rule_id != null && row.rule_is_active) {
    const now = Date.now();
    const from = row.rule_effective_from ? new Date(row.rule_effective_from).getTime() : null;
    const to = row.rule_effective_to ? new Date(row.rule_effective_to).getTime() : null;
    const afterStart = from === null || Number.isNaN(from) || now >= from;
    const beforeEnd = to === null || Number.isNaN(to) || now <= to;
    if (afterStart && beforeEnd) ruleIsCurrentlyActive = true;
  }
  const normal_price = ruleIsCurrentlyActive ? Number(row.rule_normal_price || 0) : null;
  const sale_price = ruleIsCurrentlyActive ? Number(row.rule_active_price || 0) : null;
  const display_price = ruleIsCurrentlyActive ? sale_price : base_price;
  const has_promo = ruleIsCurrentlyActive && normal_price != null && sale_price != null && sale_price < normal_price;
  return {
    base_price,
    normal_price,
    sale_price,
    display_price,
    has_promo,
    // These reflect the rule only while it is currently effective (active, started,
    // not expired) — an inactive/future/expired rule must never leak its campaign,
    // label, dates, wash_variant, or priority into the effective/public pricing view.
    campaign_name: ruleIsCurrentlyActive ? (row.rule_campaign_name || null) : null,
    price_label: ruleIsCurrentlyActive ? (row.rule_label || null) : null,
    effective_from: ruleIsCurrentlyActive ? (row.rule_effective_from || null) : null,
    effective_to: ruleIsCurrentlyActive ? (row.rule_effective_to || null) : null,
    wash_variant: ruleIsCurrentlyActive ? (row.rule_wash_variant || null) : null,
    priority: ruleIsCurrentlyActive ? (row.rule_priority != null ? Number(row.rule_priority) : null) : null,
  };
}

// Public/effective DTO: every pricing-shaped field here reflects the currently-effective
// price rule only (active, started, not expired) — never the raw stored rule. This is
// what both the public storefront and the admin list/card views consume for "what would
// a customer see right now". Do not add raw rule fields here; see serializeAdminCatalogRow.
function serializeCatalogRow(row) {
  const pricing = computeEffectivePricing(row);
  // Multi-image gallery, ordered by sort_order. Falls back to the legacy single
  // image_url/image_public_id pair (as one synthetic primary image) so items
  // created before the marketplace v2 migration still render a photo.
  const galleryRows = Array.isArray(row.images) ? row.images : [];
  const images = galleryRows.length
    ? galleryRows.map(serializeCatalogImage)
    : (row.image_url ? [{ image_id: null, image_url: row.image_url, alt_text: null, sort_order: 0, is_primary: true }] : []);

  return {
    item_id: row.item_id,
    item_name: row.item_name,
    item_category: row.item_category,
    base_price: pricing.base_price,
    unit_label: row.unit_label,
    is_active: row.is_active,
    job_category: row.job_category,
    ac_type: row.ac_type,
    btu_min: row.btu_min,
    btu_max: row.btu_max,
    is_customer_visible: row.is_customer_visible,
    image_url: row.image_url || null,
    price_rule_id: row.price_rule_id || null,
    normal_price: pricing.normal_price,
    // Canonical public-contract field names (Phase 2A.2 production-blocker fixes):
    active_price: pricing.sale_price,
    has_active_promotion: pricing.has_promo,
    effective_from: pricing.effective_from,
    effective_to: pricing.effective_to,
    // Backward-compatible aliases — kept additive, do not remove.
    sale_price: pricing.sale_price,
    has_promo: pricing.has_promo,
    display_price: pricing.display_price,
    campaign_name: pricing.campaign_name,
    price_label: pricing.price_label,
    wash_variant: pricing.wash_variant,
    priority: pricing.priority,
    // Marketplace v2 fields (default to the safe "needs admin" shape when the
    // migration hasn't been run yet, since row.booking_mode is then undefined).
    images,
    short_description: row.short_description || null,
    highlights: Array.isArray(row.highlights) ? row.highlights : [],
    booking_mode: row.booking_mode === "bookable" ? "bookable" : "contact_admin",
    is_featured: Boolean(row.is_featured),
  };
}

// Public detail DTO: everything serializeCatalogRow has, plus the long-form
// content a product detail page needs. Never exposed on the list endpoint to
// keep list payloads small.
function serializeCatalogDetailRow(row) {
  const base = serializeCatalogRow(row);
  return {
    ...base,
    long_description: row.long_description || null,
    service_conditions: row.service_conditions || null,
    booking_service_key: row.booking_mode === "bookable" ? (row.booking_service_key || null) : null,
    booking_ac_type: row.booking_mode === "bookable" ? (row.booking_ac_type || null) : null,
    booking_btu: row.booking_mode === "bookable" ? (row.booking_btu || null) : null,
    booking_wash_variant: row.booking_mode === "bookable" ? (row.booking_wash_variant || null) : null,
  };
}

// Admin-only DTO: adds the raw, unfiltered price-rule columns under a `pricing_` prefix
// so the admin Edit UI can see (and round-trip) a rule's real stored values even while it
// is inactive, not yet started, or already expired. These must never be used to compute
// what a customer is charged — only serializeCatalogRow's effective fields drive that.
function serializeAdminCatalogRow(row) {
  const base = serializeCatalogRow(row);
  const hasRule = Boolean(row.price_rule_id);
  return {
    ...base,
    pricing_normal_price: hasRule ? Number(row.rule_normal_price ?? 0) : null,
    pricing_active_price: hasRule ? Number(row.rule_active_price ?? 0) : null,
    pricing_label: hasRule ? (row.rule_label || null) : null,
    pricing_campaign_name: hasRule ? (row.rule_campaign_name || null) : null,
    pricing_effective_from: hasRule ? (row.rule_effective_from || null) : null,
    pricing_effective_to: hasRule ? (row.rule_effective_to || null) : null,
    pricing_is_active: hasRule ? Boolean(row.rule_is_active) : null,
    pricing_wash_variant: hasRule ? (row.rule_wash_variant || null) : null,
    pricing_priority: hasRule ? (row.rule_priority != null ? Number(row.rule_priority) : null) : null,
    // Raw marketplace fields for the admin Edit form (booking_mode is already on
    // `base` since it's needed for public CTA routing too; this adds the rest).
    long_description: row.long_description || null,
    service_conditions: row.service_conditions || null,
    booking_service_key: row.booking_service_key || null,
    booking_ac_type: row.booking_ac_type || null,
    booking_btu: row.booking_btu || null,
    booking_wash_variant: row.booking_wash_variant || null,
  };
}

async function savePriceRuleForCatalogItem(client, { ruleId, pricing, catalogFields, actor }) {
  const job_type = String(catalogFields.job_category || "").trim() || null;
  const ac_type = String(catalogFields.ac_type || "").trim() || null;
  const btu_min = intOrNull(catalogFields.btu_min);
  const btu_max = intOrNull(catalogFields.btu_max);

  const wash_variant = String(pricing.wash_variant || "").trim() || null;
  const label = String(pricing.label || "").trim() || null;
  const priority = pricing.priority != null ? Math.round(Number(pricing.priority)) : null;

  if (ruleId) {
    await client.query(
      `UPDATE public.customer_service_price_rules
          SET job_type=$2, ac_type=$3, btu_min=$4, btu_max=$5,
              normal_price=$6, active_price=$7, campaign_name=$8,
              effective_from=$9, effective_to=$10, is_active=$11, updated_by=$12, updated_at=NOW(),
              wash_variant=$13, label=$14, priority=$15
        WHERE rule_id=$1`,
      [ruleId, job_type, ac_type, btu_min, btu_max, pricing.normal_price, pricing.active_price, pricing.campaign_name, pricing.effective_from, pricing.effective_to, pricing.is_active, actor, wash_variant, label, priority]
    );
    return ruleId;
  }

  const r = await client.query(
    `INSERT INTO public.customer_service_price_rules
       (job_type, ac_type, btu_min, btu_max, normal_price, active_price, campaign_name, effective_from, effective_to, is_active, updated_by, updated_at, wash_variant, label, priority)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),$12,$13,$14)
     RETURNING rule_id`,
    [job_type, ac_type, btu_min, btu_max, pricing.normal_price, pricing.active_price, pricing.campaign_name, pricing.effective_from, pricing.effective_to, pricing.is_active, actor, wash_variant, label, priority]
  );
  return r.rows[0].rule_id;
}

function actorUsername(req) {
  return (req.actor && req.actor.username) || req.headers["x-admin-username"] || "admin";
}

// Cloudinary error messages are not expected to carry secrets, but this keeps
// any defensive-in-depth promise consistent with the migration runner's own
// safeErrorMessage(): never let a signed-request parameter reach the logs.
function safeImageErrorMessage(error) {
  const msg = String(error && error.message ? error.message : error || "unknown error");
  return msg.replace(/(api_key|api_secret|signature)=[^&\s"']+/gi, "$1=[REDACTED]");
}

module.exports = function createCatalogItemRoutes(deps = {}) {
  const express = require("express");
  const multer = require("multer");
  const router = express.Router();
  const pool = deps.pool || require("../../db/pool");
  const requireAdminSession = deps.requireAdminSession;
  if (typeof requireAdminSession !== "function") {
    throw new Error("createCatalogItemRoutes requires a requireAdminSession middleware function");
  }
  const uploadCatalogImage = deps.uploadCatalogImage || cloudinaryImageUpload.uploadCatalogImage;
  const deleteCatalogImage = deps.deleteCatalogImage || cloudinaryImageUpload.deleteCatalogImage;
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: cloudinaryImageUpload.MAX_IMAGE_BYTES },
  });

  // Read-only capability detection: never issues DDL. Once the additive migration
  // (migrations/20260622_catalog_store_media_pricing.sql) has been run via the
  // approved script, this stays true for the lifetime of this router instance —
  // until then it is re-checked on every call so the app picks up the migration
  // without needing a restart.
  let mediaPricingSchemaReadyCache = false;
  async function isMediaPricingSchemaReady(db) {
    if (mediaPricingSchemaReadyCache) return true;
    const r = await db.query(`
      SELECT COUNT(*)::int AS cnt
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'catalog_items'
        AND column_name IN ('image_url', 'image_public_id', 'price_rule_id')
    `);
    const ready = Number(r.rows?.[0]?.cnt || 0) === 3;
    if (ready) mediaPricingSchemaReadyCache = true;
    return ready;
  }

  // Mirrors isMediaPricingSchemaReady's capability-check idiom: read-only, never issues
  // DDL, caches `true` for the router's lifetime once the marketplace v2 migration
  // (migrations/20260623_catalog_store_marketplace_v2.sql) has actually been run.
  let marketplaceSchemaReadyCache = false;
  async function isMarketplaceSchemaReady(db) {
    if (marketplaceSchemaReadyCache) return true;
    const r = await db.query(`
      SELECT COUNT(*)::int AS cnt
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'catalog_items'
        AND column_name IN (
          'short_description', 'long_description', 'highlights', 'service_conditions',
          'booking_mode', 'booking_service_key', 'booking_ac_type', 'booking_btu',
          'booking_wash_variant', 'is_featured'
        )
    `);
    const columnsReady = Number(r.rows?.[0]?.cnt || 0) === 10;
    if (!columnsReady) return false;
    const t = await db.query(`SELECT to_regclass('public.catalog_item_images') AS reg`);
    const ready = Boolean(t.rows?.[0]?.reg);
    if (ready) marketplaceSchemaReadyCache = true;
    return ready;
  }

  router.get("/catalog/items", async (req, res) => {
    try {
      const pricingReady = await isMediaPricingSchemaReady(pool);
      const marketplaceReady = await isMarketplaceSchemaReady(pool);
      const select = buildCatalogSelect({ pricingReady, marketplaceReady });
      const customer = String(req.query.customer || "").trim() === "1";
      const job_category = (req.query.job_category || "").toString().trim();
      const ac_type = (req.query.ac_type || "").toString().trim();
      const btu = Number(req.query.btu || 0);

      const where = [`ci.is_active = TRUE`];
      const params = [];
      let p = 1;

      if (customer) where.push(`ci.is_customer_visible = TRUE`);
      if (job_category) { params.push(job_category); where.push(`ci.job_category = $${p++}`); }
      if (ac_type) { params.push(ac_type); where.push(`ci.ac_type = $${p++}`); }
      if (Number.isFinite(btu) && btu > 0) {
        params.push(btu); where.push(`(ci.btu_min IS NULL OR ci.btu_min <= $${p++})`);
        params.push(btu); where.push(`(ci.btu_max IS NULL OR ci.btu_max >= $${p++})`);
      }

      const r = await pool.query(
        `${select}
         WHERE ${where.join(" AND ")}
         ORDER BY ci.item_category, ci.item_name`,
        params
      );
      await attachCatalogImages(pool, r.rows, marketplaceReady);
      res.json(r.rows.map(serializeCatalogRow));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "โหลดรายการสินค้า/บริการไม่สำเร็จ" });
    }
  });

  router.get("/catalog/items/:itemId", async (req, res) => {
    try {
      const itemId = String(req.params.itemId || "").trim();
      if (!/^\d+$/.test(itemId)) return res.status(400).json({ error: "item_id ไม่ถูกต้อง" });

      const pricingReady = await isMediaPricingSchemaReady(pool);
      const marketplaceReady = await isMarketplaceSchemaReady(pool);
      const select = buildCatalogSelect({ pricingReady, marketplaceReady });

      const r = await pool.query(
        `${select} WHERE ci.item_id = $1 AND ci.is_active = TRUE AND ci.is_customer_visible = TRUE`,
        [itemId]
      );
      const row = r.rows[0];
      if (!row) return res.status(404).json({ error: "ไม่พบรายการนี้" });
      await attachCatalogImages(pool, [row], marketplaceReady);
      res.json(serializeCatalogDetailRow(row));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "โหลดรายละเอียดสินค้า/บริการไม่สำเร็จ" });
    }
  });

  router.get("/admin/catalog/items", requireAdminSession, async (req, res) => {
    try {
      const pricingReady = await isMediaPricingSchemaReady(pool);
      const marketplaceReady = await isMarketplaceSchemaReady(pool);
      const select = buildCatalogSelect({ pricingReady, marketplaceReady });
      const r = await pool.query(`${select} ORDER BY ci.item_category, ci.item_name`);
      await attachCatalogImages(pool, r.rows, marketplaceReady);
      res.json(r.rows.map(serializeAdminCatalogRow));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "โหลดรายการสินค้า/บริการไม่สำเร็จ" });
    }
  });

  router.post("/admin/catalog/items", requireAdminSession, async (req, res) => {
    const defaults = {
      item_name: "", item_category: "", base_price: 0, unit_label: "",
      job_category: "", ac_type: "", btu_min: null, btu_max: null,
      is_active: true, is_customer_visible: false,
    };
    const merged = mergeCatalogItemPayload(defaults, req.body || {});
    const result = validateMergedCatalogItem(merged);
    if (!result.ok) return res.status(400).json({ error: result.errors.join(", ") });

    const marketplaceResult = validateMarketplaceFields(merged);
    if (!marketplaceResult.ok) return res.status(400).json({ error: marketplaceResult.errors.join(", ") });

    const hasPricingKey = req.body && Object.prototype.hasOwnProperty.call(req.body, "pricing");
    const pricingResult = hasPricingKey ? validatePricingInput(req.body.pricing) : { ok: true, value: undefined };
    if (!pricingResult.ok) return res.status(400).json({ error: pricingResult.errors.join(", ") });

    const hasMarketplaceKey = CATALOG_MARKETPLACE_FIELDS.some((key) => Object.prototype.hasOwnProperty.call(req.body || {}, key));
    const schemaReady = await isMediaPricingSchemaReady(pool);
    const marketplaceReady = await isMarketplaceSchemaReady(pool);
    if (pricingResult.value && !schemaReady) {
      return res.status(503).json({ error: "ระบบราคาโปรโมชันยังไม่พร้อมใช้งาน (ยังไม่ได้รัน migration)" });
    }
    if (hasMarketplaceKey && !marketplaceReady) {
      return res.status(503).json({ error: "ระบบ Marketplace ยังไม่พร้อมใช้งาน (ยังไม่ได้รัน migration)" });
    }

    const v = result.value;
    const mv = marketplaceResult.value;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const insertRes = marketplaceReady
        ? await client.query(
          `INSERT INTO public.catalog_items
             (item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible,
              short_description, long_description, highlights, service_conditions,
              booking_mode, booking_service_key, booking_ac_type, booking_btu, booking_wash_variant, is_featured)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
           RETURNING item_id`,
          [
            v.item_name, v.item_category, v.base_price, v.unit_label, v.job_category, v.ac_type, v.btu_min, v.btu_max, v.is_active, v.is_customer_visible,
            mv.short_description, mv.long_description, mv.highlights ? JSON.stringify(mv.highlights) : null, mv.service_conditions,
            mv.booking_mode, mv.booking_service_key, mv.booking_ac_type, mv.booking_btu, mv.booking_wash_variant, mv.is_featured,
          ]
        )
        : await client.query(
          `INSERT INTO public.catalog_items
             (item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING item_id`,
          [v.item_name, v.item_category, v.base_price, v.unit_label, v.job_category, v.ac_type, v.btu_min, v.btu_max, v.is_active, v.is_customer_visible]
        );
      const itemId = insertRes.rows[0].item_id;

      if (pricingResult.value) {
        const ruleId = await savePriceRuleForCatalogItem(client, {
          ruleId: null,
          pricing: pricingResult.value,
          catalogFields: v,
          actor: actorUsername(req),
        });
        await client.query(`UPDATE public.catalog_items SET price_rule_id=$1 WHERE item_id=$2`, [ruleId, itemId]);
      }

      await client.query("COMMIT");

      const select = buildCatalogSelect({ pricingReady: schemaReady, marketplaceReady });
      const final = await client.query(`${select} WHERE ci.item_id = $1`, [itemId]);
      await attachCatalogImages(pool, final.rows, marketplaceReady);
      res.status(201).json(serializeAdminCatalogRow(final.rows[0]));
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(500).json({ error: "เพิ่มรายการไม่สำเร็จ" });
    } finally {
      client.release();
    }
  });

  router.patch("/admin/catalog/items/:itemId", requireAdminSession, async (req, res) => {
    const itemId = String(req.params.itemId || "").trim();
    if (!/^\d+$/.test(itemId)) return res.status(400).json({ error: "item_id ไม่ถูกต้อง" });

    const schemaReady = await isMediaPricingSchemaReady(pool);
    const marketplaceReady = await isMarketplaceSchemaReady(pool);
    const select = buildCatalogSelect({ pricingReady: schemaReady, marketplaceReady });
    const existingResult = await pool.query(`${select} WHERE ci.item_id = $1`, [itemId]);
    const existing = existingResult.rows[0];
    if (!existing) return res.status(404).json({ error: "ไม่พบรายการนี้" });

    const merged = mergeCatalogItemPayload(existing, req.body || {});
    const result = validateMergedCatalogItem(merged);
    if (!result.ok) return res.status(400).json({ error: result.errors.join(", ") });

    const marketplaceResult = validateMarketplaceFields(merged);
    if (!marketplaceResult.ok) return res.status(400).json({ error: marketplaceResult.errors.join(", ") });

    const hasPricingKey = req.body && Object.prototype.hasOwnProperty.call(req.body, "pricing");
    const pricingResult = hasPricingKey ? validatePricingInput(req.body.pricing) : { ok: true, value: undefined };
    if (!pricingResult.ok) return res.status(400).json({ error: pricingResult.errors.join(", ") });
    if (pricingResult.value && !schemaReady) {
      return res.status(503).json({ error: "ระบบราคาโปรโมชันยังไม่พร้อมใช้งาน (ยังไม่ได้รัน migration)" });
    }

    const hasMarketplaceKey = CATALOG_MARKETPLACE_FIELDS.some((key) => Object.prototype.hasOwnProperty.call(req.body || {}, key));
    if (hasMarketplaceKey && !marketplaceReady) {
      return res.status(503).json({ error: "ระบบ Marketplace ยังไม่พร้อมใช้งาน (ยังไม่ได้รัน migration)" });
    }

    const v = result.value;
    const mv = marketplaceResult.value;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (marketplaceReady) {
        await client.query(
          `UPDATE public.catalog_items
              SET item_name=$1, item_category=$2, base_price=$3, unit_label=$4,
                  job_category=$5, ac_type=$6, btu_min=$7, btu_max=$8,
                  is_active=$9, is_customer_visible=$10,
                  short_description=$11, long_description=$12, highlights=$13, service_conditions=$14,
                  booking_mode=$15, booking_service_key=$16, booking_ac_type=$17, booking_btu=$18,
                  booking_wash_variant=$19, is_featured=$20
            WHERE item_id = $21`,
          [
            v.item_name, v.item_category, v.base_price, v.unit_label, v.job_category, v.ac_type, v.btu_min, v.btu_max, v.is_active, v.is_customer_visible,
            mv.short_description, mv.long_description, mv.highlights ? JSON.stringify(mv.highlights) : null, mv.service_conditions,
            mv.booking_mode, mv.booking_service_key, mv.booking_ac_type, mv.booking_btu, mv.booking_wash_variant, mv.is_featured,
            itemId,
          ]
        );
      } else {
        await client.query(
          `UPDATE public.catalog_items
              SET item_name=$1, item_category=$2, base_price=$3, unit_label=$4,
                  job_category=$5, ac_type=$6, btu_min=$7, btu_max=$8,
                  is_active=$9, is_customer_visible=$10
            WHERE item_id = $11`,
          [v.item_name, v.item_category, v.base_price, v.unit_label, v.job_category, v.ac_type, v.btu_min, v.btu_max, v.is_active, v.is_customer_visible, itemId]
        );
      }

      // pricingResult.value === undefined -> field omitted, leave pricing untouched.
      // pricingResult.value === null      -> caller sent no pricing changes; the existing
      //                                       linked price rule (if any) is preserved as-is.
      // pricingResult.value === {...}     -> create/update the linked price rule.
      if (pricingResult.value) {
        const ruleId = await savePriceRuleForCatalogItem(client, {
          ruleId: existing.price_rule_id || null,
          pricing: pricingResult.value,
          catalogFields: v,
          actor: actorUsername(req),
        });
        if (!existing.price_rule_id) {
          await client.query(`UPDATE public.catalog_items SET price_rule_id=$1 WHERE item_id=$2`, [ruleId, itemId]);
        }
      }

      await client.query("COMMIT");

      const final = await client.query(`${select} WHERE ci.item_id = $1`, [itemId]);
      await attachCatalogImages(pool, final.rows, marketplaceReady);
      res.json(serializeAdminCatalogRow(final.rows[0]));
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(500).json({ error: "แก้ไขรายการไม่สำเร็จ" });
    } finally {
      client.release();
    }
  });

  router.post(
    "/admin/catalog/items/:itemId/image",
    requireAdminSession,
    (req, res, next) => {
      upload.single("image")(req, res, (err) => {
        if (err) {
          if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "ไฟล์รูปภาพใหญ่เกิน 5MB" });
          return res.status(400).json({ error: "อัปโหลดไฟล์ไม่สำเร็จ" });
        }
        next();
      });
    },
    async (req, res) => {
      try {
        const itemId = String(req.params.itemId || "").trim();
        if (!/^\d+$/.test(itemId)) return res.status(400).json({ error: "item_id ไม่ถูกต้อง" });

        const schemaReady = await isMediaPricingSchemaReady(pool);
        if (!schemaReady) {
          return res.status(503).json({ error: "ระบบรูปภาพยังไม่พร้อมใช้งาน (ยังไม่ได้รัน migration)" });
        }

        const existingResult = await pool.query(
          `SELECT item_id, image_public_id FROM public.catalog_items WHERE item_id = $1`,
          [itemId]
        );
        const existing = existingResult.rows[0];
        if (!existing) return res.status(404).json({ error: "ไม่พบรายการนี้" });

        if (!req.file) return res.status(400).json({ error: "ไม่พบไฟล์รูปภาพ" });
        const validation = cloudinaryImageUpload.validateCatalogImageFile(req.file);
        if (!validation.ok) return res.status(400).json({ error: validation.error });

        const uploaded = await uploadCatalogImage({
          buffer: req.file.buffer,
          mimetype: req.file.mimetype,
          itemId,
        });

        await pool.query(
          `UPDATE public.catalog_items SET image_url=$1, image_public_id=$2 WHERE item_id=$3`,
          [uploaded.url, uploaded.public_id, itemId]
        );

        if (existing.image_public_id && existing.image_public_id !== uploaded.public_id) {
          deleteCatalogImage(existing.image_public_id).catch((cleanupError) => {
            console.error("cleanup old catalog image failed", safeImageErrorMessage(cleanupError));
          });
        }

        const marketplaceReady = await isMarketplaceSchemaReady(pool);
        const select = buildCatalogSelect({ pricingReady: true, marketplaceReady });
        const final = await pool.query(`${select} WHERE ci.item_id = $1`, [itemId]);
        await attachCatalogImages(pool, final.rows, marketplaceReady);
        res.json(serializeAdminCatalogRow(final.rows[0]));
      } catch (e) {
        console.error(e);
        if (e && e.code === "CLOUDINARY_NOT_CONFIGURED") {
          return res.status(503).json({ error: "ยังไม่ได้ตั้งค่า Cloudinary" });
        }
        res.status(500).json({ error: "อัปโหลดรูปภาพไม่สำเร็จ" });
      }
    }
  );

  router.delete("/admin/catalog/items/:itemId/image", requireAdminSession, async (req, res) => {
    try {
      const itemId = String(req.params.itemId || "").trim();
      if (!/^\d+$/.test(itemId)) return res.status(400).json({ error: "item_id ไม่ถูกต้อง" });

      const schemaReady = await isMediaPricingSchemaReady(pool);
      if (!schemaReady) {
        return res.status(503).json({ error: "ระบบรูปภาพยังไม่พร้อมใช้งาน (ยังไม่ได้รัน migration)" });
      }

      const existingResult = await pool.query(
        `SELECT item_id, image_public_id FROM public.catalog_items WHERE item_id = $1`,
        [itemId]
      );
      const existing = existingResult.rows[0];
      if (!existing) return res.status(404).json({ error: "ไม่พบรายการนี้" });

      // DB-first: the catalog item's own image fields are the source of truth for the
      // app, so they are cleared unconditionally before touching Cloudinary at all.
      // Cloudinary cleanup is then attempted best-effort — its failure must never block
      // the already-successful database write or fail this HTTP response.
      await pool.query(
        `UPDATE public.catalog_items SET image_url=NULL, image_public_id=NULL WHERE item_id=$1`,
        [itemId]
      );

      if (existing.image_public_id) {
        try {
          await deleteCatalogImage(existing.image_public_id);
        } catch (cleanupError) {
          console.error("cloudinary cleanup after image delete failed", safeImageErrorMessage(cleanupError));
        }
      }

      const marketplaceReady = await isMarketplaceSchemaReady(pool);
      const select = buildCatalogSelect({ pricingReady: true, marketplaceReady });
      const final = await pool.query(`${select} WHERE ci.item_id = $1`, [itemId]);
      await attachCatalogImages(pool, final.rows, marketplaceReady);
      res.json(serializeAdminCatalogRow(final.rows[0]));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "ลบรูปภาพไม่สำเร็จ" });
    }
  });

  // ---- Multi-image gallery management (marketplace v2) ----
  // catalog_item_images is the gallery store; the legacy single image_url/image_public_id
  // pair above remains untouched and is only used as a fallback when an item has zero rows
  // in catalog_item_images (see serializeCatalogRow).

  router.get("/admin/catalog/items/:itemId/images", requireAdminSession, async (req, res) => {
    try {
      const itemId = String(req.params.itemId || "").trim();
      if (!/^\d+$/.test(itemId)) return res.status(400).json({ error: "item_id ไม่ถูกต้อง" });

      const marketplaceReady = await isMarketplaceSchemaReady(pool);
      if (!marketplaceReady) {
        return res.status(503).json({ error: "ระบบ Marketplace ยังไม่พร้อมใช้งาน (ยังไม่ได้รัน migration)" });
      }

      const r = await pool.query(
        `SELECT image_id, item_id, image_url, image_public_id, alt_text, sort_order, is_primary
           FROM public.catalog_item_images WHERE item_id = $1 ORDER BY sort_order, image_id`,
        [itemId]
      );
      res.json(r.rows.map(serializeCatalogImage));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "โหลดรูปภาพไม่สำเร็จ" });
    }
  });

  router.post(
    "/admin/catalog/items/:itemId/images",
    requireAdminSession,
    (req, res, next) => {
      upload.single("image")(req, res, (err) => {
        if (err) {
          if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "ไฟล์รูปภาพใหญ่เกิน 5MB" });
          return res.status(400).json({ error: "อัปโหลดไฟล์ไม่สำเร็จ" });
        }
        next();
      });
    },
    async (req, res) => {
      try {
        const itemId = String(req.params.itemId || "").trim();
        if (!/^\d+$/.test(itemId)) return res.status(400).json({ error: "item_id ไม่ถูกต้อง" });

        const marketplaceReady = await isMarketplaceSchemaReady(pool);
        if (!marketplaceReady) {
          return res.status(503).json({ error: "ระบบ Marketplace ยังไม่พร้อมใช้งาน (ยังไม่ได้รัน migration)" });
        }

        const existingResult = await pool.query(`SELECT item_id FROM public.catalog_items WHERE item_id = $1`, [itemId]);
        if (!existingResult.rows[0]) return res.status(404).json({ error: "ไม่พบรายการนี้" });

        if (!req.file) return res.status(400).json({ error: "ไม่พบไฟล์รูปภาพ" });
        const validation = cloudinaryImageUpload.validateCatalogImageFile(req.file);
        if (!validation.ok) return res.status(400).json({ error: validation.error });

        const countResult = await pool.query(
          `SELECT COUNT(*)::int AS cnt, COALESCE(MAX(sort_order), -1) AS max_sort
             FROM public.catalog_item_images WHERE item_id = $1`,
          [itemId]
        );
        const isFirstImage = Number(countResult.rows[0].cnt) === 0;
        const nextSortOrder = Number(countResult.rows[0].max_sort) + 1;

        const altText = parseOptionalText(req.body && req.body.alt_text, "alt_text", 200);
        if (!altText.ok) return res.status(400).json({ error: altText.error });

        const uploaded = await uploadCatalogImage({
          buffer: req.file.buffer,
          mimetype: req.file.mimetype,
          itemId,
        });

        const inserted = await pool.query(
          `INSERT INTO public.catalog_item_images (item_id, image_url, image_public_id, alt_text, sort_order, is_primary)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING image_id, item_id, image_url, image_public_id, alt_text, sort_order, is_primary`,
          [itemId, uploaded.url, uploaded.public_id, altText.value, nextSortOrder, isFirstImage]
        );

        res.status(201).json(serializeCatalogImage(inserted.rows[0]));
      } catch (e) {
        console.error(e);
        if (e && e.code === "CLOUDINARY_NOT_CONFIGURED") {
          return res.status(503).json({ error: "ยังไม่ได้ตั้งค่า Cloudinary" });
        }
        res.status(500).json({ error: "อัปโหลดรูปภาพไม่สำเร็จ" });
      }
    }
  );

  router.delete("/admin/catalog/items/:itemId/images/:imageId", requireAdminSession, async (req, res) => {
    try {
      const itemId = String(req.params.itemId || "").trim();
      const imageId = String(req.params.imageId || "").trim();
      if (!/^\d+$/.test(itemId) || !/^\d+$/.test(imageId)) return res.status(400).json({ error: "พารามิเตอร์ไม่ถูกต้อง" });

      const marketplaceReady = await isMarketplaceSchemaReady(pool);
      if (!marketplaceReady) {
        return res.status(503).json({ error: "ระบบ Marketplace ยังไม่พร้อมใช้งาน (ยังไม่ได้รัน migration)" });
      }

      const existingResult = await pool.query(
        `SELECT image_id, item_id, image_public_id, is_primary FROM public.catalog_item_images WHERE image_id = $1 AND item_id = $2`,
        [imageId, itemId]
      );
      const existing = existingResult.rows[0];
      if (!existing) return res.status(404).json({ error: "ไม่พบรูปภาพนี้" });

      // DB-first, same as the legacy single-image delete route, but here Cloudinary
      // cleanup result is reported back to the caller (not merely best-effort/fire-and-
      // forget) since the row itself is now gone for good and there is nothing further
      // to retry from — the caller deserves to know if the asset truly disappeared.
      await pool.query(`DELETE FROM public.catalog_item_images WHERE image_id = $1`, [imageId]);

      if (existing.is_primary) {
        const promoted = await pool.query(
          `UPDATE public.catalog_item_images SET is_primary = TRUE
             WHERE image_id = (
               SELECT image_id FROM public.catalog_item_images WHERE item_id = $1 ORDER BY sort_order, image_id LIMIT 1
             )
           RETURNING image_id`,
          [itemId]
        );
        void promoted;
      }

      let cloudinaryResult = { ok: true, skipped: true };
      try {
        cloudinaryResult = await deleteCatalogImage(existing.image_public_id);
      } catch (cleanupError) {
        console.error("cloudinary cleanup after gallery image delete failed", safeImageErrorMessage(cleanupError));
        return res.status(207).json({
          deleted: true,
          cloudinary_deleted: false,
          cloudinary_error: safeImageErrorMessage(cleanupError),
        });
      }

      res.json({ deleted: true, cloudinary_deleted: Boolean(cloudinaryResult.ok), cloudinary_result: cloudinaryResult.result || null });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "ลบรูปภาพไม่สำเร็จ" });
    }
  });

  router.post("/admin/catalog/items/:itemId/images/:imageId/primary", requireAdminSession, async (req, res) => {
    try {
      const itemId = String(req.params.itemId || "").trim();
      const imageId = String(req.params.imageId || "").trim();
      if (!/^\d+$/.test(itemId) || !/^\d+$/.test(imageId)) return res.status(400).json({ error: "พารามิเตอร์ไม่ถูกต้อง" });

      const marketplaceReady = await isMarketplaceSchemaReady(pool);
      if (!marketplaceReady) {
        return res.status(503).json({ error: "ระบบ Marketplace ยังไม่พร้อมใช้งาน (ยังไม่ได้รัน migration)" });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const target = await client.query(
          `SELECT image_id FROM public.catalog_item_images WHERE image_id = $1 AND item_id = $2`,
          [imageId, itemId]
        );
        if (!target.rows[0]) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "ไม่พบรูปภาพนี้" });
        }
        await client.query(`UPDATE public.catalog_item_images SET is_primary = FALSE WHERE item_id = $1`, [itemId]);
        await client.query(`UPDATE public.catalog_item_images SET is_primary = TRUE WHERE image_id = $1`, [imageId]);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }

      const r = await pool.query(
        `SELECT image_id, item_id, image_url, image_public_id, alt_text, sort_order, is_primary
           FROM public.catalog_item_images WHERE item_id = $1 ORDER BY sort_order, image_id`,
        [itemId]
      );
      res.json(r.rows.map(serializeCatalogImage));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "ตั้งรูปหลักไม่สำเร็จ" });
    }
  });

  router.post("/admin/catalog/items/:itemId/images/reorder", requireAdminSession, async (req, res) => {
    try {
      const itemId = String(req.params.itemId || "").trim();
      if (!/^\d+$/.test(itemId)) return res.status(400).json({ error: "item_id ไม่ถูกต้อง" });

      const marketplaceReady = await isMarketplaceSchemaReady(pool);
      if (!marketplaceReady) {
        return res.status(503).json({ error: "ระบบ Marketplace ยังไม่พร้อมใช้งาน (ยังไม่ได้รัน migration)" });
      }

      const imageIds = Array.isArray(req.body && req.body.image_ids) ? req.body.image_ids : null;
      if (!imageIds || !imageIds.length || !imageIds.every((id) => /^\d+$/.test(String(id)))) {
        return res.status(400).json({ error: "image_ids ต้องเป็นรายการ image_id" });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const existing = await client.query(`SELECT image_id FROM public.catalog_item_images WHERE item_id = $1`, [itemId]);
        const existingIds = new Set(existing.rows.map((row) => String(row.image_id)));
        const requestedIds = imageIds.map(String);
        const requestedIdSet = new Set(requestedIds);
        if (
          requestedIds.length !== existingIds.size ||
          requestedIdSet.size !== existingIds.size ||
          !requestedIds.every((id) => existingIds.has(id))
        ) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "image_ids ต้องครบทุกรูปของรายการนี้ และไม่มีรายการซ้ำ" });
        }
        for (let i = 0; i < requestedIds.length; i += 1) {
          await client.query(
            `UPDATE public.catalog_item_images SET sort_order = $1 WHERE image_id = $2 AND item_id = $3`,
            [i, requestedIds[i], itemId]
          );
        }
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }

      const r = await pool.query(
        `SELECT image_id, item_id, image_url, image_public_id, alt_text, sort_order, is_primary
           FROM public.catalog_item_images WHERE item_id = $1 ORDER BY sort_order, image_id`,
        [itemId]
      );
      res.json(r.rows.map(serializeCatalogImage));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "จัดเรียงรูปภาพไม่สำเร็จ" });
    }
  });

  return router;
};

module.exports.computeEffectivePricing = computeEffectivePricing;
module.exports.serializeCatalogRow = serializeCatalogRow;
module.exports.serializeCatalogDetailRow = serializeCatalogDetailRow;
module.exports.serializeAdminCatalogRow = serializeAdminCatalogRow;
module.exports.serializeCatalogImage = serializeCatalogImage;
module.exports.validatePricingInput = validatePricingInput;
module.exports.validateMarketplaceFields = validateMarketplaceFields;
module.exports.buildCatalogSelect = buildCatalogSelect;
