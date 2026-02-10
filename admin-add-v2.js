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
  // confirmation summary texts (TH/EN)
  summary_texts: { th: "", en: "", lang: "th" },
};

// =============================
// Debug Panel (admin only)
// Enable via ?debug=1 or localStorage.cwf_debug=1
// =============================
const DEBUG_ENABLED = (() => {
  try {
    const qs = new URLSearchParams(location.search);
    if (qs.get('debug') === '1') {
      localStorage.setItem('cwf_debug', '1');
      return true;
    }
    return localStorage.getItem('cwf_debug') === '1';
  } catch (e) { return false; }
})();

const DBG = {
  lastReq: null,
  lastRes: null,
  intervals: null,
  conflict: null,
};

function maskPII(obj){
  try {
    const j = JSON.parse(JSON.stringify(obj || {}));
    if (j.customer_phone) j.customer_phone = String(j.customer_phone).replace(/\d(?=\d{4})/g, '*');
    if (j.address_text) j.address_text = String(j.address_text).slice(0, 16) + '…';
    if (j.maps_url) j.maps_url = String(j.maps_url).slice(0, 28) + '…';
    return j;
  } catch (e) { return obj; }
}

function dbgRender(){
  if (!DEBUG_ENABLED) return;
  const panel = el('debug_panel');
  if (!panel) return;
  panel.style.display = 'block';
  const hint = el('debug_panel_hint');
  if (hint) hint.textContent = 'on';
  el('dbg_req').textContent = DBG.lastReq ? JSON.stringify(DBG.lastReq, null, 2) : '';
  el('dbg_res').textContent = DBG.lastRes ? JSON.stringify(DBG.lastRes, null, 2) : '';
  el('dbg_intervals').textContent = DBG.intervals ? JSON.stringify(DBG.intervals, null, 2) : '';
  el('dbg_conflict').textContent = DBG.conflict ? JSON.stringify(DBG.conflict, null, 2) : '';
}

function dbgBind(){
  if (!DEBUG_ENABLED) return;
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text || ''); showToast('คัดลอกแล้ว', 'success'); } catch(e){ showToast('คัดลอกไม่สำเร็จ', 'error'); }
  };
  el('dbg_copy_req')?.addEventListener('click', () => copy(el('dbg_req')?.textContent || ''));
  el('dbg_copy_res')?.addEventListener('click', () => copy(el('dbg_res')?.textContent || ''));
  el('dbg_copy_conflict')?.addEventListener('click', () => copy(el('dbg_conflict')?.textContent || ''));
  el('dbg_clear')?.addEventListener('click', () => {
    DBG.lastReq = DBG.lastRes = DBG.intervals = DBG.conflict = null;
    dbgRender();
  });
  dbgRender();
}

function bindDebugToggle(){
  const btn = el('btnToggleDebug');
  if(!btn) return;
  try{
    btn.textContent = DEBUG_ENABLED ? '🧪 Debug: On' : '🧪 Debug: Off';
  }catch(e){}
  btn.addEventListener('click', () => {
    try {
      const qs = new URLSearchParams(location.search);
      if (DEBUG_ENABLED) {
        localStorage.removeItem('cwf_debug');
        qs.delete('debug');
      } else {
        localStorage.setItem('cwf_debug', '1');
        qs.set('debug','1');
      }
      const q = qs.toString();
      location.href = location.pathname + (q ? ('?' + q) : '');
    } catch(e){
      showToast('สลับ Debug ไม่สำเร็จ', 'error');
    }
  });
}

function applyLangButtons({ thBtnId, enBtnId, active }){
  const thBtn = el(thBtnId);
  const enBtn = el(enBtnId);
  if(!thBtn || !enBtn) return;
  const isEN = active === 'en';
  thBtn.classList.toggle('active', !isEN);
  enBtn.classList.toggle('active', isEN);
  thBtn.setAttribute('aria-selected', (!isEN).toString());
  enBtn.setAttribute('aria-selected', (isEN).toString());
}

function setSummaryLang(lang, where){
  const L = (lang === 'en' ? 'en' : 'th');
  state.summary_texts.lang = L;
  const txt = state.summary_texts[L] || state.summary_texts.th || state.summary_texts.en || '';
  if(where === 'modal'){
    if(el('summary_modal_text')) el('summary_modal_text').value = txt;
    applyLangButtons({ thBtnId:'btnLangTHModal', enBtnId:'btnLangENModal', active:L });
    return;
  }
  if(el('summary_text')) el('summary_text').value = txt;
  applyLangButtons({ thBtnId:'btnLangTH', enBtnId:'btnLangEN', active:L });
}

// --- Success Summary Modal (after save) ---
function openSummaryModal({ title, sub }){
  const ov = el('summary_modal_overlay');
  if(!ov) return;
  if(el('summary_modal_title')) el('summary_modal_title').textContent = title || '✅ บันทึกงานสำเร็จ';
  if(el('summary_modal_sub')) el('summary_modal_sub').textContent = sub || 'คัดลอกข้อความยืนยันนัดแล้วส่งให้ลูกค้าได้ทันที';
  // render current language
  setSummaryLang(state.summary_texts.lang || 'th', 'modal');
  ov.style.display = 'flex';
  // prevent background scroll on mobile
  try { document.body.style.overflow = 'hidden'; } catch(e){}
  setTimeout(()=>{
    try { el('btnCopySummaryModal')?.focus(); } catch(e){}
  }, 0);
}

function closeSummaryModal(){
  const ov = el('summary_modal_overlay');
  if(!ov) return;
  ov.style.display = 'none';
  try { document.body.style.overflow = ''; } catch(e){}
}

async function copySummaryFromModal(){
  const txt = el('summary_modal_text')?.value || '';
  if(!txt) return;
  try { await navigator.clipboard.writeText(txt); showToast('คัดลอกแล้ว', 'success'); }
  catch {
    try { el('summary_modal_text').select(); document.execCommand('copy'); showToast('คัดลอกแล้ว', 'success'); }
    catch(e){ showToast('คัดลอกไม่สำเร็จ', 'error'); }
  }
}


// --- PATCH: technician dropdown + team multi-select (backward compatible) ---
state.techs = []; // [{username, full_name, display_name, employment_type, work_start, work_end}]
state.techMap = {}; // username -> tech object
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
    state.techs = rows
      .filter(r => ((r.employment_type||"company").toLowerCase()===ttype))
      .map(r=>({
        username: r.username,
        full_name: r.full_name || "",
        display_name: (r.full_name || r.username || "").toString().trim() || r.username,
        employment_type: (r.employment_type||"company"),
        work_start: r.work_start||"09:00",
        work_end: r.work_end||"18:00",
      }));
    state.techMap = {};
    for(const t of state.techs){ state.techMap[t.username] = t; }
    renderTechSelect();
    renderTeamPicker();
  }catch(e){
    console.warn("[admin-add-v2] loadTechsForType failed", e);
    state.techs = [];
    state.techMap = {};
    renderTechSelect();
    renderTeamPicker();
  }
}

function techDisplay(username){
  const u = String(username||"").trim();
  if(!u) return "";
  const t = (state.techMap && state.techMap[u]) || (state.techs||[]).find(x=>x.username===u);
  return (t && t.display_name) ? t.display_name : u;
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
    o.textContent = (t.display_name || t.full_name || t.username);
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

  // dispatch_mode help only (no checkbox)
  try {
    const dm = (el('dispatch_mode')?.value || 'forced').toString();
    const help2 = el('dispatch_help');
    if(help2) help2.style.opacity = (dm !== 'forced') ? 0.85 : 1;
  } catch(e){}
}

function syncPrimaryFromSelect(){
  const u = (el("technician_username_select")?.value || "").trim();
  state.teamPicker.primary = u;
  if (u) state.teamPicker.selected.add(u);
  renderTeamPicker();
}

// booking_mode (scheduled/urgent) is the single user-facing control.
// dispatch_mode is derived automatically for backward compatibility:
// - scheduled => forced (lock)
// - urgent => offer
function syncDispatchFromBookingModeUI(){
  const bmUI = el('booking_mode_ui');
  const bm = el('booking_mode');
  const dm = el('dispatch_mode');
  if(!bmUI || !bm || !dm) return;
  const v = (bmUI.value || 'scheduled').toString();
  bm.value = v;
  dm.value = (v === 'urgent') ? 'offer' : 'forced';
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
    return `<button type="button" class="team-chip team-chip-add" data-u="${t.username}">+ ${escapeHtml(t.display_name || t.full_name || t.username)}</button>`;
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
          <span class="team-name">${escapeHtml(techDisplay(u))}</span>
          <span class="team-badge">Primary</span>
        </div>`;
    }
    return `
      <div class="team-chip" data-u="${u}" role="button" tabindex="0" title="แตะเพื่อจัดการ">
        <span class="team-name">${escapeHtml(techDisplay(u))}</span>
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
    repair_variant: p.repair_variant,
    // For repair/install, admin can set duration per line (server uses admin_override_duration_min)
    admin_override_duration_min: Math.max(0, Number(p.admin_override_duration_min || 0)),
  };
}

function sameServiceLine(a,b){
  return a && b &&
    String(a.job_type||'')===String(b.job_type||'') &&
    String(a.ac_type||'')===String(b.ac_type||'') &&
    Number(a.btu||0)===Number(b.btu||0) &&
    Number(a.machine_count||0)===Number(b.machine_count||0) &&
    String(a.wash_variant||'')===String(b.wash_variant||'') &&
    String(a.repair_variant||'')===String(b.repair_variant||'') &&
    Number(a.admin_override_duration_min||0)===Number(b.admin_override_duration_min||0);
}

function renderServiceLines(){
  const box = document.getElementById('multi_service_box');
  const list = document.getElementById('service_lines');
  const btnAdd = document.getElementById('btnAddServiceLine');
  const jt = (el('job_type').value||'').trim();

  if(!box || !list || !btnAdd) return;

  // show for all job types (wash/repair/install)
  // - keeps backward compatibility: server already supports payload.services
  // - fixes: ซ่อม/ติดตั้ง ไม่มีปุ่ม “เพิ่มรายการ”
  if(!jt){
    box.style.display = 'none';
    state.service_lines = [];
    btnAdd.style.display = 'none';
    return;
  }
  box.style.display = 'block';
  btnAdd.style.display = 'inline-flex';

  const lines = Array.isArray(state.service_lines) ? state.service_lines : [];
  const rows = lines.map((ln, idx)=>{
    const jt0 = String(ln.job_type||jt||'').trim();
    const base = `${ln.ac_type||'-'} • ${Number(ln.btu||0)} BTU • ${Number(ln.machine_count||1)} เครื่อง`;
    let extra = '';
    if(jt0 === 'ล้าง' && ln.ac_type==='ผนัง') extra = ` • ${ln.wash_variant||'ล้างธรรมดา'}`;
    if(jt0 === 'ซ่อม') extra = ` • ${ln.repair_variant||'-'}`;
    let dur = '';
    if(jt0 === 'ติดตั้ง' || jt0 === 'ซ่อม'){
      const v = Math.max(0, Number(ln.admin_override_duration_min || 0));
      dur = `
        <div class="svc-extra">
          <label class="mini muted2">เวลา (นาที)</label>
          <input class="svc-dur" type="number" min="0" step="1" value="${v}" data-idx="${idx}" placeholder="0 = ใช้ค่าเริ่มต้น">
        </div>
      `;
    }
    const label = `${jt0} • ${base}${extra}`;
    return `<div class="svc-row">
      <div class="svc-main">
        <div class="svc-title"><b>${escapeHtml(label)}</b></div>
        <div class="muted2 mini">รายการบริการหลัก #${idx+1}</div>
      </div>
      ${dur}
      <button type="button" class="svc-del" data-idx="${idx}">ลบ</button>
    </div>`;
  }).join("") || `<div class="muted2">ยังไม่มีรายการบริการเพิ่มเติม • ใช้ค่าด้านบนเป็นรายการหลักได้ หรือกด “เพิ่มรายการ”</div>`;

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

  // bind per-line duration (repair/install)
  list.querySelectorAll('input.svc-dur').forEach(inp=>{
    inp.addEventListener('input', ()=>{
      const i = Number(inp.getAttribute('data-idx'));
      if(!Number.isFinite(i) || !state.service_lines?.[i]) return;
      const n = Math.max(0, Math.floor(Number(inp.value || 0)));
      state.service_lines[i].admin_override_duration_min = n;
      refreshPreviewDebounced();
    });
  });

}

// booking_mode_ui (single visible control) drives both booking_mode and dispatch_mode
function syncBookingAndDispatchModes(){
  const ui = el('booking_mode_ui');
  const hiddenBooking = el('booking_mode');
  const dm = el('dispatch_mode');
  if(!ui || !hiddenBooking || !dm) return;
  const v = (ui.value || 'scheduled').toString();
  hiddenBooking.value = v;
  // derived dispatch_mode: scheduled -> forced (lock), urgent -> offer
  dm.value = (v === 'urgent') ? 'offer' : 'forced';
}

function wireMultiService(){
  const btnAdd = document.getElementById('btnAddServiceLine');
  if(btnAdd){
    btnAdd.addEventListener('click', ()=>{
      const jt = (el('job_type').value||'').trim();
      if(!validateRequiredForPreview()){ showToast('กรอกข้อมูลบริการให้ครบก่อนเพิ่มรายการ', 'error'); return; }
      const ln = buildCurrentServiceLine();
      // default wash variant for wall if empty
      if(ln.job_type === 'ล้าง' && ln.ac_type === 'ผนัง' && !ln.wash_variant) ln.wash_variant = 'ล้างธรรมดา';
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
  if(!jt) return null;
  // include current line + added lines (unique by signature)
  const cur = buildCurrentServiceLine();
  if(cur.job_type==='ล้าง' && cur.ac_type==='ผนัง' && !cur.wash_variant) cur.wash_variant='ล้างธรรมดา';

  const all = [];
  const pushUnique=(ln)=>{
    if(!ln || !ln.job_type || !ln.ac_type || !ln.btu || !ln.machine_count) return;
    if(all.some(x=>sameServiceLine(x,ln))) return;
    const out = { ...ln };
    // ensure numeric
    out.admin_override_duration_min = Math.max(0, Number(out.admin_override_duration_min || 0));
    // Attach wash allocations (per technician) if user assigned workload in selected slot
    try {
      const dm = (el('dispatch_mode')?.value || 'forced').toString();
      const hasSlot = !!state.selected_slot_iso;
      const together = !!el('wash_all_together')?.checked;
      if(dm === 'forced' && hasSlot && !together){
        const k = `${out.ac_type||''}|${Number(out.btu||0)}|${Number(out.machine_count||0)}|${out.wash_variant||''}`;
        const row = state.wash_alloc && state.wash_alloc[k];
        if(row && typeof row === 'object' && Object.keys(row).length){
          out.allocations = row;
        }
      }
    } catch(e){}
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

// Install requires admin-set duration (per line)
if (p.job_type === "ติดตั้ง") {
  if (Number(p.admin_override_duration_min || 0) <= 0) return false;
}

// Repair part replacement can be admin-set duration (optional for other repair variants)
if (p.job_type === "ซ่อม" && p.repair_variant === "ซ่อมเปลี่ยนอะไหล่") {
  if (Number(p.admin_override_duration_min || 0) <= 0) return false;
}

// Validate existing service lines too (repair/install must have duration when required)
try {
  const lines = Array.isArray(state.service_lines) ? state.service_lines : [];
  for (const ln of lines) {
    const jt = String(ln.job_type || '').trim();
    if (!jt) continue;
    const dur = Number(ln.admin_override_duration_min || 0);
    if (jt === 'ติดตั้ง' && dur <= 0) return false;
    if (jt === 'ซ่อม' && String(ln.repair_variant || '').trim() === 'ซ่อมเปลี่ยนอะไหล่' && dur <= 0) return false;
  }
} catch(e){}
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
    const dispatchMode = (el('dispatch_mode')?.value || 'forced').toString();
    // No UI toggle: forced is implied by dispatch_mode=forced (lock)
    const forced = (dispatchMode === 'forced');
    const qs = new URLSearchParams({
      date,
      tech_type,
      duration_min: String(duration_min),
    });

    // Team preview ONLY (do not change hard collision rules).
    // Backend will ignore crew_size unless preview_team=1 & assign_mode=team.
    try {
      const am = (el('assign_mode')?.value || 'auto').toString();
      const techs = getConstraintTechs();
      if (am === 'team' && Array.isArray(techs) && techs.length >= 2) {
        qs.set('assign_mode', 'team');
        qs.set('preview_team', '1');
        qs.set('crew_size', String(Math.min(10, techs.length)));
      }
    } catch(e){}

    if (forced) qs.set('forced','1');

    if (DEBUG_ENABLED) qs.set('debug','1');
    if (DEBUG_ENABLED) {
      DBG.lastReq = maskPII({ endpoint: '/public/availability_v2', query: Object.fromEntries(qs.entries()) });
      DBG.conflict = null;
      DBG.intervals = null;
      DBG.lastRes = null;
      dbgRender();
    }
    const r = await apiFetch(`/public/availability_v2?${qs.toString()}`);

    if (DEBUG_ENABLED) {
      DBG.lastRes = r;
      DBG.intervals = r && r.debug ? r.debug : null;
      dbgRender();
    }
    state.available_slots = Array.isArray(r.slots) ? r.slots : [];
    state.slots_loaded = true;
    state.selected_slot_iso = "";
    // After loading slots, allow picking tech/team (user requirement)
    renderTechSelect(null);
    renderTeamPicker(null);
    updateAssignUIVisibility();
    renderSlots();
  } catch (e) {
    if (DEBUG_ENABLED) {
      DBG.lastRes = e.data || { error: e.message, status: e.status };
      DBG.conflict = (e.data && e.data.conflict) ? e.data.conflict : null;
      dbgRender();
    }
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

// =============================
// Wash workload assignment (split machine counts per technician)
// - UI only; persisted in split_assignments_json and sent to /admin/book_v2
// - Safe default: if not assigned, system treats as "ทำร่วมกันทั้งหมด" (no split)
// =============================

function getWorkloadTechs(){
  // Workload assignment is for lock mode only (forced). Offer flow should not show this.
  const dm = (el('dispatch_mode')?.value || 'forced').toString();
  if(dm !== 'forced') return [];
  return getConstraintTechs();
}

function getWashServicesForAssignment(){
  const jt = (el('job_type')?.value || '').trim();
  if(jt !== 'ล้าง') return [];
  const services = getServicesPayload();
  if(Array.isArray(services) && services.length) return services;
  // fallback single service line
  const p = getPayloadV2();
  return [{ job_type: p.job_type, ac_type: p.ac_type, btu: p.btu, machine_count: p.machine_count, wash_variant: p.wash_variant }];
}

function serviceKey(s){
  return `${s.ac_type||''}|${Number(s.btu||0)}|${Number(s.machine_count||0)}|${s.wash_variant||''}`;
}

function ensureDefaultAllocations(){
  state.wash_alloc = state.wash_alloc || {}; // { [serviceKey]: { [tech]: qty } }
  const techs = getWorkloadTechs();
  const primary = (state.teamPicker.primary || '').trim();
  const services = getWashServicesForAssignment();
  for(const s of services){
    const k = serviceKey(s);
    if(!state.wash_alloc[k]) state.wash_alloc[k] = {};
    const row = state.wash_alloc[k];
    // clean unknown techs
    for(const t of Object.keys(row)) if(!techs.includes(t)) delete row[t];
    // default: put all qty to primary (team) or the only tech (single)
    const total = Math.max(0, Number(s.machine_count||0));
    const hasAny = Object.values(row).some(v=>Number(v)>0);
    if(!hasAny && techs.length){
      const target = primary && techs.includes(primary) ? primary : techs[0];
      row[target] = total;
    }
  }
}

function buildSplitAssignmentsPayload(){
  const techs = getWorkloadTechs();
  const services = getWashServicesForAssignment();
  const out = [];
  if(!techs.length || !services.length) return out;
  const alloc = state.wash_alloc || {};

  for(const t of techs){
    const a = [];
    for(const s of services){
      const k = serviceKey(s);
      const qty = Math.max(0, Number(alloc?.[k]?.[t] || 0));
      if(qty <= 0) continue;
      a.push({
        job_type: 'ล้าง',
        ac_type: s.ac_type,
        btu: Number(s.btu||0),
        wash_variant: s.wash_variant || '',
        qty
      });
    }
    if(a.length) out.push({ technician_username: t, allocations: a });
  }
  return out;
}

function renderWashAssign(){
  const card = el('wash_assign_card');
  const table = el('wash_assign_table');
  const sub = el('wash_assign_sub');
  const tog = el('wash_all_together');
  const hidden = el('split_assignments_json');
  if(!card || !table || !sub || !tog || !hidden) return;

  const dm = (el('dispatch_mode')?.value || 'forced').toString();
  const jt = (el('job_type')?.value || '').trim();
  const techs = getWorkloadTechs();
  const services = getWashServicesForAssignment();
  const hasSlot = !!state.selected_slot_iso;

  if(dm !== 'forced' || jt !== 'ล้าง' || !hasSlot || !techs.length || !services.length){
    card.style.display = 'none';
    hidden.value = '';
    return;
  }

  card.style.display = 'block';

  const together = !!tog.checked;
  if(together){
    table.innerHTML = `<div class="muted2 mini">โหมดทำร่วมกัน: ทีมช่างจะถูกบล็อกเวลาร่วมกันตามเวลารวมของใบงาน (ไม่แบ่งจำนวนเครื่อง)</div>`;
    hidden.value = '';
    sub.textContent = `${state.selected_slot_iso.slice(0,10)} • ${state.selected_slot_iso.slice(11,16)} • ทีม ${techs.map(techDisplay).join(', ')}`;
    return;
  }

  ensureDefaultAllocations();

  // Premium assignment UI: tap into a modal per service line (supports many technicians)
  const head = `
    <div class="assign-help">แตะ “กำหนดช่าง” ในแต่ละรายการเพื่อแบ่งจำนวนเครื่องต่อช่าง • รวมต่อรายการต้องเท่ากับจำนวนเครื่อง</div>
  `;
  let html = head;
  html += `<div class="assign-grid">`;

  for(const s of services){
    const labelMain = `${s.ac_type||'-'} • ${Number(s.btu||0)} BTU`;
    const labelSub = `${Number(s.machine_count||0)} เครื่อง` + (s.ac_type==='ผนัง' ? ` • ${s.wash_variant||'ล้างธรรมดา'}` : '');
    const k = serviceKey(s);
    const row = state.wash_alloc[k] || {};
    const total = Math.max(0, Number(s.machine_count||0));
    const curSum = techs.reduce((sum,t)=>sum+Math.max(0,Number(row[t]||0)),0);
    const ok = curSum === total;

    const parts = techs
      .map(t=>{
        const v = Math.max(0, Number(row[t]||0));
        if(!v) return '';
        return `<span class="assign-chip">${escapeHtml(techDisplay(t))} <b>${v}</b></span>`;
      })
      .filter(Boolean)
      .join('');

    html += `
      <div class="assign-item">
        <div class="assign-item-head">
          <div class="assign-item-title">
            <div class="t1">${escapeHtml(labelMain)}</div>
            <div class="t2">${escapeHtml(labelSub)}</div>
          </div>
          <div class="assign-badge ${ok ? 'ok' : 'bad'}">${curSum}/${total}</div>
        </div>

        <div class="assign-summary">
          ${parts || `<span class="muted2 mini">ยังไม่ได้กำหนดช่างในรายการนี้</span>`}
        </div>

        <div class="assign-actions">
          <button type="button" class="btn-yellow btn-assign-open" data-skey="${escapeHtml(k)}">กำหนดช่าง</button>
          <div class="assign-foot ${ok ? 'ok' : 'bad'}">
            ${ok ? '✅ รวมครบตามจำนวนเครื่อง' : '⚠️ จำนวนรวมยังไม่ครบ/เกิน กรุณากำหนดให้เท่ากับจำนวนเครื่อง'}
          </div>
        </div>
      </div>
    `;
  }

  html += `</div>`;
  table.innerHTML = html;

  table.querySelectorAll('.btn-assign-open').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const k = btn.getAttribute('data-skey') || '';
      try { openAssignModal(k); } catch(e){}
    });
  });

  const payload = buildSplitAssignmentsPayload();

  hidden.value = payload.length ? JSON.stringify(payload) : '';
  sub.textContent = `${state.selected_slot_iso.slice(0,10)} • ${state.selected_slot_iso.slice(11,16)} • ทีม ${techs.map(techDisplay).join(', ')}`;
}


/** Assignment modal (per service line) **/
function ensureAssignModal(){
  if(el('assign_modal_backdrop')) return;
  const bd = document.createElement('div');
  bd.id = 'assign_modal_backdrop';
  bd.className = 'cwf-modal-backdrop hidden';
  bd.innerHTML = `
    <div class="cwf-modal" role="dialog" aria-modal="true" aria-label="กำหนดงานให้ช่าง">
      <div class="cwf-modal-head">
        <div class="cwf-modal-title">กำหนดงานให้ช่าง</div>
        <button type="button" class="cwf-modal-close" id="assign_modal_close" aria-label="ปิด">✕</button>
      </div>
      <div class="cwf-modal-body" id="assign_modal_body"></div>
      <div class="cwf-modal-foot">
        <button type="button" class="secondary" id="assign_modal_cancel">ปิด</button>
        <button type="button" class="btn-yellow" id="assign_modal_done">บันทึก</button>
      </div>
    </div>
  `;
  document.body.appendChild(bd);

  const close = ()=>{
    bd.classList.add('hidden');
    state.assign_modal_skey = '';
    try { renderWashAssign(); } catch(e){}
  };

  bd.addEventListener('click', (ev)=>{
    if(ev.target === bd) close();
  });
  el('assign_modal_close')?.addEventListener('click', close);
  el('assign_modal_cancel')?.addEventListener('click', close);
  el('assign_modal_done')?.addEventListener('click', close);
}

function getServiceByKey(skey){
  const services = getWashServicesForAssignment();
  for(const s of services){
    if(serviceKey(s) === skey) return s;
  }
  return null;
}

function clampInt(n){ return Math.max(0, Math.floor(Number(n||0))); }

function setAlloc(skey, tech, n){
  state.wash_alloc = state.wash_alloc || {};
  if(!state.wash_alloc[skey]) state.wash_alloc[skey] = {};
  state.wash_alloc[skey][tech] = clampInt(n);
}

function renderAssignModal(){
  const skey = (state.assign_modal_skey || '').toString();
  const s = getServiceByKey(skey);
  const techs = getWorkloadTechs();
  const body = el('assign_modal_body');
  if(!body) return;
  if(!s){
    body.innerHTML = `<div class="muted2">ไม่พบรายการ</div>`;
    return;
  }

  const row = (state.wash_alloc && state.wash_alloc[skey]) ? state.wash_alloc[skey] : {};
  const total = Math.max(0, Number(s.machine_count||0));
  const curSum = techs.reduce((sum,t)=>sum+clampInt(row[t]||0),0);
  const ok = curSum === total;

  const titleMain = `${s.ac_type||'-'} • ${Number(s.btu||0)} BTU`;
  const titleSub = `${total} เครื่อง` + (s.ac_type==='ผนัง' ? ` • ${s.wash_variant||'ล้างธรรมดา'}` : '');

  body.innerHTML = `
    <div class="assign-modal-top">
      <div class="assign-modal-title">
        <div class="t1">${escapeHtml(titleMain)}</div>
        <div class="t2">${escapeHtml(titleSub)}</div>
      </div>
      <div class="assign-badge ${ok ? 'ok' : 'bad'}">${curSum}/${total}</div>
    </div>

    <div class="assign-modal-hint ${ok ? 'ok' : 'bad'}">
      ${ok ? '✅ รวมครบตามจำนวนเครื่อง' : '⚠️ จำนวนรวมยังไม่ครบ/เกิน กรุณาปรับให้เท่ากับจำนวนเครื่อง'}
    </div>

    <div class="assign-modal-list">
      ${techs.map(t=>{
        const v = clampInt(row[t]||0);
        return `
          <div class="assign-modal-row" data-skey="${escapeHtml(skey)}" data-tech="${escapeHtml(t)}">
            <div class="assign-modal-name">${escapeHtml(techDisplay(t))}</div>
            <div class="assign-modal-stepper">
              <button type="button" class="step-mini" data-step="-1" aria-label="ลด">−</button>
              <input class="step-mini-input" type="number" min="0" step="1" value="${v}" inputmode="numeric" />
              <button type="button" class="step-mini" data-step="1" aria-label="เพิ่ม">+</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <div class="muted2 mini" style="margin-top:10px">
      * แนะนำ: ปรับจำนวนให้ครบแล้วกด “บันทึก” เพื่อปิดหน้าต่าง
    </div>
  `;

  body.querySelectorAll('.assign-modal-row').forEach(rowEl=>{
    const tech = rowEl.getAttribute('data-tech') || '';
    const inp = rowEl.querySelector('input.step-mini-input');
    rowEl.querySelectorAll('button.step-mini').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const delta = Number(btn.getAttribute('data-step')||0);
        const next = clampInt(clampInt(inp?.value) + delta);
        if(inp) inp.value = String(next);
        setAlloc(skey, tech, next);
        renderAssignModal();
      });
    });
    inp?.addEventListener('input', ()=>{
      setAlloc(skey, tech, clampInt(inp.value));
      renderAssignModal();
    });
  });
}

function openAssignModal(skey){
  ensureDefaultAllocations();
  ensureAssignModal();
  state.assign_modal_skey = skey;
  const bd = el('assign_modal_backdrop');
  if(bd) bd.classList.remove('hidden');
  renderAssignModal();
}


function renderSlots() {
  const box = el("slots_box");
  if (!box) return;
  box.innerHTML = "";
  const slotsAll = Array.isArray(state.available_slots) ? state.available_slots.filter(Boolean) : [];
  // If no slots returned (e.g. duration too long), still allow admin to create a special slot.
  if (!slotsAll.length) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="muted2" style="margin-bottom:10px">
        ไม่พบสล็อตที่รองรับเวลางานนี้ • คุณยังสามารถสร้าง <b>สลอตพิเศษ</b> หรือเพิ่มเวลาอัตโนมัติได้
      </div>
      <div class="grid2" style="margin-top:8px">
        <button type="button" class="secondary" id="btnSpecialSlotEmpty">+ เพิ่มสลอตพิเศษ</button>
        <button type="button" class="secondary" id="btnAutoSlotEmpty">+ เพิ่มเวลาอัตโนมัติ (ตามเวลางาน)</button>
      </div>
      <div class="muted2 mini" style="margin-top:8px">* ระบบจะเพิ่มสลอตให้ช่าง 1 คนก่อน (เลือกช่างได้) แล้วค่อยโหลดคิวใหม่</div>
    
      ${DEBUG_ENABLED && DBG.intervals && Array.isArray(DBG.intervals.reasons) && DBG.intervals.reasons.length ? `
      <div class="muted2 mini" style="margin-top:10px">เหตุผล (debug):</div>
      <ul class="muted2 mini" style="margin-top:6px;padding-left:18px">
        ${DBG.intervals.reasons.map(r=>`<li><b>${String(r.code||'')}</b>: ${String(r.message||'')}</li>`).join('')}
      </ul>
      ` : '' }
`;
    box.appendChild(wrap);
    setTimeout(() => {
      const b1 = el('btnSpecialSlotEmpty');
      const b2 = el('btnAutoSlotEmpty');
      if(b1) b1.addEventListener('click', (ev)=>{ ev.preventDefault(); try{ addSpecialSlotV2({ autoEnd:false }); }catch(e){} });
      if(b2) b2.addEventListener('click', (ev)=>{ ev.preventDefault(); try{ addSpecialSlotV2({ autoEnd:true }); }catch(e){} });
    }, 0);
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
      ${constraintTechs.length ? `<div class="muted2 mini" style="margin-top:2px">ต้องว่างพร้อมกัน: <b>${constraintTechs.map(techDisplay).join(", ")}</b></div>` : `<div class="muted2 mini" style="margin-top:2px">ยังไม่เลือกช่าง • แสดงสล็อตที่มีอย่างน้อย 1 ช่างว่าง</div>`}
    </div>
    <div class="badge ${slotsSelectable.length ? 'ok' : 'muted'}">${slotsSelectable.length ? 'ว่าง' : 'เต็ม'} • ${slotsSelectable.length}/${slotsAll.length} ช่วง</div>
  `;
  box.appendChild(legend);

  const grid = document.createElement("div");
  grid.className = "slot-grid";
  const renderAll = constraintTechs.length > 0;
  const listToRender = renderAll ? slotsAll : slotsSelectable;

  // Helpers (front-end): support selecting any start time inside a returned range slot
  const hhmmToMin = (hhmm)=>{
    const m = String(hhmm||'').trim().match(/^(\d\d):(\d\d)$/);
    if(!m) return NaN;
    return Number(m[1])*60 + Number(m[2]);
  };
  const selectedHHMM = (()=>{
    const iso = String(state.selected_slot_iso||'');
    const t = iso.slice(11,16);
    return /^(\d\d):(\d\d)$/.test(t) ? t : '';
  })();
  const selectedMin = selectedHHMM ? hhmmToMin(selectedHHMM) : NaN;

  for (const s of listToRender) {
    const btn = document.createElement("button");
    btn.type = "button";
    const techCount = Array.isArray(s.available_tech_ids) ? s.available_tech_ids.length : 0;
    const selectable = slotsSelectable.includes(s);

    // Mark selected if the currently chosen start time is inside this slot range.
    // Backward compatible: if slot is a single time, this still works.
    let isSelected = false;
    try{
      const a = hhmmToMin(s.start);
      const b = hhmmToMin(s.end);
      if(Number.isFinite(selectedMin) && Number.isFinite(a) && Number.isFinite(b)){
        isSelected = (selectedMin >= a && selectedMin <= b);
      }
    }catch(e){}

    btn.className = `slot-btn ${selectable ? '' : 'full'} ${isSelected ? 'selected':''}`;
    btn.innerHTML = `<div class="slot-time">${s.start} - ${s.end}</div><div class="slot-sub">${selectable ? `ว่าง • ${techCount} ช่าง` : 'เต็ม'}</div>`;
    btn.disabled = !selectable;
    btn.addEventListener("click", () => {
      // Default to the earliest time in this range, but allow fine-pick inside modal.
      selectSlot(s.start, s);
      try { openSlotModal(s); } catch(e){ console.warn('openSlotModal failed', e); }
    });
    grid.appendChild(btn);
  }
  // Special slot card inside the grid (not a top button)
  const sp = document.createElement("button");
  sp.type = "button";
  sp.className = "slot-btn special";
  sp.innerHTML = `<div class="slot-time">+ สลอตพิเศษ</div><div class="slot-sub">กำหนดเวลาเอง</div>`;
  sp.addEventListener("click", (ev) => { ev.preventDefault(); try{ addSpecialSlotV2(); }catch(e){ console.warn('addSpecialSlotV2 failed', e); } });
  grid.appendChild(sp);

  box.appendChild(grid);
}

function selectSlot(startHHMM, slotOverride){
  const date = el("appt_date")?.value;
  if(!date) return;
  const iso = `${date}T${startHHMM}:00`;
  state.selected_slot_iso = iso;
  const dtEl = el("appointment_datetime");
  if(dtEl) dtEl.value = iso;

  // Update technician selector allowlist based on selected slot
  const slots = (state.available_slots||[]).filter(Boolean);
  const hhmmToMin = (hhmm)=>{
    const m = String(hhmm||'').trim().match(/^(\d\d):(\d\d)$/);
    if(!m) return NaN;
    return Number(m[1])*60 + Number(m[2]);
  };
  const v = hhmmToMin(startHHMM);
  let s = slotOverride || slots.find(x=>x && x.start===startHHMM);
  if(!s && Number.isFinite(v)){
    // If API returns range blocks, find the block that contains this chosen start.
    s = slots.find(x=>{
      try{
        const a = hhmmToMin(x.start);
        const b = hhmmToMin(x.end);
        return Number.isFinite(a) && Number.isFinite(b) && v >= a && v <= b;
      }catch(e){ return false; }
    });
  }
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
  try { renderWashAssign(); } catch(e){}
  try { updateAssignSummary(); } catch(e){}

}

// =============================
// Slot Quick Pick Modal (tap slot -> choose technician)
// =============================
let _slotModalSlot = null;

function closeSlotModal(){
  const ov = el('slot_modal_overlay');
  if(ov) ov.style.display = 'none';
  _slotModalSlot = null;
}

function updateAssignSummary(){
  const t = el('assign_summary_text');
  if(!t) return;
  const dm = (el('dispatch_mode')?.value || 'forced').toString();
  if(dm === 'offer'){
    t.textContent = 'โหมดข้อเสนอ • ระบบจะยิงไปช่างที่ว่างและเปิดรับงาน';
    return;
  }
  const mode = (el('assign_mode')?.value || 'auto').toString();
  if(mode === 'team'){
    const primary = (state.teamPicker.primary || '').trim();
    const members = Array.from(state.teamPicker.selected || []);
    const count = members.length;
    t.textContent = primary
      ? `ทีม • ช่างหลัก: ${techDisplay(primary)} • ทีมรวม ${count} คน`
      : `ทีม • ยังไม่เลือกช่างหลัก • ทีมรวม ${count} คน`;
    return;
  }
  if(mode === 'single'){
    const u = (el('technician_username_select')?.value || el('technician_username')?.value || '').trim();
    t.textContent = u ? `เลือกเดี่ยว • ${techDisplay(u)}` : 'เลือกเดี่ยว • ยังไม่ได้เลือกช่าง (ระบบจะเลือกช่างว่างให้)';
    return;
  }
  t.textContent = 'ยังไม่ได้เลือกช่าง • ระบบจะเลือกช่างว่างให้';
}



function openSlotModal(slot){
  const ov = el('slot_modal_overlay');
  const title = el('slot_modal_title');
  const sub = el('slot_modal_sub');
  const body = el('slot_modal_body');
  if(!ov || !sub || !body) return;
  _slotModalSlot = slot;

  // Helpers: allow picking any start time inside a slot range (no fixed step UI)
  const hhmmToMin = (hhmm)=>{
    const m = String(hhmm||'').trim().match(/^(\d\d):(\d\d)$/);
    if(!m) return NaN;
    return Number(m[1])*60 + Number(m[2]);
  };
  const clampHHMM = (hhmm, minHHMM, maxHHMM)=>{
    const v = hhmmToMin(hhmm);
    const a = hhmmToMin(minHHMM);
    const b = hhmmToMin(maxHHMM);
    if(!Number.isFinite(v) || !Number.isFinite(a) || !Number.isFinite(b)) return minHHMM;
    if(v < a) return minHHMM;
    if(v > b) return maxHHMM;
    return hhmm;
  };

  const slotStart = String(slot?.start||'').trim();
  const slotEnd = String(slot?.end||'').trim();
  let picked = '';
  try{
    const iso = String(state.selected_slot_iso||'');
    const t = iso.slice(11,16);
    if(/^(\d\d):(\d\d)$/.test(t)) picked = t;
  }catch(e){}
  if(!picked) picked = slotStart;
  picked = clampHHMM(picked, slotStart, slotEnd);
  // Ensure state reflects the picked time immediately (so downstream UI stays consistent)
  try{ selectSlot(picked, slot); }catch(e){}

  const date = el('appt_date')?.value || '';
  const ids = Array.isArray(slot?.available_tech_ids) ? slot.available_tech_ids : [];
  const dispatchMode = (el('dispatch_mode')?.value || 'forced').toString();

  if(title) title.textContent = 'เลือกช่างในสล็อตนี้';
  sub.textContent = `${date} • เริ่ม ${picked} (ช่วง ${slotStart} - ${slotEnd}) • ว่าง ${ids.length} ช่าง`;

  // Offer mode: choose time only (no manual technician picking)
  if(dispatchMode === 'offer'){
    body.innerHTML = `
      <div class="card-lite" style="padding:12px;border-radius:16px;margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
          <div>
            <b style="color:#0b1b3a">เวลาเริ่มงาน</b>
            <div class="muted2 mini" style="margin-top:4px">เลือกได้ภายใน ${slotStart}–${slotEnd}</div>
          </div>
          <input type="time" id="slotm_time" value="${picked}" min="${slotStart}" max="${slotEnd}" step="60"
            style="padding:10px;border-radius:12px;border:1px solid rgba(0,0,0,0.15);min-width:120px" />
        </div>
      </div>
      <div class="card-lite" style="padding:12px;border-radius:16px">
        <b style="color:#0b1b3a">โหมดข้อเสนอ (offer)</b>
        <div class="muted2 mini" style="margin-top:6px">
          ระบบจะยิงข้อเสนอไปให้ช่างที่ “ว่างและเปิดรับงาน” • ไม่ต้องเลือกช่างเอง
        </div>
      </div>
      <div style="margin-top:12px">
        <button type="button" class="secondary" id="slotm_confirm_offer" style="width:100%">ใช้เวลานี้</button>
      </div>
    `;
    // If debug enabled, show reasons from backend in the empty-state UI
    try{
      const reasons = (DBG && DBG.intervals && Array.isArray(DBG.intervals.reasons)) ? DBG.intervals.reasons : [];
      if (DEBUG_ENABLED && reasons.length) {
        const reasonDiv = document.createElement('div');
        reasonDiv.className = 'muted2 mini';
        reasonDiv.style.marginTop = '10px';
        reasonDiv.innerHTML = '<b>เหตุผล (Debug)</b>:<br>' + reasons.map(r=>`• ${String(r.code||'')}: ${String(r.message||'')}`).join('<br>');
        wrap.appendChild(reasonDiv);
      }
    }catch(e){}
    setTimeout(()=>{
      const t = body.querySelector('#slotm_time');
      if(t){
        t.addEventListener('change', ()=>{
          const v = clampHHMM(t.value, slotStart, slotEnd);
          t.value = v;
          try{ selectSlot(v, slot); }catch(e){}
          sub.textContent = `${date} • เริ่ม ${v} (ช่วง ${slotStart} - ${slotEnd}) • ว่าง ${ids.length} ช่าง`;
        });
      }
      const btn = body.querySelector('#slotm_confirm_offer');
      if(btn) btn.addEventListener('click', ()=>{
        try{
          const v = clampHHMM((body.querySelector('#slotm_time')?.value||picked), slotStart, slotEnd);
          selectSlot(v, slot);
        }catch(e){}
        updateAssignSummary();
        closeSlotModal();
      });
    },0);
    ov.style.display = 'flex';
    return;
  }

  // Forced mode: pick auto/single/team inside modal
  const renderBody = ()=>{
    const mode = (el('assign_mode')?.value || 'auto').toString();

    const timeSeg = `
      <div class="card-lite" style="padding:12px;border-radius:16px;margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
          <div>
            <b style="color:#0b1b3a">เวลาเริ่มงาน</b>
            <div class="muted2 mini" style="margin-top:4px">เลือกได้ภายใน ${slotStart}–${slotEnd}</div>
          </div>
          <input type="time" id="slotm_time" value="${clampHHMM((String(state.selected_slot_iso||'').slice(11,16)||picked), slotStart, slotEnd)}" min="${slotStart}" max="${slotEnd}" step="60"
            style="padding:10px;border-radius:12px;border:1px solid rgba(0,0,0,0.15);min-width:120px" />
        </div>
      </div>
    `;

    const modeSeg = `
      <div class="seg" style="margin-bottom:10px">
        <button type="button" class="team-btn ${mode==='auto'?'active':''}" data-mode="auto">ระบบเลือกช่าง</button>
        <button type="button" class="team-btn ${mode==='single'?'active':''}" data-mode="single">เลือกเดี่ยว</button>
        <button type="button" class="team-btn ${mode==='team'?'active':''}" data-mode="team">ทีม</button>
      </div>
      <div class="muted2 mini" style="margin-top:-2px;margin-bottom:10px">
        * เลือกโหมดและช่างได้ทันทีในหน้าต่างนี้
      </div>
    `;

    if(!ids.length){
      body.innerHTML = timeSeg + modeSeg + `<div class="muted2">สล็อตนี้ไม่มีช่างว่าง</div>`;
      bindModeButtons();
      bindTimePicker();
      return;
    }

    if(mode === 'team'){
      const primary = (state.teamPicker.primary || '').trim();
      const selected = new Set(Array.from(state.teamPicker.selected || []));
      body.innerHTML = timeSeg + modeSeg + `
        <div class="grid2">
          <div>
            <label>ช่างหลัก (Primary)</label>
            <select id="slotm_primary" class="grow"></select>
            <div class="muted2 mini" style="margin-top:6px">เลือกช่างหลักในสล็อตนี้</div>
          </div>
          <div>
            <label>ช่างร่วม</label>
            <div id="slotm_team" style="display:flex;flex-wrap:wrap;gap:8px"></div>
            <div class="muted2 mini" style="margin-top:6px">แตะเพื่อเลือก/ยกเลิกช่างร่วม</div>
          </div>
        </div>
      `;
      const selEl = body.querySelector('#slotm_primary');
      // Primary should be chosen only from "selected co-tech" to avoid confusion
      const selectedArr = Array.from(selected);
      if(primary && !selectedArr.includes(primary)){
        state.teamPicker.primary = '';
      }
      selEl.innerHTML = `<option value="">-- เลือกช่างหลัก (จากช่างร่วมที่เลือก) --</option>` +
        selectedArr.map(u=>`<option value="${escapeHtml(u)}">${escapeHtml(techDisplay(u))}</option>`).join('');
      if(state.teamPicker.primary && selectedArr.includes(state.teamPicker.primary)) selEl.value = state.teamPicker.primary;

      const wrap = body.querySelector('#slotm_team');
      for(const u of ids){
        const b = document.createElement('button');
        b.type = 'button';
        const active = selected.has(u);
        b.className = `chip ${active ? 'active' : ''}`;
        b.textContent = techDisplay(u);
        b.addEventListener('click', ()=>{
          if(selected.has(u)) selected.delete(u); else selected.add(u);
          state.teamPicker.selected = new Set(Array.from(selected));
          // keep hidden fields synced
          el('assign_mode').value = 'team';
          getTeamMembersForPayload();
          renderSlots();
          try { renderWashAssign(); } catch(e){}
          updateAssignSummary();
          renderBody();
        });
        wrap.appendChild(b);
      }

      selEl.addEventListener('change', ()=>{
        const p = (selEl.value||'').trim();
        state.teamPicker.primary = p;
        if(p) selected.add(p);
        state.teamPicker.selected = new Set(Array.from(selected));
        // sync legacy primary field for payload (username)
        const leg = el('technician_username_select');
        if(leg) leg.value = p;
        const hid = el('technician_username');
        if(hid) hid.value = p;
        el('assign_mode').value = 'team';
        getTeamMembersForPayload();
        renderTeamPicker(ids);
        renderSlots();
        try { renderWashAssign(); } catch(e){}
        updateAssignSummary();
        renderBody();
      });

      bindModeButtons();
      bindTimePicker();
      return;
    }

    // auto or single
    const cur = (el('technician_username_select')?.value || '').trim();
    body.innerHTML = timeSeg + modeSeg + `
      <label>ช่าง (ว่างในสล็อตนี้)</label>
      <select id="slotm_single" class="grow"></select>
      <div class="muted2 mini" style="margin-top:6px">เลือกช่าง = โหมด “เลือกเดี่ยว” • ไม่เลือก = ระบบเลือกช่างว่าง</div>
    `;
    const selEl = body.querySelector('#slotm_single');
    // value MUST be username (stable id) — label shows real name from technician profile
    selEl.innerHTML = `<option value="">-- ไม่เลือก (ระบบเลือกช่างว่าง) --</option>` + ids.map(u=>`<option value="${escapeHtml(u)}">${escapeHtml(techDisplay(u))}</option>`).join('');
    if(cur && ids.includes(cur)) selEl.value = cur;

    selEl.addEventListener('change', ()=>{
      const v = (selEl.value||'').trim();
      if(!v){
        el('assign_mode').value = 'auto';
        if(el('technician_username_select')) el('technician_username_select').value = '';
        if(el('technician_username')) el('technician_username').value = '';
        renderSlots();
        try { renderWashAssign(); } catch(e){}
        updateAssignSummary();
        return;
      }
      el('assign_mode').value = 'single';
      enableAssignControls(true);
      renderTechSelect(ids);
      if(el('technician_username_select')) el('technician_username_select').value = v;
      if(el('technician_username')) el('technician_username').value = v;
      renderSlots();
      try { renderWashAssign(); } catch(e){}
      updateAssignSummary();
    });

    bindModeButtons();
    bindTimePicker();
  };

  // Bind time picker (used in forced mode body)
  const bindTimePicker = ()=>{
    const t = body.querySelector('#slotm_time');
    if(!t) return;
    t.addEventListener('change', ()=>{
      const v = clampHHMM(t.value, slotStart, slotEnd);
      t.value = v;
      try{ selectSlot(v, slot); }catch(e){}
      sub.textContent = `${date} • เริ่ม ${v} (ช่วง ${slotStart} - ${slotEnd}) • ว่าง ${ids.length} ช่าง`;
      try { renderWashAssign(); } catch(e){}
      try { updateAssignSummary(); } catch(e){}
    });
  };

  const bindModeButtons = ()=>{
    body.querySelectorAll('button[data-mode]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const m = btn.getAttribute('data-mode');
        if(!m) return;
        el('assign_mode').value = m;
        // clear selections when switching
        if(m !== 'single'){
          if(el('technician_username_select')) el('technician_username_select').value = '';
          if(el('technician_username')) el('technician_username').value = '';
        }
        if(m !== 'team'){
          state.teamPicker.selected = new Set([]);
          state.teamPicker.primary = '';
          getTeamMembersForPayload();
        }
        renderSlots();
        try { renderWashAssign(); } catch(e){}
        updateAssignSummary();
        renderBody();
      });
    });
  };

  renderBody();
  ov.style.display = 'flex';
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
    assign_mode: (function(){
      const m = (el('assign_mode')?.value || 'auto').toString();
      const techVal = (el("technician_username_select")?.value || (el("technician_username")?.value||"" )).trim();
      if(m === 'single' && !techVal) return 'auto';
      if(m === 'team') return 'team';
      if(m === 'auto') return 'auto';
      return m;
    })(),
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
    // wash split assignment (optional, lock mode only)
    split_assignments: (()=>{
      try {
        const dm = (el('dispatch_mode')?.value || 'forced').toString();
        if(dm !== 'forced') return null;
        const raw = (el('split_assignments_json')?.value || '').trim();
        if(!raw) return null;
        const j = JSON.parse(raw);
        return Array.isArray(j) ? j : null;
      } catch(e){ return null; }
    })(),
  });

  const services = getServicesPayload();
  if(services) payload.services = services;
  // NOTE: split_assignments is optional and backward compatible


  // Client-side guard (UX): single mode requires technician. If missing, auto-fallback already applied above.
  const amNow = (payload.assign_mode || 'auto').toString();
  if (amNow === 'single' && !(payload.technician_username || '').trim()) {
    showToast('โหมดเดี่ยวต้องเลือกช่างก่อนบันทึก', 'error');
    el("btnSubmit").disabled = false;
    return;
  }

  try {
    el("btnSubmit").disabled = true;
    if (DEBUG_ENABLED) {
      DBG.lastReq = maskPII({ endpoint: '/admin/book_v2', payload: payload });
      DBG.conflict = null;
      // keep DBG.lastRes/intervals from last availability call
      dbgRender();
    }
    const r = await apiFetch("/admin/book_v2", { method: "POST", body: JSON.stringify(payload) });
    if (DEBUG_ENABLED) {
      DBG.lastRes = r;
      dbgRender();
    }
    showToast(`บันทึกงานสำเร็จ: ${r.booking_code}`, "success");
    try {
      // Load both languages (fail-open). EN is optional and backward compatible.
      const [sTH, sEN] = await Promise.all([
        apiFetch(`/jobs/${r.job_id}/summary`),
        apiFetch(`/jobs/${r.job_id}/summary?lang=en`).catch(()=>null),
      ]);
      const thText = (sTH && sTH.text) ? String(sTH.text) : '';
      const enText = (sEN && sEN.text) ? String(sEN.text) : '';
      if (thText || enText) {
        state.summary_texts.th = thText;
        state.summary_texts.en = enText;
        state.summary_texts.lang = 'th';

        el('summary_card').style.display = 'block';
        setSummaryLang('th', 'card');

        // Show modal for premium UX + avoid overflow / hidden copy button
        openSummaryModal({
          title: `✅ บันทึกงานสำเร็จ (#${r.booking_code || r.job_id || ''})`,
          sub: 'คัดลอกข้อความยืนยันนัด แล้วส่งให้ลูกค้าได้ทันที',
        });
      }
    } catch (e) {
      console.warn('summary load fail', e);
    }
    // reset minimal
    state.selected_slot_iso = "";
    el("technician_username").value = "";
  } catch (e) {
    if (DEBUG_ENABLED) {
      DBG.lastRes = e?.data || { error: e?.message || 'error' };
      if (e?.status === 409) {
        DBG.conflict = e?.data?.conflict || e?.data || null;
      }
      dbgRender();
    }
    showToast(e.message || "บันทึกไม่สำเร็จ", "error");
  } finally {
    el("btnSubmit").disabled = false;
  }
}

function wireEvents() {
  const updateOverrideDurationLabel = ()=>{
    const lab = el('override_duration_label');
    if(!lab) return;
    const jt = (el('job_type')?.value || '').trim();
    const rv = (document.getElementById('repair_variant')?.value || '').trim();
    if(jt === 'ติดตั้ง'){
      lab.textContent = 'เวลารายการนี้ (นาที) *จำเป็นสำหรับงานติดตั้ง';
      return;
    }
    if(jt === 'ซ่อม'){
      if(rv === 'ซ่อมเปลี่ยนอะไหล่') lab.textContent = 'เวลารายการนี้ (นาที) *จำเป็นสำหรับซ่อมเปลี่ยนอะไหล่';
      else lab.textContent = 'เวลารายการนี้ (นาที) (ไม่ใส่ = 60 นาทีโดยประมาณ)';
      return;
    }
    lab.textContent = 'Override เวลา (นาที)';
  };

  // build variant when job type changes
  el("job_type").addEventListener("change", () => {
    buildVariantUI();
    renderServiceLines();
    updateOverrideDurationLabel();
    refreshPreviewDebounced();
    // attach listeners for dynamic selects
    setTimeout(() => {
      const w = document.getElementById("wash_variant");
      const r = document.getElementById("repair_variant");
      if (w) w.addEventListener("change", refreshPreviewDebounced);
      if (r) r.addEventListener("change", () => { updateOverrideDurationLabel(); refreshPreviewDebounced(); });
    }, 0);
  });

  ["btu","machine_count"].forEach((id) => el(id).addEventListener("change", refreshPreviewDebounced));
  el("ac_type").addEventListener("change", ()=>{ buildVariantUI(); renderServiceLines(); refreshPreviewDebounced(); setTimeout(()=>{ const w=document.getElementById("wash_variant"); if(w) w.addEventListener("change", refreshPreviewDebounced); },0); });
  el("machine_count").addEventListener("input", refreshPreviewDebounced);
  el("override_price").addEventListener("input", () => updateTotalPreview());
  el("override_duration_min").addEventListener("input", refreshPreviewDebounced);

  // Slot modal
  try {
    const closeBtn = el('slot_modal_close');
    if(closeBtn) closeBtn.addEventListener('click', closeSlotModal);
    const ov = el('slot_modal_overlay');
    if(ov) ov.addEventListener('click', (ev)=>{ if(ev.target === ov) closeSlotModal(); });
  } catch(e){}

  // Success summary modal
  try {
    const c1 = el('btnCloseSummaryModal');
    if(c1) c1.addEventListener('click', closeSummaryModal);
    const c2 = el('btnCopySummaryModal');
    if(c2) c2.addEventListener('click', copySummaryFromModal);
    const ov2 = el('summary_modal_overlay');
    if(ov2) ov2.addEventListener('click', (ev)=>{ if(ev.target === ov2) closeSummaryModal(); });
    document.addEventListener('keydown', (ev)=>{
      if(ev.key === 'Escape') closeSummaryModal();
    });
  } catch(e){}

  // Summary language toggles (card + modal)
  try {
    el('btnLangTH')?.addEventListener('click', ()=> setSummaryLang('th','card'));
    el('btnLangEN')?.addEventListener('click', ()=>{
      if(!state.summary_texts.en){ showToast('English version not available', 'error'); return; }
      setSummaryLang('en','card');
    });
    el('btnLangTHModal')?.addEventListener('click', ()=> setSummaryLang('th','modal'));
    el('btnLangENModal')?.addEventListener('click', ()=>{
      if(!state.summary_texts.en){ showToast('English version not available', 'error'); return; }
      setSummaryLang('en','modal');
    });
  } catch(e){}
  el("promotion_id").addEventListener("change", () => updateTotalPreview());
  const btnEx = el("btnAddExtra"); if(btnEx) btnEx.addEventListener("click", addExtra);
  el("appt_date").addEventListener("change", loadAvailability);
  el("tech_type").addEventListener("change", async ()=>{ await loadTechsForType(); await loadAvailability(); });
  // booking_mode_ui is the only user-facing mode control.
  const bmUI = el('booking_mode_ui');
  if(bmUI){
    bmUI.addEventListener('change', async ()=>{
      syncDispatchFromBookingModeUI();
      // refresh availability if already loaded
      if(state.slots_loaded) await loadAvailability();
    });
  }
  // ensure hidden booking_mode/dispatch_mode are in sync on first load
  syncDispatchFromBookingModeUI();

  // initial label
  try { updateOverrideDurationLabel(); } catch(e){}

  const dmEl = el('dispatch_mode');
  if(dmEl) dmEl.addEventListener('change', async ()=>{ updateAssignUIVisibility(); if(state.slots_loaded) await loadAvailability(); });
  const btnSlots = el("btnLoadSlots"); if(btnSlots) btnSlots.addEventListener("click", loadAvailability);
  const btnAssign = el('btnScrollAssign');
  if(btnAssign) btnAssign.addEventListener('click', ()=>{
    // ensure UI is up to date then scroll into view
    try { renderWashAssign(); } catch(e){}
    const card = el('wash_assign_card');
    if(card){
      card.style.display = (card.style.display==='none' ? 'block' : card.style.display);
      card.scrollIntoView({ behavior:'smooth', block:'start' });
      // offset for fixed bottom nav/header spacing
      setTimeout(()=>{ try { window.scrollBy(0, -12); } catch(e){} }, 350);
    }
  });
  const togTogether = el('wash_all_together');
  if(togTogether) togTogether.addEventListener('change', ()=>{ try { renderWashAssign(); } catch(e){} });

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
    try { renderWashAssign(); } catch(e){}
  });

  // assign mode
  el('assign_mode')?.addEventListener('change', ()=>{
    updateAssignUIVisibility();
    renderSlots();
    try { renderWashAssign(); } catch(e){}
  });

  // team picker
  wireTeamPickerEvents();
  updateAssignUIVisibility();
  el("btnSubmit").addEventListener("click", submitBooking);
}

function _addMinutesToHHMM(hhmm, minutes){
  const m = String(hhmm||"").trim().match(/^(\d{1,2}):(\d{2})$/);
  if(!m) return null;
  let h = Number(m[1]);
  let mm = Number(m[2]);
  if(!Number.isFinite(h)||!Number.isFinite(mm)) return null;
  const total = h*60 + mm + Math.max(0, Number(minutes||0));
  const h2 = Math.floor(total/60);
  const m2 = total % 60;
  const pad = (n)=>String(n).padStart(2,'0');
  return `${pad(h2)}:${pad(m2)}`;
}

function _pickUsernameForSpecialSlot(){
  // Prefer current team selection, otherwise fall back to loaded tech list (company/partner)
  try{
    const team = getTeamListForAssign();
    const p = (state.teamPicker?.primary || '').trim();
    if(p) return p;
    if(team && team.length) return String(team[0]||'').trim();
  }catch(e){}

  const techs = Array.isArray(state.techs) ? state.techs.filter(t=>t && t.username) : [];
  if(!techs.length) return null;

  const top = techs.slice(0, 12);
  const lines = top.map((t,i)=>`${i+1}) ${t.display_name || t.full_name || t.username} (${t.username})`).join("\n");
  const pick = prompt(`เลือกช่างสำหรับสลอตพิเศษ (พิมพ์เลข)\n\n${lines}\n\nหรือพิมพ์ username ตรงๆ`, "1");
  if(!pick) return null;
  const n = Number(pick);
  if(Number.isFinite(n) && n >= 1 && n <= top.length) return String(top[n-1].username).trim();
  return String(pick).trim();
}

async function addSpecialSlotV2(opts = {}){
  try {
    const date = (el("appt_date")?.value || todayYMD()).trim();
    const username = _pickUsernameForSpecialSlot();
    if(!username){ showToast("ยังไม่มีรายชื่อช่างให้เพิ่มสลอต", "error"); return; }

    const st = prompt(`เพิ่มสลอตพิเศษ\nช่าง: ${username}\nวันที่: ${date}\n\nใส่เวลาเริ่ม (HH:MM)`, "18:00");
    if(!st) return;

    let en = null;
    const autoEnd = !!opts.autoEnd;
    if(autoEnd){
      // Use effective block (duration + buffer) and round up to 30-minute step.
      const block = Math.max(30, Number(state.effective_block_min || state.duration_min || 0));
      const rounded = Math.ceil(block / 30) * 30;
      en = _addMinutesToHHMM(st.trim(), rounded);
      if(!en){ showToast("เวลาเริ่มไม่ถูกต้อง", "error"); return; }

      // Guard: do not allow auto-generated end time beyond 24:00.
      // If the workload is too long for a day, ask admin to use Team mode / reduce workload.
      try{
        const m = String(en).match(/^(\d{1,2}):(\d{2})$/);
        if(m){
          const hh = Number(m[1]);
          const mm = Number(m[2]);
          if(hh > 24 || (hh === 24 && mm > 0)) {
            en = '24:00';
            showToast('เวลางานยาวมาก (เกิน 24:00) • แนะนำเลือกโหมดทีม/เพิ่มช่าง แล้วโหลดคิวใหม่', 'info');
          }
        }
      }catch(e){}
    } else {
      en = prompt(`ใส่เวลาสิ้นสุด (HH:MM)\nช่าง: ${username}\nวันที่: ${date}`, "19:00");
      if(!en) return;
      en = en.trim();
    }

    await apiFetch(`/admin/technicians/${encodeURIComponent(username)}/special_slots_v2`, {
      method: "POST",
      body: JSON.stringify({ date, start_time: st.trim(), end_time: en })
    });
    showToast("เพิ่มสลอตพิเศษแล้ว", "success");
    await loadAvailability();
  } catch (e) {
    showToast(e.message || "เพิ่มสลอตพิเศษไม่สำเร็จ", "error");
  }
}

async function init() {
  bindDebugToggle();
  dbgBind();
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
  // Ensure dynamic labels (repair/install duration label) are correct on first load
  try { el("job_type").dispatchEvent(new Event("change")); } catch(e) {}
  refreshPreviewDebounced();
}

document.addEventListener("DOMContentLoaded", init);
