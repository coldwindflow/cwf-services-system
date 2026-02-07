/* Admin v2 - Add Job (Flow เหมือนลูกค้า + extras + promo + override)
   - auto compute price/time (no button)
   - load availability_v2 after required fields are filled
   - book via /admin/book_v2
*/

// BTU preset for dropdown
const BTU_OPTIONS = [9000, 12000, 18000, 24000, 30000, 36000, 38000, 40000, 48000, 60000];

let state = {
  standard_price: 0,
  duration_min: 0,
  effective_block_min: 0,
  travel_buffer_min: 30,
  promo: null,
  promo_list: [],
  catalog: [],
  selected_items: [], // {item_id, qty, item_name, base_price}
  service_lines: [], // [{job_type, ac_type, btu, machine_count, wash_variant}]
  selected_slot_iso: "",
  available_slots: [],
};


// --- PATCH: technician dropdown + team multi-select (backward compatible) ---
state.techs = []; // [{username, employment_type, work_start, work_end}]
function getSelectedMulti(id){
  const sel = document.getElementById(id);
  if(!sel) return [];
  return Array.from(sel.options).filter(o=>o.selected).map(o=>o.value).filter(Boolean);
}

async function loadTechsForType(){
  try{
    const data = await apiFetch("/admin/technicians");
    const rows = Array.isArray(data) ? data : (data.rows||data.technicians||[]);
    const ttype = (el("tech_type")?.value || "company").toLowerCase();
    state.techs = rows.filter(r => ((r.employment_type||"company").toLowerCase()===ttype)).map(r=>({
      username: r.username,
      employment_type: (r.employment_type||"company"),
      work_start: r.work_start||"09:00",
      work_end: r.work_end||"18:00",
    }));
    renderTechSelect(); 
    renderTeamPicker();
  }catch(e){
    console.warn("[admin-add-v2] loadTechsForType failed", e);
    state.techs = [];
    renderTechSelect();
    renderTeamPicker();
  }
}

function renderTechSelect(allowedIds=null){
  const sel = document.getElementById("technician_username_select");
  if(!sel) return;
  const current = sel.value || "";
  sel.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "ไม่เลือก (ระบบเลือกช่างว่าง)";
  sel.appendChild(opt0);
  const list = (allowedIds && allowedIds.length) ? state.techs.filter(t=>allowedIds.includes(t.username)) : state.techs;
  for(const t of list){
    const o = document.createElement("option");
    o.value = t.username;
    o.textContent = t.username;
    sel.appendChild(o);
  }
  // restore if possible
  sel.value = list.some(t=>t.username===current) ? current : "";
  // sync hidden input for backend compatibility
  if(el("technician_username")) el("technician_username").value = sel.value || "";
}


// --- Premium Team Picker (chips + search + primary badge) ---
function escapeHtml(s){
  return String(s||'').replace(/[&<>'"]/g, (c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));
}

state.teamPicker = {
  q: "",
  selected: new Set(),   // includes primary too for display
  primary: "",
};

function updateParallelUIVisibility(){
  const wrap = el('parallel_wrap');
  if(!wrap) return;
  const team = getTeamListForAssign();
  const show = team.length >= 2;
  wrap.style.display = show ? 'block' : 'none';
  if(!show){
    const cb = el('parallel_by_tech');
    if(cb) cb.checked = false;
  }
}

function syncPrimaryFromSelect(){
  const u = (el("technician_username_select")?.value || "").trim();
  state.teamPicker.primary = u;
  if (u) state.teamPicker.selected.add(u);
  renderTeamPicker();
}

function setPrimary(username){
  const u = String(username||"").trim();
  if(!u) return;
  state.teamPicker.primary = u;
  state.teamPicker.selected.add(u);
  // push to select (backward compatible)
  const sel = el("technician_username_select");
  if(sel){
    sel.value = u;
    if(el("technician_username")) el("technician_username").value = u;
  }
  renderTeamPicker();
}

function addTeamMember(username){
  const u = String(username||"").trim();
  if(!u) return;
  state.teamPicker.selected.add(u);
  // if no primary selected, set this one as primary for safety
  if(!state.teamPicker.primary){
    setPrimary(u);
    return;
  }
  renderTeamPicker();
}

function removeTeamMember(username){
  const u = String(username||"").trim();
  if(!u) return;
  // never remove primary (force user to change primary first)
  if(u === state.teamPicker.primary) return;
  state.teamPicker.selected.delete(u);
  renderTeamPicker();
}

function getTeamMembersForPayload(){
  // return assistants only (exclude primary)
  const primary = state.teamPicker.primary;
  const arr = Array.from(state.teamPicker.selected).filter(u=>u && u!==primary);
  // sync hidden csv (optional)
  const csvEl = el("team_members_csv");
  if(csvEl) csvEl.value = arr.join(",");
  return arr;
}

function renderTeamPicker(allowedIds=null){
  const suggestBox = document.getElementById("team_suggest");
  const selectedBox = document.getElementById("team_selected");
  const searchEl = document.getElementById("team_search");
  if(!suggestBox || !selectedBox || !searchEl){
    // fallback: keep old hidden csv in sync if elements missing
    getTeamMembersForPayload();
    return;
  }

  const techList = (allowedIds && allowedIds.length)
    ? state.techs.filter(t=>allowedIds.includes(t.username))
    : state.techs;

  const q = (searchEl.value||"").trim().toLowerCase();
  const primary = state.teamPicker.primary || (el("technician_username_select")?.value||"").trim();
  if(primary){
    state.teamPicker.primary = primary;
    state.teamPicker.selected.add(primary);
  }

  // Suggestions: top 30 matches that are not selected
  const suggestions = techList
    .filter(t=>{
      const key = (t.username||"").toLowerCase();
      return (!q || key.includes(q)) && !state.teamPicker.selected.has(t.username);
    })
    .slice(0, 30);

  suggestBox.innerHTML = suggestions.map(t=>{
    return `<button type="button" class="team-chip team-chip-add" data-u="${t.username}">+ ${escapeHtml(t.username)}</button>`;
  }).join("") || `<div class="team-empty">ไม่พบช่าง</div>`;

  // Selected chips: show primary first, then others
  const selected = Array.from(state.teamPicker.selected).filter(Boolean);
  selected.sort((a,b)=>{
    if(a===state.teamPicker.primary) return -1;
    if(b===state.teamPicker.primary) return 1;
    return a.localeCompare(b);
  });

  selectedBox.innerHTML = selected.map(u=>{
    const isPrimary = (u===state.teamPicker.primary);
    if(isPrimary){
      return `
        <div class="team-chip team-chip-primary" data-u="${u}" role="button" tabindex="0" title="แตะเพื่อจัดการ">
          <span class="team-name">${escapeHtml(u)}</span>
          <span class="team-badge">Primary</span>
        </div>`;
    }
    return `
      <div class="team-chip" data-u="${u}" role="button" tabindex="0" title="แตะเพื่อจัดการ">
        <span class="team-name">${escapeHtml(u)}</span>
        <span class="team-badge">ร่วม</span>
      </div>`;
  }).join("") || `<div class="team-empty">ยังไม่ได้เลือกช่างร่วม</div>`;

  // sync hidden csv for payload
  getTeamMembersForPayload();
  refreshCurrentAssignSelect();
  updateParallelUIVisibility();
  renderCurrentAllocationUI();
}

// Allocation UI for current service line (when machine_count>1 and team>=2)
state.current_alloc = {}; // {username: qty}
function renderCurrentAllocationUI(){
  const box = el('current_alloc_box');
  if(!box) return;
  const team = getTeamListForAssign();
  const mc = Math.max(1, Number(el('machine_count')?.value||1));
  const parallel = !!(el('parallel_by_tech')?.checked);
  const jt = (el('job_type')?.value||'').trim();
  // only for wash flow allocation; still useful for any job but keep scope conservative
  if(!parallel || team.length < 2 || mc < 2 || jt !== 'ล้าง'){
    box.innerHTML = '';
    state.current_alloc = {};
    return;
  }
  // init default: put all on primary if empty
  if(!Object.keys(state.current_alloc||{}).length){
    const p = state.teamPicker.primary || team[0];
    state.current_alloc = {};
    if(p) state.current_alloc[p] = mc;
  }
  // ensure members exist
  for(const u of team){ if(!(u in state.current_alloc)) state.current_alloc[u]=0; }

  const total = Object.values(state.current_alloc).reduce((a,b)=>a+Number(b||0),0);
  const warn = total !== mc;

  box.innerHTML = `
    <div class="card card-lite" style="padding:12px;border-radius:16px">
      <b>แบ่งจำนวนเครื่องต่อช่าง (ทำพร้อมกัน)</b>
      <div class="muted2 mini" style="margin-top:4px">รวมต้องเท่ากับ <b>${mc}</b> เครื่อง</div>
      <div id="curAllocRows" style="margin-top:10px;display:flex;flex-direction:column;gap:8px"></div>
      <div class="muted2 mini" style="margin-top:8px;${warn?'color:#b91c1c;font-weight:900':''}">
        รวมตอนนี้: ${total} / ${mc} ${warn ? ' (ยังไม่ครบ)' : ''}
      </div>
    </div>
  `;
  const rowsEl = el('curAllocRows');
  if(!rowsEl) return;
  const clamp=(n)=>Math.max(0, Math.min(mc, n));
  for(const u of team){
    const row = document.createElement('div');
    row.className='line';
    row.innerHTML = `
      <div class="pill" style="flex:1;justify-content:space-between">
        <span style="font-weight:900">${escapeHtml(u)}${u===state.teamPicker.primary?' • Primary':''}</span>
        <div class="stepper" style="gap:6px">
          <button type="button" class="btn-round" data-act="-" data-u="${u}">−</button>
          <input type="number" min="0" max="${mc}" step="1" value="${Number(state.current_alloc[u]||0)}" style="width:72px;text-align:center" data-u="${u}">
          <button type="button" class="btn-round" data-act="+" data-u="${u}">+</button>
        </div>
      </div>
    `;
    rowsEl.appendChild(row);
  }
  rowsEl.querySelectorAll('button.btn-round').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const u=btn.getAttribute('data-u');
      const act=btn.getAttribute('data-act');
      if(!u) return;
      const v = Number(state.current_alloc[u]||0);
      state.current_alloc[u] = clamp(v + (act==='+'?1:-1));
      renderCurrentAllocationUI();
      refreshPreviewDebounced();
    });
  });
  rowsEl.querySelectorAll('input[type="number"]').forEach(inp=>{
    inp.addEventListener('input', ()=>{
      const u=inp.getAttribute('data-u');
      if(!u) return;
      state.current_alloc[u] = clamp(Number(inp.value||0));
      renderCurrentAllocationUI();
      refreshPreviewDebounced();
    });
  });
}

function getTeamListForAssign(){
  // prefer selected team (primary first)
  const selected = Array.from(state.teamPicker.selected||[]).filter(Boolean);
  const primary = state.teamPicker.primary || "";
  const out = [];
  if(primary && !out.includes(primary)) out.push(primary);
  for(const u of selected){
    if(u && !out.includes(u)) out.push(u);
  }
  return out;
}

function refreshCurrentAssignSelect(){
  const sel = el('current_line_assigned_to');
  if(!sel) return;
  const team = getTeamListForAssign();
  const cur = (sel.value||'').trim() || (state.teamPicker.primary||'');
  sel.innerHTML = '';
  const list = team.length ? team : (state.techs||[]).map(t=>t.username);
  for(const u of list){
    const o=document.createElement('option'); o.value=u; o.textContent=u; sel.appendChild(o);
  }
  sel.value = list.includes(cur) ? cur : (list[0]||'');
}


// Team action sheet (tap chip -> set primary / remove)
state.teamPicker.active = "";
function openTeamSheet(username){
  const u = String(username||"").trim();
  if(!u) return;
  state.teamPicker.active = u;
  const overlay = el("team_sheet_overlay");
  if(!overlay) return;
  const title = el("team_sheet_title");
  const sub = el("team_sheet_sub");
  if(title) title.textContent = `จัดการทีมช่าง: ${u}`;
  if(sub){
    sub.textContent = (u === state.teamPicker.primary)
      ? "ช่างหลัก (แตะเพื่อเปลี่ยนช่างหลักหรือปิด)"
      : "ช่างร่วม (ตั้งเป็นช่างหลักหรือเอาออกได้)";
  }
  // disable remove if primary
  const rm = el("team_sheet_remove");
  if(rm) rm.disabled = (u === state.teamPicker.primary);
  overlay.style.display = "flex";
}
function closeTeamSheet(){
  const overlay = el("team_sheet_overlay");
  if(overlay) overlay.style.display = "none";
  state.teamPicker.active = "";
}

// delegate events once
function wireTeamPickerEvents(){
  const searchEl = document.getElementById("team_search");
  if(searchEl){
    searchEl.addEventListener("input", ()=>renderTeamPicker());
  }
  document.addEventListener("click", (e)=>{
    const btn = e.target.closest(".team-chip-add");
    if(btn){
      addTeamMember(btn.getAttribute("data-u"));
      return;
    }
    const chip = e.target.closest(".team-chip");
    if(chip && chip.getAttribute("data-u")){
      openTeamSheet(chip.getAttribute("data-u"));
      return;
    }
  });

  // sheet buttons
  el("team_sheet_close")?.addEventListener("click", closeTeamSheet);
  el("team_sheet_overlay")?.addEventListener("click", (e)=>{
    if(e.target && e.target.id === "team_sheet_overlay") closeTeamSheet();
  });
  el("team_sheet_set_primary")?.addEventListener("click", ()=>{
    if(!state.teamPicker.active) return;
    setPrimary(state.teamPicker.active);
    closeTeamSheet();
  });
  el("team_sheet_remove")?.addEventListener("click", ()=>{
    const u = state.teamPicker.active;
    if(!u) return;
    if(u === state.teamPicker.primary){
      showToast("ต้องเปลี่ยนช่างหลักก่อน", "error");
      return;
    }
    removeTeamMember(u);
    closeTeamSheet();
  });
}


function parseLatLngClient(input){
  const s = String(input||'').trim();
  if(!s) return null;
  const m = s.match(/@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/) ||
            s.match(/[?&]q=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/) ||
            s.match(/[?&]ll=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/) ||
            s.match(/(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/);
  if(!m) return null;
  const lat = Number(m[1]); const lng = Number(m[2]);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)) return null;
  if(Math.abs(lat)>90 || Math.abs(lng)>180) return null;
  return {lat,lng};
}

function setBtuOptions() {
  const sel = el("btu");
  sel.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "-- เลือก --";
  sel.appendChild(opt0);
  for (const v of BTU_OPTIONS) {
    const o = document.createElement("option");
    o.value = String(v);
    o.textContent = v === 60000 ? "60,000+" : v.toLocaleString("th-TH");
    sel.appendChild(o);
  }
  sel.value = "12000";
}

function buildVariantUI() {
  const jt = (el("job_type").value || "").trim();
  const box = el("variant_box");
  box.innerHTML = "";

  if (jt === "ล้าง") {
    const ac = (el("ac_type").value || "").trim();
    if (ac === "ผนัง" || !ac) {
      box.innerHTML = `
        <label>ประเภทการล้าง *</label>
        <select id="wash_variant">
          <option value="">-- เลือก --</option>
          <option value="ล้างธรรมดา">ล้างธรรมดา</option>
          <option value="ล้างพรีเมียม">ล้างพรีเมียม</option>
          <option value="ล้างแขวนคอยน์">ล้างแขวนคอยน์</option>
          <option value="ล้างแบบตัดล้าง">ล้างแบบตัดล้าง</option>
        </select>
      `;
    } else {
      box.innerHTML = `
        <div class="muted2" style="margin-top:8px">
          ประเภทแอร์ <b>${escapeHtml(ac)}</b> ใช้สูตรเวลามาตรฐาน (ไม่ต้องเลือกประเภทการล้าง)
        </div>
      `;
    }
  } else if (jt === "ซ่อม") {
    box.innerHTML = `
      <label>ประเภทงานซ่อม *</label>
      <select id="repair_variant">
        <option value="">-- เลือก --</option>
        <option value="ตรวจเช็ค">ตรวจเช็ค</option>
        <option value="ตรวจเช็ครั่ว">ตรวจเช็ครั่ว</option>
        <option value="ซ่อมเปลี่ยนอะไหล่">ซ่อมเปลี่ยนอะไหล่ (แอดมินกำหนดเวลา)</option>
      </select>
    `;
  } else if (jt === "ติดตั้ง") {
    box.innerHTML = `
      <div class="muted2" style="margin-top:8px">
        งานติดตั้ง: แอดมินกำหนด <b>เวลา/ราคา</b> เอง (override)
      </div>
    `;
  }
}

function getPayloadV2() {
  const job_type = (el("job_type").value || "").trim();
  const ac_type = (el("ac_type").value || "").trim();
  const btu = Number(el("btu").value || 0);
  const machine_count = Math.max(1, Number(el("machine_count").value || 1));
  const wash_variant = (document.getElementById("wash_variant")?.value || "").trim();
  const repair_variant = (document.getElementById("repair_variant")?.value || "").trim();
  const admin_override_duration_min = Math.max(0, Number(el("override_duration_min").value || 0));
  return { job_type, ac_type, btu, machine_count, wash_variant, repair_variant, admin_override_duration_min };
}



function buildCurrentServiceLine(){
  const p = getPayloadV2();
  // ใช้เฉพาะงานล้างเท่านั้นสำหรับ multi-service
  const assigned_to = (el('current_line_assigned_to')?.value || '').trim();
  const parallel = !!(el('parallel_by_tech')?.checked);
  let allocations = null;
  if(parallel && p.job_type==='ล้าง'){
    // allocations ใช้เฉพาะกรณีจำนวนเครื่องมากกว่า 1
    const mc = Math.max(1, Number(p.machine_count||1));
    if(mc >= 2){
      const a = state.current_alloc || {};
      const sum = Object.values(a).reduce((x,y)=>x+Number(y||0),0);
      if(sum === mc){
        const cleaned = {};
        for(const [k,v] of Object.entries(a)){
          const q = Math.max(0, Number(v||0));
          if(q>0) cleaned[k]=q;
        }
        allocations = Object.keys(cleaned).length ? cleaned : null;
      }
    }
  }
  return {
    job_type: p.job_type,
    ac_type: p.ac_type,
    btu: p.btu,
    machine_count: p.machine_count,
    wash_variant: p.wash_variant,
    assigned_to: assigned_to || (state.teamPicker.primary||'') || null,
    allocations,
  };
}

function sameServiceLine(a,b){
  return a && b &&
    String(a.job_type||'')===String(b.job_type||'') &&
    String(a.ac_type||'')===String(b.ac_type||'') &&
    Number(a.btu||0)===Number(b.btu||0) &&
    Number(a.machine_count||0)===Number(b.machine_count||0) &&
    String(a.wash_variant||'')===String(b.wash_variant||'');
}

function renderServiceLines(){
  const box = document.getElementById('multi_service_box');
  const list = document.getElementById('service_lines');
  const btnAdd = document.getElementById('btnAddServiceLine');
  const jt = (el('job_type').value||'').trim();

  if(!box || !list || !btnAdd) return;

  // show only for wash
  if(jt !== 'ล้าง'){
    box.style.display = 'none';
    state.service_lines = [];
    return;
  }
  box.style.display = 'block';

  const lines = Array.isArray(state.service_lines) ? state.service_lines : [];
  const rows = lines.map((ln, idx)=>{
    const label = `${ln.ac_type||'-'} • ${Number(ln.btu||0)} BTU • ${Number(ln.machine_count||1)} เครื่อง` + (ln.ac_type==='ผนัง' ? ` • ${ln.wash_variant||'ล้างธรรมดา'}` : '');
    return `<div class="svc-row">
      <div class="svc-main">
        <div class="svc-title"><b>${escapeHtml(label)}</b></div>
        <div class="muted2 mini">รายการบริการหลัก #${idx+1}</div>
        <div class="muted2 mini" style="margin-top:6px"><b>มอบหมายให้:</b> <select class="svc-assign" data-idx="${idx}"></select></div>
        <div class="svc-alloc" data-idx="${idx}"></div>
      </div>
      <button type="button" class="svc-del" data-idx="${idx}">ลบ</button>
    </div>`;
  }).join("") || `<div class="muted2">ยังไม่มีรายการบริการเพิ่มเติม • ใช้ค่าด้านบนเป็นรายการหลักได้ หรือกด “เพิ่มรายการบริการ”</div>`;

  list.innerHTML = rows;

  // populate assignment selects (each line)
  const team = getTeamListForAssign();
  list.querySelectorAll('.svc-assign').forEach(sel=>{
    const idx = Number(sel.getAttribute('data-idx'));
    const ln = (Number.isFinite(idx) && state.service_lines[idx]) ? state.service_lines[idx] : null;
    const curVal = (ln && ln.assigned_to) ? String(ln.assigned_to) : (state.teamPicker.primary||"");
    sel.innerHTML = "";
    const opts = team.length ? team : (state.techs||[]).map(t=>t.username);
    for(const u of opts){
      const o=document.createElement('option'); o.value=u; o.textContent=u; sel.appendChild(o);
    }
    sel.value = opts.includes(curVal) ? curVal : (opts[0]||"");
    sel.addEventListener('change', ()=>{
      if(!ln) return;
      ln.assigned_to = (sel.value||"").trim();
      refreshPreviewDebounced();
      // re-render slots to reflect required techs
      renderSlots();
    });
  });

  // bind delete

  list.querySelectorAll('.svc-del').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const i = Number(btn.getAttribute('data-idx'));
      if(Number.isFinite(i)){
        state.service_lines.splice(i,1);
        renderServiceLines();
        refreshPreviewDebounced();
      }
    });
  });

  // allocation per line (only when parallel, team>=2, and machine_count>=2)
  const parallel = !!(el('parallel_by_tech')?.checked);
  const team2 = getTeamListForAssign();
  list.querySelectorAll('.svc-alloc').forEach(div=>{
    const idx = Number(div.getAttribute('data-idx'));
    const ln = (Number.isFinite(idx) && state.service_lines[idx]) ? state.service_lines[idx] : null;
    if(!ln){ div.innerHTML=''; return; }
    const mc = Math.max(1, Number(ln.machine_count||1));
    if(!parallel || team2.length<2 || mc<2){ div.innerHTML=''; ln.allocations = null; return; }
    // init allocations default -> assigned_to gets all
    if(!ln.allocations || typeof ln.allocations!=='object'){
      ln.allocations = {};
      const p = (ln.assigned_to||state.teamPicker.primary||team2[0]||'').trim();
      if(p) ln.allocations[p] = mc;
    }
    for(const u of team2){ if(!(u in ln.allocations)) ln.allocations[u]=0; }
    const total = Object.values(ln.allocations).reduce((a,b)=>a+Number(b||0),0);
    const warn = total!==mc;
    div.innerHTML = `
      <div class="muted2 mini" style="margin-top:8px">แบ่งจำนวนเครื่องต่อช่าง (รวม ${mc} เครื่อง)</div>
      <div class="alloc-grid" style="display:flex;flex-direction:column;gap:6px;margin-top:6px"></div>
      <div class="muted2 mini" style="margin-top:4px;${warn?'color:#b91c1c;font-weight:900':''}">รวม: ${total}/${mc}${warn?' (ยังไม่ครบ)':''}</div>
    `;
    const grid = div.querySelector('.alloc-grid');
    if(!grid) return;
    const clamp=(n)=>Math.max(0, Math.min(mc, n));
    for(const u of team2){
      const r=document.createElement('div');
      r.className='line';
      r.innerHTML = `
        <div class="pill" style="flex:1;justify-content:space-between">
          <span style="font-weight:900">${escapeHtml(u)}</span>
          <div class="stepper" style="gap:6px">
            <button type="button" class="btn-round" data-act="-" data-u="${u}">−</button>
            <input type="number" min="0" max="${mc}" step="1" value="${Number(ln.allocations[u]||0)}" style="width:72px;text-align:center" data-u="${u}">
            <button type="button" class="btn-round" data-act="+" data-u="${u}">+</button>
          </div>
        </div>`;
      grid.appendChild(r);
    }
    grid.querySelectorAll('button.btn-round').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const u=btn.getAttribute('data-u');
        const act=btn.getAttribute('data-act');
        if(!u) return;
        const v = Number(ln.allocations[u]||0);
        ln.allocations[u] = clamp(v + (act==='+'?1:-1));
        refreshPreviewDebounced();
        renderServiceLines();
      });
    });
    grid.querySelectorAll('input[type="number"]').forEach(inp=>{
      inp.addEventListener('input', ()=>{
        const u=inp.getAttribute('data-u');
        if(!u) return;
        ln.allocations[u] = clamp(Number(inp.value||0));
        refreshPreviewDebounced();
        renderServiceLines();
      });
    });
  });
}

function wireMultiService(){
  const btnAdd = document.getElementById('btnAddServiceLine');
  if(btnAdd){
    btnAdd.addEventListener('click', ()=>{
      const jt = (el('job_type').value||'').trim();
      if(jt !== 'ล้าง'){ showToast('Multi-service ใช้ได้เฉพาะงานล้าง', 'error'); return; }
      if(!validateRequiredForPreview()){ showToast('กรอกข้อมูลบริการให้ครบก่อนเพิ่มรายการ', 'error'); return; }
      const ln = buildCurrentServiceLine();
      // default wash variant for wall if empty
      if(ln.ac_type === 'ผนัง' && !ln.wash_variant) ln.wash_variant = 'ล้างธรรมดา';
      // avoid duplicate exact line
      if(state.service_lines.some(x=>sameServiceLine(x,ln))){
        showToast('รายการนี้ถูกเพิ่มแล้ว', 'info');
        return;
      }
      state.service_lines.push(ln);
      renderServiceLines();
      showToast('เพิ่มรายการบริการแล้ว', 'success');
      refreshPreviewDebounced();
    });
  }

  // initial render
  renderServiceLines();
}

function getServicesPayload(){
  const jt = (el('job_type').value||'').trim();
  if(jt !== 'ล้าง') return null;
  // include current line + added lines (unique by signature)
  const cur = buildCurrentServiceLine();
  if(cur.ac_type==='ผนัง' && !cur.wash_variant) cur.wash_variant='ล้างธรรมดา';

  const all = [];
  const pushUnique=(ln)=>{
    if(!ln || !ln.ac_type || !ln.btu || !ln.machine_count) return;
    if(all.some(x=>sameServiceLine(x,ln))) return;
    const out = { ...ln };
    // keep allocations if present (used by server-side duration & job_items split)
    if(out.allocations && typeof out.allocations !== 'object') out.allocations = null;
    delete out.allocations_key_fixed;
    all.push(out);
  };
  for(const ln of (state.service_lines||[])) pushUnique(ln);
  pushUnique(cur);
  return all.length ? all : null;
}

function validateRequiredForPreview() {
const p = getPayloadV2();
if (!p.job_type) return false;
if (!p.ac_type) return false;
if (!p.btu) return false;
if (!p.machine_count) return false;

if (p.job_type === "ล้าง") {
  // ต้องเลือก wash_variant เฉพาะผนัง (ประเภทอื่นใช้สูตรมาตรฐาน)
  if (p.ac_type === "ผนัง" && !p.wash_variant) return false;
}
if (p.job_type === "ซ่อม" && !p.repair_variant) return false;
return true;

}

let previewTimer = null;
async function refreshPreviewDebounced() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(refreshPreview, 250);
}

async function refreshPreview() {
  if (!validateRequiredForPreview()) {
    el("pv_duration").textContent = "-";
    el("pv_block").textContent = "-";
    el("pv_price").textContent = "-";
    // pv_total removed (use total_preview)

    return;
  }
  try {
    const payload = getPayloadV2();
    payload.parallel_by_tech = el('parallel_by_tech')?.checked ? 1 : 0;
    const services = getServicesPayload();
    if (services) payload.services = services;
    const r = await apiFetch("/public/pricing_preview", { method: "POST", body: JSON.stringify(payload) });
    state.standard_price = Number(r.standard_price || 0);
    state.duration_min = Number(r.duration_min || 0);
    state.effective_block_min = Number(r.effective_block_min || 0);
    state.travel_buffer_min = Number(r.travel_buffer_min || 30);

    el("pv_duration").textContent = String(state.duration_min);
    el("pv_block").textContent = String(state.effective_block_min);
    el("pv_price").textContent = fmtMoney(state.standard_price);
    updateTotalPreview();

    // auto refresh availability if already selected date
    if (el("appt_date").value) {
      loadAvailability();
    }
  } catch (e) {
    el("pv_duration").textContent = "-";
    el("pv_block").textContent = "-";
    el("pv_price").textContent = "-";
    // pv_total removed (use total_preview)

    showToast(e.message || "คำนวณไม่สำเร็จ", "error");
  }
}

function updateTotalPreview() {
  const overridePrice = Math.max(0, Number(el("override_price").value || 0));
  const base = overridePrice > 0 ? overridePrice : state.standard_price;
  const extras = state.selected_items.reduce((s, it) => s + (Number(it.base_price || 0) * Number(it.qty || 1)), 0);
  let subtotal = base + extras;
  let discount = 0;
  const pid = Number(el("promotion_id").value || 0);
  const promo = state.promo_list.find((p) => Number(p.promo_id) === pid) || null;
  if (promo) {
    if (promo.promo_type === "percent") {
      discount = subtotal * (Number(promo.promo_value || 0) / 100);
    } else {
      discount = Number(promo.promo_value || 0);
    }
    if (discount < 0) discount = 0;
    if (discount > subtotal) discount = subtotal;
  }
  const total = Math.max(0, subtotal - discount);
  // pv_total removed (use total_preview)

  const pd = el("pv_discount"); if(pd) pd.textContent = fmtMoney(discount);
  const ps = el("pv_subtotal"); if(ps) ps.textContent = fmtMoney(subtotal);
  const tp = el("total_preview");
  if (tp) tp.value = fmtMoney(total);
}

async function loadCatalog() {
  try {
    const items = await apiFetch("/catalog/items");
    state.catalog = Array.isArray(items) ? items : [];
    const sel = el("extras_select");
    if(!sel) return;
    sel.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "-- เลือกรายการ --";
    sel.appendChild(opt0);
    for (const it of state.catalog) {
      if (!it || !it.item_id) continue;
      if (it.is_active === false) continue;
      const o = document.createElement("option");
      o.value = String(it.item_id);
      o.textContent = `${it.item_name} (${fmtMoney(it.base_price)} บาท)`;
      sel.appendChild(o);
    }
  } catch (e) {
    console.warn(e);
  }
}

async function loadPromotions() {
  try {
    // Admin ต้องเห็นทั้งหมด (รวมที่ลูกค้าไม่เห็น) ใช้ v2 endpoint
    const list = await apiFetch("/admin/promotions_v2");
    state.promo_list = Array.isArray(list) ? list : [];
    const sel = el("promotion_id");
    sel.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "ไม่ใช้โปรโมชั่น";
    sel.appendChild(opt0);
    for (const p of state.promo_list) {
      if (!p?.promo_id) continue;
      const o = document.createElement("option");
      o.value = String(p.promo_id);
      const label = p.promo_type === "percent" ? `${p.promo_value}%` : `${fmtMoney(p.promo_value)} บาท`;
      o.textContent = `${p.promo_name} (${label})`;
      sel.appendChild(o);
    }
  } catch (e) {
    console.warn(e);
  }
}

function wirePromotionControls(){
  el("btnPromoManage")?.addEventListener("click", ()=>{
    location.href = "/admin-promotions-v2.html";
  });

  el("btnPromoQuickAdd")?.addEventListener("click", async ()=>{
    // Quick add: ใช้ prompt แบบปลอดภัย (ไม่พังหน้า) และสร้างใน DB จริง
    const name = prompt("ชื่อโปรโมชัน (เช่น ลด 10%)");
    if(!name) return;
    const type = (prompt("ประเภทโปร: percent หรือ fixed", "percent")||"percent").trim().toLowerCase();
    if(!["percent","fixed"].includes(type)){
      showToast("ประเภทโปรไม่ถูกต้อง", "error");
      return;
    }
    const vRaw = prompt(type==="percent" ? "จำนวนเปอร์เซ็นต์ (เช่น 10)" : "จำนวนบาท (เช่น 200)");
    const val = Number(vRaw);
    if(!Number.isFinite(val) || val <= 0){
      showToast("ค่าโปรไม่ถูกต้อง", "error");
      return;
    }
    try{
      await apiFetch("/admin/promotions_v2", { method:"POST", body: JSON.stringify({ promo_name:name.trim(), promo_type:type, promo_value: val, is_active:true }) });
      await loadPromotions();
      showToast("เพิ่มโปรโมชันแล้ว", "success");
    }catch(err){
      console.warn(err);
      showToast("เพิ่มโปรโมชันไม่สำเร็จ", "error");
    }
  });
}

function renderExtras() {
  const box = el("extras_list");
  box.innerHTML = "";
  if (!state.selected_items.length) {
    box.innerHTML = `<div class="muted2 mini">ยังไม่มีรายการเสริม</div>`;
    updateTotalPreview();
    return;
  }
  for (const it of state.selected_items) {
    const row = document.createElement("div");
    row.className = "line";
    row.style.marginTop = "8px";
    row.innerHTML = `
      <div class="grow">
        <b>${it.item_name}</b>
        <div class="muted2 mini">${fmtMoney(it.base_price)} บาท/รายการ</div>
      </div>
      <input type="number" min="1" step="1" value="${it.qty}" style="width:90px" />
      <button class="danger btn-mini" type="button">ลบ</button>
    `;
    const qtyInput = row.querySelector("input");
    const btnDel = row.querySelector("button");
    qtyInput.addEventListener("input", () => {
      it.qty = Math.max(1, Number(qtyInput.value || 1));
      updateTotalPreview();
    });
    btnDel.addEventListener("click", () => {
      state.selected_items = state.selected_items.filter((x) => x.item_id !== it.item_id);
      renderExtras();
    });
    box.appendChild(row);
  }
  updateTotalPreview();
}

function addExtra() {
  const selExtra = el("extras_select");
  const qtyEl = el("extras_qty");
  if(!selExtra || !qtyEl) return;
  const itemId = Number(selExtra.value || 0);
  const qty = Math.max(1, Number(qtyEl.value || 1));
  if (!itemId) return;
  const found = state.catalog.find((x) => Number(x.item_id) === itemId);
  if (!found) return;
  const exist = state.selected_items.find((x) => Number(x.item_id) === itemId);
  if (exist) {
    exist.qty += qty;
  } else {
    state.selected_items.push({ item_id: itemId, qty, item_name: found.item_name, base_price: Number(found.base_price || 0) });
  }
  selExtra.value = "";
  qtyEl.value = "1";
  renderExtras();
}

function canLoadAvailability() {
  return validateRequiredForPreview() && state.duration_min > 0 && !!el("appt_date").value;
}

async function loadAvailability() {
  if (!canLoadAvailability()) {
    el("slots_box").innerHTML = `<div class="muted2">กรอกข้อมูลบริการให้ครบ + เลือกวันที่ก่อน</div>`;
    return;
  }
  const date = el("appt_date").value;
  const tech_type = (el("tech_type").value || "company").trim().toLowerCase();
  const duration_min = state.duration_min;
  try {
    const r = await apiFetch(`/public/availability_v2?date=${encodeURIComponent(date)}&tech_type=${encodeURIComponent(tech_type)}&duration_min=${encodeURIComponent(duration_min)}`);
    state.available_slots = Array.isArray(r.slots) ? r.slots : [];
    renderSlots();
  } catch (e) {
    el("slots_box").innerHTML = `<div class="muted2">โหลดคิวว่างไม่สำเร็จ: ${e.message}</div>`;
  }
}

function renderSlots() {
  const box = el("slots_box");
  if (!box) return;
  box.innerHTML = "";
  const slotsAll = Array.isArray(state.available_slots) ? state.available_slots.filter(Boolean) : [];
  if (!slotsAll.length) {
    box.innerHTML = `<div class="muted2">ไม่พบข้อมูลสล็อต (ลองเปลี่ยนวัน/กลุ่มช่าง)</div>`;
    return;
  }

  const teamAll = getTeamListForAssign();
  const parallel = !!(el('parallel_by_tech')?.checked);
  // required techs = techs ที่ถูกใช้งานจริง (มอบหมายในรายการล้าง) หรืออย่างน้อยช่างหลัก
  const services = getServicesPayload() || [];
  const requiredTechSet = new Set();
  for (const s of services) {
    const u = (s.assigned_to || '').trim();
    if (u) requiredTechSet.add(u);
  }
  if (!requiredTechSet.size && state.teamPicker.primary) requiredTechSet.add(state.teamPicker.primary);

  const requiredTechs = Array.from(requiredTechSet).filter(Boolean);
  const slotsSelectable = slotsAll.filter(s => {
    if (!requiredTechs.length) return !!s.available;
    const ids = Array.isArray(s.available_tech_ids) ? s.available_tech_ids : [];
    return requiredTechs.every(u => ids.includes(u));
  });

  // header legend
  const legend = document.createElement('div');
  legend.className = 'slot-legend';
  const teamCount = Math.max(1, teamAll.length || 1);
  legend.innerHTML = `
    <div>
      <b>สล็อตเวลา</b> <span class="muted2 mini">(ว่าง/เต็ม ชัดเจน)</span>
      <div class="muted2 mini" style="margin-top:2px">ทีมช่างในใบงาน: <b>${teamCount}</b> คน</div>
      ${requiredTechs.length ? `<div class="muted2 mini" style="margin-top:2px">ต้องว่างพร้อมกัน: <b>${requiredTechs.join(", ")}</b></div>` : ``}
    </div>
    <div class="badge ${slotsSelectable.length ? 'ok' : 'muted'}">${slotsSelectable.length ? 'ว่าง' : 'เต็ม'} • ${slotsSelectable.length}/${slotsAll.length} ช่วง</div>
  `;
  box.appendChild(legend);

  // If not parallel or only 1 tech: fallback to compact list
  if (!parallel || teamAll.length <= 1) {
    const grid = document.createElement("div");
    grid.className = "slot-grid";
    for (const s of slotsAll) {
      const btn = document.createElement("button");
      btn.type = "button";
      const techCount = Array.isArray(s.available_tech_ids) ? s.available_tech_ids.length : 0;
      const selectable = slotsSelectable.includes(s);
      btn.className = `slot-btn ${selectable ? '' : 'full'} ${state.selected_slot_iso.endsWith('T'+s.start+':00') ? 'selected':''}`;
      btn.innerHTML = `<div class="slot-time">${s.start} - ${s.end}</div><div class="slot-sub">${selectable ? `ว่าง • ${techCount} ช่าง` : 'เต็ม'}</div>`;
      btn.disabled = !selectable;
      btn.addEventListener("click", () => selectSlot(s.start));
      grid.appendChild(btn);
    }
    box.appendChild(grid);
    return;
  }

  // Parallel view: แยก 4 แถวตามช่าง (สีไม่ชน อ่านง่าย)
  const maxRows = 4;
  const techRows = teamAll.slice(0, maxRows);
  const more = teamAll.length - techRows.length;

  const grid = document.createElement('div');
  grid.className = 'slot-grid';

  techRows.forEach((u, rowIdx) => {
    const row = document.createElement('div');
    row.className = 'tech-row';

    const head = document.createElement('div');
    head.className = 'tech-row-head';

    const pill = document.createElement('div');
    pill.className = 'tech-pill';
    pill.textContent = u + (u === state.teamPicker.primary ? ' • Primary' : '');
    // assign subtle tint by row index using inline rgba (no extra colors list) -> keep within blue/yellow theme
    const tints = ['rgba(13,110,253,.10)','rgba(255,193,7,.12)','rgba(13,110,253,.06)','rgba(255,193,7,.08)'];
    row.style.background = `linear-gradient(180deg, ${tints[rowIdx%tints.length]}, rgba(255,255,255,.98))`;

    const stat = document.createElement('div');
    stat.className = 'muted2 mini';
    stat.textContent = requiredTechSet.has(u) ? 'ต้องใช้ช่างคนนี้' : 'ช่างร่วม';

    head.appendChild(pill);
    head.appendChild(stat);
    row.appendChild(head);

    const slotsWrap = document.createElement('div');
    slotsWrap.className = 'tech-row-slots';

    // show first 16 slots (09:00-18:00 step 30) arranged 4 columns
    for (const s of slotsAll) {
      const ids = Array.isArray(s.available_tech_ids) ? s.available_tech_ids : [];
      const techFree = ids.includes(u);
      const selectable = slotsSelectable.includes(s);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `slot-btn ${techFree ? '' : 'full'} ${state.selected_slot_iso.endsWith('T'+s.start+':00') ? 'selected':''}`;
      btn.innerHTML = `<div class="slot-time">${s.start}</div><div class="slot-sub">${techFree ? 'ว่าง' : 'เต็ม'}</div>`;
      // Click chooses common slot only if all required techs available in that slot
      btn.disabled = !selectable;
      btn.addEventListener('click', () => selectSlot(s.start));
      slotsWrap.appendChild(btn);
    }

    row.appendChild(slotsWrap);
    grid.appendChild(row);
  });

  box.appendChild(grid);

  if (more > 0) {
    const note = document.createElement('div');
    note.className = 'muted2 mini';
    note.style.marginTop = '8px';
    note.textContent = `มีช่างมากกว่า ${maxRows} คน • แสดงแค่ ${maxRows} แถวแรก (ยังเลือกสล็อตได้ตามปกติ)`;
    box.appendChild(note);
  }
}

function selectSlot(startHHMM){
  const date = el("appt_date")?.value;
  if(!date) return;
  const iso = `${date}T${startHHMM}:00`;
  state.selected_slot_iso = iso;
  const dtEl = el("appointment_datetime");
  if(dtEl) dtEl.value = iso;
  // Update technician selector allowlist based on selected slot
  const s = (state.available_slots||[]).find(x=>x && x.start===startHHMM);
  if(s && Array.isArray(s.available_tech_ids)){
    renderTechSelect(s.available_tech_ids);
    renderTeamPicker(s.available_tech_ids);
  }
  renderSlots();
}

// PATCH: machine count stepper (premium: กดได้ + พิมพ์ได้)
function bindMachineCountStepper(){
  const input = el('machine_count');
  const minus = el('mc_minus');
  const plus = el('mc_plus');
  if(!input || !minus || !plus) return;

  const clamp = (n)=>{
    const v = Math.max(1, Math.min(20, Number(n)||1));
    return v;
  };

  const set = (n, {silent} = {})=>{
    const v = clamp(n);
    input.value = String(v);
    if(!silent) refreshPreviewDebounced();
  };

  minus.addEventListener('click', ()=> set(Number(input.value||1)-1));
  plus.addEventListener('click', ()=> set(Number(input.value||1)+1));
  input.addEventListener('input', ()=> set(input.value, {silent:true}));
  input.addEventListener('change', ()=> set(input.value));

  set(input.value||1, {silent:true});
}

async function submitBooking() {
  const name = (el("customer_name").value || "").trim();
  const job_type = (el("job_type").value || "").trim();
  const address_text = (el("address_text").value || "").trim();
  if (!name || !job_type || !address_text) {
    showToast("กรอก ชื่อ/ประเภทงาน/ที่อยู่ ให้ครบ", "error");
    return;
  }
  if (!validateRequiredForPreview()) {
    showToast("กรอกข้อมูลบริการให้ครบก่อน", "error");
    return;
  }
  if (!state.selected_slot_iso) {
    showToast("เลือกเวลานัดจากคิวว่างก่อน", "error");
    return;
  }

  const payload = Object.assign({}, getPayloadV2(), {
    customer_name: name,
    customer_phone: (el("customer_phone").value || "").trim(),
    job_type,
    appointment_datetime: state.selected_slot_iso,
    address_text,
    customer_note: (el("customer_note").value || "").trim(),
    maps_url: (el("maps_url").value || "").trim(),
    job_zone: (el("job_zone").value || "").trim(),
    booking_mode: (el("booking_mode").value || "scheduled").trim(),
    tech_type: (el("tech_type").value || "company").trim(),
    technician_username: (el("technician_username_select")?.value || (el("technician_username")?.value||"")).trim(),
    dispatch_mode: (el("dispatch_mode").value || "forced").trim(),
    items: state.selected_items.map((x) => ({ item_id: x.item_id, qty: x.qty })),
    promotion_id: el("promotion_id").value || null,
    override_price: el("override_price").value || 0,
    override_duration_min: el("override_duration_min").value || 0,
    gps_latitude: (el("gps_latitude")?.value || "").trim() || null,
    gps_longitude: (el("gps_longitude")?.value || "").trim() || null,
    team_members: getTeamMembersForPayload(),
  });

  const services = getServicesPayload();
  if(services) payload.services = services;
  payload.parallel_by_tech = el('parallel_by_tech')?.checked ? 1 : 0;

  try {
    el("btnSubmit").disabled = true;
    const r = await apiFetch("/admin/book_v2", { method: "POST", body: JSON.stringify(payload) });
    showToast(`บันทึกงานสำเร็จ: ${r.booking_code}`, "success");
    try {
      const s = await apiFetch(`/jobs/${r.job_id}/summary`);
      if (s && s.text) {
        el('summary_card').style.display = 'block';
        el('summary_text').value = s.text;
      }
    } catch (e) {
      console.warn('summary load fail', e);
    }
    // reset minimal
    state.selected_slot_iso = "";
    el("technician_username").value = "";
  } catch (e) {
    showToast(e.message || "บันทึกไม่สำเร็จ", "error");
  } finally {
    el("btnSubmit").disabled = false;
  }
}

function wireEvents() {
  // build variant when job type changes
  el("job_type").addEventListener("change", () => {
    buildVariantUI();
    renderServiceLines();
    refreshPreviewDebounced();
    // attach listeners for dynamic selects
    setTimeout(() => {
      const w = document.getElementById("wash_variant");
      const r = document.getElementById("repair_variant");
      if (w) w.addEventListener("change", refreshPreviewDebounced);
      if (r) r.addEventListener("change", refreshPreviewDebounced);
    }, 0);
  });

  ["btu","machine_count"].forEach((id) => el(id).addEventListener("change", refreshPreviewDebounced));
  el("ac_type").addEventListener("change", ()=>{ buildVariantUI(); renderServiceLines(); refreshPreviewDebounced(); setTimeout(()=>{ const w=document.getElementById("wash_variant"); if(w) w.addEventListener("change", refreshPreviewDebounced); },0); });
  el("machine_count").addEventListener("input", refreshPreviewDebounced);
  el("override_price").addEventListener("input", () => updateTotalPreview());
  el("override_duration_min").addEventListener("input", refreshPreviewDebounced);
  el("promotion_id").addEventListener("change", () => updateTotalPreview());
  const btnEx = el("btnAddExtra"); if(btnEx) btnEx.addEventListener("click", addExtra);
  el("appt_date").addEventListener("change", loadAvailability);
  el("tech_type").addEventListener("change", async ()=>{ await loadTechsForType(); await loadAvailability(); });
  const btnSlots = el("btnLoadSlots"); if(btnSlots) btnSlots.addEventListener("click", loadAvailability);
  const btnSpecial = el("btnAddSpecialSlot"); if(btnSpecial) btnSpecial.addEventListener("click", addSpecialSlotV2);


// auto parse lat/lng from maps url (fail-open)
const llUpdate = () => {
  const ll = parseLatLngClient(el("maps_url")?.value) || parseLatLngClient(el("address_text")?.value);
  if (!ll) return;
  if (el("gps_latitude")) el("gps_latitude").value = String(ll.lat);
  if (el("gps_longitude")) el("gps_longitude").value = String(ll.lng);
};
el("maps_url").addEventListener("input", llUpdate);
el("address_text").addEventListener("input", llUpdate);

const copyBtn = el("btnCopySummary");
if (copyBtn) copyBtn.addEventListener("click", async () => {
  const txt = el("summary_text")?.value || "";
  if (!txt) return;
  try { await navigator.clipboard.writeText(txt); showToast("คัดลอกแล้ว", "success"); }
  catch { el("summary_text").select(); document.execCommand("copy"); showToast("คัดลอกแล้ว", "success"); }
});
  const selTech = el("technician_username_select");
  if(selTech) selTech.addEventListener("change", ()=>{ if(el("technician_username")) el("technician_username").value = selTech.value||""; });
    // team picker
  wireTeamPickerEvents();
  if(selTech) selTech.addEventListener("change", syncPrimaryFromSelect);
  syncPrimaryFromSelect();
  refreshCurrentAssignSelect();
  el('current_line_assigned_to')?.addEventListener('change', ()=>{ refreshPreviewDebounced(); renderSlots(); });
  el('parallel_by_tech')?.addEventListener('change', ()=>{ refreshPreviewDebounced(); renderSlots(); });
  el("btnSubmit").addEventListener("click", submitBooking);
}

async function addSpecialSlotV2(){
  try {
    const date = (el("appt_date")?.value || todayYMD()).trim();
    const team = getTeamListForAssign();
    if(!team.length){ showToast("ยังไม่มีรายชื่อช่างให้เพิ่มสลอต", "error"); return; }
    const username = (state.teamPicker.primary || team[0]).trim();
    const st = prompt(`เพิ่มสลอตพิเศษ\nช่าง: ${username}\nวันที่: ${date}\n\nใส่เวลาเริ่ม (HH:MM)`, "18:00");
    if(!st) return;
    const en = prompt(`ใส่เวลาสิ้นสุด (HH:MM)\nช่าง: ${username}\nวันที่: ${date}`, "19:00");
    if(!en) return;
    await apiFetch(`/admin/technicians/${encodeURIComponent(username)}/special_slots_v2`, {
      method: "POST",
      body: JSON.stringify({ date, start_time: st.trim(), end_time: en.trim() })
    });
    showToast("เพิ่มสลอตพิเศษแล้ว", "success");
    await loadAvailability();
  } catch (e) {
    showToast(e.message || "เพิ่มสลอตพิเศษไม่สำเร็จ", "error");
  }
}

async function init() {
  setBtuOptions();
  bindMachineCountStepper();
  buildVariantUI();
  // attach listeners for dynamic selects on first render
  const w0 = document.getElementById("wash_variant");
  const r0 = document.getElementById("repair_variant");
  if (w0) w0.addEventListener("change", refreshPreviewDebounced);
  if (r0) r0.addEventListener("change", refreshPreviewDebounced);

  el("appt_date").value = todayYMD();
  await Promise.all([loadCatalog(), loadPromotions(), loadTechsForType()]);
  wirePromotionControls();
  renderExtras();
  wireEvents();
  wireMultiService();
  refreshPreviewDebounced();
}

document.addEventListener("DOMContentLoaded", init);
