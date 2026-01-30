// =======================================
// 🔧 CONFIG
// =======================================
// ใช้ origin เดียวกับเว็บที่เปิดอยู่ (เสถียรสุด ไม่ต้องแก้ IP)
const API_BASE = window.location.origin;

// =======================================
// 🧾 STATE: รายการของงาน (หลายรายการได้)
// =======================================
let jobItems = [];      // [{item_id, item_name, qty, unit_price}]
let catalogItems = [];
let promotions = [];
let technicians = [];

// =======================================
// 🧩 HELPERS
// =======================================

// ✅ parse Lat/Lng จาก Google Maps URL หลายรูปแบบ
function parseLatLngFromMapsUrl(url) {
  const u = String(url || "").trim();
  if (!u) return null;

  // 1) .../@lat,lng,zoom
  let m = u.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (m) return { lat: Number(m[1]), lng: Number(m[2]) };

  // 2) q=lat,lng หรือ query=lat,lng
  m = u.match(/[?&](?:q|query)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (m) return { lat: Number(m[1]), lng: Number(m[2]) };

  // 3) ll=lat,lng
  m = u.match(/[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (m) return { lat: Number(m[1]), lng: Number(m[2]) };

  // 4) !3dlat!4dlng (share link บางแบบ)
  m = u.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (m) return { lat: Number(m[1]), lng: Number(m[2]) };

  return null;
}

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

// =======================================
// 🧩 EDIT MODAL STATE
// =======================================
let currentEditJobId = null;

function openEditModal(job) {
  currentEditJobId = Number(job?.job_id);
  const backdrop = document.getElementById("editModalBackdrop");
  if (!backdrop) return alert("ไม่พบ UI แก้ไขใบงาน");

  const booking = job.booking_code || ("CWF" + String(job.job_id).padStart(7, "0"));
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

  backdrop.classList.add("show");
}

function closeEditModal() {
  const backdrop = document.getElementById("editModalBackdrop");
  if (backdrop) backdrop.classList.remove("show");
  currentEditJobId = null;
}

function parseMapsToLatLngInModal() {
  const url = document.getElementById("edit_maps_url")?.value || "";
  const out = parseLatLngFromMapsUrl(url);
  if (!out) {
    alert("❌ แยกพิกัดไม่สำเร็จ\nลองวางลิงก์แบบแชร์จาก Google Maps ใหม่");
    return;
  }
  document.getElementById("edit_gps_latitude").value = String(out.lat);
  document.getElementById("edit_gps_longitude").value = String(out.lng);
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
    appointment_datetime: document.getElementById("edit_appointment_datetime")?.value || "",
    address_text: document.getElementById("edit_address_text")?.value || "",
    maps_url: document.getElementById("edit_maps_url")?.value || "",
    job_zone: document.getElementById("edit_job_zone")?.value || "",
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

// expose ให้ปุ่มใน HTML ใช้ได้
window.closeEditModal = closeEditModal;
window.parseMapsToLatLngInModal = parseMapsToLatLngInModal;
window.saveEditModal = saveEditModal;

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
    appointment_datetime: appointment_datetime.value,
    address_text: address_text.value.trim(),

    // ✅ GPS หน้างาน (สำหรับเช็คอิน)
    gps_latitude: gps_latitude.value ? Number(gps_latitude.value) : null,
    gps_longitude: gps_longitude.value ? Number(gps_longitude.value) : null,

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

  // ถ้าใส่ GPS มา ต้องครบคู่
  if ((data.gps_latitude && !data.gps_longitude) || (!data.gps_latitude && data.gps_longitude)) {
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
function parseMapsLink() {
  const link = (document.getElementById("maps_link")?.value || "").trim();
  if (!link) return alert("วางลิงก์ Google Maps ก่อน");

  let lat = null;
  let lng = null;

  // รูปแบบ @lat,lng
  const atMatch = link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    lat = atMatch[1];
    lng = atMatch[2];
  }

  // รูปแบบ q=lat,lng หรือ query=lat,lng
  if (!lat || !lng) {
    const qMatch = link.match(/[?&](q|query)=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (qMatch) {
      lat = qMatch[2];
      lng = qMatch[3];
    }
  }

  if (!lat || !lng) {
    return alert("แยกพิกัดไม่สำเร็จ: ลิงก์ไม่อยู่ในรูปแบบที่รองรับ\nลองเปิด Maps แล้วกดแชร์ลิงก์ใหม่");
  }

  document.getElementById("gps_latitude").value = lat;
  document.getElementById("gps_longitude").value = lng;
  alert("✅ แยกพิกัดสำเร็จ");
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
      .filter(j => (j.job_source === "customer") && !j.technician_team);

    if (!jobs.length) {
      box.innerHTML = "<div class='muted'>ไม่มีงานจองที่รอมอบหมาย</div>";
      return;
    }

    // สร้าง option ช่าง (ใช้รายการที่โหลดไว้ ถ้าไม่มีให้ fallback)
    const techOpts = (technicians || []).map(t => `<option value="${t.username}">${t.username}</option>`).join("");

    box.innerHTML = jobs.map(j => {
      const b = j.booking_code || ("CWF" + String(j.job_id).padStart(7, "0"));
      const dt = j.appointment_datetime ? new Date(j.appointment_datetime).toLocaleString("th-TH") : "-";

      return `
        <div class="job-card" style="border:1px solid rgba(37,99,235,0.22);">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
            <b>📌 Booking: ${b}</b>
            <span class="badge wait">🆕 จองใหม่</span>
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

