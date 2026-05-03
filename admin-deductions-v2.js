(function(){
  const $ = (id) => document.getElementById(id);
  const warn = 'ยอดนี้ยังไม่ถูกนำไปรวมในรอบจ่ายเงิน จนกว่าจะกดนำเข้ารอบจ่าย';
  const types = ['late_arrival','missing_status_update','missing_required_photos','poor_work_quality','customer_complaint_valid','left_before_complete','no_show','same_day_cancel','warranty_rework_minor','warranty_rework_major','rework_failed','replacement_technician_cost','customer_property_damage','company_equipment_damage','off_platform_payment','confidentiality_breach','fraud_or_false_report','deposit_installment','deposit_damage_offset','manual_adjustment','overpayment_recovery'];
  const reworkTypes = ['water_leak','not_clean','customer_complaint','missing_photos','same_issue_not_fixed','poor_work_standard','other'];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const date = (s) => s ? new Date(s).toLocaleString('th-TH') : '-';
  const chip = (v) => `<span class="chip ${['high','critical','voided','rejected','failed'].includes(String(v))?'danger':(['approved','resolved','fixed'].includes(String(v))?'ok':(['pending_approval','open','in_progress'].includes(String(v))?'warn':''))}">${esc(v || '-')}</span>`;
  async function api(url, opts){
    const r = await fetch(url, { credentials:'same-origin', headers:{ 'Content-Type':'application/json', ...(opts&&opts.headers||{}) }, ...opts });
    const data = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(data.error || data.message || `HTTP ${r.status}`);
    return data;
  }
  function qs(obj){
    const p = new URLSearchParams();
    Object.entries(obj).forEach(([k,v]) => { if (v !== undefined && v !== null && String(v).trim() !== '') p.set(k, String(v).trim()); });
    return p.toString();
  }
  function openModal(title, html){ $('modalTitle').textContent = title; $('modalBody').innerHTML = html; $('modalBackdrop').style.display = 'block'; }
  function closeModal(){ $('modalBackdrop').style.display = 'none'; $('modalBody').innerHTML = ''; }
  function fillOptions(){
    $('fType').innerHTML = '<option value="">ทั้งหมด</option>' + types.map(x=>`<option>${x}</option>`).join('');
    $('rType').innerHTML = '<option value="">ทั้งหมด</option>' + reworkTypes.map(x=>`<option>${x}</option>`).join('');
  }
  async function loadSummary(){
    const d = await api('/admin/deductions/summary');
    const top = (d.top_technicians_by_cases || [])[0];
    const cards = [
      ['จำนวนเคสรออนุมัติ', d.pending_count || 0],
      ['ยอดหักรออนุมัติ', money(d.pending_amount)],
      ['ยอดหักอนุมัติแล้ว', money(d.approved_amount)],
      ['งานแก้ไขค้าง', d.open_rework_count || 0],
      ['เคสรุนแรง High/Critical', d.high_critical_count || 0],
      ['ช่างที่มีเคสผิดกฎมากที่สุด', top ? `${esc(top.technician_username)} (${top.case_count})` : '-'],
    ];
    $('summaryCards').innerHTML = cards.map(([k,v]) => `<article class="card"><div class="k">${k}</div><div class="v">${v}</div></article>`).join('');
  }
  async function loadDeductions(){
    const query = qs({ from:$('fFrom').value, to:$('fTo').value, technician_username:$('fTech').value, status:$('fStatus').value, deduction_type:$('fType').value, severity:$('fSeverity').value, job_id:$('fJob').value, pending_approval:$('fPending').value });
    const d = await api('/admin/deductions' + (query ? `?${query}` : ''));
    const rows = d.rows || [];
    $('deductionRows').innerHTML = rows.length ? rows.map(r => `
      <tr>
        <td><b>${esc(r.case_code)}</b></td><td>${esc(r.technician_username)}</td>
        <td>${r.job_id ? `<a href="/admin-job-view-v2.html?job_id=${encodeURIComponent(r.job_id)}">#${esc(r.job_id)}</a>` : '-'}</td>
        <td>${esc(r.deduction_type)}</td><td><b>${money(r.amount)}</b></td><td>${esc(r.reason)}</td>
        <td>${chip(r.severity)}</td><td>${chip(r.status)}</td><td>${date(r.created_at)}</td>
        <td><div class="actions">${actionsFor(r)}</div></td>
      </tr>`).join('') : `<tr><td colspan="10" class="empty">ยังไม่มีเคส</td></tr>`;
  }
  function actionsFor(r){
    const id = Number(r.case_id);
    const a = [`<button class="btn soft" data-detail="${id}">ดูรายละเอียด</button>`];
    if (r.status === 'open') a.push(`<button class="btn soft" data-edit="${id}">แก้ไข</button>`,`<button class="btn blue" data-submit="${id}">ส่งอนุมัติ</button>`);
    if (r.status === 'pending_approval') a.push(`<button class="btn blue" data-approve="${id}">อนุมัติ</button>`,`<button class="btn yellow" data-reject="${id}">ปฏิเสธ</button>`);
    if (['open','pending_approval','approved'].includes(r.status)) a.push(`<button class="btn danger" data-void="${id}">ยกเลิก</button>`);
    return a.join('');
  }
  function deductionForm(row){
    return `<div class="form-grid">
      <div><label>ช่าง</label><input id="mTech" value="${esc(row?.technician_username || '')}"></div>
      <div><label>งาน optional</label><input id="mJob" value="${esc(row?.job_id || '')}" placeholder="job_id"></div>
      <div><label>ประเภทหักเงิน</label><select id="mType">${types.map(t=>`<option ${row?.deduction_type===t?'selected':''}>${t}</option>`).join('')}</select></div>
      <div><label>จำนวนเงิน</label><input id="mAmount" type="number" min="0" step="0.01" value="${esc(row?.amount || '')}"></div>
      <div><label>severity</label><select id="mSeverity">${['low','medium','high','critical'].map(s=>`<option ${String(row?.severity||'medium')===s?'selected':''}>${s}</option>`).join('')}</select></div>
      <div class="full"><label>เหตุผล</label><textarea id="mReason" rows="3">${esc(row?.reason || '')}</textarea></div>
      <div class="full"><label>หลักฐาน/หมายเหตุหลักฐาน</label><textarea id="mEvidence" rows="3">${esc(JSON.stringify(row?.evidence_json || []))}</textarea></div>
      <div class="full notice">${warn}</div>
      <div class="full actions"><button class="btn blue" id="mSave">${row ? 'บันทึก' : 'สร้างเคส'}</button></div>
    </div>`;
  }
  function readDeductionForm(){
    return { technician_username:$('mTech')?.value, job_id:$('mJob')?.value, deduction_type:$('mType')?.value, amount:Number($('mAmount')?.value || 0), reason:$('mReason')?.value, severity:$('mSeverity')?.value, evidence_json:$('mEvidence')?.value };
  }
  async function createDeduction(prefill){
    openModal('สร้างเคสหักเงิน', deductionForm(prefill || null));
    $('mSave').onclick = async () => { await api('/admin/deductions', { method:'POST', body:JSON.stringify(readDeductionForm()) }); closeModal(); await loadAll(); };
  }
  async function detail(id){
    const d = await api(`/admin/deductions/${id}`);
    openModal(`รายละเอียด ${d.row.case_code}`, `<div class="notice">${warn}</div><pre>${esc(JSON.stringify(d, null, 2))}</pre>`);
  }
  async function edit(id){
    const d = await api(`/admin/deductions/${id}`);
    openModal(`แก้ไข ${d.row.case_code}`, deductionForm(d.row));
    $('mTech').disabled = true;
    $('mSave').onclick = async () => { await api(`/admin/deductions/${id}`, { method:'PATCH', body:JSON.stringify(readDeductionForm()) }); closeModal(); await loadAll(); };
  }
  async function transition(id, action, needNote){
    const note = needNote ? prompt('ระบุเหตุผล') : '';
    if (needNote && !note) return;
    if (!confirm('ยืนยันดำเนินการ?')) return;
    await api(`/admin/deductions/${id}/${action}`, { method:'POST', body:JSON.stringify({ note }) });
    await loadAll();
  }
  async function loadRework(){
    const query = qs({ status:$('rStatus').value, technician_username:$('rTech').value, job_id:$('rJob').value, reason_type:$('rType').value });
    const d = await api('/admin/rework_cases' + (query ? `?${query}` : ''));
    const rows = d.rows || [];
    $('reworkRows').innerHTML = rows.length ? rows.map(r => `
      <tr><td><b>${esc(r.case_code)}</b></td><td>#${esc(r.job_id)}</td><td>${esc(r.technician_username||'-')}</td><td>${esc(r.reason_type)}</td><td>${chip(r.status)}</td><td>${chip(r.resolution||'-')}</td><td>${date(r.created_at)}</td><td><div class="actions"><button class="btn soft" data-rdetail="${r.rework_case_id}">ดู</button>${r.status!=='resolved'?`<button class="btn blue" data-resolve="${r.rework_case_id}">ปิดเคส</button>`:''}</div></td></tr>`).join('') : `<tr><td colspan="8" class="empty">ยังไม่มีเคสงานแก้ไข</td></tr>`;
  }
  async function reworkDetail(id){
    const d = await api(`/admin/rework_cases/${id}`);
    openModal(`งานแก้ไข ${d.row.case_code}`, `<pre>${esc(JSON.stringify(d, null, 2))}</pre>`);
  }
  async function resolveRework(id){
    openModal('ปิดเคสงานแก้ไข', `<div class="form-grid">
      <div><label>resolution</label><select id="rwResolution"><option>fixed</option><option>failed</option><option>changed_technician</option><option>company_absorbed</option><option>deduction_required</option></select></div>
      <div><label>revisit_result</label><input id="rwResult" placeholder="optional"></div>
      <div class="full"><label>revisit_note</label><textarea id="rwNote" rows="3"></textarea></div>
      <div class="full"><label><input id="rwCreateDeduction" type="checkbox" style="width:auto;min-height:auto"> สร้างเคสหักเงินที่เชื่อมกับงานแก้ไข</label></div>
      <div><label>ประเภทหักเงิน</label><select id="rwType">${types.map(t=>`<option>${t}</option>`).join('')}</select></div>
      <div><label>จำนวนเงิน</label><input id="rwAmount" type="number" min="0" step="0.01"></div>
      <div><label>severity</label><select id="rwSeverity"><option>medium</option><option>low</option><option>high</option><option>critical</option></select></div>
      <div class="full"><label>เหตุผลหักเงิน</label><textarea id="rwDeductReason" rows="2"></textarea></div>
      <div class="full notice">${warn}</div><div class="full actions"><button class="btn blue" id="rwSave">ปิดเคส</button></div>
    </div>`);
    $('rwSave').onclick = async () => {
      await api(`/admin/rework_cases/${id}/resolve`, { method:'POST', body:JSON.stringify({ resolution:$('rwResolution').value, revisit_result:$('rwResult').value, revisit_note:$('rwNote').value, create_deduction:$('rwCreateDeduction').checked, deduction_type:$('rwType').value, amount:Number($('rwAmount').value||0), severity:$('rwSeverity').value, deduction_reason:$('rwDeductReason').value }) });
      closeModal(); await loadAll();
    };
  }
  async function loadAudit(){
    const query = qs({ entity_type:$('aEntityType').value, entity_id:$('aEntityId').value, actor_username:$('aActor').value });
    const d = await api('/admin/deductions/audit' + (query ? `?${query}` : ''));
    const rows = d.rows || [];
    $('auditRows').innerHTML = rows.length ? rows.map(r => `<tr><td>${date(r.created_at)}</td><td>${esc(r.actor_username||'-')}<br><span class="chip">${esc(r.actor_role||'-')}</span></td><td>${esc(r.action)}</td><td>${esc(r.entity_type)} #${esc(r.entity_id||'-')}</td><td>${esc(r.note||'')}</td></tr>`).join('') : `<tr><td colspan="5" class="empty">ยังไม่มี audit</td></tr>`;
  }
  async function loadAll(){ await Promise.all([loadSummary(), loadDeductions(), loadRework(), loadAudit()]); }
  document.addEventListener('click', async (ev) => {
    const t = ev.target?.closest?.('[data-tab],[data-detail],[data-edit],[data-submit],[data-approve],[data-reject],[data-void],[data-rdetail],[data-resolve]');
    if (!t) return;
    if (t.matches('[data-tab]')) {
      document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(x=>x.style.display='none'); $(`panel-${t.dataset.tab}`).style.display = '';
    }
    if (t.dataset.detail) detail(t.dataset.detail);
    if (t.dataset.edit) edit(t.dataset.edit);
    if (t.dataset.submit) transition(t.dataset.submit, 'submit');
    if (t.dataset.approve) transition(t.dataset.approve, 'approve');
    if (t.dataset.reject) transition(t.dataset.reject, 'reject', true);
    if (t.dataset.void) transition(t.dataset.void, 'void', true);
    if (t.dataset.rdetail) reworkDetail(t.dataset.rdetail);
    if (t.dataset.resolve) resolveRework(t.dataset.resolve);
  });
  function bind(){
    fillOptions();
    $('modalClose').onclick = closeModal;
    $('modalBackdrop').addEventListener('click', e => { if (e.target === $('modalBackdrop')) closeModal(); });
    $('btnCreateDeduction').onclick = () => createDeduction();
    $('btnLoad').onclick = loadDeductions;
    $('btnLoadRework').onclick = loadRework;
    $('btnLoadAudit').onclick = loadAudit;
    $('btnClear').onclick = () => { ['fFrom','fTo','fTech','fStatus','fType','fSeverity','fJob','fPending'].forEach(id => $(id).value=''); loadDeductions(); };
    loadAll().catch(e => alert(e.message));
  }
  document.addEventListener('DOMContentLoaded', bind);
})();
