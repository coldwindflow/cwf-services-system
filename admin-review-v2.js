/**
 * Admin Review Queue v2 (matches admin-review-v2.html)
 * - ดูงาน "รอตรวจสอบ/ตีกลับ/ไม่พบช่างรับงาน"
 * - แอดมินแก้ไขข้อมูล + โหลดเวลาว่างจาก availability_v2 + เลือกช่างหลัก/ทีม + dispatch_v2
 * - Production-safe: fail-open, ไม่กระทบ endpoint เดิม
 */

let TECHS = [];
let CURRENT = null;
let CURRENT_SLOTS = [];
let ROW_MAP = new Map();

function $(id){ return document.getElementById(id); }
function safe(s){ return (s==null?'':String(s)); }
function pad2(x){ return String(x).padStart(2,'0'); }

function parseLatLngClient(input){
  const s = String(input||'').trim();
  if(!s) return null;
  let decoded = null;
  try { decoded = decodeURIComponent(s); } catch(e){ decoded = null; }

  // ✅ Prefer precise pin coords from Google Maps: !3dlat!4dlng
  const m3d = s.match(/!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/) ||
              (decoded ? decoded.match(/!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/) : null);
  let lat = null, lng = null;
  if(m3d){ lat = Number(m3d[1]); lng = Number(m3d[2]); }
  else {
    const mq = s.match(/[?&](?:q|query|ll|center)=\s*(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/) ||
               (decoded ? decoded.match(/[?&](?:q|query|ll|center)=\s*(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/) : null);
    if(mq){ lat = Number(mq[1]); lng = Number(mq[2]); }
    else {
      const ma = s.match(/@\s*(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/) ||
                 (decoded ? decoded.match(/@\s*(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/) : null);
      if(ma){ lat = Number(ma[1]); lng = Number(ma[2]); }
    }
  }

  if(lat == null || lng == null) return null;
  if(!Number.isFinite(lat)||!Number.isFinite(lng)) return null;
  if(Math.abs(lat)>90 || Math.abs(lng)>180) return null;
  return {lat,lng};
}


function thDateTime(iso){
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString('th-TH', { timeZone:'Asia/Bangkok', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
}

function toLocalInputDatetime(iso){
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(d);
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
  } catch {
    return "";
  }
}

function localDatetimeToBangkokISO(localValue){
  const s = String(localValue || "").trim();
  if (!s) return "";
  const hasSeconds = /\d{2}:\d{2}:\d{2}$/.test(s);
  const base = hasSeconds ? s : `${s}:00`;
  return `${base}+07:00`;
}

function showToast(msg, type="info"){
  // reuse helper if exists
  if (typeof window.showToast === "function") return window.showToast(msg, type);
  alert(msg);
}

async function loadTechs(){
  try{
    const d = await apiFetch("/admin/technicians");
    TECHS = Array.isArray(d) ? d : (d.rows||d.technicians||[]);
  }catch(e){
    console.warn("[admin-review-v2] loadTechs failed", e);
    TECHS = [];
  }
}

function mapFilterStatus(v){
  const m = {
    pending: "รอตรวจสอบ",
    return: "ตีกลับ",
    noaccept: "ไม่พบช่างรับงาน",
    all: "all",
  };
  return m[v] || "รอตรวจสอบ";
}

async function loadQueue(){
  const f = $("filterStatus")?.value || "pending";
  const status = mapFilterStatus(f);

  $("list").innerHTML = '<div class="card"><div class="muted">กำลังโหลด...</div></div>';

  try{
    const q = new URLSearchParams();
    q.set("status", status);
    q.set("limit", "200");
    const data = await apiFetch(`/admin/review_queue_v2?${q.toString()}`);
    const rows = Array.isArray(data.rows) ? data.rows : [];
    ROW_MAP = new Map(rows.map(r=>[Number(r.job_id), r]));
    $("pillCount").textContent = `${rows.length} งาน`;

    if (!rows.length){
      $("list").innerHTML = '<div class="card"><div class="muted">ไม่มีงานในคิวนี้</div></div>';
      return;
    }

    $("list").innerHTML = rows.map(r=>{
      const badge = `<span class="pill">${safe(r.job_status||"")}</span>`;
      const urgent = (String(r.booking_mode||"").toLowerCase()==="urgent") ? '<span class="pill" style="background:#fee2e2">ด่วน</span>' : '';
      return `
        <div class="card">
          <div class="row">
            <div>
              <b>#${r.job_id} • ${safe(r.booking_code||"")}</b>
              <div class="muted" style="margin-top:2px;">${safe(r.customer_name||"-")} • ${safe(r.customer_phone||"-")}</div>
            </div>
            <div style="text-align:right;display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
              ${badge}${urgent}
              <button class="btn btn-primary" type="button" onclick="openJob(${r.job_id})">เปิด</button>
            </div>
          </div>
          <div class="muted" style="margin-top:8px;">📅 ${thDateTime(r.appointment_datetime)} • 🧾 ${safe(r.job_type||"-")}</div>
          <div class="muted" style="margin-top:4px;">📍 ${safe(r.job_zone||"")} ${safe(r.address_text||"")}</div>
          <div class="muted" style="margin-top:4px;">⏱️ ${Number(r.duration_min||0)} นาที</div>
        </div>
      `;
    }).join("");
  }catch(e){
    console.error(e);
    $("list").innerHTML = `<div class="card"><div class="muted">โหลดไม่สำเร็จ: ${safe(e.message||e)}</div></div>`;
  }
}


// --- Premium Team Picker: chips + search + primary badge ---
const TEAM_STATE = { selected: new Set(), primary: "" };

function setPrimaryInModal(username){
  const u = String(username||"").trim();
  if(!u) return;
  TEAM_STATE.primary = u;
  TEAM_STATE.selected.add(u);
  $("mPrimaryTech").value = u;
  renderTeamPickerModal();
}

function addTeamMemberModal(username){
  const u = String(username||"").trim();
  if(!u) return;
  TEAM_STATE.selected.add(u);
  if(!TEAM_STATE.primary){
    setPrimaryInModal(u);
    return;
  }
  renderTeamPickerModal();
}

function removeTeamMemberModal(username){
  const u = String(username||"").trim();
  if(!u) return;
  if(u === TEAM_STATE.primary) return; // must change primary first
  TEAM_STATE.selected.delete(u);
  renderTeamPickerModal();
}

function getSelectedTeam(){
  // assistants only
  const primary = TEAM_STATE.primary || $("mPrimaryTech").value;
  return Array.from(TEAM_STATE.selected).filter(u=>u && u!==primary);
}

function ensurePrimaryInTeam(){
  const primary = $("mPrimaryTech").value;
  if(!primary) return;
  TEAM_STATE.primary = primary;
  TEAM_STATE.selected.add(primary);
}

function renderTeamPickerModal(){
  const techType = ($("mTechType").value || "company").toLowerCase();
  const group = (TECHS||[]).filter(t => ((t.employment_type||"company").toLowerCase() === techType));

  // primary select
  const primarySel = $("mPrimaryTech");
  const currentPrimary = primarySel.value || CURRENT?.technician_username || "";
  primarySel.innerHTML = '<option value="">-- เลือกช่างหลัก --</option>' + group.map(t=>{
    const name = t.full_name || t.username;
    return `<option value="${t.username}">${safe(name)} (${t.username})</option>`;
  }).join("");
  primarySel.value = currentPrimary;

  // build TEAM_STATE from CURRENT (assistants) + primary
  TEAM_STATE.selected = new Set([...(CURRENT?.team_members||[]).map(String).filter(Boolean)]);
  TEAM_STATE.primary = primarySel.value || "";
  if(TEAM_STATE.primary) TEAM_STATE.selected.add(TEAM_STATE.primary);

  const q = safe($("mTeamSearch").value).toLowerCase();
  const suggestBox = $("mTeamSuggest");
  const selectedBox = $("mTeamSelected");

  const suggestions = group
    .filter(t=>{
      const key = (safe(t.full_name)+safe(t.username)).toLowerCase();
      return (!q || key.includes(q)) && !TEAM_STATE.selected.has(t.username);
    })
    .slice(0, 30);

  suggestBox.innerHTML = suggestions.map(t=>{
    const name = t.full_name || t.username;
    return `<button type="button" class="team-chip team-chip-add" data-u="${t.username}">+ ${safe(name)} (${t.username})</button>`;
  }).join("") || `<div class="team-empty">ไม่พบช่าง</div>`;

  const selected = Array.from(TEAM_STATE.selected).filter(Boolean);
  selected.sort((a,b)=>{
    if(a===TEAM_STATE.primary) return -1;
    if(b===TEAM_STATE.primary) return 1;
    return a.localeCompare(b);
  });

  selectedBox.innerHTML = selected.map(u=>{
    const isPrimary = (u===TEAM_STATE.primary);
    const t = group.find(x=>x.username===u);
    const name = (t?.full_name || u);
    if(isPrimary){
      return `<div class="team-chip team-chip-primary"><span class="team-name">${safe(name)} (${u})</span><span class="team-badge">Primary</span></div>`;
    }
    return `<div class="team-chip"><span class="team-name">${safe(name)} (${u})</span>
      <button type="button" class="team-action" data-act="primary" data-u="${u}">ตั้งเป็นหลัก</button>
      <button type="button" class="team-x" data-act="remove" data-u="${u}">✕</button>
    </div>`;
  }).join("") || `<div class="team-empty">ยังไม่ได้เลือกช่างร่วม</div>`;

  // keep hidden team list in CURRENT for later dispatch
  CURRENT.team_members = getSelectedTeam();
}

// public wrapper called on tech type/search changes
function renderTechPickers(){
  renderTeamPickerModal();
}

function setModal(show){
  $("overlay").classList.toggle("show", !!show);
}

function closeModal(){
  setModal(false);
  CURRENT = null;
  CURRENT_SLOTS = [];
  $("slotBox").style.display = "none";
  $("slotBox").innerHTML = "";
}

window.closeModal = closeModal;

async function openJob(jobId){
  try{
    const row = ROW_MAP.get(Number(jobId));
    if (!row) throw new Error("ไม่พบงาน");

    CURRENT = {
      job_id: row.job_id,
      booking_code: row.booking_code,
      booking_mode: String(row.booking_mode||"scheduled").toLowerCase(),
      job_status: row.job_status,
      job_type: row.job_type,
      duration_min: Number(row.duration_min||0) || 60,
      appointment_datetime: row.appointment_datetime,
      customer_name: row.customer_name,
      customer_phone: row.customer_phone,
      address_text: row.address_text,
      maps_url: row.maps_url,
      customer_note: row.customer_note,
      job_zone: row.job_zone,
      technician_username: row.technician_username || "",
      team_members: [],
    };

    // team
    try{
      const tm = await apiFetch(`/jobs/${CURRENT.job_id}/team?details=0`);
      CURRENT.team_members = Array.isArray(tm.members) ? tm.members : [];
    }catch{ CURRENT.team_members = []; }

    // fill
    $("mTitle").textContent = `ตรวจงาน #${CURRENT.job_id}`;
    $("mSub").textContent = `${safe(CURRENT.booking_code||"")} • สถานะ: ${safe(CURRENT.job_status||"")}`;

    $("mCustomerName").value = safe(CURRENT.customer_name||"");
    $("mCustomerPhone").value = safe(CURRENT.customer_phone||"");
    $("mJobType").value = safe(CURRENT.job_type||"");
    $("mBookingCode").value = safe(CURRENT.booking_code||"");
    $("mAppt").value = toLocalInputDatetime(CURRENT.appointment_datetime);
    $("mAddress").value = safe(CURRENT.address_text||"");
    $("mMaps").value = safe(CURRENT.maps_url||"");
    $("mZone").value = safe(CURRENT.job_zone||"");
    // auto parse lat/lng (fail-open)
    const ll = parseLatLngClient($("mMaps").value) || parseLatLngClient($("mAddress").value);
    if (ll) { $("mLat").value = String(ll.lat); $("mLng").value = String(ll.lng); }

    $("mNote").value = safe(CURRENT.customer_note||"");

    // tech type default: urgent -> partner, else company (admin can change)
    $("mTechType").value = (CURRENT.booking_mode === "urgent") ? "partner" : "company";
    renderTechPickers();

    // pricing
    await loadPricing();

    // slots
    $("slotBox").style.display = "none";
    $("slotBox").innerHTML = "";
    CURRENT_SLOTS = [];

    setModal(true);
  }catch(e){
    console.error(e);
    showToast(e.message||"เปิดงานไม่สำเร็จ","error");
  }
}

window.openJob = openJob;

async function loadPricing(){
  if (!CURRENT) return;
  $("mPricing").textContent = "-";
  try{
    const pr = await apiFetch(`/jobs/${CURRENT.job_id}/pricing`);
    $("mPricing").textContent = `ยอดรวม: ${Number(pr.total||0).toLocaleString("th-TH")} บาท • ส่วนลด: ${Number(pr.discount||0).toLocaleString("th-TH")} บาท`;
  }catch(e){
    $("mPricing").textContent = "โหลดสรุปราคาไม่สำเร็จ";
  }
}

async function saveJob(){
  if (!CURRENT) return;
  const payload = {
    customer_name: $("mCustomerName").value.trim() || null,
    customer_phone: $("mCustomerPhone").value.trim() || null,
    job_type: $("mJobType").value.trim() || null,
    appointment_datetime: $("mAppt").value ? localDatetimeToBangkokISO($("mAppt").value) : null,
    address_text: $("mAddress").value.trim() || null,
    customer_note: $("mNote").value.trim() || null,
    maps_url: $("mMaps").value.trim() || null,
    job_zone: $("mZone").value.trim() || null,
    gps_latitude: $("mLat").value.trim() || null,
    gps_longitude: $("mLng").value.trim() || null,
  };
  try{
    await apiFetch(`/jobs/${CURRENT.job_id}/admin-edit`, { method:"PUT", body: JSON.stringify(payload) });
    showToast("บันทึกใบงานแล้ว","success");
    await loadQueue();
  }catch(e){
    showToast(e.message||"บันทึกไม่สำเร็จ","error");
  }
}

function pickSlot(isoStart){
  if (!CURRENT) return;
  $("mAppt").value = toLocalInputDatetime(isoStart);
  $("slotBox").style.display = "none";
  showToast("เลือกเวลาแล้ว","success");
}

window.pickSlot = pickSlot;

async function loadSlots(){
  if (!CURRENT) return;
  const dtStr = $("mAppt").value;
  if (!dtStr){
    showToast("ต้องเลือกวัน/เวลา ก่อนโหลดคิวว่าง","error");
    return;
  }
  const date = dtStr.slice(0,10);
  const tech_type = $("mTechType").value || "company";
  const duration_min = Number(CURRENT.duration_min||60);

  $("slotBox").style.display = "block";
  $("slotBox").innerHTML = '<div class="muted">กำลังโหลดคิวว่าง...</div>';

  try{
    const q = new URLSearchParams();
    q.set("date", date);
    q.set("tech_type", tech_type);
    q.set("duration_min", String(duration_min));
    const data = await apiFetch(`/public/availability_v2?${q.toString()}`);
    const slots = Array.isArray(data.slots) ? data.slots : [];
    CURRENT_SLOTS = slots;

    if (!slots.length){
      $("slotBox").innerHTML = '<div class="muted">ไม่พบ slot ว่างในวันนี้</div>';
      return;
    }

    $("slotBox").innerHTML = slots.map(s=>{
      const dis = !s.available;
      const iso = `${date}T${s.start}:00`;
      return `
        <div class="slot" style="${dis?'opacity:.5':''}">
          <div>
            <b>${s.start} - ${s.end}</b><br/>
            <small>${dis ? "เต็ม" : `ว่าง • ช่างว่าง ${Array.isArray(s.available_tech_ids)?s.available_tech_ids.length:0} คน`}</small>
          </div>
          <button class="btn btn-ghost" type="button" ${dis?'disabled':''} onclick="pickSlot('${iso}')">เลือก</button>
        </div>
      `;
    }).join("");
  }catch(e){
    console.error(e);
    $("slotBox").innerHTML = `<div class="muted">โหลดคิวว่างไม่สำเร็จ: ${safe(e.message||e)}</div>`;
  }
}

async function dispatchJob(){
  if (!CURRENT) return;

  const tech_type = $("mTechType").value || "company";
  const technician_username = $("mPrimaryTech").value;
  if (!technician_username){
    showToast("ต้องเลือกช่างหลักก่อน","error");
    return;
  }
  ensurePrimaryInTeam();
  const team_members = getSelectedTeam();

  // save appointment edits first
  await saveJob();

  const mode = ($("mDispatchMode").value || "forced").trim();

  try{
    const payload = { technician_username, tech_type, mode, team_members };
    const out = await apiFetch(`/jobs/${CURRENT.job_id}/dispatch_v2`, { method:"POST", body: JSON.stringify(payload) });
    showToast("ยิงงานสำเร็จ","success");
    closeModal();
    await loadQueue();
    if (out && out.offer && out.offer.offer_id) showToast("ส่งเป็นข้อเสนอแล้ว (offer)","info");
  }catch(e){
    console.error(e);
    showToast(e.message||"ยิงงานไม่สำเร็จ","error");
  }
}

async function cancelJob(){
  if (!CURRENT) return;
  if (!confirm("ยืนยันยกเลิกงานนี้?")) return;
  try{
    await apiFetch(`/jobs/${CURRENT.job_id}/cancel`, { method:"POST", body: JSON.stringify({ reason: "admin_cancel" }) });
    showToast("ยกเลิกงานแล้ว","success");
    closeModal();
    await loadQueue();
  }catch(e){
    showToast(e.message||"ยกเลิกไม่สำเร็จ","error");
  }
}

(async function init(){
  await loadTechs();
  await loadQueue();

  // PATCH: เปิดใบงานเต็มหน้า จากหน้าอื่น (?open=job_id)
  try{
    const sp = new URLSearchParams(window.location.search||"");
    const openId = sp.get('open');
    if (openId) {
      // รอให้ queue map พร้อมก่อน
      await new Promise(r=>setTimeout(r, 50));
      await openJob(openId);
    }
  }catch(e){ console.warn('auto open job', e); }

  $("btnReload").addEventListener("click", loadQueue);
  $("filterStatus").addEventListener("change", loadQueue);

  $("btnLoadSlots").addEventListener("click", loadSlots);
  $("btnSave").addEventListener("click", saveJob);
  $("btnDispatch").addEventListener("click", dispatchJob);
  $("btnCancel").addEventListener("click", cancelJob);
  $("btnLoadPricing").addEventListener("click", loadPricing);

  $("mTechType").addEventListener("change", renderTechPickers);
  $("mPrimaryTech").addEventListener("change", ensurePrimaryInTeam);
  $("mTeamSearch").addEventListener("input", renderTechPickers);

  // team picker actions (delegate)
  document.addEventListener("click", (e)=>{
    const addBtn = e.target.closest(".team-chip-add");
    if(addBtn){ addTeamMemberModal(addBtn.getAttribute("data-u")); return; }
    const act = e.target.getAttribute("data-act");
    if(act === "remove"){ removeTeamMemberModal(e.target.getAttribute("data-u")); return; }
    if(act === "primary"){ setPrimaryInModal(e.target.getAttribute("data-u")); return; }
  });

  $("mPrimaryTech").addEventListener("change", ()=>{
    ensurePrimaryInTeam();
    renderTechPickers();
  });


  // team picker actions
  document.addEventListener("click", (e)=>{
    const addBtn = e.target.closest(".team-chip-add");
    if(addBtn){ addTeamMemberModal(addBtn.getAttribute("data-u")); return; }
    const act = e.target.getAttribute("data-act");
    if(act === "remove"){ removeTeamMemberModal(e.target.getAttribute("data-u")); return; }
    if(act === "primary"){ setPrimaryInModal(e.target.getAttribute("data-u")); return; }
  });

  const llUpdate = ()=>{
    const ll = parseLatLngClient($("mMaps").value) || parseLatLngClient($("mAddress").value);
    if(!ll) return;
    $("mLat").value = String(ll.lat);
    $("mLng").value = String(ll.lng);
  };
  $("mMaps").addEventListener("input", llUpdate);
  $("mAddress").addEventListener("input", llUpdate);
})();
