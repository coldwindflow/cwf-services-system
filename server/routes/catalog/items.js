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

function mergeCatalogItemPayload(existing, body) {
  const merged = {};
  CATALOG_ITEM_FIELDS.forEach((key) => {
    merged[key] = Object.prototype.hasOwnProperty.call(body, key) ? body[key] : existing[key];
  });
  return merged;
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

  router.get("/catalog/items", async (req, res) => {
    try {
      const schemaReady = await isMediaPricingSchemaReady(pool);
      const select = schemaReady ? CATALOG_SELECT_WITH_PRICING : CATALOG_SELECT_LEGACY;
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
      res.json(r.rows.map(serializeCatalogRow));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "โหลดรายการสินค้า/บริการไม่สำเร็จ" });
    }
  });

  router.get("/admin/catalog/items", requireAdminSession, async (req, res) => {
    try {
      const schemaReady = await isMediaPricingSchemaReady(pool);
      const select = schemaReady ? CATALOG_SELECT_WITH_PRICING : CATALOG_SELECT_LEGACY;
      const r = await pool.query(`${select} ORDER BY ci.item_category, ci.item_name`);
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

    const hasPricingKey = req.body && Object.prototype.hasOwnProperty.call(req.body, "pricing");
    const pricingResult = hasPricingKey ? validatePricingInput(req.body.pricing) : { ok: true, value: undefined };
    if (!pricingResult.ok) return res.status(400).json({ error: pricingResult.errors.join(", ") });

    const schemaReady = await isMediaPricingSchemaReady(pool);
    if (pricingResult.value && !schemaReady) {
      return res.status(503).json({ error: "ระบบราคาโปรโมชันยังไม่พร้อมใช้งาน (ยังไม่ได้รัน migration)" });
    }

    const v = result.value;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const insertRes = await client.query(
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

      const select = schemaReady ? CATALOG_SELECT_WITH_PRICING : CATALOG_SELECT_LEGACY;
      const final = await pool.query(`${select} WHERE ci.item_id = $1`, [itemId]);
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
    const select = schemaReady ? CATALOG_SELECT_WITH_PRICING : CATALOG_SELECT_LEGACY;
    const existingResult = await pool.query(`${select} WHERE ci.item_id = $1`, [itemId]);
    const existing = existingResult.rows[0];
    if (!existing) return res.status(404).json({ error: "ไม่พบรายการนี้" });

    const merged = mergeCatalogItemPayload(existing, req.body || {});
    const result = validateMergedCatalogItem(merged);
    if (!result.ok) return res.status(400).json({ error: result.errors.join(", ") });

    const hasPricingKey = req.body && Object.prototype.hasOwnProperty.call(req.body, "pricing");
    const pricingResult = hasPricingKey ? validatePricingInput(req.body.pricing) : { ok: true, value: undefined };
    if (!pricingResult.ok) return res.status(400).json({ error: pricingResult.errors.join(", ") });
    if (pricingResult.value && !schemaReady) {
      return res.status(503).json({ error: "ระบบราคาโปรโมชันยังไม่พร้อมใช้งาน (ยังไม่ได้รัน migration)" });
    }

    const v = result.value;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE public.catalog_items
            SET item_name=$1, item_category=$2, base_price=$3, unit_label=$4,
                job_category=$5, ac_type=$6, btu_min=$7, btu_max=$8,
                is_active=$9, is_customer_visible=$10
          WHERE item_id = $11`,
        [v.item_name, v.item_category, v.base_price, v.unit_label, v.job_category, v.ac_type, v.btu_min, v.btu_max, v.is_active, v.is_customer_visible, itemId]
      );

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

      const final = await pool.query(`${select} WHERE ci.item_id = $1`, [itemId]);
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

        const final = await pool.query(`${CATALOG_SELECT_WITH_PRICING} WHERE ci.item_id = $1`, [itemId]);
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

      const final = await pool.query(`${CATALOG_SELECT_WITH_PRICING} WHERE ci.item_id = $1`, [itemId]);
      res.json(serializeAdminCatalogRow(final.rows[0]));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "ลบรูปภาพไม่สำเร็จ" });
    }
  });

  return router;
};

module.exports.computeEffectivePricing = computeEffectivePricing;
module.exports.serializeCatalogRow = serializeCatalogRow;
module.exports.serializeAdminCatalogRow = serializeAdminCatalogRow;
module.exports.validatePricingInput = validatePricingInput;
