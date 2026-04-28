(function(){
  const $ = (id) => document.getElementById(id);
  const state = { applicationCode: '', loaded: null };

  function esc(s){
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function setMessage(text, type){
    const el = $('message');
    el.textContent = text || '';
    el.className = `msg ${type || ''}`;
  }

  function codeFromInput(){
    return $('applicationCode').value.trim().toUpperCase();
  }

  async function api(url, opts){
    const res = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(opts && opts.headers ? opts.headers : {}) },
      ...(opts || {})
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || 'Request failed');
    return data;
  }

  function render(data){
    state.loaded = data;
    const app = data.application || {};
    const template = data.template || {};
    const signature = data.signature || null;
    $('agreementPanel').classList.remove('hidden');
    $('templateTitle').textContent = template.title || 'CWF Partner Agreement';
    $('applicantName').textContent = `${app.full_name || '-'} • ${app.application_code || state.applicationCode}`;
    $('contractBody').innerHTML = esc(template.body_text || 'ยังไม่มี template สัญญาที่เปิดใช้งาน');
    $('signerName').value = app.full_name || '';
    if (signature) {
      $('signatureBadge').textContent = `เซ็นแล้ว ${new Date(signature.signed_at).toLocaleString('th-TH')}`;
      $('signatureBadge').className = 'badge ok';
      $('signatureForm').classList.add('hidden');
    } else {
      $('signatureBadge').textContent = 'ยังไม่เซ็น';
      $('signatureBadge').className = 'badge';
      $('signatureForm').classList.remove('hidden');
    }
  }

  async function loadAgreement(){
    try {
      setMessage('', '');
      state.applicationCode = codeFromInput();
      if (!state.applicationCode) throw new Error('กรุณากรอกรหัสใบสมัคร');
      const data = await api(`/partner/agreement/${encodeURIComponent(state.applicationCode)}`);
      render(data);
    } catch (e) {
      $('agreementPanel').classList.add('hidden');
      setMessage(e.message, 'err');
    }
  }

  async function signAgreement(){
    try {
      if (!state.applicationCode) throw new Error('กรุณาโหลดสัญญาก่อน');
      const signer = $('signerName').value.trim();
      const consent = $('consent').checked;
      if (!signer) throw new Error('กรุณาพิมพ์ชื่อ-นามสกุล');
      if (!consent) throw new Error('กรุณายืนยันการยอมรับสัญญา');
      const data = await api(`/partner/agreement/${encodeURIComponent(state.applicationCode)}/sign`, {
        method: 'POST',
        body: JSON.stringify({ signer_full_name: signer, consent })
      });
      setMessage('บันทึกลายเซ็นเรียบร้อย', 'ok');
      const latest = await api(`/partner/agreement/${encodeURIComponent(state.applicationCode)}`);
      render({ ...latest, signature: data.signature || latest.signature });
    } catch (e) {
      setMessage(e.message, 'err');
    }
  }

  $('btnLoad').addEventListener('click', loadAgreement);
  $('btnSign').addEventListener('click', signAgreement);
  $('applicationCode').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadAgreement();
  });

  const params = new URLSearchParams(location.search);
  const code = params.get('code') || params.get('application_code');
  if (code) {
    $('applicationCode').value = code;
    loadAgreement();
  }
})();
