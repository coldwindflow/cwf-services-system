(function(){
  const CERT_LABELS = {
    cwf_basic_partner:'Basic Partner', clean_wall_normal:'ล้างผนังปกติ', clean_wall_premium:'ล้างผนังพรีเมียม', clean_wall_hanging_coil:'ล้างแขวนคอยล์', clean_wall_overhaul:'ตัดล้างใหญ่', clean_ceiling_suspended:'ล้างแขวน/ใต้ฝ้า', clean_cassette_4way:'ล้างสี่ทิศทาง', clean_duct_type:'ล้างท่อลม', repair_diagnosis_basic:'ตรวจเช็กอาการ', repair_water_leak:'แก้น้ำรั่ว', repair_electrical_basic:'ไฟฟ้าเบื้องต้น', repair_refrigerant_basic:'ระบบน้ำยา', repair_parts_replacement:'เปลี่ยนอะไหล่', install_wall_standard:'ติดตั้งผนัง', install_condo:'ติดตั้งคอนโด', install_relocation:'ย้ายแอร์'
  };
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
      .po-shell{border-radius:28px;overflow:hidden;background:#fff;box-shadow:0 18px 48px rgba(7,27,73,.14);border:1px solid rgba(219,231,255,.95)}
      .po-hero{background:linear-gradient(135deg,#061b49,#0b56d8);color:#fff;padding:22px 20px 20px;position:relative;overflow:hidden}.po-hero:after{content:'';position:absolute;right:-40px;top:-60px;width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,.12)}
      .po-title{font-size:28px;line-height:1.18;font-weight:1000;margin:0}.po-sub{margin:9px 0 0;color:rgba(255,255,255,.86);font-weight:800;font-size:15px;line-height:1.45}.po-status{display:inline-flex;margin-top:14px;background:#fff4c7;color:#724000;border-radius:999px;padding:9px 13px;font-weight:1000;font-size:13px}
      .po-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:18px}.po-step{text-align:center;color:rgba(255,255,255,.75);font-size:12px;font-weight:900}.po-step i{display:flex;margin:0 auto 7px;width:34px;height:34px;align-items:center;justify-content:center;border-radius:50%;background:rgba(255,255,255,.17);font-style:normal;border:1px solid rgba(255,255,255,.25)}.po-step.done i{background:#dfffea;color:#13763b}.po-step.active i{background:#ffd233;color:#061b49}.po-step.active{color:#fff}
      .po-body{padding:18px;background:linear-gradient(180deg,#fff,#f8fbff)}.po-note{background:#fff9e7;border:1px solid #ffe19a;border-radius:20px;padding:14px 15px;color:#74430a;font-weight:900;line-height:1.6;margin-bottom:14px}.po-actions{display:grid;gap:12px}.po-action{display:flex;gap:14px;align-items:center;text-decoration:none;background:#fff;border:1px solid #dbe7ff;border-radius:20px;padding:15px 14px;color:#10203b;box-shadow:0 10px 24px rgba(15,31,68,.06)}.po-icon{width:48px;height:48px;border-radius:16px;background:linear-gradient(135deg,#0b56d8,#2c7cff);display:flex;align-items:center;justify-content:center;font-size:24px;flex:0 0 auto}.po-action b{display:block;font-size:18px}.po-action span{display:block;margin-top:3px;color:#65748a;font-size:13px;font-weight:800}.po-arrow{margin-left:auto;color:#0b56d8;font-size:24px;font-weight:1000}
      .po-section{border-top:1px solid #e3ecfb;margin-top:16px;padding-top:16px}.po-section h3{margin:0 0 10px;font-size:21px}.po-empty{border:1px dashed #cad8f1;background:#fff;border-radius:18px;padding:18px;text-align:center;color:#6b7c94;font-weight:900}.po-cert{display:flex;justify-content:space-between;gap:10px;border:1px solid #dbe7ff;background:#fff;border-radius:16px;padding:12px;margin-top:8px}.po-lock{background:#eef3fb;color:#52647d;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:1000}.po-av{background:#f8fbff;border:1px solid #dbe7ff;border-radius:18px;padding:14px;color:#63738a;font-weight:900;line-height:1.5}
      @media(max-width:520px){.po-title{font-size:24px}.po-body{padding:15px}.po-action b{font-size:16px}.po-steps{gap:5px}.po-step{font-size:11px}.po-step i{width:30px;height:30px}}
    `;
    document.head.appendChild(style);
  }
  function ensurePanel(){
    let panel = document.getElementById('partnerOnboardingPanel');
    if (panel) return panel;
    const sec = document.getElementById('sec-new') || document.querySelector('.app') || document.body;
    panel = document.createElement('div');
    panel.id = 'partnerOnboardingPanel';
    panel.innerHTML = '<div class="po-shell"><div class="po-body">กำลังโหลดสถานะพาร์ทเนอร์...</div></div>';
    sec.insertBefore(panel, sec.firstChild);
    return panel;
  }
  function stepClass(ok, firstOpen){ return ok ? 'done' : firstOpen ? 'active' : ''; }
  function link(base, app){
    const q = new URLSearchParams({ code: app.application_code || '', phone: app.phone || '' });
    return `${base}?${q.toString()}`;
  }
  async function render(){
    injectStyle();
    const panel = ensurePanel();
    try {
      const data = await api('/tech/partner-onboarding');
      if (!data.partner) { panel.style.display = 'none'; return; }
      const p = data.partner;
      const app = p.application || {};
      const s = p.stages || {};
      const certs = p.certifications || [];
      const approved = certs.filter(c => c.status === 'approved');
      const firstOpen = !s.documents_pending ? 'agreement' : 'documents';
      const canWork = !!s.real_jobs_unlocked;
      panel.innerHTML = `<div class="po-shell">
        <div class="po-hero">
          <h2 class="po-title">สถานะพาร์ทเนอร์ CWF</h2>
          <div class="po-sub">${app.full_name || ''} · ${app.status || 'submitted'}</div>
          <div class="po-status">${canWork ? 'พร้อมรับงานบางประเภท' : 'ยังรับงานจริงไม่ได้'}</div>
          <div class="po-steps">
            <div class="po-step ${stepClass(!s.documents_pending, firstOpen==='documents')}"><i>1</i>เอกสาร</div>
            <div class="po-step ${stepClass(!!s.agreement_signed, firstOpen==='agreement')}"><i>2</i>สัญญา</div>
            <div class="po-step ${stepClass(!!s.exam_passed, false)}"><i>3</i>อบรม/สอบ</div>
            <div class="po-step ${stepClass(canWork, false)}"><i>4</i>อนุมัติ</div>
          </div>
        </div>
        <div class="po-body">
          <div class="po-note">ทำขั้นตอนให้ครบ แล้วรอแอดมินตรวจสอบก่อนเริ่มรับงานจริง</div>
          <div class="po-actions">
            <a class="po-action" href="${link('/partner-status.html', app)}"><div class="po-icon">📁</div><div><b>อัปโหลดเอกสาร / รูปโปรไฟล์</b><span>ส่งเอกสารให้ครบเพื่อยืนยันตัวตน</span></div><div class="po-arrow">›</div></a>
            <a class="po-action" href="${link('/partner-agreement.html', app)}"><div class="po-icon">✍️</div><div><b>อ่านและเซ็นสัญญา</b><span>อ่านเงื่อนไขและเซ็นบนหน้าจอ</span></div><div class="po-arrow">›</div></a>
            <a class="po-action" href="${link('/partner-academy.html', app)}"><div class="po-icon">🎓</div><div><b>อบรมและทำข้อสอบ Academy</b><span>ดูบทเรียนให้ครบก่อนทำข้อสอบ</span></div><div class="po-arrow">›</div></a>
          </div>
          <div class="po-section"><h3>สิทธิ์งานที่อนุมัติ</h3>${approved.length ? approved.map(c => `<div class="po-cert"><b>${CERT_LABELS[c.certification_code] || c.certification_code}</b><span class="po-lock">เปิดสิทธิ์แล้ว</span></div>`).join('') : '<div class="po-empty">ยังไม่มี certification ที่อนุมัติ</div>'}</div>
          <div class="po-section"><h3>เวลารับงาน</h3>${canWork ? '<div class="po-av">เปิดให้ตั้งค่ารับงานได้หลังแอดมินอนุมัติสิทธิ์งานแล้ว</div>' : '<div class="po-av">ยังไม่เปิดให้ตั้งเวลารับงาน จนกว่าจะมี certification ที่อนุมัติอย่างน้อย 1 ประเภท</div>'}</div>
        </div>
      </div>`;
    } catch(e) {
      panel.innerHTML = `<div class="po-shell"><div class="po-body">โหลดสถานะพาร์ทเนอร์ไม่สำเร็จ: ${e.message}</div></div>`;
    }
  }
  document.addEventListener('DOMContentLoaded', render);
})();
