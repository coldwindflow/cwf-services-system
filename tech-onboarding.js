(function(){
  'use strict';

  const CERT_LABELS = {
    cwf_basic_partner:'Basic Partner', clean_wall_normal:'ล้างผนังปกติ', clean_wall_premium:'ล้างผนังพรีเมียม',
    clean_wall_hanging_coil:'ล้างแขวนคอยล์', clean_wall_overhaul:'ตัดล้างใหญ่', clean_ceiling_suspended:'ล้างแขวน/ใต้ฝ้า',
    clean_cassette_4way:'ล้างสี่ทิศทาง', clean_duct_type:'ล้างท่อลม', repair_diagnosis_basic:'ตรวจเช็กอาการ',
    repair_water_leak:'แก้น้ำรั่ว', repair_electrical_basic:'ไฟฟ้าเบื้องต้น', repair_refrigerant_basic:'ระบบน้ำยา',
    repair_parts_replacement:'เปลี่ยนอะไหล่', install_wall_standard:'ติดตั้งผนัง', install_condo:'ติดตั้งคอนโด', install_relocation:'ย้ายแอร์'
  };

  const STATUS_LABELS = {
    submitted:'ส่งใบสมัครแล้ว', under_review:'รอตรวจสอบ', need_more_documents:'ต้องส่งเอกสารเพิ่ม', rejected:'ไม่ผ่าน', approved_for_training:'พร้อมเข้าอบรม',
    not_started:'ยังไม่เริ่ม', in_training:'กำลังอบรม', exam_ready:'พร้อมสอบ', exam_failed:'สอบไม่ผ่าน', exam_passed:'สอบผ่าน', trial_unlocked:'ทดลองงาน', approved:'อนุมัติแล้ว', suspended:'พักสิทธิ์', revoked:'ยกเลิกสิทธิ์'
  };

  function injectStyle(){
    if (document.getElementById('partnerOnboardingStyle')) return;
    const style = document.createElement('style');
    style.id = 'partnerOnboardingStyle';
    style.textContent = `
      #partnerOnboardingPanel{border:0!important;border-radius:28px!important;padding:0!important;overflow:hidden!important;background:#fff!important;box-shadow:0 18px 48px rgba(3,18,58,.12)!important;margin-bottom:18px!important}
      .po-hero{background:linear-gradient(135deg,#071b49,#0b4bb3);color:#fff;padding:18px 18px 16px}
      .po-title{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
      .po-title h2{margin:0!important;color:#fff!important;font-size:24px!important;line-height:1.15!important}
      .po-sub{margin-top:5px;color:rgba(255,255,255,.78);font-weight:800;font-size:13px}
      .po-body{padding:16px;background:linear-gradient(180deg,#fff,#f7faff)}
      .po-alert{border-left:5px solid #facc15;background:#fff8db;border-radius:18px;padding:13px 14px;color:#754400;font-weight:900;line-height:1.55;margin-bottom:14px}
      .po-ok{border-left-color:#22c55e;background:#ecfdf5;color:#166534}
      .po-progress{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0 14px}
      .po-step{border:1px solid #dbe7ff;background:#fff;border-radius:16px;padding:10px 8px;text-align:center;min-height:82px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px}
      .po-step .num{width:30px;height:30px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:#eaf1ff;color:#0b2e6d;font-weight:1000}
      .po-step.done{background:#ecfdf5;border-color:#bbf7d0}.po-step.done .num{background:#22c55e;color:#fff}
      .po-step.wait{background:#fff7ed;border-color:#fed7aa}.po-step.wait .num{background:#f97316;color:#fff}
      .po-step b{font-size:12px;color:#10264f;line-height:1.25}.po-step span{font-size:11px;color:#64748b;font-weight:800;line-height:1.25}
      .po-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:12px 0 14px}
      .po-btn{min-height:58px;border:0;border-radius:18px;text-decoration:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-weight:1000;color:#071b49;background:#eef4ff;box-shadow:0 8px 20px rgba(11,46,109,.06)}
      .po-btn.primary{background:linear-gradient(135deg,#facc15,#f59e0b);color:#111827}.po-btn.blue{background:linear-gradient(135deg,#0b4bb3,#1558d6);color:#fff}.po-btn small{font-size:11px;opacity:.82}
      .po-section{border:1px solid #dbe7ff;background:#fff;border-radius:20px;padding:14px;margin-top:12px}.po-section h3{margin:0 0 10px!important;color:#071b49!important;font-size:18px!important}
      .po-cert-grid{display:grid;gap:8px}.po-cert{display:flex;justify-content:space-between;gap:10px;align-items:center;border:1px solid #e0e8f8;background:#f8fbff;border-radius:16px;padding:10px 12px}.po-cert b{font-size:13px;color:#10264f}.po-cert .muted{font-size:12px;color:#64748b;font-weight:800}
      .po-badge{display:inline-flex;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:1000;background:#fef3c7;color:#92400e}.po-badge.ok{background:#dcfce7;color:#166534}.po-badge.no{background:#fee2e2;color:#991b1b}.po-badge.blue{background:#dbeafe;color:#1d4ed8}
      .po-toggle{width:48px;height:28px}.po-locked{font-size:12px;color:#7f1d1d;font-weight:900}
      .po-availability{display:grid;gap:10px}.po-availability label{display:flex;gap:10px;align-items:center;font-weight:900;color:#10264f}.po-availability input{min-height:46px;border-radius:16px;border:1px solid #dbe7ff;padding:10px 12px}.po-inputs{display:grid;grid-template-columns:1fr 1fr;gap:10px}.po-save{border:0;border-radius:16px;min-height:48px;font-weight:1000;background:#071b49;color:#fff}
      @media(max-width:480px){.po-progress{grid-template-columns:repeat(2,1fr)}.po-actions{grid-template-columns:1fr}.po-inputs{grid-template-columns:1fr}.po-title h2{font-size:22px!important}.po-body{padding:14px}}
    `;
    document.head.appendChild(style);
  }

  function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function badge(text, type=''){ return `<span class="po-badge ${type}">${esc(text)}</span>`; }
  function statusText(s){ return STATUS_LABELS[s] || s || '-'; }

  async function api(url, opts){
    const res = await fetch(url, { credentials:'include', headers:{'Content-Type':'application/json'}, ...(opts || {}) });
    const data = await res.json().catch(()=>null);
    if (!res.ok) throw new Error(data?.error || 'Request failed');
    return data;
  }

  function ensurePanel(){
    injectStyle();
    const existing = document.getElementById('partnerOnboardingPanel');
    if (existing) return existing;
    const sec = document.getElementById('sec-new') || document.querySelector('.app');
    if (!sec) return null;
    const div = document.createElement('div');
    div.id = 'partnerOnboardingPanel';
    div.className = 'card tight';
    div.innerHTML = '<div class="po-body"><b>กำลังโหลดสถานะพาร์ทเนอร์...</b></div>';
    sec.insertBefore(div, sec.firstChild);
    return div;
  }

  function makeLinks(app){
    const code = app.application_code || '';
    const phone = app.phone || '';
    return {
      status:`/partner-status.html?code=${encodeURIComponent(code)}&phone=${encodeURIComponent(phone)}`,
      agreement:`/partner-agreement.html?code=${encodeURIComponent(code)}`,
      academy:`/partner-academy.html?code=${encodeURIComponent(code)}`,
    };
  }

  function step(label, done, desc){
    return `<div class="po-step ${done ? 'done' : 'wait'}"><div class="num">${done ? '✓' : '!'}</div><b>${esc(label)}</b><span>${esc(desc)}</span></div>`;
  }

  function renderCerts(certs){
    if (!certs.length) return '<div class="po-cert"><div><b>ยังไม่มี certification ที่อนุมัติ</b><div class="muted">ต้องอบรม/สอบ และรอแอดมินอนุมัติก่อน</div></div></div>';
    return certs.map(c => {
      const approved = c.status === 'approved';
      const disabled = approved ? '' : 'disabled';
      const enabled = c.preference_enabled ? 'checked' : '';
      return `<div class="po-cert">
        <div><b>${esc(CERT_LABELS[c.certification_code] || c.certification_code)}</b><div class="muted">${esc(statusText(c.status))}</div></div>
        <div>${approved ? `<input class="po-toggle" type="checkbox" data-cert="${esc(c.certification_code)}" ${enabled}>` : '<span class="po-locked">ล็อกอยู่</span>'}</div>
      </div>`;
    }).join('');
  }

  function renderAvailability(av){
    return `<div class="po-availability">
      <label><input id="partnerPaused" type="checkbox" ${av.paused === false ? '' : 'checked'}> พักรับงานชั่วคราว</label>
      <div class="po-inputs">
        <input id="partnerMaxJobs" type="number" min="0" placeholder="งาน/วัน" value="${esc(av.max_jobs_per_day || '')}">
        <input id="partnerMaxUnits" type="number" min="0" placeholder="เครื่อง/วัน" value="${esc(av.max_units_per_day || '')}">
      </div>
      <button id="savePartnerAvailability" class="po-save" type="button">บันทึกเวลารับงาน</button>
    </div>`;
  }

  async function render(){
    const panel = ensurePanel();
    if (!panel) return;
    try {
      const data = await api('/tech/partner-onboarding');
      if (!data.partner) { panel.style.display = 'none'; return; }
      const p = data.partner;
      const app = p.application || {};
      const stages = p.stages || {};
      const links = makeLinks(app);
      const certs = p.certifications || [];
      const av = p.availability || {};
      const canReceiveJobs = !!stages.real_jobs_unlocked;
      const docsOk = !stages.documents_pending && (app.documents || []).length > 0;
      const academyOk = !!stages.basic_training_done;
      const examOk = !!stages.exam_passed;
      const agreementOk = !!stages.agreement_signed;

      panel.innerHTML = `
        <div class="po-hero">
          <div class="po-title">
            <div><h2>สถานะพาร์ทเนอร์ CWF</h2><div class="po-sub">${esc(app.full_name || '')} • ${esc(statusText(app.status))}</div></div>
            ${canReceiveJobs ? badge('เริ่มเปิดรับงานบางประเภทได้','ok') : badge('ยังรับงานจริงไม่ได้','no')}
          </div>
        </div>
        <div class="po-body">
          <div class="po-alert ${canReceiveJobs ? 'po-ok' : ''}">
            ${canReceiveJobs ? 'แอดมินอนุมัติ certification บางประเภทแล้ว เลือกเปิด/ปิดประเภทงานที่ต้องการรับได้ด้านล่าง' : 'ยังรับงานจริงไม่ได้ กรุณาทำขั้นตอน onboarding ให้ครบ และรอแอดมินอนุมัติ certification'}
          </div>

          <div class="po-progress">
            ${step('เอกสาร', docsOk, docsOk ? 'ตรวจแล้ว' : 'ต้องอัปโหลด/รอตรวจ')}
            ${step('สัญญา', agreementOk, agreementOk ? 'เซ็นแล้ว' : 'ต้องอ่านและเซ็น')}
            ${step('อบรม', academyOk, academyOk ? 'ครบแล้ว' : 'เรียนให้ครบ')}
            ${step('สอบ', examOk, examOk ? 'ผ่านแล้ว' : 'ทำข้อสอบ')}
          </div>

          <div class="po-actions">
            <a class="po-btn primary" href="${links.status}">📷 อัปโหลดเอกสาร<small>รูปโปรไฟล์ / บัตร / บัญชี</small></a>
            <a class="po-btn blue" href="${links.agreement}">📝 อ่านและเซ็นสัญญา<small>ยืนยันเงื่อนไข</small></a>
            <a class="po-btn" href="${links.academy}">🎓 อบรม / สอบ<small>ปลดล็อกสิทธิ์งาน</small></a>
          </div>

          <div class="po-section">
            <h3>ประเภทงานที่ได้รับสิทธิ์</h3>
            <div class="po-cert-grid">${renderCerts(certs)}</div>
          </div>

          <div class="po-section">
            <h3>${canReceiveJobs ? 'ตั้งค่าการรับงาน' : 'ตั้งค่ารับงานยังไม่เปิด'}</h3>
            ${canReceiveJobs ? renderAvailability(av) : '<div class="muted" style="font-weight:900;line-height:1.6">ระบบจะเปิดให้ตั้งเวลารับงานหลังแอดมินอนุมัติ certification แล้ว เพื่อไม่ให้ช่างเปิดรับงานก่อนมีสิทธิ์จริง</div>'}
          </div>
        </div>
      `;
    } catch (e) {
      panel.innerHTML = `<div class="po-body"><b>สถานะพาร์ทเนอร์</b><div class="muted" style="margin-top:6px">${esc(e.message)}</div></div>`;
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
