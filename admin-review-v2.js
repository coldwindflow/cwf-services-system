// Admin Review Queue v2
// - List jobs in "รอตรวจสอบ" (customer scheduled bookings)
// - Admin can edit job basics, load availability slots, pick primary technician + team members, and dispatch

let TECHS = [];
let CURRENT = null;
let CURRENT_SLOTS = [];

function byId(id){ return document.getElementById(id); }

function thDateTime(iso){
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
}

function safe(s){ return (s==null?'':String(s)); }

async function loadQueue(){
  const status = byId('statusFilter').value;
  const date = byId('dateFilter').value;
  byId('list').innerHTML = '<div class="muted">กำลังโหลด...</div>';
  try{
    const q = new URLSearchParams();
    q.set('status', status);
    if (date) q.set('date', date);
    q.set('limit', '200');
    const data = await apiFetch(`/admin/review_queue_v2?${q.toString()}`);
    const rows = (data.rows || []);
    byId('count').textContent = String(rows.length);

    if (!rows.length){
      byId('list').innerHTML = '<div class="card"><div class="muted">ไม่มีงานในคิวนี้</div></div>';
      return;
    }

    byId('list').innerHTML = rows.map(r=>{
      const st = safe(r.job_status).trim();
      const b = safe(r.booking_mode||'scheduled');
      const badge = st ? `<span class="pill">${st}</span>` : '';
      const urgent = b==='urgent' ? '<span class="pill" style="background:#fee2e2">ด่วน</span>' : '';
      return `
        <div class="card">
          <div class="row">
            <div>
              <b>#${r.job_id} • ${safe(r.booking_code||'')}</b>
              <div class="muted" style="margin-top:2px;">${safe(r.customer_name||'-')} • ${safe(r.customer_phone||'-')}</div>
            </div>
            <div style="text-align:right;display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
              ${badge}${urgent}
              <button class="btn btn-primary" type="button" onclick="openJob(${r.job_id})">เปิด</button>
            </div>
          </div>
          <div class="muted" style="margin-top:8px;">📅 ${thDateTime(r.appointment_datetime)} • 🧾 ${safe(r.job_type||'-')}</div>
          <div class="muted" style="margin-top:4px;">📍 ${safe(r.job_zone||'')} ${safe(r.address_text||'')}</div>
          <div class="muted" style="margin-top:4px;">⏱️ ${Number(r.duration_min||0)} นาที (รวม buffer ${Number(r.effective_block_min||0)} นาที)</div>
        </div>
      `;
    }).join('');

  }catch(e){
    console.error(e);
    byId('list').innerHTML = `<div class="card"><div class="muted">โหลดคิวไม่สำเร็จ: ${safe(e.message||e)}</div></div>`;
  }
}

async function loadTechs(){
  try{
    const d = await apiFetch('/admin/technicians');
    TECHS = Array.isArray(d) ? d : (d.rows||d.technicians||[]);
  }catch(e){
    console.warn('loadTechs failed', e);
    TECHS = [];
  }
}

function setModal(show){
  byId('overlay').classList.toggle('show', !!show);
}

function renderTechSelectors(techType){
  const group = (TECHS||[]).filter(t => (t.employment_type||'company') === techType);
  const primarySel = byId('technician_username');
  primarySel.innerHTML = '<option value="">-- เลือกช่างหลัก --</option>' + group.map(t=>{
    const name = t.full_name || t.username;
    return `<option value="${t.username}">${name} (${t.username})</option>`;
  }).join('');

  // team chips (checkbox list)
  const teamBox = byId('teamBox');
  const q = safe(byId('techSearch').value).toLowerCase();
  const filtered = q ? group.filter(t => (safe(t.full_name)+safe(t.username)).toLowerCase().includes(q)) : group;
  const selected = new Set((CURRENT?.team_members||[]).map(String));
  teamBox.innerHTML = filtered.map(t=>{
    const name = t.full_name || t.username;
    const checked = selected.has(t.username) ? 'checked' : '';
    return `<label class="chip"><input type="checkbox" data-u="${t.username}" ${checked}/> ${name}</label>`;
  }).join('') || '<div class="muted">ไม่มีช่างในกลุ่มนี้</div>';

  // keep primary in team by default
  if (CURRENT?.technician_username){
    primarySel.value = CURRENT.technician_username;
    ensurePrimaryInTeam();
  }
}

function getSelectedTeam(){
  const team = [];
  document.querySelectorAll('#teamBox input[type=checkbox]').forEach(ch=>{
    if (ch.checked) team.push(ch.getAttribute('data-u'));
  });
  // ensure unique
  return [...new Set(team.filter(Boolean))];
}

function ensurePrimaryInTeam(){
  const primary = byId('technician_username').value;
  if (!primary) return;
  const box = document.querySelector(`#teamBox input[data-u="${primary}"]`);
  if (box){ box.checked = true; }
}

async function openJob(jobId){
  try{
    // pull job from admin jobs_v2 (fast) then fetch team + pricing
    const j = await apiFetch(`/admin/review_queue_v2?job_id=${encodeURIComponent(String(jobId))}`);
    const row = (j.rows||[])[0];
    if (!row) throw new Error('ไม่พบงาน');

    CURRENT = {
      job_id: row.job_id,
      booking_code: row.booking_code,
      booking_mode: row.booking_mode || 'scheduled',
      job_status: row.job_status,
      job_type: row.job_type,
      duration_min: Number(row.duration_min||0),
      effective_block_min: Number(row.effective_block_min||0),
      appointment_datetime: row.appointment_datetime,
      customer_name: row.customer_name,
      customer_phone: row.customer_phone,
      address_text: row.address_text,
      maps_url: row.maps_url,
      customer_note: row.customer_note,
      job_zone: row.job_zone,
      tech_type: row.tech_type || (row.booking_mode==='urgent'?'partner':'company'),
      technician_username: row.technician_username || '',
      team_members: [],
    };

    // team
    try{
      const tm = await apiFetch(`/jobs/${CURRENT.job_id}/team?details=0`);
      CURRENT.team_members = Array.isArray(tm.members) ? tm.members : [];
    }catch{}

    // pricing
    try{
      const pr = await apiFetch(`/jobs/${CURRENT.job_id}/pricing`);
      byId('pricingBox').innerHTML = `ยอดรวม: <b>${fmtMoney(pr.total||0)}</b> บาท • ส่วนลด: ${fmtMoney(pr.discount||0)} บาท`;
    }catch{
      byId('pricingBox').innerHTML = 'ยอดรวม: -';
    }

    // fill modal
    byId('mJobId').textContent = `#${CURRENT.job_id}`;
    byId('mCode').textContent = safe(CURRENT.booking_code||'');
    byId('job_type').value = safe(CURRENT.job_type||'');
    byId('customer_name').value = safe(CURRENT.customer_name||'');
    byId('customer_phone').value = safe(CURRENT.customer_phone||'');
    byId('address_text').value = safe(CURRENT.address_text||'');
    byId('maps_url').value = safe(CURRENT.maps_url||'');
    byId('customer_note').value = safe(CURRENT.customer_note||'');
    byId('job_zone').value = safe(CURRENT.job_zone||'');
    byId('appointment_datetime').value = toLocalInputDatetime(new Date(CURRENT.appointment_datetime));

    const techType = CURRENT.booking_mode === 'urgent' ? 'partner' : 'company';
    byId('tech_type').value = techType;
    renderTechSelectors(techType);

    // ensure team defaults
    if (!CURRENT.team_members.length && CURRENT.technician_username){
      CURRENT.team_members = [CURRENT.technician_username];
    }
    byId('durationInfo').textContent = `${CURRENT.duration_min || 0} นาที (รวม buffer ${CURRENT.effective_block_min || 0} นาที)`;

    CURRENT_SLOTS = [];
    byId('slotBox').innerHTML = '<div class="muted">กด “โหลดคิวว่าง” เพื่อเลือกเวลาที่ว่างจริง</div>';

    setModal(true);
  }catch(e){
    console.error(e);
    showToast(e.message||'เปิดงานไม่สำเร็จ','error');
  }
}

async function saveJob(){
  if (!CURRENT) return;
  const payload = {
    customer_name: byId('customer_name').value.trim() || null,
    customer_phone: byId('customer_phone').value.trim() || null,
    job_type: byId('job_type').value.trim() || null,
    appointment_datetime: byId('appointment_datetime').value || null,
    address_text: byId('address_text').value.trim() || null,
    customer_note: byId('customer_note').value.trim() || null,
    maps_url: byId('maps_url').value.trim() || null,
    job_zone: byId('job_zone').value.trim() || null,
  };
  try{
    await apiFetch(`/jobs/${CURRENT.job_id}/admin-edit`, { method:'PUT', body: JSON.stringify(payload) });
    showToast('บันทึกใบงานแล้ว','success');
    await loadQueue();
  }catch(e){
    showToast(e.message||'บันทึกไม่สำเร็จ','error');
  }
}

async function loadSlots(){
  if (!CURRENT) return;
  const dtStr = byId('appointment_datetime').value;
  if (!dtStr){
    showToast('ต้องเลือกวัน/เวลา ก่อนโหลดคิวว่าง','error');
    return;
  }
  const date = dtStr.slice(0,10);
  const tech_type = byId('tech_type').value;
  const duration_min = Number(CURRENT.duration_min||0) || 60;

  byId('slotBox').innerHTML = '<div class="muted">กำลังโหลดคิวว่าง...</div>';
  try{
    const q = new URLSearchParams();
    q.set('date', date);
    q.set('tech_type', tech_type);
    q.set('duration_min', String(duration_min));
    const data = await apiFetch(`/public/availability_v2?${q.toString()}`);
    CURRENT_SLOTS = data.slots || [];

    if (!CURRENT_SLOTS.length){
      byId('slotBox').innerHTML = '<div class="muted">ไม่พบ slot ว่างในวันนี้</div>';
      return;
    }

    const currentTime = dtStr.slice(11,16);

    byId('slotBox').innerHTML = CURRENT_SLOTS.map(s=>{
      const disabled = !s.available;
      const label = `${s.start} - ${s.end}`;
      const active = s.start===currentTime ? 'style="border-color:#22c55e"' : '';
      return `
        <button class="btn btn-ghost" type="button" ${disabled?'disabled':''} ${active}
          onclick="pickSlot('${s.start}','${s.end}', ${JSON.stringify(s.available_tech_ids||[]).replace(/</g,'\\u003c')})">
          ${label} ${disabled?'(เต็ม)':''}
        </button>
      `;
    }).join('');

    showToast(`โหลดคิวว่างแล้ว (${CURRENT_SLOTS.filter(x=>x.available).length} slot)`,'success');
  }catch(e){
    console.error(e);
    byId('slotBox').innerHTML = `<div class="muted">โหลดคิวว่างไม่สำเร็จ: ${safe(e.message||e)}</div>`;
  }
}

function pickSlot(start, end, availableTechIds){
  if (!CURRENT) return;
  const dtStr = byId('appointment_datetime').value;
  const date = dtStr.slice(0,10);
  // set to start time
  byId('appointment_datetime').value = `${date}T${start}`;

  // Auto select first available tech as suggestion (admin can change)
  const primarySel = byId('technician_username');
  if (!primarySel.value && Array.isArray(availableTechIds) && availableTechIds.length){
    primarySel.value = String(availableTechIds[0]);
  }
  ensurePrimaryInTeam();
  showToast(`เลือกเวลา ${start} แล้ว`,'success');
}

async function dispatchJob(){
  if (!CURRENT) return;
  const tech_type = byId('tech_type').value;
  const technician_username = byId('technician_username').value;
  if (!technician_username){
    showToast('ต้องเลือกช่างหลักก่อนยิงงาน','error');
    return;
  }
  ensurePrimaryInTeam();
  const team_members = getSelectedTeam();
  if (!team_members.includes(technician_username)) team_members.unshift(technician_username);

  const mode = byId('dispatch_mode').value;

  // save job first (appointment edits)
  await saveJob();

  try{
    const payload = {
      technician_username,
      tech_type,
      mode,
      team_members,
    };
    const out = await apiFetch(`/jobs/${CURRENT.job_id}/dispatch_v2`, { method:'POST', body: JSON.stringify(payload) });
    showToast('ยิงงานสำเร็จ','success');
    setModal(false);
    await loadQueue();

    // notify summary
    if (out && out.offer && out.offer.offer_id){
      showToast('ส่งเป็นข้อเสนอแล้ว (offer)','info');
    }
  }catch(e){
    console.error(e);
    showToast(e.message||'ยิงงานไม่สำเร็จ','error');
  }
}

function closeModal(){ setModal(false); CURRENT=null; }

window.pickSlot = pickSlot;
window.openJob = openJob;

(async function init(){
  byId('dateFilter').value = todayYMD();
  await loadTechs();
  await loadQueue();

  byId('btnReload').addEventListener('click', loadQueue);
  byId('statusFilter').addEventListener('change', loadQueue);
  byId('dateFilter').addEventListener('change', loadQueue);

  byId('btnClose').addEventListener('click', closeModal);
  byId('btnSave').addEventListener('click', saveJob);
  byId('btnLoadSlots').addEventListener('click', loadSlots);
  byId('btnDispatch').addEventListener('click', dispatchJob);

  byId('tech_type').addEventListener('change', (e)=>{
    if (!CURRENT) return;
    CURRENT.technician_username = '';
    CURRENT.team_members = [];
    byId('techSearch').value = '';
    renderTechSelectors(e.target.value);
  });
  byId('technician_username').addEventListener('change', ensurePrimaryInTeam);
  byId('techSearch').addEventListener('input', ()=> renderTechSelectors(byId('tech_type').value));
})();
