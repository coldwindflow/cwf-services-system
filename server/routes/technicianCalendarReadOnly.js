module.exports = function createTechnicianCalendarReadOnlyRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();

  const pool = deps.pool;
  const requireTechnicianSession = deps.requireTechnicianSession;
  const requireAdminSession = deps.requireAdminSession;
  const toIsoDate = deps.toIsoDate;
  const firstDayOfMonthIso = deps.firstDayOfMonthIso;
  const endDayOfMonthIso = deps.endDayOfMonthIso;
  const isStrictIsoDate = deps.isStrictIsoDate;

  router.get('/tech/work-calendar', requireTechnicianSession, async (req, res) => {
    try {
      const username = String(req.effective?.username || '').trim();
      const month = String(req.query?.month || '').trim() || toIsoDate(new Date()).slice(0,7);
      const fromIso = firstDayOfMonthIso(month);
      const toIso = endDayOfMonthIso(month);
      const [cal, hol, prof, jobs] = await Promise.all([
        pool.query(`SELECT work_date::date AS work_date, day_status, can_accept_advance_job, can_accept_urgent_job, start_time, end_time, max_jobs_per_day, max_units_per_day, note, source, updated_at
                    FROM public.technician_monthly_work_calendar
                    WHERE technician_username=$1 AND work_date BETWEEN $2::date AND $3::date
                    ORDER BY work_date ASC`, [username, fromIso, toIso]),
        pool.query(`SELECT holiday_date::date AS holiday_date, holiday_name, holiday_type
                    FROM public.company_holidays
                    WHERE is_active IS TRUE AND holiday_date BETWEEN $1::date AND $2::date
                    ORDER BY holiday_date ASC`, [fromIso, toIso]),
        pool.query(`SELECT COALESCE(employment_type,'company') AS employment_type, COALESCE(weekly_off_days,'') AS weekly_off_days FROM public.technician_profiles WHERE username=$1 LIMIT 1`, [username]),
        pool.query(`SELECT (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date AS work_date, COUNT(DISTINCT j.job_id)::int AS job_count
                    FROM public.jobs j
                    LEFT JOIN public.job_assignments ja ON ja.job_id=j.job_id AND ja.technician_username=$1
                    WHERE (j.technician_username=$1 OR ja.technician_username=$1)
                      AND j.appointment_datetime IS NOT NULL
                      AND (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date BETWEEN $2::date AND $3::date
                      AND COALESCE(j.job_status,'') NOT IN ('cancelled','canceled')
                    GROUP BY 1`, [username, fromIso, toIso])
      ]);
      res.json({ ok:true, username, month, from:fromIso, to:toIso,
        employment_type: prof.rows[0]?.employment_type || 'company',
        weekly_off_days: prof.rows[0]?.weekly_off_days || '',
        items: (cal.rows||[]).map(x=>({ ...x, work_date: toIsoDate(x.work_date) })),
        holidays: (hol.rows||[]).map(x=>({ ...x, holiday_date: toIsoDate(x.holiday_date) })),
        job_counts: (jobs.rows||[]).map(x=>({ work_date: toIsoDate(x.work_date), job_count: Number(x.job_count||0) }))
      });
    } catch (e) {
      console.error('GET /tech/work-calendar error:', e);
      res.status(500).json({ error:'โหลดปฏิทินรับงานไม่สำเร็จ' });
    }
  });

  router.get('/admin/technician-readiness/today', requireAdminSession, async (req, res) => {
    try {
      const r = await pool.query(`
        WITH assigned AS (
          SELECT COALESCE(ja.technician_username, j.technician_username) AS username,
                 MIN(j.appointment_datetime) AS first_job_at,
                 COUNT(DISTINCT j.job_id)::int AS job_count
          FROM public.jobs j
          LEFT JOIN public.job_assignments ja ON ja.job_id=j.job_id
          WHERE j.appointment_datetime IS NOT NULL
            AND (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date = (NOW() AT TIME ZONE 'Asia/Bangkok')::date
            AND COALESCE(j.job_status,'') NOT IN ('cancelled','canceled','done','finished')
            AND COALESCE(ja.technician_username, j.technician_username) IS NOT NULL
          GROUP BY 1
        )
        SELECT a.username, COALESCE(p.full_name,a.username) AS full_name, COALESCE(p.employment_type,'company') AS employment_type,
               COALESCE(p.accept_status,'paused') AS accept_status, p.accept_status_updated_at, p.accept_status_expires_at,
               a.first_job_at, a.job_count,
               COALESCE(r.status,'pending') AS readiness_status, r.ready_at, r.not_ready_reason,
               CASE WHEN COALESCE(r.status,'pending')='pending' AND NOW() >= (a.first_job_at - INTERVAL '1 hour') THEN TRUE ELSE FALSE END AS needs_admin_followup
        FROM assigned a
        LEFT JOIN public.technician_profiles p ON p.username=a.username
        LEFT JOIN public.technician_daily_readiness r ON r.technician_username=a.username AND r.work_date=(NOW() AT TIME ZONE 'Asia/Bangkok')::date
        ORDER BY needs_admin_followup DESC, a.first_job_at ASC
      `);
      res.json({ ok:true, items:r.rows || [] });
    } catch (e) {
      console.error('GET /admin/technician-readiness/today error:', e);
      res.status(500).json({ error:'โหลดภาพรวมความพร้อมช่างไม่สำเร็จ' });
    }
  });

  // =======================================
  // 👷 ADMIN: Technician advance work readiness dashboard (read-only)
  // - Phase 1 visibility only: does not block assignment or touch urgent flow.
  // =======================================
  function _adminReadinessServiceLabels(matrix) {
    try {
      const obj = (matrix && typeof matrix === 'object') ? matrix : {};
      const labels = [];
      const txt = JSON.stringify(obj).toLowerCase();
      if (txt.includes('clean') || txt.includes('ล้าง')) labels.push('ล้าง');
      if (txt.includes('repair') || txt.includes('ซ่อม')) labels.push('ซ่อม');
      if (txt.includes('install') || txt.includes('ติดตั้ง')) labels.push('ติดตั้ง');
      if (txt.includes('wall') || txt.includes('ผนัง')) labels.push('แอร์ผนัง');
      if (txt.includes('cassette') || txt.includes('สี่ทิศ')) labels.push('สี่ทิศทาง');
      if (txt.includes('floor') || txt.includes('แขวน') || txt.includes('ตั้งพื้น')) labels.push('แขวน/ตั้งพื้น');
      if (txt.includes('concealed') || txt.includes('เปลือย') || txt.includes('ใต้ฝ้า')) labels.push('เปลือย/ใต้ฝ้า');
      return Array.from(new Set(labels)).slice(0, 8).join(' / ') || (Object.keys(obj).length ? 'ตั้งค่าแล้ว' : 'ยังไม่ตั้งค่า');
    } catch (_) {
      return 'ยังไม่ตั้งค่า';
    }
  }

  router.get('/admin/technicians/work-readiness', requireAdminSession, async (req, res) => {
    try {
      const date = String(req.query?.date || '').trim() || toIsoDate(new Date());
      if (!isStrictIsoDate(date)) return res.status(400).json({ error:'date ต้องเป็นรูปแบบ YYYY-MM-DD' });

      const r = await pool.query(`
        WITH all_techs AS (
          SELECT username FROM public.users WHERE role='technician'
          UNION
          SELECT username FROM public.technician_profiles WHERE username IS NOT NULL
        ), assigned AS (
          SELECT COALESCE(ja.technician_username, j.technician_username) AS username,
                 COUNT(DISTINCT j.job_id)::int AS assigned_job_count
          FROM public.jobs j
          LEFT JOIN public.job_assignments ja ON ja.job_id=j.job_id
          WHERE j.appointment_datetime IS NOT NULL
            AND (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date = $1::date
            AND COALESCE(j.job_status,'') NOT IN ('cancelled','canceled')
            AND COALESCE(ja.technician_username, j.technician_username) IS NOT NULL
          GROUP BY 1
        )
        SELECT
          t.username,
          COALESCE(NULLIF(p.full_name,''), t.username) AS display_name,
          COALESCE(p.phone,'') AS phone,
          COALESCE(p.employment_type,'company') AS technician_type,
          COALESCE(p.accept_status,'paused') AS accept_status,
          p.accept_status_updated_at,
          p.home_service_zone_code,
          p.secondary_service_zone_code,
          p.preferred_zone,
          p.home_province,
          p.home_district,
          c.work_date,
          c.can_accept_advance_job,
          c.start_time,
          c.end_time,
          c.max_jobs_per_day,
          c.max_units_per_day,
          c.note,
          c.updated_at AS calendar_updated_at,
          m.matrix_json,
          COALESCE(a.assigned_job_count,0)::int AS assigned_job_count
        FROM all_techs t
        LEFT JOIN public.technician_profiles p ON p.username=t.username
        LEFT JOIN public.technician_monthly_work_calendar c ON c.technician_username=t.username AND c.work_date=$1::date
        LEFT JOIN public.technician_service_matrix m ON m.username=t.username
        LEFT JOIN assigned a ON a.username=t.username
        ORDER BY COALESCE(a.assigned_job_count,0) DESC, COALESCE(p.employment_type,'company') ASC, COALESCE(NULLIF(p.full_name,''), t.username) ASC
      `, [date]);

      const technicians = (r.rows || []).map(row => {
        const isUnset = !row.work_date;
        const can = !isUnset && row.can_accept_advance_job === true;
        const start = can ? (row.start_time || '09:00') : null;
        const end = can ? (row.end_time || '18:00') : null;
        const jobs = can ? Number(row.max_jobs_per_day || 1) : null;
        const units = can ? Number(row.max_units_per_day || 5) : null;
        const note = row.note || null;
        const hasCustom = !!((can && (start !== '09:00' || end !== '18:00' || jobs !== 1 || units !== 5)) || String(note || '').trim());
        const zones = [row.home_service_zone_code, row.secondary_service_zone_code, row.preferred_zone, [row.home_province, row.home_district].filter(Boolean).join(' ')].filter(Boolean);
        return {
          username: row.username,
          display_name: row.display_name || row.username,
          phone: row.phone || '',
          technician_type: row.technician_type || 'company',
          accept_status: row.accept_status || 'paused',
          can_accept_advance_job: can,
          is_unset: isUnset,
          start_time: start,
          end_time: end,
          max_jobs_per_day: jobs,
          max_units_per_day: units,
          note,
          has_assigned_job: Number(row.assigned_job_count || 0) > 0,
          assigned_job_count: Number(row.assigned_job_count || 0),
          has_custom_setting: hasCustom,
          service_labels: _adminReadinessServiceLabels(row.matrix_json),
          zone_labels: Array.from(new Set(zones.map(String).filter(Boolean))).join(' / ') || '-'
        };
      });

      const summary = technicians.reduce((acc, t) => {
        acc.total++;
        if (t.is_unset) acc.unset++;
        else if (t.can_accept_advance_job) acc.available_advance++;
        else acc.unavailable_advance++;
        if (t.has_assigned_job) acc.assigned_jobs++;
        if (t.has_custom_setting || t.note) acc.custom++;
        return acc;
      }, { total:0, available_advance:0, unavailable_advance:0, assigned_jobs:0, unset:0, custom:0 });

      res.json({ ok:true, date, summary, technicians });
    } catch (e) {
      console.error('GET /admin/technicians/work-readiness error:', e);
      res.status(500).json({ error:'โหลดความพร้อมช่างไม่สำเร็จ' });
    }
  });

  return router;
};
