(function(){
  const DOCS = [['id_card','บัตรประชาชน'],['profile_photo','รูปโปรไฟล์'],['bank_book','หน้าสมุดบัญชี'],['tools_photo','รูปเครื่องมือ'],['vehicle_photo','รูปยานพาหนะ'],['certificate_or_portfolio','ใบรับรอง/ผลงาน'],['other','เอกสารอื่น']];
  const STATUS = {uploaded:'อัปโหลดแล้ว',approved:'ผ่านแล้ว',rejected:'ไม่ผ่าน',need_reupload:'ขออัปโหลดใหม่',submitted:'ส่งใบสมัครแล้ว',under_review:'กำลังตรวจ',need_more_documents:'ขอเอกสารเพิ่ม',approved_for_training:'อนุมัติเข้าอบรม',rejected_app:'ไม่ผ่าน'};
  const $ = id => document.getElementById(id);
  let current = null;
  function badge(text, cls){ return `<span class="badge ${cls || ''}">${text}</span>`; }
  function msg(t){ $('message').textContent = t || ''; }
  async function json(url, opts){
    const res = await fetch(url, opts);
    const data = await res.json().catch(()=>null);
    if (!res.ok) throw new Error(data?.error || 'Request failed');
    return data;
  }
  function render(data){
    current = data;
    const app = data.application;
    $('statusPanel').classList.remove('hidden'); $('docsPanel').classList.remove('hidden');
    $('appName').textContent = app.full_name || '-';
    $('appMeta').textContent = `${app.application_code} • ${app.phone} • ${app.technician_username || 'ยังไม่ผูกบัญชี'}`;
    $('appStatus').textContent = STATUS[app.status] || app.status || '-';
    $('agreementLink').href = `/partner-agreement?code=${encodeURIComponent(app.application_code)}`;
    $('academyLink').href = `/partner-academy?code=${encodeURIComponent(app.application_code)}`;
    const stages = [
      ['สมัครแล้ว', true],
      ['เอกสารรอตรวจ', data.stages?.documents_pending],
      ['เซ็นสัญญาแล้ว', data.stages?.agreement_signed],
      ['Basic Partner Training', data.stages?.basic_training_done],
      ['Basic Exam', data.stages?.exam_passed],
      ['Certification รายประเภท', data.stages?.real_jobs_unlocked],
    ];
    $('stageGrid').innerHTML = stages.map(([label, ok]) => `<div class="card"><b>${label}</b><div style="margin-top:8px">${badge(ok ? 'ผ่าน/พร้อม' : 'รอดำเนินการ', ok ? 'ok' : 'warn')}</div></div>`).join('');
    const latest = new Map((app.documents || []).map(d => [d.document_type, d]));
    $('documentCards').innerHTML = DOCS.map(([type,label]) => {
      const d = latest.get(type);
      return `<div class="doc"><b>${label}</b><div style="margin:8px 0">${d ? badge(STATUS[d.status] || d.status, d.status === 'approved' ? 'ok' : d.status === 'rejected' ? 'bad' : 'warn') : badge('ยังไม่อัปโหลด','warn')}</div><div class="muted">${d?.original_filename || ''}</div>${d?.admin_note ? `<div class="muted">หมายเหตุ: ${d.admin_note}</div>` : ''}<input type="file" data-doc="${type}" accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf" style="margin-top:8px"><button class="ghost" data-upload="${type}" type="button" style="margin-top:8px">อัปโหลด</button></div>`;
    }).join('');
  }
  async function load(){
    const code = $('applicationCode').value.trim();
    const phone = $('phone').value.trim();
    if (!code || !phone) throw new Error('กรุณากรอกรหัสอ้างอิงและเบอร์โทร');
    const data = await json(`/partner/status?application_code=${encodeURIComponent(code)}&phone=${encodeURIComponent(phone)}`);
    render(data);
  }
  async function upload(type){
    if (!current) throw new Error('กรุณาโหลดสถานะก่อน');
    const input = document.querySelector(`input[data-doc="${CSS.escape(type)}"]`);
    const file = input?.files?.[0];
    if (!file) throw new Error('กรุณาเลือกไฟล์');
    const fd = new FormData();
    fd.append('document_type', type); fd.append('document', file);
    const res = await fetch(`/partner/application/${encodeURIComponent(current.application.application_code)}/documents`, { method:'POST', body:fd });
    const data = await res.json().catch(()=>null);
    if (!res.ok) throw new Error(data?.error || 'อัปโหลดไม่สำเร็จ');
    await load();
  }
  $('btnLoad').addEventListener('click', () => load().catch(e => msg(e.message)));
  $('documentCards').addEventListener('click', e => {
    const btn = e.target.closest('[data-upload]');
    if (btn) upload(btn.dataset.upload).catch(err => alert(err.message));
  });
  const qs = new URLSearchParams(location.search);
  let ref = {};
  try { ref = JSON.parse(sessionStorage.getItem('cwf_partner_ref') || '{}'); } catch(e) {}
  $('applicationCode').value = qs.get('code') || qs.get('application_code') || ref.code || '';
  $('phone').value = qs.get('phone') || ref.phone || '';
  if ($('applicationCode').value && $('phone').value) load().catch(e => msg(e.message));
})();
