// admin-tech.js
// หน้านี้ใช้สำหรับ: อนุมัติคำขอแก้ไขโปรไฟล์ + จัดการข้อมูลช่าง (รหัส/ตำแหน่ง/รูป)
// ✅ ต่อเติม ไม่กระทบโค้ดเดิม (ปรับให้ robust: เช็ค res.ok + รองรับรูปแบบ JSON หลายแบบ)

const API = window.location.origin;


// ====== Restore auth from cookie (fallback) ======
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


// ====== Guard: ต้องเป็น admin ======
const role = localStorage.getItem("role");
if (role !== "admin") {
  alert("ต้องเป็นแอดมินเท่านั้น");
  location.href = "/login.html";
}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[m]));
}

const POS_LABEL = {
  junior: "Junior Tech",
  senior: "Senior Tech",
  lead: "Lead Tech",
  founder_ceo: "👑 FOUNDER & CEO"
};

// 🏅 Premium Rank Set (Lv.1-5)
const PREMIUM_RANK_SET = {
  1: { label: 'Apprentice', icon64: '/assets/ranks/rank_lv1_64.png' },
  2: { label: 'Technician', icon64: '/assets/ranks/rank_lv2_64.png' },
  3: { label: 'Senior Technician', icon64: '/assets/ranks/rank_lv3_64.png' },
  4: { label: 'Team Lead', icon64: '/assets/ranks/rank_lv4_64.png' },
  5: { label: 'Head Supervisor', icon64: '/assets/ranks/rank_lv5_64.png' },
};

function getPremiumRankInfo(level){
  const n = Number(level);
  if (Number.isFinite(n) && PREMIUM_RANK_SET[n]) return { level:n, ...PREMIUM_RANK_SET[n] };
  return { level:1, ...PREMIUM_RANK_SET[1] };
}

/* =========================================
   ✅ Helper: fetch JSON แบบทนทาน
   - เช็ค res.ok
   - ถ้า backend ส่ง {error:"..."} ให้เอามาโชว์
   - รองรับ return เป็น [] ตรงๆ หรือ {rows:[]} หรือ {data:[]}
========================================= */
/* =========================================
   ✅ Helper: fetch JSON แบบทนทาน
   - เช็ค res.ok
   - ถ้า backend ส่ง {error:"..."} ให้เอามาโชว์
   - แยกเป็น 2 แบบ:
     1) fetchJSONAny(): รับได้ทั้ง Object/Array (ใช้กับ approve/reject/save/upload)
     2) fetchJSONArray(): บังคับให้เป็น Array (ใช้กับ loadRequests/loadTechnicians)
========================================= */
async function fetchJSONAny(url, options = {}) {
  const res = await fetch(url, options);

  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error(`เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON (HTTP ${res.status})`);
  }

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) ? (data.error || data.message) : `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data; // ✅ ไม่บังคับรูปแบบ
}

async function fetchJSONArray(url, options = {}) {
  const data = await fetchJSONAny(url, options);

  // ✅ normalize: บางที backend/โค้ดเก่าอาจห่อมาเป็น {rows:[]} หรือ {data:[]}
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.rows)) return data.rows;
  if (data && Array.isArray(data.data)) return data.data;

  throw new Error("รูปแบบข้อมูลไม่ถูกต้อง");
}


/* =========================================
   ====== Load pending requests ======
   GET /admin/profile/requests
========================================= */
async function loadRequests() {
  const box = document.getElementById("reqList");
  if (!box) return;

  box.textContent = "กำลังโหลด...";
  try {
    const list = await fetchJSONArray(`${API}/admin/profile/requests`);

    if (list.length === 0) {
      box.innerHTML = "<div class='muted'>✅ ไม่มีคำขอค้าง</div>";
      return;
    }

    box.innerHTML = list.map((r) => {
      const img = r.photo_temp_path
        ? `<img src="${esc(r.photo_temp_path)}" style="width:56px;height:56px;border-radius:999px;object-fit:cover;border:2px solid rgba(37,99,235,0.25);">`
        : "";

      return `
        <div class="job-card">
          <div style="display:flex;gap:12px;align-items:center;justify-content:space-between;">
            <div style="display:flex;gap:12px;align-items:center;">
              ${img}
              <div>
                <div><b>${esc(r.username)}</b></div>
                <div class="muted">ชื่อที่ขอ: ${esc(r.full_name || "-")}</div>
                <div class="muted">เวลา: ${esc(r.requested_at || "-")}</div>
              </div>
            </div>
            <span class="badge wait">pending</span>
          </div>

          <hr>

          <div class="grid2">
            <div>
              <label>รหัสช่าง (ต้องมี)</label>
              <input id="req_code_${r.id}" placeholder="เช่น T001" value="${esc(r.technician_code || "")}">
            </div>
            <div>
              <label>ตำแหน่ง</label>
              <select id="req_pos_${r.id}">
                <option value="junior">Junior</option>
                <option value="senior">Senior</option>
                <option value="lead">Lead</option>
              </select>
            </div>
          </div>

          <div class="row" style="margin-top:10px;">
            <button type="button" onclick="approveReq(${r.id})">✅ อนุมัติ</button>
            <button class="danger" type="button" onclick="rejectReq(${r.id})">❌ ปฏิเสธ</button>
          </div>
        </div>
      `;
    }).join("");

    // set select defaults
    list.forEach((r) => {
      const sel = document.getElementById(`req_pos_${r.id}`);
      if (sel) sel.value = r.position || "junior";
    });

  } catch (e) {
    box.innerHTML = `<div style="color:#b91c1c;font-weight:800;">❌ โหลดคำขอไม่สำเร็จ: ${esc(e.message)}</div>`;
  }
}

async function approveReq(id) {
  const code = (document.getElementById(`req_code_${id}`)?.value || "").trim();
  const position = document.getElementById(`req_pos_${id}`)?.value || "junior";

  if (!code) {
    alert("ต้องใส่รหัสช่างก่อนอนุมัติ");
    return;
  }

  try {
    await fetchJSONAny(`${API}/admin/profile/requests/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ technician_code: code, position })
    });

    alert("✅ อนุมัติแล้ว");
    await loadRequests();
    await loadTechnicians();
  } catch (e) {
    alert("❌ " + e.message);
  }
}

async function rejectReq(id) {
  if (!confirm("ปฏิเสธคำขอนี้?")) return;

  try {
    await fetchJSONAny(`${API}/admin/profile/requests/${id}/reject`, {
      method: "POST"
    });

    alert("✅ ปฏิเสธแล้ว");
    await loadRequests();
  } catch (e) {
    alert("❌ " + e.message);
  }
}

/* =========================================
   ====== Technician management ======
   GET /admin/technicians
   PUT /admin/technicians/:username
   POST /admin/technicians/:username/photo
========================================= */
async function loadTechnicians() {
  const box = document.getElementById("techList");
  if (!box) return;

  box.textContent = "กำลังโหลด...";
  try {
    const list = await fetchJSONArray(`${API}/admin/technicians`);

    if (list.length === 0) {
      box.innerHTML = "<div class='muted'>ยังไม่มีช่างในระบบ</div>";
      return;
    }

    box.innerHTML = list.map((t) => {
      const imgSrc = t.photo_path ? t.photo_path : "/logo.png";
      const posLabel = t.position ? (POS_LABEL[t.position] || t.position) : "-";
      const st = String(t.accept_status || 'ready').toLowerCase();
      const stBadge = st === 'paused'
        ? `<span class="badge bad">🔴 หยุดรับงาน</span>`
        : `<span class="badge ok">🟢 พร้อมรับงาน</span>`;

      return `
        <div class="job-card">
          <div style="display:flex;gap:12px;align-items:center;">
            <img src="${esc(imgSrc)}" style="width:56px;height:56px;border-radius:999px;object-fit:cover;border:2px solid rgba(37,99,235,0.25);background:#fff;">
            <div style="flex:1;">
              <div><b>${esc(t.full_name || t.username)}</b> <span class="muted">(${esc(t.username)})</span></div>
              <div class="muted">รหัสช่าง: <b>${esc(t.technician_code || "-")}</b> · ตำแหน่ง: <b>${esc(posLabel)}</b></div>
              <div style="margin-top:6px;display:flex;align-items:center;gap:8px;">
                <img src="${esc(getPremiumRankInfo(t.rank_level).icon64)}" alt="rank" style="width:28px;height:28px;">
                <div class="muted"><b>Rank:</b> Lv.${esc(getPremiumRankInfo(t.rank_level).level)} ${esc(getPremiumRankInfo(t.rank_level).label)}</div>
              </div>
              <div class="muted">⭐ ${esc(t.rating ?? 0)} · ✅ งานสะสม ${esc(t.done_count ?? 0)} · เกรด ${esc(t.grade || "D")}</div>
              <div style="margin-top:6px;">${stBadge}</div>
            </div>
          </div>

          <hr>

          <label>ชื่อแสดงผล</label>
          <input id="tech_name_${esc(t.username)}" value="${esc(t.full_name || "")}">

          <div class="grid2" style="margin-top:10px;">
            <div>
              <label>รหัสช่าง</label>
              <input id="tech_code_${esc(t.username)}" value="${esc(t.technician_code || "")}" placeholder="เช่น T001">
            </div>
            <div>
              <label>ตำแหน่ง</label>
              <select id="tech_pos_${esc(t.username)}">
                <option value="junior">Junior</option>
                <option value="senior">Senior</option>
                <option value="lead">Lead</option>
              </select>
            </div>
            <div>
              <label>Premium Rank (Admin-only)</label>
              <select id="tech_rank_${esc(t.username)}">
                <option value="1">Lv.1 Apprentice</option>
                <option value="2">Lv.2 Technician</option>
                <option value="3">Lv.3 Senior Technician</option>
                <option value="4">Lv.4 Team Lead</option>
                <option value="5">Lv.5 Head Supervisor</option>
              </select>
              <div class="muted" style="margin-top:4px;">* กันที่ฝั่ง Server แล้ว (ยิง API โดยไม่ใช่ admin จะถูกปฏิเสธ)</div>
            </div>
          </div>

          <label style="margin-top:10px;">เบอร์โทรช่าง (แสดงให้ลูกค้าโทรใน Tracking)</label>
          <input id="tech_phone_${esc(t.username)}" value="${esc(t.phone || "")}" placeholder="เช่น 098-xxx-xxxx">

          <div class="grid2" style="margin-top:10px;">
            <div>
              <label>ตั้งรหัสผ่านใหม่ (แอดมิน)</label>
              <input id="tech_pwd_${esc(t.username)}" type="password" placeholder="เว้นว่าง = ไม่เปลี่ยน">
            </div>
            <div>
              <label>ยืนยันรหัสผ่านใหม่</label>
              <input id="tech_pwd2_${esc(t.username)}" type="password" placeholder="พิมพ์อีกครั้ง">
            </div>
          </div>

          <label style="margin-top:10px;">อัปโหลดรูปให้ช่าง (จากเครื่อง)</label>
          <input id="tech_file_${esc(t.username)}" type="file" accept="image/*">

          <div class="row" style="margin-top:10px;">
            <button type="button" onclick="saveTech('${esc(t.username)}')">💾 บันทึกโปรไฟล์</button>
            <button class="secondary" type="button" onclick="saveRank('${esc(t.username)}')">🏅 บันทึกแรงค์</button>
            <button class="secondary" type="button" onclick="uploadTechPhoto('${esc(t.username)}')">📷 อัปโหลดรูป</button>
          </div>
        </div>
      `;
    }).join("");

    // set select defaults
    list.forEach((t) => {
      const sel = document.getElementById(`tech_pos_${t.username}`);
      if (sel) sel.value = t.position || "junior";
      const selRank = document.getElementById(`tech_rank_${t.username}`);
      if (selRank) selRank.value = String(t.rank_level || 1);
    });

  } catch (e) {
    box.innerHTML = `<div style="color:#b91c1c;font-weight:800;">❌ โหลดช่างไม่สำเร็จ: ${esc(e.message)}</div>`;
  }
}

async function saveTech(username) {
  const full_name = (document.getElementById(`tech_name_${username}`)?.value || "").trim();
  const technician_code = (document.getElementById(`tech_code_${username}`)?.value || "").trim();
  const position = document.getElementById(`tech_pos_${username}`)?.value || "junior";
  const phone = (document.getElementById(`tech_phone_${username}`)?.value || "").trim();
  const new_password = (document.getElementById(`tech_pwd_${username}`)?.value || "");
  const confirm_password = (document.getElementById(`tech_pwd2_${username}`)?.value || "");

  if (!technician_code) {
    alert("ต้องใส่รหัสช่างก่อนบันทึก");
    return;
  }

  try {
    await fetchJSONAny(`${API}/admin/technicians/${encodeURIComponent(username)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name, technician_code, position, phone, new_password, confirm_password })
    });

    alert("✅ บันทึกแล้ว");
    await loadTechnicians();
  } catch (e) {
    alert("❌ " + e.message);
  }
}

async function saveRank(username) {
  const rank_level = Number(document.getElementById(`tech_rank_${username}`)?.value || 1);
  try {
    await fetchJSONAny(`${API}/admin/technicians/${encodeURIComponent(username)}/rank`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rank_level })
    });
    alert('✅ บันทึกแรงค์แล้ว');
    await loadTechnicians();
  } catch (e) {
    alert('❌ ' + e.message);
  }
}


async function uploadTechPhoto(username) {
  const input = document.getElementById(`tech_file_${username}`);
  const file = input?.files?.[0];

  if (!file) {
    alert("เลือกรูปก่อน");
    return;
  }

  const form = new FormData();
  form.append("photo", file);

  try {
    await fetchJSONAny(`${API}/admin/technicians/${encodeURIComponent(username)}/photo`, {
      method: "POST",
      body: form
    });

    alert("✅ อัปโหลดรูปแล้ว");
    await loadTechnicians();
  } catch (e) {
    alert("❌ " + e.message);
  }
}

// init
loadRequests();
loadTechnicians();
loadPricingRequests();


/* =========================================
   💸 PRICING REQUESTS (คำขอแก้รายการ/ราคา)
   GET /admin/pricing-requests
   POST /admin/pricing-requests/:id/approve
   POST /admin/pricing-requests/:id/decline
========================================= */
async function loadPricingRequests() {
  const box = document.getElementById("priceReqList");
  if (!box) return;

  box.textContent = "กำลังโหลด...";
  try {
    const list = await fetchJSONArray(`${API}/admin/pricing-requests`);
    if (!list.length) {
      box.innerHTML = "<div class='muted'>✅ ไม่มีคำขอแก้ราคา</div>";
      return;
    }

    box.innerHTML = list.map((r) => {
      const payload = r.payload_json || {};
      const items = Array.isArray(payload.items) ? payload.items : [];
      const pricing = payload.pricing || {};
      const total = Number(pricing.total || 0);
      const dt = r.appointment_datetime ? new Date(r.appointment_datetime).toLocaleString("th-TH") : "-";

      return `
        <div class="job-card">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
            <div>
              <div><b>📌 Booking: ${esc(r.booking_code || "-")}</b> <span class="muted">(งาน #${Number(r.job_id)})</span></div>
              <div class="muted">ลูกค้า: ${esc(r.customer_name || "-")} · ประเภท: ${esc(r.job_type || "-")}</div>
              <div class="muted">นัด: ${esc(dt)} · ขอโดย: <b>${esc(r.requested_by || "-")}</b></div>
            </div>
            <span class="badge wait">pending</span>
          </div>

          <hr>

          <div><b>🧾 รายการที่ขอปรับ</b></div>
          ${items.length ? `
            <ul style="margin:8px 0 0 18px;">
              ${items.map(it => `<li>${esc(it.item_name)} · qty ${Number(it.qty||0)} · ฿${Number(it.unit_price||0)}</li>`).join("")}
            </ul>
          ` : `<div class="muted" style="margin-top:6px;">(ไม่มีรายการ)</div>`}

          <div style="margin-top:8px;"><b>รวมใหม่:</b> ฿${total.toLocaleString("th-TH")}</div>

          <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;">
            <button type="button" onclick="approvePricingReq(${Number(r.request_id)})">✅ อนุมัติ</button>
            <button class="danger" type="button" onclick="declinePricingReq(${Number(r.request_id)})">⛔ ปฏิเสธ</button>
          </div>
        </div>
      `;
    }).join("");
  } catch (e) {
    box.innerHTML = `<div class='muted'>❌ ${esc(e.message)}</div>`;
  }
}

async function approvePricingReq(request_id) {
  const ok = confirm("อนุมัติคำขอแก้ราคา?");
  if (!ok) return;
  try {
    const decided_by = (localStorage.getItem("username") || "admin").toString();
    await fetchJSONAny(`${API}/admin/pricing-requests/${Number(request_id)}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decided_by }),
    });
    alert("✅ อนุมัติเรียบร้อย");
    loadPricingRequests();
  } catch (e) {
    alert("❌ " + e.message);
  }
}

async function declinePricingReq(request_id) {
  const ok = confirm("ปฏิเสธคำขอแก้ราคา?");
  if (!ok) return;
  try {
    const decided_by = (localStorage.getItem("username") || "admin").toString();
    await fetchJSONAny(`${API}/admin/pricing-requests/${Number(request_id)}/decline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decided_by }),
    });
    alert("✅ ปฏิเสธเรียบร้อย");
    loadPricingRequests();
  } catch (e) {
    alert("❌ " + e.message);
  }
}

window.loadPricingRequests = loadPricingRequests;
window.approvePricingReq = approvePricingReq;
window.declinePricingReq = declinePricingReq;


/* =========================================
   ➕ CREATE TECHNICIAN (สร้างไอดีช่าง)
========================================= */
async function createTechnician() {
  const u = document.getElementById("new_username")?.value?.trim();
  const p = document.getElementById("new_password")?.value?.trim();
  const full_name = document.getElementById("new_full_name")?.value?.trim();
  const technician_code = document.getElementById("new_technician_code")?.value?.trim();
  const position = document.getElementById("new_position")?.value || "junior";
  const box = document.getElementById("create_result");

  if (!u || !p) {
    if (box) box.textContent = "❌ ต้องกรอก username และ password";
    return;
  }

  try {
    const data = await fetchJSONAny(`${API}/admin/technicians/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, password: p, full_name, technician_code, position }),
    });

    if (box) box.textContent = `✅ สร้างสำเร็จ: ${data.username || u}`;

    // refresh technicians list (ถ้าอยู่แท็บข้อมูลช่าง)
    try { loadTechnicians(); } catch(e){}
  } catch (e) {
    if (box) box.textContent = `❌ ${e.message}`;
  }
}
window.createTechnician = createTechnician;
