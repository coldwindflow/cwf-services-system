(function(){
  const DOCS = [['id_card','บัตรประชาชน'],['profile_photo','รูปโปรไฟล์'],['bank_book','หน้าสมุดบัญชี'],['tools_photo','รูปเครื่องมือ'],['vehicle_photo','รูปยานพาหนะ'],['certificate_or_portfolio','ใบรับรอง/ผลงาน'],['other','เอกสารอื่น']];
  const STATUS = {uploaded:'อัปโหลดแล้ว',approved:'ผ่านแล้ว',rejected:'ไม่ผ่าน',need_reupload:'ขออัปโหลดใหม่',submitted:'ส่งใบสมัครแล้ว',under_review:'กำลังตรวจ',need_more_documents:'ขอเอกสารเพิ่ม',approved_for_training:'อนุมัติเข้าอบรม',rejected_app:'ไม่ผ่าน'};
  const $ = id => document.getElementById(id);
  let current = null;
  function badge(text, cls){ return `<span class="badge ${cls || ''}">${text}</span>`; }
  function msg(t){ if($('message')) $('message').textContent = t || ''; }
  async function json(url, opts){ const res = await fetch(url, { credentials:'include', ...(opts||{}) }); const data = await res.json().catch(()=>null); if (!res.ok) throw new Error(data?.error || 'Request failed'); return data; }
  function getStoredRef(){ try { return JSON.parse(sessionStorage.getItem('cwf_partner_ref') || '{}'); } catch(e){ return {}; } }
  function getRef(){ const qs = new URLSearchParams(location.search); const ref = getStoredRef(); return { code: qs.get('code') || qs.get('application_code') || ref.code || '', phone: qs.get('phone') || ref.phone || '' }; }
  function saveRef(app){ try { sessionStorage.setItem('cwf_partner_ref', JSON.stringify({ code: app.application_code, phone: app.phone || '' })); } catch(e){} }
  async function loadFromMe(){ const d = await json('/tech/partner-onboarding'); if (!d.partner) throw new Error('ไม่พบข้อมูลพาร์ทเนอร์ในบัญชีนี้'); return d.partner; }
  async function load(){
    const ref = getRef();
    if (ref.code && ref.phone) return json(`/partner/status?application_code=${encodeURIComponent(ref.code)}&phone=${encodeURIComponent(ref.phone)}`);
    return loadFromMe();
  }
  function render(data){
    current = data; const app = data.application || {}; saveRef(app);
    $('loadingPanel')?.classList.add('hidden'); $('statusPanel')?.classList.remove('hidden'); $('docsPanel')?.classList.remove('hidden');
    $('appName').textContent = app.full_name || '-';
    $('appMeta').textContent = `${app.phone || '-'} • ${app.province || '-'} ${app.district || ''}`.trim();
    $('appStatus').textContent = STATUS[app.status] || app.status || '-';
    $('agreementLink').href = `/partner-agreement.html?code=${encodeURIComponent(app.application_code)}`;
    $('academyLink').href = `/partner-academy.html?code=${encodeURIComponent(app.application_code)}`;
    const stages = [['สมัครแล้ว', true],['เอกสาร', !!(app.documents || []).length && !(data.stages?.documents_pending)],['สัญญา', data.stages?.agreement_signed],['อบรม', data.stages?.basic_training_done],['สอบ', data.stages?.exam_passed],['สิทธิ์รับงาน', data.stages?.real_jobs_unlocked]];
    $('stageGrid').innerHTML = stages.map(([label, ok]) => `<div class="stage"><b>${label}</b><div style="margin-top:8px">${badge(ok ? 'ผ่าน/พร้อม' : 'รอดำเนินการ', ok ? 'ok' : 'warn')}</div></div>`).join('');
    const latest = new Map((app.documents || []).map(d => [d.document_type, d]));
    $('documentCards').innerHTML = DOCS.map(([type,label]) => { const d = latest.get(type); return `<div class="doc"><b>${label}</b><div style="margin:8px 0">${d ? badge(STATUS[d.status] || d.status, d.status === 'approved' ? 'ok' : d.status === 'rejected' ? 'bad' : 'warn') : badge('ยังไม่อัปโหลด','warn')}</div><div class="muted">${d?.original_filename || ''}</div>${d?.admin_note ? `<div class="muted">หมายเหตุ: ${d.admin_note}</div>` : ''}<input type="file" data-doc="${type}" accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"><button class="ghost" data-upload="${type}" type="button" style="margin-top:8px">อัปโหลด</button></div>`; }).join('');
  }
  async function upload(type){ if (!current) throw new Error('ยังไม่พบข้อมูลใบสมัคร'); const input = document.querySelector(`input[data-doc="${CSS.escape(type)}"]`); const file = input?.files?.[0]; if (!file) throw new Error('กรุณาเลือกไฟล์'); const fd = new FormData(); fd.append('document_type', type); fd.append('document', file); const res = await fetch(`/partner/application/${encodeURIComponent(current.application.application_code)}/documents`, { method:'POST', body:fd }); const data = await res.json().catch(()=>null); if (!res.ok) throw new Error(data?.error || 'อัปโหลดไม่สำเร็จ'); render(await load()); }
  document.addEventListener('click', e => { const btn = e.target.closest('[data-upload]'); if (btn) upload(btn.dataset.upload).catch(err => alert(err.message)); });
  load().then(render).catch(e => { msg(e.message || 'โหลดข้อมูลไม่สำเร็จ'); });
})();
