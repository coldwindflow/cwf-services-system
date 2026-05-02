/* Admin Accounting v2 Phase 1: read-only shell */
(function(){
  const $ = (id)=>document.getElementById(id);
  const state = { summary:null, revenue:[], payouts:[], deposits:null, audit:[], tab:'overview' };
  const VALID_TABS = new Set(['overview','revenue','documents','expenses','payouts','deposits','reports','audit']);

  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  }
  function money(v){
    const n = Number(v || 0);
    return n.toLocaleString('th-TH', { maximumFractionDigits:2 });
  }
  function dateTH(v){
    if (!v) return '-';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('th-TH', { timeZone:'Asia/Bangkok', day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
  }
  async function getJson(url){
    if (window.apiFetch) return window.apiFetch(url);
    const res = await fetch(url, { credentials:'include', headers:{ 'Content-Type':'application/json', 'x-user-role':'admin' } });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }
  function setLoading(id, text='กำลังโหลดข้อมูล...'){
    const el = $(id);
    if (el) el.innerHTML = `<div class="muted">${esc(text)}</div>`;
  }
  function empty(text){
    return `<div class="row"><div><b>${esc(text)}</b><small>ยังไม่มีข้อมูลใน Phase 1</small></div><span class="badge gray">ว่าง</span></div>`;
  }
  function badge(text, cls='gray'){ return `<span class="badge ${cls}">${esc(text || '-')}</span>`; }
  function statusBadge(s){
    const v = String(s || '').toLowerCase();
    if (['paid','approved','issued'].includes(v)) return badge(s, 'ok');
    if (['draft','submitted','partial'].includes(v)) return badge(s, 'warn');
    if (['voided','unpaid'].includes(v)) return badge(s, 'bad');
    return badge(s || '-', 'gray');
  }
  function showErrors(payloads){
    const all = [];
    for (const p of payloads || []) {
      for (const e of (p && p.soft_errors) || []) all.push(e);
    }
    const el = $('softErrors');
    if (!el) return;
    el.innerHTML = all.length ? `<div class="softErr">ข้อมูลบางส่วนโหลดไม่ครบ: ${all.map(e=>esc(e.scope || e.message)).join(', ')}</div>` : '';
  }
  function normalizeTab(tab){
    const key = String(tab || '').replace(/^#/, '').trim().toLowerCase();
    return VALID_TABS.has(key) ? key : 'overview';
  }
  function initialTabFromUrl(){
    const qs = new URLSearchParams(location.search || '');
    return normalizeTab(qs.get('tab') || (location.hash || '').replace(/^#/, '') || 'overview');
  }
  function updateTabUrl(tab){
    try {
      const url = new URL(location.href);
      url.searchParams.set('tab', tab);
      url.hash = tab;
      history.replaceState({ accountingTab: tab }, '', url.toString());
    } catch (_) {}
  }
  function scrollActiveChipIntoView(tab){
    const btn = document.querySelector(`.tabBtn[data-tab="${tab}"]`);
    try { btn?.scrollIntoView({ behavior:'smooth', block:'nearest', inline:'center' }); } catch (_) {}
  }
  function scrollAccountingContentIntoView(tab){
    const panel = $(`panel-${tab}`);
    if (!panel) return;
    const topNav = document.getElementById('cwfTopNav');
    const offset = (topNav?.getBoundingClientRect?.().height || 68) + 12;
    const y = panel.getBoundingClientRect().top + window.pageYOffset - offset;
    try {
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    } catch (_) {
      window.scrollTo(0, Math.max(0, y));
    }
    panel.classList.remove('navFocus');
    void panel.offsetWidth;
    panel.classList.add('navFocus');
    try { panel.focus({ preventScroll: true }); } catch (_) {}
  }
  function showAccountingTab(tabKey, options = {}){
    const opts = Object.assign({ scroll: true, updateUrl: true }, options);
    const tab = normalizeTab(tabKey);
    state.tab = tab;
    document.querySelectorAll('.tabBtn').forEach(b=>{
      const active = b.dataset.tab === tab;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active', p.id === `panel-${tab}`));
    if (tab === 'revenue' && !state.revenue.length) loadRevenue();
    if (tab === 'payouts' && !state.payouts.length) loadPayouts();
    if (tab === 'deposits' && !state.deposits) loadDeposits();
    if (tab === 'audit' && !state.audit.length) loadAudit();
    if (opts.updateUrl) updateTabUrl(tab);
    scrollActiveChipIntoView(tab);
    if (opts.scroll) requestAnimationFrame(()=>scrollAccountingContentIntoView(tab));
  }

  function renderCards(){
    const el = $('accountingCards');
    const cards = state.summary?.cards || [];
    if (!el) return;
    el.innerHTML = cards.length ? cards.map(c => `
      <article class="card">
        <div class="top"><b>${esc(c.label)}</b><span class="dot tone-${esc(c.status_key || 'blue')}"></span></div>
        <div class="count">${money(c.count)}</div>
        <div class="amount">${c.total_amount == null ? 'ไม่มีมูลค่ารวม' : `${money(c.total_amount)} บาท`}</div>
        <button class="goBtn" type="button" data-target-tab="${esc(c.target_tab || 'overview')}">ไปจัดการ</button>
      </article>
    `).join('') : empty('ยังไม่มีข้อมูลงานบัญชีวันนี้');
    el.querySelectorAll('[data-target-tab]').forEach(btn=>btn.addEventListener('click', ()=>showAccountingTab(btn.dataset.targetTab, { scroll:true, updateUrl:true })));
  }
  function renderOverview(){
    const s = $('overviewSummary');
    const a = $('overviewAudit');
    if (s) {
      const cards = state.summary?.cards || [];
      s.innerHTML = cards.length ? cards.map(c=>`
        <div class="row"><div><b>${esc(c.label)}</b><small>${c.total_amount == null ? 'จำนวนรายการ' : `${money(c.total_amount)} บาท`}</small></div>${badge(`${money(c.count)} รายการ`, c.status_key === 'red' ? 'bad' : 'gray')}</div>
      `).join('') : empty('ยังไม่มีสรุป');
    }
    if (a) renderAuditInto(a, state.summary?.recent_audit || []);
  }
  function renderRevenue(){
    const el = $('revenueList');
    if (!el) return;
    const q = String($('revenueSearch')?.value || '').trim().toLowerCase();
    const rows = (state.revenue || []).filter(r => !q || String(`${r.booking_code || ''} ${r.customer_name || ''}`).toLowerCase().includes(q));
    el.innerHTML = rows.length ? rows.map(r=>`
      <div class="row">
        <div>
          <b>${esc(r.booking_code || 'ไม่มี Booking Code')} <small>#${esc(r.job_id)}</small></b>
          <small>${esc(r.customer_name || '-')} • ${esc(r.masked_customer_phone || '')} • เสร็จ ${esc(dateTH(r.finished_at))}</small>
          <small>ยอดขาย ${money(r.gross_sales_amount)} บาท • วิธีรับเงิน ${esc(r.payment_method || '-')}</small>
        </div>
        <div style="display:grid;gap:6px;justify-items:end">
          ${statusBadge(r.payment_status)}
          ${badge(Object.keys(r.document_status || {}).length ? 'มีเอกสาร' : 'ยังไม่มีเอกสาร', Object.keys(r.document_status || {}).length ? 'ok' : 'warn')}
          <button class="goBtn" type="button" onclick="location.href='/admin-job-view-v2.html?job_id=${encodeURIComponent(r.job_id)}'">${esc(r.action_label || 'ดูรายละเอียด')}</button>
        </div>
      </div>
    `).join('') : empty('ยังไม่มีรายรับจากงานที่เสร็จแล้ว');
  }
  function renderDocs(){
    const el = $('documentsList');
    const rows = state.summary?.documents || [];
    if (!el) return;
    el.innerHTML = rows.length ? rows.map(d=>`
      <div class="row"><div><b>${esc(d.document_no || `เอกสาร #${d.document_id}`)}</b><small>${esc(docType(d.document_type))} • งาน #${esc(d.job_id || '-')} • ${esc(d.customer_name || '-')}</small></div><div>${statusBadge(d.status)}<small>${money(d.total_amount)} บาท</small></div></div>
    `).join('') : empty('ยังไม่มีเอกสารบัญชี');
  }
  function docType(t){ return ({ quotation:'ใบเสนอราคา', invoice:'ใบแจ้งหนี้', receipt:'ใบเสร็จรับเงิน' })[t] || t || '-'; }
  function renderExpenses(){
    const el = $('expensesList');
    const rows = state.summary?.expenses || [];
    if (!el) return;
    el.innerHTML = rows.length ? rows.map(x=>`
      <div class="row"><div><b>${esc(x.category || 'รายจ่าย')}</b><small>${esc(x.vendor_name || '-')} • ${esc(x.description || '')} • ${esc(x.expense_date || '-')}</small></div><div>${statusBadge(x.status)}<small>${money(x.amount)} บาท</small></div></div>
    `).join('') : empty('ยังไม่มีรายจ่าย');
  }
  function renderPayouts(){
    const el = $('payoutList');
    if (!el) return;
    const rows = state.payouts || [];
    el.innerHTML = rows.length ? rows.map(p=>`
      <div class="row">
        <div><b>${esc(p.payout_id)} • รอบ ${esc(p.period_type)}</b><small>${esc(dateTH(p.period_start))} - ${esc(dateTH(p.period_end))} • ช่าง ${money(p.technician_count)} คน</small><small>Gross ${money(p.gross_amount)} • หักประกัน ${money(p.deposit_deduction_amount)} • ปรับยอด ${money(p.adj_total)}</small></div>
        <div style="text-align:right">${statusBadge(p.status)}<small>สุทธิ ${money(p.net_payable)} บาท</small><small>คงเหลือ ${money(p.remaining_amount)} บาท</small></div>
      </div>
    `).join('') : empty('ยังไม่มีงวดจ่ายช่าง');
  }
  function renderDeposits(){
    const rows = state.deposits?.rows || [];
    const ledger = state.deposits?.ledger || [];
    const list = $('depositList');
    const led = $('depositLedger');
    if (list) list.innerHTML = rows.length ? rows.map(r=>`
      <div class="row"><div><b>${esc(r.technician_username)}</b><small>เป้าหมาย ${money(r.target_amount)} บาท • เก็บแล้ว ${money(r.collected_total)} บาท</small></div><div>${badge(`คงเหลือ ${money(r.remaining_amount)}`, Number(r.remaining_amount) > 0 ? 'warn' : 'ok')}</div></div>
    `).join('') : empty('ยังไม่มีข้อมูลเงินประกัน');
    if (led) led.innerHTML = ledger.length ? ledger.map(r=>`
      <div class="row"><div><b>${esc(r.transaction_type)} • ${money(r.amount)} บาท</b><small>${esc(r.technician_username)} • ${esc(r.payout_id || '-')} • ${esc(r.note || '')}</small></div><small>${esc(dateTH(r.created_at))}</small></div>
    `).join('') : empty('ยังไม่มี ledger เงินประกัน');
  }
  function renderReports(){
    const el = $('reportCards');
    if (!el) return;
    const reports = ['รายงานรายรับ','รายงานรายจ่าย','รายงานจ่ายช่าง','รายงานเงินประกัน','รายงานกำไรขั้นต้น','รายงานเอกสารขาย','VAT summary (เมื่อเปิด VAT mode)','withholding tax summary (เมื่อมีข้อมูล)'];
    el.innerHTML = reports.map(r=>`<div class="box"><h3>${esc(r)}</h3><div class="muted">สำหรับตรวจทานและเตรียมบัญชี ไม่ใช่การยื่นภาษีอัตโนมัติ</div><button class="disabledBtn" type="button" disabled>Export - Phase 2</button></div>`).join('');
  }
  function renderAuditInto(el, rows){
    el.innerHTML = rows.length ? rows.map(r=>`
      <div class="row"><div><b>${esc(r.action)} • ${esc(r.entity_type)}</b><small>${esc(r.actor_username || '-')} (${esc(r.actor_role || '-')}) • ${esc(r.note || '')}</small></div><small>${esc(dateTH(r.created_at))}</small></div>
    `).join('') : empty('ยังไม่มีประวัติการทำรายการ');
  }
  function renderAudit(){
    const el = $('auditList');
    if (el) renderAuditInto(el, state.audit || []);
  }
  function renderAll(){
    renderCards(); renderOverview(); renderRevenue(); renderDocs(); renderExpenses(); renderPayouts(); renderDeposits(); renderReports(); renderAudit();
  }
  async function loadSummary(){
    ['accountingCards','overviewSummary','overviewAudit','documentsList','expensesList'].forEach(id=>setLoading(id));
    state.summary = await getJson('/admin/accounting/summary');
    renderAll();
    showErrors([state.summary, state.deposits, { soft_errors: [] }]);
  }
  async function loadRevenue(){ setLoading('revenueList'); const r = await getJson('/admin/accounting/revenue'); state.revenue = r.rows || []; renderRevenue(); showErrors([r]); }
  async function loadPayouts(){ setLoading('payoutList'); const r = await getJson('/admin/accounting/payouts'); state.payouts = r.rows || []; if ($('payoutNote') && r.note) $('payoutNote').textContent = r.note; renderPayouts(); showErrors([r]); }
  async function loadDeposits(){ setLoading('depositList'); setLoading('depositLedger'); state.deposits = await getJson('/admin/accounting/deposits'); renderDeposits(); showErrors([state.deposits]); }
  async function loadAudit(){ setLoading('auditList'); const r = await getJson('/admin/accounting/audit'); state.audit = r.rows || []; renderAudit(); showErrors([r]); }
  async function reloadAll(){
    try {
      await loadSummary();
      if (state.tab === 'revenue') await loadRevenue();
      if (state.tab === 'payouts') await loadPayouts();
      if (state.tab === 'deposits') await loadDeposits();
      if (state.tab === 'audit') await loadAudit();
    } catch (e) {
      const err = $('softErrors');
      if (err) err.innerHTML = `<div class="softErr">โหลดข้อมูลงานบัญชีไม่สำเร็จ: ${esc(e.message || e)}</div>`;
    }
  }
  function bind(){
    document.querySelectorAll('.tabBtn').forEach(b=>b.addEventListener('click', ()=>showAccountingTab(b.dataset.tab, { scroll:true, updateUrl:true })));
    $('btnReloadAccounting')?.addEventListener('click', reloadAll);
    $('btnReloadRevenue')?.addEventListener('click', loadRevenue);
    $('revenueSearch')?.addEventListener('input', renderRevenue);
    window.addEventListener('hashchange', ()=>showAccountingTab(initialTabFromUrl(), { scroll:true, updateUrl:false }));
    window.addEventListener('popstate', ()=>showAccountingTab(initialTabFromUrl(), { scroll:true, updateUrl:false }));
  }
  bind();
  renderReports();
  showAccountingTab(initialTabFromUrl(), { scroll: location.search.includes('tab=') || !!location.hash, updateUrl: false });
  reloadAll();
})();
