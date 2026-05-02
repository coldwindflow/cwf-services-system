/* Admin Accounting v2 Phase 1.1: safe manual payment recording */
(function(){
  const $ = (id)=>document.getElementById(id);
  const state = { summary:null, revenue:[], payouts:[], payoutTechs:{}, selectedPayoutId:null, deposits:null, audit:[], tab:'overview' };
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
  async function postJson(url, body){
    if (window.apiFetch) return window.apiFetch(url, { method:'POST', body: JSON.stringify(body || {}) });
    const res = await fetch(url, { method:'POST', credentials:'include', headers:{ 'Content-Type':'application/json', 'x-user-role':'admin' }, body: JSON.stringify(body || {}) });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.payload = data;
      throw err;
    }
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
  function revenueStatusLabel(s){
    const v = String(s || '').toLowerCase();
    if (v === 'paid') return 'รับเงินแล้ว';
    if (v === 'partial') return 'รับบางส่วน';
    return 'ยังไม่รับเงิน';
  }
  function payoutStatusLabel(s){
    const v = String(s || '').toLowerCase();
    if (v === 'paid') return 'จ่ายช่างแล้ว';
    if (v === 'partial') return 'จ่ายช่างบางส่วน';
    return 'ยังไม่จ่ายช่าง';
  }
  function revenueStatusBadge(s){
    const v = String(s || '').toLowerCase();
    return badge(revenueStatusLabel(v), v === 'paid' ? 'ok' : (v === 'partial' ? 'warn' : 'bad'));
  }
  function payoutStatusBadge(s){
    const v = String(s || '').toLowerCase();
    return badge(payoutStatusLabel(v), v === 'paid' ? 'ok' : (v === 'partial' ? 'warn' : 'bad'));
  }
  function auditActionLabel(action){
    const v = String(action || '');
    if (v === 'MARK_REVENUE_PAID') return 'บันทึกรับเงินลูกค้า';
    if (v === 'MARK_PAYOUT_PAID') return 'บันทึกจ่ายเงินช่าง';
    return v || '-';
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
  function cleanError(e){
    const msg = String(e?.payload?.error || e?.message || e || '');
    if (msg.includes('CONFIRM_RECEIVED_REQUIRED')) return 'กรุณาติ๊กยืนยันว่าได้รับเงินจริงแล้ว';
    if (msg.includes('CONFIRM_PAID_REQUIRED')) return 'กรุณาติ๊กยืนยันว่าได้โอน/จ่ายเงินจริงแล้ว';
    if (msg.includes('PAID_AMOUNT_EXCEEDS_REMAINING')) return 'ยอดที่จ่ายมากกว่ายอดคงเหลือ';
    if (msg.includes('PAYOUT_ALREADY_PAID')) return 'รายการนี้จ่ายครบแล้ว';
    if (msg.includes('ACCOUNTING_PERMISSION_REQUIRED')) return 'บัญชีนี้ยังไม่มีสิทธิ์ทำรายการนี้';
    if (msg.includes('JOB_NOT_COMPLETED')) return 'งานนี้ยังไม่เสร็จ จึงบันทึกรับเงินจากหน้านี้ไม่ได้';
    if (msg.includes('CANNOT_MARK_CANCELED_JOB_PAID')) return 'งานที่ยกเลิกแล้วไม่สามารถบันทึกรับเงินได้';
    return 'บันทึกไม่สำเร็จ กรุณาลองใหม่';
  }
  function closeModal(){
    const modal = $('accountingModal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    modal.onclick = null;
    modal.innerHTML = '';
  }
  function openModal(html, onSubmit){
    const modal = $('accountingModal');
    if (!modal) return;
    modal.innerHTML = `<div class="modalCard" role="dialog" aria-modal="true">${html}</div>`;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    modal.querySelector('[data-close]')?.addEventListener('click', closeModal);
    modal.onclick = (ev)=>{ if (ev.target === modal) closeModal(); };
    modal.querySelector('form')?.addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      const err = modal.querySelector('[data-error]');
      if (err) err.textContent = '';
      try {
        await onSubmit(new FormData(ev.currentTarget), err);
      } catch (e) {
        if (err) err.textContent = cleanError(e);
      }
    });
    setTimeout(()=>modal.querySelector('input,select,textarea,button')?.focus(), 0);
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
          <small>ยอดขาย ${money(r.gross_sales_amount)} บาท • ช่องทางรับเงิน ${esc(r.payment_method || '-')} • อ้างอิง ${esc(r.payment_reference || '-')}</small>
          <small>สถานะรับเงินลูกค้า: ${esc(revenueStatusLabel(r.payment_status))}${r.paid_at ? ` • รับเมื่อ ${esc(dateTH(r.paid_at))}` : ''}</small>
        </div>
        <div style="display:grid;gap:6px;justify-items:end">
          ${revenueStatusBadge(r.payment_status)}
          ${badge(Object.keys(r.document_status || {}).length ? 'มีเอกสาร' : 'ยังไม่มีเอกสาร', Object.keys(r.document_status || {}).length ? 'ok' : 'warn')}
          ${String(r.payment_status || '').toLowerCase() === 'paid'
            ? `<button class="disabledBtn" type="button" disabled>รับเงินแล้ว</button>`
            : `<button class="goBtn" type="button" data-mark-revenue-paid="${esc(r.job_id)}">บันทึกรับเงินแล้ว</button>`}
          <button class="goBtn" type="button" onclick="location.href='/admin-job-view-v2.html?job_id=${encodeURIComponent(r.job_id)}'">${esc(r.action_label || 'ดูรายละเอียด')}</button>
        </div>
      </div>
    `).join('') : empty('ยังไม่มีรายรับจากงานที่เสร็จแล้ว');
    el.querySelectorAll('[data-mark-revenue-paid]').forEach(btn=>{
      btn.addEventListener('click', ()=>openRevenuePaidModal(btn.dataset.markRevenuePaid));
    });
  }
  function openRevenuePaidModal(jobId){
    const row = (state.revenue || []).find(r => String(r.job_id) === String(jobId));
    openModal(`
      <form class="formGrid">
        <h3>ยืนยันการรับเงิน</h3>
        <p>กรุณายืนยันว่าได้รับเงินจริงจากลูกค้าแล้ว ก่อนบันทึกสถานะรับเงิน</p>
        <label>ช่องทางรับเงิน
          <input class="input" name="payment_method" placeholder="เช่น โอน, เงินสด, QR" value="${esc(row?.payment_method || '')}">
        </label>
        <label>เลขอ้างอิง/หมายเหตุ
          <input class="input" name="payment_reference" placeholder="เลขสลิป / เลขรายการ" value="${esc(row?.payment_reference || '')}">
        </label>
        <label>หมายเหตุ
          <textarea class="input" name="note" placeholder="รายละเอียดเพิ่มเติม"></textarea>
        </label>
        <label class="checkLine"><input type="checkbox" name="confirm_received" value="1"><span>ยืนยันว่าได้รับเงินจริงแล้ว</span></label>
        <div class="softErr" data-error style="display:block;min-height:0"></div>
        <div class="modalActions">
          <button class="ghostBtn" type="button" data-close>ยกเลิก</button>
          <button class="primaryBtn" type="submit">บันทึกรับเงินแล้ว</button>
        </div>
      </form>
    `, async (fd, errEl)=>{
      if (fd.get('confirm_received') !== '1') {
        if (errEl) errEl.textContent = 'กรุณาติ๊กยืนยันว่าได้รับเงินจริงแล้ว';
        return;
      }
      await postJson(`/admin/accounting/revenue/${encodeURIComponent(jobId)}/mark-paid`, {
        payment_method: fd.get('payment_method'),
        payment_reference: fd.get('payment_reference'),
        note: fd.get('note'),
        confirm_received: true,
      });
      closeModal();
      await Promise.all([loadSummary(), loadRevenue(), loadAudit()]);
    });
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
        <div style="display:grid;gap:6px;justify-items:end;text-align:right">
          ${statusBadge(p.status)}
          <small>สุทธิ ${money(p.net_payable)} บาท</small>
          <small>คงเหลือ ${money(p.remaining_amount)} บาท</small>
          <button class="goBtn" type="button" data-load-payout-techs="${esc(p.payout_id)}">ดูรายละเอียด</button>
        </div>
      </div>
    `).join('') : empty('ยังไม่มีงวดจ่ายช่าง');
    el.querySelectorAll('[data-load-payout-techs]').forEach(btn=>{
      btn.addEventListener('click', ()=>loadPayoutTechs(btn.dataset.loadPayoutTechs));
    });
    renderPayoutTechs();
  }
  function renderPayoutTechs(){
    const el = $('payoutTechs');
    if (!el) return;
    const payoutId = state.selectedPayoutId;
    if (!payoutId) {
      el.innerHTML = '';
      return;
    }
    const rows = state.payoutTechs[payoutId] || [];
    el.innerHTML = `
      <div class="box">
        <h3>รายละเอียดงวด ${esc(payoutId)}</h3>
        <div class="list">
          ${rows.length ? rows.map(t=>{
            const remaining = Number(t.remaining_amount || 0);
            const paid = String(t.paid_status || '').toLowerCase() === 'paid' || remaining <= 0.0001;
            return `
              <div class="row">
                <div>
                  <b>${esc(t.technician_username || '-')}</b>
                  <small>จำนวนงาน ${money(t.job_count)} • รายได้ก่อนหัก ${money(t.gross_amount)} บาท • หักเงินประกัน ${money(t.deposit_deduction_amount)} บาท</small>
                  <small>ปรับยอด ${money(t.adj_total)} บาท • ยอดสุทธิ ${money(t.net_amount)} บาท • จ่ายแล้ว ${money(t.paid_amount)} บาท • คงเหลือ ${money(t.remaining_amount)} บาท</small>
                  <small>สถานะจ่ายเงินช่าง: ${esc(payoutStatusLabel(t.paid_status))}${t.paid_at ? ` • จ่ายเมื่อ ${esc(dateTH(t.paid_at))}` : ''}</small>
                </div>
                <div style="display:grid;gap:6px;justify-items:end">
                  ${payoutStatusBadge(t.paid_status)}
                  ${paid
                    ? `<button class="disabledBtn" type="button" disabled>จ่ายช่างแล้ว</button>`
                    : `<button class="goBtn" type="button" data-pay-payout="${esc(payoutId)}" data-tech="${esc(t.technician_username)}" data-remaining="${esc(t.remaining_amount)}">บันทึกจ่ายแล้ว</button>`}
                </div>
              </div>
            `;
          }).join('') : empty('ยังไม่มีรายละเอียดช่างในงวดนี้')}
        </div>
      </div>`;
    el.querySelectorAll('[data-pay-payout]').forEach(btn=>{
      btn.addEventListener('click', ()=>openPayoutPaidModal(btn.dataset.payPayout, btn.dataset.tech, btn.dataset.remaining));
    });
    try { el.scrollIntoView({ behavior:'smooth', block:'start' }); } catch (_) {}
  }
  async function loadPayoutTechs(payoutId){
    state.selectedPayoutId = payoutId;
    setLoading('payoutTechs', 'กำลังโหลดรายละเอียดงวดจ่ายช่าง...');
    const r = await getJson(`/admin/accounting/payouts/${encodeURIComponent(payoutId)}/techs`);
    state.payoutTechs[payoutId] = r.rows || [];
    renderPayoutTechs();
    showErrors([r]);
  }
  function openPayoutPaidModal(payoutId, tech, remaining){
    openModal(`
      <form class="formGrid">
        <h3>ยืนยันการจ่ายเงินช่าง</h3>
        <p>ระบบไม่โอนเงินอัตโนมัติ กรุณาโอนเงินจริงก่อน แล้วจึงบันทึกจ่ายแล้ว</p>
        <label>ยอดที่จ่าย
          <input class="input" name="paid_amount" type="number" min="0.01" step="0.01" value="${esc(remaining || '')}">
        </label>
        <label>ช่องทางจ่าย
          <input class="input" name="payment_method" placeholder="เช่น โอนธนาคาร, เงินสด">
        </label>
        <label>เลขอ้างอิงหรือหมายเหตุ
          <input class="input" name="payment_reference" placeholder="เลขสลิป / เลขรายการ">
        </label>
        <label>slip_url
          <input class="input" name="slip_url" placeholder="URL หลักฐานการโอน (ถ้ามี)">
        </label>
        <label>หมายเหตุ
          <textarea class="input" name="note" placeholder="รายละเอียดเพิ่มเติม"></textarea>
        </label>
        <label class="checkLine"><input type="checkbox" name="confirm_paid" value="1"><span>ยืนยันว่าได้โอน/จ่ายเงินจริงแล้ว</span></label>
        <div class="softErr" data-error style="display:block;min-height:0"></div>
        <div class="modalActions">
          <button class="ghostBtn" type="button" data-close>ยกเลิก</button>
          <button class="primaryBtn" type="submit">บันทึกจ่ายแล้ว</button>
        </div>
      </form>
    `, async (fd, errEl)=>{
      if (fd.get('confirm_paid') !== '1') {
        if (errEl) errEl.textContent = 'กรุณาติ๊กยืนยันว่าได้โอน/จ่ายเงินจริงแล้ว';
        return;
      }
      await postJson(`/admin/accounting/payouts/${encodeURIComponent(payoutId)}/pay`, {
        technician_username: tech,
        paid_amount: fd.get('paid_amount'),
        payment_method: fd.get('payment_method'),
        payment_reference: fd.get('payment_reference'),
        slip_url: fd.get('slip_url'),
        note: fd.get('note'),
        confirm_paid: true,
      });
      closeModal();
      await Promise.all([loadSummary(), loadPayouts(), loadAudit()]);
      await loadPayoutTechs(payoutId);
    });
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
      <div class="row"><div><b>${esc(auditActionLabel(r.action))}</b><small>${esc(r.entity_type || '-')} #${esc(r.entity_id || '-')} • ${esc(r.actor_username || '-')} (${esc(r.actor_role || '-')}) • ${esc(r.note || '')}</small></div><small>${esc(dateTH(r.created_at))}</small></div>
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
