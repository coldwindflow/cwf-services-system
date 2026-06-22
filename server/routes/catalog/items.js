function normalizeBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null) return fallback;
  const s = String(value).trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
  if (s === "0" || s === "false" || s === "no" || s === "off" || s === "") return false;
  return fallback;
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

  const is_active = normalizeBoolean(merged.is_active, true);
  const is_customer_visible = normalizeBoolean(merged.is_customer_visible, false);

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: { item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible },
  };
}

module.exports = function createCatalogItemRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();
  const pool = deps.pool || require("../../db/pool");
  const requireAdminSession = deps.requireAdminSession;
  if (typeof requireAdminSession !== "function") {
    throw new Error("createCatalogItemRoutes requires a requireAdminSession middleware function");
  }

  router.get("/catalog/items", async (req, res) => {
    try {
      const customer = String(req.query.customer || "").trim() === "1";
      const job_category = (req.query.job_category || "").toString().trim();
      const ac_type = (req.query.ac_type || "").toString().trim();
      const btu = Number(req.query.btu || 0);

      const where = [`is_active = TRUE`];
      const params = [];
      let p = 1;

      if (customer) where.push(`is_customer_visible = TRUE`);
      if (job_category) { params.push(job_category); where.push(`job_category = $${p++}`); }
      if (ac_type) { params.push(ac_type); where.push(`ac_type = $${p++}`); }
      if (Number.isFinite(btu) && btu > 0) {
        params.push(btu); where.push(`(btu_min IS NULL OR btu_min <= $${p++})`);
        params.push(btu); where.push(`(btu_max IS NULL OR btu_max >= $${p++})`);
      }

      const r = await pool.query(
        `
      SELECT item_id, item_name, item_category, base_price, unit_label, is_active,
             job_category, ac_type, btu_min, btu_max, is_customer_visible
      FROM public.catalog_items
      WHERE ${where.join(" AND ")}
      ORDER BY item_category, item_name
      `,
        params
      );
      res.json(r.rows);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "โหลดรายการสินค้า/บริการไม่สำเร็จ" });
    }
  });

  router.get("/admin/catalog/items", requireAdminSession, async (req, res) => {
    try {
      const r = await pool.query(
        `
        SELECT item_id, item_name, item_category, base_price, unit_label, is_active,
               job_category, ac_type, btu_min, btu_max, is_customer_visible
        FROM public.catalog_items
        ORDER BY item_category, item_name
        `
      );
      res.json(r.rows);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "โหลดรายการสินค้า/บริการไม่สำเร็จ" });
    }
  });

  router.post("/admin/catalog/items", requireAdminSession, async (req, res) => {
    try {
      const defaults = {
        item_name: "", item_category: "", base_price: 0, unit_label: "",
        job_category: "", ac_type: "", btu_min: null, btu_max: null,
        is_active: true, is_customer_visible: false,
      };
      const merged = mergeCatalogItemPayload(defaults, req.body || {});
      const result = validateMergedCatalogItem(merged);
      if (!result.ok) return res.status(400).json({ error: result.errors.join(", ") });

      const v = result.value;
      const r = await pool.query(
        `
        INSERT INTO public.catalog_items
          (item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING item_id, item_name, item_category, base_price, unit_label, is_active,
                  job_category, ac_type, btu_min, btu_max, is_customer_visible
        `,
        [v.item_name, v.item_category, v.base_price, v.unit_label, v.job_category, v.ac_type, v.btu_min, v.btu_max, v.is_active, v.is_customer_visible]
      );
      res.status(201).json(r.rows[0]);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "เพิ่มรายการไม่สำเร็จ" });
    }
  });

  router.patch("/admin/catalog/items/:itemId", requireAdminSession, async (req, res) => {
    try {
      const itemId = String(req.params.itemId || "").trim();
      if (!/^\d+$/.test(itemId)) return res.status(400).json({ error: "item_id ไม่ถูกต้อง" });

      const existingResult = await pool.query(
        `
        SELECT item_id, item_name, item_category, base_price, unit_label, is_active,
               job_category, ac_type, btu_min, btu_max, is_customer_visible
        FROM public.catalog_items
        WHERE item_id = $1
        `,
        [itemId]
      );
      const existing = existingResult.rows[0];
      if (!existing) return res.status(404).json({ error: "ไม่พบรายการนี้" });

      const merged = mergeCatalogItemPayload(existing, req.body || {});
      const result = validateMergedCatalogItem(merged);
      if (!result.ok) return res.status(400).json({ error: result.errors.join(", ") });

      const v = result.value;
      const r = await pool.query(
        `
        UPDATE public.catalog_items
        SET item_name=$1, item_category=$2, base_price=$3, unit_label=$4,
            job_category=$5, ac_type=$6, btu_min=$7, btu_max=$8,
            is_active=$9, is_customer_visible=$10
        WHERE item_id = $11
        RETURNING item_id, item_name, item_category, base_price, unit_label, is_active,
                  job_category, ac_type, btu_min, btu_max, is_customer_visible
        `,
        [v.item_name, v.item_category, v.base_price, v.unit_label, v.job_category, v.ac_type, v.btu_min, v.btu_max, v.is_active, v.is_customer_visible, itemId]
      );
      res.json(r.rows[0]);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "แก้ไขรายการไม่สำเร็จ" });
    }
  });

  return router;
};
