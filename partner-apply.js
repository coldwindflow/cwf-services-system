(function(){
  const DOC_TYPES = [
    ['id_card','บัตรประชาชน'],
    ['profile_photo','รูปโปรไฟล์'],
    ['bank_book','หน้าสมุดบัญชี'],
    ['tools_photo','รูปเครื่องมือ'],
    ['vehicle_photo','รูปยานพาหนะ'],
    ['certificate_or_portfolio','ใบรับรอง/ผลงาน'],
    ['other','เอกสารอื่น']
  ];
  const STATUS_LABELS = {
    draft:'ร่าง',
    submitted:'ส่งใบสมัครแล้ว',
    under_review:'กำลังตรวจสอบ',
    need_more_documents:'ขอเอกสารเพิ่ม',
    rejected:'ไม่ผ่านการพิจารณา',
    approved_for_training:'อนุมัติเข้าอบรม',
    uploaded:'อัปโหลดแล้ว',
    approved:'อนุมัติ',
    need_reupload:'ขออัปโหลดใหม่'
  };

  let currentCode = '';
  let currentApplication = null;

  const $ = (id)=>document.getElementById(id);
  const esc = (s)=>String(s ?? '').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const joinList = (v)=>String(v || '').split(',').map(x=>x.trim()).filter(Boolean);
  const fmtDate = (v)=>v ? new Date(v).toLocaleString('th-TH', { dateStyle:'medium', timeStyle:'short' }) : '-';

  async function jsonFetch(url, opts = {}) {
    const res = await fetch(url, {
      ...opts,
      headers: { 'Content-Type':'application/json', ...(opts.headers || {}) },
    });
    const data = await res.json().catch(()=>null);
    if (!res.ok) throw new Error(data?.error || 'Request failed');
    return data;
  }

  function statusBadge(status){
    return `<span class="status ${esc(status)}">${esc(STATUS_LABELS[status] || status || '-')}</span>`;
  }

  function formPayload(){
    return {
      full_name: $('full_name').value.trim(),
      phone: $('phone').value.trim(),
      line_id: $('line_id').value.trim(),
      email: $('email').value.trim(),
      address_text: $('address_text').value.trim(),
      service_zones: joinList($('service_zones').value),
      preferred_job_types: joinList($('preferred_job_types').value),
      experience_years: $('experience_years').value,
      has_vehicle: $('has_vehicle').value === 'true',
      vehicle_type: $('vehicle_type').value.trim(),
      equipment_notes: $('equipment_notes').value.trim(),
      bank_account_name: $('bank_account_name').value.trim(),
      bank_name: $('bank_name').value.trim(),
      bank_account_last4: $('bank_account_last4').value.trim(),
      notes: $('notes').value.trim(),
      consent_pdpa: $('consent_pdpa').checked,
      consent_terms: $('consent_terms').checked,
    };
  }

  function renderDocuments(app){
    const docs = Array.isArray(app?.documents) ? app.documents : [];
    const latest = new Map();
    docs.forEach(d => { if (!latest.has(d.document_type)) latest.set(d.document_type, d); });
    $('documentCards').innerHTML = DOC_TYPES.map(([type,label])=>{
      const d = latest.get(type);
      return `
        <div class="doc">
          <div class="docTop">
            <div><b>${esc(label)}</b>${d ? `<small>${esc(d.original_filename || '')}</small>` : '<small>ยังไม่ได้อัปโหลด</small>'}</div>
            ${d ? statusBadge(d.status) : '<span class="status">รอไฟล์</span>'}
          </div>
          ${d?.admin_note ? `<small>หมายเหตุ: ${esc(d.admin_note)}</small>` : ''}
          <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
            <input type="file" data-doc="${esc(type)}" accept="image/*,.pdf">
            <button class="ghost" type="button" data-upload="${esc(type)}">อัปโหลด</button>
          </div>
        </div>`;
    }).join('');
  }

  function renderStatus(app){
    currentApplication = app;
    currentCode = app?.application_code || currentCode;
    if (currentCode) {
      $('lookupCode').value = currentCode;
      $('applicationCode').textContent = currentCode;
      $('codeBox').style.display = 'block';
    }
    $('statusBox').innerHTML = app ? `
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
        <div>
          <b>${esc(app.full_name)}</b>
          <div class="muted">${esc(app.application_code)} • ${esc(app.phone)}</div>
        </div>
        ${statusBadge(app.status)}
      </div>
      ${app.admin_note ? `<div class="notice" style="margin-top:10px">${esc(app.admin_note)}</div>` : ''}
    ` : '<div class="muted">กรอกรหัสใบสมัครเพื่อดูสถานะ</div>';
    renderDocuments(app);
    const events = Array.isArray(app?.events) ? app.events : [];
    $('timeline').innerHTML = events.length ? events.map(e=>`
      <div class="event">
        <b>${esc(e.event_type)}</b>
        <div class="muted">${fmtDate(e.created_at)}${e.to_status ? ` • ${esc(STATUS_LABELS[e.to_status] || e.to_status)}` : ''}</div>
        ${e.note ? `<div>${esc(e.note)}</div>` : ''}
      </div>
    `).join('') : '<div class="muted">ยังไม่มีข้อมูล</div>';
  }

  async function lookup(code){
    const safe = String(code || '').trim();
    if (!safe) throw new Error('กรุณากรอกรหัสใบสมัคร');
    const data = await jsonFetch(`/partner/application/${encodeURIComponent(safe)}`);
    renderStatus(data.application);
  }

  async function uploadDoc(type){
    if (!currentCode) throw new Error('กรุณาส่งใบสมัครหรือตรวจสถานะก่อน');
    const input = document.querySelector(`input[type=file][data-doc="${CSS.escape(type)}"]`);
    const file = input?.files?.[0];
    if (!file) throw new Error('กรุณาเลือกไฟล์');
    const fd = new FormData();
    fd.append('document_type', type);
    fd.append('document', file);
    const res = await fetch(`/partner/application/${encodeURIComponent(currentCode)}/documents`, { method:'POST', body:fd });
    const data = await res.json().catch(()=>null);
    if (!res.ok) throw new Error(data?.error || 'อัปโหลดไม่สำเร็จ');
    await lookup(currentCode);
  }

  $('applyForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    try {
      const payload = formPayload();
      if (!payload.full_name || !payload.phone) throw new Error('กรุณากรอกชื่อและเบอร์โทร');
      if (!payload.consent_pdpa || !payload.consent_terms) throw new Error('กรุณายอมรับ PDPA และเงื่อนไข');
      const data = await jsonFetch('/partner/apply', { method:'POST', body:JSON.stringify(payload) });
      renderStatus(data.application);
      alert(`ส่งใบสมัครสำเร็จ\nรหัสใบสมัคร: ${data.application.application_code}`);
    } catch(err) {
      alert(err.message || 'ส่งใบสมัครไม่สำเร็จ');
    }
  });

  $('btnReset').addEventListener('click', ()=>{
    $('applyForm').reset();
  });

  $('btnLookup').addEventListener('click', async ()=>{
    try { await lookup($('lookupCode').value); }
    catch(err){ alert(err.message || 'โหลดสถานะไม่สำเร็จ'); }
  });

  $('documentCards').addEventListener('click', async (e)=>{
    const btn = e.target.closest('[data-upload]');
    if (!btn) return;
    try { await uploadDoc(btn.getAttribute('data-upload')); }
    catch(err){ alert(err.message || 'อัปโหลดไม่สำเร็จ'); }
  });

  renderStatus(null);
  const params = new URLSearchParams(location.search);
  const code = params.get('code') || params.get('application_code');
  if (code) lookup(code).catch(()=>{});
})();
