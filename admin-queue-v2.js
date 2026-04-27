/* Admin v2 - Queue Calendar (refined)
   User feedback fixes:
   - show only today + next 30 days (no past dates)
   - remove duplicated top actions / cleaner overview
   - improve button contrast in filter modal
   - cleaner day status layout
   - keep daily time filter in modal
*/

function pad2(x){ return String(x).padStart(2,'0'); }
function ymd(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function monthLabel(year, monthIdx){ return new Date(year, monthIdx, 1).toLocaleDateString('th-TH', { year:'numeric', month:'long' }); }
function fullThaiDate(dateStr){ return new Date(`${dateStr}T00:00:00`).toLocaleDateString('th-TH', { weekday:'long', year:'numeric', month:'long', day:'numeric' }); }
function shortWeekday(dateStr){ return new Date(`${dateStr}T00:00:00`).toLocaleDateString('th-TH', { weekday:'short' }); }
function shortDate(dateStr){ return new Date(`${dateStr}T00:00:00`).toLocaleDateString('th-TH', { day:'numeric', month:'short' }); }
function escapeHtml(s){ return String(s || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function timeToMin(s){ if (!s) return null; const [h,m] = String(s).split(':').map(Number); return (h * 60) + (m || 0); }
function addDays(dateObj, n){ const d = new Date(dateObj); d.setDate(d.getDate() + n); return d; }

function rangeFromSlots(slots){
  const ranges = [];
  let cur = null;
  for (const s of (slots || [])){
    if (!s.available){ if (cur){ ranges.push(cur); cur = null; } continue; }
    if (!cur) cur = { start: s.start, end: s.end };
    else cur.end = s.end;
  }
  if (cur) ranges.push(cur);
  return ranges;
}

async function pMap(list, limit, mapper){
  const out = new Array(list.length);
  let i = 0;
  const workers = new Array(Math.min(limit, Math.max(1, list.length))).fill(0).map(async ()=>{
    while (i < list.length){
      const idx = i++;
      out[idx] = await mapper(list[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

const todayObj = new Date();
todayObj.setHours(0,0,0,0);
const windowStart = new Date(todayObj);
const windowEnd = addDays(todayObj, 30);

const state = {
  year: todayObj.getFullYear(),
  monthIdx: todayObj.getMonth(),
  durationMin: 30,
  techType: 'all',
  monthData: new Map(),
  availableMonths: [],
  today: ymd(todayObj),
  selectedDate: null,
  modal: { date:null, mode:'free', type:'all', timeFilter:'' },
  filtersDraft: null
};

function techTypeLabel(v){ return v === 'company' ? 'ช่างบริษัท' : (v === 'partner' ? 'ช่างพาร์ทเนอร์' : 'รวมทั้งหมด'); }
function statusText(view){ return view?.hasAny ? 'ว่าง' : 'เต็ม'; }
function getWindowDates(){
  const out = [];
  let cur = new Date(windowStart);
  while (cur <= windowEnd){
    out.push(ymd(cur));
    cur = addDays(cur, 1);
  }
  return out;
}

function buildAvailableMonths(){
  const map = new Map();
  for (const ds of getWindowDates()){
    const d = new Date(`${ds}T00:00:00`);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!map.has(key)) map.set(key, { year:d.getFullYear(), monthIdx:d.getMonth() });
  }
  state.availableMonths = Array.from(map.values());
}

function setSelectOptions(sel, options, value){
  sel.innerHTML = options.map(o=>`<option value="${o.value}">${o.label}</option>`).join('');
  if (value != null) sel.value = String(value);
}

function syncMonthYearOptions(){
  const years = Array.from(new Set(state.availableMonths.map(m=>m.year))).sort((a,b)=>a-b);
  setSelectOptions(el('year'), years.map(y=>({ value:String(y), label:String(y) })), state.year);
  const monthsForYear = state.availableMonths.filter(m=>m.year === Number(el('year').value || state.year));
  const desiredMonth = monthsForYear.some(m=>m.monthIdx === state.monthIdx) ? state.monthIdx : (monthsForYear[0]?.monthIdx ?? todayObj.getMonth());
  setSelectOptions(
    el('month'),
    monthsForYear.map(m=>({ value:String(m.monthIdx), label:new Date(m.year, m.monthIdx, 1).toLocaleDateString('th-TH', { month:'long' }) })),
    desiredMonth
  );
  state.year = Number(el('year').value || state.year);
  state.monthIdx = Number(el('month').value || desiredMonth);
}

function syncDurationPreset(){
  const v = String(Math.max(15, Number(el('duration_min').value || state.durationMin || 30)));
  document.querySelectorAll('#durationPresetRow .preset-btn').forEach(btn=>btn.classList.toggle('active', btn.dataset.duration === v));
}

function syncTimeQuick(){
  const v = String(el('modalTimeFilter').value || '');
  document.querySelectorAll('#timeQuickRow .time-chip').forEach(btn=>btn.classList.toggle('active', btn.dataset.time === v));
}

function getTechTypeForQuery(){ return el('tech_type').value || 'all'; }

function getVisibleDates(){
  return getWindowDates().filter(ds=>{
    const d = new Date(`${ds}T00:00:00`);
    return d.getFullYear() === Number(el('year').value || state.year) && d.getMonth() === Number(el('month').value || state.monthIdx);
  });
}

function getVisibleMonthKeyIndex(){
  return state.availableMonths.findIndex(m=>m.year === Number(el('year').value || state.year) && m.monthIdx === Number(el('month').value || state.monthIdx));
}

function updateNavButtons(){
  const idx = getVisibleMonthKeyIndex();
  el('prevMonth').disabled = idx <= 0;
  el('nextMonth').disabled = idx < 0 || idx >= state.availableMonths.length - 1;
  el('prevMonth').style.opacity = idx <= 0 ? '.45' : '1';
  el('nextMonth').style.opacity = idx < 0 || idx >= state.availableMonths.length - 1 ? '.45' : '1';
}

function updateHeaderSummary(){
  state.year = Number(el('year').value || state.year);
  state.monthIdx = Number(el('month').value || state.monthIdx);
  state.durationMin = Math.max(15, Number(el('duration_min').value || state.durationMin || 30));
  state.techType = getTechTypeForQuery();

  const label = monthLabel(state.year, state.monthIdx);
  const rangeText = `${shortDate(ymd(windowStart))} - ${shortDate(ymd(windowEnd))}`;
  el('heroMonthText').textContent = label;
  el('heroDurationText').textContent = `${state.durationMin} นาที`;
  el('heroTechTypeText').textContent = techTypeLabel(state.techType);
  el('heroRangeText').textContent = rangeText;
  el('monthTitle').textContent = `คิวช่าง ${label}`;
  el('monthBadge').textContent = label;
  el('monthSub').textContent = `แสดงเฉพาะช่วง ${rangeText} • ${techTypeLabel(state.techType)} • ระยะเวลางาน ${state.durationMin} นาที`;
  updateNavButtons();
}

function initPickers(){
  buildAvailableMonths();
  syncMonthYearOptions();
  el('duration_min').value = String(state.durationMin);
  el('tech_type').value = state.techType;
  syncDurationPreset();
  updateHeaderSummary();
}

function openFilterModal(){
  state.filtersDraft = {
    year: el('year').value,
    month: el('month').value,
    duration_min: el('duration_min').value,
    tech_type: el('tech_type').value
  };
  el('filterModal').style.display = 'flex';
}

function closeFilterModal(revert=false){
  if (revert && state.filtersDraft){
    el('year').value = state.filtersDraft.year;
    syncMonthYearOptions();
    el('month').value = state.filtersDraft.month;
    el('duration_min').value = state.filtersDraft.duration_min;
    el('tech_type').value = state.filtersDraft.tech_type;
    syncDurationPreset();
    updateHeaderSummary();
  }
  el('filterModal').style.display = 'none';
}

function closeModal(){ el('dayModal').style.display = 'none'; }

function bindUI(){
  el('btnToday').addEventListener('click', ()=> goToToday());
  el('btnReload').addEventListener('click', ()=> loadMonth({ manual:true }));
  el('btnOpenFilter').addEventListener('click', openFilterModal);
  el('btnCloseFilter').addEventListener('click', ()=> closeFilterModal(true));
  el('filterModal').addEventListener('click', (e)=>{ if (e.target && e.target.id === 'filterModal') closeFilterModal(true); });

  el('year').addEventListener('change', ()=>{ syncMonthYearOptions(); updateHeaderSummary(); });
  el('month').addEventListener('change', updateHeaderSummary);
  el('duration_min').addEventListener('change', ()=>{
    el('duration_min').value = String(Math.max(15, Number(el('duration_min').value || 30)));
    syncDurationPreset();
    updateHeaderSummary();
  });
  el('tech_type').addEventListener('change', updateHeaderSummary);

  document.querySelectorAll('#durationPresetRow .preset-btn').forEach(btn=>btn.addEventListener('click', ()=>{
    el('duration_min').value = btn.dataset.duration;
    syncDurationPreset();
    updateHeaderSummary();
  }));

  el('btnApplyFilters').addEventListener('click', ()=>{
    updateHeaderSummary();
    closeFilterModal(false);
    loadMonth({ manual:true });
  });
  el('btnResetFilters').addEventListener('click', ()=>{
    state.year = todayObj.getFullYear();
    state.monthIdx = todayObj.getMonth();
    syncMonthYearOptions();
    el('duration_min').value = '30';
    el('tech_type').value = 'all';
    syncDurationPreset();
    updateHeaderSummary();
  });
  el('btnGoTodayFromFilter').addEventListener('click', ()=>{
    state.year = todayObj.getFullYear();
    state.monthIdx = todayObj.getMonth();
    syncMonthYearOptions();
    updateHeaderSummary();
  });

  el('prevMonth').addEventListener('click', ()=> shiftMonth(-1));
  el('nextMonth').addEventListener('click', ()=> shiftMonth(1));

  el('btnCloseModal').addEventListener('click', closeModal);
  el('dayModal').addEventListener('click', (e)=>{ if (e.target && e.target.id === 'dayModal') closeModal(); });
  document.querySelectorAll('#segAvail button').forEach(btn=>btn.addEventListener('click', ()=>{
    document.querySelectorAll('#segAvail button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    state.modal.mode = btn.dataset.mode;
    renderModal();
  }));
  document.querySelectorAll('#segType button').forEach(btn=>btn.addEventListener('click', ()=>{
    document.querySelectorAll('#segType button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    state.modal.type = btn.dataset.type;
    renderModal();
  }));
  el('modalTimeFilter').addEventListener('change', ()=>{
    state.modal.timeFilter = el('modalTimeFilter').value || '';
    syncTimeQuick();
    renderModal();
  });
  el('btnClearTimeFilter').addEventListener('click', ()=>{
    state.modal.timeFilter = '';
    el('modalTimeFilter').value = '';
    syncTimeQuick();
    renderModal();
  });
  document.querySelectorAll('#timeQuickRow .time-chip').forEach(btn=>btn.addEventListener('click', ()=>{
    el('modalTimeFilter').value = btn.dataset.time;
    state.modal.timeFilter = btn.dataset.time;
    syncTimeQuick();
    renderModal();
  }));
}

function shiftMonth(delta){
  const idx = getVisibleMonthKeyIndex();
  const target = state.availableMonths[idx + delta];
  if (!target) return;
  el('year').value = String(target.year);
  syncMonthYearOptions();
  el('month').value = String(target.monthIdx);
  updateHeaderSummary();
  loadMonth({ manual:true });
}

function goToToday(){
  state.year = todayObj.getFullYear();
  state.monthIdx = todayObj.getMonth();
  syncMonthYearOptions();
  updateHeaderSummary();
  loadMonth({ manual:true }).then(()=>{
    const cell = document.querySelector(`.day-cell[data-date="${state.today}"]`);
    if (cell){
      cell.scrollIntoView({ behavior:'smooth', block:'center' });
      cell.classList.add('selected');
      setTimeout(()=>cell.classList.remove('selected'), 1200);
    }
  }).catch(()=>{});
}

async function loadDayAvailability(date, tech_type){
  const duration_min = Math.max(15, Number(el('duration_min').value || state.durationMin || 30));
  const data = await apiFetch(`/public/availability_v2?date=${encodeURIComponent(date)}&tech_type=${encodeURIComponent(tech_type)}&duration_min=${encodeURIComponent(duration_min)}&forced=1`);
  return {
    hasAny: (data.slots || []).some(s=>s.available),
    ranges: rangeFromSlots(data.slots || []),
    rawSlots: data.slots || []
  };
}

function pickDayView(rec){
  const t = getTechTypeForQuery();
  if (t === 'company') return rec.company;
  if (t === 'partner') return rec.partner;
  return { hasAny: !!(rec.company?.hasAny || rec.partner?.hasAny), ranges: [...(rec.company?.ranges || []), ...(rec.partner?.ranges || [])] };
}

function limitedRangeText(ranges){ return (ranges || []).slice(0, 1).map(r=>`${r.start}–${r.end}`).join(', '); }

function computeVisibleSummary(visibleDates){
  let openDays = 0, fullDays = 0;
  visibleDates.forEach(date=>{
    const rec = state.monthData.get(date) || { company:{ hasAny:false, ranges:[] }, partner:{ hasAny:false, ranges:[] } };
    if (pickDayView(rec).hasAny) openDays += 1; else fullDays += 1;
  });
  return { days: visibleDates.length, openDays, fullDays };
}

async function loadMonth({ manual=false } = {}){
  updateHeaderSummary();
  const allDates = getWindowDates();
  el('monthGrid').innerHTML = '<div class="loading-box" style="grid-column:1 / -1">กำลังโหลดข้อมูลคิวช่าง...</div>';
  el('monthSub').textContent = `กำลังโหลดข้อมูลช่วง ${shortDate(ymd(windowStart))} - ${shortDate(ymd(windowEnd))}`;
  el('btnReload').disabled = true;
  try{
    const results = await pMap(allDates, 6, async (date)=>{
      const [company, partner] = await Promise.all([
        loadDayAvailability(date, 'company').catch(()=>({ hasAny:false, ranges:[] })),
        loadDayAvailability(date, 'partner').catch(()=>({ hasAny:false, ranges:[] }))
      ]);
      return { date, company, partner };
    });
    state.monthData = new Map(results.map(r=>[r.date, r]));
    renderMonth();
    if (manual) showToast('โหลดคิวช่างแล้ว', 'success');
  }catch(e){
    console.error(e);
    el('monthGrid').innerHTML = `<div class="empty-state" style="grid-column:1 / -1">โหลดปฏิทินไม่สำเร็จ<br>${escapeHtml(String(e.message || e))}</div>`;
    showToast(e.message || 'โหลดปฏิทินไม่สำเร็จ', 'error');
  }finally{
    el('btnReload').disabled = false;
  }
}

function renderMonth(){
  updateHeaderSummary();
  const visibleDates = getVisibleDates();
  const { days, openDays, fullDays } = computeVisibleSummary(visibleDates);
  el('statDaysInMonth').textContent = String(days);
  el('statOpenDays').textContent = String(openDays);
  el('statFullDays').textContent = String(fullDays);

  const todayRec = state.monthData.get(state.today);
  if (todayRec){
    const todayView = pickDayView(todayRec);
    el('statToday').textContent = todayView.hasAny ? 'ว่าง' : 'เต็ม';
    el('statTodaySub').textContent = todayView.hasAny ? (limitedRangeText(todayView.ranges) || 'มีช่างว่าง') : 'ไม่มีช่างว่างในวันนี้';
  } else {
    el('statToday').textContent = '-';
    el('statTodaySub').textContent = 'ไม่มีข้อมูลวันนี้';
  }

  const grid = el('monthGrid');
  if (!visibleDates.length){
    grid.innerHTML = '<div class="empty-state" style="grid-column:1 / -1">เดือนไม่อยู่ในช่วงที่อนุญาตให้แสดงผล</div>';
    return;
  }

  el('monthSub').textContent = `แสดงเฉพาะช่วง ${shortDate(ymd(windowStart))} - ${shortDate(ymd(windowEnd))} • ${techTypeLabel(getTechTypeForQuery())} • ระยะเวลางาน ${state.durationMin} นาที`;
  grid.innerHTML = '';

  visibleDates.forEach(date=>{
    const rec = state.monthData.get(date) || { company:{ hasAny:false, ranges:[] }, partner:{ hasAny:false, ranges:[] } };
    const view = pickDayView(rec);
    const isToday = date === state.today;
    const selected = state.selectedDate === date;

    const cell = document.createElement('div');
    cell.className = `day-cell ${view.hasAny ? 'free' : 'full'}${isToday ? ' today' : ''}${selected ? ' selected' : ''}`;
    cell.dataset.date = date;

    const scopeRows = getTechTypeForQuery() === 'all'
      ? `
          <div class="availability-row"><span class="name">บริษัท</span><span class="pill-state ${rec.company?.hasAny ? 'ok' : 'full'}">${statusText(rec.company)}</span></div>
          <div class="availability-row"><span class="name">พาร์ทเนอร์</span><span class="pill-state ${rec.partner?.hasAny ? 'ok' : 'full'}">${statusText(rec.partner)}</span></div>
        `
      : `
          <div class="availability-row"><span class="name">สถานะ</span><span class="pill-state ${view.hasAny ? 'ok' : 'full'}">${statusText(view)}</span></div>
        `;

    const preview = view.hasAny
      ? `<div class="slot-preview"><strong>ช่วงว่าง:</strong> ${escapeHtml(limitedRangeText(view.ranges) || 'มีช่วงว่าง')}</div>`
      : `<div class="slot-preview">แตะเพื่อดูงานในวันนี้ หรือค้นหาว่ามีงานชนช่วงเวลาไหน</div>`;

    cell.innerHTML = `
      <div class="day-head">
        <div class="day-date">
          <div class="day-number-row">
            <div class="day-number">${new Date(`${date}T00:00:00`).getDate()}</div>
            <div class="day-week">${escapeHtml(shortWeekday(date))}</div>
          </div>
          <div class="day-date-full">${escapeHtml(shortDate(date))}</div>
        </div>
        <div class="status-stack">
          ${isToday ? '<div class="status-chip today">📍 วันนี้</div>' : ''}
          <div class="status-chip main ${view.hasAny ? 'free' : 'full'}">${view.hasAny ? 'ว่าง' : 'เต็ม'}</div>
        </div>
      </div>
      <div class="day-body">
        <div class="availability-list">${scopeRows}</div>
        ${preview}
      </div>
    `;
    cell.addEventListener('click', ()=> openDayModal(date));
    grid.appendChild(cell);
  });
}

function openDayModal(date){
  state.selectedDate = date;
  const rec = state.monthData.get(date);
  const currentView = rec ? pickDayView(rec) : { hasAny:true };
  state.modal.date = date;
  state.modal.mode = currentView.hasAny ? 'free' : 'full';
  state.modal.type = getTechTypeForQuery() === 'all' ? 'all' : getTechTypeForQuery();
  state.modal.timeFilter = '';
  el('modalTimeFilter').value = '';
  syncTimeQuick();
  document.querySelectorAll('.day-cell').forEach(node=>node.classList.toggle('selected', node.dataset.date === date));
  document.querySelectorAll('#segAvail button').forEach(b=>b.classList.toggle('active', b.dataset.mode === state.modal.mode));
  document.querySelectorAll('#segType button').forEach(b=>b.classList.toggle('active', b.dataset.type === state.modal.type));
  el('modalTitle').textContent = `รายละเอียดวันที่ ${fullThaiDate(date)}`;
  el('modalSub').textContent = 'สลับดูช่างว่าง หรืองานที่ลงในวันนั้น พร้อมค้นหาตามเวลา';
  el('modalDuration').textContent = `${state.durationMin} นาที`;
  el('modalViewType').textContent = techTypeLabel(state.modal.type);
  el('modalList').innerHTML = '<div class="loading-box">กำลังโหลดรายละเอียด...</div>';
  el('dayModal').style.display = 'flex';
  renderModal();
}

function normalizeTechAvailabilityResponse(r){
  const rows = Array.isArray(r?.techs) ? r.techs : (Array.isArray(r?.technicians) ? r.technicians : []);
  if (rows.length && Array.isArray(rows[0]?.slots)) {
    return rows.map(row => ({ username: row.username, full_name: row.full_name || row.username, slots: Array.isArray(row.slots) ? row.slots : [] }));
  }
  const techs = Array.isArray(r?.technicians) ? r.technicians : [];
  const slotsByTech = r?.slots_by_tech || {};
  return techs.map(tech => ({ username: tech.username, full_name: tech.full_name || tech.username, slots: Array.isArray(slotsByTech[tech.username]) ? slotsByTech[tech.username] : [] }));
}

function filterRangesByTime(ranges, timeFilter){
  if (!timeFilter) return ranges || [];
  const t = timeToMin(timeFilter);
  return (ranges || []).filter(r=>{
    const s = timeToMin(r.start), e = timeToMin(r.end);
    return t != null && s != null && e != null && t >= s && t <= e;
  });
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

function jobMatchesTime(job, timeFilter){
  if (!timeFilter) return true;
  const t = timeToMin(timeFilter);
  if (t == null) return true;
  const start = new Date(job.start_iso);
  const end = new Date(job.end_iso);
  const s = start.getHours() * 60 + start.getMinutes();
  const e = end.getHours() * 60 + end.getMinutes();
  return t >= s && t <= e;
}

async function renderModal(){
  if (!state.modal.date) return;
  const list = el('modalList');
  const date = state.modal.date;
  const timeFilter = state.modal.timeFilter || '';
  list.innerHTML = '<div class="loading-box">กำลังโหลดรายละเอียด...</div>';
  el('modalViewType').textContent = techTypeLabel(state.modal.type);

  try{
    if (state.modal.mode === 'free'){
      const types = state.modal.type === 'all' ? ['company','partner'] : [state.modal.type];
      const bundles = await Promise.all(types.map(async (t)=>({
        type:t,
        r: await apiFetch(`/admin/availability_by_tech_v2?date=${encodeURIComponent(date)}&tech_type=${encodeURIComponent(t)}&duration_min=${encodeURIComponent(state.durationMin)}&forced=1`)
      })));
      const items = [];
      bundles.forEach(bundle=>{
        normalizeTechAvailabilityResponse(bundle.r).forEach(tech=>{
          const ranges = filterRangesByTime(rangeFromSlots(tech.slots || []), timeFilter);
          if (!ranges.length) return;
          items.push({ type: bundle.type, name: tech.full_name || tech.username, ranges });
        });
      });
      if (!items.length){
        list.innerHTML = `<div class="empty-state">${timeFilter ? `ไม่พบช่างว่างช่วงเวลา ${escapeHtml(timeFilter)}` : 'ไม่พบช่างว่างตามเงื่อนไขนี้'}</div>`;
        return;
      }
      list.innerHTML = '';
      items.sort((a,b)=>a.name.localeCompare(b.name, 'th'));
      items.forEach(it=>{
        const div = document.createElement('div');
        div.className = 'item';
        div.innerHTML = `
          <div class="item-row">
            <div class="item-title">${escapeHtml(it.name)}</div>
            <div class="type-badge ${it.type}">${it.type === 'company' ? 'บริษัท' : 'พาร์ทเนอร์'}</div>
          </div>
          <div class="item-meta">
            <span>🕒 ${escapeHtml(it.ranges.map(r=>`${r.start}–${r.end}`).join(', '))}</span>
            ${timeFilter ? `<span>🔎 เวลา ${escapeHtml(timeFilter)}</span>` : ''}
          </div>
          <div class="item-note">เหมาะสำหรับลงงานเพิ่มในวันที่ ${escapeHtml(fullThaiDate(date))}</div>
        `;
        list.appendChild(div);
      });
      return;
    }

    const types = state.modal.type === 'all' ? ['company','partner'] : [state.modal.type];
    const rows = [];
    for (const t of types){
      const r = await apiFetch(`/admin/schedule_v2?date=${encodeURIComponent(date)}&tech_type=${encodeURIComponent(t)}`);
      const techMap = new Map((r.technicians || []).map(x=>[x.username, x]));
      for (const [username, jobs] of Object.entries(r.jobs_by_tech || {})){
        (jobs || []).forEach(job=>{
          if (!jobMatchesTime(job, timeFilter)) return;
          rows.push({ type:t, tech: techMap.get(username), job });
        });
      }
    }
    if (!rows.length){
      list.innerHTML = `<div class="empty-state">${timeFilter ? `ไม่พบงานที่ทับช่วงเวลา ${escapeHtml(timeFilter)}` : 'ไม่พบงานในวันนั้นตามตัวกรองนี้'}</div>`;
      return;
    }
    rows.sort((a,b)=>String(a.job.start_iso || '').localeCompare(String(b.job.start_iso || '')));
    list.innerHTML = '';
    rows.forEach(x=>{
      const techName = x.tech?.full_name || x.tech?.username || x.job?.technician_username || '-';
      const start = new Date(x.job.start_iso);
      const end = new Date(x.job.end_iso);
      const timeLabel = `${pad2(start.getHours())}:${pad2(start.getMinutes())}–${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
      const div = document.createElement('div');
      div.className = 'item';
      if (x.job.job_id) div.style.cursor = 'pointer';
      div.innerHTML = `
        <div class="item-row">
          <div class="item-title">${escapeHtml(x.job.booking_code || ('#'+x.job.job_id))} • ${escapeHtml(x.job.job_type || 'งานบริการ')}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
            <div class="type-badge ${x.type}">${x.type === 'company' ? 'บริษัท' : 'พาร์ทเนอร์'}</div>
            <div class="job-status ${normalizeStatusClass(x.job.job_status)}">${escapeHtml(x.job.job_status || 'รอดำเนินการ')}</div>
          </div>
        </div>
        <div class="item-meta">
          <span>🕒 ${timeLabel}</span>
          <span>👷 ${escapeHtml(techName)}</span>
          ${timeFilter ? `<span>🔎 เวลา ${escapeHtml(timeFilter)}</span>` : ''}
        </div>
        <div class="item-note">${escapeHtml((x.job.job_zone || '—').trim())} • ${escapeHtml((x.job.address_text || '').trim() || '—')}</div>
      `;
      if (x.job.job_id) div.addEventListener('click', ()=> location.href = `/admin-job-view-v2.html?job_id=${encodeURIComponent(String(x.job.job_id))}`);
      list.appendChild(div);
    });
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
