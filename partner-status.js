(function(){
  const DOCS = [
    ['id_card','บัตรประชาชน','🪪','ใช้รูปชัดเจน เห็นข้อมูลครบ ไม่สะท้อนแสง'],
    ['profile_photo','รูปโปรไฟล์','👤','รูปหน้าตรง สุภาพ เห็นใบหน้าชัดเจน'],
    ['bank_book','หน้าสมุดบัญชี','📗','ใช้สำหรับยืนยันบัญชีรับเงินของผู้สมัคร'],
    ['tools_photo','รูปเครื่องมือ','🧰','ถ่ายเครื่องมือหลักที่พร้อมใช้งาน'],
    ['vehicle_photo','รูปยานพาหนะ','🚗','ถ้ามีรถ/มอเตอร์ไซค์สำหรับรับงาน'],
    ['certificate_or_portfolio','ใบรับรอง/ผลงาน','📜','ถ้ามีใบรับรองหรือผลงานเดิม'],
    ['other','เอกสารอื่น','📄','เอกสารเพิ่มเติมตามที่แอดมินขอ']
  ];
  const STATUS = {uploaded:'อัปโหลดแล้ว',approved:'ผ่านแล้ว',rejected:'ไม่ผ่าน',need_reupload:'ขออัปโหลดใหม่',submitted:'ส่งใบสมัครแล้ว',under_review:'กำลังตรวจ',need_more_documents:'ขอเอกสารเพิ่ม',approved_for_training:'อนุมัติเข้าอบรม'};
  const $ = id => document.getElementById(id); let current=null;
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function badge(status){const label=STATUS[status]||status||'ยังไม่อัปโหลด';const cls=status==='approved'?'ok':status==='rejected'?'bad':'warn';return `<span class="badge ${cls}">${esc(label)}</span>`;}
  function msg(t){$('message').textContent=t||'';}
  async function json(url, opts){const res=await fetch(url,{credentials:'include',...(opts||{})});const data=await res.json().catch(()=>null);if(!res.ok)throw new Error(data?.error||'Request failed');return data;}
  function getRef(){const qs=new URLSearchParams(location.search);let ss={};try{ss=JSON.parse(sessionStorage.getItem('cwf_partner_ref')||'{}')}catch(_){}return {code:qs.get('code')||qs.get('application_code')||ss.code||'',phone:qs.get('phone')||ss.phone||''};}
  async function load(){let ref=getRef();if(ref.code&&ref.phone)return json(`/partner/status?application_code=${encodeURIComponent(ref.code)}&phone=${encodeURIComponent(ref.phone)}`);const t=await json('/tech/partner-onboarding');if(t.partner)return {ok:true,...t.partner};throw new Error('ไม่พบข้อมูลใบสมัคร กรุณาเข้าใหม่จากหน้าแอพช่าง');}
  function render(data){current=data;const app=data.application||{};$('profilePanel').classList.remove('hidden');$('appName').textContent=app.full_name||'-';$('appMeta').textContent=`${app.phone||''} · ${app.application_code||''}`;$('appStatus').textContent=STATUS[app.status]||app.status||'รอตรวจ';try{sessionStorage.setItem('cwf_partner_ref',JSON.stringify({code:app.application_code,phone:app.phone}))}catch(_){}
    const latest=new Map((app.documents||[]).map(d=>[d.document_type,d]));
    $('documentCards').innerHTML=DOCS.map(([type,label,icon,hint])=>{const d=latest.get(type);return `<article class="doc"><div class="doc-icon">${icon}</div><div><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><h3>${esc(label)}</h3>${d?badge(d.status):badge('')}</div><p>${esc(hint)}</p><p>รองรับ JPG, PNG, WEBP หรือ PDF · ไม่เกิน 8MB</p>${d?.original_filename?`<p><b>ไฟล์ล่าสุด:</b> ${esc(d.original_filename)}</p>`:''}${d?.admin_note?`<p><b>หมายเหตุแอดมิน:</b> ${esc(d.admin_note)}</p>`:''}<div class="upload-row"><label class="file"><input type="file" data-doc="${type}" accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"></label><button class="upload-btn" data-upload="${type}" type="button">อัปโหลด${d?'ใหม่':''}</button></div></div></article>`}).join('');}
  async function upload(type){if(!current)throw new Error('ยังไม่พบข้อมูลใบสมัคร');const input=document.querySelector(`input[data-doc="${CSS.escape(type)}"]`);const file=input?.files?.[0];if(!file)throw new Error('กรุณาเลือกไฟล์ก่อนอัปโหลด');const fd=new FormData();fd.append('document_type',type);fd.append('document',file);const res=await fetch(`/partner/application/${encodeURIComponent(current.application.application_code)}/documents`,{method:'POST',body:fd});const data=await res.json().catch(()=>null);if(!res.ok)throw new Error(data?.error||'อัปโหลดไม่สำเร็จ');msg('อัปโหลดสำเร็จ');render(await load());}
  document.addEventListener('click',e=>{const btn=e.target.closest('[data-upload]');if(btn)upload(btn.dataset.upload).catch(err=>alert(err.message));});
  document.addEventListener('DOMContentLoaded',()=>load().then(render).catch(e=>msg(e.message)));
})();
