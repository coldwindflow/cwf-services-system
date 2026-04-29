(function(){
  const CERT_LABELS = {
    cwf_basic_partner:'Basic Partner', clean_wall_normal:'ล้างผนังปกติ', clean_wall_premium:'ล้างผนังพรีเมียม', clean_wall_hanging_coil:'ล้างแขวนคอยล์', clean_wall_overhaul:'ตัดล้างใหญ่',
    clean_ceiling_suspended:'ล้างแขวน/ใต้ฝ้า', clean_cassette_4way:'ล้างสี่ทิศทาง', clean_duct_type:'ล้างท่อลม', repair_diagnosis_basic:'ตรวจเช็กอาการ', repair_water_leak:'แก้น้ำรั่ว',
    repair_electrical_basic:'ไฟฟ้าเบื้องต้น', repair_refrigerant_basic:'ระบบน้ำยา', repair_parts_replacement:'เปลี่ยนอะไหล่', install_wall_standard:'ติดตั้งผนัง', install_condo:'ติดตั้งคอนโด', install_relocation:'ย้ายแอร์'
  };
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  async function api(url, opts){
    const res = await fetch(url, { credentials:'include', headers:{'Content-Type':'application/json'}, ...(opts || {}) });
    const data = await res.json().catch(()=>null);
    if (!res.ok) throw new Error(data?.error || 'Request failed');
    return data;
  }
  function injectStyle(){
    if (document.getElementById('partnerOnboardingStyle')) return;
    const style = document.createElement('style');
    style.id = 'partnerOnboardingStyle';
    style.textContent = `
      #partnerOnboardingPanel{font-family:inherit;margin:0 0 16px!important;border:0!important;background:transparent!important;box-shadow:none!important;padding:0!important;color:#10203b}
      .po-card{border-radius:28px;overflow:hidden;background:#fff;box-shadow:0 18px 44px rgba(7,27,73,.16);border:1px solid #dbe7ff}
      .po-head{background:linear-gradient(135deg,#061b49,#0b56d8);color:#fff;padding:20px;position:relative;overflow:hidden}.po-head:after{content:'';position:absolute;right:-50px;top:-70px;width:170px;height:170px;border-radius:50%;background:rgba(255,255,255,.11)}
      .po-title{font-size:25px;font-weight:1000;line-height:1.16;position:relative}.po-sub{opacity:.86;font-weight:800;margin-top:6px;line-height:1.45;position:relative}
      .po-chip{display:inline-flex;border-radius:999px;padding:7px 11px;font-size:12px;font-weight:1000;background:#fff0c2;color:#7a4400;margin-top:12px;position:relative}.po-chip.ok{background:#dcfce7;color:#166534}
      .po-body{padding:16px}.po-progress{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:14px}.po-step{border:1px solid #dbe7ff;border-radius:16px;background:#f8fbff;padding:9px 7px;text-align:center;font-weight:900;font-size:12px}.po-step span{display:flex;width:28px;height:28px;margin:0 auto 5px;border-radius:50%;align-items:center;justify-content:center;background:#dbe7ff;color:#061b49;font-weight:1000}.po-step.done{background:#eefdf3;border-color:#bbf7d0}.po-step.done span{background:#22c55e;color:#fff}.po-step.current{background:#fff9e8;border-color:#ffd966}.po-step.current span{background:#ffd233;color:#061b49}
      .po-actions{display:grid;grid-template-columns:1fr;gap:10px}.po-action{display:flex;align-items:center;gap:12px;border:1px solid #dbe7ff;background:#fff;border-radius:18px;padding:13px;text-decoration:none;color:#10203b}.po-icon{width:44px;height:44px;border-radius:15px;background:#eef4ff;display:flex;align-items:center;justify-content:center;font-size:23px;flex:0 0 auto}.po-action b{display:block;font-size:16px}.po-action small{display:block;color:#64748b;font-weight:800;margin-top:3px}.po-arrow{margin-left:auto;color:#0b56d8;font-weight:1000}
      .po-note{margin-top:12px;border:1px dashed #bfd0ee;border-radius:18px;padding:13px;background:#fbfdff;color:#64748b;font-weight:800;line-height:1.5}
      .po-cert{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.po-cert span{border-radius:999px;background:#eef4ff;color:#061b49;padding:7px 10px;font-size:12px;font-weight:900}
      @media(max-width:520px){.po-title{font-size:22px}.po-progress{grid-template-columns:repeat(2,1fr)}}
    `;
    document.head.appendChild(style);
  }
  function ensurePanel(){
    if (document.getElementById('partnerOnboardingPanel')) return document.getElementById('partnerOnboardingPanel');
    const sec = document.getElementById('sec-new') || document.querySelector('.app') || document.body;
    const div = document.createElement('div');
    div.id = 'partnerOnboardingPanel';
    div.className = 'card tight';
    div.style.marginBottom = '12px';
    div.innerHTML = '<div class="po-card"><div class="po-body">กำลังโหลดสถานะพาร์ทเนอร์...</div></div>';
    sec.insertBefore(div, sec.firstChild);
    return div;
  }
  function docState(p){
    const docs = p.application?.documents || [];
    const required = ['id_card','profile_photo','bank_book'];
    const uploaded = required.every(t => docs.some(d => d.document_type === t));
    const approved = required.every(t => docs.some(d => d.document_type === t && d.status === 'approved'));
    return { uploaded, approved };
  }
  function step(n,label,done,current){ return `<div class="po-step ${done?'done':''} ${current?'current':''}"><span>${done?'✓':n}</span>${esc(label)}</div>`; }
  function render(p){
    const panel = ensurePanel();
    const app = p.application || {};
    const docs = docState(p);
    const trainingDone = !!p.stages?.basic_training_done;
    const examPassed = !!p.stages?.exam_passed;
    const unlocked = !!p.stages?.real_jobs_unlocked;
    const current = !docs.uploaded ? 1 : !p.agreement ? 2 : !(trainingDone && examPassed) ? 3 : 4;
    const qs = `?code=${encodeURIComponent(app.application_code||'')}&phone=${encodeURIComponent(app.phone||'')}`;
    try { sessionStorage.setItem('cwf_partner_ref', JSON.stringify({ code: app.application_code || '', phone: app.phone || '' })); } catch(_) {}
    const approved = (p.certifications || []).filter(c => c.status === 'approved');
    panel.innerHTML = `
      <div class="po-card">
        <div class="po-head">
          <div class="po-title">สถานะพาร์ทเนอร์ CWF</div>
          <div class="po-sub">${esc(app.full_name || '')} ${app.phone ? '· ' + esc(app.phone) : ''}</div>
          <span class="po-chip ${unlocked?'ok':''}">${unlocked ? 'รับงานได้บางประเภทแล้ว' : 'ยังรับงานจริงไม่ได้'}</span>
        </div>
        <div class="po-body">
          <div class="po-progress">
            ${step(1,'เอกสาร',docs.approved,current===1)}
            ${step(2,'สัญญา',!!p.agreement,current===2)}
            ${step(3,'อบรม/สอบ',trainingDone && examPassed,current===3)}
            ${step(4,'อนุมัติ',unlocked,current===4)}
          </div>
          <div class="po-actions">
            <a class="po-action" href="/partner-dashboard.html"><div class="po-icon">🏠</div><div><b>Partner Dashboard</b><small>ดูทุกสถานะและขั้นตอนที่ต้องทำในหน้าเดียว</small></div><div class="po-arrow">›</div></a>
            <a class="po-action" href="/partner-status.html${qs}"><div class="po-icon">📷</div><div><b>อัปโหลดเอกสาร / รูปโปรไฟล์</b><small>ตรวจเอกสารและอัปโหลดใหม่เมื่อไม่ผ่าน</small></div><div class="po-arrow">›</div></a>
            <a class="po-action" href="/partner-agreement.html?code=${encodeURIComponent(app.application_code||'')}"><div class="po-icon">📝</div><div><b>อ่านและเซ็นสัญญา</b><small>อ่านเงื่อนไขและเซ็นลายเซ็นบนหน้าจอ</small></div><div class="po-arrow">›</div></a>
            <a class="po-action" href="/partner-academy.html?code=${encodeURIComponent(app.application_code||'')}"><div class="po-icon">🎓</div><div><b>อบรมและทำข้อสอบ Academy</b><small>ดูบทเรียนให้ครบแล้วสอบให้ผ่าน 80%</small></div><div class="po-arrow">›</div></a>
          </div>
          ${approved.length ? `<div class="po-cert">${approved.slice(0,6).map(c=>`<span>${esc(CERT_LABELS[c.certification_code] || c.certification_code)}</span>`).join('')}</div>` : `<div class="po-note">ยังไม่มี certification ที่อนุมัติ ระบบจะยังไม่เปิดให้ตั้งเวลารับงานหรือรับงานจริง</div>`}
        </div>
      </div>
    `;
  }
  async function init(){
    injectStyle();
    const panel = ensurePanel();
    try{
      const data = await api('/tech/partner-onboarding');
      if (!data.partner) { if(panel) panel.style.display = 'none'; return; }
      render(data.partner);
    }catch(e){
      if(panel) panel.innerHTML = `<div class="po-card"><div class="po-body" style="color:#b91c1c;font-weight:900">โหลดสถานะพาร์ทเนอร์ไม่สำเร็จ: ${esc(e.message)}</div></div>`;
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();