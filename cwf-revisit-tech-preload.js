// CWF Revisit Flow v2 preload patch
// Purpose: add isolated technician revisit/rework flow without rewriting app.js/tech.html.
// Loaded by package.json: node -r ./cwf-revisit-tech-preload.js index.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');

let pool = null;
try { pool = require('./db'); } catch (e) { console.warn('[revisit-v2] db unavailable', e?.message || e); }

const PHASES = new Set(['revisit_before', 'revisit_after', 'revisit_defect']);
const REASONS = new Set([
  'เกิดจากช่าง / งานเดิม',
  'เกิดจากการใช้งานของลูกค้า',
  'เกิดจากระบบ / อะไหล่ / เงื่อนไขบริษัท',
  'ยังไม่ชัดเจน ให้แอดมินตรวจ',
]);
const RESULTS = new Set([
  'แก้ไขสำเร็จ ใช้งานได้ปกติ',
  'ยังไม่จบ / ยังมีอาการ ต้องให้แอดมินติดตาม',
]);

function htmlEscape(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}

async function ensureRevisitSchema() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS technician_revisit_flow_v2 (
      job_id BIGINT PRIMARY KEY,
      appointment_at TIMESTAMPTZ NULL,
      reason TEXT NULL,
      reason_note TEXT NULL,
      result TEXT NULL,
      result_note TEXT NULL,
      updated_by TEXT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS technician_revisit_photos_v2 (
      id BIGSERIAL PRIMARY KEY,
      job_id BIGINT NOT NULL,
      phase TEXT NOT NULL,
      image_url TEXT NOT NULL,
      public_id TEXT NULL,
      uploaded_by TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_technician_revisit_photos_v2_job ON technician_revisit_photos_v2(job_id, phase, created_at DESC)`);
}
const ensureOnce = (() => { let p; return () => (p ||= ensureRevisitSchema().catch(e => { console.error('[revisit-v2] schema error', e); })); })();

async function tableColumns(table) {
  if (!pool) return new Set();
  const r = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1`, [table]);
  return new Set(r.rows.map(x => x.column_name));
}

function parseCloudinaryEnv() {
  const url = process.env.CLOUDINARY_URL || '';
  if (url.startsWith('cloudinary://')) {
    const u = new URL(url);
    return { cloudName: u.hostname, apiKey: decodeURIComponent(u.username), apiSecret: decodeURIComponent(u.password) };
  }
  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  };
}

async function uploadToCloudinary(buffer, filename, mimetype, jobId, phase) {
  const { cloudName, apiKey, apiSecret } = parseCloudinaryEnv();
  if (!cloudName || !apiKey || !apiSecret) throw new Error('ยังไม่ได้ตั้งค่า Cloudinary ENV');
  if (typeof FormData === 'undefined' || typeof Blob === 'undefined' || typeof fetch === 'undefined') {
    throw new Error('Node runtime นี้ยังไม่รองรับ FormData/Blob/fetch สำหรับอัปโหลด Cloudinary');
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `cwf/revisit/${jobId}`;
  const safeBase = String(filename || 'photo').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 48) || 'photo';
  const publicId = `${phase}-${Date.now()}-${safeBase}`;
  const toSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(toSign).digest('hex');
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: mimetype || 'application/octet-stream' }), filename || `${phase}.jpg`);
  fd.append('api_key', apiKey);
  fd.append('timestamp', String(timestamp));
  fd.append('folder', folder);
  fd.append('public_id', publicId);
  fd.append('signature', signature);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.secure_url) throw new Error(data.error?.message || 'อัปโหลดรูปไป Cloudinary ไม่สำเร็จ');
  return { url: data.secure_url, public_id: data.public_id };
}

async function getRevisitPayload(jobId) {
  await ensureOnce();
  const flow = await pool.query(`SELECT job_id, appointment_at, reason, reason_note, result, result_note, updated_by, updated_at, completed_at FROM technician_revisit_flow_v2 WHERE job_id=$1`, [jobId]);
  const photos = await pool.query(`SELECT id, phase, image_url, public_id, uploaded_by, created_at FROM technician_revisit_photos_v2 WHERE job_id=$1 ORDER BY created_at DESC, id DESC`, [jobId]);
  const grouped = { revisit_before: [], revisit_after: [], revisit_defect: [] };
  for (const p of photos.rows) if (grouped[p.phase]) grouped[p.phase].push(p);
  return { flow: flow.rows[0] || null, photos: grouped, requirements: {
    before: grouped.revisit_before.length > 0,
    after: grouped.revisit_after.length > 0,
    reason: !!flow.rows[0]?.reason,
    result: !!flow.rows[0]?.result,
  }};
}

async function checkCollision(jobId, username, appointmentAt) {
  if (!appointmentAt || !username || !pool) return { conflict: false };
  try {
    const cols = await tableColumns('jobs');
    const timeCol = ['appointment_at','appointment_datetime','appointment_time','scheduled_at','start_at'].find(c => cols.has(c));
    if (!timeCol) return { conflict: false };
    const techCols = ['technician_username','assigned_technician','technician_code','tech_username','technician_id'].filter(c => cols.has(c));
    if (!techCols.length) return { conflict: false };
    const whereTech = techCols.map((c, i) => `${c}::text = $${i + 3}`).join(' OR ');
    const params = [jobId, appointmentAt, ...techCols.map(() => username)];
    const q = `SELECT id, ${timeCol} AS appointment_at FROM jobs WHERE id <> $1 AND ${timeCol} IS NOT NULL AND ABS(EXTRACT(EPOCH FROM (${timeCol}::timestamptz - $2::timestamptz))) < 10800 AND (${whereTech}) LIMIT 1`;
    const r = await pool.query(q, params);
    return { conflict: r.rowCount > 0, job: r.rows[0] || null };
  } catch (e) {
    console.warn('[revisit-v2] collision check skipped:', e.message);
    return { conflict: false };
  }
}

function installApi(app) {
  if (!app || app.__cwfRevisitV2Installed) return;
  app.__cwfRevisitV2Installed = true;
  const express = require('express');
  const multer = require('multer');
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });
  app.use('/api/tech/revisit', express.json({ limit: '1mb' }));

  app.get('/api/tech/revisit/:jobId', async (req, res) => {
    try { res.json(await getRevisitPayload(Number(req.params.jobId))); }
    catch (e) { console.error(e); res.status(500).json({ error: e.message || 'โหลดข้อมูลงานแก้ไขไม่สำเร็จ' }); }
  });

  app.post('/api/tech/revisit/:jobId/appointment', async (req, res) => {
    try {
      await ensureOnce();
      const jobId = Number(req.params.jobId);
      const appointmentAt = req.body?.appointment_at || null;
      const username = String(req.body?.username || '').trim();
      const collision = await checkCollision(jobId, username, appointmentAt);
      if (collision.conflict) return res.status(409).json({ error: 'เวลานี้ชนกับงานอื่นที่มีอยู่แล้ว', collision });
      await pool.query(`INSERT INTO technician_revisit_flow_v2(job_id, appointment_at, updated_by, updated_at)
        VALUES($1,$2,$3,NOW()) ON CONFLICT(job_id) DO UPDATE SET appointment_at=EXCLUDED.appointment_at, updated_by=EXCLUDED.updated_by, updated_at=NOW()`, [jobId, appointmentAt, username || null]);
      res.json(await getRevisitPayload(jobId));
    } catch (e) { console.error(e); res.status(500).json({ error: e.message || 'บันทึกเวลานัดหมายไม่สำเร็จ' }); }
  });

  app.post('/api/tech/revisit/:jobId/checklist', async (req, res) => {
    try {
      await ensureOnce();
      const jobId = Number(req.params.jobId);
      const reason = String(req.body?.reason || '').trim();
      const result = String(req.body?.result || '').trim();
      if (!REASONS.has(reason)) return res.status(400).json({ error: 'กรุณาเลือกสาเหตุงานแก้ไข' });
      if (!RESULTS.has(result)) return res.status(400).json({ error: 'กรุณาเลือกผลการแก้ไข' });
      const reasonNote = String(req.body?.reason_note || '').trim();
      const resultNote = String(req.body?.result_note || '').trim();
      const username = String(req.body?.username || '').trim();
      await pool.query(`INSERT INTO technician_revisit_flow_v2(job_id, reason, reason_note, result, result_note, updated_by, updated_at)
        VALUES($1,$2,$3,$4,$5,$6,NOW())
        ON CONFLICT(job_id) DO UPDATE SET reason=EXCLUDED.reason, reason_note=EXCLUDED.reason_note, result=EXCLUDED.result, result_note=EXCLUDED.result_note, updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
        [jobId, reason, reasonNote || null, result, resultNote || null, username || null]);
      res.json(await getRevisitPayload(jobId));
    } catch (e) { console.error(e); res.status(500).json({ error: e.message || 'บันทึกเช็คลิสงานแก้ไขไม่สำเร็จ' }); }
  });

  app.post('/api/tech/revisit/:jobId/photo/:phase', upload.single('photo'), async (req, res) => {
    try {
      await ensureOnce();
      const jobId = Number(req.params.jobId);
      const phase = String(req.params.phase || '');
      if (!PHASES.has(phase)) return res.status(400).json({ error: 'phase รูปงานแก้ไขไม่ถูกต้อง' });
      if (!req.file?.buffer) return res.status(400).json({ error: 'กรุณาเลือกรูปภาพ' });
      const username = String(req.body?.username || '').trim();
      const uploaded = await uploadToCloudinary(req.file.buffer, req.file.originalname, req.file.mimetype, jobId, phase);
      await pool.query(`INSERT INTO technician_revisit_photos_v2(job_id, phase, image_url, public_id, uploaded_by) VALUES($1,$2,$3,$4,$5)`, [jobId, phase, uploaded.url, uploaded.public_id, username || null]);
      res.json(await getRevisitPayload(jobId));
    } catch (e) { console.error(e); res.status(500).json({ error: e.message || 'อัปโหลดรูปงานแก้ไขไม่สำเร็จ' }); }
  });

  app.post('/api/tech/revisit/:jobId/finish', async (req, res) => {
    try {
      await ensureOnce();
      const jobId = Number(req.params.jobId);
      const payload = await getRevisitPayload(jobId);
      const ok = payload.requirements.before && payload.requirements.after && payload.requirements.reason && payload.requirements.result;
      if (!ok) return res.status(400).json({ error: 'งานแก้ไขยังปิดไม่ได้: ต้องมีรูปก่อนแก้ไข, รูปหลังแก้ไข, สาเหตุงานแก้ไข และผลการแก้ไขให้ครบ', requirements: payload.requirements });
      const cols = await tableColumns('jobs');
      const sets = [];
      const params = [];
      function setCol(c, v) { if (cols.has(c)) { params.push(v); sets.push(`${c}=$${params.length}`); } }
      setCol('status', 'เสร็จสิ้น');
      setCol('job_status', 'เสร็จสิ้น');
      setCol('completed_at', new Date());
      setCol('finished_at', new Date());
      if (sets.length) { params.push(jobId); await pool.query(`UPDATE jobs SET ${sets.join(', ')} WHERE id=$${params.length}`, params); }
      await pool.query(`UPDATE technician_revisit_flow_v2 SET completed_at=NOW(), updated_at=NOW() WHERE job_id=$1`, [jobId]);
      res.json({ ok: true, ...(await getRevisitPayload(jobId)) });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message || 'ปิดงานแก้ไขไม่สำเร็จ' }); }
  });
}

const TECH_BROWSER_PATCH = String.raw`
(function(){
  if (window.__CWF_REVISIT_V2_PATCH__) return; window.__CWF_REVISIT_V2_PATCH__ = true;
  if (!/\/tech\.html(?:$|[?#])/.test(location.pathname + location.search)) return;
  const API = '/api/tech/revisit';
  const THAI_COLLISION = 'เวลานี้ชนกับงานอื่นที่มีอยู่แล้ว\n\nหากจำเป็นต้องเข้าช่วงเวลานี้จริง ๆ\nกรุณาติดต่อแอดมินเพื่อย้ายคิวงานเดิมก่อน\nหรือเลือกเวลานัดหมายใหม่';
  const REASONS = ['เกิดจากช่าง / งานเดิม','เกิดจากการใช้งานของลูกค้า','เกิดจากระบบ / อะไหล่ / เงื่อนไขบริษัท','ยังไม่ชัดเจน ให้แอดมินตรวจ'];
  const RESULTS = ['แก้ไขสำเร็จ ใช้งานได้ปกติ','ยังไม่จบ / ยังมีอาการ ต้องให้แอดมินติดตาม'];
  const PHASE_LABELS = { revisit_before:'รูปก่อนแก้ไข — บังคับ', revisit_after:'รูปหลังแก้ไข — บังคับ', revisit_defect:'รูปจุดปัญหา — ถ้ามี / ไม่บังคับ' };
  const state = new Map();
  function esc(s){ return String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function isRevisitText(t){ return /งานแก้ไข|กลับไปตรวจซ้ำ|revisit|return_for_fix|แก้งาน|งานในประกัน/i.test(String(t||'')); }
  function jobIdFromCard(card){
    const attrs=['data-job-id','data-id','data-jobid'];
    for(const a of attrs){ const v=card.getAttribute(a)||card.querySelector('['+a+']')?.getAttribute(a); if(/^\d+$/.test(v||'')) return v; }
    const html=card.outerHTML||'';
    const m=html.match(/(?:job_id|jobId|id)["'\s:=]+(\d{1,12})/) || html.match(/(?:finish|complete|upload|job)[A-Za-z_]*(?:\(|%28)\s*(\d{1,12})/i) || html.match(/\/jobs\/(\d{1,12})/);
    return m ? m[1] : '';
  }
  function cards(){ return Array.from(document.querySelectorAll('#active-list .card,#active-jobs .card,.job-card,.card')).filter(c => isRevisitText(c.innerText) && jobIdFromCard(c)); }
  function hideNormalRevisitNoise(card){
    const deny = /ก่อนทำ|หลังทำ|เนมเพลท|สลิป|QR|เก็บเงิน|สแกนจ่าย|วัดน้ำยา|วัดกระแส|หมายเหตุช่าง/i;
    card.querySelectorAll('button,label,.row,.photo-box,.payment-box,textarea,input,select,details').forEach(el=>{
      if (el.closest('.cwf-revisit-v2')) return;
      const tx=(el.innerText||el.textContent||el.placeholder||el.value||'').trim();
      if (deny.test(tx)) el.classList.add('cwf-revisit-hidden-by-flow');
    });
  }
  async function load(jobId){
    try { const r=await fetch(API+'/'+encodeURIComponent(jobId), {credentials:'same-origin'}); const d=await r.json(); if(r.ok) state.set(String(jobId), d); return d; } catch { return state.get(String(jobId)) || null; }
  }
  function reqOk(jobId){ const d=state.get(String(jobId)); return !!(d?.requirements?.before && d?.requirements?.after && d?.requirements?.reason && d?.requirements?.result); }
  function section(jobId){ return '<div class="cwf-revisit-v2" data-revisit-section="'+jobId+'">'+
    '<div class="rv-hero"><div><b>งานแก้ไข / กลับไปตรวจซ้ำ</b><p>งานนี้ไม่มีเก็บเงินลูกค้า • ไม่มีค่าตอบแทนเพิ่มเติมสำหรับช่าง</p></div><span>REVISIT</span></div>'+ 
    '<div class="rv-rules"><span>ไม่ต้องแนบสลิป</span><span>ไม่ต้องเก็บเงิน</span><span>ไม่ต้องลงเนมเพลทใหม่</span></div>'+ 
    '<div class="rv-actions"><button type="button" class="rv-btn rv-appointment" data-job="'+jobId+'">🕛 แจ้งเวลานัดหมาย</button><button type="button" class="rv-btn rv-evidence" data-job="'+jobId+'">📷✅ รูปและเช็คลิสงานแก้ไข</button></div>'+ 
    '<div class="rv-status" data-rv-status="'+jobId+'">กำลังโหลดสถานะงานแก้ไข...</div></div>'; }
  function updateStatus(jobId){
    const el=document.querySelector('[data-rv-status="'+jobId+'"]'); if(!el) return;
    const d=state.get(String(jobId)); if(!d){ el.textContent='ยังไม่ได้โหลดข้อมูล'; return; }
    const r=d.requirements||{}; const ok=reqOk(jobId);
    el.innerHTML = (ok?'✅ เงื่อนไขปิดงานแก้ไขครบแล้ว':'⚠️ ต้องทำให้ครบก่อนปิดงานแก้ไข') + '<br><small>'+
      (r.before?'✅':'❌')+' รูปก่อนแก้ไข · '+(r.after?'✅':'❌')+' รูปหลังแก้ไข · '+(r.reason?'✅':'❌')+' สาเหตุ · '+(r.result?'✅':'❌')+' ผลการแก้ไข</small>';
  }
  function enhance(){
    cards().forEach(card=>{
      const jobId=jobIdFromCard(card); if(!jobId || card.dataset.revisitEnhanced==='1') return;
      card.dataset.revisitEnhanced='1'; card.classList.add('cwf-revisit-card'); hideNormalRevisitNoise(card);
      card.insertAdjacentHTML('afterbegin', section(jobId)); load(jobId).then(()=>updateStatus(jobId));
    });
  }
  function openModal(title, body){
    let m=document.getElementById('cwfRevisitModal');
    if(!m){ document.body.insertAdjacentHTML('beforeend','<div id="cwfRevisitModal" class="rv-modal"><div class="rv-panel"><div class="rv-head"><b></b><button type="button" class="rv-close">×</button></div><div class="rv-body"></div></div></div>'); m=document.getElementById('cwfRevisitModal'); m.querySelector('.rv-close').onclick=()=>m.classList.remove('show'); m.addEventListener('click',e=>{ if(e.target===m) m.classList.remove('show'); }); }
    m.querySelector('.rv-head b').textContent=title; m.querySelector('.rv-body').innerHTML=body; m.classList.add('show'); return m;
  }
  function openAppointment(jobId){
    const d=state.get(String(jobId)); const current=d?.flow?.appointment_at ? new Date(d.flow.appointment_at).toISOString().slice(0,16) : '';
    const m=openModal('🕛 แจ้งเวลานัดหมาย','<label class="rv-label">วันและเวลาที่ตกลงกับลูกค้า</label><input id="rvAppt" class="rv-input" type="datetime-local" value="'+esc(current)+'"><button class="rv-primary" id="rvSaveAppt">บันทึกเวลานัดหมาย</button>');
    m.querySelector('#rvSaveAppt').onclick=async()=>{
      const appointment_at=m.querySelector('#rvAppt').value; if(!appointment_at) return alert('กรุณาเลือกวันและเวลานัดหมาย');
      const r=await fetch(API+'/'+jobId+'/appointment',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({appointment_at,username:localStorage.getItem('username')||''})});
      const j=await r.json().catch(()=>({})); if(r.status===409) return alert(THAI_COLLISION); if(!r.ok) return alert(j.error||'บันทึกไม่สำเร็จ'); state.set(String(jobId),j); updateStatus(jobId); m.classList.remove('show'); alert('บันทึกเวลานัดหมายแล้ว');
    };
  }
  function openEvidence(jobId){ openModal('📷✅ รูปและเช็คลิสงานแก้ไข','<div class="rv-choice"><button class="rv-btn" id="rvPhotos">📷 ลงรูปงานแก้ไข</button><button class="rv-btn" id="rvChecklist">✅ เช็คลิสงานแก้ไข</button></div>').querySelector('#rvPhotos').onclick=()=>openPhotos(jobId); document.getElementById('rvChecklist').onclick=()=>openChecklist(jobId); }
  function renderThumbs(jobId, phase){ const arr=state.get(String(jobId))?.photos?.[phase]||[]; return arr.slice(0,4).map(p=>'<a href="'+esc(p.image_url)+'" target="_blank"><img src="'+esc(p.image_url)+'"></a>').join('') || '<small>ยังไม่มีรูป</small>'; }
  function openPhotos(jobId){
    const rows=Object.keys(PHASE_LABELS).map(ph=>'<div class="rv-upload-row"><b>'+PHASE_LABELS[ph]+'</b><div class="rv-thumbs" data-thumbs="'+ph+'">'+renderThumbs(jobId,ph)+'</div><input type="file" accept="image/*" capture="environment" data-phase="'+ph+'"></div>').join('');
    const m=openModal('📷 ลงรูปงานแก้ไข', rows);
    m.querySelectorAll('input[type=file]').forEach(inp=>inp.onchange=async()=>{
      const f=inp.files?.[0]; if(!f) return; const fd=new FormData(); fd.append('photo',f); fd.append('username',localStorage.getItem('username')||''); inp.disabled=true;
      const r=await fetch(API+'/'+jobId+'/photo/'+inp.dataset.phase,{method:'POST',credentials:'same-origin',body:fd}); const j=await r.json().catch(()=>({})); inp.disabled=false; if(!r.ok) return alert(j.error||'อัปโหลดรูปไม่สำเร็จ'); state.set(String(jobId),j); updateStatus(jobId); m.querySelector('[data-thumbs="'+inp.dataset.phase+'"]').innerHTML=renderThumbs(jobId, inp.dataset.phase); inp.value='';
    });
  }
  function opts(list, val){ return '<option value="">เลือก</option>'+list.map(x=>'<option '+(x===val?'selected':'')+' value="'+esc(x)+'">'+esc(x)+'</option>').join(''); }
  function openChecklist(jobId){
    const f=state.get(String(jobId))?.flow||{};
    const m=openModal('✅ เช็คลิสงานแก้ไข','<label class="rv-label">สาเหตุงานแก้ไข <span>*</span></label><select id="rvReason" class="rv-input">'+opts(REASONS,f.reason)+'</select><label class="rv-label">คำอธิบายสาเหตุที่พบ</label><textarea id="rvReasonNote" class="rv-input" rows="3">'+esc(f.reason_note||'')+'</textarea><label class="rv-label">ผลการแก้ไข <span>*</span></label><select id="rvResult" class="rv-input">'+opts(RESULTS,f.result)+'</select><label class="rv-label">คำอธิบายผลการแก้ไข</label><textarea id="rvResultNote" class="rv-input" rows="3">'+esc(f.result_note||'')+'</textarea><button class="rv-primary" id="rvSaveChecklist">บันทึกเช็คลิส</button>');
    m.querySelector('#rvSaveChecklist').onclick=async()=>{
      const body={username:localStorage.getItem('username')||'',reason:m.querySelector('#rvReason').value,reason_note:m.querySelector('#rvReasonNote').value,result:m.querySelector('#rvResult').value,result_note:m.querySelector('#rvResultNote').value};
      const r=await fetch(API+'/'+jobId+'/checklist',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(body)}); const j=await r.json().catch(()=>({})); if(!r.ok) return alert(j.error||'บันทึกไม่สำเร็จ'); state.set(String(jobId),j); updateStatus(jobId); m.classList.remove('show'); alert('บันทึกเช็คลิสงานแก้ไขแล้ว');
    };
  }
  async function finishRevisit(card, jobId){
    const d=await load(jobId); state.set(String(jobId), d||{}); updateStatus(jobId);
    if(!reqOk(jobId)) return alert('งานแก้ไขยังปิดไม่ได้\n\nต้องมีครบ 4 อย่าง:\n1) รูปก่อนแก้ไข\n2) รูปหลังแก้ไข\n3) เลือกสาเหตุงานแก้ไข\n4) เลือกผลการแก้ไข');
    if(!confirm('ยืนยันปิดงานแก้ไขใช่ไหม?')) return;
    const r=await fetch(API+'/'+jobId+'/finish',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({username:localStorage.getItem('username')||''})}); const j=await r.json().catch(()=>({})); if(!r.ok) return alert(j.error||'ปิดงานแก้ไขไม่สำเร็จ'); alert('ปิดงานแก้ไขเรียบร้อย'); if(window.loadActiveJobs) window.loadActiveJobs(); if(window.loadHistory) window.loadHistory();
  }
  document.addEventListener('click', e=>{
    const ap=e.target.closest('.rv-appointment'); if(ap) return openAppointment(ap.dataset.job);
    const ev=e.target.closest('.rv-evidence'); if(ev) return openEvidence(ev.dataset.job);
    const btn=e.target.closest('button'); if(btn && /เสร็จสิ้น|ปิดงาน|จบงาน/.test(btn.innerText||'')){
      const card=btn.closest('.cwf-revisit-card'); if(card){ e.preventDefault(); e.stopPropagation(); return finishRevisit(card, jobIdFromCard(card)); }
    }
  }, true);
  const css=document.createElement('style'); css.textContent='.cwf-revisit-hidden-by-flow{display:none!important}.cwf-revisit-card{border:2px solid rgba(245,158,11,.35)!important}.rv-hero{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;background:linear-gradient(135deg,#061a44,#0b2e6d 58%,#1677ff);color:#fff;border-radius:22px;padding:16px;margin-bottom:10px;box-shadow:0 16px 34px rgba(11,46,109,.22)}.rv-hero b{font-size:18px}.rv-hero p{margin:6px 0 0;font-size:13px;font-weight:800;opacity:.9;line-height:1.45}.rv-hero span{background:#f4c400;color:#111827;border-radius:999px;padding:7px 10px;font-weight:1000;font-size:11px}.rv-rules{display:grid;grid-template-columns:1fr;gap:6px;margin:8px 0}.rv-rules span{background:#fff7d6;border:1px solid rgba(244,196,0,.38);border-radius:14px;padding:9px 11px;font-weight:900;color:#0f172a}.rv-actions{display:grid;grid-template-columns:1fr;gap:10px;margin-top:10px}.rv-btn,.rv-primary{width:100%;border:0;border-radius:18px;padding:14px 16px;font-weight:1000;background:#0b2e6d;color:#fff;box-shadow:0 12px 24px rgba(11,46,109,.18)}.rv-btn+ .rv-btn{background:#f4c400;color:#111827}.rv-status{margin-top:10px;border-radius:16px;background:#f8fbff;border:1px solid rgba(11,46,109,.14);padding:10px;font-weight:900;line-height:1.45;color:#0f172a}.rv-modal{position:fixed;inset:0;display:none;align-items:flex-end;justify-content:center;background:rgba(2,6,23,.62);z-index:999999;padding:12px}.rv-modal.show{display:flex}.rv-panel{width:min(460px,100%);max-height:88vh;overflow:auto;background:#fff;border-radius:28px 28px 18px 18px;box-shadow:0 30px 80px rgba(2,6,23,.36)}.rv-head{position:sticky;top:0;background:linear-gradient(135deg,#061a44,#0b2e6d);color:#fff;padding:15px 16px;display:flex;justify-content:space-between;align-items:center;gap:10px;border-radius:28px 28px 0 0}.rv-head b{font-size:18px}.rv-close{width:42px;height:42px;border-radius:16px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.12);color:#fff;font-size:24px}.rv-body{padding:16px}.rv-label{display:block;margin:12px 0 7px;font-weight:1000;color:#0b2e6d}.rv-label span{color:#ef4444}.rv-input{width:100%;border-radius:16px;border:1px solid #d7e0ee;padding:12px 13px;font:inherit;font-weight:850;background:#fff;color:#0f172a}.rv-primary{margin-top:14px;background:#f4c400;color:#111827}.rv-choice{display:grid;gap:12px}.rv-upload-row{border:1px solid #d7e0ee;border-radius:20px;padding:12px;margin-bottom:12px;background:#f8fbff}.rv-upload-row b{display:block;color:#0b2e6d;margin-bottom:8px}.rv-upload-row input{margin-top:10px}.rv-thumbs{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.rv-thumbs img{width:76px;height:76px;border-radius:14px;object-fit:cover;border:1px solid #d7e0ee}@media(min-width:390px){.rv-actions{grid-template-columns:1fr 1fr}.rv-rules{grid-template-columns:1fr 1fr 1fr}.rv-rules span{font-size:12px}}'; document.head.appendChild(css);
  setInterval(enhance, 1200); document.addEventListener('DOMContentLoaded', enhance); setTimeout(enhance,300); setTimeout(enhance,1500);
})();
`;

const ADMIN_BROWSER_PATCH = String.raw`
(function(){
  if (window.__CWF_REVISIT_ADMIN_PATCH__) return; window.__CWF_REVISIT_ADMIN_PATCH__=true;
  if (!/admin-job-view-v2\.html|admin/i.test(location.pathname)) return;
  function esc(s){ return String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function jobId(){ return new URLSearchParams(location.search).get('id') || new URLSearchParams(location.search).get('job_id') || document.body.innerText.match(/(?:เลขงาน|Job ID|ID)[:\s#]*(\d+)/i)?.[1] || ''; }
  async function render(){
    const id=jobId(); if(!id || document.getElementById('adminRevisitV2Panel')) return;
    const r=await fetch('/api/tech/revisit/'+encodeURIComponent(id),{credentials:'same-origin'}); if(!r.ok) return; const d=await r.json();
    if(!d.flow && !(d.photos?.revisit_before?.length||d.photos?.revisit_after?.length||d.photos?.revisit_defect?.length)) return;
    const img=(p)=> (d.photos?.[p]||[]).map(x=>'<a href="'+esc(x.image_url)+'" target="_blank"><img src="'+esc(x.image_url)+'"></a>').join('') || '<span class="muted">ไม่มี</span>';
    const html='<div id="adminRevisitV2Panel" class="card" style="margin:14px 0;padding:16px;border:2px solid rgba(245,158,11,.35)"><h3 style="margin:0 0 10px;color:#0B2E6D">งานแก้ไข / กลับไปตรวจซ้ำ</h3><div style="display:grid;gap:8px;font-weight:800"><div>🕛 เวลานัดหมายที่ช่างแจ้ง: '+esc(d.flow?.appointment_at ? new Date(d.flow.appointment_at).toLocaleString('th-TH') : 'ไม่ได้แจ้ง')+'</div><div>สาเหตุ: '+esc(d.flow?.reason||'-')+'</div><div>คำอธิบายสาเหตุ: '+esc(d.flow?.reason_note||'-')+'</div><div>ผลการแก้ไข: '+esc(d.flow?.result||'-')+'</div><div>คำอธิบายผล: '+esc(d.flow?.result_note||'-')+'</div></div><div class="rv-admin-grid"><div><b>รูปก่อนแก้ไข</b><div>'+img('revisit_before')+'</div></div><div><b>รูปหลังแก้ไข</b><div>'+img('revisit_after')+'</div></div><div><b>รูปจุดปัญหา</b><div>'+img('revisit_defect')+'</div></div></div></div>';
    const target=document.querySelector('main,.app,.container,body'); target.insertAdjacentHTML('afterbegin', html);
    const css=document.createElement('style'); css.textContent='.rv-admin-grid{display:grid;gap:12px;margin-top:14px}.rv-admin-grid>div{border:1px solid #d7e0ee;border-radius:16px;padding:10px;background:#fff}.rv-admin-grid b{display:block;margin-bottom:8px;color:#0B2E6D}.rv-admin-grid img{width:82px;height:82px;object-fit:cover;border-radius:12px;border:1px solid #d7e0ee;margin:0 6px 6px 0;display:inline-block}.muted{color:#64748b}'; document.head.appendChild(css);
  }
  setInterval(render,2000); document.addEventListener('DOMContentLoaded', render); setTimeout(render,800);
})();
`;

function serveJs(res, filepath, patch) {
  fs.readFile(filepath, 'utf8', (err, src) => {
    if (err) return res.status(404).end('not found');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.end(src + '\n\n/* CWF revisit flow v2 patch */\n' + patch + '\n');
  });
}

try {
  const expressId = require.resolve('express');
  const originalExpress = require(expressId);
  const originalStatic = originalExpress.static.bind(originalExpress);
  function patchedExpress(...args) {
    const app = originalExpress(...args);
    installApi(app);
    return app;
  }
  Object.assign(patchedExpress, originalExpress);
  patchedExpress.static = function(root, options) {
    const mw = originalStatic(root, options);
    return function(req, res, next) {
      try {
        const pathname = String(req.path || req.url || '').split('?')[0];
        if (pathname === '/app.js' || pathname.endsWith('/app.js')) return serveJs(res, path.join(root, 'app.js'), TECH_BROWSER_PATCH);
        if (pathname === '/admin-job-view-v2.js' || pathname.endsWith('/admin-job-view-v2.js')) return serveJs(res, path.join(root, 'admin-job-view-v2.js'), ADMIN_BROWSER_PATCH);
      } catch (e) { console.warn('[revisit-v2] static patch skipped', e?.message || e); }
      return mw(req, res, next);
    };
  };
  require.cache[expressId].exports = patchedExpress;
  console.log('✅ CWF Revisit Flow v2 preload active');
} catch (e) {
  console.error('❌ CWF Revisit Flow v2 preload failed:', e);
}
