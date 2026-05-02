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
    audit: { title: 'ประวัติการทำรายการ', hint: 'ตรวจย้อนหลังว่าใครทำอะไร เมื่อไหร่', action: 'โหลดประวัติ' },
  };
  const VALID_TABS = new Set(Object.keys(TAB_META));

  const state = {
    tab: 'overview',
    summary: null,
    revenue: [],
    payouts: [],
    deposits: null,
    audit: [],
    payoutTechs: {},
    selectedPayoutId: null,
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
  function cleanError(e) {
    const msg = String(e?.payload?.error || e?.message || e || '');
    if (msg.includes('CONFIRM_RECEIVED_REQUIRED')) return 'กรุณาติ๊กยืนยันว่าได้รับเงินจริงแล้ว';
    if (msg.includes('CONFIRM_PAID_REQUIRED')) return 'กรุณาติ๊กยืนยันว่าได้โอน/จ่ายเงินจริงแล้ว';
    if (msg.includes('PAID_AMOUNT_EXCEEDS_REMAINING')) return 'ยอดที่จ่ายมากกว่ายอดคงเหลือ';
    if (msg.includes('PAYOUT_ALREADY_PAID')) return 'รายการนี้จ่ายครบแล้ว';
    if (msg.includes('ACCOUNTING_PERMISSION_REQUIRED')) return 'บัญชีนี้ยังไม่มีสิทธิ์ทำรายการนี้ กรุณาให้ Super Admin เพิ่มสิทธิ์บัญชี';
    if (msg.includes('JOB_NOT_COMPLETED')) return 'งานนี้ยังไม่เสร็จ จึงบันทึกรับเงินจากหน้านี้ไม่ได้';
    if (msg.includes('CANNOT_MARK_CANCELED_JOB_PAID')) return 'งานที่ยกเลิกแล้วไม่สามารถบันทึกรับเงินได้';
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
    const s = $('overviewSummary'); const a = $('overviewAudit');
    const cards = state.summary?.cards || [];
    if (s) s.innerHTML = cards.length ? cards.map((c) => `
      <div class="acctRow">
        <div><b>${esc(c.label)}</b><small>${c.total_amount == null ? 'จำนวนรายการ' : `${money(c.total_amount)} บาท`}</small></div>
        <div class="acctActionsCol">${badge(`${money(c.count)} รายการ`, c.status_key === 'red' ? 'bad' : 'gray')}<button class="acctGoBtn" type="button" data-target-tab="${esc(c.target_tab || 'overview')}">ไปจัดการ</button></div>
      </div>`).join('') : empty('ยังไม่มีสรุป');
    s?.querySelectorAll('[data-target-tab]').forEach((btn) => btn.addEventListener('click', () => showAccountingTab(btn.dataset.targetTab, { scroll: true, updateUrl: true })));
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
            <button class="acctSecondaryBtn" type="button" data-job-id="${esc(r.job_id)}">ดูรายละเอียดงาน</button>
          </div>
        </div>`;
    }).join('') : empty('ไม่พบรายรับตามเงื่อนไข');
    el.querySelectorAll('[data-mark-revenue-paid]').forEach((btn) => btn.addEventListener('click', () => openRevenuePaidModal(btn.dataset.markRevenuePaid)));
    el.querySelectorAll('[data-job-id]').forEach((btn) => btn.addEventListener('click', () => { location.href = `/admin-job-view-v2.html?job_id=${encodeURIComponent(btn.dataset.jobId)}`; }));
  }
  function docType(t) { return ({ quotation:'ใบเสนอราคา', invoice:'ใบแจ้งหนี้', receipt:'ใบเสร็จรับเงิน' })[t] || t || '-'; }
  function renderDocs() {
    const el = $('documentsList'); const rows = state.summary?.documents || []; if (!el) return;
    el.innerHTML = rows.length ? rows.map((d) => `
      <div class="acctRow"><div><b>${esc(d.document_no || `เอกสาร #${d.document_id}`)}</b><small>${esc(docType(d.document_type))} • งาน #${esc(d.job_id || '-')} • ${esc(d.customer_name || '-')}</small></div><div class="acctActionsCol">${statusBadge(d.status)}<span class="acctAmountStrong">${money(d.total_amount)} ฿</span></div></div>`).join('') : empty('ยังไม่มีเอกสารบัญชี');
  }
  function renderExpenses() {
    const el = $('expensesList'); const rows = state.summary?.expenses || []; if (!el) return;
    el.innerHTML = rows.length ? rows.map((x) => `
      <div class="acctRow"><div><b>${esc(x.category || 'รายจ่าย')}</b><small>${esc(x.vendor_name || '-')} • ${esc(x.description || '')} • ${esc(x.expense_date || '-')}</small></div><div class="acctActionsCol">${statusBadge(x.status)}<span class="acctAmountStrong">${money(x.amount)} ฿</span></div></div>`).join('') : empty('ยังไม่มีรายจ่าย');
  }
  function renderPayouts() {
    const el = $('payoutList'); if (!el) return;
    const rows = state.payouts || [];
    el.innerHTML = rows.length ? rows.map((p) => {
      const selected = String(state.selectedPayoutId || '') === String(p.payout_id || '');
      return `
        <div class="acctRow" style="border-color:${selected ? 'rgba(11,75,179,.36)' : 'rgba(15,23,42,.08)'};background:${selected ? '#eef6ff' : '#fbfdff'}">
          <div>
            <b>งวด #${esc(p.payout_id)} • รอบวันที่ ${esc(p.period_type)}</b>
            <small>${esc(dateTH(p.period_start))} - ${esc(dateTH(p.period_end))} • ช่าง ${money(p.technician_count)} คน</small>
            <div class="acctMiniStats">
              <div class="acctMiniStat"><span>ยอดสุทธิ</span><b>${money(p.net_payable)} ฿</b></div>
              <div class="acctMiniStat"><span>จ่ายแล้ว</span><b>${money(p.paid_amount)} ฿</b></div>
              <div class="acctMiniStat"><span>คงเหลือ</span><b>${money(p.remaining_amount)} ฿</b></div>
            </div>
          </div>
          <div class="acctActionsCol">
            ${statusBadge(p.status)}
            <button class="acctPrimaryBtn" type="button" data-load-payout-techs="${esc(p.payout_id)}">เลือกงวดนี้</button>
          </div>
        </div>`;
    }).join('') : empty('ยังไม่มีงวดจ่ายช่าง');
    el.querySelectorAll('[data-load-payout-techs]').forEach((btn) => btn.addEventListener('click', () => loadPayoutTechs(btn.dataset.loadPayoutTechs)));
    renderPayoutTechs();
  }
  function renderPayoutTechs() {
    const el = $('payoutTechs'); if (!el) return;
    const payoutId = state.selectedPayoutId;
    if (!payoutId) {
      el.innerHTML = `<div class="acctBox"><h3>รายละเอียดรายช่าง</h3><div class="acctEmpty">เลือกงวดจ่ายด้านซ้ายก่อน แล้วรายชื่อช่างจะขึ้นตรงนี้</div></div>`;
      return;
    }
    const rows = state.payoutTechs[payoutId] || [];
    el.innerHTML = `
      <div class="acctBox">
        <h3>รายละเอียดงวด #${esc(payoutId)}</h3>
        <div class="acctMuted" style="margin-bottom:10px">บันทึกจ่ายได้เฉพาะหลังโอนเงินจริงแล้วเท่านั้น ระบบไม่โอนเงินอัตโนมัติ</div>
        <div class="acctList">
          ${rows.length ? rows.map((t) => {
            const remaining = Number(t.remaining_amount || 0);
            const paid = String(t.paid_status || '').toLowerCase() === 'paid' || remaining <= 0.0001;
            return `
              <div class="acctRow">
                <div>
                  <b>${esc(t.technician_username || '-')}</b>
                  <div class="acctMiniStats">
                    <div class="acctMiniStat"><span>จำนวนงาน</span><b>${money(t.job_count)}</b></div>
                    <div class="acctMiniStat"><span>ยอดสุทธิ</span><b>${money(t.net_amount)} ฿</b></div>
                    <div class="acctMiniStat"><span>คงเหลือ</span><b>${money(t.remaining_amount)} ฿</b></div>
                  </div>
                  <small>รายได้ก่อนหัก ${money(t.gross_amount)} บาท • หักประกัน ${money(t.deposit_deduction_amount)} บาท • ปรับยอด ${money(t.adj_total)} บาท • จ่ายแล้ว ${money(t.paid_amount)} บาท</small>
                  <small>สถานะจ่ายเงินช่าง: ${esc(payoutStatusLabel(t.paid_status))}${t.paid_at ? ` • จ่ายเมื่อ ${esc(dateTH(t.paid_at))}` : ''}</small>
                </div>
                <div class="acctActionsCol">
                  ${payoutStatusBadge(t.paid_status)}
                  ${paid ? `<button class="acctDisabledBtn" type="button" disabled>จ่ายช่างแล้ว</button>` : `<button class="acctPrimaryBtn" type="button" data-pay-payout="${esc(payoutId)}" data-tech="${esc(t.technician_username)}" data-remaining="${esc(t.remaining_amount)}">บันทึกจ่ายแล้ว</button>`}
                </div>
              </div>`;
          }).join('') : empty('ยังไม่มีรายละเอียดช่างในงวดนี้')}
        </div>
      </div>`;
    el.querySelectorAll('[data-pay-payout]').forEach((btn) => btn.addEventListener('click', () => openPayoutPaidModal(btn.dataset.payPayout, btn.dataset.tech, btn.dataset.remaining)));
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
    const el = $('reportCards'); if (!el) return;
    const reports = [
      { key: 'revenue', title: 'รายงานรายรับ', desc: 'งานที่เสร็จแล้ว ยอดขาย สถานะรับเงิน และหลักฐานรับเงิน' },
      { key: 'expenses', title: 'รายงานรายจ่าย', desc: 'รายการค่าใช้จ่าย VAT และหัก ณ ที่จ่ายที่บันทึกไว้' },
      { key: 'payouts', title: 'รายงานจ่ายช่าง', desc: 'งวดจ่าย ยอดสุทธิ จ่ายแล้ว คงเหลือ และสถานะจ่ายช่าง' },
      { key: 'deposits', title: 'รายงานเงินประกัน', desc: 'ยอดเงินประกันที่ถืออยู่ แยกตามช่าง และยอดคงเหลือเป้าหมาย' },
      { key: 'gross-profit', title: 'รายงานกำไรขั้นต้น', desc: 'สรุปยอดขาย หักรายจ่าย หักยอดจ่ายช่าง เพื่อใช้ตรวจทานเบื้องต้น' },
      { key: 'documents', title: 'รายงานเอกสารขาย', desc: 'ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ และสถานะเอกสาร' },
      { key: 'vat-summary', title: 'VAT summary', desc: 'สรุป VAT จากเอกสารขายและรายจ่าย สำหรับให้บัญชีตรวจ' },
      { key: 'withholding-summary', title: 'Withholding tax summary', desc: 'สรุปหัก ณ ที่จ่ายจากรายจ่าย/ข้อมูลที่มีในระบบ' },
    ];
    el.innerHTML = reports.map((r) => `
      <div class="acctBox acctReportCard">
        <div class="acctBadge ok">CSV พร้อมใช้</div>
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
  async function loadPayouts() { setLoading('payoutList'); const r = await getJson('/admin/accounting/payouts'); state.payouts = r.rows || []; if ($('payoutNote') && r.note) $('payoutNote').textContent = r.note; renderPayouts(); showErrors([r]); }
  async function loadPayoutTechs(payoutId, options = {}) {
    state.selectedPayoutId = payoutId; setLoading('payoutTechs', 'กำลังโหลดรายละเอียดรายช่าง...'); renderPayouts();
    const r = await getJson(`/admin/accounting/payouts/${encodeURIComponent(payoutId)}/techs`);
    state.payoutTechs[payoutId] = r.rows || []; renderPayouts(); showErrors([r]);
    if (!options.keepPosition) requestAnimationFrame(() => { try { $('payoutTechs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {} });
  }
  async function loadDeposits() { setLoading('depositList'); setLoading('depositLedger'); state.deposits = await getJson('/admin/accounting/deposits'); renderDeposits(); showErrors([state.deposits]); }
  async function loadAudit() { setLoading('auditList'); const r = await getJson('/admin/accounting/audit'); state.audit = r.rows || []; renderAudit(); showErrors([r]); }
  async function reloadAll() {
    try {
      await loadSummary();
      if (state.tab === 'revenue') await loadRevenue();
      if (state.tab === 'payouts') await loadPayouts();
      if (state.tab === 'deposits') await loadDeposits();
      if (state.tab === 'audit') await loadAudit();
    } catch (e) {
      const err = $('softErrors'); if (err) err.innerHTML = `<div class="acctSoftErr">โหลดข้อมูลงานบัญชีไม่สำเร็จ: ${esc(e.message || e)}</div>`;
    }
  }
  function workspaceAction() {
    if (state.tab === 'revenue') return loadRevenue();
    if (state.tab === 'payouts') return loadPayouts();
    if (state.tab === 'deposits') return loadDeposits();
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
    $('revenueSearch')?.addEventListener('input', renderRevenue);
    $('revenueStatusFilter')?.addEventListener('change', renderRevenue);
    window.addEventListener('hashchange', () => showAccountingTab(initialTabFromUrl(), { scroll: true, updateUrl: false }));
    window.addEventListener('popstate', () => showAccountingTab(initialTabFromUrl(), { scroll: true, updateUrl: false }));
  }

  bind();
  renderReports();
  renderPayoutTechs();
  showAccountingTab(initialTabFromUrl(), { scroll: location.search.includes('tab=') || !!location.hash, updateUrl: false });
  reloadAll();
})();
