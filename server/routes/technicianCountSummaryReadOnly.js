module.exports = function createTechnicianCountSummaryReadOnlyRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();

  const pool = deps.pool;
  const getAuthContext = deps.getAuthContext;
  const isTechnicianRole = deps.isTechnicianRole;
  const _bkkNow = deps._bkkNow;
  const _bkkYmd = deps._bkkYmd;
  const _bangkokMidnightUTC = deps._bangkokMidnightUTC;
  const _sqlDonePredicate = deps._sqlDonePredicate;

  // NOTE: some tech clients may lose cookie/session in PWA webview.
  // Fail-open by allowing ?username= for technicians only (validated against DB).
  router.get('/tech/completed_count_summary', async (req, res) => {
    try {
      let tech = '';
      try {
        const ctx = await getAuthContext(req, res);
        if (ctx.ok && isTechnicianRole(ctx.effective?.role)) tech = String(ctx.effective.username || '').trim();
      } catch (_) {}

      if (!tech) {
        const qUser = String(req.query.username || '').trim();
        if (!qUser) return res.status(401).json({ ok:false, error:'UNAUTHORIZED' });
        const vr = await pool.query(
          `SELECT username FROM public.technician_profiles WHERE username=$1 LIMIT 1`,
          [qUser]
        );
        if (!vr.rows || !vr.rows.length) return res.status(403).json({ ok:false, error:'FORBIDDEN' });
        tech = qUser;
      }

      const nowBkk = _bkkNow();
      const { y, m } = _bkkYmd(nowBkk);
      const monthStart = _bangkokMidnightUTC(y, m, 1);
      let ny = y, nm = m + 1;
      if (nm > 12) { nm = 1; ny = y + 1; }
      const nextMonthStart = _bangkokMidnightUTC(ny, nm, 1);
      const month = `${y}-${String(m).padStart(2, '0')}`;
      const donePred = _sqlDonePredicate('j');

      const q = await pool.query(
        `SELECT COUNT(DISTINCT j.job_id)::int AS month_completed_jobs
           FROM public.jobs j
          WHERE ${donePred}
            AND j.finished_at IS NOT NULL
            AND j.finished_at >= $1
            AND j.finished_at < $2
            AND j.canceled_at IS NULL
            AND COALESCE(j.job_status,'') NOT ILIKE '%cancel%'
            AND COALESCE(j.job_status,'') NOT ILIKE '%à¸¢à¸à¹€à¸¥à¸´à¸%'
            AND (
              j.technician_username = $3
              OR EXISTS (SELECT 1 FROM public.job_team_members tm WHERE tm.job_id=j.job_id AND tm.username=$3)
              OR EXISTS (SELECT 1 FROM public.job_assignments a WHERE a.job_id=j.job_id AND a.technician_username=$3)
            )`,
        [monthStart.toISOString(), nextMonthStart.toISOString(), tech]
      );

      return res.json({
        ok: true,
        username: tech,
        month,
        month_completed_jobs: Number(q.rows?.[0]?.month_completed_jobs || 0),
        source: 'finished_at_distinct_jobs',
      });
    } catch (e) {
      console.error('GET /tech/completed_count_summary', e);
      return res.status(500).json({ ok:false, error:'COMPLETED_COUNT_SUMMARY_FAILED' });
    }
  });


  router.get('/tech/rework_count_summary', async (req, res) => {
    try {
      let tech = '';
      try {
        const ctx = await getAuthContext(req, res);
        if (ctx.ok && isTechnicianRole(ctx.effective?.role)) tech = String(ctx.effective.username || '').trim();
      } catch (_) {}

      if (!tech) {
        const qUser = String(req.query.username || '').trim();
        if (!qUser) return res.status(401).json({ ok:false, error:'UNAUTHORIZED' });
        const vr = await pool.query(
          `SELECT username FROM public.technician_profiles WHERE username=$1 LIMIT 1`,
          [qUser]
        );
        if (!vr.rows || !vr.rows.length) return res.status(403).json({ ok:false, error:'FORBIDDEN' });
        tech = qUser;
      }

      const nowBkk = _bkkNow();
      const { y, m } = _bkkYmd(nowBkk);
      const monthStart = _bangkokMidnightUTC(y, m, 1);
      let ny = y, nm = m + 1;
      if (nm > 12) { nm = 1; ny = y + 1; }
      const nextMonthStart = _bangkokMidnightUTC(ny, nm, 1);
      const month = `${y}-${String(m).padStart(2, '0')}`;

      const exists = await pool.query(`SELECT to_regclass('public.technician_rework_cases') AS tbl`);
      if (!exists.rows?.[0]?.tbl) {
        return res.json({ ok:true, username:tech, month, month_rework_cases:0, source:'technician_rework_cases_missing' });
      }

      const q = await pool.query(
        `SELECT COUNT(DISTINCT rc.rework_case_id)::int AS month_rework_cases
           FROM public.technician_rework_cases rc
           LEFT JOIN public.jobs j ON j.job_id = rc.job_id
          WHERE COALESCE(rc.created_at, rc.updated_at, NOW()) >= $1
            AND COALESCE(rc.created_at, rc.updated_at, NOW()) < $2
            AND (
              rc.technician_username = $3
              OR j.technician_username = $3
              OR EXISTS (SELECT 1 FROM public.job_team_members tm WHERE tm.job_id=rc.job_id AND tm.username=$3)
              OR EXISTS (SELECT 1 FROM public.job_assignments a WHERE a.job_id=rc.job_id AND a.technician_username=$3)
            )`,
        [monthStart.toISOString(), nextMonthStart.toISOString(), tech]
      );

      return res.json({
        ok: true,
        username: tech,
        month,
        month_rework_cases: Number(q.rows?.[0]?.month_rework_cases || 0),
        source: 'technician_rework_cases_created_at',
      });
    } catch (e) {
      console.error('GET /tech/rework_count_summary', e);
      return res.status(500).json({ ok:false, error:'REWORK_COUNT_SUMMARY_FAILED' });
    }
  });

  return router;
};
