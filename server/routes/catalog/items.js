module.exports = function createCatalogItemRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();
  const pool = deps.pool || require("../../db/pool");

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

  return router;
};
