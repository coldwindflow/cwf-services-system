// CWF Revisit Addon v21
// แยก Flow งานแก้ไขออกจาก app.js หลัก เพื่อลดความเสี่ยงแอพรวน
(function(){
  'use strict';

  const VERSION = 'revisit-addon-v21-20260509';
  const LS_PREFIX = 'cwf_revisit_v21_';

  function log(...args){ try { console.info('[CWF_REVISIT_V21]', ...args); } catch(_){} }
  function byId(id){ return document.getElementById(id); }
  function keyOf(v){ return String(v || '').trim(); }
  function escapeHTML(s){
    return String(s || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function safeJs(s){ return String(s || '').replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
  function readJson(k, fallback){ try { return JSON.parse(localStorage.getItem(k) || ''); } catch(_) { return fallback; } }
  function writeJson(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(_){} }
  function draftKey(jobKey){ return LS_PREFIX + 'checklist_' + keyOf(jobKey); }
  function schedKey(jobKey){ return LS_PREFIX + 'schedule_' + keyOf(jobKey); }

  function normStatus(s){ return String(s || '').trim(); }
  function isRevisitJob(job){
    const st = normStatus(job && job.job_status);
    return st === 'งานแก้ไข' || !!(job && (job.returned_at || job.return_reason || job.revisit_result || job.revisit_cause_party));
  }
  function getJob(jobKey){
    const k = keyOf(jobKey);
    return (window.__JOB_CACHE__ || []).find(j => String(j.job_id) === k || String(j.booking_code || '') === k) || null;
  }
  function causeLabel(v){
    return {
      technician:'เกิดจากช่าง / งานเดิม',
      customer:'เกิดจากการใช้งานของลูกค้า',
      company:'เกิดจากระบบ / อะไหล่ / เงื่อนไขบริษัท',
      unclear:'ยังไม่ชัดเจน ให้แอดมินตรวจ'
    }[String(v || '').trim()] || '';
  }
  function resultLabel(v){
    return {
      successful:'แก้ไขสำเร็จ ใช้งานได้ปกติ',
      unsuccessful:'ยังไม่จบ / ยังมีอาการ ต้องให้แอดมินติดตาม'
    }[String(v || '').trim()] || '';
  }
  function getDraft(jobKey){
    const job = getJob(jobKey) || {};
    const d = readJson(draftKey(jobKey), {}) || {};
    return {
      cause: String(job.revisit_cause_party || d.cause || '').trim(),
      causeNote: String(job.revisit_cause_note || d.causeNote || '').trim(),
      result: String(job.revisit_result || d.result || '').trim(),
      resultNote: String(job.revisit_note || d.resultNote || '').trim()
    };
  }
  function saveDraft(jobKey){
    const key = keyOf(jobKey);
    const d = {
      cause: String(byId(`cwf-revisit-cause-${key}`)?.value || '').trim(),
      causeNote: String(byId(`cwf-revisit-cause-note-${key}`)?.value || '').trim(),
      result: String(byId(`cwf-revisit-result-${key}`)?.value || '').trim(),
      resultNote: String(byId(`cwf-revisit-result-note-${key}`)?.value || '').trim()
    };
    writeJson(draftKey(key), d);
    syncHiddenFields(key);
    return d;
  }
  window.cwfRevisitSaveDraftV21 = saveDraft;

  function combinedNote(d){
    const lines = [];
    if (d.cause) lines.push(`สาเหตุงานแก้ไข: ${causeLabel(d.cause)}`);
    if (d.causeNote) lines.push(`คำอธิบายสาเหตุ: ${d.causeNote}`);
    if (d.result) lines.push(`ผลการแก้ไข: ${resultLabel(d.result)}`);
    if (d.resultNote) lines.push(`คำอธิบายผล: ${d.resultNote}`);
    return lines.join('\n');
  }

  function ensureHiddenFields(jobKey){
    const key = keyOf(jobKey);
    let box = byId(`cwf-revisit-hidden-${key}`);
    if (!box) {
      box = document.createElement('div');
      box.id = `cwf-revisit-hidden-${key}`;
      box.style.display = 'none';
      box.innerHTML = `
        <select id="revisit-result-${escapeHTML(key)}">
          <option value=""></option>
          <option value="successful">successful</option>
          <option value="unsuccessful">unsuccessful</option>
        </select>
        <textarea id="revisit-note-${escapeHTML(key)}"></textarea>
      `;
      document.body.appendChild(box);
    }
    syncHiddenFields(key);
  }

  function syncHiddenFields(jobKey){
    const key = keyOf(jobKey);
    const d = getDraft(key);
    const resultEl = byId(`revisit-result-${key}`);
    const noteEl = byId(`revisit-note-${key}`);
    if (resultEl) resultEl.value = d.result || '';
    if (noteEl) noteEl.value = combinedNote(d) || (d.result ? `ผลการแก้ไข: ${resultLabel(d.result)}` : '');
  }

  async function countPhotos(jobKey){
    const counts = { revisit_before:0, revisit_after:0, revisit_defect:0 };
    try {
      const rr = await fetch(`${window.API_BASE || ''}/jobs/${encodeURIComponent(String(jobKey))}/photos`, { credentials:'same-origin' });
      if (rr.ok) {
        const arr = await rr.json().catch(()=>[]);
        (arr || []).forEach(p => {
          const ph = String(p && p.phase || '');
          if (Object.prototype.hasOwnProperty.call(counts, ph) && p.public_url) counts[ph] += 1;
        });
      }
    } catch(_) {}
    return counts;
  }

  function openModal(title, body, footer){
    if (typeof window.cwfOpenModal === 'function') return window.cwfOpenModal(title, body, footer || `<button type="button" class="secondary" onclick="cwfCloseModal()">ปิด</button>`);
    alert(title);
  }

  function toDateTimeLocal(v){
    if (!v) return '';
    try {
      const d = new Date(v);
      if (!Number.isFinite(d.getTime())) return '';
      const pad = n => String(n).padStart(2,'0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch(_) { return ''; }
  }

  function openSchedule(jobKey){
    const key = keyOf(jobKey);
    const job = getJob(key) || {};
    const local = readJson(schedKey(key), {}) || {};
    const val = toDateTimeLocal(local.revisit_agreed_at || job.revisit_agreed_at || job.appointment_datetime || '');
    const body = `
      <div class="cwf-modal-section">
        <label>วันและเวลาที่ตกลงกับลูกค้า</label>
        <input id="cwf-revisit-schedule-${escapeHTML(key)}" type="datetime-local" value="${escapeHTML(val)}" />
        <div class="muted" style="margin-top:8px;font-size:12px">กรอกเฉพาะเวลานัดหมายที่ตกลงกับลูกค้าแล้ว</div>
      </div>
    `;
    openModal('🕛 แจ้งเวลานัดหมาย', body, `<button type="button" onclick="cwfRevisitSaveScheduleV21('${safeJs(key)}')">💾 บันทึกเวลานัดหมาย</button>`);
  }
  window.cwfRevisitOpenScheduleV21 = openSchedule;

  async function saveSchedule(jobKey){
    const key = keyOf(jobKey);
    const value = String(byId(`cwf-revisit-schedule-${key}`)?.value || '').trim();
    if (!value) return alert('กรุณาเลือกวันและเวลานัดหมาย');
    try {
      const r = await fetch(`${window.API_BASE || ''}/jobs/${encodeURIComponent(key)}/revisit-schedule`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        credentials:'same-origin',
        body: JSON.stringify({ revisit_agreed_at:value })
      });
      const data = await r.json().catch(()=>({}));
      if (!r.ok) {
        if (data && data.error === 'REVISIT_SCHEDULE_CONFLICT') {
          return alert('เวลานี้ชนกับงานอื่นที่มีอยู่แล้ว\n\nหากจำเป็นต้องเข้าช่วงเวลานี้จริง ๆ\nกรุณาติดต่อแอดมินเพื่อย้ายคิวงานเดิมก่อน\nหรือเลือกเวลานัดหมายใหม่');
        }
        // fail-soft: เก็บในเครื่องเพื่อไม่ให้ flow หน้างานค้าง ถ้า endpoint ยังไม่พร้อม
        console.warn('[CWF_REVISIT_V21] schedule endpoint failed', data);
      }
      writeJson(schedKey(key), { revisit_agreed_at:value, saved_at:new Date().toISOString() });
      if (typeof window.cwfTechToast === 'function') window.cwfTechToast('✅ บันทึกเวลานัดหมายแล้ว');
      else alert('✅ บันทึกเวลานัดหมายแล้ว');
      if (typeof window.cwfCloseModal === 'function') window.cwfCloseModal();
      try { if (typeof window.loadJobs === 'function') window.loadJobs(); } catch(_) {}
    } catch(e) {
      writeJson(schedKey(key), { revisit_agreed_at:value, saved_at:new Date().toISOString() });
      alert('✅ บันทึกเวลานัดหมายในเครื่องแล้ว');
      if (typeof window.cwfCloseModal === 'function') window.cwfCloseModal();
    }
  }
  window.cwfRevisitSaveScheduleV21 = saveSchedule;

  function openHub(jobKey){
    const key = keyOf(jobKey);
    const body = `
      <div class="cwf-close-hub">
        <button class="cwf-close-action" type="button" onclick="cwfRevisitOpenPhotosV21('${safeJs(key)}')">
          <span class="cwf-action-left"><span class="ico">📷</span><span><b>ลงรูปงานแก้ไข</b><small>ก่อนแก้ไข / หลังแก้ไข / จุดปัญหา</small></span></span><span class="cwf-action-arrow">›</span>
        </button>
        <button class="cwf-close-action" type="button" onclick="cwfRevisitOpenChecklistV21('${safeJs(key)}')">
          <span class="cwf-action-left"><span class="ico">✅</span><span><b>เช็คลิสงานแก้ไข</b><small>เลือกสาเหตุ ผลการแก้ไข และกรอกคำอธิบายได้ถ้ามี</small></span></span><span class="cwf-action-arrow">›</span>
        </button>
      </div>
    `;
    openModal('📷✅ รูปและเช็คลิสงานแก้ไข', body);
  }
  window.cwfRevisitOpenHubV21 = openHub;

  async function openPhotos(jobKey){
    const key = keyOf(jobKey);
    const counts = await countPhotos(key);
    const card = (phase, label, hint, req) => `
      <div class="cwf-photo-card" id="photo-card-${phase}">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
          <b>${label}</b><span class="cwf-chip ${counts[phase] ? 'ok' : (req ? 'warn' : '')}">${counts[phase] || 0} รูป</span>
        </div>
        <div class="muted" style="margin-top:5px">${hint}</div>
        <button type="button" onclick="cwfRevisitPickPhotoV21('${safeJs(key)}','${phase}')">📷 เพิ่มรูป</button>
        <div id="cwfPhotoUploadStatus_${phase}" class="cwf-inline-upload"></div>
      </div>`;
    const body = `
      <div class="cwf-mini-status">
        <span class="cwf-chip ${counts.revisit_before ? 'ok':'warn'}">ก่อนแก้ไข ${counts.revisit_before || 0} รูป</span>
        <span class="cwf-chip ${counts.revisit_after ? 'ok':'warn'}">หลังแก้ไข ${counts.revisit_after || 0} รูป</span>
        <span class="cwf-chip">จุดปัญหา ${counts.revisit_defect || 0} รูป</span>
      </div>
      <div class="cwf-photo-grid">
        ${card('revisit_before','ก่อนแก้ไข','บังคับก่อนปิดงาน',true)}
        ${card('revisit_after','หลังแก้ไข','บังคับก่อนปิดงาน',true)}
        ${card('revisit_defect','จุดปัญหา','ถ้ามี / ไม่บังคับ',false)}
      </div>
    `;
    openModal('📷 ลงรูปงานแก้ไข', body, `<button type="button" class="secondary" onclick="cwfRevisitOpenHubV21('${safeJs(key)}')">กลับ</button>`);
  }
  window.cwfRevisitOpenPhotosV21 = openPhotos;

  function pickPhoto(jobKey, phase){
    try {
      if (typeof window.pickPhotos === 'function') window.pickPhotos(jobKey, phase, 12);
      else if (typeof window.cwfPickPhotoAndRefresh === 'function') window.cwfPickPhotoAndRefresh(jobKey, phase);
      setTimeout(()=>openPhotos(jobKey), 1100);
    } catch(e) { alert(e.message || 'เลือกรูปไม่สำเร็จ'); }
  }
  window.cwfRevisitPickPhotoV21 = pickPhoto;

  function openChecklist(jobKey){
    const key = keyOf(jobKey);
    const d = getDraft(key);
    const body = `
      <div class="cwf-modal-section">
        <label>สาเหตุงานแก้ไข</label>
        <select id="cwf-revisit-cause-${escapeHTML(key)}" onchange="cwfRevisitSaveDraftV21('${safeJs(key)}')">
          <option value="">เลือกสาเหตุงานแก้ไข (จำเป็น)</option>
          <option value="technician" ${d.cause==='technician'?'selected':''}>เกิดจากช่าง / งานเดิม</option>
          <option value="customer" ${d.cause==='customer'?'selected':''}>เกิดจากการใช้งานของลูกค้า</option>
          <option value="company" ${d.cause==='company'?'selected':''}>เกิดจากระบบ / อะไหล่ / เงื่อนไขบริษัท</option>
          <option value="unclear" ${d.cause==='unclear'?'selected':''}>ยังไม่ชัดเจน ให้แอดมินตรวจ</option>
        </select>
      </div>
      <div class="cwf-modal-section">
        <label>คำอธิบายสาเหตุที่พบ <span class="muted">(ถ้ามี)</span></label>
        <textarea id="cwf-revisit-cause-note-${escapeHTML(key)}" rows="3" placeholder="กรอกคำอธิบายเพิ่มเติมได้ ไม่บังคับ" oninput="cwfRevisitSaveDraftV21('${safeJs(key)}')">${escapeHTML(d.causeNote)}</textarea>
      </div>
      <div class="cwf-modal-section">
        <label>ผลการแก้ไข</label>
        <select id="cwf-revisit-result-${escapeHTML(key)}" onchange="cwfRevisitSaveDraftV21('${safeJs(key)}')">
          <option value="">เลือกผลการแก้ไข (จำเป็น)</option>
          <option value="successful" ${d.result==='successful'?'selected':''}>แก้ไขสำเร็จ ใช้งานได้ปกติ</option>
          <option value="unsuccessful" ${d.result==='unsuccessful'?'selected':''}>ยังไม่จบ / ยังมีอาการ ต้องให้แอดมินติดตาม</option>
        </select>
      </div>
      <div class="cwf-modal-section">
        <label>คำอธิบายผลการแก้ไข <span class="muted">(ถ้ามี)</span></label>
        <textarea id="cwf-revisit-result-note-${escapeHTML(key)}" rows="3" placeholder="กรอกสรุปเพิ่มเติมได้ ไม่บังคับ" oninput="cwfRevisitSaveDraftV21('${safeJs(key)}')">${escapeHTML(d.resultNote)}</textarea>
      </div>
    `;
    openModal('✅ เช็คลิสงานแก้ไข', body, `<button type="button" onclick="cwfRevisitSaveDraftV21('${safeJs(key)}'); cwfRevisitSyncCardV21('${safeJs(key)}'); if(window.cwfTechToast)cwfTechToast('✅ บันทึกเช็คลิสแล้ว'); cwfRevisitOpenHubV21('${safeJs(key)}')">💾 บันทึกเช็คลิส</button>`);
  }
  window.cwfRevisitOpenChecklistV21 = openChecklist;

  function makePanel(jobKey){
    return `
      <div class="cwf-revisit-v21-panel" data-revisit-panel="${escapeHTML(jobKey)}" style="margin-top:12px;padding:12px;border:1px solid rgba(234,88,12,.18);background:#fff7ed;border-radius:18px;">
        <div style="font-weight:1000;color:#9a3412;">🔁 งานแก้ไข / กลับไปตรวจซ้ำ</div>
        <div class="muted" style="font-size:12px;margin-top:4px;color:#9a3412;">งานนี้ไม่มีเก็บเงินลูกค้า และไม่มีค่าตอบแทนเพิ่มเติม</div>
        <div class="cwf-close-hub" style="margin-top:10px;">
          <button class="cwf-close-action" type="button" onclick="cwfRevisitOpenScheduleV21('${safeJs(jobKey)}')">
            <span class="cwf-action-left"><span class="ico">🕛</span><span><b>แจ้งเวลานัดหมาย</b><small>บันทึกวันและเวลาที่ตกลงกับลูกค้า</small></span></span><span class="cwf-action-arrow">›</span>
          </button>
          <button class="cwf-close-action" type="button" onclick="cwfRevisitOpenHubV21('${safeJs(jobKey)}')">
            <span class="cwf-action-left"><span class="ico">📷✅</span><span><b>รูปและเช็คลิสงานแก้ไข</b><small>กดเข้าไปเลือกลงรูป หรือทำเช็คลิส</small></span></span><span class="cwf-action-arrow">›</span>
          </button>
        </div>
        <div class="muted" data-revisit-summary="${escapeHTML(jobKey)}" style="font-size:12px;margin-top:8px;">กำลังตรวจสถานะ...</div>
      </div>
    `;
  }

  async function updateSummary(jobKey){
    const el = document.querySelector(`[data-revisit-summary="${CSS.escape(jobKey)}"]`);
    if (!el) return;
    const d = getDraft(jobKey);
    const c = await countPhotos(jobKey);
    const bits = [
      `ก่อนแก้ไข ${c.revisit_before ? '✅' : '❌'}`,
      `หลังแก้ไข ${c.revisit_after ? '✅' : '❌'}`,
      `จุดปัญหา ${c.revisit_defect || 0} รูป`,
      `สาเหตุ ${d.cause ? '✅' : '❌'}`,
      `ผลแก้ไข ${d.result ? '✅' : '❌'}`
    ];
    el.textContent = bits.join(' • ');
  }
  window.cwfRevisitSyncCardV21 = updateSummary;

  function cleanupOldTechnicalUI(card){
    try {
      // ซ่อนกล่องเก่าที่มีคำ technical เช่น revisit_result / revisit_note
      card.querySelectorAll('*').forEach(node => {
        const txt = (node.textContent || '');
        if ((txt.includes('revisit_result') || txt.includes('revisit_note') || txt.includes('revisit evidence')) && !node.closest('.cwf-revisit-v21-panel')) {
          if (node.classList && (node.classList.contains('pill') || node.classList.contains('cwf-note-box') || node.tagName === 'DIV')) {
            node.style.display = 'none';
          }
        }
      });
      // ซ่อนช่อง technical เดิม แต่คง hidden fields ของ addon
      card.querySelectorAll('[id^="revisit-result-"],[id^="revisit-note-"]').forEach(el => {
        if (!el.closest('[id^="cwf-revisit-hidden-"]')) {
          const parent = el.closest('.cwf-note-box') || el.parentElement;
          if (parent) parent.style.display = 'none';
        }
      });
    } catch(_) {}
  }

  function enhanceCard(card, job){
    if (!card || !job) return;
    const key = keyOf(job.job_id || job.booking_code);
    if (!key || card.dataset.revisitV21 === '1') return;
    card.dataset.revisitV21 = '1';
    ensureHiddenFields(key);
    cleanupOldTechnicalUI(card);

    // ใส่ panel ใหม่หลังข้อมูลลูกค้า/ก่อนรายละเอียด ถ้าไม่เจอให้ใส่ท้ายการ์ด
    const existing = card.querySelector(`[data-revisit-panel="${CSS.escape(key)}"]`);
    if (!existing) {
      const target = card.querySelector('details.cwf-details') || card.querySelector('details') || null;
      const wrap = document.createElement('div');
      wrap.innerHTML = makePanel(key);
      if (target && target.parentNode) target.parentNode.insertBefore(wrap.firstElementChild, target);
      else card.appendChild(wrap.firstElementChild);
    }
    updateSummary(key);
  }

  function enhanceAll(){
    try {
      (window.__JOB_CACHE__ || []).forEach(job => {
        if (!isRevisitJob(job)) return;
        const key = keyOf(job.job_id || job.booking_code);
        let card = document.querySelector(`.job-card[data-jobkey="${CSS.escape(key)}"]`) || document.querySelector(`.job-card[data-jobid="${CSS.escape(String(job.job_id || ''))}"]`);
        if (card) enhanceCard(card, job);
      });
    } catch(e) { console.warn('[CWF_REVISIT_V21] enhance failed', e); }
  }
  window.cwfRevisitEnhanceV21 = enhanceAll;

  // Patch validation functions used by existing requestFinalize
  function patchGlobals(){
    try {
      window.getRevisitResultValue = function(jobKey){ return getDraft(jobKey).result || ''; };
      window.getRevisitNoteValue = function(jobKey){ const d = getDraft(jobKey); return combinedNote(d) || (d.result ? `ผลการแก้ไข: ${resultLabel(d.result)}` : ''); };
      window.hasRevisitEvidence = async function(jobKey){ const c = await countPhotos(jobKey); return !!(c.revisit_before && c.revisit_after); };
      const oldValidate = window.cwfValidateCloseRequirements;
      if (typeof oldValidate === 'function' && !oldValidate.__cwfRevisitV21) {
        const patched = async function(jobKey, targetStatus){
          const job = getJob(jobKey);
          if (targetStatus === 'เสร็จแล้ว' && isRevisitJob(job)) {
            const d = getDraft(jobKey);
            if (!d.cause) { alert('กรุณาเลือกสาเหตุงานแก้ไขในเช็คลิส'); return false; }
            if (!d.result) { alert('กรุณาเลือกผลการแก้ไขในเช็คลิส'); return false; }
            const c = await countPhotos(jobKey);
            if (!c.revisit_before || !c.revisit_after) { alert('กรุณาแนบรูปก่อนแก้ไขและรูปหลังแก้ไขให้ครบ'); return false; }
            syncHiddenFields(jobKey);
            return true;
          }
          return oldValidate.apply(this, arguments);
        };
        patched.__cwfRevisitV21 = true;
        window.cwfValidateCloseRequirements = patched;
        try { cwfValidateCloseRequirements = patched; } catch(_) {}
      }
    } catch(e) { console.warn('[CWF_REVISIT_V21] patch globals failed', e); }
  }

  // Patch render/load lifecycle without touching app.js
  function patchLifecycle(){
    patchGlobals();
    const oldRender = window.renderJobs;
    if (typeof oldRender === 'function' && !oldRender.__cwfRevisitV21) {
      const patchedRender = function(){
        const out = oldRender.apply(this, arguments);
        setTimeout(enhanceAll, 80);
        setTimeout(enhanceAll, 500);
        return out;
      };
      patchedRender.__cwfRevisitV21 = true;
      window.renderJobs = patchedRender;
      try { renderJobs = patchedRender; } catch(_) {}
    }
    const oldLoad = window.loadJobs;
    if (typeof oldLoad === 'function' && !oldLoad.__cwfRevisitV21) {
      const patchedLoad = function(){
        const out = oldLoad.apply(this, arguments);
        setTimeout(enhanceAll, 300);
        setTimeout(enhanceAll, 1000);
        return out;
      };
      patchedLoad.__cwfRevisitV21 = true;
      window.loadJobs = patchedLoad;
      try { loadJobs = patchedLoad; } catch(_) {}
    }
  }

  // CSS safety: hide old tech text only if inside revisit card and panel exists
  function injectStyle(){
    if (document.getElementById('cwfRevisitV21Style')) return;
    const st = document.createElement('style');
    st.id = 'cwfRevisitV21Style';
    st.textContent = `
      .cwf-revisit-v21-panel .cwf-close-action{background:#fff!important}
      .cwf-revisit-v21-panel .cwf-close-hub{margin-bottom:0!important}
    `;
    document.head.appendChild(st);
  }

  document.addEventListener('DOMContentLoaded', function(){
    injectStyle();
    patchLifecycle();
    setTimeout(enhanceAll, 400);
    setInterval(enhanceAll, 2500);
    log('loaded', VERSION);
  });
  // in case addon loads after DOMContentLoaded
  setTimeout(function(){ injectStyle(); patchLifecycle(); enhanceAll(); }, 150);
})();
