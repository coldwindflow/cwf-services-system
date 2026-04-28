(function(){
  const ENABLED = true;
  if (!ENABLED) return;
  const CERT_LABELS = {
    cwf_basic_partner:'Basic Partner', clean_wall_normal:'ล้างผนังปกติ', clean_wall_premium:'ล้างผนังพรีเมียม',
    clean_wall_hanging_coil:'ล้างแขวนคอยล์', clean_wall_overhaul:'ตัดล้างใหญ่', clean_ceiling_suspended:'ล้างแขวน/ใต้ฝ้า',
    clean_cassette_4way:'ล้างสี่ทิศทาง', clean_duct_type:'ล้างท่อลม', repair_diagnosis_basic:'ตรวจเช็กอาการ',
    repair_water_leak:'แก้น้ำรั่ว', repair_electrical_basic:'ไฟฟ้าเบื้องต้น', repair_refrigerant_basic:'ระบบน้ำยา',
    repair_parts_replacement:'เปลี่ยนอะไหล่', install_wall_standard:'ติดตั้งผนัง', install_condo:'ติดตั้งคอนโด', install_relocation:'ย้ายแอร์'
  };
  function badge(text, ok){ return `<span style="display:inline-flex;border-radius:999px;padding:5px 9px;font-weight:900;font-size:12px;background:${ok ? '#dcfce7' : '#fef3c7'};color:${ok ? '#166534' : '#92400e'}">${text}</span>`; }
  async function api(url, opts){
    const res = await fetch(url, { credentials:'include', headers:{'Content-Type':'application/json'}, ...(opts || {}) });
    const data = await res.json().catch(()=>null);
    if (!res.ok) throw new Error(data?.error || 'Request failed');
    return data;
  }
  function ensurePanel(){
    if (document.getElementById('partnerOnboardingPanel')) return document.getElementById('partnerOnboardingPanel');
    const sec = document.getElementById('sec-new') || document.querySelector('.app');
    if (!sec) return null;
    const div = document.createElement('div');
    div.id = 'partnerOnboardingPanel';
    div.className = 'card tight';
    div.style.marginBottom = '12px';
    div.innerHTML = '<b>Partner Onboarding</b><div class="muted" style="margin-top:6px">กำลังโหลด...</div>';
    sec.insertBefore(div, sec.firstChild);
    return div;
  }
  async function render(){
    const panel = ensurePanel();
    if (!panel) return;
    try {
      const data = await api('/tech/partner-onboarding');
      if (!data.partner) { panel.style.display = 'none'; return; }
      const p = data.partner;
      const certs = p.certifications || [];
      panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">
          <div><b>Partner Onboarding</b><div class="muted">${p.application.full_name || ''} • ${p.application.status || ''}</div></div>
          ${badge(p.stages.real_jobs_unlocked ? 'มีสิทธิ์บางประเภท' : 'ยังรับงานจริงไม่ได้', p.stages.real_jobs_unlocked)}
        </div>
        <div style="margin-top:8px;font-weight:900;color:#92400e">${p.stages.real_jobs_unlocked ? '' : 'ยังรับงานจริงไม่ได้จนกว่าแอดมินอนุมัติ'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">
          ${['agreement_signed','basic_training_done','exam_passed'].map(k => `<div>${badge(k === 'agreement_signed' ? 'สัญญา' : k === 'basic_training_done' ? 'อบรม' : 'สอบ', !!p.stages[k])}</div>`).join('')}
        </div>
        <div id="partnerCertPrefs" style="display:grid;gap:8px;margin-top:10px"></div>
        <div id="partnerAvailability" style="border-top:1px solid #d7e0ee;margin-top:10px;padding-top:10px"></div>
      `;
      const prefs = document.getElementById('partnerCertPrefs');
      prefs.innerHTML = certs.map(c => {
        const approved = c.status === 'approved';
        return `<label style="display:flex;justify-content:space-between;gap:8px;align-items:center;border:1px solid #d7e0ee;border-radius:12px;padding:8px"><span><b>${CERT_LABELS[c.certification_code] || c.certification_code}</b><br><span class="muted">${c.status}</span></span><input type="checkbox" data-cert="${c.certification_code}" ${c.preference_enabled ? 'checked' : ''} ${approved ? '' : 'disabled'}></label>`;
      }).join('') || '<div class="muted">ยังไม่มี certification ที่อนุมัติ</div>';
      const av = p.availability || {};
      document.getElementById('partnerAvailability').innerHTML = `
        <b>เวลารับงาน</b>
        <label style="display:flex;gap:8px;align-items:center;margin-top:8px"><input id="partnerPaused" type="checkbox" ${av.paused === false ? '' : 'checked'}> พักรับงานชั่วคราว</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
          <input id="partnerMaxJobs" type="number" min="0" placeholder="งาน/วัน" value="${av.max_jobs_per_day || ''}">
          <input id="partnerMaxUnits" type="number" min="0" placeholder="เครื่อง/วัน" value="${av.max_units_per_day || ''}">
        </div>
        <button id="savePartnerAvailability" class="tab-btn" type="button" style="margin-top:8px">บันทึกเวลารับงาน</button>
      `;
    } catch (e) {
      panel.innerHTML = `<b>Partner Onboarding</b><div class="muted">${e.message}</div>`;
    }
  }
  document.addEventListener('change', async e => {
    const el = e.target.closest('[data-cert]');
    if (!el) return;
    try { await api(`/tech/partner/preferences/${encodeURIComponent(el.dataset.cert)}`, { method:'PUT', body:JSON.stringify({ enabled:el.checked }) }); }
    catch(err){ alert(err.message); el.checked = !el.checked; }
  });
  document.addEventListener('click', async e => {
    if (e.target.id !== 'savePartnerAvailability') return;
    try {
      await api('/tech/partner/availability', { method:'PUT', body:JSON.stringify({
        paused:document.getElementById('partnerPaused').checked,
        max_jobs_per_day:document.getElementById('partnerMaxJobs').value,
        max_units_per_day:document.getElementById('partnerMaxUnits').value,
        working_days:[], time_windows:[], vacation_days:[]
      })});
      alert('บันทึกแล้ว');
    } catch(err){ alert(err.message); }
  });
  document.addEventListener('DOMContentLoaded', render);
})();
