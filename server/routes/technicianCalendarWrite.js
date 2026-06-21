module.exports = function createTechnicianCalendarWriteRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();

  const pool = deps.pool;
  const requireTechnicianSession = deps.requireTechnicianSession;
  const toIsoDate = deps.toIsoDate;
  const normWorkDayPayload = deps.normWorkDayPayload;
  const countLockedAdvanceJobsForDate = deps.countLockedAdvanceJobsForDate;

  router.put('/tech/work-calendar/day', requireTechnicianSession, async (req, res) => {
    try {
      const username = String(req.effective?.username || '').trim();
      const work_date = toIsoDate(String(req.body?.work_date || '').trim());
      if (!work_date) return res.status(400).json({ error:'ต้องมี work_date' });
      const lockedJobs = await countLockedAdvanceJobsForDate(pool, username, work_date);
      if (lockedJobs > 0) {
        return res.status(409).json({
          error:'วันนี้มีงานอยู่แล้ว ช่างไม่สามารถแก้ไขวันทำงานได้ กรุณาติดต่อแอดมิน หากมีความจำเป็น',
          locked:true,
          job_count: lockedJobs
        });
      }
      const p = normWorkDayPayload(req.body || {});
      const r = await pool.query(`
        INSERT INTO public.technician_monthly_work_calendar
          (technician_username, work_date, day_status, can_accept_advance_job, can_accept_urgent_job, start_time, end_time, max_jobs_per_day, max_units_per_day, note, source, updated_by, updated_at)
        VALUES($1,$2::date,$3,$4,$5,$6,$7,$8,$9,$10,'technician',$1,NOW())
        ON CONFLICT(technician_username, work_date) DO UPDATE SET
          day_status=EXCLUDED.day_status,
          can_accept_advance_job=EXCLUDED.can_accept_advance_job,
          can_accept_urgent_job=EXCLUDED.can_accept_urgent_job,
          start_time=EXCLUDED.start_time,
          end_time=EXCLUDED.end_time,
          max_jobs_per_day=EXCLUDED.max_jobs_per_day,
          max_units_per_day=EXCLUDED.max_units_per_day,
          note=EXCLUDED.note,
          source='technician', updated_by=$1, updated_at=NOW()
        RETURNING *
      `, [username, work_date, p.day_status, p.can_accept_advance_job, p.can_accept_urgent_job, p.start_time, p.end_time, p.max_jobs_per_day, p.max_units_per_day, p.note]);
      res.json({ ok:true, item:r.rows[0] });
    } catch (e) {
      console.error('PUT /tech/work-calendar/day error:', e);
      res.status(500).json({ error:'บันทึกปฏิทินรับงานไม่สำเร็จ' });
    }
  });

  router.put('/tech/work-calendar/bulk', requireTechnicianSession, async (req, res) => {
    const client = await pool.connect();
    try {
      const username = String(req.effective?.username || '').trim();
      const days = Array.isArray(req.body?.days) ? req.body.days : [];
      if (!days.length) return res.status(400).json({ error:'ต้องเลือกวันอย่างน้อย 1 วัน' });
      await client.query('BEGIN');
      let count = 0;
      let skippedLocked = 0;
      for (const d of days.slice(0, 62)) {
        const work_date = toIsoDate(String(d.work_date || '').trim());
        if (!work_date) continue;
        const lockedJobs = await countLockedAdvanceJobsForDate(client, username, work_date);
        if (lockedJobs > 0) {
          skippedLocked++;
          continue;
        }
        const p = normWorkDayPayload(d);
        await client.query(`
          INSERT INTO public.technician_monthly_work_calendar
            (technician_username, work_date, day_status, can_accept_advance_job, can_accept_urgent_job, start_time, end_time, max_jobs_per_day, max_units_per_day, note, source, updated_by, updated_at)
          VALUES($1,$2::date,$3,$4,$5,$6,$7,$8,$9,$10,'technician',$1,NOW())
          ON CONFLICT(technician_username, work_date) DO UPDATE SET
            day_status=EXCLUDED.day_status,
            can_accept_advance_job=EXCLUDED.can_accept_advance_job,
            can_accept_urgent_job=EXCLUDED.can_accept_urgent_job,
            start_time=EXCLUDED.start_time,
            end_time=EXCLUDED.end_time,
            max_jobs_per_day=EXCLUDED.max_jobs_per_day,
            max_units_per_day=EXCLUDED.max_units_per_day,
            note=EXCLUDED.note,
            source='technician', updated_by=$1, updated_at=NOW()
        `, [username, work_date, p.day_status, p.can_accept_advance_job, p.can_accept_urgent_job, p.start_time, p.end_time, p.max_jobs_per_day, p.max_units_per_day, p.note]);
        count++;
      }
      await client.query('COMMIT');
      res.json({ ok:true, count, skipped_locked: skippedLocked });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('PUT /tech/work-calendar/bulk error:', e);
      res.status(500).json({ error:'บันทึกทั้งเดือนไม่สำเร็จ' });
    } finally { client.release(); }
  });

  return router;
};
