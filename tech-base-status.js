/* CWF Technician Base Status - self assessment Phase 1.1 */
(function(){
  const $ = (id)=>document.getElementById(id);
  let technician = null;
  let latest = null;

  const CAPABILITIES = [
    ['basic_clean','ล้างแอร์ผนัง'], ['premium_clean','ล้างพรีเมียม'], ['coil_clean','แขวนคอยล์'], ['overhaul','ตัดล้างใหญ่'],
    ['cassette_or_hanging','ล้างแอร์แขวน/สี่ทิศทาง'], ['install','ติดตั้งแอร์'], ['relocate','ย้ายแอร์'], ['leak_repair','ซ่อมรั่ว'],
    ['refrigerant','เติมน้ำยา/เช็กระบบน้ำยา'], ['electrical','เช็กไฟ/บอร์ด/คาปา/มอเตอร์'], ['complex_diagnosis','วิเคราะห์อาการเสียซับซ้อน']
  ];
  const EVIDENCE_HINT = '0=ตอบลอย ๆ, 1=มีเหตุการณ์ไม่ชัด, 2=มีเหตุการณ์+ผลลัพธ์, 3=มีคนยืนยัน, 4=มีตัวเลข+ทำซ้ำได้, 5=ทำเป็นระบบ/คู่มือได้';

  function esc(s){ return String(s ?? '').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
  function arr(v){ if(Array.isArray(v)) return v; if(typeof v==='string'){ try{const x=JSON.parse(v); return Array.isArray(x)?x:[];}catch{return v?[v]:[];} } return []; }
  function obj(v){ if(!v) return {}; if(typeof v==='object') return v; try{return JSON.parse(v);}catch{return {};} }
  function imgSrc(p){ p=String(p||'').trim(); if(!p) return '/logo.png'; if(/^https?:\/\//i.test(p) || p.startsWith('/')) return p; return '/' + p.replace(/^\/+/, ''); }
  function toast(msg){ const d=document.createElement('div'); d.className='toast'; d.textContent=msg; document.body.appendChild(d); setTimeout(()=>d.remove(),2600); }

  async function api(url, opts={}){
    const res = await fetch(url, {
      credentials:'include',
      headers:{ 'Content-Type':'application/json', 'Accept':'application/json', ...(opts.headers||{}) },
      ...opts
    });
    if (res.status === 401 || res.status === 403) {
      location.href = '/login.html';
      throw new Error('กรุณาเข้าสู่ระบบช่าง');
    }
    const data = await res.json().catch(()=>({}));
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function initScoreSelects(root=document){
    root.querySelectorAll('select[name^="evidence_"]').forEach(sel=>{
      if (sel.options.length) return;
      for (let i=0;i<=5;i++){
        const op=document.createElement('option');
        op.value=String(i); op.textContent=`${i} คะแนน`;
        sel.appendChild(op);
      }
      sel.value='2';
    });
  }

  function initCapabilityChecks(){
    $('capabilityChecks').innerHTML = CAPABILITIES.map(([v,t])=>`<label class="check"><input type="checkbox" name="capability" value="${esc(v)}"><span>${esc(t)}</span></label>`).join('');
  }

  function evidenceBlock(key, title, fields){
    return `<div class="card" style="box-shadow:none;background:#f8fafc">
      <div class="sectionTitle">${esc(title)}</div>
      <div class="formGrid">${fields.map(([name,ph])=>`<div class="field"><label>${esc(ph)}</label><textarea name="${key}_${name}"></textarea></div>`).join('')}</div>
      <div class="field"><label>คะแนนหลักฐาน ${key.toUpperCase()}</label><select name="evidence_${key}"></select><div class="muted">${EVIDENCE_HINT}</div></div>
    </div>`;
  }

  function initEvidenceFields(){
    $('evidenceFields').innerHTML = [
      evidenceBlock('q5','Q5. งานยากที่สุดที่เคยจบเองคืออะไร?', [['problem','อาการ/ปัญหาคืออะไร'],['why_hard','ทำไมยาก'],['solution','แก้ด้วยวิธีไหน'],['hours','ใช้เวลากี่ชั่วโมง'],['feedback','ลูกค้าหรือหัวหน้าพูดอะไรหลังจบ']]),
      evidenceBlock('q6','Q6. เคยมีงานที่ทำพลาดไหม?', [['mistake','พลาดอะไร'],['damage','เสียหายอะไร'],['fix','แก้ยังไง'],['changed','หลังจากนั้นเปลี่ยนวิธีทำงานอะไร']])
    ].join('');
    initScoreSelects($('evidenceFields'));
  }

  function collectAnswers(){
    const f=$('assessmentForm');
    const fd=new FormData(f);
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

  function statRows(stats){
    const labels = {SKILL:'SKILL ทักษะช่าง',END:'END ความอึด',WIS:'WIS แก้ปัญหา',INT:'INT วิเคราะห์',DISC:'DISC วินัย',SERVICE:'SERVICE บริการ',COMM:'COMM สื่อสาร',TEAM:'TEAM ทีม',TRUST:'TRUST ไว้ใจ',GROWTH:'GROWTH เติบโต'};
    return Object.keys(labels).map(k=>{ const v=Math.max(0,Math.min(100,Number(stats?.[k]||0))); return `<div class="statRow"><b>${esc(labels[k])}</b><div class="bar"><i style="width:${v}%"></i></div><b>${v}</b></div>`; }).join('');
  }

  function list(title, items){
    items = arr(items);
    return `<div class="card" style="box-shadow:none"><div class="sectionTitle">${esc(title)}</div>${items.length ? items.map(x=>`<div class="listLine">${esc(x)}</div>`).join('') : '<div class="muted">—</div>'}</div>`;
  }

  function reviewText(st){
    const rv = String(st?.review_status || '').trim();
    if (rv === 'pending_review') return '<span class="pill yellow">รอแอดมินตรวจสอบ</span>';
    if (rv === 'verified') return '<span class="pill dark">Verified / Official</span>';
    return '<span class="pill">Self Assessment</span>';
  }

  function renderProfile(){
    if (!technician) return;
    $('profilePhoto').src = imgSrc(technician.photo_path);
    $('profilePhoto').onerror = function(){ this.src='/logo.png'; };
    $('techName').textContent = technician.full_name || technician.username || '-';
    $('techMeta').textContent = `${technician.username || '-'} • ${technician.employment_type || '-'} • ${technician.phone || '-'}`;
    const pills = [];
    if (latest) {
      pills.push(`<span class="pill dark">Rank ${esc(latest.rank||'-')}</span>`);
      pills.push(`<span class="pill yellow">Lv. ${esc(latest.level||'-')}</span>`);
      pills.push(reviewText(latest));
    } else {
      pills.push('<span class="pill">ยังไม่มี Base Status</span>');
    }
    $('statusPills').innerHTML = pills.join('');
  }

  function renderLatestBox(data){
    const self = data.latest_self;
    const verified = data.latest_verified;
    let html = '<div class="sectionTitle">สถานะล่าสุดของคุณ</div>';
    if (self) {
      html += `<div class="listLine">ส่งแบบประเมินเองล่าสุด: Rank ${esc(self.rank)} / Lv. ${esc(self.level)} • สถานะรอแอดมินตรวจ • ${self.created_at ? new Date(self.created_at).toLocaleString('th-TH') : '-'}</div>`;
    }
    if (verified) {
      html += `<div class="listLine">คะแนนที่แอดมินยืนยันแล้ว: Rank ${esc(verified.rank)} / Lv. ${esc(verified.level)} • ${verified.created_at ? new Date(verified.created_at).toLocaleString('th-TH') : '-'}</div>`;
    }
    if (!self && !verified) html += '<div class="muted">ยังไม่มีการประเมิน กรอกแบบฟอร์มด้านล่างแล้วกดส่งให้แอดมินตรวจ</div>';
    $('latestBox').innerHTML = html;
  }

  function renderResult(st){
    if (!st || !technician) { $('resultCard').classList.add('hidden'); return; }
    const stats = obj(st.stats_json || st.stats);
    $('resultCard').classList.remove('hidden');
    $('resultBody').innerHTML = `
      <div class="profile"><img class="avatar" src="${esc(imgSrc(technician.photo_path))}" onerror="this.src='/logo.png'"><div><div class="name">${esc(technician.full_name||technician.username)}</div><div class="muted">${esc(technician.username||'')}</div><div>${reviewText(st)}<span class="pill dark">Rank ${esc(st.rank||'-')}</span><span class="pill yellow">Lv. ${esc(st.level||'-')}</span></div></div></div>
      <div class="hr"></div>
      <div class="resultGrid"><div class="card" style="box-shadow:none"><div class="sectionTitle">Status Bars</div>${statRows(stats)}</div><div>${list('เหมาะกับงาน', st.suitable_jobs_json || st.suitable_jobs)}${list('ข้อจำกัด / ความเสี่ยง', st.restricted_jobs_json || st.risk_points_json)}</div></div>
      <div class="resultGrid">${list('จุดแข็ง', st.strengths_json)}${list('แผนพัฒนา 30 วัน', st.development_plan_json)}</div>
      <div class="card" style="box-shadow:none"><div class="sectionTitle">RPG Character Prompt</div><div class="promptBox" id="promptText">${esc(st.generated_prompt || '')}</div><button class="btn blue" id="btnCopyPrompt" type="button" style="margin-top:10px">คัดลอก Prompt</button></div>
    `;
    const btn=$('btnCopyPrompt');
    if (btn) btn.addEventListener('click', async()=>{
      try{ await navigator.clipboard.writeText($('promptText')?.textContent || ''); toast('คัดลอก Prompt แล้ว'); }catch{ toast('คัดลอกไม่สำเร็จ'); }
    });
  }

  async function load(){
    try{
      const r = await api('/tech/api/base-status');
      technician = r.technician;
      latest = r.latest_self || r.latest_verified || r.latest || null;
      renderProfile();
      renderLatestBox(r);
      renderResult(latest);
    }catch(e){
      $('techName').textContent = 'โหลดไม่สำเร็จ';
      $('techMeta').textContent = e.message || 'เกิดข้อผิดพลาด';
      toast(e.message || 'โหลดไม่สำเร็จ');
    }
  }

  async function submit(ev){
    ev.preventDefault();
    const btn = ev.submitter;
    if (btn) { btn.disabled=true; btn.textContent='กำลังส่ง...'; }
    try{
      const answers = collectAnswers();
      const r = await api('/tech/api/base-status', { method:'POST', body:JSON.stringify({ answers }) });
      latest = r.assessment;
      renderProfile();
      renderResult(r.assessment);
      await load();
      $('resultCard').scrollIntoView({behavior:'smooth', block:'start'});
      toast('ส่งแบบประเมินแล้ว รอแอดมินตรวจสอบ');
    }catch(e){
      toast(e.message || 'ส่งไม่สำเร็จ');
    }finally{
      if (btn) { btn.disabled=false; btn.textContent='ส่งแบบประเมินให้แอดมินตรวจ'; }
    }
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    initCapabilityChecks();
    initEvidenceFields();
    initScoreSelects(document);
    $('assessmentForm').addEventListener('submit', submit);
    $('btnScrollResult').addEventListener('click', ()=> $('resultCard').scrollIntoView({behavior:'smooth', block:'start'}));
    load();
  });
})();