module.exports = function createTechnicianDirectoryRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();
  const pool = deps.pool || require("../../db/pool");

  router.get("/users/technicians", async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT username FROM public.users WHERE role='technician' ORDER BY username`
      );
      res.json(r.rows);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "โหลดรายชื่อช่างไม่สำเร็จ" });
    }
  });

  return router;
};
