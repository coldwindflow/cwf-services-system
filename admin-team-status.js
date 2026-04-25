/* CWF Team Status Forge - Phase 1: Technician Base Status (isolated) */
(function(){
  const $ = (id)=>document.getElementById(id);
  let people = [];
  let currentTech = null;

  const CAPABILITIES = [
    ['basic_clean','ล้างแอร์ผนัง'], ['premium_clean','ล้างพรีเมียม'], ['coil_clean','แขวนคอยล์'], ['overhaul','ตัดล้างใหญ่'],
    ['cassette_or_hanging','ล้างแอร์แขวน/สี่ทิศทาง'], ['install','ติดตั้งแอร์'], ['relocate','ย้ายแอร์'], ['leak_repair','ซ่อมรั่ว'],
    ['refrigerant','เติมน้ำยา/เช็กระบบน้ำยา'], ['electrical','เช็กไฟ/บอร์ด/คาปา/มอเตอร์'], ['complex_diagnosis','วิเคราะห์อาการเสียซับซ้อน']
  ];

  const EVIDENCE_HINT = '0=ตอบลอย ๆ, 1=มีเหตุการณ์ไม่ชัด, 2=มีเหตุการณ์+ผลลัพธ์, 3=มีคนยืนยัน, 4=มีตัวเลข+ทำซ้ำได้, 5=ทำเป็นระบบ/คู่มือได้';

  function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m])); }
  function imgSrc(path){ return path || 'logo.png'; }
  function arr(v){ return Array.isArray(v) ? v : []; }

  function initScoreSelects(root=document){
    root.querySelectorAll('select[name^="evidence_"]').forEach(sel=>{
      if (sel.children.length) return;
      for (let i=0;i<=5;i++){
        const op = document.createElement('option');
        op.value = String(i); op.textContent = `${i} คะแนน`;
        sel.appendChild(op);
      }
      sel.value = '2';
      sel.title = EVIDENCE_HINT;
    });
  }

  function initCapabilities(){
    const box = $('capabilityChecks');
    box.innerHTML = CAPABILITIES.map(([k,label])=>`<label class="check"><input type="checkbox" name="capability" value="${k}"><span>${label}</span></label>`).join('');
  }

  function evidenceBlock(key, title, fields){
    return `<div class="card" style="box-shadow:none;background:#f8fafc">
      <div style="font-weight:1000;margin-bottom:8px">${title}</div>
      <div class="formGrid">${fields.map(([name,ph])=>`<div class="field"><label>${ph}</label><textarea name="${key}_${name}"></textarea></div>`).join('')}</div>
      <div class="field score"><label>คะแนนหลักฐาน ${key.toUpperCase()}</label><select name="evidence_${key}"></select><div class="muted" style="margin-top:6px">${EVIDENCE_HINT}</div></div>
    </div>`;
  }

  function initEvidenceFields(){
    $('evidenceFields').innerHTML = [
      evidenceBlock('q5','Q5. งานยากที่สุดที่เคยจบเองคืออะไร?', [['problem','อาการ/ปัญหาคืออะไร'],['why_hard','ทำไมยาก'],['solution','แก้ด้วยวิธีไหน'],['hours','ใช้เวลากี่ชั่วโมง'],['feedback','ลูกค้าหรือหัวหน้าพูดอะไรหลังจบ']]),
      evidenceBlock('q6','Q6. เคยมีงานที่ทำพลาดไหม?', [['mistake','พลาดอะไร'],['damage','เสียหายอะไร'],['fix','แก้ยังไง'],['changed','หลังจากนั้นเปลี่ยนวิธีทำงานอะไร']])
    ].join('');
    initScoreSelects($('evidenceFields'));
  }

  function latestRank(t){ return t?.latest_status?.rank || 'ยังไม่ประเมิน'; }
  function latestLevel(t){ return t?.latest_status?.level || '-'; }
  function topItems(v){ return arr(v).slice(0,3); }

  function personCard(t){
    const st = t.latest_status;
    const rank = st ? st.rank : 'none';
    const strengths = topItems(st?.strengths_json || st?.strengths || []);
    const risks = topItems(st?.risk_points_json || st?.restricted_jobs_json || []);
    return `<div class="person" data-rank="${escapeHtml(rank)}" data-search="${escapeHtml(`${t.username} ${t.full_name||''} ${t.phone||''}`.toLowerCase())}">
      <img class="avatar" src="${escapeHtml(imgSrc(t.photo_path))}" onerror="this.src='logo.png'" alt="profile">
      <div class="pbody">
        <div class="name">${escapeHtml(t.full_name || t.username)}</div>
        <div class="muted">${escapeHtml(t.username)} • ${escapeHtml(t.employment_type || '-')} • ${escapeHtml(t.phone || '-')}</div>
        <div class="mini"><span class="pill rank">Rank ${escapeHtml(latestRank(t))}</span><span class="pill yellow">Lv. ${escapeHtml(latestLevel(t))}</span><span class="pill">${st ? 'ประเมินแล้ว' : 'ยังไม่มี Base Status'}</span>${t.pending_status ? '<span class="pill yellow">ช่างส่งเอง: รอตรวจ</span>' : ''}</div>
        ${strengths.length ? `<div class="muted">เด่น: ${strengths.map(escapeHtml).join(' • ')}</div>` : ''}
        ${risks.length ? `<div class="muted">ต้องระวัง: ${risks.map(escapeHtml).join(' • ')}</div>` : ''}
        <div class="actions"><button class="btn yellow" data-action="assess" data-username="${escapeHtml(t.username)}">ประเมิน</button><button class="btn blue" data-action="view" data-username="${escapeHtml(t.username)}">ดู Status</button></div>
      </div>
    </div>`;
  }

  function renderPeople(){
    const q = String($('searchBox').value||'').toLowerCase().trim();
    const rf = String($('rankFilter').value||'');
    let rows = people.filter(t=>{
      const hay = `${t.username} ${t.full_name||''} ${t.phone||''}`.toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (rf){
        const has = !!t.latest_status;
        if (rf === 'none') return !has;
        return has && String(t.latest_status.rank) === rf;
      }
      return true;
    });
    $('peopleGrid').innerHTML = rows.length ? rows.map(personCard).join('') : '<div class="empty">ไม่พบรายชื่อช่างตามเงื่อนไข</div>';
  }

  async function loadPeople(){
    $('peopleGrid').innerHTML = '<div class="empty">กำลังโหลด...</div>';
    try{
      const r = await apiFetch('/admin/api/team-status');
      people = r.people || [];
      renderPeople();
    }catch(e){
      $('peopleGrid').innerHTML = `<div class="empty">โหลดไม่สำเร็จ: ${escapeHtml(e.message)}</div>`;
      showToast(e.message || 'โหลดไม่สำเร็จ','error');
    }
  }

  function openModal(){ $('assessmentModal').style.display='flex'; }
  function closeModal(){ $('assessmentModal').style.display='none'; currentTech=null; }
  function openResult(){ $('resultModal').style.display='flex'; }
  function closeResult(){ $('resultModal').style.display='none'; }

  async function openAssess(username){
    try{
      const r = await apiFetch(`/admin/api/technicians/${encodeURIComponent(username)}/base-status`);
      currentTech = r.technician;
      $('modalTitle').textContent = `ประเมิน Base Status: ${currentTech.full_name || currentTech.username}`;
      $('modalSub').textContent = `${currentTech.username} • ใช้รูปโปรไฟล์เดิมในระบบเพื่อแสดงตัวตนเท่านั้น`;
      $('assessmentForm').reset();
      initScoreSelects($('assessmentForm'));
      openModal();
    }catch(e){ showToast(e.message || 'เปิดแบบประเมินไม่สำเร็จ','error'); }
  }

  function collectAnswers(){
    const f = $('assessmentForm');
    const fd = new FormData(f);
    const answers = {
      experience_years: fd.get('experience_years'),
      capabilities: fd.getAll('capability'),
      q3_confident_job: fd.get('q3_confident_job') || '',
      q4_unconfident_job: fd.get('q4_unconfident_job') || '',
      q7_photo_discipline: fd.get('q7_photo_discipline'),
      q8_app_updates: fd.get('q8_app_updates'),
      q9_price_issue: fd.get('q9_price_issue'),
      q10_customer_handling: fd.get('q10_customer_handling') || '',
      q11_heavy_day: fd.get('q11_heavy_day'),
      q12_no_supervision: fd.get('q12_no_supervision') || '',
      q13_work_style: fd.get('q13_work_style'),
      q14_disagree: fd.get('q14_disagree'),
      q15_growth_plan: { raw: fd.get('q15_growth_plan') || '', technical: fd.get('q15_growth_plan') || '' },
      q16_growth_role: fd.get('q16_growth_role'),
      q5: {}, q6: {}, evidence_scores: {}
    };
    ['problem','why_hard','solution','hours','feedback'].forEach(k=>answers.q5[k]=fd.get(`q5_${k}`)||'');
    ['mistake','damage','fix','changed'].forEach(k=>answers.q6[k]=fd.get(`q6_${k}`)||'');
    ['q5','q6','q10','q12'].forEach(k=>answers.evidence_scores[k] = Number(fd.get(`evidence_${k}`)||0));
    return answers;
  }

  async function submitAssessment(ev){
    ev.preventDefault();
    if (!currentTech) return;
    const answers = collectAnswers();
    try{
      const r = await apiFetch(`/admin/api/technicians/${encodeURIComponent(currentTech.username)}/base-status`, { method:'POST', body: JSON.stringify({ answers }) });
      showToast('บันทึก Base Status แล้ว','success');
      closeModal();
      await loadPeople();
      renderResult(r.technician, r.assessment);
    }catch(e){ showToast(e.message || 'บันทึกไม่สำเร็จ','error'); }
  }

  async function viewStatus(username){
    try{
      const r = await apiFetch(`/admin/api/technicians/${encodeURIComponent(username)}/status`);
      renderResult(r.technician, r.latest, r.future_work_adjustment || []);
    }catch(e){ showToast(e.message || 'โหลด Status ไม่สำเร็จ','error'); }
  }

  function statRows(stats){
    const labels = {SKILL:'SKILL ทักษะช่าง',END:'END ความอึด',WIS:'WIS แก้ปัญหา',INT:'INT วิเคราะห์',DISC:'DISC วินัย',SERVICE:'SERVICE บริการ',COMM:'COMM สื่อสาร',TEAM:'TEAM ทีม',TRUST:'TRUST ไว้ใจ',GROWTH:'GROWTH เติบโต'};
    return Object.keys(labels).map(k=>{ const v = Number(stats?.[k]||0); return `<div class="statRow"><b>${labels[k]}</b><div class="bar"><i style="width:${Math.max(0,Math.min(100,v))}%"></i></div><b>${v}</b></div>`; }).join('');
  }

  function list(title, items){
    items = arr(items);
    return `<div class="card" style="box-shadow:none"><div class="sectionTitle">${escapeHtml(title)}</div>${items.length ? items.map(x=>`<div class="listLine">${escapeHtml(x)}</div>`).join('') : '<div class="muted">—</div>'}</div>`;
  }

  function renderResult(tech, st, future=[]){
    if (!st){
      $('resultSub').textContent = tech.username;
      $('resultBody').innerHTML = `<div class="resultHead"><img class="avatar" src="${escapeHtml(imgSrc(tech.photo_path))}" onerror="this.src='logo.png'"><div><h2 style="margin:0">${escapeHtml(tech.full_name||tech.username)}</h2><div class="muted">ยังไม่มี Base Status</div><div style="margin-top:10px"><button class="btn yellow" data-action="assess" data-username="${escapeHtml(tech.username)}">เริ่มประเมิน</button></div></div></div>`;
      openResult(); return;
    }
    const stats = st.stats_json || st.stats || {};
    $('resultSub').textContent = `${tech.username} • Last: ${st.created_at ? new Date(st.created_at).toLocaleString('th-TH') : '-'}`;
    $('resultBody').innerHTML = `
      <div class="resultHead"><img class="avatar" src="${escapeHtml(imgSrc(tech.photo_path))}" onerror="this.src='logo.png'"><div><h2 style="margin:0">${escapeHtml(tech.full_name||tech.username)}</h2><div class="muted">${escapeHtml(tech.username)} • ${escapeHtml(tech.employment_type||'-')}</div><div class="rankBox"><span class="pill rank">Rank ${escapeHtml(st.rank)}</span><span class="pill yellow">Base Lv. ${escapeHtml(st.level)}</span><span class="pill">Decision Support</span><span class="pill ${String(st.review_status||'')==='pending_review' ? 'yellow' : ''}">${escapeHtml(String(st.review_status||'verified')==='pending_review' ? 'ช่างส่งเอง / รอตรวจ' : 'Verified')}</span></div></div></div>
      <div class="hr"></div>
      <div class="resultGrid"><div class="card" style="box-shadow:none"><div class="sectionTitle">Status Bars</div>${statRows(stats)}</div><div>${list('เหมาะกับงาน', st.suitable_jobs_json || st.suitable_jobs)}${list('ข้อจำกัด / ความเสี่ยง', st.restricted_jobs_json || st.risk_points_json)}</div></div>
      <div class="resultGrid">${list('จุดแข็ง', st.strengths_json)}${list('แผนพัฒนา 30 วัน', st.development_plan_json)}</div>
      <div class="card" style="box-shadow:none"><div class="sectionTitle">Future Work Adjustment</div><div class="muted">ยังไม่ปรับจากงานจริงใน Phase 1 ต่อไปค่อยนำข้อมูลจริงมาเพิ่ม/หักคะแนน</div>${arr(future).map(x=>`<span class="pill" style="margin:6px 6px 0 0">${escapeHtml(x)}</span>`).join('')}</div>
      <div class="card" style="box-shadow:none"><div class="sectionTitle">RPG Character Prompt</div><div class="promptBox" id="promptText">${escapeHtml(st.generated_prompt || '')}</div><button class="btn blue" id="btnCopyPrompt" style="margin-top:10px">คัดลอก Prompt</button></div>
      <div class="disclaimer">Base Status เป็นการประเมินเบื้องต้นจากคำตอบและหลักฐานก่อนเริ่มงาน คะแนนจริงต้องปรับด้วยผลงานจริงหลังเริ่มงาน และใช้เพื่อประกอบการตัดสินใจ ไม่ใช่คำตัดสินอัตโนมัติจากระบบ</div>
    `;
    openResult();
  }

  function fillDemo(){
    const f = $('assessmentForm');
    f.querySelector('[name="experience_years"]').value = '3-5';
    f.querySelectorAll('[name="capability"]').forEach((c,i)=>{ c.checked = i < 5; });
    f.querySelector('[name="q3_confident_job"]').value = 'ล้างพรีเมียมและแขวนคอยล์ ทำซ้ำได้หลายครั้ง เคยเจอถาดตันและจัดการได้';
    f.querySelector('[name="q4_unconfident_job"]').value = 'ยังไม่มั่นใจงานซ่อมรั่วและบอร์ด ต้องการให้หัวหน้าคุมก่อน';
    f.querySelector('[name="q5_problem"]').value = 'แอร์น้ำหยดและถาดตันซ้ำ';
    f.querySelector('[name="q5_why_hard"]').value = 'ลูกค้าเคยแก้หลายรอบไม่จบ';
    f.querySelector('[name="q5_solution"]').value = 'ถอดล้าง ตรวจถาดและท่อ เดินน้ำใหม่';
    f.querySelector('[name="q5_hours"]').value = '3 ชั่วโมง';
    f.querySelector('[name="q5_feedback"]').value = 'ลูกค้าบอกจบกว่ารอบก่อน';
    f.querySelector('[name="evidence_q5"]').value = '3';
    f.querySelector('[name="q6_mistake"]').value = 'เคยลืมถ่ายรูปก่อนงาน';
    f.querySelector('[name="q6_damage"]').value = 'แอดมินไม่มีหลักฐานส่งลูกค้า';
    f.querySelector('[name="q6_fix"]').value = 'แจ้งหัวหน้าและถ่ายหลังงานเพิ่ม';
    f.querySelector('[name="q6_changed"]').value = 'ตั้งเตือนก่อนเริ่มงาน';
    f.querySelector('[name="evidence_q6"]').value = '3';
    f.querySelector('[name="q10_customer_handling"]').value = 'ตอบตามจริง อธิบายขั้นตอน ไม่ขึ้นเสียง และแจ้งแอดมินถ้าต้องเพิ่มราคา';
    f.querySelector('[name="evidence_q10"]').value = '3';
    f.querySelector('[name="q12_no_supervision"]').value = 'ทำความสะอาดถาดน้ำและฟิลเตอร์เพิ่มแม้ลูกค้าไม่เห็น เพราะกลัวปัญหาซ้ำ';
    f.querySelector('[name="evidence_q12"]').value = '3';
    f.querySelector('[name="q15_growth_plan"]').value = 'อยากฝึกซ่อมรั่ว การสื่อสารลูกค้า และการใช้แอพให้ครบขั้นตอน';
  }

  document.addEventListener('click', (e)=>{
    const b = e.target.closest('button,[data-action]'); if(!b) return;
    const action = b.getAttribute('data-action');
    const username = b.getAttribute('data-username');
    if (action === 'assess' && username){ closeResult(); openAssess(username); }
    if (action === 'view' && username){ viewStatus(username); }
  });

  document.addEventListener('DOMContentLoaded', ()=>{
    initCapabilities(); initEvidenceFields(); initScoreSelects();
    $('btnReload').addEventListener('click', loadPeople);
    $('searchBox').addEventListener('input', renderPeople);
    $('rankFilter').addEventListener('change', renderPeople);
    $('btnCloseModal').addEventListener('click', closeModal);
    $('btnCloseResult').addEventListener('click', closeResult);
    $('assessmentForm').addEventListener('submit', submitAssessment);
    $('btnFillDemo').addEventListener('click', fillDemo);
    document.addEventListener('click', async (e)=>{
      if (e.target && e.target.id === 'btnCopyPrompt'){
        const txt = $('promptText')?.textContent || '';
        try{ await navigator.clipboard.writeText(txt); showToast('คัดลอก Prompt แล้ว','success'); }catch(_){ showToast('คัดลอกไม่สำเร็จ','error'); }
      }
    });
    loadPeople();
  });
})();
