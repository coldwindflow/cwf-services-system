module.exports = function createTechnicianBaseStatusReadOnlyRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();

  const pool = deps.pool;
  const requireAdminSession = deps.requireAdminSession;
  const requireTechnicianSession = deps.requireTechnicianSession;
  const getTechnicianForStatus = deps.getTechnicianForStatus;
  const getLatestBaseStatus = deps.getLatestBaseStatus;

  router.get('/admin/api/team-status', requireAdminSession, async (req, res) => {
    try {
      const techs = await pool.query(
        `SELECT u.username, COALESCE(p.full_name, u.full_name, u.username) AS full_name,
                p.photo_path, p.phone, p.technician_code, COALESCE(p.employment_type,'company') AS employment_type,
                p.rating, p.grade, p.done_count
         FROM public.users u
         LEFT JOIN public.technician_profiles p ON p.username=u.username
         WHERE u.role='technician'
         ORDER BY COALESCE(p.full_name, u.username) ASC`
      );
      const latest = await pool.query(
        `SELECT DISTINCT ON (technician_username)
            id, technician_username, level, rank, stats_json, suitable_jobs_json, restricted_jobs_json,
            strengths_json, risk_points_json, development_plan_json, generated_prompt,
            COALESCE(assessment_source,'admin') AS assessment_source,
            COALESCE(review_status,'verified') AS review_status,
            assessed_by, reviewed_by, reviewed_at, created_at
         FROM public.technician_base_status_assessments
         ORDER BY technician_username, created_at DESC`
      );
      const pending = await pool.query(
        `SELECT DISTINCT ON (technician_username)
            id, technician_username, level, rank, created_at,
            COALESCE(assessment_source,'self') AS assessment_source,
            COALESCE(review_status,'pending_review') AS review_status
         FROM public.technician_base_status_assessments
         WHERE COALESCE(review_status,'verified')='pending_review'
         ORDER BY technician_username, created_at DESC`
      );
      const map = new Map((latest.rows || []).map(r => [String(r.technician_username), r]));
      const pendingMap = new Map((pending.rows || []).map(r => [String(r.technician_username), r]));
      const people = (techs.rows || []).map(t => ({ ...t, latest_status: map.get(String(t.username)) || null, pending_status: pendingMap.get(String(t.username)) || null }));
      return res.json({ ok: true, people });
    } catch (e) {
      console.error('GET team-status error:', e);
      return res.status(500).json({ error: 'โหลด Team Status ไม่สำเร็จ' });
    }
  });

  router.get('/admin/api/technicians/:username/base-status', requireAdminSession, async (req, res) => {
    try {
      const username = String(req.params.username || '').trim();
      const technician = await getTechnicianForStatus(username);
      if (!technician) return res.status(404).json({ error: 'ไม่พบช่าง' });
      const latest = await getLatestBaseStatus(username);
      return res.json({ ok: true, technician, latest });
    } catch (e) {
      console.error('GET base-status error:', e);
      return res.status(500).json({ error: 'โหลด Base Status ไม่สำเร็จ' });
    }
  });

  router.get('/admin/api/technicians/:username/status', requireAdminSession, async (req, res) => {
    try {
      const username = String(req.params.username || '').trim();
      const technician = await getTechnicianForStatus(username);
      if (!technician) return res.status(404).json({ error: 'ไม่พบช่าง' });
      const latest = await getLatestBaseStatus(username);
      return res.json({ ok: true, technician, latest, future_work_adjustment: ['Completed jobs','On-time check-in','Status update completeness','Before/after photos','Customer reviews','Complaints','Rework','Admin override notes'] });
    } catch (e) {
      console.error('GET tech status error:', e);
      return res.status(500).json({ error: 'โหลด Status ไม่สำเร็จ' });
    }
  });

  router.get('/tech/api/base-status', requireTechnicianSession, async (req, res) => {
    try {
      const username = String(req.auth?.username || req.effective?.username || '').trim();
      const technician = await getTechnicianForStatus(username);
      if (!technician) return res.status(404).json({ error: 'ไม่พบข้อมูลช่างของคุณ' });
      const latest = await getLatestBaseStatus(username);
      const latest_self = await getLatestBaseStatus(username, { review_status: 'pending_review' });
      const latest_verified = await getLatestBaseStatus(username, { review_status: 'verified' });
      return res.json({ ok: true, technician, latest, latest_self, latest_verified });
    } catch (e) {
      console.error('GET tech self base-status error:', e);
      return res.status(500).json({ error: 'โหลดแบบประเมินของช่างไม่สำเร็จ' });
    }
  });

  return router;
};
