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
  selected_slot_iso: "",
  available_slots: [],
};

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

function validateRequiredForPreview() {
  const p = getPayloadV2();
  if (!p.job_type) return false;
  if (!p.ac_type) return false;
  if (!p.btu) return false;
  if (!p.machine_count) return false;
  if (p.job_type === "ล้าง" && !p.wash_variant) return false;
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
    el("pv_total").textContent = "-";
    return;
  }
  try {
    const payload = getPayloadV2();
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
    el("pv_total").textContent = "-";
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
  el("pv_total").textContent = fmtMoney(total);
  el("pv_discount").textContent = fmtMoney(discount);
  el("pv_subtotal").textContent = fmtMoney(subtotal);
}

async function loadCatalog() {
  try {
    const items = await apiFetch("/catalog/items");
    state.catalog = Array.isArray(items) ? items : [];
    const sel = el("extra_item_id");
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
    const list = await apiFetch("/promotions");
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


async function loadTechnicians() {
  try {
    const techs = await apiFetch('/admin/technicians');
    const list = Array.isArray(techs) ? techs : [];
    const sel = el('technician_username');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '';
    const o0 = document.createElement('option');
    o0.value = '';
    o0.textContent = '(ไม่ระบุ) ให้ระบบเลือกช่างที่ว่าง';
    sel.appendChild(o0);

    for (const t of list) {
      const username = String(t.username || '').trim();
      if (!username) continue;
      const full = String(t.full_name || '').trim();
      const code = String(t.technician_code || '').trim();
      const emp = String(t.employment_type || 'company').trim();
      const label = `${full || username}${code ? ' • ' + code : ''} (${emp})`;
      const opt = document.createElement('option');
      opt.value = username;
      opt.textContent = label;
      sel.appendChild(opt);
    }
    sel.value = cur || '';
  } catch (e) {
    console.warn('loadTechnicians failed', e);
  }
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
  const itemId = Number(el("extra_item_id").value || 0);
  const qty = Math.max(1, Number(el("extra_qty").value || 1));
  if (!itemId) return;
  const found = state.catalog.find((x) => Number(x.item_id) === itemId);
  if (!found) return;
  const exist = state.selected_items.find((x) => Number(x.item_id) === itemId);
  if (exist) {
    exist.qty += qty;
  } else {
    state.selected_items.push({ item_id: itemId, qty, item_name: found.item_name, base_price: Number(found.base_price || 0) });
  }
  el("extra_item_id").value = "";
  el("extra_qty").value = "1";
  renderExtras();
}

function canLoadAvailability() {
  return validateRequiredForPreview() && state.duration_min > 0 && !!el("appt_date").value;
}

async function loadAvailability() {
  if (!canLoadAvailability()) {
    el("slots").innerHTML = `<div class="muted2">กรอกข้อมูลบริการให้ครบ + เลือกวันที่ก่อน</div>`;
    return;
  }
  const date = el("appt_date").value;
  const tech_type = (el("tech_type").value || "company").trim().toLowerCase();
  const duration_min = state.duration_min;
  try {
    const r = await apiFetch(`/public/availability_v2?date=${encodeURIComponent(date)}&tech_type=${encodeURIComponent(tech_type)}&duration_min=${encodeURIComponent(duration_min)}`);
    state.available_slots = Array.isArray(r.slots) ? r.slots : [];
    renderSlots();
  } catch (e) {
    el("slots").innerHTML = `<div class="muted2">โหลดคิวว่างไม่สำเร็จ: ${e.message}</div>`;
  }
}

function renderSlots() {
  const box = el("slots");
  box.innerHTML = "";
  const slots = state.available_slots.filter((s) => s && s.available);
  if (!slots.length) {
    box.innerHTML = `<div class="muted2">ไม่พบช่วงเวลาว่าง (ลองเปลี่ยนวัน/กลุ่มช่าง)</div>`;
    return;
  }
  const grid = document.createElement("div");
  grid.className = "slot-grid";
  for (const s of slots) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot-btn";
    btn.textContent = `${s.start} - ${s.end}`;
    const iso = `${el("appt_date").value}T${s.start}:00`;
    if (state.selected_slot_iso === iso) btn.classList.add("selected");
    btn.addEventListener("click", () => {
      state.selected_slot_iso = iso;
      document.querySelectorAll(".slot-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
    grid.appendChild(btn);
  }
  box.appendChild(grid);
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
    technician_username: (el("technician_username").value || "").trim(),
    dispatch_mode: (el("dispatch_mode").value || "forced").trim(),
    items: state.selected_items.map((x) => ({ item_id: x.item_id, qty: x.qty })),
    promotion_id: el("promotion_id").value || null,
    override_price: el("override_price").value || 0,
    override_duration_min: el("override_duration_min").value || 0,
  });

  try {
    el("btnSubmit").disabled = true;
    const r = await apiFetch("/admin/book_v2", { method: "POST", body: JSON.stringify(payload) });
    showToast(`บันทึกงานสำเร็จ: ${r.booking_code}`, "success");
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
    refreshPreviewDebounced();
    // attach listeners for dynamic selects
    setTimeout(() => {
      const w = document.getElementById("wash_variant");
      const r = document.getElementById("repair_variant");
      if (w) w.addEventListener("change", refreshPreviewDebounced);
      if (r) r.addEventListener("change", refreshPreviewDebounced);
    }, 0);
  });

  ["ac_type","btu","machine_count"].forEach((id) => el(id).addEventListener("change", refreshPreviewDebounced));
  el("machine_count").addEventListener("input", refreshPreviewDebounced);
  el("override_price").addEventListener("input", () => updateTotalPreview());
  el("override_duration_min").addEventListener("input", refreshPreviewDebounced);
  el("promotion_id").addEventListener("change", () => updateTotalPreview());
  el("extra_add").addEventListener("click", addExtra);
  el("appt_date").addEventListener("change", loadAvailability);
  el("tech_type").addEventListener("change", loadAvailability);
  el("btnLoadSlots").addEventListener("click", loadAvailability);
  el("btnSubmit").addEventListener("click", submitBooking);
}

async function init() {
  setBtuOptions();
  buildVariantUI();
  el("appt_date").value = todayYMD();
  await Promise.all([loadCatalog(), loadPromotions(), loadTechnicians()]);
  renderExtras();
  wireEvents();
  refreshPreviewDebounced();
}

document.addEventListener("DOMContentLoaded", init);
