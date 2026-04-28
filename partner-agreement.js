(function(){
  const $ = (id) => document.getElementById(id);
  const state = { applicationCode: '', loaded: null };
  function esc(s){ return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function setMessage(text, type){ const el = $('message'); if(!el) return; el.textContent = text || ''; el.className = `msg ${type || ''}`; }
  async function api(url, opts){ const res = await fetch(url, { credentials:'include', headers:{'Content-Type':'application/json', ...(opts?.headers || {})}, ...(opts||{}) }); const data = await res.json().catch(()=>null); if(!res.ok) throw new Error(data?.error || 'Request failed'); return data; }
  function getStoredRef(){ try { return JSON.parse(sessionStorage.getItem('cwf_partner_ref') || '{}'); } catch(e){ return {}; } }
  function getCode(){ const qs = new URLSearchParams(location.search); return (qs.get('code') || qs.get('application_code') || getStoredRef().code || '').trim().toUpperCase(); }
  async function resolveCode(){ const code = getCode(); if (code) return code; const d = await api('/tech/partner-onboarding'); const app = d.partner?.application; if (!app?.application_code) throw new Error('ไม่พบใบสมัคร กรุณาเข้าหน้านี้จากแอพช่างหรือหน้าสถานะ'); try { sessionStorage.setItem('cwf_partner_ref', JSON.stringify({ code: app.application_code, phone: app.phone || '' })); } catch(e){} return app.application_code; }
  function render(data){
    state.loaded = data; const app = data.application || {}; const template = data.template || {}; const signature = data.signature || null; const contractReady = data.contract_ready !== false; const contractMessage = data.contract_ready_message || 'ยังไม่สามารถเซ็นสัญญาได้ เพราะยังไม่ได้นำเข้าสัญญาฉบับจริง';
    $('loadingPanel')?.classList.add('hidden'); $('agreementPanel')?.classList.remove('hidden');
    $('templateTitle').textContent = template.title || 'CWF Partner Agreement'; $('applicantName').textContent = `${app.full_name || '-'} • ${app.phone || ''}`;
    $('contractBody').innerHTML = template.content_html || `<pre>${esc(template.body_text || 'ยังไม่มี template สัญญาที่เปิดใช้งาน')}</pre>`;
    $('signerName').value = app.full_name || '';
    if (!contractReady) { $('contractBody').insertAdjacentHTML('afterbegin', '<div style="border-left:4px solid #ef4444;background:#fff1f2;padding:10px 12px;margin-bottom:12px;font-weight:900;color:#991b1b">' + esc(contractMessage) + '</div>'); $('signatureBadge').textContent='ยังเซ็นไม่ได้'; $('signatureBadge').className='badge warn'; $('signatureForm').classList.add('hidden'); }
    else if (signature) { $('signatureBadge').textContent = `เซ็นแล้ว ${new Date(signature.signed_at).toLocaleString('th-TH')}`; $('signatureBadge').className='badge ok'; $('signatureForm').classList.add('hidden'); }
    else { $('signatureBadge').textContent='ยังไม่เซ็น'; $('signatureBadge').className='badge'; $('signatureForm').classList.remove('hidden'); }
  }
  async function loadAgreement(){ try { setMessage('', ''); state.applicationCode = await resolveCode(); const data = await api(`/partner/agreement/${encodeURIComponent(state.applicationCode)}`); render(data); } catch(e){ $('agreementPanel')?.classList.add('hidden'); setMessage(e.message, 'err'); } }
  async function signAgreement(){ try { if (!state.applicationCode) throw new Error('ยังไม่พบใบสมัคร'); if (state.loaded?.contract_ready === false) throw new Error(state.loaded.contract_ready_message || 'ยังไม่สามารถเซ็นสัญญาได้'); const signer=$('signerName').value.trim(); const consent=$('consent').checked; if(!signer) throw new Error('กรุณาพิมพ์ชื่อ-นามสกุล'); if(!consent) throw new Error('กรุณายืนยันการยอมรับสัญญา'); const data=await api(`/partner/agreement/${encodeURIComponent(state.applicationCode)}/sign`, {method:'POST', body:JSON.stringify({signer_full_name:signer, consent})}); setMessage('บันทึกลายเซ็นเรียบร้อย','ok'); const latest=await api(`/partner/agreement/${encodeURIComponent(state.applicationCode)}`); render({...latest, signature:data.signature || latest.signature}); } catch(e){ setMessage(e.message,'err'); } }
  $('btnSign')?.addEventListener('click', signAgreement); loadAgreement();
})();
