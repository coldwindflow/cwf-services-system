module.exports = function createSystemRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();
  const pool = deps.pool || require("../../db/pool");

  router.get("/api/version", (req, res) => {
    // Keep the exact same logic and response shape as the old inline route.
    res.json({ ok: true, version: "gps-v4", ts: new Date().toISOString() });
  });

  router.get("/test-db", async (req, res) => {
    try {
      const r = await pool.query("SELECT NOW() as now");
      res.json({ ok: true, now: r.rows[0].now });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "db connection failed" });
    }
  });

  return router;
};
