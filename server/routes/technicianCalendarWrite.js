module.exports = function createTechnicianCalendarWriteRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();

  const pool = deps.pool;
  const requireTechnicianSession = deps.requireTechnicianSession;
  const toIsoDate = deps.toIsoDate;
  const normWorkDayPayload = deps.normWorkDayPayload;
  const countLockedAdvanceJobsForDate = deps.countLockedAdvanceJobsForDate;
  const sourceForWorkDayPayload = deps.sourceForWorkDayPayload || require("../lib/technicianCalendar").sourceForWorkDayPayload;

  async function assertUnlocked(db, username, work_date) {
    const lockedJobs = await countLockedAdvanceJobsForDate(db, username, work_date);
    return { lockedJobs, locked: lockedJobs > 0, allowed: lockedJobs <= 0 };
  }

  async function upsertDay(db, username, work_date, p) {
    const source = sourceForWorkDayPayload(p);
    return db.query(`
      INSERT INTO public.technician_monthly_work_calendar
        (technician_username, work_date, day_status, can_accept_advance_job, can_accept_urgent_job, start_time, end_time, max_jobs_per_day, max_units_per_day, note, source, updated_by, updated_at)
      VALUES($1,$2::date,$3,$4,$5,$6,$7,$8,$9,$10,$11,$1,NOW())
      ON CONFLICT(technician_username, work_date) DO UPDATE SET
        day_status=EXCLUDED.day_status,
        can_accept_advance_job=EXCLUDED.can_accept_advance_job,
        can_accept_urgent_job=EXCLUDED.can_accept_urgent_job,
        start_time=EXCLUDED.start_time,
        end_time=EXCLUDED.end_time,
        max_jobs_per_day=EXCLUDED.max_jobs_per_day,
        max_units_per_day=EXCLUDED.max_units_per_day,
        note=EXCLUDED.note,
        source=EXCLUDED.source, updated_by=$1, updated_at=NOW()
      RETURNING *
    `, [username, work_date, p.day_status, p.can_accept_advance_job, p.can_accept_urgent_job, p.start_time, p.end_time, p.max_jobs_per_day, p.max_units_per_day, p.note, source]);
  }

  router.put("/tech/work-calendar/day", requireTechnicianSession, async (req, res) => {
    try {
      const username = String(req.effective?.username || "").trim();
      const work_date = toIsoDate(String(req.body?.work_date || "").trim());
      if (!work_date) return res.status(400).json({ error: "work_date is required" });

      const p = normWorkDayPayload(req.body || {});
      const locked = await assertUnlocked(pool, username, work_date);
      if (!locked.allowed) {
        return res.status(409).json({
          error: "This day already has jobs and cannot be edited.",
          locked: true,
          code: "LOCKED_DAY_HAS_JOBS",
          job_count: locked.lockedJobs,
        });
      }

      const r = await upsertDay(pool, username, work_date, p);
      res.json({ ok: true, locked: false, item: r.rows[0] });
    } catch (e) {
      console.error("PUT /tech/work-calendar/day error:", e);
      res.status(500).json({ error: "Failed to save work calendar" });
    }
  });

  router.put("/tech/work-calendar/bulk", requireTechnicianSession, async (req, res) => {
    const client = await pool.connect();
    try {
      const username = String(req.effective?.username || "").trim();
      const days = Array.isArray(req.body?.days) ? req.body.days : [];
      if (!days.length) return res.status(400).json({ error: "At least one day is required" });

      await client.query("BEGIN");
      let count = 0;
      let skippedLocked = 0;
      const locked_rejections = [];

      for (const d of days.slice(0, 62)) {
        const work_date = toIsoDate(String(d.work_date || "").trim());
        if (!work_date) continue;
        const p = normWorkDayPayload(d);
        const locked = await assertUnlocked(client, username, work_date);
        if (!locked.allowed) {
          skippedLocked += 1;
          locked_rejections.push({ work_date, code: "LOCKED_DAY_HAS_JOBS", job_count: locked.lockedJobs });
          continue;
        }
        await upsertDay(client, username, work_date, p);
        count += 1;
      }

      await client.query("COMMIT");
      res.json({ ok: true, count, skipped_locked: skippedLocked, locked_rejections });
    } catch (e) {
      await client.query("ROLLBACK");
      console.error("PUT /tech/work-calendar/bulk error:", e);
      res.status(500).json({ error: "Failed to save work calendar batch" });
    } finally {
      client.release();
    }
  });

  return router;
};
