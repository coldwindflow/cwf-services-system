module.exports = function createServiceZoneRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();

  const getServiceZones = deps.getServiceZones;
  const SERVICE_ZONE_SEEDS = deps.SERVICE_ZONE_SEEDS;
  const ENABLE_SERVICE_ZONE_FILTER = deps.ENABLE_SERVICE_ZONE_FILTER;

  router.get("/service_zones", async (req, res) => {
    try {
      res.json({ ok: true, zones: await getServiceZones(), filter_enabled: ENABLE_SERVICE_ZONE_FILTER });
    } catch (e) {
      console.error("GET /service_zones", e);
      res.status(500).json({ error: "LOAD_SERVICE_ZONES_FAILED" });
    }
  });

  return router;
};
