(function(){
  const CERT_LABELS = {
    cwf_basic_partner:'Basic Partner', clean_wall_normal:'ล้างผนังปกติ', clean_wall_premium:'ล้างผนังพรีเมียม', clean_wall_hanging_coil:'ล้างแขวนคอยล์', clean_wall_overhaul:'ตัดล้างใหญ่', clean_ceiling_suspended:'ล้างแขวน/ใต้ฝ้า', clean_cassette_4way:'ล้างสี่ทิศทาง', clean_duct_type:'ล้างท่อลม', repair_diagnosis_basic:'ตรวจเช็กอาการ', repair_water_leak:'แก้น้ำรั่ว', repair_electrical_basic:'ไฟฟ้าเบื้องต้น', repair_refrigerant_basic:'ระบบน้ำยา', repair_parts_replacement:'เปลี่ยนอะไหล่', install_wall_standard:'ติดตั้งผนัง', install_condo:'ติดตั้งคอนโด', install_relocation:'ย้ายแอร์'
  };
  const REQUIRED_DOCS = ['id_card','profile_photo','bank_book'];
  async function api(url, opts){
    const res = await fetch(url, { credentials:'include', headers:{'Content-Type':'application/json'}, ...(opts || {}) });
    const data = await res.json().catch(()=>null);
    if (!res.ok) throw new Error(data?.error || 'Request failed');
    return data;
  }
  function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function ensurePanel(){
    let panel = document.getElementById('partnerOnboardingPanel');
    if (panel) return panel;
    const sec = document.getElementById('sec-new') || document.querySelector('.app') || document.body;
    panel = document.createElement('section');
    panel.id = 'partnerOnboardingPanel';
    panel.className = 'cwf-partner-shell';
    sec.insertBefore(panel, sec.firstChild);
    return panel;
  }
  function injectCss(){
    if (document.getElementById('partnerOnboardingModernCss')) return;
    const css = document.createElement('style');
    css.id = 'partnerOnboardingModernCss';
    css.textContent = `
      .cwf-partner-shell{margin:14px 0 18px;padding:0;border-radius:28px;overflow:hidden;background:#f8fbff;box-shadow:0 20px 44px rgba(6,24,68,.16);border:1px solid #dbe7ff;color:#0f172a}
      .cwf-partner-hero{background:radial-gradient(circle at top right,#1f73ff 0,#0b4bb3 38%,#061b49 100%);color:#fff;padding:22px 18px 18px;position:relative}
      .cwf-partner-hero h2{margin:0;font-size:25px;line-height:1.15;color:#fff}.cwf-partner-hero p{margin:8px 0 0;color:rgba(255,255,255,.86);font-weight:800;line-height:1.55}
      .cwf-status-pill{display:inline-flex;margin-top:12px;border-radius:999px;padding:8px 12px;background:#fff4c7;color:#713f12;font-weight:1000;font-size:13px}.cwf-unlocked{background:#dcfce7;color:#166534}
      .cwf-stepper{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0 0}.cwf-step{text-align:center;min-width:0}.cwf-dot{margin:0 auto 6px;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.25);font-weight:1000}.cwf-step.done .cwf-dot{background:#ffd233;color:#071b49}.cwf-step span{display:block;font-size:11px;font-weight:900;color:#dbeafe;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cwf-step.done span{color:#fff}
      .cwf-partner-body{padding:16px}.cwf-action{display:flex;align-items:center;gap:14px;padding:15px 14px;border-radius:20px;background:#fff;border:1px solid #dbe7ff;box-shadow:0 10px 24px rgba(6,24,68,.06);text-decoration:none;color:#0f172a;margin-bottom:12px}.cwf-icon{width:48px;height:48px;border-radius:16px;display:grid;place-items:center;background:linear-gradient(135deg,#0b4bb3,#2f7dff);color:#fff;font-size:24px;flex:0 0 auto}.cwf-action b{display:block;font-size:18px}.cwf-action small{display:block;color:#64748b;font-weight:800;margin-top:3px}.cwf-arrow{margin-left:auto;font-size:24px;color:#0b4bb3}.cwf-section-title{margin:16px 0 10px;font-size:19px;font-weight:1000;color:#071b49}.cwf-empty{border:1px dashed #cbd7ee;border-radius:20px;padding:18px;text-align:center;background:#fff;color:#64748b;font-weight:900}.cwf-cert-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.cwf-cert{background:#fff;border:1px solid #dbe7ff;border-radius:16px;padding:10px;font-weight:900}.cwf-cert small{display:block;color:#64748b;margin-top:4px}.cwf-lock-note{background:#fff9e8;border:1px solid #ffe39d;border-radius:18px;padding:13px;color:#713f12;font-weight:900;line-height:1.55}
    `;
    document.head.appendChild(css);
  }
  function docsReady(app){
    const docs = app.documents || [];
    return REQUIRED_DOCS.every(type => docs.some(d => d.document_type === type && d.status === 'approved'));
  }
  function link(path, app){
    const code = encodeURIComponent(app.application_code || '');
    const phone = encodeURIComponent(app.phone || '');
    return `${path}?code=${code}&phone=${phone}`;
  }
  async function render(){
    injectCss();
    const panel = ensurePanel();
    try {
      const data = await api('/tech/partner-onboarding');
      if (!data.partner) { panel.style.display = 'none'; return; }
      const p = data.partner;
      const app = p.application || {};
      const certs = (p.certifications || []).filter(c => c.status === 'approved');
      const readyDocs = docsReady(app);
      const steps = [
        ['เอกสาร', readyDocs],
        ['สัญญา', !!p.stages?.agreement_signed],
        ['อบรม/สอบ', !!p.stages?.exam_passed],
        ['อนุมัติ', !!p.stages?.real_jobs_unlocked],
      ];
      panel.innerHTML = `
        <div class="cwf-partner-hero">
          <h2>สถานะพาร์ทเนอร์ CWF</h2>
          <p>${esc(app.full_name || '')} • ${esc(app.status || 'submitted')}</p>
          <span class="cwf-status-pill ${p.stages?.real_jobs_unlocked ? 'cwf-unlocked' : ''}">${p.stages?.real_jobs_unlocked ? 'เริ่มรับงานได้บางประเภท' : 'ยังรับงานจริงไม่ได้'}</span>
          <div class="cwf-stepper">${steps.map(([t,ok],i)=>`<div class="cwf-step ${ok?'done':''}"><div class="cwf-dot">${ok?'✓':i+1}</div><span>${esc(t)}</span></div>`).join('')}</div>
        </div>
        <div class="cwf-partner-body">
          <div class="cwf-lock-note">ทำขั้นตอนให้ครบ แล้วรอแอดมินตรวจสอบและอนุมัติ certification ก่อนเริ่มรับงานจริง</div>
          <a class="cwf-action" href="${link('/partner-status.html', app)}"><span class="cwf-icon">📁</span><span><b>อัปโหลดเอกสาร / รูปโปรไฟล์</b><small>ส่งเอกสารให้ครบเพื่อยืนยันตัวตน</small></span><span class="cwf-arrow">›</span></a>
          <a class="cwf-action" href="${link('/partner-agreement.html', app)}"><span class="cwf-icon">✍️</span><span><b>อ่านและเซ็นสัญญา</b><small>ตรวจรายละเอียดก่อนยืนยัน</small></span><span class="cwf-arrow">›</span></a>
          <a class="cwf-action" href="${link('/partner-academy.html', app)}"><span class="cwf-icon">🎓</span><span><b>อบรมและทำข้อสอบ Academy</b><small>ปลดล็อก Basic Partner</small></span><span class="cwf-arrow">›</span></a>
          <div class="cwf-section-title">สิทธิ์งานที่อนุมัติ</div>
          ${certs.length ? `<div class="cwf-cert-grid">${certs.map(c=>`<div class="cwf-cert">${esc(CERT_LABELS[c.certification_code] || c.certification_code)}<small>อนุมัติแล้ว</small></div>`).join('')}</div>` : `<div class="cwf-empty">ยังไม่มี certification ที่อนุมัติ<br><small>เมื่ออนุมัติแล้ว สิทธิ์งานจะแสดงที่นี่</small></div>`}
        </div>`;
    } catch (e) {
      panel.innerHTML = `<div class="cwf-partner-body"><div class="cwf-lock-note">โหลดสถานะพาร์ทเนอร์ไม่สำเร็จ: ${esc(e.message)}</div></div>`;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();