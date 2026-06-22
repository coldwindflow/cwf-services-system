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
// pricing === null       -> caller asked to explicitly unlink the price rule from this catalog item
// pricing === {...}      -> caller asked to create/update the linked price rule
function validatePricingInput(pricing) {
  if (pricing === undefined) return { ok: true, value: undefined };
  if (pricing === null) return { ok: true, value: null };
  if (typeof pricing !== "object" || Array.isArray(pricing)) {
    return { ok: false, errors: ["pricing ไม่ถูกต้อง"] };
  }

  const errors = [];
  const normal_price = Number(pricing.normal_price);
  if (!Number.isFinite(normal_price) || normal_price < 0) errors.push("ราคาปกติต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป");

  const active_price = Number(pricing.active_price);
  if (!Number.isFinite(active_price) || active_price < 0) errors.push("ราคาโปรโมชันต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป");

  const isActiveResult = normalizeBoolean(
    Object.prototype.hasOwnProperty.call(pricing, "is_active") ? pricing.is_active : true,
    "pricing.is_active"
  );
  if (!isActiveResult.ok) errors.push(isActiveResult.error);

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      normal_price: money(normal_price),
      active_price: money(active_price),
      campaign_name: String(pricing.campaign_name || "").trim() || null,
      effective_from: String(pricing.effective_from || "").trim() || null,
      effective_to: String(pricing.effective_to || "").trim() || null,
      is_active: isActiveResult.value,
    },
  };
}

const CATALOG_SELECT_WITH_PRICING = `
  SELECT ci.item_id, ci.item_name, ci.item_category, ci.base_price, ci.unit_label, ci.is_active,
         ci.job_category, ci.ac_type, ci.btu_min, ci.btu_max, ci.is_customer_visible,
         ci.image_url, ci.image_public_id, ci.price_rule_id,
         pr.normal_price AS rule_normal_price, pr.active_price AS rule_active_price,
         pr.campaign_name AS rule_campaign_name, pr.is_active AS rule_is_active,
         pr.effective_from AS rule_effective_from, pr.effective_to AS rule_effective_to
  FROM public.catalog_items ci
  LEFT JOIN public.customer_service_price_rules pr ON pr.rule_id = ci.price_rule_id
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
    campaign_name: ruleIsCurrentlyActive ? (row.rule_campaign_name || null) : null,
  };
}

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
    sale_price: pricing.sale_price,
    display_price: pricing.display_price,
    has_promo: pricing.has_promo,
    campaign_name: pricing.campaign_name,
  };
}

// Idempotent additive "schema ensure" so this route module never crashes the app
// before migrations/20260622_catalog_store_media_pricing.sql has actually been run.
async function ensureCatalogMediaPricingSchema(db) {
  await db.query(`ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS image_url TEXT`);
  await db.query(`ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS image_public_id TEXT`);
  await db.query(`ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS price_rule_id BIGINT`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_catalog_items_price_rule_id ON public.catalog_items(price_rule_id)`);
  await db.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'catalog_items_price_rule_id_fkey'
      ) THEN
        ALTER TABLE public.catalog_items
          ADD CONSTRAINT catalog_items_price_rule_id_fkey
          FOREIGN KEY (price_rule_id)
          REFERENCES public.customer_service_price_rules(rule_id)
          ON DELETE SET NULL;
      END IF;
    END
    $$;
  `);
}

async function savePriceRuleForCatalogItem(client, { ruleId, pricing, catalogFields, actor }) {
  const job_type = String(catalogFields.job_category || "").trim() || null;
  const ac_type = String(catalogFields.ac_type || "").trim() || null;
  const btu_min = intOrNull(catalogFields.btu_min);
  const btu_max = intOrNull(catalogFields.btu_max);

  if (ruleId) {
    await client.query(
      `UPDATE public.customer_service_price_rules
          SET job_type=$2, ac_type=$3, btu_min=$4, btu_max=$5,
              normal_price=$6, active_price=$7, campaign_name=$8,
              effective_from=$9, effective_to=$10, is_active=$11, updated_by=$12, updated_at=NOW()
        WHERE rule_id=$1`,
      [ruleId, job_type, ac_type, btu_min, btu_max, pricing.normal_price, pricing.active_price, pricing.campaign_name, pricing.effective_from, pricing.effective_to, pricing.is_active, actor]
    );
    return ruleId;
  }

  const r = await client.query(
    `INSERT INTO public.customer_service_price_rules
       (job_type, ac_type, btu_min, btu_max, normal_price, active_price, campaign_name, effective_from, effective_to, is_active, updated_by, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
     RETURNING rule_id`,
    [job_type, ac_type, btu_min, btu_max, pricing.normal_price, pricing.active_price, pricing.campaign_name, pricing.effective_from, pricing.effective_to, pricing.is_active, actor]
  );
  return r.rows[0].rule_id;
}

function actorUsername(req) {
  return (req.actor && req.actor.username) || req.headers["x-admin-username"] || "admin";
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

  router.get("/catalog/items", async (req, res) => {
    try {
      await ensureCatalogMediaPricingSchema(pool);
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
        `${CATALOG_SELECT_WITH_PRICING}
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
      await ensureCatalogMediaPricingSchema(pool);
      const r = await pool.query(
        `${CATALOG_SELECT_WITH_PRICING} ORDER BY ci.item_category, ci.item_name`
      );
      res.json(r.rows.map(serializeCatalogRow));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "โหลดรายการสินค้า/บริการไม่สำเร็จ" });
    }
  });

  router.post("/admin/catalog/items", requireAdminSession, async (req, res) => {
    const client = await pool.connect();
    try {
      await ensureCatalogMediaPricingSchema(client);

      const defaults = {
        item_name: "", item_category: "", base_price: 0, unit_label: "",
        job_category: "", ac_type: "", btu_min: null, btu_max: null,
        is_active: true, is_customer_visible: false,
      };
      const merged = mergeCatalogItemPayload(defaults, req.body || {});
      const result = validateMergedCatalogItem(merged);
      if (!result.ok) { client.release(); return res.status(400).json({ error: result.errors.join(", ") }); }

      const hasPricingKey = req.body && Object.prototype.hasOwnProperty.call(req.body, "pricing");
      const pricingResult = hasPricingKey ? validatePricingInput(req.body.pricing) : { ok: true, value: undefined };
      if (!pricingResult.ok) { client.release(); return res.status(400).json({ error: pricingResult.errors.join(", ") }); }

      const v = result.value;
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

      const final = await pool.query(`${CATALOG_SELECT_WITH_PRICING} WHERE ci.item_id = $1`, [itemId]);
      res.status(201).json(serializeCatalogRow(final.rows[0]));
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

    const client = await pool.connect();
    try {
      await ensureCatalogMediaPricingSchema(client);

      const existingResult = await client.query(`${CATALOG_SELECT_WITH_PRICING} WHERE ci.item_id = $1`, [itemId]);
      const existing = existingResult.rows[0];
      if (!existing) { client.release(); return res.status(404).json({ error: "ไม่พบรายการนี้" }); }

      const merged = mergeCatalogItemPayload(existing, req.body || {});
      const result = validateMergedCatalogItem(merged);
      if (!result.ok) { client.release(); return res.status(400).json({ error: result.errors.join(", ") }); }

      const hasPricingKey = req.body && Object.prototype.hasOwnProperty.call(req.body, "pricing");
      const pricingResult = hasPricingKey ? validatePricingInput(req.body.pricing) : { ok: true, value: undefined };
      if (!pricingResult.ok) { client.release(); return res.status(400).json({ error: pricingResult.errors.join(", ") }); }

      const v = result.value;
      await client.query("BEGIN");
      await client.query(
        `UPDATE public.catalog_items
            SET item_name=$1, item_category=$2, base_price=$3, unit_label=$4,
                job_category=$5, ac_type=$6, btu_min=$7, btu_max=$8,
                is_active=$9, is_customer_visible=$10
          WHERE item_id = $11`,
        [v.item_name, v.item_category, v.base_price, v.unit_label, v.job_category, v.ac_type, v.btu_min, v.btu_max, v.is_active, v.is_customer_visible, itemId]
      );

      if (hasPricingKey && pricingResult.value) {
        const ruleId = await savePriceRuleForCatalogItem(client, {
          ruleId: existing.price_rule_id || null,
          pricing: pricingResult.value,
          catalogFields: v,
          actor: actorUsername(req),
        });
        if (!existing.price_rule_id) {
          await client.query(`UPDATE public.catalog_items SET price_rule_id=$1 WHERE item_id=$2`, [ruleId, itemId]);
        }
      } else if (hasPricingKey && pricingResult.value === null) {
        await client.query(`UPDATE public.catalog_items SET price_rule_id=NULL WHERE item_id=$1`, [itemId]);
      }

      await client.query("COMMIT");

      const final = await pool.query(`${CATALOG_SELECT_WITH_PRICING} WHERE ci.item_id = $1`, [itemId]);
      res.json(serializeCatalogRow(final.rows[0]));
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

        await ensureCatalogMediaPricingSchema(pool);
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
            console.error("cleanup old catalog image failed", cleanupError);
          });
        }

        const final = await pool.query(`${CATALOG_SELECT_WITH_PRICING} WHERE ci.item_id = $1`, [itemId]);
        res.json(serializeCatalogRow(final.rows[0]));
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

      await ensureCatalogMediaPricingSchema(pool);
      const existingResult = await pool.query(
        `SELECT item_id, image_public_id FROM public.catalog_items WHERE item_id = $1`,
        [itemId]
      );
      const existing = existingResult.rows[0];
      if (!existing) return res.status(404).json({ error: "ไม่พบรายการนี้" });

      if (existing.image_public_id) {
        await deleteCatalogImage(existing.image_public_id);
      }

      await pool.query(
        `UPDATE public.catalog_items SET image_url=NULL, image_public_id=NULL WHERE item_id=$1`,
        [itemId]
      );

      const final = await pool.query(`${CATALOG_SELECT_WITH_PRICING} WHERE ci.item_id = $1`, [itemId]);
      res.json(serializeCatalogRow(final.rows[0]));
    } catch (e) {
      console.error(e);
      if (e && e.code === "CLOUDINARY_NOT_CONFIGURED") {
        return res.status(503).json({ error: "ยังไม่ได้ตั้งค่า Cloudinary" });
      }
      res.status(500).json({ error: "ลบรูปภาพไม่สำเร็จ" });
    }
  });

  return router;
};

module.exports.ensureCatalogMediaPricingSchema = ensureCatalogMediaPricingSchema;
module.exports.computeEffectivePricing = computeEffectivePricing;
module.exports.serializeCatalogRow = serializeCatalogRow;
module.exports.validatePricingInput = validatePricingInput;
