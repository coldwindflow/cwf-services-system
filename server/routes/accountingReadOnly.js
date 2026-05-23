module.exports = function createAccountingReadOnlyRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();
  const {
    pool,
    requireAccountingPermission,
    accountingSafeQuery: _accountingSafeQuery,
    accountingCard: _accountingCard,
    accountingRevenueStatus: _accountingRevenueStatus,
    accountingStoredPayoutTechRows: _accountingStoredPayoutTechRows,
    accountingEnrichPayoutTechRows: _accountingEnrichPayoutTechRows,
    accountingPayoutDueDate: _accountingPayoutDueDate,
    accountingThaiDate: _accountingThaiDate,
    accountingPayoutCutoffLabel: _accountingPayoutCutoffLabel,
    accountingWhtMonthKeyFromPeriod: _accountingWhtMonthKeyFromPeriod,
    accountingWhtMonthLabel: _accountingWhtMonthLabel,
    buildPayoutTechSummaryRows: _buildPayoutTechSummaryRows,
    getPayoutPeriod: _getPayoutPeriod,
    maskPhone: _maskPhone,
    money: _money,
    paidStatus: _paidStatus,
    sqlDonePredicate: _sqlDonePredicate,
    technicianPayoutLedger,
  } = deps;

router.get('/admin/accounting/summary', requireAccountingPermission('accounting.read.summary'), async (req, res) => {
  const soft_errors = [];
  try {
    const waitingReceipts = await _accountingSafeQuery(soft_errors, 'waiting_receipts',
      `WITH gross AS (
         SELECT j.job_id, COALESCE(NULLIF(SUM(COALESCE(ji.line_total,0)),0), COALESCE(j.job_price,0), 0) AS total_amount
           FROM public.jobs j
           LEFT JOIN public.job_items ji ON CAST(ji.job_id AS TEXT)=CAST(j.job_id AS TEXT)
          WHERE ${_sqlDonePredicate('j')}
            AND j.finished_at IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM public.accounting_documents d
               WHERE d.job_id=j.job_id AND d.document_type='receipt' AND COALESCE(d.status,'') <> 'voided'
            )
          GROUP BY j.job_id, j.job_price
       )
       SELECT COUNT(*)::int AS count, COALESCE(SUM(total_amount),0)::numeric AS total_amount FROM gross`);

    const unpaidRevenue = await _accountingSafeQuery(soft_errors, 'unpaid_revenue',
      `WITH gross AS (
         SELECT j.job_id, COALESCE(NULLIF(SUM(COALESCE(ji.line_total,0)),0), COALESCE(j.job_price,0), 0) AS total_amount
           FROM public.jobs j
           LEFT JOIN public.job_items ji ON CAST(ji.job_id AS TEXT)=CAST(j.job_id AS TEXT)
          WHERE ${_sqlDonePredicate('j')}
            AND j.finished_at IS NOT NULL
            AND NOT (COALESCE(j.payment_status,'unpaid') = 'paid' OR j.paid_at IS NOT NULL)
          GROUP BY j.job_id, j.job_price
       )
       SELECT COUNT(*)::int AS count, COALESCE(SUM(total_amount),0)::numeric AS total_amount FROM gross`);

    const waitingProof = await _accountingSafeQuery(soft_errors, 'waiting_payment_proof',
      `WITH gross AS (
         SELECT j.job_id, COALESCE(NULLIF(SUM(COALESCE(ji.line_total,0)),0), COALESCE(j.job_price,0), 0) AS total_amount
           FROM public.jobs j
           LEFT JOIN public.job_items ji ON CAST(ji.job_id AS TEXT)=CAST(j.job_id AS TEXT)
          WHERE ${_sqlDonePredicate('j')}
            AND j.finished_at IS NOT NULL
            AND (COALESCE(j.payment_status,'unpaid')='paid' OR j.paid_at IS NOT NULL)
            AND NOT EXISTS (
              SELECT 1 FROM public.job_photos p
               WHERE p.job_id=j.job_id AND COALESCE(p.phase,'')='payment_slip' AND COALESCE(p.public_url,'') <> ''
            )
          GROUP BY j.job_id, j.job_price
       )
       SELECT COUNT(*)::int AS count, COALESCE(SUM(total_amount),0)::numeric AS total_amount FROM gross`);

    const payoutRows = technicianPayoutLedger ? await technicianPayoutLedger.listPeriods(80) : [];
    const payoutPending = {
      rows: [{
        count: payoutRows.filter(r => String(r.status || 'draft') !== 'paid').length,
        total_amount: payoutRows.reduce((sum, r) => sum + (String(r.status || 'draft') !== 'paid' ? Number(r.remaining_amount || 0) : 0), 0),
      }],
    };

    const pendingExpenses = await _accountingSafeQuery(soft_errors, 'pending_expenses',
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount),0)::numeric AS total_amount FROM public.accounting_expenses WHERE status IN ('draft','submitted')`);
    const pendingDocuments = await _accountingSafeQuery(soft_errors, 'pending_documents',
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(total_amount),0)::numeric AS total_amount FROM public.accounting_documents WHERE status='draft'`);
    const recentAudit = await _accountingSafeQuery(soft_errors, 'recent_audit',
      `SELECT id, actor_username, actor_role, action, entity_type, entity_id, created_at, note FROM public.accounting_audit_log ORDER BY created_at DESC LIMIT 10`);
    const docs = await _accountingSafeQuery(soft_errors, 'documents',
      `SELECT document_id, document_no, document_type, status, job_id, customer_name, issue_date, total_amount, created_at FROM public.accounting_documents ORDER BY created_at DESC LIMIT 30`);
    const expenses = await _accountingSafeQuery(soft_errors, 'expenses',
      `SELECT expense_id, expense_date, category, vendor_name, description, amount, vat_amount, withholding_amount, payment_method, payment_reference, proof_url, status, created_at FROM public.accounting_expenses ORDER BY expense_date DESC, created_at DESC LIMIT 30`);

    const wr = waitingReceipts.rows[0] || {};
    const ur = unpaidRevenue.rows[0] || {};
    const wp = waitingProof.rows[0] || {};
    const pp = payoutPending.rows[0] || {};
    const pe = pendingExpenses.rows[0] || {};
    const pd = pendingDocuments.rows[0] || {};
    return res.json({
      ok: true,
      cards: [
        _accountingCard('waiting_receipts', 'รอออกใบเสร็จ', wr.count, wr.total_amount, 'yellow', 'documents'),
        _accountingCard('unpaid_revenue', 'ค้างรับเงิน', ur.count, ur.total_amount, 'red', 'revenue'),
        _accountingCard('waiting_payment_proof', 'รอแนบหลักฐานรับเงิน', wp.count, wp.total_amount, 'sky', 'revenue'),
        _accountingCard('pending_payout_periods', 'งวดจ่ายช่างค้างจ่าย', pp.count, pp.total_amount, 'blue', 'payouts'),
        _accountingCard('pending_expenses', 'รายจ่ายรอตรวจ', pe.count, pe.total_amount, 'orange', 'expenses'),
        _accountingCard('pending_documents', 'เอกสารรอตรวจ', pd.count, pd.total_amount, 'purple', 'documents'),
        _accountingCard('recommended_exports', 'รายงานที่ควร Export', 6, null, 'green', 'reports'),
      ],
      recent_audit: recentAudit.rows,
      documents: docs.rows,
      expenses: expenses.rows,
      soft_errors,
    });
  } catch (e) {
    console.error('GET /admin/accounting/summary', e);
    return res.status(500).json({ ok: false, cards: [], recent_audit: [], documents: [], expenses: [], soft_errors: [{ scope: 'summary', message: e.message }] });
  }
});

router.get('/admin/accounting/revenue', requireAccountingPermission('accounting.read.revenue'), async (req, res) => {
  const soft_errors = [];
  try {
    const q = await _accountingSafeQuery(soft_errors, 'revenue',
      `WITH gross AS (
         SELECT j.job_id, COALESCE(NULLIF(SUM(COALESCE(ji.line_total,0)),0), COALESCE(j.job_price,0), 0)::numeric AS gross_sales_amount
           FROM public.jobs j
           LEFT JOIN public.job_items ji ON CAST(ji.job_id AS TEXT)=CAST(j.job_id AS TEXT)
          WHERE ${_sqlDonePredicate('j')} AND j.finished_at IS NOT NULL
          GROUP BY j.job_id, j.job_price
       ),
       proof AS (
         SELECT DISTINCT ON (job_id) job_id, public_url
           FROM public.job_photos
          WHERE COALESCE(phase,'')='payment_slip' AND COALESCE(public_url,'') <> ''
          ORDER BY job_id, COALESCE(uploaded_at, created_at) DESC
       ),
       doc AS (
         SELECT job_id, jsonb_object_agg(document_type, status ORDER BY created_at DESC) AS document_status
           FROM public.accounting_documents
          WHERE COALESCE(status,'') <> 'voided'
          GROUP BY job_id
       )
       SELECT j.job_id, j.booking_code, j.finished_at,
              COALESCE(j.customer_name,'') AS customer_name,
              COALESCE(j.customer_phone,'') AS customer_phone,
              g.gross_sales_amount,
              COALESCE(j.payment_status,'unpaid') AS raw_payment_status,
              j.paid_at,
              j.paid_by,
              j.payment_method,
              j.payment_reference,
              COALESCE(doc.document_status, '{}'::jsonb) AS document_status,
              proof.public_url AS payment_proof_url
         FROM gross g
         JOIN public.jobs j ON j.job_id=g.job_id
         LEFT JOIN proof ON proof.job_id=j.job_id
         LEFT JOIN doc ON doc.job_id=j.job_id
        ORDER BY j.finished_at DESC
        LIMIT 200`);
    const rows = q.rows.map(r => {
      const doc = r.document_status || {};
      return {
        job_id: r.job_id,
        booking_code: r.booking_code,
        finished_at: r.finished_at,
        customer_name: r.customer_name,
        masked_customer_phone: _maskPhone(r.customer_phone),
        gross_sales_amount: r.gross_sales_amount,
        payment_status: _accountingRevenueStatus(r),
        raw_payment_status: r.raw_payment_status,
        paid_at: r.paid_at,
        paid_by: r.paid_by,
        payment_method: r.payment_method,
        payment_reference: r.payment_reference,
        document_status: doc,
        payment_proof_url: r.payment_proof_url,
        action_label: Object.keys(doc).length ? 'ดูรายละเอียด' : 'ออกเอกสาร',
      };
    });
    return res.json({ ok: true, rows, soft_errors });
  } catch (e) {
    console.error('GET /admin/accounting/revenue', e);
    return res.status(500).json({ ok: false, rows: [], soft_errors: [{ scope: 'revenue', message: e.message }] });
  }
});

router.get('/admin/accounting/reports/summary', requireAccountingPermission('accounting.read.reports'), async (req, res) => {
  const soft_errors = [];
  try {
    const revenue = await _accountingSafeQuery(soft_errors, 'report_revenue',
      `SELECT COUNT(DISTINCT j.job_id)::int AS count, COALESCE(SUM(x.total_amount),0)::numeric AS total_amount
         FROM public.jobs j
         JOIN (
           SELECT j2.job_id, COALESCE(NULLIF(SUM(COALESCE(ji.line_total,0)),0), COALESCE(j2.job_price,0), 0)::numeric AS total_amount
             FROM public.jobs j2 LEFT JOIN public.job_items ji ON CAST(ji.job_id AS TEXT)=CAST(j2.job_id AS TEXT)
            WHERE ${_sqlDonePredicate('j2')} AND j2.finished_at IS NOT NULL
            GROUP BY j2.job_id, j2.job_price
         ) x ON x.job_id=j.job_id`);
    const expenses = await _accountingSafeQuery(soft_errors, 'report_expenses',
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount),0)::numeric AS total_amount, COALESCE(SUM(vat_amount),0)::numeric AS vat_amount, COALESCE(SUM(withholding_amount),0)::numeric AS withholding_amount FROM public.accounting_expenses WHERE COALESCE(status,'') <> 'voided'`);
    const payouts = { rows: [technicianPayoutLedger ? await technicianPayoutLedger.reportSummary() : { count: 0, net_payable: 0, paid_amount: 0 }] };
    const docs = await _accountingSafeQuery(soft_errors, 'report_documents',
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(total_amount),0)::numeric AS total_amount FROM public.accounting_documents WHERE COALESCE(status,'') <> 'voided'`);
    const r = revenue.rows[0] || {}, e = expenses.rows[0] || {}, py = payouts.rows[0] || {}, d = docs.rows[0] || {};
    return res.json({ ok: true, revenue: r, expenses: e, payouts: py, documents: d, estimated_gross_profit: _money(Number(r.total_amount||0) - Number(e.total_amount||0) - Number(py.net_payable||0)), soft_errors });
  } catch (e) {
    console.error('GET /admin/accounting/reports/summary', e);
    return res.status(500).json({ ok: false, error: 'REPORT_SUMMARY_FAILED', soft_errors: [{ scope:'report_summary', message:e.message }] });
  }
});

router.get('/admin/accounting/payouts', requireAccountingPermission('accounting.read.payouts'), async (req, res) => {
  const soft_errors = [];
  try {
    const rows = technicianPayoutLedger ? await technicianPayoutLedger.listPeriods(80) : [];
    return res.json({
      ok: true,
      rows: rows.map(r => ({
        ...r,
        payment_rule_note: String(r.period_type) === '10'
          ? 'งวดวันที่ 10: รวมงานที่เสร็จตั้งแต่วันที่ 16 เดือนก่อน ถึงวันที่ 1 เดือนนี้'
          : 'งวดวันที่ 25: รวมงานที่เสร็จตั้งแต่วันที่ 1 ถึงวันที่ 16 เดือนนี้',
      })),
      note: 'ยอดจ่ายช่างมาจาก technician payout ledger กลาง',
      soft_errors,
    });
  } catch (e) {
    console.error('GET /admin/accounting/payouts', e);
    return res.status(500).json({ ok: false, rows: [], note: '', soft_errors: [{ scope: 'payouts', message: e.message }] });
  }
});

router.get('/admin/accounting/payouts/:payout_id/techs', requireAccountingPermission('accounting.read.payouts'), async (req, res) => {
  const soft_errors = [];
  try {
    const payout_id = String(req.params.payout_id || '').trim();
    if (!payout_id) return res.status(400).json({ ok: false, error: 'MISSING_PAYOUT_ID', rows: [] });
    let payload = null;
    try {
      payload = technicianPayoutLedger ? await technicianPayoutLedger.buildTechnicianRows(payout_id) : await _buildPayoutTechSummaryRows(payout_id);
    } catch (e) {
      soft_errors.push({ scope: 'payout_ledger', message: e.message });
    }
    const period = payload?.period || await _getPayoutPeriod(payout_id);
    if (!period) return res.status(404).json({ ok: false, error: 'PAYOUT_NOT_FOUND', rows: [], soft_errors });
    let rows = [];
    if (payload?.rows?.length) {
      rows = payload.rows;
    } else if (payload?.techs?.length) {
      const pays = await pool.query(
        `SELECT technician_username, paid_amount, paid_status, paid_at, paid_by, slip_url, note,
                payment_method, payment_reference
           FROM public.technician_payout_payments
          WHERE payout_id=$1`,
        [payout_id]
      );
      const payMap = new Map((pays.rows || []).map(r => [String(r.technician_username || ''), r]));
      rows = (payload.techs || []).map(t => {
        const p = payMap.get(String(t.technician_username || '')) || {};
        const paid_amount = _money(p.paid_amount == null ? t.paid_amount : p.paid_amount);
        const net_amount = _money(t.net_amount);
        return {
          technician_username: t.technician_username,
          job_count: Number(t.jobs_count || t.job_count || 0),
          gross_amount: _money(t.gross_amount),
          deposit_deduction_amount: _money(t.deposit_deduction_amount),
          adj_total: _money(t.adj_total),
          net_amount,
          paid_amount,
          remaining_amount: _money(Math.max(0, Number(net_amount || 0) - Number(paid_amount || 0))),
          paid_status: _paidStatus(net_amount, paid_amount),
          paid_at: p.paid_at || null,
          paid_by: p.paid_by || null,
          slip_url: p.slip_url || null,
          note: p.note || null,
          payment_method: p.payment_method || null,
          payment_reference: p.payment_reference || null,
        };
      });
    } else {
      rows = await _accountingStoredPayoutTechRows(payout_id);
      if (!rows.length) soft_errors.push({ scope: 'payout_techs_empty', message: 'ยังไม่มีรายช่างในงวดนี้ อาจยังไม่มีงานเสร็จในช่วงตัดยอดนี้' });
    }
    rows = await _accountingEnrichPayoutTechRows(payout_id, period, rows);
    const due = _accountingPayoutDueDate(period);
    return res.json({
      ok: true,
      payout_id,
      period: {
        ...period,
        due_date: due ? due.toISOString() : null,
        due_label: _accountingThaiDate(due ? due.toISOString() : null),
        cutoff_label: _accountingPayoutCutoffLabel(period),
        payment_rule_note: String(period.period_type) === '10'
          ? 'งวดวันที่ 10: รวมงานที่เสร็จตั้งแต่วันที่ 26 เดือนก่อน ถึงวันที่ 1 เดือนนี้'
          : 'งวดวันที่ 25: รวมงานที่เสร็จตั้งแต่วันที่ 11 ถึงวันที่ 16 เดือนนี้',
        wht_month: _accountingWhtMonthKeyFromPeriod(period),
        wht_month_label: _accountingWhtMonthLabel(_accountingWhtMonthKeyFromPeriod(period)),
      },
      source: payload?.source || 'stored_fallback',
      rows,
      soft_errors,
    });
  } catch (e) {
    console.error('GET /admin/accounting/payouts/:payout_id/techs', e);
    return res.status(500).json({ ok: false, rows: [], soft_errors: [{ scope: 'payout_techs', message: e.message }] });
  }
});

router.get('/admin/accounting/deposits', requireAccountingPermission('accounting.read.deposits'), async (req, res) => {
  const soft_errors = [];
  try {
    const q = await _accountingSafeQuery(soft_errors, 'deposits',
      `WITH ledger AS (
         SELECT technician_username,
                COALESCE(SUM(CASE
                  WHEN transaction_type='collect' THEN amount
                  WHEN transaction_type='manual_adjust' THEN amount
                  WHEN transaction_type IN ('refund','claim_deduct') THEN -amount
                  ELSE 0 END),0)::numeric AS collected_total,
                MAX(created_at) AS latest_at
           FROM public.technician_deposit_ledger
          GROUP BY technician_username
       )
       SELECT COALESCE(a.technician_username, ledger.technician_username) AS technician_username,
              COALESCE(a.target_amount,5000)::numeric AS target_amount,
              COALESCE(ledger.collected_total,0)::numeric AS collected_total,
              GREATEST(0, COALESCE(a.target_amount,5000) - COALESCE(ledger.collected_total,0))::numeric AS remaining_amount,
              ledger.latest_at
         FROM public.technician_deposit_accounts a
         FULL OUTER JOIN ledger ON ledger.technician_username=a.technician_username
        ORDER BY collected_total DESC, technician_username ASC`);
    const ledger = await _accountingSafeQuery(soft_errors, 'deposit_ledger',
      `SELECT ledger_id, technician_username, payout_id, transaction_type, amount, note, created_at, created_by
         FROM public.technician_deposit_ledger
        ORDER BY created_at DESC
        LIMIT 80`);
    const totalHeld = q.rows.reduce((sum, r) => sum + Number(r.collected_total || 0), 0);
    return res.json({ ok: true, total_deposit_held: _money(totalHeld), rows: q.rows, ledger: ledger.rows, note: 'เงินประกันไม่ใช่กำไรบริษัท', soft_errors });
  } catch (e) {
    console.error('GET /admin/accounting/deposits', e);
    return res.status(500).json({ ok: false, total_deposit_held: 0, rows: [], ledger: [], note: 'เงินประกันไม่ใช่กำไรบริษัท', soft_errors: [{ scope: 'deposits', message: e.message }] });
  }
});

router.get('/admin/accounting/audit', requireAccountingPermission('accounting.read.audit'), async (req, res) => {
  const soft_errors = [];
  try {
    const action = String(req.query.action || '').trim();
    const entity = String(req.query.entity_type || '').trim();
    const params = [];
    const where = [];
    if (action) { params.push(action); where.push(`action=$${params.length}`); }
    if (entity) { params.push(entity); where.push(`entity_type=$${params.length}`); }
    const q = await _accountingSafeQuery(soft_errors, 'audit',
      `SELECT id, actor_username, actor_role, action, entity_type, entity_id, created_at, note
         FROM public.accounting_audit_log
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY created_at DESC
        LIMIT 120`,
      params);
    return res.json({ ok: true, rows: q.rows, soft_errors });
  } catch (e) {
    console.error('GET /admin/accounting/audit', e);
    return res.status(500).json({ ok: false, rows: [], soft_errors: [{ scope: 'audit', message: e.message }] });
  }
});

  return router;
};
