(function(){
  const STATUS_LABELS = {
    draft:'ร่าง',
    submitted:'ส่งใบสมัครแล้ว',
    under_review:'กำลังตรวจสอบ',
    need_more_documents:'ขอเอกสารเพิ่ม',
    rejected:'ไม่ผ่าน',
    approved_for_training:'อนุมัติเข้าอบรม',
    uploaded:'อัปโหลดแล้ว',
    approved:'อนุมัติ',
    need_reupload:'ขออัปโหลดใหม่'
  };
  const DOC_LABELS = {
    id_card:'บัตรประชาชน',
    profile_photo:'รูปโปรไฟล์',
    bank_book:'หน้าสมุดบัญชี',
    tools_photo:'รูปเครื่องมือ',
    vehicle_photo:'รูปยานพาหนะ',
    certificate_or_portfolio:'ใบรับรอง/ผลงาน',
    other:'เอกสารอื่น'
  };
  const DOC_STATUSES = ['uploaded','approved','rejected','need_reupload'];

  let activeId = null;
  let activeDetail = null;

  const $ = (id)=>document.getElementById(id);
  const esc = (s)=>String(s ?? '').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const fmtDate = (v)=>v ? new Date(v).toLocaleString('th-TH', { dateStyle:'medium', timeStyle:'short' }) : '-';
  const badge = (s)=>`<span class="status ${esc(s)}">${esc(STATUS_LABELS[s] || s || '-')}</span>`;
  const asList = (v)=>Array.isArray(v) ? v : [];

  async function api(url, opts){
    if (window.apiFetch) return window.apiFetch(url, opts);
    const res = await fetch(url, { credentials:'include', headers:{'Content-Type':'application/json'}, ...(opts||{}) });
    const data = await res.json().catch(()=>null);
    if (!res.ok) throw new Error(data?.error || 'Request failed');
    return data;
  }

  function renderList(rows){
    const box = $('applicationList');
    if (!rows.length) {
      box.innerHTML = '<div class="muted">ไม่พบใบสมัคร</div>';
      return;
    }
    box.innerHTML = rows.map(r=>`
      <div class="item" data-id="${esc(r.id)}">
        <div class="itemTop">
          <div>
            <b>${esc(r.full_name)}</b>
            <div class="muted">${esc(r.application_code)} • ${esc(r.phone || '-')}</div>
          </div>
          ${badge(r.status)}
        </div>
        <div class="chips">
          <span class="chip">เอกสาร ${Number(r.document_count || 0)}</span>
          <span class="chip">ผ่าน ${Number(r.approved_document_count || 0)}</span>
          ${Number(r.problem_document_count || 0) ? `<span class="chip">ต้องดู ${Number(r.problem_document_count || 0)}</span>` : ''}
        </div>
        <div class="muted" style="margin-top:8px">ส่งเมื่อ ${fmtDate(r.submitted_at || r.created_at)}</div>
      </div>
    `).join('');
  }

  async function loadList(){
    const params = new URLSearchParams();
    const status = $('statusFilter').value;
    const q = $('searchInput').value.trim();
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    const data = await api(`/admin/partners/applications?${params.toString()}`);
    renderList(data.applications || []);
  }

  function kv(label, value){
    return `<div style="margin:0 0 8px"><div class="muted">${esc(label)}</div><b>${esc(value || '-')}</b></div>`;
  }

  function renderDetail(data){
    activeDetail = data;
    const a = data.application;
    activeId = a.id;
    $('detailCode').textContent = a.application_code || '-';
    $('detailName').textContent = a.full_name || '-';
    $('applicationStatus').value = a.status || 'submitted';
    $('applicationNote').value = a.admin_note || '';
    $('detailInfo').innerHTML = `
      <div class="grid2">
        <div>${kv('เบอร์โทร', a.phone)}${kv('LINE ID', a.line_id)}${kv('อีเมล', a.email)}${kv('ประสบการณ์', a.experience_years == null ? '-' : `${a.experience_years} ปี`)}</div>
        <div>${kv('ยานพาหนะ', a.has_vehicle ? 'มี' : 'ไม่มี/ไม่ระบุ')}${kv('ประเภทยานพาหนะ', a.vehicle_type)}${kv('ธนาคาร', a.bank_name)}${kv('เลขบัญชี 4 ตัวท้าย', a.bank_account_last4)}</div>
      </div>
      ${kv('ที่อยู่', a.address_text)}
      <div class="chips">${asList(a.service_zones).map(x=>`<span class="chip">${esc(x)}</span>`).join('') || '<span class="chip">ไม่ระบุโซน</span>'}</div>
      <div class="chips">${asList(a.preferred_job_types).map(x=>`<span class="chip">${esc(x)}</span>`).join('') || '<span class="chip">ไม่ระบุประเภทงาน</span>'}</div>
      ${a.equipment_notes ? kv('อุปกรณ์', a.equipment_notes) : ''}
      ${a.notes ? kv('หมายเหตุผู้สมัคร', a.notes) : ''}
    `;
    renderDocuments(data.documents || []);
    renderEvents(data.events || []);
    $('detailDrawer').classList.add('open');
  }

  function renderDocuments(docs){
    $('documents').innerHTML = docs.length ? docs.map(d=>{
      const options = DOC_STATUSES.map(s=>`<option value="${s}" ${s === d.status ? 'selected' : ''}>${esc(STATUS_LABELS[s] || s)}</option>`).join('');
      return `
        <div class="doc" data-doc-id="${esc(d.id)}">
          <div class="docTop">
            <div>
              <b>${esc(DOC_LABELS[d.document_type] || d.document_type)}</b>
              <div class="muted">${esc(d.original_filename || '-')} • ${fmtDate(d.uploaded_at || d.created_at)}</div>
              ${d.public_url ? `<a href="${esc(d.public_url)}" target="_blank" rel="noopener">เปิดไฟล์</a>` : ''}
            </div>
            ${badge(d.status)}
          </div>
          <div class="grid3" style="margin-top:8px">
            <div><label>สถานะเอกสาร</label><select data-doc-status>${options}</select></div>
            <div style="grid-column:span 2"><label>หมายเหตุ</label><input data-doc-note value="${esc(d.admin_note || '')}"></div>
          </div>
          <div style="margin-top:8px"><button class="ghost" type="button" data-save-doc="${esc(d.id)}">บันทึกเอกสาร</button></div>
        </div>`;
    }).join('') : '<div class="muted">ยังไม่มีเอกสาร</div>';
  }

  function renderEvents(events){
    $('events').innerHTML = events.length ? events.map(e=>`
      <div class="event">
        <b>${esc(e.event_type)}</b>
        <div class="muted">${fmtDate(e.created_at)} • ${esc(e.actor_username || e.actor_type || '-')}</div>
        <div>${e.from_status ? `${esc(STATUS_LABELS[e.from_status] || e.from_status)} -> ` : ''}${e.to_status ? esc(STATUS_LABELS[e.to_status] || e.to_status) : ''}</div>
        ${e.note ? `<div>${esc(e.note)}</div>` : ''}
      </div>
    `).join('') : '<div class="muted">ยังไม่มี timeline</div>';
  }

  async function openDetail(id){
    const data = await api(`/admin/partners/applications/${encodeURIComponent(id)}`);
    renderDetail(data);
  }

  async function saveApplicationStatus(){
    if (!activeId) return;
    const status = $('applicationStatus').value;
    const admin_note = $('applicationNote').value.trim();
    await api(`/admin/partners/applications/${encodeURIComponent(activeId)}/status`, {
      method:'PUT',
      body:JSON.stringify({ status, admin_note })
    });
    await openDetail(activeId);
    await loadList();
  }

  async function saveDocumentStatus(documentId){
    if (!activeId) return;
    const card = document.querySelector(`.doc[data-doc-id="${CSS.escape(String(documentId))}"]`);
    const status = card?.querySelector('[data-doc-status]')?.value || '';
    const admin_note = card?.querySelector('[data-doc-note]')?.value || '';
    await api(`/admin/partners/applications/${encodeURIComponent(activeId)}/documents/${encodeURIComponent(documentId)}/status`, {
      method:'PUT',
      body:JSON.stringify({ status, admin_note })
    });
    await openDetail(activeId);
    await loadList();
  }

  $('btnReload').addEventListener('click', ()=>loadList().catch(err=>alert(err.message)));
  $('statusFilter').addEventListener('change', ()=>loadList().catch(err=>alert(err.message)));
  $('searchInput').addEventListener('keydown', (e)=>{ if(e.key === 'Enter') loadList().catch(err=>alert(err.message)); });
  $('applicationList').addEventListener('click', (e)=>{
    const item = e.target.closest('[data-id]');
    if (item) openDetail(item.getAttribute('data-id')).catch(err=>alert(err.message));
  });
  $('btnClose').addEventListener('click', ()=>$('detailDrawer').classList.remove('open'));
  $('detailDrawer').addEventListener('click', (e)=>{ if(e.target.id === 'detailDrawer') $('detailDrawer').classList.remove('open'); });
  $('btnSaveStatus').addEventListener('click', ()=>saveApplicationStatus().catch(err=>alert(err.message)));
  $('documents').addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-save-doc]');
    if (btn) saveDocumentStatus(btn.getAttribute('data-save-doc')).catch(err=>alert(err.message));
  });

  loadList().catch(err=>alert(err.message));
})();
