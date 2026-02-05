// =======================================
// 🔧 CONFIG
// =======================================
// ใช้ origin เดียวกับเว็บที่เปิดอยู่ (เสถียรสุด ไม่ต้องแก้ IP)
const API_BASE = window.location.origin;


// =======================================
// 🔐 AUTH GUARD (Admin) + RESTORE (cookie fallback)
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
    if (obj.exp && Date.now() > Number(obj.exp)) return;
    localStorage.setItem("username", obj.u);
    localStorage.setItem("role", obj.r);
  }catch{}
}
restoreAuthFromCookie();

const __role = localStorage.getItem("role");
if (__role !== "admin") {
  alert("ต้องเป็นแอดมินเท่านั้น");
  location.href = "/login.html";
}


// =======================================
// 🧾 STATE: รายการของงาน (หลายรายการได้)
// =======================================
let jobItems = [];      // [{item_id, item_name, qty, unit_price}]
let catalogItems = [];
let promotions = [];
let technicians = [];

// =======================================
// 🧾 STATE: รายการของงานใน "Modal แก้ไข" (แยกจากตอนสร้างงาน)
// =======================================
let editJobItems = [];         // [{item_name, qty, unit_price}]

// =======================================
// 🧩 HELPERS
// =======================================

// ✅ parse Lat/Lng จาก Google Maps URL (เสถียรสุด)
// - รองรับลิงก์ที่ "มีพิกัดอยู่ใน URL" เท่านั้น (ไม่รองรับ maps.app.goo.gl)
// - รองรับวางพิกัดตรง ๆ: 13.7563,100.5018
function parseLatLngFromMapsUrl(url) {
  const u = String(url || "").trim();
  if (!u) return null;

  // ❌ ไม่รองรับ short link (ไม่เสถียร)
  if (/^https?:\/\/maps\.app\.goo\.gl\//i.test(u)) return null;

  // 1) วางพิกัดตรง ๆ "lat,lng" หรือ "lat lng"
  let m = u.match(/(-?\d{1,2}\.\d+)\s*[, ]\s*(-?\d{1,3}\.\d+)/);
  if (m) {
    const lat = Number(m[1]); const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  // 2) .../@lat,lng
  m = u.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
  if (m) return { lat: Number(m[1]), lng: Number(m[2]) };

  // 3) !3dlat!4dlng (share link บางแบบ)
  m = u.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/);
  if (m) return { lat: Number(m[1]), lng: Number(m[2]) };

  // 4) query=lat,lng / q=lat,lng / destination=lat,lng / ll=lat,lng / center=lat,lng
  m = u.match(/[?&](?:query|q|destination|ll|center)=(-?\d{1,2}\.\d+)%2C(-?\d{1,3}\.\d+)/i);
  if (m) return { lat: Number(m[1]), lng: Number(m[2]) };

  m = u.match(/[?&](?:query|q|destination|ll|center)=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/i);
  if (m) return { lat: Number(m[1]), lng: Number(m[2]) };

  // 5) daddr=lat,lng (directions link)
  m = u.match(/[?&]daddr=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/i);
  if (m) return { lat: Number(m[1]), lng: Number(m[2]) };

  return null;
}

// =======================================
// 🧭 GPS AUTO-PARSE (STABLE) + WARNING (กทม+ปริมณฑล)
// - วางลิงก์/พิกัดแล้วแปลงให้ทันที (ADD + EDIT)
// - ถ้าอยู่นอก กทม+ปริมณฑล: ขึ้นตัวหนังสือสีแดงเตือน แต่ยังบันทึกงานได้
// - ไม่รองรับ maps.app.goo.gl: ขึ้นแดงเตือนให้ใช้ลิงก์เต็ม/วางพิกัดตรง ๆ
// =======================================

function isBangkokMetro(lat, lng) {
  // Bounding box แบบปลอดภัย: ครอบคลุม กทม+ปริมณฑลโดยประมาณ (เตือน ไม่บล็อก)
  return lat >= 13.20 && lat <= 14.20 && lng >= 99.80 && lng <= 101.20;
}

function upsertGpsWarning(inputEl, msg, isError = true) {
  if (!inputEl) return;
  const id = (inputEl.id || "maps_link") + "__gps_warn";
  let warn = document.getElementById(id);
  if (!warn) {
    warn = document.createElement("div");
    warn.id = id;
    warn.style.marginTop = "6px";
    warn.style.fontSize = "13px";
    warn.style.lineHeight = "1.3";
    inputEl.insertAdjacentElement("afterend", warn);
  }
  warn.textContent = msg || "";
  warn.style.color = isError ? "#d00000" : "#116611";
  warn.style.display = msg ? "block" : "none";
}

function stableParseAndFill(urlInput, latInput, lngInput) {
  if (!urlInput || !latInput || !lngInput) return;

  const raw = String(urlInput.value || "").trim();
  if (!raw) {
    upsertGpsWarning(urlInput, "", false);
    return;
  }

  // Short link warning
  if (/^https?:\/\/maps\.app\.goo\.gl\//i.test(raw)) {
    upsertGpsWarning(
      urlInput,
      "⚠️ ไม่รองรับลิงก์สั้น maps.app.goo.gl (ไม่เสถียร) — กรุณาเปิดใน Google Maps แล้วคัดลอกลิงก์แบบเต็ม หรือวางพิกัดตรง ๆ เช่น 13.7563,100.5018",
      true
    );
    return;
  }

  const out = parseLatLngFromMapsUrl(raw);
  if (!out || !Number.isFinite(out.lat) || !Number.isFinite(out.lng)) {
    upsertGpsWarning(
      urlInput,
      "❌ ไม่พบพิกัดในลิงก์นี้ — กรุณาวางลิงก์ Google Maps แบบเต็มที่มีพิกัด (@lat,lng หรือ q=lat,lng) หรือวางพิกัดตรง ๆ เช่น 13.7563,100.5018",
      true
    );
    return;
  }

  latInput.value = String(out.lat);
  lngInput.value = String(out.lng);

  if (!isBangkokMetro(out.lat, out.lng)) {
    upsertGpsWarning(
      urlInput,
      `⚠️ พิกัดอยู่นอก “กรุงเทพฯ + ปริมณฑล” (lat=${out.lat}, lng=${out.lng}) — บันทึกงานได้ แต่แนะนำให้ตรวจสอบ/แก้ไขภายหลัง`,
      true
    );
  } else {
    upsertGpsWarning(urlInput, `✅ แยกพิกัดสำเร็จ (lat=${out.lat}, lng=${out.lng})`, false);
  }
}

function bindStableGpsAutoParse(urlId, latId, lngId) {
  const urlInput = document.getElementById(urlId);
  const latInput = document.getElementById(latId);
  const lngInput = document.getElementById(lngId);
  if (!urlInput || !latInput || !lngInput) return;

  let t = null;
  const schedule = () => {
    clearTimeout(t);
    t = setTimeout(() => stableParseAndFill(urlInput, latInput, lngInput), 120);
  };

  urlInput.addEventListener("paste", schedule);
  urlInput.addEventListener("input", schedule);
  urlInput.addEventListener("change", schedule);
  urlInput.addEventListener("blur", () => stableParseAndFill(urlInput, latInput, lngInput));
}

// init auto-parse on both ADD + EDIT inputs
(function initStableGpsAutoParse(){
  const run = () => {
    bindStableGpsAutoParse("maps_link", "gps_latitude", "gps_longitude");
    bindStableGpsAutoParse("edit_maps_url", "edit_gps_latitude", "edit_gps_longitude");
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();


function toDatetimeLocal(value) {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

// ✅ แปลงค่าจาก <input type="datetime-local"> -> ISO (เก็บเป็น UTC ให้แสดงท้องถิ่นตรงกันทุกหน้า)
function datetimeLocalToISO(value) {
  if (!value) return null;
  try {
    const d = new Date(value); // ✅ interpret as local time
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}


// =======================================
// 🧩 EDIT MODAL STATE
// =======================================
let currentEditJobId = null;
let currentEditBookingCode = null;

function openEditModal(job) {
  currentEditJobId = Number(job?.job_id);
  const backdrop = document.getElementById("editModalBackdrop");
  if (!backdrop) return alert("ไม่พบ UI แก้ไขใบงาน");

  const booking = job.booking_code || ("CWF" + String(job.job_id).padStart(7, "0"));
  currentEditBookingCode = booking;
  const src = job.job_source || job.source || "-";

  const title = document.getElementById("editModalTitle");
  const sub = document.getElementById("editModalSub");
  if (title) title.textContent = `✏️ แก้ไขใบงาน: ${booking}`;
  if (sub) sub.textContent = `Job ID: ${job.job_id} | แหล่งที่มา: ${src}`;

  // fill fields
  document.getElementById("edit_customer_name").value = job.customer_name || "";
  document.getElementById("edit_customer_phone").value = job.customer_phone || "";
  document.getElementById("edit_job_type").value = job.job_type || "";
  document.getElementById("edit_appointment_datetime").value = toDatetimeLocal(job.appointment_datetime);
  document.getElementById("edit_address_text").value = job.address_text || "";
  document.getElementById("edit_maps_url").value = job.maps_url || "";
  document.getElementById("edit_job_zone").value = job.job_zone || "";
  document.getElementById("edit_customer_note").value = job.customer_note || "";
  document.getElementById("edit_gps_latitude").value = (job.gps_latitude ?? "");
  document.getElementById("edit_gps_longitude").value = (job.gps_longitude ?? "");

  // ✅ reset (รายการ/ทีม)
  editJobItems = [];
  const teamInput = document.getElementById("edit_team_members");
  if (teamInput) teamInput.value = "";
  renderEditItemsPreview();

  // ✅ โหลดรายการ/โปร/ทีมจริงจากเซิร์ฟเวอร์ (กรณีงานเดิมมีข้อมูล)
  try { loadEditModalExtras(Number(job.job_id)); } catch(e) {}

  backdrop.classList.add("show");
  try { document.body.classList.add("modal-open"); } catch(e) {}
}

function closeEditModal() {
  const backdrop = document.getElementById("editModalBackdrop");
  if (backdrop) backdrop.classList.remove("show");
  try { document.body.classList.remove("modal-open"); } catch(e) {}
  currentEditJobId = null;
}

function parseMapsToLatLngInModal() {
  // ใช้ตัว parser แบบเสถียร + แสดง warning สีแดง (ยังบันทึกได้)
  const urlEl = document.getElementById("edit_maps_url");
  const latEl = document.getElementById("edit_gps_latitude");
  const lngEl = document.getElementById("edit_gps_longitude");
  stableParseAndFill(urlEl, latEl, lngEl);
}


async function saveEditModal() {
  const jobId = currentEditJobId;
  if (!jobId) return;

  const btn = document.getElementById("editSaveBtn");
  if (btn) btn.disabled = true;

  const payload = {
    customer_name: document.getElementById("edit_customer_name")?.value || "",
    customer_phone: document.getElementById("edit_customer_phone")?.value || "",
    job_type: document.getElementById("edit_job_type")?.value || "",
    appointment_datetime: datetimeLocalToISO(document.getElementById("edit_appointment_datetime")?.value) || null,
    address_text: document.getElementById("edit_address_text")?.value || "",
    maps_url: (document.getElementById("edit_maps_url")?.value || "").trim() || null,
    job_zone: (document.getElementById("edit_job_zone")?.value || "").trim() || null,
    customer_note: document.getElementById("edit_customer_note")?.value || "",
    gps_latitude: null,
    gps_longitude: null,
  };

  const latRaw = (document.getElementById("edit_gps_latitude")?.value || "").trim();
  const lngRaw = (document.getElementById("edit_gps_longitude")?.value || "").trim();
  if (latRaw !== "") payload.gps_latitude = Number(latRaw);
  if (lngRaw !== "") payload.gps_longitude = Number(lngRaw);

  try {
    const up = await fetch(`${API_BASE}/jobs/${jobId}/admin-edit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await up.json().catch(() => ({}));
    if (!up.ok) throw new Error(data.error || "แก้ไขไม่สำเร็จ");

    alert("✅ แก้ไขใบงานแล้ว");
    closeEditModal();
    loadCustomerBookings();
    loadAllJobs();
  } catch (e) {
    alert(`❌ ${e.message}`);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// =======================================
// 🗑️ ลบถาวร (Hard Delete) เฉพาะแอดมิน
// - ใช้กับงานทดสอบ/ลงผิด (ลบแล้วหายทุกหน้าทันที)
// - ต้องพิมพ์ booking_code หรือ DELETE เพื่อยืนยัน
// =======================================
async function hardDeleteJobFromModal(){
  if(!currentEditJobId) return;

  const code = (currentEditBookingCode || "").toString().trim();
  const input = prompt(`พิมพ์เพื่อยืนยันลบถาวร\n- ใส่ booking_code: ${code}\n- หรือพิมพ์ DELETE\n\n⚠️ ลบแล้วกู้คืนไม่ได้`);
  if(!input) return;

  try{
    const r = await fetch(`${API_BASE}/jobs/${currentEditJobId}/admin-delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm_code: input.trim() })
    });

    const data = await r.json().catch(()=> ({}));
    if(!r.ok) throw new Error(data.error || "ลบไม่สำเร็จ");

    alert("✅ ลบงานถาวรแล้ว");
    closeEditModal();
    await loadAllJobs();
  }catch(e){
    alert(`❌ ${e.message}`);
  }
}


// =======================================
// ✅ MODAL EXTRAS: โหลดรายการ/โปร/ทีม จากเซิร์ฟเวอร์
// =======================================
async function loadEditModalExtras(jobId){
  if (!jobId) return;

  // 1) ทีมช่าง
  try {
    const r = await fetch(`${API_BASE}/jobs/${Number(jobId)}/team`);
    const data = await r.json().catch(()=> ({}));
    if (r.ok) {
      const members = Array.isArray(data.members) ? data.members : [];
      const teamInput = document.getElementById("edit_team_members");
      if (teamInput) teamInput.value = members.join(",");
    }
  } catch { /* ignore */ }

  // 2) รายการ/โปร (pricing)
  try {
    const r = await fetch(`${API_BASE}/jobs/${Number(jobId)}/pricing`);
    const data = await r.json().catch(()=> ({}));
    if (!r.ok) return;

    // data.items => [{item_name, qty, unit_price, line_total}]
    editJobItems = Array.isArray(data.items)
      ? data.items.map(it => ({
          item_name: it.item_name,
          qty: Number(it.qty || 0),
          unit_price: Number(it.unit_price || 0)
        })).filter(x => x.item_name && x.qty > 0)
      : [];

    // promo select
    const promoSelect = document.getElementById("edit_promotion_select");
    if (promoSelect) {
      const pid = data?.promotion?.promo_id ? String(data.promotion.promo_id) : "";
      promoSelect.value = pid;
    }
    renderEditItemsPreview();
  } catch { /* ignore */ }
}

// =======================================
// ✅ แอดมินเพิ่ม/ลบรายการใน "Modal แก้ไข"
// =======================================
function addEditItem(){
  const jobId = currentEditJobId;
  if (!jobId) return alert("ยังไม่เลือกงาน");

  const sel = document.getElementById("edit_catalog_select");
  const qtyEl = document.getElementById("edit_item_qty");
  const priceEl = document.getElementById("edit_item_unit_price");

  const catalogId = Number(sel?.value || 0);
  const qty = Number(qtyEl?.value || 1);
  const unit_price = Number(priceEl?.value || 0);

  if (!catalogId) return alert("เลือกรายการก่อน");
  if (!Number.isFinite(qty) || qty <= 0) return alert("จำนวนต้องมากกว่า 0");
  if (!Number.isFinite(unit_price) || unit_price < 0) return alert("ราคา/หน่วยไม่ถูกต้อง");

  const found = catalogItems.find(x => Number(x.item_id) === catalogId);
  if (!found) return alert("ไม่พบรายการใน catalog");

  const name = String(found.item_name || "").trim();
  if (!name) return alert("ชื่อรายการไม่ถูกต้อง");

  // รวมรายการชื่อเดียวกัน
  const existed = editJobItems.find(x => String(x.item_name) === name);
  if (existed) {
    existed.qty += qty;
    existed.unit_price = unit_price; // อัปเดตราคาล่าสุด
  } else {
    editJobItems.push({ item_name: name, qty, unit_price });
  }

  renderEditItemsPreview();
}

function removeEditItem(idx){
  editJobItems.splice(Number(idx), 1);
  renderEditItemsPreview();
}

function renderEditItemsPreview(){
  const box = document.getElementById("edit_items_preview");
  const promoSelect = document.getElementById("edit_promotion_select");
  if (!box) return;

  if (!Array.isArray(editJobItems) || editJobItems.length === 0) {
    box.innerHTML = "(ยังไม่มีรายการ)";
    return;
  }

  const promoId = promoSelect?.value ? Number(promoSelect.value) : null;
  const promo = promotions.find(p => Number(p.promo_id) === Number(promoId)) || null;

  let subtotal = 0;
  const rows = editJobItems.map((it, i) => {
    const qty = Number(it.qty || 0);
    const up = Number(it.unit_price || 0);
    const line = qty * up;
    subtotal += line;
    return `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:6px;">
        <div>
          <b>${it.item_name}</b> <span class="muted">x${qty}</span>
          <div class="muted">฿${up.toLocaleString('th-TH')}/หน่วย</div>
        </div>
        <div style="text-align:right;">
          <div><b>฿${line.toLocaleString('th-TH')}</b></div>
          <button class="danger btn-mini" type="button" onclick="removeEditItem(${i})">ลบ</button>
        </div>
      </div>
    `;
  }).join("");

  let discount = 0;
  if (promo) {
    if (promo.promo_type === "percent") discount = subtotal * (Number(promo.promo_value) / 100);
    else discount = Number(promo.promo_value || 0);
    if (discount > subtotal) discount = subtotal;
  }
  const total = Math.max(0, subtotal - discount);

  box.innerHTML = `
    ${rows}
    <hr style="margin:10px 0;">
    <div style="display:flex;justify-content:space-between;"><span>รวมย่อย</span><b>฿${subtotal.toLocaleString('th-TH')}</b></div>
    <div style="display:flex;justify-content:space-between;"><span>ส่วนลด</span><b>-฿${discount.toLocaleString('th-TH')}</b></div>
    <div style="display:flex;justify-content:space-between;"><span>รวมสุทธิ</span><b>฿${total.toLocaleString('th-TH')}</b></div>
  `;
}

// =======================================
// 💾 บันทึกรายการ/ราคา (admin direct)
// =======================================
async function saveEditItems(){
  const jobId = currentEditJobId;
  if (!jobId) return;
  const statusEl = document.getElementById("edit_items_status");
  if (statusEl) statusEl.textContent = "กำลังบันทึก...";

  try {
    const promotion_id = document.getElementById("edit_promotion_select")?.value || "";
    const payload = {
      items: (editJobItems || []).map(it => ({
        item_name: it.item_name,
        qty: Number(it.qty || 0),
        unit_price: Number(it.unit_price || 0),
      })),
      promotion_id: promotion_id ? Number(promotion_id) : null,
    };

    const r = await fetch(`${API_BASE}/jobs/${Number(jobId)}/items-admin`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(()=> ({}));
    if (!r.ok) throw new Error(data.error || "บันทึกรายการไม่สำเร็จ");

    if (statusEl) statusEl.textContent = `✅ บันทึกแล้ว (รวมสุทธิ ฿${Number(data.total || 0).toLocaleString('th-TH')})`;
    // refresh lists
    loadCustomerBookings();
    loadAllJobs();
  } catch (e) {
    if (statusEl) statusEl.textContent = `❌ ${e.message}`;
  }
}

// =======================================
// 👥 บันทึกทีมช่าง (admin)
// =======================================
async function saveTeamMembersFromModal(){
  const jobId = currentEditJobId;
  if (!jobId) return;
  const statusEl = document.getElementById("edit_team_status");
  if (statusEl) statusEl.textContent = "กำลังบันทึก...";

  try {
    const raw = document.getElementById("edit_team_members")?.value || "";
    const members = raw.split(",").map(s=>s.trim()).filter(Boolean);

    const r = await fetch(`${API_BASE}/jobs/${Number(jobId)}/team`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ members }),
    });
    const data = await r.json().catch(()=> ({}));
    if (!r.ok) throw new Error(data.error || "บันทึกทีมไม่สำเร็จ");

    if (statusEl) statusEl.textContent = `✅ บันทึกทีมแล้ว (${(data.members||[]).length} คน)`;
  } catch (e) {
    if (statusEl) statusEl.textContent = `❌ ${e.message}`;
  }
}


// expose ให้ปุ่มใน HTML ใช้ได้
window.closeEditModal = closeEditModal;
window.parseMapsToLatLngInModal = parseMapsToLatLngInModal;
window.saveEditModal = saveEditModal;
window.addEditItem = addEditItem;
window.removeEditItem = removeEditItem;
window.saveEditItems = saveEditItems;
window.saveTeamMembersFromModal = saveTeamMembersFromModal;

// =======================================
// 👷 LOAD TECHNICIANS
// =======================================
fetch(`${API_BASE}/users/technicians`)
  .then(res => {
    if (!res.ok) throw new Error("โหลดรายชื่อช่างไม่สำเร็จ");
    return res.json();
  })
  .then(users => {
    technicians = Array.isArray(users) ? users : [];
    const select = document.getElementById("technician_username");
    technicians.forEach(u => {
      const opt = document.createElement("option");
      opt.value = u.username;
      opt.textContent = u.username;
      select.appendChild(opt);
    });
  })
  .catch(err => {
    console.error(err);
    alert(`❌ ${err.message}`);
  });

// =======================================
// 📦 LOAD CATALOG + PROMOTIONS
// =======================================
loadCatalogAndPromos();

function loadCatalogAndPromos() {
  Promise.all([
    fetch(`${API_BASE}/catalog/items`).then(r => r.json()),
    fetch(`${API_BASE}/promotions`).then(r => r.json()),
  ])
    .then(([items, promos]) => {
      catalogItems = Array.isArray(items) ? items : [];
      promotions = Array.isArray(promos) ? promos : [];

      // dropdown catalog
      const cs = document.getElementById("catalog_select");
      cs.innerHTML = `<option value="">-- เลือกรายการ --</option>`;
      catalogItems.forEach(it => {
        const opt = document.createElement("option");
        opt.value = it.item_id;
        opt.textContent = `${it.item_name} (${Number(it.base_price)} บาท/${it.unit_label})`;
        cs.appendChild(opt);
      });

      // ✅ dropdown catalog (ใน Modal แก้ไข)
      const ecs = document.getElementById("edit_catalog_select");
      if (ecs) {
        ecs.innerHTML = `<option value="">-- เลือกรายการ --</option>`;
        catalogItems.forEach(it => {
          const opt = document.createElement("option");
          opt.value = it.item_id;
          opt.textContent = `${it.item_name} (${Number(it.base_price)} บาท/${it.unit_label})`;
          ecs.appendChild(opt);
        });
        ecs.onchange = () => {
          const id = Number(ecs.value || 0);
          const found = catalogItems.find(x => Number(x.item_id) === id);
          if (found) {
            const inp = document.getElementById("edit_item_unit_price");
            if (inp) inp.value = String(Number(found.base_price || 0));
          }
        };
      }

      // dropdown promo
      const ps = document.getElementById("promotion_select");
      ps.innerHTML = `<option value="">-- ไม่ใช้โปร --</option>`;
      promotions.forEach(p => {
        const label = p.promo_type === "percent"
          ? `-${Number(p.promo_value)}%`
          : `-${Number(p.promo_value)} บาท`;
        const opt = document.createElement("option");
        opt.value = p.promo_id;
        opt.textContent = `${p.promo_name} (${label})`;
        ps.appendChild(opt);
      });

      // ✅ dropdown promo (ใน Modal แก้ไข)
      const eps = document.getElementById("edit_promotion_select");
      if (eps) {
        eps.innerHTML = `<option value="">-- ไม่ใช้โปร --</option>`;
        promotions.forEach(p => {
          const label = p.promo_type === "percent"
            ? `-${Number(p.promo_value)}%`
            : `-${Number(p.promo_value)} บาท`;
          const opt = document.createElement("option");
          opt.value = p.promo_id;
          opt.textContent = `${p.promo_name} (${label})`;
          eps.appendChild(opt);
        });
        eps.onchange = () => renderEditItemsPreview();
      }

      ps.onchange = () => renderJobItems();
      renderJobItems();
    })
    .catch(err => {
      console.error(err);
    });
}

// =======================================
// ➕ เพิ่มรายการเข้า jobItems
// =======================================
function addItemToJob() {
  const catalogId = Number(document.getElementById("catalog_select").value);
  const qty = Number(document.getElementById("item_qty").value || 1);

  if (!catalogId) return alert("เลือกรายการก่อน");
  if (qty <= 0) return alert("จำนวนต้องมากกว่า 0");

  const found = catalogItems.find(x => Number(x.item_id) === catalogId);
  if (!found) return alert("ไม่พบรายการใน catalog");

  const existed = jobItems.find(x => Number(x.item_id) === catalogId);
  if (existed) existed.qty += qty;
  else {
    jobItems.push({
      item_id: found.item_id,
      item_name: found.item_name,
      qty,
      unit_price: Number(found.base_price || 0),
    });
  }

  renderJobItems();
}

// =======================================
// 🧾 แสดงรายการ + คำนวณยอด (ลดทั้งบิล)
// =======================================
function renderJobItems() {
  const box = document.getElementById("job_items_preview");
  if (!box) return;

  if (!jobItems.length) {
    box.innerHTML = `<p>ยังไม่มีรายการ</p>`;
    document.getElementById("grand_total").textContent = "0";
    return;
  }

  const promoId = document.getElementById("promotion_select").value;
  const promo = promotions.find(p => String(p.promo_id) === String(promoId)) || null;

  let subtotal = 0;

  const rows = jobItems.map((it, idx) => {
    const line = Number(it.qty) * Number(it.unit_price);
    subtotal += line;

    return `
      <div style="padding:8px;border:1px solid #eee;margin-bottom:6px;border-radius:8px;">
        <b>${it.item_name}</b><br>
        จำนวน: <input type="number" min="1" step="1" value="${it.qty}"
          style="width:80px;" onchange="updateQty(${idx}, this.value)">
        ราคา/หน่วย: <input type="number" step="0.01" value="${it.unit_price}"
          style="width:110px;" onchange="updatePrice(${idx}, this.value)">
        <button type="button" onclick="removeItem(${idx})">ลบ</button>
        <div>รวม: ${line.toFixed(2)} บาท</div>
      </div>
    `;
  }).join("");

  let discount = 0;
  if (promo) {
    const v = Number(promo.promo_value || 0);
    if (promo.promo_type === "percent") discount = subtotal * (v / 100);
    if (promo.promo_type === "amount") discount = Math.max(0, v);
  }

  const total = Math.max(0, subtotal - discount);

  box.innerHTML = `
    ${rows}
    <div style="padding:10px;background:#f7f7f7;border-radius:10px;">
      <div>ราคาเต็ม (Subtotal): <b>${subtotal.toFixed(2)}</b> บาท</div>
      <div>ส่วนลด (Discount): <b>${discount.toFixed(2)}</b> บาท</div>
      <div>ยอดรวมสุทธิ: <b>${total.toFixed(2)}</b> บาท</div>
    </div>
  `;

  document.getElementById("grand_total").textContent = total.toFixed(2);
}

function updateQty(idx, val) {
  jobItems[idx].qty = Math.max(1, Number(val || 1));
  renderJobItems();
}
function updatePrice(idx, val) {
  jobItems[idx].unit_price = Math.max(0, Number(val || 0));
  renderJobItems();
}
function removeItem(idx) {
  jobItems.splice(idx, 1);
  renderJobItems();
}

// =======================================
// ➕ ADD JOB (ส่ง GPS หน้างานไป backend ด้วย)
// =======================================
function addJob() {
  const data = {
    customer_name: customer_name.value.trim(),
    customer_phone: customer_phone.value.trim(),
    job_type: job_type.value.trim(),
    appointment_datetime: datetimeLocalToISO(appointment_datetime.value),
    address_text: address_text.value.trim(),

    // ✅ ลิงก์แผนที่ (เสถียรสุด: เก็บไว้เปิดนำทางได้เสมอ)
    maps_url: (document.getElementById("maps_link")?.value || "").trim() || null,

    // ✅ GPS หน้างาน (สำหรับเช็คอิน)
    gps_latitude: (String(gps_latitude.value || "").trim() !== "") ? Number(gps_latitude.value) : null,
    gps_longitude: (String(gps_longitude.value || "").trim() !== "") ? Number(gps_longitude.value) : null,

    technician_username: technician_username.value,

    // 🚦 รูปแบบส่งงานให้ช่าง
    dispatch_mode: (document.getElementById('dispatch_mode')?.value || 'offer'),

    // ✅ โหมดใหม่
    items: jobItems,
    promotion_id: promotion_select.value || null,

    // ✅ โหมดเก่า (เผื่อไม่ได้ใส่รายการ)
    job_price: job_price.value || 0,
  };

  // validate ขั้นต่ำ
  if (!data.customer_name || !data.job_type || !data.appointment_datetime || !data.technician_username) {
    alert("กรอกข้อมูลให้ครบ และเลือกช่าง");
    return;
  }

  // ถ้าใส่ GPS มา ต้องครบคู่ (เช็คแบบ null-safe)
  const hasLat = data.gps_latitude !== null && data.gps_latitude !== undefined && !Number.isNaN(Number(data.gps_latitude));
  const hasLng = data.gps_longitude !== null && data.gps_longitude !== undefined && !Number.isNaN(Number(data.gps_longitude));
  if ((hasLat && !hasLng) || (!hasLat && hasLng)) {
    alert("กรอก GPS ให้ครบทั้ง Latitude และ Longitude");
    return;
  }

  fetch(`${API_BASE}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
    .then(async (res) => {
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "เพิ่มงานไม่สำเร็จ");
      return payload;
    })
    .then((r) => {
      alert("✅ เพิ่มงานเรียบร้อยแล้ว");

      // ✅ ดึงข้อความสรุปให้ก๊อปได้ทันที
      if (r.job_id) {
        fetch(`${API_BASE}/jobs/${r.job_id}/summary`)
          .then(x => x.json())
          .then(s => {
            if (s.text) document.getElementById("summary_text").value = s.text;
          })
          .catch(() => {});
      }
    })
    .catch((err) => {
      console.error(err);
      alert(`❌ ${err.message}`);
    });
}

// =======================================
// ⚙️ Admin: เพิ่มรายการ/ราคา
// =======================================
function createCatalogItem() {
  const payload = {
    item_name: new_item_name.value.trim(),
    item_category: new_item_category.value,
    base_price: Number(new_item_price.value || 0),
    unit_label: (new_item_unit.value || "รายการ").trim(),
  };

  if (!payload.item_name) return alert("กรอกชื่อรายการ");

  fetch(`${API_BASE}/catalog/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then(res => {
      if (!res.ok) throw new Error("เพิ่มรายการไม่สำเร็จ");
      return res.json();
    })
    .then(() => {
      alert("✅ เพิ่มรายการแล้ว");
      new_item_name.value = "";
      new_item_price.value = "";
      loadCatalogAndPromos();
    })
    .catch((err) => {
      console.error(err);
      alert("❌ เพิ่มรายการไม่สำเร็จ");
    });
}

// =======================================
// 🎁 Admin: เพิ่มโปร (percent ลดทั้งบิล)
// =======================================
function createPromotion() {
  const payload = {
    promo_name: new_promo_name.value.trim(),
    promo_type: "percent",
    promo_value: Number(new_promo_value.value || 0),
  };

  if (!payload.promo_name) return alert("กรอกชื่อโปร");
  if (!(payload.promo_value > 0)) return alert("ค่าโปรต้องมากกว่า 0");

  fetch(`${API_BASE}/promotions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then(res => {
      if (!res.ok) throw new Error("เพิ่มโปรไม่สำเร็จ");
      return res.json();
    })
    .then(() => {
      alert("✅ เพิ่มโปรแล้ว");
      new_promo_name.value = "";
      new_promo_value.value = "";
      loadCatalogAndPromos();
    })
    .catch((err) => {
      console.error(err);
      alert("❌ เพิ่มโปรไม่สำเร็จ");
    });
}

// =======================================
// 📋 Copy summary
// =======================================
function copySummary() {
  const ta = document.getElementById("summary_text");
  if (!ta || !ta.value.trim()) return alert("ยังไม่มีข้อความสรุป");

  ta.select();
  document.execCommand("copy");
  alert("✅ คัดลอกข้อความแล้ว");
}

// =======================================
// 📍 แยกพิกัดจากลิงก์ Google Maps
// รองรับรูปแบบที่พบบ่อย:
// 1) .../@13.7,100.6,17z
// 2) ...?q=13.7,100.6
// 3) ...?query=13.7,100.6
// =======================================
function ensureMapsStatusEl() {
  const input = document.getElementById("maps_link");
  if (!input) return null;
  let el = document.getElementById("maps_status");
  if (el) return el;
  el = document.createElement("div");
  el.id = "maps_status";
  el.style.marginTop = "6px";
  el.style.fontSize = "12px";
  el.style.opacity = "0.9";
  input.parentNode?.insertBefore(el, input.nextSibling);
  return el;
}

function setMapsStatus(msg, isError) {
  const el = ensureMapsStatusEl();
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = isError ? "#dc2626" : "#2563eb";
}

function extractLatLngFromText(text) {
  if (!text) return null;
  const s = String(text);
  // พิกัดตรงๆ 13.705,100.601 (มี/ไม่มีช่องว่าง)
  {
    const m = s.match(/(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
  }
  // @lat,lng
  {
    const m = s.match(/@\s*(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
  }
  // q=lat,lng | query=lat,lng | ll=lat,lng
  {
    const m = s.match(/[?&](?:q|query|ll)=\s*(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
  }
  // !3dlat!4dlng
  {
    const m = s.match(/!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
  }
  return null;
}

let __mapsDebounceTimer = null;
async function parseMapsLink(options = { silent: false }) {
  const link = (document.getElementById("maps_link")?.value || "").trim();
  if (!link) {
    setMapsStatus("", false);
    return;
  }

  const latEl = document.getElementById("gps_latitude");
  const lngEl = document.getElementById("gps_longitude");
  if (!latEl || !lngEl) return;

  // 1) ลองดึงจากข้อความ/URL ก่อน (เร็วสุด)
  const direct = extractLatLngFromText(link);
  if (direct && Number.isFinite(direct.lat) && Number.isFinite(direct.lng)) {
    latEl.value = String(direct.lat);
    lngEl.value = String(direct.lng);
    setMapsStatus("✅ แยกพิกัดแล้ว", false);
    if (!options.silent) alert("✅ แยกพิกัดสำเร็จ");
    return;
  }

  // 2) ถ้าเป็น maps.app.goo.gl หรือ google maps ให้ถาม backend resolve
  setMapsStatus("กำลังแปลงพิกัด...", false);
  try {
    const res = await fetch(`${API_BASE}/api/maps/resolve?url=${encodeURIComponent(link)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || "RESOLVE_FAILED");
    }
    if (Number.isFinite(data.lat) && Number.isFinite(data.lng)) {
      latEl.value = String(data.lat);
      lngEl.value = String(data.lng);
      setMapsStatus("✅ แยกพิกัดจากลิงก์แล้ว", false);
      if (!options.silent) alert("✅ แยกพิกัดสำเร็จ");
      return;
    }
    // ไม่พบพิกัด
    latEl.value = "";
    lngEl.value = "";
    setMapsStatus("❌ แปลงพิกัดไม่สำเร็จ (ลิงก์นี้ Google ไม่ส่งพิกัด) — วางพิกัดตรงๆ เช่น 13.705,100.601", true);
    if (!options.silent) alert("แยกพิกัดไม่สำเร็จ: ลิงก์นี้ไม่พบพิกัด\nลองวางพิกัดตรงๆ เช่น 13.705,100.601");
  } catch (e) {
    latEl.value = "";
    lngEl.value = "";
    setMapsStatus("❌ แปลงพิกัดไม่สำเร็จ — ลองวางพิกัดตรงๆ เช่น 13.705,100.601", true);
    if (!options.silent) alert("แยกพิกัดไม่สำเร็จ: ลองวางพิกัดตรงๆ เช่น 13.705,100.601");
  }
}

// Auto-parse: วางลิงก์แล้วแปลงทันที (ไม่ต้องกดปุ่ม)
function initMapsAutoParse() {
  const input = document.getElementById("maps_link");
  if (!input) return;
  const handler = () => {
    if (__mapsDebounceTimer) clearTimeout(__mapsDebounceTimer);
    __mapsDebounceTimer = setTimeout(() => parseMapsLink({ silent: true }), 250);
  };
  input.addEventListener("paste", handler);
  input.addEventListener("input", handler);
  input.addEventListener("change", handler);
  setMapsStatus("GPS Parser: gps-v4", false);
}



// =======================================
// 📥 งานจองจากลูกค้า (รอมอบหมายช่าง)
// - แสดงเฉพาะ job_source='customer' และยังไม่มี technician_team
// - แอดมินเลือกช่าง + เลือกโหมด offer/forced แล้วกดมอบหมาย
// =======================================
async function loadCustomerBookings() {
  const box = document.getElementById("customerBookings");
  if (!box) return;

  box.textContent = "กำลังโหลด...";

  try {
    const res = await fetch(`${API_BASE}/jobs`);
    const all = await res.json().catch(() => []);
    if (!res.ok) throw new Error(all?.error || "โหลดงานไม่สำเร็จ");

    const jobs = (Array.isArray(all) ? all : [])
      .filter(j => {
        const st = String(j.job_status || "").trim();
        const isReturned = st === "ตีกลับ";
        const isCustomer = j.job_source === "customer";
        const isOfferBackToAdmin = (String(j.dispatch_mode || "").trim() === "offer") && !j.technician_team && !j.technician_username;
        return !j.technician_team && (isCustomer || isReturned || isOfferBackToAdmin);
      });

    if (!jobs.length) {
      box.innerHTML = "<div class='muted'>ไม่มีงานจองที่รอมอบหมาย</div>";
      return;
    }

    // สร้าง option ช่าง (ใช้รายการที่โหลดไว้ ถ้าไม่มีให้ fallback)
    const techOpts = (technicians || []).map(t => `<option value="${t.username}">${t.username}</option>`).join("");

    box.innerHTML = jobs.map(j => {
      const b = j.booking_code || ("CWF" + String(j.job_id).padStart(7, "0"));
      const dt = j.appointment_datetime ? new Date(j.appointment_datetime).toLocaleString("th-TH") : "-";
      const st = String(j.job_status || "").trim();
      const badgeText = st === "ตีกลับ" ? "↩️ ตีกลับ" : (j.job_source === "customer" ? "🆕 จองใหม่" : "📝 รอมอบหมาย");

      return `
        <div class="job-card" style="border:1px solid rgba(37,99,235,0.22);">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
            <b>📌 Booking: ${b}</b>
            <span class=\"badge wait\">${badgeText}</span>
          </div>

          <p style="margin-top:10px;"><b>ลูกค้า:</b> ${j.customer_name || "-"}</p>
          <p><b>ประเภท:</b> ${j.job_type || "-"}</p>
          <p><b>นัด:</b> ${dt}</p>
          <p><b>ที่อยู่:</b> ${j.address_text || "-"}</p>

          <div class="grid2" style="margin-top:10px;">
            <select id="cb_tech_${j.job_id}">
              <option value="">-- เลือกช่าง --</option>
              ${techOpts}
            </select>

            <select id="cb_mode_${j.job_id}">
              <option value="forced">📌 Forced (งานล่วงหน้าบังคับ)</option>
              <option value="offer">📨 Offer (ช่างกดรับ)</option>
            </select>
          </div>

          <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;">
            <button type="button" style="width:auto;" onclick="assignCustomerBooking(${j.job_id})">✅ มอบหมายงาน</button>
            <button class="secondary" type="button" style="width:auto;" onclick="adminEditJob(${j.job_id})">✏️ แก้ไข</button>
            <button class="danger" type="button" style="width:auto;" onclick="adminCancelJob(${j.job_id})">⛔ ยกเลิก</button>
          </div>

          <div id="cb_msg_${j.job_id}" class="muted" style="margin-top:8px;"></div>
        </div>
      `;
    }).join("");

  } catch (e) {
    console.error(e);
    box.innerHTML = `<div class='muted'>❌ ${e.message}</div>`;
  }
}

async function assignCustomerBooking(jobId) {
  const tech = document.getElementById(`cb_tech_${jobId}`)?.value || "";
  const mode = document.getElementById(`cb_mode_${jobId}`)?.value || "forced";
  const msg = document.getElementById(`cb_msg_${jobId}`);

  if (!tech) {
    alert("เลือกช่างก่อน");
    return;
  }

  try {
    if (msg) msg.textContent = "กำลังมอบหมาย...";

    const res = await fetch(`${API_BASE}/jobs/${jobId}/assign`, {
      method: "PUT",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ technician_username: tech, mode }),
    });

    const data = await res.json().catch(()=> ({}));
    if (!res.ok) throw new Error(data.error || "มอบหมายไม่สำเร็จ");

    if (msg) msg.textContent = "✅ มอบหมายแล้ว";
    // รีเฟรชรายการ (งานจะหายไปจากลิสต์)
    loadCustomerBookings();
  } catch (e) {
    console.error(e);
    if (msg) msg.textContent = `❌ ${e.message}`;
    alert(`❌ ${e.message}`);
  }
}

// โหลดทันทีเมื่อเปิดหน้า

// =======================================
// 🛠️ ADMIN: แก้ไขใบงาน / ยกเลิกงาน
// =======================================
async function adminEditJob(jobId) {
  try {
    const res = await fetch(`${API_BASE}/jobs`);
    const all = await res.json().catch(() => []);
    const job = (Array.isArray(all) ? all : []).find(j => Number(j.job_id) === Number(jobId));
    if (!job) return alert("ไม่พบงาน");
    // ✅ ใช้ Modal (แก้ได้ทุกช่อง + มีปุ่มแยกพิกัดจาก URL)
    openEditModal(job);
  } catch (e) {
    alert(`❌ ${e.message}`);
  }
}

async function adminCancelJob(jobId) {
  const ok = confirm("ยืนยันยกเลิกงานนี้?");
  if (!ok) return;

  const reason = prompt("เหตุผลที่ยกเลิก (optional)", "admin_cancel") || "admin_cancel";

  try {
    const res = await fetch(`${API_BASE}/jobs/${jobId}/admin-cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "ยกเลิกไม่สำเร็จ");

    alert("⛔ ยกเลิกงานแล้ว");
    loadCustomerBookings();
    loadAllJobs();
  } catch (e) {
    alert(`❌ ${e.message}`);
  }
}

// =======================================
// 📚 งานทั้งหมด (Admin) + ใบเสร็จ/ใบเสนอราคา
// =======================================
async function loadAllJobs() {
  const box = document.getElementById("allJobs");
  const filter = document.getElementById("allJobsFilter")?.value || "running";
  if (!box) return;

  box.textContent = "กำลังโหลด...";

  try {
    const res = await fetch(`${API_BASE}/jobs`);
    const all = await res.json().catch(() => []);
    if (!res.ok) throw new Error(all?.error || "โหลดงานไม่สำเร็จ");

    const jobs = Array.isArray(all) ? all : [];

    const isLate = (j) => {
      if (!j.checkin_at || !j.appointment_datetime) return false;
      const ap = new Date(j.appointment_datetime).getTime();
      const ck = new Date(j.checkin_at).getTime();
      return ck > (ap + 15 * 60 * 1000); // เลท > 15 นาที
    };

    const filtered =
      filter === "running" ? jobs.filter(j => ["รอดำเนินการ", "กำลังทำ"].includes(j.job_status))
      : filter === "done" ? jobs.filter(j => j.job_status === "เสร็จแล้ว")
      : filter === "canceled" ? jobs.filter(j => j.job_status === "ยกเลิก")
      : filter === "late" ? jobs.filter(isLate)
      : jobs;

    renderAllJobs(filtered, filter, isLate);
  } catch (e) {
    console.error(e);
    box.innerHTML = `<div class='muted'>❌ ${e.message}</div>`;
  }
}

function renderAllJobs(list, filter, isLateFn) {
  const box = document.getElementById("allJobs");
  if (!box) return;

  if (!list.length) {
    box.innerHTML = "<div class='muted'>ไม่มีงานในหมวดนี้</div>";
    return;
  }

  box.innerHTML = list.map(j => {
    const b = j.booking_code || ("CWF" + String(j.job_id).padStart(7, "0"));
    const dt = j.appointment_datetime ? new Date(j.appointment_datetime).toLocaleString("th-TH") : "-";
    const st = j.job_status || "-";

    const badge =
      st === "รอดำเนินการ" ? "<span class='badge wait'>⏳ รอดำเนินการ</span>"
      : st === "กำลังทำ" ? "<span class='badge run'>🛠️ กำลังทำ</span>"
      : st === "เสร็จแล้ว" ? "<span class='badge ok'>✅ เสร็จแล้ว</span>"
      : "<span class='badge bad'>⛔ ยกเลิก</span>";

    const lateBadge = isLateFn(j) ? "<span class='badge bad' style='margin-left:6px;'>⏰ เลท</span>" : "";
    const sigBtn = j.final_signature_path ? `<button class="secondary" type="button" style="width:auto;" onclick="window.open('${j.final_signature_path}','_blank')">✍️ ลายเซ็นต์</button>` : "";

    return `
      <div class="job-card" style="border:1px solid rgba(15,23,42,0.10);">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <b>📌 Booking: ${b}</b>
            <div class="muted" style="font-size:12px;margin-top:2px;">งาน #${j.job_id} • ช่าง: ${j.technician_username || "-"}</div>
          </div>
          <div>${badge}${lateBadge}</div>
        </div>

        <p style="margin-top:10px;"><b>ลูกค้า:</b> ${j.customer_name || "-"}</p>
        <p><b>ประเภท:</b> ${j.job_type || "-"}</p>
        <p><b>นัด:</b> ${dt}</p>
        <p><b>ที่อยู่:</b> ${j.address_text || "-"}</p>
        ${j.maps_url ? `<p><b>Maps:</b> <a href="${j.maps_url}" target="_blank">${j.maps_url}</a></p>` : ""}

        <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;">
          <button class="secondary" type="button" style="width:auto;" onclick="adminEditJob(${j.job_id})">✏️ แก้ไข</button>
          <button class="secondary" type="button" style="width:auto;" onclick="window.open('/docs/quote/${j.job_id}','_blank')">📄 ใบเสนอราคา</button>
          <button class="secondary" type="button" style="width:auto;" onclick="window.open('/docs/receipt/${j.job_id}','_blank')">🧾 ใบเสร็จ</button>
          ${sigBtn}
        </div>

        ${j.job_status !== "ยกเลิก" ? "" : `<div class="muted" style="margin-top:8px;">เหตุผลยกเลิก: ${j.cancel_reason || "-"}</div>`}
      </div>
    `;
  }).join("");
}



window.addEventListener("load", () => {
  loadCustomerBookings();
  loadAllJobs();
  // 📍 Auto-parse maps link -> lat/lng
  initMapsAutoParse();
  const f = document.getElementById('allJobsFilter');
  if (f) f.addEventListener('change', loadAllJobs);
});



// ===============================
// 🎨 Theme Switcher (Tech/Admin only)
// - Adds 2 new themes (Modern / Premium) on top of existing Theme 2 (default)
// - Stores selection in localStorage: cwf_theme
// - Customer/Track pages are fixed Theme 2 (no toggle)
// ===============================
(function initCwfTheme(){
  try{
    const btn = document.getElementById('themeToggle');
    // If page doesn't have a toggle button, do nothing.
    if(!btn) return;

    const THEMES = ['theme-2', 'theme-yellow-modern', 'theme-yellow-premium']; // theme-2 = current default
    const KEY = 'cwf_theme';

    function applyTheme(name){
      document.body.classList.remove(...THEMES);
      document.body.classList.add(name);
      localStorage.setItem(KEY, name);
    }

    // default = theme-2
    const saved = localStorage.getItem(KEY);
    applyTheme(THEMES.includes(saved) ? saved : 'theme-2');

    btn.addEventListener('click', () => {
      const cur = localStorage.getItem(KEY) || 'theme-2';
      const idx = Math.max(0, THEMES.indexOf(cur));
      const next = THEMES[(idx + 1) % THEMES.length];
      applyTheme(next);
    });
  }catch(e){
    // keep app working even if theme fails
    console.warn('Theme init failed:', e);
  }
})();

