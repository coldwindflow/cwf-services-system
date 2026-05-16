module.exports = function createAdminDeductionsReadOnlyRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();
  const {
    pool,
    requireAdminSession,
    deductionListFilters,
    PAYOUT_DEDUCTION_WARNING,
  } = deps;

  router.get('/admin/deductions', requireAdminSession, async (req, res) => {
    try {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));
      const { where, params } = deductionListFilters(req.query || {});
      const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const r = await pool.query(
        `SELECT * FROM public.technician_deduction_cases ${sqlWhere}
         ORDER BY created_at DESC, case_id DESC LIMIT ${limit}`,
        params
      );
      return res.json({ ok: true, rows: r.rows, message: PAYOUT_DEDUCTION_WARNING });
    } catch (e) {
      console.error('GET /admin/deductions', e);
      return res.status(500).json({ ok: false, error: 'โหลดเคสหักเงินไม่สำเร็จ' });
    }
  });

  router.get('/admin/deductions/summary', requireAdminSession, async (_req, res) => {
    try {
      const q = await pool.query(`
        WITH totals AS (
          SELECT
            COUNT(*) FILTER (WHERE status='pending_approval')::int AS pending_count,
            COALESCE(SUM(amount) FILTER (WHERE status='pending_approval'),0)::numeric AS pending_amount,
            COALESCE(SUM(amount) FILTER (WHERE status='approved'),0)::numeric AS approved_amount,
            COUNT(*) FILTER (WHERE severity IN ('high','critical') AND status NOT IN ('rejected','voided'))::int AS high_critical_count
          FROM public.technician_deduction_cases
        ),
        open_rework AS (
          SELECT COUNT(*)::int AS open_rework_count
          FROM public.technician_rework_cases
          WHERE status IN ('open','in_progress')
        ),
        warranty_jobs AS (
          SELECT COUNT(*)::int AS warranty_jobs_count
          FROM public.jobs j
          WHERE COALESCE(j.warranty_end_at, CASE WHEN j.finished_at IS NOT NULL THEN j.finished_at + INTERVAL '30 days' ELSE NULL END) IS NOT NULL
            AND COALESCE(j.warranty_end_at, CASE WHEN j.finished_at IS NOT NULL THEN j.finished_at + INTERVAL '30 days' ELSE NULL END) >= NOW()
            AND COALESCE(j.canceled_at, NULL) IS NULL
            AND COALESCE(j.job_status,'') NOT ILIKE '%ยกเลิก%'
            AND COALESCE(j.job_status,'') NOT ILIKE '%cancel%'
        ),
        failed_rework AS (
          SELECT COUNT(*)::int AS unresolved_failed_rework_count
          FROM public.technician_rework_cases
          WHERE status <> 'voided'
            AND (resolution='failed' OR revisit_result ILIKE '%fail%' OR revisit_result ILIKE '%ไม่สำเร็จ%')
        ),
        suggestions AS (
          SELECT (
            (SELECT COUNT(*) FROM public.jobs j
               WHERE j.appointment_datetime IS NOT NULL
                 AND COALESCE(j.checkin_at, j.started_at) IS NOT NULL
                 AND COALESCE(j.checkin_at, j.started_at) > j.appointment_datetime + INTERVAL '15 minutes'
                 AND NOT EXISTS (
                   SELECT 1 FROM public.technician_deduction_cases dc
                    WHERE dc.job_id=j.job_id
                      AND dc.technician_username=COALESCE(NULLIF(j.technician_username,''), j.technician_username)
                      AND dc.deduction_type='late_arrival'
                      AND dc.status NOT IN ('rejected','voided')
                 )
            ) +
            (SELECT COUNT(*) FROM public.technician_rework_cases rc
               WHERE rc.status <> 'voided'
                 AND NOT EXISTS (
                   SELECT 1 FROM public.technician_deduction_cases dc
                    WHERE dc.job_id=rc.job_id
                      AND dc.technician_username=rc.technician_username
                      AND dc.deduction_type IN ('warranty_rework_minor','warranty_rework_major','rework_failed')
                      AND dc.status NOT IN ('rejected','voided')
                 )
            )
          )::int AS suggestions_count
        )
        SELECT * FROM totals, open_rework, warranty_jobs, failed_rework, suggestions
      `);
      const top = await pool.query(`
        SELECT technician_username, COUNT(*)::int AS case_count, COALESCE(SUM(amount),0)::numeric AS amount
          FROM public.technician_deduction_cases
         WHERE status NOT IN ('rejected','voided')
         GROUP BY technician_username
         ORDER BY case_count DESC, amount DESC
         LIMIT 5
      `);
      const recent = await pool.query(`
        SELECT case_id, case_code, technician_username, job_id, deduction_type, amount, status, severity, created_at
          FROM public.technician_deduction_cases
         ORDER BY created_at DESC, case_id DESC
         LIMIT 8
      `);
      return res.json({ ok: true, ...(q.rows[0] || {}), top_technicians_by_cases: top.rows, recent_cases: recent.rows, message: PAYOUT_DEDUCTION_WARNING });
    } catch (e) {
      console.error('GET /admin/deductions/summary', e);
      return res.status(500).json({ ok: false, error: 'โหลดสรุปเคสไม่สำเร็จ' });
    }
  });

  router.get('/admin/deductions/audit', requireAdminSession, async (req, res) => {
    try {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));
      const where = [];
      const params = [];
      let p = 1;
      const add = (sql, val) => { params.push(val); where.push(sql.replace('?', `$${p++}`)); };
      if (req.query.entity_type) add('entity_type=?', String(req.query.entity_type).trim());
      if (req.query.entity_id) add('entity_id=?', String(req.query.entity_id).trim());
      if (req.query.actor_username) add('actor_username=?', String(req.query.actor_username).trim());
      if (req.query.from) add('created_at >= ?::timestamptz', `${String(req.query.from).slice(0,10)} 00:00:00+07:00`);
      if (req.query.to) add('created_at <= ?::timestamptz', `${String(req.query.to).slice(0,10)} 23:59:59+07:00`);
      const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const r = await pool.query(`SELECT * FROM public.technician_deduction_audit_logs ${sqlWhere} ORDER BY created_at DESC, audit_id DESC LIMIT ${limit}`, params);
      return res.json({ ok: true, rows: r.rows });
    } catch (e) {
      console.error('GET /admin/deductions/audit', e);
      return res.status(500).json({ ok: false, error: 'โหลด audit ไม่สำเร็จ' });
    }
  });

  return router;
};
