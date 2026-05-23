module.exports = function createAdminDeductionsReadOnlyRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();
  const {
    pool,
    requireAdminSession,
    deductionListFilters,
    PAYOUT_DEDUCTION_WARNING,
    getDeductionTableMeta,
    dHas,
    dTextCol,
    dSearchParts,
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
            COALESCE(SUM(amount) FILTER (WHERE status='applied'),0)::numeric AS applied_amount,
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

  router.get('/admin/deductions/technician_search', requireAdminSession, async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
      const usersMeta = await getDeductionTableMeta('users');
      const profMeta = await getDeductionTableMeta('technician_profiles');
      if (!usersMeta.exists && !profMeta.exists) {
        return res.json({ ok: true, rows: [], schema_mode: 'no_users_or_technician_profiles' });
      }

      const params = [];
      let p = 1;
      const searchRef = `$${p}`;
      if (q) params.push(`%${q}%`);

      const userUsername = dHas(usersMeta, 'username') ? 'u.username' : 'NULL::text';
      const profileUsername = dHas(profMeta, 'username') ? 'p.username' : 'NULL::text';
      const techUsername = `COALESCE(${profileUsername}, ${userUsername})`;
      const displayName = `COALESCE(NULLIF(${dTextCol('p', profMeta, 'full_name')},''), NULLIF(${dTextCol('p', profMeta, 'name')},''), NULLIF(${dTextCol('u', usersMeta, 'full_name')},''), NULLIF(${dTextCol('u', usersMeta, 'name')},''), ${techUsername})`;
      const phone = `COALESCE(NULLIF(${dTextCol('p', profMeta, 'phone')},''), NULLIF(${dTextCol('u', usersMeta, 'phone')},''), '')`;
      const role = `COALESCE(NULLIF(${dTextCol('u', usersMeta, 'role')},''), 'technician')`;
      const activeStatus = `COALESCE(NULLIF(${dTextCol('p', profMeta, 'accept_status')},''), NULLIF(${dTextCol('p', profMeta, 'partner_status')},''), '')`;

      let fromSql;
      if (usersMeta.exists && profMeta.exists && dHas(usersMeta, 'username') && dHas(profMeta, 'username')) {
        fromSql = `FROM public.users u FULL OUTER JOIN public.technician_profiles p ON p.username=u.username`;
      } else if (usersMeta.exists) {
        fromSql = `FROM public.users u LEFT JOIN LATERAL (SELECT NULL::text AS username) p ON TRUE`;
      } else {
        fromSql = `FROM public.technician_profiles p LEFT JOIN LATERAL (SELECT NULL::text AS username) u ON TRUE`;
      }

      const roleFilter = usersMeta.exists && dHas(usersMeta, 'role')
        ? `(u.role IN ('technician','tech','senior_technician','lead_technician','ช่าง') OR ${profileUsername} IS NOT NULL)`
        : `${profileUsername} IS NOT NULL`;
      const where = [roleFilter, `${techUsername} IS NOT NULL`, `${techUsername} <> ''`];
      if (q) {
        const parts = [
          ...dSearchParts('u', usersMeta, ['username','full_name','name','phone'], searchRef),
          ...dSearchParts('p', profMeta, ['username','full_name','name','phone'], searchRef),
        ];
        if (parts.length) where.push(`(${parts.join(' OR ')})`);
        p += 1;
      }

      const r = await pool.query(
        `SELECT ${techUsername} AS technician_username,
                ${displayName} AS display_name,
                ${phone} AS phone,
                ${role} AS role,
                ${activeStatus} AS active_status
           ${fromSql}
          WHERE ${where.join(' AND ')}
          ORDER BY ${displayName} ASC
          LIMIT ${limit}`,
        params
      );
      const rows = (r.rows || []).map(row => ({
        ...row,
        label: `${row.display_name || row.technician_username} (${row.technician_username})${row.phone ? ' • ' + row.phone : ''}`,
      }));
      return res.json({ ok: true, rows, schema_mode: usersMeta.exists && profMeta.exists ? 'users+technician_profiles' : (usersMeta.exists ? 'users_only' : 'technician_profiles_only') });
    } catch (e) {
      console.error('GET /admin/deductions/technician_search', e);
      return res.status(500).json({ ok: false, error: 'ค้นหาช่างไม่สำเร็จ', detail: process.env.NODE_ENV === 'production' ? undefined : String(e.message || e) });
    }
  });

  router.get('/admin/deductions/job_search', requireAdminSession, async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const technician = String(req.query.technician_username || '').trim();
      const warrantyOnly = String(req.query.warranty_only || '') === '1';
      const status = String(req.query.status || '').trim();
      const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
      const jobsMeta = await getDeductionTableMeta('jobs');
      const assignMeta = await getDeductionTableMeta('job_assignments');
      const profMeta = await getDeductionTableMeta('technician_profiles');
      const usersMeta = await getDeductionTableMeta('users');
      if (!jobsMeta.exists || !dHas(jobsMeta, 'job_id')) return res.json({ ok: true, rows: [], schema_mode: 'jobs_table_missing' });

      const hasAssign = assignMeta.exists && dHas(assignMeta, 'job_id') && dHas(assignMeta, 'technician_username');
      const assignJoin = hasAssign ? `LEFT JOIN LATERAL (SELECT technician_username FROM public.job_assignments a WHERE a.job_id=j.job_id ORDER BY ${dHas(assignMeta,'created_at') ? 'created_at ASC,' : ''} technician_username ASC LIMIT 1) ja ON TRUE` : `LEFT JOIN LATERAL (SELECT NULL::text AS technician_username) ja ON TRUE`;
      const techExpr = `COALESCE(ja.technician_username, ${dTextCol('j', jobsMeta, 'technician_username', 'NULL::text')})`;
      const profJoin = profMeta.exists && dHas(profMeta,'username') ? `LEFT JOIN public.technician_profiles tp ON tp.username=${techExpr}` : `LEFT JOIN LATERAL (SELECT NULL::text AS username) tp ON TRUE`;
      const userJoin = usersMeta.exists && dHas(usersMeta,'username') ? `LEFT JOIN public.users u ON u.username=${techExpr}` : `LEFT JOIN LATERAL (SELECT NULL::text AS username) u ON TRUE`;
      const techName = `COALESCE(NULLIF(${dTextCol('tp', profMeta, 'full_name')},''), NULLIF(${dTextCol('tp', profMeta, 'name')},''), NULLIF(${dTextCol('u', usersMeta, 'full_name')},''), NULLIF(${dTextCol('u', usersMeta, 'name')},''), ${techExpr})`;
      const bookingExpr = dTextCol('j', jobsMeta, 'booking_code', 'j.job_id::text');
      const customerName = dTextCol('j', jobsMeta, 'customer_name');
      const customerPhone = dTextCol('j', jobsMeta, 'customer_phone');
      const jobStatus = dTextCol('j', jobsMeta, 'job_status');
      const effectiveWarrantyEndSql = dHas(jobsMeta, 'warranty_end_at') && dHas(jobsMeta, 'finished_at')
        ? `COALESCE(j.warranty_end_at, CASE WHEN j.finished_at IS NOT NULL THEN j.finished_at + INTERVAL '30 days' ELSE NULL END)`
        : (dHas(jobsMeta, 'warranty_end_at') ? `j.warranty_end_at` : (dHas(jobsMeta, 'finished_at') ? `j.finished_at + INTERVAL '30 days'` : `NULL::timestamptz`));

      const where = [];
      const params = [];
      let p = 1;
      if (q) {
        const parts = [];
        const num = Number(q);
        if (Number.isFinite(num) && num > 0) { parts.push(`j.job_id=$${p}`); params.push(num); p += 1; }
        const ref = `$${p}`; params.push(`%${q}%`); p += 1;
        parts.push(...dSearchParts('j', jobsMeta, ['booking_code','customer_name','customer_phone','address_text','address','technician_username'], ref));
        if (hasAssign) parts.push(`COALESCE(ja.technician_username,'') ILIKE ${ref}`);
        if (profMeta.exists) parts.push(...dSearchParts('tp', profMeta, ['full_name','name','phone','username'], ref));
        where.push(`(${parts.length ? parts.join(' OR ') : 'TRUE'})`);
      }
      if (technician) { where.push(`${techExpr}=$${p++}`); params.push(technician); }
      if (warrantyOnly) where.push(`${effectiveWarrantyEndSql} IS NOT NULL AND ${effectiveWarrantyEndSql} >= NOW()`);
      if (status && dHas(jobsMeta, 'job_status')) { where.push(`j.job_status=$${p++}`); params.push(status); }
      if (dHas(jobsMeta, 'job_status')) where.push(`COALESCE(j.job_status,'') NOT ILIKE '%ยกเลิก%' AND COALESCE(j.job_status,'') NOT ILIKE '%cancel%'`);
      const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const appointmentDate = dHas(jobsMeta, 'appointment_datetime') ? `(j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date` : `NULL::date`;
      const appointmentTime = dHas(jobsMeta, 'appointment_datetime') ? `to_char(j.appointment_datetime AT TIME ZONE 'Asia/Bangkok', 'HH24:MI')` : `NULL::text`;
      const appointmentValue = dHas(jobsMeta, 'appointment_datetime') ? `j.appointment_datetime` : `NULL::timestamptz`;
      const originalWarranty = dHas(jobsMeta, 'warranty_end_at') ? `j.warranty_end_at` : `NULL::timestamptz`;
      const warrantyInferred = dHas(jobsMeta, 'warranty_end_at') && dHas(jobsMeta, 'finished_at') ? `(j.warranty_end_at IS NULL AND j.finished_at IS NOT NULL)` : `false`;
      const orderExpr = dHas(jobsMeta, 'appointment_datetime') ? `j.appointment_datetime DESC NULLS LAST, j.job_id DESC` : `j.job_id DESC`;

      const r = await pool.query(
        `SELECT j.job_id,
                COALESCE(${bookingExpr}, j.job_id::text) AS job_code,
                ${customerName} AS customer_name,
                ${customerPhone} AS customer_phone,
                ${appointmentDate} AS appointment_date,
                ${appointmentTime} AS appointment_time,
                ${appointmentValue} AS appointment_datetime,
                ${jobStatus} AS job_status,
                ${effectiveWarrantyEndSql} AS warranty_end_at,
                ${originalWarranty} AS original_warranty_end_at,
                ${warrantyInferred} AS warranty_inferred,
                (${effectiveWarrantyEndSql} IS NOT NULL AND ${effectiveWarrantyEndSql} >= NOW()) AS is_in_warranty,
                ${techExpr} AS technician_username,
                ${techName} AS technician_name
           FROM public.jobs j
           ${assignJoin}
           ${profJoin}
           ${userJoin}
           ${sqlWhere}
          ORDER BY ${orderExpr}
          LIMIT ${limit}`,
        params
      );
      const rows = (r.rows || []).map(row => ({
        ...row,
        label: `#${row.job_code || row.job_id} • ${row.customer_name || '-'} • ${row.customer_phone || '-'} • ${row.technician_name || row.technician_username || '-'}`,
      }));
      return res.json({ ok: true, rows, schema_mode: 'schema_aware_job_search' });
    } catch (e) {
      console.error('GET /admin/deductions/job_search', e);
      return res.status(500).json({ ok: false, error: 'ค้นหางานไม่สำเร็จ', detail: process.env.NODE_ENV === 'production' ? undefined : String(e.message || e) });
    }
  });

  router.get('/admin/deductions/warranty_jobs', requireAdminSession, async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const technician = String(req.query.technician_username || '').trim();
      const status = String(req.query.status || '').trim();
      const onlyWithout = String(req.query.only_without_rework_case || '') === '1';
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
      const jobsMeta = await getDeductionTableMeta('jobs');
      const assignMeta = await getDeductionTableMeta('job_assignments');
      const profMeta = await getDeductionTableMeta('technician_profiles');
      const usersMeta = await getDeductionTableMeta('users');
      const reworkMeta = await getDeductionTableMeta('technician_rework_cases');
      if (!jobsMeta.exists || !dHas(jobsMeta, 'job_id')) {
        return res.json({ ok: true, rows: [], row_count: 0, schema_mode: 'jobs_table_missing', fallback_mode: 'none', source_filters_used: [] });
      }

      const hasAssign = assignMeta.exists && dHas(assignMeta, 'job_id') && dHas(assignMeta, 'technician_username');
      const assignJoin = hasAssign ? `LEFT JOIN LATERAL (SELECT technician_username FROM public.job_assignments a WHERE a.job_id=j.job_id ORDER BY ${dHas(assignMeta,'created_at') ? 'created_at ASC,' : ''} technician_username ASC LIMIT 1) ja ON TRUE` : `LEFT JOIN LATERAL (SELECT NULL::text AS technician_username) ja ON TRUE`;
      const techExpr = `COALESCE(ja.technician_username, ${dTextCol('j', jobsMeta, 'technician_username', 'NULL::text')})`;
      const profJoin = profMeta.exists && dHas(profMeta,'username') ? `LEFT JOIN public.technician_profiles tp ON tp.username=${techExpr}` : `LEFT JOIN LATERAL (SELECT NULL::text AS username) tp ON TRUE`;
      const userJoin = usersMeta.exists && dHas(usersMeta,'username') ? `LEFT JOIN public.users u ON u.username=${techExpr}` : `LEFT JOIN LATERAL (SELECT NULL::text AS username) u ON TRUE`;
      const techName = `COALESCE(NULLIF(${dTextCol('tp', profMeta, 'full_name')},''), NULLIF(${dTextCol('tp', profMeta, 'name')},''), NULLIF(${dTextCol('u', usersMeta, 'full_name')},''), NULLIF(${dTextCol('u', usersMeta, 'name')},''), ${techExpr})`;
      const bookingExpr = dTextCol('j', jobsMeta, 'booking_code', 'j.job_id::text');
      const customerName = dTextCol('j', jobsMeta, 'customer_name');
      const customerPhone = dTextCol('j', jobsMeta, 'customer_phone');
      const addressExpr = dHas(jobsMeta, 'address_text') ? `j.address_text` : (dHas(jobsMeta, 'address') ? `j.address` : `''::text`);
      const jobStatus = dTextCol('j', jobsMeta, 'job_status');
      const finishedAt = dHas(jobsMeta, 'finished_at') ? `j.finished_at` : `NULL::timestamptz`;
      const originalWarranty = dHas(jobsMeta, 'warranty_end_at') ? `j.warranty_end_at` : `NULL::timestamptz`;
      const effectiveWarrantyEndSql = dHas(jobsMeta, 'warranty_end_at') && dHas(jobsMeta, 'finished_at')
        ? `COALESCE(j.warranty_end_at, CASE WHEN j.finished_at IS NOT NULL THEN j.finished_at + INTERVAL '30 days' ELSE NULL END)`
        : (dHas(jobsMeta, 'warranty_end_at') ? `j.warranty_end_at` : (dHas(jobsMeta, 'finished_at') ? `j.finished_at + INTERVAL '30 days'` : (dHas(jobsMeta, 'appointment_datetime') ? `j.appointment_datetime + INTERVAL '30 days'` : `NULL::timestamptz`)));
      const warrantyInferred = dHas(jobsMeta, 'warranty_end_at') && dHas(jobsMeta, 'finished_at') ? `(j.warranty_end_at IS NULL AND j.finished_at IS NOT NULL)` : (dHas(jobsMeta, 'warranty_end_at') ? `false` : `(${effectiveWarrantyEndSql} IS NOT NULL)`);
      const warrantySource = dHas(jobsMeta, 'warranty_end_at') && dHas(jobsMeta, 'finished_at')
        ? `CASE WHEN j.warranty_end_at IS NOT NULL THEN 'jobs.warranty_end_at' WHEN j.finished_at IS NOT NULL THEN 'inferred_30_days_from_finished_at' ELSE 'search_result_needs_warranty_review' END`
        : (dHas(jobsMeta, 'warranty_end_at') ? `'jobs.warranty_end_at'` : (dHas(jobsMeta, 'finished_at') ? `'inferred_30_days_from_finished_at'` : `'search_result_needs_warranty_review'`));

      const hasRework = reworkMeta.exists && dHas(reworkMeta, 'job_id') && dHas(reworkMeta, 'status');
      const reworkLatestJoin = hasRework
        ? `LEFT JOIN LATERAL (SELECT rework_case_id, status FROM public.technician_rework_cases rc WHERE rc.job_id=j.job_id ORDER BY ${dHas(reworkMeta,'created_at') ? 'created_at DESC,' : ''} ${dHas(reworkMeta,'rework_case_id') ? 'rework_case_id DESC' : 'job_id DESC'} LIMIT 1) lr ON TRUE`
        : `LEFT JOIN LATERAL (SELECT NULL::bigint AS rework_case_id, NULL::text AS status) lr ON TRUE`;
      const activeReworkExpr = hasRework ? `EXISTS (SELECT 1 FROM public.technician_rework_cases ar WHERE ar.job_id=j.job_id AND ar.status IN ('open','in_progress'))` : `false`;

      const where = [];
      const params = [];
      const sourceFilters = [];
      let p = 1;
      let exactJobIdSearch = false;
      if (q) {
        const parts = [];
        const num = Number(q);
        if (Number.isFinite(num) && num > 0) { exactJobIdSearch = true; parts.push(`j.job_id=$${p}`); params.push(num); p += 1; }
        const ref = `$${p}`; params.push(`%${q}%`); p += 1;
        parts.push(...dSearchParts('j', jobsMeta, ['booking_code','customer_name','customer_phone','address_text','address','technician_username'], ref));
        if (hasAssign) parts.push(`COALESCE(ja.technician_username,'') ILIKE ${ref}`);
        if (profMeta.exists) parts.push(...dSearchParts('tp', profMeta, ['full_name','name','phone','username'], ref));
        where.push(`(${parts.length ? parts.join(' OR ') : 'TRUE'})`);
        sourceFilters.push('q_search_includes_non_warranty_matches');
      } else {
        where.push(`${effectiveWarrantyEndSql} IS NOT NULL`);
        where.push(`${effectiveWarrantyEndSql} >= NOW()`);
        sourceFilters.push(dHas(jobsMeta, 'warranty_end_at') ? 'jobs.warranty_end_at' : 'no_warranty_end_at_column');
        if (dHas(jobsMeta, 'finished_at')) sourceFilters.push('finished_at_plus_30_days');
      }
      if (technician) { where.push(`${techExpr}=$${p++}`); params.push(technician); }
      if (status && dHas(jobsMeta, 'job_status')) { where.push(`j.job_status=$${p++}`); params.push(status); }
      if (onlyWithout && hasRework) where.push(`NOT EXISTS (SELECT 1 FROM public.technician_rework_cases ar WHERE ar.job_id=j.job_id AND ar.status IN ('open','in_progress'))`);
      if (!q || !exactJobIdSearch) {
        if (dHas(jobsMeta, 'canceled_at')) where.push(`j.canceled_at IS NULL`);
        if (dHas(jobsMeta, 'job_status')) where.push(`COALESCE(j.job_status,'') NOT ILIKE '%ยกเลิก%' AND COALESCE(j.job_status,'') NOT ILIKE '%cancel%'`);
      }
      const appointmentDate = dHas(jobsMeta, 'appointment_datetime') ? `(j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date` : `NULL::date`;
      const appointmentTime = dHas(jobsMeta, 'appointment_datetime') ? `to_char(j.appointment_datetime AT TIME ZONE 'Asia/Bangkok', 'HH24:MI')` : `NULL::text`;
      const returnReason = dTextCol('j', jobsMeta, 'return_reason');
      const orderExpr = q ? `j.job_id DESC` : `${effectiveWarrantyEndSql} ASC NULLS LAST, j.job_id DESC`;

      const r = await pool.query(
        `SELECT j.job_id,
                COALESCE(${bookingExpr}, j.job_id::text) AS job_code,
                ${customerName} AS customer_name,
                ${customerPhone} AS customer_phone,
                ${addressExpr} AS address,
                ${appointmentDate} AS appointment_date,
                ${appointmentTime} AS appointment_time,
                ${finishedAt} AS finished_at,
                ${effectiveWarrantyEndSql} AS warranty_end_at,
                ${originalWarranty} AS original_warranty_end_at,
                ${warrantyInferred} AS warranty_inferred,
                CASE WHEN ${effectiveWarrantyEndSql} IS NULL OR ${effectiveWarrantyEndSql} < NOW() THEN 'search_result_needs_warranty_review' ELSE ${warrantySource} END AS warranty_source,
                CASE WHEN ${effectiveWarrantyEndSql} IS NOT NULL THEN GREATEST(0, CEIL(EXTRACT(EPOCH FROM (${effectiveWarrantyEndSql} - NOW())) / 86400.0))::int ELSE NULL::int END AS warranty_days_left,
                ${jobStatus} AS job_status,
                ${techExpr} AS technician_username,
                ${techName} AS technician_name,
                ${activeReworkExpr} AS has_active_rework_case,
                lr.rework_case_id AS latest_rework_case_id,
                lr.status AS latest_rework_status,
                ${returnReason} AS return_reason
           FROM public.jobs j
           ${assignJoin}
           ${profJoin}
           ${userJoin}
           ${reworkLatestJoin}
          WHERE ${where.length ? where.join(' AND ') : 'TRUE'}
          ORDER BY ${orderExpr}
          LIMIT ${limit}`,
        params
      );
      return res.json({
        ok: true,
        rows: r.rows || [],
        row_count: (r.rows || []).length,
        source_filters_used: sourceFilters,
        schema_mode: 'schema_aware_warranty_jobs',
        fallback_mode: q ? 'q_search_can_return_jobs_without_warranty' : 'warranty_end_or_finished_30_days',
        note: 'รวมงานที่มี warranty_end_at, งานที่ปิดภายใน 30 วัน, และเมื่อค้นหาโดยตรงจะแสดงงานที่พบเพื่อให้แอดมินตรวจประกันเอง',
      });
    } catch (e) {
      console.error('GET /admin/deductions/warranty_jobs', e);
      return res.status(500).json({ ok: false, error: 'โหลดงานในประกันไม่สำเร็จ', detail: process.env.NODE_ENV === 'production' ? undefined : String(e.message || e) });
    }
  });

  router.get('/admin/deductions/suggestions', requireAdminSession, async (req, res) => {
    try {
      const from = String(req.query.from || '').slice(0,10);
      const to = String(req.query.to || '').slice(0,10);
      const technician = String(req.query.technician_username || '').trim();
      const severity = String(req.query.severity || '').trim();
      const type = String(req.query.type || '').trim();
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
      const params = [];
      let p = 1;
      const common = [];
      if (from) { common.push(`detected_at >= $${p++}::timestamptz`); params.push(`${from} 00:00:00+07:00`); }
      if (to) { common.push(`detected_at <= $${p++}::timestamptz`); params.push(`${to} 23:59:59+07:00`); }
      if (technician) { common.push(`technician_username=$${p++}`); params.push(technician); }
      if (severity) { common.push(`severity=$${p++}`); params.push(severity); }
      if (type) { common.push(`deduction_type=$${p++}`); params.push(type); }
      const whereSuggestion = common.length ? `WHERE ${common.join(' AND ')}` : '';
      const sql = `
        WITH raw AS (
          SELECT
            ('late_arrival:' || j.job_id)::text AS suggestion_id,
            'late_arrival'::text AS deduction_type,
            'เข้างานสาย'::text AS deduction_type_label_th,
            COALESCE(ja.technician_username, j.technician_username)::text AS technician_username,
            COALESCE(NULLIF(tp.full_name,''), NULLIF(u.full_name,''), COALESCE(ja.technician_username, j.technician_username))::text AS technician_name,
            COALESCE(tp.phone,'')::text AS technician_phone,
            j.job_id,
            COALESCE(j.booking_code, j.job_id::text)::text AS job_code,
            j.customer_name,
            j.customer_phone,
            ('ระบบพบว่าเช็คอิน/เริ่มงานช้ากว่าเวลานัดประมาณ ' || ROUND(EXTRACT(EPOCH FROM (COALESCE(j.checkin_at,j.started_at) - j.appointment_datetime))/60.0)::int || ' นาที')::text AS reason,
            ('นัดหมาย ' || to_char(j.appointment_datetime AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD HH24:MI') || ' / เริ่มจริง ' || to_char(COALESCE(j.checkin_at,j.started_at) AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD HH24:MI'))::text AS evidence_summary,
            100::numeric AS suggested_amount,
            CASE WHEN COALESCE(j.checkin_at,j.started_at) > j.appointment_datetime + INTERVAL '60 minutes' THEN 'high' ELSE 'medium' END::text AS severity,
            COALESCE(j.checkin_at,j.started_at, NOW()) AS detected_at,
            'jobs.checkin_at'::text AS source
          FROM public.jobs j
          LEFT JOIN LATERAL (SELECT technician_username FROM public.job_assignments a WHERE a.job_id=j.job_id ORDER BY created_at ASC LIMIT 1) ja ON TRUE
          LEFT JOIN public.technician_profiles tp ON tp.username=COALESCE(ja.technician_username, j.technician_username)
          LEFT JOIN public.users u ON u.username=COALESCE(ja.technician_username, j.technician_username)
          WHERE j.appointment_datetime IS NOT NULL
            AND COALESCE(j.checkin_at, j.started_at) IS NOT NULL
            AND COALESCE(j.checkin_at, j.started_at) > j.appointment_datetime + INTERVAL '15 minutes'
            AND COALESCE(ja.technician_username, j.technician_username) IS NOT NULL
          UNION ALL
          SELECT
            ('rework:' || rc.rework_case_id)::text AS suggestion_id,
            CASE WHEN rc.resolution='failed' OR COALESCE(rc.revisit_result,'') ILIKE '%fail%' OR COALESCE(rc.revisit_result,'') ILIKE '%ไม่สำเร็จ%' THEN 'rework_failed' ELSE 'warranty_rework_minor' END::text AS deduction_type,
            CASE WHEN rc.resolution='failed' OR COALESCE(rc.revisit_result,'') ILIKE '%fail%' OR COALESCE(rc.revisit_result,'') ILIKE '%ไม่สำเร็จ%' THEN 'แก้งานไม่สำเร็จ' ELSE 'งานถูกส่งกลับแก้ในประกัน' END::text AS deduction_type_label_th,
            rc.technician_username,
            COALESCE(NULLIF(tp.full_name,''), NULLIF(u.full_name,''), rc.technician_username)::text AS technician_name,
            COALESCE(tp.phone,'')::text AS technician_phone,
            rc.job_id,
            COALESCE(j.booking_code, rc.job_id::text)::text AS job_code,
            j.customer_name,
            j.customer_phone,
            ('งานถูกเปิดเคสแก้ไข: ' || COALESCE(rc.reason_note, rc.reason_type, '-'))::text AS reason,
            ('เคส ' || rc.case_code || ' / สถานะ ' || rc.status || COALESCE(' / ผล ' || rc.resolution, ''))::text AS evidence_summary,
            CASE WHEN rc.resolution='failed' THEN 300 ELSE 100 END::numeric AS suggested_amount,
            CASE WHEN rc.resolution='failed' THEN 'high' ELSE 'medium' END::text AS severity,
            COALESCE(rc.resolved_at, rc.created_at, NOW()) AS detected_at,
            'technician_rework_cases'::text AS source
          FROM public.technician_rework_cases rc
          LEFT JOIN public.jobs j ON j.job_id=rc.job_id
          LEFT JOIN public.technician_profiles tp ON tp.username=rc.technician_username
          LEFT JOIN public.users u ON u.username=rc.technician_username
          WHERE rc.status <> 'voided'
            AND rc.technician_username IS NOT NULL
        ), deduped AS (
          SELECT raw.*, dc.case_id AS existing_case_id
            FROM raw
            LEFT JOIN public.technician_deduction_cases dc
              ON dc.job_id=raw.job_id
             AND dc.technician_username=raw.technician_username
             AND dc.deduction_type=raw.deduction_type
             AND dc.status NOT IN ('rejected','voided')
        )
        SELECT *, (existing_case_id IS NULL) AS can_create_case
          FROM deduped
          ${whereSuggestion}
         ORDER BY detected_at DESC NULLS LAST
         LIMIT ${limit}`;
      const r = await pool.query(sql, params);
      return res.json({ ok: true, rows: r.rows || [], skipped_detections: ['missing_status_update', 'missing_required_photos', 'no_show', 'same_day_cancel'] });
    } catch (e) {
      console.error('GET /admin/deductions/suggestions', e);
      return res.status(500).json({ ok: false, error: 'โหลดเคสแนะนำจากระบบไม่สำเร็จ' });
    }
  });

  router.get('/admin/deductions/:id', requireAdminSession, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'case_id ไม่ถูกต้อง' });
    try {
      const cr = await pool.query(`SELECT * FROM public.technician_deduction_cases WHERE case_id=$1`, [id]);
      if (!cr.rows.length) return res.status(404).json({ ok: false, error: 'ไม่พบเคส' });
      const row = cr.rows[0];
      let job = null;
      if (row.job_id) {
        const jr = await pool.query(
          `SELECT job_id, booking_code, customer_name, customer_phone, job_type, job_status,
                  appointment_datetime, technician_username, warranty_end_at, return_reason
             FROM public.jobs WHERE job_id=$1`,
          [row.job_id]
        );
        job = jr.rows[0] || null;
      }
      let applied_adjustment = null;
      if (row.applied_adjustment_id) {
        const ar = await pool.query(
          `SELECT adj_id, payout_id, technician_username, job_id, adj_amount, reason, created_at, created_by
             FROM public.technician_payout_adjustments
            WHERE adj_id=$1
            LIMIT 1`,
          [row.applied_adjustment_id]
        );
        applied_adjustment = ar.rows[0] || null;
      }
      const audit = await pool.query(
        `SELECT * FROM public.technician_deduction_audit_logs
         WHERE entity_type='deduction_case' AND entity_id=$1
         ORDER BY created_at DESC, audit_id DESC`,
        [String(id)]
      );
      return res.json({ ok: true, row, job, applied_adjustment, audit_logs: audit.rows, message: PAYOUT_DEDUCTION_WARNING });
    } catch (e) {
      console.error('GET /admin/deductions/:id', e);
      return res.status(500).json({ ok: false, error: 'โหลดรายละเอียดเคสไม่สำเร็จ' });
    }
  });

  return router;
};
