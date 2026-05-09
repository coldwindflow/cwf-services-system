'use strict';

/**
 * Technician job money summary helpers.
 *
 * Keep card/history money-display orchestration out of index.js.
 * This module intentionally accepts DB + legacy helper dependencies from index.js so the
 * first extraction stays low-risk and does not change route behavior.
 */
function createTechnicianJobMoneyHelpers(deps = {}) {
  const {
    pool,
    money,
    technicianJobIncomeDisplayHelpers,
    technicianReworkHelpers,
    getCustomerCollectAmountForTechJob,
    loadTechnicianIncomePreview,
    loadFinalizedTechPayoutLineForJob,
    getTechnicianVisibilityAliases,
  } = deps;

  if (!pool) throw new Error('pool_required');
  if (!technicianJobIncomeDisplayHelpers) throw new Error('technician_job_income_display_helpers_required');
  if (!technicianReworkHelpers) throw new Error('technician_rework_helpers_required');

  const toMoney = typeof money === 'function'
    ? money
    : (n) => {
        const x = Number(n || 0);
        return Number.isFinite(x) ? Number(x.toFixed(2)) : 0;
      };

  function _techIncomeBreakdownFromLine(line, source) {
    const detail = (line && typeof line.detail_json === 'object' && line.detail_json) ? line.detail_json : {};
    const rows = Array.isArray(detail.contract_rate_rows) ? detail.contract_rate_rows : [];
    const items = Array.isArray(detail.related_items) ? detail.related_items : (Array.isArray(detail.items) ? detail.items : []);
    return {
      source,
      mode: detail.mode || detail.split_mode || null,
      rate_source: detail.rate_source || null,
      rate_set_id: detail.rate_set_id || null,
      rate_set_version: detail.rate_set_version || null,
      rows: rows.slice(0, 80).map((r) => {
        const qty = Number(r.qty == null ? 1 : r.qty);
        const paidRate = Number(r.paid_rate ?? r.rate_per_unit ?? r.rate ?? 0);
        const share = Number(r.share == null ? 1 : r.share);
        const total = Number(r.total ?? r.base_amount ?? (paidRate * (Number.isFinite(qty) ? qty : 1)));
        return {
          item_name: String(r.item_name || 'รายการบริการ').trim(),
          ac_type_key: r.ac_type_key || null,
          wash_type_key: r.wash_key || r.wash_type_key || null,
          btu_tier: r.btu_tier || null,
          machine_index: r.machine_index == null ? null : Number(r.machine_index),
          group_qty: r.group_qty == null ? null : Number(r.group_qty),
          qty: Number.isFinite(qty) ? qty : 1,
          share: Number.isFinite(share) ? share : 1,
          rate: toMoney(r.rate_per_unit ?? r.rate ?? 0),
          paid_rate: toMoney(paidRate),
          total: toMoney(total),
          reason: r.reason || null,
          single_rate_contract: Boolean(r.single_rate_contract),
        };
      }),
      related_items: items.slice(0, 30).map((it) => ({
        item_name: it.item_name || '',
        qty: Number(it.qty || 0),
        assigned_technician_username: it.assigned_technician_username || null,
        contract_reason: it.contract_reason || null,
      })),
    };
  }

  function _mapTechIncomeSourceFromLine(line, fallbackSource) {
    const detail = (line && typeof line.detail_json === 'object' && line.detail_json) ? line.detail_json : {};
    const raw = String(detail.rate_source || '').trim().toLowerCase();
    if (raw === 'fallback') return 'fallback_v4';
    if (raw === 'database') return fallbackSource || 'calculated_active_rate';
    if (raw === 'contract') return fallbackSource || 'calculated_contract';
    return fallbackSource || 'calculated_active_rate';
  }

  function _techIncomeDisplayContextFromSource(source, fallbackContext = 'current') {
    const src = String(source || '').trim();
    if (src === 'offer_preview') return 'offered';
    if (src === 'job_closed_preview' || src === 'finalized_payout') return 'history';
    return String(fallbackContext || 'current').trim() || 'current';
  }

  function _moneySummaryFromDisplayRow(row, context) {
    const fields = technicianJobIncomeDisplayHelpers.toTechnicianIncomeFields(row, context);
    if (!fields) return null;
    return {
      ...fields,
      technician_income_breakdown: {
        source: fields.technician_income_source || 'technician_job_income_display',
        rows: [],
        related_items: [],
        display_state: fields.technician_income_display_state || null,
        display_note: fields.technician_income_display_note || null,
      },
    };
  }

  function _moneySummaryFromPreview(row, context) {
    if (!row) return null;
    const detail = (row.breakdown_json && typeof row.breakdown_json === 'object') ? row.breakdown_json : {};
    return {
      technician_income_amount: toMoney(row.income_amount || 0),
      technician_income_source: row.income_source || 'preview',
      technician_income_rate_set_id: row.rate_set_id || detail.rate_set_id || null,
      technician_income_rate_set_version: row.rate_set_version || detail.rate_set_version || null,
      technician_income_breakdown: detail.technician_income_breakdown || detail.breakdown || detail || { source: row.income_source || 'preview', rows: [], related_items: [] },
      technician_income_label: context === 'offered' ? 'ที่ช่างจะได้รับ' : (context === 'history' ? 'ได้รับ' : 'ที่ช่างจะได้รับ'),
    };
  }

  async function _upsertDisplayRowForPreview(job_id, username, preview, source = 'preview', opts = {}) {
    const tech = String(username || '').trim();
    const jid = Number(job_id);
    if (!Number.isInteger(jid) || jid <= 0 || !tech || !preview) return null;
    const context = opts.context || _techIncomeDisplayContextFromSource(source, 'current');
    const row = technicianJobIncomeDisplayHelpers.buildDisplayFromPreview({
      job_id: jid,
      technician_username: tech,
      income_amount: preview.income_amount ?? preview.technician_income_amount,
      income_source: preview.income_source || preview.technician_income_source || source,
      rate_set_id: preview.rate_set_id || null,
      rate_set_version: preview.rate_set_version || null,
      id: preview.id || null,
    }, {
      context,
      cardType: context === 'offered' ? 'urgent_offer' : (context === 'history' ? 'history' : 'assigned'),
      isFinal: context === 'history',
    });
    return await technicianJobIncomeDisplayHelpers.upsertTechnicianJobIncomeDisplay(pool, row);
  }

  async function _syncDisplayForJobState(job, usernames, opts = {}) {
    const list = [...new Set((Array.isArray(usernames) ? usernames : [usernames]).map(x => String(x || '').trim()).filter(Boolean))].slice(0, 60);
    const jid = Number(job?.job_id);
    if (!Number.isInteger(jid) || jid <= 0 || !list.length) return;
    const context = String(opts.context || (typeof deps.techJobContextFromRow === 'function' ? deps.techJobContextFromRow(job, 'current') : 'current') || 'current');
    const cases = await technicianReworkHelpers.getLatestReworkCasesForJobs(pool, [jid]);
    const reworkCase = cases.get(jid) || null;

    for (const tech of list) {
      try {
        if (technicianReworkHelpers.isCancelledJob(job)) {
          await technicianJobIncomeDisplayHelpers.upsertTechnicianJobIncomeDisplay(
            pool,
            technicianJobIncomeDisplayHelpers.buildCancelledDisplay(job, tech, context === 'history' ? 'history' : context)
          );
          if (context !== 'history') {
            await technicianJobIncomeDisplayHelpers.upsertTechnicianJobIncomeDisplay(
              pool,
              technicianJobIncomeDisplayHelpers.buildCancelledDisplay(job, tech, 'history')
            );
          }
          continue;
        }

        if (technicianReworkHelpers.detectReworkJob(job, reworkCase)) {
          let heldAmount = 0;
          const existing = await technicianJobIncomeDisplayHelpers.getTechnicianJobIncomeDisplay(pool, jid, tech, 'history')
            .catch(() => null);
          if (existing && existing.display_state && !String(existing.display_state).startsWith('rework_')) {
            heldAmount = Number(existing.display_amount || 0);
          } else if (typeof loadTechnicianIncomePreview === 'function') {
            const preview = await loadTechnicianIncomePreview(jid, tech);
            if (preview) heldAmount = Number(preview.income_amount || 0);
          }
          const reworkDisplay = technicianReworkHelpers.buildReworkDisplay(job, reworkCase, heldAmount);
          await technicianJobIncomeDisplayHelpers.upsertTechnicianJobIncomeDisplay(
            pool,
            technicianJobIncomeDisplayHelpers.buildReworkDisplay(job, tech, reworkDisplay, context)
          );
          if (context !== 'history') {
            await technicianJobIncomeDisplayHelpers.upsertTechnicianJobIncomeDisplay(
              pool,
              technicianJobIncomeDisplayHelpers.buildReworkDisplay(job, tech, reworkDisplay, 'history')
            );
          }
        }
      } catch (e) {
        try { console.warn('[tech_income_display] state sync failed', { job_id: jid, username: tech, error: e.message }); } catch (_) {}
      }
    }
  }

  async function _buildTechnicianJobMoneySummary(job, username, opts = {}) {
    const job_id = job?.job_id;
    const tech = String(username || '').trim();
    const context = String(opts?.context || '').trim();
    let customerCollectAmount = null;
    try {
      customerCollectAmount = typeof getCustomerCollectAmountForTechJob === 'function'
        ? await getCustomerCollectAmountForTechJob(job_id, Number(job?.job_price || 0))
        : (Number(job?.job_price || 0) || null);
    } catch (e) {
      // Regression guard: money display must never control job visibility.
      try { console.warn('[tech_money] customer collect unavailable', { job_id, username: tech, error: e.message }); } catch (_) {}
      customerCollectAmount = Number(job?.job_price || 0) || null;
    }
    const summary = {
      customer_collect_amount: customerCollectAmount,
      customer_collect_label: context === 'history' ? 'ยอดที่ลูกค้าจ่าย' : 'ยอดเก็บลูกค้า',
      technician_income_amount: null,
      technician_income_label: context === 'offered' ? 'ที่ช่างจะได้รับ' : (context === 'history' ? 'ได้รับ' : 'ที่ช่างจะได้รับ'),
      technician_income_source: 'unavailable',
      technician_income_breakdown: { source: 'unavailable', rows: [], related_items: [] },
      technician_income_rate_set_id: null,
      technician_income_rate_set_version: null,
      technician_income_display_state: null,
      technician_income_display_note: null,
      technician_income_is_final: false,
      technician_income_is_stale: false,
    };
    if (!job_id || !tech) return summary;
    try {
      if (technicianReworkHelpers.isCancelledJob(job)) {
        const row = technicianJobIncomeDisplayHelpers.buildCancelledDisplay(job, tech, context || 'history');
        try { await technicianJobIncomeDisplayHelpers.upsertTechnicianJobIncomeDisplay(pool, row); } catch (_) {}
        Object.assign(summary, _moneySummaryFromDisplayRow(row, context) || {});
        return summary;
      }

      const cases = await technicianReworkHelpers.getLatestReworkCasesForJobs(pool, [job_id]);
      const reworkCase = cases.get(Number(job_id)) || null;
      if (technicianReworkHelpers.detectReworkJob(job, reworkCase)) {
        let heldAmount = 0;
        const existing = await technicianJobIncomeDisplayHelpers.getTechnicianJobIncomeDisplay(pool, job_id, tech, context || 'history').catch(() => null);
        if (existing && existing.display_state && !String(existing.display_state).startsWith('rework_')) {
          heldAmount = Number(existing.display_amount || 0);
        } else if (typeof loadTechnicianIncomePreview === 'function') {
          const preview = await loadTechnicianIncomePreview(job_id, tech);
          if (preview) heldAmount = Number(preview.income_amount || 0);
        }
        const reworkDisplay = technicianReworkHelpers.buildReworkDisplay(job, reworkCase, heldAmount);
        const row = technicianJobIncomeDisplayHelpers.buildReworkDisplay(job, tech, reworkDisplay, context || 'history');
        try { await technicianJobIncomeDisplayHelpers.upsertTechnicianJobIncomeDisplay(pool, row); } catch (_) {}
        Object.assign(summary, _moneySummaryFromDisplayRow(row, context) || {});
        return summary;
      }

      const display = await technicianJobIncomeDisplayHelpers.getTechnicianJobIncomeDisplay(pool, job_id, tech, context || 'current').catch(() => null);
      if (display) {
        Object.assign(summary, _moneySummaryFromDisplayRow(display, context) || {});
        return summary;
      }

      if (context === 'history' && typeof loadFinalizedTechPayoutLineForJob === 'function') {
        const stored = await loadFinalizedTechPayoutLineForJob(job_id, tech);
        if (stored) {
          summary.technician_income_amount = toMoney(stored.earn_amount || 0);
          summary.technician_income_source = 'finalized_payout';
          summary.technician_income_breakdown = _techIncomeBreakdownFromLine(stored, 'finalized_payout');
          summary.technician_income_rate_set_id = summary.technician_income_breakdown.rate_set_id || null;
          summary.technician_income_rate_set_version = summary.technician_income_breakdown.rate_set_version || null;
          summary.technician_income_label = 'ได้รับ';
          summary.technician_income_display_state = 'finalized';
          summary.technician_income_is_final = true;
          try {
            await technicianJobIncomeDisplayHelpers.upsertTechnicianJobIncomeDisplay(pool, {
              job_id,
              technician_username: tech,
              context: 'history',
              card_type: 'history',
              display_state: 'finalized',
              display_label: 'ได้รับ',
              display_amount: summary.technician_income_amount,
              income_source: 'finalized_payout',
              rate_set_id: summary.technician_income_rate_set_id,
              rate_set_version: summary.technician_income_rate_set_version,
              source_table: 'technician_payout_lines',
              source_id: stored.payout_id,
              is_final: true,
            });
          } catch (_) {}
          return summary;
        }
      }

      // Card/history rendering must stay cheap: read preview rows only.
      // Missing legacy rows show pending review instead of invoking the payout engine live.
      const preview = typeof loadTechnicianIncomePreview === 'function'
        ? await loadTechnicianIncomePreview(job_id, tech)
        : null;
      if (preview && preview.income_amount != null) {
        const fromPreview = _moneySummaryFromPreview(preview, context || 'current');
        Object.assign(summary, fromPreview);
        summary.technician_income_display_state = context === 'history' ? 'finalized' : 'estimated';
        summary.technician_income_is_final = context === 'history';
        try {
          const displayRow = await _upsertDisplayRowForPreview(job_id, tech, preview, preview.income_source || 'preview', {
            context: context || 'current',
          });
          const displaySummary = _moneySummaryFromDisplayRow(displayRow, context);
          if (displaySummary) Object.assign(summary, displaySummary);
        } catch (_) {}
        return summary;
      }

      summary.technician_income_source = 'pending_review';
      summary.technician_income_display_state = 'pending_review';
      summary.technician_income_display_note = 'รอตรวจสอบรายได้';
      summary.technician_income_label = context === 'history' ? 'ได้รับ' : 'ที่ช่างจะได้รับ';
      return summary;
    } catch (e) {
      try { console.warn('[tech_money] income unavailable', { job_id, username: tech, context, error: e.message, code: e.code }); } catch (_) {}
      return summary;
    }
  }


  function _pickDisplayRowForContext(displayMap, jobId, context) {
    if (!displayMap || !jobId) return null;
    const jid = String(jobId);
    const ctx = String(context || 'current').trim() || 'current';
    return displayMap.get(`${jid}:${ctx}`)
      || (ctx === 'history' ? displayMap.get(`${jid}:current`) : null)
      || (ctx !== 'offered' ? displayMap.get(`${jid}:offered`) : null)
      || displayMap.get(jid)
      || null;
  }

  async function _loadIncomePreviewBatch(jobIds, username) {
    const ids = [...new Set((Array.isArray(jobIds) ? jobIds : [jobIds]).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    const tech = String(username || '').trim();
    const map = new Map();
    if (!ids.length || !tech) return map;
    try {
      const r = await pool.query(
        `SELECT DISTINCT ON (job_id) job_id, technician_username, income_amount, income_source, rate_set_id, rate_set_version,
                breakdown_json, is_stale, calculated_at, updated_at
           FROM public.job_technician_income_preview
          WHERE job_id = ANY($1::bigint[])
            AND technician_username=$2
            AND COALESCE(is_stale,FALSE)=FALSE
          ORDER BY job_id, updated_at DESC`,
        [ids, tech]
      );
      for (const row of r.rows || []) map.set(String(row.job_id), row);
    } catch (e) {
      try { console.warn('[tech_income_preview_batch] load failed', { username: tech, count: ids.length, error: e.message }); } catch (_) {}
    }
    return map;
  }

  async function _loadFinalizedPayoutLinesBatch(jobIds, username) {
    const ids = [...new Set((Array.isArray(jobIds) ? jobIds : [jobIds]).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    const tech = String(username || '').trim();
    const map = new Map();
    if (!ids.length || !tech) return map;
    try {
      const aliases = typeof getTechnicianVisibilityAliases === 'function'
        ? await getTechnicianVisibilityAliases(tech).catch(() => [tech])
        : [tech];
      const r = await pool.query(
        `SELECT DISTINCT ON (l.job_id::text)
                l.payout_id, l.technician_username, l.job_id, l.earn_amount, l.detail_json,
                p.status AS payout_status, p.period_start, p.period_end
           FROM public.technician_payout_lines l
           JOIN public.technician_payout_periods p ON p.payout_id = l.payout_id
          WHERE l.job_id::text = ANY($1::text[])
            AND l.technician_username = ANY($2::text[])
            AND COALESCE(p.status,'draft') IN ('locked','paid')
          ORDER BY l.job_id::text,
                   CASE WHEN l.technician_username=$3 THEN 0 ELSE 1 END,
                   CASE WHEN p.status='paid' THEN 0 ELSE 1 END,
                   p.period_end DESC, l.line_id DESC`,
        [ids.map(String), aliases, tech]
      );
      for (const row of r.rows || []) map.set(String(row.job_id), row);
    } catch (e) {
      try { console.warn('[tech_payout_lines_batch] load failed', { username: tech, count: ids.length, error: e.message }); } catch (_) {}
    }
    return map;
  }

  async function _buildTechnicianJobMoneySummaryBatch(jobs, username, opts = {}) {
    const rows = Array.isArray(jobs) ? jobs : [];
    const tech = String(username || '').trim();
    const out = new Map();
    if (!rows.length || !tech) return out;

    const jobIds = [...new Set(rows.map((job) => Number(job?.job_id)).filter((n) => Number.isInteger(n) && n > 0))];
    const contextForJob = new Map();
    for (const job of rows) {
      const jid = Number(job?.job_id);
      if (!Number.isInteger(jid) || jid <= 0) continue;
      const ctx = typeof opts.contextForJob === 'function'
        ? opts.contextForJob(job)
        : (opts.context || 'current');
      contextForJob.set(String(jid), String(ctx || 'current').trim() || 'current');
    }

    const displayMap = await technicianJobIncomeDisplayHelpers.getTechnicianJobIncomeDisplayBatch(pool, jobIds, tech).catch(() => new Map());
    const reworkCases = await technicianReworkHelpers.getLatestReworkCasesForJobs(pool, jobIds).catch(() => new Map());
    const historyIds = jobIds.filter((jid) => (contextForJob.get(String(jid)) || 'current') === 'history');
    const finalizedMap = historyIds.length ? await _loadFinalizedPayoutLinesBatch(historyIds, tech) : new Map();
    const previewMap = await _loadIncomePreviewBatch(jobIds, tech);

    for (const job of rows) {
      const jid = Number(job?.job_id);
      const key = String(jid);
      const context = contextForJob.get(key) || String(opts.context || 'current').trim() || 'current';
      const summary = {
        customer_collect_amount: Number(job?.job_price || 0) || null,
        customer_collect_label: context === 'history' ? 'ยอดที่ลูกค้าจ่าย' : 'ยอดเก็บลูกค้า',
        technician_income_amount: null,
        technician_income_label: context === 'history' ? 'ได้รับ' : 'ที่ช่างจะได้รับ',
        technician_income_source: 'pending_review',
        technician_income_breakdown: { source: 'pending_review', rows: [], related_items: [] },
        technician_income_rate_set_id: null,
        technician_income_rate_set_version: null,
        technician_income_display_state: 'pending_review',
        technician_income_display_note: 'รอตรวจสอบรายได้',
        technician_income_is_final: false,
        technician_income_is_stale: false,
      };
      if (!Number.isInteger(jid) || jid <= 0) {
        out.set(key, summary);
        continue;
      }

      try {
        if (technicianReworkHelpers.isCancelledJob(job)) {
          const row = technicianJobIncomeDisplayHelpers.buildCancelledDisplay(job, tech, context || 'history');
          try { await technicianJobIncomeDisplayHelpers.upsertTechnicianJobIncomeDisplay(pool, row); } catch (_) {}
          Object.assign(summary, _moneySummaryFromDisplayRow(row, context) || {});
          out.set(key, summary);
          continue;
        }

        const reworkCase = reworkCases.get(jid) || null;
        if (technicianReworkHelpers.detectReworkJob(job, reworkCase)) {
          const existing = _pickDisplayRowForContext(displayMap, jid, context || 'history');
          const preview = previewMap.get(key) || null;
          const heldAmount = (existing && existing.display_state && !String(existing.display_state).startsWith('rework_'))
            ? Number(existing.display_amount || 0)
            : Number(preview?.income_amount || 0);
          const reworkDisplay = technicianReworkHelpers.buildReworkDisplay(job, reworkCase, heldAmount);
          const row = technicianJobIncomeDisplayHelpers.buildReworkDisplay(job, tech, reworkDisplay, context || 'history');
          try { await technicianJobIncomeDisplayHelpers.upsertTechnicianJobIncomeDisplay(pool, row); } catch (_) {}
          Object.assign(summary, _moneySummaryFromDisplayRow(row, context) || {});
          out.set(key, summary);
          continue;
        }

        const display = _pickDisplayRowForContext(displayMap, jid, context || 'current');
        if (display) {
          Object.assign(summary, _moneySummaryFromDisplayRow(display, context) || {});
          out.set(key, summary);
          continue;
        }

        if (context === 'history') {
          const stored = finalizedMap.get(key) || null;
          if (stored) {
            summary.technician_income_amount = toMoney(stored.earn_amount || 0);
            summary.technician_income_source = 'finalized_payout';
            summary.technician_income_breakdown = _techIncomeBreakdownFromLine(stored, 'finalized_payout');
            summary.technician_income_rate_set_id = summary.technician_income_breakdown.rate_set_id || null;
            summary.technician_income_rate_set_version = summary.technician_income_breakdown.rate_set_version || null;
            summary.technician_income_label = 'ได้รับ';
            summary.technician_income_display_state = 'finalized';
            summary.technician_income_display_note = null;
            summary.technician_income_is_final = true;
            try {
              await technicianJobIncomeDisplayHelpers.upsertTechnicianJobIncomeDisplay(pool, {
                job_id: jid,
                technician_username: tech,
                context: 'history',
                card_type: 'history',
                display_state: 'finalized',
                display_label: 'ได้รับ',
                display_amount: summary.technician_income_amount,
                income_source: 'finalized_payout',
                rate_set_id: summary.technician_income_rate_set_id,
                rate_set_version: summary.technician_income_rate_set_version,
                source_table: 'technician_payout_lines',
                source_id: stored.payout_id,
                is_final: true,
              });
            } catch (_) {}
            out.set(key, summary);
            continue;
          }
        }

        const preview = previewMap.get(key) || null;
        if (preview && preview.income_amount != null) {
          Object.assign(summary, _moneySummaryFromPreview(preview, context || 'current'));
          summary.technician_income_display_state = context === 'history' ? 'finalized' : 'estimated';
          summary.technician_income_is_final = context === 'history';
          try {
            const displayRow = await _upsertDisplayRowForPreview(jid, tech, preview, preview.income_source || 'preview', { context: context || 'current' });
            const displaySummary = _moneySummaryFromDisplayRow(displayRow, context);
            if (displaySummary) Object.assign(summary, displaySummary);
          } catch (_) {}
          out.set(key, summary);
          continue;
        }
      } catch (e) {
        try { console.warn('[tech_money_batch] item failed', { job_id: jid, username: tech, context, error: e.message }); } catch (_) {}
      }
      out.set(key, summary);
    }

    return out;
  }

  return {
    _techIncomeBreakdownFromLine,
    _mapTechIncomeSourceFromLine,
    _techIncomeDisplayContextFromSource,
    _moneySummaryFromDisplayRow,
    _moneySummaryFromPreview,
    _upsertDisplayRowForPreview,
    _syncDisplayForJobState,
    _buildTechnicianJobMoneySummary,
    _buildTechnicianJobMoneySummaryBatch,
  };
}

module.exports = {
  createTechnicianJobMoneyHelpers,
};
