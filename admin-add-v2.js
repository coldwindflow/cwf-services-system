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
  slots_loaded: false,
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

function updateAssignUIVisibility(){
  const mode = (el('assign_mode')?.value || 'auto').toString();
  const teamWrap = el('team_picker_wrap');
  const hint = el('team_mode_hint');
  const lbl = el('tech_select_label');
  const help = el('tech_select_help');

  const techSel = el('technician_username_select');
  const allowPick = !!state.slots_loaded;
  if(techSel) techSel.disabled = !allowPick || (mode === 'auto');
  if(help) help.textContent = allowPick ? 'เลือกได้หลังจากกด “โหลดคิวว่าง”' : '* จะเปิดให้เลือกหลังจาก “โหลดคิวว่าง”';

  if(mode === 'team'){
    if(teamWrap) teamWrap.style.display = 'block';
    if(hint) hint.style.display = 'none';
    if(lbl) lbl.textContent = 'ช่างหลัก';
  }else if(mode === 'single'){
    if(teamWrap) teamWrap.style.display = 'none';
    if(hint) hint.style.display = 'none';
    if(lbl) lbl.textContent = 'เลือกเดี่ยว';
    // single mode => clear team
    state.teamPicker.selected = new Set();
    state.teamPicker.primary = '';
    if(el('team_members_csv')) el('team_members_csv').value = '';
  }else{
    // auto
    if(teamWrap) teamWrap.style.display = 'none';
    if(hint) hint.style.display = 'block';
    if(lbl) lbl.textContent = 'ช่าง';
    state.teamPicker.selected = new Set();
    state.teamPicker.primary = '';
    if(techSel) techSel.value = '';
    if(el('technician_username')) el('technician_username').value = '';
    if(el('team_members_csv')) el('team_members_csv').value = '';
  }

  // team picker only makes sense when allowPick
  if(teamWrap) {
    const disabled = !allowPick || (mode !== 'team');
    teamWrap.style.opacity = disabled ? '0.55' : '1';
    const inp = el('team_search');
    if(inp) inp.disabled = disabled;
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
  return {
    job_type: p.job_type,
    ac_type: p.ac_type,
    btu: p.btu,
    machine_count: p.machine_count,
    wash_variant: p.wash_variant,
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
      </div>
      <button type="button" class="svc-del" data-idx="${idx}">ลบ</button>
    </div>`;
  }).join("") || `<div class="muted2">ยังไม่มีรายการบริการเพิ่มเติม • ใช้ค่าด้านบนเป็นรายการหลักได้ หรือกด “เพิ่มรายการบริการ”</div>`;

  list.innerHTML = rows;

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
    state.slots_loaded = true;
    state.selected_slot_iso = "";
    // After loading slots, allow picking tech/team (user requirement)
    renderTechSelect(null);
    renderTeamPicker(null);
    updateAssignUIVisibility();
    renderSlots();
  } catch (e) {
    el("slots_box").innerHTML = `<div class="muted2">โหลดคิวว่างไม่สำเร็จ: ${e.message}</div>`;
  }
}

function getConstraintTechs(){
  const mode = (el('assign_mode')?.value || 'auto').toString();
  if(mode === 'single'){
    const u = (el('technician_username_select')?.value || '').trim();
    return u ? [u] : [];
  }
  if(mode === 'team'){
    const out = [];
    const p = (state.teamPicker.primary || '').trim();
    if(p) out.push(p);
    for(const u of getTeamListForAssign()){
      if(u && !out.includes(u)) out.push(u);
    }
    return out;
  }
  return [];
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

  const constraintTechs = getConstraintTechs();
  const slotsSelectable = slotsAll.filter(s => {
    if (!constraintTechs.length) return !!s.available;
    const ids = Array.isArray(s.available_tech_ids) ? s.available_tech_ids : [];
    return constraintTechs.every(u => ids.includes(u));
  });

  const legend = document.createElement('div');
  legend.className = 'slot-legend';
  legend.innerHTML = `
    <div>
      <b>สล็อตเวลา</b> <span class="muted2 mini">(กดเลือกได้)</span>
      ${constraintTechs.length ? `<div class="muted2 mini" style="margin-top:2px">ต้องว่างพร้อมกัน: <b>${constraintTechs.join(", ")}</b></div>` : `<div class="muted2 mini" style="margin-top:2px">ยังไม่เลือกช่าง • แสดงสล็อตที่มีอย่างน้อย 1 ช่างว่าง</div>`}
    </div>
    <div class="badge ${slotsSelectable.length ? 'ok' : 'muted'}">${slotsSelectable.length ? 'ว่าง' : 'เต็ม'} • ${slotsSelectable.length}/${slotsAll.length} ช่วง</div>
  `;
  box.appendChild(legend);

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
  const ids = (s && Array.isArray(s.available_tech_ids)) ? s.available_tech_ids : null;
  if(ids){
    renderTechSelect(ids);
    renderTeamPicker(ids);

    // If current selection is not available for this slot -> clear (fail-open)
    const mode = (el('assign_mode')?.value || 'auto').toString();
    if(mode === 'single'){
      const u = (el('technician_username_select')?.value || '').trim();
      if(u && !ids.includes(u)){
        el('technician_username_select').value = '';
        if(el('technician_username')) el('technician_username').value = '';
        showToast('สล็อตนี้ไม่มีช่างที่เลือก • เคลียร์ให้แล้ว', 'info');
      }
    }
    if(mode === 'team'){
      const team = getTeamListForAssign();
      const bad = team.filter(u=>u && !ids.includes(u));
      if(bad.length){
        // keep primary if possible, otherwise clear all
        const p = (state.teamPicker.primary||'').trim();
        const keepPrimary = p && ids.includes(p);
        state.teamPicker.selected = new Set(keepPrimary ? [p] : []);
        state.teamPicker.primary = keepPrimary ? p : '';
        getTeamMembersForPayload();
        renderTeamPicker(ids);
        showToast('สล็อตนี้ไม่ว่างครบทีม • รีเซ็ตทีมให้แล้ว', 'info');
      }
    }
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
    technician_username: (()=>{
      const mode = (el('assign_mode')?.value || 'auto').toString();
      if(mode === 'team') return (state.teamPicker.primary || '').trim();
      if(mode === 'single') return (el("technician_username_select")?.value || (el("technician_username")?.value||"")).trim();
      return '';
    })(),
    dispatch_mode: (el("dispatch_mode").value || "forced").trim(),
    items: state.selected_items.map((x) => ({ item_id: x.item_id, qty: x.qty })),
    promotion_id: el("promotion_id").value || null,
    override_price: el("override_price").value || 0,
    override_duration_min: el("override_duration_min").value || 0,
    gps_latitude: (el("gps_latitude")?.value || "").trim() || null,
    gps_longitude: (el("gps_longitude")?.value || "").trim() || null,
    team_members: (()=>{
      const mode = (el('assign_mode')?.value || 'auto').toString();
      return mode === 'team' ? getTeamMembersForPayload() : [];
    })(),
  });

  const services = getServicesPayload();
  if(services) payload.services = services;
  // NOTE: per-line assignment/parallel is intentionally removed from Admin Add (v2 UI)

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
  if(selTech) selTech.addEventListener("change", ()=>{
    if(el("technician_username")) el("technician_username").value = selTech.value||"";
    const mode = (el('assign_mode')?.value || 'auto').toString();
    if(mode === 'team') syncPrimaryFromSelect();
    renderSlots();
  });

  // assign mode
  el('assign_mode')?.addEventListener('change', ()=>{
    updateAssignUIVisibility();
    renderSlots();
  });

  // team picker
  wireTeamPickerEvents();
  updateAssignUIVisibility();
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
