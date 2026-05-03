(() => {
  'use strict';

  const TAB_META = {
    overview: { title: 'ภาพรวม', hint: 'สรุปงานบัญชีที่ต้องจัดการวันนี้', action: 'รีเฟรชข้อมูล' },
    revenue: { title: 'รายรับ', hint: 'บันทึกสถานะรับเงินลูกค้าจากงานที่เสร็จแล้ว', action: 'โหลดรายรับใหม่' },
    documents: { title: 'เอกสารขาย', hint: 'ติดตามใบเสนอราคา ใบแจ้งหนี้ และใบเสร็จรับเงิน', action: 'ดูเอกสาร' },
    expenses: { title: 'รายจ่าย', hint: 'ตรวจรายการรายจ่ายและหลักฐานค่าใช้จ่าย', action: 'ดูรายจ่าย' },
    payouts: { title: 'จ่ายเงินช่าง', hint: 'เลือกงวดจ่าย ดูรายช่าง แล้วบันทึกจ่ายหลังโอนเงินจริงเท่านั้น', action: 'โหลดงวดจ่าย' },
    deposits: { title: 'เงินประกัน', hint: 'ดูยอดเงินประกันที่ถือไว้แยกตามช่าง เงินประกันไม่ใช่กำไรบริษัท', action: 'โหลดเงินประกัน' },
    reports: { title: 'รายงาน', hint: 'รายงานสำหรับเตรียมบัญชี ไม่ใช่การยื่นภาษีอัตโนมัติ', action: 'ดูรายงาน' },
    settings: { title: 'ตั้งค่าเอกสาร', hint: 'ตั้งค่าข้อมูลบริษัท โลโก้ ลายเซ็น และตราประทับสำหรับออกเอกสาร', action: 'แก้ไขข้อมูลบริษัท' },
    audit: { title: 'ประวัติการทำรายการ', hint: 'ตรวจย้อนหลังว่าใครทำอะไร เมื่อไหร่', action: 'โหลดประวัติ' },
  };
  const VALID_TABS = new Set(Object.keys(TAB_META));

  const state = {
    tab: 'overview',
    summary: null,
    revenue: [],
    payouts: [],
    payoutPeriods: {},
    deposits: null,
    audit: [],
    reportSummary: null,
    payoutTechs: {},
    selectedPayoutId: null,
    payoutTechError: null,
    taxRequests: [],
    settings: null,
    loading: new Set(),
  };

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  const money = (v) => Number(v || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
  const dateTH = (v) => v ? new Date(v).toLocaleString('th-TH', { dateStyle:'medium', timeStyle:'short' }) : '-';

  function empty(text) { return `<div class="acctEmpty">${esc(text)}</div>`; }
  function badge(text, tone = 'gray') { return `<span class="acctBadge ${esc(tone)}">${esc(text)}</span>`; }
  function statusBadge(status) {
    const s = String(status || '').toLowerCase();
    const label = ({ draft:'ร่าง', issued:'ออกเอกสารแล้ว', voided:'ยกเลิก', paid:'ชำระแล้ว', submitted:'รอตรวจ', approved:'อนุมัติแล้ว' })[s] || status || '-';
    const tone = s === 'paid' || s === 'approved' || s === 'issued' ? 'ok' : (s === 'voided' ? 'bad' : 'warn');
    return badge(label, tone);
  }
  function revenueStatusLabel(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'paid') return 'รับเงินแล้ว';
    if (s === 'partial') return 'รับบางส่วน';
    return 'ยังไม่รับเงิน';
  }
  function payoutStatusLabel(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'paid') return 'จ่ายช่างแล้ว';
    if (s === 'partial') return 'จ่ายช่างบางส่วน';
    return 'ยังไม่จ่ายช่าง';
  }
  function revenueStatusBadge(status) {
    const s = String(status || '').toLowerCase();
    return badge(revenueStatusLabel(s), s === 'paid' ? 'ok' : (s === 'partial' ? 'warn' : 'bad'));
  }
  function payoutStatusBadge(status) {
    const s = String(status || '').toLowerCase();
    return badge(payoutStatusLabel(s), s === 'paid' ? 'ok' : (s === 'partial' ? 'warn' : 'bad'));
  }
  function missingProfileText(profile) {
    const xs = profile?.missing_fields || [];
    return xs.length ? `ยังขาด: ${xs.join(', ')}` : 'ข้อมูลพร้อมออกทวิ50';
  }
  function auditActionLabel(action) {
    const v = String(action || '');
    if (v === 'MARK_REVENUE_PAID') return 'บันทึกรับเงินลูกค้า';
    if (v === 'MARK_PAYOUT_PAID') return 'บันทึกจ่ายเงินช่าง';
    if (v === 'REPORT_EXPORT') return 'Export รายงาน';
    return v || '-';
  }

  async function getJson(url) {
    const res = await fetch(url, { credentials: 'include' });
    let payload = null;
    try { payload = await res.json(); } catch (_) { payload = null; }
    if (!res.ok || (payload && payload.ok === false)) {
      const err = new Error(payload?.error || `HTTP_${res.status}`);
      err.payload = payload;
      throw err;
    }
    return payload || { ok: true };
  }
  async function postJson(url, body) {
    const res = await fetch(url, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    let payload = null;
    try { payload = await res.json(); } catch (_) { payload = null; }
    if (!res.ok || (payload && payload.ok === false)) {
      const err = new Error(payload?.error || `HTTP_${res.status}`);
      err.payload = payload;
      throw err;
    }
    return payload || { ok: true };
  }
  async function postForm(url, formData) {
    const res = await fetch(url, { method: 'POST', credentials: 'include', body: formData });
    let payload = null;
    try { payload = await res.json(); } catch (_) { payload = null; }
    if (!res.ok || (payload && payload.ok === false)) {
      const err = new Error(payload?.message || payload?.error || `HTTP_${res.status}`);
      err.payload = payload;
      throw err;
    }
    return payload || { ok: true };
  }
  function simpleDateTH(v) {
    if (!v) return '-';
    try { return new Date(v).toLocaleDateString('th-TH', { dateStyle:'medium' }); } catch (_) { return String(v || '-'); }
  }

  function cleanError(e) {
    const msg = String(e?.payload?.error || e?.message || e || '');
    if (msg.includes('CONFIRM_RECEIVED_REQUIRED')) return 'กรุณาติ๊กยืนยันว่าได้รับเงินจริงแล้ว';
    if (msg.includes('CONFIRM_PAID_REQUIRED')) return 'กรุณาติ๊กยืนยันว่าได้โอน/จ่ายเงินจริงแล้ว';
    if (msg.includes('PAID_AMOUNT_EXCEEDS_REMAINING')) return 'ยอดที่จ่ายมากกว่ายอดคงเหลือ';
    if (msg.includes('PAYOUT_ALREADY_PAID')) return 'รายการนี้จ่ายครบแล้ว';
    if (msg.includes('ACCOUNTING_PERMISSION_REQUIRED')) return 'บัญชีนี้ยังไม่มีสิทธิ์ทำรายการนี้ กรุณาให้ Super Admin เพิ่มสิทธิ์บัญชี';
    if (msg.includes('JOB_NOT_COMPLETED')) return 'งานนี้ยังไม่เสร็จ จึงบันทึกรับเงินจากหน้านี้ไม่ได้';
    if (msg.includes('CANNOT_MARK_CANCELED_JOB_PAID')) return 'งานที่ยกเลิกแล้วไม่สามารถบันทึกรับเงินได้';
    if (msg.includes('EXPENSE_DATE_REQUIRED')) return 'กรุณาระบุวันที่รายจ่าย';
    if (msg.includes('EXPENSE_CATEGORY_REQUIRED')) return 'กรุณาเลือกหมวดรายจ่าย';
    if (msg.includes('INVALID_EXPENSE_AMOUNT')) return 'จำนวนเงินรายจ่ายต้องมากกว่า 0';
    if (msg.includes('DOCUMENT_ALREADY_EXISTS')) return 'งานนี้มีเอกสารประเภทนี้แล้ว';
    if (msg.includes('WITHHOLDING_CERT_ALREADY_EXISTS')) return 'เดือนนี้ออกใบทวิ50ให้ช่างคนนี้แล้ว';
    if (msg.includes('TECH_TAX_PROFILE_INCOMPLETE')) return 'ข้อมูลช่างสำหรับออกทวิ50ยังไม่ครบ กรุณากด “เติมข้อมูลทวิ50”';
    if (msg.includes('PAYOUT_NOT_PAID_FOR_WHT')) return 'ยังไม่มีการบันทึกจ่ายเงินจริงในเดือนนี้ จึงยังออกทวิ50ไม่ได้';
    if (msg.includes('TECH_TAX_ID_REQUIRED')) return 'กรุณากรอกเลขภาษี/เลขบัตรประชาชนผู้รับเงิน';
    if (msg.includes('TECH_TAX_ADDRESS_REQUIRED')) return 'กรุณากรอกที่อยู่ผู้รับเงิน';
    if (msg.includes('TECH_FULL_NAME_REQUIRED')) return 'กรุณากรอกชื่อช่าง/ผู้รับเงิน';
    if (msg.includes('JOB_ID_REQUIRED')) return 'กรุณาใส่เลขงาน';
    return 'บันทึกไม่สำเร็จ กรุณาลองใหม่';
  }
  function setLoading(id, text = 'กำลังโหลดข้อมูล...') { const el = $(id); if (el) el.innerHTML = empty(text); }
  function showErrors(payloads) {
    const all = [];
    for (const p of payloads || []) for (const e of (p && p.soft_errors) || []) all.push(e);
    const el = $('softErrors'); if (!el) return;
    el.innerHTML = all.length ? `<div class="acctSoftErr">ข้อมูลบางส่วนโหลดไม่ครบ: ${all.map(e => esc(e.scope || e.message)).join(', ')}</div>` : '';
  }

  function normalizeTab(tab) {
    const key = String(tab || '').replace(/^#/, '').trim().toLowerCase();
    return VALID_TABS.has(key) ? key : 'overview';
  }
  function initialTabFromUrl() {
    const qs = new URLSearchParams(location.search || '');
    return normalizeTab(qs.get('tab') || (location.hash || '').replace(/^#/, '') || 'overview');
  }
  function updateTabUrl(tab) {
    try {
      const url = new URL(location.href);
      url.searchParams.set('tab', tab);
      url.hash = tab;
      history.replaceState({ accountingTab: tab }, '', url.toString());
    } catch (_) {}
  }
  function scrollActiveChipIntoView(tab) {
    const btn = document.querySelector(`.acctTabBtn[data-tab="${tab}"]`);
    try { btn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); } catch (_) {}
  }
  function scrollWorkspaceIntoView() {
    const target = $('accountingWorkspace'); if (!target) return;
    const topNav = document.getElementById('cwfTopNav');
    const offset = (topNav?.getBoundingClientRect?.().height || 66) + 14;
    const y = target.getBoundingClientRect().top + window.pageYOffset - offset;
    try { window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' }); } catch (_) { window.scrollTo(0, Math.max(0, y)); }
    try { target.focus({ preventScroll: true }); } catch (_) {}
  }
  function updateWorkspaceHeader(tab) {
    const meta = TAB_META[tab] || TAB_META.overview;
    if ($('workspaceKicker')) $('workspaceKicker').textContent = 'พื้นที่ทำงานบัญชี';
    if ($('workspaceTitle')) $('workspaceTitle').textContent = meta.title;
    if ($('workspaceHint')) $('workspaceHint').textContent = meta.hint;
    if ($('workspacePrimaryAction')) $('workspacePrimaryAction').textContent = meta.action;
  }
  function showAccountingTab(tabKey, options = {}) {
    const opts = Object.assign({ scroll: true, updateUrl: true }, options);
    const tab = normalizeTab(tabKey);
    state.tab = tab;
    updateWorkspaceHeader(tab);
    document.querySelectorAll('.acctTabBtn').forEach((b) => {
      const active = b.dataset.tab === tab;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.acctPanel').forEach((p) => {
      const active = p.id === `panel-${tab}`;
      p.classList.toggle('active', active);
      if (active) { p.classList.remove('navFocus'); void p.offsetWidth; p.classList.add('navFocus'); }
    });
    if (tab === 'revenue' && !state.revenue.length) loadRevenue();
    if (tab === 'payouts' && !state.payouts.length) loadPayouts();
    if (tab === 'deposits' && !state.deposits) loadDeposits();
    if (tab === 'reports' && !state.reportSummary) loadReportSummary();
    if (tab === 'audit' && !state.audit.length) loadAudit();
    if (opts.updateUrl) updateTabUrl(tab);
    scrollActiveChipIntoView(tab);
    if (opts.scroll) requestAnimationFrame(scrollWorkspaceIntoView);
  }

  function renderCards() {
    const el = $('accountingCards'); const cards = state.summary?.cards || [];
    if (!el) return;
    el.innerHTML = cards.length ? cards.map((c) => `
      <article class="acctCard">
        <div class="acctCardTop"><b>${esc(c.label)}</b><span class="acctDot tone-${esc(c.status_key || 'blue')}"></span></div>
        <div class="acctCount">${money(c.count)}</div>
        <div class="acctAmount">${c.total_amount == null ? 'ไม่มีมูลค่ารวม' : `${money(c.total_amount)} บาท`}</div>
        <button class="acctGoBtn" type="button" data-target-tab="${esc(c.target_tab || 'overview')}">ไปจัดการ</button>
      </article>`).join('') : empty('ยังไม่มีข้อมูลงานบัญชีวันนี้');
    el.querySelectorAll('[data-target-tab]').forEach((btn) => btn.addEventListener('click', () => showAccountingTab(btn.dataset.targetTab, { scroll: true, updateUrl: true })));
  }
  function renderOverview() {
    const s = $('overviewSummary'); const a = $('overviewAudit'); const ch = $('overviewCharts');
    const cards = state.summary?.cards || [];
    if (s) s.innerHTML = cards.length ? cards.map((c) => `
      <div class="acctRow">
        <div><b>${esc(c.label)}</b><small>${c.total_amount == null ? 'จำนวนรายการ' : `${money(c.total_amount)} บาท`}</small></div>
        <div class="acctActionsCol">${badge(`${money(c.count)} รายการ`, c.status_key === 'red' ? 'bad' : 'gray')}<button class="acctGoBtn" type="button" data-target-tab="${esc(c.target_tab || 'overview')}">ไปจัดการ</button></div>
      </div>`).join('') : empty('ยังไม่มีสรุป');
    s?.querySelectorAll('[data-target-tab]').forEach((btn) => btn.addEventListener('click', () => showAccountingTab(btn.dataset.targetTab, { scroll: true, updateUrl: true })));
    if (ch) {
      const total = cards.reduce((sum, c) => sum + Number(c.count || 0), 0) || 1;
      const unpaid = cards.find(c => c.key === 'unpaid_revenue')?.count || 0;
      const payout = cards.find(c => c.key === 'pending_payout_periods')?.count || 0;
      const expense = cards.find(c => c.key === 'pending_expenses')?.count || 0;
      const p1 = Math.min(100, Math.round((Number(unpaid) / total) * 100));
      const p2 = Math.min(100, p1 + Math.round((Number(payout) / total) * 100));
      const p3 = Math.min(100, p2 + Math.round((Number(expense) / total) * 100));
      ch.innerHTML = `
        <div class="acctChartWrap">
          <div class="acctDonut" style="--p1:${p1}%;--p2:${p2}%;--p3:${p3}%"><b>${money(total)}</b></div>
          <div class="acctLegend">
            <div class="acctLegendRow"><span><i style="background:#0b4bb3"></i>ค้างรับเงิน</span><b>${money(unpaid)}</b></div>
            <div class="acctLegendRow"><span><i style="background:#38bdf8"></i>งวดจ่ายช่าง</span><b>${money(payout)}</b></div>
            <div class="acctLegendRow"><span><i style="background:#ffcc00"></i>รายจ่ายรอตรวจ</span><b>${money(expense)}</b></div>
            <div class="acctMuted">โดนัทนี้ช่วยให้บัญชีเห็นงานเร่งด่วนทันที กดการ์ดด้านซ้ายเพื่อทำรายการต่อ</div>
          </div>
        </div>`;
    }
    if (a) renderAuditInto(a, state.summary?.recent_audit || []);
  }
  function renderRevenue() {
    const el = $('revenueList'); if (!el) return;
    const q = String($('revenueSearch')?.value || '').trim().toLowerCase();
    const status = String($('revenueStatusFilter')?.value || 'all');
    const rows = (state.revenue || []).filter((r) => {
      const hay = String(`${r.booking_code || ''} ${r.customer_name || ''} ${r.job_id || ''}`).toLowerCase();
      const okText = !q || hay.includes(q);
      const okStatus = status === 'all' || String(r.payment_status || '').toLowerCase() === status;
      return okText && okStatus;
    });
    el.innerHTML = rows.length ? rows.map((r) => {
      const paid = String(r.payment_status || '').toLowerCase() === 'paid';
      return `
        <div class="acctRow">
          <div>
            <b>${esc(r.booking_code || 'ไม่มี Booking Code')} <small>#${esc(r.job_id)}</small></b>
            <small>${esc(r.customer_name || '-')} • ${esc(r.masked_customer_phone || '')} • เสร็จ ${esc(dateTH(r.finished_at))}</small>
            <div class="acctMiniStats">
              <div class="acctMiniStat"><span>ยอดขาย</span><b>${money(r.gross_sales_amount)} ฿</b></div>
              <div class="acctMiniStat"><span>ช่องทาง</span><b>${esc(r.payment_method || '-')}</b></div>
              <div class="acctMiniStat"><span>อ้างอิง</span><b>${esc(r.payment_reference || '-')}</b></div>
            </div>
            <small>สถานะรับเงินลูกค้า: ${esc(revenueStatusLabel(r.payment_status))}${r.paid_at ? ` • รับเมื่อ ${esc(dateTH(r.paid_at))}` : ''}</small>
          </div>
          <div class="acctActionsCol">
            ${revenueStatusBadge(r.payment_status)}
            ${badge(r.payment_proof_url ? 'มีหลักฐานรับเงิน' : 'ยังไม่มีหลักฐาน', r.payment_proof_url ? 'ok' : 'warn')}
            ${paid ? `<button class="acctDisabledBtn" type="button" disabled>รับเงินแล้ว</button>` : `<button class="acctPrimaryBtn" type="button" data-mark-revenue-paid="${esc(r.job_id)}">บันทึกรับเงินแล้ว</button>`}
            <button class="acctSecondaryBtn" type="button" data-create-doc-from-job="${esc(r.job_id)}">สร้างเอกสาร</button><button class="acctSecondaryBtn" type="button" data-job-id="${esc(r.job_id)}">ดูรายละเอียดงาน</button>
          </div>
        </div>`;
    }).join('') : empty('ไม่พบรายรับตามเงื่อนไข');
    el.querySelectorAll('[data-mark-revenue-paid]').forEach((btn) => btn.addEventListener('click', () => openRevenuePaidModal(btn.dataset.markRevenuePaid)));
    el.querySelectorAll('[data-create-doc-from-job]').forEach((btn) => btn.addEventListener('click', () => openCreateDocumentModal(btn.dataset.createDocFromJob)));
    el.querySelectorAll('[data-job-id]').forEach((btn) => btn.addEventListener('click', () => { location.href = `/admin-job-view-v2.html?job_id=${encodeURIComponent(btn.dataset.jobId)}`; }));
  }
  function docType(t) { return ({ quotation:'ใบเสนอราคา', invoice:'ใบแจ้งหนี้', receipt:'ใบเสร็จรับเงิน', tax_invoice:'ใบกำกับภาษี', withholding_cert:'ทวิ50' })[t] || t || '-'; }
  function renderDocs() {
    const el = $('documentsList'); const rows = state.summary?.documents || []; if (!el) return;
    el.innerHTML = rows.length ? rows.map((d) => `
      <div class="acctRow" data-doc-id="${esc(d.document_id)}">
        <div>
          <b>${esc(d.document_no || `เอกสาร #${d.document_id}`)}</b>
          <small>${esc(docType(d.document_type))} • ${esc(d.customer_name || '-')} • ออก ${esc(simpleDateTH(d.issue_date || d.created_at))}${d.due_date ? ` • หมดอายุ/ครบกำหนด ${esc(simpleDateTH(d.due_date))}` : ''}</small>
          <small>ยอดรวม ${money(d.total_amount)} บาท • สถานะ ${esc(d.status || '-')}</small>
        </div>
        <div class="acctActionsCol">${statusBadge(d.status)}<span class="acctAmountStrong">${money(d.total_amount)} ฿</span><a class="acctSecondaryBtn" href="/admin/accounting/documents/${esc(d.document_id)}/print" target="_blank" rel="noopener">พิมพ์เอกสาร</a>${String(d.document_type)==='quotation'?`<button class="acctPrimaryBtn" type="button" data-confirm-quote="${esc(d.document_id)}">ลูกค้ายืนยัน → เพิ่มงาน</button>`:''}</div>
      </div>`).join('') : empty('ยังไม่มีเอกสารบัญชี กด + ใบเสนอราคา เพื่อสร้างเอง หรือ เอกสารจาก Job เพื่อผูกงานเดิม');
    el.querySelectorAll('[data-confirm-quote]').forEach((btn)=>btn.addEventListener('click',()=>confirmQuotation(btn.dataset.confirmQuote)));
  }
  function renderExpenses() {
    const el = $('expensesList'); const rows = state.summary?.expenses || []; if (!el) return;
    el.innerHTML = rows.length ? rows.map((x) => `
      <div class="acctRow">
        <div>
          <b>${esc(x.category || 'รายจ่าย')} • ${money(x.amount)} ฿</b>
          <small>${esc(x.vendor_name || '-')} • ${esc(x.description || '')} • วันที่ ${esc(simpleDateTH(x.expense_date))}</small>
          <small>VAT ${money(x.vat_amount)} • หัก ณ ที่จ่าย ${money(x.withholding_amount)}</small>
        </div>
        <div class="acctActionsCol">${statusBadge(x.status)}${x.proof_url ? `<a class="acctSecondaryBtn" href="${esc(x.proof_url)}" target="_blank" rel="noopener">ดูหลักฐาน</a>` : badge('ไม่มีรูปหลักฐาน', 'warn')}</div>
      </div>`).join('') : empty('ยังไม่มีรายจ่าย กด “+ เพิ่มรายจ่ายจริง” เพื่อบันทึกค่าใช้จ่ายพร้อมรูปหลักฐาน');
  }
  function renderPayouts() {
    const el = $('payoutList'); if (!el) return;
    const rows = (state.payouts || []).slice();
    el.innerHTML = rows.length ? rows.map((p) => {
      const selected = String(state.selectedPayoutId || '') === String(p.payout_id || '');
      const dueTone = p.is_due && Number(p.remaining_amount || 0) > 0 ? 'bad' : (Number(p.remaining_amount || 0) <= 0 ? 'ok' : 'warn');
      return `
        <div class="acctRow" style="border-color:${selected ? 'rgba(11,75,179,.36)' : 'rgba(15,23,42,.08)'};background:${selected ? '#eef6ff' : '#fbfdff'}">
          <div>
            <b>งวดวันที่ ${esc(p.period_type)} • กำหนดจ่าย ${esc(p.due_label || simpleDateTH(p.due_date))}</b>
            <small>${esc(p.cutoff_label || `${dateTH(p.period_start)} - ${dateTH(p.period_end)}`)} • ${esc(p.payment_rule_note || '')}</small>
            <small>ช่าง ${money(p.technician_count)} คน • รายการ ${money(p.line_count || 0)} • ID ${esc(p.payout_id)}</small>
            <div class="acctMiniStats">
              <div class="acctMiniStat"><span>ยอดสุทธิต้องจ่าย</span><b>${money(p.net_payable)} ฿</b></div>
              <div class="acctMiniStat"><span>จ่ายแล้ว</span><b>${money(p.paid_amount)} ฿</b></div>
              <div class="acctMiniStat"><span>คงเหลือ</span><b>${money(p.remaining_amount)} ฿</b></div>
            </div>
          </div>
          <div class="acctActionsCol">
            ${badge(p.is_due ? 'ถึงกำหนดแล้ว' : 'ยังไม่ถึงกำหนด', dueTone)}
            ${statusBadge(p.status)}
            <button class="acctPrimaryBtn" type="button" data-load-payout-techs="${esc(p.payout_id)}">ดู/จ่ายรายช่าง</button>
          </div>
        </div>`;
    }).join('') : empty('ยังไม่มีงวดจ่ายช่าง ระบบจะสร้างงวดวันที่ 10/25 อัตโนมัติเมื่อถึงกำหนด');
    el.querySelectorAll('[data-load-payout-techs]').forEach((btn) => btn.addEventListener('click', () => loadPayoutTechs(btn.dataset.loadPayoutTechs)));
    renderPayoutTechs();
  }
  function renderPayoutTechs() {
    const el = $('payoutTechs'); if (!el) return;
    const payoutId = state.selectedPayoutId;
    if (!payoutId) {
      el.innerHTML = `<div class="acctBox"><h3>รายละเอียดรายช่าง</h3><div class="acctEmpty">กด “ดู/จ่ายรายช่าง” ที่งวดจ่ายก่อน รายชื่อช่างและยอดคงเหลือจะขึ้นตรงนี้</div></div>`;
      return;
    }
    if (state.payoutTechError) {
      el.innerHTML = `<div class="acctBox"><h3>รายละเอียดงวด #${esc(payoutId)}</h3><div class="acctSoftErr">โหลดรายช่างไม่สำเร็จ: ${esc(state.payoutTechError)}</div><button class="acctPrimaryBtn" type="button" data-retry-payout-techs="${esc(payoutId)}">ลองโหลดใหม่</button></div>`;
      el.querySelector('[data-retry-payout-techs]')?.addEventListener('click', () => loadPayoutTechs(payoutId));
      return;
    }
    const rows = state.payoutTechs[payoutId] || [];
    const period = (state.payoutPeriods || {})[payoutId] || (state.payouts || []).find(p => String(p.payout_id) === String(payoutId)) || {};
    el.innerHTML = `
      <div class="acctBox">
        <h3>รายละเอียดงวดวันที่ ${esc(period.period_type || '')}</h3>
        <div class="acctDueBanner">กำหนดจ่าย ${esc(period.due_label || simpleDateTH(period.due_date))}<br>${esc(period.cutoff_label || '')}<br>${esc(period.payment_rule_note || 'บันทึกได้หลังโอนเงินจริงเท่านั้น')}</div>
        <div class="acctMuted" style="margin:10px 0">ระบบไม่โอนเงินอัตโนมัติ บัญชีต้องโอนเงินจริงก่อน แล้วจึงกดบันทึกจ่ายแล้ว</div>
        <div class="acctList">
          ${rows.length ? rows.map((t) => {
            const remaining = Number(t.remaining_amount || 0);
            const paid = String(t.paid_status || '').toLowerCase() === 'paid' || remaining <= 0.0001;
            const profile = t.tax_profile || {};
            const whtReady = !!t.can_issue_withholding;
            const existingWht = t.withholding_document;
            return `
              <div class="acctRow acctTechPayRow">
                <div>
                  <b>${esc(t.technician_full_name || t.technician_username || '-')}</b>
                  <small>Username: ${esc(t.technician_username || '-')} • ทวิ50เดือน ${esc(t.wht_month_label || '-')}</small>
                  <div class="acctMiniStats">
                    <div class="acctMiniStat"><span>จำนวนงาน</span><b>${money(t.job_count)}</b></div>
                    <div class="acctMiniStat"><span>ยอดสุทธิ</span><b>${money(t.net_amount)} ฿</b></div>
                    <div class="acctMiniStat"><span>คงเหลือ</span><b>${money(t.remaining_amount)} ฿</b></div>
                    <div class="acctMiniStat"><span>ทวิ50โดยประมาณ</span><b>${money(t.wht_tax_amount)} ฿</b></div>
                  </div>
                  <small>รายได้ก่อนหัก ${money(t.gross_amount)} บาท • หักประกัน ${money(t.deposit_deduction_amount)} บาท • ปรับยอด ${money(t.adj_total)} บาท • จ่ายแล้ว ${money(t.paid_amount)} บาท</small>
                  <small>สถานะจ่ายเงินช่าง: ${esc(payoutStatusLabel(t.paid_status))}${t.paid_at ? ` • จ่ายเมื่อ ${esc(dateTH(t.paid_at))}` : ''}</small>
                  <div class="acctTaxHint ${profile.is_complete ? 'ok' : 'warn'}">ข้อมูลทวิ50: ${esc(missingProfileText(profile))}</div>
                </div>
                <div class="acctActionsCol">
                  ${payoutStatusBadge(t.paid_status)}
                  ${paid ? `<button class="acctDisabledBtn" type="button" disabled>จ่ายช่างแล้ว</button>` : `<button class="acctPrimaryBtn" type="button" data-pay-payout="${esc(payoutId)}" data-tech="${esc(t.technician_username)}" data-remaining="${esc(t.remaining_amount)}">บันทึกจ่ายแล้ว</button>`}
                  ${existingWht ? `<a class="acctSecondaryBtn" href="/admin/accounting/documents/${esc(existingWht.document_id)}/print" target="_blank" rel="noopener">พิมพ์ทวิ50 ${esc(existingWht.document_no || '')}</a>` : ''}
                  <button class="acctSecondaryBtn" type="button" data-edit-tech-tax="${esc(t.technician_username)}">เติมข้อมูลทวิ50</button>
                  ${whtReady && !existingWht ? `<button class="acctPrimaryBtn acctWhtBtn" type="button" data-issue-wht="${esc(payoutId)}" data-tech="${esc(t.technician_username)}">ออกทวิ50เดือนนี้</button>` : ''}
                </div>
              </div>`;
          }).join('') : empty('ยังไม่มีรายช่างในงวดนี้ ถ้างวดนี้ควรมีงาน ให้ตรวจว่ามีงานเสร็จในช่วงตัดยอดนี้แล้วหรือยัง')}
        </div>
      </div>`;
    el.querySelectorAll('[data-pay-payout]').forEach((btn) => btn.addEventListener('click', () => openPayoutPaidModal(btn.dataset.payPayout, btn.dataset.tech, btn.dataset.remaining)));
    el.querySelectorAll('[data-edit-tech-tax]').forEach((btn) => btn.addEventListener('click', () => openTechTaxProfileModal(btn.dataset.editTechTax)));
    el.querySelectorAll('[data-issue-wht]').forEach((btn) => btn.addEventListener('click', () => openIssueWithholdingModal(btn.dataset.issueWht, btn.dataset.tech)));
  }
  function renderDeposits() {
    const rows = state.deposits?.rows || []; const ledger = state.deposits?.ledger || [];
    const list = $('depositList'); const led = $('depositLedger');
    if (list) list.innerHTML = rows.length ? rows.map((r) => `
      <div class="acctRow"><div><b>${esc(r.technician_username)}</b><small>เป้าหมาย ${money(r.target_amount)} บาท • เก็บแล้ว ${money(r.collected_total)} บาท</small></div><div class="acctActionsCol">${badge(`คงเหลือ ${money(r.remaining_amount)}`, Number(r.remaining_amount) > 0 ? 'warn' : 'ok')}</div></div>`).join('') : empty('ยังไม่มีข้อมูลเงินประกัน');
    if (led) led.innerHTML = ledger.length ? ledger.map((r) => `
      <div class="acctRow"><div><b>${esc(r.transaction_type)} • ${money(r.amount)} บาท</b><small>${esc(r.technician_username)} • ${esc(r.payout_id || '-')} • ${esc(r.note || '')}</small></div><small>${esc(dateTH(r.created_at))}</small></div>`).join('') : empty('ยังไม่มี ledger เงินประกัน');
  }
  function renderReports() {
    const sumEl = $('reportSummary');
    if (sumEl) {
      const r = state.reportSummary || {};
      sumEl.innerHTML = `
        <div class="acctSummaryTile"><span>รายรับงานเสร็จ</span><b>${money(r.revenue?.total_amount)} ฿</b></div>
        <div class="acctSummaryTile"><span>รายจ่ายที่บันทึก</span><b>${money(r.expenses?.total_amount)} ฿</b></div>
        <div class="acctSummaryTile"><span>ยอดจ่ายช่าง</span><b>${money(r.payouts?.net_payable)} ฿</b></div>
        <div class="acctSummaryTile"><span>กำไรขั้นต้นประมาณ</span><b>${money(r.estimated_gross_profit)} ฿</b></div>`;
    }
    const el = $('reportCards'); if (!el) return;
    const reports = [
      { key: 'revenue', title: 'รายงานรายรับ', desc: 'งานที่เสร็จแล้ว ยอดขาย สถานะรับเงิน และหลักฐานรับเงิน' },
      { key: 'expenses', title: 'รายงานรายจ่าย', desc: 'รายการค่าใช้จ่าย VAT และหัก ณ ที่จ่ายที่บันทึกไว้' },
      { key: 'payouts', title: 'รายงานจ่ายช่าง', desc: 'งวดจ่าย ยอดสุทธิ จ่ายแล้ว คงเหลือ และสถานะจ่ายช่าง' },
      { key: 'deposits', title: 'รายงานเงินประกัน', desc: 'ยอดเงินประกันที่ถืออยู่ แยกตามช่าง และยอดคงเหลือเป้าหมาย' },
      { key: 'gross-profit', title: 'รายงานกำไรขั้นต้น', desc: 'สรุปยอดขาย หักรายจ่าย หักยอดจ่ายช่าง เพื่อใช้ตรวจทานเบื้องต้น' },
      { key: 'documents', title: 'รายงานเอกสารขาย', desc: 'ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ และสถานะเอกสาร' },
      { key: 'vat-summary', title: 'VAT summary', desc: 'สรุป VAT จากเอกสารขายและรายจ่ายที่บันทึกไว้' },
      { key: 'withholding-summary', title: 'Withholding summary', desc: 'สรุปหัก ณ ที่จ่ายจากรายจ่ายที่บันทึกไว้' },
    ];
    el.innerHTML = reports.map((r) => `
      <div class="acctBox acctReportCard">
        <div class="acctBadge ok">CSV + พิมพ์ได้</div>
        <h3>${esc(r.title)}</h3>
        <div class="acctMuted">${esc(r.desc)}</div>
        <button class="acctPrimaryBtn" type="button" data-export-report="${esc(r.key)}">ดาวน์โหลด CSV</button>
      </div>`).join('');
  }
  function renderAuditInto(el, rows) {
    el.innerHTML = rows.length ? rows.map((r) => `
      <div class="acctRow"><div><b>${esc(auditActionLabel(r.action))}</b><small>${esc(r.entity_type || '-')} #${esc(r.entity_id || '-')} • ${esc(r.actor_username || '-')} (${esc(r.actor_role || '-')}) • ${esc(r.note || '')}</small></div><small>${esc(dateTH(r.created_at))}</small></div>`).join('') : empty('ยังไม่มีประวัติการทำรายการ');
  }
  function renderAudit() { const el = $('auditList'); if (el) renderAuditInto(el, state.audit || []); }
  function renderAll() { renderCards(); renderOverview(); renderRevenue(); renderDocs(); renderExpenses(); renderPayouts(); renderDeposits(); renderReports(); renderAudit(); }

  function closeModal() {
    const modal = $('accountingModal'); if (!modal) return;
    modal.classList.remove('show'); modal.setAttribute('aria-hidden', 'true'); modal.onclick = null; modal.innerHTML = '';
  }
  function openModal(html, onSubmit) {
    const modal = $('accountingModal'); if (!modal) return;
    modal.innerHTML = `<div class="acctModalCard" role="dialog" aria-modal="true">${html}</div>`;
    modal.classList.add('show'); modal.setAttribute('aria-hidden', 'false');
    modal.querySelector('[data-close]')?.addEventListener('click', closeModal);
    modal.onclick = (ev) => { if (ev.target === modal) closeModal(); };
    modal.querySelector('form')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const form = ev.currentTarget; const err = modal.querySelector('[data-error]'); const submit = form.querySelector('[type="submit"]');
      if (err) err.textContent = '';
      try {
        if (submit) { submit.disabled = true; submit.dataset.oldText = submit.textContent; submit.textContent = 'กำลังบันทึก...'; }
        await onSubmit(new FormData(form), err);
      } catch (e) {
        if (err) err.textContent = cleanError(e);
      } finally {
        if (submit) { submit.disabled = false; submit.textContent = submit.dataset.oldText || 'บันทึก'; }
      }
    });
    setTimeout(() => modal.querySelector('input,select,textarea,button')?.focus(), 0);
  }
  function renderSettings(){
    const el=$('settingsSummary'); if(!el) return;
    const s=state.settings || {};
    el.innerHTML=`<div class="acctRow"><div><b>${esc(s.company_name||'ยังไม่ได้ตั้งชื่อบริษัท')}</b><small>เลขภาษี ${esc(s.tax_id||'-')} • ${esc(s.branch||'สำนักงานใหญ่')}</small><small>${esc(s.address||'-')}</small><small>โทร ${esc(s.phone||'-')}</small></div><div class="acctActionsCol">${s.logo_url?'<span class="acctBadge ok">มีโลโก้</span>':'<span class="acctBadge warn">ยังไม่มีโลโก้</span>'}${s.signature_url?'<span class="acctBadge ok">มีลายเซ็น</span>':'<span class="acctBadge warn">ยังไม่มีลายเซ็น</span>'}${s.stamp_url?'<span class="acctBadge ok">มีตราประทับ</span>':'<span class="acctBadge warn">ยังไม่มีตราประทับ</span>'}</div></div>`;
  }
  async function loadSettings(){ try{ const r=await getJson('/admin/accounting/settings'); state.settings=r.settings||{}; renderSettings(); }catch(e){ const el=$('settingsSummary'); if(el) el.innerHTML=`<div class="acctSoftErr">โหลดตั้งค่าเอกสารไม่สำเร็จ: ${esc(cleanError(e)||e.message)}</div>`; } }
  function openSettingsModal(){
    const s=state.settings || {};
    openModal(`<form class="acctFormGrid" enctype="multipart/form-data">
      <h3>ตั้งค่าข้อมูลบริษัทสำหรับออกเอกสาร</h3>
      <p>ข้อมูลนี้จะใช้บนใบเสนอราคา ใบกำกับภาษี ใบเสร็จ และทวิ50</p>
      <div class="acctGrid2"><label>ชื่อร้าน/บริษัท<input class="acctInput" name="company_name" value="${esc(s.company_name||'Coldwindflow Air Services')}"></label><label>เลขประจำตัวผู้เสียภาษี<input class="acctInput" name="tax_id" value="${esc(s.tax_id||'')}"></label><label>สาขา<input class="acctInput" name="branch" value="${esc(s.branch||'สำนักงานใหญ่')}"></label><label>โทรศัพท์<input class="acctInput" name="phone" value="${esc(s.phone||'098-877-7321')}"></label></div>
      <label>ที่อยู่บริษัท<textarea class="acctInput" name="address" placeholder="23/61 ถ.พึ่งมี 50 แขวงบางจาก เขตพระโขนง กรุงเทพฯ 10260">${esc(s.address||'23/61 ถ.พึ่งมี 50 แขวงบางจาก เขตพระโขนง กรุงเทพฯ 10260')}</textarea></label>
      <div class="acctGrid2"><label>ผู้ลงนาม<input class="acctInput" name="signer_name" value="${esc(s.signer_name||'')}"></label><label>ตำแหน่ง<input class="acctInput" name="signer_position" value="${esc(s.signer_position||'')}"></label><label>VAT %<input class="acctInput" name="vat_rate" type="number" step="0.01" value="${esc(s.vat_rate||7)}"></label><label>หัก ณ ที่จ่าย %<input class="acctInput" name="wht_rate" type="number" step="0.01" value="${esc(s.wht_rate||3)}"></label></div>
      <label>ข้อความท้ายเอกสาร<textarea class="acctInput" name="footer_note">${esc(s.footer_note||'')}</textarea></label>
      <label>ข้อมูลบัญชีรับเงิน<textarea class="acctInput" name="bank_info">${esc(s.bank_info||'')}</textarea></label>
      <div class="acctGrid2"><label>URL โลโก้<input class="acctInput" name="logo_url" value="${esc(s.logo_url||'/logo.png')}" placeholder="/logo.png"></label><label>เลือกโลโก้ที่มีในแอพ<select class="acctInput" name="logo_preset" onchange="this.form.logo_url.value=this.value"><option value="">ไม่เปลี่ยน</option><option value="/logo.png">โลโก้หลัก /logo.png</option><option value="/icon-cwf-v34-512.png">ไอคอน CWF v34</option><option value="/icon-512.png">ไอคอนเดิม</option></select></label><label>อัปโหลดโลโก้<input class="acctInput" name="logo_file" type="file" accept="image/*"></label><label>URL ลายเซ็น<input class="acctInput" name="signature_url" value="${esc(s.signature_url||'')}"></label><label>อัปโหลดลายเซ็น<input class="acctInput" name="signature_file" type="file" accept="image/*"></label><label>URL ตราประทับ<input class="acctInput" name="stamp_url" value="${esc(s.stamp_url||'')}"></label><label>อัปโหลดตราประทับ<input class="acctInput" name="stamp_file" type="file" accept="image/*"></label></div>
      <div class="acctSoftErr" data-error style="display:block;min-height:0"></div>
      <div class="acctModalActions"><button class="acctGhostBtn" type="button" data-close>ยกเลิก</button><button class="acctPrimaryBtn" type="submit">บันทึกตั้งค่าเอกสาร</button></div>
    </form>`, async(fd)=>{ const r = await postForm('/admin/accounting/settings', fd); state.settings = r.settings || state.settings || {}; closeModal(); await Promise.all([loadSettings(), loadAudit()]); alert('บันทึกตั้งค่าข้อมูลบริษัทแล้ว'); });
  }

  function openExpenseModal() {
    const today = new Date().toISOString().slice(0,10);
    openModal(`
      <form class="acctFormGrid" enctype="multipart/form-data">
        <h3>เพิ่มรายจ่ายจริง</h3>
        <p>บันทึกรายจ่ายพร้อมรูปใบเสร็จ/สลิป ระบบจะเก็บ audit log ให้ตรวจย้อนหลัง</p>
        <label>วันที่รายจ่าย<input class="acctInput" name="expense_date" type="date" value="${today}" required></label>
        <label>หมวดรายจ่าย<select class="acctInput" name="category" required>
          <option value="ค่าอะไหล่">ค่าอะไหล่</option><option value="ค่าน้ำยาแอร์">ค่าน้ำยาแอร์</option><option value="ค่าเดินทาง">ค่าเดินทาง</option><option value="ค่าอุปกรณ์">ค่าอุปกรณ์</option><option value="ค่าโฆษณา">ค่าโฆษณา</option><option value="ค่าระบบ/ซอฟต์แวร์">ค่าระบบ/ซอฟต์แวร์</option><option value="ค่าจ้างช่าง">ค่าจ้างช่าง</option><option value="ค่าเช่า/สำนักงาน">ค่าเช่า/สำนักงาน</option><option value="ค่าอื่น ๆ">ค่าอื่น ๆ</option>
        </select></label>
        <label>ร้านค้า/ผู้ขาย<input class="acctInput" name="vendor_name" placeholder="เช่น ร้านอะไหล่ / ปั๊มน้ำมัน"></label>
        <label>รายละเอียด<textarea class="acctInput" name="description" placeholder="ระบุรายละเอียดรายจ่าย"></textarea></label>
        <label>จำนวนเงิน<input class="acctInput" name="amount" type="number" min="0.01" step="0.01" required></label>
        <label>VAT ถ้ามี<input class="acctInput" name="vat_amount" type="number" min="0" step="0.01" value="0"></label>
        <label>หัก ณ ที่จ่าย ถ้ามี<input class="acctInput" name="withholding_amount" type="number" min="0" step="0.01" value="0"></label>
        <label>ช่องทางชำระเงิน<input class="acctInput" name="payment_method" placeholder="เงินสด / โอน / บัตร"></label>
        <label>เลขอ้างอิง<input class="acctInput" name="payment_reference" placeholder="เลขสลิป / เลขใบเสร็จ"></label>
        <label>ผูกกับ Job ID ถ้ามี<input class="acctInput" name="job_id" type="number" min="1" placeholder="ไม่บังคับ"></label>
        <label>รูปใบเสร็จ/สลิป<input class="acctInput" name="proof" type="file" accept="image/*,application/pdf"></label>
        <label>หรือ URL หลักฐาน<input class="acctInput" name="proof_url" placeholder="https://..."></label>
        <div class="acctSoftErr" data-error style="display:block;min-height:0"></div>
        <div class="acctModalActions"><button class="acctGhostBtn" type="button" data-close>ยกเลิก</button><button class="acctPrimaryBtn" type="submit">บันทึกรายจ่าย</button></div>
      </form>`, async (fd) => {
        await postForm('/admin/accounting/expenses', fd);
        closeModal();
        await Promise.all([loadSummary(), loadAudit()]);
        showAccountingTab('expenses', { scroll: false, updateUrl: true });
      });
  }

  function todayIso(){ return new Date().toISOString().slice(0,10); }
  function quoteDefaultPrice(wash,btu){
    const high = String(btu||'').includes('18') || Number(String(btu||'').replace(/\D/g,'')) >= 18000;
    const key = String(wash||'normal');
    if(key==='premium') return high?1100:900;
    if(key==='hanging_coil') return high?1700:1400;
    if(key==='overhaul') return high?2300:2000;
    return high?750:600;
  }
  function addQuoteLine(container, data={}){
    const row = document.createElement('div'); row.className='acctQuoteLine acctBox';
    row.innerHTML = `<div class="acctGrid3">
      <label>ประเภทงาน<select class="acctInput" name="job_type"><option value="cleaning">ล้างแอร์</option><option value="repair">ซ่อมแอร์</option><option value="install">ติดตั้งแอร์</option></select></label>
      <label>ประเภทแอร์<select class="acctInput" name="ac_type"><option value="wall">แอร์ผนัง</option><option value="cassette">แอร์สี่ทิศทาง</option><option value="ceiling">แอร์แขวน</option><option value="concealed">แอร์เปลือย</option></select><small>แอร์ผนังเลือกประเภทการล้างได้ ส่วนแอร์อื่นมีแบบเดียวตาม flow งานปัจจุบัน</small></label>
      <label data-wash-wrap>ประเภทการล้าง<select class="acctInput" name="wash_variant"><option value="normal">ล้างปกติ</option><option value="premium">ล้างพรีเมียม</option><option value="hanging_coil">ล้างแขวนคอยล์</option><option value="overhaul">ตัดล้างใหญ่</option></select></label>
      <label>BTU<select class="acctInput" name="btu"><option value="<=12000">ไม่เกิน 12,000 BTU</option><option value=">=18000">18,000 BTU ขึ้นไป</option></select></label>
      <label>จำนวน<input class="acctInput" name="quantity" type="number" min="1" value="1"></label>
      <label>ราคา/หน่วย<input class="acctInput" name="unit_price" type="number" min="0" step="0.01"></label>
    </div><label>รายละเอียดเพิ่มเติม<input class="acctInput" name="description" placeholder="เช่น ล้างแอร์ผนังพรีเมียม"></label><button type="button" class="acctGhostBtn" data-remove-line>ลบรายการนี้</button>`;
    container.appendChild(row);
    const acSel=row.querySelector('[name=ac_type]'); const washWrap=row.querySelector('[data-wash-wrap]');
    const setPrice=()=>{ const ac=acSel.value; const wash=row.querySelector('[name=wash_variant]').value; const btu=row.querySelector('[name=btu]').value; const p=row.querySelector('[name=unit_price]'); if(!p.dataset.touched) p.value=ac==='wall'?quoteDefaultPrice(wash,btu):0; };
    const updateWash=()=>{ const isWall=acSel.value==='wall'; if(washWrap) washWrap.style.display=isWall?'grid':'none'; if(!isWall){ const wash=row.querySelector('[name=wash_variant]'); if(wash) wash.value='standard'; } else { const wash=row.querySelector('[name=wash_variant]'); if(wash && wash.value==='standard') wash.value='normal'; } setPrice(); updateQuoteTotal(container); };
    row.querySelector('[name=unit_price]').addEventListener('input', e=>{ e.target.dataset.touched='1'; updateQuoteTotal(container); });
    ['ac_type','wash_variant','btu','quantity'].forEach(n=>row.querySelector(`[name=${n}]`)?.addEventListener('change',()=>{ n==='ac_type'?updateWash():(setPrice(),updateQuoteTotal(container)); }));
    row.querySelector('[data-remove-line]').addEventListener('click',()=>{ row.remove(); updateQuoteTotal(container); });
    if(data.ac_type) row.querySelector('[name=ac_type]').value=data.ac_type;
    updateWash();
  }
  function quoteItemsFrom(container){ return Array.from(container.querySelectorAll('.acctQuoteLine')).map(r=>{ const get=n=>r.querySelector(`[name=${n}]`)?.value||''; const qty=Number(get('quantity')||1); const unit=Number(get('unit_price')||0); const ac=get('ac_type')||'wall'; const wash=ac==='wall'?get('wash_variant'):'standard'; const btu=get('btu'); const acLabel={wall:'แอร์ผนัง',cassette:'แอร์สี่ทิศทาง',ceiling:'แอร์แขวน',concealed:'แอร์เปลือย'}[ac]||ac; const washLabel={normal:'ล้างปกติ',premium:'ล้างพรีเมียม',hanging_coil:'ล้างแขวนคอยล์',overhaul:'ตัดล้างใหญ่',standard:'บริการมาตรฐาน'}[wash]||wash; return { job_type:get('job_type'), ac_type:ac, wash_variant:wash, btu, quantity:qty, unit_price:unit, line_total:qty*unit, description:get('description')||`${acLabel} ${washLabel} ${btu}` }; }); }
  function updateQuoteTotal(container){ const out=document.getElementById('quoteTotalPreview'); if(!out) return; const total=quoteItemsFrom(container).reduce((s,x)=>s+Number(x.line_total||0),0); out.textContent=`ยอดรวม ${money(total)} บาท`; }
  function openQuotationModal(){
    openModal(`<form class="acctFormGrid"><h3>สร้างใบเสนอราคา</h3><p>สร้างใบเสนอราคาเองได้โดยไม่ต้องมี Job ID เลือกประเภทการล้างเฉพาะแอร์ผนัง และเพิ่มหลายรายการได้</p><div class="acctGrid2"><label>วันที่ออกเอกสาร<input class="acctInput" name="issue_date" type="date" value="${todayIso()}"></label><label>วันหมดอายุ<input class="acctInput" name="due_date" type="date"></label><label>ชื่อลูกค้า<input class="acctInput" name="customer_name" required></label><label>เบอร์ลูกค้า<input class="acctInput" name="customer_phone"></label></div><label>ที่อยู่ลูกค้า<textarea class="acctInput" name="customer_address"></textarea></label><div id="quoteLineList" class="acctList"></div><button class="acctSecondaryBtn" type="button" id="btnAddQuoteLine">+ เพิ่มรายการ</button><div id="quoteTotalPreview" class="acctAmountStrong">ยอดรวม 0 บาท</div><label>หมายเหตุ<textarea class="acctInput" name="note"></textarea></label><label class="acctCheckLine"><input type="checkbox" name="issue_now" value="1"><span>ออกเอกสารทันที</span></label><div class="acctSoftErr" data-error style="display:block;min-height:0"></div><div class="acctModalActions"><button class="acctGhostBtn" type="button" data-close>ยกเลิก</button><button class="acctPrimaryBtn" type="submit">สร้างใบเสนอราคา</button></div></form>`, async(fd)=>{ const box=document.getElementById('quoteLineList'); const r=await postJson('/admin/accounting/documents',{ document_type:'quotation', issue_date:fd.get('issue_date'), due_date:fd.get('due_date'), customer_name:fd.get('customer_name'), customer_phone:fd.get('customer_phone'), customer_address:fd.get('customer_address'), note:fd.get('note'), issue_now:fd.get('issue_now')==='1', line_items:quoteItemsFrom(box) }); closeModal(); await Promise.all([loadSummary(),loadAudit()]); showAccountingTab('documents',{scroll:false,updateUrl:true}); if(r.print_url) window.open(r.print_url,'_blank','noopener'); });
    setTimeout(()=>{ const box=document.getElementById('quoteLineList'); document.getElementById('btnAddQuoteLine')?.addEventListener('click',()=>addQuoteLine(box)); addQuoteLine(box); },0);
  }
  function openTaxInvoiceModal(){ openModal(`<form class="acctFormGrid"><h3>ออกใบกำกับภาษี</h3><div class="acctGrid2"><label>วันที่ออก<input class="acctInput" name="issue_date" type="date" value="${todayIso()}"></label><label>ชื่อลูกค้า/บริษัท<input class="acctInput" name="customer_name" required></label><label>เลขภาษีลูกค้า<input class="acctInput" name="customer_tax_id" required></label><label>ยอดก่อน VAT<input class="acctInput" name="amount" type="number" min="0" step="0.01" required></label></div><label>ที่อยู่ลูกค้า<textarea class="acctInput" name="customer_address" required></textarea></label><label>รายละเอียด<input class="acctInput" name="description" value="ค่าบริการ"></label><div class="acctSoftErr" data-error style="display:block;min-height:0"></div><div class="acctModalActions"><button class="acctGhostBtn" type="button" data-close>ยกเลิก</button><button class="acctPrimaryBtn" type="submit">ออกใบกำกับภาษี</button></div></form>`, async(fd)=>{ const amount=Number(fd.get('amount')||0); const r=await postJson('/admin/accounting/documents',{ document_type:'tax_invoice', issue_now:true, issue_date:fd.get('issue_date'), customer_name:fd.get('customer_name'), customer_tax_id:fd.get('customer_tax_id'), customer_address:fd.get('customer_address'), line_items:[{description:fd.get('description'), quantity:1, unit_price:amount, line_total:amount}], vat_rate:7 }); closeModal(); await Promise.all([loadSummary(),loadAudit()]); if(r.print_url) window.open(r.print_url,'_blank','noopener'); }); }
  async function confirmQuotation(id){ const r=await postJson(`/admin/accounting/documents/${encodeURIComponent(id)}/confirm`,{}); try{localStorage.setItem('cwf_accounting_quote_prefill',JSON.stringify(r.prefill||{}));}catch(_){} location.href=`/admin-add-v2.html?from_quote=${encodeURIComponent(id)}`; }
  async function loadTaxRequests(){ try{ const r=await getJson('/admin/accounting/technician-tax-requests'); state.taxRequests=r.rows||[]; renderTaxRequests(); }catch(e){ state.taxRequests=[]; renderTaxRequests(cleanError(e)); } }
  function renderTaxRequests(err){
    const el=$('taxRequestBox');
    if(!el) return;
    const rows=state.taxRequests||[];
    el.innerHTML=`<div class="acctBox"><div class="acctSectionTitleLine"><h3>คำขอข้อมูลทวิ50จากช่าง</h3><button class="acctGhostBtn" type="button" data-refresh-tax>รีเฟรชคำขอ</button></div><div class="acctMuted">ช่างส่งข้อมูลจากเมนูตั้งค่า แอดมินต้องอนุมัติก่อนนำไปใช้ออกทวิ50</div>${err?`<div class="acctSoftErr">${esc(err)}</div>`:''}<div class="acctList">${rows.length?rows.map(r=>`<div class="acctRow"><div><b>${esc(r.full_name||r.username)}</b><small>${esc(r.username)} • เลขภาษี ${esc(r.tax_id||'-')}</small><small>${esc(r.tax_address||'')}</small><small>ส่งเมื่อ ${esc(fmtDate(r.requested_at)||'-')}</small></div><div class="acctActionsCol"><button class="acctPrimaryBtn" data-approve-tax="${esc(r.id || r.request_id)}">อนุมัติข้อมูลนี้</button><button class="acctGhostBtn" data-reject-tax="${esc(r.id || r.request_id)}">ปฏิเสธ</button></div></div>`).join(''):'<div class="acctEmpty">ไม่มีคำขอรออนุมัติ</div>'}</div></div>`;
    el.querySelector('[data-refresh-tax]')?.addEventListener('click', loadTaxRequests);
    el.querySelectorAll('[data-approve-tax]').forEach(b=>b.addEventListener('click',async()=>{
      if(!confirm('อนุมัติข้อมูลทวิ50ของช่างคนนี้ เพื่อนำไปใช้ในเอกสารใช่ไหม?')) return;
      const old=b.textContent; b.disabled=true; b.textContent='กำลังอนุมัติ...';
      try{ await postJson(`/admin/accounting/technician-tax-requests/${b.dataset.approveTax}/approve`,{}); await loadTaxRequests(); alert('อนุมัติข้อมูลทวิ50แล้ว'); }
      catch(e){ alert('อนุมัติไม่สำเร็จ: '+(cleanError(e)||e.message||'')); }
      finally{ b.disabled=false; b.textContent=old; }
    }));
    el.querySelectorAll('[data-reject-tax]').forEach(b=>b.addEventListener('click',async()=>{
      const note=prompt('เหตุผลที่ปฏิเสธ')||'';
      const old=b.textContent; b.disabled=true; b.textContent='กำลังบันทึก...';
      try{ await postJson(`/admin/accounting/technician-tax-requests/${b.dataset.rejectTax}/reject`,{admin_note:note}); await loadTaxRequests(); }
      catch(e){ alert('ปฏิเสธไม่สำเร็จ: '+(cleanError(e)||e.message||'')); }
      finally{ b.disabled=false; b.textContent=old; }
    }));
  }

  function openCreateDocumentModal(jobId = '') {
    openModal(`
      <form class="acctFormGrid">
        <h3>สร้างเอกสารขาย</h3>
        <p>ใส่เลขงาน แล้วเลือกว่าเป็นใบเสนอราคา / ใบแจ้งหนี้ / ใบเสร็จ ระบบจะรันเลขเอกสารให้อัตโนมัติ</p>
        <label>ประเภทเอกสาร<select class="acctInput" name="document_type" required><option value="quotation">ใบเสนอราคา</option><option value="invoice">ใบแจ้งหนี้</option><option value="receipt">ใบเสร็จรับเงิน</option><option value="tax_invoice">ใบกำกับภาษี</option></select></label>
        <label>Job ID<input class="acctInput" name="job_id" type="number" min="1" value="${esc(jobId)}" required placeholder="เช่น 123"></label>
        <label>วันที่ออกเอกสาร<input class="acctInput" name="issue_date" type="date" value="${todayIso()}"></label>
        <label>เลขภาษีลูกค้า/บริษัท <small>ใช้กับใบกำกับภาษี</small><input class="acctInput" name="customer_tax_id" placeholder="เลขประจำตัวผู้เสียภาษี"></label>
        <label>ที่อยู่สำหรับออกใบกำกับภาษี<textarea class="acctInput" name="customer_address" placeholder="กรอกถ้าต้องออกใบกำกับภาษี"></textarea></label>
        <label>วันครบกำหนด ถ้ามี<input class="acctInput" name="due_date" type="date"></label>
        <label class="acctCheckLine"><input type="checkbox" name="issue_now" value="1"><span>ออกเอกสารทันที (issued) ถ้ายังไม่แน่ใจให้ปล่อยเป็น draft</span></label>
        <div class="acctSoftErr" data-error style="display:block;min-height:0"></div>
        <div class="acctModalActions"><button class="acctGhostBtn" type="button" data-close>ยกเลิก</button><button class="acctPrimaryBtn" type="submit">สร้างเอกสาร</button></div>
      </form>`, async (fd) => {
        const payload = { document_type: fd.get('document_type'), job_id: Number(fd.get('job_id')), issue_date: fd.get('issue_date') || todayIso(), due_date: fd.get('due_date') || null, customer_tax_id: fd.get('customer_tax_id') || '', customer_address: fd.get('customer_address') || '', issue_now: fd.get('issue_now') === '1' || fd.get('document_type') === 'tax_invoice' };
        await postJson('/admin/accounting/documents', payload);
        closeModal();
        await Promise.all([loadSummary(), loadAudit()]);
        showAccountingTab('documents', { scroll: false, updateUrl: true });
      });
  }

  function openRevenuePaidModal(jobId) {
    const row = (state.revenue || []).find((r) => String(r.job_id) === String(jobId));
    openModal(`
      <form class="acctFormGrid">
        <h3>ยืนยันการรับเงิน</h3>
        <p>งาน ${esc(row?.booking_code || `#${jobId}`)} • ยอด ${money(row?.gross_sales_amount)} บาท<br>กรุณายืนยันว่าได้รับเงินจริงจากลูกค้าแล้ว ก่อนบันทึกสถานะรับเงิน</p>
        <label>ช่องทางรับเงิน<input class="acctInput" name="payment_method" placeholder="เช่น โอน, เงินสด, QR" value="${esc(row?.payment_method || '')}"></label>
        <label>เลขอ้างอิง/หมายเหตุ<input class="acctInput" name="payment_reference" placeholder="เลขสลิป / เลขรายการ" value="${esc(row?.payment_reference || '')}"></label>
        <label>หมายเหตุ<textarea class="acctInput" name="note" placeholder="รายละเอียดเพิ่มเติม"></textarea></label>
        <label class="acctCheckLine"><input type="checkbox" name="confirm_received" value="1"><span>ยืนยันว่าได้รับเงินจริงแล้ว</span></label>
        <div class="acctSoftErr" data-error style="display:block;min-height:0"></div>
        <div class="acctModalActions"><button class="acctGhostBtn" type="button" data-close>ยกเลิก</button><button class="acctPrimaryBtn" type="submit">บันทึกรับเงินแล้ว</button></div>
      </form>`, async (fd, errEl) => {
        if (fd.get('confirm_received') !== '1') { if (errEl) errEl.textContent = 'กรุณาติ๊กยืนยันว่าได้รับเงินจริงแล้ว'; return; }
        await postJson(`/admin/accounting/revenue/${encodeURIComponent(jobId)}/mark-paid`, {
          payment_method: fd.get('payment_method'), payment_reference: fd.get('payment_reference'), note: fd.get('note'), confirm_received: true,
        });
        closeModal();
        await Promise.all([loadSummary(), loadRevenue(), loadAudit()]);
        showAccountingTab('revenue', { scroll: false, updateUrl: true });
      });
  }
  async function openTechTaxProfileModal(username) {
    let profile = { username, full_name: username, tax_id: '', tax_address: '', tax_branch: '', wht_income_type: 'ค่าบริการ/ค่าจ้างทำของ ตามมาตรา 40(8)', wht_default_rate: 3 };
    try {
      const r = await getJson(`/admin/accounting/technicians/${encodeURIComponent(username)}/tax-profile`);
      profile = r.profile || profile;
    } catch (_) {}
    openModal(`
      <form class="acctFormGrid">
        <h3>ข้อมูลช่างสำหรับออกทวิ50</h3>
        <p>ข้อมูลนี้ใช้กับหนังสือรับรองการหักภาษี ณ ที่จ่ายของช่าง ระบบจะดึงอัตโนมัติในเดือนถัดไป ไม่ต้องกรอกซ้ำ</p>
        <label>ชื่อช่าง/ผู้รับเงิน<input class="acctInput" name="full_name" value="${esc(profile.full_name || username)}" required></label>
        <label>เลขประจำตัวผู้เสียภาษี/บัตรประชาชน<input class="acctInput" name="tax_id" value="${esc(profile.tax_id || '')}" required placeholder="13 หลัก หรือเลขภาษี"></label>
        <label>ที่อยู่ผู้รับเงิน<textarea class="acctInput" name="tax_address" required placeholder="ที่อยู่ตามเอกสารภาษี">${esc(profile.tax_address || '')}</textarea></label>
        <label>สาขา/หมายเหตุภาษี<input class="acctInput" name="tax_branch" value="${esc(profile.tax_branch || '')}" placeholder="ถ้าเป็นบุคคลธรรมดาปล่อยว่างได้"></label>
        <label>ประเภทเงินได้<input class="acctInput" name="wht_income_type" value="${esc(profile.wht_income_type || 'ค่าบริการ/ค่าจ้างทำของ ตามมาตรา 40(8)')}"></label>
        <label>อัตราหัก ณ ที่จ่าย %<input class="acctInput" name="wht_default_rate" type="number" min="0" max="15" step="0.01" value="${esc(profile.wht_default_rate || 3)}"></label>
        <div class="acctSoftErr" data-error style="display:block;min-height:0"></div>
        <div class="acctModalActions"><button class="acctGhostBtn" type="button" data-close>ยกเลิก</button><button class="acctPrimaryBtn" type="submit">บันทึกข้อมูลทวิ50</button></div>
      </form>`, async (fd) => {
        await postJson(`/admin/accounting/technicians/${encodeURIComponent(username)}/tax-profile`, {
          full_name: fd.get('full_name'), tax_id: fd.get('tax_id'), tax_address: fd.get('tax_address'), tax_branch: fd.get('tax_branch'), wht_income_type: fd.get('wht_income_type'), wht_default_rate: fd.get('wht_default_rate'),
        });
        closeModal();
        if (state.selectedPayoutId) await loadPayoutTechs(state.selectedPayoutId, { keepPosition: true });
      });
  }

  function openIssueWithholdingModal(payoutId, username) {
    const rows = state.payoutTechs[payoutId] || [];
    const row = rows.find(x => String(x.technician_username) === String(username)) || {};
    openModal(`
      <form class="acctFormGrid">
        <h3>ออกใบทวิ50 ให้ช่าง</h3>
        <p>ช่าง: <b>${esc(row.technician_full_name || username)}</b><br>เดือน: <b>${esc(row.wht_month_label || '-')}</b><br>ยอดเงินได้จากยอดที่บันทึกจ่ายจริง: <b>${money(row.wht_income_amount)} บาท</b><br>ภาษีหัก ณ ที่จ่ายโดยประมาณ: <b>${money(row.wht_tax_amount)} บาท</b></p>
        <div class="acctNote">ระบบจะออกหนังสือรับรองตามมาตรา 50 ทวิ เพื่อพิมพ์/บันทึก PDF เท่านั้น ไม่ใช่การยื่นภาษีอัตโนมัติ กรุณาตรวจข้อมูลก่อนใช้งานจริง</div>
        <label>อัตราหัก ณ ที่จ่าย %<input class="acctInput" name="withholding_rate" type="number" min="0" max="15" step="0.01" value="${esc(row.wht_rate || 3)}"></label>
        <label class="acctCheckLine"><input type="checkbox" name="confirm_issue" value="1"><span>ยืนยันว่าตรวจข้อมูลช่าง ยอดเงินได้ และยอดภาษีแล้ว</span></label>
        <div class="acctSoftErr" data-error style="display:block;min-height:0"></div>
        <div class="acctModalActions"><button class="acctGhostBtn" type="button" data-close>ยกเลิก</button><button class="acctPrimaryBtn" type="submit">ออกทวิ50</button></div>
      </form>`, async (fd, errEl) => {
        if (fd.get('confirm_issue') !== '1') { if (errEl) errEl.textContent = 'กรุณาติ๊กยืนยันก่อนออกทวิ50'; return; }
        const r = await postJson(`/admin/accounting/payouts/${encodeURIComponent(payoutId)}/tech/${encodeURIComponent(username)}/withholding-cert`, { withholding_rate: fd.get('withholding_rate') });
        closeModal();
        await Promise.all([loadAudit(), loadPayoutTechs(payoutId, { keepPosition: true })]);
        if (r.print_url) window.open(r.print_url, '_blank', 'noopener');
      });
  }

  function openPayoutPaidModal(payoutId, tech, remaining) {
    openModal(`
      <form class="acctFormGrid">
        <h3>ยืนยันการจ่ายเงินช่าง</h3>
        <p>ช่าง: <b>${esc(tech)}</b><br>ระบบไม่โอนเงินอัตโนมัติ กรุณาโอนเงินจริงก่อน แล้วจึงบันทึกจ่ายแล้ว</p>
        <label>ยอดที่จ่าย<input class="acctInput" name="paid_amount" type="number" min="0.01" step="0.01" value="${esc(remaining || '')}"></label>
        <label>ช่องทางจ่าย<input class="acctInput" name="payment_method" placeholder="เช่น โอนธนาคาร, เงินสด"></label>
        <label>เลขอ้างอิงหรือหมายเหตุ<input class="acctInput" name="payment_reference" placeholder="เลขสลิป / เลขรายการ"></label>
        <label>URL หลักฐานการโอน ถ้ามี<input class="acctInput" name="slip_url" placeholder="https://..."></label>
        <label>หมายเหตุ<textarea class="acctInput" name="note" placeholder="รายละเอียดเพิ่มเติม"></textarea></label>
        <label class="acctCheckLine"><input type="checkbox" name="confirm_paid" value="1"><span>ยืนยันว่าได้โอน/จ่ายเงินจริงแล้ว</span></label>
        <div class="acctSoftErr" data-error style="display:block;min-height:0"></div>
        <div class="acctModalActions"><button class="acctGhostBtn" type="button" data-close>ยกเลิก</button><button class="acctPrimaryBtn" type="submit">บันทึกจ่ายแล้ว</button></div>
      </form>`, async (fd, errEl) => {
        if (fd.get('confirm_paid') !== '1') { if (errEl) errEl.textContent = 'กรุณาติ๊กยืนยันว่าได้โอน/จ่ายเงินจริงแล้ว'; return; }
        await postJson(`/admin/accounting/payouts/${encodeURIComponent(payoutId)}/pay`, {
          technician_username: tech, paid_amount: fd.get('paid_amount'), payment_method: fd.get('payment_method'), payment_reference: fd.get('payment_reference'), slip_url: fd.get('slip_url'), note: fd.get('note'), confirm_paid: true,
        });
        closeModal();
        await Promise.all([loadSummary(), loadPayouts(), loadAudit()]);
        await loadPayoutTechs(payoutId, { keepPosition: true });
        showAccountingTab('payouts', { scroll: false, updateUrl: true });
      });
  }

  async function loadSummary() {
    ['accountingCards','overviewSummary','overviewAudit','documentsList','expensesList'].forEach((id) => setLoading(id));
    state.summary = await getJson('/admin/accounting/summary'); renderAll(); showErrors([state.summary]);
  }
  async function loadRevenue() { setLoading('revenueList'); const r = await getJson('/admin/accounting/revenue'); state.revenue = r.rows || []; renderRevenue(); showErrors([r]); }
  async function loadPayouts() { setLoading('payoutList'); const r = await getJson('/admin/accounting/payouts'); state.payouts = r.rows || []; state.payoutPeriods = Object.fromEntries((state.payouts || []).map(p => [String(p.payout_id), p])); if ($('payoutNote') && r.note) $('payoutNote').textContent = r.note; renderPayouts(); showErrors([r]); }
  async function loadPayoutTechs(payoutId, options = {}) {
    state.selectedPayoutId = payoutId; state.payoutTechError = null; setLoading('payoutTechs', 'กำลังโหลดรายละเอียดรายช่าง...'); renderPayouts();
    try {
      const r = await getJson(`/admin/accounting/payouts/${encodeURIComponent(payoutId)}/techs`);
      state.payoutTechs[payoutId] = r.rows || [];
      if (r.period) state.payoutPeriods[payoutId] = r.period;
      showErrors([r]);
    } catch (e) {
      state.payoutTechError = cleanError(e) || e.message || 'โหลดข้อมูลไม่สำเร็จ';
    }
    renderPayouts();
    if (!options.keepPosition) requestAnimationFrame(() => { try { $('payoutTechs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {} });
  }
  async function loadDeposits() { setLoading('depositList'); setLoading('depositLedger'); state.deposits = await getJson('/admin/accounting/deposits'); renderDeposits(); showErrors([state.deposits]); }
  async function loadReportSummary() { const r = await getJson('/admin/accounting/reports/summary'); state.reportSummary = r; renderReports(); showErrors([r]); }
  async function loadAudit() { setLoading('auditList'); const r = await getJson('/admin/accounting/audit'); state.audit = r.rows || []; renderAudit(); showErrors([r]); }
  async function reloadAll() {
    try {
      await loadSummary();
      if (state.tab === 'revenue') await loadRevenue();
      if (state.tab === 'payouts') { await loadPayouts(); await loadTaxRequests(); }
      if (state.tab === 'deposits') await loadDeposits();
      if (state.tab === 'reports') await loadReportSummary();
      if (state.tab === 'settings') await loadSettings();
      if (state.tab === 'audit') await loadAudit();
    } catch (e) {
      const err = $('softErrors'); if (err) err.innerHTML = `<div class="acctSoftErr">โหลดข้อมูลงานบัญชีไม่สำเร็จ: ${esc(e.message || e)}</div>`;
    }
  }
  function workspaceAction() {
    if (state.tab === 'revenue') return loadRevenue();
    if (state.tab === 'payouts') return Promise.all([loadPayouts(), loadTaxRequests()]);
    if (state.tab === 'deposits') return loadDeposits();
    if (state.tab === 'reports') return loadReportSummary();
    if (state.tab === 'settings') return openSettingsModal();
    if (state.tab === 'audit') return loadAudit();
    return reloadAll();
  }
  function bind() {
    document.querySelectorAll('.acctTabBtn').forEach((b) => b.addEventListener('click', () => showAccountingTab(b.dataset.tab, { scroll: true, updateUrl: true })));
    document.addEventListener('click', (ev) => {
      const btn = ev.target?.closest?.('[data-export-report]');
      if (!btn) return;
      const key = btn.getAttribute('data-export-report');
      if (!key) return;
      window.location.href = `/admin/accounting/reports/${encodeURIComponent(key)}.csv`;
      setTimeout(loadAudit, 900);
    });
    $('btnReloadAccounting')?.addEventListener('click', reloadAll);
    $('workspacePrimaryAction')?.addEventListener('click', workspaceAction);
    $('btnReloadRevenue')?.addEventListener('click', loadRevenue);
    $('btnOpenExpense')?.addEventListener('click', openExpenseModal);
    $('btnOpenCreateDoc')?.addEventListener('click', () => openCreateDocumentModal());
    $('btnOpenQuoteDoc')?.addEventListener('click', openQuotationModal);
    $('btnOpenTaxInvoiceDoc')?.addEventListener('click', openTaxInvoiceModal);
    $('btnOpenSettings')?.addEventListener('click', openSettingsModal);
    $('btnPrintReport')?.addEventListener('click', () => window.print());
    $('revenueSearch')?.addEventListener('input', renderRevenue);
    $('revenueStatusFilter')?.addEventListener('change', renderRevenue);
    window.addEventListener('hashchange', () => showAccountingTab(initialTabFromUrl(), { scroll: true, updateUrl: false }));
    window.addEventListener('popstate', () => showAccountingTab(initialTabFromUrl(), { scroll: true, updateUrl: false }));
  }

  bind();
  renderReports();
  renderPayoutTechs();
  renderSettings();
  showAccountingTab(initialTabFromUrl(), { scroll: location.search.includes('tab=') || !!location.hash, updateUrl: false });
  reloadAll();
})();
