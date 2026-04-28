(function(){
  const $ = id => document.getElementById(id);
  let state = { code:'', loaded:null };
  function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  async function api(url, opts){ const res = await fetch(url,{credentials:'include',headers:{'Content-Type':'application/json',...(opts?.headers||{})},...(opts||{})}); const data = await res.json().catch(()=>null); if(!res.ok) throw new Error(data?.error||'Request failed'); return data; }
  function getStoredRef(){ try{return JSON.parse(sessionStorage.getItem('cwf_partner_ref')||'{}');}catch(_){return{};} }
  async function resolveCode(){ const u=new URL(location.href); let code=u.searchParams.get('code')||u.searchParams.get('application_code')||''; if(!code) code=getStoredRef().code||''; if(code) return code; const tech=await api('/tech/partner-onboarding'); if(!tech.partner) throw new Error('ไม่พบข้อมูลพาร์ทเนอร์ของบัญชีนี้'); return tech.partner.application.application_code; }
  function renderProfile(app){
    $('profileGrid').innerHTML = [['ชื่อผู้สมัคร',app.full_name],['เบอร์โทร',app.phone],['ประเภท','พาร์ทเนอร์ช่างแอร์'],['วันที่ทำสัญญา',new Date().toLocaleDateString('th-TH')],['พื้นที่รับงาน', [app.province,app.district].filter(Boolean).join(' / ') || '-'],['สถานะใบสมัคร',app.status||'-']].map(([k,v])=>`<div class="info"><small>${esc(k)}</small><b>${esc(v||'-')}</b></div>`).join('');
  }
  function render(data){
    state.loaded=data; const app=data.application||{}; const tpl=data.template||{}; renderProfile(app); $('agreementPanel').classList.remove('hidden'); $('signaturePanel').classList.remove('hidden'); $('templateTitle').textContent=tpl.title||'CWF สัญญาพาร์ทเนอร์ช่างแอร์'; $('contractBody').innerHTML=tpl.content_html||'<div class="note">ยังไม่มีเนื้อหาสัญญา</div>'; $('signerName').value=app.full_name||'';
    if(data.signature){ $('signatureStatus').innerHTML=`<span class="badge ok">เซ็นแล้ว</span><div class="note" style="margin-top:10px">เซ็นโดย ${esc(data.signature.signer_full_name)} เมื่อ ${new Date(data.signature.signed_at).toLocaleString('th-TH')}</div>`; $('signatureForm').classList.add('hidden'); return; }
    if(data.contract_ready===false){ $('signatureStatus').innerHTML=`<div class="note err">${esc(data.contract_ready_message||'ยังไม่สามารถเซ็นสัญญาได้')}</div>`; $('signatureForm').classList.add('hidden'); } else { $('signatureStatus').innerHTML='<span class="badge">ยังไม่ได้เซ็น</span>'; $('signatureForm').classList.remove('hidden'); }
  }
  async function load(){ try{ $('message').textContent='กำลังโหลดสัญญา...'; state.code=await resolveCode(); const data=await api(`/partner/agreement/${encodeURIComponent(state.code)}`); $('message').textContent=''; render(data); }catch(e){ $('message').textContent=e.message; $('message').className='msg err'; } }
  $('signatureForm')?.addEventListener('submit', async e=>{ e.preventDefault(); try{ const signer=$('signerName').value.trim(); if(!$('consent').checked) throw new Error('กรุณาติ๊กยอมรับสัญญา'); if(!signer) throw new Error('กรุณาพิมพ์ชื่อ-นามสกุล'); await api(`/partner/agreement/${encodeURIComponent(state.code)}/sign`,{method:'POST',body:JSON.stringify({signer_full_name:signer,consent:true})}); alert('เซ็นสัญญาสำเร็จ'); await load(); }catch(err){ alert(err.message||'เซ็นสัญญาไม่สำเร็จ'); } });
  load();
})();