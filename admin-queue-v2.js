/* Admin v2 - Monthly Calendar Queue
   - Shows monthly view with day status:
     * full  => red bg + white text + 'เต็มแล้ว'
     * free  => green bg + white text + show free time ranges
   - Availability uses existing v2 logic (/public/availability_v2)
   - Day details:
     * free => list technicians + their free ranges (via /admin/availability_by_tech_v2)
     * full => list busy jobs summary (via /admin/schedule_v2)
   Safe: does not change availability logic (duration/buffer stays server-side).
*/

function pad2(x){ return String(x).padStart(2,'0'); }

function ymd(d){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

function monthLabel(year, monthIdx){
  const d = new Date(year, monthIdx, 1);
  return d.toLocaleDateString('th-TH', { year:'numeric', month:'long' });
}

function rangeFromSlots(slots){
  // slots: [{start,end,available,available_tech_ids}]
  // merge consecutive available into ranges
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

function setSelectOptions(sel, options, value){
  sel.innerHTML = options.map(o=>`<option value="${o.value}">${o.label}</option>`).join('');
  if (value != null) sel.value = String(value);
}

function limitTextRanges(ranges, max=2){
  const arr = (ranges||[]).slice(0, max).map(r=>`${r.start}–${r.end}`);
  return arr.join(', ');
}

// Concurrency-limited mapper
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
  durationMin: 60,
  techType: 'all',
  monthData: new Map(), // ymd -> { company:{freeRanges, hasAny}, partner:{...} }
  modal: {
    date: null,
    mode: 'free',
    type: 'all',
  }
};

function getTechTypeForQuery(){
  const t = el('tech_type').value;
  return t;
}

function initPickers(){
  const now = new Date();
  state.year = now.getFullYear();
  state.monthIdx = now.getMonth();

  const monthOpts = Array.from({length:12}).map((_,i)=>({ value:String(i), label: new Date(2000,i,1).toLocaleDateString('th-TH',{month:'long'}) }));
  setSelectOptions(el('month'), monthOpts, String(state.monthIdx));

  const y = now.getFullYear();
  const years = [];
  for (let yy=y-2; yy<=y+3; yy++) years.push({ value:String(yy), label:String(yy) });
  setSelectOptions(el('year'), years, String(state.year));
}

function bindUI(){
  // filter card toggle (same as history UX)
  const btnToggle = document.getElementById('btnToggleFilters');
  const filterCard = document.getElementById('filterCard');
  if (btnToggle && filterCard) {
    btnToggle.addEventListener('click', ()=>{
      const show = filterCard.style.display !== 'none';
      filterCard.style.display = show ? 'none' : 'block';
    });
  }

  el('btnLoad').addEventListener('click', ()=> loadMonth());
  el('btnReload').addEventListener('click', ()=> loadMonth());
  el('prevMonth').addEventListener('click', ()=> shiftMonth(-1));
  el('nextMonth').addEventListener('click', ()=> shiftMonth(1));
  el('month').addEventListener('change', ()=>{ state.monthIdx = Number(el('month').value||0); loadMonth(); });
  el('year').addEventListener('change', ()=>{ state.year = Number(el('year').value||new Date().getFullYear()); loadMonth(); });
  el('duration_min').addEventListener('change', ()=>{ state.durationMin = Math.max(15, Number(el('duration_min').value||60)); });

  // modal
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
  // tech_type: company|partner
  const duration_min = Math.max(15, Number(el('duration_min').value||60));
  // Admin calendar ต้องเห็นช่างที่ "ปิดรับงาน" ด้วย หากไม่มีงานจริง (forced=1)
  const data = await apiFetch(`/public/availability_v2?date=${encodeURIComponent(date)}&tech_type=${encodeURIComponent(tech_type)}&duration_min=${encodeURIComponent(duration_min)}&forced=1`);
  const ranges = rangeFromSlots(data.slots || []);
  const hasAny = (data.slots || []).some(s=>s.available);
  return { hasAny, ranges, slot_step_min: data.slot_step_min, travel_buffer_min: data.travel_buffer_min };
}

async function loadMonth(){
  const year = Number(el('year').value||new Date().getFullYear());
  const monthIdx = Number(el('month').value||0);
  state.year = year;
  state.monthIdx = monthIdx;
  state.durationMin = Math.max(15, Number(el('duration_min').value||60));
  state.techType = getTechTypeForQuery();

  const first = new Date(year, monthIdx, 1);
  const last = new Date(year, monthIdx+1, 0);
  const days = last.getDate();
  const dates = [];
  for (let d=1; d<=days; d++) dates.push(ymd(new Date(year, monthIdx, d)));

  el('btnLoad').disabled = true;
  el('btnReload').disabled = true;
  try{
    // fetch availability for each day for both tech types (company/partner)
    const results = await pMap(dates, 6, async (date)=>{
      const [company, partner] = await Promise.all([
        loadDayAvailability(date, 'company').catch(()=>({hasAny:false,ranges:[]})),
        loadDayAvailability(date, 'partner').catch(()=>({hasAny:false,ranges:[]})),
      ]);
      return { date, company, partner };
    });
    state.monthData = new Map();
    for (const r of results) state.monthData.set(r.date, r);

    renderMonth();
    showToast('โหลดปฏิทินรายเดือนแล้ว', 'success');
  }catch(e){
    console.error(e);
    showToast(e.message || 'โหลดปฏิทินไม่สำเร็จ', 'error');
  }finally{
    el('btnLoad').disabled = false;
    el('btnReload').disabled = false;
  }
}

function pickDayView(r){
  // based on selected filter
  const t = getTechTypeForQuery();
  if (t === 'company') return r.company;
  if (t === 'partner') return r.partner;
  // all
  const hasAny = !!(r.company?.hasAny || r.partner?.hasAny);
  // merge ranges text (best-effort): show top from company then partner
  const ranges = [...(r.company?.ranges||[]), ...(r.partner?.ranges||[])];
  return { hasAny, ranges };
}

function renderMonth(){
  el('monthCalendar').style.display = 'block';
  el('monthTitle').textContent = monthLabel(state.year, state.monthIdx);
  el('monthSub').textContent = `ระยะเวลางาน ${state.durationMin} นาที • แยกบริษัท/พาร์ทเนอร์ • ใช้ buffer เดิม`;

  const grid = el('monthGrid');
  // keep first 7 dow headers
  const headers = Array.from(grid.querySelectorAll('.dow'));
  grid.innerHTML = '';
  for (const h of headers) grid.appendChild(h);

  const first = new Date(state.year, state.monthIdx, 1);
  const startDow = first.getDay(); // 0=Sun
  const daysInMonth = new Date(state.year, state.monthIdx+1, 0).getDate();

  // prev month trailing
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
    const view = r ? pickDayView(r) : {hasAny:false,ranges:[]};
    const isFree = !!view.hasAny;
    const cls = isFree ? 'day free' : 'day full';

    const rangesTxt = isFree ? limitTextRanges(view.ranges, 2) : '';
    const badge = isFree ? `<span class="badge free" title="มีช่างว่าง">ว่าง</span>` : `<span class="badge full">เต็มแล้ว</span>`;
    const slot = isFree ? `<div class="slots" title="${(view.ranges||[]).map(r=>`${r.start}–${r.end}`).join(', ')}">${rangesTxt || 'มีช่วงว่าง'}</div>` : '';

    const cell = document.createElement('div');
    cell.className = cls;
    cell.dataset.date = date;
    cell.innerHTML = `<div class="row" style="justify-content:space-between;align-items:center"><div class="d">${d}</div>${badge}</div>${slot}`;
    cell.addEventListener('click', ()=> openModal(date));
    grid.appendChild(cell);
  }

  // next month leading to fill rows
  const totalCells = startDow + daysInMonth;
  const remain = (7 - (totalCells % 7)) % 7;
  for (let i=1; i<=remain; i++){
    const cell = document.createElement('div');
    cell.className = 'day muted neutral';
    cell.innerHTML = `<div class="d">${i}</div>`;
    grid.appendChild(cell);
  }
}

function closeModal(){
  el('dayModal').style.display = 'none';
}

async function openModal(date){
  state.modal.date = date;
  state.modal.mode = 'free';
  state.modal.type = 'all';
  document.querySelectorAll('#segAvail button').forEach(b=>b.classList.toggle('active', b.dataset.mode==='free'));
  document.querySelectorAll('#segType button').forEach(b=>b.classList.toggle('active', b.dataset.type==='all'));

  el('modalTitle').textContent = `รายละเอียดวันที่ ${new Date(date+'T00:00:00').toLocaleDateString('th-TH',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}`;
  el('modalSub').textContent = `ระยะเวลางาน ${state.durationMin} นาที (รวม buffer เดิม)`;
  el('modalList').innerHTML = '<div class="muted">กำลังโหลด...</div>';
  el('dayModal').style.display = 'flex';

  await renderModal();
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
      // fetch per-tech availability per type
      const duration_min = state.durationMin;
      const byType = await Promise.all(types.map(async (t)=>{
        // forced=1 => รวมช่างที่ปิดรับงาน แต่ยังว่างจริง เพื่อให้แอดมินเห็นสภาพรวม
        const r = await apiFetch(`/admin/availability_by_tech_v2?date=${encodeURIComponent(date)}&tech_type=${encodeURIComponent(t)}&duration_min=${encodeURIComponent(duration_min)}&forced=1`);
        return { t, r };
      }));

      for (const bt of byType){
        const techs = bt.r.technicians || [];
        const slotsByTech = bt.r.slots_by_tech || {};
        for (const tech of techs){
          const slots = slotsByTech[tech.username] || [];
          const free = slots.filter(s=>s.available);
          if (!free.length) continue;
          const ranges = rangeFromSlots(slots);
          items.push({
            type: bt.t,
            username: tech.username,
            name: tech.full_name || tech.username,
            ranges,
          });
        }
      }

      if (!items.length){
        list.innerHTML = `<div class="muted">ไม่พบช่างว่างในเงื่อนไขนี้</div>`;
        return;
      }

      list.innerHTML = '';
      for (const it of items.sort((a,b)=>a.name.localeCompare(b.name,'th'))){
        const div = document.createElement('div');
        div.className = 'item';
        const tag = (it.type==='company')
          ? `<span class="badge" style="background:#2563eb;color:#fff;">บริษัท</span>`
          : `<span class="badge" style="background:#fde68a;color:#0f172a;">พาร์ทเนอร์</span>`;
        const rangesTxt = (it.ranges||[]).map(r=>`${r.start}–${r.end}`).join(', ');
        div.innerHTML = `
          <div class="row" style="justify-content:space-between;align-items:center">
            <b title="${it.name}">${it.name}</b>
            ${tag}
          </div>
          <div class="mini" title="${rangesTxt}">ว่าง: <b>${rangesTxt}</b></div>
        `;
        list.appendChild(div);
      }
      return;
    }

    // full mode: show job blocks from real jobs in that day
    const types = (state.modal.type === 'all') ? ['company','partner'] : [state.modal.type];
    const all = [];
    for (const t of types){
      const r = await apiFetch(`/admin/schedule_v2?date=${encodeURIComponent(date)}&tech_type=${encodeURIComponent(t)}`);
      const techMap = new Map((r.technicians||[]).map(x=>[x.username, x]));
      for (const [u, jobs] of Object.entries(r.jobs_by_tech || {})){
        for (const j of (jobs||[])){
          all.push({
            type: t,
            tech: techMap.get(u),
            job: j,
          });
        }
      }
    }
    if (!all.length){
      list.innerHTML = `<div class="muted">ไม่พบงานในวันนี้ (สำหรับตัวกรองนี้)</div>`;
      return;
    }
    all.sort((a,b)=> (a.job.start_iso||'').localeCompare(b.job.start_iso||''));
    list.innerHTML = '';
    for (const x of all){
      const techName = x.tech?.full_name || x.tech?.username || x.job?.technician_username || '-';
      const start = new Date(x.job.start_iso);
      const end = new Date(x.job.end_iso);
      const time = `${pad2(start.getHours())}:${pad2(start.getMinutes())}–${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
      const tag = (x.type==='company')
        ? `<span class="badge" style="background:#2563eb;color:#fff;">บริษัท</span>`
        : `<span class="badge" style="background:#fde68a;color:#0f172a;">พาร์ทเนอร์</span>`;
      const div = document.createElement('div');
      div.className = 'item';
      div.style.cursor = x.job.job_id ? 'pointer' : 'default';
      div.title = `${x.job.booking_code || ''}\n${x.job.job_type || ''}\n${time}\n${x.job.job_zone || ''} ${(x.job.address_text||'')}`;
      div.innerHTML = `
        <div class="row" style="justify-content:space-between;align-items:center">
          <b>${x.job.booking_code || ('#'+x.job.job_id)} • ${x.job.job_type || ''}</b>
          ${tag}
        </div>
        <div class="meta">
          <span><b>${time}</b></span>
          <span>👷 ${techName}</span>
        </div>
        <div class="mini" title="${(x.job.job_zone||'').trim()} ${(x.job.address_text||'').trim()}">${(x.job.job_zone||'—').trim()} • ${(x.job.address_text||'').trim() || '—'}</div>
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
    list.innerHTML = `<div class="muted">โหลดรายละเอียดไม่สำเร็จ: ${String(e.message||e)}</div>`;
  }
}

function init(){
  initPickers();
  bindUI();
  // auto load current month
  loadMonth();
}

init();
