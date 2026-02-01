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
const profileHintEl = document.getElementById("profile-hint");

// ✅ แถบควบคุมช่าง (dropdown)
const acceptStatusSelect = document.getElementById("acceptStatusSelect");
const zoneSelect = document.getElementById("zoneSelect");


// =======================================
// 🔐 AUTH CHECK
// =======================================
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

    // Grade / stats
    const done = Number(data.done_count ?? 0);
    const grade = data.grade || calcGradeFromDone(done);
    if (profileGradeEl) profileGradeEl.textContent = `เกรด: ${grade}`;
    if (ratingEl) ratingEl.textContent = (data.rating ?? 0).toString();
    if (doneCountEl) doneCountEl.textContent = done.toString();

    // Photo (serve from /uploads)
    const photo = data.photo_path || "/logo.png";
    if (profilePhotoEl) profilePhotoEl.src = photo;

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
    if (profileGradeEl) profileGradeEl.textContent = "เกรด: -";
    if (ratingEl) ratingEl.textContent = "0.0";
    if (doneCountEl) doneCountEl.textContent = "0";
    if (profilePhotoEl) profilePhotoEl.src = "/logo.png";
  }
}

function renderProfile(doneCount = 0) {
  // ✅ คงชื่อฟังก์ชันเดิมไว้เพื่อไม่ให้ส่วนอื่นพัง
  loadProfile();
}

// =======================================
// 🗃️ IndexedDB (เก็บรูปไว้ในเครื่องก่อนอัปโหลด)
// =======================================
const IDB_NAME = "cwf_photos_db";
const IDB_STORE = "pending_photos";

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 2);

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

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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
loadOffers();
loadJobs();
setInterval(() => loadOffers(), 15000);

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

function renderJobs(jobs) {
  // ✅ cache ไว้ใช้กับ popup จ่ายเงิน / เปิด e-slip
  window.__JOB_CACHE__ = Array.isArray(jobs) ? jobs : [];

  if (activeJobsEl) activeJobsEl.innerHTML = "";
  if (historyJobsEl) historyJobsEl.innerHTML = "";

  if (!Array.isArray(jobs) || jobs.length === 0) {
    if (activeJobsEl) activeJobsEl.innerHTML = "<p>✅ ไม่มีงานค้างตอนนี้</p>";
    if (historyJobsEl) historyJobsEl.innerHTML = "<p>ยังไม่มีประวัติงาน</p>";
    if (doneCountEl) doneCountEl.textContent = "0";
    renderProfile(0);
    return;
  }

  const active = jobs.filter((j) => {
    const st = normStatus(j.job_status);
    return st === "รอดำเนินการ" || st === "กำลังทำ";
  });

  const history = jobs.filter((j) => {
    const st = normStatus(j.job_status);
    return st === "เสร็จแล้ว" || st === "ยกเลิก";
  });

  if (activeJobsEl) {
    if (!active.length) activeJobsEl.innerHTML = "<p>✅ ไม่มีงานค้างตอนนี้</p>";
    active.forEach((job) => activeJobsEl.appendChild(buildJobCard(job, false)));
  }

  if (historyJobsEl) {
    if (!history.length) historyJobsEl.innerHTML = "<p>ยังไม่มีงานที่ปิดแล้ว</p>";
    history.forEach((job) => historyJobsEl.appendChild(buildJobCard(job, true)));
  }

  // 🔔 เตือนก่อนถึงเวลานัด 30 นาที (เฉพาะงานที่รับแล้ว)
  try {
    check30mReminder(active);
  } catch {
    // ignore
  }

  const done = history.filter((j) => normStatus(j.job_status) === "เสร็จแล้ว").length;
  if (doneCountEl) doneCountEl.textContent = String(done);
  renderProfile(done);
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
function openMaps(lat, lng, address, mapsUrl) {
  try {
    let url = "";
    const direct = String(mapsUrl || "").trim();
    if (direct) {
      window.open(direct, "_blank");
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
    window.open(url, "_blank");
  } catch (e) {
    alert("เปิดแผนที่ไม่สำเร็จ");
  }
}
window.openMaps = openMaps;

// =======================================
// 📞 CALL CUSTOMER (บังคับให้กดโทรก่อนเริ่มเดินทาง)
// - เมื่อกดโทร จะบันทึก flag ในเครื่อง (localStorage) เพื่อปลดล็อกปุ่ม "เริ่มเดินทาง"
// =======================================
function callCustomer(jobId, phone) {
  const id = Number(jobId);
  const p = String(phone || "").trim();
  if (!id) return alert("job_id ไม่ถูกต้อง");
  if (!p) return alert("ไม่มีเบอร์โทรลูกค้า");

  try {
    localStorage.setItem(`cwf_called_${id}`, String(Date.now()));
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

  const status = normStatus(job.job_status) || "รอดำเนินการ";

  const badge =
    status === "รอดำเนินการ"
      ? `<span class="badge wait">⏳ รอดำเนินการ</span>`
      : status === "กำลังทำ"
      ? `<span class="badge run">🛠️ กำลังทำ</span>`
      : status === "เสร็จแล้ว"
      ? `<span class="badge ok">✅ เสร็จแล้ว</span>`
      : `<span class="badge bad">⛔ ยกเลิก</span>`;

  const jobId = Number(job.job_id);
  const travelKey = `cwf_travel_${jobId}`;
  const travelStarted = !!localStorage.getItem(travelKey) || !!job.travel_started_at;
  const calledKey = `cwf_called_${jobId}`;
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

  const workflowOnclick = historyMode ? `openESlip(${jobId})` : `workflowNext(${jobId})`;

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

    
      <div style="margin-top:10px;">
        <!-- ✅ แถวปุ่มโทร: กดได้ตลอด -->
        <div class="row" style="gap:10px;flex-wrap:wrap;">
          <button class="secondary" type="button" style="width:auto;" ${telPhone ? "" : "disabled"} onclick="callCustomer(${jobId}, '${telPhone}')">📞 โทรลูกค้า</button>
        </div>

        <!-- ✅ แถวปุ่มแผนที่: อยู่ใต้ปุ่มโทร และกดดูได้ตลอด -->
        <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;">
          <button class="secondary" type="button" style="width:auto;" ${((job.address_text || job.maps_url || (job.gps_latitude != null && job.gps_longitude != null)) ? "" : "disabled")} onclick="openMaps(${job.gps_latitude ?? null}, ${job.gps_longitude ?? null}, '${(job.address_text||"").replace(/'/g,"\\'")}', '${String(job.maps_url||"").replace(/'/g,"\\'")}' )">🧭 แผนที่</button>
        </div>

        <!-- ✅ ปุ่มอัปเดตสถานะ / e-slip (ปุ่มเดียว) -->
        <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;">
          <button type="button" style="width:100%;" ${workflowDisabled ? "disabled" : ""} onclick="${workflowOnclick}">
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
              <button onclick="pickPhotos(${jobId}, 'before')" ${!canEdit ? "disabled" : ""}>ก่อนทำ</button>
              <button onclick="pickPhotos(${jobId}, 'after')" ${!canEdit ? "disabled" : ""}>หลังทำ</button>
              <button onclick="pickPhotos(${jobId}, 'pressure', 4)" ${!canEdit ? "disabled" : ""}>วัดน้ำยา</button>
              <button onclick="pickPhotos(${jobId}, 'current', 4)" ${!canEdit ? "disabled" : ""}>วัดกระแส</button>
              <button onclick="pickPhotos(${jobId}, 'temp', 4)" ${!canEdit ? "disabled" : ""}>อุณหภูมิ</button>
              <button onclick="pickPhotos(${jobId}, 'defect', 4)" ${!canEdit ? "disabled" : ""}>ตำหนิ</button>
            </div>
            <div id="photo-status-${jobId}" style="margin-top:8px;"></div>
          </div>

          <hr style="margin:10px 0;" />

          <div>
            <b>📝 หมายเหตุช่าง</b>
            <textarea id="note-${jobId}" rows="3" style="margin-top:6px;" placeholder="เจอปัญหาอะไร ใส่ไว้ได้" ${!canEdit ? "disabled" : ""}>${escape(job.technician_note || "")}</textarea>

            ${historyMode ? "" : ((checkedIn || isWorking) ? `
              <div class="row" style="margin-top:8px;gap:10px;flex-wrap:wrap;">
                <button class="secondary" type="button" style="width:auto;" onclick="saveNote(${jobId})" ${!canEdit ? "disabled" : ""}>💾 บันทึกหมายเหตุ</button>
                ${isWorking ? `
                  <button type="button" style="width:auto;" onclick="requestFinalize(${jobId}, 'เสร็จแล้ว')">✅ เสร็จสิ้น</button>
                  <button class="danger" type="button" style="width:auto;" onclick="requestFinalize(${jobId}, 'ยกเลิก')">⛔ ยกเลิก</button>
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
    if (showWorkTools) refreshPhotoStatus(jobId);
  }, 0);

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
    const id = Number(jobId);
    const called = !!localStorage.getItem(`cwf_called_${id}`);
    if (!called) {
      alert("ต้องกด ‘โทรลูกค้า’ ก่อน ถึงจะเริ่มเดินทางได้");
      return;
    }

    // ✅ บันทึกในเครื่อง เพื่อให้ปุ่มเปลี่ยนสถานะทันที
    localStorage.setItem(`cwf_travel_${jobId}`, String(Date.now()));

    // เปิดแผนที่ (หลังจากกดเริ่มเดินทาง ถึงจะแสดง GPS/ปุ่มเช็คอิน)
    const job = (window.__JOB_CACHE__ || []).find(j => Number(j.job_id) === Number(jobId));
    if (job) openMaps(job.gps_latitude, job.gps_longitude, job.address_text);

    // แจ้ง backend (optional)
    await fetch(`${API_BASE}/jobs/${jobId}/travel-start`, { method: "POST" }).catch(() => {});
  } finally {
    loadJobs();
  }
}

async function startWork(jobId) {
  try {
    await fetch(`${API_BASE}/jobs/${jobId}/status`, {
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
    const id = Number(jobId);
    const job = (window.__JOB_CACHE__ || []).find(j => Number(j.job_id) === id);
    if (!job) {
      alert("ไม่พบข้อมูลงาน (ลองรีเฟรช)");
      return;
    }

    const status = normStatus(job.job_status);
    const called = !!localStorage.getItem(`cwf_called_${id}`);
    const travelStarted = !!localStorage.getItem(`cwf_travel_${id}`) || !!job.travel_started_at;
    const checkedIn = !!job.checkin_at;
    const paid = !!job.paid_at || String(job.payment_status || "").trim().toLowerCase() === "paid";
    const isWorking = status === "กำลังทำ";

    // งานปิดแล้ว: ให้ไปดู e-slip (ถ้ามี) และจบ
    if (status === "เสร็จแล้ว" || status === "ยกเลิก") {
      if (paid) return openESlip(id);
      alert("งานนี้ปิดแล้ว");
      return;
    }

    if (!travelStarted) {
      if (!called) {
        alert("ต้องกด ‘โทรลูกค้า’ ก่อน ถึงจะเริ่มเดินทางได้");
        return;
      }
      return startTravel(id);
    }

    if (!checkedIn) {
      return checkin(id);
    }

    if (!isWorking) {
      return startWork(id);
    }

    if (!paid) {
      return payJob(id);
    }

    // จ่ายแล้ว => ดู e-slip ได้ตลอด
    return openESlip(id);
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

        <div class="muted" style="margin-top:8px;font-size:12px;">
          * ถ้ารูป QR ไม่ขึ้น ให้เช็คสัญญาณอินเทอร์เน็ต หรือเปลี่ยนเป็นลิงก์ QR ของบริษัทในภายหลัง
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
  if (qrEl) qrEl.src = buildPromptPayQrUrl(total);

  if (btnPaid) {
    btnPaid.disabled = false;
    btnPaid.onclick = async () => {
      try {
        btnPaid.disabled = true;
        if (msgEl) msgEl.textContent = "กำลังบันทึกการชำระเงิน...";

        const res = await fetch(`${API_BASE}/jobs/${id}/pay`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, amount: total }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "บันทึกการจ่ายเงินไม่สำเร็จ");

        if (msgEl) msgEl.textContent = "✅ บันทึกแล้ว กรุณาแนบรูปสลิป";
        // แนบสลิป (phase = payment_slip) 1 รูป
        await pickPhotos(id, "payment_slip", 1);

        if (msgEl) msgEl.textContent = "✅ แนบสลิปแล้ว (ถ้าเน็ตพร้อมจะอัปโหลดทันที)";
        if (btnE) {
          btnE.style.display = "";
          btnE.onclick = () => openESlip(id);
        }

        // รีเฟรชรายการ
        loadJobs();
      } catch (e) {
        console.error(e);
        alert(`❌ ${e.message}`);
        if (msgEl) msgEl.textContent = `❌ ${e.message}`;
      } finally {
        btnPaid.disabled = false;
      }
    };
  }

  if (modal) modal.style.display = "flex";
}
window.payJob = payJob;

function openESlip(jobId) {
  const id = Number(jobId);
  if (!id) return;
  window.open(`/docs/eslip/${id}`, "_blank");
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
// ✅ FINALIZE (เสร็จสิ้น / ยกเลิก) + ลายเซ็นต์
// =======================================
function requestFinalize(jobId, targetStatus) {
  // เปิดลายเซ็นต์ก่อน (ถ้ากดยกเลิกในลายเซ็นต์ จะต้องกลับไปเลือกใหม่เอง)
  openSignatureModal((signatureDataUrl) => finalizeJob(jobId, targetStatus, signatureDataUrl));
}

async function finalizeJob(jobId, targetStatus, signatureDataUrl) {
  try {
    // อัปโหลดรูปค้างก่อน
    await uploadPendingPhotos(jobId);

    // บันทึก note ล่าสุด (เพื่อส่งให้แอดมินตอนยกเลิก)
    const note = (document.getElementById(`note-${jobId}`)?.value || "").trim();
    await fetch(`${API_BASE}/jobs/${jobId}/note`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    }).catch(() => {});

    const res = await fetch(`${API_BASE}/jobs/${jobId}/finalize`, {
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
  fetch(`${API_BASE}/jobs/${jobId}/status`, {
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
    await uploadPendingPhotos(jobId);

    const res = await fetch(`${API_BASE}/jobs/${jobId}/status`, {
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

      fetch(`${API_BASE}/jobs/${jobId}/checkin`, {
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

  fetch(`${API_BASE}/jobs/${jobId}/note`, {
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
    })
    .catch((e) => alert(`❌ ${e.message}`));
}

// =======================================
// 💰 PRICING
// =======================================
function loadPricing(jobId) {
  fetch(`${API_BASE}/jobs/${jobId}/pricing`)
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
      const rr = await fetch(`${API_BASE}/jobs/${jobId}/photos`);
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
    const rr = await fetch(`${API_BASE}/jobs/${jobId}/photos`);
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
async function uploadPendingPhotos(jobId) {
  const items = await idbGetByJob(jobId);
  if (!items.length) return true;

  for (const it of items) {
    const form = new FormData();
    form.append("photo", it.blob, it.original_name || "photo.jpg");

    const res = await fetch(`${API_BASE}/jobs/${jobId}/photos/${it.photo_id}/upload`, {
      method: "POST",
      body: form,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "อัปโหลดรูปไม่สำเร็จ");

    await idbDelete(it.photo_id);
  }

  return true;
}

// =======================================
// 📷 PICK PHOTOS (เข้าคิวลง IndexedDB)
// =======================================
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
        const metaRes = await fetch(`${API_BASE}/jobs/${jobId}/photos/meta`, {
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

        const buffer = await f.arrayBuffer();
        // ✅ อัปโหลดทันที (ถ้าเน็ตพร้อม) - ถ้าไม่สำเร็จค่อยค้างในเครื่อง
        try {
          const formNow = new FormData();
          formNow.append("photo", f, f.name || "photo.jpg");

          const upRes = await fetch(`${API_BASE}/jobs/${jobId}/photos/${photo_id}/upload`, {
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
