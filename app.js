

// ✅ งานปัจจุบัน: งานล่วงหน้า (sub-tab)
const activeUpcomingJobsEl = document.getElementById("active-upcoming-list");
const activeUpcomingHintEl = document.getElementById("activeUpcomingHint");
const activeUpcomingDateQuickEl = document.getElementById("activeUpcomingDateQuick");
const activeUpcomingDatePickerEl = document.getElementById("activeUpcomingDatePicker");
const btnUpcomingApplyEl = document.getElementById("btnUpcomingApply");
const btnUpcomingClearEl = document.getElementById("btnUpcomingClear");

// ✅ ฟิลเตอร์ประวัติงาน (วัน/เดือน/ทั้งหมด)
const historyTabDayEl = document.getElementById("tab-his-day");
const historyTabMonthEl = document.getElementById("tab-his-month");
const historyTabAllEl = document.getElementById("tab-his-all");
const historyFilterHintEl = document.getElementById("history-filter-hint");

const ACTIVE_UPCOMING_FILTER_KEY = "cwf_tech_upcoming_filter";
let __ACTIVE_UPCOMING_FILTER__ = "";
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
const serviceZoneModalEl = document.getElementById("serviceZoneModal");
const zoneQuickModalEl = document.getElementById("zoneQuickModal");
const quickZoneStatusEl = document.getElementById("quickZoneStatus");
const quickSecondaryServiceZoneEl = document.getElementById("quickSecondaryServiceZone");
const quickServiceRadiusKmEl = document.getElementById("quickServiceRadiusKm");
const quickAllowOutOfZoneEl = document.getElementById("quickAllowOutOfZone");
const btnSaveQuickZoneEl = document.getElementById("btnSaveQuickZone");
const serviceRadiusKmEl = document.getElementById("serviceRadiusKm");
const homeProvinceEl = document.getElementById("homeProvince");
const homeDistrictEl = document.getElementById("homeDistrict");
const homeZoneHintEl = document.getElementById("homeZoneHint");
const allowOutOfZoneEl = document.getElementById("allowOutOfZone");
const secondaryServiceZoneEl = document.getElementById("secondaryServiceZone");
const zoneQuickBtnEl = document.getElementById("zoneQuickBtn");
const btnSaveHomeZoneEl = document.getElementById("btnSaveHomeZone");

const HOME_DISTRICTS_BY_PROVINCE = {
  "กรุงเทพมหานคร": ["พระโขนง","บางนา","สวนหลวง","ประเวศ","บางกะปิ","สะพานสูง","ลาดกระบัง","ดอนเมือง","สายไหม","บางเขน","หลักสี่","จตุจักร","บางซื่อ","ลาดพร้าว","วังทองหลาง","บึงกุ่ม","คันนายาว","คลองสามวา","มีนบุรี","หนองจอก","ปทุมวัน","ราชเทวี","พญาไท","ดุสิต","พระนคร","ป้อมปราบศัตรูพ่าย","สัมพันธวงศ์","บางรัก","สาทร","ยานนาวา","ห้วยขวาง","ดินแดง","วัฒนา","คลองเตย","บางคอแหลม","คลองสาน","ธนบุรี","บางกอกใหญ่","บางกอกน้อย","บางพลัด","ตลิ่งชัน","ภาษีเจริญ","บางแค","หนองแขม","ทวีวัฒนา","จอมทอง","ราษฎร์บูรณะ","ทุ่งครุ","บางขุนเทียน","บางบอน"],
  "สมุทรปราการ": ["เมืองสมุทรปราการ","บางพลี","บางเสาธง","บางบ่อ","พระประแดง","พระสมุทรเจดีย์"],
  "นนทบุรี": ["เมืองนนทบุรี","ปากเกร็ด","บางกรวย","บางใหญ่","บางบัวทอง","ไทรน้อย"],
  "ปทุมธานี": ["เมืองปทุมธานี","คลองหลวง","ธัญบุรี","ลำลูกกา","หนองเสือ","ลาดหลุมแก้ว","สามโคก"]
};

function populateHomeDistrictOptions(selectedDistrict = "") {
  const provinceEl = document.getElementById("homeProvince") || homeProvinceEl;
  const districtEl = document.getElementById("homeDistrict") || homeDistrictEl;
  if (!districtEl) return;
  const province = String(provinceEl?.value || "กรุงเทพมหานคร").trim() || "กรุงเทพมหานคร";
  const districts = HOME_DISTRICTS_BY_PROVINCE[province] || HOME_DISTRICTS_BY_PROVINCE["กรุงเทพมหานคร"] || [];
  if (!districts.length) return;
  const current = String(selectedDistrict || districtEl.value || "").trim();
  const opts = ['<option value="">เลือกเขต / อำเภอ</option>'].concat(
    districts.map((name) => '<option value="' + name + '">' + name + '</option>')
  );
  districtEl.innerHTML = opts.join("");
  if (current && districts.includes(current)) districtEl.value = current;
  else if (current) districtEl.value = "";
}
window.populateHomeDistrictOptions = populateHomeDistrictOptions;


// ✅ รายได้ (Technician)
const incomeDailyEl = document.getElementById("incomeDaily");
const incomeMonthEl = document.getElementById("incomeMonth");
const incomeAllEl = document.getElementById("incomeAll");

// ✅ รายได้หน้าใหม่ (แท็บรายได้)
const incomeDaily2El = document.getElementById("incomeDaily2");
const incomeMonth2El = document.getElementById("incomeMonth2");
const incomeAll2El = document.getElementById("incomeAll2");

// ✅ รายได้ (Phase 4 UX - การ์ดหลัก)
const incomeTodayValEl = document.getElementById('incomeTodayVal');
const incomePeriodEstValEl = document.getElementById('incomePeriodEstVal');
const incomeOutstandingValEl = document.getElementById('incomeOutstandingVal');
const incomePeriodRangeEl = document.getElementById('incomePeriodRange');
const incomeWorkSummaryWrapEl = document.getElementById('incomeWorkSummaryWrap');
const incomeWorkSummaryGridEl = document.getElementById('incomeWorkSummaryGrid');
const incomeWorkSummaryPeriodEl = document.getElementById('incomeWorkSummaryPeriod');
const incomeWorkSummaryDetailsEl = document.getElementById('incomeWorkSummaryDetails');
const incomeDepositRemainWrapEl = document.getElementById('incomeDepositRemainWrap');
const incomeDepositRemainValEl = document.getElementById('incomeDepositRemainVal');
const incomeDepositProgressTextEl = document.getElementById('incomeDepositProgressText');
const incomeDepositProgressBarEl = document.getElementById('incomeDepositProgressBar');
const btnReloadIncomeOverviewEl = document.getElementById('btnReloadIncomeOverview');
const btnIncomeQuickTodayEl = document.getElementById('btnIncomeQuickToday');
const btnIncomeQuickYesterdayEl = document.getElementById('btnIncomeQuickYesterday');
const btnIncomeQuick7El = document.getElementById('btnIncomeQuick7');
const btnIncomeQuickMonthEl = document.getElementById('btnIncomeQuickMonth');
const btnIncomeQuick3MonthsEl = document.getElementById('btnIncomeQuick3Months');
const incomeMonthPickerEl = document.getElementById('incomeMonthPicker');
const btnLoadIncomeMonthEl = document.getElementById('btnLoadIncomeMonth');
const techIncomeLast7TitleEl = document.getElementById('techIncomeLast7Title');
const techIncomeLast7WrapEl = document.getElementById('techIncomeLast7Wrap');
const techIncomeLast7ListEl = document.getElementById('techIncomeLast7List');
const techPayoutPeriodsEl = document.getElementById('techPayoutPeriods');
const techPayoutLinesEl = document.getElementById('techPayoutLines');
const techPayoutDetailHintEl = document.getElementById('techPayoutDetailHint');
const techPayoutTotalPillEl = document.getElementById('techPayoutTotalPill');
const btnReloadIncomePeriodsEl = document.getElementById('btnReloadIncomePeriods');
const techPayoutModalBackdropEl = document.getElementById('techPayoutModalBackdrop');
const techPayoutModalTitleEl = document.getElementById('techPayoutModalTitle');
const techPayoutModalSubEl = document.getElementById('techPayoutModalSub');
const techPayoutModalSummaryEl = document.getElementById('techPayoutModalSummary');
const techPayoutModalLinesEl = document.getElementById('techPayoutModalLines');
const btnPayoutModalSlipEl = document.getElementById('btnPayoutModalSlip');
const btnPayoutModalPdfEl = document.getElementById('btnPayoutModalPdf');
const pushNotifyBoxEl = document.getElementById('pushNotifyBox');
const pushNotifyHintEl = document.getElementById('pushNotifyHint');
const techPushIconBtnEl = document.getElementById('techPushIconBtn');
const techPushIconDotEl = document.getElementById('techPushIconDot');
const notifyStateTextEl = document.getElementById('notifyStateText');

// ✅ รายละเอียดรายวัน (วันนี้ทำอะไรไป)
const incomeDatePickerEl = document.getElementById('incomeDatePicker');
const btnLoadIncomeDayEl = document.getElementById('btnLoadIncomeDay');
const techIncomeDayListEl = document.getElementById('techIncomeDayList');
const techIncomeDayHintEl = document.getElementById('techIncomeDayHint');

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

let __TECH_ZONE_PROFILE__ = {};

function setSelectValueSafe(el, value) {
  if (!el) return;
  const v = String(value ?? "");
  el.value = v;
  if (v && el.value !== v) el.value = "";
}

function syncQuickZoneFields() {
  const p = __TECH_ZONE_PROFILE__ || {};
  const secondary = String(p.secondary_service_zone_code || document.getElementById("secondaryServiceZone")?.value || "").toUpperCase();
  const radius = (p.service_radius_km ?? document.getElementById("serviceRadiusKm")?.value ?? "20");
  setSelectValueSafe(quickSecondaryServiceZoneEl || document.getElementById("quickSecondaryServiceZone"), secondary);
  setSelectValueSafe(quickServiceRadiusKmEl || document.getElementById("quickServiceRadiusKm"), String(radius ?? ""));
  const quickAllow = quickAllowOutOfZoneEl || document.getElementById("quickAllowOutOfZone");
  if (quickAllow) quickAllow.checked = !!(p.allow_out_of_zone || document.getElementById("allowOutOfZone")?.checked);
  const status = quickZoneStatusEl || document.getElementById("quickZoneStatus");
  if (status) {
    const primary = p.home_service_zone_code ? `Zone ${p.home_service_zone_code}${p.home_service_zone_label ? ` - ${p.home_service_zone_label}` : ""}` : "ยังไม่ได้ตั้งโซนหลัก";
    const sec = secondary ? `โซนรอง ${secondary}` : "ยังไม่เลือกโซนรอง";
    const rText = radius ? `ระยะ ${radius} กม.` : "ไม่จำกัดระยะทาง";
    status.textContent = `${primary} • ${sec} • ${rText}`;
  }
}

function openZoneQuickModal() {
  syncQuickZoneFields();
  const detailModal = document.getElementById("serviceZoneModal") || serviceZoneModalEl;
  const modalEl = document.getElementById("zoneQuickModal") || zoneQuickModalEl;
  if (detailModal) detailModal.style.display = "none";
  if (modalEl) {
    modalEl.removeAttribute("hidden");
    modalEl.style.display = "flex";
    modalEl.classList.add("is-open");
  }
}

function closeZoneQuickModal() {
  const modalEl = document.getElementById("zoneQuickModal") || zoneQuickModalEl;
  if (modalEl) {
    modalEl.style.display = "none";
    modalEl.classList.remove("is-open");
  }
}

async function saveQuickServiceZone() {
  const p = __TECH_ZONE_PROFILE__ || {};
  const btnEl = document.getElementById("btnSaveQuickZone") || btnSaveQuickZoneEl;
  const secondary = document.getElementById("quickSecondaryServiceZone")?.value || "";
  const radius = document.getElementById("quickServiceRadiusKm")?.value || "";
  const allow = !!document.getElementById("quickAllowOutOfZone")?.checked;
  try {
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = "กำลังบันทึก..."; }
    const res = await fetch(`${API_BASE}/technicians/${encodeURIComponent(username)}/service-zone`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        home_province: p.home_province || document.getElementById("homeProvince")?.value || "",
        home_district: p.home_district || document.getElementById("homeDistrict")?.value || "",
        secondary_service_zone_code: secondary,
        allow_out_of_zone: allow,
        service_radius_km: radius,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "บันทึกพื้นที่รับงานด่วนไม่สำเร็จ");
    __TECH_ZONE_PROFILE__ = { ...__TECH_ZONE_PROFILE__, ...data, service_radius_km: data.service_radius_km ?? radius };
    const secEl = document.getElementById("secondaryServiceZone");
    const radiusEl = document.getElementById("serviceRadiusKm");
    const allowEl = document.getElementById("allowOutOfZone");
    if (secEl) secEl.value = secondary;
    if (radiusEl) radiusEl.value = String(radius ?? "");
    if (allowEl) allowEl.checked = allow;
    syncQuickZoneFields();
    closeZoneQuickModal();
    loadProfile();
  } catch (e) {
    alert(e.message || "บันทึกพื้นที่รับงานด่วนไม่สำเร็จ");
  } finally {
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = "บันทึกด่วน"; }
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

async function detectHomeServiceZone() {
  const provinceEl = document.getElementById("homeProvince") || homeProvinceEl;
  const districtEl = document.getElementById("homeDistrict") || homeDistrictEl;
  const hintEl = document.getElementById("homeZoneHint") || homeZoneHintEl;
  if (!hintEl) return null;
  try {
    const res = await fetch(`${API_BASE}/service_zones/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        home_province: provinceEl?.value || "",
        home_district: districtEl?.value || "",
      }),
    });
    const data = await res.json().catch(() => ({}));
    const z = data.detected || null;
    if (z) {
      hintEl.textContent = `ระบบกำหนดโซนให้: Zone ${z.service_zone_code} - ${z.service_zone_label}`;
      hintEl.style.color = "#0b4bb3";
    } else {
      hintEl.textContent = "ระบบยังหาโซนไม่ได้ กรุณาใส่เขต/อำเภอให้ชัดเจน";
      hintEl.style.color = "#b45309";
    }
    return z;
  } catch (e) {
    hintEl.textContent = "ตรวจโซนไม่สำเร็จ แต่ยังบันทึกได้";
    return null;
  }
}

function openServiceZoneModal() {
  populateHomeDistrictOptions(__TECH_ZONE_PROFILE__?.home_district || "");
  const settingsModal = document.getElementById("techSettingsModal");
  const quickModal = document.getElementById("zoneQuickModal") || zoneQuickModalEl;
  const modalEl = document.getElementById("serviceZoneModal") || serviceZoneModalEl;
  if (settingsModal) settingsModal.style.display = "none";
  if (quickModal) quickModal.style.display = "none";
  if (modalEl) modalEl.style.display = "flex";
  const radiusEl = document.getElementById("serviceRadiusKm") || serviceRadiusKmEl;
  if (radiusEl) radiusEl.value = String(__TECH_ZONE_PROFILE__?.service_radius_km ?? radiusEl.value ?? "20");
  detectHomeServiceZone();
}

function closeServiceZoneModal() {
  const modalEl = document.getElementById("serviceZoneModal") || serviceZoneModalEl;
  if (modalEl) modalEl.style.display = "none";
}

async function saveHomeServiceZone() {
  const provinceEl = document.getElementById("homeProvince") || homeProvinceEl;
  const districtEl = document.getElementById("homeDistrict") || homeDistrictEl;
  const hintEl = document.getElementById("homeZoneHint") || homeZoneHintEl;
  const allowEl = document.getElementById("allowOutOfZone") || allowOutOfZoneEl;
  const btnEl = document.getElementById("btnSaveHomeZone") || btnSaveHomeZoneEl;
  try {
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.textContent = "กำลังบันทึก...";
    }
    const res = await fetch(`${API_BASE}/technicians/${encodeURIComponent(username)}/service-zone`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        home_province: provinceEl?.value || "",
        home_district: districtEl?.value || "",
        secondary_service_zone_code: (document.getElementById("secondaryServiceZone")?.value || ""),
        allow_out_of_zone: !!allowEl?.checked,
        service_radius_km: (document.getElementById("serviceRadiusKm")?.value || ""),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "บันทึกพื้นที่ประจำไม่สำเร็จ");
    if (hintEl) {
      hintEl.textContent = data.service_zone_code
        ? `ระบบกำหนดโซนให้: Zone ${data.service_zone_code} - ${data.service_zone_label}`
        : "บันทึกแล้ว แต่ยังไม่พบโซนจากเขต/อำเภอนี้";
      hintEl.style.color = data.service_zone_code ? "#0b4bb3" : "#b45309";
    }
    __TECH_ZONE_PROFILE__ = { ...__TECH_ZONE_PROFILE__, ...data, service_radius_km: data.service_radius_km ?? document.getElementById("serviceRadiusKm")?.value ?? "" };
    syncQuickZoneFields();
    if (zoneSelect && data.preferred_zone) {
      zoneSelect.value = data.preferred_zone;
      localStorage.setItem("cwf_zone", data.preferred_zone);
    }
    alert("บันทึกพื้นที่ประจำแล้ว");
    closeServiceZoneModal();
    loadProfile();
  } catch (e) {
    alert(e.message || "บันทึกพื้นที่ประจำไม่สำเร็จ");
  } finally {
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.textContent = "บันทึกพื้นที่ประจำ";
    }
  }
}

window.openServiceZoneModal = openServiceZoneModal;
window.closeServiceZoneModal = closeServiceZoneModal;
window.openZoneQuickModal = openZoneQuickModal;
window.closeZoneQuickModal = closeZoneQuickModal;
window.saveQuickServiceZone = saveQuickServiceZone;
window.detectHomeServiceZone = detectHomeServiceZone;
window.saveHomeServiceZone = saveHomeServiceZone;


// =======================================
// 🔔 Web Push Notification: งานเข้าแม้ปิด PWA
// =======================================
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function setPushUi(state, text) {
  const msg = text || '';
  if (pushNotifyHintEl) pushNotifyHintEl.textContent = msg;
  if (notifyStateTextEl) {
    if (state === 'ok') notifyStateTextEl.textContent = 'เปิดแล้ว';
    else if (state === 'warn') notifyStateTextEl.textContent = 'ตั้งค่า';
    else notifyStateTextEl.textContent = 'ยังไม่เปิด';
  }
  if (!techPushIconBtnEl) return;
  techPushIconBtnEl.classList.remove('active', 'warn', 'loading');
  let label = 'เปิดแจ้งเตือนงานเข้า';
  if (state === 'ok') {
    techPushIconBtnEl.classList.add('active');
    label = 'แจ้งเตือนงานเข้าเปิดแล้ว';
  } else if (state === 'warn') {
    techPushIconBtnEl.classList.add('warn');
    label = msg || 'เปิดแจ้งเตือนไม่สำเร็จ';
  } else if (msg && /กำลัง/.test(msg)) {
    techPushIconBtnEl.classList.add('loading');
    label = msg;
  }
  techPushIconBtnEl.setAttribute('title', label);
  techPushIconBtnEl.setAttribute('aria-label', label);
  if (techPushIconDotEl) techPushIconDotEl.style.display = 'block';
}

async function ensureServiceWorkerForPush() {
  if (!('serviceWorker' in navigator)) throw new Error('เครื่องนี้ไม่รองรับ Service Worker');
  const reg = await navigator.serviceWorker.register('/sw.js?v=push-v1');
  try { await navigator.serviceWorker.ready; } catch (_) {}
  return reg;
}

async function enableTechPushNotifications() {
  try {
    if (techPushIconBtnEl) techPushIconBtnEl.disabled = true;
    setPushUi('', 'กำลังเปิดแจ้งเตือน...');

    if (!('Notification' in window) || !('PushManager' in window)) {
      throw new Error('เบราว์เซอร์นี้ไม่รองรับแจ้งเตือนแบบ Push');
    }

    const keyRes = await fetch(`${API_BASE}/tech/push_public_key`);
    const keyData = await keyRes.json().catch(() => ({}));
    if (!keyRes.ok || !keyData.enabled || !keyData.publicKey) {
      throw new Error('ระบบแจ้งเตือนยังไม่ได้ตั้งค่า VAPID บนเซิร์ฟเวอร์');
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('ยังไม่ได้อนุญาตแจ้งเตือน');

    const reg = await ensureServiceWorkerForPush();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
      });
    }

    const saveRes = await fetch(`${API_BASE}/tech/push_subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub, device_label: navigator.platform || '' })
    });
    const save = await saveRes.json().catch(() => ({}));
    if (!saveRes.ok) throw new Error(save.error || 'บันทึกอุปกรณ์แจ้งเตือนไม่สำเร็จ');

    setPushUi('ok', 'พร้อมรับแจ้งเตือนงานเข้า แม้ปิดหน้า PWA');
    try { await fetch(`${API_BASE}/tech/push_test`, { method: 'POST' }); } catch (_) {}
  } catch (e) {
    console.warn('enableTechPushNotifications:', e);
    setPushUi('warn', e.message || 'เปิดแจ้งเตือนไม่สำเร็จ');
    alert(`เปิดแจ้งเตือนไม่สำเร็จ: ${e.message || e}`);
  } finally {
    if (techPushIconBtnEl) techPushIconBtnEl.disabled = false;
  }
}

async function initPushNotificationUi() {
  if (!techPushIconBtnEl) return;
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    setPushUi('warn', 'เครื่องนี้ไม่รองรับแจ้งเตือนแบบ Push');
    return;
  }
  if (Notification.permission === 'granted') {
    setPushUi('ok', 'เปิดแจ้งเตือนแล้ว');
  } else if (Notification.permission === 'denied') {
    setPushUi('warn', 'แจ้งเตือนถูกบล็อกในเบราว์เซอร์');
  } else {
    setPushUi('', 'เปิดไว้เพื่อรับงานใหม่แม้ปิดหน้า PWA');
  }
  techPushIconBtnEl.addEventListener('click', enableTechPushNotifications);
}
window.enableTechPushNotifications = enableTechPushNotifications;

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
  if (zoneQuickBtnEl) zoneQuickBtnEl.onclick = openZoneQuickModal;
  if (homeProvinceEl) homeProvinceEl.onchange = () => { populateHomeDistrictOptions(); detectHomeServiceZone(); };
  if (homeDistrictEl) {
    homeDistrictEl.onfocus = () => populateHomeDistrictOptions(homeDistrictEl.value);
    homeDistrictEl.onclick = () => populateHomeDistrictOptions(homeDistrictEl.value);
    homeDistrictEl.onchange = detectHomeServiceZone;
  }
  if (btnSaveHomeZoneEl) btnSaveHomeZoneEl.onclick = saveHomeServiceZone;
  if (btnSaveQuickZoneEl) btnSaveQuickZoneEl.onclick = saveQuickServiceZone;
  populateHomeDistrictOptions(homeDistrictEl?.value || "");
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
  initPushNotificationUi().catch(()=>{});
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

async function loadCompletedCountSummary() {
  if (!doneCountEl) return null;
  const u = String(username || "").trim();
  if (!u) {
    doneCountEl.textContent = "0";
    return 0;
  }
  try {
    const url = `${API_BASE}/tech/completed_count_summary?username=${encodeURIComponent(u)}&v=completed-count-month-bkk-20260504`;
    const res = await fetch(url, { credentials: "include", cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok === false) throw new Error(data?.error || "LOAD_COMPLETED_COUNT_FAILED");
    const n = Number(data.month_completed_jobs || 0);
    const safe = Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
    try { if (typeof window !== "undefined") window.__CWF_MONTH_DONE__ = safe; } catch (_) {}
    doneCountEl.textContent = String(safe);
    return safe;
  } catch (_) {
    if (!Number.isFinite(Number(window.__CWF_MONTH_DONE__))) doneCountEl.textContent = "0";
    return null;
  }
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
    loadCompletedCountSummary();

    // Photo (serve from /uploads)
    const photo = data.photo_path || "/logo.png";
    if (profilePhotoEl) profilePhotoEl.src = photo;

    __TECH_ZONE_PROFILE__ = { ...__TECH_ZONE_PROFILE__, ...data };
    if (homeProvinceEl && data.home_province) homeProvinceEl.value = data.home_province;
    populateHomeDistrictOptions(data.home_district || "");
    if (allowOutOfZoneEl) allowOutOfZoneEl.checked = !!data.allow_out_of_zone;
    if (secondaryServiceZoneEl) secondaryServiceZoneEl.value = data.secondary_service_zone_code || "";
    if (serviceRadiusKmEl) serviceRadiusKmEl.value = String(data.service_radius_km ?? "20");
    syncQuickZoneFields();
    if (homeZoneHintEl) {
      homeZoneHintEl.textContent = data.home_service_zone_code
        ? `โซนหลัก: Zone ${data.home_service_zone_code} - ${data.home_service_zone_label || ""}${data.secondary_service_zone_code ? ` • โซนรอง: Zone ${data.secondary_service_zone_code} - ${data.secondary_service_zone_label || ""}` : ""}`
        : "ระบบจะกำหนดโซนให้หลังกรอกเขต/อำเภอ";
    }
    const zoneQuickSummary = document.getElementById("zoneQuickSummary");
    if (zoneQuickSummary) {
      zoneQuickSummary.textContent = data.home_service_zone_code
        ? `หลัก ${data.home_service_zone_code}${data.secondary_service_zone_code ? ` / รอง ${data.secondary_service_zone_code}` : " / ไม่เลือกโซนรอง"}${data.service_radius_km ? ` / ${data.service_radius_km} กม.` : ""}`
        : "ยังไม่ได้ตั้งพื้นที่";
    }

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
    loadCompletedCountSummary();
    if (profilePhotoEl) profilePhotoEl.src = "/logo.png";
    try{ if (typeof window !== 'undefined' && typeof window.__cwfSyncTechMore === 'function') window.__cwfSyncTechMore(); }catch(e){}
  }
}

// =======================================
// 💲 INCOME SUMMARY (Technician)
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

function _bkkYmdNow(){
  try{
    const ms = Date.now() + (7*60*60*1000);
    return new Date(ms).toISOString().slice(0,10);
  }catch{ return new Date().toISOString().slice(0,10); }
}

function _bkkYmdOffset(deltaDays){
  try{
    const ms = Date.now() + (7*60*60*1000) + (Number(deltaDays||0) * 24*60*60*1000);
    return new Date(ms).toISOString().slice(0,10);
  }catch{ return _bkkYmdNow(); }
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


function escapeHTML(s){
  return String(s ?? '').replace(/[&<>"']/g, (c)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function formatBahtText(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  try { return x.toLocaleString('th-TH', { maximumFractionDigits: 0 }) + ' บาท'; }
  catch { return Math.round(x).toString() + ' บาท'; }
}
function _techMoneyAmountText(value, fallbackText) {
  const txt = formatBahtText(value);
  return txt || fallbackText;
}
function _offerIncomeNotifyText(offer) {
  const txt = formatBahtText(offer?.technician_income_amount);
  return txt ? `💲 ที่ช่างจะได้รับ: ${txt}` : '💲 เปิดดูยอดที่ช่างจะได้รับในแอพ';
}
function _offerShortNotifyText(offer) {
  if (!offer) return 'มีข้อเสนองานใหม่';
  const code = offer.booking_code || (offer.job_id ? `CWF${String(offer.job_id).padStart(7, '0')}` : '');
  let when = '';
  try {
    when = offer.appointment_datetime ? new Date(offer.appointment_datetime).toLocaleString('th-TH', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '';
  } catch (_) {}
  return [code, offer.job_type, when].filter(Boolean).join(' • ') || 'มีข้อเสนองานใหม่';
}
const __techIncomeModalJobStore = new Map();
const __techIncomeSummaryCache = new Map();
const __techIncomeDetailCache = new Map();
const __techIncomeBatchPending = new Set();

function _jobIdOf(job) {
  const id = Number(job?.job_id);
  return Number.isFinite(id) && id > 0 ? String(Math.trunc(id)) : '';
}
function _incomeFetchUsername() {
  try { return String(username || _bestEffortUsername() || '').trim(); } catch { return _bestEffortUsername(); }
}
function _hasIncomeAmount(job) {
  const n = Number(job?.technician_income_amount);
  // 0 บาททำให้ช่างเข้าใจผิดในงานจริง ถ้าคำนวณไม่ได้ให้แสดง fallback แทน
  return Number.isFinite(n) && n > 0;
}
function _mergeTechIncomeIntoJob(job, income) {
  if (!job || !income) return job;
  const next = { ...(job || {}) };
  if (Object.prototype.hasOwnProperty.call(income, 'technician_income_amount')) next.technician_income_amount = income.technician_income_amount;
  if (income.technician_income_source) next.technician_income_source = income.technician_income_source;
  if (income.technician_income_rate_set_id !== undefined) next.technician_income_rate_set_id = income.technician_income_rate_set_id;
  if (income.technician_income_rate_set_version !== undefined) next.technician_income_rate_set_version = income.technician_income_rate_set_version;
  if (income.technician_income_breakdown) next.technician_income_breakdown = income.technician_income_breakdown;
  return next;
}
function _techIncomeCardKey(job, context) {
  const raw = job?.job_id ?? job?.offer_id ?? job?.booking_code ?? Math.random().toString(36).slice(2);
  return `${String(context || 'current')}-${String(raw).replace(/[^a-zA-Z0-9_-]/g, '')}`;
}
function renderTechnicianMoneySummary(job, context) {
  try {
    const ctx = String(context || 'current');
    const jobId = _jobIdOf(job);
    const cached = jobId && __techIncomeSummaryCache.has(jobId) ? __techIncomeSummaryCache.get(jobId) : null;
    const displayJob = cached ? _mergeTechIncomeIntoJob(job, cached) : job;
    const key = _techIncomeCardKey(displayJob, ctx);
    __techIncomeModalJobStore.set(key, { ...(displayJob || {}), __incomeContext: ctx, __incomeKey: key });
    const label = ctx === 'offered'
      ? 'ที่ช่างจะได้รับ'
      : (ctx === 'history' ? 'ได้รับ' : 'ที่ช่างจะได้รับ');
    const helper = ctx === 'offered'
      ? 'แตะดูรายละเอียดเรทงานนี้'
      : (ctx === 'history' ? 'แตะดูรายละเอียดยอดที่ช่างจะได้รับ' : 'แตะดูรายละเอียดยอดที่ช่างจะได้รับ');
    const hasAmount = _hasIncomeAmount(displayJob);
    const isLoading = !hasAmount && String(displayJob?.technician_income_source || '') === 'loading';
    const amount = hasAmount ? _techMoneyAmountText(displayJob?.technician_income_amount, 'รอคำนวณรายได้') : (isLoading ? 'กำลังคำนวณ…' : 'รอตรวจสอบรายได้');
    const pendingClass = hasAmount ? '' : 'is-pending';
    return `
      <button type="button" class="tech-income-chip ${pendingClass}" data-tech-income-chip="${escapeAttr(key)}" data-job-id="${escapeAttr(jobId)}" data-income-context="${escapeAttr(ctx)}" onclick="openTechnicianIncomeModal('${escapeHTML(key)}')" aria-label="ดูรายละเอียดที่ช่างจะได้รับ">
        <span class="tech-income-chip-icon">💲</span>
        <span class="tech-income-chip-main">
          <span class="tech-income-chip-label">${escapeHTML(label)}</span>
          <strong data-income-amount>${escapeHTML(amount)}</strong>
        </span>
        <span class="tech-income-chip-hint">${escapeHTML(helper)}</span>
        <span class="tech-income-chip-arrow">›</span>
      </button>
    `;
  } catch (e) {
    return `<div class="tech-income-chip is-pending"><span class="tech-income-chip-icon">💲</span><span class="tech-income-chip-main"><span class="tech-income-chip-label">ที่ช่างจะได้รับ</span><strong>กำลังคำนวณ…</strong></span></div>`;
  }
}
function _renderTechnicianIncomeBreakdownContent(job) {
  const rows = Array.isArray(job?.technician_income_breakdown?.rows) ? job.technician_income_breakdown.rows : [];
  const amount = _techMoneyAmountText(job?.technician_income_amount, 'รอคำนวณรายได้');
  const version = job?.technician_income_rate_set_version ? `เรท ${escapeHTML(job.technician_income_rate_set_version)}` : '';
  const source = String(job?.technician_income_source || '');
  const sourceText = source === 'finalized_payout'
    ? 'จากยอดปิดงวดแล้ว'
    : (source === 'fallback_v4' ? 'ใช้เรทสำรอง v4' : 'คำนวณตามเรทที่จะได้รับ');
  if (!rows.length) {
    return `
      <div class="tech-income-modal-summary">
        <div class="k">ที่ช่างจะได้รับ</div>
        <div class="v">${escapeHTML(amount)}</div>
        <div class="s">${escapeHTML(sourceText)}${version ? ' • ' + version : ''}</div>
      </div>
      <div class="tech-income-modal-empty">ยังไม่มีรายละเอียดยอดที่ช่างจะได้รับ กรุณาติดต่อแอดมินเพื่อตรวจสอบ</div>
    `;
  }
  const rowsHtml = rows.map((r) => {
    const item = escapeHTML(r.item_name || 'รายการบริการ');
    const qtyNum = Number(r.qty || r.quantity || 0);
    const qty = Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : (r.machine_index || '');
    const groupQty = Number(r.group_qty || 0);
    const idx = r.single_rate_contract && groupQty
      ? `จำนวนที่ช่างรับ ${escapeHTML(qty)} เครื่อง • จำนวนรวมกลุ่มนี้ ${escapeHTML(groupQty)} เครื่อง`
      : (r.machine_index ? `เครื่องที่ ${escapeHTML(r.machine_index)}` : (qty ? `จำนวน ${escapeHTML(qty)}` : 'ต่อรายการ'));
    const rate = formatBahtText(r.paid_rate ?? r.rate ?? 0) || '-';
    const total = formatBahtText(r.total ?? r.amount ?? r.paid_rate ?? r.rate ?? 0) || '-';
    const formula = qty && r.single_rate_contract ? `${escapeHTML(qty)} × ${escapeHTML(rate)} = ${escapeHTML(total)}` : `${escapeHTML(rate)}`;
    return `
      <div class="tech-income-modal-row">
        <div class="tech-income-modal-row-main">
          <b>${item}</b>
          <span>${idx}</span>
          ${r.single_rate_contract ? `<span>สูตรเรทเดียว: ${formula}</span>` : ''}
        </div>
        <div class="tech-income-modal-row-money">
          <small>${escapeHTML(rate)}</small>
          <strong>${escapeHTML(total)}</strong>
        </div>
      </div>
    `;
  }).join('');
  return `
    <div class="tech-income-modal-summary">
      <div class="k">ที่ช่างจะได้รับ</div>
      <div class="v">${escapeHTML(amount)}</div>
      <div class="s">${escapeHTML(sourceText)}${version ? ' • ' + version : ''}</div>
    </div>
    <div class="tech-income-modal-list">
      <div class="tech-income-modal-list-head"><span>รายการ / เรทที่จะได้รับ</span><b>รวม ${escapeHTML(amount)}</b></div>
      ${rowsHtml}
    </div>
    <div class="tech-income-modal-note">แสดงเฉพาะส่วนยอดที่ช่างจะได้รับคนนี้ ไม่ใช่ยอดเก็บลูกค้า</div>
  `;
}
function renderTechnicianIncomeBreakdown(job) {
  return _renderTechnicianIncomeBreakdownContent(job);
}
function ensureTechnicianIncomeModal() {
  let modal = document.getElementById('tech-income-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'tech-income-modal';
  modal.className = 'tech-income-modal-backdrop';
  modal.innerHTML = `
    <div class="tech-income-modal-card" role="dialog" aria-modal="true" aria-labelledby="tech-income-modal-title">
      <button type="button" class="tech-income-modal-close" onclick="closeTechnicianIncomeModal()" aria-label="ปิด">×</button>
      <div class="tech-income-modal-title" id="tech-income-modal-title">รายละเอียดที่ช่างจะได้รับ</div>
      <div class="tech-income-modal-sub">เงินส่วนนี้คือยอดที่ช่างจะได้รับ ไม่ใช่ยอดเก็บลูกค้า</div>
      <div class="tech-income-modal-body" id="tech-income-modal-body"></div>
      <button type="button" class="tech-income-modal-ok" onclick="closeTechnicianIncomeModal()">ปิด</button>
    </div>
  `;
  modal.addEventListener('click', (ev) => {
    if (ev.target === modal) closeTechnicianIncomeModal();
  });
  document.body.appendChild(modal);
  return modal;
}
function openTechnicianIncomeModal(key) {
  const modal = ensureTechnicianIncomeModal();
  const body = document.getElementById('tech-income-modal-body');
  const storeKey = String(key || '');
  const job = __techIncomeModalJobStore.get(storeKey) || {};
  const jobId = _jobIdOf(job);
  modal.classList.add('show');
  try { document.body.style.overflow = 'hidden'; } catch {}

  if (!body) return;
  const cachedDetail = jobId && __techIncomeDetailCache.has(jobId) ? __techIncomeDetailCache.get(jobId) : null;
  if (cachedDetail) {
    const merged = _mergeTechIncomeIntoJob(job, cachedDetail);
    __techIncomeModalJobStore.set(storeKey, merged);
    body.innerHTML = _renderTechnicianIncomeBreakdownContent(merged);
    return;
  }

  const hasRows = Array.isArray(job?.technician_income_breakdown?.rows) && job.technician_income_breakdown.rows.length;
  if (hasRows) {
    body.innerHTML = _renderTechnicianIncomeBreakdownContent(job);
    return;
  }

  body.innerHTML = `
    <div class="tech-income-modal-summary">
      <div class="k">ที่ช่างจะได้รับ</div>
      <div class="v">${escapeHTML(_techMoneyAmountText(job?.technician_income_amount, 'กำลังโหลด…'))}</div>
      <div class="s">กำลังโหลดรายละเอียดยอดที่ช่างจะได้รับ โดยไม่บล็อกใบงาน</div>
    </div>
    <div class="tech-income-modal-empty">กำลังโหลดรายละเอียดที่ช่างจะได้รับ…</div>
  `;

  if (!jobId) {
    body.innerHTML = _renderTechnicianIncomeBreakdownContent(job);
    return;
  }

  fetchTechnicianIncomeDetail(jobId, storeKey).catch(() => {
    if (body) body.innerHTML = _renderTechnicianIncomeBreakdownContent(job);
  });
}
function closeTechnicianIncomeModal() {
  const modal = document.getElementById('tech-income-modal');
  if (modal) modal.classList.remove('show');
  try { document.body.style.overflow = ''; } catch {}
}
window.openTechnicianIncomeModal = openTechnicianIncomeModal;
window.closeTechnicianIncomeModal = closeTechnicianIncomeModal;
function _formatWorkCount(n){
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return '0';
  if (Math.abs(x - Math.round(x)) < 0.001) return String(Math.round(x));
  return x.toFixed(1).replace(/\.0$/, '');
}
function _formatShortThaiDate(iso){
  try{
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('th-TH', { timeZone:'Asia/Bangkok', day:'2-digit', month:'short' }).format(d);
  }catch{ return ''; }
}
function renderDepositRemaining(info){
  if (!incomeDepositRemainWrapEl) return;
  const remaining = Number(info?.deposit_remaining_amount ?? info?.deposit?.deposit_remaining_amount ?? 0);
  const target = Number(info?.deposit_target_amount ?? info?.deposit?.deposit_target_amount ?? 0);
  const collected = Number(info?.deposit_collected_total ?? info?.deposit?.deposit_collected_total ?? 0);
  const required = info?.deposit_is_required !== false;
  if (!required || !Number.isFinite(remaining) || remaining <= 0) { incomeDepositRemainWrapEl.style.display = 'none'; return; }
  incomeDepositRemainWrapEl.style.display = 'block';
  if (incomeDepositRemainValEl) incomeDepositRemainValEl.textContent = formatBaht(remaining);
  if (incomeDepositProgressTextEl) {
    const left = target > 0 ? `สะสมแล้ว ${formatBaht(collected)} / เป้าหมาย ${formatBaht(target)}` : `สะสมแล้ว ${formatBaht(collected)}`;
    incomeDepositProgressTextEl.textContent = left;
  }
  if (incomeDepositProgressBarEl) {
    const pct = target > 0 ? Math.max(0, Math.min(100, (collected / target) * 100)) : 0;
    incomeDepositProgressBarEl.style.width = pct.toFixed(0) + '%';
  }
}

function renderTechWorkSummary(summary){
  if (!incomeWorkSummaryWrapEl || !incomeWorkSummaryGridEl) return;
  const cards = Array.isArray(summary?.cards) ? summary.cards : [];
  const visible = cards.filter(x => Number(x?.count || 0) > 0);
  if (!visible.length) {
    incomeWorkSummaryWrapEl.style.display = 'none';
    incomeWorkSummaryGridEl.innerHTML = '';
    if (incomeWorkSummaryDetailsEl) incomeWorkSummaryDetailsEl.innerHTML = '';
    return;
  }
  incomeWorkSummaryWrapEl.style.display = '';
  if (incomeWorkSummaryPeriodEl) {
    const a = _formatShortThaiDate(summary?.period_start);
    const b = _formatShortThaiDate(summary?.period_end);
    incomeWorkSummaryPeriodEl.textContent = (a && b) ? `รอบเดียวกับรวมรายได้ • ${a} - ${b}` : 'รอบเดียวกับรวมรายได้รอบเดือน';
  }
  incomeWorkSummaryGridEl.innerHTML = visible.map(x => `
    <div class="work-chip">
      <div class="work-label">${escapeHTML(x.label || '-')}</div>
      <div class="work-value">${_formatWorkCount(x.count)} <span>${escapeHTML(x.unit || 'เครื่อง')}</span></div>
    </div>
  `).join('');
  if (incomeWorkSummaryDetailsEl) {
    const groups = (Array.isArray(summary?.groups) ? summary.groups : [])
      .map(g => ({ ...g, items: (Array.isArray(g.items) ? g.items : []).filter(it => Number(it?.count || 0) > 0) }))
      .filter(g => g.items.length);
    incomeWorkSummaryDetailsEl.innerHTML = groups.length ? `
      <summary><span>ดูแยกประเภท</span><span>▾</span></summary>
      <div class="work-more-box">
        ${groups.map(g => `
          <div class="work-group">
            <b>${escapeHTML(g.label || '')}</b>
            ${g.items.map(it => `<div class="work-row"><span>${escapeHTML(it.label || '-')}</span><strong>${_formatWorkCount(it.count)} ${escapeHTML(it.unit || '')}</strong></div>`).join('')}
          </div>
        `).join('')}
      </div>
    ` : '';
  }
}

async function loadIncomeSummary() {
  if (!incomeDailyEl && !incomeMonthEl && !incomeAllEl && !incomeDaily2El && !incomeMonth2El && !incomeAll2El) return; // UI ไม่ได้มีส่วนนี้
  try {
    // Fail-open for PWA/webview that loses cookies: also send ?username=
    const u = _bestEffortUsername();
    const url = `${API_BASE}/tech/income_summary${u ? `?username=${encodeURIComponent(u)}&` : '?'}v=contract-v10-2`;
    try { localStorage.removeItem('__cwf_income_cache__'); localStorage.removeItem('__cwf_income_cache_v9__'); localStorage.removeItem('__cwf_income_cache_v10_2__'); localStorage.removeItem('__cwf_income_cache_v10__'); } catch {}
    const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
    const data = await res.json();
    if (!data || !data.ok) throw new Error(data?.error || 'LOAD_FAILED');

    // cache last good values (so UI won't look "empty" when temporary failures happen)
    try {
      localStorage.setItem('__cwf_income_cache_v10_2__', JSON.stringify({
        ts: Date.now(),
        day_total: Number(data.day_total||0),
        month_total: Number(data.month_total||0),
        all_total: Number(data.all_total||0),
        payout_month_total: Number((data.monthly_income_display_amount ?? data.payout_month_total) || 0),
        monthly_income_display_amount: Number((data.monthly_income_display_amount ?? data.payout_month_total) || 0),
        monthly_income_display_label: String(data.monthly_income_display_label || data.payout_month || ''),
        work_summary: data.work_summary || null,
        deposit_target_amount: Number(data.deposit_target_amount||0),
        deposit_collected_total: Number(data.deposit_collected_total||0),
        deposit_remaining_amount: Number(data.deposit_remaining_amount||0),
        deposit_is_required: data.deposit_is_required !== false,
        true_outstanding_amount: Number(data.true_outstanding_amount||data.pending_payout_remaining_total||0)
      }));
    } catch {}

    if (incomeDailyEl) incomeDailyEl.textContent = formatBaht(data.day_total);
    if (incomeMonthEl) incomeMonthEl.textContent = formatBaht(data.month_total);
    if (incomeAllEl) incomeAllEl.textContent = formatBaht(data.all_total);
    if (incomeDaily2El) incomeDaily2El.textContent = formatBaht(data.day_total);
    if (incomeMonth2El) incomeMonth2El.textContent = formatBaht(data.month_total);
    if (incomeAll2El) incomeAll2El.textContent = formatBaht(data.all_total);
    renderTechWorkSummary(data.work_summary);
    renderDepositRemaining(data);
  } catch (e) {
    // fail-open (ไม่ให้หน้า tech พัง) + show cached value if available
    try {
      const c = JSON.parse(localStorage.getItem('__cwf_income_cache_v10_2__') || 'null');
      if (c && typeof c === 'object') {
        if (incomeDailyEl) incomeDailyEl.textContent = formatBaht(c.day_total);
        if (incomeMonthEl) incomeMonthEl.textContent = formatBaht(c.month_total);
        if (incomeAllEl) incomeAllEl.textContent = formatBaht(c.all_total);
        if (incomeDaily2El) incomeDaily2El.textContent = formatBaht(c.day_total);
        if (incomeMonth2El) incomeMonth2El.textContent = formatBaht(c.month_total);
        if (incomeAll2El) incomeAll2El.textContent = formatBaht(c.all_total);
        renderTechWorkSummary(c.work_summary);
        renderDepositRemaining(c);
        return;
      }
    } catch {}
    if (incomeDailyEl) incomeDailyEl.textContent = "-";
    if (incomeMonthEl) incomeMonthEl.textContent = "-";
    if (incomeAllEl) incomeAllEl.textContent = "-";
    if (incomeDaily2El) incomeDaily2El.textContent = "-";
    if (incomeMonth2El) incomeMonth2El.textContent = "-";
    if (incomeAll2El) incomeAll2El.textContent = "-";
    renderTechWorkSummary(null);
    renderDepositRemaining(null);
  }
}

// =======================================
// 💲 INCOME OVERVIEW (Phase 4 UX)
// - Today (fast)
// - Next period estimate (fast)
// - Rolling month total = previous payout cycle + current completed jobs to date
// - Last 7 days summary
// =======================================

async function loadIncomeTodayMonthFast(){
  // ถ้าไม่มีการ์ดใหม่ ให้ fail-open (ไม่พังหน้า)
  if (!incomeTodayValEl && !incomeDaily2El && !incomeMonth2El) return;
  try{
    const u = _bestEffortUsername();
    const url = `${API_BASE}/tech/income_today_month${u ? `?username=${encodeURIComponent(u)}&` : '?'}v=contract-v10-2`;
    const res = await fetch(url, { credentials:'include', cache:'no-store' });
    const data = await res.json();
    if (!data || !data.ok) throw new Error(data?.error || 'LOAD_FAILED');
    if (incomeTodayValEl) incomeTodayValEl.textContent = formatBaht(data.day_total||0);
    // sync legacy hidden ids
    if (incomeDaily2El) incomeDaily2El.textContent = formatBaht(data.day_total||0);
    if (incomeMonth2El) incomeMonth2El.textContent = formatBaht(data.month_total||0);
  }catch(e){
    if (incomeTodayValEl) incomeTodayValEl.textContent = '-';
  }
}

async function loadNextPeriodEstimate(){
  if (!incomePeriodEstValEl && !incomePeriodRangeEl) return;
  try{
    const res = await fetch(`${API_BASE}/tech/income_next_period_estimate?v=contract-v10-2`, { credentials:'include', cache:'no-store' });
    const data = await res.json();
    if (!data || !data.ok) throw new Error(data?.error || 'LOAD_FAILED');
    if (incomePeriodEstValEl) incomePeriodEstValEl.textContent = formatBaht(data.estimate_total||0);
    if (incomePeriodRangeEl) incomePeriodRangeEl.textContent = `งวด ${data.period_type} • ${data.period_start_th} - ${data.period_end_th}`;
  }catch(e){
    if (incomePeriodEstValEl) incomePeriodEstValEl.textContent = '-';
    if (incomePeriodRangeEl) incomePeriodRangeEl.textContent = '-';
  }
}

async function loadOutstandingTotal(){
  if (!incomeOutstandingValEl) return;
  try{
    const res = await fetch(`${API_BASE}/tech/payments_total?v=contract-v10-6-rolling-month-total`, { credentials:'include', cache:'no-store' });
    const data = await res.json();
    if (!data || !data.ok) throw new Error(data?.error || 'LOAD_FAILED');
    const payoutMonthTotal = Number(data.monthly_income_display_amount ?? data.payout_month_total ?? 0);
    incomeOutstandingValEl.textContent = formatBaht(Math.max(0, payoutMonthTotal));
    renderTechWorkSummary(data.work_summary);
    renderDepositRemaining(data);
  }catch(e){
    try {
      await loadIncomeSummary();
      const c = JSON.parse(localStorage.getItem('__cwf_income_cache_v10_2__')||'null');
      if (c && Number.isFinite(Number(c.payout_month_total ?? c.true_outstanding_amount))) {
        incomeOutstandingValEl.textContent = formatBaht(Math.max(0, Number((c.monthly_income_display_amount ?? c.payout_month_total ?? c.true_outstanding_amount) || 0)));
        renderTechWorkSummary(c.work_summary);
        renderDepositRemaining(c);
        return;
      }
    } catch {}
    incomeOutstandingValEl.textContent = '-';
  }
}

function renderLastDaysSummary(payload){
  if (!techIncomeLast7WrapEl || !techIncomeLast7ListEl) return;
  const days = Array.isArray(payload?.days) ? payload.days : [];
  if (techIncomeLast7TitleEl) {
    const a = payload?.range_start || '';
    const b = payload?.range_end || '';
    techIncomeLast7TitleEl.textContent = (a && b) ? `สรุปสเตทเมนต์ ${a} - ${b}` : 'สรุปสเตทเมนต์';
  }
  if (!days.length) {
    techIncomeLast7WrapEl.style.display = 'none';
    return;
  }
  techIncomeLast7WrapEl.style.display = 'block';
  techIncomeLast7ListEl.innerHTML = days.map(d=>{
    const ymd = String(d.date||'');
    const total = formatBaht(d.total||0);
    const count = Number(d.jobs||0);
    return `
      <div style="padding:10px;border-radius:16px;border:1px solid rgba(15,23,42,0.10);margin-bottom:8px" onclick="(function(){ try{ var el=document.getElementById('incomeDatePicker'); if(el){ el.value='${ymd}'; } }catch(e){} try{ loadIncomeDayDetail('${ymd}'); }catch(e){} })()">
        <div class="row" style="justify-content:space-between;gap:10px">
          <div>
            <b>${ymd}</b>
            <div class="muted" style="margin-top:4px">${count} งาน</div>
          </div>
          <div style="text-align:right"><b style="font-size:18px">${total}</b></div>
        </div>
      </div>
    `;
  }).join('');
}

async function loadLastDays(days = 7, opts = {}){
  if (!techIncomeLast7WrapEl || !techIncomeLast7ListEl) return;
  try{
    const params = new URLSearchParams();
    if (opts.start && opts.end) { params.set('start', opts.start); params.set('end', opts.end); }
    else { params.set('days', String(days)); }
    const res = await fetch(`${API_BASE}/tech/income_last_days?${params.toString()}`, { credentials:'include', cache:'no-store' });
    const data = await res.json();
    if (!data || !data.ok) throw new Error(data?.error || 'LOAD_FAILED');
    renderLastDaysSummary(data);
  }catch(e){ techIncomeLast7WrapEl.style.display = 'none'; }
}

function _monthRangeFromYm(ym){
  const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]); const mo = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return null;
  const start = `${y}-${String(mo).padStart(2,'0')}-01`;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const end = `${y}-${String(mo).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
  return { start, end };
}

async function loadIncomeMonthStatement(ym){
  const r = _monthRangeFromYm(ym);
  if (!r) return;
  if (techIncomeDayListEl) techIncomeDayListEl.innerHTML = '';
  await loadLastDays(31, r);
}

async function loadIncomeOverview(){
  await Promise.allSettled([
    loadIncomeTodayMonthFast(),
    loadNextPeriodEstimate(),
    loadOutstandingTotal()
  ]);
}

// =======================================
// 📆 INCOME DAY DETAIL (Technician)
// - แสดงรายการงาน + รายได้ต่อใบงาน ของวันที่เลือก
// =======================================

function _fmtDateTimeTH(iso){
  try{
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('th-TH', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
  }catch{ return '-'; }
}

function _keyLabel(k, fallback){
  const s = String(k||'').trim();
  return s || String(fallback||'').trim() || '-';
}

function renderIncomeDayDetail(payload){
  if (!techIncomeDayListEl) return;
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (!items.length) {
    techIncomeDayListEl.innerHTML = `<div class="muted">ไม่มีงานที่ปิดในวันนี้</div>`;
    return;
  }

  function esc(s){
    return String(s ?? '').replace(/[&<>"']/g, (c)=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function fmtPct(v){
    if (v==null || v==='') return 'บาท/เครื่องตามสัญญา';
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    return `${n}%`;
  }

  const html = items.map(it=>{
    const d = it.detail_json || {};
    const jobId = String(it.job_id||'-');
    const finished = _fmtDateTimeTH(it.finished_at);
    const jobType = _keyLabel(d.job_type, d.job_type_key);
    const acType = _keyLabel(d.ac_type, d.ac_type_key);
    const wash = _keyLabel(d.wash_variant, '');
    const mc = Number(it.machine_count_for_tech||0);
    const pct = fmtPct(it.percent_final);
    const earn = formatBaht(it.earn_amount||0);

    // Trace (สั้นๆ ให้ช่าง/แอดมินอ่านรู้เรื่อง)
    const mode = _keyLabel(d.split_mode, d.mode);
    const base = formatBaht(it.base_amount||0);
    const rule = _keyLabel(it.step_rule_key, d.step_rule_key);
    const howMc = _keyLabel(d.how_machine_count_for_tech, '');
    const howPct = _keyLabel(d.how_percent_selected, '');
    const howSplit = _keyLabel(d.how_split_applied, '');
    const relItems = Array.isArray(d.related_items) ? d.related_items : [];
    const rateRows = Array.isArray(d.contract_rate_rows) ? d.contract_rate_rows : [];
    const rateHtml = rateRows.slice(0, 40).map(r=>{
      const share = Number(r.share || 1);
      const shareTxt = share !== 1 ? ` × ${share.toFixed(2)}` : '';
      return `<div class="muted" style="margin-top:4px">• ${esc(r.wash_label || r.wash_key || 'บริการ')} ${esc(r.btu_tier === 'large' ? '18,000 BTU+' : '≤12,000 BTU')} เครื่องที่ ${esc(r.machine_index || '-')} = <b>${formatBaht(r.paid_rate ?? r.rate ?? 0)}</b>${shareTxt}</div>`;
    }).join('');
    const relHtml = relItems.slice(0, 25).map(x=>{
      const nm = esc(_keyLabel(x.item_name, x.name));
      const qty = Number(x.qty||0);
      const asg = esc(_keyLabel(x.assigned_technician_username, 'ร่วม/ไม่ระบุ'));
      const lt = formatBaht(x.line_total||0);
      return `<div class="muted" style="margin-top:4px">• ${nm} (x${qty}) • ${asg} • ${lt}</div>`;
    }).join('');
    const traceId = `trace_${jobId}_${String(it.line_id||'v')}`.replace(/[^a-zA-Z0-9_]/g,'_');
    return `
      <div style="padding:10px;border-radius:16px;border:1px solid rgba(15,23,42,0.10);margin-bottom:8px">
        <div class="row" style="justify-content:space-between;gap:10px;align-items:flex-start">
          <div>
            <b>งาน #${jobId}</b>
            <div class="muted" style="margin-top:4px">${finished}</div>
            <div class="muted" style="margin-top:6px">${jobType} • ${acType}${wash?` • ${wash}`:''}</div>
            <div class="muted" style="margin-top:4px">เครื่องที่คิดเงินให้ช่าง: <b>${mc}</b> • วิธีคิด: <b>${pct}</b></div>
            <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap">
              <button class="btn" type="button" onclick="(function(){var el=document.getElementById('${traceId}'); if(!el) return; el.style.display = (el.style.display==='none' || !el.style.display) ? 'block' : 'none';})()">ดูสูตร</button>
            </div>
          </div>
          <div style="text-align:right">
            <b style="font-size:18px">${earn}</b>
          </div>
        </div>

        <div id="${traceId}" style="display:none;margin-top:10px;padding-top:10px;border-top:1px dashed rgba(15,23,42,0.15)">
          <div class="muted">ค่าจ้างตามสัญญา: <b>${base}</b> • engine: <b>${esc(rule)}</b> • โหมดแบ่ง: <b>${esc(mode)}</b></div>
          ${howMc ? `<div class="muted" style="margin-top:6px">นับเครื่อง: ${esc(howMc)}</div>` : ''}
          ${howPct ? `<div class="muted" style="margin-top:6px">สูตรเรท: ${esc(howPct)}</div>` : ''}
          ${howSplit ? `<div class="muted" style="margin-top:6px">กระจายรายได้: ${esc(howSplit)}</div>` : ''}
          ${rateHtml ? `<div style="margin-top:8px"><b style="color:#0b1b3a">เรทตามสัญญา</b>${rateHtml}</div>` : ''}
          ${relHtml ? `<div style="margin-top:8px"><b style="color:#0b1b3a">รายการที่เกี่ยวข้อง</b>${relHtml}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  techIncomeDayListEl.innerHTML = html;
}

async function loadIncomeDayDetail(dateYmd){
  if (!techIncomeDayListEl) return;
  const d = String(dateYmd||'').trim() || _bkkYmdNow();
  if (techIncomeDayHintEl) techIncomeDayHintEl.textContent = `กำลังโหลดรายการของ ${d}...`;
  techIncomeDayListEl.innerHTML = `<div class="muted">กำลังโหลด...</div>`;
  try{
    const res = await fetch(`${API_BASE}/tech/income_day_detail?date=${encodeURIComponent(d)}`, { credentials:'include' });
    const data = await res.json();
    if (!data || !data.ok) throw new Error(data?.error||'LOAD_FAILED');
    if (techIncomeDayHintEl) techIncomeDayHintEl.textContent = `รวมวันนี้: ${formatBaht(data.total_amount||0)}`;
    renderIncomeDayDetail(data);
  }catch(e){
    if (techIncomeDayHintEl) techIncomeDayHintEl.textContent = 'โหลดไม่สำเร็จ';
    techIncomeDayListEl.innerHTML = `<div class="muted">โหลดไม่สำเร็จ</div>`;
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


function _payoutStatusTH(status){
  const s = String(status || 'draft').trim().toLowerCase();
  const map = { draft:'กำลังตรวจยอด', locked:'พร้อมจ่าย', paid:'จ่ายแล้ว', cancelled:'ยกเลิก' };
  return map[s] || s || '-';
}
function _paidStatusTH(status){
  const s = String(status || 'unpaid').trim().toLowerCase();
  const map = { unpaid:'รอจ่าย', partial:'จ่ายบางส่วน', paid:'จ่ายแล้ว', hold:'ระงับยอด', disputed:'มีปัญหา', cancelled:'ยกเลิก' };
  return map[s] || s || '-';
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
  if (!arr.length) { techPayoutPeriodsEl.innerHTML = `<div class="muted">ยังไม่มีงวดที่สร้าง</div>`; return; }
  techPayoutPeriodsEl.innerHTML = arr.map(p=>{
    const id = _safeText(p.payout_id);
    const type = _safeText(p.period_type);
    const st = _fmtDateTH(p.period_start);
    const en = _fmtDateTH(p.period_end);
    const gross = formatBaht(p.gross_amount||0);
    const dep = formatBaht(p.deposit_deduction_amount||0);
    const total = formatBaht(p.net_amount||p.total_amount||0);
    const rem = formatBaht(p.remaining_amount||0);
    const paySt = _safeText(_paidStatusTH(p.paid_status||'unpaid'));
    const status = _safeText(_payoutStatusTH(p.status||'draft'));
    const active = (__cwfPayoutActiveId===p.payout_id);
    return `<button type="button" class="tr" style="width:100%;text-align:left;padding:12px;border-radius:18px;border:1px solid rgba(15,23,42,0.10);margin-bottom:10px;cursor:pointer;background:#fff;${active?'outline:2px solid rgba(11,75,179,0.35)':''}" onclick="window.openTechPayoutDetail('${id}')"><div class="row" style="justify-content:space-between;gap:10px;align-items:flex-start"><div><b>งวด ${type}</b><div class="muted" style="margin-top:4px">${st} - ${en}</div><div class="muted" style="margin-top:4px">สถานะงวด: ${status} • จ่าย: ${paySt}</div></div><div style="text-align:right"><b style="font-size:18px;color:#0B2E6D">${total}</b><div class="muted" style="margin-top:4px">ก่อนหัก ${gross}</div><div class="muted" style="margin-top:3px">หักประกัน ${dep} • คงเหลือ ${rem}</div></div></div></button>`;
  }).join('');
}
function openTechPayoutModal(){ if (techPayoutModalBackdropEl) techPayoutModalBackdropEl.classList.add('show'); try { document.body.style.overflow = 'hidden'; } catch(e) {} }
function closeTechPayoutModal(){ if (techPayoutModalBackdropEl) techPayoutModalBackdropEl.classList.remove('show'); try { document.body.style.overflow = ''; } catch(e) {} }
window.closeTechPayoutModal = closeTechPayoutModal;
async function openTechPayoutDetail(payout_id){
  const id = String(payout_id||'').trim(); if (!id) return;
  __cwfPayoutActiveId = id;
  try { renderTechPayoutPeriods(__cwfPayoutCache.payouts); } catch(e) {}
  if (techPayoutModalTitleEl) techPayoutModalTitleEl.textContent = `รายละเอียดงวด`;
  if (techPayoutModalSubEl) techPayoutModalSubEl.textContent = `กำลังโหลด ${id}`;
  if (techPayoutModalSummaryEl) techPayoutModalSummaryEl.innerHTML = `<div class="muted">กำลังโหลด...</div>`;
  if (techPayoutModalLinesEl) techPayoutModalLinesEl.innerHTML = `<div class="muted">กำลังโหลดรายการงาน...</div>`;
  openTechPayoutModal();
  try{
    const res = await fetch(`${API_BASE}/tech/payouts/${encodeURIComponent(id)}`, { credentials:'include' });
    const data = await res.json(); if (!data || !data.ok) throw new Error(data?.error||'LOAD_FAILED');
    const gross = formatBaht(data.gross_amount||0), dep = formatBaht(data.deposit_deduction_amount||0), total = formatBaht(data.net_amount||data.total_amount||0), paid = formatBaht(data.paid_amount||0), rem = formatBaht(data.remaining_amount||0);
    const depTarget = formatBaht(data.deposit_target_amount||0), depCollected = formatBaht(data.deposit_collected_total||0), depRemaining = formatBaht(data.deposit_remaining_amount||0);
    const period = (__cwfPayoutCache.payouts||[]).find(x=>String(x.payout_id)===id) || {};
    const type = _safeText(data.period_type || period.period_type || ''), st = _fmtDateTH(data.period_start || period.period_start), en = _fmtDateTH(data.period_end || period.period_end), paySt = _safeText(_paidStatusTH(data.paid_status||'unpaid'));
    if (techPayoutModalTitleEl) techPayoutModalTitleEl.textContent = `งวด ${type || ''}`.trim() || 'รายละเอียดงวด';
    if (techPayoutModalSubEl) techPayoutModalSubEl.textContent = `${id} • ${st} - ${en} • ${paySt}`;
    if (techPayoutModalSummaryEl) techPayoutModalSummaryEl.innerHTML = `<div class="payout-kpi"><div class="k">รายได้ก่อนหัก</div><div class="v">${gross}</div></div><div class="payout-kpi"><div class="k">หักเงินประกัน</div><div class="v">${dep}</div></div><div class="payout-kpi net"><div class="k">ยอดสุทธิในงวด</div><div class="v">${total}</div></div><div class="payout-kpi"><div class="k">จ่ายแล้ว</div><div class="v">${paid}</div></div><div class="payout-kpi"><div class="k">คงเหลือ</div><div class="v">${rem}</div></div><div class="payout-kpi"><div class="k">เงินประกันสะสม</div><div class="v">${depCollected}</div></div><div class="payout-kpi"><div class="k">เงินประกันคงเหลือ</div><div class="v">${depRemaining}</div></div><div class="payout-kpi"><div class="k">เป้าหมายประกัน</div><div class="v">${depTarget}</div></div>`;
    const slipUrl = `/tech/payouts/${encodeURIComponent(id)}/slip`;
    if (btnPayoutModalSlipEl) btnPayoutModalSlipEl.onclick = ()=> window.open(slipUrl, '_blank');
    if (btnPayoutModalPdfEl) btnPayoutModalPdfEl.onclick = ()=> window.open(`${slipUrl}?print=1`, '_blank');
    renderTechPayoutLines(data.lines||[], data.net_amount||data.total_amount||0, data.adjustments||[], data.payment||null, id, { gross_amount:data.gross_amount, deposit_deduction_amount:data.deposit_deduction_amount, deposit_target_amount:data.deposit_target_amount, deposit_collected_total:data.deposit_collected_total, deposit_remaining_amount:data.deposit_remaining_amount, depositText:`เงินประกัน เป้า ${depTarget} • เก็บแล้ว ${depCollected} • คงเหลือ ${depRemaining}` });
  }catch(e){ if (techPayoutModalSubEl) techPayoutModalSubEl.textContent = 'โหลดรายละเอียดไม่สำเร็จ'; if (techPayoutModalSummaryEl) techPayoutModalSummaryEl.innerHTML = `<div class="muted">โหลดรายละเอียดไม่สำเร็จ</div>`; if (techPayoutModalLinesEl) techPayoutModalLinesEl.innerHTML = ''; }
}
window.openTechPayoutDetail = openTechPayoutDetail;

function renderTechPayoutLines(lines, total, adjustments, payment, payoutId, summary){
  const payoutLinesTargetEl = techPayoutModalLinesEl || techPayoutLinesEl;
  if (!payoutLinesTargetEl) return;
  const arr = Array.isArray(lines) ? lines : [];
  if (!arr.length) {
    payoutLinesTargetEl.innerHTML = `<div class="muted">ไม่มีรายการงานในงวดนี้</div>`;
    return;
  }

  const PAGE = 40;

  const adjArr = Array.isArray(adjustments)?adjustments:[];
  const pay = payment || null;
  const grossText = formatBaht(summary?.gross_amount||0);
  const depText = formatBaht(summary?.deposit_deduction_amount||0);
  const netText = formatBaht(total||0);
  const depositSummaryText = _safeText(summary?.depositText || '');

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
      const pct = (ln.percent_final==null || ln.percent_final===undefined) ? 'เรทสัญญา' : (Number(ln.percent_final)||0).toFixed(2)+'%';
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
                <div class="muted" style="margin-top:4px">เครื่อง: ${mc} • วิธีคิด: ${pct}</div>
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

    const adjHtml = adjArr.length ? adjArr.map(a=>{
      const j = a.job_id ? `#${_safeText(a.job_id)}` : '-';
      const amt = formatBaht(a.adj_amount||0);
      const dt = _fmtDateTH(a.created_at);
      return `<div class="muted">• ${dt} ${j} : ${_safeText(a.reason)} (${amt})</div>`;
    }).join('') : `<div class="muted">-</div>`;

    const slipBtn = techPayoutModalLinesEl ? '' : `<button class="btn" id="btnSlip" style="width:100%;margin:8px 0">เปิดสลิปงวดนี้</button>`;

    payoutLinesTargetEl.innerHTML = `
      <div class="card" style="margin-top:0">
        <b>สรุปงวด</b>
        <div class="muted" style="margin-top:6px">รายได้ก่อนหัก: <b>${grossText}</b> • หักเงินประกัน: <b>${depText}</b> • ยอดสุทธิ: <b>${netText}</b></div>
        ${depositSummaryText ? `<div class="muted" style="margin-top:4px">${depositSummaryText}</div>` : ''}
      </div>
      <div class="card" style="margin-top:0">
        <b>รายการหัก/บวก</b>
        <div class="muted" style="margin-top:4px">การปรับยอดจะถูกแสดงในสลิปงวด</div>
        <div style="margin-top:8px">${adjHtml}</div>
      </div>
      ${slipBtn}
    ` + html + moreBtn;

    const bSlip = document.getElementById('btnSlip');
    if (bSlip) bSlip.onclick = ()=>{ if (!payoutId) return; window.open(`/tech/payouts/${encodeURIComponent(payoutId)}/slip`, '_blank'); };
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
loadIncomeOverview();

// ✅ รายละเอียดรายวัน (วันนี้ทำอะไรไป)
try{
  if (incomeDatePickerEl) incomeDatePickerEl.value = _bkkYmdNow();
  if (incomeMonthPickerEl) incomeMonthPickerEl.value = _bkkYmdNow().slice(0,7);
  if (btnLoadIncomeDayEl) btnLoadIncomeDayEl.addEventListener('click', ()=> loadIncomeDayDetail(incomeDatePickerEl?.value || _bkkYmdNow()));
  try {
    const savedUpcomingFilter = localStorage.getItem(ACTIVE_UPCOMING_FILTER_KEY) || "";
    if (_isYmd(savedUpcomingFilter)) setUpcomingFilter(savedUpcomingFilter, { skipRender:true });
    else if (activeUpcomingDatePickerEl) activeUpcomingDatePickerEl.value = "";
  } catch(_){ }
  if (btnUpcomingApplyEl) btnUpcomingApplyEl.addEventListener('click', ()=> setUpcomingFilter(activeUpcomingDatePickerEl?.value || ""));
  if (btnUpcomingClearEl) btnUpcomingClearEl.addEventListener('click', ()=> setUpcomingFilter(""));
  if (activeUpcomingDatePickerEl) {
    activeUpcomingDatePickerEl.addEventListener('change', ()=>{
      const v = activeUpcomingDatePickerEl.value || "";
      if (!v) setUpcomingFilter("");
    });
  }
  // โหลดของวันนี้อัตโนมัติครั้งแรก (กันช่างต้องกดหลายที)
  if (techIncomeDayListEl) loadIncomeDayDetail(_bkkYmdNow());

  if (btnReloadIncomeOverviewEl) btnReloadIncomeOverviewEl.addEventListener('click', async ()=>{
    await loadIncomeOverview();
  });
  if (btnIncomeQuickTodayEl) btnIncomeQuickTodayEl.addEventListener('click', ()=>{
    const d = _bkkYmdNow();
    try{ if (incomeDatePickerEl) incomeDatePickerEl.value = d; }catch(e){}
    if (techIncomeLast7WrapEl) techIncomeLast7WrapEl.style.display = 'none';
    loadIncomeDayDetail(d);
  });
  if (btnIncomeQuickYesterdayEl) btnIncomeQuickYesterdayEl.addEventListener('click', ()=>{
    const d = _bkkYmdOffset(-1);
    try{ if (incomeDatePickerEl) incomeDatePickerEl.value = d; }catch(e){}
    if (techIncomeLast7WrapEl) techIncomeLast7WrapEl.style.display = 'none';
    loadIncomeDayDetail(d);
  });
  if (btnIncomeQuick7El) btnIncomeQuick7El.addEventListener('click', async ()=>{
    await loadLastDays(7);
  });
  if (btnIncomeQuickMonthEl) btnIncomeQuickMonthEl.addEventListener('click', async ()=>{
    const ym = incomeMonthPickerEl?.value || _bkkYmdNow().slice(0,7);
    await loadIncomeMonthStatement(ym);
  });
  if (btnLoadIncomeMonthEl) btnLoadIncomeMonthEl.addEventListener('click', async ()=>{
    const ym = incomeMonthPickerEl?.value || _bkkYmdNow().slice(0,7);
    await loadIncomeMonthStatement(ym);
  });
  if (btnIncomeQuick3MonthsEl) btnIncomeQuick3MonthsEl.addEventListener('click', async ()=>{
    if (techIncomeDayListEl) techIncomeDayListEl.innerHTML = '';
    await loadLastDays(92);
  });

  // ไม่ preload สเตทเมนต์ เพื่อลดความรกและโหลดเฉพาะตอนช่างกดดู
}catch(e){}

loadOffers();
loadJobs();
setInterval(() => loadOffers(), 15000);
setInterval(() => loadJobs(), 45000); // keep active/history in sync without making technician app feel heavy
setInterval(() => loadIncomeSummary(), 60000);
setInterval(() => loadIncomeOverview(), 90000);

// ✅ มือถือ: กดโทรแล้วกลับมา/สลับแอพ -> รีเฟรชสถานะทันที
window.addEventListener("focus", () => {
  try { loadJobs(); } catch(e) {}
  try { loadIncomeSummary(); } catch(e) {}
  try { loadIncomeOverview(); } catch(e) {}
});

function _updateIncomeChipDom(jobId, income) {
  const id = String(jobId || '');
  if (!id) return;
  const chips = document.querySelectorAll(`[data-tech-income-chip][data-job-id="${cssEscapeCompat(id)}"]`);
  const hasAmount = _hasIncomeAmount(income);
  const amountText = hasAmount ? _techMoneyAmountText(income.technician_income_amount, 'รอตรวจสอบรายได้') : 'รอตรวจสอบรายได้';
  chips.forEach((chip) => {
    try {
      chip.classList.toggle('is-pending', !hasAmount);
      const amountEl = chip.querySelector('[data-income-amount]');
      if (amountEl) amountEl.textContent = amountText;
      const key = chip.getAttribute('data-tech-income-chip') || '';
      const oldJob = __techIncomeModalJobStore.get(key) || { job_id: id };
      __techIncomeModalJobStore.set(key, _mergeTechIncomeIntoJob(oldJob, income));
    } catch (_) {}
  });
}

function scheduleTechnicianIncomeSummaryLoad(jobs, context) {
  const list = Array.isArray(jobs) ? jobs : [];
  const ids = [];
  for (const job of list) {
    const id = _jobIdOf(job);
    if (!id) continue;
    if (__techIncomeSummaryCache.has(id)) {
      _updateIncomeChipDom(id, __techIncomeSummaryCache.get(id));
      continue;
    }
    if (_hasIncomeAmount(job)) {
      __techIncomeSummaryCache.set(id, {
        job_id: Number(id),
        technician_income_amount: job.technician_income_amount,
        technician_income_source: job.technician_income_source || 'preloaded',
        technician_income_rate_set_id: job.technician_income_rate_set_id || null,
        technician_income_rate_set_version: job.technician_income_rate_set_version || null,
      });
      continue;
    }
    if (!__techIncomeBatchPending.has(id)) ids.push(id);
  }
  if (!ids.length) return;
  ids.forEach((id) => __techIncomeBatchPending.add(id));
  window.setTimeout(() => fetchTechnicianIncomeSummaryBatch(ids, context), 0);
}

async function fetchTechnicianIncomeSummaryBatch(ids, context) {
  const unique = [...new Set((ids || []).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0))].slice(0, 60);
  if (!unique.length) return;
  try {
    const res = await fetch(`${API_BASE}/tech/income-summary-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ username: _incomeFetchUsername(), job_ids: unique, context: context || 'current' }),
    });
    const data = await res.json().catch(() => ({}));
    const items = data && data.items ? data.items : {};
    for (const id of unique) {
      const item = items[String(id)] || { job_id: id, technician_income_amount: null, technician_income_source: 'unavailable' };
      __techIncomeSummaryCache.set(String(id), item);
      _updateIncomeChipDom(String(id), item);
    }
  } catch (e) {
    try { console.warn('[CWF_TECH_JOBS_DEBUG] income batch failed', e?.message || e); } catch (_) {}
    unique.forEach((id) => _updateIncomeChipDom(String(id), { job_id: id, technician_income_amount: null, technician_income_source: 'unavailable' }));
  } finally {
    unique.forEach((id) => __techIncomeBatchPending.delete(String(id)));
  }
}

async function fetchTechnicianIncomeDetail(jobId, storeKey) {
  const id = String(jobId || '');
  if (!id) return null;
  if (__techIncomeDetailCache.has(id)) return __techIncomeDetailCache.get(id);
  const res = await fetch(`${API_BASE}/tech/jobs/${encodeURIComponent(id)}/income-detail?username=${encodeURIComponent(_incomeFetchUsername())}`, { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.ok === false) throw new Error(data.error || 'income detail failed');
  __techIncomeDetailCache.set(id, data);
  __techIncomeSummaryCache.set(id, data);
  _updateIncomeChipDom(id, data);
  const key = String(storeKey || '');
  if (key) {
    const oldJob = __techIncomeModalJobStore.get(key) || { job_id: id };
    const merged = _mergeTechIncomeIntoJob(oldJob, data);
    __techIncomeModalJobStore.set(key, merged);
    const body = document.getElementById('tech-income-modal-body');
    const modal = document.getElementById('tech-income-modal');
    if (body && modal && modal.classList.contains('show')) body.innerHTML = _renderTechnicianIncomeBreakdownContent(merged);
  }
  return data;
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    try { loadJobs(); } catch(e) {}
    try { loadIncomeSummary(); } catch(e) {}
    try { loadIncomeOverview(); } catch(e) {}
  }
});

// =======================================
// 📨 LOAD OFFERS
// =======================================
function loadOffers() {
  fetch(`${API_BASE}/offers/tech/${username}`, { cache: "no-store" })
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
          const newOffers = list.filter((o) => newOnes.includes(Number(o.offer_id)));
          if (newOffers.length === 1) {
            const offer = newOffers[0];
            showNotify("📌 CWF มีงานเข้าใหม่", `${_offerShortNotifyText(offer)}\n${_offerIncomeNotifyText(offer)}`);
          } else {
            showNotify("📌 CWF มีงานเข้าใหม่", `มีข้อเสนอใหม่ ${newOffers.length || newOnes.length} งาน\n💲 เปิดดูยอดที่ช่างจะได้รับในแต่ละงาน`);
          }
        }

        // เก็บล่าสุด (จำกัด 50)
        localStorage.setItem(LS_LAST_OFFER_KEY, JSON.stringify(nowIds.slice(0, 50)));
      } catch {
        // ignore
      }

      renderOffers(list);
      scheduleTechnicianIncomeSummaryLoad(list, 'offered');
    })
    .catch((err) => {
      console.error(err);
      if (offerList) offerList.innerHTML = "<p>❌ โหลดข้อเสนองานไม่สำเร็จ</p>";
    });
}

function renderOffers(offers) {
  if (!offerList) return;

  const filtered = offers || [];

  if (!filtered.length) {
    offerList.innerHTML = "<p>ยังไม่มีงานที่เสนอให้ตอนนี้</p>";
    return;
  }

  offerList.innerHTML = filtered
    .map((o) => {
      const expires = new Date(o.expires_at).getTime();
      const now = Date.now();
      const secLeft = Math.max(0, Math.floor((expires - now) / 1000));
      const min = Math.floor(secLeft / 60);
      const sec = secLeft % 60;

      const booking = o.booking_code || ('CWF'+String(o.job_id).padStart(7,'0'));
      const apptText = (() => { try { return new Date(o.appointment_datetime).toLocaleString("th-TH", { dateStyle:"medium", timeStyle:"short" }); } catch (_) { return o.appointment_datetime || "-"; } })();
      return `
      <div class="job-card cwf-new-offer-card" style="border:1px solid rgba(251,191,36,0.55);">
        <div class="cwf-new-offer-head">
          <div>
            <span class="cwf-new-offer-kicker">งานเข้าใหม่</span>
            <b>📌 งานใหม่เสนอให้รับ</b>
          </div>
          <span class="badge wait cwf-new-offer-countdown">⏳ ${min}:${String(sec).padStart(2, "0")}</span>
        </div>
        ${renderTechnicianMoneySummary(o, "offered")}

        <div class="cwf-new-offer-grid">
          <div><span>เลขงาน</span><b>${escapeHTML(booking)}</b></div>
          <div><span>ประเภท</span><b>${escapeHTML(o.job_type || '-')}</b></div>
          <div><span>วันนัด</span><b>${escapeHTML(apptText)}</b></div>
          <div><span>ลูกค้า</span><b>${escapeHTML(o.customer_name || '-')}</b></div>
        </div>
        <div class="cwf-new-offer-address">
          <span>ที่อยู่</span>
          <b>${escapeHTML(o.address_text || "-")}</b>
        </div>

        <div class="row cwf-new-offer-actions" style="margin-top:10px;">
          <button onclick="acceptOffer(${o.offer_id})">✅ รับงานนี้</button>
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
  fetch(`${API_BASE}/jobs/tech/${username}`, { cache: "no-store" })
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
function normStatusKey(s) {
  return normStatus(s).toLowerCase();
}
function isDoneStatusValue(s) {
  const v = normStatusKey(s);
  return ["เสร็จแล้ว","เสร็จสิ้น","เสร็จสิ้นงาน","ปิดงาน","ปิดงานแล้ว","done","completed","closed","paid"].includes(v) || v.includes("เสร็จ") || v.includes("ปิดงาน");
}
function isCancelStatusValue(s) {
  const v = normStatusKey(s);
  return ["ยกเลิก","cancelled","canceled","cancel"].includes(v) || v.includes("ยกเลิก");
}
function isActiveStatusValue(s) {
  const v = normStatusKey(s);
  if (!v) return false;
  if (isDoneStatusValue(v) || isCancelStatusValue(v)) return false;
  return [
    "รอดำเนินการ","กำลังทำ","ตีกลับ","รอช่างยืนยัน","งานแก้ไข","รับงานแล้ว",
    "accepted","assigned","pending","pending_accept","in_progress","in progress","working","started"
  ].includes(v) || v.includes("รอดำเนิน") || v.includes("กำลัง") || v.includes("แก้ไข") || v.includes("รับงาน") || v.includes("ยืนยัน");
}

function technicianJobStatusBadge(job) {
  const raw = normStatus(job?.job_status);
  const v = normStatusKey(raw);
  const hasAssignedTech = !!String(job?.technician_team || job?.technician_username || job?.assigned_to || '').trim();
  if (isDoneStatusValue(raw)) return `<span class="badge ok">✅ เสร็จแล้ว</span>`;
  if (isCancelStatusValue(raw)) return `<span class="badge bad">⛔ ยกเลิก</span>`;
  if (raw === "กำลังทำ" || v === "working" || v === "started" || v === "in_progress" || v === "in progress") {
    return `<span class="badge run">🛠️ กำลังทำ</span>`;
  }
  if (raw === "งานแก้ไข" || v.includes("แก้ไข")) return `<span class="badge wait">🔁 งานแก้ไข</span>`;

  // งานยิงด่วนหลังช่างกดรับงาน บาง record ยังถือ job_status เดิมเป็น
  // "รอช่างยืนยัน" / "pending_accept" / "accepted" จึงห้ามปล่อยให้ตกไปเป็นยกเลิก
  if (hasAssignedTech && (["รอช่างยืนยัน", "รับงานแล้ว", "accepted", "assigned", "pending_accept"].includes(v) || raw === "รอช่างยืนยัน" || raw === "รับงานแล้ว")) {
    return `<span class="badge wait">📌 รับงานแล้ว</span>`;
  }
  if (isActiveStatusValue(raw)) return `<span class="badge wait">⏳ รอดำเนินการ</span>`;

  // fallback ปลอดภัย: สถานะที่ไม่รู้จักแต่ยังอยู่ในงานปัจจุบัน ไม่ควรแสดงเป็น "ยกเลิก"
  return `<span class="badge wait">⏳ รอดำเนินการ</span>`;
}
function jobHistoryYmd(job) {
  // ประวัติงานต้องอิงวันปิดงานก่อน ไม่ใช่วันนัดอย่างเดียว
  return ymdBkkFromISO(job?.finished_at || job?.completed_at || job?.closed_at || job?.paid_at || job?.appointment_datetime);
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

// Production guard: bind history filter buttons with JS too, not only inline onclick.
try {
  if (historyTabDayEl) historyTabDayEl.addEventListener('click', (ev) => { ev.preventDefault(); setHistoryFilter('day'); });
  if (historyTabMonthEl) historyTabMonthEl.addEventListener('click', (ev) => { ev.preventDefault(); setHistoryFilter('month'); });
  if (historyTabAllEl) historyTabAllEl.addEventListener('click', (ev) => { ev.preventDefault(); setHistoryFilter('all'); });
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

function _isYmd(v){
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || "").trim());
}

function formatThaiDateShort(ymd){
  if (!_isYmd(ymd)) return "-";
  try{
    const dt = new Date(`${ymd}T12:00:00+07:00`);
    return dt.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", weekday:"short", day:"numeric", month:"short", year:"numeric" });
  }catch(_){
    return ymd;
  }
}

function setUpcomingFilter(dateYmd, opts){
  const normalized = _isYmd(dateYmd) ? String(dateYmd) : "";
  __ACTIVE_UPCOMING_FILTER__ = normalized;
  try{
    if (normalized) localStorage.setItem(ACTIVE_UPCOMING_FILTER_KEY, normalized);
    else localStorage.removeItem(ACTIVE_UPCOMING_FILTER_KEY);
  }catch(_){ }
  if (activeUpcomingDatePickerEl) activeUpcomingDatePickerEl.value = normalized;
  if (!(opts && opts.skipRender)) {
    try { renderJobs(window.__JOB_CACHE__ || []); } catch(_) {}
  }
}
window.setUpcomingFilter = setUpcomingFilter;

function renderUpcomingQuickDates(dateList){
  if (!activeUpcomingDateQuickEl) return;
  const dates = Array.isArray(dateList) ? dateList.filter(_isYmd) : [];
  activeUpcomingDateQuickEl.innerHTML = "";
  if (!dates.length) return;
  dates.slice(0, 10).forEach((ymd)=>{
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `premium-chip${__ACTIVE_UPCOMING_FILTER__ === ymd ? ' active' : ''}`;
    btn.textContent = formatThaiDateShort(ymd);
    btn.addEventListener("click", ()=> setUpcomingFilter(ymd));
    activeUpcomingDateQuickEl.appendChild(btn);
  });
  if (dates.length > 10) {
    const more = document.createElement("div");
    more.className = "muted";
    more.style.alignSelf = "center";
    more.textContent = `+ อีก ${dates.length - 10} วัน`;
    activeUpcomingDateQuickEl.appendChild(more);
  }
}

function renderUpcomingHint(filteredCount, totalCount){
  if (!activeUpcomingHintEl) return;
  if (!totalCount) {
    activeUpcomingHintEl.textContent = "ยังไม่มีงานล่วงหน้า";
    return;
  }
  if (__ACTIVE_UPCOMING_FILTER__) {
    activeUpcomingHintEl.textContent = `กำลังแสดง ${filteredCount} งาน ของวันที่ ${formatThaiDateShort(__ACTIVE_UPCOMING_FILTER__)} • กด “ดูทั้งหมด” เพื่อกลับไปดูทุกวัน`;
    return;
  }
  activeUpcomingHintEl.textContent = `มีงานล่วงหน้าทั้งหมด ${totalCount} งาน • เลือกดูทีละวันได้เพื่อลดความสับสน`;
}

function renderJobs(jobs) {
  // ✅ cache ไว้ใช้กับ popup เก็บเงินลูกค้า / เปิด e-slip
  window.__JOB_CACHE__ = Array.isArray(jobs) ? jobs : [];

  if (activeJobsEl) activeJobsEl.innerHTML = "";
  if (activeUpcomingJobsEl) activeUpcomingJobsEl.innerHTML = "";
  if (historyJobsEl) historyJobsEl.innerHTML = "";

  if (!Array.isArray(jobs) || jobs.length === 0) {
    if (activeJobsEl) activeJobsEl.innerHTML = "<p>✅ วันนี้ยังไม่มีงาน</p>";
    if (activeUpcomingJobsEl) activeUpcomingJobsEl.innerHTML = "<p>ยังไม่มีงานล่วงหน้า</p>";
    if (historyJobsEl) historyJobsEl.innerHTML = "<p>ยังไม่มีประวัติงาน</p>";
    loadCompletedCountSummary();
    renderProfile(0);
    return;
  }

  const todayYMD = todayYmdBkk();

  const activeAll = jobs.filter((j) => isActiveStatusValue(j.job_status));
  // งานปัจจุบัน = งาน active ทั้ง "วันนี้" และงานค้างจากวันก่อนหน้า
  // โดยเฉพาะงาน "งานแก้ไข" ที่ถูก return_for_fix_v2 หลังวันนัดเดิมผ่านไปแล้ว
  // ต้องยังเห็นใน current/active flow ของช่าง ไม่งั้นงานจะหายจากหน้าจอ
  const activeToday = activeAll.filter((j)=>{
    const y = ymdBkkFromISO(j.appointment_datetime);
    return !y || y <= todayYMD;
  });
  // งานล่วงหน้า = งานที่นัดวันมากกว่าวันนี้
  const activeUpcoming = activeAll.filter((j)=>{
    const y = ymdBkkFromISO(j.appointment_datetime);
    return y && y > todayYMD;
  }).sort((a,b)=>{
    const aa = a?.appointment_datetime ? new Date(a.appointment_datetime).getTime() : 0;
    const bb = b?.appointment_datetime ? new Date(b.appointment_datetime).getTime() : 0;
    return aa - bb;
  });

  const historyBase = jobs.filter((j) => isDoneStatusValue(j.job_status) || isCancelStatusValue(j.job_status) || !!j.finished_at || !!j.paid_at);
  let historyAll = historyBase;

  // ✅ ฟิลเตอร์ประวัติ: วัน/เดือน/ทั้งหมด (อิง Asia/Bangkok)
  // งานที่ปิดแล้วต้องอิง finished_at ก่อน ถ้าไม่มีค่อย fallback ไป appointment_datetime
  // กันเคสปิดงานวันนี้แต่นัดเมื่อวานแล้วประวัติหาย
  const monthKey = todayYMD.slice(0,7);
  if (__HISTORY_FILTER__ === "day") {
    historyAll = historyAll.filter(j => jobHistoryYmd(j) === todayYMD);
  } else if (__HISTORY_FILTER__ === "month") {
    historyAll = historyAll.filter(j => {
      const y = jobHistoryYmd(j);
      return y && y.slice(0,7) === monthKey;
    });
  }
  // IMPORTANT: ห้าม fallback ไปแสดงทั้งหมดเมื่อเลือก “วัน” หรือ “เดือน”
  // เพราะจะทำให้หน้า “วันนี้” แสดงงานเมื่อวาน/งานเก่า และหน้า “เดือนนี้” แสดงงานนอกเดือน
  // ถ้าไม่มีงานตรงช่วงที่เลือก ให้แสดงว่าไม่มีงานในช่วงนั้นจริง ๆ

  const prioritizedActiveToday = [...activeToday].sort((a, b) => {
    const aRevisit = isRevisitJob(a) ? 1 : 0;
    const bRevisit = isRevisitJob(b) ? 1 : 0;
    if (aRevisit !== bRevisit) return bRevisit - aRevisit;
    const ad = a?.returned_at ? new Date(a.returned_at).getTime() : 0;
    const bd = b?.returned_at ? new Date(b.returned_at).getTime() : 0;
    if (ad !== bd) return bd - ad;
    const aa = a?.appointment_datetime ? new Date(a.appointment_datetime).getTime() : 0;
    const ba = b?.appointment_datetime ? new Date(b.appointment_datetime).getTime() : 0;
    return aa - ba;
  });

  try {
    console.log('[CWF_TECH_JOBS_DEBUG] render counts', {
      raw: jobs.length,
      activeToday: prioritizedActiveToday.length,
      activeUpcoming: activeUpcoming.length,
      history: historyAll.length,
      filter: __HISTORY_FILTER__,
    });
  } catch (_) {}

  if (activeJobsEl) {
    if (!prioritizedActiveToday.length) activeJobsEl.innerHTML = "<p>✅ วันนี้ยังไม่มีงาน</p>";
    prioritizedActiveToday.forEach((job) => activeJobsEl.appendChild(buildJobCard(job, false)));
  }

  const upcomingDates = [...new Set(activeUpcoming.map((j)=> ymdBkkFromISO(j.appointment_datetime)).filter(Boolean))].sort();
  renderUpcomingQuickDates(upcomingDates);
  const filteredUpcoming = __ACTIVE_UPCOMING_FILTER__
    ? activeUpcoming.filter((j)=> ymdBkkFromISO(j.appointment_datetime) === __ACTIVE_UPCOMING_FILTER__)
    : activeUpcoming;
  renderUpcomingHint(filteredUpcoming.length, activeUpcoming.length);

  if (activeUpcomingJobsEl) {
    if (!filteredUpcoming.length) {
      activeUpcomingJobsEl.innerHTML = __ACTIVE_UPCOMING_FILTER__
        ? `<p>ไม่มีงานล่วงหน้าในวันที่ ${formatThaiDateShort(__ACTIVE_UPCOMING_FILTER__)}</p>`
        : "<p>ยังไม่มีงานล่วงหน้า</p>";
    }
    filteredUpcoming.forEach((job) => activeUpcomingJobsEl.appendChild(buildJobCard(job, false)));
  }

  if (historyJobsEl) {
    if (!historyAll.length) {
      const emptyText = (__HISTORY_FILTER__ === "day")
        ? "ยังไม่มีงานที่ปิดแล้วในวันนี้"
        : (__HISTORY_FILTER__ === "month")
          ? "ยังไม่มีงานที่ปิดแล้วในเดือนนี้"
          : "ยังไม่มีงานที่ปิดแล้ว";
      historyJobsEl.innerHTML = `<p>${emptyText}</p>`;
    } else {
      historyAll
        .slice()
        .sort((a, b) => {
          const aa = new Date(a?.finished_at || a?.completed_at || a?.closed_at || a?.paid_at || a?.appointment_datetime || 0).getTime() || 0;
          const bb = new Date(b?.finished_at || b?.completed_at || b?.closed_at || b?.paid_at || b?.appointment_datetime || 0).getTime() || 0;
          return bb - aa;
        })
        .forEach((job) => historyJobsEl.appendChild(buildHistorySummary(job)));
    }
  }


  // โหลดที่ช่างจะได้รับแบบ async หลังใบงานแสดงแล้ว ใบงานจึงไม่ต้องรอ payout/rate engine
  try {
    scheduleTechnicianIncomeSummaryLoad([...prioritizedActiveToday, ...filteredUpcoming, ...historyAll], 'jobs');
  } catch (_) {}

  // 🔔 เตือนก่อนถึงเวลานัด 30 นาที (เฉพาะงานวันนี้)
  try {
    check30mReminder(activeToday);
  } catch {
    // ignore
  }

  loadCompletedCountSummary();
  renderProfile();
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

const REVISIT_EVIDENCE_PHASES = ["revisit_before", "revisit_after", "revisit_defect"];

function isRevisitJob(job){
  const status = normStatus(job?.job_status);
  return status === "งานแก้ไข" || !!job?.returned_at || !!job?.return_reason;
}

function getRevisitResultValue(jobKey){
  const node = document.getElementById(`revisit-result-${jobKey}`);
  return String(node?.value || "").trim().toLowerCase();
}

function getRevisitNoteValue(jobKey){
  const node = document.getElementById(`revisit-note-${jobKey}`);
  return String(node?.value || "").trim();
}

async function hasRevisitEvidence(jobId){
  const localPhotos = await idbGetByJob(jobId).catch(() => []);
  if ((localPhotos || []).some((x) => REVISIT_EVIDENCE_PHASES.includes(String(x?.phase || "")))) return true;
  try {
    const rr = await fetch(`${API_BASE}/jobs/${encodeURIComponent(String(jobId))}/photos`);
    if (!rr.ok) return false;
    const uploaded = await rr.json().catch(() => []);
    return (uploaded || []).some((x) => REVISIT_EVIDENCE_PHASES.includes(String(x?.phase || "")) && x?.public_url);
  } catch {
    return false;
  }
}

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
// 🧩 CWF CLOSE FLOW MODAL UI (clean production layout v2 - collect customer payment)
// - หน้าหลักต้องเหลือแค่ปุ่ม: ลงรูป / เช็คลิส / เก็บเงินลูกค้า
// - รายละเอียดทั้งหมดอยู่ใน Modal เพื่อไม่ให้หน้า “งานปัจจุบัน” รก/ซ้อน
// =======================================
const CWF_COMPANY_QR_URL = "/assets/cwf-promptpay-qr.jpg";
const CWF_PRE_CHECK_ITEMS = [
  "หน้ากาก / ฝาครอบ / ขาล็อก",
  "บานสวิง",
  "แผ่นกรองอากาศ",
  "น้ำหยด / รอยน้ำรั่วก่อนล้าง",
  "เสียงผิดปกติ / เครื่องสั่น",
  "ความเย็นก่อนล้าง",
  "Error / เปิดไม่ติด / รีโมทสั่งไม่ได้",
];
const CWF_POST_CHECK_ITEMS = [
  "เปิดเครื่องติดปกติ",
  "แอร์เย็นหลังล้าง",
  "ไม่มีน้ำหยดหลังล้าง",
  "บานสวิง / หน้ากาก ประกอบกลับปกติ",
  "พื้นที่ทำงานสะอาดเรียบร้อย",
];

function cwfCloseKey(jobId){ return String(jobId || "").trim(); }
function cwfCloseJsonKey(jobId, name){ return `cwf_close_${name}_${cwfCloseKey(jobId)}`; }
function cwfReadJsonLS(key, fallback){ try { return JSON.parse(localStorage.getItem(key) || ""); } catch { return fallback; } }
function cwfWriteJsonLS(key, value){ try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function cwfGetCachedJob(jobId){
  const key = cwfCloseKey(jobId);
  return (window.__JOB_CACHE__ || []).find(j => String(j.job_id) === key || String(j.booking_code || "") === key) || null;
}
function cwfMoney(n){ return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }

function ensureCwfCloseStyles(){
  if (document.getElementById('cwfCloseFlowStyles')) return;
  const style = document.createElement('style');
  style.id = 'cwfCloseFlowStyles';
  style.textContent = `
    .cwf-close-hub{display:grid!important;grid-template-columns:1fr!important;gap:12px!important;margin:12px 0 14px!important}
    .cwf-close-action{appearance:none!important;-webkit-appearance:none!important;width:100%!important;min-height:84px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:14px!important;text-align:left!important;border:1px solid rgba(148,163,184,.32)!important;background:#ffffff!important;color:#0f172a!important;border-radius:24px!important;padding:17px 16px!important;box-shadow:0 10px 26px rgba(15,23,42,.08)!important;cursor:pointer!important;line-height:1.28!important}
    .cwf-close-action:active{transform:translateY(1px)!important}.cwf-close-action:disabled{opacity:.58!important;cursor:not-allowed!important}.cwf-close-action .cwf-action-left{display:flex!important;align-items:center!important;gap:14px!important;min-width:0!important}.cwf-close-action .ico{width:48px!important;height:48px!important;min-width:48px!important;border-radius:17px!important;display:flex!important;align-items:center!important;justify-content:center!important;background:#eef5ff!important;color:#1558d6!important;font-size:24px!important;border:1px solid rgba(37,99,235,.12)!important;box-shadow:none!important}.cwf-close-action b{display:block!important;font-size:18px!important;margin:0!important;color:#0f172a!important;font-weight:1000!important;letter-spacing:0!important}.cwf-close-action small{display:block!important;color:#64748b!important;line-height:1.42!important;margin-top:4px!important;font-size:13px!important;font-weight:750!important}.cwf-action-arrow{font-size:24px!important;color:#94a3b8!important;font-weight:1000!important}
    .cwf-modal-backdrop{position:fixed;inset:0;z-index:10050;background:rgba(2,6,23,.62);display:flex;align-items:flex-end;justify-content:center;padding:0 10px 10px}
    .cwf-modal-panel{width:min(720px,100%);max-height:88vh;overflow:hidden;background:#f8fbff;border:1px solid rgba(148,163,184,.34);border-radius:26px 26px 18px 18px;box-shadow:0 26px 70px rgba(2,6,23,.36);display:flex;flex-direction:column}
    .cwf-modal-head{padding:15px 16px;background:linear-gradient(135deg,#071947,#1558d6);color:#fff;display:flex;justify-content:space-between;align-items:center;gap:10px}.cwf-modal-head b{font-size:18px}.cwf-modal-head button{width:auto;min-width:44px;border-radius:999px;background:#ffcc00;color:#111827;border:0;font-weight:900;padding:9px 13px}
    .cwf-modal-body{padding:14px;overflow:auto}.cwf-modal-footer{padding:12px 14px;border-top:1px solid rgba(148,163,184,.25);background:#fff;display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}
    .cwf-mini-status{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.cwf-chip{border:1px solid rgba(37,99,235,.18);background:#eef5ff;color:#1558d6;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:900}.cwf-chip.ok{background:#ecfdf5;color:#047857;border-color:#a7f3d0}.cwf-chip.warn{background:#fff7ed;color:#c2410c;border-color:#fed7aa}.cwf-chip.bad{background:#fff1f2;color:#be123c;border-color:#fecdd3}
    .cwf-photo-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.cwf-photo-card{background:#fff;border:1px solid rgba(37,99,235,.15);border-radius:18px;padding:12px;box-shadow:0 10px 26px rgba(15,23,42,.06)}.cwf-photo-card b{font-size:16px}.cwf-photo-card .muted{font-size:12px}.cwf-photo-card button{width:100%;margin-top:9px;border-radius:15px}.cwf-thumb-row{display:flex;gap:6px;overflow:auto;margin-top:8px}.cwf-thumb-row img{width:54px;height:54px;border-radius:12px;object-fit:cover;border:1px solid rgba(15,23,42,.12);background:#fff}
    .cwf-check-list{display:flex;flex-direction:column;gap:8px}.cwf-check-row{background:#fff;border:1px solid rgba(37,99,235,.13);border-radius:16px;padding:10px}.cwf-check-main{display:flex;align-items:center;gap:10px}.cwf-check-main input{width:22px;height:22px;accent-color:#1558d6}.cwf-check-main label{font-weight:900;color:#0f172a;line-height:1.35}.cwf-check-tools{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;padding-left:32px}.cwf-link-btn{border:1px solid rgba(148,163,184,.3);background:#f8fafc;color:#334155;border-radius:999px;padding:7px 10px;font-weight:900;font-size:12px;width:auto}.cwf-issue-note{margin:8px 0 0 32px}.cwf-issue-note textarea{min-height:74px;border-radius:14px}
    .cwf-pay-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}.cwf-pay-tab{appearance:none!important;border:1px solid rgba(37,99,235,.16)!important;background:#fff!important;color:#0f172a!important;border-radius:17px!important;padding:12px 8px!important;font-weight:1000!important;min-height:62px!important;line-height:1.25!important}.cwf-pay-tab.active{background:linear-gradient(135deg,#1558d6,#05b6d6)!important;color:#fff!important;border-color:transparent!important;box-shadow:0 12px 28px rgba(37,99,235,.23)!important}.cwf-pay-card{background:#fff;border:1px solid rgba(37,99,235,.14);border-radius:20px;padding:13px;box-shadow:0 12px 28px rgba(15,23,42,.06)}.cwf-qr-img{display:block;width:min(300px,100%);margin:12px auto;border-radius:18px;border:1px solid rgba(15,23,42,.12);background:#fff}.cwf-pay-card input,.cwf-pay-card textarea{border-radius:14px}
    .cwf-note-box{background:#fff;border:1px solid rgba(37,99,235,.12);border-radius:18px;padding:12px;margin-top:10px}.cwf-note-box textarea{border-radius:16px;min-height:105px}.cwf-final-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.cwf-final-row button{border-radius:18px;min-height:52px}
    @media(max-width:560px){.cwf-photo-grid{grid-template-columns:1fr!important}.cwf-pay-tabs{grid-template-columns:1fr!important}.cwf-modal-panel{max-height:90vh!important}.cwf-final-row{grid-template-columns:1fr!important}}
  `;
  document.head.appendChild(style);
}

function cwfOpenModal(title, bodyHtml, footerHtml){
  ensureCwfCloseStyles();
  const old = document.getElementById('cwf-close-flow-modal');
  if (old) old.remove();
  const wrap = document.createElement('div');
  wrap.id = 'cwf-close-flow-modal';
  wrap.className = 'cwf-modal-backdrop';
  wrap.innerHTML = `
    <div class="cwf-modal-panel" role="dialog" aria-modal="true">
      <div class="cwf-modal-head"><b>${title}</b><button type="button" onclick="cwfCloseModal()">ปิด</button></div>
      <div class="cwf-modal-body">${bodyHtml || ''}</div>
      ${footerHtml ? '<div class="cwf-modal-footer">' + footerHtml + '</div>' : ''}
    </div>`;
  wrap.addEventListener('click', (ev)=>{ if (ev.target === wrap) cwfCloseModal(); });
  document.body.appendChild(wrap);
  return wrap;
}
function cwfCloseModal(){ const el = document.getElementById('cwf-close-flow-modal'); if (el) el.remove(); }
window.cwfCloseModal = cwfCloseModal;

async function cwfCountPhotos(jobId){
  const phases = ['before','after','pressure','current','temp','defect','payment_slip','cash_transfer_slip','revisit_before','revisit_after','revisit_defect'];
  const counts = Object.fromEntries(phases.map(p=>[p,0]));
  const urls = Object.fromEntries(phases.map(p=>[p,[]]));
  try {
    const rr = await fetch(`${API_BASE}/jobs/${encodeURIComponent(String(jobId))}/photos`, { cache:'no-store' });
    if (rr.ok) {
      const list = await rr.json().catch(()=>[]);
      (Array.isArray(list) ? list : []).forEach(p => {
        const ph = String(p.phase || '').trim();
        if (counts[ph] != null && p.public_url) { counts[ph] += 1; urls[ph].push(p.public_url); }
      });
    }
  } catch {}
  try {
    const pending = await idbGetByJob(jobId);
    (pending || []).forEach(p => { const ph = String(p.phase || '').trim(); if (counts[ph] != null) counts[ph] += 1; });
  } catch {}
  return { counts, urls };
}

async function openTechPhotoModal(jobId){
  const key = cwfCloseKey(jobId);
  const job = cwfGetCachedJob(key);
  const canEdit = !job || !isDoneStatusValue(normStatus(job.job_status));
  const revisitFlow = isRevisitJob(job);
  cwfOpenModal('📷 ลงรูปหลักฐานหน้างาน', `<div class="muted">กำลังโหลดสถานะรูป...</div>`);
  const { counts, urls } = await cwfCountPhotos(key);
  const defs = [
    ['before','ก่อนทำ','หลักฐานสำคัญ'], ['after','หลังทำ','หลักฐานสำคัญ'],
    ['pressure','วัดน้ำยา','เพิ่มเติม'], ['current','วัดกระแส','เพิ่มเติม'], ['temp','อุณหภูมิ','เพิ่มเติม'], ['defect','ตำหนิ','เพิ่มเติม'],
  ].concat(revisitFlow ? [['revisit_before','ก่อนแก้','งานแก้ไข'], ['revisit_after','หลังแก้','งานแก้ไข'], ['revisit_defect','จุดปัญหา','งานแก้ไข']] : []);
  const html = `
    <div class="cwf-mini-status">
      <span class="cwf-chip ${counts.before ? 'ok':'warn'}">ก่อนทำ ${counts.before || 0} รูป</span>
      <span class="cwf-chip ${counts.after ? 'ok':'warn'}">หลังทำ ${counts.after || 0} รูป</span>
      <span class="cwf-chip">กดเพิ่มรูปแล้วรอระบบอัปโหลดให้เสร็จ</span>
    </div>
    <div class="cwf-photo-grid">
      ${defs.map(([phase,label,badge])=>`
        <div class="cwf-photo-card" id="photo-card-${phase}">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><b>${label}</b><span class="cwf-chip ${counts[phase] ? 'ok':''}">${badge}</span></div>
          <div class="muted" style="margin-top:5px">${counts[phase] ? 'มีแล้ว ' + counts[phase] + ' รูป' : 'ยังไม่มีรูป'}</div>
          ${(urls[phase] || []).length ? '<div class="cwf-thumb-row">' + urls[phase].slice(0,6).map(u=>'<a href="'+u+'" target="_blank"><img src="'+u+'" alt="'+label+'"></a>').join('') + '</div>' : ''}
          <button type="button" ${canEdit ? '' : 'disabled'} onclick="cwfPickPhotoAndRefresh('${key.replace(/'/g,"\\'")}', '${phase}')">📷 เพิ่มรูป</button>
        </div>`).join('')}
    </div>
    <div class="cwf-mini-status" style="margin-top:12px">
      <button class="secondary" type="button" style="width:auto" onclick="openUploadedPhotos('${key.replace(/'/g,"\\'")}')">🖼️ ดูรูปที่อัปโหลดแล้ว</button>
      <button class="secondary" type="button" style="width:auto" onclick="forceUpload('${key.replace(/'/g,"\\'")}')">⬆️ อัปโหลดค้างในเครื่อง</button>
    </div>`;
  cwfOpenModal('📷 ลงรูปหลักฐานหน้างาน', html, `<button type="button" class="secondary" onclick="cwfCloseModal()">ปิด</button>`);
}
window.openTechPhotoModal = openTechPhotoModal;
function cwfPickPhotoAndRefresh(jobId, phase){
  try {
    pickPhotos(jobId, phase, 12);
    setTimeout(()=>openTechPhotoModal(jobId), 900);
  } catch(e){ alert(e.message || 'เลือกรูปไม่สำเร็จ'); }
}
window.cwfPickPhotoAndRefresh = cwfPickPhotoAndRefresh;

function cwfDefaultChecklist(){ return { pre:{}, post:{} }; }
function cwfGetChecklist(jobId){ return cwfReadJsonLS(cwfCloseJsonKey(jobId,'checklist'), cwfDefaultChecklist()) || cwfDefaultChecklist(); }
function cwfSaveChecklist(jobId, data){ cwfWriteJsonLS(cwfCloseJsonKey(jobId,'checklist'), data || cwfDefaultChecklist()); }
function cwfChecklistProgress(section){ const items = section === 'pre' ? CWF_PRE_CHECK_ITEMS : CWF_POST_CHECK_ITEMS; const data = cwfGetChecklist(window.__cwfChecklistJobId || ''); return items.filter((_,i)=> data?.[section]?.[i]?.checked || data?.[section]?.[i]?.issue).length; }
function cwfSetChecklistAll(jobId, section){
  const data = cwfGetChecklist(jobId); data[section] = data[section] || {};
  const items = section === 'pre' ? CWF_PRE_CHECK_ITEMS : CWF_POST_CHECK_ITEMS;
  items.forEach((_,i)=>{ data[section][i] = { checked:true, issue:false, note:'' }; });
  cwfSaveChecklist(jobId, data); openTechChecklistModal(jobId, section);
}
window.cwfSetChecklistAll = cwfSetChecklistAll;
function cwfToggleCheck(jobId, section, idx, checked){
  const data = cwfGetChecklist(jobId); data[section] = data[section] || {}; const row = data[section][idx] || {};
  row.checked = !!checked; if (checked) row.issue = false; data[section][idx] = row; cwfSaveChecklist(jobId, data); openTechChecklistModal(jobId, section);
}
window.cwfToggleCheck = cwfToggleCheck;
function cwfToggleIssue(jobId, section, idx){
  const data = cwfGetChecklist(jobId); data[section] = data[section] || {}; const row = data[section][idx] || {};
  row.issue = !row.issue; if (row.issue) row.checked = false; data[section][idx] = row; cwfSaveChecklist(jobId, data); openTechChecklistModal(jobId, section);
}
window.cwfToggleIssue = cwfToggleIssue;
function cwfSaveIssueNote(jobId, section, idx, value){
  const data = cwfGetChecklist(jobId); data[section] = data[section] || {}; const row = data[section][idx] || {}; row.note = String(value || ''); data[section][idx] = row; cwfSaveChecklist(jobId, data);
}
window.cwfSaveIssueNote = cwfSaveIssueNote;
function cwfChecklistSectionHtml(jobId, section){
  const data = cwfGetChecklist(jobId); const items = section === 'pre' ? CWF_PRE_CHECK_ITEMS : CWF_POST_CHECK_ITEMS;
  const issueText = section === 'pre' ? 'มีปัญหาอยู่ก่อน' : 'พบปัญหาใหม่';
  const checkedCount = items.filter((_,i)=> data?.[section]?.[i]?.checked || data?.[section]?.[i]?.issue).length;
  return `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px">
      <div><b>${section === 'pre' ? '🔎 ตรวจสภาพก่อนล้าง' : '✅ ตรวจหลังล้าง'}</b><div class="muted">ติ๊กปกติให้ครบ หรือกด “${issueText}” เฉพาะรายการที่มีปัญหา</div></div>
      <span class="cwf-chip ${checkedCount === items.length ? 'ok':'warn'}">${checkedCount}/${items.length}</span>
    </div>
    <button type="button" class="secondary" style="width:auto;margin-bottom:10px" onclick="cwfSetChecklistAll('${String(jobId).replace(/'/g,"\\'")}', '${section}')">ปกติทั้งหมด</button>
    <div class="cwf-check-list">
      ${items.map((label,i)=>{ const row = data?.[section]?.[i] || {}; return `
        <div class="cwf-check-row">
          <div class="cwf-check-main">
            <input type="checkbox" ${row.checked ? 'checked':''} onchange="cwfToggleCheck('${String(jobId).replace(/'/g,"\\'")}', '${section}', ${i}, this.checked)">
            <label>${i+1}. ${label}</label>
            ${row.issue ? `<span class="cwf-chip bad">${issueText}</span>` : ''}
          </div>
          <div class="cwf-check-tools"><button type="button" class="cwf-link-btn" onclick="cwfToggleIssue('${String(jobId).replace(/'/g,"\\'")}', '${section}', ${i})">${row.issue ? 'ยกเลิกปัญหา' : issueText}</button></div>
          ${row.issue ? `<div class="cwf-issue-note"><textarea placeholder="หมายเหตุ เช่น บานสวิงหักอยู่ก่อน / หน้ากากแตก / มีน้ำหยด" oninput="cwfSaveIssueNote('${String(jobId).replace(/'/g,"\\'")}', '${section}', ${i}, this.value)">${String(row.note||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea></div>` : ''}
        </div>`; }).join('')}
    </div>`;
}
function openTechChecklistModal(jobId, section){
  const active = section || 'pre';
  const key = cwfCloseKey(jobId);
  const html = `
    <div class="cwf-pay-tabs" style="grid-template-columns:1fr 1fr">
      <button type="button" class="cwf-pay-tab ${active==='pre'?'active':''}" onclick="openTechChecklistModal('${key.replace(/'/g,"\\'")}', 'pre')">ก่อนล้าง</button>
      <button type="button" class="cwf-pay-tab ${active==='post'?'active':''}" onclick="openTechChecklistModal('${key.replace(/'/g,"\\'")}', 'post')">หลังล้าง</button>
    </div>
    ${cwfChecklistSectionHtml(key, active)}`;
  cwfOpenModal('✅ เช็คลิสตรวจสภาพ', html, `<button class="secondary" type="button" onclick="cwfCloseModal()">ปิด</button>`);
}
window.openTechChecklistModal = openTechChecklistModal;
function cwfValidateChecklist(jobId){
  const data = cwfGetChecklist(jobId);
  for (const [section, items] of [['pre', CWF_PRE_CHECK_ITEMS], ['post', CWF_POST_CHECK_ITEMS]]) {
    for (let i=0;i<items.length;i++) {
      const row = data?.[section]?.[i] || {};
      if (!row.checked && !row.issue) return section === 'pre' ? 'กรุณาตรวจสภาพก่อนล้างให้ครบ' : 'กรุณาตรวจหลังล้างให้ครบ';
      if (row.issue && !String(row.note || '').trim()) return section === 'pre' ? 'กรุณาระบุหมายเหตุสำหรับรายการที่มีปัญหาอยู่ก่อน' : 'กรุณาระบุหมายเหตุสำหรับปัญหาใหม่หลังล้าง';
    }
  }
  return '';
}

function cwfGetPayment(jobId){ return cwfReadJsonLS(cwfCloseJsonKey(jobId,'payment'), { method:'', cash_amount:'', cash_confirmed:false, slip_uploaded:false, note:'' }) || {}; }
function cwfSavePayment(jobId, data){ cwfWriteJsonLS(cwfCloseJsonKey(jobId,'payment'), data || {}); }
function cwfSetPaymentMethod(jobId, method){ const p = cwfGetPayment(jobId); p.method = method; cwfSavePayment(jobId, p); openTechPaymentModal(jobId, method); }
window.cwfSetPaymentMethod = cwfSetPaymentMethod;
function cwfUpdatePaymentField(jobId, field, value, isCheck){ const p = cwfGetPayment(jobId); p[field] = isCheck ? !!value : String(value || ''); cwfSavePayment(jobId, p); }
window.cwfUpdatePaymentField = cwfUpdatePaymentField;
async function cwfUploadPaymentSlip(jobId, phase){
  openFilePicker({ multiple:false, accept:'image/*' }, async (files)=>{
    if (!files || !files.length) return;
    try {
      const p = cwfGetPayment(jobId); p.uploading = true; cwfSavePayment(jobId, p); openTechPaymentModal(jobId, p.method || (phase === 'cash_transfer_slip' ? 'cash':'qr'));
      await uploadFilesAsPhotos(jobId, phase, files);
      const p2 = cwfGetPayment(jobId); p2.slip_uploaded = true; p2.slip_phase = phase; p2.uploading = false; cwfSavePayment(jobId, p2); openTechPaymentModal(jobId, p2.method || (phase === 'cash_transfer_slip' ? 'cash':'qr'));
    } catch(e){ const p3 = cwfGetPayment(jobId); p3.uploading = false; cwfSavePayment(jobId, p3); alert(e.message || 'อัปโหลดสลิปไม่สำเร็จ'); openTechPaymentModal(jobId, p3.method); }
  });
}
window.cwfUploadPaymentSlip = cwfUploadPaymentSlip;
async function openTechPaymentModal(jobId, method){
  const key = cwfCloseKey(jobId); const pay = cwfGetPayment(key); const active = method || pay.method || 'qr';
  if (!pay.method) { pay.method = active; cwfSavePayment(key, pay); }
  const job = cwfGetCachedJob(key) || {};
  let total = Number(job.job_price || 0);
  try { const rr = await fetch(`${API_BASE}/jobs/${encodeURIComponent(String(key))}/pricing`); if (rr.ok) { const d = await rr.json().catch(()=>({})); total = Number(d.total || total || 0); } } catch {}
  const tabs = `
    <div class="cwf-pay-tabs">
      <button type="button" class="cwf-pay-tab ${active==='qr'?'active':''}" onclick="cwfSetPaymentMethod('${key.replace(/'/g,"\\'")}', 'qr')">📱 สแกนจ่ายบริษัท</button>
      <button type="button" class="cwf-pay-tab ${active==='cash'?'active':''}" onclick="cwfSetPaymentMethod('${key.replace(/'/g,"\\'")}', 'cash')">💵 เงินสดให้ช่าง</button>
      <button type="button" class="cwf-pay-tab ${active==='admin'?'active':''}" onclick="cwfSetPaymentMethod('${key.replace(/'/g,"\\'")}', 'admin')">👩‍💼 แอดมินจัดการ</button>
    </div>`;
  const qrHtml = `<div class="cwf-pay-card"><b>ลูกค้าสแกนจ่ายบริษัท</b><div class="muted">ให้ลูกค้าสแกน QR นี้เพื่อโอนเข้าบัญชีบริษัท</div><img class="cwf-qr-img" src="${CWF_COMPANY_QR_URL}" alt="CWF PromptPay QR"><div class="cwf-chip ok">ยอดโดยประมาณ ${cwfMoney(total)} บาท</div><button type="button" onclick="cwfUploadPaymentSlip('${key.replace(/'/g,"\\'")}', 'payment_slip')">📎 แนบสลิปโอนเงิน</button><div class="cwf-mini-status"><span class="cwf-chip ${pay.slip_uploaded?'ok':'warn'}">${pay.slip_uploaded?'แนบสลิปแล้ว':'ยังไม่แนบสลิป'}</span></div></div>`;
  const cashHtml = `<div class="cwf-pay-card"><b>ลูกค้าจ่ายเงินสดให้ช่าง</b><div class="muted">หลังรับเงินสด ช่างต้องโอนเข้าบริษัทและแนบสลิปก่อนปิดงาน</div><label style="display:block;margin-top:10px;font-weight:900">จำนวนเงินสดที่รับจากลูกค้า</label><input type="number" value="${String(pay.cash_amount||'').replace(/"/g,'&quot;')}" placeholder="เช่น 1200" oninput="cwfUpdatePaymentField('${key.replace(/'/g,"\\'")}', 'cash_amount', this.value)"><label style="display:flex;gap:10px;align-items:flex-start;margin-top:10px;font-weight:900"><input type="checkbox" style="width:22px;height:22px" ${pay.cash_confirmed?'checked':''} onchange="cwfUpdatePaymentField('${key.replace(/'/g,"\\'")}', 'cash_confirmed', this.checked, true)"> ฉันยืนยันว่าได้รับเงินสดจากลูกค้าตามจำนวนที่ระบุแล้ว</label><textarea style="margin-top:10px" placeholder="หมายเหตุการรับเงินสด" oninput="cwfUpdatePaymentField('${key.replace(/'/g,"\\'")}', 'note', this.value)">${String(pay.note||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')}</textarea><button type="button" onclick="cwfUploadPaymentSlip('${key.replace(/'/g,"\\'")}', 'cash_transfer_slip')">📎 แนบสลิปที่ช่างโอนเข้าบริษัท</button><div class="cwf-mini-status"><span class="cwf-chip ${pay.slip_uploaded?'ok':'warn'}">${pay.slip_uploaded?'แนบสลิปแล้ว':'ยังไม่แนบสลิป'}</span></div></div>`;
  const adminHtml = `<div class="cwf-pay-card"><b>ลูกค้าจ่ายกับแอดมิน / ให้แอดมินจัดการ</b><div class="muted" style="margin-top:6px">ใช้กรณีลูกค้าโอนให้แอดมินโดยตรง หรือแอดมินจะเป็นผู้ลงสลิปและอัปเดตสถานะชำระเงินภายหลัง</div><div class="cwf-mini-status"><span class="cwf-chip warn">ปิดงานได้โดยไม่ต้องแนบสลิป</span><span class="cwf-chip">สถานะ: รอแอดมินอัปเดต</span></div></div>`;
  const body = tabs + (active === 'cash' ? cashHtml : active === 'admin' ? adminHtml : qrHtml);
  cwfOpenModal('💳 เก็บเงินลูกค้า', body, `<button class="secondary" type="button" onclick="cwfCloseModal()">ปิด</button>`);
}
window.openTechPaymentModal = openTechPaymentModal;
async function cwfValidatePayment(jobId){
  const p = cwfGetPayment(jobId); const method = p.method || '';
  if (!method) return 'กรุณาเลือกวิธีเก็บเงินลูกค้า';
  if (p.uploading) return 'กรุณารอให้อัปโหลดสลิปให้เสร็จก่อนปิดงาน';
  if (method === 'qr' && !p.slip_uploaded) return 'กรุณาแนบสลิปโอนเงินก่อนปิดงาน';
  if (method === 'cash') {
    if (!Number(p.cash_amount || 0)) return 'กรุณาระบุจำนวนเงินสดที่รับ';
    if (!p.cash_confirmed) return 'กรุณายืนยันการรับเงินสด';
    if (!p.slip_uploaded) return 'กรุณาแนบสลิปที่ช่างโอนเข้าบริษัทก่อนปิดงาน';
  }
  return '';
}
async function cwfHasRequiredBeforeAfter(jobId){
  const { counts } = await cwfCountPhotos(jobId);
  return (counts.before || 0) > 0 && (counts.after || 0) > 0;
}
function cwfAskMissingPhotoAck(jobId){
  return new Promise((resolve)=>{
    const key = cwfCloseKey(jobId);
    const body = `<div class="cwf-pay-card"><b style="font-size:18px;color:#be123c">งานนี้ยังไม่มีรูปหลักฐาน หรือรูปยังไม่ครบตามขั้นตอน</b><p>รูปก่อนทำและหลังทำเป็นหลักฐานสำคัญสำหรับยืนยันสภาพเครื่องก่อนเริ่มงาน ผลงานหลังล้าง และใช้ตรวจสอบกรณีลูกค้าแจ้งปัญหาภายหลัง</p><p>หากช่างปิดงานโดยไม่มีรูปหลักฐาน และภายหลังมีข้อร้องเรียนจากลูกค้า บริษัทอาจพิจารณาให้ช่างรับผิดชอบตามข้อเท็จจริงและระเบียบบริษัท</p><label style="display:flex;gap:10px;align-items:flex-start;font-weight:900"><input id="cwfPhotoAckCheck" type="checkbox" style="width:24px;height:24px"> ข้าพเจ้าเข้าใจและยอมรับว่า หากไม่มีรูปหลักฐานหน้างาน และเกิดข้อร้องเรียนที่ไม่สามารถตรวจสอบย้อนหลังได้ ข้าพเจ้าอาจต้องรับผิดชอบตามข้อเท็จจริงและระเบียบบริษัท</label></div>`;
    const footer = `<button class="secondary" type="button" onclick="cwfCloseModal(); window.__cwfPhotoAckResolve && window.__cwfPhotoAckResolve(false)">กลับไปแนบรูป</button><button type="button" onclick="if(!document.getElementById('cwfPhotoAckCheck')?.checked){alert('กรุณาติ๊กยอมรับเงื่อนไขก่อน');return;} localStorage.setItem('cwf_close_photo_ack_${key}', String(Date.now())); cwfCloseModal(); window.__cwfPhotoAckResolve && window.__cwfPhotoAckResolve(true)">ยืนยันปิดงานโดยไม่มีรูป</button>`;
    window.__cwfPhotoAckResolve = resolve;
    cwfOpenModal('ยืนยันปิดงานโดยไม่มีรูปหลักฐาน', body, footer);
  });
}
async function cwfValidateCloseRequirements(jobId, targetStatus){
  if (targetStatus !== 'เสร็จแล้ว') return true;
  if (window.__CWF_UPLOAD_BUSY_COUNT > 0) { alert('กรุณารอให้อัปโหลดรูปให้เสร็จก่อนปิดงาน'); return false; }
  const checklistMsg = cwfValidateChecklist(jobId); if (checklistMsg) { alert(checklistMsg); openTechChecklistModal(jobId, checklistMsg.includes('หลัง') ? 'post':'pre'); return false; }
  const payMsg = await cwfValidatePayment(jobId); if (payMsg) { alert(payMsg); openTechPaymentModal(jobId); return false; }
  const hasPhoto = await cwfHasRequiredBeforeAfter(jobId);
  if (!hasPhoto) return await cwfAskMissingPhotoAck(jobId);
  return true;
}

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

  const badge = technicianJobStatusBadge(job);

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
  const revisitFlow = isRevisitJob(job);
  const revisitReason = String(job.return_reason || "").trim();
  const canEdit = !historyMode && (status === "รอดำเนินการ" || status === "กำลังทำ" || status === "งานแก้ไข");
  const paymentSettled = revisitFlow ? false : paid;

  // ✅ ปุ่มอัปเดตสถานะ (ปุ่มเดียว) + e-slip (ขั้นตอนสุดท้าย)
  // - งานประวัติ: ปุ่มนี้จะกลายเป็น "🧾 e-slip" อย่างเดียว (ดูได้ตลอดถ้าจ่ายแล้ว)
  // - งานแก้ไข: อย่าให้สถานะ paid เดิมจากงานรอบแรก มาบัง flow การกลับไปแก้
  const workflowDisabled = historyMode
    ? !paid
    : (revisitFlow && isWorking
        ? true
        : (paymentSettled
            ? false
            : ((!travelStarted && !called) || status === "เสร็จแล้ว" || status === "ยกเลิก")));

  // ⚠️ ใช้ keyBase ใน onclick เพื่อรองรับงานจากระบบเดิมที่อาจส่ง id มาเป็น string
  // (ฝั่ง API รองรับทั้ง job_id และ booking_code ผ่าน encodeURIComponent)
  const workflowOnclick = historyMode
    ? `openESlip('${jobKeyJs}')`
    : `workflowNext('${jobKeyJs}')`;

  const workflowLabel = historyMode
    ? "🧾 e-slip"
    : (revisitFlow && isWorking
        ? "📝 ปิดงานแก้ไขด้านล่าง"
        : (paymentSettled
            ? "🧾 e-slip"
            : (!travelStarted
                ? "🚗 เริ่มเดินทาง"
                : (!checkedIn
                    ? "📍 เช็คอิน"
                    : (!isWorking ? "▶️ เริ่มทำงาน" : "💳 เก็บเงินลูกค้า")))));


  // ✅ ปุ่มสถานะจะแสดงเป็น 4 ปุ่มเรียงลำดับ (เริ่มเดินทาง → เช็คอิน → เริ่มทำงาน → เก็บเงินลูกค้า)

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
          : (!paid ? "ทำงานเสร็จให้กด “เก็บเงินลูกค้า” เพื่อเลือกวิธีรับเงินและแนบสลิป" : "✅ เก็บเงินแล้ว"))));

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
    ${renderTechnicianMoneySummary(job, historyMode ? "history" : "current")}

    <p style="margin-top:8px;"><b>ลูกค้า:</b> ${escape(job.customer_name || "-")}</p>
    <p><b>โทร:</b> ${escape(job.customer_phone || "-")}</p>
    <p><b>ประเภท:</b> ${escape(job.job_type || "-")}</p>
    <p><b>นัด:</b> ${appt}</p>
    <p><b>ที่อยู่:</b> ${addr}</p>
    ${revisitFlow ? `
      <div class="pill" style="margin-top:10px;background:#fff7ed;border-color:rgba(234,88,12,0.22);color:#9a3412;display:block;border-radius:16px;">
        <div><b>งานแก้ไข/กลับไปตรวจซ้ำ</b></div>
        <div style="margin-top:4px;">${escape(revisitReason || "แอดมินส่งงานเดิมกลับมาให้ช่างเข้าดูอาการเพิ่มเติม")}</div>
        <div style="margin-top:6px;font-size:12px;">
          ก่อนกด “เสร็จสิ้น” ต้องทำ 3 อย่างให้ครบ: เลือก <b>revisit_result</b>, กรอก <b>revisit_note</b>, และแนบรูปหลักฐาน <b>revisit evidence</b>
        </div>
      </div>
    ` : ``}

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
      <summary>💳 รายละเอียดยอดเก็บลูกค้า</summary>
      <div class="cwf-details-body">
        <div id="pricing-${jobId}">กำลังโหลด...</div>
      </div>
    </details>

    ${showWorkTools ? `
      <details class="cwf-details" style="margin-top:10px;" ${isWorking ? "open" : ""}>
        <summary>🛠️ ปิดงาน / หลักฐาน</summary>
        <div class="cwf-details-body">
          <div class="cwf-close-hub">
            <button class="cwf-close-action" type="button" onclick="openTechPhotoModal('${jobKeyJs}')" ${!canEdit ? "disabled" : ""} aria-label="ลงรูปหลักฐาน">
              <span class="cwf-action-left"><span class="ico">📷</span><span><b>ลงรูปหลักฐาน</b><small>อัปโหลดรูปก่อนทำ หลังทำ และรูปตรวจเช็ค</small></span></span><span class="cwf-action-arrow">›</span>
            </button>
            <button class="cwf-close-action" type="button" onclick="openTechChecklistModal('${jobKeyJs}', 'pre')" ${!canEdit ? "disabled" : ""} aria-label="เช็คลิสตรวจสภาพ">
              <span class="cwf-action-left"><span class="ico">✅</span><span><b>เช็คลิสตรวจสภาพ</b><small>ติ๊กตรวจก่อนล้างและหลังล้างแบบสั้น</small></span></span><span class="cwf-action-arrow">›</span>
            </button>
          </div>

          <div id="photo-status-${jobId}" style="display:none"></div>

          <div class="cwf-note-box">
            <b>🛡️ ประกันงาน</b>
            <div class="muted" style="margin-top:4px;font-size:12px;">ต้องเลือกก่อนกด “เสร็จสิ้น”</div>
            ${(() => {
              const jt = getJobTypeText(job);
              let kind = detectWarrantyKind(jt);
              let label = '';
              let kindSelect = '';
              let monthSelect = '';
              if (kind === 'clean') label = 'ล้าง: ประกัน 30 วัน';
              else if (kind === 'install') label = 'ติดตั้ง: ประกัน 3 ปี';
              else if (kind === 'repair') label = 'ซ่อม: เลือก 3/6/12 เดือน';
              else {
                label = 'โปรดเลือกประเภทประกันก่อนปิดงาน';
                kindSelect = `<select id="warranty-kind-${jobId}" style="margin-top:6px;width:100%;" onchange="toggleWarrantyMonths(${jobId})"><option value="">เลือกประเภทประกัน</option><option value="clean">ล้าง (30 วัน)</option><option value="repair">ซ่อม (เลือกเดือน)</option><option value="install">ติดตั้ง (3 ปี)</option></select>`;
                monthSelect = `<select id="warranty-months-${jobId}" style="margin-top:6px;width:100%;display:none;"><option value="">เลือกเดือนประกัน</option><option value="3">3 เดือน</option><option value="6">6 เดือน</option><option value="12">12 เดือน</option></select>`;
              }
              if (kind === 'repair') monthSelect = `<select id="warranty-months-${jobId}" style="margin-top:6px;width:100%;"><option value="">เลือกเดือนประกัน</option><option value="3">3 เดือน</option><option value="6">6 เดือน</option><option value="12">12 เดือน</option></select>`;
              const kindHidden = (kind && !kindSelect) ? `<input type="hidden" id="warranty-kind-${jobId}" value="${kind}">` : '';
              return `${kindHidden}<div class="pill" style="margin-top:6px;background:#eff6ff;border-color:rgba(37,99,235,0.25);color:#0f172a;">${label}</div>${kindSelect}${monthSelect}`;
            })()}
          </div>

          <div class="cwf-note-box">
            <b>📝 หมายเหตุช่าง</b>
            <textarea id="note-${keyBase}" rows="3" style="margin-top:6px;" placeholder="เจอปัญหาอะไร ใส่ไว้ได้" ${!canEdit ? "disabled" : ""} oninput="noteDraftChanged('${jobKeyJs}')">${escape(getNoteDraft(keyBase) || job.technician_note || "")}</textarea>
            ${revisitFlow ? `
              <div style="margin-top:10px;">
                <b>🔁 ผลงานแก้ไข</b>
                <select id="revisit-result-${keyBase}" style="margin-top:6px;width:100%;" ${!canEdit ? "disabled" : ""}>
                  <option value="">เลือกผลการกลับไปแก้ (จำเป็น)</option>
                  <option value="successful">successful - แก้แล้วใช้งานได้</option>
                  <option value="unsuccessful">unsuccessful - ยังไม่จบ/ยังมีอาการ</option>
                </select>
                <textarea id="revisit-note-${keyBase}" rows="3" style="margin-top:6px;" placeholder="revisit_note (จำเป็น): สรุปผลการแก้ / เหตุผล / อาการที่ยังพบ" ${!canEdit ? "disabled" : ""}>${escape(job.technician_note || "")}</textarea>
              </div>
            ` : ``}
            ${historyMode ? "" : ((checkedIn || isWorking) ? `
              <div class="row" style="margin-top:8px;gap:10px;flex-wrap:wrap;">
                <button class="secondary" type="button" style="width:auto;" onclick="saveNote('${jobKeyJs}')" ${!canEdit ? "disabled" : ""}>💾 บันทึกหมายเหตุ</button>
              </div>
              ${isWorking ? `<div class="cwf-final-row"><button type="button" onclick="requestFinalize('${jobKeyJs}', 'เสร็จแล้ว')">✅ เสร็จสิ้น</button><button class="danger" type="button" onclick="requestFinalize('${jobKeyJs}', 'ยกเลิก')">⛔ ยกเลิก</button></div>` : ``}
            ` : ``)}
            <div id="note-status-${jobId}" style="margin-top:6px;"></div>
          </div>
        </div>
      </details>
    ` : `
      <div class="muted" style="margin-top:10px;">* หลังจาก “เช็คอิน” แล้ว จะเปิดปุ่ม ลงรูป / เช็คลิส / ปิดงาน *</div>
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
    ${renderTechnicianMoneySummary(job, 'history')}
    <div class="muted" style="margin-top:8px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
      <span><b>ลูกค้า:</b> ${cust}</span>
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
// - ลำดับ: เริ่มเดินทาง -> เช็คอิน -> เริ่มทำงาน -> เก็บเงินลูกค้า -> e-slip
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
    const revisitFlow = isRevisitJob(job);
    const paymentSettled = revisitFlow ? false : paid;

    // งานปิดแล้ว: ให้ไปดู e-slip (ถ้ามี) และจบ
    if (isDoneStatusValue(status) || isCancelStatusValue(status)) {
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

    if (revisitFlow && isWorking) {
      alert("งานแก้ไข: ให้ใช้ส่วน รูป / หมายเหตุ / ปิดงาน ด้านล่าง เพื่อบันทึกผลและกด เสร็จสิ้น");
      return;
    }

    if (!paymentSettled) {
      return openTechPaymentModal(keyBase);
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
// 💳 COLLECT CUSTOMER PAYMENT (new flow only)
// - เอา popup/QR จ่ายเงินเก่าออกแล้ว
// - ทุกจุดที่เคยเรียก payJob จะเปิด Modal ใหม่ “เก็บเงินลูกค้า” เท่านั้น
// =======================================
async function payJob(jobId) {
  return openTechPaymentModal(String(jobId || ''));
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
        const job = getJobFromCache(jobId);
        const revisitFlow = isRevisitJob(job);
        if (revisitFlow) {
          const revisitResult = getRevisitResultValue(jobId);
          const revisitNote = getRevisitNoteValue(jobId);
          if (!['successful', 'unsuccessful'].includes(revisitResult)) {
            alert("งานแก้ไขยังปิดงานไม่ได้: ต้องเลือก revisit_result ก่อนกด “เสร็จสิ้น”");
            return;
          }
          if (!revisitNote) {
            alert("งานแก้ไขยังปิดงานไม่ได้: ต้องกรอก revisit_note เพื่อสรุปผลการกลับไปแก้");
            return;
          }
          const hasEvidence = await hasRevisitEvidence(jobId);
          if (!hasEvidence) {
            alert("งานแก้ไขยังปิดงานไม่ได้: ต้องมีรูป revisit evidence อย่างน้อย 1 รูปในหมวด ก่อนแก้ / หลังแก้ / จุดปัญหา");
            return;
          }
        }

        const closeOk = await cwfValidateCloseRequirements(jobId, targetStatus);
        if (!closeOk) return;

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
    const job = getJobFromCache(jobId);
    const revisitFlow = isRevisitJob(job);
    const revisit_result = revisitFlow ? getRevisitResultValue(jobId) : "";
    const revisit_note = revisitFlow ? getRevisitNoteValue(jobId) : "";

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
      body: JSON.stringify({ note: revisit_note || note }),
    }).catch(() => {});

    const res = await fetch(`${API_BASE}/jobs/${encodeURIComponent(String(jobId))}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: targetStatus,
        signature_data: signatureDataUrl,
        note,
        revisit_result,
        revisit_note,
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
  const key = String(jobId || '').trim();
  if (!key) return alert("ไม่พบรหัสงาน");
  if (window.__CWF_CHECKIN_BUSY && window.__CWF_CHECKIN_BUSY[key]) return;
  window.__CWF_CHECKIN_BUSY = window.__CWF_CHECKIN_BUSY || {};
  window.__CWF_CHECKIN_BUSY[key] = true;

  const btn = document.querySelector(`[data-role="workflow"][data-jobkey="${CSS.escape(key)}"]`);
  const oldText = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '📍 กำลังเช็คอิน...'; }
  const hint = document.getElementById(`travel-hint-${key}`) || document.getElementById(`checkin-status-${key}`);
  if (hint) hint.innerHTML = '📍 กำลังขอพิกัด GPS...';

  const finish = () => {
    window.__CWF_CHECKIN_BUSY[key] = false;
    if (btn) { btn.disabled = false; btn.innerHTML = oldText || '📍 เช็คอิน'; }
  };

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      if (hint) hint.innerHTML = '📍 ได้พิกัดแล้ว กำลังบันทึกเช็คอิน...';
      fetch(`${API_BASE}/jobs/${encodeURIComponent(String(key))}/checkin`, {
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
          if (hint) hint.innerHTML = "✅ เช็คอินสำเร็จ";
          setTimeout(()=>loadJobs(), 150);
        })
        .catch((e) => alert(`❌ ${e.message}`))
        .finally(finish);
    },
    (err) => { finish(); alert(err?.message ? `ขอสิทธิ์ GPS ไม่สำเร็จ: ${err.message}` : "ขอสิทธิ์ GPS ไม่สำเร็จ/ถูกปฏิเสธ"); },
    { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 }
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
// 💲 PRICING
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
    const job = getJobFromCache(jobId);
    const revisitFlow = isRevisitJob(job);
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

      ${revisitFlow ? `
        <div class="muted" style="margin-top:6px;">
          งานแก้ไข → ค้างในเครื่อง: ก่อนแก้ <b>${byPhase("revisit_before")}</b>,
          หลังแก้ <b>${byPhase("revisit_after")}</b>,
          จุดปัญหา <b>${byPhase("revisit_defect")}</b>
        </div>
        <div class="muted" style="margin-top:6px;">
          งานแก้ไข → อัปโหลดแล้ว: ก่อนแก้ <b>${upByPhase("revisit_before")}</b>,
          หลังแก้ <b>${upByPhase("revisit_after")}</b>,
          จุดปัญหา <b>${upByPhase("revisit_defect")}</b>
        </div>
      ` : ``}

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
  window.__CWF_UPLOAD_BUSY_COUNT = (window.__CWF_UPLOAD_BUSY_COUNT || 0) + 1;
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
  finally { window.__CWF_UPLOAD_BUSY_COUNT = Math.max(0, (window.__CWF_UPLOAD_BUSY_COUNT || 1) - 1); }
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
      window.__CWF_UPLOAD_BUSY_COUNT = (window.__CWF_UPLOAD_BUSY_COUNT || 0) + 1;

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
      window.__CWF_UPLOAD_BUSY_COUNT = Math.max(0, (window.__CWF_UPLOAD_BUSY_COUNT || 1) - 1);
      refreshPhotoStatus(jobId);
    };

    input.click();
  } catch (e) {
    console.error(e);
    alert(`❌ ${e.message}`);
  }
}


// ✅ Tax profile + withholding certificates for technicians (ทวิ50)
function getCurrentTechUsernameForTax(){
  const fromStore = String(
    localStorage.getItem('username') ||
    localStorage.getItem('technician_username') ||
    localStorage.getItem('cwf_username') ||
    window.currentUsername ||
    window.CWF_CURRENT_USERNAME ||
    ''
  ).trim();
  if (fromStore) return fromStore;
  try {
    const meText = document.getElementById('me')?.textContent || '';
    const m = meText.match(/(?:ผู้ใช้|user)\s*:\s*([^\s]+)/i);
    if (m && m[1] && m[1] !== '-') return m[1].trim();
  } catch (_) {}
  return '';
}
function showTaxDocModal(modal){
  if (!modal) return;
  try { (window.closeTechSettingsModal || function(){})(); } catch (_) {}
  // Move the modal out of the settings drawer. If it stays nested inside the
  // drawer, the parent backdrop/opacity styles make the WHT form look transparent.
  try { if (modal.parentElement !== document.body) document.body.appendChild(modal); } catch (_) {}
  modal.style.setProperty('display','flex','important');
  modal.style.setProperty('position','fixed','important');
  modal.style.setProperty('inset','0','important');
  modal.style.setProperty('z-index','2147483000','important');
  modal.style.setProperty('background','rgba(2,6,23,.82)','important');
  modal.style.setProperty('align-items','flex-start','important');
  modal.style.setProperty('justify-content','center','important');
  modal.style.setProperty('overflow','auto','important');
  modal.style.setProperty('padding','18px 12px 90px','important');
  modal.setAttribute('aria-hidden','false');
  const panel = modal.querySelector('.taxDocPanel');
  if (panel) {
    panel.style.setProperty('background','#ffffff','important');
    panel.style.setProperty('color','#08245b','important');
    panel.style.setProperty('opacity','1','important');
    panel.style.setProperty('width','min(640px,100%)','important');
    panel.style.setProperty('border-radius','24px','important');
    panel.style.setProperty('box-shadow','0 28px 80px rgba(0,0,0,.36)','important');
    panel.style.setProperty('border','1px solid rgba(226,232,240,.95)','important');
  }
  modal.querySelectorAll('input,textarea,select').forEach(el => {
    el.style.setProperty('background','#fff','important');
    el.style.setProperty('color','#111827','important');
    el.style.setProperty('-webkit-text-fill-color','#111827','important');
    el.style.setProperty('border','1px solid #cbd5e1','important');
  });
  document.body.classList.add('tax-doc-modal-open');
  document.body.style.overflow='hidden';
}
function hideTaxDocModal(modal){
  if (!modal) return;
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden','true');
  document.body.classList.remove('tax-doc-modal-open');
  document.body.style.overflow='';
}
async function openTechTaxProfileModal(){
  try { (window.closeTechSettingsModal || function(){})(); } catch (_) {}
  const modal = document.getElementById('techTaxProfileModal');
  const form = document.getElementById('techTaxProfileForm');
  const msg = document.getElementById('techTaxProfileMsg');
  if (!modal || !form) return;
  showTaxDocModal(modal); if (msg) msg.textContent='กำลังโหลดข้อมูล...';
  try{
    const u = getCurrentTechUsernameForTax();
    if(!u) throw new Error('ไม่พบรหัสช่าง กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่');
    const r = await fetch(`/technicians/${encodeURIComponent(u)}/tax-profile`, { credentials:'include' });
    const data = await r.json().catch(()=>({}));
    const p = data.profile || {};
    form.full_name.value = p.full_name || '';
    form.tax_id.value = p.tax_id || '';
    form.tax_address.value = p.tax_address || '';
    form.tax_branch.value = p.tax_branch || '';
    form.wht_income_type.value = p.wht_income_type || 'ค่าบริการ/ค่าจ้างทำของ ตามมาตรา 40(8)';
    form.wht_default_rate.value = p.wht_default_rate || 3;
    if (msg) msg.textContent = p.is_complete ? 'ข้อมูลครบแล้ว หากแก้ไขใหม่จะส่งให้แอดมินอนุมัติอีกครั้ง' : 'กรอกข้อมูลให้ครบเพื่อส่งให้แอดมินอนุมัติ';
  }catch(e){ if(msg) msg.textContent='⚠️ โหลดข้อมูลเดิมไม่สำเร็จ: '+(e.message||'')+' แต่สามารถกรอกส่งใหม่ได้'; }
}
function closeTechTaxProfileModal(){ hideTaxDocModal(document.getElementById('techTaxProfileModal')); }
async function submitTechTaxProfileRequest(ev){
  ev?.preventDefault?.();
  const form = document.getElementById('techTaxProfileForm'); const msg=document.getElementById('techTaxProfileMsg'); if(!form) return;
  const u = getCurrentTechUsernameForTax();
  if(!u){ if(msg) msg.textContent='❌ ไม่พบรหัสช่าง กรุณาเข้าสู่ระบบใหม่'; return; }
  const body = Object.fromEntries(new FormData(form).entries());
  if(!String(body.full_name||'').trim() || !String(body.tax_id||'').trim() || !String(body.tax_address||'').trim()){
    if(msg) msg.textContent='❌ กรุณากรอกชื่อ เลขภาษี/บัตรประชาชน และที่อยู่ภาษีให้ครบ';
    return;
  }
  try{
    if(msg) msg.textContent='กำลังส่งคำขอ...';
    const res = await fetch(`/technicians/${encodeURIComponent(u)}/tax-profile/request`, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body:JSON.stringify(body) });
    const data = await res.json().catch(()=>({}));
    if(!res.ok || data.ok===false) throw new Error(data.error || data.message || 'ส่งคำขอไม่สำเร็จ');
    if(msg) msg.textContent='✅ ส่งคำขอแล้ว กรุณารอแอดมินอนุมัติ';
    setTimeout(() => { try { closeTechTaxProfileModal(); } catch (_) {} }, 900);
  }catch(e){ if(msg) msg.textContent='❌ '+(e.message || 'ส่งคำขอไม่สำเร็จ'); }
}
async function openTechWhtDocumentsModal(){
  try { (window.closeTechSettingsModal || function(){})(); } catch (_) {}
  const m=document.getElementById('techWhtDocsModal'); const y=document.getElementById('techWhtYear'); if(!m) return;
  if(y && !y.value) y.value = new Date().getFullYear();
  showTaxDocModal(m);
  await loadTechWhtDocuments();
}
function closeTechWhtDocumentsModal(){ hideTaxDocModal(document.getElementById('techWhtDocsModal')); }
async function loadTechWhtDocuments(){
  const box=document.getElementById('techWhtDocsList'); if(!box) return;
  const u=getCurrentTechUsernameForTax(); if(!u){ box.innerHTML='<div class="taxDocRow" style="color:#b91c1c;font-weight:900">ไม่พบรหัสช่าง กรุณาเข้าสู่ระบบใหม่</div>'; return; } const y=document.getElementById('techWhtYear')?.value || new Date().getFullYear();
  box.innerHTML='<div class="muted">กำลังโหลดเอกสาร...</div>';
  try{
    const res=await fetch(`/technicians/${encodeURIComponent(u)}/withholding-certs?year=${encodeURIComponent(y)}`, {credentials:'include'});
    const data=await res.json().catch(()=>({})); if(!res.ok || data.ok===false) throw new Error(data.error || 'โหลดไม่สำเร็จ');
    const rows=data.rows||[];
    const yearlyPrint = `/technicians/${encodeURIComponent(u)}/withholding-certs/yearly/print?year=${encodeURIComponent(y)}`;
    const yearlyCsv = `/technicians/${encodeURIComponent(u)}/withholding-certs/yearly.csv?year=${encodeURIComponent(y)}`;
    const yearlyActions = `<div class="taxDocRow"><b>สรุปทวิ50ทั้งปี ${y}</b><div class="muted">ใช้รวมเอกสารรายเดือนสำหรับตรวจและยื่นภาษีประจำปี</div><div class="taxDocActions"><a class="primary" href="${yearlyPrint}" target="_blank" rel="noopener">พิมพ์สรุปรายปี</a><a class="secondary" href="${yearlyCsv}" target="_blank" rel="noopener">ดาวน์โหลด CSV รายปี</a></div></div>`;
    box.innerHTML = yearlyActions + (rows.length ? rows.map(r=>`<div class="taxDocRow"><b>${r.document_no||'ทวิ50'}</b><div class="muted">เดือน ${((r.payload_json||{}).wht_month_label)||'-'} • เงินได้ ${Number(r.total_amount||0).toLocaleString('th-TH')} บาท • หักไว้ ${Number(r.withholding_amount||0).toLocaleString('th-TH')} บาท</div><div class="taxDocActions"><a class="primary" href="${r.print_url}" target="_blank" rel="noopener">พิมพ์ / Save PDF รายเดือน</a><a class="secondary" href="${r.print_url}" target="_blank" rel="noopener">ดาวน์โหลดรายเดือน</a></div></div>`).join('') : '<div class="taxDocRow muted">ยังไม่มีเอกสารทวิ50ในปีนี้ หลังบริษัทออกเอกสารแล้วจะขึ้นที่นี่</div>');
  }catch(e){ box.innerHTML=`<div class="taxDocRow" style="color:#b91c1c;font-weight:900">โหลดเอกสารไม่สำเร็จ: ${e.message||''}</div>`; }
}

window.openTechTaxProfileModal = openTechTaxProfileModal;
window.closeTechTaxProfileModal = closeTechTaxProfileModal;
window.submitTechTaxProfileRequest = submitTechTaxProfileRequest;
window.openTechWhtDocumentsModal = openTechWhtDocumentsModal;
window.closeTechWhtDocumentsModal = closeTechWhtDocumentsModal;
window.loadTechWhtDocuments = loadTechWhtDocuments;
window.addEventListener('DOMContentLoaded', () => { document.getElementById('techTaxProfileForm')?.addEventListener('submit', submitTechTaxProfileRequest); });


// =======================================
// 🧹 CLOSE PANEL VISUAL CLEANUP PATCH (safe no-freeze version)
// - No MutationObserver on the whole document, because it can loop/freeze the PWA.
// - Apply styles + a few delayed cleanups only after job cards render.
// =======================================
(function cwfClosePanelVisualCleanupPatch(){
  const STYLE_ID = 'cwf-close-panel-visual-cleanup-v4-safe';
  function ensureStyle(){
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
      details.cwf-details summary{color:#0f172a!important}
      .cwf-close-hub{display:grid!important;grid-template-columns:1fr!important;gap:18px!important;margin:14px 0 20px!important}
      .cwf-close-action{appearance:none!important;-webkit-appearance:none!important;width:100%!important;min-height:84px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:14px!important;text-align:left!important;border:1px solid rgba(148,163,184,.32)!important;background:#fff!important;background-image:none!important;color:#0f172a!important;border-radius:24px!important;padding:17px 16px!important;box-shadow:0 10px 26px rgba(15,23,42,.08)!important;line-height:1.28!important;text-shadow:none!important}
      .cwf-close-action .cwf-action-left{display:flex!important;align-items:center!important;gap:14px!important;min-width:0!important}
      .cwf-close-action .ico{width:48px!important;height:48px!important;min-width:48px!important;border-radius:17px!important;display:flex!important;align-items:center!important;justify-content:center!important;background:#eef5ff!important;color:#1558d6!important;font-size:24px!important;border:1px solid rgba(37,99,235,.12)!important;box-shadow:none!important;text-shadow:none!important}
      .cwf-close-action b{display:block!important;font-size:18px!important;color:#0f172a!important;font-weight:1000!important;margin:0!important;text-shadow:none!important;opacity:1!important}
      .cwf-close-action small{display:block!important;color:#64748b!important;line-height:1.42!important;margin-top:4px!important;font-size:13px!important;font-weight:750!important;text-shadow:none!important;opacity:1!important}
      .cwf-action-arrow{font-size:24px!important;color:#94a3b8!important;font-weight:1000!important}
    `;
    document.head.appendChild(st);
  }
  function cleanup(){
    ensureStyle();
    document.querySelectorAll('details.cwf-details').forEach((details)=>{
      const summary = details.querySelector('summary');
      if (!summary) return;
      const summaryText = (summary.textContent || '').replace(/\s+/g,' ').trim();
      if (!summaryText.includes('ปิดงาน') || !summaryText.includes('หลักฐาน')) return;
      if (summaryText !== '🛠️ ปิดงาน / หลักฐาน') summary.textContent = '🛠️ ปิดงาน / หลักฐาน';
      details.querySelectorAll('button.cwf-close-action').forEach((btn)=>{
        const txt = (btn.textContent || '').replace(/\s+/g,' ').trim();
        if (txt.includes('เก็บเงินลูกค้า') || txt.includes('จ่ายเงิน')) btn.remove();
      });
    });
  }
  function runSafeCleanups(){
    cleanup();
    [250, 800, 1600, 3000].forEach((ms)=>setTimeout(cleanup, ms));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', runSafeCleanups, { once:true });
  else runSafeCleanups();
  window.cwfClosePanelVisualCleanup = cleanup;
})();
