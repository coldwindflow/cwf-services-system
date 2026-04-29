(function(){
  const CERT_LABELS = {
    cwf_basic_partner:'Basic Partner', clean_wall_normal:'ล้างผนังปกติ', clean_wall_premium:'ล้างผนังพรีเมียม', clean_wall_hanging_coil:'ล้างแขวนคอยล์', clean_wall_overhaul:'ตัดล้างใหญ่',
    clean_ceiling_suspended:'ล้างแขวน/ใต้ฝ้า', clean_cassette_4way:'ล้างสี่ทิศทาง', clean_duct_type:'ล้างท่อลม', repair_diagnosis_basic:'ตรวจเช็กอาการ', repair_water_leak:'แก้น้ำรั่ว',
    repair_electrical_basic:'ไฟฟ้าเบื้องต้น', repair_refrigerant_basic:'ระบบน้ำยา', repair_parts_replacement:'เปลี่ยนอะไหล่', install_wall_standard:'ติดตั้งผนัง', install_condo:'ติดตั้งคอนโด', install_relocation:'ย้ายแอร์'
  };
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(url){
    const res = await fetch(url,{credentials:'include'});
    const data = await res.json().catch(()=>null);
    if(!res.ok) throw new Error(data?.error || 'โหลดข้อมูลไม่สำเร็จ');
    return data;
  }
  function stepHtml(n,label,done,current){
    return `<div class="step ${done?'done':''} ${current?'current':''}"><div class="no">${done?'✓':n}</div><b>${esc(label)}</b></div>`;
  }
  function docState(p){
    const docs = p.application?.documents || [];
    const required = ['id_card','profile_photo','bank_book'];
    const uploaded = required.every(t => docs.some(d => d.document_type === t));
    const approved = required.every(t => docs.some(d => d.document_type === t && d.status === 'approved'));
    return { uploaded, approved, count: docs.length };
  }
  function buildTodo(p){
    const d = docState(p);
    const academy = p.academy || {};
    const total = Number(academy.total || 0);
    const completed = Number(academy.completed || 0);
    const rows = [
      ['อัปโหลดเอกสารหลักให้ครบ', d.uploaded, 'บัตรประชาชน รูปโปรไฟล์ และสมุดบัญชี'],
      ['รอแอดมินตรวจเอกสาร', d.approved, 'ถ้าไม่ผ่านให้ดูหมายเหตุและอัปโหลดใหม่'],
      ['อ่านและเซ็นสัญญา', !!p.agreement, 'ต้องติ๊กยอมรับ พิมพ์ชื่อ และเซ็นบนหน้าจอ'],
      ['ดูบทเรียน Academy ให้ครบ', total > 0 && completed >= total, `${completed}/${total || 0} บทเรียน`],
      ['สอบ Basic Partner ให้ผ่าน', !!p.exam?.passed, p.exam ? `คะแนนล่าสุด ${p.exam.score_percent || 0}%` : 'ต้องผ่านอย่างน้อย 80%'],
      ['รอแอดมินอนุมัติสิทธิ์งาน', !!p.stages?.real_jobs_unlocked, 'อนุมัติแยกตาม certification']
    ];
    return rows.map(([title,done,sub])=>`<div class="todo-row ${done?'done':''}"><div class="dot"></div><div><b>${esc(title)}</b><div class="muted">${esc(sub)}</div></div></div>`).join('');
  }
  function render(p){
    const app = p.application || {};
    const d = docState(p);
    const trainingDone = !!p.stages?.basic_training_done;
    const examPassed = !!p.stages?.exam_passed;
    const unlocked = !!p.stages?.real_jobs_unlocked;
    const current = !d.uploaded ? 1 : !p.agreement ? 2 : !(trainingDone && examPassed) ? 3 : 4;
    const qs = `?code=${encodeURIComponent(app.application_code||'')}&phone=${encodeURIComponent(app.phone||'')}`;
    try{ sessionStorage.setItem('cwf_partner_ref', JSON.stringify({code:app.application_code||'', phone:app.phone||''})); }catch(_){}
    $('docLink').href = `/partner-status.html${qs}`;
    $('agreementLink').href = `/partner-agreement.html?code=${encodeURIComponent(app.application_code||'')}`;
    $('academyLink').href = `/partner-academy.html?code=${encodeURIComponent(app.application_code||'')}`;
    $('heroPanel').innerHTML = `
      <div class="hero-head">
        <div><h2>${esc(app.full_name || 'พาร์ทเนอร์ CWF')}</h2><div class="muted">${esc(app.phone || '')} · ${esc(app.application_code || '')}</div></div>
        <span class="badge ${unlocked?'ok':'warn'}">${unlocked?'รับงานได้บางประเภท':'ยังรับงานจริงไม่ได้'}</span>
      </div>
      <div class="progress">
        ${stepHtml(1,'เอกสาร',d.approved,current===1)}
        ${stepHtml(2,'สัญญา',!!p.agreement,current===2)}
        ${stepHtml(3,'อบรม / สอบ',trainingDone && examPassed,current===3)}
        ${stepHtml(4,'อนุมัติ',unlocked,current===4)}
      </div>`;
    $('todoList').innerHTML = buildTodo(p);
    $('profileInfo').innerHTML = `
      <div><b>พื้นที่:</b> ${esc([app.province,app.district].filter(Boolean).join(' / ') || '-')}</div>
      <div><b>รูปแบบงาน:</b> ${esc(app.work_intent || '-')}</div>
      <div><b>บัญชีช่าง:</b> ${esc(app.technician_username || '-')}</div>
      <div><b>สถานะใบสมัคร:</b> ${esc(app.status || '-')}</div>`;
    const approved = (p.certifications || []).filter(c => c.status === 'approved');
    $('certifications').innerHTML = approved.length ? approved.map(c=>`<div class="cert">${esc(CERT_LABELS[c.certification_code] || c.certification_code)}<div class="muted">${c.preference_enabled?'เปิดรับงาน':'ยังปิดรับงาน'}</div></div>`).join('') : `<div class="empty" style="grid-column:1/-1">ยังไม่มี certification ที่อนุมัติ<br><span class="muted">ผ่านอบรม/สอบแล้วรอแอดมินเปิดสิทธิ์งาน</span></div>`;
  }
  async function init(){
    try{
      const res = await api('/tech/partner-onboarding');
      if(!res.partner){
        $('heroPanel').innerHTML = '<div class="muted">บัญชีนี้ยังไม่มีข้อมูลพาร์ทเนอร์</div>';
        return;
      }
      render(res.partner);
    }catch(e){
      $('heroPanel').innerHTML = `<div class="bad" style="font-weight:900">${esc(e.message)}</div>`;
    }
  }
  init();
})();