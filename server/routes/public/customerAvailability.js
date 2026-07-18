"use strict";

const availabilityEngine = require("../../services/booking/availabilityEngine");

function setPublicAvailabilityNoStore(res) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
}

function registerPublicCustomerAvailabilityRoutes(app, options = {}) {
  const engine = options.engine || availabilityEngine;
  const getDependencies = options.getDependencies;
  const isEnabled = options.isEnabled || (() => true);
  const getBangkokTodayYMD = options.getBangkokTodayYMD;

  app.get("/public/availability_v2", async (req, res) => {
    setPublicAvailabilityNoStore(res);
    if (!isEnabled()) return res.status(404).json({ error: "DISABLED" });
    const date = String(req.query.date || new Date().toISOString().slice(0, 10));
    const tech_type = String(req.query.tech_type || "company").trim().toLowerCase();
    const forced = String(req.query.forced || "").trim() === "1";
    const duration_min = Math.max(15, Number(req.query.duration_min || 60));
    const crewSizeRaw = Number(req.query.crew_size || req.query.crewSize || 1);
    const crew_size = Math.max(1, Math.min(10, Number.isFinite(crewSizeRaw) ? Math.floor(crewSizeRaw) : 1));
    const include_full = String(req.query.include_full || "").trim() === "1";
    const mode = String(req.query.mode || req.query.view || "start").trim().toLowerCase();
    const debug = String(req.query.debug || "").trim() === "1";
    const preview_team = String(req.query.preview_team || req.query.previewTeam || "").trim() === "1";
    const assign_mode = String(req.query.assign_mode || req.query.assignMode || "").trim().toLowerCase();
    try {
      const deps = getDependencies();
      const data = forced
        ? await engine.computeForcedAvailability(deps, {
            ...req.query,
            date,
            tech_type,
            duration_min,
            crew_size,
            include_full,
            mode,
            debug,
            preview_team,
            assign_mode,
          })
        : await engine.computePublicCustomerSlots(deps, {
            ...req.query,
            date,
            tech_type,
            duration_min,
          });
      return res.json(data);
    } catch (error) {
      if (!forced) {
        const status = Number(error.status || 503);
        const message = status === 400
          ? "ข้อมูลบริการไม่ครบสำหรับตรวจคิว กรุณาเลือกรายการบริการใหม่"
          : "โหลดตารางว่างไม่สำเร็จ";
        return res.status(status >= 400 && status < 600 ? status : 503).json({ error: message });
      }
      console.error(error);
      return res.status(500).json({ error: "โหลดตารางว่างไม่สำเร็จ" });
    }
  });

  app.get("/public/availability_calendar_v2", async (req, res) => {
    setPublicAvailabilityNoStore(res);
    if (!isEnabled()) return res.status(404).json({ error: "DISABLED" });
    const month = String(req.query.month || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: "กรุณาระบุเดือนให้ถูกต้อง" });
    }
    const duration_min = Math.max(15, Number(req.query.duration_min || 60));
    const tech_type = String(req.query.tech_type || "company").trim().toLowerCase();
    try {
      const data = await engine.computeCalendarSummary(
        getDependencies(),
        { ...req.query, month, tech_type, duration_min }
      );
      return res.json(data);
    } catch (error) {
      const status = Number(error.status || 503);
      const message = status === 400
        ? "ข้อมูลบริการไม่ครบสำหรับตรวจคิว กรุณาเลือกรายการบริการใหม่"
        : "โหลดปฏิทินคิวไม่สำเร็จ";
      return res.status(status >= 400 && status < 600 ? status : 503).json({ error: message });
    }
  });

  app.get("/public/availability", async (req, res) => {
    const date = String(req.query.date || getBangkokTodayYMD());
    const start = String(req.query.start || "08:00");
    const end = String(req.query.end || "18:00");
    const slot_min = Math.max(15, Math.min(120, Number(req.query.slot_min || 30)));
    try {
      const data = await engine.computeLegacyPublicAvailability(
        getDependencies(),
        { date, start, end, slot_min }
      );
      return res.json(data);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "โหลดตารางว่างไม่สำเร็จ" });
    }
  });
}

module.exports = {
  registerPublicCustomerAvailabilityRoutes,
};
