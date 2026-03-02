

// ✅ งานปัจจุบัน: งานล่วงหน้า (sub-tab)
const activeUpcomingJobsEl = document.getElementById("active-upcoming-list");

// ✅ ฟิลเตอร์ประวัติงาน (วัน/เดือน/ทั้งหมด)
const historyTabDayEl = document.getElementById("tab-his-day");
const historyTabMonthEl = document.getElementById("tab-his-month");
const historyTabAllEl = document.getElementById("tab-his-all");
const historyFilterHintEl = document.getElementById("history-filter-hint");
// =======================================
// 🔧 CONFIG
// =======================================
// ใช้ origin เดียวกับเว็บที่เปิดอยู่ (เสถียรสุด ไม่ต้องแก้ IP)
const API_BASE = window.location.origin;

// =======================================
// 📦 DOM (ต้องตรงกับ tech.html)
// =======================================
const offerList = document.getElementById("offer-list");

// ✅ ใช้ id ให้ตรงกับ tech.html
const activeJobsEl =
  document.getElementById("active-list") || document.getElementById("active-jobs");
const historyJobsEl =
  document.getElementById("history-list") || document.getElementById("history-jobs");

// ✅ โปรไฟล์
const meEl = document.getElementById("me");
const profileNameEl = document.getElementById("profile-name");
const profileGradeEl = document.getElementById("profile-grade");
const profilePhotoEl = document.getElementById("profile-photo");
const ratingEl = document.getElementById("rating");
const doneCountEl = document.getElementById("doneCount");
const profileCodeEl = document.getElementById("profile-code");
const profilePositionEl = document.getElementById("profile-position");
const profileRankBadgeEl = document.getElementById("profile-rank-badge");
const profileRankLabelEl = document.getElementById("profile-rank-label");
const profileHintEl = document.getElementById("profile-hint");

// ✅ รายได้ (Technician)
const incomeDailyEl = document.getElementById("incomeDaily");
const incomeMonthEl = document.getElementById("incomeMonth");
const incomeAllEl = document.getElementById("incomeAll");

// ✅ รายได้หน้าใหม่ (แท็บรายได้)
const incomeDaily2El = document.getElementById("incomeDaily2");
const incomeMonth2El = document.getElementById("incomeMonth2");
const incomeAll2El = document.getElementById("incomeAll2");
const techPayoutPeriodsEl = document.getElementById('techPayoutPeriods');
const techPayoutLinesEl = document.getElementById('techPayoutLines');
const techPayoutDetailHintEl = document.getElementById('techPayoutDetailHint');
const techPayoutTotalPillEl = document.getElementById('techPayoutTotalPill');
const btnReloadIncomePeriodsEl = document.getElementById('btnReloadIncomePeriods');

// ✅ แถบควบคุมช่าง (dropdown)
const acceptStatusSelect = document.getElementById("acceptStatusSelect");
const zoneSelect = document.getElementById("zoneSelect");


// =======================================
// 🔐 AUTH CHECK + RESTORE (localStorage / cookie fallback)
// =======================================
function getCookie(name){
  try{
    return document.cookie.split(";").map(s=>s.trim()).find(s=>s.startsWith(name+"="))?.split("=").slice(1).join("=") || "";
  }catch{ return ""; }
}
function restoreAuthFromCookie(){
  try{
    if (localStorage.getItem("username") && localStorage.getItem("role")) return;
    const raw = getCookie("cwf_auth");
    if (!raw) return;
    const obj = JSON.parse(decodeURIComponent(escape(atob(raw))));
    if (!obj || !obj.u || !obj.r) return;
    if (obj.exp && Date.now() > Number(obj.exp)) return; // expired
    localStorage.setItem("username", obj.u);
    localStorage.setItem("role", obj.r);
  }catch{}
}
restoreAuthFromCookie();

const username = localStorage.getItem("username");
const role = localStorage.getItem("role");

if (!username || !role) {
  location.href = "/login.html";
}

// =======================================
// 🎨 THEME (Theme 2/3/4)
// - theme-2: ของเดิม (ห้ามแตะ)
// - theme-3: เหลือง #FFFD01 ชัด + ไล่น้ำเงิน ~70% + Header Glossy
// - theme-4: พรีเมี่ยม (โทนทอง/น้ำเงินเข้ม)
// หมายเหตุ: ใช้ class ที่ <body> เพื่อไม่ไปกระทบส่วนอื่น
// =======================================

const THEME_KEY = "cwf_theme";
const themeToggleBtn = document.getElementById("themeToggleBtn");

// ✅ วน 2 -> 3 -> 4 -> 2 (ตามที่คุย: Theme 2 ไม่แตะ, เพิ่ม 3/4)
const THEMES = [2, 3, 4];

function applyTheme(themeNo) {
  const n = Number(themeNo) || 2;
  // ลบทุก theme class ก่อน เพื่อกันซ้อน
  document.body.classList.remove("theme-1", "theme-2", "theme-3", "theme-4");
  document.body.classList.add(`theme-${n}`);
  localStorage.setItem(THEME_KEY, String(n));
}

// ✅ init theme (ค่าเริ่มต้น = 2)
applyTheme(localStorage.getItem(THEME_KEY) || 2);

// ✅ ปุ่มสลับธีม (ไอคอน)
if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    const current = Number(localStorage.getItem(THEME_KEY) || 2);
    const idx = THEMES.indexOf(current);
    const next = THEMES[(idx + 1 + THEMES.length) % THEMES.length];
    applyTheme(next);
  });
}


// =======================================
// 🔔 NOTIFY + SOUND (งานเข้า / เตือนก่อนถึงเวลานัด 30 นาที)
// - เป้าหมาย: ใช้งานจริงบนมือถือ/PWA โดยไม่ต้องเพิ่มไฟล์เสียง
// - วิธี: เล่นเสียง beep แบบ WebAudio + Notification (ถ้าอนุญาต)
// =======================================

const notifyBtn = document.getElementById("notifyBtn");
const LS_NOTIFY_KEY = "cwf_notify_enabled"; // '1' = เปิด
const LS_LAST_OFFER_KEY = "cwf_last_offer_ids"; // เก็บ offer_id ล่าสุด (กันเด้งซ้ำ)
const LS_REMIND_KEY = "cwf_remind_30m"; // เก็บ job_id+เวลา ที่เตือนไปแล้ว

function isNotifyEnabled() {
  return localStorage.getItem(LS_NOTIFY_KEY) === "1";
}

function setNotifyEnabled(v) {
  localStorage.setItem(LS_NOTIFY_KEY, v ? "1" : "0");
  if (notifyBtn) notifyBtn.style.opacity = v ? "1" : "0.45";
}

// ✅ เสียง beep สั้น ๆ (ไม่ต้องใช้ไฟล์)
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.05;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close().catch(() => {});
    }, 220);
  } catch (e) {
    // เงียบไว้ (บางเครื่องบล็อคเสียงถ้าไม่มี user gesture)
  }
}

function showNotify(title, body) {
  if (!isNotifyEnabled()) return;
  playBeep();

  // ✅ Notification (ถ้าอนุญาต)
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body });
    }
  } catch {
    // ignore
  }
}

async function requestNotifyPermission() {
  // ต้องกดปุ่มเองบนมือถือ (user gesture)
  if (!("Notification" in window)) {
    alert("อุปกรณ์นี้ไม่รองรับ Notification แต่ยังมีเสียงเตือนได้");
    return;
  }

  const p = await Notification.requestPermission();
  if (p === "granted") {
    setNotifyEnabled(true);
    showNotify("CWF แจ้งเตือนพร้อมใช้งาน", "จะมีเสียงเตือนเมื่อมีงานเข้า และเตือนก่อนถึงเวลานัด 30 นาที");
  } else {
    setNotifyEnabled(false);
    alert("ยังไม่ได้อนุญาตการแจ้งเตือน (แต่ยังเปิดเสียงเตือนได้)");
  }
}

// init
setNotifyEnabled(isNotifyEnabled());
if (notifyBtn) {
  notifyBtn.addEventListener("click", async () => {
    // toggle + ขอ permission
    if (!isNotifyEnabled()) {
      setNotifyEnabled(true);
      await requestNotifyPermission();
    } else {
      setNotifyEnabled(false);
      alert("ปิดแจ้งเตือนแล้ว");
    }
  });
}

// =======================================
// 🕘 TECH CONTROLS (สถานะรับงาน + โซนรับงาน) — "เอาที่เดียวจบ"
// - รองรับทั้ง UI แบบปุ่ม (ใหม่) และ dropdown (เก่า) เพื่อไม่พัง
// - ❗ สำคัญ: ห้ามค้าง "กำลังโหลด..." → ถ้าโหลดไม่ได้ก็ยังให้กดได้
// =======================================

const acceptToggleBtn = document.getElementById("acceptToggleBtn");
const acceptStatusText = document.getElementById("acceptStatusText");

// ✅ เก็บสถานะล่าสุดไว้ในเครื่อง (กันโหลดไม่ได้/กัน SW แคชพัง)
const LS_ACCEPT_KEY = "cwf_accept_status";

// ✅ แปลงสถานะให้ชัวร์
function normalizeAcceptStatus(st) {
  const v = String(st || "ready").toLowerCase();
  return (v === "paused") ? "paused" : "ready";
}

// ✅ อัปเดต UI ปุ่ม/ข้อความ (ไม่ผูกกับ API)
function renderAcceptUI(status, updatedAtText, note) {
  const st = normalizeAcceptStatus(status);

  // dropdown เก่า (ซ่อนไว้ แต่คงค่าไว้เพื่อ compatibility)
  if (acceptStatusSelect) acceptStatusSelect.value = st;

  // ปุ่มใหม่
  if (acceptToggleBtn) {
    acceptToggleBtn.dataset.status = st;
    acceptToggleBtn.classList.remove("ready", "paused");
    acceptToggleBtn.classList.add(st);

    // ทำให้ "กว้างเท่ากัน" ตลอด โดยไม่เปลี่ยน padding/ขนาด
    acceptToggleBtn.innerHTML = (st === "paused")
      ? "🔴 หยุดรับงาน"
      : "🟢 รับงาน";
  }

  // ข้อความสถานะด้านล่าง (ให้เห็นชัด)
  if (acceptStatusText) {
    acceptStatusText.textContent =
      (st === "paused" ? "⛔ ไม่ได้รับงานอยู่" : "✅ กำลังรับงานอยู่")
      + (updatedAtText ? ` · อัปเดต: ${updatedAtText}` : "")
      + (note ? ` · ${note}` : "");
  }

  // att-status เก่า (ซ่อน) เผื่อโค้ดอื่นอ่านค่า
  const oldBox = document.getElementById("att-status");
  if (oldBox) oldBox.textContent = (st === "paused") ? "paused" : "ready";
}

// ✅ โหลดสถานะจาก Server (แต่ไม่ให้ค้าง)
async function loadAcceptStatusSafe() {
  // แสดงสถานะจาก localStorage ก่อน (เร็ว และกันค้าง)
  const cached = normalizeAcceptStatus(localStorage.getItem(LS_ACCEPT_KEY) || "ready");
  renderAcceptUI(cached, null, "กำลังซิงก์...");

  try {
    // timeout กันค้างเน็ต/endpoint ไม่ตอบ
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${API_BASE}/technicians/${encodeURIComponent(username)}/accept-status`, {
      signal: controller.signal
    });
    clearTimeout(t);

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "โหลดสถานะไม่สำเร็จ");

    const st = normalizeAcceptStatus(data.accept_status);
    localStorage.setItem(LS_ACCEPT_KEY, st);

    const at = data.accept_status_updated_at
      ? new Date(data.accept_status_updated_at).toLocaleString("th-TH")
      : null;

    renderAcceptUI(st, at, null);
  } catch (e) {
    // ❗ ห้ามค้าง: ใช้ค่าสุดท้าย และปล่อยให้กดได้
    console.warn("loadAcceptStatusSafe:", e?.message || e);
    const st = normalizeAcceptStatus(localStorage.getItem(LS_ACCEPT_KEY) || "ready");
    renderAcceptUI(st, null, "ออฟไลน์/โหลดไม่สำเร็จ");
  } finally {
    // ปุ่มต้องกดได้เสมอ (ยกเว้นตอนกำลังบันทึกจริงๆ)
    if (acceptToggleBtn) acceptToggleBtn.disabled = false;
  }
}

// ✅ ส่งสถานะไป Server (optimistic UI)
async function setAcceptStatusSafe(nextStatus) {
  const st = normalizeAcceptStatus(nextStatus);

  // ป้องกันกดรัว
  if (acceptToggleBtn) acceptToggleBtn.disabled = true;

  // เปลี่ยน UI ทันที (ให้รู้สึกทำงาน)
  localStorage.setItem(LS_ACCEPT_KEY, st);
  renderAcceptUI(st, null, "กำลังบันทึก...");

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(`${API_BASE}/technicians/${encodeURIComponent(username)}/accept-status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: st }),
      signal: controller.signal
    });

    clearTimeout(t);

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "ตั้งค่าสถานะไม่สำเร็จ");

    // sync final
    const finalSt = normalizeAcceptStatus(data.accept_status || st);
    localStorage.setItem(LS_ACCEPT_KEY, finalSt);
    renderAcceptUI(finalSt, null, null);

    // รีเฟรช offer ตามสถานะ
    if (typeof loadOffers === "function") loadOffers();
  } catch (e) {
    console.warn("setAcceptStatusSafe:", e?.message || e);

    // rollback เป็นค่าสถานะล่าสุดที่เชื่อถือได้ (ก่อนเปลี่ยน)
    const rollback = normalizeAcceptStatus(localStorage.getItem(LS_ACCEPT_KEY) || "ready");
    renderAcceptUI(rollback, null, "บันทึกไม่สำเร็จ");
    alert(`❌ ${e.message || "บันทึกไม่สำเร็จ"}`);
  } finally {
    if (acceptToggleBtn) acceptToggleBtn.disabled = false;
  }
}

// ✅ โซน (เหมือนเดิม แต่ทำให้ไม่พังแม้ backend ไม่ตอบ)
async function updateZone(zone) {
  const z = String(zone || "").trim();
  try {
    localStorage.setItem("cwf_zone", z);

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(`${API_BASE}/technicians/${encodeURIComponent(username)}/zone`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zone: z }),
      signal: controller.signal
    });
    clearTimeout(t);

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "บันทึกโซนไม่สำเร็จ");
  } catch (e) {
    console.warn("updateZone:", e?.message || e);
  } finally {
    // กรอง offer ใหม่
    if (typeof loadOffers === "function") loadOffers();
  }
}

// ✅ bind controls (ทั้งปุ่มใหม่ + dropdown เก่า)
function bindTechControls() {
  // ปุ่มใหม่
  if (acceptToggleBtn) {
    acceptToggleBtn.onclick = () => {
      const cur = normalizeAcceptStatus(acceptToggleBtn.dataset.status || localStorage.getItem(LS_ACCEPT_KEY) || "ready");
      const next = (cur === "paused") ? "ready" : "paused";
      setAcceptStatusSafe(next);
    };
  }

  // dropdown เก่า (เผื่อบางเครื่องยังใช้)
  if (acceptStatusSelect) {
    acceptStatusSelect.onchange = () => setAcceptStatusSafe(acceptStatusSelect.value);
  }

  if (zoneSelect) {
    zoneSelect.onchange = () => updateZone(zoneSelect.value);
  }
}

// expose for compatibility (inline onclick)
async function clockIn() { return setAcceptStatusSafe("ready"); }
async function clockOut() { return setAcceptStatusSafe("paused"); }
window.clockIn = clockIn;
window.clockOut = clockOut;

// ✅ init: ห้ามค้างกำลังโหลด
(function initTechControlsOnce(){
  // set zone from localStorage
  if (zoneSelect) zoneSelect.value = localStorage.getItem("cwf_zone") || "";

  bindTechControls();
  loadAcceptStatusSafe();
})();


// =======================================
// 👤 PROFILE UI
// =======================================

// ✅ คำนวณเกรดจากจำนวนงานเสร็จ
function calcGrade(doneCount) {
  if (doneCount >= 20) return "A";
  if (doneCount >= 10) return "B";
  if (doneCount >= 5) return "C";
  return "D";
}

// ✅ alias กันพัง (ของเดิมบางส่วนเรียกชื่อฟังก์ชันนี้)
function calcGradeFromDone(doneCount) {
  return calcGrade(doneCount);
}

// ✅ แปลงตำแหน่งจากค่าฐานข้อมูล -> ข้อความแสดงผล
function prettyPosition(pos) {
  const p = String(pos || "").trim();
  if (p === "founder_ceo") return "👑 FOUNDER & CEO";
  if (p === "junior") return "Junior Tech";
  if (p === "senior") return "Senior Tech";
  if (p === "lead") return "Lead Tech";
  return p || "-";
}

// 🏅 Premium Rank Set (Lv.1-5)
const PREMIUM_RANK_SET = {
  1: { label: 'Apprentice', icon64: '/assets/ranks/rank_lv1_128.png' },
  2: { label: 'Technician', icon64: '/assets/ranks/rank_lv2_128.png' },
  3: { label: 'Senior Technician', icon64: '/assets/ranks/rank_lv3_128.png' },
  4: { label: 'Team Lead', icon64: '/assets/ranks/rank_lv4_128.png' },
  5: { label: 'Head Supervisor', icon64: '/assets/ranks/rank_lv5_128.png' },
};

function getPremiumRankInfo(level){
  const n = Number(level);
  if (Number.isFinite(n) && PREMIUM_RANK_SET[n]) return { level:n, ...PREMIUM_RANK_SET[n] };
  return { level:1, ...PREMIUM_RANK_SET[1] };
}


async function loadProfile() {
  try {
    const res = await fetch(`${API_BASE}/technicians/${encodeURIComponent(username)}/profile`);
    const data = await res.json();

    // Top user line
    if (meEl) meEl.textContent = `ผู้ใช้: ${data.username || username || "-"}`;

    // Name
    const displayName = data.full_name || data.username || username || "-";
    if (profileNameEl) profileNameEl.textContent = displayName;

    // Technician code
    if (profileCodeEl) profileCodeEl.textContent = `รหัสช่าง: ${data.technician_code || "-"}`;

    // ✅ Position label (รองรับ founder_ceo)
    if (profilePositionEl) {
      profilePositionEl.textContent = `ตำแหน่ง: ${prettyPosition(data.position)}`;
    }

    // ✅ Premium Rank (badge + label)
    const ri = getPremiumRankInfo(data.rank_level);
    if (profileRankBadgeEl) profileRankBadgeEl.src = ri.icon64;
    if (profileRankLabelEl) profileRankLabelEl.textContent = `Rank: Lv.${ri.level} ${ri.label}`;

    // Grade / stats
    const doneAllTime = Number(data.done_count ?? 0);
    const grade = data.grade || calcGradeFromDone(doneAllTime);
    if (profileGradeEl) profileGradeEl.textContent = `เกรด: ${grade}`;
    if (ratingEl) ratingEl.textContent = (data.rating ?? 0).toString();
    // ✅ งานสะสมบนหน้า (ขอให้เป็น “จำนวนงานที่ทำแล้วภายในเดือนปัจจุบัน”)
    // - ถ้า renderJobs คำนวณไว้แล้ว ให้ใช้ค่านั้น (กันโดน profile endpoint overwrite)
    // - ถ้ายังไม่มี ให้ fallback เป็น all-time เพื่อไม่ให้ว่าง
    const monthDone = (typeof window !== 'undefined' && Number.isFinite(window.__CWF_MONTH_DONE__))
      ? Number(window.__CWF_MONTH_DONE__)
      : doneAllTime;
    if (doneCountEl) doneCountEl.textContent = String(monthDone);

    // Photo (serve from /uploads)
    const photo = data.photo_path || "/logo.png";
    if (profilePhotoEl) profilePhotoEl.src = photo;

    // ✅ sync technician compact profile "more" fields (safe no-op if not present)
    try{ if (typeof window !== 'undefined' && typeof window.__cwfSyncTechMore === 'function') window.__cwfSyncTechMore(); }catch(e){}

    // ✅ โซนรับงาน (แอดมิน/ช่างตั้งไว้)
    const pz = String(data.preferred_zone || "").trim();
    if (zoneSelect) {
      const cached = String(localStorage.getItem("cwf_zone") || "").trim();
      zoneSelect.value = (pz || cached || "");
      if (pz) localStorage.setItem("cwf_zone", pz);
    }


    // Pending request hint
    if (profileHintEl) {
      if (data.request_status === "pending") {
        profileHintEl.textContent = "⏳ มีคำขอแก้ไขโปรไฟล์ค้างอยู่ (รอแอดมินอนุมัติ)";
      } else {
        profileHintEl.textContent = "";
      }
    }
  } catch (e) {
    // fallback
    const u = username || "-";
    if (meEl) meEl.textContent = `ผู้ใช้: ${u}`;
    if (profileNameEl) profileNameEl.textContent = u;
    if (profileCodeEl) profileCodeEl.textContent = "รหัสช่าง: -";
    if (profilePositionEl) profilePositionEl.textContent = "ตำแหน่ง: -";
    if (profileRankBadgeEl) profileRankBadgeEl.src = "/assets/ranks/rank_lv1_128.png";
    if (profileRankLabelEl) profileRankLabelEl.textContent = "Rank: -";
    if (profileGradeEl) profileGradeEl.textContent = "เกรด: -";
    if (ratingEl) ratingEl.textContent = "0.0";
    // fail-open: ถ้าคำนวณงานสะสมเดือนนี้ไว้แล้ว ให้คงไว้
    try{
      const monthDone = (typeof window !== 'undefined' && Number.isFinite(window.__CWF_MONTH_DONE__))
        ? Number(window.__CWF_MONTH_DONE__)
        : 0;
      if (doneCountEl) doneCountEl.textContent = String(monthDone);
    }catch(e2){
      if (doneCountEl) doneCountEl.textContent = "0";
    }
    if (profilePhotoEl) profilePhotoEl.src = "/logo.png";
    try{ if (typeof window !== 'undefined' && typeof window.__cwfSyncTechMore === 'function') window.__cwfSyncTechMore(); }catch(e){}
  }
}

// =======================================
// 💰 INCOME SUMMARY (Technician)
// - แสดง: วันนี้ / เดือนนี้ / สะสมทั้งหมด
// =======================================
function formatBaht(n) {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return "0";
  try {
    return x.toLocaleString('th-TH', { maximumFractionDigits: 0 }) + " ฿";
  } catch {
    return String(Math.round(x)) + " ฿";
  }
}

function _bestEffortUsername() {
  // Backward-compatible: some clients lose the global `username` or cookies.
  // Try common storage keys used across versions.
  try {
    const u1 = (typeof username === 'string' ? username : '') || '';
    if (u1) return u1;
  } catch {}
  try {
    const keys = ['username','tech_username','cwf_username','user','me','admin_username'];
    for (const k of keys) {
      const v = (localStorage.getItem(k) || '').trim();
      if (v) return v;
    }
  } catch {}
  return '';
}

async function loadIncomeSummary() {
  if (!incomeDailyEl && !incomeMonthEl && !incomeAllEl && !incomeDaily2El && !incomeMonth2El && !incomeAll2El) return; // UI ไม่ได้มีส่วนนี้
  try {
    // Fail-open for PWA/webview that loses cookies: also send ?username=
    const u = _bestEffortUsername();
    const url = `${API_BASE}/tech/income_summary${u ? `?username=${encodeURIComponent(u)}` : ''}`;
    const res = await fetch(url, { credentials: 'include' });
    const data = await res.json();
    if (!data || !data.ok) throw new Error(data?.error || 'LOAD_FAILED');

    // cache last good values (so UI won't look "empty" when temporary failures happen)
    try {
      localStorage.setItem('__cwf_income_cache__', JSON.stringify({
        ts: Date.now(),
        day_total: Number(data.day_total||0),
        month_total: Number(data.month_total||0),
        all_total: Number(data.all_total||0)
      }));
    } catch {}

    if (incomeDailyEl) incomeDailyEl.textContent = formatBaht(data.day_total);
    if (incomeMonthEl) incomeMonthEl.textContent = formatBaht(data.month_total);
    if (incomeAllEl) incomeAllEl.textContent = formatBaht(data.all_total);
    if (incomeDaily2El) incomeDaily2El.textContent = formatBaht(data.day_total);
    if (incomeMonth2El) incomeMonth2El.textContent = formatBaht(data.month_total);
    if (incomeAll2El) incomeAll2El.textContent = formatBaht(data.all_total);
  } catch (e) {
    // fail-open (ไม่ให้หน้า tech พัง) + show cached value if available
    try {
      const c = JSON.parse(localStorage.getItem('__cwf_income_cache__') || 'null');
      if (c && typeof c === 'object') {
        if (incomeDailyEl) incomeDailyEl.textContent = formatBaht(c.day_total);
        if (incomeMonthEl) incomeMonthEl.textContent = formatBaht(c.month_total);
        if (incomeAllEl) incomeAllEl.textContent = formatBaht(c.all_total);
        if (incomeDaily2El) incomeDaily2El.textContent = formatBaht(c.day_total);
        if (incomeMonth2El) incomeMonth2El.textContent = formatBaht(c.month_total);
        if (incomeAll2El) incomeAll2El.textContent = formatBaht(c.all_total);
        return;
      }
    } catch {}
    if (incomeDailyEl) incomeDailyEl.textContent = "-";
    if (incomeMonthEl) incomeMonthEl.textContent = "-";
    if (incomeAllEl) incomeAllEl.textContent = "-";
    if (incomeDaily2El) incomeDaily2El.textContent = "-";
    if (incomeMonth2El) incomeMonth2El.textContent = "-";
    if (incomeAll2El) incomeAll2El.textContent = "-";
  }
}

function renderProfile(doneCount = 0) {
  // ✅ คงชื่อฟังก์ชันเดิมไว้เพื่อไม่ให้ส่วนอื่นพัง
  loadProfile();
}

// =======================================
// 🧾 Payout Periods UI (Technician) - Phase 1
// - fast list + lazy detail
// =======================================

let __cwfPayoutCache = { ts: 0, payouts: [], byId: {} };
let __cwfPayoutActiveId = '';

function _fmtDateTH(iso){
  try{
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('th-TH', { year:'numeric', month:'short', day:'numeric' });
  }catch{ return '-'; }
}

function _pill(text){
  return `<span class="pill" style="background:#0b4bb3;color:#fff">${text}</span>`;
}

function _safeText(s){
  return String(s||'').replace(/[&<>"']/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

async function loadTechPayoutPeriods(force=false){
  if (!techPayoutPeriodsEl) return;
  const now = Date.now();
  if (!force && __cwfPayoutCache.payouts.length && (now-__cwfPayoutCache.ts)<15000) {
    // render from cache
    renderTechPayoutPeriods(__cwfPayoutCache.payouts);
    return;
  }
  techPayoutPeriodsEl.innerHTML = `<div class="muted">กำลังโหลดงวด...</div>`;
  try{
    const res = await fetch(`${API_BASE}/tech/payouts`, { credentials: 'include' });
    const data = await res.json();
    if (!data || !data.ok) throw new Error(data?.error||'LOAD_FAILED');
    __cwfPayoutCache = { ts: now, payouts: data.payouts||[], byId: {} };
    renderTechPayoutPeriods(__cwfPayoutCache.payouts);
  }catch(e){
    techPayoutPeriodsEl.innerHTML = `<div class="muted">โหลดงวดไม่สำเร็จ</div>`;
  }
}
window.loadTechPayoutPeriods = loadTechPayoutPeriods;

function renderTechPayoutPeriods(list){
  if (!techPayoutPeriodsEl) return;
  const arr = Array.isArray(list) ? list : [];
  if (!arr.length) {
    techPayoutPeriodsEl.innerHTML = `<div class="muted">ยังไม่มีงวดที่สร้าง</div>`;
    return;
  }
  const rows = arr.map(p=>{
    const id = _safeText(p.payout_id);
    const type = _safeText(p.period_type);
    const st = _fmtDateTH(p.period_start);
    const en = _fmtDateTH(p.period_end);
    const total = formatBaht(p.total_amount);
    const status = _safeText(p.status||'draft');
    const active = (__cwfPayoutActiveId===p.payout_id);
    return `
      <div class="tr" style="padding:10px;border-radius:16px;border:1px solid rgba(15,23,42,0.10);margin-bottom:8px;cursor:pointer;${active?'outline:2px solid rgba(11,75,179,0.35)':''}" onclick="window.openTechPayoutDetail('${id}')">
        <div class="row" style="justify-content:space-between;gap:10px">
          <div>
            <b>งวด ${type}</b>
            <div class="muted" style="margin-top:4px">${st} - ${en}</div>
          </div>
          <div style="text-align:right">
            <b>${total}</b>
            <div class="muted" style="margin-top:4px">สถานะ: ${status}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
  techPayoutPeriodsEl.innerHTML = rows;
}

async function openTechPayoutDetail(payout_id){
  const id = String(payout_id||'').trim();
  if (!id) return;
  __cwfPayoutActiveId = id;
  try { renderTechPayoutPeriods(__cwfPayoutCache.payouts); } catch(e) {}
  if (techPayoutDetailHintEl) techPayoutDetailHintEl.textContent = `กำลังโหลดรายละเอียดงวด: ${id}`;
  if (techPayoutLinesEl) techPayoutLinesEl.innerHTML = `<div class="muted">กำลังโหลดรายการงาน...</div>`;
  if (techPayoutTotalPillEl) { techPayoutTotalPillEl.style.display='none'; techPayoutTotalPillEl.textContent=''; }

  try{
    const res = await fetch(`${API_BASE}/tech/payouts/${encodeURIComponent(id)}`, { credentials:'include' });
    const data = await res.json();
    if (!data || !data.ok) throw new Error(data?.error||'LOAD_FAILED');
    const total = formatBaht(data.total_amount||0);
    if (techPayoutDetailHintEl) techPayoutDetailHintEl.textContent = `รายการงานในงวด (${(data.lines||[]).length} งาน)`;
    if (techPayoutTotalPillEl) {
      techPayoutTotalPillEl.style.display='inline-flex';
      techPayoutTotalPillEl.className = 'pill blue';
      techPayoutTotalPillEl.textContent = `ยอดรวมงวด: ${total}`;
    }
    renderTechPayoutLines(data.lines||[], data.total_amount||0);
  }catch(e){
    if (techPayoutDetailHintEl) techPayoutDetailHintEl.textContent = 'โหลดรายละเอียดไม่สำเร็จ';
    if (techPayoutLinesEl) techPayoutLinesEl.innerHTML = `<div class="muted">โหลดรายการไม่สำเร็จ</div>`;
  }
}
window.openTechPayoutDetail = openTechPayoutDetail;

function renderTechPayoutLines(lines, total){
  if (!techPayoutLinesEl) return;
  const arr = Array.isArray(lines) ? lines : [];
  if (!arr.length) {
    techPayoutLinesEl.innerHTML = `<div class="muted">ไม่มีรายการงานในงวดนี้</div>`;
    return;
  }

  const PAGE = 40;
  let shown = Math.min(PAGE, arr.length);

  const renderSlice = ()=>{
    const slice = arr.slice(0, shown);
    const html = slice.map(ln=>{
      const d = ln.detail_json || {};
      const jobId = _safeText(ln.job_id);
      const fin = _fmtDateTH(ln.finished_at);
      const jt = _safeText(d.job_type || '-');
      const ac = _safeText(d.ac_type || '-');
      const wash = _safeText(d.wash_variant || '-');
      const mc = Number(ln.machine_count_for_tech || d.machine_count_for_tech || 0);
      const pct = (ln.percent_final==null || ln.percent_final===undefined) ? '-' : (Number(ln.percent_final)||0).toFixed(2)+'%';
      const earn = formatBaht(ln.earn_amount||0);
      const mode = _safeText(d.mode || '-');
      const items = Array.isArray(d.items) ? d.items : [];
      const itemsHtml = items.slice(0, 6).map(it=>{
        const a = it.assigned_technician_username ? ` • assign: ${_safeText(it.assigned_technician_username)}` : '';
        return `<div class="muted">- ${_safeText(it.item_name)} × ${Number(it.qty||0)}${a}</div>`;
      }).join('');
      return `
        <details class="tr" style="border-radius:16px;padding:10px;border:1px solid rgba(15,23,42,0.10);margin-bottom:8px">
          <summary style="cursor:pointer">
            <div class="row" style="justify-content:space-between;gap:10px">
              <div>
                <b>งาน #${jobId}</b> <span class="muted">(${fin})</span>
                <div class="muted" style="margin-top:4px">${jt} • ${ac}${wash && wash!=='-' ? ` • ${wash}`:''} • โหมด: ${mode}</div>
              </div>
              <div style="text-align:right">
                <b>${earn}</b>
                <div class="muted" style="margin-top:4px">เครื่อง: ${mc} • %: ${pct}</div>
              </div>
            </div>
          </summary>
          <div style="margin-top:8px">
            <div class="muted"><b>สูตร</b>: ${_safeText(d.how_percent_selected || '-')}</div>
            <div class="muted"><b>นับเครื่อง</b>: ${_safeText(d.how_machine_count_for_tech || '-')}</div>
            <div class="muted" style="margin-top:6px"><b>รายการที่เกี่ยวข้อง</b>:</div>
            ${itemsHtml || '<div class="muted">-</div>'}
          </div>
        </details>
      `;
    }).join('');

    const moreBtn = (shown < arr.length)
      ? `<button class="btn" id="btnMorePayoutLines" style="width:100%;margin-top:6px">โหลดเพิ่ม (${shown}/${arr.length})</button>`
      : `<div class="muted" style="text-align:center;margin-top:6px">ครบแล้ว (${arr.length} งาน)</div>`;

    techPayoutLinesEl.innerHTML = html + moreBtn;
    const btn = document.getElementById('btnMorePayoutLines');
    if (btn) btn.onclick = ()=>{ shown = Math.min(shown + PAGE, arr.length); renderSlice(); };
  };
  renderSlice();
}

// Hook reload button
if (btnReloadIncomePeriodsEl) {
  btnReloadIncomePeriodsEl.addEventListener('click', ()=> loadTechPayoutPeriods(true));
}

// =======================================
// 🗃️ IndexedDB (เก็บรูปไว้ในเครื่องก่อนอัปโหลด)
// =======================================
const IDB_NAME = "cwf_photos_db";
const IDB_STORE = "pending_photos";

function idbOpen() {
  return new Promise((resolve, reject) => {
    // IMPORTANT (production fix): บางเครื่อง/บางเคส IndexedDB อาจ "ค้าง" (blocked)
    // ทำให้ flow ปิดงานเงียบเพราะ await ไม่จบ (ไม่มี onsuccess/onerror)
    // -> ใส่ onblocked + timeout เพื่อ fail-open
    const req = indexedDB.open(IDB_NAME, 2);

    const HARD_TIMEOUT_MS = 2500;
    let done = false;
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      try { req?.result?.close?.(); } catch {}
      reject(new Error('IndexedDB timeout'));
    }, HARD_TIMEOUT_MS);

    req.onupgradeneeded = () => {
      const db = req.result;

      let store;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        store = db.createObjectStore(IDB_STORE, { keyPath: "photo_id" });
      } else {
        store = req.transaction.objectStore(IDB_STORE);
      }

      if (!store.indexNames.contains("job_id")) {
        store.createIndex("job_id", "job_id", { unique: false });
      }
      if (!store.indexNames.contains("job_phase")) {
        store.createIndex("job_phase", ["job_id", "phase"], { unique: false });
      }
    };

    req.onblocked = () => {
      if (done) return;
      done = true;
      clearTimeout(t);
      reject(new Error('IndexedDB blocked'));
    };

    req.onsuccess = () => {
      if (done) return;
      done = true;
      clearTimeout(t);
      resolve(req.result);
    };
    req.onerror = () => {
      if (done) return;
      done = true;
      clearTimeout(t);
      reject(req.error);
    };
  });
}

async function idbPut(record) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(record);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetByJob(jobId) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const idx = tx.objectStore(IDB_STORE).index("job_id");
    const req = idx.getAll(Number(jobId));
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(photoId) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(Number(photoId));
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

// =======================================
// 🔁 REFRESH LOOP
// =======================================
loadProfile();
loadIncomeSummary();
loadOffers();
loadJobs();
setInterval(() => loadOffers(), 15000);
setInterval(() => loadJobs(), 20000); // keep active/history in sync (admin force close etc.)
setInterval(() => loadIncomeSummary(), 60000);

// ✅ มือถือ: กดโทรแล้วกลับมา/สลับแอพ -> รีเฟรชสถานะทันที
window.addEventListener("focus", () => {
  try { loadJobs(); } catch(e) {}
  try { loadIncomeSummary(); } catch(e) {}
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    try { loadJobs(); } catch(e) {}
    try { loadIncomeSummary(); } catch(e) {}
  }
});

// =======================================
// 📨 LOAD OFFERS
// =======================================
function loadOffers() {
  fetch(`${API_BASE}/offers/tech/${username}`)
    .then((res) => res.json())
    .then((offers) => {
      const list = Array.isArray(offers) ? offers : [];

      // 🔔 แจ้งเตือนเมื่อมีงานเข้า (เฉพาะงานใหม่ที่ยังไม่เคยเห็น)
      try {
        const prev = JSON.parse(localStorage.getItem(LS_LAST_OFFER_KEY) || "[]");
        const prevSet = new Set(Array.isArray(prev) ? prev.map((x) => Number(x)) : []);
        const nowIds = list.map((o) => Number(o.offer_id)).filter((x) => Number.isFinite(x));

        const newOnes = nowIds.filter((id) => !prevSet.has(id));
        if (newOnes.length > 0) {
          showNotify("📌 CWF มีงานเข้าใหม่", `มีข้อเสนอใหม่ ${newOnes.length} งาน`);
        }

        // เก็บล่าสุด (จำกัด 50)
        localStorage.setItem(LS_LAST_OFFER_KEY, JSON.stringify(nowIds.slice(0, 50)));
      } catch {
        // ignore
      }

      renderOffers(list);
    })
    .catch((err) => {
      console.error(err);
      if (offerList) offerList.innerHTML = "<p>❌ โหลดข้อเสนองานไม่สำเร็จ</p>";
    });
}

function renderOffers(offers) {
  if (!offerList) return;

  // ✅ กรองตามโซนที่ช่างเลือก (ถ้าในงานมี job_zone)
  const z = String((zoneSelect && zoneSelect.value) || localStorage.getItem('cwf_zone') || '').trim();
  const filtered = z ? (offers || []).filter(o => !o.job_zone || String(o.job_zone).trim() === z) : (offers || []);

  if (!filtered.length) {
    offerList.innerHTML = "<p>ไม่มีข้อเสนองานตอนนี้</p>";
    return;
  }

  offerList.innerHTML = filtered
    .map((o) => {
      const expires = new Date(o.expires_at).getTime();
      const now = Date.now();
      const secLeft = Math.max(0, Math.floor((expires - now) / 1000));
      const min = Math.floor(secLeft / 60);
      const sec = secLeft % 60;

      return `
      <div class="job-card" style="border:1px solid rgba(251,191,36,0.55);">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <b>📌 งานใหม่เสนอให้รับ</b>
          <span class="badge wait">⏳ ${min}:${String(sec).padStart(2, "0")}</span>
        </div>

        <p style="margin-top:10px;"><b>Booking:</b> ${o.booking_code || ('CWF'+String(o.job_id).padStart(7,'0'))}</p>
        <p><b>ลูกค้า:</b> ${o.customer_name}</p>
        <p><b>ประเภท:</b> ${o.job_type}</p>
        <p><b>นัด:</b> ${new Date(o.appointment_datetime).toLocaleString("th-TH")}</p>
        <p><b>ที่อยู่:</b> ${o.address_text || "-"}</p>

        <div class="row" style="margin-top:10px;">
          <button onclick="acceptOffer(${o.offer_id})">✅ รับงาน</button>
          <button class="danger" onclick="declineOffer(${o.offer_id})">❌ ไม่รับงาน</button>
        </div>
      </div>
    `;
    })
    .join("");
}

function acceptOffer(offerId) {
  fetch(`${API_BASE}/offers/${offerId}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "รับงานไม่สำเร็จ");
      return data;
    })
    .then(() => {
      alert("✅ รับงานเรียบร้อย");
      loadOffers();
      loadJobs();
    })
    .catch((err) => {
      console.error(err);
      alert(`❌ ${err.message}`);
      loadOffers();
    });
}

function declineOffer(offerId) {
  fetch(`${API_BASE}/offers/${offerId}/decline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "ไม่รับงานไม่สำเร็จ");
      return data;
    })
    .then((data) => {
      alert(data.status === "expired" ? "⏳ หมดเวลารับงานแล้ว" : "✅ ส่งกลับแอดมินแล้ว");
      loadOffers();
      loadJobs();
    })
    .catch((err) => {
      console.error(err);
      alert(`❌ ${err.message}`);
      loadOffers();
    });
}

// =======================================
// 📡 LOAD JOBS
// =======================================
function loadJobs() {
  fetch(`${API_BASE}/jobs/tech/${username}`)
    .then((res) => {
      if (!res.ok) throw new Error("โหลดข้อมูลงานไม่สำเร็จ");
      return res.json();
    })
    .then((jobs) => renderJobs(jobs))
    .catch((err) => {
      console.error(err);
      if (activeJobsEl) activeJobsEl.innerHTML = "<p>❌ โหลดงานไม่สำเร็จ</p>";
      if (historyJobsEl) historyJobsEl.innerHTML = "<p>❌ โหลดงานไม่สำเร็จ</p>";
      renderProfile(0);
    });
}

// =======================================
// 🧩 RENDER JOBS
// ✅ FIX: trim สถานะก่อนกรอง (กันช่องว่าง/พิมพ์เพี้ยนจาก DB)
// =======================================
function normStatus(s) {
  return String(s || "").trim();
}

// =======================================
// 🗓️ DATE HELPERS (Asia/Bangkok) + History Filter
// =======================================
const __DTF_BKK_YMD__ = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" });
function ymdBkkFromISO(iso){
  try {
    const d = new Date(iso);
    if (!isFinite(d.getTime())) return "";
    return __DTF_BKK_YMD__.format(d); // YYYY-MM-DD
  } catch { return ""; }
}
function todayYmdBkk(){
  return __DTF_BKK_YMD__.format(new Date());
}

const LS_HISTORY_FILTER = "cwf_tech_history_filter";
let __HISTORY_FILTER__ = (()=>{
  try { return localStorage.getItem(LS_HISTORY_FILTER) || "month"; } catch(e){ return "month"; }
})();

function setHistoryFilter(f){
  const v = (f === "day" || f === "all") ? f : "month";
  __HISTORY_FILTER__ = v;
  try { localStorage.setItem(LS_HISTORY_FILTER, v); } catch(e) {}
  if (typeof historyTabDayEl !== "undefined" && historyTabDayEl) historyTabDayEl.classList.toggle("active", v === "day");
  if (typeof historyTabMonthEl !== "undefined" && historyTabMonthEl) historyTabMonthEl.classList.toggle("active", v === "month");
  if (typeof historyTabAllEl !== "undefined" && historyTabAllEl) historyTabAllEl.classList.toggle("active", v === "all");
  if (typeof historyFilterHintEl !== "undefined" && historyFilterHintEl) {
    historyFilterHintEl.textContent = (v === "day") ? "แสดงงานปิดแล้ว: วันนี้" : (v === "month") ? "แสดงงานปิดแล้ว: เดือนนี้" : "แสดงงานปิดแล้ว: ทั้งหมด";
  }
  // re-render from cache (ไม่เรียก API ซ้ำ)
  try { renderJobs(window.__JOB_CACHE__ || []); } catch(e) {}
}
window.setHistoryFilter = setHistoryFilter;

// init filter UI (ถ้ามีปุ่ม)
try {
  if (typeof historyTabDayEl !== "undefined" && historyTabDayEl) setHistoryFilter(__HISTORY_FILTER__);
} catch(e) {}


// =======================================
// 🔧 DOM HELPERS (กันต้องรีเฟรชทั้งหน้า)
// =======================================
function escapeAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cssEscapeCompat(value) {
  const s = String(value || "");
  if (typeof CSS !== "undefined" && CSS && typeof CSS.escape === "function") return CSS.escape(s);
  // fallback: escape quotes/backslashes for querySelector
  return s.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/'/g, "\\'");
}

// ✅ เปิดปุ่ม “เริ่มเดินทาง” ทันทีหลังโทร (ไม่ต้องรอ fetch/polling)
function unlockTravelImmediately(jobKey) {
  const key = String(jobKey || "").trim();
  if (!key) return;

  // อัปเดตจาก local cache ก่อน (ช่วยคำนวณขั้นตอน)
  const cache = (window.__JOB_CACHE__ || []);
  const job = cache.find(j => String(j.job_id) === key || String(j.booking_code || "") === key) || null;
  const jobId = job ? Number(job.job_id) : NaN;

  // อัปเดตเฉพาะใบงานใน DOM
  const sel = `.job-card[data-jobkey="${cssEscapeCompat(key)}"]`;
  const card = document.querySelector(sel);
  if (!card) return;

  // ถ้างานยังไม่เริ่มเดินทาง และยังไม่จ่าย/ปิดงาน => ปลด disabled
  const status = job ? normStatus(job.job_status) : "";
  const paid = !!(job && job.paid_at) || String(job?.payment_status || "").trim().toLowerCase() === "paid";
  const travelStarted = !!localStorage.getItem(`cwf_travel_${key}`) || !!(job && job.travel_started_at);

  const btn = card.querySelector('button[data-role="workflow"]');
  if (btn && !paid && !travelStarted && status !== "เสร็จแล้ว" && status !== "ยกเลิก") {
    btn.disabled = false;
    // ถ้าป้ายยังไม่ทันอัปเดต ให้ยังคงแสดง “เริ่มเดินทาง”
    if (!btn.textContent || !btn.textContent.includes("เดินทาง")) {
      btn.textContent = "🚗 เริ่มเดินทาง";
    }
  }

  // ปรับข้อความแนะนำ (ถ้ามี)
  if (Number.isFinite(jobId)) {
    const hint = document.getElementById(`travel-hint-${jobId}`);
    if (hint) hint.textContent = "กด “เริ่มเดินทาง” เพื่อปลดล็อกแผนที่และเช็คอิน";
  }
}

// =======================================
// 🛡️ WARRANTY KIND DETECTOR (robust)
// - รองรับงานเก่าที่มีค่าหลากหลาย (ไทย/อังกฤษ)
// - ปลอด regression: ใช้เพื่อแสดง/บังคับ UI เท่านั้น
// =======================================
function detectWarrantyKind(jobTypeRaw) {
  const s = String(jobTypeRaw || "").trim().toLowerCase();
  if (!s) return "";
  if (s.includes("ติดตั้ง") || s.includes("install")) return "install";
  if (s.includes("ล้าง") || s.includes("clean")) return "clean";
  if (s.includes("ซ่อม") || s.includes("repair") || s.includes("fix")) return "repair";
  return "";
}

// Robust job type extractor (supports legacy job payloads)
function getJobTypeText(job){
  if (!job || typeof job !== 'object') return '';
  const cand = [
    job.job_type,
    job.jobType,
    job.service_type,
    job.serviceType,
    job.work_type,
    job.workType,
    job.type,
    job.category,
    job.job_category,
  ];
  for (const v of cand){
    const s = String(v || '').trim();
    if (s) return s;
  }
  return '';
}

function getJobFromCache(jobId){
  const id = Number(jobId);
  const arr = window.__JOB_CACHE__;
  if (!Array.isArray(arr) || !Number.isFinite(id)) return null;
  return arr.find(j=>Number(j?.job_id)===id) || null;
}

function renderJobs(jobs) {
  // ✅ cache ไว้ใช้กับ popup จ่ายเงิน / เปิด e-slip
  window.__JOB_CACHE__ = Array.isArray(jobs) ? jobs : [];

  if (activeJobsEl) activeJobsEl.innerHTML = "";
  if (activeUpcomingJobsEl) activeUpcomingJobsEl.innerHTML = "";
  if (historyJobsEl) historyJobsEl.innerHTML = "";

  if (!Array.isArray(jobs) || jobs.length === 0) {
    if (activeJobsEl) activeJobsEl.innerHTML = "<p>✅ วันนี้ยังไม่มีงาน</p>";
    if (activeUpcomingJobsEl) activeUpcomingJobsEl.innerHTML = "<p>ยังไม่มีงานล่วงหน้า</p>";
    if (historyJobsEl) historyJobsEl.innerHTML = "<p>ยังไม่มีประวัติงาน</p>";
    if (doneCountEl) doneCountEl.textContent = "0";
    renderProfile(0);
    return;
  }

  // ✅ สถานะที่ถือว่าเป็น ‘งานกำลังดำเนินการ’
  const ACTIVE_STATUSES = new Set(["รอดำเนินการ","กำลังทำ","ตีกลับ","รอช่างยืนยัน"]);
  const DONE_STATUSES = new Set(["เสร็จแล้ว","เสร็จสิ้น","ปิดงาน","done","completed"]);
  const CANCEL_STATUSES = new Set(["ยกเลิก","cancelled","canceled","cancel"]);

  const todayYMD = todayYmdBkk();

  const activeAll = jobs.filter((j) => ACTIVE_STATUSES.has(normStatus(j.job_status)));
  // งานปัจจุบัน = เฉพาะงานใน “วันนี้”
  const activeToday = activeAll.filter((j)=> ymdBkkFromISO(j.appointment_datetime) === todayYMD);
  // งานล่วงหน้า = งานที่นัดวันมากกว่าวันนี้
  const activeUpcoming = activeAll.filter((j)=>{
    const y = ymdBkkFromISO(j.appointment_datetime);
    return y && y > todayYMD;
  });

  let historyAll = jobs.filter((j) => {
    const st = normStatus(j.job_status);
    return DONE_STATUSES.has(st) || CANCEL_STATUSES.has(st) || st === "ยกเลิก";
  });

  // ✅ ฟิลเตอร์ประวัติ: วัน/เดือน/ทั้งหมด (อิง Asia/Bangkok)
  const monthKey = todayYMD.slice(0,7);
  if (__HISTORY_FILTER__ === "day") {
    historyAll = historyAll.filter(j => ymdBkkFromISO(j.appointment_datetime) === todayYMD);
  } else if (__HISTORY_FILTER__ === "month") {
    historyAll = historyAll.filter(j => {
      const y = ymdBkkFromISO(j.appointment_datetime);
      return y && y.slice(0,7) === monthKey;
    });
  }

  if (activeJobsEl) {
    if (!activeToday.length) activeJobsEl.innerHTML = "<p>✅ วันนี้ยังไม่มีงาน</p>";
    activeToday.forEach((job) => activeJobsEl.appendChild(buildJobCard(job, false)));
  }

  if (activeUpcomingJobsEl) {
    if (!activeUpcoming.length) activeUpcomingJobsEl.innerHTML = "<p>ยังไม่มีงานล่วงหน้า</p>";
    activeUpcoming.forEach((job) => activeUpcomingJobsEl.appendChild(buildJobCard(job, false)));
  }

  if (historyJobsEl) {
    if (!historyAll.length) {
      historyJobsEl.innerHTML = "<p>ยังไม่มีงานที่ปิดแล้ว</p>";
    } else {
      historyAll.forEach((job) => historyJobsEl.appendChild(buildHistorySummary(job)));
    }
  }

  // 🔔 เตือนก่อนถึงเวลานัด 30 นาที (เฉพาะงานวันนี้)
  try {
    check30mReminder(activeToday);
  } catch {
    // ignore
  }

  // ✅ งานสะสม: แสดง “จำนวนงานที่ทำแล้วภายในเดือนปัจจุบัน” เสมอ
  // - ไม่ผูกกับ history filter (วัน/เดือน/ทั้งหมด)
  // - นับเฉพาะงานที่ถือว่า done (ไม่รวมยกเลิก)
  const monthKey2 = todayYMD.slice(0,7);
  const monthDone = jobs.filter((j)=>{
    const st = normStatus(j.job_status);
    if (!DONE_STATUSES.has(st)) return false;
    const y = ymdBkkFromISO(j.appointment_datetime);
    return y && y.slice(0,7) === monthKey2;
  }).length;

  try{ if (typeof window !== 'undefined') window.__CWF_MONTH_DONE__ = monthDone; }catch(e){}
  if (doneCountEl) doneCountEl.textContent = String(monthDone);
  renderProfile(monthDone);
}


// =======================================
// ⏰ Reminder: งานที่รับแล้ว ใกล้ถึงเวลานัด (30 นาที)
// - กันเด้งซ้ำ: key = job_id + appointment_datetime
// =======================================
function check30mReminder(activeJobs) {
  if (!isNotifyEnabled()) return;
  const now = Date.now();

  const memo = JSON.parse(localStorage.getItem(LS_REMIND_KEY) || "{}") || {};

  for (const j of (activeJobs || [])) {
    const ap = j.appointment_datetime;
    if (!ap) continue;
    const t = new Date(ap).getTime();
    if (!Number.isFinite(t)) continue;

    const diff = t - now;
    const key = `${j.job_id}__${new Date(ap).toISOString()}`;

    // เตือนเมื่อเหลือ 30 นาที (0 < diff <= 30 นาที)
    if (diff > 0 && diff <= 30 * 60 * 1000) {
      if (!memo[key]) {
        memo[key] = now;
        const when = new Date(ap).toLocaleString("th-TH");
        showNotify("⏰ ใกล้ถึงเวลางาน", `งาน ${j.booking_code || ('CWF'+String(j.job_id).padStart(7,'0'))} นัด ${when}`);
      }
    }
  }

  // จำกัดขนาด (ลบของเก่าเกิน 14 วัน)
  const cutoff = now - 14 * 24 * 60 * 60 * 1000;
  for (const k of Object.keys(memo)) {
    if (Number(memo[k] || 0) < cutoff) delete memo[k];
  }
  localStorage.setItem(LS_REMIND_KEY, JSON.stringify(memo));
}


// =======================================
// 🧭 GPS NAVIGATION (เปิด Google Maps)
// =======================================
function _safeOpenUrl(url){
  let u = String(url || '').trim();
  if (!u) return;
  // sanitize invisible chars + whitespace that breaks navigation on mobile
  u = u.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (/(maps\.app\.goo\.gl|goo\.gl|google\.com\/maps|www\.google\.com\/maps)/i.test(u)) {
    u = u.replace(/\s+/g, '');
  }
  try {
    // 1) try window.open (works on most browsers)
    const w = window.open(u, '_blank', 'noopener');
    if (w) { try{ w.opener=null; }catch{} return; }

    // 2) fallback: create an anchor and click (works on some Android webviews)
    const a = document.createElement('a');
    a.href = u;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ try{ a.remove(); }catch{} }, 0);

    // 3) last resort: same-tab navigation
    window.location.href = u;
  } catch (e) {
    try { window.location.href = u; } catch(_) {}
  }
}

function _normalizeMapsUrl(input){
  let s = String(input || '').trim();
  if (!s) return '';

  // sanitize invisible whitespace/newlines that break navigation on mobile
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

  // If it looks like a URL host/path, remove inner whitespace (copy/paste issue)
  if (/(maps\.app\.goo\.gl|goo\.gl|google\.com\/maps|www\.google\.com\/maps)/i.test(s)) {
    s = s.replace(/\s+/g, '');
  }

  // If already a geo: URL or has protocol -> keep
  if (/^geo:/i.test(s) || /^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;

  // Common cases without scheme
  if (/^(maps\.app\.goo\.gl|goo\.gl\/maps|www\.google\.com\/maps|google\.com\/maps)/i.test(s)) {
    return `https://${s}`;
  }

  // Some users paste "maps.google.com/?q=..." without scheme
  if (/^maps\.google\.com\//i.test(s)) return `https://${s}`;

  // If it still looks like a URL host/path, add https
  if (/^\w+[\w.-]*\.[a-z]{2,}\//i.test(s)) return `https://${s}`;

  // If user pasted a short host without protocol
  if (/^(maps\.app\.goo\.gl|goo\.gl)\//i.test(s)) {
    return `https://${s}`;
  }

  // Otherwise treat as a query/address
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s)}`;
}

function openMaps(lat, lng, address, mapsUrl) {
  try {
    let url = "";
    const directRaw = String(mapsUrl || "").trim();
    if (directRaw) {
      _safeOpenUrl(_normalizeMapsUrl(directRaw));
      return;
    }

    const hasLatLng = (lat !== null && lat !== undefined && lng !== null && lng !== undefined);
    if (hasLatLng && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))) {
      url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lat + "," + lng)}`;
    } else if (address) {
      url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
    } else {
      return alert("ไม่มีพิกัด/ที่อยู่สำหรับนำทาง");
    }
    _safeOpenUrl(url);
  } catch (e) {
    alert("เปิดแผนที่ไม่สำเร็จ");
  }
}
window.openMaps = openMaps;

// =======================================
// 📝 NOTE DRAFT (กันข้อความหายตอน auto-refresh)
// =======================================
const NOTE_DRAFT_PREFIX = 'cwf_note_draft_';
function getNoteDraft(jobKey){
  const k = String(jobKey || '').trim();
  if (!k) return '';
  try { return String(localStorage.getItem(NOTE_DRAFT_PREFIX + k) || ''); } catch { return ''; }
}
function setNoteDraft(jobKey, val){
  const k = String(jobKey || '').trim();
  if (!k) return;
  try { localStorage.setItem(NOTE_DRAFT_PREFIX + k, String(val || '')); } catch {}
}
function clearNoteDraft(jobKey){
  const k = String(jobKey || '').trim();
  if (!k) return;
  try { localStorage.removeItem(NOTE_DRAFT_PREFIX + k); } catch {}
}
function noteDraftChanged(jobKey){
  const k = String(jobKey || '').trim();
  if (!k) return;
  const el = document.getElementById(`note-${k}`);
  if (!el) return;
  setNoteDraft(k, el.value || '');
}
window.noteDraftChanged = noteDraftChanged;

// =======================================
// 📞 CALL CUSTOMER (บังคับให้กดโทรก่อนเริ่มเดินทาง)
// - เมื่อกดโทร จะบันทึก flag ในเครื่อง (localStorage) เพื่อปลดล็อกปุ่ม "เริ่มเดินทาง"
// =======================================
function callCustomer(jobId, phone) {
  // ✅ รองรับ jobId เป็นทั้งตัวเลข (job_id) และตัวอักษร (booking_code)
  // เพื่อกันงานจากระบบเดิมที่อาจส่ง id มาเป็น string
  const idKey = String(jobId || "").trim();
  const p = String(phone || "").trim();
  if (!idKey) return alert("job_id ไม่ถูกต้อง");
  if (!p) return alert("ไม่มีเบอร์โทรลูกค้า");

  try {
    localStorage.setItem(`cwf_called_${idKey}`, String(Date.now()));
  } catch {
    // ignore
  }

  // ✅ ปลดล็อกปุ่ม “เริ่มเดินทาง” ทันที (ไม่ต้องรอรีเฟรช/รอ polling)
  try {
    unlockTravelImmediately(idKey);
  } catch {
    // ignore
  }

  // ✅ กันเคสมือถือสลับไปแอพโทรแล้วกลับมา: รีเฟรชสถานะอีกรอบแบบเร็ว
  try {
    setTimeout(() => {
      try { loadJobs(); } catch(e) {}
    }, 120);
  } catch {
    // ignore
  }

  // มือถือจะเด้งไปที่แอพโทร
  window.location.href = `tel:${p}`;
}
window.callCustomer = callCustomer;

// =======================================
// ↩️ RETURN JOB (ช่างตีกลับงาน) - (ปิดใช้งานฝั่งช่างตามคำสั่งล่าสุด)
// - ยังไม่ลบ endpoint ฝั่ง backend เผื่อใช้งานอนาคต
// =======================================

// =======================================
// 🧱 BUILD JOB CARD
// =======================================

function buildJobCard(job, historyMode = false) {
  const div = document.createElement("div");
  div.className = "job-card";

  // ✅ metadata ไว้ให้ update DOM แบบเฉพาะใบงาน (กันต้องรีเฟรชทั้งหน้า)
  const jobKeyForDom = String((job && (job.job_id ?? job.booking_code)) || "").trim();
  if (jobKeyForDom) div.setAttribute("data-jobkey", jobKeyForDom);
  if (job && job.job_id != null) div.setAttribute("data-jobid", String(job.job_id));

  const status = normStatus(job.job_status) || "รอดำเนินการ";

  const badge =
    status === "รอดำเนินการ"
      ? `<span class="badge wait">⏳ รอดำเนินการ</span>`
      : status === "กำลังทำ"
      ? `<span class="badge run">🛠️ กำลังทำ</span>`
      : status === "เสร็จแล้ว"
      ? `<span class="badge ok">✅ เสร็จแล้ว</span>`
      : `<span class="badge bad">⛔ ยกเลิก</span>`;

  // ✅ jobKey: ใช้เป็น key/พารามิเตอร์ได้ทั้ง job_id (number) และ booking_code (string)
  const jobKey = String((job.job_id ?? job.booking_code ?? "")).trim();
  const jobId = Number(job.job_id);
  const keyBase = jobKey || String(jobId || "");
  const jobKeyJs = keyBase.replace(/'/g, "\\'");

  const travelKey = `cwf_travel_${keyBase}`;
  const travelStarted = !!localStorage.getItem(travelKey) || !!job.travel_started_at;
  const calledKey = `cwf_called_${keyBase}`;
  const called = !!localStorage.getItem(calledKey);
  const paid = !!job.paid_at || String(job.payment_status || "").trim().toLowerCase() === "paid";
  const checkedIn = !!job.checkin_at;
  const isWorking = status === "กำลังทำ";
  const canEdit = !historyMode && (status === "รอดำเนินการ" || status === "กำลังทำ");

  // ✅ ปุ่มอัปเดตสถานะ (ปุ่มเดียว) + e-slip (ขั้นตอนสุดท้าย)
  // - งานประวัติ: ปุ่มนี้จะกลายเป็น "🧾 e-slip" อย่างเดียว (ดูได้ตลอดถ้าจ่ายแล้ว)
  const workflowDisabled = historyMode
    ? !paid
    : (paid
        ? false
        : ((!travelStarted && !called) || status === "เสร็จแล้ว" || status === "ยกเลิก"));

  // ⚠️ ใช้ keyBase ใน onclick เพื่อรองรับงานจากระบบเดิมที่อาจส่ง id มาเป็น string
  // (ฝั่ง API รองรับทั้ง job_id และ booking_code ผ่าน encodeURIComponent)
  const workflowOnclick = historyMode
    ? `openESlip('${jobKeyJs}')`
    : `workflowNext('${jobKeyJs}')`;

  const workflowLabel = historyMode
    ? "🧾 e-slip"
    : (paid
        ? "🧾 e-slip"
        : (!travelStarted
            ? "🚗 เริ่มเดินทาง"
            : (!checkedIn
                ? "📍 เช็คอิน"
                : (!isWorking ? "▶️ เริ่มทำงาน" : "💳 จ่ายเงิน"))));


  // ✅ ปุ่มสถานะจะแสดงเป็น 4 ปุ่มเรียงลำดับ (เริ่มเดินทาง → เช็คอิน → เริ่มทำงาน → จ่ายเงิน)

  const escape = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const appt = job.appointment_datetime ? new Date(job.appointment_datetime).toLocaleString("th-TH") : "-";
  const addr = escape(job.address_text || "-");
  const bookingCode = job.booking_code || ("CWF" + String(jobId).padStart(7, "0"));
  const rawPhone = String(job.customer_phone || "").trim();
  const telPhone = rawPhone.replace(/[^0-9+]/g, "");

  // ✅ สรุปสถานะเช็คอิน
  const checkinText = checkedIn
    ? `✅ เช็คอินแล้ว (${new Date(job.checkin_at).toLocaleString("th-TH")})`
    : "ยังไม่เช็คอิน";

  // ✅ ข้อความแนะนำตามขั้นตอน (กันช่างกดผิดลำดับ)
  const flowHint = !called
    ? "📞 ต้องกด “โทรลูกค้า” ก่อน ถึงจะเริ่มเดินทางได้"
    : (!travelStarted
      ? "กด “เริ่มเดินทาง” เพื่อปลดล็อกแผนที่และเช็คอิน"
      : (!checkedIn
        ? "ไปถึงหน้างานแล้วกด “เช็คอิน”"
        : (!isWorking
          ? "เช็คอินแล้ว กด “เริ่มทำงาน” เพื่อเปิดสถานะกำลังทำ"
          : (!paid ? "ทำงานเสร็จให้กด “จ่ายเงิน” เพื่อแสดง QR และแนบสลิป" : "✅ จ่ายเงินแล้ว"))));

  // ✅ แสดงส่วนรูป/หมายเหตุ/ปิดงาน เฉพาะตอนเริ่มทำงานแล้ว
  const showWorkTools = checkedIn || isWorking || historyMode;

  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
      <div>
        <b>📌 Booking: ${bookingCode}</b>
        <div class="muted" style="font-size:12px;margin-top:2px;">งานในระบบ: #${jobId}</div>
      </div>
      ${badge}
    </div>

    <p style="margin-top:8px;"><b>ลูกค้า:</b> ${escape(job.customer_name || "-")}</p>
    <p><b>โทร:</b> ${escape(job.customer_phone || "-")}</p>
    <p><b>ประเภท:</b> ${escape(job.job_type || "-")}</p>
    <p><b>นัด:</b> ${appt}</p>
    <p><b>ที่อยู่:</b> ${addr}</p>

    <details class="cwf-details" style="margin-top:10px;">
      <summary>👥 ทีมช่างในงานนี้</summary>
      <div class="cwf-details-body" id="team-${jobId}">กำลังโหลด...</div>
    </details>

      <div style="margin-top:10px;">
        <!-- ✅ แถวปุ่มโทร: กดได้ตลอด -->
        <div class="row" style="gap:10px;flex-wrap:wrap;">
          <button class="secondary" type="button" style="width:auto;" ${telPhone ? "" : "disabled"} onclick="callCustomer('${jobKeyJs}', '${telPhone}')">📞 โทรลูกค้า</button>
        </div>

        <!-- ✅ แถวปุ่มแผนที่: อยู่ใต้ปุ่มโทร และกดดูได้ตลอด -->
        <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;">
          <button class="secondary" type="button" style="width:auto;" ${((job.address_text || job.maps_url || (job.gps_latitude != null && job.gps_longitude != null)) ? "" : "disabled")} onclick="openMaps(${job.gps_latitude ?? null}, ${job.gps_longitude ?? null}, '${(job.address_text||"").replace(/'/g,"\\'")}', '${String(job.maps_url||"").replace(/'/g,"\\'")}' )">🧭 แผนที่</button>
        </div>

        <!-- ✅ ปุ่มอัปเดตสถานะ / e-slip (ปุ่มเดียว) -->
        <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;">
          <button type="button" style="width:100%;" data-role="workflow" data-jobkey="${escapeAttr(keyBase)}" ${workflowDisabled ? "disabled" : ""} onclick="${workflowOnclick}">
            ${workflowLabel}
          </button>
        </div>

        ${historyMode ? "" : `<div id="travel-hint-${jobId}" class="muted" style="margin-top:6px;">${flowHint}</div>`}




    <details class="cwf-details" style="margin-top:10px;">
      <summary>💰 รายละเอียดราคา</summary>
      <div class="cwf-details-body">
        <div id="pricing-${jobId}">กำลังโหลด...</div>
      </div>
    </details>


    ${showWorkTools ? `
      <details class="cwf-details" style="margin-top:10px;" ${isWorking ? "open" : ""}>
        <summary>🛠️ รูป / หมายเหตุ / ปิดงาน</summary>
        <div class="cwf-details-body">
          <div>
            <b>📷 รูปหน้างาน</b>
            <div class="row" style="margin-top:8px;flex-wrap:wrap;gap:10px;">
              <button onclick="pickPhotos('${jobKeyJs}', 'before')" ${!canEdit ? "disabled" : ""}>ก่อนทำ</button>
              <button onclick="pickPhotos('${jobKeyJs}', 'after')" ${!canEdit ? "disabled" : ""}>หลังทำ</button>
              <button onclick="pickPhotos('${jobKeyJs}', 'pressure', 4)" ${!canEdit ? "disabled" : ""}>วัดน้ำยา</button>
              <button onclick="pickPhotos('${jobKeyJs}', 'current', 4)" ${!canEdit ? "disabled" : ""}>วัดกระแส</button>
              <button onclick="pickPhotos('${jobKeyJs}', 'temp', 4)" ${!canEdit ? "disabled" : ""}>อุณหภูมิ</button>
              <button onclick="pickPhotos('${jobKeyJs}', 'defect', 4)" ${!canEdit ? "disabled" : ""}>ตำหนิ</button>
            </div>
            <div id="photo-status-${jobId}" style="margin-top:8px;"></div>
          </div>

          <hr style="margin:10px 0;" />

          <div>
            <b>🛡️ ประกันงาน</b>
            <div class="muted" style="margin-top:4px;font-size:12px;">ต้องเลือกก่อนกด “เสร็จสิ้น”</div>
            ${(() => {
              const jt = getJobTypeText(job);
              let kind = detectWarrantyKind(jt);
              let label = '';
              let kindSelect = '';
              let monthSelect = '';

              if (kind === 'clean') {
                label = 'ล้าง: ประกัน 30 วัน';
              } else if (kind === 'install') {
                label = 'ติดตั้ง: ประกัน 3 ปี';
              } else if (kind === 'repair') {
                label = 'ซ่อม: เลือก 3/6/12 เดือน';
              } else {
                // งานเก่า/ค่าพิเศษ: ให้เลือกชนิดประกันเอง เพื่อไม่บล็อกการปิดงานผิดพลาด
                label = 'โปรดเลือกประเภทประกันก่อนปิดงาน';
                kindSelect = `
                  <select id="warranty-kind-${jobId}" style="margin-top:6px;width:100%;" onchange="toggleWarrantyMonths(${jobId})">
                    <option value="">เลือกประเภทประกัน</option>
                    <option value="clean">ล้าง (30 วัน)</option>
                    <option value="repair">ซ่อม (เลือกเดือน)</option>
                    <option value="install">ติดตั้ง (3 ปี)</option>
                  </select>`;
                // ในโหมดเลือกเอง: เตรียม dropdown เดือน แต่ซ่อนไว้จนกว่าจะเลือก repair
                monthSelect = `
                  <select id="warranty-months-${jobId}" style="margin-top:6px;width:100%;display:none;">
                    <option value="">เลือกเดือนประกัน</option>
                    <option value="3">3 เดือน</option>
                    <option value="6">6 เดือน</option>
                    <option value="12">12 เดือน</option>
                  </select>`;
              }

              if (kind === 'repair') {
                monthSelect = `
                  <select id="warranty-months-${jobId}" style="margin-top:6px;width:100%;">
                    <option value="">เลือกเดือนประกัน</option>
                    <option value="3">3 เดือน</option>
                    <option value="6">6 เดือน</option>
                    <option value="12">12 เดือน</option>
                  </select>`;
              }

              // ถ้า kind มาจาก detect → เก็บเป็น hidden เพื่อ backward compatible
              const kindHidden = (kind && !kindSelect)
                ? `<input type="hidden" id="warranty-kind-${jobId}" value="${kind}">`
                : '';

              return `
                ${kindHidden}
                <div class="pill" style="margin-top:6px;background:#eff6ff;border-color:rgba(37,99,235,0.25);color:#0f172a;">${label}</div>
                ${kindSelect}
                ${monthSelect}
              `;
            })()}
          </div>

          <div>
            <b>📝 หมายเหตุช่าง</b>
            <textarea id="note-${keyBase}" rows="3" style="margin-top:6px;" placeholder="เจอปัญหาอะไร ใส่ไว้ได้" ${!canEdit ? "disabled" : ""} oninput="noteDraftChanged('${jobKeyJs}')">${escape(getNoteDraft(keyBase) || job.technician_note || "")}</textarea>

            ${historyMode ? "" : ((checkedIn || isWorking) ? `
              <div class="row" style="margin-top:8px;gap:10px;flex-wrap:wrap;">
                <button class="secondary" type="button" style="width:auto;" onclick="saveNote('${jobKeyJs}')" ${!canEdit ? "disabled" : ""}>💾 บันทึกหมายเหตุ</button>
                ${isWorking ? `
                  <button type="button" style="width:auto;" onclick="requestFinalize('${jobKeyJs}', 'เสร็จแล้ว')">✅ เสร็จสิ้น</button>
                  <button class="danger" type="button" style="width:auto;" onclick="requestFinalize('${jobKeyJs}', 'ยกเลิก')">⛔ ยกเลิก</button>
                ` : ``}
              </div>
            ` : ``)}
            <div id="note-status-${jobId}" style="margin-top:6px;"></div>
          </div>
        </div>
      </details>
    ` : `
      <div class="muted" style="margin-top:10px;">* หลังจาก “เช็คอิน” แล้ว จะเปิดให้ใส่รูป/หมายเหตุ (ปุ่มเสร็จสิ้น/ยกเลิก จะขึ้นหลังเริ่มทำงาน) *</div>
    `}
  `;

  setTimeout(() => {
    loadPricing(jobId);
    loadTeam(jobId);
    if (showWorkTools) refreshPhotoStatus(jobId);
  }, 0);

  return div;
}


// =======================================
// 📚 HISTORY (compact summary + expandable details)
// - แสดงรายการงานแบบย่อ ตามที่สั่ง
// - ยังดูรายละเอียดเต็ม (เดิม) ได้ (ไม่ regression)
// =======================================
function buildHistorySummary(job){
  const div = document.createElement('div');
  div.className = 'job-card';

  const st = normStatus(job?.job_status);
  const bookingCode = job?.booking_code || (job?.job_id != null ? ("CWF" + String(job.job_id).padStart(7,'0')) : '-');
  const apYmd = ymdBkkFromISO(job?.appointment_datetime);
  const apTxt = job?.appointment_datetime ? new Date(job.appointment_datetime).toLocaleString('th-TH') : '-';
  const price = Number(job?.job_price || 0);
  const priceTxt = isFinite(price) ? price.toLocaleString('th-TH') + ' บาท' : '-';

  const badge = (st === 'เสร็จแล้ว' || st === 'เสร็จสิ้น' || st === 'ปิดงาน' || st === 'done' || st === 'completed')
    ? '<span class="badge ok">✅ เสร็จแล้ว</span>'
    : '<span class="badge bad">⛔ ยกเลิก</span>';

  const esc = (s)=> String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const cust = esc(job?.customer_name || '-');
  const type = esc(job?.job_type || '-');

  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
      <div style="min-width:0;">
        <b>📌 ${esc(bookingCode)}</b>
        <div class="muted" style="font-size:12px;margin-top:2px;">${apTxt}</div>
      </div>
      ${badge}
    </div>
    <div class="muted" style="margin-top:8px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
      <span><b>ลูกค้า:</b> ${cust}</span>
      <span title="ยอดที่ลูกค้าชำระ">💰 ${priceTxt}</span>
    </div>
    <div class="muted" style="margin-top:4px;"><b>ประเภท:</b> ${type}</div>

    <details class="cwf-details" style="margin-top:10px;">
      <summary>ดูรายละเอียด</summary>
      <div class="cwf-details-body" data-role="history-full"></div>
    </details>
  `;

  // lazy render full card inside details
  const det = div.querySelector('details');
  const box = div.querySelector('[data-role="history-full"]');
  let mounted = false;
  if (det && box){
    det.addEventListener('toggle', ()=>{
      if (det.open && !mounted){
        try { box.appendChild(buildJobCard(job, true)); } catch(e) {}
        mounted = true;
      }
    });
  }

  return div;
}


window.startTravel = startTravel;
window.startWork = startWork;
window.requestFinalize = requestFinalize;



// =======================================
// 🧭 NAVIGATION (Google Maps)
// - ถ้ามีพิกัด: เปิดแบบ lat,lng
// - ถ้าไม่มีพิกัด: ใช้ค้นหาจากที่อยู่
// =======================================
function openNav(lat, lng, addressText) {
  try {
    let url = "";
    const direct = String(mapsUrl || "").trim();
    if (direct) {
      window.open(direct, "_blank");
      return;
    }

    const hasLatLng = lat !== null && lng !== null && lat !== "null" && lng !== "null" && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng));

    if (hasLatLng) {
      url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lat + "," + lng)}&travelmode=driving`;
    } else {
      const q = (addressText || "").toString().trim();
      if (!q) return alert("ไม่มีพิกัด/ที่อยู่สำหรับนำทาง");
      url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
    }

    window.open(url, "_blank");
  } catch (e) {
    alert("เปิดแผนที่ไม่สำเร็จ");
  }
}


// =======================================
// 🚗/📍/🛠️ WORKFLOW (เดินทาง -> เช็คอิน -> เริ่มทำงาน)
// =======================================
async function startTravel(jobId) {
  try {
    const keyBase = String(jobId || '').trim();
    const called = !!localStorage.getItem(`cwf_called_${keyBase}`);
    if (!called) {
      alert("ต้องกด ‘โทรลูกค้า’ ก่อน ถึงจะเริ่มเดินทางได้");
      return;
    }

    // ✅ บันทึกในเครื่อง เพื่อให้ปุ่มเปลี่ยนสถานะทันที
    localStorage.setItem(`cwf_travel_${keyBase}`, String(Date.now()));

    // เปิดแผนที่ (หลังจากกดเริ่มเดินทาง ถึงจะแสดง GPS/ปุ่มเช็คอิน)
    const job = (window.__JOB_CACHE__ || []).find(j => String(j.job_id) === keyBase || String(j.booking_code||'') === keyBase);
    // ✅ ใช้ maps_url เดียวกับปุ่ม “แผนที่” เพื่อกันนำทางเพี้ยนเมื่อแอดมินใส่ URL ที่ถูกต้องอยู่แล้ว
    if (job) openMaps(job.gps_latitude, job.gps_longitude, job.address_text, job.maps_url);

    // แจ้ง backend (optional)
    await fetch(`${API_BASE}/jobs/${encodeURIComponent(keyBase)}/travel-start`, { method: "POST" }).catch(() => {});
  } finally {
    loadJobs();
  }
}

async function startWork(jobId) {
  try {
    await fetch(`${API_BASE}/jobs/${encodeURIComponent(String(jobId))}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "กำลังทำ" }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "เริ่มงานไม่สำเร็จ");
        return data;
      });

    loadJobs();
  } catch (e) {
    alert(`❌ ${e.message}`);
  }
}




// =======================================
// 🔁 WORKFLOW NEXT (ปุ่มเดียวสลับขั้นตอน)
// - ลำดับ: เริ่มเดินทาง -> เช็คอิน -> เริ่มทำงาน -> จ่ายเงิน -> e-slip
// - เงื่อนไข: ต้องโทรลูกค้าก่อน ถึงจะเริ่มเดินทางได้
// =======================================
function workflowNext(jobId) {
  try {
    const raw = String(jobId || '').trim();
    const cache = (window.__JOB_CACHE__ || []);
    const job = cache.find(j => String(j.job_id) === raw || String(j.booking_code||'') === raw) || null;
    const id = job ? Number(job.job_id) : Number(raw);
    const keyBase = raw || String(id || '');
    if (!job) {
      alert("ไม่พบข้อมูลงาน (ลองรีเฟรช)");
      return;
    }

    const status = normStatus(job.job_status);
    const called = !!localStorage.getItem(`cwf_called_${keyBase}`);
    const travelStarted = !!localStorage.getItem(`cwf_travel_${keyBase}`) || !!job.travel_started_at;
    const checkedIn = !!job.checkin_at;
    const paid = !!job.paid_at || String(job.payment_status || "").trim().toLowerCase() === "paid";
    const isWorking = status === "กำลังทำ";

    // งานปิดแล้ว: ให้ไปดู e-slip (ถ้ามี) และจบ
    if (status === "เสร็จแล้ว" || status === "ยกเลิก") {
      if (paid) return openESlip(keyBase);
      alert("งานนี้ปิดแล้ว");
      return;
    }

    if (!travelStarted) {
      if (!called) {
        alert("ต้องกด ‘โทรลูกค้า’ ก่อน ถึงจะเริ่มเดินทางได้");
        return;
      }
      return startTravel(keyBase);
    }

    if (!checkedIn) {
      return checkin(keyBase);
    }

    if (!isWorking) {
      return startWork(keyBase);
    }

    if (!paid) {
      return payJob(keyBase);
    }

    // จ่ายแล้ว => ดู e-slip ได้ตลอด
    return openESlip(keyBase);
  } catch (e) {
    console.error(e);
    alert("เกิดข้อผิดพลาดในการอัปเดตสถานะ");
  }
}
window.workflowNext = workflowNext;


// =======================================
// 💳 PAYMENT (จ่ายเงิน + QR + แนบสลิป + e-slip)
// - ปุ่ม "จ่ายเงิน" จะเด้งเป็น Popup แสดงยอดรวม + QR ให้ลูกค้าแสกน
// - กด "จ่ายแล้ว" => บันทึก paid_at ในระบบ + เปิดให้แนบรูปสลิป (phase = payment_slip)
// - e-slip (ย่อ) เปิดได้ที่ /docs/eslip/:job_id
// =======================================
const CWF_PROMPTPAY_PHONE = (window.CWF_PROMPTPAY_PHONE || "0653157648").replace(/[^0-9]/g, "");

// ✅ สร้าง URL รูป QR (PromptPay) ตามยอดเงิน
function buildPromptPayQrUrl(amount) {
  const amt = Number(amount || 0);
  // promptpay.io รองรับ amount เป็นเลขทศนิยมได้
  return `https://promptpay.io/${encodeURIComponent(CWF_PROMPTPAY_PHONE)}/${encodeURIComponent(amt.toFixed(2))}.png`;
}

let __payModalInited = false;
let __payJobId = null;

function ensurePayModal() {
  if (__payModalInited) return;
  __payModalInited = true;

  const wrap = document.createElement("div");
  wrap.id = "pay-modal";
  wrap.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,0.6);display:none;align-items:center;justify-content:center;z-index:9999;padding:16px;";
  wrap.innerHTML = `
    <div class="card" style="width:min(520px, 100%);">
      <h3 style="margin-top:0;">💳 ชำระเงิน</h3>
      <div class="muted" id="pay-subtitle">แสดง QR ให้ลูกค้าแสกน</div>

      <div class="card tight" style="margin-top:10px;">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div>
            <div class="muted">ยอดที่ต้องชำระ</div>
            <div style="font-size:22px;font-weight:900;" id="pay-total">0.00 บาท</div>
          </div>
          <div style="text-align:right;">
            <div class="muted">Booking</div>
            <div style="font-weight:800;" id="pay-booking">-</div>
          </div>
        </div>

        <div style="margin-top:10px;display:flex;justify-content:center;">
          <img id="pay-qr" src="" alt="QR" style="width:260px;height:260px;object-fit:contain;border-radius:16px;border:1px solid rgba(15,23,42,0.15);background:#fff;"/>
        </div>

        <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;justify-content:center;">
          <button class="secondary" type="button" style="width:auto;" id="btn-refresh-qr">🔄 สร้าง QR ใหม่</button>
        </div>

        <div class="muted" style="margin-top:8px;font-size:12px;">
          * ถ้า QR หมดอายุ/ไม่ขึ้น ให้กด “สร้าง QR ใหม่” ได้ตลอด
        </div>
      </div>

      <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;">
        <button class="secondary" type="button" style="width:auto;" onclick="closePayModal()">ปิด</button>
        <button type="button" style="width:auto;" id="btn-paid">✅ จ่ายแล้ว (แนบสลิป)</button>
        <button class="secondary" type="button" style="width:auto;display:none;" id="btn-eslip">🧾 เปิด e-slip</button>
      </div>

      <div id="pay-msg" class="muted" style="margin-top:8px;"></div>
    </div>
  `;
  document.body.appendChild(wrap);

  window.closePayModal = () => {
    const el = document.getElementById("pay-modal");
    if (el) el.style.display = "none";
    __payJobId = null;
  };
}

async function payJob(jobId) {
  const id = Number(jobId);
  if (!id) return;

  ensurePayModal();
  __payJobId = id;

  const modal = document.getElementById("pay-modal");
  const tEl = document.getElementById("pay-total");
  const bEl = document.getElementById("pay-booking");
  const qrEl = document.getElementById("pay-qr");
  const btnRefresh = document.getElementById("btn-refresh-qr");
  const msgEl = document.getElementById("pay-msg");
  const btnPaid = document.getElementById("btn-paid");
  const btnE = document.getElementById("btn-eslip");

  if (msgEl) msgEl.textContent = "";
  if (btnE) btnE.style.display = "none";

  // หา job จาก cache เพื่อโชว์ booking
  const job = (window.__JOB_CACHE__ || []).find(j => Number(j.job_id) === id) || {};
  const bookingCode = job.booking_code || ("CWF" + String(id).padStart(7, "0"));
  if (bEl) bEl.textContent = bookingCode;

  // ดึงยอดรวม (ใช้ pricing เป็นหลัก)
  let total = Number(job.job_price || 0);
  try {
    const rr = await fetch(`${API_BASE}/jobs/${id}/pricing`);
    if (rr.ok) {
      const data = await rr.json().catch(() => ({}));
      total = Number(data.total || total || 0);
    }
  } catch {
    // ignore
  }

  if (tEl) tEl.textContent = `${total.toFixed(2)} บาท`;
  const renderQr = () => {
    if (!qrEl) return;
    const ts = Date.now();
    qrEl.src = `${buildPromptPayQrUrl(total)}?ts=${ts}`;
  };
  if (qrEl) {
    // fallback: ถ้า promptpay.io ถูกบล็อค/ล่ม ให้ใช้ QR สำรอง (ถ้าตั้งค่าไว้)
    qrEl.onerror = () => {
      const fallback = window.CWF_STATIC_QR_URL || "";
      if (fallback) {
        qrEl.src = `${fallback}?ts=${Date.now()}`;
      }
    };
  }
  renderQr();
  if (btnRefresh) {
    btnRefresh.onclick = () => {
      renderQr();
      if (msgEl) msgEl.textContent = "🔄 สร้าง QR ใหม่แล้ว";
    };
  }

  if (btnPaid) {
    btnPaid.disabled = false;
    // IMPORTANT: Mobile/PWA บางรุ่นจะ "บล็อค" file picker ถ้าเรียกหลัง await
    // แก้โดย: เปิด picker แบบ synchronous ก่อน แล้วค่อยยิง API / อัปโหลด
    btnPaid.onclick = () => {
      try {
        // 1) เปิดเลือกสลิปก่อน (ไม่ await) เพื่อให้ iOS/Android WebView อนุญาต
        openFilePicker({ multiple: false, accept: 'image/*' }, async (files) => {
          if (!files || !files.length) {
            showToast('ยังไม่ได้เลือกสลิป', 'error');
            return;
          }

          btnPaid.disabled = true;
          if (msgEl) msgEl.textContent = "กำลังบันทึกการชำระเงิน...";

          // 2) บันทึกการจ่ายเงิน
          const res = await fetch(`${API_BASE}/jobs/${id}/pay`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, amount: total }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "บันทึกการจ่ายเงินไม่สำเร็จ");

          if (msgEl) msgEl.textContent = "✅ บันทึกแล้ว กำลังแนบสลิป...";

          // 3) อัปโหลดสลิปแบบตรง (phase = payment_slip)
          await uploadFilesAsPhotos(id, 'payment_slip', files);

          if (msgEl) msgEl.textContent = "✅ แนบสลิปแล้ว";
          if (btnE) {
            btnE.style.display = "";
            btnE.onclick = () => openESlip(id);
          }

          loadJobs();
        });
      } catch (e) {
        console.error(e);
        alert(`❌ ${e.message}`);
        if (msgEl) msgEl.textContent = `❌ ${e.message}`;
      }
    };
  }

  if (modal) modal.style.display = "flex";
}
window.payJob = payJob;

function openESlip(jobId) {
  const id = Number(jobId);
  if (!id) return;

  // ===============================
  // 🧾 E-SLIP (Technician view)
  // เป้าหมาย: ให้รูปแบบเอกสาร "เหมือน" ฝั่งลูกค้า (Customer Tracking)
  // ✅ แก้เฉพาะการแสดงผล/หน้าตาเอกสารที่ช่างเห็น
  // ❌ ไม่แตะ DB / API / Controller
  // ❌ ไม่แตะ Logic การกด "เสร็จสิ้น" / สถานะงาน
  // ===============================

  // ดึง booking_code จาก cache (ถ้ามี) เพื่อให้หน้า eslip.html สามารถเรียก public/track ได้
  const job = (window.__JOB_CACHE__ || []).find(j => Number(j.job_id) === id) || {};
  const bookingCode = (job.booking_code || "").toString().trim();

  // ✅ ใส่ cache-busting เพื่อกัน WebView/PWA บางรุ่น "เปิดได้ครั้งเดียว"
  // และเพิ่ม fallback: ถ้า window.open ถูกบล็อค ให้เปลี่ยนหน้าแทน
  const ts = Date.now();
  const url = `/eslip.html?job_id=${encodeURIComponent(id)}&q=${encodeURIComponent(bookingCode)}&ts=${ts}`;

  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (!w) {
    // popup ถูกบล็อค/พฤติกรรม WebView บางรุ่น → เปิดในแท็บเดิม
    window.location.href = url;
  }
}
window.openESlip = openESlip;

// =======================================
// ✍️ SIGNATURE MODAL (ลายเซ็นต์ลูกค้า)
// - ต้องเด้งทุกครั้งเมื่อกด "เสร็จสิ้น" หรือ "ยกเลิก"
// =======================================
let __sigModalInited = false;
let __sigOnConfirm = null;

function ensureSignatureModal() {
  if (__sigModalInited) return;
  __sigModalInited = true;

  const wrap = document.createElement("div");
  wrap.id = "sig-modal";
  wrap.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,0.6);display:none;align-items:center;justify-content:center;z-index:9999;padding:16px;";
  wrap.innerHTML = `
    <div class="card" style="width:min(520px, 100%);">
      <h3 style="margin-top:0;">✍️ ลายเซ็นต์ลูกค้า</h3>
      <div class="muted">ให้ลูกค้าเซ็นเพื่อยืนยัน “เสร็จสิ้น/ยกเลิก” งาน</div>
      <div style="margin-top:10px;border:1px solid rgba(15,23,42,0.15);border-radius:14px;overflow:hidden;background:#fff;">
        <canvas id="sig-canvas" width="480" height="220" style="width:100%;height:auto;touch-action:none;"></canvas>
      </div>
      <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;">
        <button class="secondary" type="button" style="width:auto;" id="sig-clear">ล้างลายเซ็น</button>
        <button class="danger" type="button" style="width:auto;" id="sig-cancel">ยกเลิก</button>
        <button type="button" style="width:auto;" id="sig-confirm">ยืนยัน</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  const canvas = wrap.querySelector("#sig-canvas");
  const ctx = canvas.getContext("2d");
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  let drawing = false;
  let hasStroke = false;

  const getPos = (evt) => {
    const rect = canvas.getBoundingClientRect();
    const t = evt.touches?.[0];
    const clientX = t ? t.clientX : evt.clientX;
    const clientY = t ? t.clientY : evt.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const start = (evt) => {
    drawing = true;
    const p = getPos(evt);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    evt.preventDefault?.();
  };
  const move = (evt) => {
    if (!drawing) return;
    const p = getPos(evt);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    hasStroke = true;
    evt.preventDefault?.();
  };
  const end = (evt) => {
    drawing = false;
    evt.preventDefault?.();
  };

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);

  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end, { passive: false });

  wrap.querySelector("#sig-clear").onclick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasStroke = false;
  };

  wrap.querySelector("#sig-cancel").onclick = () => {
    wrap.style.display = "none";
    __sigOnConfirm = null;
  };

  wrap.querySelector("#sig-confirm").onclick = () => {
    if (!hasStroke) return alert("ให้ลูกค้าเซ็นก่อน");
    const dataUrl = canvas.toDataURL("image/png");
    wrap.style.display = "none";

    if (typeof __sigOnConfirm === "function") {
      const fn = __sigOnConfirm;
      __sigOnConfirm = null;
      fn(dataUrl);
    }
  };
}

function openSignatureModal(onConfirm) {
  ensureSignatureModal();
  const wrap = document.getElementById("sig-modal");
  if (!wrap) return;
  __sigOnConfirm = onConfirm;

  // เคลียร์ canvas ทุกครั้ง
  const canvas = wrap.querySelector("#sig-canvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  wrap.style.display = "flex";
}

// =======================================
// 🛡️ WARRANTY MODAL (กันหลุด UX)
// - บังคับเลือกประกันก่อน "เสร็จแล้ว" (เฉพาะงานซ่อมต้องเลือก 3/6/12 เดือน)
// - ทำเป็น fail-open: ถ้าระบบเดิมมี field อยู่แล้ว จะใช้ของเดิมเป็นฐาน
// =======================================
let __wModalInited = false;
let __wOnConfirm = null;

function ensureWarrantyModal(){
  if (__wModalInited) return;
  __wModalInited = true;

  const wrap = document.createElement('div');
  wrap.id = 'warranty-modal';
  wrap.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.60);display:none;align-items:center;justify-content:center;z-index:9998;padding:16px;';
  wrap.innerHTML = `
    <div class="card" style="width:min(520px,100%);">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
        <div>
          <h3 style="margin:0;">🛡️ ระบุประกันก่อนปิดงาน</h3>
          <div class="muted" id="warranty-modal-sub" style="margin-top:4px;">งานซ่อมต้องเลือก 3/6/12 เดือน</div>
        </div>
        <button class="secondary" type="button" id="warranty-cancel" style="width:auto;">ปิด</button>
      </div>

      <div style="margin-top:12px;">
        <label>เลือกประกัน (งานซ่อม)</label>
        <select id="warranty-months-pick">
          <option value="">เลือก...</option>
          <option value="3">3 เดือน</option>
          <option value="6">6 เดือน</option>
          <option value="12">12 เดือน</option>
        </select>
        <div class="muted" style="margin-top:6px;">งานล้าง 30 วัน / งานติดตั้ง 3 ปี ระบบจะตั้งให้โดยอัตโนมัติ</div>
      </div>

      <div class="row" style="margin-top:14px;">
        <button class="warning" type="button" id="warranty-confirm" style="width:100%;">ยืนยัน</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  wrap.querySelector('#warranty-cancel').onclick = () => {
    wrap.style.display = 'none';
    __wOnConfirm = null;
  };
  wrap.querySelector('#warranty-confirm').onclick = () => {
    const v = wrap.querySelector('#warranty-months-pick').value;
    const months = Number(v || 0);
    if (![3,6,12].includes(months)) return alert('กรุณาเลือก 3 / 6 / 12 เดือน');
    wrap.style.display = 'none';
    if (typeof __wOnConfirm === 'function') {
      const fn = __wOnConfirm; __wOnConfirm = null;
      fn(months);
    }
  };
}

function openWarrantyModal(ctx, onConfirm){
  ensureWarrantyModal();
  __wOnConfirm = onConfirm;
  const wrap = document.getElementById('warranty-modal');
  if (!wrap) return;

  // preset
  const pick = wrap.querySelector('#warranty-months-pick');
  if (pick) pick.value = ([3,6,12].includes(Number(ctx?.months||0)) ? String(ctx.months) : '');
  wrap.style.display = 'flex';
}

window.openWarrantyModal = openWarrantyModal;

// Toggle months dropdown when warranty kind is user-selectable
function toggleWarrantyMonths(jobId){
  try{
    const k = document.getElementById(`warranty-kind-${jobId}`);
    const m = document.getElementById(`warranty-months-${jobId}`);
    if (!m) return;
    const val = (k?.value || '').trim();
    const show = val === 'repair';
    m.style.display = show ? '' : 'none';
    if (!show) m.value = '';
  }catch{}
}
window.toggleWarrantyMonths = toggleWarrantyMonths;

// =======================================
// 🗓️ TECH WORKDAYS / OFF-DAYS (v2)
// - ตั้งวันหยุดประจำสัปดาห์ + วันหยุดล่วงหน้า (override)
// - ใช้ backend: /technicians/:username/weekly-off-days และ /technicians/:username/workdays-v2
// =======================================
let __workdaysModalInited = false;

function ensureWorkdaysModal(){
  if (__workdaysModalInited) return;
  __workdaysModalInited = true;

  const wrap = document.createElement('div');
  wrap.id = 'workdays-modal';
  wrap.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:99999;background:rgba(0,0,0,0.45);padding:16px;';
  wrap.innerHTML = `
    <div class="card" style="width:min(560px,100%);max-height:90vh;overflow:auto;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
        <div>
          <h3 style="margin:0;">🗓️ ตั้งค่าวันหยุดของฉัน</h3>
          <div class="muted" style="margin-top:4px;font-size:12px;">ตั้งวันหยุดประจำสัปดาห์ + ตั้งวันหยุดล่วงหน้า (วันนี้ถึง 14 วัน)</div>
        </div>
        <button class="secondary" type="button" id="workdays-close" style="width:auto;">ปิด</button>
      </div>

      <div style="margin-top:12px;">
        <b>วันหยุดประจำสัปดาห์</b>
        <div class="muted" style="margin-top:4px;font-size:12px;">เลือกวันหยุดทุกสัปดาห์ (เช่น อาทิตย์/เสาร์)</div>
        <div id="weekly-off-grid" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px;"></div>
        <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;">
          <button class="warning" type="button" id="weekly-save" style="width:auto;">บันทึกวันหยุดประจำสัปดาห์</button>
          <span class="muted" id="weekly-status" style="font-size:12px;"></span>
        </div>
      </div>

      <hr style="margin:12px 0;"/>

      <div>
        <b>วันหยุดล่วงหน้า (Override)</b>
        <div class="muted" style="margin-top:4px;font-size:12px;">ใช้กรณีอยากหยุดเพิ่ม/ทำงานเพิ่มเป็นรายวัน</div>
        <div id="override-list" style="margin-top:10px;display:grid;gap:8px;"></div>
        <div class="muted" id="override-status" style="margin-top:8px;font-size:12px;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  wrap.querySelector('#workdays-close').onclick = () => { wrap.style.display = 'none'; };
}

function toIsoDateLocal(d){
  const dt = (d instanceof Date) ? d : new Date(d);
  if (!dt || Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth()+1).padStart(2,'0');
  const dd = String(dt.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}

async function loadWorkdaysModalData(){
  const wrap = document.getElementById('workdays-modal');
  if (!wrap) return;
  const weeklyGrid = wrap.querySelector('#weekly-off-grid');
  const weeklyStatus = wrap.querySelector('#weekly-status');
  const overrideList = wrap.querySelector('#override-list');
  const overrideStatus = wrap.querySelector('#override-status');
  if (weeklyStatus) weeklyStatus.textContent = 'กำลังโหลด...';
  if (overrideStatus) overrideStatus.textContent = '';
  if (weeklyGrid) weeklyGrid.innerHTML = '';
  if (overrideList) overrideList.innerHTML = '';

  const dayLabels = ['อา','จ','อ','พ','พฤ','ศ','ส'];

  try{
    // weekly
    const wres = await fetch(`${API_BASE}/technicians/${encodeURIComponent(username)}/weekly-off-days`);
    const w = await wres.json().catch(()=>({}));
    if (!wres.ok) throw new Error(w.error || 'โหลดวันหยุดไม่สำเร็จ');
    const days = Array.isArray(w.days) ? w.days : [];

    if (weeklyGrid){
      weeklyGrid.innerHTML = dayLabels.map((lb, idx)=>{
        const checked = days.includes(idx);
        return `
          <label style="display:flex;align-items:center;gap:8px;padding:10px 10px;border-radius:14px;border:1px solid rgba(15,23,42,0.10);background:rgba(15,23,42,0.03);cursor:pointer;">
            <input type="checkbox" data-day="${idx}" ${checked?'checked':''} style="transform:scale(1.15);"/>
            <span style="font-weight:900;">${lb}</span>
          </label>
        `;
      }).join('');
    }

    const saveBtn = wrap.querySelector('#weekly-save');
    if (saveBtn){
      saveBtn.onclick = async () => {
        try{
          const picks = Array.from(wrap.querySelectorAll('#weekly-off-grid input[type="checkbox"]'))
            .filter(el=>el.checked)
            .map(el=>Number(el.getAttribute('data-day')))
            .filter(n=>Number.isFinite(n));
          if (weeklyStatus) weeklyStatus.textContent = 'กำลังบันทึก...';
          const pres = await fetch(`${API_BASE}/technicians/${encodeURIComponent(username)}/weekly-off-days`, {
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ days: picks })
          });
          const pd = await pres.json().catch(()=>({}));
          if (!pres.ok) throw new Error(pd.error || 'บันทึกไม่สำเร็จ');
          if (weeklyStatus) weeklyStatus.textContent = '✅ บันทึกแล้ว';
        }catch(e){
          if (weeklyStatus) weeklyStatus.textContent = `❌ ${e.message}`;
        }
      };
    }

    if (weeklyStatus) weeklyStatus.textContent = '';

    // overrides (today..+14)
    const from = toIsoDateLocal(new Date());
    const to = toIsoDateLocal(new Date(Date.now()+14*86400000));
    const ores = await fetch(`${API_BASE}/technicians/${encodeURIComponent(username)}/workdays-v2?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    const od = await ores.json().catch(()=>({}));
    if (!ores.ok) throw new Error(od.error || 'โหลดวันหยุดล่วงหน้าไม่สำเร็จ');
    const items = Array.isArray(od.items) ? od.items : [];
    const byDate = new Map(items.map(it=>[String(it.work_date), !!it.is_off]));

    // render 15 days
    const daysToShow = [];
    const base = new Date(); base.setHours(0,0,0,0);
    for (let i=0;i<=14;i++){
      const d = new Date(base.getTime()+i*86400000);
      const iso = toIsoDateLocal(d);
      const dow = d.getDay();
      const weeklyOff = Array.isArray(days) && days.includes(dow);
      const overrideOff = byDate.has(iso) ? byDate.get(iso) : null; // null = no override
      daysToShow.push({ iso, d, dow, weeklyOff, overrideOff });
    }

    if (overrideList){
      overrideList.innerHTML = daysToShow.map(x=>{
        const label = x.d.toLocaleDateString('th-TH', { weekday:'short', year:'numeric', month:'2-digit', day:'2-digit' });
        const effectiveOff = (x.overrideOff===null) ? x.weeklyOff : x.overrideOff;
        const sub = (x.overrideOff===null)
          ? (x.weeklyOff ? 'อิงวันหยุดประจำสัปดาห์' : 'อิงวันทำงานปกติ')
          : 'ตั้งค่า override แล้ว';
        return `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:16px;border:1px solid rgba(15,23,42,0.10);background:rgba(255,255,255,0.75);">
            <div style="min-width:0;">
              <div style="font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${label}</div>
              <div class="muted" style="font-size:12px;margin-top:2px;">${sub}</div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
              <span class="badge ${effectiveOff?'wait':'done'}" style="min-width:74px;text-align:center;">${effectiveOff?'วันหยุด':'ทำงาน'}</span>
              <button class="secondary" type="button" data-date="${x.iso}" style="width:auto;min-height:36px;padding:8px 10px;">${(x.overrideOff===null)?'ตั้งค่า':'เปลี่ยน'}</button>
            </div>
          </div>
        `;
      }).join('');

      Array.from(overrideList.querySelectorAll('button[data-date]')).forEach(btn=>{
        btn.onclick = async () => {
          const date = btn.getAttribute('data-date');
          if (!date) return;
          try{
            const current = byDate.has(date) ? byDate.get(date) : null;
            // Toggle: null -> true (mark off), true -> false (mark work), false -> true
            const next = (current===null) ? true : !current;
            if (overrideStatus) overrideStatus.textContent = `กำลังบันทึก ${date}...`;
            const pres = await fetch(`${API_BASE}/technicians/${encodeURIComponent(username)}/workdays-v2`, {
              method:'PUT',
              headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ work_date: date, is_off: next })
            });
            const pd = await pres.json().catch(()=>({}));
            if (!pres.ok) throw new Error(pd.error || 'บันทึกไม่สำเร็จ');
            byDate.set(date, next);
            if (overrideStatus) overrideStatus.textContent = '✅ บันทึกแล้ว';
            // re-render quickly
            loadWorkdaysModalData();
          }catch(e){
            if (overrideStatus) overrideStatus.textContent = `❌ ${e.message}`;
          }
        };
      });
    }
  }catch(e){
    if (weeklyStatus) weeklyStatus.textContent = `❌ ${e.message}`;
    if (overrideStatus) overrideStatus.textContent = '';
  }
}

function openWorkdaysModal(){
  ensureWorkdaysModal();
  const wrap = document.getElementById('workdays-modal');
  if (!wrap) return;
  wrap.style.display = 'flex';
  loadWorkdaysModalData();
}
window.openWorkdaysModal = openWorkdaysModal;

// =======================================
// ✅ FINALIZE (เสร็จสิ้น / ยกเลิก) + ลายเซ็นต์
// =======================================
function requestFinalize(jobId, targetStatus, _skipWarrantyPrompt) {
  // IMPORTANT (production hotfix):
  // ปิดงานให้เหลือ "เงื่อนไขเดียว" คือ ต้องมีลายเซ็นต์เท่านั้น
  // (ไม่บังคับเลือกประกันในฝั่งช่าง เพื่อกันงานค้าง)
  // เปิดลายเซ็นต์ก่อน (ถ้ากดยกเลิกในลายเซ็นต์ จะต้องกลับไปเลือกใหม่เอง)
  // งานทีม: ช่างแต่ละคนกดเสร็จเฉพาะของตัวเองก่อน
  if (targetStatus === 'เสร็จแล้ว') {
    (async () => {
      try {
        // fail-open: ถ้า endpoint ไม่มี ให้ fallback ไป flow เดิม
        const r = await fetch(`${API_BASE}/jobs/${encodeURIComponent(String(jobId))}/assignment-done`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ technician_username: (typeof username === 'string' ? username : '') || '' }),
        });
        const data = await r.json().catch(() => ({}));
        if (r.ok && data && data.all_done === false) {
          alert('✅ บันทึกเสร็จของคุณแล้ว\nรอช่างคนอื่นในทีมทำงานต่อ');
          // รีเฟรชรายการงาน -> งานจะหายเฉพาะช่างคนนี้
          loadJobs();
          return;
        }
      } catch (e) {
        // fail-open
        console.warn('[assignment-done] fail-open', e);
      }
      openSignatureModal((signatureDataUrl) => finalizeJob(jobId, targetStatus, signatureDataUrl));
    })();
    return;
  }

  openSignatureModal((signatureDataUrl) => finalizeJob(jobId, targetStatus, signatureDataUrl));
}

async function finalizeJob(jobId, targetStatus, signatureDataUrl) {
  try {
    // อัปโหลดรูปค้างก่อน (แต่ห้ามล็อคการปิดงาน)
    // เคสที่เจอบ่อย: fetch ค้าง/timeout หรือ photo_id ไม่ตรงกับ server ทำให้กดปิดงานแล้วเงียบ
    const up = await uploadPendingPhotos(jobId, { failOpen: true, timeoutMs: 15000 });
    if (up && up.failedCount > 0) {
      const ok = confirm(`มีรูปค้างที่อัปโหลดไม่สำเร็จ ${up.failedCount} รูป\nต้องการปิดงานต่อเลยไหม?\n(รูปจะยังค้างในเครื่องและกดอัปโหลดทีหลังได้)`);
      if (!ok) return;
    }

    // บันทึก note ล่าสุด (เพื่อส่งให้แอดมินตอนยกเลิก)
    const note = (document.getElementById(`note-${jobId}`)?.value || "").trim();
    await fetch(`${API_BASE}/jobs/${encodeURIComponent(String(jobId))}/note`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    }).catch(() => {});

    const res = await fetch(`${API_BASE}/jobs/${encodeURIComponent(String(jobId))}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: targetStatus,
        signature_data: signatureDataUrl,
        note,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "ปิดงาน/ยกเลิกไม่สำเร็จ");

    alert(targetStatus === "ยกเลิก" ? "⛔ ยกเลิกงานเรียบร้อย" : "✅ เสร็จสิ้นงานเรียบร้อย");
    loadJobs();
  } catch (e) {
    alert(`❌ ${e.message}`);
  }
}


// =======================================
// ✅ STATUS
// =======================================
function setStatus(jobId, status) {
  fetch(`${API_BASE}/jobs/${encodeURIComponent(String(jobId))}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "อัปเดตสถานะไม่สำเร็จ");
      return data;
    })
    .then(() => loadJobs())
    .catch((e) => alert(`❌ ${e.message}`));
}

async function closeJob(jobId) {
  try {
    await uploadPendingPhotos(jobId, { failOpen: true, timeoutMs: 15000 });

    const res = await fetch(`${API_BASE}/jobs/${encodeURIComponent(String(jobId))}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "เสร็จแล้ว" }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "ปิดงานไม่สำเร็จ");

    alert("✅ ปิดงานเรียบร้อย");
    loadJobs(); // ✅ จะหายจาก “งานปัจจุบัน” และไป “ประวัติงาน”
  } catch (e) {
    console.error(e);
    alert(`❌ ${e.message}`);
  }
}

// =======================================
// 📍 CHECK-IN
// =======================================
function checkin(jobId) {
  if (!navigator.geolocation) return alert("เครื่องนี้ไม่รองรับ GPS");

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      fetch(`${API_BASE}/jobs/${encodeURIComponent(String(jobId))}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "เช็คอินไม่สำเร็จ");
          return data;
        })
        .then(() => {
          const box = document.getElementById(`checkin-status-${jobId}`);
          if (box) box.innerHTML = "✅ เช็คอินสำเร็จ";
          loadJobs();
        })
        .catch((e) => alert(`❌ ${e.message}`));
    },
    () => alert("ขอสิทธิ์ GPS ไม่สำเร็จ/ถูกปฏิเสธ")
  );
}

// =======================================
// 📝 NOTE
// =======================================
function saveNote(jobId) {
  const el = document.getElementById(`note-${jobId}`);
  const note = (el?.value || "").trim();

  fetch(`${API_BASE}/jobs/${encodeURIComponent(String(jobId))}/note`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "บันทึกหมายเหตุไม่สำเร็จ");
      return data;
    })
    .then(() => {
      const box = document.getElementById(`note-status-${jobId}`);
      if (box) box.innerHTML = "✅ บันทึกแล้ว";
      // clear local draft after successful save
      try { clearNoteDraft(jobId); } catch(e) {}
    })
    .catch((e) => alert(`❌ ${e.message}`));
}

// =======================================
// 💰 PRICING
// =======================================
function loadPricing(jobId) {
  fetch(`${API_BASE}/jobs/${encodeURIComponent(String(jobId))}/pricing`)
    .then((res) => res.json())
    .then((data) => {
      const box = document.getElementById(`pricing-${jobId}`);
      if (!box) return;

      const itemsHtml =
        data.items && data.items.length
          ? data.items
              .map((it) => {
                const qty = Number(it.qty || 0);
                const up = Number(it.unit_price || 0);
                const lt = Number(it.line_total || qty * up);
                return `<li>${it.item_name} x${qty} @ ${up} = ${lt} บาท</li>`;
              })
              .join("")
          : "<li>ไม่มีรายการ</li>";

      box.innerHTML = `
        <div style="padding:10px;">
          <ul style="margin:8px 0 8px 18px;">${itemsHtml}</ul>
          <p>ราคาเต็ม: <b>${Number(data.subtotal || 0).toFixed(2)}</b> บาท</p>
          <p>ส่วนลด: <b>${Number(data.discount || 0).toFixed(2)}</b> บาท</p>
          <p>สุทธิ: <b>${Number(data.total || 0).toFixed(2)}</b> บาท</p>
        </div>
          <div class="row" style="margin-top:8px;flex-wrap:wrap;">          </div>
      `;
    })
    .catch(() => {
      const box = document.getElementById(`pricing-${jobId}`);
      if (box) box.textContent = "❌ โหลดราคาไม่สำเร็จ";
    });
}



// =======================================
// 👥 TEAM (Technician view)
// - แสดงรายชื่อช่างทุกคนที่ถูก assign ในงานเดียวกัน
// - ระบุช่างคนปัจจุบันว่า "คุณ"
// - ไม่พังงานช่างเดี่ยว / ถ้าโหลดไม่ได้ให้แสดงข้อความแทน
// =======================================
function loadTeam(jobId){
  const box = document.getElementById(`team-${jobId}`);
  if (!box) return;

  fetch(`${API_BASE}/jobs/${encodeURIComponent(String(jobId))}/team?details=1`, { cache: "no-store" })
    .then((res) => res.json())
    .then((data) => {
      const members = Array.isArray(data?.members) ? data.members : [];

      if (!members.length) {
        box.innerHTML = `<div class="muted">งานนี้ยังไม่มีทีมช่าง</div>`;
        return;
      }

      box.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${members.map(m => {
            const u = String(m.username || "").trim();
            const isMe = (u && u === username);
            const name = m.full_name || u || "-";
            const badge = isMe ? `<span class="badge ok" style="margin-left:6px;">คุณ</span>` : ``;
            const photo = m.photo || "/logo.png";
            return `
              <div style="display:flex;align-items:center;gap:10px;">
                <img src="${photo}" alt="${name}" style="width:40px;height:40px;border-radius:999px;object-fit:cover;border:2px solid rgba(37,99,235,0.18);background:#fff;">
                <div>
                  <div><b>${name}</b>${badge}</div>
                  <div class="muted" style="font-size:12px;">${u ? ("@" + u) : ""}</div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      `;
    })
    .catch(() => {
      box.innerHTML = `<div class="muted">❌ โหลดรายชื่อทีมไม่สำเร็จ</div>`;
    });
}
window.loadTeam = loadTeam;

// =======================================
// 📷 PHOTO STATUS
// =======================================
async function refreshPhotoStatus(jobId) {
  const box = document.getElementById(`photo-status-${jobId}`);
  if (!box) return;

  try {
    const all = await idbGetByJob(jobId);
    const byPhase = (ph) => all.filter((x) => x.phase === ph).length;

    // ✅ นับรูปที่อัปโหลดแล้วจากเซิร์ฟเวอร์ (ให้ช่างรู้ว่าขึ้นจริง)
    let uploaded = [];
    try {
      const rr = await fetch(`${API_BASE}/jobs/${encodeURIComponent(String(jobId))}/photos`);
      if (rr.ok) uploaded = (await rr.json()) || [];
    } catch {
      // ignore
    }
    const upByPhase = (ph) => (uploaded || []).filter((x) => x.phase === ph && x.public_url).length;

    box.innerHTML = `
      <div class="muted">
        ค้างในเครื่อง → ก่อนทำ: <b>${byPhase("before")}</b>,
        หลังทำ: <b>${byPhase("after")}</b>,
        วัดน้ำยา: <b>${byPhase("pressure")}</b>,
        วัดกระแส: <b>${byPhase("current")}</b>,
        อุณหภูมิ: <b>${byPhase("temp")}</b>,
        ตำหนิ: <b>${byPhase("defect")}</b>,
        สลิป: <b>${byPhase("payment_slip")}</b>
      </div>

      <div class="muted" style="margin-top:6px;">
        อัปโหลดแล้ว → ก่อนทำ: <b>${upByPhase("before")}</b>,
        หลังทำ: <b>${upByPhase("after")}</b>,
        วัดน้ำยา: <b>${upByPhase("pressure")}</b>,
        วัดกระแส: <b>${upByPhase("current")}</b>,
        อุณหภูมิ: <b>${upByPhase("temp")}</b>,
        ตำหนิ: <b>${upByPhase("defect")}</b>,
        สลิป: <b>${upByPhase("payment_slip")}</b>
      </div>

      <div class="row" style="margin-top:8px;gap:10px;flex-wrap:wrap;">
        <button class="secondary" type="button" style="width:auto;" onclick="openUploadedPhotos(${jobId})">🖼️ ดูรูปที่อัปโหลดแล้ว</button>
        <button class="secondary" type="button" style="width:auto;" onclick="forceUpload(${jobId})">⬆️ อัปโหลดค้างในเครื่อง</button>
      </div>
    `;
  } catch (e) {
    console.error(e);
    box.textContent = "❌ โหลดสถานะรูปไม่สำเร็จ";
  }
}

// ✅ แสดงรูปที่อัปโหลดแล้ว (modal ง่าย ๆ)
async function openUploadedPhotos(jobId) {
  try {
    const rr = await fetch(`${API_BASE}/jobs/${encodeURIComponent(String(jobId))}/photos`);
    const photos = rr.ok ? (await rr.json()) : [];
    const list = Array.isArray(photos) ? photos.filter((p) => p.public_url) : [];

    if (!list.length) return alert("ยังไม่มีรูปที่อัปโหลดขึ้นเซิร์ฟเวอร์");

    const html = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:flex-end;justify-content:center;">
        <div style="width:100%;max-width:920px;background:#fff;border-radius:18px 18px 0 0;padding:14px;max-height:75vh;overflow:auto;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
            <b>🖼️ รูปที่อัปโหลดแล้ว (งาน #${jobId})</b>
            <button class="secondary" type="button" style="width:auto;" onclick="closeModal()">ปิด</button>
          </div>
          <div class="muted" style="margin-top:6px;">แตะรูปเพื่อเปิดเต็มจอ</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px;">
            ${list
              .map(
                (p) =>
                  `<a href="${p.public_url}" target="_blank" rel="noopener" style="display:block;">
                     <img src="${p.public_url}" alt="${p.phase}" style="width:100%;height:110px;object-fit:cover;border-radius:12px;border:1px solid rgba(0,0,0,.08);"/>
                   </a>`
              )
              .join("")}
          </div>
        </div>
      </div>
    `;

    // ปิด modal (ฟังก์ชัน global แบบเบา ๆ)
    window.closeModal = () => {
      const el = document.getElementById("cwf-modal");
      if (el) el.remove();
    };

    const wrap = document.createElement("div");
    wrap.id = "cwf-modal";
    wrap.innerHTML = html;
    document.body.appendChild(wrap);
  } catch (e) {
    console.error(e);
    alert("โหลดรูปไม่สำเร็จ");
  }
}
window.openUploadedPhotos = openUploadedPhotos;

// ✅ บังคับอัปโหลดค้างในเครื่อง (กดเอง)
async function forceUpload(jobId) {
  const id = Number(jobId);
  if (!id) return;
  try {
    const btn = document.querySelector(`#photo-status-${id} button`);
    if (btn) btn.disabled = true;
    await uploadPendingPhotos(id);
    await refreshPhotoStatus(id);
    alert("✅ อัปโหลดรูปค้างในเครื่องเรียบร้อย");
  } catch (e) {
    console.error(e);
    alert(`❌ ${e.message || "อัปโหลดไม่สำเร็จ"}`);
  } finally {
    const btn = document.querySelector(`#photo-status-${id} button`);
    if (btn) btn.disabled = false;
  }
}
window.forceUpload = forceUpload;

// =======================================
// ⬆️ UPLOAD PENDING PHOTOS
// =======================================
// Upload photos queued in IndexedDB.
// IMPORTANT: ต้องไม่ทำให้ "ปิดงาน" ค้าง/เงียบ (fail-open)
async function uploadPendingPhotos(jobId, opts) {
  const options = Object.assign({ failOpen: false, timeoutMs: 15000 }, opts || {});
  let items = [];
  try {
    // IMPORTANT: ถ้า IndexedDB ค้าง/blocked ต้องไม่ทำให้ "ปิดงาน" ค้างเงียบ
    items = await idbGetByJob(jobId);
  } catch (e) {
    console.warn('idbGetByJob failed, skip pending upload', e);
    if (options.failOpen) return { ok: true, failedCount: 0, skipped: true };
    throw e;
  }
  if (!items.length) return { ok: true, failedCount: 0 };

  let failedCount = 0;

  // small helper: fetch with timeout (กัน fetch ค้างแล้วไม่มี popup)
  async function fetchWithTimeout(url, fetchOpts) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), Number(options.timeoutMs) || 15000);
    try {
      return await fetch(url, Object.assign({}, fetchOpts || {}, { signal: controller.signal }));
    } finally {
      clearTimeout(t);
    }
  }

  for (const it of items) {
    try {
      // 1) try upload with existing photo_id
      const form = new FormData();
      form.append("photo", it.blob, it.original_name || "photo.jpg");

      let res = await fetchWithTimeout(`${API_BASE}/jobs/${encodeURIComponent(String(jobId))}/photos/${it.photo_id}/upload`, {
        method: "POST",
        body: form,
      });
      let data = await res.json().catch(() => ({}));

      // 2) if server lost metadata (404), recreate meta then retry once
      if (!res.ok && (res.status === 404 || String(data?.error || '').toLowerCase().includes('meta'))) {
        const metaRes = await fetchWithTimeout(`${API_BASE}/jobs/${encodeURIComponent(String(jobId))}/photos/meta`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phase: it.phase || 'unspecified',
            mime_type: it.mime_type || (it.blob && it.blob.type) || 'image/jpeg',
            original_name: it.original_name || 'photo.jpg',
            file_size: it.file_size || (it.blob ? it.blob.size : null),
            uploaded_by: (typeof username === 'string' ? username : '') || null,
          }),
        });
        const meta = await metaRes.json().catch(() => ({}));
        if (metaRes.ok && meta?.photo_id) {
          // replace local queue id -> new photo_id (keep blob)
          const oldId = it.photo_id;
          const newId = meta.photo_id;
          await idbPut(Object.assign({}, it, { photo_id: newId }));
          await idbDelete(oldId);

          const form2 = new FormData();
          form2.append("photo", it.blob, it.original_name || "photo.jpg");
          res = await fetchWithTimeout(`${API_BASE}/jobs/${encodeURIComponent(String(jobId))}/photos/${newId}/upload`, {
            method: "POST",
            body: form2,
          });
          data = await res.json().catch(() => ({}));
        }
      }

      if (!res.ok) throw new Error(data.error || "อัปโหลดรูปไม่สำเร็จ");

      // success -> remove from queue
      await idbDelete(it.photo_id);
    } catch (e) {
      failedCount++;
      console.error('uploadPendingPhotos item failed', e);
      if (!options.failOpen) throw e;
      // fail-open: keep item queued
    }
  }

  return { ok: failedCount === 0, failedCount };
}

// =======================================
// 📷 PICK PHOTOS (เข้าคิวลง IndexedDB)
// =======================================
// NOTE: ต้องมี helper เปิด file picker แบบ synchronous เพื่อไม่ให้ WebView บางรุ่นบล็อค
function openFilePicker(opts, onPicked){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = opts?.accept || 'image/*';
  input.multiple = !!opts?.multiple;
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  input.onchange = () => {
    const files = Array.from(input.files || []);
    try { onPicked && onPicked(files); } finally { input.remove(); }
  };
  document.body.appendChild(input);
  input.click();
}

// Upload a given File[] as job photos (same flow as pickPhotos)
async function uploadFilesAsPhotos(jobId, phase, files){
  const selected = Array.from(files || []);
  if (!selected.length) return;

  for (const f of selected) {
    const metaRes = await fetch(`${API_BASE}/jobs/${encodeURIComponent(String(jobId))}/photos/meta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phase,
        mime_type: f.type,
        original_name: f.name,
        file_size: f.size,
      }),
    });

    const meta = await metaRes.json().catch(() => ({}));
    if (!metaRes.ok) throw new Error(meta.error || "สร้าง meta ไม่สำเร็จ");

    const photo_id = meta.photo_id;
    try {
      const formNow = new FormData();
      formNow.append("photo", f, f.name || "photo.jpg");
      const upRes = await fetch(`${API_BASE}/jobs/${encodeURIComponent(String(jobId))}/photos/${photo_id}/upload`, {
        method: "POST",
        body: formNow,
      });
      const up = await upRes.json().catch(() => ({}));
      if (!upRes.ok) throw new Error(up.error || "อัปโหลดรูปไม่สำเร็จ");
    } catch (e) {
      // fail-open: เก็บค้างในเครื่อง แล้วให้กดอัปโหลดภายหลัง
      const buffer = await f.arrayBuffer();
      await idbPut({
        photo_id,
        job_id: Number(jobId),
        phase,
        mime_type: f.type,
        original_name: f.name,
        file_size: f.size,
        blob: new Blob([buffer], { type: f.type || 'image/jpeg' }),
        created_at: Date.now(),
      });
    }
  }
  try { await refreshPhotoStatus(jobId); } catch {}
}

async function pickPhotos(jobId, phase, maxFiles = 20) {
  try {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;

    input.onchange = async () => {
      const selected = Array.from(input.files || []).slice(0, maxFiles);
      if (!selected.length) return;

      for (const f of selected) {
        const metaRes = await fetch(`${API_BASE}/jobs/${encodeURIComponent(String(jobId))}/photos/meta`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phase,
            mime_type: f.type,
            original_name: f.name,
            file_size: f.size,
            uploaded_by: (typeof username === 'string' ? username : '') || null,
          }),
        });

        const meta = await metaRes.json().catch(() => ({}));
        if (!metaRes.ok) throw new Error(meta.error || "สร้าง meta ไม่สำเร็จ");

        const photo_id = meta.photo_id;

        const buffer = await f.arrayBuffer();
        // ✅ อัปโหลดทันที (ถ้าเน็ตพร้อม) - ถ้าไม่สำเร็จค่อยค้างในเครื่อง
        try {
          const formNow = new FormData();
          formNow.append("photo", f, f.name || "photo.jpg");

          const upRes = await fetch(`${API_BASE}/jobs/${encodeURIComponent(String(jobId))}/photos/${photo_id}/upload`, {
            method: "POST",
            body: formNow,
          });

          const upData = await upRes.json().catch(() => ({}));
          if (upRes.ok) {
            // อัปโหลดแล้ว ไม่ต้องค้างในเครื่อง
            continue;
          } else {
            console.warn("upload-now failed, fallback to idb:", upData.error || upRes.status);
          }
        } catch (e) {
          console.warn("upload-now error, fallback to idb:", e.message);
        }

        await idbPut({
          photo_id: Number(photo_id),
          job_id: Number(jobId),
          phase: String(phase),
          mime_type: f.type,
          original_name: f.name,
          file_size: f.size,
          blob: new Blob([buffer], { type: f.type }),
          created_at: Date.now(),
        });
      }

      alert("✅ รับรูปแล้ว (อัปโหลดทันทีถ้าเน็ตพร้อม / ถ้าไม่พร้อมจะค้างในเครื่อง)");
      refreshPhotoStatus(jobId);
    };

    input.click();
  } catch (e) {
    console.error(e);
    alert(`❌ ${e.message}`);
  }
}
