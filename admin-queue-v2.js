/* Admin v2 - Monthly Calendar Queue (Modernized)
   - Premium monthly calendar for admin
   - Uses existing v2 availability logic only (server-side duration/buffer unchanged)
   - Free-mode day detail reads both legacy and current response shapes for backward compatibility
*/

function pad2(x){ return String(x).padStart(2,'0'); }

function ymd(d){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

function monthLabel(year, monthIdx){
  const d = new Date(year, monthIdx, 1);
  return d.toLocaleDateString('th-TH', { year:'numeric', month:'long' });
}

function fullThaiDate(dateStr){
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('th-TH', {
    weekday:'long', year:'numeric', month:'long', day:'numeric'
  });
}

function rangeFromSlots(slots){
  const ranges = [];
  let cur = null;
  for (const s of (slots || [])){
    if (!s.available) {
      if (cur){ ranges.push(cur); cur = null; }
      continue;
    }
    if (!cur) cur = { start: s.start, end: s.end };
    else cur.end = s.end;
  }
  if (cur) ranges.push(cur);
  return ranges;
}

function setSelectOptions(sel, options, value){
  sel.innerHTML = options.map(o=>`<option value="${o.value}">${o.label}</option>`).join('');
  if (value != null) sel.value = String(value);
}

function limitTextRanges(ranges, max=2){
  return (ranges || []).slice(0, max).map(r=>`${r.start}–${r.end}`).join(', ');
}

async function pMap(list, limit, mapper){
  const out = new Array(list.length);
  let i = 0;
  const workers = new Array(Math.min(limit, list.length)).fill(0).map(async ()=>{
    while (i < list.length){
      const idx = i++;
      out[idx] = await mapper(list[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

const state = {
  year: null,
  monthIdx: null,
  durationMin: 30,
  techType: 'all',
  monthData: new Map(),
  today: ymd(new Date()),
  selectedDate: null,
  modal: { date:null, mode:'free', type:'all' }
};

function getTechTypeForQuery(){
  return el('tech_type').value || 'all';
}

function techTypeLabel(v){
  if (v === 'company') return 'ช่างบริษัท';
  if (v === 'partner') return 'ช่างพาร์ทเนอร์';
  return 'รวมทั้งหมด';
}

function statusText(view){
  return view?.hasAny ? 'มีช่างว่าง' : 'เต็ม';
}

function escapeHtml(s){
  return String(s || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function normalizeStatusClass(status){
  const s = String(status || '').trim();
  if (!s) return 'pending';
  if (s === 'เสร็จแล้ว') return 'done';
  if (s === 'ยกเลิก') return 'cancel';
  if (s === 'งานแก้ไข') return 'fix';
  if (s.includes('เดินทาง') || s.includes('ถึงหน้างาน') || s.includes('กำลัง')) return 'progress';
  return 'pending';
}

function initPickers(){
  const now = new Date();
  state.year = now.getFullYear();
  state.monthIdx = now.getMonth();

  const monthOpts = Array.from({length:12}).map((_,i)=>({
    value: String(i),
    label: new Date(2000, i, 1).toLocaleDateString('th-TH', { month:'long' })
  }));
  setSelectOptions(el('month'), monthOpts, String(state.monthIdx));

  const years = [];
  for (let yy = state.year - 2; yy <= state.year + 3; yy++) years.push({ value:String(yy), label:String(yy) });
  setSelectOptions(el('year'), years, String(state.year));
  el('duration_min').value = String(state.durationMin);
  syncDurationPreset();
  updateHeaderSummary();
}

function syncDurationPreset(){
  const v = String(Math.max(15, Number(el('duration_min').value || 30)));
  document.querySelectorAll('#durationPresetRow .preset-btn').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.duration === v);
  });
}

function bindUI(){
  const filterCard = el('filterCard');
  el('btnToggleFilters').addEventListener('click', ()=>{
    const hidden = filterCard.style.display === 'none';
    filterCard.style.display = hidden ? 'block' : 'none';
  });

  el('btnToday').addEventListener('click', ()=> goToToday());
  el('btnReloadTop').addEventListener('click', ()=> loadMonth({ manual:true }));
  el('btnLoad').addEventListener('click', ()=> loadMonth({ manual:true }));
  el('btnReload').addEventListener('click', ()=> loadMonth({ manual:true }));
  el('btnResetFilters').addEventListener('click', ()=> resetFilters());
  el('prevMonth').addEventListener('click', ()=> shiftMonth(-1));
  el('nextMonth').addEventListener('click', ()=> shiftMonth(1));

  el('month').addEventListener('change', ()=>{
    state.monthIdx = Number(el('month').value || 0);
    updateHeaderSummary();
    loadMonth({ manual:false });
  });
  el('year').addEventListener('change', ()=>{
    state.year = Number(el('year').value || new Date().getFullYear());
    updateHeaderSummary();
    loadMonth({ manual:false });
  });
  el('duration_min').addEventListener('change', ()=>{
    state.durationMin = Math.max(15, Number(el('duration_min').value || 30));
    el('duration_min').value = String(state.durationMin);
    syncDurationPreset();
    updateHeaderSummary();
  });
  el('tech_type').addEventListener('change', ()=>{
    state.techType = getTechTypeForQuery();
    updateHeaderSummary();
    if (state.monthData.size) renderMonth();
  });

  document.querySelectorAll('#durationPresetRow .preset-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      el('duration_min').value = btn.dataset.duration;
      state.durationMin = Math.max(15, Number(btn.dataset.duration || 30));
      syncDurationPreset();
      updateHeaderSummary();
      loadMonth({ manual:true });
    });
  });

  el('btnCloseModal').addEventListener('click', closeModal);
  el('dayModal').addEventListener('click', (e)=>{ if (e.target && e.target.id === 'dayModal') closeModal(); });

  document.querySelectorAll('#segAvail button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('#segAvail button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      state.modal.mode = btn.dataset.mode;
      renderModal();
    });
  });
  document.querySelectorAll('#segType button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('#segType button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      state.modal.type = btn.dataset.type;
      renderModal();
    });
  });
}

function resetFilters(){
  const now = new Date();
  state.year = now.getFullYear();
  state.monthIdx = now.getMonth();
  state.durationMin = 30;
  state.techType = 'all';
  el('year').value = String(state.year);
  el('month').value = String(state.monthIdx);
  el('duration_min').value = '30';
  el('tech_type').value = 'all';
  syncDurationPreset();
  updateHeaderSummary();
  loadMonth({ manual:true });
}

function goToToday(){
  const now = new Date();
  state.year = now.getFullYear();
  state.monthIdx = now.getMonth();
  el('year').value = String(state.year);
  el('month').value = String(state.monthIdx);
  updateHeaderSummary();
  loadMonth({ manual:true }).then(()=>{
    const cell = document.querySelector(`.day-cell[data-date="${state.today}"]`);
    if (cell) {
      cell.scrollIntoView({ behavior:'smooth', block:'center' });
      cell.classList.add('selected');
      setTimeout(()=>cell.classList.remove('selected'), 1200);
    }
  }).catch(()=>{});
}

function shiftMonth(delta){
  const d = new Date(state.year, state.monthIdx, 1);
  d.setMonth(d.getMonth() + delta);
  state.year = d.getFullYear();
  state.monthIdx = d.getMonth();
  el('year').value = String(state.year);
  el('month').value = String(state.monthIdx);
  updateHeaderSummary();
  loadMonth({ manual:true });
}

async function loadDayAvailability(date, tech_type){
  const duration_min = Math.max(15, Number(el('duration_min').value || 30));
  const data = await apiFetch(`/public/availability_v2?date=${encodeURIComponent(date)}&tech_type=${encodeURIComponent(tech_type)}&duration_min=${encodeURIComponent(duration_min)}&forced=1`);
  const ranges = rangeFromSlots(data.slots || []);
  const hasAny = (data.slots || []).some(s=>s.available);
  return {
    hasAny,
    ranges,
    slot_step_min: data.slot_step_min,
    travel_buffer_min: data.travel_buffer_min,
    rawSlots: data.slots || []
  };
}

function pickDayView(r){
  const t = getTechTypeForQuery();
  if (t === 'company') return r.company;
  if (t === 'partner') return r.partner;
  return {
    hasAny: !!(r.company?.hasAny || r.partner?.hasAny),
    ranges: [...(r.company?.ranges || []), ...(r.partner?.ranges || [])]
  };
}

function computeMonthSummary(){
  const daysInMonth = new Date(state.year, state.monthIdx + 1, 0).getDate();
  let openDays = 0;
  let fullDays = 0;
  for (let d=1; d<=daysInMonth; d++){
    const date = ymd(new Date(state.year, state.monthIdx, d));
    const rec = state.monthData.get(date);
    const view = rec ? pickDayView(rec) : { hasAny:false };
    if (view.hasAny) openDays += 1;
    else fullDays += 1;
  }
  return { daysInMonth, openDays, fullDays };
}

function updateHeaderSummary(){
  const label = monthLabel(Number(el('year')?.value || state.year || new Date().getFullYear()), Number(el('month')?.value || state.monthIdx || new Date().getMonth()));
  const duration = Math.max(15, Number(el('duration_min')?.value || state.durationMin || 30));
  const techType = getTechTypeForQuery();
  el('heroMonthText').textContent = label;
  el('heroDurationText').textContent = `${duration} นาที`;
  el('heroTechTypeText').textContent = techTypeLabel(techType);
  el('currentFilterSummary').textContent = `${label} • ${techTypeLabel(techType)} • ${duration} นาที`;
  if (el('viewBadge')) el('viewBadge').textContent = `มุมมอง: ${techTypeLabel(techType)}`;
}

async function loadMonth({ manual=false } = {}){
  const year = Number(el('year').value || new Date().getFullYear());
  const monthIdx = Number(el('month').value || 0);
  state.year = year;
  state.monthIdx = monthIdx;
  state.durationMin = Math.max(15, Number(el('duration_min').value || 30));
  state.techType = getTechTypeForQuery();
  updateHeaderSummary();

  const last = new Date(year, monthIdx + 1, 0);
  const days = last.getDate();
  const dates = [];
  for (let d=1; d<=days; d++) dates.push(ymd(new Date(year, monthIdx, d)));

  ['btnLoad','btnReload','btnReloadTop'].forEach(id=>{ const node = el(id); if (node) node.disabled = true; });
  el('monthCalendar').style.display = 'block';
  el('monthTitle').textContent = monthLabel(state.year, state.monthIdx);
  el('monthSub').textContent = 'กำลังโหลดข้อมูลคิวช่าง...';
  el('monthGrid').innerHTML = `<div class="loading-box" style="grid-column:1 / -1">กำลังโหลดปฏิทินรายเดือน...</div>`;

  try{
    const results = await pMap(dates, 6, async (date)=>{
      const [company, partner] = await Promise.all([
        loadDayAvailability(date, 'company').catch(()=>({ hasAny:false, ranges:[] })),
        loadDayAvailability(date, 'partner').catch(()=>({ hasAny:false, ranges:[] }))
      ]);
      return { date, company, partner };
    });
    state.monthData = new Map();
    for (const r of results) state.monthData.set(r.date, r);
    renderMonth();
    if (manual) showToast('โหลดปฏิทินรายเดือนแล้ว', 'success');
  }catch(e){
    console.error(e);
    el('monthSub').textContent = 'โหลดปฏิทินไม่สำเร็จ';
    el('monthGrid').innerHTML = `<div class="empty-state" style="grid-column:1 / -1">โหลดปฏิทินไม่สำเร็จ<br>${escapeHtml(String(e.message || e))}</div>`;
    showToast(e.message || 'โหลดปฏิทินไม่สำเร็จ', 'error');
  }finally{
    ['btnLoad','btnReload','btnReloadTop'].forEach(id=>{ const node = el(id); if (node) node.disabled = false; });
  }
}

function renderMonth(){
  el('monthCalendar').style.display = 'block';
  el('monthTitle').textContent = monthLabel(state.year, state.monthIdx);
  el('monthSub').textContent = `ระยะเวลางาน ${state.durationMin} นาที • ${techTypeLabel(getTechTypeForQuery())} • ใช้ travel buffer เดิมของระบบ`;
  el('viewBadge').textContent = `มุมมอง: ${techTypeLabel(getTechTypeForQuery())}`;

  const { daysInMonth, openDays, fullDays } = computeMonthSummary();
  el('statDaysInMonth').textContent = String(daysInMonth);
  el('statOpenDays').textContent = String(openDays);
  el('statFullDays').textContent = String(fullDays);

  const todayRec = state.monthData.get(state.today);
  if (todayRec && state.today.startsWith(`${state.year}-${pad2(state.monthIdx + 1)}-`)){
    const todayView = pickDayView(todayRec);
    el('statToday').textContent = todayView.hasAny ? 'ว่าง' : 'เต็ม';
    el('statTodaySub').textContent = todayView.hasAny ? (limitTextRanges(todayView.ranges, 1) || 'มีช่างว่าง') : 'ไม่มีช่างว่างในวันนี้';
  }else{
    el('statToday').textContent = '-';
    el('statTodaySub').textContent = 'เดือนที่เลือกไม่ใช่เดือนปัจจุบัน';
  }

  const grid = el('monthGrid');
  grid.innerHTML = '';

  const first = new Date(state.year, state.monthIdx, 1);
  const startDow = first.getDay();
  const daysIn = new Date(state.year, state.monthIdx + 1, 0).getDate();

  const prevLast = new Date(state.year, state.monthIdx, 0).getDate();
  for (let i=0; i<startDow; i++){
    const dayNum = prevLast - (startDow - 1 - i);
    const cell = document.createElement('div');
    cell.className = 'day-cell muted';
    cell.innerHTML = `<div class="day-top"><div class="day-number">${dayNum}</div></div>`;
    grid.appendChild(cell);
  }

  for (let d=1; d<=daysIn; d++){
    const date = ymd(new Date(state.year, state.monthIdx, d));
    const rec = state.monthData.get(date) || { company:{ hasAny:false, ranges:[] }, partner:{ hasAny:false, ranges:[] } };
    const view = pickDayView(rec);
    const cell = document.createElement('div');
    const isToday = date === state.today;
    const selected = state.selectedDate === date;
    cell.className = `day-cell ${view.hasAny ? 'free' : 'full'}${isToday ? ' today' : ''}${selected ? ' selected' : ''}`;
    cell.dataset.date = date;

    const pill = view.hasAny
      ? `<span class="status-pill free"><span class="dot free"></span>มีช่างว่าง</span>`
      : `<span class="status-pill full"><span class="dot full"></span>เต็ม</span>`;

    let detailHtml = '';
    if (getTechTypeForQuery() === 'all'){
      detailHtml = `
        <div class="day-line"><span>บริษัท</span><span class="tag ${rec.company?.hasAny ? 'ok' : 'full'}">${rec.company?.hasAny ? 'ว่าง' : 'เต็ม'}</span></div>
        <div class="day-line"><span>พาร์ทเนอร์</span><span class="tag ${rec.partner?.hasAny ? 'ok' : 'full'}">${rec.partner?.hasAny ? 'ว่าง' : 'เต็ม'}</span></div>
      `;
    } else {
      detailHtml = `
        <div class="day-line"><span>สถานะวันนี้</span><span class="tag ${view.hasAny ? 'ok' : 'full'}">${statusText(view)}</span></div>
      `;
    }

    const preview = view.hasAny
      ? `<div class="slot-preview"><strong>ช่วงว่าง:</strong> ${escapeHtml(limitTextRanges(view.ranges, getTechTypeForQuery()==='all' ? 1 : 2) || 'มีช่วงว่าง')}</div>`
      : `<div class="slot-preview">แตะเพื่อดูช่างที่ติดคิว / งานในวันนี้</div>`;

    cell.innerHTML = `
      <div class="day-top">
        <div class="day-number">${d}</div>
        ${pill}
      </div>
      <div class="day-body">
        ${detailHtml}
        ${preview}
      </div>
    `;
    cell.addEventListener('click', ()=> openModal(date));
    grid.appendChild(cell);
  }

  const totalCells = startDow + daysIn;
  const remain = (7 - (totalCells % 7)) % 7;
  for (let i=1; i<=remain; i++){
    const cell = document.createElement('div');
    cell.className = 'day-cell muted';
    cell.innerHTML = `<div class="day-top"><div class="day-number">${i}</div></div>`;
    grid.appendChild(cell);
  }
}

function closeModal(){
  el('dayModal').style.display = 'none';
}

async function openModal(date){
  state.selectedDate = date;
  const monthRec = state.monthData.get(date);
  const currentView = monthRec ? pickDayView(monthRec) : { hasAny:true };
  state.modal.date = date;
  state.modal.mode = currentView.hasAny ? 'free' : 'full';
  state.modal.type = getTechTypeForQuery() === 'all' ? 'all' : getTechTypeForQuery();

  document.querySelectorAll('.day-cell').forEach(node=>{
    node.classList.toggle('selected', node.dataset.date === date);
  });
  document.querySelectorAll('#segAvail button').forEach(b=>b.classList.toggle('active', b.dataset.mode === state.modal.mode));
  document.querySelectorAll('#segType button').forEach(b=>b.classList.toggle('active', b.dataset.type === state.modal.type));

  el('modalTitle').textContent = `รายละเอียดวันที่ ${fullThaiDate(date)}`;
  el('modalSub').textContent = 'ดูช่างว่าง หรือดูงานที่มีอยู่ในวันนั้น แล้วแตะรายการงานเพื่อเปิดใบงานได้';
  el('modalDuration').textContent = `${state.durationMin} นาที`;
  el('modalViewType').textContent = techTypeLabel(state.modal.type);
  el('modalList').innerHTML = '<div class="loading-box">กำลังโหลดรายละเอียด...</div>';
  el('dayModal').style.display = 'flex';

  await renderModal();
}

function normalizeTechAvailabilityResponse(r){
  const rows = Array.isArray(r?.techs) ? r.techs : (Array.isArray(r?.technicians) ? r.technicians : []);
  if (rows.length && rows[0] && Array.isArray(rows[0].slots)) {
    return rows.map(row => ({
      username: row.username,
      full_name: row.full_name || row.username,
      slots: Array.isArray(row.slots) ? row.slots : []
    }));
  }
  const techs = Array.isArray(r?.technicians) ? r.technicians : [];
  const slotsByTech = r?.slots_by_tech || {};
  return techs.map(tech => ({
    username: tech.username,
    full_name: tech.full_name || tech.username,
    slots: Array.isArray(slotsByTech[tech.username]) ? slotsByTech[tech.username] : []
  }));
}

async function renderModal(){
  const date = state.modal.date;
  if (!date) return;

  const list = el('modalList');
  const modalTypeLabel = techTypeLabel(state.modal.type);
  el('modalViewType').textContent = modalTypeLabel;
  list.innerHTML = '<div class="loading-box">กำลังโหลดรายละเอียด...</div>';

  try{
    if (state.modal.mode === 'free'){
      const items = [];
      const types = (state.modal.type === 'all') ? ['company','partner'] : [state.modal.type];
      const byType = await Promise.all(types.map(async (t)=>({
        t,
        r: await apiFetch(`/admin/availability_by_tech_v2?date=${encodeURIComponent(date)}&tech_type=${encodeURIComponent(t)}&duration_min=${encodeURIComponent(state.durationMin)}&forced=1`)
      })));

      for (const bt of byType){
        const rows = normalizeTechAvailabilityResponse(bt.r);
        for (const tech of rows){
          const free = (tech.slots || []).filter(s=>s.available);
          if (!free.length) continue;
          items.push({
            type: bt.t,
            username: tech.username,
            name: tech.full_name || tech.username,
            ranges: rangeFromSlots(tech.slots || []),
            freeCount: free.length
          });
        }
      }

      if (!items.length){
        list.innerHTML = '<div class="empty-state">ไม่พบช่างว่างในเงื่อนไขนี้</div>';
        return;
      }

      list.innerHTML = '';
      for (const it of items.sort((a,b)=>a.name.localeCompare(b.name, 'th'))){
        const rangesTxt = (it.ranges || []).map(r=>`${r.start}–${r.end}`).join(', ');
        const div = document.createElement('div');
        div.className = 'item';
        div.innerHTML = `
          <div class="row">
            <div class="item-title">${escapeHtml(it.name)}</div>
            <div class="type-badge ${it.type}">${it.type === 'company' ? 'บริษัท' : 'พาร์ทเนอร์'}</div>
          </div>
          <div class="item-meta">
            <span>🕒 ช่วงว่าง ${escapeHtml(rangesTxt || '-')}</span>
            <span>✅ สล็อตว่าง ${it.freeCount}</span>
          </div>
          <div class="item-note">เหมาะสำหรับลงงานเพิ่มในวันที่ ${escapeHtml(fullThaiDate(date))}</div>
        `;
        list.appendChild(div);
      }
      return;
    }

    const types = (state.modal.type === 'all') ? ['company','partner'] : [state.modal.type];
    const all = [];
    for (const t of types){
      const r = await apiFetch(`/admin/schedule_v2?date=${encodeURIComponent(date)}&tech_type=${encodeURIComponent(t)}`);
      const techMap = new Map((r.technicians || []).map(x=>[x.username, x]));
      for (const [u, jobs] of Object.entries(r.jobs_by_tech || {})){
        for (const j of (jobs || [])){
          all.push({ type:t, tech: techMap.get(u), job:j });
        }
      }
    }

    if (!all.length){
      list.innerHTML = '<div class="empty-state">ไม่พบงานในวันนี้สำหรับตัวกรองนี้</div>';
      return;
    }

    all.sort((a,b)=> String(a.job.start_iso || '').localeCompare(String(b.job.start_iso || '')));
    list.innerHTML = '';
    for (const x of all){
      const techName = x.tech?.full_name || x.tech?.username || x.job?.technician_username || '-';
      const start = new Date(x.job.start_iso);
      const end = new Date(x.job.end_iso);
      const time = `${pad2(start.getHours())}:${pad2(start.getMinutes())}–${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
      const div = document.createElement('div');
      div.className = 'item';
      if (x.job.job_id) div.style.cursor = 'pointer';
      const statusClass = normalizeStatusClass(x.job.job_status);
      div.innerHTML = `
        <div class="row">
          <div class="item-title">${escapeHtml(x.job.booking_code || ('#' + x.job.job_id))} • ${escapeHtml(x.job.job_type || 'งานบริการ')}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
            <div class="type-badge ${x.type}">${x.type === 'company' ? 'บริษัท' : 'พาร์ทเนอร์'}</div>
            <div class="job-status ${statusClass}">${escapeHtml(x.job.job_status || 'รอดำเนินการ')}</div>
          </div>
        </div>
        <div class="item-meta">
          <span>🕒 ${time}</span>
          <span>👷 ${escapeHtml(techName)}</span>
        </div>
        <div class="item-note">${escapeHtml((x.job.job_zone || '—').trim())} • ${escapeHtml((x.job.address_text || '').trim() || '—')}</div>
      `;
      if (x.job.job_id){
        div.addEventListener('click', ()=>{
          location.href = `/admin-job-view-v2.html?job_id=${encodeURIComponent(String(x.job.job_id))}`;
        });
      }
      list.appendChild(div);
    }
  }catch(e){
    console.error(e);
    list.innerHTML = `<div class="empty-state">โหลดรายละเอียดไม่สำเร็จ<br>${escapeHtml(String(e.message || e))}</div>`;
  }
}

function init(){
  initPickers();
  bindUI();
  loadMonth({ manual:false });
}

init();
