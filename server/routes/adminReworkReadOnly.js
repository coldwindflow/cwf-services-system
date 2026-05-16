module.exports = function createAdminReworkReadOnlyRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();
  const {
    pool,
    requireAdminSession,
    getDeductionTableMeta,
    dHas,
    dTextCol,
  } = deps;

  router.get('/admin/rework_cases', requireAdminSession, async (req, res) => {
    try {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));
      const where = [];
      const params = [];
      let p = 1;
      const add = (sql, val) => { params.push(val); where.push(sql.replace('?', `$${p++}`)); };
      if (req.query.status) add('status=?', String(req.query.status).trim());
      if (req.query.technician_username) add('technician_username=?', String(req.query.technician_username).trim());
      if (req.query.job_id) add('job_id=?', Number(req.query.job_id));
      if (req.query.reason_type) add('reason_type=?', String(req.query.reason_type).trim());
      if (req.query.from) add('created_at >= ?::timestamptz', `${String(req.query.from).slice(0,10)} 00:00:00+07:00`);
      if (req.query.to) add('created_at <= ?::timestamptz', `${String(req.query.to).slice(0,10)} 23:59:59+07:00`);
      const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const r = await pool.query(`SELECT * FROM public.technician_rework_cases ${sqlWhere} ORDER BY created_at DESC, rework_case_id DESC LIMIT ${limit}`, params);
      return res.json({ ok: true, rows: r.rows });
    } catch (e) {
      console.error('GET /admin/rework_cases', e);
      return res.status(500).json({ ok: false, error: 'โหลดเคสงานแก้ไขไม่สำเร็จ' });
    }
  });

  router.get('/admin/rework_cases/:id', requireAdminSession, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'rework_case_id ไม่ถูกต้อง' });
    try {
      const rr = await pool.query(`SELECT * FROM public.technician_rework_cases WHERE rework_case_id=$1`, [id]);
      if (!rr.rows.length) return res.status(404).json({ ok: false, error: 'ไม่พบเคสงานแก้ไข' });
      const row = rr.rows[0];

      const jobsMeta = await getDeductionTableMeta('jobs');
      const jobSelect = [
        'j.job_id',
        dHas(jobsMeta, 'booking_code') ? 'j.booking_code' : 'j.job_id::text AS booking_code',
        dHas(jobsMeta, 'customer_name') ? 'j.customer_name' : "NULL::text AS customer_name",
        dHas(jobsMeta, 'customer_phone') ? 'j.customer_phone' : "NULL::text AS customer_phone",
        dHas(jobsMeta, 'job_type') ? 'j.job_type' : "NULL::text AS job_type",
        dHas(jobsMeta, 'job_status') ? 'j.job_status' : "NULL::text AS job_status",
        dHas(jobsMeta, 'appointment_datetime') ? 'j.appointment_datetime' : "NULL::timestamptz AS appointment_datetime",
        dHas(jobsMeta, 'technician_username') ? 'j.technician_username' : "NULL::text AS technician_username",
        dHas(jobsMeta, 'warranty_end_at') ? 'j.warranty_end_at' : "NULL::timestamptz AS warranty_end_at",
        dHas(jobsMeta, 'return_reason') ? 'j.return_reason' : "NULL::text AS return_reason",
        dHas(jobsMeta, 'returned_at') ? 'j.returned_at' : "NULL::timestamptz AS returned_at",
        dHas(jobsMeta, 'travel_started_at') ? 'j.travel_started_at' : "NULL::timestamptz AS travel_started_at",
        dHas(jobsMeta, 'checkin_at') ? 'j.checkin_at' : "NULL::timestamptz AS checkin_at",
        dHas(jobsMeta, 'started_at') ? 'j.started_at' : "NULL::timestamptz AS started_at",
        dHas(jobsMeta, 'finished_at') ? 'j.finished_at' : "NULL::timestamptz AS finished_at",
        dHas(jobsMeta, 'revisit_result') ? 'j.revisit_result' : "NULL::text AS revisit_result",
        dHas(jobsMeta, 'revisit_note') ? 'j.revisit_note' : "NULL::text AS revisit_note",
        dHas(jobsMeta, 'evidence_json') ? 'j.evidence_json' : "NULL::jsonb AS evidence_json",
        dHas(jobsMeta, 'before_photos') ? 'j.before_photos' : "NULL::jsonb AS before_photos",
        dHas(jobsMeta, 'after_photos') ? 'j.after_photos' : "NULL::jsonb AS after_photos",
        dHas(jobsMeta, 'revisit_evidence_json') ? 'j.revisit_evidence_json' : "NULL::jsonb AS revisit_evidence_json"
      ];
      const jr = await pool.query(`SELECT ${jobSelect.join(', ')} FROM public.jobs j WHERE j.job_id=$1`, [row.job_id]);
      const job = jr.rows[0] || null;

      let technician = null;
      try {
        const usersMeta = await getDeductionTableMeta('users');
        const profMeta = await getDeductionTableMeta('technician_profiles');
        const techUsername = row.technician_username || job?.technician_username || '';
        if (techUsername && (usersMeta.exists || profMeta.exists)) {
          const displayName = `COALESCE(NULLIF(${dTextCol('p', profMeta, 'full_name')},''), NULLIF(${dTextCol('p', profMeta, 'name')},''), NULLIF(${dTextCol('u', usersMeta, 'full_name')},''), NULLIF(${dTextCol('u', usersMeta, 'name')},''), $1)`;
          const phone = `COALESCE(NULLIF(${dTextCol('p', profMeta, 'phone')},''), NULLIF(${dTextCol('u', usersMeta, 'phone')},''), '')`;
          let techSql;
          if (usersMeta.exists && profMeta.exists && dHas(usersMeta, 'username') && dHas(profMeta, 'username')) {
            techSql = `SELECT $1::text AS technician_username, ${displayName} AS display_name, ${phone} AS phone FROM public.users u FULL OUTER JOIN public.technician_profiles p ON p.username=u.username WHERE COALESCE(p.username,u.username)=$1 LIMIT 1`;
          } else if (profMeta.exists && dHas(profMeta, 'username')) {
            techSql = `SELECT p.username AS technician_username, ${displayName} AS display_name, ${phone} AS phone FROM public.technician_profiles p LEFT JOIN public.users u ON false WHERE p.username=$1 LIMIT 1`;
          } else if (usersMeta.exists && dHas(usersMeta, 'username')) {
            techSql = `SELECT u.username AS technician_username, ${displayName} AS display_name, ${phone} AS phone FROM public.users u LEFT JOIN public.technician_profiles p ON false WHERE u.username=$1 LIMIT 1`;
          }
          if (techSql) {
            const tr = await pool.query(techSql, [techUsername]);
            technician = tr.rows[0] || { technician_username: techUsername };
          }
        }
      } catch (e) {
        try { console.warn('[rework detail] technician lookup skipped:', e.message); } catch {}
      }

      let deduction = null;
      if (row.linked_deduction_case_id) {
        const dr = await pool.query(`SELECT * FROM public.technician_deduction_cases WHERE case_id=$1`, [row.linked_deduction_case_id]);
        deduction = dr.rows[0] || null;
      }
      const audit = await pool.query(
        `SELECT * FROM public.technician_deduction_audit_logs
         WHERE (entity_type='rework_case' AND entity_id=$1)
            OR (entity_type='deduction_case' AND entity_id=$2)
         ORDER BY created_at DESC, audit_id DESC`,
        [String(id), row.linked_deduction_case_id ? String(row.linked_deduction_case_id) : '__none__']
      );

      let job_updates = [];
      try {
        const updatesMeta = await getDeductionTableMeta('job_updates_v2');
        if (updatesMeta.exists && dHas(updatesMeta, 'job_id')) {
          const updateIdExpr = dHas(updatesMeta, 'update_id') ? 'update_id' : 'NULL::bigint AS update_id';
          const actorExpr = dHas(updatesMeta, 'actor_username') ? 'actor_username' : "NULL::text AS actor_username";
          const roleExpr = dHas(updatesMeta, 'actor_role') ? 'actor_role' : "NULL::text AS actor_role";
          const actionExpr = dHas(updatesMeta, 'action') ? 'action' : "NULL::text AS action";
          const msgExpr = dHas(updatesMeta, 'message') ? 'message' : "NULL::text AS message";
          const payloadExpr = dHas(updatesMeta, 'payload_json') ? 'payload_json' : "NULL::jsonb AS payload_json";
          const createdExpr = dHas(updatesMeta, 'created_at') ? 'created_at' : 'NOW() AS created_at';
          const ur = await pool.query(
            `SELECT ${updateIdExpr}, ${actorExpr}, ${roleExpr}, ${actionExpr}, ${msgExpr}, ${payloadExpr}, ${createdExpr}
               FROM public.job_updates_v2
              WHERE job_id=$1
                AND (
                  COALESCE(action::text,'') ILIKE '%rework%'
                  OR COALESCE(action::text,'') ILIKE '%revisit%'
                  OR COALESCE(action::text,'') ILIKE '%return%'
                  OR COALESCE(message::text,'') ILIKE '%แก้%'
                  OR COALESCE(message::text,'') ILIKE '%ประกัน%'
                )
              ORDER BY created_at DESC
              LIMIT 50`,
            [row.job_id]
          );
          job_updates = ur.rows || [];
        }
      } catch (e) {
        try { console.warn('[rework detail] job update lookup skipped:', e.message); } catch {}
      }

      let job_photos = [];
      try {
        const photosMeta = await getDeductionTableMeta('job_photos');
        if (photosMeta.exists && dHas(photosMeta, 'job_id')) {
          const photoSelect = [
            dHas(photosMeta, 'photo_id') ? 'photo_id' : 'NULL::bigint AS photo_id',
            dHas(photosMeta, 'photo_url') ? 'photo_url' : (dHas(photosMeta, 'url') ? 'url AS photo_url' : (dHas(photosMeta, 'secure_url') ? 'secure_url AS photo_url' : "NULL::text AS photo_url")),
            dHas(photosMeta, 'type') ? 'type' : (dHas(photosMeta, 'photo_type') ? 'photo_type AS type' : "NULL::text AS type"),
            dHas(photosMeta, 'created_at') ? 'created_at' : 'NOW() AS created_at'
          ];
          const pr = await pool.query(`SELECT ${photoSelect.join(', ')} FROM public.job_photos WHERE job_id=$1 ORDER BY created_at DESC LIMIT 80`, [row.job_id]);
          job_photos = pr.rows || [];
        }
      } catch (e) {
        try { console.warn('[rework detail] job photo lookup skipped:', e.message); } catch {}
      }

      const evidence_sources = {
        rework_evidence_json: row.evidence_json || [],
        job_evidence_json: job?.evidence_json || null,
        before_photos: job?.before_photos || null,
        after_photos: job?.after_photos || null,
        revisit_evidence_json: job?.revisit_evidence_json || null,
        job_photos
      };
      const verification = {
        revisit_result: row.revisit_result || job?.revisit_result || null,
        revisit_note: row.revisit_note || job?.revisit_note || null,
        timeline: {
          returned_at: job?.returned_at || null,
          travel_started_at: job?.travel_started_at || null,
          checkin_at: job?.checkin_at || null,
          started_at: job?.started_at || null,
          finished_at: job?.finished_at || null,
          resolved_at: row.resolved_at || null
        },
        has_evidence: !!(
          (Array.isArray(row.evidence_json) && row.evidence_json.length) ||
          job?.evidence_json || job?.before_photos || job?.after_photos || job?.revisit_evidence_json ||
          (Array.isArray(job_photos) && job_photos.length)
        )
      };

      return res.json({ ok: true, row, job, technician, linked_deduction_case: deduction, audit_logs: audit.rows, job_updates, job_photos, evidence_sources, verification });
    } catch (e) {
      console.error('GET /admin/rework_cases/:id', e);
      return res.status(500).json({ ok: false, error: 'โหลดรายละเอียดเคสงานแก้ไขไม่สำเร็จ', detail: process.env.NODE_ENV === 'production' ? undefined : e.message });
    }
  });

  return router;
};
