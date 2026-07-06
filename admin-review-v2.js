/**
 * Admin Review Queue v2 (matches admin-review-v2.html)
 * - ดูงาน "รอตรวจสอบ/ตีกลับ/ไม่พบช่างรับงาน"
 * - แอดมินแก้ไขข้อมูล + โหลดเวลาว่างจาก availability_v2 + เลือกช่างหลัก/ทีม + dispatch_v2
 * - Production-safe: fail-open, ไม่กระทบ endpoint เดิม
 */

const ADMIN_REVIEW_V2_DEDUP_BUILD = "20260707_customer_booking_notify_v1";
window.__CWF_ADMIN_REVIEW_V2_VERSION__ = ADMIN_REVIEW_V2_DEDUP_BUILD;

let TECHS = [];
let CURRENT = null;
let CURRENT_SLOTS = [];
let ROW_MAP = new Map();
const REVIEW_POLL_MS = 12000;
const REVIEW_WAITING_STATUS = "\u0e23\u0e2d\u0e0a\u0e48\u0e32\u0e07\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19";
const REVIEW_STATUS_LABELS = {
  waiting_technician: "\u0e01\u0e33\u0e25\u0e31\u0e07\u0e23\u0e2d\u0e0a\u0e48\u0e32\u0e07\u0e23\u0e31\u0e1a",
  pending_review: "\u0e23\u0e2d\u0e15\u0e23\u0e27\u0e08\u0e2a\u0e2d\u0e1a",
  no_accept: "\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e0a\u0e48\u0e32\u0e07\u0e23\u0e31\u0e1a\u0e07\u0e32\u0e19",
  returned: "\u0e15\u0e35\u0e01\u0e25\u0e31\u0e1a",
  time_proposal: "\u0e23\u0e2d\u0e1e\u0e34\u0e08\u0e32\u0e23\u0e13\u0e32\u0e40\u0e27\u0e25\u0e32\u0e43\u0e2b\u0e21\u0e48",
};
const REVIEW_NOTIFY_STORAGE_KEY = "cwf_admin_review_notified_job_ids_v1";
const REVIEW_QUEUE_POLL = { timer: null, stopped: false, authStopped: false };
const REVIEW_QUEUE_NOTIFY = {
  baselineReady: false,
  knownIds: new Set(),
  notifiedIds: new Set(loadNotifiedJobIds()),
  newIds: new Set(),
  audioUnlocked: false,
};

function $(id){ return document.getElementById(id); }
function safe(s){ return (s==null?'':String(s)); }
function pad2(x){ return String(x).padStart(2,'0'); }

function loadNotifiedJobIds(){
  try {
    const raw = sessionStorage.getItem(REVIEW_NOTIFY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
  } catch (_) {
    return [];
  }
}

function saveNotifiedJobIds(){
  try {
    sessionStorage.setItem(REVIEW_NOTIFY_STORAGE_KEY, JSON.stringify(Array.from(REVIEW_QUEUE_NOTIFY.notifiedIds).slice(-500)));
  } catch (_) {}
}

function queueBucket(row){
  const status = safe(row?.job_status);
  const mode = String(row?.booking_mode || "").toLowerCase();
  if (mode === "urgent" && status === REVIEW_WAITING_STATUS) return "waiting_technician";
  if (status === "pending_review" || status === "รอตรวจสอบ") return "pending_review";
  if (status === "ไม่พบช่างรับงาน") return "no_accept";
  if (status === "ตีกลับ") return "returned";
  if (status === "รอพิจารณาเวลาใหม่") return "time_proposal";
  return "pending_review";
}

function isAdminActionAllowed(row){
  if (row && row.admin_action_required === false) return false;
  return queueBucket(row) !== "waiting_technician";
}

function updateTitleBadge(count){
  const baseTitle = "Admin Review Queue - CWF";
  document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;
}

function markAdminInteraction(){
  REVIEW_QUEUE_NOTIFY.audioUnlocked = true;
}

function playNewJobSound(){
  if (!REVIEW_QUEUE_NOTIFY.audioUnlocked) return;
  try {
    const last = Number(window.__CWF_LAST_ADMIN_ALERT_SOUND_AT || 0);
    if (Date.now() - last < 1200) return;
    window.__CWF_LAST_ADMIN_ALERT_SOUND_AT = Date.now();
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      try { osc.stop(); ctx.close(); } catch (_) {}
    }, 140);
  } catch (_) {
    // Autoplay restrictions must not break visual notification.
  }
}

function processQueueNotifications(rows, opts = {}){
  const reason = String(opts.reason || "");
  const ids = (rows || []).map((r) => Number(r.job_id)).filter(Number.isFinite);
  if (!REVIEW_QUEUE_NOTIFY.baselineReady) {
    ids.forEach((id) => REVIEW_QUEUE_NOTIFY.knownIds.add(id));
    REVIEW_QUEUE_NOTIFY.baselineReady = true;
    updateTitleBadge(0);
    return;
  }
  if (reason === "filter_change" || reason === "manual_reload") {
    ids.forEach((id) => REVIEW_QUEUE_NOTIFY.knownIds.add(id));
    return;
  }
  const fresh = ids.filter((id) => !REVIEW_QUEUE_NOTIFY.knownIds.has(id) && !REVIEW_QUEUE_NOTIFY.notifiedIds.has(id));
  ids.forEach((id) => REVIEW_QUEUE_NOTIFY.knownIds.add(id));
  if (!fresh.length) return;
  fresh.forEach((id) => {
    REVIEW_QUEUE_NOTIFY.newIds.add(id);
    REVIEW_QUEUE_NOTIFY.notifiedIds.add(id);
  });
  saveNotifiedJobIds();
  updateTitleBadge(REVIEW_QUEUE_NOTIFY.newIds.size);
  const alertBox = $("approvalAlert");
  if (alertBox) {
    alertBox.style.display = "block";
    alertBox.innerHTML = `🔔 มีงานจองใหม่ ${fresh.length} งาน`;
  }
  playNewJobSound();
}

function stopReviewQueuePolling(){
  if (REVIEW_QUEUE_POLL.timer) {
    clearTimeout(REVIEW_QUEUE_POLL.timer);
    REVIEW_QUEUE_POLL.timer = null;
  }
}

function scheduleReviewQueuePolling(){
  if (REVIEW_QUEUE_POLL.stopped || REVIEW_QUEUE_POLL.authStopped || REVIEW_QUEUE_POLL.timer) return;
  if (document.hidden) return;
  REVIEW_QUEUE_POLL.timer = setTimeout(async () => {
    REVIEW_QUEUE_POLL.timer = null;
    if (!REVIEW_QUEUE_POLL.stopped && !REVIEW_QUEUE_POLL.authStopped && !document.hidden) {
      await loadQueue({ reason:"poll" }).catch((e) => console.warn("[admin-review-v2] poll failed", e));
    }
    scheduleReviewQueuePolling();
  }, REVIEW_POLL_MS);
}

function resumeReviewQueuePolling(reason){
  if (REVIEW_QUEUE_POLL.authStopped) return;
  REVIEW_QUEUE_POLL.stopped = false;
  if (!document.hidden) loadQueue({ force:true, reason }).catch((e) => console.warn("[admin-review-v2] resume reload failed", e));
  scheduleReviewQueuePolling();
}

function stopPollingForAuth(){
  REVIEW_QUEUE_POLL.authStopped = true;
  stopReviewQueuePolling();
  try { if (typeof doLogout === "function") doLogout(); else location.replace("/login.html"); }
  catch (_) { location.href = "/login.html"; }
}

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
    waiting: REVIEW_WAITING_STATUS,
    timeproposal: "รอพิจารณาเวลาใหม่",
    all: "all",
  };
  return m[v] || "all";
}


const REVIEW_QUEUE_LOAD_GUARD = {
  inFlight: null,
  pending: false,
  lastStartAt: 0,
  debounceTimer: null,
};
const REVIEW_QUEUE_MIN_GAP_MS = 900;

async function loadQueue(opts = {}){
  const force = !!(opts && opts.force);
  if (REVIEW_QUEUE_LOAD_GUARD.inFlight) {
    REVIEW_QUEUE_LOAD_GUARD.pending = true;
    return REVIEW_QUEUE_LOAD_GUARD.inFlight;
  }

  const now = Date.now();
  const elapsed = now - REVIEW_QUEUE_LOAD_GUARD.lastStartAt;
  if (!force && REVIEW_QUEUE_LOAD_GUARD.lastStartAt && elapsed < REVIEW_QUEUE_MIN_GAP_MS) {
    clearTimeout(REVIEW_QUEUE_LOAD_GUARD.debounceTimer);
    return new Promise((resolve, reject) => {
      REVIEW_QUEUE_LOAD_GUARD.debounceTimer = setTimeout(() => {
        loadQueue({ force: true, reason: "debounced" }).then(resolve).catch(reject);
      }, Math.max(80, REVIEW_QUEUE_MIN_GAP_MS - elapsed));
    });
  }

  REVIEW_QUEUE_LOAD_GUARD.lastStartAt = now;
  const runLoadQueue = async () => {
  const f = $("filterStatus")?.value || "all";
  const status = mapFilterStatus(f);

  $("list").innerHTML = '<div class="card"><div class="muted">กำลังโหลด...</div></div>';

  try{
    const q = new URLSearchParams();
    q.set("status", status);
    q.set("limit", "200");
    const data = await apiFetch(`/admin/review_queue_v2?${q.toString()}`);
    const rows = Array.isArray(data.rows) ? data.rows : [];
    ROW_MAP = new Map(rows.map(r=>[Number(r.job_id), r]));
    processQueueNotifications(rows, opts);
    $("pillCount").textContent = `${rows.length} งาน`;
    const needs = rows.filter(r => ["รอตรวจสอบ","ตีกลับ","ไม่พบช่างรับงาน","รอพิจารณาเวลาใหม่"].includes(safe(r.job_status)));
    const alertBox = $("approvalAlert");
    if (alertBox) {
      if (needs.length) {
        const pending = needs.filter(r=>safe(r.job_status)==="รอตรวจสอบ").length;
        const noaccept = needs.filter(r=>safe(r.job_status)==="ไม่พบช่างรับงาน" || safe(r.job_status)==="ตีกลับ").length;
        const timep = needs.filter(r=>safe(r.job_status)==="รอพิจารณาเวลาใหม่").length;
        alertBox.style.display = "block";
        alertBox.innerHTML = `🔔 มีงานที่แอดมินต้องจัดการ ${needs.length} งาน` + (pending?` • รอตรวจสอบ ${pending}`:"") + (noaccept?` • ต้องยิงใหม่/ติดต่อ ${noaccept}`:"") + (timep?` • รออนุมัติเวลาใหม่ ${timep}`:"");
      } else {
        alertBox.style.display = "none";
      }
    }

    if (REVIEW_QUEUE_NOTIFY.newIds.size && alertBox) {
      alertBox.style.display = "block";
      alertBox.innerHTML = `🔔 มีงานจองใหม่ ${REVIEW_QUEUE_NOTIFY.newIds.size} งาน`;
    }

    if (!rows.length){
      $("list").innerHTML = '<div class="card"><div class="muted">ไม่มีงานในคิวนี้</div></div>';
      return;
    }

    $("list").innerHTML = rows.map(r=>{
      const badge = `<span class="pill">${safe(r.job_status||"")}</span>`;
      const bucket = queueBucket(r);
      const actionAllowed = isAdminActionAllowed(r);
      const items = Array.isArray(r.items) ? r.items : [];
      const itemSummary = items.length ? items.map((it)=>`${safe(it.item_name || "-")} x${Number(it.qty || 0) || 0}`).join(" • ") : safe(r.job_type || "-");
      const units = Number(r.service_units || 0);
      const reserveTech = safe(r.technician_username || "");
      const isNew = REVIEW_QUEUE_NOTIFY.newIds.has(Number(r.job_id));
      const mapLink = safe(r.maps_url || "");
      const urgent = (String(r.booking_mode||"").toLowerCase()==="urgent") ? '<span class="pill" style="background:#fee2e2">ด่วน</span>' : '';
      const proposalPanel = safe(r.job_status) === "รอพิจารณาเวลาใหม่"
        ? `<div class="proposal-panel" id="proposal-panel-${Number(r.job_id)}">
             <div class="proposal-warning">มีช่างเสนอเวลาใหม่ กรุณาสอบถามลูกค้าและกดยอมรับเวลาที่เหมาะสม</div>
             <div class="muted">กำลังโหลดเวลาที่เสนอ...</div>
           </div>`
        : "";
      return `
        <div class="card review-card-hot ${isNew ? "review-card-new" : ""}">
          <div class="row">
            <div>
              <b>#${r.job_id} • ${safe(r.booking_code||"")}</b>
              <div class="muted" style="margin-top:2px;">${safe(r.customer_name||"-")} • ${safe(r.customer_phone||"-")}</div>
            </div>
            <div style="text-align:right;display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
              ${badge}${urgent}<span class="pill">${safe(REVIEW_STATUS_LABELS[bucket] || bucket)}</span>
              <button class="btn btn-primary" type="button" onclick="openJob(${r.job_id})">เปิด</button>
              <button class="btn" type="button" style="background:linear-gradient(135deg,#2563eb,#06b6d4);color:#fff" ${actionAllowed ? "" : "disabled"} onclick="rebroadcastOfferQuick(${Number(r.job_id)})">📣 ลองยิงใหม่</button>
            </div>
          </div>
          <div class="muted" style="margin-top:8px;">📅 ${thDateTime(r.appointment_datetime)} • 🧾 ${safe(r.job_type||"-")}</div>
          <div class="muted" style="margin-top:4px;">📍 ${safe(r.job_zone||"")} ${safe(r.address_text||"")}</div>
          <div class="muted" style="margin-top:4px;">⏱️ ${Number(r.duration_min||0)} นาที</div>
          <div class="muted" style="margin-top:4px;">บริการ: ${safe(itemSummary)}</div>
          <div class="muted" style="margin-top:4px;">จำนวนเครื่อง: ${Number.isFinite(units) && units > 0 ? units : "-"} • ราคา: ${Number(r.job_price||0).toLocaleString("th-TH")} บาท</div>
          <div class="muted" style="margin-top:4px;">ช่างที่ระบบ reserve: ${reserveTech || "-"}</div>
          ${mapLink ? `<div class="muted" style="margin-top:4px;"><a href="${safe(mapLink)}" target="_blank" rel="noopener">เปิด Maps URL</a></div>` : ""}
          ${bucket === "waiting_technician" ? `<div class="muted" style="margin-top:4px;">กำลังรอช่างรับ (${Number(r.pending_offer_count || 0)} offer ค้าง) • read-only จนกว่าจะหมดรอบหรือมีช่างรับ</div>` : ""}
          ${proposalPanel}
        </div>
      `;
    }).join("");
    loadProposalPanels(rows);
  }catch(e){
    console.error(e);
    if (e && (Number(e.status) === 401 || Number(e.status) === 403)) {
      stopPollingForAuth();
      return;
    }
    $("list").innerHTML = `<div class="card"><div class="muted">โหลดไม่สำเร็จ: ${safe(e.message||e)}</div></div>`;
  }
  };

  REVIEW_QUEUE_LOAD_GUARD.inFlight = runLoadQueue();
  try {
    return await REVIEW_QUEUE_LOAD_GUARD.inFlight;
  } finally {
    REVIEW_QUEUE_LOAD_GUARD.inFlight = null;
    if (REVIEW_QUEUE_LOAD_GUARD.pending) {
      REVIEW_QUEUE_LOAD_GUARD.pending = false;
      clearTimeout(REVIEW_QUEUE_LOAD_GUARD.debounceTimer);
      REVIEW_QUEUE_LOAD_GUARD.debounceTimer = setTimeout(() => {
        loadQueue({ force: true, reason: "pending" }).catch((e) => console.warn("[admin-review-v2] pending reload failed", e));
      }, 120);
    }
  }
}

async function loadProposalPanels(rows){
  const targets = (rows || []).filter(r => safe(r.job_status) === "รอพิจารณาเวลาใหม่");
  for (const r of targets) {
    const box = $(`proposal-panel-${Number(r.job_id)}`);
    if (!box) continue;
    try {
      const data = await apiFetch(`/admin/jobs/${Number(r.job_id)}/time-proposals`);
      const proposals = (Array.isArray(data.rows) ? data.rows : []).filter(p => safe(p.status) === "pending");
      if (!proposals.length) {
        box.innerHTML = `<div class="proposal-warning">มีช่างเสนอเวลาใหม่ กรุณาสอบถามลูกค้าและกดยอมรับเวลาที่เหมาะสม</div><div class="muted">ยังไม่มีข้อเสนอที่รอพิจารณา</div>`;
        continue;
      }
      box.innerHTML = `
        <div class="proposal-warning">มีช่างเสนอเวลาใหม่ กรุณาสอบถามลูกค้าและกดยอมรับเวลาที่เหมาะสม</div>
        ${proposals.map(p => `
          <div class="proposal-item">
            <b>${safe(p.technician_name || p.technician_username || "-")}</b>
            <div class="muted">เวลาใหม่: ${thDateTime(p.proposed_datetime)}</div>
            ${safe(p.note) ? `<div class="muted">หมายเหตุช่าง: ${safe(p.note)}</div>` : ""}
            <div class="proposal-actions">
              <button class="btn btn-primary" type="button" onclick="approveTimeProposal(${Number(p.proposal_id)})">ยอมรับเวลานี้</button>
              <button class="btn btn-danger" type="button" onclick="rejectTimeProposal(${Number(p.proposal_id)})">ปฏิเสธ</button>
            </div>
          </div>
        `).join("")}
      `;
    } catch (e) {
      box.innerHTML = `<div class="proposal-warning">มีช่างเสนอเวลาใหม่ กรุณาสอบถามลูกค้าและกดยอมรับเวลาที่เหมาะสม</div><div class="muted">โหลดข้อเสนอไม่สำเร็จ: ${safe(e.message || e)}</div>`;
    }
  }
}

async function approveTimeProposal(proposalId){
  if (!confirm("ยืนยันอนุมัติเวลาใหม่นี้และมอบหมายงานให้ช่าง?")) return;
  try {
    const r = await apiFetch(`/admin/time-proposals/${Number(proposalId)}/approve`, { method:"POST", body: JSON.stringify({}) });
    showToast(r.message || "อนุมัติเวลาใหม่แล้ว", "success");
    loadQueue();
  } catch(e) {
    showToast(e.message || "อนุมัติเวลาใหม่ไม่สำเร็จ", "error");
  }
}

async function rejectTimeProposal(proposalId){
  const admin_note = prompt("หมายเหตุถึงช่าง/ทีมงาน (ถ้ามี)") || "";
  try {
    const r = await apiFetch(`/admin/time-proposals/${Number(proposalId)}/reject`, { method:"POST", body: JSON.stringify({ admin_note }) });
    showToast(r.message || "ปฏิเสธเวลาใหม่แล้ว", "success");
    loadQueue();
  } catch(e) {
    showToast(e.message || "ปฏิเสธเวลาใหม่ไม่สำเร็จ", "error");
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
  const currentPrimary = CURRENT?.technician_username || primarySel.value || "";
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

function technicianTypeForUsername(username){
  const u = safe(username).trim();
  if(!u) return "";
  const row = (TECHS||[]).find(t => safe(t.username).trim() === u);
  return safe(row?.employment_type || "company").trim().toLowerCase() || "company";
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
      admin_action_required: row.admin_action_required !== false,
    };

    // team
    try{
      const tm = await apiFetch(`/jobs/${CURRENT.job_id}/team?details=0`);
      CURRENT.team_members = Array.isArray(tm.members) ? tm.members : [];
    }catch{ CURRENT.team_members = []; }

    // fill
    $("mTitle").textContent = `ตรวจงาน #${CURRENT.job_id}`;
    $("mSub").textContent = `${safe(CURRENT.booking_code||"")} • สถานะ: ${safe(CURRENT.job_status||"")}${CURRENT.job_status === "รอตรวจสอบ" && CURRENT.technician_username ? ` • ร่างจองช่าง: ${safe(CURRENT.technician_username)}` : ""}`;

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

    // Draft reservations must keep the reserved technician visible/preselected.
    const draftType = technicianTypeForUsername(CURRENT.technician_username);
    $("mTechType").value = draftType || ((CURRENT.booking_mode === "urgent") ? "partner" : "company");
    renderTechPickers();

    // pricing
    await loadPricing();

    // slots
    $("slotBox").style.display = "none";
    $("slotBox").innerHTML = "";
    CURRENT_SLOTS = [];

    const actionAllowed = isAdminActionAllowed(row);
    if ($("btnDispatch")) $("btnDispatch").disabled = !actionAllowed;
    if ($("btnRebroadcast")) $("btnRebroadcast").disabled = !actionAllowed;
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
    if (out && out.offer && out.offer.offer_id) showToast("ส่งเป็นข้อเสนองานแล้ว","info");
  }catch(e){
    console.error(e);
    showToast(e.message||"ยิงงานไม่สำเร็จ","error");
  }
}


async function rebroadcastOfferQuick(jobId){
  const id = Number(jobId || 0);
  if (!id) return showToast("ไม่พบรหัสงาน", "error");
  if (!confirm("ยืนยันยิงข้อเสนอใหม่ให้ช่างที่เปิดรับงาน ว่างจริง และอยู่ในพื้นที่นี้?")) return;
  try{
    const out = await apiFetch(`/jobs/${id}/rebroadcast_offer_v2`, { method:"POST", body: JSON.stringify({ tech_type:"all" }) });
    showToast(out.message || `ส่งข้อเสนอใหม่แล้ว ${Number(out.offers_count||0)} คน`, "success");
    await loadQueue();
  }catch(e){
    console.error(e);
    showToast(e.message || "ยิงข้อเสนอใหม่ไม่สำเร็จ", "error");
  }
}
window.rebroadcastOfferQuick = rebroadcastOfferQuick;

async function rebroadcastOffer(){
  if (!CURRENT) return;
  if (!confirm("ยืนยันยิงข้อเสนอใหม่ให้ช่างที่เปิดรับงาน ว่างจริง และอยู่ในพื้นที่นี้?")) return;
  try{
    await saveJob();
    const tech_type = "all";
    const out = await apiFetch(`/jobs/${CURRENT.job_id}/rebroadcast_offer_v2`, { method:"POST", body: JSON.stringify({ tech_type }) });
    showToast(out.message || `ส่งข้อเสนอใหม่แล้ว ${Number(out.offers_count||0)} คน`, "success");
    closeModal();
    await loadQueue();
  }catch(e){
    console.error(e);
    showToast(e.message || "ยิงข้อเสนอใหม่ไม่สำเร็จ", "error");
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
  await loadQueue({ force:true, reason:"init" });

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

  document.addEventListener("click", markAdminInteraction, { capture:true });
  document.addEventListener("keydown", markAdminInteraction, { capture:true });
  document.addEventListener("touchstart", markAdminInteraction, { capture:true, passive:true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopReviewQueuePolling();
    else resumeReviewQueuePolling("visibilitychange");
  });
  window.addEventListener("focus", () => resumeReviewQueuePolling("focus"));
  window.addEventListener("pageshow", () => resumeReviewQueuePolling("pageshow"));
  window.addEventListener("pagehide", () => {
    REVIEW_QUEUE_POLL.stopped = true;
    stopReviewQueuePolling();
  });
  window.addEventListener("beforeunload", stopReviewQueuePolling);

  $("btnReload").addEventListener("click", () => loadQueue({ force:true, reason:"manual_reload" }));
  $("filterStatus").addEventListener("change", () => loadQueue({ force:true, reason:"filter_change" }));
  scheduleReviewQueuePolling();

  $("btnLoadSlots").addEventListener("click", loadSlots);
  $("btnSave").addEventListener("click", saveJob);
  $("btnDispatch").addEventListener("click", dispatchJob);
  $("btnCancel").addEventListener("click", cancelJob);
  if ($("btnRebroadcast")) $("btnRebroadcast").addEventListener("click", rebroadcastOffer);
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
