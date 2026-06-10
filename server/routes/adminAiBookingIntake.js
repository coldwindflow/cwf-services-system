const express = require("express");
const {
  ensureAiBookingIntakeSchema,
  listAiBookingIntakes,
  getAiBookingIntake,
  patchAiBookingIntake,
  buildAdminCopyText,
  upsertAiBookingIntake,
  detectIntent,
  classifyRisk,
  getAiBookingIntakeHealth,
} = require("../aiBookingIntake");

function cleanText(value, max = 2000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function requirePool(pool) {
  if (!pool) {
    const err = new Error("AI_BOOKING_INTAKE_POOL_REQUIRED");
    err.status = 500;
    throw err;
  }
}

function createAdminAiBookingIntakeRoutes(deps = {}) {
  const { pool, requireAdminSession = (req, res, next) => next() } = deps;
  requirePool(pool);
  const router = express.Router();

  router.get("/admin/ai-office/booking-intakes", requireAdminSession, async (req, res) => {
    try {
      const intakes = await listAiBookingIntakes(pool, {
        status: cleanText(req.query.status, 80) || "open",
        limit: req.query.limit,
      });
      const counts = intakes.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {});
      return res.json({ ok: true, intakes, counts });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "LOAD_AI_BOOKING_INTAKES_FAILED" });
    }
  });

  router.get("/admin/ai-office/booking-intakes/health", requireAdminSession, async (req, res) => {
    try {
      const health = await getAiBookingIntakeHealth(pool);
      return res.json({ ok: true, ...health });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "AI_BOOKING_INTAKE_HEALTH_FAILED" });
    }
  });

  router.post("/admin/ai-office/booking-intakes/from-line-text", requireAdminSession, async (req, res) => {
    try {
      const text = cleanText(req.body?.text, 8000);
      if (!text) return res.status(400).json({ ok: false, error: "LINE_TEXT_REQUIRED" });
      const givenLineUserId = cleanText(req.body?.line_user_id, 255);
      const lineUserId = givenLineUserId || `ADMIN_LINE_TEXT_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const intent = detectIntent(text);
      const risk = classifyRisk(text, intent);
      const intake = await upsertAiBookingIntake(pool, {
        conversation_id: null,
        line_user_id: lineUserId,
        last_message_id: `admin-line-text-${Date.now()}`,
        latest_customer_message: text,
        thread_context: text,
        thread_message_count: 1,
        intent,
        risk_label: risk,
        metadata: {
          source: "admin_line_text",
          note: "admin_line_text_input",
          intake_engine: "manual_thread_v4",
        },
      });
      return res.json({ ok: true, intake });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "CREATE_AI_BOOKING_INTAKE_FROM_LINE_TEXT_FAILED" });
    }
  });

  router.get("/admin/ai-office/booking-intakes/:id", requireAdminSession, async (req, res) => {
    try {
      const intake = await getAiBookingIntake(pool, req.params.id);
      if (!intake) return res.status(404).json({ ok: false, error: "AI_BOOKING_INTAKE_NOT_FOUND" });
      return res.json({ ok: true, intake, copy_text: buildAdminCopyText(intake) });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "LOAD_AI_BOOKING_INTAKE_FAILED" });
    }
  });

  router.patch("/admin/ai-office/booking-intakes/:id", requireAdminSession, async (req, res) => {
    try {
      const intake = await patchAiBookingIntake(pool, req.params.id, req.body || {});
      if (!intake) return res.status(404).json({ ok: false, error: "AI_BOOKING_INTAKE_NOT_FOUND" });
      return res.json({ ok: true, intake });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "UPDATE_AI_BOOKING_INTAKE_FAILED" });
    }
  });

  router.post("/admin/ai-office/booking-intakes/:id/admin-required", requireAdminSession, async (req, res) => {
    try {
      const intake = await patchAiBookingIntake(pool, req.params.id, {
        status: "ADMIN_REQUIRED",
        risk_label: "ADMIN_ONLY",
        admin_note: cleanText(req.body?.admin_note, 1000) || "แอดมินรับช่วงตอบเอง",
      });
      if (!intake) return res.status(404).json({ ok: false, error: "AI_BOOKING_INTAKE_NOT_FOUND" });
      return res.json({ ok: true, intake });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "MARK_ADMIN_REQUIRED_FAILED" });
    }
  });

  router.post("/admin/ai-office/booking-intakes/:id/waiting-customer", requireAdminSession, async (req, res) => {
    try {
      const intake = await patchAiBookingIntake(pool, req.params.id, {
        status: "WAITING_CUSTOMER_REPLY",
        admin_note: cleanText(req.body?.admin_note, 1000) || "แอดมินถามข้อมูลเพิ่มแล้ว รอลูกค้าตอบกลับ",
        metadata: { waiting_customer_from: "admin_review_queue" },
      });
      if (!intake) return res.status(404).json({ ok: false, error: "AI_BOOKING_INTAKE_NOT_FOUND" });
      return res.json({ ok: true, intake });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "MARK_WAITING_CUSTOMER_FAILED" });
    }
  });

  router.post("/admin/ai-office/booking-intakes/:id/close", requireAdminSession, async (req, res) => {
    try {
      const intake = await patchAiBookingIntake(pool, req.params.id, {
        status: "CLOSED",
        admin_note: cleanText(req.body?.admin_note, 1000) || "ปิดรายการโดยแอดมิน",
      });
      if (!intake) return res.status(404).json({ ok: false, error: "AI_BOOKING_INTAKE_NOT_FOUND" });
      return res.json({ ok: true, intake });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "CLOSE_AI_BOOKING_INTAKE_FAILED" });
    }
  });

  router.post("/admin/ai-office/booking-intakes/:id/job-created", requireAdminSession, async (req, res) => {
    try {
      const jobId = Number(req.body?.job_id || 0) || null;
      const intake = await patchAiBookingIntake(pool, req.params.id, {
        status: "JOB_CREATED",
        job_id: jobId,
        admin_note: cleanText(req.body?.admin_note, 1000) || "แอดมินสร้างงานจากข้อมูลนี้แล้ว",
        metadata: { job_created_from: cleanText(req.body?.source, 100) || "admin" },
      });
      if (!intake) return res.status(404).json({ ok: false, error: "AI_BOOKING_INTAKE_NOT_FOUND" });
      return res.json({ ok: true, intake });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "MARK_JOB_CREATED_FAILED" });
    }
  });

  router.post("/admin/ai-office/booking-intakes/ensure-schema", requireAdminSession, async (req, res) => {
    try {
      await ensureAiBookingIntakeSchema(pool);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "ENSURE_AI_BOOKING_INTAKE_SCHEMA_FAILED" });
    }
  });

  return router;
}

module.exports = createAdminAiBookingIntakeRoutes;
