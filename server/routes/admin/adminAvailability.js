"use strict";

const availabilityEngine = require("../../services/booking/availabilityEngine");

function registerAdminAvailabilityRoutes(app, options = {}) {
  const engine = options.engine || availabilityEngine;
  const getDependencies = options.getDependencies;
  const isEnabled = options.isEnabled || (() => true);
  const requireAdminSession = options.requireAdminSession;

  // Authorization intentionally remains byte-for-byte compatible in PR1. This
  // route has no middleware today; the finding is tracked for a follow-up PR.
  app.get("/admin/availability_by_tech_v2", async (req, res) => {
    if (!isEnabled()) return res.status(404).json({ error: "DISABLED" });
    const date = String(req.query.date || new Date().toISOString().slice(0, 10));
    const tech_type = String(req.query.tech_type || "company").trim().toLowerCase();
    const duration_min = Math.max(15, Number(req.query.duration_min || 60));
    const include_paused = String(req.query.forced || req.query.include_paused || "").trim() === "1";
    try {
      const data = await engine.computeAdminAvailabilityByTech(
        getDependencies(),
        { ...req.query, date, tech_type, duration_min, include_paused }
      );
      return res.json(data);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "โหลดตารางว่างไม่สำเร็จ" });
    }
  });

  app.get("/admin/customer-eligibility-diagnostic", requireAdminSession, async (req, res) => {
    try {
      const username = String(req.query.username || "").trim();
      const date = String(req.query.date || "").slice(0, 10);
      if (!username || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "ต้องระบุ username และ date (YYYY-MM-DD)" });
      }
      const duration_min = Math.max(15, Number(req.query.duration_min || 60));
      const result = await engine.diagnoseTechnicianEligibility(
        getDependencies(),
        { ...req.query, username, date, duration_min }
      );
      return res.json({ ok: true, ...result });
    } catch (error) {
      console.error("GET /admin/customer-eligibility-diagnostic error:", error);
      const status = Number(error.status || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: "วิเคราะห์สิทธิ์การแสดงคิวไม่สำเร็จ",
      });
    }
  });
}

module.exports = {
  registerAdminAvailabilityRoutes,
};
