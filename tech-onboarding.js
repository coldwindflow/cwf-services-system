(function(){
  const ENABLED = true;
  if (!ENABLED) return;
  const CERT_LABELS = {
    cwf_basic_partner:'Basic Partner', clean_wall_normal:'ล้างผนังปกติ', clean_wall_premium:'ล้างผนังพรีเมียม', clean_wall_hanging_coil:'ล้างแขวนคอยล์', clean_wall_overhaul:'ตัดล้างใหญ่', clean_ceiling_suspended:'ล้างแขวน/ใต้ฝ้า', clean_cassette_4way:'ล้างสี่ทิศทาง', clean_duct_type:'ล้างท่อลม', repair_diagnosis_basic:'ตรวจเช็กอาการ', repair_water_leak:'แก้น้ำรั่ว', repair_electrical_basic:'ไฟฟ้าเบื้องต้น', repair_refrigerant_basic:'ระบบน้ำยา', repair_parts_replacement:'เปลี่ยนอะไหล่', install_wall_standard:'ติดตั้งผนัง', install_condo:'ติดตั้งคอนโด', install_relocation:'ย้ายแอร์'
  };
  function badge(text, type){ const map={ok:['#dcfce7','#166534'],warn:['#fef3c7','#92400e'],bad:['#fee2e2','#991b1b'],lock:['#e2e8f0','#475569']}; const c=map[type]||map.lock; return `<span style="display:inline-flex;border-radius:999px;padding:7px 10px;font-weight:1000;font-size:12px;background:${c[0]};color:${c[1]}">${text}</span>`; }
  async function api(url, opts){ const res=await fetch(url,{credentials:'include',headers:{'Content-Type':'application/json'},...(opts||{})}); const data=await res.json().catch(()=>null); if(!res.ok) throw new Error(data?.error||'Request failed'); return data; }
  function saveRef(app){ try{sessionStorage.setItem('cwf_partner_ref', JSON.stringify({code:app.application_code, phone:app.phone||''}))}catch(e){} }
  function ensurePanel(){ if(document.getElementById('partnerOnboardingPanel')) return document.getElementById('partnerOnboardingPanel'); const sec=document.getElementById('sec-new')||document.querySelector('.app')||document.body; if(!sec) return null; const div=document.createElement('div'); div.id='partnerOnboardingPanel'; div.className='card tight'; div.style.marginBottom='14px'; div.style.border='1px solid #dbe7ff'; div.style.borderRadius='24px'; div.style.overflow='hidden'; div.innerHTML='<b>กำลังโหลดสถานะพาร์ทเนอร์...</b>'; sec.insertBefore(div, sec.firstChild); return div; }
  function progressItem(label, ok, href){ return `<a href="${href}" style="display:flex;align-items:center;gap:10px;text-decoration:none;color:#101828;border:1px solid #dbe7ff;border-radius:16px;padding:12px;background:#fff"><span style="font-size:20px">${ok?'✅':'⬜'}</span><span style="font-weight:1000">${label}</span><span style="margin-left:auto">›</span></a>`; }
  async function render(){ const panel=ensurePanel(); if(!panel)return; try{ const data=await api('/tech/partner-onboarding'); if(!data.partner){panel.style.display='none';return;} const p=data.partner; const app=p.application||{}; saveRef(app); const code=encodeURIComponent(app.application_code||''); const phone=encodeURIComponent(app.phone||''); const statusHref=`/partner-status.html?code=${code}&phone=${phone}`; const agreementHref=`/partner-agreement.html?code=${code}`; const academyHref=`/partner-academy.html?code=${code}`; const unlocked=!!p.stages?.real_jobs_unlocked; const certs=p.certifications||[]; panel.innerHTML=`
      <div style="background:linear-gradient(135deg,#071b49,#0b56c8);color:white;padding:18px;border-radius:24px 24px 0 0">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><div style="font-size:20px;font-weight:1000">สถานะพาร์ทเนอร์ CWF</div><div style="opacity:.86;font-weight:800;margin-top:4px">${app.full_name||''} • ${app.status||''}</div></div>${badge(unlocked?'เปิดรับงานได้บางประเภท':'ยังรับงานจริงไม่ได้',unlocked?'ok':'warn')}</div>
        <div style="margin-top:12px;font-weight:900;line-height:1.5">${unlocked?'เลือกประเภทงานที่รับได้และตั้งเวลารับงานด้านล่าง':'ทำขั้นตอนให้ครบ แล้วรอแอดมินอนุมัติก่อนเริ่มรับงานจริง'}</div>
      </div>
      <div style="padding:14px;background:#f8fbff">
        <div style="display:grid;gap:10px">
          ${progressItem('อัปโหลดเอกสาร / รูปโปรไฟล์', !(p.stages?.documents_pending), statusHref)}
          ${progressItem('อ่านและเซ็นสัญญา', !!p.stages?.agreement_signed, agreementHref)}
          ${progressItem('อบรมและทำข้อสอบ Academy', !!p.stages?.exam_passed, academyHref)}
        </div>
        <div style="border-top:1px solid #dbe7ff;margin-top:14px;padding-top:14px">
          <b style="display:block;margin-bottom:8px">สิทธิ์งานที่อนุมัติ</b>
          <div id="partnerCertPrefs" style="display:grid;gap:8px"></div>
        </div>
        <div id="partnerAvailability" style="border-top:1px solid #dbe7ff;margin-top:14px;padding-top:14px"></div>
      </div>`;
      const prefs=document.getElementById('partnerCertPrefs');
      prefs.innerHTML=certs.length?certs.map(c=>{const approved=c.status==='approved';return `<label style="display:flex;justify-content:space-between;gap:8px;align-items:center;border:1px solid #d7e0ee;border-radius:14px;padding:10px;background:white"><span><b>${CERT_LABELS[c.certification_code]||c.certification_code}</b><br><span style="color:#64748b;font-weight:800">${approved?'อนุมัติแล้ว':'ล็อกอยู่ - '+(c.status||'not_started')}</span></span><input type="checkbox" data-cert="${c.certification_code}" ${c.preference_enabled?'checked':''} ${approved?'':'disabled'}></label>`}).join(''):'<div style="color:#64748b;font-weight:800">ยังไม่มี certification ที่อนุมัติ</div>';
      const av=p.availability||{}; const avBox=document.getElementById('partnerAvailability');
      if(!unlocked){ avBox.innerHTML=`<b>เวลารับงาน</b><div style="margin-top:8px;color:#64748b;font-weight:900;line-height:1.5">ยังไม่เปิดให้ตั้งเวลารับงานจนกว่าแอดมินอนุมัติ certification อย่างน้อย 1 ประเภท</div>`; }
      else { avBox.innerHTML=`<b>เวลารับงาน</b><label style="display:flex;gap:8px;align-items:center;margin-top:8px"><input id="partnerPaused" type="checkbox" ${av.paused===false?'':'checked'}> พักรับงานชั่วคราว</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px"><input id="partnerMaxJobs" type="number" min="0" placeholder="งาน/วัน" value="${av.max_jobs_per_day||''}"><input id="partnerMaxUnits" type="number" min="0" placeholder="เครื่อง/วัน" value="${av.max_units_per_day||''}"></div><button id="savePartnerAvailability" class="tab-btn" type="button" style="margin-top:8px;width:100%">บันทึกเวลารับงาน</button>`; }
    } catch(e){ panel.innerHTML=`<b>Partner Onboarding</b><div style="color:#64748b;font-weight:800;margin-top:6px">${e.message}</div>`; } }
  document.addEventListener('change',async e=>{ const el=e.target.closest('[data-cert]'); if(!el)return; try{await api(`/tech/partner/preferences/${encodeURIComponent(el.dataset.cert)}`,{method:'PUT',body:JSON.stringify({enabled:el.checked})});}catch(err){alert(err.message);el.checked=!el.checked;} });
  document.addEventListener('click',async e=>{ if(e.target.id!=='savePartnerAvailability')return; try{await api('/tech/partner/availability',{method:'PUT',body:JSON.stringify({paused:document.getElementById('partnerPaused').checked,max_jobs_per_day:document.getElementById('partnerMaxJobs').value,max_units_per_day:document.getElementById('partnerMaxUnits').value,working_days:[],time_windows:[],vacation_days:[]})});alert('บันทึกแล้ว');}catch(err){alert(err.message);} });
  document.addEventListener('DOMContentLoaded', render);
})();
