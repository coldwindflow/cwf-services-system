/* Admin v2 - Premium Monthly Technician Queue
   Scope: UI-only calendar upgrade + compatibility guards.
   Uses existing availability/schedule endpoints; does not change booking/availability formulas.
*/

function pad2(x){ return String(x).padStart(2,'0'); }
function ymd(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function todayYMD(){ return ymd(new Date()); }
function monthLabel(year, monthIdx){
  return new Date(year, monthIdx, 1).toLocaleDateString('th-TH', { year:'numeric', month:'long' });
}
function setSelectOptions(sel, options, value){
  sel.innerHTML = options.map(o=>`<option value="${o.value}">${o.label}</option>`).join('');
  if (value != null) sel.value = String(value);
}
function limitTextRanges(ranges, max=2){
  const arr = (ranges||[]).slice(0, max).map(r=>`${r.start}–${r.end}`);
  if ((ranges||[]).length > max) arr.push(`+${(ranges||[]).length - max}`);
  return arr.join(', ');
}
function rangeFromSlots(slots){
  const ranges = [];
  let cur = null;
  for (const s of (slots||[])){
    if (!s.available) {
      if (cur){ ranges.push(cur); cur=null; }
      continue;
    }
    if (!cur) cur = { start: s.start, end: s.end };
    else cur.end = s.end;
  }
  if (cur) ranges.push(cur);
  return ranges;
}
function getTechRows(payload){
  return payload?.technicians || payload?.techs || [];
}
function getSlotsByTech(payload){
  if (payload?.slots_by_tech) return payload.slots_by_tech;
  const out = {};
  for (const tech of getTechRows(payload)) out[tech.username] = tech.slots || [];
  return out;
}
async function pMap(list, limit, mapper){
  const out = new Array(list.length);
  let i=0;
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
  modal: { date: null, mode: 'free', type: 'all' }
};

function getTechTypeForQuery(){ return el('tech_type').value || 'all'; }

function initPickers(){
  const now = new Date();
  state.year = now.getFullYear();
  state.monthIdx = now.getMonth();
  const monthOpts = Array.from({length:12}).map((_,i)=>({
    value:String(i),
    label: new Date(2000,i,1).toLocaleDateString('th-TH',{month:'long'})
  }));
  setSelectOptions(el('month'), monthOpts, String(state.monthIdx));
  const y = now.getFullYear();
  const years = [];
  for (let yy=y-2; yy<=y+3; yy++) years.push({ value:String(yy), label:String(yy) });
  setSelectOptions(el('year'), years, String(state.year));
}

function bindUI(){
  const btnToggle = el('btnToggleFilters');
  const filterCard = el('filterCard');
  if (btnToggle && filterCard) {
    btnToggle.addEventListener('click', ()=>{
      const show = filterCard.style.display !== 'none';
      filterCard.style.display = show ? 'none' : 'block';
    });
  }

  el('btnLoad')?.addEventListener('click', ()=> loadMonth());
  el('btnReload')?.addEventListener('click', ()=> loadMonth());
  el('prevMonth')?.addEventListener('click', ()=> shiftMonth(-1));
  el('nextMonth')?.addEventListener('click', ()=> shiftMonth(1));
  el('btnToday')?.addEventListener('click', ()=>{
    const now = new Date();
    state.year = now.getFullYear();
    state.monthIdx = now.getMonth();
    el('year').value = String(state.year);
    el('month').value = String(state.monthIdx);
    loadMonth().then(()=> openModal(todayYMD()));
  });

  el('month').addEventListener('change', ()=>{ state.monthIdx = Number(el('month').value||0); loadMonth(); });
  el('year').addEventListener('change', ()=>{ state.year = Number(el('year').value||new Date().getFullYear()); loadMonth(); });
  el('duration_min').addEventListener('change', ()=>{
    state.durationMin = Math.max(15, Number(el('duration_min').value||30));
    loadMonth();
  });
  el('tech_type').addEventListener('change', ()=>{ state.techType = getTechTypeForQuery(); renderMonth(); });

  el('btnCloseModal').addEventListener('click', closeModal);
  el('dayModal').addEventListener('click', (e)=>{ if (e.target && e.target.id==='dayModal') closeModal(); });

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

function shiftMonth(delta){
  const d = new Date(state.year, state.monthIdx, 1);
  d.setMonth(d.getMonth()+delta);
  state.year = d.getFullYear();
  state.monthIdx = d.getMonth();
  el('year').value = String(state.year);
  el('month').value = String(state.monthIdx);
  loadMonth();
}

async function loadDayAvailability(date, tech_type){
  const duration_min = Math.max(15, Number(el('duration_min').value||30));
  const data = await apiFetch(`/public/availability_v2?date=${encodeURIComponent(date)}&tech_type=${encodeURIComponent(tech_type)}&duration_min=${encodeURIComponent(duration_min)}&forced=1`);
  const slots = data.slots || [];
  const ranges = rangeFromSlots(slots);
  const hasAny = slots.some(s=>s.available);
  const availableSlotCount = slots.filter(s=>s.available).length;
  const techSet = new Set();
  for (const s of slots) {
    for (const u of (s.available_tech_ids || s.available_technicians || [])) techSet.add(u);
  }
  return {
    hasAny, ranges, availableSlotCount, freeTechCount: techSet.size,
    slot_step_min: data.slot_step_min, travel_buffer_min: data.travel_buffer_min
  };
}

async function loadMonth(){
  const year = Number(el('year').value||new Date().getFullYear());
  const monthIdx = Number(el('month').value||0);
  state.year = year;
  state.monthIdx = monthIdx;
  state.durationMin = Math.max(15, Number(el('duration_min').value||30));
  state.techType = getTechTypeForQuery();

  const days = new Date(year, monthIdx+1, 0).getDate();
  const dates = [];
  for (let d=1; d<=days; d++) dates.push(ymd(new Date(year, monthIdx, d)));

  const loadBtns = [el('btnLoad'), el('btnReload')].filter(Boolean);
  loadBtns.forEach(b=>{ b.disabled = true; b.textContent = 'กำลังโหลด...'; });
  try{
    const results = await pMap(dates, 5, async (date)=>{
      const [company, partner] = await Promise.all([
        loadDayAvailability(date, 'company').catch(()=>({hasAny:false,ranges:[],availableSlotCount:0,freeTechCount:0,error:true})),
        loadDayAvailability(date, 'partner').catch(()=>({hasAny:false,ranges:[],availableSlotCount:0,freeTechCount:0,error:true})),
      ]);
      return { date, company, partner };
    });
    state.monthData = new Map();
    for (const r of results) state.monthData.set(r.date, r);
    renderMonth();
    showToast('โหลดคิวช่างรายเดือนแล้ว', 'success');
  }catch(e){
    console.error(e);
    showToast(e.message || 'โหลดปฏิทินไม่สำเร็จ', 'error');
  }finally{
    loadBtns.forEach(b=>{ b.disabled = false; b.textContent = b.id === 'btnLoad' ? 'รีเฟรชปฏิทิน' : 'รีเฟรช'; });
  }
}

function pickDayView(r){
  const t = getTechTypeForQuery();
  if (t === 'company') return r.company || {hasAny:false,ranges:[]};
  if (t === 'partner') return r.partner || {hasAny:false,ranges:[]};
  const hasAny = !!(r.company?.hasAny || r.partner?.hasAny);
  const ranges = [...(r.company?.ranges||[]), ...(r.partner?.ranges||[])];
  const availableSlotCount = Number(r.company?.availableSlotCount||0) + Number(r.partner?.availableSlotCount||0);
  const freeTechCount = Number(r.company?.freeTechCount||0) + Number(r.partner?.freeTechCount||0);
  return { hasAny, ranges, availableSlotCount, freeTechCount };
}

function updateStats(){
  let freeDays = 0, fullDays = 0;
  for (const r of state.monthData.values()){
    const v = pickDayView(r);
    if (v.hasAny) freeDays++; else fullDays++;
  }
  el('quickStats').style.display = 'grid';
  el('statFreeDays').textContent = String(freeDays);
  el('statFullDays').textContent = String(fullDays);
  el('statMonth').textContent = new Date(state.year, state.monthIdx, 1).toLocaleDateString('th-TH', { month:'short' });
}

function renderMonth(){
  el('monthCalendar').style.display = 'block';
  el('monthTitle').textContent = monthLabel(state.year, state.monthIdx);
  const tLabel = ({all:'รวมทั้งหมด', company:'ช่างบริษัท', partner:'พาร์ทเนอร์'})[getTechTypeForQuery()] || 'รวมทั้งหมด';
  el('monthSub').textContent = `${tLabel} • ระยะเวลางาน ${state.durationMin} นาที • รวม travel buffer เดิม`;
  updateStats();

  const grid = el('monthGrid');
  const headers = Array.from(grid.querySelectorAll('.dow'));
  grid.innerHTML = '';
  for (const h of headers) grid.appendChild(h);

  const first = new Date(state.year, state.monthIdx, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(state.year, state.monthIdx+1, 0).getDate();
  const current = todayYMD();

  const prevLast = new Date(state.year, state.monthIdx, 0).getDate();
  for (let i=0; i<startDow; i++){
    const dayNum = prevLast - (startDow-1-i);
    const cell = document.createElement('div');
    cell.className = 'day muted neutral';
    cell.innerHTML = `<div class="d">${dayNum}</div>`;
    grid.appendChild(cell);
  }

  for (let d=1; d<=daysInMonth; d++){
    const date = ymd(new Date(state.year, state.monthIdx, d));
    const r = state.monthData.get(date);
    const view = r ? pickDayView(r) : {hasAny:false,ranges:[],availableSlotCount:0,freeTechCount:0};
    const isFree = !!view.hasAny;
    const cls = `day ${isFree ? 'free' : 'full'} ${date === current ? 'today' : ''}`;
    const rangesTxt = isFree ? limitTextRanges(view.ranges, 2) : '';
    const badge = isFree ? `<span class="badge free">ว่าง</span>` : `<span class="badge full">เต็ม</span>`;
    const slot = isFree ? `<div class="slots" title="${(view.ranges||[]).map(r=>`${r.start}–${r.end}`).join(', ')}">${rangesTxt || 'มีช่วงว่าง'}</div>` : `<div class="slots">ไม่มีช่วงว่างตามเงื่อนไข</div>`;
    const freeTech = Number(view.freeTechCount||0);
    const freeSlot = Number(view.availableSlotCount||0);

    const cell = document.createElement('div');
    cell.className = cls;
    cell.dataset.date = date;
    cell.innerHTML = `
      <div class="day-top"><div class="d">${d}</div>${badge}</div>
      ${slot}
      <div class="day-meta">
        <span class="mini-chip">ช่างว่าง ${freeTech || '-'}</span>
        <span class="mini-chip">สล็อต ${freeSlot || '-'}</span>
      </div>
    `;
    cell.addEventListener('click', ()=> openModal(date));
    grid.appendChild(cell);
  }

  const totalCells = startDow + daysInMonth;
  const remain = (7 - (totalCells % 7)) % 7;
  for (let i=1; i<=remain; i++){
    const cell = document.createElement('div');
    cell.className = 'day muted neutral';
    cell.innerHTML = `<div class="d">${i}</div>`;
    grid.appendChild(cell);
  }
}

function closeModal(){ el('dayModal').style.display = 'none'; }

async function openModal(date){
  state.modal.date = date;
  state.modal.mode = 'free';
  state.modal.type = getTechTypeForQuery() === 'all' ? 'all' : getTechTypeForQuery();
  document.querySelectorAll('#segAvail button').forEach(b=>b.classList.toggle('active', b.dataset.mode==='free'));
  document.querySelectorAll('#segType button').forEach(b=>b.classList.toggle('active', b.dataset.type===state.modal.type));

  el('modalTitle').textContent = `รายละเอียดวันที่ ${new Date(date+'T00:00:00').toLocaleDateString('th-TH',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}`;
  el('modalSub').textContent = `ระยะเวลางาน ${state.durationMin} นาที • รวม buffer เดิม • แตะรายการงานเพื่อเปิดใบงาน`;
  el('modalList').innerHTML = '<div class="muted">กำลังโหลด...</div>';
  el('dayModal').style.display = 'flex';
  await renderModal();
}

function statusInfo(status){
  const s = String(status || '').trim();
  if (!s) return { label:'ยังไม่ระบุ', cls:'status-wait' };
  if (/เสร็จ|completed|done/i.test(s)) return { label:s, cls:'status-done' };
  if (/ยกเลิก|cancel/i.test(s)) return { label:s, cls:'status-risk' };
  if (/รอ|pending|รับงาน/i.test(s)) return { label:s, cls:'status-wait' };
  return { label:s, cls:'status-active' };
}

async function renderModal(){
  const date = state.modal.date;
  if (!date) return;
  const list = el('modalList');
  list.innerHTML = '<div class="muted">กำลังโหลด...</div>';

  try{
    if (state.modal.mode === 'free'){
      const items = [];
      const types = (state.modal.type === 'all') ? ['company','partner'] : [state.modal.type];
      const duration_min = state.durationMin;
      const byType = await Promise.all(types.map(async (t)=>{
        const r = await apiFetch(`/admin/availability_by_tech_v2?date=${encodeURIComponent(date)}&tech_type=${encodeURIComponent(t)}&duration_min=${encodeURIComponent(duration_min)}&forced=1`);
        return { t, r };
      }));

      for (const bt of byType){
        const techs = getTechRows(bt.r);
        const slotsByTech = getSlotsByTech(bt.r);
        for (const tech of techs){
          const slots = slotsByTech[tech.username] || tech.slots || [];
          const free = slots.filter(s=>s.available);
          if (!free.length) continue;
          const ranges = rangeFromSlots(slots);
          items.push({ type: bt.t, username: tech.username, name: tech.full_name || tech.username, ranges, freeCount: free.length });
        }
      }

      if (!items.length){
        list.innerHTML = `<div class="item"><b>ไม่พบช่างว่าง</b><div class="mini">ลองเปลี่ยนระยะเวลางาน หรือดูช่างอีกประเภท</div></div>`;
        return;
      }

      list.innerHTML = '';
      for (const it of items.sort((a,b)=>a.name.localeCompare(b.name,'th'))){
        const div = document.createElement('div');
        div.className = 'item';
        const tag = (it.type==='company')
          ? `<span class="badge busy">บริษัท</span>`
          : `<span class="badge" style="background:#fde68a;color:#0f172a;">พาร์ทเนอร์</span>`;
        const rangesTxt = (it.ranges||[]).map(r=>`${r.start}–${r.end}`).join(', ');
        div.innerHTML = `
          <div class="item-line">
            <b title="${it.name}">👷 ${it.name}</b>
            ${tag}
          </div>
          <div class="meta">
            <span>✅ ว่าง ${it.freeCount} สล็อต</span>
            <span>⏱️ งาน ${duration_min} นาที + buffer</span>
          </div>
          <div class="mini" title="${rangesTxt}">ช่วงว่าง: <b>${rangesTxt}</b></div>
        `;
        list.appendChild(div);
      }
      return;
    }

    const types = (state.modal.type === 'all') ? ['company','partner'] : [state.modal.type];
    const all = [];
    for (const t of types){
      const r = await apiFetch(`/admin/schedule_v2?date=${encodeURIComponent(date)}&tech_type=${encodeURIComponent(t)}`);
      const techMap = new Map(getTechRows(r).map(x=>[x.username, x]));
      for (const [u, jobs] of Object.entries(r.jobs_by_tech || {})){
        for (const j of (jobs||[])) all.push({ type: t, tech: techMap.get(u), job: j });
      }
    }
    if (!all.length){
      list.innerHTML = `<div class="item"><b>ไม่พบงานในวันนี้</b><div class="mini">สำหรับตัวกรองนี้ยังไม่มีงานที่ถูกลงให้ช่าง</div></div>`;
      return;
    }
    all.sort((a,b)=> (a.job.start_iso||'').localeCompare(b.job.start_iso||''));
    list.innerHTML = '';
    for (const x of all){
      const techName = x.tech?.full_name || x.tech?.username || x.job?.technician_username || '-';
      const start = new Date(x.job.start_iso);
      const end = new Date(x.job.end_iso);
      const time = `${pad2(start.getHours())}:${pad2(start.getMinutes())}–${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
      const tag = (x.type==='company') ? `<span class="badge busy">บริษัท</span>` : `<span class="badge" style="background:#fde68a;color:#0f172a;">พาร์ทเนอร์</span>`;
      const st = statusInfo(x.job.job_status);
      const div = document.createElement('div');
      div.className = 'item';
      div.style.cursor = x.job.job_id ? 'pointer' : 'default';
      div.title = `${x.job.booking_code || ''}\n${x.job.job_type || ''}\n${time}\n${x.job.job_zone || ''} ${(x.job.address_text||'')}`;
      div.innerHTML = `
        <div class="item-line">
          <b>${x.job.booking_code || ('#'+x.job.job_id)} • ${x.job.customer_name || x.job.job_type || ''}</b>
          ${tag}
        </div>
        <div class="meta">
          <span><b>🕘 ${time}</b></span>
          <span>👷 ${techName}</span>
          <span>🧾 ${x.job.job_type || '-'}</span>
          <span class="status-pill ${st.cls}">${st.label}</span>
        </div>
        <div class="mini" title="${(x.job.job_zone||'').trim()} ${(x.job.address_text||'').trim()}">${(x.job.job_zone||'—').trim()} • ${(x.job.address_text||'').trim() || '—'}</div>
      `;
      if (x.job.job_id){
        div.addEventListener('click', ()=>{ location.href = `/admin-job-view-v2.html?job_id=${encodeURIComponent(String(x.job.job_id))}`; });
      }
      list.appendChild(div);
    }
  }catch(e){
    console.error(e);
    list.innerHTML = `<div class="item"><b>โหลดรายละเอียดไม่สำเร็จ</b><div class="mini">${String(e.message||e)}</div></div>`;
  }
}

function init(){
  initPickers();
  bindUI();
  loadMonth();
}
init();
