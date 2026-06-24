const { money, intOrNull, boolish } = require("../../customerPricing");
const cloudinaryImageUpload = require("../../lib/cloudinaryImageUpload");

const MAX_CATALOG_IMAGES_PER_ITEM = 4;

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
  "booking_wash_variant", "is_featured", "is_autoplay_enabled",
];

// HOT badge field (migrations/20260623_catalog_store_hot_sale_reviews.sql). Kept as
// its own whitelist, mirroring CATALOG_MARKETPLACE_FIELDS, since it ships in a later
// migration and needs its own independent schema-readiness gate.
const CATALOG_HOT_FIELDS = ["is_hot"];

const BOOKING_MODES = new Set(["bookable", "contact_admin"]);

// Allowed values must match the Customer App's canonical lists exactly
// (customer-app/modules/services.js: acTypes/btuOptions/washVariants) so a
// "bookable" catalog item can never carry a value the booking flow can't
// actually handle.
const ALLOWED_BOOKING_AC_TYPES = new Set(["ผนัง", "สี่ทิศทาง", "แขวน", "เปลือยใต้ฝ้า"]);
const ALLOWED_BOOKING_BTU = new Set([9000, 12000, 18000, 24000, 30000]);
const ALLOWED_BOOKING_WASH_VARIANTS = new Set(["ล้างธรรมดา", "ล้างพรีเมียม", "ล้างแขวนคอยล์", "ล้างแบบตัดล้าง"]);
const WALL_AC_TYPE = "ผนัง";

function mergeCatalogItemPayload(existing, body) {
  const merged = {};
  CATALOG_ITEM_FIELDS.forEach((key) => {
    merged[key] = Object.prototype.hasOwnProperty.call(body, key) ? body[key] : existing[key];
  });
  CATALOG_MARKETPLACE_FIELDS.forEach((key) => {
    merged[key] = Object.prototype.hasOwnProperty.call(body, key) ? body[key] : existing[key];
  });
  CATALOG_HOT_FIELDS.forEach((key) => {
    merged[key] = Object.prototype.hasOwnProperty.call(body, key) ? body[key] : existing[key];
  });
  return merged;
}

function validateHotField(merged) {
  const isHotResult = normalizeBoolean(
    Object.prototype.hasOwnProperty.call(merged, "is_hot") && merged.is_hot !== undefined && merged.is_hot !== null && merged.is_hot !== ""
      ? merged.is_hot
      : false,
    "is_hot"
  );
  if (!isHotResult.ok) return { ok: false, errors: [isHotResult.error] };
  return { ok: true, value: { is_hot: isHotResult.value } };
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

  const isAutoplayEnabledResult = normalizeBoolean(
    Object.prototype.hasOwnProperty.call(merged, "is_autoplay_enabled") && merged.is_autoplay_enabled !== undefined && merged.is_autoplay_enabled !== null && merged.is_autoplay_enabled !== ""
      ? merged.is_autoplay_enabled
      : true,
    "is_autoplay_enabled"
  );
  if (!isAutoplayEnabledResult.ok) errors.push(isAutoplayEnabledResult.error);

  // booking_service_key is metadata only — the customer app doesn't consume it
  // for prefill yet, so it must never be treated as sufficient on its own. A
  // bookable item must carry a real, supported ac_type + btu (and, for wall
  // units, a supported wash_variant), or the booking screen can't be opened
  // deterministically.
  if (bookingMode === "bookable") {
    const acType = bookingAcTypeResult.value;
    const btu = bookingBtuResult.value !== null ? Math.round(bookingBtuResult.value) : null;
    const washVariant = bookingWashVariantResult.value;

    if (!acType || !ALLOWED_BOOKING_AC_TYPES.has(acType)) {
      errors.push(`รายการที่เป็น bookable ต้องระบุ booking_ac_type เป็นหนึ่งใน: ${Array.from(ALLOWED_BOOKING_AC_TYPES).join(", ")}`);
    }
    if (!btu || !ALLOWED_BOOKING_BTU.has(btu)) {
      errors.push(`รายการที่เป็น bookable ต้องระบุ booking_btu เป็นหนึ่งใน: ${Array.from(ALLOWED_BOOKING_BTU).join(", ")}`);
    }
    if (acType === WALL_AC_TYPE && (!washVariant || !ALLOWED_BOOKING_WASH_VARIANTS.has(washVariant))) {
      errors.push(`รายการแอร์ผนังที่เป็น bookable ต้องระบุ booking_wash_variant เป็นหนึ่งใน: ${Array.from(ALLOWED_BOOKING_WASH_VARIANTS).join(", ")}`);
    }
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
      is_autoplay_enabled: isAutoplayEnabledResult.value,
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

// Adds the additive auto-slide column (migrations/<date>_catalog_store_autoplay.sql) on top
// of CATALOG_SELECT_MARKETPLACE. Kept as its own tier (rather than folded permanently into
// CATALOG_SELECT_MARKETPLACE) so the column is only ever referenced once its own migration
// has actually run, independent of when marketplace v2 itself ran.
const CATALOG_SELECT_MARKETPLACE_AUTOPLAY = `
  SELECT ci.item_id, ci.item_name, ci.item_category, ci.base_price, ci.unit_label, ci.is_active,
         ci.job_category, ci.ac_type, ci.btu_min, ci.btu_max, ci.is_customer_visible,
         ci.image_url, ci.image_public_id, ci.price_rule_id,
         ci.short_description, ci.long_description, ci.highlights, ci.service_conditions,
         ci.booking_mode, ci.booking_service_key, ci.booking_ac_type, ci.booking_btu,
         ci.booking_wash_variant, ci.is_featured, ci.is_autoplay_enabled,
         pr.normal_price AS rule_normal_price, pr.active_price AS rule_active_price,
         pr.campaign_name AS rule_campaign_name, pr.is_active AS rule_is_active,
         pr.effective_from AS rule_effective_from, pr.effective_to AS rule_effective_to,
         pr.wash_variant AS rule_wash_variant, pr.label AS rule_label, pr.priority AS rule_priority
  FROM public.catalog_items ci
  LEFT JOIN public.customer_service_price_rules pr ON pr.rule_id = ci.price_rule_id
`;

// Adds the additive is_hot badge column (migrations/20260623_catalog_store_hot_sale_reviews.sql)
// on top of CATALOG_SELECT_MARKETPLACE_AUTOPLAY. Kept as its own tier so is_hot is only ever
// read/written once its own migration has actually run, regardless of autoplay's state.
const CATALOG_SELECT_FULL = `
  SELECT ci.item_id, ci.item_name, ci.item_category, ci.base_price, ci.unit_label, ci.is_active,
         ci.job_category, ci.ac_type, ci.btu_min, ci.btu_max, ci.is_customer_visible,
         ci.image_url, ci.image_public_id, ci.price_rule_id,
         ci.short_description, ci.long_description, ci.highlights, ci.service_conditions,
         ci.booking_mode, ci.booking_service_key, ci.booking_ac_type, ci.booking_btu,
         ci.booking_wash_variant, ci.is_featured, ci.is_autoplay_enabled, ci.is_hot,
         pr.normal_price AS rule_normal_price, pr.active_price AS rule_active_price,
         pr.campaign_name AS rule_campaign_name, pr.is_active AS rule_is_active,
         pr.effective_from AS rule_effective_from, pr.effective_to AS rule_effective_to,
         pr.wash_variant AS rule_wash_variant, pr.label AS rule_label, pr.priority AS rule_priority
  FROM public.catalog_items ci
  LEFT JOIN public.customer_service_price_rules pr ON pr.rule_id = ci.price_rule_id
`;

// Five-tier capability-driven SELECT: legacy (day one) -> +media/pricing -> +marketplace v2
// -> +autoplay -> +hot badge. Building from flags (rather than hand-written constants per
// combination) keeps later tiers from drifting out of sync with earlier ones as all evolve.
function buildCatalogSelect({ pricingReady, marketplaceReady, autoplayReady, hotReady }) {
  if (marketplaceReady && autoplayReady && hotReady) return CATALOG_SELECT_FULL;
  if (marketplaceReady && autoplayReady) return CATALOG_SELECT_MARKETPLACE_AUTOPLAY;
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

// Same migration as catalog_item_reviews; gates whether rating aggregation
// can take admin-assigned reviews (assigned_item_id, set on originally
// ambiguous service_type/overall-scoped tracking reviews) into account.
let reviewAssignmentSchemaReadyCache = false;
async function isReviewAssignmentSchemaReady(pool) {
  if (reviewAssignmentSchemaReadyCache) return true;
  const r = await pool.query(`
    SELECT COUNT(*)::int AS cnt FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'catalog_item_reviews' AND column_name = 'assigned_item_id'
  `);
  const ready = Number(r.rows?.[0]?.cnt || 0) === 1;
  if (ready) reviewAssignmentSchemaReadyCache = true;
  return ready;
}

// Attaches real review aggregates (approved reviews only) to each row in a single
// grouped query, so the Store list never N+1s one rating query per item. Mirrors
// attachCatalogImages's idiom. When the reviews schema hasn't been migrated yet
// (or there are zero approved reviews), rows get rating_average=null/review_count=0
// — never a fabricated default — so the renderer must show the honest "no reviews
// yet" state. Once admin-assigned (assigned_item_id) takes effect, a review counts
// toward the assigned item instead of its original item_id (which may be NULL for
// service_type/overall-scoped reviews).
async function attachCatalogRatings(pool, rows, reviewsReady) {
  if (!reviewsReady || !rows.length) {
    rows.forEach((row) => { row.rating_average = null; row.review_count = 0; });
    return rows;
  }
  const assignmentReady = await isReviewAssignmentSchemaReady(pool);
  if (assignmentReady) {
    const ids = rows.map((row) => row.item_id);
    const r = await pool.query(
      `SELECT COALESCE(assigned_item_id, item_id) AS effective_item_id,
              AVG(rating)::numeric AS rating_average, COUNT(*)::int AS review_count
         FROM public.catalog_item_reviews
        WHERE COALESCE(assigned_item_id, item_id) = ANY($1::bigint[]) AND moderation_status = 'approved'
        GROUP BY effective_item_id`,
      [ids]
    );
    const byItem = new Map(r.rows.map((row) => [Number(row.effective_item_id), row]));
    rows.forEach((row) => {
      const agg = byItem.get(Number(row.item_id));
      row.rating_average = agg ? Number(agg.rating_average) : null;
      row.review_count = agg ? Number(agg.review_count) : 0;
    });
    return rows;
  }
  const ids = rows.map((row) => row.item_id);
  const r = await pool.query(
    `SELECT item_id, AVG(rating)::numeric AS rating_average, COUNT(*)::int AS review_count
       FROM public.catalog_item_reviews
      WHERE item_id = ANY($1::bigint[]) AND moderation_status = 'approved'
      GROUP BY item_id`,
    [ids]
  );
  const byItem = new Map(r.rows.map((row) => [Number(row.item_id), row]));
  rows.forEach((row) => {
    const agg = byItem.get(Number(row.item_id));
    row.rating_average = agg ? Number(agg.rating_average) : null;
    row.review_count = agg ? Number(agg.review_count) : 0;
  });
  return rows;
}

// Real booking counts only ("จองแล้ว X งาน"). Counts DISTINCT job_id so a job
// with multiple machines/units never inflates the count beyond 1 per job.
// Excludes cancelled/rejected jobs; there is no test/soft-delete marker on
// public.jobs to additionally exclude (verified against the schema this
// migration extends).
const { EXCLUDED_BOOKING_JOB_STATUSES, bulkResolveHistoricalItemMatches } = require("../../lib/historicalServiceResolver");

// Attaches a real, live booking_count to each row in exactly two grouped
// queries total (never one query per item), mirroring attachCatalogRatings's
// idiom. Counts both Admin- and Customer-created jobs equally (job_status/
// catalog_item_id linkage doesn't distinguish job_source).
//
// Two sources are combined:
//   1. Direct: jobs.catalog_item_id set explicitly at booking time (new jobs).
//   2. Historical: jobs with no catalog_item_id, matched deterministically via
//      the shared historical-service resolver (server/lib/historicalServiceResolver.js)
//      -- the same matching rule reused by tracking-review target derivation.
async function attachBookingCounts(pool, rows, jobsCatalogLinkReady) {
  rows.forEach((row) => { row.booking_count = 0; });
  if (!jobsCatalogLinkReady || !rows.length) return rows;

  const ids = rows.map((row) => Number(row.item_id));
  const byItem = new Map();

  const direct = await pool.query(
    `SELECT catalog_item_id AS item_id, COUNT(DISTINCT job_id)::int AS cnt
       FROM public.jobs
      WHERE catalog_item_id = ANY($1::bigint[])
        AND COALESCE(job_status, '') NOT IN (${EXCLUDED_BOOKING_JOB_STATUSES.map((_, i) => `$${i + 2}`).join(", ")})
        AND canceled_at IS NULL
      GROUP BY catalog_item_id`,
    [ids, ...EXCLUDED_BOOKING_JOB_STATUSES]
  );
  direct.rows.forEach((r) => byItem.set(Number(r.item_id), Number(r.cnt)));

  const historical = await bulkResolveHistoricalItemMatches(pool, ids);
  historical.forEach((cnt, id) => {
    byItem.set(id, (byItem.get(id) || 0) + cnt);
  });

  rows.forEach((row) => { row.booking_count = byItem.get(Number(row.item_id)) || 0; });
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
  // Primary image must render first regardless of sort_order, since "Primary"
  // is the field admins actually use to choose the lead photo.
  const orderedGalleryRows = galleryRows.length
    ? [...galleryRows].sort((a, b) => {
      const aPrimary = a.is_primary ? 0 : 1;
      const bPrimary = b.is_primary ? 0 : 1;
      if (aPrimary !== bPrimary) return aPrimary - bPrimary;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.image_id ?? 0) - (b.image_id ?? 0);
    })
    : galleryRows;
  const images = orderedGalleryRows.length
    ? orderedGalleryRows.map(serializeCatalogImage)
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
    // Needed on the list endpoint so the Store card's "book" button can build a
    // real booking draft without a follow-up detail fetch. booking_service_key is
    // intentionally omitted here: the frontend never uses it for booking, only
    // the detail/admin DTOs need it.
    booking_ac_type: row.booking_mode === "bookable" ? (row.booking_ac_type || null) : null,
    booking_btu: row.booking_mode === "bookable" ? (row.booking_btu || null) : null,
    booking_wash_variant: row.booking_mode === "bookable" ? (row.booking_wash_variant || null) : null,
    is_featured: Boolean(row.is_featured),
    // Fail-safe disabled: row.is_autoplay_enabled is undefined until the autoplay
    // migration has actually run, and a pre-migration item must never be silently
    // treated as autoplay-enabled.
    is_autoplay_enabled: row.is_autoplay_enabled === undefined ? false : Boolean(row.is_autoplay_enabled),
    // Fail-safe disabled, same idiom: a pre-migration item is never silently HOT.
    is_hot: Boolean(row.is_hot),
    // Real review aggregates only (approved reviews); attachCatalogRatings() sets
    // these to rating_average=null/review_count=0 when there are no real reviews
    // yet — the renderer must treat that as "no reviews", never a fabricated score.
    rating_average: row.rating_average == null ? null : Number(row.rating_average),
    review_count: Number(row.review_count || 0),
    // Real COUNT(DISTINCT job_id) only (attachBookingCounts); 0 until the jobs
    // catalog-link migration has run -- never a fabricated/hardcoded number.
    booking_count: Number(row.booking_count || 0),
  };
}

// Public detail DTO: everything serializeCatalogRow has, plus the long-form
// content and the booking_service_key a product detail page needs.
function serializeCatalogDetailRow(row) {
  const base = serializeCatalogRow(row);
  return {
    ...base,
    long_description: row.long_description || null,
    service_conditions: row.service_conditions || null,
    booking_service_key: row.booking_mode === "bookable" ? (row.booking_service_key || null) : null,
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

  // Mirrors the same capability-check idiom for the additive auto-slide column
  // (migrations/<date>_catalog_store_autoplay.sql). Kept independent of
  // isMarketplaceSchemaReady so is_autoplay_enabled is only ever read/written once
  // its own migration has actually run, regardless of marketplace v2's state.
  let autoplaySchemaReadyCache = false;
  async function isAutoplaySchemaReady(db) {
    if (autoplaySchemaReadyCache) return true;
    const r = await db.query(`
      SELECT COUNT(*)::int AS cnt
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'catalog_items'
        AND column_name = 'is_autoplay_enabled'
    `);
    const ready = Number(r.rows?.[0]?.cnt || 0) === 1;
    if (ready) autoplaySchemaReadyCache = true;
    return ready;
  }

  // Mirrors the same capability-check idiom for the additive HOT badge column
  // (migrations/20260623_catalog_store_hot_sale_reviews.sql).
  let hotSchemaReadyCache = false;
  async function isHotSchemaReady(db) {
    if (hotSchemaReadyCache) return true;
    const r = await db.query(`
      SELECT COUNT(*)::int AS cnt
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'catalog_items'
        AND column_name = 'is_hot'
    `);
    const ready = Number(r.rows?.[0]?.cnt || 0) === 1;
    if (ready) hotSchemaReadyCache = true;
    return ready;
  }

  // Same migration adds public.catalog_item_reviews; gated independently since a
  // deployment could in principle have is_hot but not yet have run far enough for
  // the table (both ship in the same file, but this stays defensive/explicit).
  let reviewsSchemaReadyCache = false;
  async function isReviewsSchemaReady(db) {
    if (reviewsSchemaReadyCache) return true;
    const r = await db.query(`SELECT to_regclass('public.catalog_item_reviews') AS reg`);
    const ready = Boolean(r.rows?.[0]?.reg);
    if (ready) reviewsSchemaReadyCache = true;
    return ready;
  }

  // Same migration as is_hot/catalog_item_reviews; gates booking_count
  // aggregation (attachBookingCounts) on jobs.catalog_item_id actually existing.
  let jobsCatalogLinkSchemaReadyCache = false;
  async function isJobsCatalogLinkSchemaReady(db) {
    if (jobsCatalogLinkSchemaReadyCache) return true;
    const r = await db.query(`
      SELECT COUNT(*)::int AS cnt
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'jobs'
        AND column_name IN ('catalog_item_id', 'customer_sub')
    `);
    const ready = Number(r.rows?.[0]?.cnt || 0) === 2;
    if (ready) jobsCatalogLinkSchemaReadyCache = true;
    return ready;
  }

  router.get("/catalog/items", async (req, res) => {
    try {
      const pricingReady = await isMediaPricingSchemaReady(pool);
      const marketplaceReady = await isMarketplaceSchemaReady(pool);
      const autoplayReady = await isAutoplaySchemaReady(pool);
      const hotReady = await isHotSchemaReady(pool);
      const reviewsReady = await isReviewsSchemaReady(pool);
      const jobsCatalogLinkReady = await isJobsCatalogLinkSchemaReady(pool);
      const select = buildCatalogSelect({ pricingReady, marketplaceReady, autoplayReady, hotReady });
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
      await attachCatalogRatings(pool, r.rows, reviewsReady);
      await attachBookingCounts(pool, r.rows, jobsCatalogLinkReady);
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
      const autoplayReady = await isAutoplaySchemaReady(pool);
      const hotReady = await isHotSchemaReady(pool);
      const reviewsReady = await isReviewsSchemaReady(pool);
      const jobsCatalogLinkReady = await isJobsCatalogLinkSchemaReady(pool);
      const select = buildCatalogSelect({ pricingReady, marketplaceReady, autoplayReady, hotReady });

      const r = await pool.query(
        `${select} WHERE ci.item_id = $1 AND ci.is_active = TRUE AND ci.is_customer_visible = TRUE`,
        [itemId]
      );
      const row = r.rows[0];
      if (!row) return res.status(404).json({ error: "ไม่พบรายการนี้" });
      await attachCatalogImages(pool, [row], marketplaceReady);
      await attachCatalogRatings(pool, [row], reviewsReady);
      await attachBookingCounts(pool, [row], jobsCatalogLinkReady);
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
      const autoplayReady = await isAutoplaySchemaReady(pool);
      const hotReady = await isHotSchemaReady(pool);
      const reviewsReady = await isReviewsSchemaReady(pool);
      const jobsCatalogLinkReady = await isJobsCatalogLinkSchemaReady(pool);
      const select = buildCatalogSelect({ pricingReady, marketplaceReady, autoplayReady, hotReady });
      const r = await pool.query(`${select} ORDER BY ci.item_category, ci.item_name`);
      await attachCatalogImages(pool, r.rows, marketplaceReady);
      await attachCatalogRatings(pool, r.rows, reviewsReady);
      await attachBookingCounts(pool, r.rows, jobsCatalogLinkReady);
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

    const hotResult = validateHotField(merged);
    if (!hotResult.ok) return res.status(400).json({ error: hotResult.errors.join(", ") });

    const hasPricingKey = req.body && Object.prototype.hasOwnProperty.call(req.body, "pricing");
    const pricingResult = hasPricingKey ? validatePricingInput(req.body.pricing) : { ok: true, value: undefined };
    if (!pricingResult.ok) return res.status(400).json({ error: pricingResult.errors.join(", ") });

    const hasMarketplaceKey = CATALOG_MARKETPLACE_FIELDS.some((key) => Object.prototype.hasOwnProperty.call(req.body || {}, key));
    const hasHotKey = CATALOG_HOT_FIELDS.some((key) => Object.prototype.hasOwnProperty.call(req.body || {}, key));
    const schemaReady = await isMediaPricingSchemaReady(pool);
    const marketplaceReady = await isMarketplaceSchemaReady(pool);
    const autoplayReady = await isAutoplaySchemaReady(pool);
    const hotReady = await isHotSchemaReady(pool);
    if (pricingResult.value && !schemaReady) {
      return res.status(503).json({ error: "ระบบราคาโปรโมชันยังไม่พร้อมใช้งาน (ยังไม่ได้รัน migration)" });
    }
    if (hasMarketplaceKey && !marketplaceReady) {
      return res.status(503).json({ error: "ระบบ Marketplace ยังไม่พร้อมใช้งาน (ยังไม่ได้รัน migration)" });
    }
    if (hasHotKey && !hotReady) {
      return res.status(503).json({ error: "ระบบ HOT badge ยังไม่พร้อมใช้งาน (ยังไม่ได้รัน migration)" });
    }

    const v = result.value;
    const mv = marketplaceResult.value;
    const hv = hotResult.value;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      let insertRes;
      if (marketplaceReady && autoplayReady && hotReady) {
        insertRes = await client.query(
          `INSERT INTO public.catalog_items
             (item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible,
              short_description, long_description, highlights, service_conditions,
              booking_mode, booking_service_key, booking_ac_type, booking_btu, booking_wash_variant, is_featured, is_autoplay_enabled, is_hot)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
           RETURNING item_id`,
          [
            v.item_name, v.item_category, v.base_price, v.unit_label, v.job_category, v.ac_type, v.btu_min, v.btu_max, v.is_active, v.is_customer_visible,
            mv.short_description, mv.long_description, mv.highlights ? JSON.stringify(mv.highlights) : null, mv.service_conditions,
            mv.booking_mode, mv.booking_service_key, mv.booking_ac_type, mv.booking_btu, mv.booking_wash_variant, mv.is_featured, mv.is_autoplay_enabled, hv.is_hot,
          ]
        );
      } else if (marketplaceReady && autoplayReady) {
        insertRes = await client.query(
          `INSERT INTO public.catalog_items
             (item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible,
              short_description, long_description, highlights, service_conditions,
              booking_mode, booking_service_key, booking_ac_type, booking_btu, booking_wash_variant, is_featured, is_autoplay_enabled)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
           RETURNING item_id`,
          [
            v.item_name, v.item_category, v.base_price, v.unit_label, v.job_category, v.ac_type, v.btu_min, v.btu_max, v.is_active, v.is_customer_visible,
            mv.short_description, mv.long_description, mv.highlights ? JSON.stringify(mv.highlights) : null, mv.service_conditions,
            mv.booking_mode, mv.booking_service_key, mv.booking_ac_type, mv.booking_btu, mv.booking_wash_variant, mv.is_featured, mv.is_autoplay_enabled,
          ]
        );
      } else if (marketplaceReady) {
        insertRes = await client.query(
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
        );
      } else {
        insertRes = await client.query(
          `INSERT INTO public.catalog_items
             (item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING item_id`,
          [v.item_name, v.item_category, v.base_price, v.unit_label, v.job_category, v.ac_type, v.btu_min, v.btu_max, v.is_active, v.is_customer_visible]
        );
      }
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

      const select = buildCatalogSelect({ pricingReady: schemaReady, marketplaceReady, autoplayReady, hotReady });
      const final = await client.query(`${select} WHERE ci.item_id = $1`, [itemId]);
      await attachCatalogImages(client, final.rows, marketplaceReady);
      await attachCatalogRatings(client, final.rows, await isReviewsSchemaReady(client));
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
    const autoplayReady = await isAutoplaySchemaReady(pool);
    const hotReady = await isHotSchemaReady(pool);
    const select = buildCatalogSelect({ pricingReady: schemaReady, marketplaceReady, autoplayReady, hotReady });
    const existingResult = await pool.query(`${select} WHERE ci.item_id = $1`, [itemId]);
    const existing = existingResult.rows[0];
    if (!existing) return res.status(404).json({ error: "ไม่พบรายการนี้" });

    const merged = mergeCatalogItemPayload(existing, req.body || {});
    const result = validateMergedCatalogItem(merged);
    if (!result.ok) return res.status(400).json({ error: result.errors.join(", ") });

    const marketplaceResult = validateMarketplaceFields(merged);
    if (!marketplaceResult.ok) return res.status(400).json({ error: marketplaceResult.errors.join(", ") });

    const hotResult = validateHotField(merged);
    if (!hotResult.ok) return res.status(400).json({ error: hotResult.errors.join(", ") });

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

    const hasHotKey = CATALOG_HOT_FIELDS.some((key) => Object.prototype.hasOwnProperty.call(req.body || {}, key));
    if (hasHotKey && !hotReady) {
      return res.status(503).json({ error: "ระบบ HOT badge ยังไม่พร้อมใช้งาน (ยังไม่ได้รัน migration)" });
    }

    const v = result.value;
    const mv = marketplaceResult.value;
    const hv = hotResult.value;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (marketplaceReady && autoplayReady && hotReady) {
        await client.query(
          `UPDATE public.catalog_items
              SET item_name=$1, item_category=$2, base_price=$3, unit_label=$4,
                  job_category=$5, ac_type=$6, btu_min=$7, btu_max=$8,
                  is_active=$9, is_customer_visible=$10,
                  short_description=$11, long_description=$12, highlights=$13, service_conditions=$14,
                  booking_mode=$15, booking_service_key=$16, booking_ac_type=$17, booking_btu=$18,
                  booking_wash_variant=$19, is_featured=$20, is_autoplay_enabled=$21, is_hot=$22
            WHERE item_id = $23`,
          [
            v.item_name, v.item_category, v.base_price, v.unit_label, v.job_category, v.ac_type, v.btu_min, v.btu_max, v.is_active, v.is_customer_visible,
            mv.short_description, mv.long_description, mv.highlights ? JSON.stringify(mv.highlights) : null, mv.service_conditions,
            mv.booking_mode, mv.booking_service_key, mv.booking_ac_type, mv.booking_btu, mv.booking_wash_variant, mv.is_featured, mv.is_autoplay_enabled, hv.is_hot,
            itemId,
          ]
        );
      } else if (marketplaceReady && autoplayReady) {
        await client.query(
          `UPDATE public.catalog_items
              SET item_name=$1, item_category=$2, base_price=$3, unit_label=$4,
                  job_category=$5, ac_type=$6, btu_min=$7, btu_max=$8,
                  is_active=$9, is_customer_visible=$10,
                  short_description=$11, long_description=$12, highlights=$13, service_conditions=$14,
                  booking_mode=$15, booking_service_key=$16, booking_ac_type=$17, booking_btu=$18,
                  booking_wash_variant=$19, is_featured=$20, is_autoplay_enabled=$21
            WHERE item_id = $22`,
          [
            v.item_name, v.item_category, v.base_price, v.unit_label, v.job_category, v.ac_type, v.btu_min, v.btu_max, v.is_active, v.is_customer_visible,
            mv.short_description, mv.long_description, mv.highlights ? JSON.stringify(mv.highlights) : null, mv.service_conditions,
            mv.booking_mode, mv.booking_service_key, mv.booking_ac_type, mv.booking_btu, mv.booking_wash_variant, mv.is_featured, mv.is_autoplay_enabled,
            itemId,
          ]
        );
      } else if (marketplaceReady) {
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
      await attachCatalogImages(client, final.rows, marketplaceReady);
      await attachCatalogRatings(client, final.rows, await isReviewsSchemaReady(client));
      res.json(serializeAdminCatalogRow(final.rows[0]));
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(500).json({ error: "แก้ไขรายการไม่สำเร็จ" });
    } finally {
      client.release();
    }
  });

  router.delete("/admin/catalog/items/:itemId", requireAdminSession, async (req, res) => {
    try {
      const itemId = String(req.params.itemId || "").trim();
      if (!/^\d+$/.test(itemId)) return res.status(400).json({ error: "item_id ไม่ถูกต้อง" });

      const marketplaceReady = await isMarketplaceSchemaReady(pool);

      const client = await pool.connect();
      let existing;
      let galleryImages = [];
      try {
        await client.query("BEGIN");

        const existingResult = await client.query(
          `SELECT item_id, image_public_id FROM public.catalog_items WHERE item_id = $1 FOR UPDATE`,
          [itemId]
        );
        existing = existingResult.rows[0];
        if (!existing) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "ไม่พบรายการนี้" });
        }

        if (marketplaceReady) {
          const galleryResult = await client.query(
            `SELECT image_public_id FROM public.catalog_item_images WHERE item_id = $1 AND image_public_id IS NOT NULL`,
            [itemId]
          );
          galleryImages = galleryResult.rows;
        }

        // Deleting the row is the source of truth for "this item is gone" — gallery
        // rows are removed via the existing ON DELETE CASCADE FK, and the linked price
        // rule (customer_service_price_rules) is intentionally never touched here so
        // old jobs priced against it keep working. Cloudinary cleanup happens after
        // commit, best-effort, and never re-creates the item if it fails.
        await client.query(`DELETE FROM public.catalog_items WHERE item_id = $1`, [itemId]);

        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }

      const publicIdsToClean = [];
      if (existing.image_public_id) publicIdsToClean.push(existing.image_public_id);
      for (const row of galleryImages) {
        if (row.image_public_id) publicIdsToClean.push(row.image_public_id);
      }

      let cloudinaryWarning = null;
      for (const publicId of publicIdsToClean) {
        try {
          await deleteCatalogImage(publicId);
        } catch (cleanupError) {
          console.error("cloudinary cleanup after item delete failed", safeImageErrorMessage(cleanupError));
          cloudinaryWarning = "ลบสินค้าแล้ว แต่ล้างรูปบน Cloudinary บางรูปไม่สำเร็จ";
        }
      }

      const response = { ok: true, item_id: Number(itemId) };
      if (cloudinaryWarning) response.warning = cloudinaryWarning;
      res.json(response);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "ลบรายการไม่สำเร็จ" });
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
        const autoplayReady = await isAutoplaySchemaReady(pool);
        const hotReady = await isHotSchemaReady(pool);
        const select = buildCatalogSelect({ pricingReady: true, marketplaceReady, autoplayReady, hotReady });
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
      const autoplayReady = await isAutoplaySchemaReady(pool);
      const hotReady = await isHotSchemaReady(pool);
      const select = buildCatalogSelect({ pricingReady: true, marketplaceReady, autoplayReady, hotReady });
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

        const altText = parseOptionalText(req.body && req.body.alt_text, "alt_text", 200);
        if (!altText.ok) return res.status(400).json({ error: altText.error });

        if (!req.file) return res.status(400).json({ error: "ไม่พบไฟล์รูปภาพ" });
        const validation = cloudinaryImageUpload.validateCatalogImageFile(req.file);
        if (!validation.ok) return res.status(400).json({ error: validation.error });

        let uploaded = null;
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          // Lock the parent row for the duration of the first-image computation so
          // two concurrent uploads can never both observe "no images yet" and both
          // insert is_primary=TRUE (the partial unique index is a DB-level backstop
          // for the same race).
          const existingResult = await client.query(
            `SELECT item_id FROM public.catalog_items WHERE item_id = $1 FOR UPDATE`,
            [itemId]
          );
          if (!existingResult.rows[0]) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "ไม่พบรายการนี้" });
          }

          const countResult = await client.query(
            `SELECT COUNT(*)::int AS cnt, COALESCE(MAX(sort_order), -1) AS max_sort
               FROM public.catalog_item_images WHERE item_id = $1`,
            [itemId]
          );
          const currentCount = Number(countResult.rows[0].cnt);
          if (currentCount >= MAX_CATALOG_IMAGES_PER_ITEM) {
            await client.query("ROLLBACK");
            return res.status(409).json({ error: `รายการนี้มีรูปภาพครบ ${MAX_CATALOG_IMAGES_PER_ITEM} รูปแล้ว ไม่สามารถเพิ่มรูปได้อีก` });
          }
          const isFirstImage = currentCount === 0;
          const nextSortOrder = Number(countResult.rows[0].max_sort) + 1;

          uploaded = await uploadCatalogImage({
            buffer: req.file.buffer,
            mimetype: req.file.mimetype,
            itemId,
          });

          const inserted = await client.query(
            `INSERT INTO public.catalog_item_images (item_id, image_url, image_public_id, alt_text, sort_order, is_primary)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING image_id, item_id, image_url, image_public_id, alt_text, sort_order, is_primary`,
            [itemId, uploaded.url, uploaded.public_id, altText.value, nextSortOrder, isFirstImage]
          );

          await client.query("COMMIT");
          res.status(201).json(serializeCatalogImage(inserted.rows[0]));
        } catch (e) {
          await client.query("ROLLBACK").catch(() => {});
          // The Cloudinary asset was already uploaded but never got a DB row to
          // reference it — clean it up so it doesn't become an orphan.
          if (uploaded && uploaded.public_id) {
            deleteCatalogImage(uploaded.public_id).catch((cleanupError) => {
              console.error("cleanup of orphaned catalog image upload failed", safeImageErrorMessage(cleanupError));
            });
          }
          throw e;
        } finally {
          client.release();
        }
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

      // Cloudinary-first: deleting the DB row before the Cloudinary asset would
      // lose the only reference to that asset's public_id the moment Cloudinary
      // failed, orphaning it forever with no way to retry. Only "ok" or "not
      // found" from Cloudinary are treated as safe to proceed — any other
      // failure must leave the DB row (and its public_id) intact for retry.
      let cloudinaryResult;
      try {
        cloudinaryResult = await deleteCatalogImage(existing.image_public_id);
      } catch (cleanupError) {
        console.error("cloudinary delete before gallery image delete failed", safeImageErrorMessage(cleanupError));
        return res.status(502).json({
          deleted: false,
          cloudinary_deleted: false,
          error: "ลบรูปภาพบน Cloudinary ไม่สำเร็จ กรุณาลองใหม่",
        });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`DELETE FROM public.catalog_item_images WHERE image_id = $1`, [imageId]);
        if (existing.is_primary) {
          await client.query(
            `UPDATE public.catalog_item_images SET is_primary = TRUE
               WHERE image_id = (
                 SELECT image_id FROM public.catalog_item_images WHERE item_id = $1 ORDER BY sort_order, image_id LIMIT 1
               )`,
            [itemId]
          );
        }
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
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
module.exports.MAX_CATALOG_IMAGES_PER_ITEM = MAX_CATALOG_IMAGES_PER_ITEM;
module.exports.validateHotField = validateHotField;
module.exports.attachCatalogRatings = attachCatalogRatings;
