(function(){
  const DOCS = [
    ['id_card','บัตรประชาชน','🪪','จำเป็น','JPG, PNG, WEBP หรือ PDF'],
    ['profile_photo','รูปโปรไฟล์','👤','จำเป็น','JPG, PNG หรือ WEBP'],
    ['bank_book','สมุดบัญชี','📗','จำเป็น','JPG, PNG, WEBP หรือ PDF'],
    ['tools_photo','รูปเครื่องมือ','🧰','แนะนำ','JPG, PNG หรือ WEBP'],
    ['vehicle_photo','รูปยานพาหนะ','🛵','ถ้ามี','JPG, PNG หรือ WEBP'],
    ['certificate_or_portfolio','ใบรับรอง / ผลงาน','📄','ถ้ามี','JPG, PNG, WEBP หรือ PDF'],
    ['other','เอกสารเพิ่มเติม','📎','ถ้ามี','JPG, PNG, WEBP หรือ PDF']
  ];
  const STATUS = {uploaded:'รอตรวจ',approved:'ผ่านแล้ว',rejected:'ไม่ผ่าน',need_reupload:'ขออัปโหลดใหม่'};
  const $ = id => document.getElementById(id);
  let current = null;
  function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function badge(text, cls){ return `<span class="badge ${cls||''}">${esc(text)}</span>`; }
  async function api(url, opts){ const res = await fetch(url, {credentials:'include', ...(opts||{})}); const data = await res.json().catch(()=>null); if(!res.ok) throw new Error(data?.error || 'Request failed'); return data; }
  function params(){ const u = new URL(location.href); return { code:u.searchParams.get('code')||u.searchParams.get('application_code')||'', phone:u.searchParams.get('phone')||'' }; }
  function saveRef(app){ try{ sessionStorage.setItem('cwf_partner_ref', JSON.stringify({code:app.application_code, phone:app.phone})); }catch(_){} }
  function getStoredRef(){ try{ return JSON.parse(sessionStorage.getItem('cwf_partner_ref')||'{}'); }catch(_){ return {}; } }
  async function resolveStatus(){
    let {code, phone} = params();
    if(!code || !phone){ const s = getStoredRef(); code = code || s.code || ''; phone = phone || s.phone || ''; }
    if(code && phone) return api(`/partner/status?application_code=${encodeURIComponent(code)}&phone=${encodeURIComponent(phone)}`);
    const tech = await api('/tech/partner-onboarding');
    if(!tech.partner) throw new Error('ไม่พบข้อมูลพาร์ทเนอร์ของบัญชีนี้');
    return {ok:true, ...tech.partner};
  }
  function render(data){
    current = data;
    const app = data.application || {};
    saveRef(app);
    $('appName').textContent = app.full_name || 'พาร์ทเนอร์ CWF';
    $('appMeta').textContent = `${app.phone || ''} • ${app.status || 'submitted'}`;
    const latest = new Map((app.documents || []).map(d => [d.document_type, d]));
    $('documentCards').innerHTML = DOCS.map(([type,label,icon,required,hint])=>{
      const d = latest.get(type);
      const cls = d?.status === 'approved' ? 'ok' : d?.status === 'rejected' ? 'bad' : 'warn';
      return `<article class="doc"><div class="icon">${icon}</div><div><h3>${esc(label)}</h3><div style="margin:8px 0">${badge(d ? (STATUS[d.status]||d.status) : 'ยังไม่ได้อัปโหลด', d?cls:'warn')} ${badge(required)}</div><div class="tips">ไฟล์: ${esc(hint)}<br>เลือกไฟล์ให้ชัดเจน อ่านง่าย ไม่เบลอ และเห็นข้อมูลครบ</div><form class="upload" data-type="${esc(type)}"><input type="file" name="document" accept="image/jpeg,image/png,image/webp,application/pdf" required><button type="submit">อัปโหลด ${esc(label)}</button></form></div></article>`;
    }).join('');
    $('documentCards').querySelectorAll('form').forEach(form=>{
      form.addEventListener('submit', async e=>{
        e.preventDefault();
        const file = form.querySelector('input[type=file]').files[0];
        if(!file) return alert('กรุณาเลือกไฟล์');
        const fd = new FormData(); fd.append('document_type', form.dataset.type); fd.append('document', file);
        const btn = form.querySelector('button'); const old = btn.textContent; btn.disabled = true; btn.textContent = 'กำลังอัปโหลด...';
        try{ await api(`/partner/application/${encodeURIComponent(app.application_code)}/documents`, {method:'POST', body:fd}); alert('อัปโหลดสำเร็จ'); await load(); }
        catch(err){ alert(err.message || 'อัปโหลดไม่สำเร็จ'); }
        finally{ btn.disabled = false; btn.textContent = old; }
      });
    });
  }
  async function load(){ try{ $('message').textContent=''; render(await resolveStatus()); }catch(e){ $('appName').textContent='โหลดข้อมูลไม่สำเร็จ'; $('message').textContent=e.message; $('message').className='msg err'; } }
  load();
})();