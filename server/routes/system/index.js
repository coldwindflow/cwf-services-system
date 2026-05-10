module.exports = function createSystemRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();

  router.get("/api/version", (req, res) => {
    // Keep the exact same logic and response shape as the old inline route.
    res.json({ ok: true, version: "gps-v4", ts: new Date().toISOString() });
  });

  return router;
};
